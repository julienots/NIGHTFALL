// Feuillages réalistes : houppiers faits de « cartes » de feuilles découpées
// (texture alpha), normales orientées vers l'extérieur du houppier pour un
// éclairage volumique doux, vent dans le shader (voir pbr.js, option wind).
// Remplace les boules / cônes pleins du style cartoon.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng.js';
import { pbr } from '../fx/pbr.js';

const cache = new Map();

function canvasTex(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

// Grappe de feuilles (feuillus) : ellipses pointues aux teintes variées, nervure.
export function leafTexture() {
  return canvasTex('leaves', 256, 256, (x, W, H) => {
    const r = mulberry32(5);
    x.clearRect(0, 0, W, H);
    // Petites tiges
    x.strokeStyle = 'rgba(70,60,40,0.9)';
    x.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      x.moveTo(W / 2, H / 2);
      x.lineTo(W / 2 + (r() - 0.5) * W * 0.8, H / 2 + (r() - 0.5) * H * 0.8);
      x.stroke();
    }
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * W * 0.42;
      const px = W / 2 + Math.cos(a) * d;
      const py = H / 2 + Math.sin(a) * d;
      const L = 14 + r() * 14;
      const ang = r() * Math.PI * 2;
      const g = 85 + Math.floor(r() * 60);
      x.save();
      x.translate(px, py);
      x.rotate(ang);
      x.fillStyle = `rgb(${Math.floor(g * (0.55 + r() * 0.2))},${g},${Math.floor(g * (0.35 + r() * 0.15))})`;
      x.beginPath();
      x.moveTo(-L, 0);
      x.quadraticCurveTo(0, -L * 0.45, L, 0);
      x.quadraticCurveTo(0, L * 0.45, -L, 0);
      x.fill();
      x.strokeStyle = 'rgba(40,60,20,0.35)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(-L, 0);
      x.lineTo(L, 0);
      x.stroke();
      x.restore();
    }
  });
}

// Rameaux de conifère : aiguilles fines qui retombent depuis un axe central.
export function needleTexture() {
  return canvasTex('needles', 256, 256, (x, W, H) => {
    const r = mulberry32(9);
    x.clearRect(0, 0, W, H);
    for (let b = 0; b < 9; b++) {
      const bx = (b + 0.5) * (W / 9) + (r() - 0.5) * 8;
      x.strokeStyle = 'rgb(70,60,45)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(bx, 0);
      x.lineTo(bx + (r() - 0.5) * 10, H * 0.9);
      x.stroke();
      for (let i = 0; i < 70; i++) {
        const t = r();
        const py = t * H * 0.9;
        const px = bx + (r() - 0.5) * 6;
        const len = 8 + r() * 14 * (1 - t * 0.4);
        const side = r() < 0.5 ? -1 : 1;
        const g = 70 + Math.floor(r() * 50);
        x.strokeStyle = `rgb(${Math.floor(g * 0.5)},${g},${Math.floor(g * 0.55)})`;
        x.lineWidth = 1.4;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + side * len, py + len * 0.6);
        x.stroke();
      }
    }
  });
}

// Normales « sphériques » : chaque sommet pointe à l'opposé du centre du houppier.
function sphericalNormals(g, center = new THREE.Vector3()) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(center);
    v.y *= 0.7;
    v.normalize();
    n.setXYZ(i, v.x, v.y + 0.15, v.z);
  }
  n.needsUpdate = true;
  return g;
}

// Houppier de feuillu (≈ unité : rayon 1, centré). cards : nombre de cartes.
export function crownGeometry(cards = 60, seed = 3) {
  const key = `crown:${cards}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const r = mulberry32(seed);
  const parts = [];
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  for (let i = 0; i < cards; i++) {
    // Répartition dans un ellipsoïde, plus dense vers l'extérieur.
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const rad = 0.45 + Math.pow(r(), 0.5) * 0.6;
    const s = Math.sqrt(1 - u * u);
    const pos = new THREE.Vector3(Math.cos(th) * s * rad, u * rad * 0.82, Math.sin(th) * s * rad);
    const size = 0.75 + r() * 0.45;
    const pl = new THREE.PlaneGeometry(size, size);
    e.set(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI);
    q.setFromEuler(e);
    m.compose(pos, q, new THREE.Vector3(1, 1, 1));
    pl.applyMatrix4(m);
    parts.push(pl);
  }
  const g = sphericalNormals(mergeGeometries(parts));
  g.computeBoundingSphere();
  cache.set(key, g);
  return g;
}

// Conifère (≈ base y = 0, hauteur ~2.6, rayon 1) : étages de jupes coniques
// ouvertes, texturées d'aiguilles, plus une flèche.
export function pineGeometry(seed = 4) {
  const key = `pine:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const r = mulberry32(seed);
  const parts = [];
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const radius = 1.05 * (1 - t * 0.78);
    const h = 0.75 - t * 0.25;
    const y = 0.15 + t * 2.0;
    const cone = new THREE.ConeGeometry(radius, h, 12, 1, true);
    cone.rotateY(r() * Math.PI);
    cone.translate(0, y + h / 2, 0);
    parts.push(cone);
  }
  const g = sphericalNormals(mergeGeometries(parts), new THREE.Vector3(0, 1.0, 0));
  g.computeBoundingSphere();
  cache.set(key, g);
  return g;
}

// Matériau de feuillage (carte découpée, double face, vent).
export function foliageMaterial(color = '#ffffff', kind = 'leaf') {
  const key = `mat:${kind}:${color}`;
  if (cache.has(key)) return cache.get(key);
  const m = pbr({
    color,
    map: kind === 'pine' ? needleTexture() : leafTexture(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    surface: 'foliage',
    roughness: 0.75,
    wind: true,
    keepColor: color === '#ffffff',
  });
  cache.set(key, m);
  return m;
}
