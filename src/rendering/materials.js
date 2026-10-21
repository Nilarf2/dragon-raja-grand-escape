import { Fn, If, Discard, float, vec2, vec3, vec4, uniform, attribute, positionLocal, positionWorld, normalWorld, cameraPosition, materialColor, materialEmissive, mix, smoothstep, step, fract, floor, sin, dot, normalize, max, min, clamp, pow, exp, length, reflect, texture, select } from 'three/tsl';

// Explicit application conversions: the quality renderer never guesses how to execute TSL.
export const qualityMaterialMetadata = new WeakMap();
function qualityMaterial(material, metadata) {
  qualityMaterialMetadata.set(material, metadata);
  material.userData.harborQuality = { kind: metadata.kind };
  return material;
}

export const hash2 = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));
export const noise2 = Fn(([p]) => {
  const i = floor(p), f = fract(p), u = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(mix(hash2(i), hash2(i.add(vec2(1, 0))), u.x), mix(hash2(i.add(vec2(0, 1))), hash2(i.add(1)), u.x), u.y);
});
const hash3 = Fn(([p]) => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453)));

function nodes(values) {
  for (const [key, slot] of Object.entries(values)) if (!slot.value?.isTexture && slot.value !== null && !slot.isNode) values[key] = uniform(slot.value);
  return values;
}

export function skyMaterial(T, values) {
  const u = nodes(values), material = new T.MeshBasicNodeMaterial({ side: T.BackSide, depthWrite: false, fog: false });
  material.colorNode = Fn(() => {
    const d = normalize(positionLocal), y = max(d.y, 0), s = max(dot(d, u.sunDir), 0);
    const low = float(1).sub(smoothstep(0, 0.35, u.sunDir.y));
    const c = mix(u.hor, u.top, pow(y, 0.42)).toVar();
    c.addAssign(u.sunCol.mul(pow(s, 6).mul(low.mul(0.35).add(0.25)).add(pow(s, 80).mul(0.5))).mul(float(1).sub(u.night.mul(0.8))));
    c.addAssign(u.sunCol.mul(exp(y.mul(-9))).mul(pow(s, 2)).mul(0.35).mul(low).mul(float(1).sub(u.night)));
    c.assign(mix(c, mix(vec3(1, 0.97, 0.88), vec3(1, 0.6, 0.35), low), smoothstep(u.sunSize.sub(0.00003), u.sunSize, s).mul(float(1).sub(u.night.mul(0.9)))));
    const m = max(dot(d, u.moonDir), 0);
    c.assign(mix(c, vec3(1, 0.97, 0.86), smoothstep(0.99990, 0.99993, m).mul(u.night)));
    c.addAssign(vec3(0.6, 0.7, 1).mul(pow(m, 40)).mul(0.15).mul(u.night));
    const q = floor(d.mul(520)), stars = step(0.9978, hash3(q)).mul(smoothstep(0.04, 0.3, d.y)).mul(u.night).mul(float(1).sub(u.haze));
    c.addAssign(stars.mul(hash3(q.add(1)).mul(0.5).add(0.5)));
    return mix(c, u.hor, u.haze.mul(0.6));
  })();
  return qualityMaterial(material, { kind: 'sky', uniforms: u });
}

