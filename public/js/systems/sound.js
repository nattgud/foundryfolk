/* Ljud: små effekter (Web Audio) och bakgrundsmusik (spellista), med två volymer och av/på för vardera.
   Användning från spelkoden:   CityBuilder.Sound?.play('build', { x: tileX, y: tileY })
   - Utan x/y spelas ljudet överallt. Med x/y (rutkoordinater) spelas det bara om platsen syns på skärmen, och panoreras.
   - Alla effekter har inbyggda syntetiska ljud, så allt fungerar utan ljudfiler. Egna filer:
       CityBuilder.Sound.define('click', { file: 'sounds/click.mp3' })     // syntetljudet används tills filen laddats
   - Musik: Config.settings.audio = { music: ['music/a.mp3', 'music/b.mp3'] } (spelas i slumpad ordning, strömmas).
   - Nya ljud:  CityBuilder.Sound.define('mitt_ljud', { file: '...' | synth: rate => Float32Array, volume, maxVoices, cooldown, pitch })
   - Webbläsare kräver en användaråtgärd innan ljud får spelas. Ljudet startar vid första tryck/tangent.
   - Ljudet stängs av när fönstret förlorar fokus (precis som spelet pausas).
   Inställningarna sparas i localStorage ('citybuilder.audio') och visas i Inställningar via settingRows(). */
(function (CityBuilder) {
  'use strict';
  const { Config } = CityBuilder;
  const t = (text, variables) => CityBuilder.t(text, variables);

  const KEY = 'citybuilder.audio';
  const DEFAULTS = { musicOn: true, musicVolume: 0.5, sfxOn: true, sfxVolume: 0.7 };
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

  const DEFAULT_SOUNDS = {
    click: { synth: render(0.05, (time, p) => Math.sin(TAU * 1600 * time) * Math.pow(1 - p, 3) * 0.45), volume: 0.6, cooldown: 0.04, maxVoices: 3 },
    build: { synth: render(0.22, (time, p) => (Math.sin(TAU * (170 - 90 * p) * time) * 0.8 + (Math.random() * 2 - 1) * 0.3 * (1 - p)) * Math.pow(1 - p, 2)), maxVoices: 3 },
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
    drop: { synth: render(0.04, (time, p) => Math.sin(TAU * 900 * time) * Math.pow(1 - p, 3) * 0.3), volume: 0.5, cooldown: 0.05, maxVoices: 4 },
  };

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const perceived = volume => volume * volume; // gain som känns jämn mot reglaget

  const Sound = {
    settings: { ...DEFAULTS },
    context: null,
    sounds: new Map(),
    voices: 0,
    tracks: [],
    musicElement: null,

    // Anropas en gång av UI.init
    install() {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
        for (const name of Object.keys(DEFAULTS)) if (typeof saved[name] === typeof DEFAULTS[name]) this.settings[name] = saved[name];
      } catch (error) { /* standardvärden */ }

      for (const [id, definition] of Object.entries(DEFAULT_SOUNDS)) this.define(id, definition);
      this.tracks = (Config.settings.audio && Config.settings.audio.music) || [];
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
      const focus = () => {
        if (!this.context) return;
        if (document.hidden || !document.hasFocus()) this.context.suspend(); else this.context.resume();
        this.updateMusic();
      };
      addEventListener('focus', focus);
      addEventListener('blur', focus);
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
      const context = this.context = new AudioContextClass();
      this.sfxGain = context.createGain();
      this.musicGain = context.createGain();
      this.sfxGain.connect(context.destination);
      this.musicGain.connect(context.destination);
      this.applySettings();
      return context;
    },

    // definition: { file?, synth?, volume = 1, maxVoices = 4, cooldown = 0.03 (s), pitch = 0.06 (slumpad variation) }
    define(id, definition) {
      const existing = this.sounds.get(id);
      const merged = { volume: 1, maxVoices: 4, cooldown: 0.03, pitch: 0.06, ...(existing || {}), ...definition, voices: existing ? existing.voices : 0, last: -1 };
      if (definition.file || definition.synth) merged.buffer = null; // ny källa: bygg om bufferten
      this.sounds.set(id, merged);
    },

    bufferFor(definition) {
      if (definition.buffer) return definition.buffer;
      const context = this.context;
      if (definition.file && !definition.loading) {
        definition.loading = true;
        fetch(definition.file)
          .then(response => response.arrayBuffer())
          .then(data => context.decodeAudioData(data))
          .then(buffer => { definition.fileBuffer = buffer; definition.buffer = buffer; })
          .catch(() => { /* syntetljudet används */ });
      }
      if (definition.synth && !definition.synthBuffer) {
        const samples = definition.synth(context.sampleRate);
        definition.synthBuffer = context.createBuffer(1, samples.length, context.sampleRate);
        definition.synthBuffer.copyToChannel(samples, 0);
      }
      return definition.fileBuffer || definition.synthBuffer || null;
    },

    // Var på skärmen en ruta ligger. null = utanför bild.
    screenPosition(x, y) {
      const renderer = CityBuilder.Renderer;
      if (!renderer || !renderer.camera) return { pan: 0 };
      const screenX = ((x + 0.5) * renderer.tileSize - renderer.camera.x) * renderer.zoom;
      const screenY = ((y + 0.5) * renderer.tileSize - renderer.camera.y) * renderer.zoom;
      const margin = 60;
      if (screenX < -margin || screenY < -margin || screenX > innerWidth + margin || screenY > innerHeight + margin) return null;
      return { pan: clamp((screenX / innerWidth - 0.5) * 1.2, -0.7, 0.7) };
    },

    // options: { volume = 1, x, y }
    play(id, options = {}) {
      const context = this.context;
      if (!context || context.state !== 'running' || !this.settings.sfxOn || this.settings.sfxVolume <= 0) return;
      const definition = this.sounds.get(id);
      if (!definition || definition.voices >= definition.maxVoices || this.voices >= MAX_VOICES) return;
      const now = context.currentTime;
      if (now - definition.last < definition.cooldown) return;

      let pan = 0;
      if (options.x !== undefined) {
        const position = this.screenPosition(options.x, options.y);
        if (!position) return;
        pan = position.pan;
      }
      const buffer = this.bufferFor(definition);
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

    /* ---------- Musik ---------- */

    updateMusic() {
      const context = this.context;
      const wanted = context && context.state === 'running' && this.settings.musicOn && this.settings.musicVolume > 0 && this.tracks.length > 0;
      if (!wanted) { if (this.musicElement) this.musicElement.pause(); return; }
      if (!this.musicElement) {
        const element = this.musicElement = document.createElement('audio');
        element.preload = 'none';
        context.createMediaElementSource(element).connect(this.musicGain);
        element.addEventListener('ended', () => this.nextTrack());
      }
      if (!this.musicElement.src) this.nextTrack(); else this.musicElement.play().catch(() => {});
    },

    nextTrack() {
      if (!this.musicElement || !this.tracks.length) return;
      let index = Math.floor(Math.random() * this.tracks.length);
      if (this.tracks.length > 1 && this.tracks[index] === this.currentTrack) index = (index + 1) % this.tracks.length;
      this.currentTrack = this.tracks[index];
      this.musicElement.src = this.currentTrack;
      this.musicElement.play().catch(() => {});
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