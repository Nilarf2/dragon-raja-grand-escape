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
      const g = A.createGain(), os = A.createOscillator()…81469 tokens truncated…0026& sg.parent !== g.parent) g.parent.add(sg);
        loco.updateWorldMatrix(true, false);
        const d = track(); speed = dt > 0 ? Math.abs(d) / dt : speed;
        const stopped = speed < 0.4, tint = COL_D.clone().lerp(COL_N, nightK() * 0.8);
        accP += dt; accC += dt;
        if (on) {
          if (accP > (stopped ? 0.55 : 0.16)) { accP = 0; spawn(puffs, 0, 4.1, 4.65, (Math.random() - 0.5) * 0.3, 1, (Math.random() - 0.5) * 0.3, stopped ? 0.9 : 1.5, 3.4 + Math.random(), stopped ? 0.62 : 0.75, 1.0, stopped ? 3.6 : 4.8); }
          if (stopped && accC > 0.12) {
            accC = 0; const s = Math.random() < 0.5 ? -1 : 1;
            spawn(clouds, s * (1.25 + Math.random() * 0.25), 0.45 + Math.random() * 0.5, 1.2 + Math.random() * 4.3, s, 0.15 + Math.random() * 0.25, (Math.random() - 0.5) * 0.5, 0.45 + Math.random() * 0.5, 4.5 + Math.random() * 2, 0.42, 1.6, 4.8);
          }
        }
        for (const arr of [puffs, clouds]) for (const p of arr) {
          if (p.age >= p.life) { p.s.visible = false; continue; }
          p.age += dt; const k = Math.min(1, p.age / p.life); p.s.position.addScaledVector(p.v, dt);
          p.s.scale.setScalar(p.k0 + k * (p.k1 - p.k0)); p.s.material.color.copy(tint);
          p.s.material.opacity = (1 - k) * p.a * Math.min(1, p.age * 2.5);
        }
      },
    };
    o.tris = cars.map(triCount);
    return o;
  };
})(window.CITY);
