// Région 1 — VESPER DOWNTOWN (vertical slice).
// Construit la géométrie, les collisions, les lumières, la pluie et renvoie les
// points d'intérêt (cibles de mission, apparitions d'ennemis, caisses).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, PALETTE } from '../fx/toon.js';
import { mulberry32 } from '../core/rng.js';
import {
  facadeTextures, asphaltTextures, sidewalkTexture, ribbedTexture, riftTexture, signTexture, roadMarkTexture,
} from './textures.js';

// Matériau cartoon à partir de paramètres « standard » (rugosité/métal ignorés).
function M(p = {}) {
  const m = new THREE.MeshToonMaterial({ gradientMap: toon('#fff').gradientMap });
  for (const k of ['color', 'map', 'emissive', 'emissiveMap', 'emissiveIntensity', 'transparent', 'opacity', 'side', 'wireframe', 'polygonOffset', 'polygonOffsetFactor', 'depthWrite']) {
    if (p[k] === undefined) continue;
    if (k === 'color' || k === 'emissive') m[k].set(p[k]);
    else m[k] = p[k];
  }
  return m;
}

const BAY = 4; // largeur d'une travée de fenêtre (m)
const FLOOR = 3.5; // hauteur d'étage (m)

export function buildDowntown(scene, col, quality) {
  const rand = mulberry32(2026);
  const root = new THREE.Group();
  root.name = 'downtown';
  scene.add(root);
  const updaters = [];
  const smokeSources = [];
  const lampLights = [];
  const maxLights = { low: 3, medium: 8, high: 14 }[quality] ?? 8;

  // ---------- Matériaux partagés ----------
  const asphalt = asphaltTextures();
  asphalt.map.repeat.set(40, 40);
  asphalt.roughness.repeat.set(40, 40);
  const groundMat = M({
    map: asphalt.map,
  });
  const sidewalkMat = M({ map: sidewalkTexture() });
  const concreteMat = M({ color: '#8f8bc4' });
  const darkMetal = M({ color: '#3a2f6b' });
  const roofMat = M({ color: '#4a3f7a' });
  const barrierMat = M({ color: '#f2efe6' });
  const stripeMat = M({ color: '#ff8a3d' });

  // ---------- Sol & routes ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // Marquages : lignes discontinues au centre des routes.
  const marks = roadMarkTexture();
  const markMat = M({
    map: marks, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  });
  const addDashes = (x, z, len, alongX) => {
    const t = marks.clone();
    t.needsUpdate = true;
    t.repeat.set(1, len / 6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, len), markMat.clone());
    m.material.map = t;
    m.rotation.x = -Math.PI / 2;
    if (alongX) m.rotation.z = Math.PI / 2;
    m.position.set(x, 0.02, z);
    root.add(m);
  };
  addDashes(0, -38, 52, false);
  addDashes(0, 38, 52, false);
  addDashes(-38, 0, 52, true);
  addDashes(38, 0, 52, true);

  // Passages piétons autour de la place.
  const zebraMat = M({ color: '#fff4d6', polygonOffset: true, polygonOffsetFactor: -2 });
  const zebra = (x, z, alongX) => {
    for (let i = -3; i <= 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? 3 : 0.9, alongX ? 0.9 : 3), zebraMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x + (alongX ? 0 : i * 1.8), 0.021, z + (alongX ? i * 1.8 : 0));
      root.add(m);
    }
  };
  zebra(0, 12, false);
  zebra(0, -12, false);
  zebra(12, 0, true);
  zebra(-12, 0, true);

  // Trottoirs : une dalle par îlot (praticable : 15 cm).
  const blocks = [
    [-62, 8, -8, 62], [8, 8, 62, 62], [-62, -62, -8, -8], [8, -62, 62, -8],
  ];
  for (const [x0, z0, x1, z1] of blocks) {
    const w = x1 - x0;
    const d = z1 - z0;
    const t = sidewalkMat.map.clone();
    t.needsUpdate = true;
    t.repeat.set(w / 4, d / 4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), M({ map: t }));
    m.position.set((x0 + x1) / 2, 0.075, (z0 + z1) / 2);
    m.receiveShadow = true;
    root.add(m);
    col.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: 0.15, z: z1 });
    // Bordure
    const curb = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.17, d + 0.3), concreteMat);
    curb.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    root.add(curb);
  }

  // ---------- Bâtiments ----------
  const facadeMats = {};
  const facadeMat = (style, seed) => {
    const k = style + seed;
    if (!facadeMats[k]) {
      const f = facadeTextures(style, seed);
      facadeMats[k] = M({
        map: f.map,
        emissiveMap: f.emissive,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 1.1
      });
    }
    return facadeMats[k];
  };

  function building(x0, z0, x1, z1, h, style, opts = {}) {
    const w = x1 - x0;
    const d = z1 - z0;
    const geo = new THREE.BoxGeometry(w, h, d);
    // UV en unités monde : 1 répétition = 8 travées x 8 étages.
    const uv = geo.attributes.uv;
    const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const ou = Math.floor(rand() * 8) / 8;
    for (let f = 0; f < 6; f++) {
      const [su, sv] = sizes[f];
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * (su / (BAY * 8)) + ou, uv.getY(i) * (sv / (FLOOR * 8)));
      }
    }
    const fm = facadeMat(style, opts.seed ?? Math.floor(rand() * 8));
    const mesh = new THREE.Mesh(geo, [fm, fm, roofMat, roofMat, fm, fm]);
    mesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    mesh.castShadow = h < 30;
    mesh.receiveShadow = true;
    root.add(mesh);
    if (!opts.noCollide) col.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: h, z: z1 }, 'building');

    // Acrotère (praticable sur les toits accessibles)
    const p = 0.45;
    const parapet = [
      [x0, z0, x1, z0 + 0.3], [x0, z1 - 0.3, x1, z1], [x0, z0, x0 + 0.3, z1], [x1 - 0.3, z0, x1, z1],
    ];
    for (const [a, b, c, e] of parapet) {
      const pm = new THREE.Mesh(new THREE.BoxGeometry(c - a, p, e - b), concreteMat);
      pm.position.set((a + c) / 2, h + p / 2, (b + e) / 2);
      root.add(pm);
      if (opts.walkableRoof) col.addBox({ x: a, y: h, z: b }, { x: c, y: h + p, z: e });
    }
    // Équipements de toit
    if (!opts.bareRoof) {
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const sx = 1.5 + rand() * 2.5;
        const sz = 1.5 + rand() * 2;
        const sy = 1 + rand() * 1.5;
        const ax = x0 + 2 + rand() * Math.max(0.1, w - 4 - sx);
        const az = z0 + 2 + rand() * Math.max(0.1, d - 4 - sz);
        const ac = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), darkMetal);
        ac.position.set(ax + sx / 2, h + sy / 2, az + sz / 2);
        ac.castShadow = true;
        root.add(ac);
        if (opts.walkableRoof) col.addCentered(ax + sx / 2, h, az + sz / 2, sx, sy, sz);
      }
    }
    // Rez-de-chaussée : bandeau sombre + enseigne éventuelle
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 3.2, d + 0.2), M({ color: '#2b2050' }));
    band.position.set((x0 + x1) / 2, 1.6, (z0 + z1) / 2);
    root.add(band);
    if (opts.sign) {
      const [text, color, face] = opts.sign;
      const sm = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.7, 10), 2.2),
        M({ map: signTexture(text, color), emissiveMap: signTexture(text, color), emissive: '#ffffff', emissiveIntensity: 1.6 }),
      );
      const faces = {
        n: [(x0 + x1) / 2, z0 - 0.15, Math.PI], s: [(x0 + x1) / 2, z1 + 0.15, 0],
        w: [x0 - 0.15, (z0 + z1) / 2, -Math.PI / 2], e: [x1 + 0.15, (z0 + z1) / 2, Math.PI / 2],
      };
      const [sx, sz, ry] = faces[face];
      sm.position.set(sx, 4.4, sz);
      sm.rotation.y = ry;
      root.add(sm);
      const glow = new THREE.PointLight(color, 0, 14, 2);
      glow.position.set(sx + Math.sin(ry) * 1.5, 4, sz + Math.cos(ry) * 1.5);
      lampLights.push({ light: glow, priority: 1, base: 6 });
      root.add(glow);
    }
    return mesh;
  }

  // Périmètre : tours continues qui ferment la zone de façon naturelle.
  const ring = (a0, a1, side) => {
    let a = a0;
    while (a < a1) {
      const len = Math.min(a1 - a, 14 + rand() * 16);
      const h = 30 + rand() * 50;
      const depth = 18 + rand() * 10;
      const style = ['concrete', 'glass', 'brick'][Math.floor(rand() * 3)];
      if (side === 'n') building(a, -76 - depth, a + len, -76, h, style, { bareRoof: true });
      if (side === 's') building(a, 76, a + len, 76 + depth, h, style, { bareRoof: true });
      if (side === 'w') building(-76 - depth, a, -76, a + len, h, style, { bareRoof: true });
      if (side === 'e') building(76, a, 76 + depth, a + len, h, style, { bareRoof: true });
      a += len;
    }
  };
  // Les avenues traversent le périmètre : barrages de quarantaine aux sorties.
  ring(-104, -8, 'n'); ring(8, 104, 'n');
  ring(-104, -8, 's'); ring(8, 104, 's');
  ring(-76, -8, 'w'); ring(8, 76, 'w');
  ring(-76, -8, 'e'); ring(8, 76, 'e');

  // Q1 — bloc du refuge
  building(-60, 10, -46, 30, 22, 'concrete');
  building(-27, 38, -10, 60, 34, 'glass');
  building(-62, 36, -32, 60, 8, 'brick', { seed: 2, sign: ['REFUGE', '#ffb347', 'e'] });
  building(-62, 30, -47, 36, 12, 'brick');

  // Q2 — bloc commerçant + ruelle
  building(10, 11, 28, 26, 14, 'brick', { sign: ['NOVA MARKET', '#4dd2ff', 'n'] });
  building(32, 11, 59, 24, 42, 'glass');
  building(12, 40, 40, 59, 18, 'concrete', { seed: 4, sign: ['LYCÉE VESPER-NORD', '#ffffff', 'n'] });
  building(44, 32, 59, 59, 26, 'concrete', { sign: ['HOTEL LUMEN', '#ff4d6d', 'w'] });

  // Q3 — immeuble Corvin (toit accessible) et voisins
  building(-40, -40, -16, -16, 9, 'concrete', { walkableRoof: true, seed: 1, sign: ['CORVIN', '#9be35a', 'e'] });
  building(-60, -60, -46, -44, 36, 'glass');
  building(-36, -60, -10, -46, 24, 'brick');
  building(-60, -14, -48, -10, 6, 'brick');

  // Q4 — parking Halden : bâtiment du fond
  building(48, -60, 60, -12, 20, 'concrete', { sign: ['PARKING', '#ffcd20', 'w'] });

  // ---------- Place Halden (centre) ----------
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48),
    M({ color: '#5b4f9a', polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.015;
  root.add(plaza);
  const ped = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 3.2), concreteMat);
  ped.position.set(0, 0.6, 0);
  ped.castShadow = true;
  root.add(ped);
  col.addCentered(0, 0, 0, 3.2, 1.2, 3.2);
  // Monument brisé : obélisque fendu, morceau tombé au sol.
  const obMat = M({ color: '#c9b8ff' });
  const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 5, 4), obMat);
  ob.position.set(0, 3.7, 0);
  ob.rotation.y = Math.PI / 4;
  ob.castShadow = true;
  root.add(ob);
  const obTop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.5, 2.6, 4), obMat);
  obTop.position.set(2.8, 0.55, 1.6);
  obTop.rotation.set(0.2, 0.6, Math.PI / 2.1);
  obTop.castShadow = true;
  root.add(obTop);
  col.addCentered(2.8, 0, 1.6, 2.4, 1.0, 1.2);

  // ---------- Décor : voitures, barrières, conteneurs ----------
  const carColors = ['#ff5d5d', '#4fc3f7', '#ffd54f', '#9575cd', '#66bb6a', '#ff8a65', '#f06292'];
  const glassMat = M({ color: '#3a5bb8', emissive: '#1a2a6a', emissiveIntensity: 0.6 });
  const tireMat = M({ color: '#221a3a' });
  const hubMat = M({ color: '#e8e4ff' });
  const headMat = M({ color: '#fff', emissive: '#fff4d6', emissiveIntensity: 2 });
  const tailMat = M({ color: '#ff3b5a', emissive: '#ff2040', emissiveIntensity: 1.2 });
  const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.36, 18);
  const hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.38, 12);
  const burntMat = M({ color: '#4a3550' });
  const rbox = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1));

  // Voiture « bulle » : carrosserie arrondie, grosses roues, phares ronds.
  function car(x, z, rot, opts = {}) {
    const g = new THREE.Group();
    const paint = opts.burnt ? burntMat : M({ color: opts.color || carColors[Math.floor(rand() * carColors.length)] });
    const len = opts.van ? 5.2 : 4.1;
    const body = new THREE.Mesh(rbox(2.0, opts.van ? 1.7 : 0.9, len, 0.4), paint);
    body.position.y = opts.van ? 1.3 : 0.85;
    g.add(body);
    if (!opts.van) {
      const cabin = new THREE.Mesh(rbox(1.7, 0.8, 2.0, 0.35), paint);
      cabin.position.set(0, 1.55, -0.25);
      g.add(cabin);
      for (const [wz, wl] of [[0.77, 0.06], [-1.27, 0.06]]) {
        const win = new THREE.Mesh(rbox(1.5, 0.55, wl, 0.03), glassMat);
        win.position.set(0, 1.6, wz);
        g.add(win);
      }
      for (const sx of [-0.86, 0.86]) {
        const sw = new THREE.Mesh(rbox(0.06, 0.5, 1.6, 0.03), glassMat);
        sw.position.set(sx, 1.6, -0.25);
        g.add(sw);
      }
    } else {
      const ws = new THREE.Mesh(rbox(1.7, 0.7, 0.08, 0.03), glassMat);
      ws.position.set(0, 1.75, len / 2 + 0.01);
      g.add(ws);
    }
    for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const wh = new THREE.Mesh(wheelGeo, tireMat);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(wx, 0.46, wz * (len / 4.1));
      g.add(wh);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wh.position);
      g.add(hub);
    }
    if (!opts.burnt) {
      for (const sx of [-0.6, 0.6]) {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), headMat);
        hl.position.set(sx, opts.van ? 1.0 : 0.95, len / 2 - 0.05);
        hl.scale.z = 0.5;
        g.add(hl);
        const tl = new THREE.Mesh(rbox(0.4, 0.18, 0.08, 0.04), tailMat);
        tl.position.set(sx, opts.van ? 1.0 : 1.0, -len / 2);
        g.add(tl);
      }
    } else {
      // Épave : fumée violette persistante (particules gérées par le monde)
      smokeSources.push(new THREE.Vector3(x, 1.4, z));
    }
    if (opts.decal) {
      const dm = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), M({ map: signTexture(opts.decal, '#3d8fd1', '#f2efe6') }));
      dm.position.set(1.01, 1.4, 0);
      dm.rotation.y = Math.PI / 2;
      g.add(dm);
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    if (opts.tilt) g.rotation.z = opts.tilt;
    root.add(g);
    const c = Math.abs(Math.cos(rot));
    const s = Math.abs(Math.sin(rot));
    col.addCentered(x, 0, z, (2.0 * c + len * s) * 0.95, opts.van ? 2.15 : 1.6, (2.0 * s + len * c) * 0.95);
    return g;
  }

  // Barrière de chantier arrondie, rayée blanc/orange.
  function barrier(x, z, rot) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(rbox(2, 0.55, 0.75, 0.15), barrierMat);
    base.position.y = 0.27;
    const top = new THREE.Mesh(rbox(1.9, 0.55, 0.32, 0.12), barrierMat);
    top.position.y = 0.8;
    for (const k of [-0.6, 0, 0.6]) {
      const stripe = new THREE.Mesh(rbox(0.3, 0.56, 0.34, 0.08), stripeMat);
      stripe.position.set(k, 0.8, 0);
      g.add(stripe);
    }
    g.add(base, top);
    g.traverse((o) => (o.castShadow = true));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    root.add(g);
    const along = Math.abs(Math.cos(rot)) > 0.5;
    col.addCentered(x, 0, z, along ? 2 : 0.75, 1.07, along ? 0.75 : 2);
  }

  const containerMats = {};
  function container(x0, z0, x1, z1, y, color) {
    if (!containerMats[color]) containerMats[color] = M({ map: ribbedTexture(color) });
    const h = 2.6;
    const m = new THREE.Mesh(rbox(x1 - x0, h, z1 - z0, 0.18), containerMats[color]);
    m.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    col.addBox({ x: x0, y, z: z0 }, { x: x1, y: y + h, z: z1 });
  }

  function box(x, y, z, sx, sy, sz, mat, collide = true) {
    const m = new THREE.Mesh(rbox(sx, sy, sz, 0.1), mat);
    m.position.set(x, y + sy / 2, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    if (collide) col.addCentered(x, y, z, sx, sy, sz);
    return m;
  }

  // Arbre « sucette » dans un bac : tronc courbe, feuillage en boules.
  const leafMats = [M({ color: '#2fa88a' }), M({ color: '#3cc29a' }), M({ color: '#7b5cd6' })];
  const trunkMat = M({ color: '#7a4a3a' });
  function tree(x, z, purple = false) {
    const g = new THREE.Group();
    const planter = new THREE.Mesh(rbox(1.6, 0.6, 1.6, 0.15), concreteMat);
    planter.position.y = 0.3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.6, 8), trunkMat);
    trunk.position.y = 1.6;
    trunk.rotation.z = (rand() - 0.5) * 0.25;
    g.add(planter, trunk);
    const leaf = purple ? leafMats[2] : leafMats[Math.floor(rand() * 2)];
    for (const [lx, ly, lz, r] of [[0, 3.3, 0, 1.2], [0.6, 3.0, 0.3, 0.8], [-0.5, 3.1, -0.3, 0.85], [0.1, 3.9, -0.1, 0.8]]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf);
      b.position.set(lx, ly, lz);
      g.add(b);
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    g.position.set(x, 0.15, z);
    g.rotation.y = rand() * 6;
    root.add(g);
    col.addCentered(x, 0, z, 1.6, 0.75, 1.6);
  }

  // Borne d'incendie
  const hydrantMat = M({ color: '#ff4f5e' });
  function hydrant(x, z) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.7, 12), hydrantMat);
    b.position.y = 0.5;
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), hydrantMat);
    t.position.y = 0.85;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), hydrantMat);
    s.rotation.z = Math.PI / 2;
    s.position.y = 0.6;
    g.add(b, t, s);
    g.position.set(x, 0.15, z);
    root.add(g);
    col.addCentered(x, 0, z, 0.5, 1.1, 0.5);
  }

  // Lampadaire courbé à tête ronde (lumière réelle si prioritaire).
  const lampHeadMat = M({ color: '#fff', emissive: '#ffd27a', emissiveIntensity: 2.5 });
  const lampColdMat = M({ color: '#fff', emissive: '#a8e6ff', emissiveIntensity: 2.5 });
  const lampArc = new THREE.TorusGeometry(0.7, 0.07, 8, 16, Math.PI / 2);
  function lamp(x, z, rot, { cold = false, priority = 2, broken = false } = {}) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 5.4, 10), darkMetal);
    pole.position.y = 2.7;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.4, 10), darkMetal);
    foot.position.y = 0.2;
    const arc = new THREE.Mesh(lampArc, darkMetal);
    arc.position.set(0, 5.4, 0.7);
    arc.rotation.set(0, Math.PI / 2, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), broken ? darkMetal : cold ? lampColdMat : lampHeadMat);
    head.position.set(0, 5.75, 1.0);
    head.scale.y = 0.75;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), darkMetal);
    hood.position.set(0, 5.8, 1.0);
    g.add(pole, foot, arc, head, hood);
    pole.castShadow = true;
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    root.add(g);
    col.addCentered(x, 0, z, 0.35, 6, 0.35);
    if (!broken) {
      const light = new THREE.PointLight(cold ? '#a8e6ff' : '#ffc46b', 0, 22, 1.6);
      const wp = new THREE.Vector3(0, 5.4, 1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(g.position);
      light.position.copy(wp);
      root.add(light);
      lampLights.push({ light, priority, base: 26 });
      // Halo au sol : disque net (lumière « dessinée »)
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(3.6, 32),
        new THREE.MeshBasicMaterial({ color: cold ? '#7fd8ff' : '#ffc46b', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(wp.x, 0.17, wp.z);
      root.add(pool);
    }
  }

  // Lampadaires le long des avenues
  for (let i = -54; i <= 54; i += 18) {
    if (Math.abs(i) < 10) continue;
    lamp(-9.5, i, Math.PI / 2, { priority: 3, broken: rand() < 0.2 });
    lamp(9.5, i + 9, -Math.PI / 2, { priority: 3, broken: rand() < 0.2 });
    lamp(i, -9.5, 0, { priority: 3, broken: rand() < 0.2 });
    lamp(i + 9, 9.5, Math.PI, { priority: 3, broken: rand() < 0.2 });
  }
  lamp(6, 6, -Math.PI * 0.75, { priority: 1, cold: true });

  // Arbres et bornes le long des trottoirs
  for (const z of [-45, -27, 27, 45]) tree(-9, z);
  for (const z of [-36, 36, 54, -54]) tree(9, z, z === -36);
  for (const x of [-45, -27, 27, 45]) tree(x, -9, x === 27);
  for (const x of [-45, 27, 45]) tree(x, 9);
  for (const [hx, hz] of [[-9.2, 20], [9.2, -20], [20, 9.2], [-20, -9.2]]) hydrant(hx, hz);

  // Voitures abandonnées sur les avenues
  car(-3.5, 30, 0.1);
  car(3.2, 46, Math.PI + 0.05);
  car(-4, -26, -0.35, { tilt: 0.04 });
  car(3.5, -50, Math.PI, { burnt: true });
  car(28, -3.5, Math.PI / 2 + 0.2);
  car(-30, 3.6, -Math.PI / 2);
  car(-48, -3, -Math.PI / 2 + 0.6, { burnt: true });
  car(46, 4, Math.PI / 2, { van: true, color: '#d0d0c8' });
  car(0, -68, Math.PI / 2 + 0.3, { burnt: true });
  car(-68, 20, 0.2);
  car(68, -30, Math.PI);

  // ---------- Refuge (Q1) ----------
  const safe = { x: -34, z: 24 };
  for (let x = -45; x <= -23; x += 2.1) {
    if (x > -31 && x < -26) continue; // entrée sud
    barrier(x, 15.5, 0);
  }
  for (let z = 17.5; z <= 33; z += 2.1) {
    if (z > 21 && z < 27) continue; // entrée est
    barrier(-21.8, z, Math.PI / 2);
  }
  // Bâche tendue (visuelle) + poteaux
  const tarp = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 9),
    M({ color: '#3fae7a', side: THREE.DoubleSide }),
  );
  tarp.position.set(-36, 3.6, 30);
  tarp.rotation.x = -Math.PI / 2 + 0.12;
  tarp.castShadow = true;
  root.add(tarp);
  for (const [px, pz] of [[-41.8, 25.8], [-30.2, 25.8]]) box(px, 0, pz, 0.15, 3.3, 0.15, darkMetal);
  // Établi (atelier) et terminal de sauvegarde
  const bench = box(-40, 0, 32, 3.2, 1, 1.1, M({ color: '#b5763f' }));
  bench.name = 'workbench';
  box(-41, 1, 32.2, 0.5, 0.3, 0.4, darkMetal, false);
  box(-39, 1, 31.9, 0.8, 0.15, 0.5, M({ color: '#d8a21c' }), false);
  box(-31, 0, 33, 1, 1.5, 0.7, darkMetal);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.55),
    M({ color: '#000', emissive: '#4dd2ff', emissiveIntensity: 1.5 }),
  );
  screen.position.set(-31, 1.2, 32.64);
  screen.rotation.y = Math.PI;
  screen.rotation.x = 0.15;
  root.add(screen);
  // Générateur + jerricans
  box(-44, 0, 20, 1.6, 1.2, 1, M({ color: '#e2533f' }));
  box(-44.5, 0, 22, 0.4, 0.6, 0.3, stripeMat);
  // Lumières chaudes du refuge (toujours actives : point de repère)
  const s1 = new THREE.PointLight('#ffb35c', 0, 18, 1.5);
  s1.position.set(-36, 3.2, 28);
  root.add(s1);
  lampLights.push({ light: s1, priority: 0, base: 30 });
  const s2 = new THREE.PointLight('#4dd2ff', 0, 6, 2);
  s2.position.set(-31, 1.8, 32);
  root.add(s2);
  lampLights.push({ light: s2, priority: 1, base: 3 });

  // ---------- Ruelle Q2 ----------
  container(30, 28, 32.4, 38, 0, '#e8553f');
  box(20, 0, 30, 1.8, 1.3, 1.2, M({ color: '#3fae6a' })); // benne
  box(42, 0, 29, 1.2, 1.2, 1.2, M({ color: '#c98a4a' }));
  lamp(26, 27, Math.PI / 2, { priority: 1, cold: true });

  // ---------- Immeuble Corvin : parcours vertical ----------
  // Benne 1,3 > conteneur 2,6 > caisse 3,9 > conteneur empilé 5,2 >
  // échafaudage 6,5 puis 7,8 > toit 9,0 (chaque palier ≤ 1,3 m).
  box(-42.4, 0, -21.1, 2.2, 1.3, 1.8, M({ color: '#3fae6a' }));
  container(-43.6, -34, -41.2, -22, 0, '#3d8fd1');
  box(-42.4, 2.6, -25, 2.2, 1.3, 1.8, M({ color: '#c98a4a' }));
  container(-43.6, -34, -41.2, -27, 2.6, '#f2b84b');
  const scaffMat = M({ color: '#ffcf4a' });
  const plank = M({ color: '#c98a4a' });
  box(-42.4, 6.35, -35.6, 2.4, 0.15, 2.4, plank);
  box(-41.8, 7.65, -38.6, 3.6, 0.15, 2.0, plank);
  for (const [px, pz, h] of [[-43.5, -36.8, 6.5], [-41.3, -36.8, 6.5], [-43.5, -34.4, 6.5], [-41.3, -34.4, 6.5], [-43.5, -39.6, 7.8], [-40.1, -39.6, 7.8], [-43.5, -37.6, 7.8], [-40.1, -37.6, 7.8]]) {
    box(px, 0, pz, 0.08, h, 0.08, scaffMat, false);
  }
  // Garde-corps et lampe de chantier qui attire l'œil vers le parcours
  box(-43.55, 7.8, -38.6, 0.05, 1, 2.0, scaffMat, false);
  const workLamp = new THREE.PointLight('#ffd27a', 0, 12, 2);
  workLamp.position.set(-42.4, 7.2, -36);
  root.add(workLamp);
  lampLights.push({ light: workLamp, priority: 1, base: 10 });
  box(-42.4, 6.5, -36.6, 0.3, 0.3, 0.2, lampHeadMat, false);
  // Fuite de lumière + balise sur le toit
  const beaconPos = { x: -28, y: 9, z: -28 };
  const antenna = box(beaconPos.x - 4, 9, beaconPos.z + 3, 0.1, 4, 0.1, scaffMat, false);
  const beaconMat = M({ color: '#300', emissive: '#ff2030', emissiveIntensity: 4 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), beaconMat);
  beacon.position.set(antenna.position.x, 13.1, antenna.position.z);
  root.add(beacon);
  const beaconLight = new THREE.PointLight('#ff2030', 0, 10, 2);
  beaconLight.position.copy(beacon.position);
  root.add(beaconLight);
  lampLights.push({ light: beaconLight, priority: 0, base: 8, blink: true });
  updaters.push((dt, t) => {
    const on = Math.sin(t * 4) > 0.3;
    beaconMat.emissiveIntensity = on ? 5 : 0.2;
    if (beaconLight.userData.active) beaconLight.intensity = on ? 8 : 0;
  });

  // ---------- Parking Halden (Q4) ----------
  const lineMat = M({ color: '#fff4d6', polygonOffset: true, polygonOffsetFactor: -3 });
  for (let i = 0; i < 9; i++) {
    for (const zc of [-22, -44]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 5), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(14 + i * 3.2, 0.17, zc);
      root.add(l);
    }
  }
  const lotFloor = new THREE.Mesh(new THREE.PlaneGeometry(36, 48), groundMat);
  lotFloor.rotation.x = -Math.PI / 2;
  lotFloor.position.set(30, 0.155, -36);
  lotFloor.receiveShadow = true;
  root.add(lotFloor);
  car(17, -22, 0.05);
  car(23.4, -22, -0.1, { color: '#7a1f24' });
  car(33, -22, Math.PI);
  car(20, -44, Math.PI + 0.1);
  car(29.6, -44, 0.3, { burnt: true });
  car(39, -44, Math.PI);
  car(40.5, -52, 0.9, { van: true, color: '#e6e6e0', decal: 'AEGIS', tilt: 0.12 });
  lamp(14, -33, Math.PI / 2, { cold: true, priority: 0 });
  lamp(44, -30, -Math.PI / 2, { cold: true, priority: 0 });
  // Grillage sur le côté est de la ruelle du parking
  const fenceMat = M({ color: '#c9c4ff', wireframe: true });
  const fence = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 30, 1, 8, 60), fenceMat);
  fence.position.set(46.5, 1.35, -42);
  root.add(fence);
  col.addCentered(46.5, 0, -42, 0.2, 2.4, 30);

  // Fissures d'anomalie (lumière violette pulsée)
  const rifts = [];
  for (const [x, z, s, seed] of [[30, -36, 9, 3], [-6, -40, 6, 5], [12, 20, 5, 9], [-50, -24, 5, 4]]) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshBasicMaterial({ map: riftTexture(seed), color: '#b070ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = seed;
    m.position.set(x, 0.19, z);
    root.add(m);
    rifts.push(m);
  }
  const riftLight = new THREE.PointLight('#a060ff', 0, 16, 2);
  riftLight.position.set(30, 1.2, -36);
  root.add(riftLight);
  lampLights.push({ light: riftLight, priority: 0, base: 14, pulse: true });
  updaters.push((dt, t) => {
    const p = 0.7 + Math.sin(t * 2.2) * 0.3;
    for (const r of rifts) r.material.opacity = p;
    if (riftLight.userData.active) riftLight.intensity = 14 * p;
  });

  // Barrages de quarantaine aux sorties des avenues
  for (const [x, z, rot] of [[0, -74, 0], [0, 74, 0], [-74, 0, Math.PI / 2], [74, 0, Math.PI / 2]]) {
    for (let k = -3; k <= 3; k++) {
      const along = rot === 0;
      barrier(x + (along ? k * 2.1 : 0), z + (along ? 0 : k * 2.1), rot);
    }
    const along = rot === 0;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(along ? 16 : 0.2, 3.2, along ? 0.2 : 16),
      M({ map: signTexture('ROUTE BARRÉE', '#ff8a3d', '#2b2050') }),
    );
    const off = Math.sign(along ? z : x) * 2;
    wall.position.set(x + (along ? 0 : off), 1.6, z + (along ? off : 0));
    root.add(wall);
    col.addCentered(wall.position.x, 0, wall.position.z, along ? 16 : 0.6, 3.2, along ? 0.6 : 16);
  }

  // ---------- Ciel, anomalie lointaine, pluie ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uNight: { value: 1 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform float uTime; uniform float uNight;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main(){
          float h = clamp(vDir.y, -0.1, 1.0);
          // Dégradé cartoon en bandes : indigo > violet > rose à l'horizon
          float k = floor(pow(max(h, 0.0), 0.45) * 7.0) / 7.0;
          vec3 top = vec3(0.07, 0.04, 0.2);
          vec3 mid = vec3(0.22, 0.1, 0.42);
          vec3 hor = vec3(0.85, 0.36, 0.6);
          vec3 col = k < 0.3 ? mix(hor, mid, k / 0.3) : mix(mid, top, (k - 0.3) / 0.7);
          // Crépuscule (avant le Nightfall) : bleu, rose et orange chauds.
          vec3 dTop = vec3(0.24, 0.32, 0.68), dMid = vec3(0.85, 0.48, 0.66), dHor = vec3(1.0, 0.68, 0.42);
          vec3 dusk = k < 0.3 ? mix(dHor, dMid, k / 0.3) : mix(dMid, dTop, (k - 0.3) / 0.7);
          col = mix(dusk, col, uNight);
          // Lueur de l'anomalie au nord (-Z)
          float a = max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), vec3(0.0, 0.0, -1.0)), 0.0);
          col = mix(col, vec3(0.75, 0.35, 1.0), step(0.93, a) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.5 * uNight);
          // Étoiles scintillantes
          vec3 cell = floor(vDir * 160.0);
          float st = step(0.996, hash(cell)) * smoothstep(0.15, 0.4, h);
          col += vec3(1.0, 0.95, 0.85) * st * (0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 3.0) * 30.0)) * uNight;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -2;
  scene.add(sky);

  // Grosse lune cartoon avec cratères et halo
  const moonG = new THREE.Group();
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(38, 48), new THREE.MeshBasicMaterial({ color: '#f4f0ff', fog: false }));
  moonG.add(moonDisc);
  for (const [cx, cy, r] of [[-12, 8, 7], [10, -6, 9], [8, 16, 4], [-6, -16, 5]]) {
    const cr = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: '#d4cdf5', fog: false }));
    cr.position.set(cx, cy, 0.5);
    moonG.add(cr);
  }
  for (const [r, o] of [[52, 0.18], [70, 0.08]]) {
    const halo = new THREE.Mesh(new THREE.RingGeometry(38, r, 48), new THREE.MeshBasicMaterial({ color: '#c8b8ff', transparent: true, opacity: o, fog: false, depthWrite: false }));
    halo.position.z = -0.5;
    moonG.add(halo);
  }
  moonG.position.set(-260, 330, 420);
  moonG.lookAt(0, 0, 0);
  moonG.traverse((o) => { if (o.material) o.material.depthWrite = false; o.renderOrder = -1; });
  scene.add(moonG);

  // Nuages stylisés qui dérivent lentement
  const cloudMat = toon('#4b2f7e', { rim: '#ff9ccf', rimStrength: 0.7 });
  cloudMat.fog = false;
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Group();
    const n = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(18 + rand() * 14, 12, 8), cloudMat);
      b.position.set((k - n / 2) * 22 + rand() * 6, rand() * 8, rand() * 10);
      b.scale.y = 0.55;
      c.add(b);
    }
    const ang = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const r = 480 + rand() * 120;
    c.position.set(Math.cos(ang) * r, 160 + rand() * 90, Math.sin(ang) * r);
    c.lookAt(0, c.position.y, 0);
    clouds.add(c);
  }
  scene.add(clouds);

  const anomaly = new THREE.Mesh(
    new THREE.CylinderGeometry(18, 40, 900, 32, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uNight: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec2 vUv; uniform float uTime; uniform float uNight;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 p = vec2(vUv.x * 8.0, vUv.y * 6.0 - uTime * 0.25);
          float n = noise(p) * 0.6 + noise(p * 2.3 + 4.0) * 0.4;
          float fade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
          vec3 col = mix(vec3(0.35, 0.1, 0.8), vec3(0.9, 0.6, 1.0), n);
          gl_FragColor = vec4(col * n * fade * 0.9 * uNight, 1.0);
        }`,
    }),
  );
  anomaly.position.set(30, 300, -620);
  scene.add(anomaly);

  const rainCount = { low: 800, medium: 2000, high: 4000 }[quality] ?? 2000;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 6);
  const rainSeed = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainSeed[i * 3] = (rand() - 0.5) * 70;
    rainSeed[i * 3 + 1] = rand() * 30;
    rainSeed[i * 3 + 2] = (rand() - 0.5) * 70;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({ color: '#c9d8ff', transparent: true, opacity: 0.45, depthWrite: false }),
  );
  rain.frustumCulled = false;
  scene.add(rain);

  updaters.push((dt, t, cam) => {
    sky.position.copy(cam.position);
    moonG.position.set(cam.position.x - 260, 330, cam.position.z + 420);
    clouds.position.set(cam.position.x, 0, cam.position.z);
    clouds.rotation.y = t * 0.004;
    sky.material.uniforms.uTime.value = t;
    anomaly.material.uniforms.uTime.value = t;
    const fall = 28;
    for (let i = 0; i < rainCount; i++) {
      const bx = rainSeed[i * 3];
      const bz = rainSeed[i * 3 + 2];
      // Position cyclique autour de la caméra (pas d'allocation).
      const x = cam.position.x + (((bx - cam.position.x) % 70) + 105) % 70 - 35;
      const z = cam.position.z + (((bz - cam.position.z) % 70) + 105) % 70 - 35;
      const y = ((rainSeed[i * 3 + 1] - t * fall) % 30 + 30) % 30 + cam.position.y - 12;
      const j = i * 6;
      rainPos[j] = x;
      rainPos[j + 1] = y;
      rainPos[j + 2] = z;
      rainPos[j + 3] = x + 0.04;
      rainPos[j + 4] = y + 0.55;
      rainPos[j + 5] = z + 0.02;
    }
    rainGeo.attributes.position.needsUpdate = true;
  });

  // Sélection des lumières réelles : priorité puis proximité du joueur.
  lampLights.sort((a, b) => a.priority - b.priority);
  const activeSet = new Set();
  let reselect = 0;
  updaters.push((dt, t, cam, player) => {
    reselect -= dt;
    if (reselect > 0) return;
    reselect = 0.5;
    const p = player || cam.position;
    const scored = lampLights
      .map((l) => ({ l, s: l.priority * 20 + l.light.position.distanceTo(p) }))
      .sort((a, b) => a.s - b.s);
    activeSet.clear();
    scored.slice(0, maxLights).forEach(({ l }) => activeSet.add(l));
    for (const l of lampLights) {
      const on = activeSet.has(l);
      l.light.userData.active = on;
      l.light.visible = on;
      if (!l.blink && !l.pulse) l.light.intensity = on && !l.light.userData.off ? l.base : 0;
    }
  });

  // ---------- Ambiance : 0 = crépuscule (prologue), 1 = nuit du Nightfall ----------
  let night = 1;
  const facadeEmissive = Object.values(facadeMats);
  function setNight(k) {
    night = k;
    sky.material.uniforms.uNight.value = k;
    anomaly.material.uniforms.uNight.value = k;
    anomaly.scale.y = Math.max(0.001, k);
    anomaly.position.y = 300 * k - 150 * (1 - k);
    moonG.visible = k > 0.05;
    moonG.traverse((o) => {
      if (!o.material) return;
      o.material.transparent = true;
      if (o.material.userData.base == null) o.material.userData.base = o.material.opacity;
      o.material.opacity = o.material.userData.base * k;
    });
    cloudMat.color.set('#ffb8d0').lerp(new THREE.Color('#4b2f7e'), k);
    rain.visible = k > 0.5;
    for (const r of rifts) r.visible = k > 0.5;
    for (const m of facadeEmissive) m.emissiveIntensity = 0.5 + k * 0.6;
  }
  // Coupure de courant : fenêtres et lampadaires s'éteignent quelques instants.
  function setPower(on) {
    for (const m of facadeEmissive) m.emissiveIntensity = on ? 0.5 + night * 0.6 : 0.02;
    lampHeadMat.emissiveIntensity = on ? 2.5 : 0;
    lampColdMat.emissiveIntensity = on ? 2.5 : 0;
    for (const l of lampLights) l.light.userData.off = !on;
  }

  // ---------- Points d'intérêt ----------
  const targets = {
    safehouse: { x: safe.x, y: 0.15, z: safe.z },
    rally: { x: 0, y: 0, z: 0 },
    rooftop_beacon: beaconPos,
    school: { x: 26, y: 0.15, z: 36 },
    parking_entry: { x: 22, y: 0.15, z: -14 },
    aegis_case: { x: 38.6, y: 0.15, z: -49.6 },
    lumen_roof: { x: 51.5, y: 26, z: 45.5 },
    terminal: { x: -31, y: 0.15, z: 32.2 },
    workbench: { x: -40, y: 0.15, z: 31.2 },
  };

  const enemySpawns = [
    // Groupe du parking (mission principale)
    { after: 'p03_rings', type: 'stalker', x: 22, z: -30, group: 'parking', patrol: [[22, -30], [36, -30], [36, -38]] },
    { after: 'p03_rings', type: 'stalker', x: 36, z: -26, group: 'parking', patrol: [[36, -26], [18, -38]] },
    { after: 'p03_rings', type: 'stalker', x: 26, z: -50, group: 'parking', patrol: [[26, -50], [16, -50], [16, -40]] },
    { after: 'p03_rings', type: 'brute', x: 31, z: -39, group: 'parking', patrol: [[31, -39], [24, -34]] },
    // Rôdeurs du quartier
    { after: 'p02_nightfall', type: 'stalker', x: 24, z: 33, group: 'alley', patrol: [[24, 33], [40, 34], [40, 28]] },
    { after: 'p02_nightfall', type: 'stalker', x: 38, z: 36, group: 'alley', patrol: [[38, 36], [20, 36]] },
    { after: 'p02_nightfall', type: 'stalker', x: -3, z: -42, group: 'avenue', patrol: [[-3, -42], [3, -58], [-4, -30]] },
    { after: 'p02_nightfall', type: 'stalker', x: -48, z: -32, group: 'corvin', patrol: [[-48, -32], [-48, -18], [-52, -40]] },
    { after: 'p02_nightfall', type: 'brute', x: 4, z: -66, group: 'north', patrol: [[4, -66], [-30, -68], [30, -68]] },
  ];

  const crates = [
    { id: 'crate_tactical_1', type: 'tactical', x: 37.5, y: 0.15, z: -54, rot: 0.4, lockedUntil: { mission: 'm01_first_contact', step: 1 } },
    { id: 'crate_elite_roof', type: 'elite', x: -22, y: 9, z: -22, rot: -0.7 },
    { id: 'crate_supply_alley', type: 'supply', x: 41, y: 0.15, z: 33, rot: 0.2 },
    { id: 'crate_supply_safehouse', type: 'supply', x: -26, y: 0.15, z: 30, rot: 1.2 },
    { id: 'crate_supply_corvin', type: 'supply', x: -55, y: 0.15, z: -20, rot: 0.6 },
    { id: 'crate_supply_van', type: 'supply', x: 46, y: 1.9, z: 4, rot: Math.PI / 2 },
  ];

  const spawn = { x: -30, y: 0.15, z: 22, yaw: Math.PI * 0.8 };
  const schoolSpawn = { x: 25, y: 0.15, z: 37.5, yaw: Math.PI };
  const drawCalls = mergeStatic(root);

  return {
    root, targets, enemySpawns, crates, spawn, schoolSpawn, drawCalls, smokeSources, setNight, setPower,
    update(dt, t, cam, player) {
      for (const u of updaters) u(dt, t, cam, player);
    },
  };
}

// Fusionne les maillages statiques qui partagent un matériau (optimisation :
// quelques dizaines d'appels de dessin au lieu de près d'un millier).
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.userData.dynamic) return;
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
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    root.add(m);
    calls++;
  }
  return calls;
}
