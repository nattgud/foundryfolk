/* Väder och dygn. Dygnet (Weather.time) går i dag, skymning, natt och gryning; månen är uppe på natten (Weather.isNight, för formler och
   talismaner). Vädret byter slumpvis (Config.settings.weather):
     clear    ingen effekt, vanligast
     rain     växter (träd, bär, örter, svamp, äpplen) får större mängd på samma ruta
     storm    växter blåser ibland till en ledig grannruta
     fog      synfältet från byggnader och enheter krymper (Vision läser Weather.visionFactor)
     tornado  rycker upp växter inom några rutor och släpper dem som några högar när den dött ut
   Rutnätet skannas bara i de chunkar spelaren ser. Ritas av lagret 'weather' (render/layers.js). Sparas med spelet. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players, Utils, Vision } = CityBuilder;

  const between = ([low, high]) => low + Math.random() * (high - low);
  const rand = ([low, high]) => low + Math.floor(Math.random() * (high - low + 1));
  const smooth = x => x * x * (3 - 2 * x);

  const Weather = {
    time: 0, type: 'clear', left: 60, scanIn: 0, tornadoIn: 0, flash: 0, flashIn: 8,
    tornadoes: [],   // { x, y, radius, age, ripped, collected }

    reset() {
      const settings = Config.settings.weather;
      Object.assign(this, { time: settings.dayLength * settings.startFraction, type: 'clear', left: between([settings.minSeconds, settings.maxSeconds]), scanIn: 0, tornadoIn: 0, flash: 0, flashIn: 8, tornadoes: [] });
    },

    snapshot() { return { time: this.time, type: this.type, left: this.left, tornadoes: this.tornadoes }; },
    restore(data) {
      this.reset();
      if (data) Object.assign(this, { time: data.time, type: data.type, left: data.left, tornadoes: data.tornadoes || [] });
    },

    // 0 = full dag, 1 = full natt. Dag 0-55 % av dygnet, skymning 55-65, natt 65-90, gryning 90-100.
    darkness() {
      const f = (this.time / Config.settings.weather.dayLength) % 1;
      return smooth(f < 0.55 ? 0 : f < 0.65 ? (f - 0.55) / 0.1 : f < 0.9 ? 1 : 1 - (f - 0.9) / 0.1);
    },
    isNight() { return this.darkness() > 0.5; },
    visionFactor() { return this.type === 'fog' ? Config.settings.weather.fog.vision : 1; },

    next() {
      const settings = Config.settings.weather, options = Object.entries(settings.chances).filter(([type]) => type !== this.type);
      let roll = Math.random() * options.reduce((sum, [, weight]) => sum + weight, 0);
      this.type = options.find(([, weight]) => (roll -= weight) < 0)?.[0] || 'clear';
      this.left = this.type === 'tornado' ? between([30, 60]) : between([settings.minSeconds, settings.maxSeconds]);
      this.tornadoIn = 2;
    },

    // Alla växtrutor i de chunkar som spelaren ser
    // (med zone { x, y, radius }: bara växterna inom den, annars alla)
    forEachPlant(visit, zone) {
      const size = Config.settings.chunkSize, growth = Config.settings.weather.growth;
      const check = (x, y) => {
        const tile = World.getTile(x, y);
        if (tile && growth[tile.terrainType] && tile.remainingAmount > 0 && Vision.visible(Players.HUMAN, x, y)) visit(tile, x, y);
      };
      if (zone) {
        const reach = Math.ceil(zone.radius);
        for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) if (Math.hypot(dx, dy) <= zone.radius) check(zone.x + dx, zone.y + dy);
        return;
      }
      for (const { cx, cy } of Vision.activeChunks) for (let y = cy * size; y < (cy + 1) * size; y++) for (let x = cx * size; x < (cx + 1) * size; x++) check(x, y);
    },

    hasPlants(zone) { let found = false; this.forEachPlant(() => { found = true; }, zone); return found; },

    isFree(x, y) { const tile = World.getTile(x, y); return !!tile && tile.terrainType === 'grass' && !tile.wear && !World.buildingAt(x, y); },

    // Regn eller storm på växterna: hela kartan, eller bara inom en trollformels zon (zone.factor ökar chansen)
    affectPlants(type = this.type, zone) {
      const settings = Config.settings.weather, boost = zone?.factor || 1;
      if (type === 'rain') {
        this.forEachPlant(tile => {
          if (Math.random() < settings.rain.chance * boost) tile.remainingAmount = Math.min(tile.remainingAmount + 1, Math.ceil(Config.terrain[tile.terrainType].resourceAmount * settings.rain.cap));
        }, zone);
      } else if (type === 'storm') {
        const moves = [];
        this.forEachPlant((tile, x, y) => { if (Math.random() < settings.storm.chance * boost) moves.push({ tile, x, y }); }, zone);
        for (const { tile, x, y } of moves) {
          const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].filter(([dx, dy]) => this.isFree(x + dx, y + dy));
          if (!spots.length) continue;
          const [dx, dy] = spots[Math.floor(Math.random() * spots.length)], plant = tile.terrainType, amount = tile.remainingAmount;
          Utils.assign(World.getTile(x + dx, y + dy), Config.terrain[plant], { terrainType: plant, remainingAmount: amount });
          Utils.assign(tile, Config.terrain.grass, { terrainType: 'grass', remainingAmount: 0 });
        }
        if (moves.length) CityBuilder.Pathfinder.clearCache();
      }
    },

    // En plats nära spelarens byggnader som spelaren ser, helst med växter. null om det inte finns någon.
    tornadoSpot() {
      const homes = World.buildings.filter(building => building.player === Players.HUMAN && building.buildProgress >= 1 && !building.definition.pile);
      if (!homes.length) return null;
      const growth = Config.settings.weather.growth;
      let fallback = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        const home = homes[Math.floor(Math.random() * homes.length)], angle = Math.random() * Math.PI * 2, distance = 6 + Math.random() * 22;
        const x = Math.round(home.x + Math.cos(angle) * distance), y = Math.round(home.y + Math.sin(angle) * distance), tile = World.getTile(x, y);
        if (!tile || !Vision.visible(Players.HUMAN, x, y)) continue;
        if (growth[tile.terrainType]) return { x, y };
        if (!fallback && tile.terrainType === 'grass') fallback = { x, y };
      }
      return fallback;
    },

    // Rycker upp växterna inom radien och minns vad de gav
    rip(tornado) {
      const growth = Config.settings.weather.growth, centreX = Math.round(tornado.x), centreY = Math.round(tornado.y), reach = Math.ceil(tornado.radius);
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        if (Math.hypot(dx, dy) > tornado.radius) continue;
        const tile = World.getTile(centreX + dx, centreY + dy), resource = tile && growth[tile.terrainType];
        if (!resource || !(tile.remainingAmount > 0)) continue;
        tornado.collected[resource] = (tornado.collected[resource] || 0) + Math.round(tile.remainingAmount);
        Utils.assign(tile, Config.terrain.grass, { terrainType: 'grass', remainingAmount: 0 });
      }
      CityBuilder.Pathfinder.clearCache();
    },

    // Släpper det som fångats som några högar på lediga rutor runt platsen
    drop(tornado) {
      const settings = Config.settings.weather.tornado, centreX = Math.round(tornado.x), centreY = Math.round(tornado.y), reach = Math.ceil(tornado.radius) + 1, spots = [];
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        if (Math.hypot(dx, dy) <= tornado.radius + 1 && this.isFree(centreX + dx, centreY + dy)) spots.push({ x: centreX + dx, y: centreY + dy });
      }
      const count = Math.min(spots.length, rand(settings.piles)), piles = Array.from({ length: count }, () => ({}));
      if (!count) return;
      for (const resource in tornado.collected) for (let n = 0; n < tornado.collected[resource]; n++) {
        const pile = piles[Math.floor(Math.random() * count)];
        pile[resource] = (pile[resource] || 0) + 1;
      }
      for (const pile of piles) {
        const spot = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
        CityBuilder.Construction.dropPile(spot.x, spot.y, Players.HUMAN, pile);
      }
    },

    updateTornadoes(deltaSeconds) {
      const settings = Config.settings.weather.tornado;
      if (this.type === 'tornado' && (this.tornadoIn -= deltaSeconds) <= 0) {
        this.tornadoIn = between(settings.every);
        const spot = this.tornadoSpot();
        if (spot) this.tornadoes.push({ ...spot, radius: rand(settings.radius), age: 0, ripped: false, collected: {} });
      }
      for (const tornado of this.tornadoes) {
        tornado.age += deltaSeconds;
        const angle = tornado.age * 0.7 + tornado.radius;   // sakta drift
        tornado.x += Math.cos(angle) * settings.speed * deltaSeconds; tornado.y += Math.sin(angle) * settings.speed * deltaSeconds;
        if (!tornado.ripped && tornado.age >= settings.ripAt) { tornado.ripped = true; this.rip(tornado); }
        if (tornado.age >= settings.dropAt) { this.drop(tornado); tornado.done = true; }
      }
      if (this.tornadoes.some(tornado => tornado.done)) this.tornadoes = this.tornadoes.filter(tornado => !tornado.done);
    },
  };
  CityBuilder.Weather = Weather;

  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.weather = {
    update(deltaSeconds) {
      Weather.time += deltaSeconds;
      if ((Weather.left -= deltaSeconds) <= 0) Weather.next();
      if ((Weather.scanIn -= deltaSeconds) <= 0) { Weather.scanIn = Config.settings.weather.scanSeconds; Weather.affectPlants(); }
      Weather.updateTornadoes(deltaSeconds);
      if (Weather.type === 'storm' && (Weather.flashIn -= deltaSeconds) <= 0) { Weather.flash = 1; Weather.flashIn = 6 + Math.random() * 9; }   // blixt
      Weather.flash = Math.max(0, Weather.flash - deltaSeconds * 2.5);
    },
  };
})(window.CityBuilder);
