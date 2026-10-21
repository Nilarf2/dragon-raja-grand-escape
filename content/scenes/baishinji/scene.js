import { Scope } from '../../../src/core/Scope';
import { SceneResources } from '../../../src/assets/SceneResources';
import { SpatialIndex } from '../../../src/world/SpatialIndex';
import { qualityPresentation } from '../../../src/rendering/QualityView.js';
import { disposeSteps } from '../../../src/core/dispose.ts';
import { PostFX } from '../../../src/rendering/PostFX.js';
import { createStory } from '../../../src/narrative/createStory.js';
import { createWorldControls } from '../../../src/ui/WorldControls.js';
import { resetWorldUI } from '../../../src/ui/resetWorldUI';
import { installAudio } from '../../../src/audio/audio.js';
import { installPlayer } from '../../../src/gameplay/player.js';
import { installInteract } from '../../../src/gameplay/interact.js';
import { createEscapeChapter } from '../../chapters/escape/chapter.js';
import { configurePlaces } from './places.js';
import manifest from './manifest.json';
import { installUtil } from './builders/util.js';
import { installTerrain } from './builders/terrain.js';
import { installSky } from './builders/sky.js';
import { installSea } from './builders/sea.js';
import { installWeather } from './builders/weather.js';
import { installModels } from './builders/models.js';
import { installLandmarks } from './builders/landmarks.js';
import { installTrains } from './builders/trains.js';
import { installStation } from './builders/station.js';
import { installTown } from './builders/town.js';
import { installRailway } from './builders/railway.js';

/** The content context is local to this scene instance; never attached to window. */
export async function loadBaishinji(services) {
  const scope = new Scope(), resources = new SceneResources();
  scope.defer(() => resources.dispose());
  const signal = AbortSignal.any([services.signal, scope.signal]);
  const data = {};
  try {
    await Promise.all(manifest.assets.map(async asset => {
      const handle = await services.assets.acquire(asset.type, new URL(import.meta.env.BASE_URL + asset.url, location.href).href, signal);
      scope.defer(handle.release);
      // Terrain edits and decoded building caches belong to this instance, not the shared asset.
      data[asset.id] = structuredClone(handle.value);
    }));
    signal.throwIfAborted();
    return build(services, scope, resources, data);
  } catch (error) { scope.dispose(); throw error; }
}

