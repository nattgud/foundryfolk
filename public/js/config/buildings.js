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
    buildDuration: 5
  },

  // guardtower: {
  //   name: 'Guard Tower',
  //   category: 'storage',
  //   symbol: 'GT',
  //   color: '#f00',
  //   buildCost: { wood: 5, plank: 3 },
  //   buildDuration: 5,

  //   spawnsUnits: 'warrior',
  //   maxUnits: 3,
  // },

  warehouse: {
    name: 'Warehouse',
    category: 'storage',
    symbol: 'WH',
    color: '#a88a2a',
    buildCost: { wood: 4, plank: 2, stone: 1 },
    isStorage: true,
    buildDuration: 7
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
      workSeconds: 4
    },
    buildDuration: 6
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
    buildDuration: 7
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
    buildDuration: 7
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
    buildDuration: 5
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
    buildDuration: 5
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
    buildDuration: 5
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
    buildDuration: 5
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
    buildDuration: 8
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
      outputs: { meat: 4, leather: 2 },
      craftSeconds: 1
    },
    buildDuration: 8
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
    buildDuration: 10
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
      workSeconds: 1
    },
    buildDuration: 6
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
    buildDuration: 5
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
    buildDuration: 6
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
    buildDuration: 6
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
    buildDuration: 7
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
      workSeconds: 60
    },
    buildDuration: 12
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
      sourceTerrain: 'iron_ore',
      searchRadius: 10,
      outputResource: 'iron_ore',
      workSeconds: 20
    },
    buildDuration: 8
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
      sourceTerrain: 'copper_ore',
      searchRadius: 10,
      outputResource: 'copper_ore',
      workSeconds: 20
    },
    buildDuration: 8
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
      sourceTerrain: 'tin_ore',
      searchRadius: 10,
      outputResource: 'tin_ore',
      workSeconds: 30
    },
    buildDuration: 8
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
      sourceTerrain: 'coal',
      searchRadius: 10,
      outputResource: 'coal',
      workSeconds: 20
    },
    buildDuration: 8
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
      sourceTerrain: 'gold_ore',
      searchRadius: 10,
      outputResource: 'gold_ore',
      workSeconds: 30
    },
    buildDuration: 10
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
      sourceTerrain: 'silver_ore',
      searchRadius: 10,
      outputResource: 'silver_ore',
      workSeconds: 30
    },
    buildDuration: 10
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
      sourceTerrain: 'gemstone',
      searchRadius: 10,
      outputResource: 'gemstone',
      workSeconds: 30
    },
    buildDuration: 12
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
      sourceTerrain: 'salt_ore',
      searchRadius: 10,
      outputResource: 'salt',
      workSeconds: 30
    },
    buildDuration: 8
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
      sourceTerrain: 'sulfur',
      searchRadius: 10,
      outputResource: 'sulfur',
      workSeconds: 30
    },
    buildDuration: 8
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
    buildDuration: 8
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
    buildDuration: 10
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
    buildDuration: 9
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
    buildDuration: 9
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
    buildDuration: 9
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
    buildDuration: 9
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
    buildDuration: 11
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
    buildDuration: 7
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
    buildDuration: 11
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
    buildDuration: 11
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
    buildDuration: 11
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
    buildDuration: 11
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
    buildDuration: 12
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
    buildDuration: 13
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
    buildDuration: 13
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
    buildDuration: 20
  },

  // Slutbyggnad
  monument: {
    name: 'Monument',
    category: 'special',
    symbol: '★',
    color: '#e8c547',
    buildCost: { plank: 10, stone: 10, fallen_star: 5, ancient_relic: 5, moonstone: 10, crystal: 20 },
    isWinBuilding: true,
    buildDuration: 1200
  }
};
