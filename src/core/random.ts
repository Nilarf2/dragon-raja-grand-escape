/** Independent deterministic streams, unaffected by other scene load order. */
export function randomStream(seed: number | string) {
  let state = typeof seed === 'number' ? seed >>> 0 : [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
