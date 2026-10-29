/* Minimap: rund karta med terrängen i Config.terrain[typ].color, tydligt färgade byggnader och en pil i kanten
   som pekar mot huvudlagret (HQ) när det inte syns på skärmen.

   - Kartan är centrerad på det som spelaren ser just nu och visar det omgivande området. Den vita rutan är
     det som syns på skärmen.
   - Knappen vid kartans nedre vänstra kant växlar läge:
       Allt        hela terrängen
       Resurser    terrängen mörkas och alla resursnoder (träd, sten, malm ...) lyser upp i resursens färg
       Favoriter   som Resurser, men bara resurser du stjärnmarkerat i resursfönstret
     En terrängtyp är en resursnod när Config.terrain[typ].resourceAmount är 1-9999 (samma regel som infopanelen).
     Vilken resurs den ger kommer från byggnaderna som samlar från den (job.sourceTerrain -> job.outputResource).
   - Terrängen ritas i brickor (16x16 rutor) som byggs lite i taget, så att spelet inte hackar. Brickor
     uppdateras då och då så att t.ex. nedhuggna träd syns.
   - Scrolla över kartan för att zooma. Klick och scroll på kartan går inte igenom till spelkartan.
   - Anropas från Game.init: CityBuilder.Minimap.init() (efter UI.init).

   Inställningar (valfria): Config.settings.minimap = { size, pixelsPerTile, corner: 'top-right' | 'top-left',
   enabled: false för att stänga av } */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Renderer, Players, Vision } = CityBuilder;
  const t = (text, variables) => CityBuilder.t(text, variables);

  const DEFAULTS = { size: 176, pixelsPerTile: 3, corner: 'top-right' };
  const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
  const MODES = [
    { id: 'all', name: 'All', icon: '🗺️' },
    { id: 'resources', name: 'Resources', icon: '💎' },
    { id: 'favorites', name: 'Favorites', icon: '★' },
  ];
  // Reservfärger för fyndigheter utan fast färg (se FILTER_COLORS) när en byggnad ska placeras: olika för varje typ, så att de går att skilja åt.
  // Färgerna följer Okabe-Itos palett, som är vald för att gå att skilja åt även vid röd-grön- och blå-gul-färgblindhet, och skiljer sig också i ljushet.
  // Är det fler än sju typer får resten en mörk prick i mitten (ring), så att färgerna aldrig behöver upprepas utan att formen skiljer dem åt.
  const FILTER_STYLES = [
    { color: '#E69F00' }, { color: '#56B4E9' }, { color: '#F0E442' }, { color: '#CC79A7' }, { color: '#00C48C' }, { color: '#D55E00' }, { color: '#FFFFFF' },
    { color: '#4C8DFF', ring: true }, { color: '#E69F00', ring: true }, { color: '#F0E442', ring: true }, { color: '#CC79A7', ring: true }, { color: '#00C48C', ring: true }, { color: '#FFFFFF', ring: true },
  ];
  // Men de flesta typer har en fast färg som säger vad det är: äpplen röda, örter gröna, koppar orange, kristall grön, guld gult osv. Inom en grupp
  // (t.ex. alla malmer för en gruva) är färgerna olika nog att skilja åt; kol är grått med en mörk prick. Övriga typer får färg ur listan ovan.
  const FILTER_COLORS = {
    tree: '#2E9E4F', apple_tree: '#E53935', berry_bush: '#B04FD8', herbs: '#A6E22E', mushrooms: '#E8D2B0',
    rock: '#B8C0C8', clay: '#C76B3A', sand: '#EBD9A0', limestone: '#F4F4EC', water: '#3FA9F5',
    iron_ore: '#8FA8C8', copper_ore: '#E8772E', tin_ore: '#D3DCE4', coal: { color: '#7C7C88', ring: true }, silver_ore: '#FFFFFF', gold_ore: '#FFD21F',
    salt_ore: '#F6C9D0', sulfur: '#C6E21E', gemstone: '#D43CFF', crystal: '#19D98B', moonstone: '#9FB4FF', fallen_star: '#FFF3A0', ruins: '#B8A58C',
  };
  const SELECT_SAME = '#0f0', SELECT_OTHER = '#fa0', SELECT_RESOURCE = '#f00';   // vald byggnad: samma inriktning, annan inriktning, det den hämtar
  const LEGEND_MAX = 10;         // högst så många rader i teckenförklaringen
  const CHUNK = 16;              // rutor per bricka
  const BUILD_BUDGET_MS = 4;     // högst så här lång tid per bildruta åt att bygga brickor
  const REFRESH_MS = 3000;       // så ofta uppdateras en redan byggd bricka
  const DRAW_INTERVAL_MS = 30;   // kartan ritas om högst ~30 gånger per sekund
  const ZOOM_KEY = 'citybuilder.minimapZoom';
  const MODE_KEY = 'citybuilder.minimapMode';

  // Mobil = pekskärm eller smal skärm. På mobil är kartan mindre och knapparna större.
  const MOBILE_QUERY = '(pointer: coarse), (max-width: 520px)';
  const MOBILE_MAP_SCALE = 0.78;   // kartan är 22 % mindre på mobil
  const BUTTON_DESKTOP = 32;       // knappar vid kartan, i px
  const BUTTON_MOBILE = 44;
  const isMobile = () => !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);

  const settings = () => Object.assign({}, DEFAULTS, Config.settings && Config.settings.minimap);
  const currentLevel = () => CityBuilder.Levels?.current?.level ?? 0;
  const safe = fn => { try { return fn(); } catch (e) { return null; } };

  // Resursnod = terräng man kan samla från (samma regel som i ui.js, men utan oändliga typer som vatten)
  const isNode = terrain => !!terrain && terrain.resourceAmount > 0 && terrain.resourceAmount < 10000;

  // terrängtyp -> resurser som byggnader samlar från den
  let resourcesByTerrain = null;
  const getResourcesByTerrain = () => {
    if (resourcesByTerrain) return resourcesByTerrain;
    resourcesByTerrain = {};
    for (const definition of Object.values(Config.buildings)) {
      const job = definition.job;
      if (job && job.kind === 'gather' && job.sourceTerrain && job.outputResource) {
        (resourcesByTerrain[job.sourceTerrain] = resourcesByTerrain[job.sourceTerrain] || new Set()).add(job.outputResource);
      }
    }
    return resourcesByTerrain;
  };

  const Minimap = {
    canvas: null,
    modeButton: null,
    zoomInButton: null,
    zoomOutButton: null,
    context: null,
    chunks: new Map(),   // "cx,cy" -> { canvas, context, builtAt, usedAt, cx, cy, nodes }
    size: 0,
    dpr: 1,
    scale: 2,            // bildpunkter per ruta
    modeIndex: 0,
    lastPrune: 0,
    lastDraw: 0,
    started: false,

    init() {
      if (this.started) return;
      const config = settings();
      if (Config.settings && Config.settings.minimap && Config.settings.minimap.enabled === false) return;
      this.started = true;

      // Zoomen gäller bara banan den ställdes in på ("bana:zoom"): ny bana börjar alltid på standardzoomen
      const [storedLevel, storedZoom] = String(safe(() => localStorage.getItem(ZOOM_KEY))).split(':').map(Number);
      this.scale = storedLevel === currentLevel() && ZOOM_STEPS.includes(storedZoom) ? storedZoom : config.pixelsPerTile;
      const storedMode = MODES.findIndex(mode => mode.id === safe(() => localStorage.getItem(MODE_KEY)));
      this.modeIndex = storedMode >= 0 ? storedMode : 0;

      this.canvas = document.createElement('canvas');
      this.canvas.id = 'minimap';
      this.canvas.title = t('Minimap (scroll to zoom)');
      this.context = this.canvas.getContext('2d');
      this.background = new Image();
      this.background.src = CityBuilder.Config.settings.vision.image;

      this.modeButton = document.createElement('button');
      this.modeButton.type = 'button';
      this.modeButton.id = 'minimapMode';
      this.modeButton.onclick = () => this.cycleMode();
      this.updateModeButton();

      // Zoomknappar (för pekskärm, där mushjulet saknas)
      const makeZoomButton = (id, text, label, direction) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = 'minimap-zoom';
        button.textContent = text;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.onclick = () => this.zoomStep(direction);
        return button;
      };
      this.zoomInButton = makeZoomButton('minimapZoomIn', '+', t('Zoom in the minimap'), 1);
      this.zoomOutButton = makeZoomButton('minimapZoomOut', '−', t('Zoom out the minimap'), -1);

      this.legend = [];
      this.legendBox = document.createElement('div');
      this.legendBox.id = 'minimapLegend';
      this.legendBox.hidden = true;

      this.injectStyles();
      document.body.appendChild(this.canvas);
      document.body.appendChild(this.legendBox);
      document.body.appendChild(this.modeButton);
      document.body.appendChild(this.zoomInButton);
      document.body.appendChild(this.zoomOutButton);
      this.updateZoomButtons();

      // Klick, tryck och scroll på kartan ska inte gå vidare till spelkartan (bygga, panorera, zooma)
      for (const element of [this.canvas, this.modeButton, this.zoomInButton, this.zoomOutButton]) {
        for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick']) {
          element.addEventListener(type, event => event.stopPropagation());
        }
      }
      this.canvas.addEventListener('wheel', event => {
        event.preventDefault();
        event.stopPropagation();
        this.zoomStep(event.deltaY < 0 ? 1 : -1);
      }, { passive: false });

      CityBuilder.I18n.onChange(() => this.applyLanguage());

      this.layout();
      addEventListener('resize', () => this.layout());
      // Växla storlekar när skärmen blir/slutar vara "mobil" (t.ex. vid rotation)
      if (window.matchMedia) {
        const query = window.matchMedia(MOBILE_QUERY);
        const onChange = () => this.layout();
        if (query.addEventListener) query.addEventListener('change', onChange); else if (query.addListener) query.addListener(onChange);
      }
      requestAnimationFrame(() => this.frame());
    },

    applyLanguage() {
      this.canvas.title = t('Minimap (scroll to zoom)');
      for (const [button, text] of [[this.zoomInButton, 'Zoom in the minimap'], [this.zoomOutButton, 'Zoom out the minimap']]) {
        button.title = t(text);
        button.setAttribute('aria-label', button.title);
      }
      this.updateModeButton();
      this.lastDraw = 0;
    },

    get mode() { return MODES[this.modeIndex]; },

    cycleMode() {
      this.modeIndex = (this.modeIndex + 1) % MODES.length;
      safe(() => localStorage.setItem(MODE_KEY, this.mode.id));
      this.updateModeButton();
      if (CityBuilder.UI && CityBuilder.UI.showToast) CityBuilder.UI.showToast(t('Minimap: {mode}', { mode: t(this.mode.name) }));
      this.lastDraw = 0; // rita om direkt
    },

    updateModeButton() {
      this.modeButton.textContent = this.mode.icon;
      this.modeButton.title = t('Map mode: {mode} (click to change)', { mode: t(this.mode.name) });
      this.modeButton.setAttribute('aria-label', this.modeButton.title);
    },

    // direction: 1 = zooma in (fler bildpunkter per ruta), -1 = zooma ut
    zoomStep(direction) {
      let index = ZOOM_STEPS.indexOf(this.scale);
      if (index < 0) index = ZOOM_STEPS.findIndex(step => step >= this.scale) >= 0 ? ZOOM_STEPS.findIndex(step => step >= this.scale) : ZOOM_STEPS.length - 1;
      const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + direction))];
      if (next !== this.scale) {
        this.scale = next;
        safe(() => localStorage.setItem(ZOOM_KEY, currentLevel() + ':' + next));
        this.lastDraw = 0; // rita om direkt
      }
      this.updateZoomButtons();
    },

    updateZoomButtons() {
      this.zoomInButton.disabled = this.scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
      this.zoomOutButton.disabled = this.scale <= ZOOM_STEPS[0];
    },

    injectStyles() {
      if (document.getElementById('minimapStyles')) return;
      const style = document.createElement('style');
      style.id = 'minimapStyles';
      style.textContent = `
        #minimap {
          position: fixed;
          z-index: 20;
          border-radius: 50%;
          border: 3px solid #2d3943;
          background: #0d1115;
          box-shadow: 0 2px 10px rgb(0 0 0 / 55%);
          touch-action: none;
        }

        #minimapMode, .minimap-zoom {
          position: fixed;
          z-index: 21;
          width: 32px;      /* storlek och teckenstorlek sätts av layout() (större på mobil) */
          height: 32px;
          padding: 0;
          border-radius: 50%;
          font-size: 16px;
          line-height: 1;
          box-shadow: 0 2px 6px rgb(0 0 0 / 55%);
          touch-action: manipulation;
        }

        .minimap-zoom {
          font-weight: 700;
        }

        #minimapLegend {
          position: fixed;
          z-index: 20;
          box-sizing: border-box;
          display: flex;
          flex-wrap: wrap;
          gap: 2px 10px;
          padding: 4px 7px;
          border: 1px solid #2d3943;
          border-radius: 6px;
          background: rgb(13 17 21 / 85%);
          font-size: 11px;
          line-height: 1.25;
          color: #d8dde2;
          pointer-events: none;
        }
        #minimapLegend[hidden] { display: none; }
        #minimapLegend span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
        #minimapLegend i { width: 9px; height: 9px; border-radius: 2px; border: 1px solid rgb(255 255 255 / 70%); box-sizing: border-box; }

        .minimap-zoom:disabled {
          opacity: .4;
        }
      `;
      document.head.appendChild(style);
    },

    // Teckenförklaringen under kartan: färg och namn för det som lyser upp (tom och dold när inget gör det)
    updateLegend() {
      const html = this.legend.map(({ color, ring, label }) => `<span><i style="background:${ring ? `radial-gradient(circle, rgb(0 0 0 / 80%) 0 22%, ${color} 26%)` : color}"></i>${label}</span>`).join('');
      if (this.legendHtml === html) return;
      this.legendHtml = html;
      this.legendBox.innerHTML = html;
      this.legendBox.hidden = !html;
    },

    // Storlek och plats (under övre fältet, i det valda hörnet)
    layout() {
      const config = settings();
      const mobile = isMobile();
      const baseSize = config.size * (mobile ? MOBILE_MAP_SCALE : 1);
      this.size = Math.max(90, Math.min(Math.round(baseSize), Math.floor(innerWidth * 0.4)));
      this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      this.canvas.width = this.canvas.height = Math.round(this.size * this.dpr);
      this.canvas.style.width = this.canvas.style.height = this.size + 'px';

      const top = document.getElementById('top');
      const topEdge = (top ? top.getBoundingClientRect().bottom : 0) + 8;
      const left = config.corner === 'top-left';
      this.canvas.style.top = topEdge + 'px';
      this.canvas.style.left = left ? '8px' : 'auto';
      this.canvas.style.right = left ? 'auto' : '8px';

      // Knapparna: 32 px på dator, 44 px (passande för tummar) på mobil
      const button = mobile ? BUTTON_MOBILE : BUTTON_DESKTOP;
      const outer = this.canvas.offsetWidth || this.size; // kartans verkliga yttermått (inkl. kant)
      for (const element of [this.modeButton, this.zoomInButton, this.zoomOutButton]) {
        element.style.width = element.style.height = button + 'px';
        element.style.fontSize = (mobile ? 22 : 16) + 'px';
      }

      // Lägesknappen sitter vid kartans nedre vänstra kant
      this.modeButton.style.top = (topEdge + outer + 4 - button) + 'px';
      this.modeButton.style.left = left ? '4px' : 'auto';
      this.modeButton.style.right = left ? 'auto' : (8 + outer + 4 - button) + 'px';

      // Zoomknapparna ligger i en kolumn bredvid kartan (på den inre sidan), överst
      const beside = (8 + outer + 6) + 'px';
      this.zoomInButton.style.top = topEdge + 'px';
      this.zoomOutButton.style.top = (topEdge + button + 4) + 'px';
      for (const element of [this.zoomInButton, this.zoomOutButton]) {
        element.style.left = left ? beside : 'auto';
        element.style.right = left ? 'auto' : beside;
      }
      this.legendBox.style.top = (topEdge + outer + 6) + 'px';
      this.legendBox.style.left = left ? '8px' : 'auto';
      this.legendBox.style.right = left ? 'auto' : '8px';
      this.legendBox.style.width = outer + 'px';
      this.lastDraw = 0;
      CityBuilder.UI?.layoutGoals?.();   // målrutan viker för kartan och knapparna
    },

    // ---- Terrängbrickor ----

    chunkAt(cx, cy) {
      const key = cx + ',' + cy;
      let chunk = this.chunks.get(key);
      if (!chunk) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = CHUNK;
        chunk = { canvas, context: canvas.getContext('2d'), builtAt: 0, usedAt: 0, cx, cy, nodes: [] };
        this.chunks.set(key, chunk);
      }
      return chunk;
    },

    // Målar brickans terräng och samlar dess resursnoder (för lägena Resurser och Favoriter)
    buildChunk(chunk, now) {
      const context = chunk.context;
      const nodes = [];
      let lastColor = null;
      for (let ty = 0; ty < CHUNK; ty++) {
        for (let tx = 0; tx < CHUNK; tx++) {
          const x = chunk.cx * CHUNK + tx, y = chunk.cy * CHUNK + ty;
          const tile = World.getTile(x, y);
          const terrain = tile && Config.terrain[tile.terrainType];
          const color = (terrain && terrain.color) || '#000';
          if (color !== lastColor) { context.fillStyle = color; lastColor = color; }
          context.fillRect(tx, ty, 1, 1);
          if (isNode(terrain)) nodes.push({ x, y, type: tile.terrainType });
        }
      }
      chunk.nodes = nodes;
      chunk.builtAt = now;
    },

    prune(now) {
      if (now - this.lastPrune < 10000) return;
      this.lastPrune = now;
      for (const [key, chunk] of this.chunks) if (now - chunk.usedAt > 30000) this.chunks.delete(key);
    },

    // Färg för en nod i det aktuella läget, eller null om den inte ska visas
    nodeColor(type, mode, favorites, cache) {
      if (cache.has(type)) return cache.get(type);
      const resourceIds = getResourcesByTerrain()[type];
      let resourceId = null;
      if (mode === 'favorites') {
        if (resourceIds) for (const id of resourceIds) if (favorites.has(id)) { resourceId = id; break; }
        if (!resourceId) { cache.set(type, null); return null; }
      } else if (mode === 'filter' && !this.filter.has(type)) {
        cache.set(type, null); return null;
      } else if (mode === 'select') {
        const color = this.selection && this.selection.terrains.has(type) ? SELECT_RESOURCE : null;
        if (color) this.labels.set(type, CityBuilder.UI ? CityBuilder.UI.terrainName(type) : type);
        cache.set(type, color); return color;
      } else if (resourceIds) {
        resourceId = resourceIds.values().next().value;
      }
      const resource = resourceId && Config.resources[resourceId];
      const terrain = Config.terrain[type];
      const UI = CityBuilder.UI;
      let color = (resource && resource.color) || (terrain && terrain.color) || '#fff', label = resourceId && UI ? UI.resourceName(resourceId) : UI ? UI.terrainName(type) : type;
      if (mode === 'filter') {
        const fixed = FILTER_COLORS[type];
        const style = fixed ? (typeof fixed === 'string' ? { color: fixed } : fixed) : FILTER_STYLES[[...this.filter].indexOf(type) % FILTER_STYLES.length];
        color = style.color; label = UI ? UI.terrainName(type) : type;
        if (style.ring) this.rings.add(type);
      }
      this.labels.set(type, label);
      cache.set(type, color);
      return color;
    },

    // Vald gather-byggnad (placingType) -> mängd av terrängtyper den samlar från, annars null. Bara typer som syns som noder.
    placingFilter() {
      const id = CityBuilder.Game && CityBuilder.Game.placingType;
      if (id !== this.filterId) {
        this.filterId = id;
        const definition = id && Config.buildings[id];
        const jobs = !definition ? [] : definition.variants ? [].concat(Array.isArray(definition.variants) ? definition.variants : Object.values(definition.variants)).map(variant => Config.buildings[variant].job) : [definition.job];   // byggnad med inriktning: alla inriktningars råvaror
        const types = jobs.filter(job => job && job.kind === 'gather' && job.sourceTerrain).flatMap(job => [].concat(job.sourceTerrain)).filter(type => isNode(Config.terrain[type]));
        this.filter = types.length ? new Set(types) : null;
      }
      return this.filter;
    },

    // Vald egen byggnad -> hur den visas på kartan: bara byggnader av samma slag (grön = samma inriktning, orange = annan inriktning av samma
    // byggnad) och, för en samlare eller gruva, de fyndigheter den hämtar från (röda). Annars null.
    selectionInfo() {
      const selected = CityBuilder.Game && CityBuilder.Game.selectedBuilding;
      if (!selected || selected.removed || selected.player !== Players.HUMAN) return null;
      const definition = selected.definition, job = definition.job;
      const terrains = job && job.kind === 'gather' && job.sourceTerrain ? [].concat(job.sourceTerrain).filter(type => isNode(Config.terrain[type])) : [];
      return { selected, group: definition.group || null, terrains: new Set(terrains) };
    },

    // ---- Ritning ----

    frame() {
      requestAnimationFrame(() => this.frame());
      if (document.hidden || !World.headquarters) return;
      const now = performance.now();
      if (now - this.lastDraw < (CityBuilder.Options ? CityBuilder.Options.gfx.minimapMs : DRAW_INTERVAL_MS)) return;
      this.lastDraw = now;
      this.draw(now);
    },

    draw(now) {
      const size = this.size, scale = this.scale, radius = size / 2, context = this.context;
      this.filter = this.placingFilter();
      this.legend = [];
      const selection = this.filter ? null : this.selectionInfo();
      this.selection = selection;
      // Byggnad som ska placeras går först, sedan vald byggnad, sedan vanligt läge
      const mode = this.filter ? 'filter' : selection ? 'select' : this.mode.id;
      const overlay = mode === 'filter' || mode === 'select';   // mörk karta med bara det som valts upplyst
      const range = Renderer.visibleTileRange();
      const centerX = Math.round((range.minX + range.maxX + 1) / 2);
      const centerY = Math.round((range.minY + range.maxY + 1) / 2);
      const toX = tileX => radius + (tileX - centerX) * scale;
      const toY = tileY => radius + (tileY - centerY) * scale;

      // Brickor som ligger inom kartan, närmast mitten först
      const reach = radius / scale + CHUNK;
      const minCX = Math.floor((centerX - reach) / CHUNK), maxCX = Math.floor((centerX + reach) / CHUNK);
      const minCY = Math.floor((centerY - reach) / CHUNK), maxCY = Math.floor((centerY + reach) / CHUNK);
      // Fog of war: brickor utan en enda synlig cell byggs och ritas inte, och i filterläget (vald gather-byggnad) ritas bara fyndigheter som syns
      const visible = [];
      for (let cy = minCY; cy <= maxCY; cy++) {
        for (let cx = minCX; cx <= maxCX; cx++) {
          const chunk = this.chunkAt(cx, cy);
          chunk.usedAt = now;
          chunk.lit = Vision.anyVisible(Players.HUMAN, cx * CHUNK, cy * CHUNK, cx * CHUNK + CHUNK - 1, cy * CHUNK + CHUNK - 1);
          if (chunk.lit) visible.push(chunk);
        }
      }
      const distance = chunk => Math.hypot(chunk.cx * CHUNK + 8 - centerX, chunk.cy * CHUNK + 8 - centerY);
      visible.sort((a, b) => distance(a) - distance(b));

      // Bygg obyggda brickor först, sedan gamla, inom tidsbudgeten (minst en per bildruta om det behövs)
      const started = performance.now();
      let built = 0;
      for (const chunk of visible) {
        if (chunk.builtAt) continue;
        if (built > 0 && performance.now() - started > BUILD_BUDGET_MS) break;
        this.buildChunk(chunk, now); built++;
      }
      if (built === 0) {
        for (const chunk of visible) {
          if (now - chunk.builtAt < REFRESH_MS) continue;
          if (performance.now() - started > BUILD_BUDGET_MS) break;
          this.buildChunk(chunk, now);
        }
      }
      this.prune(now);

      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      context.clearRect(0, 0, size, size);
      context.imageSmoothingEnabled = false;
      for (const chunk of visible) {
        if (!chunk.builtAt || !chunk.lit) continue;
        const x0 = Math.round(toX(chunk.cx * CHUNK)), x1 = Math.round(toX((chunk.cx + 1) * CHUNK));
        const y0 = Math.round(toY(chunk.cy * CHUNK)), y1 = Math.round(toY((chunk.cy + 1) * CHUNK));
        context.drawImage(chunk.canvas, x0, y0, x1 - x0, y1 - y0);
      }

      // Lägena Resurser och Favoriter: mörka terrängen och lys upp noderna
      const drawNodes = () => {
        const favorites = (CityBuilder.UI && CityBuilder.UI.resourceFavorites) || new Set();
        const cache = new Map(), counts = new Map();
        this.labels = new Map(); this.rings = new Set();
        // Varje nod fyller exakt sin egen ruta (samma kantlinjer som terrängen under)
        const limit = (radius + 2 * scale + 2) * (radius + 2 * scale + 2);
        let shown = 0;
        const grow = mode === 'favorites' || overlay ? 1 : 0;
        const halo = 0;   // ingen kant runt de upplysta resurserna: den gjorde dem svårare att se
        for (let pass = halo ? 0 : 1, lastColor = null; pass < 2; pass++) {
          const spread = grow + (pass === 0 ? halo : 0);
          if (pass === 0) { context.globalAlpha = .55; context.fillStyle = '#fff'; }
          else { context.globalAlpha = 1; lastColor = null; }
          for (const chunk of visible) {
            for (const node of chunk.nodes) {
              if (overlay && !Vision.visible(Players.HUMAN, node.x + .5, node.y + .5)) continue;   // inget i dimman
              const color = this.nodeColor(node.type, mode, favorites, cache);
              if (!color) continue;
              const left = Math.round(toX(node.x)), top = Math.round(toY(node.y));
              const right = Math.max(left + 1, Math.round(toX(node.x + 1))), bottom = Math.max(top + 1, Math.round(toY(node.y + 1)));
              const dx = (left + right) / 2 - radius, dy = (top + bottom) / 2 - radius;
              if (dx * dx + dy * dy > limit) continue;
              if (pass && color !== lastColor) { context.fillStyle = color; lastColor = color; }
              context.fillRect(left - spread, top - spread, right - left + spread * 2, bottom - top + spread * 2);
              if (pass && this.rings.has(node.type)) {   // mörk prick i mitten
                const dot = Math.max(1, Math.round((right - left + spread * 2) / 3));
                context.fillStyle = 'rgba(0,0,0,.8)'; context.fillRect(Math.round((left + right - dot) / 2), Math.round((top + bottom - dot) / 2), dot, dot); lastColor = null;
              }
              if (pass) { shown++; counts.set(node.type, (counts.get(node.type) || 0) + 1); }
            }
          }
        }

        // Teckenförklaring: färg och namn för det som lyser upp, vanligast först
        const entries = new Map();   // typer med samma namn (två slags sand) blir en rad
        for (const [type] of [...counts].sort((a, b) => b[1] - a[1])) if (!entries.has(this.labels.get(type))) entries.set(this.labels.get(type), { color: cache.get(type), ring: this.rings.has(type) });
        this.legend = [...entries].slice(0, LEGEND_MAX).map(([label, { color, ring }]) => ({ color, ring, label }));

        if (mode === 'favorites' && favorites.size === 0) {
          context.fillStyle = '#e8e8e8';
          context.font = '12px system-ui, sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(t('No favorites'), radius, radius - 8);
          context.fillText(t('Mark with ★'), radius, radius + 8);
        } else if ((mode === 'favorites' || mode === 'filter') && shown === 0) {
          context.fillStyle = '#e8e8e8';
          context.font = '12px system-ui, sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(t('None nearby'), radius, radius);
        }
      };
      if (mode !== 'all') {
        context.fillStyle = 'rgb(6 9 12 / 80%)';
        context.fillRect(0, 0, size, size);
        if (!overlay) drawNodes();
      }

      // Dimman: sudda ut det spelaren inte ser (mjuka kanter), lägg bakgrunden bakom, och lägg sedan fyndigheterna i filterläget ovanpå
      const cell = Vision.cellSize(), reachTiles = radius / scale;
      const minCell = { x: Math.floor((centerX - reachTiles) / cell) - 1, y: Math.floor((centerY - reachTiles) / cell) - 1 };
      const cells = Math.ceil(2 * reachTiles / cell) + 3;
      this.fogMask = this.fogMask || document.createElement('canvas');
      if (Vision.mask(Players.HUMAN, this.fogMask, minCell.x, minCell.y, cells, cells)) {
        context.globalCompositeOperation = 'destination-out';
        context.imageSmoothingEnabled = true;
        context.drawImage(this.fogMask, toX(minCell.x * cell), toY(minCell.y * cell), cells * cell * scale, cells * cell * scale);
        context.imageSmoothingEnabled = false;
      }
      context.globalCompositeOperation = 'destination-over';
      if (this.background && this.background.complete && this.background.naturalWidth) context.drawImage(this.background, 0, 0, size, size);
      else { context.fillStyle = '#0d1115'; context.fillRect(0, 0, size, size); }
      context.globalCompositeOperation = 'source-over';
      if (overlay) drawNodes();

      // Byggnader: tydlig färg med mörk kant (ofärdiga är genomskinliga). Vald byggnad: bara egna av samma slag, grön om det är samma inriktning
      // (samma typ) och orange om det är en annan inriktning av samma byggnad (samma group)
      const matchOf = building => {
        if (building.player !== Players.HUMAN) return null;
        if (building.type === selection.selected.type) return SELECT_SAME;
        return selection.group && building.definition.group === selection.group ? SELECT_OTHER : null;
      };
      const marker = Math.max(4, Math.round(scale * 2));
      const rivalColor = '#e5534b';  // andra spelares byggnader och soldater: röda
      for (const building of World.buildings) {
        if (building === World.headquarters || building.definition.pile || (building.player !== Players.HUMAN && !Vision.sees(Players.HUMAN, building))) continue;
        const match = selection && matchOf(building);
        if (selection && !match) continue;   // vald byggnad: bara samma slag visas
        const x = toX(building.x + 0.5), y = toY(building.y + 0.5);
        if (Math.hypot(x - radius, y - radius) > radius + marker) continue;
        context.globalAlpha = building.buildProgress >= 1 ? 1 : 0.55;
        context.fillStyle = '#05080a';
        context.fillRect(Math.round(x - marker / 2) - 1, Math.round(y - marker / 2) - 1, marker + 2, marker + 2);
        context.fillStyle = match || (building.player !== Players.HUMAN ? rivalColor : (building.definition && building.definition.color) || '#e8e8e8');
        context.fillRect(Math.round(x - marker / 2), Math.round(y - marker / 2), marker, marker);
      }
      context.globalAlpha = 1;

      // Markeringar runt spelarens byggnader: problem (samlare utan resurser = röd ring med utropstecken, ineffektiva = orange eller röd ring)
      // och, när en byggnad är vald, alla byggnader av samma typ (vit ring, den valda i guld)
      const selected = CityBuilder.Game && CityBuilder.Game.selectedBuilding, pulse = CityBuilder.Options?.gfx.pulse === false ? 1 : (Math.sin(now / 250) + 1) / 2;
      const Behaviors = CityBuilder.Behaviors;
      for (const building of World.buildings) {
        if (building === World.headquarters || building.buildProgress < 1 || building.definition.pile) continue;
        const own = building.player === Players.HUMAN;
        if (!own && !Vision.sees(Players.HUMAN, building)) continue;
        const x = toX(building.x + 0.5), y = toY(building.y + 0.5);
        if (Math.hypot(x - radius, y - radius) > radius + marker) continue;
        if (selection && !matchOf(building)) continue;
        const same = selected && !selected.removed && building.type === selected.type && building.player === selected.player;
        const problem = own ? Behaviors.problemOf(building) : null;
        if (same && (!selection || building === selected)) {
          context.strokeStyle = building === selected ? '#ffd23f' : '#fff';
          context.lineWidth = 1;
          context.globalAlpha = .75 + .25 * pulse;
          context.beginPath();
          context.arc(x, y, marker * .95 + 2, 0, Math.PI * 2);
          context.stroke();
        }
        if (problem) {
          const noResources = problem === 'noResources';
          context.strokeStyle = noResources || problem === 'bad' ? '#ff3b30' : '#ffb020';
          context.lineWidth = 1;   // ringarna är aldrig tjockare än en pixel
          context.globalAlpha = noResources ? .6 + .4 * pulse : 1;
          context.beginPath();
          context.arc(x, y, marker * .95 + (same ? 5 : 2), 0, Math.PI * 2);
          context.stroke();
          if (noResources) {
            context.globalAlpha = 1;
            context.fillStyle = '#fff';
            context.font = `bold ${Math.max(9, marker + 3)}px system-ui, sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.strokeStyle = '#05080a';
            context.lineWidth = 3;
            context.strokeText('!', x, y + 0.5);
            context.fillText('!', x, y + 0.5);
          }
        }
      }
      context.globalAlpha = 1;

      // Soldater: små cirklar (röda för andra spelare, blå för dina egna)
      const dot = Math.max(2, Math.round(scale * 1.2));
      for (const unit of World.units) {
        if (selection || !unit.definition.isSoldier || (unit.player !== Players.HUMAN && !Vision.sees(Players.HUMAN, unit))) continue;
        const x = toX(unit.x), y = toY(unit.y);
        if (Math.hypot(x - radius, y - radius) > radius) continue;
        context.fillStyle = unit.player === Players.HUMAN ? '#4aa3ff' : rivalColor;
        context.beginPath();
        context.arc(x, y, dot, 0, Math.PI * 2);
        context.fill();
      }

      // Flaggor: en liten flagga i spelarens färg (din alltid, fiendens när platsen är utforskad); utanför kartan en pil i kanten
      const flags = [];
      for (const [player, flag] of CityBuilder.Flags.byPlayer) {
        if (player !== Players.HUMAN && !Vision.explored(Players.HUMAN, flag.x, flag.y)) continue;
        const color = Config.settings.playerColors[player] || '#fff', x = toX(flag.x + 0.5), y = toY(flag.y + 0.5);
        flags.push({ flag, color });
        if (Math.hypot(x - radius, y - radius) > radius) continue;
        const px = Math.round(x), py = Math.round(y), h = Math.ceil(marker / 2) + 3;
        context.strokeStyle = '#0d1115'; context.lineWidth = 3; context.lineJoin = 'round';
        context.beginPath(); context.moveTo(px, py + 2); context.lineTo(px, py - h); context.lineTo(px + h, py - h / 2); context.lineTo(px, py); context.stroke();
        context.fillStyle = color; context.strokeStyle = color; context.lineWidth = 1;
        context.beginPath(); context.moveTo(px, py + 2); context.lineTo(px, py - h); context.stroke();
        context.beginPath(); context.moveTo(px, py - h); context.lineTo(px + h, py - h / 2); context.lineTo(px, py); context.closePath(); context.fill();
      }

      // Huvudlagret: större, guld med vit ring
      const hq = World.headquarters;
      const hqX = toX(hq.x + 0.5), hqY = toY(hq.y + 0.5);
      // Huvudlagret är en liten guldfärgad romb med vit kant: formen och färgen finns inte hos någon annan markering
      const diamond = (half, color) => {
        const cx = Math.round(hqX), cy = Math.round(hqY);
        context.fillStyle = color;
        context.beginPath(); context.moveTo(cx, cy - half); context.lineTo(cx + half, cy); context.lineTo(cx, cy + half); context.lineTo(cx - half, cy); context.closePath(); context.fill();
      };
      const hqHalf = Math.ceil(marker / 2) + 2;
      diamond(hqHalf + 1, '#fff');
      diamond(hqHalf, '#ffc400');

      // Det som syns på skärmen
      context.strokeStyle = 'rgb(255 255 255 / 85%)';
      context.lineWidth = 1;
      context.strokeRect(
        Math.round(toX(range.minX)) + 0.5, Math.round(toY(range.minY)) + 0.5,
        Math.round((range.maxX - range.minX + 1) * scale), Math.round((range.maxY - range.minY + 1) * scale)
      );

      // Pilen: i kanten, pekar mot huvudlagret när det inte syns på skärmen
      const hqOnScreen = hq.x >= range.minX && hq.x <= range.maxX && hq.y >= range.minY && hq.y <= range.maxY;
      if (!hqOnScreen) this.drawArrow(context, Math.atan2(hq.y + 0.5 - centerY, hq.x + 0.5 - centerX), radius);

      this.updateLegend();

      // Vulkaner: en pulserande orange ring (en pil i kanten när den ligger utanför kartan), så de syns även långt bort
      for (const volcano of CityBuilder.Weather.volcanoes) {
        const x = toX(volcano.x + 0.5), y = toY(volcano.y + 0.5);
        if (Math.hypot(x - radius, y - radius) <= radius) {
          context.strokeStyle = '#ff6a00'; context.lineWidth = 2;
          context.beginPath(); context.arc(x, y, marker + 2 + Math.abs(Math.sin(performance.now() / 300)) * 2, 0, Math.PI * 2); context.stroke();
        } else this.drawArrow(context, Math.atan2(volcano.y + 0.5 - centerY, volcano.x + 0.5 - centerX), radius, '#ff6a00');
      }

      // Röd pil mot platsen där fienden senast attackerade (10 sekunder, se Combat.raiseAlarm), på samma sätt
      const attack = CityBuilder.Combat.alarmArrow();
      if (attack && !(attack.x >= range.minX && attack.x <= range.maxX && attack.y >= range.minY && attack.y <= range.maxY)) {
        this.drawArrow(context, Math.atan2(attack.y + 0.5 - centerY, attack.x + 0.5 - centerX), radius, '#ff3b30');
      }

      // Pilar mot flaggor som ligger utanför kartans synfält
      for (const { flag, color } of flags) {
        if (!(flag.x >= range.minX && flag.x <= range.maxX && flag.y >= range.minY && flag.y <= range.maxY)) {
          this.drawArrow(context, Math.atan2(flag.y + 0.5 - centerY, flag.x + 0.5 - centerX), radius, color);
        }
      }
    },

    drawArrow(context, angle, radius, color = '#ffd23f') {
      context.save();
      context.translate(radius, radius);
      context.rotate(angle);
      context.translate(radius - 12, 0);
      context.beginPath();
      context.moveTo(10, 0);
      context.lineTo(-6, -8);
      context.lineTo(-2, 0);
      context.lineTo(-6, 8);
      context.closePath();
      context.lineJoin = 'round';
      context.lineWidth = 3;
      context.strokeStyle = '#0d1115';
      context.stroke();
      context.fillStyle = color;
      context.fill();
      context.restore();
    },
  };

  CityBuilder.Minimap = Minimap;
})(window.CityBuilder);