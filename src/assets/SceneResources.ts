import * as THREE from 'three/webgpu';

/** Procedural builders own resources even when a mesh was merged or removed from the tree. */
export class SceneResources {
  private resources = new Set<{ dispose(): void }>();
  private objects = new Set<THREE.Object3D>();
  readonly three: typeof THREE;
  constructor() {
    const wrapped = new Map<PropertyKey, unknown>();
    this.three = new Proxy({ ...THREE }, {
      get: (target, key: keyof typeof THREE) => {
        const value = target[key];
        if (typeof value !== 'function' || !/^[A-Z]/.test(String(key))) return value;
        if (!wrapped.has(key)) wrapped.set(key, new Proxy(value, {
          construct: (ctor, args) => { const object = Reflect.construct(ctor, args); this.track(object); return object; },
        }));
        return wrapped.get(key);
      },
    }) as typeof THREE;
  }
  track(resource: any) {
    if (resource?.isObject3D && !this.objects.has(resource)) {
      this.objects.add(resource);
      resource.addEventListener('dispose', () => this.objects.delete(resource));
    }
    if (resource && (resource.isMaterial || resource.isTexture || resource.isBufferGeometry) && !this.resources.has(resource)) {
      this.resources.add(resource);
      resource.addEventListener('dispose', () => this.resources.delete(resource));
    }
    return resource;
  }
  capture(root: THREE.Object3D) {
    root.traverse((object: any) => {
      this.track(object);
      // Sprite's quad is shared globally by Three.js, not owned by any content scene.
      if (!object.isSprite) this.track(object.geometry);
      for (const material of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) {
        this.track(material);
        for (const value of Object.values(material)) if ((value as any)?.isTexture) this.track(value);
      }
    });
  }
  get size() { return this.resources.size; }
  dispose() {
    for (const resource of [...this.resources]) resource.dispose(); this.resources.clear();
    // Object3D.dispose releases per-object render/shadow bindings in modern Three.js.
    for (const object of [...this.objects]) object.dispose(); this.objects.clear();
  }
}
