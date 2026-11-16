/* Civila byggnader och detaljer: byn som växer av sig själv. Regler, bilder och tabellen med hur många av varje sort: se js/config/civils.js.
   Bara utseende: de blockerar aldrig något och rör ingen logik. De ligger i en egen lista (inte World.buildings) och ritas under byggnader och enheter (lagret 'civils').

   Växten: varje gång en spelares byggnad byggs eller rivs (World.placeBuilding / removeBuilding -> onBuilding) bokas ett försök 1-15 sekunder fram, och var
   heartbeat:e sekund bokas ett för varje spelare. Ett försök räknar ut vad som saknas mest (tabellen mot spelarens byggnader och speltiden), letar en lämplig plats nära byggnaden
   (en hel ruta intill en väg eller en egen byggnad; en liten detalj i kanten av en sådan ruta, mot vägen) och lägger en enda ny där. Den tonar in under några sekunder.
   Bygger spelaren på rutan försvinner den direkt (clearTile i World.placeBuilding). Snedda vägar: stigen ritas över de två hörnrutorna vid en snedsteg (layers.js), så de räknas som stig (corner), och hus och detaljer kan stå vid en snedd väg hörn mot hörn (DIAGONALS). Försvinner vägen eller byggnaden den står intill, eller blir rutan en resurs, tonar den ut inom 10 sekunder (recheck, sweep). Uppstår en stig under en tonar den ut (onWear/leave), och aldrig byggs något på en stig. Vatten, meteorer, tornados, eld och utslagning tar bort dem (clearTile, clearArea, update, clearPlayer).

   Prestanda: allt ligger i rutnätshinkar (BUCKET x BUCKET rutor) som liken. Ritningen går bara över hinkarna på skärmen, borttagning bara över hinkarna i närheten, och växten
   söker bara i en liten ruta runt byggnaden, högst ett fåtal gånger per sekund. Slumpen är Math.random (bara utseende, påverkar aldrig spelets gång). */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players, Utils } = CityBuilder;

  const BUCKET = 8;
  const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // upp, höger, ner, vänster
  const DIAGONALS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];   // snedvägar (stigar ritas diagonalt, se layers.js drawPathChunk)
  const ROAD_INTO = .08;                              // hur långt in på vägkanten en liten detalj sitter (andel av en ruta)
  const MAX_QUEUE = 500, PER_FRAME = 3;               // bokade försök, och hur många som kan köras en bildruta
  const bucketKey = (bx, by) => (bx + 32768) * 65536 + (by + 32768);
  const round = value => Math.round(value * 100) / 100;
  const options = () => Config.civils || {};
  const enabled = () => options().enabled !== false && CityBuilder.Levels?.current?.civils !== false;
  const between = ([low, high]) => low + Math.random() * (high - low);
  const countsAs = building => !building.removed && !building.dead && !building.definition.pile && !building.definition.linePlacement && Players.isPlayer(building.player);

  const Civils = {
    buckets: new Map(),   // hinknyckel -> [föremål]
    tiles: new Map(),     // rutnyckel -> { big: föremål | null, decor: [föremål] }
    counts: new Map(),    // spelare -> Map(sort -> antal)
    queue: [],            // bokade försök, tidigast först: { at, player, x, y, building, gone }
    leaving: [],          // föremål som tonar ut: en stig har uppstått under dem
    sweepKeys: [],        // hinkar som återstår att kontrollera i den löpande genomgången (sweep)
    ghost: 1,             // genomskinlighet medan spelaren placerar en byggnad (rena utseendet, nollställs inte)
    drawn: 0,
    time: 0,              // speltid (sekunder) sedan världen började
    beat: 0,              // när nästa heartbeat kontrolleras
    nextBeat: new Map(),  // spelare -> när tiden ensam nästa gång ger den ett försök

    reset() { Object.assign(this, { buckets: new Map(), tiles: new Map(), counts: new Map(), queue: [], leaving: [], sweepKeys: [], time: 0, beat: 0, nextBeat: new Map() }); CityBuilder.Villagers?.reset(); },

    // ---- föremålen ----
    // Ett föremål: { type, kind, x, y (mitten, i kommatal), tx, ty (rutan), player, variant, born, fade, size (andel av en ruta), gone }
    add(type, x, y, player, variant, born = this.time, tile = null) {   // tile: [tx, ty] när föremålet ritas utanför sin egen ruta (en detalj som sitter inne på vägkanten)
      const spec = options().types?.[type];
      if (!spec) return null;
      const big = spec.kind !== 'decor', item = { type, kind: spec.kind, x, y, tx: tile ? tile[0] : Math.floor(x), ty: tile ? tile[1] : Math.floor(y), player, variant, born, fade: between(options().fade || [5, 10]), size: big ? 1 : .25, gone: false };
      const bucket = bucketKey(Math.floor(x / BUCKET), Math.floor(y / BUCKET));
      let list = this.buckets.get(bucket);
      if (!list) this.buckets.set(bucket, list = []);
      list.push(item);
      const key = Utils.tileKey(item.tx, item.ty);
      let use = this.tiles.get(key);
      if (!use) this.tiles.set(key, use = { big: null, decor: [] });
      if (big) use.big = item; else use.decor.push(item);
      let have = this.counts.get(player);
      if (!have) this.counts.set(player, have = new Map());
      have.set(type, (have.get(type) || 0) + 1);
      return item;
    },
    drop(item) {
      if (item.gone) return;
      item.gone = true;
      const bucket = bucketKey(Math.floor(item.x / BUCKET), Math.floor(item.y / BUCKET)), list = this.buckets.get(bucket);
      if (list) { const at = list.indexOf(item); if (at >= 0) { list[at] = list[list.length - 1]; list.pop(); } if (!list.length) this.buckets.delete(bucket); }
      const key = Utils.tileKey(item.tx, item.ty), use = this.tiles.get(key);
      if (use) { if (use.big === item) use.big = null; else use.decor = use.decor.filter(other => other !== item); if (!use.big && !use.decor.length) this.tiles.delete(key); }
      const have = this.counts.get(item.player);
      if (have) have.set(item.type, Math.max(0, (have.get(item.type) || 0) - 1));
    },

    // callback(item) för alla föremål i hinkarna som täcker rutorna left..right, top..bottom (hinkarna täcker lite mer än rutorna: anroparen filtrerar själv)
    each(left, top, right, bottom, callback) {
      for (let by = Math.floor(top / BUCKET); by <= Math.floor(bottom / BUCKET); by++) {
        for (let bx = Math.floor(left / BUCKET); bx <= Math.floor(right / BUCKET); bx++) {
          const list = this.buckets.get(bucketKey(bx, by));
          if (list) for (const item of list) callback(item);
        }
      }
    },

    // ---- borttagning ----
    clearTile(x, y) {
      const use = this.tiles.get(Utils.tileKey(x, y));
      if (!use) return;
      if (use.big) this.drop(use.big);
      for (const item of [...use.decor]) this.drop(item);
    },
    clearArea(cx, cy, r) {   // allt inom radien r (rutor) från (cx, cy) (meteornedslag, tornados)
      if (!this.buckets.size) return;
      for (let by = Math.floor((cy - r) / BUCKET); by <= Math.floor((cy + r) / BUCKET); by++) {
        for (let bx = Math.floor((cx - r) / BUCKET); bx <= Math.floor((cx + r) / BUCKET); bx++) {
          const list = this.buckets.get(bucketKey(bx, by));
          if (list) for (const item of list.filter(other => Math.hypot(other.x - cx, other.y - cy) <= r + .5 * other.size)) this.drop(item);
        }
      }
    },
    clearPlayer(player) {   // en utslagen spelares by försvinner med resten
      this.queue = this.queue.filter(event => event.player !== player);
      for (const list of [...this.buckets.values()]) for (const item of list.filter(other => other.player === player)) this.drop(item);
    },

    // ---- stigar som uppstår och slits bort (units.js trampar upp, pathdecay.js slits ner) ----
    // En stig (samma gräns som den ritas med, pathWear) är aldrig en plats för civila byggnader: uppstår en under en tonar den ut, slits en bort blir rutan ledig igen.
    limit() { return options().pathWear ?? .125; },
    // En ruta med stig som syns: den egna rutan är sliten, eller så är den ett hörn i en snedsteg (två slitna rutor som bara hänger ihop snett: stigen ritas då över båda hörnrutorna också)
    worn(x, y) { const tile = World.getTile(x, y); return !!tile && tile.terrainType === 'grass' && tile.ground === 'grass' && tile.wear >= this.limit() && !World.buildingAt(x, y); },
    corner(x, y) {
      for (const [sx, sy] of DIAGONALS) if (this.worn(x + sx, y) && this.worn(x, y + sy) && !this.worn(x + sx, y + sy)) return true;
      return false;
    },
    path(x, y) {
      const tile = World.getTile(x, y);
      return !!tile && ((tile.terrainType === 'grass' && tile.ground === 'grass' && tile.wear >= this.limit()) || this.corner(x, y));
    },
    onWear(x, y, before, after) {   // anropas när en rutas slitage ändras; gör något bara när det går över gränsen
      const limit = this.limit();
      if (before < limit && after >= limit) { if (this.tiles.size) { this.leave(x, y); this.recheck(x, y, 1); } return; }   // (recheck: hörnrutorna vid en snedsteg)
      if (before < limit || after >= limit || !enabled()) return;
      this.bookRecheck(x, y);   // det som stod vid stigen får tona ut
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {   // en ledig ruta: ge närmaste spelares by ett nytt försök
        const building = World.buildingAt(x + dx, y + dy);
        if (building && countsAs(building)) { this.book(building.player, x, y, building, false); return; }
      }
    },
    leave(x, y) {
      const use = this.tiles.get(Utils.tileKey(x, y));
      if (!use || !this.path(x, y)) return;
      for (const item of [use.big, ...use.decor]) if (item) this.startLeaving(item, 0);
    },
    // Börjar tona ut om delay sekunder (delay + utfadningen blir aldrig mer än 10 sekunder)
    startLeaving(item, delay) {
      if (item.dying !== undefined || item.gone) return;
      item.dying = this.time + delay; item.dieFor = between(options().leave || [2, 4]); this.leaving.push(item);
    },
    // Står föremålet kvar med rätta? Rutan är fortfarande tom gräsmark, och det finns fortfarande något att stå intill (en väg eller egen byggnad; en detalj av en sort
    // som bara står vid vägar eller hus kräver just det)
    supported(item) {
      if (!this.free(item.tx, item.ty)) return false;
      const wanted = item.kind === 'decor' ? options().types?.[item.type]?.anchor : null;
      for (const [sx, sy] of SIDES) { const kind = this.anchorKind(item.tx + sx, item.ty + sy, item.player); if (kind && (!wanted || wanted === kind)) return true; }
      if (!wanted || wanted === 'road') for (const [sx, sy] of DIAGONALS) if (this.road(item.tx + sx, item.ty + sy)) return true;   // en snedd väg räknas också
      return false;
    },
    // Kontrollerar föremålen runt (cx, cy): de som förlorat sin väg eller byggnad tonar ut inom ett par sekunder
    recheck(cx, cy, radius = 2) {
      for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
        const use = this.tiles.get(Utils.tileKey(x, y));
        if (use) for (const item of [use.big, ...use.decor]) if (item && item.dying === undefined && !this.supported(item)) this.startLeaving(item, Math.random() * 5);
      }
    },
    bookRecheck(x, y) { this.enqueue({ at: this.time + .5, x, y, recheck: true }); },
    // Den löpande genomgången: en hink åt gången, så att inget blir kvar av någon orsak som inget anrop fångade (en byggnad som blev kuliss, ny terräng ...)
    sweep() {
      if (!this.sweepKeys.length) { if (!this.buckets.size) return; this.sweepKeys = [...this.buckets.keys()]; }
      const list = this.buckets.get(this.sweepKeys.pop());
      if (list) for (const item of list) if (item.dying === undefined && !this.supported(item)) this.startLeaving(item, Math.random() * 5);
    },

    // ---- byggnader som byggs och rivs ----
    // built: true när en byggnad placeras (rutan töms direkt), false när den rivs
    onBuilding(building, built) {
      if (!enabled()) return;
      const definition = building.definition;
      if (built && !definition.pile) this.clearTile(building.x, building.y);
      if (!built) this.bookRecheck(building.x, building.y);   // det som stod intill den får tona ut
      if (definition.pile || definition.linePlacement || building.dead || !Players.isPlayer(building.player)) return;
      this.book(building.player, building.x, building.y, building, !built);
    },
    book(player, x, y, building, gone) {
      if (this.queue.length >= MAX_QUEUE) return;
      this.enqueue({ at: this.time + between(options().delay || [1, 15]), player, x, y, building, gone });
    },
    enqueue(event) {
      let i = this.queue.length;
      while (i > 0 && this.queue[i - 1].at > event.at) i--;
      this.queue.splice(i, 0, event);
    },

    // ---- tiden ----
    update(deltaSeconds) {
      if (!enabled()) return;
      this.time += deltaSeconds;
      if (this.leaving.length) this.leaving = this.leaving.filter(item => { if (item.gone) return false; if (this.time - item.dying < item.dieFor) return true; this.drop(item); return false; });
      for (let n = 0; n < PER_FRAME && this.queue.length && this.queue[0].at <= this.time; n++) {
        const event = this.queue.shift();
        if (event.recheck) { this.recheck(event.x, event.y); continue; }
        if (!event.gone && (event.building.removed || event.building.dead)) continue;   // byggnaden hann försvinna eller bli en kuliss
        this.attempt(event.player, event.x, event.y);
      }
      this.sweep();
      if (this.time >= this.beat) { this.beat = this.time + 5; this.heartbeat(); }
      if (this.buckets.size) {   // tornados och eld tar det de rör vid
        for (const tornado of CityBuilder.Weather?.tornadoes || []) this.clearArea(tornado.x, tornado.y, (tornado.radius || 1) + .5);
        for (const fire of CityBuilder.Weather?.fires || []) if (fire.left > 0) this.clearTile(fire.x, fire.y);
        for (const fire of CityBuilder.Combat?.fires || []) this.clearTile(fire.x, fire.y);
      }
    },
    // Tiden ensam ger också fler: var heartbeat:e sekund bokas ett försök per spelare, vid en slumpad byggnad
    heartbeat() {
      const every = options().heartbeat || 20;
      const due = [];
      for (const player of [Players.HUMAN, ...Players.aiPlayers()]) if (this.time >= (this.nextBeat.get(player) ?? 0)) { this.nextBeat.set(player, this.time + every); due.push(player); }
      if (!due.length) return;
      const mine = new Map(due.map(player => [player, []]));
      for (const building of World.buildings) if (mine.has(building.player) && countsAs(building)) mine.get(building.player).push(building);
      for (const [player, list] of mine) if (list.length) { const building = list[Math.floor(Math.random() * list.length)]; this.book(player, building.x, building.y, building, false); }
    },

    // ---- vad som saknas, och var det ska stå ----
    want(spec, buildings, minutes) {
      if (buildings < (spec.from || 0) || minutes < (spec.after || 0)) return 0;
      return Math.min(spec.max ?? Infinity, Math.floor((spec.rate || 0) * buildings + (spec.perMinute || 0) * minutes));
    },
    attempt(player, cx, cy) {
      const settings = options();
      let total = 0, buildings = 0;
      for (const building of World.buildings) if (building.player === player && countsAs(building)) buildings++;
      const have = this.counts.get(player) || new Map();
      for (const count of have.values()) total += count;
      if (!buildings || total >= (settings.max ?? 1e9)) return false;
      const minutes = this.time / 60, list = [];
      for (const [type, spec] of Object.entries(settings.types || {})) {
        const lack = this.want(spec, buildings, minutes) - (have.get(type) || 0);
        if (lack > 0) list.push({ type, spec, weight: Math.sqrt(lack) * (spec.weight ?? 1) });
      }
      for (let tries = 0; tries < 3 && list.length; tries++) {   // sorten väljs slumpat efter hur mycket som saknas; går den inte att placera prövas nästa
        let pick = Math.random() * list.reduce((sum, entry) => sum + entry.weight, 0), index = 0;
        while (index < list.length - 1 && (pick -= list[index].weight) > 0) index++;
        const { type, spec } = list.splice(index, 1)[0], spot = spec.kind === 'decor' ? this.decorSpot(player, cx, cy, spec) : this.bigSpot(player, cx, cy);
        if (spot) { this.add(type, spot.x, spot.y, player, spec.variants > 1 ? 1 + Math.floor(Math.random() * spec.variants) : 1, undefined, spot.tile); return true; }
      }
      return false;
    },

    // Går en ruta att bygga en civil byggnad på? Tom gräsmark, inte stig, utan byggnad eller kuliss
    free(x, y) {
      const tile = World.getTile(x, y);
      if (!tile || tile.terrainType !== 'grass' || this.path(x, y)) return false;   // bara tom gräsmark (alla undergrunder, grus också): aldrig resurser, inte heller sandfyndigheter
      return !World.buildingAt(x, y) && !World.sceneryAt(x, y);
    },
    road(x, y) {
      const tile = World.getTile(x, y);
      return !!tile && tile.terrainType === 'grass' && tile.ground === 'grass' && tile.wear >= (options().roadWear ?? .3) && !World.buildingAt(x, y);
    },
    // Något att bygga intill: en väg, eller en egen byggnad (inte en kuliss, en varuhög eller en mur). anchorKind säger vilket: 'road', 'building' eller null
    anchorKind(x, y, player) {
      const building = World.buildingAt(x, y);
      if (building) return building.player === player && countsAs(building) ? 'building' : null;
      return this.road(x, y) ? 'road' : null;
    },
    anchor(x, y, player) { return !!this.anchorKind(x, y, player); },
    // Rutorna inom radien runt (cx, cy) som är lediga, inte väg och inte upptagna av en civil byggnad: callback(x, y, avstånd)
    scan(cx, cy, callback) {
      const radius = options().radius || 10;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        const x = cx + dx, y = cy + dy;
        if (this.free(x, y) && !this.road(x, y)) callback(x, y, distance);
      }
    },

    // En hel ruta: intill en väg eller en egen byggnad, helst nära bebyggelsen och intill andra civila byggnader (så det blir rader och kvarter)
    bigSpot(player, cx, cy) {
      let best = null, bestScore = -Infinity;
      this.scan(cx, cy, (x, y, distance) => {
        if (this.tiles.has(Utils.tileKey(x, y))) return;
        let anchors = 0, friends = 0;
        for (const [sx, sy] of SIDES) { if (this.anchor(x + sx, y + sy, player)) anchors++; else if (this.tiles.get(Utils.tileKey(x + sx, y + sy))?.big) friends++; }
        for (const [sx, sy] of DIAGONALS) if (this.road(x + sx, y + sy)) anchors += .7;   // snedvägar: hörn mot hörn
        if (!anchors) return;
        const score = anchors * 2 + friends * .7 - distance * .15 + Math.random() * 1.2;
        if (score > bestScore) { bestScore = score; best = { x: x + .5, y: y + .5 }; }
      });
      return best;
    },
    // En liten detalj: i kanten av en ledig ruta mot en väg eller en egen byggnad, på en av tre platser (25 % bred, så de aldrig överlappar varandra eller en hel civil byggnad).
    // Mot en väg sitter den lite inne på vägkanten (ROAD_INTO rutor in över gränsen), mot en byggnad vid kanten. spec.anchor: 'road' eller 'building' begränsar vad sorten står intill
    // (lyktstolpar och skyltar längs vägar, tunnor och lådor vid hus). Rutan som den räknas till (tile) är ändå den lediga, så den tonar ut och sparas som förut.
    decorSpot(player, cx, cy, spec = {}) {
      let best = null, bestScore = -Infinity;
      this.scan(cx, cy, (x, y, distance) => {
        const use = this.tiles.get(Utils.tileKey(x, y));
        if (use?.big) return;
        if (!spec.anchor || spec.anchor === 'road') for (const [sx, sy] of DIAGONALS) {   // en snedd väg: i rutans hörn mot den
          if (!this.road(x + sx, y + sy)) continue;
          const fx = x + (sx > 0 ? 1 + ROAD_INTO : -ROAD_INTO), fy = y + (sy > 0 ? 1 + ROAD_INTO : -ROAD_INTO);
          if (use?.decor.some(other => Math.abs(other.x - fx) < .25 && Math.abs(other.y - fy) < .25)) continue;
          const score = Math.random() - distance * .06 - .1;
          if (score > bestScore) { bestScore = score; best = { x: fx, y: fy, tile: [x, y] }; }
        }
        for (const [sx, sy] of SIDES) {
          const kind = this.anchorKind(x + sx, y + sy, player);
          if (!kind || (spec.anchor && spec.anchor !== kind)) continue;
          const slot = Math.floor(Math.random() * 3), along = .2 + .3 * slot, inward = kind === 'road' ? ROAD_INTO : -.125;   // inward: rutor bortom kanten (negativt = innanför)
          const fx = x + (sx ? (sx > 0 ? 1 + inward : -inward) : along), fy = y + (sy ? (sy > 0 ? 1 + inward : -inward) : along);
          if (use?.decor.some(other => Math.abs(other.x - fx) < .25 && Math.abs(other.y - fy) < .25)) continue;
          const score = Math.random() - distance * .06;
          if (score > bestScore) { bestScore = score; best = { x: fx, y: fy, tile: [x, y] }; }
        }
      });
      return best;
    },

    // ---- sparning: { time, items: [[sort, x, y, spelare, variant, ålder i sekunder], ...] } ----
    pack() {
      const items = [];
      for (const list of this.buckets.values()) for (const item of list) if (item.dying === undefined) items.push([item.type, round(item.x), round(item.y), item.player, item.variant, Math.min(9999, Math.round(this.time - item.born)), item.tx, item.ty]);
      return { time: round(this.time), items };
    },
    restore(data) {
      this.reset();
      this.time = Number.isFinite(data?.time) ? data.time : 0;
      for (const [type, x, y, player, variant, age, tx, ty] of Array.isArray(data?.items) ? data.items : []) {
        if (![x, y].every(Number.isFinite) || !options().types?.[type] || this.path(Number.isFinite(tx) ? tx : Math.floor(x), Number.isFinite(ty) ? ty : Math.floor(y))) continue;
        this.add(type, x, y, player, variant || 1, this.time - (age || 0), Number.isFinite(tx) && Number.isFinite(ty) ? [tx, ty] : null);
      }
    },

    // ---- ritning (lagret 'civils', under byggnader och enheter) ----
    // Bildens sökväg: images/buildings/civil_<sort><variant>.png (rasmapp sätts in av Assets). Saknas bilden (listan raceimages.js) ritas en enkel reserv.
    imageOf(item) {
      const spec = options().types[item.type], Assets = CityBuilder.Assets;
      item.src ??= `images/buildings/civil_${item.type}${spec.variants > 1 ? item.variant : ''}.png`;
      if (!Assets.exists(Assets.raced(item.src, 'human'))) return null;
      return Assets.get(item.src, Players.raceOf(item.player));
    },
    draw(context, renderer) {
      if (!this.buckets.size) return;
      const tileSize = renderer.tileSize, view = renderer.viewBounds(tileSize * 2), Vision = CityBuilder.Vision, types = options().types;
      // Medan spelaren placerar en byggnad blir de civila nästan genomskinliga: man ser att man kan bygga rakt över dem (de försvinner då direkt). Mjuk övergång i riktig tid.
      const now = performance.now(), seconds = Math.min(.1, (now - (this.drawn || now)) / 1000);
      this.drawn = now;
      this.ghost += ((CityBuilder.Game?.placingType ? options().placing ?? .3 : 1) - this.ghost) * Math.min(1, seconds * 10);
      const left = Math.floor(view.left / tileSize / BUCKET), right = Math.floor(view.right / tileSize / BUCKET), top = Math.floor(view.top / tileSize / BUCKET), bottom = Math.floor(view.bottom / tileSize / BUCKET);
      for (const kind of ['big', 'decor']) {   // hela byggnader först, sedan detaljerna ovanpå
        for (let by = top; by <= bottom; by++) {
          for (let bx = left; bx <= right; bx++) {
            const list = this.buckets.get(bucketKey(bx, by));
            if (!list) continue;
            for (const item of list) {
              if (kind === 'big' ? item.kind === 'decor' : item.kind !== 'decor') continue;
              const px = item.x * tileSize, py = item.y * tileSize;
              if (px < view.left || px > view.right || py < view.top || py > view.bottom) continue;
              if (item.player !== Players.HUMAN && !Vision.visible(Players.HUMAN, item.x, item.y)) continue;   // andras byggnader syns bara när spelaren ser dem
              const alpha = this.ghost * Math.min(1, (this.time - item.born) / item.fade) * (item.dying === undefined ? 1 : Math.max(0, Math.min(1, 1 - (this.time - item.dying) / item.dieFor)));
              if (alpha <= 0) continue;
              const size = item.size * tileSize, image = this.imageOf(item);
              context.globalAlpha = alpha;
              if (image) context.drawImage(image, px - size / 2, py - size / 2, size, size);
              else this.drawFallback(context, px, py, size, types[item.type], item.kind === 'decor');
            }
          }
        }
      }
      context.globalAlpha = 1;
    },
    drawFallback(context, x, y, size, spec, small) {
      if (small) { context.fillStyle = spec.color || '#c9b38a'; context.fillRect(x - size * .3, y - size * .3, size * .6, size * .6); return; }
      context.fillStyle = spec.color || '#b98a5a'; context.fillRect(x - size * .32, y - size * .08, size * .64, size * .38);
      context.fillStyle = spec.roof || '#8a3b2d'; context.beginPath(); context.moveTo(x - size * .38, y - size * .06); context.lineTo(x, y - size * .38); context.lineTo(x + size * .38, y - size * .06); context.closePath(); context.fill();
      context.fillStyle = 'rgba(0,0,0,.35)'; context.fillRect(x - size * .06, y + size * .08, size * .12, size * .22);
    },
  };

  CityBuilder.Civils = Civils;
  (CityBuilder.Systems = CityBuilder.Systems || {}).civils = { update: deltaSeconds => Civils.update(deltaSeconds), reset: () => Civils.reset() };
  const order = Config.settings?.systemOrder;
  if (Array.isArray(order) && !order.includes('civils')) order.push('civils');
})(window.CityBuilder);
