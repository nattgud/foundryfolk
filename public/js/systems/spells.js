/* Trollformler. Förtrollaren blandar Config.buildings.enchanter.mixing.slots olika ingredienser till en formel (Spells.evaluate). De flesta blandningar ger
   ingenting, och färre ingredienser, eller samma ingrediens två gånger, ger alltid ingenting. Vilka ingredienser och hur många av varje spelar roll (platsernas ordning gör ingen skillnad)
   (se mixing i buildings.js):
     - ett sant recept: rätt ingredienser i rätt mängd. För lite av en ingrediens ger svagare styrka (högst ett visst antal steg fel, utspridda över
       ingredienserna), för mycket gör formeln ostadig. En ingrediens bytt mot en annan ur samma familj, gör den också ostadig (spell.chance)
       och lite svagare
     - en enda främmande ingrediens ger i stället den familjens egen, tråkigare effekt (alltid ostadig) eller ingenting
   En ostadig formel kan gå fel när den kastas: den landar då ALLTID på ett annat ställe än där spelaren tryckte (längre bort ju sämre blandning, inom synfältet)
   och blir ibland dessutom en helt annan effekt. En blandning utan effekt går också att kasta: den förbrukar ingredienserna. Spells.tried kommer ihåg vad som
   har provats ('none': ingen effekt, 'bad': gick fel). En ren formel (ett recept utan ostadighet) erbjuds spelaren att spara i trollboken, inget sparas av sig självt.
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

  const BOOK_KEY = 'citybuilder.grimoire', FAILED_KEY = 'citybuilder.triedmixes';

  const Spells = {
    zones: [],   // { kind, x, y, radius, player, left, total, factor?, bonus? }: pågående effekter
    locks: {},   // { 'spelare:slag': sekunder kvar }: slag som laddas om efter ett kast, för alla spelarens förtrollare
    declined: new Set(),   // ID för rena formler som spelaren sagt nej till att spara (bara i det här spelet)
    tried: {},   // { blandningens id: 'none' | 'bad' }: blandningar spelaren har provat och som inte gav något eller gick fel. De ligger i webbläsarens lagring och följer med mellan banor
    book: null,  // trollboken: [{ mix: [{ id, amount }] }]. Hör till spelaren, inte till ett spel: den ligger i webbläsarens lagring och följer med mellan banor

    reset() {
      this.zones = [];
      this.locks = {};
      this.declined = new Set();
      if (this.book) return;
      try { this.tried = JSON.parse(localStorage.getItem(FAILED_KEY)) || {}; } catch (error) { /* inga sparade försök */ }
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(BOOK_KEY)); } catch (error) { /* ingen sparad bok */ }
      this.book = Array.isArray(saved) ? saved.filter(recipe => this.evaluate(recipe.mix)) : Config.buildings.enchanter.mixing.book.map(recipe => ({ mix: recipe.map(([id, amount]) => ({ id, amount })) }));
    },

    persist() { try { localStorage.setItem(BOOK_KEY, JSON.stringify(this.book)); localStorage.setItem(FAILED_KEY, JSON.stringify(this.tried)); } catch (error) { /* lagring saknas: boken gäller till sidan laddas om */ } },

    // ---- Blandningen ----------------------------------------------------------------------------------------------------------

    // Ingredienserna som går att välja just nu: det spelaren har i lagret samt himlen som är uppe
    ingredients() {
      const config = Config.buildings.enchanter.mixing, night = CityBuilder.Weather.isNight();
      return Object.keys(config.ingredients).filter(id => config.sky[id] ? (config.sky[id] === 'night') === night : Economy.freeAmount(id) > 0);
    },

    // Blandningen [{ id, amount }] som [[id, mängd]] (samma ingrediens på flera platser slås ihop; tomma platser och okända hoppas över; himlen räknas som en)
    entries(mix) {
      const config = Config.buildings.enchanter.mixing, list = [];
      for (const slot of mix.slice(0, config.slots)) {
        if (!config.ingredients[slot.id] || !(slot.amount > 0)) continue;
        const amount = config.sky[slot.id] ? 1 : Math.min(config.maxAmount, slot.amount), old = list.find(entry => entry[0] === slot.id);
        if (old) old[1] = config.sky[slot.id] ? 1 : Math.min(config.maxAmount, old[1] + amount); else list.push([slot.id, amount]);
      }
      return list;
    },

    // Blandningens id: ingredienserna i bokstavsordning, så att platsernas ordning inte spelar roll ("sand:2,tar:1"), så att samma blandning alltid ger samma formel och ett kommando kan bära den som text
    idOf(entries) { return entries.map(([id, amount]) => id + ':' + amount).sort().join(','); },

    // Vad blandningen kostar ur lagret (himlen är gratis)
    costOf(entries) {
      const config = Config.buildings.enchanter.mixing, cost = {};
      for (const [id, amount] of entries) if (!config.sky[id]) cost[id] = amount;
      return cost;
    },

    // Hur väl blandningen träffar ett recept, eller null om den inte duger. Varje ingrediens måste höra till receptet, antingen själv, som byte mot en saknad
    // ingrediens ur samma familj, eller (en enda) som främmande ingrediens. Mängderna ger styrkan, byten och för mycket ger ostadighet.
    match(entries, recipe) {
      const config = Config.buildings.enchanter.mixing, needs = recipe.needs;
      if (entries.length !== needs.length) return null;
      const pairs = [], free = entries.map((entry, index) => ({ entry, index })), open = [];
      needs.forEach(([id, amount], index) => {
        const at = free.findIndex(item => item.entry[0] === id);
        if (at >= 0) pairs.push({ need: amount, have: free.splice(at, 1)[0], index, swap: false }); else open.push([id, amount, index]);
      });
      let foreign = null;
      for (const [id, amount, index] of open) {
        const at = free.findIndex(item => config.ingredients[item.entry[0]][0] === config.ingredients[id][0]);
        if (at >= 0 && !recipe.exact) { pairs.push({ need: amount, have: free.splice(at, 1)[0], index, swap: true }); continue; }
        if (foreign || recipe.exact) return null;
        foreign = [id, amount, index];
      }
      const swaps = pairs.filter(pair => pair.swap).length;
      if (swaps > config.maxSwaps) return null;
      if (foreign) foreign = free.pop().entry[0];
      let off = 0, over = 0;
      for (const pair of pairs) {
        const diff = pair.have.entry[1] - pair.need, miss = Math.abs(diff);
        if (miss > recipe.spread) return null;
        off += miss; over += Math.max(0, diff);
      }
      if (off > recipe.tolerance) return null;
      const unrest = Math.min(config.maxUnrest, swaps * config.swapUnrest + over * config.overUnrest);
      const factor = 1 - off * config.amountPenalty - swaps * config.swapPenalty;
      return factor < config.minQuality ? null : { factor, unrest, foreign };
    },

    // Receptet och träffen för blandningen, eller null. Ett rent recept går före ett med främmande ingrediens; bland jämbördiga vinner bäst träff.
    recipeOf(entries) {
      let best = null;
      for (const recipe of Config.buildings.enchanter.mixing.recipes) {
        const hit = this.match(entries, recipe);
        if (!hit) continue;
        const score = (hit.foreign ? 0 : 10) + hit.factor * (1 - hit.unrest);
        if (!best || score > best.score) best = { recipe, ...hit, score };
      }
      return best;
    },

    // Hur nära blandningen är ett sant recept, som antal ingredienser den delar med det närmaste (0 om den inte har alla platser fyllda). Det avslöjar inte vilket recept det är.
    nearness(entries) {
      const config = Config.buildings.enchanter.mixing;
      if (entries.length < config.slots) return 0;
      let best = 0;
      for (const recipe of config.recipes) best = Math.max(best, entries.filter(([id]) => recipe.needs.some(([need]) => need === id)).length);
      return best;
    },

    // Blandningen som formel, eller null om den inte ger någon effekt. Samma blandning ger alltid samma formel.
    evaluate(mix) {
      const config = Config.buildings.enchanter.mixing, entries = this.entries(mix);
      if (entries.length < config.slots || !Object.keys(this.costOf(entries)).length) return null;
      const id = this.idOf(entries);
      this.cache = this.cache || {};
      if (!(id in this.cache)) this.cache[id] = this.formula(id, entries);
      return this.cache[id];
    },

    formula(id, entries) {
      const config = Config.buildings.enchanter.mixing, clamp = (low, high, value) => Math.min(high, Math.max(low, value));
      const hit = this.recipeOf(entries);
      if (!hit) return null;
      const dull = hit.foreign && config.families[config.ingredients[hit.foreign][0]].effect;   // främmande ingrediens: familjens egen, tråkigare effekt
      if (hit.foreign && !dull) return null;
      const effect = dull || hit.recipe.effect, taint = hit.foreign ? config.taintStrength : 1;
      const [base] = config.kinds[config.categories[effect].kind].radius;
      const radius = hit.foreign ? base : Math.round(hit.recipe.radius * (0.5 + 0.5 * hit.factor)), unrest = hit.foreign ? config.taintUnrest : hit.unrest;
      const root = { id, cost: this.costOf(entries), mix: entries.map(([ingredient, amount]) => ({ id: ingredient, amount })), sky: entries.map(([ingredient]) => config.sky[ingredient]).find(Boolean) };
      const strength = hit.foreign ? config.taintPower * taint * hit.factor : hit.recipe.strength * hit.factor;
      const spell = this.shape(root, effect, { strength: clamp(0.3, 3, strength), quality: hit.factor * (1 - unrest), radius, lasting: hit.foreign ? 1 : 0.6 + 0.8 * hit.factor, recipe: !hit.foreign, super: !!hit.recipe.super && !hit.foreign });
      return Object.assign(spell, { chance: unrest, pure: !hit.foreign && unrest === 0 });   // ren: ett recept som aldrig går fel
    },

    // Effekten för en kategori som formel
    shape(root, category, { strength, quality, radius, lasting, recipe, super: huge }) {
      const config = Config.buildings.enchanter.mixing, clamp = (low, high, value) => Math.min(high, Math.max(low, value));
      const { kind, name } = config.categories[category], [, least, most] = config.kinds[kind].radius, seconds = base => Math.round(base * lasting);
      const spell = { ...root, kind, category, noun: name, recipe, strength, power: strength, lasting, purity: quality, radius: clamp(least, most, radius) };
      switch (kind) {
        case 'create': {   // familjens fyndigheter, en sällsyntare blandning av alla; ett sant recept jämnar ut chanserna (de sällsynta blir vanligare)
          const flatten = 1 - config.rarity * quality, table = config.categories[category].terrains;
          return Object.assign(spell, { terrains: Object.fromEntries(Object.entries(table).map(([terrain, chance]) => [terrain, chance ** flatten])), count: Math.max(1, Math.round((2 + 3 * strength) * lasting)) });
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
        case 'tornado': return Object.assign(spell, { super: huge, seconds: Math.min(30, seconds(12 + 8 * strength)), noun: huge ? 'Supercyclone' : name });
        case 'lava': return Object.assign(spell, { seconds: seconds(15 + 15 * strength) });
        case 'meteors': return Object.assign(spell, { seconds: seconds(10 + 8 * strength) });
        case 'smite': return Object.assign(spell, { health: clamp(0.05, 0.5, Math.round((0.55 - 0.2 * strength) * 100) / 100) });
        default: return Object.assign(spell, { heal: Math.min(1, Math.round((0.3 + 0.25 * strength) * 100) / 100) });   // mend
      }
    },

    // Blandningen för en id-sträng ("sand:2,tar:1")
    mixOf(id) {
      return String(id).split(',').filter(Boolean).map(part => { const [slot, amount] = part.split(':'); return { id: slot, amount: Number(amount) }; });
    },

    fromId(id) { return this.evaluate(this.mixOf(id)); },

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

    // Går en ostadig formel fel? Då hamnar den ALLTID någon annanstans än där spelaren tryckte, längre bort ju mer fel blandningen är (inom synfältet), och blir
    // ibland dessutom en annan effekt. Allt slumpas (Utils.random) bland alla effekter och ställen, så att det känns som ren tur.
    // Returnerar { spell, x, y } eller null.
    misfireOf(spell, x, y, player) {
      if (!spell.chance || Utils.random() >= spell.chance) return null;
      const config = Config.buildings.enchanter.mixing, wrong = config.misfire, reach = Math.min(1, spell.chance / config.maxUnrest);
      let moved = null;
      for (let tries = 0; tries < 30 && !moved; tries++) {
        const angle = Utils.random() * Math.PI * 2, far = 2 + (wrong.far - 2) * reach * (0.3 + 0.7 * Utils.random());
        const nx = Math.round(x + Math.cos(angle) * far), ny = Math.round(y + Math.sin(angle) * far);
        if ((nx !== x || ny !== y) && World.getTile(nx, ny) && !Construction.isHidden(nx, ny, player)) moved = { x: nx, y: ny };
      }
      if (moved) ({ x, y } = moved);
      if (Utils.random() < wrong.effect) {
        const categories = Object.keys(config.categories).filter(category => category !== spell.category), category = categories[Math.floor(Utils.random() * categories.length)];
        const [, least, most] = config.kinds[config.categories[category].kind].radius, [weak, strong] = wrong.strength;
        const strength = weak + Utils.random() * (strong - weak);
        spell = this.shape({ id: spell.id, cost: spell.cost, mix: spell.mix }, category, { strength, quality: 1, radius: Math.round(least + Utils.random() * (most - least)), lasting: 0.6 + Utils.random() * 0.8, recipe: false, super: false });
      }
      return { spell, x, y };
    },

    // Kastar en blandning som inte ger någon effekt: ingredienserna förbrukas (ingen vilotid, så man kan prova flera i rad) och blandningen kommer ihåg som misslyckad
    fizzle(building, id) {
      const cost = this.costOf(this.entries(this.mixOf(id)));
      if (!Object.keys(cost).length) return 'nothing';
      if (building.buildProgress < 1) return 'unbuilt';
      if ((building.spellCooldown || 0) > 0) return 'cooldown';
      if (!Economy.canAfford(cost, building.player)) return 'cost';
      Economy.spend(cost, building.player);
      this.tried[this.idOf(this.entries(this.mixOf(id)))] = 'none';
      this.persist();
      CityBuilder.Sound?.play('spell_fizzle');
      return null;
    },

    // Läser formeln: returnerar orsaken om den misslyckas (ingenting förbrukas då), annars null
    cast(building, spell, x, y) {   // this.misfire: { spell, x, y } om blandningen gick fel (annars null)
      const problem = this.problem(building, spell, x, y);
      if (problem) return problem;
      Economy.spend(spell.cost, building.player);
      const intended = spell;
      this.misfire = this.misfireOf(spell, x, y, building.player);
      if (this.misfire) {
        ({ spell, x, y } = this.misfire);
        this.tried[intended.id] = 'bad';
        this.persist();
      }
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
      building.spellCooldown = building.spellTotal = this.recharge(intended);
      this.locks[this.lockKey(building.player, this.group(intended))] = building.spellCooldown;
      CityBuilder.Levels?.onCast(building.player);
      if (spell.kind !== 'storm') CityBuilder.Sound?.play('spell_' + spell.kind, { x, y });   // åskan (storm) har sitt eget ljud ovan
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
