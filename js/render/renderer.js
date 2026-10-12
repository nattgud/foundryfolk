/* Renderare: canvas, kamera och lagerlista. Nya lager läggs till med Renderer.addLayer(namn, (context, renderer) => {...}). */
(function (CityBuilder) {
  'use strict';
  const { Config, Assets } = CityBuilder;

  const Renderer = {
    canvas: null, context: null,
    camera: { x: 0, y: 0 },   // världskoordinat (pixlar vid zoom 1) för skärmens övre vänstra hörn
    zoom: 1, tileSize: 36, pixelRatio: 1,
    hoverTile: null,          // ruta under muspekaren / senaste tryck
    layers: [],

    init() {
      this.canvas = CityBuilder.byId('gameCanvas');
      this.tileSize = Config.settings.tileSize;
      this.context = this.canvas.getContext('2d');
      addEventListener('resize', () => this.resize());
      this.resize();
      this.camera.x = -innerWidth / 2 + this.tileSize / 2;
      this.camera.y = -innerHeight / 2 + this.tileSize / 2;
    },

    resize() {
      this.pixelRatio = devicePixelRatio || 1;
      this.canvas.width = innerWidth * this.pixelRatio;
      this.canvas.height = innerHeight * this.pixelRatio;
    },

    addLayer(name, draw) { this.layers.push({ name, draw }); },

    // Rutintervall som syns på skärmen
    visibleTileRange() {
      const tileSize = this.tileSize, zoom = this.zoom;
      return {
        minX: Math.floor(this.camera.x / tileSize),
        minY: Math.floor(this.camera.y / tileSize),
        maxX: Math.floor((this.camera.x + innerWidth / zoom) / tileSize),
        maxY: Math.floor((this.camera.y + innerHeight / zoom) / tileSize),
      };
    },

    screenToTile(screenX, screenY) {
      return {
        x: Math.floor((screenX / this.zoom + this.camera.x) / this.tileSize),
        y: Math.floor((screenY / this.zoom + this.camera.y) / this.tileSize),
      };
    },

    // Resursikoner (bild eller färgruta) för in-/utbuffert
    drawResourceIcons(context, stock, x, y) {
      let iconIndex = 0;

      for (const resourceId in stock) {
        const count = stock[resourceId];
        if (count <= 0) continue;

        const resource = Config.resources[resourceId];
        const image = Assets.get(resource.image);
        const iconX = x + 2 + iconIndex * 18;

        if (image) {
          context.drawImage(image, iconX, y, 7, 7);
        } else {
          context.fillStyle = resource.color;
          context.fillRect(iconX, y, 7, 7);
        }

        if (count > 1) {
          context.fillStyle = "#fff";
          context.font = "8px sans-serif";
          context.textAlign = "left";
          context.textBaseline = "middle";
          context.fillText(String(count), iconX + 8, y + 4);
        }

        iconIndex++;
      }
    },

    draw() {
      const context = this.context;
      context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      context.fillStyle = '#14181c';
      context.fillRect(0, 0, innerWidth, innerHeight);
      context.scale(this.zoom, this.zoom);
      context.translate(-this.camera.x, -this.camera.y);
      for (const layer of this.layers) layer.draw(context, this);
    },
  };

  CityBuilder.Renderer = Renderer;
})(window.CityBuilder);
