// Quartiers autour du centre-ville : transforme le petit centre (≈152 m) en
// monde ouvert (carte ±300 m).
//
// Découpage (Y vers le haut, sol à y = 0, « nord » = -Z comme dans downtown.js) :
//   routes   : avenues x = 0 et z = 0 (-8..8), périphérique intérieur 62..76,
//              périphérique extérieur 192..208 (deux signes, deux axes) ;
//   îlots    : bandes A = [-192,-76], B = [-62,-8], C = [8,62], D = [76,192] ;
//              le centre-ville occupe (B|C)×(B|C) et n'est pas touché ici ;
//   ceinture : nature au-delà de ±208 jusqu'au bord de carte ±300.
//
// Chaque quartier est un THREE.Group distinct (masquable à distance par le
// moteur), avec ses propres lots d'instances et son kit d'immeubles, puis une
// fusion des maillages statiques (mergeStatic) : quelques dizaines d'appels de
// dessin par quartier. Tout ce qui est solide reçoit une boîte de collision.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBuildingKit } from './buildings.js';
import { M, mergeStatic } from './helpers.js';
import { ribbedTexture, sidewalkTexture, signTexture, awningTexture } from './textures.js';
import { mulberry32 } from '../core/rng.js';

const S = 0.15; // épaisseur des dalles praticables (trottoirs, pelouses)
const BAND = { A: [-192, -76], B: [-62, -8], C: [8, 62], D: [76, 192] };
// Bandes de routes (pour éviter d'y poser des décors).
const ROAD_BANDS = [[-208, -192], [-76, -62], [-8, 8], [62, 76], [192, 208]];
const onRoadBand = (v, pad = 0) => ROAD_BANDS.some(([a, b]) => v > a - pad && v < b + pad);

// ---------- Textures procédurales locales (canvas, mises en cache) ----------
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// Herbe cartoon : aplat vert, taches plus claires/sombres, petites touffes.
function grassTexture() {
  return canvasTex('grass', 256, 256, (x, W, H) => {
    const r = mulberry32(41);
    x.fillStyle = '#5a9a5c';
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      x.fillStyle = ['rgba(120,190,110,0.22)', 'rgba(40,90,60,0.20)', 'rgba(90,160,90,0.25)'][i % 3];
      x.beginPath();
      x.ellipse(r() * W, r() * H, 10 + r() * 34, 6 + r() * 18, r() * 3, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = 'rgba(35,80,55,0.55)';
    x.lineWidth = 2;
    x.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const px = r() * W;
      const py = r() * H;
      x.beginPath();
      x.moveTo(px - 3, py - 4);
      x.lineTo(px, py + 2);
      x.lineTo(px + 3, py - 5);
      x.stroke();
    }
  });
}

// Eau cartoon : bleu profond + vaguelettes claires (défilement animé).
function waterTexture() {
  return canvasTex('water', 256, 256, (x, W, H) => {
    const r = mulberry32(17);
    x.fillStyle = '#2d5aa8';
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      x.fillStyle = 'rgba(70,120,200,0.45)';
      x.beginPath();
      x.ellipse(r() * W, r() * H, 14 + r() * 30, 5 + r() * 10, 0, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = 'rgba(170,225,255,0.75)';
    x.lineWidth = 3;
    x.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const px = r() * W;
      const py = r() * H;
      const l = 8 + r() * 14;
      x.beginPath();
      x.moveTo(px - l, py);
      x.quadraticCurveTo(px, py - 5, px + l, py);
      x.stroke();
    }
  });
}

// Grillage losangé (transparent, alphaTest).
function chainTexture() {
  return canvasTex('chain', 128, 128, (x, W) => {
    x.clearRect(0, 0, W, W);
    x.strokeStyle = '#ddd8ff';
    x.lineWidth = 4;
    for (let i = -W; i <= W * 2; i += 32) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + W, W);
      x.moveTo(i, 0);
      x.lineTo(i - W, W);
      x.stroke();
    }
    x.fillStyle = '#ddd8ff';
    x.fillRect(0, 0, W, 6); // fil de tension haut
  });
}

// Tuiles « écailles » (teintées par la couleur du matériau).
function shingleTexture() {
  return canvasTex('shingle', 256, 256, (x, W, H) => {
    x.fillStyle = '#d8d8e4';
    x.fillRect(0, 0, W, H);
    const rows = 8;
    const rh = H / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 16;
      for (let k = -1; k < W / 32 + 1; k++) {
        x.fillStyle = r % 3 === 0 ? '#ffffff' : '#f0f0f6';
        x.beginPath();
        x.moveTo(k * 32 + off, r * rh);
        x.lineTo(k * 32 + off, r * rh + rh * 0.55);
        x.quadraticCurveTo(k * 32 + off + 16, r * rh + rh * 1.05, k * 32 + off + 32, r * rh + rh * 0.55);
        x.lineTo(k * 32 + off + 32, r * rh);
        x.fill();
        x.strokeStyle = 'rgba(60,40,90,0.35)';
        x.lineWidth = 2;
        x.stroke();
      }
    }
  });
}

// Champ cultivé : sillons alternés.
function cropTexture(c1, c2) {
  return canvasTex('crop' + c1 + c2, 64, 64, (x, W, H) => {
    x.fillStyle = c1;
    x.fillRect(0, 0, W, H);
    x.fillStyle = c2;
    for (let i = 0; i < W; i += 16) x.fillRect(i + 2, 0, 8, H);
    x.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < W; i += 16) x.fillRect(i + 3, 0, 2, H);
  });
}

// ---------- Lot d'instances (une géométrie, un matériau, N transformations) ----------
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
class Inst {
  constructor(geo, material, { colored = false, shadow = false } = {}) {
    this.geo = geo;
    this.mat = material;
    this.colored = colored;
    this.shadow = shadow;
    this.items = [];
  }

  add(x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, color = null, pitch = 0, roll = 0) {
    this.items.push([x, y, z, yaw, sx, sy, sz, color, pitch, roll]);
  }

  build(parent) {
    if (!this.items.length) return null;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    this.items.forEach(([x, y, z, yaw, sx, sy, sz, color, pitch, roll], i) => {
      _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
      _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
      mesh.setMatrixAt(i, _m4);
      if (this.colored) mesh.setColorAt(i, _c.set(color || '#ffffff'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = true;
    mesh.userData.dynamic = true; // ne pas re-fusionner
    mesh.computeBoundingSphere();
    parent.add(mesh);
    this.mesh = mesh;
    return mesh;
  }
}

// Prisme triangulaire unitaire (pignon) : faîtage le long de X, section en Z-Y.
function prismGeo() {
  const sh = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-0.5, 0, 0);
  return g;
}

const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);

export function buildDistricts({ scene, col, quality = 'medium', rand = Math.random, lampLights = [] }) {
  const low = quality === 'low';
  const Q = { low: 0.45, medium: 0.75, high: 1 }[quality] ?? 0.75; // densité des décors
  const districts = [];
  const updaters = [];
  const kits = [];
  const R = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // ---------- Matériaux partagés ----------
  const matCache = new Map();
  const mat = (color, extra) => {
    const key = color + (extra ? JSON.stringify(extra) : '');
    if (!matCache.has(key)) matCache.set(key, M({ color, ...extra }));
    return matCache.get(key);
  };
  const T = { grass: grassTexture(), water: waterTexture(), chain: chainTexture(), shingle: shingleTexture(), side: sidewalkTexture() };
  const roofCache = new Map();
  const roofMat = (color) => {
    if (!roofCache.has(color)) roofCache.set(color, M({ map: T.shingle, color }));
    return roofCache.get(color);
  };
  const ribCache = new Map();
  const ribMat = (color) => {
    if (!ribCache.has(color)) ribCache.set(color, M({ map: ribbedTexture(color) }));
    return ribCache.get(color);
  };
  const MAT = {
    pave: M({ map: T.side }),
    paveWarm: M({ map: T.side, color: '#ffd6b8' }),
    paveCold: M({ map: T.side, color: '#cfdcff' }),
    concrete: M({ map: T.side, color: '#b2adc4' }),
    plaza: M({ map: T.side, color: '#ffe6c8', polygonOffset: true, polygonOffsetFactor: -1 }),
    grass: M({ map: T.grass }),
    grassDark: M({ map: T.grass, color: '#6f8a8c' }),
    lawn: M({ map: T.grass, color: '#e8ffe0', polygonOffset: true, polygonOffsetFactor: -1 }),
    path: M({ color: '#d9b88f', polygonOffset: true, polygonOffsetFactor: -2 }),
    dirt: M({ color: '#a8805a', polygonOffset: true, polygonOffsetFactor: -2 }),
    sand: M({ color: '#ecd29a', polygonOffset: true, polygonOffsetFactor: -2 }),
    asphalt: M({ color: '#4d4e60', polygonOffset: true, polygonOffsetFactor: -1 }),
    lines: M({ color: '#f4efe0', polygonOffset: true, polygonOffsetFactor: -3 }),
    track: M({ color: '#c4573f', polygonOffset: true, polygonOffsetFactor: -1 }),
    pitch: M({ map: T.grass, color: '#c8ffb8', polygonOffset: true, polygonOffsetFactor: -2 }),
    curb: mat('#aeaab9'),
    white: mat('#f4f0e8'),
    dark: mat('#454056'),
    metal: mat('#3a3448'),
    wood: mat('#c98a4a'),
    woodDark: mat('#7a4a3a'),
    stone: mat('#b9b2cc'),
    hedge: mat('#3f8a52'),
    trunk: mat('#7a4a3a'),
    water: M({ map: T.water, emissive: '#1b3c80', emissiveIntensity: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }),
    chain: (() => {
      const m = M({ map: T.chain, side: THREE.DoubleSide });
      m.alphaTest = 0.5;
      return m;
    })(),
    inst: M({ color: '#ffffff' }), // instances colorées
    lit: new THREE.MeshBasicMaterial({ color: '#ffffff' }), // fenêtres allumées (instances colorées)
    lampHead: M({ color: '#ffffff', emissive: '#ffd27a', emissiveIntensity: 2.2 }),
    coldHead: M({ color: '#ffffff', emissive: '#a8e6ff', emissiveIntensity: 2.2 }),
    blink: M({ color: '#330000', emissive: '#ff2030', emissiveIntensity: 3 }),
    glowPurple: M({ color: '#ffffff', emissive: '#b070ff', emissiveIntensity: 1.6 }),
    glowCyan: M({ color: '#ffffff', emissive: '#4dd2ff', emissiveIntensity: 2.2 }),
    glass: new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.35, depthWrite: false }),
    warmGlass: new THREE.MeshBasicMaterial({ color: '#ffe0a0' }),
  };

