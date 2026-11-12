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
    if (C && C.Game && C.World && C.Renderer && C.Story && C.Config && C.Actors && C.Renderer.canvas) { clearInterval(wait); init(C); }
  }, 300);

  function init(C) {
    const { World, Renderer, Story, Config, Utils, Players } = C, canvas = Renderer.canvas, A = C.Actors;

    // ---------------------------------------------------------------- data
    const st = { tab: 'map', mode: 'place', type: 's:corpse', layer: '', drag: null, painting: false, hover: null, last: null, arm: null, note: '' };
    let defs = [], events = [], chapterNumber = null;
    const blankDraft = () => ({ editing: null, id: '', image: defaultImage, custom: '', race: '', at: null, script: [] });
    const blankEvent = () => ({ id: '', conds: [], effects: [], addCond: 'time', addEff: 'spawn', editing: null });
    const previews = []; let previewBase = 0;

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
    const defaultImage = images.find(item => item.label === 'worker')?.path || images[0]?.path || '';
    let draft = blankDraft(), evDraft = blankEvent();

    // ---------------------------------------------------------------- hjälpare
    const hq = () => World.headquarters;
    const keyOf = (x, y) => Utils.tileKey(x, y);
    const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const ser = value => value && typeof value === 'object'
      ? (Array.isArray(value) ? '[' + value.map(ser).join(', ') + ']'
        : value.who !== undefined && value.text !== undefined ? `say(${JSON.stringify(value.who)}, ${JSON.stringify(value.text)})`
        : '{ ' + Object.entries(value).map(([key, item]) => `${/^[a-z_]\w*$/i.test(key) ? key : JSON.stringify(key)}: ${ser(item)}`).join(', ') + ' }')
      : JSON.stringify(value);
    const chapter = () => Story.chapter;
    const existingEvents = () => chapter()?.events || [];
    const actorIds = () => [...new Set([...defs.map(def => def.id), ...existingEvents().flatMap(event => [].concat(event.spawn || []).map(spec => spec.id))])];
    const eventIds = () => [...new Set([...events.map(event => event.id).filter(Boolean), ...existingEvents().map(event => event.id).filter(Boolean)])];
    const imageSrc = (path, race) => { const m = /^images\/units\/([^/]+\.png)$/.exec(path || ''); return race && m ? `images/units/${race}/${m[1]}` : path; };
    const nameOf = path => images.find(item => item.path === path)?.label || (path || '').replace('images/units/', '').replace('.png', '');
    const targetText = target => Array.isArray(target) ? `ruta (${target[0]}, ${target[1]})` : typeof target === 'string' ? (target === 'hq' ? 'basen' : target) : JSON.stringify(target);
    const stepText = step => {
      const [type, arg] = Object.entries(step)[0];
      switch (type) {
        case 'walk': return `Går till ${targetText(arg)}`;
        case 'teleport': return `Teleporteras till ${targetText(arg)}`;
        case 'wait': return `Väntar ${arg} s`;
        case 'tell': return `Dialog: ${arg.map(line => `${line.who}: “${line.text}”`).join(' / ')}`;
        case 'kill': { const spec = typeof arg === 'string' ? { actor: arg } : arg; return `Dödar ${spec.actor} (${spec.leave === undefined ? 'blodpöl' : [].concat(spec.leave).join(' + ')})`; }
        case 'say': { const spec = typeof arg === 'string' ? { text: arg } : arg; return `Pratbubbla: “${spec.text}”${spec.for ? ` (${spec.for} s${spec.wait ? ', väntar' : ''})` : ''}`; }
        case 'vanish': return 'Försvinner direkt';
        case 'leave': return 'Går mot dimman och försvinner';
        default: return `${type}: ${JSON.stringify(arg)}`;
      }
    };
    const select = (id, options, current, bind) => `<select ${id ? `id="${id}"` : ''} ${bind ? `data-bind="${bind}"` : ''}>${options.map(option => { const [value, label] = Array.isArray(option) ? option : [option, option]; return `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(label)}</option>`; }).join('')}</select>`;

    // ---------------------------------------------------------------- spara och ladda (webbläsaren, per kapitel)
    const storeKey = number => `storyEditor.v2.chapter${number}`;
    const persist = () => { try { if (chapterNumber !== null) localStorage.setItem(storeKey(chapterNumber), JSON.stringify({ defs, events })); } catch (error) { /* ingen lagring */ } };
    const restore = number => {
      defs = []; events = []; draft = blankDraft(); evDraft = blankEvent();
      try { const saved = JSON.parse(localStorage.getItem(storeKey(number)) || 'null'); if (saved) { defs = saved.defs || []; events = saved.events || []; } } catch (error) { /* tomt */ }
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
      #storyEditor details summary{cursor:pointer;color:#9ad}
    `;
    document.head.appendChild(style);
    const panel = document.createElement('div');
    panel.id = 'storyEditor';
    document.body.appendChild(panel);
    for (const type of ['pointerdown', 'pointerup', 'wheel']) panel.addEventListener(type, event => event.stopPropagation());
    const $ = selector => panel.querySelector(selector);

    // ---------------------------------------------------------------- flikarna
    const tabs = [['map', 'Karta'], ['actor', 'Skådespelare'], ['event', 'Händelser'], ['export', 'Exportera']];

    function viewMap() {
      return `<p class="hint">Placera kulisser och döda byggnader direkt på kartan. Klicka eller dra för att måla.</p>
        <div class="row"><label><input type="radio" name="mode" data-bind="mode" value="place"${st.mode === 'place' ? ' checked' : ''}> Placera</label>
        <label><input type="radio" name="mode" data-bind="mode" value="move"${st.mode === 'move' ? ' checked' : ''}> Flytta / ta bort</label></div>
        <div class="row"><select data-bind="type" style="width:100%"><optgroup label="Kulisser">${sceneryTypes.map(t => `<option value="s:${t}"${st.type === 's:' + t ? ' selected' : ''}>${t}</option>`).join('')}</optgroup>
        <optgroup label="Döda byggnader">${buildingTypes.map(t => `<option value="b:${t}"${st.type === 'b:' + t ? ' selected' : ''}>${t}</option>`).join('')}</optgroup></select></div>
        <div class="row">Lager <input type="number" data-bind="layer" value="${esc(st.layer)}" placeholder="auto" style="width:60px"> <span class="hint">(auto = blod under lik)</span></div>
        <p class="hint">Högerklick eller Delete tar bort det under pekaren. Skift + dra styr kameran.</p>
        <button class="danger" data-act="clearScenery">Ta bort alla kulisser i kapitlet</button>`;
    }

    function viewActor() {
      const editing = draft.editing !== null;
      const used = id => events.some(event => event.effects.some(effect => effect.kind === 'spawn' && effect.v.actor === id));
      const known = defs.filter(def => def.id !== draft.id).map(def => def.id);
      const customImage = draft.image === '__custom';
      const src = imageSrc(customImage ? draft.custom : draft.image, draft.race);
      const list = defs.length ? defs.map((def, i) => `<div class="card"><div class="row"><b>${esc(def.id)}</b> <span class="hint">${esc(nameOf(def.image))}${def.race ? ', ' + def.race : ''}</span></div>
          <div class="row ${used(def.id) ? 'ok' : 'warn'}">${used(def.id) ? '✓ startas av en händelse' : '⚠ startas inte av någon händelse'}</div>
          <div class="row"><button data-act="editActor" data-i="${i}">Redigera</button><button data-act="playSaved" data-i="${i}">Spela upp</button>
          ${used(def.id) ? '' : `<button class="primary" data-act="startAtBegin" data-id="${esc(def.id)}">Skapa händelse som startar den</button>`}<button class="danger small" data-act="deleteActor" data-i="${i}">✕</button></div></div>`).join('')
        : '<p class="hint">Inga sparade skådespelare än.</p>';
      return `<h4>Sparade skådespelare</h4>${list}
        <h4>${editing ? `Redigerar: ${esc(draft.id)}` : 'Ny skådespelare'}</h4>
        <div class="row"><img class="pv" id="pv" src="${esc(src || '')}" onerror="this.style.visibility='hidden'" onload="this.style.visibility='visible'">
          <div style="flex:1"><div class="row">Namn <input data-bind="draft.id" value="${esc(draft.id)}" placeholder="t.ex. pipwick" style="width:110px"></div>
          <div class="row">Ras ${select('', [['', 'människa'], ['demon', 'demon']], draft.race, 'draft.race')}</div></div></div>
        <div class="row">Bild ${select('', [...images.map(item => [item.path, item.label]), ['__custom', 'Egen bildfil…']], draft.image, 'draft.image')}</div>
        ${customImage ? `<div class="row">Fil <input data-bind="draft.custom" value="${esc(draft.custom)}" placeholder="images/units/pipwick.png" style="width:100%"></div>` : ''}
        <div class="row"><button data-act="armStart">${draft.at ? 'Byt startruta' : 'Välj startruta på kartan'}</button> <span class="${draft.at ? 'ok' : 'warn'}">${draft.at ? `start (${draft.at[0]}, ${draft.at[1]})` : '⚠ ingen startruta'}</span></div>
        <h4>Manus (görs i ordning)</h4>
        ${draft.script.length ? draft.script.map((step, i) => `<div class="step"><b>${i + 1}.</b><span>${esc(stepText(step))}</span>
            <button class="small" data-act="stepUp" data-i="${i}" title="Flytta upp">↑</button><button class="small" data-act="stepDown" data-i="${i}" title="Flytta ned">↓</button><button class="small danger" data-act="stepDel" data-i="${i}" title="Ta bort">✕</button></div>`).join('') : '<p class="hint">Inga steg än. Lägg till steg nedan.</p>'}
        <div class="card"><b>Lägg till steg</b>
          <div class="row"><button data-act="armStep" data-type="walk">Gå till…</button><button data-act="armStep" data-type="teleport">Teleportera till…</button></div>
          <div class="hint" style="margin:0">…och klicka sedan på kartan (en byggnad = byggnaden som mål).</div>
          <div class="row"><input type="number" id="stWait" value="2" style="width:55px"> s <button data-act="addWait">Vänta</button></div>
          <div class="row">${select('stSpeaker', speakerIds.length ? speakerIds : ['narrator'], 'narrator')}<input id="stText" placeholder="Vad sägs?" style="flex:1;min-width:80px"><button data-act="addSay">Dialog</button></div>
          <div class="row"><input id="stBubble" placeholder="Pratbubbla: text" style="flex:1;min-width:80px"><input type="number" id="stBubbleSec" value="3" style="width:46px" title="sekunder"> s <label title="Manuset väntar tills bubblan är borta"><input type="checkbox" id="stBubbleWait"> vänta</label><button data-act="addBubble">Pratbubbla</button></div>
          <div class="row">${select('stVictim', known.length ? known : ['(ingen annan sparad)'], known[0] || '')} ${select('stLeave', [['blood', 'blodpöl'], ['corpse', 'lik'], ['both', 'båda'], ['none', 'inget']], 'blood')} <button data-act="addKill">Dödar</button></div>
          <div class="row"><button data-act="addLeave" title="Går mot närmaste ruta utom spelarens synfält och försvinner när den inte syns">Lämna scenen (mot dimman)</button><button data-act="addVanish">Försvinn direkt</button></div>
        </div>
        <div class="row"><button class="primary" data-act="saveActor">${editing ? 'Spara ändringarna' : 'Spara skådespelare'}</button><button data-act="playDraft">Spela upp</button><button data-act="stopPreview">Rensa uppspelning</button>${editing ? '<button data-act="newActor">Ny</button>' : ''}</div>`;
    }

    // Villkor: f = fält [namn, typ, hjälptext]. top/when: hur de blir en del av händelsen.
    const COND = {
      time:        { group: 'Tid', label: 'Efter så här många sekunder in i kapitlet', f: [['n', 'num', 'sekunder']], make: v => ({ top: { at: +v.n } }), text: v => `efter ${v.n} s` },
      goal:        { group: 'Mål', label: 'Ett mål är klart', f: [['n', 'num', 'målnummer (1 = första)']], make: v => ({ top: { goal: +v.n } }), text: v => `mål ${v.n} klart` },
      made:        { group: 'Resurser', label: 'Så mycket har tillverkats i kapitlet', f: [['res', 'res'], ['n', 'num', 'antal']], make: v => ({ when: { resource: v.res, made: +v.n } }), text: v => `${v.n} ${v.res} tillverkat` },
      have:        { group: 'Resurser', label: 'Spelaren har minst så mycket', f: [['res', 'res'], ['n', 'num', 'antal']], make: v => ({ when: { resource: v.res, amount: +v.n } }), text: v => `har ${v.n} ${v.res}` },
      built:       { group: 'Byggnader', label: 'Spelaren har byggt', f: [['bld', 'bld'], ['n', 'num', 'antal']], make: v => ({ when: { type: 'build', id: v.bld, amount: +v.n || 1 } }), text: v => `byggt ${v.n || 1} ${v.bld}` },
      arrived:     { group: 'Skådespelare', label: 'är framme (gått färdigt)', f: [['actor', 'actor']], make: v => ({ when: { arrived: v.actor } }), text: v => `${v.actor} är framme` },
      arrivedSeen: { group: 'Skådespelare', label: 'är framme och spelaren ser hen', f: [['actor', 'actor']], make: v => ({ when: { arrivedSeen: v.actor } }), text: v => `${v.actor} är framme och syns` },
      seen:        { group: 'Skådespelare', label: 'syns just nu', f: [['actor', 'actor']], make: v => ({ when: { seen: v.actor } }), text: v => `${v.actor} syns` },
      gone:        { group: 'Skådespelare', label: 'har försvunnit', f: [['actor', 'actor']], make: v => ({ when: { gone: v.actor } }), text: v => `${v.actor} är borta` },
      killed:      { group: 'Skådespelare', label: 'har dödats', f: [['actor', 'actor']], make: v => ({ when: { killed: v.actor } }), text: v => `${v.actor} är dödad` },
      near:        { group: 'Skådespelare', label: 'är nära en byggnad', f: [['actor', 'actor'], ['bld', 'bld', 'byggnad'], ['n', 'num', 'radie']], make: v => ({ when: { near: v.actor, of: v.bld, radius: +v.n || 3 } }), text: v => `${v.actor} nära ${v.bld}` },
      read:        { group: 'Dialog', label: 'En händelses dialog är läst', f: [['id', 'event']], make: v => ({ when: { read: v.id } }), text: v => `dialogen '${v.id}' läst` },
      told:        { group: 'Dialog', label: 'En nyckel är satt (avancerat)', f: [['key', 'text', 'nyckel']], make: v => ({ when: { told: v.key } }), text: v => `nyckel ${v.key}` },
    };
    const EFF = {
      spawn: { label: 'Starta en skådespelare', f: [['actor', 'actordef']], text: v => `starta ${v.actor}` },
      act:   { label: 'Byt manus på en skådespelare (manuset i fliken Skådespelare)', f: [['actor', 'actor']], text: (v, e) => `${v.actor} får nytt manus (${(e.script || []).length} steg)` },
      tell:  { label: 'Visa en dialograd', f: [['who', 'speaker'], ['text', 'text', 'vad sägs?']], text: v => `dialog: “${v.text}”` },
      give:  { label: 'Ge varor till spelaren', f: [['res', 'res'], ['n', 'num', 'antal']], text: v => `ge ${v.n} ${v.res}` },
    };
    const field = (type, id, hint) => {
      if (type === 'num') return `<input type="number" id="${id}" placeholder="${esc(hint || '')}" style="width:90px">`;
      if (type === 'text') return `<input id="${id}" placeholder="${esc(hint || '')}" style="width:100%">`;
      if (type === 'res') return select(id, resourceIds, 'wood');
      if (type === 'bld') return select(id, ['hq', ...buildingTypes], 'hq');
      if (type === 'actor') return actorIds().length ? select(id, actorIds(), actorIds()[0]) : `<input id="${id}" placeholder="skådespelar-id">`;
      if (type === 'actordef') return defs.length ? select(id, defs.map(def => def.id), defs[0].id) : '<span class="warn">Spara en skådespelare först</span>';
      if (type === 'event') return eventIds().length ? select(id, eventIds(), eventIds()[0]) : '<span class="warn">Ingen händelse har ett namn än</span>';
      if (type === 'speaker') return select(id, speakerIds.length ? speakerIds : ['narrator'], 'narrator');
      return '';
    };
    const read = (spec, prefix) => Object.fromEntries(spec.f.map(([name], i) => [name, ($(`#${prefix}${i}`)?.value ?? '').trim()]));
    const summary = event => {
      const when = event.conds.map(cond => COND[cond.kind].text(cond.v)), what = event.effects.map(effect => EFF[effect.kind].text(effect.v, effect));
      return `${event.id ? `[${event.id}] ` : ''}När: ${when.join(' och ') || 'kapitlet startar'} → ${what.join(', ') || '(inget)'}`;
    };

    function viewEvent() {
      const cond = COND[evDraft.addCond], eff = EFF[evDraft.addEff];
      const groups = [...new Set(Object.values(COND).map(item => item.group))];
      const saved = events.length ? events.map((event, i) => `<div class="card"><div>${esc(summary(event))}</div><div class="row"><button data-act="loadEvent" data-i="${i}">Redigera</button><button data-act="testSaved" data-i="${i}">Testa</button><button class="danger small" data-act="deleteEvent" data-i="${i}">✕</button></div></div>`).join('') : '<p class="hint">Inga sparade händelser än.</p>';
      const existing = existingEvents();
      return `<h4>Sparade händelser</h4>${saved}
        <h4>Ny händelse</h4>
        <div class="row">Namn (valfritt) <input data-bind="evDraft.id" value="${esc(evDraft.id)}" placeholder="t.ex. pipwick_arrive" style="flex:1"></div>
        <div class="hint" style="margin:0">Ett namn behövs bara om en annan händelse ska vänta på att dialogen är läst.</div>
        <h4>1. När ska det hända?</h4>
        ${evDraft.conds.length ? evDraft.conds.map((c, i) => `<div class="step"><span>${esc(COND[c.kind].text(c.v))}</span><button class="small danger" data-act="condDel" data-i="${i}">✕</button></div>`).join('') : '<p class="hint">Inga villkor: händelsen sker direkt när kapitlet startar.</p>'}
        <div class="card"><div class="row"><select data-bind="evDraft.addCond" style="width:100%">${groups.map(group => `<optgroup label="${group}">${Object.entries(COND).filter(([, item]) => item.group === group).map(([kind, item]) => `<option value="${kind}"${evDraft.addCond === kind ? ' selected' : ''}>${group === 'Skådespelare' ? 'Skådespelare ' : ''}${item.label}</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div class="row">${cond.f.map(([, type, hint], i) => field(type, 'c' + i, hint)).join(' ')}</div>
          <div class="row"><button data-act="addCond">Lägg till villkor</button></div></div>
        <h4>2. Vad ska hända?</h4>
        ${evDraft.effects.length ? evDraft.effects.map((e, i) => `<div class="step"><span>${esc(EFF[e.kind].text(e.v, e))}</span><button class="small danger" data-act="effDel" data-i="${i}">✕</button></div>`).join('') : '<p class="hint">Inga effekter än.</p>'}
        <div class="card"><div class="row"><select data-bind="evDraft.addEff" style="width:100%">${Object.entries(EFF).map(([kind, item]) => `<option value="${kind}"${evDraft.addEff === kind ? ' selected' : ''}>${item.label}</option>`).join('')}</select></div>
          <div class="row">${eff.f.map(([, type, hint], i) => field(type, 'e' + i, hint)).join(' ')}</div>
          ${evDraft.addEff === 'act' ? `<div class="hint" style="margin:0">Manuset som används: ${draft.script.length ? esc(draft.script.map(stepText).join('; ')) : '<span class="warn">tomt (bygg ett i fliken Skådespelare)</span>'}</div>` : ''}
          <div class="row"><button data-act="addEff">Lägg till effekt</button></div></div>
        <div class="row"><button class="primary" data-act="saveEvent">${evDraft.editing !== null ? 'Spara ändringarna' : 'Spara händelse'}</button><button data-act="testDraft" title="Kör effekterna nu i spelet">Testa nu</button><button data-act="stopPreview">Rensa test</button></div>
        <p class="hint">Testa nu ger t.ex. varor på riktigt i det här spelet. Ladda om kapitlet efteråt.</p>
        ${existing.length ? `<details><summary>Händelser som redan finns i kapitlet (${existing.length})</summary>${existing.map(event => `<div class="card hint">${esc(ser(event).slice(0, 170))}</div>`).join('')}</details>` : ''}`;
    }

    // ---------------------------------------------------------------- export och kontroll
    const defById = id => defs.find(def => def.id === id);
    const pureDef = def => { const out = { id: def.id, image: def.image }; if (def.race) out.race = def.race; if (def.size) out.size = def.size; out.at = def.at; out.script = def.script.map(step => ({ ...step })); return out; };
    function compile(event) {
      const out = {}; if (event.id) out.id = event.id;
      const top = {}, when = [];
      for (const cond of event.conds) { const made = COND[cond.kind].make(cond.v); if (made.top) Object.assign(top, made.top); else when.push(made.when); }
      if (top.at === undefined && top.goal === undefined && !when.length) top.at = 0;
      Object.assign(out, top);
      if (when.length) out.when = when.length === 1 ? when[0] : when;
      for (const effect of event.effects) {
        const v = effect.v;
        if (effect.kind === 'spawn') { const def = defById(v.actor); if (def?.at) (out.spawn ||= []).push(pureDef(def)); }
        else if (effect.kind === 'act') (out.act ||= {})[v.actor] = (effect.script || []).map(step => ({ ...step }));
        else if (effect.kind === 'tell') (out.tell ||= []).push({ who: v.who || 'narrator', text: v.text });
        else if (effect.kind === 'give') (out.give ||= {})[v.res] = +v.n;
      }
      return out;
    }
    function problems() {
      const out = [], ids = new Set(actorIds());
      for (const def of defs) if (!events.some(event => event.effects.some(effect => effect.kind === 'spawn' && effect.v.actor === def.id))) out.push({ text: `Skådespelaren '${def.id}' startas inte av någon händelse.`, fix: { act: 'startAtBegin', id: def.id, label: 'Skapa händelse som startar den' } });
      for (const def of defs) if (!def.at) out.push({ text: `Skådespelaren '${def.id}' saknar startruta.` });
      for (const event of events) {
        for (const effect of event.effects) {
          if ((effect.kind === 'spawn' || effect.kind === 'act') && !ids.has(effect.v.actor)) out.push({ text: `Händelsen "${summary(event)}" använder skådespelaren '${effect.v.actor}' som inte finns.` });
          if (effect.kind === 'act' && !(effect.script || []).length) out.push({ text: `Händelsen "${summary(event)}" byter till ett tomt manus.` });
        }
        for (const cond of event.conds) {
          if (cond.kind === 'read' && !eventIds().includes(cond.v.id)) out.push({ text: `Händelsen "${summary(event)}" väntar på dialogen '${cond.v.id}' som inte finns.` });
          if (['arrived', 'arrivedSeen', 'seen', 'gone', 'killed', 'near'].includes(cond.kind) && !ids.has(cond.v.actor)) out.push({ text: `Händelsen "${summary(event)}" väntar på skådespelaren '${cond.v.actor}' som inte finns.` });
        }
      }
      return out;
    }
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
      const row = building => `{ type: '${building.type}', dx: ${building.x - base.x}, dy: ${building.y - base.y}${building.dead ? ', dead: true' : ''} }`;
      const parts = [];
      parts.push({ title: 'Kulisser (ersätter kapitlets scenery)', text: `scenery: [\n${sceneryRows().map(line => '\t' + line + ',').join('\n')}\n],` });
      parts.push({ title: 'Startbyggnader och döda byggnader (ersätter kapitlets start)', text: `start: { buildings: [\n${list.filter(building => building !== eye).map(building => '\t' + row(building) + ',').join('\n')}\n] },` + (eye ? `\neye: { dx: ${eye.x - base.x}, dy: ${eye.y - base.y} },` : '') });
      if (events.length) parts.push({ title: 'Händelser (lägg till i kapitlets events)', text: `events: [\n${events.map(event => '\t' + ser(compile(event)) + ',').join('\n')}\n],` });
      const loose = defs.filter(def => !events.some(event => event.effects.some(effect => effect.kind === 'spawn' && effect.v.actor === def.id)));
      if (loose.length) parts.push({ title: 'VARNING: skådespelare som INTE startas av någon händelse (de syns aldrig i spelet förrän en händelse startar dem)', text: `// ${loose.map(def => ser(pureDef(def))).join('\n// ')}` });
      return parts;
    }
    function viewExport() {
      const issues = problems(), parts = exportParts(), text = parts.map(part => `// ${part.title}\n${part.text}`).join('\n\n');
      return `<h4>Kontroll</h4>
        ${issues.length ? issues.map(issue => `<div class="row warn">⚠ ${esc(issue.text)} ${issue.fix ? `<button data-act="${issue.fix.act}" data-id="${esc(issue.fix.id)}">${issue.fix.label}</button>` : ''}</div>`).join('') : '<div class="ok">✓ Inget att anmärka på.</div>'}
        <h4>Rader att klistra in i kapitlet</h4>
        <div class="row"><button class="primary" data-act="copyExport">Kopiera allt</button><span class="hint" id="copyNote"></span></div>
        <textarea readonly id="exportText">${esc(text)}</textarea>
        <p class="hint">Händelserna lägger du i kapitlets <code>events</code>, och dina ändringar av kartan ersätter <code>scenery</code> och <code>start</code>. Skådespelare ingår inlagda i de händelser som startar dem.</p>`;
    }

    // ---------------------------------------------------------------- rita om panelen
    function render() {
      const armText = st.arm ? (st.arm.kind === 'start' ? 'Klicka på kartan för att välja startruta.' : st.arm.type === 'walk' ? 'Klicka på kartan: vart ska hen gå? (en byggnad = byggnaden)' : 'Klicka på kartan: vart ska hen teleporteras?') : '';
      const scrollTop = panel.scrollTop;
      panel.innerHTML = `<div class="se-head"><b>Story-editor</b><span class="hint" style="margin:0">${chapter() ? `kapitel ${chapter().number}: ${esc(chapter().name || '')}` : '(ingen story pågår)'}</span>
          <label title="Fryser kapitlet medan du arbetar"><input type="checkbox" id="sePause"${C.Game.paused ? ' checked' : ''}> paus</label></div>
        <div class="se-tabs">${tabs.map(([id, label]) => `<button data-act="tab" data-tab="${id}" class="${st.tab === id ? 'on' : ''}">${label}</button>`).join('')}</div>
        ${armText ? `<div class="banner"><span>${armText}</span><button data-act="cancelArm">Avbryt</button></div>` : ''}
        <div class="se-body">${{ map: viewMap, actor: viewActor, event: viewEvent, export: viewExport }[st.tab]()}
          ${st.note ? `<p class="ok">${esc(st.note)}</p>` : ''}<div class="hint" id="seHover"></div></div>`;
      panel.scrollTop = scrollTop; persist();
    }
    const note = text => { st.note = text; render(); };

    // ---------------------------------------------------------------- inmatning i panelen
    const setPath = (path, value) => {
      const [root, key] = path.split('.');
      if (key === undefined) st[root] = value; else ({ draft, evDraft })[root][key] = value;
    };
    panel.addEventListener('input', event => { const bind = event.target.dataset?.bind; if (bind && event.target.type !== 'radio' && event.target.tagName !== 'SELECT') setPath(bind, event.target.value); });
    panel.addEventListener('change', event => {
      const target = event.target;
      if (target.id === 'sePause') { C.Game.paused = target.checked; return; }
      const bind = target.dataset?.bind; if (!bind) return;
      setPath(bind, target.value); if (target.tagName === 'SELECT' || target.type === 'radio') render();
    });
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-act]'); if (!button) return;
      st.note = ''; const fn = actions[button.dataset.act]; if (fn) fn(button.dataset, event);
    });

    // ---------------------------------------------------------------- skådespelarens bygge
    const tileTarget = tile => { const building = World.buildingAt(tile.x, tile.y); if (building && !building.removed) return building.type === 'hq' ? 'hq' : building.type; return [tile.x - hq().x, tile.y - hq().y]; };
    const currentDef = () => {
      const custom = draft.image === '__custom', path = custom ? draft.custom.trim() : draft.image, def = { id: draft.id.trim(), image: path };
      if (draft.race && !/\/(animals|monster)\//.test(path)) def.race = draft.race;
      const size = images.find(item => item.path === path)?.size; if (size && size !== 16) def.size = size;
      return { ...def, at: draft.at, script: draft.script.map(step => ({ ...step })) };
    };
    const killStep = () => {
      const id = $('#stVictim')?.value, how = $('#stLeave')?.value; if (!id || id.startsWith('(')) { note('Spara en annan skådespelare först, den som ska dödas.'); return null; }
      return how === 'blood' ? { kill: id } : { kill: { actor: id, leave: how === 'both' ? ['blood', 'corpse'] : how } };
    };
    const move = (list, i, d) => { const j = i + d; if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; };
    function stopPreview() {   // tar bort uppspelade skådespelare, deras blodpölar och att dialogerna lästs, så att inget följer med en sparning
      const progress = C.Levels.progressRef(), saved = progress.actors;
      for (const id of previews.splice(0)) {
        const data = A.data(id); if (data) A.remove(data);
        saved.list = saved.list.filter(item => item.id !== id);
        for (const key of Object.keys(progress.told || {})) if (key.startsWith(`read:${id}:`)) delete progress.told[key];
      }
      for (const item of saved.leftovers.splice(previewBase)) {
        const key = keyOf(item.x, item.y), rest = (World.scenery.get(key) || []).filter(other => !(other.type === item.type && other.layer === item.layer));
        if (rest.length) World.scenery.set(key, rest); else World.scenery.delete(key);
        World.sceneryList = World.sceneryList.filter(other => !(other.x === item.x && other.y === item.y && other.type === item.type && other.layer === item.layer));
      }
    }
    function play(def) {
      if (!def.at) { note('Välj en startruta först.'); return; }
      stopPreview(); previewBase = C.Levels.progressRef().actors.leftovers.length;
      const needs = new Set();
      for (const step of def.script) { const [type, arg] = Object.entries(step)[0]; const target = type === 'kill' ? (typeof arg === 'string' ? arg : arg.actor) : (type === 'walk' || type === 'teleport') && typeof arg === 'string' ? arg : null; if (target && target !== def.id && defById(target)) needs.add(target); }
      for (const id of needs) { A.spawn(pureDef(defById(id))); previews.push(id); }
      A.spawn(def); previews.push(def.id); note(`Spelar upp ${def.id}.`);
    }
    function testEvent(event) {
      const compiled = compile(event); stopPreview(); previewBase = C.Levels.progressRef().actors.leftovers.length;
      C.Story.fire(compiled); for (const spec of compiled.spawn || []) previews.push(spec.id); note('Effekterna kördes.');
    }

    const actions = {
      tab: ({ tab }) => { st.tab = tab; st.arm = null; render(); },
      cancelArm: () => { st.arm = null; render(); },
      clearScenery: () => { World.scenery.clear(); World.sceneryList = []; note('Alla kulisser är borttagna (ladda om kapitlet för att få tillbaka dem).'); },
      // skådespelare
      armStart: () => { st.arm = { kind: 'start' }; render(); },
      armStep: ({ type }) => { st.arm = { kind: 'step', type }; render(); },
      addWait: () => { draft.script.push({ wait: +$('#stWait').value || 1 }); render(); },
      addSay: () => { const text = $('#stText').value.trim(); if (!text) { note('Skriv vad som sägs.'); return; } draft.script.push({ tell: [{ who: $('#stSpeaker').value, text }] }); render(); },
      addBubble: () => {
        const text = $('#stBubble').value.trim(); if (!text) { note('Skriv vad bubblan ska säga.'); return; }
        const seconds = +$('#stBubbleSec').value || 3, wait = $('#stBubbleWait').checked;
        draft.script.push({ say: seconds === 3.5 && !wait ? text : { text, for: seconds, ...(wait ? { wait: true } : {}) } }); render();
      },
      addKill: () => { const step = killStep(); if (step) { draft.script.push(step); render(); } },
      addLeave: () => { draft.script.push({ leave: true }); render(); },
      addVanish: () => { draft.script.push({ vanish: true }); render(); },
      stepUp: ({ i }) => { move(draft.script, +i, -1); render(); },
      stepDown: ({ i }) => { move(draft.script, +i, 1); render(); },
      stepDel: ({ i }) => { draft.script.splice(+i, 1); render(); },
      saveActor: () => {
        const def = currentDef();
        if (!def.id) { note('Ge skådespelaren ett namn.'); return; }
        if (!def.image) { note('Välj en bild.'); return; }
        if (!def.at) { note('Välj en startruta på kartan.'); return; }
        const duplicate = defs.findIndex((other, i) => other.id === def.id && i !== draft.editing);
        if (duplicate >= 0) { note(`Det finns redan en skådespelare som heter ${def.id}.`); return; }
        if (draft.editing !== null) { const oldId = defs[draft.editing].id; defs[draft.editing] = def; if (oldId !== def.id) for (const event of events) for (const effect of event.effects) if (effect.v.actor === oldId) effect.v.actor = def.id; } else defs.push(def);
        const image = draft.image; draft = blankDraft(); draft.image = image; note(`Sparade ${def.id}. Glöm inte att starta den med en händelse (knappen på kortet, eller fliken Händelser).`);
      },
      newActor: () => { const image = draft.image; draft = blankDraft(); draft.image = image; render(); },
      editActor: ({ i }) => { const def = defs[+i], known = images.some(item => item.path === def.image); draft = { editing: +i, id: def.id, image: known ? def.image : '__custom', custom: known ? '' : def.image, race: def.race || '', at: def.at, script: def.script.map(step => ({ ...step })) }; render(); },
      deleteActor: ({ i }) => { defs.splice(+i, 1); draft.editing = null; render(); },
      playDraft: () => play(currentDef()),
      playSaved: ({ i }) => play(pureDef(defs[+i])),
      stopPreview: () => { stopPreview(); note('Uppspelningen är rensad.'); },
      startAtBegin: ({ id }) => { events.push({ id: '', conds: [{ kind: 'time', v: { n: '0' } }], effects: [{ kind: 'spawn', v: { actor: id } }] }); note(`Skapade en händelse som startar ${id} när kapitlet börjar (se fliken Händelser).`); },
      // händelser
      addCond: () => { const spec = COND[evDraft.addCond], v = read(spec, 'c'); if (Object.values(v).some(value => value === '')) { note('Fyll i alla fält.'); return; } evDraft.conds.push({ kind: evDraft.addCond, v }); render(); },
      condDel: ({ i }) => { evDraft.conds.splice(+i, 1); render(); },
      addEff: () => {
        const spec = EFF[evDraft.addEff], v = read(spec, 'e');
        if (Object.values(v).some(value => value === '')) { note('Fyll i alla fält.'); return; }
        if (evDraft.addEff === 'act' && !draft.script.length) { note('Manuset är tomt. Bygg ett i fliken Skådespelare först.'); return; }
        evDraft.effects.push({ kind: evDraft.addEff, v, script: evDraft.addEff === 'act' ? draft.script.map(step => ({ ...step })) : undefined }); render();
      },
      effDel: ({ i }) => { evDraft.effects.splice(+i, 1); render(); },
      saveEvent: () => {
        if (!evDraft.conds.length && !evDraft.effects.length) { note('Lägg till något först.'); return; }
        const { editing, addCond, addEff, ...rest } = evDraft, event = { ...rest, id: evDraft.id.trim() };
        if (editing !== null) events[editing] = event; else events.push(event);
        evDraft = blankEvent(); note('Händelsen är sparad.');
      },
      loadEvent: ({ i }) => { evDraft = { ...blankEvent(), ...JSON.parse(JSON.stringify(events[+i])), editing: +i }; render(); },
      deleteEvent: ({ i }) => { events.splice(+i, 1); evDraft = blankEvent(); render(); },
      testDraft: () => { const { editing, addCond, addEff, ...rest } = evDraft; testEvent({ ...rest, id: evDraft.id.trim() }); },
      testSaved: ({ i }) => testEvent(events[+i]),
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
    function placeBuilding(type, x, y, dead) {
      if (!World.canPlace(type, x, y)) { note(`${type} kan inte stå på ${x}, ${y}.`); return null; }
      const building = World.placeBuilding(C.Construction.variantFor(type, x, y) || type, x, y, true, dead ? Story.deadOwner() : Players.HUMAN);
      return dead ? World.makeDead(building) : Story.ready(building);
    }
    const layerFor = type => st.layer !== '' && !isNaN(+st.layer) ? +st.layer : defaultLayer[type] ?? 0;
    const tileOf = event => Renderer.screenToTile(event.clientX, event.clientY);
    function put(tile) {
      const [kind, type] = st.type.split(':');
      if (kind === 's') addScenery(type, tile.x, tile.y, layerFor(type)); else placeBuilding(type, tile.x, tile.y, true);
    }
    function removeAt(tile) {
      const items = sceneryOn(tile.x, tile.y), building = buildingAt(tile.x, tile.y);
      if (items.length) removeScenery(items[items.length - 1]); else if (building) World.removeBuilding(building);
    }
    function armClick(tile) {
      const arm = st.arm; st.arm = null;
      if (arm.kind === 'start') draft.at = [tile.x - hq().x, tile.y - hq().y];
      else draft.script.push({ [arm.type]: tileTarget(tile) });
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
      else { const { building } = drag, { type, dead } = building, from = { x: building.x, y: building.y }; World.removeBuilding(building); if (!placeBuilding(type, tile.x, tile.y, dead)) placeBuilding(type, from.x, from.y, dead); }
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
      if (base && st.tab === 'actor') {
        for (const def of defs) if (def.at && defs.indexOf(def) !== draft.editing) wanted.push({ x: base.x + def.at[0], y: base.y + def.at[1], label: def.id.slice(0, 7), color: 'rgb(180 180 190 / 85%)', wide: true });
        if (draft.at) wanted.push({ x: base.x + draft.at[0], y: base.y + draft.at[1], label: 'S', color: 'rgb(255 213 74 / 90%)' });
        draft.script.forEach((step, i) => { const [type, arg] = Object.entries(step)[0]; const tile = (type === 'walk' || type === 'teleport') && tileOfTarget(arg); if (tile) wanted.push({ ...tile, label: String(i + 1), color: 'rgb(255 213 74 / 90%)' }); });
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
      if (chapter() && chapter().number !== chapterNumber) { persist(); chapterNumber = chapter().number; restore(chapterNumber); render(); }
      drawMarks(); requestAnimationFrame(loop);
    })();

    render();
    window.StoryEditor = { get defs() { return defs; }, get events() { return events; }, export: () => exportParts().map(part => part.text).join('\n'), state: st, compile, actions, render };
  }
})();
