/* Terränggenerator: bestämmer terrängtyp per ruta utifrån regellistan i Config.world.rules.
   Lägg till nya biomer genom att utöka rules/features i config/world.js. */
(function (CityBuilder) {
  'use strict';
  const { Utils } = CityBuilder;

  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BAR_CELL = 16;   // sandrevskandidater slumpas fram per ruta på så här många rutor
  const BAR_TRIES = 3;   // kandidater per ruta

  const Generator = {
    // Slutlig terräng: utjämning av enstaka rutor, vadställen över smala vattendrag och holmar utan fyndigheter.
    terrainTypeAt(x, y) {
      const base = this.baseTypeAt(x, y);
      if (base !== 'mountain' && base !== 'water') return this.settle(x, y, base);
      const around = [];   // grannarnas terräng i NEIGHBOURS-ordning, hämtas först när den behövs
      const at = i => around[i] ??= this.baseTypeAt(x + NEIGHBOURS[i][0], y + NEIGHBOURS[i][1]);
      const type = this.despeckle(x, y, base, at);
      if (type !== 'water') return type;
      return this.ford(at) === 'sand' || this.sandbar(x, y) ? 'sand' : 'water';
    },

    // Enstaka berg- eller vattenrutor (inga grannar av samma slag) ersätts av grannarnas vanligaste typ,
    // så att tröskeleffekter i bruset inte ger ensamma rutor mitt i en annan terräng.
    despeckle(x, y, terrainType, at) {
      if (Math.hypot(x, y) < CityBuilder.Config.world.clearRadius) return terrainType;
      const votes = {};
      let best;
      for (let i = 0; i < NEIGHBOURS.length; i++) {
        const neighbour = at(i);
        if (neighbour === terrainType) return terrainType;   // de flesta rutor avgörs redan av första grannen
        if (best === undefined) best = neighbour;
        if ((votes[neighbour] = (votes[neighbour] || 0) + 1) > votes[best]) best = neighbour;
      }
      return best;
    },

    // Vatten som bara är en ruta brett, med gångbar mark på båda sidor, är grunt: sand. Då är mark på andra sidan av en bäck
    // eller en smal vik aldrig helt avskuren. Två rutor eller bredare vatten är fortfarande ett hinder.
    ford(at) {
      const land = i => Number.isFinite(CityBuilder.Config.terrain[at(i)].walkCost);
      return (land(0) && land(1)) || (land(2) && land(3)) ? 'sand' : 'water';
    },

    // Landbryggor: sandrev över vatten (Config.world.landBridges) som binder ihop holmar och fastland, så att öar med resurser
    // går att nå. Varje ruta på BAR_CELL x BAR_CELL rutor slumpar fram några raka linjer genom vatten (density = chans per linje).
    // En linje blir ett rev bara om den korsar högst maxGap rutor vatten och har mark i båda ändar. Revet slingrar sig
    // lätt och växlar i bredd, så det ser ut som en naturlig sandbank. Resultatet sparas per ruta.
    sandbar(x, y) {
      const settings = CityBuilder.Config.world.landBridges;
      if (!settings) return false;
      const cellX = Math.floor(x / BAR_CELL), cellY = Math.floor(y / BAR_CELL);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        for (const bar of this.barsIn(cellX + i, cellY + j, settings)) if (this.onBar(bar, x, y)) return true;
      }
      return false;
    },

    barsIn(cellX, cellY, settings) {
      const fingerprint = Utils.hash(3, 5, 9) + ':' + settings.density + ':' + settings.maxGap;
      if (this.barKey !== fingerprint) { this.barKey = fingerprint; this.bars = new Map(); }
      const key = Utils.tileKey(cellX, cellY);
      let bars = this.bars.get(key);
      if (!bars) {
        bars = [];
        for (let k = 0; k < BAR_TRIES; k++) {
          if (Utils.hash(cellX, cellY, 600 + k) >= settings.density) continue;
          const bar = this.findBar(
            (cellX + Utils.hash(cellX, cellY, 610 + k)) * BAR_CELL, (cellY + Utils.hash(cellX, cellY, 620 + k)) * BAR_CELL,
            Utils.hash(cellX, cellY, 630 + k) * Math.PI, settings.maxGap, Utils.hash(cellX, cellY, 640 + k));
          if (bar) bars.push(bar);
        }
        this.bars.set(key, bars);
      }
      return bars;
    },

    // Går från vattenpunkten (x, y) åt båda håll längs vinkeln tills det blir mark. Berg eller för långt vatten: inget rev.
    findBar(x, y, angle, maxGap, id) {
      const dx = Math.cos(angle), dy = Math.sin(angle), terrain = CityBuilder.Config.terrain;
      const typeAt = t => this.baseTypeAt(Math.round(x + dx * t), Math.round(y + dy * t));
      if (typeAt(0) !== 'water') return null;
      const ends = [];
      for (const direction of [-1, 1]) {
        let t = 0, type;
        do { t += direction; type = typeAt(t); } while (type === 'water' && Math.abs(t) <= maxGap);
        if (!Number.isFinite(terrain[type].walkCost)) return null;
        ends.push(t);
      }
      if (ends[1] - ends[0] < 3) return null;   // smalare vatten är redan vadställen
      const middle = (ends[0] + ends[1]) / 2;   // revet ska korsa vattnet, inte följa en å eller klippa av ett hörn: vatten på båda sidor om mitten
      for (const side of [-2, 2]) {
        if (this.baseTypeAt(Math.round(x + dx * middle - dy * side), Math.round(y + dy * middle + dx * side)) !== 'water') return null;
      }
      const x1 = x + dx * ends[0], y1 = y + dy * ends[0], x2 = x + dx * ends[1], y2 = y + dy * ends[1];
      return { x1, y1, x2, y2, length: ends[1] - ends[0], id, phase: id * 20, wobble: .6 + 1.2 * Utils.hash(id * 1e4 | 0, 7, 650) };
    },

    onBar(bar, x, y) {
      const dx = bar.x2 - bar.x1, dy = bar.y2 - bar.y1, length = bar.length;
      const along = ((x - bar.x1) * dx + (y - bar.y1) * dy) / length;
      if (along < 0 || along > length) return false;
      const bend = bar.wobble * Math.sin(Math.PI * along / length) * Math.sin(along * .55 + bar.phase);   // noll i ändarna
      const across = ((x - bar.x1) * -dy + (y - bar.y1) * dx) / length - bend;
      return Math.abs(across) < .75 + .5 * Utils.smoothNoise(along / 3, bar.id * 100, 77);
    },

    // Fyndigheter (Config.world.deposits) på en liten holme, t.ex. mitt i en damm, går inte att nå och blir sand. Bara fyndigheter med
    // vatten intill kontrolleras: gångbar mark som hänger ihop med fler än isletSize rutor räknas som fastland.
    settle(x, y, terrainType) {
      const { deposits, isletSize } = CityBuilder.Config.world;
      if (!deposits.includes(terrainType) || !NEIGHBOURS.some(([dx, dy]) => this.baseTypeAt(x + dx, y + dy) === 'water')) return terrainType;
      const seen = new Set([Utils.tileKey(x, y)]), stack = [[x, y]];
      while (stack.length) {
        const [fromX, fromY] = stack.pop();
        for (const [dx, dy] of NEIGHBOURS) {
          const nextX = fromX + dx, nextY = fromY + dy, key = Utils.tileKey(nextX, nextY);
          if (seen.has(key)) continue;
          seen.add(key);
          if (!Number.isFinite(CityBuilder.Config.terrain[this.baseTypeAt(nextX, nextY)].walkCost)) continue;
          if (seen.size > isletSize) return terrainType;
          stack.push([nextX, nextY]);
        }
      }
      return 'sand';
    },

    // Terräng före utjämning: regler, särdrag och gångar.
    baseTypeAt(x, y) {
      const worldConfig = CityBuilder.Config.world;
      const distanceFromOrigin = Math.hypot(x, y);
      if (distanceFromOrigin < worldConfig.clearRadius) return 'grass';
      for (const clearing of worldConfig.clearings) if (Math.hypot(x - clearing.x, y - clearing.y) < clearing.radius) return 'grass';

      const context = {
        x, y, distanceFromOrigin,
        fractalNoise: Utils.fractalNoise,
        hash: Utils.hash,
        elevation: Utils.fractalNoise(x / 30, y / 30, 1) + Math.max(0, 1 - distanceFromOrigin / 20) * .35,
        moisture: Utils.fractalNoise(x / 12, y / 12, 2) + (distanceFromOrigin > 4 && distanceFromOrigin < 18 ? .08 : 0),
      };

      let terrainType = 'grass';
      for (const rule of worldConfig.rules) {
        const result = rule(context);
        if (result !== undefined) { terrainType = result; break; }
      }
      for (const feature of worldConfig.features) {
        if (terrainType !== 'water' && Math.hypot(x - feature.x, y - feature.y) <= feature.radius && Utils.hash(x, y, 7) < .9) terrainType = feature.terrainType;  // aldrig ut i vatten
      }
      if (terrainType === 'water' || terrainType === 'mountain') terrainType = this.bridge(x, y, terrainType);
      return this.meadow(x, y, this.carve(x, y, distanceFromOrigin, terrainType));
    },

    // Hemmaäng: byggnader kan bara stå på gräs, så runt varje bas (Config.world.meadows) blir skog och träsk gräs i stora fläckar.
    // Mest nära basen och inget alls vid kanten, så skogen finns kvar på lagom avstånd. Träsk försvinner helt närmast basen.
    meadow(x, y, terrainType) {
      if (terrainType !== 'tree' && terrainType !== 'bog') return terrainType;
      const { meadows, meadowRadius: radius } = CityBuilder.Config.world;
      let open = 0;
      for (const base of meadows) {
        const t = Math.min(1, Math.max(0, (Math.hypot(x - base.x, y - base.y) - 6) / (radius - 6)));
        open = Math.max(open, 1 - t * t * (3 - 2 * t));
      }
      if (!open) return terrainType;
      const patch = Utils.fractalNoise(x / 8, y / 8, 41);
      return (patch - .5) * 2.2 + .5 < open * (terrainType === 'bog' ? 1.2 : .5) ? 'grass' : terrainType;
    },

    // Landväg mellan spelarnas baser (Config.world.roads): vatten och berg längs vägen blir gräs så att basernas arméer alltid kan mötas.
    // Vägen följer en lätt slingrande linje mellan två punkter.
    bridge(x, y, terrainType) {
      for (const road of CityBuilder.Config.world.roads) {
        const dx = road.x2 - road.x1, dy = road.y2 - road.y1, length = Math.hypot(dx, dy);
        const along = ((x - road.x1) * dx + (y - road.y1) * dy) / length;            // rutor längs linjen
        if (along < -road.width || along > length + road.width) continue;
        const across = ((x - road.x1) * -dy + (y - road.y1) * dx) / length;          // rutor vid sidan av linjen
        if (Math.abs(across - road.wobble * Math.sin(along / road.wavelength + road.phase)) < road.width / 2) return 'grass';
      }
      return terrainType;
    },

    // Gräsgångar: krokiga stigar från startområdet och utåt. width = antal rutor (1 = en ruta bred). Vatten gräver de inte igenom.
    carve(x, y, distance, terrainType) {
      const settings = CityBuilder.Config.world.corridors || {};
      const count = settings.count ?? 6, width = settings.width ?? 1, maxRadius = settings.maxRadius ?? 160;
      if (terrainType === 'grass' || !count || distance > maxRadius || /water|river|lake|sea|ocean|moat/i.test(terrainType)) return terrainType;
      const table = this.corridorTable(count, maxRadius, Math.min(count, settings.roots ?? 3));
      const angle = Math.atan2(y, x), step = Math.min(maxRadius, distance | 0), fraction = distance - step;
      for (let k = 0; k < count; k++) {
        if (step < this.starts[k]) continue;
        const row = table[k], slope = row[step + 1] - row[step];            // hur snabbt stigen svänger per ruta
        const centre = row[step] + slope * fraction;
        let diff = Math.abs(angle - centre) % (2 * Math.PI);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        const tilt = distance * slope;                                        // stigens lutning mot riktningen utåt
        const across = diff * distance / Math.sqrt(1 + tilt * tilt);          // avstånd rakt ut från stigen
        const direction = centre + Math.atan(tilt);                           // stigens riktning
        const half = width * (Math.abs(Math.cos(direction)) + Math.abs(Math.sin(direction))) / 2;
        if (across < half) return 'grass';
      }
      return terrainType;
    },

    // Mittlinjen (vinkel) för varje gång vid varje heltalsavstånd. Byggs en gång per bana.
    corridorTable(count, maxRadius, roots) {
      const fingerprint = Utils.hash(3, 5, 9) + ':' + count + ':' + maxRadius + ':' + roots;
      if (this.tableKey === fingerprint) return this.table;
      this.tableKey = fingerprint;
      this.table = []; this.starts = [];
      const noise = (k, i) => (Utils.fractalNoise(i / 16, k * 5.3, 4) - .5) * 1.3;
      for (let k = 0; k < count; k++) {
        const row = new Float64Array(maxRadius + 3);
        if (k < roots) { // huvudgångar från basen
          const base = (k + .15 + .7 * Utils.hash(k, 91, 5)) * 2 * Math.PI / roots;
          for (let i = 0; i < row.length; i++) row[i] = base + noise(k, i);
          this.starts.push(0);
        } else {         // grenar: börjar på en huvudgång längre ut och svänger av åt ena sidan
          const parent = this.table[k % roots], start = 25 + 70 * Utils.hash(k, 92, 5) | 0;
          const side = Utils.hash(k, 93, 5) < .5 ? -1 : 1, spread = .5 + .5 * Utils.hash(k, 94, 5);
          for (let i = 0; i < row.length; i++) {
            row[i] = i <= start ? parent[i] : parent[start] + side * spread * (1 - start / i) + noise(k, i) - noise(k, start);
          }
          this.starts.push(start);
        }
        this.table.push(row);
      }
      return this.table;
    },
  };

  CityBuilder.Generator = Generator;
})(window.CityBuilder);
