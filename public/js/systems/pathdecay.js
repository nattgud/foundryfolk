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
    reset() { lastTouched.clear(); },

    touch(tile, x, y) {   // x, y: rutans plats (behövs för att kunna säga till civils.js när en stig försvinner)
      const entry = lastTouched.get(tile);
      if (entry) { entry.idle = 0; if (x !== undefined) { entry.x = x; entry.y = y; } } else lastTouched.set(tile, { idle: 0, x, y });
    },

    // Går bara igenom rutorna som har slitage (de som trampats, eller laddats med slitage): lastTouched, inte hela världen.
    update(deltaSeconds) {
      const Civils = CityBuilder.Civils;
      for (const [tile, entry] of lastTouched) {
        if (tile.wear <= 0) {
          lastTouched.delete(tile);
          continue;
        }

        entry.idle += deltaSeconds;
        if (entry.idle > GRACE_SECONDS) {
          const before = tile.wear;
          tile.wear = Math.max(0, before - DECAY_PER_SECOND * deltaSeconds);
          if (Civils && entry.x !== undefined && before >= Civils.limit() && tile.wear < Civils.limit()) Civils.onWear(entry.x, entry.y, before, tile.wear);   // stigen försvann: rutan blir ledig för civila byggnader
        }
      }
    },
  };

  const order = Config.settings?.systemOrder;

  if (Array.isArray(order) && !order.includes('pathDecay')) {
    order.push('pathDecay');
  }
})(window.CityBuilder);