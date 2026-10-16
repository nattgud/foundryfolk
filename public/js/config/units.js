/* Enhetstyper.
   isHauler: tar logistikuppdrag. wearsPaths: trampar upp stigar. speedMultiplier: gånghastighet.
   fallbackShape/fallbackSize/color = reservgrafik, imageSize = bildstorlek i pixlar. */
CityBuilder.Config.units = {
  carrier: {
    isHauler: true, 
    wearsPaths: true, 
    speedMultiplier: 1, 
    color: '#4fd1e8', 
    fallbackShape: 'square', 
    fallbackSize: 8, 
    imageSize: 16,
    image: 'images/units/carrier.png', 
    imageCarrying: 'images/units/carrier_loaded.png', 
  },
  deer: {
    isHauler: false, 
    wearsPaths: false, 
    speedMultiplier: 0.5, 
    color: '#760', 
    fallbackShape: 'circle', 
    fallbackSize: 6, 
    imageSize: 16,
    deerBreedCooldown: 0,
    image: 'images/units/deer.png', 
  },
  // warrior: {
  //   isHauler: false,
  //   wearsPaths: true,
  //   speedMultiplier: 1,
  //   color: '#4fd1e8',
  //   fallbackShape: 'square',
  //   fallbackSize: 8,
  //   imageSize: 16,
  //   image: 'images/units/carrier.png',
  //   imageCarrying: 'images/units/carrier_loaded.png',

  //   isSoldier: true,
  //   searchRadius: 10,
  //   attackRange: 1,
  //   attackDamage: 1,
  //   attackCooldown: 1,
  // },
  worker:  {
    speedMultiplier: 1,
    color: '#ffffff',
    fallbackShape: 'circle',
    fallbackSize: 5,
    imageSize: 16,
    imagesByBuilding: {
      woodcutter:  { image: 'images/units/worker_lumberjack.png', imageCarrying: 'images/units/worker_lumberjack_carry.png' },
      sawmill:     { image: 'images/units/worker_grey.png', imageCarrying: 'images/units/worker_grey_carry.png' },

      farm:        { image: 'images/units/worker_farmer.png', imageCarrying: 'images/units/worker_farmer_carry.png' },
      hunters_cottage:  { image: 'images/units/hunter.png', imageCarrying: 'images/units/hunter_carry.png' },
      apple_gatherer:   { image: 'images/units/worker_picker.png', imageCarrying: 'images/units/worker_picker_carry.png' },
      berry_gatherer:   { image: 'images/units/worker_picker.png', imageCarrying: 'images/units/worker_picker_carry.png' },
      herb_gatherer:    { image: 'images/units/worker_picker.png', imageCarrying: 'images/units/worker_picker_carry.png' },
      mushroom_gatherer:{ image: 'images/units/worker_picker.png', imageCarrying: 'images/units/worker_picker_carry.png' },

      well:         { image: 'images/units/worker_blue.png', imageCarrying: 'images/units/worker_blue_carry.png' },
      sand_collector:   { image: 'images/units/worker_digger.png', imageCarrying: 'images/units/worker_digger_carry.png' },
      clay_pit:     { image: 'images/units/worker_grey.png', imageCarrying: 'images/units/worker_grey_carry.png' },

      limestone_quarry: { image: 'images/units/worker_digger.png', imageCarrying: 'images/units/worker_digger_carry.png' },
      quarry: { image: 'images/units/worker_digger.png', imageCarrying: 'images/units/worker_digger_carry.png' },

      iron_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      copper_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      tin_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      coal_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      gold_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      silver_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      salt_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      sulfur_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },
      gemstone_mine: { image: 'images/units/worker_miner.png', imageCarrying: 'images/units/worker_miner_carry.png' },

      mill: { image: 'images/units/worker_baker.png', imageCarrying: 'images/units/worker_baker_carry.png' },
      bakery: { image: 'images/units/worker_baker.png', imageCarrying: 'images/units/worker_baker_carry.png' },
      brickworks: { image: 'images/units/worker_red.png', imageCarrying: 'images/units/worker_red_carry.png' },

      iron_smelter: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },
      copper_smelter: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },
      tin_smelter: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },
      bronze_foundry: { image: 'images/units/worker_smelter.png', imageCarrying: 'images/units/worker_smelter_carry.png' },

      charcoal_burner: { image: 'images/units/worker_digger.png', imageCarrying: 'images/units/worker_digger_carry.png' },

      hammersmith: { image: 'images/units/worker_blacksmith.png', imageCarrying: 'images/units/worker_blacksmith_carry.png' },
      picksmith: { image: 'images/units/worker_blacksmith.png', imageCarrying: 'images/units/worker_blacksmith_carry.png' },
      axesmith: { image: 'images/units/worker_blacksmith.png', imageCarrying: 'images/units/worker_blacksmith_carry.png' },
      scythesmith: { image: 'images/units/worker_blacksmith.png', imageCarrying: 'images/units/worker_blacksmith_carry.png' },
      
      crystal_gatherer: { image: 'images/units/worker_collector.png', imageCarrying: 'images/units/worker_collector_carry.png' },
      moonstone_gatherer: { image: 'images/units/worker_mystic.png', imageCarrying: 'images/units/worker_mystic_carry.png' },
      relic_hunter: { image: 'images/units/worker_adventurer.png', imageCarrying: 'images/units/worker_adventurer_carry.png' },
      fallen_star_collector: { image: 'images/units/worker_mystic.png', imageCarrying: 'images/units/worker_mystic_carry.png' },
    },
  },
};
