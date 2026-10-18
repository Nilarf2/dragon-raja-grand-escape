export type StoryYield = number | (() => boolean);
export interface StoryBeat { id: string; run(): Generator<StoryYield, void, unknown> }

/** Content executes through commands, while the runner owns progression and checkpoints. */
export class StoryRunner {
  private iterator?: Generator<StoryYield, void, unknown>;
  private wait = 0;
  private predicate?: () => boolean;
  private index = -1;
  constructor(readonly beats: StoryBeat[], private changed: () => void = () => {}, private completed: () => void = () => {}) {
    if (!beats.length || new Set(beats.map(b => b.id)).size !== beats.length) throw new Error('Story needs unique beat IDs');
  }
  get active() { return !!this.iterator; }
  get checkpoint() { return this.beats[this.index]?.id; }
  start(id = this.beats[0].id) {
    const i = this.beats.findIndex(b => b.id === id);
    if (i < 0) throw new Error(`Unknown story beat: ${id}`);
    this.stop(); this.index = i; this.begin();
  }
  private begin() { this.wait = 0; this.predicate = undefined; this.changed(); this.iterator = this.beats[this.index].run(); }
  next() {
    if (!this.iterator) return;
    this.iterator?.return(); this.iterator = undefined;
    if (++this.index >= this.beats.length) { this.completed(); return; }
    this.begin();
  }
  update(dt: number) {
    if (!this.iterator) return;
    if ((this.wait -= dt) > 0) return;
    if (this.predicate && !this.predicate()) return;
    this.predicate = undefined;
    const step = this.iterator.next();
    if (step.done) this.next();
    else if (typeof step.value === 'number') this.wait = Math.max(0, step.value);
    else if (typeof step.value === 'function') this.predicate = step.value;
  }
  stop() { this.iterator?.return(); this.iterator = undefined; this.wait = 0; this.predicate = undefined; }
}
