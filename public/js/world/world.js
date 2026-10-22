/* Världstillstånd: oändlig terräng i chunks, byggnader och enheter. */
(function (CityBuilder) {
  'use strict';
  const { Utils, Config, Players } = CityBuilder;

  const RIVAL_STEPS = 33;   // delsteg per rival i init: 1 + 24 grova + 6 noggranna + 2 för resurserna runt baserna (för framstegsstapeln)
  const t = (text, variables) => CityBuilder.t(text, variables);

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

    // report(fraction 0-1, text) rapporterar framsteg och ger webbläsaren tid att rita (laddningsstapeln i Game.init). Den anropas
    // högst var 40:e ms, så rapporteringen kostar nästan ingenting. Utan report går allt i ett svep.
    async init(report = () => {}) {
      this.addPlayer(Players.HUMAN, 0, 0);
      const rivals = CityBuilder.Levels?.current?.rivals ?? 1, total = rivals * RIVAL_STEPS;
      let done = 0, last = performance.now();
      const step = async text => {
        done++;
        if (performance.now() - last < 40) return;
        last = performance.now();
        await report(Math.min(1, done / total), text);
      };
      for (let i = 0; i < rivals; i++) this.addPlayer(Players.ENEMY + i, ...await this.rivalSite(Players.ENEMY + i, step));
    },

    // Ny spelare med egen bas och startresurser (samma för alla spelare)
    addPlayer(player, x, y) {
      if (!Players.active.includes(player)) Players.active.push(player);
      const hq = this.placeBuilding('hq', x, y, true, player);
      Object.assign(hq.storedGoods, Config.settings.startingResources);
      return hq;
    },

    // Undersöker marken runt (x, y) inom radius rutor, grovt (sampling var step:e ruta):
    //   nearest  avstånd (rutor) till närmaste ruta av varje terrängtyp i types (saknas typen räknas radius + 10)
    //   blocked  andel vatten och berg inom 24 rutor: dit går det inte att bygga
    survey(x, y, types = Config.world.fairResources, radius = Config.world.fairRadius, step = Config.world.fairStep) {
      const nearest = Object.fromEntries(types.map(type => [type, radius + 10]));
      let blocked = 0, total = 0;
      for (let dy = -radius; dy <= radius; dy += step) for (let dx = -radius; dx <= radius; dx += step) {
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        const type = CityBuilder.Generator.terrainTypeAt(x + dx, y + dy);
        if (type in nearest && distance < nearest[type]) nearest[type] = distance;
        if (distance <= 24) { total++; if (type === 'water' || type === 'mountain') blocked++; }
      }
      return { nearest, blocked: blocked / total };
    },

    // Var en datorspelares bas ligger: 100-150 rutor från starten. Av 24 platser (riktning och avstånd sprids ut, start slumpas av bana och spelarnummer)
    // väljs den med minst vatten och berg runt sig (de sex bästa jämförs) och ungefär samma avstånd till resurserna som spelarens start (rättvist).
    // En gräsplan läggs in runt basen (clearings), och små fyndigheter av det banan kräver om det saknas i närheten (se endow).
    async rivalSite(player, step = async () => {}) {
      const { rivalDistance: [near, far], rivalClearRadius: clear, fairResources } = Config.world;
      const salt = Config.world.seed * 131 + player * 977;
      const base = Utils.hash(player, 11, salt) * 2 * Math.PI, spread = Utils.hash(player, 12, salt);
      const reference = this.survey(0, 0).nearest;
      await step(t('Surveying the land'));
      // Först en grov koll av vatten och berg på 24 platser, sedan en noggrann jämförelse av de sex bästa
      const sites = [];
      for (let i = 0; i < 24; i++) {
        const angle = base + i * 2.4, distance = near + (far - near) * ((spread + i * .618) % 1);
        const x = Math.round(Math.cos(angle) * distance), y = Math.round(Math.sin(angle) * distance);
        sites.push({ x, y, i, blocked: this.survey(x, y, [], 24, 6).blocked });
        await step(t('Surveying the land'));
      }
      sites.sort((a, b) => a.blocked - b.blocked || a.i - b.i).splice(6);
      let best = null, bestScore = Infinity;
      for (const { x, y, i } of sites) {
        const { nearest, blocked } = this.survey(x, y);
        await step(t('Placing rivals'));
        // skillnad i avstånd, i procent: 10 mot 20 rutor väger lika tungt som 40 mot 80. Ju mer vatten och berg, desto sämre plats.
        const score = fairResources.reduce((sum, type) => sum + Math.abs(Math.log((nearest[type] + 3) / (reference[type] + 3))), 0) + 8 * blocked + i * .01;
        if (score < bestScore) { bestScore = score; best = { x, y }; }
      }
      Config.world.clearings.push({ x: best.x, y: best.y, radius: clear });
      Config.world.meadows.push({ x: best.x, y: best.y });
      Config.world.roads.push({ x1: 0, y1: 0, x2: best.x, y2: best.y, width: 4, wobble: 10, wavelength: 9, phase: Utils.hash(player, 14, salt) * 6.28 });
      if (player === Players.ENEMY) this.endow(Players.HUMAN, 0, 0, salt); // spelarens start, en gång
      await step(t('Placing rivals'));
      this.endow(player, best.x, best.y, salt);
      await step(t('Placing rivals'));
      return [best.x, best.y];
    },

    // Lite av det banan kräver (Levels.current.needs: järn, nya byggnaders terräng, målens råvaror) nära en bas som saknar det,
    // så att varje spelare kan klara banan oavsett kartans tur. Små fyndigheter, aldrig sällsynta.
    endow(player, x, y, salt) {
      const { fairRadius, rivalClearRadius: clear } = Config.world;
      const needs = CityBuilder.Levels?.current?.needs ?? ['iron_ore'];
      const { nearest } = this.survey(x, y, needs);
      needs.forEach((type, index) => {
        if (nearest[type] <= fairRadius * .7) return;
        const angle = Utils.hash(player, 13 + index, salt) * 2 * Math.PI, reach = clear + 4 + index % 3 * 3;
        Config.world.features.push({ x: x + Math.round(Math.cos(angle) * reach), y: y + Math.round(Math.sin(angle) * reach), radius: 2, terrainType: type });
      });
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
      if (this.hqs[building.player] === building) delete this.hqs[building.player];
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
