/* UTVECKLARVERKTYG, inte en del av spelet: kart-/kuliss-editor för storykapitlen. Laddas bara med ?editor i adressen (se index.html).
   Starta ett kapitel som vanligt och öppna sidan med ?editor (t.ex. index.html?editor). Panelen uppe till vänster:
     Placera  - välj typ och klicka (eller dra för att måla rutor med lik, blod, ruiner och eld). Byggnader placeras som döda kulisser.
     Flytta   - dra en kuliss eller byggnad till en ny ruta. Delete eller högerklick tar bort den under pekaren.
     Skift    - håll nere för att styra kameran som vanligt (panorera med drag, zooma med hjul).
     Skådespelare - bygg en skådespelare (id, bild, startruta) och ett manus genom att klicka på kartan: välj vad ett klick gör (start, gå dit, teleportera dit; ett
                    klick på en byggnad använder byggnadens id som mål), lägg till wait/vanish/kill/tell med knappen. Spela upp visar det i spelet. Spara skådespelare
                    lägger den i listan som följer med exporten (spawn: [...] att klistra in i en händelse).
     Exportera - ger raderna scenery: [...], start: { buildings: [...] } och spawn: [...] att klistra in i kapitlet i config/story.js.
   Ta bort verktyget: radera den här filen och de två raderna märkta EDITOR i index.html. Inget annat i spelet beror på den. */
