import '../../css/style.css';
import './runtime.css';
import { Scope } from '../core/Scope';
import { UpdateLoop } from '../core/UpdateLoop';
import { SaveStore } from '../core/SaveStore';
import { createAssetManager } from '../assets/loaders';
import { SceneManager } from '../world/SceneManager';
import { scenes } from '../world/registry';
import { createRenderer } from '../rendering/createRenderer';

const query = new URLSearchParams(location.search);
const scope = new Scope();
const status = document.getElementById('runtime-status')!;
function notify(message: string) { status.textContent = message; status.classList.remove('error'); }
function fail(error: unknown) { console.error(error); status.textContent = error instanceof Error ? error.message : String(error); status.classList.add('error'); }

async function boot() {
  notify('正在准备画面…');
  const renderer = await createRenderer(query); scope.defer(() => renderer.dispose());
  document.getElementById('app')!.append(renderer.domElement);
  scope.defer(() => renderer.domElement.remove());
  const assets = createAssetManager(); scope.defer(() => assets.dispose());
  const manager = new SceneManager({ renderer, assets, query, notify }); scope.defer(() => manager.dispose());
  for (const scene of scenes) manager.register(scene);
  // Third-party platform frames may deny even reading the localStorage property.
  let saveStorage: Storage | undefined;
  try { saveStorage = window.localStorage; } catch {}
  const saves = new SaveStore(saveStorage), loop = new UpdateLoop(); scope.defer(() => loop.dispose());
  let paused = false, frames = 0, sampleTime = performance.now(), lastFPS = 0;
  const maxPixelRatio = renderer.getPixelRatio();
  const backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  const picker = document.getElementById('scene-picker') as HTMLSelectElement;
  for (const scene of manager.list()) { const option = document.createElement('option'); option.value = scene.id; option.textContent = scene.name; picker.add(option); }
  let loading = 0;
  async function loadScene(id: string, save?: ReturnType<SaveStore['read']>) {
    loading++; notify('正在加载场景…');
    try { const changed = await manager.switchTo(id, save); if (changed) { picker.value = id; manager.current!.resize(innerWidth, innerHeight); manager.current!.update(0, loop.time); manager.current!.render(loop.time); notify(''); } return changed; }
    finally { loading--; }
  }
  function save() {
    if (!manager.current) return;
    saves.write(manager.current.snapshot());
    notify(saves.persistent ? '已保存。剧情从当前段落开头继续。' : '已临时保存（刷新后失效）。剧情从当前段落开头继续。');
  }
  async function restore() { const snapshot = saves.read(); if (!snapshot) { notify('还没有存档'); return false; } return loadScene(snapshot.sceneId, snapshot); }
  scope.listen(picker, 'change', () => { loadScene(picker.value).catch(fail); });
  scope.listen(document.getElementById('save-game')!, 'click', () => { try { save(); } catch (e) { fail(e); } });
  scope.listen(document.getElementById('load-game')!, 'click', () => { restore().catch(fail); });
  scope.listen(window, 'resize', () => { renderer.setSize(innerWidth, innerHeight); manager.current?.resize(innerWidth, innerHeight); });
  scope.listen(document, 'visibilitychange', () => { if (document.hidden) loop.stop(); else if (!query.has('still')) loop.start(); });
  loop.add((dt, time) => {
    if (paused || loading) return;
    try {
      manager.current?.update(dt, time); manager.current?.render(time);
      frames++;
      const now = performance.now();
      if (now - sampleTime >= 1500) {
        lastFPS = frames * 1000 / (now - sampleTime); frames = 0; sampleTime = now;
        if (!query.has('lite') && !query.has('still')) {
          const current = renderer.getPixelRatio();
          const next = lastFPS < 45 ? Math.max(Math.min(0.6, maxPixelRatio), current - 0.15) : lastFPS > 58 ? Math.min(maxPixelRatio, current + 0.1) : current;
          if (Math.abs(next - current) > 0.01) { renderer.setPixelRatio(next); renderer.setSize(innerWidth, innerHeight); manager.current?.resize(innerWidth, innerHeight); }
        }
        if (query.has('stats')) document.getElementById('runtime-stats')!.textContent = `${backend} · ${lastFPS.toFixed(0)} fps · ${renderer.info.render.drawCalls} calls`;
      }
    } catch (error) { paused = true; fail(error); }
  });
  await loadScene(query.get('scene') || 'baishinji');
  if (!query.has('still')) loop.start();
  // A small explicit automation surface; no content internals or mutable global service bag.
  const api = Object.freeze({
    get ready() { return !!manager.current; },
    inspect: () => ({ backend, scene: manager.current?.diagnostics(), assets: assets.size, fps: lastFPS, memory: { ...renderer.info.memory } }),
    scenes: () => manager.list().map(s => s.id),
    switchScene: loadScene,
    step: (dt = 1 / 30, render = true) => { if (!Number.isFinite(dt) || dt < 0 || dt > 10) throw new Error('Invalid step'); manager.current?.update(dt, loop.time + dt); if (render) manager.current?.render(loop.time + dt); },
    snapshot: () => manager.current?.snapshot(), save, restore,
    teleport: (id: string) => { const scene = manager.current as unknown as { teleport?: (id: string) => unknown }; return scene.teleport?.(id); },
    story: (command: string, beat?: string) => { const scene = manager.current as unknown as { story?: (command: string, beat?: string) => void }; scene.story?.(command, beat); },
    pause: (value = true) => { paused = value; },
    dispose: () => scope.dispose(),
  });
  Object.defineProperty(window, '__DRAGON_RAJA__', { configurable: true, value: api });
  scope.defer(() => { delete (window as unknown as Record<string, unknown>).__DRAGON_RAJA__; });
  scope.listen(window, 'pagehide', () => scope.dispose());
  if (import.meta.hot) import.meta.hot.dispose(() => scope.dispose());
}
boot().catch(error => { try { scope.dispose(); } finally { fail(error); } });
