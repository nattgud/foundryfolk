/* Terrängtyper.
   walkCost: gångkostnad (Infinity = blockerar).
   resourceAmount: mängd som kan utvinnas.
   buildable: vanliga byggnader får stå här (som på gräs).
   gatherersStopBefore: samlare stannar bredvid rutan.
   fallbackShape: reservform i CityBuilder.Shapes.
   sandImage: bild som används på sandmark (palmen är trädet på sand).
   image utelämnas -> images/terrain/<id>.png */

CityBuilder.Config.terrain = {
  // Grundterräng
  grass:            { name: "Grass",      color: '#2f5a35', walkCost: 1 },
  mountain:         { name: "Mountain",   color: '#aaa',    walkCost: Infinity, resourceAmount: 1 },
  lava:             { name: "Lava",       color: '#e8590c', walkCost: Infinity },   // bara från vulkaner (systems/weather.js), stelnar till gräs eller malm
  water:            { name: "Water",      color: '#2b5d86', walkCost: Infinity, gatherersStopBefore: true, resourceAmount: 500 },
  dirt:             { name: "Dirt",       color: '#86653f', walkCost: 1 },   // bara mark (tile.ground), aldrig terrängtyp
  sand:             { name: "Sand",       color: '#c9b887', walkCost: 1.5, resourceAmount: 25, buildable: true },
  clay:             { name: "Clay",       color: '#946b58', walkCost: 3, resourceAmount: 25 },
  limestone:        { name: "Limestone",  color: '#b8b4a5', walkCost: 5, resourceAmount: 25 },

  // Skog och växter
  tree:             { name: "Tree",           color: '#2f5a35', walkCost: 2, fallbackShape: 'tree', resourceAmount: 10, sandImage: 'images/terrain/palm.png' },
  apple_tree:       { name: "Apple tree",     color: '#536c38', walkCost: 3, fallbackShape: 'tree', resourceAmount: 12 },
  berry_bush:       { name: "Berry bush",     color: '#465c35', walkCost: 2, resourceAmount: 10 },
  herbs:            { name: "Herbs",          color: '#526b40', walkCost: 1, resourceAmount: 5 },
  mushrooms:        { name: "Mushrooms",      color: '#49354e', walkCost: 1, resourceAmount: 5 }, 
  bog:              { name: "Bog",            color: '#394b3c', walkCost: 20, resourceAmount: 10 }, 
  petrified_wood:   { name: "Petrified wood",  color: '#62594c', walkCost: 5, fallbackShape: 'tree', resourceAmount: 10 }, 

  // Sten och malm
  rock:             { name: "Rock",        color: '#666', walkCost: 20, gatherersStopBefore: true, fallbackShape: 'rock', resourceAmount: 15 },
  iron_ore:         { name: "Iron deposit",     color: '#65463f', walkCost: 5, fallbackShape: 'rock', resourceAmount: 38 },
  copper_ore:       { name: "Copper deposit",   color: '#ad704b', walkCost: 5, fallbackShape: 'rock', resourceAmount: 32 }, 
  tin_ore:          { name: "Tin deposit",        color: '#9ba3a5', walkCost: 5, fallbackShape: 'rock', resourceAmount: 32 },
  silver_ore:       { name: "Silver deposit",     color: '#b9c1ca', walkCost: 5, fallbackShape: 'rock', resourceAmount: 32 },
  coal:             { name: "Coal deposit",           color: '#292a30', walkCost: 5, fallbackShape: 'rock', resourceAmount: 38 },
  gold_ore:         { name: "Gold deposit",       color: '#827044', walkCost: 5, fallbackShape: 'rock', resourceAmount: 18 },
  salt_ore:         { name: "Salt deposit",       color: '#d6d0bd', walkCost: 4, fallbackShape: 'rock', resourceAmount: 32 }, 
  sulfur:           { name: "Sulfur deposit",         color: '#d6c83f', walkCost: 4, fallbackShape: 'rock', resourceAmount: 32 }, 
  gemstone:         { name: "Gemstone deposit",       color: '#765aa8', walkCost: 5, fallbackShape: 'rock', resourceAmount: 10 }, 

  // Vatten- och markfyndigheter
  tar_pit:          { name: "Tar Pit",        color: '#302a2b', walkCost: Infinity, resourceAmount: 15 },

  // Ruiner och gravplatser
  ruins:            { name: "Ruins",          color: '#625b61', walkCost: 5, fallbackShape: 'rock', resourceAmount: 5 },
  grave:            { name: "Grave",          color: '#494650', walkCost: 1, resourceAmount: 5 },
  cursed_ground:    { name: "Cursed Ground",    color: '#403348', walkCost: 3, resourceAmount: 8 },

  // Magiska och sällsynta platser
  crystal:          { name: "Crystal",        color: '#aff', walkCost: 3, resourceAmount: 6 },
  moonstone:        { name: "Moonstone",      color: '#ffa', walkCost: 3, resourceAmount: 8 },
  ancient_altar:    { name: "Ancient Altar",    color: '#afa', walkCost: 5, fallbackShape: 'rock', resourceAmount: 5 },
  fallen_star:      { name: "Fallen Star",      color: '#faf', walkCost: 5, fallbackShape: 'rock', resourceAmount: 7 },
  meteor_crater:    { name: "Meteor Crater",    color: '#4c414f', walkCost: 8, fallbackShape: 'rock', resourceAmount: 6 },
};

// Terräng som lämnar bar jord efter sig när den är slut (tile.ground blir 'dirt'): berg, sten, malm, lera och sand
CityBuilder.Config.exposesDirt = new Set(['mountain', 'rock', 'clay', 'limestone', 'sand', 'iron_ore', 'copper_ore', 'tin_ore', 'silver_ore', 'coal', 'gold_ore', 'salt_ore', 'sulfur', 'gemstone', 'crystal', 'moonstone']);
