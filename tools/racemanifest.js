/* Skapar public/js/config/raceimages.js: en lista över vilka rasbilder som finns (images/units/<ras>/x.png och images/buildings/<ras>/x.png).
   Spelet använder listan för att aldrig begära en bild som saknas (annars ger en demon med en bild som bara finns för människor ett 404-fel i konsolen
   innan den faller tillbaka på människans bild). Kör efter att du lagt till eller tagit bort en rasbild:   node tools/racemanifest.js
   server.js kör den också vid start. */
const fs = require('fs'), path = require('path');

function generate() {
  const root = path.join(__dirname, '..', 'public'), files = [];
  for (const kind of ['units', 'buildings']) {
    const base = path.join(root, 'images', kind);
    if (!fs.existsSync(base)) continue;
    for (const race of fs.readdirSync(base)) {
      if (!['human', 'demon'].includes(race) && !/^[a-z_]+$/.test(race)) continue;
      const folder = path.join(base, race);
      if (!fs.statSync(folder).isDirectory() || ['animals', 'monster'].includes(race)) continue;
      for (const name of fs.readdirSync(folder)) if (/\.png$/.test(name)) files.push(`images/${kind}/${race}/${name}`);
    }
  }
  files.sort();
  const text = `/* GENERERAD FIL (node tools/racemanifest.js): vilka rasbilder som finns, se tools/racemanifest.js. Redigera inte för hand. */\n` +
    `(function (CityBuilder) {\n  'use strict';\n  CityBuilder.RaceImages = new Set([\n${files.map(file => `    '${file}',`).join('\n')}\n  ]);\n})(window.CityBuilder);\n`;
  const target = path.join(root, 'js', 'config', 'raceimages.js');
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) fs.writeFileSync(target, text);
  return files.length;
}

module.exports = generate;
if (require.main === module) console.log(`raceimages.js: ${generate()} bilder`);
