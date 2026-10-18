import { Scene, PerspectiveCamera, Color, HemisphereLight, DirectionalLight, Mesh, PlaneGeometry, MeshStandardMaterial, GridHelper } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Actor } from '../../../src/characters/Actor';
import { Scope } from '../../../src/core/Scope';
import type { SaveGame } from '../../../src/core/SaveStore';
import type { SceneServices, SceneInstance } from '../../../src/world/types';
import { resetWorldUI } from '../../../src/ui/resetWorldUI';
import manifest from './manifest.json';

export async function loadStudio(services: SceneServices): Promise<SceneInstance> {
  const scope = new Scope();
  try {
    const handle = await services.assets.acquire<GLTF>('gltf', new URL(import.meta.env.BASE_URL + manifest.assets[0].url, location.href).href, services.signal);
    scope.defer(handle.release);
    const actor = new Actor('studio/mannequin', handle.value); scope.defer(() => actor.dispose());
    const scene = new Scene(); scene.background = new Color(0xa6becb);
    const camera = new PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100); camera.position.set(3, 2, 4); camera.lookAt(0, 0.9, 0);
    scene.add(new HemisphereLight(0xe9f4ff, 0x596451, 2));
    const light = new DirectionalLight(0xffe2bc, 3); light.position.set(3, 5, 2); light.castShadow = true; scene.add(light);
    const ground = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({ color: 0x778e89, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const grid = new GridHelper(20, 20, 0x69857c, 0x8ca39a); grid.position.y = 0.005; scene.add(grid);
    scope.defer(() => { ground.geometry.dispose(); ground.material.dispose(); grid.geometry.dispose(); (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(m => m.dispose()); light.shadow.dispose(); });
    actor.root.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(actor.root); actor.play('idle');
    let currentClip = 'idle';
    const result: SceneInstance = {
      id: manifest.id, scene, camera,
      enter() {
        resetWorldUI(); document.getElementById('title')!.classList.add('fade'); document.getElementById('hud')!.classList.remove('hidden');
        document.getElementById('place')!.textContent = '角色动作预览'; document.getElementById('clock')!.textContent = '';
        document.getElementById('help')!.classList.add('hidden');
        const panel = document.createElement('div'); panel.id = 'animation-controls'; panel.className = 'animation-controls';
        const labels: Record<string, string> = { idle: '待机', walk: '行走', run: '奔跑', sit: '坐下', wave: '挥手' };
        for (const clip of actor.clips) {
          const button = document.createElement('button'); button.textContent = labels[clip] ?? clip; button.dataset.clip = clip;
          scope.listen(button, 'click', () => { currentClip = clip; actor.play(clip, 0.25, clip === 'wave'); }); panel.append(button);
        }
        document.body.append(panel); scope.defer(() => { panel.remove(); document.getElementById('help')!.classList.remove('hidden'); });
      },
      update(dt) { actor.update(dt); },
      render() { services.renderer.render(scene, camera); },
      resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
      snapshot(): SaveGame { return { schemaVersion: 1, sceneId: manifest.id, mode: 'wander', player: { position: [0, 0, 0], yaw: 0, pitch: 0 }, environment: { hour: 12, rain: 0, fog: 0 } }; },
      restore(save) { if (save.sceneId !== manifest.id || save.mode !== 'wander') throw new Error('Invalid studio save'); },
      diagnostics() { return { sceneId: manifest.id, actors: 1, skinned: 1, clips: actor.clips, currentClip, skeletonBones: (actor.root.getObjectByName('mannequin') as any).skeleton.bones.length }; },
      dispose() { scope.dispose(); scene.traverse(object => object.dispose()); scene.clear(); },
    };
    return result;
  } catch (error) { scope.dispose(); throw error; }
}
