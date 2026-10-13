/* Enhetsmotor: stegkö med A*-vägar (arbetare och bärare). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Pathfinder, Jobs, Economy, Logistics, Behaviors, Utils } = CityBuilder;

  const DEER = {
    foodRadius: 3,       // Sök efter mat inom 3 rutor
    eatSeconds: 1,       // Tid för att äta
    spreadChance: Config.settings.deerSpreadChance,  // 20 % chans att sprida efter en måltid
    wanderRadius: 6,     // Maximalt avstånd till vandringsmålet
    idleCooldown: 0.5,   // Tid mellan nya beslut
    maxFoodPerTile: 10,
    maxSpreadDistance: 8,
  };

  const DEER_FOOD_TYPES = new Set([
    'apple_tree',
    'berry_bush',
    'herbs',
    'mushrooms',
  ]);

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
      if ((unit.idleCooldown -= deltaSeconds) > 0) return;
      unit.idleCooldown = 0.5;
      unit.status = '';

      if (unit.kind === 'deer') {
        unit.idleCooldown = DEER.idleCooldown;

        // Efter måltiden måste hjorten flytta sig först.
        if (unit.deerMustMoveAfterMeal) {
          this.queueDeerWander(unit, true);
          return;
        }

        // En väntande resurs måste spridas innan hjorten äter igen.
        if (unit.deerSpreadPending && unit.deerLastEaten) {
          this.queueDeerWander(unit, true);
          return;
        }

        // Mat inom räckhåll prioriteras framför vandring.
        const food = this.findDeerFood(unit);

        if (food) {
          unit.stepQueue = [
            Jobs.walkTo(food.x, food.y),
            Jobs.wait(DEER.eatSeconds, 'Eating'),
            Jobs.run(() => {
              const tile = World.getTile(food.x, food.y);

              if (
                tile.terrainType !== food.type ||
                tile.remainingAmount <= 0
              ) {
                return false;
              }

              const eatenAmount = Math.min(
                DEER.maxFoodPerTile,
                tile.remainingAmount
              );

              tile.remainingAmount -= eatenAmount;

              unit.deerLastEaten = {
                type: food.type,
                amount: eatenAmount,
              };

              unit.deerMealTile = {
                x: food.x,
                y: food.y,
              };

              unit.deerMustMoveAfterMeal = true;
              unit.deerSpreadPending =
                Math.random() < DEER.spreadChance;

              if (tile.remainingAmount <= 0) {
                Utils.assign(tile, Config.terrain.grass, {
                  terrainType: 'grass',
                  remainingAmount: 0
                });
                Pathfinder.clearCache();
              }

              unit.status = 'Eating';
            }),
          ];

          return;
        }

        this.queueDeerWander(unit, false);
        return;
      }

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

    findDeerFood(unit) {
      const cx = Math.floor(unit.x);
      const cy = Math.floor(unit.y);
      const radius = DEER.foodRadius;
      let nearest = null;
      let nearestDistance = Infinity;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const distance = Math.hypot(dx, dy);

          if (distance > radius) continue;

          const x = cx + dx;
          const y = cy + dy;
          const tile = World.getTile(x, y);

          if (!DEER_FOOD_TYPES.has(tile.terrainType)) continue;
          if (tile.remainingAmount <= 0) continue;

          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = {
              x,
              y,
              type: tile.terrainType,
            };
          }
        }
      }

      return nearest;
    },
    
    queueDeerWander(unit, mustMove) {
      const cx = Math.floor(unit.x);
      const cy = Math.floor(unit.y);
      const radius = DEER.wanderRadius;
      const candidates = [];

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;

          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > radius * radius) continue;

          const x = cx + dx;
          const y = cy + dy;

          // En väntande resurs får inte föras längre än 8 rutor
          // från platsen där hjorten åt.
          if (unit.deerSpreadPending && unit.deerMealTile) {
            const fromMealX = x - unit.deerMealTile.x;
            const fromMealY = y - unit.deerMealTile.y;

            if (
              fromMealX * fromMealX + fromMealY * fromMealY >
              DEER.maxSpreadDistance * DEER.maxSpreadDistance
            ) {
              continue;
            }
          }

          const tile = World.getTile(x, y);

          if (
            tile.terrainType !== 'grass' &&
            tile.terrainType !== 'tree'
          ) {
            continue;
          }

          candidates.push({ x, y });
        }
      }

      if (candidates.length === 0) {
        unit.idleCooldown = 1;
        unit.status = 'Wandering';
        return;
      }

      const target = candidates[
        Math.floor(Math.random() * candidates.length)
      ];

      unit.stepQueue = [
        Jobs.walkTo(target.x, target.y),
        Jobs.run(() => {
          const x = Math.floor(unit.x);
          const y = Math.floor(unit.y);

          if (
            unit.deerMustMoveAfterMeal &&
            unit.deerMealTile &&
            (x !== unit.deerMealTile.x ||
            y !== unit.deerMealTile.y)
          ) {
            unit.deerMustMoveAfterMeal = false;
          }

          // Försök sprida först efter att hjorten har flyttat sig.
          this.tryDeerSpread(unit);
        }),
      ];

      unit.status = 'Wandering';
    },
    
    
    tryDeerSpread(unit) {
      if (unit.deerMustMoveAfterMeal) return;

      const x = Math.floor(unit.x);
      const y = Math.floor(unit.y);
      const tile = World.getTile(x, y);

      // Skapa aldrig resurser på annat än gräs.
      if (tile.terrainType !== 'grass') return;

      // Trädchans är oberoende av vilken växt hjorten åt.
      if (Math.random() < Config.settings.deerTreeSpreadChance) {
        Utils.assign(tile, Config.terrain.tree, {
          terrainType: "tree",
          remainingAmount: Math.ceil(Math.random()*2)
        });

        unit.deerLastEaten = null;
        unit.deerMealTile = null;
        unit.deerSpreadPending = false;
        unit.deerMustMoveAfterMeal = false;

        Pathfinder.clearCache();
        return;
      }

      // Om ingen växtspridning väntar finns inget att plantera.
      if (!unit.deerSpreadPending || !unit.deerLastEaten) {
        unit.deerLastEaten = null;
        unit.deerMealTile = null;
        unit.deerSpreadPending = false;
        return;
      }

      const eaten = unit.deerLastEaten;

      Utils.assign(tile, Config.terrain[eaten.type], {
        terrainType: eaten.type,
        remainingAmount: eaten.amount * 2
      });

      unit.deerLastEaten = null;
      unit.deerMealTile = null;
      unit.deerSpreadPending = false;
      unit.deerMustMoveAfterMeal = false;

      Pathfinder.clearCache();
    },




    handlePathFailure(unit) {
      unit.stepQueue.length = 0; unit.idleCooldown = 1; unit.status = 'Ingen väg';
      Logistics.abortTask(unit);
    },
  };

  CityBuilder.Units = Units;
})(window.CityBuilder);