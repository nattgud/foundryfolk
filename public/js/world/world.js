/* Världstillstånd: oändlig terräng i chunks, byggnader och enheter. */
(function (CityBuilder) {
  'use strict';
  const { Utils, Config, Players } = CityBuilder;

  const WARM_CHUNKS = { human: 3, rival: 2 };   // marken runt varje bas genereras redan vid start: så många chunkar åt varje håll (spelarens bas får mer: den syns)
  const warmCount = player => (2 * (player === Players.HUMAN ? WARM_CHUNKS.human : WARM_CHUNKS.rival) + 1) ** 2;
  const RIVAL_STEPS = 33;   // delsteg per rival i init: 1 + 24 grova + 6 noggranna + 2 för resurserna runt baserna (för framstegsstapeln)
  const SITE_SPREAD = 8;   // hur långt (rutor) från idealplatsen en rivals bas får ligga
  const t = (text, variables) => CityBuilder.t(text, variables);

  const World = {
    chunks: new Map(),          // chunkNyckel -> lista av rutor
    buildingsByTile: new Map(), // rutnyckel -> byggnad
    buildings: [],
    units: [],
    headquarters: null,         // den mänskliga spelarens bas (alla spelares baser finns i hqs)
    hqs: {},                    // spelare -> bas
    nextBuildingId: 1,
    animalsByChunk: new Map(),

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
        // Utgångsläget sparas på chunken, så att sparningen kan se vilka rutor som ändrats (Save.collectTileChanges)
        chunk.cx = chunkX; chunk.cy = chunkY;
        chunk.types = chunk.map(tile => tile.terrainType);
        chunk.amounts = chunk.map(tile => tile.remainingAmount);
        this.chunks.set(chunkKey, chunk);
      }
      return chunk[(y - chunkY * chunkSize) * chunkSize + (x - chunkX * chunkSize)];
    },

    buildingAt: (x, y) => World.buildingsByTile.get(Utils.tileKey(x, y)),

    // Byggnad på rutan som spelaren ser: andras byggnader i dimman finns inte för spelaren (klick, markering och verktygstips)
    seenBuildingAt(x, y) {
      const building = this.buildingAt(x, y);
      return building && CityBuilder.Vision.sees(Players.HUMAN, building) ? building : undefined;
    },

    hqOf(player) { return this.hqs[player]; },

    // report(fraction 0-1, text) rapporterar framsteg och ger webbläsaren tid att rita (laddningsstapeln i Game.init). Den anropas
    // högst var 40:e ms, så rapporteringen kostar nästan ingenting. Utan report går allt i ett svep.
    async init(report = () => {}) {
      CityBuilder.Vision.reset();
      CityBuilder.Spells.reset();
      CityBuilder.Weather.reset();
      Players.team = { ...CityBuilder.Levels?.current?.teams };
      this.addPlayer(Players.HUMAN, 0, 0);
      const rivals = CityBuilder.Levels?.current?.rivals ?? 1, total = rivals * RIVAL_STEPS + warmCount(Players.HUMAN) + rivals * warmCount(Players.ENEMY);
      let done = 0, last = performance.now();
      const step = async text => {
        done++;
        if (performance.now() - last < 40) return;
        last = performance.now();
        await report(Math.min(1, done / total), text);
      };
      if (!rivals) this.endow(Players.HUMAN, 0, 0, Config.world.seed * 131 + Players.ENEMY * 977);   // annars gör rivalSite det (spelarens start, en gång)
      for (let i = 0; i < rivals; i++) this.addPlayer(Players.ENEMY + i, ...await this.rivalSite(Players.ENEMY + i, i, rivals, step));
      await this.warm(step);
    },

    // Genererar marken runt varje bas medan laddningsstapeln visas. Annars sker det mitt i spelet, när datorspelarna börjar bygga
    // och synfältet växer, och då hackar det: de första chunkarna är dessutom långsammast (koden är inte varmkörd).
    async warm(step = async () => {}) {
      const size = Config.settings.chunkSize;
      for (const hq of Object.values(this.hqs)) {
        const baseX = Math.floor(hq.x / size), baseY = Math.floor(hq.y / size), reach = hq.player === Players.HUMAN ? WARM_CHUNKS.human : WARM_CHUNKS.rival;
        for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
          this.getTile((baseX + dx) * size, (baseY + dy) * size);
          await step(t('Creating world'));
        }
      }
    },

    // Ny spelare med egen bas och startresurser (samma för alla spelare)
    addPlayer(player, x, y) {
      if (!Players.active.includes(player)) Players.active.push(player);
      const hq = this.placeBuilding('hq', x, y, true, player);
      Object.assign(hq.storedGoods, CityBuilder.Levels ? CityBuilder.Levels.startingResources() : Config.settings.startingResources);
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

    // Idealplatsen för rival nummer index av count (se Config.world.rivalLayouts), utan hänsyn till marken
    idealSite(index, count) {
      const { rivalDistance: [near, far], rivalLayouts } = Config.world;
      const layout = rivalLayouts[count] || Array.from({ length: count }, (_, i) => [i * 360 / count, 1]);
      const turn = Utils.hash(0, 11, Config.world.seed * 131) * 2 * Math.PI, [degrees, factor] = layout[index];
      const angle = turn + degrees * Math.PI / 180, distance = (near + far) / 2 * factor;
      return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
    },

    // Var en datorspelares bas ligger: runt en idealplats 60-90 rutor från starten (Config.world.rivalLayouts: alla baser får ungefär lika långt till varandra).
    // Av 24 platser nära idealplatsen väljs den med minst vatten och berg runt sig (de sex bästa jämförs) och ungefär samma avstånd till resurserna som spelarens start (rättvist).
    // En gräsplan läggs in runt basen (clearings), och små fyndigheter av det banan kräver om det saknas i närheten (se endow).
    async rivalSite(player, index = 0, count = 1, step = async () => {}) {
      const { rivalClearRadius: clear, fairResources } = Config.world;
      const salt = Config.world.seed * 131 + player * 977;
      const ideal = this.idealSite(index, count);
      const reference = this.survey(0, 0).nearest;
      await step(t('Surveying the land'));
      // Först en grov koll av vatten och berg på 24 platser, sedan en noggrann jämförelse av de sex bästa
      const sites = [];
      for (let i = 0; i < 24; i++) {
        const angle = i * 2.4, offset = SITE_SPREAD * Math.sqrt((i + .5) / 24);
        const x = Math.round(ideal.x + Math.cos(angle) * offset), y = Math.round(ideal.y + Math.sin(angle) * offset);
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
      const required = [].concat(Config.buildings[buildingType].placeOnTerrain || 'grass');   // en eller flera tillåtna terrängtyper
      return !this.buildingAt(x, y) && required.includes(this.getTile(x, y).terrainType);
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
