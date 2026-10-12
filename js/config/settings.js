/* Spelinställningar och balans */
CityBuilder.Config.settings = {
  chunkSize: 16,
  tileSize: 36,                  // pixlar per ruta vid zoom 1
  walkSpeed: 1,                  // rutor per sekund på gräs
  buildDurationSeconds: 1,
  outputBufferCapacity: 5,       // max i utbuffert innan producenten pausar
  flushThreshold: 1,             // överskott över detta skickas till lagret
  startingCarriers: 20,
  carriersPerBuilding: 2,
  startingResources: { wood: 12, plank: 10, stone: 10, hammer: 10 },
  gameSpeeds: [1, 2, 4, 8, 16, 32, 64],
  defaultEquipment: {}, // utrustning som varje produktionshus måste få (kan åsidosättas med requiredEquipment)
  wearPerPass: .05,              // slitage per bärarpassage
  maxWearSpeedBonus: .4,         // max hastighetsökning på helt upptrampad ruta
  maxPathSearchesPerFrame: 16,
  pathfinding: { nodeLimit: 3000, margin: 24, maxCells: 160000, maxCachedPaths: 800 },
  logistics: { planningIntervalSeconds: .25, maxTasks: 8, requestsPerBuilding: 4 },
  zoom: { min: .5, max: 2.5 },
  toastDurationMs: 3500,
  useImages: true,               // false = rita bara reservgrafik (inga bildförfrågningar)
  systemOrder: ['construction', 'production', 'logistics', 'units'],
};
