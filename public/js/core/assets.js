/* Bildhantering. get() returnerar en laddad bild eller null (-> anroparen ritar reservgrafik).
   Källan kan vara en sträng eller en lista av strängar (variant väljs deterministiskt per ruta).
   En ras har egna bilder i en undermapp med samma filnamn: images/buildings/demon/farm.png ersätter images/buildings/farm.png.
   Saknas rasens bild används originalet, så en ras behöver bara ha de bilder som skiljer sig. */
(function (CityBuilder) {
  'use strict';

  const Assets = {
    imageCache: {},

    load(source) {
      let image = this.imageCache[source];
      if (!image) { image = new Image(); image.onerror = () => { image.failed = true; }; image.src = source+"?v="+version; this.imageCache[source] = image; }
      return image.complete && image.naturalWidth ? image : null;
    },

    get(source, race) {
      if (!source || CityBuilder.Config.settings.useImages === false) return null;
      if (!race) return this.load(source);
      const raceSource = source.replace(/[^/]+$/, `${race}/$&`), raceImage = this.load(raceSource), entry = this.imageCache[raceSource];
      if (raceImage) return raceImage;
      // Rasbilden laddas fortfarande: originalet visas bara om det redan är laddat. Det börjar inte hämtas förrän rasbilden visat sig saknas (annars blir det ett onödigt 404 för enheter som bara finns för en ras)
      if (entry && !entry.failed) { const original = this.imageCache[source]; return original && original.complete && original.naturalWidth ? original : null; }
      return this.load(source);
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