(function () {
  'use strict';
  const wait = setInterval(() => {
    const C = window.CityBuilder;
    if (C && C.Game && C.World && C.Renderer && C.Story && C.Config && C.Renderer.canvas) { clearInterval(wait); init(C); }
  }, 300);

  function init(C) {
    const { World, Renderer, Story, Config, Utils, Players } = C, canvas = Renderer.canvas;
    const sceneryTypes = Object.keys(Config.story.sceneryTypes || {});
    const defaultLayer = { blood: 0, corpse: 1, ruin: 0, fire: 1 };
    const buildingTypes = Object.keys(Config.buildings).filter(id => !Config.buildings[id].pile && id !== 'hq' && id !== 'monument').sort();
    const state = { mode: 'place', type: sceneryTypes[0] || 'corpse', layer: null, drag: null, painting: false, hover: null, last: null };

    // ---- panel ----
    const panel = document.createElement('div');
    panel.id = 'storyEditor';
    panel.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;width:250px;background:rgb(20 20 24 / 92%);color:#ddd;font:12px sans-serif;padding:8px;border:1px solid #666;border-radius:6px;max-height:92vh;overflow:auto';
    const typeOptions = '<optgroup label="Kulisser">' + sceneryTypes.map(t => `<option value="s:${t}">${t}</option>`).join('') + '</optgroup><optgroup label="Döda byggnader">' + buildingTypes.map(t => `<option value="b:${t}">${t}</option>`).join('') + '</optgroup>';
    panel.innerHTML = `<b>Story-editor</b> <span id="seChapter"></span><br>
      <label><input type="radio" name="seMode" value="place" checked> Placera</label>
      <label><input type="radio" name="seMode" value="move"> Flytta / ta bort</label>
      <label><input type="radio" name="seMode" value="actor"> Skådespelare</label><br>
      <select id="seType" style="width:100%;margin:4px 0">${typeOptions}</select>
      Lager: <input id="seLayer" type="number" style="width:50px" placeholder="auto"> <label><input id="sePause" type="checkbox"> Pausa spelet</label><br>
      <div id="seActor" style="display:none;border-top:1px solid #555;margin-top:4px;padding-top:4px">
        Id: <input id="aeId" value="baker" style="width:70px"> Bild: <select id="aeImage" style="width:120px"></select><br>
        Ett klick på kartan: <select id="aeClick"><option value="start">sätter start</option><option value="walk">gå dit</option><option value="teleport">teleportera dit</option></select><br>
        Steg: <select id="aeStep"><option value="wait">wait (sekunder)</option><option value="vanish">vanish</option><option value="kill">kill (id)</option><option value="tell">tell (text)</option></select>
        <input id="aeValue" style="width:80px" placeholder="värde"> <button id="aeAdd">Lägg till</button>
        <div id="aeList" style="margin:4px 0;font:11px monospace;white-space:pre-wrap"></div>
        <button id="aeUndo">Ångra steg</button> <button id="aePlay">Spela upp</button> <button id="aeStop">Rensa uppspelning</button><br>
        <button id="aeSave" style="margin-top:3px">Spara skådespelare</button> <span id="aeSaved"></span>
      </div>
      <button id="seExport" style="margin:4px 0">Exportera</button> <button id="seClear" title="Tar bort alla kulisser i kapitlet">Rensa kulisser</button>
      <div id="seHover" style="color:#999"></div><div id="seInfo" style="color:#9ad;min-height:1.4em"></div>
      <textarea id="seOut" readonly style="width:100%;height:150px;display:none;font:11px monospace"></textarea>
      <div style="color:#999;margin-top:4px">Skift = styr kameran. Delete/högerklick tar bort (ångrar steg i skådespelarläget). Dra målar i placera-läget.</div>`;
    document.body.appendChild(panel);
    const $ = id => panel.querySelector('#' + id), info = text => { $('seInfo').textContent = text; };
    $('seType').value = 's:' + state.type;
    $('seType').onchange = event => { state.type = event.target.value; };
    $('seLayer').oninput = event => { state.layer = event.target.value === '' ? null : +event.target.value; };
    for (const radio of panel.querySelectorAll('input[name=seMode]')) radio.onchange = () => { state.mode = radio.value; $('seActor').style.display = state.mode === 'actor' ? 'block' : 'none'; };
    $('sePause').onchange = event => { C.Game.paused = event.target.checked; };
    const refreshChapter = () => { $('seChapter').textContent = Story.chapter ? `– kapitel ${Story.chapter.number}: ${Story.chapter.name}` : '(ingen story pågår)'; };
    refreshChapter(); setInterval(refreshChapter, 1500);

    // ---- hjälpare ----
    const hq = () => World.headquarters;
    const keyOf = (x, y) => Utils.tileKey(x, y);
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
    const editable = building => building && !building.removed && building.type !== 'hq' && !building.definition.pile;
    const buildingAt = (x, y) => { const building = World.buildingAt(x, y); return editable(building) ? building : null; };
    function placeBuilding(type, x, y, dead) {
      if (!World.canPlace(type, x, y)) { info(`${type} kan inte stå på ${x}, ${y}`); return null; }
      const building = World.placeBuilding(C.Construction.variantFor(type, x, y) || type, x, y, true, dead ? Story.deadOwner() : Players.HUMAN);
      return dead ? World.makeDead(building) : Story.ready(building);
    }
    const layerFor = type => state.layer ?? defaultLayer[type] ?? 0;
    const tileOf = event => Renderer.screenToTile(event.clientX, event.clientY);

    function put(tile) {
      const [kind, type] = state.type.split(':');
      if (kind === 's') addScenery(type, tile.x, tile.y, layerFor(type));
      else if (placeBuilding(type, tile.x, tile.y, true)) info(`Död ${type} på dx ${tile.x - hq().x}, dy ${tile.y - hq().y}`);
    }
    function removeAt(tile) {
      const items = sceneryOn(tile.x, tile.y), building = buildingAt(tile.x, tile.y);
      if (items.length) removeScenery(items[items.length - 1]);   // översta först
      else if (building) World.removeBuilding(building);
    }

    // ---- pekaren (fångas före spelets egna, utom när Skift hålls) ----
    const mine = event => !event.shiftKey && event.target === canvas && event.button !== 1;
    window.addEventListener('pointerdown', event => {
      if (!mine(event)) return;
      event.stopImmediatePropagation(); event.preventDefault();
      const tile = tileOf(event);
      if (state.mode === 'actor') { if (event.button === 2) actorUndo(); else actorClick(tile); return; }
      if (event.button === 2) { removeAt(tile); return; }
      if (state.mode === 'place') { state.painting = true; state.last = keyOf(tile.x, tile.y); put(tile); return; }
      const items = sceneryOn(tile.x, tile.y), building = buildingAt(tile.x, tile.y);
      if (items.length) state.drag = { item: items[items.length - 1] };
      else if (building) state.drag = { building };
      if (state.drag) { info(state.drag.item ? `Flyttar ${state.drag.item.type}` : `Flyttar ${state.drag.building.type}`); canvas.setPointerCapture(event.pointerId); }
    }, true);
    window.addEventListener('pointermove', event => {
      state.hover = event.target === canvas ? tileOf(event) : null;
      if (!state.painting || !event.buttons) return;
      const tile = tileOf(event), key = keyOf(tile.x, tile.y);
      if (key !== state.last && state.type.startsWith('s:')) { state.last = key; put(tile); }   // dra målar bara kulisser
    }, true);
    window.addEventListener('pointerup', event => {
      const drag = state.drag; state.drag = null; state.painting = false;
      if (!drag) return;
      event.stopImmediatePropagation();
      const tile = tileOf(event);
      if (drag.item) {
        const { type, layer } = drag.item; removeScenery(drag.item); addScenery(type, tile.x, tile.y, layer);
      } else {
        const { building } = drag, { type, dead } = building, from = { x: building.x, y: building.y };
        World.removeBuilding(building);
        if (!placeBuilding(type, tile.x, tile.y, dead)) placeBuilding(type, from.x, from.y, dead);   // går det inte, tillbaka
      }
    }, true);
    window.addEventListener('contextmenu', event => { if (event.target === canvas && !event.shiftKey) event.preventDefault(); }, true);
    window.addEventListener('keydown', event => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.mode !== 'actor' && state.hover && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { removeAt(state.hover); event.stopImmediatePropagation(); }
    }, true);
    // pekaren över panelen ska inte nå spelet
    for (const type of ['pointerdown', 'pointerup', 'wheel']) panel.addEventListener(type, event => event.stopPropagation());

    // ---- markör som följer rutan under pekaren ----
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;z-index:99998;pointer-events:none;border:2px solid #ffd54a;box-sizing:border-box;display:none';
    document.body.appendChild(ghost);
    (function follow() {
      const tile = state.hover, size = Renderer.tileSize * Renderer.zoom;
      if (tile) {
        ghost.style.display = 'block'; ghost.style.width = ghost.style.height = size + 'px';
        ghost.style.left = (tile.x * Renderer.tileSize - Renderer.camera.x) * Renderer.zoom + 'px';
        ghost.style.top = (tile.y * Renderer.tileSize - Renderer.camera.y) * Renderer.zoom + 'px';
        const base = hq(); if (base) $('seHover').textContent = `ruta ${tile.x}, ${tile.y}  (dx ${tile.x - base.x}, dy ${tile.y - base.y})`;
      } else ghost.style.display = 'none';
      requestAnimationFrame(follow);
    })();

    // ---- skådespelare ----
    const A = C.Actors, aeImages = [...new Set([
      ...Object.values(Config.units.worker?.imagesByBuilding || {}).flatMap(entry => [entry.image]),
      ...Object.values(Config.units).filter(unit => unit.isAnimal && unit.image).map(unit => unit.image),
      Config.units.carrier?.image,
    ].filter(Boolean))].sort();
    $('aeImage').innerHTML = aeImages.map(path => `<option value="${path}">${path.replace('images/units/', '').replace('.png', '')}</option>`).join('');
    const actor = { at: null, script: [] }, defs = [], marks = [];
    const targetOf = tile => {   // ett klick på en byggnad ger byggnadens id (hq = 'hq'), annars en ruta relativt basen
      const building = World.buildingAt(tile.x, tile.y);
      if (building && !building.removed) return building.type === 'hq' ? 'hq' : building.type;
      return [tile.x - hq().x, tile.y - hq().y];
    };
    const tileOfTarget = target => { const found = A.resolve(target, null); return found && { x: found.x, y: found.y }; };
    const stepText = step => { const [type, arg] = Object.entries(step)[0]; return `${type}${arg === true ? '' : ': ' + JSON.stringify(arg)}`; };
    const showActor = () => {
      $('aeList').textContent = (actor.at ? `start: ${JSON.stringify(actor.at)}\n` : 'ingen start vald\n') + actor.script.map((step, i) => `${i + 1}. ${stepText(step)}`).join('\n');
    };
    function actorClick(tile) {
      const kind = $('aeClick').value;
      if (kind === 'start') { actor.at = [tile.x - hq().x, tile.y - hq().y]; info('Start satt'); }
      else actor.script.push({ [kind]: targetOf(tile) });
      showActor();
    }
    function actorUndo() { if (actor.script.length) actor.script.pop(); else actor.at = null; showActor(); }
    $('aeAdd').onclick = () => {
      const type = $('aeStep').value, value = $('aeValue').value.trim();
      if (type === 'vanish') actor.script.push({ vanish: true });
      else if (type === 'wait') actor.script.push({ wait: +value || 1 });
      else if (type === 'kill') { if (value) actor.script.push({ kill: value }); }
      else if (type === 'tell') { if (value) actor.script.push({ tell: [{ who: 'narrator', text: value }] }); }
      showActor();
    };
    const current = () => ({ id: $('aeId').value.trim() || 'actor', image: $('aeImage').value, at: actor.at, script: actor.script.map(step => ({ ...step })) });
    const previews = []; let previewBase = 0;
    function stopPreview() {   // tar bort uppspelade skådespelare, deras blodpölar och att dialogerna lästs, så att inget följer med en sparning
      const progress = C.Levels.progressRef(), saved = progress.actors;
      for (const id of previews.splice(0)) {
        const data = A.data(id); if (data) A.remove(data);
        saved.list = saved.list.filter(item => item.id !== id);
        for (const key of Object.keys(progress.told)) if (key.startsWith(`read:${id}:`)) delete progress.told[key];
      }
      for (const item of saved.leftovers.splice(previewBase)) {
        const key = keyOf(item.x, item.y), rest = sceneryOn(item.x, item.y).filter(other => !(other.type === item.type && other.layer === item.layer));
        if (rest.length) World.scenery.set(key, rest); else World.scenery.delete(key);
        World.sceneryList = World.sceneryList.filter(other => !(other.x === item.x && other.y === item.y && other.type === item.type && other.layer === item.layer));
      }
    }
    $('aePlay').onclick = () => {
      const def = current(); if (!def.at) { info('Välj en start först (ett klick med "sätter start")'); return; }
      stopPreview(); previewBase = C.Levels.progressRef().actors.leftovers.length;
      for (const other of defs) if (other.id !== def.id) { A.spawn({ ...other, script: other.script }); previews.push(other.id); }   // sparade skådespelare spelas upp samtidigt (t.ex. ett byte att döda)
      A.spawn(def); previews.push(def.id); info(`Spelar upp ${def.id}`);
    };
    $('aeStop').onclick = () => { stopPreview(); info('Uppspelningen rensad'); };
    $('aeSave').onclick = () => {
      const def = current(); if (!def.at) { info('Välj en start först'); return; }
      const index = defs.findIndex(other => other.id === def.id); if (index >= 0) defs[index] = def; else defs.push(def);
      $('aeSaved').textContent = `Sparade: ${defs.map(other => other.id).join(', ')}`;
      actor.at = null; actor.script = []; $('aeId').value = ''; showActor();
    };
    showActor();
    // numrerade markörer för startrutan och stegens mål
    const markerBox = document.createElement('div'); markerBox.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:99997'; document.body.appendChild(markerBox);
    function drawMarks() {
      const wanted = [];
      if (state.mode === 'actor') {
        if (actor.at) wanted.push({ x: hq().x + actor.at[0], y: hq().y + actor.at[1], label: 'S' });
        actor.script.forEach((step, i) => { const [type, arg] = Object.entries(step)[0]; const tile = (type === 'walk' || type === 'teleport') && tileOfTarget(arg); if (tile) wanted.push({ ...tile, label: String(i + 1) }); });
      }
      while (marks.length < wanted.length) { const div = document.createElement('div'); div.style.cssText = 'position:absolute;background:rgb(255 213 74 / 85%);color:#000;font:bold 12px sans-serif;text-align:center;border-radius:50%'; markerBox.appendChild(div); marks.push(div); }
      marks.forEach((div, i) => {
        const mark = wanted[i]; div.style.display = mark ? 'block' : 'none'; if (!mark) return;
        const size = Math.max(14, Renderer.tileSize * Renderer.zoom * .5);
        div.textContent = mark.label; div.style.width = div.style.height = size + 'px'; div.style.lineHeight = size + 'px';
        div.style.left = ((mark.x + .5) * Renderer.tileSize - Renderer.camera.x) * Renderer.zoom - size / 2 + 'px';
        div.style.top = ((mark.y + .5) * Renderer.tileSize - Renderer.camera.y) * Renderer.zoom - size / 2 + 'px';
      });
    }
    (function loop() { drawMarks(); requestAnimationFrame(loop); })();

    // ---- export ----
    // Kulisser slås ihop till rektanglar per typ och lager: [typ, x, y, bredd, höjd, lager] (lager 0 utelämnas)
    function sceneryRows() {
      const groups = new Map();
      for (const item of World.sceneryList) {
        const id = item.type + '|' + item.layer; if (!groups.has(id)) groups.set(id, new Set());
        groups.get(id).add(`${item.x},${item.y}`);
      }
      const rows = [];
      for (const [id, cells] of groups) {
        const [type, layer] = id.split('|'), tiles = [...cells].map(text => text.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        const runs = [];   // vågräta följder
        for (const [x, y] of tiles) {
          const last = runs[runs.length - 1];
          if (last && last.y === y && last.x + last.w === x) last.w++; else runs.push({ x, y, w: 1, h: 1 });
        }
        const merged = [];   // lodrätt: samma x och bredd på raden under
        for (const run of runs) {
          const above = merged.find(other => other.x === run.x && other.w === run.w && other.y + other.h === run.y);
          if (above) above.h++; else merged.push(run);
        }
        for (const { x, y, w, h } of merged) rows.push({ type, layer: +layer, text: +layer ? `["${type}", ${x}, ${y}, ${w}, ${h}, ${layer}]` : (w > 1 || h > 1 ? `["${type}", ${x}, ${y}, ${w}, ${h}]` : `["${type}", ${x}, ${y}]`) });
      }
      return rows.sort((a, b) => a.layer - b.layer || a.type.localeCompare(b.type)).map(row => row.text);
    }
    function exportText() {
      const base = hq(), list = World.buildings.filter(building => editable(building) && building.buildProgress >= 1 && (building.player === Players.HUMAN || building.dead)).sort((a, b) => a.y - b.y || a.x - b.x);
      const eye = list.find(building => building.type === 'eye_of_shades' && !building.dead);
      const row = building => `{ type: '${building.type}', dx: ${building.x - base.x}, dy: ${building.y - base.y}${building.dead ? ', dead: true' : ''} }`;
      let text = `scenery: [\n${sceneryRows().map(line => '\t' + line + ',').join('\n')}\n],\n`;
      text += `start: { buildings: [\n${list.filter(building => building !== eye).map(building => '\t' + row(building) + ',').join('\n')}\n] },`;
      if (eye) text += `\neye: { dx: ${eye.x - base.x}, dy: ${eye.y - base.y} },`;
      const all = [...defs]; { const open = current(); if (open.at && !all.some(other => other.id === open.id)) all.push(open); }
      if (all.length) {
        const step = item => { const [type, arg] = Object.entries(item)[0]; return type === 'tell' ? `{ tell: [${arg.map(line => `say(${JSON.stringify(line.who)}, ${JSON.stringify(line.text)})`).join(', ')}] }` : `{ ${type}: ${arg === true ? 'true' : JSON.stringify(arg)} }`; };
        text += `\n// Skådespelare: klistra in som spawn i en händelse\nspawn: [\n${all.map(def => `\t{ id: ${JSON.stringify(def.id)}, image: ${JSON.stringify(def.image)}, at: ${JSON.stringify(def.at)}, script: [${def.script.map(step).join(', ')}] },`).join('\n')}\n],`;
      }
      return text;
    }
    $('seExport').onclick = () => {
      const text = exportText(), out = $('seOut'); out.style.display = 'block'; out.value = text; out.select();
      navigator.clipboard?.writeText(text).then(() => info('Kopierat till urklipp'), () => info('Markera texten och kopiera'));
      console.log(`Chapter ${Story.chapter?.number}:\n${text}`);
    };
    $('seClear').onclick = () => { World.scenery.clear(); World.sceneryList = []; info('Alla kulisser borttagna (ladda om kapitlet för att få tillbaka dem)'); };
    window.StoryEditor = { export: exportText, state };
  }
})();
