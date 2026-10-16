/* Stigar slits ner när ingen går på dem. Efter GRACE_SECONDS utan trampning börjar slitaget minska.
   Units.js anropar touch(tile) varje gång en enhet trampar på en ruta. */
(function (CityBuilder) {
  'use strict';

  const { Config, World } = CityBuilder;

  const GRACE_SECONDS = 60;
  const DECAY_PER_SECOND = 0.25;
  const lastTouched = new Map(); // ruta -> sekunder sedan den senast trampades

  CityBuilder.Systems = CityBuilder.Systems || {};

  CityBuilder.Systems.pathDecay = {
    touch(tile) {
      lastTouched.set(tile, 0);
    },

    update(deltaSeconds) {
      for (const chunk of World.chunks.values()) {
        for (const tile of chunk) {
          if (tile.wear <= 0) {
            lastTouched.delete(tile);
            continue;
          }

          // En ruta med slitage som inte setts förut (t.ex. efter laddning) får full vilotid från början
          const idle = (lastTouched.get(tile) ?? 0) + deltaSeconds;

          lastTouched.set(tile, idle);

          if (idle <= GRACE_SECONDS) continue;

          tile.wear = Math.max(
            0,
            tile.wear - DECAY_PER_SECOND * deltaSeconds
          );
        }
      }
    },
  };

  const order = Config.settings?.systemOrder;

  if (Array.isArray(order) && !order.includes('pathDecay')) {
    order.push('pathDecay');
  }
})(window.CityBuilder);