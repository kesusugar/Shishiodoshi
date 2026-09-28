import * as THREE from 'three';
import { mulberry32 } from '../../scene/random';
import { ENV_GLSL, type EnvUniforms } from '../env';

/**
 * Beads of water clinging to wet bamboo (ref3): little flattened domes on the outer skin, thickest
 * near the mouth where the splashes reach, and on the underside where drops gather before falling.
 * They are added as a child of the culm, so they move with it.
 */
export function waterBeads(
  env: EnvUniforms,
  culm: { radius: number; from: number; to: number },
  count: number,
  seed: number,
): THREE.InstancedMesh {
  const rand = mulberry32(seed);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...env },
    transparent: true,
    vertexShader: /* glsl */ `
      varying vec3 vPos, vNrm;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vPos = w.xyz;
        vNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader:
      ENV_GLSL +
      /* glsl */ `
      varying vec3 vPos, vNrm;
      void main() {
        vec3 n = normalize(vNrm), v = normalize(vPos - cameraPosition);
        float c = clamp(-dot(v, n), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
        vec3 r = reflect(v, n);
        // a bead is a lens and a mirror: a pin-point of sun, the sky, and a dark rim
        vec3 e = envColor(r);
        vec3 col = vec3(dot(e, vec3(0.3, 0.5, 0.2))) * (0.6 + 1.2 * F) + uSunCol * pow(max(dot(r, uSunDir), 0.0), 300.0) * 3.0;
        float a = 0.25 + 0.6 * F;
        gl_FragColor = vec4(col / a * 0.8, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); // a hemisphere on +y
  const mesh = new THREE.InstancedMesh(dome, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // more toward the mouth end
    const x = culm.to - Math.pow(rand(), 1.8) * (culm.to - culm.from);
    // around the culm: mostly the top and sides, some hanging underneath
    const phi = rand() < 0.2 ? -Math.PI / 2 + (rand() - 0.5) * 0.6 : (rand() - 0.5) * Math.PI * 1.4 + Math.PI / 2;
    n.set(0, Math.sin(phi), Math.cos(phi));
    p.set(x, n.y * culm.radius, n.z * culm.radius);
    q.setFromUnitVectors(up, n);
    const r = 0.0006 + Math.pow(rand(), 2.5) * 0.0022;
    // pendant drops underneath are taller; the rest are flattened by the surface
    s.set(r, r * (n.y < -0.8 ? 1.2 : 0.55), r);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  }
  mesh.frustumCulled = false;
  return mesh;
}
