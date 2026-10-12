/* Resurser.
   image utelämnas -> images/resources/<id>.png används (se finalize.js).
   Alla resurser ska ha en insamlingskälla eller ett produktionsrecept. */

CityBuilder.Config.resources = {
  // Grundmaterial och byggmaterial
  wood:             { name: 'Wood',             color: '#a0703c' },
  plank:            { name: 'Plank',            color: '#e0b878' },
  stone:            { name: 'Stone',            color: '#9aa5ad' },
  clay:             { name: 'Clay',             color: '#946b58' },
  sand:             { name: 'Sand',             color: '#c9b887' },
  limestone:        { name: 'Limestone',        color: '#b8b4a5' },
  brick:            { name: 'Brick',            color: '#ad604b' },
  straw:            { name: 'Straw',            color: '#d6c66e' },
  tar:              { name: 'Tar',              color: '#302a2b' },
  charcoal:         { name: 'Charcoal',         color: '#38383b' },
  ash:              { name: 'Ash',              color: '#888681' },

  // Jordbruk och växtresurser
  grain:            { name: 'Grain',            color: '#e8d44d' },
  seeds:            { name: 'Seeds',            color: '#8c7545' },
  flour:            { name: 'Flour',            color: '#f2f2f2' },
  apples:           { name: 'Apples',           color: '#bd4938' },
  berries:          { name: 'Berries',          color: '#9d426b' },
  mushrooms:        { name: 'Mushrooms',        color: '#a58a79' },
  herbs:            { name: 'Herbs',            color: '#719650' },

  // Mat och dryck
  water:            { name: 'Water',             color: '#00aaff' },
  bread:            { name: 'Bread',             color: '#d98a3d' },
  fish:             { name: 'Fish',              color: '#6f9cae' },
  salt:             { name: 'Salt',              color: '#e5e1d7' },

  // Djurprodukter
  animal:           { name: 'Animal',         color: '#9a8065' },
  leather:          { name: 'Leather',           color: '#70452f' },
  bone:             { name: 'Bone',               color: '#d8d0b8' },

  // Malmer och mineraler
  iron_ore:         { name: 'Iron Ore',           color: '#65463f' },
  copper_ore:       { name: 'Copper Ore',         color: '#ad704b' },
  tin_ore:          { name: 'Tin Ore',            color: '#9ba3a5' },
  coal:             { name: 'Coal',               color: '#292a30' },
  gold_ore:         { name: 'Gold Ore',            color: '#827044' },
  silver_ore:       { name: 'Silver Ore',          color: '#b9c1ca' },
  salt_ore:         { name: 'Salt Ore',            color: '#d6d0bd' },
  sulfur:           { name: 'Sulfur',              color: '#d6c83f' },
  gemstone:         { name: 'Gemstone',            color: '#765aa8' },

  // Metaller och metallkomponenter
  iron:             { name: 'Iron',                color: '#7a8fb5' },
  copper:           { name: 'Copper',              color: '#c47b51' },
  tin:              { name: 'Tin',                 color: '#aeb8bb' },
  bronze:           { name: 'Bronze',              color: '#a87949' },
  steel:            { name: 'Steel',               color: '#8997a7' },
  silver:           { name: 'Silver',              color: '#c5cbd4' },
  gold:             { name: 'Gold',                color: '#d9b642' },

  // Verktyg
  hammer:           { name: 'Hammer',              color: '#cfd4d8' },
  pickaxe:          { name: 'Pickaxe',              color: '#cfd4d8' },
  axe:              { name: 'Axe',                  color: '#cfd4d8' },
  scythe:           { name: 'Scythe',               color: '#cfd4d8' },
  shovel:           { name: 'Shovel',               color: '#b2a18a' },
  saw:              { name: 'Saw',                  color: '#aeb6bd' },
  knife:            { name: 'Knife',                color: '#b9c1ca' },

  potion:           { name: 'Potion',               color: '#895ba6' },

  // Magiska och förbannade resurser
  crystal:          { name: 'Crystal',              color: '#675080' },
  moonstone:        { name: 'Moonstone',            color: '#8b91b8' },
  cursed_ash:       { name: 'Cursed Ash',            color: '#51465e' },
  ancient_relic:    { name: 'Ancient Relic',         color: '#a18a68' },
  fallen_star:      { name: 'Fallen Star',           color: '#8d6b9c' },
  enchanted_wood:   { name: 'Enchanted Wood',        color: '#55765a' },

  // Handel och lyxvaror
  coins:            { name: 'Coins',                color: '#c9a746' },
};