// Landmarks: trains, wheel, cars, shrines, shops... Each factory returns { group, update?, ... } in its own local frame.
// Local frame: origin = ground at base centre, +Z = front / travel direction, +Y up, 1 unit = 1 m.
(function (C) {
  const T = THREE;
  const M = C.toon;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const rng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const PI = Math.PI;

  // ---------- material caches ----------
  const cacheG = {};
  // emissive material that glows at night (sky.js drives intensity through nightGlow)
  function glow(hex, max = 1, em = hex) {
    const k = 'g' + hex + '_' + max + '_' + em;
    if (cacheG[k]) return cacheG[k];
    const m = new T.MeshToonMaterial({ color: hex, gradientMap: C.gradient, emissive: em, emissiveIntensity: 0 });
    C.nightGlow(m, max); return (cacheG[k] = m);
  }
  // constant emissive (warm interiors, always lit)
  function lit(hex, em, k = 0.8) {
    const key = 'l' + hex + '_' + em + '_' + k;
    return cacheG[key] || (cacheG[key] = new T.MeshToonMaterial({ color: hex, gradientMap: C.gradient, emissive: em, emissiveIntensity: k }));
  }
  function glass(hex = 0x9fc8e0, op = 0.3) {
    const key = 'gl' + hex + '_' + op;
    return cacheG[key] || (cacheG[key] = new T.MeshToonMaterial({ color: hex, gradientMap: C.gradient, transparent: true, opacity: op, depthWrite: false }));
  }
  let tileTex = null;
  function roofMat(hex) {
    const key = 'r' + hex;
    if (cacheG[key]) return cacheG[key];
    if (!tileTex) {
      tileTex = C.signTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#b9b9b9'; for (let y = 0; y < h; y += 16) g.fillRect(0, y + 12, w, 4);
        g.fillStyle = '#d6d6d6'; for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 8; x < w; x += 16) g.fillRect(x, y, 2, 12);
      });
      tileTex.wrapS = tileTex.wrapT = T.RepeatWrapping;
    }
    return (cacheG[key] = new T.MeshToonMaterial({ color: hex, map: tileTex, gradientMap: C.gradient }));
  }

  // ---------- geometry helpers ----------
  const B = (p, w, h, d, m, x = 0, y = 0, z = 0) => C.box(w, h, d, m, x, y, z, p);
  function G(geo, m, p, x = 0, y = 0, z = 0) {
    const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true;
    if (p) p.add(o); return o;
  }
  const cylY = (p, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 8) => G(new T.CylinderGeometry(rt, rb, h, seg), m, p, x, y, z);
  const cylZ = (p, r, len, m, x = 0, y = 0, z = 0, seg = 10) => { const o = cylY(p, r, r, len, m, x, y, z, seg); o.rotation.x = PI / 2; return o; };
  const cylX = (p, r, len, m, x = 0, y = 0, z = 0, seg = 10) => { const o = cylY(p, r, r, len, m, x, y, z, seg); o.rotation.z = PI / 2; return o; };
  const sph = (p, r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 8) => { const o = G(new T.SphereGeometry(r, seg, seg - 2), m, p, x, y, z); o.scale.set(sx, sy, sz); return o; };
  const UP = V(0, 1, 0), FWD = V(0, 0, 1);
  function rod(p, a, b, r, m, seg = 6) {
    const d = b.clone().sub(a), l = d.length();
    const o = G(new T.CylinderGeometry(r, r, l, seg), m, p);
    o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(UP, d.normalize()); return o;
  }
  // orientation basis for something running from a to b (z along the run, y roughly up)
  function frameQ(a, b) {
    const dir = b.clone().sub(a).normalize();
    const side = new T.Vector3().crossVectors(UP, dir); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const up = new T.Vector3().crossVectors(dir, side);
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(side, up, dir));
  }
  function mergeG(list) {
    const gs = list.map(g => g.index ? g.toNonIndexed() : g); let n = 0; gs.forEach(g => n += g.attributes.position.count);
    const out = new T.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'color']) {
      if (!gs.every(g => g.attributes[name])) continue;
      const it = gs[0].attributes[name].itemSize, a = new Float32Array(n * it); let o = 0;
      for (const g of gs) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
      out.setAttribute(name, new T.BufferAttribute(a, it));
    }
    return out;
  }
  // gable roof prism, ridge along X, slopes to +-Z; uv in metres/uvs
  function prism(w, d, h, uvs = 0.7) {
    const v = [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2], [-w / 2, h, 0], [w / 2, h, 0]];
    const tr = [[3, 2, 5], [3, 5, 4], [1, 0, 4], [1, 4, 5], [0, 3, 4], [2, 1, 5], [0, 1, 2], [0, 2, 3]];
    const sl = Math.sqrt(h * h + d * d / 4), pos = [], uv = [];
    tr.forEach((t, i) => t.forEach(k => {
      const p = v[k]; pos.push(p[0], p[1], p[2]);
      if (i < 4) uv.push(p[0] / uvs, (p[1] / h) * sl / uvs); else uv.push(p[2] / uvs, p[1] / uvs);
    }));
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals(); return g;
  }
  function roof(p, w, d, h, m, x, y, z, alongZ) {
    const g = prism(alongZ ? d : w, alongZ ? w : d, h); if (alongZ) g.rotateY(PI / 2);
    return G(g, m, p, x, y, z);
  }
  // extruded side profile [[z,y],...] with width w along X
  function extrudeProfile(pr, w, bev = 0) {
    const s = new T.Shape(); pr.forEach((q, i) => i ? s.lineTo(q[0], q[1]) : s.moveTo(q[0], q[1]));
    const dep = Math.max(0.01, w - 2 * bev);
    const g = new T.ExtrudeGeometry(s, { depth: dep, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -dep / 2); g.rotateY(-PI / 2); return g;
  }
  // texture helpers
  function tex(w, h, fn) { return C.signTexture(w, h, fn); }
  function signMat(t, em = 0) {
    return new T.MeshToonMaterial({ map: t, gradientMap: C.gradient, side: T.DoubleSide, emissive: em ? 0xffffff : 0x000000, emissiveMap: em ? t : null, emissiveIntensity: em });
  }

  // =====================================================================================
  // FERRIS WHEEL
  // =====================================================================================
  C.makeFerrisWheel = function () {
    const g = new T.Group(); C.dynamic(g);
    const white = M(0xf3f0e8), pastel = M(0x8fd3d9), pink = M(0xf2a7b8), grey = M(0xb9bfc9);
    const HUB = 19, R = 16, N = 24;
    for (const s of [-1, 1]) {
      const top = V(0, HUB - 0.6, s * 1.9);
      for (const x of [-1, 1]) { rod(g, top, V(x * 9.5, 0.1, s * 4.3), 0.3, white, 6); B(g, 1.3, 0.5, 1.3, M(0x9aa0a8), x * 9.5, 0.25, s * 4.3); }
      for (const y of [5, 11]) { const k = (HUB - 0.6 - y) / (HUB - 0.7); rod(g, V(-9.5 * k, y, s * (1.9 + 2.4 * k)), V(9.5 * k, y, s * (1.9 + 2.4 * k)), 0.1, grey, 5); }
    }
    for (const x of [-1, 1]) rod(g, V(x * 9.5 * 0.55, 8, 1.9 + 2.4 * 0.55), V(x * 9.5 * 0.55, 8, -1.9 - 2.4 * 0.55), 0.1, grey, 5);
    cylZ(g, 0.7, 4.6, pastel, 0, HUB, 0, 12);
    const W = new T.Group(); W.position.set(0, HUB, 0); g.add(W);
    const hub = cylZ(W, 1.3, 2.8, white, 0, 0, 0, 14); C.outline(hub, 0.06);
    cylZ(W, 0.55, 3.2, pink, 0, 0, 0, 10);
    for (const z of [-1.1, 1.1]) {
      for (const rr of [R, R * 0.55]) { const t = G(new T.TorusGeometry(rr, rr === R ? 0.2 : 0.11, 6, 56), rr === R ? white : pastel, W, 0, 0, z); }
    }
    // spokes (instanced): 16 per side + lacing struts between the two rims
    const NS = 16, sp = new T.InstancedMesh(new T.BoxGeometry(0.15, 1, 0.15), grey, NS * 2), m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3();
    let k = 0;
    for (const z of [-1.1, 1.1]) for (let i = 0; i < NS; i++) {
      const a = i / NS * PI * 2; q.setFromAxisAngle(FWD, a); sc.set(1, R, 1);
      ps.set(-Math.sin(a) * R / 2, Math.cos(a) * R / 2, z); sp.setMatrixAt(k++, m4.compose(ps, q, sc));
    }
    sp.castShadow = true; W.add(sp);
    const lace = new T.InstancedMesh(new T.BoxGeometry(0.12, 0.12, 2.2), pastel, N);
    const lights = new T.InstancedMesh(new T.SphereGeometry(0.2, 6, 4), glow(0xfff0c0, 1.3), N * 2);
    const hold = new T.Quaternion(); let li = 0;
    for (let i = 0; i < N; i++) {
      const a = i / N * PI * 2; ps.set(Math.cos(a) * R, Math.sin(a) * R, 0); lace.setMatrixAt(i, m4.compose(ps, hold, sc.set(1, 1, 1)));
      for (const z of [-1.1, 1.1]) { const b = a + PI / N; ps.set(Math.cos(b) * (R + 0.25), Math.sin(b) * (R + 0.25), z); lights.setMatrixAt(li++, m4.compose(ps, hold, sc.set(1, 1, 1))); }
    }
    W.add(lace, lights);
    // gondolas (instanced, stay upright)
    const cols = [0xf06a6a, 0xf7b955, 0xf5e26b, 0x7ccf8a, 0x6cc4e0, 0x8d8be8, 0xf08fc0];
    const body = new T.InstancedMesh(new T.BoxGeometry(1.5, 1.2, 1.6), M(0xffffff), N);
    const cone = new T.BoxGeometry(1.7, 0.18, 1.8);
    const cap = new T.InstancedMesh(cone, M(0xffffff), N);
    const win = new T.InstancedMesh(new T.BoxGeometry(1.52, 0.5, 1.2), glow(0x5a6f86, 0.9, 0xffd890), N);
    const hang = new T.InstancedMesh(new T.BoxGeometry(0.08, 0.6, 0.08), grey, N * 2);
    for (let i = 0; i < N; i++) { const c = new T.Color(cols[i % cols.length]); body.setColorAt(i, c); cap.setColorAt(i, c.clone().multiplyScalar(0.85)); }
    [body, cap, win, hang].forEach(o => { o.castShadow = true; o.frustumCulled = false; g.add(o); });
    const place = (ang) => {
      for (let i = 0; i < N; i++) {
        const a = i / N * PI * 2 + ang, px = Math.cos(a) * R, py = HUB + Math.sin(a) * R;
        body.setMatrixAt(i, m4.compose(ps.set(px, py - 1.2, 0), hold, sc.set(1, 1, 1)));
        win.setMatrixAt(i, m4.compose(ps.set(px, py - 1.15, 0), hold, sc));
        cap.setMatrixAt(i, m4.compose(ps.set(px, py - 0.5, 0), hold, sc));
        hang.setMatrixAt(i * 2, m4.compose(ps.set(px - 0.55, py - 0.28, 0), hold, sc));
        hang.setMatrixAt(i * 2 + 1, m4.compose(ps.set(px + 0.55, py - 0.28, 0), hold, sc));
      }
      [body, cap, win, hang].forEach(o => o.instanceMatrix.needsUpdate = true);
    };
    let ang = 0; place(0);
    // small base building
    const bb = B(g, 7, 3.2, 4.5, M(0xf4e9d4), 0, 1.6, 8.5); C.outline(bb, 0.05);
    roof(g, 8, 5.4, 1.2, roofMat(0x6fa8b4), 0, 3.2, 8.5);
    B(g, 2.4, 1.4, 0.1, M(0x2a3a4a), -1.6, 1.7, 10.77); B(g, 1.1, 2.1, 0.1, M(0xb86f4a), 2, 1.05, 10.77);
    const sg = C.signBoard(3.2, 0.7, tex(256, 56, (c, w, h) => { c.fillStyle = '#f3a1b5'; c.fillRect(0, 0, w, h); C.text(c, 'みどりの観覧車', w / 2, h / 2, 34, '#ffffff'); }), 0.3);
    sg.position.set(0, 3.6, 10.8); g.add(sg);
    return {
      group: g, wheel: W, radius: R, hubHeight: HUB,
      update(dt) { ang += dt * PI * 2 / 480; W.rotation.z = ang; place(ang); }
    };
  };

  // =====================================================================================
  // RAILWAY CARS (shared by EMU and D51 coaches)
  // =====================================================================================
  const wheelMat = M(0x222226), darkMat = M(0x2a2a30), railGrey = M(0xa5a8b0);
  function bogie(p, z, w) {
    B(p, 2.0, 0.3, 3.0, darkMat, 0, 0.5, z);
    for (const dz of [-1.0, 1.0]) for (const s of [-1, 1]) cylX(p, 0.43, 0.14, wheelMat, s * 0.6, 0.43, z + dz, 10);
  }
  function makeCoach(o) {
    const car = new T.Group(); const L = o.len, W = o.w || 2.8, hw = W / 2;
    const body = M(o.body), band = M(o.band || o.body), skirt = M(o.skirt || o.body);
    const secs = []; let tot = 0; const pat = o.pat;
    for (const ch of pat) { const w = ch === 'D' ? 1.3 : o.wW; secs.push({ ch, w }); tot += w; }
    tot += (pat.length + 1) * 0.2; let z = -tot / 2; const pil = [], leaves = []; car.userData.leaves = leaves;
    const run = []; let rs = null;
    pil.push(z); z += 0.2;
    for (const s of secs) {
      const c = z + s.w / 2;
      if (s.ch === 'W') { for (const sd of [-1, 1]) B(car, 0.1, 0.9, s.w, skirt, sd * (hw - 0.05), 1.35, c); if (rs === null) rs = z; }
      else {
        if (rs !== null) { run.push([rs, z]); rs = null; }
        for (const sd of [-1, 1]) {
          B(car, 0.02, 2.0, s.w, darkMat, sd * (hw - 0.1), 1.9, c);
          for (const lf of [-1, 1]) { const m = B(car, 0.06, 1.95, s.w / 2 - 0.02, M(o.door || 0xdcd9cf), sd * (hw - 0.02), 1.93, c + lf * s.w / 4); m.userData = { z0: c + lf * s.w / 4, dir: lf, s: s.w / 2 - 0.05 }; leaves.push(m); }
        }
      }
      z += s.w; pil.push(z); z += 0.2;
    }
    if (rs !== null) run.push([rs, z - 0.2]);
    for (const pz of pil) for (const sd of [-1, 1]) B(car, 0.12, 1.1, 0.2, body, sd * (hw - 0.06), 2.35, pz + 0.1);
    for (const sd of [-1, 1]) {
      B(car, 0.1, 0.45, L, band, sd * (hw - 0.05), 3.05, 0);
      B(car, 0.04, 1.1, L - 0.3, glass(), sd * (hw - 0.12), 2.35, 0);
      B(car, 0.11, 0.1, L, M(o.stripe || o.band || o.body), sd * (hw - 0.05), 1.83, 0);
    }
    const rf = B(car, W - 0.2, 0.2, L, M(o.roof || 0xc2c5ca), 0, 3.38, 0); C.outline(rf, 0.04);
    B(car, W - 1.0, 0.14, L - 0.6, M(o.roof || 0xc2c5ca), 0, 3.52, 0);
    // interior
    B(car, W - 0.2, 0.1, L - 0.2, M(0x7c6a58), 0, 0.95, 0);
    B(car, W - 0.2, 0.05, L - 0.4, glow(0xfff1cf, 1, 0xfff1cf), 0, 3.26, 0);
    const seat = M(o.seat || 0x3c78a8);
    for (const r of run) for (const sd of [-1, 1]) {
      const len = r[1] - r[0] - 0.1, c = (r[0] + r[1]) / 2;
      B(car, 0.5, 0.45, len, darkMat, sd * (hw - 0.45), 1.2, c); B(car, 0.55, 0.12, len, seat, sd * (hw - 0.45), 1.5, c); B(car, 0.1, 0.55, len, seat, sd * (hw - 0.22), 1.85, c);
    }
    for (const e of [-1, 1]) {
      const front = (e > 0 && o.front) || (e < 0 && o.rear);
      B(car, W - 0.1, 2.5, 0.1, front ? body : lit(0xf2e3bf, 0xffd890, 0.7), 0, 2.15, e * (L / 2 - 0.05));
      if (front) {
        B(car, W - 0.8, 1.0, 0.05, M(0x1d2630), 0, 2.45, e * (L / 2 + 0.01));
        B(car, 1.2, 0.28, 0.05, M(0xf6dc7a), 0, 3.1, e * (L / 2 + 0.01));
        for (const s of [-1, 1]) { cylZ(car, 0.13, 0.06, glow(0xffffff, 1.4, 0xfff4c8), s * 0.95, 1.5, e * (L / 2 + 0.02)); cylZ(car, 0.08, 0.05, glow(0xc83030, 1, 0xff4040), s * 0.6, 1.5, e * (L / 2 + 0.02)); }
      }
    }
    B(car, W - 0.5, 0.4, L - 1, darkMat, 0, 0.7, 0);
    for (const bz of [-L / 2 + 3.2, L / 2 - 3.2]) bogie(car, bz);
    if (o.pantograph) {
      const pm = M(0x33343a);
      for (const s of [-1, 1]) B(car, 0.1, 0.3, 0.1, pm, s * 0.5, 3.72, 0);
      rod(car, V(-0.5, 3.8, -0.9), V(-0.5, 4.6, 0.1), 0.04, pm, 4); rod(car, V(0.5, 3.8, -0.9), V(0.5, 4.6, 0.1), 0.04, pm, 4);
      rod(car, V(-0.5, 4.6, 0.1), V(-0.5, 3.8, 1.0), 0.04, pm, 4); rod(car, V(0.5, 4.6, 0.1), V(0.5, 3.8, 1.0), 0.04, pm, 4);
      B(car, 1.8, 0.05, 0.12, pm, 0, 4.62, 0.1);
      B(car, 1.0, 0.3, 1.6, M(0xbfc3c8), 0, 3.75, -4.5);
    }
    return car;
  }
  function trainSetters(cars) {
    return (open) => cars.forEach(c => (c.userData.leaves || []).forEach(m => { m.position.z = m.userData.z0 + m.userData.dir * open * m.userData.s; }));
  }

  C.makeEMU = function (opts = {}) {
    const n = opts.cars || 2, CL = 18, SP = 18.6, g = new T.Group(); C.dynamic(g);
    const cars = [], offsets = [];
    for (let i = 0; i < n; i++) {
      const c = makeCoach({ len: CL, w: 2.8, pat: 'WWDWWDWWDWW', wW: 1.4, body: 0xe8742a, band: 0xf6dc7a, skirt: 0xe8742a, stripe: 0xf6dc7a, seat: 0x5a8f6a,
        front: i === 0, rear: i === n - 1, pantograph: i % 2 === 1 || n === 1 });
      c.position.z = (n - 1) / 2 * SP - i * SP; offsets.push(c.position.z); g.add(c); cars.push(c);
    }
    const head = cars[0];
    return { group: g, cars, offsets, carLength: CL, carSpacing: SP, length: n * CL + (n - 1) * 0.6, setDoors: trainSetters(cars) };
  };

  // =====================================================================================
  // D51 STEAM LOCOMOTIVE + COACHES
  // =====================================================================================
  let puffTex = null;
  function makeLoco() {
    const L = new T.Group(), blk = M(0x1c1c20), gry = M(0x3a3a42), rod_ = M(0xa8a8b0), hub = M(0x8a8a90);
    B(L, 2.3, 0.5, 11.2, blk, 0, 1.1, 0.2);
    const boiler = cylZ(L, 1.05, 7.4, blk, 0, 2.6, 1.0, 14); C.outline(boiler, 0.06);
    cylZ(L, 1.12, 1.8, gry, 0, 2.6, 4.7, 14);
    for (const z of [-1.6, 0.4, 2.4]) cylZ(L, 1.09, 0.12, M(0x55555c), 0, 2.6, z, 14);
    cylZ(L, 0.92, 0.1, M(0x2b2b30), 0, 2.6, 5.62, 14);
    const np = C.signBoard(0.7, 0.3, tex(128, 56, (c, w, h) => { c.fillStyle = '#7a1f1a'; c.fillRect(0, 0, w, h); C.text(c, 'D51 498', w / 2, h / 2, 30, '#f4e6b0'); })); np.position.set(0, 2.6, 5.7); L.add(np);
    cylZ(L, 0.28, 0.2, glow(0xfff0c0, 1.5), 0, 3.65, 5.5);
    const ch = cylY(L, 0.34, 0.22, 0.9, blk, 0, 3.95, 4.8, 10); cylY(L, 0.4, 0.34, 0.1, gry, 0, 4.42, 4.8, 10);
    cylY(L, 0.5, 0.5, 0.45, blk, 0, 3.85, 2.3, 10); cylY(L, 0.5, 0.5, 0.5, blk, 0, 3.9, 0.3, 10);
    cylZ(L, 0.3, 1.0, gry, 0, 3.6, 3.4, 8);
    for (const s of [-1, 1]) {
      B(L, 0.4, 0.08, 8.4, blk, s * 1.25, 2.0, 1.0); B(L, 0.35, 0.5, 0.7, gry, s * 1.2, 2.35, 3.2); cylZ(L, 0.32, 1.0, blk, s * 1.0, 1.0, 3.5, 8);
      rod(L, V(s * 1.05, 2.7, 4.8), V(s * 1.05, 2.7, 2.4), 0.03, rod_, 4);
      // wheels: 4 drivers, pony truck, trailing
      for (const z of [-2.4, -0.55, 1.3, 3.15]) { cylX(L, 0.7, 0.1, blk, s * 0.62, 0.7, z, 14); cylX(L, 0.22, 0.13, hub, s * 0.62, 0.7, z, 8); }
      cylX(L, 0.4, 0.08, blk, s * 0.62, 0.4, 5.0, 10); cylX(L, 0.5, 0.08, blk, s * 0.62, 0.5, -4.6, 10);
      B(L, 0.07, 0.12, 5.6, rod_, s * 0.74, 0.8, 0.4);
    }
    // cab
    const cabZ = -4.4;
    for (const s of [-1, 1]) { B(L, 0.1, 1.0, 2.6, blk, s * 1.4, 1.9, cabZ); B(L, 0.08, 1.0, 1.8, glass(0x3a4a58, 0.5), s * 1.4, 2.9, cabZ); for (const dz of [-1.3, 1.3]) B(L, 0.12, 1.0, 0.1, blk, s * 1.4, 2.9, cabZ + dz); }
    B(L, 3.0, 0.15, 3.0, gry, 0, 3.95, cabZ); B(L, 2.7, 0.1, 2.6, blk, 0, 1.4, cabZ);
    B(L, 2.8, 2.4, 0.12, blk, 0, 2.6, -3.1);
    B(L, 0.7, 0.5, 0.1, glow(0xff7a30, 1, 0xff7a30), 0, 1.9, -3.03);
    B(L, 2.4, 0.5, 0.6, blk, 0, 0.8, 5.6);
    return L;
  }
  function makeTender() {
    const t = new T.Group(), blk = M(0x1c1c20);
    const b = B(t, 2.8, 1.9, 8.4, blk, 0, 2.0, 0); C.outline(b, 0.05);
    B(t, 3.0, 0.15, 8.6, M(0x2e2e34), 0, 3.0, 0);
    const coal = G(new T.IcosahedronGeometry(1.3, 0), M(0x2a2420), t, 0, 3.3, -1.5); coal.scale.set(1.0, 0.5, 1.9);
    B(t, 2.5, 0.4, 7.8, M(0x2e2e34), 0, 1.0, 0);
    for (const bz of [-2.6, 2.6]) bogie(t, bz);
    return t;
  }
  C.makeD51Train = function (opts = {}) {
    const nc = opts.coaches == null ? 2 : opts.coaches, g = new T.Group(); C.dynamic(g);
    const loco = makeLoco(), tender = makeTender(), cars = [loco, tender], lens = [11.6, 8.6], gap = 0.7;
    for (let i = 0; i < nc; i++) { cars.push(makeCoach({ len: 17, w: 2.9, pat: 'DWWWWWWWWD', wW: 1.6, body: 0xefe9d6, band: 0xefe9d6, skirt: 0x2f5d8a, stripe: 0xc0392b, roof: 0x8d9299, seat: 0x3c78a8, door: 0xbfc8cf })); lens.push(17); }
    const total = lens.reduce((a, b) => a + b, 0) + gap * (cars.length - 1), offsets = []; let zz = total / 2;
    cars.forEach((c, i) => { c.position.z = zz - lens[i] / 2; offsets.push(c.position.z); zz -= lens[i] + gap; g.add(c); });
    // steam puffs live in the parent space so they trail behind a moving train
    if (!puffTex) puffTex = tex(64, 64, (c, w, h) => { const r = c.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.6, 'rgba(250,250,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, w, h); });
    const sg = new T.Group(); C.dynamic(sg); const puffs = [];
    for (let i = 0; i < 22; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; sg.add(s); puffs.push({ s, age: 99, life: 3, v: V(0, 0, 0) }); }
    let on = true, acc = 0; const tmp = V(0, 0, 0);
    const o = {
      group: g, cars, offsets, carLength: 17, carLengths: lens, carSpacing: lens.map((l, i) => i < lens.length - 1 ? (l + lens[i + 1]) / 2 + gap : 0), length: total, steamGroup: sg,
      setDoors: trainSetters(cars), steam(v) { on = !!v; },
      update(dt) {
        if (g.parent && sg.parent !== g.parent) g.parent.add(sg);
        acc += dt;
        if (on && acc > 0.16) {
          acc = 0; const p = puffs.find(q => q.age >= q.life);
          if (p) { tmp.set(0, 4.7, 4.8); loco.localToWorld(tmp); if (g.parent) g.parent.worldToLocal(tmp); p.s.position.copy(tmp); p.age = 0; p.life = 2.8 + Math.random(); p.v.set((Math.random() - 0.5) * 0.5, 1.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5); p.s.visible = true; }
        }
        for (const p of puffs) {
          if (p.age >= p.life) { p.s.visible = false; continue; }
          p.age += dt; const k = p.age / p.life; p.s.position.addScaledVector(p.v, dt);
          p.s.scale.setScalar(1.0 + k * 3.2); p.s.material.opacity = (1 - k) * 0.55 * Math.min(1, p.age * 4);
        }
      }
    };
    return o;
  };

  // =====================================================================================
  // CARS
  // =====================================================================================
  function makeCar(o) {
    const g = new T.Group(), bm = M(o.color), gm = M(0x24303c);
    const body = G(extrudeProfile(o.body, o.w, 0.1), bm, g); body.castShadow = true; C.outline(body, 0.035);
    G(extrudeProfile(o.cabin, o.w - 0.2, 0.0), bm, g);
    G(extrudeProfile(o.glass, o.w - 0.14, 0.0), gm, g);
    for (const z of o.wz) for (const s of [-1, 1]) { cylX(g, 0.32, 0.22, M(0x1d1d20), s * (o.w / 2 - 0.05), 0.32, z, 12); cylX(g, 0.17, 0.24, M(0xc9ccd2), s * (o.w / 2 - 0.05), 0.32, z, 8); }
    const fz = o.body[0][0], rz = o.body[o.body.length - 1][0];
    for (const s of [-1, 1]) { sph(g, 0.14, glow(0xffffff, 1.5, 0xfff4c8), s * 0.55, 0.68, fz - 0.07, 1, 1, 0.5); B(g, 0.22, 0.12, 0.05, glow(0xc83030, 1.2, 0xff3030), s * 0.6, 0.66, rz + 0.01); }
    B(g, o.w - 0.1, 0.12, 0.2, M(0xc9ccd2), 0, 0.42, fz); B(g, o.w - 0.1, 0.12, 0.2, M(0xc9ccd2), 0, 0.42, rz);
    B(g, 0.5, 0.14, 0.04, M(0xf4f4ee), 0, 0.5, rz - 0.02);
    return g;
  }
  C.makePorsche911 = function () {
    const g = makeCar({ color: 0xc8261e, w: 1.64, wz: [1.3, -1.3],
      body: [[2.1, 0.3], [2.12, 0.5], [1.95, 0.72], [1.4, 0.8], [0.75, 0.86], [-0.4, 0.9], [-1.4, 0.85], [-1.95, 0.65], [-2.1, 0.45], [-2.08, 0.3]],
      cabin: [[0.78, 0.86], [0.3, 1.26], [-0.55, 1.3], [-1.3, 1.0], [-1.5, 0.84]],
      glass: [[0.7, 0.9], [0.3, 1.2], [-0.55, 1.24], [-1.2, 1.0], [-1.3, 0.9]] });
    return { group: g, length: 4.2, width: 1.64 };
  };
  C.makeToyota = function () {
    const g = makeCar({ color: 0xf2f2ee, w: 1.62, wz: [1.25, -1.25],
      body: [[2.05, 0.28], [2.08, 0.55], [1.9, 0.72], [1.2, 0.78], [0.7, 0.82], [-1.2, 0.82], [-1.95, 0.78], [-2.05, 0.6], [-2.05, 0.28]],
      cabin: [[0.75, 0.82], [0.3, 1.32], [-0.8, 1.32], [-1.35, 0.82]],
      glass: [[0.68, 0.86], [0.3, 1.24], [-0.8, 1.24], [-1.25, 0.86]] });
    return { group: g, length: 4.1, width: 1.62 };
  };

  // =====================================================================================
  // BOTCHAN LOCOMOTIVE (Iyo Railway No.1)
  // =====================================================================================
  C.makeBotchanLoco = function () {
    const g = new T.Group(), green = M(0x2e6b46), blk = M(0x1d1d1f), brass = M(0xc8a24a), wood = M(0x8a6040);
    const L = new T.Group(); g.add(L); L.position.y = 0.45;
    B(L, 1.7, 0.3, 4.2, blk, 0, 0.35, 0);
    const bo = cylZ(L, 0.62, 2.6, green, 0, 1.35, 0.8, 12); C.outline(bo, 0.04);
    for (const z of [0.0, 1.0, 2.0]) cylZ(L, 0.64, 0.08, brass, 0, 1.35, z, 12);
    cylZ(L, 0.62, 0.1, blk, 0, 1.35, 2.15, 12);
    const ch = cylY(L, 0.34, 0.14, 1.1, blk, 0, 2.55, 2.0, 10); void ch;
    sph(L, 0.2, brass, 0, 2.1, 0.9, 1, 1.2, 1); cylY(L, 0.14, 0.14, 0.3, brass, 0, 2.2, 0.2, 8);
    for (const s of [-1, 1]) { B(L, 0.12, 1.0, 2.0, green, s * 0.82, 0.95, 1.0); cylZ(L, 0.15, 1.2, blk, s * 0.65, 0.7, 1.6, 8); }
    B(L, 1.8, 1.8, 0.1, green, 0, 1.4, -1.0);
    for (const s of [-1, 1]) for (const z of [-1.0, 0.0]) B(L, 0.1, 1.6, 0.1, wood, s * 0.88, 1.4, z - 0.45 + 0.5 * 0);
    B(L, 2.0, 0.12, 2.0, wood, 0, 2.3, -1.1);
    B(L, 0.28, 0.28, 0.1, glow(0xfff0c0, 1.2), 0, 1.9, 2.2);
    for (const s of [-1, 1]) for (const z of [-1.4, 0.2, 1.8]) { cylX(L, 0.45, 0.1, M(0x8f2a24), s * 0.7, 0.0, z, 12); }
    B(L, 1.6, 0.3, 0.3, blk, 0, 0.2, 2.2);
    // display track + shelter
    for (const s of [-1, 1]) B(g, 0.08, 0.12, 9, railGrey, s * 0.53, 0.06, 0);
    for (let i = -4; i <= 4; i++) B(g, 1.7, 0.1, 0.18, M(0x5a4636), 0, 0.02, i);
    B(g, 3.4, 0.08, 10.4, M(0xb8b1a2), 0, -0.02, 0);
    const sh = new T.Group(); g.add(sh);
    for (const x of [-2.2, 2.2]) for (const z of [-3.2, 3.2]) B(sh, 0.18, 3.4, 0.18, wood, x, 1.7, z);
    roof(sh, 5.4, 8.2, 1.0, roofMat(0x5c6a74), 0, 3.4, 0);
    B(sh, 3.0, 0.5, 0.06, M(0xf1ead6), 0, 3.0, 3.3);
    const sb = C.signBoard(2.8, 0.45, tex(256, 40, (c, w, h) => { c.fillStyle = '#f1ead6'; c.fillRect(0, 0, w, h); C.text(c, '坊っちゃん列車', w / 2, h / 2, 30, '#2e3d2f', C.JP_SERIF); }));
    sb.position.set(0, 3.0, 3.35); g.add(sb);
    return { group: g, loco: L };
  };

  // =====================================================================================
  // HILL TRAM (funicular car for a 35 degree incline). Rises toward +Z; origin = rail-head at car centre.
  // =====================================================================================
  C.makeHillTram = function () {
    const S = 35 * PI / 180, ts = Math.tan(S), cs = Math.cos(S), g = new T.Group(); C.dynamic(g);
    const wood = M(0xb0743c), trim = M(0x6b4429), rf = M(0x4a6b52), seat = M(0x8a5a30);
    const NSTEP = 4, D = 1.25, W = 2.0;
    const ch = new T.Group(); ch.rotation.x = -S; g.add(ch);
    B(ch, W, 0.25, 7.0, trim, 0, 0.25, 0);
    for (const z of [-2.6, 2.6]) for (const s of [-1, 1]) cylX(ch, 0.22, 0.12, wheelMat, s * 0.55, 0.12, z, 8);
    for (let i = 0; i < NSTEP; i++) {
      const zc = (i - (NSTEP - 1) / 2) * D, yf = zc * ts + 0.7, yb = (zc - D / 2) * ts + 0.35;
      B(g, W, 0.12, D, trim, 0, yf, zc);
      const wh = yf + 1.9 - yb;
      for (const s of [-1, 1]) {
        const lo = yf + 0.9 - yb; B(g, 0.08, lo, D, wood, s * (W / 2 - 0.04), yb + lo / 2, zc);
        B(g, 0.06, 0.9, D, glass(0xbfdce8, 0.35), s * (W / 2 - 0.04), yf + 0.9 + 0.45, zc);
        for (const dz of [-D / 2 + 0.05, D / 2 - 0.05]) B(g, 0.1, 1.0, 0.1, trim, s * (W / 2 - 0.04), yf + 1.4, zc + dz);
      }
      const r = B(g, W + 0.2, 0.14, D + 0.1, rf, 0, yf + 1.9, zc); void wh;
      B(g, 1.7, 0.1, 0.5, seat, 0, yf + 0.5, zc + 0.1); B(g, 1.7, 0.45, 0.07, seat, 0, yf + 0.8, zc - 0.2);
      B(g, W - 0.16, yf - (yb) - 0.12, 0.1, trim, 0, (yf + yb) / 2 - 0.05, zc - D / 2 + 0.03);   // riser under the step
      B(g, W - 0.2, 0.9, 0.05, glass(0xbfdce8, 0.3), 0, yf + 1.45, zc + D / 2 - 0.02);
    }
    const tc = (NSTEP - 1) / 2 * D + D / 2;
    B(g, W, 2.4, 0.1, wood, 0, (tc * ts + 0.7) + 1.1, tc);
    B(g, 1.2, 0.3, 0.05, M(0xf1ead6), 0, (tc * ts + 0.7) + 2.0, tc + 0.08);
    C.outline(g.children[0].isGroup ? g.children[1] : g.children[0], 0.03);
    return { group: g, slope: S, length: 6.4, width: W };
  };

  C.makeInclineTrack = function (p0, p1, opts = {}) {
    const g = new T.Group(), gauge = opts.gauge || 1.1, dir = p1.clone().sub(p0), len = dir.length(), q = frameQ(p0, p1), side = V(1, 0, 0).applyQuaternion(q);
    const gf = opts.groundFn || ((x, z) => Math.min(p0.y, p1.y) - 1);
    const rail = M(0x7c7f86), tie = M(0x4a3b30), conc = M(0xa8a59b);
    for (const s of [-1, 1]) { const m = B(g, 0.1, 0.14, len, rail, 0, 0, 0); m.position.copy(p0).addScaledVector(dir, 0.5).addScaledVector(side, s * gauge / 2); m.quaternion.copy(q); }
    const nt = Math.floor(len / 0.8), ti = new T.InstancedMesh(new T.BoxGeometry(gauge + 0.7, 0.1, 0.2), tie, nt), m4 = new T.Matrix4(), ps = new T.Vector3(), sc = V(1, 1, 1);
    for (let i = 0; i < nt; i++) { ps.copy(p0).addScaledVector(dir, (i + 0.5) / nt).addScaledVector(UP, -0.1); ti.setMatrixAt(i, m4.compose(ps, q, sc)); }
    ti.castShadow = true; ti.frustumCulled = false; g.add(ti);
    for (const s of [-1, 1]) { const m = B(g, 0.3, 0.3, len, conc, 0, 0, 0); m.position.copy(p0).addScaledVector(dir, 0.5).addScaledVector(side, s * gauge / 2).addScaledVector(UP, -0.32); m.quaternion.copy(q); }
    const np = Math.max(2, Math.ceil(len / 3.5));
    for (let i = 0; i <= np; i++) {
      const a = p0.clone().addScaledVector(dir, i / np), gy = gf(a.x, a.z);
      if (a.y - 0.5 - gy < 0.4) continue;
      const h = a.y - 0.5 - gy;
      for (const s of [-1, 1]) { const c = a.clone().addScaledVector(side, s * gauge / 2); B(g, 0.4, h, 0.4, conc, c.x, gy + h / 2, c.z); }
      const m = B(g, gauge + 0.6, 0.25, 0.35, conc, a.x, a.y - 0.45, a.z); m.quaternion.copy(q);
    }
    return g;
  };

  // =====================================================================================
  // SHRINE bits
  // =====================================================================================
  const stone = () => M(0x9b9a92), red = () => M(0xc8372d);
  function torii(p, x, z, s = 1) {
    const t = new T.Group(); p.add(t); t.position.set(x, 0, z); t.scale.setScalar(s);
    for (const sd of [-1, 1]) { cylY(t, 0.16, 0.2, 3.6, red(), sd * 1.4, 1.8, 0, 8); cylY(t, 0.26, 0.26, 0.3, M(0x2a2630), sd * 1.4, 0.15, 0, 8); }
    const k = B(t, 4.3, 0.22, 0.35, M(0x2a2630), 0, 3.85, 0); B(t, 4.0, 0.2, 0.3, red(), 0, 3.65, 0);
    for (const sd of [-1, 1]) { const e = B(t, 0.7, 0.22, 0.35, M(0x2a2630), sd * 2.0, 3.95, 0); e.rotation.z = sd * 0.25; }
    B(t, 3.3, 0.16, 0.2, red(), 0, 2.8, 0); B(t, 0.2, 0.7, 0.2, red(), 0, 3.3, 0); C.outline(k, 0.03);
    return t;
  }
  function toro(p, x, z) {
    const t = new T.Group(); p.add(t); t.position.set(x, 0, z); const s = stone();
    B(t, 0.7, 0.2, 0.7, s, 0, 0.1, 0); cylY(t, 0.12, 0.15, 1.0, s, 0, 0.7, 0, 6); cylY(t, 0.38, 0.3, 0.14, s, 0, 1.27, 0, 6);
    cylY(t, 0.26, 0.26, 0.36, glow(0xf4e6bd, 1.2, 0xffcf80), 0, 1.52, 0, 6);
    const r = cylY(t, 0.02, 0.62, 0.34, s, 0, 1.85, 0, 6); void r; sph(t, 0.07, s, 0, 2.06, 0);
    return t;
  }
  C.makeShrine = function () {
    const g = new T.Group(), s = stone();
    torii(g, 0, 9, 1.15); torii(g, 0, 15, 1.0);
    B(g, 1.8, 0.05, 15, M(0xb3ae9f), 0, 0.02, 4.5);
    for (const z of [3, 6.5]) for (const x of [-2.3, 2.3]) toro(g, x, z);
    for (let i = 0; i < 4; i++) B(g, 2.2, 0.15, 0.5, s, 0, 0.08 + i * 0.15, -0.8 + (3 - i) * 0.5 + 0.2 * 0);
    B(g, 3.4, 0.4, 3.4, s, 0, 0.2, -3);
    const hb = B(g, 2.2, 1.8, 2.2, M(0xa5663a), 0, 1.3, -3); C.outline(hb, 0.04);
    B(g, 0.9, 1.5, 0.06, M(0x6b4429), 0, 1.2, -1.85); for (const sd of [-1, 1]) B(g, 0.12, 1.9, 0.12, red(), sd * 1.1, 1.3, -1.9);
    const cone = new T.ConeGeometry(2.45, 1.4, 4); cone.rotateY(PI / 4);
    const rf = G(cone, M(0x6aaa94), g, 0, 3.15, -3); C.outline(rf, 0.04);
    B(g, 2.8, 0.14, 2.8, M(0x4f8a76), 0, 2.28, -3);
    for (const sd of [-1, 1]) { const c = B(g, 1.2, 0.06, 0.06, M(0x4f8a76), 0, 3.95, -3); c.rotation.y = sd * PI / 4 + PI / 4 * 0; c.rotation.z = sd * 0.3; }
    B(g, 1.4, 0.5, 0.7, M(0x6b4429), 0, 0.65, -1.2);
    cylY(g, 0.03, 0.03, 1.6, M(0xd7c28a), 0.9, 1.9, -1.7, 5); sph(g, 0.12, M(0xd8b04a), 0.9, 1.1, -1.7);
    // shimenawa
    const cu = new T.CatmullRomCurve3([V(-1.4, 3.2, 9), V(-0.7, 2.95, 9), V(0, 2.9, 9), V(0.7, 2.95, 9), V(1.4, 3.2, 9)]);
    G(new T.TubeGeometry(cu, 12, 0.09, 5), M(0xd7c28a), g);
    for (const x of [-0.8, 0, 0.8]) { B(g, 0.14, 0.4, 0.02, M(0xf4f2ea), x, 2.65, 9); }
    return { group: g };
  };

  // =====================================================================================
  // MINE SHRINE (hall + sealed adit + koinobori), CERAMIC DOLLS, JIZO, MINE RAILS
  // =====================================================================================
  function carpGeo() {
    const b = new T.CylinderGeometry(0.1, 0.03, 0.42, 8, 1, true); b.rotateZ(-PI / 2); b.translate(0.0, 0, 0);
    const t = new T.ConeGeometry(0.07, 0.14, 4); t.rotateZ(-PI / 2); t.scale(1, 1, 0.3); t.translate(0.28, 0, 0);
    const e = []; for (const s of [-1, 1]) { const q = new T.SphereGeometry(0.018, 4, 3); q.translate(-0.1, 0.03, s * 0.065); e.push(q); }
    const out = mergeG([b, t, ...e]); return out;
  }
  let carpG = null;
  const carpCols = [0x1d1d22, 0xd9353a, 0x3a86d1, 0x4cae6a, 0xf08fb0, 0xf3a93d, 0x7a6ad0];
  C.makeMineShrine = function () {
    const g = new T.Group(), wood = M(0x7c5a3c), dk = M(0x4a3a2c);
    B(g, 6.6, 0.5, 5.2, M(0x8a867a), 0, 0.25, 0);
    B(g, 6.2, 0.08, 4.8, M(0x9a7a52), 0, 0.54, 0);
    for (const x of [-2.9, -1, 1, 2.9]) B(g, 0.22, 2.7, 0.22, wood, x, 1.9, 2.1);
    for (const x of [-2.9, 0, 2.9]) B(g, 0.22, 2.7, 0.22, wood, x, 1.9, -2.1);
    B(g, 6.4, 0.2, 0.25, dk, 0, 3.1, 2.1); B(g, 6.4, 0.2, 0.25, dk, 0, 3.1, -2.1);
    for (const sd of [-1, 1]) B(g, 0.2, 0.2, 4.4, dk, sd * 2.9, 3.1, 0);
    B(g, 6.0, 0.12, 0.08, dk, 0, 1.2, 2.1); B(g, 0.08, 1.0, 0.08, dk, 0, 0.9, 2.1);
    const hr = roof(g, 7.4, 6.4, 1.9, roofMat(0x4c5159), 0, 3.2, 0.2); C.outline(hr, 0.05);
    B(g, 7.4, 0.2, 0.3, M(0x3a3d44), 0, 5.15, 0.2);
    // rafters along the front eave
    for (let i = 0; i < 15; i++) B(g, 0.07, 0.12, 0.9, dk, -3.4 + i * 0.49, 3.12, 2.65);
    // koinobori on three cords under the eave
    if (!carpG) carpG = carpGeo();
    const ko = [], rr = rng(7); const mats = carpCols.map(c => M(c, { side: T.DoubleSide }));
    [2.15, 2.5, 2.85].forEach((z, row) => {
      B(g, 6.6, 0.025, 0.025, M(0x2a2630), 0, 3.0, z);
      for (let i = 0; i < 12; i++) {
        const c = new T.Group(); c.position.set(-3.0 + i * 0.55 + (row % 2) * 0.2, 2.82 - rr() * 0.15, z);
        const sc = 0.7 + rr() * 0.7; const m = G(carpG, mats[(i + row * 3 + Math.floor(rr() * 3)) % mats.length], c); m.scale.setScalar(sc); m.position.x = 0.15 * sc;
        const st = B(c, 0.01, 0.2, 0.01, M(0x2a2630), 0, 0.1, 0); void st; c.userData.ph = rr() * 6; C.dynamic(c); g.add(c); ko.push(c);
      }
    });
    sph(g, 0.22, glow(0xf8f0dc, 1.2, 0xffcf80), 0, 2.4, 1.5, 1, 1.3, 1);
    // stone wall with arched adit
    const sh = new T.Shape(); sh.moveTo(-5, 0); sh.lineTo(5, 0); sh.lineTo(5, 4.6); sh.lineTo(-5, 4.6); sh.closePath();
    const h = new T.Path(); h.moveTo(-0.95, 0); h.lineTo(-0.95, 1.7); h.absarc(0, 1.7, 0.95, PI, 0, true); h.lineTo(0.95, 0); h.closePath(); sh.holes.push(h);
    const wg = new T.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 10 });
    G(wg, M(0x7d786d), g, 0, 0, -3.8);
    const ar = G(new T.TorusGeometry(1.05, 0.14, 5, 12, PI), M(0xa39e90), g, 0, 1.7, -2.6); void ar;
    B(g, 1.9, 1.7, 0.2, M(0x16151a), 0, 0.85, -3.45); sph(g, 0.95, M(0x16151a), 0, 1.7, -3.45, 1, 1, 0.1, 10);
    const pk = M(0x6a5038);
    for (let y = 0.15; y < 2.6; y += 0.34) { const hh = y - 1.7, w = hh > 0 ? 2 * Math.sqrt(Math.max(0.0, 0.93 * 0.93 - hh * hh)) : 1.86; if (w > 0.2) B(g, w, 0.28, 0.08, pk, 0, y, -2.75 - 0.0); }
    const x1 = B(g, 0.12, 3.0, 0.06, M(0x57402b), 0, 1.3, -2.68); x1.rotation.z = 0.5; const x2 = B(g, 0.12, 3.0, 0.06, M(0x57402b), 0, 1.3, -2.68); x2.rotation.z = -0.5;
    for (let i = 0; i < 3; i++) B(g, 0.06, 0.3, 0.02, M(0xf4f2ea), -0.3 + i * 0.3, 1.2, -2.62);
    return { group: g, koinobori: ko, adit: V(0, 0, -3.5),
      update(dt, t) { ko.forEach((c, i) => { const w = Math.sin(t * 1.6 + c.userData.ph) * 0.5 + 0.5; c.rotation.y = (w - 0.5) * 0.5; c.rotation.z = -0.1 - w * 0.25; c.rotation.x = Math.sin(t * 2.1 + c.userData.ph) * 0.06; }); } };
  };

  C.makeCeramicDolls = function (n = 40) {
    const g = new T.Group(), rows = n > 20 ? 2 : 1, per = Math.ceil(n / rows), sp = 0.13, r = rng(11);
    const body = new T.InstancedMesh(new T.CylinderGeometry(0.022, 0.045, 0.1, 6), M(0xffffff), n);
    const head = new T.InstancedMesh(new T.SphereGeometry(0.03, 6, 5), M(0xf6f1e8), n);
    const hair = new T.InstancedMesh(new T.SphereGeometry(0.034, 6, 4, 0, PI * 2, 0, PI * 0.55), M(0x1d1d22), n);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = V(1, 1, 1), ps = V(0, 0, 0), cols = [0xc8372d, 0x2d4f9c, 0xc8372d, 0x3a7a9e, 0xd9899a];
    for (let i = 0; i < n; i++) {
      const row = i % rows, col = Math.floor(i / rows), x = (col - (per - 1) / 2) * sp + (r() - 0.5) * 0.02, z = 0.1 - row * 0.12, s = 0.85 + r() * 0.35, y0 = row * 0.28 + 0.03;
      q.setFromAxisAngle(UP, (r() - 0.5) * 0.6); sc.set(s, s, s);
      body.setMatrixAt(i, m4.compose(ps.set(x, y0 + 0.05 * s, z), q, sc)); body.setColorAt(i, new T.Color(cols[i % cols.length]));
      head.setMatrixAt(i, m4.compose(ps.set(x, y0 + 0.13 * s, z), q, sc)); hair.setMatrixAt(i, m4.compose(ps.set(x, y0 + 0.135 * s, z - 0.003), q, sc));
    }
    [body, head, hair].forEach(o => { o.castShadow = true; o.frustumCulled = false; g.add(o); });
    for (let row = 0; row < rows; row++) B(g, per * sp + 0.2, 0.03, 0.3, M(0x8a6a48), 0, row * 0.28, 0.02 - row * 0.12 + 0.04 * 0);
    return { group: g, width: per * sp + 0.2 };
  };

  C.makeOnigiri = function () {
    const g = new T.Group(), c = new T.CylinderGeometry(0.055, 0.055, 0.04, 3); c.rotateY(PI / 6);
    G(c, M(0xf8f6ee), g, 0, 0.02, 0); B(g, 0.07, 0.042, 0.03, M(0x1d2420), 0, 0.02, -0.03);
    return g;
  };
  C.makeJizo = function () {
    const g = new T.Group(), s = M(0x9c9a90);
    B(g, 0.8, 0.22, 0.8, s, 0, 0.11, 0); B(g, 0.8, 0.12, 0.5, s, 0, 0.06, 0.55);
    cylY(g, 0.2, 0.3, 0.6, s, 0, 0.52, 0, 8); const hd = sph(g, 0.2, s, 0, 1.0, 0, 1, 1.05, 1, 10); C.outline(hd, 0.02);
    cylY(g, 0.28, 0.28, 0.12, M(0xd0392f), 0, 0.84, 0, 10); B(g, 0.26, 0.28, 0.04, M(0xd0392f), 0, 0.7, 0.26);
    const cap = G(new T.SphereGeometry(0.22, 8, 5, 0, PI * 2, 0, PI * 0.5), M(0xd0392f), g, 0, 1.05, 0);
    B(g, 0.05, 0.05, 0.05, s, 0, 0.56, 0.3); void cap;
    const slot = new T.Object3D(); slot.position.set(0, 0.12, 0.6); g.add(slot);
    return { group: g, offeringSlot: slot };
  };

  C.makeMineRails = function (points) {
    const g = new T.Group(), gauge = 0.6, rust = M(0x8a4b2d), tie = M(0x4a3b30), segs = [];
    let nt = 0;
    for (let i = 0; i < points.length - 1; i++) { const a = points[i], b = points[i + 1], len = a.distanceTo(b); segs.push({ a, b, len, n: Math.max(1, Math.floor(len / 0.7)) }); nt += segs[segs.length - 1].n; }
    const ti = new T.InstancedMesh(new T.BoxGeometry(gauge + 0.3, 0.07, 0.12), tie, Math.max(1, nt)), m4 = new T.Matrix4(); let k = 0;
    for (const s of segs) {
      const q = frameQ(s.a, s.b), side = V(1, 0, 0).applyQuaternion(q), d = s.b.clone().sub(s.a);
      for (const sd of [-1, 1]) { const m = B(g, 0.05, 0.08, s.len + 0.02, rust, 0, 0, 0); m.position.copy(s.a).addScaledVector(d, 0.5).addScaledVector(side, sd * gauge / 2).addScaledVector(UP, 0.05); m.quaternion.copy(q); }
      for (let i = 0; i < s.n; i++) ti.setMatrixAt(k++, m4.compose(s.a.clone().addScaledVector(d, (i + 0.5) / s.n), q, V(1, 1, 1)));
    }
    ti.count = k; ti.frustumCulled = false; ti.castShadow = true; g.add(ti);
    return g;
  };

  C.makeCliffRock = function () {
    const g = new T.Group(), rock = M(0x5e5750), dark = M(0x4a443f), r = rng(5);
    const prof = [[-3.0, -0.8], [-3.2, 1.2], [-1.2, 3.2], [1.6, 3.9], [3.2, 2.0], [3.0, -0.8]];
    const sh = new T.Shape(); prof.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
    const eg = new T.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.1, bevelSegments: 1 });
    eg.rotateX(PI / 2); eg.translate(0, 0, 0); // shape y -> z (front), extrude down; top at y=0
    const slab = G(eg, rock, g, 0, 0, 0); slab.position.y = 0.0; eg.computeVertexNormals();
    // eg: after rotateX(+90deg) extrusion points to -y? ensure top at y=0 below
    eg.computeBoundingBox(); const bb = eg.boundingBox; slab.position.y = -bb.max.y;
    for (let i = 0; i < 4; i++) {
      const d = new T.DodecahedronGeometry(1.5 + r(), 0), p = d.attributes.position;
      for (let j = 0; j < p.count; j++) p.setXYZ(j, p.getX(j) * (0.85 + C.noise(j, i) * 0.3), p.getY(j) * (0.85 + C.noise(i, j) * 0.3), p.getZ(j));
      const ng = d; ng.computeVertexNormals();
      const m = G(ng, i % 2 ? dark : rock, g, -2 + i * 1.3, -2.4 - r(), 0.8 + r() * 1.3); m.scale.set(1.2, 1.4, 1.0); m.rotation.y = r() * 3; C.outline(m, 0.04);
    }
    const seat = new T.Object3D(); seat.position.set(0, 0, 3.7); g.add(seat);
    return { group: g, seat };
  };

  // =====================================================================================
  // SAKURA (yaezakura, half in fresh leaf)
  // =====================================================================================
  const PINK = [0xd9608a, 0xe5789b, 0xee8fb0], GREEN = [0x78b04e, 0x8fc25c, 0x9ccc65];
  function canopyGeo(seed, leafy, detail) {
    const r = rng(seed), list = [], col = new T.Color(), c2 = new T.Color();
    const blobs = [[0, 0, 0, 1.9], [1.5, -0.2, 0.5, 1.4], [-1.4, -0.1, 0.6, 1.45], [0.3, 0.2, -1.5, 1.4], [0.2, 1.1, 0.3, 1.4], [-0.2, -0.3, 1.5, 1.3]];
    for (const b of blobs) {
      const g = new T.IcosahedronGeometry(b[3] * (0.9 + r() * 0.2), detail), p = g.attributes.position, cs = new Float32Array(p.count * 3), ox = r() * 50;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = C.noise(x * 1.7 + ox, z * 1.7 + y * 1.3);
        const k = 1 + 0.14 * (n - 0.5); x = x * k + b[0]; y = y * k * 0.85 + b[1]; z = z * k + b[2]; p.setXYZ(i, x, y, z);
        const gr = 1 - C.smooth(leafy - 0.15, leafy + 0.15, C.clamp((C.fbm(x * 0.5 + 5, z * 0.5 + y * 0.45, 2) - 0.25) / 0.5, 0, 1));
        col.setHex(PINK[(i / 3 | 0) % 3 === 0 ? 0 : (Math.floor(n * 3)) % 3]); c2.setHex(GREEN[Math.floor(n * 3) % 3]);
        col.lerp(c2, gr).multiplyScalar(0.88 + 0.16 * C.smooth(-1.5, 2.5, y));
        cs[i * 3] = col.r; cs[i * 3 + 1] = col.g; cs[i * 3 + 2] = col.b;
      }
      g.setAttribute('color', new T.BufferAttribute(cs, 3)); g.computeVertexNormals(); list.push(g);
    }
    return mergeG(list);
  }
  const barkM = () => M(0x5a4636);
  function trunkGeo() {
    const t = new T.CylinderGeometry(0.2, 0.34, 3.2, 7); t.translate(0, 1.6, 0);
    const mk = (a, b, r) => { const d = b.clone().sub(a), l = d.length(), g = new T.CylinderGeometry(r * 0.7, r, l, 5); g.translate(0, l / 2, 0); g.applyQuaternion(new T.Quaternion().setFromUnitVectors(UP, d.normalize())); g.translate(a.x, a.y, a.z); return g; };
    return mergeG([t, mk(V(0, 2.4, 0), V(1.3, 3.6, 0.3), 0.14), mk(V(0, 2.6, 0), V(-1.2, 3.5, -0.4), 0.13)]);
  }
  const sakuraMat = () => M(0xffffff, { vertexColors: true });
  C.makeSakura = function (opts = {}) {
    const size = opts.size == null ? 1 : opts.size, leafy = opts.leafy == null ? 0.5 : opts.leafy, g = new T.Group();
    G(trunkGeo(), barkM(), g);
    const cn = G(canopyGeo(opts.seed || 3, leafy, 2), sakuraMat(), g, 0, 4.2, 0);
    g.scale.setScalar(size); return { group: g, canopy: cn };
  };
  C.makeSakuraInstances = function (points, opts = {}) {
    const size = opts.size == null ? 1 : opts.size, leafy = opts.leafy == null ? 0.5 : opts.leafy, g = new T.Group(), NV = 3, r = rng(opts.seed || 9);
    const cnt = [0, 0, 0]; points.forEach((_, i) => cnt[i % NV]++);
    const tr = new T.InstancedMesh(trunkGeo(), barkM(), points.length), m4 = new T.Matrix4(), q = new T.Quaternion(), ps = V(0, 0, 0), sc = V(1, 1, 1);
    const ms = [];
    for (let v = 0; v < NV; v++) { const m = new T.InstancedMesh(canopyGeo(20 + v * 7, Math.min(1, Math.max(0, leafy + (v - 1) * 0.15)), 1), sakuraMat(), Math.max(1, cnt[v])); m.count = cnt[v]; ms.push(m); }
    const ci = [0, 0, 0];
    points.forEach((p, i) => {
      const s = size * (0.75 + r() * 0.5); q.setFromAxisAngle(UP, r() * 6.28); sc.set(s, s, s); ps.set(p.x, p.y, p.z);
      m4.compose(ps, q, sc); tr.setMatrixAt(i, m4);
      const v = i % NV; m4.compose(ps.set(p.x, p.y + 4.2 * s, p.z), q, sc); ms[v].setMatrixAt(ci[v]++, m4);
    });
    [tr, ...ms].forEach(m => { m.castShadow = true; m.frustumCulled = false; g.add(m); });
    return g;
  };

  // =====================================================================================
  // LANTERN STRING
  // =====================================================================================
  C.makeLanternString = function (points, opts = {}) {
    const g = new T.Group(), sp = opts.spacing || 1.2, sag = opts.sag == null ? 0.05 : opts.sag, pos = [], cab = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], len = a.distanceTo(b), n = Math.max(1, Math.round(len / sp)), sg = len * sag;
      for (let j = 0; j <= 16; j++) { const t = j / 16; cab.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - 4 * t * (1 - t) * sg, a.z + (b.z - a.z) * t); if (j < 16 && j > 0 || j === 0) { } }
      for (let j = 0; j < n; j++) { const t = (j + 0.5) / n; pos.push(V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - 4 * t * (1 - t) * sg - 0.22, a.z + (b.z - a.z) * t)); }
    }
    // cable as line segments (pairs)
    const segs = []; for (let i = 0; i + 3 <= cab.length; i += 3) { if (i + 6 <= cab.length && !((i / 3) % 17 === 16)) segs.push(cab[i], cab[i + 1], cab[i + 2], cab[i + 3], cab[i + 4], cab[i + 5]); }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(segs, 3));
    g.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x2a2630 })));
    const n = pos.length, body = new T.InstancedMesh(new T.SphereGeometry(0.15, 8, 6), glow(0xf8f0dc, 1.3, 0xffc070), n), caps = new T.InstancedMesh(new T.CylinderGeometry(0.1, 0.1, 0.38, 8), M(0x2a2630), n);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = V(1, 1.25, 1), sc2 = V(1, 1, 1);
    pos.forEach((p, i) => { body.setMatrixAt(i, m4.compose(p, q, sc)); caps.setMatrixAt(i, m4.compose(p, q, sc2)); });
    // caps are slightly narrower than the body so the body bulges around them
    caps.geometry.scale(0.9, 1.0, 0.9);
    body.castShadow = false; body.frustumCulled = false; caps.frustumCulled = false; g.add(body);
    const top = new T.InstancedMesh(new T.CylinderGeometry(0.1, 0.1, 0.04, 8), M(0x2a2630), n), bot = new T.InstancedMesh(new T.CylinderGeometry(0.1, 0.1, 0.04, 8), M(0x2a2630), n);
    pos.forEach((p, i) => { top.setMatrixAt(i, m4.compose(V(p.x, p.y + 0.19, p.z), q, sc2)); bot.setMatrixAt(i, m4.compose(V(p.x, p.y - 0.19, p.z), q, sc2)); });
    top.frustumCulled = bot.frustumCulled = false; g.add(top, bot);
    return g;
  };

  // =====================================================================================
  // NOREN
  // =====================================================================================
  C.makeNoren = function (text, opts = {}) {
    const col = opts.color == null ? 0x22335a : opts.color, hex = '#' + col.toString(16).padStart(6, '0'), g = new T.Group();
    const t = tex(256, 128, (c, w, h) => { c.fillStyle = hex; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 0, w, 6); const n = text.length, sz = Math.min(100, 230 / n); C.text(c, text, w / 2, h / 2, sz, '#f4f1e6', C.JP_SERIF); });
    const mat = new T.MeshToonMaterial({ map: t, gradientMap: C.gradient, side: T.DoubleSide });
    const bar = cylX(g, 0.03, 1.8, M(0x6b4429), 0, 0, 0, 6);
    const panels = [];
    for (const [i, x] of [-0.4, 0.4].entries()) {
      const pv = new T.Group(); pv.position.set(x * 1.0, -0.02, 0); g.add(pv);
      const pg = new T.PlaneGeometry(0.78, 0.9), uv = pg.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * 0.5 + i * 0.5);
      const m = new T.Mesh(pg, mat); m.position.y = -0.45; m.castShadow = true; pv.add(m); panels.push(pv);
    }
    C.dynamic(g);
    return { group: g, panels, bar, update(dt, t, env) { const w = opts.wind == null ? 1 : opts.wind; panels.forEach((p, i) => { p.rotation.x = (Math.sin(t * 1.4 + i * 1.7 + g.position.x) * 0.07 + 0.05) * w; }); } };
  };

  // =====================================================================================
  // SHOP FRONTS
  // =====================================================================================
  const SHOPS = {
    tofu: { name: '豆腐', sub: 'とうふ', wall: 0xe6dcc3, board: '#f1ead6', ink: '#2a2630', noren: 0x22335a },
    dye: { name: '染物', sub: '紺屋', wall: 0xdad3bd, board: '#2b3f66', ink: '#f4f1e6', noren: 0x3a4f7a },
    sweets: { name: '和菓子', sub: 'まんじゅう', wall: 0xf0e1c9, board: '#7a3a2a', ink: '#f6e8c8', noren: 0x8a2f3a },
    sake: { name: '酒', sub: '地酒', wall: 0xe0d6bd, board: '#efe6cc', ink: '#2f3d2a', noren: 0x2c4a3a },
    general: { name: 'よろず屋', sub: '雑貨', wall: 0xe4d8bb, board: '#d9c59a', ink: '#3a2a1c', noren: 0x6a3a2a },
  };
  C.makeShopFront = function (kind = 'general') {
    const S = SHOPS[kind] || SHOPS.general, g = new T.Group(), wood = M(0x6a4a34), dk = M(0x2a2118), wallM = M(S.wall), r = rng(kind.length * 31 + 7);
    B(g, 6.1, 0.35, 7.1, M(0x8d887c), 0, 0.17, 0);
    B(g, 6, 2.85, 6.6, wallM, 0, 1.77, -0.2);
    B(g, 3.2, 2.3, 0.1, dk, -1.1, 1.5, 3.14);
    for (const x of [-2.85, -0.9, 0.7, 2.85]) B(g, 0.22, 2.7, 0.3, wood, x, 1.7, 3.3);
    B(g, 6.0, 0.3, 0.3, wood, 0, 2.85, 3.3);
    for (let i = 0; i < 14; i++) B(g, 0.05, 2.2, 0.07, wood, 0.9 + i * 0.14, 1.45, 3.3);
    B(g, 2.0, 0.1, 0.1, wood, 1.8, 2.2, 3.3); B(g, 2.0, 0.1, 0.1, wood, 1.8, 0.7, 3.3);
    for (let i = 0; i < 8; i++) B(g, 0.35 + r() * 0.2, 0.3 + r() * 0.15, 0.3, M([0xd9353a, 0xf3a93d, 0xe8e0c8, 0x4cae6a, 0x6a8fd0][i % 5]), -2.4 + i * 0.4, 0.8 + (i % 3) * 0.55, 2.9);
    B(g, 3.0, 0.06, 0.4, wood, -1.1, 0.6, 3.0); B(g, 3.0, 0.06, 0.4, wood, -1.1, 1.25, 3.0); B(g, 3.0, 0.06, 0.4, wood, -1.1, 1.9, 3.0);
    const sb = B(g, 4.0, 0.7, 0.1, M(0x4a3626), 0.0, 3.15, 3.55);
    const sg = C.signBoard(3.7, 0.55, tex(512, 80, (c, w, h) => { c.fillStyle = S.board; c.fillRect(0, 0, w, h); C.text(c, S.name, w * 0.4, h / 2, 62, S.ink, C.JP_SERIF); C.text(c, S.sub, w * 0.82, h / 2, 34, S.ink, C.JP_SERIF); }));
    sg.position.set(0, 3.15, 3.61); g.add(sg);
    roof(g, 6.6, 2.0, 0.45, roofMat(0x55606b), 0, 3.5, 3.75);
    B(g, 5.5, 2.5, 4.9, M(0xcfc3a6), 0, 4.55, -0.2 + 0.0);
    for (const x of [-1.4, 1.4]) { B(g, 1.7, 1.2, 0.12, dk, x, 4.6, 2.3); for (let i = 0; i < 7; i++) B(g, 0.05, 1.2, 0.06, wood, x - 0.72 + i * 0.24, 4.6, 2.4); B(g, 1.8, 0.1, 0.14, wood, x, 5.25, 2.4); B(g, 1.8, 0.1, 0.14, wood, x, 3.95, 2.4); }
    const rf = roof(g, 7.0, 8.0, 1.9, roofMat(0x4a5560), 0, 5.8, 0); C.outline(rf, 0.05);
    B(g, 7.0, 0.18, 0.32, M(0x2f343b), 0, 7.72, 0);
    const nr = C.makeNoren(S.name, { color: S.noren }); nr.group.position.set(-1.1, 2.7, 3.45); g.add(nr.group);
    const cloths = [];
    if (kind === 'dye') {
      cylX(g, 0.05, 5.4, M(0x6b4429), 0, 4.0, 3.9, 6);
      for (const x of [-2.7, 2.7]) B(g, 0.1, 4.0, 0.1, wood, x, 2.0, 3.9);
      [[-1.8, '#2b4a8c'], [-0.6, '#d9899a'], [0.6, '#3a86a1'], [1.8, '#f1ead6']].forEach(([x, c], i) => {
        const tx = tex(64, 256, (cx, w, h) => { cx.fillStyle = c; cx.fillRect(0, 0, w, h); cx.fillStyle = 'rgba(255,255,255,0.45)'; for (let y = 20; y < h; y += 34) { cx.beginPath(); cx.arc(w / 2, y, 8, 0, 6.3); cx.fill(); } cx.fillStyle = 'rgba(0,0,0,0.15)'; cx.fillRect(0, h - 14, w, 14); });
        const pv = new T.Group(); pv.position.set(x, 4.0, 3.9); const m = new T.Mesh(new T.PlaneGeometry(0.8, 3.0), signMat(tx)); m.position.y = -1.5; pv.add(m); C.dynamic(pv); g.add(pv); cloths.push(pv);
      });
    } else if (kind === 'tofu') {
      B(g, 1.3, 0.7, 0.9, wood, -1.6, 0.7, 4.3); B(g, 1.2, 0.04, 0.8, M(0xa9d4e6), -1.6, 1.06, 4.3);
      for (let i = 0; i < 4; i++) B(g, 0.28, 0.12, 0.28, M(0xf6f3e6), -1.95 + i * 0.35, 1.12, 4.3);
    } else if (kind === 'sweets') {
      const cs = B(g, 2.0, 0.9, 0.7, glass(0xc8e0ea, 0.35), -1.6, 1.2, 4.1);
      B(g, 2.0, 0.4, 0.7, wood, -1.6, 0.45, 4.1); void cs;
      for (let i = 0; i < 7; i++) sph(g, 0.1, M([0xf2a7b8, 0xf6f3e6, 0x9ccc65, 0xf5d36b][i % 4]), -2.4 + i * 0.27, 1.0 + (i % 2) * 0.15, 4.1);
    } else if (kind === 'sake') {
      for (const [x, z] of [[-2.2, 4.3], [-1.5, 4.3], [-1.85, 4.4]]) { const b = cylY(g, 0.38, 0.34, 0.8, M(0x8a5a30), x, 0.75, z + (x === -1.85 ? 0.5 : 0), 10); C.outline(b, 0.02); cylY(g, 0.39, 0.39, 0.06, M(0x2a2630), x, 0.7, z + (x === -1.85 ? 0.5 : 0), 10); }
      sph(g, 0.4, M(0x6f8f3a), 2.9, 3.3, 3.7, 1, 1, 1, 8); cylY(g, 0.02, 0.02, 0.4, M(0x6b4429), 2.9, 3.75, 3.7, 4);
    } else {
      for (let i = 0; i < 3; i++) B(g, 0.8, 0.5, 0.6, M(0x9a7a52), -2.3 + i * 0.9, 0.6 + (i % 2) * 0.5, 4.1);
      cylY(g, 0.28, 0.22, 0.4, M(0xd9353a), 2.3, 0.55, 4.0, 8); B(g, 0.4, 0.4, 0.4, wood, 1.5, 0.55, 4.0);
    }
    return { group: g, noren: nr, cloths, update(dt, t, env) { nr.update(dt, t, env); cloths.forEach((c, i) => { c.rotation.x = Math.sin(t * 1.2 + i * 1.3) * 0.06; }); } };
  };

  // =====================================================================================
  // VENDING MACHINE, PHONE BOOTH, TOWN HOUSE
  // =====================================================================================
  C.makeVending = function (color = 0xd9353a) {
    const g = new T.Group();
    const t = C.signTexture ? (cacheG.vendTex || (cacheG.vendTex = tex(128, 192, (c, w, h) => { c.fillStyle = '#f4f4ee'; c.fillRect(0, 0, w, h); const cs = ['#d9353a', '#3a86d1', '#4cae6a', '#f3a93d', '#8a5a30', '#f6f3e6']; for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { c.fillStyle = cs[(x + y * 2) % cs.length]; c.fillRect(8 + x * 19, 10 + y * 30, 14, 22); } c.fillStyle = '#222'; c.fillRect(0, 138, w, 54); }))) : null;
    const b = B(g, 0.85, 1.85, 0.75, M(color), 0, 0.93, 0); C.outline(b, 0.025);
    const fm = cacheG.vendFront || (cacheG.vendFront = new T.MeshToonMaterial({ map: t, gradientMap: C.gradient, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.1 }));
    if (!cacheG.vendReg) { cacheG.vendReg = 1; C.nightGlow(fm, 0.9); }
    const f = new T.Mesh(new T.PlaneGeometry(0.62, 1.0), fm); f.position.set(-0.08, 1.15, 0.38); g.add(f);
    B(g, 0.2, 0.9, 0.04, M(0x2a2a30), 0.27, 1.2, 0.38); B(g, 0.5, 0.22, 0.04, M(0x1a1a1e), -0.05, 0.3, 0.38);
    B(g, 0.85, 0.12, 0.76, glow(0xffffff, 1, 0xfff4d0), 0, 1.78, 0);
    return { group: g };
  };
  C.makePhoneBooth = function () {
    const g = new T.Group(), gr = M(0x3a8a56), wood = M(0x6b4429);
    for (const x of [-0.5, 0.5]) B(g, 0.08, 1.9, 0.08, wood, x, 0.95, -0.35);
    B(g, 1.3, 0.1, 1.0, M(0x4a5560), 0, 1.95, -0.1); roof(g, 1.5, 1.2, 0.35, roofMat(0x55606b), 0, 1.98, -0.1);
    B(g, 0.5, 0.9, 0.4, M(0x6a6a70), 0, 0.45, -0.1);
    const box = B(g, 0.46, 0.5, 0.3, gr, 0, 1.15, -0.05); C.outline(box, 0.02);
    B(g, 0.3, 0.12, 0.04, M(0xf3c94a), 0, 1.3, 0.12); B(g, 0.18, 0.1, 0.04, M(0x222222), 0, 1.02, 0.12);
    const rc = new T.Object3D(); rc.position.set(-0.27, 1.15, 0.0); g.add(rc);
    B(rc, 0.07, 0.3, 0.08, gr, 0, 0, 0); sph(rc, 0.06, gr, 0, 0.14, 0); sph(rc, 0.06, gr, 0, -0.14, 0);
    return { group: g, receiver: rc };
  };
  const WALLS = [0xece6d8, 0xd8cdb4, 0xe3d9c2, 0xf1efe9, 0xcfc6b4, 0xc9cfd2, 0xe6dccb, 0xd2c4a6], ROOFS = [0x56606b, 0x5b4f4a, 0x4a5d73, 0x3f454e, 0x7a4f40];
  const unitQuad = new T.PlaneGeometry(1, 1);
  // house windows: one textured quad each (frame + two panes), pulled toward the camera with polygonOffset so they never z-fight
  let HW = null;
  function houseWinMats() {
    if (HW) return HW;
    const tex = C.signTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#d7dad8'; g.fillRect(0, 0, w, h);
      for (const x0 of [5, 33]) { const gr = g.createLinearGradient(0, 5, 0, h - 5); gr.addColorStop(0, '#5d7484'); gr.addColorStop(1, '#2d3a45'); g.fillStyle = gr; g.fillRect(x0, 5, 26, h - 10); }
      g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(8, h - 5); g.lineTo(16, h - 5); g.lineTo(28, 5); g.lineTo(20, 5); g.fill();
    });
    const em = C.signTexture(64, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(5, 5, 26, h - 10); g.fillRect(33, 5, 26, h - 10); });
    const po = { gradientMap: C.gradient, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };
    HW = {
      dark: new T.MeshToonMaterial(Object.assign({ map: tex }, po)),
      lit: C.nightGlow(new T.MeshToonMaterial(Object.assign({ map: tex, emissive: 0xffc982, emissiveMap: em, emissiveIntensity: 0 }, po)), 0.85),
      door: new T.MeshToonMaterial(Object.assign({ color: 0x5a4636 }, po)),
    };
    return HW;
  }
  // a flat quad on face k of a w×d box (0 = front +Z, 1 = +X, 2 = back −Z, 3 = −X), u along the face, centred at height y
  function faceQuad(p, k, w, d, u, y, qw, qh, m, out = 0.025) {
    const o = new T.Mesh(unitQuad, m); o.scale.set(qw, qh, 1); o.receiveShadow = true;
    if (k === 0) o.position.set(u, y, d / 2 + out); else if (k === 1) o.position.set(w / 2 + out, y, -u);
    else if (k === 2) o.position.set(-u, y, -d / 2 - out); else o.position.set(-w / 2 - out, y, u);
    o.rotation.y = [0, PI / 2, PI, -PI / 2][k]; p.add(o); return o;
  }
  // town houses: every box part is vertex-coloured on one shared material (and the roofs on one textured one),
  // so after merging a whole tile of houses costs a handful of draw calls
  let VCM = null, VCR = null;
  const VB = (p, w, h, d, hex, x = 0, y = 0, z = 0, cast = true) => {
    const m = new T.Mesh(C.tint(new T.BoxGeometry(w, h, d), hex), VCM); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; p.add(m); return m;
  };
  C.makeTownHouse = function (opts = {}) {
    if (!VCM) { VCM = new T.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: C.gradient }); roofMat(0xffffff); VCR = new T.MeshToonMaterial({ color: 0xffffff, vertexColors: true, map: tileTex, gradientMap: C.gradient }); }
    const r = rng((opts.seed || 1) * 7919 + 13), g = new T.Group();
    const w = opts.w || 5 + r() * 3, d = opts.d || 5 + r() * 2.5, fl = opts.floors || (r() < 0.45 ? 2 : 1), h = fl * 2.7 + 0.3;
    VB(g, w, h, d, WALLS[Math.floor(r() * WALLS.length)], 0, h / 2, 0);
    VB(g, w + 0.08, 0.34, d + 0.08, 0x8f908d, 0, 0.17, 0, false);   // concrete plinth
    // windows on every face; about a third are lit at night
    const HM = houseWinMats();
    for (let f = 0; f < fl; f++) {
      const y = 0.3 + f * 2.7 + 1.5;
      for (let k = 0; k < 4; k++) {
        const len = k % 2 ? d : w, n = Math.max(1, Math.floor(len / 2.6));
        for (let i = 0; i < n; i++) {
          if ((k === 0 && f === 0 && i === 0) || r() < 0.22) continue;   // the door; some blank wall
          const u = (i - (n - 1) / 2) * (len / n), ww = 0.8 + r() * 0.6, wh = f === 0 && r() < 0.3 ? 1.7 : 1.0;
          faceQuad(g, k, w, d, u, y - (wh - 1) / 2, ww, wh, r() < 0.33 ? HM.lit : HM.dark, 0.02);
        }
      }
    }
    // front door with a small hood
    faceQuad(g, 0, w, d, -(w / 2) + 1.2, 1.3, 1.0, 2.0, HM.door, 0.02);
    VB(g, 1.5, 0.08, 0.7, 0x6b7078, -(w / 2) + 1.2, 2.55, d / 2 + 0.35, false);
    // first-floor balcony on two-storey houses, an air-conditioner unit on a side wall
    if (fl === 2 && r() < 0.6) {
      const bw = Math.min(w - 1, 2.6 + r() * 1.5), bx = (w - bw) / 2 - 0.4 - r() * 0.3, by = 3.0;
      VB(g, bw, 0.12, 0.9, 0xb7b9b6, bx, by, d / 2 + 0.45);
      VB(g, bw, 0.9, 0.05, 0xe4e6e3, bx, by + 0.5, d / 2 + 0.88, false);
      for (const sx of [-1, 1]) VB(g, 0.05, 0.9, 0.9, 0xe4e6e3, bx + sx * bw / 2, by + 0.5, d / 2 + 0.45, false);
    }
    if (r() < 0.5) VB(g, 0.3, 0.55, 0.75, 0xe9ebe8, w / 2 + 0.17, 0.62, (r() - 0.5) * (d - 1.5), false);
    VB(g, w + 0.3, 0.12, d + 0.3, 0x5a4636, 0, h, 0);
    const rf = roof(g, w + 0.9, d + 0.9, 1.2 + r() * 0.6, VCR, 0, h, 0, w < d);
    C.tint(rf.geometry, ROOFS[Math.floor(r() * ROOFS.length)]);
    return { group: g, w, d, h };
  };
})(window.CITY);
