/* Banor (levels) ovanpå världsgenereringen.
   Ladda DENNA fil EFTER världsfilen (den som sätter CityBuilder.Config.world).

   Idéer:
   - Varje bana har eget seed (härlett från ett "run-seed" + banans nummer), alltså samma bana = samma värld.
   - Sällsynthet: medel-, sällsynta och episka resurser blir glesare ju högre bana. Kurvan är en sågtand:
     varje kapitel (10 banor) börjar lite snällare, och slutar lite hårdare.
   - Teman: 12 olika landskapstyper (urskog, träskland, skärgård, stjärnfall ...) som lägger till egna drag.
   - Specialbanor: var 7:e bana är en Rikedomsbana (andningspaus), var 10:e är en Prövning (hårdare),
     var 25:e är en Väktarbana. Banorna 20+ får ett "twist" (t.ex. Järnbrist), 60+ får två.
   - Startområdets rikedomar (regel 6 i världsfilen) tunnas aldrig ut, så varje bana går alltid att starta.
   - Obegränsat: efter bana 120 fortsätter det, med maximal svårighet. */
(function (CityBuilder) {
  'use strict';

  const world = CityBuilder.Config.world;
  const baseRules = world.rules.slice();
  const MAX_LEVELS = 120;
  const CHAPTER = 10;
  const LEVEL_KEY = 'citybuilder.level';
  const RUN_KEY = 'citybuilder.runSeed';

  /* ---------- Hjälpare ---------- */
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
    set(key, value) { try { window.localStorage.setItem(key, String(value)); } catch (e) { /* ignorera */ } },
  };

  // Brus och slump per ruta (c = wrapper-kontext)
  const N = (c, scale, channel) => c.fractalNoise(c.x / scale, c.y / scale, channel);
  const R = (c, channel) => c.hash(c.x, c.y, channel + world.seed * 131);
  // Fast plats i en rutnätscell: { x, y, roll } eller null
  const site = (c, cell, salt, chance) => {
    const cx = Math.floor(c.x / cell), cy = Math.floor(c.y / cell);
    const h = k => c.hash(cx, cy, salt + k + world.seed * 131);
    if (h(0) >= chance) return null;
    return { x: cx * cell + 6 + Math.floor(h(1) * (cell - 12)), y: cy * cell + 6 + Math.floor(h(2) * (cell - 12)), roll: h(3) };
  };

  /* ---------- Sällsynthet ---------- */
  const TIERS = {
    iron_ore: 'medium', coal: 'medium', limestone: 'medium', copper_ore: 'medium', tin_ore: 'medium',
    salt_ore: 'medium', petrified_wood: 'medium',
    silver_ore: 'rare', sulfur: 'rare', tar_pit: 'rare', crystal: 'rare',
    gold_ore: 'epic', gemstone: 'epic', moonstone: 'epic', fallen_star: 'epic', ancient_altar: 'epic',
  };
  // Andel som finns kvar på maximal svårighet
  const FLOOR = { medium: 0.4, rare: 0.15, epic: 0.05 };

  /* ---------- Twists (från bana 20) ---------- */
  const TWISTS = [
    { id: 'wood', name: 'Trästorm', keep: { tree: 0.45, apple_tree: 0.6 } },
    { id: 'iron', name: 'Järnbrist', keep: { iron_ore: 0.35 } },
    { id: 'stone', name: 'Stenbrist', keep: { rock: 0.4, limestone: 0.5 } },
    { id: 'food', name: 'Hungersnöd', keep: { berry_bush: 0.35, herbs: 0.35, mushrooms: 0.4, apple_tree: 0.3 } },
    { id: 'coal', name: 'Kolbrist', keep: { coal: 0.35 } },
    { id: 'clay', name: 'Torrlera', keep: { clay: 0.3 } },
  ];

  /* ---------- Teman ---------- */
  const THEMES = [
    { id: 'valleys', noun: 'Dalar', keep: {}, extras: [] },
    { id: 'forest', noun: 'Urskog', keep: { berry_bush: 0.5 }, extras: [
      c => (stretch(N(c, 38, 501), 2.2) > 0.62 && R(c, 502) < 0.8 ? 'tree' : undefined),
    ] },
    { id: 'barren', noun: 'Stenöken', keep: { tree: 0.25 }, extras: [
      c => (N(c, 14, 510) > 0.58 && R(c, 511) < 0.5 ? 'rock' : undefined),
      c => (stretch(N(c, 30, 512), 2.2) > 0.7 && R(c, 513) < 0.8 ? 'sand' : undefined),
    ] },
    { id: 'swamp', noun: 'Träskland', keep: {}, extras: [
      c => {
        if (stretch(N(c, 26, 520), 2.4) < 0.6) return undefined;
        if (N(c, 5, 521) > 0.72) return 'water';
        return R(c, 522) < 0.8 ? 'bog' : undefined;
      },
      c => (N(c, 8, 523) > 0.6 && R(c, 524) < 0.3 ? 'mushrooms' : undefined),
    ] },
    { id: 'archipelago', noun: 'Skärgård', keep: {}, extras: [
      c => {
        const lake = stretch(N(c, 24, 530), 2.2);
        if (lake > 0.66) return 'water';
        if (lake > 0.6 && R(c, 531) < 0.7) return 'sand';
      },
    ] },
    { id: 'crag', noun: 'Klippland', keep: { tree: 0.6 }, extras: [
      c => (N(c, 20, 540) > 0.56 && R(c, 541) < 0.6 ? 'rock' : undefined),
      c => (N(c, 70, 542) > 0.6 && N(c, 9, 543) > 0.7 && R(c, 544) < 0.7 ? 'iron_ore' : undefined),
    ] },
    { id: 'cursed', noun: 'Skuggland', keep: {}, extras: [
      c => (N(c, 18, 550) > 0.62 && R(c, 551) < 0.5 ? 'cursed_ground' : undefined),
      c => (N(c, 8, 552) > 0.62 && R(c, 553) < 0.3 ? 'mushrooms' : undefined),
    ] },
    { id: 'ruined', noun: 'Ruinrike', keep: {}, extras: [
      c => (N(c, 10, 560) > 0.62 && R(c, 561) < 0.3 ? 'ruins' : undefined),
      c => {
        const s = site(c, 60, 562, 0.5);
        if (!s) return undefined;
        const dx = c.x - s.x, dy = c.y - s.y;
        return Math.abs(dx) <= 4 && Math.abs(dy) <= 3 && dx % 2 === 0 && dy % 2 === 0 ? 'grave' : undefined;
      },
    ] },
    { id: 'meteor', noun: 'Stjärnfall', keep: {}, extras: [
      c => {
        const s = site(c, 36, 600, 0.6);
        if (!s) return undefined;
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        if (d < 0.5) return s.roll < 0.35 ? 'fallen_star' : 'meteor_crater'; // många kratrar är tomma
        if (d < 2.6 && R(c, 605) < 0.9) return 'meteor_crater';
      },
    ] },
    { id: 'orchard', noun: 'Fruktdal', keep: {}, extras: [
      c => (N(c, 26, 570) > 0.55 && R(c, 571) < 0.22 ? 'apple_tree' : undefined),
      c => (N(c, 9, 572) > 0.55 && R(c, 573) < 0.4 ? 'herbs' : undefined),
      c => (N(c, 9, 574) > 0.58 && R(c, 575) < 0.3 ? 'berry_bush' : undefined),
    ] },
    { id: 'clay', noun: 'Lerslätt', keep: {}, extras: [
      c => (N(c, 14, 580) > 0.6 && R(c, 581) < 0.6 ? 'clay' : undefined),
      c => (N(c, 16, 582) > 0.64 && R(c, 583) < 0.5 ? 'limestone' : undefined),
    ] },
    { id: 'drought', noun: 'Torrmark', keep: { tree: 0.2, berry_bush: 0.3 }, extras: [
      c => (N(c, 12, 590) > 0.68 && R(c, 591) < 0.6 ? 'salt_ore' : undefined),
      c => (N(c, 9, 592) > 0.7 && R(c, 593) < 0.3 ? 'petrified_wood' : undefined),
      c => (stretch(N(c, 30, 594), 2.2) > 0.68 && R(c, 595) < 0.8 ? 'sand' : undefined),
    ] },
  ];

  const ADJECTIVES = ['Töcknig', 'Gyllene', 'Glömd', 'Vindpinad', 'Mörk', 'Stilla', 'Förlorad', 'Hård',
    'Gammal', 'Vild', 'Frostbiten', 'Hemlig', 'Rostig', 'Ensam', 'Mäktig', 'Förtrollad'];

  /* ---------- Banans data ---------- */
  const clampLevel = n => Math.max(1, Math.floor(Number(n)) || 1);
  let runSeed = Number(store.get(RUN_KEY));
  if (!Number.isFinite(runSeed) || runSeed <= 0) { runSeed = world.seed; store.set(RUN_KEY, runSeed); }

  const levelInfo = rawLevel => {
    const level = clampLevel(rawLevel);
    const theme = level === 1 ? THEMES[0] : THEMES[(level * 5 + Math.floor(level / 12)) % THEMES.length];
    const trial = level % 10 === 0;
    const bounty = !trial && level % 7 === 0;
    const guardian = level % 25 === 0;

    // Svårighet 0..1 (sågtand över kapitlen)
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

    // Andel av varje terrängtyp som får finnas kvar
    const keep = {};
    for (const [terrain, tier] of Object.entries(TIERS)) keep[terrain] = Math.pow(FLOOR[tier], difficulty);
    const apply = table => { for (const [t, k] of Object.entries(table)) keep[t] = (keep[t] === undefined ? 1 : keep[t]) * k; };
    apply(theme.keep);
    twists.forEach(twist => apply(twist.keep));

    const adjective = ADJECTIVES[mix(level, 3) % ADJECTIVES.length];
    let name = level === 1 ? 'Nybyggarland' : `${adjective} ${theme.noun}`;
    if (level === 100) name = 'Världens ände';
    else if (guardian) name = `Väktarens ${theme.noun.toLowerCase()}`;
    else if (trial) name = `Prövningen: ${name}`;
    else if (bounty) name = `Skattkammaren: ${name}`;

    const tags = [];
    if (bounty) tags.push('Rikedomsbana');
    if (trial) tags.push('Prövning');
    if (guardian) tags.push('Väktarbana');
    twists.forEach(twist => tags.push(twist.name));

    return {
      level,
      name,
      theme: theme.id,
      themeObject: theme,
      tags,
      difficulty,
      seed: mix(runSeed, level * 7919 + 13) % 1000000,
      keep,
      twists,
      // Förslag till mål, koppla till spelets eget målsystem
      goal: { population: Math.round(10 + 3.2 * Math.pow(level, 1.1)) },
      blurb: `${theme.noun}. Guld ${Math.round(keep.gold_ore * 100)}%, ädelsten ${Math.round(keep.gemstone * 100)}%, järn ${Math.round(keep.iron_ore * 100)}% av normal mängd.` +
        (tags.length ? ' ' + tags.join(', ') + '.' : ''),
    };
  };

  /* ---------- Koppling till världsgenereringen ---------- */
  const state = { info: levelInfo(1) };
  const offset = { x: 0, y: 0 };

  // Förskjuter bruset per seed, så att även landskapets form (inte bara slumpen) skiljer sig mellan banor
  const Utils = CityBuilder.Utils;
  if (Utils && Utils.smoothNoise && !Utils.smoothNoise.__levels) {
    const original = Utils.smoothNoise;
    const shifted = (u, v, ...rest) => original.call(Utils, u + offset.x, v + offset.y, ...rest);
    shifted.__levels = true;
    Utils.smoothNoise = shifted;
  }
  const wrappers = new WeakMap(); // en wrapper per ruta, så att världsfilens landskapscache fortsätter fungera
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
    // regel 0 (vatten) och 5 (startrikedomar) tunnas aldrig ut
    if (terrain === undefined || index === 0 || index === 5) return terrain;
    const k = state.info.keep[terrain];
    if (k === undefined || k >= 1) return terrain;
    return c.hash(c.x, c.y, 9100 + world.seed * 131) < k ? terrain : undefined;
  };

  const themeRule = context => {
    if (context.distanceFromOrigin < 42) return undefined; // aldrig vid starten
    const c = seeded(context);
    for (const extra of state.info.themeObject.extras) {
      const terrain = extra(c);
      if (terrain) return terrain;
    }
  };

  const wrapped = baseRules.map(wrapRule);
  wrapped.splice(18, 0, themeRule); // efter malm och berg, före lågmarkens stenblock, skog och bärbuskar
  world.rules = wrapped;

  /* ---------- Publikt API ---------- */
  const listeners = [];
  const setLevel = (n, silent) => {
    const info = levelInfo(n);
    state.info = info;
    world.seed = info.seed;
    offset.x = frac(info.seed, 1) * 4000;
    offset.y = frac(info.seed, 2) * 4000;
    store.set(LEVEL_KEY, info.level);
    if (!silent) {
      listeners.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } });
      try { window.dispatchEvent(new CustomEvent('citybuilder:levelchange', { detail: info })); } catch (e) { /* ignorera */ }
    }
    return info;
  };

  CityBuilder.Levels = {
    MAX_LEVELS,
    get current() { return state.info; },
    info: levelInfo,
    list: (count = MAX_LEVELS) => Array.from({ length: count }, (_, i) => levelInfo(i + 1)),
    // Tyst start: läser sparad bana (bana 1 om inget är sparat), sätter seed och brusförskjutning. Anropas före World.init().
    start: () => setLevel(clampLevel(store.get(LEVEL_KEY)), true),
    get runSeed() { return runSeed; },
    // Återställer bana och run-seed från en sparning (tyst, före världsgenerering)
    restore: (level, seed) => {
      if (Number.isFinite(seed) && seed > 0) { runSeed = seed; store.set(RUN_KEY, runSeed); }
      return setLevel(level, true);
    },
    set: n => setLevel(n),
    next: () => setLevel(state.info.level + 1),
    prev: () => setLevel(state.info.level - 1),
    // Ny omgång: nytt run-seed ger helt nya banor, börjar om på bana 1
    newRun: (seed) => {
      runSeed = Number.isFinite(seed) ? seed : Math.floor(Math.random() * 1000000) + 1;
      store.set(RUN_KEY, runSeed);
      return setLevel(1);
    },
    // Anropa t.ex. CityBuilder.Levels.onChange(info => generera om världen)
    onChange: fn => { listeners.push(fn); },
  };

  setLevel(clampLevel(store.get(LEVEL_KEY)), true);
})(window.CityBuilder);