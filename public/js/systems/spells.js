/* Trollformler: Config.buildings.enchanter.spells. En formel kostar varor ur lagret och läses på en plats inom spellRange rutor från
   förtrollaren; varje förtrollare vilar spellCooldown sekunder efteråt (building.spellCooldown, sparas med byggnaden). Typer (spell.kind):
     create   förvandlar lediga gräsrutor runt målet till nya fyndigheter (träd, bär, sten, malm ...)
     pace     arbetare och verkstäder i området arbetar 'factor' gånger så fort i 'seconds' sekunder
     yield    byggnader i området ger 'bonus' extra utdata (1 = dubbelt) i 'seconds' sekunder
     carriers bärare i området går 'factor' gånger så fort i 'seconds' sekunder
     surge    djuren i området får ungar 'factor' gånger så ofta i 'seconds' sekunder
     smite    fiendens soldater i området får högst 'health' (0-1) av sitt liv kvar
   Tidsbegränsade effekter är zoner (Spells.zones, sparas) som övriga system frågar efter med Spells.factor och Spells.bonus. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Economy, Construction, Players, Utils } = CityBuilder;

  const Spells = {
    zones: [],   // { kind, x, y, radius, player, left, total, factor?, bonus? }: pågående effekter

    reset() { this.zones = []; },

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
      if (spell.kind === 'create' ? !this.freeTiles(x, y, spell.radius).length : !this.hasTargets(spell, x, y, building.player)) return spell.kind === 'create' ? 'room' : 'nothing';
      return null;
    },

    // Finns det något i området som formeln kan verka på? (Så att ingen formel bränns på tom mark.)
    hasTargets(spell, x, y, player) {
      const inside = thing => Math.hypot(thing.x - x, thing.y - y) <= spell.radius;
      switch (spell.kind) {
        case 'smite': return World.units.some(unit => unit.definition.isSoldier && Players.isHostile(player, unit.player) && inside(unit));
        case 'surge': return World.units.some(unit => unit.definition.isAnimal && inside(unit));
        case 'carriers': return World.units.some(unit => unit.definition.isHauler && unit.player === player && inside(unit));
        default: return World.buildings.some(other => other.player === player && other.buildProgress >= 1 && other.definition.job && inside(other));
      }
    },

    // Tidsbegränsade effekter. En ny zon av samma slag på samma plats förnyar den gamla i stället för att läggas ovanpå.
    addZone(zone) {
      const old = this.zones.find(z => z.kind === zone.kind && z.player === zone.player && z.x === zone.x && z.y === zone.y);
      if (old) Object.assign(old, zone); else this.zones.push(zone);
    },

    // Störst 'factor' bland zonerna av slaget som täcker platsen (1 = ingen effekt). player undefined = gäller alla (djur).
    factor(kind, x, y, player) {
      let best = 1;
      for (const zone of this.zones) {
        if (zone.kind === kind && zone.factor > best && (player === undefined || zone.player === player) && Math.hypot(zone.x - x, zone.y - y) <= zone.radius) best = zone.factor;
      }
      return best;
    },

    // Störst extra utdata (bonus) bland zonerna som täcker byggnaden
    bonus(building, kind) {
      let best = 0;
      for (const zone of this.zones) {
        if (zone.kind === kind && zone.bonus > best && zone.player === building.player && Math.hypot(zone.x - building.x, zone.y - building.y) <= zone.radius) best = zone.bonus;
      }
      return best;
    },

    // Fart för en enhet: arbetare följer sitt hus, bärare sin plats
    paceOf(unit) {
      if (!this.zones.length) return 1;
      if (unit.homeBuilding) return this.factor('pace', unit.homeBuilding.x, unit.homeBuilding.y, unit.player);
      return unit.definition.isHauler ? this.factor('carriers', unit.x, unit.y, unit.player) : 1;
    },

    // Smiter: fiendens soldater i området får högst 'health' av sitt liv kvar (ingen dör av det, de blir bara lätta att ta)
    smite(spell, x, y, player) {
      for (const unit of World.units) {
        if (!unit.definition.isSoldier || !Players.isHostile(player, unit.player) || Math.hypot(unit.x - x, unit.y - y) > spell.radius) continue;
        unit.hp = Math.min(unit.hp, Math.max(1, Math.ceil(unit.definition.maxHp * spell.health)));
      }
    },

    // Läser formeln: returnerar orsaken om den misslyckas (ingenting förbrukas då), annars null
    cast(building, spell, x, y) {
      const problem = this.problem(building, spell, x, y);
      if (problem) return problem;
      Economy.spend(spell.cost, building.player);
      if (spell.kind !== 'create') {
        if (spell.kind === 'smite') this.smite(spell, x, y, building.player);
        const seconds = spell.seconds || 1.5;   // smiter har ingen varaktighet, bara en blixt
        this.addZone({ kind: spell.kind, id: spell.id, x, y, radius: spell.radius, player: building.player, left: seconds, total: seconds, factor: spell.factor, bonus: spell.bonus });
        building.spellCooldown = building.definition.spellCooldown;
        CityBuilder.Sound?.play('built', { x, y });
        return null;
      }
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
      if (Spells.zones.length) Spells.zones = Spells.zones.filter(zone => (zone.left -= deltaSeconds) > 0);
    },
  };
})(window.CityBuilder);
