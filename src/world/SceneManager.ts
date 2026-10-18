import type { SceneDefinition, SceneInstance, SceneServices } from './types';

/** Latest request wins. A failed or cancelled load never destroys the current scene. */
export class SceneManager {
  private definitions = new Map<string, SceneDefinition>();
  private pending?: AbortController;
  private generation = 0;
  private closed = false;
  current?: SceneInstance;
  constructor(private services: Omit<SceneServices, 'signal'>) {}
  register(definition: SceneDefinition) {
    const id = definition.manifest.id;
    if (this.definitions.has(id)) throw new Error(`Duplicate scene: ${id}`);
    this.definitions.set(id, definition);
  }
  list() { return [...this.definitions.values()].map(d => d.manifest); }
  async switchTo(id: string, save?: Parameters<SceneInstance['restore']>[0]) {
    if (this.closed) throw new Error('Scene manager disposed');
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown scene: ${id}`);
    this.pending?.abort();
    const controller = this.pending = new AbortController();
    const generation = ++this.generation;
    let next: SceneInstance | undefined;
    try {
      next = await definition.load({ ...this.services, signal: controller.signal });
      controller.signal.throwIfAborted();
      if (generation !== this.generation) throw new DOMException('Superseded', 'AbortError');
      if (save) next.restore(save);
    } catch (error) { next?.dispose(); if (controller.signal.aborted) return false; throw error; }
    const previous = this.current;
    this.current = next;
    try { previous?.dispose(); } finally { next.enter(); }
    if (this.pending === controller) this.pending = undefined;
    return true;
  }
  dispose() {
    this.closed = true; this.generation++; this.pending?.abort(); this.pending = undefined;
    const current = this.current; this.current = undefined; current?.dispose();
  }
}
