/* UTVECKLARVERKTYG, inte en del av spelet: story-editor för kulisser, döda byggnader, skådespelare och händelser. Laddas bara med ?editor i adressen
   (se index.html). Starta ett kapitel som vanligt och öppna sidan med ?editor. Panelen uppe till vänster har fyra flikar:
     Karta         placera lik, blod, ruiner, eld och döda byggnader (dra för att måla), flytta eller ta bort dem
     Skådespelare  bygg en skådespelare: namn, bild, startruta och ett manus av steg (gå dit, vänta, prata, döda, försvinn, lämna scenen)
     Händelser     bestäm NÄR något ska hända (villkor) och VAD som ska hända (starta en skådespelare, byta manus, dialog, ge varor)
     Exportera     kontroll av det du byggt och färdiga rader att klistra in i kapitlet i config/story.js
   Skådespelare och händelser sparas automatiskt i webbläsaren (per kapitel). Kartans ändringar sparas inte: exportera dem.
   Ta bort verktyget: radera den här filen och de två raderna märkta EDITOR i index.html. Inget annat i spelet beror på den. */
(function () {
  'use strict';
  const wait = setInterval(() => {
    const C = window.CityBuilder;
    if (C && C.Game && C.World && C.Renderer && C.Story && C.Config && C.Actors && C.Renderer.canvas) { clearInterval(wait); try { init(C); } catch (error) { console.error('Story-editor: start misslyckades', error); } }
  }, 300);

  function init(C) {
    const { World, Renderer, Story, Config, Utils, Players } = C, canvas = Renderer.canvas, A = C.Actors;

    // ---------------------------------------------------------------- data
    const st = { tab: 'scene', mode: 'place', type: 's:corpse', layer: '', drag: null, painting: false, hover: null, last: null, arm: null, note: '' };
    let scenes = [], cur = 0, chapterNumber = null;
    const previews = [], previewScenes = [], previewAppear = []; let previewBase = 0;

    const sceneryTypes = Object.keys(Config.story.sceneryTypes || {});
    const defaultLayer = { blood: 0, corpse: 1, ruin: 0, fire: 1 };
    const buildingTypes = Object.keys(Config.buildings).filter(id => !Config.buildings[id].pile && id !== 'hq' && id !== 'monument').sort();
    const resourceIds = Object.keys(Config.resources).sort();
    const speakerIds = Object.keys(Config.story.speakers || {});
    const strip = path => path.replace(/\?.*$/, '');
    const images = [];   // { path, size, label }: alla enhetsbilder
    for (const [id, unit] of Object.entries(Config.units)) if (id !== 'actor' && unit.image) images.push({ path: strip(unit.image), size: unit.imageSize, label: id });
    for (const entry of Object.values(Config.units.worker?.imagesByBuilding || {})) if (entry.image && !images.some(item => item.path === strip(entry.image))) images.push({ path: strip(entry.image), size: Config.units.worker.imageSize, label: strip(entry.image).replace('images/units/', '').replace('.png', '') });
    images.sort((x, y) => x.label.localeCompare(y.label));
    // Berättelsens karaktärer med helkroppsbild (images/units/<ras>/<id>.png): letas upp i bakgrunden, så nya bilder dyker upp av sig själva
    const characters = {};   // sökväg -> ras
    for (const id of speakerIds.filter(name => name !== 'reeve' && name !== 'narrator')) for (const race of ['human', 'demon']) {
      if (C.RaceImages) { if (C.RaceImages.has(`images/units/${race}/${id}.png`)) characters[`images/units/${id}.png`] = race; continue; }   // listan finns: inga 404 från att gissa
      const probe = new Image();
      probe.onload = () => { characters[`images/units/${id}.png`] = race; if (window.StoryEditor) window.StoryEditor.render(); };
      probe.src = `images/units/${race}/${id}.png`;
    }
    // Övriga rasbilder som inte är vanliga enheter, till exempel grupper som går tillsammans (thordramandalbertha, baeltharandmordrath)
    if (C.RaceImages) {
      const known = new Set(images.map(item => item.path.replace(/^.*\//, '')));
      for (const file of C.RaceImages) {
        const m = /^images\/units\/(human|demon)\/([^/]+\.png)$/.exec(file);
        if (m && !known.has(m[2]) && !(C.RaceImages.has(`images/units/human/${m[2]}`) && C.RaceImages.has(`images/units/demon/${m[2]}`)) && !/_(carry|loaded)\.png$/.test(m[2]) && !characters[`images/units/${m[2]}`]) characters[`images/units/${m[2]}`] = m[1];
      }
    }
    const defaultImage = images.find(item => item.label === 'worker')?.path || images[0]?.path || '';

    // ---------------------------------------------------------------- hjälpare
    const hq = () => World.headquarters;
    const hasTrigger = sc => sc.conds.some(c => c.kind.startsWith('on') || c.kind.startsWith('sees'));   // händelser och "ser" pekar ut något: det som utlöste scenen
    const TRIGGER = '__trigger';   // mål: det som utlöste händelsen (bara för en scen som startar av en händelse)
    const keyOf = (x, y) => Utils.tileKey(x, y);
    const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const ser = value => value && typeof value === 'object'
      ? (Array.isArray(value) ? '[' + value.map(ser).join(', ') + ']'
        : value.who !== undefined && value.text !== undefined ? `say(${JSON.stringify(value.who)}, ${JSON.stringify(value.text)})`
        : '{ ' + Object.entries(value).map(([key, item]) => `${/^[a-z_]\w*$/i.test(key) ? key : JSON.stringify(key)}: ${ser(item)}`).join(', ') + ' }')
      : JSON.stringify(value);
    const chapter = () => Story.chapter;
    const existingEvents = () => chapter()?.events || [];
    const actorIds = () => [...new Set([...scenes.flatMap(sc => sc.cast.map(c => c.id)), ...existingEvents().flatMap(event => [].concat(event.spawn || []).map(spec => spec.id))])];
    const imageSrc = (path, race) => { const m = /^images\/units\/([^/]+\.png)$/.exec(path || ''); return m ? `images/units/${race || 'human'}/${m[1]}` : path; };   // spelets sökväg saknar rasmappen (som i Config.units): den sätts in här, annars ger förhandsvisningen 404
    const nameOf = path => images.find(item => item.path === path)?.label || (path || '').replace('images/units/', '').replace('.png', '');
    const targetText = target => target === TRIGGER ? 'det som utlöste händelsen' : Array.isArray(target) ? `ruta (${target[0]}, ${target[1]})` : typeof target === 'string' ? (target === 'hq' ? 'basen' : target) : JSON.stringify(target);
    const select = (id, options, current, bind) => `<select ${id ? `id="${id}"` : ''} ${bind ? `data-bind="${bind}"` : ''}>${options.map(option => { const [value, label] = Array.isArray(option) ? option : [option, option]; return `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(label)}</option>`; }).join('')}</select>`;


    // ---------------------------------------------------------------- läsa in kapitlets befintliga händelser (omvänt mot compileScene)
    // Det editorn förstår blir en scen att redigera; allt annat i händelsen sparas orört i extra och skrivs ut igen vid export, så inget går förlorat.
    const HANDLED = ['id', 'at', 'goal', 'end', 'when', 'on', 'repeat', 'cooldown', 'whileFog', 'spawn', 'scene', 'tell', 'music', 'give', 'weather', 'tornado', 'super', 'meteors', 'where', 'letter'];
    const SEES = { rival: 'seesRival', soldier: 'seesSoldier', worker: 'seesWorker', carrier: 'seesCarrier', monster: 'seesMonster' };
    const sameKeys = (object, keys) => Object.keys(object).length === keys.length && keys.every(key => key in object);
    const targetIn = value => value && typeof value === 'object' && !Array.isArray(value) && value.trigger ? TRIGGER : value;
    function condsOf(event) {
      const conds = [], leftover = {};
      const num = n => ({ n: String(n) });
      if (event.at !== undefined && !(event.at === 0 && event.goal === undefined && !event.end && !event.on && event.when === undefined)) conds.push({ kind: 'time', v: num(event.at) });
      if (event.goal !== undefined) conds.push({ kind: 'goal', v: num(event.goal) });
      if (event.end) conds.push({ kind: 'end', v: {} });
      if (event.on !== undefined) {
        const on = typeof event.on === 'string' ? { event: event.on } : event.on;
        const key = Object.keys(COND).find(k => /^on[A-Z]/.test(k) && COND[k].make({}).top.on.event === on.event);
        const names = key ? COND[key].f.map(([name]) => name) : [];
        if (key && Object.keys(on).every(name => name === 'event' || name === 'radius' || names.includes(name))) {
          const v = {}; for (const name of names) v[name] = on[name] ?? '';
          if (on.near !== undefined) v.radius = String(on.radius ?? 5);
          conds.push({ kind: key, v });
        } else leftover.on = event.on;
      }
      if (event.when !== undefined) {
        const needs = [].concat(event.when), made = needs.map(need => {
          const keys = Object.keys(need);
          if (need.sees && sameKeys(need, ['sees']) && SEES[need.sees]) return { kind: SEES[need.sees], v: {} };
          if (need.type === 'build' && keys.every(k => ['type', 'id', 'amount'].includes(k))) return { kind: 'built', v: { bld: need.id, n: String(need.amount ?? 1) } };
          if (need.resource && sameKeys(need, ['resource', 'amount'])) return { kind: 'stock', v: { res: need.resource, n: String(need.amount) } };
          if (need.resource && sameKeys(need, ['resource', 'made'])) return { kind: 'made', v: { res: need.resource, n: String(need.made) } };
          if (need.type === 'kills' && sameKeys(need, ['type', 'amount'])) return { kind: 'kills', v: num(need.amount) };
          if (need.type === 'destroy' && need.id === 'any' && sameKeys(need, ['type', 'id', 'amount'])) return { kind: 'destroyed', v: num(need.amount) };
          for (const [type, kind] of [['soldiers', 'soldiers'], ['carriers', 'carriers'], ['casts', 'casts']]) if (need.type === type && sameKeys(need, ['type', 'amount'])) return { kind, v: num(need.amount) };
          if (need.type === 'fog' && sameKeys(need, ['type', 'amount']) && need.amount === 1) return { kind: 'fogLifted', v: {} };
          if (need.scene && sameKeys(need, ['scene'])) return { kind: 'sceneDone', v: { sc: need.scene } };
          return null;
        });
        if (made.every(Boolean)) conds.push(...made); else leftover.when = event.when;
      }
      return { conds, leftover };
    }
    function importEvent(event, number) {
      const sc = { id: event.id || 'scene' + number, name: event.id || 'Scen ' + number, conds: [], cast: [], steps: [] }, extra = {};
      const { conds, leftover } = condsOf(event);
      sc.conds = conds; Object.assign(extra, leftover);
      // Medverkande: de som står på kartan från början (spawn), och de som dyker upp senare (spawn-steg)
      const castOf = spec => { let c = sc.cast.find(x => x.id === spec.id); if (!c) { c = { id: spec.id, image: spec.image, race: spec.race || '', count: spec.count || 1, at: null }; sc.cast.push(c); } return c; };
      const specs = [].concat(event.spawn || []), plain = spec => spec.id && Object.keys(spec).every(key => ['id', 'image', 'race', 'count', 'at', 'script'].includes(key)) && !(spec.script || []).length;
      if (specs.every(plain)) for (const spec of specs) castOf(spec).at = spec.at; else extra.spawn = event.spawn;
      const selector = who => who && typeof who === 'object' ? { who: UNIT, pick: who.pick || 'trigger', side: who.side || '', kind: who.kind || '' } : { who };
      const stepOf = raw => {
        if (!raw || typeof raw !== 'object') return null;
        const known = ['spawn', 'who', 'walk', 'say', 'leave', 'vanish', 'tell', 'wait', 'camera', 'zoom', 'together', 'follow', 'otherwise'];
        if (Object.keys(raw).some(key => !known.includes(key))) return null;
        let step = null;
        if (raw.spawn && raw.spawn.id && Object.keys(raw.spawn).every(key => ['id', 'image', 'race', 'count', 'at'].includes(key))) { const c = castOf(raw.spawn); step = { type: 'appear', who: c.id, arg: targetIn(raw.spawn.at) }; }
        else if (raw.camera !== undefined) step = { type: 'camera', arg: targetIn(raw.camera), ...(raw.zoom ? { zoom: raw.zoom } : {}) };
        else if (raw.say && typeof raw.say === 'object' && typeof raw.say.text === 'string') step = { type: 'say', ...selector(raw.who), arg: { text: raw.say.text } };
        else if (raw.walk !== undefined && typeof raw.who === 'string') step = { type: 'walk', who: raw.who, arg: targetIn(raw.walk), ...(raw.follow ? { follow: true } : {}) };
        else if (raw.leave && typeof raw.who === 'string') step = { type: 'leave', who: raw.who };
        else if (raw.vanish && typeof raw.who === 'string') step = { type: 'vanish', who: raw.who };
        else if (Array.isArray(raw.tell)) step = { type: 'dialog', arg: raw.tell.map(line => ({ who: line.who, text: line.text })) };
        else if (raw.wait !== undefined) step = { type: 'wait', arg: raw.wait };
        if (!step) return null;
        if (raw.together) step.together = true;
        if (raw.otherwise) { const alt = raw.otherwise.map(stepOf); if (alt.some(x => !x)) return null; step.otherwise = alt; }
        return step;
      };
      let steps = [];
      if (Array.isArray(event.tell) && (event.scene === undefined || Array.isArray(event.scene))) steps.push({ type: 'dialog', arg: event.tell.map(line => ({ who: line.who, text: line.text })) });
      if (Array.isArray(event.scene)) { const made = event.scene.map(stepOf); if (made.every(Boolean)) steps.push(...made); else { steps = []; extra.scene = event.scene; if (event.tell) extra.tell = event.tell; sc.cast = sc.cast.filter(c => c.at); } }
      else if (event.scene !== undefined) { extra.scene = event.scene; if (event.tell) extra.tell = event.tell; steps = []; }
      sc.steps = steps;
      if (event.repeat) { sc.repeat = true; sc.cooldown = event.cooldown ?? 30; }
      if (event.whileFog) sc.whileFog = true;
      // Musik, varor, väder, brev
      const music = event.music;
      if (music === null) sc.music = 'default';
      else if (typeof music === 'string' || Array.isArray(music)) { sc.music = 'set'; sc.musicCalm = [].concat(music).join(', '); }
      else if (music && typeof music === 'object' && Object.keys(music).every(key => key === 'calm' || key === 'battle')) {
        sc.music = 'set'; if (music.calm) sc.musicCalm = [].concat(music.calm).join(', ');
        if (music.battle === false) sc.battleOff = true; else if (music.battle) sc.musicBattle = [].concat(music.battle).join(', ');
      } else if (music !== undefined) extra.music = music;
      if (event.give) sc.give = Object.entries(event.give).map(([res, n]) => ({ res, n }));
      if (event.weather) sc.weather = event.weather;
      for (const key of ['tornado', 'super', 'meteors']) if (event[key]) sc[key] = event[key];
      if (event.where !== undefined) sc.where = targetIn(event.where);
      if (event.letter && Array.isArray(event.letter.lines) && Object.keys(event.letter).every(key => ['lines', 'greeting', 'signature', 'throne'].includes(key))) {
        sc.letterText = event.letter.lines.join('\n'); if (event.letter.greeting) sc.letterGreeting = event.letter.greeting;
        if (event.letter.throne) sc.letterThrone = true; else if (event.letter.signature) sc.letterFrom = event.letter.signature;
      } else if (event.letter) extra.letter = event.letter;
      for (const key of Object.keys(event)) if (!HANDLED.includes(key)) extra[key] = event[key];
      if (Object.keys(extra).length) sc.extra = extra;
      return sc;
    }

    // ---------------------------------------------------------------- spara och ladda (webbläsaren, per kapitel)
    const storeKey = number => `storyEditor.v2.chapter${number}`;
    let importedIds = [];   // kapitlets händelser som redan lästs in i editorn (en raderad scen kommer inte tillbaka vid nästa laddning)
    const persist = () => { try { if (chapterNumber !== null) localStorage.setItem(storeKey(chapterNumber), JSON.stringify({ scenes, imported: importedIds })); } catch (error) { /* ingen lagring */ } };
    // Vid laddning av en bana: de scener du sparat i editorn, och dessutom kapitlets händelser (chapter.events) som inte lästs in förut. Är inget sparat läses alla in.
    const restore = number => {
      scenes = []; cur = 0; importedIds = [];
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(storeKey(number)) || 'null'); } catch (error) { /* tomt */ }
      if (saved && Array.isArray(saved.scenes)) { scenes = saved.scenes.filter(sc => sc && typeof sc === 'object'); importedIds = Array.isArray(saved.imported) ? saved.imported : []; }
      scenes.forEach((sc, index) => { sc.id = sc.id || 'scen' + (index + 1); sc.name = sc.name || sc.id; for (const key of ['conds', 'cast', 'steps']) if (!Array.isArray(sc[key])) sc[key] = []; });
      const keyOf = event => event.id || 'h' + JSON.stringify(event).split('').reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) | 0, 7);   // händelser utan id känns igen på sitt innehåll
      const pull = (event, index, key) => {
        if (importedIds.includes(key) || (event.id && scenes.some(sc => sc.id === event.id))) return;
        let sc; try { sc = importEvent(event, index + 1); } catch (error) { console.warn('Story-editor: kunde inte läsa in händelse', index, error); return; }
        const shape = scene => { const out = JSON.stringify({ ...compileScene(scene), id: 0 }); return out; };
        let twin = false; try { const mine = shape(sc); twin = scenes.some(other => shape(other) === mine); } catch (error) { /* ingen tvilling */ }
        importedIds.push(key);
        if (twin) return;   // samma händelse ligger redan som scen (inläst en tidigare gång)
        while (scenes.some(other => other.id === sc.id)) sc.id += 'b';
        scenes.push(sc);
      };
      const events = chapter()?.events || [];
      // kapitlets eget brev (chapter.letter) blir en vanlig scen, så att du kan välja när det inträffar
      const own = chapter()?.letter, ownJson = own && JSON.stringify(own.lines);
      if (own && Array.isArray(own.lines) && !events.some(event => event.letter && JSON.stringify(event.letter.lines) === ownJson)) pull({ id: 'letter', name: 'Brev', letter: own }, -1, 'chapter-letter');
      events.forEach((event, index) => pull(event, index, keyOf(event)));
    };

    // ---------------------------------------------------------------- panel
    const style = document.createElement('style');
    style.textContent = `
      #storyEditor{position:fixed;left:8px;top:8px;z-index:99999;width:318px;background:rgb(20 20 24 / 95%);color:#ddd;font:13px/1.35 sans-serif;border:1px solid #666;border-radius:6px;max-height:94vh;overflow:auto;box-sizing:border-box}
      #storyEditor .se-head{padding:6px 8px;border-bottom:1px solid #444;display:flex;justify-content:space-between;align-items:center;gap:6px}
      #storyEditor .se-tabs{display:flex}
      #storyEditor .se-tabs button{flex:1;border-radius:0;border:0;border-bottom:2px solid transparent;background:#2a2a30;color:#bbb;padding:7px 2px;cursor:pointer}
      #storyEditor .se-tabs button.on{background:#38383f;color:#fff;border-bottom-color:#ffd54a}
      #storyEditor .se-body{padding:8px}
      #storyEditor .hint{color:#9a9a9a;font-size:12px;margin:4px 0}
      #storyEditor h4{margin:10px 0 4px;font-size:13px;color:#ffd54a}
      #storyEditor .row{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin:3px 0}
      #storyEditor button{cursor:pointer;background:#3a3a42;color:#eee;border:1px solid #555;border-radius:4px;padding:3px 7px;font:inherit}
      #storyEditor button:hover{background:#4a4a54}
      #storyEditor button.primary{background:#2d6a3d;border-color:#3f8d55}
      #storyEditor button.danger{background:#6a2d2d;border-color:#8d3f3f}
      #storyEditor button.small{padding:0 5px}
      #storyEditor select,#storyEditor input[type=text],#storyEditor input[type=number],#storyEditor input:not([type]){background:#1b1b1f;color:#eee;border:1px solid #555;border-radius:4px;padding:3px;font:inherit;max-width:100%;box-sizing:border-box}
      #storyEditor .card{background:#26262b;border:1px solid #444;border-radius:5px;padding:5px 6px;margin:4px 0}
      #storyEditor .step{display:flex;gap:4px;align-items:flex-start;margin:2px 0}
      #storyEditor .step span{flex:1}
      #storyEditor .banner{background:#7a5f00;color:#fff;padding:6px 8px;display:flex;justify-content:space-between;align-items:center;gap:6px}
      #storyEditor .ok{color:#7fd48f} #storyEditor .warn{color:#ffb454}
      #storyEditor textarea{width:100%;height:210px;font:11px monospace;background:#111;color:#ddd;border:1px solid #555;box-sizing:border-box}
      #storyEditor img.pv{width:48px;height:48px;object-fit:contain;image-rendering:pixelated;background:#444;border-radius:4px}
      #storyEditor h5{margin:10px 0 4px;color:#9ad;font-size:12px}
      #storyEditor details summary{cursor:pointer;color:#9ad}
    `;
    document.head.appendChild(style);
    const panel = document.createElement('div');
    panel.id = 'storyEditor';
    document.body.appendChild(panel);
    for (const type of ['pointerdown', 'pointerup', 'wheel']) panel.addEventListener(type, event => event.stopPropagation());
    const $ = selector => panel.querySelector(selector);

    // ---------------------------------------------------------------- flikarna
    const tabsNow = () => [['scene', 'Scener'], ['map', 'Karta'], ['export', 'Exportera']];

    function viewMap() {
      return `<p class="hint">Placera kulisser och döda byggnader direkt på kartan. Klicka eller dra för att måla.</p>
        <div class="row"><label><input type="radio" name="mode" data-bind="mode" value="place"${st.mode === 'place' ? ' checked' : ''}> Placera</label>
        <label><input type="radio" name="mode" data-bind="mode" value="move"${st.mode === 'move' ? ' checked' : ''}> Flytta / ta bort</label></div>
        <div class="row"><select data-bind="type" style="width:100%"><optgroup label="Kulisser">${sceneryTypes.map(t => `<option value="s:${t}"${st.type === 's:' + t ? ' selected' : ''}>${t}</option>`).join('')}</optgroup>
        <optgroup label="Döda byggnader">${buildingTypes.map(t => `<option value="b:${t}"${st.type === 'b:' + t ? ' selected' : ''}>${t}</option>`).join('')}</optgroup></select></div>
        <div class="row">Lager <input type="number" data-bind="layer" value="${esc(st.layer)}" placeholder="auto" style="width:60px"> <span class="hint">(auto = blod under lik)</span></div>
        <div class="row"><label title="Gäller de döda byggnader du placerar härefter"><input type="checkbox" data-bind="beacon"${st.beacon ? ' checked' : ''}> Döda byggnader syns alltid (även i dimman)</label></div>
        ${st.beacon ? `<div class="row">Radie <input type="number" min="1" data-bind="beaconRadius" value="${esc(st.beaconRadius ?? 6)}" style="width:60px"> rutor <label><input type="checkbox" data-bind="beaconArrow"${st.beaconArrow ? ' checked' : ''}> pil mot den på minimapen</label></div><p class="hint">Gäller byggnader du placerar härefter. Ta bort och placera om för att ändra en som redan står.</p>` : ''}
        <p class="hint">Högerklick eller Delete tar bort det under pekaren. Skift + dra styr kameran.</p>
        <button class="danger" data-act="clearScenery">Ta bort alla kulisser i kapitlet</button>`;
    }

    // När en scen startar (inget villkor = direkt när kapitlet startar)
    const COND = {
      time:  { label: 'Efter så här många sekunder in i kapitlet', f: [['n', 'num', 'sekunder']], make: v => ({ top: { at: +v.n } }), text: v => `efter ${v.n} s` },
      goal:  { label: 'När ett mål är klart', f: [['n', 'num', 'målnummer (1 = första)']], make: v => ({ top: { goal: +v.n } }), text: v => `när mål ${v.n} är klart` },
      built: { label: 'När spelaren har byggt något', f: [['bld', 'bld'], ['n', 'num', 'antal']], make: v => ({ when: { type: 'build', id: v.bld, amount: +v.n || 1 } }), text: v => `när ${v.n || 1} ${v.bld} är byggt` },
      stock: { label: 'När spelaren har så här mycket av en vara', f: [['res', 'res'], ['n', 'num', 'antal']], make: v => ({ when: { resource: v.res, amount: +v.n } }), text: v => `när lagret har ${v.n} ${v.res}` },
      seesRival:   { label: 'När spelaren ser fiendens bas första gången', f: [], make: () => ({ when: { sees: 'rival' } }), text: () => 'när fiendens bas setts' },
      seesSoldier: { label: 'När fiendens soldater syns (t.ex. en attack)', f: [], make: () => ({ when: { sees: 'soldier' } }), text: () => 'när fiendens soldater syns' },
      seesWorker:  { label: 'När fiendens arbetare syns', f: [], make: () => ({ when: { sees: 'worker' } }), text: () => 'när fiendens arbetare syns' },
      seesCarrier: { label: 'När fiendens bärare syns', f: [], make: () => ({ when: { sees: 'carrier' } }), text: () => 'när fiendens bärare syns' },
      seesMonster: { label: 'När ett monster syns', f: [], make: () => ({ when: { sees: 'monster' } }), text: () => 'när ett monster syns' },
      kills:     { label: 'När spelaren har besegrat så här många fiender', f: [['n', 'num', 'antal']], make: v => ({ when: { type: 'kills', amount: +v.n } }), text: v => `när ${v.n} fiender är besegrade` },
      destroyed: { label: 'När spelaren har förstört så här många fiendebyggnader', f: [['n', 'num', 'antal']], make: v => ({ when: { type: 'destroy', id: 'any', amount: +v.n } }), text: v => `när ${v.n} fiendebyggnader är förstörda` },
      soldiers:  { label: 'När spelaren har så här många soldater', f: [['n', 'num', 'antal']], make: v => ({ when: { type: 'soldiers', amount: +v.n } }), text: v => `när spelaren har ${v.n} soldater` },
      carriers:  { label: 'När spelaren har så här många bärare', f: [['n', 'num', 'antal']], make: v => ({ when: { type: 'carriers', amount: +v.n } }), text: v => `när spelaren har ${v.n} bärare` },
      casts:     { label: 'När spelaren har trollat så här många gånger', f: [['n', 'num', 'antal']], make: v => ({ when: { type: 'casts', amount: +v.n } }), text: v => `när ${v.n} förtrollningar är gjorda` },
      fogLifted: { label: 'När dimman har lyft', f: [], make: () => ({ when: { type: 'fog', amount: 1 } }), text: () => 'när dimman har lyft' },
      sceneDone: { label: 'När en annan scen är klar', f: [['sc', 'scn']], make: v => ({ when: { scene: v.sc } }), text: v => `när scenen ${v.sc} är klar` },
      end:   { label: 'När alla mål är uppnådda (banan avslutas efter scenen)', f: [], make: () => ({ top: { end: true } }), text: () => 'när alla mål är uppnådda' },
      made:  { label: 'När så här mycket har tillverkats', f: [['res', 'res'], ['n', 'num', 'antal']], make: v => ({ when: { resource: v.res, made: +v.n } }), text: v => `när ${v.n} ${v.res} är tillverkat` },
    };
    // Händelser: spelet säger till direkt när något sker (Story.emit), så de kostar ingenting att vänta på
    const SIDE_OPT = [['', 'vem som helst'], ['own', 'spelarens'], ['enemy', 'fiendens'], ['monster', 'monster']];
    const KIND_OPT = [['', 'vad som helst'], ['soldier', 'soldat'], ['carrier', 'bärare'], ['worker', 'arbetare']];
    const ANY = list => () => [['', 'vilken som helst'], ...list().map(x => [x, x])];
    const sideF = (hint = 'vems') => ['side', 'opt', hint, SIDE_OPT], kindF = ['kind', 'opt', 'sort', KIND_OPT], byF = ['by', 'opt', 'orsakat av', SIDE_OPT];
    const nearF = ['near', 'near', 'nära'];
    const onMake = (event, v) => { const on = { event }; for (const key of ['side', 'kind', 'by', 'resource', 'building', 'weather']) if (v[key]) on[key] = v[key]; if (v.near) { on.near = v.near; on.radius = Math.max(1, +v.radius || 5); } return { top: { on } }; };
    const onText = (what, v) => { const parts = Object.entries(v).filter(([key, x]) => x && key !== 'near' && key !== 'radius').map(([, x]) => x); if (v.near) parts.push(`nära ${targetText(v.near)}, ${v.radius || 5} rutor`); return `${what}${parts.length ? ' (' + parts.join(', ') + ')' : ''}`; };
    const onCond = (label, event, f) => ({ label: 'HÄNDELSE: ' + label, f, make: v => onMake(event, v), text: v => onText(label, v) });
    Object.assign(COND, {
      onHurt:      onCond('någon tar skada', 'hurt', [sideF('som skadas'), kindF, byF, nearF]),
      onDefeated:  onCond('en enhet dödas', 'defeated', [sideF('som dör'), kindF, byF, nearF]),
      onDestroyed: onCond('en byggnad förstörs', 'destroyed', [sideF('vems byggnad'), ['building', 'opt', 'sort', ANY(() => buildingTypes)], byF, nearF]),
      onPickup:    onCond('en bärare hämtar en vara', 'pickup', [['resource', 'opt', 'vara', ANY(() => resourceIds)], sideF('bärare'), nearF]),
      onDeliver:   onCond('en bärare lämnar en vara', 'deliver', [['resource', 'opt', 'vara', ANY(() => resourceIds)], sideF('bärare'), nearF]),
      onMade:      onCond('en vara tillverkas', 'made', [['resource', 'opt', 'vara', ANY(() => resourceIds)], nearF]),
      onBuilt:     onCond('en byggnad blir klar', 'built', [['building', 'opt', 'sort', ANY(() => buildingTypes)], sideF('vems'), nearF]),
      onCast:      onCond('en förtrollning görs', 'cast', [nearF]),
      onRepaired:  onCond('en byggnad lagas klart', 'repaired', [['building', 'opt', 'sort', ANY(() => buildingTypes)], sideF('vems'), nearF]),
      onWeather:   onCond('vädret byts', 'weather', [['weather', 'opt', 'till', ANY(() => Object.keys(Config.settings.weather?.chances || {}))]]),
    });
    // Rullistan delas i grupper; händelserna i spelet körs direkt när något sker
    const GROUPS = [['Tid och mål', ['time', 'goal', 'end']], ['Framsteg (kollas löpande)', ['stock', 'soldiers', 'carriers']], ['Framsteg (direkt när det sker)', ['built', 'made', 'kills', 'destroyed', 'casts', 'fogLifted']], ['Syn', ['seesRival', 'seesSoldier', 'seesWorker', 'seesCarrier', 'seesMonster']], ['Andra scener', ['sceneDone']], ['Händelser i spelet (direkt)', Object.keys(COND).filter(k => k.startsWith('on'))]];
    const condOptions = current => GROUPS.map(([label, keys]) => `<optgroup label="${esc(label)}">${keys.filter(k => COND[k]).map(k => `<option value="${k}"${current === k ? ' selected' : ''}>${esc(COND[k].label.replace(/^HÄNDELSE: /, ''))}</option>`).join('')}</optgroup>`).join('');
    const field = (type, id, hint, opts) => {
      if (type === 'near') return `<span class="hint">${esc(hint)}</span> ${select(id, [['', 'var som helst'], ['hq', 'basen'], ...buildingTypes.filter(b => b !== 'hq').map(b => [b, 'byggnaden ' + b]), ['__map', 'en plats på kartan…']], '')} <input type="number" id="${id}r" value="5" min="1" style="width:55px" title="radie i rutor"> <span class="hint">rutor</span>`;
      if (type === 'opt') return `<span class="hint">${esc(hint || '')}</span> ${select(id, typeof opts === 'function' ? opts() : opts, '')}`;
      if (type === 'num') return `<input type="number" id="${id}" value="${/sekund/.test(hint) ? 60 : 1}" title="${esc(hint || '')}" style="width:70px"> <span class="hint">${esc(hint || '')}</span>`;
      if (type === 'res') return select(id, resourceIds, 'wood');
      if (type === 'bld') return select(id, buildingTypes, buildingTypes[0]);
      if (type === 'scn') { const others = scenes.filter(sc => sc !== sceneNow()); return others.length ? select(id, others.map(sc => [sc.id, sc.name]), others[0].id) : '<span class="hint">Det finns ingen annan scen än.</span>'; }
      return '';
    };
    const read = (spec, prefix) => { const v = Object.fromEntries(spec.f.map(([name], i) => [name, ($(`#${prefix}${i}`)?.value ?? '').trim()])); spec.f.forEach(([name, type], i) => { if (type === 'near') v.radius = ($(`#${prefix}${i}r`)?.value ?? '5').trim(); }); return v; };

    // ---------------------------------------------------------------- scener: en lista med steg i ordning
    const sceneNow = () => scenes[cur];
    const uniqueId = base => { const taken = new Set([...actorIds(), ...scenes.flatMap(sc => sc.cast.map(c => c.id))]); let id = base, n = 2; while (taken.has(id)) id = base + n++; return id; };
    const UNIT = '__unit';   // "en enhet i spelet" i stället för en person i scenen
    const flatSteps = steps => steps.flatMap(s => [s, ...flatSteps(s.otherwise || [])]);
    const PICK_OPT = [['trigger', 'den som utlöste händelsen'], ['nearest', 'den som är närmast basen'], ['random', 'en slumpad']];
    const NO_WHO = ['dialog', 'wait', 'camera'];   // dessa hör till scenen, inte till en person
    const stepLabel = (sc, s) => {
      const who = s.who === UNIT ? `${(PICK_OPT.find(o => o[0] === (s.pick || 'trigger')) || [])[1]}${s.side ? ', ' + SIDE_OPT.find(o => o[0] === s.side)[1] : ''}${s.kind ? ', ' + KIND_OPT.find(o => o[0] === s.kind)[1] : ''}` : s.who || '?';
      switch (s.type) {
        case 'walk': return `${who} går till ${targetText(s.arg)}${s.follow ? ' (kameran följer med)' : ''}`;
        case 'camera': return `Kameran flyttar till ${targetText(s.arg)}${s.zoom ? ', zoom ' + s.zoom : ''}`;
        case 'appear': return `${who} dyker upp vid ${targetText(s.arg)}`;
        case 'say': return `${who} säger i en pratbubbla${s.together ? ' (medan det ovanför pågår)' : ''}: “${s.arg.text}”`;
        case 'dialog': return `Dialog: ${s.arg.map(line => `${line.who || '?'}: “${line.text}”`).join(' / ')}`;
        case 'leave': return `${who} lämnar scenen (går mot dimman)`;
        case 'vanish': return `${who} försvinner`;
        case 'wait': return `Väntar ${s.arg} s`;
      }
      return s.type;
    };
    // Det en scen gör utöver stegen: byter musik, ger varor, ändrar vädret. Fälten ligger på scenen (musik, musikLugn, ...) och blir händelsens music, give, weather, tornado, super, meteors och whileFog.
    const listOf = text => String(text || '').split(',').map(item => item.trim()).filter(Boolean);
    const oneOrList = list => list.length === 1 ? list[0] : list;
    function fxOf(sc) {
      const out = {};
      if (sc.music === 'default') out.music = null;
      else if (sc.music === 'set') {
        const calm = listOf(sc.musicCalm), battle = listOf(sc.musicBattle), spec = {};
        if (calm.length) spec.calm = oneOrList(calm);
        if (sc.battleOff) spec.battle = false; else if (battle.length) spec.battle = oneOrList(battle);
        if (spec.calm && Object.keys(spec).length === 1) out.music = spec.calm; else if (Object.keys(spec).length) out.music = spec;
      }
      const letterLines = String(sc.letterText || '').split('\n').map(line => line.trim()).filter(Boolean);
      if (letterLines.length) {
        out.letter = { lines: letterLines };
        if (sc.letterGreeting) out.letter.greeting = sc.letterGreeting;
        if (sc.letterThrone) out.letter.throne = true; else if (sc.letterFrom) out.letter.signature = sc.letterFrom;
      }
      if (sc.give?.length) { out.give = {}; for (const { res, n } of sc.give) out.give[res] = (out.give[res] || 0) + (+n || 0); }
      if (sc.weather) out.weather = sc.weather;
      for (const key of ['tornado', 'super', 'meteors']) if (+sc[key] > 0) out[key] = +sc[key];
      if (sc.where !== undefined && ['tornado', 'super', 'meteors'].some(key => +sc[key] > 0)) out.where = sc.where === TRIGGER ? { trigger: true } : sc.where;
      if (sc.whileFog) out.whileFog = true;
      return out;
    }
    const musicTracks = () => [...new Set([...[].concat(Config.settings.audio?.music || [], Config.settings.audio?.battleMusic || [], Config.settings.audio?.disasterMusic || [], Config.settings.audio?.tornadoMusic || []), ...[...JSON.stringify(Config.story || {}).matchAll(/"(music\/[^"]+)"/g)].map(m => m[1])])];
    // En scen blir en händelse med scene: [steg]. Motorn kör stegen i ordning; dialogerna hör till scenen, så de spelas även när personen försvunnit.
    function compileScene(sc, withConds = true) {
      const out = compile({ id: sc.id, conds: withConds ? sc.conds : [], effects: [], extra: withConds ? sc.extra : null });
      Object.assign(out, fxOf(sc));   // musik, varor, väder: händelsens egna fält (motorn läser dem för alla händelser)
      const cast = new Map(sc.cast.map(c => [c.id, c]));
      const specOf = (c, at) => { const spec = { id: c.id, image: c.image }; if (c.race) spec.race = c.race; if (c.count > 1) spec.count = c.count; spec.at = at; return spec; };
      out.spawn = sc.cast.filter(c => c.at).map(c => ({ ...specOf(c, c.at), script: [] }));
      const selectorOf = s => { const sel = { pick: s.pick || 'trigger' }; if (s.side) sel.side = s.side; if (s.kind) sel.kind = s.kind; return sel; };
      const compileStep = s => {
        let step;
        const who = s.who === UNIT ? selectorOf(s) : s.who;
        switch (s.type) {
          case 'appear': step = { spawn: specOf(cast.get(s.who) || { id: s.who, image: '' }, s.arg === TRIGGER ? { trigger: true } : s.arg) }; break;
          case 'walk': step = { who, walk: s.arg === TRIGGER ? { trigger: true } : s.arg }; if (s.follow) step.follow = true; break;
          case 'camera': step = { camera: s.arg === TRIGGER ? { trigger: true } : s.arg }; if (s.zoom) step.zoom = s.zoom; break;
          case 'say': step = { who, say: { text: s.arg.text, wait: true } }; break;
          case 'dialog': step = { tell: s.arg.map(line => ({ who: line.who, text: line.text })) }; break;
          case 'leave': step = { who, leave: true }; break;
          case 'vanish': step = { who, vanish: true }; break;
          case 'wait': step = { wait: +s.arg || 1 }; break;
        }
        if (s.together) step.together = true;
        if (s.otherwise?.length) step.otherwise = s.otherwise.map(compileStep);
        return step;
      };
      if (sc.steps.length) out.scene = sc.steps.map(compileStep);
      if (sc.repeat && out.on) { out.repeat = true; out.cooldown = Math.max(1, +sc.cooldown || 30); }
      if (sc.extra && withConds) Object.assign(out, sc.extra);   // det editorn inte förstår, orört
      return out;
    }
    function sceneProblems(sc) {
      const out = [], tag = `Scenen "${sc.name}"`, ids = new Set(sc.cast.map(c => c.id));
      if (!sc.cast.length && flatSteps(sc.steps).some(s => !NO_WHO.includes(s.type) && s.who !== UNIT)) out.push({ text: `${tag} har ingen med.` });
      if (sc.where === TRIGGER && !hasTrigger(sc)) out.push({ text: `${tag}: vädret ska slå till där det som utlöste händelsen hände, men scenen startar inte av en händelse eller något spelaren ser.` });
      if (!sc.steps.length && !Object.keys(fxOf(sc)).length) out.push({ text: `${tag} gör ingenting: lägg till steg, musik, varor eller väder.` });
      if (sc.music === 'set' && !listOf(sc.musicCalm).length && !listOf(sc.musicBattle).length && !sc.battleOff) out.push({ text: `${tag}: skriv en musikfil, eller välj något annat än "Byt musik".` });
      if (!hasTrigger(sc) && flatSteps(sc.steps).some(s => s.arg === TRIGGER || (s.who === UNIT && (s.pick || 'trigger') === 'trigger'))) out.push({ text: `${tag} använder "det som utlöste händelsen", men startar inte av en händelse eller något spelaren ser. Lägg till ett villkor under "Händelser i spelet" eller "Syn".` });
      for (const cond of sc.conds) if (cond.kind === 'sceneDone' && !scenes.some(other => other !== sc && other.id === cond.v.sc)) out.push({ text: `${tag} väntar på en scen som inte finns längre.` });
      const here = new Set(sc.cast.filter(c => c.at).map(c => c.id));
      let busy = new Set();   // personer som redan gör något i en grupp av steg som börjar samtidigt
      sc.steps.forEach((s, i) => {
        if (!s.together || !i) busy = new Set();
        if (s.who && s.who !== UNIT && s.type !== 'appear' && !NO_WHO.includes(s.type)) { if (busy.has(s.who)) out.push({ text: `${tag}: steg ${i + 1} börjar samtidigt som ett annat steg för ${s.who}. En person kan bara göra en sak i taget.` }); busy.add(s.who); }
        if (s.type === 'appear') here.add(s.who);
        else if (!NO_WHO.includes(s.type) && s.who !== UNIT && !here.has(s.who) && ids.has(s.who)) out.push({ text: `${tag}: steg ${i + 1} ("${stepLabel(sc, s)}") sker innan ${s.who} finns. Låt hen dyka upp först, eller placera hen på kartan från början.` });
        if (!NO_WHO.includes(s.type) && s.who !== UNIT && !ids.has(s.who)) out.push({ text: `${tag}: steg ${i + 1} – personen är inte med i scenen.` });
        for (const alt of s.otherwise || []) if (!NO_WHO.includes(alt.type) && alt.who !== UNIT && !ids.has(alt.who)) out.push({ text: `${tag}: failsafen för steg ${i + 1} – personen är inte med i scenen.` });
        if (s.type === 'dialog') for (const line of s.arg) if (!line.who || (speakerIds.length && !speakerIds.includes(line.who))) out.push({ text: `${tag}: okänd talare '${line.who}' i dialogen (skriv t.ex. ${speakerIds.slice(0, 3).join(', ')}: text).` });
      });
      return out;
    }
    let castDraft = { id: '', image: defaultImage, race: '', count: 1 }, stepDraft = { who: '', type: 'walk', target: 'hq', text: '', secs: 2, wait: 3, lines: [], lineWho: speakerIds[0] || 'narrator', lineMood: 'calm', lineText: '', lineEdit: null, editing: null, keepArg: null, zoom: '', together: false, parent: null, pick: 'trigger', side: '', kind: '', follow: false };
    const resetStep = () => { if (stepDraft.who === UNIT) stepDraft.who = ''; stepDraft = { ...stepDraft, target: 'hq', text: '', secs: 2, wait: 3, lines: [], lineMood: 'calm', lineText: '', lineEdit: null, editing: null, keepArg: null, zoom: '', together: false, pick: 'trigger', side: '', kind: '', follow: false }; };
    const moodIds = () => Object.keys(Config.story.voice?.moods || { calm: 1 });
    const moodOfLine = text => { const m = /^\[(\w+)\]([\s\S]*)$/.exec(text); return m ? { mood: m[1], text: m[2] } : { mood: 'calm', text }; };
    const lineText = ln => ln.mood && ln.mood !== 'calm' ? `[${ln.mood}]${ln.text}` : ln.text;
    const blankCast = () => ({ id: '', image: castDraft.image, race: castDraft.race, count: 1 });
    const countOf = () => Math.max(1, Math.min(100, Math.floor(+castDraft.count) || 1));
    let sceneCond = 'time'; const fxDraft = { res: resourceIds[0] || 'wood', n: 10, kind: '' };

    // "Vad händer?": allt som sker direkt när scenen startar (brev, musik, väder, varor ...) väljs från samma lista; personernas steg kommer därefter.
    const FX = [['letter', '✉ Brev'], ['music', '♪ Musik'], ['weather', '☁ Väder'], ['tornado', '🌪 Tornado'], ['super', '⚡ Superstorm'], ['meteors', '☄ Meteorer'], ['give', '📦 Ge varor']];
    const fxHas = (sc, kind) => (sc.fxOpen || []).includes(kind) || (kind === 'letter' ? !!String(sc.letterText || '').trim() : kind === 'give' ? !!sc.give?.length : kind === 'music' ? !!sc.music : kind === 'weather' ? !!sc.weather : +sc[kind] > 0);
    function fxHtml(sc) {
      const active = FX.filter(([kind]) => fxHas(sc, kind)), free = FX.filter(([kind]) => !fxHas(sc, kind));
      const card = (kind, title, body) => `<div class="card"><div class="row"><b>${title}</b><span style="flex:1"></span><button class="small danger" data-act="fxDel" data-k="${kind}" title="Ta bort">✕</button></div>${body}</div>`;
      const cards = {
        letter: () => card('letter', '✉ Brev', `<div class="hint" style="margin:0">Visas när scenen startar, före dialogen.</div>
          <div class="row">Hälsning <input data-bind="scene.letterGreeting" value="${esc(sc.letterGreeting || '')}" placeholder="valfritt, t.ex. Reeve," style="flex:1"></div>
          <div class="row"><textarea data-bind="scene.letterText" style="height:80px;font:12px sans-serif;flex:1" placeholder="Brevets text. En rad = ett stycke. Tomt = inget brev.">${esc(sc.letterText || '')}</textarea></div>
          <div class="row">Underskrift <input data-bind="scene.letterFrom" value="${esc(sc.letterFrom || '')}" placeholder="t.ex. In service of the throne" style="flex:1"${sc.letterThrone ? ' disabled' : ''}> <label><input type="checkbox" data-bind="scene.letterThrone"${sc.letterThrone ? ' checked' : ''}> från tronen</label></div>`),
        music: () => card('music', '♪ Musik', `<div class="row">${select('', [['', 'ingen ändring'], ['set', 'byt musik'], ['default', 'tillbaka till standardmusiken']], sc.music || '', 'scene.music')}</div>
          ${sc.music === 'set' ? `<div class="row">Lugn <input data-bind="scene.musicCalm" list="seTracks" value="${esc(sc.musicCalm || '')}" placeholder="music/fil.mp3 (flera: komma)" style="flex:1"></div>
          <div class="row">Strid <input data-bind="scene.musicBattle" list="seTracks" value="${esc(sc.musicBattle || '')}" placeholder="music/fil.mp3"${sc.battleOff ? ' disabled' : ''} style="flex:1"> <label><input type="checkbox" data-bind="scene.battleOff"${sc.battleOff ? ' checked' : ''}> ingen stridsmusik</label></div>
          <datalist id="seTracks">${musicTracks().map(track => `<option value="${esc(track)}">`).join('')}</datalist>
          <p class="hint" style="margin:0">Ett tomt läge behåller den vanliga musiken. Musiken gäller tills en senare scen byter den.</p>` : ''}`),
        weather: () => card('weather', '☁ Väder', `<div class="row">${select('', [['', 'ingen ändring'], ...Object.keys(Config.settings.weather?.chances || {}).map(x => [x, x])], sc.weather || '', 'scene.weather')}</div>`),
        tornado: () => card('tornado', '🌪 Tornado', `<div class="row">Radie <input type="number" min="0" data-bind="scene.tornado" value="${esc(sc.tornado || '')}" style="width:60px"> <span class="hint">tomt = ingen</span></div>`),
        super: () => card('super', '⚡ Superstorm', `<div class="row">Radie <input type="number" min="0" data-bind="scene.super" value="${esc(sc.super || '')}" style="width:60px"> <span class="hint">tomt = ingen</span></div>`),
        meteors: () => card('meteors', '☄ Meteorer', `<div class="row">Under <input type="number" min="0" data-bind="scene.meteors" value="${esc(sc.meteors || '')}" style="width:60px"> sekunder <span class="hint">tomt = ingen</span></div>`),
        give: () => card('give', '📦 Ge varor', `<div class="hint" style="margin:0">Läggs i huvudlagret.</div>
          ${(sc.give || []).map((g, i) => `<div class="step"><span>${esc(g.n)} ${esc(g.res)}</span><button class="small danger" data-act="giveDel" data-i="${i}">✕</button></div>`).join('')}
          <div class="row">${select('', resourceIds, fxDraft.res, 'fxDraft.res')} <input type="number" min="1" data-bind="fxDraft.n" value="${esc(fxDraft.n)}" style="width:70px"> <button data-act="giveAdd">Lägg till</button></div>`)
      };
      const wherePicker = ['tornado', 'super', 'meteors'].some(key => +sc[key] > 0) ? `<div class="card"><div class="row">Plats för tornado, storm och meteorer ${select('', [['', 'som vanligt (nära basen)'], ...(sc.where !== undefined && !['hq', TRIGGER].includes(sc.where) && !buildingTypes.includes(sc.where) ? [['__keep', targetText(sc.where)]] : []), ['hq', 'basen'], ...(hasTrigger(sc) ? [[TRIGGER, '★ det som utlöste händelsen']] : []), ...buildingTypes.map(b => [b, 'byggnaden ' + b]), ['__map', 'en plats på kartan…']], sc.where === undefined ? '' : Array.isArray(sc.where) ? '__keep' : sc.where, 'fxDraft.where')}</div></div>` : '';
      return `<h5>Direkt när scenen startar</h5>
        ${active.length ? active.map(([kind]) => cards[kind]()).join('') + wherePicker : '<p class="hint">Inget än. Lägg till ett brev, byt musik, ändra vädret eller ge spelaren varor:</p>'}
        ${free.length ? `<div class="row">${select('', [['', '+ Lägg till…'], ...free], '', 'fxDraft.kind')}</div>` : ''}`;
    }
    function viewScene() {
      const sc = sceneNow();
      if (!sc) return `<p>En <b>scen</b> är något som händer i berättelsen: du väljer vilka som är med och skriver sedan vad som händer, steg för steg, i ordning.</p><div class="row"><button class="primary" data-act="newScene">Skapa en scen</button></div>`;
      const cond = COND[sceneCond];
      const castIds = sc.cast.map(c => c.id), chars = Object.entries(characters);
      const targets = [['hq', 'basen'], ...(hasTrigger(sc) ? [[TRIGGER, '★ det som utlöste händelsen']] : []), ...buildingTypes.filter(b => b !== 'hq').map(b => [b, 'byggnaden ' + b]), ...castIds.map(id => [id, 'personen ' + id]), ['__map', 'en plats på kartan…']];
      if (stepDraft.parent !== null && !sc.steps[stepDraft.parent]) stepDraft.parent = null;
      const inFs = stepDraft.parent !== null, list = inFs ? sc.steps[stepDraft.parent].otherwise || [] : sc.steps;
      if (stepDraft.who === UNIT && stepDraft.type !== 'say') stepDraft.type = 'say';
      const t = stepDraft.type, whoOpts = [...(castIds.length ? castIds : ['(ingen med än)']), ...(t === 'say' ? [[UNIT, '★ en enhet i spelet…']] : [])];
      if (!castIds.includes(stepDraft.who) && !(stepDraft.who === UNIT && t === 'say')) stepDraft.who = castIds[0] || '';
      const unitWho = stepDraft.who === UNIT;
      const stepRow = (s, i, p) => `<div class="step"${p !== undefined ? ' style="margin-left:18px;border-left:2px solid #c80"' : ''}><b>${p !== undefined ? '↳' : i + 1 + '.'}</b><span${stepDraft.editing === i && (stepDraft.parent === null ? p === undefined : stepDraft.parent === p) ? ' class="ok"' : ''}>${s.together ? '<i class="hint">samtidigt: </i>' : ''}${esc(stepLabel(sc, s))}</span><button class="small" data-act="sEdit" data-i="${i}"${p !== undefined ? ` data-p="${p}"` : ''} title="Redigera steget">✎</button><button class="small" data-act="sUp" data-i="${i}"${p !== undefined ? ` data-p="${p}"` : ''}>↑</button><button class="small" data-act="sDown" data-i="${i}"${p !== undefined ? ` data-p="${p}"` : ''}>↓</button><button class="small danger" data-act="sDel" data-i="${i}"${p !== undefined ? ` data-p="${p}"` : ''}>✕</button></div>`;
      const needTarget = t === 'walk' || t === 'appear' || t === 'camera', needWho = !NO_WHO.includes(t);
      return `<div class="row">${select('', scenes.map((s, i) => [i, s.name]), cur, 'sceneIndex')}<button class="small" data-act="newScene">+ Ny</button><button class="small danger" data-act="deleteScene" title="Radera scenen">✕</button></div>
        <div class="row">Namn <input data-bind="scene.name" value="${esc(sc.name)}" style="flex:1"></div>
        <h4>1. När startar scenen?</h4>
        ${sc.conds.length ? sc.conds.map((c, i) => `<div class="step"><span>${esc(COND[c.kind].text(c.v))}</span><button class="small danger" data-act="sceneCondDel" data-i="${i}">✕</button></div>`).join('') : '<p class="hint">Direkt när kapitlet startar. Lägg till ett villkor om den ska vänta på något.</p>'}
        <div class="card"><div class="hint" style="margin:0">${sc.conds.length ? 'Fler villkor:' : 'Låt den vänta på något:'}</div><div class="row"><select data-bind="sceneCond" style="width:100%">${condOptions(sceneCond)}</select></div>
          <div class="row">${cond.f.map(([, type, hint, opts], i) => field(type, 'sc' + i, hint, opts)).join(' ')}</div><div class="row"><button data-act="sceneCondAdd">Lägg till</button></div></div>
        ${sc.conds.some(c => c.kind.startsWith('on')) ? `<div class="row"><label><input type="checkbox" data-bind="scene.repeat"${sc.repeat ? ' checked' : ''}> Kan hända flera gånger</label>${sc.repeat ? ` vänta <input type="number" min="1" data-bind="scene.cooldown" value="${esc(sc.cooldown ?? 30)}" style="width:60px"> s mellan gångerna` : ' <span class="hint">(annars bara första gången)</span>'}</div>` : ''}
        <div class="row"><label><input type="checkbox" data-bind="scene.whileFog"${sc.whileFog ? ' checked' : ''}> Hoppa över scenen om dimman redan har lyft (Eye of Shades borta)</label></div>
        <h4>2. Vad händer?</h4>
        ${fxHtml(sc)}
        <h5>Personer i scenen</h5>
        ${sc.cast.length ? sc.cast.map((c, i) => `<div class="card"><div class="row"><img class="pv" src="${esc(imageSrc(c.image, c.race))}" onerror="this.style.display='none'"><b>${esc(c.id)}${c.count > 1 ? ' ×' + c.count : ''}</b><span class="hint">${c.at ? 'finns från början, vid ruta ' + c.at.join(', ') : 'dyker upp senare (i ett steg)'}</span></div><div class="row"><button class="small" data-act="castMove" data-i="${i}">${c.at ? 'Flytta på kartan' : 'Placera från början'}</button><button class="small danger" data-act="castDel" data-i="${i}">Ta bort</button></div></div>`).join('') : '<p class="hint">Ingen än.</p>'}
        <div class="card"><div class="row">Antal <input type="number" min="1" max="100" data-bind="castDraft.count" value="${esc(castDraft.count)}" style="width:70px"> <span class="hint">fler än 1 = en grupp som går i led</span></div><div class="row">Ny person <select data-bind="castDraft.image">${chars.length ? `<optgroup label="Karaktärer">${chars.map(([path, race]) => `<option value="${esc(path)}"${castDraft.image === path ? ' selected' : ''}>${esc(nameOf(path))}</option>`).join('')}</optgroup>` : ''}<optgroup label="Enheter">${images.map(item => `<option value="${esc(item.path)}"${castDraft.image === item.path ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}</optgroup></select></div>
          <div class="row"><button class="primary" data-act="castAdd">Finns från början (klicka på kartan)</button></div><div class="row"><button data-act="castLater">Dyker upp senare</button></div></div>
        <h5>Händelseförlopp: steg för steg (uppifrån och ned)</h5>
        ${sc.steps.length ? sc.steps.map((s, i) => stepRow(s, i) + (s.otherwise || []).map((alt, j) => stepRow(alt, j, i)).join('') + `<div style="margin-left:18px"><button class="small" data-act="fsOpen" data-i="${i}" title="Vad ska hända i stället för resten av scenen om det här steget inte går att göra (t.ex. byggnaden finns inte eller ingen enhet hittas)?">+ Om det inte går…</button></div>`).join('') : '<p class="hint">Inga steg än. Allt som står här händer efter varandra. En dialog tillhör scenen och spelas även om personerna försvunnit.</p>'}
        <div class="card">${inFs ? `<div class="banner"><span>Failsafe för steg ${stepDraft.parent + 1}: om steget inte går att göra (t.ex. byggnaden finns inte) händer det här i stället för resten av scenen.</span><button data-act="fsDone">Klar</button></div>` : ''}<div class="row">${needWho ? select('', whoOpts, stepDraft.who, 'stepDraft.who') : ''} ${select('', unitWho ? [['say', 'säger (pratbubbla)']] : [['walk', 'går till…'], ['appear', 'dyker upp vid…'], ['say', 'säger (pratbubbla)'], ['leave', 'lämnar scenen (går mot dimman)'], ['vanish', 'försvinner direkt'], ['camera', 'KAMERAN flyttar till…'], ['dialog', 'DIALOG (dialogruta, flera personer)'], ['wait', 'VÄNTA (sekunder)']], t, 'stepDraft.type')}</div>
          ${unitWho ? `<div class="row">${select('', PICK_OPT, stepDraft.pick, 'stepDraft.pick')}</div><div class="row">${select('', SIDE_OPT.map(([v, l]) => [v, v ? l : stepDraft.pick === 'trigger' ? 'samma sida som utlösaren' : 'vilken sida som helst']), stepDraft.side, 'stepDraft.side')} ${select('', KIND_OPT.map(([v, l]) => [v, v ? l : stepDraft.pick === 'trigger' ? 'samma sort som utlösaren' : 'vilken sort som helst']), stepDraft.kind, 'stepDraft.kind')}</div><div class="hint" style="margin:0">Bara enheter som spelaren ser. Hittas ingen går steget inte att göra – lägg då till en failsafe under steget.</div>` : ''}
          ${needTarget ? `<div class="row">${select('', stepDraft.keepArg ? [['__keep', 'oförändrat: ' + targetText(stepDraft.keepArg)], ...targets] : targets, stepDraft.target, 'stepDraft.target')}</div>` : ''}
          ${t === 'walk' && !unitWho ? `<div class="row"><label><input type="checkbox" data-bind="stepDraft.follow"${stepDraft.follow ? ' checked' : ''}> Kameran följer med medan hen går</label></div>` : ''}
          ${t === 'camera' ? `<div class="row">Zoom ${select('', [['', 'oförändrad'], [1, '1 (längst ut)'], [2, '2'], [3, '3'], [4, '4'], [5, '5 (längst in)']], stepDraft.zoom, 'stepDraft.zoom')}</div>` : ''}
          ${t === 'say' ? `<div class="row"><input data-bind="stepDraft.text" value="${esc(stepDraft.text)}" placeholder="vad sägs?" style="width:100%"></div><div class="hint" style="margin:0">Personen väntar tills bubblan är klar. Rösten följer med om hen har en.</div>` : ''}
          ${t === 'dialog' ? `<div class="hint" style="margin:0">Replikerna, i ordning:</div>
            ${stepDraft.lines.length ? stepDraft.lines.map((ln, i) => `<div class="step"><span${stepDraft.lineEdit === i ? ' class="ok"' : ''}><b>${esc(ln.who)}</b>${ln.mood !== 'calm' ? ` <i>[${esc(ln.mood)}]</i>` : ''}: ${esc(ln.text)}</span><button class="small" data-act="lEdit" data-i="${i}" title="Redigera">✎</button><button class="small" data-act="lUp" data-i="${i}">↑</button><button class="small" data-act="lDown" data-i="${i}">↓</button><button class="small danger" data-act="lDel" data-i="${i}">✕</button></div>`).join('') : '<p class="hint" style="margin:0">Inga repliker än.</p>'}
            <div class="card"><div class="row">${select('', speakerIds.length ? speakerIds : ['narrator'], stepDraft.lineWho, 'stepDraft.lineWho')} ${select('', moodIds().includes(stepDraft.lineMood) ? moodIds() : [...moodIds(), stepDraft.lineMood], stepDraft.lineMood, 'stepDraft.lineMood')}</div>
              <div class="row"><textarea data-bind="stepDraft.lineText" style="height:54px;font:12px sans-serif" placeholder="vad sägs?">${esc(stepDraft.lineText)}</textarea></div>
              <div class="row"><button data-act="lineAdd">${stepDraft.lineEdit !== null ? 'Spara repliken' : 'Lägg till replik'}</button>${stepDraft.lineEdit !== null ? '<button data-act="lineCancel">Avbryt</button>' : ''}</div></div>` : ''}
          ${t === 'wait' ? `<div class="row"><input type="number" data-bind="stepDraft.wait" value="${stepDraft.wait}" style="width:70px"> sekunder</div>` : ''}
          ${!inFs && (stepDraft.editing === null ? sc.steps.length : stepDraft.editing) > 0 ? `<div class="row"><label><input type="checkbox" data-bind="stepDraft.together"${stepDraft.together ? ' checked' : ''}> Börja samtidigt som steget ovanför (väntar inte på det)</label></div>${t === 'say' && stepDraft.together ? '<div class="hint" style="margin:0">Pratbubblan visas medan personen gör steget ovanför, t.ex. går.</div>' : ''}` : ''}
          <div class="row"><button class="primary" data-act="stepAdd">${stepDraft.editing !== null ? 'Spara ändringarna i steg ' + (stepDraft.editing + 1) : 'Lägg till steget'}</button>${stepDraft.editing !== null ? '<button data-act="sCancel">Avbryt</button>' : ''}</div></div>
        <div class="row"><button class="primary" data-act="scenePlay">▶ Spela upp scenen</button><button data-act="stopPreview">Rensa</button></div>
        <p class="hint">Uppspelningen visar scenen direkt, oavsett villkor. Ladda om kapitlet för att nollställa spelet efteråt. Under fliken Exportera ligger färdig kod.</p>`;
    }

    // ---------------------------------------------------------------- export och kontroll
    function compile(event) {
      const out = {}; if (event.id) out.id = event.id;
      const top = {}, when = [];
      for (const cond of event.conds) { const made = COND[cond.kind].make(cond.v); if (made.top) Object.assign(top, made.top); else when.push(made.when); }
      if (top.at === undefined && top.goal === undefined && !top.end && !top.on && !when.length && !['at', 'goal', 'end', 'on', 'when'].some(key => event.extra && key in event.extra)) top.at = 0;
      Object.assign(out, top);
      if (when.length) out.when = when.length === 1 ? when[0] : when;
      return out;
    }
    function problems() { return scenes.flatMap(sceneProblems); }
    function sceneryRows() {   // kulisser slås ihop till rektanglar per typ och lager
      const groups = new Map();
      for (const item of World.sceneryList) { const id = item.type + '|' + item.layer; if (!groups.has(id)) groups.set(id, new Set()); groups.get(id).add(`${item.x},${item.y}`); }
      const rows = [];
      for (const [id, cells] of groups) {
        const [type, layer] = id.split('|'), tiles = [...cells].map(text => text.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]), runs = [];
        for (const [x, y] of tiles) { const last = runs[runs.length - 1]; if (last && last.y === y && last.x + last.w === x) last.w++; else runs.push({ x, y, w: 1, h: 1 }); }
        const merged = [];
        for (const run of runs) { const above = merged.find(other => other.x === run.x && other.w === run.w && other.y + other.h === run.y); if (above) above.h++; else merged.push(run); }
        for (const { x, y, w, h } of merged) rows.push({ type, layer: +layer, text: +layer ? `["${type}", ${x}, ${y}, ${w}, ${h}, ${layer}]` : (w > 1 || h > 1 ? `["${type}", ${x}, ${y}, ${w}, ${h}]` : `["${type}", ${x}, ${y}]`) });
      }
      return rows.sort((a, b) => a.layer - b.layer || a.type.localeCompare(b.type)).map(row => row.text);
    }
    const editable = building => building && !building.removed && building.type !== 'hq' && !building.definition.pile;
    function exportParts() {
      const base = hq(), list = World.buildings.filter(building => editable(building) && building.buildProgress >= 1 && (building.player === Players.HUMAN || building.dead)).sort((a, b) => a.y - b.y || a.x - b.x);
      const eye = list.find(building => building.type === 'eye_of_shades' && !building.dead);
      const row = building => `{ type: '${building.type}', dx: ${building.x - base.x}, dy: ${building.y - base.y}${building.dead ? ', dead: true' : ''}${building.dead && building.sight ? ', sight: ' + building.sight : ''}${building.dead && building.arrow ? ', arrow: ' + (building.arrow === true ? 'true' : `'${building.arrow}'`) : ''} }`;
      const parts = [];
      parts.push({ title: 'Kulisser (ersätter kapitlets scenery)', text: `scenery: [\n${sceneryRows().map(line => '\t' + line + ',').join('\n')}\n],` });
      parts.push({ title: 'Startbyggnader och döda byggnader (ersätter kapitlets start)', text: `start: { buildings: [\n${list.filter(building => building !== eye).map(building => '\t' + row(building) + ',').join('\n')}\n] },` + (eye ? `\neye: { dx: ${eye.x - base.x}, dy: ${eye.y - base.y} },` : '') });
      if (chapter()?.letter) parts.push({ title: 'Kapitlets egen letter-rad (ta bort den om brevet ligger som scen, annars visas det först av allt)', text: '// letter: ... (raden direkt i kapitlet)' });
      if (scenes.length) parts.push({ title: 'Scener (lägg till i kapitlets events)', text: `events: [\n${scenes.map(sc => compileScene(sc)).map(event => '\t' + ser(event) + ',').join('\n')}\n],` });
      return parts;
    }
    function viewExport() {
      const issues = problems(), parts = exportParts(), text = parts.map(part => `// ${part.title}\n${part.text}`).join('\n\n');
      return `<h4>Kontroll</h4>
        ${issues.length ? issues.map(issue => `<div class="row warn">⚠ ${esc(issue.text)} </div>`).join('') : '<div class="ok">✓ Inget att anmärka på.</div>'}
        <h4>Rader att klistra in i kapitlet</h4>
        <div class="row"><button class="primary" data-act="copyExport">Kopiera allt</button><span class="hint" id="copyNote"></span></div>
        <textarea readonly id="exportText">${esc(text)}</textarea>
        <p class="hint">Scenerna lägger du i kapitlets <code>events</code>, och dina ändringar av kartan ersätter <code>scenery</code> och <code>start</code>.</p>`;
    }

    // ---------------------------------------------------------------- rita om panelen
    function render() {
      try { renderPanel(); } catch (error) {
        console.error('Story-editor: kunde inte rita panelen', error);
        panel.innerHTML = `<div class="se-head"><b>Story-editor</b></div><div class="se-body"><p class="warn">Panelen kunde inte ritas: ${esc(String(error && error.message || error))}</p><button class="danger" data-act="resetSaved">Rensa sparade scener i det här kapitlet</button></div>`;
      }
    }
    function renderPanel() {
      const armText = st.arm ? (st.arm.kind === 'sceneStep' ? 'Klicka på kartan: vart? (klicka på en byggnad för att gå till den)' : st.arm.kind === 'condNear' ? 'Klicka på kartan: var ska det hända nära?' : st.arm.kind === 'fxWhere' ? 'Klicka på kartan: var ska det slå till?' : 'Klicka på kartan där personen ska stå när scenen börjar.') : '';
      const scrollTop = panel.scrollTop;
      panel.innerHTML = `<div class="se-head"><b>Story-editor</b><span class="hint" style="margin:0">${chapter() ? `kapitel ${chapter().number}: ${esc(chapter().name || '')}` : '(ingen story pågår)'}</span>
          <label title="Fryser kapitlet medan du arbetar"><input type="checkbox" id="sePause"${C.Game.paused ? ' checked' : ''}> paus</label></div>
        <div class="se-tabs">${tabsNow().map(([id, label]) => `<button data-act="tab" data-tab="${id}" class="${st.tab === id ? 'on' : ''}">${label}</button>`).join('')}</div>
        ${armText ? `<div class="banner"><span>${armText}</span><button data-act="cancelArm">Avbryt</button></div>` : ''}
        <div class="se-body">${{ scene: viewScene, map: viewMap, export: viewExport }[st.tab]()}
          ${st.note ? `<p class="ok">${esc(st.note)}</p>` : ''}<div class="hint" id="seHover"></div></div>`;
      panel.scrollTop = scrollTop; persist();
    }
    const note = text => { st.note = text; render(); };
    // Ett felmeddelande utan omritning: det du fyllt i bevaras, och meddelandet står vid knapparna längst ned
    const notice = text => { st.note = ''; let el = $('#seNotice'); if (!el) { el = document.createElement('p'); el.id = 'seNotice'; el.className = 'warn'; $('.se-body').appendChild(el); } el.textContent = '⚠ ' + text; el.scrollIntoView?.({ block: 'nearest' }); };

    // ---------------------------------------------------------------- inmatning i panelen
    const setPath = (path, value) => {
      const [root, key] = path.split('.');
      if (root === 'sceneCond') sceneCond = value; else if (root === 'sceneIndex') cur = +value; else if (key === undefined) st[root] = value; else ({ castDraft, stepDraft, fxDraft, scene: sceneNow() || {} })[root][key] = value;
    };
    panel.addEventListener('input', event => { const bind = event.target.dataset?.bind; if (bind && event.target.type !== 'radio' && event.target.tagName !== 'SELECT') setPath(bind, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
      if (bind === 'scene.name') { const option = $('select[data-bind=sceneIndex]')?.selectedOptions[0]; if (option) option.textContent = event.target.value || '(namnlös)'; persist(); }   // namnet syns direkt i scenlistan medan du skriver
    });
    panel.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.dataset?.bind === 'scene.name') { event.preventDefault(); event.target.blur(); } });
    panel.addEventListener('change', event => {
      const target = event.target;
      if (target.id === 'sePause') { C.Game.paused = target.checked; return; }
      const bind = target.dataset?.bind; if (!bind) return;
      setPath(bind, target.type === 'checkbox' ? target.checked : target.value);
      if (bind === 'stepDraft.target' && target.value === '__map') { actions.stepAdd(); return; }   // "en plats på kartan": väntar direkt på ett klick (utan att man behöver trycka Lägg till)
      if (bind === 'fxDraft.kind') { const sc = sceneNow(); if (sc && target.value) { sc.fxOpen = [...(sc.fxOpen || []).filter(x => x !== target.value), target.value]; if (target.value === 'music') sc.music = 'set'; } fxDraft.kind = ''; render(); return; }
      if (bind === 'fxDraft.where') { const sc = sceneNow(); if (sc) { if (target.value === '') delete sc.where; else if (target.value === '__map') st.arm = { kind: 'fxWhere' }; else if (target.value !== '__keep') sc.where = target.value; } render(); return; }
      if (bind === 'castDraft.image') { castDraft.race = characters[target.value] === 'demon' ? 'demon' : ''; castDraft.id = uniqueId(nameOf(target.value).replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'person'); }
      if (target.tagName === 'SELECT' || target.type === 'radio' || bind === 'scene.name' || bind === 'stepDraft.together' || bind === 'scene.repeat' || bind === 'scene.battleOff' || bind === 'scene.letterThrone' || ['scene.tornado', 'scene.super', 'scene.meteors'].includes(bind) || bind === 'beacon') render();
    });
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-act]'); if (!button) return;
      st.note = ''; const fn = actions[button.dataset.act]; if (fn) fn(button.dataset, event);
    });

    // ---------------------------------------------------------------- skådespelarens bygge
    const tileTarget = tile => { const building = World.buildingAt(tile.x, tile.y); if (building && !building.removed) return building.type === 'hq' ? 'hq' : building.type; return [tile.x - hq().x, tile.y - hq().y]; };
    const move = (list, i, d) => { const j = i + d; if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; };
    function stopPreview() {   // tar bort uppspelade skådespelare, deras blodpölar och att dialogerna lästs, så att inget följer med en sparning
      const progress = C.Levels.progressRef(), saved = progress.actors;
      for (const id of previews.splice(0)) {
        const data = A.data(id); if (data) A.remove(data);
        saved.list = saved.list.filter(item => item.id !== id);
        for (const key of Object.keys(progress.told || {})) if (key.startsWith(`read:${id}:`)) delete progress.told[key];
      }
      for (const key of Object.keys(progress.told || {})) if (key.startsWith('scene:')) delete progress.told[key];
      for (const id of previewScenes.splice(0)) { saved.scenes = (saved.scenes || []).filter(scene => scene.id !== id); for (const spec of previewAppear.splice(0)) { const data = A.data(spec); if (data) A.remove(data); saved.list = saved.list.filter(item => item.id !== spec); } }
      for (const item of saved.leftovers.splice(previewBase)) {
        const key = keyOf(item.x, item.y), rest = (World.scenery.get(key) || []).filter(other => !(other.type === item.type && other.layer === item.layer));
        if (rest.length) World.scenery.set(key, rest); else World.scenery.delete(key);
        World.sceneryList = World.sceneryList.filter(other => !(other.x === item.x && other.y === item.y && other.type === item.type && other.layer === item.layer));
      }
    }
    const listAt = p => p === undefined ? sceneNow().steps : sceneNow().steps[+p].otherwise;
    // Ett villkor av samma slag ersätter det förra (en scen har bara en starttid, ett mål, en händelse...), så det inte tyst vinner det sista
    const topKey = cond => Object.keys(COND[cond.kind].make(cond.v).top || {})[0];
    const addCond = (sc, cond) => { const key = topKey(cond); sc.conds = sc.conds.filter(c => !(key && (topKey(c) === key || (key === 'on' && topKey(c) === 'on')))); sc.conds.push(cond); };
    const actions = {
      newScene: () => { const n = scenes.length + 1; let id = 'scene' + n; while (scenes.some(sc => sc.id === id)) id += 'b'; scenes.push({ id, name: 'Scen ' + n, conds: [], cast: [], steps: [] }); cur = scenes.length - 1; render(); },
      deleteScene: () => { scenes.splice(cur, 1); cur = Math.max(0, cur - 1); render(); },
      sceneCondAdd: () => { const sc = sceneNow(), spec = COND[sceneCond], v = read(spec, 'sc'); if (spec.f.some(([name, type]) => type !== 'text' && type !== 'opt' && type !== 'near' && v[name] === '')) { notice('Fyll i alla fält.'); return; } if (v.near === '__map') { st.arm = { kind: 'condNear', cond: { kind: sceneCond, v } }; render(); return; } addCond(sc, { kind: sceneCond, v }); render(); },
      fxDel: ({ k }) => { const sc = sceneNow(); if (!sc) return; const clear = { letter: ['letterText', 'letterGreeting', 'letterFrom', 'letterThrone'], music: ['music', 'musicCalm', 'musicBattle', 'battleOff'], weather: ['weather'], tornado: ['tornado'], super: ['super'], meteors: ['meteors'], give: ['give'] }[k] || []; for (const key of clear) delete sc[key]; sc.fxOpen = (sc.fxOpen || []).filter(x => x !== k); if (!['tornado', 'super', 'meteors'].some(key => +sc[key] > 0)) delete sc.where; render(); },
      giveAdd: () => { const sc = sceneNow(); if (!sc || !(+fxDraft.n > 0)) { notice('Skriv ett antal.'); return; } (sc.give ||= []).push({ res: fxDraft.res, n: Math.floor(+fxDraft.n) }); render(); },
      giveDel: ({ i }) => { const sc = sceneNow(); sc.give.splice(+i, 1); if (!sc.give.length) delete sc.give; render(); },
      sceneCondDel: ({ i }) => { sceneNow().conds.splice(+i, 1); render(); },
      castAdd: () => { st.arm = { kind: 'cast' }; if (!castDraft.id) castDraft.id = uniqueId(nameOf(castDraft.image).replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'person'); if (characters[castDraft.image]) castDraft.race = characters[castDraft.image] === 'demon' ? 'demon' : ''; render(); },
      castLater: () => { const sc = sceneNow(); if (!castDraft.id) castDraft.id = uniqueId(nameOf(castDraft.image).replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'person'); sc.cast.push({ id: castDraft.id, image: castDraft.image, race: characters[castDraft.image] === 'demon' ? 'demon' : '', count: countOf(), at: null }); stepDraft.who = stepDraft.who || castDraft.id; castDraft = blankCast(); render(); },
      castMove: ({ i }) => { st.arm = { kind: 'castMove', i: +i }; render(); },
      castDel: ({ i }) => { const sc = sceneNow(), [gone] = sc.cast.splice(+i, 1); const keep = s => s.who !== gone.id; sc.steps = sc.steps.filter(keep); for (const s of sc.steps) if (s.otherwise) s.otherwise = s.otherwise.filter(keep); stepDraft.parent = null; render(); },
      sUp: ({ i, p }) => { move(listAt(p), +i, -1); resetStep(); render(); },
      sDown: ({ i, p }) => { move(listAt(p), +i, 1); resetStep(); render(); },
      sDel: ({ i, p }) => { listAt(p).splice(+i, 1); resetStep(); render(); },
      fsOpen: ({ i }) => { const s = sceneNow().steps[+i]; s.otherwise = s.otherwise || []; resetStep(); stepDraft.parent = +i; render(); },
      fsDone: () => { resetStep(); stepDraft.parent = null; const sc = sceneNow(); for (const s of sc.steps) if (s.otherwise && !s.otherwise.length) delete s.otherwise; render(); },
      stepAdd: () => {
        const sc = sceneNow(), d = stepDraft, who = NO_WHO.includes(d.type) ? '' : d.who; if (!who && !NO_WHO.includes(d.type)) { notice('Lägg först till någon som är med i scenen.'); return; }
        const list = d.parent === null ? sc.steps : sc.steps[d.parent].otherwise, step = { who, type: d.type };
        if (who === UNIT) Object.assign(step, { pick: d.pick, side: d.side, kind: d.kind });
        if (d.type === 'walk' || d.type === 'appear' || d.type === 'camera') {
          if (d.type === 'camera' && d.zoom) step.zoom = +d.zoom;
          if (d.target === '__map') { st.arm = { kind: 'sceneStep', who, type: d.type, edit: d.editing, zoom: step.zoom, together: d.together, follow: d.follow, parent: d.parent }; render(); return; }
          step.arg = d.target === '__keep' ? d.keepArg : d.target;
        }
        else if (d.type === 'say') { if (!d.text.trim()) { notice('Skriv vad som sägs.'); return; } step.arg = { text: d.text.trim(), secs: d.secs || 2 }; }
        else if (d.type === 'dialog') {
          if (d.lineText.trim()) actions.lineAdd(true);
          if (!d.lines.length) { notice('Lägg till minst en replik.'); return; }
          step.arg = d.lines.map(ln => ({ who: ln.who, text: lineText(ln) }));
        }
        else if (d.type === 'wait') step.arg = +d.wait || 1;
        if (d.type === 'walk' && d.follow && who !== UNIT) step.follow = true;
        if (d.parent === null && d.together && (d.editing === null ? list.length : d.editing) > 0) step.together = true;
        if (d.editing !== null) { if (d.parent === null && list[d.editing]?.otherwise) step.otherwise = list[d.editing].otherwise; list[d.editing] = step; } else list.push(step);
        resetStep(); render();
      },
      sEdit: ({ i, p }) => {
        const s = listAt(p)[+i]; resetStep(); Object.assign(stepDraft, { type: s.type, editing: +i, together: !!s.together, follow: !!s.follow, parent: p === undefined ? null : +p, pick: s.pick || 'trigger', side: s.side || '', kind: s.kind || '' });
        if (s.who) stepDraft.who = s.who;
        if (['walk', 'appear', 'camera'].includes(s.type)) { stepDraft.keepArg = s.arg; stepDraft.target = '__keep'; stepDraft.zoom = s.zoom || ''; }
        else if (s.type === 'say') { stepDraft.text = s.arg.text; stepDraft.secs = s.arg.secs || 2; }
        else if (s.type === 'wait') stepDraft.wait = s.arg;
        else if (s.type === 'dialog') stepDraft.lines = s.arg.map(ln => ({ who: ln.who, ...moodOfLine(ln.text) }));
        render();
      },
      sCancel: () => { resetStep(); render(); },
      lineAdd: quiet => {
        const d = stepDraft, text = d.lineText.trim(); if (!text) { notice('Skriv vad som sägs.'); return; }
        const ln = { who: d.lineWho, mood: d.lineMood, text };
        if (d.lineEdit !== null) d.lines[d.lineEdit] = ln; else d.lines.push(ln);
        d.lineText = ''; d.lineEdit = null; if (quiet !== true) render();
      },
      lEdit: ({ i }) => { const ln = stepDraft.lines[+i]; Object.assign(stepDraft, { lineWho: ln.who, lineMood: ln.mood, lineText: ln.text, lineEdit: +i }); render(); },
      lineCancel: () => { stepDraft.lineText = ''; stepDraft.lineEdit = null; render(); },
      lUp: ({ i }) => { move(stepDraft.lines, +i, -1); stepDraft.lineEdit = null; render(); },
      lDown: ({ i }) => { move(stepDraft.lines, +i, 1); stepDraft.lineEdit = null; render(); },
      lDel: ({ i }) => { stepDraft.lines.splice(+i, 1); stepDraft.lineEdit = null; render(); },
      scenePlay: () => {
        const sc = sceneNow(), issues = sceneProblems(sc); if (issues.length) { notice(issues[0].text); return; }
        const compiled = compileScene(sc, false); stopPreview(); previewBase = C.Levels.progressRef().actors.leftovers.length;
        C.Story.fire(compiled); for (const spec of compiled.spawn || []) previews.push(spec.id); previewScenes.push(compiled.id); const walk = steps => { for (const s of steps) { if (s.spawn) previewAppear.push(s.spawn.id); walk(s.otherwise || []); } }; walk(compiled.scene); note('Scenen spelas upp.');
      },
      tab: ({ tab }) => { st.tab = tab; st.arm = null; render(); },
      cancelArm: () => { st.arm = null; render(); },
      resetSaved: () => { try { localStorage.removeItem(storeKey(chapterNumber)); } catch (error) {} restore(chapterNumber); render(); },
      clearScenery: () => { World.scenery.clear(); World.sceneryList = []; note('Alla kulisser är borttagna (ladda om kapitlet för att få tillbaka dem).'); },
      // skådespelare
      stopPreview: () => { stopPreview(); note('Uppspelningen är rensad.'); },
      copyExport: () => {
        const area = $('#exportText'); area.select();
        const done = ok => { const el = $('#copyNote'); if (el) el.textContent = ok ? 'Kopierat!' : 'Markera texten och kopiera.'; };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(area.value).then(() => done(true), () => done(false)); else done(false);
      },
    };

    // ---------------------------------------------------------------- kartan: pekaren
    const sceneryOn = (x, y) => World.scenery.get(keyOf(x, y)) || [];
    const sortScenery = () => World.sceneryList.sort((a, b) => a.layer - b.layer);
    function addScenery(type, x, y, layer) {
      if (sceneryOn(x, y).some(item => item.type === type && item.layer === layer)) return;
      const item = { type, x, y, layer }, key = keyOf(x, y);
      if (!World.scenery.has(key)) World.scenery.set(key, []);
      World.scenery.get(key).push(item); World.sceneryList.push(item); sortScenery();
    }
    function removeScenery(item) {
      const key = keyOf(item.x, item.y), rest = sceneryOn(item.x, item.y).filter(other => other !== item);
      if (rest.length) World.scenery.set(key, rest); else World.scenery.delete(key);
      World.sceneryList = World.sceneryList.filter(other => other !== item);
    }
    const buildingAt = (x, y) => { const building = World.buildingAt(x, y); return editable(building) ? building : null; };
    function placeBuilding(type, x, y, dead, beacon) {
      if (!World.canPlace(type, x, y)) { notice(`${type} kan inte stå på ${x}, ${y}.`); return null; }
      const building = World.placeBuilding(C.Construction.variantFor(type, x, y) || type, x, y, true, dead ? Story.deadOwner() : Players.HUMAN);
      if (!dead) return Story.ready(building);
      World.makeDead(building); if (beacon) { Object.assign(building, beacon); World.buildingVersion++; }
      return building;
    }
    const layerFor = type => st.layer !== '' && !isNaN(+st.layer) ? +st.layer : defaultLayer[type] ?? 0;
    const tileOf = event => Renderer.screenToTile(event.clientX, event.clientY);
    function put(tile) {
      const [kind, type] = st.type.split(':');
      if (kind === 's') addScenery(type, tile.x, tile.y, layerFor(type)); else placeBuilding(type, tile.x, tile.y, true, st.beacon ? { sight: Math.max(1, +st.beaconRadius || 6), ...(st.beaconArrow ? { arrow: true } : {}) } : null);
    }
    function removeAt(tile) {
      const items = sceneryOn(tile.x, tile.y), building = buildingAt(tile.x, tile.y);
      if (items.length) removeScenery(items[items.length - 1]); else if (building) World.removeBuilding(building);
    }
    function armClick(tile) {
      const arm = st.arm; st.arm = null;
      if (arm.kind === 'cast') { const sc = sceneNow(); if (sc) { const id = castDraft.id.trim() || uniqueId('person'); sc.cast.push({ id, image: castDraft.image, race: castDraft.race, count: countOf(), at: [tile.x - hq().x, tile.y - hq().y] }); castDraft = blankCast(); stepDraft.who = stepDraft.who || id; } }
      else if (arm.kind === 'fxWhere') { const sc = sceneNow(); if (sc) sc.where = tileTarget(tile); }
      else if (arm.kind === 'condNear') { const sc = sceneNow(); if (sc) { arm.cond.v.near = tileTarget(tile); addCond(sc, arm.cond); } }
      else if (arm.kind === 'castMove') { const c = sceneNow()?.cast[arm.i]; if (c) c.at = [tile.x - hq().x, tile.y - hq().y]; }
      else if (arm.kind === 'sceneStep') { const sc = sceneNow(); if (sc) { const list = arm.parent === null || arm.parent === undefined ? sc.steps : sc.steps[arm.parent].otherwise, step = { who: arm.who, type: arm.type, arg: tileTarget(tile) }; if (arm.zoom) step.zoom = arm.zoom; if (arm.type === 'walk' && arm.follow) step.follow = true; if ((arm.parent === null || arm.parent === undefined) && arm.together && (arm.edit ?? list.length) > 0) step.together = true; if (arm.edit !== null && arm.edit !== undefined) { if (list[arm.edit]?.otherwise) step.otherwise = list[arm.edit].otherwise; list[arm.edit] = step; } else list.push(step); resetStep(); } }
      render();
    }
    const mine = event => !event.shiftKey && event.target === canvas && event.button !== 1 && (st.tab === 'map' || !!st.arm);
    window.addEventListener('pointerdown', event => {
      if (!mine(event)) return;
      event.stopImmediatePropagation(); event.preventDefault();
      const tile = tileOf(event);
      if (st.arm) { if (event.button === 2) { st.arm = null; render(); } else armClick(tile); return; }
      if (event.button === 2) { removeAt(tile); return; }
      if (st.mode === 'place') { st.painting = true; st.last = keyOf(tile.x, tile.y); put(tile); return; }
      const items = sceneryOn(tile.x, tile.y), building = buildingAt(tile.x, tile.y);
      if (items.length) st.drag = { item: items[items.length - 1] }; else if (building) st.drag = { building };
      if (st.drag) canvas.setPointerCapture(event.pointerId);
    }, true);
    window.addEventListener('pointermove', event => {
      st.hover = event.target === canvas ? tileOf(event) : null;
      if (!st.painting || !event.buttons) return;
      const tile = tileOf(event), key = keyOf(tile.x, tile.y);
      if (key !== st.last && st.type.startsWith('s:')) { st.last = key; put(tile); }
    }, true);
    window.addEventListener('pointerup', event => {
      const drag = st.drag; st.drag = null; st.painting = false;
      if (!drag) return;
      event.stopImmediatePropagation();
      const tile = tileOf(event);
      if (drag.item) { const { type, layer } = drag.item; removeScenery(drag.item); addScenery(type, tile.x, tile.y, layer); }
      else { const { building } = drag, { type, dead, sight, arrow } = building, from = { x: building.x, y: building.y }, beacon = sight || arrow ? { ...(sight ? { sight } : {}), ...(arrow ? { arrow } : {}) } : null; World.removeBuilding(building); if (!placeBuilding(type, tile.x, tile.y, dead, beacon)) placeBuilding(type, from.x, from.y, dead, beacon); }
    }, true);
    window.addEventListener('contextmenu', event => { if (event.target === canvas && !event.shiftKey && mine(event)) event.preventDefault(); }, true);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && st.arm) { st.arm = null; render(); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && st.tab === 'map' && st.hover && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { removeAt(st.hover); event.stopImmediatePropagation(); }
    }, true);

    // ---------------------------------------------------------------- markör och numrerade punkter på kartan
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;z-index:99998;pointer-events:none;border:2px solid #ffd54a;box-sizing:border-box;display:none';
    document.body.appendChild(ghost);
    const markerBox = document.createElement('div'); markerBox.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:99997'; document.body.appendChild(markerBox);
    const marks = [];
    const tileOfTarget = target => { const found = A.resolve(target, null); return found && { x: found.x, y: found.y }; };
    function drawMarks() {
      const wanted = [], base = hq();
      if (base && st.tab === 'scene' && sceneNow()) {
        const sc = sceneNow();
        for (const c of sc.cast) if (c.at) wanted.push({ x: base.x + c.at[0], y: base.y + c.at[1], label: c.id.slice(0, 7), color: 'rgb(255 213 74 / 90%)', wide: true });
        sc.steps.forEach((s, i) => { const tile = (s.type === 'walk' || s.type === 'appear' || s.type === 'camera') && (Array.isArray(s.arg) || typeof s.arg === 'string') && tileOfTarget(s.arg); if (tile) wanted.push({ ...tile, label: String(i + 1), color: 'rgb(120 200 255 / 90%)' }); });
      }
      while (marks.length < wanted.length) { const div = document.createElement('div'); div.style.cssText = 'position:absolute;color:#000;font:bold 11px sans-serif;text-align:center;border-radius:10px;white-space:nowrap;padding:0 3px;box-sizing:border-box;min-width:16px'; markerBox.appendChild(div); marks.push(div); }
      marks.forEach((div, i) => {
        const mark = wanted[i]; div.style.display = mark ? 'block' : 'none'; if (!mark) return;
        const size = Math.max(16, Renderer.tileSize * Renderer.zoom * .5);
        div.textContent = mark.label; div.style.background = mark.color; div.style.height = size + 'px'; div.style.lineHeight = size + 'px';
        div.style.left = ((mark.x + .5) * Renderer.tileSize - Renderer.camera.x) * Renderer.zoom - (mark.wide ? 14 : size / 2) + 'px';
        div.style.top = ((mark.y + .5) * Renderer.tileSize - Renderer.camera.y) * Renderer.zoom - size / 2 + 'px';
      });
      const tile = st.hover, size = Renderer.tileSize * Renderer.zoom, showing = tile && (st.tab === 'map' || st.arm);
      if (showing) {
        ghost.style.display = 'block'; ghost.style.width = ghost.style.height = size + 'px';
        ghost.style.left = (tile.x * Renderer.tileSize - Renderer.camera.x) * Renderer.zoom + 'px';
        ghost.style.top = (tile.y * Renderer.tileSize - Renderer.camera.y) * Renderer.zoom + 'px';
        const label = $('#seHover'), base2 = hq(); if (label && base2) label.textContent = `ruta ${tile.x}, ${tile.y} (dx ${tile.x - base2.x}, dy ${tile.y - base2.y})`;
      } else ghost.style.display = 'none';
    }
    (function loop() {
      try {
        if (chapter() && chapter().number !== chapterNumber) { persist(); chapterNumber = chapter().number; restore(chapterNumber); render(); }
        drawMarks();
      } catch (error) { console.error('Story-editor:', error); }
      requestAnimationFrame(loop);
    })();

    render();
    window.StoryEditor = { get scenes() { return scenes; }, compileScene, importEvent, export: () => exportParts().map(part => part.text).join('\n'), state: st, actions, render };
  }
})();
