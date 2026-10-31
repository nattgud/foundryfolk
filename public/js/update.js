/* Uppdatering i bakgrunden: kontrollerar ofta mot servern om det finns en nyare version än den som körs, och byter till den utan att spelaren märker det.
   - Versionen läses ur index.html (var version = "..."), hämtad förbi alla cachar.
   - Hittas en ny version registreras en ny service worker (sw.js?v=...) som förladdar hela den nya versionen i en egen cache.
   - Först när den är klar laddas sidan om, och bara när det inte syns: fliken är dold eller huvudmenyn öppen. Autosparningen sker när sidan stängs
     och spelet återställs vid start, så ingenting går förlorat. Annars tar nästa omladdning (t.ex. ny bana) den nya versionen.
   - Utan service worker (eller om den inte hinner) laddas sidan om ändå: servern svarar alltid med den senaste versionen. */
(function (CityBuilder) {
  'use strict';

  const { Game } = CityBuilder;   // CityBuilder-namnrymden tas bort efter start: referensen måste fås nu
  const CHECK_MS = 60000;
  const READY_TIMEOUT = 30000;    // ms som den nya versionen får på sig att förladdas
  const TRIED_KEY = 'citybuilder.updateTried';   // versionen som sidan redan försökt byta till (skyddar mot omladdningsslinga)

  const Updater = {
    latest: null,      // nyare version som är förladdad och väntar på ett lugnt tillfälle
    busy: false,

    async check() {
      if (this.busy || this.latest || !navigator.onLine) return;
      this.busy = true;
      try {
        const response = await fetch('index.html', { cache: 'no-cache' });
        const found = response.ok && /var version = "([^"]+)"/.exec(await response.text());
        if (found && found[1] !== window.version && found[1] !== sessionStorage.getItem(TRIED_KEY)) await this.prepare(found[1]);
      } catch (error) { /* ingen kontakt med servern: försöker igen senare */ }
      this.busy = false;
    },

    // Förladdar den nya versionen: en ny service worker installerar och aktiveras först när hela kärnan ligger i dess cache
    async prepare(version) {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('sw.js?v=' + version);
        const worker = registration.installing || registration.waiting || registration.active;
        if (worker && worker.state !== 'activated') await new Promise(resolve => {
          const done = () => { if (worker.state === 'activated' || worker.state === 'redundant') resolve(); };
          worker.addEventListener('statechange', done);
          setTimeout(resolve, READY_TIMEOUT);
          done();
        });
      }
      this.latest = version;
      this.apply();
    },

    // Byter bara när det inte syns
    apply() {
      if (!this.latest || !(document.hidden || Game.paused)) return;
      try { sessionStorage.setItem(TRIED_KEY, this.latest); } catch (error) { /* ignorera */ }
      location.reload();
    },
  };

  setInterval(() => Updater.check(), CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Updater.apply(); else Updater.check(); });
  setInterval(() => Updater.apply(), 2000);   // huvudmenyn kan öppnas medan en ny version väntar

  CityBuilder.Updater = Updater;
})(window.CityBuilder);
