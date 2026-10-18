import type { Camera, Scene, WebGPURenderer } from 'three/webgpu';
import type { AssetManager } from '../assets/AssetManager';
import type { SaveGame } from '../core/SaveStore';

export interface SceneServices {
  renderer: WebGPURenderer;
  assets: AssetManager;
  signal: AbortSignal;
  query: URLSearchParams;
  notify(message: string): void;
}
export interface SceneInstance {
  readonly id: string;
  readonly scene: Scene;
  readonly camera: Camera;
  enter(): void;
  update(dt: number, time: number): void;
  render(time: number): void;
  resize(width: number, height: number): void;
  snapshot(): SaveGame;
  restore(save: SaveGame): void;
  diagnostics(): Record<string, unknown>;
  dispose(): void;
}
export interface SceneManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  seed: number;
  entry: string;
  anchors: string[];
  assets: { id: string; type: string; url: string; skinned?: boolean; animations?: string[] }[];
}
export interface SceneDefinition {
  manifest: SceneManifest;
  load(services: SceneServices): Promise<SceneInstance>;
}
