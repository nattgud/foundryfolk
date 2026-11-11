/* Datorspelare (se systems/ai.js). Datorn bygger med samma regler och kostnader som spelaren och läser samma signaler:
   byggnadernas status ("Missing: Iron Ore", "Central storage full", "No resources") och lagrens fyllnad.

   Så här tänker datorn vid varje beslut (tiden mellan besluten styrs av pace):
     1. Underhåll: pausar det som producerar mer än den behöver (lagret fullt) och river samlare som tömt sitt område.
     2. Lager: börjar lagret bli fullt byggs ett nytt (det ger också fler bärare).
     3. Flaskhals: står byggnader och väntar på en vara byggs en producent av den varan (och av det producenten själv saknar).
     4. Plan: stegen i 'plan' nedan, i ordning. Första målet som inte nått sitt antal avgör vad som byggs härnäst.
        Saknas resurser eller förkunskaper byggs de först automatiskt, så listan behöver bara nämna det datorn faktiskt vill ha.
     5. Tillväxt: när planen är klar fortsätter den växa enligt 'grow' tills 'size' är nådd, i takt med bana och tid.

   pace: tid mellan besluten = startSeconds * perLevel^(bana - 1), men minst minSeconds (människans tempo ligger runt 5-10 s).
   maxUnderConstruction: [start, bana per extra, tak]: så många byggnader får vara under uppbyggnad samtidigt.
   stuckSeconds: en byggplats som inte kommit framåt på så här lång tid rivs (varorna ges tillbaka) så att något annat kan byggas.
   resourceRadius: hur långt från basen den söker malm, träd m.m. (rutor).
   blockedSeconds: väntetid innan en byggnad som inte gick att placera provas igen.
   explore: när datorn inte vet var motståndaren finns bygger den utkikstorn i en ring runt sig (på rivalDistance): step = avstånd mellan tornen
            (rutor, under maxBuildDistance), maxScouts = högsta antal utkikstorn.
   lookouts: utkikstorn för att hitta råvaror som dimman döljer. sightRetrySeconds: väntan innan en sådan byggnad provas igen.
   patienceSeconds: har datorn väntat så länge på en resurs som den redan har producenter för byggs ytterligare en (högst maxPerType av varje typ).
   pain: flaskhalsar. threshold = så många byggnader (i heltidsekvivalenter) måste sakna varan, cooldown = väntetid innan samma vara åtgärdas igen.
   storage: high = lagret anses fullt (andel av taket) och producenten pausas, resume = produktionen startar igen under den andelen,
            build = andel av taket då ett nytt lager byggs. limits = högsta lager per vara (equipment = verktyg, gear = soldaternas utrustning).
   warehouses: ett nytt lager byggs bredvid en producent som ligger längre än 'far' rutor från närmaste lager (högst ett per 'perBuildings' byggnader). food: ordningen på maten.
   chain: producenter som aldrig byggs fler av än chainShare av vad de byggnader som förbrukar deras vara skulle gå åt vid full gång. jammed: andel lediga bärare under vilken datorn slutar bygga producenter (bärarna hinner redan inte med). scale: högsta antal av varje byggnadstyp.
   size: högsta antal byggnader = min(cap, start + perLevel * bana + perMinute * speltid i minuter). warehouses.base + byggnader / perBuildings = högsta antal lager. grow: [byggnad, vikt]: tillväxten väljer den typ som har minst antal per vikt;
         krigsbyggnader (tredje värdet 'war') räknas upp med banan (bana / warLevel, mellan warMin och warMax) och byggs först när de som finns är fulla. */
