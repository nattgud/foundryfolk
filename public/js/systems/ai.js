/* Datorspelare. Varje spelare utom den mänskliga (Players.isAI) planerar och bygger med exakt samma regler som människan:
   Construction.build, samma kostnader, samma lager och bärare, samma dimma. Datorn har bara ett beslutsfattande i stället för en meny.
   Den känner bara till platser den ser; hittar den ingen råvara bygger den utkikstorn (lookout) mot nya håll.

   Beslut (decide): underhåll (regulate: pausa överproduktion, riv tömda samlare), lager, flaskhalsar (survey + relieve: byggnader som väntar
   på en vara), planen (Config.ai.plan) och tillväxten (Config.ai.grow). Varje mål löses med need(), som går bakåt genom kedjan: saknas
   en insats eller en byggresurs byggs först en byggnad som tillverkar den. Den valda byggnaden placeras sedan nära basen (eller nära
   resursen, för gatherers och gruvor). Se config/ai.js för hela resonemanget. */
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
    const inputs = [...Object.keys(Config.firstInputs(job.choices?.[0] ?? job)), ...Object.keys(definition.requiredEquipment || {})];
    if (job.kind === 'garrison') inputs.push(...Object.keys(Config.units[job.defaultTrain ?? job.trains[0]].training.inputs));
    for (const group of [].concat(job.eats || [])) inputs.push(group.any[0]);
    return inputs;
  };

  const costOf = definition => Utils.sumValues(definition.buildCost);
  const WAR = new Set(['guard_tower', 'garrison', 'watchtower']);

  // Varornas namn i statustexterna ("Missing: Iron Ore", se Behaviors.eatStatus) -> resurs
  const RESOURCE_BY_NAME = {};
  for (const [id, resource] of Object.entries(Config.resources)) RESOURCE_BY_NAME[resource.name] = id;

  // Det en byggnad tillverkar i första hand (biprodukter som aska och tjära räknas inte): första varan i varje recept
  const primaryOutputs = definition => {
    const job = definition.job;
    if (!job) return [];
    return (job.choices || [job]).map(recipe => recipe.outputs ? Object.keys(recipe.outputs)[0] : recipe.outputResource).filter(Boolean);
  };

  // Hur många per minut en byggnad tillverkar / förbrukar av en vara när allt fungerar (medel över recepten). Samlare räknas med en promenad
  // på 12 s (jägare 60 s) per omgång. Soldatutbildning (garnisoner) förbrukar sin utrustning på utbildningstiden.
  const rateOf = (definition, resourceId, kind) => {
    const job = definition.job;
    if (!job) return 0;
    if (job.kind === 'garrison') {
      if (kind !== 'in') return 0;
      const trains = job.aiTrains ?? job.trains;   // datorn tränar bara dessa (de nya billiga nivåerna är för spelaren)
      return trains.reduce((sum, id) => { const training = Config.units[id].training; return sum + (training?.inputs?.[resourceId] || 0) / (training?.seconds || 20) * 60; }, 0) / trains.length;
    }
    const recipes = job.choices || [job];
    let total = 0;
    for (const recipe of recipes) {
      const seconds = recipe.craftSeconds ?? job.craftSeconds ?? 10, walk = job.kind === 'gather' ? (job.sourceUnit ? 60 : 12) : 0;
      if (kind === 'out') total += (recipe.outputs ? (Object.keys(recipe.outputs)[0] === resourceId ? recipe.outputs[resourceId] : 0) : recipe.outputResource === resourceId ? 1 : 0) / (seconds + (recipe.workSeconds ?? 0) + walk) * 60;
      else total += (recipe.inputs?.[resourceId] || 0) / (seconds + (recipe.workSeconds ?? 0)) * 60;
    }
    return total / recipes.length;
  };

  // Verktyg som byggnader kräver, och soldaternas utrustning: de har egna lagertak (Config.ai.limits)
  const EQUIPMENT = new Set(Object.values(Config.buildings).flatMap(definition => Object.keys(definition.requiredEquipment || {})));
  const GEAR = new Set(Object.values(Config.units).filter(unit => !unit.unique).flatMap(unit => Object.keys(unit.training?.inputs || {})));

  const gameSeconds = () => CityBuilder.Levels?.seconds ?? 0;   // speltid på banan (sparas, så anfallstiden gäller även efter omladdning)

  const AI = {
    players: new Map(),      // spelare -> { timer, blocked: { byggnadstyp: tid då den får provas igen }, short: { resurs: { since, seen } } }
    time: 0,
    over: new WeakSet(),     // byggnader som pausats för att deras vara fyllde lagret (startar igen först när lagret gått ner, se regulate)
    watch: new WeakMap(),    // ofärdig byggnad -> { progress, since }: hur länge bygget stått still (se reclaim)
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
          this.players.set(player, state = { timer: Utils.random() * this.interval(), blocked: {}, short: {}, relieved: {} });
        }
        this.moveFlag(player, state);
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
      this.regulate(player, state);
    },

    // Som en människa: saknas en byggresurs pausas de byggnader som förbrukar den (annars hinner den aldrig samlas i lagret), och
    // de som tillverkar mer än lagret rymmer pausas tills det går åt (annars äter t.ex. sågverken upp träet som bygget väntar på).
    // pausedByAI skiljer datorns pauser från andra.
    regulate(player, state) {
      const { stored } = Economy.stats(player), { high, resume } = Config.ai.storage;
      for (const building of World.buildings) {
        if (building.player !== player || !building.definition.job || building.buildProgress < 1) continue;
        if (building.paused && !building.pausedByAI) continue;
        const consumes = inputsOf(building.definition).some(resourceId => state.starved.has(resourceId));
        const outputs = primaryOutputs(building.definition);
        const share = this.over.has(building) ? resume : high;    // en redan pausad byggnad startar först när lagret gått ner en bit
        const overstocked = outputs.length > 0 && outputs.every(resourceId => (stored[resourceId] || 0) >= this.limit(resourceId, player) * (share / high));
        if (overstocked) this.over.add(building); else this.over.delete(building);
        const pause = consumes || overstocked;
        if (pause && !building.paused) { building.paused = true; building.pausedByAI = true; }
        else if (!pause && building.pausedByAI) { building.paused = false; building.pausedByAI = false; }
      }
    },

    // Högsta lager datorn vill ha av en vara: en andel av taket, och för verktyg, utrustning m.m. ett eget tak (Config.ai.limits)
    limit(resourceId, player) {
      const { limits, storage } = Config.ai;
      let own = limits[resourceId] ?? (EQUIPMENT.has(resourceId) ? limits.equipment : GEAR.has(resourceId) ? limits.gear : Infinity);
      if (Array.isArray(own)) own = own[0] + own[1] * this.sizeOf(player);   // [grund, per byggnad]: behovet växer med staden
      return Math.max(1, Math.min(own, Economy.capacity(resourceId, player) * storage.high));
    },

    decide(player, state) {
      const census = this.census(player);
      const ready = this.ready(player), target = ready && this.enemyTarget(player, state);
      const attacking = !!target && gameSeconds() >= Config.ai.attack.afterSeconds;   // anfaller först efter en tid, och bara om den sett något av motståndaren
      this.setStance(player, attacking ? 'attack' : 'defend');
      state.flagGoal = attacking ? { x: target.x, y: target.y } : null;

      const view = this.survey(player, state, census);
      this.reclaim(player, state, census);
      this.retire(player, state, view);

      const [base, every, cap] = Config.ai.maxUnderConstruction;
      if (census.unfinished >= Math.min(cap, base + Math.floor((this.level() - 1) / every))) return;
      if (ready && (!target ? this.explore(player, state, census) : attacking && this.advance(player, state, census))) return;   // spaning går före anfallstiden, utposter mot fienden inte

      // Bärarna hinner inte med: fler producenter hjälper inte. Då byggs bara lager (som ger fler bärare och kortare vägar) och krigsbyggnader.
      const jammed = view.carriers >= 20 && view.idle / view.carriers < Config.ai.jammed;
      if (this.expandStorage(player, state, census)) return;
      state.turn = (state.turn || 0) + 1;
      const first = state.turn % 2 ? [this.relieve, this.plan] : [this.plan, this.relieve];   // flaskhalsar och planen turas om, så att ingen av dem svälter den andra
      for (const step of first) if (step.call(this, player, state, census, view, jammed)) return;
      this.grow(player, state, census, jammed);
    },

    // Försöker bygga 'type' (med det den kräver). Returnerar true om något byggdes eller om datorn sparar resurser åt det, false om det inte går nu.
    pursue(player, state, census, type) {
      const next = this.need(player, state, census, type, []);
      if (next === WAIT) return true;          // spara resurserna åt det viktigaste målet
      if (next === BLOCKED) return false;
      if (this.place(player, state, next) === UNSEEN) this.lookout(player, state, census);
      return true;
    },

    // ---- Det datorn ser: vad byggnaderna saknar (samma signaler som spelaren har i byggnadspanelen) ---------------

    // types: byggnadstyp -> { count, starved (summa av andel av tiden som står och väntar), missing: { vara(r): andel } }
    // pain: vara(r) -> hur många byggnader (heltidsekvivalenter) som väntar på den. Flera alternativ skrivs "meat|fish|bread|meal".
    // blocked: hur många byggnader som står stilla för att lagret är fullt. exhausted: samlare som inte hittar något att samla.
    survey(player, state, census) {
      const view = { types: {}, pain: {}, blocked: 0, waiting: 0, jobs: 0, carriers: 0, idle: 0, exhausted: [] };
      for (const unit of World.units) if (unit.player === player && unit.definition.isHauler) { view.carriers++; if (CityBuilder.Logistics.isIdle(unit)) view.idle++; }
      for (const building of World.buildings) {
        if (building.player !== player || !building.definition.job || building.buildProgress < 1) continue;
        const entry = view.types[building.type] ||= { count: 0, starved: 0, missing: {} };
        entry.count++;
        view.jobs++;
        const summary = building.eff?.summary;
        if (!summary || building.paused) continue;
        for (const [reason, fraction] of summary.reasons) {
          if (reason.startsWith('Missing: ')) {
            for (const name of reason.slice(9).split(', ')) {
              const ids = name.split(' / ').map(part => RESOURCE_BY_NAME[part]).filter(Boolean);
              if (!ids.length) continue;
              const key = ids.join('|');
              entry.missing[key] = (entry.missing[key] || 0) + fraction;
              view.pain[key] = (view.pain[key] || 0) + fraction;
            }
            entry.starved += fraction;
          } else if (reason === 'Central storage full' || reason === 'Local stock full') { view.blocked += fraction; if (reason === 'Local stock full') view.waiting += fraction; }
          else if ((reason === 'No resources' || reason === 'No animals in range') && fraction >= .7 && building.eff.time >= 180 && building.definition.job.kind === 'gather') view.exhausted.push(building);
        }
      }
      // Byggplatser som väntar på varor som inte finns i lagret
      for (const site of World.buildings) {
        if (site.player !== player || !site.needsMaterials || site.buildProgress >= 1) continue;
        for (const resourceId in Construction.missing(site)) if (Economy.freeAmount(resourceId, player) <= 0) view.pain[resourceId] = (view.pain[resourceId] || 0) + .5;
      }
      return view;
    },

    // Ett konkret val bland alternativ (kött, fisk, bröd, måltid): den vars producent finns i minst antal, helst i den ordning de står
    pick(ids, state, census) {
      for (const [id, most] of Config.ai.food) {   // maten följer Config.ai.food: först det som är billigt att börja med, sedan det som går att bygga ut
        const producer = ids.includes(id) && this.producerOf(id);
        if (producer && (census.count[producer] || 0) < most && (state.blocked[producer] || 0) <= this.time) return id;
      }
      let best, bestScore = Infinity;
      ids.forEach((id, i) => {
        const producer = this.producerOf(id);
        if (!producer) return;
        const score = (census.count[producer] || 0) * 4 + i * 3 + ((state.blocked[producer] || 0) > this.time ? 100 : 0);
        if (score < bestScore) { best = id; bestScore = score; }
      });
      return best ?? ids[0];
    },

    // Grundorsaken: väntar byggnader på järn men gruvan själv väntar på mat är det maten som saknas
    root(resourceId, view, state, census, depth = 0) {
      const producer = this.producerOf(resourceId), entry = producer && view.types[producer];
      if (depth < MAX_CHAIN && entry && entry.starved / entry.count >= .5) {
        const worst = Object.entries(entry.missing).sort((a, b) => b[1] - a[1])[0];
        if (worst) return this.root(this.pick(worst[0].split('|'), state, census), view, state, census, depth + 1);
      }
      return resourceId;
    },

    // Flaskhals: bygger en producent av den vara som flest byggnader väntar på. Returnerar true om något gjordes (eller sparas till).
    relieve(player, state, census, view, jammed) {
      if (jammed) return false;
      const { threshold, cooldown } = Config.ai.pain;
      for (const [key, weight] of Object.entries(view.pain).sort((a, b) => b[1] - a[1])) {
        if (weight < threshold) break;
        const resourceId = this.root(this.pick(key.split('|'), state, census), view, state, census), producer = this.producerOf(resourceId);
        if (!producer || this.time - (state.relieved[resourceId] ?? -1e9) < cooldown) continue;
        if (Economy.freeAmount(resourceId, player) >= Config.ai.pain.stock) continue;   // finns i lagret: det är bärarna som inte hinner, fler producenter hjälper inte
        if (census.building[producer] || (census.count[producer] || 0) >= this.cap(producer, census)) continue;   // redan på väg, eller nog
        const next = this.need(player, state, census, producer, []);
        if (next === BLOCKED) { state.blocked[producer] ||= this.time + Config.ai.blockedSeconds; continue; }   // går inte att bygga nu: pick() väljer nästa sorts mat
        state.relieved[resourceId] = this.time;
        if (next === WAIT) return true;
        if (this.place(player, state, next) === UNSEEN) this.lookout(player, state, census);
        return true;
      }
      return false;
    },

    // Lager: (1) när det börjar bli fullt, (2) när en producent ligger för långt från närmaste lager (alla bärare går då långa vägar och varorna
    // hinner inte fram): ett lager bredvid den. Varje lager ger också fler bärare.
    expandStorage(player, state, census) {
      if (census.building.warehouse || census.building.large_warehouse || census.building.great_depot) return false;
      const { stored } = Economy.stats(player), { build } = Config.ai.storage, { far } = Config.ai.warehouses;
      const storages = (census.count.warehouse || 0) + (census.count.large_warehouse || 0) + (census.count.great_depot || 0);
      if (storages >= Config.ai.warehouses.base + census.total / Config.ai.warehouses.perBuildings) return false;   // tillräckligt många för stadens storlek
      const full = Config.ai.storage.watch.some(resourceId => stored[resourceId] >= Economy.capacity(resourceId, player) * build);   // bara varor datorn behöver (inte aska och tjära som ingen förbrukar)
      let remote, remoteDistance = far;
      if (this.time >= (state.storageAt || 0)) {
        for (const building of World.buildings) {
          if (building.player !== player || building.buildProgress < 1 || !building.definition.job) continue;
          const distance = Math.min(...Economy.storages(player).map(storage => Utils.manhattanDistance(storage, building)));
          if (distance > remoteDistance) { remote = building; remoteDistance = distance; }
        }
      }
      if (!full && !remote) return false;
      const type = storages >= 3 && !remote && this.need(player, state, census, 'large_warehouse', []) === 'large_warehouse' ? 'large_warehouse' : 'warehouse';
      if (!remote) return this.pursue(player, state, census, type);
      const next = this.need(player, state, census, type, []);
      if (next === WAIT) return false;                   // lagret är inte det viktigaste: spara inte resurserna åt det
      if (next === BLOCKED) return false;
      if (next !== type) return this.place(player, state, next), true;
      state.storageAt = this.time + Config.ai.warehouses.cooldown;
      this.place(player, state, type, this.free(remote, Config.buildings[type], 7));
      return true;
    },

    // Planen: första målet som inte nått sitt antal
    plan(player, state, census, view, jammed) {
      const level = this.level();
      for (const stage of Config.ai.plan) {
        if (level < stage.from) continue;
        for (const [type, target] of stage.goals) {
          if ((census.count[type] || 0) >= target || (jammed && !WAR.has(type))) continue;
          const next = this.need(player, state, census, type, []);
          if (next === WAIT) return true;
          if (next === BLOCKED) continue;
          if (this.place(player, state, next) === UNSEEN) this.lookout(player, state, census);
          return true;
        }
      }
      return false;
    },

    // När planen är klar: fortsätter växa med den typ som har minst antal i förhållande till sin vikt, tills storleken för banan är nådd
    grow(player, state, census, jammed) {
      const { size, grow, warLevel, warMin, warMax } = Config.ai, level = this.level();
      if (census.total >= Math.min(size.cap, size.start + size.perLevel * level + size.perMinute * gameSeconds() / 60)) return false;   // större med banan och med tiden
      const war = Math.max(warMin, Math.min(warMax, level / warLevel));
      const soldiersFull = ['guard_tower', 'garrison'].every(type => this.garrisonsFull(player, type));
      const ranked = grow
        .map(([type, weight, kind]) => ({ type, ratio: (census.count[type] || 0) / (weight * (kind === 'war' ? war : 1)), skip: (census.count[type] || 0) >= this.cap(type, census) || (kind === 'war' ? !soldiersFull : jammed) }))
        .filter(item => !item.skip).sort((a, b) => a.ratio - b.ratio);
      for (const { type } of ranked) {
        const next = this.need(player, state, census, type, []);
        if (next === BLOCKED) continue;
        if (next === WAIT) return true;
        if (this.place(player, state, next) === UNSEEN) this.lookout(player, state, census);
        return true;
      }
      return false;
    },

    // Högsta antal av en byggnadstyp: grundantal + byggnader / per (Config.ai.scale), annars maxPerType
    cap(type, census) {
      const scale = Config.ai.scale[type];
      let cap = scale ? scale[0] + Math.floor(census.total / scale[1]) : Config.ai.maxPerType;
      if (Config.ai.chain.includes(type)) {          // led i en tillverkningskedja: aldrig fler än det som förbrukar det de tillverkar (byggs bara för att något annat står och väntar)
        const definition = Config.buildings[type], resourceId = primaryOutputs(definition)[0], supply = rateOf(definition, resourceId, 'out');
        let demand = 0;
        for (const [other, count] of Object.entries(census.count)) if (other !== type) demand += count * rateOf(Config.buildings[other], resourceId, 'in');
        if (supply > 0) cap = Math.min(cap, Math.max(1, Math.ceil(demand / supply * Config.ai.chainShare)));
      }
      return cap;
    },

    // Är alla garnisoner av sorten fulla (eller finns inga)? Då hjälper det att bygga fler; annars saknas utrustning eller mat, vilket flaskhalsen löser
    garrisonsFull(player, type) {
      return World.buildings.every(building => building.player !== player || building.type !== type || building.buildProgress < 1 || CityBuilder.I18n.canonicalStatus(building.status || '') === 'Garrison full');
    },

    // Samlare som inte hittar något mer att samla rivs (halva kostnaden tillbaka) så att en ny kan byggas där råvaran finns
    retire(player, state, view) {
      if (!view.exhausted.length || this.time < (state.retireAt || 0)) return;
      state.retireAt = this.time + 60;
      Construction.dismantle(view.exhausted[0], true);
    },

    // Byggplatser som stått stilla för länge (varor som aldrig kommer) rivs, så att de inte blockerar alla nya bygge
    reclaim(player, state, census) {
      for (const site of World.buildings) {
        if (site.player !== player || site.buildProgress >= 1 || site.definition.pile) continue;
        const record = this.watch.get(site);
        if (!record || record.progress !== site.buildProgress) { this.watch.set(site, { progress: site.buildProgress, since: this.time }); continue; }
        if (this.time - record.since >= Config.ai.stuckSeconds) {
          state.blocked[site.type] = this.time + Config.ai.blockedSeconds * 3;
          Construction.dismantle(site, true);
        }
      }
    },

    // Vad spelaren har: antal per typ (även ofärdiga), vad som tillverkas, antal ofärdiga byggnader
    census(player) {
      const census = { count: {}, building: {}, produces: new Set(), unfinished: 0, total: 0 };
      for (const building of World.buildings) {
        if (building.player !== player || building.definition.pile || building.dead) continue;
        census.count[building.type] = (census.count[building.type] || 0) + 1;
        census.total++;
        for (const resourceId of outputsOf(building.definition)) census.produces.add(resourceId);
        if (building.buildProgress < 1) { census.unfinished++; census.building[building.type] = (census.building[building.type] || 0) + 1; }
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

    // ---- Anfall: samma sätt som spelaren (attackläge och en flagga som flyttas mot fienden, se flags.js) --------

    // Redo för krig: från en viss bana, och när armén är stor nog
    ready(player) {
      const { fromLevel, soldiers: [base, extra, cap] } = Config.ai.attack, level = this.level();
      return level >= fromLevel && Garrison.soldiersOf(player) >= Math.min(cap, base + extra * (level - fromLevel));
    },

    // Flaggan flyttas mot anfallsmålet (Flags.advance begränsar takten och stegen), och tas bort när datorn inte anfaller
    moveFlag(player, state) {
      if (state.flagGoal) CityBuilder.Flags.advance(player, state.flagGoal);
      else if (CityBuilder.Flags.of(player)) CityBuilder.Flags.set(player, 0, 0, true);
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
        if (!Players.isPlayer(thing.player) || !Players.isHostile(player, thing.player) || !Vision.knows(player, thing)) continue;   // monster visar inte var motståndaren finns
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

    // Bygger ett vakttorn närmare fienden tills det syns var den finns (en ledtråd måste datorn komma nära: en känd byggnad går soldaterna
    // direkt mot med flaggan). Vet datorn inte var fienden finns bygger den utkikstorn utåt (explore). Returnerar true om något byggdes (eller väntas på).
    advance(player, state, census) {
      const target = this.enemyTarget(player, state);
      if (!target) return this.explore(player, state, census);
      if (target.buildProgress !== undefined) return false;    // en känd byggnad går flaggan direkt mot
      const reach = Config.buildings.guard_tower.vision * .7;
      let from, fromDistance = Infinity;                       // närmaste egna byggnad är utgångspunkt
      for (const building of World.buildings) {
        if (building.player !== player || building.buildProgress < 1) continue;
        const distance = Utils.distance(building.x - target.x, building.y - target.y);
        if (distance < fromDistance) { from = building; fromDistance = distance; }
      }
      if (!from || fromDistance <= reach) return false;
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

    // Det färdiga lager (basen räknas) med färst byggnader inom några rutor
    quietest(player, hq) {
      let best = hq, bestCount = Infinity;
      for (const storage of Economy.storages(player)) {
        let count = 0;
        for (const building of World.buildings) if (building.player === player && Utils.distance(building.x - storage.x, building.y - storage.y) <= Config.ai.warehouses.crowd) count++;
        if (count < bestCount) { best = storage; bestCount = count; }
      }
      return best;
    },

    sizeOf: player => World.buildings.reduce((sum, building) => sum + (building.player === player ? 1 : 0), 0),

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
        // Staden byggs runt flera lager: nästa byggnad hamnar vid det lager som har färst byggnader omkring sig (korta bärarvägar), annars runt basen
        const centre = this.quietest(player, hq);
        if (centre !== hq) yield* emit(this.free(centre, definition, 10));
        yield* emit(this.free(hq, definition, Math.min(MAX_SEARCH, BASE_RADIUS + this.sizeOf(player) / 4)));   // staden växer utåt
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
