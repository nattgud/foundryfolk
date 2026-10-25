/* System: byggnation. Räknar upp byggprogress, kör onBuilt och hanterar vinst. Bärare skapas/tas bort av Logistics.balanceCarriers.
   Construction.build är gemensam för alla spelare (människa och dator): samma platsregler och samma kostnader. */
(function (CityBuilder) {
  'use strict';
  const { World, Behaviors, Economy, Pathfinder, Players, Config } = CityBuilder;

  // Försöker bygga. Returnerar null om det gick, annars orsaken: 'fog' | 'occupied' | 'terrain' | 'far' | 'unreachable' | 'cost' | 'unique'.
  const Construction = {
    // Närmaste egna byggnad inom maxBuildDistance rutor (luftlinje), eller undefined. Ingen får bygga var som helst.
    nearestOwnBuilding(x, y, player) {
      const limit = Config.settings.maxBuildDistance;
      let best, bestDistance = limit;
      for (const building of World.buildings) {
        const distance = Math.hypot(building.x - x, building.y - y);
        if (building.player === player && building.buildProgress >= 1 && !building.definition.pile && distance <= bestDistance) { best = building; bestDistance = distance; }
      }
      return best;
    },
    isNearOwnBuilding(x, y, player) { return Boolean(this.nearestOwnBuilding(x, y, player)); },

    // Byggnader med unique (monumentet) går bara att bygga en av per spelare
    isUniqueTaken: (buildingType, player) => Boolean(Config.buildings[buildingType].unique) && World.buildings.some(building => building.type === buildingType && building.player === player),

    // Spelaren kan inte bygga i dimman. Datorspelarna ser kartan som förut: de är bara blinda för motståndaren.
    isHidden(x, y, player) { return !Players.isAI(player) && !CityBuilder.Vision.visible(player, x, y); },

    // Tar bort en byggnad. Soldater som bor där blir fria (de söker sig till en annan garnison eller vaktar platsen).
    // salvage = riven av ägaren: halva byggkostnaden och allt byggnaden höll (lager, in- och utbuffert, verktyg, det arbetaren bär)
    // blir kvar på marken som en hög, och bärarna för den till lagren. Inget försvinner. Förstörd i strid (salvage = false): innehållet går förlorat.
    dismantle(building, salvage) {
      Behaviors.forBuilding(building)?.onDemolished?.(building);
      World.removeBuilding(building);
      if (!salvage || building.definition.pile) return;
      const goods = {};
      const add = (resourceId, amount) => { if (amount > 0) goods[resourceId] = (goods[resourceId] || 0) + amount; };
      for (const resourceId in building.definition.buildCost) add(resourceId, Math.floor(building.definition.buildCost[resourceId] / 2));
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

    build(buildingType, x, y, player = Players.HUMAN) {
      const definition = Config.buildings[buildingType];
      const from = this.nearestOwnBuilding(x, y, player);   // vägen räknas från närmaste egna byggnad, så att utposter långt från basen går att bygga
      if (!from) return 'far';
      if (this.isHidden(x, y, player)) return 'fog';          // före terrängkollen, så att dimman inte avslöjar vad som ligger där
      if (this.isUniqueTaken(buildingType, player)) return 'unique';
      if (!World.canPlace(buildingType, x, y)) return definition.placeOnTerrain ? 'terrain' : 'occupied';
      if (Pathfinder.findPathNow(from.x, from.y, x, y) === null) return 'unreachable';
      if (!Economy.spend(definition.buildCost, player)) return 'cost';
      World.placeBuilding(buildingType, x, y, false, player);
      return null;
    },
  };
  CityBuilder.Construction = Construction;

  CityBuilder.Systems = CityBuilder.Systems || {};
  CityBuilder.Systems.construction = {
    update(deltaSeconds) {
      for (const building of World.buildings) {
        if (building.buildProgress >= 1) continue;

        const progressIncrement = deltaSeconds / building.definition.buildDuration;
        building.buildProgress = Math.min(1, building.buildProgress + progressIncrement);

        if (building.buildProgress < 1) continue;

        // Just färdigbyggd
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