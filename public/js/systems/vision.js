/* Fog of war: vad varje spelare (människa och dator) ser.

   Kartan delas i celler om 2x2 rutor (CELL), lagrade per chunk om 8x8 celler (samma chunkar som World). En cell innehåller
   bara tiden då den slutar vara synlig, och är synlig om den tiden ligger framåt. En spelare ser alltså allt inom räckvidd från
   sina byggnader och enheter, och det syns kvar settings.vision.ttl sekunder efter att den sista observatören lämnat.
   Därefter blir cellen dimma av sig själv, utan någon städning.

   - Vision.visible(spelare, x, y) och Vision.sees(spelare, byggnad eller enhet): O(1)-uppslag, billiga att fråga överallt.
   - Systemet 'vision' stämplar om alla observatörer högst var settings.vision.interval:e sekund (speltid) och bygger då om
     activeChunks: de chunkar som någon spelare ser. Bara där simuleras hjortar (Deer.updateActivation).
   - Vision.mask ritar celler som alfakanal i en liten canvas (en pixel per cell) för fog-lagret och minikartan. Uppskalningen
     med utjämning ger mjuka kanter, och celler bleknar de sista settings.vision.fade sekunderna.
   Räckvidd: definition.vision (byggnad eller enhet) eller settings.vision.building / unit / soldier. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Utils, Players } = CityBuilder;

  const CHUNK_CELLS = 8;                                  // celler per chunk och led (2^SHIFT)
  const SHIFT = 3;
  const MASK = CHUNK_CELLS - 1;
  const cellSize = () => Config.settings.chunkSize / CHUNK_CELLS;  // rutor per cell

  const Vision = {
    time: 0,                       // speltid i sekunder (står still när spelet är pausat)
    grids: new Map(),              // spelare -> Map(chunknyckel -> { cx, cy, cells: Float64Array })
    activeChunks: [],              // { cx, cy } för chunkar som någon spelare ser
    nextRefresh: 0,
    version: 0,                    // ökar när synfältet räknats om (renderingen cachar dimman så länge den är oförändrad)
    discs: new Map(),              // räckvidd -> cellförskjutningar inom cirkeln
    maskData: new WeakMap(),       // canvas -> ImageData

    // Nollställer allt (ny värld)
    reset() {
      this.time = 0; this.nextRefresh = 0;
      this.grids.clear(); this.activeChunks = [];
    },

    cellSize,
    cellOf: value => Math.floor(value / cellSize()),

    chunkOf(player, cellX, cellY, create) {
      let grid = this.grids.get(player);
      if (!grid) { if (!create) return undefined; this.grids.set(player, grid = new Map()); }
      const cx = cellX >> SHIFT, cy = cellY >> SHIFT, key = Utils.tileKey(cx, cy);
      let chunk = grid.get(key);
      if (!chunk && create) grid.set(key, chunk = { cx, cy, cells: new Float64Array(CHUNK_CELLS * CHUNK_CELLS) });
      return chunk;
    },

    // När cellen slutar vara synlig för spelaren (0 = aldrig sedd)
    expiry(player, cellX, cellY) {
      const chunk = this.chunkOf(player, cellX, cellY, false);
      return chunk ? chunk.cells[((cellY & MASK) << SHIFT) | (cellX & MASK)] : 0;
    },

    // Ser spelaren rutan (x, y) (rutkoordinater, decimaler går bra)?
    visible(player, x, y) {
      return this.expiry(player, this.cellOf(x), this.cellOf(y)) > this.time;
    },

    // Ser spelaren byggnaden eller enheten? Egna syns alltid.
    sees(player, thing) {
      if (thing.player === player) return true;
      const half = thing.buildProgress !== undefined ? .5 : 0;   // byggnadens x och y är rutan, enhetens är mitten
      return this.visible(player, thing.x + half, thing.y + half);
    },

    // Syns någon cell inom rutintervallet (minX..maxX, minY..maxY, inklusive)?
    anyVisible(player, minX, minY, maxX, maxY) {
      for (let cy = this.cellOf(minY); cy <= this.cellOf(maxY); cy++) {
        for (let cx = this.cellOf(minX); cx <= this.cellOf(maxX); cx++) if (this.expiry(player, cx, cy) > this.time) return true;
      }
      return false;
    },

    // Cellförskjutningar inom radius (rutor) från mittcellen
    disc(radius) {
      let offsets = this.discs.get(radius);
      if (!offsets) {
        const reach = radius / cellSize();
        offsets = [];
        for (let dy = -Math.ceil(reach); dy <= Math.ceil(reach); dy++) {
          for (let dx = -Math.ceil(reach); dx <= Math.ceil(reach); dx++) if (dx * dx + dy * dy <= reach * reach + .25) offsets.push(dx, dy);
        }
        this.discs.set(radius, offsets);
      }
      return offsets;
    },

    // Spelaren ser cellerna runt (x, y) tills expiry
    stamp(player, x, y, radius, expiry) {
      const centreX = this.cellOf(x), centreY = this.cellOf(y), offsets = this.disc(radius);
      let chunk = null, chunkX = NaN, chunkY = NaN;
      for (let i = 0; i < offsets.length; i += 2) {
        const cellX = centreX + offsets[i], cellY = centreY + offsets[i + 1];
        if ((cellX >> SHIFT) !== chunkX || (cellY >> SHIFT) !== chunkY) {
          chunk = this.chunkOf(player, cellX, cellY, true);
          chunkX = cellX >> SHIFT; chunkY = cellY >> SHIFT;
        }
        chunk.cells[((cellY & MASK) << SHIFT) | (cellX & MASK)] = expiry;
      }
    },

    // Stämplar om alla observatörer och bygger om listan över chunkar som någon ser
    refresh() {
      const settings = Config.settings.vision, expiry = this.time + settings.ttl;
      this.nextRefresh = this.time + settings.interval;
      this.version++;
      for (const building of World.buildings) {
        if (building.buildProgress < 1) continue;
        this.stamp(building.player, building.x + .5, building.y + .5, building.definition.vision ?? settings.building, expiry);
      }
      for (const unit of World.units) {
        if (unit.player === Players.NEUTRAL) continue;
        this.stamp(unit.player, unit.x, unit.y, unit.definition.vision ?? (unit.definition.isSoldier ? settings.soldier : settings.unit), expiry);
      }

      const active = new Map();
      for (const grid of this.grids.values()) {
        for (const [key, chunk] of grid) {
          if (active.has(key)) continue;
          if (chunk.cells.some(until => until > this.time)) active.set(key, chunk);
          else if (chunk.cells.every(until => until < this.time - 60)) grid.delete(key); // glömda chunkar släpps
        }
      }
      this.activeChunks = [...active.values()];
    },

    // Fyller canvasen (en pixel per cell, cols x rows från cell minCellX, minCellY) med dimmans täckning som alfa:
    // 255 = dimma, 0 = synligt. Returnerar 0 om allt syns, 1 om något är dolt, 2 om dessutom någon cell håller på att blekna.
    mask(player, canvas, minCellX, minCellY, cols, rows) {
      if (canvas.width !== cols || canvas.height !== rows) { canvas.width = cols; canvas.height = rows; }
      const context = canvas.getContext('2d');
      let image = this.maskData.get(canvas);
      if (!image || image.width !== cols || image.height !== rows) this.maskData.set(canvas, image = context.createImageData(cols, rows));
      const data = image.data, fade = Config.settings.vision.fade;
      let state = 0;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const left = this.expiry(player, minCellX + i, minCellY + j) - this.time;
          const alpha = left >= fade ? 0 : left <= 0 ? 255 : Math.round(255 * (1 - left / fade));
          data[(j * cols + i) * 4 + 3] = alpha;
          if (alpha) state = Math.max(state, alpha < 255 && left > 0 ? 2 : 1);
        }
      }
      context.putImageData(image, 0, 0);
      return state;
    },
  };

  CityBuilder.Vision = Vision;

  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.vision = {
    update(deltaSeconds) {
      Vision.time += deltaSeconds;
      if (Vision.time < Vision.nextRefresh) return;
      Vision.refresh();
      CityBuilder.Deer.updateActivation();
    },
  };
})(window.CityBuilder);
