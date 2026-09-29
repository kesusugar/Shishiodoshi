import type * as THREE from 'three';

/**
 * Several patches on one material's shader. three.js has a single `onBeforeCompile` slot per
 * material, so assigning it a second time silently throws the first patch away: fine while only the
 * stone had moss, not once snow (and wetness, and the garden's haze) must all land on the same stone.
 *
 * `chainCompile(mat, patch)` runs the patches in the order they were added. Patches must anchor on
 * *different* chunks, or on chunks that come later than an earlier patch's, because a second
 * `replace('#include <x>', ...)` puts its code right after the include, i.e. before the first
 * patch's code (see render/snow.ts for how the snow patch picks its anchors).
 *
 * three.js reuses a compiled program for every material whose `customProgramCacheKey()` matches,
 * and the default key is the source text of `onBeforeCompile`. A patch that bakes numbers into the
 * shader text must therefore pass a `key` that changes with them, or two materials would share one
 * program that has only one of the values.
 */
type Patch = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;

interface Chained extends THREE.Material {
  userData: { chain?: { patch: Patch; key: string }[] };
}

export function chainCompile(mat: THREE.Material, patch: Patch, key?: string): void {
  const m = mat as Chained;
  const chain = (m.userData.chain ??= []);
  chain.push({ patch, key: key ?? patch.toString() });
  if (chain.length === 1) {
    m.onBeforeCompile = (shader, renderer) => {
      for (const p of chain) p.patch(shader, renderer);
    };
    m.customProgramCacheKey = () => chain.map((p) => p.key).join('|');
  }
}
