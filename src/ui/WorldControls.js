export function createWorldControls(C, q) {
  const T = C.THREE;
  const $ = id => document.getElementById(id);
  const { player, env, camera, renderer, sky, sea, weather } = C;
  let hudT = 0;
  // ---- HUD
  let toastT = 0, audio = null;
  const toast = C.toast = (msg, sec = 2.5) => { $('toast').textContent = msg; $('toast').classList.add('show'); toastT = sec; };
  const SPEEDS = [{ k: 1, label: 'Time: real time' }, { k: 20, label: 'Time: ×20' }, { k: 120, label: 'Time: ×120' }, { k: 0, label: 'Time: paused' }];
  let speedI = 1;
  function startAudio() { if (!audio) try { audio = C.audio = new C.Audio(); } catch (e) { console.warn('audio unavailable', e); } }
  function startWander() {
    document.body.classList.remove('story');
    env.mode = 'wander'; player.cine = null; $('title').classList.add('fade'); $('hud').classList.remove('hidden'); document.body.classList.add('wander');
    startAudio(); if (audio) audio.music('town', { fade: 4, vol: 0.6 });
    toast('Wander freely. G: go to a place · H: help', 4);
  }
  function startStory() {
    document.body.classList.remove('wander');
    env.mode = 'story'; $('title').classList.add('fade'); $('hud').classList.remove('hidden'); document.body.classList.add('story');
    const beat = q.get('beat');
    startAudio(); C.Story.start(beat === null ? 0 : /^\d+$/.test(beat) ? Number(beat) : beat);
  }
  C.scope.listen($('btn-story'), 'click', startStory);
  C.scope.listen($('btn-wander'), 'click', startWander);
  if (q.has('start')) { $('title').style.transition = 'none'; startWander(); } else if (q.has('story')) startStory();
  // debug camera for screenshots: ?cam=x,y,z&look=x,y,z (&photo hides the HUD)
  if (q.has('cam')) { const v = (s) => new T.Vector3(...s.split(',').map(Number)); player.cine = { pos: v(q.get('cam')), look: v(q.get('look') || '0,0,0'), snap: true, fov: +(q.get('fov') || 55) }; }
  // station-local debug camera: ?scam=n,dy,s&slook=n,dy,s (dy = height above the rail head at s)
  if (q.has('scam')) {
    const f = C.station.frame, v = (str) => { const [n, dy, s] = str.split(',').map(Number), [x, z] = f.W(n, s); return new T.Vector3(x, f.railY(s) + dy, z); };
    player.cine = { pos: v(q.get('scam')), look: v(q.get('slook') || '0,1,60'), snap: true, fov: +(q.get('fov') || 55) };
  }
  if (q.has('photo')) document.body.classList.add('photo');
  if (q.has('hide')) for (const k of q.get('hide').split(',')) { const object = ({ sea: sea.mesh, far: C.terrainFar, near: C.terrainMesh, dome: sky.dome })[k]; if (object) object.visible = false; }

  // goto menu
  const menu = $('goto'); menu.replaceChildren();
  for (const k in C.PLACES) { const b = document.createElement('button'); b.textContent = C.PLACES[k].name; b.onclick = () => { toast(C.goto(k)); menu.classList.add('hidden'); }; menu.appendChild(b); }

  C.scope.listen(window, 'keydown', (e) => {
    if (env.mode === 'title') { if (e.code === 'Enter') startStory(); return; }
    if (env.mode === 'story') { C.Story.key(e.code); if (e.code === 'KeyM' && audio) toast(audio.toggleMute() ? 'Sound off' : 'Sound on'); if (e.code === 'KeyP') document.body.classList.toggle('photo'); return; }
    switch (e.code) {
      case 'Digit1': env.hour = 7; toast('Morning'); break;
      case 'Digit2': env.hour = 12; toast('Noon'); break;
      case 'Digit3': env.hour = 18.55; toast('Sunset 18:33'); break;
      case 'Digit4': env.hour = 21.3; toast('Night'); break;
      case 'KeyT': speedI = (speedI + 1) % SPEEDS.length; env.speed = SPEEDS[speedI].k; toast(SPEEDS[speedI].label); break;
      case 'KeyG': menu.classList.toggle('hidden'); break;
      case 'KeyR': env.rain = env.rain ? 0 : 0.8; weather.setRain(env.rain); toast(env.rain ? 'Drizzle' : 'Rain stops'); break;
      case 'KeyF': weather.setFog(weather.fogT ? 0 : 1); toast(weather.fogT ? 'Sea fog rolls in' : 'The fog lifts'); break;
      case 'KeyP': document.body.classList.toggle('photo'); break;
      case 'KeyH': $('help').classList.toggle('hidden'); break;
      case 'KeyM': if (audio) toast(audio.toggleMute() ? 'Sound off' : 'Sound on'); break;
      case 'KeyE': { const r = player.trySit(); if (r === 'sit') toast('You sit down and listen to the sea…', 3); else if (r && r.msg) toast(r.msg, 5); break; }
      case 'Escape': menu.classList.add('hidden'); break;
    }
  });

  // ---- touch: on-screen buttons and tap-to-continue in the story
  {
    const bar = $('touchbar'), key = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
    const hours = ['Digit1', 'Digit2', 'Digit3', 'Digit4']; let hi = 2;
    const B = { act: () => key(env.mode === 'story' ? 'Space' : 'KeyE'), skip: () => key('KeyN'), places: () => key('KeyG'),
      time: () => { hi = (hi + 1) % 4; key(hours[hi]); }, rain: () => key('KeyR'), fog: () => key('KeyF'), help: () => key('KeyH') };
    bar.querySelectorAll('button').forEach(b => C.scope.listen(b, 'click', (e) => { e.stopPropagation(); B[b.dataset.k](); }));
    let down = null;
    C.scope.listen(renderer.domElement, 'pointerdown', (e) => { down = [e.clientX, e.clientY, performance.now()]; });
    C.scope.listen(renderer.domElement, 'pointerup', (e) => {
      if (!down || env.mode !== 'story') return;
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 12 && performance.now() - down[2] < 350) C.Story.key('Space');
      down = null;
    });
    for (const id of ['sub', 'note', 'prompt']) C.scope.listen($(id), 'click', () => env.mode === 'story' && C.Story.key('Space'));
  }

  C.scope.defer(() => { audio?.dispose(); });
  return {
    startStory, startWander,
    tick(dt) {
    // HUD
    hudT -= dt;
    if (hudT <= 0 && env.mode !== 'title') {
      hudT = 0.25;
      const hh = Math.floor(env.hour), mm = Math.floor((env.hour - hh) * 60);
      $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      $('place').textContent = env.mode === 'wander' ? C.placeName(player.pos) : '';
      if (env.mode === 'wander' && toastT <= 0) {
        const msg = player.hint ? player.hint() : player.sitting ? 'E: stand up' : player.nearSeat() ? 'E: sit' : '';
        $('toast').textContent = msg; $('toast').classList.toggle('show', !!msg);
      }
    }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    },
    restoreMode(mode) {
      $('title').classList.add('fade'); $('hud').classList.remove('hidden');
      document.body.classList.toggle('story', mode === 'story');
      document.body.classList.toggle('wander', mode === 'wander');
    },
  };
}
