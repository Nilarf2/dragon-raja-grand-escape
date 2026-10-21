/** Check the actual publish directory, including lazy assets that bundler success alone cannot prove. */
import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'dist');
const html=await readFile(join(root,'index.html'),'utf8');
assert.ok(Buffer.byteLength(html)<=1_000_000,'Platform entry HTML must be ≤1 MB');
assert.match(html,/<title>\[龙族\].*Dragon Raja:/,'Bilingual title missing');
const verifyLocal=async(value,base)=>{
  if(/^(?:[a-z]+:|#|\/\/)/i.test(value))return;
  assert.ok(!value.startsWith('/'),`Deployment asset must be relative: ${value}`);
  const target=resolve(base,decodeURIComponent(value.split(/[?#]/)[0]));assert.ok(target.startsWith(root+sep),`Asset escapes distribution: ${value}`);
  assert.ok((await stat(target)).isFile(),`Missing deployment asset: ${value}`);
};
for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g))await verifyLocal(match[1],root);
const visit=async dir=>{for(const entry of await readdir(dir,{withFileTypes:true})){assert.ok(!['node_modules','.git','.secrets'].includes(entry.name),`Forbidden publish directory ${entry.name}`);const file=join(dir,entry.name);if(entry.isDirectory())await visit(file);else if(entry.name.endsWith('.js')){
  const code=await readFile(file,'utf8');for(const match of code.matchAll(/\b(?:from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g))await verifyLocal(match[1],dirname(file));
}}};await visit(root);
for(const file of ['LICENSE','NOTICE.md','licenses/three.txt','licenses/harbor.txt','licenses/three-gpu-pathtracer.txt','licenses/three-mesh-bvh.txt','licenses/oidn-web-LICENSE.txt','licenses/OIDN-weights-LICENSE.txt'])assert.ok((await readFile(join(root,file))).length>100,`Missing notice ${file}`);
const manifest=JSON.parse(await readFile(join(root,'oidn/manifest.json'),'utf8'));
assert.equal(manifest.file,'rt_hdr_calb_cnrm_large.08130cdc4f33b7a5.tza');assert.equal(manifest.bytes,7698439);assert.equal(manifest.sha256,'08130cdc4f33b7a513d0073757f089ac830f900613bb5bad72ca42c52b934465');
const weight=await readFile(join(root,'oidn',manifest.file));assert.equal(weight.length,manifest.bytes);assert.equal(createHash('sha256').update(weight).digest('hex'),manifest.sha256);
for(const scene of ['baishinji','studio']){const manifest=JSON.parse(await readFile(`content/scenes/${scene}/manifest.json`,'utf8'));for(const asset of manifest.assets)await verifyLocal(asset.url,root);}
console.log(`Distribution verified: relative entry/imports, content, notices, ${weight.length}-byte OIDN SHA-256, HTML ${Buffer.byteLength(html)} bytes`);
