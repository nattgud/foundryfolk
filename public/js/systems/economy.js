/* Ekonomi: lagrens innehåll. storedReserved = reserverat för pågående leveranser.
   Varje spelare har sitt eget gemensamma lager: alla spelarens lager räknas som ett. Antal och tak är gemensamma, varorna ligger fysiskt i de enskilda lagren.
   Taket per resurs = summan av lagrens capacity * resursens storageFactor (ovanliga resurser tar mer plats). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Utils, Players } = CityBuilder;

  // Hur stor del av ett lagers capacity en resurs får. Allt som inte står här = 1. Kan åsidosättas med resource.storageFactor.
  const STORAGE_FACTOR = {};
  const setFactor = (factor, ids) => ids.split(' ').forEach(id => { STORAGE_FACTOR[id] = factor; });
  setFactor(0.6, 'brick charcoal ash limestone coal iron_ore copper_ore tin_ore salt_ore salt leather');
  setFactor(0.4, 'iron copper tin bronze steel tar sulfur');
  setFactor(0.3, 'axe pickaxe hammer saw scythe shovel knife sword bow leather_armor iron_armor');
  setFactor(0.2, 'horse');
  setFactor(0.15, 'silver_ore silver gold_ore crystal enchanted_wood potion cursed_ash coins');
setFactor(0.1, 'talisman');
  setFactor(0.08, 'gold gemstone moonstone fallen_star ancient_relic');
  const MIN_CAPACITY = 5;
  const FLOW_BUCKET = 10, FLOW_WINDOW = 300;   // sekunder

  const Economy = {
    // Lager, tak och "på väg" räknas per spelare. Alla funktioner tar spelare som sista parameter (standard = den mänskliga spelaren).
    // Funktioner som får en position (nearestStorage m.fl.) tar spelaren från positionen om den är en enhet eller byggnad.
    playerStats: {},       // spelare -> { baseCapacity, stored, incoming } (uppdateras av updateStats; incoming sätts av Logistics)

    stats(player = Players.HUMAN) {
      return this.playerStats[player] || (this.playerStats[player] = { baseCapacity: 0, stored: {}, incoming: {} });
    },

    storages: (player = Players.HUMAN) => World.buildings.filter(building => building.player === player && building.definition.isStorage && building.buildProgress >= 1),

    // Räknas om då och då (Logistics, vid planering) så att kontroller i loopar blir billiga
    updateStats() {
      for (const player in this.playerStats) Object.assign(this.playerStats[player], { baseCapacity: 0, stored: {} });
      for (const storage of World.buildings) {
        if (!storage.definition.isStorage || storage.buildProgress < 1) continue;
        const stats = this.stats(storage.player);
        stats.baseCapacity += storage.definition.capacity ?? 50;
        for (const resourceId in storage.storedGoods) stats.stored[resourceId] = (stats.stored[resourceId] || 0) + storage.storedGoods[resourceId];
      }
    },

    factorOf: resourceId => Config.resources[resourceId]?.storageFactor ?? STORAGE_FACTOR[resourceId] ?? 1,

    capacity(resourceId, player) {
      return Math.max(MIN_CAPACITY, Math.floor(this.stats(player).baseCapacity * this.factorOf(resourceId)));
    },
    // Finns det plats för en till (inklusive leveranser på väg)?
    isFull(resourceId, player) {
      const { stored, incoming } = this.stats(player);
      return (stored[resourceId] || 0) + (incoming[resourceId] || 0) >= this.capacity(resourceId, player);
    },

    freeAmount(resourceId, player) {
      let total = 0;
      for (const storage of this.storages(player)) total += (storage.storedGoods[resourceId] || 0) - (storage.storedReserved[resourceId] || 0);
      return total;
    },
    totalAmount(resourceId, player) {
      let total = 0;
      for (const storage of this.storages(player)) total += storage.storedGoods[resourceId] || 0;
      return total;
    },
    canAfford(cost, player) { return Object.entries(cost).every(([resourceId, amount]) => this.freeAmount(resourceId, player) >= amount); },

    // Drar kostnaden från lagren. Returnerar false (utan att ta något) om resurserna inte räcker.
    spend(cost, player, trade = false) {
      if (!this.canAfford(cost, player)) return false;
      if (!trade) for (const resourceId in cost) this.record(player, 'use', resourceId, 'construction', cost[resourceId]);
      const storages = this.storages(player);
      for (const resourceId in cost) {
        let remaining = cost[resourceId];
        for (const storage of storages) {
          const taken = Math.min(remaining, (storage.storedGoods[resourceId] || 0) - (storage.storedReserved[resourceId] || 0));
          if (taken > 0) { storage.storedGoods[resourceId] -= taken; remaining -= taken; }
        }
      }
      return true;
    },

    // Närmaste lager åt 'player' (standard: positionens ägare, annars den mänskliga spelaren)
    nearestStorage(position, player = position.player ?? Players.HUMAN) {
      let best = World.hqOf(player), bestDistance = 1e9;
      for (const storage of this.storages(player)) {
        const distance = Utils.manhattanDistance(storage, position);
        if (distance < bestDistance) { bestDistance = distance; best = storage; }
      }
      return best;
    },
    // ---- Flöden: vart resurserna går och varifrån de kommer (visas i resursfönstret) -------------------------------
    // record(spelare, 'use' | 'make', resurs, etikett, antal): etikett = byggnadstyp (eller 'construction'). Bara spelarens egna räknas.
    // Sparas i hinkar om FLOW_BUCKET sekunder och bara de senaste FLOW_WINDOW sekunderna.
    flows: { use: {}, make: {} },
    now: () => CityBuilder.Logistics?.time || 0,
    record(player, kind, resourceId, label, amount = 1) {
      if (player !== Players.HUMAN || !(amount > 0)) return;
      const labels = (this.flows[kind][resourceId] = this.flows[kind][resourceId] || {});
      const buckets = (labels[label] = labels[label] || []);
      const bucket = Math.floor(this.now() / FLOW_BUCKET);
      if (buckets.length && buckets[buckets.length - 1][0] === bucket) buckets[buckets.length - 1][1] += amount; else buckets.push([bucket, amount]);
      while (buckets.length && buckets[0][0] < bucket - FLOW_WINDOW / FLOW_BUCKET) buckets.shift();
    },
    // [{ label, perMinute, total }] för resursen, störst först. Räknat på de senaste FLOW_WINDOW sekunderna (kortare i början av spelet, men aldrig kortare än 30 s).
    flow(kind, resourceId) {
      const now = this.now(), from = Math.floor(now / FLOW_BUCKET) - FLOW_WINDOW / FLOW_BUCKET + 1, seconds = Math.max(30, Math.min(FLOW_WINDOW, now));
      const rows = [];
      for (const [label, buckets] of Object.entries(this.flows[kind][resourceId] || {})) {
        const total = buckets.reduce((sum, [bucket, amount]) => (bucket >= from ? sum + amount : sum), 0);
        if (total > 0) rows.push({ label, total, perMinute: total * 60 / seconds });
      }
      return rows.sort((a, b) => b.total - a.total);
    },

    // ---- Handel (Market) ---------------------------------------------------------------------------------------------
    // Hur många till får plats av resursen (taket minus lagret och det som är på väg)?
    room(resourceId, player = Players.HUMAN) {
      const { stored, incoming } = this.stats(player);
      return Math.max(0, this.capacity(resourceId, player) - (stored[resourceId] || 0) - (incoming[resourceId] || 0));
    },
    marketOf(player = Players.HUMAN) {
      return World.buildings.find(building => building.player === player && building.definition.isMarket && building.buildProgress >= 1);
    },
    buyPrice: resourceId => Config.buildings.market.market.prices[resourceId],
    sellPrice(resourceId) {
      const price = this.buyPrice(resourceId);
      return price === undefined ? undefined : Math.max(1, Math.floor(price * Config.buildings.market.market.sellFactor));
    },
    // Köper så många (högst amount) som mynten och lagerplatsen räcker till. Returnerar antalet.
    buy(resourceId, amount, player = Players.HUMAN) {
      const price = this.buyPrice(resourceId);
      if (price === undefined || !this.marketOf(player)) return 0;
      const count = Math.min(amount, Math.floor(this.freeAmount('coins', player) / price), this.room(resourceId, player));
      if (count <= 0 || !this.spend({ coins: count * price }, player, true)) return 0;
      this.addToNearestStorage(resourceId, count, World.hqOf(player), player);
      this.updateStats();
      this.record(player, 'use', 'coins', 'market', count * price);
      this.record(player, 'make', resourceId, 'market', count);
      return count;
    },
    // Säljer så många (högst amount) som finns fria och som mynten får plats. Returnerar antalet.
    sell(resourceId, amount, player = Players.HUMAN) {
      const price = this.sellPrice(resourceId);
      if (price === undefined || !this.marketOf(player)) return 0;
      const count = Math.min(amount, this.freeAmount(resourceId, player), Math.floor(this.room('coins', player) / price));
      if (count <= 0 || !this.spend({ [resourceId]: count }, player, true)) return 0;
      this.addToNearestStorage('coins', count * price, World.hqOf(player), player);
      this.updateStats();
      this.record(player, 'use', resourceId, 'market', count);
      this.record(player, 'make', 'coins', 'market', count * price);
      return count;
    },

    // Tillbakalämning (rivning m.m.) tas alltid emot, även över taket, så att inget försvinner
    addToNearestStorage(resourceId, amount, nearPosition, player) {
      const near = nearPosition || World.headquarters;
      const storage = this.nearestStorage(near, player ?? near.player ?? Players.HUMAN);
      storage.storedGoods[resourceId] = (storage.storedGoods[resourceId] || 0) + amount;
    },
    // Halva byggnadskostnaden tillbaka vid rivning
    refund(cost, player = Players.HUMAN) { for (const resourceId in cost) this.addToNearestStorage(resourceId, Math.floor(cost[resourceId] / 2), World.hqOf(player), player); },
  };

  CityBuilder.Economy = Economy;
})(window.CityBuilder);
