/* Changelog: en rad per version, nyast överst. Texten visas för spelaren (bara engelska) första gången en ny version startas.
   Versionsnumret jämförs som decimaltal i sista delen (0.4.2 = 0.4.20, och är alltså senare än 0.4.18). */
(function (CityBuilder) {
  'use strict';

  CityBuilder.Changelog = {
    '0.4.411': [
      'Minimap: when a gathering building is selected, the resources it can use now glow with a light edge, so dark resources are easy to see too',
    ],
    '0.4.410': [
      'Smoother zooming and panning: the fog of war is no longer rebuilt every frame, which also removes the small hitches that came a couple of times per second',
    ],
    '0.4.409': [
      'Fog of war in combat: soldiers only attack what their side can see. Rivals no longer know where you are: they remember what they have seen, build watchtowers outward to search, and aim at where they first meet you',
    ],
    '0.4.408': [
      'Fog of war: you only see what is near your buildings and units, and explored ground fades back into fog after a while. You cannot build in the fog',
      'New building: Watchtower, which sees far. Deer are only simulated where someone can see them',
    ],
    '0.4.407': [
      'Smoother loading bar that follows world creation, and scripts now load in parallel',
    ],
    '0.4.406': [
      'Islands are now reachable over natural sandbars, and the terrain is drawn from cached tiles for a faster frame rate',
    ],
    '0.4.405': [
      'No more ore stranded on tiny islands or in water, and one-tile-wide streams now have shallow crossings',
    ],
    '0.4.402': [
      'Faster simulation: path wear only visits worn tiles, deer activation and terrain noise are cheaper',
    ],
    '0.4.401': [
      'Buildings and units outside the screen are no longer drawn',
    ],
    '0.4.400': [
      'World generation: less water and more open grass around both bases, and rival bases are placed on buildable land',
      'Each level now makes sure both bases have the raw materials its new buildings and goals need within reach',
    ],
    '0.4.399': [
      'Carriers that cannot reach a far-away building now leave the goods in a closer warehouse, or skip the delivery',
    ],
    '0.4.398': [
      'Fixed carriers failing to deliver to far-away buildings such as outpost guard towers',
    ],
    '0.4.397': [
      'Rival bases can now be attacked: destroy a rival\'s base to win the level, lose yours and the level is lost',
      'Levels 10-15 train you for combat, levels 16 and up are attack missions (destroy buildings, defeat units, wipe out the rival)',
      'The rival attacks from level 16 and gets a little faster on every level',
      'New building: Wall. Buildings can only be placed within 35 tiles of your other buildings',
      'Rival soldiers and buildings are shown in red on the minimap',
      'Bases are placed with similar resource distances for every player, joined by a land road',
      'The clock now shows hours',
    ],
    '0.4.396': [
      'Every level now has a computer-controlled rival with its own base about 100-150 tiles away',
      'The rival builds, gathers, crafts and trains soldiers with the same rules and resource chains as you',
      'Each player now has separate storage, carriers and supplies',
    ],
    '0.4.395': [
      'Guard Towers and Garrisons can now be set to Attack mode: soldiers hunt down enemies up to 75 tiles away',
      'Buildings now have health and can be destroyed in combat',
      'Soldiers also attack enemy workers and carriers, which are replaced after a while',
    ],
    '0.4.393': [
      'Military: build Guard Towers and Garrisons that train Swordsmen, Archers and Knights',
      'Soldiers wait inside their building, attack enemies that come within range, and return when the area is clear',
      'New workshops for weapons and armor (Swordsmith, Bowyer, Leatherworker, Armorsmith) and a Horse Breeder for Knights',
      'Every unit and building now belongs to a player',
    ],
    '0.4.28': [
      "Added background music",
	  "Cleaned up assets",
	  "Various bugfixes"
    ],
    '0.4.22': [
      'Grass paths now cut through rough terrain, so carriers can reach far-away places',
      'Forests, meadows and resources are spread out more evenly across the map',
      'Worn paths are only drawn on grass',
      'Added this changelog and the version number in the main menu',
    ],
    '0.4.21': [
      'Loading bar when the game and new levels start',
    ],
    '0.4.2': [
      'Game renamed to Foundryfolk',
      'Restart level from the main menu, and a Next level button in the goal panel',
      'Carriers now prioritise scarce resources and buildings with full stock',
      'Hunters now deliver everything they produce, like both meat and leather',
      'Custom sounds and music can be configured',
      'Many bug fixes',
    ],
    '0.4.18': [
      'Sound effects and music, with volume and on/off settings',
      'Level progression: levels with goals, par time, stars and new buildings that unlock as you advance',
      'Storage limits per resource, with new Large Warehouse and Great Depot buildings',
      'Resource counters turn orange when storage is full',
      'Faster pathfinding for large numbers of units',
      'Fixes for buildings stuck with full stock',
    ],
    '0.4.17': [
      'New Sawmill and Planter buildings',
      'Smoother, rounded worn paths',
      'World generation and terrain fixes',
    ],
    '0.4.11': [
      'Settings menu with statistics, language selection (English, Swedish, German, Spanish) and an FPS limit',
      'Autosave and five manual save slots',
      'Status icons above buildings that need attention',
      'The game pauses when the window loses focus',
      'Optimizations and balance changes',
    ],
    '0.4.09': [
      'Fishing hut: catch fish from the water',
      'Deer spread plants more carefully, and only onto grass',
    ],
    '0.4.08': [
      'Hunter cottage: hunt deer for meat and leather',
    ],
    '0.4.02': [
      'Interface fixes',
    ],
    '0.4.0': [
      'Deer roam the world and spread trees and berries, herbs and mushrooms',
    ],
    '0.3.86': [
      'Map fixes',
      'Level system groundwork',
    ],
    '0.3.85': [
      'Mountains with ore deposits, and better world generation',
      'New Gemstone mine',
      'Texture fixes',
    ],
    '0.3.8': [
      'New Rock crusher',
      'Minimap and interface fixes',
    ],
    '0.3.7': [
      'Minimap',
      'Worn paths fade when nobody walks on them',
      'Meteor craters and fallen stars in the world',
    ],
  };
})(window.CityBuilder);