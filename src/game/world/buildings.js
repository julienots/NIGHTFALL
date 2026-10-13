// Générateur de bâtiments détaillés « de haut en bas ».
// Les éléments répétés (fenêtres, rebords, balcons, climatiseurs, escaliers de
// secours, corniches…) sont instanciés : des milliers d'éléments pour une
// poignée d'appels de dessin.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../fx/toon.js';
import { wallTexture, roofTexture, signTexture, awningTexture } from './textures.js';

const FLOOR = 3.4; // hauteur d'étage (m)
const GROUND = 4.4; // rez-de-chaussée plus haut (commerces)
const BLOCK_EDGES = [-62, -8, 8, 62];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const Y = new THREE.Vector3(0, 1, 0);

// Lot d'instances : une géométrie + un matériau, N transformations (+ couleur).
class Batch {
  constructor(geo, mat, { shadow = false, colored = false } = {}) {
    this.geo = geo;
    this.mat = mat;
    this.shadow = shadow;
    this.colored = colored;
    this.items = [];
  }

  add(x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, color = null, pitch = 0) {
    this.items.push([x, y, z, yaw, sx, sy, sz, color, pitch]);
  }

  build(parent) {
    if (!this.items.length) return null;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    this.items.forEach(([x, y, z, yaw, sx, sy, sz, color, pitch], i) => {
      _q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
      mesh.setMatrixAt(i, _m);
      if (this.colored) mesh.setColorAt(i, _c.set(color || '#ffffff'));
    });
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = true;
    mesh.userData.dynamic = true; // ne pas re-fusionner
    mesh.computeBoundingSphere();
    parent.add(mesh);
    return mesh;
  }
}

