/* A*-vägsökning på oändligt rutnät (8 riktningar) med cache och sökbudget per bildruta. */
(function (CityBuilder) {
  'use strict';
  const { Config, World } = CityBuilder;

  const Pathfinder = {
    DIRECTIONS: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    pathCache: new Map(),
    remainingSearches: 8,   // återställs varje bildruta av Game
    arrayCapacity: 0,       // storlek på de återanvända arrayerna
    currentSearchId: 0,     // ökas per sökning så att gamla värden i arrayerna ignoreras

    clearCache() { this.pathCache.clear(); },

    // Gångkostnad för en ruta (slitna rutor är snabbare, byggnader blockerar)
    tileCost(x, y) {
      if (World.buildingAt(x, y)) return Infinity;
      const tile = World.getTile(x, y);
      return Config.terrain[tile.terrainType].walkCost * (1 - Config.settings.maxWearSpeedBonus * tile.wear);
    },

    // Returnerar väg (lista av rutor), null (ingen väg) eller undefined (sökbudgeten slut denna bildruta -> försök igen).
    // stopBeforeGoal = sluta på rutan före målet.
    findPath(startX, startY, goalX, goalY, stopBeforeGoal) {
      if (startX === goalX && startY === goalY) return [];
      const cacheKey = `${startX},${startY},${goalX},${goalY}${stopBeforeGoal ? 's' : ''}`;
      if (this.pathCache.has(cacheKey)) return this.pathCache.get(cacheKey);
      if (this.remainingSearches <= 0) return undefined;
      this.remainingSearches--;
      const path = this.search(startX, startY, goalX, goalY, stopBeforeGoal);
      if (this.pathCache.size > Config.settings.pathfinding.maxCachedPaths) this.pathCache.clear();
      this.pathCache.set(cacheKey, path);
      return path;
    },

    // A* i ett begränsat fönster runt start och mål, med återanvända typade arrayer
    search(startX, startY, goalX, goalY, stopBeforeGoal) {
      const settings = Config.settings.pathfinding, margin = settings.margin;
      const windowMinX = Math.min(startX, goalX) - margin, windowMinY = Math.min(startY, goalY) - margin;
      const windowWidth = Math.abs(startX - goalX) + 2 * margin + 1;
      const windowHeight = Math.abs(startY - goalY) + 2 * margin + 1;
      const cellCount = windowWidth * windowHeight;
      if (cellCount > settings.maxCells) return null;

      if (cellCount > this.arrayCapacity) {
        this.arrayCapacity = cellCount;
        this.costFromStart = new Float64Array(cellCount);
        this.parentIndex = new Int32Array(cellCount);
        this.costFromStartStamp = new Uint32Array(cellCount);  // vilken sökning costFromStart gäller för
        this.cachedTileCost = new Float32Array(cellCount);
        this.cachedTileCostStamp = new Uint32Array(cellCount);
        this.currentSearchId = 0;
      }
      const searchId = ++this.currentSearchId;
      const { costFromStart, parentIndex, costFromStartStamp, cachedTileCost, cachedTileCostStamp } = this;
      const indexOf = (x, y) => (y - windowMinY) * windowWidth + (x - windowMinX);

      const costAt = (x, y, index) => {
        if (cachedTileCostStamp[index] === searchId) return cachedTileCost[index];
        cachedTileCostStamp[index] = searchId;
        return (cachedTileCost[index] = this.tileCost(x, y));
      };
      const heuristic = (x, y) => {
        const dx = Math.abs(x - goalX), dy = Math.abs(y - goalY);
        return 1.1 * (Math.max(dx, dy) + .414 * Math.min(dx, dy));
      };

      const openSet = new CityBuilder.MinHeap();
      const startIndex = indexOf(startX, startY), goalIndex = indexOf(goalX, goalY);
      let expandedNodes = 0;
      costFromStart[startIndex] = 0; costFromStartStamp[startIndex] = searchId; parentIndex[startIndex] = -1;
      openSet.push([heuristic(startX, startY), startX, startY, 0]);

      while (openSet.size) {
        const [, x, y, costSoFar] = openSet.pop(), index = indexOf(x, y);
        if (costSoFar > costFromStart[index]) continue; // föråldrad post i kön

        if (index === goalIndex) {
          const path = [];
          for (let cell = index; cell !== startIndex; cell = parentIndex[cell]) {
            path.push({ x: windowMinX + cell % windowWidth, y: windowMinY + ((cell / windowWidth) | 0) });
          }
          path.reverse();
          if (stopBeforeGoal) path.pop();
          return path;
        }
        if (++expandedNodes > settings.nodeLimit) return null;

        for (const [dx, dy] of this.DIRECTIONS) {
          const nextX = x + dx, nextY = y + dy;
          if (nextX < windowMinX || nextY < windowMinY || nextX >= windowMinX + windowWidth || nextY >= windowMinY + windowHeight) continue;
          const nextIndex = indexOf(nextX, nextY), nextCost = costAt(nextX, nextY, nextIndex);
          if (nextCost === Infinity && nextIndex !== goalIndex) continue; // endast målet får vara blockerat
          // inga diagonaler som skär hörn av blockerade rutor
          if (dx && dy && (costAt(x + dx, y, indexOf(x + dx, y)) === Infinity || costAt(x, y + dy, indexOf(x, y + dy)) === Infinity)) continue;
          const newCost = costSoFar + (dx && dy ? 1.414 : 1) * (nextCost === Infinity ? 1 : nextCost);
          if (costFromStartStamp[nextIndex] !== searchId || newCost < costFromStart[nextIndex]) {
            costFromStartStamp[nextIndex] = searchId;
            costFromStart[nextIndex] = newCost;
            parentIndex[nextIndex] = index;
            openSet.push([newCost + heuristic(nextX, nextY), nextX, nextY, newCost]);
          }
        }
      }
      return null;
    },
  };

  CityBuilder.Pathfinder = Pathfinder;
})(window.CityBuilder);
