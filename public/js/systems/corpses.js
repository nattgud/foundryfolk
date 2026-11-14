/* Lik och skelett: varje enhet som dör lämnar ett lik exakt där den föll (kommatal i rutor, inte bara rutan). Liket ligger kvar settings.corpses.life
   sekunder (speltid, standard 120) och blir sedan ett skelett som ligger kvar för alltid. Liket (och skelettet) försvinner helt om
   - rutan blir vatten (översvämning, Weather.raise -> clearTile),
   - en meteor slår ner vid det (Weather.strike -> clearArea),
   - en tornado far över det (update nedan: tornadons radie).
   Bara bilder, ingen påverkan på gång eller byggande. Ritas under byggnader och enheter (lagret 'corpses' i render/layers.js).

   Bilder (se sourcesFor): liket för en enhet ligger i images/units/<ras>/dead/ (djur: animals/dead, monster: monster/dead). Först <enhetens id>.png
   (archer.png, knight.png), annars default1.png, default2.png ... (en slumpas). Saknas rasens bild används människans, och finns ingen alls används
   kulissens lik (images/scenery/corpse1-6.png). Skelettet är images/scenery/skeleton1.png, skeleton2.png (settings.corpses.variants.skeleton = antal, standard 2).
   Bildlistan i js/config/raceimages.js (node tools/racemanifest.js) måste ha dead-bilderna. Storleken är enhetens egen bildstorlek (definition.imageSize) x scale,
   bilden speglas slumpmässigt. Saknas allt ritas en enkel reserv.

   Prestanda: allt ligger i rutnätshinkar (BUCKET x BUCKET rutor). Ritningen går bara över hinkarna på skärmen, borttagning (meteor, tornado, vatten) bara
   över hinkarna i närheten, och tiden för likens förvandling tas från en kö i dödsordning (bara det första liket behöver tittas på).
   Skelett över maxBones tas bort äldst först, så en mycket lång match inte fyller minnet eller sparningen.
   Inställningar (settings.corpses, alla valfria): { life: 120, maxBones: 4000, scale: 1, variants: { corpse: 1, skeleton: 1 } }. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players } = CityBuilder;

  const BUCKET = 8;   // rutor per hink och led
  const DEFAULTS = { life: 120, maxBones: 4000, scale: 1, variants: { corpse: 1, skeleton: 2 } };
  const options = () => ({ ...DEFAULTS, ...Config.settings?.corpses });
  const bucketKey = (bx, by) => (bx + 32768) * 65536 + (by + 32768);
  const round = value => Math.round(value * 100) / 100;
  const exists = source => !!CityBuilder.RaceImages?.has(source);   // listan över bilder som finns (så ingen bild som saknas begärs)

  // Bilderna för liket av en enhet: [källa, ...] (en av dem slumpas), eller [] om det inte finns någon. folder = ras, 'animals' eller 'monster'.
  const sourceCache = new Map();
  const sourcesFor = (folder, kind) => {
    const key = folder + '|' + kind;
    let list = sourceCache.get(key);
    if (list) return list;
    const dead = name => `images/units/${name}/dead/`, races = folder === 'animals' || folder === 'monster' ? [folder] : [folder, 'human'];
    list = [];
    for (const race of races) {
      if (exists(`${dead(race)}${kind}.png`)) { list = [`${dead(race)}${kind}.png`]; break; }
      for (let n = 1; exists(`${dead(race)}default${n}.png`); n++) list.push(`${dead(race)}default${n}.png`);
      if (list.length) break;
    }
    sourceCache.set(key, list);
    return list;
  };

  const Corpses = {
    buckets: new Map(),   // hinknyckel -> [{ x, y, seed, size, born, bones, gone }]
    fresh: [],            // liken i dödsordning (äldst först); fresh[head...] väntar på att bli skelett
    head: 0,
    order: [],            // skeletten i den ordning de blev skelett (äldst först), för maxBones
    orderHead: 0,
    bones: 0,             // antal skelett som finns
    time: 0,              // speltid (sekunder) sedan världen började

    reset() { Object.assign(this, { buckets: new Map(), fresh: [], head: 0, order: [], orderHead: 0, bones: 0, time: 0 }); },

    // En enhet har dött: ett lik där den låg. Inget lik på vatten eller lava (enheten har ändå inget där att lämna).
    add(unit) {
      if (!unit || !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) return;
      const tile = World.getTile(Math.floor(unit.x), Math.floor(unit.y));
      if (!tile || tile.terrainType === 'water' || tile.terrainType === 'lava') return;
      const definition = unit.definition || {};
      this.put({ x: unit.x, y: unit.y, seed: Math.random(), size: definition.imageSize || 16, born: this.time, bones: false, gone: false, folder: definition.isAnimal ? 'animals' : definition.isMonster ? 'monster' : Players.imageRace(definition, unit.player), kind: unit.kind });
    },

    put(item) {
      const key = bucketKey(Math.floor(item.x / BUCKET), Math.floor(item.y / BUCKET));
      let list = this.buckets.get(key);
      if (!list) this.buckets.set(key, list = []);
      list.push(item);
      if (item.bones) { this.order.push(item); this.bones++; } else this.fresh.push(item);
    },

    // Tid: liken som legat tillräckligt länge blir skelett. Tornados som far förbi tar det de rör vid.
    update(deltaSeconds) {
      this.time += deltaSeconds;
      const settings = options();
      while (this.head < this.fresh.length) {
        const item = this.fresh[this.head];
        if (!item.gone) {
          if (this.time - item.born < settings.life) break;
          item.bones = true; item.src = null; this.order.push(item); this.bones++;
        }
        this.head++;
      }
      if (this.head > 512) { this.fresh.splice(0, this.head); this.head = 0; }
      while (this.bones > settings.maxBones && this.orderHead < this.order.length) { const old = this.order[this.orderHead++]; if (!old.gone) this.drop(old); }
      if (this.orderHead > 512) { this.order.splice(0, this.orderHead); this.orderHead = 0; }
      if (!this.buckets.size) return;
      for (const tornado of CityBuilder.Weather?.tornadoes || []) this.clearArea(tornado.x, tornado.y, (tornado.radius || 1) + 0.5);
    },

    drop(item) {
      item.gone = true;
      if (item.bones) this.bones--;
      const key = bucketKey(Math.floor(item.x / BUCKET), Math.floor(item.y / BUCKET)), list = this.buckets.get(key);
      if (!list) return;
      const at = list.indexOf(item);
      if (at >= 0) { list[at] = list[list.length - 1]; list.pop(); }
      if (!list.length) this.buckets.delete(key);
    },

    // Allt vars läge ligger inom rektangeln och uppfyller 'inside' tas bort (liken och skeletten)
    clearWhere(left, top, right, bottom, inside) {
      if (!this.buckets.size) return;
      for (let by = Math.floor(top / BUCKET); by <= Math.floor(bottom / BUCKET); by++) {
        for (let bx = Math.floor(left / BUCKET); bx <= Math.floor(right / BUCKET); bx++) {
          const list = this.buckets.get(bucketKey(bx, by));
          if (list) for (const item of list.filter(inside)) this.drop(item);
        }
      }
    },

    // Allt inom radien r (rutor) från (cx, cy), i kommatal där rutans mitt är +0.5 (meteornedslag, tornados)
    clearArea(cx, cy, r) {
      this.clearWhere(cx - r, cy - r, cx + r, cy + r, item => Math.hypot(item.x - cx, item.y - cy) <= r);
    },

    // Allt på rutan (x, y): den blev vatten
    clearTile(x, y) { this.clearWhere(x, y, x + 0.999, y + 0.999, item => Math.floor(item.x) === x && Math.floor(item.y) === y); },

    // Sparning: [[x, y, slumptal, storlek, ålder i sekunder (-1 = skelett), ras, enhetens id], ...], äldst först så ordningen består
    pack() {
      const list = [];
      for (let i = this.orderHead; i < this.order.length; i++) { const item = this.order[i]; if (!item.gone) list.push([round(item.x), round(item.y), round(item.seed), item.size, -1]); }   // skelett behöver varken ras eller id
      for (let i = this.head; i < this.fresh.length; i++) { const item = this.fresh[i]; if (!item.gone) list.push([round(item.x), round(item.y), round(item.seed), item.size, round(this.time - item.born), item.folder, item.kind]); }
      return list;
    },
    restore(list) {
      this.reset();
      for (const [x, y, seed, size, age, folder, kind] of Array.isArray(list) ? list : []) {
        if (![x, y].every(Number.isFinite)) continue;
        this.put({ x, y, seed: seed ?? Math.random(), size: size || 16, born: age >= 0 ? this.time - age : 0, bones: !(age >= 0), gone: false, folder, kind });
      }
      this.fresh.sort((a, b) => a.born - b.born);   // äldst först (kön tittar bara på det första)
    },

    // Bildens sökväg: skelettet, liket av enhetens art (dead-mappen) eller kulissens lik. Väljs av liketts slumptal.
    sourceOf(item, settings) {
      if (item.bones) { const count = settings.variants?.skeleton || 1; return `images/scenery/skeleton${count > 1 ? 1 + Math.floor(item.seed * count) : ''}.png`; }
      const own = sourcesFor(item.folder, item.kind);
      if (own.length) return own[Math.floor(item.seed * own.length)];
      const variants = Config.story.sceneryTypes?.corpse?.variants || 1;
      return `images/scenery/corpse${variants > 1 ? 1 + Math.floor(item.seed * variants) : ''}.png`;
    },

    // Ritar de som syns (anropas av lagret 'corpses'). Reserv: en liggande figur, eller några ben.
    draw(context, renderer) {
      if (!this.buckets.size) return;
      const tileSize = renderer.tileSize, view = renderer.viewBounds(tileSize * 2), settings = options(), Assets = CityBuilder.Assets;
      const left = Math.floor(view.left / tileSize / BUCKET), right = Math.floor(view.right / tileSize / BUCKET), top = Math.floor(view.top / tileSize / BUCKET), bottom = Math.floor(view.bottom / tileSize / BUCKET);
      for (let by = top; by <= bottom; by++) {
        for (let bx = left; bx <= right; bx++) {
          const list = this.buckets.get(bucketKey(bx, by));
          if (!list) continue;
          for (const item of list) {
            const x = item.x * tileSize, y = item.y * tileSize;
            if (x < view.left || x > view.right || y < view.top || y > view.bottom) continue;
            const scale = item.size * settings.scale;
            const image = Assets.get(item.src ??= this.sourceOf(item, settings));   // bildens sökväg väljs en gång per lik
            context.save(); context.translate(x, y);
            if (image) { if (item.seed > .5) context.scale(-1, 1); context.drawImage(image, -scale / 2, -scale * image.height / image.width / 2, scale, scale * image.height / image.width); }
            else {
              context.rotate(item.seed * Math.PI * 2); const size = scale;
              if (item.bones) {   // reserv: ett par ben och en skalle
                context.strokeStyle = '#d8d2c0'; context.lineWidth = Math.max(1, size * .08); context.lineCap = 'round';
                context.beginPath(); context.moveTo(-size * .35, -size * .1); context.lineTo(size * .2, size * .1); context.moveTo(-size * .3, size * .12); context.lineTo(size * .2, -size * .12); context.stroke();
                context.fillStyle = '#e6e0d0'; context.beginPath(); context.arc(size * .3, 0, size * .1, 0, Math.PI * 2); context.fill();
              } else {   // reserv: en liggande figur
                context.fillStyle = '#3d3530'; context.beginPath(); context.ellipse(0, 0, size * .38, size * .13, 0, 0, Math.PI * 2); context.fill();
                context.fillStyle = '#b89a82'; context.beginPath(); context.arc(size * .38, 0, size * .1, 0, Math.PI * 2); context.fill();
              }
            }
            context.restore();
          }
        }
      }
    },
  };

  CityBuilder.Corpses = Corpses;
})(window.CityBuilder);
