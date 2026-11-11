// Contour cartoon par « coque inversée » : chaque maillage reçoit un enfant qui
// partage sa géométrie, rendu uniquement sur ses faces arrière et gonflé le
// long des normales. Le contour suit donc toutes les animations sans coût de
// calcul côté CPU (les géométries ne sont pas dupliquées).
import * as THREE from 'three';

const cache = new Map();

export function outlineMaterial(color = '#12052e', thickness = 0.012) {
  const key = color + thickness;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  m.userData.thickness = { value: thickness };
  m.userData.opacity = 1;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uThick = m.userData.thickness;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uThick;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uThick;');
  };
  m.customProgramCacheKey = () => 'outline';
  cache.set(key, m);
  return m;
}

// Ajoute un contour à tous les maillages de root (sauf exclusions).
// Renvoie la liste des coques pour pouvoir les masquer (dissolution, etc.).
export function addOutline(root, { color = '#12052e', thickness = 0.012, skip = () => false } = {}) {
  const mat = outlineMaterial(color, thickness);
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && !skip(o)) meshes.push(o);
  });
  const shells = [];
  for (const m of meshes) {
    if (!m.geometry.attributes.normal) continue;
    // Les petits détails (yeux, dents, veines) n'ont pas besoin de contour.
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const s = m.scale;
    if (m.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.025) continue;
    const shell = new THREE.Mesh(m.geometry, mat);
    shell.userData.isOutline = true;
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.renderOrder = -1;
    m.add(shell);
    shells.push(shell);
  }
  root.userData.outlines = shells;
  return shells;
}

export function setOutlineVisible(root, on) {
  for (const s of root.userData.outlines || []) s.visible = on;
}
