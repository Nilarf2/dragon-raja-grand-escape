import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const hardware = process.env.TEST_GPU === 'hardware';
const softwareArgs = ['--use-angle=swiftshader', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader'];
const browser = process.env.TEST_CDP ? await chromium.connectOverCDP(process.env.TEST_CDP) : await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: process.env.TEST_HEADED !== '1',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', ...(hardware ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] : softwareArgs)],
});
const viewport = { width: Number(process.env.TEST_WIDTH || (hardware ? 1280 : 320)), height: Number(process.env.TEST_HEIGHT || (hardware ? 720 : 180)) };
const page = await browser.newPage({ viewport });
page.setDefaultTimeout(180000);
const base = process.env.TEST_URL || 'http://127.0.0.1:5179/', artifacts = 'tests/artifacts'; await mkdir(artifacts, { recursive: true });
const checks = [], errors = [], warnings = []; let failure;
page.on('pageerror', e => errors.push(e.stack));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warnings.push(m.text()); });
const inspect = () => page.evaluate(() => window.__DRAGON_RAJA__.inspect());
const captureHDR = (kind, key) => page.evaluate(async ({ kind, key }) => {
  const image = await window.__DRAGON_RAJA__.readQualityHDR(kind), { width, height, data } = image;
  if (key) window[key] = image;
  let nonfinite = 0, maximum = 0, sum = 0, nonzeroPixels = 0; const quarters = [0,0,0,0];
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) { const i=(y*width+x)*4; let intensity=0;
    for(let c=0;c<3;c++) { const value=data[i+c]; if(!Number.isFinite(value))nonfinite++; maximum=Math.max(maximum,value);sum+=value;intensity+=value; }
    if(intensity>0.000001)nonzeroPixels++;quarters[(y>=height/2?2:0)+(x>=width/2?1:0)]+=intensity;
  }
  return { width,height,nonfinite,maximum,mean:sum/(width*height*3),nonzeroPixels,quarters };
}, {kind,key});
try {
  const targetScene = process.env.TEST_SCENE || 'studio';
  await page.goto(new URL(`?scene=${targetScene}&still&start&at=platform1${hardware ? "" : "&lite&view=raster"}`, base).href);
  await page.waitForFunction(() => window.__DRAGON_RAJA__?.ready || document.querySelector('#runtime-status.error'), null, { timeout: 180000 });
  assert.ok(await page.evaluate(() => window.__DRAGON_RAJA__?.ready), 'Dragon failed to boot');
  const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    return a ? { ...a.info.toJSON?.(), vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description, fallback: a.info.isFallbackAdapter,
      limits: { maxBufferSize: a.limits.maxBufferSize, maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize } } : null;
  });
  if (hardware) { assert.ok(adapter); assert.equal(adapter.fallback, false); assert.doesNotMatch(JSON.stringify(adapter), /swiftshader|llvmpipe|software/i); }
  checks.push({ hardware, adapter, viewport, initial: await inspect() });
  if (hardware) assert.equal((await inspect()).quality.mode, 'quality', 'native WebGPU must select quality by default');
  const probe = await page.evaluate(() => window.__DRAGON_RAJA__.probeQuality()); checks.push({ proxy: probe }); assert.deepEqual(probe.unsupported, []);
  assert.equal(await page.evaluate(() => window.__DRAGON_RAJA__.setRenderMode('quality')), true, 'quality initialization failed');
  for (let i = 0; i < 12; i++) await page.evaluate(() => window.__DRAGON_RAJA__.step(0));
  checks.push({ firstQuality: await inspect() });
  if (hardware) {
    const image=await captureHDR('raw'); checks.push({ firstRawHDR:image }); assert.equal(image.nonfinite,0);assert.ok(image.maximum>0.000001);assert.ok(image.quarters.every(v=>v>0),'all image quadrants must contain traced HDR');assert.ok((await inspect()).quality.native.samples.min>=1);
  }
  await page.screenshot({ path: `${artifacts}/quality-${targetScene}-${hardware ? 'hardware' : 'software'}.png` });
  if (targetScene === 'studio') {
    for (const clip of ['idle', 'walk', 'run', 'sit', 'wave']) {
      await page.click(`[data-clip="${clip}"]`); await page.evaluate(() => { const a = window.__DRAGON_RAJA__; a.step(0.35); a.step(0); });
      checks.push({ clip, result: await inspect() }); assert.equal((await inspect()).scene.currentClip, clip);
      await page.screenshot({ path: `${artifacts}/quality-${clip}-${hardware ? 'hardware' : 'software'}.png` });
    }
  } else {
    for (const place of ['station', 'platform1', 'lot', 'lane', 'shrine', 'summit', 'rock', 'wheel', 'beach']) {
      await page.evaluate(id => { const a = window.__DRAGON_RAJA__; a.teleport(id); a.step(0); }, place);
      // Settle camera/lazy source LOD, then drain native topology refresh without advancing time.
      assert.equal(await page.evaluate(() => window.__DRAGON_RAJA__.qualityReady()), true);
      for (let i = 0; i < 4; i++) await page.evaluate(() => window.__DRAGON_RAJA__.step(0));
      checks.push({ place, result: await inspect() });
      await page.screenshot({ path: `${artifacts}/quality-${place}-${hardware ? 'hardware' : 'software'}.png` });
    }
  }
  const beforeRefine = await page.evaluate(() => window.__DRAGON_RAJA__.snapshot());
  await page.evaluate(() => { const a = window.__DRAGON_RAJA__; a.refine(64); a.step(1); });
  assert.deepEqual(await page.evaluate(() => window.__DRAGON_RAJA__.snapshot()), beforeRefine, 'refinement must freeze the full simulation');
  if (targetScene === 'baishinji') {
    const hour = beforeRefine.environment.hour;
    assert.equal(await page.locator('#clock').textContent(), `${String(Math.floor(hour)).padStart(2,'0')}:${String(Math.floor((hour % 1)*60)).padStart(2,'0')}`, 'frozen HUD must describe the captured world');
  }
  // Real input resumes simulation before changing gameplay state; toolbar expansion is inert.
  if (targetScene === 'studio') {
    await page.click('[data-clip="walk"]'); assert.equal((await inspect()).scene.currentClip, 'walk');
  } else {
    await page.keyboard.down('w'); await page.evaluate(() => window.__DRAGON_RAJA__.step(0.1)); await page.keyboard.up('w');
  }
  assert.equal((await inspect()).quality.refinement.state, 'idle', 'real gameplay input must cancel frozen refinement');
  await page.evaluate(() => window.__DRAGON_RAJA__.refine(64));
  if (process.env.TEST_REFINE === '1') {
    for (let i = 0; i < 30000; i++) {
      await page.evaluate(() => window.__DRAGON_RAJA__.step(0));
      const state = (await inspect()).quality.refinement;
      if (state.state === 'error') throw new Error(state.error);
      if (state.state === 'complete') { assert.ok(state.samples.min >= 64); assert.equal(state.denoised, true); checks.push({ denoised: await inspect() }); break; }
      if (i === 29999) throw new Error('Refinement timed out');
      await page.waitForTimeout(5);
    }
    const raw=await captureHDR('raw','__qualityRaw64'),filtered=await captureHDR('filtered','__qualityFiltered64');
    checks.push({raw64:raw,filtered64:filtered});assert.equal(raw.nonfinite,0);assert.equal(filtered.nonfinite,0);
    if(process.env.TEST_REFERENCE==='1') {
      await page.evaluate(()=>window.__DRAGON_RAJA__.refine(256));
      for(let i=0;i<30000;i++) { await page.evaluate(()=>window.__DRAGON_RAJA__.step(0));const state=(await inspect()).quality.refinement;if(state.state==='error')throw new Error(state.error);if(state.samples?.min>=256)break;if(i===29999)throw new Error('256-sample reference timed out');await page.waitForTimeout(5); }
      const reference=await captureHDR('raw','__qualityReference256');
      const metrics=await page.evaluate(()=>{const a=window.__qualityRaw64,b=window.__qualityFiltered64,r=window.__qualityReference256;let raw=0,filtered=0,rawEdges=0,filteredEdges=0,referenceEdges=0;
        for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++)for(let c=0;c<3;c++){const i=(y*r.width+x)*4+c;raw+=(a.data[i]-r.data[i])**2;filtered+=(b.data[i]-r.data[i])**2;if(x>0){rawEdges+=Math.abs(a.data[i]-a.data[i-4]);filteredEdges+=Math.abs(b.data[i]-b.data[i-4]);referenceEdges+=Math.abs(r.data[i]-r.data[i-4]);}}
        const n=r.width*r.height*3;return{rawMSE:raw/n,filteredMSE:filtered/n,rawEdgeEnergy:rawEdges/n,filteredEdgeEnergy:filteredEdges/n,referenceEdgeEnergy:referenceEdges/n};});
      checks.push({reference256:reference,denoiseComparison:metrics});assert.equal(reference.nonfinite,0);assert.ok(metrics.filteredMSE<metrics.rawMSE,'OIDN must improve MSE against the 256-sample reference');
    }
  }
  await page.evaluate(() => window.__DRAGON_RAJA__.cancelRefine());
  assert.equal(await page.evaluate(() => window.__DRAGON_RAJA__.setRenderMode('raster')), true);
  await page.evaluate(() => window.__DRAGON_RAJA__.step(0)); checks.push({ restoredRaster: await inspect() });
  await page.waitForTimeout(1000); assert.deepEqual(errors, []);
} catch (e) { failure = e.stack ?? String(e); process.exitCode = 1; console.log('FAILED', failure, JSON.stringify(await inspect().catch(() => null))); }
finally {
  await writeFile(`${artifacts}/quality-${process.env.TEST_SCENE || 'studio'}-${hardware ? 'hardware' : 'software'}-result.json`, JSON.stringify({ passed: !failure, failure, browser: browser.version(), base, hardware, checks, errors, warnings: [...new Set(warnings)] }, null, 2));
  if (!process.env.TEST_CDP) await browser.close(); else await page.close();
}
