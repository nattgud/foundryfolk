// node tools/newexpansion.js <id> "Titel"   skapar public/js/expansions/<id>.js och registrerar den i public/js/files.js
const fs = require('fs'), path = require('path');
const [id, title = 'New Expansion'] = process.argv.slice(2);
if (!id || !/^[a-z0-9_]+$/.test(id)) { console.error('Användning: node tools/newexpansion.js <id> "Titel"   (id: a-z, 0-9, _)'); process.exit(1); }
const root = path.join(__dirname, '..', 'public', 'js'), file = path.join(root, 'expansions', id + '.js'), files = path.join(root, 'files.js');
if (fs.existsSync(file)) { console.error('Finns redan: ' + file); process.exit(1); }
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `/* Expansion "${title}". Se config/expansions.js för hur den hänger ihop. Kapitlen har samma fält som i config/story.js. */
(function (CityBuilder) {
  'use strict';

  const say = (who, text) => ({ who, text });
  const more = (resource, n) => ({ resource, more: n });

  CityBuilder.Config.expansions.define({
    id: ${JSON.stringify(id)},
    title: ${JSON.stringify(title)},
    village: 'Thunebrook',
    seed: ${Math.floor(Math.random() * 9000) + 1000},
    // speakers: { ny_person: { name: 'Namn', color: '#c9b36a', voice: { pitch: 1 } } },   // läggs till grundstoryns
    // sceneryTypes: {},   scenes: {},   unlock: { byggnad: kapitel }
    chapters: [
      // 1
      {
        name: 'First Chapter',
        rivals: 1,
        ai: 30,
        races: { 2: 'demon' },
        goals: [more('bread', 20)],
        dialogue: [say('narrator', 'Write the story here.')],
        events: [],
        after: [],
      },
    ],
    epilogue: [],
  });
})(CityBuilder);
`.replace(/\n/g, '\r\n'));
let list = fs.readFileSync(files, 'utf8');
const eol = list.includes('\r\n') ? '\r\n' : '\n', entry = "  'js/expansions/" + id + ".js',";
if (!list.includes(entry)) {
  const anchor = "  'js/config/expansions.js'," + eol;
  if (!list.includes(anchor)) { console.error('files.js saknar config/expansions.js'); process.exit(1); }
  list = list.replace(anchor, anchor + entry + eol);
  fs.writeFileSync(files, list);
}
console.log('Skapade ' + file + ' och la in den i files.js. Kontroll: CityBuilder.Config.expansions.check(' + JSON.stringify(id) + ')');
