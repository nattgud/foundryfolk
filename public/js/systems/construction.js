/* System: byggnation. Räknar upp byggprogress, kör onBuilt och hanterar vinst. Bärare skapas/tas bort av Logistics.balanceCarriers.
   Construction.build är gemensam för alla spelare (människa och dator): samma platsregler och samma kostnader.
   Byggplatsen (building.needsMaterials) betalas med varor som bärarna hämtar ur lagren (Logistics.requestSiteMaterials); de läggs i
   inputStock och bygget kan aldrig vara längre kommet än andelen av byggkostnaden som kommit fram. När det är klart förbrukas de. */
(function (CityBuilder) {
  'use strict';
  const { World, Behaviors, Economy, Pathfinder, Players, Config, Utils } = CityBuilder;

  // Försöker bygga. Returnerar null om det gick, annars orsaken: 'fog' | 'occupied' | 'terrain' | 'far' | 'unreachable' | 'cost' | 'unique'.
  const Construction = {
    // Närmaste egna byggnad inom maxBuildDistance rutor (luftlinje), eller undefined. Ingen får bygga var som helst.
    nearestOwnBuilding(x, y, player) {
      const limit = Config.settings.maxBuildDistance;
      let best, bestDistance = limit;
      for (const building of World.buildings) {
        const distance = Utils.distance(building.x - x, building.y - y);
        if (building.player === player && building.buildProgress >= 1 && !building.definition.pile && distance <= bestDistance) { best = building; bestDistance = distance; }
      }
      return best;
    },
    isNearOwnBuilding(x, y, player) { return Boolean(this.nearestOwnBuilding(x, y, player)); },

    // Byggnader med unique (monumentet) går bara att bygga en av per spelare
    isUniqueTaken: (buildingType, player) => Boolean(Config.buildings[buildingType].unique) && World.buildings.some(building => building.type === buildingType && building.player === player),

    // Spelaren kan inte bygga i dimman. Datorspelarna ser kartan som förut: de är bara blinda för motståndaren.
    isHidden(x, y, player) { return !CityBuilder.Vision.visible(player, x, y); },   // dimman gäller alla spelare lika, datorer också

    // Tar bort en byggnad. Soldater som bor där blir fria (de söker sig till en annan garnison eller vaktar platsen).
    // salvage = riven av ägaren: halva byggkostnaden och allt byggnaden höll (lager, in- och utbuffert, verktyg, det arbetaren bär)
    // blir kvar på marken som en hög, och bärarna för den till lagren. Inget försvinner. Förstörd i strid (salvage = false): innehållet går förlorat.
    dismantle(building, salvage) {
      Behaviors.forBuilding(building)?.onDemolished?.(building);
      World.removeBuilding(building);
      if (!salvage || building.definition.pile) return;
      const goods = {};
      const add = (resourceId, amount) => { if (amount > 0) goods[resourceId] = (goods[resourceId] || 0) + amount; };
      if (!building.needsMaterials) for (const resourceId in building.definition.buildCost) add(resourceId, Math.floor(building.definition.buildCost[resourceId] / 2));   // en byggplats har bara det som kommit fram
      for (const stock of [building.inputStock, building.outputStock, building.storedGoods]) for (const resourceId in stock) add(resourceId, stock[resourceId]);
      if (typeof building.workerUnit?.carriedResource === 'string') add(building.workerUnit.carriedResource, 1);
      this.dropPile(building.x, building.y, building.player, goods);
    },

    // Lägger varorna som en hög på rutan (finns redan en hög där fylls den på)
    dropPile(x, y, player, goods) {
      if (!Object.keys(goods).length) return;
      let pile = World.buildingAt(x, y);
      if (!pile) {
        pile = World.placeBuilding('pile', x, y, true, player);
        pile.hp = pile.maxHp = null;   // går inte att skada
      }
      if (!pile.definition.pile) return;
      for (const resourceId in goods) pile.outputStock[resourceId] = (pile.outputStock[resourceId] || 0) + goods[resourceId];
    },

    // Byggnad med inriktning (definition.variants): vilken variant som byggs på rutan. Gruvor: den som hör till fyndigheten
    // (terräng -> variant). Samlare: den upplåsta inriktning vars råvara finns närmast. undefined = ingen variant passar rutan.
    variantFor(buildingType, x, y) {
      const variants = Config.buildings[buildingType].variants;
      if (!variants) return buildingType;
      if (!Array.isArray(variants)) return variants[World.getTile(x, y)?.terrainType];
      const Levels = CityBuilder.Levels, open = variants.filter(id => !Levels || Levels.isUnlocked(id));
      let best = (open.length ? open : variants)[0], bestDistance = Infinity;
      for (const id of open) {
        const { sourceTerrain, searchRadius } = Config.buildings[id].job;
        for (let dy = -searchRadius; dy <= searchRadius; dy++) for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          const distance = Utils.distance(dx, dy);
          if (distance >= bestDistance || distance > searchRadius) continue;
          const tile = World.getTile(x + dx, y + dy);
          if (tile && tile.terrainType === sourceTerrain && tile.remainingAmount > 0) { bestDistance = distance; best = id; }
        }
      }
      return best;
    },

    // Det som byggplatserna ännu inte beställt hem (kostnad minus framkommet och på väg): redan lovat, så det kan inte användas två gånger
    pendingNeed(player) {
      const pending = {};
      for (const site of World.buildings) {
        if (site.player !== player || !site.needsMaterials) continue;
        for (const resourceId in site.definition.buildCost) {
          const missing = site.definition.buildCost[resourceId] - (site.inputStock[resourceId] || 0) - (site.incomingCount[resourceId] || 0);
          if (missing > 0) pending[resourceId] = (pending[resourceId] || 0) + missing;
        }
      }
      return pending;
    },

    // Hur mycket av resursen som går att använda till något nytt: lagret minus det som bärare redan hämtar (reserverat) och det pågående byggen
    // ännu väntar på. 'pending' (pendingNeed) kan skickas in när många resurser ska frågas på en gång.
    available(resourceId, player = Players.HUMAN, pending = this.pendingNeed(player)) {
      return Math.max(0, Economy.freeAmount(resourceId, player) - (pending[resourceId] || 0));
    },

    // Räcker lagren till kostnaden, utöver vad pågående byggen redan väntar på?
    canAfford(cost, player = Players.HUMAN, pending = this.pendingNeed(player)) {
      return Object.entries(cost).every(([resourceId, amount]) => this.available(resourceId, player, pending) >= amount);
    },

    // Det som saknas för kostnaden: [{ resourceId, need, have }] där have är det som går att använda just nu (tom lista = det räcker)
    shortage(cost, player = Players.HUMAN) {
      const pending = this.pendingNeed(player);
      return Object.entries(cost).map(([resourceId, need]) => ({ resourceId, need, have: this.available(resourceId, player, pending) })).filter(item => item.have < item.need);
    },

    // Det som ännu saknas på en byggplats (tomt när den inte väntar på något)
    missing(building) {
      const missing = {};
      if (!building.needsMaterials) return missing;
      for (const resourceId in building.definition.buildCost) {
        const left = building.definition.buildCost[resourceId] - (building.inputStock[resourceId] || 0);
        if (left > 0) missing[resourceId] = left;
      }
      return missing;
    },

    // Hur stor del av byggkostnaden som kommit fram (0-1)
    delivered(building) {
      const cost = building.definition.buildCost, total = Object.values(cost).reduce((sum, amount) => sum + amount, 0);
      if (!building.needsMaterials || !total) return 1;
      return Object.entries(cost).reduce((sum, [resourceId, amount]) => sum + Math.min(amount, building.inputStock[resourceId] || 0), 0) / total;
    },

    build(buildingType, x, y, player = Players.HUMAN) {
      const definition = Config.buildings[buildingType];
      const from = this.nearestOwnBuilding(x, y, player);   // vägen räknas från närmaste egna byggnad, så att utposter långt från basen går att bygga
      if (!from) return 'far';
      if (this.isHidden(x, y, player)) return 'fog';          // före terrängkollen, så att dimman inte avslöjar vad som ligger där
      if (this.isUniqueTaken(buildingType, player)) return 'unique';
      if (!World.canPlace(buildingType, x, y)) return definition.placeOnTerrain ? 'terrain' : 'occupied';
      const type = this.variantFor(buildingType, x, y);
      if (!type) return 'terrain';
      if (type !== buildingType && player === Players.HUMAN && CityBuilder.Levels && !CityBuilder.Levels.isUnlocked(type)) return 'locked';   // inriktningen är inte upplåst än
      if (Pathfinder.findPathNow(from.x, from.y, x, y) === null) return 'unreachable';
      if (!this.canAfford(definition.buildCost, player)) return 'cost';
      World.placeBuilding(type, x, y, false, player).needsMaterials = true;   // varorna hämtas av bärarna
      return null;
    },
  };
  CityBuilder.Construction = Construction;

  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.construction = {
    update(deltaSeconds) {
      const Construction = CityBuilder.Construction;
      for (const building of World.buildings) {
        if (building.buildProgress >= 1) continue;

        const progressIncrement = deltaSeconds / building.definition.buildDuration;
        building.buildProgress = Math.min(Construction.delivered(building), building.buildProgress + progressIncrement);   // väntar på material som inte kommit fram

        if (building.buildProgress < 1) continue;

        // Just färdigbyggd: materialet är förbrukat
        if (building.needsMaterials) { building.needsMaterials = false; building.inputStock = {}; }
        if (building.definition.job) {
          const behavior = Behaviors.forBuilding(building);
          if (behavior.onBuilt) behavior.onBuilt(building);
        }
        CityBuilder.Sound?.play('built', { x: building.x, y: building.y });
        if (building.definition.isWinBuilding) CityBuilder.UI.showToast('★ Monument is built!');
      }
    },
  };
})(window.CityBuilder);