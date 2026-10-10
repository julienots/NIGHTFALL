// Collisions simples et robustes : le monde est un ensemble de boîtes alignées
// (AABB), les personnages sont des cylindres verticaux. Une grille spatiale
// limite les tests aux boîtes proches.

const CELL = 8;

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
  }

  // min/max : {x,y,z}. tag optionnel (ex. 'water', 'roof').
  addBox(min, max, tag) {
    const box = { min: { ...min }, max: { ...max }, tag, id: this.boxes.length };
    this.boxes.push(box);
    for (let gx = Math.floor(min.x / CELL); gx <= Math.floor(max.x / CELL); gx++) {
      for (let gz = Math.floor(min.z / CELL); gz <= Math.floor(max.z / CELL); gz++) {
        const k = gx + ',' + gz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(box);
      }
    }
    return box;
  }

  // Retire une boîte de la grille (objets déplaçables).
  removeBox(box) {
    for (let gx = Math.floor(box.min.x / CELL); gx <= Math.floor(box.max.x / CELL); gx++) {
      for (let gz = Math.floor(box.min.z / CELL); gz <= Math.floor(box.max.z / CELL); gz++) {
        const cell = this.grid.get(gx + ',' + gz);
        if (!cell) continue;
        const i = cell.indexOf(box);
        if (i >= 0) cell.splice(i, 1);
      }
    }
  }

  // Déplace une boîte existante (même identité) vers de nouvelles bornes.
  moveBox(box, min, max) {
    this.removeBox(box);
    Object.assign(box.min, min);
    Object.assign(box.max, max);
    for (let gx = Math.floor(min.x / CELL); gx <= Math.floor(max.x / CELL); gx++) {
      for (let gz = Math.floor(min.z / CELL); gz <= Math.floor(max.z / CELL); gz++) {
        const k = gx + ',' + gz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(box);
      }
    }
    return box;
  }

  // Boîte centrée (pratique pour les décors).
  addCentered(x, y, z, sx, sy, sz, tag) {
    return this.addBox({ x: x - sx / 2, y, z: z - sz / 2 }, { x: x + sx / 2, y: y + sy, z: z + sz / 2 }, tag);
  }

  query(minX, minZ, maxX, maxZ) {
    const seen = new Set();
    const out = [];
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
      for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
        const cell = this.grid.get(gx + ',' + gz);
        if (!cell) continue;
        for (const b of cell) {
          if (!seen.has(b.id) && !b.disabled) {
            seen.add(b.id);
            out.push(b);
          }
        }
      }
    }
    return out;
  }

  // Hauteur du sol sous un cercle (plus haute surface atteignable depuis `fromY`).
  groundHeight(x, z, r, fromY, step = 0.55) {
    let h = 0;
    for (const b of this.query(x - r, z - r, x + r, z + r)) {
      if (x + r * 0.6 < b.min.x || x - r * 0.6 > b.max.x || z + r * 0.6 < b.min.z || z - r * 0.6 > b.max.z) continue;
      if (b.max.y <= fromY + step && b.max.y > h) h = b.max.y;
    }
    return h;
  }

  // Déplace un cylindre (pos modifiée en place). Renvoie {hitWall}.
  moveCylinder(pos, r, height, dx, dz, step = 0.55) {
    let hitWall = false;
    // Sous-pas pour éviter de traverser les murs fins à grande vitesse.
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    for (let s = 0; s < steps; s++) {
      pos.x += dx / steps;
      pos.z += dz / steps;
      for (const b of this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r)) {
        if (b.max.y <= pos.y + step || b.min.y >= pos.y + height) continue;
        // Point le plus proche de la boîte dans le plan XZ.
        const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
        const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
        const ox = pos.x - cx;
        const oz = pos.z - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= r * r) continue;
        hitWall = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x += (ox / d) * (r - d);
          pos.z += (oz / d) * (r - d);
        } else {
          // Centre à l'intérieur : sortir par la face la plus proche.
          const pens = [
            [pos.x - b.min.x + r, -1, 0], [b.max.x - pos.x + r, 1, 0],
            [pos.z - b.min.z + r, 0, -1], [b.max.z - pos.z + r, 0, 1],
          ].sort((a, c) => a[0] - c[0]);
          pos.x += pens[0][1] * pens[0][0];
          pos.z += pens[0][2] * pens[0][0];
        }
      }
    }
    return { hitWall };
  }

  // Plafond au-dessus d'une position (pour les sauts sous un auvent).
  ceiling(x, z, r, y) {
    let c = Infinity;
    for (const b of this.query(x - r, z - r, x + r, z + r)) {
      if (x + r < b.min.x || x - r > b.max.x || z + r < b.min.z || z - r > b.max.z) continue;
      if (b.min.y >= y && b.min.y < c) c = b.min.y;
    }
    return c;
  }

  // Lancer de rayon segment contre les boîtes ; renvoie la fraction t [0,1] du premier impact.
  raycast(o, d, maxT = 1) {
    let best = maxT;
    const ex = o.x + d.x * maxT;
    const ez = o.z + d.z * maxT;
    for (const b of this.query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez))) {
      let tmin = 0;
      let tmax = best;
      let ok = true;
      for (const ax of ['x', 'y', 'z']) {
        if (Math.abs(d[ax]) < 1e-9) {
          if (o[ax] < b.min[ax] || o[ax] > b.max[ax]) {
            ok = false;
            break;
          }
        } else {
          let t1 = (b.min[ax] - o[ax]) / d[ax];
          let t2 = (b.max[ax] - o[ax]) / d[ax];
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) {
            ok = false;
            break;
          }
        }
      }
      if (ok && tmin < best) best = tmin;
    }
    return best;
  }

  lineOfSight(a, b) {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    return this.raycast(a, d, 1) >= 0.999;
  }
}
