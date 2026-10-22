/* Renderlager i ritordning: terräng, stigar, byggnader, enheter, placeringsspöke. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Assets, Economy, Renderer, Vision, Players } = CityBuilder;

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

  // Ritar brickan med sitt övre vänstra hörn i origo; types (valfri) får rutornas terrängtyper
  const paintTerrainChunk = (context, cx, cy, scale, tileSize, types) => {
    const N = TERRAIN_CHUNK, x0 = edge(cx * N, scale), y0 = edge(cy * N, scale), factor = scale / tileSize;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = cx * N + i, y = cy * N + j, type = World.getTile(x, y).terrainType, terrain = Config.terrain[type];
      const left = edge(x, scale) - x0, top = edge(y, scale) - y0;
      const width = edge(x + 1, scale) - x0 - left, height = edge(y + 1, scale) - y0 - top;
      if (types) types[j * N + i] = type;
      context.fillStyle = terrain.color;
      context.fillRect(left, top, width, height);
      const image = Assets.getVariant(terrain.image, x, y);
      if (image) context.drawImage(image, left, top, width, height);
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
        if (!Vision.anyVisible(Players.HUMAN, cx * N, cy * N, cx * N + N - 1, cy * N + N - 1)) continue;   // bara dimma: ritas inte
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
  const PATH_KEEP_MS = 20000;            // oanvända brickor släpps efter så här lång tid
  const PATH_WIDTH = 0.6;                // stigens bredd i rutor
  const PATH_ALPHA = [0, 0.225, 0.45, 0.675, 0.9, 1]; // nivå 1-4: slitage under 100 %, nivå 5: minst 100 %
  const GRID = PATH_CHUNK + 2;           // brickan + en ruta runt om, för att se grannarna
  const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const grid = new Uint8Array(GRID * GRID);
  const built = new Uint8Array(GRID * GRID);
  const ground = new Uint8Array(GRID * GRID);
  const pathChunks = new Map();
  const pathStyle = { tileSize: 0, partialImage: null, wornImage: null, partial: '#655', worn: '#777' };

  const wearLevel = wear => (wear >= 1 ? 5 : Math.round(wear * 4));

  // Mönstren byggs om när bilderna eller rutstorleken ändras (t.ex. "Shapes only")
  const updatePathStyle = (context, tileSize) => {
    const config = Object.assign({}, PATH_IMAGES, Config.settings.pathImages); // valfritt i settings.js
    const partialImage = Assets.get(config.partial) || null, wornImage = Assets.get(config.worn) || null;
    if (partialImage === pathStyle.partialImage && wornImage === pathStyle.wornImage && tileSize === pathStyle.tileSize) return;
    const makePattern = (image, fallback) => {
      if (!image) return fallback;
      try {
        const pattern = context.createPattern(image, 'repeat');
        if (pattern && pattern.setTransform && image.width) pattern.setTransform(new DOMMatrix().scale(tileSize / image.width, tileSize / image.height));
        return pattern || fallback;
      } catch (error) { return fallback; }
    };
    Object.assign(pathStyle, {
      tileSize, partialImage, wornImage,
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
  const drawPathChunk = (chunk, tileSize) => {
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
    context.lineWidth = tileSize * PATH_WIDTH;
    for (let level = 1; level <= 5; level++) {
      const list = rects[level];
      if (!list.length) continue;
      context.save();
      context.beginPath();
      for (let k = 0; k < list.length; k += 2) context.rect(list[k], list[k + 1], tileSize, tileSize);
      context.clip();
      context.globalAlpha = PATH_ALPHA[level];
      context.strokeStyle = level === 5 ? pathStyle.worn : pathStyle.partial;
      context.stroke(shape);
      context.restore();
    }
  };

  let lastPathPrune = 0;
  Renderer.addLayer('paths', (context, renderer) => {
    const range = renderer.visibleTileRange(), tileSize = renderer.tileSize, now = performance.now();
    updatePathStyle(context, tileSize);

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
            chunk.hash = hash;
            if (hash) drawPathChunk(chunk, tileSize); else chunk.canvas = null; // tom bricka: släpp canvasen
          }
        }
        if (chunk.canvas) context.drawImage(chunk.canvas, cx * PATH_CHUNK * tileSize, cy * PATH_CHUNK * tileSize);
      }
    }

    if (now - lastPathPrune > 5000) {
      lastPathPrune = now;
      for (const [key, chunk] of pathChunks) if (now - chunk.usedAt > PATH_KEEP_MS) pathChunks.delete(key);
    }
  });

  Renderer.addLayer('buildings', (context, renderer) => {
    const tileSize = renderer.tileSize, view = renderer.viewBounds(tileSize);
    for (const building of World.buildings) {
      const x = building.x * tileSize, y = building.y * tileSize;
      if (outside(view, x, y) || hidden(building)) continue;
      const isFinished = building.buildProgress >= 1, image = Assets.get(building.definition.image);
      context.globalAlpha = isFinished ? (building.paused ? .5 : 1) : .7;

      if (image) context.drawImage(image, x, y, tileSize, tileSize);
      else {
        context.fillStyle = building.definition.color;
        context.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);
        context.fillStyle = '#111'; context.font = 'bold 16px system-ui';
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(building.definition.symbol || '?', x + tileSize / 2, y + tileSize / 2 + 1);
      }
      context.globalAlpha = 1;
      
      if (!isFinished) { // byggframsteg
        context.fillStyle = '#000'; context.fillRect(x + 3, y + tileSize - 8, tileSize - 6, 5);
        context.fillStyle = '#5fb55f'; context.fillRect(x + 3, y + tileSize - 8, (tileSize - 6) * building.buildProgress, 5);
      } else if (!building.definition.isStorage) {
        renderer.drawResourceIcons(context, building.inputStock, x, y + tileSize - 10);
        renderer.drawResourceIcons(context, building.outputStock, x, y + 1);
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
    context.imageSmoothingQuality = 'high';
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
        const column = cols > 1 ? Math.floor(now / 1000 * (definition.animFps || 8) + (unit.animOffset ??= Math.random() * 100)) % cols : 0;

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
        context.lineWidth = 2;
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
      context.strokeStyle = effect.ranged ? '#c9a15a' : '#fff';
      context.globalAlpha = Math.min(1, effect.life / 0.18);
      context.beginPath();
      context.moveTo(effect.x1 * tileSize, effect.y1 * tileSize);
      context.lineTo(effect.x2 * tileSize, effect.y2 * tileSize);
      context.stroke();
    }
    context.globalAlpha = 1;

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

  // Dimma (Vision): en textur över det spelaren inte ser. Täckningen kommer som en liten alfamask (en pixel per cell) som skalas upp
  // med utjämning, så kanterna blir mjuka, och som klipper ut texturen (ett mönster som ligger fast i världen) på en canvas som
  // är lite större än skärmen. Den ritas om bara när synfältet räknats om, när celler håller på att blekna (högst 4 gånger per
  // sekund), vid zoom eller när bilden lämnar canvasen. Annars kostar dimman en enda 1:1-drawImage per bildruta.
  const FOG_MARGIN = .25;          // extra yta runt skärmen (andel av skärmens storlek)
  const FOG_MAX_PIXELS = 12e6;     // minnestak för dimmans canvas
  const FOG_FADE_MS = 250;         // hur ofta blekande celler ritas om
  const fog = { mask: document.createElement('canvas'), canvas: document.createElement('canvas'), key: '', version: -1, state: 0, at: 0, left: 0, top: 0, right: 0, bottom: 0, originX: 0, originY: 0 };

  const composeFog = (renderer, now) => {
    const { image: source, color } = Config.settings.vision, image = source && Assets.get(source);
    const scale = renderer.zoom * renderer.pixelRatio, unit = renderer.tileSize * Vision.cellSize();
    const view = renderer.viewBounds(0), width = view.right - view.left, height = view.bottom - view.top;
    const grow = Math.min(FOG_MARGIN, Math.max(0, Math.sqrt(FOG_MAX_PIXELS / (width * height * scale * scale)) / 2 - .5));
    const minX = Math.floor((view.left - width * grow) / unit) - 1, minY = Math.floor((view.top - height * grow) / unit) - 1;
    const cols = Math.ceil((view.right + width * grow) / unit) + 2 - minX, rows = Math.ceil((view.bottom + height * grow) / unit) + 2 - minY;

    fog.state = Vision.mask(Players.HUMAN, fog.mask, minX, minY, cols, rows);
    fog.version = Vision.version; fog.at = now;
    fog.key = [scale, image ? 1 : 0].join();
    fog.left = (minX + 1) * unit; fog.top = (minY + 1) * unit;            // cachen täcker allt utom den extra cellen i kanten
    fog.right = (minX + cols - 1) * unit; fog.bottom = (minY + rows - 1) * unit;
    fog.originX = Math.round(minX * unit * scale); fog.originY = Math.round(minY * unit * scale);
    if (!fog.state) return;

    const canvas = fog.canvas, context = canvas.getContext('2d');
    const pixelsX = Math.ceil(cols * unit * scale), pixelsY = Math.ceil(rows * unit * scale);
    if (canvas.width !== pixelsX || canvas.height !== pixelsY) { canvas.width = pixelsX; canvas.height = pixelsY; }
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, pixelsX, pixelsY);
    context.imageSmoothingEnabled = true;
    context.drawImage(fog.mask, 0, 0, pixelsX, pixelsY);
    context.globalCompositeOperation = 'source-in';
    if (image) {
      const pattern = context.createPattern(image, 'repeat');
      pattern.setTransform(new DOMMatrix().translate(-fog.originX, -fog.originY).scale(scale));
      context.fillStyle = pattern;
    } else context.fillStyle = color;
    context.fillRect(0, 0, pixelsX, pixelsY);
    context.globalCompositeOperation = 'source-over';
  };

  Renderer.addLayer('fog', (context, renderer) => {
    const now = performance.now(), view = renderer.viewBounds(0), scale = renderer.zoom * renderer.pixelRatio;
    const { image: source } = Config.settings.vision, loaded = source && Assets.get(source) ? 1 : 0;
    const covers = fog.key === [scale, loaded].join() && view.left >= fog.left && view.top >= fog.top && view.right <= fog.right && view.bottom <= fog.bottom;
    if (!covers || fog.version !== Vision.version || (fog.state === 2 && now - fog.at > FOG_FADE_MS)) composeFog(renderer, now);
    if (!fog.state) return;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(fog.canvas, fog.originX - Math.round(renderer.camera.x * scale), fog.originY - Math.round(renderer.camera.y * scale));
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
    'No resources': 'warning_grey', 'Local stock full': 'warning_grey', 'Central storage full': 'warning_red', 'Tools missing': 'warning_grey',
    'No deer in range': 'warning_grey', 'Paused': 'paused', 'Missing export': 'error', "Can't reach": 'error',
  };
  const statusIcon = status => {
    if (!status) return null;
    const key = CityBuilder.I18n.canonicalStatus(status);
    return key.startsWith('Missing:') ? 'warning_grey' : STATUS_ICONS[key] || null;
  };
  Renderer.addLayer('ui', (context, renderer) => {
    const tileSize = renderer.tileSize, view = renderer.viewBounds(tileSize);
    const time = performance.now() / 1000;
    for (const building of World.buildings) {
      if (outside(view, building.x * tileSize, building.y * tileSize) || hidden(building)) continue;
      // Ineffektiv en längre tid: liten ikon uppe till höger (Config.settings.efficiency: minSeconds, warnBelow, badBelow)
      const summary = building.eff && building.eff.summary, limits = Object.assign({ minSeconds: 30, warnBelow: .6, badBelow: .3 }, Config.settings.efficiency);
      if (summary && !building.paused && summary.seconds >= limits.minSeconds && summary.ratio < limits.warnBelow) {
        const bad = summary.ratio < limits.badBelow;
        const efficiencyIcon = Assets.get(ICON_DIR + (bad ? 'efficiency_bad' : 'efficiency_warn') + '.png') || Assets.get(ICON_DIR + (bad ? 'warning_red' : 'warning_grey') + '.png');
        if (efficiencyIcon) {
          // Pulserar som statusikonerna (röd = snabbare och kraftigare, som "error"). Mittpunkten ligger fast i hörnet.
          const wave = (Math.sin(time * (bad ? 6 : 3.5)) + 1) / 2, iconSize = tileSize * .36 * (1 + wave * (bad ? .3 : .15));
          const centerX = (building.x + 1) * tileSize - tileSize * .18 - 1, centerY = building.y * tileSize + tileSize * .18 + 1;
          context.globalAlpha = .7 + .3 * wave;
          context.drawImage(efficiencyIcon, centerX - iconSize / 2, centerY - iconSize / 2, iconSize, iconSize);
          context.globalAlpha = 1;
        }
      }
      const name = statusIcon(building.workerUnit?.status) || statusIcon(building.status);
      const icon = name && Assets.get(ICON_DIR + name + '.png');
      if (icon) {
        const urgent = name === 'error', still = name === 'paused';
        const wave = still ? 0 : (Math.sin(time * (urgent ? 6 : 3.5)) + 1) / 2;
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
    const isValid = !CityBuilder.Construction.isHidden(x, y, Players.HUMAN) && World.canPlace(placingType, x, y) && CityBuilder.Construction.isNearOwnBuilding(x, y, CityBuilder.Players.HUMAN) && Economy.canAfford(Config.buildings[placingType].buildCost);
    context.fillStyle = isValid ? 'rgba(95,181,95,.5)' : 'rgba(217,83,79,.5)';
    context.fillRect(x * renderer.tileSize, y * renderer.tileSize, renderer.tileSize, renderer.tileSize);
  });

})(window.CityBuilder);