  // Géométries partagées (créées à la demande).
  const GEO = {};
  const geo = (k, f) => GEO[k] || (GEO[k] = f());
  const G = {
    ubox: () => geo('ubox', () => new THREE.BoxGeometry(1, 1, 1)),
    ubase: () => geo('ubase', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
    trunk: () => geo('trunk', () => new THREE.CylinderGeometry(0.6, 1, 1, 6).translate(0, 0.5, 0)),
    pole: () => geo('pole', () => new THREE.CylinderGeometry(0.07, 0.11, 1, 6).translate(0, 0.5, 0)),
    ball: () => geo('ball', () => new THREE.IcosahedronGeometry(1, 1)),
    ball0: () => geo('ball0', () => new THREE.IcosahedronGeometry(1, 0)),
    cyl: () => geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0)),
    crown: () => geo('crown', () => mergeGeometries([[0, 0.08, 0, 1.02], [0.62, -0.25, 0.22, 0.7], [-0.58, -0.18, -0.28, 0.74]]
      .map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, low ? 0 : 1).translate(x, y, z)))),
    pine: () => geo('pine', () => mergeGeometries([[1, 1.3, 0.65], [0.78, 1.1, 1.4], [0.52, 0.95, 2.05]]
      .map(([r, h, y]) => nonIdx(new THREE.ConeGeometry(r, h, 7).translate(0, y, 0))))),
    prism: () => geo('prism', prismGeo),
  };

  // ---------- Outils de construction ----------
  // Boîte aux UV « monde » (1 répétition = tile m ; 0 = une texture par face).
  function uvBox(w, h, d, tile) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tile) {
      const uv = g.attributes.uv;
      const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * (sizes[f][0] / tile), uv.getY(i) * (sizes[f][1] / tile));
      }
    }
    return g;
  }
  // Boîte min/max en coordonnées monde (+ collision sauf collide:false).
  function box(g, x0, y0, z0, x1, y1, z1, material, o = {}) {
    const m = new THREE.Mesh(uvBox(x1 - x0, y1 - y0, z1 - z0, o.tile ?? 0), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = !!o.cast && !low;
    m.receiveShadow = true;
    g.add(m);
    if (o.collide !== false) col.addBox({ x: x0, y: o.colY0 ?? y0, z: z0 }, { x: x1, y: o.colY1 ?? y1, z: z1 }, o.tag);
    return m;
  }
  // Boîte centrée en (x,z), posée à y, orientée (yaw) ; collision = emprise AABB.
  function cbox(g, x, y, z, sx, sy, sz, material, o = {}) {
    const m = new THREE.Mesh(o.tile ? uvBox(sx, sy, sz, o.tile) : G.ubox(), material);
    if (!o.tile) m.scale.set(sx, sy, sz);
    m.position.set(x, y + sy / 2, z);
    m.rotation.set(o.pitch || 0, o.yaw || 0, o.roll || 0, 'YXZ');
    m.castShadow = !!o.cast && !low;
    m.receiveShadow = true;
    g.add(m);
    if (o.collide !== false) {
      const c = Math.abs(Math.cos(o.yaw || 0));
      const s = Math.abs(Math.sin(o.yaw || 0));
      col.addCentered(x, o.colY0 ?? (y < 0.5 ? 0 : y), z, sx * c + sz * s, o.colH ?? sy + (y < 0.5 ? y : 0), sx * s + sz * c, o.tag);
    }
    return m;
  }
  function cyl(g, x, y, z, rb, rt, h, material, o = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 8), material);
    m.position.set(x, y + h / 2, z);
    if (o.rotY) m.rotation.y = o.rotY;
    m.castShadow = !!o.cast && !low;
    m.receiveShadow = true;
    g.add(m);
    if (o.collide !== false) col.addCentered(x, y < 0.5 ? 0 : y, z, Math.max(rb, rt) * 1.7, h + (y < 0.5 ? y : 0), Math.max(rb, rt) * 1.7, o.tag);
    return m;
  }
  // Plan horizontal (UV monde).
  function flat(g, x0, z0, x1, z1, y, material, tile = 4) {
    const w = x1 - x0;
    const d = z1 - z0;
    const geom = new THREE.PlaneGeometry(w, d);
    const uv = geom.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (d / tile));
    geom.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geom, material);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  function disc(g, x, z, r, y, material, seg = 20, tile = 4) {
    const geom = new THREE.CircleGeometry(r, seg);
    const uv = geom.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * r / tile), uv.getY(i) * (2 * r / tile));
    geom.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geom, material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  // Ruban plat lissé (allées sinueuses) ; renvoie les points échantillonnés.
  function ribbon(g, pts, width, y, material, closed = false) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, z)), closed, 'catmullrom', 0.5);
    const n = Math.max(2, Math.ceil(curve.getLength() / 1.5));
    const P = curve.getSpacedPoints(n);
    const pos = [];
    const uv = [];
    const nor = [];
    const idx = [];
    let dist = 0;
    for (let i = 0; i <= n; i++) {
      const p = P[i];
      const a = P[Math.max(0, i - 1)];
      const b = P[Math.min(n, i + 1)];
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      if (i > 0) dist += p.distanceTo(P[i - 1]);
      pos.push(p.x - tz * width / 2, y, p.z + tx * width / 2, p.x + tz * width / 2, y, p.z - tx * width / 2);
      uv.push(0, dist / 4, width / 4, dist / 4);
      nor.push(0, 1, 0, 0, 1, 0);
      if (i < n) {
        const k = i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geom.setIndex(idx);
    const m = new THREE.Mesh(geom, material);
    m.receiveShadow = true;
    g.add(m);
    return P.map((v) => [v.x, v.z]);
  }
  // Enseigne (texte français, police cartoon) ; matériau partagé par texte.
  const signMats = new Map();
  function sign(g, text, color, bg, x, y, z, yaw, w, h, o = {}) {
    const key = text + '|' + color + '|' + bg + (o.both ? '|2' : '');
    if (!signMats.has(key)) signMats.set(key, new THREE.MeshBasicMaterial({ map: signTexture(text, color, bg), side: o.both ? THREE.DoubleSide : THREE.FrontSide }));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMats.get(key));
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    g.add(m);
    return m;
  }
  // Lumière réelle de lampadaire : activée par le moteur selon la proximité.
  function addLight(g, x, y, z, color = '#ffc46b') {
    const light = new THREE.PointLight(color, 0, 22, 1.6);
    light.position.set(x, y, z);
    light.visible = false;
    g.add(light);
    lampLights.push({ light, priority: 3, base: 22 });
    return light;
  }
  // Dalle d'îlot praticable (15 cm) + bordure, comme les trottoirs du centre.
  function slab(ctx, x0, z0, x1, z1, material, tile = 4) {
    box(ctx.group, x0, 0, z0, x1, S, z1, material, { tile });
    box(ctx.group, x0 - 0.15, -0.025, z0 - 0.15, x1 + 0.15, S - 0.005, z1 + 0.15, MAT.curb, { collide: false });
  }
  // Points de contrôle : collision gênante près d'un point ?
  function blocked(x, z, r = 1, maxY = 0.3) {
    for (const b of col.query(x - r, z - r, x + r, z + r)) {
      if (b.max.y <= maxY || b.disabled) continue;
      if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
    }
    return false;
  }

  // ---------- Contexte d'un quartier ----------
  function district(name, bounds) {
    const group = new THREE.Group();
    group.name = name;
    scene.add(group);
    const batches = new Map();
    const ctx = {
      name,
      group,
      bounds,
      kit: null,
      paths: [], // points des allées (pour écarter arbres et décors)
      I(key, geoFn, material, opts) {
        let b = batches.get(key);
        if (!b) {
          b = new Inst(geoFn(), material, opts);
          batches.set(key, b);
        }
        return b;
      },
      useKit() {
        if (!ctx.kit) ctx.kit = createBuildingKit(group, col, rand, quality);
        return ctx.kit;
      },
      nearPath(x, z, d) {
        const d2 = d * d;
        for (const p of ctx.paths) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < d2) return true;
        return false;
      },
      finish() {
        for (const b of batches.values()) b.build(group);
        if (ctx.kit) {
          ctx.kit.finalize();
          kits.push(ctx.kit);
        }
        // Enseignes de boutiques du kit : un matériau par texture (fusionnables).
        const canon = new Map();
        group.traverse((o) => {
          if (!o.isMesh || o.isInstancedMesh || !o.material?.isMeshBasicMaterial || !o.material.map) return;
          const k = o.material.map.uuid + ':' + o.material.side;
          if (!canon.has(k)) canon.set(k, o.material);
          else o.material = canon.get(k);
        });
        ctx.merged = mergeStatic(group);
        districts.push({ name, group, bounds });
      },
    };
    return ctx;
  }

  // ---------- Décors réutilisables ----------
  const LEAF = ['#2fa88a', '#3cc29a', '#58b368', '#4a9e6a'];
  const PINE = ['#1f5a4a', '#245048', '#2b4a5a', '#1d4a3c', '#33505e'];
  // Arbre : 'round' (tilleul), 'pine' (sapin), 'dead' (arbre mort). y = sol.
  function tree(ctx, kind, x, y, z, s = 1, color) {
    if (kind === 'pine') {
      ctx.I('trunk', G.trunk, MAT.trunk).add(x, y, z, 0, 0.28 * s, 1.6 * s, 0.28 * s);
      ctx.I('pine', G.pine, MAT.inst, { colored: true }).add(x, y + 0.9 * s, z, rand() * 6, 2.1 * s, 2.7 * s, 2.1 * s, color || pick(PINE));
    } else if (kind === 'dead') {
      const h = 4.5 * s;
      ctx.I('deadTrunk', G.trunk, mat('#3a2c3e')).add(x, y, z, 0, 0.22 * s, h, 0.22 * s);
      for (let k = 0; k < 3; k++) {
        const a = rand() * Math.PI * 2;
        const l = (1.4 + rand()) * s;
        ctx.I('deadBranch', G.ubox, mat('#3a2c3e')).add(x + Math.sin(a) * l * 0.35, y + h * (0.55 + k * 0.15), z + Math.cos(a) * l * 0.35, a, 0.12 * s, 0.12 * s, l, null, -0.7);
      }
    } else {
      const h = 2.4 * s;
      ctx.I('trunk', G.trunk, MAT.trunk).add(x, y, z, 0, 0.2 * s, h + 0.4 * s, 0.2 * s);
      ctx.I('crown', G.crown, MAT.inst, { colored: true }).add(x, y + h + 0.6 * s, z, rand() * 6, 1.55 * s, 1.35 * s, 1.55 * s, color || pick(LEAF));
    }
    col.addCentered(x, 0, z, 0.6, y + 4, 0.6);
  }
  // Banc (le dossier est côté -Z local, on s'assoit face à +Z local).
  function bench(ctx, x, z, yaw, y = S) {
    ctx.I('benchWood', () => mergeGeometries([
      ...[0, 1, 2].map((i) => new THREE.BoxGeometry(1.8, 0.07, 0.14).translate(0, 0.5, -0.15 + i * 0.16)),
      ...[0, 1].map((i) => new THREE.BoxGeometry(1.8, 0.14, 0.06).translate(0, 0.75 + i * 0.2, -0.28)),
    ].map(nonIdx)), MAT.wood).add(x, y, z, yaw);
    ctx.I('benchLeg', () => mergeGeometries([-0.75, 0.75].map((k) => nonIdx(new THREE.BoxGeometry(0.08, 0.5, 0.5).translate(k, 0.25, -0.05)))), MAT.dark).add(x, y, z, yaw);
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    col.addCentered(x, 0, z, 1.9 * c + 0.6 * s, y + 0.55, 1.9 * s + 0.6 * c);
  }
  // Lampadaire de parc / ruelle (tête émissive) ; light = vraie lumière.
  function postLamp(ctx, x, y, z, { light = false, cold = false, h = 4.2 } = {}) {
    ctx.I('lpole', G.pole, MAT.dark).add(x, y, z, 0, 1.2, h, 1.2);
    ctx.I(cold ? 'lheadC' : 'lhead', G.ball, cold ? MAT.coldHead : MAT.lampHead).add(x, y + h + 0.2, z, 0, 0.3, 0.26, 0.3);
    ctx.I('lcap', () => geo('lcap', () => new THREE.ConeGeometry(0.42, 0.3, 8)), MAT.dark).add(x, y + h + 0.5, z);
    col.addCentered(x, 0, z, 0.3, y + h, 0.3);
    if (light) addLight(ctx.group, x, y + h, z, cold ? '#a8e6ff' : '#ffc46b');
  }
  // Clôture rectiligne alignée sur un axe ; gaps = intervalles laissés ouverts.
  // kind : 'chain' (grillage 2,4 m), 'picket' (piquets 0,95 m), 'iron' (barreaux 1,9 m), 'wood' (lisses 1,2 m).
  function fence(ctx, x0, z0, x1, z1, kind, { gaps = [], y = S, color = '#f4f0e8' } = {}) {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const c = alongX ? z0 : x0;
    const P = (u) => (alongX ? [u, c] : [c, u]);
    const yaw = alongX ? 0 : Math.PI / 2;
    const spec = { chain: [2.4, 3], picket: [0.95, 2.4], iron: [1.9, 2.5], wood: [1.15, 2.5] }[kind];
    const [h, step] = spec;
    const segs = [];
    let a = a0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > a) segs.push([a, Math.min(g0, a1)]);
      a = Math.max(a, g1);
    }
    if (a < a1) segs.push([a, a1]);
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      if (len < 0.3) continue;
      const [cx, cz] = P((s0 + s1) / 2);
      col.addCentered(cx, 0, cz, alongX ? len : 0.3, y + h, alongX ? 0.3 : len);
      const n = Math.max(1, Math.round(len / step));
      for (let i = 0; i <= n; i++) {
        const [px, pz] = P(s0 + (len * i) / n);
        if (kind === 'chain' || kind === 'iron') ctx.I('fpostM', G.ubase, MAT.metal).add(px, y, pz, yaw, 0.1, h + 0.1, 0.1);
        else ctx.I(kind === 'picket' ? 'fpostP' : 'fpostW', G.ubase, kind === 'picket' ? MAT.inst : MAT.woodDark, { colored: kind === 'picket' }).add(px, y, pz, yaw, 0.12, h + 0.08, 0.12, color);
      }
      if (kind === 'chain') {
        const pg = new THREE.PlaneGeometry(len, h);
        const uv = pg.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * h);
        const m = new THREE.Mesh(pg, MAT.chain);
        m.position.set(cx, y + h / 2, cz);
        m.rotation.y = yaw;
        ctx.group.add(m);
        ctx.I('frail', G.ubox, MAT.metal).add(cx, y + h, cz, yaw, len, 0.06, 0.06);
      } else if (kind === 'picket') {
        const sp = low ? 0.45 : 0.32;
        const k = Math.max(1, Math.floor(len / sp));
        for (let i = 0; i < k; i++) {
          const [px, pz] = P(s0 + (i + 0.5) * (len / k));
          ctx.I('picket', () => mergeGeometries([new THREE.BoxGeometry(0.1, 0.8, 0.04).translate(0, 0.4, 0), new THREE.BoxGeometry(0.07, 0.07, 0.04).rotateZ(Math.PI / 4).translate(0, 0.8, 0)].map(nonIdx)), MAT.inst, { colored: true })
            .add(px, y, pz, yaw, 1, 1, 1, color);
        }
        for (const ry of [0.25, 0.62]) ctx.I('rail', G.ubox, MAT.inst, { colored: true }).add(cx, y + ry, cz, yaw, len, 0.07, 0.05, color);
      } else if (kind === 'iron') {
        const sp = low ? 0.4 : 0.2;
        const k = Math.max(1, Math.floor(len / sp));
        for (let i = 0; i < k; i++) {
          const [px, pz] = P(s0 + (i + 0.5) * (len / k));
          ctx.I('bar', G.ubase, MAT.dark).add(px, y, pz, yaw, 0.04, h, 0.04);
        }
        for (const ry of [0.15, h - 0.12]) ctx.I('irail', G.ubox, MAT.dark).add(cx, y + ry, cz, yaw, len, 0.07, 0.06);
      } else {
        for (const ry of [0.4, 0.95]) ctx.I('wrail', G.ubox, MAT.wood).add(cx, y + ry, cz, yaw, len, 0.12, 0.06);
      }
    }
  }
  function hedge(ctx, x0, z0, x1, z1, h = 1.1) {
    box(ctx.group, x0, S, z0, x1, S + h, z1, MAT.hedge, { colY0: 0 });
  }
  // Conteneur maritime (12,2 × 2,6 × 2,44) ; alongX = longueur selon X.
  function container(ctx, x0, y, z0, alongX, color, len = 12.2) {
    const sx = alongX ? len : 2.44;
    const sz = alongX ? 2.44 : len;
    return box(ctx.group, x0, y, z0, x0 + sx, y + 2.6, z0 + sz, ribMat(color), { cast: true, colY0: y < 0.5 ? 0 : y });
  }
  // Toit à deux pans : pignons couleur mur + pans de tuiles débordants.
  function gableRoof(g, cx, cz, yTop, len, width, rh, wallM, roofM, alongX, ov = 0.55, thick = 0.22) {
    const rg = new THREE.Group();
    rg.position.set(cx, yTop, cz);
    if (!alongX) rg.rotation.y = Math.PI / 2;
    g.add(rg);
    const gab = new THREE.Mesh(G.prism(), wallM);
    gab.scale.set(len, rh, width);
    rg.add(gab);
    const hw = width / 2;
    const a = Math.atan2(rh, hw);
    const sl = (hw + ov) / Math.cos(a);
    const ey = -ov * Math.tan(a);
    for (const sg of [-1, 1]) {
      const p = new THREE.Mesh(G.ubox(), roofM);
      p.scale.set(len + ov * 1.4, thick, sl);
      p.position.set(0, (ey + rh) / 2 + thick / 2, (sg * (hw + ov)) / 2);
      p.rotation.x = sg * a;
      p.castShadow = !low;
      rg.add(p);
    }
    const ridge = new THREE.Mesh(G.ubox(), roofM);
    ridge.scale.set(len + ov * 1.4, 0.18, 0.4);
    ridge.position.set(0, rh + 0.12, 0);
    rg.add(ridge);
    return rg;
  }
  // Bus shelter (même style que l'abribus de street.js).
  function busShelter(ctx, x, z, label) {
    const g = new THREE.Group();
    const roofS = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.6), mat('#3d6fd1'));
    roofS.position.y = 2.6;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), MAT.glass);
    back.position.set(0, 1.45, 0.7);
    back.rotation.y = Math.PI;
    for (const k of [-1.7, 1.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), MAT.dark);
      post.position.set(k, 1.3, 0.7);
      g.add(post);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.4), MAT.wood);
    seat.position.set(-0.6, 0.5, 0.45);
    g.add(roofS, back, seat);
    g.position.set(x, S, z);
    ctx.group.add(g);
    // Panneaux (enseigne sur l'avant du toit + plaque d'arrêt)
    sign(ctx.group, label, '#ffffff', '#3d6fd1', x, S + 2.95, z - 0.81, Math.PI, 2.4, 0.6);
    sign(ctx.group, 'BUS 12', '#ffffff', '#3d6fd1', x - 1.4, S + 3.15, z, Math.PI / 2, 1.2, 0.4, { both: true });
    sign(ctx.group, 'LIGNE 12', '#ffcd20', '#7b4ad6', x + 1.15, S + 1.45, z + 0.68, Math.PI, 1.1, 0.5);
    col.addBox({ x: x - 1.8, y: 0, z: z + 0.6 }, { x: x + 1.8, y: 2.6, z: z + 0.8 });
  }
  // Drapeau ondulant (maillage dynamique animé dans update).
  const flags = [];
  function flag(ctx, x, y, z, yaw, text, c1, c2, w = 3, h = 1.8) {
    const geom = new THREE.PlaneGeometry(w, h, 10, 1).translate(w / 2, 0, 0);
    const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: signTexture(text, c1, c2), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.userData.dynamic = true;
    ctx.group.add(m);
    flags.push({ m, base: Float32Array.from(geom.attributes.position.array), w, ph: rand() * 6 });
  }

  // ---------- Points d'intérêt ----------
  const targets = {
    school_door: { x: 136, y: S, z: 32.6 },
    school_gate: { x: 136, y: S, z: 9.5 },
    bus_school: { x: 124, y: S, z: 9.0 },
    home_door: { x: 30, y: S, z: 78.6 },
    home_mailbox: { x: 32.1, y: S, z: 78.1 },
    park_entrance: { x: -76.5, y: S, z: 30 },
    park_cafe: { x: -104.6, y: S + 0.08, z: 22 },
    park_pond: { x: -114.8, y: S, z: 35 },
    park_fountain: { x: -134, y: S, z: -25 },
    aegis_tower: { x: 35, y: S, z: -78.6 },
    harbor: { x: 20, y: S, z: -210.2 },
    stadium: { x: 134, y: S, z: -32 },
    stadium_gate: { x: 134, y: S, z: -9.4 },
    industrial_gate: { x: -131, y: S, z: -77 },
    forest_trail: { x: -214, y: 0, z: 0 },
  };

  const P = (x, z) => [x, z];
  // Points d'un ovale « stade » (piste) de demi-largeur r autour de (134, -32).
  const stadiumPts = (r, step = 3) => {
    const pts = [];
    for (let x = 104; x < 164; x += step) pts.push([x, -32 - r]);
    for (let a = -Math.PI / 2; a < Math.PI / 2; a += step / r) pts.push([164 + Math.cos(a) * r, -32 + Math.sin(a) * r]);
    for (let x = 164; x > 104; x -= step) pts.push([x, -32 + r]);
    for (let a = Math.PI / 2; a < Math.PI * 1.5; a += step / r) pts.push([104 + Math.cos(a) * r, -32 + Math.sin(a) * r]);
    return pts;
  };
  const ringPts = (cx, cz, r, n, a0 = 0) => Array.from({ length: n }, (_, i) => P(cx + Math.cos(a0 + (i / n) * 6.283) * r, cz + Math.sin(a0 + (i / n) * 6.283) * r));
  const enemySpawns = [
    // Parc : rôdeurs autour de l'étang, crawler près de l'aire de jeux
    { after: 'p03_rings', type: 'stalker', x: -134, z: 53.5, group: 'park', patrol: ringPts(-134, 35, 18.5, 12, Math.PI / 2) },
    { after: 'p03_rings', type: 'stalker', x: -127.4, z: -35, group: 'park', patrol: ringPts(-134, -35, 6.6, 10) },
    { after: 'p03_rings', type: 'crawler', x: -152, z: -40, group: 'park', patrol: [[-152, -40], [-160, -24], [-150, -18]] },
    // Zone industrielle
    { after: 'p03_rings', type: 'stalker', x: -145, z: -90, group: 'industrial', patrol: [[-145, -90], [-100, -90], [-100, -95]] },
    { after: 'p03_rings', type: 'crawler', x: -112, z: -116, group: 'industrial', patrol: [[-112, -116], [-135, -116], [-135, -108]] },
    { after: 'p03_rings', type: 'brute', x: -125, z: -152, group: 'industrial', patrol: [[-125, -152], [-145, -152], [-145, -138]] },
    // Port
    { after: 'p03_rings', type: 'stalker', x: -80, z: -210.2, group: 'port', patrol: [[-80, -210.2], [-150, -210.2]] },
    { after: 'p03_rings', type: 'stalker', x: 110, z: -210.2, group: 'port', patrol: [[110, -210.2], [160, -210.2]] },
    { after: 'p03_rings', type: 'brute', x: 20, z: -210.2, group: 'port', patrol: [[20, -210.2], [-20, -210.2], [60, -210.2]] },
    // Les Tilleuls
    { after: 'p03_rings', type: 'stalker', x: 30, z: 103.4, group: 'suburb', patrol: [[30, 103.4], [58, 103.4], [12, 103.4]] },
    { after: 'p03_rings', type: 'crawler', x: 130, z: 135.4, group: 'suburb', patrol: [[130, 135.4], [180, 135.4], [90, 135.4]] },
    // Stade
    { after: 'p03_rings', type: 'stalker', x: 120, z: -30, group: 'stadium', patrol: [[120, -30], [150, -24], [150, -40]] },
    { after: 'p03_rings', type: 'stalker', x: 150, z: -40, group: 'stadium', patrol: ringPts(134, -32, 15.8, 8).map(([x, z]) => [134 + (x - 134) * 1.6, z]) },
    { after: 'p03_rings', type: 'brute', x: 134, z: -32, group: 'stadium', patrol: [[134, -32], [118, -32], [150, -32]] },
  ];
  // La patrouille du stade suit la piste (forme ovale élargie en x).
  enemySpawns[12].patrol = stadiumPts(15.8, 2);

  const crates = [
    { id: 'crate_supply_park', type: 'supply', x: -150, y: S, z: -18, rot: 0.4 },
    { id: 'crate_supply_campus', type: 'supply', x: 172, y: S, z: 31, rot: 0.9 },
    { id: 'crate_supply_stadium', type: 'supply', x: 178, y: S, z: -48, rot: 0.2 },
    { id: 'crate_supply_suburb', type: 'supply', x: 58, y: S, z: 135.4, rot: 1.3 },
    { id: 'crate_supply_port', type: 'supply', x: 158, y: S, z: -211, rot: 0.1 },
    { id: 'crate_supply_industrial', type: 'supply', x: -176, y: S, z: -91, rot: 0.7 },
    // Élite : au sommet de la pile de conteneurs (à escalader : caisse > conteneur > caisse…)
    { id: 'crate_elite_containers', type: 'elite', x: -127, y: S + 7.8, z: -110.8, rot: 0.3 },
  ];

  const magnetSpots = [
    // Parking du lycée
    { kind: 'car', x: 81, z: 18, yaw: Math.PI / 2 }, { kind: 'car', x: 81, z: 33, yaw: Math.PI / 2 },
    { kind: 'car', x: 91.5, z: 24, yaw: -Math.PI / 2 }, { kind: 'car', x: 91.5, z: 45, yaw: -Math.PI / 2 },
    // Stationnement le long des avenues
    { kind: 'car', x: 100, z: 6.2, yaw: Math.PI / 2 }, { kind: 'car', x: 170, z: -6.2, yaw: -Math.PI / 2 },
    { kind: 'car', x: -150, z: -6.2, yaw: -Math.PI / 2 }, { kind: 'car', x: 6.2, z: 150, yaw: 0 },
    { kind: 'car', x: -6.2, z: -130, yaw: Math.PI },
    // Ruelles des Tilleuls
    { kind: 'car', x: -30, z: 100.8, yaw: Math.PI / 2 }, { kind: 'car', x: 44, z: 100.8, yaw: Math.PI / 2 },
    { kind: 'car', x: 135, z: 132.8, yaw: -Math.PI / 2 }, { kind: 'dumpster', x: 160, z: 101.2, yaw: 0 },
    { kind: 'dumpster', x: -48, z: 132.4, yaw: 0 },
    // Zone industrielle
    { kind: 'dumpster', x: -118, z: -88.8, yaw: 0 }, { kind: 'dumpster', x: -145, z: -110, yaw: Math.PI / 2 },
    { kind: 'barrel', x: -100, z: -140, yaw: 0 }, { kind: 'barrel', x: -99, z: -141.2, yaw: 0 }, { kind: 'car', x: -160, z: -152, yaw: 0.3 },
    // Port
    { kind: 'barrel', x: -108, z: -208.9, yaw: 0 }, { kind: 'barrel', x: 76, z: -208.9, yaw: 0 }, { kind: 'barrel', x: 77.2, z: -209.0, yaw: 0 },
    { kind: 'car', x: -30, z: -195.5, yaw: Math.PI / 2 }, { kind: 'car', x: 140, z: -204.5, yaw: -Math.PI / 2 },
    // Rangée nord / affaires
    { kind: 'car', x: -20, z: -164, yaw: Math.PI / 2 }, { kind: 'car', x: 120, z: -194.5, yaw: Math.PI / 2 },
  ];

  // Boucles de promenade (jour) sur trottoirs et allées.
  const npcRoutes = [
    [[113, 16], [159, 16], [159, 30], [113, 30]], // parvis du lycée
    [[80, 9.7], [190, 9.7]], // trottoir de l'avenue (campus)
    stadiumPts(15.8, 3), // piste du stade
    [[80, -9.7], [126, -9.7]], // trottoir du stade
    [[-60, 103.4], [-10, 103.4]], // ruelle Tilleuls ouest
    [[10, 103.4], [60, 103.4]], // ruelle de Noa
    [[78, 135.4], [190, 135.4]], // ruelle Tilleuls est
    [[10, 76.5], [60, 76.5]], // trottoir devant chez Noa
    ringPts(-134, 35, 18.5, 12), // tour de l'étang
    [[-78, 30], [-92, 30.5], [-104, 32.5], [-115, 35]], // entrée du parc → étang
    ringPts(-134, -35, 6.6, 10), // autour de la fontaine
    ringPts(-134, 134, 9.5, 10), // kiosque à musique
    [[-145, -91], [-100, -91], [-100, -95], [-145, -95]], // cour industrielle
    [[-60, -161], [-12, -161]], // cour des immeubles nord
    [[10, -77.2], [60, -77.2]], // devant la grille AEGIS
    [[80, -118.5], [188, -118.5]], // esplanade d'affaires
    [[-150, -210.4], [150, -210.4]], // quai du port
  ];

  // Zones à garder libres (arbres et décors aléatoires) : trajets des PNJ,
  // patrouilles, caisses, objets magnétiques.
  const KEEP = [];
  for (const r of npcRoutes) r.forEach((p, i) => KEEP.push([p, r[(i + 1) % r.length]]));
  for (const e of enemySpawns) [[e.x, e.z], ...e.patrol].forEach((p, i, arr) => KEEP.push([p, arr[(i + 1) % arr.length]]));
  for (const c of [...crates, ...magnetSpots]) KEEP.push([[c.x, c.z], [c.x, c.z]]);
  const nearKeep = (x, z, d = 2.4) => KEEP.some(([[ax, az], [bx, bz]]) => {
    const vx = bx - ax;
    const vz = bz - az;
    const l2 = vx * vx + vz * vz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
    return (ax + vx * t - x) ** 2 + (az + vz * t - z) ** 2 < d * d;
  });

  // =====================================================================
  // 1. CAMPUS — LYCÉE VESPER-NORD (x 76..192, z 8..62)
  // =====================================================================
  const hangouts = { schoolyard: [], park: [], cafe: [] };
  {
    const d = district('campus', [76, 8, 192, 62]);
    const g = d.group;
    slab(d, 76, 8, 192, 62, MAT.pave);
    // Parvis pavé (teinte chaude)
    flat(g, 96, 11.4, 176, 34, S + 0.02, MAT.plaza);
    // Bâtiment principal : 3 niveaux, style bureaux
    const kit = d.useKit();
    kit.building(104, 34, 168, 60, 13, 'concrete', { style: 'office', noShops: true, seed: 4 });
    // Gymnase
    kit.building(172, 36, 190, 60, 9, 'brick', { style: 'brick', noShops: true, seed: 2 });
    sign(g, 'GYMNASE', '#ffcd20', '#2b2050', 181, 3.0, 35.6, Math.PI, 6, 1.5);
    box(g, 179.4, S, 35.85, 182.6, 2.5, 36, mat('#5a3a2a'), { collide: false });
    // Façade nord : grande enseigne au-dessus de la double porte (x = 136)
    sign(g, 'LYCÉE VESPER-NORD', '#ffffff', '#2f4fa8', 136, 3.45, 33.4, Math.PI, 13, 2.1);
    box(g, 133.9, S, 33.55, 138.1, 2.65, 34, MAT.dark, { collide: false }); // encadrement
    sign(g, 'LYCÉE VESPER-NORD', '#ffe27a', '#2f4fa8', 136, 16.3, 35.2, Math.PI, 18, 4);
    for (const k of [-7, 0, 7]) d.I('flagpole', G.pole, MAT.metal).add(136 + k, 13, 35.4, 0, 1.5, 2, 1.5);
    for (const k of [-0.76, 0.76]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 2.25), MAT.warmGlass);
      p.position.set(136 + k, S + 1.2, 33.53);
      p.rotation.y = Math.PI;
      g.add(p);
    }
    box(g, 135.95, S, 33.45, 136.05, 2.45, 33.55, MAT.dark, { collide: false }); // montant central
    box(g, 132.4, 0, 32.95, 139.6, S + 0.15, 33.6, MAT.stone); // marche d'entrée
    for (const k of [-2.6, 2.6]) d.I('lhead', G.ball, MAT.lampHead).add(136 + k, 2.3, 33.7, 0, 0.22, 0.22, 0.12);
    addLight(g, 136, 3.0, 31.0, '#ffd9a0');
    // Fenêtres du rez-de-chaussée (le kit laisse le socle aveugle sans commerces)
    for (let x = 107; x <= 166; x += 4) {
      if (Math.abs(x - 136) < 4.5) continue;
      d.I('gfWin', () => geo('gfWin', () => new THREE.PlaneGeometry(2.6, 1.7)), MAT.lit, { colored: true }).add(x, 2.2, 33.94, Math.PI, 1, 1, 1, rand() < 0.5 ? '#ffe8b0' : '#d0f4ff');
      d.I('gfSill', G.ubox, MAT.white).add(x, 1.28, 33.85, Math.PI, 2.9, 0.12, 0.3);
    }
    // Muret + grille côté avenue, portail ouvert entre x 128 et 144
    for (const [a, b] of [[96, 128], [144, 176]]) box(g, a, S, 11.0, b, 0.95, 11.4, MAT.stone, { colY1: 1.9, colY0: 0 });
    fence(d, 96, 11.2, 128, 11.2, 'iron', { y: 0.95 });
    fence(d, 144, 11.2, 176, 11.2, 'iron', { y: 0.95 });
    fence(d, 96, 11.2, 96, 34, 'iron');
    fence(d, 176, 11.2, 176, 34, 'iron');
    fence(d, 96, 34, 104, 34, 'iron');
    fence(d, 168, 34, 176, 34, 'iron');
    for (const px of [127.6, 144.4]) {
      cbox(g, px, S, 11.2, 1.0, 3.0, 1.0, MAT.stone, { cast: true });
      cbox(g, px, S + 3.0, 11.2, 1.2, 0.25, 1.2, MAT.white, { collide: false });
    }
    // Battants du portail, grands ouverts vers l'intérieur
    for (const px of [128.4, 143.6]) {
      for (const y of [0.25, 1.85]) d.I('irail', G.ubox, MAT.dark).add(px, S + y, 13.1, 0, 0.07, 0.08, 3.6);
      for (let i = 0; i < 18; i++) d.I('bar', G.ubase, MAT.dark).add(px, S, 11.4 + i * 0.2, 0, 0.04, 1.9, 0.04);
      col.addCentered(px, 0, 13.1, 0.2, S + 2, 3.6);
    }
    box(g, 127.6, 3.0, 11.1, 144.4, 3.15, 11.3, MAT.dark, { collide: false }); // linteau du portail
    // Abribus « LYCÉE »
    busShelter(d, 124, 9.8, 'LYCÉE');
    // Arbres en bacs, bancs, local à vélos, mât
    for (const [x, z] of [[104, 16], [104, 27], [118, 22], [154, 22], [168, 16], [168, 27]]) {
      cbox(g, x, S, z, 2.0, 0.6, 2.0, MAT.stone, { cast: true });
      tree(d, 'round', x, S + 0.6, z, 1.05);
    }
    for (const [x, z, yaw] of [[110, 19, -Math.PI / 2], [110, 25, -Math.PI / 2], [162, 19, Math.PI / 2], [162, 25, Math.PI / 2], [126, 28, Math.PI], [146, 28, Math.PI]]) bench(d, x, z, yaw);
    hangouts.schoolyard.push([112.5, 19, Math.PI / 2], [112.5, 24.5, Math.PI / 2], [159.5, 22, -Math.PI / 2], [126, 26, 0], [130, 24, -Math.PI / 2], [146, 25.5, Math.PI]);
    // Local à vélos (arceaux) + vélos
    for (let i = 0; i < 5; i++) d.I('hoop', () => geo('hoop', () => new THREE.TorusGeometry(0.42, 0.05, 4, 10, Math.PI)), MAT.metal).add(100 + i * 1.3, S + 0.1, 30.5, 0);
    col.addCentered(102.6, 0, 30.5, 6.6, 1.0, 1.2);
    const bike = (x, z, yaw, color) => {
      for (const k of [-0.55, 0.55]) d.I('wheel', () => geo('wheel', () => new THREE.TorusGeometry(0.33, 0.05, 4, 12)), MAT.dark).add(x + Math.sin(yaw) * k, S + 0.38, z + Math.cos(yaw) * k, yaw + Math.PI / 2);
      d.I('bframe', G.ubox, MAT.inst, { colored: true }).add(x, S + 0.62, z, yaw, 0.06, 0.06, 1.1, color);
      d.I('bframe', G.ubox, MAT.inst, { colored: true }).add(x, S + 0.55, z - Math.cos(yaw) * 0.1, yaw, 0.06, 0.5, 0.06, color);
    };
    bike(100.6, 30.5, 0, '#e8553f');
    bike(103.2, 30.5, 0, '#3d6fd1');
    bike(105.8, 30.5, 0, '#ffcd20');
    cyl(g, 150, S, 31, 0.5, 0.5, 0.4, MAT.stone);
    d.I('flagpole', G.pole, MAT.white).add(150, S, 31, 0, 1, 10, 1);
    flag(d, 150.08, 8.9, 31, -Math.PI / 2, 'VESPER', '#ffd23f', '#5b4ad6');
    // Panneau d'affichage
    cbox(g, 116, S, 31.6, 3.2, 2.2, 0.25, MAT.woodDark, { cast: true });
    sign(g, 'ANNONCES', '#2b2050', '#fff4d6', 116, S + 1.5, 31.46, Math.PI, 2.8, 0.7);
    // Parking des profs (à l'ouest du parvis)
    flat(g, 77.5, 12, 95, 60, S + 0.02, MAT.asphalt);
    for (let z = 13.5; z <= 58; z += 3) {
      d.I('pline', G.ubox, MAT.lines).add(80.5, S + 0.035, z, 0, 5, 0.02, 0.14);
      d.I('pline', G.ubox, MAT.lines).add(92, S + 0.035, z, 0, 5, 0.02, 0.14);
    }
    postLamp(d, 86.5, S, 36, { cold: true, light: true });
    // Lampadaires du parvis
    for (const [x, z] of [[100, 14], [172, 14]]) postLamp(d, x, S, z);
    d.finish();
  }

  // =====================================================================
  // 2. STADE (x 76..192, z -62..-8) : piste ovale, terrain, gradins
  // =====================================================================
  {
    const d = district('stade', [76, -62, 192, -8]);
    const g = d.group;
    slab(d, 76, -62, 192, -8, MAT.pave);
    const cx = 134;
    const cz = -32;
    const L = 30;
    // Forme « stade » (rectangle + demi-cercles), coordonnées de forme (x, -z).
    const stadium = (r, path = new THREE.Shape()) => {
      path.moveTo(cx - L, -(cz - r));
      path.lineTo(cx + L, -(cz - r));
      path.absarc(cx + L, -cz, r, Math.PI / 2, -Math.PI / 2, true);
      path.lineTo(cx - L, -(cz + r));
      path.absarc(cx - L, -cz, r, -Math.PI / 2, -Math.PI * 1.5, true);
      return path;
    };
    const ring = (r0, r1, y, material) => {
      const sh = stadium(r1);
      sh.holes.push(stadium(r0, new THREE.Path()));
      const geom = new THREE.ShapeGeometry(sh, 10);
      geom.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geom, material);
      m.position.y = y;
      m.receiveShadow = true;
      g.add(m);
    };
    ring(12.5, 19, S + 0.02, MAT.track);
    for (const r of [12.5, 14.7, 16.9, 18.9]) ring(r, r + 0.12, S + 0.03, MAT.lines);
    {
      const geom = new THREE.ShapeGeometry(stadium(12.5), 10);
      const uv = geom.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
      geom.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geom, MAT.pitch);
      m.position.y = S + 0.02;
      g.add(m);
    }
    // Lignes du terrain
    const line = (x0, z0, x1, z1) => d.I('pline', G.ubox, MAT.lines).add((x0 + x1) / 2, S + 0.035, (z0 + z1) / 2, 0, Math.max(0.14, x1 - x0), 0.02, Math.max(0.14, z1 - z0));
    line(106, -43, 162, -43);
    line(106, -21, 162, -21);
    line(106, -43, 106, -21);
    line(162, -43, 162, -21);
    line(134, -43, 134, -21);
    for (const [a, b] of [[106, 114], [154, 162]]) {
      line(a, -38, b, -38);
      line(a, -26, b, -26);
      line(a === 106 ? 114 : 154, -38, a === 106 ? 114 : 154, -26);
    }
    {
      const rg = new THREE.RingGeometry(4.4, 4.56, 28);
      rg.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(rg, MAT.lines);
      m.position.set(cx, S + 0.035, cz);
      g.add(m);
    }
    // Buts (poteaux blancs + filets grillagés)
    for (const [gx, sgn] of [[106, -1], [162, 1]]) {
      for (const pz of [-35.66, -28.34]) cbox(g, gx, S, pz, 0.14, 2.44, 0.14, MAT.white);
      cbox(g, gx, S + 2.37, cz, 0.14, 0.14, 7.46, MAT.white, { collide: false });
      const net = new THREE.Mesh(new THREE.PlaneGeometry(7.32, 2.44), MAT.chain);
      net.position.set(gx + sgn * 1.5, S + 1.22, cz);
      net.rotation.y = Math.PI / 2;
      g.add(net);
      for (const pz of [-35.66, -28.34]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.44), MAT.chain);
        side.position.set(gx + sgn * 0.75, S + 1.22, pz);
        g.add(side);
      }
    }
    // Grillage autour du stade (portail sud + accès ouest)
    fence(d, 82, -10.6, 186, -10.6, 'chain', { gaps: [[128, 140]] });
    fence(d, 82, -52.4, 186, -52.4, 'chain');
    fence(d, 82, -52.4, 82, -10.6, 'chain', { gaps: [[-36, -28]] });
    fence(d, 186, -52.4, 186, -10.6, 'chain');
    for (const px of [127.6, 140.4]) cbox(g, px, S, -10.6, 0.6, 3.6, 0.6, MAT.stone);
    box(g, 127.6, 3.75, -10.75, 140.4, 4.1, -10.45, MAT.dark, { collide: false });
    sign(g, 'STADE MUNICIPAL', '#ffffff', '#c4573f', 134, 4.75, -10.42, 0, 7.2, 1.6);
    // Gradins côté nord (marches de 0,45 m : praticables)
    const seatColors = ['#e8553f', '#ffcd20', '#3d6fd1'];
    for (let k = 0; k < 4; k++) {
      const z1 = -53 - 2 * k;
      const z0 = z1 - 2;
      const top = S + 0.45 * (k + 1);
      box(g, 104, 0, z0, 164, top, z1, MAT.stone, { cast: k === 3, tile: 4 });
      for (let x = 105; x < 164; x += low ? 1.4 : 0.9) d.I('seat', G.ubox, MAT.inst, { colored: true }).add(x, top + 0.18, z0 + 0.6, 0, 0.6, 0.36, 0.45, seatColors[k % 3]);
    }
    box(g, 103.5, 0, -61.8, 164.5, 4.6, -61.0, MAT.stone, { cast: true });
    for (const px of [104, 124, 144, 164]) cbox(g, px, 4.6, -61.4, 0.3, 1.4, 0.3, MAT.metal, { collide: false });
    box(g, 103.5, 6.0, -62, 164.5, 6.25, -54.5, mat('#c4573f'), { collide: false, cast: true });
    // Tableau d'affichage à l'est
    for (const pz of [-36, -28]) cbox(g, 189, S, pz, 0.4, 6, 0.4, MAT.metal);
    sign(g, 'DOMICILE 0 - 0 VISITEURS', '#ffcd20', '#120a2a', 188.75, 5.0, cz, -Math.PI / 2, 9.6, 2.4);
    // Projecteurs aux quatre coins
    for (const [x, z] of [[84, -55], [184, -55], [84, -8.9], [184, -8.9]]) {
      d.I('lpole', G.pole, MAT.metal).add(x, S, z, 0, 3, 18, 3);
      col.addCentered(x, 0, z, 0.5, 18, 0.5);
      const yaw = Math.atan2(cx - x, cz - z);
      d.I('floodFrame', G.ubox, MAT.metal).add(x, S + 18.4, z, yaw, 3.2, 1.8, 0.4, null, -0.4);
      d.I('floodFace', G.ubox, MAT.lampHead).add(x + Math.sin(yaw) * 0.22, S + 18.4, z + Math.cos(yaw) * 0.22, yaw, 2.9, 1.5, 0.1, null, -0.4);
    }
    addLight(g, 112, 9, -32, '#e8f4ff');
    addLight(g, 156, 9, -32, '#e8f4ff');
    // Bancs de touche
    for (const x of [126, 142]) {
      cbox(g, x, S, -18.5, 5, 0.45, 0.6, MAT.wood);
      cbox(g, x, S + 0.45, -18.1, 5, 2.0, 0.12, MAT.glass, { collide: false });
    }
    postLamp(d, 80, S, -12, { light: true, cold: true });
    d.finish();
  }

  // =====================================================================
  // 3. LES TILLEULS — quartier pavillonnaire (z 76..192 ; x B, C, D)
  // =====================================================================
  const WALLS = ['#f2c6a0', '#9fd8e8', '#f5b8c8', '#c9b8ff', '#a8e0c0', '#f2e2a0', '#ffd0a8', '#b8c8f0', '#e8a0a0'];
  const ROOFS = ['#c0563f', '#4a3f7a', '#3d6fa8', '#5a4a6a', '#8a4a5a', '#2f7a7a', '#a8483a'];
  const DOORS = ['#e8553f', '#3d6fd1', '#2fa88a', '#7b4ad6', '#ffcd20', '#5a3a2a'];
  const SHUT = ['#3d6fd1', '#2fa88a', '#e86f6f', '#7b4ad6', '#f4f0e8', '#5a3a2a'];
  // Maison cartoon à 2 niveaux : murs, pignons, tuiles, fenêtres à volets,
  // porte + auvent + marche, cheminée, garage optionnel.
  function house(d, o) {
    const g = d.group;
    const { x0, z0, x1, z1 } = o;
    const w = x1 - x0;
    const dz = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const y0 = S;
    const H = 6.0;
    // Murs, pignons, pans de toit et portes : instances colorées (1 appel de
    // dessin par type pour tout le quartier, quelle que soit la palette).
    const hw = (key, geoFn, material) => d.I(key, geoFn, material, { colored: true, shadow: !low });
    const trim = o.trim || '#f4f0e8';
    const trimM = mat(trim);
    box(g, x0 - 0.12, 0, z0 - 0.12, x1 + 0.12, y0 + 0.45, z1 + 0.12, mat('#8a7f9a'), { collide: false });
    hw('hwall', G.ubox, MAT.inst).add(cx, y0 + H / 2, cz, 0, w, H, dz, o.wall);
    box(g, x0 - 0.08, y0 + 2.95, z0 - 0.08, x1 + 0.08, y0 + 3.12, z1 + 0.08, trimM, { collide: false });
    box(g, x0 - 0.14, y0 + H - 0.22, z0 - 0.14, x1 + 0.14, y0 + H, z1 + 0.14, trimM, { collide: false });
    const yTop = y0 + H;
    const rh = o.roofH ?? R(2.6, 3.6);
    const kind = o.roofKind ?? (w >= dz ? 'gable' : 'gableZ');
    if (kind === 'hip') {
      hw('hhip', () => geo('hip', () => new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)), roofMat('#ffffff'))
        .add(cx, yTop - 0.05, cz, 0, (w / 2 + 0.55) / 0.7071, rh, (dz / 2 + 0.55) / 0.7071, o.roof);
    } else {
      // Toit à deux pans (même géométrie que gableRoof, en instances)
      const alongX = kind === 'gable';
      const len = alongX ? w : dz;
      const half = (alongX ? dz : w) / 2;
      const yaw = alongX ? 0 : Math.PI / 2;
      const ov = 0.55;
      const th = 0.22;
      const a = Math.atan2(rh, half);
      const sl = (half + ov) / Math.cos(a);
      const ey = -ov * Math.tan(a);
      hw('hgable', G.prism, MAT.inst).add(cx, yTop, cz, yaw, len, rh, half * 2, o.wall);
      for (const sg of [-1, 1]) {
        const lz = (sg * (half + ov)) / 2;
        hw('hroof', G.ubox, roofMat('#ffffff')).add(cx + lz * Math.sin(yaw), yTop + (ey + rh) / 2 + th / 2, cz + lz * Math.cos(yaw), yaw, len + ov * 1.4, th, sl, o.roof, sg * a);
      }
      hw('hroof', G.ubox, roofMat('#ffffff')).add(cx, yTop + rh + 0.12, cz, yaw, len + ov * 1.4, 0.18, 0.4, o.roof);
    }
    col.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: yTop + rh, z: z1 }, 'building');
    // Cheminée
    if (o.chimney !== false) {
      const chx = x0 + w * (rand() < 0.5 ? 0.22 : 0.78);
      const chz = cz + (kind === 'gable' ? dz * 0.15 : 0);
      cbox(g, chx, yTop, chz, 0.85, rh + 0.9, 0.85, mat('#a8483a'), { collide: false, cast: true });
      cbox(g, chx, yTop + rh + 0.9, chz, 1.05, 0.2, 1.05, MAT.dark, { collide: false });
    }
    // Façades : o = origine, t = tangente, n = normale sortante
    const F = {
      n: { o: [x0, z0], t: [1, 0], n: [0, -1], len: w, yaw: Math.PI },
      s: { o: [x1, z1], t: [-1, 0], n: [0, 1], len: w, yaw: 0 },
      w: { o: [x0, z1], t: [0, -1], n: [-1, 0], len: dz, yaw: -Math.PI / 2 },
      e: { o: [x1, z0], t: [0, 1], n: [1, 0], len: dz, yaw: Math.PI / 2 },
    };
    const at = (f, u, out) => [f.o[0] + f.t[0] * u + f.n[0] * out, f.o[1] + f.t[1] * u + f.n[1] * out];
    const df = F[o.door];
    const doorU = o.door === 'n' ? o.doorX - x0 : x1 - o.doorX;
    const shutters = o.shutters ?? rand() < 0.6;
    const shutC = o.shutterColor || pick(SHUT);
    for (const [k, f] of Object.entries(F)) {
      const n = Math.max(1, Math.floor((f.len - 0.6) / 3.1));
      const bay = f.len / n;
      for (let fl = 0; fl < 2; fl++) {
        const y = y0 + 1.55 + fl * 2.95;
        for (let i = 0; i < n; i++) {
          const u = bay * (i + 0.5);
          if (fl === 0 && f === df && Math.abs(u - doorU) < 1.7) continue;
          if (fl === 0 && o.garage === k) continue;
          const [fx, fz] = at(f, u, 0.05);
          d.I('wframe', G.ubox, MAT.inst, { colored: true }).add(fx, y, fz, f.yaw, 1.25, 1.45, 0.1, trim);
          const lit = o.litAll || rand() < 0.28;
          const [gx, gz] = at(f, u, 0.105);
          if (lit) d.I('wlit', () => geo('wpane', () => new THREE.PlaneGeometry(1.02, 1.22)), MAT.lit, { colored: true }).add(gx, y, gz, f.yaw, 1, 1, 1, pick(['#ffe27a', '#ffd9a0', '#ffe9c4', '#ffb3e6']));
          else d.I('wdark', () => geo('wpane', () => new THREE.PlaneGeometry(1.02, 1.22)), MAT.inst, { colored: true }).add(gx, y, gz, f.yaw, 1, 1, 1, pick(['#2a3170', '#33408a', '#2b2a66']));
          const [mx, mz] = at(f, u, 0.115);
          d.I('wcross', () => geo('wcross', () => mergeGeometries([new THREE.PlaneGeometry(0.08, 1.22), new THREE.PlaneGeometry(1.02, 0.08).translate(0, 0, 0.002)])), MAT.inst, { colored: true }).add(mx, y, mz, f.yaw, 1, 1, 1, trim);
          if (shutters) {
            for (const sgn of [-1, 1]) {
              const [sx, sz] = at(f, u + sgn * 0.92, 0.06);
              d.I('shutter', G.ubox, MAT.inst, { colored: true }).add(sx, y, sz, f.yaw, 0.5, 1.45, 0.07, shutC);
            }
          }
          if (o.flowerBoxes && fl === 1) {
            const [bx, bz] = at(f, u, 0.25);
            d.I('fbox', G.ubox, MAT.woodDark).add(bx, y - 0.85, bz, f.yaw, 1.2, 0.25, 0.3);
            d.I('flowers', G.ball0, MAT.inst, { colored: true }).add(bx, y - 0.68, bz, f.yaw, 0.55, 0.18, 0.16, pick(['#ff6fa8', '#ffd23f', '#ff8a3d']));
          }
        }
      }
    }
    // Porte, auvent, marche
    const [dx, dzp] = at(df, doorU, 0.06);
    hw('hdoor', G.ubox, MAT.inst).add(dx, y0 + 1.125, dzp, df.yaw, 1.15, 2.25, 0.12, o.doorColor || pick(DOORS));
    const [kx, kz] = at(df, doorU + 0.38, 0.14);
    d.I('knob', G.ball0, MAT.lampHead).add(kx, y0 + 1.1, kz, 0, 0.06, 0.06, 0.06);
    const [ax, az] = at(df, doorU, 0.6);
    cbox(g, ax, y0 + 2.6, az, 2.3, 0.16, 1.2, trimM, { yaw: df.yaw, collide: false, cast: true });
    const [sx, sz] = at(df, doorU, 0.55);
    cbox(g, sx, 0, sz, 2.1, S + 0.15, 1.0, MAT.stone, { yaw: df.yaw });
    if (o.porchPosts) {
      for (const sgn of [-1, 1]) {
        const [px, pz] = at(df, doorU + sgn * 1.0, 1.05);
        cbox(g, px, y0, pz, 0.14, 2.6, 0.14, trimM, { yaw: df.yaw });
      }
    }
    // Garage accolé (toit plat)
    if (o.garage) {
      const gw = 4.4;
      const gx0 = o.garage === 'e' ? x1 : x0 - gw;
      const gz0 = o.door === 'n' ? z0 : z1 - 6.5;
      hw('hwall', G.ubox, MAT.inst).add(gx0 + gw / 2, y0 + 1.6, gz0 + 3.25, 0, gw, 3.2, 6.5, o.wall);
      col.addBox({ x: gx0, y: 0, z: gz0 }, { x: gx0 + gw, y: y0 + 3.45, z: gz0 + 6.5 });
      box(g, gx0 - 0.1, y0 + 3.2, gz0 - 0.1, gx0 + gw + 0.1, y0 + 3.45, gz0 + 6.6, trimM, { collide: false });
      const gzF = o.door === 'n' ? gz0 - 0.03 : gz0 + 6.53;
      const gd = cbox(g, gx0 + gw / 2, y0, gzF, 3.3, 2.5, 0.06, ribMat('#e4e0f0'), { collide: false });
      void gd;
    }
  }
  function mailbox(d, x, z, color, label) {
    d.I('mbpost', G.ubase, MAT.woodDark).add(x, S, z, 0, 0.1, 1.0, 0.1);
    d.I('mbbox', G.ubox, MAT.inst, { colored: true }).add(x, S + 1.15, z, 0, 0.42, 0.34, 0.6, color);
    col.addCentered(x, 0, z, 0.45, S + 1.35, 0.6);
    if (label) {
      sign(d.group, label, '#ffffff', '#2b2050', x + 0.22, S + 1.18, z, Math.PI / 2, 0.55, 0.16);
      sign(d.group, label, '#ffffff', '#2b2050', x - 0.22, S + 1.18, z, -Math.PI / 2, 0.55, 0.16);
    }
  }
  // Un îlot pavillonnaire : 4 rangées de lots, 2 ruelles est-ouest.
  const ROWS = [
    { f0: 80, f1: 92, door: 'n', front: 77.2, back: 98.8 },
    { f0: 111, f1: 123, door: 'n', front: 108.2, back: 130.8 },
    { f0: 143, f1: 155, door: 'n', front: 140.2, back: 161.5 },
    { f0: 168, f1: 180, door: 's', front: 190.2, back: 161.5 },
  ];
  const LANES = [[99.2, 107.6], [131.2, 139.6]];
  function suburbBlock(name, bx0, bx1, withNoa) {
    const d = district(name, [bx0, 76, bx1, 192]);
    const g = d.group;
    slab(d, bx0, 76, bx1, 192, MAT.pave);
    for (const [a, b] of LANES) {
      flat(g, bx0 + 0.8, a, bx1 - 0.8, b, S + 0.02, MAT.asphalt);
      for (let x = bx0 + 4; x < bx1 - 3; x += 6) d.I('pline', G.ubox, MAT.lines).add(x, S + 0.035, (a + b) / 2, 0, 2.6, 0.02, 0.16);
    }
    const nLots = Math.max(1, Math.round((bx1 - bx0 - 4) / 18.5));
    const lotW = (bx1 - bx0 - 4) / nLots;
    ROWS.forEach((row, ri) => {
      let lots = [];
      for (let i = 0; i < nLots; i++) lots.push([bx0 + 2 + i * lotW, bx0 + 2 + (i + 1) * lotW]);
      if (withNoa && ri === 0) lots = [[bx0 + 2, 21], [21, 39], [39, bx1 - 2]];
      lots.forEach(([l0, l1], li) => {
        const noa = withNoa && ri === 0 && li === 1;
        const lw = l1 - l0;
        const garage = !noa && lw > 17 && rand() < 0.45 ? (rand() < 0.5 ? 'e' : 'w') : null;
        const hw = noa ? 16 : Math.min(13.5, lw - 5 - (garage ? 4.4 : 0));
        let hx0 = (l0 + l1) / 2 - hw / 2 + (garage === 'e' ? -2.2 : garage === 'w' ? 2.2 : 0);
        if (noa) hx0 = 22;
        const hx1 = hx0 + hw;
        const f0 = row.f0;
        const f1 = noa ? 94 : row.f1;
        const doorX = noa ? 30 : Math.round((hx0 + hx1) / 2 + (rand() - 0.5) * 3);
        const n = row.door === 'n';
        const yardA = n ? row.front : f1;
        const yardB = n ? f0 : row.front;
        // Pelouses : devant et jardin arrière
        flat(g, l0 + 0.2, Math.min(yardA, yardB) + 0.1, l1 - 0.2, Math.max(yardA, yardB) - 0.1, S + 0.02, MAT.lawn, 6);
        const gA = n ? f1 : row.back;
        const gB = n ? row.back : f0;
        flat(g, l0 + 0.2, gA + 0.1, l1 - 0.2, gB - 0.1, S + 0.02, MAT.lawn, 6);
        // Allée de la porte à la rue
        flat(g, doorX - 0.75, Math.min(yardA, yardB) - 0.6, doorX + 0.75, Math.max(yardA, yardB), S + 0.03, MAT.path, 2);
        const wall = noa ? '#ffd27a' : pick(WALLS);
        house(d, {
          x0: hx0, z0: f0, x1: hx1, z1: f1, door: row.door, doorX, wall,
          roof: noa ? '#2f9a96' : pick(ROOFS),
          roofKind: noa ? 'gable' : rand() < 0.2 ? 'hip' : undefined,
          garage,
          porchPosts: noa || rand() < 0.3,
          flowerBoxes: noa || rand() < 0.35,
          shutters: noa ? true : undefined,
          shutterColor: noa ? '#2f9a96' : undefined,
          doorColor: noa ? '#e8553f' : undefined,
          roofH: noa ? 3.6 : undefined,
        });
        // Clôture avant (passage devant la porte et l'éventuel garage)
        const gaps = [[doorX - 1.3, doorX + 1.3]];
        if (garage) {
          const gx0 = garage === 'e' ? hx1 : hx0 - 4.4;
          gaps.push([gx0 + 0.2, gx0 + 4.2]);
          flat(g, gx0 + 0.4, Math.min(row.front, n ? f0 : f1) - 0.6, gx0 + 4.0, Math.max(row.front, n ? f0 : f1), S + 0.03, MAT.asphalt);
        }
        fence(d, l0 + 0.3, row.front, l1 - 0.3, row.front, 'picket', { gaps, color: noa ? '#ffffff' : pick(['#f4f0e8', '#f4f0e8', '#ffd0d8', '#d8e8ff']) });
        // Haies latérales du jardin arrière + haie du fond (pas de doublon rangée 4)
        const sideA = n ? f1 + 0.2 : row.back + 0.6;
        const sideB = n ? row.back - 0.6 : f0 - 0.2;
        if (li === 0) hedge(d, l0, sideA, l0 + 0.7, sideB);
        hedge(d, l1 - 0.35, sideA, l1 + 0.35, sideB);
        if (ri < 3) hedge(d, l0, row.back - 0.6, l1, row.back + (ri === 2 ? 0.6 : 0));
        // Boîte aux lettres, arbre du jardin
        if (noa) mailbox(d, 33, 78, '#e8553f', 'VANT');
        else mailbox(d, doorX + 2.1, n ? row.front + 0.8 : row.front - 0.8, pick(['#ffd23f', '#3d6fd1', '#e8553f', '#2fa88a']));
        if (rand() < 0.8 * (0.5 + Q / 2)) {
          const tz = n ? (f1 + row.back) / 2 : (row.back + f0) / 2;
          const tx = R(l0 + 3, l1 - 3);
          if (!blocked(tx, tz, 1.0)) tree(d, 'round', tx, S, tz, R(0.9, 1.25));
        }
        if (ri === 3 && rand() < 0.7) {
          const tx = rand() < 0.5 ? doorX - 4.5 : doorX + 4.8;
          const tz = R(183.5, 186.5);
          if (tx > l0 + 1.5 && tx < l1 - 1.5 && !blocked(tx, tz, 1.4)) tree(d, 'round', tx, S, tz, R(1, 1.3));
        }
      });
    });
    // Lampadaires des ruelles
    for (const [a, b] of LANES) {
      const z = a + 0.4;
      const xs = [bx0 + (bx1 - bx0) * 0.3, bx0 + (bx1 - bx0) * 0.75];
      xs.forEach((x, i) => {
        if (!blocked(x, z - 0.2, 0.4)) postLamp(d, x, S, z, { light: i === 0 && a < 120 });
      });
      void b;
    }
    return d;
  }
  let noaDistrict = null;
  {
    suburbBlock('tilleuls_ouest', -62, -8, false).finish();
    noaDistrict = suburbBlock('tilleuls_vant', 8, 62, true);
    // Maison de Noa : petits détails (nain de jardin, vélo, fenêtre allumée)
    const d = noaDistrict;
    cyl(d.group, 25.5, S, 78.6, 0.18, 0.2, 0.45, mat('#3d6fd1'), { collide: false });
    d.I('gnomeHat', () => geo('gnomeHat', () => new THREE.ConeGeometry(0.2, 0.45, 8)), mat('#e8553f')).add(25.5, S + 0.85, 78.6);
    d.I('flowers', G.ball0, MAT.inst, { colored: true }).add(25.5, S + 0.58, 78.6, 0, 0.15, 0.15, 0.15, '#ffd9b0');
    for (const [x, c] of [[23.5, '#ff6fa8'], [24.5, '#ffd23f'], [35.5, '#ff8a3d'], [36.5, '#ff6fa8']]) d.I('flowers', G.ball0, MAT.inst, { colored: true }).add(x, S + 0.25, 79.3, rand() * 6, 0.5, 0.3, 0.4, c);
    for (const k of [-0.55, 0.55]) d.I('wheel', () => geo('wheel', () => new THREE.TorusGeometry(0.33, 0.05, 4, 12)), MAT.dark).add(38.45, S + 0.38, 84 + k, Math.PI / 2, 1, 1, 1, null, 0, 0.12);
    d.I('bframe', G.ubox, MAT.inst, { colored: true }).add(38.45, S + 0.62, 84, 0, 0.06, 0.06, 1.1, '#2fa8a8');
    // Chambre de Noa : fenêtre de l'étage allumée côté rue
    d.I('wlit', () => geo('wpane', () => new THREE.PlaneGeometry(1.02, 1.22)), MAT.lit, { colored: true }).add(24, S + 4.5, 79.88, Math.PI, 1, 1, 1, '#ffd9a0');
    d.finish();
    suburbBlock('tilleuls_est', 76, 192, false).finish();
  }

  // =====================================================================
  // 4. PARC VESPER (x -192..-76 ; z -62..62 et z 76..192)
  // =====================================================================
  function scatterTrees(d, n, x0, z0, x1, z1, ok, kind = 'round', sMin = 0.9, sMax = 1.5, y = S) {
    let placed = 0;
    for (let tries = 0; tries < n * 8 && placed < n; tries++) {
      const x = R(x0, x1);
      const z = R(z0, z1);
      if (!ok(x, z) || nearKeep(x, z) || blocked(x, z, 1.2)) continue;
      tree(d, kind, x, y, z, R(sMin, sMax));
      placed++;
    }
    return placed;
  }
  {
    const d = district('parc', [-192, -62, -76, 62]);
    const g = d.group;
    slab(d, -192, 8, -76, 62, MAT.grass, 6);
    slab(d, -192, -62, -76, -8, MAT.grass, 6);
    // --- Étang (-134, 35) r 14 : margelle en pierre infranchissable à pied ---
    const px = -134;
    const pz = 35;
    const pr = 14;
    disc(g, px, pz, pr + 0.3, S + 0.2, MAT.water, 28, 8);
    const nSeg = 22;
    for (let i = 0; i < nSeg; i++) {
      const a = (i / nSeg) * Math.PI * 2;
      cbox(g, px + Math.cos(a) * (pr + 0.5), S, pz + Math.sin(a) * (pr + 0.5), 2 * Math.PI * (pr + 0.5) / nSeg + 0.15, 0.6, 1.0, MAT.stone, { yaw: -a - Math.PI / 2, collide: false, cast: true });
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      col.addCentered(px + Math.cos(a) * (pr + 0.5), 0, pz + Math.sin(a) * (pr + 0.5), 1.4, S + 0.75, 1.4);
    }
    for (const [hx, hz] of [[9.9, 9.9], [13, 5], [5, 13]]) col.addBox({ x: px - hx, y: 0, z: pz - hz }, { x: px + hx, y: S, z: pz + hz }, 'water');
    // Cabane à canards au centre + nénuphars
    cbox(g, px, 0, pz, 0.2, 1.4, 0.2, MAT.woodDark, { collide: false });
    cbox(g, px, 1.3, pz, 1.4, 0.8, 1.0, mat('#e8a0a0'), { collide: false });
    gableRoof(g, px, pz, 2.1, 1.4, 1.0, 0.6, mat('#e8a0a0'), roofMat('#4a3f7a'), true, 0.15, 0.08);
    for (let i = 0; i < 9; i++) {
      const a = rand() * 6.28;
      const r = R(5, 12);
      d.I('lily', () => geo('lily', () => new THREE.CylinderGeometry(1, 1, 0.04, 8)), mat('#3fae6a')).add(px + Math.cos(a) * r, S + 0.23, pz + Math.sin(a) * r, 0, R(0.4, 0.8), 1, R(0.4, 0.8));
    }
    // --- Allées ---
    const W = 2.6;
    const yP = S + 0.03;
    d.paths.push(...ribbon(g, Array.from({ length: 12 }, (_, i) => [px + Math.cos((i / 12) * 6.283) * 18.5, pz + Math.sin((i / 12) * 6.283) * 18.5]), W, yP, MAT.path, true));
    d.paths.push(...ribbon(g, [[-76, 30], [-90, 30.5], [-104, 32.5], [-115.5, 35]], 3.2, yP, MAT.path));
    d.paths.push(...ribbon(g, [[-134, 53.5], [-133, 58], [-134, 62]], W, yP, MAT.path));
    d.paths.push(...ribbon(g, [[-134, 16.5], [-135, 12], [-134, 8]], W, yP, MAT.path));
    d.paths.push(...ribbon(g, [[-152.5, 35], [-166, 40], [-180, 37], [-192, 40]], W, yP, MAT.path));
    // Bloc sud (fontaine) : allées
    const fx = -134;
    const fz = -35;
    disc(g, fx, fz, 10, S + 0.025, MAT.plaza, 24);
    d.paths.push(...ribbon(g, [[-134, -8], [-133, -16], [-134, -25.5]], W, yP, MAT.path));
    d.paths.push(...ribbon(g, [[-143.5, -37], [-152, -42], [-160, -42]], W, yP, MAT.path));
    d.paths.push(...ribbon(g, [[-124.5, -35], [-110, -32], [-92, -36], [-76, -35]], W, yP, MAT.path));
    d.paths.push(...ribbon(g, [[-134, -44.5], [-136, -54], [-134, -62]], W, yP, MAT.path));
    for (let a = 0; a < 6.28; a += 0.4) d.paths.push([fx + Math.cos(a) * 9, fz + Math.sin(a) * 9]);
    // --- Entrée monumentale côté centre-ville (x = -77) ---
    for (const z of [23.4, 36.6]) {
      cbox(g, -78, S, z, 1.4, 5.2, 1.4, MAT.stone, { cast: true });
      cbox(g, -78, S + 5.2, z, 1.7, 0.3, 1.7, MAT.white, { collide: false });
    }
    box(g, -78.4, 5.0, 23.0, -77.6, 5.8, 37.0, mat('#2f7a5a'), { collide: false, cast: true });
    sign(g, 'PARC VESPER', '#ffe9a0', '#2f7a5a', -77.55, 5.4, 30, Math.PI / 2, 10, 2.2);
    sign(g, 'PARC VESPER', '#ffe9a0', '#2f7a5a', -78.45, 5.4, 30, -Math.PI / 2, 10, 2.2);
    for (const z of [21, 39]) {
      for (let i = 0; i < 6; i++) d.I('flowers', G.ball0, MAT.inst, { colored: true }).add(-79.5 - i * 0.9, S + 0.42, z + R(-0.6, 0.6), rand() * 6, 0.5, 0.35, 0.5, pick(['#ff6fa8', '#ffd23f', '#ff8a3d', '#c9a6ff']));
      box(g, -84.6, S, z - 1, -79, S + 0.3, z + 1, MAT.woodDark, { collide: true });
    }
    // --- Café du Parc (-100, 22) : kiosque, terrasse, guirlandes ---
    const kx = -100;
    const kz = 22;
    cyl(g, kx, S, kz, 3.2, 3.2, 3.0, mat('#f2e2c8'), { seg: 8, cast: true, rotY: Math.PI / 8 });
    cyl(g, kx, S + 3.0, kz, 3.3, 3.3, 0.25, mat('#2f7a5a'), { seg: 8, collide: false, rotY: Math.PI / 8 });
    const roofK = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.2, 8), M({ map: awningTexture(), color: '#ff8a8a' }));
    roofK.position.set(kx, S + 3.25 + 1.1, kz);
    roofK.castShadow = !low;
    g.add(roofK);
    cyl(g, kx, S + 5.35, kz, 0.12, 0.05, 0.9, MAT.dark, { collide: false });
    // Comptoir (côté ouest, vers la terrasse)
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), MAT.warmGlass);
    win.position.set(kx - 2.98, S + 1.75, kz);
    win.rotation.y = -Math.PI / 2;
    g.add(win);
    cbox(g, kx - 3.35, S, kz, 0.7, 1.1, 3.0, MAT.wood, { collide: false });
    box(g, kx - 4.6, S + 2.45, kz - 1.6, kx - 3.0, S + 2.6, kz + 1.6, mat('#e86f6f'), { collide: false });
    sign(g, 'CAFÉ DU PARC', '#fff4d6', '#c0563f', kx - 4.66, S + 3.15, kz, -Math.PI / 2, 4.0, 1.0);
    for (const sgn of [-1, 1]) sign(g, 'CAFÉ DU PARC', '#fff4d6', '#c0563f', kx, S + 6.4, kz + sgn * 0.02, sgn > 0 ? 0 : Math.PI, 4.8, 1.2);
    cbox(g, kx, S + 5.4, kz, 0.15, 0.6, 0.15, MAT.dark, { collide: false });
    cbox(g, kx + 2.98, S, kz, 0.1, 2.2, 1.1, mat('#2f7a5a'), { collide: false });
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const wx = kx + Math.cos(a) * 2.75;
      const wz = kz + Math.sin(a) * 2.75;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), MAT.warmGlass);
      p.position.set(wx, S + 1.8, wz);
      p.rotation.y = Math.PI / 2 - a;
      g.add(p);
    }
    // Terrasse en bois + tables, chaises, parasols
    box(g, -113, 0, 14, -104.5, S + 0.08, 30, MAT.wood, { tile: 2 });
    const tables = [[-107, 17.5], [-110.5, 20.5], [-107, 24], [-110.5, 27]];
    const parasolC = ['#e86f6f', '#ffcd20', '#6fcf97', '#7fb8ff'];
    tables.forEach(([tx, tz], i) => {
      const yb = S + 0.08;
      d.I('tleg', G.ubase, MAT.dark).add(tx, yb, tz, 0, 0.08, 0.75, 0.08);
      d.I('ttop', G.cyl, MAT.white).add(tx, yb + 0.75, tz, 0, 0.55, 0.05, 0.55);
      d.I('tleg', G.ubase, MAT.dark).add(tx, yb + 0.8, tz, 0, 0.05, 1.6, 0.05);
      d.I('parasol', () => geo('parasol', () => new THREE.ConeGeometry(1.5, 0.6, 8)), MAT.inst, { colored: true }).add(tx, yb + 2.6, tz, 0, 1, 1, 1, parasolC[i]);
      col.addCentered(tx, 0, tz, 1.2, yb + 0.8, 1.2);
      for (const [cxo, czo, yaw] of [[-0.95, 0, Math.PI / 2], [0.95, 0, -Math.PI / 2]]) {
        d.I('chairSeat', G.ubox, MAT.inst, { colored: true }).add(tx + cxo, yb + 0.45, tz + czo, yaw, 0.45, 0.06, 0.45, '#2f7a5a');
        d.I('chairBack', G.ubox, MAT.inst, { colored: true }).add(tx + cxo * 1.22, yb + 0.72, tz + czo, yaw, 0.45, 0.5, 0.06, '#2f7a5a');
        d.I('tleg', G.ubase, MAT.dark).add(tx + cxo, yb, tz + czo, 0, 0.05, 0.45, 0.05);
      }
    });
    hangouts.cafe.push([-105.4, 22, -Math.PI / 2], [-104.6, 19.5, -Math.PI / 2], [-108.5, 22.2, Math.PI / 2], [-112, 23.8, Math.PI / 2], [-105.2, 25.8, -Math.PI / 2]);
    // Guirlandes lumineuses entre poteaux
    const garland = [[-113.2, 13.8], [-113.2, 30.2], [-104.3, 30.2], [-104.3, 13.8]];
    for (const [gx, gz] of garland) cbox(g, gx, S, gz, 0.14, 3.2, 0.14, MAT.woodDark);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = garland[i];
      const [bx, bz] = garland[(i + 1) % 4];
      const n = 12;
      const wl = Math.hypot(bx - ax, bz - az);
      d.I('wire', G.ubox, MAT.dark).add((ax + bx) / 2, S + 2.85, (az + bz) / 2, Math.atan2(bx - ax, bz - az), 0.03, 0.03, wl);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        d.I('bulb', G.ball0, MAT.lit, { colored: true }).add(ax + (bx - ax) * t, S + 2.78, az + (bz - az) * t, 0, 0.09, 0.09, 0.09, pick(['#ffe27a', '#ff9ccf', '#9ff3ff']));
      }
    }
    addLight(g, -108.5, 3.4, 22, '#ffc46b');
    // --- Fontaine (-134, -35) ---
    cyl(g, fx, S, fz, 4.2, 4.2, 0.7, MAT.stone, { seg: 10, collide: false, cast: true });
    col.addCentered(fx, 0, fz, 7.4, S + 0.75, 7.4);
    disc(g, fx, fz, 3.8, S + 0.72, MAT.water, 16, 6);
    cyl(g, fx, S, fz, 0.5, 0.4, 2.2, MAT.stone, { seg: 8, collide: false });
    cyl(g, fx, S + 2.2, fz, 0.5, 1.6, 0.4, MAT.stone, { seg: 10, collide: false });
    disc(g, fx, fz, 1.45, S + 2.61, MAT.water, 12, 4);
    cyl(g, fx, S + 2.6, fz, 0.25, 0.15, 1.0, MAT.stone, { seg: 8, collide: false });
    const jetMat = new THREE.MeshBasicMaterial({ color: '#bfeaff', transparent: true, opacity: 0.7, depthWrite: false });
    const jets = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const j = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.4, 6), jetMat);
      j.position.set(fx + Math.cos(a) * 1.1, S + 3.2, fz + Math.sin(a) * 1.1);
      j.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      j.userData.dynamic = true;
      g.add(j);
      jets.push(j);
    }
    const topJet = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.8, 6), jetMat);
    topJet.position.set(fx, S + 4.4, fz);
    topJet.userData.dynamic = true;
    g.add(topJet);
    jets.push(topJet);
    updaters.push((dt, t) => {
      jets.forEach((j, i) => j.scale.set(1, 0.85 + Math.sin(t * 6 + i) * 0.15, 1));
    });
    // Bancs autour de la fontaine et de l'étang
    for (const a of [0.8, 2.35, 3.9, 5.5]) bench(d, fx + Math.cos(a) * 8.7, fz + Math.sin(a) * 8.7, Math.atan2(-Math.cos(a), -Math.sin(a)));
    for (const a of [0.35, 1.2, 2.0, 2.75, 3.5, 4.35, 5.1, 5.85]) {
      const bx = px + Math.cos(a) * 21;
      const bz = pz + Math.sin(a) * 21;
      if (d.nearPath(bx, bz, 1.6)) continue;
      bench(d, bx, bz, Math.atan2(-Math.cos(a), -Math.sin(a)));
    }
    hangouts.park.push([-134, 15.6, 0], [-132.2, 16.2, -0.3], [-114.8, 36.2, -Math.PI / 2], [-115.4, 33.4, -Math.PI / 2], [fx + 6.2, fz + 1.5, -Math.PI / 2], [fx + 5.8, fz - 1.8, -Math.PI / 2]);
    // --- Aire de jeux (x -184..-158, z -54..-28) ---
    const PX0 = -184;
    const PZ0 = -54;
    flat(g, PX0, PZ0, -158, -28, S + 0.025, MAT.sand, 3);
    box(g, PX0 - 0.3, 0, PZ0 - 0.3, -157.7, S + 0.22, PZ0, MAT.woodDark, { collide: false });
    box(g, PX0 - 0.3, 0, -28, -157.7, S + 0.22, -27.7, MAT.woodDark, { collide: false });
    // Toboggan : plateforme 1,5 m, marches de 0,5 m, glissière
    const slx = -176;
    const slz = -46;
    box(g, slx - 1, S + 1.35, slz - 1, slx + 1, S + 1.5, slz + 1, mat('#ffcd20'), { colY0: 0 });
    for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) d.I('ppost', G.ubase, mat('#3d6fd1')).add(slx + ox, S, slz + oz, 0, 0.14, 2.6, 0.14);
    box(g, slx - 0.8, 0, slz + 1, slx + 0.8, S + 0.5, slz + 1.8, mat('#e8553f'));
    box(g, slx - 0.8, 0, slz + 1.8, slx + 0.8, S + 0.25, slz + 2.6, mat('#e8553f'));
    box(g, slx - 0.8, 0, slz + 1.0, slx + 0.8, S + 1.0, slz + 1.4, mat('#e8553f'));
    cbox(g, slx + 3.0, S + 0.55, slz, 4.6, 0.12, 1.0, mat('#e8553f'), { roll: 0.32, collide: false, cast: true });
    for (const k of [-0.5, 0.5]) cbox(g, slx + 3.0, S + 0.85, slz + k, 4.6, 0.3, 0.06, mat('#e8553f'), { roll: 0.32, collide: false });
    // Balançoires
    const swx = -168;
    const swz = -36;
    for (const sx of [-2.4, 2.4]) {
      for (const k of [-0.7, 0.7]) cbox(g, swx + sx, S, swz + k * 0.9, 0.12, 2.9, 0.12, mat('#3d6fd1'), { roll: 0, pitch: k * 0.35, collide: false });
      col.addCentered(swx + sx, 0, swz, 0.3, S + 2.8, 2.0);
    }
    cbox(g, swx, S + 2.7, swz, 5.0, 0.14, 0.14, mat('#3d6fd1'), { collide: false });
    const swings = [];
    for (const sx of [-1.1, 1.1]) {
      const sw = new THREE.Group();
      sw.position.set(swx + sx, S + 2.7, swz);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.3), mat('#ffcd20'));
      seat.position.y = -2.15;
      sw.add(seat);
      for (const k of [-0.27, 0.27]) {
        const chainM = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.15, 0.03), MAT.metal);
        chainM.position.set(k, -1.07, 0);
        sw.add(chainM);
      }
      sw.traverse((o) => (o.userData.dynamic = true));
      g.add(sw);
      swings.push(sw);
    }
    updaters.push((dt, t) => swings.forEach((s, i) => (s.rotation.x = Math.sin(t * 1.3 + i * 2) * 0.25)));
    // Dôme d'escalade, tourniquet, tape-cul
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), new THREE.MeshBasicMaterial({ color: '#ff8a3d', wireframe: true }));
    dome.position.set(-164, S, -48);
    dome.scale.y = 0.8;
    g.add(dome);
    col.addCentered(-164, 0, -48, 3.2, S + 1.6, 3.2);
    cyl(g, -176, S, -33, 1.5, 1.5, 0.3, mat('#6fcf97'), { seg: 10 });
    cyl(g, -176, S + 0.3, -33, 0.08, 0.08, 1.0, MAT.metal, { collide: false });
    cbox(g, -163, S, -31, 0.4, 0.5, 0.4, MAT.metal);
    cbox(g, -163, S + 0.45, -31, 0.3, 0.08, 3.6, mat('#c9a6ff'), { pitch: 0.18, collide: false });
    // --- Lampadaires (quelques vraies lumières) ---
    for (const [x, z, l] of [[-88, 33, true], [-114, 43, false], [-150, 50, true], [-153, 24, false], [-131, 13, false], [-131, -12, true], [-124, -30, false], [-144, -40, true], [-100, -32, false], [-131, -52, false], [-160, -45, false]]) {
      if (!blocked(x, z, 0.5)) postLamp(d, x, S, z, { light: l });
    }
    // --- Arbres (instanciés) ---
    const okA = (x, z) => Math.hypot(x - px, z - pz) > 23 && !d.nearPath(x, z, 2.8) && !(x > -116 && z < 33 && z > 10) && !(x > -86 && z > 18 && z < 42);
    scatterTrees(d, Math.round(95 * Q), -190, 9.5, -78, 60.5, okA);
    const okB = (x, z) => Math.hypot(x - fx, z - fz) > 13 && !d.nearPath(x, z, 2.8) && !(x < -155 && x > -187 && z > -57 && z < -25);
    scatterTrees(d, Math.round(85 * Q), -190, -60.5, -78, -9.5, okB);
    for (const [x, z] of [[-188, -58], [-186, -14], [-172, -58]]) tree(d, 'round', x, S, z, 1.4, '#7b5cd6');
    d.finish();
  }
  {
    // Parc sud : bois, kiosque à musique, tables de pique-nique, cercle d'arbres morts.
    const d = district('parc_sud', [-192, 76, -76, 192]);
    const g = d.group;
    slab(d, -192, 76, -76, 192, MAT.grass, 6);
    const yP = S + 0.03;
    const gx = -134;
    const gz = 134;
    d.paths.push(...ribbon(g, [[-134, 76], [-131, 95], [-136, 112], [-134, 125]], 2.6, yP, MAT.path));
    d.paths.push(...ribbon(g, Array.from({ length: 12 }, (_, i) => [gx + Math.cos((i / 12) * 6.283) * 9.5, gz + Math.sin((i / 12) * 6.283) * 9.5]), 2.6, yP, MAT.path, true));
    d.paths.push(...ribbon(g, [[-124.5, 134], [-110, 140], [-92, 146], [-76, 150]], 2.6, yP, MAT.path));
    d.paths.push(...ribbon(g, [[-143.5, 134], [-160, 128], [-176, 136], [-192, 150]], 2.6, yP, MAT.path));
    d.paths.push(...ribbon(g, [[-134, 143.5], [-132, 160], [-136, 176], [-134, 192]], 2.6, yP, MAT.path));
    // Kiosque à musique (plateforme praticable de 0,45 m)
    cyl(g, gx, 0, gz, 5, 5, S + 0.45, MAT.stone, { seg: 8, collide: false, cast: true });
    col.addCentered(gx, 0, gz, 7, S + 0.45, 7);
    const top = S + 0.45;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      cyl(g, gx + Math.cos(a) * 4.4, top, gz + Math.sin(a) * 4.4, 0.14, 0.14, 3.2, MAT.white, { seg: 6 });
      if (i !== 2) {
        const b = a + Math.PI / 8;
        cbox(g, gx + Math.cos(b) * 4.1, top + 0.8, gz + Math.sin(b) * 4.1, 3.2, 0.08, 0.08, MAT.white, { yaw: -b - Math.PI / 2, collide: false });
      }
    }
    const kRoof = new THREE.Mesh(new THREE.ConeGeometry(6, 2.6, 8), roofMat('#4a7a9a'));
    kRoof.position.set(gx, top + 3.2 + 1.3, gz);
    kRoof.rotation.y = Math.PI / 8;
    kRoof.castShadow = !low;
    g.add(kRoof);
    cyl(g, gx, top + 5.8, gz, 0.1, 0.02, 1.0, MAT.dark, { collide: false });
    addLight(g, gx, top + 2.8, gz, '#ffd9a0');
    // Tables de pique-nique
    for (const [x, z, yaw] of [[-160, 108, 0.3], [-105, 168, -0.4], [-172, 172, 1.2], [-100, 98, 0.1], [-112, 120, 0.8]]) {
      if (blocked(x, z, 2)) continue;
      d.I('picnic', () => geo('picnic', () => mergeGeometries([
        new THREE.BoxGeometry(1.9, 0.08, 0.8).translate(0, 0.75, 0),
        new THREE.BoxGeometry(1.9, 0.06, 0.3).translate(0, 0.45, 0.65),
        new THREE.BoxGeometry(1.9, 0.06, 0.3).translate(0, 0.45, -0.65),
        new THREE.BoxGeometry(0.1, 0.75, 1.6).translate(-0.8, 0.37, 0),
        new THREE.BoxGeometry(0.1, 0.75, 1.6).translate(0.8, 0.37, 0),
      ].map(nonIdx))), MAT.wood).add(x, S, z, yaw);
      col.addCentered(x, 0, z, 2.1, S + 0.8, 2.1);
    }
    // Cercle d'arbres morts + champignons luminescents (un peu inquiétant)
    const cx = -170;
    const cz = 112;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      tree(d, 'dead', cx + Math.cos(a) * 6, S, cz + Math.sin(a) * 6, R(0.9, 1.2));
    }
    for (let i = 0; i < 26; i++) {
      const a = rand() * 6.28;
      const r = R(1, 5);
      const s = R(0.12, 0.3);
      d.I('mStem', G.ubase, MAT.white).add(cx + Math.cos(a) * r, S, cz + Math.sin(a) * r, 0, s * 0.4, s * 1.4, s * 0.4);
      d.I('mCap', G.ball0, MAT.glowPurple).add(cx + Math.cos(a) * r, S + s * 1.4, cz + Math.sin(a) * r, 0, s, s * 0.5, s);
    }
    for (const [x, z, l] of [[-131, 92, true], [-121, 128, false], [-100, 146, false], [-160, 130, true], [-131, 168, false]]) {
      if (!blocked(x, z, 0.5)) postLamp(d, x, S, z, { light: l });
    }
    const ok = (x, z) => Math.hypot(x - gx, z - gz) > 14 && Math.hypot(x - cx, z - cz) > 9 && !d.nearPath(x, z, 2.8);
    scatterTrees(d, Math.round(150 * Q), -190, 77.5, -78, 190.5, ok, 'round', 1.0, 1.7);
    scatterTrees(d, Math.round(30 * Q), -190, 77.5, -78, 190.5, ok, 'pine', 0.9, 1.2);
    d.finish();
  }

  // =====================================================================
  // 5. ZONE INDUSTRIELLE (x -192..-76, z -192..-76)
  // =====================================================================
  const CONT = ['#e8553f', '#3d6fd1', '#f2b84b', '#6fcf97', '#8f7ad8', '#2fa8a8', '#d8d4e8'];
  {
    const d = district('industrie', [-192, -192, -76, -76]);
    const g = d.group;
    slab(d, -192, -192, -76, -76, MAT.concrete);
    // Entrepôts : murs nervurés, toit à deux pans, rideau métallique, quai de chargement
    const warehouse = (x0, z0, x1, z1, h, color, doorFace, label) => {
      box(g, x0, S, z0, x1, S + h, z1, ribMat(color), { cast: true, colY0: 0, tile: 4 });
      const alongX = x1 - x0 >= z1 - z0;
      gableRoof(g, (x0 + x1) / 2, (z0 + z1) / 2, S + h, alongX ? x1 - x0 : z1 - z0, alongX ? z1 - z0 : x1 - x0, 2.4, ribMat(color), ribMat('#4a3f7a'), alongX, 0.6, 0.3);
      col.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: S + h + 2.4, z: z1 }, 'building');
      const [dx, dz, yaw] = {
        e: [x1 + 0.05, (z0 + z1) / 2, Math.PI / 2], w: [x0 - 0.05, (z0 + z1) / 2, -Math.PI / 2],
        s: [(x0 + x1) / 2, z1 + 0.05, 0], n: [(x0 + x1) / 2, z0 - 0.05, Math.PI],
      }[doorFace];
      cbox(g, dx, S, dz, 6.4, 5.4, 0.12, ribMat('#9a96b0'), { yaw, collide: false });
      sign(g, label, '#ffffff', '#2b2050', dx + Math.sin(yaw) * 0.1, S + 7.4, dz + Math.cos(yaw) * 0.1, yaw, 9, 2.2);
      d.I('lheadC', G.ball, MAT.coldHead).add(dx + Math.sin(yaw) * 0.4, S + 6.0, dz + Math.cos(yaw) * 0.4, 0, 0.3, 0.2, 0.3);
      // Quai de chargement (1,1 m, accessible d'un saut) + marches
      const ox = Math.sin(yaw);
      const oz = Math.cos(yaw);
      const qx = dx + ox * 1.8;
      const qz = dz + oz * 1.8;
      cbox(g, qx, 0, qz, 8, S + 1.1, 3.4, MAT.stone, { yaw, cast: true });
      cbox(g, qx + oz * 4.6 - ox * 0.6, 0, qz - ox * 4.6 - oz * 0.6, 1.2, S + 0.55, 2.2, MAT.stone, { yaw });
    };
    warehouse(-186, -186, -152, -160, 11, '#5f7fa8', 'e', 'ENTREPÔTS MORREL');
    warehouse(-186, -146, -156, -118, 9, '#b0574a', 'e', 'LOGISTIQUE VESPER');
    warehouse(-136, -186, -98, -166, 13, '#7a8a6a', 's', 'ENTREPÔT 3');
    // Cheminées d'usine (bandes rouges/blanches, feu clignotant)
    for (const [x, z, r, h] of [[-112, -142, 1.7, 30], [-101, -150, 1.3, 23]]) {
      box(g, x - 2.6, S, z - 2.6, x + 2.6, S + 3, z + 2.6, MAT.stone, { colY0: 0, cast: true });
      cyl(g, x, S + 3, z, r, r * 0.8, h, mat('#e8e0d8'), { seg: 10, collide: false, cast: true });
      for (const k of [0.55, 0.75, 0.93]) cyl(g, x, S + 3 + h * k, z, r * (1 - 0.2 * k) + 0.06, r * (1 - 0.2 * k) + 0.05, h * 0.07, mat('#d8453f'), { seg: 10, collide: false });
      d.I('blink', G.ball0, MAT.blink).add(x, S + 3 + h + 0.3, z, 0, 0.35, 0.35, 0.35);
    }
    // Petit bâtiment de bureaux + citerne
    box(g, -160, S, -104, -146, S + 4.5, -92, ribMat('#c9b8ff'), { colY0: 0, cast: true, tile: 4 });
    box(g, -160.3, S + 4.5, -104.3, -145.7, S + 4.8, -91.7, MAT.dark, { collide: false });
    sign(g, 'BUREAUX', '#ffffff', '#2b2050', -153, S + 3.7, -91.9, 0, 3.6, 0.9);
    for (let x = -158; x < -147; x += 3) d.I('gfWin', () => geo('gfWin', () => new THREE.PlaneGeometry(2.6, 1.7)), MAT.lit, { colored: true }).add(x, S + 2.6, -91.95, 0, 0.7, 0.8, 1, rand() < 0.5 ? '#ffe8b0' : '#9ff3ff');
    cyl(g, -170, S, -100, 3, 3, 6, mat('#d8d4e8'), { seg: 10, cast: true });
    cyl(g, -170, S + 6, -100, 3.05, 0.4, 1.4, mat('#d8d4e8'), { seg: 10, collide: false });
    // Conteneurs : pile escaladable (paliers ≤ 1,3 m) jusqu'à 7,95 m
    container(d, -130, S, -112, true, '#e8553f');
    container(d, -130, S, -109.56, true, '#3d6fd1');
    container(d, -130, S + 2.6, -112, true, '#f2b84b');
    container(d, -130, S + 5.2, -112, true, '#6fcf97', 6.1);
    const crate = (x, y, z) => cbox(g, x, y, z, 1.6, 1.3, 1.6, mat('#c98a4a'), { cast: true });
    crate(-117.0, S, -108.3);
    crate(-121, S + 2.6, -108.3);
    crate(-121, S + 5.2, -110.8);
    // Autres piles
    for (const [x0, z0, alongX, n] of [[-140, -100, true, 2], [-124, -100, true, 1], [-108, -100, true, 3], [-96, -128, false, 2], [-140, -124, true, 1], [-112, -124, true, 2], [-92, -112.2, false, 1]]) {
      for (let k = 0; k < n; k++) container(d, x0, S + k * 2.6, z0, alongX, pick(CONT));
    }
    // Voie ferrée (traverses instanciées) + wagon
    flat(g, -188, -88.2, -80, -83.8, S + 0.02, mat('#6a5a6a', { polygonOffset: true, polygonOffsetFactor: -1 }));
    for (const z of [-86.75, -85.25]) box(g, -188, S, z - 0.06, -80, S + 0.16, z + 0.06, MAT.metal, { colY0: 0 });
    for (let x = -187.5; x < -80; x += low ? 1.4 : 0.9) d.I('sleeper', G.ubox, MAT.woodDark).add(x, S + 0.05, -86, 0, 0.26, 0.1, 2.6);
    for (const x of [-189, -79.5]) cbox(g, x, S, -86, 1.2, 1.2, 3, mat('#d8453f'));
    box(g, -152, S + 0.9, -87.4, -138, S + 4.4, -84.6, ribMat('#8a4a3a'), { colY0: 0, cast: true, tile: 4 });
    for (const x of [-150, -146, -144, -140]) for (const z of [-86.75, -85.25]) d.I('rwheel', () => geo('rwheel', () => new THREE.CylinderGeometry(0.45, 0.45, 0.15, 10).rotateX(Math.PI / 2)), MAT.dark).add(x, S + 0.6, z);
    // Clôture grillagée avec portails
    fence(d, -190, -78.2, -78, -78.2, 'chain', { gaps: [[-138, -124], [-90, -78]] });
    fence(d, -78, -190, -78, -78.2, 'chain', { gaps: [[-106, -92]] });
    fence(d, -190, -190, -78, -190, 'chain');
    fence(d, -190, -190, -190, -78.2, 'chain', { gaps: [[-90, -82]] });
    for (const x of [-138.6, -123.4]) cbox(g, x, S, -78.2, 0.7, 3.2, 0.7, MAT.stone);
    sign(g, 'ZONE INDUSTRIELLE', '#ffcd20', '#2b2050', -131, 3.2, -77.95, 0, 7, 1.6);
    box(g, -138.6, 2.7, -78.35, -123.4, 2.85, -78.05, mat('#ffcd20'), { collide: false });
    // Bennes / fûts décoratifs (fixes)
    for (const [x, z] of [[-160, -112], [-161, -113.2], [-159.6, -113.6], [-104, -160], [-103, -161]]) {
      cyl(g, x, S, z, 0.38, 0.38, 0.95, mat(pick(['#3d6fd1', '#e8553f', '#ffcd20'])), { seg: 10 });
    }
    for (const [x, z, l] of [[-120, -92, true], [-144, -150, true], [-96, -150, false], [-162, -108, false]]) postLamp(d, x, S, z, { cold: true, light: l, h: 6.5 });
    d.finish();
  }

  // =====================================================================
  // 6. RANGÉE NORD : immeubles (x B) et TOUR AEGIS (x C), z -192..-76
  // =====================================================================
  {
    const d = district('nord', [-62, -192, -8, -76]);
    const g = d.group;
    slab(d, -62, -192, -8, -76, MAT.pave);
    const kit = d.useKit();
    const blds = [
      [-60, -188, -36, -166, 22, 'brick'], [-32, -188, -10, -170, 26, 'office'],
      [-60, -150, -42, -124, 18, 'stucco'], [-36, -150, -10, -132, 24, 'brick'],
      [-60, -104, -34, -80, 20, 'office'], [-28, -110, -10, -82, 15, 'stucco'],
    ];
    blds.forEach(([x0, z0, x1, z1, h, style], i) => {
      if (low && (i === 1 || i === 4)) return;
      kit.building(x0, z0, x1, z1, h, style === 'office' ? 'glass' : style, { style, seed: i % 2 });
    });
    // Cour intérieure : arbres en bacs, bancs
    for (const [x, z] of [[-50, -158], [-24, -158], [-50, -114], [-20, -122]]) {
      cbox(g, x, S, z, 2, 0.6, 2, MAT.stone, { cast: true });
      tree(d, 'round', x, S + 0.6, z, 1.1);
    }
    bench(d, -38, -156, Math.PI);
    bench(d, -36, -117, 0);
    for (const [x, z, l] of [[-46, -160, true], [-14, -156, false], [-38, -112, false]]) postLamp(d, x, S, z, { light: l });
    d.finish();
  }
  let aegisLogo = null;
  {
    const d = district('aegis', [8, -192, 62, -76]);
    const g = d.group;
    slab(d, 8, -192, 62, -76, MAT.paveCold);
    const kit = d.useKit();
    kit.building(20, -150, 50, -120, 90, 'glass', { style: 'glass', bareRoof: true, seed: 0 });
    // Enseignes AEGIS en haut des quatre façades
    const yS = 82;
    sign(g, 'AEGIS', '#ffffff', '#2a6fd1', 35, yS, -119.55, 0, 22, 5.5);
    sign(g, 'AEGIS', '#ffffff', '#2a6fd1', 35, yS, -150.45, Math.PI, 22, 5.5);
    sign(g, 'AEGIS', '#ffffff', '#2a6fd1', 50.45, yS, -135, Math.PI / 2, 22, 5.5);
    sign(g, 'AEGIS', '#ffffff', '#2a6fd1', 19.55, yS, -135, -Math.PI / 2, 22, 5.5);
    // Logo : anneau lumineux tournant au sommet
    aegisLogo = new THREE.Group();
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.6, 6, 28), MAT.glowCyan);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), MAT.glowCyan);
    aegisLogo.add(ringM, core);
    aegisLogo.position.set(35, 99, -135);
    aegisLogo.traverse((o) => (o.userData.dynamic = true));
    g.add(aegisLogo);
    cyl(g, 35, 90, -135, 0.5, 0.3, 3, MAT.metal, { collide: false });
    // Esplanade clôturée, portail verrouillé (contenu futur)
    fence(d, 12, -82, 58, -82, 'iron', { gaps: [[30, 40]] });
    fence(d, 12, -186, 58, -186, 'iron');
    fence(d, 12, -186, 12, -82, 'iron');
    fence(d, 58, -186, 58, -82, 'iron');
    for (const x of [29.4, 40.6]) {
      cbox(g, x, S, -82, 1.2, 3.4, 1.2, mat('#e8ecff'), { cast: true });
      d.I('lheadC', G.ball, MAT.coldHead).add(x, S + 3.7, -82, 0, 0.3, 0.3, 0.3);
    }
    for (let x = 30.1; x < 40; x += low ? 0.4 : 0.2) d.I('bar', G.ubase, MAT.dark).add(x, S, -82, 0, 0.05, 2.6, 0.05);
    box(g, 30, S + 1.2, -82.08, 40, S + 1.35, -81.92, MAT.dark, { collide: false });
    box(g, 30, S + 2.5, -82.08, 40, S + 2.65, -81.92, MAT.dark, { collide: false });
    col.addBox({ x: 30, y: 0, z: -82.2 }, { x: 40, y: S + 3.2, z: -81.8 }, 'gate');
    cbox(g, 35, S + 1.0, -81.85, 0.5, 0.6, 0.15, MAT.blink, { collide: false });
    sign(g, 'AEGIS — ACCÈS RESTREINT', '#ffffff', '#2a6fd1', 35, S + 3.25, -81.82, 0, 6, 1.2);
    addLight(g, 35, 4.5, -79.5, '#a8e6ff');
    // Bassin miroir, mâts, guérite, hélisurface
    box(g, 25.4, 0, -112.6, 44.6, S + 0.7, -95.4, MAT.stone, { cast: true });
    flat(g, 26, -112, 44, -96, S + 0.72, MAT.water, 8);
    for (const x of [28, 35, 42]) {
      d.I('flagpole', G.pole, MAT.white).add(x, S, -116, 0, 1, 9, 1);
      col.addCentered(x, 0, -116, 0.3, 9, 0.3);
      flag(d, x + 0.08, 8, -116, 0, 'AEGIS', '#ffffff', '#2a6fd1', 2.6, 1.5);
    }
    box(g, 45, S, -89, 49, S + 2.8, -85, mat('#e8ecff'), { colY0: 0, cast: true });
    box(g, 44.8, S + 2.8, -89.2, 49.2, S + 3.0, -84.8, mat('#2a6fd1'), { collide: false });
    const booth = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), MAT.warmGlass);
    booth.position.set(47, S + 1.8, -84.97);
    g.add(booth);
    disc(g, 35, -170, 9, S + 0.025, mat('#4a4a6a', { polygonOffset: true, polygonOffsetFactor: -1 }), 24);
    for (const [x, z, sx, sz] of [[32.2, -170, 0.8, 6], [37.8, -170, 0.8, 6], [35, -170, 4.8, 0.8]]) d.I('pline', G.ubox, MAT.lines).add(x, S + 0.04, z, 0, sx, 0.02, sz);
    for (const [x0, z0, x1, z1] of [[14, -118, 18, -96], [52, -118, 56, -96]]) hedge(d, x0, z0, x1, z1, 1.0);
    for (let x = 31; x <= 39; x += 2) {
      d.I('bollard', G.cyl, MAT.metal).add(x, S, -86, 0, 0.18, 0.9, 0.18);
      col.addCentered(x, 0, -86, 0.36, S + 0.9, 0.36);
    }
    // Côté rue (hors clôture) : bancs, lampadaires
    bench(d, 20, -78.8, Math.PI);
    bench(d, 50, -78.8, Math.PI);
    postLamp(d, 24, S, -78.6, { cold: true });
    postLamp(d, 46, S, -78.6, { cold: true });
    d.finish();
  }

  // =====================================================================
  // 7. QUARTIER D'AFFAIRES (x 76..192, z -192..-76)
  // =====================================================================
  {
    const d = district('affaires', [76, -192, 192, -76]);
    const g = d.group;
    slab(d, 76, -192, 192, -76, MAT.pave);
    const kit = d.useKit();
    const towers = [
      [80, -188, 106, -162, 72, 'glass'], [116, -186, 142, -166, 52, 'office'], [152, -190, 188, -160, 80, 'glass'],
      [80, -146, 104, -120, 44, 'office'], [124, -150, 150, -126, 64, 'glass'], [162, -146, 188, -122, 40, 'artdeco'],
      [84, -104, 110, -82, 48, 'office'], [142, -106, 170, -82, 58, 'glass'],
    ];
    towers.forEach(([x0, z0, x1, z1, h, style], i) => {
      if (low && (i === 1 || i === 5 || i === 6)) return;
      kit.building(x0, z0, x1, z1, h, style === 'artdeco' ? 'concrete' : 'glass', { style: style === 'artdeco' ? 'stucco' : style, seed: i % 2 });
    });
    // Esplanade : sculpture, arbres en bacs, bancs
    const sk = new THREE.Mesh(new THREE.TorusKnotGeometry(2.6, 0.7, 48, 6), mat('#e8553f'));
    sk.position.set(126, S + 5.6, -113);
    sk.castShadow = !low;
    g.add(sk);
    cbox(g, 126, S, -113, 4, 1.4, 4, MAT.stone, { cast: true });
    sign(g, 'ÉLAN — ESPLANADE', '#ffffff', '#2b2050', 126, S + 0.8, -110.97, 0, 3.6, 0.9);
    for (const [x, z] of [[116, -113], [136, -113], [116, -96], [136, -96], [178, -112], [178, -96]]) {
      cbox(g, x, S, z, 2, 0.6, 2, MAT.stone, { cast: true });
      tree(d, 'round', x, S + 0.6, z, 1.1, pick(['#3cc29a', '#7b5cd6']));
    }
    for (const [x, z, yaw] of [[120, -108, Math.PI], [132, -108, Math.PI]]) bench(d, x, z, yaw);
    for (const [x, z, l] of [[114, -104, true], [138, -104, false], [180, -104, true], [98, -152, false]]) postLamp(d, x, S, z, { cold: true, light: l });
    d.finish();
  }

  // =====================================================================
  // 8. CEINTURE NATURELLE (au-delà de ±208, jusqu'à ±300)
  // =====================================================================
  // --- Ouest : Forêt de Blackwood (sombre, un peu inquiétante) ---
  {
    const d = district('foret', [-300, -208, -208, 300]);
    const g = d.group;
    flat(g, -300, -208, -208, 300, 0.02, MAT.grassDark, 8);
    // Sentier depuis le bout de l'avenue z = 0
    d.paths.push(...ribbon(g, [[-208, 0], [-222, 2], [-236, -6], [-252, -4], [-262, 10], [-258, 30], [-266, 52], [-262, 60]], 2.4, 0.05, MAT.dirt));
    // Panneau en bois « BLACKWOOD »
    for (const z of [-9.4, -4.6]) cbox(d.group, -211.5, 0, z, 0.25, 2.6, 0.25, MAT.woodDark);
    cbox(g, -211.5, 1.4, -7, 0.2, 1.4, 5.4, MAT.woodDark, { collide: false });
    sign(g, 'FORÊT DE BLACKWOOD', '#ffd27a', '#3a2418', -211.38, 2.1, -7, Math.PI / 2, 5, 1.25);
    sign(g, 'ACCÈS DÉCONSEILLÉ LA NUIT', '#ff9ccf', '#3a2418', -211.38, 1.25, -7, Math.PI / 2, 4, 0.5);
    // Cabane abandonnée au bout du sentier
    box(g, -268, 0, 60, -260, 3.2, 66, mat('#5a4a4a'), { cast: true });
    gableRoof(g, -264, 63, 3.2, 8, 6, 2.2, mat('#5a4a4a'), roofMat('#3a3448'), true);
    col.addBox({ x: -268, y: 0, z: 60 }, { x: -260, y: 5.4, z: 66 });
    const cabinWin = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.8), new THREE.MeshBasicMaterial({ color: '#ff9a3d' }));
    cabinWin.position.set(-262, 1.8, 59.97);
    cabinWin.rotation.y = Math.PI;
    g.add(cabinWin);
    // Pins denses (instanciés), quelques arbres morts
    const ok = (x, z) => !d.nearPath(x, z, 3.2) && !(x > -270 && x < -256 && z > 55 && z < 70) && !(x > -216 && z > -14 && z < 4);
    scatterTrees(d, Math.round(620 * Q), -297, -207, -213, 297, ok, 'pine', 1.2, 2.0, 0);
    scatterTrees(d, Math.round(30 * Q), -290, -200, -220, 290, ok, 'dead', 1.0, 1.5, 0);
    // Champignons luminescents + paires d'yeux dans l'obscurité
    for (let i = 0; i < Math.round(80 * Q); i++) {
      const x = R(-295, -215);
      const z = R(-205, 295);
      const s = R(0.12, 0.35);
      d.I('mStem', G.ubase, MAT.white).add(x, 0, z, 0, s * 0.4, s * 1.4, s * 0.4);
      d.I('mCap', G.ball0, MAT.glowPurple).add(x, s * 1.4, z, 0, s, s * 0.5, s);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffe27a' });
    for (let i = 0; i < 10; i++) {
      const x = R(-290, -235);
      const z = R(-190, 280);
      const y = R(0.8, 2.2);
      for (const k of [-0.18, 0.18]) d.I('eye', G.ball0, eyeMat).add(x, y, z + k, 0, 0.07, 0.05, 0.07);
    }
    d.finish();
  }
  // --- Nord : le port (quai, grues, conteneurs, cargo, phare) ---
  let lighthouseBeam = null;
  {
    const d = district('port', [-300, -300, 300, -208]);
    const g = d.group;
    // Quai (dalle 15 cm) + mur de quai + eau
    box(g, -298, 0, -214, 298, S, -208, MAT.concrete, { tile: 4 });
    box(g, -300, -3, -214.6, 300, S - 0.01, -214, MAT.stone, { collide: false });
    box(g, -300, S - 0.01, -214.1, 300, S + 0.12, -213.9, mat('#ffcd20'), { collide: false });
    flat(g, -300, -300, 300, -214.3, -1.0, MAT.water, 10);
    // Garde-corps + mur invisible : on ne marche pas sur l'eau
    col.addBox({ x: -300, y: 0, z: -214.1 }, { x: 300, y: 1.25, z: -213.55 }, 'rail');
    col.addBox({ x: -300, y: 0, z: -215.2 }, { x: 300, y: 200, z: -214.3 }, 'water');
    for (let x = -296; x <= 296; x += low ? 4 : 2) d.I('rpost', G.ubase, MAT.white).add(x, S, -213.8, 0, 0.07, 1.05, 0.07);
    for (const ry of [0.55, 1.05]) box(g, -298, S + ry - 0.03, -213.85, 298, S + ry + 0.03, -213.75, MAT.white, { collide: false });
    for (let x = -294; x <= 294; x += 12) {
      d.I('bollard', () => geo('bollardP', () => mergeGeometries([new THREE.CylinderGeometry(0.22, 0.28, 0.6, 8).translate(0, 0.3, 0), new THREE.CylinderGeometry(0.34, 0.3, 0.12, 8).translate(0, 0.62, 0)].map(nonIdx))), MAT.dark).add(x, S, -213.0);
      col.addCentered(x, 0, -213.0, 0.6, S + 0.68, 0.6);
    }
    // Grues portiques (jambes sur le quai, flèche au-dessus de l'eau)
    const crane = (cx, color) => {
      const cm = mat(color);
      for (const lx of [-5, 5]) for (const lz of [-208.5, -213.1]) {
        cbox(g, cx + lx, S, lz, 0.8, 16, 0.8, cm, { cast: true });
      }
      for (const lz of [-208.5, -213.1]) cbox(g, cx, S + 15.2, lz, 10.8, 0.9, 0.8, cm, { collide: false, cast: true });
      for (const lx of [-5, 5]) cbox(g, cx + lx, S + 15.2, -210.8, 0.8, 0.9, 5.4, cm, { collide: false });
      box(g, cx - 4, S + 16.1, -214, cx + 4, S + 20, -207.6, mat('#e8e4f0'), { collide: false, cast: true });
      sign(g, 'PORT DE VESPER', '#ffffff', '#2b2050', cx, S + 18.1, -207.55, 0, 6, 1.5);
      box(g, cx - 0.7, S + 21.3, -258, cx + 0.7, S + 22.7, -196, cm, { collide: false, cast: true });
      box(g, cx - 1.8, S + 20, -200, cx + 1.8, S + 22.5, -196.5, MAT.stone, { collide: false });
      for (const k of [-1, 1]) cbox(g, cx + k * 1.2, S + 20, -210.5, 0.4, 10.5, 0.4, cm, { collide: false, roll: -k * 0.12 });
      const ax = cx;
      const ay = S + 30.3;
      const az = -210.5;
      for (const [tz, ty] of [[-256, S + 22.7], [-198, S + 22.7]]) {
        const len = Math.hypot(az - tz, ay - ty);
        const m = new THREE.Mesh(G.ubox(), MAT.metal);
        m.scale.set(0.08, 0.08, len);
        m.position.set(ax, (ay + ty) / 2, (az + tz) / 2);
        m.rotation.x = Math.atan2(-(ty - ay), tz - az);
        g.add(m);
      }
      // Câbles + palonnier avec un conteneur suspendu
      d.I('cable', G.ubox, MAT.metal).add(cx - 0.6, S + 16.6, -240, 0, 0.05, 11, 0.05);
      d.I('cable', G.ubox, MAT.metal).add(cx + 0.6, S + 16.6, -240, 0, 0.05, 11, 0.05);
      box(g, cx - 1.5, S + 10.6, -246.1, cx + 1.5, S + 11.0, -233.9, MAT.dark, { collide: false });
      box(g, cx - 1.22, S + 8.0, -246.1, cx + 1.22, S + 10.6, -233.9, ribMat(pick(CONT)), { collide: false });
      d.I('blink', G.ball0, MAT.blink).add(ax, ay + 0.3, az, 0, 0.35, 0.35, 0.35);
      d.I('blink', G.ball0, MAT.blink).add(cx, S + 23, -257.5, 0, 0.3, 0.3, 0.3);
    };
    crane(-60, '#ff8a3d');
    crane(20, '#e8553f');
    if (!low) crane(100, '#ffcd20');
    // Conteneurs sur le quai (en laissant la promenade z -211..-208 libre)
    for (const [x0, n] of [[-140, 2], [-127, 1], [-36, 2], [-23, 1], [44, 3], [57, 1], [130, 2], [210, 1], [223, 2]]) {
      for (let k = 0; k < n; k++) container(d, x0, S + k * 2.6, -213.45, true, pick(CONT));
    }
    // Capitainerie
    box(g, 168, S, -213.3, 182, S + 5, -209.2, mat('#f4f0e8'), { colY0: 0, cast: true });
    box(g, 167.7, S + 5, -213.5, 182.3, S + 5.3, -209, mat('#3d6fd1'), { collide: false });
    sign(g, 'CAPITAINERIE', '#ffffff', '#3d6fd1', 175, S + 3.6, -209.15, 0, 6, 1.3);
    for (let x = 169.5; x < 181; x += 2.6) d.I('gfWin', () => geo('gfWin', () => new THREE.PlaneGeometry(2.6, 1.7)), MAT.lit, { colored: true }).add(x, S + 1.8, -209.17, 0, 0.6, 0.7, 1, '#ffe8b0');
    // Cargo amarré (visuel : dans l'eau, au-delà du garde-corps)
    const hull = mat('#2b3f7a');
    box(g, -30, -3, -246, 90, 3.2, -230, hull, { collide: false, cast: true });
    box(g, -30.2, 2.0, -246.2, 90.2, 3.4, -229.8, mat('#d8453f'), { collide: false });
    const bow = new THREE.Mesh(G.prism(), hull);
    bow.scale.set(6.2, 14, 16);
    bow.rotation.set(0, 0, -Math.PI / 2);
    bow.position.set(90, 0.1, -238);
    g.add(bow);
    box(g, -26, 3.2, -244, -14, 12, -232, mat('#f4f0e8'), { collide: false, cast: true });
    for (let x = -24; x < -15; x += 2.6) d.I('gfWin', () => geo('gfWin', () => new THREE.PlaneGeometry(2.6, 1.7)), MAT.lit, { colored: true }).add(x, 10.5, -231.95, 0, 0.6, 0.5, 1, '#ffe8b0');
    cyl(g, -20, 12, -238, 1.2, 1.0, 4, mat('#d8453f'), { collide: false });
    for (let x = -10; x < 84; x += 6.4) {
      const n = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        for (const z of [-243.5, -240.7, -237.9, -235.1, -232.3]) {
          if (rand() < 0.15) continue;
          d.I('shipBox', G.ubox, MAT.inst, { colored: true }).add(x, 3.2 + 1.3 + k * 2.6, z, 0, 6.1, 2.6, 2.44, pick(CONT));
        }
      }
    }
    // Phare sur un îlot rocheux
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 1), mat('#5a5070'));
    rock.scale.set(1, 0.45, 1);
    rock.position.set(230, -1.5, -262);
    g.add(rock);
    cyl(g, 230, 3.5, -262, 2.4, 1.7, 18, MAT.white, { seg: 10, collide: false, cast: true });
    for (const y of [7, 13]) cyl(g, 230, 3.5 + y, -262, 2.4 - (y / 18) * 0.7 + 0.05, 2.4 - ((y + 2.4) / 18) * 0.7 + 0.05, 2.4, mat('#d8453f'), { seg: 10, collide: false });
    cyl(g, 230, 21.5, -262, 1.4, 1.4, 1.8, MAT.lampHead, { seg: 10, collide: false });
    const lhRoof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.6, 10), mat('#d8453f'));
    lhRoof.position.set(230, 24.1, -262);
    g.add(lhRoof);
    lighthouseBeam = new THREE.Mesh(
      new THREE.ConeGeometry(4, 40, 10, 1, true).translate(0, -20, 0).rotateZ(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#fff4c0', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    lighthouseBeam.position.set(230, 22.4, -262);
    lighthouseBeam.userData.dynamic = true;
    g.add(lighthouseBeam);
    // Lampadaires du quai
    for (const x of [-180, -100, -20, 60, 140, 220]) postLamp(d, x, S, -208.6, { cold: true, light: true, h: 5.5 });
    d.finish();
  }
  // --- Est : collines boisées, chemin de terre fermé ---
  const hill = (d, x, z, r, sy, color) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, low ? 1 : 2), mat(color));
    m.scale.set(1, sy, 1);
    m.position.set(x, -r * sy * 0.15, z);
    m.receiveShadow = true;
    d.group.add(m);
    col.addBox({ x: x - r * 0.72, y: 0, z: z - r * 0.72 }, { x: x + r * 0.72, y: r * sy * 0.6, z: z + r * 0.72 }, 'hill');
    return (px, pz) => Math.hypot(px - x, pz - z) > r * 1.05;
  };
  {
    const d = district('est', [208, -208, 300, 300]);
    const g = d.group;
    flat(g, 208, -208, 300, 300, 0.02, MAT.grass, 8);
    const free = [hill(d, 272, -120, 45, 0.45, '#4f8f5a'), hill(d, 285, 75, 50, 0.5, '#4a8a62'), hill(d, 262, 190, 40, 0.42, '#5a9a5a'), hill(d, 300, 270, 55, 0.5, '#4f8f5a')];
    d.paths.push(...ribbon(g, [[208, 0], [230, 1], [250, -3], [272, 2], [290, 0]], 4.5, 0.05, MAT.dirt));
    for (const z of [-2.6, 2.6]) cbox(g, 289, 0, z, 0.3, 1.2, 0.3, MAT.woodDark);
    cbox(g, 289, 0.9, 0, 0.15, 0.4, 6, mat('#ff8a3d'), { colY0: 0, colH: 1.3 });
    sign(g, 'ROUTE FERMÉE', '#ffffff', '#d8453f', 288.9, 1.9, 0, -Math.PI / 2, 4, 1);
    const ok = (x, z) => free.every((f) => f(x, z)) && !d.nearPath(x, z, 4);
    scatterTrees(d, Math.round(220 * Q), 213, -205, 296, 296, ok, 'round', 1.2, 2.0, 0);
    scatterTrees(d, Math.round(60 * Q), 213, -205, 296, 296, ok, 'pine', 1.1, 1.6, 0);
    d.finish();
  }
  // --- Sud : champs, ferme, moulin, épouvantail ---
  let windmill = null;
  {
    const d = district('sud', [-208, 208, 208, 300]);
    const g = d.group;
    flat(g, -208, 208, 208, 300, 0.02, MAT.grass, 8);
    const crops = [['#d8b84a', '#c8a03a'], ['#5aa84a', '#4a9040'], ['#9a7ad8', '#7a5ab8'], ['#c89a5a', '#a87a4a']];
    const fields = [];
    for (const [x0, x1] of [[-200, -140], [-130, -75], [-63, -6], [6, 63], [75, 130], [140, 200]]) {
      for (const [z0, z1] of [[216, 248], [254, 286]]) {
        if ((x0 === 75 && z0 === 216) || (x0 === -130 && z0 === 254)) {
          flat(g, x0, z0, x1, z1, 0.04, MAT.dirt, 4); // cour de ferme / pied du moulin
          continue;
        }
        const [c1, c2] = pick(crops);
        const m = M({ map: cropTexture(c1, c2), polygonOffset: true, polygonOffsetFactor: -1 });
        flat(g, x0, z0, x1, z1, 0.04, m, 4);
        fields.push([x0, z0, x1, z1]);
      }
    }
    // Chemins de terre entre les champs
    for (const x of [0, -69, 69]) d.paths.push(...ribbon(g, [[x, 208], [x, 290]], 4, 0.05, MAT.dirt));
    d.paths.push(...ribbon(g, [[-205, 251], [205, 251]], 3, 0.05, MAT.dirt));
    // Clôture le long de la route
    fence(d, -205, 212, 205, 212, 'wood', { y: 0, gaps: [[-3, 3], [-72, -66], [66, 72]] });
    // Ferme : grange rouge + silo
    box(g, 100, 0, 228, 118, 7, 242, mat('#c0463f'), { cast: true });
    gableRoof(g, 109, 235, 7, 18, 14, 4, mat('#c0463f'), roofMat('#5a4a6a'), true);
    col.addBox({ x: 100, y: 0, z: 228 }, { x: 118, y: 11, z: 242 });
    cbox(g, 109, 0, 227.95, 5, 5, 0.1, mat('#f4f0e8'), { collide: false });
    cbox(g, 109, 0, 227.9, 4.4, 4.6, 0.1, mat('#8a3a3a'), { collide: false });
    cyl(g, 124, 0, 234, 3, 3, 14, mat('#d8d4e8'), { seg: 10, cast: true });
    const siloTop = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.4, 10), mat('#8a8aa0'));
    siloTop.position.set(124, 15.2, 234);
    g.add(siloTop);
    // Moulin à vent (pales animées)
    cyl(g, -120, 0, 262, 3.4, 2.4, 13, mat('#f2e2c8'), { seg: 8, cast: true });
    const capM = new THREE.Mesh(new THREE.ConeGeometry(3, 3, 8), roofMat('#5a4a6a'));
    capM.position.set(-120, 14.5, 262);
    g.add(capM);
    windmill = new THREE.Group();
    windmill.position.set(-120, 12, 258.6);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9, 0.15).translate(0, 4.7, 0), MAT.white);
      b.rotation.z = (i * Math.PI) / 2;
      windmill.add(b);
    }
    windmill.traverse((o) => (o.userData.dynamic = true));
    g.add(windmill);
    // Bottes de foin, épouvantail
    for (let i = 0; i < Math.round(18 * Q); i++) {
      const [x0, z0, x1, z1] = pick(fields);
      const x = R(x0 + 3, x1 - 3);
      const z = R(z0 + 3, z1 - 3);
      if (blocked(x, z, 1.5)) continue;
      d.I('hay', () => geo('hay', () => new THREE.CylinderGeometry(0.9, 0.9, 1.4, 10).rotateZ(Math.PI / 2).translate(0, 0.9, 0)), mat('#e8c060')).add(x, 0, z, rand() * 6);
      col.addCentered(x, 0, z, 1.6, 1.8, 1.6);
    }
    cbox(g, 30, 0, 236, 0.15, 2.6, 0.15, MAT.woodDark);
    cbox(g, 30, 1.8, 236, 1.8, 0.12, 0.12, MAT.woodDark, { collide: false });
    cbox(g, 30, 1.2, 236, 0.7, 0.9, 0.4, mat('#5a6aa8'), { collide: false });
    d.I('scareHead', G.ball0, mat('#e8c060')).add(30, 2.55, 236, 0, 0.32, 0.32, 0.32);
    d.I('gnomeHat', () => geo('gnomeHat', () => new THREE.ConeGeometry(0.2, 0.45, 8)), mat('#3a2418')).add(30, 2.95, 236, 0, 1.6, 1.0, 1.6);
    const free = [hill(d, -150, 305, 60, 0.42, '#4f8f5a'), hill(d, 40, 312, 70, 0.45, '#5a9a5a'), hill(d, 200, 300, 50, 0.4, '#4a8a62')];
    const ok = (x, z) => free.every((f) => f(x, z)) && !d.nearPath(x, z, 3) && !fields.some(([x0, z0, x1, z1]) => x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1) && !(x > 96 && x < 130 && z > 224 && z < 246);
    scatterTrees(d, Math.round(110 * Q), -205, 214, 205, 296, ok, 'round', 1.1, 1.8, 0);
    d.finish();
  }

  // =====================================================================
  // ROUTES : marquages, passages piétons, lampadaires des nouvelles voies
  // =====================================================================
  {
    const d = district('routes', [-212, -212, 212, 212]);
    const g = d.group;
    const quads = [];
    // Tirets (0,5 × 3,3 m tous les 6 m) le long d'un segment aligné
    const dashes = (x0, z0, x1, z1) => {
      const alongX = z0 === z1;
      const a0 = alongX ? x0 : z0;
      const a1 = alongX ? x1 : z1;
      for (let a = a0 + 2; a + 3.3 <= a1 - 1; a += 6) {
        const q = new THREE.PlaneGeometry(alongX ? 3.3 : 0.5, alongX ? 0.5 : 3.3).rotateX(-Math.PI / 2);
        q.translate(alongX ? a + 1.65 : x0, 0, alongX ? z0 : a + 1.65);
        quads.push(q);
      }
    };
    const SEG_OUT = [[-192, -76], [76, 192]];
    const SEG_ALL = [[-192, -76], [-62, -8], [8, 62], [76, 192]];
    for (const c of [0, 69, -69]) for (const [a, b] of SEG_OUT) {
      dashes(c, a, c, b);
      dashes(a, c, b, c);
    }
    for (const c of [200, -200]) for (const [a, b] of SEG_ALL) {
      dashes(c, a, c, b);
      dashes(a, c, b, c);
    }
    // Passages piétons : roadAlongZ = la route court selon Z (on traverse selon X)
    const zebra = (cx, cz, roadAlongZ, half) => {
      for (let o = -half + 1; o <= half - 1; o += 1.8) {
        const q = new THREE.PlaneGeometry(roadAlongZ ? 0.9 : 3, roadAlongZ ? 3 : 0.9).rotateX(-Math.PI / 2);
        q.translate(roadAlongZ ? cx + o : cx, 0, roadAlongZ ? cz : cz + o);
        quads.push(q);
      }
    };
    zebra(136, 0, false, 8);
    zebra(30, 69, false, 7);
    zebra(-69, 30, true, 7);
    zebra(69, -30, true, 7);
    zebra(-134, 0, false, 8);
    zebra(-134, 69, false, 7);
    zebra(35, -69, false, 7);
    zebra(-69, -35, true, 7);
    zebra(0, 120, true, 8);
    const marks = new THREE.Mesh(mergeGeometries(quads), M({ color: '#ebe6d2', polygonOffset: true, polygonOffsetFactor: -2 }));
    marks.position.y = 0.02;
    marks.receiveShadow = true;
    g.add(marks);
    // Lampadaires à crosse le long des nouvelles voies (tête émissive ; une
    // vraie lumière tous les 4 lampadaires environ).
    let nLamp = 0;
    const NO_LAMP = [[116, 0, 156, 12], [-80, 20, -70, 40]]; // portail du lycée, entrée du parc
    const streetLamp = (x, z, dx, dz) => {
      if (blocked(x, z, 1.1, 0.3) || nearKeep(x, z, 1.0)) return;
      if (NO_LAMP.some(([a, b, c, e]) => x > a && x < c && z > b && z < e)) return;
      const y = col.groundHeight(x, z, 0.2, 0.3);
      const yaw = Math.atan2(dx, dz);
      d.I('slPole', G.pole, MAT.dark).add(x, y, z, 0, 1.4, 6.2, 1.4);
      d.I('slArm', G.ubox, MAT.dark).add(x + dx * 0.7, y + 6.15, z + dz * 0.7, yaw, 0.1, 0.1, 1.5);
      d.I('lhead', G.ball, MAT.lampHead).add(x + dx * 1.4, y + 5.95, z + dz * 1.4, 0, 0.34, 0.24, 0.34);
      col.addCentered(x, 0, z, 0.35, y + 6, 0.35);
      if (nLamp++ % 4 === 0) addLight(g, x + dx * 1.4, y + 5.6, z + dz * 1.4);
    };
    // Avenues (deux côtés), segments extérieurs
    for (const [a, b] of SEG_OUT) {
      for (let s = a + 6; s < b; s += 26) {
        streetLamp(8.7, s, -1, 0);
        streetLamp(-8.7, s + 13, 1, 0);
        streetLamp(s, 8.7, 0, -1);
        streetLamp(s + 13, -8.7, 0, 1);
      }
    }
    // Prolongements du périphérique intérieur (un côté)
    for (const [a, b] of SEG_OUT) {
      for (let s = a + 10; s < b; s += 30) {
        streetLamp(77.3, s, -1, 0);
        streetLamp(-77.3, s, 1, 0);
        streetLamp(s, 77.3, 0, -1);
        streetLamp(s, -77.3, 0, 1);
      }
    }
    // Périphérique extérieur (côté nature)
    for (let s = -190; s <= 190; s += 30) {
      if (onRoadBand(s, 2)) continue;
      streetLamp(209.4, s, -1, 0);
      streetLamp(-209.4, s, 1, 0);
      streetLamp(s, 209.4, 0, -1);
      streetLamp(s, -209.4, 0, 1);
    }
    d.finish();
  }

  // Murs invisibles de bord de carte (juste à l'intérieur de ±298).
  col.addBox({ x: 296.5, y: 0, z: -300 }, { x: 300, y: 200, z: 300 }, 'bounds');
  col.addBox({ x: -300, y: 0, z: -300 }, { x: -296.5, y: 200, z: 300 }, 'bounds');
  col.addBox({ x: -300, y: 0, z: 296.5 }, { x: 300, y: 200, z: 300 }, 'bounds');
  col.addBox({ x: -300, y: 0, z: -300 }, { x: 300, y: 200, z: -296.5 }, 'bounds');

  // Indices de la grille de quartier (pour le moteur / la minicarte)
  void BAND;

  return {
    districts,
    // Portes de commerces et halls praticables (voir world/shops.js).
    get shopDoors() {
      return kits.flatMap((k) => k.shopDoors);
    },
    targets,
    enemySpawns,
    crates,
    magnetSpots,
    npcRoutes,
    hangouts,
    // Intensité des fenêtres allumées des immeubles (0 = coupure de courant)
    setLights(k) {
      for (const kit of kits) kit.setLights(k);
      MAT.lit.color.setScalar(0.25 + 0.75 * k);
      MAT.lampHead.emissiveIntensity = 2.2 * k;
      MAT.coldHead.emissiveIntensity = 2.2 * k;
    },
    update(dt, t) {
      // Eau qui ondule (texture partagée : étang, bassins, mer)
      T.water.offset.set((t * 0.012) % 1, (t * 0.02) % 1);
      // Feux clignotants (grues, cheminées)
      MAT.blink.emissiveIntensity = Math.sin(t * 3) > 0.2 ? 4 : 0.25;
      MAT.glowPurple.emissiveIntensity = 1.3 + Math.sin(t * 1.7) * 0.5;
      // Drapeaux
      for (const f of flags) {
        const p = f.m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = f.base[i * 3];
          p.setZ(i, Math.sin(x * 1.8 - t * 5 + f.ph) * 0.18 * (x / f.w));
        }
        p.needsUpdate = true;
      }
      if (aegisLogo) aegisLogo.rotation.y = t * 0.4;
      if (windmill) windmill.rotation.z = -t * 0.6;
      if (lighthouseBeam) lighthouseBeam.rotation.y = t * 0.7;
      for (const u of updaters) u(dt, t);
    },
  };
}
