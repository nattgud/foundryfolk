/* Reservformer för terräng (används när ingen bild finns). Namnet matchas mot terrain[id].fallbackShape. */
(function (CityBuilder) {
  'use strict';

  CityBuilder.Shapes = {
    tree(context, x, y, tileSize) {
      context.fillStyle = '#1d4a25';
      context.beginPath();
      context.moveTo(x + tileSize / 2, y + 3);
      context.lineTo(x + tileSize - 6, y + tileSize - 5);
      context.lineTo(x + 6, y + tileSize - 5);
      context.fill();
    },
    rock(context, x, y, tileSize) {
      context.fillStyle = '#8a949c';
      context.beginPath();
      context.arc(x + tileSize / 2, y + tileSize / 2 + 2, tileSize / 3, 0, 7);
      context.fill();
    },
    ore(context, x, y, tileSize) {
      context.fillStyle = '#c0563a';
      for (const [fractionX, fractionY] of [[.3, .3], [.65, .4], [.45, .7]]) {
        context.fillRect(x + fractionX * tileSize - 3, y + fractionY * tileSize - 3, 6, 6);
      }
    },
  };
})(window.CityBuilder);
