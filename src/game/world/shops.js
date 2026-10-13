// Bâtiments visitables de la ville : café, supérette, boutique de mode, salle
// d'arcade et hall d'immeuble. Chaque type d'intérieur est construit une fois,
// loin de la ville (x = 1200…), et toutes les portes de vitrine du même type y
// mènent ; on ressort devant la porte par laquelle on est entré.
// Chaque intérieur a de vraies interactions (manger, acheter, jouer, se reposer).
import * as THREE from 'three';
import { M, rbox, mergeStatic } from './helpers.js';

const WALL_H = 3.6;
const FONT = '"Lilita One", "Arial Black", system-ui, sans-serif';

// Type d'intérieur selon l'enseigne de la boutique.
export function shopKind(name) {
  if (/CAFÉ|BOULANGERIE|PIZZA|RAMEN/.test(name)) return 'cafe';
  if (/PHARMACIE|TABAC|LAVERIE|SUPÉRETTE/.test(name)) return 'store';
  if (/MODE|LIBRAIRIE|FLEURS/.test(name)) return 'boutique';
  if (/ARCADE/.test(name)) return 'arcade';
  return 'lobby';
}

export const SHOP_LABEL = { cafe: 'Café', store: 'Supérette', boutique: 'Boutique', arcade: 'Salle d’arcade', lobby: 'Hall d’immeuble' };

const matCache = new Map();
const mat = (color, extra = {}) => {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, M({ color, ...extra }));
  return matCache.get(key);
};
const glow = (color, k = 1.4) => mat('#ffffff', { emissive: color, emissiveIntensity: k });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function tileTex(a, b, n = 8, plank = false) {
  return canvasTex(256, 256, (x, w) => {
    const s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        x.fillStyle = plank ? (j % 2 ? a : b) : (i + j) % 2 ? a : b;
        if (plank) x.fillRect(0, j * s, w, s - 2);
        else x.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
      }
    }
  });
}

function boardTex(lines, bg = '#1d1640', fg = '#ffffff', accent = '#ffcd20') {
  return canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = accent;
    x.lineWidth = 10;
    x.strokeRect(8, 8, w - 16, h - 16);
    x.textAlign = 'center';
    x.fillStyle = accent;
    x.font = `54px ${FONT}`;
    x.fillText(lines[0], w / 2, 70);
    x.fillStyle = fg;
    x.font = `34px ${FONT}`;
    lines.slice(1).forEach((l, i) => x.fillText(l, w / 2, 130 + i * 44));
  });
}

let backdrop = null;
// Rue vue depuis l'intérieur : ciel, façades colorées, fenêtres allumées.
function streetBackdrop() {
  if (backdrop) return backdrop;
  backdrop = canvasTex(512, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8ec4ff');
    g.addColorStop(0.6, '#d8ecff');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    const cols = ['#e86f6f', '#5fb7c9', '#f2b84b', '#8f7ad8', '#6fcf97', '#e98ccf'];
    let px = 0;
    let i = 0;
    while (px < w) {
      const bw = 70 + ((i * 37) % 60);
      const bh = 220 + ((i * 53) % 200);
      x.fillStyle = cols[i % cols.length];
      x.fillRect(px, h - bh, bw - 4, bh);
      x.fillStyle = '#fff2c0';
      for (let wy = h - bh + 20; wy < h - 60; wy += 34) for (let wx = px + 10; wx < px + bw - 20; wx += 22) x.fillRect(wx, wy, 12, 18);
      px += bw;
      i++;
    }
    x.fillStyle = '#4a4b5e';
    x.fillRect(0, h - 50, w, 50);
  });
  return backdrop;
}

