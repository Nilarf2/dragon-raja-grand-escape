import { WebGPURenderer, PCFShadowMap, ACESFilmicToneMapping } from 'three/webgpu';

export async function createRenderer(query: URLSearchParams) {
  const lite = query.has('lite');
  const renderer = new WebGPURenderer({ antialias: !lite, forceWebGL: query.get('renderer') === 'webgl' });
  try { await renderer.init(); } catch (error) { renderer.dispose(); throw error; }
  const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  renderer.setPixelRatio(lite ? 0.5 : Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  return renderer;
}
