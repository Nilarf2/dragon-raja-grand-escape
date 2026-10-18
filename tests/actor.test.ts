import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Bone, Skeleton, SkinnedMesh, BufferGeometry, MeshBasicMaterial, AnimationClip, NumberKeyframeTrack } from 'three/webgpu';
import { Actor } from '../src/characters/Actor';

test('actors have independent skeletons, replay completed actions, and keep shared model resources alive', () => {
  const scene = new Group(), hip = new Bone(); hip.name = 'hip';
  const geometry = new BufferGeometry(), material = new MeshBasicMaterial();
  const mesh = new SkinnedMesh(geometry, material); mesh.add(hip); mesh.bind(new Skeleton([hip])); scene.add(mesh);
  const template = { scene, animations: [new AnimationClip('wave', 1, [new NumberKeyframeTrack('hip.rotation[z]', [0, 1], [0, 1])])] };
  let released = 0, geometryDisposed = 0, finished = 0;
  geometry.addEventListener('dispose', () => geometryDisposed++);
  const a = new Actor('a', template, () => released++), b = new Actor('b', template, () => released++);
  const aHip = a.root.getObjectByName('hip')!, bHip = b.root.getObjectByName('hip')!;
  assert.notEqual(aHip, bHip); assert.notEqual(aHip, hip);
  const off = a.onFinished(() => finished++);
  a.play('wave', 0.1, true); a.update(1.1);
  assert.equal(finished, 1); assert.ok(aHip.rotation.z > 0.99); assert.ok(Math.abs(bHip.rotation.z) < 1e-8);
  a.play('wave', 0.1, true); a.update(0.5);
  assert.ok(Math.abs(aHip.rotation.z - 0.5) < 0.01, 'replaying a completed clip must not fade itself out');
  off(); a.update(0.6); assert.equal(finished, 1);
  a.dispose(); a.dispose(); assert.equal(released, 1); assert.equal(geometryDisposed, 0);
  b.play('wave', 0, true); b.update(0.5); assert.ok(bHip.rotation.z > 0.49);
  b.dispose(); assert.equal(released, 2); assert.equal(geometryDisposed, 0);
  mesh.skeleton.dispose(); geometry.dispose(); material.dispose();
});
