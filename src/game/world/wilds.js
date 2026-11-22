// LES MARCHES DE VESPER — le monde ouvert.
// Mille ans après la chute du royaume de Vesper : collines, forêts de pins,
// lac des Saules, rivière descendue des montagnes, trois villages (Brumeval,
// Cendreval, Port-Saule), ruines des Veilleurs, trois Sceaux qui retiennent
// l'Abysse, et au nord, la Faille. Même interface que buildDowntown() pour que
// le moteur (Game) n'ait presque rien à changer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng.js';
import { pbr } from '../fx/pbr.js';
import { buildTerrain, WORLD, fbm } from './terrain.js';
import { Grass } from './grass.js';
import { crownGeometry, pineGeometry, foliageMaterial } from './foliage.js';
import { mergeStatic } from './helpers.js';
import { riftTexture } from './textures.js';
import { plasterTex, stoneTex, slateTex, thatchTex, woodTex, runeTex } from './wildsTextures.js';

// ---------- Plan du monde ----------
export const PLACES = {
  sanctuary: { x: -40, z: 40, r: 16, name: 'Sanctuaire des Veilleurs' },
  brumeval: { x: -20, z: 118, r: 34, name: 'Brumeval' },
  cendreval: { x: -195, z: -30, r: 28, name: 'Cendreval' },
  port_saule: { x: 205, z: 190, r: 28, name: 'Port-Saule' },
  seal_aube: { x: 72, z: 6, r: 14, name: 'Sceau de l’Aube' },
  seal_marees: { x: 150, z: 36, r: 13, name: 'Sceau des Marées' },
  seal_cendres: { x: -172, z: -162, r: 14, name: 'Sceau des Cendres' },
  faille: { x: 20, z: -232, r: 30, name: 'La Faille' },
  tower: { x: -112, z: 152, r: 9, name: 'Tour de guet en ruine' },
  fort: { x: 228, z: -110, r: 14, name: 'Fort du Col' },
};
const LAKE = { x: 150, z: 115, r: 55 };
const RIVER = [[-60, -320], [-35, -210], [35, -125], [88, -25], [118, 38], [140, 72]];
const ROADS = [
  [[-40, 52], [-34, 85], [-20, 100]],
  [[-4, 128], [60, 148], [105, 178], [160, 202], [190, 196]],
  [[-48, 112], [-95, 88], [-150, 25], [-180, -14]],
  [[-28, 36], [10, 28], [58, 10]],
  [[-192, -50], [-188, -105], [-176, -146]],
  [[-44, 26], [-22, -60], [4, -150], [16, -205]],
  [[212, 168], [228, 118], [204, 62], [164, 40]],
  [[-110, 140], [-80, 110]],
  [[88, -20], [170, -70], [216, -104]],
];
export const STELES = [
  { id: 'stele_0', x: -40, z: 36 },
  { id: 'stele_1', x: 24, z: 156 },
  { id: 'stele_2', x: -104, z: 158 },
  { id: 'stele_3', x: -140, z: -64 },
  { id: 'stele_4', x: 98, z: 182 },
  { id: 'stele_5', x: 62, z: -62 },
  { id: 'stele_6', x: -38, z: -206 },
  { id: 'stele_7', x: 222, z: -100 },
];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Instances regroupées par parcelles de 120 m (le moteur peut écarter les
// parcelles hors champ).
class Scatter {
  constructor(parent) {
    this.parent = parent;
    this.sets = new Map();
  }

  add(key, geo, mat, x, y, z, { yaw = 0, s = 1, sy = s, color = null, pitch = 0, roll = 0, shadow = false } = {}) {
    const cx = Math.floor(x / 120);
    const cz = Math.floor(z / 120);
    const k = `${key}|${cx},${cz}`;
    if (!this.sets.has(k)) this.sets.set(k, { geo, mat, shadow, items: [] });
    this.sets.get(k).items.push([x, y, z, yaw, s, sy, color, pitch, roll]);
  }

  build() {
    for (const set of this.sets.values()) {
      const mesh = new THREE.InstancedMesh(set.geo, set.mat, set.items.length);
      set.items.forEach(([x, y, z, yaw, s, sy, color, pitch, roll], i) => {
        _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
        _m.compose(_p.set(x, y, z), _q, _s.set(s, sy, s));
        mesh.setMatrixAt(i, _m);
        if (color) mesh.setColorAt(i, _c.set(color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = set.shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.userData.dynamic = true;
      this.parent.add(mesh);
    }
  }
}

// Boîte aux UV « monde » (1 répétition = tile m).
function uvBox(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * (sizes[f][0] / tile), uv.getY(i) * (sizes[f][1] / tile));
  }
  return g;
}

// Rocher : icosaèdre déformé par du bruit (quelques variantes partagées).
function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 1.3 + seed, v.z * 1.3 - seed, 3, seed) * 0.7 + fbm(v.y * 2.1 + seed * 3, v.x * 2.1, 2, seed + 5) * 0.35;
    v.multiplyScalar(0.62 + n);
    v.y *= 0.72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildWilds(scene, col, quality = 'medium') {
  const rand = mulberry32(4242);
  const R = (a, b) => a + rand() * (b - a);
  const low = quality === 'low';
  const root = new THREE.Group();
  root.name = 'wilds';
  scene.add(root);
  const updaters = [];
  const lampLights = [];
  const lanterns = []; // positions des lanternes (lumières attribuées dynamiquement)
  const targets = {};
  const enemySpawns = [];
  const crates = [];

  // ---------- Terrain ----------
  const flats = Object.values(PLACES).map((p) => ({ x: p.x, z: p.z, r: p.r, bare: p === PLACES.faille ? 1 : p.r > 20 ? 0.75 : 0.4 }));
  for (const s of STELES) flats.push({ x: s.x, z: s.z, r: 4 });
  const terrain = buildTerrain(scene, { flats, lakes: [LAKE], river: RIVER, roads: ROADS }, quality);
  const H = terrain.heightAt;
  col.heightFn = H;
  // Limites invisibles du monde (au pied des montagnes).
  const P = WORLD.play + 8;
  for (const [a, b] of [[[-P - 4, -P], [-P, P]], [[P, -P], [P + 4, P]], [[-P, -P - 4], [P, -P]], [[-P, P], [P, P + 4]]]) {
    col.addBox({ x: a[0], y: -50, z: a[1] }, { x: b[0], y: 400, z: b[1] }, 'bounds');
  }

  // ---------- Eau (lac, rivière) ----------
  const waterUniforms = { wTime: { value: 0 } };
  const waterMat = new THREE.MeshStandardMaterial({ color: '#16262a', roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.9 });
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, waterUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 wPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nwPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 wPos; uniform float wTime;
        vec2 wv(vec2 p, vec2 d, float f, float s){ float ph = dot(p, d) * f + wTime * s; return d * cos(ph) * f; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 g = wv(wPos.xz, normalize(vec2(1.0, 0.3)), 0.9, 1.6) * 0.05 + wv(wPos.xz, normalize(vec2(-0.4, 1.0)), 1.7, 2.3) * 0.03
          + wv(wPos.xz, normalize(vec2(0.7, -0.7)), 3.3, 3.1) * 0.015 + wv(wPos.xz, normalize(vec2(-1.0, -0.2)), 6.1, 4.7) * 0.008;
        normal = normalize(normal - (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz);`);
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2, 1, 1).rotateX(-Math.PI / 2), waterMat);
  water.position.y = WORLD.water;
  water.renderOrder = 1;
  root.add(water);
  updaters.push((dt, t) => (waterUniforms.wTime.value = t));
  // Fond de l'eau infranchissable : l'eau profonde bloque (on nage pas, on vole).
  // (Pas de boîte : la rivière est peu profonde, le lac se contourne.)

  // ---------- Matériaux ----------
  const plaster = pbr({ map: plasterTex(), surface: 'plaster', keepColor: true, color: '#ffffff' });
  const stone = pbr({ map: stoneTex(), surface: 'concrete', keepColor: true, color: '#ffffff' });
  const ruinStone = pbr({ map: stoneTex(), surface: 'concrete', color: '#b8b4a6', keepColor: true });
  const slate = pbr({ map: slateTex(), surface: 'concrete', roughness: 0.55, keepColor: true, color: '#ffffff' });
  const thatch = pbr({ map: thatchTex(), surface: 'plaster', roughness: 0.95, keepColor: true, color: '#ffffff' });
  const wood = pbr({ map: woodTex(), surface: 'plaster', roughness: 0.8, keepColor: true, color: '#ffffff' });
  const darkWood = pbr({ map: woodTex(), surface: 'plaster', roughness: 0.85, keepColor: true, color: '#6a5a4a' });
  const iron = pbr({ color: '#2a2a2c', surface: 'metal', roughness: 0.5, metalness: 0.8, keepColor: true });
  const windowMat = pbr({ color: '#1a1410', emissive: '#ffb45a', emissiveIntensity: 0, surface: 'glass', keepColor: true });
  const lampMat = pbr({ color: '#ffe2a8', emissive: '#ffb45a', emissiveIntensity: 0, surface: 'glass', keepColor: true });
  const rockMat = pbr({ color: '#8a857c', surface: 'concrete', keepColor: true });
  const trunkMat = pbr({ color: '#4a3a2c', surface: 'plaster', roughness: 0.95, keepColor: true });
  const runeTexture = runeTex();
  const sealRune = new THREE.MeshStandardMaterial({ color: '#0a0a0c', emissive: '#ff4060', emissiveMap: runeTexture, emissiveIntensity: 1.6, roughness: 0.4 });
  const steleRune = new THREE.MeshStandardMaterial({ color: '#0a0a0c', emissive: '#7fe3ff', emissiveMap: runeTexture, emissiveIntensity: 0.9, roughness: 0.4 });

  // ---------- Végétation, rochers ----------
  const scatter = new Scatter(root);
  const crown = crownGeometry(low ? 30 : 56);
  const pine = pineGeometry();
  const leaf = foliageMaterial('#ffffff', 'leaf');
  const needles = foliageMaterial('#ffffff', 'pine');
  const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 1, 7).translate(0, 0.5, 0);
  const rocks = [1, 2, 3].map(rockGeometry);
  const nearPlace = (x, z, pad = 6) => Object.values(PLACES).some((p) => Math.hypot(x - p.x, z - p.z) < p.r + pad) || STELES.some((s) => Math.hypot(x - s.x, z - s.z) < 6);
  const okGround = (x, z) => {
    const h = H(x, z);
    return h > WORLD.water + 0.8 && terrain.pathAt(x, z) < 0.05 && terrain.slopeAt(x, z) < 1.0 && !nearPlace(x, z);
  };
  const Q = { low: 0.4, medium: 0.7, high: 1, ultra: 1.25 }[quality] ?? 0.7;
  const treeShadow = !low;
  let trees = 0;
  const maxTrees = Math.round(2600 * Q);
  for (let tries = 0; tries < maxTrees * 6 && trees < maxTrees; tries++) {
    const x = R(-WORLD.play - 60, WORLD.play + 60);
    const z = R(-WORLD.play - 60, WORLD.play + 60);
    // Forêt de pins à l'ouest et au nord, bosquets de feuillus ailleurs.
    const westness = THREE.MathUtils.smoothstep(-x, 40, 160) + THREE.MathUtils.smoothstep(-z, 120, 220) * 0.6;
    const forest = fbm(x * 0.012, z * 0.012, 3, 91) + westness * 0.35;
    if (forest < 0.56 || !okGround(x, z)) continue;
    const y = H(x, z) - 0.2;
    const isPine = rand() < 0.25 + westness * 0.7 || y > 40;
    const s = R(0.85, 1.5) * (isPine ? 1.25 : 1);
    if (isPine) {
      scatter.add('trunkP', trunkGeo, trunkMat, x, y, z, { s: 0.22 * s, sy: 2.2 * s, shadow: treeShadow });
      scatter.add('pine', pine, needles, x, y + 0.9 * s, z, { yaw: rand() * 6, s: 2.2 * s, sy: 2.9 * s, color: ['#c4d0c0', '#b4c4b4', '#ccd4c2'][Math.floor(rand() * 3)], shadow: treeShadow });
    } else {
      const h = 2.6 * s;
      scatter.add('trunk', trunkGeo, trunkMat, x, y, z, { s: 0.22 * s, sy: h + 0.6 * s, shadow: treeShadow });
      scatter.add('crown', crown, leaf, x, y + h + 0.9 * s, z, { yaw: rand() * 6, s: 1.9 * s, sy: 1.6 * s, color: ['#ffffff', '#e4eed6', '#f4ead0', '#d6e2cc', '#f0d8a0'][Math.floor(rand() * 5)], shadow: treeShadow });
    }
    col.addCentered(x, y, z, 0.6, 6, 0.6);
    trees++;
  }
  // Rochers et blocs erratiques
  for (let i = 0; i < Math.round(700 * Q); i++) {
    const x = R(-WORLD.play - 40, WORLD.play + 40);
    const z = R(-WORLD.play - 40, WORLD.play + 40);
    const h = H(x, z);
    if (h < WORLD.water - 0.5 || terrain.pathAt(x, z) > 0.05 || nearPlace(x, z, 2)) continue;
    const big = rand() < 0.15;
    const s = big ? R(1.6, 3.4) : R(0.3, 0.9);
    scatter.add('rock' + (i % 3), rocks[i % 3], rockMat, x, h - s * 0.25, z, { yaw: rand() * 6, s, sy: s * R(0.7, 1.1), pitch: R(-0.2, 0.2), shadow: big });
    if (big) col.addCentered(x, h - 1, z, s * 1.3, s * 1.0 + 1, s * 1.3, 'rock');
  }
  // Buissons bas
  for (let i = 0; i < Math.round(900 * Q); i++) {
    const x = R(-WORLD.play, WORLD.play);
    const z = R(-WORLD.play, WORLD.play);
    if (!okGround(x, z) || terrain.grassAt(x, z) < 0.4) continue;
    const s = R(0.6, 1.2);
    scatter.add('bush', crown, leaf, x, H(x, z) + 0.45 * s, z, { yaw: rand() * 6, s: 0.9 * s, sy: 0.6 * s, color: '#cfd8b8' });
  }
  scatter.build();

  // ---------- Bâtiments ----------
  const statics = new THREE.Group();
  root.add(statics);
  const add = (geo, mat, x, y, z, ry = 0, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = true;
    statics.add(m);
    return m;
  };
  // Point local (lx, lz) d'un repère tourné de yaw autour de (x, z).
  const local = (x, z, yaw, lx, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  const minGround = (x, z, w, d) => Math.min(H(x - w / 2, z - d / 2), H(x + w / 2, z - d / 2), H(x - w / 2, z + d / 2), H(x + w / 2, z + d / 2), H(x, z));

  // Toit à deux pans (faîtage selon l'axe local X), avec débord.
  function gableRoof(w, d, rise, mat) {
    const o = 0.45;
    const half = d / 2 + o;
    const len = Math.hypot(half, rise);
    const ang = Math.atan2(rise, half);
    const parts = [];
    for (const side of [-1, 1]) {
      const g = uvBox(w + o * 2, 0.16, len, 2);
      g.rotateX(side * ang);
      g.translate(0, rise / 2, (side * half) / 2);
      parts.push(g.toNonIndexed());
    }
    const geo = mergeGeometries(parts);
    return { geo, mat };
  }
  // Pignon triangulaire (mur), extrudé sur l'épaisseur.
  function gable(w, d, rise) {
    const sh = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
    return g;
  }

  // Maison à colombages : soubassement de pierre, étage enduit, toit à deux pans.
  function house(x, z, yaw, { w = 7, d = 5.5, floors = 2, roof = 'slate', chimney = true } = {}) {
    const g0 = minGround(x, z, w + 1, d + 1);
    const base = 1.1;
    const fh = 2.6;
    const wallH = base + fh * floors;
    const grp = new THREE.Group();
    grp.position.set(x, g0, z);
    grp.rotation.y = yaw;
    statics.add(grp);
    const m = (geo, mat, px, py, pz, cast = true) => {
      const me = new THREE.Mesh(geo, mat);
      me.position.set(px, py, pz);
      me.castShadow = cast;
      me.receiveShadow = true;
      grp.add(me);
      return me;
    };
    const sink = 3; // fondations enterrées (pentes)
    m(uvBox(w + 0.3, base + sink, d + 0.3, 2), stone, 0, (base - sink) / 2, 0);
    m(uvBox(w, fh * floors, d, 2), plaster, 0, base + (fh * floors) / 2, 0);
    // Colombages : poteaux d'angle, sablières, croix de Saint-André
    const beam = (bw, bh, bd, px, py, pz, rz = 0, rx = 0) => {
      const b = m(uvBox(bw, bh, bd, 1), darkWood, px, py, pz, false);
      b.rotation.set(rx, 0, rz);
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(0.22, fh * floors, 0.22, sx * (w / 2), base + (fh * floors) / 2, sz * (d / 2));
    for (let f = 0; f <= floors; f++) {
      beam(w + 0.1, 0.2, 0.18, 0, base + f * fh, d / 2 + 0.02);
      beam(w + 0.1, 0.2, 0.18, 0, base + f * fh, -d / 2 - 0.02);
      beam(0.18, 0.2, d + 0.1, w / 2 + 0.02, base + f * fh, 0);
      beam(0.18, 0.2, d + 0.1, -w / 2 - 0.02, base + f * fh, 0);
    }
    for (let f = 0; f < floors; f++) {
      for (const sx of [-1, 1]) {
        const cy = base + f * fh + fh / 2;
        const diag = Math.atan2(fh, w / 3);
        beam(Math.hypot(w / 3, fh) - 0.2, 0.16, 0.14, sx * (w / 3), cy, d / 2 + 0.03, sx * diag);
        beam(Math.hypot(w / 3, fh) - 0.2, 0.16, 0.14, sx * (w / 3), cy, -d / 2 - 0.03, -sx * diag);
      }
    }
    // Toit
    const rise = d * 0.55;
    const r = gableRoof(w, d, rise, roof === 'thatch' ? thatch : slate);
    m(r.geo, r.mat, 0, wallH, 0);
    m(gable(0.3, d, rise), plaster, w / 2 - 0.15, wallH, 0);
    m(gable(0.3, d, rise), plaster, -w / 2 + 0.15, wallH, 0);
    if (chimney) m(uvBox(0.8, rise + 1.6, 0.8, 2), stone, w * 0.28, wallH + (rise + 1.6) / 2 - 0.2, -d * 0.12);
    // Porte (façade avant = +Z local) et marche
    m(uvBox(1.2, 2.1, 0.12, 1), wood, -w * 0.18, base + 1.05 - 0.6, d / 2 + 0.05);
    m(uvBox(1.6, 0.25, 0.8, 1), stone, -w * 0.18, base - 0.72, d / 2 + 0.45);
    // Fenêtres (s'allument le soir) et volets
    const win = new THREE.PlaneGeometry(0.9, 1.1);
    for (let f = 0; f < floors; f++) {
      const wy = base + f * fh + (f === 0 ? 1.0 : 1.4);
      for (const wx of f === 0 ? [w * 0.22] : [-w * 0.25, w * 0.22]) {
        for (const face of [1, -1]) {
          const wm = m(win, windowMat, wx, wy, face * (d / 2 + 0.03), false);
          if (face < 0) wm.rotation.y = Math.PI;
          for (const sx of [-1, 1]) {
            const sh = m(uvBox(0.45, 1.15, 0.06, 1), wood, wx + sx * 0.7, wy, face * (d / 2 + 0.06), false);
            sh.rotation.y = sx * 0.25 * face;
          }
        }
      }
    }
    // Collision (maisons orientées par quarts de tour : boîte alignée)
    const q = Math.round(yaw / (Math.PI / 2)) % 2 !== 0;
    const cw = q ? d : w;
    const cd = q ? w : d;
    col.addBox({ x: x - cw / 2, y: g0 - sink, z: z - cd / 2 }, { x: x + cw / 2, y: g0 + wallH + rise * 0.6, z: z + cd / 2 }, 'building');
    const [lx, lz] = local(x, z, yaw, -w * 0.18 + 1.4, d / 2 + 1.6);
    return { door: { x: lx, z: lz } };
  }

  function lantern(x, z, h = 3.2) {
    const y = H(x, z);
    add(uvBox(0.18, h, 0.18, 1), darkWood, x, y + h / 2, z);
    add(uvBox(0.9, 0.12, 0.12, 1), darkWood, x + 0.35, y + h - 0.1, z, 0, false);
    add(new THREE.BoxGeometry(0.32, 0.42, 0.32), lampMat, x + 0.7, y + h - 0.45, z, 0, false);
    add(new THREE.ConeGeometry(0.3, 0.25, 4).rotateY(Math.PI / 4), iron, x + 0.7, y + h - 0.12, z, 0, false);
    lanterns.push(new THREE.Vector3(x + 0.7, y + h - 0.55, z));
    col.addCentered(x, y, z, 0.3, h, 0.3);
  }

  function well(x, z) {
    const y = H(x, z);
    add(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 14, 1, true), stone, x, y + 0.45, z);
    add(new THREE.CylinderGeometry(1.0, 1.0, 0.05, 14), new THREE.MeshStandardMaterial({ color: '#0a1012', roughness: 0.05 }), x, y + 0.2, z, 0, false);
    for (const sx of [-1, 1]) add(uvBox(0.16, 2.2, 0.16, 1), darkWood, x + sx * 1.0, y + 1.1, z);
    const r = gableRoof(2.4, 1.6, 0.7, slate);
    add(r.geo, r.mat, x, y + 2.1, z, Math.PI / 2);
    col.addCentered(x, y, z, 2.3, 1, 2.3);
  }

  function fence(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.2));
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      add(uvBox(0.14, 1.1, 0.14, 1), darkWood, x, H(x, z) + 0.45, z, yaw, false);
      if (i < n) {
        const mx = x + (x1 - x0) / n / 2;
        const mz = z + (z1 - z0) / n / 2;
        const y = H(mx, mz);
        for (const hy of [0.45, 0.85]) add(uvBox(0.06, 0.1, len / n + 0.1, 1), wood, mx, y + hy, mz, yaw, false);
      }
    }
  }

  // Village : maisons orientées vers la place, puits, lanternes, clôtures.
  function village(place, { houses = 7, roof = 'slate', seed = 1 } = {}) {
    const r = mulberry32(seed);
    const doors = [];
    well(place.x, place.z);
    const ring = place.r * 0.62;
    for (let i = 0; i < houses; i++) {
      const a = (i / houses) * Math.PI * 2 + r() * 0.25;
      const x = place.x + Math.cos(a) * ring * (0.85 + r() * 0.3);
      const z = place.z + Math.sin(a) * ring * (0.85 + r() * 0.3);
      // Façade (+Z local) tournée vers la place, arrondie au quart de tour.
      const face = Math.atan2(place.x - x, place.z - z);
      const yaw = Math.round(face / (Math.PI / 2)) * (Math.PI / 2);
      const big = r() < 0.35;
      doors.push(house(x, z, yaw, { w: big ? 8.5 : 6.5 + r(), d: big ? 6 : 5 + r() * 0.6, floors: big ? 2 : 1 + (r() < 0.6 ? 1 : 0), roof: r() < 0.3 ? 'thatch' : roof }).door);
      const la = a + Math.PI / houses;
      lantern(place.x + Math.cos(la) * ring * 0.55, place.z + Math.sin(la) * ring * 0.55);
    }
    // Clôtures de jardins à la périphérie
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      const d0 = place.r + 4;
      const x0 = place.x + Math.cos(a) * d0;
      const z0 = place.z + Math.sin(a) * d0;
      fence(x0, z0, x0 + Math.cos(a + 1.6) * 10, z0 + Math.sin(a + 1.6) * 10);
    }
    return doors;
  }

  // ---------- Ruines des Veilleurs ----------
  function column(x, z, h, broken = false) {
    const y = H(x, z) - 0.2;
    add(new THREE.CylinderGeometry(0.55, 0.62, h, 12), ruinStone, x, y + h / 2, z, rand() * 6);
    add(uvBox(1.5, 0.4, 1.5, 1), ruinStone, x, y + 0.2, z, rand() * 0.3);
    if (!broken) add(uvBox(1.4, 0.35, 1.4, 1), ruinStone, x, y + h + 0.17, z, rand() * 0.3);
    col.addCentered(x, y, z, 1.2, h, 1.2);
  }
  function ruinWall(x, z, len, yaw, h) {
    const y = minGround(x, z, len, 1) - 0.3;
    const n = Math.ceil(len / 1.2);
    for (let i = 0; i < n; i++) {
      const lx = -len / 2 + (i + 0.5) * (len / n);
      const hh = h * (0.35 + rand() * 0.65) * (Math.abs(lx) < len * 0.3 ? 0.6 + rand() * 0.4 : 1);
      const [px, pz] = local(x, z, yaw, lx, 0);
      add(uvBox(len / n + 0.02, hh, 0.9, 2), ruinStone, px, y + hh / 2, pz, yaw);
    }
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    col.addCentered(x, y, z, len * c + 0.9 * s, h * 0.6, len * s + 0.9 * c);
  }
  function fallenColumn(x, z) {
    const y = H(x, z);
    const m = add(new THREE.CylinderGeometry(0.5, 0.55, R(2, 4), 12), ruinStone, x, y + 0.35, z, rand() * 6);
    m.rotation.z = Math.PI / 2;
  }

  const sealRunes = {};
  function seal(id, place) {
    const y = H(place.x, place.z);
    add(new THREE.CylinderGeometry(7.5, 8, 0.6, 24), ruinStone, place.x, y + 0.05, place.z);
    add(new THREE.CylinderGeometry(4, 4.4, 0.5, 20), ruinStone, place.x, y + 0.5, place.z);
    // Obélisque runique
    const ob = new THREE.CylinderGeometry(0.55, 1.0, 7, 4).rotateY(Math.PI / 4);
    add(ob, ruinStone, place.x, y + 4.2, place.z);
    const runes = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.03, 5.6, 4, 1, true).rotateY(Math.PI / 4), sealRune.clone());
    runes.position.set(place.x, y + 3.9, place.z);
    statics.add(runes);
    runes.userData.dynamic = true;
    sealRunes[id] = runes.material;
    col.addCentered(place.x, y, place.z, 2, 8, 2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      column(place.x + Math.cos(a) * 6.3, place.z + Math.sin(a) * 6.3, R(1.5, 5), rand() < 0.6);
    }
    fallenColumn(place.x + 9, place.z + 3);
    targets[id] = { x: place.x, y: y + 0.6, z: place.z + 2.2 };
  }

  function stele(s) {
    const y = H(s.x, s.z);
    add(uvBox(1.3, 2.3, 0.45, 2), ruinStone, s.x, y + 1.0, s.z, 0.2);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), steleRune);
    r.position.set(s.x + Math.sin(0.2) * 0.24, y + 1.15, s.z + Math.cos(0.2) * 0.24);
    r.rotation.y = 0.2;
    r.userData.dynamic = true;
    statics.add(r);
    col.addCentered(s.x, y, s.z, 1.3, 2.2, 0.5);
    targets[s.id] = { x: s.x + Math.sin(0.2) * 1.4, y: y + 0.15, z: s.z + Math.cos(0.2) * 1.4 };
  }

  // ---------- Placement des lieux ----------
  // Sanctuaire des Veilleurs (point de départ) : cercle de colonnes.
  {
    const p = PLACES.sanctuary;
    const y = H(p.x, p.z);
    add(new THREE.CylinderGeometry(10, 10.5, 0.5, 28), ruinStone, p.x, y, p.z);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      column(p.x + Math.cos(a) * 8.5, p.z + Math.sin(a) * 8.5, R(2.5, 6.5), rand() < 0.4);
    }
    add(uvBox(2.4, 1, 1.4, 2), ruinStone, p.x, y + 0.5, p.z - 1.2);
    targets.sanctuary = { x: p.x, y: y + 0.3, z: p.z + 6 };
  }
  for (const s of STELES) stele(s);
  const doors = {
    brumeval: village(PLACES.brumeval, { houses: 9, seed: 11 }),
    cendreval: village(PLACES.cendreval, { houses: 6, roof: 'thatch', seed: 23 }),
    port_saule: village(PLACES.port_saule, { houses: 7, seed: 37 }),
  };
  // Pontons de Port-Saule
  {
    const p = PLACES.port_saule;
    for (let i = 0; i < 2; i++) {
      const x = p.x - 32 - i * 6;
      const z = p.z - 30 - i * 8;
      const yaw = Math.atan2(LAKE.x - x, LAKE.z - z);
      for (let k = 0; k < 7; k++) {
        const [px, pz] = local(x, z, yaw, 0, k * 2);
        add(uvBox(2.2, 0.18, 2.1, 1), wood, px, WORLD.water + 0.6, pz, yaw);
        for (const sx of [-1, 1]) {
          const [qx, qz] = local(x, z, yaw, sx, k * 2);
          add(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), darkWood, qx, WORLD.water - 0.6, qz, 0, false);
        }
      }
    }
  }
  seal('seal_aube', PLACES.seal_aube);
  seal('seal_marees', PLACES.seal_marees);
  seal('seal_cendres', PLACES.seal_cendres);
  // Tour de guet en ruine
  {
    const p = PLACES.tower;
    const y = H(p.x, p.z) - 0.4;
    add(new THREE.CylinderGeometry(3.2, 3.6, 11, 14, 1, true), ruinStone, p.x, y + 5.5, p.z);
    add(new THREE.CylinderGeometry(3.4, 3.4, 0.5, 14), ruinStone, p.x, y + 11, p.z);
    col.addCentered(p.x, y, p.z, 6.6, 11.2, 6.6);
    ruinWall(p.x + 6, p.z + 4, 8, 0.6, 3);
  }
  // Fort du Col
  {
    const p = PLACES.fort;
    ruinWall(p.x, p.z - 10, 20, 0, 5);
    ruinWall(p.x - 10, p.z, 20, Math.PI / 2, 5);
    ruinWall(p.x + 10, p.z, 14, Math.PI / 2, 4);
    for (const [dx, dz] of [[-10, -10], [10, -10]]) column(p.x + dx, p.z + dz, 7, true);
  }
  // Ruines éparses le long des chemins
  for (const [x, z] of [[30, 70], [-90, -10], [120, -40], [-60, -140], [180, 110], [-230, 90], [60, 230], [-140, 220]]) {
    if (nearPlace(x, z, -2)) continue;
    ruinWall(x, z, R(6, 12), rand() * 3, R(2, 4));
    column(x + 4, z + 3, R(2, 5), true);
    fallenColumn(x - 3, z + 4);
  }

  // ---------- La Faille ----------
  const riftMats = [];
  {
    const p = PLACES.faille;
    const y = H(p.x, p.z);
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: riftTexture(9), transparent: true, depthWrite: false, color: '#c070ff', blending: THREE.AdditiveBlending }));
    crack.rotation.x = -Math.PI / 2;
    crack.position.set(p.x, y + 0.08, p.z);
    root.add(crack);
    riftMats.push(crack.material);
    const crystalMat = pbr({ color: '#120818', emissive: '#7a2aff', emissiveIntensity: 0.6, surface: 'glass', keepColor: true });
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const d = R(9, 24);
      const s = R(0.8, 3);
      const m = add(new THREE.OctahedronGeometry(1, 0), crystalMat, p.x + Math.cos(a) * d, y + s * 0.8, p.z + Math.sin(a) * d, rand() * 6);
      m.scale.set(s * 0.5, s * 1.8, s * 0.5);
      m.rotation.z = R(-0.4, 0.4);
    }
    // Colonne de lumière de l'Abysse
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 9, 600, 24, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uK: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec2 vUv; uniform float uTime, uK;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
          void main(){ vec2 q = vec2(vUv.x * 10.0, vUv.y * 30.0 - uTime * 0.6); float v = n(q) * 0.6 + n(q * 2.7) * 0.4;
            float fade = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
            gl_FragColor = vec4(mix(vec3(0.3, 0.08, 0.7), vec3(0.85, 0.55, 1.0), v) * v * fade * 0.55 * uK, 1.0); }`,
      }),
    );
    beam.position.set(p.x, y + 300, p.z);
    root.add(beam);
    updaters.push((dt, t) => (beam.material.uniforms.uTime.value = t));
    riftMats.push(beam.material);
    const light = new THREE.PointLight('#a050ff', 60, 60, 1.6);
    light.position.set(p.x, y + 6, p.z);
    root.add(light);
    targets.faille = { x: p.x, y: y + 0.15, z: p.z + 22 };
    targets.faille_heart = { x: p.x, y: y + 0.15, z: p.z + 3 };
  }

  // ---------- Ponts sur la rivière ----------
  const river = terrain.river;
  for (const road of terrain.roads) {
    let best = null;
    for (let i = 0; i < road.length; i++) {
      const [x, z] = road[i];
      for (const [rx, rz] of river) {
        const d = Math.hypot(x - rx, z - rz);
        if (d < 10 && (!best || d < best.d)) best = { d, x, z, i };
      }
    }
    if (!best) continue;
    const a = road[Math.max(0, best.i - 1)];
    const b = road[Math.min(road.length - 1, best.i + 1)];
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const y = Math.max(H(...local(best.x, best.z, yaw, 0, -12)), H(...local(best.x, best.z, yaw, 0, 12))) + 0.2;
    add(uvBox(3.6, 0.35, 26, 2), wood, best.x, y, best.z, yaw);
    for (const sx of [-1, 1]) {
      const [rx, rz] = local(best.x, best.z, yaw, sx * 1.75, 0);
      add(uvBox(0.12, 0.9, 26, 1), darkWood, rx, y + 0.6, rz, yaw, false);
    }
    // Tablier marchable
    const [cx, cz] = [best.x, best.z];
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    col.addCentered(cx, y - 3, cz, 3.6 * c + 20 * s, 3.17, 3.6 * s + 20 * c);
  }

  // ---------- Fusion des décors statiques ----------
  const drawCalls = mergeStatic(statics);

  // ---------- PNJ, points d'intérêt ----------
  const center = (p) => ({ x: p.x, y: H(p.x, p.z) + 0.15, z: p.z });
  targets.brumeval = center(PLACES.brumeval);
  targets.cendreval = center(PLACES.cendreval);
  targets.port_saule = center(PLACES.port_saule);
  // Autel des Veilleurs (sauvegarde, boutique) et forge (atelier) à Brumeval.
  const bv = PLACES.brumeval;
  targets.terminal = { x: bv.x + 4, y: H(bv.x + 4, bv.z + 3) + 0.15, z: bv.z + 3 };
  targets.workbench = { x: bv.x - 4, y: H(bv.x - 4, bv.z - 3) + 0.15, z: bv.z - 3 };
  {
    const t = targets.terminal;
    add(uvBox(1.6, 1.1, 0.9, 1), ruinStone, t.x, t.y + 0.4, t.z - 1.0);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    fire.position.set(t.x, t.y + 1.4, t.z - 1.0);
    root.add(fire);
    updaters.push((dt, tt) => fire.scale.set(1, 1 + Math.sin(tt * 9) * 0.15, 1));
    lanterns.push(new THREE.Vector3(t.x, t.y + 1.6, t.z - 1));
    const w = targets.workbench;
    add(uvBox(1.4, 0.8, 0.9, 1), iron, w.x, w.y + 0.3, w.z - 1.0);
    add(uvBox(0.5, 0.3, 0.4, 1), iron, w.x, w.y + 0.85, w.z - 1.0);
  }
  for (const [k, p] of Object.entries(PLACES)) if (!targets[k]) targets[k] = center(p);
  targets.fleur_lune = { x: -128, y: H(-128, 182) + 0.15, z: 182 };
  // Fleurs de lune (lueur bleutée, la nuit)
  const moonFlower = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: '#9fe8ff' }));
  moonFlower.position.set(targets.fleur_lune.x, targets.fleur_lune.y + 0.35, targets.fleur_lune.z);
  root.add(moonFlower);

  // Coffres
  const chest = (id, x, z, type = 'supply', extra = {}) => crates.push({ id, type, look: 'chest', x, y: H(x, z), z, rot: rand() * 6, ...extra });
  chest('chest_sanct', PLACES.sanctuary.x + 4, PLACES.sanctuary.z - 4);
  chest('chest_tower', PLACES.tower.x + 4, PLACES.tower.z + 5, 'elite');
  chest('chest_fort', PLACES.fort.x, PLACES.fort.z - 6, 'elite');
  chest('chest_aube', PLACES.seal_aube.x - 5, PLACES.seal_aube.z + 9, 'supply', { lockedUntil: { mission: 'w02_aube', step: 1 } });
  chest('chest_marees', PLACES.seal_marees.x + 5, PLACES.seal_marees.z - 9, 'supply', { lockedUntil: { mission: 'w03_marees', step: 1 } });
  chest('chest_cendres', PLACES.seal_cendres.x + 9, PLACES.seal_cendres.z + 4, 'supply', { lockedUntil: { mission: 'w04_cendres', step: 1 } });
  chest('chest_lake', 96, 186);
  chest('chest_forest', -150, -70);
  chest('chest_river', 64, -58);
  chest('boss_cache', PLACES.faille.x + 6, PLACES.faille.z + 14, 'boss', { hiddenUntil: { mission: 'w05_faille', step: 2 } });

  // Créatures : rôdeurs nocturnes + gardiens des sceaux (présents jour et nuit).
  const guard = (group, place, types, until) => types.forEach((type, i) => {
    const a = (i / types.length) * Math.PI * 2;
    const x = place.x + Math.cos(a) * 9;
    const z = place.z + Math.sin(a) * 9;
    enemySpawns.push({ after: 'w01_reveil', until, always: true, type, x, z, group, patrol: [[x, z], [place.x + Math.cos(a + 1.2) * 11, place.z + Math.sin(a + 1.2) * 11]] });
  });
  guard('seal_aube', PLACES.seal_aube, ['stalker', 'stalker', 'stalker'], 'w02_aube');
  guard('seal_marees', PLACES.seal_marees, ['stalker', 'stalker', 'brute'], 'w03_marees');
  guard('seal_cendres', PLACES.seal_cendres, ['stalker', 'stalker', 'stalker', 'brute'], 'w04_cendres');
  for (const [x, z] of [[-150, -95], [-140, -85], [-160, -80], [-135, -100]]) {
    enemySpawns.push({ after: 'w01_reveil', type: 'stalker', x, z, group: 'loups', patrol: [[x, z], [x + 12, z - 8]] });
  }
  for (const [x, z, type] of [[40, 90, 'stalker'], [-80, 40, 'stalker'], [110, -10, 'stalker'], [-120, 120, 'stalker'], [160, -120, 'brute'], [60, 200, 'stalker'], [-60, -100, 'stalker'], [210, 30, 'stalker'], [-220, 60, 'stalker'], [0, -180, 'brute']]) {
    if (H(x, z) < WORLD.water + 0.5) continue;
    enemySpawns.push({ after: 'w01_reveil', type, x, z, group: 'wild', patrol: [[x, z], [x + 14, z + 6], [x - 6, z + 12]] });
  }

  // ---------- Objets soulevables (magnétisme) ----------
  const magnetSpots = [];
  for (const [key, p] of Object.entries(PLACES)) {
    if (['brumeval', 'cendreval', 'port_saule'].includes(key)) {
      for (let i = 0; i < 3; i++) {
        const a = rand() * Math.PI * 2;
        const d = p.r * (0.25 + rand() * 0.15);
        magnetSpots.push({ kind: i === 0 ? 'cart' : 'barrel', x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, yaw: rand() * 6 });
      }
    }
  }
  // Rochers près des lieux, des chemins et des Sceaux (armes de fortune).
  for (let i = 0, n = 0; i < 400 && n < 70; i++) {
    const x = R(-WORLD.play + 20, WORLD.play - 20);
    const z = R(-WORLD.play + 20, WORLD.play - 20);
    const h = H(x, z);
    if (h < WORLD.water + 0.5 || terrain.slopeAt(x, z) > 0.6 || nearPlace(x, z, 3)) continue;
    const near = Object.values(PLACES).some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 45) || terrain.pathAt(x, z) > 0 || rand() < 0.25;
    if (!near) continue;
    magnetSpots.push({ kind: 'boulder', x, z, yaw: rand() * 6 });
    n++;
  }

  // ---------- Lucioles (la nuit, autour de Noa) ----------
  const ffCount = low ? 60 : 180;
  const ffGeo = new THREE.BufferGeometry();
  const ffSeed = new Float32Array(ffCount * 3);
  for (let i = 0; i < ffCount * 3; i++) ffSeed[i] = rand();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ffCount * 3), 3));
  const glow = document.createElement('canvas');
  glow.width = glow.height = 32;
  {
    const gx = glow.getContext('2d');
    const gr = gx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = gr;
    gx.fillRect(0, 0, 32, 32);
  }
  const ffMat = new THREE.PointsMaterial({ color: '#d8ff9a', size: 0.35, map: new THREE.CanvasTexture(glow), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  root.add(fireflies);
  updaters.push((dt, t, cam, player) => {
    if (ffMat.opacity <= 0) return;
    const p = ffGeo.attributes.position;
    for (let i = 0; i < ffCount; i++) {
      const sx = ffSeed[i * 3];
      const sz = ffSeed[i * 3 + 1];
      const sp = ffSeed[i * 3 + 2];
      const x = player.x + ((((sx * 60 + Math.sin(t * 0.3 + sp * 9) * 3 - player.x) % 60) + 90) % 60) - 30;
      const z = player.z + ((((sz * 60 + Math.cos(t * 0.27 + sp * 7) * 3 - player.z) % 60) + 90) % 60) - 30;
      p.setXYZ(i, x, H(x, z) + 0.6 + Math.sin(t * 1.3 + sp * 20) * 0.5 + sp * 1.4, z);
    }
    p.needsUpdate = true;
  });

  // ---------- Lumières des lanternes (les plus proches seulement) ----------
  const nLights = { low: 2, medium: 4, high: 6, ultra: 8 }[quality] ?? 4;
  const pool = [];
  for (let i = 0; i < nLights; i++) {
    const l = new THREE.PointLight('#ffb45a', 0, 16, 1.8);
    root.add(l);
    pool.push(l);
  }
  let lampsOn = 0;
  let lightT = 0;
  updaters.push((dt, t, cam, player) => {
    lightT -= dt;
    if (lightT > 0) return;
    lightT = 0.4;
    const near = lanterns.map((p) => [p, p.distanceToSquared(player)]).sort((a, b) => a[1] - b[1]);
    pool.forEach((l, i) => {
      const n = near[i];
      if (!n || n[1] > 90 * 90) return (l.intensity = 0);
      l.position.copy(n[0]);
      l.intensity = 9 * lampsOn;
    });
  });

  // ---------- Herbe ----------
  let grass = null;
  let game = null;
  const benders = [];
  const blasts = []; // souffles d'ondes de choc { x, y, z, r, t }

  // ---------- Jour / nuit ----------
  const sealState = {};
  function setNight(kIn) {
    const k = Math.max(0, kIn);
    const dusk = THREE.MathUtils.smoothstep(kIn, -0.35, 0.25);
    lampsOn = dusk;
    windowMat.emissiveIntensity = 1.6 * dusk;
    lampMat.emissiveIntensity = 3 * dusk;
    ffMat.opacity = 0.9 * THREE.MathUtils.smoothstep(k, 0.4, 0.9);
    moonFlower.material.color.set(k > 0.4 ? '#9fe8ff' : '#e8f0ff');
    for (const m of riftMats) if (m.uniforms?.uK) m.uniforms.uK.value = 0.35 + k * 0.65;
  }
  // Sceau ranimé : runes bleues apaisées au lieu du rouge.
  function setSeal(id, restored) {
    sealState[id] = restored;
    const m = sealRunes[id];
    if (!m) return;
    m.emissive.set(restored ? '#7fe3ff' : '#ff4060');
    m.emissiveIntensity = restored ? 2.2 : 1.6;
  }

  const spawn = { x: PLACES.sanctuary.x, y: H(PLACES.sanctuary.x, PLACES.sanctuary.z + 4) + 0.3, z: PLACES.sanctuary.z + 4, yaw: 0 };
  const rain = new THREE.Group(); // pas de pluie dans les Marches (nuits claires)

  return {
    kind: 'wilds',
    root, targets, enemySpawns, crates, magnetSpots, spawn, lampLights, nightHooks: [], rain, drawCalls,
    smokeSources: [],
    terrain, places: PLACES, doors, steles: STELES,
    raining: false,
    // Interface commune avec la ville (sans objet ici).
    street: { cars: [], steam: [], traffic: {}, setTraffic() {}, schoolStop: null },
    setBarricades() {}, toppleMonument() {}, setPower() {},
    makeCar: () => new THREE.Group(),
    setNight, setSeal,
    blast(p, r, k = 1) {
      blasts.push({ x: p.x, y: p.y, z: p.z, r, k: Math.min(1.5, k), t: 0 });
      if (blasts.length > 3) blasts.shift();
    },
    // Herbe et lumière : branchées au jeu après sa création (renderer, acteurs).
    attach(g) {
      game = g;
      grass = new Grass(scene, g.renderer, terrain, quality);
    },
    update(dt, t, cam, player) {
      for (const u of updaters) u(dt, t, cam, player);
      if (!grass || !game) return;
      // Ceux qui écartent l'herbe : Noa d'abord, puis les plus proches.
      benders.length = 0;
      const h = game.hero;
      const low = h.flying ? h.pos.y - H(h.pos.x, h.pos.z) : 0;
      if (h.flying && low < 6) benders.push({ x: h.pos.x, y: H(h.pos.x, h.pos.z), z: h.pos.z, r: 4.5 - low * 0.5, trample: 0.6 });
      else benders.push({ x: h.pos.x, y: h.pos.y, z: h.pos.z, r: h.form === 'umbra' ? 1.6 : 0.95, trample: h.grounded ? 1 : 0 });
      const others = [];
      for (const e of game.enemies) if (e.alive) others.push(e.pos);
      for (const n of game.story?.npcs || []) others.push(n.pos);
      others.sort((a, b) => a.distanceToSquared(h.pos) - b.distanceToSquared(h.pos));
      for (let i = blasts.length - 1; i >= 0; i--) {
        const b = blasts[i];
        b.t += dt;
        if (b.t > 1.4) blasts.splice(i, 1);
        else benders.push({ x: b.x, y: b.y, z: b.z, r: b.r * Math.min(1, 0.3 + b.t * 3), trample: b.k * (1 - b.t / 1.4) });
      }
      for (const p of others.slice(0, Math.max(0, 7 - benders.length + 1))) benders.push({ x: p.x, y: p.y, z: p.z, r: 1.1, trample: p.distanceToSquared(h.pos) < 900 ? 0.7 : 0 });
      grass.update(dt, cam.position, benders, h.pos);
    },
    // Fond de la minicarte : couleurs du terrain vues de dessus.
    minimapBase(half, res) {
      const size = half * 2 * res;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      const img = x.createImageData(size, size);
      const step = 2;
      for (let j = 0; j < size; j += step) {
        for (let i = 0; i < size; i += step) {
          const wx = i / res - half;
          const wz = j / res - half;
          const hh = H(wx, wz);
          let r = 40;
          let g = 58;
          let b = 34;
          if (hh < WORLD.water) [r, g, b] = [28, 58, 86];
          else if (terrain.pathAt(wx, wz) > 0.3) [r, g, b] = [120, 98, 70];
          else if (terrain.slopeAt(wx, wz) > 0.7 || hh > 60) [r, g, b] = [96, 92, 88];
          const shade = 0.75 + Math.min(0.5, Math.max(0, hh / 120));
          for (let dj = 0; dj < step; dj++) for (let di = 0; di < step; di++) {
            const o = ((j + dj) * size + i + di) * 4;
            img.data[o] = r * shade;
            img.data[o + 1] = g * shade;
            img.data[o + 2] = b * shade;
            img.data[o + 3] = 255;
          }
        }
      }
      x.putImageData(img, 0, 0);
      // Bâtiments et ruines
      for (const box of col.boxes) {
        if (box.tag !== 'building') continue;
        x.fillStyle = '#3a2e26';
        x.fillRect((box.min.x + half) * res, (box.min.z + half) * res, (box.max.x - box.min.x) * res, (box.max.z - box.min.z) * res);
      }
      // Noms des lieux
      x.font = `bold ${7 * res}px system-ui, sans-serif`;
      x.textAlign = 'center';
      for (const p of Object.values(PLACES)) {
        x.fillStyle = 'rgba(0,0,0,0.6)';
        x.fillText(p.name, (p.x + half) * res + 2, (p.z + half) * res - p.r * res * 0.6 + 2);
        x.fillStyle = '#f0e6c8';
        x.fillText(p.name, (p.x + half) * res, (p.z + half) * res - p.r * res * 0.6);
      }
      return c;
    },
  };
}
