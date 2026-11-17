/* Optimeraren: övervakar bildfrekvensen och slår av extra grafik i nivåer när spelet går för segt (se config/optimizer.js för nivåerna och inställningarna).
   Game.frame anropar record(tid, ms) efter varje ritad bild. Mätningen görs per sekund: medelbildtiden och hur länge bilden tog att beräkna och rita. Segt = bilden tar för lång tid OCH det är
   spelets eget arbete som tar tiden (inte bildskärmens takt). Tre sekunder i rad -> en nivå upp. Går det lätt en stund -> en nivå ner igen; blir det segt strax efter ett sådant steg väntar den längre
   (dubbelt) nästa gång, så att den inte pendlar. Beroende kod frågar bara efter egenskaperna: Optimizer.villagers, .decor, .civils, .simpleCarriers (vanliga värden när nivån är 0).
   Testa: CityBuilder.Optimizer.force(3) låser nivån, force(null) släpper den. */
(function (CityBuilder) {
  'use strict';

  const Optimizer = {
    level: 0, villagers: 1, decor: true, civils: true, simpleCarriers: false,
    last: 0, windowStart: 0, frames: 0, interval: 0, work: 0,   // mätfönstret (en sekund)
    warm: 0, slowRun: 0, goodRun: 0, recoverWait: 0, recoveredAt: 0, locked: false,
    heapMB: 0, peakMB: 0, memoryAt: 0, trimmedAt: 0, trimmedMB: 0, trims: 0, pressure: false, caches: [],

    // Ett minne som kan städas: register('namn', { size: () => ({ count, mb }), trim: () => släpp allt som går att bygga om }). report() visar dem, trim() släpper dem.
    register(name, cache) { this.caches.push({ name, ...cache }); },

    // Städar: släpper alla cachar (de byggs om vid behov), och ger webbläsaren en chans att ta bort det
    trim() {
      for (const cache of this.caches) { try { cache.trim(); } catch (error) { CityBuilder.Errors?.report(error, 'optimizer'); } }
      this.trims++; this.trimmedAt = performance.now(); this.trimmedMB = this.heapMB;
    },

    // Visar vad som tar minne (kör CityBuilder.Optimizer.report() i konsolen efter en lång session och skicka resultatet)
    report() {
      const memory = performance.memory, rows = this.caches.map(cache => ({ cache: cache.name, ...cache.size() }));
      const canvases = [...document.querySelectorAll('canvas')], canvasMB = Math.round(canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0) / 1048576);
      let imageBytes = 0, imageCount = 0;   // avkodade bilder: 4 byte per pixel
      for (const image of Object.values(CityBuilder.Assets?.imageCache || {})) if (image.complete && image.naturalWidth) { imageCount++; imageBytes += image.naturalWidth * image.naturalHeight * 4; }
      rows.push({ cache: 'images (decoded)', count: imageCount, mb: Math.round(imageBytes / 1048576) }, { cache: 'canvas in the page (screen, minimap...)', count: canvases.length, mb: canvasMB });
      console.log(`JS-minne ${memory ? Math.round(memory.usedJSHeapSize / 1048576) : '?'} MB (topp ${Math.round(this.peakMB)}), DOM-element ${document.getElementsByTagName('*').length}, devicePixelRatio ${devicePixelRatio}, skärm ${innerWidth}x${innerHeight}, optimerarnivå ${this.level}, städningar ${this.trims}. Summa avkodade bilder, ljud och canvas: ${Math.round(rows.reduce((sum, row) => sum + (row.mb || 0), 0))} MB (utanför JS-minnet)`);
      if (console.table) console.table(rows);
      return rows;
    },

    // Mäter JS-minnet (Chrome) med jämna mellanrum: passerar det gränsen, eller har det vuxit mycket sedan senaste städningen, städas det
    checkMemory(time) {
      const config = CityBuilder.Config.optimizer?.memory, memory = performance.memory;
      if (!config || !memory || time - this.memoryAt < config.checkSeconds * 1000) return;
      this.memoryAt = time;
      this.heapMB = memory.usedJSHeapSize / 1048576; this.peakMB = Math.max(this.peakMB, this.heapMB);
      const high = this.heapMB > config.softMB, grown = this.heapMB - this.trimmedMB > config.growthMB;
      this.pressure = high;
      if ((high || grown) && time - this.trimmedAt > config.trimSeconds * 1000) this.trim();
    },

    enabled() { const options = CityBuilder.Options; return !options || options.settings.optimizer !== false; },

    // Lägger på nivå n: egenskaperna från nivå 1 till n, i ordning
    setLevel(level) {
      const levels = CityBuilder.Config.optimizer?.levels || [];
      this.level = Math.max(0, Math.min(levels.length, level));
      Object.assign(this, { villagers: 1, decor: true, civils: true, simpleCarriers: false });
      for (let i = 0; i < this.level; i++) { const { name, ...changes } = levels[i]; Object.assign(this, changes); }
      CityBuilder.Civils?.cull();   // det som nu är avstängt tas också bort ur minnet (växer tillbaka av sig självt när nivån sänks)
    },

    // Är den här sortens civila (big/decor) avstängd just nu? Då ritas de inte och nya växer inte fram
    hides(kind) { return this.civils === false || (kind === 'decor' && this.decor === false); },

    force(level) { this.locked = level !== null && level !== undefined; this.setLevel(this.locked ? level : 0); this.slowRun = this.goodRun = 0; },

    // Bildrutans tid (ms) och hur länge den tog att beräkna och rita (ms)
    record(time, workMs) {
      const config = CityBuilder.Config.optimizer;
      if (!config) return;
      if (!this.enabled()) { if (this.level) this.setLevel(0); this.last = time; return; }
      this.checkMemory(time);
      if (this.locked) return;
      const gap = time - this.last;
      this.last = time;
      if (gap > 250 || gap <= 0) {   // laddning, paus eller fönstret utan fokus: börja om och ge det en stund att lugna sig
        this.frames = this.interval = this.work = 0; this.windowStart = time; this.warm = config.warmup; this.slowRun = this.goodRun = 0;
        return;
      }
      this.frames++; this.interval += gap; this.work += workMs;
      if (time - this.windowStart < 1000) return;
      const interval = this.interval / this.frames, work = this.work / this.frames;
      this.frames = this.interval = this.work = 0; this.windowStart = time;
      if (this.warm > 0) { this.warm--; return; }

      const limit = CityBuilder.Options?.settings.fpsLimit, budget = 1000 / (limit || config.targetFps);
      const slow = interval > budget * (1 + config.tolerance) && (work > interval * .5 || interval > budget * 1.6);   // för långsamt, och det är spelet (inte skärmen) som tar tid
      if (!this.recoverWait) this.recoverWait = config.recoverSeconds;
      if (this.recoveredAt && time - this.recoveredAt > 40000) { this.recoverWait = config.recoverSeconds; this.recoveredAt = 0; }   // steget ner höll: tillbaka till vanlig väntan

      if (slow) {
        this.goodRun = 0;
        if (++this.slowRun >= config.slowSeconds && this.level < config.levels.length) {
          if (this.recoveredAt && time - this.recoveredAt < 15000) this.recoverWait = Math.min(this.recoverWait * 2, config.maxRecoverSeconds);   // steget ner var för tidigt
          this.setLevel(this.level + 1);
          this.slowRun = 0; this.warm = 1;   // ge ändringen en sekund att verka innan nästa mätning
        }
        return;
      }
      this.slowRun = 0;
      if (work < budget * config.headroom) {
        if (this.level && ++this.goodRun >= this.recoverWait) { this.setLevel(this.level - 1); this.goodRun = 0; this.recoveredAt = time; this.warm = 1; }
      } else this.goodRun = 0;
    },
  };

  CityBuilder.Optimizer = Optimizer;
})(window.CityBuilder);
