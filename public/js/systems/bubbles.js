/* Pratbubblor: små bubblor med fast storlek ovanför en enhets huvud. Rena skärmelement (HTML) utan spelstate, så de följer inte med i sparningar.
     Bubbles.say(enhet, text, sekunder = 3.5, klass, talare)   visar en bubbla (en per enhet, en ny ersätter den gamla) och ger tillbaka { done }: true när bubblan är borta
                                                talare (valfri, ett id i Config.story.speakers): texten skrivs då ut tecken för tecken med talarens röst, precis som i dialogerna, och
                                                sekunder är hur länge bubblan står kvar efter att allt är sagt. [tonläge] i texten byter röstläge (Voice.parse) och visas inte.
                                                Allt börjar först när bubblan syns första gången (enheten syns, ingen dialog är öppen), så inget går förlorat i dimman.
     Bubbles.stuck(enhet, nyckel, mål)          ger en replik (eller null) när en arbetares väg är blockerad: först när samma väg (nyckel, t.ex. källa>mål) misslyckats upprepade gånger under
                                                minst STUCK_AFTER sekunder, så ett kort hack syns aldrig; högst en gång per STUCK_COOLDOWN s och väg. mål = byggnaden som inte nåddes (för texten).
                                                Arbetaren går fram till blockeringen och säger repliken där. Av med Config.settings.stuckBubbles = false
   Bubblorna fångar aldrig klick (pointer-events: none), ligger i DOM-ordningen direkt efter spelytan så att alla paneler och dialoger ritas över dem,
   döljs helt medan en dialog (.resource-window-overlay) är öppen, visas bara för enheter spelaren ser, och flyttas isär om de skulle överlappa. Högst MAX visas samtidigt. */
