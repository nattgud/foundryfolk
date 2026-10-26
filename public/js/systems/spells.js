/* Trollformler. Förtrollaren blandar upp till Config.buildings.enchanter.mixing.slots ingredienser till en formel (Spells.evaluate):
     - varje ingrediens bär essenser; mängden ger kraft med exponent (a^0.6) och platsen en vikt (första väger mest)
     - en ingrediens vrider en del av nästa ingrediens essenser några steg på hjulet, så ordningen ändrar resultatet
     - den starkaste essensen väljer formelns slag, den näst starkaste ger en bieffekt eller ändrar den (vatten förlänger, jord vidgar ...)
   En formel kostar ingredienserna ur lagret och läses på en plats inom spellRange rutor från förtrollaren; varje förtrollare vilar
   spellCooldown sekunder efteråt (building.spellCooldown, sparas med byggnaden). Slag (spell.kind):
     create   förvandlar lediga gräsrutor runt målet till nya fyndigheter (träd, bär, sten, malm ...)
     pace     arbetare och verkstäder i området arbetar 'factor' gånger så fort i 'seconds' sekunder
     yield    byggnader i området ger 'bonus' extra utdata (1 = dubbelt) i 'seconds' sekunder
     carriers bärare i området går 'factor' gånger så fort i 'seconds' sekunder
     surge    djuren i området får ungar 'factor' gånger så ofta i 'seconds' sekunder
     smite    fiendens soldater i området får högst 'health' (0-1) av sitt liv kvar
     rain     växter i området ökar i mängd (factor = hur ofta mot vanligt regn) i 'seconds' sekunder
     storm    växter i området blåser till lediga grannrutor (factor = hur ofta mot vanlig storm) i 'seconds' sekunder
   Tidsbegränsade effekter är zoner (Spells.zones, sparas) som övriga system frågar efter med Spells.factor och Spells.bonus. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Economy, Construction, Players, Utils } = CityBuilder;

  const BOOK_KEY = 'citybuilder.grimoire';

  const Spells = {
    zones: [],   // { kind, x, y, radius, player, left, total, factor?, bonus? }: pågående effekter
    book: null,  // trollboken: [{ mix: [{ id, amount }] }]. Hör till spelaren, inte till ett spel: den ligger i webbläsarens lagring och följer med mellan banor

    reset() {
      this.zones = [];
      if (this.book) return;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(BOOK_KEY)); } catch (error) { /* ingen sparad bok */ }
      this.book = Array.isArray(saved) ? saved : Config.buildings.enchanter.mixing.book.map(recipe => ({ mix: recipe.map(([id, amount]) => ({ id, amount })) }));
    },

    persist() { try { localStorage.setItem(BOOK_KEY, JSON.stringify(this.book)); } catch (error) { /* lagring saknas: boken gäller till sidan laddas om */ } },

    // ---- Blandningen ----------------------------------------------------------------------------------------------------------

    // Ingredienserna som går att välja just nu: det spelaren har i lagret samt himlen som är uppe
    ingredients() {
      const night = CityBuilder.Weather.isNight();
      return Object.entries(Config.buildings.enchanter.mixing.ingredients)
        .filter(([id, essences]) => essences.sky ? (essences.sky === 'night') === night : Economy.freeAmount(id) > 0)
        .map(([id]) => id);
    },

    // Essenserna (i hjulets ordning) för en blandning [{ id, amount }]: { totals, sum } eller null om den är tom
    essences(mix) {
      const config = Config.buildings.enchanter.mixing, names = Object.keys(config.essences), n = names.length, totals = new Array(n).fill(0);
      let push = 0;
      mix.filter(slot => config.ingredients[slot.id] && slot.amount > 0).slice(0, config.slots).forEach((slot, index) => {
        const base = config.ingredients[slot.id], weight = Math.pow(slot.amount, config.amountExponent) * config.weights[index];
        const own = names.map(name => (base[name] || 0) * weight), vector = own.map((value, i) => value * (1 - (push ? config.shift : 0)));
        if (push) own.forEach((value, i) => { vector[(i + push) % n] += value * config.shift; });   // föregående ingrediens vrider denna
        push = 1 + vector.indexOf(Math.max(...vector)) % 3;
        vector.forEach((value, i) => { totals[i] += value; });
      });
      const sum = totals.reduce((a, b) => a + b, 0);
      return sum > 0 ? { totals, sum, names } : null;
    },

    // Blandningen som formel, eller null om den är tom. Samma blandning ger alltid samma formel.
    evaluate(mix) {
      const config = Config.buildings.enchanter.mixing, found = this.essences(mix);
      const cost = {};
      for (const slot of mix.slice(0, config.slots)) if (config.ingredients[slot.id] && !config.ingredients[slot.id].sky && slot.amount > 0) cost[slot.id] = (cost[slot.id] || 0) + slot.amount;
      if (!found || !Object.keys(cost).length) return null;
      const { totals, sum, names } = found, order = totals.map((value, i) => i).sort((a, b) => totals[b] - totals[a]);
      const first = names[order[0]], share = totals[order[0]] / sum, secondShare = totals[order[1]] / sum;
      const second = secondShare >= config.echoShare ? names[order[1]] : null;
      const power = Math.min(2.5, Math.max(0.4, sum / config.reference)), strength = Math.min(3, power * (0.5 + share));
      const sky = mix.map(slot => config.ingredients[slot.id]?.sky).find(Boolean);
      const spell = { id: mix.filter(slot => config.ingredients[slot.id] && slot.amount > 0).map(slot => slot.id + ':' + slot.amount).join(','), cost, first, second, sky, power };

      // Jord (eller växt/ande tillsammans med jord) formar marken; den andra essensen väljer vad som växer fram
      const table = first === 'earth' ? second || 'none' : second === 'earth' && (first === 'growth' || first === 'spirit') ? first : null;
      if (table) {
        const count = Math.max(1, Math.round((2 + 3 * strength) * (table === 'spirit' ? 0.5 : 1)));
        return Object.assign(spell, { kind: 'create', radius: strength > 1.6 ? 3 : 2, count, terrains: config.terrains[table], table, noun: 'Shaping', adjective: table === 'none' ? null : table });
      }
      // Övriga slag är tidsbegränsade (eller en blixt). Vatten som andra essens förlänger, jord vidgar, död stärker men förkortar.
      const timed = (kind, s, extra) => {
        const mod = extra === 'water' ? { seconds: 1.4 } : extra === 'earth' ? { radius: 1.3 } : extra === 'death' ? { strength: 1.25, seconds: 0.7 } : {};
        s *= mod.strength || 1;
        const base = { kind, radius: Math.round((5 + 3 * power) * (mod.radius || 1)), seconds: Math.round((15 + 15 * s) * (mod.seconds || 1)) };
        switch (kind) {
          case 'pace': case 'carriers': base.factor = Math.min(3.5, Math.round((1 + 0.8 * s) * 10) / 10); break;
          case 'yield': base.bonus = Math.min(1.5, Math.round(0.6 * s * 10) / 10); break;
          case 'surge': base.factor = Math.min(30, Math.round(2 + 8 * s)); break;
          default: base.factor = Math.round(2 + 2 * s);   // rain, storm
        }
        return base;
      };
      const kinds = { growth: 'yield', fire: 'pace', air: 'carriers', spirit: 'surge' };
      if (first === 'death') Object.assign(spell, { kind: 'smite', radius: Math.round(5 + 2 * power), health: Math.min(0.5, Math.max(0.05, Math.round((0.55 - 0.2 * strength) * 100) / 100)), noun: 'Blight' });
      else if (first === 'water') Object.assign(spell, timed(second === 'air' || second === 'fire' ? 'storm' : 'rain', strength, second), { noun: second === 'air' || second === 'fire' ? 'Tempest' : 'Rain' });
      else Object.assign(spell, timed(kinds[first], strength, second), { noun: { yield: 'Bloom', pace: 'Blaze', carriers: 'Gust', surge: 'Surge' }[kinds[first]] });
      spell.adjective = second;
      // Den näst starkaste essensen ger en svagare bieffekt när den har ett eget timat slag
      if (second && kinds[second]) {
        const echo = timed(kinds[second], power * (0.5 + secondShare) * 0.6, null);
        spell.echo = echo;
      }
      return spell;
    },

    // Dagens recept ur trollboken som formler
    recipes() { return this.book.map(recipe => this.evaluate(recipe.mix)).filter(Boolean); },

    // Alla ingredienser som trollboken använder (för resursfältet)
    costs() { return this.recipes().map(spell => spell.cost); },

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
      if (spell.sky && (spell.sky === 'night') !== CityBuilder.Weather.isNight()) return 'sky';
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
        case 'rain': case 'storm': return CityBuilder.Weather.hasPlants({ x, y, radius: spell.radius });
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

    // Förvandlar lediga gräsrutor runt målet till nya fyndigheter
    create(spell, x, y) {
      const tiles = this.freeTiles(x, y, spell.radius);
      const kinds = Object.entries(spell.terrains), total = kinds.reduce((sum, [, weight]) => sum + weight, 0);
      for (let n = Math.min(spell.count, tiles.length); n > 0; n--) {
        const tile = tiles.splice(Math.floor(Math.random() * tiles.length), 1)[0];
        let roll = Math.random() * total, type = kinds[0][0];
        for (const [kind, weight] of kinds) if ((roll -= weight) < 0) { type = kind; break; }
        Utils.assign(tile, Config.terrain[type], { terrainType: type, remainingAmount: Config.terrain[type].resourceAmount });
      }
      CityBuilder.Pathfinder.clearCache();
    },

    // Läser formeln: returnerar orsaken om den misslyckas (ingenting förbrukas då), annars null
    cast(building, spell, x, y) {
      const problem = this.problem(building, spell, x, y);
      if (problem) return problem;
      Economy.spend(spell.cost, building.player);
      const zone = effect => {
        const seconds = effect.seconds || 1.5;   // smiter har ingen varaktighet, bara en blixt
        this.addZone({ kind: effect.kind, x, y, radius: effect.radius, player: building.player, left: seconds, total: seconds, factor: effect.factor, bonus: effect.bonus });
      };
      if (spell.kind === 'create') this.create(spell, x, y);
      else { if (spell.kind === 'smite') this.smite(spell, x, y, building.player); zone(spell); }
      if (spell.echo) zone(spell.echo);
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
      if (!Spells.zones.length) return;
      for (const zone of Spells.zones) {
        if (zone.kind !== 'rain' && zone.kind !== 'storm' || (zone.scan = (zone.scan || 0) - deltaSeconds) > 0) continue;
        zone.scan = Config.settings.weather.scanSeconds;
        CityBuilder.Weather.affectPlants(zone.kind, zone);   // lokalt väder: samma effekt som det vanliga, men bara inom zonen
      }
      Spells.zones = Spells.zones.filter(zone => (zone.left -= deltaSeconds) > 0);
    },
  };
})(window.CityBuilder);
