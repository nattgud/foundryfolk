/* Resurser.
   image utelämnas -> images/resources/<id>.png används (se finalize.js).
   Alla resurser ska ha en insamlingskälla eller ett produktionsrecept. */

CityBuilder.Config.resources = {
  // Grundmaterial och byggmaterial
  wood:             { name: 'Wood',             color: '#a0703c' },
  plank:            { name: 'Plank',            color: '#e0b878' },
  stone:            { name: 'Stone',            color: '#9aa5ad' },
  clay:             { name: 'Clay',             color: '#b0825a' },
  sand:             { name: 'Sand',             color: '#c9b887' },
  limestone:        { name: 'Limestone',        color: '#b8b4a5' },
  glass:            { name: 'Glass',            color: '#a9d6dc' },
  brick:            { name: 'Brick',            color: '#b97a45' },
  straw:            { name: 'Straw',            color: '#d6c66e' },
  tar:              { name: 'Tar',              color: '#3b3033' },
  charcoal:         { name: 'Charcoal',         color: '#45454a' },
  ash:              { name: 'Ash',              color: '#888681' },

  // Jordbruk och växtresurser
  grain:            { name: 'Grain',            color: '#e8d44d' },
  meat:             { name: 'Meat',             color: '#b8434d' },
  seeds:            { name: 'Seeds',            color: '#8c7545' },
  flour:            { name: 'Flour',            color: '#f2f2f2' },
  apples:           { name: 'Apples',           color: '#9ccc4f' },
  berries:          { name: 'Berries',          color: '#4f6fcf' },
  mushrooms:        { name: 'Mushrooms',        color: '#a58a79' },
  herbs:            { name: 'Herbs',            color: '#719650' },

  // Mat och dryck
  water:            { name: 'Water',             color: '#00aaff' },
  bread:            { name: 'Bread',             color: '#d98a3d' },
  meal:             { name: 'Meal',              color: '#c98c5a' },
  fish:             { name: 'Fish',              color: '#6f9cae' },
  salt:             { name: 'Salt',              color: '#e5e1d7' },

  // Djurprodukter
  animal:           { name: 'Animal',         color: '#9a8065' },
  leather:          { name: 'Leather',           color: '#8a5f3a' },
  bone:             { name: 'Bone',               color: '#d8d0b8' },

  // Malmer och mineraler
  iron_ore:         { name: 'Iron Ore',           color: '#7b6f6a' },
  copper_ore:       { name: 'Copper Ore',         color: '#c87f35' },
  tin_ore:          { name: 'Tin Ore',            color: '#9ba3a5' },
  coal:             { name: 'Coal',               color: '#34363d' },
  gold_ore:         { name: 'Gold Ore',            color: '#827044' },
  silver_ore:       { name: 'Silver Ore',          color: '#b9c1ca' },
  gemstone:         { name: 'Gemstone',            color: '#5b6' },
  salt_ore:         { name: 'Salt Ore',            color: '#d6d0bd' },
  sulfur:           { name: 'Sulfur',              color: '#d6c83f' },

  // Metaller och metallkomponenter
  iron:             { name: 'Iron',                color: '#7a8fb5' },
  copper:           { name: 'Copper',              color: '#d08a3a' },
  tin:              { name: 'Tin',                 color: '#aeb8bb' },
  bronze:           { name: 'Bronze',              color: '#a87949' },
  steel:            { name: 'Steel',               color: '#8997a7' },
  silver:           { name: 'Silver',              color: '#c5cbd4' },
  gold:             { name: 'Gold',                color: '#d9b642' },

  // Verktyg
  hammer:           { name: 'Hammer',              color: '#aab4bd' },
  pickaxe:          { name: 'Pickaxe',              color: '#8fa3b5' },
  axe:              { name: 'Axe',                  color: '#c2b8ad' },
  scythe:           { name: 'Scythe',               color: '#a6b8a8' },
  shovel:           { name: 'Shovel',               color: '#b2a18a' },
  saw:              { name: 'Saw',                  color: '#aeb6bd' },
  knife:            { name: 'Knife',                color: '#b9c1ca' },

  potion:           { name: 'Potion',               color: '#895ba6' },

  // Vapen och rustningar (används för att träna soldater, se config/units.js)
  sword:            { name: 'Sword',                color: '#d5dbe1' },
  bow:              { name: 'Bow',                  color: '#9a6b3c' },
  leather_armor:    { name: 'Leather Armor',        color: '#947046' },
  iron_armor:       { name: 'Iron Armor',           color: '#8f9bb0' },

  // Hästar föds upp och krävs för riddare
  horse:            { name: 'Horse',                color: '#7a5636' },

  // Magiska och förbannade resurser
  crystal:          { name: 'Crystal',              color: '#675080' },
  moonstone:        { name: 'Moonstone',            color: '#8b91b8' },
  cursed_ash:       { name: 'Cursed Ash',            color: '#51465e' },
  ancient_relic:    { name: 'Ancient Relic',         color: '#a18a68' },
  fallen_star:      { name: 'Fallen Star',           color: '#8d6b9c' },
  enchanted_wood:   { name: 'Enchanted Wood',        color: '#55765a' },
  talisman:         { name: 'Talisman',              color: '#e6d9a2' },

  // Handel och lyxvaror
  coins:            { name: 'Coins',                color: '#c9a746' },
};