/* Skådespelare (actors): enheter som berättelsen styr. En skådespelare tillhör ingen (NEUTRAL): fiender ser den inte, väder och strid rör den inte,
   jägare jagar den inte, och den ritas bara när spelaren ser rutan där den står. Den räknas aldrig som arbetare, bärare eller soldat.

   Allt är data (inga funktioner) så att det går att spara: skådespelarnas tillstånd ligger i Levels-framstegen (progress.actors) och byggs upp igen vid inläsning.
   Motorn har två tabeller, och nya saker läggs till genom att skriva en post i dem:

   Actions  (vad en skådespelare gör, en i taget ur dess manus). Varje post har start(actor, arg) och update(actor, arg, dt) som ger true när handlingen är klar:
     walk: mål            går dit (teleporterar efter en tidsgräns eller om vägen saknas, så att berättelsen aldrig fastnar)
     wait: sekunder       väntar
     teleport: mål        flyttar direkt
     vanish: true         försvinner direkt
     say: text | { text, for: sekunder, wait: true, speaker: id, voice: false }   pratbubbla ovanför huvudet (fast storlek, i vägen för ingenting). Har skådespelaren en talare i
                          Config.story.speakers (samma id, samma namn som bildfilen, eller speaker) skrivs texten ut med dess röst (voice: false stänger av). for = sekunder kvar efter sista tecknet (utan värde räknas tiden efter textens längd, se Bubbles.stay).
                          Manuset går vidare direkt, eller med wait: true först när bubblan är borta (räknat från att den syns)
     follow: true         (på ett walk-steg) kameran följer skådespelaren medan den går. together: true på ett say-steg = den pratar medan den gör sitt förra steg (t.ex. går)
     leave: true          går mot närmaste ruta som spelaren inte ser (dimman) och försvinner när den inte syns längre
     kill: id | { actor: id, leave: 'blood' | 'corpse' | 'skeleton' | ['blood','corpse'] | 'none' }
                          en annan skådespelare dör och ersätts av en kuliss (blodpöl som standard)
     tell: [dialograder]  visar en dialog och väntar tills den lästs
     Scener: event.scene = [ { spawn: spec }, { who: id, walk: mål }, { tell: [rader] }, { wait: s }, { camera: mål, zoom: 1-5 (valfritt) }, ... ]. Stegen sker i ordning, ett i taget (together: true på ett steg = det börjar samtidigt som förra steget, och nästa steg väntar på båda).
     Grupp: spawn med count: n skapar n st (id#1 ... id#n) på samma ruta. Ett steg med gruppens id gäller alla: de går med en kort fördröjning var (ett led) och slutar på samma ruta (högst 20 per ruta, resten på rutorna runt); bara den första talar.
     Steg utan person (hela scenen): letter: { lines, signature | throne, greeting } (brev, scenen väntar tills det läses), music: spec | null, give: { resurs: n }, weather: 'rain', tornado: radie, super: radie, meteors: sekunder (+ where: mål),
                          meteor: { at, radius (slumpad ruta inom den), big: true } (en enda meteor, utan varning),
                          ground: { at, radius, share, to: 'grass' | 'dirt' | 'sand' } (marken), terrain: { at, radius, share, to: terrängtyp (utan = behåll), amount } (träd, malm, berg ... på marken; to: 'grass' = tom),
                          scenery: { at, radius, share, add: typ, layer, turn (0-3 kvarts varv medurs), flip (true = spegla) } eller { at, radius, remove: typ | 'all' } (kulisser)
     fire: händelse       kör en vanlig händelse (give, weather, ...) en gång
   Mål (walk, teleport, spawn.at): [dx, dy] (rutor från spelarens HQ), 'hq', ett byggnads-id ('bakery' = närmaste), ett skådespelar-id, { x, y } (absolut ruta),
     { building: 'bakery' }, { actor: 'baker' }.

   Triggers (villkor i en händelses when, slås ihop med de vanliga). Varje post är (värde, villkor) => true/false:
     { arrived: id }      skådespelaren har gått färdigt sin senaste promenad
     { arrivedSeen: id }  ...och spelaren ser den just nu
     { seen: id }         spelaren ser den just nu
     { gone: id }         den har försvunnit eller dött
     { killed: id }       den har dödats av en annan skådespelare
     { near: id, of: mål, radius }  skådespelaren är inom radius rutor (standard 3) från målet
     { read: 'händelse-id' }  dialogen i händelsen med id: 'händelse-id' är läst
     { scene: 'id' }      en annan scen (händelsens id) har spelats klart
     { told: 'nyckel' }   en nyckel i Levels.told

   I kapitlets events: spawn: { id, image, race ('demon' = demonernas version av bilden), frame, size, speed, at, script: [...] } (eller en lista av dem) skapar skådespelare, act: { id: [manus] } byter manus. */
