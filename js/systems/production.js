/* Systemen production (kör beteendets update för färdiga byggnader), logistics och units. */
(function (CityBuilder) {
  'use strict';
  const { World, Behaviors } = CityBuilder;

  CityBuilder.Systems = CityBuilder.Systems || {};

  CityBuilder.Systems.production = {
    update(deltaSeconds) {
      for (const building of World.buildings) {
        if (building.buildProgress < 1 || !building.definition.job) continue;
        const behavior = Behaviors.forBuilding(building);
        if (behavior.update) behavior.update(building, deltaSeconds);
      }
    },
  };

  CityBuilder.Systems.logistics = { update(deltaSeconds) { CityBuilder.Logistics.update(deltaSeconds); } };

  CityBuilder.Systems.units = {
    update(deltaSeconds) { for (const unit of World.units) CityBuilder.Units.update(unit, deltaSeconds); },
  };
})(window.CityBuilder);
