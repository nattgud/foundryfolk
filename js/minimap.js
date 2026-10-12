/* Minimap: rund karta med terrängen i Config.terrain[typ].color, tydligt färgade byggnader och en pil i kanten
   som pekar mot huvudlagret (HQ) när det inte syns på skärmen.

   - Kartan är centrerad på det som spelaren ser just nu och visar det omgivande området. Den vita rutan är
     det som syns på skärmen.
   - Terrängen ritas i brickor (16x16 rutor) som byggs lite i taget, så att spelet inte hackar. Brickor
     uppdateras då och då så att t.ex. nedhuggna träd syns.
   - Scrolla över kartan för att zooma. Klick och scroll på kartan går inte igenom till spelkartan.
   - Anropas från Game.init: CityBuilder.Minimap.init() (efter UI.init).

   Inställningar (valfria): Config.settings.minimap = { size, pixelsPerTile, corner: 'top-right' | 'top-left',
   enabled: false för att stänga av } */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Renderer } = CityBuilder;

  const DEFAULTS = { size: 176, pixelsPerTile: 2, corner: 'top-right' };
  const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
  const CHUNK = 16;              // rutor per bricka
  const BUILD_BUDGET_MS = 4;     // högst så här lång tid per bildruta åt att bygga brickor
  const REFRESH_MS = 3000;       // så ofta uppdateras en redan byggd bricka
  const ZOOM_KEY = 'citybuilder.minimapZoom';

  const settings = () => Object.assign({}, DEFAULTS, Config.settings && Config.settings.minimap);
  const safe = fn => { try { return fn(); } catch (e) { return null; } };

  const Minimap = {
    canvas: null,
    context: null,
    chunks: new Map(),   // "cx,cy" -> { canvas, context, builtAt, usedAt }
    size: 0,
    dpr: 1,
    scale: 2,            // bildpunkter per ruta
    lastPrune: 0,
    started: false,

    init() {
      if (this.started) return;
      const config = settings();
      if (Config.settings && Config.settings.minimap && Config.settings.minimap.enabled === false) return;
      this.started = true;

      const stored = Number(safe(() => localStorage.getItem(ZOOM_KEY)));
      this.scale = ZOOM_STEPS.includes(stored) ? stored : config.pixelsPerTile;

      this.canvas = document.createElement('canvas');
      this.canvas.id = 'minimap';
      this.canvas.title = 'Minikarta (scrolla för att zooma)';
      this.context = this.canvas.getContext('2d');
      this.injectStyles();
      document.body.appendChild(this.canvas);

      // Klick, tryck och scroll på kartan ska inte gå vidare till spelkartan (bygga, panorera, zooma)
      for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick']) {
        this.canvas.addEventListener(type, event => event.stopPropagation());
      }
      this.canvas.addEventListener('wheel', event => {
        event.preventDefault();
        event.stopPropagation();
        const index = ZOOM_STEPS.indexOf(this.scale);
        const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + (event.deltaY < 0 ? 1 : -1)))];
        if (next !== this.scale) {
          this.scale = next;
          safe(() => localStorage.setItem(ZOOM_KEY, String(next)));
        }
      }, { passive: false });

      this.layout();
      addEventListener('resize', () => this.layout());
      requestAnimationFrame(() => this.frame());
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
      `;
      document.head.appendChild(style);
    },

    // Storlek och plats (under övre fältet, i det valda hörnet)
    layout() {
      const config = settings();
      this.size = Math.max(90, Math.min(config.size, Math.floor(innerWidth * 0.4)));
      this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      this.canvas.width = this.canvas.height = Math.round(this.size * this.dpr);
      this.canvas.style.width = this.canvas.style.height = this.size + 'px';

      const top = document.getElementById('top');
      this.canvas.style.top = ((top ? top.getBoundingClientRect().bottom : 0) + 8) + 'px';
      this.canvas.style.left = config.corner === 'top-left' ? '8px' : 'auto';
      this.canvas.style.right = config.corner === 'top-left' ? 'auto' : '8px';
    },

    // ---- Terrängbrickor ----

    chunkAt(cx, cy) {
      const key = cx + ',' + cy;
      let chunk = this.chunks.get(key);
      if (!chunk) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = CHUNK;
        chunk = { canvas, context: canvas.getContext('2d'), builtAt: 0, usedAt: 0, cx, cy };
        this.chunks.set(key, chunk);
      }
      return chunk;
    },

    buildChunk(chunk, now) {
      const context = chunk.context;
      let lastColor = null;
      for (let ty = 0; ty < CHUNK; ty++) {
        for (let tx = 0; tx < CHUNK; tx++) {
          const tile = World.getTile(chunk.cx * CHUNK + tx, chunk.cy * CHUNK + ty);
          const terrain = tile && Config.terrain[tile.terrainType];
          const color = (terrain && terrain.color) || '#000';
          if (color !== lastColor) { context.fillStyle = color; lastColor = color; }
          context.fillRect(tx, ty, 1, 1);
        }
      }
      chunk.builtAt = now;
    },

    prune(now) {
      if (now - this.lastPrune < 10000) return;
      this.lastPrune = now;
      for (const [key, chunk] of this.chunks) if (now - chunk.usedAt > 30000) this.chunks.delete(key);
    },

    // ---- Ritning ----

    frame() {
      requestAnimationFrame(() => this.frame());
      if (document.hidden || !World.headquarters) return;
      this.draw(performance.now());
    },

    draw(now) {
      const size = this.size, scale = this.scale, radius = size / 2, context = this.context;
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
      visible.sort((a, b) => Math.hypot(a.cx * CHUNK + 8 - centerX, a.cy * CHUNK + 8 - centerY) - Math.hypot(b.cx * CHUNK + 8 - centerX, b.cy * CHUNK + 8 - centerY));

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
      context.fillStyle = '#0d1115';
      context.fillRect(0, 0, size, size);
      context.imageSmoothingEnabled = false;
      for (const chunk of visible) {
        if (!chunk.builtAt) continue;
        const x0 = Math.round(toX(chunk.cx * CHUNK)), x1 = Math.round(toX((chunk.cx + 1) * CHUNK));
        const y0 = Math.round(toY(chunk.cy * CHUNK)), y1 = Math.round(toY((chunk.cy + 1) * CHUNK));
        context.drawImage(chunk.canvas, x0, y0, x1 - x0, y1 - y0);
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