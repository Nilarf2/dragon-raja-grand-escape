import {
  Scene, Color, MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicNodeMaterial,
  SpriteMaterial, LineBasicMaterial, BufferGeometry, BufferAttribute, Float32BufferAttribute,
  DataTexture, RGBAFormat, FloatType, EquirectangularReflectionMapping, LinearFilter,
  Vector3, Matrix3, DoubleSide,
} from 'three/webgpu';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { vec3, texture, uniform } from 'three/tsl';
import { qualityMaterialMetadata } from './materials.js';
import { createTownQualityWindows } from './qualityWindows.js';
import { createPhysicalSeaGeometry, createWaterNormalMap } from './qualityWater.js';

const fract = v => v - Math.floor(v);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
export const qualityHash2 = (x, z) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
export function qualityNoise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = fract(x), fz = fract(z);
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return mix(mix(qualityHash2(ix, iz), qualityHash2(ix + 1, iz), u), mix(qualityHash2(ix, iz + 1), qualityHash2(ix + 1, iz + 1), u), v);
}

/** Equivalent CPU evaluation of the original terrain TSL, in linear working colour. */
export function terrainQualityColor(x, y, z, normalY, color) {
  const mott = (qualityNoise2(x * 0.35, z * 0.35) + qualityNoise2(x * 1.3, z * 1.3)) * 0.5;
  const steep = 1 - smooth(0.35, 0.6, normalY);
  const strata = (fract(y * 0.45 + qualityNoise2(x * 0.2, z * 0.2)) >= 0.5 ? 0.15 : 0) + 0.85;
  return color.map((c, i) => mix(c * (mott * 0.16 + 0.92), [0.5, 0.45, 0.4][i] * strata, steep * 0.85));
}

/** Shares immutable attribute storage. Only the proxy geometry object and changed channels are owned. */
export function geometryView(source) {
  const geometry = new BufferGeometry();
  for (const [name, value] of Object.entries(source.attributes)) geometry.setAttribute(name, value);
  geometry.setIndex(source.index);
  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  geometry.morphAttributes = source.morphAttributes;
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  return geometry;
}

/** Resolve the original GPU near/mid LOD selection as real indexed triangles. No doubled buildings. */
export function buildingQualityIndex(geometry, state, side) {
  const position = geometry.getAttribute('position'), centers = geometry.getAttribute('hc');
  if (!side) return geometry.index?.array ?? Uint32Array.from({ length: position.count }, (_, i) => i);
  if (!centers) throw new Error('Building LOD is missing its hc attribute');
  const camera = state.uCam.value, radius = state.uR0.value;
  const index = geometry.index, start = geometry.drawRange.start;
  const end = Math.min(index?.count ?? position.count, start + geometry.drawRange.count);
  const result = [];
  for (let i = start; i + 2 < end; i += 3) {
    const vertex = index ? index.getX(i) : i;
    // Each building has one centre; all corners must use the same LOD decision.
    const shown = (Math.hypot(centers.getX(vertex) - camera.x, centers.getY(vertex) - camera.z) - radius) * side <= 0;
    if (shown) for (let j = 0; j < 3; j++) result.push(index ? index.getX(i + j) : i + j);
  }
  return position.count > 65535 ? new Uint32Array(result) : new Uint16Array(result);
}

function nativeMaterial(source) {
  const material = new MeshStandardMaterial({
    color: source.color ?? 0xffffff, side: source.side,
    roughness: source.roughness ?? (source.isMeshPhongMaterial ? 0.55 : 0.85), metalness: source.metalness ?? 0,
    vertexColors: source.vertexColors, map: source.map ?? null, alphaMap: source.alphaMap ?? null,
    normalMap: source.normalMap ?? null, roughnessMap: source.roughnessMap ?? null, metalnessMap: source.metalnessMap ?? null,
    emissive: source.emissive ?? 0x000000, emissiveMap: source.emissiveMap ?? null, emissiveIntensity: source.emissiveIntensity ?? 1,
    transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest,
  });
  if (source.isMeshBasicMaterial || source.isMeshBasicNodeMaterial) {
    material.emissive.copy(source.color ?? new Color(0xffffff)); material.emissiveMap = source.map ?? null;
    // Keep map alpha for transparent authored signs/pools; black diffuse suppresses only its RGB.
    material.color.set(0x000000);
  }
  return material;
}

