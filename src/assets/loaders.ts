import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { AssetManager } from './AssetManager';
import { disposeObject } from './disposeObject';

export function createAssetManager() {
  const assets = new AssetManager();
  assets.register('json', {
    async load(url, signal) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response.json();
    },
    dispose() {},
  });
  assets.register<GLTF>('gltf', {
    async load(url, signal) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      const data = await response.arrayBuffer(); signal.throwIfAborted();
      // A fresh loader isolates dependency paths; GLB is preferred for atomic content packages.
      return new GLTFLoader().parseAsync(data, new URL('.', new URL(url, location.href)).href);
    },
    dispose(gltf) { disposeObject(gltf.scene); },
  });
  return assets;
}
