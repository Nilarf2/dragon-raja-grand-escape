// Town buildings from the Blender library (js/data/models_town.js, built by tools/town_build.py).
// Houses are merged per 120 m tile (mid and far LOD) and per 60 m cell near the camera (near LOD). The switch between
// near and mid happens per house in the vertex shader (the house centre is a vertex attribute), so there are no holes
// and no popping in walking range. Everything is vertex-coloured: base colour × per-house palette × baked AO.
(function (C) {
  const T = THREE;
  const LIB = C.MODELS && C.MODELS.town;
  if (!LIB) return;
  const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const PAL = b64(LIB.pal);
  const byName = {};
  for (const e of LIB.list) byName[e.n] = e;

  // ---- decode one LOD of a variant (cached): positions in metres, face normals, colour bytes, triangle fan indices
  function decode(e, lod) {
    e._d = e._d || [];
    if (e._d[lod]) return e._d[lod];
    const L = e.lods[lod], q = 1 / LIB.q;
    const pi = new Int16Array(b64(L.p).buffer), n = pi.length / 3, pos = new Float32Array(n * 3);
    for (let i = 0; i < pi.length; i++) pos[i] = pi[i] * q;
    const col = b64(L.c), fs = b64(L.f), nor = new Float32Array(n * 3);
    let nt = 0; for (const k of fs) nt += k - 2;
    const idx = new Uint16Array(nt * 3);
    let v = 0, t = 0;
    for (const k of fs) {
      // Newell normal of the polygon
      let nx = 0, ny = 0, nz = 0;
      for (let j = 0; j < k; j++) {
        const a = (v + j) * 3, b = (v + (j + 1) % k) * 3;
        nx += (pos[a + 1] - pos[b + 1]) * (pos[a + 2] + pos[b + 2]); ny += (pos[a + 2] - pos[b + 2]) * (pos[a] + pos[b]); nz += (pos[a] - pos[b]) * (pos[a + 1] + pos[b + 1]);
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      for (let j = 0; j < k; j++) { nor[(v + j) * 3] = nx / l; nor[(v + j) * 3 + 1] = ny / l; nor[(v + j) * 3 + 2] = nz / l; }
      for (let j = 1; j < k - 1; j++) { idx[t++] = v; idx[t++] = v + j; idx[t++] = v + j + 1; }
      v += k;
    }
    let ink = null;
    if (L.kp) {
      const ki = new Int16Array(b64(L.kp).buffer), kf = b64(L.kf), kp = new Float32Array(ki.length);
      for (let i = 0; i < ki.length; i++) kp[i] = ki[i] * q;
      let m = 0; for (const k of kf) m += k - 2;
      const kidx = new Uint16Array(m * 3); let w = 0, u = 0;
      for (const k of kf) { for (let j = 1; j < k - 1; j++) { kidx[u++] = w; kidx[u++] = w + j; kidx[u++] = w + j + 1; } w += k; }
      ink = { pos: kp, idx: kidx };
    }
    return (e._d[lod] = { pos, nor, col, idx, n, ink });
  }

  // ---- palettes (linear-workflow hex, like the rest of the game). Silver-grey ibushi kawara dominates around Matsuyama.
  const hx = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  const P = {
    wall: [0xefe9dc, 0xe8e1d2, 0xf3f1ea, 0xddd3bf, 0xe4dccb, 0xd6d0c4, 0xece4d0, 0xc9c6bd, 0xe9dfc9, 0xdcd8cf].map(hx),
    wall2: [0xc9b79c, 0xb9a78d, 0xd3c6ae, 0x9fa3a6, 0xbfb6a8, 0xa89a86].map(hx),
    wallWood: [0x8a6a4c, 0x7a5a40, 0x6e5444, 0x9a7b5a].map(hx),
    roof: [0x8d939b, 0x868d96, 0x969ba2, 0x7d848e, 0x8f959c, 0x5f6876, 0x6d6560, 0x9a7c68].map(hx),
    roofW: [10, 10, 8, 8, 8, 4, 2, 1],
    roofMetal: [0x5d6b78, 0x7a3f36, 0x4c6a5c, 0x8c9096, 0x3f4752].map(hx),
    sash: [0xd9dadb, 0xc7c9cb, 0x6b5a4a, 0x4a4440].map(hx),
    wood: [0x7a5a40, 0x6b4c34, 0x8c6a4a, 0x5a4636].map(hx),
  };
  const pick = (a, r) => a[Math.floor(r * a.length) % a.length];
  const pickW = (a, w, r) => { const s = w.reduce((x, y) => x + y, 0); let k = r * s; for (let i = 0; i < a.length; i++) { k -= w[i]; if (k < 0) return a[i]; } return a[a.length - 1]; };
  function hrand(seed) { let s = (seed * 2654435761) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function palette(h) {
    const r = hrand(h.seed * 7 + 3), v = h.v, metal = v.k === 'shed' || v.n === 'shed2_modern';
    const wood = v.n === 'hip1_old' || v.n === 'gable2_narrow' || v.n === 'shop_old';
    return { 1: pick(P.wall, r()), 2: pick(P.wall2, r()), 3: metal ? pick(P.roofMetal, r()) : pickW(P.roof, P.roofW, r()), 4: pick(P.sash, r()), 6: wood ? pick(P.wallWood, r()) : pick(P.wood, r()), litP: 0.18 + r() * 0.3, seed: (r() * 1e6) | 0 };
  }

  // ---- geometry merge for a list of houses at one LOD
  function mergeHouses(list, lod, withHC) {
    let nv = 0, ni = 0, kv = 0, ki = 0;
    const parts = list.map(h => { const d = decode(h.v, Math.min(lod, h.v.lods.length - 1)); nv += d.n + 20; ni += d.idx.length + 30; if (d.ink && lod < 2) { kv += d.ink.pos.length / 3; ki += d.ink.idx.length; } return d; });
    const pos = new Float32Array(nv * 3), nor = new Int8Array(nv * 3), col = new Uint8Array(nv * 3), lit = new Uint8Array(nv), hc = withHC ? new Float32Array(nv * 2) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const kpos = kv ? new Float32Array(kv * 3) : null, khc = kv && withHC ? new Float32Array(kv * 2) : null, kidx = kv ? (kv > 65535 ? new Uint32Array(ki) : new Uint16Array(ki)) : null;
    let o = 0, oi = 0, ko = 0, koi = 0;
    list.forEach((h, hi) => {
      const d = parts[hi], c = Math.cos(h.rot), s = Math.sin(h.rot), sx = h.sx, sz = h.sz, pal = h.pal;
      const lr = hrand(pal.seed);
      const litWin = []; for (let w = 0; w < 32; w++) litWin.push(lr() < pal.litP ? 255 : 0);
      for (let i = 0; i < d.n; i++) {
        const lx = d.pos[i * 3] * sx, ly = d.pos[i * 3 + 1], lz = d.pos[i * 3 + 2] * sz, j = (o + i) * 3;
        pos[j] = h.x + lx * c + lz * s; pos[j + 1] = h.y + ly; pos[j + 2] = h.z - lx * s + lz * c;
        let nx = d.nor[i * 3] / sx, ny = d.nor[i * 3 + 1], nz = d.nor[i * 3 + 2] / sz; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        nor[j] = Math.round((nx * c + nz * s) * 127); nor[j + 1] = Math.round(ny * 127); nor[j + 2] = Math.round((-nx * s + nz * c) * 127);
        const ci = d.col[i * 3], ao = d.col[i * 3 + 1] / 255, pw = d.col[i * 3 + 2], part = pw >> 5;
        const a = 0.55 + 0.45 * Math.min(1, ao * 1.2);
        let r, g, b;
        if (part === 0 || part === 5) { r = PAL[ci * 3] / 255; g = PAL[ci * 3 + 1] / 255; b = PAL[ci * 3 + 2] / 255; }
        else { const f = PAL[ci * 3] / 255 / 0.8, pc = pal[part] || pal[1]; r = pc[0] * f; g = pc[1] * f; b = pc[2] * f; }
        col[j] = Math.min(255, r * a * 255); col[j + 1] = Math.min(255, g * a * 255); col[j + 2] = Math.min(255, b * a * 255);
        lit[o + i] = part === 5 ? litWin[pw & 31] : 0;
        if (hc) { hc[(o + i) * 2] = h.x; hc[(o + i) * 2 + 1] = h.z; }
      }
      for (let i = 0; i < d.idx.length; i++) idx[oi + i] = d.idx[i] + o;
      o += d.n; oi += d.idx.length;
      // podium under the house (concrete, or a stone retaining wall when tall): fills the slope down to the ground
      if (h.pod > 0.05) {
        const pw2 = h.w / 2 + 0.12, pd2 = h.d / 2 + 0.12, y0 = h.y - h.pod, y1 = h.y;
        const stone = h.pod > 1.2, base = stone ? [0.60, 0.58, 0.53] : [0.68, 0.68, 0.65];
        const corners = [[-pw2, -pd2], [pw2, -pd2], [pw2, pd2], [-pw2, pd2]];
        const v0 = o;
        for (let k = 0; k < 4; k++) {   // 4 sides, 4 vertices each
          const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
          const enx = (bz - az), enz = -(bx - ax), el = Math.hypot(enx, enz);
          for (const [px, pz, py] of [[ax, az, y0], [bx, bz, y0], [bx, bz, y1], [ax, az, y1]]) {
            const j = o * 3;
            pos[j] = h.x + px * c + pz * s; pos[j + 1] = py; pos[j + 2] = h.z - px * s + pz * c;
            const nx = enx / el, nz = enz / el;
            nor[j] = Math.round((nx * c + nz * s) * 127); nor[j + 1] = 0; nor[j + 2] = Math.round((-nx * s + nz * c) * 127);
            const sh = py === y0 ? 0.62 : 0.95;
            col[j] = base[0] * sh * 255; col[j + 1] = base[1] * sh * 255; col[j + 2] = base[2] * sh * 255;
            if (hc) { hc[o * 2] = h.x; hc[o * 2 + 1] = h.z; }
            o++;
          }
        }
        for (let k = 0; k < 4; k++) { const b = v0 + k * 4; idx[oi++] = b; idx[oi++] = b + 2; idx[oi++] = b + 1; idx[oi++] = b; idx[oi++] = b + 3; idx[oi++] = b + 2; }
        // top ledge (the 12 cm the podium stands out)
        const t0 = o;
        for (const [px, pz] of corners) { const j = o * 3; pos[j] = h.x + px * c + pz * s; pos[j + 1] = y1 - 0.01; pos[j + 2] = h.z - px * s + pz * c; nor[j + 1] = 127; col[j] = base[0] * 230; col[j + 1] = base[1] * 230; col[j + 2] = base[2] * 230; if (hc) { hc[o * 2] = h.x; hc[o * 2 + 1] = h.z; } o++; }
        idx[oi++] = t0; idx[oi++] = t0 + 2; idx[oi++] = t0 + 1; idx[oi++] = t0; idx[oi++] = t0 + 3; idx[oi++] = t0 + 2;
      }
      if (d.ink && kpos && lod < 2) {
        const P2 = d.ink.pos, n2 = P2.length / 3;
        for (let i = 0; i < n2; i++) {
          const lx = P2[i * 3] * sx, ly = P2[i * 3 + 1], lz = P2[i * 3 + 2] * sz, j = (ko + i) * 3;
          kpos[j] = h.x + lx * c + lz * s; kpos[j + 1] = h.y + ly; kpos[j + 2] = h.z - lx * s + lz * c;
          if (khc) { khc[(ko + i) * 2] = h.x; khc[(ko + i) * 2 + 1] = h.z; }
        }
        for (let i = 0; i < d.ink.idx.length; i++) kidx[koi + i] = d.ink.idx[i] + ko;
        ko += n2; koi += d.ink.idx.length;
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos.subarray(0, o * 3), 3));
    g.setAttribute('normal', new T.BufferAttribute(nor.subarray(0, o * 3), 3, true));
    g.setAttribute('color', new T.BufferAttribute(col.subarray(0, o * 3), 3, true));
    g.setAttribute('lit', new T.BufferAttribute(lit.subarray(0, o), 1, true));
    if (hc) g.setAttribute('hc', new T.BufferAttribute(hc.subarray(0, o * 2), 2));
    g.setIndex(new T.BufferAttribute(idx.subarray(0, oi), 1));
    g.computeBoundingSphere();
    let k = null;
    if (kpos && ko) {
      k = new T.BufferGeometry();
      k.setAttribute('position', new T.BufferAttribute(kpos.subarray(0, ko * 3), 3));
      if (khc) k.setAttribute('hc', new T.BufferAttribute(khc.subarray(0, ko * 2), 2));
      k.setIndex(new T.BufferAttribute(kidx.subarray(0, koi), 1));
      k.computeBoundingSphere();
    }
    return { g, k };
  }
  // free the CPU copies once the GPU has them
  function release(g) { if (!g) return; for (const k in g.attributes) g.attributes[k].onUpload(function () { this.array = null; }); if (g.index) g.index.onUpload(function () { this.array = null; }); }

  // ---- materials: per-house LOD cut in the vertex shader, lit windows at night
  const U = { uCam: { value: new T.Vector3() }, uR0: { value: 70 }, uNight: { value: 0 } };
  function patch(m, side) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uSide: { value: side } });
      const lit = !!m.vertexColors;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        attribute vec2 hc; uniform vec3 uCam; uniform float uR0; uniform float uSide;${lit ? ' attribute float lit; varying float vLit;' : ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (uSide != 0.0 && uSide * (distance(hc, uCam.xz) - uR0) > 0.0) transformed = vec3(0.0);${lit ? ' vLit = lit;' : ''}`);
      if (lit) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLit; uniform float uNight;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.76, 0.46) * vLit * uNight * 1.1;');
    };
    m.customProgramCacheKey = () => 'town' + side + (m.vertexColors ? 'c' : 'k');
    return m;
  }
  const bodyMat = [1, -1, 0].map(s => patch(new T.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: C.gradient }), s));
  const inkMat = [1, -1, 0].map(s => patch(new T.MeshBasicMaterial({ color: 0x2a2630, side: T.BackSide }), s));

  // ---- the town registry
  const houses = [];
  const TILE = 120, CELL = 60;
  C.Town3D = {
    lib: LIB, byName, houses,
    /** pick the variant that best fits a footprint. opts: kinds ['house'], style 'old'|'new'|'any', seed */
    choose(w, d, opts = {}) {
      const kinds = opts.kinds || ['house'], r = hrand((opts.seed || 1) * 31 + 7);
      const c = LIB.list.filter(e => kinds.includes(e.k) && (!opts.style || opts.style === 'any' || e.st === opts.style || e.st === 'any') && (!opts.floors || e.floors === opts.floors || opts.floorsLoose));
      const list = (c.length ? c : LIB.list.filter(e => kinds.includes(e.k))).map(e => ({ e, s: Math.abs(Math.log(w / e.w)) + Math.abs(Math.log(d / e.d)) + r() * 0.25 }));
      list.sort((a, b) => a.s - b.s);
      return list[Math.floor(r() * Math.min(3, list.length))].e;
    },
    /** add a building: v = variant entry, (x, z) = footprint centre, w/d = footprint, rot = rotation.y (front = local +Z) */
    add(v, x, z, w, d, rot, seed, opts = {}) {
      const sx = C.clamp(w / v.w, 0.62, 1.3), sz = C.clamp(d / v.d, 0.62, 1.3), W = v.w * sx, D = v.d * sz;
      // floor at the highest footprint corner (no house sinks into the hill), podium down to the lowest one
      let gmax = -1e9, gmin = 1e9; const c = Math.cos(rot), s = Math.sin(rot);
      for (const [a, b] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [0, 0], [0, D / 2 + 0.6]]) {
        const g = C.groundH(x + a * c + b * s, z - a * s + b * c); gmax = Math.max(gmax, g); gmin = Math.min(gmin, g);
      }
      const y = opts.y ?? gmax + 0.02;
      const h = { v, x, z, y, rot, sx, sz, w: W, d: D, pod: y - gmin + 0.35, seed: seed | 0 };
      h.pal = palette(h);
      houses.push(h);
      C.addCollider(x, z, W / 2 + 0.25, D / 2 + 0.35, rot);
      return h;
    },
    build(scene) {
      const tiles = new Map(), cells = new Map();
      for (const h of houses) {
        const tk = Math.floor(h.x / TILE) + ',' + Math.floor(h.z / TILE), ck = Math.floor(h.x / CELL) + ',' + Math.floor(h.z / CELL);
        if (!tiles.has(tk)) tiles.set(tk, { list: [], x0: Math.floor(h.x / TILE) * TILE, z0: Math.floor(h.z / TILE) * TILE, s: TILE, lod: -1 });
        if (!cells.has(ck)) cells.set(ck, { list: [], x0: Math.floor(h.x / CELL) * CELL, z0: Math.floor(h.z / CELL) * CELL, s: CELL });
        tiles.get(tk).list.push(h); cells.get(ck).list.push(h);
      }
      const mob = C.MOBILE, lite = /[?&]lite/.test(location.search);
      const R0 = mob ? 45 : lite ? 55 : 70, R1 = mob ? 240 : 380;
      U.uR0.value = R0;
      const group = C.dynamic(new T.Group()); group.name = 'town3d'; scene.add(group);
      const mk = (geo, mat, shadow) => { const m = new T.Mesh(geo, mat); m.castShadow = m.receiveShadow = shadow; m.matrixAutoUpdate = false; group.add(m); release(geo); return m; };
      const drop = (m) => { if (m) { group.remove(m); m.geometry.dispose(); } };
      // far LOD for every tile up front (small), mid LOD lazily, near LOD per cell lazily
      for (const t of tiles.values()) { const r = mergeHouses(t.list, 2, false); t.far = mk(r.g, bodyMat[2], !mob); }
      const dist = (b, p) => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x0 - b.s), Math.max(b.z0 - p.z, 0, p.z - b.z0 - b.s));
      let stat = { built: 0 };
      function update(cam) {
        U.uCam.value.copy(cam);
        for (const t of tiles.values()) {
          const d = dist(t, cam), want = d < R1 ? 1 : 2;
          if (want === 1 && !t.mid) { const r = mergeHouses(t.list, 1, true); t.mid = mk(r.g, bodyMat[1], !mob); t.midInk = r.k && !mob ? mk(r.k, inkMat[1], false) : null; stat.built++; }
          if (want === 2 && t.mid && d > R1 + 120) { drop(t.mid); drop(t.midInk); t.mid = t.midInk = null; }
          t.far.visible = want === 2;
          if (t.mid) { t.mid.visible = want === 1; t.mid.castShadow = !mob && d < 160; if (t.midInk) t.midInk.visible = want === 1; }
        }
        for (const c of cells.values()) {
          const d = dist(c, cam);
          if (d < R0 + 25 && !c.near) { const r = mergeHouses(c.list, 0, true); c.near = mk(r.g, bodyMat[0], true); c.nearInk = r.k ? mk(r.k, inkMat[0], false) : null; stat.built++; }
          else if (d > R0 + 90 && c.near) { drop(c.near); drop(c.nearInk); c.near = c.nearInk = null; }
          if (c.near) { c.near.visible = d < R0 + 5; if (c.nearInk) c.nearInk.visible = c.near.visible; }
        }
      }
      // tiles in mid range whose houses are all within the near radius would draw nothing: harmless (degenerate)
      C.onUpdate((dt, t, env) => { U.uNight.value = env.night; update(env.camera.position); });
      this.update = update; this.stat = stat;
      console.log('town3d', { houses: houses.length, tiles: tiles.size, cells: cells.size });
      return group;
    },
  };

  // vertex-coloured boxes on one shared material (block walls, gates): merged per tile by C.mergeStatic
  let VC = null;
  C.vcBox = (parent, w, h, d, hex, x, y, z, rot = 0, shadow = true) => {
    VC = VC || new T.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: C.gradient });
    const g = new T.BoxGeometry(w, h, d); C.tint(g, hex);
    // darker toward the bottom: cheap AO
    const p = g.attributes.position, cl = g.attributes.color;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { cl.setXYZ(i, cl.getX(i) * 0.7, cl.getY(i) * 0.7, cl.getZ(i) * 0.7); }
    const m = new T.Mesh(g, VC); m.position.set(x, y, z); m.rotation.y = rot; m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  };
})(window.CITY);
