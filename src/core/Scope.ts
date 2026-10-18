/** Owns a lifetime. Disposal is idempotent, reverse ordered, and attempts every cleanup. */
export class Scope {
  readonly controller = new AbortController();
  private cleanups = new Set<() => void>();
  get signal() { return this.controller.signal; }
  get disposed() { return this.signal.aborted; }
  get size() { return this.cleanups.size; }

  defer(cleanup: () => void): () => void {
    if (this.disposed) { cleanup(); return () => {}; }
    let live = true;
    const once = () => { if (!live) return; live = false; this.cleanups.delete(once); cleanup(); };
    this.cleanups.add(once);
    return once;
  }

  listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, handler, options);
    return this.defer(() => target.removeEventListener(type, handler, options));
  }

  dispose() {
    if (this.disposed) return;
    this.controller.abort();
    const errors: unknown[] = [];
    for (const cleanup of [...this.cleanups].reverse()) { try { cleanup(); } catch (e) { errors.push(e); } }
    this.cleanups.clear();
    if (errors.length) throw new AggregateError(errors, 'Resource cleanup failed');
  }
}