// Petit constructeur : boîtes posées au sol (y = bas), solides au besoin.
function kit(group, col, O) {
  const add = (geo, m, x, y, z, ry = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.castShadow = false;
    o.receiveShadow = true;
    group.add(o);
    return o;
  };
  return {
    add,
    box: (x, y, z, sx, sy, sz, m, solid = false, ry = 0) => {
      const o = add(new THREE.BoxGeometry(sx, sy, sz), m, x, y + sy / 2, z, ry);
      if (solid) col.addBox({ x: O.x + x - sx / 2, y, z: O.z + z - sz / 2 }, { x: O.x + x + sx / 2, y: y + sy, z: O.z + z + sz / 2 }, 'interior');
      return o;
    },
    rb: (x, y, z, sx, sy, sz, m, solid = false, r = 0.08) => {
      const o = add(rbox(sx, sy, sz, r), m, x, y + sy / 2, z);
      if (solid) col.addBox({ x: O.x + x - sx / 2, y, z: O.z + z - sz / 2 }, { x: O.x + x + sx / 2, y: y + sy, z: O.z + z + sz / 2 }, 'interior');
      return o;
    },
    cyl: (x, y, z, r0, r1, h, m, seg = 16) => add(new THREE.CylinderGeometry(r0, r1, h, seg), m, x, y + h / 2, z),
    plane: (x, y, z, w, h, m, ry = 0) => add(new THREE.PlaneGeometry(w, h), m, x, y, z, ry),
    solid: (x, z, sx, sz, h = 1.2) => col.addBox({ x: O.x + x - sx / 2, y: 0, z: O.z + z - sz / 2 }, { x: O.x + x + sx / 2, y: h, z: O.z + z + sz / 2 }, 'interior'),
  };
}

// Pièce : sol, murs (ouverture de porte au sud, z = 0), plafond, plinthes.
function room(group, col, O, w, d, { floor, wall, wall2, ceiling = '#f4efe6' }) {
  const k = kit(group, col, O);
  const f = k.add(new THREE.PlaneGeometry(w, d), floor, 0, 0.01, d / 2);
  f.rotation.x = -Math.PI / 2;
  const c = k.add(new THREE.PlaneGeometry(w, d), mat(ceiling), 0, WALL_H, d / 2);
  c.rotation.x = Math.PI / 2;
  const T = 0.2;
  const wm = mat(wall);
  k.box(0, 0, d + T / 2, w + 2 * T, WALL_H, T, wm, true);
  k.box(-w / 2 - T / 2, 0, d / 2, T, WALL_H, d, wm, true);
  k.box(w / 2 + T / 2, 0, d / 2, T, WALL_H, d, wm, true);
  const side = (w - 1.8) / 2;
  k.box(-w / 2 + side / 2, 0, -T / 2, side, WALL_H, T, wm, true);
  k.box(w / 2 - side / 2, 0, -T / 2, side, WALL_H, T, wm, true);
  k.box(0, 2.5, -T / 2, 1.8, WALL_H - 2.5, T, wm);
  // Soubassement (deuxième couleur) et plinthes
  if (wall2) {
    const w2 = mat(wall2);
    k.box(0, 0, d - 0.01, w, 1.0, 0.02, w2);
    k.box(-w / 2 + 0.01, 0, d / 2, 0.02, 1.0, d, w2);
    k.box(w / 2 - 0.01, 0, d / 2, 0.02, 1.0, d, w2);
  }
  // Porte d'entrée vitrée (cadre) côté rue
  k.box(-0.95, 0, -0.1, 0.1, 2.5, 0.24, mat('#3a2a5a'));
  k.box(0.95, 0, -0.1, 0.1, 2.5, 0.24, mat('#3a2a5a'));
  k.box(0, 2.45, -0.1, 2.0, 0.1, 0.24, mat('#3a2a5a'));
  k.plane(0, 1.25, -0.12, 1.8, 2.5, glow('#cfe8ff', 0.9));
  // Dehors, derrière la porte : trottoir et décor de rue peint (pas de vide).
  const walk = k.add(new THREE.PlaneGeometry(w + 6, 4), mat('#a9a5b6'), 0, 0.0, -2.2);
  walk.rotation.x = -Math.PI / 2;
  k.plane(0, 3, -4.1, w + 8, 8, M({ map: streetBackdrop() }), 0);
  return k;
}