CityBuilder.Config.ai = {
  pace: { startSeconds: 20, perLevel: 0.97, minSeconds: 1 },  // sekunder mellan besluten: långsamt på bana 1, lite snabbare för varje bana, aldrig snabbare än minSeconds
  maxUnderConstruction: [2, 15, 6],   // samtidiga bygge: 2 till att börja med, +1 var 15:e bana, högst 6
  stuckSeconds: 420,
  resourceRadius: 40,
  blockedSeconds: 60,
  patienceSeconds: 30,
  maxPerType: 14,
  explore: { step: 33, maxScouts: 36 },
  lookouts: 8,                        // högst så många utkikstorn bygger datorn för att hitta råvaror den inte ser (fog of war gäller den som spelaren)
  sightRetrySeconds: 10,              // väntetid innan en byggnad vars råvara inte syns provas igen (när utkikstornet står klart)
  attack: { fromLevel: 40, soldiers: [6, 2, 40], maxTowers: 12, afterSeconds: 1800, bigForce: 8 },   // datorn anfaller från bana fromLevel, när den har [start, +per bana, tak] soldater, tidigast afterSeconds in i spelet och bara om den sett något av motståndaren
  pain: { threshold: 0.8, cooldown: 75, stock: 8 },   // stock: finns så här mycket av varan i lagret byggs ingen ny producent (det är bärarna som inte hinner)
  storage: { high: 0.85, resume: 0.6, build: 0.75, watch: ['wood', 'plank', 'stone', 'brick', 'clay', 'grain', 'iron_ore', 'iron', 'charcoal', 'leather', 'meat', 'fish', 'bread', 'flour'] },   // watch: varor vars fyllnad avgör om ett nytt lager behövs
  limits: { equipment: 4, gear: 14, charcoal: 30, tar: 10, ash: 10, bone: 10, blood: 10, straw: 40, seeds: 20, plank: [60, 1.5], stone: [60, 1.5], brick: [30, 1], wood: [80, 1], grain: [40, .5], leather: [30, .3], water: [40, .5], clay: [30, .5], iron_ore: [20, .3], iron: [20, .3], bread: [40, .8], meat: [30, .5], fish: [30, .5], meal: [30, .5] },   // tak per vara: tal, eller [grund, per byggnad]
  warehouses: { base: 2, far: 9, perBuildings: 5, cooldown: 45, crowd: 9 },   // nytt lager när en producent ligger längre än far (rutor) från närmaste, högst ett per perBuildings byggnader. Nya byggnader hamnar vid det lager som har färst byggnader inom crowd rutor
  food: [['meat', 2], ['bread', 8], ['fish', 4], ['meal', 4]],   // vilken mat som byggs när den saknas: [vara, högsta antal producenter innan nästa sort tas]. Brödet är billigast att bygga ut (jordbruk, kvarn, bageri, brunn)
  jammed: 0.04,                       // är färre än så här av bärarna lediga (de hinner inte med) byggs inga fler producenter, bara lager och krigsbyggnader
  chain: ['charcoal_burner', 'iron_smelter', 'iron_mine', 'coal_mine', 'swordsmith', 'bowyer', 'armorsmith', 'steelworks', 'leatherworker', 'toolsmith'],   // led i kedjor: aldrig fler än chainShare * det som förbrukar deras vara
  chainShare: 0.6,                    // andel av förbrukarnas fulla behov (per minut) som en kedjeproducents antal räknas upp till
  scale: {                            // högsta antal av en byggnadstyp = [grund, byggnader per extra]: grund + antal byggnader / per. Saknas typen gäller maxPerType
    woodcutter: [3, 6], sawmill: [1, 14], quarry: [2, 9], hunters_cottage: [1, 12], fishing_hut: [1, 20], farm: [1, 10], well: [1, 10],
    clay_pit: [1, 14], brickworks: [1, 14], mill: [1, 16], bakery: [1, 12], kitchen: [1, 30], iron_mine: [1, 14], coal_mine: [1, 30],
    charcoal_burner: [1, 14], iron_smelter: [1, 14], toolsmith: [1, 40], leatherworker: [1, 18], swordsmith: [1, 20], bowyer: [1, 40],
    steelworks: [1, 30], armorsmith: [1, 40], stables: [1, 40], berry_gatherer: [1, 20], herb_gatherer: [1, 40], mushroom_gatherer: [1, 40], apple_gatherer: [1, 40],
  },
  size: { start: 36, perLevel: 1.2, perMinute: 0.4, cap: 180 },   // högsta antal byggnader = start + perLevel * bana + perMinute * minuter, högst cap
  grow: [
    ['woodcutter', 3], ['sawmill', 1.5], ['quarry', 2.5], ['hunters_cottage', 2], ['fishing_hut', 1], ['farm', 1.5], ['well', 1],
    ['clay_pit', 1], ['brickworks', 1.5], ['mill', 0.7], ['bakery', 0.7], ['kitchen', 0.5], ['iron_mine', 1], ['coal_mine', 0.5], ['charcoal_burner', 0.7],
    ['iron_smelter', 0.7], ['toolsmith', 0.3], ['leatherworker', 0.6], ['swordsmith', 0.6], ['bowyer', 0.4], ['steelworks', 0.4], ['armorsmith', 0.3],
    ['warehouse', 1.5], ['large_warehouse', 0.7], ['guard_tower', 1.2, 'war'], ['garrison', 0.7, 'war'],
  ],
  warLevel: 40, warMin: 0.25, warMax: 2.5,
  // Soldater. Datorn väljer själv vad garnisonerna tränar (systems/ai.js, chooseTraining), bland de typer den har utrustning för i lagret.
  //   from     lägsta datornivå (Config.ai-nivån, se AI.level) för att träna typen.   weight   grundvikt (hur ofta typen väljs när inget annat styr).
  //   counters vad som kontrar vad: motståndarens typ -> { egen typ: hur bra den kontrar, 0-1 }. Bygger på dueller med lika råkostnad.
  //   learn    datorn lär sig hur spelaren spelar: var sampleSeconds:e sekund (minst minSoldiers soldater) sparas spelarens arméblandning som ett glidande
  //            medelvärde i webbläsaren (localStorage, key), alltså för alla lägen och banor. Säkerheten växer med antalet prov (fullt vid fullSamples).
  //            Datorns vikt för en typ = grundvikten * (1 + styrka * säkerhet * boost * hur väl typen kontrar det spelaren brukar ha).
  //   adapt    styrkan 0-1 = (datornivå - from) / span. I storyn gäller storyFactor tills datornivån nått hardFrom (de sista kapitlen är lika skarpa som annars).
  army: {
    from: { clubman: 1, footman: 8, swordsman: 14, archer: 14, blademaster: 32, knight: 34 },
    weight: { clubman: 1, footman: 0.8, swordsman: 2.2, archer: 1.6, blademaster: 2, knight: 1.6 },
    counters: {
      clubman: { archer: 1, blademaster: 0.4, swordsman: 0.2 },
      footman: { archer: 1, blademaster: 0.6, clubman: 0.6 },
      swordsman: { blademaster: 1, archer: 0.8, knight: 0.4 },
      blademaster: { archer: 1 },
      archer: { knight: 1, swordsman: 1, blademaster: 0.4 },
      knight: { blademaster: 1, swordsman: 0.5, clubman: 0.5 },
    },
    clubmanShare: 0.25,   // clubmannens vikt när datorn har utrustning till andra soldater (den är billigast och bara en reserv)
    learn: { key: 'foundryfolk.aiProfile', sampleSeconds: 25, minSoldiers: 4, fullSamples: 24, boost: 3 },
    adapt: { from: 10, span: 60, storyFactor: 0.65, hardFrom: 50 },
  },
  plan: [
    { from: 1, goals: [['woodcutter', 2], ['sawmill', 1], ['quarry', 1], ['hunters_cottage', 1], ['warehouse', 1], ['woodcutter', 3], ['quarry', 2], ['sawmill', 2]] },
    { from: 1, goals: [['well', 1], ['farm', 1], ['clay_pit', 1], ['brickworks', 1], ['hunters_cottage', 2], ['fishing_hut', 1], ['guard_tower', 1], ['woodcutter', 4], ['warehouse', 2]] },
    { from: 5, goals: [['mill', 1], ['bakery', 1], ['iron_mine', 1], ['charcoal_burner', 1], ['iron_smelter', 1], ['toolsmith', 1], ['leatherworker', 1], ['swordsmith', 1], ['guard_tower', 2], ['kitchen', 1], ['well', 2]] },
    { from: 12, goals: [['garrison', 1], ['sawmill', 3], ['quarry', 3], ['woodcutter', 6], ['farm', 2], ['brickworks', 2], ['large_warehouse', 1], ['bowyer', 1], ['guard_tower', 3]] },
    { from: 30, goals: [['coal_mine', 1], ['steelworks', 1], ['armorsmith', 1], ['garrison', 2], ['iron_mine', 2], ['iron_smelter', 2], ['stables', 1], ['large_warehouse', 2], ['guard_tower', 4]] },
  ],
};
