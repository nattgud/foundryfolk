/* Bildhantering. get() returnerar en laddad bild eller null (-> anroparen ritar reservgrafik).
   Källan kan vara en sträng eller en lista av strängar (variant väljs deterministiskt per ruta).
   Byggnads- och enhetsbilder ligger i en mapp per ras: images/buildings/human/farm.png, images/buildings/demon/farm.png (konfigurationen anger
   fortfarande images/buildings/farm.png). Utan ras används human. Saknas rasens bild används människans, så en ras behöver bara ha de bilder som skiljer sig.
   Djur (images/units/animals/), monster (images/units/monster/) och allt annat ligger i fasta mappar och påverkas inte. */
(function (CityBuilder) {
  'use strict';

  const RACED = /^(images\/(?:units|buildings)\/)([^/]+)$/;

  const Assets = {
    imageCache: {},

    load(source) {
      let image = this.imageCache[source];
      if (!image) { image = new Image(); image.onerror = () => { image.failed = true; }; image.src = source+"?v="+version; this.imageCache[source] = image; }
      return image.complete && image.naturalWidth ? image : null;
    },

    // Sökvägen med rasmappen insatt (images/units/swordsman.png + demon -> images/units/demon/swordsman.png). Andra bilder returneras som de är.
    raced(source, race) { return RACED.test(source) ? source.replace(RACED, `$1${race || 'human'}/$2`) : source; },

    // Finns rasbilden? Listan (js/config/raceimages.js, skapas av tools/racemanifest.js) gör att en bild som saknas aldrig begärs (inget 404-fel). Saknas listan antas bilden finnas.
    exists(raceSource) { const list = CityBuilder.RaceImages; return !list || list.has(raceSource); },
    // Som raced, men människans bild om rasens version saknas (för <img> som annars ger 404)
    racedIfExists(source, race) { const raceSource = this.raced(source, race); return this.exists(raceSource) ? raceSource : this.raced(source, 'human'); },

    get(source, race) {
      if (!source || CityBuilder.Config.settings.useImages === false) return null;
      if (!RACED.test(source)) return this.load(source);
      const human = this.raced(source, 'human');
      if (!race || race === 'human') return this.load(human);
      const raceSource = this.raced(source, race);
      if (!this.exists(raceSource)) return this.load(human);   // rasen har ingen egen bild: människans används direkt
      const raceImage = this.load(raceSource), entry = this.imageCache[raceSource];
      if (raceImage) return raceImage;
      // Rasbilden laddas fortfarande: människans bild visas bara om den redan är laddad. Den börjar inte hämtas förrän rasbilden visat sig saknas (annars blir det ett onödigt 404 för enheter som bara finns för en ras)
      if (entry && !entry.failed) { const original = this.imageCache[human]; return original && original.complete && original.naturalWidth ? original : null; }
      return this.load(human);
    },

    getVariant(sourceOrList, tileX, tileY) {
      let source = sourceOrList;
      if (Array.isArray(sourceOrList)) {
        source = sourceOrList[Math.floor(CityBuilder.Utils.hash(tileX, tileY, 31) * sourceOrList.length)];
      }
      return this.get(source);
    },
  };

  CityBuilder.Assets = Assets;
})(window.CityBuilder);
