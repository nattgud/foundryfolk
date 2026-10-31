/* Ljud: små effekter (Web Audio) och bakgrundsmusik (spellista), med två volymer och av/på för vardera.
   Användning från spelkoden:   CityBuilder.Sound?.play('build', { x: tileX, y: tileY })
   - Utan x/y spelas ljudet överallt. Med x/y (rutkoordinater) spelas det bara om platsen syns på skärmen, och panoreras.
   - Alla effekter har inbyggda syntetiska ljud, så allt fungerar utan ljudfiler. Egna filer (i Config.settings):
       audio: { sounds: { click: 'sounds/click.mp3', build: { file: 'sounds/build.mp3', volume: 0.8 } }, music: [...] }
     Syntetljudet används tills filen har laddats (och om den saknas).
   - Musik: Config.settings.audio = { music: ['music/a.mp3', 'music/b.mp3'] } (spelas i slumpad ordning, strömmas). Två låtlistor till är valfria:
     battleMusic (när spelaren är i strid) och disasterMusic (när en tornado eller lava härjar). Tonar över mjukt mellan de tre; den lugna
     musiken fortsätter där den slutade. Saknas filerna spelas en syntetisk loop i stället (SYNTH_MUSIC). Musikens läge (låt och plats)
     sparas när sidan laddas om, så att musiken fortsätter när en ny bana startar.
   - Flera filer för samma händelse: ange en lista, så slumpas en av dem varje gång (aldrig samma två i rad):
       audio: { sounds: { hit: ['sounds/hit1.mp3', 'sounds/hit2.mp3', 'sounds/hit3.mp3'], chop: { files: ['sounds/chop1.mp3', 'sounds/chop2.mp3'], volume: 0.8 } } }
     Gäller alla ljud i audio.sounds och väderljudens start-rader. Ett ljud med loop: true väljer en av filerna varje gång en ny loop startar.
   - Byggnadernas arbete (alla samlare, jägare, planterare och förädlare): varje byggnad kan ha tre valfria ljud, och det som saknas är tyst (inga standardljud):
       audio: { buildings: { glassworks: { start: 'sounds/glass_start.mp3', loop: 'sounds/glass_loop.mp3', done: ['sounds/glass_done1.mp3', 'sounds/glass_done2.mp3'] } } }
     start: arbetet börjar. loop: loopas vid byggnaden så länge arbetet pågår (de tre närmaste som syns). done: arbetet är klart. Varje ljud är en fil,
     en lista (en slumpas) eller { file | files, volume }. Förädlare: ett varv från att materialet tas till att produkterna läggs ut. Samlare,
     jägare och planterare: från att arbetaren börjar arbeta på platsen tills hen är klar. Se Behaviors.cue/workStart/workDone/working.
   - Nya ljud:  CityBuilder.Sound.define('mitt_ljud', { file: '...' | synth: rate => Float32Array, volume, maxVoices, cooldown, pitch })
   - Väderljud och ljudlandskap (Config.settings.audio.weather, alla filer valfria: saknas en fil är det tyst, utan fel):
       weather: { fade: 3,                                   // sekunder in- och utljusning för alla loopar
                  start: { rain: 'sounds/weather/rain_start.mp3', tornado: ..., volcano: ..., thunder: ... },   // en gång när vädret börjar (thunder: vid blixt)
                  loops: { rain: ..., storm: ..., fog: ..., tornado: ..., volcano: ... },   // loopas så länge vädret varar; tornado och volcano bara där de finns
                  day: 'sounds/ambient/day.mp3', night: 'sounds/ambient/night.mp3' }        // loopas dag respektive natt och tonas över i skymning och gryning
     Ett värde är en filsökväg eller { file, volume }. Alla loopar tonas mjukt in och ut.
   - Pågående ljud: ett ljud med loop: true spelas som en loop så länge något pågår, i stället för som ett enstaka ljud (se LOOPING). Just nu finns det
     för 'build' (på som standard): en loop vid varje byggarbetsplats som syns, från att bygget går framåt tills byggnaden är färdig. Egen fil:
       audio: { sounds: { build: { file: 'sounds/build.mp3', loop: true } } }    // loop: false ger tillbaka det enstaka ljudet vid placeringen
   - Webbläsare kräver en användaråtgärd innan ljud får spelas. Ljudet startar vid första tryck/tangent.
   - Ljudet stängs av när fönstret förlorar fokus (precis som spelet pausas).
   Inställningarna sparas i localStorage ('citybuilder.audio') och visas i Inställningar via settingRows(). */
