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
  const doorTex = tex(256, 256, (g, w, h) => {      // glass entrance: two sliding leaves + transom, posters inside
    g.fillStyle = '#c9ced3'; g.fillRect(0, 0, w, h);
    const pane = (x, y, pw, ph) => { const gr = g.createLinearGradient(0, y, 0, y + ph); gr.addColorStop(0, '#7a909d'); gr.addColorStop(1, '#2f3d47'); g.fillStyle = gr; g.fillRect(x, y, pw, ph); };
    pane(8, 8, w - 16, 44);
    for (const x of [8, 70, 132, 194]) pane(x, 60, 54, h - 68);
    g.fillStyle = '#e8c35a'; g.fillRect(16, 120, 30, 40); g.fillStyle = '#d84a3a'; g.fillRect(140, 110, 34, 46); g.fillStyle = '#4a86c8'; g.fillRect(204, 124, 28, 36);
    g.fillStyle = 'rgba(255,255,255,.18)'; for (const x of [8, 132]) { g.beginPath(); g.moveTo(x + 10, h - 8); g.lineTo(x + 30, h - 8); g.lineTo(x + 110, 60); g.lineTo(x + 90, 60); g.fill(); }
    g.fillStyle = '#9aa1a8'; g.fillRect(122, 60, 6, h - 60);
  });
  const doorGlowTex = tex(256, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(8, 8, w - 16, 44); for (const x of [8, 70, 132, 194]) g.fillRect(x, 60, 54, h - 68); });

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
    door: C.nightGlow(C.toon(0xffffff, { map: doorTex, emissive: 0xffe9bf, emissiveMap: doorGlowTex, emissiveIntensity: 0 }), 0.95),
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
    p.r0 = r0;
    return p;
  }

  // ---------------- canopy (one row of round posts, flat white roof) ----------------
  function canopy(grp, p, s0, s1, num) {
    const g = new T.Group(), L = s1 - s0, y = p.yAt((s0 + s1) / 2), nPost = p.nc + p.side * 0.35;
    for (let s = s0 + 1.2; s <= s1 - 1.1; s += 4.6) {
      const c = cylY(0.1, 2.75, M.white, nPost, y + 1.375, s, g, 12); C.outline(c, 0.015);
      box(0.24, 0.12, 0.24, M.grey, nPost, y + 0.06, s, g);
      for (const d of [-1, 1]) { const br = box(1.2, 0.08, 0.08, M.white, nPost + d * 0.55, y + 2.62, s, g); br.rotation.z = d * 0.18; }
    }
    box(0.16, 0.22, L, M.white, nPost, y + 2.78, (s0 + s1) / 2, g);
    const roof = box(3.7, 0.1, L + 0.2, M.white, p.nc, y + 2.95, (s0 + s1) / 2, g); roof.rotation.z = -p.side * 0.03; C.outline(roof, 0.03);
    for (const d of [-1, 1]) box(0.05, 0.22, L + 0.2, M.offwhite, p.nc + d * 1.86, y + 2.9, (s0 + s1) / 2, g);   // fascia
    box(3.5, 0.02, L, M.offwhite, p.nc, y + 2.89, (s0 + s1) / 2, g, false);                                     // soffit
    for (let s = s0 + 2.2; s < s1 - 1; s += 4.6) for (const d of [-0.8, 0.8]) box(0.14, 0.06, 1.25, lampMat, p.nc + d, y + 2.84, s, g, false);
    // のりば number, hanging at the north end
    const nb = textBoard(0.42, 0.42, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.strokeStyle = '#222'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); C.text(c, String(num), w / 2, h / 2 + 8, h * 0.72, '#1c1c1c', 'sans-serif'); }, 0.3);
    nb.position.set(p.ni - p.side * 0.5, y + 2.55, s0 + 0.6); g.add(nb);
    for (const d of [-0.12, 0.12]) box(0.01, 0.2, 0.01, M.steel, p.ni - p.side * 0.5 + d, y + 2.8, s0 + 0.6, g, false);
    grp.add(g); return g;
  }
  function bench(grp, p, s) {   // white perforated three-seat unit on a dark frame, facing the track
    const g = new T.Group(), y = p.yAt(s), face = p.side > 0 ? -Math.PI / 2 : Math.PI / 2;
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
    b.position.y = 1.95; g.add(b);
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

  // ---------------- station house (photos: long slate roof along the track, steep entrance gable 「梅津寺駅」 facing the lot,
  // veranda on white posts, lap siding over a blue-grey skirt, mint fascia and barge boards) ----------------
  function stationHouse(grp, yG) {
    const g = new T.Group(); grp.add(g); g.position.y = yG;
    const n0 = 7.4, n1 = 13.6, s0 = 4.0, s1 = 18.0, H = 3.3, D = n1 - n0, L = s1 - s0, nm = (n0 + n1) / 2, sm = (s0 + s1) / 2;
    const p = 0.45, tp = Math.tan(p), yr = H + tp * (nm - n0), ob = 0.55, ofr = 1.6, og = 0.45;   // pitch, ridge, back / front (veranda) / gable overhangs
    const eB = yr - tp * (nm - n0 + ob), eF = yr - tp * (n1 + ofr - nm);
    // plinth, skirt, walls
    box(D + 0.3, 0.4, L + 0.3, M.conc, nm, -0.15, sm, g, false);
    const walls = boxM(D, H - 0.85, L, M.siding, nm, 0.85 + (H - 0.85) / 2, sm, g); C.outline(walls, 0.025);
    box(D + 0.04, 0.85, L + 0.04, M.skirt, nm, 0.425, sm, g);
    box(D + 0.07, 0.05, L + 0.07, M.white, nm, 0.86, sm, g, false);
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
    const fc = 13.6, fw = 4.0, fn1 = n1 + 2.4, Hf = 2.6, half = fw / 2 + 0.3, peak = yr - 0.06, fp = Math.atan((peak - Hf) / half), fl = fn1 + 0.3 - (nm + 0.6);   // peak just under the main ridge
    for (const d of [-1, 1]) {
      const r = boxM(fl, 0.14, half / Math.cos(fp) + 0.05, M.slate, nm + 0.6 + fl / 2, (peak + Hf) / 2 + 0.08, fc + d * half / 2, g);
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
    box(0.06, 2.85, 3.0, M.alu, n1 + 0.01, 1.45, fc, g, false);
    wallQuad(g, M.door, 'n', 1, n1 + 0.05, 1.42, fc, 2.85, 2.75);
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
    for (const sp of [6.6, 9.0, 11.4, 13.8]) houseWindow(g, 'n', -1, n0 - 0.005, 1.75, sp, 1.6, 1.15);
    for (const sp of [6.0, 8.6]) houseWindow(g, 'n', 1, n1 + 0.005, 1.7, sp, 0.9, 1.75);
    houseWindow(g, 's', -1, 9.2, 1.75, s0 - 0.005, 1.4, 1.0); houseWindow(g, 's', 1, 9.2, 1.75, s1 + 0.005, 1.4, 1.0);
    // air-conditioner on the north end, vending machines + bin by the door, bicycles under the veranda
    { const ac = box(0.82, 0.62, 0.3, M.offwhite, 12.3, 0.45, s0 - 0.2, g); const fan = new T.Mesh(new T.CircleGeometry(0.21, 16), M.dark); fan.position.set(12.18, 0.46, s0 - 0.36); fan.rotation.y = Math.PI; g.add(fan); box(0.06, 0.3, 0.06, M.alu, 12.3, 0.08, s0 - 0.2, g, false); ac.castShadow = true; }
    [[0xf4f4f0, fc - fw / 2 - 0.75], [0xd8342c, fc - fw / 2 - 1.8]].forEach(([c, sp]) => { const v = vending(c); v.position.set(n1 + 0.45, 0.1, sp); v.rotation.y = Math.PI / 2; g.add(v); });
    cylY(0.2, 0.7, C.toon(0x2e6fbf), n1 + 0.35, 0.45, fc - fw / 2 - 2.6, g, 10);
    for (const sp of [4.9, 5.6, 6.3]) bicycle(g, n1 + 0.9, sp);
    // collider (walls) + the walk deck
    const [cx, cz] = W(nm, sm); C.addCollider(cx, cz, D / 2, L / 2, rot);
    C.addDeck(...W((n1 + fn1) / 2 + 0.15, sm + 0.6), (fn1 - n1 + 0.3) / 2, (L + 2.4) / 2, yG + 0.1, yG + 0.1, rot);
    return { g, front: fn1, fc, s0, s1, n0, n1 };
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

  // ---------------- catenary portals (concrete poles + steel beam), wires with droppers ----------------
  function catenary(grp, s0, s1, P1, P2) {
    const tracks = [ST.n0 + ST.half, ST.n0 - ST.half], wires = [], portals = [];
    const poleL = new T.CylinderGeometry(0.13, 0.19, 8.2, 8); poleL.translate(0, 4.1, 0);
    for (let s = s0; s <= s1; s += 38) portals.push(s);
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
  C.buildStation = function (scene) {
    const grp = new T.Group(); grp.position.set(ST.x0, 0, ST.z0); grp.rotation.y = rot; scene.add(grp);
    const [ax, az] = W(ST.n0, 52); C.ANCHORS.station = { x: ax, y: railY(52), z: az, rot };

    const P1 = platform(grp, 1, 19, 92, 9), P2 = platform(grp, -1, 23, 96, 10);

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
    fence(P2.no + 0.08, P2.s0, P2.no + 0.08, stairS0, P2.yAt);
    fence(P2.no + 0.08, stairS1, P2.no + 0.08, P2.s1, P2.yAt);
    fence(NW - 0.5, P2.s1, NW - 0.5, ws1, wTop);
    fence(P2.no + 0.08, P2.s1, NW - 0.5, P2.s1 + 0.01, P2.yAt);
    fence(NW - 0.5, ws0 + 2, NW - 0.5, P2.r0 + 0.5, wTop);
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
        const shape = new T.Shape([new T.Vector2(0, 0), new T.Vector2(nTop - nBot, 0), new T.Vector2(nTop - nBot, yTop - yBot + 0.3), new T.Vector2(0, 0.3)]);
        const m = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }), M.wall); m.position.set(nBot, yBot, s - 0.15); m.receiveShadow = true; grp.add(m);
        const pts = []; for (let k = 0; k <= 4; k++) { const f = k / 4; pts.push([C.lerp(nTop, nBot, f), C.lerp(yTop, yBot, f) + 1.15, s]); }
        pipe(pts, 0.028, M.white, grp);
      }
      const [cx, cz] = W((nTop + nBot) / 2, sc);
      C.addDeck(cx, cz, sw / 2, (nTop - nBot) / 2, yTop, yBot, rot - Math.PI / 2);
    }

    // ---- canopies, benches, lamps, boards, small furniture
    canopy(grp, P1, 37, 53, 1); canopy(grp, P2, 41, 57, 2);
    for (const s of [40.5, 45.2, 49.9]) bench(grp, P1, s);
    for (const s of [44.5, 49.2, 53.9]) bench(grp, P2, s);
    for (const p of [P1, P2]) {
      for (const s of [p.s0 + 5, p.s0 + 14, 66, 77, p.s1 - 5]) if (s < 35 || s > 60) lampPost(grp, p, s);
      for (let s = (p.side > 0 ? 39 : 43); s < (p.side > 0 ? 53 : 57); s += 4.6) lightPool(grp, p.nc, p.yAt(s), s, 2.6);
    }
    for (const [p, s] of [[P1, 31], [P1, 72], [P2, 35], [P2, 76]]) { const b = nameBoard(); b.position.set(p.nc + p.side * 0.4, p.yAt(s), s); b.rotation.y = Math.PI / 2; grp.add(b); }
    const tt = (p, s) => {
      const b = textBoard(0.8, 1.0, (c, w, h) => { c.fillStyle = '#fbfaf5'; c.fillRect(0, 0, w, h); c.fillStyle = '#1f4f96'; c.fillRect(0, 0, w, 70); C.text(c, '時刻表', w / 2, 36, 44, '#fff'); for (let r = 0; r < 14; r++) C.text(c, `${6 + r}  ` + ['05 25 45', '10 30 50', '15 35 55'][r % 3], 30, 100 + r * 28, 20, '#333', 'monospace', 'normal', 'left'); }, 0.25);
      b.position.set(p.no - p.side * 0.12, p.yAt(s) + 1.3, s); b.rotation.y = p.side > 0 ? -Math.PI / 2 : Math.PI / 2; grp.add(b); box(0.05, 1.3, 0.05, M.dark, p.no - p.side * 0.1, p.yAt(s) + 0.65, s, grp);
    };
    tt(P1, 35.5); tt(P2, 39.5);
    for (const [p, s] of [[P1, 55], [P2, 59]]) cylY(0.2, 0.7, C.toon(0x5a6b7a), p.no - p.side * 0.4, p.yAt(s) + 0.35, s, grp, 10);
    for (const p of [P1, P2]) for (const [s, t] of [[p.side > 0 ? 60 : 33, '2'], [p.side > 0 ? 78 : 50, '3']]) {
      const b = textBoard(0.3, 0.3, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d23'; c.lineWidth = 14; c.strokeRect(8, 8, w - 16, h - 16); C.text(c, t, w / 2, h / 2 + 6, h * 0.62, '#111', 'sans-serif'); });
      b.position.set(p.ni + p.side * 0.6, p.yAt(s) + 1.55, s); b.rotation.y = Math.PI / 2; grp.add(b); box(0.04, 1.4, 0.04, M.steel, p.ni + p.side * 0.6, p.yAt(s) + 0.7, s, grp, false);
    }
    for (const p of [P1, P2]) {   // convex mirror for the driver at the far end, emergency-stop box
      const s = p.side > 0 ? p.s1 - 2 : p.s0 + 2, y = p.yAt(s);
      box(0.06, 2.6, 0.06, M.steel, p.no - p.side * 0.3, y + 1.3, s, grp);
      const mir = new T.Mesh(new T.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, 0.6), C.toon(0xcfe0ee)); mir.rotation.x = p.side > 0 ? -Math.PI / 2 : Math.PI / 2; mir.position.set(p.no - p.side * 0.3, y + 2.5, s); grp.add(mir);
      const rim = new T.Mesh(new T.TorusGeometry(0.36, 0.035, 6, 18), M.red); rim.position.copy(mir.position); grp.add(rim);
      box(0.22, 0.3, 0.12, M.red, p.no - p.side * 0.25, y + 1.2, (p.s0 + p.s1) / 2 + 8, grp); box(0.05, 1.05, 0.05, M.steel, p.no - p.side * 0.25, y + 0.52, (p.s0 + p.s1) / 2 + 8, grp, false);
    }
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
    catenary(grp, -18, 138, P1, P2);
    {
      const pts = [];
      for (let s = -12; s <= 130; s += 29) {
        const n = 18.5, y = C.groundH(...W(n, s)); pts.push([n, y, s]);
        cylY(0.15, 10, M.pole, n, y + 5, s, grp, 8).castShadow = true; box(1.6, 0.1, 0.1, M.dark, n, y + 9.3, s, grp); box(1.1, 0.1, 0.1, M.dark, n, y + 8.6, s, grp);
        if (pts.length % 2) cylY(0.3, 0.8, M.grey, n + 0.4, y + 7.6, s, grp, 10);
      }
      const wz = [];
      for (let i = 0; i < pts.length - 1; i++) for (const [dy, dn] of [[9.3, -0.7], [9.3, 0.7], [8.6, -0.5], [8.6, 0.5], [7.4, 0]]) for (let k = 0; k < 8; k++) {
        const a = pts[i], b = pts[i + 1], f0 = k / 8, f1 = (k + 1) / 8, sg = (f) => -Math.sin(f * Math.PI) * 0.6;
        wz.push(a[0] + dn, C.lerp(a[1], b[1], f0) + dy + sg(f0), C.lerp(a[2], b[2], f0), a[0] + dn, C.lerp(a[1], b[1], f1) + dy + sg(f1), C.lerp(a[2], b[2], f1));
      }
      const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(wz, 3)); grp.add(new T.LineSegments(lg, WIRE));
    }

    // ---- the station house south of the crossing; two pollarded street trees in front, cones along the lot, pines by the sea
    const yG = C.groundH(...W(11, 11)) + 0.1, house = stationHouse(grp, yG);
    for (const [sp, seed] of [[house.fc - 3.7, 3], [house.fc + 3.9, 7]]) leafyTree(grp, house.front + 2.6, sp, seed);
    fence(6.95, 3.6, 6.95, 9.8, (sp) => C.groundH(...W(6.95, sp)), 1.2);
    for (const [n, sp] of [[23, 4], [23, 9], [23.4, 14.5], [23.8, 20]]) cone(grp, n, sp);
    for (const [n, sp, sc, seed] of [[-10.5, -14, 1.1, 2], [-12.5, -5, 0.9, 5], [-9.5, 4.5, 1.0, 9], [-9.0, -23, 0.85, 4]]) pineTree(grp, n, sp, sc, seed);

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
    });

    buildFences(grp);
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
