/* Spelinställningar och balans */
CityBuilder.Config.settings = {
  chunkSize: 16,
  tileSize: 36,                  // pixlar per ruta vid zoom 1
  walkSpeed: 1,                  // rutor per sekund på gräs
  buildDurationSeconds: 1,
  inputBufferFactor: 4,           // ett hus håller så många omgångar indata (insats per omgång * detta)
  outputBufferCapacity: 20,       // max i utbuffert innan producenten pausar
  flushThreshold: 0,             // överskott över detta skickas till lagret
  carriersPerBuilding: 4,
  animalPerChunk: 5,
  // Förökning: ju färre andra djur inom radius rutor, desto oftare får ett djur ungar (upp till 1 + boost gånger oftare, inga alls
  // när capacity djur finns i närheten). Ungen föds högst dispersal rutor bort.
  animalBreeding: { radius: 12, capacity: 6, boost: 6, dispersal: 6 },
  animalTreeSpreadChance: 0.005,
  // Verktyg går inte åt (de följer med huset och kommer tillbaka vid rivning), men varje hus som kräver ett behöver ett eget. Antalen räcker till
  // de första banornas byggnader, innan smederna öppnar; hammare går åt som byggkostnad.
  startingResources: { wood: 10, plank: 10, stone: 10, hammer: 15, axe: 12, pickaxe: 12, scythe: 8, shovel: 8, saw: 6, knife: 8 },
  gameSpeeds: [1, 2, 4, 8],
  // Simuleringen går i fasta steg om simStep sekunder (samma steg ger samma spel, och 20 steg per sekund kostar mindre än ett steg per bildruta).
  // Rörelsen ritas mellanliggande (interpolerad), så den ser jämn ut. Efter ett för långt dröjsmål körs högst maxStepsPerFrame steg per bildruta
  // (spelet går då långsammare i stället för att hänga sig).
  simStep: 0.05,
  maxStepsPerFrame: 8,
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
    baseCarriers: 30,
    // Ett hus beställer nya insatser först när lagret (med det som är på väg) sjunkit till 'refillBelow' av kapaciteten, och fyller sedan på till full
    // kapacitet. Det ger färre och jämnare beställningar, och en buffert som tål att leveranserna dröjer en stund (så att inga extrabärare behövs).
    refillBelow: 0.5,
    // Högar (t.ex. efter en tornado) töms med högst så stor andel av bärarna så länge annat arbete väntar eller nyss väntade ('recent' s)
    pileShare: 0.5, pileRecent: 10,
    lowStock: 20
  },
  efficiency: { windowSeconds: 60, minSeconds: 5, minAge: 45, warnBelow: .6, badBelow: .3 },
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
      click: 'sounds/click.mp3',
      build: 'sounds/build.mp3',            // loopas vid varje byggarbetsplats tills byggnaden är färdig (build: { file: 'sounds/build.mp3', loop: false } ger ett enstaka ljud vid placeringen)
      built: 'sounds/built.mp3',
      demolish: 'sounds/demolish.mp3',
      error: 'sounds/error.mp3',
      levelComplete: 'sounds/level_complete.mp3',
      drop: 'sounds/drop.mp3',
      alarm: 'sounds/alarm.mp3',
      arrow: 'sounds/arrow.mp3',          // pil avfyras
      swing: 'sounds/swing.mp3',          // närstrid
      hit: ['sounds/hit/hit1.mp3','sounds/hit/hit2.mp3','sounds/hit/hit3.mp3','sounds/hit/hit4.mp3'],              // träff (flera filer: en lista, ['sounds/hit1.mp3', 'sounds/hit2.mp3'], så slumpas en varje gång)
      died: ['sounds/died/died1.mp3','sounds/died/died2.mp3','sounds/died/died3.mp3'],            // soldat dör
      destroyed: 'sounds/destroyed.mp3',  // byggnad förstörs
    },
    // Byggnadernas arbete. Varje byggnad kan ha tre valfria ljud: start (arbetet börjar), loop (loopas medan det pågår) och done (arbetet är klart).
    // Det som inte anges är tyst. Ett ljud är en fil, en lista (en slumpas varje gång) eller { file, volume }. Exempel:
    //   glassworks: { start: 'sounds/glass_start.mp3', loop: 'sounds/glass_loop.mp3', done: ['sounds/glass_done1.mp3', 'sounds/glass_done2.mp3'] },
    // Byggnader: woodcutter planter apple_gatherer berry_gatherer herb_gatherer mushroom_gatherer hunters_cottage fishing_hut well sand_collector clay_pit
    // limestone_quarry quarry rock_crusher iron_mine copper_mine tin_mine coal_mine gold_mine silver_mine gemstone_mine salt_mine sulfur_mine crystal_gatherer
    // moonstone_gatherer relic_hunter fallen_star_collector sawmill farm stables mill bakery brickworks iron_smelter copper_smelter tin_smelter silver_smelter
    // gold_smelter bronze_foundry charcoal_burner kitchen glassworks steelworks toolsmith swordsmith bowyer leatherworker armorsmith mint alchemist enchanter shrine
    buildings: {
      woodcutter: { start: 'sounds/chop.mp3' },
      limestone_quarry: { start: 'sounds/mine.mp3' },
      quarry: { start: 'sounds/mine.mp3' },
      rock_crusher: { done: 'sounds/rock-crusher-done.mp3' },
      iron_mine: { start: 'sounds/mine.mp3' },
      copper_mine: { start: 'sounds/mine.mp3' },
      tin_mine: { start: 'sounds/mine.mp3' },
      coal_mine: { start: 'sounds/mine.mp3' },
      gold_mine: { start: 'sounds/mine.mp3' },
      silver_mine: { start: 'sounds/mine.mp3' },
      gemstone_mine: { start: 'sounds/mine.mp3' },
      salt_mine: { start: 'sounds/mine.mp3' },
      sulfur_mine: { start: 'sounds/mine.mp3' },
      crystal_gatherer: { start: 'sounds/mine.mp3' },
      relic_hunter: { done: 'sounds/relic-hunter_done.mp3' },
      apple_gatherer: { start: 'sounds/pick.mp3' },
      berry_gatherer: { start: 'sounds/pick.mp3' },
      herb_gatherer: { start: 'sounds/pick.mp3' },
      mushroom_gatherer: { start: 'sounds/pick.mp3' },
      moonstone_gatherer: { start: 'sounds/mine.mp3' },
      fallen_star_collector: { start: 'sounds/mine.mp3' },
      sand_collector: { start: 'sounds/dig.mp3' },
      clay_pit: { start: 'sounds/dig.mp3' },
      fishing_hut: { start: 'sounds/fish_start.mp3', done: 'sounds/fish_done.mp3' },
      well: { start: 'sounds/well_done.mp3' },
      hunters_cottage: { start: 'sounds/hunt.mp3' },
      planter: { start: 'sounds/plant.mp3' },
      sawmill: { loop: 'sounds/craft_sawmill.mp3' },
      kitchen: { start: 'sounds/craft_kitchen.mp3' },
    },
    music: ["music/song1.mp3", "music/song2.mp3", "music/song3.mp3"],
    // Väderljud och ljudlandskap (systems/sound.js). Alla filer är valfria: saknas en fil är det tyst. Ta bort // för att slå på en rad.
    battleMusic: ["music/battle1.mp3"],
    weather: {
      fade: 2,                                          // sekunder in- och utljusning för alla loopar
      start: {                                          // spelas en gång när vädret börjar
        // clear: 'sounds/weather/clear_start.mp3',
        // rain: 'sounds/weather/rain_start.mp3',
        // storm: 'sounds/weather/storm_start.mp3',
        // fog: 'sounds/weather/fog_start.mp3',
        // tornado: 'sounds/weather/tornado_start.mp3',
        // volcano: 'sounds/weather/volcano_start.mp3',   // vid utbrottet
        thunder: 'sounds/weather/thunder_start.mp3',         // vid varje blixt
      },
      loops: {                                          // loopas så länge vädret varar (tornado och volcano bara där de finns, och hörs på skärmen)
        rain: 'sounds/weather/rain_loop.mp3',
        storm: 'sounds/weather/warning_bell.mp3',
        // fog: 'sounds/weather/fog_loop.mp3',
        tornado: "sounds/weather/warning_bell.mp3",
        volcano: 'sounds/weather/warning_bell.mp3',
      },
      day: 'sounds/day.mp3',                 // loopas dagtid
      night: 'sounds/night.mp3',             // loopas nattetid
    },
  },
  playerColors: { 1: '#4aa3ff', 2: '#e5534b', 3: '#e0a030', 4: '#a56bd6', '-1': '#9b59d0' }, // lagfärg per spelare (ring runt soldater, ram runt byggnader), se core/players.js
  military: {
    searchRadius: 20,          // standardräckvidd (rutor) för att upptäcka fiender (försvarsläge)
    flagRadius: 10,            // soldater vid flaggan (attackläge) slåss mot fiender så här långt från den, och på vägen dit
    flagStep: 10,              // datorn flyttar sin flagga högst så här många rutor åt gången
    flagSeconds: 2,            // och högst så här ofta (sekunder speltid)
    flagAlertSeconds: 30,      // tid mellan ljuden när spelaren ser en fiendes flagga
    buildingHp: 100,           // livspoäng för en byggnad som saknar eget maxHp
    leashFactor: 1.25,         // en soldat jagar inte längre bort än searchRadius * detta från sin byggnad eller post
    scanIntervalSeconds: 0.5,  // hur ofta byggnader och soldater letar efter fiender
    repathSeconds: 0.5,        // minsta tid mellan omräkningar av vägen mot ett rörligt mål
    retrySeconds: 2,           // väntetid innan en soldat försöker igen efter att något inte gick att nå
    projectileSpeed: 16,       // pilens fart (rutor per sekund); flygtiden hålls mellan min och max
    projectileMinSeconds: 0.2,
    projectileMaxSeconds: 0.5,
    workerRespawnSeconds: 60,  // tid innan en dödad arbetare ersätts
    carrierRespawnSeconds: 5,  // tid mellan att dödade bärare ersätts (en i taget per spelare). Kort nog att basen inte står utan bärare, men så lång att soldaterna inte fastnar i att jaga dem
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
  // Väder och dygn (systems/weather.js). Vädret byter slumpvis var minSeconds-maxSeconds; chances = vikter för nästa väder.
  // growth: vad som växer ur marken (terräng -> vara). Skanningen sker var scanSeconds i de chunkar spelaren ser.
  weather: {
    nightDarkness: 0.35,                   // hur mörk natten blir som mest (0-1)
    nightLight: { building: 2.5, unit: 1, fade: 1 },   // ljust som på dagen på så många rutor runt spelarens byggnader och människor (djur lyser inte), sedan mjuk övergång på 'fade' rutor
    dayLength: 480, startFraction: 0.12,   // ett dygn i speltid, och var i dygnet ett nytt spel börjar (0 = gryning)
    minSeconds: 30, maxSeconds: 180,
    chances: { clear: 52, rain: 18, storm: 10, fog: 14, tornado: 4, volcano: 2 },   // volcano: ingen väderruta utan en händelse; vädret blir klart medan lavan rinner
    growth: { tree: 'wood', apple_tree: 'apples', berry_bush: 'berries', herbs: 'herbs', mushrooms: 'mushrooms' },
    scanSeconds: 2,
    scanSpreadSeconds: 1,                  // en skanning delas på så lång speltid (några chunkar per steg), så att kostnaden blir jämn
    rain: { chance: 0.08, cap: 2 },        // chans per skanning att en växt får +1 mängd, högst cap gånger terrängens normala mängd
    flood: {                               // stormen: översvämning (se systems/weather.js)
      reach: 3,                            // så många rutor från vattnet når den som mest
      riseSeconds: 6,                      // tid per ring när vattnet stiger
      fallSeconds: 4,                      // och när det sjunker undan
      washUp: 0.04,                        // chans per ruta som sjunker undan att vattnet lämnat en resurs
      amount: 0.5,                         // fyndets mängd som andel av terrängens normala
      finds: { salt_ore: 4, silver_ore: 3, gold_ore: 2, gemstone: 1, crystal: 1 },   // vilka fynd, och hur ofta (bara sådant spelaren låst upp en byggnad för)
    },
    fog: {
      vision: 0.55,                        // andel av synfältet som finns kvar
      hearing: {                           // hörseln i dimma (systems/sound.js): mjuk övergång in och ut ur dimman
        reach: 0.5,                        // andel av hörbart avstånd från skärmens mitt som finns kvar
        muffle: 3000,                      // Hz: alla ljudeffekter dämpas till så här hög diskant
        center: 0.25,                      // andel av dämpning och eko som redan finns mitt på skärmen i dimma (resten växer med avståndet)
        farMuffle: 500,                    // Hz: diskanten ljud längst bort (skärmens hörn) dämpas till, mindre och mindre ju närmare mitten
        echo: {                            // eko (efterklang) som gör avlägsna ljud mystiska: ju längre från mitten, desto mer eko och mindre direktljud
          seconds: 3,                      // efterklangens längd (mörk: diskanten klingar av först)
          predelay: 0.06,                  // s innan ekot hörs: ger känsla av avstånd
          clear: 0.15,                     // andel eko längst bort i klart väder (0 = inget)
          fog: 0.7,                        // och i dimma
        },
      },
    },
    tornado: {
      every: [15, 25],                     // sekunder mellan nya tornados medan vädret varar
      radius: [2, 2],                      // rutor runt mitten som den river i
      life: [15, 20], longChance: 0.2, longLife: 30,   // hur länge den virvlar runt (ibland längre)
      speed: [0.35, 0.65],                 // rutor per sekund (en per ca 2 s), slumpad för varje tornado
      turn: 0.8,                           // hur mycket färdriktningen slingrar (radianer per sekund, slumpmässigt)
      tickSeconds: 1, takes: 1,            // var sekund minskar varje växtruta inom radien med 'takes'; är den tom blir rutan gräs
      also: {                              // mer än växter: sand, vatten och träsk tas också (gives = det som virvlar med och sedan landar igen), med egen fart per tick
        sand: { gives: 'sand', takes: 4 },
        water: { gives: 'water', takes: 80 },
        bog: { gives: 'bog', takes: 2 },
      },
      keep: 100,                           // av sand, vatten och träsk sparas högst så mycket per tornado, resten försvinner
      shoreOnly: ['sand'],                 // sand landar bara på lediga rutor som rör vatten (annars blockeras brunnar och fiskare av breda stränder); finns ingen sådan ruta försvinner sanden
      land: { water: 50, sand: 25, bog: 10 },       // hur mycket varje ny ruta vatten/sand rymmer när tornadon släpper det (vatten först, på lediga rutor inom 2 rutor)
      piles: [1, 4],                       // hur många högar den släpper i slutet
    },
    // Vulkaner (en sällsynt händelse, se chances). 'link' bygger en 1-3 rutor bred lavaled över vatten mellan två landmassor som stelnar till gräs
    // (en ny bro); 'peak' sprider lava över land vid berg som stelnar till malm. Lavan bryter ner byggnader på sina rutor och skadar grannbyggnader.
    volcano: {
      kinds: { link: 1, peak: 1 },         // relativ chans för varje sort
      minHq: 28,                           // ingen lavaruta kan någonsin ligga närmare än så (i rutor) någon spelares huvudlager
      near: [18, 55],                      // avstånd från en av spelarens byggnader där den bryter ut
      paceSeconds: [2, 4],                 // sekunder per ny lavaruta (slumpad för varje vulkan)
      lifeSeconds: [60, 90],               // hur länge lavan ligger het efter att den spridit sig klart, sedan stelnar den
      width: [1, 3],                       // lavaledens bredd (link)
      crossing: 10,                        // längsta sträcka över vatten (rutor) som kan bli en led (link)
      diameter: [3, 5],                    // lavaklumpens bredd i rutor, mätt över (peak)
      heat: 15,                            // skada per sekund på byggnader intill het lava
      ores: { coal: 1, iron_ore: 1, limestone: 1, copper_ore: 2, tin_ore: 2, salt_ore: 2, silver_ore: 4, sulfur: 4, crystal: 5, gold_ore: 6, gemstone: 6 },   // malmsorter lavan kan ge och deras vikt: ovanligare väger tyngre (bara sorter du låst upp)
      oreAmount: 1,                        // andel av malmrutans normala mängd
    },
  },
  // Monster (systems/monsters.js). På banor med monster (Levels.current.monsters) får varje chunk monster med en chans som växer med banan.
  monsters: {
    chance: 0.18,                          // chans per chunk att få monster på första banan med monster
    perStrength: 0.006,                    // och så mycket mer per bana därefter
    maxChance: 0.4,
    packChance: 0.25,                      // chans att ett monster har sällskap av ett till (annan plats, annan art) i samma chunk
    safeRadius: 40,                        // inga monster närmare än så (i rutor) någon spelares huvudlager
    carrierRange: 5,                       // monster anfaller bärare som kommer så nära (arbetare anfaller de aldrig)
    wanderSeconds: [4, 12],                // paus mellan två promenader inom området
    growlSeconds: [10, 30],                // hur ofta ett monster låter när spelaren ser det
    raid: {
      firstSeconds: 900,                   // banan med raiden: så lång banatid tar det innan monsterhorden dyker upp
      window: [900, 2700],                 // senare banor: raiden (om det blir någon) kommer någon gång i det här tidsintervallet
      chance: 0.12,                        // chans per bana (efter den första) att det blir en raid
      warnSeconds: 45,                     // varningen kommer så här länge innan hordens ankomst
      distance: [55, 75],                  // hur långt från huvudlagret hordens startplats ligger
      size: 2,                             // antal raiders första gången, och ett till per perStrength banor
      perStrength: 6,
      maxSize: 6,
      sweepRadius: 24,                     // väl framme letar raiders efter byggnader och fiender så här långt från huvudlagret
    },
  },
  systemOrder: ['ai', 'construction', 'production', 'spells', 'logistics', 'monsters', 'combat', 'units', 'weather', 'vision'],
};
