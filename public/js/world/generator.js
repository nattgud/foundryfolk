/* Terränggenerator: bestämmer terrängtyp per ruta utifrån regellistan i Config.world.rules.
   Lägg till nya biomer genom att utöka rules/features i config/world.js. */
(function (CityBuilder) {
  'use strict';
  const { Utils } = CityBuilder;

  const Generator = {
    terrainTypeAt(x, y) {
      const worldConfig = CityBuilder.Config.world;
      const distanceFromOrigin = Math.hypot(x, y);
      if (distanceFromOrigin < worldConfig.clearRadius) return 'grass';

      const context = {
        x, y, distanceFromOrigin,
        fractalNoise: Utils.fractalNoise,
        hash: Utils.hash,
        elevation: Utils.fractalNoise(x / 30, y / 30, 1) + Math.max(0, 1 - distanceFromOrigin / 20) * .35,
        moisture: Utils.fractalNoise(x / 12, y / 12, 2) + (distanceFromOrigin > 4 && distanceFromOrigin < 18 ? .08 : 0),
      };

      let terrainType = 'grass';
      for (const rule of worldConfig.rules) {
        const result = rule(context);
        if (result !== undefined) { terrainType = result; break; }
      }
      for (const feature of worldConfig.features) {
        if (Math.hypot(x - feature.x, y - feature.y) <= feature.radius && Utils.hash(x, y, 7) < .9) terrainType = feature.terrainType;
      }
      return terrainType;
    },
  };

  CityBuilder.Generator = Generator;
})(window.CityBuilder);
