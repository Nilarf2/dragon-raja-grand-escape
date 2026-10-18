import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { scenes } from '../../src/world/registry';

const root = process.cwd();
const ids = new Set<string>();
for (const { manifest } of scenes) {
  if (manifest.schemaVersion !== 1 || !/^[a-z0-9-]+$/.test(manifest.id) || ids.has(manifest.id)) throw new Error(`Invalid or duplicate scene: ${manifest.id}`);
  ids.add(manifest.id);
  if (!manifest.anchors.includes(manifest.entry) || new Set(manifest.anchors).size !== manifest.anchors.length) throw new Error(`Invalid anchors: ${manifest.id}`);
  const assets = new Set<string>();
  for (const asset of manifest.assets) {
    if (assets.has(asset.id) || !['json', 'gltf'].includes(asset.type) || asset.url.includes('..') || !asset.url.startsWith('content/')) throw new Error(`Invalid asset: ${asset.id}`);
    assets.add(asset.id);
    const file = path.join(root, 'public', asset.url); await access(file);
    if (asset.type === 'json') JSON.parse(await readFile(file, 'utf8'));
    if (asset.type === 'gltf') {
      const data = await readFile(file);
      if (data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw new Error(`Invalid GLB: ${asset.url}`);
      const gltf = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
      if (asset.skinned && !gltf.skins?.length) throw new Error(`Missing skin: ${asset.url}`);
      for (const clip of asset.animations ?? []) if (!gltf.animations?.some((a: { name: string }) => a.name === clip)) throw new Error(`Missing animation ${clip}: ${asset.url}`);
    }
  }
}
for (const name of ['terrain_near', 'terrain_far']) {
  const data = JSON.parse(await readFile(`public/content/baishinji/${name}.json`, 'utf8'));
  if (!Number.isInteger(data.nx) || !Number.isInteger(data.nz) || data.nx < 2 || data.nz < 2 || !(data.dx > 0) || !(data.unit > 0) || Buffer.from(data.b64, 'base64').length !== data.nx * data.nz * 2) throw new Error(`Invalid height grid: ${name}`);
}
const buildings = JSON.parse(await readFile('public/content/baishinji/models_town.json', 'utf8'));
if (!(buildings.q > 0) || !buildings.list.length || new Set(buildings.list.map((v: { n: string }) => v.n)).size !== buildings.list.length || buildings.list.some((v: { lods: unknown[] }) => v.lods.length !== 3)) throw new Error('Invalid building library');
console.log(`Validated ${ids.size} scene manifests, assets, terrain grids and ${buildings.list.length} building variants`);
