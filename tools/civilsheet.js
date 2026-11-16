/* Klipper ut ett spritesheet med civila byggnader och detaljer till de enskilda bilderna (images/buildings/<ras>/civil_<typ>.png).
   Kör:   node tools/civilsheet.js sheet_human.png --race human
          node tools/civilsheet.js sheet_demon.png --race demon

   Förutsätter rutnätet från prompten: 8 kolumner x 4 rader lika stora rutor, fyllda från vänster till höger, uppifrån och ned, i samma ordning som typerna står i
   js/config/civils.js (hela byggnader först, sedan små detaljer). Bilden får gärna ha genomskinlig bakgrund (har du redan tagit bort den); annars tas en enfärgad
   bakgrund bort automatiskt utifrån hörnfärgen.
   Hela byggnader: alla skalas med samma skala (den största får plats i 64x64), så en hydda blir mindre än en kyrka, och ställs mitt i och längst ned.
   Små detaljer: var och en skalas upp till 16x16 och centreras. Kanten görs skarp (ingen halvgenomskinlighet).
   Flaggor: --race human|demon (standard human), --cols 8 --rows 4, --each (skala varje byggnad för sig så att den fyller 64x64), --only house1,pub, --dry (visa bara, spara inget).
   Skriver över redan befintliga civil_*.png i rasmappen. Varnar om en sprite går ut över sin ruta (då stämmer inte rutnätet för den bilden). */
'use strict';
const fs = require('fs'), path = require('path');
const { decodePng, encodePng, removeBackground, boundingBox, loadTypes } = require('./civilimages.js');

const args = process.argv.slice(2), file = args.find(arg => !arg.startsWith('--') && /\.png$/i.test(arg));
const flag = name => args.includes('--' + name), value = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
if (!file) { console.error('Ange spritesheet-bilden: node tools/civilsheet.js sheet.png --race human'); process.exit(1); }
const RACE = value('race', 'human'), COLS = +value('cols', 8), ROWS = +value('rows', 4), ONLY = value('only', '') ? value('only', '').split(',') : null;
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'public', 'images', 'buildings', RACE);

// namn i ordning: som typerna står i configen
const names = [];
for (const [id, spec] of Object.entries(loadTypes())) for (let v = 1; v <= (spec.variants > 1 ? spec.variants : 1); v++) names.push({ name: id + (spec.variants > 1 ? v : ''), small: spec.kind === 'decor' });
if (names.length > COLS * ROWS) { console.error(`${names.length} bilder ryms inte i ${COLS}x${ROWS} rutor`); process.exit(1); }

let sheet = decodePng(fs.readFileSync(file));
if (!sheet.data.some((v, i) => i % 4 === 3 && v < 255)) { console.log('Ingen genomskinlighet i bilden: tar bort bakgrunden utifrån hörnfärgen.'); sheet = removeBackground(sheet); }
const cellW = sheet.width / COLS, cellH = sheet.height / ROWS;
console.log(`Bild ${sheet.width}x${sheet.height}, rutor ${cellW}x${cellH}, ${names.length} sprites, ras ${RACE}`);

// klipp ut varje ruta och mät motivet
const cells = names.map((entry, index) => {
  const x0 = Math.round((index % COLS) * cellW), y0 = Math.round(Math.floor(index / COLS) * cellH), w = Math.round(cellW), h = Math.round(cellH), data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const from = ((y0 + y) * sheet.width + x0 + x) * 4, to = (y * w + x) * 4; for (let k = 0; k < 4; k++) data[to + k] = sheet.data[from + k]; }
  const image = { width: w, height: h, data }, box = boundingBox(image);
  if (box && (box.left <= 0 || box.top <= 0 || box.left + box.width >= w || box.top + box.height >= h)) console.warn(`  varning: ${entry.name} (ruta ${index + 1}) nuddar rutans kant, kan vara avklippt eller flyta in i en granne`);
  return { ...entry, image, box };
});

// skalning: byggnader likadant (största i 60x60), detaljer var för sig (i 14x14)
const bigBoxes = cells.filter(cell => !cell.small && cell.box);
const bigScale = flag('each') ? 0 : 60 / Math.max(...bigBoxes.flatMap(cell => [cell.box.width, cell.box.height]));

const render = (cell, size, scale) => {
  const { image, box } = cell, tw = Math.max(1, Math.round(box.width * scale)), th = Math.max(1, Math.round(box.height * scale)), out = new Uint8ClampedArray(size * size * 4);
  const ox = Math.floor((size - tw) / 2), oy = cell.small ? Math.floor((size - th) / 2) : size - th - 2;
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
    const x0 = box.left + i / scale, x1 = box.left + (i + 1) / scale, y0 = box.top + j / scale, y1 = box.top + (j + 1) / scale;
    let r = 0, g = 0, b = 0, a = 0, weight = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const w = (Math.min(x + 1, x1) - Math.max(x, x0)) * (Math.min(y + 1, y1) - Math.max(y, y0)); if (w <= 0) continue;
      const p = (y * image.width + x) * 4, alpha = image.data[p + 3] / 255;
      r += image.data[p] * alpha * w; g += image.data[p + 1] * alpha * w; b += image.data[p + 2] * alpha * w; a += alpha * w; weight += w;
    }
    if (!weight || a / weight < .5) continue;
    const q = ((oy + j) * size + ox + i) * 4;
    out[q] = r / a; out[q + 1] = g / a; out[q + 2] = b / a; out[q + 3] = 255;
  }
  return { width: size, height: size, data: out };
};

if (!flag('dry')) fs.mkdirSync(OUT, { recursive: true });
let written = 0;
for (const cell of cells) {
  if (ONLY && !ONLY.includes(cell.name)) continue;
  if (!cell.box) { console.warn(`  ${cell.name}: tom ruta, hoppar över`); continue; }
  const size = cell.small ? 16 : 64, scale = cell.small ? 14 / Math.max(cell.box.width, cell.box.height) : (bigScale || 60 / Math.max(cell.box.width, cell.box.height));
  if (!flag('dry')) fs.writeFileSync(path.join(OUT, `civil_${cell.name}.png`), encodePng(render(cell, size, scale)));
  written++;
}
console.log(`${flag('dry') ? 'Skulle skriva' : 'Skrev'} ${written} bilder till ${OUT}`);
if (!flag('dry')) try { console.log(`racemanifest: ${require('./racemanifest.js')()} bilder`); } catch (error) { console.warn('racemanifest:', error.message); }