export function seaMaterial(T, values) {
  const u = nodes(values), material = new T.MeshBasicNodeMaterial({ fog: true });
  const foamNode = Fn(() => {
    const p = positionWorld.xz, uv = p.sub(u.rNear.xy).div(u.rNear.zw), uf = p.sub(u.rFar.xy).div(u.rFar.zw);
    const inside = step(0, uv.x).mul(step(uv.x, 1)).mul(step(0, uv.y)).mul(step(uv.y, 1));
    const insideF = step(0, uf.x).mul(step(uf.x, 1)).mul(step(0, uf.y)).mul(step(uf.y, 1));
    const gh = select(inside.greaterThan(0.5), texture(u.hNear.value, uv).r, select(insideF.greaterThan(0.5), texture(u.hFar.value, uf).r, float(-40)));
    If(gh.greaterThan(u.tide.add(0.02)), () => { Discard(); });
    const depth = u.tide.sub(gh), n1 = noise2(p.mul(0.11).add(vec2(u.time.mul(0.22), u.time.mul(0.13))));
    const n2 = noise2(p.mul(0.47).sub(vec2(u.time.mul(0.41), u.time.mul(-0.31))));
    const run = sin(u.time.mul(1.1).sub(depth.mul(5)).add(n1.mul(5))).mul(0.5).add(0.5);
    const foam = float(1).sub(smoothstep(0, 1.6, depth)).mul(smoothstep(0.6, 0.95, run.add(n2.mul(0.4)))).mul(0.8).add(float(1).sub(smoothstep(0, 0.18, depth)).mul(0.5));
    return clamp(foam, 0, 1).mul(0.75).mul(max(inside, 0.4));
  })();
  material.colorNode = Fn(() => {
    const p = positionWorld.xz, toCam = cameraPosition.sub(positionWorld), dist = max(length(toCam), 0.001), V = toCam.div(dist);
    const uv = p.sub(u.rNear.xy).div(u.rNear.zw), uf = p.sub(u.rFar.xy).div(u.rFar.zw);
    const inside = step(0, uv.x).mul(step(uv.x, 1)).mul(step(0, uv.y)).mul(step(uv.y, 1));
    const insideF = step(0, uf.x).mul(step(uf.x, 1)).mul(step(0, uf.y)).mul(step(uf.y, 1));
    const gh = select(inside.greaterThan(0.5), texture(u.hNear.value, uv).r, select(insideF.greaterThan(0.5), texture(u.hFar.value, uf).r, float(-40)));
    If(gh.greaterThan(u.tide.add(0.02)), () => { Discard(); });
    const depth = u.tide.sub(gh), amp = float(1).sub(u.calm.mul(0.6)).mul(mix(1, 0.08, smoothstep(80, 2500, dist)));
    const n1 = noise2(p.mul(0.11).add(vec2(u.time.mul(0.22), u.time.mul(0.13))));
    const n2 = noise2(p.mul(0.47).sub(vec2(u.time.mul(0.41), u.time.mul(-0.31))));
    const N = normalize(vec3(n1.sub(0.5).mul(0.22).add(n2.sub(0.5).mul(0.14)).mul(amp), 1, n2.sub(0.5).mul(0.22).mul(amp)));
    const fresnel = pow(float(1).sub(max(dot(N, V), 0)), 3);
    const base = mix(mix(u.shallow, u.deep, smoothstep(0.5, 9, depth)), vec3(0.62, 0.72, 0.62), float(1).sub(smoothstep(0, 1.2, depth)).mul(0.45));
    const dark = float(1).sub(u.night.mul(0.78));
    const c = mix(base.mul(dark), mix(u.hor, u.top, 0.25), clamp(fresnel.mul(0.8).add(0.25), 0, 1)).toVar();
    const band = smoothstep(0.62, 0.66, noise2(vec2(p.x.mul(0.012).add(n1.mul(1.5)), p.y.mul(0.05).add(u.time.mul(0.05)))));
    c.assign(mix(c, c.mul(1.15).add(0.03), band.mul(0.45).mul(float(1).sub(u.night))));
    const R = reflect(V.negate(), N), sd = max(dot(R, u.sunDir), 0), sunVis = smoothstep(-0.03, 0.02, u.sunDir.y), low = float(1).sub(smoothstep(0, 0.3, u.sunDir.y));
    c.addAssign(u.lightCol.mul(pow(sd, 260).mul(2.4).add(pow(sd, 18).mul(0.18).mul(low))).mul(sunVis));
    const glitter = noise2(p.mul(1.1).add(vec2(u.time.mul(0.9), 0))).mul(noise2(p.mul(1.7).sub(vec2(0, u.time.mul(0.7)))));
    const road = pow(max(dot(normalize(vec3(R.x, 0, R.z)), normalize(vec3(u.sunDir.x, 0, u.sunDir.z))), 0), 220);
    c.addAssign(u.lightCol.mul(smoothstep(0.5, 0.6, glitter)).mul(road).mul(1.4).mul(sunVis).mul(low));
    const reflected = reflect(V.negate(), vec3(0, 1, 0));
    c.assign(mix(c, mix(vec3(1, 0.97, 0.88), vec3(1, 0.55, 0.32), low), smoothstep(u.sunSize.sub(0.00003), u.sunSize, dot(reflected, u.sunDir)).mul(smoothstep(1500, 6000, dist)).mul(sunVis)));
    c.addAssign(smoothstep(0.58, 0.63, glitter).mul(0.25).mul(dark).mul(float(1).sub(smoothstep(30, 300, dist))));
    const run = sin(u.time.mul(1.1).sub(depth.mul(5)).add(n1.mul(5))).mul(0.5).add(0.5);
    const foam = float(1).sub(smoothstep(0, 1.6, depth)).mul(smoothstep(0.6, 0.95, run.add(n2.mul(0.4)))).mul(0.8).add(float(1).sub(smoothstep(0, 0.18, depth)).mul(0.5));
    return mix(c, vec3(0.97).mul(dark.mul(0.65).add(0.35)), clamp(foam, 0, 1).mul(0.75).mul(max(inside, 0.4)));
  })();
  // Shared reflection mask: water writes 0.5 in the beauty pass; final output stays opaque.
  material.opacityNode = uniform(0.5);
  return qualityMaterial(material, { kind: 'sea', uniforms: u, foamNode });
}

