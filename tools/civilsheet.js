/* Klipper ut ett spritesheet med civila byggnader och detaljer till de enskilda bilderna (images/buildings/<ras>/civil_<typ>.png).
   Kör:   node tools/civilsheet.js public/images/human_civil_spritesheet.png --race human --skip 15
          node tools/civilsheet.js public/images/demon_civil_spritsheet.png  --race demon --skip 15,16

   Spritesheeten behöver inget rutnät: varje sprite hittas som en sammanhängande klump av pixlar (delar som ligger inom ungefär --gap pixlar från varandra, t.ex. en mur och
   dess gravstenar, räknas som en sprite) och numreras i läsordning (rad för rad, vänster till höger; --rows 4 anger hur många rader bilden är tänkt att ha).
   Numrena matchas mot typerna i js/config/civils.js i ordning (hela byggnader först, sedan små detaljer). Har bilden fler sprites än typer (extra varianter) anger du
   vilka som ska hoppas över med --skip (nummer, 1-räknat). Skriptet skriver ut varje sprites nummer, position, storlek och vilket namn den får, så att du kan kontrollera.
   Bilden ska ha genomskinlig bakgrund; saknas den tas en enfärgad bakgrund bort från hörnfärgen (--tolerance).
   Storlek: varje byggnad skalas för sig så att den fyller 64x64 (en ruta) och ställs mitt i och längst ned; varje detalj skalas till 15 px och centreras i 16x16.
   Kanten görs skarp (ingen halvgenomskinlighet).
   Flaggor: --race human|demon (standard human), --skip 15,16, --gap 6, --rows 4, --only house1,pub, --tolerance 28, --nomanifest, --dry (visa bara, spara inget).
   Skriver över redan befintliga civil_*.png i rasmappen. */
'use strict';
const fs = require('fs'), path = require('path');
const { decodePng, encodePng, removeBackground, loadTypes } = require('./civilimages.js');

const args = process.argv.slice(2), file = args.find(arg => !arg.startsWith('--') && /\.png$/i.test(arg));
const flag = name => args.includes('--' + name), value = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
if (!file) { console.error('Ange spritesheet-bilden: node tools/civilsheet.js sheet.png --race human --skip 15'); process.exit(1); }
const RACE = value('race', 'human'), ROWS = +value('rows', 4), GAP = +value('gap', 6);
const SKIP = new Set(value('skip', '').split(',').filter(Boolean).map(Number)), ONLY = value('only', '') ? value('only', '').split(',') : null;
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'public', 'images', 'buildings', RACE);

const names = [];
for (const [id, spec] of Object.entries(loadTypes())) for (let v = 1; v <= (spec.variants > 1 ? spec.variants : 1); v++) names.push({ name: id + (spec.variants > 1 ? v : ''), small: spec.kind === 'decor' });

let sheet = decodePng(fs.readFileSync(file));
if (!sheet.data.some((v, i) => i % 4 === 3 && v < 255)) { console.log('Ingen genomskinlighet i bilden: tar bort bakgrunden utifrån hörnfärgen.'); sheet = removeBackground(sheet, +value('tolerance', 28)); }
const { width, height, data } = sheet;

// ---- hitta sprites: pixlar vidgas GAP px (fyrkant), sammanhängande klumpar blir en sprite ----
const bw = width, bh = height, reach = GAP, label = new Int32Array(bw * bh);
const horizontal = new Uint8Array(bw * bh), grown = new Uint8Array(bw * bh);
for (let y = 0; y < height; y++) { const row = y * width;   // vidga åt sidorna med ett glidande avstånd framåt och bakåt
  let near = -1e9; for (let x = 0; x < width; x++) { if (data[(row + x) * 4 + 3] > 20) near = x; if (x - near <= reach) horizontal[row + x] = 1; }
  near = 1e9; for (let x = width - 1; x >= 0; x--) { if (data[(row + x) * 4 + 3] > 20) near = x; if (near - x <= reach) horizontal[row + x] = 1; } }
