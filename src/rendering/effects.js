import { Fn, Loop, float, vec2, vec3, vec4, uv, uniform, mix, smoothstep, step, length, exp, max, min, clamp, select, dot, normalize, getViewPosition } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';

export function ambientOcclusion(depth, normals, camera, tier) {
  const effect = ao(depth, normals, camera);
  effect.resolutionScale = 0.5;
  effect.radius.value = 2.4;
  effect.thickness.value = 1.5;
  effect.samples.value = tier === 'high' ? 12 : 6;
  return effect;
}

export function reflections(color, depth, normals, camera, uniforms) {
  const p = getViewPosition(uv(), depth, uniform(camera.projectionMatrixInverse));
  const world = uniform(camera.matrixWorld).mul(vec4(p, 1)).xyz;
  const n = uniform(camera.matrixWorld).mul(vec4(normals.xyz, 0)).xyz;
  const water = float(1).sub(smoothstep(0.03, 0.25, world.y.sub(uniforms.tide).abs()));
  const wet = step(0.92, n.y).mul(uniforms.rain).mul(0.4);
  const mask = max(water, wet).mul(step(depth, 0.99999));
  const effect = ssr(color, depth, normals, { camera, metalnessNode: mask, roughnessNode: uniform(0.16) });
  effect.resolutionScale = 0.5;
  effect.maxDistance.value = 90;
  effect.thickness.value = 1.5;
  effect.quality.value = 0.3;
  return { effect, mask };
}

/** Radial sun shafts remain independent of shadow-map implementation and work at low quality. */
export function sunShafts(depth, uniforms) {
  return Fn(() => {
    const total = float(0).toVar();
    Loop(16, ({ i }) => {
      const f = float(i).div(16), sampleUV = mix(uv(), uniforms.sunUV, f.mul(0.9));
      const onScreen = step(0, sampleUV.x).mul(step(sampleUV.x, 1)).mul(step(0, sampleUV.y)).mul(step(sampleUV.y, 1));
      total.addAssign(step(0.99999, depth.sample(sampleUV).r).mul(float(1).sub(f)).mul(onScreen));
    });
    const radius = length(uv().sub(uniforms.sunUV));
    return uniforms.sunColor.mul(total.div(16)).mul(float(1).sub(smoothstep(0.05, 0.8, radius))).mul(uniforms.sunVisibility);
  })();
}

export function heightFog(depth, camera, uniforms) {
  return Fn(() => {
    const p = getViewPosition(uv(), depth, uniform(camera.projectionMatrixInverse));
    const world = uniform(camera.matrixWorld).mul(vec4(p, 1)).xyz;
    const y0 = max(uniforms.cameraY, -2), y1 = max(world.y, -2), dy = y1.sub(y0);
    const e0 = exp(y0.div(-22)), e1 = exp(y1.div(-22));
    const integral = select(dy.abs().greaterThan(0.05), e0.sub(e1).div(select(dy.abs().greaterThan(0.05), dy.div(22), float(1))), e0);
    return clamp(float(1).sub(exp(length(p).mul(uniforms.fogDensity).mul(integral).negate())), 0, 0.8).mul(step(depth, 0.99999));
  })();
}
