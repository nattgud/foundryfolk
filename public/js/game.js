/* Spelloop och spelarhandlingar. Systemen körs i ordningen Config.settings.systemOrder. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Pathfinder, Economy, UI, byId } = CityBuilder;
  const t = (text, variables) => CityBuilder.t(text, variables);

  const Game = {
    selectedBuilding: null,
    placingType: null,      // byggnadstyp som spelaren håller på att placera
    speedIndex: 0,          // index i Config.settings.gameSpeeds
    lastFrameTime: 0,
    deltaSeconds: 0,
    paused: false,          // sätts av huvudmenyn medan den är öppen
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
        CityBuilder.Vision.refresh();                    // synfältet och hjortarna finns från första bildrutan
        CityBuilder.Deer.updateActivation();
        if (level) UI.showToast((restored ? t('Game loaded.') + ' ' : '') + t('Level {level}: {name}', { level: level.level, name: level.name }));
        this.installFocusPause();
        L.set(1, t('Almost ready'));
        requestAnimationFrame(time => { this.lastFrameTime = time; this.frame(time); L.done(); });
      } catch (error) { L.fail(error); throw error; }
    },

    // Spelet pausas alltid när fönstret förlorar fokus eller fliken göms
    installFocusPause() {
      const update = () => { this.focusPaused = document.hidden || !document.hasFocus(); };
      addEventListener('focus', update);
      addEventListener('blur', update);
      document.addEventListener('visibilitychange', update);
      update();
    },

    setPlacingType(buildingType) { this.placingType = buildingType; this.selectedBuilding = null; },

    selectBuilding(building) {
      this.selectedBuilding = building || null;
      byId('info').dataset.buildingId = ''; // tvingar infopanelen att byggas om
    },

    tryBuild(buildingType, x, y) {
      const definition = Config.buildings[buildingType];
      if (CityBuilder.Levels && !CityBuilder.Levels.isUnlocked(buildingType)) {
        return this.refuse(t('Unlocks at level {n}', { n: CityBuilder.Levels.unlockLevel(buildingType) }));
      }
      const problem = CityBuilder.Construction.build(buildingType, x, y);
      if (problem) {
        return this.refuse({
          terrain: () => t('Must be built on: {terrain}', { terrain: UI.terrainName(definition.placeOnTerrain) }),
          occupied: () => t('This spot is occupied'),
          far: () => t('Too far from your buildings'),
          unreachable: () => t('This spot cannot be reached'),
          fog: () => t('Hidden in the fog of war'),
          cost: () => t('Not enough resources'),
          unique: () => t('You can only build one'),
        }[problem]());
      }
      CityBuilder.Sound?.play('build', { x, y });
    },

    // Avvisad handling: felljud och meddelande
    refuse(text) {
      CityBuilder.Sound?.play('error');
      UI.showToast(text);
    },

    demolish(building) {
      CityBuilder.Sound?.play('demolish', { x: building.x, y: building.y });
      CityBuilder.Construction.dismantle(building, true);
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
      Pathfinder.update(deltaSeconds);

      for (const system of this.systems) {
        system.update(deltaSeconds);
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
      const simulatedSeconds = this.paused ? 0 : realSeconds * Config.settings.gameSpeeds[this.speedIndex];
      this.advanceSimulation(simulatedSeconds);
      CityBuilder.Renderer.draw();
      UI.refresh();
      if (options) options.recordFrame(time, performance.now() - started, simulatedSeconds);
      next();
    },
  };

  CityBuilder.Game = Game;
})(window.CityBuilder);