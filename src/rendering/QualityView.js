import { RenderPipeline, Vector2, RenderTarget, MeshBasicNodeMaterial, QuadMesh, FloatType, NoToneMapping, LinearSRGBColorSpace } from 'three/webgpu';
import { pass, vec3, vec4, texture, uniform, mix, dot, smoothstep, uv } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { createPathTracingView, createPathTracingOutputNode, StaticRefinementController, createOIDNStaticDenoiser, OIDN_LARGE_WEIGHTS, PreparedQualityScene } from '@harbor/engine/pathtracing';
import { createQualityProxy } from './qualityProxy.js';
import { heightFog, sunShafts } from './effects.js';
import { disposeSteps } from '../core/dispose.ts';

/** App-owned native quality view. All layers remain linear until RenderPipeline's final transform. */
export async function createDragonQualityView(renderer, source, camera, options = {}) {
  const proxy = createQualityProxy(source, camera, options);
  let view, refinement, pipeline, maskPass, colorPass, glow, disposed = false;
  const captures = new Set();
  const size = renderer.getDrawingBufferSize(new Vector2());
  try {
    view = await createPathTracingView({ renderer, scene: proxy.scene, camera, width: size.x, height: size.y,
      maxBounces: options.maxBounces ?? 15, frameBudget: options.frameBudget ?? 250000, maxSamples: 0, onError: options.onError });
    const weightsUrl = new URL(import.meta.env.BASE_URL + 'oidn/' + OIDN_LARGE_WEIGHTS.file, location.href).href;
    const denoiser = createOIDNStaticDenoiser({ renderer, scene: view.preparedScene, camera, weightsUrl, onError: options.onError });
    refinement = new StaticRefinementController(view, denoiser);
    pipeline = new RenderPipeline(renderer);
    const hdr = createPathTracingOutputNode(view.outputTexture);
    // Source beauty is un-tonemapped here; classification reveals only explicit atmospheric/foam layers.
    colorPass = pass(source, camera, { samples: 0 });
    maskPass = pass(proxy.maskScene, camera, { samples: 0 });
    const sourceColor = colorPass.getTextureNode('output'), mask = maskPass.getTextureNode('output').r;
    let result = mix(hdr.colorNode.rgb, sourceColor.rgb, mask.clamp());
    const fx = options.context?.fx, u = fx?.uniforms;
    if (u) {
      const depth = colorPass.getTextureNode('depth');
      result = mix(result, u.fogColor, heightFog(depth, camera, u).mul(u.hfog));
      result = result.add(sunShafts(depth, u).mul(u.rays).mul(0.55));
      glow = bloom(vec4(result, 1), fx.params.bloom, 0.5, fx.params.thresh);
      result = result.add(glow.rgb).mul(u.exposure);
      const luminance = dot(result, vec3(0.2126, 0.7152, 0.0722));
      result = mix(vec3(luminance), result, u.sat).mul(vec3(u.warm.mul(0.2).add(1), 1, u.warm.mul(-0.2).add(1)));
      result = result.add(vec3(u.lift.mul(0.6), u.lift.mul(0.45), u.lift).mul(uniform(1).sub(smoothstep(0, 0.5, luminance))));
      result = mix(result, vec3(dot(result, vec3(0.33))).mul(vec3(1.08, 1, 0.86)).add(0.04), u.memory.mul(0.45));
      result = result.mul(uniform(1).sub(smoothstep(0.2, 0.7, uv().sub(0.5).length()).mul(u.vig)));
    }
    pipeline.outputNode = vec4(result, 1); pipeline.needsUpdate = true;
    return {
      proxy, view, refinement,
      stale: proxy.stale,
      get frozen() { return ['sampling', 'denoising', 'complete'].includes(refinement.inspect().state); },
      render() {
        if (disposed) return;
        const change = proxy.sync();
        view.syncScene(change);
        view.render(); refinement.tick(); hdr.textureNode.value = refinement.outputTexture;
        if (glow) { glow.strength.value = fx.params.bloom; glow.threshold.value = fx.params.thresh; }
        const fog = source.fog; source.fog = null;
        try { pipeline.render(); } finally { source.fog = fog; }
      },
      resize() { const s = renderer.getDrawingBufferSize(new Vector2()); refinement.cancel(); view.resize(s.x, s.y); },
      refine(samples = 64) { refinement.start({ samples }); },
      cancel() { refinement.cancel(); },
      inspect() { return { proxy: { ...proxy.diagnostics }, native: view.inspect(), refinement: refinement.inspect() }; },
      readHDR(kind = 'raw') {
        if (disposed) return Promise.reject(new Error('Quality view disposed'));
        if (!['raw', 'filtered'].includes(kind)) return Promise.reject(new Error('HDR capture requires raw or filtered'));
        if (kind === 'filtered' && !refinement.inspect().denoised) return Promise.reject(new Error('No completed filtered HDR image'));
        const operation = (async () => {
          const { width, height } = view.inspect(), target = new RenderTarget(width, height, { type: FloatType });
          const output = createPathTracingOutputNode(kind === 'raw' ? view.outputTexture : refinement.outputTexture);
          const material = new MeshBasicNodeMaterial({ colorNode: output.colorNode.rgb, toneMapped: false }), quad = new QuadMesh(material);
          const previous = { target: renderer.getRenderTarget(), mrt: renderer.getMRT(), tone: renderer.toneMapping, color: renderer.outputColorSpace };
          try {
            try { renderer.setMRT(null); renderer.toneMapping = NoToneMapping; renderer.outputColorSpace = LinearSRGBColorSpace; renderer.setRenderTarget(target); quad.render(renderer); }
            finally { renderer.setRenderTarget(previous.target); renderer.setMRT(previous.mrt); renderer.toneMapping = previous.tone; renderer.outputColorSpace = previous.color; }
            const data = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
            return { width, height, data };
          } finally { target.dispose(); material.dispose(); quad.dispose(); }
        })();
        captures.add(operation); operation.then(() => captures.delete(operation), () => captures.delete(operation)); return operation;
      },
      async dispose() {
        if (disposed) return; disposed = true;
        // Drain native users before releasing borrowed templates/geometry/scene resources.
        await disposeSteps([() => Promise.allSettled([...captures]), () => refinement.dispose(), () => view.dispose(), () => glow?.dispose(), () => colorPass?.dispose(), () => maskPass?.dispose(), () => pipeline?.dispose(), () => proxy.dispose()], 'Quality view cleanup failed');
      },
    };
  } catch (error) {
    try { await disposeSteps([() => refinement?.dispose(), () => view?.dispose(), () => glow?.dispose(), () => colorPass?.dispose(), () => maskPass?.dispose(), () => pipeline?.dispose(), () => proxy.dispose()], 'Quality initialization cleanup failed'); }
    catch (cleanup) { throw new AggregateError([error, cleanup], error.message); }
    throw error;
  }
}

