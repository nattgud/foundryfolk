/* Spelinställningar och balans */
CityBuilder.Config.settings = {
  chunkSize: 16,
  tileSize: 36,                  // pixlar per ruta vid zoom 1
  walkSpeed: 1,                  // rutor per sekund på gräs
  buildDurationSeconds: 1,
  outputBufferCapacity: 20,       // max i utbuffert innan producenten pausar
  flushThreshold: 0,             // överskott över detta skickas till lagret
  carriersPerBuilding: 3,
  deerActivationRadius: 2,
  deerPerChunk: 3,
  deerTreeSpreadChance: 0.005,
  startingResources: { wood: 10, plank: 10, stone: 10, hammer: 10 },
  gameSpeeds: [1, 2, 4, 8],
  defaultEquipment: {}, // utrustning som varje produktionshus måste få (kan åsidosättas med requiredEquipment)
  wearPerPass: 0.1,              // slitage per bärarpassage
  maxWearSpeedBonus: .25,         // max hastighetsökning på helt upptrampad ruta
  maxPathSearchesPerFrame: 16,
  pathfinding: { nodeLimit: 3000, margin: 24, maxCells: 160000, maxCachedPaths: 800 },
  logistics: {
    planningIntervalSeconds: .25,
    maxTasks: 8,
    requestsPerBuilding: 4,
    baseCarriers: 20,
    lowStock: 20
  },
  efficiency: { windowSeconds: 60, minSeconds: 5, warnBelow: .6, badBelow: .3 },
  zoom: { min: .5, max: 2.5 },
  toastDurationMs: 3500,
  useImages: true,
  corridors: {
    count: 6, 
    width: 0.2, 
    maxRadius: 160
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
    music: ["music/theme.mp3"],
  },
  playerColors: { 1: '#4aa3ff', 2: '#e5534b', 3: '#e0a030', 4: '#a56bd6' }, // lagfärg per spelare (ring runt soldater, ram runt byggnader), se core/players.js
  military: {
    searchRadius: 20,          // standardräckvidd (rutor) för att upptäcka fiender (försvarsläge)
    attackRadius: 75,          // räckvidd (rutor) i attackläge: soldaterna söker upp fiender så här långt bort
    buildingHp: 100,           // livspoäng för en byggnad som saknar eget maxHp
    leashFactor: 1.25,         // en soldat jagar inte längre bort än searchRadius * detta från sin byggnad eller post
    scanIntervalSeconds: 0.5,  // hur ofta byggnader och soldater letar efter fiender
    repathSeconds: 0.5,        // minsta tid mellan omräkningar av vägen mot ett rörligt mål
    retrySeconds: 2,           // väntetid innan en soldat försöker igen efter att något inte gick att nå
    workerRespawnSeconds: 10,  // tid innan en dödad arbetare ersätts
  },
  systemOrder: ['ai', 'construction', 'production', 'logistics', 'combat', 'units'],
};
