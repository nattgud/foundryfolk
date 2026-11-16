/* Skapar bilderna till de civila byggnaderna och detaljerna (js/config/civils.js) med din lokala ComfyUI.
   Kör på din dator (där ComfyUI går):   node tools/civilimages.js [flaggor]

   Vad den gör: för varje bild som saknas (images/buildings/<ras>/civil_<sort>.png) skickas en prompt till ComfyUI (txt2img), den genererade bilden sparas oförändrad i
   tools/civil_raw/, bakgrunden (enfärgat grön) tas bort, motivet beskärs, skalas ner till 64x64 (hela byggnader) eller 16x16 (små detaljer), och sparas på rätt plats med
   genomskinlig bakgrund. Sist körs tools/racemanifest.js så att spelet hittar bilderna. Redan färdiga bilder rörs inte (utan --force). Ingen annan programvara behövs än Node 18+.

   Flaggor:
     --host http://127.0.0.1:8188   ComfyUIs adress (standard den här)
     --checkpoint namn.safetensors  vilken modell som används (standard: den första som heter något med "pixel", annars den första i listan; --list-models visar dem)
     --size 512                     storleken som genereras (standard 512, eller 1024 om modellen heter något med "xl")
     --steps 25 --cfg 7             samplerns steg och cfg
     --only house1,pub              bara de här (utan civil_ och .png)
     --race human|demon             vilken ras (standard human; demon får en mörk, glödande stil och hamnar i demon-mappen)
     --force                        gör om bilder som redan finns
     --reprocess                    gör om bilderna från sparade råbilder i tools/civil_raw/ (ingen ComfyUI behövs): för att prova andra inställningar
     --list                         visar vad som skulle göras, utan att göra något
     --prompt "extra text"          läggs till i varje prompt (t.ex. ett LoRA-ord eller en stil du gillar)
   Blir en bild dålig: kör om bara den med --only <namn> --force (ny slumpad bild varje gång). Vill du rita om den själv, lägg filen på plats så rörs den inte.

   Inga ComfyUI-noder utöver de vanliga (CheckpointLoaderSimple, CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode, SaveImage) behövs. Fungerar något inte,
   skriv ut felet (det visas) och skicka det till mig. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), vm = require('vm');

const ROOT = path.join(__dirname, '..'), RAW = path.join(__dirname, 'civil_raw');

// ---- argument ----
const args = process.argv.slice(2), flag = name => args.includes('--' + name), value = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
const HOST = value('host', 'http://127.0.0.1:8188').replace(/\/$/, ''), RACE = value('race', 'human'), ONLY = value('only', '') ? value('only', '').split(',').map(name => name.trim().replace(/^civil_/, '').replace(/\.png$/, '')) : null;
const STEPS = +value('steps', 25), CFG = +value('cfg', 7), EXTRA = value('prompt', '');

// ---- vad som ska göras: ur config/civils.js ----
const loadTypes = () => {
  const sandbox = { CityBuilder: { Config: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'config', 'civils.js'), 'utf8'), sandbox);
  return sandbox.CityBuilder.Config.civils.types;
};

const STYLE = 'pixel art, medieval fantasy game asset, three-quarter top-down view, bold dark outlines, warm light from the upper left, limited color palette, hand-painted look';
const DEMON_STYLE = 'dark infernal style, black and charred stone, glowing red and orange embers, jagged spikes';
const BACKGROUND = 'solid flat pure bright green (#00ff00) background, centered, single object, no text, no ground shadow';
const NEGATIVE = 'text, watermark, signature, blurry, photo, realistic, 3d render, multiple objects, landscape, scenery, grass field, border, frame, cropped';

// Motivet per sort (en lista = en per variant)
const MOTIFS = {
  house: ['a tiny wooden peasant hut with a thatched roof', 'a timber-frame cottage with a thatched roof and a stone chimney', 'a small stone house with a tiled roof', 'a two-storey half-timbered house with a chimney and shuttered windows'],
  park: ['a small village park with a green lawn, flower beds, trimmed hedges and a wooden bench', 'a small village park with an old oak tree, a gravel path and flowers'],
  pub: 'a medieval tavern with a hanging beer mug sign and barrels outside',
  fountain: 'a stone village fountain with flowing water on a small cobblestone plaza',
  market: ['a medieval market square with red and yellow striped stalls, crates and baskets', 'a medieval market with a cloth-covered stall, barrels and sacks'],
  inn: 'a medieval inn with a stable, a hanging sign and warm lit windows',
  infirmary: 'a small white medieval infirmary house with a red cross and hanging herb bundles',
  graveyard: ['a small medieval graveyard with gravestones and crosses behind a low stone wall', 'a small graveyard with a dead tree, gravestones and crosses'],
  theater: 'a small open-air medieval theater stage with colorful cloth and banners',
  bathhouse: 'a low stone medieval bathhouse with rising steam',
  poorhouse: 'a shabby long medieval poorhouse with a patched roof',
  gambling: 'a dark medieval gambling den with glowing lanterns and a dice sign',
  church: 'a small medieval stone church with a little bell tower',
  school: 'a long medieval wooden schoolhouse with a bell on the roof',
  flowers: ['a small patch of colorful wild flowers', 'a small bunch of red and white flowers', 'a small patch of blue and yellow flowers'],
  lamppost: 'a wooden street lamp post with a lit lantern',
  bush: ['a small round green bush', 'a small berry bush'],
  barrel: 'a wooden barrel with iron bands',
  crates: 'a stack of two wooden crates',
  haybale: 'a round hay bale',
  bench: 'a small wooden bench',
  signpost: 'a wooden signpost with two arrows',
};

const jobs = () => {
  const list = [], types = loadTypes();
  for (const [id, spec] of Object.entries(types)) {
    const motif = MOTIFS[id], variants = spec.variants > 1 ? spec.variants : 1;
    for (let v = 1; v <= variants; v++) {
      const name = id + (variants > 1 ? v : ''), small = spec.kind === 'decor', text = Array.isArray(motif) ? motif[(v - 1) % motif.length] : motif;
      if (!text) { console.warn(`Ingen motivtext för ${id} (lägg till den i MOTIFS i det här skriptet)`); continue; }
      const prompt = `${small ? 'close-up of ' : ''}${text}, ${STYLE}${RACE === 'demon' ? ', ' + DEMON_STYLE : ''}, ${BACKGROUND}${EXTRA ? ', ' + EXTRA : ''}`;
      list.push({ name, size: small ? 16 : 64, prompt, out: path.join(ROOT, 'public', 'images', 'buildings', RACE, `civil_${name}.png`), raw: path.join(RAW, `${RACE}_${name}.png`) });
    }
  }
  return ONLY ? list.filter(job => ONLY.includes(job.name)) : list;
};

// ---- PNG: läsa (8 bitar, RGB/RGBA/gråskala, utan interlace) och skriva (RGBA) ----
const CRC = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
const crc32 = buffer => { let c = 0xffffffff; for (const byte of buffer) c = CRC[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length); return out; };
const encodePng = ({ width, height, data }) => {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const decodePng = buffer => {
  let offset = 8, width, height, depth, color, interlace; const parts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('latin1', offset + 4, offset + 8), body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; color = body[9]; interlace = body[12]; }
    else if (type === 'IDAT') parts.push(body);
    offset += 12 + length;
  }
  if (depth !== 8 || interlace || ![0, 2, 6].includes(color)) throw new Error(`PNG-formatet stöds inte (bitdjup ${depth}, färgtyp ${color}, interlace ${interlace})`);
  const channels = color === 6 ? 4 : color === 2 ? 3 : 1, stride = width * channels, raw = zlib.inflateSync(Buffer.concat(parts)), pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = pixels.subarray(y * stride, (y + 1) * stride), prev = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0, b = prev ? prev[x] : 0, c = prev && x >= channels ? prev[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = a; else if (filter === 2) add = b; else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[x] = (line[x] + add) & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (channels === 4) for (let k = 0; k < 4; k++) data[i * 4 + k] = pixels[i * 4 + k];
    else if (channels === 3) { data[i * 4] = pixels[i * 3]; data[i * 4 + 1] = pixels[i * 3 + 1]; data[i * 4 + 2] = pixels[i * 3 + 2]; data[i * 4 + 3] = 255; }
    else { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = pixels[i]; data[i * 4 + 3] = 255; }
  }
  return { width, height, data };
};

// ---- bildbehandling ----
// Bakgrunden: färgen i hörnen, och allt som liknar den och hänger ihop med kanten blir genomskinligt (grönt inne i motivet rörs inte)
const removeBackground = image => {
  const { width, height, data } = image, corner = [0, width - 1, (height - 1) * width, height * width - 1].map(i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  const bg = [0, 1, 2].map(k => corner.map(c => c[k]).sort((a, b) => a - b)[1]);   // medianen av hörnen
  const near = i => Math.hypot(data[i * 4] - bg[0], data[i * 4 + 1] - bg[1], data[i * 4 + 2] - bg[2]);
  const gone = new Uint8Array(width * height), stack = [];
  const push = i => { if (!gone[i] && near(i) < 90) { gone[i] = 1; stack.push(i); } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (stack.length) { const i = stack.pop(), x = i % width, y = (i / width) | 0; if (x > 0) push(i - 1); if (x < width - 1) push(i + 1); if (y > 0) push(i - width); if (y < height - 1) push(i + width); }
  for (let i = 0; i < width * height; i++) {
    if (gone[i]) { data[i * 4 + 3] = 0; continue; }
    // kantpixlar med grön kant intill bakgrunden: ta bort det gröna skenet
    const x = i % width, y = (i / width) | 0;
    if ((x > 0 && gone[i - 1]) || (x < width - 1 && gone[i + 1]) || (y > 0 && gone[i - width]) || (y < height - 1 && gone[i + width])) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      if (g > Math.max(r, b) + 20) data[i * 4 + 1] = Math.max(r, b);
    }
  }
  return image;
};
const boundingBox = ({ width, height, data }) => {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 20) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
};
// Beskär, skala (areamedelvärde med förmultiplicerad alfa) in i size x size, byggnader nertill och mitt, detaljer mitt i, och gör kanten skarp (alfa 0 eller 255)
const fit = (image, size, small) => {
  const box = boundingBox(image);
  if (!box) throw new Error('bilden blev tom efter att bakgrunden tagits bort (gör om den)');
  const room = size - (small ? 2 : 4), scale = Math.min(room / box.width, room / box.height), targetW = Math.max(1, Math.round(box.width * scale)), targetH = Math.max(1, Math.round(box.height * scale));
  const offsetX = Math.floor((size - targetW) / 2), offsetY = small ? Math.floor((size - targetH) / 2) : size - targetH - 2, out = new Uint8ClampedArray(size * size * 4);
  for (let j = 0; j < targetH; j++) for (let i = 0; i < targetW; i++) {
    const x0 = box.left + i / scale, x1 = box.left + (i + 1) / scale, y0 = box.top + j / scale, y1 = box.top + (j + 1) / scale;
    let r = 0, g = 0, b = 0, a = 0, weight = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const w = (Math.min(x + 1, x1) - Math.max(x, x0)) * (Math.min(y + 1, y1) - Math.max(y, y0)); if (w <= 0) continue;
      const p = (y * image.width + x) * 4, alpha = image.data[p + 3] / 255;
      r += image.data[p] * alpha * w; g += image.data[p + 1] * alpha * w; b += image.data[p + 2] * alpha * w; a += alpha * w; weight += w;
    }
    if (!weight || a / weight < .5) continue;
    const q = ((offsetY + j) * size + offsetX + i) * 4;
    out[q] = r / a; out[q + 1] = g / a; out[q + 2] = b / a; out[q + 3] = 255;
  }
  return { width: size, height: size, data: out };
};

// ---- ComfyUI ----
const api = async (route, options) => {
  const response = await fetch(HOST + route, options);
  if (!response.ok) throw new Error(`${route}: ${response.status} ${await response.text().catch(() => '')}`.slice(0, 400));
  return response;
};
const checkpoints = async () => (await (await api('/object_info/CheckpointLoaderSimple')).json()).CheckpointLoaderSimple.input.required.ckpt_name[0];
const workflow = (checkpoint, prompt, size, seed, prefix) => ({
  1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
  2: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
  3: { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE, clip: ['1', 1] } },
  4: { class_type: 'EmptyLatentImage', inputs: { width: size, height: size, batch_size: 1 } },
  5: { class_type: 'KSampler', inputs: { model: ['1', 0], seed, steps: STEPS, cfg: CFG, sampler_name: 'euler', scheduler: 'normal', positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], denoise: 1 } },
  6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  7: { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: prefix } },
});
const generate = async (checkpoint, job, size) => {
  const seed = Math.floor(Math.random() * 2 ** 32), clientId = 'civilimages-' + process.pid;
  const queued = await (await api('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow(checkpoint, job.prompt, size, seed, 'civil_' + job.name), client_id: clientId }) })).json();
  const id = queued.prompt_id;
  for (let waited = 0; waited < 600; waited++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const history = await (await api('/history/' + id)).json(), entry = history[id];
    if (entry?.status?.status_str === 'error') throw new Error('ComfyUI gav ett fel: ' + JSON.stringify(entry.status.messages).slice(0, 400));
    const file = entry?.outputs?.['7']?.images?.[0];
    if (file) return Buffer.from(await (await api(`/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder || '')}&type=${file.type || 'output'}`)).arrayBuffer());
  }
  throw new Error('ComfyUI blev inte klar inom 10 minuter');
};

const finish = (job, rawBuffer) => {
  const image = fit(removeBackground(decodePng(rawBuffer)), job.size, job.size === 16);
  fs.mkdirSync(path.dirname(job.out), { recursive: true });
  fs.writeFileSync(job.out, encodePng(image));
};

(async () => {
  const list = jobs();
  if (flag('list')) { for (const job of list) console.log(`${fs.existsSync(job.out) && !flag('force') ? '(finns) ' : '         '}civil_${job.name}.png  ${job.size}x${job.size}\n    ${job.prompt}`); return; }
  const todo = list.filter(job => flag('force') || flag('reprocess') || !fs.existsSync(job.out));
  if (!todo.length) { console.log('Inget att göra: alla bilder finns redan (--force för att göra om dem).'); return; }
  fs.mkdirSync(RAW, { recursive: true });
  let checkpoint = null, size = +value('size', 0);
  if (!flag('reprocess')) {
    const names = await checkpoints().catch(error => { console.error(`Kan inte nå ComfyUI på ${HOST} (${error.message}). Är den igång, och rätt adress (--host)?`); process.exit(1); });
    if (flag('list-models')) { console.log(names.join('\n')); return; }
    checkpoint = value('checkpoint', names.find(name => /pixel/i.test(name)) || names[0]);
    if (!names.includes(checkpoint)) { console.error(`Modellen "${checkpoint}" finns inte. Tillgängliga:\n${names.join('\n')}`); process.exit(1); }
    size = size || (/xl/i.test(checkpoint) ? 1024 : 512);
    console.log(`ComfyUI: ${HOST}, modell ${checkpoint}, ${size}x${size}, ${todo.length} bilder, ras ${RACE}`);
  }
  let done = 0;
  for (const job of todo) {
    try {
      let raw;
      if (flag('reprocess')) { if (!fs.existsSync(job.raw)) { console.log(`hoppar över civil_${job.name} (ingen råbild)`); continue; } raw = fs.readFileSync(job.raw); }
      else { raw = await generate(checkpoint, job, size); fs.writeFileSync(job.raw, raw); }
      finish(job, raw);
      console.log(`${++done}/${todo.length} civil_${job.name}.png`);
    } catch (error) { console.error(`civil_${job.name}: ${error.message}`); }
  }
  try { console.log(`racemanifest: ${require('./racemanifest.js')()} bilder`); } catch (error) { console.warn('racemanifest:', error.message); }
})().catch(error => { console.error(error); process.exit(1); });

module.exports = { decodePng, encodePng, removeBackground, fit };
