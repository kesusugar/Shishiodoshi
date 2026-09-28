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
  /** Fraction of the full resolution the scene is drawn at (adapted to keep 60 fps). */
  scale = 1;
  private cssW = 1;
  private cssH = 1;
  private win = 0;
  private winFrames = 0;
  private good = 0;

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
        uPixel: { value: 1 / 900 },
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
        uniform float uPixel;   // one pixel, as a fraction of the screen height
        void main() {
          float z0 = viewZ(vUv), c0 = coc(z0);
          vec3 sum = texture2D(tColor, vUv).rgb;
          float wsum = 1.0;
          // in focus: nothing to gather. Otherwise as many taps as the blur circle needs (by its area).
          float px = c0 / uPixel;
          int n = px < 0.75 ? 1 : int(clamp(px * px * 0.8, 8.0, ${TAPS}.0));
          for (int i = 1; i < ${TAPS}; i++) {
            if (i >= n) break;
            float fi = float(i);
            float r = sqrt(fi / float(n));
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
    this.cssW = w;
    this.cssH = h;
    this.resizeTarget();
  }

  private resizeTarget(): void {
    const k = this.renderer.getPixelRatio() * this.scale;
    const w = Math.max(1, Math.round(this.cssW * k)), h = Math.max(1, Math.round(this.cssH * k));
    this.rt.dispose();
    this.rt = this.makeTarget(w, h);
    this.mat.uniforms.uAspect.value = this.cssW / this.cssH;
    this.mat.uniforms.uPixel.value = 1 / h;
  }

  /**
   * Keep the frame rate (PLAN.md 11章, as caustic-volume does): once a second, if frames have been
   * late, draw the scene at a lower resolution; if they have been on time for a while, go back up.
   */
  adapt(frameTime: number): void {
    this.win += frameTime;
    this.winFrames++;
    if (this.win < 1) return;
    const mean = this.win / this.winFrames;
    this.win = 0;
    this.winFrames = 0;
    let next = this.scale;
    if (mean > 1 / 52) {
      next = Math.max(0.55, this.scale * 0.88);
      this.good = 0;
    } else if (mean < 1 / 58 && ++this.good >= 3) {
      next = Math.min(1, this.scale * 1.07);
      this.good = 0;
    }
    if (Math.abs(next - this.scale) > 0.005) {
      this.scale = next;
      this.resizeTarget();
    }
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
