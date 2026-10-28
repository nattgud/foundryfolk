/* Spelloop och spelarhandlingar. Systemen körs i ordningen Config.settings.systemOrder. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Pathfinder, Economy, UI, Errors, byId } = CityBuilder;
  const t = (text, variables) => CityBuilder.t(text, variables);

  const Game = {
    selectedBuilding: null,
    placingType: null,      // byggnadstyp som spelaren håller på att placera
    casting: null,          // { building, spell }: en trollformel väntar på att spelaren pekar ut ett mål
    speedIndex: 0,          // index i Config.settings.gameSpeeds
    lastFrameTime: 0,
    deltaSeconds: 0,
    paused: false,          // sätts av huvudmenyn medan den är öppen
    pending: 0,             // speltid som ännu inte körts som steg (sekunder, mindre än ett steg)
    alpha: 0,               // hur långt vi kommit mot nästa steg (0-1), för jämn ritning mellan stegen
    tick: 0,                // antal simuleringssteg som körts (kommandon loggas med detta)
    focusPaused: false,     // true när fönstret/fliken inte har fokus. Spelet står ALLTID stilla då (ingen inställning)

    get systems() { return Config.settings.systemOrder.map(name => CityBuilder.Systems[name]); },

    // Start i steg med laddningsstapel (GameLoading finns i index.html). Mellan stegen får webbläsaren rita om.
    async init() {
      const L = window.GameLoading || { set() {}, paint: () => Promise.resolve(), done() {}, fail() {} };
      const step = async (fraction, text) => { L.set(fraction, text); await L.paint(); };
      try {
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
        CityBuilder.Renderer.init();
        CityBuilder.Input.init();
        await step(.90, t('Building interface'));
        UI.init();
        if (CityBuilder.Minimap) CityBuilder.Minimap.init();
        await step(.96, t('Almost ready'));
        for (let i = 0; i < Config.settings.startingCarriers; i++) World.spawnUnit('carrier', 0, 0);
        const restored = Save ? Save.applyStart() : false;
        CityBuilder.Vision.refresh();                    // synfältet och djuren finns från första bildrutan
        CityBuilder.Animals.updateActivation();
        if (level) UI.showToast((restored ? t('Game loaded.') + ' ' : '') + (level.custom ? level.name : t('Level {level}: {name}', { level: level.level, name: level.name })));
        this.installFocusPause();
        L.set(1, t('Almost ready'));
        requestAnimationFrame(time => { this.lastFrameTime = time; this.frame(time); L.done(); });
      } catch (error) { Errors.report(error, 'start'); L.fail(error); throw error; }
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

    setPlacingType(buildingType) { this.placingType = buildingType; this.casting = null; this.selectedBuilding = null; },

    // Trollformler (systems/spells.js): knappen i förtrollarens panel (eller blandningsfönstret) väljer formeln, nästa tryck på kartan läser den
    beginSpell(building, spell) {
      this.casting = this.casting && this.casting.spell.id === spell.id && this.casting.building === building ? null : { building, spell };
    },

    castSpell(x, y) {
      const { building, spell } = this.casting;
      const problem = CityBuilder.Commands.issue('cast', { building: building.id, spell: spell.id, x, y });
      if (!problem) { this.casting = null; return; }
      this.refuse({
        cooldown: () => t('The enchanter is resting'),
        range: () => t('Too far from the enchanter'),
        fog: () => t('Hidden in the fog of war'),
        cost: () => t('Not enough resources'),
        room: () => t('No room for it here'),
        unbuilt: () => t('Not finished yet'),
        nothing: () => t('Nothing here to affect'),
        sky: () => t('The sky does not suit this mix'),
      }[problem]());
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
      const problem = CityBuilder.Commands.issue('build', { type: buildingType, x, y });
      if (problem) {
        return this.refuse({
          terrain: () => t('Must be built on: {terrain}', { terrain: UI.terrainName(definition.placeOnTerrain) }),
          locked: () => t('Unlocks at level {n}', { n: CityBuilder.Levels.unlockLevel(CityBuilder.Construction.variantFor(buildingType, x, y)) }),
          occupied: () => t('This spot is occupied'),
          far: () => t('Too far from your buildings'),
          unreachable: () => t('This spot cannot be reached'),
          fog: () => t('Hidden in the fog of war'),
          cost: () => t('Not enough resources'),
          unique: () => t('You can only build one'),
        }[problem]());
      }
      CityBuilder.Sound?.play('build', { x, y });
      if (!definition.repeatPlacement) this.setPlacingType(null);   // vald byggnad avmarkeras när den placerats (inte när något annat, som en hög efter en tornado, dyker upp)
    },

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