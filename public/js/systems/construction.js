/* System: byggnation. Räknar upp byggprogress, kör onBuilt och hanterar vinst. Bärare skapas/tas bort av Logistics.balanceCarriers.
   Construction.build är gemensam för alla spelare (människa och dator): samma platsregler och samma kostnader. */
(function (CityBuilder) {
  'use strict';
  const { World, Behaviors, Economy, Pathfinder, Players, Config } = CityBuilder;

  // Försöker bygga. Returnerar null om det gick, annars orsaken: 'occupied' | 'terrain' | 'unreachable' | 'cost'.
  const Construction = {
    build(buildingType, x, y, player = Players.HUMAN) {
      const definition = Config.buildings[buildingType], hq = World.hqOf(player);
      if (!World.canPlace(buildingType, x, y)) return definition.placeOnTerrain ? 'terrain' : 'occupied';
      if (Pathfinder.findPathNow(hq.x, hq.y, x, y) === null) return 'unreachable';
      if (!Economy.spend(definition.buildCost, player)) return 'cost';
      World.placeBuilding(buildingType, x, y, false, player);
      return null;
    },
  };
  CityBuilder.Construction = Construction;

  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.construction = {
    update(deltaSeconds) {
      for (const building of World.buildings) {
        if (building.buildProgress >= 1) continue;

        const progressIncrement = deltaSeconds / building.definition.buildDuration;
        building.buildProgress = Math.min(1, building.buildProgress + progressIncrement);

        if (building.buildProgress < 1) continue;

        // Just färdigbyggd
        if (building.definition.job) {
          const behavior = Behaviors.forBuilding(building);
          if (behavior.onBuilt) behavior.onBuilt(building);
        }
        CityBuilder.Sound?.play('built', { x: building.x, y: building.y });
        if (building.definition.isWinBuilding) CityBuilder.UI.showToast('★ Monument is built!');
      }
    },
  };
})(window.CityBuilder);