import { WebGPURenderer, PCFShadowMap, ACESFilmicToneMapping } from 'three/webgpu';
import { createQualityDevice } from '@harbor/engine/pathtracing';

export async function createRenderer(query: URLSearchParams) {
  const lite = query.has('lite');
  let device: GPUDevice | undefined;
  let renderer: WebGPURenderer;
  let qualityUnavailable: string | undefined;
  if (query.get('renderer') !== 'webgl' && navigator.gpu) {
    try {
      device = await createQualityDevice();
      renderer = new WebGPURenderer({ device, antialias: !lite });
      await renderer.init();
    } catch (error) {
      device?.destroy(); device = undefined;
      console.warn('WebGPU unavailable; using WebGL2 raster.', error);
      qualityUnavailable = `WebGPU unavailable: ${error instanceof Error ? error.message : String(error)}`;
      renderer = new WebGPURenderer({ antialias: !lite, forceWebGL: true }); await renderer.init();
    }
  } else { renderer = new WebGPURenderer({ antialias: !lite, forceWebGL: true }); await renderer.init(); }
  const originalDispose = renderer.dispose.bind(renderer);
  renderer.dispose = async () => {
    try { await device?.queue.onSubmittedWorkDone(); } catch {}
    await originalDispose(); device?.destroy(); device = undefined;
  };
  const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  renderer.setPixelRatio(lite ? 0.5 : Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !lite; renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  Object.defineProperty(renderer, 'qualityUnavailable', { value: qualityUnavailable });
  return renderer;
}
