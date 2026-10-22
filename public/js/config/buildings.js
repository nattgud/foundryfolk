CityBuilder.Config.buildings = {
// Lagring
  hq: {
    name: 'Base',
    category: 'storage',
    symbol: 'B',
    color: '#c9a227',
    buildCost: {},
    hiddenInMenu: true,
    isStorage: true,
    vision: 18,
    maxHp: 400,
    buildDuration: 5
  },

  warehouse: {
    name: 'Warehouse',
    category: 'storage',
    symbol: 'W',
    color: '#a88a2a',
    buildCost: { wood: 3, plank: 1 },
    isStorage: true,
    capacity: 60, 
    buildDuration: 10
  },
 
  large_warehouse: {
    name: 'Large Warehouse',
    category: 'storage',
    symbol: 'LW',
    color: '#b89a35',
    buildCost: { plank: 8, stone: 6, brick: 4 },
    isStorage: true,
    capacity: 200,
    buildDuration: 20
  },
 
  great_depot: {
    name: 'Great Depot',
    category: 'storage',
    symbol: 'GW',
    color: '#c9ab40',
    buildCost: { plank: 20, stone: 20, brick: 12, iron: 4 },
    isStorage: true,
    capacity: 600,
    buildDuration: 45
  },

  // Skogsbruk
  woodcutter: {
    name: 'Woodcutter',
    category: 'forestry',
    symbol: 'WC',
    color: '#7a5230',
    buildCost: { plank: 2 },
    job: {
      kind: 'gather',
      sourceTerrain: 'tree',
      searchRadius: 14,
      outputResource: 'wood',
      workSeconds: 2
    },
    buildDuration: 10
  },
  sawmill: {
    name: 'Sawmill',
    category: 'forestry',
    symbol: 'SM',
    color: '#b5875a',
    buildCost: { wood: 5, stone: 4 },
    job: {
      kind: 'craft',
      inputs: { wood: 1 },
      outputs: { plank: 2 },
      craftSeconds: 8
    },
    buildDuration: 15
  },
  planter: {
    name: 'Planter',
    category: 'forestry',
    symbol: 'SE',
    color: '#176d22',
    buildCost: { wood: 5, stone: 4 },
    job: {
      kind: 'craft',
      inputs: { seeds: 3 },
      outputs: { herbs: 1 },
      craftSeconds: 8
    },
    buildDuration: 30
  },

  // Jordbruk och mat
  apple_gatherer: {
    name: 'Apple Gatherer',
    category: 'farming',
    symbol: 'AG',
    color: '#536c38',
    buildCost: { plank: 4, wood: 4 },
    job: {
      kind: 'gather',
      sourceTerrain: 'apple_tree',
      searchRadius: 20,
      outputResource: 'apples',
      workSeconds: 5
    },
    buildDuration: 15
  },

  berry_gatherer: {
    name: 'Berry Gatherer',
    category: 'farming',
    symbol: 'BG',
    color: '#465c35',
    buildCost: { plank: 4, wood: 4 },
    job: {
      kind: 'gather',
      sourceTerrain: 'berry_bush',
      searchRadius: 20,
      outputResource: 'berries',
      workSeconds: 5
    },
    buildDuration: 15
  },

  herb_gatherer: {
    name: 'Herb Gatherer',
    category: 'farming',
    symbol: 'HG',
    color: '#526b40',
    buildCost: { plank: 4, wood: 4 },
    job: {
      kind: 'gather',
      sourceTerrain: 'herbs',
      searchRadius: 20,
      outputResource: 'herbs',
      workSeconds: 5
    },
    buildDuration: 15
  },

  mushroom_gatherer: {
    name: 'Mushroom Gatherer',
    category: 'farming',
    symbol: 'MG',
    color: '#49354e',
    buildCost: { plank: 4, wood: 4 },
    job: {
      kind: 'gather',
      sourceTerrain: 'mushrooms',
      searchRadius: 20,
      outputResource: 'mushrooms',
      workSeconds: 5
    },
    buildDuration: 15
  },

  farm: {
    name: 'Farm',
    category: 'farming',
    symbol: 'F',
    color: '#b8a22e',
    buildCost: { plank: 6, wood: 5, stone: 4 },
    job: {
      kind: 'craft',
      inputs: { },
      outputs: { grain: 2, straw: 1, seeds: 1 },
      craftSeconds: 8
    },
    buildDuration: 20
  },
  stables: {
    name: 'Stables',
    category: 'farming',
    symbol: 'HB',
    color: '#8b5e3c',
    buildCost: { plank: 8, wood: 6, stone: 4 },
    job: {
      kind: 'craft',
      inputs: { grain: 3, water: 1 },
      outputs: { horse: 1 },
      craftSeconds: 40
    },
    buildDuration: 40
  },
  hunters_cottage: {
    name: 'Hunters Cottage',
    category: 'farming',
    symbol: 'HC',
    color: '#be1f1f',
    buildCost: { plank: 6, wood: 5, stone: 4 },
    job: {
      kind: 'gather',
      sourceUnit: 'deer',
      searchRadius: 20,
      workLabel: "Hunting",
      outputs: { meat: 1, leather: 1 },
      craftSeconds: 1
    },
    buildDuration: 15
  },
  fishing_hut: {
    name: 'Fishing Hut',
    category: 'farming',
    symbol: 'FH',
    color: '#1fa6be',
    buildCost: { plank: 6, wood: 5, stone: 4 },
    job: {
      kind: 'gather',
      sourceTerrain: 'water',
      searchRadius: 2,
      outputResource: 'fish',
      workSeconds: 30
    },
    buildDuration: 20
  },

  // Insamling av grundmaterial
  well: {
    name: 'Well',
    category: 'gathering',
    symbol: 'WE',
    color: '#00aaff',
    buildCost: { plank: 3, stone: 7 },
    job: {
      kind: 'gather',
      sourceTerrain: 'water',
      searchRadius: 2,
      outputResource: 'water',
      workSeconds: 30
    },
    buildDuration: 25
  },

  sand_collector: {
    name: 'Sand Collector',
    category: 'gathering',
    symbol: 'SC',
    color: '#c9b887',
    buildCost: { plank: 4 },
    job: {
      kind: 'gather',
      sourceTerrain: 'sand',
      searchRadius: 20,
      outputResource: 'sand',
      workSeconds: 5
    },
    buildDuration: 30
  },

  clay_pit: {
    name: 'Clay Pit',
    category: 'gathering',
    symbol: 'CP',
    color: '#946b58',
    buildCost: { plank: 4, stone: 3 },
    job: {
      kind: 'gather',
      sourceTerrain: 'clay',
      searchRadius: 20,
      outputResource: 'clay',
      workSeconds: 6
    },
    buildDuration: 30
  },

  limestone_quarry: {
    name: 'Limestone Quarry',
    category: 'gathering',
    symbol: 'LQ',
    color: '#b8b4a5',
    buildCost: { plank: 4, stone: 4 },
    job: {
      kind: 'gather',
      sourceTerrain: 'limestone',
      searchRadius: 20,
      outputResource: 'limestone',
      workSeconds: 6
    },
    buildDuration: 40
  },

  // Gruvbrytning och stenbrott
  quarry: {
    name: 'Quarry',
    category: 'mining',
    symbol: 'Q',
    color: '#7d8790',
    buildCost: { plank: 5, wood: 4 },
    job: {
      kind: 'gather',
      sourceTerrain: 'rock',
      searchRadius: 14,
      outputResource: 'stone',
      workSeconds: 5
    },
    buildDuration: 15
  },
  // Gruvbrytning och stenbrott
  rock_crusher: {
    name: 'Rock crusher',
    category: 'gathering',
    symbol: 'RC',
    color: '#5d6368',
    buildCost: { plank: 8 },
    job: {
      kind: 'gather',
      sourceTerrain: 'mountain',
      searchRadius: 25,
      outputResource: 'sand',
      workSeconds: 20
    },
    buildDuration: 45
  },

  iron_mine: {
    name: 'Iron Mine',
    category: 'mining',
    symbol: 'IM',
    color: '#65463f',
    buildCost: { plank: 6, stone: 5 },
    placeOnTerrain: 'iron_ore',
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread'], every: 2 },
      sourceTerrain: 'iron_ore',
      searchRadius: 10,
      outputResource: 'iron_ore',
      workSeconds: 20
    },
    buildDuration: 30
  },

  copper_mine: {
    name: 'Copper Mine',
    category: 'mining',
    symbol: 'CM',
    color: '#ad704b',
    buildCost: { plank: 6, stone: 5 },
    placeOnTerrain: 'copper_ore',
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread'], every: 2 },
      sourceTerrain: 'copper_ore',
      searchRadius: 10,
      outputResource: 'copper_ore',
      workSeconds: 20
    },
    buildDuration: 30
  },

  tin_mine: {
    name: 'Tin Mine',
    category: 'mining',
    symbol: 'TM',
    color: '#9ba3a5',
    buildCost: { plank: 6, stone: 5 },
    placeOnTerrain: 'tin_ore',
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread'], every: 2 },
      sourceTerrain: 'tin_ore',
      searchRadius: 10,
      outputResource: 'tin_ore',
      workSeconds: 30
    },
    buildDuration: 30
  },

  coal_mine: {
    name: 'Coal Mine',
    category: 'mining',
    symbol: 'CO',
    color: '#292a30',
    buildCost: { plank: 6, stone: 5 },
    placeOnTerrain: 'coal',
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread'], every: 2 },
      sourceTerrain: 'coal',
      searchRadius: 10,
      outputResource: 'coal',
      workSeconds: 20
    },
    buildDuration: 30
  },

  gold_mine: {
    name: 'Gold Mine',
    category: 'mining',
    symbol: 'GM',
    color: '#827044',
    buildCost: { plank: 8, stone: 6 },
    placeOnTerrain: 'gold_ore',
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread'], every: 2 },
      sourceTerrain: 'gold_ore',
      searchRadius: 10,
      outputResource: 'gold_ore',
      workSeconds: 30
    },
    buildDuration: 40
  },

  silver_mine: {
    name: 'Silver Mine',
    category: 'mining',
    symbol: 'SM',
    color: '#b9c1ca',
    buildCost: { plank: 8, stone: 6 },
    placeOnTerrain: 'silver_ore',
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread'], every: 2 },
      sourceTerrain: 'silver_ore',
      searchRadius: 10,
      outputResource: 'silver_ore',
      workSeconds: 30
    },
    buildDuration: 40
  },

  gemstone_mine: {
    name: 'Gemstone Mine',
    category: 'mining',
    symbol: 'GM',
    color: '#765aa8',
    buildCost: { plank: 8, stone: 6 },
    placeOnTerrain: 'gemstone',
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread'], every: 2 },
      sourceTerrain: 'gemstone',
      searchRadius: 10,
      outputResource: 'gemstone',
      workSeconds: 30
    },
    buildDuration: 50
  },

  salt_mine: {
    name: 'Salt Mine',
    category: 'mining',
    symbol: 'SM',
    color: '#d6d0bd',
    buildCost: { plank: 6, stone: 6 },
    placeOnTerrain: 'salt_ore',
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread'], every: 2 },
      sourceTerrain: 'salt_ore',
      searchRadius: 10,
      outputResource: 'salt',
      workSeconds: 30
    },
    buildDuration: 20
  },

  sulfur_mine: {
    name: 'Sulfur Mine',
    category: 'mining',
    symbol: 'SU',
    color: '#d6c83f',
    buildCost: { plank: 6, stone: 6 },
    placeOnTerrain: 'sulfur',
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread'], every: 2 },
      sourceTerrain: 'sulfur',
      searchRadius: 10,
      outputResource: 'sulfur',
      workSeconds: 30
    },
    buildDuration: 45
  },

  // Förädling och materialproduktion

  mill: {
    name: 'Mill',
    category: 'processing',
    symbol: 'M',
    color: '#d6d6d6',
    buildCost: { plank: 7, stone: 7 },
    job: {
      kind: 'craft',
      inputs: { grain: 2 },
      outputs: { flour: 1 },
      craftSeconds: 8
    },
    buildDuration: 20
  },

  bakery: {
    name: 'Bakery',
    category: 'processing',
    symbol: 'B',
    color: '#d98a3d',
    buildCost: { plank: 7, stone: 7 },
    job: {
      kind: 'craft',
      inputs: { flour: 1, water: 1 },
      outputs: { bread: 2 },
      craftSeconds: 10
    },
    buildDuration: 30
  },

  brickworks: {
    name: 'Brickworks',
    category: 'processing',
    symbol: 'BW',
    color: '#ad604b',
    buildCost: { plank: 7, stone: 6 },
    job: {
      kind: 'craft',
      inputs: { clay: 2, straw: 1 },
      outputs: { brick: 2 },
      craftSeconds: 10
    },
    buildDuration: 40
  },

  iron_smelter: {
    name: 'Iron Smelter',
    category: 'processing',
    symbol: 'IS',
    color: '#6b7fa6',
    buildCost: { plank: 7, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { iron_ore: 1, charcoal: 1 },
      outputs: { iron: 1 },
      craftSeconds: 10
    },
    buildDuration: 45
  },

  copper_smelter: {
    name: 'Copper Smelter',
    category: 'processing',
    symbol: 'CS',
    color: '#c47b51',
    buildCost: { plank: 7, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { copper_ore: 1, charcoal: 1 },
      outputs: { copper: 1 },
      craftSeconds: 10
    },
    buildDuration: 45
  },

  tin_smelter: {
    name: 'Tin Smelter',
    category: 'processing',
    symbol: 'TS',
    color: '#aeb8bb',
    buildCost: { plank: 7, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { tin_ore: 1, charcoal: 1 },
      outputs: { tin: 1 },
      craftSeconds: 10
    },
    buildDuration: 45
  },

  bronze_foundry: {
    name: 'Bronze Foundry',
    category: 'processing',
    symbol: 'BF',
    color: '#a87949',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { copper: 2, tin: 1 },
      outputs: { bronze: 3 },
      craftSeconds: 12
    },
    buildDuration: 45
  },

  charcoal_burner: {
    name: 'Charcoal Burner',
    category: 'processing',
    symbol: 'CB',
    color: '#38383b',
    buildCost: { wood: 5, stone: 4 },
    job: {
      kind: 'craft',
      inputs: { wood: 2 },
      outputs: { charcoal: 1 },
      craftSeconds: 10
    },
    buildDuration: 30
  },

  // Verktygstillverkning
  hammersmith: {
    name: 'Hammersmith',
    category: 'crafting',
    symbol: 'HS',
    color: '#8a8f99',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, wood: 1 },
      outputs: { hammer: 1 },
      craftSeconds: 12
    },
    buildDuration: 45
  },

  picksmith: {
    name: 'Picksmith',
    category: 'crafting',
    symbol: 'PS',
    color: '#8a8f99',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, wood: 1 },
      outputs: { pickaxe: 1 },
      craftSeconds: 12
    },
    buildDuration: 45
  },

  axesmith: {
    name: 'Axesmith',
    category: 'crafting',
    symbol: 'AS',
    color: '#8a8f99',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, wood: 1 },
      outputs: { axe: 1 },
      craftSeconds: 12
    },
    buildDuration: 45
  },

  scythesmith: {
    name: 'Scythesmith',
    category: 'crafting',
    symbol: 'SS',
    color: '#8a8f99',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, wood: 1 },
      outputs: { scythe: 1 },
      craftSeconds: 12
    },
    buildDuration: 45
  },

  
  swordsmith: {
    name: 'Swordsmith',
    category: 'crafting',
    symbol: 'SW',
    color: '#9aa4b2',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { iron: 2, wood: 1 },
      outputs: { sword: 1 },
      craftSeconds: 15
    },
    buildDuration: 45
  },

  bowyer: {
    name: 'Bowyer',
    category: 'crafting',
    symbol: 'BY',
    color: '#a8784a',
    buildCost: { plank: 8, stone: 4 },
    job: {
      kind: 'craft',
      inputs: { wood: 2, leather: 1 },
      outputs: { bow: 1 },
      craftSeconds: 12
    },
    buildDuration: 35
  },

  leatherworker: {
    name: 'Leatherworker',
    category: 'crafting',
    symbol: 'LT',
    color: '#7a4e32',
    buildCost: { plank: 6, stone: 4 },
    job: {
      kind: 'craft',
      inputs: { leather: 3 },
      outputs: { leather_armor: 1 },
      craftSeconds: 12
    },
    buildDuration: 30
  },

  armorsmith: {
    name: 'Armorsmith',
    category: 'crafting',
    symbol: 'AM',
    color: '#8794ad',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { iron: 4, leather: 1 },
      outputs: { iron_armor: 1 },
      craftSeconds: 20
    },
    buildDuration: 45
  },

  // Magiska och forntida fynd
  crystal_gatherer: {
    name: 'Crystal Gatherer',
    category: 'magic',
    symbol: 'CG',
    color: '#675080',
    buildCost: { plank: 10, stone: 10 },
    job: {
      kind: 'gather',
      sourceTerrain: 'crystal',
      searchRadius: 50,
      outputResource: 'crystal',
      workSeconds: 10
    },
    buildDuration: 60
  },

  moonstone_gatherer: {
    name: 'Moonstone Gatherer',
    category: 'magic',
    symbol: 'MO',
    color: '#8b91b8',
    buildCost: { plank: 10, stone: 10 },
    job: {
      kind: 'gather',
      sourceTerrain: 'moonstone',
      searchRadius: 50,
      outputResource: 'moonstone',
      workSeconds: 11
    },
    buildDuration: 70
  },

  relic_hunter: {
    name: 'Relic Hunter',
    category: 'magic',
    symbol: 'RH',
    color: '#625b61',
    buildCost: { plank: 10, stone: 10 },
    job: {
      kind: 'gather',
      sourceTerrain: 'ruins',
      searchRadius: 100,
      outputResource: 'ancient_relic',
      workSeconds: 12
    },
    buildDuration: 80
  },

  fallen_star_collector: {
    name: 'Fallen Star Collector',
    category: 'magic',
    symbol: 'FS',
    color: '#8d6b9c',
    buildCost: { plank: 12, stone: 11 },
    job: {
      kind: 'gather',
      sourceTerrain: 'fallen_star',
      searchRadius: 100,
      outputResource: 'fallen_star',
      workSeconds: 35
    },
    buildDuration: 90
  },


  guard_tower: {
    name: 'Guard Tower',
    category: 'military',
    symbol: 'GT',
    color: '#8c5a3c',
    buildCost: { wood: 5, plank: 6, stone: 10 },
    job: {
      kind: 'garrison',
      capacity: 4,
      trains: ['swordsman', 'archer'],
      searchRadius: 20
    },
    vision: 18,
    maxHp: 200,
    buildDuration: 40
  },

  // Utkikstorn: ser långt men gör inget annat. Ger synfält så att nya platser går att bygga på.
  watchtower: {
    name: 'Watchtower',
    category: 'military',
    symbol: 'WT',
    color: '#b08a55',
    buildCost: { plank: 2, stone: 3 },
    vision: 30,
    maxHp: 120,
    buildDuration: 8
  },

  garrison: {
    name: 'Garrison',
    category: 'military',
    symbol: 'GA',
    color: '#7a3f3f',
    buildCost: { plank: 15, stone: 20, brick: 8 },
    job: {
      kind: 'garrison',
      capacity: 10,
      trains: ['swordsman', 'archer', 'knight'],
      searchRadius: 20
    },
    vision: 18,
    maxHp: 300,
    buildDuration: 80
  },

  // Mur: ett block som ingen enhet kan gå igenom (byggnader blockerar all gång). Fienden måste slå sig igenom den.
  // repeatPlacement: placeringsläget stannar kvar efter varje bygge så att en hel mur kan läggas i ett svep.
  wall: {
    name: 'Wall',
    category: 'military',
    symbol: 'W',
    color: '#8a8f98',
    buildCost: { stone: 3 },
    maxHp: 250,
    repeatPlacement: true,
    buildDuration: 6
  },

  // Slutbyggnad
  monument: {
    name: 'Monument',
    category: 'special',
    symbol: '★',
    color: '#e8c547',
    buildCost: { plank: 10, stone: 10, fallen_star: 5, ancient_relic: 5, moonstone: 10, crystal: 20 },
    isWinBuilding: true,
    buildDuration: 300
  }
};
