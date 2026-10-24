/* Enhetsmotor: stegkö med A*-vägar (arbetare och bärare). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Pathfinder, Jobs, Economy, Logistics, Behaviors, Utils } = CityBuilder;

  const ANIMAL = {
    foodRadius: 3, 
    eatSeconds: 4,
    eatCooldown: 30,
    spreadChance: 0.1,
    wanderRadius: 8,
    idleCooldown: 1,
    maxFoodPerTile: 5,
    maxSpreadDistance: 6,
    breedChancePerSecond: 2 / 1000, // chans per speltidssekund att få en unge vid normal täthet (snitt ca 8 min mellan ungar per djur)
    breedCooldown: 60,              // speltid i sekunder innan samma djur (eller ungen) kan få en ny unge
    maxPopulation: 400,             // säkerhetsgräns för prestanda: inga fler djur än så här i världen
  };

  const ANIMAL_FOOD_TYPES = new Set([
    'apple_tree',
    'berry_bush',
    'herbs',
    'mushrooms',
  ]);

  // Djur sprider en mat bara om spelaren kan ta hand om den: både jakt och plockning av just den maten måste vara upplåsta
  const ANIMAL_FOOD_BUILDING = { apple_tree: 'apple_gatherer', berry_bush: 'berry_gatherer', herbs: 'herb_gatherer', mushrooms: 'mushroom_gatherer' };
  const huntingUnlocked = () => !CityBuilder.Levels || CityBuilder.Levels.isUnlocked('hunters_cottage');
  const animalMayEat = type => huntingUnlocked() && (!CityBuilder.Levels || CityBuilder.Levels.isUnlocked(ANIMAL_FOOD_BUILDING[type]));

  const Units = {
    update(unit, deltaSeconds) {
      if (unit.definition.isAnimal && unit.animalEatCooldown > 0) {
        unit.animalEatCooldown = Math.max(
          0,
          unit.animalEatCooldown - deltaSeconds
        );
      }
      if (unit.definition.isAnimal && unit.huntedBy) {
        const hunter = unit.huntedBy;
        const step = hunter.stepQueue[0];

        // Stanna medan jägaren fortfarande fångar just denna djur.
        if (
          step &&
          step.kind === 'followUnit' &&
          step.target === unit &&
          !hunter.removed
        ) {
          const sameTile =
            Math.floor(hunter.x) === Math.floor(unit.x) &&
            Math.floor(hunter.y) === Math.floor(unit.y);

          if (sameTile) {
            unit.status = 'Hunted';
            return;
          }
        }

        // Jakten är avslutad eller avbruten: släpp djuret fri.
        unit.huntedBy = null;
      }
      if (unit.definition.isAnimal) {
        if (unit.animalBreedCooldown > 0) unit.animalBreedCooldown -= deltaSeconds;
        else if (Math.random() < ANIMAL.breedChancePerSecond * (1 + Config.settings.animalBreeding.boost) * deltaSeconds) this.tryAnimalBreed(unit);
      }

      const step = unit.stepQueue[0];
      if (!step) return this.handleIdle(unit, deltaSeconds);

      if (step.kind === 'walk') this.walk(unit, step, deltaSeconds);
      else if (step.kind === 'wait') {
        unit.status = step.statusText;
        if ((step.secondsLeft -= deltaSeconds) <= 0) unit.stepQueue.shift();
      } else if (step.kind === 'followUnit') {
        const result = this.followUnit(unit, step, deltaSeconds);
        if (result === false) {
          unit.stepQueue.length = 0;
        } else if (result === true) {
          unit.stepQueue.shift();
        }
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
      if (step.pathIndex >= step.path.length) {
        if (step.kind === 'followUnit') {
          step.path = null;
          step.pathIndex = 0;
        } else {
          unit.stepQueue.shift();
        }
        return;
      }

      const nextTile = step.path[step.pathIndex], tileCost = Pathfinder.tileCost(nextTile.x, nextTile.y);
      const isTarget = nextTile.x === step.targetX && nextTile.y === step.targetY;
      if (tileCost === Infinity && !isTarget) { Pathfinder.drop(step.path); step.path = null; return; } // vägen blockerades -> räkna om

      const dx = nextTile.x + .5 - unit.x, dy = nextTile.y + .5 - unit.y, distance = Math.hypot(dx, dy);
      const stepLength = Config.settings.walkSpeed * (unit.definition.speedMultiplier || 1) * deltaSeconds / (tileCost === Infinity ? 1 : tileCost);
      unit.status = 'Walking';

      if (distance <= stepLength) {
        unit.x = nextTile.x + .5; unit.y = nextTile.y + .5; step.pathIndex++;
        if (unit.definition.wearsPaths) { // trampar upp stigen
          const tile = World.getTile(nextTile.x, nextTile.y);
          tile.wear = Math.min(2, tile.wear + Config.settings.wearPerPass);
          CityBuilder.Systems.pathDecay?.touch(tile); // startar om stigens vilotid (pathdecay.js)
        }
      } else {
        unit.x += dx / distance * stepLength; unit.y += dy / distance * stepLength;
      }
    },

    followUnit(unit, step, deltaSeconds) {
      const prey = step.target;
      if (prey.huntedBy && prey.huntedBy !== unit) {
        return false;
      }

      // Bytet har försvunnit eller matchar inte längre jobbet.
      if (prey.removed || !Behaviors.unitMatches(prey, step.job)) {
        return false;
      }

      const preyTileX = Math.floor(prey.x);
      const preyTileY = Math.floor(prey.y);

      const unitTileX = Math.floor(unit.x);
      const unitTileY = Math.floor(unit.y);

      // Jägaren och djuret befinner sig på samma tile.
      if (unitTileX === preyTileX && unitTileY === preyTileY) {
        prey.huntedBy = unit;
        step.path = null;
        step.pathIndex = 0;

        if (step.secondsLeft === null) {
          step.secondsLeft = step.workSeconds;
        }

        unit.status = step.statusText;
        step.secondsLeft -= deltaSeconds;

        if (step.secondsLeft <= 0) {
          // Kontrollera igen innan fångsten genomförs.
          if (
            prey.removed ||
            !Behaviors.unitMatches(prey, step.job) ||
            Math.floor(prey.x) !== Math.floor(unit.x) ||
            Math.floor(prey.y) !== Math.floor(unit.y)
          ) {
            step.secondsLeft = null;
            return;
          }

          Behaviors.removeUnit(prey);
          unit.carriedResource = step.outputResource;

          return true;
        }

        return;
      }

      // Djuret har lämnat jägaren: jaktmomentet börjar om.
      step.secondsLeft = null;

      // Beräkna om rutten endast när djuret byter tile.
      if (
        step.targetX !== preyTileX ||
        step.targetY !== preyTileY
      ) {
        step.targetX = preyTileX;
        step.targetY = preyTileY;
        step.path = null;
        step.pathIndex = 0;
      }

      // Återanvänd spelets befintliga rörelselogik.
      this.walk(unit, step, deltaSeconds);
    },

    handleIdle(unit, deltaSeconds) {
      if ((unit.idleCooldown -= deltaSeconds) > 0) return;
      unit.idleCooldown = 0.5;
      unit.status = '';

      if (unit.definition.isAnimal) {
        unit.idleCooldown = ANIMAL.idleCooldown;

        if (unit.animalMustMoveAfterMeal) {
          this.queueAnimalWander(unit, true);
          return;
        }

        // En väntande resurs måste spridas innan djuret äter igen.
        if (unit.animalSpreadPending && unit.animalLastEaten) {
          this.queueAnimalWander(unit, true);
          return;
        }

        if (unit.animalEatCooldown > 0) {
          this.queueAnimalWander(unit, false);
          return;
        }

        // Mat inom räckhåll prioriteras framför vandring.
        const food = this.findAnimalFood(unit);

        if (food) {
          unit.stepQueue = [
            Jobs.walkTo(food.x, food.y),
            Jobs.wait(ANIMAL.eatSeconds, 'Eating'),
            Jobs.run(() => {
              const tile = World.getTile(food.x, food.y);

              if (
                tile.terrainType !== food.type ||
                tile.remainingAmount <= 0
              ) {
                return false;
              }

              const eatenAmount = Math.min(
                tile.remainingAmount,
                1 + Math.floor(Math.random() * ANIMAL.maxFoodPerTile)
              );

              tile.remainingAmount -= eatenAmount;

              unit.animalLastEaten = {
                type: food.type,
                amount: eatenAmount,
              };

              unit.animalMealTile = {
                x: food.x,
                y: food.y,
              };

              unit.animalMustMoveAfterMeal = true;
              unit.animalSpreadPending = true;

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

        this.queueAnimalWander(unit, false);
        return;
      }

      if (unit.homeBuilding) { // arbetare planerar nytt arbetspass
        if (!unit.homeBuilding.paused) Behaviors.get(unit.homeBuilding.definition.job.kind).planWork(unit);
        else unit.status = 'Paused';
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

    findAnimalFood(unit) {
      const cx = Math.floor(unit.x);
      const cy = Math.floor(unit.y);
      const radius = ANIMAL.foodRadius;
      let nearest = null;
      let nearestDistance = Infinity;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const distance = Math.hypot(dx, dy);

          if (distance > radius) continue;

          const x = cx + dx;
          const y = cy + dy;
          const tile = World.getTile(x, y);

          if (!ANIMAL_FOOD_TYPES.has(tile.terrainType) || !animalMayEat(tile.terrainType)) continue;
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
    
    queueAnimalWander(unit, mustMove) {
      const cx = Math.floor(unit.x);
      const cy = Math.floor(unit.y);
      const radius = ANIMAL.wanderRadius;
      const candidates = [];

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;

          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > radius * radius) continue;

          const x = cx + dx;
          const y = cy + dy;

          // En väntande resurs får inte föras längre än 8 rutor
          // från platsen där djuret åt.
          if (unit.animalSpreadPending && unit.animalMealTile) {
            const fromMealX = x - unit.animalMealTile.x;
            const fromMealY = y - unit.animalMealTile.y;

            if (
              fromMealX * fromMealX + fromMealY * fromMealY >
              ANIMAL.maxSpreadDistance * ANIMAL.maxSpreadDistance
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
            unit.animalMustMoveAfterMeal &&
            unit.animalMealTile &&
            (x !== unit.animalMealTile.x ||
            y !== unit.animalMealTile.y)
          ) {
            unit.animalMustMoveAfterMeal = false;
          }

          // Försök sprida först efter att djuret har flyttat sig.
          this.tryAnimalSpread(unit);
        }),
      ];

      unit.status = 'Wandering';
    },
    
    tryAnimalSpread(unit) {
      if (unit.animalMustMoveAfterMeal) return;

      const x = Math.floor(unit.x);
      const y = Math.floor(unit.y);
      const tile = World.getTile(x, y);

      // Spridning får bara ske på gräs.
      if (tile.terrainType !== 'grass') return;

      // 1. Återför alltid den uppätna växten först.
      if (unit.animalLastEaten) {
        const eaten = unit.animalLastEaten;

        Utils.assign(tile, Config.terrain[eaten.type], {
          terrainType: eaten.type,
          remainingAmount: Math.max(
            1,
            Math.round(eaten.amount * 1.2)
          )
        });

        unit.animalEatCooldown = ANIMAL.eatCooldown;
        unit.animalLastEaten = null;
        unit.animalMealTile = null;
        unit.animalSpreadPending = false;
        unit.animalMustMoveAfterMeal = false;

        Pathfinder.clearCache();
        return;
      }

      // 2. Träd får spridas separat, även när ingen växtåterföring väntar.
      if (Math.random() < Config.settings.animalTreeSpreadChance) {
        Utils.assign(tile, Config.terrain.tree, {
          terrainType: 'tree',
          remainingAmount: Math.ceil(Math.random() * 2)
        });

        Pathfinder.clearCache();
      }
    },

    // Förökning styrs av hur många djur som finns i närheten: tomt runt omkring ger (1 + boost) gånger så ofta ungar,
    // och chansen sjunker jämnt till noll när det finns 'capacity' djur i närheten. Ett lokalt område kan jagas tomt, men inte en hel region.
    // Anropas med den högsta möjliga chansen och gallrar här ner till den verkliga.
    tryAnimalBreed(unit) {
      const { radius, capacity, dispersal } = Config.settings.animalBreeding;
      if (!huntingUnlocked()) return; // utan jakt får djuren inte föröka sig

      let population = 0, nearby = 0;
      for (const other of World.units) {
        if (!other.definition.isAnimal) continue;
        population++;
        if (other !== unit && Math.hypot(other.x - unit.x, other.y - unit.y) <= radius) nearby++;
      }
      if (population >= ANIMAL.maxPopulation || Math.random() < nearby / capacity) return;

      // Ungen föds på en ledig gräs- eller trädruta i närheten (annars på samma ruta)
      const cx = Math.floor(unit.x), cy = Math.floor(unit.y);
      const spots = [];
      for (let dy = -dispersal; dy <= dispersal; dy++) {
        for (let dx = -dispersal; dx <= dispersal; dx++) {
          if (!dx && !dy) continue;
          const terrainType = World.getTile(cx + dx, cy + dy).terrainType;
          if (terrainType === 'grass' || terrainType === 'tree') spots.push({ x: cx + dx, y: cy + dy });
        }
      }
      const spot = spots.length ? spots[Math.floor(Math.random() * spots.length)] : { x: cx, y: cy };
      const young = CityBuilder.Animals.spawnYoung(unit.kind, spot.x, spot.y);
      unit.animalBreedCooldown = young.animalBreedCooldown = ANIMAL.breedCooldown;
    },

    handlePathFailure(unit) {
      unit.stepQueue.length = 0; unit.idleCooldown = 1; unit.status = "Can't reach";
      Logistics.failTask(unit);
      if (unit.definition.isSoldier) CityBuilder.Combat.onPathFailure(unit);
    },
  };

  CityBuilder.Units = Units;
})(window.CityBuilder);