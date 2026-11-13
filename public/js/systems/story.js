/* Storymode: det som körs medan ett kapitel spelas (Levels.story, se Config.story för datan). Inget händer på banorna och egna kartor.
     - begin()  vid ett kapitels start (ingen sparning återställd): färdiga byggnader runt HQ och Eye of Shades
     - update() berättelsen (prolog, brev, dialog, händelser på bestämda tider) och dimman som ligger över kapitlet tills Eye of Shades är borta
   Det som visats ligger i Levels.told, så det följer med sparningen och berättas bara en gång. Berättelsen visas av StoryUI. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players, Utils } = CityBuilder;

  const SPREAD = 2;           // minsta avstånd (rutor) mellan färdiga byggnader
  const EYE_REACH = 0.3;      // hur långt mot fienden Eye of Shades står (andel av avståndet mellan baserna), om kapitlet inte anger eye: { reach }
  const EYE_MAX = 40;         // ... och högst så många rutor från HQ
  const EYE_ALONE = 16;       // utan fiende: så långt från HQ
  const TORNADO_LIFE = 45;

  const Story = {
    queue: [],         // sidor som väntar på att visas
    reading: false,

    get chapter() { return CityBuilder.Levels.story; },

    // En ledig ruta nära (x, y), spiralvis utåt. Bara gräs utan byggnad och med ett litet avstånd till andra byggnader.
    freeSpot(type, x, y, spread = SPREAD) {
      for (let radius = 0; radius < 40; radius++) {
        for (let k = 0; k < Math.max(1, radius * 6); k++) {
          const angle = k / Math.max(1, radius * 6) * Math.PI * 2, tx = Math.round(x + Math.cos(angle) * radius), ty = Math.round(y + Math.sin(angle) * radius);
          if (!World.canPlace(type, tx, ty)) continue;
          let clear = true;
          for (let dy = -spread; dy <= spread && clear; dy++) for (let dx = -spread; dx <= spread; dx++) if (World.buildingAt(tx + dx, ty + dy)) { clear = false; break; }
          if (clear) return { x: tx, y: ty };
        }
      }
      return null;
    },

    // Förbyggda hus har sina verktyg från början: de hämtas inte från lagret, så startresurserna är orörda (och målen räknar exakt från dem)
    ready(building) {
      for (const [resourceId, amount] of Object.entries(building.definition.requiredEquipment || {})) building.inputStock[resourceId] = amount;
      if (building.definition.job) CityBuilder.Behaviors.forBuilding(building)?.onBuilt?.(building);
      return building;
    },

    place(type, x, y, dead) {
      const spot = this.freeSpot(type, x, y);
      if (!spot) return null;
      const building = World.placeBuilding(CityBuilder.Construction.variantFor(type, spot.x, spot.y) || type, spot.x, spot.y, true, dead ? this.deadOwner() : Players.HUMAN);   // en samlare eller gruva får inriktningen som passar rutan
      return dead ? World.makeDead(building) : this.ready(building);
    },

    // Döda byggnader (dead: true i start.buildings): kulisser som ingen kan använda. De ägs av första fienden, så spelarens soldater kan slå sönder dem
    // men fienden aldrig använder eller försvarar dem. Se World.makeDead.
    deadOwner() { return Players.hostileAI()[0] ?? Players.ENEMY; },

    // Placerar en byggnad på exakt plats (dx, dy rutor från HQ). Går det inte (vatten, berg, upptaget) skrivs en varning och den närmaste lediga rutan används.
    placeAt(type, dx, dy, dead) {
      const hq = World.headquarters, x = hq.x + dx, y = hq.y + dy;
      type = CityBuilder.Construction.variantFor(type, x, y) || type;   // 'gatherer' eller 'mine' ger inriktningen som passar rutan; ett variant-id (berry_gatherer ...) behålls
      if (!World.canPlace(type, x, y)) {
        console.warn(`Story: ${type} cannot stand at dx ${dx}, dy ${dy} in chapter ${this.chapter.number}; using the nearest free spot`);
        return this.place(type, x, y, dead);
      }
      const building = World.placeBuilding(type, x, y, true, dead ? this.deadOwner() : Players.HUMAN);
      return dead ? World.makeDead(building) : this.ready(building);
    },

    // Kapitlets start: byggnaderna från föregående mål står redo och Eye of Shades står mot fienden.
    // En byggnad i start.buildings är antingen { type, dx, dy } (exakt plats, mätt i rutor från HQ) eller bara ett id (automatisk plats runt HQ).
    // { type, dx, dy, dead: true } är en död byggnad: bara en kuliss som ingen kan använda (se deadOwner). Lägg till sight: 6 för att den alltid ska synas genom dimman
    // (radie i rutor, som en egen byggnad) och arrow: true (eller en färg, t.ex. '#ff4fd8') för en pil mot den på minimapen när den ligger utanför.
    // Inriktningen är själva typen: layout() skriver t.ex. 'herb_gatherer' eller 'copper_mine'. Ett 'gatherer' eller 'mine' får den inriktning som passar platsen.
    // eye: true placerar Eye of Shades automatiskt mot fienden, eye: { reach } längre eller kortare dit (andel av avståndet mellan baserna), eye: { dx, dy } på en bestämd plats.
    begin() {
      const chapter = this.chapter, hq = World.headquarters;
      if (!chapter || !hq) return;
      (chapter.start?.buildings || []).forEach((entry, i) => {
        if (entry.type) {
          const building = this.placeAt(entry.type, entry.dx, entry.dy, entry.dead);
          // En död byggnad med sight (radie i rutor) syns alltid för spelaren, genom dimman, som en egen byggnad; arrow: true (eller en färg) ger en pil mot den på minimapen
          if (building && entry.dead) { if (entry.sight) building.sight = entry.sight; if (entry.arrow) building.arrow = entry.arrow; }
          return building;
        }
        const angle = i * 2.4 + chapter.number, distance = 6 + (i % 4) * 2;
        this.place(entry, hq.x + Math.cos(angle) * distance, hq.y + Math.sin(angle) * distance);
      });
      if (chapter.eye?.dx !== undefined) this.placeAt('eye_of_shades', chapter.eye.dx, chapter.eye.dy);
      else if (chapter.eye) {
        const rival = World.hqOf(Players.ENEMY);
        const angle = rival ? Math.atan2(rival.y - hq.y, rival.x - hq.x) : chapter.number * 2.1;
        const distance = rival ? Math.min(EYE_MAX, Math.hypot(rival.x - hq.x, rival.y - hq.y) * (chapter.eye.reach ?? EYE_REACH)) : EYE_ALONE;
        this.place('eye_of_shades', hq.x + Math.cos(angle) * distance, hq.y + Math.sin(angle) * distance);
      }
      if (chapter.fog) CityBuilder.Levels.markTold('fog:on');
    },

    // Utvecklarverktyg: placera byggnaderna som du vill ha dem i kapitlet (starta det från menyn, bygg eller flytta i spelet) och kör
    // CityBuilder.Story.layout() i webbläsarens konsol (högar med varor och oavslutade byggen tas inte med). Det skrivs ut färdiga rader att klistra in i start.buildings (och eye) i config/story.js.
    layout() {
      const hq = World.headquarters;
      const rows = World.buildings.filter(building => building.player === Players.HUMAN && building.type !== 'hq' && !building.definition.pile && !building.removed && building.buildProgress >= 1).sort((a, b) => a.y - b.y || a.x - b.x);
      const row = building => `{ type: '${building.type}', dx: ${building.x - hq.x}, dy: ${building.y - hq.y} }`;
      const eye = rows.find(building => building.type === 'eye_of_shades');
      const text = `start: { buildings: [\n${rows.filter(building => building !== eye).map(building => '  ' + row(building) + ',').join('\n')}\n] }` + (eye ? `\neye: { dx: ${eye.x - hq.x}, dy: ${eye.y - hq.y} }` : '');
      console.log(`Chapter ${this.chapter?.number}:\n${text}`);
      navigator.clipboard?.writeText(text).catch(() => {});
      return text;
    },

    eyeStands() { return World.buildings.some(building => building.type === 'eye_of_shades' && !building.removed); },

    // Visar sidor (brev, dialog, stycken) i läsvyn, en sekvens i taget. Spelet står stilla medan något läses.
    tell(pages) {
      if (!pages?.length) return;
      this.queue.push(...pages);
      this.flush();
    },
    flush() {
      if (this.reading || !this.queue.length) return;
      this.reading = true;
      const guide = this.queue.findIndex(page => page.type === 'guide');   // guidens rörelsesidor (UI.openTutorial) kommer efter det som står före dem i kön
      const pages = this.queue.splice(0, guide < 0 ? this.queue.length : guide);
      const next = () => { for (const page of pages) if (page.mark) CityBuilder.Levels.markTold(page.mark); this.reading = false; this.flush(); };
      if (pages.length) CityBuilder.StoryUI.read(pages, next);
      else { this.queue.shift(); CityBuilder.UI.openTutorial('story', next); }
    },
    // En gång per sparning: berättas första gången villkoret slår till. Returnerar sidorna, så att flera kan visas i en följd.
    once(key, pages) {
      const Levels = CityBuilder.Levels;
      if (Levels.told(key)) return [];
      Levels.markTold(key);
      return pages;
    },

    // Händelser på bestämda tider (Weather sköter själva vädret)
    fire(event, ctx) {
      const Weather = CityBuilder.Weather, hq = World.headquarters;
      if (event.give && hq) for (const [resourceId, amount] of Object.entries(event.give)) hq.storedGoods[resourceId] = (hq.storedGoods[resourceId] || 0) + amount;   // give: varor till spelarens huvudlager
      if (event.tell) this.tell([{ type: 'dialogue', lines: event.tell, part: 'events', scene: event.scene, mark: event.id ? 'read:' + event.id : undefined }]);   // id: händelsens namn, så att { read: id } kan vänta på att dialogen lästs
      CityBuilder.Actors?.fire(event, ctx);   // spawn och act: skådespelare
      if (event.weather) { Weather.type = event.weather; Weather.left = 90; Weather.flashIn = 1; CityBuilder.Sound?.play('weather.' + event.weather); }
      if (event.tornado || event.super) {
        const spot = Weather.tornadoSpot() || (hq && { x: hq.x + 10, y: hq.y + 6, player: Players.HUMAN });
        if (!spot) return;
        if (event.super) Weather.spawnSuper(spot.x, spot.y, event.super, TORNADO_LIFE, spot.player); else Weather.spawnTornado(spot.x, spot.y, event.tornado, TORNADO_LIFE, spot.player);
      }
      if (event.meteors && hq) Weather.spawnMeteors(hq.x + 8, hq.y + 6, 10, event.meteors);
    },

    // Anfallsvågor: kapitlets egna fiender, oberoende av datorns vanliga anfallsregler (ai.js). chapter.waves:
    //   { from, every (sekunder), size: [första, växer 1 var N:e våg, högst (valfritt: utan tak växer vågorna hela tiden)], kinds: [soldattyper i turordning], maxAlive (valfritt), until: 'fog',
    //     spawn: [[dx, dy], ...] (valfritt) }
    // Soldaterna tillhör första datorspelaren och går mot spelarens huvudlager, där de slår det de ser. Utan spawn skapas de vid dess HQ. Med spawn kommer de från platser dx, dy
    // rutor från spelarens HQ (t.ex. [[50, 0], [-50, 0]] = 50 rutor åt höger och vänster), jämnt fördelade, och går därifrån. until: 'fog' avslutar vågorna
    // när dimman lyft (Eye of Shades förstörd), annars fortsätter de tills kapitlet är klart.
    waves(chapter) {
      const wave = chapter.waves, Levels = CityBuilder.Levels;
      if (!wave || Levels.complete || Levels.seconds < wave.from || (wave.until === 'fog' && Levels.told('fog:lifted'))) return;
      const n = Math.floor((Levels.seconds - wave.from) / wave.every), key = 'wave:' + n;
      if (Levels.told(key)) return;
      Levels.markTold(key);
      this.launchWave(wave, n);
    },

    launchWave(wave, n) {
      const home = World.headquarters, rival = World.hqOf(Players.ENEMY);
      if (!home || !rival) return;
      const alive = World.units.filter(unit => unit.wave && !unit.removed).length, [first, every, cap = Infinity] = wave.size;
      const count = Math.min(cap, first + Math.floor(n / every), (wave.maxAlive ?? Infinity) - alive);
      if (count <= 0) return;
      // Platser att skapa soldater på: runt fiendens HQ, eller (spawn) runt varje angiven plats i förhållande till spelarens HQ, med soldaterna jämnt fördelade
      const walkable = (x, y) => { const tile = World.getTile(x, y); return tile && Number.isFinite(Config.terrain[tile.terrainType].walkCost) && !World.buildingAt(x, y); };
      const around = (center, minRadius, maxRadius) => {
        const found = [];
        for (let dy = -maxRadius; dy <= maxRadius; dy++) for (let dx = -maxRadius; dx <= maxRadius; dx++) {
          const distance = Utils.distance(dx, dy);
          if (distance >= minRadius && distance <= maxRadius && walkable(center.x + dx, center.y + dy)) found.push({ x: center.x + dx, y: center.y + dy });
        }
        return found;
      };
      const groups = (wave.spawn || [null]).map(offset => offset ? around({ x: home.x + offset[0], y: home.y + offset[1] }, 0, 6) : around(rival, 5, 9)).filter(list => list.length);
      if (!groups.length) return;
      for (let i = 0; i < count; i++) {
        const spots = groups[i % groups.length];
        if (!spots.length) continue;
        const spot = spots.splice(Math.floor(Utils.random() * spots.length), 1)[0];
        const unit = CityBuilder.Combat.spawnSoldier(wave.kinds[i % wave.kinds.length], spot.x, spot.y, Players.ENEMY);
        unit.post = { x: home.x + .5, y: home.y + .5 };
        unit.wave = true;   // en vågsoldat söker aldrig en garnison utan går till posten (Combat.standDown)
      }
    },

    // ---- Händelsebussen ----
    // Delar av spelet säger till när något händer: Story.emit(namn, vem, av, vad, antal). Namn: hurt (en enhet eller byggnad skadas), defeated (en enhet dör), destroyed (en byggnad förstörs),
    // pickup (en bärare hämtar en vara, av = lagret eller huset), deliver (en bärare lämnar en vara, av = huset), made (ett hus har gjort en vara), built (en byggnad blir färdig),
    // cast (en förtrollning), weather (vädret byts, vad = typen). Händelser i kapitlet med on: namn (eller { event: namn, side, kind, by, resource, building, near, radius, weather }) körs direkt när det händer,
    // utan att något kollas varje sekund. Utan någon som lyssnar kostar ett anrop bara ett uppslag.
    // En händelse sker en gång, eller varje gång med repeat: true (och cooldown: sekunder mellan gångerna, standard 30).
    emit(name, subject, by, what, amount) {
      const chapter = this.chapter;
      if (!chapter?.events) return;
      if (this.indexed !== chapter || this.indexedCount !== (chapter.events?.length ?? 0)) this.index(chapter);
      if (this.driven.has(name)) this.dirty.add(name);   // en händelse med villkor som den här kan ändra kollas i nästa steg (se update)
      const list = this.listen.get(name);
      if (!list) return;
      const ctx = this.describe(name, subject, by, what, amount);
      for (const i of list) {
        const event = chapter.events[i];
        if (this.matches(event.on, ctx) && this.ready(event, i, chapter)) this.trigger(event, i, ctx);
      }
    },
    // ---- Hur varje händelse väcks ----
    // 1. on: väntar på ett meddelande och körs direkt när det kommer (listen).
    // 2. Villkor som bara ändras av ett meddelande (byggt, besegrat, förstört, förtrollat, tillverkat, dimman) kollas först när det meddelandet kommit (driven), med en säkerhetskoll var 2:a sekund.
    // 3. Allt annat (tid, mål, lager, soldater, bärare, syn, scener, upprepning) kollas två gånger per sekund (ticking).
    index(chapter) {
      this.indexed = chapter; this.indexedCount = chapter.events?.length ?? 0; this.listen = new Map(); this.driven = new Map(); this.ticking = []; this.dirty = new Set(['*']); this.nextTick = 0; this.nextSweep = 0;
      const seen = new Set();
      (chapter.events || []).forEach((event, i) => {
        if (event.scene && event.id) { if (seen.has(event.id)) console.warn(`Story: två scener i kapitlet har id '${event.id}'; den andra körs aldrig medan den första pågår och de delar sina 'läst'-markeringar. Ge dem olika id.`); seen.add(event.id); }
        const key = typeof event.on === 'string' ? event.on : event.on?.event;
        if (key) { (this.listen.get(key) || this.listen.set(key, []).get(key)).push(i); return; }
        const signals = this.signalsOf(event);
        if (!signals) this.ticking.push(i); else for (const signal of signals) (this.driven.get(signal) || this.driven.set(signal, []).get(signal)).push(i);
      });
    },
    signalsOf(event) {
      if (event.at !== undefined || event.goal || event.end || event.guide || event.whileFog || event.repeat) return null;
      const needs = [].concat(event.when || []), out = new Set();
      if (!needs.length) return null;
      for (const need of needs) { const signal = this.signalOf(need); if (!signal) return null; out.add(signal); }
      return out;
    },
    signalOf(need) {
      const triggers = CityBuilder.Actors?.Triggers || {};
      if (Object.keys(need).some(key => triggers[key] || key === 'sees' || key === 'goal')) return null;
      if (need.made !== undefined) return 'made';
      return { build: 'built', buildings: 'built', kills: 'defeated', destroy: 'destroyed', casts: 'cast', fog: 'fog' }[need.type] || null;
    },
    // Sida (own = spelaren, enemy, monster, ally, other) och slag (soldier, carrier, worker, monster, building, other) för en enhet eller byggnad
    sideOf(thing) {
      if (!thing) return undefined;
      if (thing.definition?.isMonster) return 'monster';
      if (thing.player === Players.HUMAN) return 'own';
      if (Players.isHostile(Players.HUMAN, thing.player) && Players.isPlayer(thing.player)) return 'enemy';
      return Players.isPlayer(thing.player) ? 'ally' : 'other';
    },
    kindOf(thing) {
      if (!thing) return undefined;
      if (thing.buildProgress !== undefined) return 'building';
      const definition = thing.definition || {};
      if (definition.isHauler) return 'carrier';
      if (definition.isMonster) return 'monster';
      if (definition.isSoldier) return 'soldier';
      return thing.homeBuilding ? 'worker' : 'other';
    },
    describe(name, subject, by, what, amount) {
      const isBuilding = subject?.buildProgress !== undefined, building = isBuilding ? subject : by?.buildProgress !== undefined ? by : null;
      return {
        name, unit: isBuilding ? null : subject, building, by, side: this.sideOf(subject), kind: this.kindOf(subject), bySide: this.sideOf(by), type: building?.type,
        resource: name === 'weather' || name === 'cast' ? undefined : what, weather: name === 'weather' ? what : undefined, spell: name === 'cast' ? what : undefined, amount,
        x: Math.floor(subject?.x ?? by?.x ?? 0), y: Math.floor(subject?.y ?? by?.y ?? 0),
      };
    },
    // Passar händelsens villkor (on: { side, kind, by, resource, building, weather, near: mål, radius }) det som hände?
    matches(on, ctx) {
      if (!on || typeof on === 'string') return true;
      if (on.side && on.side !== 'any' && on.side !== ctx.side) return false;
      if (on.kind && on.kind !== 'any' && on.kind !== ctx.kind) return false;
      if (on.by && on.by !== 'any' && on.by !== ctx.bySide) return false;
      if (on.resource && on.resource !== ctx.resource) return false;
      if (on.building && on.building !== ctx.type) return false;
      if (on.weather && on.weather !== ctx.weather) return false;
      if (on.near) { const tile = CityBuilder.Actors?.resolve(on.near, null); if (!tile || Utils.distance(ctx.x - tile.x, ctx.y - tile.y) > (on.radius ?? 5)) return false; }
      return true;
    },
    // Vädret byts: ett meddelande (en jämförelse per steg)
    watchWeather() {
      const type = CityBuilder.Weather?.type;
      if (this.lastWeather !== type) { const first = this.lastWeather === undefined; this.lastWeather = type; if (!first) this.emit('weather', null, null, type); }
    },
    // Är händelsen redo? Inte redan körd (eller redo igen efter sin cooldown om den upprepas), och alla andra villkor (at, goal, end, when) gäller
    ready(event, i, chapter) {
      const Levels = CityBuilder.Levels;
      if (Levels.told('event:' + i)) {
        if (!event.repeat) return false;
        const last = Levels.progressRef().told['last:' + i] || 0;
        if (Levels.seconds - last < (event.cooldown ?? 30)) return false;
      }
      if (event.guide && CityBuilder.UI.guideDone()) { Levels.markTold('event:' + i); return false; }   // guide: true = hör till guiden och hoppas över av den som redan klarat den
      if (event.at === undefined && !event.goal && !event.when && !event.end && !event.on) return false;
      if (event.whileFog && Levels.told('fog:lifted')) { Levels.markTold('event:' + i); return false; }   // dimman har lyft: händelsen skulle komma för sent
      if (event.at !== undefined && Levels.seconds < event.at) return false;
      if (event.goal && !Levels.progress()[event.goal - 1]?.done) return false;
      if (event.end && !Levels.goalsDone()) return false;   // end: true = när alla mål är uppnådda; kapitlet väntar in händelsen (och dess scen) innan det avslutas
      return ![].concat(event.when || []).some(need => !this.reached(need, chapter));   // when kan vara flera villkor som alla ska gälla
    },
    trigger(event, i, ctx) {
      const Levels = CityBuilder.Levels;
      Levels.markTold('event:' + i);
      Levels.markTold('fired:' + i);   // utlöst på riktigt (en hoppad händelse är bara 'event:'), bara en utlöst händelse byter musik
      Levels.progressRef().told['last:' + i] = Math.max(.001, Levels.seconds);
      if (!ctx && [].concat(event.when || []).some(need => need.sees) && this.lastSeen && !this.lastSeen.removed) ctx = this.describe('seen', this.lastSeen);   // sees: det som syntes utlöste händelsen
      this.fire(event, ctx);
    },

    // Har villkoret slagit till? goal: n, left: k = målet n har högst k kvar; made: n = n har tillverkats eller samlats i kapitlet (oavsett vart varan tog vägen); annars har man amount, eller more fler än man startade med
    reached(need, chapter) {
      for (const key of Object.keys(need)) {   // triggers (systems/actors.js): { arrived: 'baker' }, { read: 'event-id' } ...
        const trigger = CityBuilder.Actors?.Triggers[key];
        if (trigger) return !!trigger(need[key], need, chapter);
      }
      if (need.sees) {   // vad som syntes sparas i lastSeen: det är "det som utlöste" händelsen (trigger)
        const found = need.sees === 'rival' ? World.buildings.find(building => Players.isAI(building.player) && CityBuilder.Vision.explored(Players.HUMAN, building.x + .5, building.y + .5))
          : need.sees === 'soldier' ? World.units.find(unit => !unit.removed && unit.definition.isSoldier && !unit.definition.isMonster && Players.isAI(unit.player) && CityBuilder.Vision.sees(Players.HUMAN, unit))
          : need.sees === 'monster' ? World.units.find(unit => !unit.removed && unit.definition.isMonster && CityBuilder.Vision.sees(Players.HUMAN, unit)) : null;
        this.lastSeen = found || null;
        return !!found;
      }   // sees: 'rival' = man har sett någon av fiendens byggnader (dimma eller inte)
      if (need.goal !== undefined) { const item = CityBuilder.Levels.progress()[need.goal - 1]; return !!item && item.have >= item.amount - (need.left || 0); }   // goal: n, left: k = målet med det numret har högst k kvar (följer målets egna siffror)
      if (need.made !== undefined) return CityBuilder.Levels.made(need.resource) >= need.made;
      return CityBuilder.Levels.have(need) >= this.needed(need, chapter);
    },

    // Hur mycket ett villkor kräver: amount, eller more = så mycket fler än man startade kapitlet med (som målen: start + more)
    needed(need, chapter) {
      return need.more === undefined ? need.amount : (CityBuilder.Levels.startingResourcesAt(chapter.number)[need.resource] || 0) + need.more;
    },

    update() {
      const chapter = this.chapter, Levels = CityBuilder.Levels, Weather = CityBuilder.Weather;
      // Kapitlets musik (chapter.music), annars standardmusiken; en händelse med music byter den (den senast utlösta i listan gäller, och den följer med i sparningen
      // eftersom händelsen är markerad som gjord). Läsvyns sidor har sin egen (scene).
      // Händelsernas music läggs ovanpå kapitlets, läge för läge och i den ordning de utlösts (en fil eller lista = lugn musik; null = tillbaka till standardmusiken).
      const modes = spec => spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : spec ? { calm: spec } : {};
      let music = chapter?.music;
      (chapter?.events || []).forEach((event, i) => {
        if (event.music === undefined || !CityBuilder.Levels.told('fired:' + i)) return;
        music = event.music === null ? null : { ...modes(music), ...modes(event.music) };
      });
      CityBuilder.Sound?.chapterMusic(music);
      if (!chapter) return;
      // Berättelsen i ordning: prolog (bara i kapitel 1), brev, dialog
      this.tell([
        ...(chapter.number === 1 ? this.once('prologue', [{ type: 'prose', lines: Config.story.prologue, music: Config.story.music?.prologue }, ...(Config.story.prologueDialogue ? [{ type: 'dialogue', lines: Config.story.prologueDialogue }] : [])]) : []),
        ...(chapter.letter ? this.once('letter', [{ type: 'letter', letter: chapter.letter }]) : []),
        ...(chapter.dialogue ? this.once('dialogue', [{ type: 'dialogue', lines: chapter.dialogue }]) : []),
        ...(chapter.number === 1 && this.guideAsked !== chapter && !CityBuilder.UI.guideDone() ? (this.guideAsked = chapter, [{ type: 'guide' }]) : []),   // en gång varje gång kapitlet startas (omladdning, nytt försök) tills guiden är klar
      ]);

      // En händelse sker en gång, när alla villkor den har slår till: at (sekunder in i kapitlet), goal (målet med det numret, räknat från 1, är klart) och when
      // (ett mål av samma slag som kapitlets: { resource | type, id, amount }, som att man har 50 järn eller har byggt en förtrollare)
      // En händelse med on väntar på ett meddelande från spelet (se emit nedan) och kollas inte här.
      this.watchWeather();
      if (this.indexed !== chapter || this.indexedCount !== (chapter.events?.length ?? 0)) this.index(chapter);
      const now = Levels.seconds, events = chapter.events || [];
      if (now >= this.nextSweep || now < this.nextSweep - 3) { this.nextSweep = now + 2; this.dirty.add('*'); }
      if (this.dirty.size) {   // villkor som väntar på ett meddelande
        const hit = new Set();
        for (const signal of this.dirty) for (const list of signal === '*' ? this.driven.values() : [this.driven.get(signal) || []]) for (const i of list) hit.add(i);
        this.dirty.clear();
        for (const i of [...hit].sort((a, b) => a - b)) if (this.ready(events[i], i, chapter)) this.trigger(events[i], i);
      }
      if (now >= this.nextTick || now < this.nextTick - 1) {   // villkor som måste kollas löpande
        this.nextTick = now + .5;
        let fired = false;
        for (const i of this.ticking) if (this.ready(events[i], i, chapter)) { this.trigger(events[i], i); fired = fired || !events[i].repeat; }
        if (fired) this.ticking = this.ticking.filter(i => events[i].repeat || !Levels.told('event:' + i));
      }

      this.waves(chapter);

      // Dimman ligger över kapitlet så länge Eye of Shades står. När den är borta lyfter dimman och rådgivarna lämnar.
      if (chapter.fog && Levels.told('fog:on') && !Levels.told('fog:lifted')) {
        if (this.eyeStands()) { Weather.type = 'fog'; Weather.left = Math.max(Weather.left, 30); }
        else {
          Levels.markTold('fog:lifted'); this.dirty.add('fog');
          Weather.type = 'clear'; Weather.left = 90;
          if (chapter.lifted) this.tell([{ type: 'dialogue', lines: chapter.lifted, part: 'lifted' }]);
        }
      }
      // Meteorer skonar vissa enhetstyper (Weather.harm läser definition.meteorProof)
      if (this.proofFor !== chapter.number) {
        this.proofFor = chapter.number;
        for (const kind of chapter.meteorProof || []) if (Config.units[kind]) Config.units[kind].meteorProof = true;
      }
    },
  };

  CityBuilder.Story = Story;
  (CityBuilder.Systems = CityBuilder.Systems || {}).story = { update: () => Story.update() };
})(window.CityBuilder);
