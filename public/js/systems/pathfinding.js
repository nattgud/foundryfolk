/* Vägsökning: A* på oändligt rutnät (8 riktningar), tidsuppdelad och delad mellan alla enheter.
   - findPath() lägger en förfrågan i kö och returnerar undefined tills svaret finns (null = ingen väg). Samma start/mål delar sökning.
   - update() körs en gång per simuleringsruta och får bara expandera nodesPerFrame noder, så tiden per bildruta är konstant
     oavsett antal enheter. En lång sökning fortsätter nästa bildruta.
   - Kostnaden är gångtid per ruta (terräng * slitage), så stigar och snabb terräng väljs automatiskt när det lönar sig.
   - Cachade vägar gäller en stund (cacheSeconds), så slitage och ny terräng får påverka nya rutter. Blockerade vägar
     upptäcks när enheten går och rensas med drop(). */
(function (CityBuilder) {
  'use strict';
  const { Config, World } = CityBuilder;

  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  const DIAGONAL = Math.SQRT2;
  const MAX_WEAR = 2; // samma tak som i units.js

  const Pathfinder = {
    DIRECTIONS: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    pathCache: new Map(),   // nyckel -> { path | null, until, epoch }
    pending: new Map(),     // nyckel -> förfrågan (i ankomstordning)
    active: null,           // sökningen som pågår
    time: 0,                // simuleringstid (s)
    frame: 0,
    epoch: 0,               // ökas av clearCache(): "ingen väg"-svar blir ogiltiga
    arrayCapacity: 0,
    searchId: 0,
    heapSize: 0,
    heapCapacity: 0,

    settings() { return Config.settings.pathfinding; },

    // Gångkostnad för en ruta (slitna rutor är snabbare, byggnader blockerar)
    tileCost(x, y) {
      if (World.buildingAt(x, y)) return Infinity;
      const tile = World.getTile(x, y);
      return Config.terrain[tile.terrainType].walkCost * (1 - Config.settings.maxWearSpeedBonus * tile.wear);
    },

    // Terräng har ändrats. Gamla "ingen väg"-svar kan vara fel nu. Vanliga vägar behålls (de kontrolleras när enheten går).
    clearCache() { this.epoch++; },

    // Rensa allt (ny värld)
    reset() { this.pathCache.clear(); this.pending.clear(); this.active = null; this.epoch++; },

    // Enheten upptäckte att vägen är blockerad: glöm den så att nästa sökning blir ny
    drop(path) {
      const entry = path && this.pathCache.get(path.key);
      if (entry && entry.path === path) this.pathCache.delete(path.key);
    },

    keyOf(startX, startY, goalX, goalY, stopBeforeGoal) {
      return `${startX},${startY},${goalX},${goalY}${stopBeforeGoal ? 's' : ''}`;
    },

    cached(key) {
      const entry = this.pathCache.get(key);
      if (!entry) return undefined;
      if (entry.until <= this.time || (entry.path === null && entry.epoch !== this.epoch)) {
        this.pathCache.delete(key);
        return undefined;
      }
      return entry.path;
    },

    // Väg (lista av rutor), null (ingen väg) eller undefined (väntar på sökning, fråga igen nästa bildruta).
    // stopBeforeGoal = sluta på rutan före målet.
    findPath(startX, startY, goalX, goalY, stopBeforeGoal) {
      if (startX === goalX && startY === goalY) return [];
      const key = this.keyOf(startX, startY, goalX, goalY, stopBeforeGoal);
      const hit = this.cached(key);
      if (hit !== undefined) return hit;

      let request = this.pending.get(key);
      if (!request) this.pending.set(key, request = { key, startX, startY, goalX, goalY, stopBeforeGoal: !!stopBeforeGoal, asked: 0 });
      request.asked = this.frame;
      return undefined;
    },

    // Direkt svar (t.ex. när spelaren placerar en byggnad). Avbryter den pågående sökningen, som startar om.
    findPathNow(startX, startY, goalX, goalY, stopBeforeGoal) {
      if (startX === goalX && startY === goalY) return [];
      const key = this.keyOf(startX, startY, goalX, goalY, stopBeforeGoal);
      const hit = this.cached(key);
      if (hit !== undefined) return hit;

      if (this.active) this.requeueActive();
      this.pending.delete(key);
      this.begin({ key, startX, startY, goalX, goalY, stopBeforeGoal: !!stopBeforeGoal, asked: this.frame });
      if (this.active) this.run(Infinity);
      return this.pathCache.get(key).path;
    },

    requeueActive() {
      const queue = new Map([[this.active.key, this.active]]);
      for (const [key, request] of this.pending) queue.set(key, request);
      this.pending = queue;
      this.active = null;
    },

    // Anropas en gång per simuleringsruta
    update(deltaSeconds) {
      this.time += deltaSeconds;
      this.frame++;
      this.expireCache();

      let budget = this.settings().nodesPerFrame ?? 3000;
      while (budget > 0) {
        if (!this.active) {
          const request = this.nextRequest();
          if (!request) break;
          this.begin(request);
          if (!this.active) continue;                                 // klar direkt (för stort fönster)
        }
        budget = this.run(budget);
      }
    },

    // Äldsta förfrågan som någon fortfarande väntar på
    nextRequest() {
      for (const [key, request] of this.pending) {
        this.pending.delete(key);
        if (this.frame - request.asked > 3) continue;                // ingen frågar längre
        const hit = this.cached(key);
        if (hit !== undefined) continue;                              // redan besvarad
        return request;
      }
      return null;
    },

    // Ta bort några gamla poster per bildruta och håll storleken nere
    expireCache() {
      const cache = this.pathCache;
      let checked = 0;
      for (const [key, entry] of cache) {
        if (++checked > 8) break;
        if (entry.until <= this.time) cache.delete(key); else break;
      }
      const max = this.settings().maxCachedPaths;
      if (cache.size > max) {
        let remove = cache.size - (max * 0.75 | 0);
        for (const key of cache.keys()) { cache.delete(key); if (--remove <= 0) break; }
      }
    },

    finish(request, path) {
      const settings = this.settings();
      if (path) path.key = request.key;
      this.pathCache.set(request.key, {
        path,
        until: this.time + (path ? (settings.cacheSeconds ?? 45) : (settings.noPathSeconds ?? 8)),
        epoch: this.epoch,
      });
      this.active = null;
    },

    // Förbered en sökning: fönster runt start och mål, återanvända typade arrayer
    begin(request) {
      const settings = this.settings(), margin = settings.margin;
      const { startX, startY, goalX, goalY } = request;
      const minX = Math.min(startX, goalX) - margin, minY = Math.min(startY, goalY) - margin;
      const width = Math.abs(startX - goalX) + 2 * margin + 1;
      const height = Math.abs(startY - goalY) + 2 * margin + 1;
      const cellCount = width * height;
      this.active = request;
      if (cellCount > settings.maxCells) return this.finish(request, null);

      if (cellCount > this.arrayCapacity) {
        this.arrayCapacity = cellCount;
        this.gCost = new Float64Array(cellCount);
        this.parent = new Int32Array(cellCount);
        this.gStamp = new Uint32Array(cellCount);       // sökning som gCost gäller för
        this.closed = new Uint32Array(cellCount);       // sökning som noden är färdigbehandlad i
        this.tileCosts = new Float32Array(cellCount);
        this.tileStamp = new Uint32Array(cellCount);
        this.searchId = 0;
      }
      if (!this.heapCapacity) this.growHeap(1024);
      this.heapSize = 0;

      // Kortaste möjliga gångtid per ruta (snabbaste terräng, helt sliten stig) gör uppskattningen rimlig
      let cheapest = Infinity;
      for (const id in Config.terrain) {
        const cost = Config.terrain[id].walkCost;
        if (cost > 0 && cost < cheapest) cheapest = cost;
      }
      const wearFactor = Math.max(0.2, 1 - Config.settings.maxWearSpeedBonus * MAX_WEAR);

      this.searchId++;
      const s = this.s = {
        request, minX, minY, width, height, expanded: 0,
        startIndex: (startY - minY) * width + (startX - minX),
        goalIndex: (goalY - minY) * width + (goalX - minX),
        heuristicScale: cheapest * wearFactor * (settings.heuristicWeight ?? 1.3),
      };
      this.gCost[s.startIndex] = 0; this.gStamp[s.startIndex] = this.searchId; this.parent[s.startIndex] = -1;
      this.push(this.heuristic(s, startX, startY), s.startIndex);
    },

    heuristic(s, x, y) {
      const dx = Math.abs(x - s.request.goalX), dy = Math.abs(y - s.request.goalY);
      return s.heuristicScale * (dx > dy ? dx + (DIAGONAL - 1) * dy : dy + (DIAGONAL - 1) * dx);
    },

    cost(x, y, index) {
      if (this.tileStamp[index] === this.searchId) return this.tileCosts[index];
      this.tileStamp[index] = this.searchId;
      return (this.tileCosts[index] = this.tileCost(x, y));
    },

    // Expanderar högst budget noder. Returnerar kvarvarande budget; this.active är null när sökningen är klar.
    run(budget) {
      const s = this.s, request = this.active, id = this.searchId;
      const { minX, minY, width, goalIndex } = s, maxX = minX + width, maxY = minY + s.height;
      const { gCost, gStamp, closed, parent } = this;
      const nodeLimit = this.settings().nodeLimit;

      while (this.heapSize) {
        if (budget-- <= 0) return 0;
        const index = this.pop();
        if (closed[index] === id) continue;
        closed[index] = id;

        if (index === goalIndex) {
          const path = [];
          for (let cell = index; cell !== s.startIndex; cell = parent[cell]) {
            path.push({ x: minX + cell % width, y: minY + ((cell / width) | 0) });
          }
          path.reverse();
          if (request.stopBeforeGoal) path.pop();
          this.finish(request, path);
          return budget;
        }
        if (++s.expanded > nodeLimit) break;

        const x = minX + index % width, y = minY + ((index / width) | 0), g = gCost[index];
        for (let d = 0; d < 8; d++) {
          const nextX = x + DX[d], nextY = y + DY[d];
          if (nextX < minX || nextY < minY || nextX >= maxX || nextY >= maxY) continue;
          const nextIndex = index + DY[d] * width + DX[d];
          if (closed[nextIndex] === id) continue;
          const nextCost = this.cost(nextX, nextY, nextIndex);
          if (nextCost === Infinity && nextIndex !== goalIndex) continue; // endast målet får vara blockerat
          // inga diagonaler som skär hörn av blockerade rutor
          if (d >= 4 && (this.cost(nextX, y, index + DX[d]) === Infinity || this.cost(x, nextY, index + DY[d] * width) === Infinity)) continue;
          const newCost = g + (d >= 4 ? DIAGONAL : 1) * (nextCost === Infinity ? 1 : nextCost);
          if (gStamp[nextIndex] !== id || newCost < gCost[nextIndex]) {
            gStamp[nextIndex] = id;
            gCost[nextIndex] = newCost;
            parent[nextIndex] = index;
            this.push(newCost + this.heuristic(s, nextX, nextY), nextIndex);
          }
        }
      }
      this.finish(request, null);
      return budget;
    },

    // ---- Binär min-hög i typade arrayer (inga allokeringar per nod) --------------------------------

    growHeap(capacity) {
      const keys = new Float64Array(capacity), items = new Int32Array(capacity);
      if (this.heapSize) { keys.set(this.heapKeys.subarray(0, this.heapSize)); items.set(this.heapItems.subarray(0, this.heapSize)); }
      this.heapKeys = keys; this.heapItems = items; this.heapCapacity = capacity;
    },

    push(key, item) {
      if (this.heapSize === this.heapCapacity) this.growHeap(this.heapCapacity * 2);
      const keys = this.heapKeys, items = this.heapItems;
      let i = this.heapSize++;
      while (i > 0) {
        const parentIndex = (i - 1) >> 1;
        if (keys[parentIndex] <= key) break;
        keys[i] = keys[parentIndex]; items[i] = items[parentIndex];
        i = parentIndex;
      }
      keys[i] = key; items[i] = item;
    },

    pop() {
      const keys = this.heapKeys, items = this.heapItems;
      const top = items[0], lastKey = keys[--this.heapSize], lastItem = items[this.heapSize], size = this.heapSize;
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= size) break;
        if (child + 1 < size && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= lastKey) break;
        keys[i] = keys[child]; items[i] = items[child];
        i = child;
      }
      keys[i] = lastKey; items[i] = lastItem;
      return top;
    },
  };

  CityBuilder.Pathfinder = Pathfinder;
})(window.CityBuilder);