function lights(group, list, quality) {
  const out = [];
  list.slice(0, quality === 'low' ? 1 : quality === 'medium' ? 2 : 3).forEach(([color, x, y, z, i, dist]) => {
    const l = new THREE.PointLight(color, i * 0.55, dist, 1.6);
    l.position.set(x, y, z);
    group.add(l);
    out.push(l);
  });
  return out;
}

// ---------------------------------------------------------------------------
function buildCafe(group, col, O, q) {
  const W = 12;
  const D = 10;
  const k = room(group, col, O, W, D, { floor: M({ map: tileTex('#b9774a', '#a8683e', 10, true) }), wall: '#f6e2c4', wall2: '#7a4a3a' });
  // Comptoir, machine à café, vitrine à pâtisseries
  k.rb(-2, 0, 7.6, 6, 1.05, 0.9, mat('#5a3a2a'), true);
  k.box(-2, 1.05, 7.6, 6.1, 0.06, 1.0, mat('#f2efe6'));
  k.rb(-4.2, 1.11, 7.8, 0.7, 0.55, 0.5, mat('#c0c4cc'));
  k.box(-4.2, 1.3, 7.5, 0.5, 0.06, 0.08, glow('#ff6a3d', 1.0));
  k.rb(-1.2, 1.11, 7.5, 1.8, 0.5, 0.7, glow('#fff2d0', 0.6));
  for (let i = 0; i < 6; i++) k.cyl(-1.9 + (i % 3) * 0.6, 1.25, 7.4 + Math.floor(i / 3) * 0.25, 0.12, 0.14, 0.08, mat(['#e8a050', '#ff9cc0', '#7a4a2a'][i % 3]));
  // Étagère de tasses + tableau du menu
  k.box(-2, 1.9, D - 0.15, 5, 0.06, 0.3, mat('#7a4a3a'));
  for (let i = 0; i < 10; i++) k.cyl(-4.2 + i * 0.48, 1.96, D - 0.15, 0.07, 0.06, 0.12, mat(['#fbf8ff', '#5fb7c9', '#ff9a3d'][i % 3]), 10);
  k.plane(-2, 2.75, D - 0.02, 3.2, 1.4, M({ map: boardTex(['CAFÉ LUNE', 'Chocolat chaud · 15', 'Croissant · 8', 'Thé glacé · 10']) }), Math.PI);
  // Tables rondes et chaises
  const tables = [[2.5, 2.5], [4.5, 5.5], [1.0, 5.2], [-3.5, 3.0]];
  for (const [x, z] of tables) {
    k.cyl(x, 0, z, 0.05, 0.25, 0.05, mat('#3a3448'));
    k.cyl(x, 0.05, z, 0.05, 0.05, 0.7, mat('#3a3448'), 8);
    k.cyl(x, 0.75, z, 0.55, 0.55, 0.05, mat('#f2efe6'), 20);
    k.solid(x, z, 1.1, 1.1, 0.8);
    for (const s of [-1, 1]) {
      k.rb(x + s * 0.85, 0, z, 0.45, 0.45, 0.45, mat('#c9563f'));
      k.rb(x + s * 1.06, 0.45, z, 0.06, 0.5, 0.45, mat('#c9563f'));
    }
    k.cyl(x, 0.8, z, 0.06, 0.05, 0.1, mat('#fbf8ff'), 10);
  }
  // Plantes et suspensions lumineuses
  for (const [x, z] of [[-5.4, 0.6], [5.4, 0.6], [5.4, 9.2]]) {
    k.cyl(x, 0, z, 0.25, 0.2, 0.45, mat('#c98a4a'));
    k.add(new THREE.IcosahedronGeometry(0.45, 1), mat('#4f9a5a'), x, 0.85, z);
  }
  for (const [x, z] of tables) {
    k.box(x, 3.0, z, 0.02, 0.6, 0.02, mat('#2b2050'));
    k.add(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glow('#ffd28a', 1.6), x, 2.85, z).rotation.x = Math.PI;
  }
  return {
    lights: lights(group, [['#ffd9a0', 0, 3.0, 4.5, 5, 16], ['#ffcf90', -2, 3.0, 7.5, 3, 10], ['#ffe2b8', 4, 3.0, 2.5, 3, 10]], q),
    interact: [{ id: 'cafe_order', x: -1.2, z: 6.6, label: '<kbd>E</kbd>Commander un chocolat chaud — <b>15 crédits</b> (santé et énergie au max)' }],
    staff: [{ x: -2, z: 8.6, yaw: Math.PI }],
    seats: tables.flatMap(([x, z]) => [{ x: x - 0.85, z, yaw: Math.PI / 2 }, { x: x + 0.85, z, yaw: -Math.PI / 2 }]),
    walks: [[[3, 1.5], [3, 8], [-5, 5]]],
    size: [W, D],
  };
}

