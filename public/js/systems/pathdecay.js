/* Stigar slits ner när ingen går på dem. Efter GRACE_SECONDS utan trampning börjar slitaget minska.
   Units.js anropar touch(tile) varje gång en enhet trampar på en ruta. En ruta med slitage som inte setts förut (efter laddning)
   får full vilotid från början, vilket touch ger. */
(function (CityBuilder) {
  'use strict';

  const { Config } = CityBuilder;

  const GRACE_SECONDS = 60;
  const DECAY_PER_SECOND = 0.25;
  const lastTouched = new Map(); // slitna rutor -> sekunder sedan den senast trampades (save.js lägger in rutor som laddas med slitage)

  CityBuilder.Systems = CityBuilder.Systems || {};

  CityBuilder.Systems.pathDecay = {
    touch(tile) {
      lastTouched.set(tile, 0);
    },

    // Går bara igenom rutorna som har slitage (de som trampats, eller laddats med slitage): lastTouched, inte hela världen.
    update(deltaSeconds) {
      for (const [tile, lastIdle] of lastTouched) {
        if (tile.wear <= 0) {
          lastTouched.delete(tile);
          continue;
        }

        const idle = lastIdle + deltaSeconds;
        lastTouched.set(tile, idle);
        if (idle > GRACE_SECONDS) tile.wear = Math.max(0, tile.wear - DECAY_PER_SECOND * deltaSeconds);
      }
    },
  };

  const order = Config.settings?.systemOrder;

  if (Array.isArray(order) && !order.includes('pathDecay')) {
    order.push('pathDecay');
  }
})(window.CityBuilder);