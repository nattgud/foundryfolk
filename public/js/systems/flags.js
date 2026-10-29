/* Flaggor: varje spelare (människa och dator) kan ha en flagga. Soldater i garnisoner i attackläge (Garrison.isAttacking) går till flaggan, slåss
   mot fiender på vägen dit och mot allt inom settings.military.flagRadius rutor från den, och står kvar tills flaggan tas bort eller flyttas.
   Utan flagga försvarar alla som vanligt (se Combat.anchorOf).

   - Flaggan står på en ruta som spelaren utforskat och som enheter kan nå (Flags.problem). Den sätts, flyttas och tas bort med kommandot 'flag'.
   - Flaggan är ett nytt objekt varje gång den flyttas, så att soldaterna vet att de ska ta ny väg (Combat.standDown jämför objekten).
   - Datorn flyttar sin flagga mot sitt mål i steg om högst flagStep rutor och högst var flagSeconds:e sekund (Flags.advance), så att
     motståndaren kan se vart den är på väg. Datorns flagga syns för spelaren bara när platsen syns (render/layers.js, minimap.js). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Vision } = CityBuilder;

  const settings = () => Config.settings.military;

  const Flags = {
    byPlayer: new Map(),   // spelare -> { x, y } (rutan)
    movedAt: new Map(),    // spelare -> speltid då datorn senast flyttade flaggan
    routes: new Map(),     // spelare -> { key, path, at }: vägen datorns flagga följer mot sitt mål och hur långt den kommit
    alertedAt: new Map(),  // spelare -> speltid då spelaren senast hörde att den spelarens flagga syns (ljudet 'flag_enemy')

    reset() { this.byPlayer.clear(); this.movedAt.clear(); this.alertedAt.clear(); this.routes.clear(); },
    of: player => Flags.byPlayer.get(player),
    radius: () => settings().flagRadius,

    // Orsaken till att flaggan inte får stå på rutan (x, y) av skäl som syns på rutan själv: 'unexplored' eller 'terrain'. Billig nog att fråga varje bildruta.
    siteProblem(player, x, y) {
      if (!Vision.explored(player, x, y)) return 'unexplored';
      const tile = World.getTile(x, y);
      return !tile || !Number.isFinite(Config.terrain[tile.terrainType].walkCost) || World.buildingAt(x, y) ? 'terrain' : null;
    },

    // Som siteProblem, och dessutom 'unreachable' om soldaterna inte kan gå dit från 'from' (standard: basen). Null om flaggan får stå där.
    problem(player, x, y, from = World.hqOf(player)) {
      const problem = this.siteProblem(player, x, y);
      if (problem) return problem;
      return !from || CityBuilder.Pathfinder.findPathNow(from.x, from.y, x, y) === null ? 'unreachable' : null;
    },

    // Kommandot 'flag': sätter eller flyttar flaggan, eller tar bort den (clear). Returnerar en orsak vid avslag, annars null.
    set(player, x, y, clear = false) {
      if (clear) { this.byPlayer.delete(player); this.routes.delete(player); return null; }
      const problem = this.problem(player, x, y);
      if (!problem) { this.byPlayer.set(player, { x, y }); this.routes.delete(player); }
      return problem;
    },

    // Datorn: ett steg mot målet. Flaggan flyttas högst en gång per flagSeconds och högst flagStep rutor, längs den väg soldaterna skulle gå
    // (så att den tar sig runt sjöar och berg), och bara till rutor som datorn utforskat. Är nästa bit av vägen outforskad står flaggan kvar:
    // soldaterna som kommit fram ser längre, så den kommer vidare.
    advance(player, goal) {
      const { flagSeconds, flagStep } = settings();
      if (Vision.time - (this.movedAt.get(player) ?? -Infinity) < flagSeconds) return;
      const flag = this.of(player), from = flag ?? this.start(player);
      if (!from || Math.hypot(goal.x - from.x, goal.y - from.y) < 1) return;
      this.movedAt.set(player, Vision.time);
      const key = goal.x + ',' + goal.y;
      let route = this.routes.get(player);
      if (!route || route.key !== key) {
        const path = CityBuilder.Pathfinder.findPathNow(from.x, from.y, goal.x, goal.y);
        if (!path) return;
        this.routes.set(player, route = { key, path, at: 0 });
      }
      let best = -1;
      for (let i = route.at; i < route.path.length; i++) {
        const step = route.path[i];
        if (Math.hypot(step.x - from.x, step.y - from.y) > flagStep || !Vision.explored(player, step.x, step.y)) break;
        if (!this.siteProblem(player, step.x, step.y)) best = i;
      }
      if (best < 0) return;
      route.at = best + 1;
      this.byPlayer.set(player, { x: route.path[best].x, y: route.path[best].y });
    },

    // Ljudet 'flag_enemy' när en fiendes flagga syns för människan (högst en gång per fiende och flagAlertSeconds)
    watch() {
      const { HUMAN } = CityBuilder.Players;
      for (const [player, flag] of this.byPlayer) {
        if (!CityBuilder.Players.isHostile(HUMAN, player) || !Vision.visible(HUMAN, flag.x, flag.y)) continue;
        if (Vision.time - (this.alertedAt.get(player) ?? -Infinity) < settings().flagAlertSeconds) continue;
        this.alertedAt.set(player, Vision.time);
        CityBuilder.Sound?.play('flag_enemy', { x: flag.x, y: flag.y });
      }
    },

    // Där en ny flagga börjar: närmaste egen garnison (annars basen)
    start(player) {
      const hq = World.hqOf(player);
      let best = hq, bestDistance = Infinity;
      for (const building of World.buildings) {
        if (building.player !== player || building.buildProgress < 1 || !CityBuilder.Garrison.isGarrison(building) || !hq) continue;
        const distance = Math.hypot(building.x - hq.x, building.y - hq.y);
        if (distance < bestDistance) { best = building; bestDistance = distance; }
      }
      return best;
    },

    // Sparning: [[spelare, x, y], ...]
    pack: () => [...Flags.byPlayer].map(([player, flag]) => [player, flag.x, flag.y]),
    restore(list) {
      this.reset();
      for (const [player, x, y] of list || []) this.byPlayer.set(player, { x, y });
    },
  };

  CityBuilder.Flags = Flags;
})(window.CityBuilder);
