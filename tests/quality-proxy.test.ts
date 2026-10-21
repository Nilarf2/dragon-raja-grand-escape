import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Mesh, BufferGeometry, Float32BufferAttribute, MeshToonMaterial, PerspectiveCamera, BoxGeometry } from 'three/webgpu';
import { geometryView, buildingQualityIndex, terrainQualityColor, createQualityProxy } from '../src/rendering/qualityProxy.js';
import { qualityMaterialMetadata } from '../src/rendering/materials.js';
import { PreparedQualityScene } from '@harbor/engine/pathtracing';

test('quality geometry views borrow all source channels without changing groups or draw range', () => {
  const source = new BufferGeometry(); source.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  source.setAttribute('custom', new Float32BufferAttribute([4, 5, 6], 1)); source.setIndex([2, 1, 0]); source.addGroup(0, 3, 2); source.setDrawRange(0, 3);
  const copy = geometryView(source); assert.notEqual(copy, source); assert.equal(copy.getAttribute('custom'), source.getAttribute('custom')); assert.deepEqual(copy.groups, source.groups); assert.deepEqual(copy.drawRange, source.drawRange);
  copy.setIndex([0, 1, 2]); assert.deepEqual([...source.index!.array], [2, 1, 0]); copy.dispose(); source.dispose();
});

test('building quality selects complementary LOD triangles as the camera crosses each house centre', () => {
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(18), 3));
  geometry.setAttribute('hc', new Float32BufferAttribute([0, 0, 0, 0, 0, 0, 100, 0, 100, 0, 100, 0], 2)); geometry.setIndex([0, 1, 2, 3, 4, 5]);
  const state = { uCam: { value: { x: 0, z: 0 } }, uR0: { value: 40 } };
  assert.deepEqual([...buildingQualityIndex(geometry, state, 1)], [0, 1, 2]); assert.deepEqual([...buildingQualityIndex(geometry, state, -1)], [3, 4, 5]);
  state.uCam.value.x = 100;
  assert.deepEqual([...buildingQualityIndex(geometry, state, 1)], [3, 4, 5]); assert.deepEqual([...geometry.index!.array], [0, 1, 2, 3, 4, 5]); geometry.dispose();
});

test('quality proxy disposal preserves source geometry/materials for raster rendering', () => {
  const scene = new Scene(), geometry = new BoxGeometry(), material = new MeshToonMaterial(); const mesh = new Mesh(geometry, material); scene.add(mesh);
  let sourceDisposals = 0; geometry.addEventListener('dispose', () => sourceDisposals++); material.addEventListener('dispose', () => sourceDisposals++);
  const positions = geometry.getAttribute('position').array.slice(), proxy = createQualityProxy(scene, new PerspectiveCamera());
  assert.equal(proxy.diagnostics.meshes, 1); assert.equal(proxy.stale(), false); proxy.dispose(); proxy.dispose();
  assert.equal(sourceDisposals, 0); assert.deepEqual(geometry.getAttribute('position').array, positions); assert.equal(mesh.parent, scene);
  assert.deepEqual(terrainQualityColor(10, 20, 30, 1, [0.2, 0.3, 0.4]).map(Number.isFinite), [true, true, true]); geometry.dispose(); material.dispose();
});

test('water clipping finds a small island when triangle corners and edge midpoints are all wet', async () => {
  const { createPhysicalSeaGeometry, seaGroundHeight } = await import('../src/rendering/qualityWater.js');
  const grid = { nx: 25, nz: 25, dx: 1, x0: 0, z0: 0 }, values = new Float32Array(625).fill(-10); values[5 * 25 + 5] = 10;
  const context = { sea: { tide: 0 }, terrainGrid: { near: grid, nearH: values, far: grid, farH: values } };
  const source = new BufferGeometry(); source.setAttribute('position', new Float32BufferAttribute([0,0,0, 0,0,20, 20,0,0], 3));
  for (const [x,z] of [[0,0],[0,20],[20,0],[0,10],[10,10],[10,0]]) assert.ok(seaGroundHeight(context,x,z)<0);
  const clipped = createPhysicalSeaGeometry(source,context), p=clipped.getAttribute('position'); assert.ok(p.count > 3);
  for(let i=0;i<p.count;i+=3)for(let a=0;a<=5;a++)for(let b=0;b<=5-a;b++) {
    const u=a/5,v=b/5,w=1-u-v, x=p.getX(i)*u+p.getX(i+1)*v+p.getX(i+2)*w,z=p.getZ(i)*u+p.getZ(i+1)*v+p.getZ(i+2)*w;
    assert.ok(seaGroundHeight(context,x,z)<=0.020001,`water crosses land at ${x},${z}`);
  }
  clipped.dispose();source.dispose();
});

test('authored room vertex colours tint physical emission and track the original day-night colours', () => {
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  geometry.setAttribute('normal',new Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));geometry.setAttribute('color',new Float32BufferAttribute([0.5,0.25,1,0.5,0.25,1,0.5,0.25,1],3));
  const material = new MeshToonMaterial({ color:0xffffff,emissive:0xffffff,emissiveIntensity:0.2,vertexColors:true });qualityMaterialMetadata.set(material,{kind:'room'});
  const source=new Scene();source.add(new Mesh(geometry,material));const proxy=createQualityProxy(source,new PerspectiveCamera());
  const physical=proxy.scene.children[0] as Mesh, room=(physical.material as any[])[0];assert.deepEqual(room.emissive.toArray(),[0.5,0.25,1]);assert.equal(physical.geometry.groups[0].count,3);
  material.color.setRGB(0.3,0.3,0.3);material.emissiveIntensity=0.7;assert.equal(proxy.sync().materials,true);assert.equal(room.emissiveIntensity,0.7);assert.deepEqual(room.color.toArray(),[0.3,0.3,0.3]);
  proxy.dispose();geometry.dispose();material.dispose();
});

test('source clock-style vertex edits invalidate private prepared geometry without changing ownership', () => {
  const scene=new Scene(),geometry=new BoxGeometry(),material=new MeshToonMaterial();const mesh=new Mesh(geometry,material);scene.add(mesh);
  const peer=new Mesh(new BoxGeometry(),new MeshToonMaterial());peer.position.x=3;scene.add(peer);
  const proxy=createQualityProxy(scene,new PerspectiveCamera()),prepared=new PreparedQualityScene(proxy.scene as Scene);assert.deepEqual(proxy.sync().geometry,[]);
  const preparedMesh=prepared.scene.children[0] as Mesh,preparedPeer=prepared.scene.children[1] as Mesh,unchangedGeometry=preparedPeer.geometry,unchangedBVH=preparedPeer.geometry.boundsTree;
  const before=preparedMesh.geometry.getAttribute('position').getX(0);
  const position=geometry.getAttribute('position');position.setX(0,position.getX(0)+0.1);position.needsUpdate=true;
  const change=proxy.sync();assert.deepEqual(change.geometry,[proxy.scene.children[0]]);prepared.updateGeometry(change.geometry);
  assert.notEqual(preparedMesh.geometry.getAttribute('position').getX(0),before);assert.equal(preparedPeer.geometry,unchangedGeometry);assert.equal(preparedPeer.geometry.boundsTree,unchangedBVH);
  assert.deepEqual(proxy.sync().geometry,[]);assert.equal(mesh.geometry,geometry);
  const mask=proxy.maskScene.children[0] as Mesh;assert.equal((mask.material as any).positionNode,null);
  prepared.dispose();proxy.dispose();geometry.dispose();material.dispose();peer.geometry.dispose();(peer.material as MeshToonMaterial).dispose();
});
