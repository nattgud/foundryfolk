/* Invånare: små gestalter som går mellan de civila byggnaderna och gör byn levande. Bara utseende (som civils.js): de blockerar inget, har inget liv, ingen logik och kan inte attackeras.
   Inställningar: villagers i js/config/civils.js. Bilder: images/units/<ras>/villager1.png ... villager4.png (64x64 per ruta; flera rutor i rad = gå-animation; ser åt höger och speglas åt vänster;
   flera rader: rad 1 används för gång). Saknas bilderna ritas bärarens bild, lätt färgad, så länge.

   Hur: de finns bara nära det som syns (vyn + margin), så kostnaden följer skärmen, inte världens storlek. En invånare föds vid ett civilt hus på skärmen (helst ett hus), väljer en annan civil
   byggnad inom range rutor, går dit längs vägar och stigar (en liten kortaste-vägen-sökning i ett fönster runt startrutan, vägar billigare än gräs, inget genom träd, resurser, byggnader eller vatten),
   går in (tonar ut), stannar en stund, kommer ut igen och går vidare (legs gånger), och försvinner sedan. Lämnar den vyn tas den bort. Sparas inte (nya föds efter laddning). Andras invånare syns bara när spelaren ser dem. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players, Utils } = CityBuilder;

  const RANGE = 14, SIDE = RANGE * 2 + 1, MAX_NODES = 600;   // sökfönstret: högst RANGE rutor från startrutan åt varje håll
  const dist = new Float32Array(SIDE * SIDE), came = new Int32Array(SIDE * SIDE);
  const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]];
  const options = () => (Config.civils || {}).villagers || {};
  const enabled = () => Config.civils?.enabled !== false && options().enabled !== false && CityBuilder.Levels?.current?.civils !== false && CityBuilder.Optimizer?.civils !== false;
  const between = ([low, high]) => low + Math.random() * (high - low);

  // Kostnad att gå över en ruta (0 = går inte): tom gräsmark; stig billigast, civil byggnad dyr (de går helst runt)
  const walkCost = (x, y) => {
    const tile = World.getTile(x, y), Civils = CityBuilder.Civils;
    if (!tile || tile.terrainType !== 'grass' || World.buildingAt(x, y) || World.sceneryAt(x, y)) return 0;
    return (Civils.path(x, y) ? 1 : 2.2) + (Civils.tiles.get(Utils.tileKey(x, y))?.big ? 2 : 0);
  };

  // Kortaste vägen från (sx, sy) till (gx, gy): lista av [x, y] utan startrutan, eller null
  const route = (sx, sy, gx, gy) => {
    if (Math.abs(gx - sx) > RANGE || Math.abs(gy - sy) > RANGE || (gx === sx && gy === sy)) return null;
    const index = (x, y) => (y - sy + RANGE) * SIDE + x - sx + RANGE, heap = new CityBuilder.MinHeap();
    dist.fill(Infinity);
    dist[index(sx, sy)] = 0; came[index(sx, sy)] = -1; heap.push([0, sx, sy]);
    for (let nodes = 0; heap.size && nodes < MAX_NODES; nodes++) {
      const [, x, y] = heap.pop(), here = index(x, y);
      if (x === gx && y === gy) {
        const path = [];
        for (let at = here; at >= 0 && at !== index(sx, sy); at = came[at]) path.push([sx + (at % SIDE) - RANGE, sy + Math.floor(at / SIDE) - RANGE]);
        return path.reverse();
      }
      for (const [dx, dy, step] of STEPS) {
        const nx = x + dx, ny = y + dy;
        if (Math.abs(nx - sx) > RANGE || Math.abs(ny - sy) > RANGE) continue;
        const cost = walkCost(nx, ny);
        if (!cost || (dx && dy && (!walkCost(x + dx, y) || !walkCost(x, y + dy)))) continue;   // inte snett förbi ett hörn
        const next = index(nx, ny), total = dist[here] + step * cost;
        if (total < dist[next]) { dist[next] = total; came[next] = here; heap.push([total + Math.hypot(gx - nx, gy - ny), nx, ny]); }
      }
    }
    return null;
  };

  const Villagers = {
    list: [],
    view: null,          // vyn i rutor (sätts när den ritas)
    time: 0,
    spawnIn: 0,
    tinted: new Map(),   // platshållarbilder

    reset() { this.list = []; this.time = 0; this.spawnIn = 0; this.tinted.clear(); },

    // En civil byggnad som en invånare kan gå till eller från: något man kan gå in i (inte park, fontän, kyrkogård eller marknad: enter: false i config/civils.js), färdig (inte under inbördes tonande), inte på väg att försvinna, och synlig om den är någon annans
    usable(item) {
      return item.kind === 'big' && Config.civils?.types?.[item.type]?.enter !== false && item.dying === undefined && CityBuilder.Civils.time - item.born >= item.fade && (item.player === Players.HUMAN || CityBuilder.Vision.visible(Players.HUMAN, item.x, item.y));
    },

    // Föder en invånare vid ett slumpat civilt hus (helst) i vyn, om det finns färre än vad vyn har plats för
    spawn() {
      const Civils = CityBuilder.Civils, view = this.view, settings = options();
      if (!view || !Civils.buckets.size || this.list.length >= (settings.max ?? 40) * (CityBuilder.Optimizer?.villagers ?? 1)) return;
      let seen = 0, houses = 0, house = null, any = null;
      Civils.each(view.left, view.top, view.right, view.bottom, item => {
        if (item.tx < view.left || item.tx > view.right || item.ty < view.top || item.ty > view.bottom || !this.usable(item)) return;
        if (Math.random() * ++seen < 1) any = item;
        if (item.type === 'house' && Math.random() * ++houses < 1) house = item;
      });
      if (!any || this.list.length >= Math.floor(seen * (settings.perBuilding ?? .5) * (CityBuilder.Optimizer?.villagers ?? 1))) return;
      const origin = house || any, trip = this.trip(origin.tx, origin.ty, origin.type);
      if (!trip) return;
      this.list.push({ x: origin.tx + .5, y: origin.ty + .5, player: origin.player, variant: 1 + Math.floor(Math.random() * (settings.variants ?? 4)), path: trip.path, step: 0, legs: Math.round(between(settings.legs || [2, 4])),
        state: 'walk', alpha: 0, wait: 0, faceLeft: false, lane: [(Math.random() - .5) * .3, (Math.random() - .5) * .3], anim: Math.random() * 100, type: trip.to.type });
    },
    // En rutt från (x, y) till en annan sorts civil byggnad inom range rutor: { path, to } eller null (prövar några mål)
    trip(x, y, fromType) {
      const range = Math.min(RANGE, options().range ?? 12), targets = [];
      CityBuilder.Civils.each(x - range, y - range, x + range, y + range, item => {
        if (targets.length < 12 && item.type !== fromType && Math.abs(item.tx - x) <= range && Math.abs(item.ty - y) <= range && this.usable(item)) targets.push(item);
      });
      for (let tries = 0; tries < 3 && targets.length; tries++) {
        const to = targets.splice(Math.floor(Math.random() * targets.length), 1)[0], path = route(x, y, to.tx, to.ty);
        if (path && path.length) return { path, to };
      }
      return null;
    },

    update(deltaSeconds) {
      if (!enabled()) { if (this.list.length) this.list = []; return; }
      if (!this.view || !deltaSeconds) return;
      this.time += deltaSeconds;
      this.spawnIn -= deltaSeconds;
      if (this.spawnIn <= 0) { this.spawnIn = options().every ?? .6; this.spawn(); }
      const settings = options(), speed = settings.speed ?? .8, fade = settings.fade ?? .4, margin = settings.margin ?? 6, view = this.view;
      for (let i = this.list.length - 1; i >= 0; i--) {
        const villager = this.list[i];
        if (villager.x < view.left - margin || villager.x > view.right + margin || villager.y < view.top - margin || villager.y > view.bottom + margin) { this.list.splice(i, 1); continue; }
        if (villager.state === 'walk') {
          villager.alpha = Math.min(1, villager.alpha + deltaSeconds / fade);
          const target = villager.path[villager.step], dx = target[0] + .5 + villager.lane[0] - villager.x, dy = target[1] + .5 + villager.lane[1] - villager.y, distance = Math.hypot(dx, dy), move = speed * deltaSeconds;
          if (Math.abs(dx) > .01) villager.faceLeft = dx < 0;
          if (distance <= move) { villager.x += dx; villager.y += dy; if (++villager.step >= villager.path.length) villager.state = 'in'; }
          else { villager.x += dx / distance * move; villager.y += dy / distance * move; }
        } else if (villager.state === 'in') {   // går in: tonar ut, stannar en stund
          villager.alpha -= deltaSeconds / fade;
          if (villager.alpha <= 0) { villager.alpha = 0; villager.state = 'inside'; villager.wait = between(settings.stay || [4, 12]); }
        } else if ((villager.wait -= deltaSeconds) <= 0) {   // inne: kommer ut och går vidare, eller är klar
          const tx = Math.floor(villager.x), ty = Math.floor(villager.y), trip = --villager.legs >= 0 ? this.trip(tx, ty, villager.type) : null;
          if (!trip) { this.list.splice(i, 1); continue; }
          Object.assign(villager, { path: trip.path, step: 0, state: 'walk', type: trip.to.type });
        }
      }
    },

    // ---- ritning (lagret 'villagers', över civila byggnader och under byggnader och enheter) ----
    imageOf(villager) {
      const Assets = CityBuilder.Assets, race = Players.raceOf(villager.player), source = `images/units/villager${villager.variant}.png`;
      if (Assets.exists(Assets.raced(source, 'human'))) return Assets.get(source, race);
      // Platshållare: bärarens bild, lätt färgad per variant
      const base = Assets.get('images/units/carrier.png', race);
      if (!base) return null;
      const key = `${race}${villager.variant}`;
      let canvas = this.tinted.get(key);
      if (!canvas || canvas.source !== base) {
        canvas = document.createElement('canvas'); canvas.width = base.naturalWidth; canvas.height = base.naturalHeight; canvas.source = base;
        const context = canvas.getContext('2d'); context.drawImage(base, 0, 0);
        context.globalCompositeOperation = 'source-atop'; context.globalAlpha = .5;
        context.fillStyle = (options().tint || ['#c9a27a', '#9fb4c9', '#c98a8a', '#a9c98a'])[(villager.variant - 1) % 4]; context.fillRect(0, 0, canvas.width, canvas.height);
        this.tinted.set(key, canvas);
      }
      return canvas;
    },
    draw(context, renderer) {
      const tileSize = renderer.tileSize, bounds = renderer.viewBounds(tileSize * 2);
      this.view = { left: Math.floor(bounds.left / tileSize), right: Math.ceil(bounds.right / tileSize), top: Math.floor(bounds.top / tileSize), bottom: Math.ceil(bounds.bottom / tileSize) };
      if (!this.list.length || !enabled()) return;
      const settings = options(), size = settings.size ?? 16, now = performance.now() / 1000, Vision = CityBuilder.Vision;
      for (const villager of this.list) {
        if (villager.alpha <= .01) continue;
        if (villager.player !== Players.HUMAN && !Vision.visible(Players.HUMAN, villager.x, villager.y)) continue;
        const image = this.imageOf(villager);
        if (!image) continue;
        const frame = Math.min(64, image.naturalWidth || image.width), cols = Math.max(1, Math.floor((image.naturalWidth || image.width) / frame)), rows = Math.max(1, Math.floor((image.naturalHeight || image.height) / frame));
        const column = cols > 1 && villager.state === 'walk' ? Math.floor(now * (settings.fps ?? 6) + villager.anim) % cols : 0, row = rows > 1 ? 1 : 0;
        const px = villager.x * tileSize, py = villager.y * tileSize;
        context.globalAlpha = villager.alpha;
        if (villager.faceLeft) {
          context.save(); context.translate(px, py); context.scale(-1, 1);
          context.drawImage(image, column * frame, row * frame, frame, frame, -size / 2, -size / 2, size, size);
          context.restore();
        } else context.drawImage(image, column * frame, row * frame, frame, frame, px - size / 2, py - size / 2, size, size);
      }
      context.globalAlpha = 1;
    },
  };

  CityBuilder.Villagers = Villagers;
  CityBuilder.Optimizer?.register('villager images', { size: () => ({ count: Villagers.tinted.size }), trim: () => Villagers.tinted.clear() });
  (CityBuilder.Systems = CityBuilder.Systems || {}).villagers = { update: deltaSeconds => Villagers.update(deltaSeconds), reset: () => Villagers.reset() };
  const order = Config.settings?.systemOrder;
  if (Array.isArray(order) && !order.includes('villagers')) order.push('villagers');
})(window.CityBuilder);
