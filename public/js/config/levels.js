/* Levels on top of world generation.
   Load THIS file AFTER the world file (the one that sets CityBuilder.Config.world) and after config/buildings.js.

   - Each level has its own seed (derived from a "run-seed" + level number), so the same level = the same world.
   - UNIQUE LEVELS: every level gets a distinct combination of a theme (12 material palettes) and a SIGNATURE (12 landscape
     structures: ring lake, cliff ring, canyon, spiral ...). The combinations are dealt out from a shuffled deck, so no two
     levels in a run share one (12 x 12 = 144 combinations for 120 levels). The structure's size, direction and shape
     come from the level seed, so even the same signature looks different from run to run.
   - Rarity: medium, rare, and epic resources become scarcer the higher the level (sawtooth over chapters of 10 levels).
   - Special levels: every 7th is a Wealth Level (breathing pause), every 10th a Trial, every 25th a Guardian level.
     Levels 20+ get a twist (e.g. Iron Scarcity), 60+ get two.
   - UNLOCKS: buildings are unlocked level by level (UNLOCK below). Locked buildings stay visible but greyed out.
   - GOALS: every level has its own goals (build X, store Y) built from what is unlocked and what the map can supply.
     Finish them all to complete the level. Faster = more stars.
   - Starting area riches (rule 6 in the world file) are never depleted, so every level can always start.
   - Unlimited: after level 120 it continues, with maximum difficulty. */
