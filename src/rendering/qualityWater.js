import { BufferGeometry, Float32BufferAttribute, DataTexture, RGBAFormat, UnsignedByteType, RepeatWrapping, LinearFilter, DataUtils } from 'three/webgpu';

const terrainCache = new WeakMap();
function sampleGrid(grid, values, x, z) {
  const fx = Math.max(0, Math.min(grid.nx - 1.001, (x - grid.x0) / grid.dx)), fz = Math.max(0, Math.min(grid.nz - 1.001, (z - grid.z0) / grid.dx));
  const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, i = iz * grid.nx + ix;
  return (values[i] * (1 - u) + values[i + 1] * u) * (1 - v) + (values[i + grid.nx] * (1 - u) + values[i + grid.nx + 1] * u) * v;
}
function intersection(a, b) {
  const r = { x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), z0: Math.max(a.z0, b.z0), z1: Math.min(a.z1, b.z1) };
  return r.x0 <= r.x1 && r.z0 <= r.z1 ? r : null;
}
function subtract(rect, cut) {
  const i = intersection(rect, cut); if (!i) return [rect];
  return [ { ...rect, x1: i.x0 }, { ...rect, x0: i.x1 }, { x0: i.x0, x1: i.x1, z0: rect.z0, z1: i.z0 }, { x0: i.x0, x1: i.x1, z0: i.z1, z1: rect.z1 } ].filter(r => r.x1 > r.x0 && r.z1 > r.z0);
}
function makeGrid(grid, sourceValues) {
  // Match seaMaterial's half-float, [-60,60] height texture, rather than an unquantized DEM.
  const values = Float32Array.from(sourceValues, v => DataUtils.fromHalfFloat(DataUtils.toHalfFloat(Math.max(-60, Math.min(60, v)))));
  const rect = { x0: grid.x0 - grid.dx / 2, x1: grid.x0 + (grid.nx - 0.5) * grid.dx, z0: grid.z0 - grid.dx / 2, z1: grid.z0 + (grid.nz - 0.5) * grid.dx };
  function build(x0, z0, x1, z1) {
    const node = { x0, z0, x1, z1, min: Infinity, max: -Infinity };
    if (x1 - x0 <= 8 && z1 - z0 <= 8) {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const v = values[z * grid.nx + x]; node.min = Math.min(node.min, v); node.max = Math.max(node.max, v); }
    } else {
      const mx = Math.floor((x0 + x1) / 2), mz = Math.floor((z0 + z1) / 2);
      node.children = [[x0, z0, mx, mz], [mx + 1, z0, x1, mz], [x0, mz + 1, mx, z1], [mx + 1, mz + 1, x1, z1]].filter(([a,b,c,d]) => a <= c && b <= d).map(v => build(...v));
      for (const c of node.children) { node.min = Math.min(node.min, c.min); node.max = Math.max(node.max, c.max); }
    }
    return node;
  }
  const root = build(0, 0, grid.nx - 1, grid.nz - 1);
  function bounds(area, precise) {
    if (precise) {
      // A bilinear cell's extrema on a rectangle are at its corners. Include every cell boundary.
      const xs = [area.x0, area.x1], zs = [area.z0, area.z1];
      for (let i = Math.ceil((area.x0 - grid.x0) / grid.dx); grid.x0 + i * grid.dx < area.x1; i++) xs.push(grid.x0 + i * grid.dx);
      for (let i = Math.ceil((area.z0 - grid.z0) / grid.dx); grid.z0 + i * grid.dx < area.z1; i++) zs.push(grid.z0 + i * grid.dx);
      let min = Infinity, max = -Infinity;
      for (const x of xs) for (const z of zs) { const h = sampleGrid(grid, values, x, z); min = Math.min(min, h); max = Math.max(max, h); }
      return { min, max };
    }
    const x0 = Math.max(0, Math.floor((area.x0 - grid.x0) / grid.dx)), x1 = Math.min(grid.nx - 1, Math.ceil((area.x1 - grid.x0) / grid.dx));
    const z0 = Math.max(0, Math.floor((area.z0 - grid.z0) / grid.dx)), z1 = Math.min(grid.nz - 1, Math.ceil((area.z1 - grid.z0) / grid.dx));
    let min = Infinity, max = -Infinity;
    function query(n) {
      if (n.x1 < x0 || n.x0 > x1 || n.z1 < z0 || n.z0 > z1) return;
      if (x0 <= n.x0 && x1 >= n.x1 && z0 <= n.z0 && z1 >= n.z1) { min = Math.min(min, n.min); max = Math.max(max, n.max); }
      else if (n.children) n.children.forEach(query);
      else for (let z = Math.max(z0,n.z0); z <= Math.min(z1,n.z1); z++) for (let x = Math.max(x0,n.x0); x <= Math.min(x1,n.x1); x++) { const v = values[z * grid.nx + x]; min = Math.min(min,v); max = Math.max(max,v); }
    }
    query(root); return { min, max };
  }
  return { grid, values, rect, bounds };
}
function terrain(context) {
  let value = terrainCache.get(context.terrainGrid); if (value) return value;
  const g = context.terrainGrid; if (!g) throw new Error('Physical sea requires original terrain grids');
  value = { near: makeGrid(g.near, g.nearH), far: makeGrid(g.far, g.farH) }; terrainCache.set(g, value); return value;
}
export function seaGroundHeight(context, x, z) {
  const g = terrain(context);
  for (const item of [g.near, g.far]) if (x >= item.rect.x0 && x <= item.rect.x1 && z >= item.rect.z0 && z <= item.rect.z1) return sampleGrid(item.grid, item.values, x, z);
  return -40;
}
function heightBounds(terrain, area, precise = false) {
  const pieces = [], near = intersection(area, terrain.near.rect), far = intersection(area, terrain.far.rect);
  if (near) pieces.push({ item: terrain.near, area: near });
  if (far) for (const r of subtract(far, terrain.near.rect)) pieces.push({ item: terrain.far, area: r });
  let min = Infinity, max = -Infinity, covered = 0;
  for (const p of pieces) { const b = p.item.bounds(p.area, precise); min = Math.min(min,b.min); max = Math.max(max,b.max); covered += (p.area.x1-p.area.x0)*(p.area.z1-p.area.z0); }
  if (!pieces.length || covered < (area.x1-area.x0)*(area.z1-area.z0) - 0.00001) { min = Math.min(min,-40); max = Math.max(max,-40); }
  return { min,max };
}

