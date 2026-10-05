// Weather: drizzle (streaks around the camera), sea fog (thickens the haze, swallows the far track), sakura petal gusts.
(function (C) {
  const T = THREE;

  C.Weather = function (scene) {
    this.scene = scene; this.rain = 0; this.rainT = 0; this.fog = 0; this.fogT = 0;
    // rain: N short line segments in a box that follows the camera
    const N = 2400, pos = new Float32Array(N * 6);
    this.drops = []; for (let i = 0; i < N; i++) this.drops.push([C.range(-30, 30), C.range(0, 30), C.range(-30, 30), C.range(9, 13)]);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    this.rainMesh = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xc8d6e8, transparent: true, opacity: 0, depthWrite: false }));
    this.rainMesh.frustumCulled = false; scene.add(C.dynamic(this.rainMesh));
    // petals: small pink quads, instanced
    const PN = 400, pg = new T.PlaneGeometry(0.05, 0.035);
    this.petals = new T.InstancedMesh(pg, new T.MeshBasicMaterial({ color: 0xffc8d8, side: T.DoubleSide, transparent: true, opacity: 0.95 }), PN);
    this.petals.frustumCulled = false; this.petals.count = 0; scene.add(C.dynamic(this.petals));
    this.pdata = [];
    this.ambient = null;   // { center, radius, rate }: a gentle continuous fall (e.g. the shrine lane)
  };
  const P = C.Weather.prototype;
  P.setRain = function (v) { this.rainT = v; };
  P.setFog = function (v) { this.fogT = v; };
  P.petalBurst = function (pos, dir = new T.Vector3(1, 0.3, 0), n = 120) {
    for (let i = 0; i < n; i++) {
      if (this.pdata.length >= 400) this.pdata.shift();
      this.pdata.push({ p: pos.clone().add(new T.Vector3(C.range(-3, 3), C.range(0, 4), C.range(-3, 3))),
        v: dir.clone().multiplyScalar(C.range(1.5, 4)).add(new T.Vector3(C.range(-0.5, 0.5), C.range(0, 1), C.range(-0.5, 0.5))),
        r: new T.Euler(C.rand() * 6, C.rand() * 6, C.rand() * 6), w: C.range(2, 6), life: C.range(6, 12) });
    }
  };
  const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(1, 1, 1);
  P.update = function (dt, camera, sky, t = 0) {
    this.rain += (this.rainT - this.rain) * Math.min(1, dt * 0.5);
    this.fog += (this.fogT - this.fog) * Math.min(1, dt * 0.3);
    if (sky) { sky.fogExtra = this.fog * 0.0016 + this.rain * 0.00025; sky.setCloud(Math.max(sky.cloud, this.rain)); }
    // rain
    const m = this.rainMesh; m.material.opacity = this.rain * 0.45; m.visible = this.rain > 0.01;
    if (m.visible) {
      const a = m.geometry.attributes.position.array, c = camera.position, n = Math.floor(this.drops.length * this.rain);
      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i]; d[1] -= d[3] * dt; if (d[1] < -2) { d[1] = 28; d[0] = C.range(-30, 30); d[2] = C.range(-30, 30); }
        const k = i * 6;
        if (i >= n) { a.fill(0, k, k + 6); continue; }
        const x = c.x + d[0], y = c.y - 8 + d[1], z = c.z + d[2];
        a[k] = x; a[k + 1] = y; a[k + 2] = z; a[k + 3] = x + 0.04; a[k + 4] = y + 0.5; a[k + 5] = z + 0.02;
      }
      m.geometry.attributes.position.needsUpdate = true;
    }
    // petals
    if (this.ambient && C.rand() < this.ambient.rate * dt) {
      const a = this.ambient; this.petalBurst(new T.Vector3(a.center.x + C.range(-a.radius, a.radius), a.center.y + 5, a.center.z + C.range(-a.radius, a.radius)), new T.Vector3(0.4, -0.1, 0.2), 2);
    }
    let k = 0;
    for (let i = this.pdata.length - 1; i >= 0; i--) {
      const p = this.pdata[i]; p.life -= dt; if (p.life <= 0) { this.pdata.splice(i, 1); continue; }
      p.v.y = Math.max(p.v.y - 0.6 * dt, -0.7); p.v.x *= 1 - 0.3 * dt; p.v.z *= 1 - 0.3 * dt;
      p.p.addScaledVector(p.v, dt); p.p.x += Math.sin(t * 2 + i) * 0.3 * dt;
      p.r.x += p.w * dt; p.r.y += p.w * 0.7 * dt;
      if (p.p.y < C.heightAt(p.p.x, p.p.z) + 0.02) { p.p.y = C.heightAt(p.p.x, p.p.z) + 0.02; p.v.set(0, 0, 0); p.w = 0; }
      this.petals.setMatrixAt(k++, M.compose(p.p, Q.setFromEuler(p.r), S));
    }
    this.petals.count = k; this.petals.instanceMatrix.needsUpdate = true;
  };
})(window.CITY);
