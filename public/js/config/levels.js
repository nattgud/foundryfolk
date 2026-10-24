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
  const RIVALS_FROM = [35, 70];  // a second rival from level 35, a third from level 70 (the player colours allow three)
  const FIRST_RIVAL = MISSION_START - 1;   // below this level there is no enemy at all: nobody can attack you before you have learned to defend
  const rivalsAt = level => (level < FIRST_RIVAL ? 0 : 1 + RIVALS_FROM.filter(from => level >= from).length);
  const ALLIED_FROM = 60;        // with several rivals: each plays for itself (free-for-all) until this level, from here they are allied against you
  const alliedAt = level => rivalsAt(level) > 1 && level >= ALLIED_FROM;
  const LEVEL_KEY = 'citybuilder.level';
  const RUN_KEY = 'citybuilder.runSeed';
  const PROGRESS_KEY = 'citybuilder.progress';
  const CUSTOM_KEY = 'citybuilder.custom';                  // inställningarna för en egen bana: finns nyckeln startar spelet den banan
  const CUSTOM_PROGRESS_KEY = 'citybuilder.progress.custom';

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
    remove(key) { try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ } },
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
    berry_gatherer: 2, well: 2, watchtower: 3,
    hunters_cottage: 3, herb_gatherer: 3,
    charcoal_burner: 4, clay_pit: 4,
    farm: 5, fishing_hut: 5, planter: 6,
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
    silver_mine: 32, silver_smelter: 33, mint: 34, market: 35, gold_mine: 36, gold_smelter: 37,
    gemstone_mine: 40, crystal_gatherer: 40, alchemist: 41,
    moonstone_gatherer: 45, enchanter: 46, fallen_star_collector: 50, relic_hunter: 55, shrine: 56,
    monument: 58,
  };
  const unlockLevelOf = id => UNLOCK[id] ?? 1;
  const PREVIEW_LEVELS = 3;   // så många nivåer framåt visas låsta byggnader i byggmenyn

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
        if (lake > 0.76) return 'water';
        if (lake > 0.7 && R(c, 531) < 0.7) return 'sand';
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
        const s = site(c, 20 + Math.floor(p.a * 8), 760, 0.45);
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

  // Terrain behind what a level teaches or asks for. The world gives every base some of it within reach (World.endow).
  // Only common terrain: rare and epic finds stay scarce and far away on purpose.
  const ENDOWABLE = new Set(['tree', 'rock', 'clay', 'sand', 'limestone', 'coal', 'iron_ore', 'copper_ore', 'tin_ore', 'salt_ore',
    'berry_bush', 'apple_tree', 'herbs', 'mushrooms']);

  // Terrain that the first producer chain of a resource starts from (e.g. bread: farm, mill, bakery, so the farm's terrain)
  const sourcesOf = (resourceId, level, guard = []) => {
    if (guard.includes(resourceId)) return [];
    for (const [id, definition] of Object.entries(CityBuilder.Config.buildings)) {
      const job = definition.job;
      if (!job || unlockLevelOf(id) > level || !outputsOf(definition).includes(resourceId)) continue;
      if (job.kind === 'gather') return job.sourceTerrain ? [job.sourceTerrain] : [];
      return Object.keys(job.inputs || {}).flatMap(input => sourcesOf(input, level, [...guard, resourceId]));
    }
    return [];
  };

  // Iron on every level (weapons), plus the terrain of the new buildings and of the stock goals
  const needsOf = info => {
    const needs = new Set(['iron_ore']);
    for (const [id, definition] of Object.entries(CityBuilder.Config.buildings)) {
      if (unlockLevelOf(id) === info.level && definition.job?.kind === 'gather') needs.add(definition.job.sourceTerrain);
    }
    for (const item of info.goal.items) if (item.type === 'stock') sourcesOf(item.resource, info.level).forEach(terrain => needs.add(terrain));
    return [...needs].filter(terrain => ENDOWABLE.has(terrain));
  };

  const storageFactor = resourceId => (CityBuilder.Economy && CityBuilder.Economy.factorOf ? CityBuilder.Economy.factorOf(resourceId) : 1);

  // ---- Par time -------------------------------------------------------------------------------------------------------
  // What a decent player needs. Every step of a production chain costs time twice: the building has to be placed and built, and
  // goods have to travel between the steps before the next one can start. War adds finding the rival, an army and a long march.
  const HOP_SECONDS = 20;        // a carrier trip between two steps of a chain
  const SETUP_SECONDS = 45;      // placing a building and collecting its materials (plus its build time)
  const TERRAIN_SECONDS = 60;    // finding and reaching the terrain of a mine or other terrain-bound building
  const DEPTH_FACTOR = 0.25;     // each extra step in a chain slows the flow down by this much (waiting, uneven speeds)
  const EXPLORE_SECONDS = 600;   // finding the rival 60-90 tiles away: watchtowers outward, and some wrong guesses
  const MARCH_SECONDS = 150;     // the army's march there (and back and forth between targets)

  // Cheapest unlocked way to make a resource: { seconds per unit (single producer per step), latency to the first unit,
  // depth (number of steps in the chain), ids (the buildings of the chain) }
  const chain = (resourceId, level, guard = []) => {
    const fallback = { seconds: 60, latency: 60, depth: 1, ids: new Set() };
    if (guard.includes(resourceId)) return fallback;
    let best = null;
    for (const [id, definition] of Object.entries(CityBuilder.Config.buildings)) {
      const job = definition.job;
      if (!job || unlockLevelOf(id) > level) continue;
      const amount = job.outputs?.[resourceId] ?? (job.outputResource === resourceId ? 1 : 0);
      if (!amount) continue;
      const work = job.kind === 'gather' ? job.workSeconds || job.craftSeconds || 6 : job.craftSeconds || 10;
      const candidate = { seconds: (work + 8) / amount, latency: work + HOP_SECONDS, depth: 1, ids: new Set([id]) };
      for (const [input, count] of Object.entries(job.inputs || {})) {
        const source = chain(input, level, [...guard, resourceId]);
        candidate.seconds += count * source.seconds / amount;
        candidate.latency = Math.max(candidate.latency, source.latency + work + HOP_SECONDS);
        candidate.depth = Math.max(candidate.depth, source.depth + 1);
        source.ids.forEach(ingredient => candidate.ids.add(ingredient));
      }
      if (!best || candidate.seconds < best.seconds) best = candidate;
    }
    return best || fallback;
  };

  // Time to place and build a set of buildings (once per level, shared between the goals that need them)
  const setupSeconds = ids => {
    let seconds = 0;
    for (const id of ids) {
      const definition = CityBuilder.Config.buildings[id];
      seconds += (definition.buildDuration || 5) + SETUP_SECONDS + (definition.placeOnTerrain || definition.job?.kind === 'gather' && !definition.job.sourceUnit ? TERRAIN_SECONDS : 0);
    }
    return seconds;
  };

  // An army of 'size' soldiers: the cheapest unlocked soldier type, its equipment chains and the building that trains it
  const armyPlan = (level, size, workers) => {
    const { buildings, units } = CityBuilder.Config;
    const trainers = Object.entries(buildings).filter(([id, definition]) => definition.job?.kind === 'garrison' && unlockLevelOf(id) <= level);
    let best = null;
    for (const [kind, unit] of Object.entries(units)) {
      if (!unit.isSoldier || !unit.training) continue;
      const trainer = trainers.find(([, definition]) => definition.job.trains.includes(kind));
      if (!trainer) continue;
      const ids = new Set([trainer[0]]);
      let perSoldier = unit.training.seconds, latency = 0, depth = 1;
      for (const [input, count] of Object.entries(unit.training.inputs)) {
        const source = chain(input, level);
        perSoldier += count * source.seconds * (1 + DEPTH_FACTOR * (source.depth - 1)) / workers;
        latency = Math.max(latency, source.latency); depth = Math.max(depth, source.depth);
        source.ids.forEach(id => ids.add(id));
      }
      const seconds = latency + size * perSoldier;
      if (!best || seconds + setupSeconds(ids) < best.seconds + setupSeconds(best.ids)) best = { seconds, ids };
    }
    return best || { seconds: size * 120, ids: new Set() };
  };

  const KILL_SECONDS = 25, DESTROY_SECONDS = 150, ELIMINATE_SECONDS = 1200;

  // Kalibrering mot spelade nivåer: nivå 10 beräknades till 45 min men klaras på ca 20, så de tidiga nivåerna skalas ner (≈0,55).
  // Skalningen avtar mot 1 vid nivå 40, där tiderna ännu inte är mätta mot spelare.
  const parScale = level => Math.min(1, 0.55 + 0.45 * Math.max(0, level - 10) / 30);

  const parSeconds = (items, level) => {
    const workers = 2 + Math.floor(level / 10);   // producers a player typically runs at once
    let seconds = 240 + 6 * level;
    const ids = new Set();
    let trained = 0;   // soldiers a 'soldiers' goal already provides for the war
    const war = items.some(item => item.type === 'kills' || item.type === 'destroy' || item.type === 'eliminate');
    for (const item of items) {
      if (item.type === 'build') seconds += item.amount * ((CityBuilder.Config.buildings[item.id].buildDuration || 5) + 40);
      else if (item.type === 'soldiers') {
        const army = armyPlan(level, item.amount, workers);
        trained += item.amount;
        seconds += army.seconds; army.ids.forEach(id => ids.add(id));
      } else if (item.type === 'kills') seconds += item.amount * KILL_SECONDS;
      else if (item.type === 'destroy') seconds += item.amount * DESTROY_SECONDS;
      else if (item.type === 'eliminate') seconds += ELIMINATE_SECONDS * item.amount;
      else {
        const made = chain(item.resource, level);
        seconds += made.latency + item.amount * made.seconds * (1 + DEPTH_FACTOR * (made.depth - 1)) / workers;
        made.ids.forEach(id => ids.add(id));
      }
    }
    if (war) { // finding the rival(s), an army big enough to beat their bases, and the march
      const rivals = rivalsAt(level);
      const extra = Math.min(24, 6 + Math.floor(level / 4)) + 6 * (rivals - 1) - trained;
      seconds += (EXPLORE_SECONDS * (1 + 0.7 * (rivals - 1))) + MARCH_SECONDS * rivals;
      if (extra > 0) {
        const army = armyPlan(level, extra, workers);
        seconds += army.seconds;
        army.ids.forEach(id => ids.add(id));
      }
      ids.add('watchtower');
    }
    seconds += setupSeconds(ids);
    return Math.round(seconds * parScale(level) / 10) * 10;
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
    if (level >= ELIMINATE_START) items.push({ key: 'm:eliminate', type: 'eliminate', amount: rivalsAt(level) });
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
    if (rivalsAt(level) > 1) tagKeys.push(alliedAt(level) ? 'Allied rivals' : 'Rivals fight each other');
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
      key: level,   // identifierar banan i framstegen (en egen bana har 'custom:<seed>')
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
      rivals: rivalsAt(level),   // antal datorspelare (minst en per bana)
      teams: alliedAt(level) ? Object.fromEntries(Array.from({ length: rivalsAt(level) }, (_, i) => [CityBuilder.Players.ENEMY + i, CityBuilder.Players.ENEMY])) : {},   // spelare -> lag (se Players.team)
      seed,
      keep,
      twists,
      // Buildings that become available on this level
      get unlocks() { return Object.keys(CityBuilder.Config.buildings).filter(id => unlockLevelOf(id) === level && id !== 'hq' && !CityBuilder.Config.buildings[id].hiddenInMenu); },
      // Goals are built on first use, when all configs are loaded
      get goal() { return goals || (goals = makeGoals(info)); },
      get needs() { return needsOf(info); },
      blurb: `${theme.noun}${signatureDef ? ' / ' + signatureDef.name : ''}. Gold ${Math.round(keep.gold_ore * 100)}%, Gemstone ${Math.round(keep.gemstone * 100)}%, Iron ${Math.round(keep.iron_ore * 100)}% of normal amount.` +
        (tagKeys.length ? ' ' + tagKeys.join(', ') + '.' : ''),
    };
    return info;
  };


  /* ---------- Custom map ----------
     A map outside the levels. The player picks the number of enemies, how strong each one is, the teams, and how much water,
     mountain, forest and resources there is (steps 0-4, 2 = as on a normal level). Every building is unlocked, and the only goal
     is to beat the enemies that are not on the player's team. The settings are stored under CUSTOM_KEY while the map is played. */
  const MAX_CUSTOM_ENEMIES = 3;
  const DIFFICULTIES = [1, 18, 35, 60, 90, 120];                    // enemy strength as a level (the AI works from the level, see AI.level)
  const TEAM_CHOICES = ['own', 'you', 'a', 'b', 'c'];               // own = plays for itself, you = on the player's team, a-c = enemy teams
  const SEA = [0.02, 0.12, 0.2, 0.3, 0.42];                        // Config.world.tuning per step
  const MOUNTAIN = [1.1, 0.9, 0.76, 0.64, 0.52];
  const FOREST = [0.4, 0.7, 1, 1.5, 2.4];
  const RICHNESS = [0.25, 0.6, 1, 1.5, 2.2];
  const BASIC_TERRAIN = ['rock', 'clay', 'limestone', 'berry_bush', 'herbs', 'mushrooms', 'apple_tree'];
  const integer = (value, min, max, fallback) => { const n = Math.floor(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

  const normalizeCustom = raw => {
    const given = raw && typeof raw === 'object' ? raw : {};
    const enemies = (Array.isArray(given.enemies) && given.enemies.length ? given.enemies : [{}]).slice(0, MAX_CUSTOM_ENEMIES).map(enemy => ({
      difficulty: integer(enemy?.difficulty, 0, DIFFICULTIES.length - 1, 2),
      team: TEAM_CHOICES.includes(enemy?.team) ? enemy.team : 'own',
    }));
    if (enemies.every(enemy => enemy.team === 'you')) enemies[enemies.length - 1].team = 'own';   // somebody has to be an enemy
    return {
      seed: integer(given.seed, 1, 999999, 1), enemies,
      water: integer(given.water, 0, 4, 2), mountains: integer(given.mountains, 0, 4, 2),
      forest: integer(given.forest, 0, 4, 2), resources: integer(given.resources, 0, 4, 2),
    };
  };

  const customInfo = raw => {
    const settings = normalizeCustom(raw), { HUMAN, ENEMY } = CityBuilder.Players;
    const teamIds = { you: HUMAN, a: 100, b: 101, c: 102 };
    const teams = {}, aiLevels = {};
    settings.enemies.forEach((enemy, i) => {
      aiLevels[ENEMY + i] = DIFFICULTIES[enemy.difficulty];
      if (enemy.team !== 'own') teams[ENEMY + i] = teamIds[enemy.team];
    });
    const richness = RICHNESS[settings.resources], keep = {};
    for (const terrain of Object.keys(TIERS)) keep[terrain] = Math.min(1, richness);
    for (const terrain of BASIC_TERRAIN) keep[terrain] = Math.min(1, 0.5 + 0.5 * richness);
    const strongest = Math.max(...Object.values(aiLevels));
    return {
      level: strongest,                       // what the enemies' strength is measured in (see AI.level), and what saves show
      key: 'custom:' + settings.seed,
      custom: settings,
      get name() { return t('Custom map'); },
      theme: 'valleys', themeObject: THEMES[0], signature: null,
      tags: [], trial: false, bounty: false, guardian: false,
      difficulty: strongest / MAX_LEVELS,
      rivals: settings.enemies.length, teams, aiLevels,
      seed: settings.seed,
      keep, twists: [],
      tuning: { sea: SEA[settings.water], mountain: MOUNTAIN[settings.mountains], oreShare: Math.min(0.85, 0.4 * richness), scatteredOre: 0.01 * richness * richness, forest: FOREST[settings.forest] },
      unlocks: [],
      goal: { items: [{ key: 'm:eliminate', type: 'eliminate', amount: settings.enemies.filter(enemy => enemy.team !== 'you').length }], par: 0 },
      needs: ['iron_ore', 'tree', 'rock', 'clay', 'coal'],
    };
  };

  const readCustom = () => { try { const saved = JSON.parse(store.get(CUSTOM_KEY)); return saved ? normalizeCustom(saved) : null; } catch (e) { return null; } };

  /* ---------- Coupling to World Generation ---------- */
  const state = { info: levelInfo(1) };
  const offset = { x: 0, y: 0 };

  // Shifts the noise per seed, so that even the landscape shape (not just randomness) differs between levels
  const Utils = CityBuilder.Utils;
  if (Utils && Utils.smoothNoise && !Utils.smoothNoise.__levels) {
    const original = Utils.smoothNoise;
    const shifted = (u, v, channel) => original(u + offset.x, v + offset.y, channel);
    shifted.__levels = true;
    Utils.smoothNoise = shifted;
  }
  const wrappers = new WeakMap(); // a wrapper per cell, so that the world file's landscape cache continues to work
  const seeded = c => {
    let w = wrappers.get(c);
    if (!w) {
      w = Object.create(c);
      w.fractalNoise = (u, v, channel) => c.fractalNoise(u + offset.x, v + offset.y, channel);
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

  // Distance to the nearest base (the player's start and every rival's), so that all players get the same protection
  const homeDistance = c => {
    let nearest = Infinity;
    for (const base of world.meadows) nearest = Math.min(nearest, Math.hypot(c.x - base.x, c.y - base.y));
    return nearest;
  };

  const themeRule = context => {
    if (homeDistance(context) < 42) return undefined; // never at a base
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
    if (!signature || !signature.def.early || homeDistance(c) < 42) return undefined;
    return signature.def.early(c, signature.params);
  };
  const signatureNear = c => {
    const signature = state.info.signature;
    if (!signature || !signature.def.near || homeDistance(c) < 12) return undefined;
    return signature.def.near(c, signature.params);
  };

  const wrapped = baseRules.map(wrapRule);
  wrapped.splice(18, 0, themeRule);                      // after ore and rock, before lowlands stone blocks, forest and berry bushes
  wrapped.splice(18, 0, wrapRule(signatureNear, 99));    // structures win over the theme's scatter
  wrapped.splice(1, 0, wrapRule(signatureEarly, 99));    // right after natural water
  world.rules = wrapped;

  /* ---------- Goal progress ---------- */
  const Economy = () => CityBuilder.Economy;
  const progress = { run: null, level: null, latched: {}, seconds: 0, complete: false, stars: 0, kills: 0, destroyed: {}, rivalsDown: 0, won: false };
  const completeListeners = [];
  let checkTimer = 0, saveTimer = 0;

  const progressKey = () => (state.info.custom ? CUSTOM_PROGRESS_KEY : PROGRESS_KEY);
  // Framstegen för den här banan ur 'saved' (från lagringen eller en sparning). Gäller bara samma omgång och bana, annars börjar de om.
  const applyProgress = saved => {
    const same = saved && saved.run === runSeed && saved.level === state.info.key;
    Object.assign(progress, { run: runSeed, level: state.info.key, latched: same ? saved.latched || {} : {}, seconds: same ? saved.seconds || 0 : 0, complete: same ? !!saved.complete : false, stars: same ? saved.stars || 0 : 0, kills: same ? saved.kills || 0 : 0, destroyed: same ? saved.destroyed || {} : {}, rivalsDown: same ? saved.rivalsDown || 0 : 0, won: same ? !!saved.won : false });
  };
  const loadProgress = () => {
    let saved = null;
    try { saved = JSON.parse(store.get(progressKey())); } catch (e) { /* ignore */ }
    applyProgress(saved);
  };
  const resetProgress = () => Object.assign(progress, { latched: {}, seconds: 0, complete: false, stars: 0, kills: 0, destroyed: {}, rivalsDown: 0, won: false });
  const saveProgress = () => store.set(progressKey(), JSON.stringify(progress));

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
      case 'eliminate': return progress.won ? item.amount : progress.rivalsDown;
      default: return Economy() ? Economy().totalAmount(item.resource) : 0;
    }
  };

  // [{ ...item, have, done }] for the current level
  // Medan en sparning återställs (hold) står lagren på startvärden och det som räknas är inte spelarens: då får inget målt klaras av
  let held = false;
  const evaluate = () => state.info.goal.items.map(item => {
    const have = haveOf(item);
    if (have >= item.amount && !held) progress.latched[item.key] = true;
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
          progress.stars = state.info.custom ? 0 : starsFor(progress.seconds);
          saveProgress();
          completeListeners.forEach(fn => { try { fn(Levels.result()); } catch (e) { console.error(e); } });
        }
      }
      if (saveTimer >= 5) { saveTimer = 0; saveProgress(); }
    },
  };

  /* ---------- Public API ---------- */
  const listeners = [];
  // Makes a level or a custom map the current one: seed, noise offset and landscape tuning
  const enter = info => {
    state.info = info;
    world.seed = info.seed;
    offset.x = frac(info.seed, 1) * 4000;
    offset.y = frac(info.seed, 2) * 4000;
    Object.assign(world.tuning, world.defaults, info.tuning);
    return info;
  };
  const setCustom = raw => { const info = enter(customInfo(raw)); loadProgress(); return info; };
  const setLevel = (n, silent) => {
    const info = enter(levelInfo(n));
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
    start: () => {
      registerSystem();
      const custom = readCustom();
      return custom ? setCustom(custom) : setLevel(clampLevel(store.get(LEVEL_KEY)), true);
    },
    get runSeed() { return runSeed; },
    // Restores level and run-seed from a save (silent, before world generation)
    restore: (level, seed) => {
      if (Number.isFinite(seed) && seed > 0) { runSeed = seed; store.set(RUN_KEY, runSeed); }
      store.remove(CUSTOM_KEY);
      return setLevel(level, true);
    },
    restoreCustom: settings => { store.set(CUSTOM_KEY, JSON.stringify(normalizeCustom(settings))); return setCustom(settings); },
    set: n => setLevel(n),
    next: () => setLevel(state.info.level + 1),
    prev: () => setLevel(state.info.level - 1),
    // New round: new run-seed generates completely new levels, starts at level 1
    newRun: (seed) => {
      runSeed = Number.isFinite(seed) ? seed : Math.floor(Math.random() * 1000000) + 1;
      store.set(RUN_KEY, runSeed);
      store.remove(CUSTOM_KEY);
      resetProgress();
      return setLevel(1);
    },
    // Call e.g., CityBuilder.Levels.onChange(info => regenerate world)
    onChange: fn => { listeners.push(fn); },

    // Unlocks
    unlockLevel: unlockLevelOf,
    isUnlocked: id => !!state.info.custom || unlockLevelOf(id) <= state.info.level,
    // Syns byggnaden i byggmenyn? Låsta byggnader visas bara de närmaste nivåerna (en glimt av vad som kommer), resten döljs tills det är dags
    isVisible: id => !!state.info.custom || unlockLevelOf(id) <= state.info.level + PREVIEW_LEVELS,

    // Combat results for the goals: the player defeated an enemy unit or destroyed an enemy building
    onDefeated(target) {
      if (target.buildProgress === undefined) { progress.kills++; return; }
      progress.destroyed.any = (progress.destroyed.any || 0) + 1;
      progress.destroyed[target.type] = (progress.destroyed[target.type] || 0) + 1;
    },
    // A rival's base is destroyed (counts towards the 'eliminate' goal)
    onRivalDown() { progress.rivalsDown++; },
    // The last rival is gone: the level is won, whatever the other goals say
    win() { progress.won = true; },

    // Framstegen följer med sparningen (annars kan en äldre sparning få mål som redan är gröna). hold(true) medan en sparning återställs.
    snapshot: () => JSON.parse(JSON.stringify(progress)),
    restoreProgress(saved) { applyProgress(saved || null); saveProgress(); },
    hold(value) { held = !!value; },

    // Goals
    progress: evaluate,                                   // [{ key, type, id|resource, amount, have, done }]
    get seconds() { return progress.seconds; },
    get completed() { return progress.complete; },
    get stars() { return progress.stars; },
    result: () => ({ level: state.info.level, seconds: progress.seconds, par: state.info.goal.par, stars: progress.stars, custom: !!state.info.custom }),
    onComplete: fn => { completeListeners.push(fn); },
    // ---- Custom map ----
    CUSTOM: { maxEnemies: MAX_CUSTOM_ENEMIES, difficulties: DIFFICULTIES.length, teams: TEAM_CHOICES, steps: 5 },
    get custom() { return state.info.custom || null; },           // settings of the current custom map, or null on a level
    isCustom: () => !!(state.info.custom || readCustom()),         // also true before Levels.start() when a custom map is stored
    defaultCustom: seed => normalizeCustom({ seed: seed ?? Math.floor(Math.random() * 999999) + 1 }),
    normalizeCustom,
    storedCustom: readCustom,
    // Plays a custom map: the current game is saved first, then the page reloads into the new map
    startCustom(raw) {
      const settings = normalizeCustom(raw), save = CityBuilder.Save;
      if (save && save.ready) save.save(save.slot());
      store.set(CUSTOM_KEY, JSON.stringify(settings));
      store.remove(CUSTOM_PROGRESS_KEY);
      if (save && save.newGame) save.newGame('autocustom'); else location.reload();
    },
    // Back to the levels (the page reloads and continues from the autosave of the levels)
    leaveCustom() {
      store.remove(CUSTOM_KEY);
      location.reload();
    },
    // A map of the custom settings, without changing the game: { size, cells: Uint8Array of class numbers, bases: [{ x, y, player }] }
    // Class numbers: 0 grass, 1 water, 2 mountain, 3 forest, 4 sand, 5 ore. The bases are where the layout wants
    // them (the real ones move a few tiles to the best spot nearby).
    preview(raw, size = 64) {
      const info = customInfo(raw), { World, Generator, Players } = CityBuilder;
      const saved = { info: state.info, seed: world.seed, offset: { ...offset }, tuning: { ...world.tuning }, meadows: world.meadows, clearings: world.clearings, roads: world.roads };
      try {
        enter(info);
        Generator.reset();
        const bases = [{ x: 0, y: 0, player: Players.HUMAN }, ...info.custom.enemies.map((enemy, i) => ({ ...World.idealSite(i, info.rivals), player: Players.ENEMY + i }))];
        world.meadows = bases.map(({ x, y }) => ({ x, y }));
        world.clearings = bases.slice(1).map(({ x, y }) => ({ x, y, radius: world.rivalClearRadius }));
        world.roads = [];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const { x, y } of bases) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        const span = Math.max(maxX - minX, maxY - minY) + 60, step = span / size;
        const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
        const classes = { water: 1, mountain: 2, tree: 3, sand: 4, grass: 0 };
        const cells = new Uint8Array(size * size);
        for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
          const type = Generator.terrainTypeAt(Math.round(centerX + (column - size / 2 + .5) * step), Math.round(centerY + (row - size / 2 + .5) * step));
          cells[row * size + column] = classes[type] ?? (world.deposits.includes(type) ? 5 : 0);
        }
        return { size, cells, bases: bases.map(({ x, y, player }) => ({ player, x: (x - centerX) / step + size / 2, y: (y - centerY) / step + size / 2 })) };
      } finally {
        state.info = saved.info; world.seed = saved.seed; offset.x = saved.offset.x; offset.y = saved.offset.y;
        Object.assign(world.tuning, saved.tuning);
        world.meadows = saved.meadows; world.clearings = saved.clearings; world.roads = saved.roads;
        Generator.reset();
      }
    },

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