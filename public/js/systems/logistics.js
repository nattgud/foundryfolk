/* Logistik: direktleverans mellan hus via bärare, lager som buffert.
   Ett uppdrag (task) = { source, destination, resource }: hämta en enhet från source och lämna i destination. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Utils, Jobs, Economy, Behaviors } = CityBuilder;

  const Logistics = {
    tasks: [],
    planningTimer: 0,

    // Närmaste källa (hus eller lager) med ledigt innehåll av resursen
    findSupplier(resourceId, nearBuilding) {
      let best = null, bestDistance = 1e9;
      for (const candidate of World.buildings) {
        if (candidate === nearBuilding || candidate.buildProgress < 1) continue;
        const available = candidate.definition.isStorage
          ? (candidate.storedGoods[resourceId] || 0) - (candidate.storedReserved[resourceId] || 0)
          : (candidate.outputStock[resourceId] || 0) - (candidate.outputReserved[resourceId] || 0);
        if (available > 0) {
          const distance = Utils.manhattanDistance(candidate, nearBuilding);
          if (distance < bestDistance) { bestDistance = distance; best = candidate; }
        }
      }
      return best;
    },

    reservationsOf: building => building.definition.isStorage ? building.storedReserved : building.outputReserved,
    reserve(source, resourceId) {
      const reservations = this.reservationsOf(source);
      reservations[resourceId] = (reservations[resourceId] || 0) + 1;
    },
    releaseReservation(source, resourceId) { if (!source.removed) this.reservationsOf(source)[resourceId]--; },

    createTask(source, destination, resourceId) {
      this.reserve(source, resourceId);
      if (!destination.definition.isStorage) destination.incomingCount[resourceId] = (destination.incomingCount[resourceId] || 0) + 1;
      this.tasks.push({ source, destination, resource: resourceId });
    },

    update(deltaSeconds) {
      if ((this.planningTimer -= deltaSeconds) <= 0) {
        this.planningTimer = Config.settings.logistics.planningIntervalSeconds;
        this.purgeInvalidTasks(); this.requestMissingInputs(); this.flushSurplusToStorage();
      }
      this.assignTasksToCarriers();
    },

    purgeInvalidTasks() { // släng uppdrag vars källa eller mål rivits
      this.tasks = this.tasks.filter(task => {
        if (task.destination.removed) { this.releaseReservation(task.source, task.resource); return false; }
        if (task.source.removed) {
          if (!task.destination.definition.isStorage) task.destination.incomingCount[task.resource]--;
          return false;
        }
        return true;
      });
    },

    requestMissingInputs() { // hus som behöver indata beställer från närmaste källa
      const { maxTasks, requestsPerBuilding } = Config.settings.logistics;
      for (const building of World.buildings) {
        if (building.buildProgress < 1 || !building.definition.job) continue;
        for (const [resourceId, capacity] of Object.entries(Behaviors.requiredResources(building))) {
          const missing = capacity - (building.inputStock[resourceId] || 0) - (building.incomingCount[resourceId] || 0);
          for (let requested = 0; requested < Math.min(requestsPerBuilding, missing) && this.tasks.length < maxTasks; requested++) {
            const supplier = this.findSupplier(resourceId, building);
            if (!supplier) break;
            this.createTask(supplier, building, resourceId);
          }
        }
      }
    },

    flushSurplusToStorage() { // överskott i utbuffert -> närmaste lager
      for (const building of World.buildings) {
        if (building.definition.isStorage || building.buildProgress < 1) continue;
        for (const resourceId in building.outputStock) {
          const unreserved = building.outputStock[resourceId] - (building.outputReserved[resourceId] || 0);
          if (unreserved > Config.settings.flushThreshold && this.tasks.length < Config.settings.logistics.maxTasks) {
            this.createTask(building, Economy.nearestStorage(building), resourceId);
          }
        }
      }
    },

    assignTasksToCarriers() {
      for (let i = this.tasks.length - 1; i >= 0; i--) {
        const task = this.tasks[i];
        let bestCarrier = null, bestDistance = 1e9;
        for (const unit of World.units) {
          if (unit.definition.isHauler && !unit.stepQueue.length && !unit.carriedResource && !unit.deliveryTask) {
            const distance = Utils.manhattanDistance(unit, task.source);
            if (distance < bestDistance) { bestDistance = distance; bestCarrier = unit; }
          }
        }
        if (!bestCarrier) return; // inga lediga bärare
        this.tasks.splice(i, 1);
        bestCarrier.deliveryTask = task;
        bestCarrier.hasPickedUp = false;
        bestCarrier.stepQueue = [
          Jobs.walkTo(task.source.x, task.source.y),
          Jobs.run(unit => this.pickUp(unit)),
          Jobs.walkTo(task.destination.x, task.destination.y),
          Jobs.run(unit => this.dropOff(unit)),
        ];
      }
    },

    pickUp(carrier) {
      const task = carrier.deliveryTask;
      if (task.source.removed) { this.abortTask(carrier); return false; }
      if (task.source.definition.isStorage) {
        task.source.storedGoods[task.resource]--; task.source.storedReserved[task.resource]--;
      } else {
        task.source.outputStock[task.resource]--; task.source.outputReserved[task.resource]--;
      }
      carrier.carriedResource = task.resource;
      carrier.hasPickedUp = true;
    },

    dropOff(carrier) {
      const task = carrier.deliveryTask, destination = task.destination;
      if (destination.removed) Economy.addToNearestStorage(task.resource, 1, carrier);
      else if (destination.definition.isStorage) destination.storedGoods[task.resource] = (destination.storedGoods[task.resource] || 0) + 1;
      else {
        destination.inputStock[task.resource] = (destination.inputStock[task.resource] || 0) + 1;
        destination.incomingCount[task.resource]--;
      }
      carrier.carriedResource = null; carrier.deliveryTask = null; carrier.hasPickedUp = false;
    },

    abortTask(carrier) { // bryt uppdrag och släpp reservationer
      const task = carrier.deliveryTask;
      if (!task) return;
      carrier.deliveryTask = null;
      if (!carrier.hasPickedUp) this.releaseReservation(task.source, task.resource);
      if (!task.destination.definition.isStorage && !task.destination.removed) task.destination.incomingCount[task.resource]--;
    },
  };

  CityBuilder.Logistics = Logistics;
})(window.CityBuilder);
