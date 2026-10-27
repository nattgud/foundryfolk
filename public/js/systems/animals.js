
(function (CityBuilder) {
  'use strict';

  const { Config, World, Utils } = CityBuilder;

  const STATE_FIELDS = ['animalLastEaten', 'animalMealTile', 'animalMustMoveAfterMeal', 'animalSpreadPending'];
  const DEFAULTS = { dead: false, animalLastEaten: null, animalMealTile: null, animalMustMoveAfterMeal: false, animalSpreadPending: false };   // utelämnas i sparningen (migrate fyller i dem)

  const Animals = {
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

      if (World.animalsByChunk.has(key)) return;

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

      const animal = [];
      const count = Config.settings.animalPerChunk;

      for (let i = 0; i < count && candidates.length > 0; i++) {
        const index = Math.floor(random() * candidates.length);
        const position = candidates.splice(index, 1)[0];

        animal.push({
          id: `${key}:${i}`,
          kind: this.pickKind(random()),
          x: position.x + 0.5,
          y: position.y + 0.5,
          dead: false,
          animalLastEaten: null,
          animalMealTile: null,
          animalMustMoveAfterMeal: false,
          animalSpreadPending: false
        });
      }

      World.animalsByChunk.set(key, animal);
    },
	

    // Arten för ett slumptal 0..1, viktat med spawnWeight i enhetsdefinitionerna
    pickKind(roll) {
      const kinds = this.kinds();
      let left = roll * kinds.reduce((sum, kind) => sum + (Config.units[kind].spawnWeight ?? 1), 0);
      for (const kind of kinds) if ((left -= Config.units[kind].spawnWeight ?? 1) < 0) return kind;
      return kinds[0];
    },

    kinds: () => Object.keys(Config.units).filter(kind => Config.units[kind].isAnimal),

    // Gör en post till en enhet i världen
    activate(record, key) {
      // spawnUnit lägger till 0.5 till koordinaterna.
      const unit = World.spawnUnit(record.kind, record.x - 0.5, record.y - 0.5);
      unit.animalRecordId = record.id;
      unit.animalChunkKey = key;
      for (const field of STATE_FIELDS) unit[field] = record[field];
      return unit;
    },

    // En unge får en egen post i chunken där den föds, så den följer samma regler som övriga djur
    spawnYoung(kind, tileX, tileY) {
      const size = Config.settings.chunkSize, chunkX = Math.floor(tileX / size), chunkY = Math.floor(tileY / size);
      this.ensureChunk(chunkX, chunkY);
      const key = Utils.tileKey(chunkX, chunkY), records = World.animalsByChunk.get(key);
      const record = { id: `${key}:${records.length}`, kind, x: tileX + 0.5, y: tileY + 0.5, dead: false, animalLastEaten: null, animalMealTile: null, animalMustMoveAfterMeal: false, animalSpreadPending: false };
      records.push(record);
      return this.activate(record, key);
    },

    // Posterna i sparningen utan det som har sitt standardvärde (ett dött djur behöver bara id och dead: sparningen blev annars mest standardvärden)
    pack(entries) {
      return entries.map(([key, records]) => [key, records.map(record => {
        if (record.dead) return { id: record.id, dead: true };
        const packed = {};
        for (const field in record) if (!(field in DEFAULTS) || record[field] !== DEFAULTS[field]) packed[field] = record[field];
        return packed;
      })]);
    },

    // Äldre sparfiler: hjortar hette deer*, och posterna saknade art. Utelämnade fält får sina standardvärden.
    migrate(entries) {
      for (const [, records] of entries) for (const record of records) {
        record.kind ??= 'deer';
        for (const field in DEFAULTS) record[field] ??= DEFAULTS[field];
        for (const field of STATE_FIELDS) {
          const old = 'deer' + field.slice(6);
          if (old in record) { record[field] = record[old]; delete record[old]; }
        }
      }
      return entries;
    },

    // Djur finns bara i världen där någon spelare ser (Vision.activeChunks): där kan de jagas, och ingen annanstans behövs de.
    updateActivation() {
      const activeKeys = new Set();
      const spawned = new Set(); // djurposter som redan har en enhet i världen
      for (const unit of World.units) if (unit.animalRecordId) spawned.add(unit.animalRecordId);

      // Skapa data och aktivera djur i de chunkar som syns.
      for (const { cx: chunkX, cy: chunkY } of CityBuilder.Vision.activeChunks) {
        const key = Utils.tileKey(chunkX, chunkY);
        activeKeys.add(key);
        this.ensureChunk(chunkX, chunkY);

        for (const record of World.animalsByChunk.get(key)) {
          if (record.dead || spawned.has(record.id)) continue;

          this.activate(record, key);
        }
      }

      // Spara tillstånd och avaktivera djur utanför området.
      const remainingUnits = [];

      for (const unit of World.units) {
        if (!unit.animalRecordId) {
          remainingUnits.push(unit);
          continue;
        }

        if (activeKeys.has(unit.animalChunkKey)) {
          remainingUnits.push(unit);
          continue;
        }

        const records = World.animalsByChunk.get(unit.animalChunkKey);
        const record = records?.find(
          animal => animal.id === unit.animalRecordId
        );

        if (record) this.save(unit, record);
      }

      World.units = remainingUnits;
    },

    // Ett dödat djur ska inte återskapas när chunken aktiveras igen.
    markDead(unit) {
      const record = World.animalsByChunk.get(unit.animalChunkKey)?.find(animal => animal.id === unit.animalRecordId);
      if (record) record.dead = true;
    },

    // Kopierar enhetens läge och tillstånd till posten
    save(unit, record) {
      record.x = unit.x;
      record.y = unit.y;
      for (const field of STATE_FIELDS) record[field] = unit[field];
    },

    syncActive() {
      for (const unit of World.units) {
        if (!unit.animalRecordId) continue;
        const record = World.animalsByChunk.get(unit.animalChunkKey)?.find(animal => animal.id === unit.animalRecordId);
        if (record) this.save(unit, record);
      }
    },
  };

  CityBuilder.Animals = Animals;
})(window.CityBuilder);
