export interface SaveGame {
  schemaVersion: 1;
  sceneId: string;
  mode: 'wander' | 'story';
  player: { position: [number, number, number]; yaw: number; pitch: number };
  environment: { hour: number; rain: number; fog: number };
  story?: { chapterId: string; beatId: string };
}
export function validateSave(value: unknown): SaveGame {
  const s = value as SaveGame;
  if (!s || s.schemaVersion !== 1 || typeof s.sceneId !== 'string' || !/^[a-z0-9-]+$/.test(s.sceneId) || !['wander', 'story'].includes(s.mode)) throw new Error('Unsupported or invalid save');
  if (!s.player || !Array.isArray(s.player.position) || s.player.position.length !== 3 || ![...s.player.position, s.player.yaw, s.player.pitch].every(Number.isFinite)) throw new Error('Invalid player state');
  const e = s.environment;
  if (!e || ![e.hour, e.rain, e.fog].every(Number.isFinite) || e.hour < 0 || e.hour >= 24 || e.rain < 0 || e.rain > 1 || e.fog < 0 || e.fog > 1) throw new Error('Invalid environment');
  if (s.mode === 'story' && (!s.story || typeof s.story.chapterId !== 'string' || typeof s.story.beatId !== 'string')) throw new Error('Missing story checkpoint');
  return structuredClone(s);
}
export class SaveStore {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>, private key = 'dragon-raja.save.v1') {}
  write(save: SaveGame) { this.storage.setItem(this.key, JSON.stringify(validateSave(save))); }
  read(): SaveGame | undefined { const text = this.storage.getItem(this.key); return text === null ? undefined : validateSave(JSON.parse(text)); }
}
