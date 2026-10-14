(function (CityBuilder) {
  'use strict';

  const { Config, World } = CityBuilder;

  const GRACE_SECONDS = 10;
  const DECAY_PER_SECOND = 0.002;
  const lastTouched = new Map();

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

          const idle = (lastTouched.get(tile) ?? GRACE_SECONDS)
            + deltaSeconds;

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