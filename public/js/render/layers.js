/* Renderlager i ritordning: terräng, stigar, byggnader, enheter, placeringsspöke. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Assets, Economy, Renderer, Vision, Players, Utils } = CityBuilder;

  // Utanför synfältet (Renderer.viewBounds)? Byggnader och enheter utanför bild hoppas över, så ritkostnaden följer vad som syns.
  const outside = (view, x, y) => x < view.left || x > view.right || y < view.top || y > view.bottom;

  // Någon annans byggnad eller enhet som spelaren inte ser (i dimman): ritas inte
  const hidden = thing => thing.player !== Players.HUMAN && !Vision.sees(Players.HUMAN, thing);

  // Terräng: ritas i brickor på 8x8 rutor som cachas på egna canvaser, så varje bildruta bara kostar en drawImage per
  // synlig bricka. Rutnätet snappas till hela skärmpixlar (grannrutor delar kantpixel, så det blir inga skarvar), och
  // brickorna ritas i skärmupplösning, så det blir ingen omsampling. Kontrolleras högst 10 gånger per sekund; en
  // bricka ritas om när en ruta byter terräng eller när bilderna ändras (t.ex. "Shapes only"). Under zoomning
  // (skalan ändras) ritas rutorna direkt med samma geometri tills skalan stått still en stund.
  const TERRAIN_CHUNK = 8;               // rutor per bricka
  const TERRAIN_CHECK_MS = 100;          // hur ofta en bricka kontrolleras efter ändringar
  const TERRAIN_SETTLE_MS = 150;         // så länge måste skalan stå still innan brickor cachas
  const TERRAIN_KEEP_MS = 20000;         // oanvända brickor släpps efter så här lång tid
  const TERRAIN_BUILDS = 6;              // nya brickor per bildruta (resten ritas direkt tills de hinner cachas)
  const terrainChunks = new Map();
  const terrainView = { scale: 0, since: 0, images: '', checkedAt: 0, pruneAt: 0 };

  const edge = (k, scale) => Math.round(k * scale); // skärmpixel för rutkoordinat k, scale = pixlar per ruta

  // Vilka terrängbilder som är laddade (en ändring ritar om alla brickor)
  const loadedTerrainImages = () => {
    let key = '';
    for (const id in Config.terrain) {
      const image = Config.terrain[id].image;
      for (const source of Array.isArray(image) ? image : [image]) key += Assets.get(source) ? 1 : 0;
    }
    return key;
  };

  // Variation: sten och träd speglas slumpvis, så att intilliggande rutor inte blir identiska kopior
  const CLUSTERS = new Set(['rock', 'tree']);
  // Ritar bilden spegelvänd (flipX / flipY) i rektangeln
  const drawFlipped = (context, image, left, top, width, height, flipX, flipY) => {
    if (!flipX && !flipY) return context.drawImage(image, left, top, width, height);
    context.save();
    context.translate(left + (flipX ? width : 0), top + (flipY ? height : 0));
    context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    context.drawImage(image, 0, 0, width, height);
    context.restore();
  };

  // Mjuka hörn: sand, vatten och lera mot gräs får rundade yttre hörn, så att fläckarna ser organiska ut i stället för att bestå av kvadrater.
  // Ett hörn rundas när båda grannarna vid hörnet är gräs. Gräsbilden ritas över hörnet utanför en kvartscirkel.
  const ROUNDED = new Set(['sand', 'water', 'clay']), CORNER_RADIUS = 0.34;
  const roundCorners = (context, x, y, left, top, width, height) => {
    const grass = Assets.getVariant(Config.terrain.grass.image, x, y);
    if (!grass) return;
    const isGrass = (dx, dy) => World.getTile(x + dx, y + dy)?.terrainType === 'grass';
    const radius = width * CORNER_RADIUS;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (!isGrass(dx, 0) || !isGrass(0, dy)) continue;
      context.save();
      context.translate(left + (dx > 0 ? width : 0), top + (dy > 0 ? height : 0));
      context.scale(dx, dy);
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(radius, 0);
      context.arc(radius, radius, radius, -Math.PI / 2, Math.PI, true);
      context.closePath();
      context.clip();
      context.drawImage(grass, 0, 0, width, height);
      context.restore();
    }
  };

  // Ritar brickan med sitt övre vänstra hörn i origo; types (valfri) får rutornas terrängtyper
  const paintTerrainChunk = (context, cx, cy, scale, tileSize, types) => {
    const N = TERRAIN_CHUNK, x0 = edge(cx * N, scale), y0 = edge(cy * N, scale), factor = scale / tileSize;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = cx * N + i, y = cy * N + j, type = World.getTile(x, y).terrainType, terrain = Config.terrain[type];
      const left = edge(x, scale) - x0, top = edge(y, scale) - y0;
      const width = edge(x + 1, scale) - x0 - left, height = edge(y + 1, scale) - y0 - top;
      if (types) types[j * N + i] = type;
      const image = Assets.getVariant(terrain.image, x, y);
      const clustered = image && CLUSTERS.has(type);
      context.fillStyle = terrain.color;
      context.fillRect(left, top, width, height);
      if (clustered) drawFlipped(context, image, left, top, width, height, Utils.hash(x, y, 80) < 0.5, false);
      else if (image) {
        context.drawImage(image, left, top, width, height);
        if (ROUNDED.has(type)) roundCorners(context, x, y, left, top, width, height);
      }
      else if (terrain.fallbackShape && CityBuilder.Shapes[terrain.fallbackShape]) {
        context.save();
        context.translate(left, top);
        context.scale(factor, factor);
        CityBuilder.Shapes[terrain.fallbackShape](context, 0, 0, tileSize);
        context.restore();
      }
    }
  };

  const terrainChanged = (chunk, cx, cy) => {
    const N = TERRAIN_CHUNK;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (World.getTile(cx * N + i, cy * N + j).terrainType !== chunk.types[j * N + i]) return true;
    }
    return false;
  };

  const buildTerrainChunk = (chunk, cx, cy, scale, tileSize) => {
    const N = TERRAIN_CHUNK, width = edge((cx + 1) * N, scale) - edge(cx * N, scale), height = edge((cy + 1) * N, scale) - edge(cy * N, scale);
    if (!chunk.canvas) chunk.canvas = document.createElement('canvas');
    const canvas = chunk.canvas;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    paintTerrainChunk(canvas.getContext('2d'), cx, cy, scale, tileSize, chunk.types);
  };

  Renderer.addLayer('terrain', (context, renderer) => {
    const range = renderer.visibleTileRange(), tileSize = renderer.tileSize, now = performance.now(), view = terrainView;
    const zoom = renderer.zoom * renderer.pixelRatio, scale = tileSize * zoom, N = TERRAIN_CHUNK;

    if (scale !== view.scale) { view.scale = scale; view.since = now; terrainChunks.clear(); }
    if (now - view.checkedAt >= TERRAIN_CHECK_MS) {
      view.checkedAt = now;
      const images = loadedTerrainImages();
      if (images !== view.images) { view.images = images; terrainChunks.clear(); }
    }
    const cached = now - view.since >= TERRAIN_SETTLE_MS;
    const shiftX = Math.round(renderer.camera.x * zoom), shiftY = Math.round(renderer.camera.y * zoom);
    let builds = 0;

    context.save();
    for (let cy = Math.floor(range.minY / N); cy <= Math.floor(range.maxY / N); cy++) {
      for (let cx = Math.floor(range.minX / N); cx <= Math.floor(range.maxX / N); cx++) {
        const reach = Vision.cellSize();   // dimmans mjuka kant når en cell in i brickan: grannceller räknas också
        if (!Vision.anyVisible(Players.HUMAN, cx * N - reach, cy * N - reach, cx * N + N - 1 + reach, cy * N + N - 1 + reach)) continue;   // bara dimma: ritas inte
        const x = edge(cx * N, scale) - shiftX, y = edge(cy * N, scale) - shiftY;
        let chunk;
        if (cached) {
          const key = cx + ',' + cy;
          chunk = terrainChunks.get(key);
          if (!chunk) { chunk = { canvas: null, types: new Array(N * N), checkedAt: -Infinity }; terrainChunks.set(key, chunk); }
          chunk.usedAt = now;
          if (now - chunk.checkedAt >= TERRAIN_CHECK_MS && (chunk.canvas || builds < TERRAIN_BUILDS)) {
            chunk.checkedAt = now;
            if (terrainChanged(chunk, cx, cy)) { builds++; buildTerrainChunk(chunk, cx, cy, scale, tileSize); }
          }
        }
        if (chunk && chunk.canvas) {
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.drawImage(chunk.canvas, x, y);
        } else {
          context.setTransform(1, 0, 0, 1, x, y);
          paintTerrainChunk(context, cx, cy, scale, tileSize, null);
        }
      }
    }
    context.restore();

    if (now - view.pruneAt > 5000) {
      view.pruneAt = now;
      for (const [key, chunk] of terrainChunks) if (now - chunk.usedAt > TERRAIN_KEEP_MS) terrainChunks.delete(key);
    }
  });

  // Stigar: en mjukt rundad stig med fast bredd, fylld med stigbilden som mönster. Slitaget styr genomskinligheten
  // (som förut): svagt slitna rutor är genomskinliga, och från 100 % används path_worn-bilden. Den ritas i brickor på
  // 16x16 rutor som cachas på egna canvaser och bara ritas om när en ruta byter slitagenivå eller en byggnad ändras
  // (kontrolleras högst 10 gånger per sekund). Varje bildruta kostar alltså bara en drawImage per synlig bricka.
  const PATH_IMAGES = { partial: 'images/paths/path.png', worn: 'images/paths/path_worn.png' };
  const PATH_CHUNK = 16;                 // rutor per bricka
  const PATH_CHECK_MS = 100;             // hur ofta en bricka kontrolleras efter ändringar
  const PATH_FADE_MS = 350;              // en bricka som ändras tonas över från sin förra bild (bara på hög grafik)
  const PATH_KEEP_MS = 20000;            // oanvända brickor släpps efter så här lång tid
  const PATH_WIDTH = 0.6;                // stigens bredd i rutor
  const PATH_EDGE = 0.11;                // den mjuka kantens bredd i rutor (ca 4 px) vid medel och hög grafik
  const PATH_ALPHA = [0, 0.225, 0.45, 0.675, 0.9, 1]; // nivå 1-4: slitage under 100 %, nivå 5: minst 100 %
  const GRID = PATH_CHUNK + 2;           // brickan + en ruta runt om, för att se grannarna
  const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const grid = new Uint8Array(GRID * GRID);
  const built = new Uint8Array(GRID * GRID);
  const ground = new Uint8Array(GRID * GRID);
  const pathChunks = new Map();
  const pathStyle = { tileSize: 0, soft: false, partialImage: null, wornImage: null, partial: '#655', worn: '#777' };

  const wearLevel = wear => (wear >= 1 ? 5 : Math.round(wear * 4));

  // Mönstren byggs om när bilderna eller rutstorleken ändras (t.ex. "Shapes only")
  const updatePathStyle = (context, tileSize, soft) => {
    const config = Object.assign({}, PATH_IMAGES, Config.settings.pathImages); // valfritt i settings.js
    const partialImage = Assets.get(config.partial) || null, wornImage = Assets.get(config.worn) || null;
    if (partialImage === pathStyle.partialImage && wornImage === pathStyle.wornImage && tileSize === pathStyle.tileSize && soft === pathStyle.soft) return;
    const makePattern = (image, fallback) => {
      if (!image) return fallback;
      try {
        const pattern = context.createPattern(image, 'repeat');
        if (pattern && pattern.setTransform && image.width) pattern.setTransform(new DOMMatrix().scale(tileSize / image.width, tileSize / image.height));
        return pattern || fallback;
      } catch (error) { return fallback; }
    };
    Object.assign(pathStyle, {
      tileSize, soft, partialImage, wornImage,
      partial: makePattern(partialImage, '#655'),
      worn: makePattern(wornImage, null) || makePattern(partialImage, '#777'),
    });
    pathChunks.clear();
  };

  // Fyller grid (slitagenivåer) och built (byggnader) för brickan och en ruta runt om. Returnerar en checksumma,
  // eller 0 om brickan saknar stig.
  const readPathGrid = chunk => {
    let hash = 1, count = 0;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const x = chunk.cx * PATH_CHUNK + i - 1, y = chunk.cy * PATH_CHUNK + j - 1, index = j * GRID + i;
      const isBuilt = World.buildingAt(x, y) ? 1 : 0;
      const tile = World.getTile(x, y);
      const isGrass = tile && tile.terrainType === 'grass' ? 1 : 0;
      const level = isGrass && !isBuilt ? wearLevel(tile.wear) : 0; // stigar bara på gräs, och inte under byggnader
      grid[index] = level;
      ground[index] = isGrass;
      built[index] = isBuilt;
      if (level && i > 0 && j > 0 && i <= PATH_CHUNK && j <= PATH_CHUNK) count++;
      hash = (Math.imul(hash, 31) + level + isBuilt * 8 + isGrass * 16) | 0;
    }
    return count ? hash : 0;
  };

  // Varje ruta binder ihop mittpunkterna på kanterna mot sina grannar (med rutans mitt som kontrollpunkt, så
  // hörnen blir rundade). Allt blir en enda form som fylls med mönstret en gång per slitagenivå, begränsad till
  // rutorna på den nivån. Då får överlappande delar aldrig dubbel genomskinlighet. Mot en byggnad fortsätter
  // stigen in i byggnadens ruta. Brickan ritas bara inom sin egen yta: grannbrickan fortsätter exakt vid kanten.
  const drawPathChunk = (chunk, tileSize, soft) => {
    const size = PATH_CHUNK * tileSize;
    if (!chunk.canvas) chunk.canvas = document.createElement('canvas');
    const canvas = chunk.canvas, context = canvas.getContext('2d');
    if (canvas.width !== size) canvas.width = canvas.height = size;
    else { context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, size, size); } // nollställ förskjutningen från förra ritningen först

    const shape = new Path2D(), rects = [null, [], [], [], [], []], half = tileSize / 2;
    const originX = (chunk.cx * PATH_CHUNK - 1) * tileSize, originY = (chunk.cy * PATH_CHUNK - 1) * tileSize; // världsposition för grid[0]
    const ends = [];
    for (let j = 1; j <= PATH_CHUNK; j++) for (let i = 1; i <= PATH_CHUNK; i++) {
      const level = grid[j * GRID + i];
      if (!level) continue;
      const x = originX + i * tileSize, y = originY + j * tileSize, cx = x + half, cy = y + half;
      rects[level].push(x, y);

      ends.length = 0;
      for (const [dx, dy] of DIRECTIONS) {
        const neighbor = (j + dy) * GRID + i + dx;
        if (dx && dy) {
          // Diagonaler bara när rutorna inte redan hänger ihop via en intilliggande ruta
          if (grid[neighbor] && !grid[j * GRID + i + dx] && !grid[(j + dy) * GRID + i]) {
            ends.push(cx + dx * half, cy + dy * half);
            if (ground[j * GRID + i + dx]) rects[level].push(x + dx * tileSize, y);
            if (ground[(j + dy) * GRID + i]) rects[level].push(x, y + dy * tileSize); // hörnrutorna, bara om de är gräs
          }
        } else if (grid[neighbor]) {
          ends.push(cx + dx * half, cy + dy * half);                 // mitt på kanten
        } else if (built[neighbor] && ground[neighbor]) {
          ends.push(cx + dx * tileSize, cy + dy * tileSize);         // in till byggnadens mitt
          rects[level].push(x + dx * tileSize, y + dy * tileSize);   // byggnadens ruta får också stigen
        }
      }

      if (ends.length === 0) { shape.moveTo(cx, cy); shape.lineTo(cx + 0.01, cy); }   // ensam ruta: en prick
      else if (ends.length === 4) { shape.moveTo(ends[0], ends[1]); shape.quadraticCurveTo(cx, cy, ends[2], ends[3]); }
      else for (let k = 0; k < ends.length; k += 2) { shape.moveTo(cx, cy); shape.lineTo(ends[k], ends[k + 1]); }
    }

    // Världskoordinater, så att mönstret fortsätter obrutet mellan brickor
    context.setTransform(1, 0, 0, 1, -chunk.cx * size, -chunk.cy * size);
    context.lineCap = context.lineJoin = 'round';
    const width = tileSize * PATH_WIDTH, edge = tileSize * PATH_EDGE;
    for (let level = 1; level <= 5; level++) {
      const list = rects[level];
      if (!list.length) continue;
      context.save();
      context.beginPath();
      for (let k = 0; k < list.length; k += 2) context.rect(list[k], list[k + 1], tileSize, tileSize);
      context.clip();
      context.strokeStyle = level === 5 ? pathStyle.worn : pathStyle.partial;
      const alpha = PATH_ALPHA[level];
      if (soft) {
        // Mjuk kant: tre linjer, bredast och svagast först, så att kanten går från osynlig till full över ca PATH_EDGE. Alfavärdena
        // är valda så att de tre lagren tillsammans ger 1/3, 2/3 och hela den slitagenivåns genomskinlighet
        for (let step = 0; step < 3; step++) {
          context.lineWidth = width + edge * 2 * (2 - step) / 2;
          context.globalAlpha = step === 0 ? alpha / 3 : (alpha / 3) / (1 - alpha * step / 3);
          context.stroke(shape);
        }
      } else {
        context.lineWidth = width; context.globalAlpha = alpha;
        context.stroke(shape);
      }
      context.restore();
    }
  };

  // Blandar brickans förra bild (fadeFrom) och nya bild (canvas): gammal * (1 - p) + ny * p, på en delad canvas. Mellanläget hamnar
  // därmed mellan de två (lägger man bara den nya ovanpå den gamla blir stigen för stark mitt i toningen och faller tillbaka).
  const blend = document.createElement('canvas');
  const blendPath = (chunk, progress, size) => {
    if (blend.width !== size) blend.width = blend.height = size;
    const context = blend.getContext('2d');
    context.globalCompositeOperation = 'copy';
    context.globalAlpha = 1 - progress;
    context.drawImage(chunk.fadeFrom, 0, 0);
    if (chunk.canvas) {
      context.globalCompositeOperation = 'lighter';   // adderar förmultiplicerade färger: en exakt blandning
      context.globalAlpha = progress;
      context.drawImage(chunk.canvas, 0, 0);
    }
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    return blend;
  };

  let lastPathPrune = 0;
  Renderer.addLayer('paths', (context, renderer) => {
    const range = renderer.visibleTileRange(), tileSize = renderer.tileSize, now = performance.now(), gfx = CityBuilder.Options.gfx;
    updatePathStyle(context, tileSize, gfx.softEdges);

    for (let cy = Math.floor(range.minY / PATH_CHUNK); cy <= Math.floor(range.maxY / PATH_CHUNK); cy++) {
      for (let cx = Math.floor(range.minX / PATH_CHUNK); cx <= Math.floor(range.maxX / PATH_CHUNK); cx++) {
        const key = cx + ',' + cy;
        let chunk = pathChunks.get(key);
        if (!chunk) { chunk = { cx, cy, canvas: null, hash: -1, checkedAt: -Infinity }; pathChunks.set(key, chunk); }
        chunk.usedAt = now;

        if (now - chunk.checkedAt >= PATH_CHECK_MS) {
          chunk.checkedAt = now;
          const hash = readPathGrid(chunk);
          if (hash !== chunk.hash) {
            const fade = gfx.pathFade && chunk.hash !== -1;   // första ritningen av en bricka (hash -1) tonas inte
            if (fade) {
              // Toningen startar från det som syns nu: den förra bilden, eller mitt i en pågående toning den halvvägs blandade bilden
              const size = PATH_CHUNK * tileSize, from = chunk.fadeCanvas || (chunk.fadeCanvas = document.createElement('canvas'));
              const current = chunk.fadeFrom ? blendPath(chunk, Math.min(1, (now - chunk.fadeAt) / PATH_FADE_MS), size) : chunk.canvas;
              if (current !== from) {
                if (from.width !== size) from.width = from.height = size; else from.getContext('2d').clearRect(0, 0, size, size);
                if (current) from.getContext('2d').drawImage(current, 0, 0);
              }
              chunk.fadeFrom = from; chunk.fadeAt = now;
            } else chunk.fadeFrom = null;
            chunk.hash = hash;
            if (hash) drawPathChunk(chunk, tileSize, gfx.softEdges); else chunk.canvas = null; // tom bricka: släpp canvasen
          }
        }
        const x = cx * PATH_CHUNK * tileSize, y = cy * PATH_CHUNK * tileSize;
        if (chunk.fadeFrom) {
          // Den gamla bilden tonas över i den nya: ändrade rutor växer fram i stället för att hoppa
          const progress = (now - chunk.fadeAt) / PATH_FADE_MS;
          if (progress >= 1 || !gfx.pathFade) chunk.fadeFrom = null;
          else { context.drawImage(blendPath(chunk, progress, PATH_CHUNK * tileSize), x, y); continue; }
        }
        if (chunk.canvas) context.drawImage(chunk.canvas, x, y);
      }
    }

    if (now - lastPathPrune > 5000) {
      lastPathPrune = now;
      for (const [key, chunk] of pathChunks) if (now - chunk.usedAt > PATH_KEEP_MS) pathChunks.delete(key);
    }
  });

  // Skylt på byggnader med inriktning eller recept (gruva, samlare, kök, verktygssmed ...): visar vad den gör just nu. Bilden är
  // images/signs/<nyckel>.png (nyckeln är varans id, eller recept.sign), och saknas den ritas en bricka med varans ikon.
  const SIGN_DIR = 'images/signs/';
  const signOf = building => {
    const definition = building.definition, job = definition.job;
    if (!job || building.buildProgress < 1) return null;
    if (definition.group) { const id = job.outputResource ?? Object.keys(job.outputs || {})[0]; return { key: definition.sign || id, resource: id }; }
    if (!job.choices || definition.isMarket) return null;
    const recipe = CityBuilder.Behaviors.recipe(building), made = Object.keys(recipe.outputs)[0];
    const distinct = new Set(job.choices.map(choice => Object.keys(choice.outputs)[0])).size > 1;   // lika varor (köket): receptet känns igen på sina insatser
    const resource = distinct ? made : Object.keys(recipe.inputs || {})[0] || made;
    return { key: recipe.sign || resource, resource };
  };
  const drawSign = (context, building, x, y, size) => {
    const sign = signOf(building);
    if (!sign) return;
    const s = size * .4, left = x + size - s - 1, top = y + size - s - 1;
    context.fillStyle = 'rgba(20,16,12,.75)'; context.strokeStyle = 'rgba(232,220,200,.8)'; context.lineWidth = 1;
    context.fillRect(left, top, s, s); context.strokeRect(left + .5, top + .5, s - 1, s - 1);
    const image = Assets.get(SIGN_DIR + sign.key + '.png'), resource = Config.resources[sign.resource], icon = image || (resource && Assets.get(resource.image));
    if (icon) context.drawImage(icon, left + 1, top + 1, s - 2, s - 2);
    else if (resource) { context.fillStyle = resource.color; context.fillRect(left + 3, top + 3, s - 6, s - 6); }
  };

  Renderer.addLayer('buildings', (context, renderer) => {
    const tileSize = renderer.tileSize, view = renderer.viewBounds(tileSize);
    for (const building of World.buildings) {
      const x = building.x * tileSize, y = building.y * tileSize;
      if (outside(view, x, y) || hidden(building)) continue;
      const isFinished = building.buildProgress >= 1, image = Assets.get(building.definition.image);
      context.globalAlpha = isFinished ? (building.paused ? .5 : 1) : .7;

      if (building.definition.pile) { // hög på marken: en jordhög, varorna ritas som ikoner nedan
        context.fillStyle = 'rgb(70 50 30 / 70%)';
        context.beginPath(); context.ellipse(x + tileSize / 2, y + tileSize * .62, tileSize * .38, tileSize * .24, 0, 0, Math.PI * 2); context.fill();
      } else if (image) context.drawImage(image, x, y, tileSize, tileSize);
      else {
        context.fillStyle = building.definition.color;
        context.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);
        context.fillStyle = '#111'; context.font = 'bold 16px system-ui';
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(building.definition.symbol || '?', x + tileSize / 2, y + tileSize / 2 + 1);
      }
      context.globalAlpha = 1;
      drawSign(context, building, x, y, tileSize);

      if (!isFinished) { // byggframsteg
        context.fillStyle = '#000'; context.fillRect(x + 3, y + tileSize - 8, tileSize - 6, 5);
        context.fillStyle = '#5fb55f'; context.fillRect(x + 3, y + tileSize - 8, (tileSize - 6) * building.buildProgress, 5);
        renderer.drawResourceIcons(context, CityBuilder.Construction.missing(building), x, y + 1);   // det som ännu ska bäras hit
      } else if (!building.definition.isStorage) {
        renderer.drawResourceIcons(context, building.inputStock, x, y + tileSize - 10);
        renderer.drawResourceIcons(context, building.outputStock, x, y + (building.definition.pile ? tileSize * .42 : 1));
      }
      if (building.player !== CityBuilder.Players.HUMAN) { // andra spelares byggnader: ram i spelarens färg
        context.strokeStyle = CityBuilder.Config.settings.playerColors[building.player] || '#fff'; context.lineWidth = 2;
        context.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
      }
      if (building.hp < building.maxHp) { // skadad byggnad: livsmätare
        context.fillStyle = '#000'; context.fillRect(x + 3, y + 1, tileSize - 6, 4);
        context.fillStyle = '#d65a4a'; context.fillRect(x + 3, y + 2, (tileSize - 6) * Math.max(0, building.hp) / building.maxHp, 2);
      }
      if (building === CityBuilder.Game.selectedBuilding) {
        context.strokeStyle = '#fff'; context.lineWidth = 2;
        context.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
      }
    }
  });

  // Väljer bild: byggnadsspecifik (med last) -> byggnadsspecifik -> enhetens lastbild -> enhetens bild.
  // Fält som saknas, eller filer som inte laddas, hoppas över. Slutar det med null ritas reservgrafik.
    // Väljer bild (kan vara ett ark, se definition.frame): byggnadsspecifik (med last) -> byggnadsspecifik -> enhetens lastbild -> enhetens bild.
  // Fält som saknas, eller filer som inte laddas, hoppas över. Slutar det med null ritas reservgrafik.
  const getImage = source => source ? Assets.get(source) : null;
  const findUnitImage = unit => {
    const definition = unit.definition, isCarrying = !!unit.carriedResource;
    const forBuilding = unit.homeBuilding && definition.imagesByBuilding && definition.imagesByBuilding[unit.homeBuilding.type];
    return (forBuilding && ((isCarrying && getImage(forBuilding.imageCarrying)) || getImage(forBuilding.image)))
      || (isCarrying && getImage(definition.imageCarrying))
      || getImage(definition.image)
      || null;
  };

  // Rader i arket: 0 stilla, 1 upp, 2 höger, 3 ner, 4 vänster, 5 upp/höger, 6 ner/höger, 7 ner/vänster, 8 upp/vänster (kan åsidosättas med definition.rows)
  const ROWS = { idle: 0, up: 1, right: 2, down: 3, left: 4, up_right: 5, down_right: 6, down_left: 7, up_left: 8 };

  // Rörelsens riktning: 4 (eller 8 om arket har diagonalrader)
  const directionOf = (moveX, moveY, eight) => {
    const horizontal = moveX < 0 ? 'left' : 'right', vertical = moveY < 0 ? 'up' : 'down';
    if (eight) {
      const steep = Math.abs(moveY) / (Math.abs(moveX) + Math.abs(moveY)); // 0 = rakt i sidled, 1 = rakt upp/ner
      if (steep > .29 && steep < .71) return vertical + '_' + horizontal;
    }
    return Math.abs(moveX) >= Math.abs(moveY) ? horizontal : vertical;
  };

  Renderer.addLayer('units', (context, renderer) => {
    const tileSize = renderer.tileSize, now = performance.now(); // animationen går på verklig tid: lika snabb vid 30 som vid 144 fps
    const gfx = CityBuilder.Options.gfx;
    context.imageSmoothingQuality = gfx.smoothing ? 'high' : 'low';
    const view = renderer.viewBounds(tileSize * 2);
    for (const unit of World.units) {
      if (outside(view, unit.x * tileSize, unit.y * tileSize) || hidden(unit)) { unit.lastX = unit.x; unit.lastY = unit.y; continue; } // förflyttningen utanför bild ger ingen riktning
      const definition = unit.definition, image = findUnitImage(unit);
      const frameW = image && (definition.frame || image.naturalWidth), frameH = image && (definition.frame || image.naturalHeight);
      const cols = image ? Math.max(1, Math.floor(image.naturalWidth / frameW)) : 1, rows = image ? Math.max(1, Math.floor(image.naturalHeight / frameH)) : 1;

      // Rörelse sedan förra bilden: riktning (står enheten still behålls den) och tidpunkt för senaste rörelse
      const moveX = unit.x - (unit.lastX ?? unit.x), moveY = unit.y - (unit.lastY ?? unit.y);
      if (Math.abs(moveX) > 1e-4) unit.faceLeft = moveX < 0;
      if (Math.abs(moveX) + Math.abs(moveY) > 1e-4) { unit.direction = directionOf(moveX, moveY, rows >= 9); unit.lastMoveAt = now; }
      unit.lastX = unit.x; unit.lastY = unit.y;

      const pixelX = unit.x * tileSize, pixelY = unit.y * tileSize;
      if (image) {
        const size = definition.imageSize;
        // 150 ms eftersläp så att enheten inte växlar mellan gå och stå mellan bildrutor
        const moving = now - (unit.lastMoveAt ?? -1e9) < 150;
        // Flera kolumner = animation (både stilla och gående), annars kolumn 0
        const column = cols > 1 && gfx.spriteAnimation ? Math.floor(now / 1000 * (definition.animFps || 8) + (unit.animOffset ??= Math.random() * 100)) % cols : 0;

        // Rad: 9+ rader = 8 riktningar, 5+ = 4 riktningar (diagonal -> sidoriktning), 2+ = rad 1 för all gång, 1 = rad 0 för allt
        const map = definition.rows || ROWS;
        let row = 0;
        if (moving && rows > 1) {
          const direction = unit.direction || 'right';
          row = rows >= 5 ? (map[rows >= 9 ? direction : direction.split('_').pop()] ?? 1) : 1;
        } else if (rows > 1) row = map.idle ?? 0;
        row = Math.min(row, rows - 1);

        // Utan vänsterrad (färre än 5 rader) speglas bilden åt vänster. imageFacesLeft: true om bilden ser åt vänster.
        const mirror = rows < 5 && !!unit.faceLeft !== !!definition.imageFacesLeft;
        if (mirror) {
          context.save(); context.translate(pixelX, pixelY); context.scale(-1, 1);
          context.drawImage(image, column * frameW, row * frameH, frameW, frameH, -size / 2, -size / 2, size, size);
          context.restore();
        } else context.drawImage(image, column * frameW, row * frameH, frameW, frameH, pixelX - size / 2, pixelY - size / 2, size, size);
      }
      else {
        context.fillStyle = definition.color;
        if (definition.fallbackShape === 'circle') { context.beginPath(); context.arc(pixelX, pixelY, definition.fallbackSize, 0, 7); context.fill(); }
        else context.fillRect(pixelX - definition.fallbackSize / 2, pixelY - definition.fallbackSize / 2, definition.fallbackSize, definition.fallbackSize);
      }
      if (unit.carriedResource) {
        const resource = Config.resources[unit.carriedResource], resourceImage = Assets.get(resource.image);
        if (resourceImage) context.drawImage(resourceImage, pixelX - 6, pixelY - 18, 12, 12);
        else { context.fillStyle = resource.color; context.fillRect(pixelX - 3, pixelY - 13, 7, 7); }
      }
    }
  });

  // Strid: lagfärgad ring runt soldater, livsmätare på skadade enheter, attackstreck och soldaträknare på garnisoner
  Renderer.addLayer('combat', (context, renderer) => {
    const tileSize = renderer.tileSize, colors = Config.settings.playerColors, view = renderer.viewBounds(tileSize * 2);

    for (const unit of World.units) {
      const definition = unit.definition, pixelX = unit.x * tileSize, pixelY = unit.y * tileSize;
      if (outside(view, pixelX, pixelY) || hidden(unit)) continue;

      if (definition.isSoldier) {
        context.beginPath();
        context.arc(pixelX, pixelY, definition.imageSize / 2 + 1, 0, Math.PI * 2);
        context.lineWidth = 1;
        context.strokeStyle = colors[unit.player] || '#fff';
        context.stroke();
      }

      if (unit.hp != null && unit.hp < definition.maxHp) {
        const width = 14, top = pixelY - definition.imageSize / 2 - 5;
        context.fillStyle = '#000';
        context.fillRect(pixelX - width / 2 - 1, top - 1, width + 2, 4);
        context.fillStyle = '#5fb55f';
        context.fillRect(pixelX - width / 2, top, width * Math.max(0, unit.hp) / definition.maxHp, 2);
      }
    }

    context.lineWidth = 2;
    for (const effect of CityBuilder.Combat.effects) {
      if (!Vision.visible(Players.HUMAN, effect.x2, effect.y2) && !Vision.visible(Players.HUMAN, effect.x1, effect.y1)) continue;
      context.strokeStyle = '#fff';
      context.globalAlpha = Math.min(1, effect.life / 0.18);
      context.beginPath();
      context.moveTo(effect.x1 * tileSize, effect.y1 * tileSize);
      context.lineTo(effect.x2 * tileSize, effect.y2 * tileSize);
      context.stroke();
    }
    context.globalAlpha = 1;

    // Pilar: ett kort skaft med spets, riktat från skytten mot målet
    context.strokeStyle = '#d8b16a'; context.lineWidth = 2; context.lineCap = 'round';
    for (const shot of CityBuilder.Combat.projectiles) {
      if (!Vision.visible(Players.HUMAN, shot.x, shot.y) && !Vision.visible(Players.HUMAN, shot.fromX, shot.fromY)) continue;
      const length = Math.hypot(shot.toX - shot.fromX, shot.toY - shot.fromY) || 1;
      const dx = (shot.toX - shot.fromX) / length * 0.5, dy = (shot.toY - shot.fromY) / length * 0.5; // skaftet är en halv ruta
      context.beginPath();
      context.moveTo((shot.x - dx) * tileSize, (shot.y - dy) * tileSize);
      context.lineTo(shot.x * tileSize, shot.y * tileSize);
      context.stroke();
    }
    context.lineCap = 'butt';

    context.font = 'bold 10px system-ui';
    context.textAlign = 'right';
    context.textBaseline = 'top';
    for (const building of World.buildings) {
      if (building.buildProgress < 1 || !CityBuilder.Garrison.isGarrison(building) || outside(view, building.x * tileSize, building.y * tileSize) || hidden(building)) continue;
      const text = CityBuilder.Garrison.count(building) + '/' + CityBuilder.Garrison.capacity(building);
      const right = (building.x + 1) * tileSize - 3, top = building.y * tileSize + 2;
      context.fillStyle = '#000';
      context.fillText(text, right + 1, top + 1);
      context.fillStyle = '#fff';
      context.fillText(text, right, top);
    }
  });

  // Dimma (Vision): det spelaren inte ser suddas ut ur spelcanvasen (hål), och dimmans textur ligger som vanlig CSS-bakgrund bakom
  // canvasen, så webbläsaren ritar den utan kostnad. Täckningen är en liten alfamask (en pixel per cell). Den skalas upp med utjämning
  // till en liten canvas med några pixlar per skärmpixel-steg (mjuka kanter), som sedan ritas rakt av i världens koordinater: pan och zoom
  // kostar bara den ritningen, och ingenting stort behöver byggas om. Masken räknas om bara när synfältet, fönstret, zoomen eller
  // blekande celler ändrats. Texturen ligger fast på skärmen.
  const FOG_FADE_MS = 100;         // hur ofta blekande celler uppdateras
  const FOG_STEP = 6;              // ungefär så många skärmpixlar per steg i den uppskalade masken
  const fog = { cells: document.createElement('canvas'), mask: document.createElement('canvas'), key: '', state: 0, at: 0, version: -1 };

  // En bild som täcker skärmen sträcks över den, en mindre läggs som mönster
  {
    const { image: source, color } = Config.settings.vision, style = document.body.style;
    style.backgroundColor = color;
    if (source) {
      const image = new Image();
      image.onload = () => {
        const cover = image.naturalWidth >= innerWidth && image.naturalHeight >= innerHeight;
        style.backgroundImage = `url("${source}?v=${window.version}")`;
        style.backgroundSize = cover ? 'cover' : 'auto';
        style.backgroundRepeat = cover ? 'no-repeat' : 'repeat';
        style.backgroundPosition = 'center';
      };
      image.src = source + '?v=' + window.version;
    }
  }

  // Väder och dygn: nattens blå dunkel, regn, dimma, blixtar och tornados. Ritas över allt i världen men före dimman och gränssnittet.
  const frac = value => value - Math.floor(value);
  Renderer.addLayer('weather', (context, renderer) => {
    const Weather = CityBuilder.Weather, view = renderer.viewBounds(0), width = view.right - view.left, height = view.bottom - view.top, zoom = renderer.zoom;
    const night = Weather.darkness(), now = performance.now() / 1000;
    context.save();
    if (night > 0) { context.fillStyle = `rgba(8,14,44,${Config.settings.weather.nightDarkness * night})`; context.fillRect(view.left, view.top, width, height); }
    const type = Weather.type;
    if (type === 'rain' || type === 'storm') {   // grått dunkel och diagonala streck
      const storm = type === 'storm';
      context.fillStyle = `rgba(30,40,55,${storm ? .22 : .1})`; context.fillRect(view.left, view.top, width, height);
      context.strokeStyle = 'rgba(190,210,235,.45)'; context.lineWidth = 1 / zoom;
      const count = storm ? 260 : 130, length = (storm ? 16 : 11) / zoom, fall = (storm ? 900 : 600) / zoom;
      context.beginPath();
      for (let i = 0; i < count; i++) {
        const x = view.left + frac(i * 0.618034 + now * 0.05) * (width + length), y = view.top + frac(i * 0.381966 + now * fall / height * (.8 + (i % 5) * .1)) * height;
        context.moveTo(x, y); context.lineTo(x - length * .3, y + length);
      }
      context.stroke();
    }
    if (type === 'fog') { context.fillStyle = `rgba(205,214,220,${.26 + .05 * Math.sin(now * .6)})`; context.fillRect(view.left, view.top, width, height); }
    if (Weather.flash > 0) { context.fillStyle = `rgba(235,240,255,${.45 * Weather.flash})`; context.fillRect(view.left, view.top, width, height); }
    const size = renderer.tileSize;
    for (const tornado of Weather.tornadoes) {   // tratt av grå ellipser som snurrar, med skräp runt
      const cx = (tornado.x + .5) * size, cy = (tornado.y + .5) * size, reach = tornado.radius * size, grow = Math.min(1, tornado.age / 1.5), fade = Math.min(1, ((tornado.life ?? 7) - tornado.age) / 1.5 + .2);
      context.globalAlpha = Math.max(0, Math.min(1, fade));
      for (let ring = 0; ring < 7; ring++) {
        const k = ring / 6, rx = reach * (.25 + .75 * k) * grow, y = cy - (1 - k) * reach * 1.6 * grow, sway = Math.sin(now * 3 + ring) * size * .15;
        context.fillStyle = `rgba(${95 + ring * 12},${100 + ring * 12},${108 + ring * 12},.6)`;
        context.beginPath(); context.ellipse(cx + sway, y, rx, rx * .32, 0, 0, Math.PI * 2); context.fill();
      }
      // Det som tornadon dragit upp virvlar runt i tratten: en bild per vara (högst 28, fördelade efter mängd, minst en av varje)
      if (Object.keys(tornado.collected).length) {
        const goods = Object.entries(tornado.collected), total = goods.reduce((sum, [, amount]) => sum + amount, 0), icons = [];
        for (const [id, amount] of goods) for (let n = Math.max(1, Math.round(amount / total * 28)); n > 0 && icons.length < 28; n--) icons.push(id);
        const icon = size * .38;
        icons.forEach((id, i) => {
          const a = now * (1.8 + .6 * (i % 3)) + i * 2.4, r = reach * (.3 + .7 * frac(i * .37)) * grow, lift = frac(i * .61 + now * .3);
          const x = cx + Math.cos(a) * r, y = cy - lift * reach * 1.6 * grow + Math.sin(a) * r * .3, resource = Config.resources[id], image = Assets.get(resource.image);
          if (image) context.drawImage(image, x - icon / 2, y - icon / 2, icon, icon);
          else { context.fillStyle = resource.color; context.fillRect(x - icon / 3, y - icon / 3, icon * .66, icon * .66); }
        });
      }
      context.fillStyle = 'rgba(60,45,30,.8)';
      for (let i = 0; i < 12; i++) {
        const a = now * 4 + i * .52, r = reach * (.4 + .6 * frac(i * .37)), lift = frac(i * .61 + now * .5);
        context.fillRect(cx + Math.cos(a) * r * grow, cy - lift * reach * 1.5 * grow + Math.sin(a) * r * .25, 2 / zoom + 1, 2 / zoom + 1);
      }
    }
    context.restore();
  });

  Renderer.addLayer('fog', (context, renderer) => {
    const unit = renderer.tileSize * Vision.cellSize(), view = renderer.viewBounds(0), now = performance.now();
    const minX = Math.floor(view.left / unit) - 1, minY = Math.floor(view.top / unit) - 1;
    const cols = Math.floor(view.right / unit) + 2 - minX, rows = Math.floor(view.bottom / unit) + 2 - minY;
    const soft = CityBuilder.Options.gfx.softFog;   // lägre grafik: hård dimkant, ingen uppskalad mask
    const factor = soft ? 2 ** Math.ceil(Math.log2(Math.max(1, unit * renderer.zoom * renderer.pixelRatio / FOG_STEP))) : 1;   // uppskalning, i tvåpotenser
    const key = [minX, minY, cols, rows, factor].join();
    if (key !== fog.key || fog.version !== Vision.version || (fog.state === 2 && now - fog.at > FOG_FADE_MS)) {
      fog.key = key; fog.version = Vision.version; fog.at = now;
      fog.state = Vision.mask(Players.HUMAN, fog.cells, minX, minY, cols, rows);
      if (fog.state) {
        const smooth = fog.mask.getContext('2d');
        fog.mask.width = cols * factor; fog.mask.height = rows * factor;
        smooth.imageSmoothingEnabled = soft;
        smooth.drawImage(fog.cells, 0, 0, fog.mask.width, fog.mask.height);
      }
    }
    if (!fog.state) return;

    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.imageSmoothingEnabled = false;
    context.drawImage(fog.mask, minX * unit, minY * unit, cols * unit, rows * unit);
    context.restore();
  });

  Renderer.addLayer('workerLink', (context, renderer) => {
    const building = CityBuilder.Game.selectedBuilding, worker = building && building.workerUnit;
    if (!worker || worker.removed || !building.definition.job || building.definition.job.kind !== 'gather') return;
    const tileSize = renderer.tileSize;
    context.save();
    context.strokeStyle = 'rgba(255, 255, 0, 0.5)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo((building.x + .5) * tileSize, (building.y + .5) * tileSize);
    context.lineTo(worker.x * tileSize, worker.y * tileSize);
    context.stroke();
    context.restore();
  });

  // Statusikoner. Statustexten görs om till sin engelska grundform (I18n.canonicalStatus), så olika stavningar
  // och äldre svenska texter ger samma ikon. Arbetarens status går före byggnadens.
  const ICON_DIR = 'images/ui/icons/';
  const STATUS_ICONS = {
    'No resources': 'warning_grey', 'Local stock full': 'warning_grey', 'Central storage full': 'warning_red', 'Tools missing': 'tools_missing',
    'No animals in range': 'warning_grey', 'Paused': 'paused', 'Missing export': 'error', "Can't reach": 'error',
  };
  const statusIcon = status => {
    if (!status) return null;
    const key = CityBuilder.I18n.canonicalStatus(status);
    return key.startsWith('Missing:') ? 'warning_grey' : STATUS_ICONS[key] || null;
  };
  Renderer.addLayer('ui', (context, renderer) => {
    const tileSize = renderer.tileSize, view = renderer.viewBounds(tileSize);
    const time = performance.now() / 1000, pulse = CityBuilder.Options.gfx.pulse;   // utan puls står ikonerna stilla
    for (const building of World.buildings) {
      if (outside(view, building.x * tileSize, building.y * tileSize) || hidden(building)) continue;
      if (building.player !== Players.HUMAN) continue;   // fiendens byggnader visar inga status- eller effektivitetsikoner (och ingen arbetsframgång)
      // Ineffektiv en längre tid: liten ikon uppe till höger (Config.settings.efficiency: minSeconds, warnBelow, badBelow)
      const inefficiency = CityBuilder.Behaviors.inefficiency(building);
      if (inefficiency) {
        const bad = inefficiency === 'bad';
        const efficiencyIcon = Assets.get(ICON_DIR + (bad ? 'efficiency_bad' : 'efficiency_warn') + '.png') || Assets.get(ICON_DIR + (bad ? 'warning_red' : 'warning_grey') + '.png');
        if (efficiencyIcon) {
          // Pulserar som statusikonerna (röd = snabbare och kraftigare, som "error"). Mittpunkten ligger fast i hörnet.
          const wave = pulse ? (Math.sin(time * (bad ? 6 : 3.5)) + 1) / 2 : .5, iconSize = tileSize * .36 * (1 + wave * (bad ? .3 : .15));
          const centerX = (building.x + 1) * tileSize - tileSize * .18 - 1, centerY = building.y * tileSize + tileSize * .18 + 1;
          context.globalAlpha = .7 + .3 * wave;
          context.drawImage(efficiencyIcon, centerX - iconSize / 2, centerY - iconSize / 2, iconSize, iconSize);
          context.globalAlpha = 1;
        }
      }
      const name = statusIcon(building.workerUnit?.status) || statusIcon(building.status);
      const icon = name && Assets.get(ICON_DIR + name + '.png');
      if (!icon && name === 'tools_missing') {   // saknas bilden (images/ui/icons/tools_missing.png) ritas en orange bricka med korsade verktyg
        const wave = pulse ? (Math.sin(time * 3.5) + 1) / 2 : .5, radius = tileSize * .25 * (1 + wave * .15), cx = (building.x + .5) * tileSize, cy = (building.y + .5) * tileSize;
        context.globalAlpha = .75 + .25 * wave;
        context.fillStyle = '#e08a1e'; context.strokeStyle = '#fff'; context.lineWidth = Math.max(1.5, tileSize * .05);
        context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill(); context.stroke();
        const k = radius * .55;
        context.beginPath(); context.moveTo(cx - k, cy + k); context.lineTo(cx + k, cy - k); context.moveTo(cx - k, cy - k); context.lineTo(cx + k, cy + k); context.stroke();
        context.globalAlpha = 1;
        continue;
      }
      if (icon) {
        const urgent = name === 'error', still = name === 'paused';
        const wave = still ? 0 : pulse ? (Math.sin(time * (urgent ? 6 : 3.5)) + 1) / 2 : .5;
        const size = tileSize / 2 * (1 + wave * (urgent ? .3 : .15));
        context.globalAlpha = still ? 1 : .7 + .3 * wave;
        context.drawImage(icon, (building.x + .5) * tileSize - size / 2, (building.y + .5) * tileSize - size / 2, size, size);
        context.globalAlpha = 1;
        continue;
      }
      if(building.isCrafting) {
        if(building.craftTotalTime > 0) {
          context.strokeStyle = "#000";
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(building.x*tileSize, (building.y*tileSize)+tileSize-2.5);
          context.lineTo((building.x*tileSize)+tileSize, (building.y*tileSize)+tileSize-2.5);
          context.stroke();
          context.closePath();

          const craftProgress = tileSize - ((building.craftTimeLeft/building.craftTotalTime) * tileSize);
          context.strokeStyle = "#0a0";
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(building.x*tileSize, (building.y*tileSize)+tileSize-2.5);
          context.lineTo((building.x*tileSize)+craftProgress, (building.y*tileSize)+tileSize-2.5);
          context.stroke();
          context.closePath();
        }
      }
    }
  });

  Renderer.addLayer('placementGhost', (context, renderer) => {
    const placingType = CityBuilder.Game.placingType;
    if (!placingType || !renderer.hoverTile) return;
    const { x, y } = renderer.hoverTile;
    const isValid = !CityBuilder.Construction.isHidden(x, y, Players.HUMAN) && World.canPlace(placingType, x, y) && !CityBuilder.Construction.isUniqueTaken(placingType, Players.HUMAN) && CityBuilder.Construction.isNearOwnBuilding(x, y, CityBuilder.Players.HUMAN) && Economy.canAfford(Config.buildings[placingType].buildCost);
    // Den valda byggnaden syns genomskinlig på rutan. En svag färgton och en ram visar om den får plats (grön) eller inte (röd).
    const size = renderer.tileSize, px = x * size, py = y * size, definition = Config.buildings[placingType], image = Assets.get(definition.image);
    const color = isValid ? '95,181,95' : '217,83,79';
    context.fillStyle = `rgba(${color},.22)`;
    context.fillRect(px, py, size, size);
    context.globalAlpha = .65;
    if (image) context.drawImage(image, px, py, size, size);
    else {   // utan bilder ("Bara former"): samma reservform som byggnadslagret
      context.fillStyle = definition.color;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
    }
    context.globalAlpha = 1;
    context.strokeStyle = `rgba(${color},.9)`;
    context.lineWidth = 2;
    context.strokeRect(px + 1, py + 1, size - 2, size - 2);
  });

  // Väntande trollformel: ringen visar vad formeln träffar (grön om målet går att välja, annars röd) och en svag ring förtrollarens räckvidd
  // Pågående trollformler: en ring över området som bleknar när tiden går ut (smiter blixtrar till)
  const ZONE_COLORS = { pace: '255,210,63', yield: '120,200,255', carriers: '170,255,230', surge: '120,230,120', smite: '200,90,255', rain: '90,150,255', storm: '170,140,255' };
  Renderer.addLayer('spellZones', (context, renderer) => {
    const size = renderer.tileSize, now = performance.now() / 1000;
    for (const zone of CityBuilder.Spells.zones) {
      const fade = Math.min(1, zone.left / Math.min(3, zone.total)), pulse = zone.kind === 'smite' ? 1 : .75 + .25 * Math.sin(now * 3);
      const color = ZONE_COLORS[zone.kind] || '255,255,255', x = (zone.x + .5) * size, y = (zone.y + .5) * size;
      context.fillStyle = `rgba(${color},${.12 * fade * pulse})`;
      context.strokeStyle = `rgba(${color},${.7 * fade * pulse})`;
      context.lineWidth = 2;
      context.beginPath(); context.arc(x, y, zone.radius * size, 0, Math.PI * 2); context.fill(); context.stroke();
    }
  });

  Renderer.addLayer('spellGhost', (context, renderer) => {
    const casting = CityBuilder.Game.casting;
    if (!casting || !renderer.hoverTile) return;
    const { building, spell } = casting, { x, y } = renderer.hoverTile, size = renderer.tileSize;
    const reach = building.definition.spellRange * size, centre = { x: (building.x + .5) * size, y: (building.y + .5) * size };
    const ok = CityBuilder.Spells.problem(building, spell, x, y);
    const color = ok === null || ok === 'cooldown' || ok === 'cost' ? '95,181,95' : '217,83,79';
    context.lineWidth = 2;
    context.setLineDash([6, 6]);
    context.strokeStyle = 'rgba(255,255,255,.35)';
    context.beginPath(); context.arc(centre.x, centre.y, reach, 0, Math.PI * 2); context.stroke();
    context.setLineDash([]);
    context.fillStyle = `rgba(${color},.2)`;
    context.strokeStyle = `rgba(${color},.9)`;
    context.beginPath(); context.arc((x + .5) * size, (y + .5) * size, (spell.radius + .5) * size, 0, Math.PI * 2); context.fill(); context.stroke();
  });

})(window.CityBuilder);