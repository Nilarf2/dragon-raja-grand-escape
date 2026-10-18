import type { Object3D, Material, Texture, BufferGeometry, SkinnedMesh } from 'three/webgpu';

/** Use for an owned asset template; cloned instances share its geometry/materials. */
export function disposeObject(root: Object3D) {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
  root.traverse(object => {
    const mesh = object as SkinnedMesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
    object.dispose();
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) { texture.dispose(); const image = texture.source?.data as { close?: () => void } | undefined; if (typeof image?.close === 'function') image.close(); }
}
