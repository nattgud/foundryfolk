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

      let target = null, targetDistance = 1e9;
      for (let y = building.y - job.searchRadius; y <= building.y + job.searchRadius; y++) {
        for (let x = building.x - job.searchRadius; x <= building.x + job.searchRadius; x++) {
          const tile = World.getTile(x, y), distance = Math.hypot(x - building.x, y - building.y);
          if (tile.terrainType === job.sourceTerrain && tile.remainingAmount > 0 && distance <= job.searchRadius && distance < targetDistance) {
            targetDistance = distance; target = { x, y, tile };
          }
        }
      }
      if (!target) { worker.status = 'Inga resurser'; return; }

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