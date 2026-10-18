// Original procedural test mannequin, MIT, same licence as this project.
// A real skinned GLB exercises the same loader/animation path as future Blender characters.
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const bones = [], pieces = [];
function bone(name, parent, x, y, z) { const b = new T.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); bones.push(b); return b; }
const hips = bone('hips', null, 0, 0.95, 0);
const spine = bone('spine', hips, 0, 0.28, 0), head = bone('head', spine, 0, 0.44, 0);
const armL = bone('armL', spine, -0.3, 0.2, 0), armR = bone('armR', spine, 0.3, 0.2, 0);
const legL = bone('legL', hips, -0.13, -0.05, 0), legR = bone('legR', hips, 0.13, -0.05, 0);
const shinL = bone('shinL', legL, 0, -0.43, 0), shinR = bone('shinR', legR, 0, -0.43, 0);
hips.updateMatrixWorld(true);
function box(b, w, h, d, offset, hex) {
  const g = new T.BoxGeometry(w, h, d).toNonIndexed();
  const p = new T.Vector3(); b.getWorldPosition(p); g.translate(p.x + offset[0], p.y + offset[1], p.z + offset[2]);
  const count = g.attributes.position.count, indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4), colors = new Float32Array(count * 3), color = new T.Color(hex);
  for (let i = 0; i < count; i++) { indices[i * 4] = bones.indexOf(b); weights[i * 4] = 1; color.toArray(colors, i * 3); }
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4)); g.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); pieces.push(g);
}
box(hips, 0.34, 0.22, 0.25, [0, 0, 0], 0x263b54);
box(spine, 0.46, 0.48, 0.28, [0, 0.05, 0], 0x559bb0);
box(head, 0.27, 0.3, 0.26, [0, 0.06, 0], 0xe3ba95);
for (const arm of [armL, armR]) box(arm, 0.13, 0.55, 0.15, [0, -0.22, 0], 0x559bb0);
for (const leg of [legL, legR]) box(leg, 0.16, 0.42, 0.19, [0, -0.2, 0], 0x263b54);
for (const shin of [shinL, shinR]) { box(shin, 0.15, 0.38, 0.18, [0, -0.18, 0], 0x263b54); box(shin, 0.18, 0.1, 0.3, [0, -0.36, 0.05], 0x26303d); }
const mesh = new T.SkinnedMesh(mergeGeometries(pieces), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
mesh.name = 'mannequin'; mesh.add(hips); mesh.bind(new T.Skeleton(bones));
const scene = new T.Group(); scene.name = 'DemoCharacter'; scene.add(mesh);
function rotations(name, times, angles, axis = 'x') { return new T.QuaternionKeyframeTrack(`${name}.quaternion`, times, angles.flatMap(a => new T.Quaternion().setFromEuler(new T.Euler(axis === 'x' ? a : 0, 0, axis === 'z' ? a : 0)).toArray())); }
const idle = new T.AnimationClip('idle', 2, [rotations('spine', [0, 1, 2], [-0.025, 0.025, -0.025])]);
function gait(name, duration, amplitude) { const times = [0, duration / 4, duration / 2, duration * 3 / 4, duration]; const wave = [0, amplitude, 0, -amplitude, 0]; return new T.AnimationClip(name, duration, [rotations('legL', times, wave), rotations('legR', times, wave.map(v => -v)), rotations('armL', times, wave.map(v => -v * 0.65)), rotations('armR', times, wave.map(v => v * 0.65))]); }
const walk = gait('walk', 1.2, 0.45), run = gait('run', 0.65, 0.8);
const sit = new T.AnimationClip('sit', 1, [rotations('legL', [0, 1], [-1.5, -1.5]), rotations('legR', [0, 1], [-1.5, -1.5]), rotations('shinL', [0, 1], [1.5, 1.5]), rotations('shinR', [0, 1], [1.5, 1.5]), new T.VectorKeyframeTrack('hips.position', [0, 1], [0, 0.52, 0, 0, 0.52, 0])]);
const wave = new T.AnimationClip('wave', 2, [rotations('armR', [0, 0.5, 1, 1.5, 2], [0, -2.3, -1.9, -2.3, 0], 'z')]);
const bytes = await new GLTFExporter().parseAsync(scene, { binary: true, animations: [idle, walk, run, sit, wave] });
await mkdir('public/content/characters', { recursive: true });
await writeFile('public/content/characters/mannequin.glb', Buffer.from(bytes));
console.log(`Exported original skinned mannequin: ${bytes.byteLength} bytes, 5 clips, ${bones.length} bones`);
