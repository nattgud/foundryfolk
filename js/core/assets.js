/* Bildhantering. get() returnerar en laddad bild eller null (-> anroparen ritar reservgrafik).
   Källan kan vara en sträng eller en lista av strängar (variant väljs deterministiskt per ruta). */
(function (CityBuilder) {
  'use strict';

  const Assets = {
    imageCache: {},

    get(source) {
      if (!source || CityBuilder.Config.settings.useImages === false) return null;
      let image = this.imageCache[source];
      if (!image) { image = new Image(); image.src = source+"?v="+version; this.imageCache[source] = image; }
      return image.complete && image.naturalWidth ? image : null;
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
