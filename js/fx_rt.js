// "Ray-traced look" without ray tracing: screen-space effects for C.PostFX, all driven by the depth buffer of
// its MSAA scene target (resolved into a DepthTexture).
//  - ambient occlusion: SAO-style hemisphere samples at half resolution + depth-aware blur; tinted violet, not black
//  - screen-space reflections: the sea (marked through its alpha, see sea.js) and, in rain, flat wet ground;
//    a miss falls back to the sea shader's own sky reflection / the sky colour
//  - god rays: radial light scattering from the sun over sky pixels (golden hour, sunset)
//  - height fog / aerial perspective: low-lying haze coloured from the sky keyframes, brighter toward the sun
// Tiers (C.fxTier): high = all, low = AO (fewer samples) + god rays (quarter res) + fog, off = none.
(function (C) {
  const T = THREE;
  const VIEWPOS = `
    uniform mat4 projInv;
    vec3 viewPos(vec2 uv, float d){ vec4 p = projInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }`;
  // reconstruct a view-space normal from depth, choosing the smaller step on each axis (keeps edges clean)
  const NORMAL = `
    vec3 viewNormal(sampler2D dT, vec2 uv, vec2 tx, vec3 P){
      vec2 ox = vec2(tx.x, 0.0), oy = vec2(0.0, tx.y);
      vec3 pr = viewPos(uv + ox, texture2D(dT, uv + ox).x) - P, pl = P - viewPos(uv - ox, texture2D(dT, uv - ox).x);
      vec3 pu = viewPos(uv + oy, texture2D(dT, uv + oy).x) - P, pd = P - viewPos(uv - oy, texture2D(dT, uv - oy).x);
      vec3 dx = abs(pr.z) < abs(pl.z) ? pr : pl, dy = abs(pu.z) < abs(pd.z) ? pu : pd;
      vec3 n = normalize(cross(dx, dy));
      return dot(n, P) > 0.0 ? -n : n;
    }`;

  const AO_FS = `uniform sampler2D depthT; uniform vec2 tx; uniform float radius, projScale, aspect; varying vec2 vUv;
    ${VIEWPOS} ${NORMAL}
    void main(){
      float d = texture2D(depthT, vUv).x;
      if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
      vec3 P = viewPos(vUv, d), N = viewNormal(depthT, vUv, tx, P);
      float dist = -P.z;
      if (dist > 260.0) { gl_FragColor = vec4(1.0); return; }
      // the radius grows a little with distance so far streets still get some contact darkening
      float R = radius * (1.0 + dist * 0.012);
      float rUv = min(R * projScale / dist, 0.1);
      float ang = hash12(gl_FragCoord.xy) * 6.2832, occ = 0.0;
      for (int i = 0; i < SAMPLES; i++) {
        float t = (float(i) + 0.5) / float(SAMPLES);
        float a = ang + t * 7.0 * 6.2832 / 1.0;
        vec2 uv = vUv + vec2(cos(a) / aspect, sin(a)) * rUv * t;
        float sd = texture2D(depthT, uv).x;
        vec3 v = viewPos(uv, sd) - P;
        float vv = dot(v, v), vn = dot(v, N);
        float fall = max(0.0, 1.0 - vv / (R * R));
        occ += fall * max(0.0, vn * inversesqrt(vv + 1e-4) - 0.12);
      }
      float ao = clamp(1.0 - occ * AO_GAIN / float(SAMPLES), 0.0, 1.0);
      ao = mix(ao, 1.0, smoothstep(140.0, 260.0, dist));
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }`;
  const BLUR_FS = `uniform sampler2D src, depthT; uniform vec2 dir; uniform float near, far; varying vec2 vUv;
    float lin(float d){ return near * far / (far - d * (far - near)); }
    void main(){
      float z0 = lin(texture2D(depthT, vUv).x), sum = 0.0, wsum = 0.0;
      for (int i = -3; i <= 3; i++) {
        vec2 uv = vUv + dir * float(i);
        float z = lin(texture2D(depthT, uv).x);
        float w = exp(-float(i * i) * 0.18) * max(0.0, 1.0 - abs(z - z0) / (0.04 * z0 + 0.05));
        sum += texture2D(src, uv).r * w; wsum += w;
      }
      float ao = wsum > 0.0 ? sum / wsum : texture2D(src, vUv).r;
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }`;
  const SSR_FS = `uniform sampler2D colT, depthT; uniform mat4 proj, view, viewInv; uniform vec2 tx; uniform float near, far, rain, time;
    uniform vec3 skyCol; varying vec2 vUv;
    ${VIEWPOS} ${NORMAL}
    float lin(float d){ return near * far / (far - d * (far - near)); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
    void main(){
      float d = texture2D(depthT, vUv).x;
      if (d >= 1.0) { gl_FragColor = vec4(0.0); return; }
      vec4 col = texture2D(colT, vUv);
      vec3 P = viewPos(vUv, d), W = (viewInv * vec4(P, 1.0)).xyz;
      float dist = -P.z;
      // the far sea is left to the sea shader's smooth sky mirror (screen-space hits there are coarse and blocky)
      float sea = clamp((1.0 - col.a) * 2.0, 0.0, 1.0) * (1.0 - smoothstep(250.0, 600.0, dist)), wet = 0.0;
      if (sea < 0.05) {
        if (rain < 0.02 || dist > 160.0) { gl_FragColor = vec4(0.0); return; }
        vec3 Nw = (viewInv * vec4(viewNormal(depthT, vUv, tx, P), 0.0)).xyz;
        // puddles: flat ground, patchy, fading with distance
        wet = rain * smoothstep(0.9, 0.98, Nw.y) * (1.0 - smoothstep(60.0, 160.0, dist)) * (0.45 + 0.55 * smoothstep(0.35, 0.65, vn(W.xz * 0.35)));
        if (wet < 0.02) { gl_FragColor = vec4(0.0); return; }
      }
      // ripples: the sea moves, puddles shiver in the rain
      float amp = sea > 0.0 ? 0.02 * (1.0 - smoothstep(60.0, 900.0, dist)) : 0.02 + 0.03 * rain;
      vec2 q = W.xz * (sea > 0.0 ? 0.35 : 2.0) + time * vec2(0.3, 0.2);
      vec3 Nw = normalize(vec3((vn(q) - 0.5) * amp * 2.0, 1.0, (vn(q + 17.3) - 0.5) * amp * 2.0));
      vec3 N = normalize((view * vec4(Nw, 0.0)).xyz), V = normalize(P), R = reflect(V, N);
      float ndv = max(dot(-V, N), 0.0);
      float fres = mix(0.12, 1.0, pow(1.0 - ndv, 4.0));
      float k = max(sea, wet) * fres;
      // view-space march with growing steps, then a binary refine
      float stepLen = 0.25 + dist * 0.015, hit = 0.0;
      vec3 Q = P + R * stepLen * hash12(gl_FragCoord.xy + fract(time) * 37.0);
      vec2 huv = vUv, skyUv = vec2(-1.0); float ti = 0.0;
      for (int i = 0; i < STEPS; i++) {
        Q += R * stepLen;
        if (Q.z > -near) break;
        vec4 c = proj * vec4(Q, 1.0); vec2 uv = c.xy / c.w * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
        float sd = texture2D(depthT, uv).x;
        if (sd >= 1.0 && skyUv.x < 0.0) skyUv = uv;
        float diff = -Q.z - lin(sd);       // > 0: the ray went behind the visible surface
        if (sd < 1.0 && diff > 0.0 && diff < stepLen * 2.0 + 0.6) {
          vec3 a = Q - R * stepLen, b = Q;
          for (int j = 0; j < 5; j++) {
            vec3 m = (a + b) * 0.5; vec4 cm = proj * vec4(m, 1.0); vec2 mu = cm.xy / cm.w * 0.5 + 0.5;
            if (-m.z - lin(texture2D(depthT, mu).x) > 0.0) b = m; else a = m;
          }
          vec4 cb = proj * vec4(b, 1.0); huv = cb.xy / cb.w * 0.5 + 0.5; hit = 1.0; ti = float(i) / float(STEPS);
          break;
        }
        stepLen *= 1.16;
      }
      if (hit > 0.0) {
        vec2 e = smoothstep(0.0, 0.08, huv) * smoothstep(0.0, 0.08, 1.0 - huv);
        float conf = e.x * e.y * (1.0 - ti * ti);
        // the reflected land is seen through the water: a little darker and bluer than the land itself
        vec3 rc = texture2D(colT, huv).rgb * mix(vec3(1.0), vec3(0.82, 0.9, 1.0), sea);
        gl_FragColor = vec4(rc, k * conf * (sea > 0.0 ? 0.8 : 0.75));
      } else if (wet > 0.0) {
        // missed: puddles mirror what is on screen where the ray leaves into the sky (lamp halos, glowing sky),
        // or the sky colour
        vec3 rc = skyUv.x >= 0.0 ? texture2D(colT, skyUv).rgb : skyCol;
        gl_FragColor = vec4(rc, k * 0.5);
      } else gl_FragColor = vec4(0.0);
    }`;
  // water smears reflections vertically: a 7-tap blur of colour and weight along one axis
  const SMEAR_FS = `uniform sampler2D src; uniform vec2 dir; varying vec2 vUv;
    void main(){ vec4 c = texture2D(src, vUv) * 0.2;
      c += (texture2D(src, vUv + dir).rgba + texture2D(src, vUv - dir)) * 0.17;
      c += (texture2D(src, vUv + dir * 2.0) + texture2D(src, vUv - dir * 2.0)) * 0.13;
      c += (texture2D(src, vUv + dir * 3.0) + texture2D(src, vUv - dir * 3.0)) * 0.1;
      gl_FragColor = c; }`;
  const RAYS_FS = `uniform sampler2D colT, depthT; uniform vec2 sunUv; uniform float aspect, time; varying vec2 vUv;
    float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main(){
      vec2 delta = (vUv - sunUv) * 0.92 / float(TAPS);
      vec2 uv = vUv - delta * hash12(gl_FragCoord.xy + fract(time) * 61.0);
      float illum = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < TAPS; i++) {
        vec2 q = uv - sunUv; q.x *= aspect;
        float sky = step(1.0, texture2D(depthT, uv).x) * smoothstep(0.32, 0.0, length(q));
        vec3 c = texture2D(colT, uv).rgb;
        acc += c * sky * illum;
        illum *= 0.965;
        uv -= delta;
      }
      gl_FragColor = vec4(acc * 1.3 / float(TAPS), 1.0);
    }`;

  C.RTFX = function (pf) {
    this.pf = pf;
    const dt = new T.DepthTexture(4, 4); dt.type = T.UnsignedIntType;
    pf.rt.depthTexture = dt;
    const opt = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false };
    this.aoA = new T.WebGLRenderTarget(4, 4, opt); this.aoB = new T.WebGLRenderTarget(4, 4, opt);
    this.ssrT = new T.WebGLRenderTarget(4, 4, Object.assign({ type: T.HalfFloatType }, opt));
    this.ssrB = new T.WebGLRenderTarget(4, 4, Object.assign({ type: T.HalfFloatType }, opt));
    this.raysA = new T.WebGLRenderTarget(4, 4, opt); this.raysB = new T.WebGLRenderTarget(4, 4, opt);
    const mk = C.PostFX_mk, m4 = () => ({ value: new T.Matrix4() });
    this.ao = mk(AO_FS, { depthT: { value: dt }, projInv: m4(), tx: { value: new T.Vector2() }, radius: { value: 1.5 }, projScale: { value: 1 }, aspect: { value: 1 } }, { SAMPLES: 12, AO_GAIN: '3.2' });
    this.aoBlur = mk(BLUR_FS, { src: { value: null }, depthT: { value: dt }, dir: { value: new T.Vector2() }, near: { value: 0.25 }, far: { value: 40000 } });
    this.ssr = mk(SSR_FS, { colT: { value: pf.rt.texture }, depthT: { value: dt }, projInv: m4(), proj: m4(), view: m4(), viewInv: m4(), tx: { value: new T.Vector2() },
      near: { value: 0.25 }, far: { value: 40000 }, rain: { value: 0 }, time: { value: 0 }, skyCol: { value: new T.Color() } }, { STEPS: 28 });
    this.smear = mk(SMEAR_FS, { src: { value: null }, dir: { value: new T.Vector2() } });
    this.rays = mk(RAYS_FS, { colT: { value: pf.rt.texture }, depthT: { value: dt }, sunUv: { value: new T.Vector2() }, aspect: { value: 1 }, time: { value: 0 } }, { TAPS: 48 });
    this.white = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
    this.black = new T.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this.black.needsUpdate = true;
    this.v = new T.Vector3(); this.f = new T.Vector3(); this.c = new T.Color();
    this.passes = 0;
    const dbg = new URLSearchParams(location.search).get('fxdebug');
    this.debug = { ao: 1, ssr: 2, rays: 3, mark: 4, fog: 5 }[dbg] || 0;
  };
  // uniforms and GLSL added to PostFX's composite (applied before bloom and grading)
  C.RTFX.compUniforms = () => ({
    aoT: { value: null }, ssrT: { value: null }, raysT: { value: null }, depthT: { value: null }, projInv: { value: new T.Matrix4() }, viewInv: { value: new T.Matrix4() },
    camPos: { value: new T.Vector3() }, sunDirW: { value: new T.Vector3(0, 1, 0) }, fogCol: { value: new T.Color() }, sunColF: { value: new T.Color() },
    aoK: { value: 0 }, ssrK: { value: 0 }, raysK: { value: 0 }, hfogK: { value: 0 }, fogDen: { value: 0.0016 },
  });
  C.RTFX.compPars = `
    uniform sampler2D aoT, ssrT, raysT, depthT; uniform mat4 projInv, viewInv; uniform vec3 camPos, sunDirW, fogCol, sunColF;
    uniform float aoK, ssrK, raysK, hfogK, fogDen;
    vec3 fxView(vec2 uv, float d){ vec4 p = projInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    float fxFog(vec2 uv){
      float d = texture2D(depthT, uv).x;
      if (d >= 1.0) return 0.0;
      vec3 P = fxView(uv, d), W = (viewInv * vec4(P, 1.0)).xyz;
      float dist = length(P), H = 22.0, y0 = max(camPos.y, -2.0), y1 = max(W.y, -2.0), dy = y1 - y0;
      float e0 = exp(-y0 / H), e1 = exp(-y1 / H);
      float k = abs(dy) > 0.05 ? (e0 - e1) / (dy / H) : e0;    // exact integral of the exponential height profile
      return clamp((1.0 - exp(-fogDen * dist * k)) * hfogK, 0.0, 0.8);
    }
    #ifdef FX_DEBUG
    vec3 fxDebug(vec3 c){
      if (FX_DEBUG == 1) return texture2D(aoT, vUv).rrr;
      if (FX_DEBUG == 2) { vec4 s = texture2D(ssrT, vUv); return mix(c * 0.25, s.rgb, s.a); }
      if (FX_DEBUG == 3) return texture2D(raysT, vUv).rgb;
      if (FX_DEBUG == 4) return vec3(1.0 - texture2D(src, vUv).a);
      return vec3(fxFog(vUv));
    }
    #endif`;
  C.RTFX.compMain = `{
      float ao = texture2D(aoT, vUv).r;
      c *= mix(vec3(1.0), mix(vec3(0.5, 0.47, 0.66), vec3(1.0), ao), aoK);      // violet contact shade, not black
      vec4 sr = texture2D(ssrT, vUv);
      c = mix(c, sr.rgb, clamp(sr.a * ssrK, 0.0, 1.0));
      float f = fxFog(vUv);
      if (f > 0.0) {
        vec3 P = fxView(vUv, texture2D(depthT, vUv).x);
        vec3 dir = normalize(mat3(viewInv) * P);
        float s = pow(max(dot(dir, sunDirW), 0.0), 6.0);
        c = mix(c, fogCol + sunColF * s * 0.35, f);
      }
      c += texture2D(raysT, vUv).rgb * raysK;
    }`;
  const R = C.RTFX.prototype;
  R.setTier = function (tier) {
    this.tier = tier;
    const hi = tier === 'high';
    this.ao.m.defines.SAMPLES = hi ? 12 : 6; this.ao.m.needsUpdate = true;
    this.rays.m.defines.TAPS = hi ? 48 : 28; this.rays.m.needsUpdate = true;
    this.useSSR = hi;
    const d = this.pf.comp.m.defines; delete d.FX_DEBUG; if (this.debug && tier !== 'off') d.FX_DEBUG = this.debug;
    if (this.w) this.setSize(this.w, this.h);
    this.mark(false);
  };
  R.setSize = function (w, h) {
    this.w = w; this.h = h;
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), rd = this.tier === 'high' ? 1 : 2;
    this.aoA.setSize(hw, hh); this.aoB.setSize(hw, hh); this.ssrT.setSize(hw, hh); this.ssrB.setSize(hw, hh);
    this.raysA.setSize(Math.max(2, w >> rd), Math.max(2, h >> rd)); this.raysB.setSize(Math.max(2, w >> rd), Math.max(2, h >> rd));
  };
  // the sea writes alpha 0.5 into the scene target as a "reflective" mark while SSR is on (alpha 1 otherwise,
  // so the canvas is never see-through when effects are off)
  R.mark = function (on) { const u = C.sea && C.sea.uni && C.sea.uni.mark; if (u) u.value = on ? 0.5 : 1; };
  R.render = function (r, p, cu, t) {
    const pf = this.pf, cam = pf.camera, sky = C.sky, dt = pf.rt.depthTexture, w = this.w, h = this.h, ocam = pf.ocam;
    this.passes = 0;
    const projInv = cam.projectionMatrixInverse, aspect = w / h;
    // ambient occlusion
    if (p.ao > 0.01) {
      const u = this.ao.m.uniforms;
      u.projInv.value.copy(projInv); u.tx.value.set(1 / w, 1 / h); u.projScale.value = 0.5 * cam.projectionMatrix.elements[5]; u.aspect.value = aspect;
      r.setRenderTarget(this.aoA); r.render(this.ao.s, ocam);
      const b = this.aoBlur.m.uniforms; b.near.value = cam.near; b.far.value = cam.far;
      b.src.value = this.aoA.texture; b.dir.value.set(1 / this.aoA.width, 0); r.setRenderTarget(this.aoB); r.render(this.aoBlur.s, ocam);
      b.src.value = this.aoB.texture; b.dir.value.set(0, 1 / this.aoA.height); r.setRenderTarget(this.aoA); r.render(this.aoBlur.s, ocam);
      cu.aoT.value = this.aoA.texture; this.passes += 3;
    } else cu.aoT.value = this.white;
    // reflections
    const rain = C.weather ? C.weather.rain : 0;
    if (this.useSSR && p.ssr > 0.01) {
      const u = this.ssr.m.uniforms;
      u.projInv.value.copy(projInv); u.proj.value.copy(cam.projectionMatrix); u.view.value.copy(cam.matrixWorldInverse); u.viewInv.value.copy(cam.matrixWorld);
      u.tx.value.set(1 / w, 1 / h); u.near.value = cam.near; u.far.value = cam.far; u.rain.value = rain; u.time.value = t % 1000;
      if (sky) u.skyCol.value.set(sky.state.hor).lerp(this.c.set(sky.state.top), 0.35).multiplyScalar(0.9);
      r.setRenderTarget(this.ssrT); r.render(this.ssr.s, ocam);
      const su = this.smear.m.uniforms; su.src.value = this.ssrT.texture; su.dir.value.set(0.5 / this.ssrT.width, 1.5 / this.ssrT.height);
      r.setRenderTarget(this.ssrB); r.render(this.smear.s, ocam);
      cu.ssrT.value = this.ssrB.texture; this.passes += 2;
    } else cu.ssrT.value = this.black;
    this.mark(this.useSSR && p.ssr > 0.01);
    // god rays: only when the sun is up and roughly in front of the camera
    let raysK = 0;
    if (sky && p.rays > 0.01) {
      cam.getWorldDirection(this.f);
      const facing = this.f.dot(sky.sunDir), up = C.smooth(-0.04, 0.03, sky.sunDir.y);
      raysK = p.rays * C.smooth(0.1, 0.5, facing) * up * (1 - sky.state.night) * (1 - Math.min(1, rain * 1.5)) * (1 - C.clamp(sky.fogExtra * 600, 0, 1));
      if (raysK > 0.01) {
        this.v.copy(sky.sunDir).multiplyScalar(1000).add(cam.position).project(cam);
        const u = this.rays.m.uniforms;
        u.sunUv.value.set(this.v.x * 0.5 + 0.5, this.v.y * 0.5 + 0.5); u.aspect.value = aspect; u.time.value = t;
        r.setRenderTarget(this.raysA); r.render(this.rays.s, ocam);
        const bu = pf.blur.m.uniforms;
        bu.src.value = this.raysA.texture; bu.dir.value.set(1 / this.raysA.width, 0); r.setRenderTarget(this.raysB); r.render(pf.blur.s, ocam);
        bu.src.value = this.raysB.texture; bu.dir.value.set(0, 1 / this.raysA.height); r.setRenderTarget(this.raysA); r.render(pf.blur.s, ocam);
        cu.raysT.value = this.raysA.texture; this.passes += 3;
      }
    }
    if (raysK <= 0.01) cu.raysT.value = this.black;
    // composite inputs
    cu.depthT.value = dt; cu.projInv.value.copy(projInv); cu.viewInv.value.copy(cam.matrixWorld); cu.camPos.value.copy(cam.position);
    cu.aoK.value = p.ao; cu.ssrK.value = p.ssr; cu.raysK.value = raysK; cu.hfogK.value = p.hfog;
    if (sky) {
      cu.sunDirW.value.copy(sky.sunDir);
      cu.fogCol.value.set(sky.state.hor).lerp(this.c.set(sky.state.top), 0.25);
      cu.sunColF.value.set(sky.state.sun).multiplyScalar((1 - sky.state.night) * C.smooth(-0.05, 0.05, sky.sunDir.y));
      cu.fogDen.value = 0.0012 + sky.fogExtra * 4;
    }
  };
})(window.CITY);
