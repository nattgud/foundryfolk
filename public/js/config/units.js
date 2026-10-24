/* Enhetstyper.
   isHauler: tar logistikuppdrag. wearsPaths: trampar upp stigar. speedMultiplier: gånghastighet.
   fallbackShape/fallbackSize/color = reservgrafik, imageSize = bildstorlek i pixlar.
   player: vem enheten tillhör (se core/players.js). Utelämnat = den som äger byggnaden som skapar den, annars spelaren.
   maxHp: livspoäng. Enheter utan maxHp går inte att skada.

   Soldater (isSoldier) har dessutom:
   attackDamage, attackRange (rutor), attackCooldown (sekunder mellan slag), armor (dras från skadan, minst 1 går alltid igenom),
   searchRadius (hur långt från sin post eller byggnad en soldat upptäcker fiender),
   training: { inputs, seconds } = vad en ny soldat kostar och hur lång tid träningen tar i en garnisonsbyggnad. */

  // SPRITE SHEETS (frame: 64 on a unit = sheet; without frame the whole image is drawn as one picture)
  // Cells are frame x frame px. Rows = state/direction, columns = animation frames.
  //   Row 0  idle
  //   Row 1  up            Row 5  up/right
  //   Row 2  right         Row 6  down/right
  //   Row 3  down          Row 7  down/left
  //   Row 4  left          Row 8  up/left
  // The number of rows in the sheet decides what is used:
  //   9+ rows  8 directions     5-8 rows  4 directions (diagonals fall back to left/right)
  //   2-4 rows  row 1 for all walking (mirrored when going left)     1 row  row 0 for everything (mirrored when going left)
  // Columns: 1 = no animation, more = animated automatically (idle row too). Time-based: animFps frames/second (default 8)
  // Carry images (imageCarrying, imagesByBuilding) must use the same frame size and layout.
  // If the art faces left by default: imageFacesLeft: true. Custom row order: rows: { idle: 0, up: 1, ... }
const ANIMAL_DEFAULTS = {
  isAnimal: true,
  player: CityBuilder.Players.NEUTRAL,
  isHauler: false,
  wearsPaths: false,
  speedMultiplier: 0.3,
  fallbackShape: 'circle',
  fallbackSize: 6,
};

