/* Spelare: varje enhet och byggnad har ett fält "player" som anger vem den tillhör. Alla spelare har egen bas, eget lager och egna bärare.
   NEUTRAL (t.ex. djur) är aldrig fiende till någon: ingen anfaller dem och de anfaller ingen.
   MONSTER (systems/monsters.js) är fiende till alla spelare, men är ingen datorspelare: den har ingen bas och ingen fog of war. */
(function (CityBuilder) {
  'use strict';

  const Players = {
    MONSTER: -1,
    NEUTRAL: 0,
    HUMAN: 1,
    ENEMY: 2,                 // första datorspelaren. Fler får nästa lediga nummer (3, 4, ...)
    active: [1],              // spelarna i spelet (World.addPlayer lägger till datorspelare)

    // Alla datorspelare i banan (aktiva eller utslagna): Levels.current.rivals stycken från ENEMY
    aiPlayers: () => Array.from({ length: CityBuilder.Levels?.current?.rivals ?? 1 }, (_, i) => Players.ENEMY + i),

    isPlayer: player => player >= Players.HUMAN,     // en riktig spelare (människa eller dator), inte djur eller monster
    isAI: player => player >= Players.ENEMY,

    // Lag: spelare i samma lag är inte fiender. Standard är att varje spelare är ett eget lag (alla mot alla). Banan sätter lag med
    // Players.team = { spelare: lag } (se World.init och Levels.current.teams).
    team: {},
    teamOf: player => Players.team[player] ?? player,

    isHostile: (a, b) => a !== b && a !== Players.NEUTRAL && b !== Players.NEUTRAL && Players.teamOf(a) !== Players.teamOf(b),

    // Datorspelare som måste slås ut för att vinna (de som inte är i spelarens lag)
    hostileAI: () => Players.active.filter(player => Players.isAI(player) && Players.isHostile(Players.HUMAN, player)),
  };

  CityBuilder.Players = Players;
})(window.CityBuilder);
