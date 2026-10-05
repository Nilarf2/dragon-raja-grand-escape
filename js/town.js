// Takahama / Baishinji town: OSM roads and buildings draped on the real terrain, filler houses along streets,
// the forest, poles and wires, and the novel's places on their anchors (Ferris wheel, school, Botchan loco,
// the shrine lane with its shops and lanterns, hill tram, jizo, mine shrine, cliff rock, the red Porsche).
(function (C) {
  const T = THREE, A = C.ANCHORS, O = C.DATA.osm;
  const M4 = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), S = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
  const rotFacing = (dx, dz) => Math.atan2(dx, dz);    // rotation.y so local +Z points along (dx, dz)
  const pts = (p) => { const o = []; for (let i = 0; i < p.length; i += 2) o.push([p[i], p[i + 1]]); return o; };

  // ---- spatial hash of "occupied" ground (roads, buildings) for filler placement ----
  const occ = new Map(), CELL = 4;
  const key = (x, z) => (Math.floor(x / CELL) * 73856093) ^ (Math.floor(z / CELL) * 19349663);
  const mark = (x, z, r) => { for (let a = -r; a <= r; a += CELL) for (let b = -r; b <= r; b += CELL) occ.set(key(x + a, z + b), 1); };
  const busy = (x, z, r) => { for (let a = -r; a <= r; a += CELL) for (let b = -r; b <= r; b += CELL) if (occ.has(key(x + a, z + b))) return true; return false; };

  // ---- roads: draped ribbons, one merged mesh per surface ----
  function buildRoads(scene) {
    const groups = { asphalt: [], lane: [], path: [] };
    // C.roadHoles (oriented rects, e.g. the level crossing) draw their own surface: no ribbon there
    const holes = C.roadHoles || [];
    const inHole = (x, z) => holes.some(k => { const [u, v] = C.toLocal2(x, z, k.x, k.z, k.c, k.s); return Math.abs(u) < k.hw && Math.abs(v) < k.hd; });
    const nearHole = (x, z) => holes.some(k => Math.hypot(x - k.x, z - k.z) < k.hw + k.hd + 20);
    const add = (poly, w, kind) => {
      const P = pts(poly), out = groups[kind];
      let prev = null;
      for (let i = 0; i < P.length - 1; i++) {
        const [x0, z0] = P[i], [x1, z1] = P[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.ceil(L / (nearHole(x0, z0) || nearHole(x1, z1) ? 0.5 : 3)));
        const nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
        for (let k = (i ? 1 : 0); k <= n; k++) {
          const x = C.lerp(x0, x1, k / n), z = C.lerp(z0, z1, k / n);
          const l = [x + nx * w / 2, z + nz * w / 2], r = [x - nx * w / 2, z - nz * w / 2];
          const row = [l[0], C.heightAt(l[0], l[1]) + 0.08, l[1], r[0], C.heightAt(r[0], r[1]) + 0.08, r[1]];
          row.hole = inHole(x, z);
          if (prev && !prev.hole && !row.hole) out.push(prev, row);
          prev = row; mark(x, z, w / 2 + 1);
        }
      }
    };
    for (const r of O.roads) add(r.p, r.w, r.w >= 6 ? 'asphalt' : 'lane');
    for (const r of O.paths) add(r.p, r.w, 'path');
    const mats = { asphalt: C.toon(0x6c6f74, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      lane: C.toon(0x8e8f8c, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      path: C.toon(0xb8ab92, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) };
    for (const k in groups) {
      const pos = [];
      for (let i = 0; i < groups[k].length; i += 2) {
        const a = groups[k][i], b = groups[k][i + 1];
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2], a[3], a[4], a[5], a[3], a[4], a[5], b[0], b[1], b[2], b[3], b[4], b[5]);
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      // ribbons may wind either way: render both sides
      mats[k].side = T.DoubleSide;
      const m = new T.Mesh(g, mats[k]); m.receiveShadow = true; scene.add(m);
    }
  }

  // ---- buildings ----
  function minRect(P) {   // minimum-area oriented rectangle → {cx, cz, w, d, rot}
    let best = null;
    for (let i = 0; i < P.length; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length], a = Math.atan2(x1 - x0, z1 - z0), c = Math.cos(a), s = Math.sin(a);
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const [x, z] of P) { const u = x * c - z * s, v = x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const area = (u1 - u0) * (v1 - v0);
      if (!best || area < best.area) { const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2; best = { area, w: u1 - u0, d: v1 - v0, rot: a, cx: uc * c + vc * s, cz: -uc * s + vc * c }; }
    }
    return best;
  }
  const wallCols = [0xeee6d6, 0xe6dccb, 0xd9cdb8, 0xf2efe6, 0xcfc4b0, 0xe9e2d8];
  const roofCols = [0x4a5568, 0x5b6474, 0x6e4a3a, 0x3f4b5c, 0x7a7f88];
  // larger buildings: rows of windows painted in the shader on vertical faces (world-space grid), a few lit at night
  const nightU = { value: 0 };
  C.onUpdate((dt, t, env) => { nightU.value = env.night; });
  const flatMats = [0xffffff].map(c => {   // one vertex-coloured material for all of them (one draw call per tile)
    const m = new T.MeshToonMaterial({ color: c, vertexColors: true, gradientMap: C.gradient });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = nightU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBP; varying vec3 vBN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBP = (modelMatrix * vec4(transformed, 1.0)).xyz; vBN = mat3(modelMatrix) * objectNormal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBP; varying vec3 vBN; uniform float uNight; float bWin = 0.0, bLit = 0.0;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 bn = normalize(vBN);
          if (abs(bn.y) < 0.4) {
            vec2 t = normalize(vec2(-bn.z, bn.x));
            float u = dot(vBP.xz, t) / 2.7, v = (vBP.y - 1.0) / 3.0;
            vec2 f = fract(vec2(u, v));
            bWin = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.74) * step(0.0, v);
            float rnd = fract(sin(dot(floor(vec2(u, v)) + floor(vBP.xz * 0.02), vec2(12.9898, 78.233))) * 43758.5453);
            bLit = bWin * step(0.6, rnd);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.25, 0.30) + vec3(0.25) * step(0.5, f.x) * step(0.9, f.y + 0.3 - f.x * 0.4), bWin * 0.9);
          }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * bLit * uNight * 0.9;');
    };
    return m;
  });
  function flatBuilding(scene, P, h, seed) {   // extruded footprint with a flat roof (larger buildings)
    const shape = new T.Shape(P.map(([x, z]) => new T.Vector2(x, -z)));
    let gmin = 1e9; for (const [x, z] of P) gmin = Math.min(gmin, C.groundH(x, z));
    const geo = new T.ExtrudeGeometry(shape, { depth: h + 2, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
    C.tint(geo, wallCols[seed % wallCols.length]);
    const m = new T.Mesh(geo, flatMats[0]); m.position.y = gmin - 2; m.castShadow = m.receiveShadow = true;
    scene.add(m); C.outline(m, 0.05);
    return gmin + h;
  }
  function placeHouse(scene, x, z, w, d, rot, floors, seed) {
    const hs = C.makeTownHouse({ w, d, floors, seed });
    const g = hs.group; let gmin = 1e9;
    for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
      const c = Math.cos(rot), s = Math.sin(rot); gmin = Math.min(gmin, C.groundH(x + a * c + b * s, z - a * s + b * c));
    }
    g.position.set(x, gmin, z); g.rotation.y = rot; scene.add(g);
    // plinth so houses on slopes don't float
    const pl = C.box(w + 0.2, 2.5, d + 0.2, C.toon(0xb5ae9f), 0, -1.2, 0, g, false); pl.receiveShadow = true;
    C.addCollider(x, z, w / 2, d / 2, rot); mark(x, z, Math.max(w, d) / 2 + 1);
    return g;
  }
  function buildOSMBuildings(scene) {
    let i = 0;
    for (const b of O.buildings) {
      const P = pts(b.p); if (P.length < 3) continue;
      const r = minRect(P); i++;
      if (C.isReserved(r.cx, r.cz, 1)) continue;
      if (b.k === 'train_station') continue;
      if (r.area > 260 || b.lv > 2) {
        const top = flatBuilding(scene, P, b.h || Math.max(b.lv, r.area > 900 ? 3 : 2) * 3.4, i);
        C.addCollider(r.cx, r.cz, r.w / 2, r.d / 2, r.rot); mark(r.cx, r.cz, Math.max(r.w, r.d) / 2);
        r.top = top; b.rect = r;
      } else { placeHouse(scene, r.cx, r.cz, Math.max(4, r.w), Math.max(4, r.d), r.rot, r.area > 110 ? 2 : (i % 3 ? 2 : 1), i); b.rect = r; }
    }
  }
  // fill the built-up areas the sparse OSM data leaves empty: houses facing the streets
  function fillHouses(scene) {
    let n = 0;
    for (const r of O.roads) {
      if (!['residential', 'unclassified', 'tertiary', 'service', 'living_street'].includes(r.k)) continue;
      const P = pts(r.p);
      for (let i = 0; i < P.length - 1; i++) {
        const [x0, z0] = P[i], [x1, z1] = P[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 6) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
        for (let t = 4; t < L - 4; t += C.range(9, 13)) for (const side of [1, -1]) for (const row of [0, 1]) {
          const w = C.range(6.5, 9.5), d = C.range(6.5, 9), off = r.w / 2 + 1.5 + d / 2 + row * (d + C.range(2, 4));
          const x = x0 + ux * t - uz * off * side, z = z0 + uz * t + ux * off * side;
          const h = C.groundH(x, z);
          if (h < 1.5 || h > 75 || C.urbanAt(x, z) < 0.3 || C.slopeAt(x, z) > 0.32 || C.isReserved(x, z, 6) || busy(x, z, Math.max(w, d) / 2)) continue;
          if (C.rand() < 0.12) continue;
          placeHouse(scene, x, z, w, d, rotFacing(uz * side, -ux * side) + Math.PI, C.rand() < 0.7 ? 2 : 1, n++ * 7 + 3);
        }
      }
    }
    return n;
  }

  // ---- forest (instanced) ----
  function buildForest(scene) {
    const spots = [], cols = [];
    const greens = [0x5f9e48, 0x4e8a3f, 0x77b157, 0x3f7238, 0x8cc063, 0x6aa84f].map(c => new T.Color(c));
    const step = C.MOBILE ? 9 : 7;
    for (let x = -900; x < 880; x += step) for (let z = -1180; z < 780; z += step) {
      const px = x + C.range(-3, 3), pz = z + C.range(-3, 3);
      const lc = C.landcoverAt(px, pz);
      const nearLane = A.townStreet.some(p => Math.hypot(p.x - px, p.z - pz) < 22);
      if (lc !== 'forest' && !(lc === 'grass' && C.rand() < 0.04) && !(lc === 'urban' && nearLane && C.rand() < 0.15)) continue;
      if (C.isReserved(px, pz, 2) || busy(px, pz, 3)) continue;
      spots.push([px, C.groundH(px, pz), pz, C.range(0.75, 1.35)]);
      cols.push(greens[(C.rand() * greens.length) | 0].clone().multiplyScalar(C.range(0.9, 1.08)));
    }
    // chunked (160 m) so each chunk is frustum-culled on screen and in the shadow pass
    const canopyHi = new T.IcosahedronGeometry(1, 1), canopyLo = new T.IcosahedronGeometry(1, 0);   // rounder canopies only near the station
    for (const c of [canopyHi, canopyLo]) { c.scale(3.6, 3.0, 3.6); c.translate(0, 6.2, 0); }
    const trunk = new T.CylinderGeometry(0.22, 0.32, 4, 5); trunk.translate(0, 2, 0);
    const cmat = C.toon(0xffffff), tmat = C.toon(0x6b5444), chunks = new Map();
    spots.forEach((sp, i) => { const k = Math.floor(sp[0] / 160) + ',' + Math.floor(sp[2] / 160); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(i); });
    const lods = [];
    for (const [key, list] of chunks) {
      const cm = new T.InstancedMesh(canopyLo, cmat, list.length), tm = new T.InstancedMesh(trunk, tmat, list.length);
      list.forEach((i, j) => {
        const [x, y, z, s] = spots[i];
        M4.compose(V.set(x, y - 0.3, z), Q.setFromAxisAngle(UP, C.rand() * 6.28), S.set(s * C.range(0.85, 1.15), s, s * C.range(0.85, 1.15)));
        cm.setMatrixAt(j, M4); tm.setMatrixAt(j, M4); cm.setColorAt(j, cols[i]);
      });
      cm.castShadow = true; cm.receiveShadow = true;
      scene.add(C.instBounds(cm), C.instBounds(tm));
      const lo = cm.geometry, hi = canopyHi.clone(); hi.boundingSphere = lo.boundingSphere.clone();
      lods.push({ cm, tm, lo, hi, c: lo.boundingSphere.center });
    }
    // distance LOD per chunk: round canopies within ~250 m of the camera, 20-triangle ones beyond, no trunks far away
    let acc = 1;
    C.onUpdate((dt, t, env) => {
      if ((acc += dt) < 0.3) return; acc = 0;
      const p = env.camera.position;
      for (const L of lods) { const d = Math.hypot(L.c.x - p.x, L.c.z - p.z); L.cm.geometry = d < 250 ? L.hi : L.lo; L.tm.visible = d < 420; }
    });
    return spots.length;
  }

  // ---- utility poles + sagging wires along a polyline ----
  function poleLine(scene, P, every = 24, lamp = false) {
    const out = [];
    let acc = every;
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      for (let t = acc; t < L; t += every) {
        const nx = -(z1 - z0) / L, nz = (x1 - x0) / L, x = C.lerp(x0, x1, t / L) + nx * 3.4, z = C.lerp(z0, z1, t / L) + nz * 3.4;
        out.push([x, C.groundH(x, z), z]);
      }
      acc = every - ((L - acc) % every);
    }
    const poleG = new T.CylinderGeometry(0.13, 0.18, 9, 6); poleG.translate(0, 4.5, 0);
    const im = new T.InstancedMesh(poleG, C.toon(0xb3b0a8), out.length);
    out.forEach(([x, y, z], i) => im.setMatrixAt(i, M4.makeTranslation(x, y - 0.2, z)));
    scene.add(C.instBounds(im));
    const wires = [];
    for (let i = 0; i < out.length - 1; i++) for (const dh of [8.4, 7.8, 7.2]) {
      const a = out[i], b = out[i + 1];
      for (let k = 0; k < 8; k++) {
        const f0 = k / 8, f1 = (k + 1) / 8, sag = (f) => -Math.sin(f * Math.PI) * 0.45;
        wires.push(C.lerp(a[0], b[0], f0), C.lerp(a[1], b[1], f0) + dh + sag(f0), C.lerp(a[2], b[2], f0),
          C.lerp(a[0], b[0], f1), C.lerp(a[1], b[1], f1) + dh + sag(f1), C.lerp(a[2], b[2], f1));
      }
    }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(wires, 3));
    scene.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x5a5c62, transparent: true, opacity: 0.7 })));
    if (lamp) for (const [x, y, z] of out) {
      const head = C.box(0.45, 0.12, 0.25, C.nightGlow(C.toon(0xf4f1e6, { emissive: 0xffe2a8, emissiveIntensity: 0 }), 1.4), x, y + 5.2, z, scene, false);
      const h = C.makeHalo(5); h.position.set(x, y + 5.0, z); scene.add(h);
    }
    return out;
  }

  // ---- the anchored places ----
  function put(obj, a, rot = a.rot, dy = 0) { obj.position.set(a.x, (a.y ?? C.groundH(a.x, a.z)) + dy, a.z); obj.rotation.y = rot; return obj; }
  function textPlane(w, h, draw) { const t = C.signTexture(Math.round(256 * w / h), 256, draw); return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshToonMaterial({ map: t, gradientMap: C.gradient, transparent: true })); }
  function shed(scene, x, y, z, rot, name) {   // small wooden tram station shelter
    const g = new T.Group(), wood = C.toon(0x8a5f3e), roof = C.toon(0x4a5060);
    for (const [a, b] of [[-1.8, -2.4], [1.8, -2.4], [-1.8, 2.4], [1.8, 2.4]]) C.box(0.18, 2.6, 0.18, wood, a, 1.3, b, g);
    const r = C.box(4.4, 0.18, 5.6, roof, 0, 2.7, 0, g); C.outline(r, 0.03);
    C.box(3.6, 0.15, 5, C.toon(0xb7ad99), 0, 0.08, 0, g);
    const sign = textPlane(2.4, 0.5, (c, w, h) => { c.fillStyle = '#f5efe0'; c.fillRect(0, 0, w, h); C.text(c, name, w / 2, h / 2, h * 0.6, '#3a2a1a', C.JP_SERIF); });
    sign.position.set(0, 2.35, 2.82); g.add(sign);
    g.position.set(x, y, z); g.rotation.y = rot; scene.add(g); return g;
  }

  function buildPlaces(scene) {
    const out = {};
    // Ferris wheel on the old amusement-park land, facing the hilltop viewpoint
    if (C.makeFerrisWheel) {
      const fw = C.makeFerrisWheel(), a = A.ferrisWheel;
      a.y = Math.min(C.groundH(a.x, a.z), C.groundH(a.x + 8, a.z), C.groundH(a.x - 8, a.z));
      put(fw.group, a, rotFacing(A.cliffRock.x - a.x, A.cliffRock.z - a.z)); scene.add(fw.group);
      C.reserve(a.x, a.z, 16, 16); C.addCollider(a.x, a.z, 9, 9); out.ferris = fw;
      if (fw.update) C.onUpdate((dt, t, env) => fw.update(dt, t, env));
    }
    // school 高浜小: big roof letters on the main building
    {
      let best = null, bd = 1e9;
      for (const b of O.buildings) if (b.rect) { const d = Math.hypot(b.rect.cx - 131, b.rect.cz + 136); if (d < bd) { bd = d; best = b; } }
      if (best && best.rect.top) {
        const r = best.rect, sign = textPlane(Math.min(r.w, r.d) * 1.6, Math.min(r.w, r.d) * 0.55, (c, w, h) => { c.clearRect(0, 0, w, h); C.text(c, '高浜小', w / 2, h / 2, h * 0.8, '#ffffff'); });
        sign.rotation.x = -Math.PI / 2; sign.rotation.z = -r.rot + (r.w > r.d ? 0 : Math.PI / 2); sign.position.set(r.cx, r.top + 0.12, r.cz); scene.add(sign);
      }
    }
    // Botchan locomotive display in the park
    if (C.makeBotchanLoco) { const l = C.makeBotchanLoco(); put(l.group, A.loco); scene.add(l.group); C.addCollider(A.loco.x, A.loco.z, 2.7, 4.1, A.loco.rot); C.reserve(A.loco.x, A.loco.z, 4, 6, A.loco.rot); }
    // the red Porsche alone in the huge empty lot
    {
      const a = A.parkingLot, fr = C.station.frame;
      const lot = new T.Mesh(new T.PlaneGeometry(56, 70), C.toon(0xb9b1a2, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      lot.rotation.x = -Math.PI / 2; lot.rotation.z = fr.rot; lot.position.set(a.x, 4.75, a.z); lot.receiveShadow = true; scene.add(lot);
      const lineMat = C.toon(0xe9e6dc);
      for (let i = -5; i <= 5; i++) { const l = C.box(0.12, 0.02, 5, lineMat, 0, 0, 0, scene, false); l.position.set(a.x + Math.cos(fr.rot) * i * 2.6 + Math.sin(fr.rot) * -18, 4.77, a.z - Math.sin(fr.rot) * i * 2.6 + Math.cos(fr.rot) * -18); l.rotation.y = fr.rot; }
      C.reserve(a.x, a.z, 28, 35, fr.rot);
      if (C.makePorsche911) { const p = C.makePorsche911(); p.group.position.set(a.x - 6, 4.76, a.z + 4); p.group.rotation.y = fr.rot + 2.2; scene.add(p.group); out.porsche = p; C.addCollider(a.x - 6, a.z + 4, 0.9, 2.2, fr.rot + 2.2); }
    }
    // town shrine at the top of the lane, the hill tram beside it
    if (C.makeShrine) { const s = C.makeShrine(); put(s.group, A.shrine); scene.add(s.group); C.reserve(A.shrine.x, A.shrine.z + 6, 8, 12, A.shrine.rot); C.addCollider(...(() => { const c = Math.cos(A.shrine.rot), sn = Math.sin(A.shrine.rot); return [A.shrine.x - 3 * sn, A.shrine.z - 3 * c]; })(), 3, 3, A.shrine.rot); }
    {
      const b = A.tramBase, t = A.tramTop, p0 = new T.Vector3(b.x, b.y + 0.6, b.z), p1 = new T.Vector3(t.x, t.y + 0.6, t.z);
      const head = rotFacing(t.x - b.x, t.z - b.z), slope = Math.atan2(p1.y - p0.y, Math.hypot(t.x - b.x, t.z - b.z));
      if (C.makeInclineTrack) scene.add(C.makeInclineTrack(p0, p1, { groundFn: C.groundH }));
      shed(scene, b.x - Math.sin(head) * 3, b.y, b.z - Math.cos(head) * 3, head + Math.PI, '山麓駅  さんろく');
      shed(scene, t.x + Math.sin(head) * 4, t.y, t.z + Math.cos(head) * 4, head, '山頂駅  さんちょう');
      C.addDeck(b.x - Math.sin(head) * 3, b.z - Math.cos(head) * 3, 1.8, 2.5, b.y + 0.16, b.y + 0.16, head);
      C.addDeck(t.x + Math.sin(head) * 4, t.z + Math.cos(head) * 4, 1.8, 2.5, t.y + 0.16, t.y + 0.16, head);
      const L = p0.distanceTo(p1);
      for (let s = 0; s < L; s += 10) { const f = s / L; C.reserve(C.lerp(b.x, t.x, f), C.lerp(b.z, t.z, f), 4, 6, head); }
      if (C.makeHillTram) {
        const tram = C.makeHillTram(), g = C.dynamic(tram.group);
        g.rotation.order = 'YXZ'; g.rotation.y = head; g.rotation.x = (tram.slope || 0.61) - slope; scene.add(g);
        out.tram = { model: tram, p0, p1, head, slope, f: 0, set(f) { this.f = f; g.position.lerpVectors(p0, p1, C.clamp(f, 0, 1)); } };
        out.tram.set(0.02);
      }
    }
    // summit: jizo on the miners' path, the mine shrine, ceramic dolls, rusty rails to the cliff, the rock
    if (C.makeJizo) { const j = C.makeJizo(); put(j.group, A.jizo, rotFacing(A.tramTop.x - A.jizo.x, A.tramTop.z - A.jizo.z)); scene.add(j.group); out.jizo = j; }
    if (C.makeMineShrine) {
      const m = C.makeMineShrine(); put(m.group, A.mineShrine); scene.add(m.group); out.mine = m;
      if (m.update) C.onUpdate((dt, t) => m.update(dt, t));
      if (C.makeCeramicDolls) { const d = C.makeCeramicDolls(36); d.group.position.set(0, 0.05, 1.9); m.group.add(d.group); }
      C.addCollider(A.mineShrine.x - Math.sin(A.mineShrine.rot) * 1.5, A.mineShrine.z - Math.cos(A.mineShrine.rot) * 1.5, 3.3, 1.6, A.mineShrine.rot);
      C.reserve(A.mineShrine.x, A.mineShrine.z, 12, 12);
      if (C.makeMineRails && m.adit) {
        m.group.updateMatrixWorld(true); const ad = m.group.localToWorld(m.adit.clone()), rk = A.cliffRock, P = [];
        for (let f = 0; f <= 1.0001; f += 0.05) { const x = C.lerp(ad.x, rk.x, f), z = C.lerp(ad.z, rk.z, f); P.push(new T.Vector3(x, C.groundH(x, z) + 0.05, z)); }
        scene.add(C.makeMineRails(P));
      }
    }
    if (C.makeCliffRock) { const r = C.makeCliffRock(); put(r.group, A.cliffRock); scene.add(r.group); out.rock = r; C.addDeck(A.cliffRock.x + Math.sin(A.cliffRock.rot) * 1.5, A.cliffRock.z + Math.cos(A.cliffRock.rot) * 1.5, 3.2, 2.4, A.cliffRock.y, A.cliffRock.y, A.cliffRock.rot); }
    C.reserve(A.cliffRock.x, A.cliffRock.z, 6, 6);
    // keep the cliff face in front of the rock open (the view down to the town and the sea)
    C.reserve(A.cliffRock.x + Math.sin(A.cliffRock.rot) * 22, A.cliffRock.z + Math.cos(A.cliffRock.rot) * 22, 16, 20, A.cliffRock.rot); C.reserve(A.tramTop.x, A.tramTop.z, 7, 7); C.reserve(A.jizo.x, A.jizo.z, 3, 3);
    // path rope fence along the cliff edge? the novel has none — leave it open.
    return out;
  }

  // ---- the shrine lane: shops, old houses, sakura, lanterns ----
  function buildLane(scene) {
    const S = A.townStreet, out = { shops: [], sakura: [] };
    const shops = ['tofu', 'dye', 'sweets', 'general', 'sake'];
    let si = 0;
    const lanterns = [[], []];
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      for (let t = 0; t < L; t += 8.5) for (const side of [1, -1]) {
        const f = t / L, cx = C.lerp(a.x, b.x, f), cz = C.lerp(a.z, b.z, f), nx = -uz * side, nz = ux * side;
        const x = cx + nx * 7.4, z = cz + nz * 7.4, rot = rotFacing(-nx, -nz);
        if (C.isReserved(x, z, 3)) continue;
        if (si < 8 && i < 3 && C.makeShopFront) {
          const sh = C.makeShopFront(shops[si % shops.length]); si++;
          sh.group.position.set(x, C.lerp(a.y, b.y, f), z); sh.group.rotation.y = rot; scene.add(sh.group); out.shops.push(sh);
          if (sh.update) C.onUpdate((dt, tt) => sh.update(dt, tt));
          C.addCollider(x, z, 3, 3.5, rot); mark(x, z, 4);
        } else if (C.rand() < 0.82) placeHouse(scene, x, z, C.range(6, 7.5), C.range(6, 7), rot, C.rand() < 0.6 ? 2 : 1, i * 31 + (t | 0));
        else out.sakura.push({ x: cx + nx * 6, y: C.groundH(cx + nx * 6, cz + nz * 6), z: cz + nz * 6 });
      }
      for (let t = 0; t <= L; t += 3) for (const k of [0, 1]) {
        const side = k ? 1 : -1, f = t / L, x = C.lerp(a.x, b.x, f) - uz * side * 3.1, z = C.lerp(a.z, b.z, f) + ux * side * 3.1;
        lanterns[k].push(new T.Vector3(x, C.lerp(a.y, b.y, f) + 3.3, z));
      }
      for (let t = 0; t <= L; t += 3) mark(C.lerp(a.x, b.x, t / L), C.lerp(a.z, b.z, t / L), 3.5);
      C.reserve((a.x + b.x) / 2, (a.z + b.z) / 2, 3.6, L / 2 + 1, rotFacing(ux, uz));
    }
    // the lane surface: old stone paving
    {
      const pos = [];
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, n = Math.ceil(L / 2);
        for (let k = 0; k < n; k++) {
          const f0 = k / n, f1 = (k + 1) / n, w = 3.0, P = (f, s) => { const x = C.lerp(a.x, b.x, f) - uz * w * s, z = C.lerp(a.z, b.z, f) + ux * w * s; return [x, C.heightAt(x, z) + 0.1, z]; };
          pos.push(...P(f0, -1), ...P(f1, -1), ...P(f0, 1), ...P(f0, 1), ...P(f1, -1), ...P(f1, 1));
        }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const m = new T.Mesh(g, C.toon(0xb3aa98, { side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.receiveShadow = true; scene.add(m);
    }
    if (C.makeLanternString) for (const L of lanterns) scene.add(C.makeLanternString(L, { spacing: 1.5 }));
    // warm glow at night: halos on every few lanterns, and a few soft lights down the lane
    for (const L of lanterns) L.forEach((p, i) => { if (i % 3 === 0) { const h = C.makeHalo(2.4, 0xffd9a0, 0.85); h.position.copy(p).y -= 0.25; scene.add(h); } });
    const lights = [];
    for (let i = 0; i < 1; i++) { const p = S[2], l = new T.PointLight(0xffc98a, 0, 60, 1.2); l.position.set(p.x, p.y + 4, p.z); scene.add(l); lights.push(l); }
    C.onUpdate((dt, t, env) => { for (const l of lights) l.intensity = 1.3 * env.night; });
    out.lanterns = lanterns;
    // late double sakura: along the lane, at the shrine, by the school, near the station
    const extra = [[A.shrine.x + 9, A.shrine.z + 4], [A.shrine.x - 9, A.shrine.z + 8], [150, -112], [170, -150], [118, -125], [48, -10], [40, -4], [62, -60], [A.tramBase.x + 6, A.tramBase.z + 6]];
    for (const [x, z] of extra) out.sakura.push({ x, y: C.groundH(x, z), z });
    if (C.makeSakuraInstances) scene.add(C.makeSakuraInstances(out.sakura, { size: 0.9, leafy: 0.5, seed: 7 }));
    for (const s of out.sakura) mark(s.x, s.z, 3);
    poleLine(scene, S.map(p => [p.x, p.z]), 22, true);
    return out;
  }

  // ---- breakwaters / piers from OSM ----
  function buildBreakwaters(scene) {
    const mat = C.toon(0xb8b4aa);
    for (const l of O.lines) if (l.k === 'man_made=breakwater' || l.k === 'man_made=pier' || l.k === 'man_made=groyne') {
      const P = pts(l.p);
      for (let i = 0; i < P.length - 1; i++) {
        const [x0, z0] = P[i], [x1, z1] = P[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.5) continue;
        const b = C.box(4, 4, L + 2, mat, (x0 + x1) / 2, 0.2, (z0 + z1) / 2, scene); b.rotation.y = rotFacing(x1 - x0, z1 - z0);
      }
    }
  }

  C.buildTown = function (scene) {
    const t0 = performance.now();
    buildRoads(scene);
    const lane = buildLane(scene);
    const places = buildPlaces(scene);
    buildOSMBuildings(scene);
    const filled = fillHouses(scene);
    // poles along the main town streets
    for (const r of O.roads) if (['residential', 'unclassified'].includes(r.k)) { const P = pts(r.p); let near = P.some(([x, z]) => Math.hypot(x, z + 100) < 260); if (near) poleLine(scene, P, 28, C.rand() < 0.5); }
    buildBreakwaters(scene);
    const trees = buildForest(scene);
    if (C.makeVending) for (const [x, z, r] of [[A.townStreet[1].x + 3.4, A.townStreet[1].z, -1.6]]) { const v = C.makeVending(0xd8402e), g = v.group || v; g.position.set(x, C.groundH(x, z), z); g.rotation.y = r; scene.add(g); }
    console.log('town', { filled, trees, ms: Math.round(performance.now() - t0) });
    C.town = Object.assign({ lane }, places);
    return C.town;
  };
})(window.CITY);
