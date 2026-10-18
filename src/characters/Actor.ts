import { AnimationMixer, LoopOnce, LoopRepeat, type Object3D, type AnimationClip, type AnimationAction, type SkinnedMesh } from 'three/webgpu';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { AssetHandle } from '../assets/AssetManager';

export class Actor {
  readonly root: Object3D;
  readonly mixer: AnimationMixer;
  private actions = new Map<string, AnimationAction>();
  private current?: AnimationAction;
  private disposed = false;
  constructor(readonly id: string, template: { scene: Object3D; animations: AnimationClip[] }, private release: () => void = () => {}) {
    this.root = clone(template.scene); this.root.name = id;
    this.mixer = new AnimationMixer(this.root);
    for (const clip of template.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }
  static fromHandle(id: string, handle: AssetHandle<GLTF>) { return new Actor(id, handle.value, handle.release); }
  get clips() { return [...this.actions.keys()]; }
  play(name: string, fade = 0.25, once = false) {
    const action = this.actions.get(name);
    if (!action) throw new Error(`Actor ${this.id} has no animation ${name}`);
    if (action === this.current && action.isRunning()) return;
    action.reset().setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    if (this.current && this.current !== action) this.current.fadeOut(fade);
    action.fadeIn(fade).play(); this.current = action;
  }
  onFinished(callback: (name: string) => void) {
    const listener = (event: { action: AnimationAction }) => callback(event.action.getClip().name);
    this.mixer.addEventListener('finished', listener);
    return () => this.mixer.removeEventListener('finished', listener);
  }
  update(dt: number) { this.mixer.update(dt); }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root);
    this.root.traverse(object => { const mesh = object as SkinnedMesh; if (mesh.isSkinnedMesh) mesh.skeleton.dispose(); object.dispose(); });
    this.root.removeFromParent(); this.actions.clear(); this.release();
  }
}
