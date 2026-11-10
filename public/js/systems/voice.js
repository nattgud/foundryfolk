/* Rösten i dialogerna: ett kort, varmt ljud för vissa tecken som skrivs ut (ingen ljudfil).
   Inställningarna ligger i Config.story: story.voice (grundljudet och tonlägena) och story.speakers[id].voice (talarens röst).
   I texten byter [mood] tonläge från och med den platsen (calm, happy, angry, sad, question, whisper, scared).
   Voice.parse(text) -> [{ mood, text }], Voice.speak(speaker, char, mood, progress), Voice.delay(speaker, mood, char) (ms till nästa tecken) */
(CityBuilder => {   // namnrymden skickas in: index.html tar bort window.CityBuilder efter start, och Voice använder den först när en dialog skrivs ut
  'use strict';
  const PLAIN = { pitch: 1, dark: 1, stretch: 1, slide: 0, detune: 0 };
  const VOWELS = { a: [800, 1200], e: [450, 2000], i: [320, 2300], o: [500, 900], u: [350, 700] };   // vokalens två första formanter (Hz)

  const VOWEL_PITCH = { i: 1.25, e: 1.12, a: 1, o: 0.88, u: 0.78 };   // vokalens tonhöjd (× grundtonen): i ljusast, u mörkast, a lagom
  const BASE = { å: 'o', ä: 'e', ö: 'e', æ: 'e', ø: 'e', y: 'i' };
  const baseOf = char => { const c = char.toLowerCase(); return BASE[c] || c.normalize('NFD')[0]; };   // é -> e, ü -> u ...
  const isLetter = char => /\p{L}/u.test(char);
  const isVowel = char => isLetter(char) && 'aeiouy'.includes(baseOf(char)) || 'åäöæø'.includes(char.toLowerCase());

  const settings = () => CityBuilder.Config.story.voice;
  const speakerOf = id => ({ ...PLAIN, ...CityBuilder.Config.story.speakers[id]?.voice });
  const moodOf = name => settings().moods[name] || settings().moods.calm;

  const STOPS = '.,!?;:';
  // Frasen som tecknet i står i (från förra skiljetecknet till nästa) och var i frasen stavelsen ligger: position 0-1, stavelsens nummer och antal, slutskiljetecknet.
  // Stavelser räknas som vokalgrupper, precis som i speak().
  const phraseAt = (text, i) => {
    let start = i, end = i;
    while (start > 0 && !STOPS.includes(text[start - 1])) start--;
    while (end < text.length - 1 && !STOPS.includes(text[end])) end++;
    let number = 0, total = 0;
    for (let k = start; k <= end; k++) {
      if (!isLetter(text[k]) || !isVowel(text[k]) || (k > start && isLetter(text[k - 1]) && isVowel(text[k - 1]))) continue;
      total++;
      if (k <= i) number = total;
    }
    total = Math.max(total, 1); number = Math.max(number, 1);
    return { position: total > 1 ? (number - 1) / (total - 1) : STOPS.includes(text[end]) ? 1 : 0.5, number, total, stop: STOPS.includes(text[end]) ? text[end] : '' };
  };

  CityBuilder.Voice = {
    // "[angry]Text. [sad]Mer text" -> [{ mood: 'angry', text: 'Text. ' }, { mood: 'sad', text: 'Mer text' }]. Ett tonläge gäller tills nästa; en rad börjar med calm.
    parse(text) {
      const moods = settings().moods, segments = [];
      let mood = 'calm';
      for (const [, tag, part] of text.matchAll(/(?:\[(\w+)\])?([^[]*)/g)) {
        if (tag && moods[tag]) mood = tag;
        if (part) segments.push({ mood, text: part });
      }
      return segments;
    },

    // Millisekunder till nästa tecken: talarens och tonlägets takt, längre efter skiljetecken
    delay(speaker, mood, char) {
      return (settings().speed + (/[.,!?]/.test(char) ? 140 : 0)) * moodOf(mood).speed * speakerOf(speaker).stretch ** 0.7;
    },

    // Ett ljud för tecknet (vart annat bokstavs- eller skiljetecken); progress 0-1: hur långt in i meningen tecknet står
    // text + index (valfria): hela texten och tecknets plats i den. Med dem får frasen en melodi (se phraseAt) i stället för slumpad tonhöjd.
    speak(speaker, char, mood, progress, count, text, index) {
      const Sound = CityBuilder.Sound, context = Sound?.context, S = settings();
      const previous = count > 1 ? this.previous : '';
      this.previous = char;
      // Bara bokstäver ger ljud (inte skiljetecken). syllables: ett ljud per vokalgrupp, alltså per stavelse (skriv med andra alfabet än det latinska: en bokstav, ett ljud)
      if (!isLetter(char)) return;
      if (S.syllables) { const latin = /\p{Script=Latin}/u.test(char); if (latin && (!isVowel(char) || (previous && isVowel(previous)))) return; }
      else if (count % S.every) return;
      if (!context || context.state !== 'running' || !Sound.settings.sfxOn || Sound.settings.sfxVolume <= 0) return;
      const who = speakerOf(speaker), m = moodOf(mood), t = context.currentTime, legatoSeconds = (S.legato ?? 50) / 100;
      let d = S.dur / 1000 * who.stretch * (1 + 0.4 * legatoSeconds * (text ? 1 : 0));
      const vowel = S.syllables && VOWEL_PITCH[baseOf(char)];   // ett ljud per vokalgrupp: tonhöjden följer gruppens första vokal
      const flatten = text ? 1 - 0.65 * (S.melody ?? 60) / 100 : 1;   // med melodi styr frasens kurva tonhöjden mer än vokalen (som annars gör varje stavelse hoppig)
      const letter = !S.byLetter ? 1 : 1 + ((vowel || 1 + ((char.toLowerCase().charCodeAt(0) % 12) - 6) / 24) - 1) * flatten;   // annars a-z: ±25 %
      // Melodi: tonen stiger i början av frasen och faller mot slutet, stiger i slutet av en fråga eller vid kommatecken, faller vid punkt. Ordstart betonas lite.
      // S.melody (%, 0 = av): hur stor kurvan är. Slumpvariationen minskar när melodin tar över. S.legato (%): hur mycket ljuden går in i varandra.
      const melody = text ? (S.melody ?? 60) / 100 : 0, legato = (S.legato ?? 50) / 100;
      let contour = 1, last = 1, accent = 1;
      if (melody) {
        const { position, number, stop } = phraseAt(text, index);
        contour = 1 + melody * (0.2 * Math.sin(Math.PI * position) * (number % 2 ? 1 : 0.7) - 0.1 * position);
        if (stop === '?' || m.slope > 0.3) contour += melody * 0.35 * Math.max(0, (position - 0.55) / 0.45);
        else if (stop === '.' || stop === '!') contour -= melody * 0.14 * Math.max(0, (position - 0.65) / 0.35);
        else if (stop === ',' || stop === ';') contour += melody * 0.06 * position;
        if (stop && position >= 0.99) last = 1 + 0.5 * legato;   // frasens sista stavelse dras ut
        if (index === 0 || /[\s—-]/.test(text[index - 1])) accent = 1 + 0.05 * melody;
      }
      const jitter = 1 + (Math.random() * 2 - 1) * S.vary * m.vary / 100 * (1 - 0.65 * melody), bend = 1 + m.slope * (progress - 0.5);
      const freq = S.pitch * who.pitch * m.pitch * bend * letter * jitter * contour * accent, level = S.volume * m.volume / 100;

      d *= last;
      // Glidning: ett ljud som följer tätt på förra börjar på förra ljudets tonhöjd och glider till sin egen (inte ett nytt pip varje gång)
      const startFreq = melody && this.lastEnd && t - this.lastEnd < 0.25 ? this.lastFreq : freq;
      this.lastFreq = freq * (1.03 - who.slide); this.lastEnd = t + d;
      const out = context.createGain(), lowpass = context.createBiquadFilter(), voiced = context.createGain(), source = context.createGain();
      lowpass.type = 'lowpass'; lowpass.frequency.value = S.cutoff * who.dark;
      voiced.gain.value = S.voice / 100 * 2.2;
      out.gain.setValueAtTime(0, t);   // mjuk start, rundad avklingning
      out.gain.linearRampToValueAtTime(level * (1 - S.noise / 200), t + 0.012);
      out.gain.setTargetAtTime(0, t + d * (0.45 + 0.2 * legatoSeconds * (text ? 1 : 0)), d * 0.22);

      const oscillators = [freq, who.detune && freq * 2 ** (who.detune / 1200)].filter(Boolean).map(f => {   // detune: en andra, ostämd röst
        const osc = context.createOscillator();
        osc.type = S.wave;
        const from = f * startFreq / freq;
        osc.frequency.setValueAtTime(from, t);
        if (from !== f) osc.frequency.linearRampToValueAtTime(f, t + d * 0.35);
        osc.frequency.linearRampToValueAtTime(f * (1.03 - who.slide), t + d);   // slide: tonen sjunker i varje ljud
        osc.connect(source);
        return osc;
      });
      if (who.detune) source.gain.value = 0.7;
      if (S.vibrato) {
        const lfo = context.createOscillator(), depth = context.createGain();
        lfo.frequency.value = 5.5 + Math.random();
        depth.gain.value = freq * 0.02 * S.vibrato / 100;
        lfo.connect(depth);
        for (const osc of oscillators) depth.connect(osc.frequency);
        lfo.start(t); lfo.stop(t + d + 0.05);
      }
      // Formanter: vokalen i bokstaven formar klangen (konsonanter är neutrala)
      for (const [frequency, q, gain] of (f => [[f[0], 5, 1], [f[1], 7, 0.55]])(VOWELS[baseOf(char)] || [500, 1500])) {
        const band = context.createBiquadFilter(), amount = context.createGain();
        band.type = 'bandpass'; band.frequency.value = frequency; band.Q.value = q; amount.gain.value = gain;
        source.connect(band).connect(amount).connect(voiced);
      }
      voiced.connect(lowpass);
      if (S.voice < 100) { const body = context.createGain(); body.gain.value = 1 - S.voice / 100; source.connect(body).connect(lowpass); }
      if (S.noise) {   // lite luft
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * d), context.sampleRate), data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const air = context.createBufferSource(), band = context.createBiquadFilter(), gain = context.createGain();
        air.buffer = buffer; band.type = 'bandpass'; band.frequency.value = Math.min(freq * 2, 8000); band.Q.value = 1.2;
        gain.gain.setValueAtTime(level * S.noise / 100, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
        air.connect(band).connect(gain).connect(Sound.sfxGain);
        air.start(t);
      }
      lowpass.connect(out).connect(Sound.sfxGain);
      for (const osc of oscillators) { osc.start(t); osc.stop(t + d + 0.05); }
    },
  };
})(window.CityBuilder);
