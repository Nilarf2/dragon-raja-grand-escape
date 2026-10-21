/** Full authored scene → Dragon proxy → Harbor preparation → actual upstream CPU acceleration build. */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});let result;
try {
  await page.goto(new URL('?view=raster&lite&still&start&at=platform1',process.env.TEST_URL||'http://127.0.0.1:5179/').href);
  await page.waitForFunction(()=>window.__DRAGON_RAJA__?.ready,null,{timeout:180000});
  result=await page.evaluate(async()=>{
    const {PathtracerBVHComputeData}=await import('/node_modules/three-gpu-pathtracer/src/webgpu/nodes/PathtracerBVHComputeData.js');
    return window.__DRAGON_RAJA__.probeQuality((_proxy,prepared)=>{
      const data=new PathtracerBVHComputeData(prepared);
      try {data.update();return{passed:true,materials:data.materials.length};}catch(error){return{passed:false,error:error.stack};}finally{data.dispose();}
    });
  });
  assert.equal(result.verification.passed,true,result.verification.error);console.log('PASS FULL SCENE CPU',JSON.stringify(result));
}finally {await mkdir('tests/artifacts',{recursive:true});await writeFile('tests/artifacts/quality-fullscene-cpu-result.json',JSON.stringify(result,null,2));await browser.close();}
