// Terrain du monde ouvert : relief procédural (collines, crêtes, montagnes en
// bordure), lac et rivière creusés, chemins de terre, zones aplanies (villages,
// ruines). Le relief est précalculé sur une grille (pas de 3 m) : la physique,
// le maillage, l'herbe et la minicarte lisent exactement les mêmes hauteurs.
import * as THREE from 'three';
import { pbr } from '../fx/pbr.js';

export const WORLD = {
  half: 420, // étendue du maillage (m)
  play: 300, // zone jouable
  step: 3, // pas de la grille (m)
  water: -1.0, // niveau de l'eau
};

// ---------- Bruit (déterministe) ----------
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export function vnoise(x, z, seed = 1) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm(x, z, oct = 5, seed = 1) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * vnoise(x * f, z * f, seed + i * 17);
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Distance d'un point à une polyligne (et paramètre le long).
function distPoly(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

// Courbe lissée (Catmull-Rom) à partir de points de passage.
export function smoothPath(pts, seg = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------- Construction ----------
// layout : { flats: [{x, z, r, h?}], lakes: [{x, z, r}], river: [[x,z]…], roads: [[[x,z]…]…] }
export function buildTerrain(scene, layout, quality = 'medium') {
  const { half, step } = WORLD;
  const n = Math.round((half * 2) / step) + 1;
  const H = new Float32Array(n * n);
  const grassMask = new Float32Array(n * n);
  const pathMask = new Float32Array(n * n);
  const river = layout.river ? smoothPath(layout.river, 8) : null;
  const roads = (layout.roads || []).map((r) => smoothPath(r, 6));

  const raw = (x, z) => {
    let h = (fbm(x * 0.0035, z * 0.0035, 5, 3) - 0.45) * 36;
    h += Math.pow(Math.abs(fbm(x * 0.011, z * 0.011, 4, 9) - 0.5) * 2, 1.6) * 10; // crêtes
    h += (fbm(x * 0.06, z * 0.06, 2, 21) - 0.5) * 1.2; // bosses
    // Montagnes en bordure (limite naturelle du monde)
    const d = Math.max(Math.abs(x), Math.abs(z));
    const ridge = 1 - Math.abs(fbm(x * 0.006, z * 0.006, 5, 61) * 2 - 1);
    h += smooth(WORLD.play - 70, WORLD.play + 50, d) * (40 + fbm(x * 0.008, z * 0.008, 4, 33) * 50 + ridge * ridge * 85);
    return h + 4;
  };
  // Hauteur cible des zones aplanies (relief d'origine au centre).
  for (const f of layout.flats || []) if (f.h == null) f.h = raw(f.x, f.z);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      let h = raw(x, z);
      let grass = 0.65 + fbm(x * 0.02, z * 0.02, 3, 41) * 0.7;
      let path = 0;
      // Zones aplanies (villages, sanctuaire, sceaux)
      for (const f of layout.flats || []) {
        const d = Math.hypot(x - f.x, z - f.z);
        const k = smooth(f.r + 18, f.r, d);
        if (k > 0) h += (f.h - h) * k;
        if (f.bare) grass *= 1 - smooth(f.r, f.r * 0.55, d) * f.bare;
      }
      // Chemins : légèrement creusés, terre battue
      for (const r of roads) {
        const d = distPoly(x, z, r);
        if (d < 6) {
          const k = smooth(4.2, 1.6, d);
          path = Math.max(path, k);
          h -= k * 0.25;
        }
      }
      // Rivière
      if (river) {
        const d = distPoly(x, z, river);
        const k = smooth(14, 3, d);
        if (k > 0) {
          h = h * (1 - k) + (WORLD.water - 2.2) * k;
          grass *= 1 - smooth(9, 5, d);
        }
      }
      // Lacs
      for (const l of layout.lakes || []) {
        const d = Math.hypot(x - l.x, z - l.z) / l.r + (fbm(x * 0.03, z * 0.03, 2, 55) - 0.5) * 0.25;
        const k = smooth(1.35, 0.85, d);
        if (k > 0) {
          h = h * (1 - k) + (WORLD.water - 4) * k;
          grass *= 1 - smooth(1.15, 0.95, d);
        }
      }
      grass *= 1 - path;
      H[j * n + i] = h;
      grassMask[j * n + i] = grass;
      pathMask[j * n + i] = path;
    }
  }
  // Pente : pas d'herbe sur la roche, ni sous l'eau.
  const slopeAt = (i, j) => {
    const a = H[j * n + Math.max(0, i - 1)];
    const b = H[j * n + Math.min(n - 1, i + 1)];
    const c = H[Math.max(0, j - 1) * n + i];
    const d = H[Math.min(n - 1, j + 1) * n + i];
    return Math.hypot(b - a, d - c) / (2 * step);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const s = slopeAt(i, j);
      grassMask[k] *= 1 - smooth(0.85, 1.25, s);
      if (H[k] < WORLD.water + 0.25) grassMask[k] = 0;
    }
  }

  const heightAt = (x, z) => {
    const fx = (Math.max(-half, Math.min(half, x)) + half) / step;
    const fz = (Math.max(-half, Math.min(half, z)) + half) / step;
    const i = Math.min(n - 2, Math.floor(fx));
    const j = Math.min(n - 2, Math.floor(fz));
    const u = fx - i;
    const v = fz - j;
    // Même découpage en triangles que le maillage (diagonale a-d).
    const a = H[j * n + i];
    const b = H[j * n + i + 1];
    const c = H[(j + 1) * n + i];
    const d = H[(j + 1) * n + i + 1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const sample = (arr, x, z) => {
    const i = Math.round((x + half) / step);
    const j = Math.round((z + half) / step);
    if (i < 0 || j < 0 || i >= n || j >= n) return 0;
    return arr[j * n + i];
  };

  // ---------- Maillage ----------
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color('#4f6a2e');
  const cGrass2 = new THREE.Color('#6c7a34');
  const cDry = new THREE.Color('#7a7046');
  const cDirt = new THREE.Color('#6a5640');
  const cRock = new THREE.Color('#6e6a64');
  const cRock2 = new THREE.Color('#4e4b48');
  const cSand = new THREE.Color('#8c8064');
  const cSnow = new THREE.Color('#b8bcc2');
  const cMud = new THREE.Color('#3e3a30');
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    // PlaneGeometry : rangées de x croissant, z croissant après rotation.
    const i = k % n;
    const j = Math.floor(k / n);
    const h = H[j * n + i];
    pos.setY(k, h);
    const x = -half + i * step;
    const z = -half + j * step;
    const s = slopeAt(i, j);
    const nz = fbm(x * 0.03, z * 0.03, 3, 77);
    c.copy(cGrass).lerp(cGrass2, nz).lerp(cDry, smooth(0.55, 0.85, fbm(x * 0.008, z * 0.008, 2, 88)) * 0.6);
    c.lerp(cDirt, pathMask[j * n + i] * 0.9);
    c.lerp(cSand, smooth(WORLD.water + 1.6, WORLD.water + 0.3, h));
    c.lerp(cMud, smooth(WORLD.water - 0.2, WORLD.water - 1.5, h));
    c.lerp(nz > 0.5 ? cRock : cRock2, smooth(0.8, 1.2, s));
    c.lerp(cSnow, smooth(100, 125, h + nz * 14) * (1 - smooth(1.0, 1.5, s)));
    col[k * 3] = c.r;
    col[k * 3 + 1] = c.g;
    col[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = pbr({ color: '#ffffff', vertexColors: true, surface: 'grass', roughness: 0.95, keepColor: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);

  // ---------- Texture de hauteur / densité (herbe, GPU) ----------
  const data = new Float32Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    data[k * 4] = H[k];
    data[k * 4 + 1] = grassMask[k];
    data[k * 4 + 2] = pathMask[k];
    data[k * 4 + 3] = 1;
  }
  const half16 = new Uint16Array(data.length);
  for (let k = 0; k < data.length; k++) half16[k] = THREE.DataUtils.toHalfFloat(data[k]);
  const tex = new THREE.DataTexture(half16, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  return {
    mesh,
    heightAt,
    grassAt: (x, z) => sample(grassMask, x, z),
    pathAt: (x, z) => sample(pathMask, x, z),
    slopeAt: (x, z) => {
      const e = 1.5;
      return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    },
    tex,
    n,
    roads,
    river,
  };
}
