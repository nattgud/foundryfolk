CityBuilder.Config.buildings = {
// Lagring
  hq: {
    name: 'Base',
    category: 'trade',
    symbol: 'B',
    color: '#c9a227',
    buildCost: {},
    hiddenInMenu: true,
    isStorage: true,
    vision: 18,
    maxHp: 400,
    buildDuration: 5
  },

  // Det som blir kvar när en byggnad rivs ligger här på marken tills bärarna hämtat det (Construction.dismantle). Går inte att bygga eller välja i menyn.
  pile: {
    name: 'Pile of goods',
    category: 'trade',
    symbol: '•',
    color: '#8a6a43',
    buildCost: {},
    hiddenInMenu: true,
    pile: true,
    carriers: 0,
    maxHp: null,
    vision: 0,
    buildDuration: 0
  },

  warehouse: {
    name: 'Warehouse',
    category: 'trade',
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
    category: 'trade',
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
    category: 'trade',
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
    category: 'construction',
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
    category: 'construction',
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
    category: 'construction',
    symbol: 'PL',
    color: '#176d22',
    buildCost: { wood: 5, stone: 4 },
    requiredEquipment: { shovel: 1 },
    job: {
      kind: 'plant',
      inputs: { seeds: 1, water: 1 },
      terrain: 'tree',
      amount: [5, 10],
      minRadius: 0,
      maxRadius: 10,
      workSeconds: 6
    },
    buildDuration: 30
  },

  // Jordbruk och mat
  // Samlare med inriktning: ett enda bygge i menyn. Inriktningen (bär, örter, svamp, äpplen) väljs i infopanelen och bestämmer vilken
  // byggnadstyp (variant) det är. Nya samlare får den inriktning som har mest att samla från närmast. Varianterna har group: 'gatherer'.
  gatherer: {
    name: 'Gatherer',
    category: 'food',
    symbol: 'GA',
    color: '#526b40',
    buildCost: { plank: 4, wood: 4 },
    variants: ['berry_gatherer', 'herb_gatherer', 'mushroom_gatherer', 'apple_gatherer'],
    hint: 'Starts with the focus that has the most to gather nearby. Change it in the info panel',
    buildDuration: 15
  },

  apple_gatherer: {
    name: 'Apple Gatherer',
    group: 'gatherer',            // inriktning av byggnaden 'gatherer'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'food',
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
    group: 'gatherer',            // inriktning av byggnaden 'gatherer'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'food',
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
    group: 'gatherer',            // inriktning av byggnaden 'gatherer'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'food',
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
    group: 'gatherer',            // inriktning av byggnaden 'gatherer'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'food',
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
    category: 'food',
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
    category: 'war',
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
    category: 'food',
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
    category: 'food',
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
    category: 'food',
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
    category: 'construction',
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
    category: 'construction',
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
    category: 'construction',
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
    category: 'construction',
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
    category: 'construction',
    symbol: 'RC',
    color: '#5d6368',
    buildCost: { plank: 8 },
    requiredEquipment: { pickaxe: 1 },
    job: {
      kind: 'gather',
      eats: { any: ['meat', 'fish', 'bread', 'meal'], every: 4 },
      digFor: 'deposits',     // gräver den kortaste tunneln genom berget till närmaste fyndighet som berget stänger inne
      searchRadius: 25,
      outputResource: 'sand',
      workSeconds: 15
    },
    buildDuration: 45
  },

  // Gruva med inriktning: ett enda bygge i menyn, som placeras på en fyndighet och blir gruvan för just den malmen (variant med
  // group: 'mine'). Inriktningen byts sedan i infopanelen. variants: terräng -> varianttyp.
  mine: {
    name: 'Mine',
    category: 'metalwork',
    symbol: 'MI',
    color: '#7b6f6a',
    buildCost: { plank: 6, stone: 6 },
    placeOnTerrain: ['iron_ore', 'copper_ore', 'tin_ore', 'coal', 'gold_ore', 'silver_ore', 'gemstone', 'salt_ore', 'sulfur'],
    hint: 'Built on a deposit, and starts with that ore. Change the focus in the info panel',
    variants: { iron_ore: 'iron_mine', copper_ore: 'copper_mine', tin_ore: 'tin_mine', coal: 'coal_mine', gold_ore: 'gold_mine', silver_ore: 'silver_mine', gemstone: 'gemstone_mine', salt_ore: 'salt_mine', sulfur: 'sulfur_mine' },
    buildDuration: 30
  },

  iron_mine: {
    name: 'Iron Mine',
    group: 'mine',            // inriktning av byggnaden 'mine'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'metalwork',
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
    group: 'mine',            // inriktning av byggnaden 'mine'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'metalwork',
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
    group: 'mine',            // inriktning av byggnaden 'mine'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'metalwork',
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
    group: 'mine',            // inriktning av byggnaden 'mine'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'metalwork',
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
    group: 'mine',            // inriktning av byggnaden 'mine'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'valuables',
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
    group: 'mine',            // inriktning av byggnaden 'mine'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'valuables',
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
    group: 'mine',            // inriktning av byggnaden 'mine'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'valuables',
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
    group: 'mine',            // inriktning av byggnaden 'mine'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'valuables',
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
    group: 'mine',            // inriktning av byggnaden 'mine'; syns inte i menyn (se Construction.variantFor)
    hiddenInMenu: true,
    category: 'valuables',
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
    category: 'food',
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
    category: 'food',
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
    category: 'construction',
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
    category: 'metalwork',
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
    category: 'metalwork',
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
    category: 'metalwork',
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
    category: 'valuables',
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
    category: 'valuables',
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
    category: 'metalwork',
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
    category: 'construction',
    symbol: 'CB',
    color: '#45454a',
    buildCost: { wood: 5, stone: 4 },
    job: {
      kind: 'craft',
      inputs: { wood: 1 },
      outputs: { charcoal: 1 },
      byproducts: { tar: 1, ash: 1 },
      craftSeconds: 10
    },
    buildDuration: 30
  },

  kitchen: {
    name: 'Kitchen',
    category: 'food',
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
    category: 'construction',
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
    category: 'metalwork',
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
  // Verktygstillverkning. 'auto': byggnaden gör det påslagna verktyg som det finns minst av (spelaren slår av/på verktyg i infopanelen)
  toolsmith: {
    name: 'Toolsmith',
    category: 'metalwork',
    symbol: 'TO',
    color: '#9a8f7a',
    buildCost: { plank: 8, stone: 8 },
    job: {
      kind: 'craft',
      auto: true,
      choices: ['hammer', 'pickaxe', 'axe', 'scythe', 'shovel', 'saw', 'knife'].map(tool => ({ inputs: { iron: 1, wood: 1 }, outputs: { [tool]: 1 } })),
      craftSeconds: 12
    },
    buildDuration: 45
  },
  swordsmith: {
    name: 'Swordsmith',
    category: 'war',
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
    category: 'war',
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
    category: 'war',
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
    category: 'war',
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
    // Trollformler blandas av upp till 'slots' ingredienser (se systems/spells.js för hur blandningen blir en formel). Varje ingredient bär
    // essenser; essensernas ordning här är också 'hjulet' som en ingrediens vrider nästa ingrediens längs. Himlen (moon/sun) är gratis
    // ingredienser som bara finns på natten respektive dagen. Formeln läses på en plats högst spellRange rutor från förtrollaren och
    // varje förtrollare vilar efteråt, och slaget formeln hör till (Spells.group) laddas om för alla spelarens förtrollare lika länge. Vilan växer med
    // formelns styrka (Spells.recharge): spellRecharge.min sekunder för den svagaste formeln, .max för den starkaste. 'book' är trollboken man börjar med.
    spellRange: 30,
    spellRecharge: { min: 30, max: 180 },
    mixing: {
      slots: 5, maxAmount: 6, maxBook: 20,
      weights: [1.5, 1, 0.8, 0.6, 0.45],   // första ingrediensen väger mest
      amountExponent: 0.6,                 // dubbel mängd ger inte dubbel kraft
      shift: 0.3,                          // andel av nästa ingrediens som vrids ett steg på hjulet
      echoShare: 0.2,                      // andra essensen måste ha så stor andel för att ge en bieffekt
      reference: 10,                       // essenssumma som motsvarar normal kraft
      essences: {
        growth: { name: 'Growth', color: '#6fbf5a' },
        fire:   { name: 'Fire',   color: '#ee7a2f' },
        earth:  { name: 'Earth',  color: '#a07c4c' },
        air:    { name: 'Air',    color: '#a9dcea' },
        water:  { name: 'Water',  color: '#4a86d8' },
        spirit: { name: 'Spirit', color: '#b88cf0' },
        death:  { name: 'Death',  color: '#8a8f99' },
      },
      ingredients: {
        wood: { growth: 2, earth: 1 }, plank: { growth: 1, earth: 1 }, stone: { earth: 3 }, clay: { earth: 2, water: 1 },
        sand: { earth: 2, air: 1 }, limestone: { earth: 2, spirit: 1 }, tar: { fire: 2, death: 1 }, charcoal: { fire: 3 },
        ash: { fire: 1, death: 1, air: 1 }, grain: { growth: 3 }, seeds: { growth: 3, spirit: 1 }, flour: { air: 2, growth: 1 },
        straw: { air: 2, growth: 1 }, apples: { growth: 2, water: 1 }, berries: { growth: 2, water: 1 }, mushrooms: { growth: 1, death: 2 },
        herbs: { growth: 2, spirit: 1 }, water: { water: 3 }, fish: { water: 2, growth: 1 }, salt: { water: 1, earth: 1, spirit: 1 },
        bone: { death: 3, earth: 1 }, leather: { death: 1, earth: 1 }, coal: { fire: 3, earth: 1 }, sulfur: { fire: 3, death: 1 },
        iron_ore: { earth: 2, fire: 1 }, copper_ore: { earth: 2, water: 1 }, tin_ore: { earth: 2, air: 1 }, gold_ore: { earth: 1, spirit: 2 },
        silver_ore: { earth: 1, spirit: 1, air: 1 }, gemstone: { earth: 1, spirit: 2 }, glass: { air: 1, earth: 1, spirit: 1 },
        gold: { spirit: 2, fire: 1 }, silver: { spirit: 2, air: 1 }, crystal: { air: 1, spirit: 3 }, moonstone: { spirit: 3, water: 1 },
        cursed_ash: { death: 3, spirit: 1 }, ancient_relic: { spirit: 2, death: 2 }, fallen_star: { fire: 2, air: 2, spirit: 3 },
        enchanted_wood: { growth: 2, spirit: 3 }, talisman: { spirit: 4 },
        moon: { spirit: 3, water: 1, sky: 'night' }, sun: { fire: 1, growth: 2, spirit: 1, sky: 'day' },
      },
      // Nya deposits för 'create', efter den andra essensen i blandningen (none = bara jord)
      terrains: {
        none: { rock: 3, clay: 2, sand: 2, limestone: 1 },
        fire: { coal: 3, iron_ore: 2, copper_ore: 1, tin_ore: 1 },
        growth: { tree: 3, berry_bush: 1, apple_tree: 1, herbs: 1, mushrooms: 1 },
        water: { clay: 3, sand: 3, limestone: 1 },
        air: { sand: 3, limestone: 2, rock: 1 },
        death: { coal: 2, iron_ore: 2, mushrooms: 1, rock: 1 },
        spirit: { silver_ore: 2, gold_ore: 1, gemstone: 1, crystal: 1 },
      },
      // Trollboken man börjar med: [ingrediens, mängd] i ordning
      book: [
        [['wood', 2], ['seeds', 1], ['stone', 1]],
        [['stone', 3], ['clay', 1]],
        [['stone', 2], ['charcoal', 2]],
        [['charcoal', 2], ['tar', 1], ['ash', 1]],
        [['grain', 3], ['seeds', 2]],
        [['flour', 2], ['straw', 2]],
        [['moon', 1], ['herbs', 2]],
        [['cursed_ash', 2], ['bone', 1]],
        [['water', 3], ['seeds', 1]],
      ],
    },
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
    category: 'war',
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
    category: 'war',
    symbol: 'WT',
    color: '#8fc1ad',
    buildCost: { plank: 2, stone: 3 },
    vision: 30,
    maxHp: 120,
    buildDuration: 8
  },

  garrison: {
    name: 'Garrison',
    category: 'war',
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
    category: 'war',
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
    category: 'magic',
    symbol: '★',
    color: '#e8c547',
    buildCost: { plank: 10, stone: 10, fallen_star: 5, ancient_relic: 5, moonstone: 10, crystal: 20, limestone: 12, bronze: 10, hammer: 3 },
    isWinBuilding: true,
    unique: true,
    aura: { radius: 30, yield: 0.1, training: 0.25 },
    buildDuration: 300
  }
};
