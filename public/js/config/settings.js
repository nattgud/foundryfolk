/* Spelinställningar och balans */
CityBuilder.Config.settings = {
  chunkSize: 16,
  tileSize: 36,                  // pixlar per ruta vid zoom 1
  walkSpeed: 1,                  // rutor per sekund på gräs
  buildDurationSeconds: 1,
  inputBufferFactor: 3,           // ett hus håller så många omgångar indata (insats per omgång * detta)
  outputBufferCapacity: 20,       // max i utbuffert innan producenten pausar
  flushThreshold: 0,             // överskott över detta skickas till lagret
  carriersPerBuilding: 3,
  animalPerChunk: 5,
  // Förökning: ju färre andra djur inom radius rutor, desto oftare får ett djur ungar (upp till 1 + boost gånger oftare, inga alls
  // när capacity djur finns i närheten). Ungen föds högst dispersal rutor bort.
  animalBreeding: { radius: 12, capacity: 6, boost: 6, dispersal: 6 },
  animalTreeSpreadChance: 0.005,
  // Verktyg går inte åt (de följer med huset och kommer tillbaka vid rivning), men varje hus som kräver ett behöver ett eget. Antalen räcker till
  // de första banornas byggnader, innan smederna öppnar; hammare går åt som byggkostnad.
  startingResources: { wood: 10, plank: 10, stone: 10, hammer: 15, axe: 12, pickaxe: 12, scythe: 8, shovel: 8, saw: 6, knife: 8 },
  gameSpeeds: [1, 2, 4, 8],
  maxBuildDistance: 35,          // längst avstånd (rutor) från en egen byggnad som man får bygga på
  defaultEquipment: {}, // utrustning som varje produktionshus måste få (kan åsidosättas med requiredEquipment)
  // Boost per byggnad (spelaren slår på det i infopanelen). Varan går åt: 'cycles' omgångar per vara. Gäller alla hus av jobbtypen
  // om byggnaden inte har eget 'boost' (boost: null stänger av). yield = extra utdata (1 = dubbelt), speed = extra fart (1 = dubbelt).
  boosts: {
    gather: { resource: 'potion', cycles: 5, yield: 1 },
    craft: { resource: 'enchanted_wood', cycles: 5, yield: 0.5 },
    garrison: { resource: 'talisman', cycles: 3, speed: 1 },
  },
  wearPerPass: 0.1,              // slitage per bärarpassage
  maxWearSpeedBonus: .25,         // max hastighetsökning på helt upptrampad ruta
  maxPathSearchesPerFrame: 16,
  pathfinding: { nodeLimit: 3000, nodeLimitPerTile: 80, margin: 24, maxCells: 160000, maxCachedPaths: 800 },
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
      build: 'sounds/build.mp3',
      built: 'sounds/built.mp3',
      // demolish: 'sounds/demolish.mp3',
      // error: 'sounds/error.mp3',
      levelComplete: 'sounds/level_complete.mp3',
      // drop: 'sounds/drop.mp3',
      alarm: 'sounds/alarm.mp3',
      // arrow: 'sounds/arrow.mp3',          // pil avfyras
      // swing: 'sounds/swing.mp3',          // närstrid
      // hit: 'sounds/hit.mp3',              // träff
      // died: 'sounds/died.mp3',            // soldat dör
      // destroyed: 'sounds/destroyed.mp3',  // byggnad förstörs
      // chop: 'sounds/chop.mp3',            // träd (skogshuggare)
      // mine: 'sounds/mine.mp3',            // sten och malm
      // pick: 'sounds/pick.mp3',            // bär, örter, svamp, äpplen
      // dig: 'sounds/dig.mp3',              // lera och sand
      // fish: 'sounds/fish.mp3',            // fiskare
      // hunt: 'sounds/hunt.mp3',            // jägare
      // plant: 'sounds/plant.mp3',          // planterare
      // craft: 'sounds/craft.mp3',          // förädlare
      // smelt: 'sounds/smelt.mp3',          // smältverk, gjuteri, kolbrännare
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
    projectileSpeed: 16,       // pilens fart (rutor per sekund); flygtiden hålls mellan min och max
    projectileMinSeconds: 0.2,
    projectileMaxSeconds: 0.5,
    workerRespawnSeconds: 60,  // tid innan en dödad arbetare ersätts
    carrierRespawnSeconds: 20, // tid mellan att dödade bärare ersätts (en i taget per spelare)
  },
  // Fog of war (systems/vision.js). Radier i rutor, tider i sekunder speltid.
  vision: {
    ttl: 45,                   // så länge en ruta syns kvar efter att den sista byggnaden eller enheten lämnat den
    interval: 1,               // hur ofta synfältet räknas om
    fade: 5,                   // de sista sekunderna bleknar dimman in
    building: 12, unit: 8, soldier: 10,  // standardräckvidd (definition.vision åsidosätter)
    image: 'images/fog.jpg',   // bakgrundstextur för dimman (en bild mindre än skärmen läggs som mönster, en större täcker skärmen)
    color: '#0b0d10',          // dimmans färg tills bilden laddats, eller utan bild
  },
  systemOrder: ['ai', 'construction', 'production', 'spells', 'logistics', 'combat', 'units', 'vision'],
};
