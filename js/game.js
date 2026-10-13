/* Spelloop och spelarhandlingar. Systemen körs i ordningen Config.settings.systemOrder. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Pathfinder, Economy, UI, byId } = CityBuilder;

  const Game = {
    selectedBuilding: null,
    placingType: null,      // byggnadstyp som spelaren håller på att placera
    speedIndex: 0,          // index i Config.settings.gameSpeeds
    lastFrameTime: 0,
    deltaSeconds: 0,
    paused: false,          // sätts av huvudmenyn medan den är öppen

    get systems() { return Config.settings.systemOrder.map(name => CityBuilder.Systems[name]); },

    init() {
      // Välj bana innan världen genereras: sparad bana, annars bana 1.
      // (Levels.start() sätter världens seed, så World.init() bygger rätt värld.)
      // Finns en sparning (laddad plats eller autosparning) ställs banan in efter den, annars sparad bana / bana 1.
      const Save = CityBuilder.Save;
      if (Save) Save.prepareStart();
      const level = CityBuilder.Levels ? CityBuilder.Levels.start() : null;
      World.init();
      CityBuilder.Renderer.init();
      CityBuilder.Input.init();
        UI.init();
      if (CityBuilder.Minimap) CityBuilder.Minimap.init();
      for (let i = 0; i < Config.settings.startingCarriers; i++) World.spawnUnit('carrier', 0, 0);
      const restored = Save ? Save.applyStart() : false;
      if (level) UI.showToast((restored ? 'Game loaded. ' : '') + 'Level ' + level.level + ': ' + level.name);
      requestAnimationFrame(time => { this.lastFrameTime = time; this.frame(time); });
    },

    setPlacingType(buildingType) { this.placingType = buildingType; this.selectedBuilding = null; },

    selectBuilding(building) {
      this.selectedBuilding = building || null;
      byId('info').dataset.buildingId = ''; // tvingar infopanelen att byggas om
    },

    tryBuild(buildingType, x, y) {
      const definition = Config.buildings[buildingType];
      if (!World.canPlace(buildingType, x, y)) {
        return UI.showToast(definition.placeOnTerrain ? 'Måste byggas på terrängtypen: ' + definition.placeOnTerrain : 'Platsen är upptagen');
      }
      Pathfinder.remainingSearches = Math.max(Pathfinder.remainingSearches, 1);
      if (Pathfinder.findPath(World.headquarters.x, World.headquarters.y, x, y) === null) return UI.showToast('Platsen går inte att nå');
      if (!Economy.spend(definition.buildCost)) return UI.showToast('Inte nog med resurser');
      World.placeBuilding(buildingType, x, y);
    },

    demolish(building) {
      World.removeBuilding(building);
      Economy.refund(building.definition.buildCost);
      // Lämna tillbaka allt byggnaden höll i
      for (const stock of [building.inputStock, building.outputStock, building.storedGoods]) {
        for (const resourceId in stock) if (stock[resourceId] > 0) Economy.addToNearestStorage(resourceId, stock[resourceId], building);
      }
      this.selectBuilding(null);
    },

    cycleSpeed() {
      const speeds = Config.settings.gameSpeeds;
      this.speedIndex = (this.speedIndex + 1) % speeds.length;
      byId('speedButton').textContent = speeds[this.speedIndex] + 'x';
    },

    // En simuleringsruta (anropas av loopen, och kan anropas direkt av tester)
    advanceSimulation(deltaSeconds) {
      this.deltaSeconds = deltaSeconds;
      Pathfinder.remainingSearches = Config.settings.maxPathSearchesPerFrame;
      for (const system of this.systems) system.update(deltaSeconds);
    },

    frame(time) {
      const realSeconds = Math.min(.1, (time - this.lastFrameTime) / 1000);
      this.lastFrameTime = time;
      this.advanceSimulation(this.paused ? 0 : realSeconds * Config.settings.gameSpeeds[this.speedIndex]);
      CityBuilder.Renderer.draw();
      UI.refresh();
      requestAnimationFrame(next => this.frame(next));
    },
  };

  CityBuilder.Game = Game;
})(window.CityBuilder);