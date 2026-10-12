/* Terrängtyper.
   walkCost: gångkostnad (Infinity = blockerar).
   resourceAmount: mängd som kan utvinnas.
   gatherersStopBefore: samlare stannar bredvid rutan.
   fallbackShape: reservform i CityBuilder.Shapes.
   image utelämnas -> images/terrain/<id>.png */

CityBuilder.Config.terrain = {
  // Grundterräng
  grass:            { name: "Grass",      color: '#2f5a35', walkCost: 1, resourceAmount: 0 }, // No resource if not specified
  water:            { name: "Water",      color: '#2b5d86', walkCost: Infinity, resourceAmount: 500 }, // Reduced from 500
  sand:             { name: "Sand",       color: '#c9b887', walkCost: 2, resourceAmount: 25 }, // Increased slightly
  clay:             { name: "Clay",       color: '#946b58', walkCost: 3, resourceAmount: 25 }, // Increased slightly
  limestone:        { name: "Limestone",  color: '#b8b4a5', walkCost: 5, resourceAmount: 25 }, // Increased slightly

  // Skog och växter
  tree:             { name: "Tree",           color: '#2f5a35', walkCost: 3, fallbackShape: 'tree', resourceAmount: 10 }, // Adjusted to 12 (10-15 range)
  apple_tree:       { name: "Apple tree",     color: '#536c38', walkCost: 3, fallbackShape: 'tree', resourceAmount: 15 }, // Adjusted to 15
  berry_bush:       { name: "Berry bush",     color: '#465c35', walkCost: 2, resourceAmount: 25 }, // Increased to 25
  herbs:            { name: "Herbs",          color: '#526b40', walkCost: 1, resourceAmount: 30 }, // Increased to 30
  mushrooms:        { name: "Mushrooms",      color: '#49354e', walkCost: 1, resourceAmount: 25 }, // Increased to 25
  bog:              { name: "Bog",            color: '#394b3c', walkCost: 20, resourceAmount: 10 }, // Kept low
  petrified_wood:   { name: "Petrified wood",  color: '#62594c', walkCost: 5, fallbackShape: 'tree', resourceAmount: 10 }, // Adjusted to 10

  // Sten och malm
  rock:             { name: "Rock",        color: '#666', walkCost: 20, gatherersStopBefore: true, fallbackShape: 'rock', resourceAmount: 15 }, // Increased slightly
  iron_ore:         { name: "Iron Ore",     color: '#65463f', walkCost: 5, fallbackShape: 'rock', resourceAmount: 30 }, // Increased to 30
  copper_ore:       { name: "Copper Ore",   color: '#ad704b', walkCost: 5, fallbackShape: 'rock', resourceAmount: 25 }, // Increased to 25
  tin_ore:          { name: "Tin Ore",        color: '#9ba3a5', walkCost: 5, fallbackShape: 'rock', resourceAmount: 25 }, // Increased to 25
  silver_ore:       { name: "Silver Ore",     color: '#b9c1ca', walkCost: 5, fallbackShape: 'rock', resourceAmount: 25 }, // Increased to 25
  coal:             { name: "Coal",           color: '#292a30', walkCost: 5, fallbackShape: 'rock', resourceAmount: 30 }, // Increased to 30
  gold_ore:         { name: "Gold Ore",       color: '#827044', walkCost: 5, fallbackShape: 'rock', resourceAmount: 15 }, // Increased to 15
  salt_ore:         { name: "Salt Ore",       color: '#d6d0bd', walkCost: 4, fallbackShape: 'rock', resourceAmount: 25 }, // Increased to 25
  sulfur:           { name: "Sulfur",         color: '#d6c83f', walkCost: 4, fallbackShape: 'rock', resourceAmount: 25 }, // Increased to 25
  gemstone:         { name: "Gemstone",       color: '#765aa8', walkCost: 5, fallbackShape: 'rock', resourceAmount: 8 }, // Reduced to 8

  // Vatten- och markfyndigheter
  tar_pit:          { name: "Tar Pit",        color: '#302a2b', walkCost: Infinity, resourceAmount: 15 }, // Kept as is (Semi-uncommon)

  // Ruiner och gravplatser
  ruins:            { name: "Ruins",          color: '#625b61', walkCost: 5, fallbackShape: 'rock', resourceAmount: 5 }, // Increased to 5
  grave:            { name: "Grave",          color: '#494650', walkCost: 1, resourceAmount: 5 }, // Increased to 5
  cursed_ground:    { name: "Cursed Ground",    color: '#403348', walkCost: 3, resourceAmount: 8 }, // Increased to 8

  // Magiska och sällsynta platser
  crystal:          { name: "Crystal",        color: '#675080', walkCost: 3, resourceAmount: 6 }, // Increased to 6
  moonstone:        { name: "Moonstone",      color: '#8b91b8', walkCost: 3, resourceAmount: 8 }, // Increased to 8
  ancient_altar:    { name: "Ancient Altar",    color: '#65516f', walkCost: 5, fallbackShape: 'rock', resourceAmount: 5 }, // Increased to 5
  fallen_star:      { name: "Fallen Star",      color: '#8d6b9c', walkCost: 5, fallbackShape: 'rock', resourceAmount: 7 }, // Increased to 7
  meteor_crater:    { name: "Meteor Crater",    color: '#4c414f', walkCost: 5, fallbackShape: 'rock', resourceAmount: 6 }, // Adjusted to 6 (5-10 range)
};