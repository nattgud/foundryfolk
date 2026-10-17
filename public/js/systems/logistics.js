/* Logistik: direktleverans mellan hus via bärare, lager som buffert.
   Ett uppdrag (task) = { source, destination, resource }: hämta en enhet från source och lämna i destination. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Utils, Jobs, Economy, Behaviors } = CityBuilder;

  const Logistics = {
    tasks: [],              // äldsta först
    planningTimer: 0,
    cursor: 0,              // var nästa planering börjar i byggnadslistan (så att inga byggnader alltid kommer sist)

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
      else Economy.incoming[resourceId] = (Economy.incoming[resourceId] || 0) + 1;
      this.tasks.push({ source, destination, resource: resourceId });
    },

    update(deltaSeconds) {
      if ((this.planningTimer -= deltaSeconds) <= 0) {
        this.planningTimer = Config.settings.logistics.planningIntervalSeconds;
        Economy.updateStats();
        this.balanceCarriers(); this.purgeInvalidTasks(); this.requestMissingInputs(); this.flushSurplusToStorage();
      }
      this.assignTasksToCarriers();
    },

    purgeInvalidTasks() { // släng uppdrag vars källa eller mål rivits
      this.tasks = this.tasks.filter(task => {
        if (task.destination.removed) { this.releaseReservation(task.source, task.resource); this.releaseIncoming(task); return false; }
        if (task.source.removed) {
          this.releaseIncoming(task);
          return false;
        }
        return true;
      });
    },

    // Släpp "på väg"-räkningen för ett uppdrag (mål = hus eller lager)
    releaseIncoming(task) {
      const destination = task.destination;
      if (destination.definition.isStorage) Economy.incoming[task.resource] = Math.max(0, (Economy.incoming[task.resource] || 0) - 1);
      else if (!destination.removed) destination.incomingCount[task.resource]--;
    },

    // Antalet bärare följer antalet byggnader: bas + 1,5 per färdig byggnad. Överskott tas bort när de är lediga.
    balanceCarriers() {
      const { baseCarriers = 5, carriersPerBuilding = 1.5 } = Config.settings.logistics;
      let buildings = 0;
      for (const building of World.buildings) if (building.buildProgress >= 1 && building !== World.headquarters) buildings++;
      const target = baseCarriers + Math.floor(buildings * carriersPerBuilding);

      const carriers = World.units.filter(unit => unit.definition.isHauler);
      for (let count = carriers.length; count < target; count++) World.spawnUnit('carrier', World.headquarters.x, World.headquarters.y);
      for (let i = carriers.length - 1, surplus = carriers.length - target; i >= 0 && surplus > 0; i--) {
        const unit = carriers[i];
        if (unit.stepQueue.length || unit.carriedResource || unit.deliveryTask) continue;
        Behaviors.removeUnit(unit);
        surplus--;
      }
    },

    requestMissingInputs() { // hus som behöver indata beställer från närmaste källa
      const { maxTasks, requestsPerBuilding } = Config.settings.logistics;
      const buildings = World.buildings, count = buildings.length;
      if (!count) return;
      const start = this.cursor % count;
      let visited = 0;
      for (; visited < count && this.tasks.length < maxTasks; visited++) {
        const building = buildings[(start + visited) % count];
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
      this.cursor = (start + visited) % count; // nästa gång fortsätter planeringen där den slutade
    },

    flushSurplusToStorage() { // överskott i utbuffert -> närmaste lager (om det finns plats)
      const buildings = World.buildings, count = buildings.length;
      for (let i = 0; i < count; i++) {
        const building = buildings[(this.cursor + i) % count];
        if (building.definition.isStorage || building.buildProgress < 1) continue;
        for (const resourceId in building.outputStock) {
          const unreserved = building.outputStock[resourceId] - (building.outputReserved[resourceId] || 0);
          if (unreserved <= Config.settings.flushThreshold || Economy.isFull(resourceId)) continue;
          if (this.tasks.length >= Config.settings.logistics.maxTasks) return;
          this.createTask(building, Economy.nearestStorage(building), resourceId);
        }
      }
    },

    // Äldsta uppdraget först, och det får närmaste lediga bärare. Långväga uppdrag blir därför aldrig bortglömda.
    assignTasksToCarriers() {
      if (!this.tasks.length) return;
      const idle = World.units.filter(unit => unit.definition.isHauler && !unit.stepQueue.length && !unit.carriedResource && !unit.deliveryTask);
      let assigned = 0;
      for (const task of this.tasks) {
        if (!idle.length || assigned >= (Config.settings.logistics.maxAssignmentsPerFrame ?? 30)) break;
        let best = 0, bestDistance = 1e9;
        for (let i = 0; i < idle.length; i++) {
          const distance = Utils.manhattanDistance(idle[i], task.source);
          if (distance < bestDistance) { bestDistance = distance; best = i; }
        }
        const carrier = idle[best];
        idle[best] = idle[idle.length - 1]; idle.pop();
        carrier.deliveryTask = task;
        carrier.hasPickedUp = false;
        carrier.stepQueue = [
          Jobs.walkTo(task.source.x, task.source.y),
          Jobs.run(unit => this.pickUp(unit)),
          Jobs.walkTo(task.destination.x, task.destination.y),
          Jobs.run(unit => this.dropOff(unit)),
        ];
        assigned++;
      }
      if (assigned) this.tasks.splice(0, assigned);
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
      if (destination.definition.isStorage) Economy.incoming[task.resource] = Math.max(0, (Economy.incoming[task.resource] || 0) - 1);
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
      this.releaseIncoming(task);
    },
  };

  CityBuilder.Logistics = Logistics;
})(window.CityBuilder);