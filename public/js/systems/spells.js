/* Trollformler. Förtrollaren blandar upp till Config.buildings.enchanter.mixing.slots ingredienser till en formel (Spells.evaluate):
     - den FÖRSTA ingrediensen väljer kategorin, alltså vad formeln gör. En katastrof blir därför alltid samma katastrof, aldrig slumpad
     - varje ingrediens har fem delar (kategori, styrka, varaktighet, räckvidd och vändare, se settings i buildings.js). Platsen ger en vikt (första väger mest)
     - styrkan är summan av ingrediensernas styrka. Mängden räknas inte in i styrkan: den ändrar bara varaktighet och räckvidd (hälften eller dubbelt)
     - ingredienser av ett annat slag än den första gör formeln oren och svagare. En ren formel har bara ingredienser av första slaget. Slag = formelns
       grupp, utom för Creation och Upheaval där varje familj (sten, malm, ädelsten, lund, och berg, vatten, sumpmark) är ett eget slag: en ren Creation
       ger bara en familj fyndigheter, och oftare de sällsynta, en blandad lite av varje, och en ren Upheaval tar bara bort en sorts hinder
     - en vändare vänder formeln när kategorin har en motsats (gift blir läkedom, regn blir klar himmel)
   En formel kostar ingredienserna ur lagret och läses på en plats inom spellRange rutor från förtrollaren; varje förtrollare vilar en
   stund efteråt (building.spellCooldown, sparas med byggnaden), och slaget formeln hör till är låst för alla spelarens förtrollare lika länge (Spells.locks). Slag (spell.kind):
     create   förvandlar lediga gräsrutor runt målet till nya fyndigheter (träd, bär, sten, malm, ädelstenar ...)
     break    tar bort hinder runt målet: berg och klippor, vatten eller sumpmark blir gräs
     yield    byggnader i området ger 'bonus' extra utdata (1 = dubbelt) i 'seconds' sekunder
     surge    djuren i området får ungar 'factor' gånger så ofta i 'seconds' sekunder
     summon   'count' monster av arten 'monster' dyker upp runt målet. De hör till monstren: de anfaller alla, också dig
     pace     arbetare och verkstäder i området arbetar 'factor' gånger så fort i 'seconds' sekunder
     carriers bärare i området går 'factor' gånger så fort i 'seconds' sekunder
     smite    fiendens soldater i området får högst 'health' (0-1) av sitt liv kvar
     mend     egna soldater i området får tillbaka 'heal' (0-1) av sitt liv
     rain     växter i området ökar i mängd (factor = hur ofta mot vanligt regn) i 'seconds' sekunder
     storm    lågt land vid vattnet i området översvämmas i 'seconds' sekunder (Weather.spawnFlood) och torkar sedan upp
     sky      vädret över hela kartan blir klart i 'seconds' sekunder: ingen dimma, storm eller tornado (pågående tornados släpper sitt byte)
     tornado  en tornado med radien 'radius' och livslängden 'seconds' uppstår på platsen; är formeln starkare än mixing.superStrength och innehåller mixing.superIngredient blir det en supertornado (super)
     lava     lava sprider sig ut från platsen och ligger het i 'seconds' sekunder innan den stelnar (Weather.spawnLava)
     meteors  ett meteorregn faller i 'seconds' sekunder över området (Weather.spawnMeteors)
   Tidsbegränsade effekter är zoner (Spells.zones, sparas) som övriga system frågar efter med Spells.factor och Spells.bonus. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Economy, Construction, Players, Utils } = CityBuilder;

  const BOOK_KEY = 'citybuilder.grimoire';

  const Spells = {
    zones: [],   // { kind, x, y, radius, player, left, total, factor?, bonus? }: pågående effekter
    locks: {},   // { 'spelare:slag': sekunder kvar }: slag som laddas om efter ett kast, för alla spelarens förtrollare
    book: null,  // trollboken: [{ mix: [{ id, amount }] }]. Hör till spelaren, inte till ett spel: den ligger i webbläsarens lagring och följer med mellan banor

    reset() {
      this.zones = [];
      this.locks = {};
      if (this.book) return;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(BOOK_KEY)); } catch (error) { /* ingen sparad bok */ }
      this.book = Array.isArray(saved) ? saved : Config.buildings.enchanter.mixing.book.map(recipe => ({ mix: recipe.map(([id, amount]) => ({ id, amount })) }));
    },

    persist() { try { localStorage.setItem(BOOK_KEY, JSON.stringify(this.book)); } catch (error) { /* lagring saknas: boken gäller till sidan laddas om */ } },

    // ---- Blandningen ----------------------------------------------------------------------------------------------------------

    // Ingredienserna som går att välja just nu: det spelaren har i lagret samt himlen som är uppe
    ingredients() {
      const config = Config.buildings.enchanter.mixing, night = CityBuilder.Weather.isNight();
      return Object.keys(config.ingredients).filter(id => config.sky[id] ? (config.sky[id] === 'night') === night : Economy.freeAmount(id) > 0);
    },

    // Blandningen [{ id, amount }] som ingrediensernas delar, i platsernas ordning: tomma platser och okända ingredienser hoppas över
    parts(mix) {
      const config = Config.buildings.enchanter.mixing;
      return mix.slice(0, config.slots).filter(slot => config.ingredients[slot.id] && slot.amount > 0).map((slot, index) => {
        const [category, strength, lasting, area, flip] = config.ingredients[slot.id], weight = config.weights[index], dose = config.sky[slot.id] ? 1 : slot.amount / config.dose;
        const group = category.split('.')[0];
        return { id: slot.id, amount: slot.amount, category, group, weight, strength: strength * weight, lasting: lasting * weight * dose, area: area * weight * dose, flip: !!flip };
      });
    },

    // Blandningen som formel, eller null om den är tom. Samma blandning ger alltid samma formel.
    evaluate(mix) {
      const config = Config.buildings.enchanter.mixing, parts = this.parts(mix), cost = {};
      for (const part of parts) if (!config.sky[part.id]) cost[part.id] = (cost[part.id] || 0) + part.amount;
      if (!Object.keys(cost).length) return null;
      const sum = key => parts.reduce((total, part) => total + part[key], 0), clamp = (low, high, value) => Math.min(high, Math.max(low, value));
      const first = parts[0], purity = parts.filter(part => part.group === first.group).reduce((total, part) => total + part.weight, 0) / sum('weight');
      const strength = clamp(0.3, 3, sum('strength') * config.strengthScale * (1 - config.impurity * (1 - purity)));
      const lasting = clamp(0.5, 2.5, 1 + sum('lasting')), seconds = base => Math.round(base * lasting);
      let category = first.category;
      if (parts.some(part => part.flip) && config.categories[category].inverse) category = config.categories[category].inverse;   // en vändare vänder formeln
      const { kind, name } = config.categories[category], [radius, least, most] = config.kinds[kind].radius;
      const ids = mix.slice(0, config.slots).filter(slot => config.ingredients[slot.id] && slot.amount > 0).map(slot => slot.id + ':' + slot.amount).join(',');
      const spell = { id: ids, cost, kind, category, noun: name, strength, power: strength, lasting, purity, pure: purity === 1, radius: clamp(least, most, radius + Math.round(sum('area'))), sky: parts.map(part => config.sky[part.id]).find(Boolean) };
      switch (kind) {
        case 'create': {   // den första ingrediensen väljer slaget, de följande väljer vilka fyndigheter som skapas (en ensam ingrediens väljer själv). Ju renare formel, desto jämnare chanser inom en familj: de sällsynta blir vanligare
          const terrains = {}, flatten = 1 - config.rarity * purity, rest = parts.slice(1).filter(part => part.group === first.group), chosen = rest.length ? rest : [first];
          for (const part of chosen) {
            const table = Object.fromEntries(Object.entries(config.categories[part.category].terrains).map(([terrain, chance]) => [terrain, chance ** flatten])), total = Object.values(table).reduce((a, b) => a + b, 0);
            for (const [terrain, chance] of Object.entries(table)) terrains[terrain] = (terrains[terrain] || 0) + chance / total * part.weight;
          }
          return Object.assign(spell, { terrains, count: Math.max(1, Math.round((2 + 3 * strength) * lasting)) });
        }
        case 'break': return Object.assign(spell, { power: 3.3 - strength });   // tar alltid bort allt inom radien; ett starkare förtrollat jordskalv vilar kortare
        case 'yield': return Object.assign(spell, { bonus: Math.min(1.5, Math.round(0.6 * strength * 10) / 10), seconds: seconds(15 + 15 * strength) });
        case 'surge': return Object.assign(spell, { factor: Math.min(30, Math.round(2 + 8 * strength)), seconds: seconds(15 + 15 * strength) });
        case 'summon': {   // arten växer med styrkan (svagast först), antalet med styrkan och varaktigheten
          const kinds = CityBuilder.Monsters.kinds(Infinity).sort((a, b) => Config.units[a].maxHp - Config.units[b].maxHp);
          return Object.assign(spell, { monster: kinds[Math.min(kinds.length - 1, Math.floor(strength / 3 * kinds.length))], count: clamp(2, 10, Math.round((2 + 2 * strength) * lasting)) });
        }
        case 'pace': case 'carriers': return Object.assign(spell, { factor: Math.min(3.5, Math.round((1 + 0.8 * strength) * 10) / 10), seconds: seconds(15 + 15 * strength) });
        case 'rain': case 'storm': return Object.assign(spell, { factor: Math.round(2 + 2 * strength), seconds: seconds(15 + 15 * strength) });
        case 'sky': return Object.assign(spell, { seconds: seconds(40 + 30 * strength) });
        case 'tornado': {   // nästan allt måste vara rätt för en supertornado: stor styrka och en uråldrig relik
          const huge = strength >= config.superStrength && parts.some(part => part.id === config.superIngredient);
          return Object.assign(spell, { super: huge, seconds: Math.min(30, seconds(12 + 8 * strength)), noun: huge ? 'Supercyclone' : name });
        }
        case 'lava': return Object.assign(spell, { seconds: seconds(15 + 15 * strength) });
        case 'meteors': return Object.assign(spell, { seconds: seconds(10 + 8 * strength) });
        case 'smite': return Object.assign(spell, { health: clamp(0.05, 0.5, Math.round((0.55 - 0.2 * strength) * 100) / 100) });
        default: return Object.assign(spell, { heal: Math.min(1, Math.round((0.3 + 0.25 * strength) * 100) / 100) });   // mend
      }
    },

    // Formeln för en id-sträng ("earth:2,fire:1"), så att ett kommando kan bära formeln som text
    fromId(id) {
      return this.evaluate(String(id).split(',').filter(Boolean).map(part => { const [slot, amount] = part.split(':'); return { id: slot, amount: Number(amount) }; }));
    },

    // Dagens recept ur trollboken som formler
    recipes() { return this.book.map(recipe => this.evaluate(recipe.mix)).filter(Boolean); },

    // Alla ingredienser som trollboken använder (för resursfältet)
    costs() { return this.recipes().map(spell => spell.cost); },

    // Gräsrutor inom radien som är helt tomma: ingen byggnad, ingen upptrampad stig och inte dold av dimman
    freeTiles(x, y, radius, player) {
      const tiles = [];
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (Utils.distance(dx, dy) > radius) continue;
        const tile = World.getTile(x + dx, y + dy);
        if (tile && tile.terrainType === 'grass' && !tile.wear && !World.buildingAt(x + dx, y + dy) && !Construction.isHidden(x + dx, y + dy, player)) tiles.push(tile);
      }
      return tiles;
    },

    // Slaget en formel hör till: forma marken, förstärkning, väder eller strid
    group(spell) { return Config.buildings.enchanter.mixing.kinds[spell.kind].group; },

    // Hur länge förtrollaren vilar och slaget är låst efter formeln: växer med styrkan (essensmängden, spell.power)
    recharge(spell) {
      const { min, max } = Config.buildings.enchanter.spellRecharge;
      return Math.round((min + (max - min) * (Math.min(2.5, Math.max(0.4, spell.power)) - 0.4) / 2.1) / 5) * 5;
    },

    lockKey: (player, group) => player + ':' + group,

    // Sekunder kvar innan slaget går att kasta igen
    lockLeft(player, group) { return this.locks[this.lockKey(player, group)] || 0; },

    // Orsaken till att formeln inte går att läsa nu, annars null
    problem(building, spell, x, y) {
      if (building.buildProgress < 1) return 'unbuilt';
      if ((building.spellCooldown || 0) > 0) return 'cooldown';
      if (this.lockLeft(building.player, this.group(spell)) > 0) return 'locked';
      if (Utils.distance(building.x - x, building.y - y) > building.definition.spellRange) return 'range';
      if (Construction.isHidden(x, y, building.player)) return 'fog';
      if (spell.sky && (spell.sky === 'night') !== CityBuilder.Weather.isNight()) return 'sky';
      if (!Economy.canAfford(spell.cost, building.player)) return 'cost';
      if (spell.kind === 'create' ? !this.freeTiles(x, y, spell.radius, building.player).length : !this.hasTargets(spell, x, y, building.player)) return spell.kind === 'create' ? 'room' : 'nothing';
      return null;
    },

    // Finns det något i området som formeln kan verka på? (Så att ingen formel bränns på tom mark.)
    hasTargets(spell, x, y, player) {
      const inside = thing => Utils.distance(thing.x - x, thing.y - y) <= spell.radius;
      switch (spell.kind) {
        case 'surge': return World.units.some(unit => unit.definition.isAnimal && inside(unit));
        case 'summon': return CityBuilder.Monsters.summonSpots(x, y, spell.radius, player).length > 0;
        case 'smite': return World.units.some(unit => unit.definition.isSoldier && Players.isHostile(player, unit.player) && inside(unit));
        case 'mend': return World.units.some(unit => unit.definition.isSoldier && unit.player === player && unit.hp < unit.definition.maxHp && inside(unit));
        case 'carriers': return World.units.some(unit => unit.definition.isHauler && unit.player === player && inside(unit));
        case 'break': return this.obstacles(spell, x, y, player).length > 0;
        case 'rain': return CityBuilder.Weather.hasPlants({ x, y, radius: spell.radius });
        case 'storm': return CityBuilder.Weather.canFlood(x, y, spell.radius);
        case 'sky': return CityBuilder.Weather.type !== 'clear' || CityBuilder.Weather.tornadoes.length > 0;
        case 'lava': return CityBuilder.Weather.lavaPlan(x, y, spell.radius).length > 0;
        case 'tornado': case 'meteors': return true;
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
        if (zone.kind === kind && zone.factor > best && (player === undefined || zone.player === player) && Utils.distance(zone.x - x, zone.y - y) <= zone.radius) best = zone.factor;
      }
      return best;
    },

    // Störst extra utdata (bonus) bland zonerna som täcker byggnaden
    bonus(building, kind) {
      let best = 0;
      for (const zone of this.zones) {
        if (zone.kind === kind && zone.bonus > best && zone.player === building.player && Utils.distance(zone.x - building.x, zone.y - building.y) <= zone.radius) best = zone.bonus;
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
        if (!unit.definition.isSoldier || !Players.isHostile(player, unit.player) || Utils.distance(unit.x - x, unit.y - y) > spell.radius) continue;
        unit.hp = Math.min(unit.hp, Math.max(1, Math.ceil(unit.definition.maxHp * spell.health)));
      }
    },

    // Läker: egna soldater i området får tillbaka en del av sitt liv
    mend(spell, x, y, player) {
      for (const unit of World.units) {
        if (!unit.definition.isSoldier || unit.player !== player || Utils.distance(unit.x - x, unit.y - y) > spell.radius) continue;
        unit.hp = Math.min(unit.definition.maxHp, unit.hp + Math.ceil(unit.definition.maxHp * spell.heal));
      }
    },

    // Rutorna inom radien som inte är gräs (berg, vatten, sumpmark, skog, fyndigheter) och inte ligger i dimman
    obstacles(spell, x, y, player) {
      const tiles = [];
      for (let dy = -spell.radius; dy <= spell.radius; dy++) for (let dx = -spell.radius; dx <= spell.radius; dx++) {
        const tile = Utils.distance(dx, dy) <= spell.radius && World.getTile(x + dx, y + dy);
        if (tile && tile.terrainType !== 'grass' && !Construction.isHidden(x + dx, y + dy, player)) tiles.push(tile);
      }
      return tiles;
    },

    // Allt inom radien blir gräs
    breakObstacles(spell, x, y, player) {
      for (const tile of this.obstacles(spell, x, y, player)) Utils.assign(tile, Config.terrain.grass, { terrainType: 'grass', remainingAmount: 0, wear: 0 });
      CityBuilder.Pathfinder.clearCache();
    },

    // Förvandlar lediga gräsrutor runt målet till nya fyndigheter
    create(spell, x, y, player) {
      const tiles = this.freeTiles(x, y, spell.radius, player);
      const kinds = Object.entries(spell.terrains), total = kinds.reduce((sum, [, weight]) => sum + weight, 0);
      for (let n = Math.min(spell.count, tiles.length); n > 0; n--) {
        const tile = tiles.splice(Math.floor(Utils.random() * tiles.length), 1)[0];
        let roll = Utils.random() * total, type = kinds[0][0];
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
        const seconds = effect.seconds || 1.5;   // smiter och läkning har ingen varaktighet, bara en blixt
        this.addZone({ kind: effect.kind, x, y, radius: effect.radius, player: building.player, left: seconds, total: seconds, factor: effect.factor, bonus: effect.bonus });
      };
      const Weather = CityBuilder.Weather;
      if (spell.kind === 'create') this.create(spell, x, y, building.player);
      else if (spell.kind === 'break') this.breakObstacles(spell, x, y, building.player);
      else if (spell.kind === 'sky') Weather.clearSky(spell.seconds);
      else if (spell.kind === 'tornado') Weather[spell.super ? 'spawnSuper' : 'spawnTornado'](x, y, spell.radius, spell.seconds, building.player);
      else if (spell.kind === 'lava') Weather.spawnLava(x, y, spell.radius, spell.seconds);
      else if (spell.kind === 'meteors') Weather.spawnMeteors(x, y, spell.radius, spell.seconds);
      else if (spell.kind === 'summon') CityBuilder.Monsters.summon(spell.monster, spell.count, x, y, spell.radius, building.player);
      else if (spell.kind === 'storm') { Weather.spawnFlood(x, y, spell.radius, spell.seconds); CityBuilder.Sound?.play('weather.thunder'); zone(spell); }
      else { if (spell.kind === 'smite') this.smite(spell, x, y, building.player); else if (spell.kind === 'mend') this.mend(spell, x, y, building.player); zone(spell); }
      building.spellCooldown = building.spellTotal = this.recharge(spell);
      this.locks[this.lockKey(building.player, this.group(spell))] = building.spellCooldown;
      CityBuilder.Levels?.onCast(building.player);
      CityBuilder.Sound?.play('built', { x, y });
      return null;
    },
  };
  CityBuilder.Spells = Spells;

  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.spells = {
    update(deltaSeconds) {
      for (const building of World.buildings) if (building.spellCooldown > 0) building.spellCooldown = Math.max(0, building.spellCooldown - deltaSeconds);
      for (const key in Spells.locks) if ((Spells.locks[key] -= deltaSeconds) <= 0) delete Spells.locks[key];
      if (!Spells.zones.length) return;
      for (const zone of Spells.zones) {
        if (zone.kind !== 'rain' || (zone.scan = (zone.scan || 0) - deltaSeconds) > 0) continue;
        zone.scan = Config.settings.weather.scanSeconds;
        CityBuilder.Weather.affectPlants(zone.kind, zone);   // lokalt väder: samma effekt som det vanliga, men bara inom zonen
      }
      Spells.zones = Spells.zones.filter(zone => (zone.left -= deltaSeconds) > 0);
    },
  };
})(window.CityBuilder);
