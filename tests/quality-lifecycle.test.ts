import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityPresentation } from '../src/rendering/QualityView.js';
import { disposeSteps } from '../src/core/dispose';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fakeView(dispose = async () => {}) {
  return { frozen: false, stale: () => false, render() {}, resize() {}, refine() { this.frozen = true; }, cancel() { this.frozen = false; }, inspect: () => ({}), dispose };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('quality teardown waits for a late view and its asynchronous GPU disposal', async () => {
  const create = deferred<ReturnType<typeof fakeView>>(), drain = deferred<void>(); let disposed = false, finished = false;
  const presentation = qualityPresentation(null, null, null, {}, { createView: () => create.promise });
  const transition = presentation.setMode('quality'), cleanup = presentation.dispose().then(() => { finished = true; });
  create.resolve(fakeView(async () => { disposed = true; await drain.promise; })); await flush();
  assert.equal(disposed, true); assert.equal(finished, false); drain.resolve();
  assert.equal(await transition, false); await cleanup; assert.equal(finished, true); assert.equal(presentation.active, false);
});

test('quality teardown waits for a retiring stale view and never recreates after close', async () => {
  const drain = deferred<void>(); let creates = 0, retired = false;
  const view = fakeView(async () => { retired = true; await drain.promise; }); view.stale = () => true;
  const presentation = qualityPresentation(null, null, null, {}, { createView: async () => { creates++; return view; } });
  assert.equal(await presentation.setMode('quality'), true); assert.equal(presentation.render(), false); assert.equal(retired, true);
  let finished = false; const cleanup = presentation.dispose().then(() => { finished = true; }); await flush(); assert.equal(finished, false);
  drain.resolve(); await cleanup; assert.equal(creates, 1);
});

test('competing quality requests dispose superseded candidates and raster preserves no native view', async () => {
  const first = deferred<ReturnType<typeof fakeView>>(), second = deferred<ReturnType<typeof fakeView>>(); let creates = 0, disposed = 0;
  const presentation = qualityPresentation(null, null, null, {}, { createView: () => (++creates === 1 ? first.promise : second.promise) });
  const a = presentation.setMode('quality'), b = presentation.setMode('quality');
  second.resolve(fakeView(async () => { disposed++; })); assert.equal(await b, true);
  presentation.refine(64); assert.equal(presentation.frozen, true); presentation.cancel(); assert.equal(presentation.frozen, false);
  first.resolve(fakeView(async () => { disposed++; })); assert.equal(await a, false); assert.equal(disposed, 1);
  assert.equal(await presentation.setMode('raster'), true); assert.equal(disposed, 2); assert.equal(presentation.active, false); await presentation.dispose();
});

test('all cleanup stages run in order when an earlier GPU drain rejects', async () => {
  const order: string[] = [], failure = new Error('device lost');
  await assert.rejects(disposeSteps([
    async () => { order.push('refinement'); throw failure; },
    async () => { order.push('native'); },
    () => { order.push('proxy'); },
    () => { order.push('source'); },
  ]), error => error instanceof AggregateError && error.errors[0] === failure);
  assert.deepEqual(order, ['refinement', 'native', 'proxy', 'source']);
});

test('quality readiness drains a stale source rebuild before refinement is available', async () => {
  const drain = deferred<void>(); let creates = 0, stale = false;
  const original = fakeView(async () => drain.promise); original.stale = () => stale;
  const presentation = qualityPresentation(null, null, null, {}, { createView: async () => ++creates === 1 ? original : fakeView() });
  await presentation.setMode('quality'); stale = true;
  let ready = false; const waiting = presentation.ready().then(value => { ready = value; });
  await flush(); assert.equal(presentation.inspect().preparing, true); assert.equal(ready, false);
  drain.resolve(); await waiting; assert.equal(ready, true); assert.equal(creates, 2);
  assert.equal(presentation.inspect().preparing, false); presentation.refine(64); assert.equal(presentation.frozen, true);
  await presentation.setMode('raster'); assert.equal(await presentation.ready(), false); await presentation.dispose();
});
