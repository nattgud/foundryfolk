/* Hjälpfunktioner: hash, brus, nyckelfunktioner, textformatering */
(function (CityBuilder) {
  'use strict';

  // Själva blandningen i Utils.hash, med de tre produkterna färdigräknade
  const hashTerms = (xTerm, yTerm, saltTerm) => {
    let value = (xTerm + yTerm + saltTerm) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };

  const Utils = {
    // Deterministisk pseudoslump i [0, 1) för en ruta. salt ger olika "kanaler" för olika ändamål.
    hash(x, y, salt = 0) {
      let value = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 1442695041)) | 0;
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
    },

    // Mjukt interpolerat värdebrus (samma värden som hash-hörnen ger, men utan allokeringar: anropas tiotals gånger per genererad ruta)
    smoothNoise(x, y, channel) {
      const cellX = Math.floor(x), cellY = Math.floor(y);
      const fractionX = x - cellX, fractionY = y - cellY;
      const smoothX = fractionX * fractionX * (3 - 2 * fractionX);
      const smoothY = fractionY * fractionY * (3 - 2 * fractionY);
      const saltTerm = Math.imul(channel + CityBuilder.Config.world.seed * 97, 1442695041);
      const rowTop = Math.imul(cellY, 668265263), rowBottom = Math.imul(cellY + 1, 668265263);
      const left = Math.imul(cellX, 374761393), right = Math.imul(cellX + 1, 374761393);
      const top = hashTerms(left, rowTop, saltTerm) * (1 - smoothX) + hashTerms(right, rowTop, saltTerm) * smoothX;
      const bottom = hashTerms(left, rowBottom, saltTerm) * (1 - smoothX) + hashTerms(right, rowBottom, saltTerm) * smoothX;
      return top * (1 - smoothY) + bottom * smoothY;
    },
    assign(target, source, overrides = {}) {
      Object.assign(target, source, overrides);
      return target;
    },

    // Fraktalt brus: två oktaver av smoothNoise
    fractalNoise: (x, y, channel) =>
      .65 * Utils.smoothNoise(x, y, channel) + .35 * Utils.smoothNoise(x * 2.1, y * 2.1, channel + 50),

    // Unik numerisk nyckel för en rutkoordinat (för Map)
    tileKey: (x, y) => (x + 1e6) * 2e6 + (y + 1e6),

    sumValues: object => Object.values(object).reduce((total, value) => total + value, 0),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    manhattanDistance: (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y),

    // { wood: 2, stone: 1 } -> "2 trä, 1 sten"
    formatResourceList: amounts => Object.entries(amounts)
      .map(([resourceId, amount]) => amount + ' ' + CityBuilder.Config.resources[resourceId].name.toLowerCase())
      .join(', '),
  };

  CityBuilder.Utils = Utils;
  CityBuilder.byId = id => document.getElementById(id);
})(window.CityBuilder);