(function (CityBuilder) {
  'use strict';
  const { Config } = CityBuilder;
  const t = (text, variables) => CityBuilder.t(text, variables);

  const KEY = 'citybuilder.audio';
  const MUSIC_KEY = 'citybuilder.music';   // sessionStorage: låt och plats när sidan laddas om
  const MUSIC_RESUME_MS = 60000;           // så färskt måste det sparade läget vara
  // Musiken är avstängd från start på pekskärmar: spelets musik tar ljudfokus och pausar spelarens egen musik (Spotify m.m.). Spelaren kan slå på den i inställningarna.
  const DEFAULTS = { musicOn: !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches), musicVolume: 0.5, sfxOn: true, sfxVolume: 0.7 };
  // Ljud som kan loopas medan något pågår: id -> { fade, sources() }. sources() ger det som ska låta nu: [{ key, x, y }]. fade = sekunder in- och utljusning.
  const LOOPING = {
    build: {   // byggen som just nu går framåt (inte de som väntar på material) och som spelaren ser
      fade: 0.25,
      sources: () => {
        const { World, Construction, Vision, Players } = CityBuilder;
        return World.buildings.filter(building => building.buildProgress < 1 && building.buildProgress < Construction.delivered(building) - 1e-6 && Vision.sees(Players.HUMAN, building))
          .map(building => ({ key: building, x: building.x, y: building.y }));
      },
    },
  };
  const LOOP_GAP_MS = 50;   // längsta slumpade paus mellan två varv av en loop (samma ljud): gör att loopar låter lite mer levande
  const MAX_VOICES = 24; // samtidiga effekter totalt (mobilvänligt)
  const TAU = Math.PI * 2;

  /* ---------- Inbyggda syntetljud: synth(rate) -> Float32Array ---------- */
  const render = (seconds, fn) => rate => {
    const count = Math.floor(seconds * rate), out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = fn(i / rate, i / count);
    return out;
  };
  const note = (frequency, time, start, length, level = 1) =>
    time < start || time > start + length ? 0 : Math.sin(TAU * frequency * (time - start)) * Math.pow(1 - (time - start) / length, 2) * level;

  const noise = () => Math.random() * 2 - 1;
  const EFFECT = { pitch: 0.08, cooldown: 0.1, maxVoices: 3 };

  /* ---------- Syntetisk musik (när inga filer finns): loopar med rate -> Float32Array ---------- */
  const MOOD = { battleSeconds: 20, disasterSeconds: 90, fadeSeconds: 2.5 };   // hur länge stridsmusiken dröjer sig kvar, hur länge katastrofmusiken spelas, tid för övertoning
  const lowPass = amount => { let state = 0; return value => (state += (value - state) * amount); };
  const finish = (out, peak = 0.7) => {   // jämn nivå och mjuka ändar, så att loopen inte knäpper
    let top = 0;
    for (const value of out) top = Math.max(top, Math.abs(value));
    const fade = Math.min(out.length >> 1, 1500);
    for (let i = 0; i < out.length; i++) out[i] *= peak / (top || 1) * Math.min(1, i / fade, (out.length - 1 - i) / fade);
    return out;
  };
  const SYNTH_MUSIC = {
    // Strid: puls på 150 slag/min i a-moll, bas i åttondelar, slagverk och dissonanta ackord
    battle: rate => {
      const beat = 0.4, beats = 32, out = new Float32Array(Math.floor(beat * beats * rate)), bass = [55, 55, 65.4, 55, 82.4, 55, 73.4, 55], chord = [220, 261.6, 329.6, 233.1], hat = lowPass(0.5);
      for (let i = 0; i < out.length; i++) {
        const time = i / rate, b = Math.floor(time / beat), phase = time - b * beat, eighth = Math.floor(time / (beat / 2)), phase8 = time - eighth * beat / 2;
        const kick = Math.sin(TAU * (50 * phase + 2.25 * (1 - Math.exp(-phase * 40)))) * Math.exp(-phase * 9) * 0.7;
        const snare = b % 2 ? (noise() * 0.3 + Math.sin(TAU * 190 * phase) * 0.2) * Math.exp(-phase * 18) : 0;
        const tick = (noise() - hat(noise())) * Math.exp(-phase8 * 60) * 0.12;
        const f = bass[eighth % bass.length], low = (Math.sin(TAU * f * time) + Math.sin(TAU * 2 * f * time) * 0.5 + Math.sin(TAU * 3 * f * time) * 0.25) * Math.exp(-phase8 * 5) * 0.28;
        let stab = 0;
        if (b % 4 === 0 || b % 8 === 3) for (const frequency of chord) for (let h = 1; h <= 4; h++) stab += Math.sin(TAU * frequency * h * time) / h * 0.035 * Math.exp(-phase * 4);
        out[i] = kick + snare + tick + low + stab;
      }
      return finish(out);
    },
    // Katastrof: mörk, svävande ton, hjärtslag, brusande vågor och ett tritonusackord
    disaster: rate => {
      const seconds = 16, out = new Float32Array(seconds * rate), rumble = lowPass(0.04);
      for (let i = 0; i < out.length; i++) {
        const time = i / rate, tremolo = 0.65 + 0.35 * Math.sin(TAU * 0.25 * time);
        const drone = (Math.sin(TAU * 55 * time) * 0.3 + Math.sin(TAU * 55.875 * time) * 0.3 + Math.sin(TAU * 110.5 * time) * 0.1) * tremolo;
        const second = time % 1, thud = (Math.sin(TAU * 62 * second) * Math.exp(-second * 12) + 0.7 * Math.sin(TAU * 58 * (second - 0.24)) * Math.exp(-(second - 0.24) * 14) * (second > 0.24 ? 1 : 0)) * 0.5;
        const swell = Math.pow(Math.sin(Math.PI * (time % 8) / 8), 3), waves = rumble(noise()) * swell * 5;
        const hit = time % 4;
        let tritone = 0;
        for (const frequency of [233.1, 329.6]) for (let h = 1; h <= 4; h++) tritone += Math.sin(TAU * frequency * h * time) / h * 0.06 * Math.exp(-hit * 1.8);
        out[i] = drone + thud + waves * 0.5 + tritone;
      }
      return finish(out, 0.75);
    },
  };

  const DEFAULT_SOUNDS = {
    click: { synth: render(0.05, (time, p) => Math.sin(TAU * 1600 * time) * Math.pow(1 - p, 3) * 0.45), volume: 0.6, cooldown: 0.04, maxVoices: 3 },
    build: { loop: true, synth: render(0.22, (time, p) => (Math.sin(TAU * (170 - 90 * p) * time) * 0.8 + (Math.random() * 2 - 1) * 0.3 * (1 - p)) * Math.pow(1 - p, 2)), maxVoices: 3 },
    built: { synth: render(0.5, time => (note(523, time, 0, 0.25) + note(784, time, 0.15, 0.35)) * 0.4), maxVoices: 3, cooldown: 0.1 },
    demolish: {
      synth: (() => { let low = 0; return render(0.28, (time, p) => { low += ((Math.random() * 2 - 1) - low) * (0.12 + 0.45 * (1 - p)); return low * Math.pow(1 - p, 1.5) * 1.6; }); })(),
      maxVoices: 3,
    },
    error: { synth: render(0.2, (time, p) => Math.sign(Math.sin(TAU * 140 * time)) * 0.22 * Math.pow(1 - p, 1.5)), cooldown: 0.15, maxVoices: 1 },
    levelComplete: {
      synth: render(0.9, time => (note(523, time, 0, 0.5) + note(659, time, 0.14, 0.5) + note(784, time, 0.28, 0.5) + note(1047, time, 0.42, 0.45)) * 0.3),
      maxVoices: 1,
    },
    // Larm: en siren som växlar mellan två toner, två varv
    alarm: { synth: render(1.2, (time, p) => (Math.sign(Math.sin(TAU * (Math.floor(time * 3.3) % 2 ? 640 : 880) * time)) * 0.5 + Math.sin(TAU * (Math.floor(time * 3.3) % 2 ? 640 : 880) * time) * 0.5) * 0.35 * Math.min(1, (1 - p) * 4)), volume: 0.9, pitch: 0, maxVoices: 1, cooldown: 5 },
    // Flaggor: en kort ton när spelaren sätter sin flagga, och en varning när en fiendes flagga syns (egna filer: settings.audio.sounds.flag och flag_enemy)
    flag: { synth: render(0.3, time => (note(659, time, 0, 0.2) + note(988, time, 0.1, 0.25)) * 0.35), maxVoices: 1, cooldown: 0.1 },
    flag_enemy: { synth: render(0.7, time => (note(330, time, 0, 0.3) + note(247, time, 0.25, 0.4)) * 0.4), volume: 0.8, maxVoices: 1, cooldown: 1 },
    // Monster (egna filer: settings.audio.sounds.<id>). Varje art har ett eget läte (units.js: attackSound), alla dör med monster_die
    monster_squelch: { synth: (() => { let low = 0; return render(0.3, (time, p) => { low += (noise() - low) * 0.18; return (low * 1.4 + Math.sin(TAU * (160 - 90 * p) * time) * 0.35) * Math.pow(1 - p, 1.5) * 0.7; }); })(), volume: 0.6, ...EFFECT },
    monster_screech: { synth: render(0.35, (time, p) => (Math.sin(TAU * (1500 + 700 * Math.sin(p * 26)) * time) * 0.25 + noise() * 0.12) * Math.sin(Math.PI * p) * 0.8), volume: 0.5, ...EFFECT },
    monster_howl: { synth: render(0.8, (time, p) => Math.sin(TAU * (260 + 240 * Math.sin(Math.PI * p)) * time + Math.sin(TAU * 6 * time) * 1.5) * 0.4 * Math.sin(Math.PI * Math.pow(p, 0.7))), volume: 0.6, ...EFFECT },
    monster_snap: { synth: render(0.14, (time, p) => (noise() * 0.5 * Math.pow(1 - p, 6) + Math.sin(TAU * 420 * time) * 0.3 * Math.pow(1 - p, 3))), volume: 0.6, ...EFFECT },
    monster_rumble: { synth: (() => { let low = 0; return render(0.7, (time, p) => { low += (noise() - low) * 0.06; return (low * 2.2 + Math.sin(TAU * 52 * time) * 0.5) * Math.sin(Math.PI * Math.pow(p, 0.6)) * 0.8; }); })(), volume: 0.8, ...EFFECT },
    monster_roar: { synth: render(0.9, (time, p) => { const saw = ((time * (95 - 25 * p) * (1 + Math.sin(TAU * 11 * time) * 0.04)) % 1) * 2 - 1; return (saw * 0.45 + noise() * 0.12) * Math.sin(Math.PI * Math.pow(p, 0.5)) * 0.8; }), volume: 0.8, ...EFFECT },
    monster_die: { synth: render(0.6, (time, p) => (Math.sin(TAU * (180 - 130 * p) * time) * 0.45 + noise() * 0.18 * (1 - p)) * Math.pow(1 - p, 1.3)), volume: 0.7, ...EFFECT },
    // Strid
    arrow: { synth: render(0.25, (time, p) => (noise() * 0.22 * Math.sin(Math.PI * p) + note(240, time, 0, 0.12) * 0.25)), volume: 0.6, ...EFFECT },
    swing: { synth: render(0.18, (time, p) => noise() * 0.28 * Math.sin(Math.PI * p)), volume: 0.6, ...EFFECT },
    hit: { synth: render(0.12, (time, p) => (Math.sin(TAU * (130 - 70 * p) * time) * 0.6 + noise() * 0.25 * (1 - p)) * Math.pow(1 - p, 2)), volume: 0.6, ...EFFECT, cooldown: 0.08 },
    died: { synth: render(0.4, (time, p) => Math.sin(TAU * (320 - 200 * p) * time) * 0.35 * Math.pow(1 - p, 1.5)), volume: 0.6, ...EFFECT },
    destroyed: { synth: (() => { let low = 0; return render(0.6, (time, p) => { low += (noise() - low) * 0.25; return low * 1.4 * Math.pow(1 - p, 1.5); }); })(), volume: 0.8, ...EFFECT },
    drop: { synth: render(0.04, (time, p) => Math.sin(TAU * 900 * time) * Math.pow(1 - p, 3) * 0.3), volume: 0.5, cooldown: 0.05, maxVoices: 4 },
  };

  const AMBIENT_MS = 100;         // hur ofta loopar anpassas efter väder, tid på dygnet och kamera
  const spec = value => typeof value === 'string' ? { file: value } : Array.isArray(value) ? { files: value } : value;   // en fil, flera filer (en slumpas varje gång) eller { file | files, volume }
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const perceived = volume => volume * volume; // gain som känns jämn mot reglaget

  const Sound = {
    settings: { ...DEFAULTS },
    context: null,
    sounds: new Map(),
    voices: 0,
    channels: null,          // musikkanaler per läge: { calm, battle, disaster }, se channel()
    mood: 'calm',            // vilket läge musiken har just nu: calm | battle | disaster (updateMood)
    hazards: 0,              // antal pågående tornados och utbrott förra gången (ett nytt startar katastrofmusiken)
    hazardUntil: 0,

    // Anropas en gång av UI.init
    install() {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
        for (const name of Object.keys(DEFAULTS)) if (typeof saved[name] === typeof DEFAULTS[name]) this.settings[name] = saved[name];
      } catch (error) { /* standardvärden */ }

      for (const [id, definition] of Object.entries(DEFAULT_SOUNDS)) this.define(id, definition);
      // Egna ljud och musik från Config.settings.audio = { sounds: { click: 'sounds/click.mp3' }, music: ['music/a.mp3'] }
      const custom = Config.settings.audio || {};
      for (const [id, value] of Object.entries(custom.sounds || {})) this.define(id, spec(value));
      this.workLoops = new Set();   // byggnader som har en arbetsloop
      for (const [type, phases] of Object.entries(custom.buildings || {})) for (const phase of ['start', 'loop', 'done']) {
        if (!phases[phase]) continue;
        this.define(`${phase}.${type}`, spec(phases[phase]));
        if (phase === 'loop') this.workLoops.add(type);
      }
      this.channels = { calm: this.channel(custom.music), battle: this.channel(custom.battleMusic), disaster: this.channel(custom.disasterMusic) };
      try {   // sidan har just laddats om (t.ex. en ny bana): den lugna musiken fortsätter där den slutade
        const saved = JSON.parse(sessionStorage.getItem(MUSIC_KEY) || 'null');
        if (saved && Date.now() - saved.at < MUSIC_RESUME_MS && this.channels.calm.tracks.includes(saved.track)) { this.resume = saved; this.ensureContext(); }
      } catch (error) { /* ingen sparad musik */ }
      for (const type of ['pagehide', 'beforeunload']) addEventListener(type, () => this.saveMusic());
      this.weather = custom.weather || {};
      for (const [id, value] of Object.entries(this.weather.start || {})) this.define('weather.' + id, { ...spec(value), quiet: true, pitch: 0, maxVoices: 1, cooldown: 0 });
      setInterval(() => { this.updateMood(); this.updateAmbient(); }, AMBIENT_MS);
      this.injectStyles();

      // Ljud får starta först efter en användaråtgärd
      const unlock = () => {
        this.ensureContext();
        if (this.context && this.context.state === 'suspended') this.context.resume();
        if (this.context && this.context.state === 'running') {
          for (const type of ['pointerdown', 'touchend', 'keydown']) removeEventListener(type, unlock, true);
          this.applySettings();
        }
      };
      for (const type of ['pointerdown', 'touchend', 'keydown']) addEventListener(type, unlock, true);

      // Tyst när fönstret inte har fokus
      // Tillbaka i fokus: ljudet startas igen och musiken (om den är på) fortsätter, när det väl är igång (resume är asynkront)
      const focus = () => {
        if (!this.context) return;
        if (document.hidden || !document.hasFocus()) { this.context.suspend(); this.updateMusic(); return; }
        Promise.resolve(this.context.resume()).catch(() => {}).then(() => this.updateMusic());
      };
      addEventListener('focus', focus);
      addEventListener('blur', focus);
      addEventListener('pageshow', focus);
      document.addEventListener('visibilitychange', focus);

      // Ett klickljud för alla knappar och val
      document.addEventListener('click', event => {
        if (event.target.closest && event.target.closest('button:not(:disabled), select, input[type=range]')) this.play('click');
      }, true);
    },

    ensureContext() {
      if (this.context) return this.context;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';   // ljudet blandas med andra appars ljud i stället för att pausa dem (iOS)
      const context = this.context = new AudioContextClass();
      context.addEventListener('statechange', () => {   // t.ex. ett samtal eller en annan app stoppar ljudet, eller det går igång igen
        if (context.state === 'interrupted' && !document.hidden) context.resume().catch(() => {});
        this.updateMusic();
      });
      this.sfxGain = context.createGain();
      this.musicGain = context.createGain();
      this.sfxGain.connect(context.destination);
      this.musicGain.connect(context.destination);
      this.applySettings();
      this.preload();
      return context;
    },

    // definition: { file? | files? (flera: en slumpas varje gång), synth?, volume = 1, maxVoices = 4, cooldown = 0.03 (s), pitch = 0.06 (slumpad variation) }
    define(id, definition) {
      const existing = this.sounds.get(id);
      const merged = { volume: 1, maxVoices: 4, cooldown: 0.03, pitch: 0.06, ...(existing || {}), ...definition, voices: existing ? existing.voices : 0, last: -1 };
      if (definition.file || definition.files || definition.synth) merged.buffer = null; // ny källa: bygg om bufferten
      if (definition.files) { merged.file = null; merged.variants = definition.files.map(file => ({ file, loading: false, fileBuffer: null, buffer: null })); }
      else if (definition.file) merged.variants = null;
      if (definition.file) { merged.loading = false; merged.fileBuffer = null; }
      this.sounds.set(id, merged);
      if (this.context) for (const source of merged.variants || [merged]) if (source.file) this.bufferFor(source);
    },

    // Hämtar alla ljudfiler direkt när ljudet startat. Annars började hämtningen först första gången ljudet skulle spelas, och då
    // spelades syntetljudet i stället (så ett ljud som bara hörs en gång, som banan klar, hördes aldrig från filen).
    preload() {
      for (const definition of this.sounds.values()) for (const source of definition.variants || [definition]) if (source.file) this.bufferFor(source);
    },

    // Ljudets buffert att spela nu. Har ljudet flera filer väljs en av de som laddats slumpvis, aldrig samma två gånger i rad;
    // annars (eller tills någon fil laddats) det vanliga: filen, eller det inbyggda syntetljudet.
    pickBuffer(definition) {
      const ready = (definition.variants || []).filter(variant => this.bufferFor(variant));
      if (!ready.length) return this.bufferFor(definition);
      const choices = ready.length > 1 ? ready.filter(variant => variant !== definition.lastVariant) : ready;
      definition.lastVariant = choices[Math.floor(Math.random() * choices.length)];
      return definition.lastVariant.buffer;
    },

    bufferFor(definition) {
      if (definition.buffer) return definition.buffer;
      const context = this.context;
      if (definition.file && !definition.loading) {
        definition.loading = true;
        fetch(definition.file)
          .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.arrayBuffer(); })
          .then(data => context.decodeAudioData(data))
          .then(buffer => { definition.fileBuffer = buffer; definition.buffer = buffer; })
          .catch(error => { if (!definition.quiet) console.warn(`Could not load the sound file ${definition.file} (${error.message ?? error}): using the built-in sound`); });
      }
      if (definition.synth && !definition.synthBuffer) {
        const samples = definition.synth(context.sampleRate);
        definition.synthBuffer = context.createBuffer(1, samples.length, context.sampleRate);
        definition.synthBuffer.copyToChannel(samples, 0);
      }
      return definition.fileBuffer || definition.synthBuffer || null;
    },

    // Var på skärmen en ruta ligger. null = utanför bild.
    // Rutans plats i skärmpunkter (null utan kamera)
    screenPoint(x, y) {
      const renderer = CityBuilder.Renderer;
      if (!renderer || !renderer.camera) return null;
      return { x: ((x + 0.5) * renderer.tileSize - renderer.camera.x) * renderer.zoom, y: ((y + 0.5) * renderer.tileSize - renderer.camera.y) * renderer.zoom };
    },

    screenPosition(x, y) {
      const point = this.screenPoint(x, y);
      if (!point) return { pan: 0 };
      const { x: screenX, y: screenY } = point, margin = 60;
      if (screenX < -margin || screenY < -margin || screenX > innerWidth + margin || screenY > innerHeight + margin) return null;
      return { pan: clamp((screenX / innerWidth - 0.5) * 1.2, -0.7, 0.7) };
    },

    // options: { volume = 1, x, y }
    play(id, options = {}) {
      const context = this.context;
      if (!context || context.state !== 'running' || !this.settings.sfxOn || this.settings.sfxVolume <= 0) return;
      const definition = this.sounds.get(id);
      if (!definition || (definition.loop && LOOPING[id]) || definition.voices >= definition.maxVoices || this.voices >= MAX_VOICES) return;   // loopande ljud sköts av updateAmbient
      const now = context.currentTime;
      if (now - definition.last < definition.cooldown) return;

      let pan = 0;
      if (options.x !== undefined) {
        const position = this.screenPosition(options.x, options.y);
        if (!position) return;
        pan = position.pan;
      }
      const buffer = this.pickBuffer(definition);
      if (!buffer) return;

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 1 + (Math.random() * 2 - 1) * definition.pitch;
      const gain = context.createGain();
      gain.gain.value = (options.volume ?? 1) * definition.volume;
      source.connect(gain);
      if (pan && context.createStereoPanner) {
        const panner = context.createStereoPanner();
        panner.pan.value = pan;
        gain.connect(panner).connect(this.sfxGain);
      } else {
        gain.connect(this.sfxGain);
      }

      definition.last = now; definition.voices++; this.voices++;
      source.onended = () => { definition.voices--; this.voices--; };
      source.start();
    },


    /* ---------- Väder och ljudlandskap: loopar med mjuk in- och utljusning ---------- */

    // Vilka loopar som ska höras nu: Map nyckel -> { file, volume, level 0-1, pan }. Nyckeln är en text, eller ett tornado- eller vulkanobjekt (en loop per sådan).
    ambientTargets() {
      const Weather = CityBuilder.Weather, config = this.weather, targets = new Map();
      if (!Weather || !config || !this.settings.sfxOn || this.settings.sfxVolume <= 0 || !CityBuilder.World?.headquarters) return targets;
      const add = (key, value, level, pan = 0) => { const file = value && spec(value); if (file && level > 0.01) targets.set(key, { ...file, volume: file.volume ?? 1, level, pan }); };
      // Hur högt något på kartan hörs: full styrka på skärmen, bleknar utanför den
      const hearing = (x, y) => {
        const point = this.screenPoint(x, y);
        if (!point) return null;
        const outside = Math.hypot(Math.max(0, -point.x, point.x - innerWidth), Math.max(0, -point.y, point.y - innerHeight));
        return { level: clamp(1 - outside / (Math.min(innerWidth, innerHeight) * 0.7), 0, 1), pan: clamp((point.x / innerWidth - 0.5) * 1.2, -0.7, 0.7) };
      };
      const loops = config.loops || {}, dark = Weather.darkness();
      add('day', config.day, 1 - dark);
      add('night', config.night, dark);
      add('weather:' + Weather.type, loops[Weather.type] && !['tornado', 'volcano'].includes(Weather.type) ? loops[Weather.type] : null, 1);
      // Tornados och vulkaner hörs där de finns: full styrka på skärmen, bleknar utanför den. De närmaste tre.
      const near = [];
      for (const [list, id] of [[Weather.tornadoes, 'tornado'], [Weather.volcanoes, 'volcano']]) {
        if (!loops[id]) continue;
        for (const source of list) {
          const heard = hearing(source.x, source.y);
          if (heard) near.push({ source, id, ...heard });
        }
      }
      for (const { source, id, level, pan } of near.sort((a, b) => b.level - a.level).slice(0, 3)) add(source, loops[id], level, pan);
      // Pågående ljud (LOOPING): de tre närmaste platserna
      for (const [id, looping] of Object.entries(LOOPING)) {
        const definition = this.sounds.get(id);
        if (!definition?.loop) continue;
        const heard = looping.sources().map(source => ({ source, ...hearing(source.x, source.y) })).filter(entry => entry.level > 0.01);
        for (const { source, level, pan } of heard.sort((a, b) => b.level - a.level).slice(0, 3)) targets.set(source.key, { definition, volume: definition.volume, level, pan, fade: looping.fade });
      }
      // Byggnadernas arbetsloopar (audio.buildings.<byggnad>.loop): en loop vid varje byggnad som arbetar just nu och syns, de tre närmaste
      if (this.workLoops?.size) {
        const { World, Behaviors, Vision, Players } = CityBuilder, heard = [];
        for (const building of World.buildings) {
          if (!this.workLoops.has(building.type) || !Behaviors.working(building) || !Vision.sees(Players.HUMAN, building)) continue;
          const spot = hearing(building.x, building.y);
          if (spot && spot.level > 0.01) heard.push({ building, ...spot });
        }
        for (const { building, level, pan } of heard.sort((a, b) => b.level - a.level).slice(0, 3)) {
          const definition = this.sounds.get('loop.' + building.type);
          targets.set(building, { definition, volume: definition.volume, level, pan, fade: 0.3 });
        }
      }
      return targets;
    },

    loopBuffer(file) {
      this.loopFiles ||= new Map();
      let entry = this.loopFiles.get(file);
      if (!entry) {
        entry = { buffer: null };
        this.loopFiles.set(file, entry);
        fetch(file).then(response => { if (!response.ok) throw new Error(); return response.arrayBuffer(); }).then(data => this.context.decodeAudioData(data)).then(buffer => { entry.buffer = buffer; }).catch(() => {});   // saknas filen är det tyst
      }
      return entry.buffer;
    },

    updateAmbient() {
      const context = this.context;
      if (!context || context.state !== 'running') return;
      this.loops ||= new Map();
      const fade = this.weather.fade ?? 3, now = context.currentTime, targets = this.ambientTargets();
      for (const [key, target] of targets) {
        let loop = this.loops.get(key);
        const buffer = loop ? null : target.definition ? this.pickBuffer(target.definition) : this.loopBuffer(target.file);   // en ny loop med flera filer slumpar en av dem
        if (!loop && buffer) {
          const gain = context.createGain(), panner = context.createStereoPanner ? context.createStereoPanner() : null;
          gain.gain.value = 0;   // börjar tyst och tonas in
          (panner ? gain.connect(panner) && panner : gain).connect(this.sfxGain);
          loop = { source: null, timer: 0, stopped: false, gain, panner, silentSince: null, fade: target.fade ?? fade, pick: () => target.definition ? this.pickBuffer(target.definition) : buffer };   // flera filer: en ny slumpas varje varv
          this.runLoop(loop, buffer, Math.random());
          this.loops.set(key, loop);
        }
        if (!loop) continue;
        loop.silentSince = null;
        loop.fade = target.fade ?? fade;
        loop.gain.gain.setTargetAtTime(target.level * target.volume, now, loop.fade / 3);
        if (loop.panner) loop.panner.pan.setTargetAtTime(target.pan, now, 0.2);
      }
      // Det som inte längre ska höras tonas ut och stoppas när det blivit tyst
      for (const [key, loop] of this.loops) {
        if (targets.has(key)) continue;
        loop.gain.gain.setTargetAtTime(0, now, loop.fade / 3);
        loop.silentSince ??= now;
        if (now - loop.silentSince > loop.fade * 1.5) { this.stopLoop(loop); this.loops.delete(key); }
      }
    },

    // Ett varv av en loop (börjar på 'offset' av ljudet). När varvet är slut väntar loopen en slumpad stund (högst LOOP_GAP_MS) och börjar om.
    runLoop(loop, buffer = loop.pick(), offset = 0) {
      if (!buffer) return;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(loop.gain);
      source.start(0, offset * buffer.duration);
      source.onended = () => { if (!loop.stopped) loop.timer = setTimeout(() => this.runLoop(loop), Math.random() * LOOP_GAP_MS); };
      loop.source = source;
    },

    stopLoop(loop) {
      loop.stopped = true;
      clearTimeout(loop.timer);
      loop.source?.stop();
      loop.gain.disconnect();
    },

    /* ---------- Musik ---------- */

    // En kanal per läge. Låtar: filer (strömmas), annars (strid och katastrof) en syntetisk loop.
    channel: tracks => ({ tracks: tracks || [], queue: [], current: null, element: null, source: null, gain: null, stopTimer: 0, buffer: null }),

    // Strid så länge något av spelarens slåss (Combat.fightAt) och en stund efter, katastrof en stund efter att en tornado eller ett utbrott börjar
    updateMood() {
      const now = performance.now() / 1000, { Weather, Combat } = CityBuilder;
      const hazards = Weather ? Weather.tornadoes.length + Weather.volcanoes.length : 0;
      if (hazards > this.hazards) this.hazardUntil = now + MOOD.disasterSeconds;
      this.hazards = hazards;
      const mood = hazards && now < this.hazardUntil ? 'disaster' : Combat && Combat.time - Combat.fightAt < MOOD.battleSeconds ? 'battle' : 'calm';
      if (mood !== this.mood) { this.mood = mood; this.updateMusic(); }
    },

    updateMusic() {
      const context = this.context;
      const on = !!context && context.state === 'running' && this.settings.musicOn && this.settings.musicVolume > 0;
      for (const [mood, channel] of Object.entries(this.channels || {})) this.tune(mood, channel, on, mood === this.mood);
    },

    // Startar eller tonar ut en kanal. Är musiken av (eller ljudet stoppat) tystnar den direkt och fortsätter därifrån när den slås på.
    tune(mood, channel, on, current) {
      const context = this.context;
      if (!context) return;
      if (!channel.gain) { channel.gain = context.createGain(); channel.gain.gain.value = 0; channel.gain.connect(this.musicGain); }
      clearTimeout(channel.stopTimer);
      const plays = on && current && (channel.tracks.length || mood !== 'calm');   // den lugna kanalen utan låtar är tyst
      channel.gain.gain.setTargetAtTime(plays ? 1 : 0, context.currentTime, MOOD.fadeSeconds / 3);
      if (plays) this.start(mood, channel);
      else if (!on) this.stop(channel);
      else channel.stopTimer = setTimeout(() => this.stop(channel), MOOD.fadeSeconds * 1000);
    },

    start(mood, channel) {
      if (!channel.tracks.length) {   // syntetisk loop
        if (channel.source) return;
        channel.buffer ??= (() => { const samples = SYNTH_MUSIC[mood](this.context.sampleRate), buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate); buffer.copyToChannel(samples, 0); return buffer; })();
        channel.source = Object.assign(this.context.createBufferSource(), { buffer: channel.buffer, loop: true });
        channel.source.connect(channel.gain);
        channel.source.start();
        return;
      }
      if (!channel.element) {
        const element = channel.element = document.createElement('audio');
        element.preload = 'none';
        this.context.createMediaElementSource(element).connect(channel.gain);
        element.addEventListener('ended', () => this.nextTrack(channel));
      }
      if (!channel.element.src) this.nextTrack(channel); else this.playTrack(channel);
    },

    stop(channel) {
      if (channel.element) channel.element.pause();
      if (channel.source) { channel.source.stop(); channel.source.disconnect(); channel.source = null; }
    },

    // Spelar låten. Vägrar webbläsaren (mobiler kräver ibland en ny användaråtgärd efter ett avbrott) görs ett nytt försök vid nästa tryck.
    playTrack(channel) {
      const promise = channel.element.play();
      if (promise) promise.catch(() => {
        if (this.retryMusic) return;
        this.retryMusic = true;
        addEventListener('pointerdown', () => { this.retryMusic = false; if (this.context) this.context.resume().catch(() => {}); this.updateMusic(); }, { once: true, capture: true });
      });
    },

    // Blandad kö: alla låtar spelas i slumpad ordning innan någon upprepas, och en ny omgång börjar aldrig med låten som just spelades.
    // Efter en omladdning börjar den lugna musiken med låten och platsen som sparades.
    nextTrack(channel) {
      if (!channel.element || !channel.tracks.length) return;
      if (this.resume && channel === this.channels.calm) {
        const { track, time } = this.resume;
        this.resume = null;
        channel.queue = channel.tracks.filter(other => other !== track).sort(() => Math.random() - 0.5);
        channel.current = track;
        channel.element.src = track;
        channel.element.addEventListener('loadedmetadata', () => { channel.element.currentTime = time; }, { once: true });
        this.playTrack(channel);
        return;
      }
      if (!channel.queue.length) {
        const queue = channel.queue = [...channel.tracks];
        for (let i = queue.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [queue[i], queue[j]] = [queue[j], queue[i]];
        }
        if (queue.length > 1 && queue[queue.length - 1] === channel.current) [queue[0], queue[queue.length - 1]] = [queue[queue.length - 1], queue[0]];   // spelas från slutet
      }
      channel.current = channel.queue.pop();
      channel.element.src = channel.current;
      this.playTrack(channel);
    },

    // Den lugna musikens låt och plats, för nästa sidladdning
    saveMusic() {
      const channel = this.channels?.calm;
      if (!channel?.element?.src || !channel.current) return;
      try { sessionStorage.setItem(MUSIC_KEY, JSON.stringify({ track: channel.current, time: channel.element.currentTime, at: Date.now() })); } catch (error) { /* ignorera */ }
    },

    /* ---------- Inställningar ---------- */

    applySettings() {
      if (!this.context) return;
      const { sfxOn, sfxVolume, musicOn, musicVolume } = this.settings;
      this.sfxGain.gain.value = sfxOn ? perceived(sfxVolume) : 0;
      this.musicGain.gain.value = musicOn ? perceived(musicVolume) : 0;
      this.updateMusic();
    },

    set(name, value) {
      this.settings[name] = value;
      try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch (error) { /* ignorera */ }
      this.applySettings();
    },

    // Två rader till Inställningar: Musik och Ljudeffekter (av/på + volym). row(label, control, note) och make kommer från options.js.
    settingRows(row, make) {
      const control = (onName, volumeName, previewSound) => {
        const wrap = make('div', 'audio-control');
        const toggle = make('button', 'options-toggle');
        toggle.type = 'button';
        const slider = make('input', 'audio-slider');
        slider.type = 'range';
        slider.min = '0'; slider.max = '100'; slider.step = '1';
        slider.value = String(Math.round(this.settings[volumeName] * 100));
        slider.setAttribute('aria-label', t('Volume'));

        const paint = () => {
          const on = this.settings[onName];
          toggle.textContent = t(on ? 'On' : 'Off');
          toggle.classList.toggle('is-on', on);
          toggle.setAttribute('aria-pressed', String(on));
          slider.disabled = !on;
        };
        toggle.onclick = () => { this.set(onName, !this.settings[onName]); paint(); if (previewSound) this.play(previewSound); };
        slider.oninput = () => this.set(volumeName, Number(slider.value) / 100);
        slider.onchange = () => { if (previewSound) this.play(previewSound); };
        paint();
        wrap.append(toggle, slider);
        return wrap;
      };

      return [
        row(t('Music'), control('musicOn', 'musicVolume', null)),
        row(t('Sound effects'), control('sfxOn', 'sfxVolume', 'build')),
      ];
    },

    injectStyles() {
      if (document.getElementById('soundStyles')) return;
      const style = document.createElement('style');
      style.id = 'soundStyles';
      style.textContent = `
        .audio-control { display: flex; align-items: center; gap: 8px; }
        .audio-slider { width: 110px; accent-color: var(--accent); }
        .audio-slider:disabled { opacity: .4; }
        @media (pointer: coarse), (max-width: 520px) { .audio-slider { width: 90px; height: 32px; } }
      `;
      document.head.appendChild(style);
    },
  };

  CityBuilder.Sound = Sound;
})(window.CityBuilder);