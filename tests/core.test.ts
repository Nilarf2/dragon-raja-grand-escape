import test from 'node:test';
import assert from 'node:assert/strict';
import { Scope } from '../src/core/Scope';
import { AssetManager } from '../src/assets/AssetManager';
import { SceneManager } from '../src/world/SceneManager';
import { SpatialIndex } from '../src/world/SpatialIndex';
import { StoryRunner } from '../src/narrative/StoryRunner';
import { SaveStore, validateSave, type SaveGame } from '../src/core/SaveStore';
import { randomStream } from '../src/core/random';
import type { SceneInstance, SceneServices } from '../src/world/types';

const deferred = <T>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('scope releases all resources even when one disposer throws, and removes input listeners', () => {
  const scope = new Scope(), events = new EventTarget(), order: number[] = [];
  let presses = 0;
  scope.listen(events, 'key', () => presses++);
  scope.defer(() => order.push(1)); scope.defer(() => { order.push(2); throw new Error('cleanup'); }); scope.defer(() => order.push(3));
  events.dispatchEvent(new Event('key'));
  assert.throws(() => scope.dispose(), AggregateError);
  scope.dispose(); events.dispatchEvent(new Event('key'));
  assert.equal(presses, 1); assert.deepEqual(order, [3, 2, 1]); assert.equal(scope.size, 0); assert.equal(scope.signal.aborted, true);
  scope.defer(() => order.push(4)); assert.deepEqual(order, [3, 2, 1, 4]);
});

test('asset requests deduplicate; aborting one consumer does not cancel another', async () => {
  const assets = new AssetManager(), done = deferred<{ id: string }>(); let loads = 0, disposals = 0; let sourceSignal!: AbortSignal;
  assets.register('model', { load: async (_, signal) => { loads++; sourceSignal = signal; return done.promise; }, dispose: () => disposals++ });
  const cancel = new AbortController();
  const first = assets.acquire('model', 'a', cancel.signal); const second = assets.acquire<{ id: string }>('model', 'a');
  const rejected = assert.rejects(first, { name: 'AbortError' }); cancel.abort(); await rejected;
  done.resolve({ id: 'shared' }); const handle = await second;
  assert.equal(loads, 1); assert.equal(sourceSignal.aborted, false); assert.equal(handle.value.id, 'shared'); assert.equal(disposals, 0);
  handle.release(); handle.release(); assert.equal(disposals, 1); assert.equal(assets.size, 0); assert.equal(sourceSignal.aborted, true);
});

test('asset arriving after cancellation is disposed, and failed requests can retry', async () => {
  const assets = new AssetManager(), done = deferred<object>(); let disposed = 0, calls = 0;
  assets.register('model', { load: async () => { calls++; return done.promise; }, dispose: () => disposed++ });
  const cancel = new AbortController(), request = assets.acquire('model', 'late', cancel.signal);
  await Promise.resolve(); const reject = assert.rejects(request, { name: 'AbortError' }); cancel.abort(); await reject;
  done.resolve({}); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(disposed, 1); assert.equal(assets.size, 0);
  assets.register('fail', { load: async () => { throw new Error('missing'); }, dispose() {} });
  await assert.rejects(assets.acquire('fail', 'x')); await assert.rejects(assets.acquire('fail', 'x')); assert.equal(assets.size, 0);
  const live = await assets.acquire('model', 'other'); assets.dispose(); live.release(); assert.equal(disposed, 2); assert.equal(calls, 2);
});

test('manager shutdown never hands a disposed late asset to an awaiting consumer', async () => {
  const assets = new AssetManager(), done = deferred<object>(); let disposed = 0;
  assets.register('model', { load: () => done.promise, dispose: () => disposed++ });
  const pending = assets.acquire('model', 'late'); await Promise.resolve();
  assets.dispose(); done.resolve({});
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(disposed, 1);
});

function instance(id: string, counts: Record<string, number>): SceneInstance {
  return { id, scene: {} as any, camera: {} as any, enter() { counts[`${id}.enter`] = (counts[`${id}.enter`] || 0) + 1; }, update() {}, render() {}, resize() {}, snapshot: () => ({}) as SaveGame, restore() {}, diagnostics: () => ({}), dispose() { counts[id] = (counts[id] || 0) + 1; } };
}
test('scene transitions preserve old scene on failure and dispose late cancelled scenes exactly once', async () => {
  const counts: Record<string, number> = {}, manager = new SceneManager({} as Omit<SceneServices, 'signal'>);
  const slow = deferred<SceneInstance>();
  for (const [id, load] of Object.entries({ a: async () => instance('a', counts), slow: () => slow.promise, b: async () => instance('b', counts), broken: async () => { throw new Error('load failed'); } })) {
    manager.register({ manifest: { schemaVersion: 1, id, name: id, seed: 1, entry: 'start', anchors: ['start'], assets: [] }, load });
  }
  await manager.switchTo('a'); await assert.rejects(manager.switchTo('broken')); assert.equal(manager.current?.id, 'a'); assert.equal(counts.a, undefined);
  const pending = manager.switchTo('slow'); await manager.switchTo('b'); slow.resolve(instance('slow', counts));
  assert.equal(await pending, false); assert.equal(manager.current?.id, 'b'); assert.equal(counts.slow, 1); assert.equal(counts['slow.enter'], undefined); assert.equal(counts.a, 1);
  manager.dispose(); manager.dispose(); assert.equal(counts.b, 1);
});

