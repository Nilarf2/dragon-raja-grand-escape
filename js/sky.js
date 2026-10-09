// Sky dome, real sun (2013-04-27, Matsuyama), waning-gibbous moon, anime clouds, haze, light keyframes.
// +X east, +Z south. A bearing θ points along (sin θ, 0, −cos θ).
(function (C) {
  const T = THREE, D2R = Math.PI / 180;

  // NOAA solar position. hourJST may exceed 24.
  C.sunPosition = function (y, m, d, hourJST, lat = C.GEO.lat0, lon = C.GEO.lon0) {
    const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
    const g = 2 * Math.PI / 365 * (N - 1 + (hourJST - 9 - 12) / 24);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = hourJST * 60 + eq + 4 * lon - 540, ha = (tst / 4 - 180) * D2R, la = lat * D2R;
    const cz = C.clamp(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha), -1, 1), zen = Math.acos(cz);
    let az = Math.acos(C.clamp((Math.sin(la) * cz - Math.sin(dec)) / (Math.cos(la) * Math.sin(zen)), -1, 1)) / D2R;
    az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
    let alt = 90 - zen / D2R;
    if (alt > -1.5) alt += 1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * D2R) / 60;   // atmospheric refraction (apparent sun)
    return { alt, az };
  };
  const dirFrom = (alt, az, v) => v.set(Math.sin(az * D2R) * Math.cos(alt * D2R), Math.sin(alt * D2R), -Math.cos(az * D2R) * Math.cos(alt * D2R));

  // Keyframes by hour on the story day (sunrise 5:28, sunset 18:47, civil dusk ~19:14).
  const K = [
    { h: 0,     top: 0x0b1530, hor: 0x24325a, sun: 0x8fa6ff, si: 0.10, hs: 0x4a5c96, hg: 0x1e2436, hi: 0.46, night: 1 },
    { h: 4.6,   top: 0x101c3e, hor: 0x2e3b66, sun: 0x8fa6ff, si: 0.08, hs: 0x4a5c96, hg: 0x1e2436, hi: 0.42, night: 1 },
    { h: 5.5,   top: 0x3b5a9a, hor: 0xf3a98a, sun: 0xffb27a, si: 0.20, hs: 0x8c90b8, hg: 0x5a4a4a, hi: 0.37, night: 0.6 },
    { h: 7,     top: 0x5ea6e6, hor: 0xffd8b0, sun: 0xffd2a0, si: 0.57, hs: 0xb8d8f0, hg: 0x8a7a64, hi: 0.46, night: 0 },
    { h: 10,    top: 0x3f9ae8, hor: 0xbfe6fa, sun: 0xfff3dc, si: 0.84, hs: 0xcfe8ff, hg: 0x9a8c70, hi: 0.50, night: 0 },
    { h: 15.5,  top: 0x3d95e4, hor: 0xc6e6f6, sun: 0xfff0d6, si: 0.80, hs: 0xcfe6ff, hg: 0x9a8c70, hi: 0.50, night: 0 },
    { h: 17.4,  top: 0x5a8fd6, hor: 0xffd29a, sun: 0xffc27a, si: 0.72, hs: 0xd8d0e0, hg: 0x9a7a60, hi: 0.48, night: 0 },
    { h: 18.35, top: 0x5d74bd, hor: 0xffa066, sun: 0xff9a55, si: 0.62, hs: 0xd8a8b8, hg: 0x7a5a58, hi: 0.46, night: 0.05 },
    { h: 18.8,  top: 0x4a5aa8, hor: 0xff7e5a, sun: 0xff6a40, si: 0.30, hs: 0xb890b0, hg: 0x5a4450, hi: 0.42, night: 0.3 },
    { h: 19.25, top: 0x2b3672, hor: 0xc8688a, sun: 0xb06a90, si: 0.12, hs: 0x6e6a9e, hg: 0x2e2840, hi: 0.38, night: 0.75 },
    { h: 19.9,  top: 0x111d42, hor: 0x34406e, sun: 0x8fa6ff, si: 0.10, hs: 0x4e60a0, hg: 0x1e2436, hi: 0.46, night: 1 },
    { h: 24,    top: 0x0b1530, hor: 0x24325a, sun: 0x8fa6ff, si: 0.10, hs: 0x4a5c96, hg: 0x1e2436, hi: 0.46, night: 1 },
  ];
  const ca = new T.Color(), cb = new T.Color();
  function sample(h) {
    let i = 0; while (i < K.length - 2 && K[i + 1].h <= h) i++;
    const a = K[i], b = K[i + 1], t = C.smooth(0, 1, (h - a.h) / (b.h - a.h));
    const mix = (k) => ca.set(a[k]).lerp(cb.set(b[k]), t).getHex();
    return { top: mix('top'), hor: mix('hor'), sun: mix('sun'), hs: mix('hs'), hg: mix('hg'),
      si: C.lerp(a.si, b.si, t), hi: C.lerp(a.hi, b.hi, t), night: C.lerp(a.night, b.night, t) };
  }

  function cloudTexture(seed, wide) {
    return C.signTexture(512, 256, (g, w, h) => {
      let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      const blobs = [];
      for (let i = 0; i < (wide ? 22 : 14); i++) {
        const x = w * (0.1 + 0.8 * r()), rad = h * (wide ? 0.05 + 0.08 * r() : 0.12 + 0.16 * r());
        const y = h * 0.72 - rad * (0.3 + (wide ? 0.5 : 1.4) * r()) * (1 - Math.abs(x / w - 0.5) * 1.2);
        blobs.push([x, y, rad]);
      }
      g.fillStyle = 'rgba(200,206,230,1)';
      for (const [x, y, rad] of blobs) { g.beginPath(); g.arc(x, y + rad * 0.12, rad, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ffffff';
      for (const [x, y, rad] of blobs) { g.beginPath(); g.arc(x - rad * 0.08, y - rad * 0.1, rad * 0.88, 0, Math.PI * 2); g.fill(); }
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(0, h * 0.74, w, h);
    });
  }

  C.Sky = function (scene, renderer) {
    this.scene = scene;
    this.sunAzOffset = 6;      // nudges the visual + light sun a little north so it sets into open sea from the cliff
    this.sunScale = 1;         // visual disc size (story can enlarge it for the sunset shot)
    this.cloud = 0.5;
    this.uni = {
      top: { value: new T.Color() }, hor: { value: new T.Color() }, sunDir: { value: new T.Vector3(0, 1, 0) },
      sunCol: { value: new T.Color() }, night: { value: 0 }, moonDir: { value: new T.Vector3(0, -1, 0) },
      sunSize: { value: 0.99985 }, haze: { value: 0 },
    };
    this.dome = new T.Mesh(new T.SphereGeometry(30000, 48, 24), new T.ShaderMaterial({
      uniforms: this.uni, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top, hor, sunCol, sunDir, moonDir; uniform float night, sunSize, haze; varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec3 c = mix(hor, top, pow(y, 0.42));
          float s = max(dot(d, sunDir), 0.0);
          float low = 1.0 - smoothstep(0.0, 0.35, sunDir.y);
          // warm glow band along the horizon toward the sun, stronger as the sun sets
          c += sunCol * (pow(s, 6.0) * (0.25 + 0.35 * low) + pow(s, 80.0) * 0.5) * (1.0 - night * 0.8);
          c += sunCol * exp(-y * 9.0) * pow(s, 2.0) * 0.35 * low * (1.0 - night);
          float disc = smoothstep(sunSize - 0.00003, sunSize, s);
          c = mix(c, mix(vec3(1.0, 0.97, 0.88), vec3(1.0, 0.6, 0.35), low), disc * (1.0 - night * 0.9));
          float m = max(dot(d, moonDir), 0.0);
          float md = smoothstep(0.99990, 0.99993, m);
          // waning gibbous: shade the disc's lower-left a little
          c = mix(c, vec3(1.0, 0.97, 0.86), md * night);
          c += vec3(0.6, 0.7, 1.0) * pow(m, 40.0) * 0.15 * night;
          vec3 q = floor(d * 520.0);
          float st = step(0.9978, hash(q)) * smoothstep(0.04, 0.3, d.y) * night * (1.0 - haze);
          c += vec3(st) * (0.5 + 0.5 * hash(q + 1.0));
          c = mix(c, hor, haze * 0.6);
          gl_FragColor = vec4(c, 1.0);
          #include <encodings_fragment>
        }`,
    }));
    this.dome.renderOrder = -1; this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.hemi = new T.HemisphereLight(0xffffff, 0x888888, 0.5);
    this.sun = new T.DirectionalLight(0xffffff, 0.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -65; sc.right = 65; sc.top = 65; sc.bottom = -65; sc.near = 1; sc.far = 700;
    this.sun.shadow.bias = -0.001; this.sun.shadow.normalBias = 0.3;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new T.FogExp2(0xbfe6fa, 0.00009);
    this.fogBase = 0.00009; this.fogExtra = 0;

    // clouds: a ring of big sprites, denser over the sea (west)
    this.clouds = [];
    for (let i = 0; i < 26; i++) {
      const wide = i % 3 === 0;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: cloudTexture(i * 7919 + 13, wide), fog: false, transparent: true, depthWrite: false }));
      const overSea = i < 17;
      const az = overSea ? C.range(210, 340) : C.range(0, 360);
      const dist = C.range(6000, 14000), sz = (wide ? 2.2 : 1) * C.range(1400, 2600) * dist / 10000;
      sp.position.set(Math.sin(az * D2R) * dist, C.range(500, 1900) * dist / 10000, -Math.cos(az * D2R) * dist);
      sp.scale.set(sz, sz * (wide ? 0.3 : 0.5), 1);
      sp.userData = { drift: C.range(0.6, 1.6), az, dist, base: sp.position.y, k: C.rand() };
      scene.add(sp); this.clouds.push(sp);
    }
    this.sunDir = new T.Vector3(); this.moonDir = new T.Vector3(); this.lightDir = new T.Vector3();
    this.state = sample(12);
  };

  C.Sky.prototype.setCloud = function (v) { this.cloud = v; };

  C.Sky.prototype.update = function (hour, focus, dt, camera) {
    const s = this.state = sample(hour);
    const sp = C.sunPosition(2013, 4, 27, hour);
    s.sunAlt = sp.alt; s.sunAz = sp.az + this.sunAzOffset;
    dirFrom(sp.alt, s.sunAz, this.sunDir);
    // moon (full on 04-25): rises ~21:15 in the ESE, climbs ~11°/h
    const mh = hour < 12 ? hour + 24 : hour, malt = (mh - 21.25) * 11 - 1, maz = 112 + (mh - 21.25) * 13;
    dirFrom(malt, maz, this.moonDir);
    const sunUp = this.sunDir.y > -0.03, moonUp = this.moonDir.y > 0.02;
    // at night light from the moon when it's up, otherwise a soft high "sky" light from the town side
    if (sunUp) this.lightDir.copy(this.sunDir); else if (moonUp) this.lightDir.copy(this.moonDir); else this.lightDir.set(0.3, 0.9, 0.2).normalize();
    if (this.lightDir.y < 0.06) this.lightDir.y = 0.06;
    this.lightDir.normalize();

    const u = this.uni;
    u.top.value.set(s.top); u.hor.value.set(s.hor); u.sunCol.value.set(s.sun);
    u.sunDir.value.copy(this.sunDir); u.moonDir.value.copy(this.moonDir); u.night.value = s.night;
    u.sunSize.value = Math.cos(0.0055 * this.sunScale);   // angular radius (rad)
    u.haze.value = C.clamp(this.fogExtra * 500, 0, 1);
    this.dome.position.copy(camera.position);

    this.sun.color.set(s.sun);
    this.sun.intensity = s.si * (sunUp ? C.smooth(-0.03, 0.05, this.sunDir.y) * 0.85 + 0.15 : 1) * Math.max(0.35, 1 - this.fogExtra * 350);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 350);
    this.sun.target.position.copy(focus);
    this.hemi.color.set(s.hs); this.hemi.groundColor.set(s.hg); this.hemi.intensity = s.hi;

    this.scene.fog.color.set(s.hor).lerp(cb.set(s.top), 0.2);
    this.scene.fog.density = this.fogBase + this.fogExtra;

    for (const cl of this.clouds) {
      const d = cl.userData;
      d.az += d.drift * dt * 0.004;               // westerly wind: clouds drift east slowly
      cl.position.set(Math.sin(d.az * D2R) * d.dist, d.base, -Math.cos(d.az * D2R) * d.dist).add(camera.position.clone().setY(0));
      cl.visible = d.k < this.cloud * 1.4;
      // sunset: clouds near the sun light up gold/pink underneath
      const toward = Math.max(0, Math.cos((d.az - s.sunAz) * D2R));
      const tint = ca.set(0xffffff).lerp(cb.set(s.hor), 0.3 + 0.35 * s.night + 0.3 * toward * (1 - s.night)).multiplyScalar(1 - 0.6 * s.night);
      cl.material.color.copy(tint);
    }
    for (const g of C.nightMats) g.mat.emissiveIntensity = g.max * s.night;
    C.night = s.night;
  };
})(window.CITY);
