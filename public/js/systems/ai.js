/* Datorspelare. Varje spelare utom den mänskliga (Players.isAI) planerar och bygger med exakt samma regler som människan:
   Construction.build, samma kostnader, samma lager och bärare. Datorn har bara ett beslutsfattande i stället för en meny.

   Beslut: Config.ai.build är en ordnad lista med mål. Första målet som inte är uppnått löses med need(), som går bakåt
   genom kedjan: saknas en insats eller en byggresurs byggs först en byggnad som tillverkar den. Den valda byggnaden
   placeras sedan nära basen (eller nära resursen, för gatherers och gruvor). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players, Economy, Construction, Garrison, Utils } = CityBuilder;

  const WAIT = 'wait', BLOCKED = 'blocked';   // need() kan inte ge någon byggnad just nu: vänta på resurser / ingen plats
  const MAX_CHAIN = 6;                        // längsta kedjan av förkunskaper
  const BASE_RADIUS = 24;                     // hur långt från basen vanliga byggnader placeras
  const SITE_ATTEMPTS = 6;                    // så många platser provas (väg, kostnad) innan byggnaden anses omöjlig

  // Alla rutor inom MAX_SEARCH från (0, 0), närmast först: bygger spiralsökningar utan sortering vid varje beslut
  const MAX_SEARCH = 64;
  const OFFSETS = [];
  for (let dy = -MAX_SEARCH; dy <= MAX_SEARCH; dy++) for (let dx = -MAX_SEARCH; dx <= MAX_SEARCH; dx++) {
    const distance = Math.hypot(dx, dy);
    if (distance <= MAX_SEARCH) OFFSETS.push({ dx, dy, distance });
  }
  OFFSETS.sort((a, b) => a.distance - b.distance);

  const outputsOf = definition => {
    const job = definition.job;
    if (!job) return [];
    return job.outputs ? Object.keys(job.outputs) : job.outputResource ? [job.outputResource] : [];
  };

  // Det en byggnad behöver få levererat: insatser, utrustning, mat (en av alternativen) och för garnisoner soldatens utrustning
  const inputsOf = definition => {
    const job = definition.job;
    if (!job) return [];
    const inputs = [...Object.keys(job.inputs || {}), ...Object.keys(definition.requiredEquipment || {})];
    if (job.kind === 'garrison') inputs.push(...Object.keys(Config.units[job.trains[0]].training.inputs));
    for (const group of [].concat(job.eats || [])) inputs.push(group.any[0]);
    return inputs;
  };

  const costOf = definition => Utils.sumValues(definition.buildCost);

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

    level: () => CityBuilder.Levels?.current?.level ?? 1,

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
        const state = this.players.get(player) || { timer: 0, blocked: {}, short: {} };
        this.players.set(player, state);
        if ((state.timer -= deltaSeconds) > 0) continue;
        state.timer = this.interval();
        this.think(player, state);
      }
    },

    think(player, state) {
      this.current = player;
      state.starved = new Set();
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
      const attacking = this.attacking(player);
      this.setStance(player, attacking ? 'attack' : 'defend');

      const [base, every, cap] = Config.ai.maxUnderConstruction;
      if (census.unfinished >= Math.min(cap, base + Math.floor((this.level() - 1) / every))) return;
      if (attacking && this.advance(player, state, census)) return;

      const decide = (type, trail = []) => this.need(player, state, census, type, trail);
      for (const [type, target] of Config.ai.build) {
        if ((census.count[type] || 0) >= target) continue;
        const next = decide(type);
        if (next === WAIT) return;           // spara resurserna åt det viktigaste målet
        if (next !== BLOCKED) return this.place(player, state, next);
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

      const short = Object.keys(definition.buildCost).filter(resourceId => Economy.freeAmount(resourceId, player) < definition.buildCost[resourceId]);
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

    // Från en viss bana, och när armén är stor nog
    attacking(player) {
      const { fromLevel, soldiers: [base, extra, cap] } = Config.ai.attack, level = this.level();
      return level >= fromLevel && Garrison.soldiersOf(player) >= Math.min(cap, base + extra * (level - fromLevel));
    },

    setStance(player, stance) {
      for (const building of World.buildings) if (building.player === player && Garrison.isGarrison(building)) Garrison.setStance(building, stance);
    },

    // Närmaste fiendebyggnad till datorns bas
    enemyTarget(player) {
      const hq = World.hqOf(player);
      let best, bestDistance = Infinity;
      for (const building of World.buildings) {
        const distance = Math.hypot(building.x - hq.x, building.y - hq.y);
        if (Players.isHostile(player, building.player) && distance < bestDistance) { best = building; bestDistance = distance; }
      }
      return best;
    },

    // Bygger ett vakttorn närmare fienden tills någon garnison når den med sitt attackläge. Returnerar true om något byggdes (eller väntas på).
    advance(player, state, census) {
      const target = this.enemyTarget(player);
      if (!target) return false;
      const reach = Config.settings.military.attackRadius * .8;
      let from, fromDistance = Infinity;                       // egna färdiga garnisoner och torn är utgångspunkter
      for (const building of World.buildings) {
        const distance = Math.hypot(building.x - target.x, building.y - target.y);
        if (building.player === player && building.buildProgress >= 1 && distance < fromDistance) { from = building; fromDistance = distance; }
      }
      if (!from || fromDistance <= reach) return false;
      if ((census.count.guard_tower || 0) + (census.count.garrison || 0) >= Config.ai.attack.maxTowers) return false;

      const next = this.need(player, state, census, 'guard_tower', []);
      if (next === WAIT) return true;                          // spara resurserna åt utposten
      if (next === BLOCKED) return false;
      if (next !== 'guard_tower') { this.place(player, state, next); return true; }
      const step = Math.min(Config.settings.maxBuildDistance - 5, fromDistance - reach * .5);
      const point = { x: Math.round(from.x + (target.x - from.x) / fromDistance * step), y: Math.round(from.y + (target.y - from.y) / fromDistance * step) };
      this.place(player, state, next, this.free(point, Config.buildings.guard_tower, 8));
      return true;
    },

    // Placerar byggnaden på första platsen som fungerar (sites = kandidater, annars de vanliga)
    place(player, state, type, sites = this.sites(player, type)) {
      let attempts = 0;
      for (const [x, y] of sites) {
        if (++attempts > SITE_ATTEMPTS) break;
        const problem = Construction.build(type, x, y, player);
        if (!problem) return;
        if (problem === 'cost') return;        // någon annan hann före: försök igen nästa varv
      }
      state.blocked[type] = this.time + Config.ai.blockedSeconds;
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
      const terrain = definition.placeOnTerrain || 'grass';
      for (const { dx, dy, distance } of OFFSETS) {
        if (distance > limit) return;
        const x = centre.x + dx, y = centre.y + dy;
        if (World.getTile(x, y).terrainType !== terrain || World.buildingAt(x, y)) continue;
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
        if (tile.terrainType === terrain && tile.remainingAmount > 0) return { x: from.x + dx, y: from.y + dy };
      }
      return null;
    },
  };

  CityBuilder.AI = AI;
  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.ai = { update(deltaSeconds) { AI.update(deltaSeconds); } };
})(window.CityBuilder);
