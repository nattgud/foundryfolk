/* Datorspelare. Varje spelare utom den mänskliga (Players.isAI) planerar och bygger med exakt samma regler som människan:
   Construction.build, samma kostnader, samma lager och bärare, samma dimma. Datorn har bara ett beslutsfattande i stället för en meny.
   Den känner bara till platser den ser; hittar den ingen råvara bygger den utkikstorn (lookout) mot nya håll.

   Beslut: Config.ai.build är en ordnad lista med mål. Första målet som inte är uppnått löses med need(), som går bakåt
   genom kedjan: saknas en insats eller en byggresurs byggs först en byggnad som tillverkar den. Den valda byggnaden
   placeras sedan nära basen (eller nära resursen, för gatherers och gruvor). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players, Economy, Construction, Garrison, Utils, Vision } = CityBuilder;

  const UNSEEN = 'unseen';                    // place() hittade ingen plats att välja bland: råvaran syns inte (se lookout)
  const WAIT = 'wait', BLOCKED = 'blocked';   // need() kan inte ge någon byggnad just nu: vänta på resurser / ingen plats
  const MAX_CHAIN = 6;                        // längsta kedjan av förkunskaper
  const BASE_RADIUS = 24;                     // hur långt från basen vanliga byggnader placeras
  const SITE_ATTEMPTS = 6;                    // så många platser provas (väg, kostnad) innan byggnaden anses omöjlig

  // Alla rutor inom MAX_SEARCH från (0, 0), närmast först: bygger spiralsökningar utan sortering vid varje beslut
  const MAX_SEARCH = 64;
  const OFFSETS = [];
  for (let dy = -MAX_SEARCH; dy <= MAX_SEARCH; dy++) for (let dx = -MAX_SEARCH; dx <= MAX_SEARCH; dx++) {
    const distance = Utils.distance(dx, dy);
    if (distance <= MAX_SEARCH) OFFSETS.push({ dx, dy, distance });
  }
  OFFSETS.sort((a, b) => a.distance - b.distance);

  const outputsOf = definition => {
    const job = definition.job;
    if (!job) return [];
    return (job.choices || [job]).flatMap(recipe => recipe.outputs ? Object.keys(recipe.outputs) : recipe.outputResource ? [recipe.outputResource] : []);
  };

  // Det en byggnad behöver få levererat: insatser, utrustning, mat (en av alternativen) och för garnisoner soldatens utrustning
  const inputsOf = definition => {
    const job = definition.job;
    if (!job) return [];
    const inputs = [...Object.keys((job.choices?.[0] ?? job).inputs || {}), ...Object.keys(definition.requiredEquipment || {})];
    if (job.kind === 'garrison') inputs.push(...Object.keys(Config.units[job.trains[0]].training.inputs));
    for (const group of [].concat(job.eats || [])) inputs.push(group.any[0]);
    return inputs;
  };

  const costOf = definition => Utils.sumValues(definition.buildCost);

  const gameSeconds = () => CityBuilder.Levels?.seconds ?? 0;   // speltid på banan (sparas, så anfallstiden gäller även efter omladdning)

  const AI = {
    players: new Map(),      // spelare -> { timer, blocked: { byggnadstyp: tid då den får provas igen }, short: { resurs: { since, seen } } }
    time: 0,
    producers: {},           // resurs -> byggnadstyp som tillverkar den billigast (byggs vid första användningen)

    // Billigaste byggnaden som tillverkar resursen (eller undefined)
    producerOf(resourceId) {
      if (!(resourceId in this.producers)) {
        let best;
        for (const [type, definition] of Object.entries(Config.buildings)) {
          if (!outputsOf(definition).includes(resourceId) || definition.isWinBuilding) continue;
          if (!best || costOf(definition) < costOf(Config.buildings[best])) best = type;
        }
        this.producers[resourceId] = best;
      }
      return this.producers[resourceId];
    },

    // Datorns styrka som en banas nummer. På en egen bana har varje datorspelare sin egen (Levels.current.aiLevels). Gäller AI.current.
    level: () => CityBuilder.Levels?.current?.aiLevels?.[AI.current] ?? CityBuilder.Levels?.current?.level ?? 1,

    // Tid mellan besluten: långsam på de första banorna och en aning snabbare för varje bana
    interval() {
      const { startSeconds, perLevel, minSeconds } = Config.ai.pace;
      return Math.max(minSeconds, startSeconds * Math.pow(perLevel, this.level() - 1));
    },

    supplied: resourceId => Economy.freeAmount(resourceId, AI.current) > 0,   // finns resursen i lagret just nu?

    update(deltaSeconds) {
      this.time += deltaSeconds;
      for (const player of Players.active) {
        if (!Players.isAI(player) || !World.hqOf(player)) continue;
        let state = this.players.get(player);
        if (!state) {   // slumpad starttid (seedad), så att alla datorspelare inte tänker i samma steg
          this.current = player;
          this.players.set(player, state = { timer: Utils.random() * this.interval(), blocked: {}, short: {} });
        }
        if ((state.timer -= deltaSeconds) > 0) continue;
        this.current = player;
        state.timer = this.interval();
        this.think(player, state);
      }
    },

    think(player, state) {
      this.current = player;
      state.starved = new Set();
      this.observe(player, state);
      this.decide(player, state);
      this.pauseConsumers(player, state.starved);
    },

    // Som en människa: saknas en byggresurs pausas de byggnader som förbrukar den (annars hinner den aldrig samlas i lagret)
    pauseConsumers(player, starved) {
      for (const building of World.buildings) {
        if (building.player !== player || !building.definition.job) continue;
        const consumes = inputsOf(building.definition).some(resourceId => starved.has(resourceId));
        if (consumes && !building.paused) { building.paused = true; building.pausedByAI = true; }
        else if (!consumes && building.pausedByAI) { building.paused = false; building.pausedByAI = false; }
      }
    },

    decide(player, state) {
      const census = this.census(player);
      const ready = this.ready(player), target = ready && this.enemyTarget(player, state);
      const attacking = !!target && gameSeconds() >= Config.ai.attack.afterSeconds;   // anfaller först efter en tid, och bara om den sett något av motståndaren
      this.setStance(player, attacking ? 'attack' : 'defend');

      const [base, every, cap] = Config.ai.maxUnderConstruction;
      if (census.unfinished >= Math.min(cap, base + Math.floor((this.level() - 1) / every))) return;
      if (ready && (!target ? this.explore(player, state, census) : attacking && this.advance(player, state, census))) return;   // spaning går före anfallstiden, utposter mot fienden inte

      const decide = (type, trail = []) => this.need(player, state, census, type, trail);
      for (const [type, target] of Config.ai.build) {
        if ((census.count[type] || 0) >= target) continue;
        const next = decide(type);
        if (next === WAIT) return;           // spara resurserna åt det viktigaste målet
        if (next === BLOCKED) continue;
        if (this.place(player, state, next) === UNSEEN) this.lookout(player, state, census);
        return;
      }
    },

    // Vad spelaren har: antal per typ (även ofärdiga), vad som tillverkas, antal ofärdiga byggnader
    census(player) {
      const census = { count: {}, produces: new Set(), unfinished: 0 };
      for (const building of World.buildings) {
        if (building.player !== player) continue;
        census.count[building.type] = (census.count[building.type] || 0) + 1;
        for (const resourceId of outputsOf(building.definition)) census.produces.add(resourceId);
        if (building.buildProgress < 1) census.unfinished++;
      }
      return census;
    },

    // Vilken byggnad ska byggas för att 'type' ska kunna byggas? type själv, en förkunskap, WAIT eller BLOCKED.
    need(player, state, census, type, trail) {
      if (trail.length >= MAX_CHAIN || trail.includes(type) || (state.blocked[type] || 0) > this.time) return BLOCKED;
      const definition = Config.buildings[type], path = [...trail, type];

      const missing = resourceId => !census.produces.has(resourceId) && !Economy.totalAmount(resourceId, player);
      const first = resources => {             // första saknade resursen som går att tillverka: bygg dess producent
        for (const resourceId of resources) {
          const producer = this.producerOf(resourceId);
          if (producer && missing(resourceId)) return this.need(player, state, census, producer, path);
        }
      };

      const prerequisite = first(inputsOf(definition));
      if (prerequisite) return prerequisite;

      const pending = Construction.pendingNeed(player);   // det pågående byggen redan väntar på räknas som upptaget
      const short = Object.keys(definition.buildCost).filter(resourceId => Economy.freeAmount(resourceId, player) - (pending[resourceId] || 0) < definition.buildCost[resourceId]);
      if (!short.length) return type;
      const producer = first(short) ?? this.expand(player, state, census, short, path);
      if (producer) return producer;
      short.forEach(resourceId => state.starved.add(resourceId));
      return WAIT;
    },

    // Producenterna finns men resursen tar slut: räcker det inte efter en stund byggs ytterligare en producent
    expand(player, state, census, short, path) {
      const resourceId = short.find(id => this.producerOf(id));
      if (!resourceId) return;
      const record = state.short[resourceId] = state.short[resourceId] || { since: this.time, seen: this.time };
      if (this.time - record.seen > Config.ai.patienceSeconds) record.since = this.time; // förra bristen är över: börja om
      record.seen = this.time;
      if (this.time - record.since < Config.ai.patienceSeconds) return;
      record.since = this.time;
      const producer = this.bottleneck(resourceId);
      if ((census.count[producer] || 0) >= Config.ai.maxPerType) return;
      return this.need(player, state, census, producer, path);
    },

    // Producenten som begränsar tillverkningen av resursen: saknas en insats (slut i lagret) är det den insatsens producent
    bottleneck(resourceId, depth = 0) {
      const producer = this.producerOf(resourceId);
      if (depth < MAX_CHAIN) {
        for (const input of inputsOf(Config.buildings[producer])) {
          if (this.producerOf(input) && this.producerOf(input) !== producer && !this.supplied(input)) return this.bottleneck(input, depth + 1);
        }
      }
      return producer;
    },

    // ---- Anfall: samma sätt som spelaren (utposter av vakttorn nära fienden, sedan attackläge) --------

    // Redo för krig: från en viss bana, och när armén är stor nog
    ready(player) {
      const { fromLevel, soldiers: [base, extra, cap] } = Config.ai.attack, level = this.level();
      return level >= fromLevel && Garrison.soldiersOf(player) >= Math.min(cap, base + extra * (level - fromLevel));
    },

    setStance(player, stance) {
      for (const building of World.buildings) if (building.player === player && Garrison.isGarrison(building)) Garrison.setStance(building, stance);
    },

    // Datorn har fog of war som spelaren: den vet bara det den sett. Här läggs sådant på minnet: Vision.knows kommer ihåg sedda
    // fiendebyggnader, och state.lead blir platsen närmast basen där något av motståndaren syns (en enhet eller byggnad), så att
    // datorn vet ungefär åt vilket håll motståndaren finns även innan någon bas upptäckts.
    observe(player, state) {
      const hq = World.hqOf(player);
      let nearest = Infinity;
      for (const thing of [...World.buildings, ...World.units]) {
        if (!Players.isHostile(player, thing.player) || !Vision.knows(player, thing)) continue;
        const half = thing.buildProgress !== undefined ? .5 : 0;
        const distance = Utils.distance(thing.x + half - hq.x, thing.y + half - hq.y);
        if (distance < nearest) { nearest = distance; state.lead = { x: Math.round(thing.x), y: Math.round(thing.y) }; }
      }
    },

    // Närmaste fiendebyggnad som datorn känner till, annars platsen där den senast stötte på motståndaren, annars undefined
    enemyTarget(player, state) {
      const hq = World.hqOf(player);
      let best, bestDistance = Infinity;
      for (const building of Vision.memory.get(player) || []) {
        const distance = Utils.distance(building.x - hq.x, building.y - hq.y);
        if (distance < bestDistance) { best = building; bestDistance = distance; }
      }
      return best ?? state.lead;
    },

    // Bygger ett vakttorn närmare fienden tills någon garnison når den med sitt attackläge. Vet datorn inte var fienden finns bygger den
    // utkikstorn utåt (explore). Returnerar true om något byggdes (eller väntas på).
    advance(player, state, census) {
      const target = this.enemyTarget(player, state);
      if (!target) return this.explore(player, state, census);
      const known = target.buildProgress !== undefined;        // en känd byggnad kan anfallas på långt håll, en ledtråd måste datorn komma nära
      const reach = known ? Config.settings.military.attackRadius * .8 : Config.buildings.guard_tower.vision * .7;
      let from, fromDistance = Infinity, garrisonDistance = Infinity;   // närmaste egna byggnad är utgångspunkt, och soldaterna bor i garnisoner
      for (const building of World.buildings) {
        if (building.player !== player || building.buildProgress < 1) continue;
        const distance = Utils.distance(building.x - target.x, building.y - target.y);
        if (distance < fromDistance) { from = building; fromDistance = distance; }
        if (distance < garrisonDistance && Garrison.isGarrison(building)) garrisonDistance = distance;
      }
      if (!from || (known ? garrisonDistance : fromDistance) <= reach) return false;
      if ((census.count.guard_tower || 0) + (census.count.garrison || 0) >= Config.ai.attack.maxTowers) return false;

      const next = this.need(player, state, census, 'guard_tower', []);
      if (next === WAIT) return true;                          // spara resurserna åt utposten
      if (next === BLOCKED) return false;
      if (next !== 'guard_tower') { this.place(player, state, next); return true; }
      const step = Math.min(Config.settings.maxBuildDistance - 5, this.sightOf(from) - 2, fromDistance - reach * .5);
      const point = { x: Math.round(from.x + (target.x - from.x) / fromDistance * step), y: Math.round(from.y + (target.y - from.y) / fromDistance * step) };
      this.place(player, state, next, this.free(point, Config.buildings.guard_tower, 8));
      return true;
    },

    // Spaning: datorn vet att motståndaren bor ungefär rivalDistance från den (som en spelare som läst banans beskrivning), så den bygger
    // utkikstorn i en ring på det avståndet. Varje torn står inom byggräckvidd från det förra och ser så långt att ringen täcker hela
    // bandet. Går en plats inte att bygga på hoppas den över. Hittas något av motståndaren tar advance över.
    explore(player, state, census) {
      const { step, maxScouts } = Config.ai.explore, hq = World.hqOf(player), [near, far] = Config.world.rivalDistance, ring = (near + far) / 2;
      if ((census.count.watchtower || 0) >= maxScouts) return false;
      if (World.buildings.some(building => building.player === player && building.type === 'watchtower' && building.buildProgress < 1)) return true;   // vänta på tornet
      const scouting = state.scouting ??= { angle: Utils.hash(player, 21, Config.world.seed) * 2 * Math.PI };

      const next = this.need(player, state, census, 'watchtower', []);
      if (next === WAIT) return true;
      if (next === BLOCKED) { scouting.angle += step / ring; return false; }   // platsen gick inte att bygga på: hoppa över den
      if (next !== 'watchtower') { this.place(player, state, next); return true; }

      const goal = { x: hq.x + Math.cos(scouting.angle) * ring, y: hq.y + Math.sin(scouting.angle) * ring };
      let from, fromDistance = Infinity;
      for (const building of World.buildings) {
        const distance = Utils.distance(building.x - goal.x, building.y - goal.y);
        if (building.player === player && building.buildProgress >= 1 && distance < fromDistance) { from = building; fromDistance = distance; }
      }
      const stride = Math.min(step, this.sightOf(from) - 2);                      // längre än tornet ser går det inte att bygga
      const reached = fromDistance <= stride;                                    // inom räckhåll: bygg på ringen, annars ett steg dit
      const point = reached ? goal : { x: from.x + (goal.x - from.x) / fromDistance * stride, y: from.y + (goal.y - from.y) / fromDistance * stride };
      this.place(player, state, next, this.free({ x: Math.round(point.x), y: Math.round(point.y) }, Config.buildings.watchtower, 8));
      if (reached) scouting.angle += step / ring;
      return true;
    },

    // Så långt (rutor) en egen byggnad ser: nya byggen måste ligga inom synhåll
    sightOf: building => building.definition.vision ?? Config.settings.vision.building,

    // Placerar byggnaden på första platsen som fungerar (sites = kandidater, annars de vanliga)
    place(player, state, type, sites = this.sites(player, type)) {
      let attempts = 0;
      for (const [x, y] of sites) {
        if (++attempts > SITE_ATTEMPTS) break;
        const problem = Construction.build(type, x, y, player);
        if (!problem) return true;
        if (problem === 'cost') return;        // någon annan hann före: försök igen nästa varv
      }
      if (!attempts && this.needsSight(type)) { state.blocked[type] = this.time + Config.ai.sightRetrySeconds; return UNSEEN; }
      state.blocked[type] = this.time + Config.ai.blockedSeconds;
    },

    // Byggnader som behöver en råvara på marken (gruvor, samlare): platsen måste synas för att den ska finnas för datorn
    needsSight(type) {
      const definition = Config.buildings[type];
      return !!(definition.placeOnTerrain || definition.job?.sourceTerrain);
    },

    // Datorn ser bara det den har synfält över. Syns ingen råvara bygger den ett utkikstorn på det synliga marken så långt mot ett nytt håll som
    // möjligt (varje torn ser 30 rutor), och byter håll för varje torn, så att basens omgivning avsöks varv efter varv.
    lookout(player, state, census) {
      if ((state.lookouts || 0) >= Config.ai.lookouts || (census.count.watchtower || 0) >= Config.ai.explore.maxScouts) return;
      if (World.buildings.some(building => building.player === player && building.type === 'watchtower' && building.buildProgress < 1)) return;   // vänta på tornet
      const next = this.need(player, state, census, 'watchtower', []);
      if (next === WAIT || next === BLOCKED) return;
      if (next !== 'watchtower') return this.place(player, state, next);
      const look = state.look ??= { angle: Utils.hash(player, 22, Config.world.seed) * 2 * Math.PI };
      const hq = World.hqOf(player), cos = Math.cos(look.angle), sin = Math.sin(look.angle), sites = [];
      for (const [x, y] of this.free(hq, Config.buildings.watchtower, Config.settings.maxBuildDistance - 5)) sites.push({ x, y, score: (x - hq.x) * cos + (y - hq.y) * sin });
      sites.sort((a, b) => b.score - a.score);
      if (this.place(player, state, next, sites.map(({ x, y }) => [x, y])) !== true) return;
      look.angle += Math.PI / 3;
      state.lookouts = (state.lookouts || 0) + 1;
    },

    // Kandidatplatser för en byggnad, bästa först
    * sites(player, type) {
      const hq = World.hqOf(player), definition = Config.buildings[type], job = definition.job;
      let yielded = 0;
      const emit = function* (tiles) { for (const tile of tiles) { yield tile; if (++yielded >= SITE_ATTEMPTS) return; } };

      if (definition.placeOnTerrain) {                       // gruvor: på själva malmen
        yield* emit(this.free(hq, definition, Config.ai.resourceRadius));
      } else if (job?.sourceTerrain) {                       // gatherers: nära närmaste råvara
        const node = this.nearestNode(hq, job.sourceTerrain);
        if (node) yield* emit(this.free(node, definition, Math.max(2, job.searchRadius - 3)));
      } else {
        yield* emit(this.free(hq, definition, BASE_RADIUS));
      }
    },

    // Lediga byggplatser (närmast 'centre' först) på byggnadens terrängtyp, med minst en tom ruta till andra byggnader
    * free(centre, definition, limit) {
      for (const { dx, dy, distance } of OFFSETS) {
        if (distance > limit) return;
        const x = centre.x + dx, y = centre.y + dy;
        if (!World.buildsOn(definition, World.getTile(x, y).terrainType) || World.buildingAt(x, y) || !Vision.visible(AI.current, x, y)) continue;   // bara platser datorn ser
        let crowded = false;
        for (let ny = -1; ny <= 1 && !crowded; ny++) for (let nx = -1; nx <= 1; nx++) if (World.buildingAt(x + nx, y + ny)) { crowded = true; break; }
        if (!crowded) yield [x, y];
      }
    },

    // Närmaste ruta med råvaran (inom resourceRadius från basen)
    nearestNode(from, terrain) {
      for (const { dx, dy, distance } of OFFSETS) {
        if (distance > Config.ai.resourceRadius) return null;
        const tile = World.getTile(from.x + dx, from.y + dy);
        if (tile.terrainType === terrain && tile.remainingAmount > 0 && Vision.visible(AI.current, from.x + dx, from.y + dy)) return { x: from.x + dx, y: from.y + dy };   // bara råvaror datorn ser
      }
      return null;
    },
  };

  CityBuilder.AI = AI;
  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.ai = { update(deltaSeconds) { AI.update(deltaSeconds); } };
})(window.CityBuilder);