(function (CityBuilder) {
  'use strict';
  const { Players, Config } = CityBuilder;   // Renderer laddas senare, så den slås upp först när den behövs
  // Utan eget värde räknas tiden efter textens längd: med röst (texten skrivs ut medan man läser) en kort stund efter sista tecknet, utan röst (allt syns direkt) tid att läsa hela
  const stay = (plain, voiced) => voiced ? Math.min(6, Math.max(1.8, 1.2 + plain.length / 30)) : Math.min(9, Math.max(2.5, 1 + plain.length / 14));
  const GIVE_UP = 25;   // sekunder en bubbla får vänta på att synas innan den ges upp
  const MAX = 5, GAP = 3, FADE = 0.4, STUCK_SECONDS = 4, STUCK_COOLDOWN = 90, STUCK_AFTER = 10, STUCK_GAP = 45;   // sekunder
  const STUCK_LINES_TO = ['No way through to the {name}!', 'The road to the {name} is blocked.', "I can't get to the {name} from here."];
  const STUCK_LINES = ['No way through here!', 'The road is blocked.', "I can't get any further."];
  const blocked = new Map();   // väg (nyckel) -> { first, last, n, shown }: när den började misslyckas, senaste misslyckandet, antal, senaste visningen
  const bubbles = new Map();   // enhet -> { el, until, born, order }
  let layer = null, counter = 0;

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    const style = document.createElement('style');
    style.textContent = `
      #bubbleLayer { position: fixed; inset: 0; overflow: hidden; pointer-events: none; user-select: none; -webkit-user-select: none; }
      #bubbleLayer .bubble { position: absolute; left: 0; top: 0; max-width: 190px; padding: 3px 8px; border-radius: 9px; background: #f7f3e6; color: #222; border: 1px solid #5a5242;
        font: calc(12px * var(--ts, 1))/1.25 sans-serif; text-align: center; box-shadow: 0 1px 3px rgb(0 0 0 / 35%); transition: opacity .35s; will-change: transform; }
      #bubbleLayer .bubble::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 8px; height: 8px; margin-left: -4px; background: inherit; border: inherit;
        border-top: 0; border-left: 0; transform: rotate(45deg); }`;
    document.head.appendChild(style);
    layer = document.createElement('div'); layer.id = 'bubbleLayer';
    const canvas = CityBuilder.Renderer?.canvas;
    if (canvas?.parentNode) canvas.parentNode.insertBefore(layer, canvas.nextSibling); else document.body.appendChild(layer);
    return layer;
  }

  const now = () => performance.now() / 1000;
  function drop(unit) { const item = bubbles.get(unit); if (item) { clearTimeout(item.timer); item.handle.done = true; item.el.remove(); bubbles.delete(unit); } }

  // Skriver ut texten tecken för tecken med talarens röst (samma takt som i dialogerna, se storyui.js print)
  function start(item) {
    item.started = true;
    const Voice = CityBuilder.Voice, finish = () => { item.shownPart.textContent = item.plain; item.restPart.textContent = ''; item.until = now() + item.seconds; };
    if (!item.voice || !item.plain) { item.shownPart.textContent = item.plain; item.restPart.textContent = ''; item.until = now() + item.seconds; return; }
    const segments = item.voice, text = item.plain;
    let shown = 0, segment = 0, offset = 0;
    const tick = () => {
      while (offset >= segments[segment].text.length) { segment++; offset = 0; }
      const { mood, text: part } = segments[segment], char = part[offset++];
      shown++; item.shownPart.textContent = text.slice(0, shown); item.restPart.textContent = text.slice(shown);
      try { Voice.speak(item.speaker, char, mood, offset / part.length, shown, text, shown - 1); } catch (error) { /* ljudet är en bonus */ }
      if (shown >= text.length) return finish();
      item.timer = setTimeout(tick, Voice.delay(item.speaker, mood, char));
    };
    tick();
  }

  const Bubbles = {
    stay,   // standardtid efter textens längd (stay(text, medRöst))
    say(unit, text, seconds, extraClass, speaker, keep) {   // keep (valfri): funktion som ger false när bubblan inte längre stämmer, då försvinner den direkt
      const handle = { done: false };
      if (!unit || unit.removed || !text) { handle.done = true; return handle; }
      drop(unit);
      const voice = speaker && CityBuilder.Voice ? CityBuilder.Voice.parse(text) : null;
      const plain = voice ? voice.map(segment => segment.text).join('') : String(text).replace(/\[[a-z]+\]/g, '');
      const el = document.createElement('div');
      el.className = 'bubble' + (extraClass ? ' ' + extraClass : '');
      const shownPart = document.createElement('span'), restPart = document.createElement('span');   // resten finns med osynlig så att bubblan har sin slutliga storlek från början
      restPart.style.visibility = 'hidden'; restPart.textContent = plain; el.append(shownPart, restPart); el.style.opacity = '0';
      ensureLayer().appendChild(el);
      bubbles.set(unit, { el, handle, shownPart, restPart, plain, voice, speaker, seconds: seconds || stay(plain, !!voice), until: Infinity, born: now(), started: false, keep, order: ++counter });
      return handle;
    },
    // Ger en replik (text) när det är dags att berätta att vägen är blockerad, annars null. Den som anropar låter enheten gå fram till blockeringen och säga den där (Units.handlePathFailure).
    stuck(unit, key, target) {
      if (Config.settings?.stuckBubbles === false || !unit || unit.removed || unit.player !== Players.HUMAN) return null;
      const t = now(); key = key ?? 'unit' + unit.id;
      let record = blocked.get(key);
      if (!record || t - record.last > STUCK_GAP) record = { first: t, last: t, n: 0, shown: record?.shown ?? -Infinity };   // en ny period av misslyckanden
      record.last = t; record.n++; blocked.set(key, record);
      if (blocked.size > 200) for (const [k, r] of blocked) if (t - r.last > 300) blocked.delete(k);
      if (record.n < 2 || t - record.first < STUCK_AFTER || t - record.shown < STUCK_COOLDOWN) return null;
      record.shown = t;
      let name = ''; try { const UI = CityBuilder.UI; name = target?.definition ? UI.buildingName(target.definition, UI.raceOfBuilding(target)) : ''; } catch (error) { name = ''; }
      const lines = name ? STUCK_LINES_TO : STUCK_LINES;
      return CityBuilder.t(lines[Math.floor(Math.random() * lines.length)], { name });
    },
    clear() { for (const unit of [...bubbles.keys()]) drop(unit); blocked.clear(); },
    get count() { return bubbles.size; },

    // Placerar alla bubblor för en bildruta
    frame() {
      const Renderer = CityBuilder.Renderer;
      if (!bubbles.size || !Renderer) return;
      const dialogOpen = [...document.querySelectorAll('.resource-window-overlay')].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');   // vissa finns alltid i DOM:en men är dolda
      const zoom = Renderer.zoom, size = Renderer.tileSize, camera = Renderer.camera, t = now(), Vision = CityBuilder.Vision;
      const live = [];
      for (const [unit, item] of bubbles) {
        if (unit.removed || t > item.until || (!item.started && t - item.born > GIVE_UP) || (item.keep && !item.keep())) { drop(unit); continue; }
        const x = (unit.x * size - camera.x) * zoom, y = (unit.y * size - camera.y) * zoom - size * zoom * .55;
        const visible = !dialogOpen && x > -20 && y > -20 && x < innerWidth + 20 && y < innerHeight + 20 && (!Vision || Vision.sees(Players.HUMAN, unit));
        item.visible = visible; item.x = x; item.y = y;
        if (visible && !item.started) start(item);   // allt börjar när bubblan syns första gången
        item.el.style.opacity = visible && item.started ? (item.until - t < FADE ? '0' : '1') : '0';
        if (visible && item.started) live.push(item);
      }
      live.sort((a, b) => b.order - a.order);   // de nyaste först; är det för många hoppar vi över de äldsta
      const placed = [];
      for (const [index, item] of live.entries()) {
        if (index >= MAX) { item.el.style.opacity = '0'; continue; }
        const width = item.el.offsetWidth, height = item.el.offsetHeight;
        let left = item.x - width / 2, top = item.y - height - 6;
        for (let tries = 0; tries < 8; tries++) {   // flytta uppåt tills den inte ligger över någon annan
          const hit = placed.find(other => left < other.left + other.width + GAP && other.left < left + width + GAP && top < other.top + other.height + GAP && other.top < top + height + GAP);
          if (!hit) break;
          top = hit.top - height - GAP - 4;
        }
        placed.push({ left, top, width, height });
        item.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      }
    },
  };

  (function loop() { try { Bubbles.frame(); } catch (error) { console.error('Bubbles', error); } requestAnimationFrame(loop); })();
  CityBuilder.Bubbles = Bubbles;
})(window.CityBuilder);
