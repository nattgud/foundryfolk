/* Storymode: det som körs medan ett kapitel spelas (Levels.story, se Config.story för datan). Inget händer på banorna och egna kartor.
     - begin()  vid ett kapitels start (ingen sparning återställd): färdiga byggnader runt HQ och Eye of Shades
     - update() berättelsen (prolog, brev, dialog, händelser på bestämda tider) och dimman som ligger över kapitlet tills Eye of Shades är borta
   Det som visats ligger i Levels.told, så det följer med sparningen och berättas bara en gång. Berättelsen visas av StoryUI. */
(function (CityBuilder) {
  'use strict';
  const { Config, World, Players, Utils } = CityBuilder;

  const SPREAD = 2;           // minsta avstånd (rutor) mellan färdiga byggnader
  const EYE_REACH = 0.55;     // hur långt mot fienden Eye of Shades står (andel av avståndet mellan baserna)
  const EYE_MAX = 70;         // ... och högst så många rutor från HQ
  const EYE_ALONE = 32;       // utan fiende: så långt från HQ
  const TORNADO_LIFE = 45;

  const Story = {
    queue: [],         // sidor som väntar på att visas
    reading: false,

    get chapter() { return CityBuilder.Levels.story; },

    // En ledig ruta nära (x, y), spiralvis utåt. Bara gräs utan byggnad och med ett litet avstånd till andra byggnader.
    freeSpot(type, x, y, spread = SPREAD) {
      for (let radius = 0; radius < 40; radius++) {
        for (let k = 0; k < Math.max(1, radius * 6); k++) {
          const angle = k / Math.max(1, radius * 6) * Math.PI * 2, tx = Math.round(x + Math.cos(angle) * radius), ty = Math.round(y + Math.sin(angle) * radius);
          if (!World.canPlace(type, tx, ty)) continue;
          let clear = true;
          for (let dy = -spread; dy <= spread && clear; dy++) for (let dx = -spread; dx <= spread; dx++) if (World.buildingAt(tx + dx, ty + dy)) { clear = false; break; }
          if (clear) return { x: tx, y: ty };
        }
      }
      return null;
    },

    place(type, x, y) {
      const spot = this.freeSpot(type, x, y);
      if (!spot) return null;
      const building = World.placeBuilding(type, spot.x, spot.y, true, Players.HUMAN);
      if (building.definition.job) CityBuilder.Behaviors.forBuilding(building)?.onBuilt?.(building);
      return building;
    },

    // Placerar en byggnad på exakt plats (dx, dy rutor från HQ). Går det inte (vatten, berg, upptaget) skrivs en varning och den närmaste lediga rutan används.
    placeAt(type, dx, dy) {
      const hq = World.headquarters, x = hq.x + dx, y = hq.y + dy;
      if (!World.canPlace(type, x, y)) {
        console.warn(`Story: ${type} cannot stand at dx ${dx}, dy ${dy} in chapter ${this.chapter.number}; using the nearest free spot`);
        return this.place(type, x, y);
      }
      const building = World.placeBuilding(type, x, y, true, Players.HUMAN);
      if (building.definition.job) CityBuilder.Behaviors.forBuilding(building)?.onBuilt?.(building);
      return building;
    },

    // Kapitlets start: byggnaderna från föregående mål står redo och Eye of Shades står mot fienden.
    // En byggnad i start.buildings är antingen { type, dx, dy } (exakt plats, mätt i rutor från HQ) eller bara ett id (automatisk plats runt HQ).
    // eye: true placerar Eye of Shades automatiskt mot fienden, eye: { dx, dy } på en bestämd plats.
    begin() {
      const chapter = this.chapter, hq = World.headquarters;
      if (!chapter || !hq) return;
      (chapter.start?.buildings || []).forEach((entry, i) => {
        if (entry.type) return this.placeAt(entry.type, entry.dx, entry.dy);
        const angle = i * 2.4 + chapter.number, distance = 6 + (i % 4) * 2;
        this.place(entry, hq.x + Math.cos(angle) * distance, hq.y + Math.sin(angle) * distance);
      });
      if (chapter.eye?.dx !== undefined) this.placeAt('eye_of_shades', chapter.eye.dx, chapter.eye.dy);
      else if (chapter.eye) {
        const rival = World.hqOf(Players.ENEMY);
        const angle = rival ? Math.atan2(rival.y - hq.y, rival.x - hq.x) : chapter.number * 2.1;
        const distance = rival ? Math.min(EYE_MAX, Math.hypot(rival.x - hq.x, rival.y - hq.y) * EYE_REACH) : EYE_ALONE;
        this.place('eye_of_shades', hq.x + Math.cos(angle) * distance, hq.y + Math.sin(angle) * distance);
      }
      if (chapter.fog) CityBuilder.Levels.markTold('fog:on');
    },

    // Utvecklarverktyg: placera byggnaderna som du vill ha dem i kapitlet (starta det från menyn, bygg eller flytta i spelet) och kör
    // CityBuilder.Story.layout() i webbläsarens konsol (högar med varor och oavslutade byggen tas inte med). Det skrivs ut färdiga rader att klistra in i start.buildings (och eye) i config/story.js.
    layout() {
      const hq = World.headquarters;
      const rows = World.buildings.filter(building => building.player === Players.HUMAN && building.type !== 'hq' && !building.definition.pile && !building.removed && building.buildProgress >= 1).sort((a, b) => a.y - b.y || a.x - b.x);
      const row = building => `{ type: '${building.type}', dx: ${building.x - hq.x}, dy: ${building.y - hq.y} }`;
      const eye = rows.find(building => building.type === 'eye_of_shades');
      const text = `start: { buildings: [\n${rows.filter(building => building !== eye).map(building => '  ' + row(building) + ',').join('\n')}\n] }` + (eye ? `\neye: { dx: ${eye.x - hq.x}, dy: ${eye.y - hq.y} }` : '');
      console.log(`Chapter ${this.chapter?.number}:\n${text}`);
      navigator.clipboard?.writeText(text).catch(() => {});
      return text;
    },

    eyeStands() { return World.buildings.some(building => building.type === 'eye_of_shades' && !building.removed); },

    // Visar sidor (brev, dialog, stycken) i läsvyn, en sekvens i taget. Spelet står stilla medan något läses.
    tell(pages) {
      if (!pages?.length) return;
      this.queue.push(...pages);
      this.flush();
    },
    flush() {
      if (this.reading || !this.queue.length) return;
      this.reading = true;
      const pages = this.queue.splice(0);
      CityBuilder.StoryUI.read(pages, () => { this.reading = false; this.flush(); });
    },
    // En gång per sparning: berättas första gången villkoret slår till. Returnerar sidorna, så att flera kan visas i en följd.
    once(key, pages) {
      const Levels = CityBuilder.Levels;
      if (Levels.told(key)) return [];
      Levels.markTold(key);
      return pages;
    },

    // Händelser på bestämda tider (Weather sköter själva vädret)
    fire(event) {
      const Weather = CityBuilder.Weather, hq = World.headquarters;
      if (event.tell) this.tell([{ type: 'dialogue', lines: event.tell }]);
      if (event.weather) { Weather.type = event.weather; Weather.left = 90; Weather.flashIn = 1; CityBuilder.Sound?.play('weather.' + event.weather); }
      if (event.tornado || event.super) {
        const spot = Weather.tornadoSpot() || (hq && { x: hq.x + 10, y: hq.y + 6, player: Players.HUMAN });
        if (!spot) return;
        if (event.super) Weather.spawnSuper(spot.x, spot.y, event.super, TORNADO_LIFE, spot.player); else Weather.spawnTornado(spot.x, spot.y, event.tornado, TORNADO_LIFE, spot.player);
      }
      if (event.meteors && hq) Weather.spawnMeteors(hq.x + 8, hq.y + 6, 10, event.meteors);
    },

    update() {
      const chapter = this.chapter, Levels = CityBuilder.Levels, Weather = CityBuilder.Weather;
      if (!chapter) return;
      if (!this.reading) CityBuilder.Sound?.scene(chapter.music);   // kapitlets egen musik (läsvyn sköter sin egen)
      // Berättelsen i ordning: prolog (bara i kapitel 1), brev, dialog
      this.tell([
        ...(chapter.number === 1 ? this.once('prologue', [{ type: 'prose', lines: Config.story.prologue, music: Config.story.music?.prologue }]) : []),
        ...(chapter.letter ? this.once('letter', [{ type: 'letter', letter: chapter.letter }]) : []),
        ...(chapter.dialogue ? this.once('dialogue', [{ type: 'dialogue', lines: chapter.dialogue }]) : []),
      ]);

      (chapter.events || []).forEach((event, i) => {
        if (Levels.seconds >= event.at && !Levels.told('event:' + i)) { Levels.markTold('event:' + i); this.fire(event); }
      });

      // Dimman ligger över kapitlet så länge Eye of Shades står. När den är borta lyfter dimman och rådgivarna lämnar.
      if (chapter.fog && Levels.told('fog:on') && !Levels.told('fog:lifted')) {
        if (this.eyeStands()) { Weather.type = 'fog'; Weather.left = Math.max(Weather.left, 30); }
        else {
          Levels.markTold('fog:lifted');
          Weather.type = 'clear'; Weather.left = 90;
          if (chapter.lifted) this.tell([{ type: 'dialogue', lines: chapter.lifted }]);
        }
      }
      // Meteorer skonar vissa enhetstyper (Weather.harm läser definition.meteorProof)
      if (this.proofFor !== chapter.number) {
        this.proofFor = chapter.number;
        for (const kind of chapter.meteorProof || []) if (Config.units[kind]) Config.units[kind].meteorProof = true;
      }
    },
  };

  CityBuilder.Story = Story;
  (CityBuilder.Systems = CityBuilder.Systems || {}).story = { update: () => Story.update() };
})(window.CityBuilder);
