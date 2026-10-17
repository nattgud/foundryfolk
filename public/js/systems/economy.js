/* Ekonomi: lagrens innehåll. storedReserved = reserverat för pågående leveranser.
   Alla lager räknas som ett gemensamt lager: antal och tak är gemensamma, varorna ligger fysiskt i de enskilda lagren.
   Taket per resurs = summan av lagrens capacity * resursens storageFactor (ovanliga resurser tar mer plats). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Utils } = CityBuilder;

  // Hur stor del av ett lagers capacity en resurs får. Allt som inte står här = 1. Kan åsidosättas med resource.storageFactor.
  const STORAGE_FACTOR = {};
  const setFactor = (factor, ids) => ids.split(' ').forEach(id => { STORAGE_FACTOR[id] = factor; });
  setFactor(0.6, 'brick charcoal ash limestone coal iron_ore copper_ore tin_ore salt_ore salt leather');
  setFactor(0.4, 'iron copper tin bronze steel tar sulfur potion');
  setFactor(0.3, 'axe pickaxe hammer saw scythe shovel knife');
  setFactor(0.15, 'silver_ore silver gold_ore crystal enchanted_wood cursed_ash coins');
  setFactor(0.08, 'gold gemstone moonstone fallen_star ancient_relic');
  const MIN_CAPACITY = 5;

  const Economy = {
    incoming: {},          // resurs -> antal enheter på väg till ett lager (sätts av Logistics)
    baseCapacity: 0,       // summan av lagrens capacity (uppdateras av updateStats)
    stored: {},            // resurs -> totalt antal i lagren (uppdateras av updateStats)

    storages: () => World.buildings.filter(building => building.definition.isStorage && building.buildProgress >= 1),

    // Räknas om då och då (Logistics, vid planering) så att kontroller i loopar blir billiga
    updateStats() {
      this.baseCapacity = 0;
      this.stored = {};
      for (const storage of this.storages()) {
        this.baseCapacity += storage.definition.capacity ?? 50;
        for (const resourceId in storage.storedGoods) this.stored[resourceId] = (this.stored[resourceId] || 0) + storage.storedGoods[resourceId];
      }
    },

    factorOf: resourceId => Config.resources[resourceId]?.storageFactor ?? STORAGE_FACTOR[resourceId] ?? 1,

    capacity(resourceId) {
      return Math.max(MIN_CAPACITY, Math.floor(this.baseCapacity * this.factorOf(resourceId)));
    },
    // Finns det plats för en till (inklusive leveranser på väg)?
    isFull(resourceId) {
      return (this.stored[resourceId] || 0) + (this.incoming[resourceId] || 0) >= this.capacity(resourceId);
    },

    freeAmount(resourceId) {
      let total = 0;
      for (const storage of this.storages()) total += (storage.storedGoods[resourceId] || 0) - (storage.storedReserved[resourceId] || 0);
      return total;
    },
    totalAmount(resourceId) {
      let total = 0;
      for (const storage of this.storages()) total += storage.storedGoods[resourceId] || 0;
      return total;
    },
    canAfford(cost) { return Object.entries(cost).every(([resourceId, amount]) => this.freeAmount(resourceId) >= amount); },

    // Drar kostnaden från lagren. Returnerar false (utan att ta något) om resurserna inte räcker.
    spend(cost) {
      if (!this.canAfford(cost)) return false;
      for (const resourceId in cost) {
        let remaining = cost[resourceId];
        for (const storage of this.storages()) {
          const taken = Math.min(remaining, (storage.storedGoods[resourceId] || 0) - (storage.storedReserved[resourceId] || 0));
          if (taken > 0) { storage.storedGoods[resourceId] -= taken; remaining -= taken; }
        }
      }
      return true;
    },

    nearestStorage(position) {
      let best = World.headquarters, bestDistance = 1e9;
      for (const storage of this.storages()) {
        const distance = Utils.manhattanDistance(storage, position);
        if (distance < bestDistance) { bestDistance = distance; best = storage; }
      }
      return best;
    },
    // Tillbakalämning (rivning m.m.) tas alltid emot, även över taket, så att inget försvinner
    addToNearestStorage(resourceId, amount, nearPosition) {
      const storage = this.nearestStorage(nearPosition || World.headquarters);
      storage.storedGoods[resourceId] = (storage.storedGoods[resourceId] || 0) + amount;
    },
    // Halva byggkostnaden tillbaka vid rivning
    refund(cost) { for (const resourceId in cost) this.addToNearestStorage(resourceId, Math.floor(cost[resourceId] / 2)); },
  };

  CityBuilder.Economy = Economy;
})(window.CityBuilder);