function build(services, scope, resources, data) {
  const T = resources.three, q = services.query, renderer = services.renderer;
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const mobile = touch && Math.min(screen.width, screen.height) < 900;
  const C = { THREE: T, scope, resources, seed: manifest.seed, TOUCH: touch, MOBILE: mobile, actors: new Map(),
    DATA: { terrainNear: data.terrainNear, terrainFar: data.terrainFar, osm: data.osm, rail: data.rail },
    GEO: { ...data.geo, toLocal(lat, lon) { return [(lon - this.lon0) * this.mLon, -(lat - this.lat0) * this.mLat]; },
      toLatLon(x, z) { return [this.lat0 - z / this.mLat, this.lon0 + x / this.mLon]; } },
    ANCHORS: data.anchors, MODELS: { town: data.buildings } };
  C.nextFrame = callback => { const id = requestAnimationFrame(() => { cancel(); if (!scope.disposed) callback(); }); const cancel = scope.defer(() => cancelAnimationFrame(id)); };
  installUtil(C);
  const collisionIndex = new SpatialIndex(32), deckIndex = new SpatialIndex(32);
  scope.defer(() => { collisionIndex.clear(); deckIndex.clear(); });
  const addCollider = C.addCollider, addDeck = C.addDeck;
  C.addCollider = (...args) => { const count = addCollider(...args); collisionIndex.add(C.colliders[count - 1]); return count; };
  C.addDeck = (...args) => { const deck = addDeck(...args); deckIndex.add(deck); return deck; };
  C.collides = (x, z, radius = 0.25) => {
    for (const k of collisionIndex.query(x, z, radius * Math.SQRT2)) {
      const [u, v] = C.toLocal2(x, z, k.x, k.z, k.c, k.s);
      if (Math.abs(u) < k.hw + radius && Math.abs(v) < k.hd + radius) return true;
    }
    return false;
  };
  C.deckHeight = (x, z) => {
    let height = -Infinity;
    for (const d of deckIndex.query(x, z)) { const [u, v] = C.toLocal2(x, z, d.x, d.z, d.c, d.s); if (Math.abs(u) <= d.hw && Math.abs(v) <= d.hd) height = Math.max(height, C.lerp(d.y0, d.y1, (v + d.hd) / (2 * d.hd))); }
    return height;
  };
  // Factory installation is explicit and fresh on each load. Shared runtime does not know this content order.
  for (const install of [installTerrain, installSky, installSea, installWeather, installModels, installLandmarks, installTrains, installStation, installTown, installRailway, installAudio, installPlayer, installInteract]) install(C);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.25, 40000);
  C.buildTerrain(scene);
  const sky = new C.Sky(scene, renderer), sea = new C.Sea(scene), weather = new C.Weather(scene);
  C.buildStation(scene); C.buildTown(scene);
  const railway = C.buildRailway(scene), player = new C.Player(camera, renderer.domElement);
  C.seats = (C.benches || []).map(b => ({ x: b.world[0], z: b.world[1], y: b.y, eye: 1.15, label: 'bench' }));
  if (C.town.rock) { const p = C.town.rock.group.localToWorld(C.town.rock.seat.position.clone()); C.seats.push({ x: p.x, y: C.ANCHORS.cliffRock.y, z: p.z, eye: 0.95, label: 'rock' }); }
  C.mergeStatic(scene, [sky.dome, sea.mesh, C.terrainMesh, C.terrainFar, C.terrainPatch]);
  const fx = new PostFX(renderer, scene, camera, { enabled: !q.has('nofx'), tier: q.get('fx') || (q.has('lite') || mobile ? 'low' : 'high') });
  scope.defer(() => fx.dispose());
  Object.assign(C, { scene, camera, renderer, player, sky, sea, weather, railway, fx });
  C.env = { hour: Number.isFinite(+q.get('t')) && q.has('t') ? ((+q.get('t') % 24) + 24) % 24 : 17.5, night: 0, sky, camera, player, speed: 20, rain: 0, mode: 'title', t: 0 };
  configurePlaces(C);
  C.goto(q.get('at') || manifest.entry);
  if (q.has('yaw')) player.faceBearing(+q.get('yaw')); if (q.has('pitch')) player.pitch = +q.get('pitch') * Math.PI / 180;
  if (!q.has('start') && !q.has('story') && !q.has('at')) {
    const A = C.ANCHORS;
    player.cine = { pos: new T.Vector3(A.cliffRock.x - 10, A.cliffRock.y + 26, A.cliffRock.z + 6), look: new T.Vector3(-1500, -40, -700), snap: true, fov: 50 };
  }
  C.Story = createStory(C, createEscapeChapter);
  scope.defer(() => { C.Story.dispose(); for (const actor of C.actors.values()) actor.dispose(); });
  resources.capture(scene);
  scope.defer(() => scene.traverse(object => object.shadow?.dispose()));
  const quality = qualityPresentation(renderer, scene, camera, { context: C, frameBudget: q.has('lite') ? 8192 : 250000, onError: error => services.notify(error.message) });
  let controls, entered = false, restorePending;
  const focus = new T.Vector3(), forward = new T.Vector3(), env = C.env;
  const instance = {
    id: manifest.id, scene, camera, quality,
    enter() {
      resetWorldUI(); document.body.classList.toggle('touch', touch); entered = true; C.active = true;
      controls = createWorldControls(C, restorePending ? new URLSearchParams() : q);
      if (restorePending) { applySave(restorePending); restorePending = undefined; }
      this.resize(innerWidth, innerHeight);
    },
    update(dt) {
      if (quality.frozen) return;
      env.t += dt;
      if (env.mode === 'wander') env.hour = (env.hour + dt * (env.speed ?? 20) / 3600) % 24;
      if (env.mode === 'story') C.Story.update(dt);
      player.update(dt);
      camera.getWorldDirection(forward); focus.copy(camera.position).addScaledVector(forward.setY(0).normalize(), 40);
      sky.update(env.hour, focus, dt, camera); env.night = sky.state.night;
      weather.update(dt, camera, sky, env.t); sea.update(env.t, sky); railway.update(dt, env.hour, env.t);
      for (const fn of C.updaters) fn(dt, env.t, env);
      for (const actor of C.actors.values()) actor.update(dt);
      C.updateHalos(env.night);
      if (env.mode !== 'story') fx.preset(PostFX.autoPreset(env.hour, weather.rain), 4);
      fx.update(dt, C);
      if (C.audio) {
        const nt = railway.nearest(camera.position);
        C.audio.update({ hour: env.hour, night: env.night, dt, time: env.t, player: camera.position, rain: weather.rain,
          nearSea: C.clamp(1 - (C.groundH(player.pos.x - 25, player.pos.z) > 1 ? 0.6 : 0) - Math.max(0, camera.position.y - 20) / 150, 0, 1),
          train: { near: nt.train ? C.clamp(1 - nt.dist / 250, 0, 1) : 0, moving: !!(nt.train && nt.train.v > 0.5), steam: nt.train?.kind === 'd51' },
          crossing: C.station.crossingOn && Math.hypot(camera.position.x - C.station.crossing.x, camera.position.z - C.station.crossing.z) < 300 });
      }
      controls?.tick(dt);
    },
    render() {
      if (!(env.mode === 'story' && C.Story.blackout())) { if (quality.active) quality.render(); else fx.render(env.t); }
      if (C.capture) { try { C.Story.postcard(C.capture, renderer.domElement.toDataURL('image/jpeg', 0.85)); } finally { C.capture = null; } }
    },
    resize(width, height) { camera.aspect = width / height; camera.userData.fovBoost = width / height < 1 ? 1.35 : 1; camera.updateProjectionMatrix(); fx.setSize(width, height); quality.resize(); },
    snapshot() {
      return { schemaVersion: 1, sceneId: manifest.id, mode: env.mode === 'story' ? 'story' : 'wander',
        player: { position: player.pos.toArray(), yaw: player.yaw, pitch: player.pitch },
        environment: { hour: env.hour, rain: weather.rainT, fog: weather.fogT },
        ...(env.mode === 'story' ? { story: { chapterId: 'escape', beatId: C.Story.checkpoint } } : {}) };
    },
    restore(save) {
      if (save.sceneId !== manifest.id) throw new Error('Save belongs to a different scene');
      if (save.mode === 'story' && (save.story?.chapterId !== 'escape' || !C.Story.BEATS.some(b => b.id === save.story.beatId))) throw new Error('Unknown chapter checkpoint');
      if (!entered) restorePending = save; else applySave(save);
    },
    diagnostics() {
      let meshes = 0, skinned = 0; scene.traverse(o => { if (o.isMesh) meshes++; if (o.isSkinnedMesh) skinned++; });
      return { sceneId: manifest.id, meshes, skinned, colliders: C.colliders.length, decks: C.decks.length, uses: C.uses.length, updaters: C.updaters.length,
        resources: resources.size, listenersAndCleanups: scope.size, places: Object.keys(C.PLACES), beats: C.Story.BEATS.map(b => b.id), checkpoint: C.Story.checkpoint,
        mode: env.mode, position: player.pos.toArray(), hour: env.hour, fx: { enabled: fx.enabled, tier: fx.tier } };
    },
    teleport(id) { if (!C.PLACES[id]) throw new Error(`Unknown place: ${id}`); return C.goto(id); },
    story(command, beat) { if (command === 'start') { controls.startStory(); if (beat) C.Story.start(beat); } else if (command === 'stop') C.Story.finish(); else if (command === 'next') C.Story.key('KeyN'); else if (command === 'confirm') C.Story.key('Space'); },
    async dispose() { C.active = false; await disposeSteps([() => quality.dispose(), () => scope.dispose(), () => scene.clear(), () => { for (const a of [C.updaters, C.colliders, C.decks, C.uses, C.nightMats, C.halos, C.seats]) a.length = 0; }], 'Baishinji cleanup failed'); },
  };
  function applySave(save) {
    if (env.mode === 'story') C.Story.finish();
    env.hour = save.environment.hour; env.rain = save.environment.rain; weather.setRain(save.environment.rain); weather.setFog(save.environment.fog);
    player.cine = null; player.sitting = null; player.pos.fromArray(save.player.position); player.yaw = save.player.yaw; player.pitch = save.player.pitch;
    env.mode = save.mode; controls.restoreMode(save.mode);
    // Story saves restart the named beat; arbitrary generator stacks are deliberately not serialized.
    if (save.mode === 'story') C.Story.start(save.story.beatId);
  }
  return instance;
}
