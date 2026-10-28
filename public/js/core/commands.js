/* Spelarens handlingar. Allt en spelare kan göra i spelvärlden går genom Commands.issue(typ, argument, spelare):
   bygga, riva, läsa formler, pausa, prioritera, byta inriktning, träna, handla. UI:t ändrar aldrig världen direkt.

   - Argumenten är rena data (byggnader som id, formler som sin id-sträng), så ett kommando kan skickas över nätet till den klient
     som kör simuleringen eller spelas upp ur en logg.
   - Ett kommando körs mellan två simuleringssteg och loggas med stegnumret (Game.tick). Samma start, samma kommandon på samma steg
     och samma steglängd ger alltså exakt samma spel (se Commands.replay).
   - Kommandot kontrollerar att spelaren äger byggnaden. Resultatet är handlingens eget: en orsak vid avslag, annars null (eller ett tal). */
(function (CityBuilder) {
  'use strict';
  const { Players } = CityBuilder;   // World och systemen finns först senare: de slås upp när kommandot körs

  const building = (id, player) => {
    const found = CityBuilder.World.buildings.find(candidate => candidate.id === id);
    return found && found.player === player && !found.removed ? found : null;
  };
  // Handlare för kommandon som gäller en egen byggnad
  const onBuilding = action => (player, args) => {
    const target = building(args.building, player);
    return target ? action(target, args, player) : 'missing';
  };

  const handlers = {
    build: (player, { type, x, y }) => CityBuilder.Construction.build(type, x, y, player),
    demolish: onBuilding(target => { CityBuilder.Construction.dismantle(target, true); return null; }),
    cast: onBuilding((target, { spell, x, y }) => {
      const formula = CityBuilder.Spells.fromId(spell);
      return formula ? CityBuilder.Spells.cast(target, formula, x, y) : 'nothing';
    }),
    pause: onBuilding((target, { on }) => { target.paused = !!on; return null; }),
    priority: onBuilding((target, { on }) => { target.prioritized = !!on; return null; }),
    boost: onBuilding((target, { on }) => { target.boostOn = !!on; return null; }),
    choice: onBuilding((target, { index }) => { target.choice = index; return null; }),
    focus: onBuilding((target, { type }) => { CityBuilder.Behaviors.setFocus(target, type); return null; }),
    recipe: onBuilding((target, { index }) => { CityBuilder.Behaviors.toggleRecipe(target, index); return null; }),
    stance: onBuilding((target, { stance }) => { CityBuilder.Garrison.setStance(target, stance); return null; }),
    train: onBuilding((target, { kind }) => { CityBuilder.Garrison.setTrainingType(target, kind); return null; }),
    trade: (player, { mode, resource, amount }) => (mode === 'buy' || mode === 'sell') ? CityBuilder.Economy[mode](resource, amount, player) : 0,
  };

  const Commands = {
    log: [],   // { tick, player, type, args } i den ordning de gavs

    issue(type, args = {}, player = Players.HUMAN) {
      const handler = handlers[type];
      if (!handler) return 'unknown';
      this.log.push({ tick: CityBuilder.Game.tick, player, type, args });
      return handler(player, args);
    },

    // Kör en loggad post igen (loggen sparas inte på nytt). Används av uppspelning och, senare, av värden för andra spelares kommandon.
    run({ type, args, player }) {
      const handler = handlers[type];
      return handler ? handler(player, args) : 'unknown';
    },

    // Spelar upp en logg: alla poster för steg n körs före steg n. Returnerar när 'steps' steg körts.
    replay(log, steps, step) {
      let next = 0;
      for (let i = 0; i < steps; i++) {
        while (next < log.length && log[next].tick <= CityBuilder.Game.tick) this.run(log[next++]);
        CityBuilder.Game.advanceSimulation(step);
      }
    },
  };

  CityBuilder.Commands = Commands;
})(window.CityBuilder);
