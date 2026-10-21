/* Spara och ladda: autosparning (var 30:e sekund och när fliken stängs/döljs) och fem manuella platser.
   Gränssnittet (ui.js) använder: list(), save(id), load(id), newGame().

   Princip: spara bara det som SPELAREN har ändrat. Terrängen genereras ju om exakt likadant från seedet.
   - Terrängrutor: en spårare runt World.getTile tar en kopia av varje ruta första gången den hämtas. Vid
     sparning jämförs rutorna mot kopian och bara ändrade fält sparas (slitage/stigar, förbrukade noder ...).
     Nya fält på rutor sparas alltså automatiskt, utan att den här filen behöver ändras.
   - Byggnader: typ + plats, och alla enkla fält (tal, text, flaggor) samt alla lager (objekt med bara tal).
   - Bärare: antal (arbetare skapas av onBuilt när byggnaden återställs).
   Ladda skriver en "väntande laddning" och laddar om sidan. Vid start (Game.init) återställs då spelet.
   Utan väntande laddning fortsätter spelet från autosparningen om den finns. */
(function (CityBuilder) {
  'use strict';

  const PREFIX = 'citybuilder.save.';
  const PENDING_KEY = 'citybuilder.pendingLoad';
  const SLOT_IDS = ['autosave', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];
  const AUTOSAVE_MS = 30000;
  const FORMAT = 2;
  const BUILDING_SKIP = new Set(['x', 'y', 'id', 'type', 'removed']); // sätts av World när byggnaden skapas

  const read = key => { try { return window.localStorage.getItem(key); } catch (e) { return null; } };
  const write = (key, value) => { try { window.localStorage.setItem(key, value); return true; } catch (e) { console.warn('Kunde inte skriva ' + key, e); return false; } };
  const remove = key => { try { window.localStorage.removeItem(key); } catch (e) { /* ignorera */ } };

  const isPrimitive = value => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
  const isFlatObject = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(isPrimitive);

  // Alla enkla fält och alla "lager" (objekt med bara tal/text) från ett objekt. Allt annat (referenser till
  // enheter, definitioner, köer ...) hoppas över. Det återskapas av spelet självt.
  const captureFields = (object, skip = new Set()) => {
    const fields = {};
    for (const key of Object.keys(object)) {
      if (skip.has(key)) continue;
      const value = object[key];
      if (isPrimitive(value)) fields[key] = value;
      else if (isFlatObject(value)) fields[key] = { ...value };
    }
    return fields;
  };

  const restoreFields = (object, fields) => {
    for (const [key, value] of Object.entries(fields || {})) {
      if (value && typeof value === 'object') {
        if (!object[key] || typeof object[key] !== 'object') object[key] = {};
        for (const old of Object.keys(object[key])) delete object[key][old];
        Object.assign(object[key], value);
      } else {
        object[key] = value;
      }
    }
  };

  const typeOf = building => building.type || Object.keys(CityBuilder.Config.buildings).find(id => CityBuilder.Config.buildings[id] === building.definition);

  const readSlot = id => {
    const raw = read(PREFIX + id);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return data && data.format === FORMAT ? data : null;
    } catch (e) { return null; }
  };

  const Save = {
    tileBaselines: new Map(),   // ruta -> { x, y, base } (kopia av rutans värden när den först hämtades)
    trackerInstalled: false,
    startData: null,            // sparning som ska återställas vid start
    ready: false,               // true när spelet är uppstartat (autosparning före det vore farlig)
    suspended: false,           // true när sidan håller på att laddas om (då får inget skrivas)
    lastError: null,
    timer: null,
    autosaveMs: AUTOSAVE_MS,    // ändras av inställningarna (Options) via setAutosaveInterval

    // Kvar så att äldre anrop inte kraschar. Rutor spåras nu automatiskt.
    noteTile() {},

    // Lägger spåraren runt World.getTile. Måste ske före World.init().
    installTileTracker() {
      const World = CityBuilder.World;
      if (this.trackerInstalled || !World || typeof World.getTile !== 'function') return;
      const original = World.getTile;
      const baselines = this.tileBaselines;
      World.getTile = function (x, y, ...rest) {
        const tile = original.call(this, x, y, ...rest);
        if (tile && !baselines.has(tile)) {
          const base = {};
          for (const key of Object.keys(tile)) if (isPrimitive(tile[key])) base[key] = tile[key];
          baselines.set(tile, { x, y, base });
        }
        return tile;
      };
      this.trackerInstalled = true;
    },

    // Alla rutor som skiljer sig från hur de såg ut när de först hämtades: [[x, y, { fält: värde }], ...]
    collectTileChanges() {
      const changes = [];
      for (const [tile, { x, y, base }] of this.tileBaselines) {
        let changed = null;
        for (const key of Object.keys(tile)) {
          const value = tile[key];
          if (isPrimitive(value) && value !== base[key]) (changed = changed || {})[key] = value;
        }
        if (changed) changes.push([x, y, changed]);
      }
      return changes;
    },

    list() {
      return SLOT_IDS.map(id => ({ id, data: readSlot(id) }))
        .filter(entry => entry.data)
        .map(({ id, data }) => ({ id, savedAt: data.savedAt, level: data.level }));
    },

    capture() {
      const { World, Game } = CityBuilder;
      const headquarters = World.headquarters;

      const buildings = [];
      const snapshots = new Map();
      for (const building of World.buildings) {
        if (building.type === 'hq') continue; // baserna skapas av World.init (även datorspelarnas) och sparas separat

        const type = typeOf(building);
        if (!type) continue;
        const snapshot = { type, x: building.x, y: building.y, fields: captureFields(building, BUILDING_SKIP) };
        buildings.push(snapshot);
        snapshots.set(building, snapshot);
      }

      // Det arbetarna bär på läggs tillbaka i husets utbuffert (rutan är redan nedräknad)
      for (const unit of World.units) {
        if (unit.definition.isHauler || !unit.homeBuilding || typeof unit.carriedResource !== 'string') continue;
        const snapshot = snapshots.get(unit.homeBuilding);
        if (!snapshot) continue;
        snapshot.fields.outputStock = snapshot.fields.outputStock || {};
        snapshot.fields.outputStock[unit.carriedResource] = (snapshot.fields.outputStock[unit.carriedResource] || 0) + 1;
      }

      // Utskickade soldater räknas som hemma i sin byggnad (de går ut igen om fienden finns kvar). Fria soldater sparas var för sig.
      const soldiers = [];
      for (const unit of World.units) {
        if (!unit.definition.isSoldier) continue;
        const snapshot = unit.quarters && snapshots.get(unit.quarters);
        if (snapshot) {
          const garrison = snapshot.fields.garrison = snapshot.fields.garrison || {};
          garrison[unit.kind] = (garrison[unit.kind] || 0) + 1;
        } else {
          soldiers.push({ kind: unit.kind, player: unit.player, x: unit.x, y: unit.y, hp: unit.hp });
        }
      }

      // Datorspelarnas baser. Det deras bärare bär läggs tillbaka i basens lager. Bärarna skapas på nytt av Logistics.
      const rivals = World.buildings.filter(building => building.type === 'hq' && building !== headquarters).map(hq => {
        const fields = captureFields(hq, BUILDING_SKIP);
        for (const unit of World.units) {
          if (unit.player === hq.player && unit.definition.isHauler && typeof unit.carriedResource === 'string') {
            fields.storedGoods = fields.storedGoods || {};
            fields.storedGoods[unit.carriedResource] = (fields.storedGoods[unit.carriedResource] || 0) + 1;
          }
        }
        return { player: hq.player, fields };
      });

      const haulers = World.units.filter(unit => unit.definition.isHauler && unit.player === CityBuilder.Players.HUMAN);
      const carried = {};
      for (const unit of haulers) {
        if (typeof unit.carriedResource === 'string') carried[unit.carriedResource] = (carried[unit.carriedResource] || 0) + 1;
      }

      const levels = CityBuilder.Levels;
      return {
        format: FORMAT,
        savedAt: Date.now(),
        level: levels ? levels.current.level : 1,
        runSeed: levels ? levels.runSeed : null,
        speedIndex: Game ? Game.speedIndex : 0,
        headquarters: captureFields(headquarters, BUILDING_SKIP),
        rivals,
        buildings,
        soldiers,
        carriers: haulers.length,
        carried,
        tiles: this.collectTileChanges(),
        deerChunks: (
          CityBuilder.Deer.syncActive(),
          Array.from(World.deerByChunk.entries())
        ),
      };
    },

    apply(data) {
      const { World, Economy, Game, Config } = CityBuilder;
      const headquarters = World.headquarters;

      // Terrängen först: byggnader och arbetare kan bero på den
      for (const [x, y, changed] of data.tiles || []) {
        const tile = World.getTile(x, y);
        if (tile) Object.assign(tile, changed);
      }
      World.deerByChunk = new Map(data.deerChunks || []);

      for (const saved of data.buildings || []) {
        try {
          const building = World.placeBuilding(saved.type, saved.x, saved.y, false, saved.fields.player) || World.buildingAt(saved.x, saved.y);
          if (!building || building.type === 'hq') continue;

          if (saved.fields.buildProgress !== undefined) building.buildProgress = saved.fields.buildProgress;

          // En färdigbyggd byggnad ska ha gått igenom "just färdigbyggd" (construction-systemet): onBuilt sätter
          // upp t.ex. arbetaren. Det steget hoppas över när vi sätter buildProgress direkt, så vi kör det här.
          if (building.buildProgress >= 1 && building.definition.job) {
            const behavior = CityBuilder.Behaviors && CityBuilder.Behaviors.forBuilding(building);
            if (behavior && behavior.onBuilt) behavior.onBuilt(building);
          }

          restoreFields(building, saved.fields);
        } catch (error) {
          console.warn('Kunde inte återställa byggnaden', saved, error);
        }
      }
      for (const building of World.buildings) {
        building.outputReserved = {};
        building.storedReserved = {};
        building.incomingCount = {};
      }

      restoreFields(headquarters, data.headquarters);
      for (const rival of data.rivals || []) {
        const hq = World.hqOf(rival.player);
        if (hq) restoreFields(hq, rival.fields);
      }

      for (const saved of data.soldiers || []) {
        if (!Config.units[saved.kind]?.isSoldier) continue;
        const unit = CityBuilder.Combat.spawnSoldier(saved.kind, 0, 0, saved.player);
        unit.x = saved.x;
        unit.y = saved.y;
        unit.hp = saved.hp ?? unit.hp;
      }

      const haulers = World.units.filter(unit => unit.definition.isHauler && unit.player === CityBuilder.Players.HUMAN).length;
      for (let i = haulers; i < (data.carriers || 0); i++) World.spawnUnit('carrier', 0, 0);

      // Det bärarna hade i famnen när det sparades lämnas tillbaka i lagret
      for (const [resourceId, amount] of Object.entries(data.carried || {})) {
        Economy.addToNearestStorage(resourceId, amount, headquarters);
      }

      if (Game && Number.isInteger(data.speedIndex) && Config.settings.gameSpeeds[data.speedIndex]) {
        Game.speedIndex = data.speedIndex;
        const speedButton = document.getElementById('speedButton');
        if (speedButton) speedButton.textContent = Config.settings.gameSpeeds[data.speedIndex] + 'x';
      }
    },

    // reason är en engelsk text som ui.js översätter (t.ex. 'unknown save slot'). detail skrivs bara till konsolen.
    fail(reason, detail) {
      this.lastError = reason;
      console.error('Save failed:', reason, detail || '');
      return false;
    },

    // Startar om autosparningens timer med ett nytt intervall (millisekunder)
    setAutosaveInterval(ms) {
      if (!(ms > 0)) return;
      this.autosaveMs = ms;
      if (!this.ready) return; // applyStart startar timern
      clearInterval(this.timer);
      this.timer = setInterval(() => this.save('autosave'), this.autosaveMs);
    },

    // Returnerar true/false. Vid misslyckande finns orsaken i Save.lastError (och i webbläsarens konsol).
    save(id) {
      this.lastError = null;
      if (!SLOT_IDS.includes(id)) return this.fail('unknown save slot', id);
      if (this.suspended) return this.fail('the page is reloading');
      if (!this.ready) return this.fail('the game has not finished starting');

      let json;
      try {
        json = JSON.stringify(this.capture());
      } catch (error) {
        return this.fail('could not read the game state', error);
      }
      if (!write(PREFIX + id, json)) return this.fail('browser storage is full or blocked');
      return true;
    },

    // Laddar sidan på nytt; Game.init återställer sparningen via prepareStart/applyStart
    load(id) {
      if (!readSlot(id)) return false;
      this.suspended = true; // sidan stängs, så den gamla världen får inte autosparas över
      write(PENDING_KEY, id);
      location.reload();
      return true;
    },

    // Nytt spel: ta bort autosparningen och starta om. Manuella sparningar rörs inte.
    newGame() {
      this.suspended = true;
      remove(PREFIX + 'autosave');
      remove(PENDING_KEY);
      location.reload();
    },

    // Anropas först i Game.init: bestämmer vad som ska återställas och ställer in banan före världsgenereringen
    prepareStart() {
      this.installTileTracker();
      const pending = read(PENDING_KEY);
      remove(PENDING_KEY);
      this.startData = readSlot(pending || 'autosave');
      if (this.startData && CityBuilder.Levels) CityBuilder.Levels.restore(this.startData.level, this.startData.runSeed);
    },

    // Anropas sist i Game.init (efter att världen byggts): återställer sparningen och startar autosparningen
    applyStart() {
      const data = this.startData;
      this.startData = null;
      let restored = false;
      if (data) {
        try { this.apply(data); restored = true; } catch (error) { console.error('Kunde inte återställa sparningen', error); }
      }

      this.ready = true;
      clearInterval(this.timer);
      this.timer = setInterval(() => this.save('autosave'), this.autosaveMs);
      addEventListener('pagehide', () => this.save('autosave'));
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.save('autosave'); });
      return restored;
    },
  };

  CityBuilder.Save = Save;
})(window.CityBuilder);