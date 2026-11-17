/* Optimeraren: övervakar bildfrekvensen och slår av extra grafik i nivåer när spelet går för segt (se config/optimizer.js för nivåerna och inställningarna).
   Game.frame anropar record(tid, ms) efter varje ritad bild. Mätningen görs per sekund: medelbildtiden och hur länge bilden tog att beräkna och rita. Segt = bilden tar för lång tid OCH det är
   spelets eget arbete som tar tiden (inte bildskärmens takt). Tre sekunder i rad -> en nivå upp. Går det lätt en stund -> en nivå ner igen; blir det segt strax efter ett sådant steg väntar den längre
   (dubbelt) nästa gång, så att den inte pendlar. Beroende kod frågar bara efter egenskaperna: Optimizer.villagers, .decor, .civils, .simpleCarriers (vanliga värden när nivån är 0).
   Testa: CityBuilder.Optimizer.force(3) låser nivån, force(null) släpper den. */
(function (CityBuilder) {
  'use strict';

  const RATES = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360];   // vanliga skärmfrekvenser

  const Optimizer = {
    level: 0, villagers: 1, decor: true, civils: true, simpleCarriers: false,
    last: 0, windowStart: 0, frames: 0, interval: 0, work: 0,   // mätfönstret (en sekund)
    warm: 0, slowRun: 0, goodRun: 0, recoverWait: 0, recoveredAt: 0, locked: false,
    refreshHz: 0, probeHz: 0, probing: false, fastest: [], samples: new Float32Array(1024), count: 0,   // skärmens uppdateringsfrekvens (mäts), och bildtiderna i det pågående mätfönstret
    sleeping: false, hiddenSince: 0,
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

    // En dold flik (ingen bild ritas, spelet står stilla) behöver inget av det som byggts för att rita: släpp det. Vaknar när fliken visas: skärmen får tillbaka sin storlek och cacharna byggs om efter hand.
    sleep() {
      if (this.sleeping) return;
      this.sleeping = true;
      this.trim();
      const canvas = CityBuilder.Renderer?.canvas;
      if (canvas) { canvas.width = 1; canvas.height = 1; }   // minnet för skärmens bild (bredd x höjd x 4 byte, ofta tiotals MB)
    },
    wake() {
      if (!this.sleeping) return;
      this.sleeping = false;
      CityBuilder.Renderer?.resize();
      this.last = 0;   // första bildrutan efter uppvaknandet räknas inte som segt
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

    // Mäter skärmens uppdateringsfrekvens på ett tomt sätt, utan spelet: 90 bilder i en egen rAF-slinga (snabbaste tiondelen). Görs i menyn när sidan laddats, och om fönstret flyttas/visas igen.
    // Spelets egna bildtider duger inte ensamma: går spelet alltid lite för segt hinner det aldrig på en uppdatering, utan på varannan (144 Hz ser då ut som 72 Hz).
    probe(frames = 90) {
      if (this.probing || typeof requestAnimationFrame !== 'function' || document.hidden) return;
      this.probing = true;
      const gaps = []; let last = 0;
      const step = time => {
        if (last) gaps.push(time - last);
        last = time;
        if (document.hidden) { this.probing = false; return; }   // fliken göms: mätningen blir inte rättvis
        if (gaps.length < frames) return requestAnimationFrame(step);
        this.probing = false;
        gaps.sort((a, b) => a - b);
        this.probeHz = Math.max(this.probeHz, this.snap(1000 / Math.max(2, gaps[Math.floor(gaps.length * .1)])));
        this.refreshHz = Math.max(this.refreshHz, this.probeHz);
      };
      requestAnimationFrame(step);
    },

    snap(hz) { return RATES.find(rate => Math.abs(rate - hz) / rate < .06) || Math.round(hz); },

    // Spelets egna bildtider: de snabbaste bildtiderna (tionde percentilen per sekund; en bild som hinner i tid kommer vid varje bildskärmsuppdatering) under de senaste 30 sekunderna,
    // avrundad till en vanlig frekvens. Går spelet för segt för att nå den syns det ändå på bilder som hinner i tid emellanåt.
    measureRefresh() {
      const samples = this.samples.subarray(0, this.count).sort();
      if (samples.length >= 20) { this.fastest.push(samples[Math.floor(samples.length * .1)]); if (this.fastest.length > 30) this.fastest.shift(); }
      this.count = 0;
      if (this.fastest.length < 3) return;
      const hz = 1000 / Math.max(2, Math.min(...this.fastest));
      this.refreshHz = Math.max(this.probeHz, this.snap(hz));   // mätningen utan spelet har företräde när den är högre
    },

    // Målet: skärmens frekvens (högst maxTargetFps), eller standardmålet tills den är mätt
    targetFps() {
      const config = CityBuilder.Config.optimizer;
      return Math.max(config.minTargetFps, Math.min(config.maxTargetFps, this.refreshHz || config.targetFps));
    },

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
        this.frames = this.interval = this.work = this.count = 0; this.windowStart = time; this.warm = config.warmup; this.slowRun = this.goodRun = 0;
        return;
      }
      this.frames++; this.interval += gap; this.work += workMs;
      if (this.count < this.samples.length) this.samples[this.count++] = gap;
      if (time - this.windowStart < 1000) return;
      this.measureRefresh();
      const interval = this.interval / this.frames, work = this.work / this.frames;
      this.frames = this.interval = this.work = 0; this.windowStart = time;
      if (this.warm > 0) { this.warm--; return; }

      const limit = CityBuilder.Options?.settings.fpsLimit, target = limit || this.targetFps(), budget = 1000 / target;
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
  if (typeof addEventListener === 'function' && typeof document !== 'undefined') {
    const start = () => setTimeout(() => Optimizer.probe(), 1200);   // efter laddningen: sidan hinner bli tyst
    if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) Optimizer.hiddenSince = performance.now(); else Optimizer.wake(); });
    setInterval(() => {   // timers går långsamt i en dold flik, men räcker för att se hur länge den varit dold
      const config = CityBuilder.Config.optimizer;
      if (document.hidden && Optimizer.enabled() && config && !Optimizer.sleeping && performance.now() - Optimizer.hiddenSince >= config.sleepSeconds * 1000) Optimizer.sleep();
    }, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { Optimizer.probeHz = 0; Optimizer.fastest = []; setTimeout(() => Optimizer.probe(), 800); } });   // kanske på en annan skärm nu
  }
})(window.CityBuilder);
