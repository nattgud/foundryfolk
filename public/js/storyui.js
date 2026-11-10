/* Storymode, det spelaren ser: läsvyn (prolog och epilog som stycken, kungens brev som en läsbar text, rådgivarna som tryckt dialog),
   kapitelvyn i huvudmenyn och rutan när ett kapitel är klart. Berättelsen kommer från Config.story och visas av Story (systems/story.js).
   Texterna är engelska nycklar som översätts när de visas (t), så en text som saknas i ett språk visas på engelska. */
(function (CityBuilder) {
  'use strict';

  const t = (text, variables) => CityBuilder.t(text, variables);

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
      CityBuilder.Sound?.syncPause();   // fryser det som låter nu innan läsvyns egna ljud startar, annars fryses också de (och hörs inte)
      let page = 0, typing = null, scened = false;

      const close = () => { overlay.remove(); Game.paused = !!UI.mainMenuOpen; if (scened) CityBuilder.Sound?.scene(null); CityBuilder.Sound?.duck(false); done?.(); };
      const next = () => { page++; show(); };

      // Trycker upp en text tecken för tecken; ett klick eller finish() visar resten
      // speaker: talarens röst; [tonläge] i texten byter tonläge (Voice.parse) och visas inte
      const print = (element, raw, speaker) => {
        const segments = CityBuilder.Voice.parse(raw), text = segments.map(segment => segment.text).join('');
        let shown = 0, segment = 0, offset = 0, timer = 0;
        const tick = () => {
          while (offset >= segments[segment].text.length) { segment++; offset = 0; }
          const { mood, text: part } = segments[segment], char = part[offset++];
          element.textContent = text.slice(0, ++shown);
          CityBuilder.Voice.speak(speaker, char, mood, offset / part.length, shown, text, shown - 1);
          if (shown >= text.length) return stop();
          timer = setTimeout(tick, CityBuilder.Voice.delay(speaker, mood, char));
        };
        const stop = () => { clearTimeout(timer); element.textContent = text; typing = null; };
        typing = stop;
        if (text) tick(); else stop();
        return stop;
      };

      const show = () => {
        dialog.replaceChildren();
        const scene = pages[page]?.type === 'letter' ? null : this.scene(pages[page]);   // brevet ligger på sitt papper, allt annat på kapitlets bakgrund
        dialog.style.backgroundImage = scene ? `linear-gradient(rgba(12,14,20,.45), rgba(12,14,20,.7)), url(images/story/${scene}.jpg?v=${window.version})` : '';
        dialog.style.backgroundSize = 'cover'; dialog.style.backgroundPosition = 'center';
        if (page >= pages.length) return close();
        const current = pages[page], last = page === pages.length - 1;
        const song = current.music || this.dialogMusic(current);
        if (song) { scened = true; CityBuilder.Sound?.scene(song); }   // sidans egen musik (prolog, epilog) eller kapitlets dialogMusic för dess del, tills läsvyn stängs
        CityBuilder.Sound?.duck(current.type === 'dialogue');   // musiken sänks bara under dialoger, inte brev
        if (current.type !== 'dialogue') CityBuilder.Sound?.play('message', { defer: true });   // ett ljud per sida (dialog: ett per replik, se advance)
        const text = make('div', 'story-text');
        const action = button(last ? t('Continue') : t('Next'), null, 'story-next');
        action.disabled = false;
        if (current.type === 'letter') {
          const letter = current.letter, sign = story.signature;
          dialog.classList.add('is-letter');
          text.append(
            make('p', 'story-greeting', t(letter.greeting || story.greeting, { village: t(story.village) })),
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
            const { who, text: spoken } = current.lines[line++], speaker = story.speakers[who] || { name: who, color: '' };
            const row = make('div', speaker.narrator ? 'story-line story-narration' : who === 'reeve' ? 'story-line story-player' : 'story-line'), name = make('b', '', t(speaker.name) + ': '), words = make('span');
            name.style.color = speaker.color;
            if (speaker.narrator) row.append(words);   // berättaren har inget namn och ingen bild och skrivs kursivt
            else { const body = make('p', 'story-body'); body.append(name, words); row.append(...(speaker.portrait === false ? [] : [this.portrait(who, speaker)]), body); }   // portrait: false = ingen bild (Onden syns aldrig)
            text.append(row);
            print(words, t(spoken), who);
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

    // Bakgrunden för en sida (Config.story.scenes): namnet på bilden i images/story/, eller null.
    // Sidans egen scene (en händelses scene) gäller först. Annars kapitlets (chapter.scene eller scenes.chapters[nummer]): ett namn för hela kapitlet,
    // eller { intro, events, lifted, after } där varje del kan ha sin bild (saknas en del används intro, sedan scenes.default).
    // intro = brev och inledande dialog, events = händelser under banan, lifted = när dimman lyft, after = dialogen efter banan.
    scene(page = {}) {
      const scenes = CityBuilder.Config.story.scenes, chapter = CityBuilder.Levels.story;
      if (page.scene) return page.scene;
      const own = chapter?.scene || scenes?.chapters?.[chapter?.number];
      const name = own && typeof own === 'object' ? (own[page.part || 'intro'] ?? own.intro) : own;
      return name || scenes?.default || null;
    },

    // Kapitlets musik för en sida (chapter.dialogMusic: { intro, events, lifted, after }, samma delar som scenes). En del utan värde, eller null, ändrar ingenting: spelets musik fortsätter.
    dialogMusic(page = {}) {
      const own = CityBuilder.Levels.story?.dialogMusic;
      return own && typeof own === 'object' ? own[page.part || 'intro'] || null : null;
    },

    // Talarens porträtt, en rund bild bredvid repliken: images/portraits/<talare>.png (eller speaker.portrait). Saknas bilden visas talarens initial i dess färg.
    portrait(who, speaker) {
      const frame = make('div', 'story-portrait'), image = new Image();
      frame.style.borderColor = speaker.color;
      image.alt = '';
      image.onerror = () => { image.remove(); frame.classList.add('is-missing'); frame.style.color = speaker.color; frame.textContent = [...t(speaker.name)][0] || ''; };
      image.src = `images/portraits/${speaker.portrait || who}.png?v=${window.version}`;
      frame.append(image);
      return frame;
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

    // Kapitlets brev och dialog igen (knappen i målpanelen under hela kapitlet)
    reread() {
      const chapter = CityBuilder.Levels.story;
      if (chapter) this.read([...(chapter.letter ? [{ type: 'letter', letter: chapter.letter }] : []), ...(chapter.dialogue ? [{ type: 'dialogue', lines: chapter.dialogue }] : [])]);
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
        const body = make('div', 'main-menu-body');
        body.append(
          make('div', 'main-menu-level', t('Time: {time}', { time: UI.formatTime(Levels.seconds) })),
          last ? button(t('Epilogue'), () => { overlay.remove(); this.read((typeof story.epilogue[0] === 'string' ? [{ type: 'prose', lines: story.epilogue }] : story.epilogue).map((page, i) => i ? page : { ...page, music: story.music?.epilogue })); }) : button(t('Next chapter'), () => Levels.advance()),
          button(t('Keep playing'), () => overlay.remove()));
        dialog.append(header, body);
        overlay.append(dialog);
        document.body.append(overlay);
        body.querySelector('button').focus();
      };
      if (chapter.after?.length) this.read([{ type: 'dialogue', lines: chapter.after, part: 'after' }], show); else show();
    },

    injectStyles() {
      if (document.getElementById('storyStyles')) return;
      const style = document.createElement('style');
      style.id = 'storyStyles';
      style.textContent = `
        .story-reader { max-width: 560px; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px; max-height: 88vh; overflow-y: auto; }
        .story-text { display: flex; flex-direction: column; gap: 12px; line-height: 1.5; }
        .story-text p { margin: 0; }
        /* Texten mot bakgrundsbilden: svart kontur (fyra håll) och mjuk skugga. Brevet ligger på papper och behöver ingen. */
        .story-reader:not(.is-letter) .story-text { text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 3px rgba(0,0,0,.95), 0 0 9px rgba(0,0,0,.85); }
        .story-reader.is-letter .story-text { font-family: Georgia, 'Times New Roman', serif; font-size: 1.05em; background: #e9dcc0; color: #3b2d1a; padding: 20px 22px; border-radius: 4px; box-shadow: inset 0 0 18px rgba(90, 60, 20, .35); }
        .story-greeting { font-style: italic; }
        .story-signature { text-align: right; margin: 0; }
        .story-signature + .story-signature { margin-top: -8px; font-style: italic; }
        .story-line { display: flex; gap: 12px; align-items: flex-start; }
        .story-body { margin: 0; flex: 1; min-width: 0; }
        .story-player { flex-direction: row-reverse; }   /* spelaren: bilden till höger, som i en chatt */
        .story-player .story-body { text-align: right; }
        .story-line b { margin-right: 2px; }
        .story-portrait { flex: 0 0 56px; width: 56px; height: 56px; box-sizing: border-box; border: 2px solid #888; border-radius: 50%; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center; font: 700 26px Georgia, serif; font-style: normal; }
        .story-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .story-narration { font-style: italic; opacity: .85; }
        .story-next { align-self: flex-end; min-width: 140px; }
      `;
      document.head.append(style);
    },
  };

  CityBuilder.StoryUI = StoryUI;
})(window.CityBuilder);
