import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneResources } from '../src/assets/SceneResources';
import { disposeTownLOD } from '../content/scenes/baishinji/builders/models.js';

test('unloaded town LOD meshes leave scene ownership while active geometry and shared material survive', () => {
  const resources = new SceneResources(), T = resources.three;
  const group = new T.Group(), material = new T.MeshStandardMaterial();
  const active = new T.Mesh(new T.BoxGeometry(), material); group.add(active);
  const positions = active.geometry.getAttribute('position').array, ownedObjects = resources.objectCount, ownedResources = resources.size;
  let materialDisposed = false; material.addEventListener('dispose', () => { materialDisposed = true; });
  for (let round = 0; round < 30; round++) {
    const lod = new T.Mesh(new T.BoxGeometry(2, 2, 2), material); group.add(lod);
    disposeTownLOD(group, lod);
    assert.equal(resources.objectCount, ownedObjects, 'removed LOD mesh retained by scene ownership');
    assert.equal(resources.size, ownedResources); assert.deepEqual(group.children, [active]);
    assert.equal(active.geometry.getAttribute('position').array, positions); assert.equal(materialDisposed, false);
  }
  resources.dispose(); assert.equal(resources.objectCount, 0); assert.equal(resources.size, 0);
});
