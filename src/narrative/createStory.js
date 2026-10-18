import { StoryRunner } from './StoryRunner';
import { createStoryView } from '../ui/StoryView.js';

export function createStory(C, createChapter) {
  const T = C.THREE, $ = id => document.getElementById(id), V = (x, y, z) => new T.Vector3(x, y, z);
  const env = C.env, player = C.player, rw = C.railway;
  const controls = { hit: false, wanted: null }, tweens = [], timers = {}, postcards = [], props = new Set();
  const view = createStoryView(C, timers);
  const H = { ...view,
    music(name, o) { if (C.audio) C.audio.music(name, o); },
    sfx(name, o) { if (C.audio) C.audio.sfx(name, o); },
    shot(pos, look, o = {}) { player.cine = Object.assign({ pos: pos.clone(), look: look.clone(), ease: 1.4 }, o); },
    cut(pos, look, o = {}) { H.shot(pos, look, Object.assign({ snap: true }, o)); },
    // animate a value over seconds (eased); returns seconds so beats can `yield H.tween(...)`
    tween(sec, fn, ease = true) { tweens.push({ t: 0, sec, fn, ease }); return sec; },
    dolly(sec, p0, p1, l0, l1, o = {}) {
      const c = player.cine = Object.assign({ pos: p0.clone(), look: l0.clone(), snap: true, ease: 50 }, o);
      return H.tween(sec, (f) => { c.pos.lerpVectors(p0, p1, f); c.look.lerpVectors(l0, l1, f); });
    },
    clock(h, sec) {   // only one clock animation at a time
      for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].clock) tweens.splice(i, 1);
      const h0 = env.hour; H.tween(sec, (f) => { env.hour = C.lerp(h0, h, f); }, false); tweens[tweens.length - 1].clock = true; return sec;
    },
    setHour(h) { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].clock) tweens.splice(i, 1); env.hour = h; },
    eye(x, z, dy = 1.55) { return V(x, C.heightAt(x, z) + dy, z); },
    // glide the camera along ground points at walking eye height, looking ahead
    walk(points, speed = 1.6, o = {}) {
      const P = points.map(([x, z]) => V(x, 0, z)), S = [0];
      for (let i = 1; i < P.length; i++) S.push(S[i - 1] + P[i].distanceTo(P[i - 1]));
      const L = S[S.length - 1], at = (s) => { s = C.clamp(s, 0, L); let i = 1; while (i < S.length - 1 && S[i] < s) i++; const f = (s - S[i - 1]) / Math.max(1e-6, S[i] - S[i - 1]); return new T.Vector3().lerpVectors(P[i - 1], P[i], f); };
      const c = player.cine = { pos: V(0, 0, 0), look: V(0, 0, 0), ease: 3, fov: o.fov };
      const sec = L / speed;
      H.tween(sec, (f) => {
        const s = f * L, p = at(s), q = at(s + 6);
        c.pos.set(p.x, C.heightAt(p.x, p.z) + 1.55 + Math.sin(s * 2.2) * 0.025, p.z);
        c.look.set(q.x, C.heightAt(q.x, q.z) + 1.45 + (o.lookUp || 0), q.z);
      }, false);
      return sec;
    },
    // hand control to the player until they reach a target (or press N); hint shows distance
    free(target, radius, hint, maxSec = 240) {
      player.cine = null; H.bars(false); let t = 0;
      return () => {
        t += env.dt || 0;
        const d = Math.hypot(player.pos.x - target.x, player.pos.z - target.z);
        H.prompt(`${hint} — ${Math.round(d)} m   ·   N: skip`);
        if (d < radius || controls.hit && controls.wanted === 'KeyN' || t > maxSec) { H.prompt(''); controls.wanted = null; return true; }
        controls.wanted = 'KeyN'; return false;
      };
    },
    key(text, code = 'Space') { H.prompt(text); controls.wanted = code; controls.hit = false; return () => { if (controls.hit) { H.prompt(''); controls.wanted = null; controls.hit = false; return true; } return false; }; },
    capture(label) { C.capture = label; },
    cast(id, action) { const actor = C.actors.get(id); if (!actor) throw new Error('Unknown actor: ' + id); actor.play(action); },

    ownProp(object) { props.add(object); },
    *ending() {
      H.music('epilogue', { fade: 3 });
      const box = $('cards'); box.innerHTML = ''; box.classList.add('show'); H.fade(0, 0.5);
      for (let i = 0; i < postcards.length; i++) {
        const c = document.createElement('div'); c.className = 'card';
        c.innerHTML = `<img src="${postcards[i].url}"><div class="cap">${postcards[i].label}</div>`;
        c.style.transform = `rotate(${(i % 2 ? 1 : -1) * (1 + i % 3)}deg) scale(0.96)`; box.appendChild(c);
        C.nextFrame(() => { c.style.opacity = 1; c.style.transform = `rotate(${(i % 2 ? 1 : -1) * (1 + i % 3)}deg) scale(1)`; });
        yield 5.5; c.style.opacity = 0; yield 1;
      }
      const end = document.createElement('div'); end.className = 'end';
      end.innerHTML = '世界很温柔。<br><span style="font-size:14px;letter-spacing:.2em">a fan tribute by Nilarf2 · story by Jiang Nan, <i>Dragon Raja</i> III · original music<br>map data © OpenStreetMap contributors · elevation © 国土地理院 GSI</span><br><span style="font-size:13px;opacity:.7">click to wander the town</span>';
      box.appendChild(end); C.nextFrame(() => { end.style.opacity = 1; });
      yield H.key('', 'Space');
    },
  };
  function resetBeat() {
    tweens.length = 0; controls.hit = false; controls.wanted = null;
    for (const key in timers) delete timers[key];
    if (C.active) { H.subOff(); H.noteOff(); H.prompt(''); }
    for (const object of props) { object.removeFromParent(); object.traverse(o => o.geometry?.dispose()); }
    props.clear();
  }
  const chapter = createChapter(C, H, controls);
  const runner = new StoryRunner(chapter.beats, resetBeat, () => story.finish());
  const story = {
    H, BEATS: chapter.beats, runner,
    get checkpoint() { return runner.checkpoint; },
    start(id = chapter.beats[0].id) {
      if (typeof id === 'number') id = chapter.beats[Math.max(0, Math.min(chapter.beats.length - 1, id))].id;
      resetBeat(); postcards.length = 0; H._tc = 0; rw.clear(); rw.mode = 'manual';
      env.mode = 'story'; runner.start(id);
    },
    update(dt) {
      env.dt = dt;
      for (const key in timers) { const timer = timers[key]; if ((timer.t -= dt) <= 0) { delete timers[key]; timer.fn(); } }
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tween = tweens[i]; tween.t += dt; const f = C.clamp(tween.t / tween.sec, 0, 1);
        tween.fn(tween.ease ? C.smooth(0, 1, f) : f); if (f >= 1) tweens.splice(i, 1);
      }
      runner.update(dt);
    },
    blackout() { const b = view._black; return !!(b && b.v >= 1 && performance.now() >= b.until) || $('cards').classList.contains('show'); },
    key(code) {
      if (code === 'Escape') { this.finish(); return; }
      if (code === 'KeyN') { runner.next(); return; }
      if (code === controls.wanted || (controls.wanted === 'Space' && code === 'Enter')) controls.hit = true;
    },
    postcard(label, url) { postcards.push({ label, url }); },
    finish() {
      runner.stop(); resetBeat(); H.bars(false); H.fade(0, 0.3); H.chapterOff();
      $('cards').classList.remove('show'); $('cards').replaceChildren();
      C.weather.setFog(0); C.weather.setRain(0); C.weather.ambient = null; C.sea.tide = 0; C.sky.sunScale = 1;
      C.audio?.setEarphones(false);
      env.mode = 'wander'; player.cine = null; rw.clear(); rw.mode = 'timetable';
      document.body.classList.remove('story'); document.body.classList.add('wander');
      $('hud').classList.remove('hidden'); C.audio?.music('town', { fade: 4, vol: 0.5 });
    },
    dispose() { runner.stop(); resetBeat(); postcards.length = 0; C.capture = null; },
  };
  C.scope.listen($('cards'), 'click', () => { controls.hit = true; });
  return story;
}
