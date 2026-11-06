/* Spelloop och spelarhandlingar. Systemen körs i ordningen Config.settings.systemOrder. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Pathfinder, Economy, UI, Errors, byId } = CityBuilder;
  const t = (text, variables) => CityBuilder.t(text, variables);

  // Det som hör till en värld och nollställs när en ny bana, sparning eller karta laddas (utan att sidan laddas om). Värdena vid start sparas
  // av capture() och läggs tillbaka på plats av resetWorld(). Det som hör till spelaren och sidan (grafik, ljud, inställningar, gränssnittets
  // knappar) rörs inte. Moduler med egen reset() (Vision, Weather ...) nollställs av World.init.
  const WORLD_STATE = {
    World: ['chunks', 'buildingsByTile', 'scenery', 'buildings', 'units', 'headquarters', 'hqs', 'nextBuildingId', 'animalsByChunk'],
    Players: ['active', 'team', 'race'],
    Economy: ['playerStats', 'flows'],
    Logistics: ['tasks', 'planningTimer', 'cursor', 'pileLoad', 'load', 'lost', 'busyAt', 'unreachable', 'round', 'orders', 'soft', 'time'],
    Combat: ['effects', 'projectiles', 'time', 'fightAt', 'targetCache', 'gridTime', 'alarm'],
    AI: ['players', 'time'],
    Story: ['queue', 'reading'],
    Commands: ['log'],
    'Config.world': ['features'],   // World.endow lägger till garanterade fyndigheter runt baserna
  };
  const moduleOf = name => name.split('.').reduce((object, key) => object[key], CityBuilder);

  // Lägger tillbaka ett startvärde i samma objekt (listor, Map och Set töms och fylls på): andra moduler kan hålla referenser till dem
  const restore = (target, key, initial) => {
    const value = structuredClone(initial), now = target[key];
    if (Array.isArray(now)) now.splice(0, now.length, ...value);
    else if (now instanceof Map) { now.clear(); value.forEach((item, name) => now.set(name, item)); }
    else if (now instanceof Set) { now.clear(); value.forEach(item => now.add(item)); }
    else if (now && typeof now === 'object' && value && typeof value === 'object') { for (const name of Object.keys(now)) delete now[name]; Object.assign(now, value); }
    else target[key] = value;
  };

  const Game = {
    selectedBuilding: null,
    placingType: null,      // byggnadstyp som spelaren håller på att placera
    wallStart: null,        // en mur (linePlacement) som ritas: rutan där den börjar, tills slutet valts eller den avbryts
    showDistricts: (() => { try { return localStorage.getItem('cityBuilderDistricts') === 'on'; } catch (error) { return false; } })(),   // områdesfärgerna: av som standard, knappen under minikartan eller tangenten G slår på dem
    casting: null,          // { building, spell }: en trollformel väntar på att spelaren pekar ut ett mål
    flagging: false,        // flaggläget: nästa tryck på kartan sätter eller flyttar flaggan (ett tryck på flaggan själv tar bort den)
    speedIndex: 0,          // index i Config.settings.gameSpeeds
    lastFrameTime: 0,
    deltaSeconds: 0,
    paused: false,          // sätts av huvudmenyn medan den är öppen
    pending: 0,             // speltid som ännu inte körts som steg (sekunder, mindre än ett steg)
    alpha: 0,               // hur långt vi kommit mot nästa steg (0-1), för jämn ritning mellan stegen
    tick: 0,                // antal simuleringssteg som körts (kommandon loggas med detta)
    focusPaused: false,     // true när fönstret/fliken inte har fokus. Spelet står ALLTID stilla då (ingen inställning)
    loading: false,         // en värld byggs (första gången eller vid en ny bana): ingen simulering och ingen ritning
    pristine: null,         // värdena i WORLD_STATE vid start

    get systems() { return Config.settings.systemOrder.map(name => CityBuilder.Systems[name]); },

    // Start i steg med laddningsstapel (GameLoading finns i index.html). Mellan stegen får webbläsaren rita om.
    async init() {
      const L = window.GameLoading || { set() {}, paint: () => Promise.resolve(), show() {}, done() {}, fail() {} };
      try {
        this.capture();
        await this.build(L, true);
        this.installFocusPause();
        L.set(1, t('Almost ready'));
        this.loading = false;
        requestAnimationFrame(time => { this.lastFrameTime = time; this.frame(time); L.done(); });
      } catch (error) { Errors.report(error, 'start'); L.fail(error); throw error; }
    },

    // Bygger världen för banan som är vald: första gången (first) sätts också sådant som bara görs en gång (grafik, indata, gränssnitt)
    async build(L, first) {
      const step = async (fraction, text) => { L.set(fraction, text); await L.paint(); };
      this.loading = true;
      // Välj bana innan världen genereras: sparad bana, annars bana 1.
      // (Levels.start() sätter världens seed, så World.init() bygger rätt värld.)
      const Save = CityBuilder.Save;
      await step(.40, t('Choosing level'));
      if (Save) Save.prepareStart();
      const level = CityBuilder.Levels ? CityBuilder.Levels.start() : null;
      await step(.45, t('Creating world'));
      // World.init får en rapportfunktion (fraction 0-1, valfri text) och får returnera ett löfte om den delar upp arbetet
      await World.init((fraction, text) => { L.set(.45 + .35 * fraction, text || t('Creating world')); return L.paint(); });
      await step(.82, t('Preparing graphics'));
      if (first) { CityBuilder.Renderer.init(); CityBuilder.Input.init(); } else CityBuilder.Renderer.reset();
      await step(.90, t('Building interface'));
      if (first) { UI.init(); if (CityBuilder.Minimap) CityBuilder.Minimap.init(); } else { UI.reset(); CityBuilder.Minimap?.reset(); }
      await step(.96, t('Almost ready'));
      for (let i = 0; i < Config.settings.startingCarriers; i++) World.spawnUnit('carrier', 0, 0);
      const restored = Save ? Save.applyStart() : false;
      if (!restored) CityBuilder.Story?.begin();      // ett kapitel som börjar om: färdiga byggnader och Eye of Shades (en sparning har dem redan)
      CityBuilder.Vision.refresh();                    // synfältet och djuren finns från första bildrutan
      CityBuilder.Animals.updateActivation();
      if (level) UI.showToast((restored ? t('Game loaded.') + ' ' : '') + (level.custom ? level.name : level.story ? t('Chapter {n}: {name}', { n: level.level, name: level.name }) : t('Level {level}: {name}', { level: level.level, name: level.name })));
    },

    // Sparar värdena i WORLD_STATE som de är vid start (anropas en gång, före allt annat)
    capture() {
      this.pristine = Object.fromEntries(Object.entries(WORLD_STATE).map(([name, keys]) => [name, Object.fromEntries(keys.map(key => [key, structuredClone(moduleOf(name)[key])]))]));
    },

    // Bygger en ny värld utan att sidan laddas om (ny bana, ladda en sparning, ny karta, nytt spel). Allt som hör till världen nollställs;
    // sidan, grafiken, ljudet och inställningarna behålls. Går något fel laddas sidan om, som förr.
    async restart() {
      if (this.loading) return;
      const L = window.GameLoading;
      try {
        this.loading = true;
        L.show();
        await L.paint();
        this.resetWorld();
        await this.build(L, false);
        this.loading = false;
        this.lastFrameTime = performance.now();
        L.done();
      } catch (error) {
        Errors.report(error, 'start');
        location.reload();
      }
    },

    // Stänger av den gamla världen och lägger tillbaka alla startvärden
    resetWorld() {
      const { Save, Levels, Sound, Pathfinder: pathfinder, Generator } = CityBuilder;
      if (Save) Save.stop();
      for (const [name, keys] of Object.entries(WORLD_STATE)) for (const key of keys) restore(moduleOf(name), key, this.pristine[name][key]);
      Levels?.forget();
      Generator.reset();
      pathfinder.reset();
      CityBuilder.Systems.pathDecay.reset();
      Sound?.reset();
      Object.assign(this, { selectedBuilding: null, placingType: null, wallStart: null, casting: null, flagging: false, pending: 0, alpha: 0, tick: 0, paused: false });
      UI.updateLineButton?.();
    },

    // Spelet pausas alltid när fönstret förlorar fokus eller fliken göms
    installFocusPause() {
      const update = () => { this.focusPaused = document.hidden || !document.hasFocus(); };
      addEventListener('focus', update);
      addEventListener('blur', update);
      document.addEventListener('visibilitychange', update);
      update();
      this.keepScreenOn();
    },

    // Håller skärmen tänd medan spelet visas (Screen Wake Lock; stödjs inte överallt och släpps av webbläsaren när fliken göms, därför begärs den igen när den visas)
    keepScreenOn() {
      if (this.screenOnInstalled || !navigator.wakeLock) return;
      this.screenOnInstalled = true;
      const request = () => { if (!document.hidden) navigator.wakeLock.request('screen').catch(() => {}); };
      document.addEventListener('visibilitychange', request);
      request();
    },

    setPlacingType(buildingType) { this.placingType = buildingType; this.wallStart = null; this.casting = null; this.flagging = false; this.selectedBuilding = null; UI.updateLineButton?.(); },

    // Flaggläget (systems/flags.js)
    setFlagging(on) {
      this.flagging = on;
      if (on) { this.placingType = null; this.casting = null; this.selectedBuilding = null; }
    },

    placeFlag(x, y) {
      const flag = CityBuilder.Flags.of(CityBuilder.Players.HUMAN);
      if (flag && flag.x === x && flag.y === y) { CityBuilder.Commands.issue('flag', { clear: true }); CityBuilder.Sound?.play('click'); return; }
      const problem = CityBuilder.Commands.issue('flag', { x, y });
      if (!problem) { CityBuilder.Sound?.play('flag'); return; }
      this.refuse({
        unexplored: () => t('You have not explored this spot'),
        terrain: () => t('A flag cannot stand here'),
        unreachable: () => t('Soldiers cannot reach this spot'),
      }[problem]());
    },

    // Trollformler (systems/spells.js): knappen i förtrollarens panel (eller blandningsfönstret) väljer formeln, nästa tryck på kartan läser den
    beginSpell(building, spell) {
      this.casting = this.casting && this.casting.spell.id === spell.id && this.casting.building === building ? null : { building, spell };
    },

    castSpell(x, y) {
      const { building, spell } = this.casting;
      const problem = CityBuilder.Commands.issue('cast', { building: building.id, spell: spell.id, x, y });
      if (!problem) {
        this.casting = null;
        if (CityBuilder.Spells.misfire) { UI.showToast(t('The spell misfired and landed elsewhere')); this.scrollTo(CityBuilder.Spells.misfire.x, CityBuilder.Spells.misfire.y); }   // en felkastad formel: visa var den hamnade
        if (spell.pure) UI.offerSpell(spell);
        return;
      }
      this.refuse({
        cooldown: () => t('The enchanter is resting'),
        locked: () => t('Spells of this kind are still recharging'),
        range: () => t('Too far from the enchanter'),
        fog: () => t('Hidden in the fog of war'),
        cost: () => t('Not enough resources'),
        room: () => t('No room for it here'),
        unbuilt: () => t('Not finished yet'),
        nothing: () => t('Nothing here to affect'),
        sky: () => t('The sky does not suit this mix'),
      }[problem]());
    },

    // Rullar kartan mjukt så att rutan hamnar i mitten (görs bara om den inte redan syns väl)
    scrollTo(x, y) {
      const renderer = CityBuilder.Renderer, size = renderer.tileSize, viewW = innerWidth / renderer.zoom, viewH = innerHeight / renderer.zoom;
      const goalX = (x + 0.5) * size - viewW / 2, goalY = (y + 0.5) * size - viewH / 2, fromX = renderer.camera.x, fromY = renderer.camera.y;
      if (Math.abs(goalX - fromX) < viewW * 0.3 && Math.abs(goalY - fromY) < viewH * 0.3) return;
      const start = performance.now(), ms = 600, token = this.scrollToken = {};
      const step = now => {
        if (this.scrollToken !== token) return;   // en nyare rullning har tagit över
        const t = Math.min(1, (now - start) / ms), ease = 1 - (1 - t) ** 3;
        renderer.camera.x = fromX + (goalX - fromX) * ease; renderer.camera.y = fromY + (goalY - fromY) * ease;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },

    selectBuilding(building) {
      if (building !== this.selectedBuilding) this.casting = null;
      this.selectedBuilding = building || null;
      byId('info').dataset.buildingId = ''; // tvingar infopanelen att byggas om
      if (building?.definition.isMarket && building.player === CityBuilder.Players.HUMAN && building.buildProgress >= 1) UI.openMarket();
    },

    tryBuild(buildingType, x, y) {
      const definition = Config.buildings[buildingType];
      if (CityBuilder.Levels && !CityBuilder.Levels.isUnlocked(buildingType)) {
        return this.refuse(t('Unlocks at level {n}', { n: CityBuilder.Levels.unlockLevel(buildingType) }));
      }
      if (definition.linePlacement) return this.placeLine(buildingType, x, y);
      const problem = CityBuilder.Commands.issue('build', { type: buildingType, x, y });
      if (problem) return this.refuse(this.refusalText(problem, buildingType, x, y));
      CityBuilder.Sound?.play('build', { x, y });
      if (!definition.repeatPlacement) this.setPlacingType(null);   // vald byggnad avmarkeras när den placerats (inte när något annat, som en hög efter en tornado, dyker upp)
    },

    // Texten för en avvisad byggorder (orsaken från Construction.build). cost: kostnaden som saknas om den inte är byggnadens egen (en hel mur)
    refusalText(problem, buildingType, x, y, cost) {
      const definition = Config.buildings[buildingType];
      return {
        terrain: () => t('Must be built on: {terrain}', { terrain: UI.terrainName(definition.placeOnTerrain) }),
        locked: () => t('Unlocks at level {n}', { n: CityBuilder.Levels.unlockLevel(CityBuilder.Construction.variantFor(buildingType, x, y)) }),
        occupied: () => t('This spot is occupied'),
        far: () => t('Too far from your buildings'),
        unreachable: () => t('This spot cannot be reached'),
        fog: () => t('Hidden in the fog of war'),
        cost: () => {
          const lacking = CityBuilder.Construction.shortage(cost || definition.buildCost)[0];
          if (!lacking) return t('Not enough resources');
          const reserved = Economy.totalAmount(lacking.resourceId) - lacking.have;   // lagret finns men är bokat: bärare på väg eller byggen som väntar
          return t('Not enough {name}: {have} of {need} free', { name: UI.resourceName(lacking.resourceId), have: lacking.have, need: lacking.need }) + (reserved > 0 ? ' · ' + t('Reserved: {amount}', { amount: reserved }) : '');
        },
        unique: () => t('You can only build one'),
      }[problem]();
    },

    // Murar (linePlacement) ritas som ett rakt streck: ett tryck sätter början och ett andra slutet. Strecket går längs den axel det är längst, och hela muren
    // byggs eller ingen del: räcker inte stenen, eller är en ruta upptagen, blir hela muren röd och trycket gör ingenting. Avbryt (knappen, Esc) tar bort början.
    lineTiles(start, end) {
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
      const steps = horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y), stepX = horizontal ? Math.sign(end.x - start.x) || 1 : 0, stepY = horizontal ? 0 : Math.sign(end.y - start.y) || 1;
      return Array.from({ length: steps + 1 }, (_, i) => ({ x: start.x + stepX * i, y: start.y + stepY * i }));
    },

    lineCost(type, tiles) { return Object.fromEntries(Object.entries(Config.buildings[type].buildCost).map(([id, amount]) => [id, amount * tiles.length])); },

    // Det som hindrar muren: { problem, tile } för första rutan som inte går (tile: null om det bara är kostnaden), annars null. cheap: utan vägsökning (förhandsvisningen ritas varje bildruta)
    lineProblem(type, tiles, cheap = false) {
      const Construction = CityBuilder.Construction, human = CityBuilder.Players.HUMAN;
      for (const tile of tiles) {
        const problem = !cheap ? Construction.siteProblem(type, tile.x, tile.y)
          : Construction.isHidden(tile.x, tile.y, human) ? 'fog' : !World.canPlace(type, tile.x, tile.y) ? 'occupied' : !Construction.isNearOwnBuilding(tile.x, tile.y, human) ? 'far' : null;
        if (problem) return { problem, tile };
      }
      return Construction.canAfford(this.lineCost(type, tiles)) ? null : { problem: 'cost', tile: null };
    },

    placeLine(type, x, y) {
      const Construction = CityBuilder.Construction;
      if (!this.wallStart) {
        const problem = Construction.siteProblem(type, x, y);
        if (problem) return this.refuse(this.refusalText(problem, type, x, y));
        this.wallStart = { x, y };
        UI.updateLineButton();
        CityBuilder.Sound?.play('click');
        return;
      }
      const tiles = this.lineTiles(this.wallStart, { x, y }), found = this.lineProblem(type, tiles);
      if (found) return this.refuse(this.refusalText(found.problem, type, (found.tile || { x }).x, (found.tile || { y }).y, this.lineCost(type, tiles)));
      let failed = null;
      for (const tile of tiles) failed = CityBuilder.Commands.issue('build', { type, x: tile.x, y: tile.y }) || failed;
      CityBuilder.Sound?.play('build', { x, y });
      this.cancelLine();
      if (failed) this.refuse(this.refusalText(failed, type, x, y, this.lineCost(type, tiles)));   // t.ex. när en tidigare ruta i muren stängde vägen till en senare
    },

    cancelLine() { this.wallStart = null; UI.updateLineButton(); },

    // Avvisad handling: felljud och meddelande
    refuse(text) {
      CityBuilder.Sound?.play('error');
      UI.showToast(text);
    },

    demolish(building) {
      CityBuilder.Sound?.play('demolish', { x: building.x, y: building.y });
      CityBuilder.Commands.issue('demolish', { building: building.id });
      this.selectBuilding(null);
    },

    // Spelarens bas är förstörd
    defeat() { UI.showDefeat(); },

    cycleSpeed() {
      const speeds = Config.settings.gameSpeeds;
      this.speedIndex = (this.speedIndex + 1) % speeds.length;
      byId('speedButton').textContent = speeds[this.speedIndex] + 'x';
    },

    // En simuleringsruta (anropas av loopen, och kan anropas direkt av tester)
    advanceSimulation(deltaSeconds) {
      this.deltaSeconds = deltaSeconds;
      for (const unit of World.units) { unit.px = unit.x; unit.py = unit.y; }   // läget före steget, för interpolerad ritning
      Pathfinder.update(deltaSeconds);

      // Ett fel i ett system får aldrig stoppa hela spelet (t.ex. en gammal sparning med oväntade data): felet loggas en gång per sort och övriga system går vidare
      for (const system of this.systems) {
        try { system.update(deltaSeconds); } catch (error) { Errors.report(error, 'simulation'); } // ett felaktigt system stoppar inte övriga
      }
      this.dropBrokenUnits();
      this.tick++;
    },

    // Enheter med ogiltigt läge (NaN) kan förgifta sökningar och ritning: de tas bort och felet rapporteras
    dropBrokenUnits() {
      let broken = null;
      for (const unit of World.units) if (!Number.isFinite(unit.x) || !Number.isFinite(unit.y)) (broken ||= []).push(unit);
      for (const unit of broken || []) {
        Errors.notify(`Removed a unit with an invalid position (${unit.kind})`, 'simulation');
        CityBuilder.Behaviors.removeUnit(unit);
      }
    },

    frame(time) {
      const next = () => requestAnimationFrame(following => this.frame(following));

      // En värld byggs: ingen simulering och ingen ritning, och ingen tid som hoppar fram efteråt
      if (this.loading) {
        this.lastFrameTime = time;
        return next();
      }

      // Fönstret har inte fokus: ingen simulering, ingen ritning, och ingen tid som hoppar fram när fokus kommer tillbaka
      if (this.focusPaused) {
        this.lastFrameTime = time;
        return next();
      }

      // Bildfrekvensgräns (Options). Hoppade bildrutor räknas in i nästa, så speltiden stämmer.
      const options = CityBuilder.Options;
      const limit = options ? options.settings.fpsLimit : 0;
      if (limit && time - this.lastFrameTime < 1000 / limit - 4) return next();

      const started = performance.now();
      const realSeconds = Math.min(.1, (time - this.lastFrameTime) / 1000);
      this.lastFrameTime = time;
      const { simStep, maxStepsPerFrame } = Config.settings;
      if (!this.paused) this.pending += realSeconds * Config.settings.gameSpeeds[this.speedIndex];
      let steps = 0;
      while (this.pending >= simStep && steps < maxStepsPerFrame) { this.advanceSimulation(simStep); this.pending -= simStep; steps++; }
      if (this.pending >= simStep) this.pending %= simStep;   // överbelastat: spelet går långsammare än önskat, tiden som blev över släpps
      this.alpha = this.pending / simStep;
      const simulatedSeconds = steps * simStep;
      try {
        CityBuilder.Renderer.draw();
        UI.refresh();
        if (options) options.recordFrame(time, performance.now() - started, simulatedSeconds);
      } catch (error) { Errors.report(error, 'draw'); }
      next(); // loopen fortsätter alltid, även om en ritning eller panel kastade fel
    },
  };

  CityBuilder.Game = Game;
})(window.CityBuilder);