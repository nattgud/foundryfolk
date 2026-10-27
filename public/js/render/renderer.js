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
      // Resurs- och byggfältet täcker nästan helt (92 %) det som ritas bakom dem: höjderna sparas så att lägre grafik kan hoppa över den ytan
      this.covered = { top: 0, bottom: 0 };
      const measure = () => {
        const top = CityBuilder.byId('top'), bottom = CityBuilder.byId('bottom');
        this.covered.top = top ? top.getBoundingClientRect().bottom : 0;
        this.covered.bottom = bottom ? Math.max(this.covered.top, bottom.getBoundingClientRect().top) : innerHeight;
      };
      if (window.ResizeObserver) { const observer = new ResizeObserver(measure); ['top', 'bottom'].forEach(id => CityBuilder.byId(id) && observer.observe(CityBuilder.byId(id))); }
      addEventListener('resize', measure);
      measure();
      this.camera.x = -innerWidth / 2 + this.tileSize / 2;
      this.camera.y = -innerHeight / 2 + this.tileSize / 2;
    },

    resize() {
      this.pixelRatio = CityBuilder.Options ? CityBuilder.Options.gfx.pixelRatio : devicePixelRatio || 1;
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

    // Synfältet i världspixlar, utökat med margin pixlar (så att ikoner och bilder som sticker utanför sin ruta inte klipps bort)
    viewBounds(margin = 0) {
      return {
        left: this.camera.x - margin,
        top: this.camera.y - margin,
        right: this.camera.x + innerWidth / this.zoom + margin,
        bottom: this.camera.y + innerHeight / this.zoom + margin,
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
        const iconX = x + 2 + iconIndex * 10;

        if (image) {
          context.drawImage(image, iconX, y, 7, 7);
        } else {
          context.fillStyle = resource.color;
          context.fillRect(iconX, y, 7, 7);
        }

        if (count > 1) {
          context.font = "8px sans-serif";
          context.textAlign = "left";
          context.textBaseline = "middle";
          context.strokeStyle = "rgba(0,0,0,.8)"; context.lineWidth = 2; context.lineJoin = "round";
          context.strokeText(String(count), iconX, y + 10);   // mörk kontur så att siffrorna syns mot byggnadsbilden
          context.fillStyle = "#fff";
          context.fillText(String(count), iconX, y + 10);
        }

        iconIndex++;
      }
    },

    draw() {
      const context = this.context;
      context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      context.fillStyle = '#14181c';
      context.fillRect(0, 0, innerWidth, innerHeight);
      const gfx = CityBuilder.Options.gfx;
      context.save();   // klippytan nollställs efter bildrutan
      context.imageSmoothingEnabled = gfx.smoothing;
      if (gfx.skipCovered && this.covered.bottom > this.covered.top) {   // ritar bara det som syns mellan fälten
        context.beginPath();
        context.rect(0, this.covered.top, innerWidth, this.covered.bottom - this.covered.top);
        context.clip();
      }
      context.scale(this.zoom, this.zoom);
      context.translate(-this.camera.x, -this.camera.y);
      for (const layer of this.layers) layer.draw(context, this);
      context.restore();
    },
  };

  CityBuilder.Renderer = Renderer;
})(window.CityBuilder);