export function terrainMaterial(T, gradientMap) {
  const m = new T.MeshToonNodeMaterial({ vertexColors: true, gradientMap });
  m.colorNode = Fn(() => {
    const p = positionWorld, mott = noise2(p.xz.mul(0.35)).add(noise2(p.xz.mul(1.3))).mul(0.5);
    const base = attribute('color', 'vec3').mul(mott.mul(0.16).add(0.92));
    const steep = float(1).sub(smoothstep(0.35, 0.6, normalize(normalWorld).y));
    const strata = step(0.5, fract(p.y.mul(0.45).add(noise2(p.xz.mul(0.2))))).mul(0.15).add(0.85);
    return mix(base, vec3(0.5, 0.45, 0.4).mul(strata), steep.mul(0.85));
  })();
  // colorNode supplies vertex colour explicitly; prevent the material's second multiplication.
  m.vertexColors = false;
  return qualityMaterial(m, { kind: 'terrain' });
}

export function townMaterial(T, gradientMap, night) {
  const m = new T.MeshToonNodeMaterial({ gradientMap });
  const windows = Fn(() => {
    const bn = normalize(normalWorld), p = positionWorld;
    const tangent = normalize(vec2(bn.z.negate(), bn.x).add(vec2(0.000001)));
    const u = dot(p.xz, tangent).div(2.7), v = p.y.sub(1).div(3), f = fract(vec2(u, v));
    return step(0.22, f.x).mul(step(f.x, 0.78)).mul(step(0.3, f.y)).mul(step(f.y, 0.74)).mul(step(0, v)).mul(step(bn.y.abs(), 0.4));
  });
  m.colorNode = mix(attribute('color', 'vec3'), vec3(0.2, 0.25, 0.3), windows().mul(0.9));
  m.emissiveNode = vec3(1, 0.78, 0.5).mul(windows()).mul(step(0.6, hash2(floor(positionWorld.xz.mul(0.3)).add(floor(positionWorld.y.div(3)))))).mul(night).mul(0.9);
  return qualityMaterial(m, { kind: 'town', night });
}

export function buildingMaterial(T, gradientMap, state, side, ink = false) {
  const material = ink ? new T.MeshBasicNodeMaterial({ color: 0x2a2630, side: T.BackSide }) : new T.MeshToonNodeMaterial({ color: 0xffffff, vertexColors: true, gradientMap });
  if (side) {
    const hidden = length(attribute('hc', 'vec2').sub(state.uCam.xz)).sub(state.uR0).mul(side).greaterThan(0);
    material.positionNode = select(hidden, vec3(0), positionLocal);
  }
  if (!ink) material.emissiveNode = vec3(1, 0.76, 0.46).mul(attribute('lit', 'float')).mul(state.uNight).mul(1.1);
  return qualityMaterial(material, { kind: 'building', state, side, ink });
}

export function roomMaterial(T, gradientMap, warmLight) {
  const material = new T.MeshToonNodeMaterial({ color: 0xffffff, vertexColors: true, gradientMap, emissive: warmLight, emissiveIntensity: 0.2 });
  material.emissiveNode = materialEmissive.mul(attribute('color', 'vec3'));
  return qualityMaterial(material, { kind: 'room' });
}
