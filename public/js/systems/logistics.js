/* Logistik: direktleverans mellan hus via bärare, lager som buffert. Varje spelare har sina egna hus, lager och bärare:
   uppdrag skapas bara mellan en spelares egna byggnader och utförs av hens egna bärare.
   Ett uppdrag (task) = { source, destination, resource }: hämta en enhet från source och lämna i destination. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Utils, Jobs, Economy, Behaviors, Players } = CityBuilder;

  // Standardvärden: saknas en inställning i cfg() används dessa (planeringen stannar annars helt)
  const cfg = () => Object.assign({ planningIntervalSeconds: 1, maxTasks: 60, requestsPerBuilding: 2, requestsPerSite: 4, baseCarriers: 5, elastic: { share: 0.5, after: 4, grow: 1, shrink: 8 }, pileShare: 0.5, pileRecent: 10, carriersPerBuilding: 1, carriersPerStorage: 5, maxAssignmentsPerFrame: 30, maxWaitSeconds: 40, unreachableSeconds: 30 }, Config.settings.logistics);

  const Logistics = {
    tasks: [],              // äldsta först
    planningTimer: 0,
    cursor: 0,              // var nästa planering börjar i byggnadslistan (så att inga byggnader alltid kommer sist)
    pileLoad: {},           // spelare -> antal uppdrag från högar (räknas separat från load)
    load: {},               // spelare -> antal väntande uppdrag (maxTasks gäller per spelare)
    lost: {},               // spelare -> tider då dödade bärare ersätts (en i taget, carrierRespawnSeconds emellan)
    ordinary: {},           // spelare -> ordinarie antal bärare (utan extrabärare), för visningen
    elastic: {},            // spelare -> { extra: antal tillfälliga extrabärare, next: tidigast nästa ändring } (se elastic i inställningarna)
    busyAt: {},             // spelare -> senaste tid då annat arbete än högar väntade
               // spelare -> tider då dödade bärare ersätts (en i taget, carrierRespawnSeconds emellan)
    unreachable: new Map(), // "källa>mål" -> tid då paret får provas igen (efter att en bärare inte hittade någon väg)

    // Tar bäraren emot varor som lager? (En lagerbyggnad som ännu byggs är en byggplats som tar emot byggmaterial.)
    stores: building => building.definition.isStorage && !building.needsMaterials,

    pairKey: (source, destination) => source.id + '>' + destination.id,
    isUnreachable(source, destination) { return (this.unreachable.get(this.pairKey(source, destination)) ?? 0) > (this.time || 0); },

    // Närmaste källa (hus eller lager) med ledigt innehåll av resursen
    findSupplier(resourceId, nearBuilding) {
      let best = null, bestDistance = 1e9;
      for (const candidate of World.buildings) {
        if (candidate === nearBuilding || candidate.buildProgress < 1 || candidate.player !== nearBuilding.player || this.isUnreachable(candidate, nearBuilding)) continue;
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

    // Bästa källa bland alternativa varor: den det finns mest av i lagret, därefter närmast
    findAlternativeSupplier(resourceIds, nearBuilding) {
      let best = null;
      for (const resourceId of resourceIds) {
        const source = this.findSupplier(resourceId, nearBuilding);
        if (!source) continue;
        const stock = Economy.stats(nearBuilding.player).stored[resourceId] || 0, distance = Utils.manhattanDistance(source, nearBuilding);
        if (!best || stock > best.stock || (stock === best.stock && distance < best.distance)) best = { source, resource: resourceId, stock, distance };
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
      if (!this.stores(destination)) destination.incomingCount[resourceId] = (destination.incomingCount[resourceId] || 0) + 1;
      else this.addIncoming(destination, resourceId, 1);
      this.countTask(source);
      this.tasks.push({ source, destination, resource: resourceId, seq: this.seq = (this.seq || 0) + 1, created: this.time || 0 });
    },

    // Uppdrag från högar räknas för sig, så att en tornados högar inte fyller kön och hindrar produktionens egna beställningar
    countTask(source, amount = 1) {
      const counter = source.definition.pile ? this.pileLoad : this.load;
      counter[source.player] = (counter[source.player] || 0) + amount;
    },
    full(player) { return (this.load[player] || 0) >= cfg().maxTasks; },
    pileFull(player) { return (this.pileLoad[player] || 0) >= cfg().maxTasks; },

    // "På väg"-räkningen för lagren (per spelare)
    addIncoming(storage, resourceId, amount) {
      const incoming = Economy.stats(storage.player).incoming;
      incoming[resourceId] = Math.max(0, (incoming[resourceId] || 0) + amount);
    },

    update(deltaSeconds) {
      if ((this.planningTimer -= deltaSeconds) <= 0) {
        this.planningTimer = cfg().planningIntervalSeconds;
        Economy.updateStats();
        this.clearPiles();
        this.balanceCarriers(); this.purgeInvalidTasks(); this.rebuildCounters(); this.requestMissingInputs(); this.orders = null; this.flushSurplusToStorage(); this.orders = null;
      }
      this.time = (this.time || 0) + deltaSeconds;
      this.assignTasksToCarriers();
    },

    // Tomma högar (det som blev kvar efter en rivning) försvinner när bärarna hämtat allt
    clearPiles() {
      for (const building of World.buildings) if (building.definition.pile && !Utils.sumValues(building.outputStock)) World.removeBuilding(building);
    },

    // Räknar om alla reservationer och "på väg"-tal från de verkliga uppdragen, så att inget läckage kan blockera lager.
    rebuildCounters() {
      const zero = obj => { if (obj) for (const key in obj) obj[key] = 0; };
      for (const player in Economy.playerStats) Economy.playerStats[player].incoming = {};
      this.load = {}; this.pileLoad = {};
      for (const building of World.buildings) { zero(building.outputReserved); zero(building.storedReserved); zero(building.incomingCount); }
      const count = (task, picked) => {
        if (!picked && !task.source.removed) this.reservationsOf(task.source)[task.resource] = (this.reservationsOf(task.source)[task.resource] || 0) + 1;
        const destination = task.destination;
        if (destination.removed) return;
        if (this.stores(destination)) this.addIncoming(destination, task.resource, 1);
        else destination.incomingCount[task.resource] = (destination.incomingCount[task.resource] || 0) + 1;
      };
      for (const task of this.tasks) { count(task, false); this.countTask(task.source); }
      for (const unit of World.units) if (unit.deliveryTask) count(unit.deliveryTask, unit.hasPickedUp);
    },

    purgeInvalidTasks() { // släng uppdrag vars källa eller mål rivits
      for (const [key, until] of this.unreachable) if (until <= (this.time || 0)) this.unreachable.delete(key);
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
      if (this.stores(destination)) this.addIncoming(destination, task.resource, -1);
      else if (!destination.removed) destination.incomingCount[task.resource]--;
    },

    // En dödad bärare ersätts först när det är dess tur i kön, så att en bas under angrepp inte fylls på lika fort som den töms
    carrierLost(unit) {
      const queue = this.lost[unit.player] = this.lost[unit.player] || [];
      queue.push(Math.max(this.time || 0, queue[queue.length - 1] ?? 0) + Config.settings.military.carrierRespawnSeconds);
    },

    // Extrabärare för en spelare: växer när uppdrag blir stående (utom högar) och krymper långsamt när allt är hämtat
    elasticExtra(player, ordinary) {
      const { share, after, grow, shrink } = cfg().elastic, now = this.time || 0;
      const state = this.elastic[player] = this.elastic[player] || { extra: 0, next: 0 };
      const stalled = this.tasks.filter(task => task.source.player === player && !task.source.definition.pile && now - task.created > after).length;
      const cap = Math.ceil(ordinary * share);
      if (stalled > 0) {
        if (now >= state.next && state.extra < cap) { state.extra = Math.min(cap, state.extra + Math.ceil(stalled / 4)); state.next = now + grow; }
      } else if (state.extra > 0 && now >= state.next) { state.extra--; state.next = now + shrink; }
      return Math.min(state.extra, cap);
    },

    // Antalet bärare följer byggnaderna: bas + 1 per färdig byggnad + 5, 10 respektive 25 per färdigt lager, lagerhus och depå (definition.carriers, per spelare). Rivs eller förstörs något
    // minskar antalet igen: överskott tas bort när bärarna är lediga.
    balanceCarriers() {
      const { baseCarriers, carriersPerBuilding, carriersPerStorage } = cfg();
      for (const player of Players.active) {
        const hq = World.hqOf(player);
        if (!hq) continue;
        let wanted = 0;
        for (const building of World.buildings) {
          if (building.player !== player || building.buildProgress < 1 || building === hq) continue;
          wanted += building.definition.carriers ?? (building.definition.isStorage ? carriersPerStorage : carriersPerBuilding);
        }
        const waiting = (this.lost[player] = (this.lost[player] || []).filter(time => time > (this.time || 0))).length; // dödade, ännu inte ersatta
        const ordinary = this.ordinary[player] = Math.max(0, baseCarriers + wanted - waiting);
        const target = ordinary + this.elasticExtra(player, ordinary);

        const carriers = World.units.filter(unit => unit.definition.isHauler && unit.player === player);
        for (let count = carriers.length; count < target; count++) World.spawnUnit('carrier', hq.x, hq.y, null, player);
        for (let i = carriers.length - 1, surplus = carriers.length - target; i >= 0 && surplus > 0; i--) {
          const unit = carriers[i];
          if (unit.stepQueue.length || unit.carriedResource || unit.deliveryTask) continue;
          Behaviors.removeUnit(unit);
          surplus--;
        }
      }
    },

    // Byggnaderna i tur och ordning från 'start' (så att ingen alltid kommer sist), men prioriterade byggnader först
    visitOrder(start) {
      const buildings = World.buildings, count = buildings.length, rotated = Array.from({ length: count }, (_, i) => buildings[(start + i) % count]);
      return [...rotated.filter(building => building.prioritized), ...rotated];
    },

    requestMissingInputs() { // hus som behöver indata beställer från närmaste källa
      const { requestsPerBuilding } = cfg();
      const count = World.buildings.length;
      if (!count) return;
      const start = this.cursor % count, order = this.visitOrder(start), first = order.length - count;
      let visited = 0;
      for (; visited < order.length; visited++) {
        const building = order[visited];
        if (this.full(building.player)) continue;
        if (building.buildProgress < 1) { if (building.needsMaterials) this.requestSiteMaterials(building); continue; }
        if (!building.definition.job) continue;
        for (const [resourceId, capacity] of Object.entries(Behaviors.requiredResources(building))) {
          const missing = capacity - (building.inputStock[resourceId] || 0) - (building.incomingCount[resourceId] || 0);
          for (let requested = 0; requested < Math.min(requestsPerBuilding, missing) && !this.full(building.player); requested++) {
            const supplier = this.findSupplier(resourceId, building);
            if (!supplier || this.waitForProducer(building, resourceId, supplier, (building.inputStock[resourceId] || 0) + (building.incomingCount[resourceId] || 0))) break;
            this.createTask(supplier, building, resourceId);
          }
        }
        for (const group of Behaviors.eatGroups(building)) {
          const incoming = group.any.reduce((sum, id) => sum + (building.incomingCount[id] || 0), 0);
          const missing = (group.capacity || 2) - Behaviors.eatStock(building, group) - incoming;
          for (let requested = 0; requested < Math.min(requestsPerBuilding, missing) && !this.full(building.player); requested++) {
            const pick = this.findAlternativeSupplier(group.any, building);
            if (!pick || this.waitForProducer(building, pick.resource, pick.source, Behaviors.eatStock(building, group) + incoming)) break;
            this.createTask(pick.source, building, pick.resource);
          }
        }
      }
      this.cursor = (start + Math.max(0, visited - first)) % count;

    },

    // Byggplatsen beställer det den saknas av byggkostnaden, från närmaste källa med varan (lager eller producents utbuffert)
    requestSiteMaterials(site) {
      const { requestsPerSite } = cfg();
      for (const [resourceId, amount] of Object.entries(site.definition.buildCost)) {
        const missing = amount - (site.inputStock[resourceId] || 0) - (site.incomingCount[resourceId] || 0);
        for (let requested = 0; requested < Math.min(requestsPerSite, missing) && !this.full(site.player); requested++) {
          const supplier = this.findSupplier(resourceId, site);
          if (!supplier) break;
          this.createTask(supplier, site, resourceId);
        }
      }
    },

    // Överskott i utbuffert -> närmaste lager (om det finns plats). Rutan töms också när bufferten börjar bli full,
    // även om ingen enskild vara nått tröskeln (annars fastnar hus med flera utdata på "Fullt lager").
    flushSurplusToStorage() {
      const bufferLimit = Config.settings.outputBufferCapacity || 10, threshold = Config.settings.flushThreshold ?? 0;
      const count = World.buildings.length;
      for (const building of this.visitOrder(this.cursor % Math.max(1, count))) {
        if (building.definition.isStorage || building.buildProgress < 1) continue;
        const job = building.definition.job, produced = job && job.outputs ? Utils.sumValues(job.outputs) : 1, sum = Utils.sumValues(building.outputStock);
        const pressure = sum >= bufferLimit * 0.5 || sum + produced > bufferLimit; // halvfull, eller kan inte producera mer = töm allt
        for (const resourceId in building.outputStock) {
          const surplus = building.outputStock[resourceId] - (building.outputReserved[resourceId] || 0) - (pressure ? 0 : threshold);
          for (let n = 0; n < surplus; n++) {
            if (building.definition.pile ? this.pileFull(building.player) : this.full(building.player)) break;
            if (this.deliverDirect(building, resourceId)) continue;
            if (Economy.isFull(resourceId, building.player) && !building.definition.pile) break;   // högar töms även över lagertaket, så inget blir kvar
            const storage = Economy.nearestStorage(building);
            if (!storage || this.isUnreachable(building, storage)) break; // spelare utan lager (t.ex. slagen rival): inget att leverera till
            this.createTask(building, storage, resourceId);
          }
        }
      }
    },

    // Har huset redan något av varan, och en producent av den ligger närmare än lagret? Då väntar huset på producentens nästa leverans
    // (deliverDirect) i stället för att hämta ur lagret. Är huset helt tomt hämtar det ur lagret, så att det aldrig står still i onödan.
    waitForProducer(building, resourceId, supplier, have) {
      if (!have || !supplier.definition.isStorage) return false;
      const reach = Utils.manhattanDistance(supplier, building);
      return World.buildings.some(producer => {
        const job = producer.definition.job;
        return producer !== building && producer.player === building.player && producer.buildProgress >= 1 && job
          && (job.outputs ? resourceId in job.outputs : job.outputResource === resourceId)
          && Utils.manhattanDistance(producer, building) < reach && !this.isUnreachable(producer, building);
      });
    },

    // Hur många av resursen huset fortfarande saknar (behov minus lager minus på väg)
    shortage(building, resourceId) {
      const need = Behaviors.requiredResources(building)[resourceId];
      if (need !== undefined) return need - (building.inputStock[resourceId] || 0) - (building.incomingCount[resourceId] || 0);
      for (const group of Behaviors.eatGroups(building)) {
        if (!group.any.includes(resourceId)) continue;
        const incoming = group.any.reduce((sum, id) => sum + (building.incomingCount[id] || 0), 0);
        return (group.capacity || 2) - Behaviors.eatStock(building, group) - incoming;
      }
      return 0;
    },

    // Beställningar från lager som ingen bärare hämtat ännu, per mål och resurs. De kan bytas mot en leverans direkt från en producent.
    cancellableOrders() {
      const orders = new Map();
      const add = (task, carrier) => {
        if (this.stores(task.destination) || !task.source.definition.isStorage) return;
        const key = task.destination.id + ':' + task.resource;
        if (!orders.has(key)) orders.set(key, []);
        orders.get(key).push({ task, carrier });
      };
      for (const task of this.tasks) add(task, null);
      for (const unit of World.units) if (unit.deliveryTask && !unit.hasPickedUp) add(unit.deliveryTask, unit);
      return orders;
    },

    // Överskott från en producent går helst direkt till närmaste hus som vill ha varan, utan omväg via lagret.
    // Ett hus som redan väntar på leverans från ett lager får den i stället från producenten om den ligger närmare (lagerbeställningen avbryts).
    deliverDirect(producer, resourceId) {
      this.orders = this.orders || this.cancellableOrders();
      let best = null, bestDistance = 1e9, bestOrder = null;
      for (const consumer of World.buildings) {
        if (consumer === producer || consumer.buildProgress < 1 || !consumer.definition.job || consumer.definition.isStorage
          || consumer.player !== producer.player || this.isUnreachable(producer, consumer)) continue;
        const distance = Utils.manhattanDistance(producer, consumer);
        if (distance >= bestDistance) continue;
        let order = null;
        if (this.shortage(consumer, resourceId) <= 0) {
          order = (this.orders.get(consumer.id + ':' + resourceId) || []).find(entry => distance < Utils.manhattanDistance(entry.task.source, consumer));
          if (!order) continue;
        }
        best = consumer; bestDistance = distance; bestOrder = order;
      }
      if (!best) return false;
      if (bestOrder) {
        const { task, carrier } = bestOrder;
        this.orders.get(best.id + ':' + resourceId).splice(this.orders.get(best.id + ':' + resourceId).indexOf(bestOrder), 1);
        if (carrier) { this.abortTask(carrier); carrier.stepQueue.length = 0; }
        else {
          this.tasks.splice(this.tasks.indexOf(task), 1);
          this.releaseReservation(task.source, task.resource); this.releaseIncoming(task);
          this.load[task.source.player]--;
        }
      }
      this.createTask(producer, best, resourceId);
      return true;
    },

    // Äldsta uppdraget först, och det får närmaste lediga bärare. Långväga uppdrag blir därför aldrig bortglömda.
    assignTasksToCarriers() {
      if (!this.tasks.length) return;
      const idle = World.units.filter(unit => unit.definition.isHauler && !unit.stepQueue.length && !unit.carriedResource && !unit.deliveryTask);
      const bufferLimit = Config.settings.outputBufferCapacity || 10;
      // 1) stoppade byggnader (full källa, indata saknas) och uppdrag som väntat länge, äldst först
      // 2) övriga: minst i lager först, sedan äldst
      const maxWait = cfg().maxWaitSeconds ?? 40, now = this.time || 0;
      const stock = task => {
        const { stored, incoming } = Economy.stats(task.source.player);
        return (stored[task.resource] || 0) + (incoming[task.resource] || 0);
      };
      const urgent = task => {
        if (now - task.created > maxWait) return 0;
        const { source, destination } = task;
        if (!source.definition.isStorage && Utils.sumValues(source.outputStock) >= bufferLimit) return 0;
        if (!this.stores(destination) && !destination.inputStock[task.resource]) return 0;
        return 1;
      };
      const pile = task => task.source.definition.pile ? 1 : 0;   // högar sist: allt annat arbete går före
      const priority = task => (task.destination.prioritized || task.source.prioritized ? 0 : 1);   // prioriterade byggnaders leveranser går först av allt
      this.tasks.sort((a, b) => {
        const ua = urgent(a), ub = urgent(b);
        return priority(a) - priority(b) || pile(a) - pile(b) || ua - ub || (ua ? stock(a) - stock(b) : 0) || a.seq - b.seq;
      });
      // Högar får högst pileShare av en spelares bärare så länge annat arbete väntar eller nyss väntade, så att en tornado inte tömmer produktionen på bärare
      const { pileShare, pileRecent } = cfg(), pileBusy = {}, totals = {};
      for (const unit of World.units) if (unit.definition.isHauler) {
        totals[unit.player] = (totals[unit.player] || 0) + 1;
        if (unit.deliveryTask?.source.definition.pile) pileBusy[unit.player] = (pileBusy[unit.player] || 0) + 1;
      }
      for (const task of this.tasks) if (!pile(task)) this.busyAt[task.source.player] = now;
      const assigned = new Set();
      let spare = idle.length;
      for (const task of this.tasks) {
        if (!spare || assigned.size >= (cfg().maxAssignmentsPerFrame ?? 30)) break;
        const player = task.source.player;
        if (pile(task) && now - (this.busyAt[player] ?? -1e9) < pileRecent && (pileBusy[player] || 0) >= Math.max(1, Math.floor((totals[player] || 0) * pileShare))) continue;
        const carriers = idle.filter(unit => unit.player === player); // bara spelarens egna bärare
        if (!carriers.length) continue;
        let carrier = carriers[0], bestDistance = 1e9;
        for (const candidate of carriers) {
          const distance = Utils.manhattanDistance(candidate, task.source);
          if (distance < bestDistance) { bestDistance = distance; carrier = candidate; }
        }
        idle.splice(idle.indexOf(carrier), 1);
        spare--;
        if (pile(task)) pileBusy[player] = (pileBusy[player] || 0) + 1;
        carrier.deliveryTask = task;
        carrier.hasPickedUp = false;
        carrier.stepQueue = [
          Jobs.walkTo(task.source.x, task.source.y),
          Jobs.run(unit => this.pickUp(unit)),
          Jobs.walkTo(task.destination.x, task.destination.y),
          Jobs.run(unit => this.dropOff(unit)),
        ];
        assigned.add(task);
      }
      if (assigned.size) this.tasks = this.tasks.filter(task => !assigned.has(task));
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
      if (this.stores(destination)) this.addIncoming(destination, task.resource, -1);
      if (destination.removed) Economy.addToNearestStorage(task.resource, 1, carrier);
      else if (this.stores(destination)) destination.storedGoods[task.resource] = (destination.storedGoods[task.resource] || 0) + 1;
      else {
        destination.inputStock[task.resource] = (destination.inputStock[task.resource] || 0) + 1;
        destination.incomingCount[task.resource]--;
        if (destination.needsMaterials) Economy.record(destination.player, 'use', task.resource, 'construction');
      }
      carrier.carriedResource = null; carrier.deliveryTask = null; carrier.hasPickedUp = false;
    },

    // Bäraren hittade ingen väg. Paret källa-mål provas inte om på en stund (annars pendlar bärare i evighet).
    // Bär den redan varan lämnar den den i ett lager närmare målet om det finns ett (nästa leverans går då därifrån),
    // annars läggs uppdraget ner och bäraren gör något annat.
    failTask(carrier) {
      const task = carrier.deliveryTask;
      if (!task) return;
      this.unreachable.set(this.pairKey(task.source, task.destination), (this.time || 0) + cfg().unreachableSeconds);
      const relay = carrier.hasPickedUp && !this.stores(task.destination) ? this.findRelay(task) : null;
      if (!relay) return this.abortTask(carrier);

      this.releaseIncoming(task);
      this.addIncoming(relay, task.resource, 1);
      carrier.deliveryTask = { source: task.source, destination: relay, resource: task.resource, seq: ++this.seq, created: this.time || 0 };
      carrier.stepQueue = [Jobs.walkTo(relay.x, relay.y), Jobs.run(unit => this.dropOff(unit))];
    },

    // Egna färdiga lager som ligger närmare målet än källan och som går att nå från källan. Det närmast målet vinner.
    findRelay({ source, destination }) {
      let best = null, bestDistance = Utils.manhattanDistance(source, destination);
      for (const storage of Economy.storages(source.player)) {
        const distance = Utils.manhattanDistance(storage, destination);
        if (storage === source || distance >= bestDistance || this.isUnreachable(source, storage)) continue;
        best = storage; bestDistance = distance;
      }
      return best;
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