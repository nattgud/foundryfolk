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

  // Stigar: ju fler bärare som gått, desto synligare. Bilden är genomskinlig tills slitaget nått 100 %,
  // då används en egen bild. Saknas bilden ritas de gamla grå rutorna.
  const PATH_IMAGES = { partial: 'images/paths/path.png', worn: 'images/paths/path_worn.png' };
  Renderer.addLayer('paths', (context, renderer) => {
    const range = renderer.visibleTileRange(), tileSize = renderer.tileSize;
    const pathConfig = Object.assign({}, PATH_IMAGES, Config.settings.pathImages); // valfritt i settings.js
    const partialImage = Assets.get(pathConfig.partial), wornImage = Assets.get(pathConfig.worn);
    for (let y = range.minY; y <= range.maxY; y++) for (let x = range.minX; x <= range.maxX; x++) {
      const tile = World.getTile(x, y);
      // Stigar syns bara på gräs (inte på sand, vatten, sten, skog ...)
      if (tile.terrainType !== 'grass' || !tile.wear) continue;

      // Kontrollera om det finns en byggnad på denna plats
      const isBuildingPresent = World.buildings.some(building => building.x === x && building.y === y);
      if (isBuildingPresent) continue;

      const isWorn = tile.wear >= 1;
      const image = isWorn ? (wornImage || partialImage) : partialImage;
      context.globalAlpha = isWorn ? 1 : tile.wear * 0.9;
      if (image) context.drawImage(image, x * tileSize, y * tileSize, tileSize + .5, tileSize + .5);
      else {
        context.fillStyle = isWorn ? '#777' : '#655';
        context.fillRect(x * tileSize, y * tileSize, tileSize + .5, tileSize + .5);
      }
    }
    context.globalAlpha = 1;
  });

  Renderer.addLayer('buildings', (context, renderer) => {
    const tileSize = renderer.tileSize;
    let first = 1;
    for (const building of World.buildings) {
      const x = building.x * tileSize, y = building.y * tileSize;
      const isFinished = building.buildProgress >= 1, image = Assets.get(building.definition.image);
      context.globalAlpha = isFinished ? (building.paused ? .55 : 1) : .45;

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
        if (World.buildings.some(b => b.x === x && b.y === y)) {
          return;
        }
        renderer.drawResourceIcons(context, building.inputStock, x, y + tileSize - 7);
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

  Renderer.addLayer('ui', (context, renderer) => {
    const tileSize = renderer.tileSize;
    for (const building of World.buildings) {
      const x = building.x * tileSize, y = building.y * tileSize;
      let icon = null;
      switch(building?.status) {
        case "No resources":
          icon = "images/ui/icons/warning_yellow.png";
          break;
        case "Paused":
          icon = "images/ui/icons/paused.png";
          break;
        case "Full stock":
          icon = "images/ui/icons/warning_yellow.png";
          break;
        case "Missing tools":
          icon = "images/ui/icons/warning_yellow.png";
          break;
        case "No deers in range":
          icon = "images/ui/icons/warning_yellow.png";
          break;
        case "No resources":
          icon = "images/ui/icons/warning_red.png";
          break;
        case "Missing export":
          icon = "images/ui/icons/error.png";
          break;
        case "Can't reach":
          icon = "images/ui/icons/error.png";
          break;
      }
      switch(building?.workerUnit?.status) {
        case "No resources":
          icon = "images/ui/icons/warning_yellow.png";
          break;
        case "Paused":
          icon = "images/ui/icons/paused.png";
          break;
        case "Full stock":
          icon = "images/ui/icons/warning_yellow.png";
          break;
        case "Missing tools":
          icon = "images/ui/icons/warning_yellow.png";
          break;
        case "No deers in range":
          icon = "images/ui/icons/warning_yellow.png";
          break;
        case "No resources":
          icon = "images/ui/icons/warning_red.png";
          break;
        case "Missing export":
          icon = "images/ui/icons/error.png";
          break;
        case "Can't reach":
          icon = "images/ui/icons/error.png";
          break;
      }
      if(building?.status.substring(0, 8) === "Missing:") icon = "images/ui/icons/warning_yellow.png";
      if(icon !== null) {
        icon = Assets.get(icon);
        if (icon) context.drawImage(icon, x + (tileSize / 4), y + (tileSize / 4), tileSize / 2, tileSize / 2);
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

