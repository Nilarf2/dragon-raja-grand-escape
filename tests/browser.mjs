import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const artifacts = 'tests/artifacts'; await mkdir(artifacts, { recursive: true });
const name = process.env.TEST_NAME || (process.env.TEST_QUERY ? 'effects' : 'lifecycle');
const base = process.env.TEST_URL || 'http://127.0.0.1:5179/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--use-angle=swiftshader', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader'] });
const errors = [], warnings = [], checks = [];
let failure;
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', error => { errors.push(error.stack); console.log('PAGE ERROR', error.message); });
page.on('response', response => { if (response.status() >= 400) { const error = `HTTP ${response.status()}: ${response.url()}`; errors.push(error); console.log(error); } });
page.on('console', message => {
  if (message.type() === 'error') { errors.push(message.text()); console.log('CONSOLE ERROR', message.text().slice(0, 1200)); }
  if (message.type() === 'warning') warnings.push(message.text());
});
const inspect = () => page.evaluate(() => window.__DRAGON_RAJA__.inspect());
try {
  await page.goto(new URL(process.env.TEST_QUERY || '?lite&nofx&still&start', base).href);
  await page.waitForFunction(() => window.__DRAGON_RAJA__?.ready || document.querySelector('#runtime-status.error'), null, { timeout: 120000 });
  assert.ok(await page.evaluate(() => window.__DRAGON_RAJA__?.ready), 'application did not boot');
  const initial = await inspect(); checks.push({ initial }); console.log('READY', JSON.stringify(initial));
  assert.equal(initial.backend, process.env.TEST_QUERY?.includes('renderer=webgl') ? 'webgl2' : 'webgpu');
  await page.screenshot({ path: `${artifacts}/${name}-baishinji.png` });
  if (!process.env.TEST_QUERY) {
    const positions = [];
    for (const id of initial.scene.places) {
      const position = await page.evaluate(id => { const app = window.__DRAGON_RAJA__; app.teleport(id); app.step(); return app.snapshot().player.position; }, id);
      positions.push({ id, position });
      await page.screenshot({ path: `${artifacts}/${name}-${id}.png` });
    }
    assert.ok(positions.every(p => p.position.every(Number.isFinite))); checks.push({ positions });
    await page.evaluate(() => { const a = window.__DRAGON_RAJA__; a.story('start'); a.step(); a.save(); });
    assert.equal((await inspect()).scene.mode, 'story');
    await page.evaluate(() => window.__DRAGON_RAJA__.story('stop'));
    let warmMemory;
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(() => window.__DRAGON_RAJA__.switchScene('studio'));
      const studio = await inspect(); assert.equal(studio.scene.skinned, 1); assert.deepEqual(studio.scene.clips, ['idle', 'walk', 'run', 'sit', 'wave']);
      await page.click('[data-clip="walk"]');
      await page.evaluate(() => window.__DRAGON_RAJA__.step(0.3));
      await page.screenshot({ path: `${artifacts}/studio-${cycle}.png` });
      await page.evaluate(() => window.__DRAGON_RAJA__.switchScene('baishinji'));
      const back = await inspect(); checks.push({ cycle, studio, back });
      assert.equal(back.assets, initial.assets); assert.equal(back.scene.colliders, initial.scene.colliders); assert.equal(back.scene.updaters, initial.scene.updaters);
      if (cycle === 0) warmMemory = back.memory;
      else for (const key of ['geometries', 'textures', 'renderTargets', 'attributes', 'attributesSize', 'uniformBuffers']) assert.equal(back.memory[key], warmMemory[key], `${key} grew after scene reload`);
    }
    await page.evaluate(() => window.__DRAGON_RAJA__.restore());
    assert.equal((await inspect()).scene.mode, 'story');
    checks.push({ restored: await inspect() });
    const story = await page.evaluate(() => {
      const app = window.__DRAGON_RAJA__, visited = new Set();
      app.story('stop'); app.story('start');
      let ticks = 0;
      for (; ticks < 1800 && app.inspect().scene.mode === 'story'; ticks++) {
        const id = app.inspect().scene.checkpoint;
        visited.add(id); app.step(1, false); app.story('confirm');
      }
      app.step(0);
      return { ticks, visited: [...visited], mode: app.inspect().scene.mode };
    });
    assert.deepEqual(story.visited, initial.scene.beats); assert.equal(story.mode, 'wander'); checks.push({ acceleratedStory: story });
  } else {
    // Exercise material/LOD variants, rain/fog and night lighting beyond the initial sea-facing view.
    await page.keyboard.press('Digit4'); await page.keyboard.press('KeyR'); await page.keyboard.press('KeyF');
    await page.evaluate(() => { const app = window.__DRAGON_RAJA__; app.teleport('platform1'); for (let i = 0; i < 8; i++) app.step(1, false); app.step(0); });
    await page.screenshot({ path: `${artifacts}/${name}-rain-night.png` });
    checks.push({ rainyNight: await inspect() });
    let warmEffectsMemory;
    for (let cycle = 0; cycle < Number(process.env.TEST_SCENE_CYCLE || 0); cycle++) {
      await page.evaluate(() => window.__DRAGON_RAJA__.switchScene('studio'));
      await page.click('[data-clip="wave"]'); await page.evaluate(() => window.__DRAGON_RAJA__.step(0.5));
      await page.screenshot({ path: `${artifacts}/${name}-studio.png` });
      await page.evaluate(() => window.__DRAGON_RAJA__.switchScene('baishinji'));
      // Allow embedded SMAA lookup images to finish decoding, then sample a warmed frame.
      await page.waitForTimeout(100); await page.evaluate(() => window.__DRAGON_RAJA__.step(0));
      const reloaded = await inspect(); checks.push({ effectCycle: cycle, reloaded });
      console.log('EFFECT CYCLE', cycle, JSON.stringify(reloaded.memory));
      if (cycle === 0) warmEffectsMemory = reloaded.memory;
      else for (const key of ['geometries', 'textures', 'renderTargets', 'attributes', 'attributesSize', 'uniformBuffers']) assert.equal(reloaded.memory[key], warmEffectsMemory[key], `${key} grew after effects scene reload`);
    }
  }
  // Flush validation errors emitted asynchronously by the GPU device.
  await page.waitForTimeout(1000);
  assert.deepEqual(errors, []);
  console.log('PASS', JSON.stringify({ checks: checks.length, warnings: [...new Set(warnings)].slice(0, 15) }));
} catch (error) {
  failure = error.stack || String(error);
  console.log('FAILED', error.stack);
  console.log('STATUS', await page.locator('#runtime-status').textContent().catch(() => 'unavailable'));
  process.exitCode = 1;
} finally {
  await writeFile(`${artifacts}/${name}-result.json`, JSON.stringify({ passed: !failure, failure, browser: browser.version(), base, query: process.env.TEST_QUERY || '?lite&nofx&still&start', checks, errors, warnings: [...new Set(warnings)] }, null, 2));
  await browser.close();
}
