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

      this.buildBuildMenu(buildMenu);
      this.initMapInspection();
      this.createVersionLabel();
      this.lastBuildingCount = World.buildings.length;

      // Infopanelen ligger precis ovanför byggmenyn.
      this.positionInfoPanel = () => {
        byId('info').style.bottom = (buildMenu.offsetHeight + 8) + 'px';
      };

      this.positionInfoPanel();
      addEventListener('resize', this.positionInfoPanel);

      // Språket byts direkt: allt som redan är uppritat ritas om
      I18n().onChange(() => this.applyLanguage());
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
    createVersionLabel() {
      if (byId('versionLabel')) return;
      const label = document.createElement('div');
      label.id = 'versionLabel';
      label.textContent = typeof version !== 'undefined' ? 'v' + version : '';
      document.body.appendChild(label);
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

    resourceTooltip(resourceId) {
      const resource = Config.resources[resourceId];
      const total = Economy.totalAmount(resourceId);
      const free = Economy.freeAmount ? Economy.freeAmount(resourceId) : total;
      const details = ['x' + total];
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

      dialog.append(header, list);
      overlay.appendChild(dialog);

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
        this.updateResourceFavoriteButtons();
        overlay.querySelector('.resource-window-close').focus();
      } else {
        button.focus();
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
      const button = (text, onclick, className = '') => {
        const element = make('button', 'main-menu-button ' + className, text);
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
            ? `${t('Level {level}', { level: entry.level })} · ${this.formatSaveTime(entry.savedAt)}`
            : t('Empty'))
        );
        return row;
      };

      const titles = {
        main: t('Main menu'), save: t('Save game'), load: t('Load game'), confirm: t('Are you sure?'),
        options: t('Settings'), stats: t('Statistics'),
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
        if (level) body.append(make('div', 'main-menu-level', t('Level {level}: {name}', { level: level.level, name: level.name })));
        body.append(
          button(t('Continue'), () => this.toggleMainMenu(false)),
          button(t('Save game'), () => this.renderMainMenu('save')),
          button(t('Load game'), entries.size ? () => this.renderMainMenu('load') : null),
          button(t('Statistics'), () => this.renderMainMenu('stats')),
          button(t('Settings'), () => this.renderMainMenu('options')),
          button(t('New game'), () => this.renderMainMenu('confirm', {
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
          }))
        );
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
      }

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
          tooltip: () => this.tooltipContent(t(category.name)),
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

          const button = this.createIconButton({
            id: 'build_' + buildingId,
            className: 'building-option',
            label: this.buildingName(buildingId),
            icon: {
              image: building.image,
              symbol: building.symbol,
              color: building.color
            },
            tooltip: () => this.tooltipContent(
              this.buildingName(buildingId),
              building.buildCost,
              this.describeBuilding(building)
            ),
          });

          button.setAttribute('aria-pressed', 'false');

          button.onclick = () => {
            const game = CityBuilder.Game;

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
        detail.textContent = line;
        content.appendChild(detail);
      }

      if (cost && Object.keys(cost).length) {
        const costLine = document.createElement('div');
        costLine.className = 'tooltip-cost';

        for (const [resourceId, amount] of Object.entries(cost)) {
          const part = document.createElement('span');
          const resource = Config.resources[resourceId];

          part.textContent = resource
            ? `${amount} ${lower(this.resourceName(resourceId))}`
            : `${amount} ${resourceId}`;

          if (Economy.freeAmount(resourceId) < amount) {
            part.className = 'tooltip-short';
          }

          costLine.appendChild(part);
        }

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

        #bottom .build-category-toggle[aria-expanded="true"] {
          border-color: var(--accent);
          background: #26402b;
        }

        #bottom .building-option.unaffordable .icon {
          opacity: .4;
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

        #versionLabel {
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

        #buildTooltip .tooltip-cost span + span::before {
          content: ', ';
        }

        #buildTooltip .tooltip-short {
          color: #e5736f;
        }

        #buildTooltip .tooltip-detail {
          color: var(--dim);
        }

        #info .info-short {
          color: #e5736f;
        }

        #info .info-resource {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          margin-right: 5px;
          vertical-align: middle;
        }

        #info .info-resource img {
          width: 18px;
          height: 18px;
          object-fit: contain;
          image-rendering: pixelated;
          vertical-align: middle;
        }

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

        /* Resursfönster */

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
          width: min(440px, 100%);
          max-height: min(75vh, 600px);
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

        .resource-detail {
          display: flex;
          align-items: center;
          gap: 8px;
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
          font-size: 13px;
          font-weight: 600;
        }

        .resource-favorite {
          flex: 0 0 26px;
          width: 26px;
          height: 26px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--dim);
          font-size: 19px;
          cursor: pointer;
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

        const topAmount = byId('amount_' + resourceId);
        if (topAmount) topAmount.textContent = amount;

        const windowAmount = byId('resourceWindowAmount_' + resourceId);
        if (windowAmount) windowAmount.textContent = amount;
      }

      const carriers = World.units.filter(unit => unit.definition.isHauler);
      const idleCarriers = carriers.filter(
        unit => !unit.deliveryTask && !unit.carriedResource
      ).length;

      byId('carrierCount').textContent =
        t('Carriers {idle}/{total}', { idle: idleCarriers, total: carriers.length });

      for (const buildingId in Config.buildings) {
        const button = byId('build_' + buildingId);
        if (!button) continue;

        const isSelected = game.placingType === buildingId;

        button.classList.toggle('on', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
        button.classList.toggle(
          'unaffordable',
          !Economy.canAfford(Config.buildings[buildingId].buildCost)
        );
      }

      // Avmarkera vald byggnad när en ny byggnad skapats.
      const buildingCount = World.buildings.length;

      if (buildingCount > this.lastBuildingCount && game.placingType) {
        game.setPlacingType(null);
      }

      this.lastBuildingCount = buildingCount;

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

    // { wood: 2, stone: 1 } -> "2 wood, 1 stone"
    formatResources(amounts) {
      return Object.entries(amounts || {})
        .filter(([, amount]) => amount > 0)
        .map(([resourceId, amount]) => `${amount} ${lower(this.resourceName(resourceId))}`)
        .join(', ');
    },

    formatResourceIcons(amounts) {
      return Object.entries(amounts || {})
        .filter(([, amount]) => amount > 0)
        .map(([resourceId, amount]) => {
          const resource = Config.resources[resourceId];

          if (resource?.image && Config.settings.useImages !== false) {
            return `<span class="info-resource" title="${this.resourceName(resourceId)}"><img src="${resource.image}" alt=""><span>${amount}</span></span>`;
          }

          return `<span class="info-resource">${amount} ${this.resourceName(resourceId)}</span>`;
        })
        .join('');
    },

    // Vad en byggnad är till för, som en lista med korta rader
    describeBuilding(definition) {
      const lines = [];
      const job = definition.job;

      if (definition.isStorage) lines.push(t('Stores resources'));
      if (definition.isWinBuilding) lines.push(t('Build this to win'));

      if (job?.kind === 'gather') {
        const output = this.resourceName(job.outputResource ?? Object.keys(job.outputs || {})[0]);
        lines.push(job.sourceUnit
          ? t('Hunting: {source} → {output}', { source: this.unitName(job.sourceUnit), output })
          : t('Gathering: {source} → {output}', { source: this.terrainName(job.sourceTerrain), output }));
        if (this.getBuildingRange(definition)) lines.push(t('Range: {n} tiles', { n: this.getBuildingRange(definition) }));
      } else if (job?.kind === 'craft') {
        const inputs = this.formatResources(job.inputs);
        const outputs = this.formatResources(job.outputs);
        lines.push(inputs ? t('Processing: {inputs} → {outputs}', { inputs, outputs }) : t('Producing: {outputs}', { outputs }));
      }

      if (definition.placeOnTerrain) {
        lines.push(t('Placed on: {terrain}', { terrain: this.terrainName(definition.placeOnTerrain) }));
      }

      const equipment = this.formatResources(definition.requiredEquipment);
      if (job && equipment) lines.push(t('Requires: {equipment}', { equipment }));

      return lines;
    },

    // En terrängnod är en ruta man kan samla från, eller som blockerar (träd, sten, malm, vatten ...).
    // Gräs och andra "tomma" rutor är inte noder.
    getTerrainNode(x, y) {
      const tile = World.getTile(x, y);
      const terrain = Config.terrain[tile.terrainType];

      if (!terrain || !(terrain.resourceAmount > 0 || terrain.walkCost === Infinity)) return null;

      return { tile, terrain, name: this.terrainName(tile.terrainType) };
    },

    describeTerrainNode(node) {
      const { tile, terrain } = node;
      const lines = [];

      if (terrain.resourceAmount > 0 && terrain.resourceAmount < 10000) {
        lines.push(t('Remaining: {amount} of {total}', { amount: tile.remainingAmount, total: terrain.resourceAmount }));
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
        const hovered = hovering ? World.buildingAt(tile.x, tile.y) : null;
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
      return job && job.kind === 'gather' && job.searchRadius > 0 ? job.searchRadius : 0;
    },

    // Hover-tooltip för byggnader och terrängnoder under musen (inte på pekskärm, inte vid panorering)
    updateMapTooltip(game) {
      const input = CityBuilder.Input;
      const renderer = CityBuilder.Renderer;
      const tile = renderer.hoverTile;

      const active = input && input.mouseOverMap && !input.dragging && tile && !game.placingType;

      const building = active ? World.buildingAt(tile.x, tile.y) : null;
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
        ? `b${building.id}:${I18n().language}:${building.status}:${Math.round(building.buildProgress * 100)}`
        : `t${tile.x},${tile.y}:${node.tile.remainingAmount}`) +
        `@${Math.round(left)},${Math.round(top)},${Math.round(size)}`;

      if (key === this.mapTooltipKey && this.tooltipOwner === 'map') return;

      const content = building
        ? this.tooltipContent(
            this.buildingName(building.definition),
            null,
            [
              ...(building.buildProgress < 1 ? [t('Constructing {percent}%', { percent: Math.round(building.buildProgress * 100) })] : []),
              ...this.describeBuilding(building.definition),
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

        const pauseButton = building.definition.job
          ? '<button id="pauseButton"></button>'
          : '';

        const demolishButton = building !== World.headquarters
          ? `<button id="demolishButton">${t('Demolish')}</button>`
          : '';

        panel.innerHTML =
          `<div><b>${this.buildingName(building.definition)}</b><br><span id="infoStatus"></span></div>` +
          `<div style="display:flex;gap:6px">${pauseButton}${demolishButton}</div>`;

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
        ? t('Under construction {percent}%', { percent: Math.round(building.buildProgress * 100) })
        : I18n().status(building.status);

      const imports = this.formatResourceIcons(building.inputStock);
      const exports = this.formatResourceIcons(building.outputStock);

      const tradeInfo = [
        imports
          ? t('Import: {list}', { list: imports })
          : '',
        exports
          ? t('Export: {list}', { list: exports })
          : ''
      ].filter(Boolean).join(' · ');

      byId('infoStatus').innerHTML = building.definition.isStorage
        ? t('Storage: {list}', {
            list: this.formatResources(building.storedGoods) || t('empty')
          })
        : statusText
          + (tradeInfo ? `<br>${tradeInfo}` : '')
          + (this.getBuildingRange(building.definition)
            ? `<br>${t('Range: {n} tiles', {
                n: this.getBuildingRange(building.definition)
              })}`
            : '');

      if (byId('pauseButton')) {
        byId('pauseButton').textContent = t(building.paused ? 'Unpause' : 'Pause');
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

      const cost = Object.entries(definition.buildCost || {})
        .map(([resourceId, amount]) => {
          const short = Economy.freeAmount(resourceId) < amount ? ' class="info-short"' : '';
          return `<span${short}>${amount} ${lower(this.resourceName(resourceId))}</span>`;
        })
        .join(', ');

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

      clearTimeout(this.toastTimer);

      this.toastTimer = setTimeout(() => {
        toast.style.display = 'none';
      }, Config.settings.toastDurationMs);
    },
  };

  CityBuilder.UI = UI;
})(window.CityBuilder);