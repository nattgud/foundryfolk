/* Pratbubblor: små bubblor med fast storlek ovanför en enhets huvud. Rena skärmelement (HTML) utan spelstate, så de följer inte med i sparningar.
     Bubbles.say(enhet, text, sekunder = 3.5, klass, talare)   visar en bubbla (en per enhet, en ny ersätter den gamla) och ger tillbaka { done }: true när bubblan är borta
                                                talare (valfri, ett id i Config.story.speakers): texten skrivs då ut tecken för tecken med talarens röst, precis som i dialogerna, och
                                                sekunder är hur länge bubblan står kvar efter att allt är sagt. [tonläge] i texten byter röstläge (Voice.parse) och visas inte.
                                                Allt börjar först när bubblan syns första gången (enheten syns, ingen dialog är öppen), så inget går förlorat i dimman.
     Bubbles.stuck(enhet)                       en "!" över en arbetare som fastnat (högst en gång per 10 s och enhet; av med Config.settings.stuckBubbles = false)
   Bubblorna fångar aldrig klick (pointer-events: none), ligger i DOM-ordningen direkt efter spelytan så att alla paneler och dialoger ritas över dem,
   döljs helt medan en dialog (.resource-window-overlay) är öppen, visas bara för enheter spelaren ser, och flyttas isär om de skulle överlappa. Högst MAX visas samtidigt. */
(function (CityBuilder) {
  'use strict';
  const { Players, Config } = CityBuilder;   // Renderer laddas senare, så den slås upp först när den behövs
  const LINGER = 1.8, GIVE_UP = 25;   // sekunder kvar efter ett röstat tal; sekunder en bubbla får vänta på att synas innan den ges upp
  const MAX = 5, GAP = 3, DEFAULT_SECONDS = 3.5, FADE = 0.4, STUCK_SECONDS = 2.5, STUCK_COOLDOWN = 10;
  const bubbles = new Map();   // enhet -> { el, until, born, order }
  let layer = null, counter = 0;

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    const style = document.createElement('style');
    style.textContent = `
      #bubbleLayer { position: fixed; inset: 0; overflow: hidden; pointer-events: none; user-select: none; -webkit-user-select: none; }
      #bubbleLayer .bubble { position: absolute; left: 0; top: 0; max-width: 190px; padding: 3px 8px; border-radius: 9px; background: #f7f3e6; color: #222; border: 1px solid #5a5242;
        font: 12px/1.25 sans-serif; text-align: center; box-shadow: 0 1px 3px rgb(0 0 0 / 35%); transition: opacity .35s; will-change: transform; }
      #bubbleLayer .bubble::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 8px; height: 8px; margin-left: -4px; background: inherit; border: inherit;
        border-top: 0; border-left: 0; transform: rotate(45deg); }
      #bubbleLayer .bubble.stuck { font-weight: bold; color: #b00020; padding: 1px 8px; font-size: 14px; }`;
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
    say(unit, text, seconds, extraClass, speaker) {
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
      bubbles.set(unit, { el, handle, shownPart, restPart, plain, voice, speaker, seconds: seconds || (voice ? LINGER : DEFAULT_SECONDS), until: Infinity, born: now(), started: false, order: ++counter });
      return handle;
    },
    stuck(unit) {
      if (Config.settings?.stuckBubbles === false || !unit || unit.removed || unit.player !== Players.HUMAN) return;
      const t = now();
      if (unit.stuckBubbleAt && t - unit.stuckBubbleAt < STUCK_COOLDOWN) return;
      unit.stuckBubbleAt = t; this.say(unit, '!', STUCK_SECONDS, 'stuck');
    },
    clear() { for (const unit of [...bubbles.keys()]) drop(unit); },
    get count() { return bubbles.size; },

    // Placerar alla bubblor för en bildruta
    frame() {
      const Renderer = CityBuilder.Renderer;
      if (!bubbles.size || !Renderer) return;
      const dialogOpen = [...document.querySelectorAll('.resource-window-overlay')].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');   // vissa finns alltid i DOM:en men är dolda
      const zoom = Renderer.zoom, size = Renderer.tileSize, camera = Renderer.camera, t = now(), Vision = CityBuilder.Vision;
      const live = [];
      for (const [unit, item] of bubbles) {
        if (unit.removed || t > item.until || (!item.started && t - item.born > GIVE_UP)) { drop(unit); continue; }
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
