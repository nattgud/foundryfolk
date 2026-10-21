/* Spelare: varje enhet och byggnad har ett fält "player" som anger vem den tillhör.
   NEUTRAL (t.ex. hjortar) är aldrig fiende till någon: ingen anfaller dem och de anfaller ingen. */
(function (CityBuilder) {
  'use strict';

  const Players = {
    NEUTRAL: 0,
    HUMAN: 1,
    ENEMY: 2,

    // Fiender är två olika riktiga spelare
    isHostile: (a, b) => a !== b && a !== Players.NEUTRAL && b !== Players.NEUTRAL,
  };

  CityBuilder.Players = Players;
})(window.CityBuilder);
