/* System: byggnation. Räknar upp byggprogress, kör onBuilt och hanterar vinst. Bärare skapas/tas bort av Logistics.balanceCarriers. */
(function (CityBuilder) {
  'use strict';
  const { World, Behaviors } = CityBuilder;

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