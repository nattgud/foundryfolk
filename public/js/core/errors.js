/* Felhantering. Ett fel får aldrig stoppa spelet i tysthet: det fångas, loggas och visas för spelaren.
   - Errors.report(error, context): loggar felet och visar en diskret ruta (en gång per sorts fel, och högst en ny ruta var femte sekund).
   - Errors.notify(text): meddelar spelaren om något som inte är ett programfel (t.ex. att sparningen inte fick plats).
   - Errors.guard(fn, context): en funktion som rapporterar fel i stället för att kasta dem. Errors.attempt(fn, context, fallback): kör direkt.
   - Fångar också fel som ingen annan tog hand om (window 'error' och 'unhandledrejection'), t.ex. i knappar och tangenter.
   Rutan byggs här (inte i ui.js) så att den fungerar även om gränssnittet själv är det som gått sönder. Laddas först av alla moduler. */
(function (CityBuilder) {
  'use strict';

  const MAX_LOG = 50;          // så många olika fel sparas i loggen
  const BANNER_GAP_MS = 5000;  // minsta tid mellan två nya felrutor
  const log = [], counts = new Map();
  let banner = null, lastShown = -Infinity, unseen = 0;

  // Översättning om språkmodulen hunnit laddas, annars engelska
  const t = (text, variables) => (CityBuilder.t ? CityBuilder.t(text, variables) : String(text).replace(/\{(\w+)\}/g, (_, name) => variables?.[name] ?? ''));
  const element = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const text = error => error instanceof Error ? error.message : String(error?.message ?? error);
  const stackOf = error => (error instanceof Error && error.stack) || '';

  const Errors = {
    log,

    report(error, context = '') {
      try {
        const message = text(error), stack = stackOf(error);
        const key = context + '|' + message + '|' + stack.split('\n').slice(0, 3).join('|');
        const seen = counts.get(key);
        if (seen) { seen.count++; return; }                           // samma fel igen (t.ex. varje bildruta): bara räkna
        console.error(`[${context || 'error'}]`, error);
        const entry = { key, count: 1, time: new Date().toISOString(), context, message, stack, version: window.version };
        counts.set(key, entry);
        log.push(entry);
        if (log.length > MAX_LOG) counts.delete(log.shift().key);
        unseen++;
        this.show();
      } catch (failure) { console.error('Felhanteringen misslyckades', failure, error); }
    },

    // Rapporterar ett fel som inte kastats (t.ex. att en sparning inte kunde läsas) och visar texten för spelaren
    notify(message, context = '') { this.report(new Error(message), context); },

    guard(fn, context) { return (...args) => this.attempt(() => fn(...args), context); },

    attempt(fn, context, fallback) {
      try { return fn(); } catch (error) { this.report(error, context); return fallback; }
    },

    // Textversion av loggen att kopiera in i en felrapport
    describe() {
      const lines = [`Foundryfolk ${window.version ?? ''}`, typeof navigator === 'undefined' ? '' : navigator.userAgent, ''];
      for (const entry of log) lines.push(`${entry.time} [${entry.context}] ${entry.message}${entry.count > 1 ? ` (x${entry.count})` : ''}`, entry.stack, '');
      return lines.join('\n');
    },

    // ---- Visning ------------------------------------------------------------------------------

    show() {
      if (typeof document === 'undefined' || !document.body) return;
      const now = performance.now();
      if (banner?.isConnected) return this.refresh();                 // rutan syns redan: uppdatera bara texten
      if (now - lastShown < BANNER_GAP_MS) return;
      lastShown = now;
      banner = element('div', { id: 'errorBanner', role: 'alert' });
      document.body.append(banner);
      this.refresh();
    },

    refresh() {
      if (!banner) return;
      const detailsButton = element('button', { type: 'button', textContent: t('Details'), onclick: () => this.showDetails() });
      const closeButton = element('button', { type: 'button', textContent: t('Dismiss'), onclick: () => { unseen = 0; banner.remove(); } });
      banner.replaceChildren(
        element('span', { textContent: t('Something went wrong. The game keeps running, but save your game and reload the page if it behaves strangely.') + (log.length > 1 ? ` (${log.length})` : '') }),
        element('span', { className: 'error-actions' }, [detailsButton, closeButton]));
    },

    showDetails() {
      document.getElementById('errorDetails')?.remove();
      const area = element('textarea', { readOnly: true, value: this.describe() });
      const copy = element('button', { type: 'button', textContent: t('Copy'), onclick: () => {
        area.select();
        const done = () => { copy.textContent = t('Copied'); };
        (navigator.clipboard?.writeText(area.value).then(done, () => document.execCommand('copy') && done())) || (document.execCommand('copy') && done());
      } });
      const close = element('button', { type: 'button', textContent: t('Close'), onclick: () => overlay.remove() });
      const overlay = element('div', { id: 'errorDetails' }, [element('div', { className: 'error-dialog' }, [
        element('h3', { textContent: t('Error details') }),
        element('p', { textContent: t('Include this text if you report the problem.') }),
        area, element('div', { className: 'error-actions' }, [copy, close])])]);
      document.body.append(overlay);
    },
  };

  // Allt som ingen fångat: kastade fel i knappar, tangenter, timers och löften. Webbläsarens egna, ofarliga meddelanden och
  // fel från tillägg (andra adresser) är inget spelaren ska störas av.
  const harmless = /ResizeObserver loop/;
  addEventListener('error', event => {
    if (!event.error && !event.message) return;                     // laddningsfel hos bilder bubblar inte hit
    if (harmless.test(event.message || '') || (event.filename && !event.filename.startsWith(location.origin))) return;
    Errors.report(event.error || event.message, 'unexpected error');
  });
  addEventListener('unhandledrejection', event => {
    if (['NotAllowedError', 'AbortError'].includes(event.reason?.name)) return;   // t.ex. ljud som webbläsaren inte tillåter ännu
    Errors.report(event.reason, 'promise');
  });

  CityBuilder.Errors = Errors;
})(window.CityBuilder);
