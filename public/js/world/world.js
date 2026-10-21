/* Världstillstånd: oändlig terräng i chunks, byggnader och enheter. */
(function (CityBuilder) {
  'use strict';
  const { Utils, Config, Players } = CityBuilder;

  const World = {
    chunks: new Map(),          // chunkNyckel -> lista av rutor
    buildingsByTile: new Map(), // rutnyckel -> byggnad
    buildings: [],
    units: [],
    headquarters: null,         // den mänskliga spelarens bas (alla spelares baser finns i hqs)
    hqs: {},                    // spelare -> bas
    nextBuildingId: 1,
    deerByChunk: new Map(),

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

    hqOf(player) { return this.hqs[player]; },

    init() {
      this.addPlayer(Players.HUMAN, 0, 0);
      const rivals = CityBuilder.Levels?.current?.rivals ?? 1;
      for (let i = 0; i < rivals; i++) this.addPlayer(Players.ENEMY + i, ...this.rivalSite(Players.ENEMY + i));
    },

    // Ny spelare med egen bas och startresurser (samma för alla spelare)
    addPlayer(player, x, y) {
      if (!Players.active.includes(player)) Players.active.push(player);
      const hq = this.placeBuilding('hq', x, y, true, player);
      Object.assign(hq.storedGoods, Config.settings.startingResources);
      return hq;
    },

    // Var en datorspelares bas ligger: 100–150 rutor från starten, i en riktning som slumpas av bana och spelarnummer.
    // Provar flera riktningar och väljer den med mest land runt basen. En gräsplan runt basen läggs in i terrängen (clearings).
    rivalSite(player) {
      const { rivalDistance: [near, far], rivalClearRadius: clear } = Config.world;
      const salt = Config.world.seed * 131 + player * 977;
      const base = Utils.hash(player, 11, salt) * 2 * Math.PI, distance = near + (far - near) * Utils.hash(player, 12, salt);
      let best = null, bestScore = -1;
      for (let i = 0; i < 16; i++) { // 16 riktningar, första är den slumpade
        const angle = base + i * Math.PI / 8 * (i % 2 ? 1 : -1), x = Math.round(Math.cos(angle) * distance), y = Math.round(Math.sin(angle) * distance);
        let land = 0, total = 0;
        for (let dy = -12; dy <= 12; dy += 2) for (let dx = -12; dx <= 12; dx += 2, total++) {
          const type = CityBuilder.Generator.terrainTypeAt(x + dx, y + dy);
          if (type !== 'water' && type !== 'mountain') land++;
        }
        const score = land / total - i * .005; // lika bra: hellre den slumpade riktningen
        if (score > bestScore) { bestScore = score; best = [x, y]; }
      }
      Config.world.clearings.push({ x: best[0], y: best[1], radius: clear });
      // Lite järnmalm nära varje bas så att datorn alltid kan tillverka vapen (annars beror det på kartans tur)
      const ore = Utils.hash(player, 13, salt) * 2 * Math.PI;
      Config.world.features.push({ x: best[0] + Math.round(Math.cos(ore) * (clear + 4)), y: best[1] + Math.round(Math.sin(ore) * (clear + 4)), radius: 2, terrainType: 'iron_ore' });
      return best;
    },

    canPlace(buildingType, x, y) {
      const requiredTerrain = Config.buildings[buildingType].placeOnTerrain || 'grass';
      return !this.buildingAt(x, y) && this.getTile(x, y).terrainType === requiredTerrain;
    },

    // player = vem byggnaden tillhör (se core/players.js)
    placeBuilding(buildingType, x, y, isInstant, player = Players.HUMAN) {
      const building = {
        id: this.nextBuildingId++, type: buildingType, definition: Config.buildings[buildingType], x, y, player,
        buildProgress: isInstant ? 1 : 0, paused: false, removed: false,
        inputStock: {},       // levererade insatser
        outputStock: {},      // färdiga produkter i utbufferten
        incomingCount: {},    // insatser som är på väg hit
        outputReserved: {},   // utbuffert reserverad för pågående leveranser
        storedGoods: {},      // innehåll (endast lager)
        storedReserved: {},   // lagerinnehåll reserverat för pågående leveranser
        status: '', isCrafting: false, craftTimeLeft: 0, craftTotalTime: 0, workerUnit: null,
      };
      building.maxHp = building.hp = building.definition.maxHp ?? Config.settings.military.buildingHp;
      if (buildingType === 'hq') {
        this.hqs[player] = building;
        if (player === Players.HUMAN) this.headquarters = building;
      }
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

    // homeBuilding = byggnaden enheten arbetar åt (endast arbetare).
    // player = vem enheten tillhör: det som anges, annars byggnadens ägare, enhetstypens standard eller spelaren.
    spawnUnit(kind, x, y, homeBuilding, player) {
      const definition = Config.units[kind];
      const unit = {
        kind, definition, x: x + .5, y: y + .5, homeBuilding,
        player: player ?? homeBuilding?.player ?? definition.player ?? Players.HUMAN,
        hp: definition.maxHp ?? null,   // null = går inte att skada
        stepQueue: [], carriedResource: null, idleCooldown: 0, status: '',
        deliveryTask: null, hasPickedUp: false,
      };
      this.units.push(unit);
      return unit;
    },
  };

  CityBuilder.World = World;
})(window.CityBuilder);
