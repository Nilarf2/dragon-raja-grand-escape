// Trains v2: Iyotetsu orange EMU (Takahama line) and the D51 steam train with brand-new coaches.
// Loaded after landmarks.js: it re-defines C.makeEMU / C.makeD51Train with the same return API.
// Every car is built from a few merged, vertex-coloured meshes (cheap), with a hollow body so the
// interior (seats, straps, ceiling lights) shows through the windows. Origin = rail-head, +Z = front.
(function (C) {
  const T = THREE, PI = Math.PI;
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _p = new T.Vector3(), _s = new T.Vector3(), _f = new T.Vector3(), UPV = new T.Vector3(0, 1, 0);
  const rng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  // ---------------------------------------------------------------- geometry baking / merging
  function put(g, x, y, z, rx, ry, rz) {
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _p.set(x || 0, y || 0, z || 0); _s.set(1, 1, 1);
    _m.compose(_p, _q, _s); g.applyMatrix4(_m); return g;
  }
  // unit primitives are generated once; Batch records only (template, transform, colour) and bakes at the end
  const TPL = {};
  function tpl(name) {
    if (TPL[name]) return TPL[name];
    const g = name === 'box' ? new T.BoxGeometry(1, 1, 1) : name === 'quad' ? new T.PlaneGeometry(1, 1) : new T.CylinderGeometry(1, 1, 1, +name.slice(3), 1, false);
    return (TPL[name] = { pos: g.attributes.position.array, nor: g.attributes.normal.array, uv: g.attributes.uv.array, idx: g.index.array, n: g.attributes.position.count });
  }
  function merge(items) {
    let nv = 0, ni = 0;
    for (const it of items) if (it.t) { nv += it.t.n; ni += it.t.idx.length; } else { const g = it.g; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), cl = new Float32Array(nv * 3);
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni), col = new T.Color(), M = new T.Matrix4(), Rm = new T.Matrix4(), Q = new T.Quaternion(), P = new T.Vector3(), S = new T.Vector3();
    let vo = 0, io = 0;
    for (const it of items) {
      let n;
      if (it.t) {
        const t = it.t; n = t.n;
        Q.set(it.q[0], it.q[1], it.q[2], it.q[3]); P.set(it.p[0], it.p[1], it.p[2]); S.set(it.s[0], it.s[1], it.s[2]);
        M.compose(P, Q, S); Rm.makeRotationFromQuaternion(Q); const e = M.elements, r = Rm.elements;
        for (let i = 0; i < n; i++) {
          const x = t.pos[i * 3], y = t.pos[i * 3 + 1], z = t.pos[i * 3 + 2], nx = t.nor[i * 3], ny = t.nor[i * 3 + 1], nz = t.nor[i * 3 + 2], o = (vo + i) * 3;
          pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          nor[o] = r[0] * nx + r[4] * ny + r[8] * nz; nor[o + 1] = r[1] * nx + r[5] * ny + r[9] * nz; nor[o + 2] = r[2] * nx + r[6] * ny + r[10] * nz;
          let u = t.uv[i * 2];
          if (it.rib) { const f = (i / 4) | 0; u *= (f < 2 ? it.s[2] : it.s[0]) / 0.36; }
          uv[(vo + i) * 2] = u; uv[(vo + i) * 2 + 1] = t.uv[i * 2 + 1];
        }
        for (let i = 0; i < t.idx.length; i++) idx[io++] = t.idx[i] + vo;
      } else {
        const g = it.g; n = g.attributes.position.count;
        pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo; else for (let i = 0; i < n; i++) idx[io++] = vo + i;
      }
      if (it.cols) cl.set(it.cols, vo * 3); else { col.setHex(it.hex == null ? 0xffffff : it.hex); for (let i = 0; i < n; i++) { cl[(vo + i) * 3] = col.r; cl[(vo + i) * 3 + 1] = col.g; cl[(vo + i) * 3 + 2] = col.b; } }
      vo += n;
    }
    const o = new T.BufferGeometry();
    o.setAttribute('position', new T.BufferAttribute(pos, 3)); o.setAttribute('normal', new T.BufferAttribute(nor, 3));
    o.setAttribute('uv', new T.BufferAttribute(uv, 2)); o.setAttribute('color', new T.BufferAttribute(cl, 3)); o.setIndex(new T.BufferAttribute(idx, 1));
    return o;
  }
  const _fq = new T.Quaternion();
  // collects primitives per material key, then bakes one mesh per key
  class Batch {
    constructor() { this.k = {}; this.frame = null; }
    push(key, rec) { (this.k[key] || (this.k[key] = [])).push(rec); return this; }
    add(key, g, hex, cols) { if (this.frame) g.applyMatrix4(this.frame); return this.push(key, { g, hex, cols }); }
    prim(key, name, hex, sx, sy, sz, x, y, z, rx, ry, rz, rib) {
      _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _p.set(x || 0, y || 0, z || 0);
      if (this.frame) { _fq.setFromRotationMatrix(this.frame); _p.applyQuaternion(_fq); _q.premultiply(_fq); }
      return this.push(key, { t: tpl(name), hex, p: [_p.x, _p.y, _p.z], q: [_q.x, _q.y, _q.z, _q.w], s: [sx, sy, sz], rib });
    }
    box(key, hex, w, h, d, x, y, z, rx, ry, rz) { return this.prim(key, 'box', hex, w, h, d, x, y, z, rx, ry, rz); }
    rib(key, hex, w, h, d, x, y, z) { return this.prim(key, 'box', hex, w, h, d, x, y, z, 0, 0, 0, true); }
    quad(key, hex, w, h, x, y, z, rx, ry, rz) { return this.prim(key, 'quad', hex, w, h, 1, x, y, z, rx, ry, rz); }
    cyl(key, hex, rt, rb, len, seg, x, y, z, rx, ry, rz) {
      if (rt === rb) return this.prim(key, 'cyl' + seg, hex, rt, len, rt, x, y, z, rx, ry, rz);
      return this.add(key, put(new T.CylinderGeometry(rt, rb, len, seg), x, y, z, rx, ry, rz), hex);
    }
    cylZ(key, hex, r, len, seg, x, y, z) { return this.cyl(key, hex, r, r, len, seg, x, y, z, PI / 2, 0, 0); }
    cylX(key, hex, r, len, seg, x, y, z) { return this.cyl(key, hex, r, r, len, seg, x, y, z, 0, 0, PI / 2); }
    cylY(key, hex, r, len, seg, x, y, z) { return this.cyl(key, hex, r, r, len, seg, x, y, z); }
    rod(key, hex, a, b, r, seg) {
      _f.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const l = _f.length();
      _q.setFromUnitVectors(UPV, _f.normalize()); _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      if (this.frame) { _fq.setFromRotationMatrix(this.frame); _p.applyQuaternion(_fq); _q.premultiply(_fq); }
      return this.push(key, { t: tpl('cyl' + (seg || 5)), hex, p: [_p.x, _p.y, _p.z], q: [_q.x, _q.y, _q.z, _q.w], s: [r, l, r] });
    }
    mesh(key, mat, shadow) {
      const it = this.k[key]; if (!it || !it.length) return null;
      const m = new T.Mesh(merge(it), mat); m.castShadow = !!shadow; m.receiveShadow = true; return m;
    }
    geoOf(key) { const it = this.k[key]; return it && it.length ? merge(it) : null; }
  }
  // closed convex polygon lofted along z (rings = [{z, sx, sy}], increasing z), smooth normals, flat caps
  function loft(poly, cy, rings, capA, capB) {
    const n = poly.length, pos = [], idx = [], R = rings.length, my = poly.reduce((a, p) => a + p[1], 0) / n;
    for (const r of rings) for (const p of poly) pos.push(p[0] * r.sx, cy + (p[1] - cy) * r.sy, r.z);
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n, a = i * n + j, b = i * n + j2, c = (i + 1) * n + j, d = (i + 1) * n + j2;
      idx.push(a, b, c, b, d, c);
    }
    const cap = (i, flip) => {
      const base = pos.length / 3, r = rings[i];
      for (const p of poly) pos.push(p[0] * r.sx, cy + (p[1] - cy) * r.sy, r.z);
      pos.push(0, cy + (my - cy) * r.sy, r.z);
      const c = base + n;
      for (let j = 0; j < n; j++) { const j2 = (j + 1) % n; if (flip) idx.push(c, base + j2, base + j); else idx.push(c, base + j, base + j2); }
    };
    if (capA) cap(0, true); if (capB) cap(R - 1, false);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // ink outline: every vertex pushed out along its (position-averaged) normal; draw with C.ink (BackSide)
  function inkOf(g, w) {
    const P = g.attributes.position, N = g.attributes.normal, n = P.count, acc = new Map(), keys = new Array(n);
    for (let i = 0; i < n; i++) {
      const k = Math.round(P.getX(i) * 400) + ',' + Math.round(P.getY(i) * 400) + ',' + Math.round(P.getZ(i) * 400); keys[i] = k;
      let a = acc.get(k); if (!a) acc.set(k, a = [0, 0, 0]);
      a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i);
    }
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = acc.get(keys[i]), l = Math.hypot(a[0], a[1], a[2]) || 1;
      out[i * 3] = P.getX(i) + a[0] / l * w; out[i * 3 + 1] = P.getY(i) + a[1] / l * w; out[i * 3 + 2] = P.getZ(i) + a[2] / l * w;
    }
    const o = new T.BufferGeometry(); o.setAttribute('position', new T.BufferAttribute(out, 3)); if (g.index) o.setIndex(g.index); return o;
  }
  const triCount = (o) => { let n = 0; o.traverse(m => { if (m.isMesh && m.geometry) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(n); };

  // ---------------------------------------------------------------- textures + materials
  const TX = {};
  const tex = (k, w, h, draw, rep) => TX[k] || (TX[k] = (() => { const t = C.signTexture(w, h, draw); if (rep) t.wrapS = t.wrapT = T.RepeatWrapping; return t; })());
  const SANS = '"Helvetica Neue",Arial,"Noto Sans","Noto Sans JP",sans-serif';
  const ribTex = () => tex('rib', 64, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2; i++) { g.fillStyle = '#b9b9b9'; g.fillRect(i * 32, 0, 4, h); g.fillStyle = '#e4e4e4'; g.fillRect(i * 32 + 4, 0, 3, h); } }, true);
  function glassTex(k, alpha) {
    return tex('glass' + k, 64, 64, (g, w, h) => {
      g.fillStyle = '#2b2f36'; g.fillRect(0, 0, w, h); g.clearRect(3, 3, w - 6, h - 6);
      g.fillStyle = 'rgba(16,34,44,' + alpha + ')'; g.fillRect(3, 3, w - 6, h - 6);
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.moveTo(8, h - 6); g.lineTo(22, h - 6); g.lineTo(50, 6); g.lineTo(36, 6); g.closePath(); g.fill();
      g.fillStyle = '#2b2f36'; g.fillRect(3, 24, w - 6, 2);
    });
  }
  const glassEm = () => tex('glassE', 64, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(4, 4, w - 8, 20); g.fillRect(4, 27, w - 8, h - 31); });
  const ledTex = () => tex('led', 512, 80, (g, w, h) => {
    g.fillStyle = '#08080a'; g.fillRect(0, 0, w, h);
    C.text(g, '松山市', 150, 42, 58, '#ffb347'); C.text(g, 'Matsuyama', 372, 46, 34, '#ffe9b8', SANS, 'bold');
  });
  const logoTex = () => tex('logo', 512, 64, (g, w, h) => { C.text(g, 'IYOTETSU', w / 2, 34, 60, '#ffffff', SANS, '900'); });
  const plateTex = () => tex('plate', 256, 112, (g, w, h) => {
    g.fillStyle = '#7a1a16'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d9bd6a'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
    C.text(g, 'D51 200', w / 2, h / 2 + 2, 62, '#ecd790', SANS, 'bold');
  });
  const puffTex = () => tex('puff', 64, 64, (c, w, h) => { const r = c.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.55, 'rgba(250,250,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, w, h); });

  let MT = null;
  function mats() {
    if (MT) return MT;
    const tm = (o) => new T.MeshToonMaterial(Object.assign({ gradientMap: C.gradient }, o));
    const glow = (hex, max, em) => C.nightGlow(tm({ color: hex, emissive: em == null ? hex : em, emissiveIntensity: 0 }), max);
    const gl = (k, a, em, max) => C.nightGlow(tm({ map: glassTex(k, a), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, emissive: em, emissiveMap: glassEm(), emissiveIntensity: 0 }), max);
    MT = {
      V: tm({ color: 0xffffff, vertexColors: true }),
      R: tm({ color: 0xffffff, vertexColors: true, map: ribTex() }),
      I1: C.nightGlow(tm({ color: 0xffffff, vertexColors: true, emissive: 0xffd9a0, emissiveIntensity: 0 }), 0.5),
      I2: C.nightGlow(tm({ color: 0xffffff, vertexColors: true, emissive: 0xffc890, emissiveIntensity: 0 }), 0.32),
      L1: glow(0xfff6dc, 1.4, 0xfff0c0), L2: glow(0xfff0d8, 1.3, 0xffe2b0),
      G1: gl('a', 0.42, 0xffc878, 1.25), G2: gl('b', 0.45, 0xffb760, 0.55),   // coaches: warm, not blown-out white ("brightly lit" but amber)
      H: glow(0xfff4d0, 1.6, 0xfff0c0), T: glow(0xd83030, 1.3, 0xff3030), F: glow(0xff7a2a, 1.1, 0xff6a20),
      logo: tm({ map: logoTex(), transparent: true, depthWrite: false }),
      led: tm({ color: 0x111111, map: ledTex(), emissive: 0xffffff, emissiveMap: ledTex(), emissiveIntensity: 0.9 }),
      plate: tm({ map: plateTex() }),
    };
    return MT;
  }
  const nightK = () => (MT ? MT.H.emissiveIntensity / 1.6 : 0);

  // ---------------------------------------------------------------- wheelsets (rotate by distance)
  const WSG = {};
  function wheelset(r, wx, z, kind) {
    const m = mats(), wk = kind + r + ',' + wx;
    if (!WSG[wk]) WSG[wk] = wheelGeo(r, wx, kind);
    const g = new T.Group(); g.position.set(0, r, z); g.userData.r = r;
    g.add(new T.Mesh(WSG[wk], m.V)); return g;
  }
  function wheelGeo(r, wx, kind) {
    const b = new Batch();
    if (kind === 'drv') {   // D51 driving axle: black Boxpok wheels, red rim, counterweight, crank-pin boss
      const rc = 0.33;
      for (const s of [-1, 1]) {
        b.cylX('V', 0x9a2420, r, 0.11, 22, s * wx, 0, 0);                     // red tyre
        b.cylX('V', 0x1b1c21, r * 0.9, 0.135, 22, s * wx, 0, 0);             // black disc (red ring stays visible)
        b.cylX('V', 0x7b808a, 0.2, 0.17, 10, s * wx, 0, 0);                  // hub
        for (let k = 0; k < 5; k++) { const a = k * PI * 2 / 5 + 0.3; b.box('V', 0x30333b, 0.05, 0.09, r * 0.62, s * (wx + 0.07), Math.sin(a) * r * 0.45, Math.cos(a) * r * 0.45, -a, 0, 0); }
        b.box('V', 0x4a4e57, 0.09, 0.3, 0.46, s * (wx + 0.03), 0, -0.4);      // counterweight
        b.cylX('V', 0xb5b9c0, 0.075, 0.12, 8, s * (wx + 0.1), 0, rc);       // crank-pin boss
      }
      b.cylX('V', 0x24262b, 0.09, wx * 2, 8, 0, 0, 0);
    } else {                // carriage / tender / pony wheelset
      for (const s of [-1, 1]) {
        b.cylX('V', 0x26272b, r, 0.1, 14, s * wx, 0, 0);
        b.cylX('V', 0x1a1b1f, r + 0.028, 0.025, 14, s * (wx - 0.065), 0, 0);
        b.cylX('V', 0x5f636b, r * 0.5, 0.115, 8, s * wx, 0, 0);
        b.box('V', 0xb4b8be, 0.12, 0.06, r * 0.5, s * (wx + 0.04), 0, r * 0.35);
      }
      b.cylX('V', 0x2b2d32, 0.055, wx * 2, 6, 0, 0, 0);
    }
    return b.geoOf('V');
  }

  // ---------------------------------------------------------------- car cross-section
  const RH = [[1.32, 0.7], [1.355, 0.85], [1.37, 1.0], [1.37, 2.98], [1.355, 3.15], [1.31, 3.3], [1.22, 3.42], [1.06, 3.52], [0.84, 3.58], [0.55, 3.61], [0, 3.62]];
  function polyOf(y0, y1, sx) {
    const r = RH.filter(p => p[1] >= y0 - 1e-6 && p[1] <= y1 + 1e-6).map(p => [p[0] * sx, p[1]]), out = r.slice();
    for (let i = r.length - 1; i >= 0; i--) if (r[i][0] > 1e-6) out.push([-r[i][0], r[i][1]]);
    return out;
  }
  const FL = 1.0, CE = 2.98, EN = 0.5;

  const EMU_SPEC = { L: 18, hw: 1.37, body: 0xea6e26, roof: 0xea6e26, door: 0xea6e26, doors: [-6.2, 0, 6.2], dw: 1.3, pw: 0.65, ww: 1.0, pil: 0.14, sill: 1.5, head: 2.62,
    seat: 0x2f8f8a, seatBase: 0x69787f, floor: 0x8e9a8c, wall: 0xf0ead8, bz: 6.2, ax: 1.05, wr: 0.43, stripe: null, coach: false, posters: false };
  const COACH_SPEC = { L: 17, hw: 1.43, body: 0xe9e6db, roof: 0xaeb4bb, door: 0xe9e6db, doors: [-5.9, 5.9], dw: 1.3, pw: 0.6, ww: 1.5, pil: 0.16, sill: 1.42, head: 2.72,
    seat: 0x86b8dc, seatBase: 0xc8cdd0, floor: 0xc6bfae, wall: 0xf8f5ec, bz: 5.8, ax: 1.1, wr: 0.43, stripe: 0x2d63b2, coach: true, posters: true };

  // front / rear face of a cab end (sign +1 front, -1 rear); head=true shows white headlights, else red tail lights
  function cabFace(S, bt, sign, head) {
    const zf = S.L / 2;
    bt.frame = sign > 0 ? null : new T.Matrix4().makeRotationY(PI);
    const bx = (hex, w, h, d, x, y, z) => bt.box('V', hex, w, h, d, x, y, z);
    bx(0x1b1d22, 2.3, 1.5, 0.02, 0, 2.25, zf + 0.01);                          // black panel
    for (const s of [-1, 1]) {
      bx(0x26343f, 1.04, 0.8, 0.012, s * 0.54, 2.2, zf + 0.026);              // windscreen panes
      bt.quad('V', 0x62808f, 0.07, 0.6, s * 0.54 - 0.2, 2.2, zf + 0.034, 0, 0, 0.42);
      bt.quad('V', 0x62808f, 0.03, 0.5, s * 0.54 - 0.06, 2.2, zf + 0.034, 0, 0, 0.42);
      bt.quad('V', 0x101114, 0.025, 0.5, s * 0.54 + 0.12, 2.0, zf + 0.034, 0, 0, s * 1.05);   // wiper
      const lk = head ? 'H' : 'T', lc = head ? 0xfff4d0 : 0xd83030;
      bt.cylZ('V', 0x2a2c31, 0.105, 0.03, 12, s * 0.95, 1.68, zf + 0.03);     // lamp housings
      bt.cylZ(lk, lc, 0.075, 0.03, 12, s * 0.95, 1.68, zf + 0.047);
      bt.cylZ('V', 0x2a2c31, 0.062, 0.03, 10, s * 0.76, 1.68, zf + 0.03);
      bt.cylZ(lk, lc, 0.045, 0.03, 10, s * 0.76, 1.68, zf + 0.047);
      bx(0xc9cdd2, 0.1, 0.1, 0.05, s * 1.05, 1.0, zf + 0.025);                 // corner steps/handles
    }
    bx(0xc3c8ce, 2.1, 0.24, 0.1, 0, 0.82, zf + 0.05);                           // pilot / skirt plate
    bx(0x3a3d44, 0.34, 0.28, 0.5, 0, 0.86, zf + 0.25);                          // coupler
    bx(0x9aa0a8, 0.52, 0.14, 0.05, 0, 0.86, zf + 0.5);
    bt.cylZ('V', 0x15161a, 0.025, 0.4, 5, -0.28, 0.72, zf + 0.25); bt.cylZ('V', 0x15161a, 0.025, 0.4, 5, 0.28, 0.72, zf + 0.25);
    bt.frame = null;
  }
  function cabObjs(S, car, sign, head) {
    const M = mats(), zf = S.L / 2, face = new T.Group(); if (sign < 0) face.rotation.y = PI; car.add(face);
    const logo = new T.Mesh(new T.PlaneGeometry(1.76, 0.22), M.logo); logo.position.set(0, 1.26, zf + 0.012); face.add(logo);
    if (head) {
      const led = new T.Mesh(new T.PlaneGeometry(1.28, 0.2), M.led); led.position.set(0, 2.83, zf + 0.03); face.add(led);
      for (const s of [-1, 1]) { const h = C.makeHalo(1.15, 0xfff0c8, 0.85); h.position.set(s * 0.95, 1.68, zf + 0.15); face.add(h); }
    } else for (const s of [-1, 1]) { const h = C.makeHalo(0.55, 0xff4a3a, 0.7); h.position.set(s * 0.95, 1.68, zf + 0.1); face.add(h); }
  }
  // blank rear end of a coach: grey gangway door + red lamps
  function tailFace(S, bt, sign, lamps) {
    const zf = S.L / 2; bt.frame = sign > 0 ? null : new T.Matrix4().makeRotationY(PI);
    bt.box('V', 0x3a3d44, 1.1, 1.95, 0.02, 0, 2.0, zf + 0.01); bt.box('V', 0x26343f, 0.6, 0.6, 0.012, 0, 2.35, zf + 0.022);
    if (lamps) for (const s of [-1, 1]) { bt.cylZ('V', 0x2a2c31, 0.1, 0.03, 10, s * 1.0, 1.55, zf + 0.03); bt.cylZ('T', 0xd83030, 0.07, 0.03, 10, s * 1.0, 1.55, zf + 0.047); }
    bt.box('V', 0x9aa0a8, 0.04, 0.9, 0.05, -0.62, 1.9, zf + 0.04); bt.box('V', 0x9aa0a8, 0.04, 0.9, 0.05, 0.62, 1.9, zf + 0.04);
    bt.frame = null;
  }
  function tailObjs(S, car, sign, lamps) {
    const zf = S.L / 2;
    if (lamps) for (const s of [-1, 1]) { const h = C.makeHalo(0.55, 0xff4a3a, 0.7); h.position.set(sign * s * 1.0, 1.55, sign * (zf + 0.1)); car.add(h); }
  }

  // ---------------------------------------------------------------- generic hollow railway car
  const CARS = {};   // baked geometry is shared between all cars of the same kind
  function buildCar(S0) {
    const S = Object.assign({}, S0.coach ? COACH_SPEC : EMU_SPEC, S0), M = mats();
    const ck = [S.coach ? 'c' : 'e', S.fk, S.rk, S.panto ? 1 : 0, (S.seed || 1) % 3, !!S.rearHead].join();
    const rec = CARS[ck] || (CARS[ck] = bakeCar(S));
    const car = new T.Group(), mfor = { B: M.V, V: M.V, R: M.R, I: S.coach ? M.I2 : M.I1, L: S.coach ? M.L2 : M.L1, G: S.coach ? M.G2 : M.G1, H: M.H, T: M.T };
    for (const k of Object.keys(rec.geos)) { const m = new T.Mesh(rec.geos[k], mfor[k]); m.castShadow = k === 'B' || k === 'V' || k === 'R'; m.receiveShadow = true; if (k === 'B') m.add(new T.Mesh(rec.ink, C.ink)); car.add(m); }
    const doors = [];
    for (const d of rec.doors) { const m = new T.Mesh(d.geo, mfor[d.key]); m.castShadow = d.key === 'R'; m.receiveShadow = true; m.userData.dir = d.dir; car.add(m); doors.push(m); }
    const ws = rec.wsZ.map(z => { const w = wheelset(S.wr, 0.6, z); car.add(w); return w; });
    for (const f of rec.faces) { if (f[0] === 'cab') cabObjs(S, car, f[1], f[2]); else tailObjs(S, car, f[1], f[2]); }
    car.userData = { doors, travel: S.pw - 0.04, ws };
    return car;
  }
  function bakeCar(S) {
    const R = rng(S.seed || 1), faces = [], wsZ = [];
    const L = S.L, Lh = L / 2, hw = S.hw, sx = hw / 1.37, hwi = hw - 0.07, SILL = S.sill, WH = S.head, pil = S.pil, dw = S.dw, pw = S.pw;
    const bt = new Batch(), dA = new Batch(), dB = new Batch();
    const full = polyOf(0, 9, sx), roof = polyOf(CE, 9, sx), slab = polyOf(0, FL, sx), cyF = 2.16;
    const straight = (poly, cy) => loft(poly, cy, [{ z: -Lh + EN - 0.05, sx: 1, sy: 1 }, { z: Lh - EN + 0.05, sx: 1, sy: 1 }], false, false);
    bt.add('B', straight(slab, 1), S.body); bt.add('B', straight(roof, 3.3), S.roof);
    const front = [{ z: Lh - EN, sx: 1, sy: 1 }, { z: Lh - 0.22, sx: 1, sy: 1 }, { z: Lh - 0.1, sx: 0.985, sy: 0.985 }, { z: Lh - 0.03, sx: 0.96, sy: 0.96 }, { z: Lh, sx: 0.94, sy: 0.94 }];
    const rear = [{ z: -Lh, sx: 0.94, sy: 0.94 }, { z: -Lh + 0.03, sx: 0.96, sy: 0.96 }, { z: -Lh + 0.1, sx: 0.985, sy: 0.985 }, { z: -Lh + 0.22, sx: 1, sy: 1 }, { z: -Lh + EN, sx: 1, sy: 1 }];
    bt.add('B', loft(full, cyF, front, true, true), S.body); bt.add('B', loft(full, cyF, rear, true, true), S.body);

    // ---- side walls: zones between door spans (pillars + sill/header strips + window glass) and door pockets
    const spans = S.doors.map(c => [c - dw / 2 - pw, c + dw / 2 + pw]), zones = []; let z0 = -Lh + EN;
    for (const sp of spans) { zones.push([z0, sp[0]]); z0 = sp[1]; } zones.push([z0, Lh - EN]);
    const strip = (xc, y, h, za, zb) => { if (S.stripe) bt.box('V', S.stripe, 0.012, 0.2, zb - za, xc, y, (za + zb) / 2); };
    for (const [za, zb] of zones) {
      const zl = zb - za; if (zl < 0.05) continue;
      const n = zl < 0.8 ? 0 : Math.max(1, Math.round((zl - pil) / (S.ww + pil))), wA = n ? (zl - (n + 1) * pil) / n : 0, zc = (za + zb) / 2;
      for (const s of [-1, 1]) {
        const xc = s * (hw - 0.035);
        bt.rib('R', S.body, 0.07, SILL - FL, zl, xc, (FL + SILL) / 2, zc);
        bt.rib('R', S.body, 0.07, CE - WH, zl, xc, (WH + CE) / 2, zc);
        strip(s * (hw + 0.004), 1.2, 0.2, za, zb);
        if (!n) { bt.rib('R', S.body, 0.07, WH - SILL, zl, xc, (SILL + WH) / 2, zc); continue; }
        for (let i = 0; i <= n; i++) bt.rib('R', S.body, 0.07, WH - SILL, pil, xc, (SILL + WH) / 2, za + i * (wA + pil) + pil / 2);
        for (let i = 0; i < n; i++) bt.quad('G', 0xffffff, wA, WH - SILL, s * (hw - 0.03), (SILL + WH) / 2, za + pil + i * (wA + pil) + wA / 2, 0, s * PI / 2, 0);
      }
    }
    const posterCol = [0xd9534f, 0xf0ad4e, 0x5bc0de, 0x8fbf6a, 0xb48ad6];
    spans.forEach((sp, di) => {
      for (const s of [-1, 1]) for (const [a, b] of [[sp[0], sp[0] + pw], [sp[1] - pw, sp[1]]]) {
        bt.rib('R', S.body, 0.06, CE - FL, pw, s * (hw - 0.03), (FL + CE) / 2, (a + b) / 2);
        strip(s * (hw + 0.004), 1.2, 0.2, a, b);
        if (S.posters && b - a > 0.5) { const pc = posterCol[(di + (a < 0 ? 0 : 1) + (s > 0 ? 2 : 0)) % 5]; bt.quad('I', pc, 0.42, 0.58, s * (hw - 0.062), 2.0, (a + b) / 2, 0, -s * PI / 2, 0); bt.quad('I', 0xffffff, 0.34, 0.1, s * (hw - 0.064), 1.78, (a + b) / 2, 0, -s * PI / 2, 0); }
      }
    });
    // ---- sliding door leaves (two meshes per direction; merged across doors and both sides)
    const lx = hw - 0.075, lt = 0.03, lw = dw / 2 - 0.012, lh = CE - FL - 0.06;
    for (const c of S.doors) for (const s of [-1, 1]) for (const dir of [-1, 1]) {
      const D = dir < 0 ? dA : dB, zc = c + dir * dw / 4;
      D.rib('R', S.door, lt, lh, lw, s * lx, FL + 0.02 + lh / 2, zc);
      D.quad('G', 0xffffff, 0.4, 0.9, s * (lx + lt / 2 + 0.004), 2.18, zc, 0, s * PI / 2, 0);
      if (S.stripe) D.box('V', S.stripe, 0.008, 0.2, lw, s * (lx + lt / 2 + 0.004), 1.2, zc);
    }

    // ---- interior (seen through the windows)
    const seatTop = SILL - 0.05, zcs = [];
    for (const [za, zb] of zones) {
      const zl = zb - za - 0.04; if (zl < 0.3) continue;
      for (const s of [-1, 1]) {
        const zc = (za + zb) / 2;
        bt.box('I', S.seatBase, 0.44, seatTop - 0.14 - FL, zl, s * (hwi - 0.22), (FL + seatTop - 0.14) / 2, zc);
        bt.box('I', S.seat, 0.46, 0.14, zl, s * (hwi - 0.23), seatTop - 0.07, zc);
        bt.box('I', S.seat, 0.07, 0.56, zl, s * (hwi - 0.035), seatTop + 0.28, zc);
      }
    }
    bt.box('I', S.floor, 2 * hwi - 0.1, 0.02, L - 1.0, 0, FL + 0.012, 0);
    bt.box('I', S.wall, 2 * hwi - 0.1, 0.02, L - 1.0, 0, CE - 0.01, 0);
    for (let k = -3; k <= 3; k++) for (const s of [-1, 1]) bt.box('L', 0xffffff, 0.2, 0.015, 1.3, s * 0.4, CE - 0.03, k * L / 8.2);
    for (const s of [-1, 1]) {
      bt.box('I', 0xc5cad0, 0.03, 0.03, L - 1.6, s * 0.72, 2.72, 0);
      for (let z = -Lh + 1.3; z < Lh - 1.0; z += 1.0) { bt.box('I', 0xf2efe6, 0.01, 0.2, 0.01, s * 0.72, 2.61, z); bt.box('I', 0xf2efe6, 0.014, 0.075, 0.1, s * 0.72, 2.47, z); }
    }
    for (const c of S.doors) for (const s of [-1, 1]) for (const d of [-1, 1]) bt.cylY('I', 0xd5dade, 0.022, CE - FL, 6, s * (hwi - 0.5), (FL + CE) / 2, c + d * (dw / 2 + pw - 0.1));
    for (const e of [-1, 1]) {
      const z = e * (Lh - EN) - e * 0.004;
      bt.quad('I', S.wall, 2 * hwi, CE - FL, 0, (FL + CE) / 2, z, 0, e > 0 ? PI : 0, 0);
      bt.quad('I', 0x8e979d, 0.95, 1.8, 0, FL + 0.9, z - e * 0.004, 0, e > 0 ? PI : 0, 0);
      bt.quad('L', 0xffffff, 0.5, 0.45, 0, 2.25, z - e * 0.008, 0, e > 0 ? PI : 0, 0);
      if (S.posters) for (let k = 0; k < 3; k++) bt.quad('I', posterCol[(k * 2 + (e > 0 ? 1 : 0)) % 5], 0.34, 0.46, -0.95 + k * 0.95 - (k === 1 ? 0 : 0), 2.0, z - e * 0.006, 0, e > 0 ? PI : 0, 0);
    }

    // ---- roof gear
    const acZ = S.panto ? [-6.2, -3.6, 3.6, 6.2] : [-6.3, -2.1, 2.1, 6.3];
    if (!S.coach) for (const z of acZ) {
      bt.box('V', 0xcfd3d7, 1.1, 0.26, 1.9, 0, 3.74, z); bt.box('V', 0xa6abb2, 0.9, 0.05, 1.7, 0, 3.89, z);
      for (const s of [-1, 1]) bt.box('V', 0x3a3e46, 0.012, 0.09, 1.5, s * 0.556, 3.74, z);
      bt.box('V', 0x70757d, 0.5, 0.05, 0.4, 0, 3.94, z);
    } else for (const z of [-5.2, 0, 5.2]) { bt.box('V', 0xc3c8cd, 1.0, 0.2, 1.7, 0, 3.7, z); bt.box('V', 0x8f959c, 0.8, 0.05, 1.5, 0, 3.82, z); }
    if (S.panto) {
      const pc = 0x2c2e33, A = [0, 3.8, -0.7], K = [0, 4.45, 0.7], H = [0, 4.7, -0.3];
      for (const s of [-1, 1]) bt.cylY('V', 0x8a8f96, 0.05, 0.18, 6, s * 0.4, 3.72, -0.7);
      bt.box('V', pc, 1.0, 0.07, 0.4, 0, 3.78, -0.7);
      bt.rod('V', pc, A, K, 0.035, 5); bt.rod('V', pc, K, H, 0.03, 5); bt.rod('V', pc, [0, 3.85, -0.5], [0, 4.3, 0.55], 0.018, 4);
      bt.box('V', 0xa8adb3, 1.9, 0.04, 0.12, 0, 4.72, -0.3); bt.box('V', 0x1b1c20, 1.7, 0.03, 0.06, 0, 4.755, -0.3);
      for (const s of [-1, 1]) bt.box('V', 0xa8adb3, 0.04, 0.07, 0.12, s * 0.97, 4.75, -0.3, 0, 0, s * 0.5);
    }

    // ---- underfloor equipment + bogies
    for (let i = 0; i < 6; i++) {
      const z = -4.2 + i * 1.7 + (R() - 0.5) * 0.3, w = 0.55 + R() * 0.5, d = 1.0 + R() * 0.7, x = (i % 2 ? 1 : -1) * (0.15 + R() * 0.55), h = 0.2 + R() * 0.16;
      bt.box('V', i % 3 === 0 ? 0x4c5158 : 0x666c73, w, h, d, x, 0.7 - h / 2, z);
    }
    bt.cylZ('V', 0x555a61, 0.13, 2.4, 8, -0.1, 0.56, -1.0);
    const bz = S.bz, ax = S.ax;
    for (const z of [-bz, bz]) {
      for (const s of [-1, 1]) { bt.box('V', 0x2a2c31, 0.12, 0.2, 2 * ax + 0.4, s * 0.95, 0.55, z); for (const a of [-1, 1]) bt.box('V', 0x34373d, 0.16, 0.2, 0.2, s * 0.77, 0.43, z + a * ax); }
      bt.box('V', 0x2a2c31, 1.9, 0.18, 0.3, 0, 0.58, z); bt.box('V', 0x3d4047, 0.5, 0.36, 0.5, 0, 0.45, z - 0.55); bt.box('V', 0x3d4047, 0.5, 0.36, 0.5, 0, 0.45, z + 0.55);
      for (const a of [-1, 1]) wsZ.push(z + a * ax);
    }
    // ---- ends: cab face, gangway bellows or plain
    const bel = (zA, zB) => { const rg = []; for (let i = 0; i <= 4; i++) { const k = i % 2 ? 0.8 : 0.84; rg.push({ z: zA + (zB - zA) * i / 4, sx: k, sy: k }); } bt.add('V', loft(full, cyF, rg, false, false), 0x34373d); };
    if (S.fk === 'cab') { cabFace(S, bt, 1, true); faces.push(['cab', 1, true]); } else if (S.fk === 'plain') { tailFace(S, bt, 1, false); faces.push(['tail', 1, false]); } else if (S.fk === 'gang') bel(Lh - 0.02, Lh + 0.34);
    if (S.rk === 'cab') { cabFace(S, bt, -1, !!S.rearHead); faces.push(['cab', -1, !!S.rearHead]); } else if (S.rk === 'tail') { tailFace(S, bt, -1, true); faces.push(['tail', -1, true]); } else if (S.rk === 'gang') bel(-Lh - 0.34, -Lh + 0.02);

    // ---- bake geometry (shared by every car built from this recipe)
    const geos = {}, doors = [], inkG = bt.geoOf('B');
    for (const k of Object.keys(bt.k)) geos[k] = k === 'B' ? inkG : bt.geoOf(k);
    for (const [D, dir] of [[dA, -1], [dB, 1]]) for (const k of Object.keys(D.k)) doors.push({ key: k, dir, geo: D.geoOf(k) });
    return { geos, ink: inkOf(inkG, 0.04), doors, wsZ, faces };
  }
  const setDoors = (cars) => (open) => { for (const c of cars) { const u = c.userData; if (u.doors) for (const m of u.doors) m.position.z = m.userData.dir * open * u.travel; } };
  function tracker(cars) {
    const last = cars.map(() => new T.Vector3()), has = cars.map(() => false), dv = new T.Vector3();
    return function () {
      let d0 = 0;
      cars.forEach((c, i) => {
        const p = c.position;
        if (has[i]) {
          dv.copy(p).sub(last[i]); _f.set(0, 0, 1).applyQuaternion(c.quaternion);
          let d = dv.dot(_f); if (Math.abs(d) > 4) d = 0;
          if (i === 0) d0 = d;
          const u = c.userData;
          if (u.ws) for (const w of u.ws) w.rotation.x += d / w.userData.r;
          if (u.drv) { u.theta += d / 0.7; for (const w of u.drv) w.rotation.x = u.theta; u.rods(u.theta); }
        }
        last[i].copy(p); has[i] = true;
      });
      return d0;
    };
  }

  // ================================================================= EMU
  C.makeEMU = function (opts = {}) {
    const n = Math.max(1, opts.cars || 3), CL = 18, SP = 18.6, g = new T.Group(); C.dynamic(g);
    const cars = [], offsets = [];
    for (let i = 0; i < n; i++) {
      const c = buildCar({ seed: i + 1, panto: i % 2 === 1 || n === 1, fk: i === 0 ? 'cab' : 'gang', rk: i === n - 1 ? 'cab' : 'gang' });
      c.position.z = (n - 1) / 2 * SP - i * SP; offsets.push(c.position.z); g.add(c); cars.push(c);
    }
    const track = tracker(cars);
    const o = { group: g, cars, offsets, carLength: CL, carSpacing: SP, length: n * CL + (n - 1) * 0.6, setDoors: setDoors(cars), update() { track(); } };
    o.tris = cars.map(triCount);
    return o;
  };

  // ================================================================= D51
  function hashN(x, y, z) { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); }
  const BLK = 0x1d1f25, BODY = 0x2a2d36, DK = 0x16171b, STEEL = 0x9aa0a8, RED = 0x9a2420;
  function makeLoco() {
    const bt = new Batch(), car = new T.Group(), M = mats(), BY = 2.35;
    const bx = (hex, w, h, d, x, y, z, rx, ry, rz) => bt.box('V', hex, w, h, d, x, y, z, rx, ry, rz);
    bx(DK, 1.15, 0.38, 10.6, 0, 1.1, 0.2);                                                   // frame
    bt.cylZ('B', BODY, 0.95, 7.1, 22, 0, BY, 0.35);                                           // boiler
    bt.cylZ('B', 0x30333c, 1.0, 1.6, 22, 0, BY, 4.7);                                         // smokebox
    bt.cylZ('V', 0x5f636c, 1.03, 0.05, 22, 0, BY, 5.5); bt.cylZ('V', DK, 0.9, 0.07, 22, 0, BY, 5.53); bt.cylZ('V', STEEL, 0.1, 0.06, 10, 0, BY - 0.05, 5.58);
    for (const z of [3.1, 1.2, -0.7, -2.3]) bt.cylZ('V', 0x555a63, 0.97, 0.12, 22, 0, BY, z);   // boiler bands
    bt.cyl('V', BODY, 0.3, 0.42, 0.5, 14, 0, 3.52, 0.3); bt.cyl('V', 0x555a63, 0.34, 0.34, 0.05, 14, 0, 3.8, 0.3);   // steam dome
    bt.cyl('V', BODY, 0.26, 0.36, 0.4, 14, 0, 3.5, 1.9); bt.cyl('V', 0x555a63, 0.29, 0.29, 0.04, 14, 0, 3.72, 1.9);  // sand dome
    bt.cylZ('V', 0x34373f, 0.2, 1.1, 10, 0, 3.55, 3.0); bt.cylZ('V', 0x555a63, 0.22, 0.08, 10, 0, 3.55, 2.5);     // feed-water heater
    bt.cyl('V', BODY, 0.3, 0.45, 0.2, 12, 0, 3.42, 4.65); bt.cyl('V', BLK, 0.3, 0.2, 0.75, 12, 0, 3.78, 4.65); bt.cyl('V', 0x555a63, 0.33, 0.33, 0.06, 12, 0, 4.0, 4.65);   // chimney
    bt.cylY('V', 0xb59a4e, 0.05, 0.3, 6, 0, 3.5, -2.6);                                         // whistle
    bx(BLK, 0.04, 0.78, 1.7, 0.9, 3.48, 4.35, 0, 0, -0.14); bx(BLK, 0.04, 0.78, 1.7, -0.9, 3.48, 4.35, 0, 0, 0.14);   // smoke deflectors
    for (const s of [-1, 1]) {
      bt.rod('V', STEEL, [s * 0.98, 2.78, -2.8], [s * 0.98, 2.78, 3.8], 0.018, 4);
      bx(BLK, 0.55, 0.05, 8.2, s * 1.22, 1.58, 1.5);                                          // running board
      bx(0x555a63, 0.55, 0.012, 8.2, s * 1.22, 1.612, 1.5);
      bt.cylZ('V', 0x2c2f36, 0.27, 1.2, 12, s * 1.08, 1.05, 4.8); bt.cylZ('V', 0x777c85, 0.29, 0.08, 12, s * 1.08, 1.05, 5.44);   // cylinders
      bx(0x555a63, 0.05, 0.05, 1.0, s * 1.04, 1.16, 3.7); bx(0x555a63, 0.05, 0.05, 1.0, s * 1.04, 0.94, 3.7);                      // guide bars
      bx(0x2c2f36, 0.1, 0.5, 0.25, s * 1.06, 1.3, 3.2);
      bt.cylZ('V', STEEL, 0.13, 0.28, 8, s * 0.95, 1.2, 5.98);                                  // buffers
      bx(0x34373f, 0.1, 0.1, 5.8, s * 0.45, 1.5, 2.6);
      // cab sides: lower panel, header, pillars
      bx(BLK, 0.06, 0.9, 2.75, s * 1.4, 1.95, -4.52); bx(BLK, 0.06, 0.45, 2.75, s * 1.4, 3.35, -4.52);
      for (const z of [-3.2, -4.0, -4.9, -5.85]) bx(BLK, 0.1, 1.05, 0.1, s * 1.4, 2.88, z);
    }
    bx(RED, 2.9, 0.5, 0.15, 0, 1.2, 5.82); bx(DK, 2.9, 0.05, 0.7, 0, 1.5, 5.55);               // buffer beam + front deck
    bx(0x34373f, 0.3, 0.25, 0.45, 0, 1.15, 6.05); bx(DK, 2.0, 0.05, 0.9, 0, 0.72, 6.2, -0.5, 0, 0);   // coupler + pilot
    bx(0x2f2a25, 2.8, 0.06, 2.8, 0, 1.45, -4.5); bx(BLK, 2.8, 2.1, 0.1, 0, 2.5, -3.12);          // cab floor + front wall
    bt.quad('F', 0xffffff, 0.62, 0.4, 0, 1.95, -3.07, 0, PI, 0);          // fire door glow
    bt.box('F', 0xffffff, 0.14, 0.14, 0.14, 0, 3.25, -4.5);                                      // cab lamp
    bx(0x555a63, 0.9, 0.05, 0.3, 0, 1.52, -3.35);
    bx(DK, 0.3, 0.2, 0.9, 0, 1.2, -6.15); bx(0x2f2a25, 2.3, 0.04, 0.9, 0, 1.5, -6.1);            // drawbar + apron
    bt.add('B', loft([[1.5, 3.45], [1.46, 3.55], [1.28, 3.67], [0.85, 3.75], [0, 3.79], [-0.85, 3.75], [-1.28, 3.67], [-1.46, 3.55], [-1.5, 3.45]], 3.45, [{ z: -5.95, sx: 1, sy: 1 }, { z: -3.0, sx: 1, sy: 1 }], true, true), BODY);   // cab roof
    bt.cylZ('H', 0xfff4d0, 0.16, 0.02, 14, 0, 3.7, 5.41); bt.cylZ('V', DK, 0.21, 0.3, 12, 0, 3.7, 5.25);   // headlamp
    // wheels that don't need rods
    const pony = wheelset(0.4, 0.62, 4.55), trail = wheelset(0.5, 0.62, -4.2); car.add(pony, trail);
    const drv = [2.5, 0.9, -0.7, -2.3].map(z => { const w = wheelset(0.7, 0.72, z, 'drv'); car.add(w); return w; });
    const inkG = bt.geoOf('B');
    for (const k of Object.keys(bt.k)) { const m = bt.mesh(k, k === 'B' || k === 'V' ? M.V : k === 'F' ? M.F : M.H, k === 'B' || k === 'V'); if (k === 'B') m.add(new T.Mesh(inkOf(inkG, 0.04), C.ink)); car.add(m); }
    const hl = C.makeHalo(2.6, 0xfff0c8, 0.95); hl.position.set(0, 3.7, 5.7); car.add(hl);
    const fh = C.makeHalo(2.4, 0xff8a40, 0.7); fh.position.set(0, 2.1, -4.3); car.add(fh);
    const plate = new T.Mesh(new T.PlaneGeometry(0.7, 0.31), M.plate); plate.position.set(0, BY + 0.58, 5.575); car.add(plate);
    for (const s of [-1, 1]) { const p = new T.Mesh(new T.PlaneGeometry(0.62, 0.27), M.plate); p.position.set(s * 1.435, 2.0, -4.55); p.rotation.y = s * PI / 2; car.add(p); }
    // moving rods
    const rc = 0.33, Lr = 2.9, yc = 1.05, rods = [];
    const sideM = new T.Group(), steel = M.V;
    for (const s of [-1, 1]) {
      const sb = new Batch(); sb.box('V', 0x8c9199, 0.035, 0.09, 4.95, 0, 0, 0.1); sb.cylX('V', 0xb5b9c0, 0.07, 0.05, 8, 0, 0, 2.5); sb.cylX('V', 0xb5b9c0, 0.07, 0.05, 8, 0, 0, -2.3);
      const side = sb.mesh('V', steel, false); side.position.x = s * 0.85; car.add(side);
      const mb = new Batch(); mb.box('V', 0xa3a8b0, 0.04, 0.1, Lr, 0, 0, 0); const main = mb.mesh('V', steel, false); car.add(main);
      const pb = new Batch(); pb.box('V', 0xc0c4ca, 0.05, 0.05, 1, 0, 0, 0); const pist = pb.mesh('V', steel, false); car.add(pist);
      const cb = new Batch(); cb.box('V', 0x6c717a, 0.14, 0.14, 0.26, 0, 0, 0); const xh = cb.mesh('V', steel, false); car.add(xh);
      rods.push({ s, side, main, pist, xh });
    }
    const userRods = (th) => {
      const sn = Math.sin(th), cs = Math.cos(th);
      for (const r of rods) {
        r.side.position.y = 0.7 - rc * sn; r.side.position.z = rc * cs;
        const yp = 0.7 - rc * sn, zp = 0.9 + rc * cs, zc = zp + Math.sqrt(Lr * Lr - (yc - yp) * (yc - yp));
        r.main.position.set(r.s * 0.93, (yp + yc) / 2, (zp + zc) / 2); r.main.rotation.x = -Math.atan2(yc - yp, zc - zp);
        r.xh.position.set(r.s * 1.0, yc, zc); r.pist.position.set(r.s * 1.08, yc, (zc + 4.2) / 2); r.pist.scale.z = Math.max(0.05, 4.2 - zc);
      }
    };
    car.userData = { drv, ws: [pony, trail], theta: 0, rods: userRods, loco: true }; userRods(0);
    return car;
  }
  function makeTender() {
    const bt = new Batch(), car = new T.Group(), M = mats();
    bt.box('V', DK, 2.0, 0.3, 8.3, 0, 1.0, 0);
    bt.box('B', BODY, 2.8, 1.45, 8.0, 0, 1.98, 0);
    bt.box('V', BLK, 2.7, 0.05, 3.9, 0, 2.725, -2.0); bt.cylY('V', 0x555a63, 0.35, 0.1, 12, 0, 2.78, -2.2);
    for (const s of [-1, 1]) bt.box('V', BODY, 0.06, 0.55, 3.6, s * 1.37, 2.975, 2.2);
    bt.box('V', BODY, 2.8, 1.05, 0.08, 0, 3.25, 4.0); bt.box('V', BODY, 2.8, 0.5, 0.06, 0, 2.95, 0.4);
    bt.box('V', 0x555a63, 2.8, 0.04, 0.1, 0, 3.78, 4.0);
    for (const s of [-1, 1]) { bt.box('T', 0xffffff, 0.2, 0.2, 0.05, s * 0.9, 2.3, -4.03); bt.box('V', STEEL, 0.03, 1.2, 0.05, s * 1.2, 2.2, -4.04); }
    bt.box('V', 0x34373f, 0.3, 0.25, 0.45, 0, 1.15, -4.5); bt.box('V', DK, 0.3, 0.2, 0.9, 0, 1.2, 4.55);
    for (const z of [-2.5, 2.5]) {
      for (const s of [-1, 1]) bt.box('V', 0x2a2c31, 0.12, 0.2, 2.2, s * 0.95, 0.55, z);
      bt.box('V', 0x2a2c31, 1.9, 0.18, 0.3, 0, 0.58, z);
    }
    // coal heap: flat-shaded, jittered icosahedron with dark vertex colours
    const ico = new T.IcosahedronGeometry(1, 1), P = ico.attributes.position, cols = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), j = 0.8 + 0.35 * hashN(x, y, z); P.setXYZ(i, x * j * 1.15, Math.max(0, y) * j * 0.75, z * j * 1.6); }
    ico.computeVertexNormals();
    for (let f = 0; f < P.count; f += 3) { const k = 0.12 + 0.12 * hashN(P.getX(f), P.getY(f), P.getZ(f)); for (let v = 0; v < 3; v++) { cols[(f + v) * 3] = k * 1.05; cols[(f + v) * 3 + 1] = k; cols[(f + v) * 3 + 2] = k * 1.1; } }
    put(ico, 0, 2.62, 2.2); bt.add('V', ico, null, cols);
    const ws = [];
    for (const z of [1.6, 3.4, -1.6, -3.4]) { const w = wheelset(0.43, 0.6, z); car.add(w); ws.push(w); }
    const inkG = bt.geoOf('B');
    for (const k of Object.keys(bt.k)) { const m = bt.mesh(k, k === 'T' ? M.T : M.V, k !== 'T'); if (k === 'B') m.add(new T.Mesh(inkOf(inkG, 0.04), C.ink)); car.add(m); }
    car.userData = { ws }; return car;
  }

  C.makeD51Train = function (opts = {}) {
    const nc = opts.coaches == null ? 2 : opts.coaches, g = new T.Group(); C.dynamic(g);
    const loco = makeLoco(), tender = makeTender(), cars = [loco, tender], lens = [11.8, 8.6], gap = 0.7;
    for (let i = 0; i < nc; i++) { cars.push(buildCar({ coach: true, seed: i + 3, fk: i === 0 ? 'plain' : 'gang', rk: i === nc - 1 ? 'tail' : 'gang' })); lens.push(17); }
    const total = lens.reduce((a, b) => a + b, 0) + gap * (cars.length - 1), offsets = []; let zz = total / 2;
    cars.forEach((c, i) => { c.position.z = zz - lens[i] / 2; offsets.push(c.position.z); zz -= lens[i] + gap; g.add(c); });
    const track = tracker(cars);
    // steam: chimney puffs + low platform clouds, in the parent's space so they trail behind a moving train
    const sg = new T.Group(); C.dynamic(sg); const puffs = [], clouds = [];
    const mk = (arr, n) => { for (let i = 0; i < n; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: puffTex(), transparent: true, opacity: 0, depthWrite: false })); s.visible = false; sg.add(s); arr.push({ s, age: 99, life: 3, v: new T.Vector3(), a: 0.5, k0: 1, k1: 3 }); } };
    mk(puffs, 22); mk(clouds, 26);
    let on = true, accP = 0, accC = 0, speed = 0;
    const A = new T.Vector3(), B = new T.Vector3(), COL_D = new T.Color(0xf4f7fb), COL_N = new T.Color(0x8e98b8);
    const spawn = (arr, lx, ly, lz, dx, dy, dz, vel, life, a, k0, k1) => {
      const p = arr.find(q => q.age >= q.life); if (!p) return;
      A.set(lx, ly, lz); B.set(lx + dx, ly + dy, lz + dz); loco.localToWorld(A); loco.localToWorld(B);
      if (g.parent) { g.parent.worldToLocal(A); g.parent.worldToLocal(B); }
      p.s.position.copy(A); p.v.copy(B).sub(A).multiplyScalar(vel); p.age = 0; p.life = life; p.a = a; p.k0 = k0; p.k1 = k1; p.s.visible = true;
    };
    const o = {
      group: g, cars, offsets, carLength: 17, carLengths: lens, carSpacing: lens.map((l, i) => i < lens.length - 1 ? (l + lens[i + 1]) / 2 + gap : 0), length: total, steamGroup: sg,
      setDoors: setDoors(cars), steam(v) { on = !!v; },
      update(dt) {
        if (g.parent && sg.parent !== g.parent) g.parent.add(sg);
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
