/* Spelets skript i laddningsordning. Delas av sidan (index.html laddar dem i den här ordningen) och av service workern (sw.js
   förladdar dem, så att spelet startar utan nät). Nytt skript: lägg till det här, inget annat ställe. */
self.GAME_SCRIPTS = [
  // 1. Kärna
  'js/core/namespace.js',
  'js/core/errors.js',
  'js/core/util.js',
  'js/core/players.js',
  'js/core/commands.js',
  'js/core/heap.js',
  'js/core/assets.js',
  'js/core/save.js',
  // 2. Konfiguration
  'js/config/settings.js',
  'js/config/resources.js',
  'js/config/terrain.js',
  'js/config/units.js',
  'js/config/buildings.js',
  'js/config/world.js',
  'js/config/ai.js',
  'js/config/levels.js',
  'js/config/changelog.js',
  'js/config/finalize.js',
  // 3. Language and options
  'js/lang/zh.js',
  'js/lang/ja.js',
  'js/lang/ru.js',
  'js/lang/pt.js',
  'js/lang/ar.js',
  'js/lang/lang.js',
  'js/options.js',
  'js/custommap.js',
  // 4. Värld
  'js/world/generator.js',
  'js/world/world.js',
  // 5. Spelsystem
  'js/systems/pathfinding.js',
  'js/systems/economy.js',
  'js/systems/jobs.js',
  'js/systems/behaviors.js',
  'js/systems/garrison.js',
  'js/systems/logistics.js',
  'js/systems/units.js',
  'js/systems/construction.js',
  'js/systems/production.js',
  'js/systems/spells.js',
  'js/systems/pathdecay.js',
  'js/systems/vision.js',
  'js/systems/animals.js',
  'js/systems/weather.js',
  'js/systems/combat.js',
  'js/systems/ai.js',
  // 6. Rendering, indata, UI
  'js/render/shapes.js',
  'js/render/renderer.js',
  'js/render/layers.js',
  'js/input.js',
  'js/systems/sound.js',
  'js/ui.js',
  'js/minimap.js',
  // 7. Spelloop (Sista steg innan init)
  'js/game.js'
];