for (let x = 0; x < width; x++) {
  let near = -1e9; for (let y = 0; y < height; y++) { if (horizontal[y * width + x]) near = y; if (y - near <= reach) grown[y * width + x] = 1; }
  near = 1e9; for (let y = height - 1; y >= 0; y--) { if (horizontal[y * width + x]) near = y; if (near - y <= reach) grown[y * width + x] = 1; }
}
let count = 0;
for (let start = 0; start < bw * bh; start++) {
  if (!grown[start] || label[start]) continue;
  const stack = [start]; label[start] = ++count;
  while (stack.length) {
    const i = stack.pop(), x = i % bw, y = (i / bw) | 0;
    for (let j = Math.max(0, y - 1); j <= Math.min(bh - 1, y + 1); j++) for (let k = Math.max(0, x - 1); k <= Math.min(bw - 1, x + 1); k++) { const n = j * bw + k; if (grown[n] && !label[n]) { label[n] = count; stack.push(n); } }
  }
}
const blobs = Array.from({ length: count }, () => ({ left: width, top: height, right: -1, bottom: -1, pixels: 0 }));
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 20) {
  const blob = blobs[label[y * width + x] - 1]; blob.pixels++;
  if (x < blob.left) blob.left = x; if (x > blob.right) blob.right = x; if (y < blob.top) blob.top = y; if (y > blob.bottom) blob.bottom = y;
}
const sprites = blobs.map((blob, index) => ({ ...blob, id: index + 1, width: blob.right - blob.left + 1, height: blob.bottom - blob.top + 1 })).filter(blob => blob.pixels >= 150)
  .map(blob => ({ ...blob, row: Math.min(ROWS - 1, Math.floor((blob.top + blob.bottom) / 2 / (height / ROWS))) }))
  .sort((a, b) => a.row - b.row || a.left + a.width / 2 - (b.left + b.width / 2));
sprites.forEach((sprite, index) => sprite.number = index + 1);
const used = sprites.filter(sprite => !SKIP.has(sprite.number));
console.log(`Bild ${width}x${height}: hittade ${sprites.length} sprites, hoppar över ${sprites.length - used.length}, ${names.length} namn väntas`);
if (used.length !== names.length) { console.error(`Antalet stämmer inte (${used.length} sprites kvar, ${names.length} behövs). Justera --skip eller --gap.`); }

// ---- skala och spara ----
const render = (sprite, size, fit) => {
  const scale = Math.min(fit / sprite.width, fit / sprite.height), tw = Math.max(1, Math.round(sprite.width * scale)), th = Math.max(1, Math.round(sprite.height * scale)), out = new Uint8ClampedArray(size * size * 4);
  const ox = Math.floor((size - tw) / 2), oy = size === 16 ? Math.floor((size - th) / 2) : size - th - 2;
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
    const x0 = sprite.left + i / scale, x1 = sprite.left + (i + 1) / scale, y0 = sprite.top + j / scale, y1 = sprite.top + (j + 1) / scale;
    let r = 0, g = 0, b = 0, a = 0, weight = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const w = (Math.min(x + 1, x1) - Math.max(x, x0)) * (Math.min(y + 1, y1) - Math.max(y, y0)); if (w <= 0) continue; weight += w;
      if (x < 0 || y < 0 || x >= width || y >= height || label[y * width + x] !== sprite.id) continue;   // bara den här spritens egna pixlar (inte grannens)
      const p = (y * width + x) * 4, alpha = data[p + 3] / 255;
      r += data[p] * alpha * w; g += data[p + 1] * alpha * w; b += data[p + 2] * alpha * w; a += alpha * w;
    }
    if (!weight || a / weight < .5) continue;
    const q = ((oy + j) * size + ox + i) * 4;
    out[q] = r / a; out[q + 1] = g / a; out[q + 2] = b / a; out[q + 3] = 255;
  }
  return { width: size, height: size, data: out };
};

if (!flag('dry')) fs.mkdirSync(OUT, { recursive: true });
let written = 0;
used.forEach((sprite, index) => {
  const entry = names[index]; if (!entry) { console.log(`  #${sprite.number}: inget namn kvar`); return; }
  console.log(`  #${String(sprite.number).padStart(2)} (${sprite.left},${sprite.top} ${sprite.width}x${sprite.height}) -> civil_${entry.name}.png`);
  if (ONLY && !ONLY.includes(entry.name)) return;
  if (!flag('dry')) fs.writeFileSync(path.join(OUT, `civil_${entry.name}.png`), encodePng(render(sprite, entry.small ? 16 : 64, entry.small ? 15 : 60)));
  written++;
});
console.log(`${flag('dry') ? 'Skulle skriva' : 'Skrev'} ${written} bilder till ${OUT}`);
if (!flag('dry') && !flag('nomanifest')) try { console.log(`racemanifest: ${require('./racemanifest.js')()} bilder`); } catch (error) { console.warn('racemanifest:', error.message); }
