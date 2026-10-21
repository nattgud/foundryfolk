/* Terränggenerator: bestämmer terrängtyp per ruta utifrån regellistan i Config.world.rules.
   Lägg till nya biomer genom att utöka rules/features i config/world.js. */
(function (CityBuilder) {
  'use strict';
  const { Utils } = CityBuilder;

  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const Generator = {
    // Slutlig terräng. Enstaka berg- eller vattenrutor (inga grannar av samma slag) ersätts av grannarnas vanligaste typ,
    // så att tröskeleffekter i bruset inte ger ensamma rutor mitt i en annan terräng.
    terrainTypeAt(x, y) {
      const terrainType = this.baseTypeAt(x, y);
      if (terrainType !== 'mountain' && terrainType !== 'water') return terrainType;
      if (Math.hypot(x, y) < CityBuilder.Config.world.clearRadius) return terrainType;
      const neighbours = [];
      for (const [dx, dy] of NEIGHBOURS) {
        const neighbour = this.baseTypeAt(x + dx, y + dy);
        if (neighbour === terrainType) return terrainType;   // de flesta rutor avgörs redan av första grannen
        neighbours.push(neighbour);
      }
      const votes = {};
      let best = neighbours[0];
      for (const neighbour of neighbours) if ((votes[neighbour] = (votes[neighbour] || 0) + 1) > votes[best]) best = neighbour;
      return best;
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
        if (Math.hypot(x - feature.x, y - feature.y) <= feature.radius && Utils.hash(x, y, 7) < .9) terrainType = feature.terrainType;
      }
      if (terrainType === 'water' || terrainType === 'mountain') terrainType = this.bridge(x, y, terrainType);
      return this.carve(x, y, distanceFromOrigin, terrainType);
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
