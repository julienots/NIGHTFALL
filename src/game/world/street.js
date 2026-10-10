// Rue vivante : feux tricolores qui cyclent, circulation (voies, arrêts au
// rouge, distances de sécurité, arrêt devant le joueur), bus, tunnels de sortie,
// mobilier urbain (bancs, poubelles, abribus, boîtes aux lettres, bornes,
// panneaux de rues, bouches d'égout qui fument).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { signTexture } from './textures.js';
import { bakeRigid } from '../core/bake.js';

// Voies (circulation à droite). pos = base + dir * s ; s de -84 à 84.
const LANES = [
  { id: 'N', base: [3.4, 0], dir: [0, -1], axis: 'NS' },
  { id: 'S', base: [-3.4, 0], dir: [0, 1], axis: 'NS' },
  { id: 'E', base: [0, 3.4], dir: [1, 0], axis: 'EW' },
  { id: 'W', base: [0, -3.4], dir: [-1, 0], axis: 'EW' },
];
const STOP_S = -14.2; // ligne d'arrêt avant le passage piéton
const S_MIN = -204;
const S_MAX = 204;
const CYCLE = [
  ['NS', 'green', 9], ['NS', 'yellow', 2.2], ['ALL', 'red', 1.2],
  ['EW', 'green', 9], ['EW', 'yellow', 2.2], ['ALL', 'red', 1.2],
];