function buildStore(group, col, O, q) {
  const W = 14;
  const D = 12;
  const k = room(group, col, O, W, D, { floor: M({ map: tileTex('#f2f2f6', '#dcdce6', 12) }), wall: '#e8f4ee', wall2: '#2fa88a' });
  const P = ['#ff5d5d', '#ffd54f', '#6fcf97', '#5fb7c9', '#c9a6ff', '#ff9a3d', '#f2efe6'];
  // Rayons : trois gondoles chargées de produits
  for (const x of [-4, 0, 4]) {
    k.rb(x, 0, 6, 1.0, 1.7, 6, mat('#fbf8ff'), true, 0.04);
    for (let lvl = 0; lvl < 3; lvl++) {
      for (let i = 0; i < 12; i++) {
        for (const s of [-1, 1]) {
          const c = P[(i * 3 + lvl + (x + 4) + (s > 0 ? 2 : 0)) % P.length];
          k.box(x + s * 0.55, 0.25 + lvl * 0.5, 3.4 + i * 0.44, 0.12, 0.28 + ((i + lvl) % 3) * 0.06, 0.34, mat(c));
        }
      }
    }
  }
  // Mur de frigos lumineux au fond
  for (let i = 0; i < 6; i++) {
    const x = -5 + i * 2;
    k.rb(x, 0, D - 0.5, 1.9, 2.3, 0.8, mat('#c0c4cc'), true, 0.04);
    k.plane(x, 1.2, D - 0.89, 1.6, 1.9, glow(['#d0f4ff', '#e0ffe8'][i % 2], 0.9), Math.PI);
    for (let r = 0; r < 4; r++) k.box(x, 0.35 + r * 0.45, D - 0.7, 1.4, 0.28, 0.2, mat(P[(i + r) % P.length]));
  }
  // Caisse près de l'entrée
  k.rb(4.8, 0, 1.8, 2.4, 1.0, 0.9, mat('#2fa88a'), true);
  k.rb(4.4, 1.0, 1.8, 0.5, 0.35, 0.4, mat('#2b2050'));
  k.plane(4.4, 1.25, 1.59, 0.36, 0.2, glow('#7fe3ff', 1.2), 0);
  k.plane(0, 3.0, D - 0.02, 4.4, 0.9, M({ map: boardTex(['SUPÉRETTE 24/7', 'Ouvert jour et nuit'], '#2fa88a', '#ffffff', '#ffffff') }), Math.PI);
  // Néons au plafond
  for (const x of [-4, 0, 4]) k.box(x, WALL_H - 0.08, 6, 0.3, 0.06, 7, glow('#ffffff', 1.1));
  return {
    lights: lights(group, [['#ffffff', 0, 3.2, 6, 5, 18], ['#e8fff4', -4, 3.2, 9, 3, 12], ['#ffffff', 4, 3.2, 3, 3, 12]], q),
    interact: [{ id: 'store_buy', x: 4.6, z: 0.9, label: '<kbd>E</kbd>Acheter un kit de soins — <b>45 crédits</b>' }],
    staff: [{ x: 5.6, z: 2.6, yaw: Math.PI }],
    seats: [],
    walks: [[[-2, 2], [-2, 10], [2, 10], [2, 2]], [[6, 4], [6, 10], [-6, 10], [-6, 4]]],
    size: [W, D],
  };
}

