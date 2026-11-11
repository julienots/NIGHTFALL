// Habillage nocturne de la skyline : liserés néon sur le pourtour des toits
// des immeubles et balises rouges clignotantes sur les plus hauts. Tout est
// généré depuis les boîtes de collision, en deux InstancedMesh (2 appels de
// dessin pour toute la ville).
import * as THREE from 'three';

const NEON = ['#5fe3ff', '#ff4dd2', '#a060ff', '#ffcd20', '#6fff8a'];

export function buildSkyline(scene, col, rand = Math.random) {
  const tall = col.boxes.filter((b) => !b.tag && b.min.y < 1 && b.max.y > 14 && Math.abs(b.min.x) < 300 && Math.abs(b.max.z) < 300 && Math.abs(b.min.z) < 300 && Math.abs(b.max.x) < 300
    && (b.max.x - b.min.x) * (b.max.z - b.min.z) > 60);
  // Une boîte par immeuble suffit : on écarte les boîtes quasi identiques.
  const seen = new Set();
  const list = tall.filter((b) => {
    const k = `${Math.round(b.min.x)}:${Math.round(b.min.z)}:${Math.round(b.max.y)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const neonMat = new THREE.MeshBasicMaterial({ toneMapped: false, fog: true });
  const neon = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), neonMat, list.length * 4);
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff2a3a', toneMapped: false, fog: false });
  const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), beaconMat, list.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let ni = 0;
  let bi = 0;
  for (const b of list) {
    // Seule une partie des immeubles est équipée de néons (variété).
    const y = b.max.y + 0.12;
    if (rand() < 0.55) {
      c.set(NEON[Math.floor(rand() * NEON.length)]).multiplyScalar(1.6);
      const w = b.max.x - b.min.x;
      const d = b.max.z - b.min.z;
      const cx = (b.min.x + b.max.x) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      for (const [x, z, sx, sz] of [[cx, b.min.z, w, 0.18], [cx, b.max.z, w, 0.18], [b.min.x, cz, 0.18, d], [b.max.x, cz, 0.18, d]]) {
        m.makeScale(sx + 0.2, 0.22, sz + 0.2).setPosition(x, y, z);
        neon.setMatrixAt(ni, m);
        neon.setColorAt(ni, c);
        ni++;
      }
    }
    if (b.max.y > 24) {
      m.makeTranslation((b.min.x + b.max.x) / 2, b.max.y + 1.2, (b.min.z + b.max.z) / 2);
      beacons.setMatrixAt(bi++, m);
    }
  }
  neon.count = ni;
  beacons.count = bi;
  if (neon.instanceColor) neon.instanceColor.needsUpdate = true;
  neon.frustumCulled = false;
  beacons.frustumCulled = false;
  scene.add(neon, beacons);
  let k = 1;
  return {
    count: { neon: ni / 4, beacons: bi },
    setNight(n) {
      k = Math.max(0, n);
      neon.visible = k > 0.2;
      beacons.visible = k > 0.05;
    },
    update(t) {
      if (!beacons.visible) return;
      beaconMat.color.setRGB(Math.sin(t * 3) > 0.3 ? 2.2 : 0.25, 0.05, 0.08);
      neonMat.color.setScalar(0.75 + 0.25 * Math.sin(t * 1.3) * k);
    },
  };
}
