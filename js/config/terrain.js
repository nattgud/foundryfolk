/* Terrängtyper.
   walkCost: gångkostnad (Infinity = blockerar).
   resourceAmount: mängd som kan utvinnas.
   gatherersStopBefore: samlare stannar bredvid rutan.
   fallbackShape: reservform i CityBuilder.Shapes.
   image utelämnas -> images/terrain/<id>.png */

CityBuilder.Config.terrain = {
  // Grundterräng
  grass:            { name: "Grass",      color: '#2f5a35', walkCost: 1, resourceAmount: 0 },
  mountain:         { name: "Mountain",   color: '#aaa',    walkCost: Infinity, resourceAmount: 1 },
  water:            { name: "Water",      color: '#2b5d86', walkCost: Infinity, resourceAmount: 500 },
  sand:             { name: "Sand",       color: '#c9b887', walkCost: 2, resourceAmount: 25 },
  clay:             { name: "Clay",       color: '#946b58', walkCost: 3, resourceAmount: 25 },
  limestone:        { name: "Limestone",  color: '#b8b4a5', walkCost: 5, resourceAmount: 25 },

  // Skog och växter
  tree:             { name: "Tree",           color: '#2f5a35', walkCost: 3, fallbackShape: 'tree', resourceAmount: 10 },
  apple_tree:       { name: "Apple tree",     color: '#536c38', walkCost: 3, fallbackShape: 'tree', resourceAmount: 15 },
  berry_bush:       { name: "Berry bush",     color: '#465c35', walkCost: 2, resourceAmount: 25 },
  herbs:            { name: "Herbs",          color: '#526b40', walkCost: 1, resourceAmount: 30 },
  mushrooms:        { name: "Mushrooms",      color: '#49354e', walkCost: 1, resourceAmount: 25 }, 
  bog:              { name: "Bog",            color: '#394b3c', walkCost: 20, resourceAmount: 10 }, 
  petrified_wood:   { name: "Petrified wood",  color: '#62594c', walkCost: 5, fallbackShape: 'tree', resourceAmount: 10 }, 

  // Sten och malm
  rock:             { name: "Rock",        color: '#666', walkCost: 20, gatherersStopBefore: true, fallbackShape: 'rock', resourceAmount: 15 },
  iron_ore:         { name: "Iron deposit",     color: '#65463f', walkCost: 5, fallbackShape: 'rock', resourceAmount: 30 },
  copper_ore:       { name: "Copper deposit",   color: '#ad704b', walkCost: 5, fallbackShape: 'rock', resourceAmount: 25 }, 
  tin_ore:          { name: "Tin deposit",        color: '#9ba3a5', walkCost: 5, fallbackShape: 'rock', resourceAmount: 25 },
  silver_ore:       { name: "Silver deposit",     color: '#b9c1ca', walkCost: 5, fallbackShape: 'rock', resourceAmount: 25 },
  coal:             { name: "Coal deposit",           color: '#292a30', walkCost: 5, fallbackShape: 'rock', resourceAmount: 30 },
  gold_ore:         { name: "Gold deposit",       color: '#827044', walkCost: 5, fallbackShape: 'rock', resourceAmount: 15 },
  salt_ore:         { name: "Salt deposit",       color: '#d6d0bd', walkCost: 4, fallbackShape: 'rock', resourceAmount: 25 }, 
  sulfur:           { name: "Sulfur deposit",         color: '#d6c83f', walkCost: 4, fallbackShape: 'rock', resourceAmount: 25 }, 
  gemstone:         { name: "Gemstone deposit",       color: '#765aa8', walkCost: 5, fallbackShape: 'rock', resourceAmount: 8 }, 

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
  meteor_crater:    { name: "Meteor Crater",    color: '#4c414f', walkCost: 5, fallbackShape: 'rock', resourceAmount: 6 },
};