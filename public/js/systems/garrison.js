/* Garnison: byggnader som tränar soldater (job.kind = 'garrison') och hyser dem tills fiender dyker upp.

   Träningen fungerar som crafting: logistiken levererar insatserna (enhetens training.inputs), de förbrukas när träningen
   startar, och när tiden gått läggs en färdig soldat till i byggnaden. Soldater som är inne syns inte i världen. De är bara
   räknare i building.garrison ({ swordsman: 2, archer: 1 }) och sparas därför automatiskt av save.js. Combat (combat.js)
   skickar ut dem när en fiende kommer inom räckvidden och de går hem igen när fienderna är borta.

   job: { kind: 'garrison', capacity, trains: ['swordsman', ...], searchRadius }
   Fält på byggnaden (alla skapas vid första användningen, se ensure):
     garrison       soldater som är inne, per typ (sparas)
     deployed       soldater som är ute i världen (lista med enheter, sparas inte: save.js räknar dem som hemma)
     trainingType   vald soldattyp (sparas)
     trainingUnit   typen som tränas just nu (sparas)
     stance         'defend' (standard: vaktar inom job.searchRadius) eller 'attack' (söker fiender inom settings.attackRadius) (sparas)
   isCrafting, craftTimeLeft och craftTotalTime återanvänds så att förloppsstapeln ritas som för vanliga craft-byggnader.
   På en soldat pekar unit.quarters på byggnaden den hör till (null = fri soldat). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Behaviors, Utils } = CityBuilder;

  const Garrison = {
    isGarrison: building => building.definition.job?.kind === 'garrison',

    // Skapar fälten första gången de behövs (en nyligen byggd eller laddad byggnad har dem inte)
    ensure(building) {
      building.garrison = building.garrison || {};
      building.deployed = building.deployed || [];
      return building;
    },

    capacity: building => building.definition.job.capacity,
    inside: building => Utils.sumValues(Garrison.ensure(building).garrison),

    // Soldater som hör till byggnaden: inne och utskickade
    count: building => Garrison.inside(building) + building.deployed.length,

    // Lediga platser. Soldaten som tränas just nu har redan en plats.
    slotsFree: building => Garrison.capacity(building) - Garrison.count(building) - (building.isCrafting ? 1 : 0),

    trains: building => building.definition.job.trains,

    // Alla en spelares soldater: inne i byggnader, utskickade och fria
    soldiersOf(player) {
      let count = World.units.filter(unit => unit.definition.isSoldier && unit.player === player).length;
      for (const building of World.buildings) if (building.player === player && building.garrison) count += Utils.sumValues(building.garrison);
      return count;
    },

    isAttacking: building => building.stance === 'attack',
    setStance(building, stance) { building.stance = stance === 'attack' ? 'attack' : 'defend'; },

    // Hur långt byggnadens soldater letar efter fiender, beroende på läge
    radius: building => Garrison.isAttacking(building)
      ? Config.settings.military.attackRadius
      : building.definition.job.searchRadius ?? Config.settings.military.searchRadius,

    // Vald soldattyp (den första om inget valts eller valet inte längre gäller)
    trainingType(building) {
      const types = this.trains(building);
      return types.includes(building.trainingType) ? building.trainingType : types[0];
    },

    setTrainingType(building, kind) {
      if (this.trains(building).includes(kind)) building.trainingType = kind;
    },

    addSoldier(building, kind) {
      const garrison = this.ensure(building).garrison;
      garrison[kind] = (garrison[kind] || 0) + 1;
    },

    // Knyter en utskickad eller fri soldat till byggnaden. Platsen räknas som upptagen medan soldaten är ute.
    assign(unit, building) {
      this.release(unit);
      unit.quarters = building;
      this.ensure(building).deployed.push(unit);
    },

    // Soldaten hör inte längre till någon byggnad (dog, byggnaden revs, eller soldaten gick in)
    release(unit) {
      const building = unit.quarters;
      unit.quarters = null;
      if (!building || !building.deployed) return;
      const index = building.deployed.indexOf(unit);
      if (index >= 0) building.deployed.splice(index, 1);
    },

    // Skickar ut alla soldater som är inne mot en fiende
    deploy(building, target) {
      this.ensure(building);
      for (const [kind, count] of Object.entries(building.garrison)) {
        for (let i = 0; i < count; i++) {
          const unit = CityBuilder.Combat.spawnSoldier(kind, building.x, building.y, building.player);
          unit.target = target;
          this.assign(unit, building);
        }
        delete building.garrison[kind];
      }
    },

    // En utskickad soldat är hemma igen: tas bort ur världen och räknas som inne (hel och återställd)
    enter(unit) {
      const building = unit.quarters;
      if (!building || building.removed) return false;
      this.release(unit);
      this.addSoldier(building, unit.kind);
      Behaviors.removeUnit(unit);
    },

    // Närmaste egna garnison med ledig plats för soldattypen (eller null)
    findHome(unit) {
      let best = null, bestDistance = Infinity;
      for (const building of World.buildings) {
        if (building.buildProgress < 1 || building.player !== unit.player || !this.isGarrison(building)) continue;
        if (!this.trains(building).includes(unit.kind) || this.slotsFree(building) <= 0) continue;
        const distance = Utils.manhattanDistance(building, unit);
        if (distance < bestDistance) { bestDistance = distance; best = building; }
      }
      return best;
    },

    // Byggnaden rivs: soldaterna blir fria och söker sig till en annan garnison, eller vaktar där de står
    onDemolished(building) {
      this.ensure(building);
      for (const unit of [...building.deployed]) this.release(unit);
      for (const [kind, count] of Object.entries(building.garrison)) {
        for (let i = 0; i < count; i++) CityBuilder.Combat.spawnSoldier(kind, building.x, building.y, building.player);
      }
      building.garrison = {};
    },
  };

  // Byggnadens beteende: träna soldater. Lagerplatsen för insatser följer den valda soldattypen.
  Behaviors.register('garrison', {
    onDemolished: building => Garrison.onDemolished(building),

    // Samma buffert som craft, men bara för vald soldattyp och inte alls när byggnaden är full
    inputCapacities(building) {
      if (Garrison.slotsFree(building) <= 0) return {};
      const { inputs } = Config.units[Garrison.trainingType(building)].training;
      return Object.fromEntries(Object.entries(inputs).map(([resourceId, amount]) => [resourceId, Behaviors.inputBuffer(amount)]));
    },

    update(building, deltaSeconds) {
      Garrison.ensure(building);

      if (building.paused) {
        building.status = 'Paused';
        return;
      }

      if (!building.isCrafting) {
        if (Garrison.slotsFree(building) <= 0) {
          building.status = building.deployed.length ? 'Defending' : 'Garrison full';
          return;
        }

        const kind = Garrison.trainingType(building);
        const { inputs, seconds } = Config.units[kind].training;
        const missing = Object.entries(inputs)
          .filter(([resourceId, amount]) => (building.inputStock[resourceId] || 0) < amount)
          .map(([resourceId, amount]) => `${Config.resources[resourceId].name} (${amount - (building.inputStock[resourceId] || 0)})`);

        if (missing.length) {
          building.status = `Missing: ${missing.join(', ')}`;
          return;
        }

        for (const resourceId in inputs) { building.inputStock[resourceId] -= inputs[resourceId]; Behaviors.note(building, 'use', resourceId, inputs[resourceId]); }
        building.isCrafting = true;
        building.trainingUnit = kind;
        // Talisman (boost) och monumentets aura gör träningen snabbare
        const boost = Behaviors.boostOf(building), boosted = Behaviors.useBoost(building);
        const speed = 1 + (boosted ? boost.speed || 0 : 0) + Behaviors.auraBonus(building, 'training');
        building.craftTotalTime = building.craftTimeLeft = seconds / speed;
      }

      building.status = 'Training';

      if ((building.craftTimeLeft -= deltaSeconds) <= 0) {
        building.isCrafting = false;
        if (Config.units[building.trainingUnit]?.isSoldier) Garrison.addSoldier(building, building.trainingUnit);
        building.trainingUnit = null;
      }
    },
  });

  CityBuilder.Garrison = Garrison;
})(window.CityBuilder);
