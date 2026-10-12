/* Världsgenerering.
   rules: första regeln som returnerar en terrängtyp vinner (ordningen är alltså prioritet).
   features: garanterade områden.
   clearRadius: ren gräsmark runt huvudlagret.

   Världen byggs av geografi i stället för slumpklungor:
   1. Höjd: kontinenter, kullar och skarpa bergskedjor (kantigt brus), allt förvrängt så att kustlinjer och
      dalar slingrar sig.
   2. Vatten: hav och sjöar där marken är låg, plus floder som slingrar sig fram med jämn bredd.
      Floderna har vadställen (sand) så att de aldrig stänger in en stad.
   3. Fuktighet: kommer från regionala mönster, närhet till vatten och höjd. Styr skog, träsk och öken.
   4. Berggrund: malm i ådror inom geologiska provinser (järn, brons, kol, ädelmetall ...), kalksten och
      kol i sedimentär mark, salt i torra bäckenområden.
   5. Växtlighet: skog med glesa kanter, gläntor och trädgräns i bergen, bärbuskar vid skogskanter,
      svamp i skuggan, örter på ängar, fruktlundar.
   6. Platser: ruiner, kyrkogårdar, altaren och meteoritnedslag på fasta, deterministiska ställen.
   7. Startområdet: mjuk terräng med skog, sten, järn och kol på lagom avstånd från huvudlagret.

   Alla terräng-id:n är desamma som förut. Allt är deterministiskt för samma seed. */
