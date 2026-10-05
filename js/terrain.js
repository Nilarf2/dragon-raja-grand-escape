// Real terrain around Baishinji from GSI 5 m DEM (near) + 10 m/z11 DEM (far, ~48 km incl. islands).
// Frame: origin = Baishinji station, +X east, +Z south, Y up (m above T.P.). Sea cells hold a synthesized seabed.
// The novel's places are carved into the real hill: hill-tram cutting, summit yard, the mine-cut cliff under the rock.
(function (C) {
  const T = THREE, A = C.ANCHORS;

  function decode(g) {
    const bin = atob(g.b64), n = bin.length >> 1, out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; out[i] = v * g.unit; }
    return out;
  }
  const NG = C.DATA.terrainNear, FG = C.DATA.terrainFar;
  const NH = decode(NG), FH = decode(FG);
  const NX1 = NG.x0 + (NG.nx - 1) * NG.dx, NZ1 = NG.z0 + (NG.nz - 1) * NG.dx;
  // smooth the 0.1 m quantisation steps and the raster coastline (5 m stair-steps)
  function blur(g, H, passes, hi = Infinity) {   // cells below −6 m (and above hi) are kept
    const tmp = new Float32Array(H.length), nx = g.nx, nz = g.nz;
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
        const k = i * nx + j, c = H[k];
        if (i === 0 || j === 0 || i === nz - 1 || j === nx - 1 || c < -6 || c > hi) { tmp[k] = c; continue; }
        tmp[k] = (4 * c + 2 * (H[k - 1] + H[k + 1] + H[k - nx] + H[k + nx]) + H[k - nx - 1] + H[k - nx + 1] + H[k + nx - 1] + H[k + nx + 1]) / 16;
      }
      H.set(tmp);
    }
  }
  blur(NG, NH, 3);
  blur(FG, FH, 2, 20);   // far field: round the 120 m stair-steps of the island coastlines (peaks untouched)
  function bil(g, H, x, z) {
    let fx = (x - g.x0) / g.dx, fz = (z - g.z0) / g.dx;
    fx = C.clamp(fx, 0, g.nx - 1.001); fz = C.clamp(fz, 0, g.nz - 1.001);
    const j = fx | 0, i = fz | 0, u = fx - j, v = fz - i, k = i * g.nx + j;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + g.nx] * (1 - u) + H[k + g.nx + 1] * u) * v;
  }
  const inNear = (x, z) => x >= NG.x0 && x <= NX1 && z >= NG.z0 && z <= NZ1;
  C.groundH = (x, z) => inNear(x, z) ? bil(NG, NH, x, z) : bil(FG, FH, x, z);
  C.heightAt = (x, z) => Math.max(C.groundH(x, z), C.deckHeight(x, z));
  C.terrainGrid = { near: NG, nearH: NH, far: FG, farH: FH };

  // ---- edits baked into the near grid ----
  function edit(x0, z0, x1, z1, fn) {
    const j0 = Math.max(0, Math.floor((x0 - NG.x0) / NG.dx)), j1 = Math.min(NG.nx - 1, Math.ceil((x1 - NG.x0) / NG.dx));
    const i0 = Math.max(0, Math.floor((z0 - NG.z0) / NG.dx)), i1 = Math.min(NG.nz - 1, Math.ceil((z1 - NG.z0) / NG.dx));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * NG.nx + j; NH[k] = fn(NG.x0 + j * NG.dx, NG.z0 + i * NG.dx, NH[k]);
    }
  }
  const pad = (x, z, r, m, y) => edit(x - r - m, z - r - m, x + r + m, z + r + m, (px, pz, h) =>
    C.lerp(y, h, C.smooth(r, r + m, Math.hypot(px - x, pz - z))));
  // straight band from p0 to p1 (y linear); mode 'set' | 'cut' (only lowers)
  function band(p0, p1, w, m, mode = 'set', dy = 0) {
    const dx = p1.x - p0.x, dz = p1.z - p0.z, L2 = dx * dx + dz * dz;
    edit(Math.min(p0.x, p1.x) - w - m, Math.min(p0.z, p1.z) - w - m, Math.max(p0.x, p1.x) + w + m, Math.max(p0.z, p1.z) + w + m, (px, pz, h) => {
      const t = C.clamp(((px - p0.x) * dx + (pz - p0.z) * dz) / L2, 0, 1);
      const d = Math.hypot(px - p0.x - dx * t, pz - p0.z - dz * t), y = C.lerp(p0.y, p1.y, t) + dy;
      const k = 1 - C.smooth(w, w + m, d);
      return mode === 'cut' ? Math.min(h, C.lerp(h, y, k)) : C.lerp(h, y, k);
    });
  }
  // railway formation: flatten under the track, slightly below rail head
  const RC = C.DATA.rail.centre;
  for (let i = 0; i + 5 < RC.length; i += 3) {
    const p0 = { x: RC[i], y: RC[i + 1] - 0.75, z: RC[i + 2] }, p1 = { x: RC[i + 3], y: RC[i + 4] - 0.75, z: RC[i + 5] };
    if (inNear(p0.x, p0.z)) band(p0, p1, 4.5, 3);
  }
  const P = (k, dy = 0) => ({ x: A[k].x, y: A[k].y + dy, z: A[k].z });
  // shrine + tram base terrace, tram top, summit mine yard, path to the rock
  A.shrine.y = 49.5; A.tramBase.y = 52.5; A.tramTop.y = 165; A.jizo.y = 169.5; A.mineShrine.y = 174.5; A.cliffRock.y = 166.2;
  pad(A.shrine.x, A.shrine.z, 10, 6, A.shrine.y);
  pad(A.tramBase.x, A.tramBase.z, 5, 5, A.tramBase.y);
  band(P('shrine'), P('tramBase'), 2.2, 3);
  // hill-tram cutting: a straight incline, the ground cut down to just under the track ("tunnel of leaves")
  band(P('tramBase', -0.4), P('tramTop', -0.4), 3.2, 6, 'cut');
  pad(A.tramTop.x, A.tramTop.z, 6, 5, A.tramTop.y);
  band(P('tramTop'), P('jizo'), 1.4, 2.5); band(P('jizo'), P('mineShrine'), 1.4, 2.5);
  pad(A.mineShrine.x, A.mineShrine.z, 11, 7, A.mineShrine.y);
  band(P('mineShrine'), P('cliffRock', -0.6), 2.2, 4);
  pad(A.cliffRock.x, A.cliffRock.z, 3.5, 3, A.cliffRock.y - 0.6);
  // the old mine cut: a sheer drop in front (WNW) of the rock
  {
    const r = A.cliffRock, fx = Math.sin(r.rot), fz = Math.cos(r.rot);   // local +Z of rot
    edit(r.x - 60, r.z - 60, r.x + 60, r.z + 60, (px, pz, h) => {
      const dx = px - r.x, dz = pz - r.z, u = dx * fx + dz * fz, v = Math.abs(dx * fz - dz * fx);
      if (u < 2) return h;
      const w = 1 - C.smooth(7 + u * 0.5, 12 + u * 0.7, v), fade = 1 - C.smooth(30, 55, u);
      return Math.min(h, C.lerp(h, r.y - 8 - (u - 2) * 1.6, w * fade));
    });
  }
  // the old town lane (参道) climbing the valley from the street to the shrine's torii
  A.townStreet = [[96, -150], [94, -185], [91, -225], [87, -265], [83, -300], [81, -322]].map(([x, z]) => ({ x, z, y: 0 }));
  A.shrine.rot = 0.08;   // approach faces down the lane (local +Z toward town)
  {
    const S = A.townStreet, y0 = 13.2, y1 = 47.5;
    let L = 0; const acc = [0]; for (let i = 1; i < S.length; i++) acc.push(L += Math.hypot(S[i].x - S[i - 1].x, S[i].z - S[i - 1].z));
    S.forEach((p, i) => { p.y = C.lerp(y0, y1, acc[i] / L); });
    for (let i = 1; i < S.length; i++) band(S[i - 1], S[i], 3.2, 4);
    band(S[S.length - 1], { x: A.shrine.x, y: A.shrine.y, z: A.shrine.z + 14 }, 3.2, 4);
    A.lanternStreet = S;
  }
  // the empty lot east of the station: smooth and level
  pad(A.parkingLot.x, A.parkingLot.z, 26, 8, 4.7);

  // ---- the station at 1 m: exact track bed, the sea wall's drop, the sand beach (a patch mesh replaces the 5 m one) ----
  const ST = C.DATA.rail.station, scr = Math.cos(ST.rot), ssr = Math.sin(ST.rot);
  const toSN = (x, z) => { const dx = x - ST.x0, dz = z - ST.z0; return [dx * ssr + dz * scr, dx * scr - dz * ssr]; };
  const RYS = [], RYS0 = -80;   // rail-head height by s (1 m steps), from the rail centre line
  for (let s = RYS0; s <= 200; s++) {
    const x = ST.x0 + ST.n0 * scr + s * ssr, z = ST.z0 - ST.n0 * ssr + s * scr; let b = 1e18, y = 5;
    for (let i = 0; i < RC.length; i += 3) { const d = (RC[i] - x) ** 2 + (RC[i + 2] - z) ** 2; if (d < b) { b = d; y = RC[i + 1]; } }
    RYS.push(y);
  }
  // smooth the rail profile (no kinks under the platforms)
  for (let p = 0; p < 6; p++) for (let i = 1; i < RYS.length - 1; i++) RYS[i] = (RYS[i - 1] + 2 * RYS[i] + RYS[i + 1]) / 4;
  C.railYs = (s) => { const f = C.clamp(s - RYS0, 0, RYS.length - 1.001), i = f | 0; return C.lerp(RYS[i], RYS[i + 1], f - i); };
  const SZ = { s0: -34, s1: 140, n0: -36, n1: 30, m: 8 }, NW = -7.1;   // zone (station frame) and sea-wall face line
  const XS = 0, XW = 2.8;   // level crossing: centre s and half-width of the road (the coast road crosses at right angles)
  C.stationZone = Object.assign({ NW, toSN, XS, XW }, SZ);
  const NH0 = NH.slice();
  function profile(s, n, base) {
    const form = C.railYs(s) - 0.75;
    let h;
    if (s < 6) h = Math.abs(n - ST.n0) < 4.5 ? form : C.lerp(form, base, C.smooth(4.5, 9, Math.abs(n - ST.n0)));
    else {
      const beach = Math.min(base, form - 3.0 - Math.max(0, (NW - 1 - n)) * 0.035);
      const land = n < 8 ? form : C.lerp(form, base, C.smooth(8, 15, n));
      h = n <= NW - 1.0 ? Math.max(-2, beach) : n >= NW - 0.1 ? land : C.lerp(Math.max(-2, beach), land, (n - (NW - 1.0)) / 0.9);
      if (s < 12) h = C.lerp(Math.abs(n - ST.n0) < 4.5 ? form : base, h, C.smooth(6, 12, s));
    }
    // the level crossing: the road rises to the rail heads across the formation, and ramps down to the lot / coast road
    const dx = Math.abs(s - XS);
    if (dx < XW + 2.5) {
      const yR = C.railYs(s) - 0.03, dn = n - ST.n0;
      const road = dn > 4.5 ? C.lerp(yR, base, C.smooth(4.5, 12, dn)) : dn < -4.5 ? C.lerp(yR, base, C.smooth(4.5, 14, -dn)) : yR;
      h = C.lerp(h, road, 1 - C.smooth(XW, XW + 2.5, dx));
    }
    const w = Math.min(C.smooth(SZ.s0, SZ.s0 + SZ.m, s), 1 - C.smooth(SZ.s1 - SZ.m, SZ.s1, s), C.smooth(SZ.n0, SZ.n0 + SZ.m, n), 1 - C.smooth(SZ.n1 - SZ.m, SZ.n1, n));
    return C.lerp(base, h, w);
  }
  // world AABB of the zone, snapped out to the 5 m grid
  const PR = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
  for (const [s, n] of [[SZ.s0, SZ.n0], [SZ.s0, SZ.n1], [SZ.s1, SZ.n0], [SZ.s1, SZ.n1]]) {
    const x = ST.x0 + n * scr + s * ssr, z = ST.z0 - n * ssr + s * scr;
    PR.x0 = Math.min(PR.x0, x); PR.x1 = Math.max(PR.x1, x); PR.z0 = Math.min(PR.z0, z); PR.z1 = Math.max(PR.z1, z);
  }
  PR.j0 = Math.floor((PR.x0 - NG.x0) / NG.dx) - 1; PR.j1 = Math.ceil((PR.x1 - NG.x0) / NG.dx) + 1;
  PR.i0 = Math.floor((PR.z0 - NG.z0) / NG.dx) - 1; PR.i1 = Math.ceil((PR.z1 - NG.z0) / NG.dx) + 1;
  PR.x0 = NG.x0 + PR.j0 * NG.dx; PR.x1 = NG.x0 + PR.j1 * NG.dx; PR.z0 = NG.z0 + PR.i0 * NG.dx; PR.z1 = NG.z0 + PR.i1 * NG.dx;
  const inPatch = (x, z) => x >= PR.x0 && x <= PR.x1 && z >= PR.z0 && z <= PR.z1;
  const patchH = (x, z) => { const [s, n] = toSN(x, z); return profile(s, n, bil(NG, NH0, x, z)); };
  C.groundH = (x, z) => inPatch(x, z) ? patchH(x, z) : inNear(x, z) ? bil(NG, NH, x, z) : bil(FG, FH, x, z);
  // bake the profile into the 5 m grid too (sea mask, coarse queries stay consistent)
  for (let i = PR.i0; i <= PR.i1; i++) for (let j = PR.j0; j <= PR.j1; j++) NH[i * NG.nx + j] = patchH(NG.x0 + j * NG.dx, NG.z0 + i * NG.dx);
  C.stationPatch = PR;
  for (const k in A) if (!['station', 'shrine', 'tramBase', 'tramTop', 'jizo', 'mineShrine', 'cliffRock', 'parkingLot', 'townStreet', 'lanternStreet'].includes(k)) A[k].y = C.groundH(A[k].x, A[k].z);
  A.parkingLot.y = 4.7;

  // ---- land cover (coarse 10 m mask from OSM) ----
  const LC = { dx: 10, x0: NG.x0, z0: NG.z0, nx: Math.ceil((NX1 - NG.x0) / 10) + 1, nz: Math.ceil((NZ1 - NG.z0) / 10) + 1 };
  LC.urban = new Float32Array(LC.nx * LC.nz); LC.wood = new Uint8Array(LC.nx * LC.nz);
  const lci = (x, z) => { const j = Math.round((x - LC.x0) / LC.dx), i = Math.round((z - LC.z0) / LC.dx); return (j < 0 || i < 0 || j >= LC.nx || i >= LC.nz) ? -1 : i * LC.nx + j; };
  const stamp = (x, z, r, v) => {
    for (let a = -r; a <= r; a += LC.dx) for (let b = -r; b <= r; b += LC.dx) { const k = lci(x + a, z + b); if (k >= 0) LC.urban[k] = Math.max(LC.urban[k], v * (1 - Math.hypot(a, b) / (r + 10))); }
  };
  for (const b of C.DATA.osm.buildings) { let cx = 0, cz = 0; const n = b.p.length / 2; for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i]; cz += b.p[i + 1]; } stamp(cx / n, cz / n, 30, 1); }
  for (const r of C.DATA.osm.roads) for (let i = 0; i < r.p.length; i += 2) stamp(r.p[i], r.p[i + 1], 20, r.k === 'residential' ? 0.9 : 0.6);
  // point-in-polygon for wood areas
  const pip = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const zi = p[i + 1], zj = p[j + 1]; if ((zi > z) !== (zj > z) && x < (p[j] - p[i]) * (z - zi) / (zj - zi) + p[i]) c = !c; } return c; };
  for (const a of C.DATA.osm.areas) if (a.k === 'natural=wood' || a.k === 'landuse=forest') {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < a.p.length; i += 2) { x0 = Math.min(x0, a.p[i]); x1 = Math.max(x1, a.p[i]); z0 = Math.min(z0, a.p[i + 1]); z1 = Math.max(z1, a.p[i + 1]); }
    for (let x = x0; x <= x1; x += LC.dx) for (let z = z0; z <= z1; z += LC.dx) { const k = lci(x, z); if (k >= 0 && pip(x, z, a.p)) LC.wood[k] = 1; }
  }
  C.urbanAt = (x, z) => { const k = lci(x, z); return k < 0 ? 0 : LC.urban[k]; };
  C.slopeAt = (x, z) => { const e = 2.5; return Math.hypot(C.groundH(x + e, z) - C.groundH(x - e, z), C.groundH(x, z + e) - C.groundH(x, z - e)) / (2 * e); };
  C.landcoverAt = (x, z) => {
    const h = C.groundH(x, z);
    if (h < 0.05) return 'sea';
    if (h < 2.6 && C.groundH(x - 12, z) < 0.05 || h < 2.6 && C.groundH(x, z + 12) < 0.05 || h < 2.6 && C.groundH(x, z - 12) < 0.05) return 'beach';
    const s = C.slopeAt(x, z), u = C.urbanAt(x, z), k = lci(x, z);
    if (s > 1.1) return 'rock';
    if (u > 0.35 && h < 60) return 'urban';
    if ((k >= 0 && LC.wood[k]) || h > 22 || s > 0.45) return 'forest';
    return h < 12 ? 'grass' : 'forest';
  };

  // ---- colours ----
  const col = new T.Color(), tmp = new T.Color();
  const COLORS = { sea: 0xb9ad8f, beach: 0xc9bfa8, rock: 0x8d8073, urban: 0x8f9a7e, grass: 0x7fb257, forest: 0x4f8f45 };
  function surfaceColor(x, z, h) {
    const lc = C.landcoverAt(x, z), n = C.fbm(x * 0.02, z * 0.02);
    col.set(COLORS[lc]);
    if (lc === 'forest') col.lerp(tmp.set(0x6aa84f), n * 0.8).lerp(tmp.set(0x3d6e3c), C.smooth(0.5, 0.75, C.fbm(x * 0.05 + 7, z * 0.05)) * 0.6);
    else if (lc === 'grass') col.lerp(tmp.set(0x9fca6a), n);
    else if (lc === 'urban') col.lerp(tmp.set(0x7f8a72), n * 0.8).lerp(tmp.set(0x9a9890), C.smooth(0.55, 0.8, C.fbm(x * 0.07, z * 0.07)) * 0.5);
    else if (lc === 'rock') col.lerp(tmp.set(0x6f6258), n);
    else if (lc === 'sea') col.lerp(tmp.set(0x7e8a78), C.smooth(-0.5, -6, h));
    return col;
  }

  const tmpV = new T.Vector3();
  function gridMesh(g, H, step, lower, tc) {
    const nx = Math.floor((g.nx - 1) / step) + 1, nz = Math.floor((g.nz - 1) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), colr = new Float32Array(nx * nz * 3);
    let p = 0;
    for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
      const x = g.x0 + j * step * g.dx, z = g.z0 + i * step * g.dx;
      let h = H[i * step * g.nx + j * step];
      if (lower) {   // far mesh: sink under the near mesh
        const m = Math.min(x - NG.x0, NX1 - x, z - NG.z0, NZ1 - z);
        if (m > -g.dx) h = m > g.dx ? -400 : h - 1.5;
        if (h < 0) h -= 3;   // seabed well below the surface: no z-fighting with the sea at grazing angles, kilometres out
      }
      pos[p] = x; pos[p + 1] = h; pos[p + 2] = z;
      const c = lower ? (h < 0.05 ? col.set(0x8a8f7c) : col.set(0x4f8a48).lerp(tmp.set(0x6f8f6a), C.smooth(150, 700, h)).lerp(tmp.set(0x6a9a55), C.fbm(x * 0.0006, z * 0.0006) * 0.5)) : surfaceColor(x, z, h);
      colr[p] = c.r; colr[p + 1] = c.g; colr[p + 2] = c.b; p += 3;
    }
    // indices are written tile by tile (tc × tc cells), so each tile can be its own frustum-culled mesh
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6), ranges = []; let q = 0;
    const P = !lower && step === 1 ? C.stationPatch : null;
    for (let ti = 0; ti < nz - 1; ti += tc) for (let tj = 0; tj < nx - 1; tj += tc) {
      const q0 = q, bb = new T.Box3();
      for (let i = ti; i < Math.min(ti + tc, nz - 1); i++) for (let j = tj; j < Math.min(tj + tc, nx - 1); j++) {
        if (P && i >= P.i0 && i < P.i1 && j >= P.j0 && j < P.j1) continue;   // the 1 m station patch covers these cells
        const a = i * nx + j, b = a + 1, c = a + nx, d = c + 1;
        idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
        for (const v of [a, d]) bb.expandByPoint(tmpV.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
        bb.expandByPoint(tmpV.set(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2])); bb.expandByPoint(tmpV.set(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]));
      }
      if (q > q0) ranges.push([q0, q, bb]);
    }
    const posA = new T.BufferAttribute(pos, 3), colA = new T.BufferAttribute(colr, 3);
    const full = new T.BufferGeometry(); full.setAttribute('position', posA); full.setIndex(new T.BufferAttribute(idx.subarray(0, q), 1));
    full.computeVertexNormals();   // over the whole grid: no seams between tiles
    // tiles share the vertex buffers; each gets its own index range and bounds
    return ranges.map(([a, b, bb]) => {
      const g = new T.BufferGeometry(); g.setAttribute('position', posA); g.setAttribute('normal', full.attributes.normal); g.setAttribute('color', colA);
      g.setIndex(new T.BufferAttribute(idx.slice(a, b), 1)); g.boundingBox = bb; g.boundingSphere = bb.getBoundingSphere(new T.Sphere());
      return g;
    });
  }

  // 1 m patch over the station: sand beach, ballast-coloured formation, the lot
  function patchMesh() {
    const P = C.stationPatch, nx = Math.round(P.x1 - P.x0) + 1, nz = Math.round(P.z1 - P.z0) + 1;
    const pos = new Float32Array(nx * nz * 3), colr = new Float32Array(nx * nz * 3), Z = C.stationZone;
    let p = 0;
    for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
      const x = P.x0 + j, z = P.z0 + i, h = C.groundH(x, z), [s, n] = Z.toSN(x, z);
      pos[p] = x; pos[p + 1] = h; pos[p + 2] = z;
      const inZ = s > Z.s0 + 4 && s < Z.s1 - 4 && n > Z.n0 + 4 && n < Z.n1 - 4, nz2 = C.fbm(x * 0.15, z * 0.15);
      let c;
      if (inZ && s > 6 && n < Z.NW - 0.9) c = col.set(0xdccdaa).lerp(tmp.set(0xc4b48f), nz2 * 0.8).lerp(tmp.set(0xa99d86), C.smooth(1.2, 0.2, h));   // sand, darker where wet
      else if (inZ && Math.abs(n - 0.2) < 7.5 && s > -6) c = col.set(0x8f877b).lerp(tmp.set(0x7a7268), nz2);                                         // track bed
      else if (n > 15.6 && n < 23.2 && s > -4 && s < 25) c = col.set(0x7a7c7f).lerp(tmp.set(0x6b6d71), nz2);                                        // asphalt forecourt of the station house
      else c = surfaceColor(x, z, h);
      colr[p] = c.r; colr[p + 1] = c.g; colr[p + 2] = c.b; p += 3;
    }
    const idx = [];
    for (let i = 0; i < nz - 1; i++) for (let j = 0; j < nx - 1; j++) { const a = i * nx + j, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(colr, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }

  C.buildTerrain = function (scene) {
    // soft ramp: the hard 3-band toon ramp stripes the DEM's small bumps when the sun is low
    const ramp = new T.DataTexture(new Uint8Array([95, 95, 95, 255, 165, 165, 165, 255, 225, 225, 225, 255, 255, 255, 255, 255]), 4, 1, T.RGBAFormat);
    ramp.minFilter = ramp.magFilter = T.LinearFilter; ramp.needsUpdate = true;
    const mat = new T.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
    // painterly variation: soft noise mottling + exposed rock bands on steep faces
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWN;
        float th(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float tn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(th(i), th(i+vec2(1,0)), u.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), u.x), u.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float mott = tn(vWPos.xz * 0.35) * 0.5 + tn(vWPos.xz * 1.3) * 0.5;
          diffuseColor.rgb *= 0.92 + 0.16 * mott;
          float steep = 1.0 - smoothstep(0.35, 0.6, normalize(vWN).y);
          float strata = 0.85 + 0.15 * step(0.5, fract(vWPos.y * 0.45 + tn(vWPos.xz * 0.2)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50, 0.45, 0.40) * strata, steep * 0.85);`);
    };
    const near = new T.Group(), far = new T.Group();   // 400 m tiles (near, 5 m grid) and 6 km tiles (far): off-screen tiles are culled
    for (const g of gridMesh(NG, NH, 1, false, 80)) { const m = new T.Mesh(g, mat); m.receiveShadow = true; near.add(m); }
    for (const g of gridMesh(FG, FH, 1, true, 50)) far.add(new T.Mesh(g, mat));   // full 120 m: its coastline must match the sea mask (6 km tiles keep it cheap)
    const patch = new T.Mesh(patchMesh(), mat); patch.receiveShadow = true;
    scene.add(near, far, patch); C.terrainPatch = patch;
    C.terrainMesh = near; C.terrainFar = far;
    return { near, far };
  };
})(window.CITY);