/** Conservative coastline clipping: an emitted triangle's complete AABB must stay wet. */
export function createPhysicalSeaGeometry(source, context) {
  const surface = terrain(context), tide = context.sea.tide, threshold = tide + 0.02, position = source.getAttribute('position'), index = source.index;
  const pos = [], uv = [], nor = [];
  function emit(vertices) { for (const p of vertices) { pos.push(...p); nor.push(0,1,0); uv.push(p[0]/64,p[2]/64); } }
  function split(vertices, level = 0) {
    const xs = vertices.map(p=>p[0]), zs = vertices.map(p=>p[2]);
    const area = { x0: Math.min(...xs),x1: Math.max(...xs),z0: Math.min(...zs),z1: Math.max(...zs) };
    const bound = heightBounds(surface,area);
    if (bound.max <= threshold) { emit(vertices); return; }
    if (bound.min > threshold) return;
    const near = intersection(area,surface.near.rect), cell = near ? surface.near.grid.dx : surface.far.grid.dx;
    const edge = Math.max(...vertices.map((a,i)=>Math.hypot(a[0]-vertices[(i+1)%3][0],a[2]-vertices[(i+1)%3][2])));
    if (edge <= cell / 8) {
      const exact = heightBounds(surface,area,true);
      if (exact.max <= threshold) emit(vertices);
      // At the boundary keep a conservative <1/8-cell strip dry; never let water bridge an island.
      return;
    }
    if (level > 24) throw new Error('Water coastline subdivision exceeded its bounded precision');
    const mids = vertices.map((a,i)=>a.map((v,j)=>(v+vertices[(i+1)%3][j])/2));
    split([vertices[0],mids[0],mids[2]],level+1); split([mids[0],vertices[1],mids[1]],level+1);
    split([mids[2],mids[1],vertices[2]],level+1); split([mids[0],mids[1],mids[2]],level+1);
  }
  const start=source.drawRange.start,end=Math.min(index?.count??position.count,start+source.drawRange.count);
  for(let i=start;i+2<end;i+=3)split([0,1,2].map(j=>{const k=index?index.getX(i+j):i+j;return[position.getX(k),position.getY(k),position.getZ(k)];}));
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(pos,3));geometry.setAttribute('normal',new Float32BufferAttribute(nor,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
  return geometry;
}

export function createWaterNormalMap(time = 0) {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    // A seamless physical normal field, independent of raster-only sun glitter.
    let nx = Math.sin(u * 7 + v * 3 + time * 0.8) * 0.1 + Math.cos(u * 17 - v * 11 + time * 1.3) * 0.055;
    let ny = Math.cos(v * 9 - u * 4 + time * 0.6) * 0.1 + Math.sin(v * 19 + u * 13 + time) * 0.045;
    const nz = 1, length = Math.hypot(nx, ny, nz), i = (y * size + x) * 4;
    data[i] = (nx / length * 0.5 + 0.5) * 255; data[i + 1] = (ny / length * 0.5 + 0.5) * 255; data[i + 2] = (nz / length * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType); texture.wrapS = texture.wrapT = RepeatWrapping; texture.minFilter = texture.magFilter = LinearFilter; texture.needsUpdate = true; return texture;
}