export function buildStreet({ root, col, rand, quality, car, box, M, barrierMat, darkMetal, concreteMat }) {
  const dyn = new THREE.Group();
  root.add(dyn);
  const markDyn = (o) => o.traverse((c) => c.isMesh && (c.userData.dynamic = true));
  const steam = [];

  // ---------- Feux tricolores ----------
  const bulbOff = { red: '#3a1620', yellow: '#3a3016', green: '#163a20' };
  const bulbOn = { red: '#ff3040', yellow: '#ffc020', green: '#30ff70' };
  const heads = [];
  const poleMat = M({ color: '#3a3448' });
  for (const [cx, cz, axis, yaw] of [[9.4, 9.4, 'NS', Math.PI], [-9.4, -9.4, 'NS', 0], [-9.4, 9.4, 'EW', Math.PI / 2], [9.4, -9.4, 'EW', -Math.PI / 2]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.6, 10), poleMat);
    pole.position.y = 2.8;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4.2), poleMat);
    arm.position.set(0, 5.4, 2.1);
    const housing = new THREE.Mesh(new RoundedBoxGeometry(0.45, 1.25, 0.35, 2, 0.08), M({ color: '#2b2050' }));
    housing.position.set(0, 4.7, 4.0);
    g.add(pole, arm, housing);
    const bulbs = {};
    ['red', 'yellow', 'green'].forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: bulbOff[c] }));
      b.position.set(0, 5.1 - i * 0.38, 4.0 - 0.19);
      g.add(b);
      bulbs[c] = b;
    });
    // Feu piéton sur le poteau
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.12), new THREE.MeshBasicMaterial({ color: '#ff3040' }));
    ped.position.set(0, 2.6, 0.15);
    g.add(ped);
    g.position.set(cx, 0, cz);
    g.rotation.y = yaw;
    markDyn(g);
    dyn.add(g);
    bakeRigid(g, new Set([...Object.values(bulbs), ped]));
    col.addCentered(cx, 0, cz, 0.3, 5.6, 0.3);
    heads.push({ axis, bulbs, ped });
  }
  const lights = { phase: 0, t: 0 };
  const lightState = (axis) => {
    const [a, c] = CYCLE[lights.phase];
    if (a === axis) return c;
    return 'red';
  };
  function updateLights(dt) {
    lights.t += dt;
    if (lights.t > CYCLE[lights.phase][2]) {
      lights.t = 0;
      lights.phase = (lights.phase + 1) % CYCLE.length;
    }
    for (const h of heads) {
      const st = lights.powerOff ? 'none' : lightState(h.axis);
      for (const c of ['red', 'yellow', 'green']) h.bulbs[c].material.color.set(st === c ? bulbOn[c] : bulbOff[c]);
      // Bonhomme vert quand l'autre axe roule
      h.ped.material.color.set(lights.powerOff ? '#222' : st === 'red' ? '#30ff70' : '#ff3040');
    }
  }

  // ---------- Mobilier urbain ----------
  const wood = M({ color: '#c98a4a' });
  const binMat = M({ color: '#3fae6a' });
  const blueMat = M({ color: '#3d6fd1' });
  const glassMat = new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.35, depthWrite: false });
  function bench(x, z, yaw) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.07, 0.14, 2, 0.03), wood);
      slat.position.set(0, 0.5, -0.15 + i * 0.16);
      g.add(slat);
    }
    for (let i = 0; i < 2; i++) {
      const back = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.14, 0.06, 2, 0.03), wood);
      back.position.set(0, 0.75 + i * 0.2, -0.28);
      back.rotation.x = -0.15;
      g.add(back);
    }
    for (const k of [-0.75, 0.75]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.5), darkMetal);
      leg.position.set(k, 0.25, -0.05);
      g.add(leg);
    }
    g.position.set(x, 0.15, z);
    g.rotation.y = yaw;
    root.add(g);
    col.addCentered(x, 0, z, 1.2, 0.55, 1.2);
  }
  function bin(x, z) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 14), binMat);
    b.position.set(x, 0.6, z);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.08, 14), darkMetal);
    lid.position.set(x, 1.08, z);
    root.add(b, lid);
    col.addCentered(x, 0, z, 0.6, 1.1, 0.6);
  }
  function mailbox(x, z, yaw) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.9, 0.45, 2, 0.08), M({ color: '#ffd23f' }));
    body.position.y = 0.95;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.55, 14, 1, false, 0, Math.PI), M({ color: '#ffd23f' }));
    top.rotation.z = Math.PI / 2;
    top.position.y = 1.4;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), darkMetal);
    leg.position.y = 0.4;
    g.add(body, top, leg);
    g.position.set(x, 0.15, z);
    g.rotation.y = yaw;
    root.add(g);
    col.addCentered(x, 0, z, 0.6, 1.6, 0.6);
  }
  function newsbox(x, z, yaw) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.5, 1.0, 0.45, 2, 0.05), M({ color: '#e8553f' }));
    b.position.y = 0.6;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.3), new THREE.MeshBasicMaterial({ color: '#fff4d6' }));
    w.position.set(0, 0.85, 0.23);
    g.add(b, w);
    g.position.set(x, 0.15, z);
    g.rotation.y = yaw;
    root.add(g);
    col.addCentered(x, 0, z, 0.55, 1.1, 0.55);
  }
  function bollard(x, z) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.85, 10), darkMetal);
    b.position.set(x, 0.57, z);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 6), M({ color: '#ffcd20' }));
    cap.position.set(x, 1.0, z);
    root.add(b, cap);
    col.addCentered(x, 0, z, 0.3, 1.0, 0.3);
  }
  function streetSign(x, z, a, b) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8), darkMetal);
    pole.position.set(x, 1.85, z);
    root.add(pole);
    for (const [txt, yaw, y] of [[a, 0, 3.3], [b, Math.PI / 2, 3.0]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.36), new THREE.MeshBasicMaterial({ map: signTexture(txt, '#ffffff', '#2f7de1'), side: THREE.DoubleSide }));
      s.position.set(x, y, z);
      s.rotation.y = yaw;
      root.add(s);
    }
    col.addCentered(x, 0, z, 0.2, 3.4, 0.2);
  }
  function manhole(x, z) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), M({ color: '#2b2050', polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    root.add(m);
    steam.push(new THREE.Vector3(x, 0.1, z));
  }

  for (const [x, z, yaw] of [[-9.6, 23, Math.PI / 2], [9.6, -23, -Math.PI / 2], [32, 9.6, Math.PI], [-24, -9.6, 0], [-31, 9.6, Math.PI], [-9.6, -14, Math.PI / 2]]) bench(x, z, yaw);
  for (const [x, z] of [[-9.6, 25.6], [9.6, -25.6], [34.4, 9.6], [-26.4, -9.6], [13.4, 9.7]]) bin(x, z);
  mailbox(-9.6, 13.5, Math.PI / 2);
  mailbox(24, -9.6, 0);
  newsbox(9.6, 14.5, -Math.PI / 2);
  newsbox(-14, 9.6, Math.PI);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    for (const k of [0.6, 1.8]) {
      bollard(sx * (8.4 + k), sz * 8.4);
      bollard(sx * 8.4, sz * (8.4 + k));
    }
  }
  streetSign(10.5, -10.5, 'AV. HALDEN', 'RUE CORVIN');
  streetSign(-10.5, 10.5, 'AV. HALDEN', 'RUE LUMEN');
  for (const [x, z] of [[0.5, 30], [30, -0.5], [-22, 0.5], [-0.5, -48], [-0.5, 52]]) manhole(x, z);

  // Abribus (arrêt d'Inès)
  const shelter = new THREE.Group();
  const roofS = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.12, 1.6, 2, 0.05), blueMat);
  roofS.position.y = 2.6;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), glassMat);
  back.position.set(0, 1.45, 0.7);
  back.rotation.y = Math.PI;
  const ad = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), new THREE.MeshBasicMaterial({ map: signTexture('NOVA', '#ffcd20', '#7b4ad6') }));
  ad.position.set(1.15, 1.45, 0.68);
  ad.rotation.y = Math.PI;
  for (const k of [-1.7, 1.7]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), darkMetal);
    post.position.set(k, 1.3, 0.7);
    shelter.add(post);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.4), wood);
  seat.position.set(-0.6, 0.5, 0.45);
  const busSign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: signTexture('BUS 12', '#ffffff', '#3d6fd1'), side: THREE.DoubleSide }));
  busSign.position.set(-2.1, 2.9, -0.3);
  busSign.rotation.y = Math.PI / 2;
  shelter.add(roofS, back, ad, seat, busSign);
  shelter.position.set(16, 0.15, 9.8);
  shelter.rotation.y = Math.PI;
  shelter.rotation.y = 0;
  markDyn(shelter);
  dyn.add(shelter);
  bakeRigid(shelter);
  col.addBox({ x: 14.2, y: 0, z: 10.4 }, { x: 17.8, y: 2.6, z: 10.6 });

  // ---------- Circulation ----------
  const carColors = ['#ff5d5d', '#4fc3f7', '#ffd54f', '#9575cd', '#66bb6a', '#ff8a65', '#f06292', '#e8ecff'];
  const hazardMat = new THREE.MeshBasicMaterial({ color: '#ff9a20' });
  const cars = [];
  function spawnCar(lane, s, opts = {}) {
    const yaw = Math.atan2(lane.dir[0], lane.dir[1]);
    const g = opts.bus ? makeBus() : car(0, 0, yaw, { dynamic: true, parent: dyn, color: carColors[Math.floor(rand() * carColors.length)], lightsOn: true });
    if (!opts.bus) g.rotation.y = yaw;
    const rot = g.rotation.y;
    g.rotation.y = 0;
    g.position.set(0, 0, 0);
    bakeRigid(g);
    g.rotation.y = rot;
    // Feux de détresse (après le Nightfall)
    const hz = [];
    for (const k of [-0.95, 0.95]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hazardMat);
      h.position.set(k, 0.95, (opts.bus ? 4.4 : 2.0));
      h.visible = false;
      g.add(h);
      hz.push(h);
    }
    const c = { lane, s, v: 9, g, len: opts.bus ? 9 : 4.4, bus: !!opts.bus, hz, honkT: 0, waitT: 0 };
    cars.push(c);
    place(c);
    return c;
  }
  function makeBus() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.5, 2.8, 9, 3, 0.35), M({ color: '#3d6fd1' }));
    body.position.y = 1.7;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.35, 9.02), M({ color: '#ffcd20' }));
    stripe.position.y = 1.0;
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.9, 8), new THREE.MeshBasicMaterial({ color: '#ffe8b0' }));
    win.position.y = 2.25;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.1), new THREE.MeshBasicMaterial({ color: '#bfe8ff' }));
    front.position.set(0, 2.1, 4.51);
    const route = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), new THREE.MeshBasicMaterial({ map: signTexture('12  LYCÉE', '#ffcd20', '#1d0f3a') }));
    route.position.set(0, 2.85, 4.52);
    g.add(body, stripe, win, front, route);
    for (const [x, z] of [[-1.15, 3], [1.15, 3], [-1.15, -3], [1.15, -3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 16), M({ color: '#221a3a' }));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.5, z);
      g.add(w);
    }
    markDyn(g);
    dyn.add(g);
    bakeRigid(g);
    return g;
  }
  function place(c) {
    const l = c.lane;
    c.g.position.set(l.base[0] + l.dir[0] * c.s, 0, l.base[1] + l.dir[1] * c.s);
    c.g.rotation.y = Math.atan2(l.dir[0], l.dir[1]);
    c.g.visible = true;
  }
  if (quality !== 'low' || true) {
    for (const lane of LANES) {
      const n = quality === 'low' ? 4 : 7;
      for (let i = 0; i < n; i++) spawnCar(lane, S_MIN + 10 + i * (390 / n) + rand() * 12);
    }
  }

  const traffic = { on: true, hero: null, onHonk: null, bus: null };

  function updateTraffic(dt) {
    const hero = traffic.hero;
    for (const c of cars) {
      if (c.parked) continue;
      const l = c.lane;
      let target = traffic.on ? (c.bus ? 8 : 10) : 0;
      // Feu : s'arrêter avant la ligne si rouge/orange et pas encore engagé
      const front = c.s + c.len / 2;
      const st = lightState(l.axis);
      if (traffic.on && st !== 'green' && front < STOP_S + 0.2 && front > STOP_S - 18) {
        target = Math.min(target, Math.max(0, (STOP_S - front) * 1.4));
      }
      // Distance au véhicule devant
      for (const o of cars) {
        if (o === c || o.lane !== l || o.s <= c.s) continue;
        const gap = o.s - c.s - (o.len + c.len) / 2;
        if (gap < 12) target = Math.min(target, Math.max(0, (gap - 2.5) * 1.5));
      }
      // Arrêt de bus
      if (c.bus && c.busStopS != null && !c.served) {
        const d = c.busStopS - c.s;
        if (d < 25) target = Math.min(target, Math.max(0, d * 0.8));
        if (d < 0.4) {
          c.waitT += dt;
          target = 0;
          if (c.waitT > (c.busWait || 5) && (!c.waitFor || c.waitFor())) {
            c.served = true;
            c.onDepart?.();
          }
        }
      }
      // Piéton (le joueur) devant le véhicule
      if (hero && hero.pos.y < 2.5) {
        const px = hero.pos.x - (l.base[0] + l.dir[0] * c.s);
        const pz = hero.pos.z - (l.base[1] + l.dir[1] * c.s);
        const ahead = px * l.dir[0] + pz * l.dir[1];
        const lat = Math.abs(px * l.dir[1] - pz * l.dir[0]);
        if (lat < 1.9 && ahead > 0 && ahead < c.len / 2 + 9) {
          target = Math.min(target, Math.max(0, (ahead - c.len / 2 - 2) * 2));
          c.honkT -= dt;
          if (c.honkT <= 0 && c.v < 1 && traffic.on) {
            c.honkT = 4;
            traffic.onHonk?.(c.g.position);
          }
        }
        // Le véhicule repousse le joueur s'il le touche (jamais de traversée)
        if (lat < 1.3 && Math.abs(ahead) < c.len / 2 + 0.3) {
          const push = (1.3 - lat) * Math.sign(px * l.dir[1] - pz * l.dir[0] || 1);
          hero.pos.x += l.dir[1] * push * 0.5;
          hero.pos.z -= l.dir[0] * push * 0.5;
        }
      }
      const acc = target > c.v ? 3.5 : 9;
      c.v += Math.sign(target - c.v) * Math.min(Math.abs(target - c.v), acc * dt);
      c.s += c.v * dt;
      if (c.s > S_MAX) {
        if (c.bus) {
          dyn.remove(c.g);
          cars.splice(cars.indexOf(c), 1);
          traffic.bus = null;
          return;
        }
        // Réapparaît à l'autre bout si la place est libre
        const free = !cars.some((o) => o !== c && o.lane === l && o.s < S_MIN + 12);
        c.s = free ? S_MIN : S_MAX;
        c.v = free ? 9 : 0;
      }
      place(c);
      if (!traffic.on && c.v < 0.05) park(c);
    }
  }

  // Après le Nightfall : véhicules abandonnés, feux de détresse, obstacles solides.
  function park(c) {
    c.parked = true;
    if (!c.g.visible) return;
    for (const h of c.hz) h.visible = true;
    const yaw = c.g.rotation.y;
    const cs = Math.abs(Math.cos(yaw));
    const sn = Math.abs(Math.sin(yaw));
    const w = c.bus ? 2.5 : 2.0;
    col.addCentered(c.g.position.x, 0, c.g.position.z, (w * cs + c.len * sn) * 0.95, c.bus ? 3 : 1.6, (w * sn + c.len * cs) * 0.95);
  }

  return {
    traffic,
    cars,
    steam,
    lights,
    lightState,
    busStop: { x: 16, z: 9.6 },
    // Arrêt « Lycée » (fixé par Game après la construction des quartiers).
    schoolStop: null,
    setTraffic(on) {
      traffic.on = on;
      lights.powerOff = !on;
      if (on) return;
      for (const c of cars) if (c.v < 0.05 || !c.g.visible) park(c);
    },
    // Fait venir le bus jusqu'à l'abribus ; onDepart quand il repart.
    callBus({ waitFor, onDepart, wait = 5, stopX = 16 } = {}) {
      if (traffic.bus) return traffic.bus;
      const lane = LANES[2];
      const bus = spawnCar(lane, Math.max(S_MIN, stopX - 70), { bus: true });
      bus.busStopS = stopX;
      bus.busWait = wait;
      bus.waitFor = waitFor;
      bus.onDepart = onDepart;
      traffic.bus = bus;
      return bus;
    },
    update(dt, t) {
      updateLights(dt);
      updateTraffic(dt);
      for (const c of cars) {
        if (c.parked && c.hz[0].visible) {
          const on = Math.sin(t * 6) > 0;
          c.hz[0].visible = c.hz[1].visible = true;
          hazardMat.color.set(on ? '#ff9a20' : '#3a2010');
        }
      }
    },
  };
}