function buildBoutique(group, col, O, q) {
  const W = 12;
  const D = 10;
  const k = room(group, col, O, W, D, { floor: M({ map: tileTex('#f4e8f0', '#e8d4e4', 6) }), wall: '#fff0f6', wall2: '#ff6fa8' });
  const C = ['#ff6fa8', '#5fb7c9', '#ffcd20', '#8f7ad8', '#6fcf97', '#e8553f', '#2b2f6a'];
  // Portants de vêtements
  for (const [x, z] of [[-3.5, 3], [-3.5, 6.5], [3.5, 3]]) {
    k.box(x - 1.2, 0, z, 0.06, 1.6, 0.06, mat('#3a3448'));
    k.box(x + 1.2, 0, z, 0.06, 1.6, 0.06, mat('#3a3448'));
    k.box(x, 1.58, z, 2.5, 0.04, 0.04, mat('#c0c4cc'));
    for (let i = 0; i < 9; i++) k.rb(x - 1.0 + i * 0.25, 0.75, z, 0.06, 0.8, 0.45, mat(C[(i + Math.round(x)) % C.length]), false, 0.03);
    k.solid(x, z, 2.6, 0.6, 1.6);
  }
  // Mannequins (corps stylisé) et tenues
  for (const [x, z, c] of [[3, 7, '#8f7ad8'], [4.6, 7, '#e8553f']]) {
    k.cyl(x, 0, z, 0.25, 0.3, 0.06, mat('#3a3448'));
    k.cyl(x, 0.06, z, 0.03, 0.03, 0.8, mat('#c0c4cc'), 8);
    k.add(new THREE.CapsuleGeometry(0.2, 0.45, 6, 12), mat(c), x, 1.25, z).scale.set(1.2, 1, 0.8);
    k.add(new THREE.SphereGeometry(0.13, 16, 12), mat('#f2efe6'), x, 1.8, z);
    k.solid(x, z, 0.6, 0.6, 1.9);
  }
  // Miroir, cabines, comptoir
  k.plane(-5.9, 1.6, 8, 1.4, 2.4, glow('#cfe8ff', 0.5), Math.PI / 2);
  for (let i = 0; i < 2; i++) {
    k.box(-4 + i * 1.6, 2.4, D - 0.8, 1.4, 0.06, 0.06, mat('#c0c4cc'));
    k.box(-4 + i * 1.6, 0.2, D - 0.8, 1.3, 2.2, 0.05, mat(['#ff6fa8', '#8f7ad8'][i]));
  }
  k.rb(1.5, 0, 8.6, 2.6, 1.0, 0.8, mat('#2b2050'), true);
  k.plane(0, 3.0, D - 0.02, 4.2, 0.9, M({ map: boardTex(['MODE & CO', 'Tenues · Sweats · Style'], '#ff6fa8', '#ffffff', '#ffffff') }), Math.PI);
  return {
    lights: lights(group, [['#fff0f6', 0, 3.1, 5, 5, 16], ['#ffd0e8', -3, 3.1, 7, 3, 10], ['#ffffff', 3, 3.1, 3, 3, 10]], q),
    interact: [{ id: 'boutique_shop', x: 1.5, z: 7.6, label: '<kbd>E</kbd>Parcourir la boutique (tenues, cadeaux, équipement)' }],
    staff: [{ x: 1.5, z: 9.4, yaw: Math.PI }],
    seats: [],
    walks: [[[0, 2], [0, 7], [-5, 4.8], [5, 5]]],
    size: [W, D],
  };
}

