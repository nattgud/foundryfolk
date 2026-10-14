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
    buildCost: { wood: 3, plank: 1 },
    isStorage: true,
    buildDuration: 3
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
    buildDuration: 4
  },

  // Jordbruk och mat
  farm: {
    name: 'Farm',
    category: 'farming',
    symbol: 'G',
    color: '#b8a22e',
    buildCost: { plank: 3, wood: 2 },
    job: {
      kind: 'craft',
      inputs: { },
      outputs: { grain: 2, straw: 1, seeds: 1 },
      craftSeconds: 8
    },
    buildDuration: 5
  },
  hunters_cottage: {
    name: 'Hunter',
    category: 'farming',
    symbol: 'HU',
    color: '#be1f1f',
    buildCost: { plank: 3, wood: 2 },
    job: {
      kind: 'gather',
      sourceUnit: 'deer',
      searchRadius: 20,
      workLabel: "Hunting",
      outputs: { meat: 4 },
      craftSeconds: 1
    },
    buildDuration: 5
  },

  apple_gatherer: {
    name: 'Apple Gatherer',
    category: 'farming',
    symbol: 'AP',
    color: '#536c38',
    buildCost: { plank: 2 },
    job: {
      kind: 'gather',
      sourceTerrain: 'apple_tree',
      searchRadius: 20,
      outputResource: 'apples',
      workSeconds: 5
    },
    buildDuration: 3
  },

  berry_gatherer: {
    name: 'Berry Gatherer',
    category: 'farming',
    symbol: 'BG',
    color: '#465c35',
    buildCost: { plank: 2 },
    job: {
      kind: 'gather',
      sourceTerrain: 'berry_bush',
      searchRadius: 20,
      outputResource: 'berries',
      workSeconds: 5
    },
    buildDuration: 3
  },

  herb_gatherer: {
    name: 'Herb Gatherer',
    category: 'farming',
    symbol: 'H',
    color: '#526b40',
    buildCost: { plank: 2 },
    job: {
      kind: 'gather',
      sourceTerrain: 'herbs',
      searchRadius: 20,
      outputResource: 'herbs',
      workSeconds: 5
    },
    buildDuration: 3
  },

  mushroom_gatherer: {
    name: 'Mushroom Gatherer',
    category: 'farming',
    symbol: 'MU',
    color: '#49354e',
    buildCost: { plank: 2 },
    job: {
      kind: 'gather',
      sourceTerrain: 'mushrooms',
      searchRadius: 20,
      outputResource: 'mushrooms',
      workSeconds: 5
    },
    buildDuration: 3
  },

  // Insamling av grundmaterial
  well: {
    name: 'Well',
    category: 'gathering',
    symbol: 'W',
    color: '#00aaff',
    buildCost: { plank: 1, stone: 5 },
    job: {
      kind: 'gather',
      sourceTerrain: 'water',
      searchRadius: 2,
      outputResource: 'water',
      workSeconds: 5
    },
    buildDuration: 3
  },

  sand_collector: {
    name: 'Sand Collector',
    category: 'gathering',
    symbol: 'SA',
    color: '#c9b887',
    buildCost: { plank: 2 },
    job: {
      kind: 'gather',
      sourceTerrain: 'sand',
      searchRadius: 20,
      outputResource: 'sand',
      workSeconds: 5
    },
    buildDuration: 3
  },

  clay_pit: {
    name: 'Clay Pit',
    category: 'gathering',
    symbol: 'CL',
    color: '#946b58',
    buildCost: { plank: 2, stone: 1 },
    job: {
      kind: 'gather',
      sourceTerrain: 'clay',
      searchRadius: 20,
      outputResource: 'clay',
      workSeconds: 6
    },
    buildDuration: 4
  },

  limestone_quarry: {
    name: 'Limestone Quarry',
    category: 'gathering',
    symbol: 'LQ',
    color: '#b8b4a5',
    buildCost: { plank: 2, stone: 2 },
    job: {
      kind: 'gather',
      sourceTerrain: 'limestone',
      searchRadius: 20,
      outputResource: 'limestone',
      workSeconds: 6
    },
    buildDuration: 4
  },

  // Gruvbrytning och stenbrott
  quarry: {
    name: 'Quarry',
    category: 'mining',
    symbol: 'S',
    color: '#7d8790',
    buildCost: { plank: 2, wood: 2 },
    job: {
      kind: 'gather',
      sourceTerrain: 'rock',
      searchRadius: 14,
      outputResource: 'stone',
      workSeconds: 5
    },
    buildDuration: 5
  },
  // Gruvbrytning och stenbrott
  rock_crusher: {
    name: 'Rock crusher',
    category: 'gathering',
    symbol: 'RC',
    color: '#5d6368',
    buildCost: { plank: 5 },
    job: {
      kind: 'gather',
      sourceTerrain: 'mountain',
      searchRadius: 25,
      outputResource: 'sand',
      workSeconds: 60
    },
    buildDuration: 10
  },

  iron_mine: {
    name: 'Iron Mine',
    category: 'mining',
    symbol: 'IM',
    color: '#65463f',
    buildCost: { plank: 4, stone: 3 },
    placeOnTerrain: 'iron_ore',
    job: {
      kind: 'gather',
      sourceTerrain: 'iron_ore',
      searchRadius: 10,
      outputResource: 'iron_ore',
      workSeconds: 20
    },
    buildDuration: 6
  },

  copper_mine: {
    name: 'Copper Mine',
    category: 'mining',
    symbol: 'CM',
    color: '#ad704b',
    buildCost: { plank: 4, stone: 3 },
    placeOnTerrain: 'copper_ore',
    job: {
      kind: 'gather',
      sourceTerrain: 'copper_ore',
      searchRadius: 10,
      outputResource: 'copper_ore',
      workSeconds: 20
    },
    buildDuration: 6
  },

  tin_mine: {
    name: 'Tin Mine',
    category: 'mining',
    symbol: 'TM',
    color: '#9ba3a5',
    buildCost: { plank: 4, stone: 3 },
    placeOnTerrain: 'tin_ore',
    job: {
      kind: 'gather',
      sourceTerrain: 'tin_ore',
      searchRadius: 10,
      outputResource: 'tin_ore',
      workSeconds: 30
    },
    buildDuration: 6
  },

  coal_mine: {
    name: 'Coal Mine',
    category: 'mining',
    symbol: 'CO',
    color: '#292a30',
    buildCost: { plank: 4, stone: 3 },
    placeOnTerrain: 'coal',
    job: {
      kind: 'gather',
      sourceTerrain: 'coal',
      searchRadius: 10,
      outputResource: 'coal',
      workSeconds: 20
    },
    buildDuration: 6
  },

  gold_mine: {
    name: 'Gold Mine',
    category: 'mining',
    symbol: 'GM',
    color: '#827044',
    buildCost: { plank: 5, stone: 4 },
    placeOnTerrain: 'gold_ore',
    job: {
      kind: 'gather',
      sourceTerrain: 'gold_ore',
      searchRadius: 10,
      outputResource: 'gold_ore',
      workSeconds: 30
    },
    buildDuration: 8
  },

  silver_mine: {
    name: 'Silver Mine',
    category: 'mining',
    symbol: 'SM',
    color: '#b9c1ca',
    buildCost: { plank: 5, stone: 4 },
    placeOnTerrain: 'silver_ore',
    job: {
      kind: 'gather',
      sourceTerrain: 'silver_ore',
      searchRadius: 10,
      outputResource: 'silver_ore',
      workSeconds: 30
    },
    buildDuration: 8
  },

  gemstone_mine: {
    name: 'Gemstone Mine',
    category: 'mining',
    symbol: 'GM',
    color: '#765aa8',
    buildCost: { plank: 5, stone: 4 },
    placeOnTerrain: 'gemstone',
    job: {
      kind: 'gather',
      sourceTerrain: 'gemstone',
      searchRadius: 10,
      outputResource: 'gemstone',
      workSeconds: 30
    },
    buildDuration: 9
  },

  salt_mine: {
    name: 'Salt Mine',
    category: 'mining',
    symbol: 'SL',
    color: '#d6d0bd',
    buildCost: { plank: 4, stone: 3 },
    placeOnTerrain: 'salt_ore',
    job: {
      kind: 'gather',
      sourceTerrain: 'salt_ore',
      searchRadius: 10,
      outputResource: 'salt',
      workSeconds: 30
    },
    buildDuration: 6
  },

  sulfur_mine: {
    name: 'Sulfur Mine',
    category: 'mining',
    symbol: 'SU',
    color: '#d6c83f',
    buildCost: { plank: 4, stone: 3 },
    placeOnTerrain: 'sulfur',
    job: {
      kind: 'gather',
      sourceTerrain: 'sulfur',
      searchRadius: 10,
      outputResource: 'sulfur',
      workSeconds: 30
    },
    buildDuration: 7
  },

  // Förädling och materialproduktion
  sawmill: {
    name: 'Sawmill',
    category: 'forestry',
    symbol: 'V',
    color: '#b5875a',
    buildCost: { wood: 4, stone: 2 },
    job: {
      kind: 'craft',
      inputs: { wood: 1 },
      outputs: { plank: 2 },
      craftSeconds: 8
    },
    buildDuration: 5
  },

  mill: {
    name: 'Mill',
    category: 'processing',
    symbol: 'K',
    color: '#d6d6d6',
    buildCost: { plank: 3, stone: 3 },
    job: {
      kind: 'craft',
      inputs: { grain: 2 },
      outputs: { flour: 1 },
      craftSeconds: 8
    },
    buildDuration: 5
  },

  bakery: {
    name: 'Bakery',
    category: 'processing',
    symbol: 'B',
    color: '#d98a3d',
    buildCost: { plank: 3, stone: 3 },
    job: {
      kind: 'craft',
      inputs: { flour: 1, water: 1 },
      outputs: { bread: 2 },
      craftSeconds: 10
    },
    buildDuration: 6
  },

  brickworks: {
    name: 'Brickworks',
    category: 'processing',
    symbol: 'BW',
    color: '#ad604b',
    buildCost: { plank: 3, stone: 2 },
    job: {
      kind: 'craft',
      inputs: { clay: 2, straw: 1 },
      outputs: { brick: 2 },
      craftSeconds: 10
    },
    buildDuration: 5
  },

  iron_smelter: {
    name: 'Iron Smelter',
    category: 'processing',
    symbol: 'J',
    color: '#6b7fa6',
    buildCost: { plank: 3, stone: 5 },
    job: {
      kind: 'craft',
      inputs: { iron_ore: 1, charcoal: 1 },
      outputs: { iron: 1 },
      craftSeconds: 10
    },
    buildDuration: 6
  },

  copper_smelter: {
    name: 'Copper Smelter',
    category: 'processing',
    symbol: 'CS',
    color: '#c47b51',
    buildCost: { plank: 3, stone: 5 },
    job: {
      kind: 'craft',
      inputs: { copper_ore: 1, charcoal: 1 },
      outputs: { copper: 1 },
      craftSeconds: 10
    },
    buildDuration: 6
  },

  tin_smelter: {
    name: 'Tin Smelter',
    category: 'processing',
    symbol: 'TS',
    color: '#aeb8bb',
    buildCost: { plank: 3, stone: 5 },
    job: {
      kind: 'craft',
      inputs: { tin_ore: 1, charcoal: 1 },
      outputs: { tin: 1 },
      craftSeconds: 10
    },
    buildDuration: 6
  },

  bronze_foundry: {
    name: 'Bronze Foundry',
    category: 'processing',
    symbol: 'BF',
    color: '#a87949',
    buildCost: { plank: 4, stone: 5 },
    job: {
      kind: 'craft',
      inputs: { copper: 2, tin: 1 },
      outputs: { bronze: 3 },
      craftSeconds: 12
    },
    buildDuration: 7
  },

  charcoal_burner: {
    name: 'Charcoal Burner',
    category: 'processing',
    symbol: 'CB',
    color: '#38383b',
    buildCost: { wood: 3, stone: 2 },
    job: {
      kind: 'craft',
      inputs: { wood: 2 },
      outputs: { charcoal: 1 },
      craftSeconds: 10
    },
    buildDuration: 5
  },

  // Verktygstillverkning
  hammersmith: {
    name: 'Hammersmith',
    category: 'crafting',
    symbol: 'F',
    color: '#8a8f99',
    buildCost: { plank: 3, stone: 3 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, wood: 1 },
      outputs: { hammer: 1 },
      craftSeconds: 12
    },
    buildDuration: 5
  },

  picksmith: {
    name: 'Picksmith',
    category: 'crafting',
    symbol: 'F',
    color: '#8a8f99',
    buildCost: { plank: 3, stone: 3 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, wood: 1 },
      outputs: { pickaxe: 1 },
      craftSeconds: 12
    },
    buildDuration: 5
  },

  axesmith: {
    name: 'Axesmith',
    category: 'crafting',
    symbol: 'F',
    color: '#8a8f99',
    buildCost: { plank: 3, stone: 3 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, wood: 1 },
      outputs: { axe: 1 },
      craftSeconds: 12
    },
    buildDuration: 5
  },

  scythesmith: {
    name: 'Scythesmith',
    category: 'crafting',
    symbol: 'F',
    color: '#8a8f99',
    buildCost: { plank: 3, stone: 3 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, wood: 1 },
      outputs: { scythe: 1 },
      craftSeconds: 12
    },
    buildDuration: 5
  },

  // Magiska och forntida fynd
  crystal_gatherer: {
    name: 'Crystal Gatherer',
    category: 'magic',
    symbol: 'CR',
    color: '#675080',
    buildCost: { plank: 4, stone: 3 },
    job: {
      kind: 'gather',
      sourceTerrain: 'crystal',
      searchRadius: 50,
      outputResource: 'crystal',
      workSeconds: 10
    },
    buildDuration: 7
  },

  moonstone_gatherer: {
    name: 'Moonstone Gatherer',
    category: 'magic',
    symbol: 'MO',
    color: '#8b91b8',
    buildCost: { plank: 4, stone: 3 },
    job: {
      kind: 'gather',
      sourceTerrain: 'moonstone',
      searchRadius: 50,
      outputResource: 'moonstone',
      workSeconds: 11
    },
    buildDuration: 8
  },

  relic_hunter: {
    name: 'Relic Hunter',
    category: 'magic',
    symbol: 'RH',
    color: '#625b61',
    buildCost: { plank: 4, stone: 3 },
    job: {
      kind: 'gather',
      sourceTerrain: 'ruins',
      searchRadius: 100,
      outputResource: 'ancient_relic',
      workSeconds: 12
    },
    buildDuration: 9
  },

  fallen_star_collector: {
    name: 'Fallen Star Collector',
    category: 'magic',
    symbol: 'FS',
    color: '#8d6b9c',
    buildCost: { plank: 4, stone: 4 },
    job: {
      kind: 'gather',
      sourceTerrain: 'fallen_star',
      searchRadius: 100,
      outputResource: 'fallen_star',
      workSeconds: 35
    },
    buildDuration: 60
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
