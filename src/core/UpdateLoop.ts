export class UpdateLoop {
  private callbacks = new Set<(dt: number, time: number) => void>();
  private handle = 0;
  private previous = 0;
  private running = false;
  time = 0;
  add(callback: (dt: number, time: number) => void) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  step(dt: number) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid timestep');
    this.time += dt;
    for (const callback of this.callbacks) callback(dt, this.time);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.previous = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(Math.max((now - this.previous) / 1000, 0), 0.1);
      this.previous = now;
      this.step(dt);
      this.handle = requestAnimationFrame(frame);
    };
    this.handle = requestAnimationFrame(frame);
  }
  stop() { this.running = false; cancelAnimationFrame(this.handle); }
  dispose() { this.stop(); this.callbacks.clear(); }
}
