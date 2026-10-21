/* Spelare: varje enhet och byggnad har ett fält "player" som anger vem den tillhör. Alla spelare har egen bas, eget lager och egna bärare.
   NEUTRAL (t.ex. hjortar) är aldrig fiende till någon: ingen anfaller dem och de anfaller ingen. */
(function (CityBuilder) {
  'use strict';

  const Players = {
    NEUTRAL: 0,
    HUMAN: 1,
    ENEMY: 2,                 // första datorspelaren. Fler får nästa lediga nummer (3, 4, ...)
    active: [1],              // spelarna i spelet (World.addPlayer lägger till datorspelare)

    isAI: player => player !== Players.NEUTRAL && player !== Players.HUMAN,

    // Fiender är två olika riktiga spelare
    isHostile: (a, b) => a !== b && a !== Players.NEUTRAL && b !== Players.NEUTRAL,
  };

  CityBuilder.Players = Players;
})(window.CityBuilder);