(function (CityBuilder) {
  'use strict';
  const { World, Config, Players, Utils, Jobs } = CityBuilder;

  const LEAVE_LAYER = { blood: 0, corpse: 1, skeleton: 1 };
  const layerOf = type => LEAVE_LAYER[type] ?? (/^(corpse|skeleton)\d*$/.test(type) ? 1 : 0);   // lik och skelett ligger ovanpå blod, även de enskilda bilderna (corpse3, skeleton1)
  const EFFECTS = ['music', 'give', 'weather', 'tornado', 'super', 'meteors', 'meteor', 'ground', 'terrain', 'scenery'];   // steg utan person (se effect)
  const GROUP_GAP = .1, GROUP_MAX = 100, PER_TILE = 20;   // grupp: sekunder mellan två medlemmars start, högst så många på en ruta (resten flödar över till rutorna runt)
  // Rutorna kring målet i den ordning de fylls: målrutan först, sedan de närmaste
  const TILE_ORDER = (() => { const list = []; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) list.push([dx, dy]); return list.sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1] || a[1] - b[1] || a[0] - b[0]); })();
  const SPOT_COLS = 5, SPOT_STEP = .17;   // platserna på en ruta: ett litet rutnät, så att ingen står på exakt samma pixel
  const slotOf = nth => {
    const i = nth - 1, tile = TILE_ORDER[Math.floor(i / PER_TILE)], k = i % PER_TILE, rows = Math.ceil(PER_TILE / SPOT_COLS);
    return [tile[0] + (k % SPOT_COLS - (SPOT_COLS - 1) / 2) * SPOT_STEP, tile[1] + (Math.floor(k / SPOT_COLS) - (rows - 1) / 2) * SPOT_STEP];
  };
  const frac = x => x - Math.floor(x);
  const STUCK_BASE = 15, STUCK_PER_TILE = 1.5;   // sekunder innan en promenad ger upp och teleporterar

  const levels = () => CityBuilder.Levels;
  const state = () => {   // framstegens del för skådespelare: { list: [data], leftovers: [{ type, x, y, layer }] }
    const progress = levels().progressRef?.();
    if (!progress) return { list: [], leftovers: [] };
    return progress.actors || (progress.actors = { list: [], leftovers: [] });
  };

  const Actors = {
    units: new Map(),   // id -> enheten i världen (inte sparad; byggs upp av rebuild)
    ctxUnits: new Map(),   // scen-id -> enheten som utlöste scenen (inte sparad; efter en inläsning letar pick: 'trigger' upp den närmaste av samma slag vid samma plats)

    // ---- uppslag ----
    data: id => state().list.find(item => item.id === id),
    members: id => state().list.filter(item => item.group === id && !item.gone),   // en grupp (spawn med count) är id#1 ... id#n
    unitOf(id) { const unit = this.units.get(id); return unit && !unit.removed ? unit : null; },
    hq: () => World.headquarters,

    // Ett mål som ruta { x, y, kind } (kind: 'tile' | 'building' | 'actor'), eller null. from: vem som frågar (för "närmaste byggnad")
    resolve(target, from) {
      const hq = this.hq();
      if (target === undefined || target === null) return null;
      if (Array.isArray(target)) return hq ? { x: hq.x + target[0], y: hq.y + target[1], kind: 'tile' } : null;
      if (typeof target === 'string') {
        if (target === 'hq') return hq ? { x: hq.x, y: hq.y, kind: 'building' } : null;
        if (state().list.some(item => item.id === target)) return this.resolve({ actor: target }, from);
        return this.resolve({ building: target }, from);
      }
      if (target.actor !== undefined) {
        const key = this.data(target.actor) ? target.actor : this.members(target.actor)[0]?.id ?? target.actor;   // en grupp: den första i den
        const unit = this.unitOf(key), data = this.data(key);
        if (unit) return { x: Math.floor(unit.x), y: Math.floor(unit.y), kind: 'actor' };
        return data && !data.gone ? { x: Math.floor(data.x), y: Math.floor(data.y), kind: 'actor' } : null;
      }
      if (target.building !== undefined) {
        const fx = from ? from.x : hq?.x ?? 0, fy = from ? from.y : hq?.y ?? 0;
        let best = null, bestDistance = Infinity;
        for (const building of World.buildings) {
          if (building.removed || building.type !== target.building || building.buildProgress < 1) continue;
          const distance = Utils.distance(building.x - fx, building.y - fy);
          if (distance < bestDistance) { bestDistance = distance; best = building; }
        }
        return best ? { x: best.x, y: best.y, kind: 'building' } : null;
      }
      if (target.x !== undefined) return { x: target.x, y: target.y, kind: 'tile' };
      if (target.at) return this.resolve(target.at, from);
      return null;
    },

    // ---- skapa, spara, bygga upp ----
    spawn(spec) {
      if (spec?.id && spec.count > 1) {   // en grupp: count st med samma utseende, id#1 ... id#n. Alla börjar på samma ruta och slutar på samma ruta (högst 20 per ruta, resten flödar över till rutorna runt)
        const n = Math.min(GROUP_MAX, spec.count | 0);
        for (let i = 1; i <= n; i++) this.spawn({ ...spec, count: undefined, id: `${spec.id}#${i}`, group: spec.id, nth: i, slot: slotOf(i) });
        return this.data(`${spec.id}#1`);
      }
      if (!spec?.id || this.data(spec.id) && !this.data(spec.id).gone) return null;
      const from = this.resolve(spec.at ?? 'hq');
      if (!from) { console.warn(`Actors: spawn ${spec.id} has no valid position`); return null; }
      const at = from.kind === 'building' ? { x: from.x, y: from.y + 1 } : from;
      const data = {
        group: spec.group, nth: spec.nth, slot: spec.slot, gap: spec.gap,
        id: spec.id, image: spec.image, race: spec.race, frame: spec.frame, size: spec.size, speed: spec.speed, faces: spec.faces,
        x: at.x + .5, y: at.y + .5, script: spec.script || [], index: 0, act: null, arrived: false, gone: false, killed: false,
      };
      const list = state().list.filter(item => item.id !== spec.id);   // en gammal, försvunnen med samma id ersätts
      list.push(data); state().list = list;
      this.build(data);
      return data;
    },
    // Enheten för en skådespelares data (vid spawn och när en sparning läses in)
    build(data) {
      if (data.gone) return null;
      const unit = World.spawnUnit('actor', Math.floor(data.x), Math.floor(data.y), null, Players.NEUTRAL);
      unit.x = data.x; unit.y = data.y; unit.actor = data.id; unit.px = unit.x; unit.py = unit.y;
      unit.definition = { ...Config.units.actor };
      if (data.image) unit.definition.image = data.image;
      if (data.race) unit.definition.race = data.race;   // 'demon': samma bildfil hämtas ur demonmappen (images/units/demon/...)
      if (data.frame) unit.definition.frame = data.frame;
      if (data.size) unit.definition.imageSize = data.size;
      if (data.speed) unit.definition.speedMultiplier = data.speed;
      if (data.faces !== undefined) unit.definition.imageFacesLeft = data.faces === 'left';
      if (data.group) {   // fast egen linje i rutan (som soldaterna, se Units.walk) och en egen plats vid målet: ingen jämförelse mellan enheter behövs
        unit.laneX = (frac(data.nth * .618034) - .5) * .3; unit.laneY = (frac(data.nth * .754877) - .5) * .3;
        unit.slotX = data.slot?.[0] || 0; unit.slotY = data.slot?.[1] || 0;
      }
      this.units.set(data.id, unit);
      return unit;
    },
    // Efter att världen byggts (ny start eller inläsning): enheterna skapas från de sparade uppgifterna och kvarlämnade kulisser läggs tillbaka
    rebuild() {
      this.units = new Map();
      const saved = state();
      for (const scene of saved.scenes || []) for (const run of scene.running) if (run.kind === 'tell' && !levels().told(run.mark)) { const i = +run.mark.split(':').pop(); CityBuilder.Story.tell([{ type: 'dialogue', lines: scene.steps[i].tell, part: 'events', mark: run.mark }]); }
      for (const data of saved.list) if (!data.gone) { data.act = data.act && data.act.type ? { ...data.act, started: false } : null; this.build(data); }
      for (const item of saved.cleared || []) World.removeScenery(item.x, item.y, item.type);   // bortplockade kulisser (kapitlets egna) först, sedan det som lagts till
      for (const item of saved.leftovers) World.addScenery(item.type, item.x, item.y, item.layer, item.turn, item.flip);
    },

    // Byter manus (en händelse med act) eller sätter ett nytt
    setScript(id, script) {
      const data = this.data(id);
      if (!data || data.gone) return;
      data.script = script || []; data.index = 0; data.act = null;
    },

    // ---- scener: en lista steg som sker i ordning (en dirigent, ingen skådespelare äger scenen) ----
    // scene: [ { spawn: spec }, { who: id, walk: mål }, { tell: [rader] }, { wait: s }, { who: id, say: ... } ... ]
    // Ett steg börjar när det förra är klart. Dialoger hör till scenen, inte till en person.
    startScene(id, steps, ctx, cast) {
      const progress = levels().progressRef?.(); if (!progress) return;
      const saved = state(); (saved.scenes ||= []);
      if (saved.scenes.some(scene => scene.id === id)) return;
      for (const key of Object.keys(progress.told)) if (key.startsWith(`scene:${id}:`)) delete progress.told[key];   // en upprepad scen börjar om: dialogerna får läsas igen
      // ctx: vad som utlöste scenen (händelsebussen, systems/story.js). Det som sparas är bara det enkla; själva enheten ligger i ctxUnits
      saved.scenes.push({ id, steps: JSON.parse(JSON.stringify(steps)), index: 0, running: [], cast: [...(cast || [])], ctx: ctx ? { x: ctx.x, y: ctx.y, side: ctx.side, kind: ctx.kind, resource: ctx.resource, type: ctx.type } : undefined });
      const subject = ctx?.unit || ctx?.building;   // en enhet, eller en byggnad (t.ex. när något tillverkats)
      if (subject) this.ctxUnits.set(id, subject); else this.ctxUnits.delete(id);
    },
    // Platsen för det som utlöste scenen ({ trigger: true } som mål): enheten om den finns kvar, annars där det hände. null = scenen utlöstes inte av en händelse
    triggerSpot(scene) {
      const unit = this.ctxUnits.get(scene.id);
      if (unit && !unit.removed) return { x: Math.floor(unit.x), y: Math.floor(unit.y) };
      return scene.ctx?.x !== undefined ? { x: scene.ctx.x, y: scene.ctx.y } : null;
    },
    // En enhet i spelet som en scen pekar ut (who: { pick: 'trigger' | 'nearest' | 'random', side, kind, near }). Bara enheter som spelaren ser kommer i fråga. null = ingen passar (steget faller då tillbaka på sitt alternativ, otherwise)
    pickUnit(selector, scene) {
      const Story = CityBuilder.Story, Vision = CityBuilder.Vision, ctx = scene.ctx || {};
      // Utlöstes scenen av en byggnad (tillverkat, byggt...) och inget slag är valt: en av dess arbetare talar, annars byggnaden själv (bubblan står över den)
      const subject = selector.pick === 'trigger' ? this.ctxUnits.get(scene.id) : null;
      if (subject?.buildProgress !== undefined && !subject.removed && (!selector.kind || selector.kind === 'building') && (!selector.side || selector.side === Story.sideOf(subject))) {
        const worker = World.units.find(unit => !unit.removed && !unit.actor && unit.homeBuilding === subject && Vision.sees(Players.HUMAN, unit));
        return worker || { x: subject.x + .5, y: subject.y + .5, removed: false };
      }
      const side = selector.side || (selector.pick === 'trigger' && ctx.kind !== 'building' ? ctx.side : undefined) || 'any', kind = selector.kind || (selector.pick === 'trigger' && ctx.kind !== 'building' ? ctx.kind : undefined) || 'any';
      const fits = unit => !unit.removed && !unit.actor && Story.sideOf(unit) !== undefined && (side === 'any' || Story.sideOf(unit) === side) && (kind === 'any' || Story.kindOf(unit) === kind) && Vision.sees(Players.HUMAN, unit);
      const direct = selector.pick === 'trigger' ? this.ctxUnits.get(scene.id) : null;
      if (direct && fits(direct)) return direct;
      const anchor = selector.pick === 'trigger' ? (ctx.x !== undefined ? { x: ctx.x, y: ctx.y } : null) : selector.near ? this.resolve(selector.near, null) : this.hq();
      let best = null, bestDistance = Infinity, count = 0;
      for (const unit of World.units) {
        if (!fits(unit)) continue;
        if (selector.pick === 'random') { if (Utils.random() * ++count < 1) best = unit; continue; }
        const distance = anchor ? Utils.distance(unit.x - anchor.x - .5, unit.y - anchor.y - .5) : 0;
        if (distance < bestDistance) { bestDistance = distance; best = unit; }
      }
      return best;
    },
    sceneDone(scene, run, dt) {
      if (run.kind === 'wait') return (run.left -= dt) <= 0;
      if (run.kind === 'tell') return levels().told(run.mark);
      if (run.kind === 'bubble') return !!run.handle?.done || (run.left -= dt) <= 0;
      const data = this.data(run.who);
      return !data || data.gone || (!data.act && data.index >= data.script.length);
    },
    // Skyddsnät: en scen som hänger sig nollställs. Hänger sig = ingen skådespelare har rört sig eller gått vidare på stallSeconds sekunder (en dialog som spelaren läser räknas inte), eller scenen har pågått orimligt länge.
    // Då tas alla som scenen skapat bort, resten av scenen hoppas över och scenen räknas som klar, så att inget står kvar och väntar och det som väntar på scenen kan gå vidare.
    stallSeconds: 40, maxSceneSeconds: 900,
    watch(scene, dt) {
      const runs = scene.running;
      if (runs.some(run => run.kind === 'tell')) { scene.stall = 0; return false; }
      scene.age = (scene.age || 0) + dt;
      let sig = '';
      for (const run of runs) {
        if (run.kind !== 'actor') { sig = null; break; }   // en väntan eller bubbla tar slut av sig själv
        const data = this.data(run.who);
        sig += `${run.who}:${data ? `${Math.floor(data.x)},${Math.floor(data.y)},${data.index}` : 'x'};`;
      }
      if (sig === null || !runs.length) scene.stall = 0; else if (sig !== scene.sig) { scene.sig = sig; scene.stall = 0; } else scene.stall = (scene.stall || 0) + dt;
      if (scene.stall <= this.stallSeconds && scene.age <= this.maxSceneSeconds) return false;
      console.warn(`Actors: scenen '${scene.id}' hängde sig och nollställdes.`);
      for (const id of scene.cast || []) for (const data of [this.data(id), ...this.members(id)]) if (data && !data.gone) this.remove(data);
      for (const run of runs) if (run.kind === 'actor') { const data = this.data(run.who); if (data && !data.gone) this.remove(data); }
      scene.running = []; scene.index = scene.steps.length;
      return true;
    },
    // Steg som inte rör någon person: musik, varor, väder, tornado, superstorm, meteorer, och ändringar av världen (mark, terräng/resurs, kulisser).
    // Ändringar av världen: { ground | terrain | scenery: { at: mål, radius: rutor (0 = en ruta), share: % av rutorna (standard 100), ... } }. Returnerar false om steget inte gick att göra.
    effect(step, scene, i) {
      const Story = CityBuilder.Story;
      if (step.music !== undefined) { levels().progressRef().told[`scene:${scene.id}:${i}:music`] = true; return true; }   // Story.update läser av dem
      for (const key of ['give', 'weather', 'tornado', 'super', 'meteors']) if (step[key] !== undefined) { Story.fire({ [key]: step[key], where: step.where }, scene.ctx); return true; }
      if (step.meteor) {   // en enda meteor: { at, radius (slumpad ruta inom den), big }
        const hit = this.resolve(step.meteor.at?.trigger ? this.triggerSpot(scene) : step.meteor.at, null);
        if (!hit) return false;
        const angle = Utils.random() * Math.PI * 2, reach = (+step.meteor.radius || 0) * Math.sqrt(Utils.random());
        CityBuilder.Weather.dropMeteorAt(hit.x + Math.cos(angle) * reach, hit.y + Math.sin(angle) * reach, step.meteor.big);
        scene.running.push({ kind: 'wait', left: CityBuilder.Config.settings.weather.meteor.fall });   // nästa steg väntar tills meteoren har landat
        return true;
      }
      const spec = step.ground || step.terrain || step.scenery || {}, tile = this.resolve(spec.at?.trigger ? this.triggerSpot(scene) : spec.at, null);
      if (!tile) return false;
      const radius = Math.max(0, +spec.radius || 0), share = spec.share === undefined ? 100 : +spec.share, tiles = [];
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) if (Utils.distance(dx, dy) <= radius + .01 && (share >= 100 || Utils.random() * 100 < share)) tiles.push({ x: tile.x + dx, y: tile.y + dy });
      if (step.ground) {   // marken: gräs, jord eller sand (vatten rörs inte)
        if (!['grass', 'dirt', 'sand'].includes(spec.to)) return false;
        for (const { x, y } of tiles) { const here = World.getTile(x, y); if (here && here.terrainType !== 'water') here.ground = spec.to; }
      } else if (step.terrain) {   // det som ligger på marken: träd, buskar, malm, berg ... (samma sak som när en samlare tömmer en ruta eller en formel skapar en fyndighet)
        const type = spec.to || null, kind = type && Config.terrain[type];
        if (type && (!kind || ['water', 'dirt', 'lava'].includes(type))) return false;
        for (const { x, y } of tiles) {
          const here = World.getTile(x, y);
          if (!here || here.terrainType === 'water' || World.buildingAt(x, y)) continue;
          let next = type || here.terrainType;
          const amount = spec.amount === undefined || spec.amount === '' ? Config.terrain[next].resourceAmount || 0 : Math.max(0, Math.floor(+spec.amount) || 0);
          if (next !== 'grass' && Config.terrain[next].resourceAmount && amount <= 0) next = 'grass';   // slut: blir gräs, och bar jord där det grävts
          if (next === 'grass' && Config.exposesDirt.has(here.terrainType)) here.ground = 'dirt';
          Utils.assign(here, Config.terrain[next], { terrainType: next, remainingAmount: next === 'grass' ? 0 : amount, wear: 0 });
        }
      } else if (step.scenery) {
        const saved = state();
        if (spec.add) {
          if (!CityBuilder.Config.story.sceneryTypes?.[spec.add]) return false;
          for (const { x, y } of tiles) {
            if (World.scenery.get(Utils.tileKey(x, y))?.some(item => item.type === spec.add)) continue;
            const item = { type: spec.add, x, y, layer: +spec.layer || layerOf(spec.add), ...(spec.turn & 3 ? { turn: spec.turn & 3 } : {}), ...(spec.flip ? { flip: true } : {}) };
            saved.leftovers.push(item); World.addScenery(item.type, item.x, item.y, item.layer, item.turn, item.flip);
          }
        } else {
          const type = spec.remove && spec.remove !== 'all' ? spec.remove : null;
          for (const { x, y } of tiles) if (World.removeScenery(x, y, type)) { (saved.cleared ||= []).push({ x, y, type }); saved.leftovers = saved.leftovers.filter(item => !(item.x === x && item.y === y && (!type || item.type === type))); }
        }
      }
      CityBuilder.Pathfinder?.clearCache();
      return true;
    },

    // En pratbubbla över skådespelaren utan att röra dess manus (så att den kan tala medan den går). Rösten: speaker i steget, annars skådespelarens id, annars bildfilens namn (images/units/pipwick.png -> pipwick, så 'pipwick1' också låter som Pipwick; en grupp som thordramandalbertha låter som den första)
    sayNow(data, unit, spec) {
      const speakers = CityBuilder.Config.story.speakers, byImage = (data.image || '').replace(/^.*\//, '').replace(/\.png$/, '');
      const speaker = spec.voice === false ? null : spec.speaker || [data.id, byImage, ...byImage.split('and')].find(name => speakers[name]) || null;
      return CityBuilder.Bubbles?.say(unit, spec.text, spec.for, null, speaker);
    },
    updateScenes(dt) {
      for (const scene of state().scenes || []) {
        scene.running = scene.running.filter(run => !this.sceneDone(scene, run, dt));
        for (const run of scene.running) if (run.follow) { const unit = this.unitOf(run.who); if (unit) CityBuilder.Game.follow(unit.x, unit.y, dt); }   // walk med follow: kameran följer med
        if (this.watch(scene, dt)) continue;
        let guard = 0;
        while ((!scene.running.length || scene.steps[scene.index]?.together) && scene.index < scene.steps.length && guard++ < 100) {   // together: true = börjar direkt, utan att vänta på förra steget
          {
            const step = scene.steps[scene.index], i = scene.index++;
            let failed = false;   // kunde steget inte göras? Då körs dess otherwise (ett alternativt flöde) i stället
            if (step.camera !== undefined) { const tile = this.resolve(step.camera?.trigger ? this.triggerSpot(scene) : step.camera, null); if (tile) { CityBuilder.Game.scrollTo(Math.floor(tile.x), Math.floor(tile.y), true, step.zoom); scene.running.push({ kind: 'wait', left: .8 }); } else failed = true; }
            else if (step.spawn) { const spot = step.spawn.at?.trigger ? this.triggerSpot(scene) : null, made = step.spawn.at?.trigger && !spot ? null : this.spawn({ ...step.spawn, ...(spot ? { at: spot } : {}), script: [] }); failed = !made && !this.data(step.spawn.id); if (!failed) (scene.cast ||= []).push(step.spawn.id); }
            else if (step.tell) { const mark = `scene:${scene.id}:${i}`; if (!levels().told(mark)) { CityBuilder.Story.tell([{ type: 'dialogue', lines: step.tell, part: 'events', mark }]); scene.running.push({ kind: 'tell', mark }); } }
            else if (step.wait !== undefined && !step.who) scene.running.push({ kind: 'wait', left: +step.wait || 0 });
            else if (step.letter) { const mark = `scene:${scene.id}:${i}`; if (!levels().told(mark)) { CityBuilder.Story.tell([{ type: 'letter', letter: step.letter, mark }]); scene.running.push({ kind: 'tell', mark }); } }   // ett brev: scenen väntar tills det är läst
            else if (!step.who && EFFECTS.some(key => step[key] !== undefined)) failed = !this.effect(step, scene, i);   // effekter och ändringar av världen
            else if (step.who && typeof step.who === 'object') {   // en enhet i spelet, utpekad av en regel: den kan bara säga något
              const unit = step.say !== undefined ? this.pickUnit(step.who, scene) : null;
              if (unit) {
                const spec = typeof step.say === 'string' ? { text: step.say } : step.say, handle = CityBuilder.Bubbles?.say(unit, spec.text, spec.for, null, spec.voice === false ? null : spec.speaker || null);
                if (handle && spec.wait !== false) scene.running.push({ kind: 'bubble', left: 60, handle });
              } else failed = true;
            }
            else {
              const [type] = Object.entries(step).find(([key]) => key !== 'who' && Actions[key]) || [], one = this.data(step.who);
              // Ett steg för en grupp gäller alla i den: de går och lämnar med en liten fördröjning var (ett led), bara den första talar
              let started = 0;
              const target = type === 'walk' && step.walk?.trigger ? this.triggerSpot(scene) : step[type];   // { trigger: true } = dit det som utlöste scenen hände
              const unreachable = type === 'walk' && !this.resolve(target, null);   // målet finns inte (t.ex. en byggnad som inte är byggd): steget går inte att göra
              for (const data of type && !unreachable ? one ? [one] : this.members(step.who) : []) {
                if (data.gone || (data.group && type === 'say' && data.nth > 1)) continue;
                if (type === 'say' && step.together) {   // talar medan den gör något annat (t.ex. går): bubblan läggs över, manuset rörs inte
                  const unit = this.unitOf(data.id), spec = typeof target === 'string' ? { text: target } : target, handle = unit && this.sayNow(data, unit, spec);
                  if (!unit) continue;
                  if (handle && spec.wait) scene.running.push({ kind: 'bubble', left: 60, handle });
                  started++; continue;
                }
                const delay = data.group && (type === 'walk' || type === 'leave') ? (data.nth - 1) * (data.gap ?? GROUP_GAP) : 0;
                this.setScript(data.id, delay ? [{ wait: delay }, { [type]: target }] : [{ [type]: target }]);
                scene.running.push({ kind: 'actor', who: data.id, follow: type === 'walk' && step.follow && !started ? true : undefined }); started++;
              }
              if (type && (!started || unreachable)) failed = true;
            }
            if (failed && step.otherwise?.length) scene.steps.splice(scene.index, scene.steps.length, ...JSON.parse(JSON.stringify(step.otherwise)));   // det alternativa flödet ersätter resten av scenen
          }
        }
      }
      const saved = state();
      if (saved.scenes) saved.scenes = saved.scenes.filter(scene => { const going = scene.index < scene.steps.length || scene.running.length; if (!going) levels().markTold(`scene:${scene.id}:done`); return going; });   // en klar scen märks (villkoret { scene: id })
    },

    // ---- själva uppdateringen ----
    update(deltaSeconds) {
      this.updateScenes(deltaSeconds);
      for (const data of state().list) {
        if (data.gone) continue;
        const unit = this.unitOf(data.id);
        if (!unit) { data.gone = true; continue; }   // enheten försvann av annan orsak
        data.x = unit.x; data.y = unit.y;
        if (!data.act) {
          const entry = data.script[data.index];
          if (!entry) continue;
          const [type, arg] = Object.entries(entry)[0];
          if (!Actions[type]) { console.warn(`Actors: unknown action '${type}' for ${data.id}`); data.index++; continue; }
          data.act = { type, arg, started: false, elapsed: 0 };
        }
        const action = Actions[data.act.type], act = data.act;
        if (!act.started) { act.started = true; action.start?.(data, act.arg, act, unit); }
        if (data.act !== act) continue;   // handlingen bytte manus
        act.elapsed += deltaSeconds;
        if (action.update ? action.update(data, act.arg, deltaSeconds, act, unit) : true) { if (data.act === act) { data.act = null; data.index++; } }
      }
    },

    // Händelser i kapitlet: spawn och act
    fire(event, ctx) {
      for (const spec of [].concat(event.spawn || [])) this.spawn(spec);
      if (event.scene) this.startScene(event.id || 'scene' + Date.now(), event.scene, ctx, [].concat(event.spawn || []).map(spec => spec.id));
      for (const [id, script] of Object.entries(event.act || {})) this.setScript(id, script);
    },

    remove(data) {
      const unit = this.unitOf(data.id);
      if (unit) { unit.removed = true; World.units = World.units.filter(other => other !== unit); }
      this.units.delete(data.id);
      data.gone = true; data.act = null;
    },
    leave(types, x, y) {   // kvarlämnade kulisser (sparas)
      for (const type of [].concat(types)) {
        if (!LEAVE_LAYER.hasOwnProperty(type)) continue;
        const item = { type, x: Math.floor(x), y: Math.floor(y), layer: LEAVE_LAYER[type] };
        state().leftovers.push(item); World.addScenery(item.type, item.x, item.y, item.layer);
      }
    },
  };

  // ---- handlingar ----
  const place = (unit, data, tile) => {   // flytta direkt (en byggnad: rutan nedanför)
    const x = tile.kind === 'building' ? tile.x : tile.x, y = tile.kind === 'building' ? tile.y + 1 : tile.y;
    unit.x = x + .5; unit.y = y + .5; unit.px = unit.x; unit.py = unit.y; unit.stepQueue.length = 0; data.x = unit.x; data.y = unit.y;
  };

  const Actions = {
    walk: {
      start(data, arg, act, unit) {
        const tile = Actors.resolve(arg, { x: Math.floor(unit.x), y: Math.floor(unit.y) });
        data.arrived = false;
        if (!tile) { console.warn(`Actors: ${data.id} cannot find walk target`, arg); act.skip = true; return; }
        act.tile = tile; act.limit = STUCK_BASE + Utils.distance(tile.x - unit.x, tile.y - unit.y) * STUCK_PER_TILE;
        unit.pathFailed = false;
        unit.stepQueue = [Jobs.walkTo(tile.x, tile.y, tile.kind !== 'tile')];
      },
      update(data, arg, dt, act, unit) {
        if (act.skip) return true;
        if (!act.tile) { Actions.walk.start(data, arg, act, unit); return false; }   // efter inläsning: räkna om målet och gå från där den står
        if (!unit.stepQueue.length && !unit.pathFailed) { data.arrived = true; return true; }
        if (unit.pathFailed && !act.near) {   // målet går inte att nå (inringat av eld, bakom berg): gå så nära som det går i stället för att hoppa dit
          const here = { x: Math.floor(unit.x), y: Math.floor(unit.y) }, near = CityBuilder.Pathfinder.assess(here.x, here.y, act.tile.x, act.tile.y, CityBuilder.Players.HUMAN)?.near;
          if (near && (near.x !== here.x || near.y !== here.y)) { act.near = near; unit.pathFailed = false; unit.stepQueue = [Jobs.walkTo(near.x, near.y)]; return false; }
        }
        if (unit.pathFailed || act.elapsed > act.limit) { place(unit, data, act.near || act.tile); data.arrived = true; return true; }   // fastnat: teleportera (till närmaste nåbara ruta om målet inte gick att nå)
        return false;
      },
    },
    wait: {
      update(data, arg, dt, act) { return act.elapsed >= arg; },
    },
    teleport: {
      start(data, arg, act, unit) { const tile = Actors.resolve(arg, { x: unit.x, y: unit.y }); if (tile) place(unit, data, tile); },
    },
    vanish: {
      start(data) { Actors.remove(data); },
    },
    say: {
      start(data, arg, act, unit) {
        const spec = typeof arg === 'string' ? { text: arg } : arg;
        act.handle = Actors.sayNow(data, unit, spec);
        act.wait = !!spec.wait;
      },
      // Med wait väntar manuset tills bubblan är borta (och, om den talar, tills hela texten sagts): tiden räknas från att bubblan syns, inte från att steget börjar
      update(data, arg, dt, act) { return !act.wait || !act.handle || act.handle.done || act.elapsed > 60; },
    },
    // Lämnar scenen: går mot närmaste ruta utom spelarens synfält och försvinner så snart den inte syns (eller är framme, eller inte kommer fram)
    leave: {
      start(data, arg, act, unit) {
        const Vision = CityBuilder.Vision, cx = Math.floor(unit.x), cy = Math.floor(unit.y);
        let best = null;
        for (let radius = 2; radius <= 80 && !best; radius += 2) {
          for (let step = 0; step < 32 && !best; step++) {
            const angle = step / 32 * Math.PI * 2, x = Math.round(cx + Math.cos(angle) * radius), y = Math.round(cy + Math.sin(angle) * radius);
            if (!Vision.visible(Players.HUMAN, x + .5, y + .5) && Number.isFinite(CityBuilder.Pathfinder.tileCost(x, y))) best = { x, y, kind: 'tile' };
          }
        }
        if (!best) {   // allt syns: gå bort från basen
          const hq = Actors.hq(), away = hq ? Math.atan2(unit.y - hq.y, unit.x - hq.x) : 0;
          best = { x: Math.round(cx + Math.cos(away) * 70), y: Math.round(cy + Math.sin(away) * 70), kind: 'tile' };
        }
        act.tile = best; act.limit = STUCK_BASE + Utils.distance(best.x - unit.x, best.y - unit.y) * STUCK_PER_TILE;
        unit.pathFailed = false; data.arrived = false;
        unit.stepQueue = [Jobs.walkTo(best.x, best.y, false)];
      },
      update(data, arg, dt, act, unit) {
        if (!act.tile) { Actions.leave.start(data, arg, act, unit); return false; }
        const hidden = !CityBuilder.Vision.sees(Players.HUMAN, unit);
        if (hidden || !unit.stepQueue.length || unit.pathFailed || act.elapsed > act.limit) { Actors.remove(data); return true; }
        return false;
      },
    },
    kill: {
      start(data, arg) {
        const spec = typeof arg === 'string' ? { actor: arg } : arg, victim = Actors.data(spec.actor), unit = victim && Actors.unitOf(victim.id);
        if (!victim || !unit) return;
        const leave = spec.leave === undefined ? 'blood' : spec.leave;
        Actors.leave(leave === 'none' ? [] : leave, unit.x, unit.y);
        victim.killed = true; Actors.remove(victim);
      },
    },
    tell: {
      start(data, arg, act) {
        act.mark = `read:${data.id}:${data.index}`;
        if (levels().told(act.mark)) return;
        CityBuilder.Story.tell([{ type: 'dialogue', lines: arg, part: 'events', mark: act.mark }]);
      },
      update(data, arg, dt, act) { return levels().told(act.mark); },
    },
    fire: {
      start(data, arg) { CityBuilder.Story.fire(arg); },
    },
  };

  // ---- triggers ----
  const seen = id => { const unit = Actors.unitOf(id); return !!unit && CityBuilder.Vision.sees(Players.HUMAN, unit); };
  const Triggers = {
    arrived: id => { const data = Actors.data(id); return !!data && data.arrived && !data.gone; },
    arrivedSeen: id => Triggers.arrived(id) && seen(id),
    seen,
    gone: id => !!Actors.data(id)?.gone,
    killed: id => !!Actors.data(id)?.killed,
    near: (id, need) => {
      const unit = Actors.unitOf(id), tile = unit && Actors.resolve(need.of, { x: unit.x, y: unit.y });
      return !!tile && Utils.distance(unit.x - tile.x - .5, unit.y - tile.y - .5) <= (need.radius ?? 3);
    },
    read: key => levels().told('read:' + key),
    told: key => levels().told(key),
    scene: id => levels().told(`scene:${id}:done`),   // en scen (event.id) har spelats klart
  };

  Actors.Actions = Actions;
  Actors.Triggers = Triggers;
  CityBuilder.Actors = Actors;
  (CityBuilder.Systems = CityBuilder.Systems || {}).actors = { update: deltaSeconds => Actors.update(deltaSeconds) };
})(window.CityBuilder);