(function (CityBuilder) {
  'use strict';

  const world = CityBuilder.Config.world;
  const t = (text, variables) => CityBuilder.t(text, variables); // names and tags are translated when read (see lang.js)
  const baseRules = world.rules.slice();
  const MAX_LEVELS = 120;
  const MISSION_START = 16;     // levels 1-15 train for combat, from here the goals are attack missions
  const ELIMINATE_START = 26;   // from here the rival's base must be destroyed
  const CHAPTER = 10;
  const LEVEL_KEY = 'citybuilder.level';
  const RUN_KEY = 'citybuilder.runSeed';
  const PROGRESS_KEY = 'citybuilder.progress';

  /* ---------- Helpers ---------- */
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const stretch = (v, f) => clamp01((v - 0.5) * f + 0.5);
  const mix = (a, b) => {
    let h = (a ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (b >>> 0), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  };
  const frac = (a, b) => mix(a, b) / 4294967296;
  const store = {
    get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { window.localStorage.setItem(key, String(value)); } catch (e) { /* ignore */ } },
  };

  // Noise and randomness per cell (c = wrapper context)
  const N = (c, scale, channel) => c.fractalNoise(c.x / scale, c.y / scale, channel);
  const R = (c, channel) => c.hash(c.x, c.y, channel + world.seed * 131);
  // Fast spot in a grid cell: { x, y, roll } or null
  const site = (c, cell, salt, chance) => {
    const cx = Math.floor(c.x / cell), cy = Math.floor(c.y / cell);
    const h = k => c.hash(cx, cy, salt + k + world.seed * 131);
    if (h(0) >= chance) return null;
    return { x: cx * cell + 6 + Math.floor(h(1) * (cell - 12)), y: cy * cell + 6 + Math.floor(h(2) * (cell - 12)), roll: h(3) };
  };

  /* ---------- Unlocks: from which level a building can be built ---------- */
  // Buildings that are not listed are available from level 1.
  const UNLOCK = {
    woodcutter: 1, quarry: 1, sawmill: 1, warehouse: 1,
    berry_gatherer: 2, well: 2,
    hunters_cottage: 3, herb_gatherer: 3,
    charcoal_burner: 4, clay_pit: 4,
    farm: 5, fishing_hut: 5,
    mill: 6, brickworks: 6,
    apple_gatherer: 7, mushroom_gatherer: 7, sand_collector: 7,
    bakery: 8,
    coal_mine: 9, leatherworker: 9,
    large_warehouse: 10, limestone_quarry: 10, bowyer: 10, guard_tower: 10, wall: 9,
    stables: 11,
    iron_mine: 12, iron_smelter: 13,
    axesmith: 14, picksmith: 14, hammersmith: 15, scythesmith: 15,
    swordsmith: 14, garrison: 15, armorsmith: 17,
    copper_mine: 18, tin_mine: 18, copper_smelter: 20, tin_smelter: 20,
    bronze_foundry: 22, rock_crusher: 22,
    salt_mine: 25, sulfur_mine: 25,
    great_depot: 28,
    silver_mine: 32, gold_mine: 36,
    gemstone_mine: 40, crystal_gatherer: 40,
    moonstone_gatherer: 45, fallen_star_collector: 50, relic_hunter: 55,
    monument: 55,
  };
  const unlockLevelOf = id => UNLOCK[id] ?? 1;

  /* ---------- Rarity ---------- */
  const TIERS = {
    iron_ore: 'medium', coal: 'medium', limestone: 'medium', copper_ore: 'medium', tin_ore: 'medium',
    salt_ore: 'medium', petrified_wood: 'medium',
    silver_ore: 'rare', sulfur: 'rare', tar_pit: 'rare', crystal: 'rare',
    gold_ore: 'epic', gemstone: 'epic', moonstone: 'epic', fallen_star: 'epic', ancient_altar: 'epic',
  };
  // Proportion remaining at maximum difficulty
  const FLOOR = { medium: 0.4, rare: 0.15, epic: 0.05 };

  /* ---------- Twists (from level 20) ---------- */
  const TWISTS = [
    { id: 'wood', name: 'Treestorm', keep: { tree: 0.45, apple_tree: 0.6 } },
    { id: 'iron', name: 'Iron Scarcity', keep: { iron_ore: 0.35 } },
    { id: 'stone', name: 'Stone Scarcity', keep: { rock: 0.4, limestone: 0.5 } },
    { id: 'food', name: 'Famine', keep: { berry_bush: 0.35, herbs: 0.35, mushrooms: 0.4, apple_tree: 0.3 } },
    { id: 'coal', name: 'Coal Scarcity', keep: { coal: 0.35 } },
    { id: 'clay', name: 'Drought', keep: { clay: 0.3 } },
  ];

  /* ---------- Themes (material palettes) ---------- */
  const THEMES = [
    { id: 'valleys', noun: 'Valley', keep: {}, extras: [] },
    { id: 'forest', noun: 'Old forest', keep: { berry_bush: 0.5 }, extras: [
      c => (stretch(N(c, 38, 501), 2.2) > 0.62 && R(c, 502) < 0.8 ? 'tree' : undefined),
    ] },
    { id: 'barren', noun: 'Stone desert', keep: { tree: 0.25 }, extras: [
      c => (N(c, 14, 510) > 0.58 && R(c, 511) < 0.5 ? 'rock' : undefined),
      c => (stretch(N(c, 30, 512), 2.2) > 0.7 && R(c, 513) < 0.8 ? 'sand' : undefined),
    ] },
    { id: 'swamp', noun: 'Swamp', keep: {}, extras: [
      c => {
        if (stretch(N(c, 26, 520), 2.4) < 0.6) return undefined;
        if (N(c, 5, 521) > 0.72) return 'water';
        return R(c, 522) < 0.8 ? 'bog' : undefined;
      },
      c => (N(c, 8, 523) > 0.6 && R(c, 524) < 0.3 ? 'mushrooms' : undefined),
    ] },
    { id: 'archipelago', noun: 'Archipelago', keep: {}, extras: [
      c => {
        const lake = stretch(N(c, 24, 530), 2.2);
        if (lake > 0.66) return 'water';
        if (lake > 0.6 && R(c, 531) < 0.7) return 'sand';
      },
    ] },
    { id: 'crag', noun: 'Crag', keep: { tree: 0.6 }, extras: [
      c => (N(c, 20, 540) > 0.56 && R(c, 541) < 0.6 ? 'rock' : undefined),
      c => (N(c, 70, 542) > 0.6 && N(c, 9, 543) > 0.7 && R(c, 544) < 0.7 ? 'iron_ore' : undefined),
    ] },
    { id: 'cursed', noun: 'Cursed land', keep: {}, extras: [
      c => (N(c, 18, 550) > 0.62 && R(c, 551) < 0.5 ? 'cursed_ground' : undefined),
      c => (N(c, 8, 552) > 0.62 && R(c, 553) < 0.3 ? 'mushrooms' : undefined),
    ] },
    { id: 'ruined', noun: 'Ruin', keep: {}, extras: [
      c => (N(c, 10, 560) > 0.62 && R(c, 561) < 0.3 ? 'ruins' : undefined),
      c => {
        const s = site(c, 60, 562, 0.5);
        if (!s) return undefined;
        const dx = c.x - s.x, dy = c.y - s.y;
        return Math.abs(dx) <= 4 && Math.abs(dy) <= 3 && dx % 2 === 0 && dy % 2 === 0 ? 'grave' : undefined;
      },
    ] },
    { id: 'meteor', noun: 'Meteor shower', keep: {}, extras: [
      c => {
        const s = site(c, 36, 600, 0.6);
        if (!s) return undefined;
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        if (d < 0.5) return s.roll < 0.35 ? 'fallen_star' : 'meteor_crater'; // many craters are empty
        if (d < 2.6 && R(c, 605) < 0.9) return 'meteor_crater';
      },
    ] },
    { id: 'orchard', noun: 'Orchard', keep: {}, extras: [
      c => (N(c, 26, 570) > 0.55 && R(c, 571) < 0.22 ? 'apple_tree' : undefined),
      c => (N(c, 9, 572) > 0.55 && R(c, 573) < 0.4 ? 'herbs' : undefined),
      c => (N(c, 9, 574) > 0.58 && R(c, 575) < 0.3 ? 'berry_bush' : undefined),
    ] },
    { id: 'clay', noun: 'Clay plain', keep: {}, extras: [
      c => (N(c, 14, 580) > 0.6 && R(c, 581) < 0.6 ? 'clay' : undefined),
      c => (N(c, 16, 582) > 0.64 && R(c, 583) < 0.5 ? 'limestone' : undefined),
    ] },
    { id: 'drought', noun: 'Drought', keep: { tree: 0.2, berry_bush: 0.3 }, extras: [
      c => (N(c, 12, 590) > 0.68 && R(c, 591) < 0.6 ? 'salt_ore' : undefined),
      c => (N(c, 9, 592) > 0.7 && R(c, 593) < 0.3 ? 'petrified_wood' : undefined),
      c => (stretch(N(c, 30, 594), 2.2) > 0.68 && R(c, 595) < 0.8 ? 'sand' : undefined),
    ] },
  ];

  /* ---------- Signatures (landscape structures) ----------
     early(c, p): runs right after natural water, only 42+ tiles from the start (can overwrite almost anything).
     near(c, p):  runs after ore and rock (starting riches are safe), from 12 tiles out, so it shapes the start area.
     p = { rot (radians), a, b, c (0..1) } come from the level seed. */
  const TAU = Math.PI * 2;
  const angleOf = c => Math.atan2(c.y, c.x);
  const angleDiff = (a, b) => { const d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };
  // True where a ring has an opening (count openings, half-width in tiles)
  const inGap = (c, p, count, halfWidth) => {
    const r = Math.max(1, c.distanceFromOrigin), a = angleOf(c);
    for (let i = 0; i < count; i++) if (angleDiff(a, p.rot + i * TAU / count) * r < halfWidth) return true;
    return false;
  };
  // Along/across coordinates of a line through the origin with direction p.rot
  const alongAcross = (c, p) => {
    const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
    return { along: c.x * cos + c.y * sin, across: -c.x * sin + c.y * cos };
  };

  const SIGNATURES = [
    { id: 'moat', name: 'Ring lake',            // a lake ring around the start with fords
      early(c, p) {
        const radius = 50 + 14 * p.a, width = 3.2 + 2.2 * p.b, d = c.distanceFromOrigin;
        if (Math.abs(d - radius) > width / 2 + (N(c, 7, 701) - 0.5) * 1.5) return undefined;
        return inGap(c, p, 2 + (p.c > 0.5 ? 1 : 0), 4.5) ? 'sand' : 'water';
      } },
    { id: 'cliffs', name: 'Cliff ring',          // a wall of boulders with a few passes
      early(c, p) {
        const radius = 46 + 16 * p.a, width = 4 + 3 * p.b, d = c.distanceFromOrigin;
        if (Math.abs(d - radius) > width / 2 + (N(c, 6, 711) - 0.5) * 1.6) return undefined;
        if (inGap(c, p, 2 + (p.c > 0.6 ? 1 : 0), 5)) return undefined;
        return R(c, 712) < 0.93 ? 'rock' : undefined;
      } },
    { id: 'river', name: 'River crossing',      // a river with fords, crossing the start area
      near(c, p) {
        const { along, across } = alongAcross(c, p);
        const offset = 24 + 9 * p.a + 4.5 * Math.sin(along / (12 + 8 * p.b) + p.c * 6);
        const half = 1.5 + p.c;
        if (Math.abs(across - offset) > half) return undefined;
        return (((along % 38) + 38) % 38) < 5 ? 'sand' : 'water';
      } },
    { id: 'lake', name: 'Great lake',            // a big lake with a sandy beach
      near(c, p) {
        const distance = 34 + 10 * p.a, radius = 9 + 8 * p.b;
        const dx = c.x - Math.cos(p.rot) * distance, dy = c.y - Math.sin(p.rot) * distance;
        const d = Math.hypot(dx, dy) + (N(c, 7, 721) - 0.5) * 5;
        if (d < radius) return 'water';
        if (d < radius + 2.2 && R(c, 722) < 0.75) return 'sand';
      } },
    { id: 'woodring', name: 'Forest ring',      // a dense forest belt around the start
      near(c, p) {
        const inner = 20 + 6 * p.a, outer = inner + 9 + 7 * p.b, d = c.distanceFromOrigin;
        if (d < inner || d > outer) return undefined;
        const density = stretch(N(c, 8, 731), 2.2);
        return density > 0.3 + 0.2 * p.c && R(c, 732) < 0.9 ? 'tree' : undefined;
      } },
    { id: 'canyon', name: 'Canyon',              // two cliff walls: the start lies in a corridor
      near(c, p) {
        const { along, across } = alongAcross(c, p);
        const half = 14 + 6 * p.a;
        if (Math.abs(Math.abs(across) - half) > 2.2 + 1.5 * p.b || Math.abs(along) > 95) return undefined;
        if (((along % 44) + 44) % 44 < 7) return undefined; // passes through the walls
        return R(c, 741) < 0.94 ? 'rock' : undefined;
      } },
    { id: 'spiral', name: 'Tree spiral',         // trees grow in a spiral arm
      near(c, p) {
        const d = c.distanceFromOrigin;
        if (d < 14 || d > 100) return undefined;
        const period = 10 + 4 * p.a;
        const phase = ((d / period - (angleOf(c) - p.rot) / TAU) % 1 + 1) % 1;
        return phase < 0.2 + 0.1 * p.b && R(c, 751) < 0.92 ? 'tree' : undefined;
      } },
    { id: 'ponds', name: 'Pond country',         // lots of small ponds
      near(c, p) {
        if (c.distanceFromOrigin < 16) return undefined;
        const s = site(c, 20 + Math.floor(p.a * 8), 760, 0.8);
        if (!s) return undefined;
        const d = Math.hypot(c.x - s.x, c.y - s.y), radius = 2 + 3.2 * s.roll + p.b;
        if (d < radius) return 'water';
        if (d < radius + 1.6 && R(c, 761) < 0.6) return 'sand';
      } },
    { id: 'boulders', name: 'Boulder field',     // a wedge of rocks: stone for everyone, but the way is blocked
      near(c, p) {
        const d = c.distanceFromOrigin;
        if (d < 26 || d > 85) return undefined;
        const width = (0.38 + 0.2 * p.a) * Math.PI;
        if (angleDiff(angleOf(c), p.rot) > width) return undefined;
        return N(c, 11, 771) > 0.34 && R(c, 772) < 0.8 ? 'rock' : undefined;
      } },
    { id: 'orebelt', name: 'Ore belt',            // a belt of ore clusters in an arc
      early(c, p) {
        const radius = 54 + 8 * p.a, d = c.distanceFromOrigin;
        if (Math.abs(d - radius) > 6 || angleDiff(angleOf(c), p.rot) > (0.45 + 0.25 * p.b) * Math.PI) return undefined;
        if (N(c, 6, 781) < 0.5 || R(c, 782) > 0.8) return undefined;
        const kind = N(c, 38, 783);
        return kind < 0.34 ? 'iron_ore' : kind < 0.67 ? 'coal' : (p.c < 0.5 ? 'copper_ore' : 'tin_ore');
      } },
    { id: 'circle', name: 'Sacred circle',        // a ring of ruins with an altar farther out
      early(c, p) {
        const radius = 46 + 6 * p.a, d = c.distanceFromOrigin, angle = angleOf(c);
        const altarX = Math.cos(p.rot) * (62 + 14 * p.b), altarY = Math.sin(p.rot) * (62 + 14 * p.b);
        const altar = Math.hypot(c.x - altarX, c.y - altarY);
        if (altar < 0.5) return 'ancient_altar';
        if (altar < 4.5 && altar > 2 && R(c, 791) < 0.6) return 'ruins';
        if (Math.abs(d - radius) < 2.4) {
          const slot = ((angle / TAU * 14) % 1 + 1) % 1; // 14 pillars
          return slot < 0.3 && R(c, 792) < 0.9 ? 'ruins' : undefined;
        }
      } },
    { id: 'craters', name: 'Crater trail',        // a line of craters with fallen stars
      early(c, p) {
        const { along, across } = alongAcross(c, p);
        if (along < 44 || along > 130) return undefined;
        const step = 15 + 5 * p.a, index = Math.round((along - 44) / step), centerAlong = 44 + index * step;
        const centerAcross = 5 * Math.sin(index * 1.7 + p.c * 6);
        const d = Math.hypot(along - centerAlong, across - centerAcross);
        if (d < 0.5) return index % 3 === 0 ? 'fallen_star' : 'meteor_crater';
        if (d < 2.4 + 1.4 * p.b && R(c, 801) < 0.92) return 'meteor_crater';
      } },
  ];

  // Distinct (theme, signature) combinations dealt from a shuffled deck: no two levels in a run look the same.
  // Consecutive levels never share a theme or a signature.
  const deckCache = { seed: null, order: null };
  const deck = () => {
    if (deckCache.seed === runSeed) return deckCache.order;
    const order = Array.from({ length: THEMES.length * SIGNATURES.length }, (_, i) => i);
    const key = i => mix(runSeed, i * 2654435761 + 17);
    order.sort((a, b) => key(a) - key(b));
    const same = (a, b) => a % THEMES.length === b % THEMES.length || Math.floor(a / THEMES.length) === Math.floor(b / THEMES.length);
    for (let i = 1; i < order.length; i++) {
      if (!same(order[i - 1], order[i])) continue;
      for (let j = i + 1; j < order.length; j++) {
        if (!same(order[i - 1], order[j]) && (i + 1 >= order.length || !same(order[j], order[i + 1]))) {
          [order[i], order[j]] = [order[j], order[i]];
          break;
        }
      }
    }
    deckCache.seed = runSeed; deckCache.order = order;
    return order;
  };

  const ADJECTIVES = ['Crooked', 'Golden', 'Forgotten', 'Windswept', 'Dark', 'Still', 'Lost', 'Hard',
    'Ancient', 'Wild', 'Frostbitten', 'Secret', 'Rusty', 'Lonely', 'Mighty', 'Enchanted'];

  /* ---------- Goals ---------- */
  // Militära resurser (vapen, rustningar, hästar) går åt till soldater och ingår inte i banmålen
  const SKIP_GOAL_RESOURCES = new Set(['water', 'seeds', 'straw', 'bone', 'animal', 'ash', 'cursed_ash', 'coins',
    'sword', 'bow', 'leather_armor', 'iron_armor', 'horse']);

  const outputsOf = definition => {
    const job = definition.job;
    if (!job) return [];
    return [job.outputResource, ...Object.keys(job.outputs || {})].filter(Boolean);
  };

  // Resources the map can supply at this level (unlocked buildings + enough terrain left after scarcity)
  const viableResources = (level, keep) => {
    const buildings = Object.entries(CityBuilder.Config.buildings)
      .filter(([id, definition]) => definition.job && unlockLevelOf(id) <= level);
    const have = new Set();
    for (let changed = true; changed;) {
      changed = false;
      for (const [, definition] of buildings) {
        const job = definition.job;
        const ok = job.kind === 'gather'
          ? !!job.sourceUnit || job.sourceTerrain === 'water' || (keep[job.sourceTerrain] ?? 1) >= 0.2
          : Object.keys(job.inputs || {}).every(resourceId => have.has(resourceId));
        if (!ok) continue;
        for (const resourceId of outputsOf(definition)) if (!have.has(resourceId)) { have.add(resourceId); changed = true; }
      }
    }
    return have;
  };

  const storageFactor = resourceId => (CityBuilder.Economy && CityBuilder.Economy.factorOf ? CityBuilder.Economy.factorOf(resourceId) : 1);

  // Rough seconds to make one unit of a resource with the cheapest unlocked producer (work time + walking, inputs included)
  const unitSeconds = (resourceId, level, guard = []) => {
    if (guard.includes(resourceId)) return 60;
    let best = Infinity;
    for (const [id, definition] of Object.entries(CityBuilder.Config.buildings)) {
      const job = definition.job;
      if (!job || unlockLevelOf(id) > level) continue;
      const amount = job.outputs?.[resourceId] ?? (job.outputResource === resourceId ? 1 : 0);
      if (!amount) continue;
      let seconds = ((job.kind === 'gather' ? job.workSeconds || job.craftSeconds || 6 : job.craftSeconds || 10) + 8) / amount;
      for (const [input, count] of Object.entries(job.inputs || {})) seconds += count * unitSeconds(input, level, [...guard, resourceId]) / amount;
      best = Math.min(best, seconds);
    }
    return best === Infinity ? 60 : best;
  };

  const MILITARY_SECONDS = { soldiers: 60, kills: 25, destroy: 150, eliminate: 900 };   // rough par time per unit of a military goal

  // Par time: what a decent player needs. Grows with the goals (stock amounts, chain depth, number of buildings) and the level.
  const parSeconds = (items, level) => {
    const workers = 2 + Math.floor(level / 10);   // producers a player typically runs at once
    let seconds = 240 + 6 * level;
    for (const item of items) {
      if (item.type === 'build') seconds += item.amount * ((CityBuilder.Config.buildings[item.id].buildDuration || 5) + 40);
      else if (MILITARY_SECONDS[item.type]) seconds += item.amount * MILITARY_SECONDS[item.type];
      else seconds += item.amount * unitSeconds(item.resource, level) / workers;
    }
    return Math.round(seconds / 10) * 10;
  };

  // Military goals (types 'soldiers', 'kills', 'destroy', 'eliminate'; see evaluate)
  const TRAINING_ARMY = [2, 3, 4, 6, 8, 10];                       // soldiers wanted on levels 10-15
  const TARGET_BUILDINGS = ['woodcutter', 'sawmill', 'quarry', 'warehouse', 'guard_tower'];   // what the rival always builds
  const militaryGoals = (level, rand) => {
    const items = [];
    if (level >= 10 && level < MISSION_START) items.push({ key: 'm:soldiers', type: 'soldiers', amount: TRAINING_ARMY[level - 10] });
    if (level === MISSION_START - 1) items.push({ key: 'm:destroy:any', type: 'destroy', id: 'any', amount: 1 });
    if (level >= MISSION_START && level < ELIMINATE_START) {
      const first = TARGET_BUILDINGS[Math.floor(rand(60) * TARGET_BUILDINGS.length)];
      const second = TARGET_BUILDINGS[(TARGET_BUILDINGS.indexOf(first) + 1 + Math.floor(rand(61) * (TARGET_BUILDINGS.length - 1))) % TARGET_BUILDINGS.length];
      const amount = 1 + Math.floor((level - MISSION_START) / 4);
      items.push({ key: 'm:kills', type: 'kills', amount: 6 + 2 * (level - MISSION_START) });
      items.push({ key: 'm:destroy:' + first, type: 'destroy', id: first, amount });
      if (level >= MISSION_START + 3) items.push({ key: 'm:destroy:' + second, type: 'destroy', id: second, amount });
      if (level >= MISSION_START + 5) items.push({ key: 'm:destroy:any', type: 'destroy', id: 'any', amount: 3 + (level - MISSION_START - 5) });
    }
    if (level >= ELIMINATE_START) items.push({ key: 'm:eliminate', type: 'eliminate', amount: 1 });
    return items;
  };

  // A level's goals: { items: [{ key, type: 'build'|'stock', id|resource, amount }], par (seconds) }
  const makeGoals = info => {
    const level = info.level, buildings = CityBuilder.Config.buildings;
    const rand = k => frac(info.seed, 9000 + k);
    const pick = (list, k) => list[Math.floor(rand(k) * list.length) % list.length];
    const items = [];
    const viable = viableResources(level, info.keep);
    const add = item => { if (!items.some(existing => existing.key === item.key)) items.push(item); };

    // Goals are about RESOURCES, not about specific buildings: the player works out which buildings (and which
    // earlier links in the chain, e.g. a farm before a mill) are needed.
    const pool = [...viable].filter(id => !SKIP_GOAL_RESOURCES.has(id) && Object.hasOwn(CityBuilder.Config.resources, id)).sort();
    const usable = id => pool.includes(id);

    // 1. What the new buildings make (teaches them); at most two
    const fresh = [];
    for (const id of Object.keys(buildings)) {
      if (!buildings[id].job || buildings[id].isWinBuilding || unlockLevelOf(id) !== level) continue;
      const output = outputsOf(buildings[id]).find(usable);
      if (output && !fresh.includes(output)) fresh.push(output);
    }

    // 2. Newer outputs (last 5 levels), then anything the map can supply
    const recent = new Set();
    for (const id of Object.keys(buildings)) {
      const unlock = unlockLevelOf(id);
      if (buildings[id].job && unlock <= level && unlock > level - 5) outputsOf(buildings[id]).forEach(resourceId => recent.add(resourceId));
    }
    const recentPool = pool.filter(id => recent.has(id));

    const stockCount = 3 + (level >= 10 ? 1 : 0) + (level >= 30 ? 1 : 0);
    const scale = info.trial ? 1.4 : info.bounty ? 0.6 : 1;
    const addStock = resource => {
      const factor = storageFactor(resource);
      const amount = Math.max(3, Math.min(Math.round((12 + level * 1.6) * factor * scale), Math.floor(300 * factor)));
      add({ key: 's:' + resource, type: 'stock', resource, amount });
    };
    fresh.slice(0, 2).forEach(addStock);
    for (let attempt = 0; items.length < stockCount && attempt < stockCount * 6 && pool.length; attempt++) {
      const source = attempt < 2 && recentPool.length ? recentPool : pool;
      addStock(pick(source, 30 + attempt));
    }

    // 3. Late trials: build the monument (the only building goal)
    if (info.trial && level >= 60 && buildings.monument) add({ key: 'b:monument', type: 'build', id: 'monument', amount: 1 });

    // 4. Military. 1-15: practice for fighting a rival (an army, later a first strike). 16-25: only attack missions.
    // From 26 the economy goals stay and the rival must be wiped out. (Destroying the rival's base always wins at once.)
    const military = militaryGoals(level, rand);
    if (level >= MISSION_START && level < ELIMINATE_START) items.length = 0;
    military.forEach(add);

    return { items, par: parSeconds(items, level) };
  };

  /* ---------- Level Data ---------- */
  const clampLevel = n => Math.max(1, Math.floor(Number(n)) || 1);
  let runSeed = Number(store.get(RUN_KEY));
  if (!Number.isFinite(runSeed) || runSeed <= 0) { runSeed = world.seed; store.set(RUN_KEY, runSeed); }

  const levelInfo = rawLevel => {
    const level = clampLevel(rawLevel);
    // Level 1 is the gentle introduction: valleys, no structure. After that every level draws a new combination.
    const card = level === 1 ? null : deck()[(level - 2) % deck().length];
    const theme = card === null ? THEMES[0] : THEMES[card % THEMES.length];
    const signatureDef = card === null ? null : SIGNATURES[Math.floor(card / THEMES.length) % SIGNATURES.length];
    const trial = level % 10 === 0;
    const bounty = !trial && level % 7 === 0;
    const guardian = level % 25 === 0;
    const seed = mix(runSeed, level * 7919 + 13) % 1000000;

    // Difficulty 0..1 (sawtooth over chapters)
    const progress = Math.min(1, (level - 1) / (MAX_LEVELS - 1));
    const chapterPos = ((level - 1) % CHAPTER) / (CHAPTER - 1);
    let difficulty = progress * (0.7 + 0.3 * chapterPos);
    if (bounty) difficulty *= 0.25;
    if (trial) difficulty = difficulty * 1.2 + 0.15;
    if (guardian) difficulty += 0.1;
    difficulty = clamp01(difficulty);

    // Twists
    const twists = [];
    const twistCount = level >= 60 ? 2 : level >= 20 ? 1 : 0;
    for (let i = 0; i < twistCount; i++) {
      let index = mix(level, 11 + i) % TWISTS.length;
      while (twists.includes(TWISTS[index])) index = (index + 1) % TWISTS.length;
      twists.push(TWISTS[index]);
    }

    // Proportion of each terrain type that remains
    const keep = {};
    for (const [terrain, tier] of Object.entries(TIERS)) keep[terrain] = Math.pow(FLOOR[tier], difficulty);
    const apply = table => { for (const [k, v] of Object.entries(table)) keep[k] = (keep[k] === undefined ? 1 : keep[k]) * v; };
    apply(theme.keep);
    twists.forEach(twist => apply(twist.keep));

    const adjective = ADJECTIVES[mix(level, 3) % ADJECTIVES.length];
    const tagKeys = [];
    if (bounty) tagKeys.push('Wealth level');
    if (trial) tagKeys.push('Trial');
    if (guardian) tagKeys.push('Guardian level');
    if (signatureDef) tagKeys.push(signatureDef.name);
    twists.forEach(twist => tagKeys.push(twist.name));

    const nameOf = () => {
      const noun = CityBuilder.I18n.language === 'de' ? t(theme.noun) : t(theme.noun).toLowerCase();
      let name = level === 1 ? t('New Settler Land') : CityBuilder.I18n.named(adjective, theme.noun);
      if (level === 100) name = t('End of the World');
      else if (guardian) name = t('Guardian of the {theme}', { theme: noun });
      else if (trial) name = t('The Trial: {name}', { name });
      else if (bounty) name = t('The Treasure Chamber: {name}', { name });
      return name;
    };

    let goals = null;
    const info = {
      level,
      get name() { return nameOf(); },
      theme: theme.id,
      themeObject: theme,
      signature: signatureDef && {
        id: signatureDef.id,
        def: signatureDef,
        params: { rot: frac(seed, 21) * TAU, a: frac(seed, 22), b: frac(seed, 23), c: frac(seed, 24) },
      },
      get tags() { return tagKeys.map(key => t(key)); },
      trial, bounty, guardian,
      difficulty,
      rivals: 1,   // antal datorspelare (minst en per bana)
      seed,
      keep,
      twists,
      // Buildings that become available on this level
      get unlocks() { return Object.keys(CityBuilder.Config.buildings).filter(id => unlockLevelOf(id) === level && id !== 'hq' && !CityBuilder.Config.buildings[id].hiddenInMenu); },
      // Goals are built on first use, when all configs are loaded
      get goal() { return goals || (goals = makeGoals(info)); },
      blurb: `${theme.noun}${signatureDef ? ' / ' + signatureDef.name : ''}. Gold ${Math.round(keep.gold_ore * 100)}%, Gemstone ${Math.round(keep.gemstone * 100)}%, Iron ${Math.round(keep.iron_ore * 100)}% of normal amount.` +
        (tagKeys.length ? ' ' + tagKeys.join(', ') + '.' : ''),
    };
    return info;
  };

  /* ---------- Coupling to World Generation ---------- */
  const state = { info: levelInfo(1) };
  const offset = { x: 0, y: 0 };

  // Shifts the noise per seed, so that even the landscape shape (not just randomness) differs between levels
  const Utils = CityBuilder.Utils;
  if (Utils && Utils.smoothNoise && !Utils.smoothNoise.__levels) {
    const original = Utils.smoothNoise;
    const shifted = (u, v, ...rest) => original.call(Utils, u + offset.x, v + offset.y, ...rest);
    shifted.__levels = true;
    Utils.smoothNoise = shifted;
  }
  const wrappers = new WeakMap(); // a wrapper per cell, so that the world file's landscape cache continues to work
  const seeded = c => {
    let w = wrappers.get(c);
    if (!w) {
      w = Object.create(c);
      w.fractalNoise = (u, v, ...rest) => c.fractalNoise(u + offset.x, v + offset.y, ...rest);
      wrappers.set(c, w);
    }
    return w;
  };

  const wrapRule = (rule, index) => context => {
    const c = seeded(context);
    const terrain = rule(c);
    // rule 0 (water) and 5 (starting riches) are never depleted
    if (terrain === undefined || index === 0 || index === 5) return terrain;
    const k = state.info.keep[terrain];
    if (k === undefined || k >= 1) return terrain;
    return c.hash(c.x, c.y, 9100 + world.seed * 131) < k ? terrain : undefined;
  };

  const themeRule = context => {
    if (context.distanceFromOrigin < 42) return undefined; // never at the start
    const c = seeded(context);
    for (const extra of state.info.themeObject.extras) {
      const terrain = extra(c);
      if (terrain) return terrain;
    }
  };

  // Signature structures: "early" can overwrite almost anything but never touches the start (42 tiles);
  // "near" fills what ore and rock left free, and shapes the start area from 12 tiles out.
  const signatureEarly = c => {
    const signature = state.info.signature;
    if (!signature || !signature.def.early || c.distanceFromOrigin < 42) return undefined;
    return signature.def.early(c, signature.params);
  };
  const signatureNear = c => {
    const signature = state.info.signature;
    if (!signature || !signature.def.near || c.distanceFromOrigin < 12) return undefined;
    return signature.def.near(c, signature.params);
  };

  const wrapped = baseRules.map(wrapRule);
  wrapped.splice(18, 0, themeRule);                      // after ore and rock, before lowlands stone blocks, forest and berry bushes
  wrapped.splice(18, 0, wrapRule(signatureNear, 99));    // structures win over the theme's scatter
  wrapped.splice(1, 0, wrapRule(signatureEarly, 99));    // right after natural water
  world.rules = wrapped;

  /* ---------- Goal progress ---------- */
  const Economy = () => CityBuilder.Economy;
  const progress = { run: null, level: null, latched: {}, seconds: 0, complete: false, stars: 0, kills: 0, destroyed: {}, won: false };
  const completeListeners = [];
  let checkTimer = 0, saveTimer = 0;

  const loadProgress = () => {
    let saved = null;
    try { saved = JSON.parse(store.get(PROGRESS_KEY)); } catch (e) { /* ignore */ }
    const same = saved && saved.run === runSeed && saved.level === state.info.level;
    Object.assign(progress, { run: runSeed, level: state.info.level, latched: same ? saved.latched || {} : {}, seconds: same ? saved.seconds || 0 : 0, complete: same ? !!saved.complete : false, stars: same ? saved.stars || 0 : 0, kills: same ? saved.kills || 0 : 0, destroyed: same ? saved.destroyed || {} : {}, won: same ? !!saved.won : false });
  };
  const resetProgress = () => Object.assign(progress, { latched: {}, seconds: 0, complete: false, stars: 0, kills: 0, destroyed: {}, won: false });
  const saveProgress = () => store.set(PROGRESS_KEY, JSON.stringify(progress));

  const countBuilt = id => {
    const definition = CityBuilder.Config.buildings[id];
    let count = 0;
    for (const building of CityBuilder.World.buildings) {
      if (building.player === CityBuilder.Players.HUMAN && building.definition === definition && building.buildProgress >= 1) count++;
    }
    return count;
  };

  // How far a goal has come
  const haveOf = item => {
    switch (item.type) {
      case 'build': return countBuilt(item.id);
      case 'soldiers': return CityBuilder.Garrison.soldiersOf(CityBuilder.Players.HUMAN);
      case 'kills': return progress.kills;
      case 'destroy': return progress.destroyed[item.id] || 0;
      case 'eliminate': return progress.won ? 1 : 0;
      default: return Economy() ? Economy().totalAmount(item.resource) : 0;
    }
  };

  // [{ ...item, have, done }] for the current level
  const evaluate = () => state.info.goal.items.map(item => {
    const have = haveOf(item);
    if (have >= item.amount) progress.latched[item.key] = true;
    return { ...item, have: Math.min(have, item.amount), done: !!progress.latched[item.key] };
  });

  const starsFor = seconds => { const par = state.info.goal.par; return 1 + (seconds <= par ? 1 : 0) + (seconds <= par * 0.6 ? 1 : 0); };

  const Systems = CityBuilder.Systems = CityBuilder.Systems || {};
  Systems.levels = {
    update(deltaSeconds) {
      if (!progress.complete) progress.seconds += deltaSeconds;
      checkTimer += deltaSeconds; saveTimer += deltaSeconds;
      if (checkTimer >= 1) {
        checkTimer = 0;
        if (!progress.complete && (progress.won || evaluate().every(item => item.done))) {
          progress.complete = true;
          progress.stars = starsFor(progress.seconds);
          saveProgress();
          completeListeners.forEach(fn => { try { fn(Levels.result()); } catch (e) { console.error(e); } });
        }
      }
      if (saveTimer >= 5) { saveTimer = 0; saveProgress(); }
    },
  };

  /* ---------- Public API ---------- */
  const listeners = [];
  const setLevel = (n, silent) => {
    const info = levelInfo(n);
    state.info = info;
    world.seed = info.seed;
    offset.x = frac(info.seed, 1) * 4000;
    offset.y = frac(info.seed, 2) * 4000;
    store.set(LEVEL_KEY, info.level);
    loadProgress();
    if (!silent) {
      listeners.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } });
      try { window.dispatchEvent(new CustomEvent('citybuilder:levelchange', { detail: info })); } catch (e) { /* ignore */ }
    }
    return info;
  };

  const registerSystem = () => {
    const order = CityBuilder.Config.settings && CityBuilder.Config.settings.systemOrder;
    if (order && !order.includes('levels')) order.push('levels');
  };

  const Levels = CityBuilder.Levels = {
    MAX_LEVELS,
    get current() { return state.info; },
    info: levelInfo,
    list: (count = MAX_LEVELS) => Array.from({ length: count }, (_, i) => levelInfo(i + 1)),
    // Silent start: reads saved level (level 1 if nothing is saved), sets seed and offset. Called before World.init().
    start: () => { registerSystem(); return setLevel(clampLevel(store.get(LEVEL_KEY)), true); },
    get runSeed() { return runSeed; },
    // Restores level and run-seed from a save (silent, before world generation)
    restore: (level, seed) => {
      if (Number.isFinite(seed) && seed > 0) { runSeed = seed; store.set(RUN_KEY, runSeed); }
      return setLevel(level, true);
    },
    set: n => setLevel(n),
    next: () => setLevel(state.info.level + 1),
    prev: () => setLevel(state.info.level - 1),
    // New round: new run-seed generates completely new levels, starts at level 1
    newRun: (seed) => {
      runSeed = Number.isFinite(seed) ? seed : Math.floor(Math.random() * 1000000) + 1;
      store.set(RUN_KEY, runSeed);
      resetProgress();
      return setLevel(1);
    },
    // Call e.g., CityBuilder.Levels.onChange(info => regenerate world)
    onChange: fn => { listeners.push(fn); },

    // Unlocks
    unlockLevel: unlockLevelOf,
    isUnlocked: id => unlockLevelOf(id) <= state.info.level,

    // Combat results for the goals: the player defeated an enemy unit or destroyed an enemy building
    onDefeated(target) {
      if (target.buildProgress === undefined) { progress.kills++; return; }
      progress.destroyed.any = (progress.destroyed.any || 0) + 1;
      progress.destroyed[target.type] = (progress.destroyed[target.type] || 0) + 1;
    },
    // The last rival is gone: the level is won, whatever the other goals say
    win() { progress.won = true; },

    // Goals
    progress: evaluate,                                   // [{ key, type, id|resource, amount, have, done }]
    get seconds() { return progress.seconds; },
    get completed() { return progress.complete; },
    get stars() { return progress.stars; },
    result: () => ({ level: state.info.level, seconds: progress.seconds, par: state.info.goal.par, stars: progress.stars }),
    onComplete: fn => { completeListeners.push(fn); },
    // Same level again, from scratch: new world from the same seed, goals and time reset (the autosave is removed)
    restart() {
      resetProgress();
      saveProgress();
      const save = CityBuilder.Save;
      if (save && save.newGame) save.newGame(); else location.reload();
    },
    // Goes to the next level: the world is rebuilt by reloading the page (the autosave is removed)
    advance() {
      const save = CityBuilder.Save;
      setLevel(state.info.level + 1, true);
      if (save && save.newGame) save.newGame(); else location.reload();
    },
  };

  setLevel(clampLevel(store.get(LEVEL_KEY)), true);
})(window.CityBuilder);