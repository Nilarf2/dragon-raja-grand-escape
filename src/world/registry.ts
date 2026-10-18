import type { SceneDefinition, SceneInstance, SceneManifest } from './types';
import baishinji from '../../content/scenes/baishinji/manifest.json';
import studio from '../../content/scenes/studio/manifest.json';

export const scenes: SceneDefinition[] = [
  { manifest: baishinji as SceneManifest, load: async services => {
    const { loadBaishinji } = await import('../../content/scenes/baishinji/scene.js');
    return await loadBaishinji(services) as SceneInstance;
  } },
  { manifest: studio as SceneManifest, load: async services => {
    const { loadStudio } = await import('../../content/scenes/studio/scene');
    return loadStudio(services);
  } },
];
