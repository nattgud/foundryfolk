/* Systemen production (kör beteendets update för färdiga byggnader), logistics och units. */
(function (CityBuilder) {
  'use strict';
  const { World, Behaviors, Config, Utils } = CityBuilder;
  const UNSEEN_EVERY = 4;   // se Systems.units

  CityBuilder.Systems = CityBuilder.Systems || {};

  CityBuilder.Systems.production = {
    update(deltaSeconds) {
      for (const building of World.buildings) {
        if (building.buildProgress < 1 || !building.definition.job) continue;
        const behavior = Behaviors.forBuilding(building);
        if (behavior.update) behavior.update(building, deltaSeconds * CityBuilder.Spells.factor('pace', building.x, building.y, building.player));
        Behaviors.trackEfficiency(building, deltaSeconds);
      }
    },
  };

  CityBuilder.Systems.logistics = { update(deltaSeconds) { CityBuilder.Logistics.update(deltaSeconds); } };

  CityBuilder.Systems.units = {
    // Djur som ingen spelare ser (utanför alla synfält) uppdateras bara var fjärde ruta, med den samlade tiden: samma beteende, en fjärdedel av jobbet.
    // Fasen slumpas per djur, så arbetet sprids över rutorna.
    update(deltaSeconds) {
      const Units = CityBuilder.Units, Spells = CityBuilder.Spells, Vision = CityBuilder.Vision, size = Config.settings.chunkSize;
      if (this.seenVersion !== Vision.version) { this.seenVersion = Vision.version; this.seen = new Set(Vision.activeChunks.map(({ cx, cy }) => Utils.tileKey(cx, cy))); }
      for (const unit of World.units) {
        const time = deltaSeconds * Spells.paceOf(unit);
        if (unit.definition.isAnimal && !this.seen.has(Utils.tileKey(Math.floor(unit.x / size), Math.floor(unit.y / size)))) {
          unit.lag = (unit.lag || 0) + time;
          if ((unit.lagSteps = (unit.lagSteps ?? Math.floor(Utils.random() * UNSEEN_EVERY)) + 1) < UNSEEN_EVERY) continue;
          Units.update(unit, unit.lag);
          unit.lag = 0; unit.lagSteps = 0;
        } else {
          if (unit.lag) { unit.lag = 0; unit.lagSteps = 0; }
          Units.update(unit, time);
        }
      }
    },
  };
})(window.CityBuilder);