// Géométries de base (unitaires, origine au centre de la face arrière).
function frameGeo(w, h, t, depth) {
  const parts = [
    new THREE.BoxGeometry(w, t, depth).translate(0, h / 2 - t / 2, 0),
    new THREE.BoxGeometry(w, t, depth).translate(0, -h / 2 + t / 2, 0),
    new THREE.BoxGeometry(t, h, depth).translate(-w / 2 + t / 2, 0, 0),
    new THREE.BoxGeometry(t, h, depth).translate(w / 2 - t / 2, 0, 0),
    new THREE.BoxGeometry(t * 0.6, h, depth * 0.8).translate(0, 0, 0), // meneau central
  ];
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

function railingGeo(len, h) {
  const parts = [new THREE.BoxGeometry(len, 0.06, 0.06).translate(0, h, 0)];
  const n = Math.max(2, Math.round(len / 0.25));
  for (let i = 0; i <= n; i++) parts.push(new THREE.BoxGeometry(0.03, h, 0.03).translate(-len / 2 + (i / n) * len, h / 2, 0));
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

function waterTowerGeo() {
  const parts = [
    new THREE.CylinderGeometry(1.4, 1.4, 2.6, 16).translate(0, 3.6, 0),
    new THREE.ConeGeometry(1.6, 1.2, 16).translate(0, 5.5, 0),
    new THREE.CylinderGeometry(1.45, 1.45, 0.12, 16).translate(0, 2.9, 0),
    new THREE.CylinderGeometry(1.45, 1.45, 0.12, 16).translate(0, 4.3, 0),
  ];
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) parts.push(new THREE.CylinderGeometry(0.08, 0.1, 2.3, 6).translate(x, 1.15, z));
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

function acGeo() {
  const parts = [new THREE.BoxGeometry(0.8, 0.5, 0.45), new THREE.CylinderGeometry(0.17, 0.17, 0.03, 12).rotateX(Math.PI / 2).translate(0.15, 0, 0.23)];
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

function fireEscapeGeo(len) {
  const parts = [new THREE.BoxGeometry(len, 0.08, 1.2).translate(0, 0, 0.6)];
  parts.push(railingGeo(len, 0.95).translate(0, 0, 1.2));
  parts.push(railingGeo(1.2, 0.95).rotateY(Math.PI / 2).translate(-len / 2, 0, 0.6));
  parts.push(railingGeo(1.2, 0.95).rotateY(Math.PI / 2).translate(len / 2, 0, 0.6));
  // Échelle inclinée vers le palier inférieur
  const ladder = new THREE.BoxGeometry(0.5, 0.05, FLOOR * 1.25).rotateX(-1.0).translate(len / 4, -FLOOR / 2, 0.6);
  parts.push(ladder);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

const SHOPS = [
  ['CAFÉ LUNE', '#ff9a3d', '#e86f6f'], ['PHARMACIE', '#6fcf97', '#2fa88a'], ['PIZZA NOVA', '#ff5d5d', '#ffd54f'],
  ['LAVERIE', '#7fe3ff', '#4f74c9'], ['BOULANGERIE', '#ffcd20', '#c98a4a'], ['LIBRAIRIE', '#c9a6ff', '#7b4ad6'],
  ['TABAC PRESSE', '#ff8a65', '#3a5ba8'], ['RAMEN 88', '#ff4f5e', '#2b2050'], ['FLEURS', '#f06292', '#66bb6a'],
  ['ARCADE NEON', '#b06cff', '#2b2050'], ['MODE & CO', '#ff6fa8', '#3a2a5a'], ['SUPÉRETTE', '#2fa88a', '#1d6a5a'],
];

const PALETTES = {
  brick: ['#c0563f', '#a8483a', '#d27a4a', '#b5653f', '#9a4a42'],
  stucco: ['#f2c6a0', '#9fd8e8', '#f2e2a0', '#c9b8ff', '#a8e0c0', '#f5b8c8', '#ffd8a8'],
  office: ['#c9c4d8', '#b8c0d0', '#d8d0c0', '#a8b0c8'],
  glass: ['#3d6fd1', '#2fa8a8', '#5b4ad6', '#2b7fae'],
  artdeco: ['#e8d8b8', '#d8c8a8', '#c8d0d8', '#f0e0c8'],
};

export function createBuildingKit(root, col, rand, quality) {
  const shopDoors = []; // portes de vitrines et halls praticables
  const low = quality === 'low';
  const M = {
    frameWhite: toon('#f4f0e8', { shared: false }),
    frameDark: toon('#2b2050', { shared: false }),
    glass: toon('#3a4f9a', { rim: '#9fd8ff', rimStrength: 0.5, shared: false }),
    lit: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    curtain: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    stone: toon('#e8e0d0', { shared: false }),
    metal: toon('#3a3448', { shared: false }),
    ac: toon('#d8dce8', { shared: false }),
    roof: toon('#ffffff', { map: roofTexture(), shared: false }),
    tank: toon('#8a5a3a', { shared: false }),
    awning: toon('#ffffff', { map: awningTexture(), shared: false }),
    shopGlass: new THREE.MeshBasicMaterial({ color: '#ffe8b0' }),
    door: toon('#5a3a2a', { shared: false }),
    solar: toon('#2a3a8a', { rim: '#9fd8ff', shared: false }),
    fin: toon('#e8ecff', { shared: false }),
    crownLight: new THREE.MeshBasicMaterial({ color: '#ffe27a' }),
  };
  M.lit.vertexColors = false;
  const B = {
    winFrame: new Batch(frameGeo(1.3, 1.75, 0.1, 0.16), toon('#ffffff', { shared: false }), { colored: true }),
    winGlass: new Batch(new THREE.PlaneGeometry(1.14, 1.6), M.glass),
    winLit: new Batch(new THREE.PlaneGeometry(1.14, 1.6), M.lit, { colored: true }),
    curtain: new Batch(new THREE.PlaneGeometry(0.42, 1.55), M.curtain, { colored: true }),
    sill: new Batch(new THREE.BoxGeometry(1.5, 0.1, 0.28), M.stone),
    lintel: new Batch(new THREE.BoxGeometry(1.55, 0.22, 0.16), M.stone),
    ribbon: new Batch(new THREE.PlaneGeometry(1, 1.4), M.glass),
    ribbonLit: new Batch(new THREE.PlaneGeometry(1, 1.4), M.lit, { colored: true }),
    balcony: new Batch(mergeGeometries([new THREE.BoxGeometry(2.2, 0.14, 1.1).translate(0, 0, 0.55).toNonIndexed(), railingGeo(2.2, 0.9).translate(0, 0.07, 1.1), railingGeo(1.1, 0.9).rotateY(Math.PI / 2).translate(-1.1, 0.07, 0.55), railingGeo(1.1, 0.9).rotateY(Math.PI / 2).translate(1.1, 0.07, 0.55)]), toon('#ffffff', { shared: false }), { colored: true, shadow: !low }),
    ac: new Batch(acGeo(), M.ac, { shadow: !low }),
    fire: new Batch(fireEscapeGeo(3.6), M.metal, { shadow: !low }),
    tank: new Batch(waterTowerGeo(), M.tank, { shadow: true }),
    roofAc: new Batch(new THREE.BoxGeometry(1.6, 1.1, 1.2), M.ac, { shadow: true }),
    vent: new Batch(new THREE.CylinderGeometry(0.25, 0.25, 0.9, 10), M.metal),
    solar: new Batch(new THREE.BoxGeometry(1.8, 0.06, 1.1), M.solar),
    antenna: new Batch(new THREE.CylinderGeometry(0.04, 0.06, 5, 6), M.metal),
    dentil: new Batch(new THREE.BoxGeometry(0.25, 0.25, 0.3), M.stone),
    fin: new Batch(new THREE.BoxGeometry(0.14, 1, 0.35), M.fin),
    awning: new Batch(new THREE.BoxGeometry(1, 0.08, 1.3), M.awning, { colored: true, shadow: !low }),
    shopGlass: new Batch(new THREE.PlaneGeometry(1, 1), M.shopGlass, { colored: true }),
    door: new Batch(new THREE.BoxGeometry(1.2, 2.3, 0.1), M.door, { colored: true }),
    crown: new Batch(new THREE.BoxGeometry(1, 0.3, 0.3), M.crownLight),
  };

  const wallMats = {};
  const wallMat = (kind, color) => {
    const k = kind + color;
    if (!wallMats[k]) wallMats[k] = toon('#ffffff', { map: wallTexture(kind, color), shared: false, ...(kind === 'glass' ? { emissiveMap: wallTexture('glassLit', color), emissive: '#ffffff', emissiveIntensity: 0.9 } : {}) });
    return wallMats[k];
  };
  const glassEmissive = [];

  // Boîte texturée en coordonnées monde (UV : 1 répétition = 4 m).
  function block(x0, y0, z0, x1, y1, z1, mat, { cast = true, collide = true, tile = 4 } = {}) {
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * (sizes[f][0] / tile), uv.getY(i) * (sizes[f][1] / tile));
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
    if (collide) col.addBox({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 }, 'building');
    return m;
  }

  // Les 4 façades : origine, tangente, normale, longueur.
  function faces(x0, z0, x1, z1) {
    return {
      n: { o: [x0, z0], t: [1, 0], n: [0, -1], len: x1 - x0, yaw: Math.PI, edge: z0 },
      s: { o: [x1, z1], t: [-1, 0], n: [0, 1], len: x1 - x0, yaw: 0, edge: z1 },
      w: { o: [x0, z1], t: [0, -1], n: [-1, 0], len: z1 - z0, yaw: -Math.PI / 2, edge: x0 },
      e: { o: [x1, z0], t: [0, 1], n: [1, 0], len: z1 - z0, yaw: Math.PI / 2, edge: x1 },
    };
  }
  const onStreet = (f) => BLOCK_EDGES.some((e) => Math.abs(Math.abs(f.edge) - Math.abs(e)) < 4.5) || Math.abs(f.edge) > 70;

  // Point sur une façade : u le long, y hauteur, out vers l'extérieur.
  const at = (f, u, y, out) => [f.o[0] + f.t[0] * u + f.n[0] * out, y, f.o[1] + f.t[1] * u + f.n[1] * out];

  const litColor = () => ['#ffe27a', '#ffd166', '#ffe9c4', '#9ff3ff', '#ffb3e6', '#ffd9a0'][Math.floor(rand() * 6)];
  const curtainColor = () => ['#e86f6f', '#6fcf97', '#8f7ad8', '#f2b84b', '#5fb7c9', '#ffffff'][Math.floor(rand() * 6)];

  function windowsOn(f, yStart, floors, frameColor, { balconies = false, ac = true, ribbon = false, lintels = true, bay = 3.2 }) {
    const n = Math.max(1, Math.floor((f.len - 1) / bay));
    const margin = (f.len - n * bay) / 2;
    for (let fl = 0; fl < floors; fl++) {
      const y = yStart + fl * FLOOR + FLOOR * 0.52;
      if (ribbon) {
        // Bandeau vitré continu (bureaux)
        const [x, , z] = at(f, f.len / 2, y, 0.03);
        const lit = rand() < 0.4;
        (lit ? B.ribbonLit : B.ribbon).add(x, y, z, f.yaw, f.len - 1.2, 1, 1, lit ? litColor() : null);
        continue;
      }
      for (let b = 0; b < n; b++) {
        const u = margin + bay * (b + 0.5);
        const [x, , z] = at(f, u, y, 0.02);
        B.winFrame.add(x, y, z, f.yaw, 1, 1, 1, frameColor);
        const lit = rand() < 0.3;
        const [gx, , gz] = at(f, u, y, 0.03);
        if (lit) {
          B.winLit.add(gx, y, gz, f.yaw, 1, 1, 1, litColor());
          if (rand() < 0.6) {
            const cc = curtainColor();
            const [c1x, , c1z] = at(f, u - 0.36, y, 0.045);
            const [c2x, , c2z] = at(f, u + 0.36, y, 0.045);
            B.curtain.add(c1x, y, c1z, f.yaw, 1, 1, 1, cc);
            B.curtain.add(c2x, y, c2z, f.yaw, 1, 1, 1, cc);
          }
        } else B.winGlass.add(gx, y, gz, f.yaw);
        if (!low) {
          const [sx, , sz] = at(f, u, y - 0.95, 0.12);
          B.sill.add(sx, y - 0.95, sz, f.yaw);
          if (lintels) {
            const [lx, , lz] = at(f, u, y + 0.98, 0.06);
            B.lintel.add(lx, y + 0.98, lz, f.yaw);
          }
        }
        if (balconies && b % 2 === 0 && fl > 0) {
          const [bx, , bz] = at(f, u, y - 0.95, 0);
          B.balcony.add(bx, y - 0.95, bz, f.yaw, 1, 1, 1, frameColor);
        } else if (ac && rand() < 0.09) {
          const [ax, , az] = at(f, u + 0.2, y - 0.62, 0.25);
          B.ac.add(ax, y - 0.62, az, f.yaw);
        }
      }
    }
  }

  function storefronts(f, x0, z0, height) {
    const units = Math.max(1, Math.floor(f.len / 7));
    const w = f.len / units;
    for (let i = 0; i < units; i++) {
      const u = w * (i + 0.5);
      const shop = SHOPS[Math.floor(rand() * SHOPS.length)];
      // Vitrine éclairée + encadrement + porte
      const gy = 1.55;
      const [gx, , gz] = at(f, u - 0.6, gy, 0.04);
      B.shopGlass.add(gx, gy, gz, f.yaw, w - 3.2, 2.5, 1, ['#ffe8b0', '#ffd0e0', '#d0f4ff', '#fff4c0'][i % 4]);
      const [dx, , dz] = at(f, u + w / 2 - 1.3, 1.15, 0.05);
      B.door.add(dx, 1.15, dz, f.yaw, 1, 1, 1, shop[2]);
      // Porte praticable : point devant la porte, normale vers la rue.
      const [ox, , oz] = at(f, u + w / 2 - 1.3, 0, 1.1);
      shopDoors.push({ x: ox, z: oz, nx: f.n[0], nz: f.n[1], name: shop[0] });
      // Store banne rayé, incliné
      const [ax, , az] = at(f, u, 3.1, 0.62);
      B.awning.add(ax, 3.1, az, f.yaw, w - 0.6, 1, 1, shop[1], 0.32);
      // Enseigne
      if (!low || i === 0) {
        const tex = signTexture(shop[0], '#ffffff', shop[2]);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 4.2), 0.75), new THREE.MeshBasicMaterial({ map: tex }));
        const [sx, , sz] = at(f, u, 3.85, 0.08);
        sign.position.set(sx, 3.85, sz);
        sign.rotation.y = f.yaw;
        root.add(sign);
      }
    }
    void x0;
    void z0;
    void height;
  }

  function entrance(f, u, frameColor) {
    const [dx, , dz] = at(f, u, 1.3, 0.06);
    const [ox, , oz] = at(f, u, 0, 1.3);
    shopDoors.push({ x: ox, z: oz, nx: f.n[0], nz: f.n[1], name: 'HALL' });
    B.door.add(dx, 1.3, dz, f.yaw, 1.4, 1.13, 1, '#3a2a5a');
    const [cx, , cz] = at(f, u, 2.95, 0.7);
    B.awning.add(cx, 2.95, cz, f.yaw, 2.6, 1, 1.1, frameColor, 0.05);
    for (let k = 0; k < 2; k++) {
      const [sx, , sz] = at(f, u, 0.08 + k * 0.12, 0.45 - k * 0.2);
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.6 - k * 0.4, 0.14, 0.5), M.stone);
      step.position.set(sx, 0.15 + 0.07 + k * 0.14, sz);
      step.rotation.y = f.yaw;
      root.add(step);
    }
  }

  function cornice(x0, z0, x1, z1, y, depth = 0.35, mat = M.stone) {
    block(x0 - depth, y, z0 - depth, x1 + depth, y + 0.45, z1 + depth, mat, { collide: false, cast: false, tile: 2 });
  }

  function dentils(fs, y) {
    for (const f of fs) {
      const n = Math.floor(f.len / 0.6);
      for (let i = 0; i < n; i++) {
        const [x, , z] = at(f, (i + 0.5) * (f.len / n), y, 0.15);
        B.dentil.add(x, y, z, f.yaw);
      }
    }
  }

  function roofProps(x0, z0, x1, z1, h, style, walkable) {
    const w = x1 - x0;
    const d = z1 - z0;
    // Acrotère + couvertine
    const p = 0.9;
    for (const [a, b, c, e] of [[x0, z0, x1, z0 + 0.35], [x0, z1 - 0.35, x1, z1], [x0, z0, x0 + 0.35, z1], [x1 - 0.35, z0, x1, z1]]) {
      block(a, h, b, c, h + p, e, M.stone, { collide: walkable, cast: false, tile: 2 });
    }
    // Toiture gravillonnée
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.7, d - 0.7), M.roof);
    roof.material.map.repeat.set(w / 4, d / 4);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set((x0 + x1) / 2, h + 0.02, (z0 + z1) / 2);
    roof.receiveShadow = true;
    root.add(roof);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const spot = () => [x0 + 2 + rand() * Math.max(0.1, w - 4), z0 + 2 + rand() * Math.max(0.1, d - 4)];
    // Cage d'escalier
    if (w > 8 && d > 8) {
      const [sx, sz] = spot();
      block(sx - 1.4, h, sz - 1.2, sx + 1.4, h + 2.8, sz + 1.2, M.stone, { collide: walkable });
      B.door.add(sx, h + 1.15, sz + 1.25, 0, 0.8, 0.9, 1, '#5a3a2a');
    }
    if ((style === 'brick' || style === 'stucco') && rand() < 0.75 && w > 7) {
      const [tx, tz] = spot();
      B.tank.add(tx, h, tz, rand() * 6);
      if (walkable) col.addCentered(tx, h, tz, 3, 4.3, 3);
    }
    const nAc = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < nAc; i++) {
      const [ax, az] = spot();
      B.roofAc.add(ax, h + 0.55, az, rand() < 0.5 ? 0 : Math.PI / 2);
      if (walkable) col.addCentered(ax, h, az, 1.6, 1.1, 1.6);
    }
    for (let i = 0; i < 3; i++) {
      const [vx, vz] = spot();
      B.vent.add(vx, h + 0.45, vz);
    }
    if (style === 'office' || style === 'glass') {
      for (let i = 0; i < 4 && w > 10; i++) for (let j = 0; j < 2; j++) B.solar.add(cx - 3 + i * 2, h + 0.5, cz - 1 + j * 1.3, 0, 1, 1, 1, null, -0.35);
    }
    if (rand() < 0.4) {
      const [ax, az] = spot();
      B.antenna.add(ax, h + 2.5, az);
    }
  }

  // ---------- Le bâtiment complet ----------
  function building(x0, z0, x1, z1, h, styleIn, opts = {}) {
    const tall = h > 30;
    const style = opts.style || ({ concrete: rand() < 0.5 ? 'stucco' : 'office', brick: 'brick', glass: 'glass' }[styleIn] || styleIn);
    const pal = PALETTES[tall && styleIn !== 'glass' && rand() < 0.6 ? 'artdeco' : style] || PALETTES.stucco;
    const color = pal[(opts.seed ?? Math.floor(rand() * 10)) % pal.length];
    const kind = tall && pal === PALETTES.artdeco ? 'artdeco' : style;
    const F = faces(x0, z0, x1, z1);
    const visible = opts.faces ? opts.faces.map((k) => F[k]) : Object.values(F);
    const frameColor = { brick: '#f4f0e8', stucco: ['#ffffff', '#2fa8a8', '#e86f6f', '#3a5ba8'][Math.floor(rand() * 4)], office: '#3a3448', glass: '#e8ecff', artdeco: '#5a4a3a' }[kind];

    // Socle en pierre / rez-de-chaussée
    const base = block(x0, 0, z0, x1, GROUND, z1, wallMat('stone', kind === 'office' ? '#8a8aa0' : '#d8c8b0'), { collide: false });
    void base;
    let top = h;
    if (kind === 'artdeco') top = h * 0.72;
    const body = block(x0 + 0.05, GROUND, z0 + 0.05, x1 - 0.05, top, z1 - 0.05, wallMat(kind === 'artdeco' ? 'stucco' : kind, color), { collide: false });
    if (kind === 'glass') glassEmissive.push(body.material);
    col.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: top, z: z1 }, 'building');
    cornice(x0, z0, x1, z1, GROUND - 0.25, 0.25);

    // Rez-de-chaussée : commerces côté rue, entrée d'immeuble
    let entranceDone = false;
    for (const f of visible) {
      if (opts.noShops || !onStreet(f) || f.len < 7) continue;
      if (!entranceDone && f.len > 14 && kind !== 'glass') {
        entrance(f, f.len * 0.2, frameColor);
        entranceDone = true;
      }
      if (kind === 'glass' || kind === 'office') {
        // Hall vitré
        const [gx, , gz] = at(f, f.len / 2, 2.0, 0.04);
        B.shopGlass.add(gx, 2.0, gz, f.yaw, f.len - 2, 3.4, 1, '#d0f4ff');
        for (let i = 1; i < f.len / 3; i++) {
          const [fx, , fz] = at(f, i * 3, 2.2, 0.15);
          B.fin.add(fx, 2.2, fz, f.yaw, 1, 4.4, 1);
        }
      } else if (rand() < 0.85) storefronts(f, x0, z0, GROUND);
    }

    // Étages
    const floors = Math.floor((top - GROUND - 0.6) / FLOOR);
    for (const f of visible) {
      if (kind === 'glass') {
        // Mur-rideau : texture + meneaux verticaux 3D + bandeaux d'étage
        const n = Math.floor(f.len / 1.6);
        for (let i = 1; i < n; i++) {
          const [fx, , fz] = at(f, i * (f.len / n), (GROUND + top) / 2, 0.15);
          B.fin.add(fx, (GROUND + top) / 2, fz, f.yaw, 1, top - GROUND, 1);
        }
      } else {
        windowsOn(f, GROUND, floors, frameColor, {
          balconies: kind === 'stucco' && rand() < 0.7,
          ribbon: kind === 'office',
          lintels: kind !== 'office',
          bay: kind === 'artdeco' ? 2.6 : 3.2,
        });
      }
      // Corniche intermédiaire tous les 4 étages (immeubles anciens)
      if (kind === 'brick' || kind === 'artdeco') {
        for (let fl = 4; fl < floors; fl += 4) {
          const y = GROUND + fl * FLOOR - 0.05;
          const [x, , z] = at(f, f.len / 2, y, 0.08);
          const band = new THREE.Mesh(new THREE.BoxGeometry(f.len, 0.25, 0.25), M.stone);
          band.position.set(x, y, z);
          band.rotation.y = f.yaw;
          root.add(band);
        }
      }
      if (kind === 'office') {
        for (let fl = 0; fl <= floors; fl++) {
          const y = GROUND + fl * FLOOR - 0.1;
          const [x, , z] = at(f, f.len / 2, y, 0.12);
          const band = new THREE.Mesh(new THREE.BoxGeometry(f.len + 0.2, 0.55, 0.3), wallMat('stone', '#d0d0dc'));
          band.position.set(x, y, z);
          band.rotation.y = f.yaw;
          root.add(band);
        }
      }
    }

    // Escaliers de secours (briques) sur une façade latérale
    if (kind === 'brick' && floors >= 2 && !opts.faces) {
      const side = [F.e, F.w].sort((a, b) => b.len - a.len)[0];
      const u = side.len * 0.5;
      for (let fl = 1; fl < floors; fl++) {
        const y = GROUND + fl * FLOOR - 0.95;
        const [x, , z] = at(side, u, y, 0);
        B.fire.add(x, y, z, side.yaw);
      }
    }

    // Couronnement
    if (kind === 'artdeco') {
      // Retraits successifs + flèche
      const inset1 = Math.min(3, (x1 - x0) * 0.15);
      const t2 = top + h * 0.18;
      block(x0 + inset1, top, z0 + inset1, x1 - inset1, t2, z1 - inset1, wallMat('stucco', color));
      const inset2 = inset1 * 2.2;
      const t3 = t2 + h * 0.1;
      block(x0 + inset2, t2, z0 + inset2, x1 - inset2, t3, z1 - inset2, wallMat('stucco', color));
      cornice(x0, z0, x1, z1, top, 0.4);
      cornice(x0 + inset1, z0 + inset1, x1 - inset1, z1 - inset1, t2, 0.3);
      // Piliers verticaux + liseré lumineux
      for (const f of visible) {
        for (let i = 1; i < 4; i++) {
          const [px, , pz] = at(f, (f.len * i) / 4, (GROUND + top) / 2, 0.2);
          B.fin.add(px, (GROUND + top) / 2, pz, f.yaw, 2.2, top - GROUND, 1.2);
        }
        const [lx, , lz] = at(f, f.len / 2, top + 0.6, 0.45);
        B.crown.add(lx, top + 0.6, lz, f.yaw, f.len * 0.9, 1, 1);
      }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, h * 0.22, 8), M.stone);
      spire.position.set((x0 + x1) / 2, t3 + h * 0.11, (z0 + z1) / 2);
      root.add(spire);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff4f5e' }));
      beacon.position.set(spire.position.x, t3 + h * 0.22, spire.position.z);
      root.add(beacon);
    } else {
      cornice(x0, z0, x1, z1, top - 0.45, kind === 'brick' ? 0.45 : 0.25);
      if (kind === 'brick' && !low) dentils(visible, top - 0.75);
      if (kind === 'glass') {
        for (const f of visible) {
          const [lx, , lz] = at(f, f.len / 2, top - 0.6, 0.2);
          B.crown.add(lx, top - 0.6, lz, f.yaw, f.len * 0.95, 1, 1);
        }
      }
      if (!opts.bareRoof || !tall) roofProps(x0, z0, x1, z1, top, kind, !!opts.walkableRoof);
      else {
        block(x0, top, z0, x1, top + 0.8, z0 + 0.35, M.stone, { collide: false, cast: false });
        block(x0, top, z1 - 0.35, x1, top + 0.8, z1, M.stone, { collide: false, cast: false });
      }
    }

    // Panneau publicitaire lumineux sur certains toits bas
    if (opts.billboard) {
      const [text, c1, c2] = opts.billboard;
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshBasicMaterial({ map: signTexture(text, c1, c2) }));
      const f = F[opts.billboardFace || 's'];
      const [bx, , bz] = at(f, f.len / 2, top + 3.6, -1.5);
      bb.position.set(bx, top + 3.6, bz);
      bb.rotation.y = f.yaw;
      root.add(bb);
      for (const k of [-3, 3]) {
        const [px, , pz] = at(f, f.len / 2 + k, top + 1.3, -1.6);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), M.metal);
        post.position.set(px, top + 1.3, pz);
        root.add(post);
      }
    }
    return { top, kind };
  }

  return {
    building,
    shopDoors,
    glassEmissive,
    wallMats,
    finalize() {
      const meshes = Object.values(B).map((b) => b.build(root)).filter(Boolean);
      return meshes;
    },
    setLights(k) {
      // Intensité des fenêtres allumées (coupure de courant = k=0)
      M.lit.color.setScalar(0.25 + 0.75 * k);
      M.curtain.color.setScalar(0.25 + 0.75 * k);
      M.shopGlass.color.setScalar(0.3 + 0.7 * k);
      M.crownLight.color.set('#ffe27a').multiplyScalar(0.2 + 0.8 * k);
      for (const m of glassEmissive) m.emissiveIntensity = 0.9 * k;
    },
  };
}
