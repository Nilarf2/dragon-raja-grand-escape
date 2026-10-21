import '../../css/style.css';
import './runtime.css';
import { Scope } from '@harbor/engine';
import { createApplication } from '@harbor/engine/application';
import { SaveStore, type SaveGame } from '../core/SaveStore';
import { createAssetManager } from '@harbor/engine/assets';
import { scenes } from '../world/registry';
import type { SceneInstance, SceneServices, SceneManifest } from '../world/types';
import { createRenderer } from '../rendering/createRenderer';
import { disposeSteps } from '../core/dispose';

const query = new URLSearchParams(location.search), scope = new Scope();
const status = document.getElementById('runtime-status')!;
function notify(message: string) { status.textContent = message; status.classList.remove('error'); }
let cleanupBoot: () => void | Promise<void> = () => scope.dispose();
function fail(error: unknown) { console.error(error); status.textContent = error instanceof Error ? error.message : String(error); status.classList.add('error'); }

async function boot() {
  notify('正在准备画面 / Preparing scene…');
  const renderer = await createRenderer(query);
  cleanupBoot = async () => { try { scope.dispose(); } finally { await renderer.dispose(); } };
  const assets = createAssetManager();
  document.getElementById('app')!.append(renderer.domElement);
  const app = createApplication<Omit<SceneServices, 'signal' | 'scope'>, SaveGame, SceneManifest>({
    services: { renderer, assets, query, notify }, scenes, autoStart: false, onError: fail,
    resizeServices: (w, h) => renderer.setSize(w, h),
    disposeServices: () => disposeSteps([() => assets.dispose(), () => renderer.dispose(), () => renderer.domElement.remove()], 'Application service cleanup failed'),
  });
  const current = () => app.current as SceneInstance | undefined;
  let disposal: Promise<void> | undefined;
  const dispose = () => disposal ??= (async () => { try { scope.dispose(); } finally { await app.dispose(); } })();
  cleanupBoot = dispose;
  let saveStorage: Storage | undefined;
  try { saveStorage = window.localStorage; } catch {}
  const saves = new SaveStore(saveStorage);
  const backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  let preferredMode = query.get('view') === 'raster' || backend !== 'webgpu' ? 'raster' : 'quality';
  let modeRequest = 0;
  const picker = document.getElementById('scene-picker') as HTMLSelectElement;
  const modePicker = document.getElementById('render-mode') as HTMLSelectElement;
  if (backend !== 'webgpu') modePicker.querySelector<HTMLOptionElement>('[value="quality"]')!.disabled = true;
  for (const scene of app.manager.list()) { const option = document.createElement('option'); option.value = scene.id; option.textContent = scene.name; picker.add(option); }
  async function setRenderMode(mode: string) {
    preferredMode = mode;
    const selected = current(), ticket = ++modeRequest;
    notify(mode === 'quality' ? '正在准备高画质 / Preparing quality…' : '');
    app.render(); // Paint the existing raster world before asynchronous native preparation starts.
    const ok = await selected?.quality?.setMode(mode);
    if (ticket !== modeRequest || selected !== current()) return false;
    modePicker.value = selected?.quality?.inspect().mode ?? 'raster';
    if (!ok && mode === 'quality') notify(selected?.quality?.inspect().error ?? '当前设备无法启用高画质 / Quality unavailable');
    else notify('');
    app.render(); return !!ok;
  }
  async function loadScene(id: string, save?: SaveGame) {
    notify('正在加载场景 / Loading scene…');
    const changed = await app.switchScene(id, save);
    if (changed) { picker.value = id; modePicker.value = 'raster'; notify((renderer as unknown as { qualityUnavailable?: string }).qualityUnavailable ?? ''); if (preferredMode === 'quality') await setRenderMode('quality'); }
    return changed;
  }
  function save() {
    const snapshot = app.snapshot(); if (!snapshot) return; saves.write(snapshot);
    notify(saves.persistent ? '已保存 / Saved' : '已临时保存（刷新后失效） / Saved for this session');
  }
  async function restore() { const snapshot = saves.read(); if (!snapshot) { notify('还没有存档 / No save yet'); return false; } return loadScene(snapshot.sceneId, snapshot); }
  scope.listen(picker, 'change', () => { loadScene(picker.value).catch(fail); });
  scope.listen(modePicker, 'change', () => { setRenderMode(modePicker.value).catch(fail); });
  scope.listen(document.getElementById('save-game')!, 'click', () => { try { save(); } catch (e) { fail(e); } });
  scope.listen(document.getElementById('load-game')!, 'click', () => { restore().catch(fail); });
  scope.listen(document.getElementById('refine-image')!, 'click', () => { try { current()?.quality?.refine(Number((document.getElementById('refine-samples') as HTMLSelectElement).value)); } catch (e) { fail(e); } });
  scope.listen(document.getElementById('resume-world')!, 'click', () => { current()?.quality?.cancel(); });
  scope.listen(document, 'keydown', event => {
    const key = (event as KeyboardEvent).code;
    if (/^(Key[WASEDRFTN]|Arrow(Up|Down|Left|Right)|Digit[1-4]|Space|Enter|Escape)$/.test(key)) current()?.quality?.cancel();
  }, { capture: true });
  scope.listen(document, 'pointerdown', event => {
    const target = event.target as Element;
    if (target === renderer.domElement || target.closest('[data-clip], #btn-story, #btn-wander, #goto button, #sub, #note, #prompt, [data-k="act"], [data-k="skip"], [data-k="time"], [data-k="rain"], [data-k="fog"], #joy')) current()?.quality?.cancel();
  }, { capture: true, passive: true });
  scope.listen(renderer.domElement, 'wheel', () => current()?.quality?.cancel(), { capture: true, passive: true });
  let frames = 0, sampleTime = performance.now(), lastFPS = 0;
  app.loop.add(() => {
    frames++;
    const now = performance.now();
    if (now - sampleTime >= 1500) {
      lastFPS = frames * 1000 / (now - sampleTime); frames = 0; sampleTime = now;
      const quality = current()?.quality?.inspect();
      if (quality?.refinement && quality.refinement.state !== 'idle') {
        const stage = quality.refinement;
        notify(stage.error ?? `${stage.state} · ${stage.samples?.min?.toFixed(0) ?? 0}/${stage.targetSamples} spp`);
      }
      if (query.has('stats')) document.getElementById('runtime-stats')!.textContent = `${backend} · ${lastFPS.toFixed(0)} fps · ${renderer.info.render.drawCalls} calls`;
    }
  });
  await loadScene(query.get('scene') || 'baishinji');
  if (!query.has('still')) app.start();
  const api = Object.freeze({
    get ready() { return !!app.current; },
    inspect: () => ({ engine: 'Harbor 0.2.0', backend, scene: current()?.diagnostics(), quality: current()?.quality?.inspect(), assets: assets.size, fps: lastFPS, memory: { ...renderer.info.memory } }),
    scenes: () => app.manager.list().map(s => s.id), switchScene: loadScene,
    step: (dt = 1 / 30, render = true) => { if (!Number.isFinite(dt) || dt < 0 || dt > 10) throw new Error('Invalid step'); app.step(dt, render); },
    snapshot: app.snapshot, save, restore,
    teleport: (id: string) => { current()?.quality?.cancel(); return current()?.teleport?.(id); },
    story: (command: string, beat?: string) => { current()?.quality?.cancel(); return current()?.story?.(command, beat); },
    setRenderMode, probeQuality: (verify?: (proxy: unknown, prepared: unknown) => unknown) => current()?.quality?.probe(verify), refine: (samples = 64) => current()?.quality?.refine(samples), cancelRefine: () => current()?.quality?.cancel(),
    readQualityHDR: (kind: 'raw' | 'filtered' = 'raw') => current()?.quality?.readHDR(kind),
    pause: (value = true) => { if (value) app.pause(); else app.start(); }, dispose,
  });
  Object.defineProperty(window, '__DRAGON_RAJA__', { configurable: true, value: api });
  scope.defer(() => { delete (window as unknown as Record<string, unknown>).__DRAGON_RAJA__; });
  scope.listen(window, 'pagehide', () => { void dispose().catch(fail); });
  if (import.meta.hot) import.meta.hot.dispose(() => { void dispose().catch(fail); });
}
boot().catch(async error => { try { await cleanupBoot(); } catch (cleanupError) { console.error(cleanupError); } finally { fail(error); } });
