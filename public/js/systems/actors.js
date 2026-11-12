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
                          Config.story.speakers (samma id, eller speaker) skrivs texten ut med dess röst (voice: false stänger av). for = sekunder kvar efter sista tecknet (standard 1,8).
                          Manuset går vidare direkt, eller med wait: true först när bubblan är borta (räknat från att den syns)
     leave: true          går mot närmaste ruta som spelaren inte ser (dimman) och försvinner när den inte syns längre
     kill: id | { actor: id, leave: 'blood' | 'corpse' | ['blood','corpse'] | 'none' }
                          en annan skådespelare dör och ersätts av en kuliss (blodpöl som standard)
     tell: [dialograder]  visar en dialog och väntar tills den lästs
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
     { told: 'nyckel' }   en nyckel i Levels.told

   I kapitlets events: spawn: { id, image, race ('demon' = demonernas version av bilden), frame, size, speed, at, script: [...] } (eller en lista av dem) skapar skådespelare, act: { id: [manus] } byter manus. */
(function (CityBuilder) {
  'use strict';
  const { World, Config, Players, Utils, Jobs } = CityBuilder;

  const LEAVE_LAYER = { blood: 0, corpse: 1 };
  const STUCK_BASE = 15, STUCK_PER_TILE = 1.5;   // sekunder innan en promenad ger upp och teleporterar

  const levels = () => CityBuilder.Levels;
  const state = () => {   // framstegens del för skådespelare: { list: [data], leftovers: [{ type, x, y, layer }] }
    const progress = levels().progressRef?.();
    if (!progress) return { list: [], leftovers: [] };
    return progress.actors || (progress.actors = { list: [], leftovers: [] });
  };

  const Actors = {
    units: new Map(),   // id -> enheten i världen (inte sparad; byggs upp av rebuild)

    // ---- uppslag ----
    data: id => state().list.find(item => item.id === id),
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
        const unit = this.unitOf(target.actor), data = this.data(target.actor);
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
      if (!spec?.id || this.data(spec.id) && !this.data(spec.id).gone) return null;
      const from = this.resolve(spec.at ?? 'hq');
      if (!from) { console.warn(`Actors: spawn ${spec.id} has no valid position`); return null; }
      const at = from.kind === 'building' ? { x: from.x, y: from.y + 1 } : from;
      const data = {
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
      this.units.set(data.id, unit);
      return unit;
    },
    // Efter att världen byggts (ny start eller inläsning): enheterna skapas från de sparade uppgifterna och kvarlämnade kulisser läggs tillbaka
    rebuild() {
      this.units = new Map();
      const saved = state();
      for (const data of saved.list) if (!data.gone) { data.act = data.act && data.act.type ? { ...data.act, started: false } : null; this.build(data); }
      for (const item of saved.leftovers) World.addScenery(item.type, item.x, item.y, item.layer);
    },

    // Byter manus (en händelse med act) eller sätter ett nytt
    setScript(id, script) {
      const data = this.data(id);
      if (!data || data.gone) return;
      data.script = script || []; data.index = 0; data.act = null;
    },

    // ---- själva uppdateringen ----
    update(deltaSeconds) {
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
    fire(event) {
      for (const spec of [].concat(event.spawn || [])) this.spawn(spec);
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
        if (unit.pathFailed || act.elapsed > act.limit) { place(unit, data, act.tile); data.arrived = true; return true; }   // fastnat: teleportera
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
        const spec = typeof arg === 'string' ? { text: arg } : arg, speaker = spec.voice === false ? null : spec.speaker || (CityBuilder.Config.story.speakers[data.id] ? data.id : null);
        act.handle = CityBuilder.Bubbles?.say(unit, spec.text, spec.for, null, speaker);
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
  };

  Actors.Actions = Actions;
  Actors.Triggers = Triggers;
  CityBuilder.Actors = Actors;
  (CityBuilder.Systems = CityBuilder.Systems || {}).actors = { update: deltaSeconds => Actors.update(deltaSeconds) };
})(window.CityBuilder);
