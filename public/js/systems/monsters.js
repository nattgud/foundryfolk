/* Monster: bor på kartan på banor med monster (Levels.current.monsters, från några banor före första fienden) och är fiender till alla spelare.

   - Monster är soldater (Config.units, isMonster) som tillhör Players.MONSTER och styrs av Combat som fria soldater, med en post (startplatsen):
       roam 0   står helt still och slår bara det som kommer inom räckhåll (attackRange)
       roam > 0 går omkring inom roam rutor från posten och jagar det som kommer inom roam + aggro rutor därifrån, sedan tillbaka
   - De anfaller soldater, och bärare som kommer inom settings.monsters.carrierRange rutor, men aldrig arbetare och nästan aldrig byggnader
     (Monsters.mayHit). Bara raidern (definition.raider) anfaller byggnader.
   - Monstren skapas i takt med att chunkarna skapas, på samma sätt och med samma sparning som djuren (systems/animals.js): en post per monster
     i World.animalsByChunk, och en enhet så länge platsen syns. Ett monster som lämnats ensamt läker, ett dödat kommer inte tillbaka.
   - Raiden: på banan Levels.current.monsters.raid = 'fixed' (och sällan, slumpat men bestämt av körningens frö, på senare banor: 'random') kommer
     en horde raiders från ett håll långt från basen och går mot huvudlagret. Varningen är densamma som vid lava: ett meddelande och larmljud en
     stund innan, och när hordens kommit i rörelse en röd pil på minimapen mot den (Combat.alarm). Hordens tillstånd sparas med spelet. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players, Utils } = CityBuilder;

  const settings = () => Config.settings.monsters;
  const info = () => CityBuilder.Levels?.current?.monsters || null;
  const between = ([low, high]) => low + Utils.random() * (high - low);
  const ARRIVED = 3;                                  // så nära posten räknas ett monster som framme
  const RAID_SEED = [7919, -7919];                    // "chunk" som ger raidens slumpning (samma frö-funktion som djuren)

  const walkable = (x, y) => {
    const tile = World.getTile(x, y);
    return !!tile && Number.isFinite(Config.terrain[tile.terrainType].walkCost) && !World.buildingAt(x, y);
  };

  const Monsters = {
    plan: undefined,     // raiden: { at (banatid, sekunder), size } eller null (ingen raid på banan). Räknas ut första gången den behövs.
    warned: false,       // varningen har kommit
    spawned: false,      // hordens har startat
    over: false,         // och är besegrad
    raiders: [],         // hordens levande enheter

    reset() { Object.assign(this, { plan: undefined, warned: false, spawned: false, over: false, raiders: [] }); },

    // ---- Skapa ----------------------------------------------------------------------------------

    // Arter som finns på en bana med den styrkan (raidern bor inte på kartan)
    kinds: level => Object.keys(Config.units).filter(kind => { const unit = Config.units[kind]; return unit.isMonster && !unit.raider && unit.from <= level; }),

    // Monsterposterna för en ny chunk (Animals.ensureChunk). Tar sina platser ur 'candidates' och slumpen 'random' efter djuren. Inga nära baser.
    populate(key, random, candidates, start) {
      const monsters = info(), records = [];
      if (!monsters) return records;
      const { chance, perStrength, maxChance, packChance, safeRadius, cluster } = settings(), kinds = this.kinds(monsters.level);
      if (random() >= Math.min(maxChance, chance + perStrength * monsters.strength) || !kinds.length) return records;
      const weights = kinds.map(kind => Config.units[kind].spawnWeight);
      for (let i = random() < packChance ? 2 : 1; i > 0 && candidates.length; i--) {
        const spot = candidates.splice(Math.floor(random() * candidates.length), 1)[0];
        let left = random() * weights.reduce((sum, weight) => sum + weight, 0), index = 0;
        while (index < kinds.length - 1 && (left -= weights[index]) >= 0) index++;
        if (Object.values(World.hqs).some(hq => Utils.distance(hq.x - spot.x, hq.y - spot.y) < safeRadius)) continue;
        const add = at => { const x = at.x + .5, y = at.y + .5; records.push({ id: `${key}:${start + records.length}`, kind: kinds[index], x, y, homeX: x, homeY: y, dead: false }); };
        add(spot);
        if (random() >= cluster.chance) continue;   // en flock av samma art tätt intill: antalet slumpas och växer med banan
        const most = cluster.size[1] + Math.floor(monsters.strength / cluster.growEvery);
        let members = cluster.size[0] + Math.floor(random() * (most - cluster.size[0] + 1)) - 1;
        const near = candidates.filter(other => Utils.distance(other.x - spot.x, other.y - spot.y) <= cluster.spread);
        while (members-- > 0 && near.length) add(candidates.splice(candidates.indexOf(near.splice(Math.floor(random() * near.length), 1)[0]), 1)[0]);
      }
      return records;
    },

    // Gör en post till en enhet (Animals.activate)
    activate(record, key) {
      const unit = CityBuilder.Combat.spawnSoldier(record.kind, record.x - .5, record.y - .5, Players.MONSTER);
      unit.animalRecordId = record.id;
      unit.animalChunkKey = key;
      unit.post = { x: record.homeX, y: record.homeY };
      return unit;
    },

    // ---- Beteende (anropas av Combat) -------------------------------------------------------------

    // Får monstret slå målet? Soldater alltid, bärare om de är nära, byggnader bara raidern, arbetare aldrig.
    mayHit(unit, target) {
      if (target.buildProgress !== undefined) return !!unit.definition.raider;
      if (target.definition.isSoldier) return true;
      return !!target.definition.isHauler && Utils.distance(target.x - unit.x, target.y - unit.y) <= settings().carrierRange;
    },

    // Platsen monstret vaktar och hur långt därifrån det upptäcker fiender
    anchorOf(unit) {
      const { roam, aggro, attackRange, raider } = unit.definition, post = unit.post;
      if (raider) {   // på väg: slår det som finns i närheten, framme: letar igenom basen
        const arrived = Utils.distance(unit.x - post.x, unit.y - post.y) <= ARRIVED;
        return arrived ? { x: post.x, y: post.y, radius: settings().raid.sweepRadius } : { x: unit.x, y: unit.y, radius: aggro };
      }
      return { x: post.x, y: post.y, radius: roam ? roam + aggro : attackRange };
    },

    // Utan fiender: gå tillbaka till posten (raidern: till huvudlagret), annars då och då en promenad inom området. Stillastående monster står kvar.
    rest(unit) {
      const { roam, raider } = unit.definition, post = unit.post, combat = CityBuilder.Combat;
      if (!roam && !raider) return;
      const away = Utils.distance(unit.x - post.x, unit.y - post.y);
      if (raider || away > roam + 1) {
        if (away > ARRIVED) combat.goTo(unit, post, () => [CityBuilder.Jobs.walkTo(Math.floor(post.x), Math.floor(post.y))]);
        else if (unit.mode === 'return') { unit.mode = 'idle'; unit.goal = null; }
        return;
      }
      if (unit.stepQueue.length || combat.time < (unit.wanderAt ?? 0)) return;
      unit.wanderAt = combat.time + between(settings().wanderSeconds);
      const angle = Utils.random() * Math.PI * 2, reach = Math.sqrt(Utils.random()) * roam;
      const x = Math.floor(post.x + Math.cos(angle) * reach), y = Math.floor(post.y + Math.sin(angle) * reach);
      if (!walkable(x, y)) return;
      unit.mode = 'roam';
      unit.status = 'Roaming';
      unit.stepQueue = [CityBuilder.Jobs.walkTo(x, y)];
    },

    // Då och då ett läte, men bara när spelaren ser monstret
    growl(unit) {
      const now = CityBuilder.Combat.time;
      if (unit.growlAt === undefined) unit.growlAt = now + Utils.random() * settings().growlSeconds[1];
      if (now < unit.growlAt) return;
      unit.growlAt = now + between(settings().growlSeconds);
      if (CityBuilder.Vision.visible(Players.HUMAN, unit.x, unit.y)) CityBuilder.Sound?.play(unit.definition.idleSound ?? unit.definition.attackSound, { x: unit.x, y: unit.y });
    },

    // ---- Raiden ----------------------------------------------------------------------------------

    // När och hur stor: första raidbanan alltid (firstSeconds), senare banor sällan och slumpat men bestämt av körningens frö
    planRaid() {
      const monsters = info(), raid = settings().raid;
      if (!monsters?.raid) return null;
      let at = raid.firstSeconds;
      if (monsters.raid === 'random') {
        const random = CityBuilder.Animals.randomForChunk(...RAID_SEED);
        if (random() >= raid.chance) return null;
        at = raid.window[0] + random() * (raid.window[1] - raid.window[0]);
      }
      return { at: Math.round(at), size: Math.min(raid.maxSize, raid.size + Math.floor(monsters.strength / raid.perStrength)) };
    },

    update() {
      if (!info()) return;
      if (this.plan === undefined) this.plan = this.planRaid();
      const plan = this.plan, now = CityBuilder.Levels?.seconds ?? 0;
      if (plan && !this.spawned) {
        if (!this.warned && now >= plan.at - settings().raid.warnSeconds) this.warn();
        if (now >= plan.at) this.launch(plan);
      }
      if (this.spawned && !this.over) this.follow();
    },

    warn() {
      this.warned = true;
      CityBuilder.Sound?.play('alarm');
      CityBuilder.UI?.showToast(CityBuilder.t('The ground shakes: a monster horde is gathering far away'));
    },

    // Hordens start: en plats långt från huvudlagret som ingen ser och som går att gå från till basen (annars försöks det igen nästa varv)
    launch(plan) {
      const hq = World.headquarters, spot = hq && this.spawnSpot(hq);
      if (!spot) return;
      this.spawned = true;
      for (let i = 0; i < plan.size; i++) this.addRaider('ogre', spot.x + (i % 3) * .8, spot.y + Math.floor(i / 3) * .8, null);
      CityBuilder.Sound?.play('alarm');
      CityBuilder.Sound?.play('monster_roar');
      CityBuilder.UI?.showToast(CityBuilder.t('A monster horde is marching on your base!'));
    },

    spawnSpot(hq) {
      const [near, far] = settings().raid.distance, first = Utils.random() * Math.PI * 2;
      for (let i = 0; i < 16; i++) {
        const angle = first + i * 2.4, distance = near + (far - near) * (i % 4) / 3;
        const x = Math.round(hq.x + Math.cos(angle) * distance), y = Math.round(hq.y + Math.sin(angle) * distance);
        if (!walkable(x, y) || CityBuilder.Vision.visible(Players.HUMAN, x, y)) continue;
        if (CityBuilder.Pathfinder.findPathNow(x, y, hq.x, hq.y) !== null) return { x, y };
      }
      return null;
    },

    addRaider(kind, x, y, hp) {
      const hq = World.headquarters, unit = CityBuilder.Combat.spawnSoldier(kind, x, y, Players.MONSTER);
      unit.post = { x: hq.x + .5, y: hq.y + .5 };
      if (hp != null) unit.hp = hp;
      this.raiders.push(unit);
      return unit;
    },

    // Så länge någon i hordens lever: den röda pilen på minimapen pekar mot dem. Är alla döda är raiden över.
    follow() {
      this.raiders = this.raiders.filter(unit => !unit.removed);
      if (!this.raiders.length) {
        this.over = true;
        CityBuilder.UI?.showToast(CityBuilder.t('The monster horde has been defeated'));
        return;
      }
      const alarm = CityBuilder.Combat.alarm;
      alarm.x = this.raiders.reduce((sum, unit) => sum + unit.x, 0) / this.raiders.length;
      alarm.y = this.raiders.reduce((sum, unit) => sum + unit.y, 0) / this.raiders.length;
      alarm.arrowUntil = CityBuilder.Combat.time + 1.5;
    },

    // Sparning: hordens tillstånd och levande raiders (monstren på kartan sparas som djuren, se Animals.pack)
    pack() {
      return { warned: this.warned, spawned: this.spawned, over: this.over, raiders: this.raiders.filter(unit => !unit.removed).map(unit => [unit.kind, unit.x, unit.y, unit.hp]) };
    },

    restore(data) {
      this.reset();
      if (!data) return;
      Object.assign(this, { warned: !!data.warned, spawned: !!data.spawned, over: !!data.over });
      if (!World.headquarters) return;
      for (const [kind, x, y, hp] of data.raiders || []) if (Config.units[kind]?.raider) this.addRaider(kind, x - .5, y - .5, hp);
    },
  };

  CityBuilder.Monsters = Monsters;
  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.monsters = { update(deltaSeconds) { Monsters.update(deltaSeconds); } };
})(window.CityBuilder);