/** Lazy allocation and safe asynchronous transitions keep the established raster view usable. */
export function qualityPresentation(renderer, scene, camera, options = {}, dependencies = {}) {
  const createView = dependencies.createView ?? createDragonQualityView;
  let current, generation = 0, closed = false, failure, desired = 'raster', rebuilding = false, disposal;
  const operations = new Set();
  const track = operation => {
    operations.add(operation);
    operation.then(() => operations.delete(operation), () => operations.delete(operation));
    return operation;
  };
  const report = error => { failure = error.message; options.onError?.(error); };
  function setMode(mode) {
    if (closed) return Promise.reject(new Error('Quality presentation disposed'));
    if (!['raster', 'quality'].includes(mode)) return Promise.reject(new Error('Unknown render mode'));
    desired = mode; const ticket = ++generation;
    return track((async () => {
      if (mode === 'raster') { const old = current; current = undefined; await old?.dispose(); return true; }
      if (current) return true;
      failure = undefined;
      try {
        const next = await createView(renderer, scene, camera, options);
        if (closed || ticket !== generation) { await next.dispose(); return false; }
        current = next; return true;
      } catch (error) { report(error); return false; }
    })());
  }
  function rebuildIfStale() {
    if (!current?.stale() || rebuilding) return false;
    rebuilding = true; const old = current; current = undefined;
    track((async () => { try { await old.dispose(); if (!closed && desired === 'quality') await setMode('quality'); } catch (error) { report(error); } finally { rebuilding = false; } })());
    return true;
  }
  return {
    probe(verify) {
      if (closed) throw new Error('Quality presentation disposed');
      const start = performance.now(), candidate = createQualityProxy(scene, camera, options); let prepared;
      try { prepared = new PreparedQualityScene(candidate.scene); } catch (error) { candidate.dispose(); throw error; }
      try {
        let triangles = 0, meshes = 0; const groups = [];
        candidate.scene.traverse(o => { if (o.isMesh) { meshes++; const count = (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; triangles += count * (o.isInstancedMesh ? o.count : 1);
          groups.push({ name: o.name || o.type, geometry: o.geometry.uuid, groups: o.geometry.groups.length, materials: Array.isArray(o.material) ? o.material.length : 1, triangles: count, instances: o.isInstancedMesh ? o.count : 1 });
        } });
        return { ...candidate.diagnostics, meshes, triangles, prepared: prepared.inspect(), largestGeometryGroups: groups.sort((a,b)=>b.groups-a.groups).slice(0,8), ...(verify ? { verification: verify(candidate.scene, prepared.scene) } : {}), milliseconds: performance.now() - start };
      }
      finally { prepared.dispose(); candidate.dispose(); }
    },
    get active() { return !!current; }, get frozen() { return current?.frozen ?? false; },
    setMode,
    async ready() {
      // Callers first settle their source update. Rebuilds triggered by that update are
      // drained here without drawing an obsolete proxy or advancing simulation time.
      while (!closed) {
        if (operations.size) { await Promise.allSettled([...operations]); continue; }
        if (desired !== 'quality' || !current) return false;
        if (!rebuildIfStale()) return true;
      }
      return false;
    },
    render() {
      if (rebuildIfStale()) return false;
      current?.render(); return !!current;
    },
    resize() { current?.resize(); },
    refine(samples) { if (!current) throw new Error('Select quality rendering first'); current.refine(samples); },
    cancel() { current?.cancel(); },
    readHDR(kind) { if (!current) return Promise.reject(new Error('Quality rendering is not active')); return current.readHDR(kind); },
    inspect() { return { mode: current ? 'quality' : 'raster', preparing: operations.size > 0, error: failure, ...(current?.inspect() ?? {}) }; },
    dispose() {
      if (disposal) return disposal;
      closed = true; generation++; const old = current; current = undefined;
      disposal = (async () => {
        const failures = [];
        try { await old?.dispose(); } catch (error) { failures.push(error); }
        // These are complete transition/retirement operations, including a late candidate's GPU cleanup.
        while (operations.size) for (const result of await Promise.allSettled([...operations])) if (result.status === 'rejected') failures.push(result.reason);
        if (failures.length) throw new AggregateError(failures, 'Quality presentation cleanup failed');
      })();
      return disposal;
    },
  };
}
