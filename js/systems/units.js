/* Enhetsmotor: stegkö med A*-vägar (arbetare och bärare). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Pathfinder, Jobs, Economy, Logistics, Behaviors } = CityBuilder;

  const Units = {
    update(unit, deltaSeconds) {
      const step = unit.stepQueue[0];
      if (!step) return this.handleIdle(unit, deltaSeconds);

      if (step.kind === 'walk') this.walk(unit, step, deltaSeconds);
      else if (step.kind === 'wait') {
        unit.status = step.statusText;
        if ((step.secondsLeft -= deltaSeconds) <= 0) unit.stepQueue.shift();
      } else {
        if (step.action(unit) === false) unit.stepQueue.length = 0; else unit.stepQueue.shift();
      }
    },

    walk(unit, step, deltaSeconds) {
      if (!step.path) {
        const path = Pathfinder.findPath(Math.floor(unit.x), Math.floor(unit.y), step.targetX, step.targetY, step.stopBeforeTarget);
        if (path === undefined) return;             // sökbudgeten slut, försök igen nästa bildruta
        if (!path) return this.handlePathFailure(unit);
        step.path = path; step.pathIndex = 0;
      }
      if (step.pathIndex >= step.path.length) { unit.stepQueue.shift(); return; }

      const nextTile = step.path[step.pathIndex], tileCost = Pathfinder.tileCost(nextTile.x, nextTile.y);
      const isTarget = nextTile.x === step.targetX && nextTile.y === step.targetY;
      if (tileCost === Infinity && !isTarget) { Pathfinder.clearCache(); step.path = null; return; } // vägen blockerades -> räkna om

      const dx = nextTile.x + .5 - unit.x, dy = nextTile.y + .5 - unit.y, distance = Math.hypot(dx, dy);
      const stepLength = Config.settings.walkSpeed * (unit.definition.speedMultiplier || 1) * deltaSeconds / (tileCost === Infinity ? 1 : tileCost);
      unit.status = 'Walking';

      if (distance <= stepLength) {
        unit.x = nextTile.x + .5; unit.y = nextTile.y + .5; step.pathIndex++;
        if (unit.definition.wearsPaths) { // trampar upp stigen
          const tile = World.getTile(nextTile.x, nextTile.y);
          tile.wear = Math.min(2, tile.wear + Config.settings.wearPerPass);
        }
      } else {
        unit.x += dx / distance * stepLength; unit.y += dy / distance * stepLength;
      }
    },

    handleIdle(unit, deltaSeconds) {
      unit.status = '';
      if ((unit.idleCooldown -= deltaSeconds) > 0) return;
      unit.idleCooldown = .5;
      if (unit.homeBuilding) { // arbetare planerar nytt arbetspass
        if (!unit.homeBuilding.paused) Behaviors.get(unit.homeBuilding.definition.job.kind).planWork(unit);
        else unit.status = 'Pausad';
        return;
      }
      if (unit.carriedResource) { // frisläppt bärare med last lämnar in i närmaste lager
        const storage = Economy.nearestStorage(unit);
        unit.stepQueue = [
          Jobs.walkTo(storage.x, storage.y),
          Jobs.run(() => { Economy.addToNearestStorage(unit.carriedResource, 1, storage); unit.carriedResource = null; }),
        ];
      }
    },

    handlePathFailure(unit) {
      unit.stepQueue.length = 0; unit.idleCooldown = 1; unit.status = 'Ingen väg';
      Logistics.abortTask(unit);
    },
  };

  CityBuilder.Units = Units;
})(window.CityBuilder);