/* Beteenden: vad en byggnadstyp gör. Registrera nya jobbtyper med Behaviors.register(kind, implementation).
   Hooks: onBuilt(building), update(building, deltaSeconds), planWork(unit), inputCapacities(building) -> { resurs: kapacitet } */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Utils, Jobs } = CityBuilder;

  const Behaviors = {
    registry: {},

    register(kind, implementation) { this.registry[kind] = implementation; },

    get(kind) {
      const behavior = this.registry[kind];
      if (!behavior) throw new Error('Unknown work type: ' + kind);
      return behavior;
    },

    // Hur långt ut varje arbetare har sökt hittills (ej sparat: en ny sökning startar vid laddning)
    searchProgress: new WeakMap(),

    // Sök efter närmaste nod i ringar. Returnerar { x, y, tile }, null (inget finns inom räckvidd) eller
    // undefined (sökningen är inte klar, anropa igen). Små räckvidder söks i ett enda anrop.
    searchNearest(worker, building, job) {
      const maxRadius = job.searchRadius;
      const settings = Config.settings;
      const ringWidth = settings.gatherSearchRingWidth || 8;       // ringens tjocklek i rutor
      const tileBudget = settings.gatherSearchTilesPerCall || 2500; // ungefär så många rutor per anrop
      let from = this.searchProgress.get(worker) || 0;
      let checked = 0;

      while (from < maxRadius) {
        const to = Math.min(maxRadius, from + ringWidth);
        let best = null, bestDistance = 1e9;

        for (let dy = -to; dy <= to; dy++) {
          const rowHalf = Math.floor(Math.sqrt(to * to - dy * dy));
          // Hoppa över den redan genomsökta mitten (avstånd <= from)
          const innerHalf = Math.abs(dy) <= from ? Math.ceil(Math.sqrt(from * from - dy * dy)) : -1;
          for (let dx = -rowHalf; dx <= rowHalf; dx++) {
            if (innerHalf >= 0 && dx > -innerHalf && dx < innerHalf) { dx = innerHalf - 1; continue; }
            const distance = Math.hypot(dx, dy);
            if (distance <= from && from > 0 || distance > to) continue;
            checked++;
            const x = building.x + dx, y = building.y + dy, tile = World.getTile(x, y);
            if (tile.terrainType === job.sourceTerrain && tile.remainingAmount > 0 && distance < bestDistance) {
              bestDistance = distance; best = { x, y, tile };
            }
          }
        }

        if (best) { this.searchProgress.delete(worker); return best; }
        from = to;
        if (checked >= tileBudget && from < maxRadius) { this.searchProgress.set(worker, from); return undefined; }
      }

      this.searchProgress.delete(worker);
      return null;
    },

    // ---- Enheter som källa (jakt m.m.) --------------------------------------------------------
    // Ett gather-jobb hämtar antingen från terräng (job.sourceTerrain) eller från enheter (job.sourceUnit):
    //   sourceUnit: 'deer'                    en enhetstyp (unit.kind)
    //   sourceUnit: ['deer', 'soldier']       flera typer
    //   sourceFilter: unit => boolean       valfritt extra villkor (t.ex. bara fientliga enheter)
    //   reach: 3                            hur nära (i rutor) bytet måste vara när arbetaren slår till
    //   workLabel: 'Hunting'                statustext medan arbetaren arbetar

    unitMatches(unit, job) {
      if (unit.removed) return false;
      const wanted = job.sourceUnit;
      if (Array.isArray(wanted) ? !wanted.includes(unit.kind) : unit.kind !== wanted) return false;
      return job.sourceFilter ? Boolean(job.sourceFilter(unit)) : true;
    },

    // Närmaste enhet av rätt typ inom searchRadius från huset (eller null)
    findUnitTarget(building, job, worker) {
      let best = null, bestDistance = job.searchRadius;
      for (const unit of World.units) {
        if (unit === worker || !this.unitMatches(unit, job)) continue;
        const distance = Math.hypot(unit.x - (building.x + .5), unit.y - (building.y + .5));
        if (distance <= bestDistance) { bestDistance = distance; best = unit; }
      }
      return best;
    },

    // Tar bort en enhet ur världen (dödad, fångad, ...)
    removeUnit(unit) {
      if (typeof World.removeUnit === 'function') World.removeUnit(unit);
      else if (Array.isArray(World.units)) {
        const index = World.units.indexOf(unit);
        if (index >= 0) World.units.splice(index, 1);
      }
      unit.removed = true;
      unit.stepQueue = [];
      if (unit.animalRecordId) CityBuilder.Animals.markDead(unit);
    },

    forBuilding(building) { return building.definition.job ? this.get(building.definition.job.kind) : null; },

    // Hur mycket ett hus håller av en insats som går åt 'amount' per omgång
    inputBuffer: amount => Math.max(2, Math.ceil(amount * Config.settings.inputBufferFactor)),

    // Allt huset ska ha levererat: insatser (upp till kapacitet) och utrustning
    requiredResources(building) {
      const behavior = this.forBuilding(building), boost = building.boostOn && this.boostOf(building);
      if (!behavior) return {};
      return {
        ...(behavior.inputCapacities ? behavior.inputCapacities(building) : {}),
        ...(boost ? { [boost.resource]: this.inputBuffer(1) } : {}),
        ...(building.definition.requiredEquipment || {}),
      };
    },

    // Varför står huset still med fullt utlager? Centrallagret fullt (för en vara i utlagret) eller bara huset eget lager (väntar på bärare)
    fullStatus(building) {
      const blocked = Object.keys(building.outputStock).some(id => building.outputStock[id] > 0 && CityBuilder.Economy.isFull(id, building.player));
      return blocked ? 'Central storage full' : 'Local stock full';
    },

    // Alternativa importer: job.eats = { any: ['meat','fish','bread'], every: 2 } (eller en lista av sådana)
    eatGroups(building) { const eats = building.definition.job && building.definition.job.eats; return !eats ? [] : [].concat(eats); },
    eatStock: (building, group) => group.any.reduce((sum, id) => sum + (building.inputStock[id] || 0), 0),
    eatsReady(building) {
      return this.eatGroups(building).every((group, i) => (building.meals && building.meals[i] > 0) || this.eatStock(building, group) > 0);
    },
    eat(building) { // förbrukar en omgång: tar en vara (den det finns mest av) när förra är slutäten
      building.meals = building.meals || [];
      this.eatGroups(building).forEach((group, i) => {
        if (!(building.meals[i] > 0)) {
          const id = group.any.reduce((best, r) => (building.inputStock[r] || 0) > (building.inputStock[best] || 0) ? r : best);
          building.inputStock[id]--;
          this.note(building, 'use', id);
          building.meals[i] = group.every || 1;
        }
        building.meals[i]--;
      });
    },
    eatStatus(building) {
      const missing = this.eatGroups(building).filter((group, i) => !(building.meals && building.meals[i] > 0) && !this.eatStock(building, group));
      return 'Missing: ' + missing.map(group => group.any.map(id => Config.resources[id].name).join(' / ')).join(', ');
    },

    // Effektivitet: andel av de senaste ~60 s (speltid) som huset inte stått still, med orsaker till stilleståndet.
    // Statusar som räknas som stillestånd; allt annat (Working, Walking, Gathering, ...) räknas som arbete.
    // Byggnader som spelaren pausat räknas inte alls.
    IDLE_STATUSES: new Set(['Local stock full', 'Central storage full', 'No resources', 'No animals in range', 'Tools missing', "Can't reach", 'No room to plant', 'Missing outputResource']),
    idleReason(building) {
      const status = CityBuilder.I18n.canonicalStatus(building.status || '');
      return status.startsWith('Missing:') ? status.replace(/\s*\(\d+\)/g, '') : this.IDLE_STATUSES.has(status) ? status : null;
    },
    trackEfficiency(building, deltaSeconds) {
      if (building.paused) return;
      const BUCKET = 10, count = Math.max(1, Math.ceil(((Config.settings.efficiency && Config.settings.efficiency.windowSeconds) || 60) / BUCKET));
      const eff = building.eff || (building.eff = { time: 0, buckets: [], timer: 0, summary: null });
      eff.time += deltaSeconds;
      const slot = Math.floor(eff.time / BUCKET);
      let bucket = eff.buckets[slot % count];
      if (!bucket || bucket.slot !== slot) bucket = eff.buckets[slot % count] = { slot, total: 0, work: 0, reasons: {} };
      // Tom status eller sökning = arbetaren planerar: räknas varken som arbete eller stillestånd
      const status = CityBuilder.I18n.canonicalStatus(building.status || '');
      if (status && status !== 'Searching...') {
        const reason = this.idleReason(building);
        bucket.total += deltaSeconds;
        if (reason) bucket.reasons[reason] = (bucket.reasons[reason] || 0) + deltaSeconds; else bucket.work += deltaSeconds;
      }
      if ((eff.timer -= deltaSeconds) > 0) return;
      eff.timer = 1; // sammanfattningen uppdateras en gång per sekund
      let total = 0, work = 0;
      const reasons = {};
      for (const b of eff.buckets) {
        if (!b || slot - b.slot >= count) continue;
        total += b.total; work += b.work;
        for (const r in b.reasons) reasons[r] = (reasons[r] || 0) + b.reasons[r];
      }
      eff.summary = total >= 5 ? { seconds: total, ratio: work / total, reasons: Object.entries(reasons).map(([r, s]) => [r, s / total]).sort((a, b) => b[1] - a[1]) } : null;
    },

    // Byggnadens problem (för markeringarna på minimapen): 'noResources' = samlaren hittar inget att samla (eller jaga),
    // 'bad' / 'warn' = står still större delen av tiden (se settings.efficiency), annars null. Pausade och ofärdiga byggnader har inga problem.
    problemOf(building) {
      const job = building.definition.job;
      if (!job || building.buildProgress < 1 || building.paused) return null;
      if (job.kind === 'gather') {
        const status = CityBuilder.I18n.canonicalStatus(building.status || '');
        if (status === 'No resources' || status === 'No animals in range') return 'noResources';
      }
      return this.inefficiency(building);
    },

    // 'bad' / 'warn' om byggnaden står still större delen av tiden, annars null. Räknas först när den arbetat en stund (settings.efficiency.minAge),
    // så att en nybyggd byggnad som väntar på sina första leveranser inte varnar i onödan.
    inefficiency(building) {
      const summary = building.eff && building.eff.summary, limits = Object.assign({ minSeconds: 30, minAge: 45, warnBelow: .6, badBelow: .3 }, Config.settings.efficiency);
      if (!summary || building.paused || building.eff.time < limits.minAge || summary.seconds < limits.minSeconds || summary.ratio >= limits.warnBelow) return null;
      return summary.ratio < limits.badBelow ? 'bad' : 'warn';
    },

    // Flödesstatistik (Economy.record): byggnaden förbrukade ('use') eller levererade ('make') en vara
    note: (building, kind, resourceId, amount = 1) => CityBuilder.Economy.record(building.player, kind, resourceId, building.type, amount),

    // Lämnar det arbetaren bär i huset (jägarens alla varor, annars en)
    deposit(worker, building) {
      if (worker.carriedResource && !building.removed) {
        for (const [resourceId, amount] of Object.entries(worker.carriedOutputs || { [worker.carriedResource]: 1 })) {
          building.outputStock[resourceId] = (building.outputStock[resourceId] || 0) + amount;
          this.note(building, 'make', resourceId, amount);
        }
        this.addByproducts(building, building.definition.job.byproducts);
      }
      worker.carriedResource = null;
      worker.carriedOutputs = null;
    },

    // Biprodukter (job.byproducts, t.ex. aska och tjära vid kolbränning) är en bonus: de lagras bara om det finns plats
    // (utbufferten och centrallagret), så att de aldrig stoppar huvudprodukten
    addByproducts(building, byproducts) {
      for (const resourceId in byproducts || {}) {
        const amount = byproducts[resourceId];
        if (building.removed || Utils.sumValues(building.outputStock) + amount > Config.settings.outputBufferCapacity || CityBuilder.Economy.isFull(resourceId, building.player)) continue;
        building.outputStock[resourceId] = (building.outputStock[resourceId] || 0) + amount;
        this.note(building, 'make', resourceId, amount);
      }
    },

    // ---- Val, boost och aura -----------------------------------------------------------------------------------------
    // job.choices: [{ inputs, outputs }]: byggnaden gör ett val åt gången (Market, Mint). Spelaren väljer med building.choice (index).
    // job.auto (Toolsmith): byggnaden väljer själv det påslagna val vars vara det finns minst av. Avslagna val sparas som bitmask i building.recipesOff.
    recipe(building) {
      const job = building.definition.job;
      if (!job.choices) return job;
      return job.choices[job.auto ? this.autoChoice(building) : building.choice] || job.choices[0];
    },

    recipeEnabled: (building, index) => !((building.recipesOff || 0) & (1 << index)),

    // Index på det påslagna valet med minst lager (lagren plus det byggnaden själv har tillverkat); vid lika vinner det första
    autoChoice(building) {
      const { Economy } = CityBuilder;
      let best = 0, fewest = Infinity;
      building.definition.job.choices.forEach((choice, index) => {
        if (!this.recipeEnabled(building, index)) return;
        const amount = Object.entries(choice.outputs).reduce((sum, [id, count]) => sum + (Economy.totalAmount(id, building.player) + (building.outputStock[id] || 0)) / count, 0);
        if (amount < fewest) { fewest = amount; best = index; }
      });
      return best;
    },

    // Slår ett val av eller på. Minst ett val måste vara påslaget.
    toggleRecipe(building, index) {
      const choices = building.definition.job.choices;
      const on = choices.filter((choice, i) => this.recipeEnabled(building, i)).length;
      if (this.recipeEnabled(building, index) && on <= 1) return;
      building.recipesOff = (building.recipesOff || 0) ^ (1 << index);
    },

    // Byggnadens boost (se settings.boosts) eller null. definition.boost åsidosätter jobbtypens standard.
    boostOf(building) {
      const definition = building.definition || building;   // byggnad eller byggnadstyp
      return (definition.boost !== undefined ? definition.boost : Config.settings.boosts[definition.job.kind]) || null;
    },

    // Börjar en omgång: går boosten (påslagen av spelaren) att använda? En vara räcker boost.cycles omgångar. Utan vara går omgången på vanligt sätt.
    useBoost(building) {
      const boost = this.boostOf(building);
      if (!boost || !building.boostOn) return false;
      if (!(building.boostLeft > 0)) {
        if (!(building.inputStock[boost.resource] > 0)) return false;
        building.inputStock[boost.resource]--;
        this.note(building, 'use', boost.resource);
        building.boostLeft = boost.cycles;
      }
      building.boostLeft--;
      return true;
    },

    // Extra utdata/fart från monumentet: den största aura-bonusen (key: 'yield' | 'training') från ett färdigt monument inom räckhåll
    auraBonus(building, key) {
      let best = 0;
      for (const other of World.buildings) {
        const aura = other.definition.aura;
        if (!aura || !(aura[key] > best) || other.player !== building.player || other.buildProgress < 1) continue;
        if (Math.hypot(other.x - building.x, other.y - building.y) <= aura.radius) best = aura[key];
      }
      return best;
    },

    // Hur många gånger så stor utdata byggnaden ger just nu: boost (när den är påslagen och har vara), aura och trollformler
    yieldFactor(building) {
      const boost = building.definition.job && this.boostOf(building);
      const boosting = boost && building.boostOn && (building.boostLeft > 0 || building.inputStock[boost.resource] > 0);
      return 1 + (boosting && boost.yield || 0) + this.auraBonus(building, 'yield') + CityBuilder.Spells.bonus(building, 'yield');
    },

    // Utdata med boost och aura. Bråkdelar sparas i building.yieldCarry, så +10 % betyder en extra vara var tionde omgång.
    yielded(building, outputs, boosted) {
      const boost = boosted && this.boostOf(building);
      const extra = (boost && boost.yield || 0) + this.auraBonus(building, 'yield') + CityBuilder.Spells.bonus(building, 'yield');
      if (!extra) return outputs;
      const carry = building.yieldCarry || (building.yieldCarry = {}), result = {};
      for (const resourceId in outputs) {
        const total = outputs[resourceId] * (1 + extra) + (carry[resourceId] || 0);
        result[resourceId] = Math.floor(total + 1e-9);
        carry[resourceId] = total - result[resourceId];
      }
      return result;
    },

    hasRequiredEquipment: building =>
      Object.entries(building.definition.requiredEquipment || {}).every(([resourceId, amount]) => (building.inputStock[resourceId] || 0) >= amount),
  };

  // Samlare: arbetaren hämtar från närmaste terrängnod inom räckhåll och bär tillbaka till huset
  Behaviors.register('gather', {
    onBuilt(building) { building.workerUnit = World.spawnUnit('worker', building.x, building.y, building); },

    update(building, deltaSeconds) {
      // En arbetare som dödats i strid ersätts efter en stund
      if (building.workerUnit && building.workerUnit.removed) {
        building.workerUnit = null;
        building.workerRespawn = Config.settings.military.workerRespawnSeconds;
      }
      if (!building.workerUnit && building.workerRespawn != null && (building.workerRespawn -= deltaSeconds) <= 0) {
        building.workerRespawn = null;
        this.onBuilt(building);
      }

      building.status = building.workerUnit ? building.workerUnit.status : '';
    },

    // Jakt/fångst: arbetaren går till närmaste enhet av rätt typ, väntar, och om bytet fortfarande är nära
    // tas det bort ur världen och arbetaren bär hem resursen. Har bytet hunnit iväg avbryts passet och
    // arbetaren planerar om (jagar vidare).
    planUnitWork(worker, building, job) {
      // Utdata: outputs: { resurs: antal } som i craft-jobb (ALLA ges när jägaren kommer hem), annars outputResource (1 st)
      const outputs = job.outputs && Object.keys(job.outputs).length ? job.outputs : (job.outputResource ? { [job.outputResource]: 1 } : {});
      const outputResource = Object.keys(outputs)[0]; // det som visas som burit
      if (!outputResource) { worker.status = 'Saknar outputResource'; worker.idleCooldown = 5; return; }

      const prey = Behaviors.findUnitTarget(building, job, worker);
      if (!prey) { worker.status = 'No animals in range'; worker.idleCooldown = job.retrySeconds || 5; return; }

      Behaviors.eat(building);
      const boosted = Behaviors.useBoost(building);

      worker.stepQueue = [
        Jobs.walkTo(Math.floor(prey.x), Math.floor(prey.y), true),
        // Framme: bytet stannar där det står (frysts av Units.update via heldBy) tills jägaren är klar
        Jobs.run(() => {
          const reachable = !prey.removed && Behaviors.unitMatches(prey, job) && !prey.heldBy &&
            Math.hypot(prey.x - worker.x, prey.y - worker.y) <= (job.reach || 3);
          if (!reachable) return false; // bytet försvann, är upptaget eller hann iväg: planera om
          prey.stepQueue = [];
          prey.heldBy = worker;
          prey.heldFor = 0;
          worker.huntTarget = prey;
        }),
        Jobs.run(() => Behaviors.workSound(building)),
        Jobs.wait(job.workSeconds || 2, job.workLabel || 'Hunting'),
        Jobs.run(() => {
          const target = worker.huntTarget;
          worker.huntTarget = null;
          if (!target || target.removed || target.heldBy !== worker) return false;
          Behaviors.removeUnit(target);
          worker.carriedResource = outputResource;
          worker.carriedOutputs = Behaviors.yielded(building, outputs, boosted);
        }),
        Jobs.walkTo(building.x, building.y),
        Jobs.run(() => Behaviors.deposit(worker, building)),
      ];
    },

    planWork(worker) {
      const building = worker.homeBuilding, job = building.definition.job;
      // Bär redan en vara (t.ex. vägen hem blockerades): försök bara lämna den, samla inte mer
      if (worker.carriedResource) {
        worker.stepQueue = [Jobs.walkTo(building.x, building.y), Jobs.run(() => Behaviors.deposit(worker, building))];
        return;
      }
      if (!Behaviors.hasRequiredEquipment(building)) { worker.status = 'Saknar verktyg'; return; }
      if (Utils.sumValues(building.outputStock) >= Config.settings.outputBufferCapacity) { worker.status = Behaviors.fullStatus(building); return; }

      if (!Behaviors.eatsReady(building)) { worker.status = Behaviors.eatStatus(building); worker.idleCooldown = 1; return; }

      if (job.sourceUnit) return this.planUnitWork(worker, building, job);

      // Sökningen sker i omgångar (ringar utåt från huset) så att stora räckvidder inte hänger spelet.
      // Närmaste noden vinner alltid: en ring genomsöks färdigt, och hittas inget går sökningen vidare utåt
      // (över flera anrop/bilder) tills searchRadius är nådd.
      const target = Behaviors.searchNearest(worker, building, job);
      if (target === undefined) { worker.status = 'Söker...'; return; } // fortsätter vid nästa anrop
      if (target === null) { worker.status = 'Inga resurser'; worker.idleCooldown = 60; return; }

      const stopBeside = Config.terrain[target.tile.terrainType].gatherersStopBefore;

      Behaviors.eat(building);
      const boosted = Behaviors.useBoost(building);

      worker.stepQueue = [
        Jobs.walkTo(target.x, target.y, stopBeside),
        Jobs.run(() => Behaviors.workSound(building, target.tile.terrainType)),
        Jobs.wait(job.workSeconds, 'Gathering'),
        Jobs.run(() => {
          if (target.tile.remainingAmount <= 0) return false; // någon annan hann före
          if (--target.tile.remainingAmount <= 0) target.tile.terrainType = 'grass';
          worker.carriedResource = job.outputResource;
          worker.carriedOutputs = Behaviors.yielded(building, { [job.outputResource]: 1 }, boosted);
        }),
        Jobs.walkTo(building.x, building.y),
        Jobs.run(() => Behaviors.deposit(worker, building)),
      ];
    },
  });

  // Förädlare: konsumerar inputs, väntar craftSeconds, producerar outputs i utbufferten
  Behaviors.register('craft', {
    inputCapacities: building => Object.fromEntries(
      Object.entries(Behaviors.recipe(building).inputs || {}).map(([resourceId, amount]) => [resourceId, Behaviors.inputBuffer(amount)])
    ),

    update(building, deltaSeconds) {
      const job = building.definition.job;
      const recipe = Behaviors.recipe(building);
      const inputs = recipe.inputs || {};

      if (building.paused) {
        building.status = 'Paused';
        return;
      }

      if (!building.isCrafting) {
        if (!Behaviors.hasRequiredEquipment(building)) {
          building.status = 'Tools missing';
          return;
        }
        if (!Behaviors.eatsReady(building)) { building.status = Behaviors.eatStatus(building); return; }
        const missingInputs = Object.entries(inputs)
          .filter(([id, amount]) => (building.inputStock[id] || 0) < amount)
          .map(([id, amount]) =>
            `${Config.resources[id].name} (${amount - (building.inputStock[id] || 0)})`
          );

        if (missingInputs.length) {
          building.status = `Missing: ${missingInputs.join(', ')}`;
          return;
        }

        if (
          Utils.sumValues(building.outputStock) +
          Utils.sumValues(recipe.outputs) >
          Config.settings.outputBufferCapacity
        ) {
          building.status = Behaviors.fullStatus(building);
          return;
        }
        Behaviors.eat(building);
        for (const resourceId in inputs) {
          building.inputStock[resourceId] -= inputs[resourceId];
          Behaviors.note(building, 'use', resourceId, inputs[resourceId]);
        }

        building.isCrafting = true;
        building.craftOutputs = Behaviors.yielded(building, recipe.outputs, Behaviors.useBoost(building));
        building.craftTimeLeft = job.craftSeconds;
        building.craftTotalTime = building.craftTimeLeft;
        Behaviors.workSound(building);
      }

      building.status = 'Working';

      if ((building.craftTimeLeft -= deltaSeconds) <= 0) {
        building.isCrafting = false;

        const outputs = building.craftOutputs || recipe.outputs;
        building.craftOutputs = null;
        for (const resourceId in outputs) {
          building.outputStock[resourceId] =
            (building.outputStock[resourceId] || 0) + outputs[resourceId];
          Behaviors.note(building, 'make', resourceId, outputs[resourceId]);
        }
        Behaviors.addByproducts(building, recipe.byproducts);
      }
    },
  });

  // Arbetsljud (systems/sound.js): vilket ljud en byggnads arbete ger. terrain = terrängen arbetaren samlar från (om någon).
  const SOFT_TERRAIN = new Set(['berry_bush', 'herbs', 'mushrooms', 'apple_tree', 'fallen_star', 'moonstone', 'ancient_altar']);
  const DIGGING_TERRAIN = new Set(['clay', 'sand', 'bog', 'cursed_ground', 'tar_pit']);
  Behaviors.workSound = (building, terrain) => {
    const job = building.definition.job;
    let id;
    if (job.kind === 'craft') id = /smelter|foundry|burner/.test(building.type || '') ? 'smelt' : 'craft';
    else if (job.kind === 'plant') id = 'plant';
    else if (job.sourceUnit) id = 'hunt';
    else if (terrain === 'water') id = 'fish';
    else if (terrain === 'tree') id = 'chop';
    else if (SOFT_TERRAIN.has(terrain)) id = 'pick';
    else if (DIGGING_TERRAIN.has(terrain)) id = 'dig';
    else id = 'mine';
    CityBuilder.Sound?.play(id, { x: building.x, y: building.y });
  };

  // Planterare: arbetaren går till en slumpad ledig gräsruta på avstånd minRadius-maxRadius (jämnt fördelat över ytan) och planterar ett träd (amount: [min, max] trä).
  // Insatserna (frön, vatten) förbrukas när arbetaren går ut, och lämnas tillbaka om rutan hunnit bli upptagen.
  const { gather, craft } = Behaviors.registry;
  Behaviors.register('plant', {
    onBuilt: gather.onBuilt,
    update: gather.update,
    inputCapacities: craft.inputCapacities,

    // Helt tom gräsruta: ingen byggnad och ingen upptrampad stig (wear), så träden hamnar aldrig på vägar och stigar
    isFree: (x, y) => { const tile = World.getTile(x, y); return !!tile && tile.terrainType === 'grass' && !tile.wear && !World.buildingAt(x, y); },

    // Slumpad ruta som går att nå och är helt tom. Provar några gånger och ger null om inget fanns.
    findSpot(building, job) {
      for (let attempt = 0; attempt < 24; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(job.minRadius ** 2 + Math.random() * (job.maxRadius ** 2 - job.minRadius ** 2));   // sqrt: lika stor chans för varje ruta, inte tätast vid huset
        const x = Math.round(building.x + Math.cos(angle) * distance), y = Math.round(building.y + Math.sin(angle) * distance);
        if (this.isFree(x, y) && CityBuilder.Pathfinder.findPathNow(building.x, building.y, x, y) !== null) return { x, y };
      }
      return null;
    },

    planWork(worker) {
      const building = worker.homeBuilding, job = building.definition.job;
      if (!Behaviors.hasRequiredEquipment(building)) { worker.status = 'Tools missing'; return; }
      const missing = Object.entries(job.inputs).filter(([id, amount]) => (building.inputStock[id] || 0) < amount)
        .map(([id, amount]) => `${Config.resources[id].name} (${amount - (building.inputStock[id] || 0)})`);
      if (missing.length) { worker.status = `Missing: ${missing.join(', ')}`; worker.idleCooldown = 1; return; }

      const spot = this.findSpot(building, job);
      if (!spot) { worker.status = 'No room to plant'; worker.idleCooldown = 10; return; }

      for (const id in job.inputs) { building.inputStock[id] -= job.inputs[id]; Behaviors.note(building, 'use', id, job.inputs[id]); }
      worker.stepQueue = [
        Jobs.walkTo(spot.x, spot.y),
        Jobs.run(() => Behaviors.workSound(building)),
        Jobs.wait(job.workSeconds, 'Planting'),
        Jobs.run(() => {
          const tile = World.getTile(spot.x, spot.y);
          if (!this.isFree(spot.x, spot.y)) {
            if (!building.removed) for (const id in job.inputs) building.inputStock[id] = (building.inputStock[id] || 0) + job.inputs[id];
            return false;
          }
          const [low, high] = job.amount;
          Utils.assign(tile, Config.terrain[job.terrain], { terrainType: job.terrain, remainingAmount: low + Math.floor(Math.random() * (high - low + 1)) });
          CityBuilder.Pathfinder.clearCache();
        }),
        Jobs.walkTo(building.x, building.y),
      ];
    },
  });

  CityBuilder.Behaviors = Behaviors;
})(window.CityBuilder);