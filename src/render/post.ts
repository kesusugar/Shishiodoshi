import * as THREE from 'three';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

/**
 * Screen effects (PLAN.md 6章). For now: a shallow depth of field like ref2, focused on the orbit
 * target, then tone mapping and sRGB output. More (bloom, TAA) comes in P5.
 */
export class Post {
  private readonly composer: EffectComposer;
  private readonly bokeh: BokehPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bokeh = new BokehPass(scene, camera, { focus: 1, aperture: 0.004, maxblur: 0.01 });
    this.composer.addPass(this.bokeh);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(focusPoint: THREE.Vector3): void {
    // BokehPass measures focus as a view-space depth
    const toFocus = focusPoint.clone().sub(this.camera.position);
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    (this.bokeh.uniforms as Record<string, THREE.IUniform>).focus.value = toFocus.dot(forward);
    this.composer.render();
  }
}
