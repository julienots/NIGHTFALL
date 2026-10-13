// Formes organiques des personnages : membres galbés (tours), tête sculptée,
// mèches de cheveux effilées, mains à cinq doigts, baskets. Tout est généré
// (aucun modèle externe) et mis en cache : les PNJ partagent les géométries.
import * as THREE from 'three';

const cache = new Map();
const cached = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

// Tour : profil [[rayon, y], …] de haut en bas, tourné autour de l'axe Y,
// lissé par Catmull-Rom. sx / sz : section elliptique.
export function lathe(key, profile, { seg = 14, sx = 1, sz = 1, smooth = 3 } = {}) {
  return cached('lathe:' + key, () => {
    const curve = new THREE.CatmullRomCurve3(profile.map(([r, y]) => new THREE.Vector3(r, y, 0)));
    const pts = curve.getPoints(profile.length * smooth).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
    // LatheGeometry attend un profil de bas en haut pour des normales sortantes.
    pts.reverse();
    const g = new THREE.LatheGeometry(pts, seg);
    if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
    g.computeVertexNormals();
    return g;
  });
}

// Tête : sphère déformée (crâne arrondi à l'arrière, mâchoire et menton).
export function headGeometry(r = 0.12, jaw = 0.3) {
  return cached(`head:${r}:${jaw}`, () => {
    const g = new THREE.SphereGeometry(r, 36, 28);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).divideScalar(r);
      if (v.y < 0) {
        const t = Math.pow(-v.y, 1.4);
        v.x *= 1 - jaw * t; // mâchoire qui s'affine
        v.z *= 1 - 0.12 * t;
        if (v.z > 0) v.y -= 0.12 * t * v.z; // menton légèrement descendu
      }
      if (v.z < 0) v.z *= 1.1; // occiput
      v.x *= 0.93;
      // Pommettes légèrement marquées
      if (v.z > 0.55 && v.y > -0.45 && v.y < 0.05) v.x *= 1.03;
      p.setXYZ(i, v.x * r, v.y * r * 1.06, v.z * r);
    }
    g.computeVertexNormals();
    return g;
  });
}

// Ellipsoïde lisse (paume, nez, œil, semelle…).
export function blob(rx, ry, rz, seg = 12) {
  return cached(`blob:${rx}:${ry}:${rz}:${seg}`, () => {
    const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.75)));
    g.scale(rx, ry, rz);
    return g;
  });
}

// Mèche : tube courbé qui s'effile jusqu'à la pointe. La base est à l'origine,
// la mèche part vers +Y puis se courbe vers +Z (bend) et +X (twist).
export function lock(len, r, bend = 0.4, twist = 0, seg = 7) {
  return cached(`lock:${len}:${r}:${bend}:${twist}:${seg}`, () => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(twist * len * 0.3, len * 0.55, bend * len * 0.2),
      new THREE.Vector3(twist * len, len * (1 - bend * 0.35), bend * len),
    );
    const radial = 6;
    const g = new THREE.TubeGeometry(curve, seg, r, radial, false);
    const p = g.attributes.position;
    const c = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      curve.getPointAt(u, c);
      const f = Math.max(0.06, (1 - u) ** 0.8) * (u < 0.15 ? 0.85 + u : 1);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        v.fromBufferAttribute(p, k).sub(c).multiplyScalar(f).add(c);
        p.setXYZ(k, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}

// Doigt : capsule effilée (phalange unique légèrement courbée).
export function finger(len, r) {
  return cached(`finger:${len}:${r}`, () => lathe(`finger${len}:${r}`, [[0.0001, 0.004], [r, 0], [r * 0.95, -len * 0.5], [r * 0.85, -len], [0.0001, -len - r * 0.8]], { seg: 6, smooth: 2 }));
}

// Semelle de basket : contour de pied extrudé et arrondi.
export function soleGeometry(w = 0.075, len = 0.26, h = 0.032) {
  return cached(`sole:${w}:${len}:${h}`, () => {
    const s = new THREE.Shape();
    const back = -len * 0.32;
    const front = len * 0.68;
    s.moveTo(0, back);
    s.bezierCurveTo(w * 0.9, back, w, back + len * 0.15, w * 0.92, back + len * 0.4);
    s.bezierCurveTo(w * 0.85, front - len * 0.2, w * 1.05, front - len * 0.08, w * 0.55, front);
    s.bezierCurveTo(w * 0.2, front + len * 0.04, -w * 0.5, front + len * 0.03, -w * 0.8, front - len * 0.1);
    s.bezierCurveTo(-w * 1.0, front - len * 0.3, -w * 0.8, back + len * 0.35, -w * 0.88, back + len * 0.15);
    s.bezierCurveTo(-w * 0.9, back, -w * 0.4, back, 0, back);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
    // Forme dessinée dans le plan XY (y = longueur) : on la couche au sol.
    g.rotateX(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

// Dessus de basket : ellipsoïde allongée, tronquée sous la cheville.
export function shoeUpper(w = 0.07, len = 0.13, h = 0.065) {
  return cached(`upper:${w}:${len}:${h}`, () => {
    const g = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
    g.scale(w, h, len);
    // Bout un peu relevé et pointe arrondie vers l'avant.
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (z > 0) p.setY(i, p.getY(i) * (1 - 0.35 * (z / len)) + 0.01 * (z / len));
    }
    g.computeVertexNormals();
    return g;
  });
}

// Œil en amande (blanc) : ellipsoïde aplatie, plus large que haute.
export function eyeWhite(r) {
  return blob(r * 1.3, r * 0.85, r * 0.5, 14);
}

// Arc fin (sourcil, lèvre) : tore partiel.
export function arc(r, tube, angle, seg = 10) {
  return cached(`arc:${r}:${tube}:${angle}`, () => new THREE.TorusGeometry(r, tube, 5, seg, angle));
}

// Chevelure sculptée : calotte légèrement plus grande que le crâne, dont le bord
// suit la ligne des cheveux de la coupe (frange, côtés, nuque) avec des pointes,
// et dont la surface ondule en mèches. h = { front, side, back, jag, tufts, lump, flare }
// (angles polaires en radians depuis le sommet).
export function hairShell(key, h, r = 0.128) {
  return cached('hair:' + key, () => {
    const g = new THREE.SphereGeometry(r, 40, 30);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const az = Math.atan2(v.x, v.z); // 0 = devant
      const c = Math.cos(az);
      let limit = h.side + (h.front - h.side) * Math.max(0, c) ** 2 + (h.back - h.side) * Math.max(0, -c) ** 2;
      limit += h.jag * Math.max(0, Math.sin(az * h.tufts)) ** 2;
      let polar = Math.acos(Math.max(-1, Math.min(1, v.y)));
      polar = Math.min(polar, limit);
      const edge = polar / limit; // 1 au bord
      // Mèches : ondulation de la surface, plus forte vers le bord.
      const lump = 1 + h.lump * (0.5 + 0.5 * Math.sin(az * 7 + polar * 5)) * (0.4 + edge) + (h.flare || 0) * edge ** 4;
      const s = Math.sin(polar);
      p.setXYZ(i, Math.sin(az) * s * r * lump, Math.cos(polar) * r * lump, Math.cos(az) * s * r * lump);
    }
    g.computeVertexNormals();
    return g;
  });
}
