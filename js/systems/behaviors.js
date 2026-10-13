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

    planWork(worker) {
      const building = worker.homeBuilding, job = building.definition.job;
      if (!Behaviors.hasRequiredEquipment(building)) { worker.status = 'Saknar verktyg'; return; }
      if (Utils.sumValues(building.outputStock) >= Config.settings.outputBufferCapacity) { worker.status = 'Fullt lager'; return; }

      // Sökningen sker i omgångar (ringar utåt från huset) så att stora räckvidder inte hänger spelet.
      // Närmaste noden vinner alltid: en ring genomsöks färdigt, och hittas inget går sökningen vidare utåt
      // (över flera anrop/bilder) tills searchRadius är nådd.
      const target = Behaviors.searchNearest(worker, building, job);
      if (target === undefined) { worker.status = 'Söker...'; return; } // fortsätter vid nästa anrop
      if (target === null) { worker.status = 'Inga resurser'; worker.idleCooldown = 60; return; }

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
          building.status = 'Saknar verktyg';
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