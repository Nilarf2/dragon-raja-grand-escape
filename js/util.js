// Shared helpers: namespace, noise, toon materials, outlines, sign textures.
window.CITY = window.CITY || {};
(function (C) {
  const T = THREE;

  C.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  C.lerp = (a, b, t) => a + (b - a) * t;
  C.smooth = (a, b, x) => { const t = C.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // Deterministic random so the town is the same every load.
  let seed = 20261001;
  C.rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  C.range = (a, b) => a + (b - a) * C.rand();

  // Smooth 2D value noise + fbm.
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  C.noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  C.fbm = (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * C.noise(x * f, y * f); f *= 2; a *= 0.5; } return s; };

  // Three-band cel-shading ramp.
  const ramp = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  C.gradient = new T.DataTexture(ramp, 3, 1, T.RGBAFormat);
  C.gradient.minFilter = C.gradient.magFilter = T.NearestFilter;
  C.gradient.needsUpdate = true;

  const cache = {};
  C.toon = (color, opts = {}) => {
    const key = color + JSON.stringify(opts);
    if (!opts.map && cache[key]) return cache[key];
    const m = new T.MeshToonMaterial(Object.assign({ color, gradientMap: C.gradient }, opts));
    if (!opts.map) cache[key] = m;
    return m;
  };

  // Inverted-hull outline (anime ink line). Works well on convex shapes.
  const inkMat = new T.MeshBasicMaterial({ color: 0x2a2630, side: T.BackSide });
  C.ink = inkMat;
  C.outline = (mesh, w = 0.06) => {
    mesh.geometry.computeBoundingBox();
    const s = new T.Vector3(); mesh.geometry.boundingBox.getSize(s);
    const o = new T.Mesh(mesh.geometry, inkMat);
    o.scale.set(1 + 2 * w / Math.max(s.x, 0.01), 1 + 2 * w / Math.max(s.y, 0.01), 1 + 2 * w / Math.max(s.z, 0.01));
    const c = new T.Vector3(); mesh.geometry.boundingBox.getCenter(c);
    o.position.set(-c.x * (o.scale.x - 1), -c.y * (o.scale.y - 1), -c.z * (o.scale.z - 1));
    mesh.add(o);
    return mesh;
  };

  // fill a geometry's vertex colours with one colour (for shared vertexColors materials: many parts, one draw call after merging)
  const _tc = new T.Color();
  C.tint = (geo, hex) => {
    _tc.set(hex); const n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = _tc.r; a[i * 3 + 1] = _tc.g; a[i * 3 + 2] = _tc.b; }
    geo.setAttribute('color', new T.BufferAttribute(a, 3)); return geo;
  };
  C.box = (w, h, d, mat, x = 0, y = 0, z = 0, parent, shadow = true) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  };
  C.cyl = (rt, rb, h, mat, seg = 8, parent) => {
    const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), mat);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  };

  // Canvas text → texture, for Japanese signs.
  C.JP_FONT = '"Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo","Source Han Sans",sans-serif';
  C.JP_SERIF = '"Hiragino Mincho ProN","Noto Serif JP","Noto Serif CJK JP","Yu Mincho","MS Mincho",serif';
  C.signTexture = (w, h, draw) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    draw(g, w, h);
    const tex = new T.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  };
  C.text = (g, s, x, y, size, color, font = C.JP_FONT, weight = 'bold', align = 'center') => {
    g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
    g.fillText(s, x, y);
  };
  // A flat sign board: plane with canvas texture, both faces.
  C.signBoard = (w, h, tex, emissive = 0) => {
    const mat = new T.MeshToonMaterial({ map: tex, gradientMap: C.gradient, side: T.DoubleSide,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.userData.nightGlow = emissive > 0 ? mat : null;
    return m;
  };

  // Objects that glow at night register here; sky.js sets their intensity.
  C.nightMats = [];
  C.nightGlow = (mat, max = 1) => { C.nightMats.push({ mat, max }); return mat; };

  // Colliders: oriented x/z rectangles the player can't enter. rot = rotation.y of the object (radians).
  // hw = half-size along the object's local X, hd = along its local Z.
  C.colliders = [];
  C.addCollider = (x, z, hw, hd, rot = 0) => C.colliders.push({ x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot) });
  // World (x,z) → local (u,v) of a frame placed at (cx,cz) with rotation.y = rot (three.js convention).
  C.toLocal2 = (x, z, cx, cz, c, s) => { const dx = x - cx, dz = z - cz; return [dx * c - dz * s, dx * s + dz * c]; };
  C.collides = (x, z, r = 0.25) => {
    for (const k of C.colliders) {
      const [u, v] = C.toLocal2(x, z, k.x, k.z, k.c, k.s);
      if (Math.abs(u) < k.hw + r && Math.abs(v) < k.hd + r) return true;
    }
    return false;
  };

  // Walkable decks (platforms, ramps, bridges, floors): oriented rectangles with a height that runs
  // linearly from y0 (local v = -hd) to y1 (v = +hd). C.heightAt() returns max(ground, deck).
  C.decks = [];
  C.addDeck = (x, z, hw, hd, y0, y1 = y0, rot = 0) => {
    const d = { x, z, hw, hd, y0, y1, c: Math.cos(rot), s: Math.sin(rot) };
    C.decks.push(d); return d;
  };
  C.deckHeight = (x, z) => {
    let h = -Infinity;
    for (const d of C.decks) {
      const [u, v] = C.toLocal2(x, z, d.x, d.z, d.c, d.s);
      if (Math.abs(u) <= d.hw && Math.abs(v) <= d.hd) h = Math.max(h, C.lerp(d.y0, d.y1, (v + d.hd) / (2 * d.hd)));
    }
    return h;
  };

  // Place an object built in its own local frame: position (x, z) on the ground (+ dy), rotated by rot.
  C.place = (obj, x, z, rot = 0, dy = 0, parent) => {
    obj.position.set(x, (C.groundH ? C.groundH(x, z) : 0) + dy, z); obj.rotation.y = rot;
    if (parent) parent.add(obj);
    return obj;
  };

  // Reserved ground: builders that own an area (station, shrine, park…) reserve it so town.js
  // doesn't put OSM buildings, trees or poles there. Same oriented-rectangle convention as colliders.
  C.reserved = [];
  C.reserve = (x, z, hw, hd, rot = 0) => C.reserved.push({ x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot) });
  C.isReserved = (x, z, r = 0) => C.reserved.some(k => {
    const [u, v] = C.toLocal2(x, z, k.x, k.z, k.c, k.s);
    return Math.abs(u) < k.hw + r && Math.abs(v) < k.hd + r;
  });

  // Per-frame updaters for animated things (Ferris wheel, flags, trains...).
  // fn(dt, t, env) with env = { hour, night, sky, camera, player }. Called by main.js every frame.
  C.updaters = [];
  C.onUpdate = (fn) => { C.updaters.push(fn); return fn; };
  // Mark a group as dynamic so C.mergeStatic leaves it (and all its children) alone.
  C.dynamic = (obj) => { obj.userData.noMerge = true; return obj; };
})(window.CITY);

