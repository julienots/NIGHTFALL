// Outils partagés par les constructeurs du monde (centre-ville, quartiers,
// intérieurs) : matériau cartoon, boîte arrondie, fusion des maillages statiques.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from '../fx/toon.js';

// Matériau cartoon à partir de paramètres « standard » (rugosité/métal ignorés).
export function M(p = {}) {
  const m = new THREE.MeshToonMaterial({ gradientMap: toon('#fff').gradientMap });
  for (const k of ['color', 'map', 'emissive', 'emissiveMap', 'emissiveIntensity', 'transparent', 'opacity', 'side', 'wireframe', 'polygonOffset', 'polygonOffsetFactor', 'depthWrite']) {
    if (p[k] === undefined) continue;
    if (k === 'color' || k === 'emissive') m[k].set(p[k]);
    else m[k] = p[k];
  }
  return m;
}

// Boîte aux arêtes arrondies (style « jouet »).
export const rbox = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1));

// Fusionne les maillages statiques qui partagent un matériau (optimisation :
// quelques dizaines d'appels de dessin au lieu de près d'un millier).
// Les maillages marqués userData.dynamic sont laissés tels quels.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.userData.dynamic) return;
    const g = o.geometry;
    if (!g.attributes.uv || !g.attributes.normal) return;
    const key = `${o.material.uuid}:${o.castShadow ? 1 : 0}:${o.receiveShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
    const geo = g.index ? g.toNonIndexed() : g.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    buckets.get(key).geos.push(geo);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  let calls = 0;
  // Les maillages fusionnés sont placés en coordonnées monde : on neutralise la
  // transformation du groupe racine pour ne pas l'appliquer deux fois.
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    merged.applyMatrix4(inv);
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    root.add(m);
    calls++;
  }
  return calls;
}
