/* Egen bana (menyn: Custom map): spelaren väljer antal datorspelare, styrka och lag för var och en samt hur mycket vatten, berg, skog
   och resurser kartan har, och ser en enkel förhandsvisning av marken (Levels.preview, utan bilder) innan spelet startar.
   Vyn ritas i huvudmenyn av ui.js (fillSetup). Det senast valda sparas i localStorage. */
(function (CityBuilder) {
  'use strict';

  const t = (text, variables) => CityBuilder.t(text, variables);
  const STORAGE_KEY = 'citybuilder.customSetup';
  const PREVIEW_SIZE = 64;       // rutor i förhandsvisningen (per sida)
  const PREVIEW_DELAY = 150;     // ms efter senaste ändringen innan kartan räknas om
  const COLORS = ['#8fbf5f', '#4a90c8', '#8a8d93', '#3f7a3a', '#e0cf8e', '#d98f3a'];   // klasserna i Levels.preview
  const CLASS_NAMES = ['Grass', 'Water', 'Mountain', 'Forest', 'Sand', 'Ore'];
  const AMOUNTS = ['Very little', 'Little', 'Normal', 'Much', 'Very much'];
  const DIFFICULTY_NAMES = ['Harmless', 'Easy', 'Medium', 'Challenging', 'Brutal', 'Insane'];
  const TEAM_NAMES = { own: 'On its own', you: 'Your team', a: 'Team A', b: 'Team B', c: 'Team C' };

  const CustomMap = {
    settings: null,

    // Senast använda inställningar, annars den bana som spelas, annars standard
    load() {
      const Levels = CityBuilder.Levels;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (error) { /* ingen lagring */ }
      return Levels.normalizeCustom(Levels.custom || saved || Levels.defaultCustom());
    },

    persist() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch (error) { /* ignoreras */ }
    },

    // body: huvudmenyns innehåll. make(tag, klass, text) och button(text, onclick, klass) kommer från ui.js. back: tillbaka till menyn.
    fillSetup(body, make, button, back) {
      this.injectStyles();
      const Levels = CityBuilder.Levels, Config = CityBuilder.Config;
      const settings = this.settings = this.load();
      const normalize = () => { this.settings = Object.assign(settings, Levels.normalizeCustom(settings)); };

      const row = (label, control, note) => {
        const element = make('div', 'options-row custom-row');
        const text = make('div', 'options-label');
        text.append(make('span', '', label));
        if (note) text.append(make('small', '', note));
        element.append(text, control);
        return element;
      };
      const select = (choices, current, onchange) => {
        const element = make('select', 'options-select');
        for (const [value, label] of choices) {
          const option = make('option', '', label);
          option.value = String(value);
          element.append(option);
        }
        element.value = String(current);
        element.onchange = () => onchange(element.value);
        return element;
      };

      // Förhandsvisning
      const canvas = make('canvas', 'custom-preview');
      canvas.width = canvas.height = PREVIEW_SIZE * 4;
      const caption = make('div', 'main-menu-note custom-caption', t('The preview is approximate: a base can end up a few tiles from where it is shown.'));
      const legend = make('div', 'custom-legend');
      const labels = CLASS_NAMES.map((name, i) => {
        const item = make('span', 'custom-legend-item'), label = make('span', '', t(name));
        const swatch = make('i'); swatch.style.background = COLORS[i];
        item.append(swatch, label);
        legend.append(item);
        return label;
      });

      let timer = 0;
      const draw = () => {
        const { size, cells, bases } = Levels.preview(settings, PREVIEW_SIZE), scale = canvas.width / size, context = canvas.getContext('2d');
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          context.fillStyle = COLORS[cells[y * size + x]];
          context.fillRect(x * scale, y * scale, scale + .5, scale + .5);
        }
        for (const base of bases) {
          context.beginPath();
          context.arc(base.x * scale, base.y * scale, scale * 2.2, 0, Math.PI * 2);
          context.fillStyle = Config.settings.playerColors[base.player] || '#fff';
          context.fill();
          context.lineWidth = 2; context.strokeStyle = '#0b0d10'; context.stroke();
        }
        // Andel av kartan per sort: siffrorna visar effekten av reglagen även när det är svårt att se på bilden
        const counts = new Array(CLASS_NAMES.length).fill(0);
        for (const kind of cells) counts[kind]++;
        labels.forEach((label, i) => { label.textContent = `${t(CLASS_NAMES[i])} ${Math.round(100 * counts[i] / cells.length)}%`; });
        canvas.classList.remove('is-busy');
      };
      const refresh = () => {
        normalize();
        this.persist();
        canvas.classList.add('is-busy');
        clearTimeout(timer);
        timer = setTimeout(() => { try { draw(); } catch (error) { console.error(error); } }, PREVIEW_DELAY);
      };

      // Antal datorspelare
      const count = make('div', 'custom-count');
      const enemyRows = make('div', 'custom-enemies');
      const paintEnemies = () => {
        count.replaceChildren(...[1, 2, 3].map(n => {
          const choice = make('button', 'options-toggle' + (settings.enemies.length === n ? ' is-on' : ''), String(n));
          choice.type = 'button';
          choice.onclick = () => {
            while (settings.enemies.length < n) settings.enemies.push({ difficulty: 2, team: 'own' });
            settings.enemies.length = n;
            paintEnemies(); refresh();
          };
          return choice;
        }));
        enemyRows.replaceChildren(...settings.enemies.map((enemy, i) => {
          const group = make('div', 'custom-enemy');
          const swatch = make('i', 'custom-dot'); swatch.style.background = Config.settings.playerColors[CityBuilder.Players.ENEMY + i] || '#fff';
          const title = make('div', 'custom-enemy-title'); title.append(swatch, document.createTextNode(t('Enemy {n}', { n: i + 1 })));
          group.append(
            title,
            row(t('Strength'), select(DIFFICULTY_NAMES.map((name, value) => [value, t(name)]), enemy.difficulty, value => { enemy.difficulty = Number(value); refresh(); })),
            ...(settings.enemies.length > 1 ? [row(t('Team'), select(Levels.CUSTOM.teams.map(team => [team, t(TEAM_NAMES[team])]), enemy.team, value => { enemy.team = value; refresh(); paintEnemies(); }))] : [])
          );
          return group;
        }));
      };
      paintEnemies();

      // Marken
      const slider = (key, label) => {
        const input = make('input', 'custom-slider');
        input.type = 'range'; input.min = 0; input.max = Levels.CUSTOM.steps - 1; input.step = 1; input.value = settings[key];
        const value = make('span', 'custom-amount', t(AMOUNTS[settings[key]]));
        input.oninput = () => { settings[key] = Number(input.value); value.textContent = t(AMOUNTS[settings[key]]); refresh(); };
        const control = make('div', 'custom-control'); control.append(input, value);
        return row(label, control);
      };

      // Kartnummer: samma nummer och inställningar ger samma karta
      const seed = make('input', 'options-select custom-seed');
      seed.type = 'number'; seed.min = 1; seed.max = 999999; seed.value = settings.seed;
      seed.onchange = () => { settings.seed = Number(seed.value); refresh(); seed.value = settings.seed; };
      const reroll = make('button', 'options-toggle', t('Random'));
      reroll.type = 'button';
      reroll.onclick = () => { settings.seed = Math.floor(Math.random() * 999999) + 1; seed.value = settings.seed; refresh(); };
      const seedControl = make('div', 'custom-control'); seedControl.append(seed, reroll);

      const replaces = Levels.custom ? make('div', 'main-menu-note', t('The custom map you are playing now is replaced. Your levels are kept.')) : make('div', 'main-menu-note', t('Your game on the levels is saved first, and you can return to it from the menu.'));
      // Två spalter på bred skärm: förhandsvisningen till vänster, reglagen till höger
      const side = make('div', 'custom-side'), main = make('div', 'custom-main'), layout = make('div', 'custom-layout');
      side.append(canvas, legend, caption, replaces);
      main.append(
        make('div', 'stats-heading', t('Enemies')), row(t('Number of enemies'), count), enemyRows,
        make('div', 'stats-heading', t('Land')),
        slider('water', t('Water')), slider('mountains', t('Mountains')), slider('forest', t('Forest')), slider('resources', t('Resources')),
        row(t('Map number'), seedControl)
      );
      layout.append(side, main);
      body.append(
        layout,
        button(t('Start custom map'), () => { normalize(); this.persist(); Levels.startCustom(settings); }),
        button(t('Back'), back)
      );
      refresh();
    },

    injectStyles() {
      if (document.getElementById('customMapStyles')) return;
      const style = document.createElement('style');
      style.id = 'customMapStyles';
      style.textContent = `
        .custom-preview { position: static; inset: auto; width: 100%; height: auto; aspect-ratio: 1; flex: none; border: 1px solid var(--line); border-radius: 8px; background: #0b0d10; image-rendering: pixelated; transition: opacity .15s; }
        .custom-preview.is-busy { opacity: .55; }
        .custom-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
        .custom-side, .custom-main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        @media (min-width: 700px) {
          .custom-layout { grid-template-columns: 300px minmax(0, 1fr); align-items: start; }
          .custom-slider { width: 160px; }
        }
        .custom-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--dim); }
        .custom-legend-item { display: inline-flex; align-items: center; gap: 5px; }
        .custom-legend-item i, .custom-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
        .custom-dot { border-radius: 50%; margin-right: 6px; }
        .custom-caption { color: var(--dim); font-size: 12px; }
        .custom-count, .custom-control { display: flex; align-items: center; gap: 6px; }
        .custom-count .options-toggle { min-width: 40px; }
        .custom-enemy { border: 1px solid var(--line); border-radius: 8px; padding: 4px 8px; }
        .custom-enemy-title { font-size: 13px; padding-top: 4px; }
        .custom-enemy .options-row:last-child { border-bottom: 0; }
        .custom-slider { width: 110px; accent-color: #5fb55f; }
        .custom-amount { min-width: 62px; text-align: right; font-size: 12px; color: var(--dim); }
        .custom-seed { min-width: 0; width: 84px; }
        .custom-enemies { display: flex; flex-direction: column; gap: 8px; }
      `;
      document.head.appendChild(style);
    },
  };

  CityBuilder.CustomMap = CustomMap;
})(window.CityBuilder);
