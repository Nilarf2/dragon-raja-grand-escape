// Iyotetsu Takahama Line along the real OSM track: ballast, rails, sleepers, catenary, trains.
// Paths start at the Takahama end. dir +1 = southbound (to 松山市, east track, platform 1),
// dir −1 = northbound (to 高浜, west/seaside track, platform 2). Japanese left-hand running.
(function (C) {
  const T = THREE, R = C.DATA.rail;
  const trk = (id) => R.tracks.find(t => t.id === id).p;

  function makePath(pts) {   // [x,y,z,…] → arc-length sampler
    const P = [], S = [0];
    for (let i = 0; i < pts.length; i += 3) {
      const v = new T.Vector3(pts[i], pts[i + 1], pts[i + 2]);
      if (C.stationZone && C.railYs) {   // through the station: the smoothed rail profile the platforms use
        const [s, n] = C.stationZone.toSN(v.x, v.z), w = Math.abs(n) < 8 ? 1 - C.smooth(150, 200, Math.abs(s - 55)) : 0;
        if (w > 0) v.y = C.lerp(v.y, C.railYs(s), w);
      }
      P.push(v);
    }
    for (let i = 1; i < P.length; i++) S.push(S[i - 1] + P[i].distanceTo(P[i - 1]));
    const len = S[S.length - 1];
    function at(s, out = new T.Vector3()) {
      s = C.clamp(s, 0, len); let lo = 0, hi = S.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
      return out.lerpVectors(P[lo], P[hi], (s - S[lo]) / Math.max(1e-6, S[hi] - S[lo]));
    }
    function nearest(x, z) { let b = 1e18, k = 0; P.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < b) { b = d; k = i; } }); return S[k]; }
    return { P, S, len, at, nearest };
  }
  const single = trk('single');
  const pathS = makePath(single.concat(trk('east').slice(3)));
  const pathN = makePath(single.concat(trk('west').slice(3)));

  // ---------- track geometry ----------
  function ribbon(path, offs, mat) {   // offs: [[lateral, y], …] profile across the track, swept along it
    const pos = [], uv = [], idx = [], n = offs.length, V = new T.Vector3(), A = new T.Vector3(), B = new T.Vector3();
    for (let s = 0, row = 0; s <= path.len; s += 2, row++) {
      path.at(Math.max(0, s - 1), A); path.at(Math.min(path.len, s + 1), B); path.at(s, V);
      const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l;
      offs.forEach(([o, y], k) => { pos.push(V.x + nx * o, V.y + y, V.z + nz * o); uv.push(k / (n - 1), s / 1.5); });
      if (row) for (let k = 0; k < n - 1; k++) { const a = (row - 1) * n + k, b = a + 1, c = a + n, d = c + 1; idx.push(a, b, c, b, d, c); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, mat); m.receiveShadow = true; return m;
  }
  const ballastTex = C.signTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#857e74'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const k = 0.7 + Math.random() * 0.5, r = 2 + Math.random() * 4; g.fillStyle = `rgb(${(150 * k) | 0},${(143 * k) | 0},${(132 * k) | 0})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, r, r * 0.7, Math.random() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < 600; i++) { g.fillStyle = 'rgba(70,50,40,.25)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }   // rust stains
  });
  ballastTex.wrapS = ballastTex.wrapT = T.RepeatWrapping; ballastTex.repeat.set(3, 1);
  const MAT = {
    ballast: C.toon(0xffffff, { map: ballastTex }),
    rust: C.toon(0x7b4a33),
    head: C.nightGlow(C.toon(0xb9b6b0, { emissive: 0xa8b8cc, emissiveIntensity: 0 }), 0.35),   // the rail heads gleam under the lamps
    sleeper: C.toon(0xaaa59c),
  };
  // concrete sleeper with four dark fastening clips, one geometry
  const sleeperGeo = (() => {
    const parts = [new T.BoxGeometry(2.0, 0.16, 0.24).translate(0, -0.233, 0)];
    for (const x of [-0.64, -0.49, 0.49, 0.64]) parts.push(new T.BoxGeometry(0.07, 0.05, 0.12).translate(x, -0.13, 0));
    return C.mergeGeos(parts);
  })();
  const sleeperLo = new T.BoxGeometry(2.0, 0.16, 0.24).translate(0, -0.233, 0);
  const clipMat = C.toon(0x3a3a3e);
  function buildTrack(scene, path, s0, s1) {
    const sub = makePath([].concat(...path.P.filter((p, i) => path.S[i] >= s0 && path.S[i] <= s1).map(p => [p.x, p.y, p.z])));
    const g = new T.Group();
    g.add(ribbon(sub, [[-2.4, -0.8], [-1.6, -0.28], [-1.0, -0.25], [1.0, -0.25], [1.6, -0.28], [2.4, -0.8]], MAT.ballast));
    // 1067 mm gauge; rail centre ±0.566, profile: foot 128 mm, web, head 65 mm, height 153 mm (rail-head top = path height)
    for (const c of [-0.566, 0.566]) {
      g.add(ribbon(sub, [[c - 0.064, -0.153], [c - 0.064, -0.141], [c - 0.009, -0.128], [c - 0.009, -0.045], [c - 0.033, -0.035], [c - 0.033, -0.004],
        [c + 0.033, -0.004], [c + 0.033, -0.035], [c + 0.009, -0.045], [c + 0.009, -0.128], [c + 0.064, -0.141], [c + 0.064, -0.153]], MAT.rust));
      g.add(ribbon(sub, [[c - 0.031, 0], [c + 0.031, 0]], MAT.head));
    }
    // sleepers in 60 m chunks (each frustum-culled); fastening clips only through the station, plain blocks elsewhere
    const n = Math.floor(sub.len / 0.6), CH = 100;
    const M = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), A = new T.Vector3(), B = new T.Vector3(), S1 = new T.Vector3(1, 1, 1), UP = new T.Vector3(0, 1, 0);
    for (let c0 = 0; c0 < n; c0 += CH) {
      const cnt = Math.min(CH, n - c0); sub.at((c0 + cnt / 2) * 0.6, V);
      const inst = new T.InstancedMesh(inStation(V.x, V.z, 30) ? sleeperGeo : sleeperLo, MAT.sleeper, cnt);
      for (let i = 0; i < cnt; i++) {
        const s = (c0 + i) * 0.6; sub.at(s, V); sub.at(Math.min(sub.len, s + 0.5), B); sub.at(Math.max(0, s - 0.5), A);
        Q.setFromAxisAngle(UP, Math.atan2(B.x - A.x, B.z - A.z)); inst.setMatrixAt(i, M.compose(V, Q, S1));
      }
      inst.receiveShadow = true; g.add(C.instBounds(inst));
    }
    scene.add(g); return g;
  }
  function buildCatenary(scene, path, side) {   // simple steel poles + one contact wire (600 V DC line)
    const poleMat = C.toon(0x8d9196), V = new T.Vector3(), A = new T.Vector3(), B = new T.Vector3(), wire = [];
    const pole = new T.CylinderGeometry(0.1, 0.13, 6.2, 6); pole.translate(0, 3.1, 0);
    const arm = new T.BoxGeometry(0.08, 0.08, 2.4); arm.translate(0, 5.6, -1.2);
    const n = Math.floor(path.len / 45) + 1, poles = new T.InstancedMesh(pole, poleMat, n), arms = new T.InstancedMesh(arm, poleMat, n);
    const M = new T.Matrix4(), Q = new T.Quaternion(), UP = new T.Vector3(0, 1, 0), S1 = new T.Vector3(1, 1, 1);
    let k = 0;
    for (let s = 5; s < path.len; s += 45) {
      path.at(s, V); path.at(s + 1, B); path.at(s - 1, A);
      const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz), nx = dz / l * side, nz = -dx / l * side;
      const p = new T.Vector3(V.x + nx * 2.8, C.groundH(V.x + nx * 2.8, V.z + nz * 2.8) - 0.2, V.z + nz * 2.8);
      if (inStation(p.x, p.z)) continue;   // the station has its own portals
      Q.setFromAxisAngle(UP, Math.atan2(-nx, -nz)); M.compose(p, Q, S1); poles.setMatrixAt(k, M); arms.setMatrixAt(k, M); k++;
    }
    poles.count = arms.count = k; scene.add(C.instBounds(poles), C.instBounds(arms));
    for (let s = 0; s + 6 < path.len; s += 6) {
      path.at(s, V); if (inStation(V.x, V.z)) continue; const a = V.clone(); path.at(s + 6, V);
      wire.push(a.x, a.y + 5.1, a.z, V.x, V.y + 5.1, V.z);
    }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(wire, 3));
    scene.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x55585e, transparent: true, opacity: 0.75 })));
  }

  const inStation = (x, z, m = 0) => { const Z = C.stationZone, [s, n] = Z.toSN(x, z); return s > -18 - m && s < 138 + m && Math.abs(n) < 12; };

  // ---------- trains ----------
  function fallbackTrain(cars = 2) {   // used only if landmarks.js has no makeEMU
    const group = C.dynamic(new T.Group()), list = [], L = 18;
    for (let i = 0; i < cars; i++) {
      const c = new T.Group();
      const body = C.box(2.7, 2.9, L, C.toon(0xf39a1e), 0, 1.75, 0, c); C.outline(body, 0.05);
      C.box(2.72, 0.9, L - 1, C.nightGlow(C.toon(0x3a4a5a, { emissive: 0xfff0c8, emissiveIntensity: 0 }), 1.0), 0, 2.2, 0, c, false);
      C.box(2.4, 0.3, L, C.toon(0x9a9a9a), 0, 3.3, 0, c);
      group.add(c); list.push(c);
    }
    list.forEach((c, i) => c.userData.off = ((cars - 1) / 2 - i) * (L + 0.8));
    return { group, cars: list, carLength: L, offsets: list.map(c => c.userData.off), length: cars * (L + 0.8) };
  }
  const KIND = {
    emu: () => (C.makeEMU ? C.makeEMU({ cars: 3 }) : fallbackTrain(3)),
    d51: () => (C.makeD51Train ? C.makeD51Train({ coaches: 2 }) : fallbackTrain(3)),
  };

  C.buildRailway = function (scene) {
    // tracks: the shared single-track section once, then both station tracks
    const sw = pathS.nearest(-25, -35);
    buildTrack(scene, pathS, 0, pathS.len); buildTrack(scene, pathN, sw - 2, pathN.len);
    buildCatenary(scene, pathS, 1); buildCatenary(scene, pathN, -1);

    const fr = C.station.frame, P1 = C.station.plat1, P2 = C.station.plat2;
    const stopS = pathS.nearest(...fr.W(fr.n0 + fr.half, (P1.s0 + P1.s1) / 2));
    const stopN = pathN.nearest(...fr.W(fr.n0 - fr.half, (P2.s0 + P2.s1) / 2));
    const xing = C.station.crossing, xS = pathS.nearest(xing.x, xing.z), xN = pathN.nearest(xing.x, xing.z);
    const trains = [], A = new T.Vector3(), B = new T.Vector3();

    function spawn(kind, dir, s, v = 0, opts = {}) {
      const m = KIND[kind](), path = dir > 0 ? pathS : pathN;
      scene.add(m.group);
      const tr = Object.assign({ kind, dir, path, model: m, s: s ?? (dir > 0 ? 0 : path.len), v, vmax: opts.vmax || 12, stopAt: opts.stop === false ? null : (dir > 0 ? stopS : stopN),
        dwell: 0, dwellTime: opts.dwell ?? 22, served: false, hold: false, done: false, length: m.length }, Object.assign({}, opts, { dwell: undefined }));
      tr.dwell = 0;
      trains.push(tr); place(tr); return tr;
    }
    function place(tr) {
      const m = tr.model;
      // tr.s = arc position of the train's centre; offsets[i] = car centre in the train frame (front car +)
      m.cars.forEach((car, i) => {
        const L = (m.carLengths ? m.carLengths[i] : m.carLength), c = tr.s + tr.dir * m.offsets[i];
        const f = c + tr.dir * (L / 2 - 2.2), b = c - tr.dir * (L / 2 - 2.2);
        tr.path.at(f, A); tr.path.at(b, B);
        car.position.set((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
        car.rotation.set(0, Math.atan2(A.x - B.x, A.z - B.z), 0);
        car.rotateX(-Math.atan2(A.y - B.y, Math.hypot(A.x - B.x, A.z - B.z)));
      });
    }
    function step(tr, dt) {
      const acc = 0.9, dec = 0.8;
      if (tr.dwell > 0) {
        tr.dwell -= dt; if (tr.model.setDoors) tr.model.setDoors(C.smooth(0, 2, Math.min(tr.dwell, tr.dwellTime - tr.dwell)));
        if (tr.dwell <= 0) { tr.served = true; tr.onDepart && tr.onDepart(tr); }
        return;
      }
      if (tr.hold) { tr.v = Math.max(0, tr.v - dec * dt); }
      else {
        let vt = tr.vmax;
        if (tr.stopAt != null && !tr.served) {
          const d = (tr.stopAt - tr.s) * tr.dir;
          if (d < 0.25) { tr.v = 0; tr.s = tr.stopAt; tr.dwell = tr.dwellTime; tr.onArrive && tr.onArrive(tr); return; }
          vt = Math.min(vt, Math.sqrt(2 * dec * Math.max(0, d - 0.2)) + 0.3);
        }
        tr.v = tr.v < vt ? Math.min(vt, tr.v + acc * dt) : Math.max(vt, tr.v - dec * 1.5 * dt);
      }
      tr.s += tr.dir * tr.v * dt;
      if (tr.s < -tr.length || tr.s > tr.path.len + tr.length) tr.done = true;
    }

    // wander-mode loop: alternate directions, one train every ~80 s (real time)
    let clockT = 25, nextDir = 1;
    const rw = C.railway = {
      trains, pathS, pathN, stopS, stopN, mode: 'timetable', spawn,
      at(s, dir = 1) { const p = (dir > 0 ? pathS : pathN); const a = p.at(s), b = p.at(s + 1); return { pos: a, dir: b.sub(a).normalize() }; },
      crossingActive() {
        return trains.some(tr => { const x = tr.dir > 0 ? xS : xN, d = (x - tr.s) * tr.dir; return d > -tr.length / 2 - 8 && d < tr.length / 2 + 110 && !(tr.dwell > 0 && d > 60); });
      },
      nearest(p) { let b = 1e9, best = null; for (const tr of trains) { const d = tr.model.cars[0].position.distanceTo(p); if (d < b) { b = d; best = tr; } } return { train: best, dist: b }; },
      update(dt, hour, t) {
        if (rw.mode === 'timetable') {
          clockT -= dt;
          if (clockT <= 0 && trains.length < 2) { spawn('emu', nextDir); nextDir = -nextDir; clockT = 80; }
        }
        for (const tr of trains) { step(tr, dt); place(tr); tr.model.update && tr.model.update(dt, t); }
        for (let i = trains.length - 1; i >= 0; i--) if (trains[i].done) { scene.remove(trains[i].model.group); trains.splice(i, 1); }
        C.station.setCrossing(rw.crossingActive());
      },
      clear() { for (const tr of trains) scene.remove(tr.model.group); trains.length = 0; },
    };
    return rw;
  };
})(window.CITY);
