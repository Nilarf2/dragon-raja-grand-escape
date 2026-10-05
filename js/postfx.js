// Healing post-processing: soft bloom, gentle colour grade (lifted violet shadows, warm highlights),
// vignette, faint grain, and a "memory" look. Presets blend over time.
(function (C) {
  const T = THREE;
  const PRESETS = {
    day:    { exposure: 1.0,  sat: 1.06, warm: 0.02, lift: 0.03, bloom: 0.35, thresh: 0.78, vig: 0.28, memory: 0, soft: 0 },
    golden: { exposure: 1.02, sat: 1.12, warm: 0.07, lift: 0.04, bloom: 0.55, thresh: 0.7,  vig: 0.32, memory: 0, soft: 0 },
    sunset: { exposure: 1.04, sat: 1.15, warm: 0.09, lift: 0.05, bloom: 0.75, thresh: 0.62, vig: 0.38, memory: 0, soft: 0.1 },
    dusk:   { exposure: 1.05, sat: 1.05, warm: 0.02, lift: 0.06, bloom: 0.6,  thresh: 0.55, vig: 0.4,  memory: 0, soft: 0 },
    night:  { exposure: 1.12, sat: 0.98, warm: -0.02, lift: 0.05, bloom: 0.85, thresh: 0.45, vig: 0.45, memory: 0, soft: 0 },
    rain:   { exposure: 1.08, sat: 0.85, warm: -0.04, lift: 0.07, bloom: 0.8, thresh: 0.42, vig: 0.5,  memory: 0, soft: 0.15 },
    memory: { exposure: 1.08, sat: 0.7,  warm: 0.08, lift: 0.1,  bloom: 0.9,  thresh: 0.5,  vig: 0.55, memory: 1, soft: 0.5 },
  };
  const quad = new T.PlaneGeometry(2, 2);
  const vs = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  C.PostFX = function (renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.enabled = true;
    this.params = Object.assign({}, PRESETS.day); this.target = PRESETS.day; this.rate = 1;
    const opt = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat };
    this.rt = new T.WebGLRenderTarget(4, 4, Object.assign({ samples: C.MOBILE ? 0 : 4 }, opt));
    this.b1 = new T.WebGLRenderTarget(4, 4, opt); this.b2 = new T.WebGLRenderTarget(4, 4, opt);
    this.ocam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (fs, uniforms) => { const m = new T.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, depthTest: false, depthWrite: false }); const s = new T.Scene(); s.add(new T.Mesh(quad, m)); return { m, s }; };
    this.bright = mk(`uniform sampler2D src; uniform float thresh; varying vec2 vUv;
      void main(){ vec3 c = texture2D(src, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(thresh, thresh + 0.25, l), 1.0); }`,
      { src: { value: null }, thresh: { value: 0.7 } });
    this.blur = mk(`uniform sampler2D src; uniform vec2 dir; varying vec2 vUv;
      void main(){ vec3 c = texture2D(src, vUv).rgb * 0.227;
        c += (texture2D(src, vUv + dir * 1.385).rgb + texture2D(src, vUv - dir * 1.385).rgb) * 0.316;
        c += (texture2D(src, vUv + dir * 3.231).rgb + texture2D(src, vUv - dir * 3.231).rgb) * 0.070;
        gl_FragColor = vec4(c, 1.0); }`, { src: { value: null }, dir: { value: new T.Vector2() } });
    this.comp = mk(`uniform sampler2D src, bloomT; uniform float exposure, sat, warm, lift, bloom, vig, memory, soft, time; uniform vec2 res; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(src, vUv).rgb;
        vec3 b = texture2D(bloomT, vUv).rgb;
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
        gl_FragColor = vec4(c, 1.0);
      }`, { src: { value: null }, bloomT: { value: null }, exposure: { value: 1 }, sat: { value: 1 }, warm: { value: 0 }, lift: { value: 0 },
      bloom: { value: 0 }, vig: { value: 0 }, memory: { value: 0 }, soft: { value: 0 }, time: { value: 0 }, res: { value: new T.Vector2() } });
    const sz = renderer.getSize(new T.Vector2()); this.setSize(sz.x, sz.y);
  };
  const P = C.PostFX.prototype;
  P.setSize = function (w, h) {
    const pr = this.renderer.getPixelRatio(); w = Math.max(4, Math.floor(w * pr)); h = Math.max(4, Math.floor(h * pr));
    this.rt.setSize(w, h); this.b1.setSize(w >> 2, h >> 2); this.b2.setSize(w >> 2, h >> 2);
    this.comp.m.uniforms.res.value.set(w, h);
  };
  P.preset = function (name, seconds = 2) { this.target = PRESETS[name] || PRESETS.day; this.rate = seconds > 0 ? 1 / seconds : 1e6; this.name = name; };
  P.update = function (dt) { const k = Math.min(1, dt * this.rate * 3); for (const key in this.target) this.params[key] += (this.target[key] - this.params[key]) * k; };
  P.render = function (t = 0) {
    const r = this.renderer;
    if (!this.enabled) { r.setRenderTarget(null); r.render(this.scene, this.camera); return; }
    const p = this.params;
    r.setRenderTarget(this.rt); r.render(this.scene, this.camera);
    this.bright.m.uniforms.src.value = this.rt.texture; this.bright.m.uniforms.thresh.value = p.thresh;
    r.setRenderTarget(this.b1); r.render(this.bright.s, this.ocam);
    const bu = this.blur.m.uniforms;
    for (let i = 0; i < 2; i++) {
      bu.src.value = this.b1.texture; bu.dir.value.set((1 + i) / this.b1.width, 0); r.setRenderTarget(this.b2); r.render(this.blur.s, this.ocam);
      bu.src.value = this.b2.texture; bu.dir.value.set(0, (1 + i) / this.b1.height); r.setRenderTarget(this.b1); r.render(this.blur.s, this.ocam);
    }
    const u = this.comp.m.uniforms;
    u.src.value = this.rt.texture; u.bloomT.value = this.b1.texture; u.time.value = t % 100;
    for (const k of ['exposure', 'sat', 'warm', 'lift', 'bloom', 'vig', 'memory', 'soft']) u[k].value = p[k];
    r.setRenderTarget(null); r.render(this.comp.s, this.ocam);
  };
  // pick a preset from the hour (wander mode)
  C.PostFX.autoPreset = (hour, rain) => rain > 0.3 ? 'rain' : hour < 6 || hour >= 19.6 ? 'night' : hour < 16.8 ? 'day' : hour < 18.2 ? 'golden' : hour < 19.0 ? 'sunset' : 'dusk';
})(window.CITY);
