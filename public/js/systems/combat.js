/* Strid: fiender hittas, soldater anfaller dem, och enheter dör när livet tar slut.

   - Players.isHostile(a, b) (core/players.js) avgör vem som är fiende. Neutrala enheter (djur) berörs aldrig.
   - Garnisonsbyggnader (garrison.js) letar efter fiender inom sin räckvidd. Hittas en skickas alla soldater därinne ut.
   - Soldater (definition.isSoldier) väljer själva mål, går fram och slår eller skjuter. Finns inga fiender kvar går de hem
     och stiger in i byggnaden igen. Fria soldater (utan byggnad) vaktar sin post och söker sig till en ledig garnison.
   - Alla enheter och byggnader med hp kan skadas. Fiendens soldater går först, sedan byggnader och sist övriga enheter (bärare, arbetare),
     så att en bas går att utplåna. En soldat som anfaller något sämre byter till ett bättre mål när det dyker upp.
     Dör en bärare ersätts den av Logistics.balanceCarriers (en i taget, carrierRespawnSeconds emellan), en arbetare av sin
     byggnad (efter workerRespawnSeconds).
     En förstörd byggnad lämnar inget tillbaka. Förstörs en bas är spelaren utslagen (eliminate).
   - Garnisonsbyggnadens läge (building.stance): 'defend' vaktar inom job.searchRadius, 'attack' söker upp fiender inom
     settings.attackRadius och jagar dem dit.

   En soldat har dessa fält utöver vanliga enhetsfält (alla sätts i spawnSoldier):
     quarters   byggnaden den hör till (null = fri soldat)    post     fri soldats vaktplats { x, y }
     target     enheten den anfaller                          mode     vad stegkön är till för: 'idle' | 'chase' | 'return'
   Närstridssoldater (attackRange <= MELEE_RANGE) slår först när de står i samma ruta som en enhet (en byggnad: på angränsande ruta).
   Bågskyttar skjuter en pil (Combat.projectiles) som flyger i en bråkdels sekund och gör skadan först när den träffar.
   Soldater styrs via stegkön (Jobs) som övriga enheter, så Units.update gör själva förflyttningen. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Jobs, Behaviors, Players, Garrison, Vision } = CityBuilder;

  const settings = () => Config.settings.military;
  const TIMERS = ['attackCooldownLeft', 'scanTimer', 'repathTimer', 'orderCooldown', 'homeSearchTimer'];
  const HOME_SEARCH_SECONDS = 2;      // hur ofta en fri soldat letar efter en ledig garnison
  const POST_TOLERANCE = 3;           // så nära posten räknas en fri soldat som på plats
  const SETTLE_SPEED = 1;             // hur fort en stillastående soldat glider till sin plats i rutan (rutor per sekund)
  const MELEE_RANGE = 2;              // attackRange upp till detta är närstrid, över det en projektil
  const BUILDING_REACH = 0.6;         // en byggnad är en hel ruta: räckhållet räknas från kanten, inte mitten

  // Mål är enheter (x, y = mitten) eller byggnader (x, y = rutan). Mittpunkt och prioritet (lägre = angrips först):
  const isBuilding = target => target.buildProgress !== undefined;
  const centreX = target => target.x + (isBuilding(target) ? .5 : 0);
  const centreY = target => target.y + (isBuilding(target) ? .5 : 0);
  const priority = target => target.definition.isSoldier && !isBuilding(target) ? 0 : isBuilding(target) ? 1 : 2;

  // Platsen (0..1 inom rutan) för soldat nummer index av count på samma ruta: en i mitten, få i en ring, många i ett rutnät
  const slotIn = (index, count) => {
    if (count === 1) return [.5, .5];
    if (count <= 6) { const angle = index / count * Math.PI * 2; return [.5 + .27 * Math.cos(angle), .5 + .27 * Math.sin(angle)]; }
    if (count <= 10) {
      if (!index) return [.5, .5];
      const angle = (index - 1) / (count - 1) * Math.PI * 2; return [.5 + .33 * Math.cos(angle), .5 + .33 * Math.sin(angle)];
    }
    const side = Math.ceil(Math.sqrt(count));
    return [.12 + .76 * ((index % side) + .5) / side, .12 + .76 * (Math.floor(index / side) + .5) / side];
  };
  const uids = new WeakMap();
  let nextUid = 0;
  const uidOf = unit => uids.get(unit) ?? (uids.set(unit, ++nextUid), nextUid);

  const Combat = {
    effects: [],                      // korta slag för renderingen: { x1, y1, x2, y2, life }
    projectiles: [],                  // pilar i luften: { x, y, fromX, fromY, toX, toY, target, attacker, damage, time, duration }
    time: 0,                          // simuleringstid i sekunder
    targetCache: null,                // kandidater för den här simuleringsrutan (se targets)
    alertTimers: new WeakMap(),       // byggnad -> sekunder till nästa sökning

    // ---- Sökning -------------------------------------------------------------------------------

    // Enheter och byggnader som kan bli mål: levande och tillhör någon riktig spelare. En lista per simuleringsruta.
    targets() {
      return this.targetCache || (this.targetCache = [...World.units, ...World.buildings].filter(target =>
        target.hp != null && target.player !== Players.NEUTRAL));
    },

    // Bästa fiende till 'player' inom radius från (x, y): lägst prioritet först, sedan närmast.
    findEnemy(player, x, y, radius, ignore) {
      let best = null, bestPriority = Infinity, bestDistance = Infinity;
      for (const target of this.targets()) {
        if (target.removed || target === ignore || !Players.isHostile(player, target.player)) continue;
        const distance = Math.hypot(centreX(target) - x, centreY(target) - y);
        if (distance > radius || !Vision.knows(player, target)) continue;   // fog of war: bara det spelaren ser, eller (dator) känner till
        const rank = priority(target);
        if (rank > bestPriority || (rank === bestPriority && distance >= bestDistance)) continue;
        best = target; bestPriority = rank; bestDistance = distance;
      }
      return best;
    },

    // ---- Skada ---------------------------------------------------------------------------------

    attack(attacker, target) {
      const definition = attacker.definition, amount = Math.max(1, definition.attackDamage - (target.definition.armor || 0));
      attacker.attackCooldownLeft = definition.attackCooldown;
      if (definition.attackRange <= MELEE_RANGE) {
        this.effects.push({ x1: attacker.x, y1: attacker.y, x2: centreX(target), y2: centreY(target), life: 0.18 });
        CityBuilder.Sound?.play('swing', { x: attacker.x, y: attacker.y });
        this.damage(target, amount, attacker);
        return;
      }
      CityBuilder.Sound?.play('arrow', { x: attacker.x, y: attacker.y });
      const { projectileSpeed, projectileMinSeconds, projectileMaxSeconds } = settings();
      const distance = Math.hypot(centreX(target) - attacker.x, centreY(target) - attacker.y);
      this.projectiles.push({
        x: attacker.x, y: attacker.y, fromX: attacker.x, fromY: attacker.y, toX: centreX(target), toY: centreY(target),
        target, attacker, damage: amount, time: 0,
        duration: Math.min(projectileMaxSeconds, Math.max(projectileMinSeconds, distance / projectileSpeed)),
      });
    },

    // Pilarna flyger mot målets aktuella plats och gör skada när de når fram (målet kan ha dött under tiden)
    updateProjectiles(deltaSeconds) {
      for (const shot of this.projectiles) {
        shot.time += deltaSeconds;
        if (!shot.target.removed) { shot.toX = centreX(shot.target); shot.toY = centreY(shot.target); }
        const progress = Math.min(1, shot.time / shot.duration);
        shot.x = shot.fromX + (shot.toX - shot.fromX) * progress;
        shot.y = shot.fromY + (shot.toY - shot.fromY) * progress;
        if (progress >= 1 && !shot.target.removed) this.damage(shot.target, shot.damage, shot.attacker);
      }
      this.projectiles = this.projectiles.filter(shot => shot.time < shot.duration);
    },

    // attacker (valfri) är den som gav sista slaget: bara spelarens egna segrar räknas mot banans mål
    // Larm när en fiende träffar något av spelarens: ett ljud (sedan vila) och en röd pil på minikartan (Combat.alarm, ritas av minimap.js)
    ALARM_SOUND_COOLDOWN: 30, ALARM_ARROW_SECONDS: 10,
    alarm: { x: 0, y: 0, arrowUntil: -1, soundAfter: 0 },
    raiseAlarm(target, attacker) {
      if (target.player !== Players.HUMAN || !attacker || !Players.isHostile(Players.HUMAN, attacker.player)) return;
      const alarm = this.alarm;
      alarm.x = target.x; alarm.y = target.y;
      alarm.arrowUntil = this.time + this.ALARM_ARROW_SECONDS;   // en ny attack under tiden startar om pilens tid
      if (this.time >= alarm.soundAfter) { alarm.soundAfter = this.time + this.ALARM_SOUND_COOLDOWN; CityBuilder.Sound?.play('alarm'); }
    },
    alarmArrow() { return this.time < this.alarm.arrowUntil ? this.alarm : null; },

    damage(target, amount, attacker) {
      if (target.hp == null || target.removed) return;
      this.raiseAlarm(target, attacker);
      CityBuilder.Sound?.play('hit', { x: centreX(target), y: centreY(target) });
      target.hp -= amount;
      if (target.hp <= 0) this.kill(target, attacker);
    },

    kill(target, attacker) {
      if (target.removed) return;
      const Levels = CityBuilder.Levels;
      if (attacker?.player === Players.HUMAN && Players.isHostile(Players.HUMAN, target.player)) Levels?.onDefeated?.(target);
      if (isBuilding(target)) return this.destroyBuilding(target);
      const unit = target;
      if (unit.definition.isSoldier) CityBuilder.Sound?.play('died', { x: unit.x, y: unit.y });
      CityBuilder.Logistics.abortTask(unit); // en bärare som dör släpper sina reservationer
      if (unit.definition.isHauler) CityBuilder.Logistics.carrierLost(unit);
      Garrison.release(unit);
      Behaviors.removeUnit(unit);
    },

    // En förstörd byggnad är som en riven, men inget lämnas tillbaka (innehållet går förlorat)
    destroyBuilding(building) {
      CityBuilder.Sound?.play('destroyed', { x: building.x, y: building.y });
      CityBuilder.Construction.dismantle(building, false);
      const game = CityBuilder.Game;
      if (game?.selectedBuilding === building) game.selectBuilding(null);
      if (building.type === 'hq') this.eliminate(building.player);
    },

    // En spelare utan bas är utslagen: allt hens byggnader och enheter försvinner. Utslagen spelare = förlust, sista datorspelaren = seger.
    eliminate(player, restoring = false) {
      for (const building of [...World.buildings]) if (building.player === player) CityBuilder.Construction.dismantle(building, false);
      for (const unit of [...World.units]) if (unit.player === player) this.kill(unit);
      if (player !== Players.HUMAN) Players.active = Players.active.filter(other => other !== player);
      if (player === Players.HUMAN) CityBuilder.Game?.defeat?.();
      else {
        if (!restoring && Players.isHostile(Players.HUMAN, player)) CityBuilder.Levels?.onRivalDown?.();
        if (!Players.hostileAI().length) CityBuilder.Levels?.win?.();
      }
    },

    // ---- Skapa soldater ------------------------------------------------------------------------

    // Alla soldater skapas här så att stridsfälten alltid finns
    spawnSoldier(kind, x, y, player) {
      const unit = World.spawnUnit(kind, x, y, null, player);
      return Object.assign(unit, {
        laneX: (Math.random() - .5) * .44,   // förskjutning inom rutan under gång (se Units.walk)
        laneY: (Math.random() - .5) * .44,
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

      this.settle(deltaSeconds);
      this.updateProjectiles(deltaSeconds);
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

    // Soldater rör sig mellan rutorna som alla andra enheter och passerar varandra utan att knuffas (så de kan aldrig fastna).
    // Stillastående soldater på samma ruta, vänner som fiender, tar varsin plats i rutan och glider dit. Slåss två, står de alltså i samma ruta.
    settle(deltaSeconds) {
      const groups = new Map();
      for (const unit of World.units) {
        if (!unit.definition.isSoldier || unit.removed || unit.stepQueue.length) continue;
        const key = Math.floor(unit.x) * 100003 + Math.floor(unit.y), group = groups.get(key);
        if (group) group.push(unit); else groups.set(key, [unit]);
      }
      const reach = SETTLE_SPEED * deltaSeconds;
      for (const group of groups.values()) {
        group.sort((a, b) => uidOf(a) - uidOf(b)); // fast ordning, så platserna inte byter ägare
        group.forEach((unit, index) => {
          const [slotX, slotY] = slotIn(index, group.length), tileX = Math.floor(unit.x), tileY = Math.floor(unit.y);
          const dx = tileX + slotX - unit.x, dy = tileY + slotY - unit.y, distance = Math.hypot(dx, dy);
          if (distance <= reach) { unit.x = tileX + slotX; unit.y = tileY + slotY; }
          else { unit.x += dx / distance * reach; unit.y += dy / distance * reach; }
        });
      }
    },

    updateSoldier(unit, deltaSeconds) {
      for (const timer of TIMERS) unit[timer] = Math.max(0, unit[timer] - deltaSeconds);

      const anchor = this.anchorOf(unit);
      if (unit.target && !this.isValidTarget(unit, anchor)) unit.target = null;

      // Utan mål söker soldaten ett, och med ett sämre mål än en soldat (byggnad, bärare) letar den vidare efter något bättre
      if ((!unit.target || priority(unit.target) > 0) && unit.scanTimer <= 0) {
        unit.scanTimer = settings().scanIntervalSeconds;
        const ignored = unit.ignoreUntil > this.time ? unit.ignore : null;
        const found = this.findEnemy(unit.player, anchor.x, anchor.y, anchor.radius, ignored);
        if (found && (!unit.target || priority(found) < priority(unit.target))) unit.target = found;
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

    // Närstrid mot en enhet kräver att den står i samma ruta, annars räknas avståndet (mot en byggnad från dess kant)
    inReach(unit, target) {
      const range = unit.definition.attackRange;
      if (range <= MELEE_RANGE && !isBuilding(target)) return Math.floor(target.x) === Math.floor(unit.x) && Math.floor(target.y) === Math.floor(unit.y);
      return Math.hypot(centreX(target) - unit.x, centreY(target) - unit.y) <= range + (isBuilding(target) ? BUILDING_REACH : 0);
    },

    // Slå om målet är inom räckhåll, annars gå mot det
    engage(unit) {
      const target = unit.target;

      if (this.inReach(unit, target)) {
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
