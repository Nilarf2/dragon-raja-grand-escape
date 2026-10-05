// Boot: renderer, world build, modes (story / wander), HUD, keys, main loop.
// URL: ?t=18.6 (hour) ?at=station|lot|lane|shrine|summit|rock|wheel ?start (wander, skip title) ?story ?beat=N
//      ?lite (half res, no shadows) ?still (render 3 frames) ?nofx ?yaw=deg ?pitch=deg
(function (C) {
  const T = THREE, q = new URLSearchParams(location.search), $ = (id) => document.getElementById(id);
  const touch = C.TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const mobile = C.MOBILE = touch && Math.min(screen.width, screen.height) < 900;
  if (touch) document.body.classList.add('touch');
  const lite = q.has('lite');
  // the post-FX pass renders into its own MSAA target, so the canvas itself needs no antialiasing (saves a full-screen resolve)
  const renderer = new T.WebGLRenderer({ antialias: !lite && q.has('nofx'), powerPreference: 'high-performance' });
  renderer.setPixelRatio(lite ? 0.5 : mobile ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !lite && !mobile; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // re-rendered every 2nd frame in the loop
  $('app').appendChild(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.25, 40000);

  // ---- world
  const t0 = performance.now();
  C.buildTerrain(scene);
  const sky = new C.Sky(scene, renderer), sea = new C.Sea(scene), weather = new C.Weather(scene);
  C.buildStation(scene);
  C.buildTown(scene);
  const railway = C.buildRailway(scene);
  const player = new C.Player(camera, renderer.domElement);
  // seats: station benches + the rock edge
  C.seats = (C.benches || []).map(b => ({ x: b.world[0], z: b.world[1], y: b.y, eye: 1.15, label: 'bench' }));
  if (C.town.rock) { const p = C.town.rock.group.localToWorld(C.town.rock.seat.position.clone()); C.seats.push({ x: p.x, y: C.ANCHORS.cliffRock.y, z: p.z, eye: 0.95, label: 'rock' }); }
  const stats = C.mergeStatic(scene, [sky.dome, sea.mesh, C.terrainMesh, C.terrainFar, C.terrainPatch]);
  const fx = new C.PostFX(renderer, scene, camera);
  fx.enabled = !q.has('nofx');
  Object.assign(C, { scene, renderer, camera, player, sky, sea, weather, railway, fx });
  console.log('built in', Math.round(performance.now() - t0), 'ms; merged', stats);

  // portrait screens: widen the view so the scene still reads
  const fitFov = () => { const a = innerWidth / innerHeight; camera.userData.fovBoost = a < 1 ? 1.35 : 1; };
  fitFov();
  addEventListener('resize', () => {
    fitFov(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); fx.setSize(innerWidth, innerHeight);
  });

  // ---- places (teleport targets / viewpoints): [x, z, bearing°, pitch°]
  const A = C.ANCHORS, fr = C.station.frame, P2 = C.station.plat2, P1 = C.station.plat1;
  const W2 = fr.W(P2.nc, 58), W1 = fr.W(P1.nc, 74);
  C.PLACES = {
    station: { name: 'Baishinji Station  梅津寺駅', x: W2[0], z: W2[1], b: 290, p: -2 },
    platform1: { name: 'Platform 1', x: W1[0], z: W1[1], b: 250, p: 0 },
    lot: { name: 'The empty lot', x: A.parkingLot.x + 14, z: A.parkingLot.z - 6, b: 240, p: -4 },
    lane: { name: 'The shrine lane', x: A.townStreet[0].x, z: A.townStreet[0].z + 4, b: 356, p: 4 },
    shrine: { name: 'Town shrine & hill tram', x: A.townStreet[5].x, z: A.townStreet[5].z + 2, b: 356, p: 8 },
    summit: { name: 'Summit, the mine shrine', x: A.jizo.x, z: A.jizo.z + 2, b: 0, p: 0 },
    rock: { name: 'The rock at the cliff', x: A.cliffRock.x + Math.sin(A.cliffRock.rot) * 2.5, z: A.cliffRock.z + Math.cos(A.cliffRock.rot) * 2.5, b: 285, p: -8 },
    wheel: { name: 'The Ferris wheel', x: A.ferrisWheel.x + 30, z: A.ferrisWheel.z + 30, b: 315, p: 12 },
    beach: { name: 'The beach', x: fr.W(P2.n0 - 6.2, 90)[0], z: fr.W(P2.n0 - 6.2, 90)[1], b: 318, p: 2 },   // on the dry sand south of the beach stairs, looking north along the wall
  };
  C.goto = (k) => { const p = C.PLACES[k]; if (!p) return; player.place(p.x, p.z); player.faceBearing(p.b); player.pitch = p.p * Math.PI / 180; return p.name; };
  C.placeName = (pos) => { let best = '', bd = 60; for (const k in C.PLACES) { const p = C.PLACES[k], d = Math.hypot(p.x - pos.x, p.z - pos.z); if (d < bd) { bd = d; best = p.name; } } return best; };

  // ---- state
  const env = C.env = { hour: q.has('t') ? parseFloat(q.get('t')) : 17.5, night: 0, sky, camera, player, speed: 1, rain: 0, mode: 'title', t: 0 };
  C.goto(q.get('at') || 'lot');
  if (q.has('yaw')) player.faceBearing(+q.get('yaw')); if (q.has('pitch')) player.pitch = +q.get('pitch') * Math.PI / 180;
  // title backdrop: a slow look from the hill over the sea
  if (!q.has('start') && !q.has('story') && !q.has('at')) player.cine = { pos: new T.Vector3(A.cliffRock.x - 10, A.cliffRock.y + 26, A.cliffRock.z + 6), look: new T.Vector3(-1500, -40, -700), snap: true, fov: 50 };

  // ---- HUD
  let toastT = 0, audio = null;
  const toast = C.toast = (msg, sec = 2.5) => { $('toast').textContent = msg; $('toast').classList.add('show'); toastT = sec; };
  const SPEEDS = [{ k: 1, label: 'Time: real time' }, { k: 20, label: 'Time: ×20' }, { k: 120, label: 'Time: ×120' }, { k: 0, label: 'Time: paused' }];
  let speedI = 1;
  function startAudio() { if (!audio) try { audio = C.audio = new C.Audio(); } catch (e) { console.warn('audio unavailable', e); } }
  function startWander() {
    env.mode = 'wander'; player.cine = null; $('title').classList.add('fade'); $('hud').classList.remove('hidden'); document.body.classList.add('wander');
    startAudio(); if (audio) audio.music('town', { fade: 4, vol: 0.6 });
    toast('Wander freely. G: go to a place · H: help', 4);
  }
  function startStory() {
    env.mode = 'story'; $('title').classList.add('fade'); $('hud').classList.remove('hidden'); document.body.classList.add('story');
    startAudio(); C.Story.start(q.has('beat') ? +q.get('beat') : 0);
  }
  $('btn-story').addEventListener('click', startStory);
  $('btn-wander').addEventListener('click', startWander);
  if (q.has('start')) { $('title').style.transition = 'none'; startWander(); } else if (q.has('story')) startStory();
  // debug camera for screenshots: ?cam=x,y,z&look=x,y,z (&photo hides the HUD)
  if (q.has('cam')) { const v = (s) => new T.Vector3(...s.split(',').map(Number)); player.cine = { pos: v(q.get('cam')), look: v(q.get('look') || '0,0,0'), snap: true, fov: +(q.get('fov') || 55) }; }
  // station-local debug camera: ?scam=n,dy,s&slook=n,dy,s (dy = height above the rail head at s)
  if (q.has('scam')) {
    const f = C.station.frame, v = (str) => { const [n, dy, s] = str.split(',').map(Number), [x, z] = f.W(n, s); return new T.Vector3(x, f.railY(s) + dy, z); };
    player.cine = { pos: v(q.get('scam')), look: v(q.get('slook') || '0,1,60'), snap: true, fov: +(q.get('fov') || 55) };
  }
  if (q.has('photo')) document.body.classList.add('photo');
  if (q.has('hide')) for (const k of q.get('hide').split(',')) ({ sea: sea.mesh, far: C.terrainFar, near: C.terrainMesh, dome: sky.dome })[k].visible = false;

  // goto menu
  const menu = $('goto');
  for (const k in C.PLACES) { const b = document.createElement('button'); b.textContent = C.PLACES[k].name; b.onclick = () => { toast(C.goto(k)); menu.classList.add('hidden'); }; menu.appendChild(b); }

  addEventListener('keydown', (e) => {
    if (env.mode === 'title') { if (e.code === 'Enter') startStory(); return; }
    if (env.mode === 'story') { C.Story.key(e.code); if (e.code === 'KeyM' && audio) toast(audio.toggleMute() ? 'Sound off' : 'Sound on'); if (e.code === 'KeyP') document.body.classList.toggle('photo'); return; }
    switch (e.code) {
      case 'Digit1': env.hour = 7; toast('Morning'); break;
      case 'Digit2': env.hour = 12; toast('Noon'); break;
      case 'Digit3': env.hour = 18.55; toast('Sunset 18:33'); break;
      case 'Digit4': env.hour = 21.3; toast('Night'); break;
      case 'KeyT': speedI = (speedI + 1) % SPEEDS.length; toast(SPEEDS[speedI].label); break;
      case 'KeyG': menu.classList.toggle('hidden'); break;
      case 'KeyR': env.rain = env.rain ? 0 : 0.8; weather.setRain(env.rain); toast(env.rain ? 'Drizzle' : 'Rain stops'); break;
      case 'KeyF': weather.setFog(weather.fogT ? 0 : 1); toast(weather.fogT ? 'Sea fog rolls in' : 'The fog lifts'); break;
      case 'KeyP': document.body.classList.toggle('photo'); break;
      case 'KeyH': $('help').classList.toggle('hidden'); break;
      case 'KeyM': if (audio) toast(audio.toggleMute() ? 'Sound off' : 'Sound on'); break;
      case 'KeyE': { const r = player.trySit(); if (r === 'sit') toast('You sit down and listen to the sea…', 3); break; }
      case 'Escape': menu.classList.add('hidden'); break;
    }
  });

  // ---- touch: on-screen buttons and tap-to-continue in the story
  {
    const bar = $('touchbar'), key = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
    const hours = ['Digit1', 'Digit2', 'Digit3', 'Digit4']; let hi = 2;
    const B = { act: () => key(env.mode === 'story' ? 'Space' : 'KeyE'), skip: () => key('KeyN'), places: () => key('KeyG'),
      time: () => { hi = (hi + 1) % 4; key(hours[hi]); }, rain: () => key('KeyR'), fog: () => key('KeyF'), help: () => key('KeyH') };
    bar.querySelectorAll('button').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); B[b.dataset.k](); }));
    let down = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY, performance.now()]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || env.mode !== 'story') return;
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 12 && performance.now() - down[2] < 350) C.Story.key('Space');
      down = null;
    });
    for (const id of ['sub', 'note', 'prompt']) $(id).addEventListener('click', () => env.mode === 'story' && C.Story.key('Space'));
  }

  // ---- loop
  const clock = new T.Clock();
  let hudT = 0, framesLeft = q.has('still') ? 3 : Infinity, frameNo = 0;
  // dynamic resolution: keep ~50+ fps by trading pixel ratio (between 0.6 and the device cap)
  const prMax = renderer.getPixelRatio(), prMin = Math.min(prMax, 0.6);
  let prT = 0, prFrames = 0, pr = prMax;
  function adaptResolution(dt) {
    if (lite || q.has('still')) return;
    prT += dt; prFrames++;
    if (prT < 1.5) return;
    const fps = prFrames / prT; prT = 0; prFrames = 0;
    const next = fps < 45 ? Math.max(prMin, pr - 0.15) : fps > 58 ? Math.min(prMax, pr + 0.1) : pr;
    if (Math.abs(next - pr) > 0.01) { pr = next; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); fx.setSize(innerWidth, innerHeight); }
    if (statsEl) statsEl.textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1e6).toFixed(2)} M tris · res ×${pr.toFixed(2)}`;
  }
  const statsEl = q.has('stats') ? Object.assign(document.body.appendChild(document.createElement('div')), { id: 'stats' }) : null;
  if (statsEl) renderer.info.autoReset = false;
  const focus = new T.Vector3(), fwd = new T.Vector3();
  function frame(fixedDt) {
    if (--framesLeft > 0 && !fixedDt) requestAnimationFrame(() => frame());
    const raw = clock.getDelta(), dt = fixedDt || Math.min(raw, 0.1);
    env.t += dt;
    if (env.mode === 'wander') env.hour = (env.hour + dt * SPEEDS[speedI].k / 3600 + 24) % 24;
    // the story keeps real time even on a slow GPU (frames up to 0.5 s), so its pacing and subtitle timers stay in step
    if (env.mode === 'story') C.Story.update(fixedDt || Math.min(raw, 0.5));
    player.update(dt);
    camera.getWorldDirection(fwd); focus.copy(camera.position).addScaledVector(fwd.setY(0).normalize(), 40);
    sky.update(env.hour, focus, dt, camera);
    env.night = sky.state.night;
    weather.update(dt, camera, sky, env.t);
    sea.update(env.t, sky);
    railway.update(dt, env.hour, env.t);
    for (const fn of C.updaters) fn(dt, env.t, env);
    C.updateHalos(env.night);
    if (env.mode !== 'story') fx.preset(C.PostFX.autoPreset(env.hour, weather.rain), 4);
    fx.update(dt);
    if (audio) {
      const nearSea = C.clamp(1 - (C.groundH(player.pos.x - 25, player.pos.z) > 1 ? 0.6 : 0) - Math.max(0, camera.position.y - 20) / 150, 0, 1);
      const nt = railway.nearest(camera.position);
      audio.update({ hour: env.hour, night: env.night, dt, time: env.t, player: camera.position, nearSea, rain: weather.rain,
        train: { near: nt.train ? C.clamp(1 - nt.dist / 250, 0, 1) : 0, moving: !!(nt.train && nt.train.v > 0.5), steam: !!(nt.train && nt.train.kind === 'd51') },
        crossing: C.station.crossingOn && Math.hypot(camera.position.x - C.station.crossing.x, camera.position.z - C.station.crossing.z) < 300 });
    }
    // HUD
    hudT -= dt;
    if (hudT <= 0 && env.mode !== 'title') {
      hudT = 0.25;
      const hh = Math.floor(env.hour), mm = Math.floor((env.hour - hh) * 60);
      $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      $('place').textContent = env.mode === 'wander' ? C.placeName(player.pos) : '';
      if (env.mode === 'wander' && toastT <= 0) {
        const msg = player.sitting ? 'E: stand up' : player.nearSeat() ? 'E: sit' : '';
        $('toast').textContent = msg; $('toast').classList.toggle('show', !!msg);
      }
    }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    // behind a fully black story fade there is nothing to see: skip the 3D render (it was the panorama, the most expensive view)
    const black = env.mode === 'story' && C.Story.blackout();
    if (renderer.shadowMap.enabled && (frameNo++ % 2 === 0 || fixedDt)) renderer.shadowMap.needsUpdate = true;
    if (statsEl) renderer.info.reset();
    if (!black) fx.render(env.t);
    adaptResolution(dt);
    if (C.capture) { try { C.Story.postcard(C.capture, renderer.domElement.toDataURL('image/jpeg', 0.85)); } catch (e) { } C.capture = null; }
  }
  C.step = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) frame(dt); };
  frame();
  C.ready = true; window.__shotReady = true;
})(window.CITY);
