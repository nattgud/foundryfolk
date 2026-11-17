/* Expansioner (nya berättelser efter huvudstoryn).

   En expansion är en story av samma form som Config.story (se config/story.js) som ärver allt den inte själv anger:
   talare (speakers), bakgrunder (scenes), kuliss-typer (sceneryTypes), hälsning, signatur och musik. Den behöver alltså bara ange sina egna kapitel.

   Skapa en ny:     node tools/newexpansion.js <id> "Titel"      (skapar js/expansions/<id>.js och lägger in den i files.js)
   Fyll i filen:    kapitlen i chapters: [...] har exakt samma fält som i config/story.js
   Kontrollera:     CityBuilder.Config.expansions.check('<id>')   i webbläsarkonsolen (?editor) skriver ut alla problem
   Hämta:           CityBuilder.Config.expansions.story('<id>')   ger den färdiga story-datan (samma form som Config.story)

   Det som återstår för att kunna SPELA en expansion (medvetet inte gjort, grundspelet är orört):
     1. config/levels.js: STORY_KEY / REACHED_KEY (rad ~37) behöver ett suffix per expansion, och Config.story byts mot Expansions.story(id) vid start.
     2. core/save.js: SLOT_IDS och 'autostory' (rad ~17, ~377) behöver ett eget autosparfack per expansion.
     3. storyui.js (fillMenu, rad ~145) och ui.js (rad ~1665): en meny-knapp per definierad expansion (Expansions.ids()).
   Allt annat (editorn, händelser, scener, väder, vågor) fungerar likadant eftersom datan har samma form. */
(function (CityBuilder) {
  'use strict';

  const registry = {};
  const INHERITED = ['speakers', 'scenes', 'sceneryTypes'];     // slås ihop med grundstoryns (expansionens egna går före)
  const COPIED = ['greeting', 'signature', 'music', 'unlock'];  // används från grundstoryn om expansionen inte anger egna

  const isSay = line => line && typeof line.who === 'string' && typeof line.text === 'string';

  const Expansions = {
    ids: () => Object.keys(registry),
    get: id => registry[id] || null,

    define(def) {
      if (!def || typeof def.id !== 'string' || !/^[a-z0-9_]+$/.test(def.id)) throw new Error('Expansion: id saknas eller är ogiltigt (a-z, 0-9, _)');
      registry[def.id] = def;
      return def;
    },

    // Story-data för en expansion: grundstoryns gemensamma delar + expansionens egna (kapitlen ersätts helt)
    story(id) {
      const def = registry[id], base = CityBuilder.Config.story;
      if (!def) return null;
      const story = { ...base };
      for (const key of COPIED) if (def[key] !== undefined) story[key] = def[key];
      for (const key of INHERITED) story[key] = { ...(base[key] || {}), ...(def[key] || {}) };
      for (const key of ['title', 'village', 'seed']) if (def[key] !== undefined) story[key] = def[key];
      for (const key of ['prologue', 'epilogue']) story[key] = def[key];   // grundstoryns text hör inte hemma i en annan berättelse
      story.chapters = def.chapters || [];
      story.expansion = id;
      return story;
    },

    // Alla problem som går att hitta utan att spela: [text, ...]
    problems(id) {
      const story = this.story(id), list = [];
      if (!story) return ['Okänd expansion: ' + id];
      if (!story.title) list.push('Titel saknas');
      if (!story.chapters.length) list.push('Inga kapitel än');
      const speaker = who => who in story.speakers;
      const checkLines = (where, lines) => {
        if (!lines) return;
        for (const line of Array.isArray(lines) ? lines : []) {
          if (!isSay(line)) { list.push(where + ': en rad är inte say(...)'); continue; }
          if (!speaker(line.who)) list.push(where + ': okänd talare "' + line.who + '"');
        }
      };
      story.chapters.forEach((chapter, index) => {
        const here = 'Kapitel ' + (index + 1) + (chapter.name ? ' (' + chapter.name + ')' : '');
        if (!chapter.name) list.push(here + ': namn saknas');
        if (!chapter.goals && chapter.end !== 'hq' && chapter.end !== 'fog') list.push(here + ': inga mål och inget end');
        checkLines(here + ' dialog', chapter.dialogue);
        checkLines(here + ' after', chapter.after);
        const ids = new Set();
        for (const event of chapter.events || []) {
          if (event.id) { if (ids.has(event.id)) list.push(here + ': händelse-id används två gånger: ' + event.id); ids.add(event.id); }
          checkLines(here + ' tell', event.tell);
          for (const step of event.scene || []) checkLines(here + ' scen', step.tell);
          if (event.at === undefined && !event.when && !event.on && !event.goal && !event.end) list.push(here + ': händelse utan at/when/on/goal' + (event.id ? ' (' + event.id + ')' : ''));
        }
      });
      return list;
    },

    check(id) {
      const list = this.problems(id);
      console.log(list.length ? 'Expansion ' + id + ': ' + list.length + ' problem\n - ' + list.join('\n - ') : 'Expansion ' + id + ': inga problem');
      return list;
    },
  };

  CityBuilder.Config.expansions = Expansions;
})(CityBuilder);
