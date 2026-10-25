/* Trollformler: Config.buildings.enchanter.spells. En formel kostar varor ur lagret och förvandlar några lediga gräsrutor runt målet till
   nya fyndigheter (träd, bär, sten, malm ...). Målet får ligga högst spellRange rutor från förtrollaren, och varje förtrollare vilar
   spellCooldown sekunder efter en formel (building.spellCooldown, sparas med byggnaden). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Economy, Construction, Players, Utils } = CityBuilder;

  const Spells = {
    find: (building, id) => building.definition.spells?.find(spell => spell.id === id),

    // Gräsrutor inom radien som är helt tomma: ingen byggnad, ingen upptrampad stig och inte dold av dimman
    freeTiles(x, y, radius) {
      const tiles = [];
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.hypot(dx, dy) > radius) continue;
        const tile = World.getTile(x + dx, y + dy);
        if (tile && tile.terrainType === 'grass' && !tile.wear && !World.buildingAt(x + dx, y + dy) && !Construction.isHidden(x + dx, y + dy, Players.HUMAN)) tiles.push(tile);
      }
      return tiles;
    },

    // Orsaken till att formeln inte går att läsa nu, annars null
    problem(building, spell, x, y) {
      if (building.buildProgress < 1) return 'unbuilt';
      if ((building.spellCooldown || 0) > 0) return 'cooldown';
      if (Math.hypot(building.x - x, building.y - y) > building.definition.spellRange) return 'range';
      if (Construction.isHidden(x, y, building.player)) return 'fog';
      if (!Economy.canAfford(spell.cost, building.player)) return 'cost';
      if (!this.freeTiles(x, y, spell.radius).length) return 'room';
      return null;
    },

    // Läser formeln: returnerar orsaken om den misslyckas (ingenting förbrukas då), annars null
    cast(building, spell, x, y) {
      const problem = this.problem(building, spell, x, y);
      if (problem) return problem;
      Economy.spend(spell.cost, building.player);
      const tiles = this.freeTiles(x, y, spell.radius);
      const kinds = Object.entries(spell.terrains), total = kinds.reduce((sum, [, weight]) => sum + weight, 0);
      for (let n = Math.min(spell.count, tiles.length); n > 0; n--) {
        const tile = tiles.splice(Math.floor(Math.random() * tiles.length), 1)[0];
        let roll = Math.random() * total, type = kinds[0][0];
        for (const [kind, weight] of kinds) if ((roll -= weight) < 0) { type = kind; break; }
        const [low, high] = spell.amount || [];
        Utils.assign(tile, Config.terrain[type], { terrainType: type, remainingAmount: low === undefined ? Config.terrain[type].resourceAmount : low + Math.floor(Math.random() * (high - low + 1)) });
      }
      CityBuilder.Pathfinder.clearCache();
      building.spellCooldown = building.definition.spellCooldown;
      CityBuilder.Sound?.play('built', { x, y });
      return null;
    },
  };
  CityBuilder.Spells = Spells;

  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.spells = {
    update(deltaSeconds) {
      for (const building of World.buildings) if (building.spellCooldown > 0) building.spellCooldown = Math.max(0, building.spellCooldown - deltaSeconds);
    },
  };
})(window.CityBuilder);
