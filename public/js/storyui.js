/* Storymode, det spelaren ser: läsvyn (prolog och epilog som stycken, kungens brev som en läsbar text, rådgivarna som tryckt dialog),
   kapitelvyn i huvudmenyn och rutan när ett kapitel är klart. Berättelsen kommer från Config.story och visas av Story (systems/story.js).
   Texterna är engelska nycklar som översätts när de visas (t), så en text som saknas i ett språk visas på engelska. */
(function (CityBuilder) {
  'use strict';

  const t = (text, variables) => CityBuilder.t(text, variables);
  const TYPE_MS = 16;   // millisekunder per tecken när en dialograd trycks upp

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

  const StoryUI = {
    // Visar sidorna i tur och ordning: { type: 'prose', lines } | { type: 'letter', letter } | { type: 'dialogue', lines: [{ who, text }] }.
    // Spelet står stilla medan något läses. done anropas när sista sidan stängts.
    read(pages, done) {
      this.injectStyles();
      const UI = CityBuilder.UI, Game = CityBuilder.Game, story = CityBuilder.Config.story;
      const overlay = make('div', 'resource-window-overlay story-overlay');
      const dialog = make('section', 'resource-window main-menu story-reader');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      overlay.append(dialog);
      document.body.append(overlay);
      Game.paused = true;
      let page = 0, typing = null, scened = false;

      const close = () => { overlay.remove(); Game.paused = !!UI.mainMenuOpen; if (scened) CityBuilder.Sound?.scene(CityBuilder.Levels.story?.music); done?.(); };
      const next = () => { page++; show(); };

      // Trycker upp en text tecken för tecken; ett klick eller finish() visar resten
      const print = (element, text) => {
        let shown = 0;
        const timer = setInterval(() => { element.textContent = text.slice(0, ++shown); if (shown >= text.length) stop(); }, TYPE_MS);
        const stop = () => { clearInterval(timer); element.textContent = text; typing = null; };
        typing = stop;
        return stop;
      };

      const show = () => {
        dialog.replaceChildren();
        if (page >= pages.length) return close();
        const current = pages[page], last = page === pages.length - 1;
        if (current.music) { scened = true; CityBuilder.Sound?.scene(current.music); }   // sidans egen musik (prolog, epilog) tills läsvyn stängs
        if (current.type !== 'dialogue') CityBuilder.Sound?.play('message');   // ett ljud per sida (dialog: ett per replik, se advance)
        const text = make('div', 'story-text');
        const action = button(last ? t('Continue') : t('Next'), null, 'story-next');
        action.disabled = false;
        if (current.type === 'letter') {
          const letter = current.letter, sign = story.signature;
          dialog.classList.add('is-letter');
          text.append(
            make('p', 'story-greeting', t(story.greeting, { village: t(story.village) })),
            ...letter.lines.map(line => make('p', '', t(line))),
            make('p', 'story-signature', t(letter.throne ? sign.throne : sign.realm) + ','),
            make('p', 'story-signature story-name', t(sign.name)));
          action.onclick = next;
        } else if (current.type === 'dialogue') {
          dialog.classList.remove('is-letter');
          let line = 0;
          const advance = () => {
            if (typing) return typing();
            if (line >= current.lines.length) return next();
            CityBuilder.Sound?.play('message');
            const { who, text: spoken } = current.lines[line++], speaker = story.speakers[who] || { name: who, color: '' };
            const row = make('p', 'story-line'), name = make('b', '', t(speaker.name) + ': '), words = make('span');
            name.style.color = speaker.color;
            row.append(name, words);
            text.append(row);
            print(words, t(spoken));
            action.textContent = line >= current.lines.length && last ? t('Continue') : t('Next');
            dialog.scrollTop = dialog.scrollHeight;
          };
          action.onclick = advance;
          advance();
        } else {
          dialog.classList.remove('is-letter');
          text.append(...current.lines.map(line => make('p', '', t(line))));
          action.onclick = next;
        }
        dialog.append(text, action);
        action.focus();
      };
      show();
    },

    // Kapitelvyn i huvudmenyn. ui: { make, button, confirm(alternativ), back }
    fillMenu(body, { button: menuButton, confirm }) {
      this.injectStyles();
      const Levels = CityBuilder.Levels, story = CityBuilder.Config.story, saves = CityBuilder.Save?.list?.() || [];
      const reached = Levels.storyReached(), inStory = Levels.mode === 'story', started = inStory || saves.some(entry => entry.id === 'autostory') || reached > 1;
      body.append(
        make('div', 'main-menu-level', story.title),
        menuButton(inStory ? t('Continue') : started ? t('Continue the story') : t('Start the story'), () => (inStory ? CityBuilder.UI.toggleMainMenu(false) : Levels.playStory(reached, !saves.some(entry => entry.id === 'autostory'))), '', '🏰'));
      body.append(make('div', 'main-menu-heading', t('Chapters')));
      story.chapters.forEach((chapter, index) => {
        const number = index + 1, open = number <= reached, current = inStory && Levels.story.number === number;
        const row = menuButton(`${number}. ${open ? t(chapter.name) : t('Locked')}`, open ? () => confirm({
          text: t('Play chapter {n}: {name} from the start? The story autosave is replaced. Manual saves are unchanged.', { n: number, name: t(chapter.name) }),
          confirmLabel: t('Play chapter'),
          onConfirm: () => Levels.playStory(number, true),
        }) : null, 'main-menu-slot');
        row.append(make('span', 'main-menu-slot-meta', current ? t('Playing') : number < reached ? '✔' : ''));
        body.append(row);
      });
    },

    // Rutan när ett kapitel är klart: först rådgivarnas avslutande dialog om det finns en, sedan nästa kapitel (eller epilogen efter det sista)
    complete() {
      this.injectStyles();
      const Levels = CityBuilder.Levels, UI = CityBuilder.UI, story = CityBuilder.Config.story, chapter = Levels.story;
      const last = chapter.number >= chapter.count;
      const show = () => {
        CityBuilder.Sound?.play('levelComplete');
        document.getElementById('levelCompleteOverlay')?.remove();
        const overlay = make('div', 'resource-window-overlay');
        overlay.id = 'levelCompleteOverlay';
        const dialog = make('section', 'resource-window main-menu');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        const header = make('header', 'resource-window-header');
        header.append(make('strong', '', t('Chapter complete!')));
        const fresh = last ? [] : Object.keys(story.unlock).filter(id => story.unlock[id] === chapter.number + 1 && CityBuilder.Config.buildings[id] && !CityBuilder.Config.buildings[id].hiddenInMenu).map(id => UI.buildingName(id));
        const body = make('div', 'main-menu-body');
        body.append(
          make('div', 'main-menu-level', t('Time: {time}', { time: UI.formatTime(Levels.seconds) })),
          ...(fresh.length ? [make('div', 'main-menu-note', t('Next chapter unlocks: {list}', { list: fresh.join(', ') }))] : []),
          last ? button(t('Epilogue'), () => { overlay.remove(); this.read([{ type: 'prose', lines: story.epilogue, music: story.music?.epilogue }]); }) : button(t('Next chapter'), () => Levels.advance()),
          button(t('Keep playing'), () => overlay.remove()));
        dialog.append(header, body);
        overlay.append(dialog);
        document.body.append(overlay);
        body.querySelector('button').focus();
      };
      if (chapter.after?.length) this.read([{ type: 'dialogue', lines: chapter.after }], show); else show();
    },

    injectStyles() {
      if (document.getElementById('storyStyles')) return;
      const style = document.createElement('style');
      style.id = 'storyStyles';
      style.textContent = `
        .story-reader { max-width: 560px; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px; max-height: 88vh; overflow-y: auto; }
        .story-text { display: flex; flex-direction: column; gap: 12px; line-height: 1.5; }
        .story-text p { margin: 0; }
        .story-reader.is-letter .story-text { font-family: Georgia, 'Times New Roman', serif; font-size: 1.05em; background: #e9dcc0; color: #3b2d1a; padding: 20px 22px; border-radius: 4px; box-shadow: inset 0 0 18px rgba(90, 60, 20, .35); }
        .story-greeting { font-style: italic; }
        .story-signature { text-align: right; margin: 0; }
        .story-signature + .story-signature { margin-top: -8px; font-style: italic; }
        .story-line b { margin-right: 2px; }
        .story-next { align-self: flex-end; min-width: 140px; }
      `;
      document.head.append(style);
    },
  };

  CityBuilder.StoryUI = StoryUI;
})(window.CityBuilder);
