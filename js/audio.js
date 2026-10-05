// Procedural audio (WebAudio only, no files): ambience, original generated music, SFX.
// Instruments are rendered into AudioBuffers once (additive / Karplus-Strong) and replayed by a lookahead scheduler.
(function (C) {
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = (s) => NOTE[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0);
  const mid = (s) => { const m = /^([A-G][#b]?)(\d)$/.exec(s); return 12 * (+m[2] + 1) + pc(m[1]); };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const QUAL = { '': [4, 7], m: [3, 7], 7: [4, 7, 10], maj7: [4, 7, 11], m7: [3, 7, 10] };
  const LOOK = 1.2;

  // ---------- music notation helpers ----------
  const P = (...a) => a.join(' ');
  function seq(str) { // "E5/2 -/1 G5/0.5" -> [[beat, midi, dur]]
    const out = []; let b = 0;
    for (const tk of str.trim().split(/\s+/)) {
      const [n, d] = tk.split('/'), dur = parseFloat(d);
      if (n !== '-') out.push([b, mid(n), dur]);
      b += dur;
    }
    out.total = b; return out;
  }
  function chord(name) {
    const m = /^([A-G][#b]?)(m7|maj7|m|7)?(?:\/([A-G][#b]?))?$/.exec(name);
    const q = QUAL[m[2] || ''], r = 48 + pc(m[1]), bass = m[3] ? 48 + pc(m[3]) : r;
    return [bass, r + q[1], r + 12, r + 12 + q[0], r + 12 + (q[2] || q[1])]; // bass, 5th, root+8, 3rd+8, 7th/5th+8
  }
  function build(def) {
    const bars = def.bars, ev = [], warn = [];
    for (const t of def.tracks) {
      const vm = t.v || 0.6, oct = t.oct || 0;
      if (t.seq) {
        const s = seq(t.seq);
        if (s.total > bars * 4 + 1e-6) warn.push(def.name + ' melody too long ' + s.total);
        for (const [b, m, d] of s) ev.push([b, t.i, m + oct, d, vm]);
      }
      if (t.ch) {
        const names = t.ch.trim().split(/\s+/), to = t.to == null ? bars : t.to, from = t.from || 0;
        names.forEach((nm, b) => {
          if (b < from || b >= to || b >= bars || nm === '-') return;
          const v = chord(nm), B = b * 4;
          const add = (beat, n, d, vel) => ev.push([B + beat, t.i, n + oct, d, vm * vel]);
          switch (t.pat) {
            case 'arp8': [0, 1, 2, 3, 4, 3, 2, 1].forEach((x, k) => add(k * 0.5, v[x], 1.5, k ? 0.6 : 0.9)); break;
            case 'pick': [0, 2, 3, 2, 1, 2, 3, 2].forEach((x, k) => add(k * 0.5, v[x], 1.5, k % 4 ? 0.55 : 0.9)); break;
            case 'bounce':
              add(0, v[0], 1, 0.9); add(2, v[1], 1, 0.7);
              [1, 3].forEach((bt) => [v[1], v[2], v[3]].forEach((n, j) => add(bt + j * 0.03, n, 0.9, 0.5))); break;
            case 'sparse': add(0, v[0], 4, 0.8); add(2, v[2], 3, 0.45); break;
            case 'pad': [v[0], v[1], v[3], v[4]].forEach((n) => add(0, n, 4.4, 1)); break;
            default: v.slice(0, 4).forEach((n, j) => add(j * 0.02, n, 3, 0.7));
          }
        });
      }
    }
    ev.sort((a, b) => a[0] - b[0]);
    return { name: def.name, spb: 60 / def.bpm, len: bars * 4, ev, dyn: def.dyn, warn };
  }

  // ---------- original compositions (4 bars = 16 beats per phrase) ----------
  const S1 = 'A5/3 C6/1 G5/2 E5/2 F5/3 D5/1 D5/2 F5/2';
  const S2 = 'C6/3 F6/1 E6/2 G6/2 D6/2 A5/2 Bb5/2 D6/2';
  const S3 = 'D6/2 Bb5/2 A5/2 D6/2 F6/2 D6/2 E6/2 G6/2';
  const S4 = 'A6/3 F6/1 G6/2 E6/2 F6/2 A6/2 D6/4';
  const S5 = 'Bb6/2 G6/2 A6/2 E6/2 D6/2 F6/2 G6/2 E6/2';
  const S6 = 'C6/2 A5/2 G5/2 E5/2 F5/2 D5/2 D5/4';
  const S7 = 'Bb5/2 D6/2 C6/2 E6/2 F6/4 A5/4';
  const M1 = 'E5/1 G5/1 C6/1 G5/1 E5/1 A5/1 C6/1 A5/1 F5/1 A5/1 C6/2 B5/1 G5/1 D5/2';
  const M2 = 'G5/1 E5/1 C5/2 A5/1 C6/1 E6/2 D6/1 C6/1 A5/1 F5/1 G5/2 B5/2';
  const M3 = 'A5/2 C6/2 B5/1 D6/1 G5/2 G5/1 B5/1 E6/2 C6/1 B5/1 A5/2';
  const M4 = 'F5/1 A5/1 D6/2 D6/1 B5/1 G5/2 E5/2 G5/1 C6/1 C6/4';
  const DEFS = {
    // D major, 66 bpm, 24 bars (~87 s). Solo piano.
    title: { bpm: 66, bars: 24,
      tracks: [
        { i: 'piano', v: 0.75, seq: P('F#5/2 A5/1 B5/1 A5/3 F#5/1 D5/2 F#5/2 E5/2 C#5/2', 'A5/2 C#6/2 B5/2 A5/1 F#5/1 G5/3 B5/1 A5/4',
          'B5/1.5 A5/0.5 G5/2 E5/2 C#5/2 A5/3 F#5/1 D5/2 F#5/2', 'G5/2 B5/2 C#6/2 A5/2 F#5/2 A5/2 D6/4',
          'D6/2 B5/2 B5/2 G5/2 A5/2 F#5/2 E5/3 -/1', 'B5/2 D6/2 G5/2 B5/2 C#6/2 E6/2 D6/4') },
        { i: 'piano', v: 0.4, oct: -12, pat: 'arp8',
          ch: 'Dmaj7 Bm7 Gmaj7 A F#m7 Bm7 Em7 A Gmaj7 A F#m7 Bm7 Em7 A7 Dmaj7 Dmaj7 Bm7 Gmaj7 Dmaj7 A Gmaj7 Em7 A Dmaj7' }] },
    // C major, 104 bpm, 32 bars (~74 s). Music box + nylon-ish guitar, glockenspiel in second half.
    town: { bpm: 104, bars: 32,
      tracks: [
        { i: 'box', v: 0.7, seq: P(M1, M2, M3, M4, M3, M4, M1, M2) },
        { i: 'glock', v: 0.35, seq: P('-/64', M3, M4, M1, M2) },
        { i: 'guitar', v: 0.6, pat: 'bounce', to: 16, ch: 'C Am F G C Am Dm G F G Em Am Dm G C C' },
        { i: 'guitar', v: 0.55, pat: 'pick', from: 16, ch: '- - - - - - - - - - - - - - - - F G Em Am Dm G C C C Am F G C Am Dm G' }] },
    // G major, 92 bpm, 24 bars (~63 s). Rising: guitar picking, piano melody, strings enter at bar 4.
    tram: { bpm: 92, bars: 24, dyn: [[0, 0.55], [8, 0.75], [16, 0.95], [24, 1]],
      tracks: [
        { i: 'piano', v: 0.65, seq: P('D5/1 G5/1 B5/2 A5/1 D6/1 F#5/2 G5/1 B5/1 E6/2 D6/1 B5/1 F#5/2',
          'E5/1 G5/1 C6/2 D5/1 G5/1 B5/2 C6/1 E6/1 A5/2 F#5/2 A5/2', 'B5/2 E6/2 C6/2 G5/2 B5/1 D6/1 G6/2 A5/2 D6/2',
          'G6/2 E6/2 E6/2 C6/2 C6/1 E6/1 A6/2 A6/2 F#6/2', 'B5/2 D6/2 A5/1 F#5/1 D5/2 G5/2 B5/2 F#5/2 D5/2',
          'E6/2 C6/2 D6/2 F#6/2 G6/4 D6/4') },
        { i: 'guitar', v: 0.6, pat: 'pick', ch: 'G D/F# Em Bm C G/B Am D G D/F# Em Bm C D Em Em Em C G D Em C Am D G D/F# Em Bm C D G G' },
        { i: 'pad', v: 0.5, from: 4, ch: 'G D/F# Em Bm C G/B Am D G D/F# Em Bm C D Em Em Em C G D Em C Am D G D/F# Em Bm C D G G', pat: 'pad' },
        { i: 'glock', v: 0.35, seq: P('-/48', 'G6/2 E6/2 E6/2 C6/2 C6/1 E6/1 A6/2 A6/2 F#6/2') }] },
    // F major, 68 bpm, 28 bars (~99 s). Piano + strings, swells to bar 16-20 then falls quiet.
    sunset: { bpm: 68, bars: 28, dyn: [[0, 0.4], [4, 0.55], [8, 0.7], [12, 0.88], [16, 1], [20, 0.9], [24, 0.55], [28, 0.3]],
      tracks: [
        { i: 'piano', v: 0.8, seq: P(S1, S2, S3, S4, S5, S6, S7) },
        { i: 'piano', v: 0.38, oct: -12, pat: 'arp8', ch: 'F C/E Dm Bb F C/E Dm Bb Gm Dm/F Bb C F C/E Dm Bb Gm Am Bb C F C/E Dm Bb Gm C F F' },
        { i: 'pad', v: 0.7, from: 4, to: 27, ch: 'F C/E Dm Bb F C/E Dm Bb Gm Dm/F Bb C F C/E Dm Bb Gm Am Bb C F C/E Dm Bb Gm C F F', pat: 'pad' },
        { i: 'glock', v: 0.3, seq: P('-/48', S4, S5) }] },
    // Bb major, 70 bpm, 24 bars (~82 s). Warm, slow: guitar picking, piano melody, soft pad.
    lantern: { bpm: 70, bars: 24, dyn: [[0, 0.7], [12, 1], [24, 0.8]],
      tracks: [
        { i: 'piano', v: 0.65, seq: P('D5/2 F5/1 A5/1 G5/3 -/1 Eb5/2 G5/2 A5/2 C6/2', 'Bb5/2 A5/1 F5/1 D5/2 G5/2 Bb5/3 G5/1 A5/4',
          'F5/2 A5/2 Bb5/2 D6/2 C6/2 Bb5/1 G5/1 A5/2 F5/2', 'G5/2 Bb5/2 A5/2 C6/2 D6/4 -/4',
          'D6/2 Bb5/2 G5/2 Bb5/2 F5/3 D5/1 C6/2 A5/2', 'G5/2 Bb5/2 Eb5/2 G5/2 A5/2 C6/2 Bb5/4') },
        { i: 'guitar', v: 0.6, pat: 'pick', ch: 'Bbmaj7 Gm7 Cm7 F7 Bbmaj7 Gm7 Eb F Dm7 Gm7 Cm7 F Ebmaj7 F Bb Bb Gm7 Eb Bbmaj7 F Ebmaj7 Cm7 F Bb' },
        { i: 'pad', v: 0.45, from: 4, ch: 'Bbmaj7 Gm7 Cm7 F7 Bbmaj7 Gm7 Eb F Dm7 Gm7 Cm7 F Ebmaj7 F Bb Bb Gm7 Eb Bbmaj7 F Ebmaj7 Cm7 F Bb', pat: 'pad' }] },
    // A minor, 60 bpm, 24 bars (96 s). Rain: sparse piano, a few low strings.
    station: { bpm: 60, bars: 24,
      tracks: [
        { i: 'piano', v: 0.7, seq: P('E5/3 -/1 C5/4 E5/2 G5/2 D5/3 -/1', 'A5/2 -/2 A5/1 G5/1 F5/2 F5/4 G#5/2 B5/2',
          'A5/3 -/1 G5/4 F5/2 A5/2 E5/4', 'C6/3 -/1 B5/2 G5/2 A5/2 F5/2 G#5/4',
          'E5/2 A5/2 D5/2 B4/2 C5/2 F5/2 G#4/3 B4/1', 'F5/3 -/1 A5/3 -/1 E5/4 -/4') },
        { i: 'piano', v: 0.5, oct: -12, pat: 'sparse', ch: 'Am Fmaj7 C G Am Fmaj7 Dm E Fmaj7 C Dm Am Fmaj7 Em Dm E Am G Fmaj7 E Dm Fmaj7 Am Am' },
        { i: 'pad', v: 0.3, oct: -12, pat: 'pad', ch: 'Am Fmaj7 C G Am Fmaj7 Dm E Fmaj7 C Dm Am Fmaj7 Em Dm E Am G Fmaj7 E Dm Fmaj7 Am Am' }] },
    // C major, 60 bpm, 20 bars (80 s): 8 bars of a few notes, then silence.
    farewell: { bpm: 60, bars: 20,
      tracks: [
        { i: 'piano', v: 0.65, seq: 'G5/4 E5/4 A5/4 G5/4 E5/4 D5/4 C5/8' },
        { i: 'piano', v: 0.4, oct: -12, pat: 'sparse', ch: 'C Am F G C F C C' },
        { i: 'pad', v: 0.25, oct: -12, pat: 'pad', to: 8, ch: 'C Am F G C F C C' }] },
    // F major, 60 bpm, 20 bars (80 s). Music-box version of the sunset theme.
    epilogue: { bpm: 60, bars: 20, dyn: [[0, 0.8], [16, 1], [20, 0.6]],
      tracks: [
        { i: 'box', v: 0.75, seq: P(S1, S2, S3, S6, S7) },
        { i: 'box', v: 0.3, oct: 12, pat: 'arp8', ch: 'F C/E Dm Bb F C/E Dm Bb Gm Dm/F Bb C F C/E Dm Bb Gm C F F' },
        { i: 'pad', v: 0.4, from: 8, oct: -12, pat: 'pad', ch: '- - - - - - - - Gm Dm/F Bb C F C/E Dm Bb Gm C F F' }] }
  };
  for (const k in DEFS) DEFS[k].name = k;
  const BUILT = {};

  // ---------- instrument rendering (pure JS, ctx independent) ----------
  function addP(d, sr, f, a, tau) { // damped sinusoid by recurrence, added into d
    const w = 2 * Math.PI * f / sr; if (w > 2.8 || a < 1e-4) return;
    const r = Math.exp(-1 / (tau * sr)), c = 2 * r * Math.cos(w), r2 = r * r;
    const n = Math.min(d.length, Math.ceil(tau * sr * Math.log(a / 1e-4)) + 2);
    let y2 = 0, y1 = a * r * Math.sin(w); if (n > 1) d[1] += y1;
    for (let i = 2; i < n; i++) { const y = c * y1 - r2 * y2; d[i] += y; y2 = y1; y1 = y; }
  }
  function renderNote(inst, m, sr) {
    const f = hz(m), out = []; let len, parts, B = 0, att = 0.008;
    if (inst === 'piano') {
      const T = clamp(2.4 - (m - 60) * 0.04, 0.7, 3.2); len = Math.min(5, T * 3.2 + 0.4); B = 0.0003; att = 0.012;
      parts = [[1, 1, T], [2, 0.55, T * 0.7], [3, 0.35, T * 0.5], [4, 0.2, T * 0.4], [5, 0.12, T * 0.3], [6, 0.08, T * 0.25], [7, 0.04, T * 0.2], [1, 0.3, T * 2.5]];
    } else if (inst === 'box') { len = 2.6; att = 0.002; parts = [[1, 1, 1.5], [2, 0.3, 0.5], [4.1, 0.12, 0.25], [6.27, 0.05, 0.12]]; }
    else if (inst === 'glock') { len = 2.2; att = 0.002; parts = [[1, 1, 1.3], [2.76, 0.5, 0.5], [5.4, 0.25, 0.25], [8.93, 0.1, 0.1]]; }
    if (parts) {
      for (let c = 0; c < 2; c++) {
        const d = new Float32Array(Math.floor(len * sr)), det = 1 + (c ? -0.0005 : 0.0005);
        for (const p of parts) addP(d, sr, f * p[0] * Math.sqrt(1 + B * p[0] * p[0]) * det, p[1] * (c ? 0.95 : 1), p[2]);
        out.push(d);
      }
    } else { // Karplus-Strong plucked string (guitar)
      len = 2.4; const n = Math.floor(len * sr), d = new Float32Array(n), N = sr / f - 0.5, Ni = Math.floor(N), fr = N - Ni;
      let s = (m * 9301 + 49297) % 233280, lp = 0;
      for (let i = 0; i < Ni + 2; i++) { s = (s * 9301 + 49297) % 233280; lp += 0.45 * ((s / 233280) * 2 - 1 - lp); d[i] = lp * 2; }
      for (let i = Ni + 2; i < n; i++) {
        const a = d[i - Ni] * (1 - fr) + d[i - Ni - 1] * fr, b = d[i - Ni - 1] * (1 - fr) + d[i - Ni - 2] * fr;
        d[i] = 0.9972 * 0.5 * (a + b);
      }
      out.push(d); att = 0.001;
    }
    let pk = 1e-6; for (const d of out) for (let i = 0; i < d.length; i += 3) pk = Math.max(pk, Math.abs(d[i]));
    const g = 0.5 / pk, na = Math.floor(att * sr);
    for (const d of out) {
      const n = d.length, nf = Math.floor(0.25 * sr);
      for (let i = 0; i < n; i++) d[i] *= g * (i < na ? i / na : 1) * (i > n - nf ? (n - i) / nf : 1);
    }
    return out;
  }
  const INSTV = { piano: 1, box: 0.8, glock: 0.5, guitar: 0.9, pad: 1 };
  const INSTP = { piano: 0, box: 0.25, glock: -0.3, guitar: -0.3, pad: 0 };

  // ---------- the engine ----------
  C.Audio = function () {
    const A = this.ctx = new (window.AudioContext || window.webkitAudioContext)(), S = this, sr = A.sampleRate;
    const gain = (v) => { const g = A.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q = 1) => { const x = A.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
    const osc = (type, f) => { const o = A.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    this.master = gain(0.9); this.muted = false;
    const comp = A.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    this.master.connect(comp); comp.connect(A.destination);
    // reverb (generated impulse response)
    const irLen = Math.floor(sr * 2.8), ir = A.createBuffer(2, irLen, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0, pre = Math.floor(sr * 0.012);
      for (let i = pre; i < irLen; i++) { const t = (i - pre) / sr; lp += (0.55 - Math.min(0.45, t * 0.25)) * (Math.random() * 2 - 1 - lp); d[i] = lp * Math.exp(-t * 2.4) * 0.9; } }
    this.conv = A.createConvolver(); this.conv.buffer = ir; this.revOut = gain(0.55); this.conv.connect(this.revOut); this.revOut.connect(this.master);
    // buses
    this.mus = gain(0.55); this.hp = filt('highpass', 20, 0.7); this.lp = filt('lowpass', 20000, 0.7);
    this.mOut = gain(1); this.send = gain(0.35);
    this.mus.connect(this.hp); this.hp.connect(this.lp); this.lp.connect(this.mOut); this.mOut.connect(this.master); this.lp.connect(this.send); this.send.connect(this.conv);
    this.sfxB = gain(0.8); this.sfxB.connect(this.master); const sfxSend = gain(0.18); this.sfxB.connect(sfxSend); sfxSend.connect(this.conv);
    this.ambB = filt('lowpass', 18000, 0.5); this.ambOut = gain(1); this.ambB.connect(this.ambOut); this.ambOut.connect(this.master);
    this.duck = 1; this.ear = false;
    // noise buffers
    const mk = (secs, brown) => { const b = A.createBuffer(1, Math.floor(sr * secs), sr), d = b.getChannelData(0); let l = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; } return b; };
    this.W = mk(3, 0); this.Br = mk(6, 1);
    const loopN = (buf) => { const s = A.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
    const chain = (src, ...n) => { let x = src; for (const y of n) { x.connect(y); x = y; } x.connect(this.ambB); return n[n.length - 1]; };
    // ambience layers (gain nodes, driven in update)
    const ag = this.ag = {};
    ag.waves = chain(loopN(this.Br), filt('lowpass', 650), gain(0));
    ag.wavesHi = chain(loopN(this.W), filt('bandpass', 1900, 0.6), gain(0));
    this.windF = filt('bandpass', 380, 0.8); ag.wind = chain(loopN(this.Br), this.windF, gain(0));
    ag.rain = chain(loopN(this.W), filt('highpass', 1200), filt('lowpass', 8000), gain(0));
    ag.rainLow = chain(loopN(this.Br), filt('lowpass', 420), gain(0));
    ag.town = chain(loopN(this.Br), filt('bandpass', 260, 0.5), gain(0));
    ag.rumble = chain(loopN(this.Br), filt('lowpass', 150), gain(0));
    const cic = gain(0), trem = gain(0.5), lfo = osc('sine', 38), la = gain(0.5); lfo.connect(la); la.connect(trem.gain);
    chain(loopN(this.W), filt('bandpass', 5200, 6), trem, cic); ag.cicada = cic;
    ag.cricket = gain(0); ag.cricket.connect(this.ambB);
    [[4300, 3.2], [4650, 2.7]].forEach(([f, r]) => { const o = osc('sine', f), gt = gain(0.5), l = osc('square', r), la2 = gain(0.5); l.connect(la2); la2.connect(gt.gain); o.connect(gt); gt.connect(ag.cricket); });
    this.cur0 = { waves: 0, wind: 0, birds: 0, rain: 0, town: 0, cicada: 0, crickets: 0 }; this.cur = { ...this.cur0 }; this.setA = {};
    this.birdT = 3; this.clackT = 0; this.chuffT = 0; this.crossOn = false; this.cr = null; this.piece = null; this.cache = new Map(); this.queue = [];
    this.helpers();
    if (A.state === 'suspended') A.resume();
    this.timer = setInterval(() => this.tick(), 100);
  };
  const AP = C.Audio.prototype;
  C.Audio._pieces = DEFS; C.Audio._build = build; C.Audio._render = renderNote;

  // ---------- low-level sound helpers ----------
  AP.helpers = function () {
    const A = this.ctx, S = this;
    const out = (n, o) => { if (o.pan) { const p = A.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; } n.connect(o.bus || S.sfxB); };
    const env = (pr, t, o) => {
      pr.setValueAtTime(0.0001, t);
      if (o.e) { for (const [dt, v] of o.e) pr.linearRampToValueAtTime(Math.max(v * o.v, 0.0001), t + dt); }
      else { const a = o.a == null ? 0.005 : o.a; pr.linearRampToValueAtTime(o.v, t + a); pr.setTargetAtTime(0, t + a, Math.max(0.005, (o.dur - a) / 4)); }
    };
    this.tn = (t, f, o) => { // oscillator with envelope
      const g = A.createGain(), os = A.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(f, t);
      if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
      if (o.vib) { const l = A.createOscillator(), lg = A.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + o.dur + 0.3); }
      env(g.gain, t, o); os.connect(g); out(g, o); os.start(t); os.stop(t + o.dur + 0.3); return g;
    };
    this.nz = (t, dur, o) => { // filtered noise burst with envelope
      const s = A.createBufferSource(), f = A.createBiquadFilter(), g = A.createGain();
      s.buffer = o.brown ? S.Br : S.W; s.loop = true; f.type = o.ft || 'bandpass'; f.Q.value = o.q || 1; f.frequency.setValueAtTime(o.f || 1000, t);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
      o.dur = dur; env(g.gain, t, o); s.connect(f); f.connect(g); out(g, o); s.start(t, Math.random() * 2); s.stop(t + dur + 0.3);
    };
  };
  AP.bellTone = function (t, f, v, dur, o = {}) { // metallic bell strike
    [[1, 1, 1], [2.32, 0.5, 0.55], [3.9, 0.3, 0.35], [5.6, 0.12, 0.2]].forEach(([r, a, d]) => this.tn(t, f * r, { dur: dur * d, v: v * a, a: 0.002, pan: o.pan, bus: o.bus }));
  };
  AP.clack = function (t, v) { this.nz(t, 0.07, { f: 900, q: 1.5, v: 0.25 * v, a: 0.001 }); this.tn(t, 95, { dur: 0.1, v: 0.3 * v, a: 0.002 }); };
  AP.chuff = function (t, v, strong) { this.nz(t, 0.22, { ft: 'lowpass', f: 900, f2: 200, v: (strong ? 0.5 : 0.35) * v, a: 0.015, brown: 1 }); this.nz(t, 0.1, { f: 1500, q: 0.6, v: 0.1 * v, a: 0.01 }); };
  AP.bird = function (v) {
    const t = this.ctx.currentTime + 0.05, pan = Math.random() * 1.4 - 0.7, bus = this.ambB, V = 0.05 * v;
    if (Math.random() < 0.4) { // bush warbler: long whistle, then a quick rising phrase
      this.tn(t, 1000, { f2: 1120, dur: 0.55, v: V, a: 0.12, pan, bus });
      [[0.85, 0.1, 2300], [1.0, 0.1, 2700], [1.15, 0.16, 3000], [1.38, 0.2, 3300]].forEach(([d, l, f]) => this.tn(t + d, f, { f2: f * 1.4, dur: l, v: V * 0.9, a: 0.01, pan, bus }));
    } else { const f0 = 3000 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.tn(t + i * 0.11, f0 * (1 + Math.random() * 0.2), { f2: f0 * (0.8 + Math.random() * 0.6), dur: 0.07, v: V * 0.7, a: 0.008, pan, bus }); }
  };

  // ---------- per-frame update ----------
  AP.update = function (env) {
    const A = this.ctx, now = A.currentTime, dt = clamp(env.dt || 0.016, 0.001, 0.2), tm = env.time || now, p = env.player || { y: 0 };
    const tr = env.train || {}, night = env.night || 0, h = env.hour == null ? 12 : env.hour, rain = env.rain || 0, indoor = !!env.indoor;
    const dayLvl = (1 - clamp(night * 2, 0, 1)) * (h > 5 && h < 17.5 ? 1 : 0.2);
    const D = { waves: (env.nearSea || 0) * 0.9, wind: 0.2 + 0.4 * clamp((p.y - 8) / 40, 0, 1) + 0.2 * rain, birds: dayLvl * (1 - rain) * (indoor ? 0.2 : 0.7),
      rain, town: 0, cicada: 0, crickets: clamp(night - 0.3, 0, 1) * (1 - rain) * 0.8 };
    const k = 1 - Math.exp(-dt * 1.2), c = this.cur;
    for (const key in D) { const tgt = this.setA[key] != null ? this.setA[key] : D[key]; c[key] += (tgt - c[key]) * k; }
    const sw = 0.6 + 0.4 * Math.sin(tm * 0.8) * Math.sin(tm * 0.31 + 1), ag = this.ag, set = (g, v) => g.gain.setTargetAtTime(v, now, 0.12);
    set(ag.waves, c.waves * 0.55 * sw); set(ag.wavesHi, c.waves * 0.07 * sw * sw);
    set(ag.wind, c.wind * 0.2 * (0.8 + 0.2 * Math.sin(tm * 0.2))); this.windF.frequency.setTargetAtTime(330 + 140 * Math.sin(tm * 0.17) + 200 * c.wind, now, 0.3);
    set(ag.rain, c.rain * 0.22); set(ag.rainLow, c.rain * 0.3); set(ag.town, c.town * 0.1);
    set(ag.cicada, c.cicada * 0.05); set(ag.cricket, c.crickets * 0.014);
    this.ambB.frequency.setTargetAtTime(indoor ? 800 : 18000, now, 0.25);
    this.ambOut.gain.setTargetAtTime((indoor ? 0.7 : 1) * this.duck, now, 0.2);
    // birds + rain drips
    if (c.birds > 0.05 && (this.birdT -= dt) <= 0) { this.bird(c.birds); this.birdT = 2 + Math.random() * 7 / (c.birds + 0.2); }
    if (c.rain > 0.2 && Math.random() < dt * c.rain * 3) this.tn(now + 0.01, 1800 + Math.random() * 1500, { f2: 900, dur: 0.04, v: 0.012, a: 0.002, pan: Math.random() * 2 - 1, bus: this.ambB });
    // train
    const near = tr.near || 0, mv = tr.moving && near > 0.03;
    set(ag.rumble, mv ? near * 0.5 : 0);
    if (mv && !tr.steam && (this.clackT -= dt) <= 0) { this.clack(now + 0.01, near * 0.5); this.clack(now + 0.1, near * 0.4); this.clackT = 0.36; }
    if (mv && tr.steam && (this.chuffT -= dt) <= 0) { this.chuff(now + 0.01, near, this.chuffN = !this.chuffN); this.chuffT = 0.3; }
    // crossing bell follows env.crossing edges
    if (env.crossing && !this.crossOn) this.sfx('crossing'); else if (!env.crossing && this.crossOn) this.sfx('crossingStop');
    this.crossOn = !!env.crossing;
  };
  AP.setAmbience = function (o) { for (const k in o) this.setA[k] = o[k] == null ? undefined : o[k]; if (o.crickets === undefined && o.cricket != null) this.setA.crickets = o.cricket; };
  AP.setEarphones = function (on) {
    const A = this.ctx, t = A.currentTime; this.ear = !!on; this.duck = on ? 0.4 : 1;
    this.hp.frequency.setTargetAtTime(on ? 260 : 20, t, 0.3); this.lp.frequency.setTargetAtTime(on ? 5200 : 20000, t, 0.3);
    this.send.gain.setTargetAtTime(on ? 0.12 : 0.35, t, 0.3); this.mOut.gain.setTargetAtTime(on ? 1.25 : 1, t, 0.3);
  };
  AP.toggleMute = function () { this.muted = !this.muted; this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.08); return this.muted; };

  // ---------- music ----------
  AP.R = function (inst, m) {
    const key = inst + m; let b = this.cache.get(key);
    if (!b) { const ch = renderNote(inst, m, this.ctx.sampleRate); b = this.ctx.createBuffer(ch.length, ch[0].length, this.ctx.sampleRate); ch.forEach((d, i) => b.copyToChannel(d, i)); this.cache.set(key, b); }
    return b;
  };
  AP.music = function (name, o = {}) {
    const A = this.ctx, now = A.currentTime, fade = o.fade == null ? 3 : o.fade, vol = o.vol == null ? 1 : o.vol, old = this.piece;
    if (old && old.name === name && !old.dead) { old.gain.gain.setTargetAtTime(vol, now, fade / 3); return; }
    if (old) { old.dead = true; const g = old.gain.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade + 0.01); setTimeout(() => { try { old.gain.disconnect(); } catch (e) {} }, (fade + 4) * 1000); }
    this.piece = null; if (!name || !DEFS[name]) return;
    const b = BUILT[name] || (BUILT[name] = build(DEFS[name])); if (b.warn.length) console.warn(b.warn.join('; '));
    const p = { ...b, idx: 0, loop: 0, t0: now + 0.25, buses: {}, dead: false, gain: A.createGain() };
    p.gain.gain.setValueAtTime(0, now); p.gain.gain.linearRampToValueAtTime(vol, now + Math.max(0.05, fade)); p.gain.connect(this.mus);
    this.queue = []; const seen = {}; for (const e of b.ev) { if (e[1] === 'pad') continue; const k = e[1] + e[2]; if (!seen[k]) { seen[k] = 1; this.queue.push([e[1], e[2]]); } }
    this.piece = p;
  };
  AP.dynAt = function (p, beat) {
    const d = p.dyn; if (!d) return 1; const bar = beat / 4;
    for (let i = 1; i < d.length; i++) if (bar <= d[i][0]) { const a = d[i - 1], b = d[i]; return a[1] + (b[1] - a[1]) * (bar - a[0]) / (b[0] - a[0]); }
    return d[d.length - 1][1];
  };
  AP.playEv = function (p, e, t) {
    const A = this.ctx, inst = e[1], v = e[4] * this.dynAt(p, e[0]) * (0.9 + Math.random() * 0.2);
    let bus = p.buses[inst];
    if (!bus) { bus = p.buses[inst] = A.createGain(); bus.gain.value = INSTV[inst]; const pn = A.createStereoPanner(); pn.pan.value = INSTP[inst]; bus.connect(pn); pn.connect(p.gain); }
    if (inst === 'pad') { // slow strings: two detuned saws through a lowpass
      const dur = e[3] * p.spb, g = A.createGain(), lp = A.createBiquadFilter(), f = hz(e[2]); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.3;
      const pk = v * 0.05; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 1.4); g.gain.setValueAtTime(pk, t + Math.max(1.4, dur)); g.gain.linearRampToValueAtTime(0, t + dur + 1.6);
      [-7, 7].forEach((dt) => { const o = A.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dur + 1.7); });
      lp.connect(g); g.connect(bus); return;
    }
    const s = A.createBufferSource(), g = A.createGain(); s.buffer = this.R(inst, e[2]); g.gain.value = v; s.connect(g); g.connect(bus); s.start(t);
  };

  // ---------- scheduler tick (100 ms) ----------
  AP.tick = function () {
    const A = this.ctx, now = A.currentTime, p = this.piece;
    if (p && !p.dead && A.state === 'running') {
      let guard = 400;
      while (guard-- > 0) {
        const e = p.ev[p.idx], t = p.t0 + p.loop * p.len * p.spb + e[0] * p.spb + (Math.random() - 0.5) * 0.012;
        if (t > now + LOOK) break;
        if (t > now - 0.05) this.playEv(p, e, Math.max(t, now)); else if (p.loop === 0 && p.idx === 0) p.t0 += now - t; // first events late: shift start
        if (++p.idx >= p.ev.length) { p.idx = 0; p.loop++; }
      }
    }
    const t0 = performance.now(); while (this.queue.length && performance.now() - t0 < 6) { const q = this.queue.shift(); this.R(q[0], q[1]); }
    const cr = this.cr; // level-crossing bell: two bells strike alternately
    if (cr) while (cr.next < now + LOOK) { this.bellTone(Math.max(cr.next, now), cr.k++ % 2 ? 1290 : 1530, 0.2 * cr.v, 0.6, { pan: cr.pan }); cr.next += 0.46; }
  };

  // ---------- sound effects ----------
  AP.sfx = function (name, o = {}) {
    const f = SFX[name]; if (!f) return; const A = this.ctx; f.call(this, o, A.currentTime + 0.02 + (o.delay || 0), o.vol == null ? 1 : o.vol);
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const SFX = {
    crossing(o, t, v) { if (!this.cr) { this.cr = { next: t, k: 0, v: o.vol == null ? 0.7 : o.vol, pan: o.pan || 0 }; this.crossOn = true; } },
    crossingStop() { this.cr = null; },
    trainPass(o, t, v) {
      const d = o.dur || 7;
      this.nz(t, d, { brown: 1, ft: 'lowpass', f: 220, q: 0.7, v: 0.9 * v, e: [[d * 0.15, 0.3], [d * 0.45, 1], [d * 0.55, 1], [d, 0]], pan: o.pan });
      this.nz(t, d, { f: 520, f2: 240, q: 0.5, v: 0.25 * v, e: [[d * 0.3, 0.1], [d * 0.5, 1], [d * 0.6, 0.7], [d, 0]], pan: o.pan });
      for (let x = 0.2; x < d - 0.2; x += 0.17) { const k = Math.sin(Math.PI * x / d); this.clack(t + x, v * k * 0.5); this.clack(t + x + 0.08, v * k * 0.4); }
    },
    trainArrive(o, t, v) {
      const e = [[0.4, 0.4], [2.2, 1], [3.0, 0.6], [3.3, 0]];
      this.nz(t, 3.3, { f: 2600, f2: 1800, q: 8, v: 0.12 * v, e, pan: o.pan });
      this.tn(t + 0.2, 1900, { f2: 1500, dur: 3, type: 'square', v: 0.008 * v, e, pan: o.pan });
      this.nz(t, 3.3, { brown: 1, ft: 'lowpass', f: 180, v: 0.5 * v, e: [[0.3, 1], [2.8, 0.5], [3.3, 0]], pan: o.pan });
      this.nz(t + 3.3, 1.3, { ft: 'highpass', f: 2500, v: 0.18 * v, a: 0.05, pan: o.pan });
    },
    doorChime(o, t, v) { [[880, 0], [659, 0.55]].forEach(([f, d]) => { this.tn(t + d, f, { dur: 1.2, v: 0.18 * v, a: 0.004, pan: o.pan }); this.tn(t + d, f * 2, { dur: 0.5, v: 0.04 * v, pan: o.pan }); }); },
    doorClose(o, t, v) {
      this.nz(t, 0.7, { ft: 'highpass', f: 3500, v: 0.25 * v, a: 0.03, pan: o.pan });
      this.tn(t + 0.65, 90, { f2: 50, dur: 0.18, v: 0.5 * v, pan: o.pan }); this.nz(t + 0.65, 0.1, { ft: 'lowpass', f: 500, v: 0.3 * v, pan: o.pan });
    },
    steamWhistle(o, t, v) {
      const e = [[0.15, 1], [1.3, 0.9], [1.9, 0]];
      [[523, 0.1], [659, 0.1], [784, 0.04]].forEach(([f, a]) => this.tn(t, f, { type: 'triangle', dur: 1.9, v: a * v, e, vib: [5.5, 4], pan: o.pan }));
      this.nz(t, 1.9, { f: 3000, q: 2, v: 0.05 * v, e, pan: o.pan });
    },
    steamChuff(o, t, v) { const r = o.rate || 3, n = o.dur ? Math.floor(o.dur * r) : 1; for (let i = 0; i < n; i++) this.chuff(t + i / r, v, i % 2); },
    phoneRing(o, t, v) {
      const A = this.ctx; for (let i = 0; i < (o.count || 3); i++) { const t0 = t + i * 1.5, g = A.createGain(), am = A.createGain(), l = A.createOscillator(), lg = A.createGain();
        am.gain.value = 0.5; l.frequency.value = 16; lg.gain.value = 0.5; l.connect(lg); lg.connect(am.gain); l.start(t0); l.stop(t0 + 1);
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.12 * v, t0 + 0.02); g.gain.setValueAtTime(0.12 * v, t0 + 0.88); g.gain.linearRampToValueAtTime(0, t0 + 0.92);
        [440, 480].forEach((f) => { const os = A.createOscillator(); os.frequency.value = f; os.connect(am); os.start(t0); os.stop(t0 + 1); });
        am.connect(g); g.connect(this.sfxB); }
    },
    phonePickup(o, t, v) { this.nz(t, 0.03, { ft: 'highpass', f: 2000, v: 0.3 * v }); this.tn(t + 0.02, 150, { dur: 0.1, v: 0.2 * v }); this.tn(t + 0.08, 425, { dur: 0.6, v: 0.02 * v, e: [[0.1, 1], [0.6, 0]] }); },
    carDoor(o, t, v) { this.nz(t, 0.14, { ft: 'lowpass', f: 700, f2: 200, v: 0.5 * v, a: 0.002, pan: o.pan }); this.tn(t, 120, { f2: 60, dur: 0.12, v: 0.4 * v, pan: o.pan }); this.nz(t + 0.07, 0.05, { f: 2400, q: 3, v: 0.12 * v, pan: o.pan }); },
    engine(o, t, v) { // flat-six idle: crank, catch, ~800 rpm burble
      const A = this.ctx, d = o.dur || 3.2, os = A.createOscillator(), o2 = A.createOscillator(), lp = A.createBiquadFilter(), am = A.createGain(), g = A.createGain(), l = A.createOscillator(), lg = A.createGain();
      os.type = 'sawtooth'; o2.type = 'triangle'; os.frequency.setValueAtTime(20, t); os.frequency.linearRampToValueAtTime(46, t + 0.6); os.frequency.linearRampToValueAtTime(40, t + 1);
      o2.frequency.setValueAtTime(40, t); o2.frequency.linearRampToValueAtTime(92, t + 0.6); o2.frequency.linearRampToValueAtTime(80, t + 1);
      l.frequency.setValueAtTime(7, t); l.frequency.linearRampToValueAtTime(13.3, t + 0.6); lg.gain.value = 0.3; am.gain.value = 0.7; l.connect(lg); lg.connect(am.gain);
      lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2; os.connect(lp); o2.connect(lp); lp.connect(am); am.connect(g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18 * v, t + 0.5); g.gain.setValueAtTime(0.18 * v, t + d - 0.5); g.gain.linearRampToValueAtTime(0, t + d);
      g.connect(this.sfxB); [os, o2, l].forEach((x) => { x.start(t); x.stop(t + d + 0.1); });
      this.nz(t, d, { brown: 1, ft: 'lowpass', f: 200, v: 0.3 * v, e: [[0.4, 0.5], [1, 1], [d - 0.5, 1], [d, 0]], pan: o.pan });
    },
    tramBell(o, t, v) { [0, 0.28].forEach((d) => this.bellTone(t + d, 1250, 0.2 * v, 0.9, { pan: o.pan })); },
    footstepGravel(o, t, v) { for (let i = 0; i < 6; i++) this.nz(t + rnd(0, 0.15), 0.04, { f: rnd(2200, 4500), q: 0.8, v: 0.15 * v * rnd(0.5, 1), a: 0.001, pan: o.pan }); this.nz(t, 0.08, { f: 300, v: 0.15 * v, pan: o.pan }); },
    footstepWood(o, t, v) { this.tn(t, rnd(130, 170), { f2: 80, dur: 0.1, v: 0.4 * v, a: 0.002, pan: o.pan }); this.nz(t, 0.05, { f: 700, v: 0.15 * v, pan: o.pan }); },
    pageFlip(o, t, v) { this.nz(t, 0.28, { f: 2800, f2: 5500, q: 0.7, v: 0.18 * v, e: [[0.04, 0.3], [0.1, 1], [0.28, 0]], pan: o.pan }); this.nz(t + 0.17, 0.08, { ft: 'highpass', f: 3500, v: 0.08 * v, pan: o.pan }); },
    petalGust(o, t, v) { this.nz(t, 2.2, { f: 700, f2: 1700, q: 0.9, v: 0.22 * v, e: [[0.7, 1], [1.3, 0.8], [2.2, 0]], pan: o.pan }); this.nz(t, 2.2, { ft: 'highpass', f: 4000, v: 0.04 * v, e: [[0.9, 1], [2.2, 0]], pan: o.pan }); },
    shutter(o, t, v) { [[0, 1, 260], [0.075, 0.7, 200]].forEach(([d, a, f]) => { this.nz(t + d, 0.025, { ft: 'highpass', f: 3000, v: 0.3 * v * a, a: 0.001 }); this.tn(t + d, f, { dur: 0.04, v: 0.15 * v * a }); }); },
    crabClick(o, t, v) { [0, 0.05, 0.13].forEach((d) => this.nz(t + d, 0.012, { f: 3800, q: 6, v: 0.2 * v, a: 0.001, pan: o.pan })); }
  };
})(window.CITY);
