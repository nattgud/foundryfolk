/* Spelinställningar och balans */
CityBuilder.Config.settings = {
  chunkSize: 16,
  tileSize: 36,                  // pixlar per ruta vid zoom 1
  walkSpeed: 1,                  // rutor per sekund på gräs
  buildDurationSeconds: 1,
  outputBufferCapacity: 20,       // max i utbuffert innan producenten pausar
  flushThreshold: 0,             // överskott över detta skickas till lagret
  baseCarriers: 5,
  carriersPerBuilding: 2,
  deerActivationRadius: 2,
  deerPerChunk: 3,
  deerTreeSpreadChance: 0.02,
  startingResources: { wood: 12, plank: 5, stone: 10, hammer: 10 },
  gameSpeeds: [1, 2, 4, 8],
  defaultEquipment: {}, // utrustning som varje produktionshus måste få (kan åsidosättas med requiredEquipment)
  wearPerPass: 0.1,              // slitage per bärarpassage
  maxWearSpeedBonus: .25,         // max hastighetsökning på helt upptrampad ruta
  maxPathSearchesPerFrame: 16,
  pathfinding: { nodeLimit: 3000, margin: 24, maxCells: 160000, maxCachedPaths: 800 },
  logistics: { planningIntervalSeconds: .25, maxTasks: 8, requestsPerBuilding: 4 },
  zoom: { min: .5, max: 2.5 },
  toastDurationMs: 3500,
  useImages: true,
  logistics: {
    lowStock: 20
  },
  audio: {  // play('coin', { x: ruta_x, y: ruta_y })
    sounds: {
      // click: 'sounds/click.mp3',
      // build: 'sounds/build.mp3',
      // built: 'sounds/built.mp3',
      // demolish: 'sounds/demolish.mp3',
      // error: 'sounds/error.mp3',
      // levelComplete: 'sounds/level_complete.mp3',
      // drop: 'sounds/drop.mp3',
    },
    music: [],
  },
  systemOrder: ['construction', 'production', 'logistics', 'units'],
};
