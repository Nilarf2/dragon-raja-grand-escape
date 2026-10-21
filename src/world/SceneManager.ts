import { SceneManager as HarborSceneManager } from '@harbor/engine/application';
import type { SceneServices, SceneManifest } from './types';
import type { SaveGame } from '../core/SaveStore';

/** Content types only: scene cancellation, transactions and ownership belong to Harbor. */
export class SceneManager extends HarborSceneManager<Omit<SceneServices, 'signal' | 'scope'>, SaveGame, SceneManifest> {}
