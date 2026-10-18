/* Renderlager i ritordning: terräng, stigar, byggnader, enheter, placeringsspöke. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Assets, Economy, Renderer } = CityBuilder;

  Renderer.addLayer('terrain', (context, renderer) => {
    const range = renderer.visibleTileRange(), tileSize = renderer.tileSize;
    for (let y = range.minY; y <= range.maxY; y++) for (let x = range.minX; x <= range.maxX; x++) {
      const terrain = Config.terrain[World.getTile(x, y).terrainType];
      context.fillStyle = terrain.color;
      context.fillRect(x * tileSize, y * tileSize, tileSize + .5, tileSize + .5);
      const image = Assets.getVariant(terrain.image, x, y);
      if (image) context.drawImage(image, x * tileSize, y * tileSize, tileSize + .5, tileSize + .5);
      else if (terrain.fallbackShape && CityBuilder.Shapes[terrain.fallbackShape]) {
        CityBuilder.Shapes[terrain.fallbackShape](context, x * tileSize, y * tileSize, tileSize);
      }
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
  const grid = new Uint8Array(GRID * GRID);   // slitagenivå per ruta
  const built = new Uint8Array(GRID * GRID);  // 1 = byggnad på rutan
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
      const tile = isBuilt ? null : World.getTile(x, y);
      // Stigar syns bara på gräs (inte på sand, vatten, sten, skog ...) och inte under byggnader
      const level = tile && tile.terrainType === 'grass' ? wearLevel(tile.wear) : 0;
      grid[index] = level;
      built[index] = isBuilt;
      if (level && i > 0 && j > 0 && i <= PATH_CHUNK && j <= PATH_CHUNK) count++;
      hash = (Math.imul(hash, 31) + level + isBuilt * 8) | 0;
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
    if (canvas.width !== size) canvas.width = canvas.height = size; else context.clearRect(0, 0, size, size);

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
            rects[level].push(x + dx * tileSize, y, x, y + dy * tileSize); // hörnrutorna, så att den breda linjen inte klipps av
          }
        } else if (grid[neighbor]) {
          ends.push(cx + dx * half, cy + dy * half);                 // mitt på kanten
        } else if (built[neighbor]) {
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
    const tileSize = renderer.tileSize;
    let first = 1;
    for (const building of World.buildings) {
      const x = building.x * tileSize, y = building.y * tileSize;
      const isFinished = building.buildProgress >= 1, image = Assets.get(building.definition.image);
      context.globalAlpha = isFinished ? (building.paused ? .5 : 1) : .7;

      if (image) context.drawImage(image, x + 2, y + 2, tileSize - 4, tileSize - 4);
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
      if (building === CityBuilder.Game.selectedBuilding) {
        context.strokeStyle = '#fff'; context.lineWidth = 2;
        context.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
      }
    }
  });

  // Väljer bild: byggnadsspecifik (med last) -> byggnadsspecifik -> enhetens lastbild -> enhetens bild.
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

  Renderer.addLayer('units', (context, renderer) => {
    const tileSize = renderer.tileSize;
    for (const unit of World.units) {
      const definition = unit.definition, image = findUnitImage(unit);
      const pixelX = unit.x * tileSize, pixelY = unit.y * tileSize;
      if (image) context.drawImage(image, pixelX - definition.imageSize / 2, pixelY - definition.imageSize / 2, definition.imageSize, definition.imageSize);
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

  // Statusikoner. Statustexten görs om till sin engelska grundform (I18n.canonicalStatus), så olika stavningar
  // och äldre svenska texter ger samma ikon. Arbetarens status går före byggnadens.
  const ICON_DIR = 'images/ui/icons/';
  const STATUS_ICONS = {
    'No resources': 'warning_yellow', 'Full stock': 'warning_yellow', 'Tools missing': 'warning_yellow',
    'No deer in range': 'warning_yellow', 'Paused': 'paused', 'Missing export': 'error', "Can't reach": 'error',
  };
  const statusIcon = status => {
    if (!status) return null;
    const key = CityBuilder.I18n.canonicalStatus(status);
    return key.startsWith('Missing:') ? 'warning_yellow' : STATUS_ICONS[key] || null;
  };

  Renderer.addLayer('ui', (context, renderer) => {
    const tileSize = renderer.tileSize;
    for (const building of World.buildings) {
      const name = statusIcon(building.workerUnit?.status) || statusIcon(building.status);
      const icon = name && Assets.get(ICON_DIR + name + '.png');
      if (icon) {
        context.drawImage(icon, building.x * tileSize + tileSize / 4, building.y * tileSize + tileSize / 4, tileSize / 2, tileSize / 2);
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
    const isValid = World.canPlace(placingType, x, y) && Economy.canAfford(Config.buildings[placingType].buildCost);
    context.fillStyle = isValid ? 'rgba(95,181,95,.5)' : 'rgba(217,83,79,.5)';
    context.fillRect(x * renderer.tileSize, y * renderer.tileSize, renderer.tileSize, renderer.tileSize);
  });

})(window.CityBuilder);