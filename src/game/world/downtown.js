// Région 1 — VESPER DOWNTOWN (vertical slice).
// Construit la géométrie, les collisions, les lumières, la pluie et renvoie les
// points d'intérêt (cibles de mission, apparitions d'ennemis, caisses).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng.js';
import {
  facadeTextures, asphaltTextures, sidewalkTexture, ribbedTexture, riftTexture, signTexture, roadMarkTexture,
} from './textures.js';

const BAY = 4; // largeur d'une travée de fenêtre (m)
const FLOOR = 3.5; // hauteur d'étage (m)

export function buildDowntown(scene, col, quality) {
  const rand = mulberry32(2026);
  const root = new THREE.Group();
  root.name = 'downtown';
  scene.add(root);
  const updaters = [];
  const lampLights = [];
  const maxLights = { low: 3, medium: 8, high: 14 }[quality] ?? 8;

  // ---------- Matériaux partagés ----------
  const asphalt = asphaltTextures();
  asphalt.map.repeat.set(40, 40);
  asphalt.roughness.repeat.set(40, 40);
  const groundMat = new THREE.MeshStandardMaterial({
    map: asphalt.map, roughnessMap: asphalt.roughness, roughness: 0.9, metalness: 0.05, envMapIntensity: 0.6,
  });
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.85 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: '#4a4c52', roughness: 0.95 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#23262c', roughness: 0.6, metalness: 0.7 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#2c2d31', roughness: 1 });
  const barrierMat = new THREE.MeshStandardMaterial({ color: '#8a8a86', roughness: 0.9 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#d8a21c', roughness: 0.6 });

  // ---------- Sol & routes ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // Marquages : lignes discontinues au centre des routes.
  const marks = roadMarkTexture();
  const markMat = new THREE.MeshStandardMaterial({
    map: marks, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
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
  const zebraMat = new THREE.MeshStandardMaterial({ color: '#d9d4c4', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
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
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
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
      facadeMats[k] = new THREE.MeshStandardMaterial({
        map: f.map,
        emissiveMap: f.emissive,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 1.4,
        roughness: style === 'glass' ? 0.25 : 0.9,
        metalness: style === 'glass' ? 0.6 : 0.05,
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
    const fm = facadeMat(style, opts.seed ?? Math.floor(rand() * 3));
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
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 3.2, d + 0.2), new THREE.MeshStandardMaterial({ color: '#16171b', roughness: 0.6, metalness: 0.3 }));
    band.position.set((x0 + x1) / 2, 1.6, (z0 + z1) / 2);
    root.add(band);
    if (opts.sign) {
      const [text, color, face] = opts.sign;
      const sm = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.7, 10), 2.2),
        new THREE.MeshStandardMaterial({ map: signTexture(text, color), emissiveMap: signTexture(text, color), emissive: '#ffffff', emissiveIntensity: 1.6 }),
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
  building(12, 40, 40, 59, 18, 'concrete');
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
    new THREE.MeshStandardMaterial({ color: '#3d3e44', roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }),
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
  const obMat = new THREE.MeshStandardMaterial({ color: '#7d7f86', roughness: 0.7, metalness: 0.2 });
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
  const carColors = ['#5a6270', '#7a1f24', '#2a3f5a', '#c8c8c0', '#1c1d20', '#3d5040', '#8a6a2a'];
  const glassMat = new THREE.MeshStandardMaterial({ color: '#0d1218', roughness: 0.1, metalness: 0.9 });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4d6', emissiveIntensity: 2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#600', emissive: '#ff2020', emissiveIntensity: 1.5 });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16);
  const burntMat = new THREE.MeshStandardMaterial({ color: '#151414', roughness: 1 });

  function car(x, z, rot, opts = {}) {
    const g = new THREE.Group();
    const paint = opts.burnt
      ? burntMat
      : new THREE.MeshStandardMaterial({ color: opts.color || carColors[Math.floor(rand() * carColors.length)], roughness: 0.35, metalness: 0.6 });
    const len = opts.van ? 5.4 : 4.4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, opts.van ? 1.5 : 0.75, len), paint);
    body.position.y = opts.van ? 1.15 : 0.7;
    body.castShadow = true;
    g.add(body);
    if (!opts.van) {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
      cabin.position.set(0, 1.35, -0.2);
      cabin.castShadow = true;
      g.add(cabin);
      const roofM = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 1.9), paint);
      roofM.position.set(0, 1.68, -0.25);
      g.add(roofM);
    } else {
      const ws = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.1), glassMat);
      ws.position.set(0, 1.5, len / 2 + 0.01);
      g.add(ws);
    }
    for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      const wh = new THREE.Mesh(wheelGeo, tireMat);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(wx, 0.36, wz * (len / 4.4));
      g.add(wh);
    }
    if (!opts.burnt) {
      for (const s of [-0.65, 0.65]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.05), opts.lightsOn ? headMat : glassMat);
        hl.position.set(s, opts.van ? 0.9 : 0.8, len / 2);
        g.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), tailMat);
        tl.position.set(s, opts.van ? 0.9 : 0.85, -len / 2);
        g.add(tl);
      }
    }
    if (opts.decal) {
      const dm = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 0.75),
        new THREE.MeshStandardMaterial({ map: signTexture(opts.decal, '#3f9bff', '#e8e8e8'), roughness: 0.5 }),
      );
      dm.position.set(0.96, 1.3, 0);
      dm.rotation.y = Math.PI / 2;
      g.add(dm);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    if (opts.tilt) g.rotation.z = opts.tilt;
    root.add(g);
    // Collision : boîte englobante orientée approximée par une AABB.
    const c = Math.abs(Math.cos(rot));
    const s = Math.abs(Math.sin(rot));
    const ex = 1.9 * c + len * s;
    const ez = 1.9 * s + len * c;
    col.addCentered(x, 0, z, ex * 0.95, opts.van ? 1.9 : 1.5, ez * 0.95);
    return g;
  }

  function barrier(x, z, rot) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.7), barrierMat);
    base.position.y = 0.25;
    const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.55, 0.28), barrierMat);
    top.position.y = 0.77;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.01, 0.12, 0.29), stripeMat);
    stripe.position.y = 0.85;
    g.add(base, top, stripe);
    g.traverse((o) => (o.castShadow = true));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    root.add(g);
    const along = Math.abs(Math.cos(rot)) > 0.5;
    col.addCentered(x, 0, z, along ? 2 : 0.7, 1.05, along ? 0.7 : 2);
  }

  const containerMats = {};
  function container(x0, z0, x1, z1, y, color) {
    if (!containerMats[color]) {
      containerMats[color] = new THREE.MeshStandardMaterial({ map: ribbedTexture(color), roughness: 0.7, metalness: 0.4 });
    }
    const h = 2.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), containerMats[color]);
    m.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    col.addBox({ x: x0, y, z: z0 }, { x: x1, y: y + h, z: z1 });
  }

  function box(x, y, z, sx, sy, sz, mat, collide = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y + sy / 2, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    if (collide) col.addCentered(x, y, z, sx, sy, sz);
    return m;
  }

  // Lampadaire (lumière réelle seulement si prioritaire / qualité suffisante).
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd7a0', emissiveIntensity: 3 });
  const lampColdMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#cfe3ff', emissiveIntensity: 3 });
  function lamp(x, z, rot, { cold = false, priority = 2, broken = false } = {}) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), darkMetal);
    pole.position.y = 3;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), darkMetal);
    arm.position.set(0, 5.95, 0.75);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.7), broken ? darkMetal : cold ? lampColdMat : lampHeadMat);
    head.position.set(0, 5.88, 1.4);
    g.add(pole, arm, head);
    pole.castShadow = true;
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    root.add(g);
    col.addCentered(x, 0, z, 0.3, 6, 0.3);
    if (!broken) {
      const light = new THREE.PointLight(cold ? '#cfe3ff' : '#ffcf8f', 0, 22, 1.6);
      const wp = new THREE.Vector3(0, 5.6, 1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(g.position);
      light.position.copy(wp);
      root.add(light);
      lampLights.push({ light, priority, base: 26 });
      // Halo au sol (faux éclairage, gratuit) pour les lampes sans lumière réelle.
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(4.5, 24),
        new THREE.MeshBasicMaterial({ color: cold ? '#9fc4ff' : '#ffb870', transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(wp.x, 0.03, wp.z);
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
    new THREE.MeshStandardMaterial({ color: '#2d4a3e', roughness: 0.9, side: THREE.DoubleSide }),
  );
  tarp.position.set(-36, 3.6, 30);
  tarp.rotation.x = -Math.PI / 2 + 0.12;
  tarp.castShadow = true;
  root.add(tarp);
  for (const [px, pz] of [[-41.8, 25.8], [-30.2, 25.8]]) box(px, 0, pz, 0.15, 3.3, 0.15, darkMetal);
  // Établi (atelier) et terminal de sauvegarde
  const bench = box(-40, 0, 32, 3.2, 1, 1.1, new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 0.8 }));
  bench.name = 'workbench';
  box(-41, 1, 32.2, 0.5, 0.3, 0.4, darkMetal, false);
  box(-39, 1, 31.9, 0.8, 0.15, 0.5, new THREE.MeshStandardMaterial({ color: '#d8a21c' }), false);
  box(-31, 0, 33, 1, 1.5, 0.7, darkMetal);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.55),
    new THREE.MeshStandardMaterial({ color: '#000', emissive: '#4dd2ff', emissiveIntensity: 1.5 }),
  );
  screen.position.set(-31, 1.2, 32.64);
  screen.rotation.y = Math.PI;
  screen.rotation.x = 0.15;
  root.add(screen);
  // Générateur + jerricans
  box(-44, 0, 20, 1.6, 1.2, 1, new THREE.MeshStandardMaterial({ color: '#7a2a20', roughness: 0.6, metalness: 0.4 }));
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
  container(30, 28, 32.4, 38, 0, '#7a2f22');
  box(20, 0, 30, 1.8, 1.3, 1.2, new THREE.MeshStandardMaterial({ color: '#2f4a2f', roughness: 0.8 })); // benne
  box(42, 0, 29, 1.2, 1.2, 1.2, new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 0.9 }));
  lamp(26, 27, Math.PI / 2, { priority: 1, cold: true });

  // ---------- Immeuble Corvin : parcours vertical ----------
  // Benne 1,3 > conteneur 2,6 > caisse 3,9 > conteneur empilé 5,2 >
  // échafaudage 6,5 puis 7,8 > toit 9,0 (chaque palier ≤ 1,3 m).
  box(-42.4, 0, -21.1, 2.2, 1.3, 1.8, new THREE.MeshStandardMaterial({ color: '#2f4a2f', roughness: 0.8 }));
  container(-43.6, -34, -41.2, -22, 0, '#1f4a6a');
  box(-42.4, 2.6, -25, 2.2, 1.3, 1.8, new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 0.9 }));
  container(-43.6, -34, -41.2, -27, 2.6, '#6a5a1f');
  const scaffMat = new THREE.MeshStandardMaterial({ color: '#8a8f99', roughness: 0.5, metalness: 0.8 });
  const plank = new THREE.MeshStandardMaterial({ color: '#6b5236', roughness: 0.9 });
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
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff2030', emissiveIntensity: 4 });
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
  const lineMat = new THREE.MeshStandardMaterial({ color: '#cfc8b0', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 });
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
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#9aa0a8', metalness: 0.8, roughness: 0.4, wireframe: true });
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
      new THREE.MeshStandardMaterial({ map: signTexture('QUARANTAINE', '#ff3b3b', '#1a1a1a'), roughness: 0.9 }),
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
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform float uTime;
        void main(){
          float h = clamp(vDir.y, -0.1, 1.0);
          vec3 top = vec3(0.012, 0.018, 0.045);
          vec3 hor = vec3(0.07, 0.06, 0.14);
          vec3 col = mix(hor, top, pow(max(h,0.0), 0.5));
          // Lueur violette en direction de l'anomalie (nord, -Z)
          float a = max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), vec3(0.0,0.0,-1.0)), 0.0);
          col += vec3(0.35, 0.12, 0.6) * pow(a, 6.0) * (1.0 - smoothstep(0.0, 0.6, h)) * 0.6;
          // Pollution lumineuse ambrée de la ville
          col += vec3(0.25, 0.14, 0.05) * (1.0 - smoothstep(0.0, 0.25, h)) * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  scene.add(sky);

  const anomaly = new THREE.Mesh(
    new THREE.CylinderGeometry(18, 40, 900, 32, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec2 vUv; uniform float uTime;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 p = vec2(vUv.x * 8.0, vUv.y * 6.0 - uTime * 0.25);
          float n = noise(p) * 0.6 + noise(p * 2.3 + 4.0) * 0.4;
          float fade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
          vec3 col = mix(vec3(0.35, 0.1, 0.8), vec3(0.9, 0.6, 1.0), n);
          gl_FragColor = vec4(col * n * fade * 0.9, 1.0);
        }`,
    }),
  );
  anomaly.position.set(30, 300, -620);
  scene.add(anomaly);

  const rainCount = { low: 1500, medium: 4000, high: 8000 }[quality] ?? 4000;
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
    new THREE.LineBasicMaterial({ color: '#9fb4d8', transparent: true, opacity: 0.35, depthWrite: false }),
  );
  rain.frustumCulled = false;
  scene.add(rain);

  updaters.push((dt, t, cam) => {
    sky.position.copy(cam.position);
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
      if (!l.blink && !l.pulse) l.light.intensity = on ? l.base : 0;
    }
  });

  // ---------- Points d'intérêt ----------
  const targets = {
    safehouse: { x: safe.x, y: 0.15, z: safe.z },
    rally: { x: 0, y: 0, z: 0 },
    rooftop_beacon: beaconPos,
    terminal: { x: -31, y: 0.15, z: 32.2 },
    workbench: { x: -40, y: 0.15, z: 31.2 },
  };

  const enemySpawns = [
    // Groupe du parking (mission principale)
    { type: 'stalker', x: 22, z: -30, group: 'parking', patrol: [[22, -30], [36, -30], [36, -38]] },
    { type: 'stalker', x: 36, z: -26, group: 'parking', patrol: [[36, -26], [18, -38]] },
    { type: 'stalker', x: 26, z: -50, group: 'parking', patrol: [[26, -50], [16, -50], [16, -40]] },
    { type: 'brute', x: 31, z: -39, group: 'parking', patrol: [[31, -39], [24, -34]] },
    // Rôdeurs du quartier
    { type: 'stalker', x: 24, z: 33, group: 'alley', patrol: [[24, 33], [40, 34], [40, 28]] },
    { type: 'stalker', x: 38, z: 36, group: 'alley', patrol: [[38, 36], [20, 36]] },
    { type: 'stalker', x: -3, z: -42, group: 'avenue', patrol: [[-3, -42], [3, -58], [-4, -30]] },
    { type: 'stalker', x: -48, z: -32, group: 'corvin', patrol: [[-48, -32], [-48, -18], [-52, -40]] },
    { type: 'brute', x: 4, z: -66, group: 'north', patrol: [[4, -66], [-30, -68], [30, -68]] },
  ];

  const crates = [
    { id: 'crate_tactical_1', type: 'tactical', x: 37.5, y: 0.15, z: -54, rot: 0.4, lockedUntil: { mission: 'm01_first_contact', step: 2 } },
    { id: 'crate_elite_roof', type: 'elite', x: -22, y: 9, z: -22, rot: -0.7 },
    { id: 'crate_supply_alley', type: 'supply', x: 41, y: 0.15, z: 33, rot: 0.2 },
    { id: 'crate_supply_safehouse', type: 'supply', x: -26, y: 0.15, z: 30, rot: 1.2 },
    { id: 'crate_supply_corvin', type: 'supply', x: -55, y: 0.15, z: -20, rot: 0.6 },
    { id: 'crate_supply_van', type: 'supply', x: 46, y: 1.9, z: 4, rot: Math.PI / 2 },
  ];

  const spawn = { x: -30, y: 0.15, z: 22, yaw: Math.PI * 0.8 };
  const drawCalls = mergeStatic(root);

  return {
    root, targets, enemySpawns, crates, spawn, drawCalls,
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
    if (!g.index || !g.attributes.uv || !g.attributes.normal) return;
    const key = `${o.material.uuid}:${o.castShadow ? 1 : 0}:${o.receiveShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
    const geo = g.clone();
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