function pairObjects(source, target, visit) {
  const pairs = [];
  function collect(a, b) { pairs.push([a, b]); for (let i = 0; i < a.children.length; i++) collect(a.children[i], b.children[i]); }
  collect(source, target); for (const [a, b] of pairs) visit(a, b);
}
function ownSkeletons(root) { const skeletons = new Set(); root.traverse(o => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); }); return skeletons; }
const matrixKey = o => o.matrixWorld.elements.join(',');
const geometryRevision = geometry => `${Object.entries(geometry.attributes).map(([name, attribute]) => `${name}:${attribute.data?.version ?? attribute.version}`).join('|')}|index:${geometry.index?.version ?? ''}`;

/** Native PBR scene + a separate raster classification mask. The original scene stays intact. */
export function createQualityProxy(source, camera, options = {}) {
  source.updateMatrixWorld(true);
  const scene = clone(source), maskScene = clone(source), bindings = [], maskBindings = [], materialBindings = [];
  const geometries = new Set(), materials = new Set(), textures = new Set(), townWindows = [];
  const proxySkeletons = ownSkeletons(scene), maskSkeletons = ownSkeletons(maskScene);
  const diagnostics = { conversion: 'dragon-raja-pbr-v1', meshes: 0, instances: 0, skinned: 0,
    terrain: 0, buildings: 0, windows: 0, rooms: 0, sea: 0, atmosphere: 0,
    rasterComposite: ['shore foam', 'sun/moon/stars/sky/clouds', 'rain/petals/halos/lines', 'linear HDR fog/rays/bloom/grade; AO and SSR disabled'],
    unsupported: [], approximations: ['toon lighting becomes physical diffuse/specular', 'water uses physical reflection/refraction and original DEM/tide; procedural foam composites in linear HDR'] };
  let disposed = false, cameraState = '';
  const topologySignature = () => { const parts = []; source.traverse(o => { parts.push(`${o.uuid}:${o.geometry?.uuid ?? ''}:${o.material ? (Array.isArray(o.material) ? o.material : [o.material]).map(m => m.uuid).join(',') : ''}`); }); return parts.join('|'); };
  const initialTopology = topologySignature();
  scene.name = 'Dragon Raja quality proxy'; scene.fog = null;
  maskScene.name = 'Dragon Raja quality classification'; maskScene.fog = null; maskScene.background = new Color(0x000000); maskScene.environment = null;
  const materialCache = new Map(), geometryCache = new Map(), maskMaterialCache = new Map();
  const terrainColors = new Map();
  function convertedGeometry(object, metadata) {
    const sourceGeometry = object.geometry;
    const key = `${sourceGeometry.uuid}|${metadata?.kind ?? 'plain'}|${metadata?.side ?? 0}|${metadata?.kind === 'terrain' ? matrixKey(object) : ''}`;
    if (geometryCache.has(key)) return geometryCache.get(key);
    const geometry = geometryView(sourceGeometry); geometries.add(geometry);
    if (metadata?.kind === 'terrain') {
      const positions = sourceGeometry.getAttribute('position'), normals = sourceGeometry.getAttribute('normal'), colors = sourceGeometry.getAttribute('color');
      if (!colors || !normals) throw new Error('Terrain quality conversion needs original colour and normal attributes');
      let byTransform = terrainColors.get(positions.array);
      if (!byTransform) terrainColors.set(positions.array, byTransform = new Map());
      const colorKey = `${matrixKey(object)}|${normals.array.byteOffset}|${colors.array.byteOffset}`;
      let baked = byTransform.get(colorKey);
      if (!baked) {
        baked = new Float32Array(positions.count * 3);
        const p = new Vector3(), n = new Vector3(), normalMatrix = new Matrix3().getNormalMatrix(object.matrixWorld);
        for (let i = 0; i < positions.count; i++) {
          p.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
          n.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
          baked.set(terrainQualityColor(p.x, p.y, p.z, n.y, [colors.getX(i), colors.getY(i), colors.getZ(i)]), i * 3);
        }
        byTransform.set(colorKey, baked);
      }
      geometry.setAttribute('color', new BufferAttribute(baked, 3));
    }
    if (metadata?.kind === 'sea') {
      geometry.dispose(); geometries.delete(geometry);
      const water = createPhysicalSeaGeometry(sourceGeometry, options.context);
      geometries.add(water); geometryCache.set(key, water); return water;
    }
    if (metadata?.kind === 'building' && metadata.side) {
      geometry.setIndex(new BufferAttribute(buildingQualityIndex(sourceGeometry, metadata.state, metadata.side), 1));
      geometry.clearGroups(); geometry.setDrawRange(0, Infinity);
    }
    geometryCache.set(key, geometry); return geometry;
  }
  function convert(sourceMaterial, object) {
    const metadata = qualityMaterialMetadata.get(sourceMaterial);
    if (sourceMaterial.isNodeMaterial && !metadata && (sourceMaterial.colorNode || sourceMaterial.positionNode || sourceMaterial.emissiveNode || sourceMaterial.fragmentNode || sourceMaterial.outputNode)) {
      throw new Error(`Unsupported quality material: ${sourceMaterial.name || sourceMaterial.type} on ${object.name || object.uuid}`);
    }
    if (sourceMaterial.isShaderMaterial || sourceMaterial.displacementMap || Object.keys(object.geometry.morphAttributes).length) {
      throw new Error(`Unsupported quality deformation/material on ${object.name || object.uuid}: ${Object.keys(object.geometry.morphAttributes).length ? 'plain morph targets' : sourceMaterial.type}`);
    }
    const key = `${sourceMaterial.uuid}|${metadata?.kind ?? 'plain'}`;
    if (materialCache.has(key)) return materialCache.get(key);
    const material = nativeMaterial(sourceMaterial); materials.add(material);
    if (metadata?.kind === 'terrain' || metadata?.kind === 'town') material.vertexColors = true;
    if (metadata?.kind === 'building') {
      material.vertexColors = !metadata.ink;
      if (metadata.ink) { material.color.set(0x2a2630); material.emissive.set(0x000000); }
      else materialBindings.push({ source: sourceMaterial, target: material, metadata });
    }
    if (metadata?.kind === 'sea') {
      materials.delete(material); material.dispose();
      const normalMap = createWaterNormalMap(); textures.add(normalMap);
      const water = new MeshPhysicalMaterial({ color: 0x3b91ae, roughness: 0.12, metalness: 0, transmission: 0.55, thickness: 2, attenuationColor: new Color(0x287c9d), attenuationDistance: 18, ior: 1.333, normalMap, side: DoubleSide });
      materials.add(water); materialCache.set(key, water); return water;
    }
    materialBindings.push({ source: sourceMaterial, target: material, metadata });
    materialCache.set(key, material); return material;
  }
  function maskMaterial(original, composite) {
    const key = `${original.uuid}|${composite}`;
    if (maskMaterialCache.has(key)) return maskMaterialCache.get(key);
    let material;
    if (original.isSpriteMaterial) material = new SpriteMaterial({ color: 0xffffff, map: original.map, opacity: original.opacity, transparent: true, depthWrite: original.depthWrite, depthTest: original.depthTest, alphaTest: original.alphaTest });
    else if (original.isLineBasicMaterial) material = new LineBasicMaterial({ color: 0xffffff, opacity: original.opacity, transparent: true, depthWrite: original.depthWrite, depthTest: original.depthTest });
    else {
      material = new MeshBasicNodeMaterial({ color: composite ? 0xffffff : 0x000000, side: original.side, depthWrite: original.depthWrite, depthTest: original.depthTest,
        transparent: original.transparent, opacity: original.opacity, alphaTest: original.alphaTest, fog: false });
      // Keep procedural discard/LOD; tiny residual colour cannot change classification appreciably.
      const metadata = qualityMaterialMetadata.get(original);
      material.colorNode = metadata?.kind === 'sea' ? vec3(metadata.foamNode) : original.colorNode ? original.colorNode.mul(0.000001).add(vec3(composite ? 1 : 0)) : vec3(composite ? 1 : 0);
      material.positionNode = original.positionNode ?? null;
      let opacity = uniform(original.opacity);
      if (original.map) opacity = opacity.mul(texture(original.map).a);
      if (original.alphaMap) opacity = opacity.mul(texture(original.alphaMap).g);
      material.opacityNode = qualityMaterialMetadata.get(original)?.kind === 'sea' ? uniform(1) : original.opacityNode ?? opacity;
    }
    material.fog = false; materials.add(material); maskMaterialCache.set(key, material);
    maskBindings.push({ source: original, target: material }); return material;
  }
  function disposeProxy() {
    if (disposed) return; disposed = true;
    for (const skeleton of [...proxySkeletons, ...maskSkeletons]) skeleton.dispose();
    for (const geometry of geometries) {
      geometry.dispose(); geometry.setIndex(null);
      for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
      geometry.morphAttributes = {}; // Owned view object only; borrowed BufferAttributes stay untouched.
    }
    for (const material of materials) material.dispose(); for (const texture of textures) texture.dispose();
    scene.traverse(o => { if (typeof o.dispose === 'function') o.dispose(); }); maskScene.traverse(o => { if (typeof o.dispose === 'function') o.dispose(); });
    scene.clear(); maskScene.clear(); scene.environment = null; maskScene.environment = null; scene.background = null; maskScene.background = null;
    // A retiring presentation may remain reachable while its replacement loads.
    // Release CPU geometry/BVH owners as well as their GPU allocations immediately.
    bindings.length = maskBindings.length = materialBindings.length = townWindows.length = 0;
    geometryCache.clear(); materialCache.clear(); maskMaterialCache.clear(); terrainColors.clear();
    geometries.clear(); materials.clear(); textures.clear(); proxySkeletons.clear(); maskSkeletons.clear();
  }
  try {
    pairObjects(source, scene, (original, proxy) => {
      bindings.push({ source: original, proxy, matrix: matrixKey(original), instanceVersion: original.instanceMatrix?.version, colorVersion: original.instanceColor?.version, geometryVersion: original.isMesh ? geometryRevision(original.geometry) : '' });
      if (original.isLight && (original.isHemisphereLight || original.isAmbientLight)) { proxy.removeFromParent(); return; }
      if (!original.isMesh) { if (original.isSprite || original.isLine || original.isPoints) proxy.removeFromParent(); return; }
      const list = Array.isArray(original.material) ? original.material : [original.material];
      const metadata = list.map(m => qualityMaterialMetadata.get(m));
      if (metadata.some(m => m?.kind === 'sky') || original.userData.harborComposite) { proxy.removeFromParent(); diagnostics.atmosphere++; return; }
      diagnostics.meshes++; diagnostics.instances += original.isInstancedMesh ? original.count : 1;
      if (original.isSkinnedMesh) diagnostics.skinned++;
      for (const m of metadata) if (m?.kind === 'terrain') diagnostics.terrain++; else if (m?.kind === 'building') diagnostics.buildings++; else if (m?.kind === 'room') diagnostics.rooms++; else if (m?.kind === 'sea') diagnostics.sea++;
      proxy.material = Array.isArray(original.material) ? list.map(m => convert(m, original)) : convert(list[0], original);
      proxy.geometry = convertedGeometry(original, metadata[0]);
      if (metadata[0]?.kind === 'room') {
        // The original room emissiveNode multiplies its warm glow by vertex colour.
        // These authored room parts have one colour per triangle: exact PBR material groups preserve it.
        const geometry = geometryView(proxy.geometry); geometries.add(geometry); geometry.clearGroups();
        const colors = geometry.getAttribute('color'), index = geometry.index, table = new Map(), roomMaterials = [];
        if (!colors) throw new Error('Room quality conversion requires original vertex colours');
        const start = geometry.drawRange.start, end = Math.min(index?.count ?? geometry.getAttribute('position').count, start + geometry.drawRange.count);
        let groupStart = start, last = -1;
        for (let i = start; i + 2 < end; i += 3) {
          const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
          const tint = ids.map(v => [colors.getX(v), colors.getY(v), colors.getZ(v)]), key = tint[0].join(',');
          if (tint.some(value => value.join(',') !== key)) throw new Error('Room quality conversion requires a constant authored colour per triangle');
          let next = table.get(key);
          if (next === undefined) {
            next = roomMaterials.length; const material = proxy.material.clone(), tintColor = new Color(...tint[0]);
            material.emissive.multiply(tintColor); materials.add(material); roomMaterials.push(material); table.set(key, next);
            materialBindings.push({ source: list[0], target: material, metadata: { kind: 'room', tintColor } });
          }
          if (next !== last) { if (last >= 0) geometry.addGroup(groupStart, i - groupStart, last); groupStart = i; last = next; }
        }
        if (last >= 0) geometry.addGroup(groupStart, end - groupStart, last);
        proxy.geometry = geometry; proxy.material = roomMaterials;
      }
      if (metadata[0]?.kind === 'town') {
        const windows = createTownQualityWindows(original, metadata[0].night);
        scene.add(windows.mesh); geometries.add(windows.geometry); windows.materials.forEach(m => materials.add(m)); townWindows.push(windows);
        diagnostics.windows += windows.geometry.getAttribute('position').count / 3;
      }
      const lit = original.geometry.getAttribute('lit');
      if (metadata[0]?.kind === 'building' && !metadata[0].ink && lit) {
        const base = proxy.material, glow = base.clone(); materials.add(glow);
        glow.emissive.setRGB(1, 0.76, 0.46); glow.emissiveIntensity = metadata[0].state.uNight.value * 1.1;
        materialBindings.push({ source: list[0], target: glow, metadata: { kind: 'window', state: metadata[0].state } });
        proxy.material = [base, glow];
        const geometry = geometryView(proxy.geometry); geometries.add(geometry); geometry.clearGroups();
        const index = geometry.index, count = index?.count ?? geometry.getAttribute('position').count;
        let groupStart = 0, last = -1;
        for (let i = 0; i < count; i += 3) {
          const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
          const values = ids.map(v => lit.getX(v));
          if (values.some(v => v !== values[0])) throw new Error('Window quality conversion requires a constant lit value per triangle');
          const next = values[0] > 0.5 ? 1 : 0;
          if (next !== last) { if (last >= 0) geometry.addGroup(groupStart, i - groupStart, last); groupStart = i; last = next; }
          if (next) diagnostics.windows++;
        }
        if (last >= 0) geometry.addGroup(groupStart, count - groupStart, last);
        proxy.geometry = geometry;
      }
    });
    // Pairing must finish before removals affect hierarchy traversal, hence clone independently for mask.
    pairObjects(source, maskScene, (original, mask) => {
      bindings.push({ source: original, proxy: mask, mask: true, matrix: matrixKey(original), instanceVersion: original.instanceMatrix?.version });
      if (original.isLight) { mask.removeFromParent(); return; }
      if (!(original.isMesh || original.isSprite || original.isLine || original.isPoints)) return;
      if (original.isPoints) throw new Error('Points need an explicit Dragon quality compositor conversion');
      const list = Array.isArray(original.material) ? original.material : [original.material];
      const composite = original.isSprite || original.isLine || original.userData.harborComposite || list.some(m => ['sky', 'sea'].includes(qualityMaterialMetadata.get(m)?.kind));
      mask.material = Array.isArray(original.material) ? list.map(m => maskMaterial(m, composite)) : maskMaterial(list[0], composite);
      mask.castShadow = false; mask.receiveShadow = false;
    });
    const bySource = new Map(bindings.filter(b => !b.mask).map(b => [b.source, b.proxy]));
    for (const { source: original, proxy, mask } of bindings) if (!mask && original.isDirectionalLight && bySource.has(original.target)) proxy.target = bySource.get(original.target);
    // A same-origin owned HDR environment. Visible sky remains the original TSL through the classification compositor.
    const width = 256, height = 128, data = new Float32Array(width * height * 4);
    const environment = new DataTexture(data, width, height, RGBAFormat, FloatType); environment.mapping = EquirectangularReflectionMapping;
    environment.minFilter = environment.magFilter = LinearFilter; textures.add(environment); scene.environment = environment;
    let environmentKey = '';
    function updateEnvironment() {
      const sky = options.context?.sky;
      const key = sky ? [sky.state.top, sky.state.hor, sky.state.sun, sky.state.night, ...sky.sunDir.toArray(), ...sky.moonDir.toArray(), sky.uni.sunSize.value, sky.uni.haze.value].join(',') : 'studio';
      if (key === environmentKey) return false;
      environmentKey = key;
      const top = new Color(sky?.state.top ?? 0xe9f4ff), horizon = new Color(sky?.state.hor ?? 0xa6becb), ground = new Color(0x596451), sun = new Color(sky?.state.sun ?? 0xffffff);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const phi = (x + 0.5) / width * Math.PI * 2 - Math.PI, theta = (y + 0.5) / height * Math.PI;
        const dir = new Vector3(-Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
        const c = dir.y >= 0 ? horizon.clone().lerp(top, Math.pow(dir.y, 0.42)) : horizon.clone().lerp(ground, Math.sqrt(-dir.y));
        if (sky) {
          const sd = Math.max(0, dir.dot(sky.sunDir)), low = 1 - smooth(0, 0.35, sky.sunDir.y), night = sky.state.night;
          c.add(sun.clone().multiplyScalar((Math.pow(sd, 6) * (low * 0.35 + 0.25) + Math.pow(sd, 80) * 0.5) * (1 - night * 0.8)));
          // Direct sun/moon energy is supplied exactly once by the scene's directional light.
          // Only diffuse atmospheric scatter belongs in the environment map.
          c.lerp(horizon, sky.uni.haze.value * 0.6);
        }
        const i = (y * width + x) * 4; data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; data[i + 3] = 1;
      }
      environment.needsUpdate = true; return true;
    }
    updateEnvironment();
    scene.updateMatrixWorld(true); maskScene.updateMatrixWorld(true);
    function sync() {
      if (disposed) throw new Error('Dragon quality proxy disposed');
      source.updateMatrixWorld(true);
      let transforms = false, lights = false, changedMaterials = false, topology = false;
      camera.updateMatrixWorld(true); const nextCamera = matrixKey(camera) + camera.projectionMatrix.elements.join(',');
      const cameraChanged = nextCamera !== cameraState; cameraState = nextCamera;
      const deformation = [];
      for (const b of bindings) {
        const original = b.source, proxy = b.proxy, nextMatrix = matrixKey(original);
        if (b.matrix !== nextMatrix || proxy.visible !== original.visible) {
          if (proxy.visible !== original.visible) topology = true;
          b.matrix = nextMatrix; proxy.position.copy(original.position); proxy.quaternion.copy(original.quaternion); proxy.scale.copy(original.scale); proxy.visible = original.visible;
          proxy.matrix.copy(original.matrix); proxy.matrixWorld.copy(original.matrixWorld); transforms = true;
        }
        if (original.isInstancedMesh && (b.instanceVersion !== original.instanceMatrix.version || proxy.count !== original.count)) {
          proxy.instanceMatrix.copy(original.instanceMatrix); proxy.instanceMatrix.needsUpdate = true; proxy.count = original.count; b.instanceVersion = original.instanceMatrix.version; transforms = true;
        }
        if (original.isInstancedMesh && original.instanceColor && b.colorVersion !== original.instanceColor.version) {
          if (!proxy.instanceColor) proxy.instanceColor = original.instanceColor.clone(); else proxy.instanceColor.copy(original.instanceColor);
          proxy.instanceColor.needsUpdate = true; b.colorVersion = original.instanceColor.version; transforms = true;
        }

        if (!b.mask && original.isLight) {
          if (proxy.intensity !== original.intensity || !proxy.color.equals(original.color)) { proxy.intensity = original.intensity; proxy.color.copy(original.color); lights = true; }
        }
      }
      for (const b of bindings) if (!b.mask && b.source.isMesh) {
        const geometryVersion = geometryRevision(b.source.geometry);
        if (geometryVersion !== b.geometryVersion) { b.geometryVersion = geometryVersion; deformation.push(b.proxy); }
        const metadata = qualityMaterialMetadata.get(Array.isArray(b.source.material) ? b.source.material[0] : b.source.material);
        if (metadata?.kind === 'building' && metadata.side) {
          const indices = buildingQualityIndex(b.source.geometry, metadata.state, metadata.side), old = b.proxy.geometry.index?.array;
          if (!old || old.length !== indices.length || indices.some((v, i) => v !== old[i])) {
            b.proxy.geometry.setIndex(new BufferAttribute(indices, 1)); b.proxy.geometry.setDrawRange(0, Infinity);
            const lit = b.source.geometry.getAttribute('lit');
            b.proxy.geometry.clearGroups();
            if (Array.isArray(b.proxy.material) && lit) {
              let groupStart = 0, last = -1;
              for (let i = 0; i < indices.length; i += 3) {
                const next = lit.getX(indices[i]) > 0.5 ? 1 : 0;
                if (next !== last) { if (last >= 0) b.proxy.geometry.addGroup(groupStart, i - groupStart, last); groupStart = i; last = next; }
              }
              if (last >= 0) b.proxy.geometry.addGroup(groupStart, indices.length - groupStart, last);
            }
            deformation.push(b.proxy);
          }
        }
        if (metadata?.kind === 'sea' && b.tide !== options.context.sea.tide) {
          b.tide = options.context.sea.tide;
          const old = b.proxy.geometry, next = createPhysicalSeaGeometry(b.source.geometry, options.context);
          b.proxy.geometry = next; geometries.add(next); geometries.delete(old); old.dispose(); topology = true;
        }
      }
      for (const b of materialBindings) {
        const next = b.metadata?.kind === 'window' ? b.metadata.state.uNight.value * 1.1 : b.source.emissiveIntensity ?? 1;
        if (b.target.emissiveIntensity !== next || b.target.opacity !== b.source.opacity) { b.target.emissiveIntensity = next; b.target.opacity = b.source.opacity; changedMaterials = true; }
        if (b.source.color && !(b.source.isMeshBasicMaterial || b.source.isMeshBasicNodeMaterial) && !b.metadata?.ink && !b.target.color.equals(b.source.color)) { b.target.color.copy(b.source.color); changedMaterials = true; }
        if (b.metadata?.kind !== 'window' && b.source.emissive) {
          const emissive = b.source.emissive.clone(); if (b.metadata?.tintColor) emissive.multiply(b.metadata.tintColor);
          if (!b.target.emissive.equals(emissive)) { b.target.emissive.copy(emissive); changedMaterials = true; }
        }
      }
      for (const windows of townWindows) changedMaterials = windows.update() || changedMaterials;
      for (const b of maskBindings) b.target.opacity = b.source.opacity;
      scene.updateMatrixWorld(true); maskScene.updateMatrixWorld(true);
      // Bone-only animation can leave the SkinnedMesh object's transform unchanged.
      for (const b of bindings) if (!b.mask && b.source.isSkinnedMesh) {
        const key = b.source.skeleton.bones.map(matrixKey).join('|');
        if (b.pose !== key) { b.pose = key; deformation.push(b.proxy); }
      }
      for (const skeleton of proxySkeletons) skeleton.update(); for (const skeleton of maskSkeletons) skeleton.update();
      return { camera: cameraChanged, transforms, lights, topology, materials: changedMaterials, environment: updateEnvironment(), geometry: deformation };
    }
    return { scene, camera, maskScene, diagnostics, sync, stale: () => initialTopology !== topologySignature(), dispose: disposeProxy };
  } catch (error) {
    diagnostics.unsupported.push(error.message);
    disposeProxy(); throw error;
  }
}
