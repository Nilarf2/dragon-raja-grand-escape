import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Vector3, Matrix3 } from 'three/webgpu';

const fract = n => n - Math.floor(n);
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
/** Clip a convex world-space polygon, retaining interpolated vertex colour. */
function clip(vertices, value, threshold, above) {
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length], da = value(a) - threshold, db = value(b) - threshold;
    const insideA = above ? da >= -1e-7 : da <= 1e-7, insideB = above ? db >= -1e-7 : db <= 1e-7;
    if (insideA) result.push(a);
    if (insideA !== insideB) { const f = da / (da - db); result.push({ p: a.p.clone().lerp(b.p, f), c: a.c.map((v, j) => v + (b.c[j] - v) * f) }); }
  }
  return result;
}
function rectangle(vertices, u, v, u0, u1, v0, v1) {
  let result = clip(vertices, u, u0, true); if (!result.length) return result;
  result = clip(result, u, u1, false); if (!result.length) return result;
  result = clip(result, v, v0, true); if (!result.length) return result;
  return clip(result, v, v1, false);
}

/** Converts townMaterial's exact procedural window rectangles into physical surfaces. */
export function createTownQualityWindows(object, night) {
  const source = object.geometry, positions = source.getAttribute('position'), normals = source.getAttribute('normal'), colors = source.getAttribute('color'), index = source.index;
  if (!positions || !normals) throw new Error('Town windows need position and normal attributes');
  const normalMatrix = new Matrix3().getNormalMatrix(object.matrixWorld), geometry = new BufferGeometry();
  const pos = [], nor = [], col = [], groups = [];
  const start = source.drawRange.start, end = Math.min(index?.count ?? positions.count, start + source.drawRange.count);
  for (let i = start; i + 2 < end; i += 3) {
    const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
    const n = new Vector3().fromBufferAttribute(normals, ids[0]).applyMatrix3(normalMatrix).normalize();
    if (Math.abs(n.y) > 0.4) continue;
    const tangent = new Vector3(-n.z + 0.000001, 0, n.x + 0.000001).normalize();
    const vertices = ids.map(id => ({ p: new Vector3().fromBufferAttribute(positions, id).applyMatrix4(object.matrixWorld), c: colors ? [colors.getX(id), colors.getY(id), colors.getZ(id)] : [1, 1, 1] }));
    const u = a => a.p.dot(tangent) / 2.7, v = a => (a.p.y - 1) / 3;
    const us = vertices.map(u), vs = vertices.map(v);
    for (let row = Math.max(0, Math.floor(Math.min(...vs))); row <= Math.floor(Math.max(...vs)); row++) for (let column = Math.floor(Math.min(...us)); column <= Math.floor(Math.max(...us)); column++) {
      const window = rectangle(vertices, u, v, column + 0.22, column + 0.78, row + 0.3, row + 0.74);
      if (window.length < 3) continue;
      // Original random light mask changes at world-space 1/0.3-m cells; keep those boundaries too.
      const xs = window.map(a => a.p.x * 0.3), zs = window.map(a => a.p.z * 0.3), ys = window.map(a => a.p.y / 3);
      for (let hx = Math.floor(Math.min(...xs)); hx <= Math.floor(Math.max(...xs)); hx++) for (let hz = Math.floor(Math.min(...zs)); hz <= Math.floor(Math.max(...zs)); hz++) for (let hy = Math.floor(Math.min(...ys)); hy <= Math.floor(Math.max(...ys)); hy++) {
        let polygon = rectangle(window, a => a.p.x * 0.3, a => a.p.z * 0.3, hx, hx + 1, hz, hz + 1);
        if (polygon.length < 3) continue;
        polygon = clip(polygon, a => a.p.y / 3, hy, true); if (polygon.length < 3) continue;
        polygon = clip(polygon, a => a.p.y / 3, hy + 1, false); if (polygon.length < 3) continue;
        const lit = hash(hx + hy, hz + hy) >= 0.6 ? 1 : 0, groupStart = pos.length / 3;
        for (let j = 1; j + 1 < polygon.length; j++) for (const vertex of [polygon[0], polygon[j], polygon[j + 1]]) {
          pos.push(vertex.p.x + n.x * 0.001, vertex.p.y + n.y * 0.001, vertex.p.z + n.z * 0.001); nor.push(n.x, n.y, n.z);
          col.push(...vertex.c.map((c, k) => c * 0.1 + [0.2, 0.25, 0.3][k] * 0.9));
        }
        const count = pos.length / 3 - groupStart;
        if (count) { const last = groups.at(-1); if (last && last.materialIndex === lit && last.start + last.count === groupStart) last.count += count; else groups.push({ start: groupStart, count, materialIndex: lit }); }
      }
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3)); geometry.setAttribute('normal', new Float32BufferAttribute(nor, 3)); geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  for (const g of groups) geometry.addGroup(g.start, g.count, g.materialIndex);
  const dark = new MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }), lit = dark.clone(); lit.emissive.setRGB(1, 0.78, 0.5); lit.emissiveIntensity = night.value * 0.9;
  const mesh = new Mesh(geometry, [dark, lit]); mesh.name = 'Procedural town windows / physical surfaces';
  return { mesh, geometry, materials: [dark, lit], update() { const next = night.value * 0.9; if (next === lit.emissiveIntensity) return false; lit.emissiveIntensity = next; return true; } };
}
