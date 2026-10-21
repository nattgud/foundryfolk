/* Strid: fiender hittas, soldater anfaller dem, och enheter dör när livet tar slut.

   - Players.isHostile(a, b) (core/players.js) avgör vem som är fiende. Neutrala enheter (hjortar) berörs aldrig.
   - Garnisonsbyggnader (garrison.js) letar efter fiender inom sin räckvidd. Hittas en skickas alla soldater därinne ut.
   - Soldater (definition.isSoldier) väljer själva mål, går fram och slår eller skjuter. Finns inga fiender kvar går de hem
     och stiger in i byggnaden igen. Fria soldater (utan byggnad) vaktar sin post och söker sig till en ledig garnison.
   - Alla enheter och byggnader med hp kan skadas. Fiendens soldater går först, sedan övriga enheter och sist byggnader.
     Dör en bärare ersätts den av Logistics.balanceCarriers, en arbetare av sin byggnad (efter workerRespawnSeconds).
     En förstörd byggnad lämnar inget tillbaka. Spelarens eget HQ går inte att angripa än.
   - Garnisonsbyggnadens läge (building.stance): 'defend' vaktar inom job.searchRadius, 'attack' söker upp fiender inom
     settings.attackRadius och jagar dem dit.

   En soldat har dessa fält utöver vanliga enhetsfält (alla sätts i spawnSoldier):
     quarters   byggnaden den hör till (null = fri soldat)    post     fri soldats vaktplats { x, y }
     target     enheten den anfaller                          mode     vad stegkön är till för: 'idle' | 'chase' | 'return'
   Soldater styrs via stegkön (Jobs) som övriga enheter, så Units.update gör själva förflyttningen. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Jobs, Behaviors, Players, Garrison } = CityBuilder;

  const settings = () => Config.settings.military;
  const TIMERS = ['attackCooldownLeft', 'scanTimer', 'repathTimer', 'orderCooldown', 'homeSearchTimer'];
  const HOME_SEARCH_SECONDS = 2;      // hur ofta en fri soldat letar efter en ledig garnison
  const POST_TOLERANCE = 1.5;         // så nära posten räknas en fri soldat som på plats
  const BUILDING_REACH = 0.6;         // en byggnad är en hel ruta: räckhållet räknas från kanten, inte mitten

  // Mål är enheter (x, y = mitten) eller byggnader (x, y = rutan). Mittpunkt och prioritet (lägre = angrips först):
  const isBuilding = target => target.buildProgress !== undefined;
  const centreX = target => target.x + (isBuilding(target) ? .5 : 0);
  const centreY = target => target.y + (isBuilding(target) ? .5 : 0);
  const priority = target => isBuilding(target) ? 2 : target.definition.isSoldier ? 0 : 1;

  const Combat = {
    effects: [],                      // korta attackstreck för renderingen: { x1, y1, x2, y2, ranged, life }
    time: 0,                          // simuleringstid i sekunder
    targetCache: null,                // kandidater för den här simuleringsrutan (se targets)
    alertTimers: new WeakMap(),       // byggnad -> sekunder till nästa sökning

    // ---- Sökning -------------------------------------------------------------------------------

    // Enheter och byggnader som kan bli mål: levande och tillhör någon riktig spelare. En lista per simuleringsruta.
    targets() {
      return this.targetCache || (this.targetCache = [...World.units, ...World.buildings].filter(target =>
        target.hp != null && target.player !== Players.NEUTRAL && target.type !== 'hq')); // baserna kan inte angripas än
    },

    // Bästa fiende till 'player' inom radius från (x, y): lägst prioritet först, sedan närmast.
    findEnemy(player, x, y, radius, ignore) {
      let best = null, bestPriority = Infinity, bestDistance = Infinity;
      for (const target of this.targets()) {
        if (target.removed || target === ignore || !Players.isHostile(player, target.player)) continue;
        const distance = Math.hypot(centreX(target) - x, centreY(target) - y);
        if (distance > radius) continue;
        const rank = priority(target);
        if (rank > bestPriority || (rank === bestPriority && distance >= bestDistance)) continue;
        best = target; bestPriority = rank; bestDistance = distance;
      }
      return best;
    },

    // ---- Skada ---------------------------------------------------------------------------------

    attack(attacker, target) {
      const definition = attacker.definition;
      attacker.attackCooldownLeft = definition.attackCooldown;
      this.effects.push({ x1: attacker.x, y1: attacker.y, x2: centreX(target), y2: centreY(target), ranged: definition.attackRange > 2, life: 0.18 });
      this.damage(target, Math.max(1, definition.attackDamage - (target.definition.armor || 0)));
    },

    damage(target, amount) {
      if (target.hp == null || target.removed) return;
      target.hp -= amount;
      if (target.hp <= 0) this.kill(target);
    },

    kill(target) {
      if (target.removed) return;
      if (isBuilding(target)) return this.destroyBuilding(target);
      const unit = target;
      CityBuilder.Logistics.abortTask(unit); // en bärare som dör släpper sina reservationer
      Garrison.release(unit);
      Behaviors.removeUnit(unit);
    },

    // En förstörd byggnad är som en riven, men inget lämnas tillbaka (innehållet går förlorat)
    destroyBuilding(building) {
      CityBuilder.Behaviors.forBuilding(building)?.onDemolished?.(building);
      World.removeBuilding(building);
      const game = CityBuilder.Game;
      if (game?.selectedBuilding === building) game.selectBuilding(null);
    },

    // ---- Skapa soldater ------------------------------------------------------------------------

    // Alla soldater skapas här så att stridsfälten alltid finns
    spawnSoldier(kind, x, y, player) {
      const unit = World.spawnUnit(kind, x, y, null, player);
      return Object.assign(unit, {
        quarters: null,
        post: null,
        target: null,
        mode: 'idle',
        goal: null,                  // dit en soldat i läget 'return' är på väg (byggnad eller post)
        attackCooldownLeft: 0,
        scanTimer: Math.random() * settings().scanIntervalSeconds, // sprider ut sökningarna över tid
        repathTimer: 0,
        orderCooldown: 0,
        homeSearchTimer: 0,
        ignore: null,                // mål som inte gick att nå, och
        ignoreUntil: 0,              // till när det ignoreras
        chaseX: null,
        chaseY: null,
      });
    },

    // Utvecklarhjälp för att prova striden. Sätter ut fiendesoldater på rutan (x, y), t.ex. i webbläsarkonsolen:
    //   CityBuilder.Combat.spawnEnemy('swordsman', 12, 5, 3)
    spawnEnemy(kind, x, y, count = 1) {
      const spawned = [];
      for (let i = 0; i < count; i++) spawned.push(this.spawnSoldier(kind, x + (i % 3), y + Math.floor(i / 3), Players.ENEMY));
      return spawned;
    },

    // ---- Simulering ----------------------------------------------------------------------------

    update(deltaSeconds) {
      this.time += deltaSeconds;
      this.targetCache = null;
      this.alertGarrisons(deltaSeconds);

      for (const unit of [...World.units]) { // kopia: enheter kan dö eller försvinna under varvet
        if (unit.definition.isSoldier && !unit.removed) this.updateSoldier(unit, deltaSeconds);
      }

      for (const effect of this.effects) effect.life -= deltaSeconds;
      this.effects = this.effects.filter(effect => effect.life > 0);
    },

    // Garnisoner med soldater hemma letar efter fiender och skickar ut dem
    alertGarrisons(deltaSeconds) {
      for (const building of World.buildings) {
        if (building.buildProgress < 1 || !Garrison.isGarrison(building) || !Garrison.inside(building)) continue;

        const left = (this.alertTimers.get(building) ?? 0) - deltaSeconds;
        if (left > 0) { this.alertTimers.set(building, left); continue; }
        this.alertTimers.set(building, settings().scanIntervalSeconds);

        const enemy = this.findEnemy(building.player, building.x + .5, building.y + .5, Garrison.radius(building));
        if (enemy) Garrison.deploy(building, enemy);
      }
    },

    updateSoldier(unit, deltaSeconds) {
      for (const timer of TIMERS) unit[timer] = Math.max(0, unit[timer] - deltaSeconds);

      const anchor = this.anchorOf(unit);
      if (unit.target && !this.isValidTarget(unit, anchor)) unit.target = null;

      if (!unit.target && unit.scanTimer <= 0) {
        unit.scanTimer = settings().scanIntervalSeconds;
        const ignored = unit.ignoreUntil > this.time ? unit.ignore : null;
        unit.target = this.findEnemy(unit.player, anchor.x, anchor.y, anchor.radius, ignored);
      }

      if (unit.target) { this.engage(unit); return; }

      if (unit.mode === 'chase') { unit.stepQueue.length = 0; unit.mode = 'idle'; } // målet försvann: sluta jaga
      this.standDown(unit);
    },

    // Platsen soldaten vaktar och hur långt därifrån den upptäcker fiender: sin byggnad, annars sin post
    anchorOf(unit) {
      const home = unit.quarters;
      if (home && !home.removed) {
        return { x: home.x + .5, y: home.y + .5, radius: Garrison.radius(home) };
      }
      if (home) Garrison.release(unit); // byggnaden finns inte längre
      unit.post = unit.post || { x: unit.x, y: unit.y };
      return { x: unit.post.x, y: unit.post.y, radius: unit.definition.searchRadius ?? settings().searchRadius };
    },

    // Målet gäller så länge det lever, fortfarande är en fiende och inte tagit sig för långt från vaktplatsen
    isValidTarget(unit, anchor) {
      const target = unit.target;
      return !target.removed && Players.isHostile(unit.player, target.player) &&
        Math.hypot(centreX(target) - anchor.x, centreY(target) - anchor.y) <= anchor.radius * settings().leashFactor;
    },

    // Slå om målet är inom räckhåll, annars gå mot det
    engage(unit) {
      const target = unit.target, definition = unit.definition;

      const reach = definition.attackRange + (isBuilding(target) ? BUILDING_REACH : 0);
      if (Math.hypot(centreX(target) - unit.x, centreY(target) - unit.y) <= reach) {
        unit.stepQueue.length = 0;
        unit.mode = 'idle';
        unit.status = 'Fighting';
        if (unit.attackCooldownLeft <= 0) this.attack(unit, target);
        return;
      }

      // Vägen räknas om bara när målet bytt ruta, och inte oftare än repathSeconds (sökningar kostar).
      // Byte från ett annat uppdrag (t.ex. på väg hem) sker direkt.
      const tileX = Math.floor(centreX(target)), tileY = Math.floor(centreY(target));
      const switching = unit.mode !== 'chase';
      const stale = !unit.stepQueue.length || tileX !== unit.chaseX || tileY !== unit.chaseY;
      if (unit.orderCooldown > 0 || (!switching && !(stale && unit.repathTimer <= 0))) return;

      unit.mode = 'chase';
      unit.chaseX = tileX;
      unit.chaseY = tileY;
      unit.repathTimer = settings().repathSeconds;
      unit.stepQueue = [Jobs.walkTo(tileX, tileY)]; // fortsätter in i målets ruta. Soldaten stannar när målet är inom räckhåll.
      unit.status = 'Attacking';
    },

    // Inga fiender: gå hem och stig in, eller tillbaka till posten
    standDown(unit) {
      const home = unit.quarters;
      if (home && !home.removed) {
        this.goTo(unit, home, () => [Jobs.walkTo(home.x, home.y), Jobs.run(() => Garrison.enter(unit))]);
        return;
      }

      // Fri soldat: ta en ledig plats i en garnison om det finns någon, annars vakta posten
      if (unit.homeSearchTimer <= 0) {
        unit.homeSearchTimer = HOME_SEARCH_SECONDS;
        const newHome = Garrison.findHome(unit);
        if (newHome) { Garrison.assign(unit, newHome); return; }
      }

      const post = unit.post;
      if (post && Math.hypot(unit.x - post.x, unit.y - post.y) > POST_TOLERANCE) {
        this.goTo(unit, post, () => [Jobs.walkTo(Math.floor(post.x), Math.floor(post.y))]);
      } else if (unit.mode === 'return') {
        unit.mode = 'idle';
      }
    },

    // Beordrar en soldat att gå till 'goal' (byggnad eller post). makeSteps anropas bara om soldaten inte redan är på väg dit.
    goTo(unit, goal, makeSteps) {
      if (unit.mode === 'return' && unit.goal === goal && unit.stepQueue.length) return;
      if (unit.orderCooldown > 0) return;
      unit.mode = 'return';
      unit.goal = goal;
      unit.stepQueue = makeSteps();
      unit.status = 'Returning';
    },

    // Anropas av Units när en soldat inte hittar någon väg: det ignorerade målet provas inte om på en stund
    onPathFailure(unit) {
      unit.orderCooldown = settings().retrySeconds;
      unit.mode = 'idle';
      unit.goal = null;
      if (unit.target) {
        unit.ignore = unit.target;
        unit.ignoreUntil = this.time + settings().retrySeconds * 2;
        unit.target = null;
      }
    },
  };

  CityBuilder.Combat = Combat;
  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.combat = { update(deltaSeconds) { Combat.update(deltaSeconds); } };
})(window.CityBuilder);
