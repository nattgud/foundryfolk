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
   - Garnisonsbyggnadens läge (building.stance): 'defend' vaktar inom job.searchRadius. 'attack' skickar soldaterna till spelarens flagga
     (flags.js): de slåss mot fiender på vägen dit och inom flagRadius från den, och står kvar där. Utan flagga försvarar de som vanligt.

   En soldat har dessa fält utöver vanliga enhetsfält (alla sätts i spawnSoldier):
     quarters   byggnaden den hör till (null = fri soldat)    post     fri soldats vaktplats { x, y }
     target     enheten den anfaller                          mode     vad stegkön är till för: 'idle' | 'chase' | 'return'
   Närstridssoldater (attackRange <= MELEE_RANGE) slår först när de står i samma ruta som en enhet (en byggnad: på angränsande ruta).
   Bågskyttar skjuter en pil (Combat.projectiles) som flyger i en bråkdels sekund och gör skadan först när den träffar.
   Soldater styrs via stegkön (Jobs) som övriga enheter, så Units.update gör själva förflyttningen. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Jobs, Behaviors, Players, Garrison, Flags, Monsters, Vision, Utils } = CityBuilder;

  const settings = () => Config.settings.military;
  const TIMERS = ['attackCooldownLeft', 'scanTimer', 'repathTimer', 'orderCooldown', 'homeSearchTimer'];
  const HOME_SEARCH_SECONDS = 2;      // hur ofta en fri soldat letar efter en ledig garnison
  const POST_TOLERANCE = 3;           // så nära posten räknas en fri soldat som på plats
  const SETTLE_SPEED = 1;             // hur fort en stillastående soldat glider till sin plats i rutan (rutor per sekund)
  const HQ_NEAR = 12;                // rutor: så nära fiendens HQ är HQ målet för datorns soldater (om inget militärt finns)
  const BLOCKER_SECONDS = 90;        // så länge slår en soldat det som stänger vägen (blocker) innan den prövar vägen igen
  const ATTACKED_SECONDS = 4;        // blev soldaten slagen så nyligen försvarar den sig i stället för att slå det som stänger vägen
  const MELEE_RANGE = 2;              // attackRange upp till detta är närstrid, över det en projektil
  const GRID_CELL = 8, GRID_KEY = 100003, GRID_SECONDS = 0.25, GRID_MARGIN = 3;   // rutnätet för sökningen efter fiender (se targets)
  const RETRY_UNREACHABLE_SECONDS = 8;    // så länge ett mål som inte gick att nå får vara i fred efter att något byggts eller rivits (annars försöker soldaten hela tiden och hinner aldrig gå tillbaka till sin post)
  const BREACH_SECONDS = 10;         // så lång tid räknas det ta att slå sönder en fientlig mur: är omvägen längre än så slår soldaten hellre sönder muren (considerBreach)
  const STUCK_SECONDS = 12;          // en soldat som varken rört sig eller slagit så länge, och inte står där den ska, är fast (se watchStuck)
  const BUILDING_REACH = 0.6;         // en byggnad är en hel ruta: räckhållet räknas från kanten, inte mitten

  // Mål är enheter (x, y = mitten) eller byggnader (x, y = rutan). Mittpunkt och prioritet (lägre = angrips först):
  const isBuilding = target => target.buildProgress !== undefined;
  const centreX = target => target.x + (isBuilding(target) ? .5 : 0);
  const centreY = target => target.y + (isBuilding(target) ? .5 : 0);
  const priority = target => target.definition.isSoldier && !isBuilding(target) ? 0 : isBuilding(target) ? (target.definition.job?.kind === 'garrison' ? .5 : 1) : 2;   // soldat, torn och baracker (där försvararna kommer ifrån), övriga byggnader, övrigt

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
    unstuck: 0,                       // hur många gånger vakten (watchStuck) behövt rensa en fast soldat; ska helst stå still
    fightAt: -Infinity,               // när något av spelarens senast slogs med en fiende eller träffades av en (Sound väljer stridsmusik efter det)
    targetCache: null,                // kandidater med rutnät (se targets)
    gridTime: -Infinity,
    alertTimers: new WeakMap(),       // byggnad -> sekunder till nästa sökning

    // ---- Sökning -------------------------------------------------------------------------------

    // Enheter och byggnader som kan bli mål: levande och tillhör någon riktig spelare. Sorterade i ett rutnät (GRID_CELL rutor stora) som
    // byggs om högst var GRID_SECONDS sekund: sökningen behöver då bara titta i rutorna runt platsen i stället för i hela världen.
    // Positioner läses live, och rutnätet har marginal (GRID_MARGIN) för att enheter hinner röra sig mellan ombyggnaderna.
    targets() {
      if (this.targetCache && this.time - this.gridTime < GRID_SECONDS) return this.targetCache;
      const list = this.targetCache = [...World.units, ...World.buildings].filter(target => target.hp != null && target.player !== Players.NEUTRAL);
      const grid = this.grid = new Map();
      list.forEach((target, index) => {
        const key = Math.floor(centreX(target) / GRID_CELL) * GRID_KEY + Math.floor(centreY(target) / GRID_CELL), cell = grid.get(key);
        if (cell) cell.push(index); else grid.set(key, [index]);
      });
      this.gridTime = this.time;
      return list;
    },

    // Bästa fiende till 'player' inom radius från (x, y): lägst prioritet först, sedan närmast (vid lika: den som kom först i listan).
    // 'hunter' (valfri): monstret som söker. Det får bara slå vissa mål (Monsters.mayHit) och ser allt (ingen fog of war).
    findEnemy(player, x, y, radius, ignore, hunter, ranker = priority) {
      const list = this.targets(), grid = this.grid, reach = radius + GRID_MARGIN, radiusSquared = radius * radius;
      const fromX = Math.floor((x - reach) / GRID_CELL), toX = Math.floor((x + reach) / GRID_CELL), fromY = Math.floor((y - reach) / GRID_CELL), toY = Math.floor((y + reach) / GRID_CELL);
      let best = null, bestPriority = Infinity, bestDistance = Infinity, bestIndex = Infinity;
      for (let cellX = fromX; cellX <= toX; cellX++) for (let cellY = fromY; cellY <= toY; cellY++) {
        const cell = grid.get(cellX * GRID_KEY + cellY);
        if (!cell) continue;
        for (const index of cell) {
          const target = list[index];
          if (target.removed || (ignore && (typeof ignore === 'function' ? ignore(target) : target === ignore)) || !Players.isHostile(player, target.player) || (hunter && !Monsters.mayHit(hunter, target))) continue;
          const dx = centreX(target) - x, dy = centreY(target) - y, squared = dx * dx + dy * dy;
          if (squared > radiusSquared) continue;
          const distance = Math.sqrt(squared);
          if (player !== Players.MONSTER && !Vision.knows(player, target)) continue;   // fog of war: bara det spelaren ser, eller (dator) känner till
          const rank = ranker(target);
          if (rank > bestPriority || (rank === bestPriority && (distance > bestDistance || (distance === bestDistance && index > bestIndex)))) continue;
          best = target; bestPriority = rank; bestDistance = distance; bestIndex = index;
        }
      }
      return best;
    },

    // ---- Skada ---------------------------------------------------------------------------------

    attack(attacker, target) {
      attacker.lastAttackAt = this.time;
      const definition = attacker.definition, amount = Math.max(1, definition.attackDamage - (target.definition.armor || 0));
      attacker.attackCooldownLeft = definition.attackCooldown;
      if (definition.attackRange <= MELEE_RANGE) {
        this.effects.push({ x1: attacker.x, y1: attacker.y, x2: centreX(target), y2: centreY(target), life: 0.18 });
        CityBuilder.Sound?.play(definition.attackSound || 'swing', { x: attacker.x, y: attacker.y });
        this.damage(target, amount, attacker);
        return;
      }
      CityBuilder.Sound?.play('arrow', { x: attacker.x, y: attacker.y });
      const { projectileSpeed, projectileMinSeconds, projectileMaxSeconds } = settings();
      const distance = Utils.distance(centreX(target) - attacker.x, centreY(target) - attacker.y);
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
      if (attacker && (target.player === Players.HUMAN || attacker.player === Players.HUMAN) && Players.isHostile(target.player, attacker.player)) this.fightAt = this.time;
      this.raiseAlarm(target, attacker);
      if (attacker && target.definition?.isSoldier && Players.isHostile(target.player, attacker.player)) { target.attackedAt = this.time; target.attacker = attacker; }
      const Sound = CityBuilder.Sound;
      Sound?.play(Sound.known(target.definition?.hitSound, 'hit'), { x: centreX(target), y: centreY(target) });   // monster kan ha ett eget skadeljud
      target.hp -= amount;
      if (target.hp <= 0) this.kill(target, attacker);
    },

    kill(target, attacker) {
      if (target.removed) return;
      const Levels = CityBuilder.Levels;
      if (attacker?.player === Players.HUMAN && Players.isPlayer(target.player) && Players.isHostile(Players.HUMAN, target.player)) Levels?.onDefeated?.(target);   // monster räknas inte mot banans mål
      if (isBuilding(target)) return this.destroyBuilding(target);
      const unit = target;
      const Sound = CityBuilder.Sound;
      if (unit.definition.isSoldier) Sound?.play(unit.definition.isMonster ? Sound.known(unit.definition.dieSound, 'monster_die') : 'died', { x: unit.x, y: unit.y });
      if (unit.animalRecordId) CityBuilder.Animals.markDead(unit);   // ett dödat monster kommer inte tillbaka
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
      // Kapitel som slutar när dimman lyfter (end: 'fog'): faller basen faller också Eye of Shades, och dimman lyfter. Det är målet, inte en förlust.
      const holdsOut = CityBuilder.Levels?.story?.end === 'fog' && !CityBuilder.Levels.told('fog:lifted');
      if (player === Players.HUMAN) { if (!holdsOut) CityBuilder.Game?.defeat?.(); }
      else {
        if (!restoring && Players.isHostile(Players.HUMAN, player)) CityBuilder.Levels?.onRivalDown?.();
        if (!restoring) {   // notis med spelarens färg och hur många som är kvar
          const color = CityBuilder.Config.settings.playerColors[player] || '#fff', t = CityBuilder.t;
          CityBuilder.UI?.showToast(t('{name} has been eliminated. {alive} of {total} players left', { name: `<b style="color:${color}">${t('Player {n}', { n: player })}</b>`, alive: Players.active.length, total: Players.aiPlayers().length + 1 }));
        }
        if (!Players.hostileAI().length) CityBuilder.Levels?.win?.();
      }
    },

    // ---- Skapa soldater ------------------------------------------------------------------------

    // Alla soldater skapas här så att stridsfälten alltid finns
    spawnSoldier(kind, x, y, player) {
      const unit = World.spawnUnit(kind, x, y, null, player);
      return Object.assign(unit, {
        laneX: (Utils.random() - .5) * .44,   // förskjutning inom rutan under gång (se Units.walk)
        laneY: (Utils.random() - .5) * .44,
        quarters: null,
        post: null,
        target: null,
        mode: 'idle',
        goal: null,                  // dit en soldat i läget 'return' är på väg (byggnad eller post)
        attackCooldownLeft: 0,
        scanTimer: Utils.random() * settings().scanIntervalSeconds, // sprider ut sökningarna över tid
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
      this.alertGarrisons(deltaSeconds);
      this.watchForces(deltaSeconds);

      for (const unit of [...World.units]) { // kopia: enheter kan dö eller försvinna under varvet
        if (unit.definition.isSoldier && !unit.removed) this.updateSoldier(unit, deltaSeconds);
      }

      this.settle(deltaSeconds);
      this.updateProjectiles(deltaSeconds);
      for (const effect of this.effects) effect.life -= deltaSeconds;
      this.effects = this.effects.filter(effect => effect.life > 0);
    },

    // Datorn minns hur många fientliga soldater den som mest sett på en gång: en stor styrka (bigForce) får den att gå på HQ efter det militära, en liten att arbeta sig fram
    watchForces(deltaSeconds) {
      this.forceTimer = (this.forceTimer || 0) - deltaSeconds;
      if (this.forceTimer > 0) return;
      this.forceTimer = 1;
      const peaks = this.peakFoes ||= new Map();
      const counts = new Map();
      for (const unit of World.units) {
        if (!unit.definition.isSoldier || unit.definition.isMonster || unit.removed || unit.player === Players.NEUTRAL) continue;
        for (const player of Players.aiPlayers()) if (Players.isHostile(player, unit.player) && Vision.sees(player, unit)) counts.set(player, (counts.get(player) || 0) + 1);
      }
      for (const [player, count] of counts) if (count > (peaks.get(player) || 0)) peaks.set(player, count);
    },

    // Turordningen för vad en soldat slår först (lägre = först). Datorn: fiendens soldater, militära byggnader (torn, baracker), sedan efter läge. En liten fiendestyrka: murar,
    // vanliga byggnader, HQ sist. En stor: HQ före murar och byggnader. Står soldaten vid HQ (HQ_NEAR) och inget militärt är i närheten är HQ målet. Efter ett misslyckat vägval (onPathFailure)
    // slår den det som står närmast i vägen (murar först) en stund. Andra spelare och monster: soldater, byggnader, övrigt (priority).
    rankFor(unit) {
      if (unit.definition.isMonster) return priority;
      if (!Players.isAI(unit.player)) return priority;
      const big = (this.peakFoes?.get(unit.player) || 0) >= (Config.ai.attack.bigForce ?? 8);
      return target => {
        if (!isBuilding(target)) return target.definition.isSoldier ? 0 : 6;
        if (target.definition.job?.kind === 'garrison') return 1;
        const hq = target.type === 'hq';
        if (hq) return Utils.distance(target.x - unit.x, target.y - unit.y) <= HQ_NEAR ? 1.5 : big ? 2 : 5;
        if (target.type === 'wall') return big ? 3 : 2;
        return big ? 4 : 3;
      };
    },

    // Garnisoner med soldater hemma letar efter fiender och skickar ut dem
    alertGarrisons(deltaSeconds) {
      for (const building of World.buildings) {
        if (building.buildProgress < 1 || !Garrison.isGarrison(building) || !Garrison.inside(building)) continue;

        const left = (this.alertTimers.get(building) ?? 0) - deltaSeconds;
        if (left > 0) { this.alertTimers.set(building, left); continue; }
        this.alertTimers.set(building, settings().scanIntervalSeconds);

        const flag = Garrison.flagOf(building);
        if (flag) { Garrison.deploy(building, null); continue; }   // på väg till flaggan
        const enemy = this.findEnemy(building.player, building.x + .5, building.y + .5, Garrison.radius(building), target => target.type === 'wall');   // murar ger ingen utryckning
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
          const dx = tileX + slotX - unit.x, dy = tileY + slotY - unit.y, distance = Utils.distance(dx, dy);
          if (distance <= reach) { unit.x = tileX + slotX; unit.y = tileY + slotY; }
          else { unit.x += dx / distance * reach; unit.y += dy / distance * reach; }
        });
      }
    },

    updateSoldier(unit, deltaSeconds) {
      for (const timer of TIMERS) unit[timer] = Math.max(0, unit[timer] - deltaSeconds);

      const monster = unit.definition.isMonster;
      if (monster) Monsters.growl(unit); else this.watchStuck(unit);
      const anchor = this.anchorOf(unit);
      if (unit.target && !this.isValidTarget(unit, anchor)) unit.target = null;
      // Anfaller någon soldaten försvarar den sig mot den, också utanför vaktområdet och före det som stänger vägen
      const attacked = this.time - (unit.attackedAt ?? -99) < ATTACKED_SECONDS, attacker = attacked ? unit.attacker : null;
      if (attacker && !attacker.removed && !monster && unit.target !== attacker && (!unit.target || isBuilding(unit.target) || !unit.target.definition.isSoldier) && !this.isUnreachable(unit, attacker)) { unit.target = attacker; unit.mode = 'idle'; }

      // Det som stänger vägen (en fientlig mur eller byggnad, se onPathFailure) slås sönder, om inte någon anfaller soldaten under tiden
      if (unit.blocker && (unit.blocker.removed || this.time > unit.blockerUntil)) { if (unit.blocker.removed) unit.unreachable?.clear(); unit.blocker = null; }
      if (unit.blocker && !attacked && unit.target !== unit.blocker) { unit.target = unit.blocker; unit.mode = 'idle'; }
      // Utan mål söker soldaten ett, och med ett sämre mål än en soldat (byggnad, bärare) letar den vidare efter något bättre
      const rank = monster ? priority : this.rankFor(unit);
      if (!(unit.blocker && unit.target === unit.blocker && !attacked) && (!unit.target || rank(unit.target) > 0) && unit.scanTimer <= 0) {
        unit.scanTimer = settings().scanIntervalSeconds;
        // Murar slås bara när de stänger vägen (blocker), inte bara för att de står nära; mål som inte går att nå ignoreras (se onPathFailure)
        const ignored = monster ? (unit.ignoreUntil > this.time ? unit.ignore : null)
          : target => (isBuilding(target) && target.type === 'wall' && target !== unit.blocker) || (unit.ignoreUntil > this.time && target === unit.ignore) || this.isUnreachable(unit, target);
        const found = this.findEnemy(unit.player, anchor.x, anchor.y, anchor.radius, ignored, monster ? unit : undefined, rank);
        if (found && (!unit.target || rank(found) < rank(unit.target))) unit.target = found;
      }

      if (unit.target) { this.engage(unit); return; }

      if (unit.mode === 'chase') { unit.stepQueue.length = 0; unit.mode = 'idle'; } // målet försvann: sluta jaga
      this.standDown(unit);
    },

    // Vakt mot en soldat som står still utan skäl: varken rört sig eller slagit på STUCK_SECONDS och inte står vid sin post eller flagga. Något den minns hindrar den då
    // (ett mål den gett upp, något som stänger vägen, en byggnad den inte kom fram till, ett gammalt "ingen väg"-svar): allt det glöms och vägarna räknas om, så den prövar på nytt.
    // Gick det inte ens då (andra gången i följd) släpps byggnaden den är knuten till.
    watchStuck(unit) {
      const watch = unit.watch ||= { x: unit.x, y: unit.y, since: this.time, strikes: 0 };
      if (Math.hypot(unit.x - watch.x, unit.y - watch.y) > .3) { watch.x = unit.x; watch.y = unit.y; watch.since = this.time; watch.strikes = 0; return; }
      if (this.time - watch.since < STUCK_SECONDS || this.time - (unit.lastAttackAt ?? -Infinity) < STUCK_SECONDS) return;
      const home = unit.quarters && !unit.quarters.removed ? unit.quarters : null, flag = home ? Garrison.flagOf(home) : null;
      if (flag ? Utils.distance(unit.x - flag.x - .5, unit.y - flag.y - .5) <= POST_TOLERANCE : !home && unit.post && Utils.distance(unit.x - unit.post.x, unit.y - unit.post.y) <= POST_TOLERANCE) { watch.since = this.time; return; }   // står där den ska
      watch.since = this.time;
      watch.strikes++;
      this.unstuck++;
      unit.ignoreUntil = 0; unit.ignore = null; unit.unreachable?.clear(); unit.blocker = null; unit.target = null; unit.orderCooldown = 0; unit.stepQueue.length = 0; unit.mode = 'idle'; unit.goal = null;
      if (watch.strikes >= 2 && home && !flag) Garrison.reject(unit, home);
      if (this.time - (this.clearedAt ?? -Infinity) >= 8) { this.clearedAt = this.time; CityBuilder.Pathfinder.clearCache(); CityBuilder.Pathfinder.failures.clear(); }   // högst var 8:e sekund: många fasta soldater ska inte tvinga fram nya sökningar hela tiden
    },

    // En soldat har fått en lång väg (kostnad = gångsekunder). Går det snabbare att slå sönder en fientlig byggnad på en rakare väg (BREACH_SECONDS per byggnad) blir den soldatens blocker,
    // som den slår sönder innan den går vidare. Svarar om vägen ska kastas.
    considerBreach(unit, step, cost) {
      if (unit.definition.isMonster || unit.blocker || step.toNear || step.targetX === undefined || this.time < (unit.breachCheckAt ?? 0)) return false;
      unit.breachCheckAt = this.time + 3;
      const found = CityBuilder.Pathfinder.assess(Math.floor(unit.x), Math.floor(unit.y), step.targetX, step.targetY, unit.player, BREACH_SECONDS);
      if (!found.blocker || found.cost === null || found.cost >= cost) return false;
      unit.blocker = found.blocker; unit.blockerUntil = this.time + BLOCKER_SECONDS;
      return true;
    },

    // Platsen soldaten vaktar och hur långt därifrån den upptäcker fiender: flaggan (på väg dit: där soldaten står, så att fiender på vägen
    // bekämpas), annars sin byggnad, annars sin post
    anchorOf(unit) {
      if (unit.definition.isMonster) return Monsters.anchorOf(unit);
      const home = unit.quarters;
      if (home && !home.removed) {
        const flag = Garrison.flagOf(home), radius = Flags.radius();
        if (flag) {
          const onTheWay = Utils.distance(unit.x - flag.x - .5, unit.y - flag.y - .5) > radius;
          return onTheWay ? { x: unit.x, y: unit.y, radius } : { x: flag.x + .5, y: flag.y + .5, radius };
        }
        return { x: home.x + .5, y: home.y + .5, radius: Garrison.radius(home) };
      }
      if (home) Garrison.release(unit); // byggnaden finns inte längre
      if (unit.wave) return { x: unit.x, y: unit.y, radius: unit.definition.searchRadius ?? settings().searchRadius };   // vågsoldat: ser det som är i vägen där den står (torn, hus), inte bara runt posten den är på väg till
      unit.post = unit.post || { x: unit.x, y: unit.y };
      return { x: unit.post.x, y: unit.post.y, radius: unit.definition.searchRadius ?? settings().searchRadius };
    },

    // Målet gäller så länge det lever, fortfarande är en fiende och inte tagit sig för långt från vaktplatsen
    isValidTarget(unit, anchor) {
      const target = unit.target;
      if (target === unit.attacker && this.time - (unit.attackedAt ?? -99) < ATTACKED_SECONDS) return !target.removed && Players.isHostile(unit.player, target.player);   // den som anfaller soldaten gäller var den än står
      return !target.removed && Players.isHostile(unit.player, target.player) && (!unit.definition.isMonster || Monsters.mayHit(unit, target)) &&
        Utils.distance(centreX(target) - anchor.x, centreY(target) - anchor.y) <= anchor.radius * settings().leashFactor;
    },

    // Närstrid mot en enhet kräver att den står i samma ruta, annars räknas avståndet (mot en byggnad från dess kant)
    inReach(unit, target) {
      const range = unit.definition.attackRange;
      if (range <= MELEE_RANGE && !isBuilding(target) && !unit.definition.isMonster) return Math.floor(target.x) === Math.floor(unit.x) && Math.floor(target.y) === Math.floor(unit.y);
      return Utils.distance(centreX(target) - unit.x, centreY(target) - unit.y) <= range + (isBuilding(target) ? BUILDING_REACH : 0);
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

      if (unit.definition.isMonster && !unit.definition.roam && !unit.definition.raider) { unit.target = null; return; }   // en stillastående slår bara det som är inom räckhåll

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
      if (unit.definition.isMonster) return Monsters.rest(unit);
      const home = unit.quarters, flag = home && !home.removed ? Garrison.flagOf(home) : null;
      if (flag) {   // till flaggan och stå kvar där
        if (Utils.distance(unit.x - flag.x - .5, unit.y - flag.y - .5) > POST_TOLERANCE) this.goTo(unit, flag, () => [Jobs.walkTo(flag.x, flag.y)]);
        else if (unit.mode === 'return') { unit.mode = 'idle'; unit.goal = null; }
        return;
      }
      if (home && !home.removed) {
        this.goTo(unit, home, () => [Jobs.walkTo(home.x, home.y), Jobs.run(() => Garrison.enter(unit))]);
        return;
      }

      // Fri soldat: ta en ledig plats i en garnison om det finns någon, annars vakta posten
      if (unit.homeSearchTimer <= 0 && !unit.wave) {
        unit.homeSearchTimer = HOME_SEARCH_SECONDS;
        const newHome = Garrison.findHome(unit);
        if (newHome) { Garrison.assign(unit, newHome); return; }
      }

      const post = unit.post;
      if (post && Utils.distance(unit.x - post.x, unit.y - post.y) > POST_TOLERANCE) {
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
    // Står något i vägen? En fientlig mur eller byggnad som stänger vägen blir soldatens mål (blocker). Går vägen inte att öppna (berg, vatten, egna byggnader) går
    // soldaten till närmaste ruta den kan nå och väntar där, och struntar i målet så länge inget ändrats (isUnreachable).
    onPathFailure(unit, step) {
      const wasGoal = unit.goal;
      unit.orderCooldown = settings().retrySeconds;
      unit.mode = 'idle';
      unit.goal = null;
      // En soldat som inte kommer till sin garnison, och där inget fientligt stänger vägen, ger upp den (och söker en annan eller vaktar där den står), i stället för att stå kvar och misslyckas för alltid
      const wasHome = !unit.definition.isMonster && unit.quarters && wasGoal === unit.quarters;
      const giveUpHome = () => { Garrison.reject(unit, unit.quarters); unit.orderCooldown = 0; };
      const target = unit.target;
      if (target) {
        unit.ignore = target;
        unit.ignoreUntil = this.time + settings().retrySeconds * 2;
        unit.target = null;
      }
      if (unit.definition.isMonster || !step || step.targetX === undefined || step.toNear) { if (wasHome) giveUpHome(); return; }   // en gång: misslyckas gången till närmaste ruta stannar soldaten där den står
      const found = CityBuilder.Pathfinder.assess(Math.floor(unit.x), Math.floor(unit.y), step.targetX, step.targetY, unit.player);
      if (wasHome && !found.blocker) { giveUpHome(); return; }
      if (target) {
        const map = unit.unreachable ||= new Map();
        for (const [other] of map) if (other.removed) map.delete(other);
        map.set(target, { epoch: CityBuilder.Pathfinder.epoch, at: this.time, x: target.x, y: target.y });
      }
      if (found.blocker) { unit.blocker = found.blocker; unit.blockerUntil = this.time + BLOCKER_SECONDS; }
      else if (found.near && Utils.distance(found.near.x + .5 - unit.x, found.near.y + .5 - unit.y) > 1.5) {
        const walk = Jobs.walkTo(found.near.x, found.near.y);   // intill det som blockerar
        walk.toNear = true;
        unit.stepQueue = [walk];
        unit.mode = 'return'; unit.status = 'Returning';
      }
    },

    // Har soldaten gett upp målet för att det inte går att nå? Det gäller tills något byggts eller rivits (vägarna räknas om) eller målet flyttat sig
    isUnreachable(unit, target) {
      const entry = unit.unreachable?.get(target);
      if (!entry) return false;
      const moved = Utils.distance(target.x - entry.x, target.y - entry.y) > 4, changed = entry.epoch !== CityBuilder.Pathfinder.epoch && this.time - entry.at >= RETRY_UNREACHABLE_SECONDS;
      if (target.removed || moved || changed) { unit.unreachable.delete(target); return false; }
      return true;
    },
  };

  CityBuilder.Combat = Combat;
  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.combat = { update(deltaSeconds) { Combat.update(deltaSeconds); } };
})(window.CityBuilder);
