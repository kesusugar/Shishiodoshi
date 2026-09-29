import * as THREE from 'three';
import { chainCompile } from '../render/shaderChain';

/**
 * Leaves are thin: sunlight on their far side shows through, yellow-green (ref3's backlit maple).
 * Added to each direct light as diffuse light arriving through the blade, so it keeps that light's
 * shadow (a leaf in the shade of another does not glow).
 */
export function translucentLeaves(mat: THREE.MeshStandardMaterial, tint: THREE.Color): void {
  chainCompile(mat, (sh) => {
    sh.uniforms.uLeafTint = { value: tint };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uLeafTint;')
      .replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin.replaceAll(
          'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
          'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n' +
            'reflectedLight.directDiffuse += uLeafTint * material.diffuseColor * directLight.color * max( 0.0, -dot( geometryNormal, directLight.direction ) ) * 0.9;',
        ),
      );
  });
}
