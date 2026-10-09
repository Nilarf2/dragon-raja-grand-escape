// Seto Inland Sea: anime water whose colour and shore foam come from the real depth (terrain grid),
// a sun-glitter road, and a mirror of the sun disc near the horizon (so at sunset half a sun + its reflection = a circle).
(function (C) {
  const T = THREE;

  // signed ground height (m) as a half-float texture: the sea skips pixels over land (no z-fighting at the shore)
  function heightTexture(g, H) {
    const data = new Uint16Array(g.nx * g.nz);
    for (let i = 0; i < data.length; i++) data[i] = T.DataUtils.toHalfFloat(C.clamp(H[i], -60, 60));
    const t = new T.DataTexture(data, g.nx, g.nz, T.RedFormat, T.HalfFloatType);
    t.magFilter = t.minFilter = T.LinearFilter; t.needsUpdate = true;
    return t;
  }

  C.Sea = function (scene) {
    const g = C.terrainGrid.near;
    this.tide = 0;
    this.uni = T.UniformsUtils.merge([T.UniformsLib.fog, {
      time: { value: 0 }, sunDir: { value: new T.Vector3(0, 1, 0) }, lightCol: { value: new T.Color(1, 1, 1) },
      hor: { value: new T.Color() }, top: { value: new T.Color() }, night: { value: 0 }, tide: { value: 0 },
      deep: { value: new T.Color(0x1d5f9c) }, shallow: { value: new T.Color(0x3fb0bd) }, sunSize: { value: 0.99985 },
      hNear: { value: null }, hFar: { value: null },
      rNear: { value: new T.Vector4(g.x0 - g.dx / 2, g.z0 - g.dx / 2, g.nx * g.dx, g.nz * g.dx) },
      rFar: { value: new T.Vector4(C.terrainGrid.far.x0 - C.terrainGrid.far.dx / 2, C.terrainGrid.far.z0 - C.terrainGrid.far.dx / 2, C.terrainGrid.far.nx * C.terrainGrid.far.dx, C.terrainGrid.far.nz * C.terrainGrid.far.dx) },
      calm: { value: 0 },
      mark: { value: 1 },   // alpha written into the scene target: 0.5 marks the sea for screen-space reflections (fx_rt.js)
    }]);
    this.uni.hNear.value = heightTexture(g, C.terrainGrid.nearH);
    this.uni.hFar.value = heightTexture(C.terrainGrid.far, C.terrainGrid.farH);
    // (no polygonOffset here: near the horizon it would pull the sea hundreds of metres forward, over low islands;
    //  terrain.js sinks the far seabed instead so it can't z-fight with the surface)
    const mat = new T.ShaderMaterial({
      uniforms: this.uni, fog: true,
      vertexShader: `
        #include <common>
        varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float time, night, tide, sunSize, calm, mark; uniform vec3 sunDir, lightCol, hor, top, deep, shallow;
        uniform sampler2D hNear, hFar; uniform vec4 rNear, rFar;
        varying vec3 vW;
        #include <fog_pars_fragment>
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float nz(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), u.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), u.x), u.y); }
        void main(){
          vec2 p = vW.xz;
          vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
          vec2 uv = (p - rNear.xy) / rNear.zw, uf = (p - rFar.xy) / rFar.zw;
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float insideF = step(0.0, uf.x) * step(uf.x, 1.0) * step(0.0, uf.y) * step(uf.y, 1.0);
          float gh = inside > 0.5 ? texture2D(hNear, uv).r : (insideF > 0.5 ? texture2D(hFar, uf).r : -40.0);
          if (gh > tide + 0.02) discard;
          float depth = tide - gh;
          // waves: amplitude fades with distance (far sea is a smooth mirror)
          float amp = (1.0 - calm * 0.6) * mix(1.0, 0.08, smoothstep(80.0, 2500.0, dist));
          float n1 = nz(p * 0.11 + vec2(time * 0.22, time * 0.13));
          float n2 = nz(p * 0.47 - vec2(time * 0.41, -time * 0.31));
          vec3 N = normalize(vec3(((n1 - 0.5) * 0.22 + (n2 - 0.5) * 0.14) * amp, 1.0, (n2 - 0.5) * 0.22 * amp));
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          vec3 base = mix(shallow, deep, smoothstep(0.5, 9.0, depth));
          base = mix(base, vec3(0.62, 0.72, 0.62), (1.0 - smoothstep(0.0, 1.2, depth)) * 0.45);   // gravel showing through
          float dark = 1.0 - 0.78 * night;
          vec3 sky = mix(hor, top, 0.25);
          vec3 col = mix(base * dark, sky, clamp(0.25 + fres * 0.8, 0.0, 1.0));
          float band = smoothstep(0.62, 0.66, nz(vec2(p.x * 0.012 + n1 * 1.5, p.y * 0.05 + time * 0.05)));
          col = mix(col, col * 1.15 + 0.03, band * 0.45 * (1.0 - night));
          vec3 R = reflect(-V, N);
          float sd = max(dot(R, sunDir), 0.0);
          float sunVis = smoothstep(-0.03, 0.02, sunDir.y);
          float low = 1.0 - smoothstep(0.0, 0.3, sunDir.y);
          // glitter road + mirrored sun disc
          col += lightCol * (pow(sd, 260.0) * 2.4 + pow(sd, 18.0) * 0.18 * low) * sunVis;
          float g = nz(p * 1.1 + vec2(time * 0.9, 0.0)) * nz(p * 1.7 - vec2(0.0, time * 0.7));
          float road = pow(max(dot(normalize(vec3(R.x, 0.0, R.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0), 220.0);
          col += lightCol * smoothstep(0.5, 0.6, g) * road * 1.4 * sunVis * low;
          vec3 Rf = reflect(-V, vec3(0.0, 1.0, 0.0));
          col = mix(col, mix(vec3(1.0, 0.97, 0.88), vec3(1.0, 0.55, 0.32), low), smoothstep(sunSize - 0.00003, sunSize, dot(Rf, sunDir)) * smoothstep(1500.0, 6000.0, dist) * sunVis);
          col += vec3(1.0) * smoothstep(0.58, 0.63, g) * 0.25 * dark * smoothstep(300.0, 30.0, dist);
          // shore: wave run-up lines on the gravel beach
          float sh = 1.0 - smoothstep(0.0, 1.6, depth);
          float run = 0.5 + 0.5 * sin(time * 1.1 - depth * 5.0 + n1 * 5.0);
          float foam = sh * smoothstep(0.6, 0.95, run + n2 * 0.4) * 0.8 + (1.0 - smoothstep(0.0, 0.18, depth)) * 0.5;
          col = mix(col, vec3(0.97) * (0.35 + 0.65 * dark), clamp(foam, 0.0, 1.0) * 0.75 * max(inside, 0.4));
          gl_FragColor = vec4(col, mark);
          #include <fog_fragment>
        }`,
    });
    // subdivided (huge triangles lose depth precision and let the sea bleed through low land): dense near the town
    const ax = []; for (let v = 0, d = 25; v < 30000; v += d, d *= 1.12) ax.push(v);
    const xs = ax.slice(1).reverse().map(v => -v).concat(ax), n = xs.length, pos = [], idx = [];
    for (const z of xs) for (const x of xs) pos.push(x, 0, z);
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) { const a = i * n + j, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    this.mesh = new T.Mesh(geo, mat);
    scene.add(this.mesh);
  };

  C.Sea.prototype.update = function (t, sky) {
    const u = this.uni;
    u.time.value = t; u.night.value = sky.state.night; u.tide.value = this.tide;
    this.mesh.position.y = this.tide;
    u.sunDir.value.copy(sky.sunDir.y > -0.03 ? sky.sunDir : sky.moonDir);
    u.lightCol.value.set(sky.state.sun).multiplyScalar(sky.sunDir.y > -0.03 ? 1 : 0.5);
    u.hor.value.set(sky.state.hor); u.top.value.set(sky.state.top);
    u.sunSize.value = sky.uni.sunSize.value;
  };
})(window.CITY);
