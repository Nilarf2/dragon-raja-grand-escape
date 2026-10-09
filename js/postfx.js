// Healing post-processing: soft bloom, gentle colour grade (lifted violet shadows, warm highlights),
// vignette, faint grain, and a "memory" look. Presets blend over time.
// Screen-space "ray-traced look" effects (ambient occlusion, reflections, god rays, height fog) live in
// fx_rt.js; this file runs them when they are loaded and the quality tier allows (?fx=off|low|high).
(function (C) {
  const T = THREE;
  // ao / ssr / rays / hfog: strengths of the fx_rt.js effects (0 = off)
  const PRESETS = {
    day:    { exposure: 1.0,  sat: 1.06, warm: 0.02, lift: 0.03, bloom: 0.35, thresh: 0.78, vig: 0.28, memory: 0, soft: 0,    ao: 0.85, ssr: 0.7, rays: 0.25, hfog: 0.35 },
    golden: { exposure: 1.02, sat: 1.12, warm: 0.07, lift: 0.04, bloom: 0.55, thresh: 0.7,  vig: 0.32, memory: 0, soft: 0,    ao: 0.8,  ssr: 0.8, rays: 0.8,  hfog: 0.5 },
    sunset: { exposure: 1.04, sat: 1.15, warm: 0.09, lift: 0.05, bloom: 0.75, thresh: 0.62, vig: 0.38, memory: 0, soft: 0.1,  ao: 0.75, ssr: 0.9, rays: 1.0,  hfog: 0.6 },
    dusk:   { exposure: 1.05, sat: 1.05, warm: 0.02, lift: 0.06, bloom: 0.6,  thresh: 0.55, vig: 0.4,  memory: 0, soft: 0,    ao: 0.65, ssr: 0.8, rays: 0.3,  hfog: 0.5 },
    night:  { exposure: 1.12, sat: 0.98, warm: -0.02, lift: 0.05, bloom: 0.85, thresh: 0.45, vig: 0.45, memory: 0, soft: 0,   ao: 0.55, ssr: 0.8, rays: 0,    hfog: 0.35 },
    rain:   { exposure: 1.08, sat: 0.85, warm: -0.04, lift: 0.07, bloom: 0.8, thresh: 0.42, vig: 0.5,  memory: 0, soft: 0.15,  ao: 0.7,  ssr: 1.0, rays: 0,    hfog: 0.9 },
    memory: { exposure: 1.08, sat: 0.7,  warm: 0.08, lift: 0.1,  bloom: 0.9,  thresh: 0.5,  vig: 0.55, memory: 1, soft: 0.5,  ao: 0.5,  ssr: 0.6, rays: 0.8,  hfog: 0.6 },
  };
  const quad = new T.PlaneGeometry(2, 2);
  const vs = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  C.PostFX_vs = vs;
  C.PostFX_mk = (fs, uniforms, defines) => {
    const m = new T.ShaderMaterial({ uniforms, defines: defines || {}, vertexShader: vs, fragmentShader: fs, depthTest: false, depthWrite: false });
    const s = new T.Scene(); s.add(new T.Mesh(quad, m)); return { m, s };
  };

  // quality tier: ?fx=off|low|medium|high; default high on desktop, off on phones and with ?lite
  C.fxTier = function () {
    const q = new URLSearchParams(location.search), v = (q.get('fx') || '').toLowerCase();
    if (v === 'off' || v === 'low' || v === 'high') return v;
    if (v === 'medium' || v === 'med') return 'low';
    return q.has('lite') || C.MOBILE ? 'off' : 'high';
  };

  C.PostFX = function (renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.enabled = true; this.out = null;
    this.params = Object.assign({}, PRESETS.day); this.target = PRESETS.day; this.rate = 1;
    const opt = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat };
    this.rt = new T.WebGLRenderTarget(4, 4, Object.assign({ samples: C.MOBILE ? 0 : 4 }, opt));
    this.b1 = new T.WebGLRenderTarget(4, 4, opt); this.b2 = new T.WebGLRenderTarget(4, 4, opt);
    this.ocam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = C.PostFX_mk;
    this.bright = mk(`uniform sampler2D src; uniform float thresh; varying vec2 vUv;
      void main(){ vec3 c = texture2D(src, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(thresh, thresh + 0.25, l), 1.0); }`,
      { src: { value: null }, thresh: { value: 0.7 } });
    this.blur = mk(`uniform sampler2D src; uniform vec2 dir; varying vec2 vUv;
      void main(){ vec3 c = texture2D(src, vUv).rgb * 0.227;
        c += (texture2D(src, vUv + dir * 1.385).rgb + texture2D(src, vUv - dir * 1.385).rgb) * 0.316;
        c += (texture2D(src, vUv + dir * 3.231).rgb + texture2D(src, vUv - dir * 3.231).rgb) * 0.070;
        gl_FragColor = vec4(c, 1.0); }`, { src: { value: null }, dir: { value: new T.Vector2() } });
    this.comp = mk(`uniform sampler2D src, bloomT; uniform float exposure, sat, warm, lift, bloom, vig, memory, soft, time; uniform vec2 res; varying vec2 vUv;
      #ifdef RTFX
      ${C.RTFX ? C.RTFX.compPars : ''}
      #endif
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(src, vUv).rgb;
        vec3 b = texture2D(bloomT, vUv).rgb;
        #ifdef RTFX
        ${C.RTFX ? C.RTFX.compMain : ''}
        #endif
        // soft focus toward the edges (dreamy), strongest in "memory"
        float e = length(vUv - 0.5);
        c = mix(c, b * 1.4 + c * 0.3, soft * smoothstep(0.25, 0.7, e));
        c += b * bloom;
        c *= exposure;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, sat);
        c += vec3(warm, warm * 0.35, -warm * 0.6) * smoothstep(0.3, 1.0, l);        // warm highlights
        c += vec3(lift * 0.6, lift * 0.45, lift) * (1.0 - smoothstep(0.0, 0.5, l));  // violet-blue lifted shadows
        c = mix(c, vec3(dot(c, vec3(0.33))) * vec3(1.08, 1.0, 0.86) + 0.04, memory * 0.45);
        c = c / (1.0 + max(vec3(0.0), c - 0.85) * 0.9);                               // soft shoulder
        c *= 1.0 - vig * smoothstep(0.35, 0.85, e);
        c += (h(vUv * res + time) - 0.5) * (0.018 + memory * 0.03);
        #if defined(RTFX) && defined(FX_DEBUG)
        c = fxDebug(c);
        #endif
        gl_FragColor = vec4(c, 1.0);
      }`, Object.assign({ src: { value: null }, bloomT: { value: null }, exposure: { value: 1 }, sat: { value: 1 }, warm: { value: 0 }, lift: { value: 0 },
      bloom: { value: 0 }, vig: { value: 0 }, memory: { value: 0 }, soft: { value: 0 }, time: { value: 0 }, res: { value: new T.Vector2() } },
      C.RTFX ? C.RTFX.compUniforms() : {}));
    this.rtfx = C.RTFX ? new C.RTFX(this) : null;
    this.setTier(C.fxTier());
    const sz = renderer.getSize(new T.Vector2()); this.setSize(sz.x, sz.y);
  };
  const P = C.PostFX.prototype;
  // switch the screen-space effects at runtime: 'off' | 'low' | 'high' (also for A/B shots: CITY.fx.setTier('off'))
  P.setTier = function (tier) {
    this.tier = this.rtfx ? tier : 'off';
    if (this.rtfx) this.rtfx.setTier(this.tier);
    const d = this.comp.m.defines; delete d.RTFX;
    if (this.tier !== 'off') d.RTFX = 1;
    this.comp.m.needsUpdate = true;
  };
  P.setSize = function (w, h) {
    const pr = this.renderer.getPixelRatio(); w = Math.max(4, Math.floor(w * pr)); h = Math.max(4, Math.floor(h * pr));
    this.rt.setSize(w, h); this.b1.setSize(w >> 2, h >> 2); this.b2.setSize(w >> 2, h >> 2);
    this.comp.m.uniforms.res.value.set(w, h);
    if (this.rtfx) this.rtfx.setSize(w, h);
  };
  P.preset = function (name, seconds = 2) { this.target = PRESETS[name] || PRESETS.day; this.rate = seconds > 0 ? 1 / seconds : 1e6; this.name = name; };
  P.update = function (dt) { const k = Math.min(1, dt * this.rate * 3); for (const key in this.target) this.params[key] += (this.target[key] - this.params[key]) * k; };
  P.render = function (t = 0) {
    const r = this.renderer;
    if (!this.enabled) { if (this.rtfx) this.rtfx.mark(false); r.setRenderTarget(this.out); r.render(this.scene, this.camera); return; }
    const p = this.params;
    r.setRenderTarget(this.rt); r.render(this.scene, this.camera);
    const u = this.comp.m.uniforms;
    if (this.rtfx && this.tier !== 'off') this.rtfx.render(r, p, u, t);
    this.bright.m.uniforms.src.value = this.rt.texture; this.bright.m.uniforms.thresh.value = p.thresh;
    r.setRenderTarget(this.b1); r.render(this.bright.s, this.ocam);
    const bu = this.blur.m.uniforms;
    for (let i = 0; i < 2; i++) {
      bu.src.value = this.b1.texture; bu.dir.value.set((1 + i) / this.b1.width, 0); r.setRenderTarget(this.b2); r.render(this.blur.s, this.ocam);
      bu.src.value = this.b2.texture; bu.dir.value.set(0, (1 + i) / this.b1.height); r.setRenderTarget(this.b1); r.render(this.blur.s, this.ocam);
    }
    u.src.value = this.rt.texture; u.bloomT.value = this.b1.texture; u.time.value = t % 100;
    for (const k of ['exposure', 'sat', 'warm', 'lift', 'bloom', 'vig', 'memory', 'soft']) u[k].value = p[k];
    r.setRenderTarget(this.out); r.render(this.comp.s, this.ocam);
  };
  // Photo mode: average n frames with sub-pixel camera jitter (clean edges, no grain noise, smoother AO / reflections).
  // Call after a still frame, e.g. CITY.fx.accumulate(16) (e.g. through the screenshot tool's --eval).
  P.accumulate = function (n = 16, t = 0) {
    const r = this.renderer, cam = this.camera, w = this.rt.width, h = this.rt.height;
    if (!this.acc || this.acc.width !== w || this.acc.height !== h) {
      if (this.acc) { this.acc.dispose(); this.fin.dispose(); }
      this.acc = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, minFilter: T.NearestFilter, magFilter: T.NearestFilter });
      this.fin = new T.WebGLRenderTarget(w, h, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
      this.copy = C.PostFX_mk(`uniform sampler2D src; uniform float opacity; varying vec2 vUv;
        void main(){ gl_FragColor = vec4(texture2D(src, vUv).rgb, opacity); }`, { src: { value: null }, opacity: { value: 1 } });
      this.copy.m.transparent = true;
    }
    const cu = this.copy.m.uniforms, halton = (i, b) => { let f = 1, x = 0; while (i > 0) { f /= b; x += f * (i % b); i = Math.floor(i / b); } return x; };
    const shadowUpd = r.shadowMap.autoUpdate;
    for (let i = 0; i < n; i++) {
      cam.setViewOffset(w, h, halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5, w, h);
      this.out = this.fin; this.render(t + i * 0.731);
      cu.src.value = this.fin.texture; cu.opacity.value = 1 / (i + 1);
      r.setRenderTarget(this.acc); r.render(this.copy.s, this.ocam);
    }
    cam.clearViewOffset(); this.out = null; r.shadowMap.autoUpdate = shadowUpd;
    cu.src.value = this.acc.texture; cu.opacity.value = 1;
    this.copy.m.transparent = false; r.setRenderTarget(null); r.render(this.copy.s, this.ocam); this.copy.m.transparent = true;
  };
  // pick a preset from the hour (wander mode)
  C.PostFX.autoPreset = (hour, rain) => rain > 0.3 ? 'rain' : hour < 6 || hour >= 19.6 ? 'night' : hour < 16.8 ? 'day' : hour < 18.2 ? 'golden' : hour < 19.0 ? 'sunset' : 'dusk';
})(window.CITY);
