/* Ekonomi: lagrens innehåll. storedReserved = reserverat för pågående leveranser. */
(function (CityBuilder) {
  'use strict';
  const { World, Utils } = CityBuilder;

  const Economy = {
    storages: () => World.buildings.filter(building => building.definition.isStorage && building.buildProgress >= 1),

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
    addToNearestStorage(resourceId, amount, nearPosition) {
      const storage = this.nearestStorage(nearPosition || World.headquarters);
      storage.storedGoods[resourceId] = (storage.storedGoods[resourceId] || 0) + amount;
    },
    // Halva byggkostnaden tillbaka vid rivning
    refund(cost) { for (const resourceId in cost) this.addToNearestStorage(resourceId, Math.floor(cost[resourceId] / 2)); },
  };

  CityBuilder.Economy = Economy;
})(window.CityBuilder);