(function (CityBuilder) {
  'use strict';

  /* ---------- Små matematikhjälpare ---------- */
  const clamp01 = value => (value < 0 ? 0 : value > 1 ? 1 : value);
  const smoothstep = (from, to, value) => {
    const t = clamp01((value - from) / (to - from));
    return t * t * (3 - 2 * t);
  };
  // Drar ut brusets smala värdeområde (runt 0.5) så att det täcker mer av 0..1
  const stretch = (value, factor) => clamp01((value - 0.5) * factor + 0.5);

  const currentSeed = () => CityBuilder.Config.world.seed;
  // Slumptal per ruta; seedet ingår så att olika seed ger olika världar
  const random = (context, x, y, channel) => context.hash(x, y, channel + currentSeed() * 131);

  /* ---------- Brus ---------- */

  // Hela världens storlek: 1 = som tidigare, 0.5 = alla landskapsdrag hälften så stora (tätare värld)
  const FEATURE_SCALE = 0.5;

  // Roterat fraktalbrus i två skalor. Rotationen döljer rutnätsmönstret i värdebruset.
  const fbm = (context, x, y, scale, channel, angle) => {
    scale *= FEATURE_SCALE;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const u = (x * cos - y * sin) / scale, v = (x * sin + y * cos) / scale;
    return 0.7 * context.fractalNoise(u, v, channel) +
           0.3 * context.fractalNoise(v * 4.3 + 17, u * 4.3 - 9, channel + 19);
  };

  // Avstånd i rutor till närmaste "ådra" i ett brusfält (där fältet korsar 0.5). Genom att dela med
  // fältets lutning blir ådrorna lika breda överallt, i stället för breda på plana ställen och
  // avbrutna där fältet lutar kraftigt.
  const veinDistance = (x, y, scale, channel, angle, warpX, warpY) => {
    scale *= FEATURE_SCALE;
    const sample = (sx, sy) => {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const px = sx + warpX, py = sy + warpY;
      const u = (px * cos - py * sin) / scale, v = (px * sin + py * cos) / scale;
      const smooth = CityBuilder.Utils.smoothNoise;
      return 0.75 * smooth(u, v, channel) + 0.25 * smooth(u * 2.3, v * 2.3, channel + 31);
    };
    const center = sample(x, y);
    const slope = Math.max(Math.hypot(sample(x + 1, y) - center, sample(x, y + 1) - center), 1e-4);
    return Math.abs(center - 0.5) / slope;
  };

  /* ---------- Landskapsmodell (beräknas en gång per ruta) ---------- */
  const SEA_LEVEL = 0.4;
  const modelCache = new WeakMap();

  const landscapeAt = context => {
    let model = modelCache.get(context);
    if (model) return model;

    const { x, y, distanceFromOrigin: origin } = context;
    const startArea = clamp01(1 - origin / 55); // 1 vid huvudlagret, 0 långt bort

    // Förvrängning av koordinaterna: ger slingrande kuster, dalar och floder
    const warpX = (fbm(context, x, y, 75, 101, 0.3) - 0.5) * 70 * FEATURE_SCALE;
    const warpY = (fbm(context, x, y, 75, 102, 1.9) - 0.5) * 70 * FEATURE_SCALE;
    const wx = x + warpX, wy = y + warpY;

    // Höjd
    const continent = stretch(fbm(context, wx, wy, 190, 103, 0.7), 2.4);
    const hills = fbm(context, wx, wy, 52, 104, 1.1);
    const detail = fbm(context, x, y, 17, 105, 2.4);
    const mountainZone = smoothstep(0.62, 0.86, stretch(fbm(context, wx, wy, 120, 106, 0.2), 2.6)) * smoothstep(28, 75, origin);
    const ridge = 1 - Math.abs(2 * fbm(context, wx, wy, 34, 107, 0.9) - 1); // skarpa åsar där bruset korsar 0.5
    const mountain = mountainZone * (0.18 + 0.62 * ridge * ridge);

    const relief = 0.12 + 0.62 * continent + 0.30 * (hills - 0.5) + 0.10 * (detail - 0.5) + mountain * 0.55;
    // Startlandet: runt huvudlagret lyfts marken över havet, så spelet aldrig börjar i vattnet. Det blir en
    // lugn slätt (inga sjöar) som går över i naturligt landskap. Klimat och berggrund använder relief.
    const startLand = 1 - smoothstep(48, 90, origin);
    const landFloor = SEA_LEVEL + 0.05 + 0.1 * hills;
    const elevation = relief + startLand * Math.max(0, landFloor - relief);

    // Fuktighet: regionala mönster, torrare på höga höjder och uppe i bergen
    const regionalMoisture = 0.55 * stretch(fbm(context, wx, wy, 85, 108, 0.5), 2.2) + 0.45 * stretch(fbm(context, x, y, 26, 109, 1.3), 2.0);

    // Floder: slingrande ådror i ett lågfrekvent fält. Inga floder nära start, och inte uppe i bergen.
    const riverBlocked = smoothstep(26, 44, origin) * (1 - smoothstep(0.66, 0.8, relief));
    const riverHalfWidth = 0.9 + 1.0 * fbm(context, x, y, 70, 110, 0.4);
    const riverCenterDistance = veinDistance(x, y, 95, 111, 0.45, warpX * 0.7, warpY * 0.7);
    const tributaryDistance = veinDistance(x, y, 60, 112, 1.2, warpX * 0.5, warpY * 0.5);
    const tributaryActive = fbm(context, x, y, 140, 113, 0.8) > 0.52;
    const riverDistance = riverBlocked > 0.5
      ? Math.min(riverCenterDistance - riverHalfWidth, tributaryActive ? tributaryDistance - riverHalfWidth * 0.7 : Infinity)
      : Infinity; // tiles from riverbank (negative = i floden)

    const seaDepth = SEA_LEVEL - elevation; // > 0 = under havsytan
    const nearWater = 1 - clamp01(Math.min(riverDistance < Infinity ? Math.max(riverDistance, 0) : 99, 14) / 14);
    const coastal = 1 - smoothstep(0, 0.12, elevation - SEA_LEVEL);
    const moisture = clamp01(
      regionalMoisture * 0.85 + 0.02 + 0.25 * nearWater + 0.22 * coastal + startArea * 0.12 -
      0.30 * smoothstep(0.62, 0.85, relief)
    );

    model = { x, y, origin, startArea, elevation, relief, mountain, mountainZone, moisture, seaDepth, riverDistance, riverHalfWidth, warpX, warpY };
    modelCache.set(context, model);
    return model;
  };

  const isOpenWater = model => model.seaDepth > 0 || model.riverDistance < 0;

  /* ---------- Fasta platser (rutnätsceller med deterministisk mittpunkt) ---------- */

  // Hittar platsen som hör till rutans cell: { centerX, centerY, roll } eller null
  const siteInCell = (context, cellSize, salt, chance, margin) => {
    const cellX = Math.floor(context.x / cellSize), cellY = Math.floor(context.y / cellSize);
    if (random(context, cellX, cellY, salt) >= chance) return null;
    const span = cellSize - margin * 2;
    const centerX = cellX * cellSize + margin + Math.floor(random(context, cellX, cellY, salt + 1) * span);
    const centerY = cellY * cellSize + margin + Math.floor(random(context, cellX, cellY, salt + 2) * span);
    if (Math.hypot(centerX, centerY) < 40) return null; // inte vid starten
    return { centerX, centerY, roll: random(context, cellX, cellY, salt + 3), cellX, cellY };
  };

  /* ---------- Startområdet: lagom nära rikedomar, annars blir spelet omöjligt ---------- */
  let starterCache = null;
  const starterDeposits = () => {
    const seed = currentSeed();
    if (starterCache && starterCache.seed === seed) return starterCache.list;
    const list = [];
    const hashFor = index => CityBuilder.Utils.hash(index, seed, 4242);
    const base = hashFor(0) * Math.PI * 2;
    const add = (terrainType, distance, radius, index) => {
      const angle = base + index * 1.9 + (hashFor(index) - 0.5) * 0.7; // spritt åt olika håll
      const deposit = { terrainType, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, radius };
      list.push(deposit);
      return deposit;
    };
    const pond = add('water', 21, 3.4, 6); // en damm med sandstrand, så brunnar går att bygga från start
    list.push({ terrainType: 'sand', x: pond.x, y: pond.y, radius: pond.radius + 2.2 });
    add('rock', 15, 3.3, 1);
    add('iron_ore', 27, 3.0, 2);
    add('coal', 29, 2.8, 3);
    add('clay', 24, 2.6, 4);
    add('limestone', 30, 2.8, 5);
    starterCache = { seed, list };
    return list;
  };

  /* ---------- Regler ---------- */
  const rules = [
    // 1. Vatten: hav, sjöar och floder. Vadställen i floder blir sand.
    context => {
      const model = landscapeAt(context);
      if (model.seaDepth > 0) return 'water';
      if (model.riverDistance < 0) {
        const fordNoise = fbm(context, context.x, context.y, 9, 120, 0.6);
        return fordNoise > 0.62 ? 'sand' : 'water';
      }
    },

    // 2. fallen stars: 10 separata nedslag
    context => {
      for (let i = 0; i < 10; i++) {
        const site = siteInCell(context, 110, 300 + i * 10, 1, 9);
        if (!site) continue;

        const distance = Math.hypot(
          context.x - site.centerX,
          context.y - site.centerY
        );

        if (distance < 0.5) return 'fallen_star';
      }
    },
    
    // 2. Meteoriter: slumpmässiga nedslag över hela världen.
    context => {
      const cellSize = 12;
      const cellX = Math.floor(context.x / cellSize);
      const cellY = Math.floor(context.y / cellSize);

      // Varje cell har en möjlig nedslagsposition.
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = cellX + ox;
          const cy = cellY + oy;

          if (random(context, cx, cy, 500) >= 0.3) continue;

          const x = cx * cellSize +
            Math.floor(random(context, cx, cy, 501) * cellSize);
          const y = cy * cellSize +
            Math.floor(random(context, cx, cy, 502) * cellSize);

          // Kratern får bara uppta en enda tile.
          if (context.x !== x || context.y !== y) continue;

          if (isOpenWater(landscapeAt(context))) return;

          return 'meteor_crater';
        }
      }
    },

    // 3. Forntida altare: ett altare omgivet av en ring av ruiner.
    context => {
      const site = siteInCell(context, 130, 310, 0.18, 10);
      if (!site) return;
      const distance = Math.hypot(context.x - site.centerX, context.y - site.centerY);
      if (distance < 0.5) return 'ancient_altar';
      if (distance < 4 && distance > 1.5 && random(context, context.x, context.y, 315) < 0.35) return 'ruins';
    },

    // 4. Ruiner efter en by, med grusade ytor och enstaka skuggor av husgrunder.
    context => {
      const site = siteInCell(context, 70, 320, 0.3, 9);
      if (!site) return;
      const radius = 3 + site.roll * 4;
      const dx = context.x - site.centerX, dy = context.y - site.centerY;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) return;
      // husgrunder sitter i ett glest rutnät, med några enstaka stenar emellan
      const onFoundationGrid = (dx + 40) % 3 === 0 || (dy + 40) % 3 === 0;
      const chance = (onFoundationGrid ? 0.6 : 0.12) * (1 - distance / (radius + 1));
      if (random(context, context.x, context.y, 325) < chance) return 'ruins';
    },

    // 5. Kyrkogård: gravar i regelbundna rader.
    context => {
      const site = siteInCell(context, 85, 330, 0.28, 9);
      if (!site) return;
      const dx = context.x - site.centerX, dy = context.y - site.centerY;
      if (Math.abs(dx) <= 4 && Math.abs(dy) <= 3 && dx % 2 === 0 && dy % 2 === 0 && random(context, context.x, context.y, 335) < 0.85) return 'grave';
    },

    // 6. Startområdets rikedomar (oregelbundna fläckar nära huvudlagret).
    context => {
      if (context.distanceFromOrigin > 45) return;
      for (const deposit of starterDeposits()) {
        const edgeNoise = (fbm(context, context.x, context.y, 6, 140, 0.9) - 0.5) * 3.2;
        if (Math.hypot(context.x - deposit.x, context.y - deposit.y) + edgeNoise < deposit.radius &&
            (deposit.terrainType === 'water' || random(context, context.x, context.y, 341) < 0.88)) {
          return deposit.terrainType;
        }
      }
    },

    // 7. Stränder och flodbankar: sand där landet är lågt eller floden bred och flack.
    context => {
      const model = landscapeAt(context);
      const aboveSea = -model.seaDepth;
      const beachWidth = 0.012 + 0.03 * fbm(context, context.x, context.y, 22, 150, 0.4);
      if (aboveSea < beachWidth && model.mountain < 0.25) return 'sand';
      if (model.riverDistance < 1.3 && random(context, context.x, context.y, 151) < 0.45) return 'sand';
    },

    // 8. Lera: på leriga flodbankar och sjökanter i klungor.
    context => {
      const model = landscapeAt(context);
      const aboveSea = -model.seaDepth;
      const wetBank = model.riverDistance < 4.5 || aboveSea < 0.07;
      if (wetBank && model.moisture > 0.5 &&
          fbm(context, context.x, context.y, 14, 160, 0.3) > 0.63 &&
          random(context, context.x, context.y, 161) < 0.7) return 'clay';
    },

    // 9. Träsk: fuktiga lågmarker, med små vattenpölar. Pölarna sitter i mitten av träsket.
    context => {
      const model = landscapeAt(context);
      const aboveSea = -model.seaDepth;
      if (aboveSea < 0.015 || aboveSea > 0.2 || model.moisture < 0.62 || model.origin < 30) return; // inget träsk vid starten
      const bogness = stretch(fbm(context, context.x, context.y, 38, 170, 0.5), 2.4) * smoothstep(0.6, 0.78, model.moisture);
      if (bogness < 0.42) return;
      if (fbm(context, context.x, context.y, 5, 171, 1.1) > 0.74) return 'water';
      if (random(context, context.x, context.y, 172) < 0.85) return 'bog';
    },

    // 10. Månsten: på höga toppar.
    context => {
      const model = landscapeAt(context);
      if (model.relief > 0.85 && random(context, context.x, context.y, 180) < 0.002) return 'moonstone';
    },

    // 11–20. Malm och mineraler. Allt följer geologi: ådror (veinDistance) inom provinser (brusmasker).
    //   Sällsynta mineraler först så att de inte skuggas av vanliga.

    // Ädelstenar och kristaller: djupt inne i höga berg, i små fickor.
    context => {
      const model = landscapeAt(context);
      if (model.mountain < 0.4) return;
      const pocket = fbm(context, context.x, context.y, 7, 190, 0.9);
      const province = fbm(context, context.x, context.y, 70, 191, 0.3);
      if (province < 0.58 || pocket < 0.66) return;
      const roll = random(context, context.x, context.y, 192);
      if (roll < 0.35) return model.mountain > 0.55 ? 'gemstone' : 'crystal';
      if (roll < 0.62) return 'crystal';
    },

    // Guld (kärnan) och silver (ådror runt kärnan): hydrotermiska provinser högt upp.
    context => {
      const model = landscapeAt(context);
      if (model.mountain < 0.3) return;
      const hydro = fbm(context, context.x, context.y, 95, 200, 0.6);
      if (hydro < 0.56) return;
      const vein = veinDistance(context.x, context.y, 26, 201, 0.4, model.warpX * 0.3, model.warpY * 0.3);
      const pocket = fbm(context, context.x, context.y, 6, 202, 1.5);
      if (vein > 1.7 || pocket < 0.45) return;
      const core = hydro > 0.64 && vein < 0.9 && model.mountain > 0.42;
      if (core && random(context, context.x, context.y, 203) < 0.75) return 'gold_ore';
      if (random(context, context.x, context.y, 204) < 0.7) return 'silver_ore';
    },

    // Svavel: vulkaniska provinser i bergen, i små fläckar.
    context => {
      const model = landscapeAt(context);
      if (model.mountain < 0.3) return;
      const volcanic = fbm(context, context.x, context.y, 110, 210, 1.0);
      const pocket = fbm(context, context.x, context.y, 6, 211, 0.2);
      if (volcanic > 0.7 && pocket > 0.6 && random(context, context.x, context.y, 212) < 0.8) return 'sulfur';
    },

    // Koppar och tenn: samma provins, tenn i smalare ådror i provinsens utkant (brons kräver båda).
    context => {
      const model = landscapeAt(context);
      if (model.mountain < 0.2) return;
      const bronze = fbm(context, context.x, context.y, 90, 220, 1.2);
      if (bronze < 0.56) return;
      const copperVein = veinDistance(context.x, context.y, 30, 221, 0.7, model.warpX * 0.3, model.warpY * 0.3);
      const tinVein = veinDistance(context.x, context.y, 24, 222, 1.7, model.warpX * 0.3, model.warpY * 0.3);
      const pocket = fbm(context, context.x, context.y, 7, 223, 0.4);
      if (copperVein < 1.5 && pocket > 0.55 && random(context, context.x, context.y, 224) < 0.8) return 'copper_ore';
      if (tinVein < 1.2 && pocket > 0.58 && bronze > 0.6 && random(context, context.x, context.y, 225) < 0.8) return 'tin_ore';
    },

    // Järn: stora provinser i berg och höglänta kullar, tjockare ådror.
    context => {
      const model = landscapeAt(context);
      if (model.mountain < 0.12) return;
      if (fbm(context, context.x, context.y, 80, 230, 0.2) < 0.56) return;
      const vein = veinDistance(context.x, context.y, 32, 231, 0.3, model.warpX * 0.3, model.warpY * 0.3);
      const pocket = fbm(context, context.x, context.y, 8, 232, 1.1);
      if (vein < 1.8 && pocket > 0.56 && random(context, context.x, context.y, 233) < 0.85) return 'iron_ore';
    },

    // Sedimentära bäcken: kol (flötsar), kalksten (blockfält) och tjärgropar.
    context => {
      const model = landscapeAt(context);
      if (model.relief < 0.45 || model.relief > 0.78 || model.mountain > 0.6) return;
      const basin = fbm(context, context.x, context.y, 100, 240, 0.9);
      if (basin < 0.56) return;
      const seam = veinDistance(context.x, context.y, 36, 241, 1.0, model.warpX * 0.3, model.warpY * 0.3);
      const pocket = fbm(context, context.x, context.y, 8, 242, 0.5);
      if (seam < 2.2 && pocket > 0.56 && random(context, context.x, context.y, 243) < 0.85) return 'coal';
      if (basin > 0.58 && random(context, context.x, context.y, 244) < 0.0025) return 'tar_pit';
      const limeField = fbm(context, context.x, context.y, 16, 245, 0.2);
      if (basin > 0.56 && limeField > 0.66 && random(context, context.x, context.y, 246) < 0.55) return 'limestone';
    },

    // Torra bäcken: saltpanor och förstenat trä på torr, låg mark.
    context => {
      const model = landscapeAt(context);
      if (model.moisture > 0.4 || model.relief < 0.42 || model.relief > 0.7) return;
      const dryness = (0.4 - model.moisture) / 0.4;
      const pocket = fbm(context, context.x, context.y, 12, 250, 0.8);
      if (pocket > 0.74 - dryness * 0.1 && random(context, context.x, context.y, 251) < 0.7) return 'salt_ore';
      if (fbm(context, context.x, context.y, 9, 252, 1.6) > 0.7 && random(context, context.x, context.y, 253) < 0.35) return 'petrified_wood';
    },

    // 21. Berg: grus och block. Ju brantare/högre, desto mer sten, och gles vegetation ovanför trädgränsen.
    context => {
      const model = landscapeAt(context);
      if (model.mountain < 0.18) return;
      const scree = smoothstep(0.18, 0.6, model.mountain);
      const patchy = stretch(fbm(context, context.x, context.y, 11, 260, 0.7), 2.0);
      const field = scree * 0.85 + (patchy - 0.5) * 0.5;
      if (random(context, context.x, context.y, 261) < smoothstep(0.2, 0.55, field) * 0.92) return 'rock';
    },

    // 22. Stenblock på låglänt mark: enstaka klippblock och små klungor av flyttblock.
    context => {
      const model = landscapeAt(context);
      const outcrop = fbm(context, context.x, context.y, 13, 270, 1.4);
      if (outcrop > 0.6 && random(context, context.x, context.y, 271) < 0.55) return 'rock';
      if (random(context, context.x, context.y, 272) < 0.014 * (model.moisture < 0.4 ? 1.8 : 1)) return 'rock';
    },

    // 23. Förbannad mark: djupt inne i gammal skog och i träsk, aldrig nära start.
    context => {
      const model = landscapeAt(context);
      if (model.origin < 50 || model.moisture < 0.62) return;
      const patch = fbm(context, context.x, context.y, 18, 280, 0.3);
      if (patch > 0.74 && random(context, context.x, context.y, 281) < 0.45) return 'cursed_ground';
    },

    // 24. Fruktlund: lummiga ställen med vilda äppelträd. Mellan träden är marken öppen.
    context => {
      const model = landscapeAt(context);
      if (model.moisture < 0.45 || model.moisture > 0.78 || model.relief < 0.42 || model.relief > 0.65 || model.mountain > 0.1) return;
      const orchard = fbm(context, context.x, context.y, 30, 290, 0.4);
      if (orchard < 0.68) return;
      return random(context, context.x, context.y, 291) < 0.3 ? 'apple_tree' : 'grass';
    },

    // 25. Skog: täthet från regionala mönster, fuktighet och trädgräns. Glesa kanter och gläntor.
    context => {
      const model = landscapeAt(context);
      const treeLine = 1 - smoothstep(0.64, 0.8, model.relief);
      const suitability = smoothstep(0.2, 0.5, model.moisture) * treeLine;
      const stand = 0.6 * stretch(fbm(context, context.x, context.y, 36, 300, 0.6), 2.2) + 0.4 * stretch(fbm(context, context.x, context.y, 12, 301, 1.5), 2.0);
      const density = stand * suitability + model.startArea * 0.18 * suitability;
      const probability = smoothstep(0.34, 0.56, density) * 0.9 + 0.09 * suitability; // lite enstaka träd även i ängen
      if (random(context, context.x, context.y, 302) < probability) return 'tree';
    },

    // 26. Bärbuskar: i klungor, helst i skogsbrynet.
    context => {
      const model = landscapeAt(context);
      if (model.moisture < 0.42 || model.mountain > 0.1) return;
      const cluster = fbm(context, context.x, context.y, 9, 310, 0.8);
      const edgeness = smoothstep(0.35, 0.5, fbm(context, context.x, context.y, 36, 300, 0.6)) * (1 - smoothstep(0.55, 0.7, fbm(context, context.x, context.y, 36, 300, 0.6)));
      if (cluster > 0.52 && random(context, context.x, context.y, 311) < 0.25 + 0.5 * edgeness) return 'berry_bush';
    },

    // 27. Svamp: i skuggan på fuktig mark.
    context => {
      const model = landscapeAt(context);
      if (model.moisture < 0.62 || model.mountain > 0.1) return;
      const cluster = fbm(context, context.x, context.y, 8, 320, 1.2);
      if (cluster > 0.52 && random(context, context.x, context.y, 321) < 0.5) return 'mushrooms';
    },

    // 28. Örter: på ängar med lagom fuktighet, i små klungor.
    context => {
      const model = landscapeAt(context);
      if (model.moisture < 0.3 || model.mountain > 0.1) return;
      const cluster = fbm(context, context.x, context.y, 9, 330, 0.5);
      if (cluster > 0.54 && random(context, context.x, context.y, 331) < 0.5) return 'herbs';
    },
  ];

  CityBuilder.Config.world = {
    seed: Math.floor(Math.random() * 1000000), // ny värld vid varje start. Skriv ett fast tal här för en bestämd värld
    clearRadius: 4,
    features: [],
    rules,
  };
})(window.CityBuilder);