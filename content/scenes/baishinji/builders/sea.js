import { seaMaterial } from '../../../../src/rendering/materials.js';
export function installSea(C) {
  const THREE = C.THREE;
// Seto Inland Sea: anime water whose colour and shore foam come from the real depth (terrain grid),
// a sun-glitter road, and a mirror of the sun disc near the horizon (so at sunset half a sun + its reflection = a circle).

  const T = THREE;

  // signed ground height (m) as a half-float texture: the sea skips pixels over land (no z-fighting at the shore)
  function heightTexture(g, H) {
    const data = new Uint16Array(g.nx * g.nz);
    for (let i = 0; i < data.length; i++) data[i] = T.DataUtils.toHalfFloat(C.clamp(H[i], -60, 60));
    const t = new T.DataTexture(data, g.nx, g.nz, T.RedFormat, T.HalfFloatType);
    t.magFilter = t.minFilter = T.LinearFilter; t.needsUpdate = true;
    return t;
  }

  C.Sea = function (scene) {
    const g = C.terrainGrid.near;
    this.tide = 0;
    this.uni = {
      time: { value: 0 }, sunDir: { value: new T.Vector3(0, 1, 0) }, lightCol: { value: new T.Color(1, 1, 1) },
      hor: { value: new T.Color() }, top: { value: new T.Color() }, night: { value: 0 }, tide: { value: 0 },
      deep: { value: new T.Color(0x1d5f9c) }, shallow: { value: new T.Color(0x3fb0bd) }, sunSize: { value: 0.99985 },
      hNear: { value: null }, hFar: { value: null },
      rNear: { value: new T.Vector4(g.x0 - g.dx / 2, g.z0 - g.dx / 2, g.nx * g.dx, g.nz * g.dx) },
      rFar: { value: new T.Vector4(C.terrainGrid.far.x0 - C.terrainGrid.far.dx / 2, C.terrainGrid.far.z0 - C.terrainGrid.far.dx / 2, C.terrainGrid.far.nx * C.terrainGrid.far.dx, C.terrainGrid.far.nz * C.terrainGrid.far.dx) },
      calm: { value: 0 },
      mark: { value: 1 },   // alpha written into the scene target: 0.5 marks the sea for screen-space reflections (fx_rt.js)
    };
    this.uni.hNear.value = heightTexture(g, C.terrainGrid.nearH);
    this.uni.hFar.value = heightTexture(C.terrainGrid.far, C.terrainGrid.farH);
    // (no polygonOffset here: near the horizon it would pull the sea hundreds of metres forward, over low islands;
    //  terrain.js sinks the far seabed instead so it can't z-fight with the surface)
    const mat = seaMaterial(T, this.uni);
    // subdivided (huge triangles lose depth precision and let the sea bleed through low land): dense near the town
    const ax = []; for (let v = 0, d = 25; v < 30000; v += d, d *= 1.12) ax.push(v);
    const xs = ax.slice(1).reverse().map(v => -v).concat(ax), n = xs.length, pos = [], idx = [];
    for (const z of xs) for (const x of xs) pos.push(x, 0, z);
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) { const a = i * n + j, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    this.mesh = new T.Mesh(geo, mat);
    scene.add(this.mesh);
  };

  C.Sea.prototype.update = function (t, sky) {
    const u = this.uni;
    u.time.value = t; u.night.value = sky.state.night; u.tide.value = this.tide;
    this.mesh.position.y = this.tide;
    u.sunDir.value.copy(sky.sunDir.y > -0.03 ? sky.sunDir : sky.moonDir);
    u.lightCol.value.set(sky.state.sun).multiplyScalar(sky.sunDir.y > -0.03 ? 1 : 0.5);
    u.hor.value.set(sky.state.hor); u.top.value.set(sky.state.top);
    u.sunSize.value = sky.uni.sunSize.value;
  };


}
