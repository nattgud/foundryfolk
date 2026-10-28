/* Väder och dygn. Dygnet (Weather.time) går i dag, skymning, natt och gryning; månen är uppe på natten (Weather.isNight, för formler och
   talismaner). Vädret byter slumpvis (Config.settings.weather):
     clear    ingen effekt, vanligast
     rain     växter (träd, bär, örter, svamp, äpplen) får större mängd på samma ruta
     storm    växter blåser ibland till en ledig grannruta
     fog      synfältet från byggnader och enheter krymper (Vision läser Weather.visionFactor)
     tornado  rycker upp växter inom några rutor och släpper dem som några högar när den dött ut
     volcano  sällsynt händelse (inte en väderruta): lava över vatten mellan två landmassor (blir gräs) eller över land vid berg (blir malm)
   Rutnätet skannas bara i de chunkar spelaren ser. Ritas av lagret 'weather' (render/layers.js). Sparas med spelet. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players, Utils, Vision } = CityBuilder;

  const between = ([low, high]) => low + Utils.random() * (high - low);
  const rand = ([low, high]) => low + Math.floor(Utils.random() * (high - low + 1));
  const smooth = x => x * x * (3 - 2 * x);
  const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

  const Weather = {
    time: 0, type: 'clear', left: 60, scanIn: 0, tornadoIn: 0, flash: 0, flashIn: 8,
    tornadoes: [],   // { x, y, radius, age, ripped, collected }
    volcanoes: [],   // { kind: 'link' | 'peak', x, y, age, pace, life, plan: [[x, y], ...], lit, tick, ores }

    reset() {
      const settings = Config.settings.weather;
      Object.assign(this, { time: settings.dayLength * settings.startFraction, type: 'clear', left: between([settings.minSeconds, settings.maxSeconds]), scanIn: 0, tornadoIn: 0, flash: 0, flashIn: 8, tornadoes: [], volcanoes: [] });
    },

    snapshot() { return { time: this.time, type: this.type, left: this.left, tornadoes: this.tornadoes, volcanoes: this.volcanoes }; },
    restore(data) {
      this.reset();
      if (data) Object.assign(this, { time: data.time, type: data.type, left: data.left, tornadoes: data.tornadoes || [], volcanoes: data.volcanoes || [] });
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
      let roll = Utils.random() * options.reduce((sum, [, weight]) => sum + weight, 0);
      this.type = options.find(([, weight]) => (roll -= weight) < 0)?.[0] || 'clear';
      if (this.type === 'volcano') { this.type = 'clear'; this.erupt(); }   // en händelse, inget väder: himlen är klar medan lavan rinner
      else CityBuilder.Sound?.play('weather.' + this.type);
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
        for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) if (Utils.distance(dx, dy) <= zone.radius) check(zone.x + dx, zone.y + dy);
        return;
      }
      for (const { cx, cy } of Vision.activeChunks) for (let y = cy * size; y < (cy + 1) * size; y++) for (let x = cx * size; x < (cx + 1) * size; x++) check(x, y);
    },

    hasPlants(zone) { let found = false; this.forEachPlant(() => { found = true; }, zone); return found; },

    touchesWater(x, y) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (World.getTile(x + dx, y + dy)?.terrainType === 'water') return true; return false; },

    isFree(x, y) { const tile = World.getTile(x, y); return !!tile && tile.terrainType === 'grass' && !tile.wear && !World.buildingAt(x, y); },

    // Regn eller storm på växterna: hela kartan, eller bara inom en trollformels zon (zone.factor ökar chansen)
    affectPlants(type = this.type, zone) {
      const settings = Config.settings.weather, boost = zone?.factor || 1;
      if (type === 'rain') {
        this.forEachPlant(tile => {
          if (Utils.random() < settings.rain.chance * boost) tile.remainingAmount = Math.min(tile.remainingAmount + 1, Math.ceil(Config.terrain[tile.terrainType].resourceAmount * settings.rain.cap));
        }, zone);
      } else if (type === 'storm') {
        const moves = [];
        this.forEachPlant((tile, x, y) => { if (Utils.random() < settings.storm.chance * boost) moves.push({ tile, x, y }); }, zone);
        for (const { tile, x, y } of moves) {
          const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].filter(([dx, dy]) => this.isFree(x + dx, y + dy));
          if (!spots.length) continue;
          const [dx, dy] = spots[Math.floor(Utils.random() * spots.length)], plant = tile.terrainType, amount = tile.remainingAmount;
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
        const home = homes[Math.floor(Utils.random() * homes.length)], angle = Utils.random() * Math.PI * 2, distance = 6 + Utils.random() * 22;
        const x = Math.round(home.x + Math.cos(angle) * distance), y = Math.round(home.y + Math.sin(angle) * distance), tile = World.getTile(x, y);
        if (!tile || !Vision.visible(Players.HUMAN, x, y)) continue;
        if (growth[tile.terrainType]) return { x, y };
        if (!fallback && tile.terrainType === 'grass') fallback = { x, y };
      }
      return fallback;
    },

    // Tar 'takes' ur varje växtruta inom radien och minns vad det gav. Är rutan tom blir den gräs.
    rip(tornado) {
      const settings = Config.settings.weather.tornado, centreX = Math.round(tornado.x), centreY = Math.round(tornado.y), reach = Math.ceil(tornado.radius);
      let cleared = false;
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        if (Utils.distance(dx, dy) > tornado.radius) continue;
        const tile = World.getTile(centreX + dx, centreY + dy), type = tile?.terrainType, extra = settings.also[type];
        const resource = extra ? extra.gives : Config.settings.weather.growth[type];
        if (!tile || !(extra || resource) || !(tile.remainingAmount > 0)) continue;
        const taken = Math.min(extra?.takes ?? settings.takes, Math.ceil(tile.remainingAmount));
        if (resource) {
          const room = extra ? settings.keep - (tornado.collected[resource] || 0) : taken;
          if (room > 0) tornado.collected[resource] = (tornado.collected[resource] || 0) + Math.min(taken, room);
        }
        tile.remainingAmount -= taken;
        if (tile.remainingAmount > 0) continue;
        Utils.assign(tile, Config.terrain.grass, { terrainType: 'grass', remainingAmount: 0 });
        cleared = true;
      }
      if (cleared) CityBuilder.Pathfinder.clearCache();
    },

    // Släpper det som fångats som några högar på lediga rutor runt platsen
    drop(tornado) {
      const settings = Config.settings.weather.tornado, centreX = Math.round(tornado.x), centreY = Math.round(tornado.y), reach = Math.ceil(tornado.radius) + 1, spots = [];
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        if (Utils.distance(dx, dy) <= tornado.radius + 1 && this.isFree(centreX + dx, centreY + dy)) spots.push({ x: centreX + dx, y: centreY + dy });
      }
      // Vatten och sand blir först nya rutor nära mitten (högst 2 rutor bort), aldrig högar
      let landed = false;
      for (const resource in settings.land) {
        let left = tornado.collected[resource] || 0;
        delete tornado.collected[resource];
        const shore = settings.shoreOnly.includes(resource);   // sand läggs bara direkt intill vatten, så strandremsan aldrig blir bredare än en ruta
        const near = spots.filter(spot => shore ? this.touchesWater(spot.x, spot.y) : Utils.distance(spot.x - centreX, spot.y - centreY) <= 2);
        while (left > 0 && near.length) {
          const spot = near.splice(Math.floor(Utils.random() * near.length), 1)[0], amount = Math.min(left, settings.land[resource]);
          spots.splice(spots.indexOf(spot), 1);
          Utils.assign(World.getTile(spot.x, spot.y), Config.terrain[resource], { terrainType: resource, remainingAmount: amount });
          left -= amount; landed = true;
        }
      }
      if (landed) CityBuilder.Pathfinder.clearCache();
      const count = Math.min(spots.length, rand(settings.piles)), piles = Array.from({ length: count }, () => ({}));
      if (!count) return;
      for (const resource in tornado.collected) for (let n = 0; n < tornado.collected[resource]; n++) {
        const pile = piles[Math.floor(Utils.random() * count)];
        pile[resource] = (pile[resource] || 0) + 1;
      }
      for (const pile of piles) {
        const spot = spots.splice(Math.floor(Utils.random() * spots.length), 1)[0];
        CityBuilder.Construction.dropPile(spot.x, spot.y, Players.HUMAN, pile);
      }
    },

    // En ny tornado på platsen (radie i rutor, livslängd i sekunder), med slumpad fart
    spawnTornado(x, y, radius, life) {
      const settings = Config.settings.weather.tornado;
      this.tornadoes.push({ x, y, radius, age: 0, collected: {}, life, speed: between(settings.speed), angle: Utils.random() * Math.PI * 2, tick: settings.tickSeconds });
    },

    // Klart väder i 'seconds' sekunder (längre om det redan skulle vara klart längre). Pågående tornados släpper det de tagit.
    clearSky(seconds) {
      for (const tornado of this.tornadoes) this.drop(tornado);
      this.tornadoes = [];
      this.type = 'clear';
      this.left = Math.max(this.left, seconds);
    },

    updateTornadoes(deltaSeconds) {
      const settings = Config.settings.weather.tornado;
      if (this.type === 'tornado' && (this.tornadoIn -= deltaSeconds) <= 0) {
        this.tornadoIn = between(settings.every);
        const spot = this.tornadoSpot();
        if (spot) this.spawnTornado(spot.x, spot.y, rand(settings.radius), Utils.random() < settings.longChance ? settings.longLife : between(settings.life));
      }
      for (const tornado of this.tornadoes) {
        tornado.age += deltaSeconds;
        tornado.angle = (tornado.angle ?? 0) + (Utils.random() - 0.5) * 2 * settings.turn * deltaSeconds;   // slingrar sakta
        const speed = tornado.speed ?? 0.5;
        tornado.x += Math.cos(tornado.angle) * speed * deltaSeconds; tornado.y += Math.sin(tornado.angle) * speed * deltaSeconds;
        if ((tornado.tick = (tornado.tick ?? settings.tickSeconds) - deltaSeconds) <= 0) { tornado.tick += settings.tickSeconds; this.rip(tornado); }
        if (tornado.age >= (tornado.life ?? 7)) { this.drop(tornado); tornado.done = true; }
      }
      if (this.tornadoes.some(tornado => tornado.done)) this.tornadoes = this.tornadoes.filter(tornado => !tornado.done);
    },

    /* ---------- Vulkaner ---------- */

    // Ingen lavaruta får ligga i närheten av någon spelares huvudlager
    farFromHq(x, y) { return Object.values(World.hqs).every(hq => Utils.distance(hq.x - x, hq.y - y) >= Config.settings.weather.volcano.minHq); },

    isLand(x, y) { const type = World.getTile(x, y)?.terrainType; return !!type && type !== 'water' && type !== 'lava'; },

    // En slumpad plats på 'near' avstånd från en av spelarens byggnader
    volcanoPoint() {
      const homes = World.buildings.filter(building => building.player === Players.HUMAN && !building.definition.pile);
      if (!homes.length) return null;
      const home = homes[Math.floor(Utils.random() * homes.length)], angle = Utils.random() * Math.PI * 2, distance = between(Config.settings.weather.volcano.near);
      return { x: Math.round(home.x + Math.cos(angle) * distance), y: Math.round(home.y + Math.sin(angle) * distance) };
    },

    // Närmaste ruta (inom 'reach') som uppfyller 'test', undersökt i slumpad ordning på samma avstånd
    findNear(point, reach, test) {
      const spots = [];
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) spots.push({ x: point.x + dx, y: point.y + dy, d: Utils.distance(dx, dy) + Utils.random() * 0.5 });
      return spots.sort((a, b) => a.d - b.d).find(spot => spot.d <= reach && test(spot.x, spot.y)) || null;
    },

    // Alla landrutor som hänger ihop med (x, y), högst 'cap' (stora landmassor räknas som fullt ihängande)
    landmass(x, y, cap = 1500) {
      const seen = new Set([Utils.tileKey(x, y)]), queue = [[x, y]];
      for (let i = 0; i < queue.length && seen.size < cap; i++) for (const [dx, dy] of DIRECTIONS) {
        const nx = queue[i][0] + dx, ny = queue[i][1] + dy, key = Utils.tileKey(nx, ny);
        if (!seen.has(key) && this.isLand(nx, ny)) { seen.add(key); queue.push([nx, ny]); }
      }
      return seen;
    },

    // Kortaste led över vatten från en strand till en annan landmassa (rutor att fylla med lava), eller null
    crossingPlan() {
      const settings = Config.settings.weather.volcano, point = this.volcanoPoint();
      if (!point) return null;
      const shore = this.findNear(point, 12, (x, y) => this.isLand(x, y) && DIRECTIONS.some(([dx, dy]) => World.getTile(x + dx, y + dy)?.terrainType === 'water'));
      if (!shore) return null;
      const home = this.landmass(shore.x, shore.y), parent = new Map(), queue = [];
      for (const [dx, dy] of DIRECTIONS) {
        const x = shore.x + dx, y = shore.y + dy;
        if (World.getTile(x, y)?.terrainType === 'water') { const step = { x, y, depth: 1 }; parent.set(Utils.tileKey(x, y), null); queue.push(step); }
      }
      for (let i = 0; i < queue.length; i++) {
        const { x, y, depth } = queue[i];
        if (DIRECTIONS.some(([dx, dy]) => this.isLand(x + dx, y + dy) && !home.has(Utils.tileKey(x + dx, y + dy)))) {
          const path = [];
          for (let step = queue[i]; step; step = parent.get(Utils.tileKey(step.x, step.y))) path.push([step.x, step.y]);
          return path.reverse();
        }
        if (depth >= settings.crossing) continue;
        for (const [dx, dy] of DIRECTIONS) {
          const nx = x + dx, ny = y + dy, key = Utils.tileKey(nx, ny);
          if (parent.has(key) || World.getTile(nx, ny)?.terrainType !== 'water') continue;
          parent.set(key, queue[i]); queue.push({ x: nx, y: ny, depth: depth + 1 });
        }
      }
      return null;
    },

    // Utbrott mellan två landmassor: leden vidgas till 1-3 rutor
    linkPlan() {
      const path = this.crossingPlan();
      if (!path) return null;
      const settings = Config.settings.weather.volcano, width = rand(settings.width), tiles = new Map(path.map(([x, y]) => [Utils.tileKey(x, y), [x, y]]));
      if (width > 1) for (const [x, y] of path) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((width === 3 || Utils.random() < 0.5) && World.getTile(x + dx, y + dy)?.terrainType === 'water') tiles.set(Utils.tileKey(x + dx, y + dy), [x + dx, y + dy]);
      }
      return { start: path[path.length >> 1], tiles: [...tiles.values()] };
    },

    // Utbrott på land vid ett berg: en liten klump lavarutor som växer ut från en ruta intill berget
    peakPlan() {
      const settings = Config.settings.weather.volcano, point = this.volcanoPoint();
      if (!point) return null;
      const mountain = this.findNear(point, 10, (x, y) => World.getTile(x, y)?.terrainType === 'mountain');
      const start = mountain && this.findNear(mountain, 3, (x, y) => this.isLand(x, y) && World.getTile(x, y).terrainType !== 'mountain');
      if (!start) return null;
      const radius = rand(settings.diameter) / 2, reach = Math.ceil(radius), tiles = [];
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        const distance = Utils.distance(dx, dy), type = World.getTile(start.x + dx, start.y + dy)?.terrainType;
        if (distance > radius || !type || type === 'water' || type === 'lava' || type === 'mountain') continue;
        if (distance > radius - 0.6 && Utils.random() < 0.25) continue;   // kanten blir ojämn
        tiles.push([start.x + dx, start.y + dy]);
      }
      return { start: [start.x, start.y], tiles: [...tiles.values()] };
    },

    // Ett utbrott (kind = 'link' eller 'peak', annars slumpat). Brister planen (ingen plats, för nära ett huvudlager) provas nästa försök, sedan den andra sorten.
    erupt(kind) {
      const settings = Config.settings.weather.volcano, kinds = Object.keys(settings.kinds);
      let roll = Utils.random() * kinds.reduce((sum, name) => sum + settings.kinds[name], 0);
      const first = kind || kinds.find(name => (roll -= settings.kinds[name]) < 0) || kinds[0];
      for (const name of [first, ...kinds.filter(other => other !== first)]) for (let attempt = 0; attempt < 60; attempt++) {
        const plan = this[name + 'Plan']();
        if (!plan || !plan.tiles.length || !plan.tiles.every(([x, y]) => this.farFromHq(x, y))) continue;
        const [sx, sy] = plan.start, from = ([x, y]) => Utils.distance(x - sx, y - sy) + Utils.random();
        const volcano = { kind: name, x: sx, y: sy, age: 0, pace: between(settings.paceSeconds), life: 0, plan: plan.tiles.map(tile => ({ tile, d: from(tile) })).sort((a, b) => a.d - b.d).map(({ tile }) => tile), lit: 0, tick: 1, ores: name === 'peak' ? this.pickOres() : null };
        volcano.life = volcano.plan.length * volcano.pace + between(settings.lifeSeconds);   // spridningen tar plan.length * pace, sedan ligger lavan het
        this.volcanoes.push(volcano);
        this.updateVolcano(volcano, 0);
        CityBuilder.Sound?.play('weather.volcano');
        CityBuilder.Sound?.play('alarm');
        CityBuilder.UI?.showToast(CityBuilder.t('A volcano is erupting! Lava destroys buildings until it cools'));
        return volcano;
      }
      return null;
    },

    // Två malmsorter slumpade efter vikt bland dem spelaren låst upp (en gruva för dem finns); ovanliga väger tyngre
    pickOres() {
      const weights = Config.settings.weather.volcano.ores, Levels = CityBuilder.Levels;
      const open = ore => Object.entries(Config.buildings).some(([id, building]) => building.job?.sourceTerrain === ore && (!Levels || Levels.isUnlocked(id)));
      let options = Object.keys(weights).filter(open);
      if (!options.length) options = Object.keys(weights);
      return Array.from({ length: 2 }, () => {
        let roll = Utils.random() * options.reduce((sum, ore) => sum + weights[ore], 0);
        return options.find(ore => (roll -= weights[ore]) < 0) || options[0];
      });
    },

    // Tänder lava på planens första 'count' rutor och river det som står på dem
    ignite(volcano, count) {
      count = Math.min(count, volcano.plan.length);
      if (volcano.lit >= count) return;
      while (volcano.lit < count) {
        const [x, y] = volcano.plan[volcano.lit++], tile = World.getTile(x, y), building = World.buildingAt(x, y);
        if (building) CityBuilder.Combat.kill(building);
        Utils.assign(tile, Config.terrain.lava, { terrainType: 'lava', remainingAmount: 0 });
        tile.wear = 0;
      }
      CityBuilder.Pathfinder.clearCache();
    },

    updateVolcano(volcano, deltaSeconds) {
      const settings = Config.settings.weather.volcano;
      volcano.age += deltaSeconds;
      if (volcano.age >= volcano.life) return this.cool(volcano);
      // Lavan sprider sig ruta för ruta
      this.ignite(volcano, Math.max(1, Math.floor(volcano.age / volcano.pace) + 1));
      if (deltaSeconds > 0 && (volcano.tick -= deltaSeconds) > 0) return;
      volcano.tick = 1;
      const hot = volcano.plan.slice(0, volcano.lit), burning = new Set(hot.map(([x, y]) => Utils.tileKey(x, y))), scorched = new Set();
      for (const unit of [...World.units]) if (burning.has(Utils.tileKey(Math.floor(unit.x), Math.floor(unit.y)))) CityBuilder.Combat.kill(unit);
      for (const [x, y] of hot) for (const [dx, dy] of AROUND) {
        const building = World.buildingAt(x + dx, y + dy);
        if (!building || building.removed || scorched.has(building)) continue;
        scorched.add(building);
        if (building.hp == null) continue;
        building.hp -= settings.heat;
        if (building.hp <= 0) CityBuilder.Combat.kill(building);
      }
    },

    // Lavan stelnar: leden blir gräs (en bro), lavan vid berget blir malm
    cool(volcano) {
      const settings = Config.settings.weather.volcano;
      this.ignite(volcano, volcano.plan.length);   // en lång paus (laddat spel, hög fart) hoppar inte över rutor
      for (const [x, y] of volcano.plan) {
        const tile = World.getTile(x, y);
        if (tile?.terrainType !== 'lava') continue;
        const ore = volcano.ores && Utils.random() < 0.85 ? volcano.ores[Math.floor(Utils.random() * volcano.ores.length)] : null;
        if (ore) Utils.assign(tile, Config.terrain[ore], { terrainType: ore, remainingAmount: Math.ceil((Config.terrain[ore].resourceAmount || 1) * settings.oreAmount) });
        else Utils.assign(tile, Config.terrain.grass, { terrainType: 'grass', remainingAmount: 0 });
      }
      volcano.done = true;
      CityBuilder.Pathfinder.clearCache();
    },

    updateVolcanoes(deltaSeconds) {
      for (const volcano of this.volcanoes) this.updateVolcano(volcano, deltaSeconds);
      if (this.volcanoes.some(volcano => volcano.done)) this.volcanoes = this.volcanoes.filter(volcano => !volcano.done);
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
      Weather.updateVolcanoes(deltaSeconds);
      if (Weather.type === 'storm' && (Weather.flashIn -= deltaSeconds) <= 0) { Weather.flash = 1; Weather.flashIn = 6 + Math.random() * 9; CityBuilder.Sound?.play('weather.thunder'); }   // blixt
      Weather.flash = Math.max(0, Weather.flash - deltaSeconds * 2.5);
    },
  };
})(window.CityBuilder);
