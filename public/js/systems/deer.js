
(function (CityBuilder) {
  'use strict';

  const { Config, World, Utils } = CityBuilder;

  const Deer = {
    randomForChunk(chunkX, chunkY) {
      const seed = String(CityBuilder.Levels?.runSeed ?? 1);
      let value = 2166136261;

      for (let i = 0; i < seed.length; i++) {
        value = Math.imul(value ^ seed.charCodeAt(i), 16777619);
      }

      value = (
        value ^
        Math.imul(chunkX, 374761393) ^
        Math.imul(chunkY, 668265263)
      ) >>> 0;

      return function () {
        value = (value + 0x6D2B79F5) >>> 0;

        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    ensureChunk(chunkX, chunkY) {
      const key = Utils.tileKey(chunkX, chunkY);

      if (World.deerByChunk.has(key)) return;

      const size = Config.settings.chunkSize;
      const random = this.randomForChunk(chunkX, chunkY);
      const candidates = [];

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const tileX = chunkX * size + x;
          const tileY = chunkY * size + y;
          const tile = World.getTile(tileX, tileY);

          if (
            (tile.terrainType === 'grass' ||
             tile.terrainType === 'tree') &&
            !World.buildingAt(tileX, tileY)
          ) {
            candidates.push({ x: tileX, y: tileY });
          }
        }
      }

      const deer = [];
      const count = Config.settings.deerPerChunk;

      for (let i = 0; i < count && candidates.length > 0; i++) {
        const index = Math.floor(random() * candidates.length);
        const position = candidates.splice(index, 1)[0];

        deer.push({
          id: `${key}:${i}`,
          x: position.x + 0.5,
          y: position.y + 0.5,
          dead: false,
          deerLastEaten: null,
          deerMealTile: null,
          deerMustMoveAfterMeal: false,
          deerSpreadPending: false
        });
      }

      World.deerByChunk.set(key, deer);
    },
	
    // Hjortar finns bara i världen där någon spelare ser (Vision.activeChunks): där kan de jagas, och ingen annanstans behövs de.
    updateActivation() {
      const activeKeys = new Set();
      const spawned = new Set(); // hjortposter som redan har en enhet i världen
      for (const unit of World.units) if (unit.deerRecordId) spawned.add(unit.deerRecordId);

      // Skapa data och aktivera hjortar i de chunkar som syns.
      for (const { cx: chunkX, cy: chunkY } of CityBuilder.Vision.activeChunks) {
        const key = Utils.tileKey(chunkX, chunkY);
        activeKeys.add(key);
        this.ensureChunk(chunkX, chunkY);

        for (const record of World.deerByChunk.get(key)) {
          if (record.dead || spawned.has(record.id)) continue;

          // spawnUnit lägger till 0.5 till koordinaterna.
          const unit = World.spawnUnit('deer', record.x - 0.5, record.y - 0.5);
          unit.deerRecordId = record.id;
          unit.deerChunkKey = key;
          unit.deerLastEaten = record.deerLastEaten;
          unit.deerMealTile = record.deerMealTile;
          unit.deerMustMoveAfterMeal = record.deerMustMoveAfterMeal;
          unit.deerSpreadPending = record.deerSpreadPending;
        }
      }

      // Spara tillstånd och avaktivera hjortar utanför området.
      const remainingUnits = [];

      for (const unit of World.units) {
        if (!unit.deerRecordId) {
          remainingUnits.push(unit);
          continue;
        }

        if (activeKeys.has(unit.deerChunkKey)) {
          remainingUnits.push(unit);
          continue;
        }

        const records = World.deerByChunk.get(unit.deerChunkKey);
        const record = records?.find(
          deer => deer.id === unit.deerRecordId
        );

        if (record) {
          record.x = unit.x;
          record.y = unit.y;
          record.deerLastEaten = unit.deerLastEaten;
          record.deerMealTile = unit.deerMealTile;
          record.deerMustMoveAfterMeal =
            unit.deerMustMoveAfterMeal;
          record.deerSpreadPending = unit.deerSpreadPending;
        }
      }

      World.units = remainingUnits;
    },
	syncActive() {
      for (const unit of World.units) {
        if (!unit.deerRecordId) continue;

        const records = World.deerByChunk.get(unit.deerChunkKey);
        const record = records?.find(
          deer => deer.id === unit.deerRecordId
        );

        if (!record) continue;

        record.x = unit.x;
        record.y = unit.y;
        record.deerLastEaten = unit.deerLastEaten;
        record.deerMealTile = unit.deerMealTile;
        record.deerMustMoveAfterMeal =
          unit.deerMustMoveAfterMeal;
        record.deerSpreadPending = unit.deerSpreadPending;
      }
    },
  };

  CityBuilder.Deer = Deer;
})(window.CityBuilder);
