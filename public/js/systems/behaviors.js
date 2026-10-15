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
      // Markera hjortens sparade post som permanent död.
      if (unit.kind === 'deer' && unit.deerRecordId && unit.deerChunkKey) {
        const records = World.deerByChunk.get(unit.deerChunkKey);
        const record = records?.find(
          entry => entry.id === unit.deerRecordId
        );

        if (record) record.dead = true;
      }

      if (typeof World.removeUnit === 'function') {
        World.removeUnit(unit);
      } else if (Array.isArray(World.units)) {
        const index = World.units.indexOf(unit);
        if (index >= 0) World.units.splice(index, 1);
      }

      unit.removed = true;
      unit.stepQueue = [];
    },

    forBuilding(building) { return building.definition.job ? this.get(building.definition.job.kind) : null; },

    // Allt huset ska ha levererat: insatser (upp till kapacitet) och utrustning
    requiredResources(building) {
      const behavior = this.forBuilding(building);
      return { ...(behavior.inputCapacities ? behavior.inputCapacities(building) : {}), ...(building.definition.requiredEquipment || {}) };
    },

    hasRequiredEquipment: building =>
      Object.entries(building.definition.requiredEquipment || {}).every(([resourceId, amount]) => (building.inputStock[resourceId] || 0) >= amount),
  };

  // Samlare: arbetaren hämtar från närmaste terrängnod inom räckhåll och bär tillbaka till huset
  Behaviors.register('gather', {
    onBuilt(building) { building.workerUnit = World.spawnUnit('worker', building.x, building.y, building); },

    update(building) { building.status = building.workerUnit ? building.workerUnit.status : ''; },

    // Jakt/fångst: arbetaren går till närmaste enhet av rätt typ, väntar, och om bytet fortfarande är nära
    // tas det bort ur världen och arbetaren bär hem resursen. Har bytet hunnit iväg avbryts passet och
    // arbetaren planerar om (jagar vidare).
    planUnitWork(worker, building, job) {
      // Utdata: outputResource (1 st) eller outputs: { resurs: antal } som i craft-jobb (första posten används)
      const outputResource = job.outputResource || Object.keys(job.outputs || {})[0];
      const outputAmount = job.outputResource ? 1 : ((job.outputs || {})[outputResource] || 1);
      if (!outputResource) { worker.status = 'Missing export'; worker.idleCooldown = 5; return; }

      const prey = Behaviors.findUnitTarget(building, job, worker);
      if (!prey) { worker.status = 'No deers in range'; worker.idleCooldown = job.retrySeconds || 5; return; }

      worker.stepQueue = [
        Jobs.followUnit(prey, job, outputResource),

        Jobs.walkTo(building.x, building.y),

        Jobs.run(() => {
          if (worker.carriedResource && !building.removed) {
            building.outputStock[worker.carriedResource] =
              (building.outputStock[worker.carriedResource] || 0) +
              outputAmount;
          }

          worker.carriedResource = null;
        }),
      ];
    },

    planWork(worker) {
      const building = worker.homeBuilding, job = building.definition.job;
      if (!Behaviors.hasRequiredEquipment(building)) { worker.status = 'Missing tools'; return; }
      if (Utils.sumValues(building.outputStock) >= Config.settings.outputBufferCapacity) { worker.status = 'Full stock'; return; }

      if (job.sourceUnit) return this.planUnitWork(worker, building, job);

      // Sökningen sker i omgångar (ringar utåt från huset) så att stora räckvidder inte hänger spelet.
      // Närmaste noden vinner alltid: en ring genomsöks färdigt, och hittas inget går sökningen vidare utåt
      // (över flera anrop/bilder) tills searchRadius är nådd.
      const target = Behaviors.searchNearest(worker, building, job);
      if (target === undefined) { worker.status = 'Searching...'; return; } // fortsätter vid nästa anrop
      if (target === null) { worker.status = 'No resources'; worker.idleCooldown = 60; return; }

      const stopBeside = Config.terrain[target.tile.terrainType].gatherersStopBefore;
      worker.stepQueue = [
        Jobs.walkTo(target.x, target.y, stopBeside),
        Jobs.wait(job.workSeconds, 'Gathering'),
        Jobs.run(() => {
          if (target.tile.remainingAmount <= 0) return false; // någon annan hann före
          if (--target.tile.remainingAmount <= 0) target.tile.terrainType = 'grass';
          worker.carriedResource = job.outputResource;
        }),
        Jobs.walkTo(building.x, building.y),
        Jobs.run(() => {
          if (worker.carriedResource && !building.removed) {
            building.outputStock[worker.carriedResource] = (building.outputStock[worker.carriedResource] || 0) + 1;
          }
          worker.carriedResource = null;
        }),
      ];
    },
  });

  // Förädlare: konsumerar inputs, väntar craftSeconds, producerar outputs i utbufferten
  Behaviors.register('craft', {
    inputCapacities: building => Object.fromEntries(
      Object.entries(building.definition.job.inputs || {}).map(
        ([resourceId, amount]) => [
          resourceId,
          Math.max(2, amount * 2)
        ]
      )
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
          building.status = 'Missing tools';
          return;
        }
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
          building.status = 'Full stock';
          return;
        }
        for (const resourceId in inputs) {
          building.inputStock[resourceId] -= inputs[resourceId];
        }

        building.isCrafting = true;
        building.craftTimeLeft = job.craftSeconds;
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