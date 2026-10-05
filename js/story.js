// Story mode: Book III, Ch.10 「迎着阳光盛大逃亡」, told through Lu Mingfei's eyes.
// Erii is never drawn (no character models yet): she is her notebook, her lines, the things she leaves behind.
// Beats are generators; they yield seconds (number), a predicate (function), or a Promise-like {key:true}.
// Hook for later character models: cast(name, …) is a no-op unless C.makeLuMingfei / C.makeErii exist.
(function (C) {
  const T = THREE, $ = (id) => document.getElementById(id), V = (x, y, z) => new T.Vector3(x, y, z);
  let A, env, player, rw, it = null, waitT = 0, waitFn = null, beatI = 0, tweens = [], keyWanted = null, keyHit = false;
  const postcards = [];
  const timers = {};   // hide timers for subtitles and notes; they run on the story clock, so lines stay in step with the beats at any frame rate

  // ---------- presentation helpers ----------
  const H = {
    bars(on) { document.body.classList.toggle('cine', on); },
    fade(v, sec = 1.5) {
      const f = $('fade'); f.style.transition = `opacity ${sec}s`; f.style.opacity = v;
      H._black = { v, until: performance.now() + sec * 1000 };   // main.js skips 3D rendering while the screen is fully black
      return sec;
    },
    chapter(jp, en, meta = '') { const c = $('chapter'); c.querySelector('.jp').textContent = jp; c.querySelector('.en').textContent = en; c.querySelector('.meta').textContent = meta; c.classList.add('show'); },
    chapterOff() { $('chapter').classList.remove('show'); },
    // q: the line (Chinese narration / novel quote, or Japanese when spoken in Japanese), t: English, z: Chinese under Japanese
    sub(q, t = '', sec = 5, z = '') {
      const s = $('sub'); s.querySelector('.q').textContent = q || ''; s.querySelector('.z').textContent = z || ''; s.querySelector('.t').textContent = t || ''; s.classList.add('show');
      delete timers.sub; if (sec) timers.sub = { t: sec, fn: () => s.classList.remove('show') };
      return sec;
    },
    subOff() { $('sub').classList.remove('show'); },
    note(main, small = '', sec = 6) {   // Erii's notebook
      const n = $('note'); n.querySelector('.page').innerHTML = `${main}${small ? `<br><span class="small">${small}</span>` : ''}`; n.classList.add('show');
      delete timers.note; if (sec) timers.note = { t: sec, fn: () => n.classList.remove('show') };
      if (C.audio) C.audio.sfx('pageFlip');
      return sec;
    },
    noteOff() { $('note').classList.remove('show'); },
    prompt(text) {
      if (text && C.TOUCH) text = text.replace(/^Space: /, 'Tap: ').replace(/N: skip/, 'Skip ⏭');
      const p = $('prompt'); p.textContent = text || ''; p.classList.toggle('show', !!text);
    },
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
        if (d < radius || keyHit && keyWanted === 'KeyN' || t > maxSec) { H.prompt(''); keyWanted = null; return true; }
        keyWanted = 'KeyN'; return false;
      };
    },
    key(text, code = 'Space') { H.prompt(text); keyWanted = code; keyHit = false; return () => { if (keyHit) { H.prompt(''); keyWanted = null; keyHit = false; return true; } return false; }; },
    capture(label) { C.capture = label; },
    cast() { /* character hook: no character models in this version */ },
  };

  // small props only the story needs
  function heels() {
    const g = new T.Group(), m = C.toon(0x5b2a6e);
    for (const s of [-0.09, 0.09]) { C.box(0.08, 0.04, 0.22, m, s, 0.09, 0, g); C.box(0.02, 0.09, 0.02, m, s, 0.045, -0.09, g); C.box(0.075, 0.03, 0.08, m, s, 0.015, 0.08, g); }
    return g;
  }

  // ---------- the beats ----------
  const BEATS = [
    function* prologue() {
      H.fade(1, 0); H.bars(true); H.music('title', { fade: 2, vol: 0.8 }); env.hour = 17.45;
      H.chapter('迎着阳光盛大逃亡', 'A GRAND ESCAPE INTO THE SUN', 'Dragon Raja III · Chapter 10 · Baishinji, Matsuyama · Saturday');
      yield 5; H.chapterOff(); yield 2;
      H.sub('东京在燃烧。这一天，一个男孩和一个女孩，逃到了濑户内海边的小镇。', 'Tokyo was burning. For one day, a boy and a girl ran away to a small town on the Seto Inland Sea.', 6); yield 6.5;
      H.sub('她从没见过这个世界。他答应过，要带她去看看。', 'She had never seen the world. He had promised to show it to her.', 5); yield 5.5;
    },
    function* parkingLot() {
      const L = A.parkingLot;
      env.hour = 17.5; H.cut(V(L.x + 8, 5.4, L.z - 4), V(L.x - 6, 5.3, L.z + 4), { fov: 40 });
      H.fade(0, 3); H.music('town', { fade: 4, vol: 0.5 });
      yield 2; H.capture('The empty lot · 17:30');
      H.sub('足球场那么大的空地上，只停着一辆红色的车。听得见海浪。', 'An empty lot as big as a football field, and one red car in it. You can hear the sea.', 6);
      yield H.dolly(10, V(L.x + 8, 5.4, L.z - 4), V(L.x + 18, 9, L.z - 12), V(L.x - 6, 5.3, L.z + 4), V(-60, 4, 40));
      H.sub('白色栏杆的那一边，是小小的车站，和大海。', 'Beyond the white railings: a tiny station, and the sea.', 5); yield 5;
      H.sub('她想去镇上看看。沿着街道往坡上走，去那条老巷子。', 'She wants to see the town. Follow the street up the hill to the old lane.', 5); yield 3;
      const goal = A.townStreet[0];
      C.goto('lot'); player.faceBearing(10);
      yield H.free(goal, 10, 'Walk to the old shrine lane');
    },
    function* lane() {
      const S = A.townStreet;
      H.fade(1, 1); yield 1.2; env.hour = Math.max(env.hour, 17.62);
      C.weather.ambient = { center: V(S[2].x, S[2].y, S[2].z), radius: 40, rate: 3 };
      player.place(S[0].x, S[0].z + 2); player.faceBearing(356); player.cine = null; H.fade(0, 1.5); H.bars(false);
      H.sub('一条忘了走出五十年代的街：木头房子，靛蓝的门帘，晚开的重瓣樱花。', 'A street that forgot to leave the 1950s: wooden houses, indigo noren, late double cherry blossoms.', 6);
      // shop reactions as you pass them
      const shops = (C.town.lane && C.town.lane.shops) || [], said = new Set();
      const lines = { tofu: ['豆腐！', '(tofu!)'], dye: ['好漂亮的布。', 'such pretty cloth'], sweets: ['甜的？', 'is it sweet?'], general: ['什么都有。', 'they have everything'], sake: ['……', ''] };
      const kinds = ['tofu', 'dye', 'sweets', 'general', 'sake'];
      let t = 0, greeted = false; const goal = S[S.length - 1];
      yield () => {
        t += env.dt;
        shops.forEach((sh, i) => {
          const p = sh.group.position, k = kinds[i % kinds.length];
          if (!said.has(i) && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 9) {
            said.add(i); H.note(lines[k][0], lines[k][1], 3.5);
            if (!greeted) { greeted = true; H.sub('いらっしゃいませ。', '"Welcome!" (the shopkeeper)', 3.5, '欢迎光临。'); }
          }
        });
        const d = Math.hypot(player.pos.x - goal.x, player.pos.z - goal.z);
        H.prompt(`She stops at every shop. Walk up the lane to the shrine — ${Math.round(d)} m   ·   N: skip`);
        if (d < 8 || (keyHit && keyWanted === 'KeyN') || t > 300) { H.prompt(''); keyWanted = null; keyHit = false; return true; }
        keyWanted = 'KeyN'; env.hour = Math.min(17.9, env.hour + env.dt / 600); return false;
      };
      H.capture('The shrine lane · 17:50');
    },
    function* tram() {
      const tr = C.town.tram; if (!tr) return;
      env.hour = Math.max(env.hour, 17.9); H.bars(true);
      const b = A.tramBase, back = V(b.x - Math.sin(tr.head) * 9, b.y + 3, b.z - Math.cos(tr.head) * 9);
      H.shot(back, tr.p1.clone().lerp(tr.p0, 0.8), { ease: 1.2, fov: 45 });
      H.sub('神社旁边，一辆小小的登山电车以夸张的角度爬上山去。那是铜矿时代留下的老线路。', 'Beside the shrine, a little tram climbs the hill at an absurd angle. An old line from the copper-mine days.', 6); yield 6;
      H.sub('一会儿解开手帕会看到很漂亮的景色。', '"When I untie the handkerchief, you\'ll see something beautiful."', 6);
      yield H.key('Space: blindfold her with your handkerchief');
      H.note('（点头）', 'she nods, and puts her hand in his', 4); yield 4;
      H.music('tram', { fade: 3 }); H.sfx('tramBell');
      const dir = tr.p1.clone().sub(tr.p0).normalize();
      const c = player.cine = { pos: V(0, 0, 0), look: V(0, 0, 0), ease: 6, fov: 60 };
      H.clock(18.2, 48);
      yield H.tween(48, (f) => {
        tr.set(f); const p = tr.model.group.position;
        c.pos.copy(p).addScaledVector(dir, -1.5).add(V(0, 1.75, 0)); c.look.copy(p).addScaledVector(dir, 20).add(V(0, 1.2, 0));
        if (Math.abs(f - 0.45) < 0.01 && !H._tc) { H._tc = 1; H.capture('The hill tram · 18:05'); }
      });
      H.sub('红色的光从没有玻璃的窗户斜照进来，在老旧的木头座椅上晃动。咯噔，咯噔。', 'Red light slants through the glassless windows and flickers over the old wooden seats. Clack, clack, clack.', 0);
      yield 0.5; H.subOff();
    },
    function* summit() {
      const j = C.town.jizo, J = A.jizo;
      env.hour = 18.22; H.bars(true);
      H.cut(V(J.x + 3, J.y + 1.4, J.z + 1.5), V(J.x, J.y + 0.5, J.z), { fov: 40 });
      H.sub('电车在山顶停下。站前有一尊小小的石地藏，头上搭着遮雨的砖顶。', 'The tram stops before a stone jizo under a tiny brick roof.', 5); yield 3;
      yield H.key('Space: leave your leftover onigiri for the jizo');
      if (j && C.makeOnigiri) { const o = C.makeOnigiri(); j.offeringSlot.add(o); }
      H.capture('The jizo · 18:15'); yield 2.5;
      H.sub('他领着蒙着眼睛的她，走上几十年前矿工进山的小路。她的手搭在他肩上。', 'He leads her, still blindfolded, along the path the miners walked decades ago. Her hands on his shoulders.', 6);
      const M = A.mineShrine;
      yield H.walk([[J.x, J.z], [C.lerp(J.x, M.x, 0.5) + 2, C.lerp(J.z, M.z, 0.5)], [M.x + Math.sin(M.rot) * 9, M.z + Math.cos(M.rot) * 9]], 1.3);
      H.shot(H.eye(M.x + Math.sin(M.rot) * 7.5, M.z + Math.cos(M.rot) * 7.5, 1.4), V(M.x, M.y + 2.6, M.z), { fov: 45 });
      H.sub('封闭的矿井口。镇上的人在这里建了木头的祠堂，每一根椽子上都挂满了鲤鱼旗。', 'The sealed mine. The town built a wooden hall over its mouth; every rafter is hung with carp streamers.', 6); yield 6;
      H.sub('谁家生了男孩，就来挂一面鲤鱼旗；生了女孩，就在屋檐下放一个瓷娃娃。', 'A family that has a boy hangs a koinobori here. A family that has a girl leaves a ceramic doll under the eaves.', 7);
      H.capture('The mine shrine · 18:25'); yield 7;
      H.sub('跟网上说的一模一样啊。', '"Just like it said online."', 4); yield 4;
      // along the rusty mine-cart rails to the edge
      const R = A.cliffRock;
      env.hour = 18.55;
      yield H.walk([[M.x + Math.sin(M.rot) * 6, M.z + Math.cos(M.rot) * 6], [R.x - Math.sin(R.rot) * 1.5, R.z - Math.cos(R.rot) * 1.5], [R.x + Math.sin(R.rot) * 2, R.z + Math.cos(R.rot) * 2]], 1.2, { lookUp: -1 });
      H.sub('生锈的矿车轨道一直延伸到悬崖边，停在一块探出去的岩石上。', 'The rails run to the edge of the cliff and stop at a rock jutting out over the drop.', 5); yield 5;
    },
    function* reveal() {
      const R = A.cliffRock, sx = R.x + Math.sin(R.rot) * 2.6, sz = R.z + Math.cos(R.rot) * 2.6, eye = V(sx, R.y + 1.25, sz);
      env.hour = 18.64; C.sky.sunScale = 1.7;
      H.bars(true); yield H.key('Space: untie the handkerchief');
      // her eyes: darkness, then the world
      H.fade(1, 0.01); yield 0.6; H.music('sunset', { fade: 1.5, vol: 1 });
      const town = V(-150, 5, -60), sea = (az, d = 4000) => V(sx + Math.sin(az * Math.PI / 180) * d, 0, sz - Math.cos(az * Math.PI / 180) * d);
      H.cut(eye, town, { fov: 52 }); H.fade(0, 4); C.fx.preset('sunset', 3);
      // the yellow train passes the little station below
      rw.spawn('emu', -1, rw.stopN + 380, 10, { stop: false, vmax: 10 });
      yield 4;
      H.sub('脚下是黑色的礁石和白色的浪花，森林变成淡红色的海。空荡荡的学校，转动的摩天轮拖着长长的影子。', 'Below: black rocks and white spray. The forest a pale-red sea. The empty school, the turning Ferris wheel and its long shadow.', 7); yield 3;
      yield H.dolly(14, eye, eye, town, V(-60, 4, 30));
      H.sub('一列慢吞吞的小火车，滑过围着白色栏杆的车站。', 'A slow little train slides past the station with the white railings.', 5); yield 5;
      H.note('世界很温柔。', 'The world is gentle.', 6); H.capture('From the cliff · 18:40'); yield 6;
      H.sub('“温柔”……他从没想过，会有人用这个词来形容整个世界。', 'He had never thought "gentle" could describe something as huge as the world.', 5); yield 5;
      H.sub('他把耳机挂在她耳朵上，放一首老电视剧里的歌给她听。', 'He hangs his earphones on her ears and plays her a song from an old TV drama.', 5);
      if (C.audio && C.audio.setEarphones) C.audio.setEarphones(true);
      yield H.dolly(10, eye, eye, V(-60, 4, 30), sea(C.sky.state.sunAz || 290, 4000).setY(60));
      H.clock(18.79, 60);
      H.note('喜欢这样的世界，这样的世界很温柔。', 'I like this world. This world is gentle.', 7); yield 9;
      const sunHalf = () => (C.sky.state.sunAlt || 1) < 0.15;
      yield () => sunHalf() || env.hour >= 18.785;
      H.sub('一半太阳在海面上，一半沉进海里——和倒影合在一起，正好是一个完整的圆。', 'Half a sun above the sea, half below: with its reflection, one whole circle.', 7); H.capture('Half a sun · 18:46'); yield 7;
      H.note('我很喜欢这样的世界……', 'I really like this world…', 6); yield 6.5;
      H.note('但世界不喜欢我。', 'But the world doesn\'t like me.', 7); yield 7.5;
      H.sub('如果世界真的不喜欢你，那世界就是我的敌人了。', '"If the world really doesn\'t like you, then the world is my enemy."', 8); yield 8.5;
      H.sub('世界喜不喜欢你，只取决于你的朋友喜不喜欢你。', 'Whether the world likes you only depends on whether your friends do.', 6); yield 6.5;
      H.note('什么是好朋友？', 'What is a good friend?', 5); yield 5.5;
      H.sub('“就是那种很神经病的朋友，不管怎么样都会相信你。”', '"The crazy kind. The kind who believes you no matter what."', 5); yield 3;
      C.weather.petalBurst(V(sx + 6, R.y + 1, sz + 6), V(-1, 0.4, -0.5), 220); H.sfx('petalGust');
      H.clock(19.0, 12); yield 12;
      if (C.audio && C.audio.setEarphones) C.audio.setEarphones(false);
      H.fade(1, 4); yield 5; C.sky.sunScale = 1;
    },
    function* lanterns() {
      const S = A.townStreet;
      env.hour = 20.5; C.fx.preset('night', 0.1); C.weather.ambient = null;
      H.chapter('', '20:30', ''); H.music('lantern', { fade: 3 }); yield 2.5; H.chapterOff();
      const pts = S.slice().reverse().map(p => [p.x, p.z]);
      H.fade(0, 2.5);
      H.sub('夜色降临。长街上大大小小的白灯笼亮了起来，像是沿着一条线散落的珠子。', 'Night falls. Along the street the white lanterns light up, big and small, like beads scattered along a string.', 7);
      H.walk(pts, 1.3, { fov: 55 }); yield 8; H.capture('Lantern street · 20:30');
      yield 22;
      H.fade(1, 2.5); yield 3;
    },
    function* stationNight() {
      const fr = C.station.frame, P2 = C.station.plat2, P1 = C.station.plat1;
      env.hour = 21.15; C.sea.tide = 1.3; C.weather.setRain(0.25); C.fx.preset('night', 0.1); H.music('station', { fade: 3 });
      // her heels on platform 2, by the stairs to the beach
      const hp = fr.W(P2.n0 + 0.7, 65.5), hl = heels(); hl.position.set(hp[0], P2.yAt(65.5), hp[1]); hl.rotation.y = fr.rot + 1.2; C.scene.add(hl);
      const bw = fr.W(P2.n0 - 9, 70), plat = fr.W(P2.nc, 64);
      H.cut(V(plat[0], P2.yAt(64) + 1.2, plat[1]), V(bw[0], 2.5, bw[1]), { fov: 45 }); H.fade(0, 3);
      H.sub('涨潮了。黑色的海水在碎石滩上翻起白沫。水银色的灯光把铁轨照得发亮。', 'High tide. Black water, white foam on the gravel beach. The mercury-white lamps make the rails gleam.', 7); yield 7;
      H.sub('她把高跟鞋留在站台上，穿着他的运动鞋蹲在碎石滩上，逗那些小虾小蟹。', 'She left her heels on the platform. She squats on the beach in his sneakers, playing with tiny shrimp and crabs.', 7); H.capture('The station at night · 21:20'); yield 7;
      player.place(plat[0], plat[1]); player.faceBearing(250); player.cine = null; H.bars(false);
      H.clock(21.62, 70);
      let t = 0; yield () => { t += env.dt; H.prompt('Wait on the platform. The last train is at 21:45   ·   N: skip'); if (t > 70 || keyHit && keyWanted === 'KeyN') { keyWanted = null; keyHit = false; H.prompt(''); return true; } keyWanted = 'KeyN'; return false; };
      H.setHour(Math.max(env.hour, 21.62)); H.bars(true);
      C.weather.setRain(0.85); H.sfx('crabClick');
      H.cut(V(plat[0], P2.yAt(64) + 1.0, plat[1]), V(bw[0], 3, bw[1]), { fov: 42 });
      H.sub('雨下大了。她抱着头跑回来，把一只小寄居蟹放在他手心。它缩在壳里，吐着泡泡。', 'The rain comes down hard. She runs back with a little hermit crab and puts it in his palm. It hides in its shell, blowing bubbles.', 7); yield 7;
      C.scene.remove(hl);
      H.note('我们回东京啦。', 'We\'re going back to Tokyo.', 5); yield 5.5;
      H.sub('你家里人不会喜欢我的。', '"Your family won\'t like me."', 5); yield 5.5;
      H.sub('她抱着毛茸茸的熊，低下头。长长的头发像一件黑色的披风，把她和熊都罩在里面。', 'She hugs the fluffy bear and lowers her head. Her long hair falls around her like a black cloak.', 6); yield 6.5;
      H.sub('さよなら。', '"Sayonara." (the goodbye for a long parting)', 6, '再见。（很久不会再见面的那种）'); yield 5.5;
    },
    function* lastTrain() {
      const fr = C.station.frame, P1 = C.station.plat1;
      env.hour = 21.74; H.music('farewell', { fade: 2 }); H.sfx('steamWhistle');
      rw.clear(); rw.mode = 'manual';
      const tr = rw.spawn('d51', 1, rw.stopS - 420, 11, { dwell: 9999, vmax: 11 });
      if (tr.model.steam) tr.model.steam(true);
      const eyeP = fr.W(P1.n1 - 0.8, 66), lookN = fr.W(fr.n0 + fr.half, 0);
      H.cut(V(eyeP[0], P1.yAt(66) + 1.5, eyeP[1]), V(lookN[0], P1.yAt(30) + 1, lookN[1]), { fov: 48 });
      H.sub('末班车，开往松山市。老式的D51蒸汽机车，拖着崭新的车厢。', 'The last train to Matsuyama. An old D51 steam engine pulling bright new coaches.', 6);
      yield 6;
      H.sub('まもなく、1番線に、松山市行きが参ります。', 'The train for Matsuyama-shi is now arriving at platform 1.', 6, '列车即将进入1号站台，开往松山市。');
      yield () => tr.dwell > 0;
      H.sfx('doorChime');
      H.sub('白色的蒸汽像云一样漫过站台。车厢里空无一人，灯火通明。', 'White steam drifts over the platform like a cloud. The coaches are empty and brightly lit.', 6); yield 6;
      // her window: the coach nearest the camera
      const car = tr.model.cars[Math.min(2, tr.model.cars.length - 1)], cp = car.position;
      H.shot(V(eyeP[0], P1.yAt(66) + 1.55, eyeP[1]).lerp(cp, 0.55), cp.clone().add(V(0, 1.6, 0)), { fov: 38, ease: 1 });
      H.sub('ドアが閉まります。ご注意ください。', 'The doors are closing. Please stand clear.', 4, '车门即将关闭，请注意。');
      H.sfx('doorClose'); yield 4;
      H.note('Sakura到底是谁？<br>我以后去哪里找你？', 'Who is Sakura, really? Where do I find you after this?', 0); H.capture('The window · 21:45'); yield 7;
      H.sub('名字不重要！我只是个路过此地心怀正义的牛郎！', '"Names don\'t matter! I\'m just a passing host with a heart full of justice!"', 7); yield 6;
      H.noteOff();
      tr.dwell = 0.01; C.weather.setFog(1); H.sfx('steamWhistle');
      const far = fr.W(fr.n0 + fr.half, 220);
      H.shot(V(eyeP[0], P1.yAt(66) + 1.6, eyeP[1]), V(far[0], 3, far[1]), { fov: 50, ease: 0.5 });
      H.sub('灯火通明的列车鸣着汽笛，驶进夜色和海雾。她一直站在窗口，抱着熊，挥着熊掌。', 'The brightly lit train goes off into the night and the sea fog, hooting. She stays at the window, hugging the bear, waving its paw.', 9);
      yield 12;
      H.sub('站台空了。雨停了。', 'The platform is empty. The rain has stopped.', 5); C.weather.setRain(0); yield 6;
    },
    function* phone() {
      const ph = C.station.phone, p = new T.Vector3(); ph.group.getWorldPosition(p);
      const fr = C.station.frame;
      H.cut(V(p.x + Math.cos(fr.rot) * -1.8 + Math.sin(fr.rot) * 1.2, p.y + 1.5, p.z - Math.sin(fr.rot) * -1.8 + Math.cos(fr.rot) * 1.2), V(p.x, p.y + 1.2, p.z), { fov: 42 });
      H.sfx('phonePickup'); yield 2;
      H.sub('他用站台上的公用电话打给她哥哥：“她在回东京的火车上。九点四十五，末班车。”', 'He calls her brother from the platform phone: "She\'s on the train back to Tokyo. The 9:45, the last one."', 7); yield 7;
      H.sub('他没等对方回答就挂了电话，拍拍裤子上的灰，朝空地走去。', 'He hangs up before anyone can answer, dusts off his jeans, and walks back toward the empty lot.', 6); yield 6.5;
      H.sub('他本就没给自己买回东京的车票。', 'He had never bought himself a ticket back to Tokyo.', 8); yield 9;
      H.fade(1, 4); yield 4.5; H.subOff();
    },
    function* epilogue() {
      H.music('epilogue', { fade: 3 });
      const box = $('cards'); box.innerHTML = ''; box.classList.add('show'); H.fade(0, 0.5);
      for (let i = 0; i < postcards.length; i++) {
        const c = document.createElement('div'); c.className = 'card';
        c.innerHTML = `<img src="${postcards[i].url}"><div class="cap">${postcards[i].label}</div>`;
        c.style.transform = `rotate(${(i % 2 ? 1 : -1) * (1 + i % 3)}deg) scale(0.96)`; box.appendChild(c);
        requestAnimationFrame(() => { c.style.opacity = 1; c.style.transform = `rotate(${(i % 2 ? 1 : -1) * (1 + i % 3)}deg) scale(1)`; });
        yield 5.5; c.style.opacity = 0; yield 1;
      }
      const end = document.createElement('div'); end.className = 'end';
      end.innerHTML = '世界很温柔。<br><span style="font-size:14px;letter-spacing:.2em">a fan tribute · story by Jiang Nan, <i>Dragon Raja</i> III · original music<br>map data © OpenStreetMap contributors · elevation © 国土地理院 GSI</span><br><span style="font-size:13px;opacity:.7">click to wander the town</span>';
      box.appendChild(end); requestAnimationFrame(() => { end.style.opacity = 1; });
      yield H.key('', 'Space');
    },
  ];

  function nextBeat() {
    if (beatI >= BEATS.length) { C.Story.finish(); return; }
    tweens.length = 0; keyWanted = null; keyHit = false;
    it = BEATS[beatI++](H); waitT = 0; waitFn = null;
  }

  C.Story = {
    H, BEATS,
    start(i = 0) {
      A = C.ANCHORS; env = C.env; player = C.player; rw = C.railway;
      rw.mode = 'manual'; rw.clear();
      beatI = i; nextBeat();
      $('cards').onclick = () => { keyHit = true; };
    },
    update(dt) {
      env.dt = dt;
      for (const k in timers) { const tm = timers[k]; if ((tm.t -= dt) <= 0) { delete timers[k]; tm.fn(); } }
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i]; tw.t += dt; const f = C.clamp(tw.t / tw.sec, 0, 1);
        tw.fn(tw.ease ? C.smooth(0, 1, f) : f); if (f >= 1) tweens.splice(i, 1);
      }
      if (!it) return;
      if (waitT > 0) { waitT -= dt; if (waitT > 0) return; }
      if (waitFn) { if (!waitFn()) return; waitFn = null; }
      for (let guard = 0; guard < 50; guard++) {
        const r = it.next();
        if (r.done) { nextBeat(); return; }
        if (typeof r.value === 'number') { waitT = r.value; return; }
        if (typeof r.value === 'function') { waitFn = r.value; return; }
      }
    },
    // true once a fade to full black has finished: nothing of the 3D view can be seen
    blackout() { const b = H._black; return !!(b && b.v >= 1 && performance.now() >= b.until) || $('cards').classList.contains('show'); },
    key(code) { if (code === keyWanted || (keyWanted === 'Space' && code === 'Enter')) keyHit = true; if (code === 'Escape') this.finish(); },
    postcard(label, url) { postcards.push({ label, url }); },
    finish() {
      it = null; tweens.length = 0; for (const k in timers) delete timers[k]; H.bars(false); H.fade(0, 1); H.subOff(); H.noteOff(); H.prompt('');
      $('cards').classList.remove('show'); C.weather.setFog(0); C.weather.setRain(0); C.sea.tide = 0; C.sky.sunScale = 1;
      env.mode = 'wander'; player.cine = null; rw.mode = 'timetable'; document.body.classList.remove('story'); document.body.classList.add('wander');
      document.getElementById('hud').classList.remove('hidden');
      if (C.audio) C.audio.music('town', { fade: 4, vol: 0.5 });
    },
  };
})(window.CITY);
