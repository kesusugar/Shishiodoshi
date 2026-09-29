import * as THREE from 'three';

/**
 * Free the GPU memory of everything under `root` (geometries and materials) after it is taken out
 * of the scene. Textures are left alone: the expensive ones are kept and shared between rebuilds.
 */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Line).isLine) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m?.dispose();
    (o as THREE.InstancedMesh).dispose?.();
  });
}
