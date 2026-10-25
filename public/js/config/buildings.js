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
    carriers: 5,        // så många bärare ger ett färdigt lager (annars carriersPerStorage)
    buildDuration: 10
  },
 
  large_warehouse: {
    name: 'Large Warehouse',
    category: 'storage',
    symbol: 'LW',
    color: '#b89a35',
    buildCost: { plank: 8, stone: 6, brick: 4, hammer: 1 },
    isStorage: true,
    capacity: 200,
    carriers: 10,
    buildDuration: 20
  },
 
  great_depot: {
    name: 'Great Depot',
    category: 'storage',
    symbol: 'GW',
    color: '#c9ab40',
    buildCost: { plank: 20, stone: 20, brick: 12, steel: 4, limestone: 8, bronze: 4, hammer: 2 },
    isStorage: true,
    capacity: 600,
    carriers: 25,
    buildDuration: 45
  },

  // Skogsbruk
  woodcutter: {
    name: 'Woodcutter',
    category: 'forestry',
    symbol: 'WC',
    color: '#7a5230',
    buildCost: { plank: 2 },
    requiredEquipment: { axe: 1 },
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
    requiredEquipment: { saw: 1 },
    job: {
      kind: 'craft',
      inputs: { wood: 1 },
      outputs: { plank: 2 },
      craftSeconds: 8
    },
    buildDuration: 15
  },
  // Planterar träd: en frö och lite vatten ger ett nytt träd med 5-10 trä på en slumpad ledig gräsruta 5-10 rutor bort
  planter: {
    name: 'Planter',
    category: 'forestry',
    symbol: 'PL',
    color: '#176d22',
    buildCost: { wood: 5, stone: 4 },
    requiredEquipment: { shovel: 1 },
    job: {
      kind: 'plant',
      inputs: { seeds: 1, water: 1 },
      terrain: 'tree',
      amount: [5, 10],
      minRadius: 5,
      maxRadius: 10,
      workSeconds: 6
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
    requiredEquipment: { scythe: 1 },
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
    color: '#7a5c80',
    buildCost: { plank: 4, wood: 4 },
    requiredEquipment: { knife: 1 },
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
    requiredEquipment: { scythe: 1 },
    job: {
      kind: 'craft',
      choices: [
        { outputs: { grain: 2, straw: 1, seeds: 1 } },
        { inputs: { grain: 2, water: 1 }, outputs: { animal: 2 } }
      ],
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
      inputs: { animal: 1, grain: 3, water: 1 },
      outputs: { horse: 1 },
      craftSeconds: 40
    },
    buildDuration: 40
  },
  hunters_cottage: {
    name: 'Hunters Cottage',
    category: 'farming',
    symbol: 'HC',
    color: '#8a7b3e',
    buildCost: { plank: 6, wood: 5, stone: 4 },
    requiredEquipment: { knife: 1 },
    job: {
      kind: 'gather',
      sourceUnit: Object.keys(CityBuilder.Config.units).filter(id => CityBuilder.Config.units[id].isAnimal),
      searchRadius: 20,
      workLabel: "Hunting",
      outputs: { meat: 1, leather: 1 },
      byproducts: { bone: 1 },
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
      workSeconds: 15
    },
    buildDuration: 25
  },

  sand_collector: {
    name: 'Sand Collector',
    category: 'gathering',
    symbol: 'SC',
    color: '#c9b887',
    buildCost: { plank: 4 },
    requiredEquipment: { shovel: 1 },
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
    requiredEquipment: { shovel: 1 },
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
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread', 'meal'], every: 4 },
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
    requiredEquipment: { pickaxe: 1 },
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
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread', 'meal'], every: 4 },
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
    color: '#7b6f6a',
    buildCost: { plank: 6, stone: 5 },
    placeOnTerrain: 'iron_ore',
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread', 'meal'], every: 2 },
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
    color: '#c87f35',
    buildCost: { plank: 6, stone: 5 },
    placeOnTerrain: 'copper_ore',
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread', 'meal'], every: 2 },
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
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread', 'meal'], every: 2 },
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
    color: '#34363d',
    buildCost: { plank: 6, stone: 5 },
    placeOnTerrain: 'coal',
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread', 'meal'], every: 2 },
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
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meal'], every: 3 },
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
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meal'], every: 3 },
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
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meal'], every: 3 },
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
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meal'], every: 3 },
      sourceTerrain: 'salt_ore',
      searchRadius: 10,
      outputResource: 'salt_ore',
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
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meal'], every: 3 },
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
      choices: [
        { inputs: { grain: 2 }, outputs: { flour: 1 } },
        { inputs: { salt_ore: 2 }, outputs: { salt: 2 } }
      ],
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
    color: '#b97a45',
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
    color: '#d08a3a',
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

  silver_smelter: {
    name: 'Silver Smelter',
    category: 'processing',
    symbol: 'SI',
    color: '#9fb6c9',
    buildCost: { plank: 7, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { silver_ore: 1, charcoal: 1 },
      outputs: { silver: 1 },
      craftSeconds: 12
    },
    buildDuration: 45
  },

  gold_smelter: {
    name: 'Gold Smelter',
    category: 'processing',
    symbol: 'GS',
    color: '#d1a93a',
    buildCost: { plank: 7, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { gold_ore: 1, charcoal: 1 },
      outputs: { gold: 1 },
      craftSeconds: 14
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
    color: '#45454a',
    buildCost: { wood: 5, stone: 4 },
    job: {
      kind: 'craft',
      inputs: { wood: 2 },
      outputs: { charcoal: 1 },
      byproducts: { tar: 1, ash: 1 },
      craftSeconds: 10
    },
    buildDuration: 30
  },

  kitchen: {
    name: 'Kitchen',
    category: 'processing',
    symbol: 'KI',
    color: '#c9784a',
    buildCost: { plank: 7, stone: 6 },
    job: {
      kind: 'craft',
      choices: [
        { inputs: { meat: 1, mushrooms: 2 }, outputs: { meal: 3 } },
        { inputs: { flour: 1, apples: 1, berries: 2 }, outputs: { meal: 3 } },
        { inputs: { fish: 1, mushrooms: 1, berries: 1 }, outputs: { meal: 2 } },
        { inputs: { meat: 1, apples: 1 }, outputs: { meal: 2 } }
      ],
      craftSeconds: 12
    },
    buildDuration: 30
  },
  glassworks: {
    name: 'Glassworks',
    category: 'processing',
    symbol: 'GL',
    color: '#7fb8c4',
    buildCost: { plank: 8, stone: 8, brick: 4 },
    job: {
      kind: 'craft',
      inputs: { sand: 3, ash: 1 },
      outputs: { glass: 2 },
      craftSeconds: 12
    },
    buildDuration: 45
  },
  steelworks: {
    name: 'Steelworks',
    category: 'processing',
    symbol: 'ST',
    color: '#7c8ba0',
    buildCost: { plank: 8, stone: 8, brick: 4 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, coal: 1 },
      outputs: { steel: 1 },
      craftSeconds: 15
    },
    buildDuration: 45
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
    color: '#7b92a8',
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
    color: '#a0958a',
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
    color: '#8da58f',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      inputs: { iron: 1, wood: 1 },
      outputs: { scythe: 1 },
      craftSeconds: 12
    },
    buildDuration: 45
  },

  
  toolsmith: {
    name: 'Toolsmith',
    category: 'crafting',
    symbol: 'TO',
    color: '#9a8f7a',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      choices: [
        { inputs: { iron: 1, wood: 1 }, outputs: { knife: 1 } },
        { inputs: { iron: 1, wood: 1 }, outputs: { saw: 1 } },
        { inputs: { iron: 1, wood: 1 }, outputs: { shovel: 1 } }
      ],
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
    color: '#7a5632',
    buildCost: { plank: 6, stone: 4 },
    requiredEquipment: { knife: 1 },
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
      inputs: { steel: 3, leather: 1 },
      outputs: { iron_armor: 1 },
      craftSeconds: 20
    },
    buildDuration: 45
  },

  // Handel. 'choices': byggnaden gör ett val åt gången, spelaren väljer i infopanelen (building.choice).
  mint: {
    name: 'Mint',
    category: 'trade',
    symbol: 'MI',
    color: '#cdbb6a',
    buildCost: { plank: 8, stone: 10, brick: 6, limestone: 4, bronze: 4, hammer: 1 },
    boost: null,
    job: {
      kind: 'craft',
      choices: [
        { inputs: { silver: 1 }, outputs: { coins: 6 } },
        { inputs: { gold: 1 }, outputs: { coins: 20 } }
      ],
      craftSeconds: 8
    },
    buildDuration: 60
  },

  // Handelsplats: klickar man på den öppnas ett fönster där varor köps och säljs för mynt direkt (Economy.buy och Economy.sell).
  // Priserna (mynt per styck) gör att marknaden är en nödventil för sällsynta varor, inte ett sätt att slippa gruvorna.
  // Försäljning ger sellFactor av priset. Silver och guld handlas inte: de blir mynt i myntverket.
  market: {
    name: 'Market',
    category: 'trade',
    symbol: 'MK',
    color: '#d98f3a',
    buildCost: { plank: 10, stone: 8, brick: 6, limestone: 4, hammer: 1 },
    isMarket: true,
    market: {
      sellFactor: 0.5,
      prices: {
        wood: 2, plank: 3, stone: 3, clay: 3, sand: 2, limestone: 4, brick: 5, charcoal: 4, coal: 4,
        grain: 2, flour: 3, bread: 5, meat: 3, fish: 3, leather: 6, salt: 6,
        iron_ore: 6, copper_ore: 6, tin_ore: 6, iron: 8, copper: 10, tin: 10, bronze: 14,
        straw: 2, apples: 2, berries: 2, mushrooms: 3, herbs: 4, glass: 6, meal: 6,
        crystal: 25, gemstone: 30, moonstone: 40,
      },
    },
    buildDuration: 60
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


  // Slutvaror: boost som spelaren väljer per byggnad (se settings.boosts). Potion ger samlarna mer, förtrollat trä ger förädlarna mer,
  // en talisman får garnisonerna att träna dubbelt så fort.
  alchemist: {
    name: 'Alchemist',
    category: 'magic',
    symbol: 'AL',
    color: '#6f4fa8',
    buildCost: { plank: 10, stone: 10, brick: 6, hammer: 1 },
    job: {
      kind: 'craft',
      choices: [
        { inputs: { crystal: 1, herbs: 2, mushrooms: 1, glass: 1, salt: 1 }, outputs: { potion: 2 } },
        { inputs: { bone: 2, sulfur: 1 }, outputs: { cursed_ash: 1 } }
      ],
      craftSeconds: 15
    },
    buildDuration: 60
  },

  enchanter: {
    name: 'Enchanter',
    category: 'magic',
    symbol: 'EN',
    color: '#3f8f6a',
    buildCost: { plank: 12, stone: 10, brick: 6, hammer: 1 },
    // Engångsformler: kostar varor ur lagret och förvandlar 'count' lediga gräsrutor inom 'radius' runt målet till nya fyndigheter
    // ('terrains' = vikter, 'amount' = mängd per ruta, annars terrängens standard). Målet får ligga högst spellRange rutor från
    // förtrollaren, och varje förtrollare vilar spellCooldown sekunder efter en formel. Biprodukterna ben, aska och tjära får här sitt värde.
    spellRange: 30,
    spellCooldown: 20,
    spells: [
      { id: 'grove', name: 'Grove', cost: { ash: 4, seeds: 2 }, radius: 3, count: 7, terrains: { tree: 1 }, amount: [5, 10] },
      { id: 'bloom', name: 'Bloom', cost: { bone: 3, ash: 2 }, radius: 3, count: 6, terrains: { berry_bush: 2, apple_tree: 1, herbs: 2, mushrooms: 2 } },
      { id: 'stonecall', name: 'Stonecall', cost: { tar: 3, bone: 2 }, radius: 3, count: 6, terrains: { rock: 3, clay: 2, sand: 2, limestone: 1 } },
      { id: 'earthsong', name: 'Earthsong', cost: { cursed_ash: 2, tar: 2 }, radius: 2, count: 4, terrains: { iron_ore: 3, coal: 3, copper_ore: 1, tin_ore: 1 } },
      { id: 'leyline', name: 'Ley Line', cost: { cursed_ash: 3, moonstone: 1 }, radius: 2, count: 3, terrains: { silver_ore: 2, gold_ore: 1, gemstone: 1, crystal: 1 } },
    ],
    job: {
      kind: 'craft',
      inputs: { wood: 4, moonstone: 1 },
      outputs: { enchanted_wood: 4 },
      craftSeconds: 15
    },
    buildDuration: 70
  },

  shrine: {
    name: 'Shrine',
    category: 'magic',
    symbol: 'SH',
    color: '#c9b6e8',
    buildCost: { plank: 12, stone: 14, brick: 8, limestone: 6, bronze: 6, hammer: 2 },
    job: {
      kind: 'craft',
      inputs: { ancient_relic: 1, gemstone: 2, gold: 1 },
      outputs: { talisman: 3 },
      craftSeconds: 20
    },
    buildDuration: 80
  },


  guard_tower: {
    name: 'Guard Tower',
    category: 'military',
    symbol: 'GT',
    color: '#46a083',
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
    color: '#8fc1ad',
    buildCost: { plank: 2, stone: 3 },
    vision: 30,
    maxHp: 120,
    buildDuration: 8
  },

  garrison: {
    name: 'Garrison',
    category: 'military',
    symbol: 'GA',
    color: '#357a65',
    buildCost: { plank: 15, stone: 20, brick: 8, hammer: 2 },
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

  // Slutbyggnad: alla egna byggnader inom radien producerar mer och soldater tränas snabbare. Bara ett per spelare.
  monument: {
    name: 'Resonance Monument',
    category: 'special',
    symbol: '★',
    color: '#e8c547',
    buildCost: { plank: 10, stone: 10, fallen_star: 5, ancient_relic: 5, moonstone: 10, crystal: 20, limestone: 12, bronze: 10, hammer: 3 },
    isWinBuilding: true,
    unique: true,
    aura: { radius: 30, yield: 0.1, training: 0.25 },
    buildDuration: 300
  }
};