function buildArcade(group, col, O, q) {
  const W = 14;
  const D = 10;
  const carpet = canvasTex(256, 256, (x, w) => {
    x.fillStyle = '#1d1640';
    x.fillRect(0, 0, w, w);
    const c = ['#ff4fa3', '#4dd2ff', '#ffcd20', '#6fcf97'];
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = c[i % 4];
      x.lineWidth = 4;
      x.beginPath();
      const px = (i * 53) % w;
      const py = (i * 97) % w;
      x.arc(px, py, 10 + (i % 3) * 6, 0, Math.PI * 1.3);
      x.stroke();
    }
  });
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
  carpet.repeat.set(4, 3);
  const k = room(group, col, O, W, D, { floor: M({ map: carpet }), wall: '#2b2050', ceiling: '#1d1640' });
  const neon = ['#ff4fa3', '#4dd2ff', '#ffcd20', '#6fcf97', '#b06cff'];
  // Bornes d'arcade le long des murs (écrans lumineux)
  const cabs = [];
  for (let i = 0; i < 5; i++) cabs.push([-5.5 + i * 2.75, D - 0.6, Math.PI]);
  for (let i = 0; i < 3; i++) cabs.push([-W / 2 + 0.6, 2.5 + i * 2.2, Math.PI / 2], [W / 2 - 0.6, 2.5 + i * 2.2, -Math.PI / 2]);
  cabs.forEach(([x, z, ry], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    group.add(g);
    const body = new THREE.Mesh(rbox(0.9, 1.9, 0.8, 0.05), mat('#3a2a5a'));
    body.position.y = 0.95;
    g.add(body);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), glow(neon[i % neon.length], 1.3));
    scr.position.set(0, 1.45, 0.41);
    scr.rotation.x = -0.2;
    g.add(scr);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.35), mat('#1d1640'));
    panel.position.set(0, 1.05, 0.5);
    g.add(panel);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.2), glow(neon[(i + 2) % neon.length], 1.2));
    top.position.set(0, 1.95, 0.32);
    g.add(top);
    k.solid(x, z, 1.0, 1.0, 2);
  });
  // Machine à pinces et piste de danse
  k.rb(0, 0, 5, 1.4, 2.1, 1.4, glow('#b06cff', 0.35), true, 0.05);
  for (let i = 0; i < 9; i++) k.box(-1.5 + (i % 3) * 1.0, 0.02, 2 + Math.floor(i / 3) * 1.0, 0.95, 0.05, 0.95, glow(neon[i % 4], 0.8));
  // Néons muraux
  k.box(0, 3.0, D - 0.05, W - 1, 0.08, 0.05, glow('#ff4fa3', 2));
  k.box(-W / 2 + 0.05, 3.0, D / 2, 0.05, 0.08, D - 1, glow('#4dd2ff', 2));
  k.box(W / 2 - 0.05, 3.0, D / 2, 0.05, 0.08, D - 1, glow('#4dd2ff', 2));
  return {
    lights: lights(group, [['#b06cff', 0, 3.0, 5, 6, 16], ['#4dd2ff', -4, 2.6, 6, 3, 10], ['#ff4fa3', 4, 2.6, 6, 3, 10]], q),
    interact: [{ id: 'arcade_play', x: -0.0, z: D - 1.7, label: '<kbd>E</kbd>Jouer à « Neon Racers » — <b>10 crédits</b> (gain d’XP selon le score)' }],
    staff: [],
    seats: [],
    stands: cabs.slice(1, 6).map(([x, z, ry]) => ({ x: x + Math.sin(ry) * 1.0, z: z + Math.cos(ry) * 1.0, yaw: ry + Math.PI })),
    walks: [[[-3, 1.5], [3, 1.5], [3, 7], [-3, 7]]],
    size: [W, D],
  };
}

