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
  const { Config, World, Renderer } = CityBuilder;
  const t = (text, variables) => CityBuilder.t(text, variables);

  const DEFAULTS = { size: 176, pixelsPerTile: 2, corner: 'top-right' };
  const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
  const MODES = [
    { id: 'all', name: 'All', icon: '🗺️' },
    { id: 'resources', name: 'Resources', icon: '💎' },
    { id: 'favorites', name: 'Favorites', icon: '★' },
  ];
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

      const storedZoom = Number(safe(() => localStorage.getItem(ZOOM_KEY)));
      this.scale = ZOOM_STEPS.includes(storedZoom) ? storedZoom : config.pixelsPerTile;
      const storedMode = MODES.findIndex(mode => mode.id === safe(() => localStorage.getItem(MODE_KEY)));
      this.modeIndex = storedMode >= 0 ? storedMode : 0;

      this.canvas = document.createElement('canvas');
      this.canvas.id = 'minimap';
      this.canvas.title = t('Minimap (scroll to zoom)');
      this.context = this.canvas.getContext('2d');
      this.background = new Image();
      this.background.src = 'images/minimap_bg.jpg';

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

      this.injectStyles();
      document.body.appendChild(this.canvas);
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
        safe(() => localStorage.setItem(ZOOM_KEY, String(next)));
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

        .minimap-zoom:disabled {
          opacity: .4;
        }
      `;
      document.head.appendChild(style);
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
      this.lastDraw = 0;
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
      } else if (resourceIds) {
        resourceId = resourceIds.values().next().value;
      }
      const resource = resourceId && Config.resources[resourceId];
      const terrain = Config.terrain[type];
      const color = (resource && resource.color) || (terrain && terrain.color) || '#fff';
      cache.set(type, color);
      return color;
    },

    // Vald gather-byggnad (placingType) -> mängd av terrängtyper den samlar från, annars null. Bara typer som syns som noder.
    placingFilter() {
      const id = CityBuilder.Game && CityBuilder.Game.placingType;
      if (id !== this.filterId) {
        this.filterId = id;
        const job = id && Config.buildings[id] && Config.buildings[id].job;
        const types = job && job.kind === 'gather' && job.sourceTerrain ? [].concat(job.sourceTerrain).filter(type => isNode(Config.terrain[type])) : [];
        this.filter = types.length ? new Set(types) : null;
      }
      return this.filter;
    },

    // ---- Ritning ----

    frame() {
      requestAnimationFrame(() => this.frame());
      if (document.hidden || !World.headquarters) return;
      const now = performance.now();
      if (now - this.lastDraw < DRAW_INTERVAL_MS) return;
      this.lastDraw = now;
      this.draw(now);
    },

    draw(now) {
      const size = this.size, scale = this.scale, radius = size / 2, context = this.context;
      this.filter = this.placingFilter();
      const mode = this.filter ? 'filter' : this.mode.id; // vald gather-byggnad går före vanligt läge
      const range = Renderer.visibleTileRange();
      const centerX = Math.round((range.minX + range.maxX + 1) / 2);
      const centerY = Math.round((range.minY + range.maxY + 1) / 2);
      const toX = tileX => radius + (tileX - centerX) * scale;
      const toY = tileY => radius + (tileY - centerY) * scale;

      // Brickor som ligger inom kartan, närmast mitten först
      const reach = radius / scale + CHUNK;
      const minCX = Math.floor((centerX - reach) / CHUNK), maxCX = Math.floor((centerX + reach) / CHUNK);
      const minCY = Math.floor((centerY - reach) / CHUNK), maxCY = Math.floor((centerY + reach) / CHUNK);
      const visible = [];
      for (let cy = minCY; cy <= maxCY; cy++) {
        for (let cx = minCX; cx <= maxCX; cx++) {
          const chunk = this.chunkAt(cx, cy);
          chunk.usedAt = now;
          visible.push(chunk);
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
      if (this.background && this.background.complete && this.background.naturalWidth) context.drawImage(this.background, 0, 0, size, size);
      else { context.fillStyle = '#0d1115'; context.fillRect(0, 0, size, size); }
      context.imageSmoothingEnabled = false;
      for (const chunk of visible) {
        if (!chunk.builtAt) continue;
        const x0 = Math.round(toX(chunk.cx * CHUNK)), x1 = Math.round(toX((chunk.cx + 1) * CHUNK));
        const y0 = Math.round(toY(chunk.cy * CHUNK)), y1 = Math.round(toY((chunk.cy + 1) * CHUNK));
        context.drawImage(chunk.canvas, x0, y0, x1 - x0, y1 - y0);
      }

      // Lägena Resurser och Favoriter: mörka terrängen och lys upp noderna
      if (mode !== 'all') {
        context.fillStyle = 'rgb(6 9 12 / 80%)';
        context.fillRect(0, 0, size, size);

        const favorites = (CityBuilder.UI && CityBuilder.UI.resourceFavorites) || new Set();
        const cache = new Map();
        // Varje nod fyller exakt sin egen ruta (samma kantlinjer som terrängen under), utan kant
        const limit = (radius + 2 * scale + 2) * (radius + 2 * scale + 2);
        let shown = 0, lastColor = null;
		    const grow = mode === 'favorites' || mode === 'filter' ? 1 : 0; 
        for (const chunk of visible) {
          for (const node of chunk.nodes) {
            const color = this.nodeColor(node.type, mode, favorites, cache);
            if (!color) continue;
            const left = Math.round(toX(node.x)), top = Math.round(toY(node.y));
            const right = Math.max(left + 1, Math.round(toX(node.x + 1))), bottom = Math.max(top + 1, Math.round(toY(node.y + 1)));
            const dx = (left + right) / 2 - radius, dy = (top + bottom) / 2 - radius;
            if (dx * dx + dy * dy > limit) continue;
            if (color !== lastColor) { context.fillStyle = color; lastColor = color; }
			context.fillRect(left - grow, top - grow, right - left + grow * 2, bottom - top + grow * 2);
            shown++;
          }
        }

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
      }

      // Byggnader: tydlig färg med mörk kant (ofärdiga är genomskinliga)
      const marker = Math.max(4, Math.round(scale * 2));
      for (const building of World.buildings) {
        if (building === World.headquarters) continue;
        const x = toX(building.x + 0.5), y = toY(building.y + 0.5);
        if (Math.hypot(x - radius, y - radius) > radius + marker) continue;
        context.globalAlpha = building.buildProgress >= 1 ? 1 : 0.55;
        context.fillStyle = '#05080a';
        context.fillRect(Math.round(x - marker / 2) - 1, Math.round(y - marker / 2) - 1, marker + 2, marker + 2);
        context.fillStyle = (building.definition && building.definition.color) || '#e8e8e8';
        context.fillRect(Math.round(x - marker / 2), Math.round(y - marker / 2), marker, marker);
      }
      context.globalAlpha = 1;

      // Huvudlagret: större, guld med vit ring
      const hq = World.headquarters;
      const hqX = toX(hq.x + 0.5), hqY = toY(hq.y + 0.5);
      const hqSize = marker + 4;
      context.fillStyle = '#fff';
      context.fillRect(Math.round(hqX - hqSize / 2) - 1, Math.round(hqY - hqSize / 2) - 1, hqSize + 2, hqSize + 2);
      context.fillStyle = (hq.definition && hq.definition.color) || '#ffd23f';
      context.fillRect(Math.round(hqX - hqSize / 2), Math.round(hqY - hqSize / 2), hqSize, hqSize);

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
    },

    drawArrow(context, angle, radius) {
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
      context.fillStyle = '#ffd23f';
      context.fill();
      context.restore();
    },
  };

  CityBuilder.Minimap = Minimap;
})(window.CityBuilder);