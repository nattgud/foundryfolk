/* Världstillstånd: oändlig terräng i chunks, byggnader och enheter. */
(function (CityBuilder) {
  'use strict';
  const { Utils, Config } = CityBuilder;

  const World = {
    chunks: new Map(),          // chunkNyckel -> lista av rutor
    buildingsByTile: new Map(), // rutnyckel -> byggnad
    buildings: [],
    units: [],
    headquarters: null,
    nextBuildingId: 1,

    // Ruta: { terrainType, remainingAmount, wear }
    getTile(x, y) {
      const chunkSize = Config.settings.chunkSize;
      const chunkX = Math.floor(x / chunkSize), chunkY = Math.floor(y / chunkSize);
      const chunkKey = Utils.tileKey(chunkX, chunkY);
      let chunk = this.chunks.get(chunkKey);
      if (!chunk) {
        chunk = [];
        for (let row = 0; row < chunkSize; row++) for (let column = 0; column < chunkSize; column++) {
          const terrainType = CityBuilder.Generator.terrainTypeAt(chunkX * chunkSize + column, chunkY * chunkSize + row);
          chunk.push({ terrainType, remainingAmount: Config.terrain[terrainType].resourceAmount || 0, wear: 0 });
        }
        this.chunks.set(chunkKey, chunk);
      }
      return chunk[(y - chunkY * chunkSize) * chunkSize + (x - chunkX * chunkSize)];
    },

    buildingAt: (x, y) => World.buildingsByTile.get(Utils.tileKey(x, y)),

    init() {
      this.headquarters = this.placeBuilding('hq', 0, 0, true);
      Object.assign(this.headquarters.storedGoods, Config.settings.startingResources);
    },

    canPlace(buildingType, x, y) {
      const requiredTerrain = Config.buildings[buildingType].placeOnTerrain || 'grass';
      return !this.buildingAt(x, y) && this.getTile(x, y).terrainType === requiredTerrain;
    },

    placeBuilding(buildingType, x, y, isInstant) {
      const building = {
        id: this.nextBuildingId++, type: buildingType, definition: Config.buildings[buildingType], x, y,
        buildProgress: isInstant ? 1 : 0, paused: false, removed: false,
        inputStock: {},       // levererade insatser
        outputStock: {},      // färdiga produkter i utbufferten
        incomingCount: {},    // insatser som är på väg hit
        outputReserved: {},   // utbuffert reserverad för pågående leveranser
        storedGoods: {},      // innehåll (endast lager)
        storedReserved: {},   // lagerinnehåll reserverat för pågående leveranser
        status: '', isCrafting: false, craftTimeLeft: 0, workerUnit: null,
      };
      this.buildings.push(building);
      this.buildingsByTile.set(Utils.tileKey(x, y), building);
      CityBuilder.Pathfinder.clearCache();
      return building;
    },

    removeBuilding(building) {
      building.removed = true;
      this.buildingsByTile.delete(Utils.tileKey(building.x, building.y));
      CityBuilder.Pathfinder.clearCache();
      this.buildings = this.buildings.filter(other => other !== building);
      this.units = this.units.filter(unit => unit.homeBuilding !== building);
    },

    // homeBuilding = byggnaden enheten arbetar åt (endast arbetare)
    spawnUnit(kind, x, y, homeBuilding) {
      const unit = {
        kind, definition: Config.units[kind], x: x + .5, y: y + .5, homeBuilding,
        stepQueue: [], carriedResource: null, idleCooldown: 0, status: '',
        deliveryTask: null, hasPickedUp: false,
      };
      this.units.push(unit);
      return unit;
    },
  };

  CityBuilder.World = World;
})(window.CityBuilder);
