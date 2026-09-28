import * as THREE from 'three';

/**
 * Screen effects (PLAN.md 6章). The scene is drawn once into a floating-point target with a depth
 * texture; one full-screen pass then applies a shallow depth of field like ref2 and the tone mapping.
 *
 * Depth of field: the blur circle of a thin lens, c = A |1/f - 1/z| (in screen units), gathered over
 * a golden-angle spiral. A sample only spreads over pixels its own blur circle reaches, so a sharp
 * foreground is not smeared by the background behind it.
 */
const TAPS = 40;

export class Post {
  private rt: THREE.WebGLRenderTarget;
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mat: THREE.ShaderMaterial;
  /** Lens: blur-circle size per dioptre (fraction of the screen height), and its largest size. */
  aperture = 0.012;
  maxBlur = 0.012;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.rt = this.makeTarget(1, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uFocus: { value: 1 },
        uAperture: { value: this.aperture },
        uMaxBlur: { value: this.maxBlur },
        uAspect: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor, tDepth;
        uniform float uNear, uFar, uFocus, uAperture, uMaxBlur, uAspect;
        varying vec2 vUv;
        float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
        float coc(float z) { return min(uAperture * abs(1.0 / uFocus - 1.0 / z), uMaxBlur); }
        void main() {
          float z0 = viewZ(vUv), c0 = coc(z0);
          vec3 sum = texture2D(tColor, vUv).rgb;
          float wsum = 1.0;
          for (int i = 1; i < ${TAPS}; i++) {
            float fi = float(i);
            float r = sqrt(fi / ${TAPS}.0);
            float a = fi * 2.39996323;
            vec2 o = vec2(cos(a), sin(a)) * r;
            vec2 uv = vUv + o * c0 * vec2(1.0 / uAspect, 1.0);
            float zs = viewZ(uv), cs = coc(zs);
            // a sample counts if its own blur reaches here; nearer samples may spread over farther ones
            float reach = smoothstep(r * c0 - 0.002, r * c0, min(cs, c0) + (zs < z0 ? cs : 0.0));
            float w = mix(0.0, 1.0, reach);
            sum += texture2D(tColor, uv).rgb * w;
            wsum += w;
          }
          gl_FragColor = vec4(sum / wsum, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.FloatType;
    return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
  }

  setSize(w: number, h: number): void {
    const pr = this.renderer.getPixelRatio();
    this.rt.dispose();
    this.rt = this.makeTarget(Math.round(w * pr), Math.round(h * pr));
    this.mat.uniforms.uAspect.value = w / h;
  }

  render(focusPoint: THREE.Vector3): void {
    const u = this.mat.uniforms;
    const toFocus = focusPoint.clone().sub(this.camera.position);
    u.uFocus.value = Math.max(0.05, toFocus.dot(this.camera.getWorldDirection(new THREE.Vector3())));
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    u.uAperture.value = this.aperture;
    u.uMaxBlur.value = this.maxBlur;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    u.tColor.value = this.rt.texture;
    u.tDepth.value = this.rt.depthTexture;
    this.renderer.render(this.quadScene, this.quadCam);
  }
}
