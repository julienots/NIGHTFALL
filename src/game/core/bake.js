// « Cuisson » de groupes : fusionne les maillages qui partagent un matériau en
// un seul (moins d'appels de dessin), sans toucher aux pivots animés.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ATTRS = ['position', 'normal', 'uv'];

function prepare(geo, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(matrix);
  for (const name of Object.keys(g.attributes)) if (!ATTRS.includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
  return g;
}

function mergeInto(parent, list) {
  const buckets = new Map();
  for (const { mesh, matrix } of list) {
    const k = mesh.material.uuid + (mesh.castShadow ? 's' : '');
    if (!buckets.has(k)) buckets.set(k, { mat: mesh.material, cast: mesh.castShadow, recv: mesh.receiveShadow, geos: [] });
    buckets.get(k).geos.push(prepare(mesh.geometry, matrix));
    mesh.parent.remove(mesh);
  }
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.userData.dynamic = true;
    parent.add(m);
  }
}

// Objet rigide (voiture, mobilier) : tout fusionne dans le repère du groupe.
export function bakeRigid(group, keep = new Set()) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const list = [];
  group.traverse((o) => {
    if (o.isMesh && !keep.has(o) && !Array.isArray(o.material)) list.push({ mesh: o, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
  });
  if (list.length > 1) mergeInto(group, list);
  return group;
}

// Squelette articulé : fusionne seulement les enfants directs de chaque pivot.
export function bakeJoints(root, keep = new Set()) {
  const nodes = [];
  root.traverse((o) => {
    if (!o.isMesh) nodes.push(o);
  });
  for (const node of nodes) {
    const list = node.children
      .filter((c) => c.isMesh && !keep.has(c) && !Array.isArray(c.material))
      .map((c) => {
        c.updateMatrix();
        return { mesh: c, matrix: c.matrix.clone() };
      });
    if (list.length > 1) mergeInto(node, list);
  }
}
