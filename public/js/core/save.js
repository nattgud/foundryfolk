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
  const SLOT_IDS = ['autosave', 'autocustom', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];
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

  // Byggnader som slagits ihop med andra (äldre sparningar): gammal typ -> [ny typ, vara den gör]. De blir en Toolsmith som bara gör sitt gamla verktyg.
  const MERGED = { hammersmith: ['toolsmith', 'hammer'], picksmith: ['toolsmith', 'pickaxe'], axesmith: ['toolsmith', 'axe'], scythesmith: ['toolsmith', 'scythe'] };

  const BACKUP_KEY = 'citybuilder.backup';   // kopia av en sparning som inte gick att återställa helt (rörs aldrig av autosparningen)

  // Läser en sparning. Finns den men inte går att läsa (trasig eller från en äldre version) hoppas den över och spelaren får veta det.
  const readSlot = id => {
    const raw = read(PREFIX + id);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data && data.format === FORMAT) return data;
      CityBuilder.Errors.notify(`The saved game in slot "${id}" has an unsupported format and was skipped`, 'load');
    } catch (error) { CityBuilder.Errors.report(error, `load: unreadable saved game "${id}"`); }
    return null;
  };

  const Save = {
    startData: null,            // sparning som ska återställas vid start
    ready: false,               // true när spelet är uppstartat (autosparning före det vore farlig)
    suspended: false,           // true när sidan håller på att laddas om (då får inget skrivas)
    lastError: null,
    timer: null,
    autosaveMs: AUTOSAVE_MS,    // ändras av inställningarna (Options) via setAutosaveInterval

    // Kvar så att äldre anrop inte kraschar. Rutor spåras nu automatiskt.
    noteTile() {},

    // Alla rutor som skiljer sig från hur de såg ut när chunken skapades (World.getTile sparar utgångsläget): [[x, y, { fält: värde }], ...]
    collectTileChanges() {
      const changes = [], size = CityBuilder.Config.settings.chunkSize;
      for (const chunk of CityBuilder.World.chunks.values()) {
        for (let index = 0; index < chunk.length; index++) {
          const tile = chunk[index], base = { terrainType: chunk.types[index], remainingAmount: chunk.amounts[index], wear: 0 };
          let changed = null;
          for (const key in tile) {
            const value = tile[key];
            if (key !== 'ground' && isPrimitive(value) && value !== base[key]) (changed = changed || {})[key] = value;
          }
          if (changed) changes.push([chunk.cx * size + index % size, chunk.cy * size + Math.floor(index / size), changed]);
        }
      }
      return changes;
    },

    list() {
      return SLOT_IDS.map(id => ({ id, data: readSlot(id) }))
        .filter(entry => entry.data)
        .map(({ id, data }) => ({ id, savedAt: data.savedAt, level: data.level, custom: !!data.custom }));
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
        for (const [resourceId, amount] of Object.entries(unit.carriedOutputs || { [unit.carriedResource]: 1 })) {
          snapshot.fields.outputStock[resourceId] = (snapshot.fields.outputStock[resourceId] || 0) + amount;
        }
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

      // Spelarens bärare: var de är, vad de bär och vilket uppdrag de är på (byggnaderna anges med sin ruta, de får nya id vid inläsning)
      const haulers = World.units.filter(unit => unit.definition.isHauler && unit.player === CityBuilder.Players.HUMAN);
      const carried = {};
      for (const unit of haulers) {
        if (typeof unit.carriedResource === 'string') carried[unit.carriedResource] = (carried[unit.carriedResource] || 0) + 1;
      }
      const haulerStates = haulers.map(unit => {
        const task = unit.deliveryTask, valid = task && !task.source.removed && !task.destination.removed;
        return {
          x: unit.x - 0.5, y: unit.y - 0.5, carried: typeof unit.carriedResource === 'string' ? unit.carriedResource : null,
          task: valid ? { source: [task.source.x, task.source.y], destination: [task.destination.x, task.destination.y], resource: task.resource, picked: !!unit.hasPickedUp } : null,
        };
      });

      const levels = CityBuilder.Levels;
      return {
        format: FORMAT,
        savedAt: Date.now(),
        level: levels ? levels.current.level : 1,
        runSeed: levels ? levels.runSeed : null,
        custom: levels ? levels.custom || undefined : undefined,   // inställningarna om det är en egen bana
        progress: levels ? levels.snapshot() : undefined,          // målens framsteg och tid hör till just den här sparningen
        speedIndex: Game ? Game.speedIndex : 0,
        spellZones: CityBuilder.Spells.zones,
        spellLocks: CityBuilder.Spells.locks,
        weather: CityBuilder.Weather.snapshot(),
        random: CityBuilder.Utils.randomState,   // slumpgeneratorns läge, så en laddad sparning fortsätter likadant
        headquarters: captureFields(headquarters, BUILDING_SKIP),
        rivals,
        eliminated: CityBuilder.Players.aiPlayers().filter(player => !CityBuilder.Players.active.includes(player)),
        buildings,
        soldiers,
        carriers: haulers.length,
        carried,
        haulers: haulerStates,
        tiles: this.collectTileChanges(),
        animalChunks: (
          CityBuilder.Animals.syncActive(),
          CityBuilder.Animals.pack(Array.from(World.animalsByChunk.entries()))
        ),
      };
    },

    // Återställer en sparning. Varje del för sig, så att ett fel i en inte tar med sig resten. Returnerar antalet delar som misslyckades.
    apply(data) {
      const { World, Economy, Game, Config, Errors } = CityBuilder;
      const headquarters = World.headquarters;
      let failed = 0;
      const part = (name, fn) => { try { fn(); } catch (error) { failed++; Errors.report(error, 'load: ' + name); } };

      // Terrängen först: byggnader och arbetare kan bero på den
      part('terrain', () => {
        for (const [x, y, changed] of data.tiles || []) {
          const tile = World.getTile(x, y);
          if (!tile) continue;
          Object.assign(tile, changed);
          if (changed.wear > 0) CityBuilder.Systems.pathDecay?.touch(tile); // slitna stigar börjar om sin vilotid (pathdecay.js)
        }
      });
      part('spells', () => { CityBuilder.Spells.zones = data.spellZones || []; CityBuilder.Spells.locks = data.spellLocks || {}; });
      part('weather', () => CityBuilder.Weather.restore(data.weather));
      if (Number.isFinite(data.random)) CityBuilder.Utils.seedRandom(data.random);   // äldre sparningar saknar läget och behåller världens seed
      part('animals', () => { World.animalsByChunk = new Map(CityBuilder.Animals.migrate(data.animalChunks || data.deerChunks || [])); });

      for (const saved of data.buildings || []) {
        try {
          const [merged, tool] = MERGED[saved.type] || [];
          if (merged) saved.type = merged;
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
          if (tool) building.recipesOff = building.definition.job.choices.reduce((mask, choice, index) => (tool in choice.outputs ? mask : mask | (1 << index)), 0);
        } catch (error) {
          failed++;
          Errors.report(error, `load: building ${saved && saved.type}`);
        }
      }
      for (const building of World.buildings) {
        building.outputReserved = {};
        building.storedReserved = {};
        building.incomingCount = {};
      }

      part('headquarters', () => restoreFields(headquarters, data.headquarters));
      part('rivals', () => {
        for (const player of data.eliminated || []) CityBuilder.Combat.eliminate(player, true);   // World.init skapar alla rivaler på nytt: de utslagna tas bort igen
        for (const rival of data.rivals || []) {
          const hq = World.hqOf(rival.player);
          if (hq) restoreFields(hq, rival.fields);
        }
      });

      part('soldiers', () => {
        for (const saved of data.soldiers || []) {
          if (!Config.units[saved.kind]?.isSoldier) continue;
          const unit = CityBuilder.Combat.spawnSoldier(saved.kind, 0, 0, saved.player);
          if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) { unit.x = saved.x; unit.y = saved.y; }
          unit.hp = saved.hp ?? unit.hp;
        }
      });

      part('carriers', () => {
        // Nytt format: varje bärare står kvar där den var, bär det den bar och fortsätter sitt uppdrag
        if (Array.isArray(data.haulers)) {
          const { Jobs, Logistics } = CityBuilder, human = CityBuilder.Players.HUMAN;
          World.units = World.units.filter(unit => !(unit.definition.isHauler && unit.player === human));
          for (const saved of data.haulers) {
            if (!Number.isFinite(saved.x) || !Number.isFinite(saved.y)) continue;
            const unit = World.spawnUnit('carrier', saved.x, saved.y, null, human);
            const task = saved.task, source = task && World.buildingAt(...task.source), destination = task && World.buildingAt(...task.destination);
            const carried = Config.resources[saved.carried] ? saved.carried : null;
            if (source && destination && Config.resources[task.resource]) {
              unit.deliveryTask = { source, destination, resource: task.resource, seq: Logistics.seq = (Logistics.seq || 0) + 1, created: Logistics.time || 0 };
              unit.hasPickedUp = !!task.picked && !!carried;
              unit.carriedResource = unit.hasPickedUp ? carried : null;
              unit.stepQueue = [
                ...(unit.hasPickedUp ? [] : [Jobs.walkTo(source.x, source.y), Jobs.run(carrier => Logistics.pickUp(carrier))]),
                Jobs.walkTo(destination.x, destination.y),
                Jobs.run(carrier => Logistics.dropOff(carrier)),
              ];
            } else if (carried) Economy.addToNearestStorage(carried, 1, headquarters);   // uppdraget finns inte längre: varan går tillbaka till lagret
          }
          return;
        }

        // Äldre sparningar: bara antalet bärare
        const haulers = World.units.filter(unit => unit.definition.isHauler && unit.player === CityBuilder.Players.HUMAN).length;
        for (let i = haulers; i < (data.carriers || 0); i++) World.spawnUnit('carrier', 0, 0);

        // Det bärarna hade i famnen när det sparades lämnas tillbaka i lagret
        for (const [resourceId, amount] of Object.entries(data.carried || {})) {
          if (Config.resources[resourceId] && Number.isFinite(amount)) Economy.addToNearestStorage(resourceId, amount, headquarters);
        }
      });

      if (Game && Number.isInteger(data.speedIndex) && Config.settings.gameSpeeds[data.speedIndex]) {
        Game.speedIndex = data.speedIndex;
        const speedButton = document.getElementById('speedButton');
        if (speedButton) speedButton.textContent = Config.settings.gameSpeeds[data.speedIndex] + 'x';
      }
      return failed;
    },

    // reason är en engelsk text som ui.js översätter (t.ex. 'unknown save slot'). detail skrivs bara till konsolen.
    fail(reason, detail) {
      this.lastError = reason;
      console.error('Save failed:', reason, detail || '');
      return false;
    },

    // Autosparning: misslyckas den (lagringen full eller blockerad) märker spelaren inget annars, och tror att spelet är sparat
    autosave() {
      if (this.save('autosave') === false && this.lastError && this.ready && !this.suspended) CityBuilder.Errors.notify(`Autosave failed: ${this.lastError}`, 'save');
    },

    // Startar om autosparningens timer med ett nytt intervall (millisekunder)
    setAutosaveInterval(ms) {
      if (!(ms > 0)) return;
      this.autosaveMs = ms;
      if (!this.ready) return; // applyStart startar timern
      clearInterval(this.timer);
      this.timer = setInterval(() => this.autosave(), this.autosaveMs);
    },

    // Returnerar true/false. Vid misslyckande finns orsaken i Save.lastError (och i webbläsarens konsol).
    save(id) {
      this.lastError = null;
      if (id === 'autosave') id = this.slot();
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

    // Autosparningens plats: banorna och en egen bana har var sin, så de skriver inte över varandra
    slot() { return CityBuilder.Levels?.isCustom() ? 'autocustom' : 'autosave'; },

    // Nytt spel: ta bort autosparningen (slot: den som ska tas bort, annars den som hör till spelet just nu) och starta om.
    // Manuella sparningar rörs inte.
    newGame(slot = this.slot()) {
      this.suspended = true;
      remove(PREFIX + slot);
      remove(PENDING_KEY);
      location.reload();
    },

    // Anropas först i Game.init: bestämmer vad som ska återställas och ställer in banan före världsgenereringen
    prepareStart() {
      const pending = read(PENDING_KEY);
      remove(PENDING_KEY);
      this.startSlot = pending || this.slot();
      this.startData = readSlot(this.startSlot);
      const data = this.startData, levels = CityBuilder.Levels;
      if (levels) levels.hold(true);   // inga mål får klaras av förrän sparningen är återställd (se Levels.hold)
      if (data && levels) {
        if (data.custom) levels.restoreCustom(data.custom); else levels.restore(data.level, data.runSeed);
        levels.restoreProgress(data.progress);   // äldre sparningar saknar framsteg: målen börjar då om och klaras av igen utifrån det som finns
      }
    },

    // Anropas sist i Game.init (efter att världen byggts): återställer sparningen och startar autosparningen
    applyStart() {
      const data = this.startData;
      this.startData = null;
      let restored = false;
      if (data) {
        let failed = 1;
        try { failed = this.apply(data); } catch (error) { CityBuilder.Errors.report(error, 'load'); }
        restored = failed < 1;
        // Delvis återställd: autosparningen skriver snart över sparningen med det som lyckades, så originalet läggs undan först
        if (!restored && write(BACKUP_KEY, read(PREFIX + this.startSlot) || '')) {
          CityBuilder.Errors.notify(`The saved game could not be fully restored. A copy of the original was kept in browser storage under "${BACKUP_KEY}"`, 'load');
        }
      }

      this.ready = true;
      CityBuilder.Levels?.hold(false);
      clearInterval(this.timer);
      this.timer = setInterval(() => this.autosave(), this.autosaveMs);
      addEventListener('pagehide', () => this.save('autosave'));
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave(); });
      return restored;
    },
  };

  CityBuilder.Save = Save;
})(window.CityBuilder);