/* Interface: resource bar, categorized build menu with icons and tooltips, and info panel. The build menu is generated from Config.buildings (category) and CATEGORIES below. */

(function (CityBuilder) {
  'use strict';

  const { Config, Utils, World, Economy, byId } = CityBuilder;
  const t = (text, variables) => CityBuilder.t(text, variables);
  const I18n = () => CityBuilder.I18n;
  // Tyska skriver substantiv med stor bokstav, så där används inte gemener
  const lower = text => (I18n().language === 'de' ? text : text.toLowerCase());

  // Kategorier i menyn. Byggnader väljer kategori med building.category.
  const CATEGORIES = {
    storage: {
      name: 'Storage & logistics',
      symbol: '📦'
    },
    forestry: {
      name: 'Forestry',
      symbol: '🌲'
    },
    farming: {
      name: 'Farming & food',
      symbol: '🌾'
    },
    gathering: {
      name: 'Gathering & raw materials',
      symbol: '🧺'
    },
    mining: {
      name: 'Mining & quarrying',
      symbol: '⛏️'
    },
    processing: {
      name: 'Processing & materials',
      symbol: '⚙️'
    },
    crafting: {
      name: 'Crafting & tools',
      symbol: '🔨'
    },
    trade: {
      name: 'Trade & coinage',
      symbol: '🪙'
    },
    military: {
      name: 'Military',
      symbol: '⚔️'
    },
    magic: {
      name: 'Magic & ancient sites',
      symbol: '✦'
    },
    special: {
      name: 'Special buildings',
      symbol: '★'
    }
  };

  for (const [id, category] of Object.entries(CATEGORIES)) {
    category.image = `images/ui/categories/${id}.png?v=${version}`;
  }

  // Display name for terrain. terrain.name in config/terrain.js takes precedence if available.
  const TERRAIN_NAMES = {
    grass: 'Grass',
    tree: 'Tree',
    rock: 'Stone',
    ore: 'Ore',
    water: 'Water',
  };

  const UI = {
    toastTimer: null,
    openCategoryId: null,
    tooltipElement: null,
    lastBuildingCount: 0,
    inspectedTile: null,     // markerad terrängnod { x, y }
    tooltipOwner: null,      // 'map' (hover över kartan) eller 'button'
    mapTooltipKey: null,
    touchTooltipTimer: null,

    // Resursfält
    resourceFavorites: new Set(),
    resourceWindowOpen: false,
    maxPinnedResources: 10,

    init() {
      const resourceBar = byId('top');
      const buildMenu = byId('bottom');

      this.injectStyles();
      this.initResourceBar(resourceBar);
      this.createMainMenu();
      if (CityBuilder.Options) CityBuilder.Options.install(); // inställningar (FPS-räknare, bilder av/på ...)
      if (CityBuilder.Sound) CityBuilder.Sound.install();     // ljud (effekter och musik)

      this.buildBuildMenu(buildMenu);
      this.initHotkeys();
      this.initMapInspection();
      this.createCopyrightLabel();
      this.createGoalPanel();
      if (CityBuilder.Levels) CityBuilder.Levels.onComplete(result => this.showLevelComplete(result));
      this.lastBuildingCount = World.buildings.filter(placed => placed.player === CityBuilder.Players.HUMAN).length;

      // Infopanelen ligger precis ovanför byggmenyn.
      this.positionInfoPanel = () => {
        byId('info').style.bottom = (buildMenu.offsetHeight + 8) + 'px';
      };

      this.positionInfoPanel();
      addEventListener('resize', this.positionInfoPanel);
      addEventListener('resize', () => { this.goalCheckedAt = 0; });

      // Språket byts direkt: allt som redan är uppritat ritas om
      I18n().onChange(() => this.applyLanguage());
      const intro = () => { const tutorial = this.showTutorialIfNew(); this.showChangelogIfNew(tutorial); };
      if (I18n().needsChoice) this.openLanguagePicker(intro); else intro();
    },

    // Språkval före allt annat, när webbläsarens språk inte finns bland spelets (I18n.needsChoice). Spelet pausas medan rutan är öppen.
    openLanguagePicker(done) {
      const game = CityBuilder.Game, i18n = I18n();
      game.paused = true;
      const overlay = document.createElement('div');
      overlay.id = 'languageOverlay';
      overlay.className = 'resource-window-overlay';
      overlay.style.zIndex = 1001;
      const dialog = document.createElement('section');
      dialog.className = 'resource-window main-menu';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const header = document.createElement('header');
      header.className = 'resource-window-header';
      const title = document.createElement('strong');
      title.textContent = i18n.languages.map(([code, name]) => (({ en: 'Language', sv: 'Språk', de: 'Sprache', es: 'Idioma' })[code] || name)).join(' · ');
      header.appendChild(title);
      const body = document.createElement('div');
      body.className = 'main-menu-body';
      for (const [code, name] of i18n.languages) {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'main-menu-button';
        choice.textContent = name;
        choice.onclick = () => { if (code === i18n.language) i18n.choose(code); else i18n.setLanguage(code); overlay.remove(); game.paused = !!this.mainMenuOpen; done(); };
        body.append(choice);
      }
      dialog.append(header, body);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      body.firstChild.focus();
    },

    // Anropas när språket byts (I18n.onChange)
    applyLanguage() {
      const toggle = byId('resourceWindowToggle');
      if (toggle) toggle.textContent = t('All resources');

      const menuButton = byId('mainMenuButton');
      if (menuButton) {
        menuButton.title = t('Main menu');
        menuButton.setAttribute('aria-label', t('Main menu'));
      }

      const title = byId('resourceWindowTitle');
      if (title) title.textContent = t('Resources');
      const closeResources = document.querySelector('#resourceWindowOverlay .resource-window-close');
      if (closeResources) closeResources.setAttribute('aria-label', t('Close resource window'));
      const dialog = byId('mainMenuDialog');
      if (dialog) dialog.setAttribute('aria-label', t('Main menu'));

      const list = byId('resourceWindowList');
      if (list) {
        list.replaceChildren(...Object.keys(Config.resources).map(id => this.createResourceItem(id)));
        this.updateResourceFavoriteButtons();
      }
      this.renderPinnedResources();
      this.refreshGoals(true);

      // Byggmenyn byggs om. Öppen kategori och vald byggnad behålls.
      const openCategory = this.openCategoryId;
      this.buildBuildMenu(byId('bottom'));
      if (openCategory && this.categorySubmenus.has(openCategory)) this.setOpenCategory(openCategory);
      else this.openCategoryId = null;

      if (this.mainMenuOpen) this.renderMainMenu(this.mainMenuView === 'confirm' ? 'main' : (this.mainMenuView || 'main'));

      byId('info').dataset.buildingId = ''; // infopanelen byggs om
      this.hideTooltip();
      requestAnimationFrame(this.positionInfoPanel);
    },

    // Litet versionsnummer längst ner i högra hörnet
    createCopyrightLabel() {
      if (byId('copyrightLabel')) return;
      const label = document.createElement('div');
      label.id = 'copyrightLabel';
      label.textContent = '© David Andersson';
      document.body.appendChild(label);
    },

    // ---- Mål och banor -----------------------------------------------------------------------

    // 1:05 under en timme, annars 1:02:05
    formatTime(seconds) {
      const total = Math.max(0, Math.round(seconds)), hours = Math.floor(total / 3600);
      const two = value => String(value).padStart(2, '0');
      return hours ? `${hours}:${two(Math.floor(total % 3600 / 60))}:${two(total % 60)}` : `${Math.floor(total / 60)}:${two(total % 60)}`;
    },
    // 45s, 3m 05s eller 1h 02m
    timeLeft(building) {
      const s = Math.ceil((1 - building.buildProgress) * building.definition.buildDuration);
      if (s < 60) return `${s}s`;
      return s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
    },

    createGoalPanel() {
      if (byId('goalPanel')) return;
      const panel = document.createElement('div');
      panel.id = 'goalPanel';
      panel.addEventListener('click', event => {
        if (event.target.closest('[data-next]')) CityBuilder.Levels.advance(); // "Nästa bana" när banan är klar
        else panel.classList.toggle('collapsed');
      });
      document.body.appendChild(panel);
    },

    // Texten för ett mål, t.ex. "Bygg Såg: 1/2"
    goalText(item) {
      const numbers = { have: item.have, need: item.amount };
      switch (item.type) {
        case 'build': return t('Build {name}: {have}/{need}', { name: this.buildingName(item.id), ...numbers });
        case 'soldiers': return t('Train soldiers: {have}/{need}', numbers);
        case 'kills': return t('Defeat enemy units: {have}/{need}', numbers);
        case 'destroy': return item.id === 'any' ? t('Destroy enemy buildings: {have}/{need}', numbers) : t('Destroy enemy {name}: {have}/{need}', { name: lower(this.buildingName(item.id)), ...numbers });
        case 'eliminate': return item.amount > 1 ? t('Destroy the enemy bases: {have}/{need}', numbers) : t('Destroy the enemy base');
        // Ikon och namn: ikonen ensam kan misstolkas (lerblocket såg ut som en limpa)
        default: return t('Store {name}: {have}/{need}', { name: this.resourceChip(item.resource) + ' ' + this.resourceName(item.resource), ...numbers });
      }
    },

    // Målpanelen under resursfältet. Ritas bara om när texten ändras.
    refreshGoals(force = false) {
      const Levels = CityBuilder.Levels, panel = byId('goalPanel');
      if (!Levels || !panel) return;
      const now = performance.now();
      if (!force && now - (this.goalCheckedAt || 0) < 500) return;
      this.goalCheckedAt = now;

      const level = Levels.current;
      const lines = Levels.progress().map(item => {
        const text = this.goalText(item);
        return `<div class="goal-item${item.done ? ' done' : ''}">${item.done ? '✔' : '☐'} ${text}</div>`;
      });
      const unlocks = level.unlocks.map(id => this.buildingName(id)).join(', ');
      const header = level.custom
        ? (Levels.completed ? `<b>${t('Victory!')}</b>` : `<b>${t('Goals')}</b> · ${t('Time: {time}', { time: this.formatTime(Levels.seconds) })}`)
        : Levels.completed
          ? `<b>${t('Level complete!')}</b> ${'★'.repeat(Levels.stars)} <button type="button" data-next class="goal-next">${t('Next level')}</button>`
          : `<b>${t('Goals')}</b> · ${t('Time: {time} (target {target})', { time: this.formatTime(Levels.seconds), target: this.formatTime(level.goal.par) })}`;
      const html = `<div class="goal-header">${header}</div>${lines.join('')}` + (unlocks ? `<div class="goal-new">${t('New: {list}', { list: unlocks })}</div>` : '');

      if (panel.dataset.html !== html) {
        panel.dataset.html = html;
        panel.innerHTML = html;
      }
      this.layoutGoals();
    },

    // Målpanelen får plats mellan resursfältet och det som ligger längst ner (infopanelen eller byggmenyn).
    // Lämnar en rad under panelen åt FPS-räknaren. Räknas om vid storleksändring och när byggmenyn öppnas.
    layoutGoals() {
      const panel = byId('goalPanel');
      if (!panel) return;
      const top = byId('top').getBoundingClientRect().bottom + 8;
      const info = byId('info');
      const infoTop = info && info.style.display !== 'none' ? info.getBoundingClientRect().top : Infinity;
      const limit = Math.min(infoTop, byId('bottom').getBoundingClientRect().top) - 8 - 18;
      panel.style.top = top + 'px';
      panel.style.maxHeight = Math.max(40, limit - top) + 'px';
      if (CityBuilder.Options) CityBuilder.Options.positionFpsCounter();
    },

    // Handledningar: en sida per del av spelet. Grunderna (basics) visas automatiskt för nya spelare och ska vara korta; resten (advanced) finns i menyn.
    // Varje sida lyser upp det den förklarar (target = CSS-väljare, flera går bra) och kan först öppna en byggkategori (category).
    // mock: en bild av infopanelen för det som inte syns förrän man markerat en byggnad.
    TUTORIAL: {
      basics: [
        { title: 'Welcome', lines: ['Welcome to Foundryfolk! You build a settlement: gather resources, make goods and grow stronger.', 'Each step lights up the part of the screen it explains.', 'This short guide covers the basics. You can open it again from the menu at any time.'] },
        { title: 'Goals', target: ['#goalPanel'], lines: ['These are your goals for the level. Complete all of them to finish it and unlock new buildings.', 'The goals tell you what to build next. Start with the first one.'] },
        { title: 'Resources', target: ['#top'], lines: ['The top bar shows what you have in store, for example wood, planks and stone.', 'You start with a little. Your buildings make more.'] },
        { title: 'Move and zoom', lines: ['Drag the map to move it.', 'Scroll with the mouse wheel, or pinch with two fingers, to zoom.', 'Tap a building, tree, rock or water to see what it is.'] },
        { title: 'Build menu', target: ['#bottom .build-categories'], category: null, lines: ['The build menu is at the bottom. Each icon is a category of buildings.', 'Tap a category to open it. New buildings unlock as you complete levels.'] },
        { title: 'Place a building', target: ['#build_woodcutter'], category: 'forestry', lines: ['Try it with the highlighted Woodcutter. Tap it to select it, and move the mouse over it to see its cost and what it does.', 'Then tap the ground next to some trees to place it. A preview follows you and shows whether it fits. You can only build near your own buildings, and not in the fog.', 'Tap the building again, or Cancel, to stop placing.'] },
        { title: 'Then let it work', target: ['#mainMenuButton'], lines: ['A finished building works by itself. Workers gather or make goods, and carriers bring them where they are needed. You do not control them.', 'Keep an eye on your goals and build what they ask for. When you want to know more, open the menu here and choose Advanced guide.'] },
      ],
      advanced: [
        { title: 'Resources', target: ['#top'], lines: ['The top bar shows what is in your stores. Tap "All resources" for the full list.', 'A number turns orange when the stores are full for that resource. Build a warehouse for more room.', 'Tap a resource in the list to see which buildings use it and which make it, per minute. Buildings that could use it but do not right now are shown too.', 'The list only shows the resources you can use at your current level. More appear as you unlock buildings.'] },
        { title: 'Minimap', target: ['#minimap', '#minimapMode', '#minimapZoomIn', '#minimapZoomOut'], lines: ['The minimap shows the area around you. The white box is what you see on screen.', 'Use + and − to zoom it, and the small button to change what it shows.', 'Your buildings are coloured squares. Enemies you have spotted are red.', 'A red ring with ! means a gatherer finds nothing to gather. An orange or red ring means the building stands still most of the time. Select a building to ring all buildings of the same type.'] },
        { title: 'Locked or too expensive', target: ['#bottom .building-option'], category: 'gathering', lines: ['A grey button with a dashed border, a stroke and a padlock is locked. Move the mouse over it to see at which level it unlocks. Only the next few levels are shown.', 'A button with a red border is unlocked, but you cannot afford it yet. Move the mouse over it to see the cost.'] },
        { title: 'Hotkeys', target: ['#bottom .build-categories'], category: null, lines: ['Press a number to open a category in the build menu (you can switch category at any time), then a letter on the top row, Q W E R T Y U I O P, to choose a building in it. Esc goes back one step. Hover over a button to see its key.', 'While one of your buildings is selected, the letters control it instead: P pauses, B turns the boost on or off, R changes what it makes, T opens trading, S switches between attack and defence, Z X C V train soldiers, and Delete demolishes (press it twice).'] },
        { title: 'Select, pause and demolish', mock: 'pause', lines: ['Tap one of your buildings on the map to open its panel.', 'Pause stops a building from working. Tap it again to resume.', 'Demolish removes the building and gives back half of its cost.'] },
        { title: 'Imports and exports', mock: 'trade', lines: ['Every building shows what it imports (what carriers bring to it) and what it exports (what carriers fetch from it), even when the stock is empty.', 'A red number means something is missing. A grey number means nothing is waiting right now.'] },
        { title: 'Carriers', target: ['#carrierCount'], lines: ['Carriers move goods between buildings and stores. "Carriers 20/20" means idle/total.', 'You get 1 carrier per building, and more per store: 5 for a warehouse, 10 for a large warehouse and 25 for a great depot.', 'Producers deliver straight to buildings that need their goods. The rest goes to a store, so build warehouses where things are far apart.'] },
        { title: 'Market', lines: ['The Market, which unlocks late in the game, opens a trading window when you tap it.', 'Buy goods for coins, or sell goods for half the price. Choose the amount with ×1, ×5, ×10 or ×25.'] },
        { title: 'Wild animals', lines: ['Deer, moose, foxes and rabbits roam the land and spread berries, herbs and mushrooms. A Hunters Cottage sends a hunter after the nearest animal in range. Every kind of animal gives the same meat and leather.', 'Animals have young faster the fewer there are nearby. You can hunt an area empty for a while, but never a whole region. Animals only live on land you can see.'] },
        { title: 'Speed and menu', target: ['#speedButton', '#mainMenuButton'], lines: ['Change the game speed here.', 'The menu button opens save, load, settings and this guide. You can also start a custom map with your own settings, and use several save slots.'] },
        { title: 'Fog of war', lines: ['Land you have not seen is hidden by fog. Your buildings and units reveal what is near them, and land you leave fades back into fog.', 'You cannot build in the fog, and enemies there are invisible.'] },
        { title: 'Find the enemy', target: ['#build_watchtower'], category: 'military', lines: ['From level 15 a rival base lies 60-90 tiles away in an unknown direction. Find it with Watchtowers: they see far.', 'Build one at the edge of what you can see, then another further out, and so on. Each tower lets you build further out.', 'When a tower spots the enemy, their buildings show up in red on the minimap. Watchtowers unlock on level 3.', 'Enemies wait at least 30 minutes before they attack, and only once they have spotted you.'] },
        { title: 'Train soldiers', target: ['#build_garrison', '#build_guard_tower'], category: 'military', lines: ['Soldiers are trained in a Garrison or a Guard Tower: select the building and pick a soldier type.', 'Each soldier needs weapons and armour, which carriers deliver to the building.'] },
        { title: 'Fight', mock: 'stance', lines: ['Defence mode guards the area. Attack mode hunts down enemies up to 75 tiles away.', 'Soldiers go for enemy soldiers first, then buildings. Destroy the enemy HQ to win.', 'When you are attacked a siren sounds, and a red arrow on the minimap points at the fight for a few seconds.', 'Enemy buildings only show their health, nothing about what they import, export or produce.', 'Soldiers walk like other units. Several soldiers on one tile spread out inside it, and soldiers who fight stand on the same tile.'] },
        { title: 'If something goes wrong', lines: ['If the game hits an unexpected error, a small box appears and the game keeps running. Tap Details to see what happened and copy it into a report.', 'The game saves by itself, and you are told if saving fails. If an old saved game cannot be fully restored, a copy of the original is kept.'] },
      ],
    },

    // Handledningen (spelet pausas medan den är öppen). Varje sida lyser upp det den förklarar.
    openTutorial(kind = 'basics') {
      this.hideTooltip();
      const game = CityBuilder.Game, pages = this.TUTORIAL[kind], categoryBefore = this.openCategoryId;
      game.paused = true;
      let page = 0;
      if (!byId('tutorialStyles')) {
        const style = document.createElement('style');
        style.id = 'tutorialStyles';
        style.textContent = `
          #tutorialSpotlight { position: fixed; z-index: 1000; pointer-events: none; border: 3px solid #ffd23f; border-radius: 8px;
            box-shadow: 0 0 0 9999px rgb(0 0 0 / 62%), 0 0 14px 4px rgb(255 210 63 / 70%); animation: tutorialPulse 1.4s ease-in-out infinite; }
          @keyframes tutorialPulse { 50% { box-shadow: 0 0 0 9999px rgb(0 0 0 / 62%), 0 0 22px 8px rgb(255 210 63 / 95%); } }
          #tutorialOverlay { z-index: 1001; }
          #tutorialOverlay.lit { background: none; }
          #tutorialOverlay .tutorial-next { background: linear-gradient(180deg, #4fc274, #2f9455); border-color: #7be39c; color: #fff; font-weight: 600;
            box-shadow: 0 0 10px rgb(95 220 140 / 45%); }
          #tutorialOverlay .tutorial-next:hover { filter: brightness(1.12); }
          #tutorialOverlay .tutorial-back:disabled { opacity: .45; cursor: default; }
          .tutorial-mock { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 10px; margin: 4px 0;
            background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
          .tutorial-mock .glow { border: 2px solid #ffd23f; animation: tutorialGlow 1.4s ease-in-out infinite; }
          @keyframes tutorialGlow { 50% { box-shadow: 0 0 10px 3px rgb(255 210 63 / 90%); } }`;
        document.head.appendChild(style);
      }
      const spotlight = document.createElement('div');
      spotlight.id = 'tutorialSpotlight';
      const overlay = document.createElement('div');
      overlay.id = 'tutorialOverlay';
      overlay.className = 'resource-window-overlay';
      const dialog = document.createElement('section');
      dialog.className = 'resource-window main-menu';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const header = document.createElement('header');
      header.className = 'resource-window-header';
      const title = document.createElement('strong');
      title.textContent = t(kind === 'basics' ? 'How to play' : 'Advanced guide');
      header.appendChild(title);
      const body = document.createElement('div');
      body.className = 'main-menu-body';
      const footer = document.createElement('footer');
      footer.style.cssText = 'padding:10px 12px;border-top:1px solid var(--line);flex:0 0 auto;display:flex;gap:8px';
      const button = onclick => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'main-menu-button';
        element.onclick = onclick;
        return element;
      };
      let frame = 0;
      const close = () => {
        cancelAnimationFrame(frame); spotlight.remove(); overlay.remove(); removeEventListener('keydown', onKey);
        this.setOpenCategory(categoryBefore ?? null);
        game.paused = !!this.mainMenuOpen;
      };
      const skip = button(close), back = button(() => { page--; render(); });
      const next = button(() => { if (page === pages.length - 1) close(); else { page++; render(); } });
      back.classList.add('tutorial-back'); next.classList.add('tutorial-next');
      skip.style.cssText = 'margin-left:auto;padding:2px 10px;flex:0 0 auto;width:auto';
      header.append(skip);

      // Håller markeringen och dialogen på plats (sidan kan ändra layouten, t.ex. när en byggkategori öppnas)
      const track = () => {
        frame = requestAnimationFrame(track);
        const rects = (pages[page].target || []).flatMap(selector => [...document.querySelectorAll(selector)]).map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
        overlay.classList.toggle('lit', rects.length > 0);
        spotlight.style.display = rects.length ? 'block' : 'none';
        if (!rects.length) { overlay.style.alignItems = ''; return; }
        const left = Math.min(...rects.map(rect => rect.left)) - 6, top = Math.min(...rects.map(rect => rect.top)) - 6;
        const right = Math.max(...rects.map(rect => rect.right)) + 6, bottom = Math.max(...rects.map(rect => rect.bottom)) + 6;
        Object.assign(spotlight.style, { left: left + 'px', top: top + 'px', width: right - left + 'px', height: bottom - top + 'px' });
        overlay.style.alignItems = (top + bottom) / 2 < innerHeight / 2 ? 'end' : 'start'; // dialogen ligger på andra halvan av skärmen
      };

      const render = () => {
        const { title: heading, lines, category, mock } = pages[page];
        this.setOpenCategory(category ?? null);
        body.replaceChildren();
        const add = (className, text) => { const element = document.createElement('div'); element.className = className; element.textContent = text; body.append(element); return element; };
        add('main-menu-level', (page + 1) + '/' + pages.length + ' · ' + t(heading));
        if (mock) { // infopanelen för en vald byggnad, med den knapp som förklaras lysande
          const garrison = mock === 'stance', trade = mock === 'trade';
          const panel = document.createElement('div');
          panel.className = 'tutorial-mock';
          const name = document.createElement('div');
          name.innerHTML = '<b></b><br><span></span>';
          name.firstChild.textContent = this.buildingName(garrison ? 'guard_tower' : trade ? 'sawmill' : 'woodcutter'); name.lastChild.textContent = t(garrison ? 'Training' : 'Working');
          if (trade) { // sågverket: har en stock, inget sågat väntar
            const sawmill = { definition: Config.buildings.sawmill, type: 'sawmill', player: CityBuilder.Players.HUMAN, inputStock: { wood: 1 }, outputStock: {} };
            name.lastChild.insertAdjacentHTML('afterend', this.tradeHtml(sawmill));
          }
          const buttons = document.createElement('div');
          buttons.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end';
          const labels = trade ? [] : garrison ? [[this.unitName('swordsman'), false], [this.unitName('archer'), false], [t('Defence mode'), true]] : [[t('Pause'), true], [t('Demolish'), false]];
          for (const [text, glow] of labels) {
            const element = document.createElement('button');
            element.type = 'button'; element.textContent = text; element.tabIndex = -1;
            if (glow) element.className = 'glow';
            buttons.append(element);
          }
          panel.append(name, buttons);
          body.append(panel);
        }
        for (const text of lines) add('main-menu-note', t(text));
        skip.textContent = t('Skip');
        back.textContent = t('Back'); back.disabled = page === 0;
        next.textContent = page === pages.length - 1 ? t(kind === 'basics' ? 'Start playing' : 'Close') : t('Next');
      };
      const onKey = event => {
        if (event.key === 'Escape') close();
        else if (event.key === 'ArrowRight' && page < pages.length - 1) { page++; render(); }
        else if (event.key === 'ArrowLeft' && page > 0) { page--; render(); }
      };
      addEventListener('keydown', onKey);
      footer.append(back, next);
      dialog.append(header, body, footer);
      overlay.appendChild(dialog);
      document.body.append(spotlight, overlay);
      render();
      track();
      next.focus();
    },

    // Nya spelare (ingen sparad version eller framgång) får handledningen en gång. Returnerar true om den öppnades.
    showTutorialIfNew() {
      let seen = true, played = false;
      try { seen = !!localStorage.getItem('citybuilder.tutorialSeen'); played = !!localStorage.getItem('citybuilder.progress'); } catch (error) {}
      try { localStorage.setItem('citybuilder.tutorialSeen', '1'); } catch (error) {}
      if (seen || played) return false;
      this.openTutorial();
      return true;
    },

    // Changelog: visas en gång per ny version (spelet pausas medan rutan är öppen). Texten är bara engelska.
    // skip: handledningen visades just nu (en ny spelare), så ingen ruta över den. Versionen sparas ändå, så att nya spelare aldrig får nyheter för äldre versioner.
    showChangelogIfNew(skip) {
      const current = String(window.version || ''), log = CityBuilder.Changelog || {};
      let last = null;
      try { last = localStorage.getItem('citybuilder.version'); } catch (error) {}
      try { localStorage.setItem('citybuilder.version', current); } catch (error) {}
      if (!current || last === current || skip) return;
      if (last === null) { // ingen sparad version: nya spelare får ingen ruta, tidigare spelare (de har framsteg sparade) får de senaste nyheterna
        let played = false;
        try { played = !!localStorage.getItem('citybuilder.progress'); } catch (error) {}
        if (!played) return;
        last = '0';
      }
      // Versionsnummer: de två första delarna är heltal, den sista läses som decimaler (0.4.2 = 0.4.20, och senare än 0.4.18)
      const number = text => { const part = String(text).split('.'); return [parseInt(part[0], 10) || 0, parseInt(part[1], 10) || 0, parseFloat('0.' + (part[2] || '0'))]; };
      const newer = (a, b) => { const x = number(a), y = number(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
      const versions = Object.keys(log).filter(v => newer(v, last) && !newer(v, current)).sort((a, b) => newer(a, b) ? -1 : 1).slice(0, 5);
      if (versions.length) this.openChangelog(versions);
    },

    // Visar changeloggen (alla versioner om inget anges). Spelet pausas medan rutan är öppen.
    openChangelog(versions) {
      const log = CityBuilder.Changelog || {};
      versions = versions || Object.keys(log);
      this.hideTooltip();
      CityBuilder.Game.paused = true;
      const overlay = document.createElement('div');
      overlay.id = 'changelogOverlay';
      overlay.className = 'resource-window-overlay';
      const dialog = document.createElement('section');
      dialog.className = 'resource-window main-menu';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const header = document.createElement('header');
      header.className = 'resource-window-header';
      const title = document.createElement('strong');
      title.textContent = "What's new";
      header.appendChild(title);
      const body = document.createElement('div');
      body.className = 'main-menu-body';
      const line = (className, text) => { const element = document.createElement('div'); element.className = className; element.textContent = text; return element; };
      for (const version of versions) {
        body.append(line('main-menu-level', 'Version ' + version));
        for (const entry of log[version]) body.append(line('main-menu-note', '• ' + entry));
      }
      const footer = document.createElement('footer');
      footer.style.cssText = 'padding:10px 12px;border-top:1px solid var(--line);flex:0 0 auto;display:flex;flex-direction:column';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'main-menu-button';
      ok.textContent = 'OK';
      ok.onclick = () => { overlay.remove(); CityBuilder.Game.paused = !!this.mainMenuOpen; };
      footer.append(ok);
      dialog.append(header, body, footer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      // ok.focus();
    },

    // Spelarens bas är förstörd: spelet står stilla tills banan startas om
    showDefeat() {
      this.hideTooltip();
      CityBuilder.Game.paused = true;
      if (byId('defeatOverlay')) return;
      const overlay = document.createElement('div');
      overlay.id = 'defeatOverlay';
      overlay.className = 'resource-window-overlay';
      const dialog = document.createElement('section');
      dialog.className = 'resource-window main-menu';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const header = document.createElement('header');
      header.className = 'resource-window-header';
      const title = document.createElement('strong');
      title.textContent = t('Your base was destroyed');
      header.appendChild(title);
      const body = document.createElement('div');
      body.className = 'main-menu-body';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'main-menu-button';
      retry.textContent = t('Try the level again');
      retry.onclick = () => CityBuilder.Levels.restart();
      body.appendChild(retry);
      dialog.append(header, body);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    },

    showLevelComplete(result) {
      const Levels = CityBuilder.Levels;
      this.hideTooltip();
      CityBuilder.Sound?.play('levelComplete');
      let overlay = byId('levelCompleteOverlay');
      if (overlay) overlay.remove();

      overlay = document.createElement('div');
      overlay.id = 'levelCompleteOverlay';
      overlay.className = 'resource-window-overlay';

      const dialog = document.createElement('section');
      dialog.className = 'resource-window main-menu';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');

      const custom = result.custom;
      const fresh = custom ? '' : Levels.info(result.level + 1).unlocks.map(id => this.buildingName(id)).join(', ');
      const body = document.createElement('div');
      body.className = 'main-menu-body';
      const line = (className, text) => { const element = document.createElement('div'); element.className = className; element.textContent = text; return element; };
      const button = (text, onclick, className = '') => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'main-menu-button ' + className;
        element.textContent = text;
        element.onclick = onclick;
        return element;
      };

      const header = document.createElement('header');
      header.className = 'resource-window-header';
      const title = document.createElement('strong');
      title.textContent = custom ? t('Victory!') : t('Level complete!');
      header.appendChild(title);

      body.append(
        ...(custom ? [] : [line('level-stars', '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars))]),
        line('main-menu-level', t('Time: {time}', { time: this.formatTime(result.seconds) }) + (custom ? '' : ' · ' + t('Target time: {time}', { time: this.formatTime(result.par) }))),
        ...(fresh ? [line('main-menu-note', t('Next level unlocks: {list}', { list: fresh }))] : []),
        ...(custom
          ? [button(t('Keep playing'), () => overlay.remove()), button(t('Play this map again'), () => Levels.restart()), button(t('New custom map'), () => { overlay.remove(); this.toggleMainMenu(true); this.renderMainMenu('custom'); })]
          : [button(t('Next level'), () => Levels.advance()), button(t('Keep playing'), () => overlay.remove())])
      );
      dialog.append(header, body);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      body.querySelector('button').focus();
    },

    // ---- Resursfält --------------------------------------------------------------------------

    initResourceBar(resourceBar) {
      try {
        const saved = JSON.parse(
          localStorage.getItem('cityBuilderResourceFavorites') || '[]'
        );

        this.resourceFavorites = new Set(
          saved.filter(id => Object.hasOwn(Config.resources, id))
        );
      } catch {
        this.resourceFavorites = new Set();
      }

      resourceBar.replaceChildren();
      resourceBar.classList.add('resource-bar');

      const pinned = document.createElement('div');
      pinned.className = 'resource-pinned';
      pinned.id = 'resourcePinned';

      const controls = document.createElement('div');
      controls.className = 'resource-controls';

      const allButton = document.createElement('button');
      allButton.type = 'button';
      allButton.id = 'resourceWindowToggle';
      allButton.className = 'resource-window-toggle';
      allButton.textContent = t('All resources');
      allButton.setAttribute('aria-haspopup', 'dialog');
      allButton.setAttribute('aria-expanded', 'false');
      allButton.onclick = () => this.toggleResourceWindow();

      const carrierCount = document.createElement('span');
      carrierCount.id = 'carrierCount';
      carrierCount.style.color = '#4fd1e8';

      const speedButton = document.createElement('button');
      speedButton.type = 'button';
      speedButton.id = 'speedButton';
      speedButton.textContent = '1x';
      speedButton.onclick = () => CityBuilder.Game.cycleSpeed();

      const menuButton = document.createElement('button');
      menuButton.type = 'button';
      menuButton.id = 'mainMenuButton';
      menuButton.textContent = '☰';
      menuButton.title = t('Main menu');
      menuButton.setAttribute('aria-label', t('Main menu'));
      menuButton.setAttribute('aria-haspopup', 'dialog');
      menuButton.onclick = () => this.toggleMainMenu();

      controls.append(allButton, carrierCount, speedButton, menuButton);
      resourceBar.append(pinned, controls);

      this.createResourceWindow();
      this.renderPinnedResources();

      this.resourceEscapeHandler = event => {
        if (event.key === 'Escape' && this.resourceWindowOpen) {
          this.toggleResourceWindow(false);
        }
        if (event.key === 'Escape') this.closeMarket();
      };

      document.addEventListener('keydown', this.resourceEscapeHandler);
    },

    getPinnedResourceIds() {
      const ids = Object.keys(Config.resources);

      const favorites = ids.filter(id => this.resourceFavorites.has(id));
      const important = ids.filter(id =>
        !this.resourceFavorites.has(id) &&
        (
          Config.resources[id].quickAccess ||
          Config.resources[id].important
        )
      );

      const result = [...favorites, ...important];
      const included = new Set(result);

      for (const id of ids) {
        if (result.length >= this.maxPinnedResources) break;

        if (!included.has(id)) {
          result.push(id);
          included.add(id);
        }
      }

      return result;
    },

    createResourceItem(resourceId, compact = false) {
      const resource = Config.resources[resourceId];

      const item = document.createElement('div');
      item.className = compact
        ? 'res resource-compact'
        : 'resource-detail';

      const icon = document.createElement('span');
      icon.className = 'resource-icon';

      if (resource.color) {
        icon.style.background = resource.color;
      }

      if (resource.image && Config.settings.useImages !== false) {
        const image = new Image();
        image.alt = '';
        image.draggable = false;
        image.onload = () => {
          icon.replaceChildren(image);
          icon.classList.add('has-image');
        };
        image.src = resource.image;
      }

      const name = document.createElement('span');
      name.className = 'resource-name';
      name.textContent = this.resourceName(resourceId);

      const amount = document.createElement('span');
      amount.className = 'resource-amount';
      amount.id = (compact ? 'amount_' : 'resourceWindowAmount_') + resourceId;
      amount.textContent = Economy.totalAmount(resourceId);

      item.append(icon, amount);

      this.attachTooltip(item, () => this.resourceTooltip(resourceId), true);

      if (!compact) {
        item.dataset.resource = resourceId;
        item.classList.add('is-clickable');
        item.onclick = event => { if (!event.target.closest('.resource-favorite')) this.selectResourceFlow(resourceId); };
        const favorite = document.createElement('button');
        favorite.type = 'button';
        favorite.className = 'resource-favorite';
        favorite.dataset.resourceFavorite = resourceId;
        favorite.onclick = () => this.toggleResourceFavorite(resourceId);
        this.attachTooltip(favorite, () => this.tooltipContent(
          t(this.resourceFavorites.has(resourceId) ? 'Remove from favorites' : 'Add to favorites'),
          null,
          [this.resourceName(resourceId)]
        ));
        item.appendChild(favorite);
      }

      return item;
    },

    // "mängd / tak", eller bara mängden för resurser utan tak (mynt)
    stockText(resourceId, amount = Economy.totalAmount(resourceId)) {
      const capacity = Economy.capacity(resourceId);
      return Number.isFinite(capacity) ? amount + ' / ' + capacity : String(amount);
    },

    resourceTooltip(resourceId) {
      const resource = Config.resources[resourceId];
      const total = Economy.totalAmount(resourceId);
      const free = Economy.freeAmount ? Economy.freeAmount(resourceId) : total;
      const details = [this.stockText(resourceId, total)];
      if (free !== total) details.push(t('Free: {amount}', { amount: free }));
      if (resource.description) details.push(resource.description);
      return this.tooltipContent(this.resourceName(resourceId), null, details);
    },

    // Tooltip under elementet (för resursfältet högst upp). Mus: hover/fokus. Pekskärm: visas en kort stund vid tryck.
    attachTooltip(element, content, showOnTouch = false) {
      element.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse') this.showTooltip(element, content(), 'below');
      });
      element.addEventListener('pointerleave', () => this.hideTooltip());
      element.addEventListener('focus', () => {
        if (element.matches(':focus-visible')) this.showTooltip(element, content(), 'below');
      });
      element.addEventListener('blur', () => this.hideTooltip());

      if (showOnTouch) {
        element.addEventListener('pointerup', event => {
          if (event.pointerType === 'mouse') return;
          this.showTooltip(element, content(), 'below');
          clearTimeout(this.touchTooltipTimer);
          this.touchTooltipTimer = setTimeout(() => this.hideTooltip(), 1800);
        });
      }
    },

    renderPinnedResources() {
      const container = byId('resourcePinned');
      if (!container) return;

      container.replaceChildren();

      for (const id of this.getPinnedResourceIds()) {
        container.appendChild(this.createResourceItem(id, true));
      }
    },

    createResourceWindow() {
      const overlay = document.createElement('div');
      overlay.id = 'resourceWindowOverlay';
      overlay.className = 'resource-window-overlay';
      overlay.hidden = true;

      const dialog = document.createElement('section');
      dialog.className = 'resource-window';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'resourceWindowTitle');

      const header = document.createElement('header');
      header.className = 'resource-window-header';

      const title = document.createElement('strong');
      title.id = 'resourceWindowTitle';
      title.textContent = t('Resources');

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'resource-window-close';
      close.textContent = '×';
      close.setAttribute('aria-label', t('Close resource window'));
      close.onclick = () => this.toggleResourceWindow(false);

      header.append(title, close);

      const list = document.createElement('div');
      list.id = 'resourceWindowList';
      list.className = 'resource-window-list';

      for (const id of Object.keys(Config.resources)) {
        list.appendChild(this.createResourceItem(id));
      }

      const detail = document.createElement('div');
      detail.id = 'resourceWindowDetail';
      detail.className = 'resource-flow';

      dialog.append(header, list, detail);
      overlay.appendChild(dialog);
      this.renderResourceFlow(true);

      overlay.addEventListener('pointerdown', event => {
        if (event.target === overlay) {
          this.toggleResourceWindow(false);
        }
      });

      document.body.appendChild(overlay);
      this.updateResourceFavoriteButtons();
    },

    toggleResourceWindow(force) {
      this.resourceWindowOpen = force ?? !this.resourceWindowOpen;

      const overlay = byId('resourceWindowOverlay');
      const button = byId('resourceWindowToggle');

      overlay.hidden = !this.resourceWindowOpen;
      button.setAttribute(
        'aria-expanded',
        String(this.resourceWindowOpen)
      );

      if (this.resourceWindowOpen) {
        this.updateKnownResources();
        this.updateResourceFavoriteButtons();
        overlay.querySelector('.resource-window-close').focus();
      } else {
        button.focus();
      }
    },

    // ---- Resursstatistik: klicka på en resurs i fönstret för att se vart den går och varifrån den kommer ------------------

    // Resurser som spelaren kan ha nytta av nu: det som finns i lagret, favoriter och allt som de upplåsta byggnaderna kostar, kräver eller gör.
    // Resten (t.ex. guld och månsten på nivå 1) döljs i resursfönstret tills de behövs, så att listan inte överväldigar.
    knownResources() {
      const known = new Set(this.resourceFavorites), Levels = CityBuilder.Levels;
      const add = amounts => { for (const id in amounts || {}) known.add(id); };
      for (const [id, building] of Object.entries(Config.buildings)) {
        if (Levels && !Levels.isUnlocked(id)) continue;
        add(building.buildCost);
        add(building.requiredEquipment);
        const job = building.job;
        if (!job) continue;
        add(job.inputs);
        add(job.outputs);
        if (job.outputResource) known.add(job.outputResource);
        for (const choice of job.choices || []) { add(choice.inputs); add(choice.outputs); }
        for (const group of [].concat(job.eats || [])) group.any.forEach(resourceId => known.add(resourceId));
        for (const kind of job.trains || []) add(Config.units[kind]?.training?.inputs);
      }
      add(Config.settings.startingResources);
      for (const id in Config.resources) if (Economy.totalAmount(id) > 0) known.add(id);
      return known;
    },

    updateKnownResources() {
      const known = this.knownResources();
      document.querySelectorAll('#resourceWindowList .resource-detail').forEach(item => item.classList.toggle('is-hidden', !known.has(item.dataset.resource)));
    },

    selectResourceFlow(resourceId) {
      this.flowResource = this.flowResource === resourceId ? null : resourceId;
      this.renderResourceFlow(true);
    },

    // Alla byggnader som kan använda ('use') eller göra ('make') resursen, även de som inte gör det just nu (byggande och marknad räknas som egna rader)
    resourceUsers(resourceId) {
      const cache = this.usersCache = this.usersCache || new Map();
      if (cache.has(resourceId)) return cache.get(resourceId);
      const use = new Set(), make = new Set(), Behaviors = CityBuilder.Behaviors;
      for (const [id, building] of Object.entries(Config.buildings)) {
        if (building.buildCost?.[resourceId]) use.add('construction');
        if (building.isMarket && Config.buildings.market.market.prices[resourceId] !== undefined) { use.add(id); make.add(id); }
        const job = building.job;
        if (!job) continue;
        const takes = [job.inputs, building.requiredEquipment, ...(job.choices || []).map(choice => choice.inputs), ...(job.trains || []).map(kind => Config.units[kind]?.training?.inputs)];
        if (takes.some(amounts => amounts && amounts[resourceId] !== undefined) || [].concat(job.eats || []).some(group => group.any.includes(resourceId)) || Behaviors.boostOf(building)?.resource === resourceId) use.add(id);
        if ([job.outputs, ...(job.choices || []).map(choice => choice.outputs)].some(amounts => amounts && amounts[resourceId] !== undefined) || job.outputResource === resourceId) make.add(id);
      }
      const result = { use: [...use], make: [...make] };
      cache.set(resourceId, result);
      return result;
    },

    flowLabel: label => label === 'construction' ? t('Construction') : UI.buildingName(label),

    // Ritar om panelen (högst en gång per sekund om inte force)
    renderResourceFlow(force) {
      const panel = byId('resourceWindowDetail');
      if (!panel) return;
      const now = performance.now();
      if (!force && now - (this.flowDrawn || 0) < 1000) return;
      this.flowDrawn = now;

      document.querySelectorAll('#resourceWindowList .resource-detail').forEach(item => item.classList.toggle('is-selected', item.dataset.resource === this.flowResource));
      const resourceId = this.flowResource;
      if (!resourceId) { panel.replaceChildren(Object.assign(document.createElement('p'), { className: 'resource-flow-hint', textContent: t('Click a resource to see where it goes.') })); return; }

      const make = (tag, className, text) => Object.assign(document.createElement(tag), { className, ...(text !== undefined ? { textContent: text } : {}) });
      // Rader: det som faktiskt händer (störst först), därefter alla övriga byggnader som kan använda resursen (0/min, dämpade, låsta med hänglås)
      const Levels = CityBuilder.Levels, users = this.resourceUsers(resourceId);
      const rowsFor = (flow, possible) => {
        const seen = new Set(flow.map(row => row.label));
        const idle = possible.filter(label => !seen.has(label)).map(label => ({ label, perMinute: 0, locked: label !== 'construction' && Levels && !Levels.isUnlocked(label) }))
          .sort((a, b) => a.locked - b.locked || this.flowLabel(a.label).localeCompare(this.flowLabel(b.label)));
        return [...flow, ...idle];
      };
      const column = (title, rows) => {
        const box = make('div', 'resource-flow-column');
        box.append(make('h4', '', title));
        const top = rows[0]?.perMinute || 0;
        for (const row of rows) {
          const line = make('div', 'resource-flow-row' + (row.perMinute ? '' : ' is-idle') + (row.locked ? ' is-locked' : ''));
          const bar = make('span', 'resource-flow-bar');
          bar.style.width = row.perMinute ? Math.max(4, Math.round(row.perMinute / top * 100)) + '%' : '0';
          line.append(bar, make('span', 'resource-flow-label', (row.locked ? '🔒 ' : '') + this.flowLabel(row.label)), make('span', 'resource-flow-value', row.perMinute.toFixed(1) + ' ' + t('/min')));
          box.append(line);
        }
        if (!rows.length) box.append(make('div', 'resource-flow-none', t('Nothing uses this')));
        return box;
      };
      const used = Economy.flow('use', resourceId), made = Economy.flow('make', resourceId);
      const usedRows = rowsFor(used, users.use), madeRows = rowsFor(made, users.make);
      const net = made.reduce((sum, row) => sum + row.perMinute, 0) - used.reduce((sum, row) => sum + row.perMinute, 0);
      const title = make('div', 'resource-flow-title');
      title.append(make('strong', '', this.resourceName(resourceId)), make('span', 'resource-flow-net' + (net < -0.05 ? ' is-negative' : ''), (net > 0 ? '+' : '') + net.toFixed(1) + ' ' + t('/min')));
      panel.replaceChildren(title, column(t('Used by'), usedRows), column(t('Produced by'), madeRows), make('p', 'resource-flow-note', t('Average over the last 5 minutes')));
    },

    // ---- Marknaden: fönster där varor köps och säljs för mynt (Economy.buy / Economy.sell) ----------------------------------

    openMarket() {
      if (!this.marketOverlay) this.createMarket();
      this.marketOverlay.hidden = false;
      this.updateMarket(true);
    },

    closeMarket() { if (this.marketOverlay) this.marketOverlay.hidden = true; },

    createMarket() {
      const make = (tag, className, text) => Object.assign(document.createElement(tag), { className, ...(text !== undefined ? { textContent: text } : {}) });
      const state = this.market = { mode: 'buy', amount: 5, rows: {}, modeButtons: {}, amountButtons: {} };
      const overlay = this.marketOverlay = make('div', 'resource-window-overlay');
      overlay.hidden = true;
      const dialog = make('section', 'resource-window market-window');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');

      const close = make('button', 'resource-window-close', '×');
      close.type = 'button';
      close.onclick = () => this.closeMarket();
      state.coins = make('span', 'market-coins');
      const header = make('header', 'resource-window-header');
      header.append(make('strong', '', t('Market')), state.coins, close);

      const bar = make('div', 'market-bar');
      const choose = (group, buttons, value, key) => {
        const button = make('button', '', key === 'mode' ? t(value === 'buy' ? 'Buy' : 'Sell') : '×' + value);
        button.type = 'button';
        button.onclick = () => { state[key] = value; this.updateMarket(true); };
        buttons[value] = button;
        group.appendChild(button);
      };
      const modes = make('div', 'market-group'), amounts = make('div', 'market-group');
      for (const mode of ['buy', 'sell']) choose(modes, state.modeButtons, mode, 'mode');
      for (const amount of [1, 5, 10, 25]) choose(amounts, state.amountButtons, amount, 'amount');
      bar.append(modes, amounts);

      const list = make('div', 'market-list');
      for (const resourceId of Object.keys(Config.buildings.market.market.prices)) {
        const row = make('div', 'market-row');
        const button = make('button', 'market-trade');
        button.type = 'button';
        button.onclick = () => {
          const done = Economy[state.mode](resourceId, state.amount);
          if (done) CityBuilder.Sound?.play('drop');
          this.updateMarket(true);
        };
        const name = make('span', 'market-name'), stock = make('span', 'market-stock'), price = make('span', 'market-price');
        name.innerHTML = this.resourceChip(resourceId) + `<span>${this.resourceName(resourceId)}</span>`;
        row.append(name, stock, price, button);
        state.rows[resourceId] = { row, stock, price, button };
        list.appendChild(row);
      }

      dialog.append(header, bar, list);
      overlay.appendChild(dialog);
      overlay.addEventListener('pointerdown', event => { if (event.target === overlay) this.closeMarket(); });
      document.body.appendChild(overlay);
    },

    // Uppdaterar fönstret på plats (bara det som ändrats skrivs om). Stänger det om marknaden försvunnit.
    updateMarket(force) {
      const state = this.market;
      if (!state || this.marketOverlay.hidden) return;
      if (!Economy.marketOf()) return this.closeMarket();
      const buying = state.mode === 'buy', verb = t(buying ? 'Buy' : 'Sell');
      const coins = Economy.freeAmount('coins');
      const coinsHtml = this.resourceChip('coins', Economy.totalAmount('coins'));
      if (state.coinsHtml !== coinsHtml) state.coins.innerHTML = state.coinsHtml = coinsHtml;
      for (const key in state.modeButtons) state.modeButtons[key].classList.toggle('on', key === state.mode);
      for (const key in state.amountButtons) state.amountButtons[key].classList.toggle('on', +key === state.amount);

      for (const resourceId in state.rows) {
        const { stock, price, button } = state.rows[resourceId];
        const unit = buying ? Economy.buyPrice(resourceId) : Economy.sellPrice(resourceId);
        const free = Economy.freeAmount(resourceId);
        const count = Math.min(state.amount, buying
          ? Math.min(Math.floor(coins / unit), Economy.room(resourceId))
          : Math.min(free, Math.floor(Economy.room('coins') / unit)));
        const reason = count > 0 ? '' : buying
          ? (Math.floor(coins / unit) < 1 ? t('Not enough coins') : t('No room in storage'))
          : (free < 1 ? t('Nothing to sell') : t('No room for the coins'));
        const html = count > 0 ? `${verb} ${count} · ${this.resourceChip('coins', count * unit)}` : verb;
        const stockText = this.stockText(resourceId);
        if (stock.textContent !== stockText) stock.textContent = stockText;
        if (price.dataset.unit !== String(unit)) { price.dataset.unit = unit; price.innerHTML = this.resourceChip('coins', unit); }
        if (button.dataset.html !== html) { button.dataset.html = html; button.innerHTML = html; }
        button.disabled = count <= 0;
        button.classList.toggle('unavailable', count <= 0);
        button.title = reason;
      }
    },

    toggleResourceFavorite(resourceId) {
      if (this.resourceFavorites.has(resourceId)) {
        this.resourceFavorites.delete(resourceId);
      } else {
        this.resourceFavorites.add(resourceId);
      }

      try {
        localStorage.setItem(
          'cityBuilderResourceFavorites',
          JSON.stringify([...this.resourceFavorites])
        );
      } catch (error) {
        console.warn("Unable to save favorites:", error);
      }

      this.renderPinnedResources();
      this.updateResourceFavoriteButtons();
    },

    updateResourceFavoriteButtons() {
      document.querySelectorAll('[data-resource-favorite]').forEach(button => {
        const favorite = this.resourceFavorites.has(
          button.dataset.resourceFavorite
        );

        button.textContent = favorite ? '★' : '☆';
        button.classList.toggle('is-favorite', favorite);
        button.setAttribute('aria-pressed', String(favorite));
        button.setAttribute(
          'aria-label',
          t(favorite ? 'Remove from favorites' : 'Add to favorites')
        );
        button.removeAttribute('title');
      });
    },

    // ---- Huvudmeny (spara, ladda, nytt spel) --------------------------------------------------
    // Förväntar sig ett sparsystem, CityBuilder.Save, med:
    //   list()      → [{ id, savedAt (ms), level }] för de platser som innehåller en sparning
    //   save(id)    → sparar spelet på platsen (true/false)
    //   load(id)    → laddar platsen och bygger om världen (true/false)
    //   newGame()   → rensar autosparningen och startar om (t.ex. genom att ladda om sidan)
    // Platser: 'autosave' (skrivs bara av autosparningen) och 'slot1'..'slot5' (manuella).

    createMainMenu() {
      this.mainMenuOpen = false;

      const overlay = document.createElement('div');
      overlay.id = 'mainMenuOverlay';
      overlay.className = 'resource-window-overlay';
      overlay.hidden = true;

      const dialog = document.createElement('section');
      dialog.id = 'mainMenuDialog';
      dialog.className = 'resource-window main-menu';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-label', t('Main menu'));
      overlay.appendChild(dialog);

      overlay.addEventListener('pointerdown', event => {
        if (event.target === overlay) this.toggleMainMenu(false);
      });

      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.mainMenuOpen) this.toggleMainMenu(false);
      });

      document.body.appendChild(overlay);
    },

    toggleMainMenu(force) {
      this.mainMenuOpen = force ?? !this.mainMenuOpen;
      byId('mainMenuOverlay').hidden = !this.mainMenuOpen;
      CityBuilder.Game.paused = this.mainMenuOpen; // spelet står stilla medan menyn är öppen

      if (this.mainMenuOpen) {
        if (this.resourceWindowOpen) this.toggleResourceWindow(false);
        this.hideTooltip();
        this.renderMainMenu('main');
      } else {
        byId('mainMenuButton').focus();
      }
    },

    formatSaveTime(savedAt) {
      return new Date(savedAt).toLocaleString(I18n().locale, { dateStyle: 'short', timeStyle: 'short' });
    },

    // view: 'main' | 'save' | 'load' | 'confirm' | 'options' | 'stats'. confirm tar { text, confirmLabel, danger, onConfirm, back }.
    renderMainMenu(view = 'main', confirm = null) {
      this.mainMenuView = view;
      const dialog = byId('mainMenuDialog');
      const saveSystem = CityBuilder.Save;
      const level = CityBuilder.Levels?.current;

      const make = (tag, className, text) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
      };
      const button = (text, onclick, className = '', icon = '') => {
        const element = make('button', 'main-menu-button ' + className);
        if (icon) element.append(make('span', 'main-menu-icon', icon), make('span', '', text)); else element.textContent = text;
        element.type = 'button';
        if (onclick) element.onclick = onclick; else element.disabled = true;
        return element;
      };

      const entries = new Map((saveSystem?.list?.() || []).map(entry => [entry.id, entry]));
      const slotRow = (id, label, onclick, allowEmpty = false) => {
        const entry = entries.get(id);
        const row = button('', entry || allowEmpty ? onclick : null, 'main-menu-slot');
        row.append(
          make('span', 'main-menu-slot-name', label),
          make('span', 'main-menu-slot-meta', entry
            ? `${entry.custom ? t('Custom map') : t('Level {level}', { level: entry.level })} · ${this.formatSaveTime(entry.savedAt)}`
            : t('Empty'))
        );
        return row;
      };

      const titles = {
        main: t('Main menu'), save: t('Save game'), load: t('Load game'), confirm: t('Are you sure?'),
        options: t('Settings'), stats: t('Statistics'), custom: t('Custom map'),
      };
      const header = make('header', 'resource-window-header');
      const close = make('button', 'resource-window-close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', t('Close menu'));
      close.onclick = () => this.toggleMainMenu(false);
      header.append(make('strong', '', titles[view]), close);

      const body = make('div', 'main-menu-body');
      const slotLabels = [1, 2, 3, 4, 5].map(n => ['slot' + n, t('Slot {n}', { n })]);

      const fail = text => this.showToast(text);
      const requireSaveSystem = () => {
        if (saveSystem) return true;
        fail(t('Somehow the savesystem is unreachable'));
        return false;
      };

      if (view === 'main') {
        if (level) body.append(make('div', 'main-menu-level', level.custom ? level.name : t('Level {level}: {name}', { level: level.level, name: level.name })));
        const gap = () => make('div', 'main-menu-gap');
        const restart = button(level?.custom ? t('Restart map') : t('Restart level'), () => this.renderMainMenu('confirm', {
          text: level?.custom ? t('Restart this map? Progress on this map is lost. Manual saves are unchanged.') : t('Restart this level? Progress on this level is lost. Manual saves are unchanged.'),
          confirmLabel: level?.custom ? t('Restart map') : t('Restart level'),
          danger: true,
          back: 'main',
          onConfirm: () => CityBuilder.Levels.restart(),
        }), '', '🔄');
        const newGame = button(t('New game'), () => this.renderMainMenu('confirm', {
          text: t('New game resets the game and autosave, and generates new maps. Manual saves are unchanged.'),
          confirmLabel: t('Start a new game'),
          danger: true,
          back: 'main',
          onConfirm: () => {
            if (!requireSaveSystem()) return;
            CityBuilder.Levels?.newRun();
            saveSystem.newGame();
            this.toggleMainMenu(false);
          },
        }), '', '✨');
        // Grupper: spela vidare - spara och ladda - ny omgång och banor - information och inställningar
        body.append(
          button(t('Continue'), () => this.toggleMainMenu(false), '', '▶'),
          ...(CityBuilder.Levels?.completed && !level?.custom ? [button(t('Next level'), () => CityBuilder.Levels.advance(), '', '⏭')] : []),
          gap(),
          button(t('Save game'), () => this.renderMainMenu('save'), '', '💾'),
          button(t('Load game'), entries.size ? () => this.renderMainMenu('load') : null, '', '📂'),
          gap(),
          restart,
          newGame,
          button(t('Custom map'), () => this.renderMainMenu('custom'), '', '🗺️'),
          ...(level?.custom ? [button(t('Back to the levels'), () => this.renderMainMenu('confirm', {
            text: t('Return to your levels? The custom map is kept in its autosave and in your manual saves.'),
            confirmLabel: t('Back to the levels'),
            back: 'main',
            onConfirm: () => CityBuilder.Levels.leaveCustom(),
          }), '', '↩️')] : []),
          gap(),
          button(t('Statistics'), () => this.renderMainMenu('stats'), '', '📊'),
          button(t('How to play'), () => this.openTutorial('basics'), '', '❓'),
          button(t('Advanced guide'), () => this.openTutorial('advanced'), '', '📖'),
          button('Changelog', () => this.openChangelog(), '', '📜'),
          button(t('Settings'), () => this.renderMainMenu('options'), '', '⚙️')
        );
        if (window.version) body.append(make('div', 'main-menu-note', 'Version ' + window.version));
      } else if (view === 'save') {
        const doSave = id => {
          if (!requireSaveSystem()) return;
          if (saveSystem.save(id) === false) return fail(t('Unable to save: {reason}', { reason: t(saveSystem.lastError || 'unknown error') }));
          this.showToast(t('Game saved'));
          this.renderMainMenu('save');
        };

        for (const [id, label] of slotLabels) {
          body.append(slotRow(id, label, () => entries.has(id)
            ? this.renderMainMenu('confirm', {
                text: t('{label} exists. Want to overwrite?', { label }),
                confirmLabel: t('Overwrite'),
                danger: true,
                back: 'save',
                onConfirm: () => doSave(id),
              })
            : doSave(id), true));
        }
        body.append(button(t('Back'), () => this.renderMainMenu('main')));
      } else if (view === 'load') {
        const doLoad = (id, label) => this.renderMainMenu('confirm', {
          text: t('Load {label}? Unsaved progress will be gone.', { label }),
          confirmLabel: t('Load'),
          danger: true,
          back: 'load',
          onConfirm: () => {
            if (!requireSaveSystem()) return;
            if (saveSystem.load(id) === false) return fail(t('Unable to load'));
            this.toggleMainMenu(false);
          },
        });

        body.append(slotRow('autosave', t('Autosave'), () => doLoad('autosave', t('Autosave'))));
        if (entries.has('autocustom')) body.append(slotRow('autocustom', t('Autosave (custom map)'), () => doLoad('autocustom', t('Autosave (custom map)'))));
        for (const [id, label] of slotLabels) body.append(slotRow(id, label, () => doLoad(id, label)));
        body.append(button(t('Back'), () => this.renderMainMenu('main')));
      } else if (view === 'confirm') {
        body.append(
          make('div', 'main-menu-note', confirm.text),
          button(confirm.confirmLabel, () => {
            confirm.onConfirm();
          }, confirm.danger ? 'main-menu-danger' : ''),
          button(t('Cancel'), () => this.renderMainMenu(confirm.back))
        );
      } else if (view === 'options') {
        CityBuilder.Options.fillOptions(body, make);
        body.append(button(t('Back'), () => this.renderMainMenu('main')));
      } else if (view === 'stats') {
        CityBuilder.Options.fillStats(body, make);
        body.append(button(t('Back'), () => this.renderMainMenu('main')));
      } else if (view === 'custom') {
        CityBuilder.CustomMap.fillSetup(body, make, button, () => this.renderMainMenu('main'));
      }

      dialog.classList.toggle('is-wide', view === 'custom');
      dialog.replaceChildren(header, body);
      // I inställningarna behålls fokus på språkvalet efter ett byte
      (body.querySelector(view === 'options' ? 'select, button:not(:disabled)' : 'button:not(:disabled)') || close).focus();
    },

    // ---- Byggmeny ----------------------------------------------------------------------------

    groupBuildingsByCategory() {
      const groups = new Map(
        Object.keys(CATEGORIES).map(id => [id, []])
      );

      for (const [buildingId, building] of Object.entries(Config.buildings)) {
        if (building.hiddenInMenu) continue;
        if (CityBuilder.Levels && !CityBuilder.Levels.isVisible(buildingId)) continue;

        const categoryId = groups.has(building.category)
          ? building.category
          : 'other';

        groups.get(categoryId).push(buildingId);
      }

      for (const [categoryId, buildingIds] of groups) {
        if (!buildingIds.length) groups.delete(categoryId);
      }

      return groups;
    },

    buildBuildMenu(buildMenu) {
      buildMenu.replaceChildren();
      buildMenu.classList.add('build-menu');

      const categoryRow = document.createElement('div');
      categoryRow.className = 'build-categories';

      const submenuArea = document.createElement('div');
      submenuArea.className = 'build-submenus';

      buildMenu.append(categoryRow, submenuArea);

      this.categoryToggles = new Map();
      this.categorySubmenus = new Map();

      for (const [categoryId, buildingIds] of this.groupBuildingsByCategory()) {
        const category = CATEGORIES[categoryId];

        const toggle = this.createIconButton({
          className: 'build-category-toggle',
          label: t(category.name),
          icon: {
            image: category.image,
            symbol: category.symbol
          },
          tooltip: () => this.tooltipContent(t(category.name), null, this.hotkeyLines(this.categoryKey(categoryId))),
          showOnTouch: true,
        });

        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'build-submenu-' + categoryId);
        toggle.onclick = () => {
          this.setOpenCategory(
            this.openCategoryId === categoryId ? null : categoryId
          );
        };

        categoryRow.appendChild(toggle);

        const submenu = document.createElement('div');
        submenu.className = 'build-submenu';
        submenu.id = 'build-submenu-' + categoryId;
        submenu.hidden = true;

        for (const buildingId of buildingIds) {
          const building = Config.buildings[buildingId];

          const Levels = CityBuilder.Levels;
          const locked = Levels && !Levels.isUnlocked(buildingId);
          const lockedLine = locked ? t('Unlocks at level {n}', { n: Levels.unlockLevel(buildingId) }) : null;

          const button = this.createIconButton({
            id: 'build_' + buildingId,
            className: 'building-option' + (locked ? ' locked' : ''),
            label: this.buildingName(buildingId),
            icon: {
              image: building.image,
              symbol: building.symbol,
              color: building.color
            },
            tooltip: () => this.tooltipContent(
              this.buildingName(buildingId),
              building.buildCost,
              [...(lockedLine ? ['🔒 ' + lockedLine] : Economy.canAfford(building.buildCost) ? [] : ['⚠ ' + t('Not enough resources')]), ...this.describeBuilding(building), ...this.hotkeyLines(this.buildingKey(button))]
            ),
          });

          button.setAttribute('aria-pressed', 'false');

          button.onclick = () => {
            const game = CityBuilder.Game;

            if (locked) return this.showToast(lockedLine);

            game.setPlacingType(
              game.placingType === buildingId ? null : buildingId
            );

            this.hideTooltip();
          };

          submenu.appendChild(button);
        }
        
        submenuArea.appendChild(submenu);
        this.categoryToggles.set(categoryId, toggle);
        this.categorySubmenus.set(categoryId, submenu);
      }
    },

    // ---- Snabbknappar -------------------------------------------------------------------------------------------------
    // Enkla tangenter utan Ctrl, Alt, Cmd eller Shift, så att de aldrig krockar med webbläsarens kortkommandon. Byggmenyn har två skilda tangentrader,
    // så att ett tryck aldrig är tvetydigt: siffror väljer kategori (alltid, även när en annan är öppen) och bokstäverna Q W E R T Y U I O P
    // väljer byggnad nummer 1-10 i den öppna kategorin (Esc backar ett steg). Siffrorna läses från tangentens läge (event.code) och
    // bokstäverna från tecknet, så det som står i tipset är det som står på tangenten. Den elfte kategorin har - (minus).
    // Bokstäver gäller i stället den markerade byggnaden så länge en är markerad: P paus, B boost, R byt recept, T handla, S attack/försvar,
    // Z X C V utbilda soldattyp, Delete riv (trycks två gånger).
    HOTKEYS: { pauseButton: 'p', boostButton: 'b', choiceButton: 'r', marketButton: 't', stanceButton: 's', demolishButton: 'Delete' },
    TRAIN_KEYS: ['z', 'x', 'c', 'v'],
    CATEGORY_KEYS: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
    BUILD_KEYS: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],

    hotkeyLines: key => key ? [t('Hotkey: {key}', { key: `<kbd>${key.length === 1 ? key.toUpperCase() : key}</kbd>` })] : [],

    // Tangenten för kategori nummer N (bland de synliga) och för en byggnadsknapp i sin undermeny
    categoryKey(categoryId) { return this.CATEGORY_KEYS[[...this.categoryToggles.keys()].indexOf(categoryId)]; },
    buildingKey(button) { const index = [...(button.parentElement?.children || [])].indexOf(button); return index >= 0 ? this.BUILD_KEYS[index] : undefined; },

    // Tangentens namn oberoende av tangentbordslayout: siffror från läget, bokstäver från tecknet. Null för allt som inte är en snabbknapp.
    hotkeyName(event) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
      if (digit) return digit[1];
      if (event.code === 'Minus' || event.code === 'NumpadSubtract') return '-';
      return event.key.length === 1 ? event.key.toLowerCase() : event.key;
    },

    initHotkeys() {
      document.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.repeat) return;
        if (event.target.closest && event.target.closest('input, select, textarea, [contenteditable]')) return;
        if (document.querySelector('.resource-window-overlay:not([hidden])')) return; // en ruta (meny, handledning, resurser, marknad) är öppen
        const key = this.hotkeyName(event);
        if (key && this.handleHotkey(key)) event.preventDefault();
      });
    },

    // Returnerar true om tangenten användes
    handleHotkey(key) {
      const game = CityBuilder.Game, selected = game.selectedBuilding;

      if (key === 'Escape') { // ett steg tillbaka: placering, öppen kategori, vald byggnad, markerad terräng
        if (game.placingType) game.setPlacingType(null);
        else if (this.openCategoryId) this.setOpenCategory(null);
        else if (selected) game.selectBuilding(null);
        else if (this.inspectedTile) this.inspectTile(null);
        else return false;
        return true;
      }

      const categoryId = [...this.categoryToggles.keys()][this.CATEGORY_KEYS.indexOf(key)];
      if (categoryId) {
        if (selected) game.selectBuilding(null);  // menyn är det nya målet: bokstäverna ska bygga, inte styra den markerade byggnaden
        this.setOpenCategory(this.openCategoryId === categoryId ? null : categoryId);
        return true;
      }
      if (this.CATEGORY_KEYS.includes(key)) return false;

      // En byggnad i den öppna kategorin (men bokstäverna går till den markerade byggnaden så länge en är markerad)
      const buildIndex = this.BUILD_KEYS.indexOf(key);
      if (buildIndex >= 0 && this.openCategoryId && !(selected && byId('info').style.display !== 'none')) {
        const button = this.categorySubmenus.get(this.openCategoryId).children[buildIndex];
        if (!button) return false;
        button.click();
        return true;
      }

      // Den markerade byggnadens knappar (bara spelarens egna har några)
      const panel = byId('info');
      if (!selected || panel.style.display === 'none') return false;
      const trainIndex = this.TRAIN_KEYS.indexOf(key);
      const button = trainIndex >= 0 ? panel.querySelectorAll('.train-button')[trainIndex]
        : byId(Object.keys(this.HOTKEYS).find(id => this.HOTKEYS[id].toLowerCase() === key.toLowerCase() || (id === 'demolishButton' && key === 'Backspace')));
      if (!button || button.disabled) return false;
      if (button.id === 'demolishButton') { // rivning kräver en andra tryckning (inom 3 sekunder)
        if (!(performance.now() - (this.demolishArmedAt || -1e9) < 3000)) {
          this.demolishArmedAt = performance.now();
          this.showToast(t('Press {key} again to demolish', { key: 'Delete' }));
          return true;
        }
        this.demolishArmedAt = 0;
      }
      button.click();
      return true;
    },

    // Knapparna i infopanelen visar sin snabbknapp när man håller muspekaren över dem
    applyHotkeyTitles(panel) {
      for (const id in this.HOTKEYS) {
        const button = byId(id);
        if (!button) continue;
        const base = button.dataset.baseTitle ?? '';
        const key = this.HOTKEYS[id];
        button.title = (base ? base + ' ' : '') + `[${key.length === 1 ? key.toUpperCase() : key}]`;
      }
      panel.querySelectorAll('.train-button').forEach((button, index) => { if (this.TRAIN_KEYS[index]) button.title = `[${this.TRAIN_KEYS[index].toUpperCase()}]`; });
    },

    setOpenCategory(categoryId) {
      const game = CityBuilder.Game;

      if (categoryId !== this.openCategoryId && game.placingType) {
        game.setPlacingType(null);
      }

      this.openCategoryId = categoryId;

      for (const [id, submenu] of this.categorySubmenus) {
        const isOpen = id === categoryId;
        submenu.hidden = !isOpen;
        this.categoryToggles.get(id).setAttribute(
          'aria-expanded',
          String(isOpen)
        );
      }

      this.hideTooltip();
      this.goalCheckedAt = 0;
      requestAnimationFrame(this.positionInfoPanel);
    },

    createIconButton({ id, className, label, icon, tooltip, showOnTouch = false }) {
      const button = document.createElement('button');
      button.type = 'button';

      if (id) button.id = id;

      button.className = 'icon-button ' + className;
      button.setAttribute('aria-label', label);
      button.appendChild(this.createIcon(icon));

      button.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse') {
          this.showTooltip(button, tooltip());
        }
      });

      button.addEventListener('pointerleave', () => this.hideTooltip());

      button.addEventListener('focus', () => {
        if (button.matches(':focus-visible')) {
          this.showTooltip(button, tooltip());
        }
      });

      button.addEventListener('blur', () => this.hideTooltip());

      // Pekskärm saknar hover: visa tooltipen en kort stund efter tryck
      if (showOnTouch) {
        let lastPointerType = 'mouse';

        button.addEventListener('pointerdown', event => {
          lastPointerType = event.pointerType;
        });

        button.addEventListener('click', () => {
          if (lastPointerType === 'mouse') return;

          // Efter att klickhanterarna (som döljer tooltipen) har körts
          setTimeout(() => {
            this.showTooltip(button, tooltip());
            clearTimeout(this.touchTooltipTimer);
            this.touchTooltipTimer = setTimeout(() => this.hideTooltip(), 1800);
          }, 0);
        });
      }

      return button;
    },

    createIcon({ image, symbol, color }) {
      const icon = document.createElement('span');
      icon.className = 'icon';

      const fallback = document.createElement('span');
      fallback.className = 'icon-fallback';
      fallback.textContent = symbol || '?';

      if (color) fallback.style.background = color;

      icon.appendChild(fallback);

      if (image && Config.settings.useImages !== false) {
        const picture = new Image();
        picture.className = 'icon-image';
        picture.alt = '';
        picture.draggable = false;
        picture.onload = () => icon.classList.add('has-image');
        picture.src = image;
        icon.appendChild(picture);
      }

      return icon;
    },

    // ---- Tooltip -----------------------------------------------------------------------------

    tooltipContent(title, cost, details = []) {
      const content = document.createElement('div');

      const heading = document.createElement('div');
      heading.className = 'tooltip-title';
      heading.textContent = title;
      content.appendChild(heading);

      for (const line of details) {
        const detail = document.createElement('div');
        detail.className = 'tooltip-detail';
        detail.innerHTML = line;   // raden är vår egen text, ev. med resursikoner
        content.appendChild(detail);
      }

      if (cost && Object.keys(cost).length) {
        const costLine = document.createElement('div');
        costLine.className = 'tooltip-cost';

        costLine.innerHTML = this.resourceIconsHtml(cost, true);

        content.appendChild(costLine);
      }

      return content;
    },

    // placement 'menu': ovanför hela byggmenyn. 'map': vid en ruta på kartan (ovanför, annars under).
    showTooltip(anchor, content, placement = 'menu') {
      if (!this.tooltipElement) {
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.id = 'buildTooltip';
        this.tooltipElement.setAttribute('role', 'tooltip');
        document.body.appendChild(this.tooltipElement);
      }

      this.tooltipOwner = placement === 'map' ? 'map' : 'button';

      const tooltip = this.tooltipElement;
      tooltip.replaceChildren(content);
      tooltip.style.display = 'block';

      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      tooltip.style.left = Utils.clamp(
        anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2,
        4,
        innerWidth - tooltipRect.width - 4
      ) + 'px';

      if (placement === 'below') {
        const below = anchorRect.bottom + 8;
        tooltip.style.top = (
          below + tooltipRect.height <= innerHeight - 4
            ? below
            : Math.max(4, anchorRect.top - tooltipRect.height - 8)
        ) + 'px';
      } else if (placement === 'map') {
        const topBarBottom = byId('top').getBoundingClientRect().bottom;
        const above = anchorRect.top - tooltipRect.height - 8;

        tooltip.style.top = (
          above >= topBarBottom + 4 ? above : anchorRect.bottom + 8
        ) + 'px';
      } else {
        const menuTop = byId('bottom').getBoundingClientRect().top;
        tooltip.style.top = Math.max(4, menuTop - tooltipRect.height - 6) + 'px';
      }
    },

    hideTooltip() {
      this.tooltipOwner = null;
      this.mapTooltipKey = null;

      if (this.tooltipElement) {
        this.tooltipElement.style.display = 'none';
      }
    },

    // ---- Stilar -----------------------------------------------------------------------------

    injectStyles() {
      if (byId('buildMenuStyles')) return;

      const style = document.createElement('style');
      style.id = 'buildMenuStyles';

      style.textContent = `
        body {
          --resursIconSize: 32px;
        }
        #bottom.build-menu {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
          overflow: visible;
        }

        #bottom .build-categories {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        #bottom .build-submenu {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding-top: 6px;
          border-top: 1px solid var(--line);
          max-height: 40vh;
          overflow-y: auto;
        }

        #bottom .build-submenu[hidden] {
          display: none;
        }

        #bottom .icon-button {
          flex: 0 0 auto;
          width: 48px;
          height: 48px;
          padding: 5px;
          display: grid;
          place-items: center;
        }

        #bottom .building-option { position: relative; }

        /* Antal byggda av byggnaden, i nedre högra hörnet av knappen */
        #bottom .build-count {
          position: absolute;
          right: 2px;
          bottom: 2px;
          min-width: 15px;
          padding: 0 3px;
          border-radius: 8px;
          background: rgb(0 0 0 / 70%);
          color: #fff;
          font: 700 11px/15px system-ui, sans-serif;
          text-align: center;
          pointer-events: none;
        }

        #bottom .build-category-toggle[aria-expanded="true"] {
          border-color: var(--accent);
          background: #26402b;
        }

        #bottom .building-option.unaffordable .icon {
          opacity: .4;
        }
        #bottom .building-option.unaffordable {
          border-color: var(--bad-line);
          background: #35201f linear-gradient(var(--bad-bg), var(--bad-bg));
        }
        /* Låst är inte samma sak som för dyrt: grått, streckad ram, överstruken och med hänglås (för dyrt är rött) */
        #bottom .building-option.locked {
          border: 1px dashed #66717a;
          background: #1a1f24;
        }
        #bottom .building-option.locked::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(to top right, transparent calc(50% - 1.5px), #8b969f calc(50% - 1.5px), #8b969f calc(50% + 1.5px), transparent calc(50% + 1.5px));
          pointer-events: none;
          z-index: 1;
        }

        .icon {
          position: relative;
          display: block;
          width: 36px;
          height: 36px;
        }

        .icon-fallback {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          border-radius: 6px;
          background: #3a444d;
          color: #111;
          font-size: 20px;
          font-weight: 700;
          line-height: 1;
        }

        .icon-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: none;
          image-rendering: pixelated;
          pointer-events: none;
        }

        .icon.has-image .icon-image {
          display: block;
        }

        .icon.has-image .icon-fallback {
          display: none;
        }

        #buildTooltip {
          position: fixed;
          z-index: 150;
          display: none;
          pointer-events: none;
          max-width: 240px;
          padding: 6px 9px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #1b2127;
          color: var(--text);
          font-size: 12px;
          line-height: 1.35;
        }

        #copyrightLabel {
          position: fixed;
          right: 6px;
          bottom: 3px;
          z-index: 20;
          pointer-events: none;
          font-size: 10px;
          line-height: 1;
          color: var(--dim);
          opacity: 0.6;
        }

        #buildTooltip .tooltip-title {
          font-weight: 600;
        }

        #buildTooltip .tooltip-cost {
          color: var(--dim);
        }

        #buildTooltip .tooltip-detail kbd {
          display: inline-block;
          min-width: 18px;
          padding: 0 5px;
          border: 1px solid #5b6670;
          border-bottom-width: 2px;
          border-radius: 4px;
          background: #252d34;
          text-align: center;
          font: inherit;
          font-weight: 600;
        }

        #buildTooltip .tooltip-detail {
          color: var(--dim);
        }

        #goalPanel {
          position: fixed;
          left: 8px;
          top: 48px;
          z-index: 30;
          max-width: min(280px, calc(100vw - 16px));
          padding: 6px 9px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: rgb(27 33 39 / 88%);
          color: var(--text);
          font-size: 12px;
          line-height: 1.45;
          cursor: pointer;
          overflow-y: auto;
        }

        #goalPanel.collapsed .goal-item,
        #goalPanel.collapsed .goal-new {
          display: none;
        }

        #goalPanel .goal-item.done {
          color: #7bd88f;
        }

        #goalPanel .goal-next {
          margin-left: 6px;
          padding: 2px 8px;
          font-size: 12px;
        }

        #goalPanel .goal-new {
          margin-top: 4px;
          color: var(--dim);
        }

        #bottom .building-option.locked .icon {
          opacity: .35;
          filter: grayscale(1);
        }
        /* Stort hänglås över låsta byggnader */
        #bottom .building-option.locked::after {
          content: '🔒';
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          font-size: 26px;
          text-shadow: 0 2px 6px #000;
          pointer-events: none;
          z-index: 2;
        }
        #bottom .building-option.locked .build-count { display: none; }

        .level-stars {
          font-size: 34px;
          text-align: center;
          letter-spacing: 6px;
          color: #e5bc58;
        }

        .info-res {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          margin-right: 6px;
          vertical-align: middle;
        }

        .info-res-icon {
          display: inline-block;
          width: 16px;
          height: 16px;
          border-radius: 3px;
          object-fit: contain;
          image-rendering: pixelated;
        }

        .info-short {
          color: #e5736f;
        }
        .info-dim {
          opacity: .45;
        }

        /* Import och export i infopanelen */
        .trade-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 2px 10px;
          margin-top: 3px;
        }
        .trade-label {
          min-width: 78px;
          color: var(--dim);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .trade-any { display: inline-flex; align-items: center; gap: 3px; }
        .trade-any i { color: var(--dim); font-style: normal; }
        .trade-any b { margin-left: 3px; font-weight: normal; }
        .trade-any b.info-short { color: #e5736f; }

        /* Resursfält */

        #top.resource-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        #top .resource-pinned {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }

        #top .resource-pinned::-webkit-scrollbar {
          display: none;
        }

        #top .resource-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
          flex-shrink: 0;
        }

        #top .resource-window-toggle {
          white-space: nowrap;
        }

        #top .resource-compact {
          display: flex;
          align-items: center;
          gap: 5px;
          flex: 0 0 auto;
          white-space: nowrap;
        }

        .resource-icon {
          display: inline-grid;
          place-items: center;
          width: 22px;
          height: 22px;
          flex: 0 0 22px;
          overflow: hidden;
          border-radius: 4px;
          background: #3a444d;
        }

        .resource-icon img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          image-rendering: pixelated;
        }

        .resource-amount {
          font-variant-numeric: tabular-nums;
        }

        .resource-amount.is-full {
          color: #f0a040;
          font-weight: 700;
        }

        /* Resursfönster */

        .resource-window-overlay[hidden],
        #resourceWindowOverlay[hidden] {
          display: none;
        }

        .resource-window-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgb(0 0 0 / 65%);
        }

        .resource-window {
          width: min(520px, 100%);
          max-height: min(85vh, 680px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: #1b2127;
          color: var(--text);
          box-shadow: 0 12px 40px rgb(0 0 0 / 40%);
        }

        .resource-window-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--line);
        }

        .resource-window-header strong {
          font-size: 15px;
        }

        .resource-window-close {
          width: 32px;
          height: 32px;
          font-size: 22px;
          line-height: 1;
        }

        .resource-window-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          padding: 10px;
          overflow-y: auto;
        }

        .market-coins { margin-left: auto; margin-right: 12px; }
        .market-bar { display: flex; justify-content: space-between; gap: 8px; padding: 10px 14px 0; }
        .market-group { display: flex; gap: 4px; }
        .market-list { display: flex; flex-direction: column; gap: 4px; padding: 10px 14px 14px; overflow-y: auto; }
        .market-row { display: grid; grid-template-columns: minmax(0, 1fr) 70px 44px 128px; align-items: center; gap: 8px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; font-size: 12px; background: rgb(255 255 255 / 2%); }
        .market-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .market-stock { color: var(--dim); text-align: right; }
        .market-trade { white-space: nowrap; padding: 4px 8px; }
        @media (max-width: 520px) { .market-row { grid-template-columns: minmax(0, 1fr) 44px 112px; } .market-stock { display: none; } }

        .resource-detail.is-hidden { display: none; }
        .resource-detail.is-clickable { cursor: pointer; }
        .resource-detail.is-clickable:hover { background: rgb(255 255 255 / 6%); }
        .resource-detail.is-selected { border-color: #e5bc58; background: rgb(229 188 88 / 10%); }

        .resource-flow { max-height: 240px; overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; padding: 10px 14px 12px; border-top: 1px solid var(--line); font-size: 12px; }
        .resource-flow-title { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: baseline; }
        .resource-flow-title strong { font-size: 14px; }
        .resource-flow-net { color: #6ec27b; font-weight: 600; }
        .resource-flow-net.is-negative { color: #e5534b; }
        .resource-flow-column h4 { margin: 0 0 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--dim); }
        .resource-flow-row { position: relative; display: flex; justify-content: space-between; gap: 8px; padding: 2px 6px; margin-bottom: 2px; overflow: hidden; border-radius: 3px; }
        .resource-flow-row.is-idle { color: var(--dim); }
        .resource-flow-row.is-locked { opacity: .6; }
        .resource-flow-bar { position: absolute; inset: 0 auto 0 0; background: rgb(255 255 255 / 10%); }
        .resource-flow-label, .resource-flow-value { position: relative; white-space: nowrap; }
        .resource-flow-none, .resource-flow-hint, .resource-flow-note { color: var(--dim); }
        .resource-flow-hint { grid-column: 1 / -1; margin: 0; }
        .resource-flow-note { grid-column: 1 / -1; margin: 2px 0 0; font-size: 11px; }

        .resource-detail {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          padding: 8px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: rgb(255 255 255 / 2%);
        }

        .resource-detail .resource-name {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
        }

        .resource-detail .resource-amount {
          font-size: 24px;
          font-weight: 600;
        }
        .resource-detail .resource-icon {
          width: var(--resursIconSize);
          height: var(--resursIconSize);
          flex: 0 0 var(--resursIconSize);
        }

        .resource-favorite {
          flex: 0 0 var(--resursIconSize);
          width: var(--resursIconSize);
          height: var(--resursIconSize);
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--dim);
          font-size: 32px;
          cursor: pointer;
          transition: color 200ms;
        }
        .resource-favorite:hover {
          color: #fff;
        }

        .resource-favorite.is-favorite {
          color: #e5bc58;
        }

        /* Huvudmeny */

        #mainMenuOverlay[hidden] {
          display: none;
        }

        .main-menu {
          width: min(360px, 100%);
          max-height: min(92vh, 720px);
        }

        .main-menu.is-wide {
          width: min(780px, 100%);
          max-height: min(92vh, 780px);
        }

        .main-menu-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          overflow-y: auto;
        }

        .main-menu-level {
          color: var(--dim);
          font-size: 12px;
          text-align: center;
        }

        .main-menu-note {
          font-size: 13px;
          line-height: 1.4;
        }

        .main-menu-button {
          padding: 10px 12px;
          font-size: 14px;
          text-align: left;
        }

        .main-menu-gap { height: 6px; flex: none; }

        .main-menu-icon {
          display: inline-block;
          width: 28px;
          margin-right: 6px;
          text-align: center;
          font-size: 17px;
        }

        .main-menu-button:disabled {
          opacity: .4;
          cursor: default;
        }

        .main-menu-slot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .main-menu-slot-meta {
          color: var(--dim);
          font-size: 12px;
        }

        .main-menu-danger {
          border-color: #e5736f;
          color: #e5736f;
        }

        @media (max-width: 520px) {
          .resource-window-list {
            grid-template-columns: minmax(0, 1fr);
          }

          #top .resource-pinned {
            gap: 7px;
          }

          #top .resource-compact .resource-name {
            display: none;
          }
        }

        /* Menyknappar: större tryckytor på mobil (pekskärm eller smal skärm) */
        @media (pointer: coarse), (max-width: 520px) {
          #mainMenuButton {
            min-width: 44px;
            min-height: 44px;
            font-size: 20px;
          }

          .main-menu-button {
            min-height: 48px;
            padding: 12px 14px;
            font-size: 16px;
          }

          .main-menu .resource-window-close {
            width: 44px;
            height: 44px;
            font-size: 26px;
          }

          .main-menu-slot-meta {
            font-size: 13px;
          }
        }
      `;

      document.head.appendChild(style);
    },

    // ---- Uppdatering varje bildruta ----------------------------------------------------------

    refresh() {
      const game = CityBuilder.Game;

      for (const resourceId in Config.resources) {
        const amount = Economy.totalAmount(resourceId);

        const full = amount >= Economy.capacity(resourceId); // lagertaket nått: siffran blir orange

        const topAmount = byId('amount_' + resourceId);
        if (topAmount) { topAmount.textContent = amount; topAmount.classList.toggle('is-full', full); }

        const windowAmount = byId('resourceWindowAmount_' + resourceId);
        if (windowAmount) { windowAmount.textContent = amount; windowAmount.classList.toggle('is-full', full); }
      }
      if (this.resourceWindowOpen) { this.renderResourceFlow(); this.updateKnownResources(); }
      this.updateMarket();

      const carriers = World.units.filter(unit => unit.definition.isHauler && unit.player === CityBuilder.Players.HUMAN);
      const idleCarriers = carriers.filter(
        unit => !unit.deliveryTask && !unit.carriedResource
      ).length;

      byId('carrierCount').textContent =
        t('Carriers {idle}/{total}', { idle: idleCarriers, total: carriers.length });

      const builtCounts = {};
      for (const placed of World.buildings) if (placed.player === CityBuilder.Players.HUMAN) builtCounts[placed.type] = (builtCounts[placed.type] || 0) + 1;

      for (const buildingId in Config.buildings) {
        const button = byId('build_' + buildingId);
        if (!button) continue;

        // Antal byggnader av typen (inklusive de som byggs). Siffran ritas om bara när den ändras.
        let badge = button.countBadge;
        if (!badge || !badge.isConnected) {
          badge = button.countBadge = document.createElement('span');
          badge.className = 'build-count';
          badge.hidden = true;
          button.appendChild(badge);
        }
        const builtCount = builtCounts[buildingId] || 0;
        if (badge.count !== builtCount) { badge.count = builtCount; badge.textContent = builtCount; badge.hidden = !builtCount; }

        const isSelected = game.placingType === buildingId;

        button.classList.toggle('on', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
        button.classList.toggle(
          'unaffordable',
          !button.classList.contains('locked') && !Economy.canAfford(Config.buildings[buildingId].buildCost)
        );
      }

      // Avmarkera vald byggnad när en ny byggnad skapats.
      const buildingCount = Utils.sumValues(builtCounts); // bara spelarens egna byggnader

      if (buildingCount > this.lastBuildingCount && game.placingType && !Config.buildings[game.placingType].repeatPlacement) {
        game.setPlacingType(null);
      }

      this.lastBuildingCount = buildingCount;

      this.refreshGoals();
      this.updateInspection(game);
      this.refreshInfoPanel(game);
      this.updateMapTooltip(game);
      this.positionInfoPanel();
    },

    // ---- Beskrivningar och inspektion (byggnader, terrängnoder) ------------------------------

    terrainName(terrainType) {
      return I18n().nameOf('terrain', terrainType, Config.terrain[terrainType]?.name || TERRAIN_NAMES[terrainType]);
    },

    resourceName(resourceId) {
      return I18n().nameOf('resource', resourceId, Config.resources[resourceId]?.name);
    },

    unitName(unitId) {
      return I18n().nameOf('unit', unitId);
    },

    // Byggnadens id (nyckeln i Config.buildings) för en definition
    buildingIdOf(definition) {
      return Object.keys(Config.buildings).find(id => Config.buildings[id] === definition);
    },

    // Översatt namn från byggnadens id eller definition
    buildingName(idOrDefinition) {
      const id = typeof idOrDefinition === 'string' ? idOrDefinition : this.buildingIdOf(idOrDefinition);
      const definition = typeof idOrDefinition === 'string' ? Config.buildings[idOrDefinition] : idOrDefinition;
      return I18n().nameOf('building', id, definition?.name);
    },

    // En resurs som ikon (bild, annars färgruta) med namnet som hover. amount utelämnat = bara ikonen. className 'info-short' = röd (saknas).
    resourceChip(resourceId, amount, className = '') {
      const resource = Config.resources[resourceId] || {};
      const name = this.resourceName(resourceId).replace(/"/g, '&quot;'), color = resource.color || '#3a444d';
      // Saknas bildfilen (t.ex. nya resurser utan grafik än) visas resursens färgruta i stället
      const icon = resource.image && Config.settings.useImages !== false
        ? `<img class="info-res-icon" src="${resource.image}" alt="${name}" draggable="false" style="background:${color}" onerror="this.removeAttribute('src');this.removeAttribute('alt')">`
        : `<span class="info-res-icon" style="background:${color}"></span>`;
      return `<span class="info-res ${className}" title="${name}">${icon}${amount === undefined ? '' : amount}</span>`;
    },

    // { wood: 2 } -> ikoner med antal (infopanelen, verktygstips). Antal 0 hoppas över.
    // Vad byggnaden importerar (hämtar från lagret) och exporterar (levererar till lagret), alltid, även när lagret är tomt.
    // Import: mängd i huset / mest huset håller (röd när det saknas). Alternativa varor (äter kött / fisk / bröd) visas som en grupp.
    // Export: mängd som väntar på att hämtas (grå när det inte finns något just nu).
    tradeOf(building) {
      const definition = building.definition, job = definition.job, Behaviors = CityBuilder.Behaviors;
      if (!job) return { imports: [], exports: [] };
      const stock = building.inputStock;
      const imports = Object.entries(CityBuilder.Garrison.isGarrison(building) ? Object.fromEntries(Object.entries(Config.units[CityBuilder.Garrison.trainingType(building)].training.inputs).map(([id, amount]) => [id, Behaviors.inputBuffer(amount)])) : Behaviors.requiredResources(building))
        .map(([id, capacity]) => ({ ids: [id], have: stock[id] || 0, capacity }));
      for (const group of Behaviors.eatGroups(building)) imports.push({ ids: group.any, have: Behaviors.eatStock(building, group) });

      const made = job.kind === 'craft' ? Behaviors.recipe(building).outputs : job.outputs && Object.keys(job.outputs).length ? job.outputs : job.outputResource ? { [job.outputResource]: 1 } : {};
      const exports = Object.keys({ ...made, ...building.outputStock }).map(id => ({ ids: [id], have: building.outputStock[id] || 0 }));
      return { imports, exports };
    },

    tradeHtml(building) {
      const { imports, exports } = this.tradeOf(building);
      const row = (icon, label, title, entries, missingClass) => entries.length
        ? `<div class="trade-row" title="${title}"><span class="trade-label">${icon} ${label}</span>${entries.map(entry => {
          const amount = entry.capacity ? `${entry.have}/${entry.capacity}` : entry.have;
          const cls = entry.have > 0 ? '' : missingClass;
          return entry.ids.length > 1
            ? `<span class="trade-any">${entry.ids.map(id => this.resourceChip(id)).join('<i>/</i>')}<b class="${cls}">${amount}</b></span>`
            : this.resourceChip(entry.ids[0], amount, cls);
        }).join('')}</div>`
        : '';
      return row('⬇', t('Imports'), t('Delivered here by carriers'), imports, 'info-short') +
        row('⬆', t('Exports'), t('Carried from here to storage'), exports, 'info-dim');
    },

    resourceIconsHtml(amounts, shortage) {
      return Object.entries(amounts || {})
        .filter(([, amount]) => amount > 0)
        .map(([resourceId, amount]) => this.resourceChip(resourceId, amount, shortage && Economy.freeAmount(resourceId) < amount ? 'info-short' : ''))
        .join('');
    },

    // Statustext där resurser visas som ikoner: "Missing: Iron (2)" -> Saknas: [järn] (2)
    statusHtml(text) {
      text = I18n().canonicalStatus(text || '');
      if (!text.startsWith('Missing: ')) return I18n().status(text);
      const idOf = name => Object.keys(Config.resources).find(id => Config.resources[id].name === name);
      const list = text.slice('Missing: '.length).split(', ').map(part => {
        const match = /^(.*) \((\d+)\)$/.exec(part);
        const chips = (match ? match[1] : part).split(' / ').map(name => idOf(name) ? this.resourceChip(idOf(name)) : t(name)).join(' / ');
        return match ? `${chips} (${match[2]})` : chips;
      }).join(' ');
      return t('Missing: {list}', { list });
    },

    // Effektivitet senaste minuten: "Efficiency 62% · Missing: Iron 25%, Local stock full 13%". Tom tills det finns data.
    efficiencyText(building) {
      const summary = building.eff && building.eff.summary;
      if (!summary || building.buildProgress < 1 || !building.definition.job) return '';
      const reasons = summary.reasons.slice(0, 3).map(([reason, share]) => `${this.statusHtml(reason)} ${Math.round(share * 100)}%`).join(', ');
      return t('Efficiency {percent}%', { percent: Math.round(summary.ratio * 100) }) + (reasons ? ' · ' + reasons : '');
    },

    // Vad en byggnad är till för, som en lista med korta rader
    // Går byggnadens boost att få tag på ännu? Det räcker att en byggnad som tillverkar varan är upplåst.
    boostAvailable(definition) {
      const boost = definition.job && CityBuilder.Behaviors.boostOf(definition);
      if (!boost) return false;
      const levels = CityBuilder.Levels;
      return Object.entries(Config.buildings).some(([id, other]) => other.job?.outputs && boost.resource in other.job.outputs && (!levels || levels.isUnlocked(id)));
    },

    describeBuilding(definition) {
      const lines = [];
      const job = definition.job;

      if (definition.isStorage) lines.push(t('Stores resources'));
      if (definition.isStorage && definition.carriers) lines.push(t('Adds {n} carriers', { n: definition.carriers }));
      if (definition.isMarket) lines.push(t('Buy and sell goods for coins. Click it to trade.'));
      if (definition.aura) {
        lines.push(t('Boosts all your buildings within {n} tiles: output +{yield}%, soldiers train {training}% faster',
          { n: definition.aura.radius, yield: Math.round(definition.aura.yield * 100), training: Math.round(definition.aura.training * 100) }));
        lines.push(t('Only one can be built'));
      }

      if (job?.kind === 'gather') {
        const output = this.resourceChip(job.outputResource ?? Object.keys(job.outputs || {})[0]);
        lines.push(job.sourceUnit
          ? t('Hunting: {source} → {output}', { source: Array.isArray(job.sourceUnit) ? t('Animals') : this.unitName(job.sourceUnit), output })
          : t('Gathering: {source} → {output}', { source: this.terrainName(job.sourceTerrain), output }));
        if (this.getBuildingRange(definition)) lines.push(t('Range: {n} tiles', { n: this.getBuildingRange(definition) }));
      } else if (job?.kind === 'craft' && job.choices) {
        for (const { inputs, outputs } of job.choices) lines.push(t('Processing: {inputs} → {outputs}', { inputs: this.resourceIconsHtml(inputs), outputs: this.resourceIconsHtml(outputs) }));
        lines.push(t('Choose what it makes in the info panel'));
      } else if (job?.kind === 'craft') {
        const inputs = this.resourceIconsHtml(job.inputs);
        const outputs = this.resourceIconsHtml(job.outputs);
        lines.push(inputs ? t('Processing: {inputs} → {outputs}', { inputs, outputs }) : t('Producing: {outputs}', { outputs }));
      } else if (job?.kind === 'plant') {
        lines.push(t('Plants a tree {min}-{max} tiles away: {inputs} → {wood} wood', {
          min: job.minRadius, max: job.maxRadius, inputs: this.resourceIconsHtml(job.inputs), wood: job.amount.join('-'),
        }));
      } else if (job?.kind === 'garrison') {
        lines.push(t('Houses up to {n} soldiers', { n: job.capacity }));
        lines.push(t('Trains: {list}', { list: job.trains.map(kind => this.unitName(kind)).join(', ') }));
        lines.push(t('Range: {n} tiles', { n: this.getBuildingRange(definition) }));
      }

      if (definition.placeOnTerrain) {
        lines.push(t('Placed on: {terrain}', { terrain: this.terrainName(definition.placeOnTerrain) }));
      }

      const boost = job && this.boostAvailable(definition) && CityBuilder.Behaviors.boostOf(definition);
      if (boost) {
        const effect = boost.speed ? t('training {n}% faster', { n: Math.round(boost.speed * 100) }) : t('output +{n}%', { n: Math.round(boost.yield * 100) });
        lines.push(t('Boost with {item}: {effect}', { item: this.resourceChip(boost.resource), effect }));
      }

      const equipment = this.resourceIconsHtml(definition.requiredEquipment);
      if (job && equipment) lines.push(t('Requires: {equipment}', { equipment }));
      for (const group of [].concat(job?.eats || [])) lines.push(t('Needs: {food}', { food: group.any.map(id => this.resourceChip(id)).join(' / ') }));

      return lines;
    },

    // En terrängnod är en ruta man kan samla från, eller som blockerar (träd, sten, malm, vatten ...).
    // Gräs och andra "tomma" rutor är inte noder.
    getTerrainNode(x, y) {
      if (!CityBuilder.Vision.visible(CityBuilder.Players.HUMAN, x, y)) return null;   // dimma: inget att inspektera
      const tile = World.getTile(x, y);
      const terrain = Config.terrain[tile.terrainType];

      if (!terrain || !(terrain.resourceAmount > 0 || terrain.walkCost === Infinity)) return null;

      return { tile, terrain, name: this.terrainName(tile.terrainType) };
    },

    describeTerrainNode(node) {
      const { tile, terrain } = node;
      const lines = [];

      if (terrain.resourceAmount > 0 && terrain.resourceAmount < 10000) {
        lines.push(t('Remaining: {amount} of {total}', { amount: tile.remainingAmount, total: Math.max(terrain.resourceAmount, tile.remainingAmount) }));
      }

      if (terrain.walkCost === Infinity) lines.push(t('Blocked terrain'));
      else if (terrain.walkCost > 1.5) lines.push(t('Slow terrain'));

      const gatheredBy = [], buildableWith = [];
      for (const [buildingId, building] of Object.entries(Config.buildings)) {
        if (building.job?.kind === 'gather' && building.job.sourceTerrain === tile.terrainType) gatheredBy.push(this.buildingName(buildingId));
        if (building.placeOnTerrain === tile.terrainType) buildableWith.push(this.buildingName(buildingId));
      }
      if (gatheredBy.length) lines.push(t('Gathered by: {list}', { list: gatheredBy.join(', ') }));
      if (buildableWith.length) lines.push(t('Can be built with: {list}', { list: buildableWith.join(', ') }));

      return lines;
    },

    // Anropas av Input vid tryck på en ruta utan byggnad. null (eller en ruta som inte är en nod) avmarkerar.
    inspectTile(tile) {
      this.inspectedTile = tile && this.getTerrainNode(tile.x, tile.y)
        ? { x: tile.x, y: tile.y }
        : null;

      byId('info').dataset.buildingId = ''; // tvinga infopanelen att byggas om
    },

    updateInspection(game) {
      if (game.selectedBuilding || game.placingType) {
        this.inspectedTile = null;
      } else if (this.inspectedTile && !this.getTerrainNode(this.inspectedTile.x, this.inspectedTile.y)) {
        this.inspectedTile = null; // noden är slut
      }
    },

    // Vit ram runt den markerade terrängnoden
    initMapInspection() {
      CityBuilder.Renderer.addLayer('inspectedTile', (context, renderer) => {
        if (!this.inspectedTile) return;

        const size = renderer.tileSize;
        context.strokeStyle = '#fff';
        context.lineWidth = 2;
        context.strokeRect(this.inspectedTile.x * size + 1, this.inspectedTile.y * size + 1, size - 2, size - 2);
      });

      // Räckvidd: en gul cirkel runt vald (eller hovrad) byggnad som samlar från terrängen.
      // En ruta är inom räckhåll när avståndet till byggnaden är högst searchRadius (samma regel som i behaviors.js).
      CityBuilder.Renderer.addLayer('buildingRange', (context, renderer) => {
        const game = CityBuilder.Game;
        const input = CityBuilder.Input;
        const tile = renderer.hoverTile;
        const hovering = input && input.mouseOverMap && !input.dragging && tile && !game.placingType;
        const hovered = hovering ? World.seenBuildingAt(tile.x, tile.y) : null;
        const size = renderer.tileSize;

        for (const building of new Set([game.selectedBuilding, hovered])) {
          const range = building && !building.removed ? this.getBuildingRange(building.definition) : 0;
          if (!range) continue;

          context.beginPath();
          context.arc((building.x + 0.5) * size, (building.y + 0.5) * size, range * size, 0, Math.PI * 2);
          context.fillStyle = 'rgba(255, 214, 90, 0.12)';
          context.fill();
          context.lineWidth = 2;
          context.strokeStyle = 'rgba(255, 214, 90, 0.5)';
          context.stroke();
        }
      });
    },

    // Hur många rutor en byggnad når (0 om den inte har någon räckvidd)
    getBuildingRange(definition) {
      const job = definition && definition.job;
      return job && (job.kind === 'gather' || job.kind === 'garrison') && job.searchRadius > 0 ? job.searchRadius : 0;
    },

    // Hover-tooltip för byggnader och terrängnoder under musen (inte på pekskärm, inte vid panorering)
    updateMapTooltip(game) {
      const input = CityBuilder.Input;
      const renderer = CityBuilder.Renderer;
      const tile = renderer.hoverTile;

      const active = input && input.mouseOverMap && !input.dragging && tile && !game.placingType;

      const building = active ? World.seenBuildingAt(tile.x, tile.y) : null;
      const node = active && !building ? this.getTerrainNode(tile.x, tile.y) : null;

      if (!building && !node) {
        if (this.tooltipOwner === 'map') this.hideTooltip();
        return;
      }

      const size = renderer.tileSize * renderer.zoom;
      const left = (tile.x * renderer.tileSize - renderer.camera.x) * renderer.zoom;
      const top = (tile.y * renderer.tileSize - renderer.camera.y) * renderer.zoom;
      const rect = { left, top, width: size, height: size, right: left + size, bottom: top + size };

      const key = (building
        ? (building.player === CityBuilder.Players.HUMAN
          ? `b${building.id}:${I18n().language}:${building.status}:${building.buildProgress < 1 ? this.timeLeft(building) : 'done'}:${this.efficiencyText(building)}`
          : `e${building.id}:${I18n().language}:${Math.ceil(building.hp)}:${building.buildProgress < 1 ? this.timeLeft(building) : 'done'}`)
        : `t${tile.x},${tile.y}:${node.tile.remainingAmount}`) +
        `@${Math.round(left)},${Math.round(top)},${Math.round(size)}`;

      if (key === this.mapTooltipKey && this.tooltipOwner === 'map') return;

      const enemy = building && building.player !== CityBuilder.Players.HUMAN;
      const content = building
        ? this.tooltipContent(
            this.buildingName(building.definition),
            null,
            [
              ...(building.buildProgress < 1 ? [t('Constructing {time}', { time: this.timeLeft(building) })] : []),
              ...(enemy ? [t('Health: {hp}/{max}', { hp: Math.ceil(building.hp), max: Math.ceil(building.maxHp) })] : [
                ...(this.efficiencyText(building) ? [this.efficiencyText(building)] : []),
                ...this.describeBuilding(building.definition),
              ]),
            ]
          )
        : this.tooltipContent(node.name, null, this.describeTerrainNode(node));

      this.showTooltip({ getBoundingClientRect: () => rect }, content, 'map');
      this.mapTooltipKey = key;
    },

    // Infopanelen visar, i prioritetsordning: vald byggnad, byggnad som håller på att placeras, markerad terrängnod
    refreshInfoPanel(game) {
      const panel = byId('info');

      if (game.selectedBuilding) {
        this.renderBuildingInfo(panel, game.selectedBuilding);
      } else if (game.placingType) {
        this.renderPlacementInfo(panel, game);
      } else if (this.inspectedTile) {
        this.renderTerrainInfo(panel, this.inspectedTile);
      } else {
        panel.style.display = 'none';
      }
    },

    renderBuildingInfo(panel, building) {
      const key = 'b' + building.id;
      panel.style.display = 'flex';

      if (panel.dataset.buildingId !== key) {
        panel.dataset.buildingId = key;

        // Andra spelares byggnader går bara att titta på
        const own = building.player === CityBuilder.Players.HUMAN;
        const pauseButton = own && building.definition.job
          ? '<button id="pauseButton"></button>'
          : '';

        const choiceButton = own && building.definition.job?.choices ? '<button id="choiceButton"></button>' : '';
        const marketButton = own && building.definition.isMarket && building.buildProgress >= 1 ? `<button id="marketButton">${t('Trade')}</button>` : '';
        const boostButton = own && this.boostAvailable(building.definition) ? '<button id="boostButton"></button>' : '';

        const demolishButton = own && building !== World.headquarters
          ? `<button id="demolishButton">${t('Demolish')}</button>`
          : '';

        // Garnisoner: en knapp per soldattyp som byggnaden kan träna
        const trainButtons = own && CityBuilder.Garrison.isGarrison(building)
          ? building.definition.job.trains.map(kind => `<button class="train-button" data-kind="${kind}">${this.unitName(kind)}</button>`).join('')
          : '';

        const stanceButton = own && CityBuilder.Garrison.isGarrison(building) ? '<button id="stanceButton"></button>' : '';

        panel.innerHTML =
          `<div><b>${this.buildingName(building.definition)}</b><br><span id="infoStatus"></span></div>` +
          `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${marketButton}${trainButtons}${stanceButton}${choiceButton}${boostButton}${pauseButton}${demolishButton}</div>`;

        if (byId('stanceButton')) {
          byId('stanceButton').onclick = () => {
            const Garrison = CityBuilder.Garrison;
            Garrison.setStance(building, Garrison.isAttacking(building) ? 'defend' : 'attack');
          };
        }

        for (const button of panel.querySelectorAll('.train-button')) {
          button.onclick = () => CityBuilder.Garrison.setTrainingType(building, button.dataset.kind);
        }

        if (byId('choiceButton')) {
          byId('choiceButton').onclick = () => { building.choice = ((building.choice || 0) + 1) % building.definition.job.choices.length; };
        }

        if (byId('marketButton')) byId('marketButton').onclick = () => this.openMarket();

        if (byId('boostButton')) {
          byId('boostButton').onclick = () => { building.boostOn = !building.boostOn; };
        }

        if (byId('pauseButton')) {
          byId('pauseButton').onclick = () => {
            building.paused = !building.paused;
          };
        }

        if (byId('demolishButton')) {
          byId('demolishButton').onclick = () => {
            CityBuilder.Game.demolish(building);
          };
        }
      }

      const statusText = building.buildProgress < 1
        ? t('Under construction {time}', { time: this.timeLeft(building) })
        : this.statusHtml(building.status);

      // Fiendens byggnader: bara namn, byggstatus och hälsa. Import, export, effektivitet, lager och soldater är spelarens egna uppgifter.
      const own = building.player === CityBuilder.Players.HUMAN;
      const range = this.getBuildingRange(building.definition);
      const trade = building.definition.isStorage || !own ? '' : this.tradeHtml(building);

      // Garnison: soldater (inne + ute), vald träning och vad den kostar, och markering av vald soldattyp
      let garrisonHtml = '';
      if (own && building.buildProgress >= 1 && CityBuilder.Garrison.isGarrison(building)) {
        const Garrison = CityBuilder.Garrison, chosen = Garrison.trainingType(building);
        const roster = Object.entries(Garrison.ensure(building).garrison)
          .map(([kind, count]) => `${count} ${lower(this.unitName(kind))}`).join(', ');
        const outside = building.deployed.length ? ` (${t('{n} out fighting', { n: building.deployed.length })})` : '';
        const training = building.isCrafting ? `${t('Training: {unit}', { unit: this.unitName(building.trainingUnit) })}<br>` : '';
        const cost = this.resourceIconsHtml(Config.units[chosen].training.inputs);
        garrisonHtml =
          `<br>${t('Soldiers: {n}/{max}', { n: Garrison.count(building), max: Garrison.capacity(building) })}${roster ? ' – ' + roster : ''}${outside}` +
          `<br>${training}${t('Next soldier: {unit}', { unit: this.unitName(chosen) })} ${cost}`;
        for (const button of byId('info').querySelectorAll('.train-button')) button.classList.toggle('on', button.dataset.kind === chosen);
      }

      const html = !own
        ? [building.buildProgress < 1 ? statusText : null, t('Health: {hp}/{max}', { hp: Math.ceil(building.hp), max: Math.ceil(building.maxHp) })].filter(Boolean).join('<br>')
        : building.definition.isStorage
        ? t('Storage: {list}', { list: this.resourceIconsHtml(building.storedGoods) || t('empty') })
        : statusText +
          (this.efficiencyText(building) ? `<br>${this.efficiencyText(building)}` : '') +
          garrisonHtml +
          trade +
          (range ? `<br>${t('Range: {n} tiles', { n: range })}` : '') +
          (building.hp < building.maxHp ? `<br>${t('Health: {hp}', { hp: Math.ceil(building.hp) })}` : '');

      // Uppdateras bara vid ändring, så att bilderna inte laddas om varje bildruta
      const status = byId('infoStatus');
      if (status.dataset.html !== html) {
        status.dataset.html = html;
        status.innerHTML = html;
      }

      if (byId('pauseButton')) {
        byId('pauseButton').textContent = t(building.paused ? 'Unpause' : 'Pause');
      }

      // Knapparnas innehåll sätts bara när det ändras, så att ikonerna inte laddas om varje bildruta
      const setButton = (id, html, on) => {
        const button = byId(id);
        if (!button) return;
        if (button.dataset.html !== html) { button.dataset.html = html; button.innerHTML = html; }
        button.classList.toggle('on', Boolean(on));
      };
      if (byId('choiceButton')) {
        const recipe = CityBuilder.Behaviors.recipe(building);
        setButton('choiceButton', `⇄ ${this.resourceIconsHtml(recipe.outputs)} ← ${this.resourceIconsHtml(recipe.inputs)}`);
        byId('choiceButton').dataset.baseTitle = t('Click to change what it makes');
      }
      this.applyHotkeyTitles(panel);
      if (byId('boostButton')) {
        const boost = CityBuilder.Behaviors.boostOf(building);
        setButton('boostButton', `${this.resourceChip(boost.resource)} ${t(building.boostOn ? 'Boost on' : 'Boost off')}`, building.boostOn);
        byId('boostButton').title = t('Uses {item} to make this building more productive', { item: this.resourceName(boost.resource) });
      }

      if (byId('stanceButton')) {
        const attacking = CityBuilder.Garrison.isAttacking(building);
        byId('stanceButton').textContent = t(attacking ? 'Attack mode' : 'Defence mode');
        byId('stanceButton').classList.toggle('on', attacking);
      }
    },

    // Byggnad vald i menyn: namn, kostnad och vad den gör (fungerar även utan hover, t.ex. på mobil)
    renderPlacementInfo(panel, game) {
      const buildingType = game.placingType;
      const definition = Config.buildings[buildingType];
      const key = 'p:' + buildingType;
      panel.style.display = 'flex';

      if (panel.dataset.buildingId !== key) {
        panel.dataset.buildingId = key;

        panel.innerHTML =
          `<div><b>${this.buildingName(buildingType)}</b><br><span id="infoStatus"></span></div>` +
          `<div style="display:flex;gap:6px"><button id="cancelPlacementButton">${t('Cancel')}</button></div>`;

        byId('cancelPlacementButton').onclick = () => game.setPlacingType(null);
      }

      const cost = this.resourceIconsHtml(definition.buildCost, true);

      byId('infoStatus').innerHTML = [
        t('Cost: {cost}', { cost: cost || '–' }),
        ...this.describeBuilding(definition),
      ].join('<br>');
    },

    renderTerrainInfo(panel, tilePosition) {
      const node = this.getTerrainNode(tilePosition.x, tilePosition.y);
      const key = `t:${tilePosition.x},${tilePosition.y}:${node.tile.terrainType}`;
      panel.style.display = 'flex';

      if (panel.dataset.buildingId !== key) {
        panel.dataset.buildingId = key;

        panel.innerHTML =
          `<div><b>${node.name}</b><br><span id="infoStatus"></span></div>` +
          `<div style="display:flex;gap:6px"><button id="closeInfoButton">${t('Close')}</button></div>`;

        byId('closeInfoButton').onclick = () => this.inspectTile(null);
      }

      byId('infoStatus').innerHTML = this.describeTerrainNode(node).join('<br>');
    },

    showToast(html) {
      const toast = byId('toast');
      toast.innerHTML = html;
      toast.style.display = 'block';
      // Centrerad längst ner, precis över det som ligger överst där nere (byggmenyn, och infopanelen när den är öppen)
      const info = byId('info'), infoTop = info && info.style.display !== 'none' ? info.getBoundingClientRect().top : Infinity;
      toast.style.bottom = Math.round(innerHeight - Math.min(infoTop, byId('bottom').getBoundingClientRect().top) + 8) + 'px';

      clearTimeout(this.toastTimer);

      this.toastTimer = setTimeout(() => {
        toast.style.display = 'none';
      }, Config.settings.toastDurationMs);
    },
  };

  CityBuilder.UI = UI;
})(window.CityBuilder);