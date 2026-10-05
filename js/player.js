// First-person walker (no visible character) + a cinematic camera the story can drive.
// Walking uses C.heightAt (terrain + decks) and C.collides; steps up to 0.5 m, drops up to 1.6 m (no walking off the cliff).
(function (C) {
  const T = THREE;

  C.Player = function (camera, dom) {
    this.camera = camera;
    this.pos = new T.Vector3(); this.yaw = 0; this.pitch = 0; this.eye = 1.55;
    this.keys = {}; this.enabled = true; this.sitting = null;
    this.cine = null;            // { pos: Vector3, look: Vector3, fov?, t } when the story owns the camera
    this._cp = new T.Vector3(); this._cl = new T.Vector3(); this._cineK = 0;
    this.vy = 0; this.bob = 0;
    addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    // mouse: drag anywhere to look. touch: left 45% of the screen = floating joystick, elsewhere = drag to look
    this.joy = { x: 0, y: 0 };
    const looks = new Map(), joyEl = document.getElementById('joy'), knob = joyEl && joyEl.firstElementChild;
    let joyId = null, joy0 = null;
    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45 && joyId === null && !this.cine) {
        joyId = e.pointerId; joy0 = [e.clientX, e.clientY];
        if (joyEl) { joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.classList.add('show'); }
      } else looks.set(e.pointerId, [e.clientX, e.clientY]);
    });
    const end = (e) => {
      if (e.pointerId === joyId) { joyId = null; this.joy.x = this.joy.y = 0; if (joyEl) joyEl.classList.remove('show'); }
      looks.delete(e.pointerId);
    };
    dom.addEventListener('pointerup', end); dom.addEventListener('pointercancel', end);
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyId) {
        const R = 55, dx = e.clientX - joy0[0], dy = e.clientY - joy0[1], l = Math.hypot(dx, dy), k = l > R ? R / l : 1;
        this.joy.x = dx * k / R; this.joy.y = dy * k / R;
        if (knob) knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        return;
      }
      const d = looks.get(e.pointerId); if (!d) return;
      const sens = e.pointerType === 'touch' ? 0.005 : 0.0035;
      this.yaw -= (e.clientX - d[0]) * sens; this.pitch = C.clamp(this.pitch - (e.clientY - d[1]) * sens, -1.2, 1.2);
      d[0] = e.clientX; d[1] = e.clientY;
    });
    this.fov = 55;
    dom.addEventListener('wheel', (e) => { this.fov = C.clamp(this.fov + Math.sign(e.deltaY) * 3, 25, 75); }, { passive: true });
  };
  const P = C.Player.prototype;

  P.place = function (x, z, yaw = this.yaw, pitch = 0) { this.pos.set(x, C.heightAt(x, z), z); this.yaw = yaw; this.pitch = pitch; this.sitting = null; };
  // look direction as bearing (deg from north): yaw 0 = facing −Z (north)
  P.faceBearing = function (b) { this.yaw = -b * Math.PI / 180; };

  P.update = function (dt) {
    const k = this.keys;
    if (this.enabled && !this.cine && !this.sitting) {
      if (k.ArrowLeft) this.yaw += 1.8 * dt; if (k.ArrowRight) this.yaw -= 1.8 * dt;
      const jm = Math.hypot(this.joy.x, this.joy.y);
      const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - (jm > 0.15 ? this.joy.y : 0), s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + (jm > 0.15 ? this.joy.x : 0);
      if (Math.abs(f) + Math.abs(s) > 0.01) {
        const run = k.ShiftLeft || k.ShiftRight || jm > 0.92;
        const sp = (run ? 3.6 : 1.5) * (jm > 0.15 ? Math.min(1, jm * 1.3) : 1) * dt, l = Math.hypot(f, s);
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        const dx = (fx * f + rx * s) / l * sp, dz = (fz * f + rz * s) / l * sp;
        // try full move, then slide along each axis
        for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]]) if (this.tryMove(mx, mz)) break;
        this.bob += sp * 6;
      }
    }
    const ground = C.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y > ground + 0.02) { this.vy -= 9.8 * dt; this.pos.y = Math.max(ground, this.pos.y + this.vy * dt); } else { this.pos.y = ground; this.vy = 0; }
    this.updateCamera(dt);
  };
  P.tryMove = function (dx, dz) {
    const x = this.pos.x + dx, z = this.pos.z + dz, h0 = C.heightAt(this.pos.x, this.pos.z);
    const ahead = C.heightAt(x + Math.sign(dx) * 0.25, z + Math.sign(dz) * 0.25), h = C.heightAt(x, z);
    if (ahead - h0 > 0.5 || h0 - ahead > 1.6 || C.collides(x, z, 0.28)) return false;
    if (h < 0.15 + (C.sea ? C.sea.tide : 0) - 0.6) return false;   // don't walk into deep water
    this.pos.x = x; this.pos.z = z; return true;
  };

  const tmpL = new T.Vector3();
  P.updateCamera = function (dt) {
    const cam = this.camera, eye = this.sitting ? this.sitting.eye : this.eye;
    const fpPos = tmpL.set(this.pos.x, this.pos.y + eye + Math.sin(this.bob) * 0.025, this.pos.z);
    if (this.cine) {
      const c = this.cine, k = c.snap ? 1 : 1 - Math.exp(-dt * (c.ease || 1.6));
      if (!this._cineK || c.snap) { this._cp.copy(c.snap ? c.pos : cam.position); this._cl.copy(c.snap ? c.look : this._lookPoint(cam.position)); }
      c.snap = false; this._cineK = 1;
      this._cp.lerp(c.pos, k); this._cl.lerp(c.look, k);
      cam.position.copy(this._cp); cam.lookAt(this._cl);
      const tf = (c.fov || this.fov) * (cam.userData.fovBoost || 1);
      if (Math.abs(cam.fov - tf) > 0.05) { cam.fov += (tf - cam.fov) * k; cam.updateProjectionMatrix(); }
    } else {
      if (this._cineK) {   // leaving cinematic mode: adopt the camera's current view direction
        const d = this._cl.clone().sub(cam.position).normalize();
        this.yaw = Math.atan2(-d.x, -d.z); this.pitch = Math.asin(C.clamp(d.y, -1, 1)); this._cineK = 0;
      }
      const tf = this.fov * (cam.userData.fovBoost || 1);
      if (Math.abs(cam.fov - tf) > 0.05) { cam.fov += (tf - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
      cam.position.copy(fpPos);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
  };
  P._lookPoint = function (from) { const d = new T.Vector3(); this.camera.getWorldDirection(d); return d.multiplyScalar(20).add(from); };

  // sit on the nearest bench / ledge (E)
  P.trySit = function () {
    if (this.sitting) { this.sitting = null; return 'stand'; }
    const seats = C.seats || [];
    let best = null, bd = 2.2;
    for (const s of seats) { const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z); if (d < bd) { bd = d; best = s; } }
    if (!best) return null;
    this.sitting = best; this.pos.set(best.x, best.y, best.z); return 'sit';
  };
  P.nearSeat = function () { return (C.seats || []).some(s => Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < 2.2); };
})(window.CITY);
