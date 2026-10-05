// 梅津寺駅 Baishinji Station, modelled from photos (ref/photos): two opposite platforms on a straight double track,
// brick-faced platform walls with concrete coping, tactile blocks, dark asphalt; short white canopies on one row of round
// posts; white vertical-bar fences; the sea wall (diamond-grid concrete) dropping to the sand beach with steps down;
// concrete catenary portals; the small L-shaped station house by the level crossing (slate roofs, front gable 「梅津寺駅」).
// Local frame: x = n (east of the track midline, +), z = s (along the track, SSE), y = world height.
(function (C) {
  const T = THREE;
  const ST = C.DATA.rail.station, rot = ST.rot, cr = Math.cos(rot), sr = Math.sin(rot);
  const W = (n, s) => [ST.x0 + n * cr + s * sr, ST.z0 - n * sr + s * cr];     // local → world xz
  const railY = (s) => C.railYs(s);
  const PH = 0.92;                 // platform top above rail head
  const NW = C.stationZone.NW;     // sea-wall face line
  const M4 = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3();

  // ---------------- procedural textures ----------------
  const tex = (w, h, draw, rep) => { const t = C.signTexture(w, h, draw); if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; } return t; };
  const speck = (g, w, h, n, cols, size = 1.5) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[(Math.random() * cols.length) | 0]; g.fillRect(Math.random() * w, Math.random() * h, size, size); } };
  // platform top across its width (u: 0 = track edge → 1 = back), 2 m along v
  const PW = 3.2;
  const topTex = tex(512, 320, (g, w, h) => {
    const px = w / PW;
    g.fillStyle = '#5c5e62'; g.fillRect(0, 0, w, h); speck(g, w, h, 9000, ['#6a6c70', '#505256', '#73757a', '#48494d']);
    g.fillStyle = '#cdc9c0'; g.fillRect(0, 0, 0.45 * px, h); speck(g, 0.45 * px, h, 900, ['#bdb9b0', '#d8d4cb']);   // coping
    g.fillStyle = '#9d9a93'; for (let v = 0; v < h; v += h / 2) g.fillRect(0, v, 0.45 * px, 2);                          // coping joints
    g.fillStyle = '#f2f2ee'; for (let v = h * 0.25; v < h; v += h / 2) g.fillRect(0.5 * px, v - 0.22 * px, 0.08 * px, 0.45 * px); // white edge marks
    const t0 = 0.72 * px, tw = 0.3 * px;                                                                                    // tactile line (dots)
    g.fillStyle = '#e8b72a'; g.fillRect(t0, 0, tw, h);
    g.fillStyle = '#c9971b'; for (let v = 0; v < h; v += tw) g.fillRect(t0, v, tw, 1.5);
    g.fillStyle = '#f6cf4a'; for (let v = tw / 10; v < h; v += tw / 5) for (let u = tw / 10; u < tw; u += tw / 5) { g.beginPath(); g.arc(t0 + u, v, tw / 16, 0, 7); g.fill(); }
  }, true);
  const brickTex = tex(256, 128, (g, w, h) => {
    g.fillStyle = '#6f5a4a'; g.fillRect(0, 0, w, h);
    const bw = w / 4, bh = h / 6;
    for (let r = 0; r < 6; r++) for (let c = -1; c < 5; c++) {
      const x = c * bw + (r % 2) * bw / 2; const k = 0.85 + Math.random() * 0.3;
      g.fillStyle = `rgb(${(150 * k) | 0},${(112 * k) | 0},${(84 * k) | 0})`; g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
    }
    speck(g, w, h, 900, ['rgba(60,40,30,.35)', 'rgba(220,200,180,.25)']);
  }, true);
  const wallTex = tex(256, 256, (g, w, h) => {   // sea wall: concrete with a diamond grid of raised ribs
    g.fillStyle = '#b9b6ae'; g.fillRect(0, 0, w, h); speck(g, w, h, 5000, ['#aaa79f', '#c6c3bb', '#9f9c95']);
    g.strokeStyle = '#8e8b84'; g.lineWidth = 7;
    for (let k = -w; k < 2 * w; k += w / 2) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k, h); g.lineTo(k + h, 0); g.stroke(); }
    g.strokeStyle = '#d2cfc7'; g.lineWidth = 2;
    for (let k = -w; k < 2 * w; k += w / 2) { g.beginPath(); g.moveTo(k + 3, 0); g.lineTo(k + h + 3, h); g.stroke(); }
    g.fillStyle = 'rgba(70,80,70,.18)'; g.fillRect(0, h * 0.82, w, h * 0.18);   // damp, darker base
  }, true);
  const concTex = tex(128, 128, (g, w, h) => { g.fillStyle = '#c4c0b7'; g.fillRect(0, 0, w, h); speck(g, w, h, 1800, ['#b5b1a8', '#d1cdc4', '#a9a59c']); }, true);
  const stoneTex = tex(256, 256, (g, w, h) => {   // granite crossing panels
    g.fillStyle = '#b8b3aa'; g.fillRect(0, 0, w, h); speck(g, w, h, 7000, ['#a59f96', '#cbc6bd', '#8f8a82', '#d9d4ca']);
    g.strokeStyle = '#7d786f'; g.lineWidth = 3; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(0, i * h / 2); g.lineTo(w, i * h / 2); g.stroke(); g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2, h); g.stroke(); }
  }, true);
  const poolTex = tex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.45, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  // 1 texture unit = 1 m (use with boxM / metre UVs)
  const sidingTex = tex(128, 128, (g, w, h) => {   // white lap siding of the station house
    g.fillStyle = '#f1f0ea'; g.fillRect(0, 0, w, h); speck(g, w, h, 500, ['#e9e8e1', '#f7f6f1']);
    for (let v = 0; v < h; v += h / 5) { g.fillStyle = '#d3d2cb'; g.fillRect(0, v, w, 2); g.fillStyle = '#fbfbf7'; g.fillRect(0, v + 2, w, 1); }
  }, true);
  const slateTex = tex(128, 128, (g, w, h) => {    // slate shingles in staggered rows
    g.fillStyle = '#4f555e'; g.fillRect(0, 0, w, h);
    const rh = h / 4, sw = w / 3;
    for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) {
      const x = c * sw + (r % 2) * sw / 2, k = 0.9 + Math.random() * 0.18;
      g.fillStyle = `rgb(${(80 * k) | 0},${(86 * k) | 0},${(95 * k) | 0})`; g.fillRect(x + 1, r * rh + 1, sw - 2, rh - 3);
      g.fillStyle = 'rgba(30,32,38,.55)'; g.fillRect(x, r * rh + rh - 3, sw, 3);
    }
  }, true);
  const panelTex = tex(256, 256, (g, w, h) => {    // concrete level-crossing slab, 1 m × 1 m
    g.fillStyle = '#b4b0a8'; g.fillRect(0, 0, w, h); speck(g, w, h, 6000, ['#a39f97', '#c4c0b8', '#97938b', '#cfcac2'], 2);
    g.strokeStyle = '#77736c'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.strokeRect(9, 9, w - 18, h - 18);
  }, true);
  // aluminium sash window: two panes, sky reflection; emissive map lights the panes at night
  const winTex = tex(128, 128, (g, w, h) => {
    g.fillStyle = '#c9ced3'; g.fillRect(0, 0, w, h);
    for (const x0 of [8, 66]) {
      const gr = g.createLinearGradient(0, 8, 0, h - 8); gr.addColorStop(0, '#6f8796'); gr.addColorStop(1, '#3d4f5c');
      g.fillStyle = gr; g.fillRect(x0, 8, 54, h - 16);
      g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(x0 + 6, h - 8); g.lineTo(x0 + 20, h - 8); g.lineTo(x0 + 48, 8); g.lineTo(x0 + 34, 8); g.fill();
    }
    g.fillStyle = '#aeb4ba'; g.fillRect(0, h - 6, w, 6);
  });
  const winGlowTex = tex(128, 128, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(8, 8, 54, h - 16); g.fillRect(66, 8, 54, h - 16); });

  // ---------------- materials ----------------
  const M = {
    top: new T.MeshPhongMaterial({ map: topTex, specular: 0x000000, shininess: 48 }), brick: C.toon(0xffffff, { map: brickTex }), wall: C.toon(0xffffff, { map: wallTex }),
    conc: C.toon(0xffffff, { map: concTex }), stone: C.toon(0xffffff, { map: stoneTex }),
    white: C.toon(0xf3f2ec), offwhite: C.toon(0xe4e2da), grey: C.toon(0x9b9d9f), dark: C.toon(0x34363c), steel: C.toon(0x7d8287),
    pole: C.toon(0xa9a8a2), slate: C.toon(0x4b5059), mint: C.toon(0x9fd3c3), skirt: C.toon(0x8d9aab), wood: C.toon(0x8a6446),
    glass: new T.MeshToonMaterial({ color: 0x9fc3d6, gradientMap: C.gradient, transparent: true, opacity: 0.38, depthWrite: false }),
    yellow: C.toon(0xf2c230), black: C.toon(0x1c1c1f), red: C.toon(0xc8322c),
  };
  Object.assign(M, {
    siding: C.toon(0xffffff, { map: sidingTex, side: T.DoubleSide }), slate: C.toon(0xffffff, { map: slateTex }), panel: C.toon(0xffffff, { map: panelTex }),
    alu: C.toon(0xc9ced3), trunk: C.toon(0x8c8274), leaf1: C.toon(0x5d9a44), leaf2: C.toon(0x7cb455), pine: C.toon(0x3f6a3c), pineBark: C.toon(0x6b5446),
    cone: C.toon(0xf0642a), base: C.toon(0x7a5a40),
    lane: C.toon(0x8e8f8c, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),   // = town.js lane ribbons (shared, cached)
    win: C.nightGlow(C.toon(0xffffff, { map: winTex, emissive: 0xffe2a8, emissiveMap: winGlowTex, emissiveIntensity: 0 }), 0.75),
  });
  for (const k of ['top', 'brick', 'wall', 'conc', 'stone']) M[k].side = T.DoubleSide;
  const lampMat = C.nightGlow(C.toon(0xf4f8ff, { emissive: 0xe4f1ff, emissiveIntensity: 0 }), 1.7);   // mercury-white
  const WIRE = new T.LineBasicMaterial({ color: 0x4a4e56, transparent: true, opacity: 0.5 });           // thin overhead wires: keep them faint

  // ---------------- builders ----------------
  // a grid sheet: f(i, j) → [n, y, s, u, v] for i in 0..ni, j in 0..nj
  function sheet(ni, nj, f, mat, parent, shadow = false) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nj; j++) for (let i = 0; i <= ni; i++) { const r = f(i, j); pos.push(r[0], r[1], r[2]); uv.push(r[3], r[4]); }
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const a = j * (ni + 1) + i, b = a + 1, c = a + ni + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, mat); m.receiveShadow = true; m.castShadow = shadow; parent.add(m); return m;
  }
  const box = (w, h, d, mat, x, y, z, p, sh = true) => C.box(w, h, d, mat, x, y, z, p, sh);
  const cylY = (r, h, mat, x, y, z, p, seg = 10) => { const m = C.cyl(r, r, h, mat, seg, p); m.position.set(x, y, z); return m; };
  // box with UVs in metres on every face (for the tiling 1 m textures)
  function boxM(w, h, d, mat, x, y, z, p, sh = true) {
    const m = box(w, h, d, mat, x, y, z, p, sh), uv = m.geometry.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    return m;
  }
  // a textured quad on a wall: facing +n / −n (axis 'n') or +s / −s (axis 's'), centred at (n, y, s)
  function wallQuad(parent, mat, axis, dir, n, y, s, w, h) {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.position.set(n, y, s); m.rotation.y = axis === 'n' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    m.receiveShadow = true; parent.add(m); return m;
  }
  // window: protruding aluminium frame + sill, the sash texture in front (lit from inside at night)
  function houseWindow(parent, axis, dir, n, y, s, w, h) {
    const [fw, fd] = axis === 'n' ? [0.07, w + 0.1] : [w + 0.1, 0.07];
    box(fw, h + 0.1, fd, M.alu, n, y, s, parent, false);
    const sill = axis === 'n' ? box(0.16, 0.05, w + 0.2, M.alu, n + dir * 0.05, y - h / 2 - 0.06, s, parent, false) : box(w + 0.2, 0.05, 0.16, M.alu, n, y - h / 2 - 0.06, s + dir * 0.05, parent, false);
    return wallQuad(parent, M.win, axis, dir, n + (axis === 'n' ? dir * 0.04 : 0), y, s + (axis === 's' ? dir * 0.04 : 0), w, h);
  }
  // white pipe rail through points [[n,y,s],…]
  function pipe(points, r, mat, parent) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), false, 'catmullrom', 0.05);
    const m = new T.Mesh(new T.TubeGeometry(curve, Math.max(4, points.length * 6), r, 6), mat); m.castShadow = true; parent.add(m); return m;
  }
  // fences: collected, then built as two instanced meshes (bars + rails) for the whole station
  const bars = [], rails = [];
  function fence(n0, s0, n1, s1, yFn, h = 1.15, opts = {}) {
    const L = Math.hypot(n1 - n0, s1 - s0), dn = (n1 - n0) / L, ds = (s1 - s0) / L, gap = opts.gap || 0.115;
    for (let t = gap / 2; t < L; t += gap) { const n = n0 + dn * t, s = s0 + ds * t; bars.push([n, yFn(s), s, 0.022, h, 0.022]); }
    for (let t = 0; t <= L + 0.01; t += 2) { const n = n0 + dn * t, s = s0 + ds * t; bars.push([n, yFn(s), s, 0.06, h + 0.05, 0.06]); }
    const seg = Math.max(1, Math.round(L / 2));
    for (let k = 0; k < seg; k++) {
      const a = k / seg, b = (k + 1) / seg, na = n0 + (n1 - n0) * a, nb = n0 + (n1 - n0) * b, sa = s0 + (s1 - s0) * a, sb = s0 + (s1 - s0) * b;
      for (const hy of [h, 0.1]) rails.push([na, yFn(sa) + hy, sa, nb, yFn(sb) + hy, sb]);
    }
    if (!opts.noCollide) { const [cx, cz] = W((n0 + n1) / 2, (s0 + s1) / 2); C.addCollider(cx, cz, 0.06 + Math.abs(dn) * L / 2, 0.06 + Math.abs(ds) * L / 2, rot); }
  }
  function buildFences(grp) {
    const bar = new T.BoxGeometry(1, 1, 1); bar.translate(0, 0.5, 0);
    const im = new T.InstancedMesh(bar, M.white, bars.length);
    bars.forEach(([n, y, s, w, h, d], i) => im.setMatrixAt(i, M4.compose(V.set(n, y, s), Q.identity(), new T.Vector3(w, h, d))));
    im.castShadow = true; grp.add(im);
    const rail = new T.CylinderGeometry(0.03, 0.03, 1, 6); rail.rotateX(Math.PI / 2); rail.translate(0, 0, 0.5);
    const rm = new T.InstancedMesh(rail, M.white, rails.length), A = new T.Vector3(), B = new T.Vector3(), up = new T.Vector3(0, 1, 0), lk = new T.Matrix4();
    rails.forEach(([na, ya, sa, nb, yb, sb], i) => {
      A.set(na, ya, sa); B.set(nb, yb, sb); const L = A.distanceTo(B);
      lk.lookAt(B, A, up); Q.setFromRotationMatrix(lk);   // local +Z points from A to B
      rm.setMatrixAt(i, M4.compose(A, Q, new T.Vector3(1, 1, L)));
    });
    grp.add(rm);
    C.instBounds(im); C.instBounds(rm);
  }
  function textBoard(w, h, draw, emissive = 0) {
    const t = C.signTexture(Math.round(512 * Math.min(1, w / h)), Math.round(512 * Math.min(1, h / w)), draw);
    const b = C.signBoard(w, h, t, emissive); if (emissive) C.nightGlow(b.material, emissive);
    return b;
  }
  // the same board readable from both sides (a lone DoubleSide plane shows its back mirrored)
  function twoSided(b) {
    b.material.side = T.FrontSide; const k = new T.Mesh(b.geometry, b.material); k.rotation.y = Math.PI; k.position.z = -0.004; b.add(k);
    return b;
  }

  // ---------------- platform ----------------
  function platform(grp, side, s0, s1, rampLen) {
    const ni = ST.n0 + side * (ST.half + 1.52), no = ni + side * PW, nc = (ni + no) / 2;
    const yAt = (s) => railY(s) + PH, form = (s) => railY(s) - 0.75;
    const L = s1 - s0, ns = Math.ceil(L / 2);
    const p = { side, n0: Math.min(ni, no), n1: Math.max(ni, no), ni, no, nc, s0, s1, yAt, y0: yAt(s0), y1: yAt(s1) };
    // top (one textured sheet), u across width from the track edge
    sheet(1, ns, (i, j) => { const s = s0 + L * j / ns; return [i ? no : ni, yAt(s), s, i, s / 2]; }, M.top, grp);
    // coping nose + brick face toward the track
    sheet(1, ns, (i, j) => { const s = s0 + L * j / ns; return [ni, yAt(s) - i * 0.13, s, s / 1.2, i * 0.2]; }, M.conc, grp);
    sheet(1, ns, (i, j) => { const s = s0 + L * j / ns; return [ni + side * 0.07, i ? form(s) : yAt(s) - 0.13, s, s / 1.2, i ? (yAt(s) - form(s)) / 0.6 : 0]; }, M.brick, grp);
    // back face (platform 1 → the lot; platform 2 → behind the sea wall)
    sheet(1, ns, (i, j) => { const s = s0 + L * j / ns; return [no, i ? Math.min(form(s), C.groundH(...W(no + side * 0.5, s))) - 0.3 : yAt(s), s, s / 2, i]; }, M.conc, grp);
    // end walls
    for (const s of [s0, s1]) sheet(1, 1, (i, j) => [i ? no : ni, j ? form(s) - 0.3 : yAt(s), s, i * 1.6, j * 0.6], M.conc, grp);
    // ramp down at the north end, white pipe handrails on both sides
    const r0 = s0 - rampLen, g0 = Math.max(form(r0) + 0.15, C.groundH(...W(nc, r0)));
    sheet(1, 6, (i, j) => { const s = r0 + rampLen * j / 6; return [i ? no : ni, C.lerp(g0, yAt(s0), j / 6), s, i, s / 2]; }, M.top, grp);
    for (const n of [ni, no]) sheet(1, 6, (i, j) => { const s = r0 + rampLen * j / 6; return [n, i ? form(s) - 0.3 : C.lerp(g0, yAt(s0), j / 6), s, s / 1.2, i]; }, M.conc, grp);
    for (const n of [ni + side * 0.15, no - side * 0.15]) {
      const pts = []; for (let k = 0; k <= 6; k++) { const s = r0 + 0.3 + (rampLen - 0.3) * k / 6; pts.push([n, C.lerp(g0, yAt(s0), (s - r0) / rampLen) + 0.85, s]); }
      pts.push([n, yAt(s0) + 0.85, s0 + 1.5]); pipe(pts, 0.025, M.white, grp);
      for (let k = 0; k <= 2; k++) { const s = r0 + 0.3 + (rampLen + 1.2) * k / 2; const y = C.lerp(g0, yAt(s0), C.clamp((s - r0) / rampLen, 0, 1)); cylY(0.025, 0.85, M.white, n, y + 0.425, s, grp, 6); }
    }
    const [rx, rz] = W(nc, r0 + rampLen / 2); C.addDeck(rx, rz, PW / 2, rampLen / 2, g0, yAt(s0), rot);
    const [cx, cz] = W(nc, (s0 + s1) / 2); p.deck = C.addDeck(cx, cz, PW / 2, L / 2, yAt(s0), yAt(s1), rot);
    p.r0 = r0; p.g0 = g0;
    p.ySurf = (s) => s >= s0 ? yAt(s) : C.lerp(g0, yAt(s0), C.clamp((s - r0) / rampLen, 0, 1));   // ramp + top
    return p;
  }

  // ---------------- canopy (one row of round posts, flat white roof) ----------------
  function canopy(grp, p, s0, s1, num) {
    const g = new T.Group(), L = s1 - s0, y = p.yAt((s0 + s1) / 2), nPost = p.nc + p.side * 0.35;
    for (let s = s0 + 1.2, k = 0; s <= s1 - 1.1; s += 4.6, k++) {
      const c = cylY(0.1, 2.75, M.white, nPost, y + 1.375, s, g, 12); C.outline(c, 0.015);
      box(0.24, 0.12, 0.24, M.grey, nPost, y + 0.06, s, g);
      for (const d of [-1, 1]) { const br = box(1.2, 0.08, 0.08, M.white, nPost + d * 0.55, y + 2.62, s, g); br.rotation.z = d * 0.18; }
      if (k % 2) for (const d of [-1, 1]) {   // PA speakers on every other post, back to back, aimed down the platform
        box(0.04, 0.04, 0.2, M.steel, nPost, y + 2.32, s + d * 0.17, g, false);
        const sp = box(0.2, 0.26, 0.14, M.offwhite, nPost, y + 2.3, s + d * 0.32, g); sp.rotation.x = d * 0.35; C.outline(sp, 0.01);
        box(0.15, 0.19, 0.012, M.dark, 0, -0.01, d * 0.072, sp, false);
      }
    }
    // the platform clock: double-faced, hung from the beam between the second and third posts
    { const cs = s0 + 8.1; clockFace(g, nPost, y + 2.3, cs, 0, 0.22, PM, M.dark, 0, true); for (const d of [-0.09, 0.09]) box(0.02, 0.14, 0.02, M.steel, nPost + d, y + 2.61, cs, g, false); }
    box(0.16, 0.22, L, M.white, nPost, y + 2.78, (s0 + s1) / 2, g);
    const roof = box(3.7, 0.1, L + 0.2, M.white, p.nc, y + 2.95, (s0 + s1) / 2, g); roof.rotation.z = -p.side * 0.03; C.outline(roof, 0.03);
    for (const d of [-1, 1]) box(0.05, 0.22, L + 0.2, M.offwhite, p.nc + d * 1.86, y + 2.9, (s0 + s1) / 2, g);   // fascia
    box(3.5, 0.02, L, M.offwhite, p.nc, y + 2.89, (s0 + s1) / 2, g, false);                                     // soffit
    for (let s = s0 + 2.2; s < s1 - 1; s += 4.6) for (const d of [-0.8, 0.8]) box(0.14, 0.06, 1.25, lampMat, p.nc + d, y + 2.84, s, g, false);
    // のりば number, hanging at the north end
    const nb = textBoard(0.42, 0.42, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.strokeStyle = '#222'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); C.text(c, String(num), w / 2, h / 2 + 8, h * 0.72, '#1c1c1c', 'sans-serif'); }, 0.3);
    twoSided(nb); nb.position.set(p.ni - p.side * 0.5, y + 2.55, s0 + 0.6); g.add(nb);
    for (const d of [-0.12, 0.12]) box(0.01, 0.2, 0.01, M.steel, p.ni - p.side * 0.5 + d, y + 2.8, s0 + 0.6, g, false);
    grp.add(g); return g;
  }
  function bench(grp, p, s) {   // white perforated three-seat unit on a dark frame, facing the track
    const g = new T.Group(), y = p.yAt(s), face = p.side > 0 ? Math.PI : 0;   // local +x (the way you face) → the track
    for (let i = -1; i <= 1; i++) {
      const seat = box(0.46, 0.05, 0.44, M.white, 0, 0.44, i * 0.52, g); C.outline(seat, 0.01);
      const back = box(0.05, 0.42, 0.44, M.white, -0.22, 0.68, i * 0.52, g); back.rotation.z = 0.12;
    }
    for (const z of [-0.78, 0.78]) { box(0.4, 0.04, 0.04, M.dark, 0, 0.4, z, g); for (const x of [-0.16, 0.16]) box(0.04, 0.4, 0.04, M.dark, x, 0.2, z, g); }
    g.position.set(p.no - p.side * 0.55, y, s); g.rotation.y = face; grp.add(g);
    (C.benches = C.benches || []).push({ obj: g, world: W(p.no - p.side * 0.75, s), y });
  }
  // lamp light pools on the platforms: one shared additive material (they merge into one draw call), hidden by day
  const poolMat = new T.MeshBasicMaterial({ map: poolTex, color: 0xd6e8ff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  function lightPool(grp, n, y, s, r = 3.2) {
    const m = new T.Mesh(new T.PlaneGeometry(r * 2, r * 2), poolMat);
    m.rotation.x = -Math.PI / 2; m.position.set(n, y + 0.02, s); grp.add(m); return m;
  }
  function lampPost(grp, p, s) {   // white pole + fluorescent fixture leaning over the platform
    const n = p.no - p.side * 0.35, y = p.yAt(s), g = new T.Group();
    const pole = cylY(0.055, 3.6, M.white, 0, 1.8, 0, g, 8); C.outline(pole, 0.012);
    box(0.9, 0.05, 0.05, M.white, -p.side * 0.45, 3.58, 0, g);
    box(0.22, 0.09, 1.25, M.white, -p.side * 0.9, 3.52, 0, g);
    box(0.16, 0.03, 1.15, lampMat, -p.side * 0.9, 3.47, 0, g, false);
    const h = C.makeHalo(3.2, 0xdcecff, 0.4); h.position.set(-p.side * 0.9, 3.35, 0); g.add(h);
    g.position.set(n, y, s); grp.add(g);
    lightPool(grp, n - p.side * 1.2, y, s);
  }
  function fencePoster(grp, p, s, R, w, h) {   // an advertising board on the platform's back fence, facing the track
    const n = p.no - p.side * 0.17, y = p.yAt(s), yc = y + 1.45, top = yc + h / 2 + 0.04;
    box(0.04, h + 0.08, w + 0.08, M.alu, n + p.side * 0.02, yc, s, grp, false);
    atlasQuad(grp, R, w, h, n - p.side * 0.002, yc, s, p.side > 0 ? -Math.PI / 2 : Math.PI / 2, PM);
    for (const d of [-1, 1]) box(0.05, top - y, 0.05, M.steel, n + p.side * 0.06, (top + y) / 2, s + d * (w / 2 - 0.05), grp, false);
  }
  function endChain(grp, p, s) {   // a plastic chain across the platform with 「関係者以外立入禁止」: the last metres are for staff
    const y = p.yAt(s), na = p.ni + p.side * 0.3, nb = p.no - p.side * 0.12, nm = (na + nb) / 2;
    for (const n of [na, nm, nb]) {   // yellow posts with black bands on a round base
      cylY(0.035, 0.9, M.yellow, n, y + 0.45, s, grp, 8);
      for (const yy of [0.3, 0.6]) cylY(0.038, 0.12, M.black, n, y + yy, s, grp, 8);
      cylY(0.13, 0.05, M.dark, n, y + 0.025, s, grp, 10);
    }
    for (const [a, b] of [[na, nm], [nm, nb]]) {
      const pts = []; for (let k = 0; k <= 6; k++) { const f = k / 6; pts.push([C.lerp(a, b, f), y + 0.84 - Math.sin(f * Math.PI) * 0.16, s]); }
      pipe(pts, 0.014, M.yellow, grp);
    }
    const pn = (na + nm) / 2; for (const d of [-1, 1]) atlasQuad(grp, AR.keep, 0.36, 0.18, pn, y + 0.57, s + d * 0.012, d > 0 ? 0 : Math.PI, PM);
    const [cx, cz] = W(nm, s); C.addCollider(cx, cz, Math.abs(nb - na) / 2 + 0.1, 0.06, rot);
  }
  function nameBoard() {   // 駅名標
    const g = new T.Group();
    const b = textBoard(1.9, 0.95, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ef7a1a'; c.fillRect(0, 0, w, 12);
      C.text(c, '梅津寺', w / 2, 80, 92, '#1d1d22');
      C.text(c, 'ばいしんじ', w / 2, 146, 30, '#1d1d22');
      C.text(c, 'Baishinji', w / 2, 178, 22, '#333', 'sans-serif', 'normal');
      c.fillStyle = '#1f4f96'; c.fillRect(0, 200, w, 56);
      C.text(c, '← たかはま 高浜', 14, 228, 23, '#fff', C.JP_FONT, 'bold', 'left');
      C.text(c, '港山 みなとやま →', w - 14, 228, 23, '#fff', C.JP_FONT, 'bold', 'right');
    }, 0.45);
    twoSided(b); b.position.y = 1.95; g.add(b);
    box(2.0, 0.07, 0.07, M.dark, 0, 2.46, 0, g); box(2.0, 0.07, 0.07, M.dark, 0, 1.45, 0, g);
    for (const x of [-0.92, 0.92]) box(0.07, 2.45, 0.07, M.dark, x, 1.22, 0, g);
    return g;
  }
  function phoneStand() {   // green public phone on a small stand under a hood (the novel's platform phone)
    if (C.makePhoneBooth) return C.makePhoneBooth();
    const g = new T.Group();
    box(0.12, 1.0, 0.12, M.steel, 0, 0.5, 0, g);
    const body = box(0.44, 0.58, 0.3, C.toon(0x2f8a52), 0, 1.25, 0, g); C.outline(body, 0.02);
    box(0.62, 0.06, 0.48, M.grey, 0, 1.78, 0, g);
    const receiver = box(0.08, 0.3, 0.08, C.toon(0x1f5a35), 0.15, 1.3, 0.17, g);
    return { group: g, receiver };
  }
  function vending(color) {
    if (C.makeVending) { const v = C.makeVending(color); return v.group || v; }
    const g = new T.Group(); box(0.95, 1.85, 0.75, C.toon(color), 0, 0.925, 0, g); return g;
  }

  // box with UVs from its absolute position in the parent (1 m textures line up across neighbouring boxes)
  function boxA(w, h, d, mat, x, y, z, p, sh = true) {
    const m = box(w, h, d, mat, x, y, z, p, sh), pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const f = i >> 2, X = pos.getX(i) + x, Y = pos.getY(i) + y, Z = pos.getZ(i) + z;   // faces: ±x, ±y, ±z
      if (f < 2) uv.setXY(i, Z, Y); else if (f < 4) uv.setXY(i, X, Z); else uv.setXY(i, X, Y);
    }
    return m;
  }
  // rectangles [u0, u1, y0, y1] that cover [a0, a1] × [y0, y1] minus the holes [u0, u1, v0, v1] (vertical strips)
  function cover(a0, a1, y0, y1, holes) {
    const us = [...new Set([a0, a1, ...holes.flatMap(h => [h[0], h[1]]).filter(u => u > a0 && u < a1)])].sort((p, q) => p - q), out = [];
    for (let i = 0; i + 1 < us.length; i++) {
      const u0 = us[i], u1 = us[i + 1];
      const cut = holes.filter(h => h[0] < u1 - 1e-4 && h[1] > u0 + 1e-4).map(h => [Math.max(y0, h[2]), Math.min(y1, h[3])]).filter(v => v[1] > v[0]).sort((p, q) => p[0] - q[0]);
      let y = y0;
      for (const [v0, v1] of cut) { if (v0 > y + 1e-4) out.push([u0, u1, y, v0]); y = Math.max(y, v1); }
      if (y < y1 - 1e-4) out.push([u0, u1, y, y1]);
    }
    return out;
  }

  // ---------------- the waiting room (photo "Inside") ----------------
  // Grey tiles with yellow guide blocks, cream walls with posters, white perforated benches, the closed ticket window
  // under the fare chart, and a clock that keeps the story's time. The glass doors slide open as you come near.
  // Lit a little by day and warmly at night: then it is the brightest window at the station.
  const tactTex = tex(64, 64, (g, w, h) => {   // one 30 cm warning block: 5 × 5 raised dots
    g.fillStyle = '#e3b126'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9971b'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
    g.fillStyle = '#f6cf4a'; for (let v = 0; v < 5; v++) for (let u = 0; u < 5; u++) { g.beginPath(); g.arc(8 + u * 12, 8 + v * 12, 3.4, 0, 7); g.fill(); }
  }, true);
  tactTex.repeat.set(1 / 0.3, 1 / 0.3);
  const ATLAS = 1024, AR = {   // regions of the poster atlas, in canvas px [x0, y0, x1, y1]
    rush: [0, 0, 192, 270], bag: [192, 0, 384, 270], sunset: [384, 0, 576, 270], ic: [576, 0, 768, 270], clock: [768, 0, 1024, 256],
    fare: [0, 288, 640, 480], mado: [640, 288, 1024, 384], frost: [640, 384, 1024, 480],
    time: [0, 496, 256, 816], notice: [256, 496, 448, 766], spring: [448, 496, 640, 766], smoke: [640, 496, 768, 624],
    keep: [768, 496, 1024, 624],                                                          // 関係者以外立入禁止 (the chains at the platform ends)
    botchan: [0, 824, 288, 1016], dogo: [288, 824, 576, 1016], mikan: [576, 824, 864, 1016],   // landscape posters for the platform fences
    post: [640, 640, 768, 768],                                                           // 〒 on the round post box
  };
  const posterTex = tex(ATLAS, ATLAS, (c) => {
    const J = C.JP_FONT, rr = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.fill(); };
    c.fillStyle = '#f2efe6'; c.fillRect(0, 0, ATLAS, ATLAS);
    { // 駆け込み乗車は危険です: a red manner poster with a running figure in a closing door
      const [x, y] = AR.rush; c.fillStyle = '#e4473b'; c.fillRect(x, y, 192, 150); c.fillStyle = '#fff'; c.fillRect(x, y + 150, 192, 120);
      c.strokeStyle = '#fff'; c.lineWidth = 5; c.strokeRect(x + 48, y + 22, 96, 112); c.beginPath(); c.moveTo(x + 96, y + 22); c.lineTo(x + 96, y + 134); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x + 122, y + 44, 9, 0, 7); c.fill();
      c.lineWidth = 8; c.lineCap = 'round'; c.beginPath();
      c.moveTo(x + 117, y + 57); c.lineTo(x + 104, y + 88); c.lineTo(x + 122, y + 108); c.moveTo(x + 104, y + 88); c.lineTo(x + 84, y + 112);
      c.moveTo(x + 113, y + 64); c.lineTo(x + 134, y + 80); c.moveTo(x + 113, y + 64); c.lineTo(x + 92, y + 70); c.stroke(); c.lineCap = 'butt';
      C.text(c, '駆け込み乗車は', x + 96, y + 178, 21, '#d43a2f', J); C.text(c, '危険です。', x + 96, y + 212, 28, '#d43a2f', J);
      C.text(c, 'ゆとりをもってご乗車ください', x + 96, y + 248, 11, '#555', J, 'normal');
    }
    { // リュックは前に抱えましょう
      const [x, y] = AR.bag; c.fillStyle = '#fbfbf8'; c.fillRect(x, y, 192, 270); c.fillStyle = '#2f6fb5'; c.fillRect(x, y, 192, 14);
      c.fillStyle = '#9bb8d6'; c.beginPath(); c.arc(x + 96, y + 52, 17, 0, 7); c.fill(); rr(x + 70, y + 72, 52, 80, 14);
      c.fillStyle = '#2f6fb5'; rr(x + 78, y + 92, 40, 46, 8); c.fillStyle = '#1f4f8a'; c.fillRect(x + 84, y + 104, 28, 4);
      C.text(c, 'リュックは前に', x + 96, y + 186, 21, '#1f4f8a', J); C.text(c, '抱えましょう。', x + 96, y + 218, 21, '#1f4f8a', J);
      C.text(c, '車内ではまわりの方へご配慮を', x + 96, y + 250, 11, '#555', J, 'normal');
    }
    { // 夕日の見える駅: half a sun on the sea, an island
      const [x, y] = AR.sunset, gr = c.createLinearGradient(0, y, 0, y + 170);
      gr.addColorStop(0, '#5c4a7d'); gr.addColorStop(0.55, '#e3706a'); gr.addColorStop(1, '#f6b267'); c.fillStyle = gr; c.fillRect(x, y, 192, 170);
      c.fillStyle = '#ffd77a'; c.beginPath(); c.arc(x + 96, y + 170, 30, Math.PI, 0); c.fill();
      c.fillStyle = '#34496e'; c.fillRect(x, y + 170, 192, 100);
      c.fillStyle = 'rgba(255,215,122,.75)'; c.beginPath(); c.arc(x + 96, y + 170, 30, 0, Math.PI); c.fill();
      c.fillStyle = 'rgba(255,230,170,.5)'; for (let k = 0; k < 6; k++) c.fillRect(x + 70 + (k % 2) * 8, y + 208 + k * 9, 52 - k * 6, 2);
      c.fillStyle = '#2a2a44'; c.beginPath(); c.moveTo(x + 8, y + 170); c.quadraticCurveTo(x + 34, y + 140, x + 62, y + 170); c.fill();
      C.text(c, '夕日の見える駅', x + 96, y + 34, 22, '#fff', J); C.text(c, '梅 津 寺', x + 96, y + 246, 18, '#fff', J);
    }
    { // ICカードは出場時にタッチ (matches the 出場 reader outside)
      const [x, y] = AR.ic; c.fillStyle = '#d4efe6'; c.fillRect(x, y, 192, 270);
      c.fillStyle = '#2a9d8f'; rr(x + 46, y + 40, 100, 64, 9); c.fillStyle = '#e9c46a'; c.fillRect(x + 58, y + 56, 20, 16);
      c.strokeStyle = '#2a9d8f'; c.lineWidth = 4; for (const r of [16, 28, 40]) { c.beginPath(); c.arc(x + 150, y + 118, r, -1.2, -0.2); c.stroke(); }
      C.text(c, 'ICカードは', x + 96, y + 168, 22, '#1e6b62', J); C.text(c, '出場時にタッチ', x + 96, y + 202, 22, '#1e6b62', J);
      C.text(c, '出場　EXIT', x + 96, y + 244, 13, '#555', J, 'normal');
    }
    { // the clock face
      const [x, y] = AR.clock, cx = x + 128, cy = y + 128; c.fillStyle = '#fdfdfb'; c.beginPath(); c.arc(cx, cy, 124, 0, 7); c.fill();
      c.fillStyle = '#222'; for (let k = 0; k < 60; k++) { const a = k / 60 * Math.PI * 2, l = k % 5 ? 6 : 16, wd = k % 5 ? 2 : 5;
        c.save(); c.translate(cx, cy); c.rotate(a); c.fillRect(-wd / 2, -118, wd, l); c.restore(); }
      for (let k = 1; k <= 12; k++) { const a = k / 12 * Math.PI * 2; C.text(c, String(k), cx + Math.sin(a) * 88, cy - Math.cos(a) * 88, 26, '#222', 'sans-serif'); }
    }
    { // 運賃表: the Takahama line, this station marked
      const [x, y] = AR.fare; c.fillStyle = '#fbfbf8'; c.fillRect(x, y, 640, 192); c.fillStyle = '#1f4f96'; c.fillRect(x, y, 640, 40);
      C.text(c, '運 賃 表　　きっぷ運賃（大人）', x + 18, y + 21, 22, '#fff', J, 'bold', 'left'); C.text(c, '小児半額', x + 622, y + 21, 15, '#fff', J, 'normal', 'right');
      const st = ['高浜', '梅津寺', '港山', '三津', '山西', '西衣山', '衣山', '古町', '大手町', '松山市'], fare = [160, 0, 160, 160, 210, 210, 260, 260, 310, 310];
      c.fillStyle = '#ef7a1a'; c.fillRect(x + 40, y + 96, 560, 8);
      st.forEach((n, i) => { const px = x + 40 + i * 560 / 9;
        c.fillStyle = i === 1 ? '#d42a24' : '#fff'; c.strokeStyle = '#333'; c.lineWidth = 3; c.beginPath(); c.arc(px, y + 100, i === 1 ? 11 : 8, 0, 7); c.fill(); c.stroke();
        C.text(c, n, px, y + 70, 17, '#222', J); C.text(c, i === 1 ? '現在地' : String(fare[i]), px, y + 134, i === 1 ? 15 : 20, i === 1 ? '#d42a24' : '#222', J);
      });
      C.text(c, '伊予鉄道 高浜線', x + 18, y + 172, 14, '#555', J, 'normal', 'left');
    }
    { // 窓口: the closed ticket window's plate
      const [x, y] = AR.mado; c.fillStyle = '#26467a'; c.fillRect(x, y, 384, 96);
      C.text(c, '窓　口', x + 120, y + 48, 44, '#fff', J); C.text(c, 'きっぷうりば', x + 290, y + 48, 24, '#dfe7f5', J, 'normal');
    }
    { // frosted glass, the office light behind it
      const [x, y] = AR.frost, gr = c.createLinearGradient(x, y, x, y + 96); gr.addColorStop(0, '#dfe6e1'); gr.addColorStop(1, '#c9d2cc');
      c.fillStyle = gr; c.fillRect(x, y, 384, 96); c.fillStyle = 'rgba(255,255,255,.25)'; for (let k = 0; k < 40; k++) c.fillRect(x + k * 9.6, y, 2, 96);
      c.fillStyle = '#9aa29d'; c.fillRect(x + 186, y, 12, 96);
    }
    { // 時刻表 (松山市方面): weekday / holiday columns
      const [x, y] = AR.time; c.fillStyle = '#fbfaf5'; c.fillRect(x, y, 256, 320); c.fillStyle = '#1f4f96'; c.fillRect(x, y, 256, 46);
      C.text(c, '時 刻 表', x + 128, y + 16, 20, '#fff', J); C.text(c, '松山市方面', x + 128, y + 36, 12, '#fff', J, 'normal');
      C.text(c, '平日', x + 96, y + 60, 12, '#333', J); C.text(c, '土休日', x + 196, y + 60, 12, '#c33', J);
      for (let r = 0; r < 17; r++) { const yy = y + 78 + r * 14.3;
        if (r % 2) { c.fillStyle = '#eef1f6'; c.fillRect(x + 4, yy - 7, 248, 14); }
        C.text(c, String(6 + r), x + 22, yy, 11, '#1f4f96', 'monospace', 'bold');
        C.text(c, ['04 19 34 49', '09 24 39 54', '14 29 44 59'][r % 3], x + 96, yy, 10, '#333', 'monospace', 'normal');
        C.text(c, ['07 27 47', '12 32 52', '17 37 57'][r % 3], x + 196, yy, 10, '#c33', 'monospace', 'normal'); }
    }
    { // お知らせ: a paper notice
      const [x, y] = AR.notice; c.fillStyle = '#fffef7'; c.fillRect(x, y, 192, 270); c.strokeStyle = '#2f6fb5'; c.lineWidth = 3; c.strokeRect(x + 8, y + 8, 176, 254);
      C.text(c, 'お 知 ら せ', x + 96, y + 40, 22, '#1f4f8a', J); c.fillStyle = '#b8b8b2';
      for (let k = 0; k < 9; k++) c.fillRect(x + 24, y + 80 + k * 18, k % 3 === 2 ? 90 : 144, 5);
      C.text(c, '伊予鉄道', x + 160, y + 248, 11, '#555', J, 'normal', 'right');
    }
    { // 春の伊予路: blossom
      const [x, y] = AR.spring; c.fillStyle = '#dcebf7'; c.fillRect(x, y, 192, 270);
      for (let k = 0; k < 46; k++) { const a = k * 2.39, r = 20 + (k * 37 % 70); c.fillStyle = k % 3 ? '#f4b6c8' : '#f9d3de'; c.beginPath(); c.arc(x + 96 + Math.cos(a) * r, y + 96 + Math.sin(a) * r * 0.8, 9 + k % 4 * 2, 0, 7); c.fill(); }
      c.strokeStyle = '#7a5a48'; c.lineWidth = 6; c.beginPath(); c.moveTo(x + 18, y + 170); c.quadraticCurveTo(x + 80, y + 120, x + 150, y + 70); c.stroke();
      C.text(c, '春の伊予路', x + 96, y + 210, 24, '#b03a62', J); C.text(c, 'さくらめぐり', x + 96, y + 242, 15, '#555', J, 'normal');
    }
    { // 禁煙
      const [x, y] = AR.smoke; c.fillStyle = '#fff'; c.fillRect(x, y, 128, 128); c.fillStyle = '#ddd'; c.fillRect(x + 30, y + 52, 64, 12); c.fillStyle = '#e8a65a'; c.fillRect(x + 94, y + 52, 10, 12);
      c.strokeStyle = '#d42a24'; c.lineWidth = 9; c.beginPath(); c.arc(x + 64, y + 58, 40, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x + 36, y + 30); c.lineTo(x + 92, y + 86); c.stroke();
      C.text(c, '禁 煙', x + 64, y + 114, 18, '#d42a24', J);
    }
    { // 関係者以外 立入禁止: a white plate with a red band
      const [x, y] = AR.keep; c.fillStyle = '#fff'; c.fillRect(x, y, 256, 128); c.fillStyle = '#d42a24'; c.fillRect(x, y, 256, 44);
      C.text(c, '関係者以外', x + 128, y + 23, 28, '#fff', J); C.text(c, '立入禁止', x + 128, y + 88, 46, '#d42a24', J);
      c.strokeStyle = '#d42a24'; c.lineWidth = 4; c.strokeRect(x + 2, y + 2, 252, 124);
    }
    { // 坊っちゃん列車: the little green steam train through the city, a sky with the castle hill
      const [x, y] = AR.botchan, gr = c.createLinearGradient(0, y, 0, y + 192); gr.addColorStop(0, '#9fd2f0'); gr.addColorStop(1, '#e6f4fb');
      c.fillStyle = gr; c.fillRect(x, y, 288, 192); c.fillStyle = '#7fb27a'; c.beginPath(); c.ellipse(x + 210, y + 128, 90, 46, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#f4f1e8'; c.fillRect(x + 196, y + 70, 22, 14); c.fillStyle = '#56616b'; c.fillRect(x + 192, y + 64, 30, 7);   // the castle
      c.fillStyle = '#8a8e92'; c.fillRect(x, y + 150, 288, 6);
      c.fillStyle = '#2f5f3a'; c.fillRect(x + 40, y + 112, 70, 34); c.fillRect(x + 92, y + 98, 22, 48); c.fillStyle = '#222'; c.fillRect(x + 50, y + 92, 10, 22);
      c.fillStyle = '#b5652e'; c.fillRect(x + 122, y + 104, 92, 42); c.fillStyle = '#f6e7b8'; for (let k = 0; k < 4; k++) c.fillRect(x + 130 + k * 21, y + 112, 14, 12);
      c.fillStyle = '#1d1d1f'; for (const wx of [56, 82, 104, 138, 198]) { c.beginPath(); c.arc(x + wx, y + 148, 9, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,.85)'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + 58 - k * 12, y + 80 - k * 12, 9 + k * 3, 0, 7); c.fill(); }
      C.text(c, '坊っちゃん列車', x + 144, y + 30, 30, '#1f4f2e', J); C.text(c, '松山の街をゆく', x + 144, y + 178, 15, '#33503a', J, 'normal');
    }
    { // 道後温泉: the bathhouse roofs at dusk
      const [x, y] = AR.dogo, gr = c.createLinearGradient(0, y, 0, y + 192); gr.addColorStop(0, '#2b2a5a'); gr.addColorStop(1, '#c86a5a');
      c.fillStyle = gr; c.fillRect(x, y, 288, 192); c.fillStyle = '#3a2a24';
      for (const [w, yy] of [[200, 150], [150, 118], [100, 90], [46, 66]]) { c.beginPath(); c.moveTo(x + 144 - w / 2 - 14, y + yy); c.lineTo(x + 144 + w / 2 + 14, y + yy); c.lineTo(x + 144 + w / 2 - 6, y + yy - 18); c.lineTo(x + 144 - w / 2 + 6, y + yy - 18); c.fill(); }
      c.fillStyle = '#f2c46a'; for (let k = 0; k < 9; k++) c.fillRect(x + 56 + k * 20, y + 154, 10, 14); c.fillStyle = '#fff'; c.fillRect(x + 140, y + 40, 8, 8);   // the heron
      C.text(c, '道後温泉', x + 144, y + 26, 30, '#fff', J); C.text(c, '日本最古といわれる湯', x + 144, y + 182, 13, '#fff', J, 'normal');
    }
    { // 〒: a white plate with the red mark
      const [x, y] = AR.post; c.fillStyle = '#fbfaf6'; c.fillRect(x, y, 128, 128); C.text(c, '〒', x + 64, y + 68, 104, '#c8261e', 'sans-serif');
    }
    { // 愛媛のみかん
      const [x, y] = AR.mikan; c.fillStyle = '#fff6dc'; c.fillRect(x, y, 288, 192);
      for (let k = 0; k < 7; k++) { const mx = x + 40 + k * 36 + (k % 2) * 6, my = y + 112 + (k % 2) * 22; c.fillStyle = '#f39a1e'; c.beginPath(); c.arc(mx, my, 22, 0, 7); c.fill();
        c.fillStyle = '#f7b955'; c.beginPath(); c.arc(mx - 6, my - 7, 7, 0, 7); c.fill(); c.fillStyle = '#3f8a3a'; c.beginPath(); c.ellipse(mx + 8, my - 22, 11, 5, -0.5, 0, 7); c.fill(); }
      C.text(c, '愛媛のみかん', x + 144, y + 36, 32, '#e0701a', J); C.text(c, '伊予の国から', x + 144, y + 178, 15, '#6a5a3a', J, 'normal');
    }
  });
  const floorTex = tex(128, 128, (g, w, h) => {   // 30 cm grey tiles, 1 m per texture
    g.fillStyle = '#8c9193'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const k = 0.94 + ((i * 7 + j * 3) % 5) * 0.025; g.fillStyle = `rgb(${(176 * k) | 0},${(181 * k) | 0},${(183 * k) | 0})`; g.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); }
  }, true);
  floorTex.repeat.set(1 / 1.2, 1 / 1.2);   // 4 tiles per 1.2 m
  const lineTex = tex(64, 64, (g, w, h) => {   // linear guide block: four raised bars
    g.fillStyle = '#e3b126'; g.fillRect(0, 0, w, h); g.fillStyle = '#f6cf4a'; for (let k = 0; k < 4; k++) g.fillRect(6 + k * 15, 4, 7, h - 8);
  }, true);
  lineTex.repeat.set(1 / 0.3, 1 / 0.3);
  // the room's own light: a warm-white emissive; at night the outdoor (blue) light on these surfaces fades out, so the room reads lit from inside
  const warmLight = new T.Color(1.0, 0.86, 0.68);
  const glow = (color, o = {}) => C.toon(color, Object.assign({ emissive: new T.Color(color).multiply(warmLight), emissiveIntensity: 0.2 }, o));
  const RM = {
    wall: glow(0xf1eee5), ceil: glow(0xf7f7f3), skirt: glow(0x8b8d8c), floor: glow(0xffffff, { map: floorTex, emissiveMap: floorTex }),
    post: glow(0xffffff, { map: posterTex, emissiveMap: posterTex }), bench: glow(0xf4f4f1), dark: glow(0x3a3c42), counter: glow(0xd9dad6),
    guide: glow(0xffffff, { map: lineTex, emissiveMap: lineTex }), dots: glow(0xffffff, { map: tactTex, emissiveMap: tactTex }),
    alu: glow(0xb7bcc0), bin: glow(0x2e6fbf), ext: glow(0xc8322c),
    lamp: C.toon(0xfffdf6, { emissive: 0xfff1d8, emissiveIntensity: 0.9 }),
    clear: new T.MeshToonMaterial({ color: 0xd8e4e8, gradientMap: C.gradient, transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide }),
  };
  // outdoor posters, plates and clock faces: the same atlas, faintly lit at night (the platform lamps)
  const PM = C.nightGlow(C.toon(0xffffff, { map: posterTex, emissive: 0xfff4e2, emissiveMap: posterTex, emissiveIntensity: 0 }), 0.3);
  const roomLit = Object.keys(RM).filter((k) => k !== 'lamp' && k !== 'clear').map((k) => { RM[k].userData.base = RM[k].color.clone(); return RM[k]; });
  // the room's plain colours end up in one vertex-coloured material whose glow follows the vertex colour (one draw call, not nine)
  const RMV = new T.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: C.gradient, emissive: warmLight, emissiveIntensity: 0.2 });
  RMV.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;'); };
  RMV.userData.base = new T.Color(0xffffff); roomLit.push(RMV);
  const RM_PLAIN = new Set(['wall', 'ceil', 'skirt', 'bench', 'dark', 'counter', 'alu', 'bin', 'ext'].map((k) => RM[k]));
  const warmPoolMat = new T.MeshBasicMaterial({ map: poolTex, color: 0xffd9a0, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  function atlasQuad(parent, R, w, h, n, y, s, ry, mat = RM.post) {   // a poster: a quad cut from the atlas, facing rotation.y = ry
    const geo = new T.PlaneGeometry(w, h), uv = geo.attributes.uv;
    for (let i = 0; i < 4; i++) uv.setXY(i, (uv.getX(i) ? R[2] : R[0]) / ATLAS, 1 - (uv.getY(i) ? R[1] : R[3]) / ATLAS);
    const m = new T.Mesh(geo, mat); m.position.set(n, y, s); m.rotation.y = ry; m.receiveShadow = true; parent.add(m); return m;
  }
  function atlasDisc(parent, R, r, x, y, z, ry, mat) {   // a round face cut from the atlas (the clocks)
    const geo = new T.CircleGeometry(r, 28), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (R[0] + uv.getX(i) * (R[2] - R[0])) / ATLAS, 1 - (R[3] - uv.getY(i) * (R[3] - R[1])) / ATLAS);
    const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
  }
  // clocks: static faces and rims; the hands of every clock share one dynamic mesh, rebuilt as the game hour moves
  const clockFaces = [];
  function clockFace(parent, n, y, s, ry, r, faceMat, rimMat, y0 = 0, both = false) {   // y0: the parent's height in the station group
    const cg = new T.Group(); cg.position.set(n, y, s); cg.rotation.y = ry; parent.add(cg);
    const th = both ? 0.1 : 0.06, rim = new T.Mesh(new T.CylinderGeometry(r * 1.12, r * 1.12, th, 28), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.z = both ? 0 : th / 2; cg.add(rim);
    for (const d of both ? [1, -1] : [1]) {
      const zf = both ? th / 2 + 0.003 : th + 0.003;
      atlasDisc(cg, AR.clock, r, 0, 0, d * zf, d > 0 ? 0 : Math.PI, faceMat);
      clockFaces.push({ c: [n, y0 + y, s], ry: ry + (d > 0 ? 0 : Math.PI), r, z: zf + 0.004 });
    }
    return cg;
  }
  function clockHands(grp) {
    const nH = clockFaces.length * 2, pos = new Float32Array(nH * 12), nor = new Float32Array(nH * 12), idx = [];
    clockFaces.forEach((f, i) => { for (let h = 0; h < 2; h++) { const b = (i * 2 + h) * 4; for (let k = 0; k < 4; k++) nor.set([Math.sin(f.ry), 0, Math.cos(f.ry)], (b + k) * 3); idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); } });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setIndex(idx);
    const mesh = C.dynamic(new T.Mesh(geo, M.black)); mesh.frustumCulled = false; grp.add(mesh);
    let last = -1;
    C.onUpdate((dt, t, env) => {
      const hr = env.hour != null ? env.hour : 12, key = Math.round(hr * 600); if (key === last) return; last = key;
      clockFaces.forEach((f, i) => {
        const cx = Math.cos(f.ry), sx = -Math.sin(f.ry), cz = Math.sin(f.ry), sz = Math.cos(f.ry);   // the face's x axis and normal, in (n, s)
        [[(hr % 12) / 12 * Math.PI * 2, 0.55, 0.09], [(hr % 1) * Math.PI * 2, 0.82, 0.05]].forEach(([a, len, w], h) => {   // hour, minute
          const dx = Math.sin(a), dy = Math.cos(a), zo = f.z + h * 0.003;
          [[-0.12, -w / 2], [-0.12, w / 2], [len, -w / 2], [len, w / 2]].forEach(([u, v], k) => {   // along the hand, across it (× r)
            const lx = (dx * u + dy * v) * f.r, ly = (dy * u - dx * v) * f.r, o = ((i * 2 + h) * 4 + k) * 3;
            pos[o] = f.c[0] + cx * lx + cz * zo; pos[o + 1] = f.c[1] + ly; pos[o + 2] = f.c[2] + sx * lx + sz * zo;
          });
        });
      });
      geo.attributes.position.needsUpdate = true;
    });
  }
  function waitingRoom(g, o) {
    const { n0, n1, s1, sW, H, TW, fc, holes, yG } = o, nm = (n0 + n1) / 2, iN0 = n0 + TW, iN1 = n1 - TW, iS1 = s1 - TW, F = 0.1;   // inner faces, floor level
    // floor, ceiling, cream linings with a grey skirting board, the partition's face
    boxA(iN1 - iN0, 0.08, iS1 - sW, RM.floor, nm, F - 0.04, (sW + iS1) / 2, g, false);
    box(iN1 - iN0, 0.04, iS1 - sW, RM.ceil, nm, H - 0.02, (sW + iS1) / 2, g, false);
    const lin = [['track', 'n', sW, iS1, iN0, 1], ['front', 'n', sW, iS1, iN1, -1], ['south', 's', iN0, iN1, iS1, -1]];
    for (const [k, axis, a0, a1, face, inward] of lin) {
      for (const [lo, hi, th, mat] of [[F, H - 0.04, 0.035, RM.wall], [F, F + 0.09, 0.05, RM.skirt]])   // thicker than the outer walls' ink hull (0.025)
        for (const [u0, u1, y0, y1] of cover(a0, a1, lo, hi, holes[k])) {
          const c = face + inward * (th / 2 + 0.002), am = (u0 + u1) / 2;
          const h = y1 - y0 + 0.004, w = u1 - u0 + 0.004;   // strips overlap a little: no hairline cracks where they meet
          axis === 'n' ? box(th, h, w, mat, c, (y0 + y1) / 2, am, g, false) : box(w, h, th, mat, am, (y0 + y1) / 2, c, g, false);
        }
    }
    box(iN1 - iN0, H - 0.04 - F, 0.035, RM.wall, nm, (F + H - 0.04) / 2, sW + 0.0195, g, false);
    box(iN1 - iN0, 0.09, 0.05, RM.skirt, nm, F + 0.045, sW + 0.027, g, false);
    // two fluorescent fittings
    for (const sp of [12.6, 15.8]) { box(0.26, 0.06, 1.3, RM.counter, nm, H - 0.07, sp, g, false); box(0.16, 0.03, 1.2, RM.lamp, nm, H - 0.11, sp, g, false); }
    // the ticket window (closed: frosted glass) with its counter, the 窓口 plate and the fare chart; the clock; posters
    const sq = sW + 0.04, tw = 8.95;
    atlasQuad(g, AR.frost, 1.3, 0.8, tw, 1.42, sq, 0);
    for (const [w, h, dn, dy] of [[1.4, 0.05, 0, 0.425], [1.4, 0.05, 0, -0.425], [0.05, 0.9, 0.675, 0], [0.05, 0.9, -0.675, 0]]) box(w, h, 0.05, RM.alu, tw + dn, 1.42 + dy, sq + 0.02, g, false);
    box(1.6, 0.05, 0.34, RM.counter, tw, 0.98, sW + 0.18, g); box(1.5, 0.04, 0.04, RM.alu, tw, 0.96, sW + 0.35, g, false);
    atlasQuad(g, AR.mado, 0.8, 0.2, tw, 2.0, sq, 0);
    atlasQuad(g, AR.fare, 1.75, 0.525, tw, 2.5, sq, 0);
    atlasQuad(g, AR.rush, 0.5, 0.703, 11.05, 1.55, sq, 0); atlasQuad(g, AR.bag, 0.5, 0.703, 12.35, 1.55, sq, 0); atlasQuad(g, AR.smoke, 0.3, 0.3, 10.15, 1.7, sq, 0);
    clockFace(g, 11.7, 2.62, sW + 0.037, 0, 0.17, RM.post, RM.dark, yG);   // keeps the game's time
    // front wall, inside: the timetable north of the door, the sunset and IC posters south of it
    const fq = iN1 - 0.04;
    atlasQuad(g, AR.time, 0.8, 1.0, fq, 1.55, 11.3, -Math.PI / 2);
    atlasQuad(g, AR.sunset, 0.5, 0.703, fq, 1.6, 15.85, -Math.PI / 2); atlasQuad(g, AR.ic, 0.5, 0.703, fq, 1.6, 16.95, -Math.PI / 2);
    // south wall, inside: a notice and a spring poster over the second bench
    atlasQuad(g, AR.notice, 0.5, 0.703, 10.85, 1.85, iS1 - 0.04, Math.PI); atlasQuad(g, AR.spring, 0.5, 0.703, 12.2, 1.85, iS1 - 0.04, Math.PI);
    // white perforated benches: under the track-side windows, and along the south wall; you can sit on them
    const seat = (n, s, face) => {
      const b = new T.Group();
      for (let i = -1; i <= 1; i++) {
        const st = box(0.46, 0.05, 0.44, RM.bench, 0, 0.44, i * 0.52, b, false); C.outline(st, 0.01);
        const bk = box(0.05, 0.42, 0.44, RM.bench, -0.22, 0.68, i * 0.52, b, false); bk.rotation.z = 0.12;
      }
      for (const z of [-0.78, 0.78]) { box(0.4, 0.04, 0.04, RM.dark, 0, 0.4, z, b, false); for (const x of [-0.16, 0.16]) box(0.04, 0.4, 0.04, RM.dark, x, 0.2, z, b, false); }
      b.position.set(n, F, s); b.rotation.y = face; g.add(b);
      const fx = Math.cos(face), fs = -Math.sin(face);   // the bench's local +x (where you sit facing) in (n, s)
      (C.benches = C.benches || []).push({ obj: b, world: W(n + fx * 0.2, s + fs * 0.2), y: yG + F });
    };
    seat(iN0 + 0.3, 12.6, 0); seat(11.6, iS1 - 0.3, Math.PI / 2);
    // the yellow guide: from the doors to the ticket window, warning blocks where it turns and ends
    const gy = F + 0.006;
    { const m = boxA(iN1 - 0.6 - (tw + 0.15), 0.012, 0.3, RM.guide, (iN1 - 0.6 + tw + 0.15) / 2, gy, fc, g, false), uv = m.geometry.attributes.uv;
      for (let i = 8; i < 16; i++) uv.setXY(i, uv.getY(i), uv.getX(i)); }   // turn the bars to run along this leg too
    { const m = boxA(0.3, 0.012, fc - 0.15 - (sW + 0.75), RM.guide, tw, gy, (fc - 0.15 + sW + 0.75) / 2, g, false); }
    for (const [n, s] of [[iN1 - 0.3, fc], [tw, fc], [tw, sW + 0.6]]) boxA(0.3, 0.014, 0.3, RM.dots, n, gy + 0.001, s, g, false);
    // a bin and a fire extinguisher
    { const bin = C.cyl(0.18, 0.16, 0.62, RM.bin, 12, g); bin.position.set(iN0 + 0.3, F + 0.31, iS1 - 0.32); }
    { const ex = C.cyl(0.08, 0.08, 0.48, RM.ext, 10, g); ex.position.set(iN0 + 0.2, F + 0.26, sW + 0.3); }
    // see-through windows: aluminium frame, meeting stiles, a sill outside, clear glass
    const glassWin = (axis, cN, cS, out, y, w, h) => {
      const P = (u, yy, lw, lh, t, ld, mat) => {   // u along the wall, t across (outward +)
        const n = axis === 'n' ? cN + t * out : cN + u, s = axis === 'n' ? cS + u : cS + t * out;
        return axis === 'n' ? box(ld, lh, lw, mat, n, yy, s, g, false) : box(lw, lh, ld, mat, n, yy, s, g, false);
      };
      for (const d of [-1, 1]) { P(d * (w / 2 - 0.025), y, 0.05, h, 0, 0.1, RM.alu); P(0, y + d * (h / 2 - 0.025), w, 0.05, 0, 0.1, RM.alu); }
      P(-0.02, y, 0.04, h - 0.05, 0.02, 0.04, RM.alu); P(0.02, y, 0.04, h - 0.05, -0.02, 0.04, RM.alu);
      P(0, y - h / 2 - 0.05, w + 0.2, 0.05, TW / 2 + 0.06, 0.16, M.alu);
      const pane = new T.Mesh(new T.PlaneGeometry(w - 0.08, h - 0.08), RM.clear);
      pane.position.set(axis === 'n' ? cN : cN, y, axis === 'n' ? cS : cS); pane.rotation.y = axis === 'n' ? Math.PI / 2 : 0; g.add(pane);
    };
    for (const [u0, u1, y0, y1] of holes.track) glassWin('n', n0 + TW / 2, (u0 + u1) / 2, -1, (y0 + y1) / 2, u1 - u0, y1 - y0);
    for (const [u0, u1, y0, y1] of holes.south) glassWin('s', (u0 + u1) / 2, s1 - TW / 2, 1, (y0 + y1) / 2, u1 - u0, y1 - y0);
    // the glass entrance: frame, transom, two fixed side panes and two sliding leaves
    const dN = n1 - TW / 2, dTop = holes.front[0][3], dH = 2.0;
    box(TW, 0.06, 2.8, RM.alu, dN, dTop - 0.03, fc, g, false); box(TW, 0.05, 2.8, RM.alu, dN, dH + 0.025, fc, g, false); box(TW + 0.1, 0.02, 2.8, RM.alu, dN, F + 0.01, fc, g, false);
    for (const d of [-1, 1]) { box(TW, dTop - F, 0.05, RM.alu, dN, (dTop + F) / 2, fc + d * 1.375, g, false); box(0.05, dH - F, 0.05, RM.alu, dN + 0.03, (dH + F) / 2, fc + d * 0.78, g, false); }
    const pane = (parent, w, h, n, y, s) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), RM.clear); m.position.set(n, y, s); m.rotation.y = Math.PI / 2; parent.add(m); return m; };
    pane(g, 2.7, dTop - dH - 0.1, dN, (dTop + dH + 0.05) / 2, fc);
    for (const d of [-1, 1]) pane(g, 0.55, dH - F - 0.05, dN + 0.03, (dH + F) / 2, fc + d * 1.07);
    const leaves = [-1, 1].map((d) => {
      const lf = C.dynamic(new T.Group()); lf.position.set(dN - 0.03, 0, fc + d * 0.4); g.add(lf);
      for (const e of [-1, 1]) { box(0.04, dH - F, 0.05, RM.alu, 0, (dH + F) / 2, e * 0.375, lf, false); box(0.04, 0.06, 0.8, RM.alu, 0, e > 0 ? dH - 0.03 : F + 0.05, 0, lf, false); }
      box(0.06, 0.6, 0.025, RM.alu, 0, 1.0, -d * 0.3, lf, false);   // pull handle by the meeting edge
      pane(lf, 0.72, dH - F - 0.1, 0, (dH + F) / 2, 0);
      return { lf, d, s0: fc + d * 0.4 };
    });
    // warm light spilling out on to the porch tiles at night
    const pool = new T.Mesh(new T.PlaneGeometry(3.6, 3.0), warmPoolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(n1 + 1.5, 0.12, fc); g.add(pool);
    g.traverse((m) => { if (m.isMesh && RM_PLAIN.has(m.material)) { C.tint(m.geometry, m.material.userData.base.getHex()); m.material = RMV; } });
    let open = 0; const dW = W(n1, fc), V3 = new T.Vector3();
    C.onUpdate((dt, t, env) => {
      const night = env.night || 0, k = 0.18 + 0.4 * night, dim = 1 - 0.75 * night;
      for (const m of roomLit) { m.emissiveIntensity = k; m.color.copy(m.userData.base).multiplyScalar(dim); }
      RM.lamp.emissiveIntensity = 0.8 + 0.8 * night; RM.clear.opacity = 0.2 - 0.08 * night; warmPoolMat.opacity = 0.42 * night; warmPoolMat.visible = night > 0.01;   // (the street lamps' pools share it)
      // the doors slide open while someone stands near them
      const p = env.player && env.player.pos ? env.player.pos : env.camera ? env.camera.getWorldPosition(V3) : null;
      const near = p && Math.hypot(p.x - dW[0], p.z - dW[1]) < 2.4 ? 1 : 0;
      open = C.clamp(open + (near ? dt : -dt) * 1.6, 0, 1);
      for (const L of leaves) L.lf.position.z = L.s0 + L.d * 0.62 * C.smooth(0, 1, open);
    });
    return { leaves };
  }

  // ---------------- station house (photos: long slate roof along the track, steep entrance gable 「梅津寺駅」 facing the lot,
  // veranda on white posts, lap siding over a blue-grey skirt, mint fascia and barge boards) ----------------
  function stationHouse(grp, yG) {
    const g = new T.Group(); grp.add(g); g.position.y = yG;
    const n0 = 7.4, n1 = 13.6, s0 = 4.0, s1 = 18.0, H = 3.3, D = n1 - n0, L = s1 - s0, nm = (n0 + n1) / 2, sm = (s0 + s1) / 2;
    const p = 0.45, tp = Math.tan(p), yr = H + tp * (nm - n0), ob = 0.55, ofr = 1.6, og = 0.45;   // pitch, ridge, back / front (veranda) / gable overhangs
    const eB = yr - tp * (nm - n0 + ob), eF = yr - tp * (n1 + ofr - nm);
    const fc = 13.6, fw = 4.0, sW = 10.4, TW = 0.15;   // entrance centre / gable width; the waiting room runs from the partition at sW to the south gable
    // plinth; the office north of the partition is a solid box
    box(D + 0.3, 0.4, L + 0.3, M.conc, nm, -0.15, sm, g, false);
    const walls = boxM(D, H - 0.85, sW - s0, M.siding, nm, 0.85 + (H - 0.85) / 2, (s0 + sW) / 2, g); C.outline(walls, 0.025);
    box(D + 0.04, 0.85, sW - s0 + 0.02, M.skirt, nm, 0.425, (s0 - 0.02 + sW) / 2, g);   // (both stop at the partition: nothing pokes into the room)
    box(D + 0.07, 0.05, sW - s0 + 0.035, M.white, nm, 0.86, (s0 - 0.035 + sW) / 2, g, false);
    // the waiting room's outer walls, built around the entrance and the windows (photo "Inside")
    const holes = {
      track: [[10.6, 12.2, 1.175, 2.325], [13.0, 14.6, 1.175, 2.325]],   // two windows onto the tracks
      front: [[fc - 1.4, fc + 1.4, -0.3, 2.35]],                          // the glass entrance
      south: [[8.5, 9.9, 1.25, 2.25]],                                    // the gable-end window, onto the passenger crossing
    };
    // [along-range, outer face, inward direction] per wall; 'n' walls run along s, the south wall along n
    const RW = [['track', 'n', sW - 0.02, s1 - TW, n0, 1], ['front', 'n', sW - 0.02, s1 - TW, n1, -1], ['south', 's', n0, n1, s1, -1]];
    const piece = (axis, a0, a1, y0, y1, face, inward, t, out, mat, sh = true) => {   // a wall slab, metre UVs from absolute coords
      const c = face + inward * (t / 2 - out), am = (a0 + a1) / 2, ym = (y0 + y1) / 2, la = a1 - a0;
      return axis === 'n' ? boxA(t, y1 - y0, la, mat, c, ym, am, g, sh) : boxA(la, y1 - y0, t, mat, am, ym, c, g, sh);
    };
    for (const [k, axis, a0, a1, face, inward] of RW) {
      for (const [u0, u1, y0, y1] of cover(a0, a1, 0, H, holes[k])) {
        if (y1 > 0.85) C.outline(piece(axis, u0, u1, Math.max(y0, 0.85), y1, face, inward, TW, 0, M.siding), 0.025);
        if (y0 < 0.85) piece(axis, u0, u1, y0, Math.min(y1, 0.85), face, inward, TW + 0.02, 0.02, M.skirt);
      }
      for (const [u0, u1, y0, y1] of cover(a0, a1, 0.835, 0.885, holes[k])) piece(axis, u0, u1, y0, y1, face, inward, 0.05, 0.035, M.white, false);
    }
    // main roof: back slope + front slope continuing over the veranda; ridge cap, mint fascia, barge boards, gutter
    for (const [na, nb, ya, yb] of [[n0 - ob, nm, eB, yr], [nm, n1 + ofr, yr, eF]]) {
      const len = Math.hypot(nb - na, yb - ya), r = boxM(len + 0.05, 0.14, L + 2 * og, M.slate, (na + nb) / 2, (ya + yb) / 2 + 0.08, sm, g);
      r.rotation.z = Math.atan2(yb - ya, nb - na); C.outline(r, 0.025);
      for (const sg of [s0 - og, s1 + og]) { const bb = box(len + 0.05, 0.24, 0.06, M.mint, (na + nb) / 2, (ya + yb) / 2 + 0.04, sg, g, false); bb.rotation.z = r.rotation.z; }
    }
    box(0.34, 0.12, L + 2 * og + 0.04, M.dark, nm, yr + 0.16, sm, g);
    box(0.06, 0.24, L + 2 * og, M.mint, n0 - ob - 0.02, eB - 0.02, sm, g, false);
    box(0.06, 0.24, L + 2 * og, M.mint, n1 + ofr + 0.02, eF - 0.02, sm, g, false);
    box(0.13, 0.11, L + 2 * og, M.alu, n0 - ob + 0.02, eB - 0.18, sm, g, false);
    for (const sp of [s0 + 0.25, s1 - 0.25]) cylY(0.04, eB, M.alu, n0 - 0.08, eB / 2 - 0.1, sp, g, 6);
    // gable ends (siding triangles) with round vents
    const tri = new T.Shape([new T.Vector2(-D / 2, 0), new T.Vector2(D / 2, 0), new T.Vector2(0, yr - H)]);
    for (const [sg, ry] of [[s0, Math.PI], [s1, 0]]) {
      const m = new T.Mesh(new T.ShapeGeometry(tri), M.siding); m.position.set(nm, H, sg + (ry ? -0.005 : 0.005)); m.rotation.y = ry; g.add(m);
      const v = cylY(0.2, 0.05, M.alu, nm, H + 0.62, sg + (ry ? -0.02 : 0.02), g, 16); v.rotation.x = Math.PI / 2;
    }
    // entrance cross-gable toward the lot: steep white pediment with the name, mint rakes, two posts, glass doors
    const fn1 = n1 + 2.4, Hf = 2.6, half = fw / 2 + 0.3, peak = yr - 0.06, fp = Math.atan((peak - Hf) / half);   // peak just under the main ridge
    // each slope stops at the valley where it meets the main roof (u = distance from its ridge), so none of it hangs into the waiting room
    const nV = (u) => nm + (yr - peak + (peak - Hf) * C.clamp(u, 0, half) / half) / tp - 0.15, Ls = half / Math.cos(fp) + 0.05;
    for (const d of [-1, 1]) {
      const nB = nV(0), fl = fn1 + 0.3 - nB, cx = nB + fl / 2;
      const r = boxM(fl, 0.14, Ls, M.slate, cx, (peak + Hf) / 2 + 0.08, fc + d * half / 2, g), gp = r.geometry.attributes.position, uv = r.geometry.attributes.uv;
      for (let i = 0; i < gp.count; i++) if (gp.getX(i) < 0) {   // the back end follows the valley; the roof faces keep metre UVs
        const x = nV((d * gp.getZ(i) + Ls / 2) * Math.cos(fp)) - cx; gp.setX(i, x);
        if ((i >> 2) === 2 || (i >> 2) === 3) uv.setX(i, x + fl / 2);
      }
      r.geometry.computeVertexNormals();
      r.rotation.x = d * fp; C.outline(r, 0.025);
      const bb = box(0.06, 0.24, half / Math.cos(fp) + 0.05, M.mint, fn1 + 0.32, (peak + Hf) / 2 + 0.04, fc + d * half / 2, g, false); bb.rotation.x = d * fp;
    }
    const ped = new T.Mesh(new T.ShapeGeometry(new T.Shape([new T.Vector2(-fw / 2 - 0.1, 0), new T.Vector2(fw / 2 + 0.1, 0), new T.Vector2(0, peak - Hf - 0.2)])), M.siding);
    ped.position.set(fn1 + 0.1, Hf, fc); ped.rotation.y = Math.PI / 2; g.add(ped);
    box(0.02, peak - Hf - 0.35, 0.03, C.toon(0xdcdbd4), fn1 + 0.12, Hf + (peak - Hf - 0.35) / 2, fc, g, false);   // board seam
    box(0.3, 0.32, fw + 0.5, M.white, fn1 - 0.02, Hf - 0.05, fc, g);
    box(0.05, 0.12, fw + 0.5, M.mint, fn1 + 0.14, Hf - 0.24, fc, g, false);
    box(fn1 - n1, 0.04, fw, M.offwhite, (n1 + fn1) / 2, Hf - 0.22, fc, g, false);   // porch ceiling
    const name = textBoard(2.4, 0.52, (c, w2, h2) => { c.clearRect(0, 0, w2, h2); C.text(c, '梅 津 寺 駅', w2 / 2, h2 / 2, h2 * 0.8, '#2d5f9e'); });
    name.material.transparent = true; name.position.set(fn1 + 0.13, Hf + 0.62, fc); name.rotation.y = Math.PI / 2; g.add(name);
    for (const d of [-1, 1]) { const pst = cylY(0.11, Hf - 0.55, M.white, fn1 - 0.25, 0.55 + (Hf - 0.55) / 2, fc + d * (fw / 2 - 0.2), g, 10); C.outline(pst, 0.012); cylY(0.13, 0.55, M.base, fn1 - 0.25, 0.275, fc + d * (fw / 2 - 0.2), g, 10); }
    box(0.5, 0.06, 0.5, lampMat, n1 + 1.2, Hf - 0.25, fc, g, false);
    { const ic = new T.Group(); box(0.12, 1.0, 0.12, M.alu, 0, 0.5, 0, ic); box(0.3, 0.16, 0.24, M.offwhite, 0, 1.08, 0, ic); box(0.2, 0.02, 0.16, C.toon(0x56b6e8), 0, 1.17, 0, ic, false); ic.position.set(n1 + 1.1, 0.1, fc + 1.0); g.add(ic); }   // IC reader 出場
    // veranda posts (north of the entrance) and the flat portico (south of it, toward platform 1)
    for (let sp = s0 + 0.3; sp < fc - fw / 2 - 0.3; sp += 3.1) { const pst = cylY(0.09, eF - 0.5, M.white, n1 + ofr - 0.15, 0.5 + (eF - 0.5) / 2, sp, g, 10); C.outline(pst, 0.01); cylY(0.11, 0.5, M.base, n1 + ofr - 0.15, 0.25, sp, g, 10); }
    { const pa = fc + fw / 2 + 0.25, pb = s1 + 0.8, Hp = eF - 0.12;
      box(fn1 - n1 + 0.2, 0.16, pb - pa, M.white, (n1 + fn1) / 2, Hp, (pa + pb) / 2, g);
      box(0.06, 0.24, pb - pa, M.mint, fn1 + 0.12, Hp - 0.02, (pa + pb) / 2, g, false);
      for (const sp of [pa + 1.2, pb - 0.25]) { cylY(0.09, Hp - 0.5, M.white, fn1 - 0.25, 0.5 + (Hp - 0.5) / 2, sp, g, 10); cylY(0.11, 0.5, M.base, fn1 - 0.25, 0.25, sp, g, 10); } }
    // tiled walk under the veranda / porch / portico
    { const tile = panelTex.clone(); tile.needsUpdate = true; tile.repeat.set(3, 3); const tm = C.toon(0xd9d9d6, { map: tile });
      boxM(fn1 - n1 + 0.3, 0.12, L + 2.4, tm, (n1 + fn1) / 2 + 0.15, 0.04, sm + 0.6, g, false); }
    // windows: waiting room on the track side, two tall ones on the front, one in each gable end
    for (const sp of [6.6, 9.0]) houseWindow(g, 'n', -1, n0 - 0.005, 1.75, sp, 1.6, 1.15);
    for (const sp of [6.0, 8.6]) houseWindow(g, 'n', 1, n1 + 0.005, 1.7, sp, 0.9, 1.75);
    houseWindow(g, 's', -1, 9.2, 1.75, s0 - 0.005, 1.4, 1.0);
    const room = waitingRoom(g, { n0, n1, s1, sW, H, TW, fc, holes, yG });
    // air-conditioner on the north end, vending machines + bin by the door, bicycles under the veranda
    { const ac = box(0.82, 0.62, 0.3, M.offwhite, 12.3, 0.45, s0 - 0.2, g); const fan = new T.Mesh(new T.CircleGeometry(0.21, 16), M.dark); fan.position.set(12.18, 0.46, s0 - 0.36); fan.rotation.y = Math.PI; g.add(fan); box(0.06, 0.3, 0.06, M.alu, 12.3, 0.08, s0 - 0.2, g, false); ac.castShadow = true; }
    [[0xf4f4f0, fc - fw / 2 - 0.75], [0xd8342c, fc - fw / 2 - 1.8]].forEach(([c, sp]) => { const v = vending(c); v.position.set(n1 + 0.45, 0.1, sp); v.rotation.y = Math.PI / 2; g.add(v); });
    cylY(0.2, 0.7, C.toon(0x2e6fbf), n1 + 0.35, 0.45, fc - fw / 2 - 2.6, g, 10);
    for (const sp of [4.9, 5.6, 6.3]) bicycle(g, n1 + 0.9, sp);
    // collider (walls) + the walk deck
    const col = (n, s, hn, hs) => { const [x, z] = W(n, s); C.addCollider(x, z, hn, hs, rot); };
    col(nm, (s0 + sW) / 2, D / 2, (sW - s0) / 2); col(n0 + TW / 2, (sW + s1) / 2, TW / 2, (s1 - sW) / 2); col(nm, s1 - TW / 2, D / 2, TW / 2);
    col(n1 - TW / 2, (sW + fc - 1.4) / 2, TW / 2, (fc - 1.4 - sW) / 2); col(n1 - TW / 2, (fc + 1.4 + s1) / 2, TW / 2, (s1 - fc - 1.4) / 2);
    C.addDeck(...W(nm, (sW + s1) / 2), D / 2 - TW, (s1 - sW) / 2 - TW, yG + 0.1, yG + 0.1, rot);
    C.addDeck(...W((n1 + fn1) / 2 + 0.15, sm + 0.6), (fn1 - n1 + 0.3) / 2, (L + 2.4) / 2, yG + 0.1, yG + 0.1, rot);
    return { g, front: fn1, fc, s0, s1, n0, n1, room };
  }
  // pollarded street tree (photos: straight trunk, dense leaf clusters along its upper half: a narrow, columnar crown)
  const clumpGeo = new T.IcosahedronGeometry(1, 1);
  function leafyTree(grp, n, s, seed) {
    const r = (k) => C.noise(seed * 7.13 + k * 1.7, seed * 3.1), y = C.groundH(...W(n, s)), h = 4.4 + r(0) * 0.8;
    const tr = C.cyl(0.1, 0.15, h, M.trunk, 7, grp); tr.position.set(n, y + h / 2, s);
    const ring = new T.Mesh(new T.CircleGeometry(0.55, 12), C.toon(0x7e9a5a)); ring.rotation.x = -Math.PI / 2; ring.position.set(n, y + 0.03, s); grp.add(ring);
    for (let k = 0; k < 10; k++) {
      const f = k / 9, a = k * 2.39 + r(k) * 0.8, d = (0.25 + r(k + 9) * 0.35) * (1 - f * 0.5), cs = 0.42 + r(k + 3) * 0.28 + (1 - Math.abs(f - 0.55) * 1.6) * 0.12;
      const m = new T.Mesh(clumpGeo, (k + seed) % 3 ? M.leaf2 : M.leaf1); m.scale.set(cs, cs * 0.85, cs);
      m.position.set(n + Math.cos(a) * d, y + h * (0.5 + f * 0.52), s + Math.sin(a) * d); m.castShadow = true; grp.add(m);
    }
  }
  // Japanese black pine: a curving trunk, branches ending in flat foliage pads at several heights
  function pineTree(grp, n, s, sc, seed) {
    const r = (k) => C.noise(seed * 5.7 + k * 1.3, seed * 2.9), y = C.groundH(...W(n, s)), pts = [[n, y, s]];
    let px = n, py = y, pz = s, dirN = (r(1) - 0.5) * 0.7, dirS = (r(2) - 0.5) * 0.7;
    for (let k = 0; k < 4; k++) {
      const len = (1.7 - k * 0.2) * sc; dirN += (r(k + 3) - 0.5) * 0.5; dirS += (r(k + 13) - 0.5) * 0.5;
      const nx = px + dirN * len * 0.6, ny = py + len, nz = pz + dirS * len * 0.6;
      const v = new T.Vector3(nx - px, ny - py, nz - pz), L = v.length(), seg = C.cyl(0.09 * sc * (1 - k * 0.18), 0.13 * sc * (1 - k * 0.18), L, M.pineBark, 6, grp);
      seg.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2); seg.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize());
      px = nx; py = ny; pz = nz; pts.push([px, py, pz]);
    }
    for (let k = 0; k < 9; k++) {
      const base = pts[2 + (k % 3)], a = k * 2.3 + r(k + 7) * 1.4, d = (k < 2 ? 0.2 : 0.7 + r(k) * 0.9) * sc, pw = (0.55 + r(k + 4) * 0.4) * sc;
      const m = new T.Mesh(clumpGeo, M.pine); m.scale.set(pw, 0.26 * sc, pw * 0.8); m.rotation.y = a;
      m.position.set(base[0] + Math.cos(a) * d, base[1] + (k < 2 ? 0.3 : -0.2 + r(k + 11) * 0.5) * sc, base[2] + Math.sin(a) * d); m.castShadow = true; grp.add(m);
      if (d > 0.5) { const br = C.cyl(0.03 * sc, 0.05 * sc, d, M.pineBark, 5, grp); br.position.set(base[0] + Math.cos(a) * d / 2, m.position.y - 0.08, base[2] + Math.sin(a) * d / 2); br.rotation.set(0, -a, Math.PI / 2); }
    }
  }
  function cone(grp, n, s) {   // traffic cone (the lot is roped off with them)
    const y = C.groundH(...W(n, s)), g = new T.Group();
    box(0.36, 0.04, 0.36, M.dark, 0, 0.02, 0, g, false);
    const c = C.cyl(0.03, 0.15, 0.62, M.cone, 10, g); c.position.y = 0.33;
    const band = C.cyl(0.075, 0.1, 0.12, M.white, 10, g); band.position.y = 0.36;
    g.position.set(n, y, s); grp.add(g);
  }
  function bicycle(parent, n, s) {
    const g = new T.Group(), mat = C.toon([0x3a6fa8, 0xb0322c, 0x777777][Math.floor(s * 2) % 3]), tire = M.dark;
    for (const z of [-0.5, 0.5]) { const w = new T.Mesh(new T.TorusGeometry(0.32, 0.03, 6, 16), tire); w.position.set(0, 0.34, z); w.rotation.y = Math.PI / 2; g.add(w); }
    const f1 = box(0.03, 0.03, 0.85, mat, 0, 0.62, 0, g); f1.rotation.x = 0.1;
    box(0.03, 0.55, 0.03, mat, 0, 0.55, -0.1, g); box(0.4, 0.03, 0.03, M.dark, 0, 0.95, 0.42, g); box(0.12, 0.04, 0.22, M.dark, 0, 0.85, -0.15, g);
    g.position.set(n, 0, s); g.rotation.y = 0.25; parent.add(g);
  }

  // ---------------- level crossing (photos: barrier machines, X signals, stone panels) ----------------
  function crossingSignal() {
    const g = new T.Group(), stripes = C.signTexture(32, 256, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#111' : '#f2c230'; c.fillRect(0, i * 32, w, 32); } });
    const pole = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 3.8, 8), C.toon(0xffffff, { map: stripes })); pole.position.y = 1.9; g.add(pole); C.outline(pole, 0.015);
    const xTex = C.signTexture(128, 32, (c, w, h) => { c.fillStyle = '#f2c230'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(i * 26, 0); c.lineTo(i * 26 + 13, 0); c.lineTo(i * 26 + 3, h); c.lineTo(i * 26 - 10, h); c.fill(); } });
    for (const a of [0.62, -0.62]) { const b = new T.Mesh(new T.BoxGeometry(1.15, 0.17, 0.03), C.toon(0xffffff, { map: xTex })); b.position.y = 3.35; b.rotation.z = a; g.add(b); }
    const lamps = [];
    for (const side of [1, -1]) for (const x of [-0.34, 0.34]) {
      const m = C.toon(0x4a1210, { emissive: 0xff2a1a, emissiveIntensity: 0 });
      const l = new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 0.1, 14), m); l.rotation.x = Math.PI / 2; l.position.set(x, 2.7, side * 0.08); g.add(l);
      const hood = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.16, 14, 1, true, 0, Math.PI), M.black); hood.rotation.set(Math.PI / 2, 0, 0); hood.position.set(x, 2.72, side * 0.16); g.add(hood);
      lamps.push(m);
    }
    box(0.95, 0.09, 0.09, M.black, 0, 2.7, 0, g);
    const arrow = textBoard(0.42, 0.22, (c, w, h) => { c.fillStyle = '#111'; c.fillRect(0, 0, w, h); C.text(c, '⇦ ⇨', w / 2, h / 2, h * 0.8, '#ffe066'); }, 0.6);
    arrow.position.set(0, 2.32, 0.08); g.add(arrow);
    cylY(0.14, 0.26, M.black, 0, 3.86, 0, g, 12);   // bell
    return { group: g, lamps };
  }
  function barrierMachine(len) {
    const g = new T.Group(), arm = C.dynamic(new T.Group());
    const stripes = C.signTexture(256, 16, (c, w, h) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#111' : '#f2c230'; c.fillRect(i * 16, 0, 16, h); } });
    const body = box(0.42, 1.05, 0.42, M.yellow, 0, 0.53, 0, g); C.outline(body, 0.015);
    for (let k = 0; k < 3; k++) box(0.43, 0.12, 0.43, M.black, 0, 0.2 + k * 0.3, 0, g, false);
    box(0.5, 0.06, 0.5, M.dark, 0, 1.08, 0, g);
    const bar = new T.Mesh(new T.BoxGeometry(len, 0.08, 0.08), C.toon(0xffffff, { map: stripes })); bar.position.x = len / 2; arm.add(bar);
    for (let k = 0.5; k < len; k += 1.0) box(0.02, 0.35, 0.02, M.yellow, k, -0.2, 0, arm, false);
    arm.position.y = 0.95; g.add(arm);
    return { group: g, arm };
  }

  // ---------------- 構内踏切: the passenger crossing at the platforms' north ends ----------------
  // (photos: concrete slabs across both tracks from ramp foot to ramp foot, yellow-and-black posts, and the walk past the
  // south end of the station house to its portico). terrain.js raises the ground to rail-head level under it.
  const stripeTex = tex(32, 128, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#141416' : '#f2c230'; c.fillRect(0, i * 16, w, 16); } });
  function passengerCrossing(grp, P1, P2) {
    const Z = C.stationZone, S = Z.PXS, Wd = 2 * Z.PXW, tW = ST.n0 - ST.half, tE = ST.n0 + ST.half, y = railY(S), g = new T.Group(); grp.add(g);
    // slabs inside each gauge, between and beside the tracks; the gaps are the flangeways
    for (const [a, b] of [[tW - 1.37, tW - 0.617], [tW - 0.47, tW + 0.47], [tW + 0.617, tE - 0.617], [tE - 0.47, tE + 0.47], [tE + 0.617, tE + 1.37]])
      boxM(b - a, 0.12, Wd, M.panel, (a + b) / 2, y - 0.066, S, g, false).receiveShadow = true;
    // concrete walks out to the ramp feet (west: on to the sea-wall coping), warning blocks before the tracks
    for (const [a, b] of [[NW - 0.15, tW - 1.37], [tE + 1.37, P1.no]]) boxM(b - a, 0.3, Wd, M.conc, (a + b) / 2, y - 0.168, S, g, false).receiveShadow = true;
    const tm = C.toon(0xffffff, { map: tactTex });
    for (const n of [tW - 1.37 - 0.33, tE + 1.37 + 0.33]) boxM(0.3, 0.02, Wd - 0.3, tm, n, y - 0.009, S, g, false);
    // the walk east, past the house's south end to the portico, on the ground as it eases down
    sheet(10, 1, (i, j) => { const n = C.lerp(P1.no, 13.62, i / 10), sp = S - Wd / 2 + Wd * j; return [n, C.groundH(...W(n, sp)) + 0.03, sp, n, sp]; }, M.conc, g);
    // posts at both ends: yellow and black, a red lamp that blinks with the crossing bell, 「とまれ 列車に注意」
    const post = C.toon(0xffffff, { map: stripeTex }), lamps = [];
    const board = () => textBoard(0.4, 0.52, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#d42a24'; c.fillRect(0, 0, w, h * 0.42); C.text(c, 'とまれ', w / 2, h * 0.22, h * 0.25, '#fff'); C.text(c, '列車に注意', w / 2, h * 0.7, h * 0.15, '#1c1c1c'); }, 0.2);
    for (const [n, sp, face] of [[P1.no + 0.28, S - Z.PXW - 0.18, Math.PI / 2], [P2.no - 0.4, S - Z.PXW - 0.18, 0]]) {
      const yG = C.groundH(...W(n, sp)), pg = new T.Group(); pg.position.set(n, yG, sp); pg.rotation.y = face; g.add(pg);
      const pl = cylY(0.05, 1.55, post, 0, 0.775, 0, pg, 10); C.outline(pl, 0.01);
      const m = C.toon(0x4a1210, { emissive: 0xff2a1a, emissiveIntensity: 0 }); lamps.push(m);
      const l = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, 0.07, 14), m); l.rotation.x = Math.PI / 2; l.position.set(0, 1.62, 0); pg.add(l);
      const hood = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.12, 14, 1, true, 0, Math.PI), M.black); hood.rotation.x = Math.PI / 2; hood.position.set(0, 1.64, 0); pg.add(hood);
      const b = board(); b.position.set(0, 1.08, 0.06); pg.add(b);
    }
    // two lamps light the crossing at night, one at each end, leaning over it
    for (const [n, sp, dir] of [[P1.no + 0.5, S + Z.PXW + 0.45, -1], [NW + 0.25, S + Z.PXW + 0.45, 1]]) {
      const yG = C.groundH(...W(n, sp)), lg = new T.Group(); lg.position.set(n, yG, sp); g.add(lg);
      const pole = cylY(0.055, 3.8, M.white, 0, 1.9, 0, lg, 8); C.outline(pole, 0.012);
      box(1.1, 0.05, 0.05, M.white, dir * 0.55, 3.78, 0, lg); box(0.22, 0.09, 1.1, M.white, dir * 1.1, 3.72, 0, lg); box(0.16, 0.03, 1.0, lampMat, dir * 1.1, 3.67, 0, lg, false);
      const h = C.makeHalo(3.0, 0xdcecff, 0.4); h.position.set(dir * 1.1, 3.55, 0); lg.add(h);
      lightPool(grp, n + dir * 2.6, y, S, 2.8);
    }
    return lamps;
  }

  // ---------------- catenary portals (concrete poles + steel beam), wires with droppers ----------------
  function catenary(grp, portals, P1, P2) {
    const tracks = [ST.n0 + ST.half, ST.n0 - ST.half], wires = [];
    const poleL = new T.CylinderGeometry(0.13, 0.19, 8.2, 8); poleL.translate(0, 4.1, 0);
    for (const s of portals) {
      const onP1 = s >= P1.s0 && s <= P1.s1, onP2 = s >= P2.s0 && s <= P2.s1;
      const nE = onP1 ? P1.no + 0.45 : ST.n0 + 4.2, nWl = NW + 0.35;
      const yE = onP1 ? P1.yAt(s) : railY(s) - 0.75, yW = onP2 ? P2.yAt(s) : railY(s) - 0.4;
      for (const [n, y] of [[nE, yE], [nWl, yW]]) { const m = new T.Mesh(poleL, M.pole); m.position.set(n, y - 0.1, s); m.castShadow = true; grp.add(m); }
      const top = railY(s) + 7.2, span = nE - nWl;
      box(span + 0.4, 0.26, 0.18, M.steel, (nE + nWl) / 2, top, s, grp);
      box(span + 0.2, 0.06, 0.06, M.steel, (nE + nWl) / 2, top - 0.35, s, grp);
      for (const nt of tracks) { box(0.05, 1.3, 0.05, M.steel, nt, top - 0.8, s, grp, false); const reg = box(0.9, 0.04, 0.04, M.steel, nt + 0.4, railY(s) + 5.3, s, grp, false); reg.rotation.z = 0.15; }
    }
    for (const nt of tracks) for (let k = 0; k < portals.length - 1; k++) {
      const a = portals[k], b = portals[k + 1];
      for (let i = 0; i < 12; i++) {
        const f0 = i / 12, f1 = (i + 1) / 12, sa = C.lerp(a, b, f0), sb = C.lerp(a, b, f1), sag = (f) => -Math.sin(f * Math.PI) * 0.55;
        wires.push(nt, railY(sa) + 5.1, sa, nt, railY(sb) + 5.1, sb);
        wires.push(nt, railY(sa) + 6.4 + sag(f0), sa, nt, railY(sb) + 6.4 + sag(f1), sb);
      }
    }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(wires, 3));
    grp.add(new T.LineSegments(lg, WIRE));
  }
  function signal(grp, n, s, y, face) {   // starting signal: black head with three lamps, red lit
    const g = new T.Group();
    cylY(0.07, 4.2, M.steel, 0, 2.1, 0, g, 8);
    const head = box(0.42, 1.0, 0.18, M.black, 0, 4.0, 0, g); C.outline(head, 0.015);
    [0x2bd96a, 0xf2b52a, 0xff3020].forEach((c, i) => { const m = C.toon(0x220a08, { emissive: c, emissiveIntensity: i === 2 ? 1.4 : 0.03 }); const l = new T.Mesh(new T.CircleGeometry(0.1, 14), m); l.position.set(0, 4.32 - i * 0.3, 0.1); g.add(l); });
    const h = C.makeHalo(1.2, 0xff4030, 0.9); h.position.set(0, 3.72, 0.2); g.add(h);
    g.position.set(n, y, s); g.rotation.y = face; grp.add(g);
  }

  // ======================================================================
  // ---------------- beach and sea-wall details ----------------
  // the small things share one vertex-coloured material (one draw call per tile once merged); a private random keeps the town's C.rand untouched
  const VC = new T.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: C.gradient });
  const hrand = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const stainTex = tex(16, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(38,44,36,.6)'); gr.addColorStop(1, 'rgba(38,44,36,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const stainMat = new T.MeshBasicMaterial({ map: stainTex, transparent: true, depthWrite: false, side: T.DoubleSide });
  function vcMesh(geo, hex, parent, shadow = false) { const m = new T.Mesh(C.tint(geo, hex), VC); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; }
  function rock(parent, n, y, s, r, k, hex) {   // a rounded, lumpy stone
    const geo = new T.IcosahedronGeometry(1, 1), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const f = 0.8 + 0.4 * C.noise(pos.getX(i) * 1.7 + k * 3.1, pos.getY(i) * 1.7 + pos.getZ(i) * 1.3 + k); pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f); }
    geo.computeVertexNormals();
    const m = vcMesh(geo, hex, parent, true); m.scale.set(r * (0.9 + 0.3 * hrand(k)), r * (0.62 + 0.25 * hrand(k + 1)), r * (0.8 + 0.3 * hrand(k + 2))); m.rotation.y = hrand(k + 3) * 6.28; m.position.set(n, y, s);
    if (r > 0.45) { const [x, z] = W(n, s); C.addCollider(x, z, r * 0.75, r * 0.75, rot); }
    return m;
  }
  function beachDetails(grp, ws0, ws1, wTop, beachY, stairs) {
    const gH = (n, s) => C.groundH(...W(n, s));
    const faceN = (s, y) => { const yt = wTop(s) - 0.18, yb = beachY(s); return NW - 0.9 - 0.45 * C.clamp((yt - y) / (yt - yb), 0, 1); };   // the battered wall face
    const nearStairs = (s, m) => s > stairs[0] - m && s < stairs[1] + m;
    // weep pipes: grey stubs every 4 m (a second row higher up, staggered), each with a dark stain running down
    for (let s = ws0 + 3, k = 0; s < ws1 - 2; s += 2, k++) {
      const y = gH(NW - 1.6, s) + (k % 2 ? 2.1 : 0.75);
      if (nearStairs(s, 1.5) || y > wTop(s) - 0.6) continue;
      const n = faceN(s, y), pp = C.cyl(0.055, 0.055, 0.2, M.grey, 8, grp); pp.rotation.z = Math.PI / 2; pp.position.set(n - 0.06, y, s); pp.castShadow = false;
      const hole = new T.Mesh(new T.CircleGeometry(0.04, 8), M.dark); hole.rotation.y = -Math.PI / 2; hole.position.set(n - 0.162, y, s); grp.add(hole);
      const L = 0.55 + 0.35 * hrand(k);
      sheet(1, 1, (i, j) => { const yy = y - 0.03 - j * L, ss = s + (i - 0.5) * (0.12 + j * 0.05); return [faceN(ss, yy) - 0.012, yy, ss, i, 1 - j]; }, stainMat, grp);
    }
    // the wrack line: seaweed and bleached driftwood where the high tide stops (sand ≈ 0.95 m), rocks at the wall foot and in the shallows
    const tideN = (s, lvl) => { for (let d = 1.6; d < 30; d += 0.25) if (gH(NW - d, s) < lvl) return NW - d; return null; };
    for (let s = 24, k = 0; s < ws1 - 3; s += 0.8 + 1.0 * hrand(k * 7), k++) {
      const nt = tideN(s, 0.92 + 0.12 * hrand(k));
      if (nearStairs(s, 0.6) || nt === null) continue;
      for (let j = 0, nb = 2 + Math.floor(hrand(k + 3) * 4); j < nb; j++) {   // a loose cluster: thin strands and small clumps
        const kk = k * 7 + j, n = nt + (hrand(kk + 50) - 0.5) * 0.9, ss = s + (hrand(kk + 60) - 0.5) * 0.8, strand = hrand(kk + 70) < 0.6;
        const m = vcMesh(new T.IcosahedronGeometry(1, 0), [0x4d4a2a, 0x5e4a30, 0x3f4a2c, 0x8a7a58, 0x6b5a36][kk % 5], grp);
        m.scale.set(strand ? 0.2 + 0.25 * hrand(kk + 9) : 0.07 + 0.09 * hrand(kk + 9), 0.02 + 0.015 * hrand(kk + 5), strand ? 0.025 + 0.025 * hrand(kk + 11) : 0.05 + 0.08 * hrand(kk + 11));
        m.rotation.y = hrand(kk + 13) * 6.28; m.position.set(n, gH(n, ss) + 0.01, ss);
      }
      const n = nt;
      if (k % 9 === 4) {   // a driftwood log, sometimes with a stub of branch
        const L = 0.8 + 1.4 * hrand(k + 17), r = 0.05 + 0.06 * hrand(k + 19), lg = new T.Group(); lg.position.set(n + 0.4, gH(n + 0.4, s) + r * 0.7, s); lg.rotation.y = hrand(k + 23) * 3.14; grp.add(lg);
        const t = vcMesh(new T.CylinderGeometry(r * 0.8, r, L, 6), [0xa59a88, 0x8e8270][k % 2], lg, true); t.rotation.z = Math.PI / 2; t.rotation.x = 0.06;
        if (k % 2) { const b = vcMesh(new T.CylinderGeometry(r * 0.3, r * 0.5, L * 0.35, 5), 0x9a8f7e, lg, true); b.position.set(L * 0.2, r * 0.5, 0.1); b.rotation.set(0.9, 0, 0.5); }
      }
    }
    const greys = [0x8b8781, 0x76736e, 0x9a958c, 0x6c6a66];
    for (const [s0, d0, nr, sz] of [[63.2, 2.2, 6, 0.55], [72.3, 2.4, 5, 0.5], [30, 2.5, 6, 0.6], [104, 9.5, 8, 0.7], [126, 2.5, 4, 0.45]]) {
      for (let i = 0; i < nr; i++) {
        const k = s0 * 10 + i, n = NW - d0 - hrand(k) * 2.2, s = s0 + (hrand(k + 1) - 0.5) * 3.2, r = sz * (0.45 + 0.7 * hrand(k + 2));
        rock(grp, n, gH(n, s) - r * 0.25, s, r, k, greys[i % 4]);
      }
    }
  }

  // ---------------- track details: rail joints, ATS beacons, the turnout's point machine / frog / check rails, a cable trough ----------------
  const RUST = C.toon(0x7b4a33);   // the rail colour of railway.js (cached: the same material)
  function trackN(id, s) {   // a real track's offset across the frame at s, from the rail data (null outside it)
    const p = C.DATA.rail.tracks.find((t) => t.id === id).p;
    for (let i = 0; i + 5 < p.length; i += 3) {
      const a = C.stationZone.toSN(p[i], p[i + 2]), b = C.stationZone.toSN(p[i + 3], p[i + 5]);
      if ((a[0] - s) * (b[0] - s) <= 0 && Math.abs(b[0] - a[0]) > 1e-6) return C.lerp(a[1], b[1], (s - a[0]) / (b[0] - a[0]));
    }
    return null;
  }
  const heading = (id, s) => Math.atan2(trackN(id, s + 1) - trackN(id, s - 1), 2);   // rotation.y that lays a box's z along the track
  function trackDetails(grp, wTop) {
    // rail joints every 25 m: fishplates on both sides of the web, four bolts, a hairline gap in the head
    for (const id of ['east', 'west']) for (const s of [2, 27, 52, 77, 102]) {
      const nc = trackN(id, s), y = railY(s);
      for (const c of [-0.566, 0.566]) {
        const n = nc + c;
        for (const d of [-1, 1]) {
          box(0.016, 0.07, 0.62, RUST, n + d * 0.026, y - 0.088, s, grp, false);
          for (const k of [-0.2, -0.07, 0.07, 0.2]) { const b = cylY(0.013, 0.03, RUST, n + d * 0.045, y - 0.088, s + k, grp, 6); b.rotation.z = Math.PI / 2; b.castShadow = false; }
        }
        box(0.066, 0.004, 0.008, M.dark, n, y + 0.002, s, grp, false);
      }
    }
    // ATS beacons: yellow boxes between the rails ahead of the signals
    for (const [id, s] of [['east', -12], ['east', 25], ['west', 23], ['west', 110]]) {
      const n = trackN(id, s), y = railY(s), ry = heading(id, s);
      box(0.42, 0.06, 0.62, M.dark, n, y - 0.17, s, grp, false).rotation.y = ry;
      box(0.36, 0.07, 0.5, M.yellow, n, y - 0.115, s, grp, false).rotation.y = ry;
    }
    // the turnout where the double track becomes single, north of the level crossing
    const sT = -32.4, nE = (s) => trackN('east', s), nW = (s) => trackN('west', s);
    let sF = sT + 2; while (sF < -5 && nE(sF) - nW(sF) < 1.132) sF += 0.1;   // the frog: the inner rails cross here
    const yF = railY(sF), aE = heading('east', sF), aW = heading('west', sF);
    const frog = box(0.2, 0.12, 2.2, M.steel, nE(sF) - 0.566, yF - 0.085, sF + 0.3, grp, false); frog.rotation.y = (aE + aW) / 2;
    box(0.05, 0.11, 3.6, RUST, nE(sF) + 0.516, yF - 0.07, sF, grp, false).rotation.y = aE;   // check rails opposite the frog
    box(0.05, 0.11, 3.6, RUST, nW(sF) - 0.516, yF - 0.07, sF, grp, false).rotation.y = aW;
    { const s = sT - 0.9, n = nE(s) + 1.35, y = railY(s);   // the point machine on the ballast shoulder, its rods under the rails to the blades
      const pm = box(0.5, 0.32, 1.1, M.grey, n, y - 0.17, s, grp); C.outline(pm, 0.01); box(0.54, 0.04, 1.14, M.steel, n, y + 0.0, s, grp, false);
      for (const ds of [0.5, 1.2]) box(2.65, 0.03, 0.04, M.steel, nE(sT + ds) + 0.05, y - 0.135, sT + ds, grp, false);
      box(0.2, 0.03, 1.3, M.steel, n - 0.35, y - 0.135, sT + 0.85, grp, false); }
    // a covered cable trough on the strip between the sea wall and the track bed (north and south of platform 2)
    const nT = -5.2, f = (nT - (NW - 0.15)) / (ST.n0 - ST.half - 2.3 - (NW - 0.15));
    for (const [a, b] of [[8, 18.2], [97, 136]]) for (let s = a + 0.3; s < b; s += 0.6) {
      const y = C.lerp(wTop(s), railY(s) - 0.75, f);
      box(0.4, 0.2, 0.6, M.conc, nT, y + 0.02, s, grp, false); box(0.44, 0.04, 0.575, M.grey, nT, y + 0.135, s, grp, false);
    }
  }

  // ---------------- around the station: street lamps on the approach road, 止まれ at the crossing, a guardrail above the beach, the post box ----------------
  const roadLampMat = C.nightGlow(C.toon(0xfff3dc, { emissive: 0xffc98a, emissiveIntensity: 0 }), 1.6);   // warm, like the old sodium lamps
  function streetLamp(grp, n, s, dn, ds) {   // galvanised pole, an arm reaching (dn, ds) over the road, a flat head; a warm pool at night
    const y = C.groundH(...W(n, s)), g = new T.Group(); g.position.set(n, y, s); g.rotation.y = Math.atan2(-ds, dn); grp.add(g);
    C.outline(cylY(0.075, 7.0, M.pole, 0, 3.5, 0, g, 8), 0.012); cylY(0.11, 0.5, M.pole, 0, 0.25, 0, g, 8);
    const arm = box(1.75, 0.07, 0.07, M.pole, 0.85, 6.92, 0, g); arm.rotation.z = 0.12;
    box(0.62, 0.1, 0.26, M.pole, 1.75, 7.0, 0, g); box(0.5, 0.03, 0.2, roadLampMat, 1.75, 6.94, 0, g, false);
    const h = C.makeHalo(3.2, 0xffd29a, 0.5); h.position.set(1.75, 6.75, 0); g.add(h);
    const hn = n + dn * 1.75, hs = s + ds * 1.75, pool = new T.Mesh(new T.PlaneGeometry(8, 8), warmPoolMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(hn, C.heightAt(...W(hn, hs)) + 0.12, hs); grp.add(pool);
    const [x, z] = W(n, s); C.addCollider(x, z, 0.12, 0.12, rot); C.reserve(x, z, 1, 1, rot);
  }
  const tomareTex = tex(128, 512, (c, w, h) => {   // 止まれ in road paint, stretched along the lane (止 farthest from the driver)
    c.clearRect(0, 0, w, h); ['止', 'ま', 'れ'].forEach((t, i) => { c.save(); c.scale(1, 1.62); C.text(c, t, w / 2, (i * 168 + 88) / 1.62, 104, '#f4f4ee', C.JP_FONT); c.restore(); });
  });
  const paintMat = C.toon(0xffffff, { map: tomareTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  function roadMarks(grp) {   // stop lines and 止まれ on both approaches to the level crossing; traffic keeps left
    const XS = C.stationZone.XS, XW = C.stationZone.XW;
    for (const d of [1, -1]) {   // d = +1: the inland approach (cars drive −n, on the +s half); −1: from the sea
      const nL = ST.n0 + d * 6.6, sH = XS + d * XW / 2, yL = C.groundH(...W(nL, sH)) + 0.1;
      box(0.3, 0.02, XW - 0.3, M.white, nL, yL, sH, grp, false);
      // 止まれ draped on the road (it ramps up to the crossing): v from the near end (れ) to the far end (止), u to the driver's right
      const nNear = ST.n0 + d * 11.5, nFar = ST.n0 + d * 7.3;
      sheet(1, 10, (i, j) => { const n = C.lerp(nNear, nFar, j / 10), sp = sH - d * (i - 0.5) * 1.05; return [n, C.heightAt(...W(n, sp)) + 0.1, sp, i, j / 10]; }, paintMat, grp);
    }
  }
  function guardrail(grp, pts) {   // white W-beam on posts along [[n, s], …]
    let prev = null;
    for (const [n, s] of pts) {
      const y = C.groundH(...W(n, s));
      cylY(0.05, 0.8, M.white, n, y + 0.4, s, grp, 6);
      if (prev) {
        const [pn, ps, py] = prev, L = Math.hypot(n - pn, s - ps), b = box(0.05, 0.3, L + 0.08, M.white, (n + pn) / 2, (y + py) / 2 + 0.62, (s + ps) / 2, grp);
        b.rotation.order = 'YXZ'; b.rotation.y = Math.atan2(n - pn, s - ps); b.rotation.x = -Math.atan2(y - py, L); C.outline(b, 0.01);
      }
      prev = [n, s, y];
    }
    for (let i = 0; i + 1 < pts.length; i++) {   // one thin collider along each span
      const [a, b] = [pts[i], pts[i + 1]], [x, z] = W((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      C.addCollider(x, z, 0.1, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 0.05, rot + Math.atan2(b[0] - a[0], b[1] - a[1]));
    }
  }
  function postBox(grp, n, s, face) {   // the old round red post box (丸型ポスト), its slot facing `face` (rotation.y)
    const y = C.groundH(...W(n, s)), g = new T.Group(); g.position.set(n, y, s); g.rotation.y = face; grp.add(g);
    cylY(0.25, 0.12, M.dark, 0, 0.06, 0, g, 16);
    C.outline(cylY(0.22, 1.0, M.red, 0, 0.62, 0, g, 18), 0.012);
    const cap = new T.Mesh(new T.SphereGeometry(0.235, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.red); cap.position.y = 1.12; cap.scale.y = 0.5; cap.castShadow = true; g.add(cap);
    box(0.26, 0.04, 0.06, M.dark, 0, 0.98, 0.2, g, false);   // the slot under a little hood
    box(0.3, 0.03, 0.09, M.red, 0, 1.015, 0.21, g, false);
    atlasQuad(g, AR.post, 0.15, 0.15, 0, 0.66, 0.222, 0, PM);
    const [x, z] = W(n, s); C.addCollider(x, z, 0.25, 0.25, rot);
  }

  C.buildStation = function (scene) {
    const grp = new T.Group(); grp.position.set(ST.x0, 0, ST.z0); grp.rotation.y = rot; scene.add(grp);
    const [ax, az] = W(ST.n0, 52); C.ANCHORS.station = { x: ax, y: railY(52), z: az, rot };

    // the ramps come down at the passenger crossing just south of the station house (photos), both feet at s = PXS + PXW
    const rf = C.stationZone.PXS + C.stationZone.PXW, P1 = platform(grp, 1, rf + 9, 92, 9), P2 = platform(grp, -1, rf + 11, 96, 11);

    // ---- the sea wall: diamond-grid concrete from the beach up to the platform / track bed, coping, fence on top
    const ws0 = 8, ws1 = 138, nsw = Math.ceil((ws1 - ws0) / 2);
    const wTop = (s) => (s >= P2.s0 && s <= P2.s1 ? P2.yAt(s) : s > P2.s1 ? railY(s) - 0.3 : C.lerp(railY(s) - 0.3, P2.yAt(P2.s0), C.smooth(P2.r0, P2.s0, s)));
    const beachY = (s) => C.groundH(...W(NW - 1.6, s)) - 0.3;
    sheet(1, nsw, (i, j) => { const s = ws0 + (ws1 - ws0) * j / nsw; return [NW - 0.9 - (i ? 0.45 : 0), i ? beachY(s) : wTop(s) - 0.18, s, s / 2, i ? (wTop(s) - beachY(s)) / 2 : 0]; }, M.wall, grp);
    sheet(1, nsw, (i, j) => { const s = ws0 + (ws1 - ws0) * j / nsw; return [NW - 0.9 + i * 0.75, wTop(s), s, s / 1.2, i * 0.3]; }, M.conc, grp);
    sheet(1, nsw, (i, j) => { const s = ws0 + (ws1 - ws0) * j / nsw; return [NW - 0.9, wTop(s) - i * 0.18, s, s / 1.2, i * 0.1]; }, M.conc, grp);
    // between the wall coping and platform 2 / the track bed
    sheet(1, nsw, (i, j) => { const s = ws0 + (ws1 - ws0) * j / nsw; const inP = s >= P2.s0 && s <= P2.s1; return [i ? (inP ? P2.no : ST.n0 - ST.half - 2.3) : NW - 0.15, i ? (inP ? P2.yAt(s) : railY(s) - 0.75) : wTop(s), s, s / 2, i]; }, M.conc, grp);
    // seaside fence: along the platform-2 back edge with a gap at the beach stairs, then along the wall south and north
    const stairS0 = 66, stairS1 = 69.5;
    fence(P2.no + 0.08, P2.r0 + 0.6, P2.no + 0.08, stairS0, P2.ySurf);
    fence(P2.no + 0.08, stairS1, P2.no + 0.08, P2.s1, P2.yAt);
    fence(NW - 0.5, P2.s1, NW - 0.5, ws1, wTop);
    fence(P2.no + 0.08, P2.s1, NW - 0.5, P2.s1 + 0.01, P2.yAt);
    fence(NW - 0.5, ws0 + 2, NW - 0.5, P2.r0 + 0.6, wTop);
    fence(NW - 0.5, P2.r0 + 0.6, P2.no + 0.08, P2.r0 + 0.61, wTop);   // closes the strip between the sea wall and the ramp
    // platform-1 back fence; platform ends
    fence(P1.no - 0.08, P1.s0 + 1, P1.no - 0.08, P1.s1, P1.yAt);
    for (const p of [P1, P2]) fence(p.ni + p.side * 0.3, p.s1 - 0.08, p.no - p.side * 0.1, p.s1 - 0.07, () => p.y1, 1.15);
    // beach stairs (in the fence gap), cheek walls, pipe handrails
    {
      const yTop = P2.yAt((stairS0 + stairS1) / 2), nTop = P2.no, nBot = NW - 8.5, sc = (stairS0 + stairS1) / 2, sw = stairS1 - stairS0;
      const yBot = C.groundH(...W(nBot, sc)), steps = Math.max(4, Math.round((yTop - yBot) / 0.17));
      for (let i = 0; i < steps; i++) {
        const f = (i + 0.5) / steps, n = C.lerp(nTop, nBot, f), y = C.lerp(yTop, yBot, f);
        box((nTop - nBot) / steps + 0.03, Math.max(0.2, y - yBot + 0.2), sw, M.conc, n, (y + yBot - 0.2) / 2, sc, grp, false);
      }
      for (const s of [stairS0 - 0.15, stairS1 + 0.15]) {
        // cheek walls: plain concrete under a coping that follows the slope, inked edges
        const shape = new T.Shape([new T.Vector2(0, 0), new T.Vector2(nTop - nBot, 0), new T.Vector2(nTop - nBot, yTop - yBot + 0.22), new T.Vector2(0, 0.22)]);
        const m = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: false }), M.conc); m.position.set(nBot, yBot, s - 0.13); m.receiveShadow = m.castShadow = true; grp.add(m); C.outline(m, 0.015);
        const cap = box(Math.hypot(nTop - nBot, yTop - yBot) + 0.06, 0.08, 0.34, M.offwhite, (nTop + nBot) / 2, (yTop + yBot) / 2 + 0.26, s, grp); cap.rotation.z = Math.atan2(yTop - yBot, nTop - nBot); C.outline(cap, 0.012);
        const pts = []; for (let k = 0; k <= 4; k++) { const f = k / 4; pts.push([C.lerp(nTop, nBot, f), C.lerp(yTop, yBot, f) + 1.15, s]); }
        pipe(pts, 0.028, M.white, grp);
      }
      const [cx, cz] = W((nTop + nBot) / 2, sc);
      C.addDeck(cx, cz, sw / 2, (nTop - nBot) / 2, yTop, yBot, rot - Math.PI / 2);
    }
    beachDetails(grp, ws0, ws1, wTop, beachY, [stairS0, stairS1]);

    // ---- canopies, benches, lamps, boards, small furniture
    canopy(grp, P1, 37, 53, 1); canopy(grp, P2, 41, 57, 2);
    for (const s of [40.5, 45.2, 49.9]) bench(grp, P1, s);
    for (const s of [44.5, 49.2, 53.9]) bench(grp, P2, s);
    for (const p of [P1, P2]) {
      for (const s of [p.s0 + 2.5, 66, 77, p.s1 - 5]) lampPost(grp, p, s);
      for (let s = (p.side > 0 ? 39 : 43); s < (p.side > 0 ? 53 : 57); s += 4.6) lightPool(grp, p.nc, p.yAt(s), s, 2.6);
    }
    for (const [p, s] of [[P1, 31], [P1, 72], [P2, 35], [P2, 76]]) { const b = nameBoard(); b.position.set(p.nc + p.side * 0.4, p.yAt(s), s); b.rotation.y = Math.PI / 2; grp.add(b); }
    const tt = (p, s) => {
      const b = textBoard(0.8, 1.0, (c, w, h) => { c.fillStyle = '#fbfaf5'; c.fillRect(0, 0, w, h); c.fillStyle = '#1f4f96'; c.fillRect(0, 0, w, 70); C.text(c, '時刻表', w / 2, 36, 44, '#fff'); for (let r = 0; r < 14; r++) C.text(c, `${6 + r}  ` + ['05 25 45', '10 30 50', '15 35 55'][r % 3], 30, 100 + r * 28, 20, '#333', 'monospace', 'normal', 'left'); }, 0.25);
      b.position.set(p.no - p.side * 0.12, p.yAt(s) + 1.3, s); b.rotation.y = p.side > 0 ? -Math.PI / 2 : Math.PI / 2; grp.add(b); box(0.05, 1.3, 0.05, M.dark, p.no - p.side * 0.1, p.yAt(s) + 0.65, s, grp);
    };
    tt(P1, 35.5); tt(P2, 39.5);
    for (const [p, s] of [[P1, 55], [P2, 59]]) cylY(0.2, 0.7, C.toon(0x5a6b7a), p.no - p.side * 0.4, p.yAt(s) + 0.35, s, grp, 10);
    for (const p of [P1, P2]) for (const [s, t] of [[(p.s0 + p.s1) / 2 + p.side * 18.9, '2'], [(p.s0 + p.s1) / 2 + p.side * 27.6, '3']]) {
      const b = textBoard(0.3, 0.3, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d23'; c.lineWidth = 14; c.strokeRect(8, 8, w - 16, h - 16); C.text(c, t, w / 2, h / 2 + 6, h * 0.62, '#111', 'sans-serif'); });
      b.position.set(p.ni + p.side * 0.6, p.yAt(s) + 1.55, s); b.rotation.y = p.side > 0 ? Math.PI : 0; grp.add(b); box(0.04, 1.4, 0.04, M.steel, p.ni + p.side * 0.6, p.yAt(s) + 0.7, s, grp, false);
    }
    for (const p of [P1, P2]) {   // convex mirror for the driver at the far end, emergency-stop box
      const s = p.side > 0 ? p.s1 - 2 : p.s0 + 2, y = p.yAt(s);
      box(0.06, 2.6, 0.06, M.steel, p.no - p.side * 0.3, y + 1.3, s, grp);
      const mir = new T.Mesh(new T.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, 0.6), C.toon(0xcfe0ee)); mir.rotation.x = p.side > 0 ? -Math.PI / 2 : Math.PI / 2; mir.position.set(p.no - p.side * 0.3, y + 2.5, s); grp.add(mir);
      const rim = new T.Mesh(new T.TorusGeometry(0.36, 0.035, 6, 18), M.red); rim.position.copy(mir.position); grp.add(rim);
      box(0.22, 0.3, 0.12, M.red, p.no - p.side * 0.25, y + 1.2, (p.s0 + p.s1) / 2 + 8, grp); box(0.05, 1.05, 0.05, M.steel, p.no - p.side * 0.25, y + 0.52, (p.s0 + p.s1) / 2 + 8, grp, false);
    }
    // advertising boards on the back fences, and chains across the far ends
    for (const [p, s, R, w, h] of [[P1, 58.5, AR.botchan, 1.0, 0.667], [P1, 62.5, AR.sunset, 0.6, 0.844], [P1, 82, AR.dogo, 1.0, 0.667],
      [P2, 74.3, AR.mikan, 1.0, 0.667], [P2, 84, AR.spring, 0.6, 0.844]]) fencePoster(grp, p, s, R, w, h);
    for (const p of [P1, P2]) endChain(grp, p, p.s1 - 3);
    // TLS location sign on the platform-2 fence, and the handkerchief tied beside it
    const tls = textBoard(1.25, 0.5, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.strokeStyle = '#2a63b0'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12); C.text(c, '東京ラブストーリー', w / 2, h * 0.38, h * 0.26, '#2a63b0'); C.text(c, 'ロケ地  梅津寺駅', w / 2, h * 0.72, h * 0.18, '#2a63b0'); });
    tls.rotation.y = Math.PI / 2; tls.position.set(P2.no + 0.14, P2.yAt(60) + 0.8, 60); grp.add(tls);
    const hkG = C.dynamic(new T.Group()); grp.add(hkG);
    const hk = new T.Mesh(new T.PlaneGeometry(0.24, 0.34, 3, 4), C.toon(0xffffff, { side: T.DoubleSide })); hk.position.set(P2.no + 0.05, P2.yAt(62.5) + 0.95, 62.5); hk.rotation.set(0.2, Math.PI / 2, 0.3); hkG.add(hk);
    C.onUpdate((dt, t) => { hk.rotation.z = 0.3 + Math.sin(t * 3.1) * 0.25; hk.rotation.x = 0.2 + Math.sin(t * 4.3) * 0.15; });
    // the public phone, by the platform-1 canopy
    const ph = phoneStand(); ph.group.position.set(P1.no - 0.55, P1.yAt(36.2), 36.2); ph.group.rotation.y = -Math.PI / 2; grp.add(ph.group);

    // ---- track furniture: starting signals at the north ends, speed board, catenary, utility poles
    // home signal for southbound trains (east side, faces north), starting signal for northbound ones (west side, faces the platform)
    signal(grp, ST.n0 + ST.half + 2.3, 6.5, railY(6.5) - 0.7, Math.PI);
    signal(grp, ST.n0 - ST.half - 1.8, 7, railY(7) - 0.7, 0);
    { const b = textBoard(0.4, 0.4, (c, w, h) => { c.fillStyle = '#ffd400'; c.fillRect(0, 0, w, h); C.text(c, '25', w / 2, h / 2 + 6, h * 0.7, '#111', 'sans-serif'); }); b.position.set(ST.n0 + ST.half + 2.1, railY(-7) + 1.4, -7); b.rotation.y = Math.PI; grp.add(b); box(0.05, 1.3, 0.05, M.steel, ST.n0 + ST.half + 2.1, railY(-7) + 0.6, -7, grp); }
    catenary(grp, [-18, 16.5, 58, 96, 134], P1, P2);
    trackDetails(grp, wTop);
    {
      const pts = [], drops = [];
      for (let s = -12; s <= 130; s += 29) {
        const n = 18.5, y = C.groundH(...W(n, s)); pts.push([n, y, s]);
        cylY(0.15, 10, M.pole, n, y + 5, s, grp, 8).castShadow = true; box(1.6, 0.1, 0.1, M.dark, n, y + 9.3, s, grp); box(1.1, 0.1, 0.1, M.dark, n, y + 8.6, s, grp);
        if (pts.length % 2) {   // pole transformer: a finned can on a bracket, three bushings, drop wires to the cross-arm
          box(0.3, 0.5, 0.1, M.dark, n + 0.25, y + 7.6, s, grp, false);
          cylY(0.27, 0.72, M.grey, n + 0.62, y + 7.55, s, grp, 12); cylY(0.3, 0.06, M.grey, n + 0.62, y + 7.94, s, grp, 12);
          box(0.62, 0.56, 0.03, M.grey, n + 0.62, y + 7.53, s, grp, false); box(0.03, 0.56, 0.62, M.grey, n + 0.62, y + 7.53, s, grp, false);
          for (const k of [-0.12, 0, 0.12]) { cylY(0.028, 0.14, M.white, n + 0.62 + k, y + 8.04, s, grp, 6); drops.push(n + 0.62 + k, y + 8.1, s, n + k * 3, y + 8.6, s); }
        }
      }
      const wz = [];
      for (let i = 0; i < pts.length - 1; i++) for (const [dy, dn] of [[9.3, -0.7], [9.3, 0.7], [8.6, -0.5], [8.6, 0.5], [7.4, 0]]) for (let k = 0; k < 8; k++) {
        const a = pts[i], b = pts[i + 1], f0 = k / 8, f1 = (k + 1) / 8, sg = (f) => -Math.sin(f * Math.PI) * 0.6;
        wz.push(a[0] + dn, C.lerp(a[1], b[1], f0) + dy + sg(f0), C.lerp(a[2], b[2], f0), a[0] + dn, C.lerp(a[1], b[1], f1) + dy + sg(f1), C.lerp(a[2], b[2], f1));
      }
      wz.push(...drops);
      const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(wz, 3)); grp.add(new T.LineSegments(lg, WIRE));
    }

    // ---- the station house south of the crossing; two pollarded street trees in front, cones along the lot, pines by the sea
    const yG = C.groundH(...W(11, 11)) + 0.1, house = stationHouse(grp, yG);
    for (const [sp, seed] of [[house.fc - 3.7, 3], [house.fc + 3.9, 7]]) leafyTree(grp, house.front + 2.6, sp, seed);
    fence(6.95, 3.6, 6.95, 18.2, (sp) => C.groundH(...W(6.95, sp)), 1.2);
    for (const [n, sp] of [[23, 4], [23, 9], [23.4, 14.5], [23.8, 20]]) cone(grp, n, sp);
    for (const [n, sp, sc, seed] of [[-10.5, -14, 1.1, 2], [-12.5, -5, 0.9, 5], [-9.5, 4.5, 1.0, 9], [-9.0, -23, 0.85, 4]]) pineTree(grp, n, sp, sc, seed);
    postBox(grp, 17.4, 6.4, Math.PI / 2);
    // ---- the approach road (OSM): street lamps on its north side, 止まれ at the crossing, a guardrail where it runs above the beach
    for (const n of [14, 34, 52]) { const sc = n < 28 ? -(n - 2) / 26 : -1 - (n - 28) / 34; streetLamp(grp, n, sc - 3.0, 0, 1); }
    { const A = [-10, 0], B = [-79, -49], L = Math.hypot(B[0] - A[0], B[1] - A[1]), on = (B[1] - A[1]) / L, os = -(B[0] - A[0]) / L;   // [n, s]; (on, os): across, toward the beach
      const at = (f, o) => [C.lerp(A[0], B[0], f) + on * o, C.lerp(A[1], B[1], f) + os * o];
      const rail = []; for (let f = 0.06; f <= 0.55; f += 2 / L) rail.push(at(f, 2.7)); guardrail(grp, rail);
      const [ln, ls] = at(0.14, 3.1); streetLamp(grp, ln, ls, -on, -os); }
    roadMarks(grp);

    // ---- level crossing at the north throat: the coast road crosses the double track at right angles (terrain: rail-head level)
    const XS = C.stationZone.XS, XW = C.stationZone.XW, xs = W(ST.n0, XS), xg = new T.Group(); grp.add(xg);
    {
      const tW = ST.n0 - ST.half, tE = ST.n0 + ST.half, yX = railY(XS);
      // concrete slabs: inside each gauge, between the tracks, and outside; the gaps are the flangeways
      for (const [a, b] of [[tW - 1.37, tW - 0.617], [tW - 0.47, tW + 0.47], [tW + 0.617, tE - 0.617], [tE - 0.47, tE + 0.47], [tE + 0.617, tE + 1.37]]) {
        const m = boxM(b - a, 0.12, 2 * XW, M.panel, (a + b) / 2, yX - 0.066, XS, xg, false); m.receiveShadow = true;
      }
      // asphalt aprons out to where the road ribbons resume (same material as the town's lanes)
      for (const [a, b] of [[tE + 1.37, ST.n0 + 8.6], [ST.n0 - 8.6, tW - 1.37]]) {
        sheet(8, 2, (i, j) => { const n = C.lerp(a, b, i / 8), sp = XS - XW + 2 * XW * j / 2; return [n, C.groundH(...W(n, sp)) + 0.08, sp, i / 8, j / 2]; }, M.lane, xg);
      }
      C.roadHoles = (C.roadHoles || []).concat([{ x: xs[0], z: xs[1], hw: 8.0, hd: XW + 0.5, c: Math.cos(rot), s: Math.sin(rot) }]);
    }
    const pxLamps = passengerCrossing(grp, P1, P2);
    const sigs = [], arms = [];
    for (const side of [1, -1]) {   // traffic keeps left: east signal on the south kerb, west signal on the north kerb
      const n = ST.n0 + side * (ST.half + 2.25), sp = XS + side * (XW + 0.45), y = C.groundH(...W(n, sp));
      const sg = crossingSignal(); sg.group.position.set(n, y, sp); sg.group.rotation.y = side * Math.PI / 2; xg.add(sg.group); sigs.push(sg);
      const b = barrierMachine(4.6); b.group.position.set(n + side * 0.75, y, sp); b.group.rotation.y = side * Math.PI / 2; xg.add(b.group); arms.push(b.arm);
    }
    // 「きけん 線路内進入禁止」: at the crossing on the sea side, and at the far platform ends
    const kiken = () => textBoard(0.45, 0.7, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#d42a24'; c.fillRect(0, 0, w, h * 0.32); C.text(c, 'きけん', w / 2, h * 0.17, h * 0.17, '#fff'); ['線路内', '進入禁止'].forEach((t, i) => C.text(c, t, w / 2, h * (0.48 + i * 0.22), h * 0.14, '#d42a24')); });
    for (const [n, sp, y, ry] of [[ST.n0 - ST.half - 3.0, XS + XW + 0.7, C.groundH(...W(ST.n0 - ST.half - 3.0, XS + XW + 0.7)), Math.PI], [P1.nc, P1.s1 + 0.1, P1.yAt(P1.s1), 0], [P2.nc, P2.s1 + 0.1, P2.yAt(P2.s1), 0]]) {
      const b = kiken(); b.position.set(n, y + 1.25, sp); b.rotation.y = ry; grp.add(b); box(0.04, 1.0, 0.04, M.steel, n, y + 0.5, sp + (ry ? 0.02 : -0.02), grp);
    }
    C.reserve(xs[0], xs[1], 9, XW + 1, rot);
    let crossingOn = false, armT = 0, blink = 0;
    C.onUpdate((dt) => {
      armT = C.clamp(armT + (crossingOn ? dt : -dt) / 4, 0, 1);
      for (const a of arms) a.rotation.z = C.lerp(Math.PI / 2 * 0.95, 0, C.smooth(0, 1, armT));
      blink += dt; const ph2 = Math.floor(blink * 1.6) % 2;
      for (const s of sigs) s.lamps.forEach((m, i) => { m.emissiveIntensity = crossingOn ? ((i % 2) === ph2 ? 2.4 : 0.05) : 0; });
      for (const m of pxLamps) m.emissiveIntensity = crossingOn ? (ph2 ? 2.2 : 0.05) : 0;
    });

    buildFences(grp); clockHands(grp);
    { const [cx, cz] = W(4, 55); C.reserve(cx, cz, 24, 68, rot); }
    const pls = [];
    for (const p of [P1, P2]) { const l = new T.PointLight(0xdfeeff, 0, 26, 1.6); const [x, z] = W(p.nc, 48); l.position.set(x, p.yAt(48) + 3.2, z); scene.add(l); pls.push(l); }
    C.onUpdate((dt, t, env) => { for (const l of pls) l.intensity = 0.9 * env.night; const wet = C.weather ? C.weather.rain : 0;   // wet platform: darker asphalt, lamp glints (Phong specular), stronger pools
      M.top.specular.setScalar(0.5 * wet); M.top.color.setScalar(1 - 0.3 * wet);
      poolMat.opacity = (0.32 + 0.3 * wet) * env.night; poolMat.visible = env.night > 0.01; });

    C.station = { group: grp, frame: { x: ST.x0, z: ST.z0, rot, n0: ST.n0, half: ST.half, W, railY }, plat1: P1, plat2: P2,
      phone: ph, crossing: { group: xg, x: xs[0], z: xs[1] }, setCrossing(on) { crossingOn = on; }, get crossingOn() { return crossingOn; } };
    return C.station;
  };
})(window.CITY);