// Merge all static meshes that share a material into one mesh (big draw-call saving).
// Materials stay shared, so night glow / colour changes still work.
// Skips anything under `exclude` or under an object with userData.noMerge (see C.dynamic).
window.CITY.mergeStatic = function (scene, exclude, tile = 120) {
  const T = THREE, ctr = new T.Vector3();
  scene.updateMatrixWorld(true);
  const skip = new Set(exclude);
  const buckets = new Map(), victims = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    for (let p = o; p; p = p.parent) if (skip.has(p) || p.userData.noMerge) return;
    if (Array.isArray(o.material)) return;
    // bucket by material AND by spatial tile, so merged meshes stay frustum-cullable (camera and shadow pass)
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    ctr.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
    const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '') + '|' + Math.floor(ctr.x / tile) + ',' + Math.floor(ctr.z / tile);
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, list: [] });
    buckets.get(key).list.push(o);
    victims.push(o);
  });
  const nm = new T.Matrix3();
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.list.length < 2) { b.list.forEach(o => victims.splice(victims.indexOf(o), 1)); continue; }
    let count = 0;
    const geos = b.list.map(o => {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      count += g.attributes.position.count;
      return g;
    });
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    const col = b.mat.vertexColors ? new Float32Array(count * 3).fill(1) : null;   // vertex-coloured materials keep their colours
    let off = 0;
    for (const g of geos) {
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array, off * 3);
      nor.set(g.attributes.normal.array, off * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
      if (col && g.attributes.color && g.attributes.color.itemSize === 3) col.set(g.attributes.color.array, off * 3);
      off += g.attributes.position.count;
      g.dispose();
    }
    const mg = new T.BufferGeometry();
    mg.setAttribute('position', new T.BufferAttribute(pos, 3));
    mg.setAttribute('normal', new T.BufferAttribute(nor, 3));
    mg.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (col) mg.setAttribute('color', new T.BufferAttribute(col, 3));
    const m = new T.Mesh(mg, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv;
    scene.add(m); merged++;
  }
  for (const o of victims) o.parent.remove(o);
  return { removed: victims.length, merged };
};

// Soft additive glow sprites for lamps at night (opacity driven by main.js from sky night).
(function (C) {
  const T = THREE;
  const glowTex = C.signTexture(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  C.halos = [];
  C.makeHalo = (size, color = 0xffe2a8, max = 0.9) => {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    sp.scale.set(size, size, 1); sp.userData.max = max; C.halos.push(sp); return sp;
  };
  // invisible by day: a sprite at opacity 0 still costs a draw call
  C.updateHalos = (night) => { for (const h of C.halos) { h.material.opacity = night * h.userData.max; h.visible = night > 0.01; } };
})(window.CITY);

// InstancedMesh culling in r149 uses the single-instance geometry bounds at the origin: give each instanced mesh
// its own geometry copy whose bounding sphere encloses all instances, so camera + shadow frustum culling work.
window.CITY.instBounds = function (inst) {
  const T = THREE, m = new T.Matrix4(), p = new T.Vector3(), box = new T.Box3();
  if (!inst.geometry.boundingSphere) inst.geometry.computeBoundingSphere();
  const r = inst.geometry.boundingSphere.radius;
  for (let i = 0; i < inst.count; i++) { inst.getMatrixAt(i, m); box.expandByPoint(p.setFromMatrixPosition(m)); }
  if (box.isEmpty()) return inst;
  const g = inst.geometry.clone(); g.boundingSphere = box.getBoundingSphere(new T.Sphere()); g.boundingSphere.radius += r * 2;
  inst.geometry = g; inst.frustumCulled = true;
  return inst;
};

// Merge a list of (non-indexed or indexed) BufferGeometries into one (position, normal, uv).
window.CITY.mergeGeos = function (geos) {
  const T = THREE; let count = 0;
  const list = geos.map(g => { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); count += n.attributes.position.count; return n; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const m = new T.BufferGeometry();
  m.setAttribute('position', new T.BufferAttribute(pos, 3)); m.setAttribute('normal', new T.BufferAttribute(nor, 3)); m.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return m;
};
