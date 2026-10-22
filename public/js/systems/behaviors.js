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
    //   sourceUnit: 'deer'                  en enhetstyp (unit.kind)
    //   sourceUnit: ['deer', 'soldier']     flera typer
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
    },

    forBuilding(building) { return building.definition.job ? this.get(building.definition.job.kind) : null; },

    // Hur mycket ett hus håller av en insats som går åt 'amount' per omgång
    inputBuffer: amount => Math.max(2, Math.ceil(amount * Config.settings.inputBufferFactor)),

    // Allt huset ska ha levererat: insatser (upp till kapacitet) och utrustning
    requiredResources(building) {
      const behavior = this.forBuilding(building);
      return { ...(behavior.inputCapacities ? behavior.inputCapacities(building) : {}), ...(building.definition.requiredEquipment || {}) };
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
    IDLE_STATUSES: new Set(['Local stock full', 'Central storage full', 'No resources', 'No deer in range', 'Tools missing', "Can't reach", 'Missing outputResource']),
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

    // Lämnar det arbetaren bär i huset (jägarens alla varor, annars en)
    deposit(worker, building) {
      if (worker.carriedResource && !building.removed) {
        for (const [resourceId, amount] of Object.entries(worker.carriedOutputs || { [worker.carriedResource]: 1 })) {
          building.outputStock[resourceId] = (building.outputStock[resourceId] || 0) + amount;
        }
      }
      worker.carriedResource = null;
      worker.carriedOutputs = null;
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
      if (!prey) { worker.status = 'Inga hjortar i räckvidd'; worker.idleCooldown = job.retrySeconds || 5; return; }

      Behaviors.eat(building);

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
        Jobs.wait(job.workSeconds || 2, job.workLabel || 'Hunting'),
        Jobs.run(() => {
          const target = worker.huntTarget;
          worker.huntTarget = null;
          if (!target || target.removed || target.heldBy !== worker) return false;
          Behaviors.removeUnit(target);
          worker.carriedResource = outputResource;
          worker.carriedOutputs = outputs;
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

      worker.stepQueue = [
        Jobs.walkTo(target.x, target.y, stopBeside),
        Jobs.wait(job.workSeconds, 'Gathering'),
        Jobs.run(() => {
          if (target.tile.remainingAmount <= 0) return false; // någon annan hann före
          if (--target.tile.remainingAmount <= 0) target.tile.terrainType = 'grass';
          worker.carriedResource = job.outputResource;
        }),
        Jobs.walkTo(building.x, building.y),
        Jobs.run(() => Behaviors.deposit(worker, building)),
      ];
    },
  });

  // Förädlare: konsumerar inputs, väntar craftSeconds, producerar outputs i utbufferten
  Behaviors.register('craft', {
    inputCapacities: building => Object.fromEntries(
      Object.entries(building.definition.job.inputs || {}).map(([resourceId, amount]) => [resourceId, Behaviors.inputBuffer(amount)])
    ),

    update(building, deltaSeconds) {
      const job = building.definition.job;
      const inputs = job.inputs || {};

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
          Utils.sumValues(job.outputs) >
          Config.settings.outputBufferCapacity
        ) {
          building.status = Behaviors.fullStatus(building);
          return;
        }
        Behaviors.eat(building);
        for (const resourceId in inputs) {
          building.inputStock[resourceId] -= inputs[resourceId];
        }

        building.isCrafting = true;
        building.craftTimeLeft = job.craftSeconds;
        building.craftTotalTime = building.craftTimeLeft;
      }

      building.status = 'Working';

      if ((building.craftTimeLeft -= deltaSeconds) <= 0) {
        building.isCrafting = false;

        for (const resourceId in job.outputs) {
          building.outputStock[resourceId] =
            (building.outputStock[resourceId] || 0) + job.outputs[resourceId];
        }
      }
    },
  });

  CityBuilder.Behaviors = Behaviors;
})(window.CityBuilder);