export interface Rect { x: number; z: number; hw: number; hd: number; c: number; s: number }
/** Broad phase in world space; exact oriented rectangle test remains in the caller. */
export class SpatialIndex<T extends Rect> {
  private cells = new Map<string, Set<T>>();
  private keys = new Map<T, string[]>();
  constructor(readonly cellSize = 32) { if (!(cellSize > 0)) throw new Error('Invalid cell size'); }
  private range(x: number, z: number, rx: number, rz = rx) {
    return [Math.floor((x - rx) / this.cellSize), Math.floor((x + rx) / this.cellSize), Math.floor((z - rz) / this.cellSize), Math.floor((z + rz) / this.cellSize)];
  }
  add(rect: T) {
    this.remove(rect);
    const rx = Math.abs(rect.c) * rect.hw + Math.abs(rect.s) * rect.hd;
    const rz = Math.abs(rect.s) * rect.hw + Math.abs(rect.c) * rect.hd;
    const [x0, x1, z0, z1] = this.range(rect.x, rect.z, rx, rz), keys: string[] = [];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const key = `${x},${z}`; let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, cell = new Set()); cell.add(rect); keys.push(key);
    }
    this.keys.set(rect, keys);
    return () => this.remove(rect);
  }
  remove(rect: T) {
    for (const key of this.keys.get(rect) ?? []) { const cell = this.cells.get(key)!; cell.delete(rect); if (!cell.size) this.cells.delete(key); }
    this.keys.delete(rect);
  }
  query(x: number, z: number, radius = 0): Set<T> {
    const [x0, x1, z0, z1] = this.range(x, z, radius), result = new Set<T>();
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) for (const rect of this.cells.get(`${i},${j}`) ?? []) result.add(rect);
    return result;
  }
  clear() { this.cells.clear(); this.keys.clear(); }
  get size() { return this.keys.size; }
}