test('spatial candidates include all exact rotated collisions across negative coordinates and cell edges', () => {
  const index = new SpatialIndex(16), random = randomStream(40);
  const rectangles = Array.from({ length: 160 }, () => { const angle = random() * Math.PI; return { x: random() * 200 - 100, z: random() * 200 - 100, hw: random() * 15, hd: random() * 15, c: Math.cos(angle), s: Math.sin(angle) }; });
  rectangles.forEach(r => index.add(r));
  for (let i = 0; i < 400; i++) {
    const x = random() * 200 - 100, z = random() * 200 - 100, r = 0.28;
    const candidates = index.query(x, z, r * Math.SQRT2);
    for (const box of rectangles) { const dx = x - box.x, dz = z - box.z, u = dx * box.c - dz * box.s, v = dx * box.s + dz * box.c; if (Math.abs(u) < box.hw + r && Math.abs(v) < box.hd + r) assert.ok(candidates.has(box)); }
  }
  rectangles.forEach(r => index.remove(r)); assert.equal(index.size, 0); assert.equal(index.query(0, 0, 100).size, 0);
});

test('story skip closes generator cleanup, saves stable beat ID, and stops without replay', () => {
  const trace: string[] = []; let ready = false;
  const story = new StoryRunner([
    { id: 'first', *run() { try { trace.push('first'); yield 10; trace.push('should skip'); } finally { trace.push('clean'); } } },
    { id: 'second', *run() { yield () => ready; trace.push('passed'); } },
  ], () => trace.push('changed'), () => trace.push('done'));
  story.start(); story.update(0.1); story.next(); assert.equal(story.checkpoint, 'second'); assert.ok(trace.includes('clean')); story.update(0.1); story.update(1); assert.ok(!trace.includes('passed'));
  ready = true; story.update(0.1); assert.ok(trace.includes('passed')); assert.ok(trace.includes('done')); assert.equal(story.active, false);
  const count = trace.length; story.next(); assert.equal(trace.length, count); assert.throws(() => story.start('missing'));
});

test('save format rejects corrupt state and round-trips checkpoint without mutable aliases', () => {
  const data = new Map<string, string>(), store = new SaveStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } });
  const save: SaveGame = { schemaVersion: 1, sceneId: 'baishinji', mode: 'story', player: { position: [1, 2, 3], yaw: 0, pitch: 0 }, environment: { hour: 18, rain: 0.3, fog: 0 }, story: { chapterId: 'escape', beatId: 'reveal' } };
  store.write(save); assert.deepEqual(store.read(), save);
  const copy = validateSave(save); copy.player.position[0] = 99; assert.equal(save.player.position[0], 1);
  assert.throws(() => validateSave({ ...save, schemaVersion: 99 }));
  assert.throws(() => validateSave({ ...save, player: { ...save.player, yaw: NaN } }));
  assert.throws(() => validateSave({ ...save, environment: { ...save.environment, rain: 2 } }));
  assert.throws(() => validateSave({ ...save, story: undefined }));
});

test('save remains available for the current page without browser storage', () => {
  const store = new SaveStore();
  const save: SaveGame = { schemaVersion: 1, sceneId: 'baishinji', mode: 'wander', player: { position: [1, 2, 3], yaw: 0, pitch: 0 }, environment: { hour: 18, rain: 0, fog: 0 } };
  assert.equal(store.persistent, false); assert.equal(store.read(), undefined);
  store.write(save); assert.deepEqual(store.read(), save);
  assert.equal(new SaveStore().read(), undefined);
});

test('denied reads and quota failures fall back to temporary saves while corrupt data is rejected', () => {
  const save: SaveGame = { schemaVersion: 1, sceneId: 'baishinji', mode: 'wander', player: { position: [1, 2, 3], yaw: 0, pitch: 0 }, environment: { hour: 18, rain: 0, fog: 0 } };
  const denied = new SaveStore({ getItem() { throw new DOMException('Blocked', 'SecurityError'); }, setItem() { assert.fail('Denied storage must not be reused'); } });
  assert.equal(denied.read(), undefined); assert.equal(denied.persistent, false);
  denied.write(save); assert.deepEqual(denied.read(), save);
  const full = new SaveStore({ getItem() { return null; }, setItem() { throw new DOMException('Full', 'QuotaExceededError'); } });
  assert.equal(full.persistent, true); full.write(save); assert.equal(full.persistent, false); assert.deepEqual(full.read(), save);
  const corrupt = new SaveStore({ getItem() { return '{invalid'; }, setItem() {} });
  assert.throws(() => corrupt.read(), SyntaxError); assert.equal(corrupt.persistent, true);
});
