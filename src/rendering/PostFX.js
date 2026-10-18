import { RenderPipeline, Color, Vector2, Vector3 } from 'three/webgpu';
import { pass, mrt, output, normalView, uniform, vec2, vec3, vec4, uv, mix, dot, clamp, smoothstep, fract, sin } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { ambientOcclusion, reflections, sunShafts, heightFog } from './effects.js';
import { PRESETS } from './presets.js';

export class PostFX {
  constructor(renderer, scene, camera, options = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.enabled = options.enabled ?? true; this.tier = ['off', 'low', 'high'].includes(options.tier) ? options.tier : 'high';
    this.params = { ...PRESETS.day }; this.target = PRESETS.day; this.rate = 1;
    this.uniforms = Object.fromEntries(Object.entries(this.params).map(([k, v]) => [k, uniform(v)]));
    Object.assign(this.uniforms, { time: uniform(0), tide: uniform(0), rain: uniform(0), sunUV: uniform(new Vector2(0.5, 0.5)),
      sunColor: uniform(new Color()), sunVisibility: uniform(0), fogColor: uniform(new Color()), fogDensity: uniform(0.0012), cameraY: uniform(0) });
    this.effects = [];
    this.pipeline = new RenderPipeline(renderer);
    this.build();
  }
  build() {
    for (const effect of this.effects) effect.dispose(); this.effects = [];
    this.pass?.dispose();
    // GTAO/SSR sample depth; multisampled depth cannot be gathered in WGSL.
    // Use a single-sample G-buffer and apply SMAA after the lighting/effects instead.
    const scenePass = this.pass = pass(this.scene, this.camera, { samples: 0 });
    scenePass.setMRT(mrt({ output, normal: normalView }));
    const color = scenePass.getTextureNode('output'), depth = scenePass.getTextureNode('depth'), normals = scenePass.getTextureNode('normal');
    const u = this.uniforms;
    let result = color.rgb;
    if (this.tier !== 'off') {
      const ao = ambientOcclusion(depth, normals, this.camera, this.tier); this.effects.push(ao);
      result = result.mul(mix(vec3(1), mix(vec3(0.5, 0.47, 0.66), vec3(1), ao.getTextureNode().r), u.ao));
      if (this.tier === 'high') {
        const { effect, mask } = reflections(color, depth, normals, this.camera, u); this.effects.push(effect);
        result = mix(result, effect.rgb, clamp(effect.a.mul(u.ssr).mul(mask), 0, 0.85));
      }
      result = mix(result, u.fogColor, heightFog(depth, this.camera, u).mul(u.hfog));
      result = result.add(sunShafts(depth, u).mul(u.rays).mul(0.55));
    }
    const glow = this.bloom = bloom(color, this.params.bloom, 0.5, this.params.thresh); this.effects.push(glow);
    result = result.add(glow.rgb).mul(u.exposure);
    const luminance = dot(result, vec3(0.2126, 0.7152, 0.0722));
    result = mix(vec3(luminance), result, u.sat).mul(vec3(u.warm.mul(0.2).add(1), 1, u.warm.mul(-0.2).add(1)));
    result = result.add(vec3(u.lift.mul(0.6), u.lift.mul(0.45), u.lift).mul(uniform(1).sub(smoothstep(0, 0.5, luminance))));
    result = mix(result, vec3(dot(result, vec3(0.33))).mul(vec3(1.08, 1, 0.86)).add(0.04), u.memory.mul(0.45));
    const radius = uv().sub(0.5).length();
    result = result.mul(uniform(1).sub(smoothstep(0.2, 0.7, radius).mul(u.vig)));
    const grain = fract(sin(dot(uv().mul(1000).add(u.time), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(u.memory.mul(0.03).add(0.008));
    const finalColor = vec4(result.add(grain), 1);
    if (this.renderer.samples > 0) {
      const antialias = smaa(finalColor);
      this.effects.push(antialias.textureNode, antialias);
      this.pipeline.outputNode = antialias;
    } else this.pipeline.outputNode = finalColor;
    this.pipeline.needsUpdate = true;
  }
  setTier(tier) { if (!['off', 'low', 'high'].includes(tier)) throw new Error('Unknown effects tier'); if (tier !== this.tier) { this.tier = tier; this.build(); } }
  setSize() { /* PassNode follows renderer size and pixel ratio. */ }
  preset(name, seconds = 2) { this.name = name; this.target = PRESETS[name] ?? PRESETS.day; this.rate = seconds > 0 ? 1 / seconds : 1e6; }
  update(dt, environment) {
    for (const key of Object.keys(this.target)) { this.params[key] += (this.target[key] - this.params[key]) * Math.min(1, dt * this.rate * 3); this.uniforms[key].value = this.params[key]; }
    this.bloom.strength.value = this.params.bloom; this.bloom.threshold.value = this.params.thresh;
    if (environment) {
      const { sky, sea, weather } = environment, u = this.uniforms;
      u.rain.value = weather.rain; u.tide.value = sea.tide; u.cameraY.value = this.camera.position.y;
      u.fogDensity.value = 0.0012 + sky.fogExtra * 4;
      u.fogColor.value.set(sky.state.hor); u.sunColor.value.set(sky.state.sun);
      const p = sky.sunDir.clone().multiplyScalar(1000).add(this.camera.position).project(this.camera);
      u.sunUV.value.set(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
      const forward = this.camera.getWorldDirection(new Vector3());
      u.sunVisibility.value = Math.max(0, forward.dot(sky.sunDir)) * Math.max(0, Math.min(1, sky.sunDir.y * 20)) * (1 - sky.state.night) * (1 - weather.rain);
    }
  }
  render(time = 0) { this.uniforms.time.value = time; if (this.enabled) this.pipeline.render(); else this.renderer.render(this.scene, this.camera); }
  dispose() { this.pipeline.dispose(); for (const effect of this.effects) effect.dispose(); this.pass.dispose(); this.effects = []; }
  static autoPreset(hour, rain) { return rain > 0.3 ? 'rain' : hour < 6 || hour >= 19.6 ? 'night' : hour < 16.8 ? 'day' : hour < 18.2 ? 'golden' : hour < 19 ? 'sunset' : 'dusk'; }
}
