/* Inställningar och statistik (visas i huvudmenyn av ui.js).

   - Language: engelska (standard), svenska, tyska, spanska. Byts direkt (se lang.js).
   - FPS counter: visas uppe till vänster, precis under resursfältet.
   - Frame rate: obegränsad eller 30 FPS (Game.frame hoppar över bildrutor som kommer för tidigt).
   - Autosave: 30 s, 1, 2, 5 eller 15 min (Save.setAutosaveInterval).
   - Shapes only: ritar kartan (canvas) utan bilder, med reservformerna och färgerna. Menyer påverkas inte.
   - Statistics: byggnader, arbetare, bärare, hjortar m.m.

   Att spelet pausas när fönstret förlorar fokus är inte en inställning: det ligger fast i Game.frame (game.js).

   Allt sparas i localStorage och återställs vid start. UI.init anropar Options.install(). */
(function (CityBuilder) {
  'use strict';

  const t = (text, variables) => CityBuilder.t(text, variables);

  const STORAGE_KEY = 'citybuilder.options';
  const AUTOSAVE_CHOICES = [
    [30000, '30 seconds'], [60000, '1 minute'], [120000, '2 minutes'], [300000, '5 minutes'], [900000, '15 minutes'],
  ];
  const FPS_CHOICES = [[0, 'Unlimited'], [30, '30 FPS']];
  const DEFAULTS = { showFps: false, autosaveMs: 30000, fpsLimit: 0, shapesOnly: false };

  const Options = {
    settings: { ...DEFAULTS },
    installed: false,
    playSeconds: 0, // spelad speltid denna session (räknas inte när spelet är pausat)

    load() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (typeof saved.showFps === 'boolean') this.settings.showFps = saved.showFps;
        if (typeof saved.shapesOnly === 'boolean') this.settings.shapesOnly = saved.shapesOnly;
        if (AUTOSAVE_CHOICES.some(([value]) => value === saved.autosaveMs)) this.settings.autosaveMs = saved.autosaveMs;
        if (FPS_CHOICES.some(([value]) => value === saved.fpsLimit)) this.settings.fpsLimit = saved.fpsLimit;
      } catch (error) { /* ingen lagring tillgänglig: standardvärden */ }
    },

    persist() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch (error) { /* ignoreras */ }
    },

    set(name, value) {
      this.settings[name] = value;
      this.persist();
      this.apply();
    },

    // Lägger in inställningarna i spelet
    apply() {
      if (this.fpsElement) {
        this.fpsElement.hidden = !this.settings.showFps;
        this.positionFpsCounter();
      }
      const save = CityBuilder.Save;
      if (save && save.setAutosaveInterval) save.setAutosaveInterval(this.settings.autosaveMs);
    },

    install() {
      if (this.installed) return;
      this.installed = true;
      this.load();
      this.injectStyles();
      this.createFpsCounter();
      this.wrapAssets();
      this.apply();
      addEventListener('resize', () => this.positionFpsCounter());
    },

    // Utan bilder returnerar Assets null, och rendereringslagren ritar reservformerna/färgerna
    wrapAssets() {
      const Assets = CityBuilder.Assets;
      if (!Assets) return;
      for (const method of ['get', 'getVariant']) {
        const original = Assets[method];
        if (typeof original !== 'function') continue;
        Assets[method] = (...args) => (this.settings.shapesOnly ? null : original.apply(Assets, args));
      }
    },

    // ---- FPS-räknare (Game.frame rapporterar varje ritad bildruta) ------------------------------

    createFpsCounter() {
      const element = document.createElement('div');
      element.id = 'fpsCounter';
      element.hidden = true;
      document.body.appendChild(element);
      this.fpsElement = element;
    },

    // Under målpanelen (som ligger under resursfältet), annars direkt under resursfältet
    positionFpsCounter() {
      const anchor = document.getElementById('goalPanel') || document.getElementById('top');
      if (this.fpsElement && anchor) this.fpsElement.style.top = (anchor.getBoundingClientRect().bottom + 4) + 'px';
    },

    // time: bildrutans tid (ms), frameMs: hur länge bildrutan tog att beräkna och rita, simulatedSeconds: speltid som gick
    recordFrame(time, frameMs, simulatedSeconds) {
      this.playSeconds += simulatedSeconds || 0;

      this.frames = (this.frames || 0) + 1;
      this.frameMs = (this.frameMs || 0) + frameMs;
      if (!this.windowStart) this.windowStart = time;
      if (time - this.windowStart < 500) return;

      const fps = this.frames * 1000 / (time - this.windowStart);
      if (this.settings.showFps && this.fpsElement) {
        this.positionFpsCounter();
        const units = CityBuilder.World ? CityBuilder.World.units.length : 0;
        this.fpsElement.textContent = `${Math.round(fps)} FPS · ${(this.frameMs / this.frames).toFixed(1)} ms · ${t('{n} units', { n: units })}`;
      }
      this.frames = 0; this.frameMs = 0; this.windowStart = time;
    },

    // ---- Vyer i huvudmenyn --------------------------------------------------------------------

    // body: menyns innehållselement, make(tag, className, text): elementtillverkare från ui.js
    fillOptions(body, make) {
      const I18n = CityBuilder.I18n;

      const row = (label, control, note) => {
        const element = make('div', 'options-row');
        const text = make('div', 'options-label');
        text.append(make('span', '', label));
        if (note) text.append(make('small', '', note));
        element.append(text, control);
        return element;
      };

      const toggle = name => {
        const button = make('button', 'options-toggle');
        button.type = 'button';
        const paint = () => {
          const on = this.settings[name];
          button.textContent = t(on ? 'On' : 'Off');
          button.classList.toggle('is-on', on);
          button.setAttribute('aria-pressed', String(on));
        };
        button.onclick = () => { this.set(name, !this.settings[name]); paint(); };
        paint();
        return button;
      };

      const select = (choices, current, onchange, translate = true) => {
        const element = make('select', 'options-select');
        for (const [value, label] of choices) {
          const option = make('option', '', translate ? t(label) : label);
          option.value = String(value);
          element.append(option);
        }
        element.value = String(current);
        element.onchange = () => onchange(element.value);
        return element;
      };

      body.append(
        row(t('Language'),
          select(I18n.languages.map(([code, name]) => [code, name]), I18n.language, code => I18n.setLanguage(code), false)),
        row(t('FPS counter'), toggle('showFps'), t('Shown below the resource bar')),
        row(t('Frame rate'),
          select(FPS_CHOICES, this.settings.fpsLimit, value => this.set('fpsLimit', Number(value))),
          t('30 FPS saves battery and processing power')),
        row(t('Autosave'),
          select(AUTOSAVE_CHOICES, this.settings.autosaveMs, value => this.set('autosaveMs', Number(value))),
          t('How often the game saves automatically')),
        ...(CityBuilder.Sound ? CityBuilder.Sound.settingRows(row, make) : []),
        row(t('Shapes only'), toggle('shapesOnly'), t('Draws the map without images (faster)')),
        make('div', 'main-menu-note', t('The game always pauses when the window loses focus.'))
      );
    },

    collectStats() {
      const { World, Config, Economy, Levels, Game } = CityBuilder;
      const stats = { buildingTypes: new Map() };

      stats.finished = 0; stats.underConstruction = 0;
      for (const building of World.buildings) {
        if (building.buildProgress >= 1) stats.finished++; else stats.underConstruction++;
        const id = building.type || '';
        const name = CityBuilder.I18n.nameOf('building', id, building.definition && building.definition.name);
        stats.buildingTypes.set(name, (stats.buildingTypes.get(name) || 0) + 1);
      }

      stats.workers = 0; stats.carriers = 0; stats.deer = 0; stats.otherUnits = 0; stats.units = 0;
      for (const unit of World.units) {
        if (unit.removed) continue;
        stats.units++;
        if (unit.definition && unit.definition.isHauler) stats.carriers++;
        else if (unit.kind === 'deer') stats.deer++;
        else if (unit.homeBuilding) stats.workers++;
        else stats.otherUnits++;
      }

      stats.resourceTotal = 0; stats.resourceKinds = 0;
      for (const id in Config.resources) {
        const amount = Economy.totalAmount(id) || 0;
        stats.resourceTotal += amount;
        if (amount > 0) stats.resourceKinds++;
      }

      stats.level = Levels && Levels.current;
      return stats;
    },

    formatDuration(seconds) {
      const total = Math.floor(seconds), hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60);
      return (hours ? hours + ' h ' : '') + minutes + ' min ' + (total % 60) + ' s';
    },

    fillStats(body, make) {
      const stats = this.collectStats();
      const row = (label, value) => {
        const element = make('div', 'stats-row');
        element.append(make('span', '', label), make('strong', '', String(value)));
        return element;
      };

      if (stats.level) body.append(row(t('Level'), `${stats.level.level}: ${stats.level.name}`));
      body.append(
        row(t('Play time (this session)'), this.formatDuration(this.playSeconds)),
        row(t('Workers'), stats.workers),
        row(t('Carriers'), stats.carriers),
        row(t('Deer'), stats.deer)
      );
      if (stats.otherUnits) body.append(row(t('Other units'), stats.otherUnits));
      body.append(
        row(t('Total units'), stats.units),
        row(t('Buildings'), stats.underConstruction
          ? t('{finished} finished, {building} under construction', { finished: stats.finished, building: stats.underConstruction })
          : t('{finished} finished', { finished: stats.finished })),
        row(t('Stored resources'), t('{total} ({kinds} types)', { total: stats.resourceTotal, kinds: stats.resourceKinds }))
      );

      if (stats.buildingTypes.size) {
        body.append(make('div', 'stats-heading', t('Buildings by type')));
        [...stats.buildingTypes].sort((a, b) => b[1] - a[1]).forEach(([name, count]) => body.append(row(name, count)));
      }
    },

    // ---- Stilar -------------------------------------------------------------------------------

    injectStyles() {
      if (document.getElementById('optionsStyles')) return;
      const style = document.createElement('style');
      style.id = 'optionsStyles';
      style.textContent = `
        #fpsCounter {
          position: fixed;
          left: 8px;
          top: 48px;
          z-index: 20;
          pointer-events: none;
          font-size: 11px;
          line-height: 1;
          color: var(--dim);
          opacity: 0.9;
          font-variant-numeric: tabular-nums;
        }

        #fpsCounter[hidden] { display: none; }

        .options-row, .stats-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 44px;
          padding: 4px 2px;
          border-bottom: 1px solid var(--line);
        }

        .options-label { display: flex; flex-direction: column; gap: 2px; }
        .options-label small { color: var(--dim); font-size: 11px; }

        .options-toggle, .options-select {
          min-width: 96px;
          min-height: 36px;
          padding: 0 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #1b2127;
          color: var(--text);
          font: inherit;
        }

        .options-toggle.is-on { background: #2d5a3d; border-color: #5fb55f; }

        .stats-row span { color: var(--dim); }
        .stats-heading { margin-top: 10px; color: var(--dim); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
      `;
      document.head.appendChild(style);
    },
  };

  CityBuilder.Options = Options;
})(window.CityBuilder);