function buildLobby(group, col, O, q) {
  const W = 10;
  const D = 9;
  const k = room(group, col, O, W, D, { floor: M({ map: tileTex('#d8d0c0', '#c4b8a8', 8) }), wall: '#e8e0d4', wall2: '#7a6a5a' });
  // Boîtes aux lettres
  for (let i = 0; i < 12; i++) k.box(-4.85, 1.0 + Math.floor(i / 4) * 0.36, 2 + (i % 4) * 0.42, 0.25, 0.32, 0.38, mat('#c0a060'));
  // Ascenseur (portes métalliques) et escalier
  k.box(0, 0, D - 0.12, 1.6, 2.4, 0.1, mat('#c0c4cc'));
  k.box(0, 0, D - 0.06, 0.02, 2.4, 0.02, mat('#3a3448'));
  k.box(1.1, 1.2, D - 0.1, 0.12, 0.2, 0.05, glow('#ffcd20', 1));
  for (let i = 0; i < 8; i++) k.box(3.6, 0, D - 1.2 - i * 0.35, 1.6, 0.2 + i * 0.2, 0.35, mat('#a89880'), true);
  // Banc, plante, loge du gardien
  k.rb(-3, 0, 6.8, 1.8, 0.45, 0.5, mat('#7a4a3a'), true);
  k.cyl(-1.6, 0, 7.8, 0.25, 0.2, 0.45, mat('#c98a4a'));
  k.add(new THREE.IcosahedronGeometry(0.45, 1), mat('#4f9a5a'), -1.6, 0.85, 7.8);
  k.rb(3.4, 0, 2.2, 1.8, 1.0, 0.8, mat('#5a4a3a'), true);
  k.add(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 24), glow('#fff4d8', 1.4), 0, WALL_H - 0.02, 4.5);
  return {
    lights: lights(group, [['#fff0d8', 0, 3.2, 4.5, 4.5, 14], ['#ffe8c8', -3, 3.0, 6.5, 2.5, 9]], q),
    interact: [{ id: 'lobby_rest', x: -3, z: 6.1, label: '<kbd>E</kbd>S’asseoir sur le banc et souffler (santé restaurée)' }],
    staff: [{ x: 3.4, z: 3.1, yaw: Math.PI }],
    seats: [],
    walks: [[[0, 1.5], [0, 7.5]]],
    size: [W, D],
  };
}

const BUILDERS = { cafe: buildCafe, store: buildStore, boutique: buildBoutique, arcade: buildArcade, lobby: buildLobby };

export function buildShops({ scene, col, quality = 'medium' }) {
  const zones = {};
  Object.entries(BUILDERS).forEach(([kind, build], i) => {
    const O = { x: 1200 + i * 40, z: 0 };
    const group = new THREE.Group();
    group.name = 'shop-' + kind;
    group.position.set(O.x, 0, O.z);
    group.visible = false;
    scene.add(group);
    const info = build(group, col, O, quality);
    for (const l of info.lights) l.visible = false;
    mergeStatic(group);
    const W = (p) => ({ x: O.x + p.x, z: O.z + p.z, ...(p.yaw != null ? { yaw: p.yaw } : {}) });
    zones[kind] = {
      group,
      lights: info.lights,
      shop: true,
      kind,
      spawn: { x: O.x, y: 0, z: O.z + 2.2, yaw: 0 },
      exit: { x: O.x, y: 0, z: O.z + 0.6 },
      interact: info.interact.map((it) => ({ ...it, pos: { x: O.x + it.x, y: 0, z: O.z + it.z } })),
      staff: info.staff.map(W),
      seats: info.seats.map(W),
      stands: (info.stands || []).map(W),
      walks: info.walks.map((r) => r.map(([x, z]) => [O.x + x, O.z + z])),
      bounds: [O.x - info.size[0] / 2, O.z, O.x + info.size[0] / 2, O.z + info.size[1]],
    };
  });
  return zones;
}
