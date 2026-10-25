/* Indata: dra = panorera, nyp/hjul = zooma, tryck = välj/placera. Musen uppdaterar placeringsspöket. */
(function (CityBuilder) {
  'use strict';
  const { Config, Utils, Renderer } = CityBuilder;

  const TOUCH_TIP_MS = 4000;   // hur länge tooltipen står kvar efter ett tryck

  const Input = {
    mouseOverMap: false, // musen är över kartan (UI använder det för hover-tooltips)
    dragging: false,     // pågående panorering med ett finger/musen
    touchTipUntil: 0,    // pekskärm: tills dess visas tooltipen för rutan man tryckt på (performance.now())

    init() {
      const canvas = Renderer.canvas, zoomLimits = Config.settings.zoom;
      const activePointers = new Map(); // pointerId -> { x, y }
      let gesture = null;               // pågående gest: { startX, startY, cameraX, cameraY, isDragging, isPinching }
      let pinch = null;                 // { startDistance, startZoom, worldX, worldY }
      const DRAG_THRESHOLD_PIXELS = 8;

      // Mittpunkt och avstånd mellan de två första fingrarna
      const pinchPoints = () => {
        const [first, second] = [...activePointers.values()];
        return {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
          distance: Math.hypot(first.x - second.x, first.y - second.y),
        };
      };

      // Kom ihåg vilken världspunkt som ligger mellan fingrarna när nypet börjar.
      // Under nypet flyttas kameran så att just den punkten stannar under fingrarna.
      const beginPinch = () => {
        const { x, y, distance } = pinchPoints();
        pinch = {
          startDistance: Math.max(distance, 1),
          startZoom: Renderer.zoom,
          worldX: x / Renderer.zoom + Renderer.camera.x,
          worldY: y / Renderer.zoom + Renderer.camera.y,
        };
      };

      canvas.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse') this.mouseOverMap = false; // inga hover-tooltips vid pekning

        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        canvas.setPointerCapture(event.pointerId);

        if (activePointers.size === 1) {
          gesture = { startX: event.clientX, startY: event.clientY, cameraX: Renderer.camera.x, cameraY: Renderer.camera.y, isDragging: false, isPinching: false };
        } else if (activePointers.size === 2) {
          gesture.isPinching = true;
          this.dragging = false;
          beginPinch();
        }
      });

      canvas.addEventListener('pointermove', event => {
        if (event.pointerType === 'mouse') {
          this.mouseOverMap = true;
          Renderer.hoverTile = Renderer.screenToTile(event.clientX, event.clientY);
        }
        if (!activePointers.has(event.pointerId)) return;
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (activePointers.size === 2 && pinch) {
          const { x, y, distance } = pinchPoints();
          Renderer.zoom = Utils.clamp(pinch.startZoom * distance / pinch.startDistance, zoomLimits.min, zoomLimits.max);
          Renderer.camera.x = pinch.worldX - x / Renderer.zoom; // gör att kartan zoomar där fingrarna är,
          Renderer.camera.y = pinch.worldY - y / Renderer.zoom; // och följer med om fingrarna flyttas
          return;
        }
        if (activePointers.size !== 1 || gesture.isPinching) return;

        const deltaX = event.clientX - gesture.startX, deltaY = event.clientY - gesture.startY;
        if (Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD_PIXELS) gesture.isDragging = true;
        if (gesture.isDragging) {
          this.dragging = true;
          this.touchTipUntil = 0;
          Renderer.camera.x = gesture.cameraX - deltaX / Renderer.zoom;
          Renderer.camera.y = gesture.cameraY - deltaY / Renderer.zoom;
        }
      });

      const releasePointer = event => {
        activePointers.delete(event.pointerId);
        pinch = null;
        if (!activePointers.size) { gesture = null; this.dragging = false; }
      };
      canvas.addEventListener('pointerup', event => {
        const wasTap = activePointers.size === 1 && gesture && !gesture.isDragging && !gesture.isPinching;
        if (wasTap) this.handleTap(event.clientX, event.clientY, event.pointerType);
        releasePointer(event);
      });
      canvas.addEventListener('pointercancel', releasePointer);

      canvas.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse') { this.mouseOverMap = false; Renderer.hoverTile = null; }
      });

      canvas.addEventListener('wheel', event => { // zoom mot muspekaren
        event.preventDefault();
        const worldX = event.clientX / Renderer.zoom + Renderer.camera.x;
        const worldY = event.clientY / Renderer.zoom + Renderer.camera.y;
        Renderer.zoom = Utils.clamp(Renderer.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), zoomLimits.min, zoomLimits.max);
        Renderer.camera.x = worldX - event.clientX / Renderer.zoom;
        Renderer.camera.y = worldY - event.clientY / Renderer.zoom;
      }, { passive: false });
    },

    handleTap(screenX, screenY, pointerType = 'mouse') {
      const tile = Renderer.screenToTile(screenX, screenY), game = CityBuilder.Game;
      Renderer.hoverTile = tile;

      if (game.placingType) { game.tryBuild(game.placingType, tile.x, tile.y); return; }
      if (game.casting) { game.castSpell(tile.x, tile.y); return; }

      const building = CityBuilder.World.seenBuildingAt(tile.x, tile.y);
      game.selectBuilding(building);
      // Utan hover på pekskärm: ett tryck på marken visar tooltipen för rutan (träd, sten ...) en stund, till nästa tryck eller panorering
      this.touchTipUntil = pointerType !== 'mouse' && !building ? performance.now() + TOUCH_TIP_MS : 0;
    },
  };

  CityBuilder.Input = Input;
})(window.CityBuilder);