CityBuilder.Config.units = {
  carrier: {
    isHauler: true,
    wearsPaths: true,
    maxHp: 8,
    speedMultiplier: 0.5,
    color: '#4fd1e8', 
    fallbackShape: 'square', 
    fallbackSize: 8, 
    imageSize: 16,
    frame: 64,   // rutstorlek i arket (px). Utan frame ritas hela bilden som en enda bild, som förut
    animFps: 8,  // valfritt: animationsbilder per sekund (standard 8)
    image: 'images/units/carrier.png',
    imageCarrying: 'images/units/carrier_loaded.png',
  },
  // Djur: samma beteende (äter, sprider växter, förökar sig, kan jagas), olika utseende. spawnWeight = hur vanlig arten är.
  deer: {
    ...ANIMAL_DEFAULTS, color: '#760', imageSize: 16, spawnWeight: 4,
    image: 'images/units/deer.png',
  },
  moose: {
    ...ANIMAL_DEFAULTS, color: '#432', imageSize: 20, spawnWeight: 2,
    image: 'images/units/moose.png', imageFacesLeft: true,
  },
  fox: {
    ...ANIMAL_DEFAULTS, color: '#c60', fallbackSize: 5, imageSize: 12, spawnWeight: 2,
    image: 'images/units/fox.png', imageFacesLeft: true,
  },
  rabbit: {
    ...ANIMAL_DEFAULTS, color: '#998', fallbackSize: 4, imageSize: 9, spawnWeight: 3,
    image: 'images/units/rabbit.png', imageFacesLeft: true,
  },
  swordsman: {
    isSoldier: true,
    maxHp: 30,
    armor: 1,
    attackDamage: 5,
    attackRange: 1,
    attackCooldown: 1,
    searchRadius: 20,
    training: { inputs: { sword: 1, leather_armor: 1 }, seconds: 20 },
    speedMultiplier: 1,
    color: '#cfd6dd',
    fallbackShape: 'circle',
    fallbackSize: 6,
    imageSize: 16,
  },
  archer: {
    isSoldier: true,
    maxHp: 18,
    armor: 0,
    attackDamage: 4,
    attackRange: 5,
    attackCooldown: 1.2,
    searchRadius: 20,
    training: { inputs: { bow: 1, leather_armor: 1 }, seconds: 15 },
    speedMultiplier: 1,
    color: '#8fbf6a',
    fallbackShape: 'circle',
    fallbackSize: 6,
    imageSize: 16,
  },
  knight: {
    isSoldier: true,
    maxHp: 50,
    armor: 3,
    attackDamage: 8,
    attackRange: 1,
    attackCooldown: 1,
    searchRadius: 20,
    training: { inputs: { sword: 1, iron_armor: 1, horse: 1 }, seconds: 30 },
    speedMultiplier: 1.6,   // till häst
    color: '#e0b44a',
    fallbackShape: 'circle',
    fallbackSize: 7,
    imageSize: 16,
  },
  worker:  {
    maxHp: 10,
    speedMultiplier: 1,
    color: '#ffffff',
    fallbackShape: 'circle',
    fallbackSize: 5,
    imageSize: 16,
    imagesByBuilding: {
      woodcutter:  { image: 'images/units/worker_lumberjack.png', imageCarrying: 'images/units/worker_lumberjack_carry.png' },
      sawmill:     { image: 'images/units/worker_grey.png', imageCarrying: 'images/units/worker_grey_carry.png' },

      farm:        { image: 'images/units/worker_farmer.png', imageCarrying: 'images/units/worker_farmer_carry.png' },
      hunters_cottage:  { image: 'images/units/hunter.png', imageCarrying: 'images/units/hunter_carry.png' },
      apple_gatherer:   { image: 'images/units/worker_picker.png', imageCarrying: 'images/units/worker_picker_carry.png' },
      berry_gatherer:   { image: 'images/units/worker_picker.png', imageCarrying: 'images/units/worker_picker_carry.png' },
      herb_gatherer:    { image: 'images/units/worker_picker.png', imageCarrying: 'images/units/worker_picker_carry.png' },
      mushroom_gatherer:{ image: 'images/units/worker_picker.png', imageCarrying: 'images/units/worker_picker_carry.png' },

      well:         { image: 'images/units/worker_blue.png', imageCarrying: 'images/units/worker_blue_carry.png' },
      sand_collector:   { image: 'images/units/worker_digger.png', imageCarrying: 'images/units/worker_digger_carry.png' },
      clay_pit:     { image: 'images/units/worker_grey.png', imageCarrying: 'images/units/worker_grey_carry.png' },

      limestone_quarry: { image: 'images/units/worker_digger.png', imageCarrying: 'images/units/worker_digger_carry.png' },
      quarry: { image: 'images/units/worker_digger.png', imageCarrying: 'images/units/worker_digger_carry.png' },

      iron_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      copper_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      tin_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      coal_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      gold_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      silver_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      salt_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      sulfur_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      gemstone_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },

      mill: { image: 'images/units/worker_baker.png', imageCarrying: 'images/units/worker_baker_carry.png' },
      bakery: { image: 'images/units/worker_baker.png', imageCarrying: 'images/units/worker_baker_carry.png' },
      brickworks: { image: 'images/units/worker_red.png', imageCarrying: 'images/units/worker_red_carry.png' },

      iron_smelter: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },
      copper_smelter: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },
      tin_smelter: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },
      bronze_foundry: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },

      planter: { image: 'images/units/worker_picker.png', imageCarrying: 'images/units/worker_picker_carry.png' },
      silver_smelter: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },
      gold_smelter: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },
      mint: { image: 'images/units/worker_blacksmith.png', imageCarrying: 'images/units/worker_blacksmith_carry.png' },
      market: { image: 'images/units/worker_grey.png', imageCarrying: 'images/units/worker_grey_carry.png' },
      alchemist: { image: 'images/units/worker_mystic.png', imageCarrying: 'images/units/worker_mystic_carry.png' },
      enchanter: { image: 'images/units/worker_mystic.png', imageCarrying: 'images/units/worker_mystic_carry.png' },
      shrine: { image: 'images/units/worker_mystic.png', imageCarrying: 'images/units/worker_mystic_carry.png' },

      charcoal_burner: { image: 'images/units/worker_digger.png', imageCarrying: 'images/units/worker_digger_carry.png' },

      hammersmith: { image: 'images/units/worker_blacksmith.png', imageCarrying: 'images/units/worker_blacksmith_carry.png' },
      picksmith: { image: 'images/units/worker_blacksmith.png', imageCarrying: 'images/units/worker_blacksmith_carry.png' },
      axesmith: { image: 'images/units/worker_blacksmith.png', imageCarrying: 'images/units/worker_blacksmith_carry.png' },
      scythesmith: { image: 'images/units/worker_blacksmith.png', imageCarrying: 'images/units/worker_blacksmith_carry.png' },
      
      crystal_gatherer: { image: 'images/units/worker_collector.png', imageCarrying: 'images/units/worker_collector_carry.png' },
      moonstone_gatherer: { image: 'images/units/worker_mystic.png', imageCarrying: 'images/units/worker_mystic_carry.png' },
      relic_hunter: { image: 'images/units/worker_adventurer.png', imageCarrying: 'images/units/worker_adventurer_carry.png' },
      fallen_star_collector: { image: 'images/units/worker_mystic.png', imageCarrying: 'images/units/worker_mystic_carry.png' },
    },
  },
};
