// Modèles procéduraux des créatures. Chaque modèle expose `root`, `joints`,
// des matériaux émissifs (lueur) et `animate(state)`. Face à +Z.
import * as THREE from 'three';

function skinTexture(base, vein, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 3000; i++) {
    x.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
    x.fillRect(r() * 256, r() * 256, 2 + r() * 4, 2 + r() * 4);
  }
  x.strokeStyle = vein;
  x.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let px = r() * 256;
    let py = r() * 256;
    x.lineWidth = 0.6 + r() * 1.8;
    x.globalAlpha = 0.25 + r() * 0.4;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 8; k++) {
      px += (r() - 0.5) * 30;
      py += (r() - 0.3) * 30;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;

class BaseModel {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // pivot pour les secousses/chute
    this.root.add(this.body);
    this.joints = {};
    this.cur = {};
    this.t = 0;
  }

  pivot(name, parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.joints[name] = g;
    return g;
  }

  mesh(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  apply(pose, dt, rate) {
    const k = 1 - Math.exp(-rate * dt);
    for (const name of Object.keys(this.joints)) {
      const target = pose[name] || [0, 0, 0];
      const c = this.cur[name] || (this.cur[name] = [0, 0, 0]);
      for (let i = 0; i < 3; i++) c[i] += (target[i] - c[i]) * k;
      this.joints[name].rotation.set(c[0], c[1], c[2]);
    }
  }

  // Flash blanc à l'impact + intensité de la lueur.
  setFlash(f) {
    for (const m of this.skinMats) m.emissiveIntensity = f * 0.9;
  }

  // Dissolution à la mort.
  setDissolve(k) {
    this.root.scale.setScalar(Math.max(0.001, 1 - k * 0.15));
    this.body.position.y = -k * 0.8;
    for (const m of this.allMats) {
      m.transparent = k > 0;
      m.opacity = 1 - k;
    }
  }
}

// ----------------------------------------------------------------------------
export class StalkerModel extends BaseModel {
  constructor() {
    super();
    const skin = new THREE.MeshStandardMaterial({
      map: skinTexture('#b4ada3', '#3a5a3a', 7), roughness: 0.55, metalness: 0.05, emissive: '#ffffff', emissiveIntensity: 0,
    });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.4, metalness: 0.2, emissive: '#ffffff', emissiveIntensity: 0 });
    this.glow = new THREE.MeshStandardMaterial({ color: '#051005', emissive: '#7dff6a', emissiveIntensity: 2.5 });
    this.skinMats = [skin, dark];
    this.allMats = [skin, dark, this.glow];

    const hips = this.pivot('hips', this.body, 0, 1.25, 0);
    this.mesh(new THREE.SphereGeometry(0.16, 12, 8), skin, hips).scale.set(1.3, 0.8, 1);
    const spine = this.pivot('spine', hips, 0, 0.08, 0);
    const torso = this.mesh(new THREE.CapsuleGeometry(0.13, 0.62, 4, 10), skin, spine, 0, 0.42, 0);
    torso.scale.set(1.15, 1, 0.75);
    // Côtes saillantes
    for (let i = 0; i < 5; i++) {
      const rib = this.mesh(new THREE.TorusGeometry(0.15 - i * 0.008, 0.012, 6, 16, Math.PI * 1.2), dark, spine, 0, 0.62 - i * 0.08, 0.02, Math.PI / 2, 0, -Math.PI * 0.1);
      rib.scale.set(1.15, 0.75, 1);
    }
    // Vertèbres dorsales lumineuses
    for (let i = 0; i < 6; i++) this.mesh(new THREE.ConeGeometry(0.03, 0.09, 5), this.glow, spine, 0, 0.18 + i * 0.12, -0.12, -Math.PI / 2.4);
    const chest = this.pivot('chest', spine, 0, 0.8, 0);
    // Cou long + crâne allongé
    const neck = this.pivot('neck', chest, 0, 0.05, 0.04);
    this.mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.32, 8), skin, neck, 0, 0.16, 0, 0.3);
    const head = this.pivot('head', neck, 0, 0.32, 0.08);
    const skull = this.mesh(new THREE.SphereGeometry(0.15, 18, 14), skin, head, 0, 0.06, 0.06);
    skull.scale.set(0.82, 1.45, 1.25);
    // Fente verticale lumineuse (pas de visage)
    this.mesh(new THREE.BoxGeometry(0.02, 0.24, 0.02), this.glow, head, 0, 0.07, 0.24);
    // Mandibules fendues
    for (const s of [-1, 1]) {
      this.mesh(new THREE.ConeGeometry(0.035, 0.16, 6), dark, head, s * 0.05, -0.12, 0.13, Math.PI * 0.85, 0, s * 0.2);
    }
    // Bras très longs aux articulations multiples
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const sh = this.pivot('sh' + side, chest, sx * 0.2, -0.02, 0);
      this.mesh(new THREE.SphereGeometry(0.07, 8, 6), dark, sh);
      this.mesh(new THREE.CapsuleGeometry(0.045, 0.6, 4, 8), skin, sh, 0, -0.36, 0);
      const el = this.pivot('el' + side, sh, 0, -0.72, 0);
      this.mesh(new THREE.SphereGeometry(0.05, 8, 6), dark, el);
      this.mesh(new THREE.CapsuleGeometry(0.035, 0.66, 4, 8), skin, el, 0, -0.38, 0);
      const wr = this.pivot('wr' + side, el, 0, -0.76, 0);
      // Griffes : trois doigts effilés
      for (let f = -1; f <= 1; f++) {
        this.mesh(new THREE.ConeGeometry(0.02, 0.36, 5), dark, wr, f * 0.035, -0.17, 0.02, Math.PI + 0.08 * f, 0, f * 0.12);
      }
    }
    // Jambes digitigrades (genou inversé)
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const hip = this.pivot('hip' + side, hips, sx * 0.13, -0.04, 0);
      this.mesh(new THREE.CapsuleGeometry(0.06, 0.42, 4, 8), skin, hip, 0, -0.25, 0);
      const kn = this.pivot('kn' + side, hip, 0, -0.52, 0);
      this.mesh(new THREE.CapsuleGeometry(0.045, 0.42, 4, 8), skin, kn, 0, -0.24, 0);
      const an = this.pivot('an' + side, kn, 0, -0.5, 0);
      this.mesh(new THREE.CapsuleGeometry(0.035, 0.28, 4, 8), dark, an, 0, -0.16, 0);
      this.mesh(new THREE.ConeGeometry(0.04, 0.2, 5), dark, an, 0, -0.32, 0.08, Math.PI / 2);
    }
  }

  // st : { mode, speed, phase, p, dt, twitch }
  animate(st) {
    this.t += st.dt;
    const t = this.t;
    const P = {};
    const set = (k, x, y = 0, z = 0) => (P[k] = [x, y, z]);
    const sp = st.speed;
    const ph = st.phase;
    // Posture voûtée de base : bras pendants presque jusqu'aux genoux.
    set('spine', 0.55);
    set('neck', -0.6);
    set('head', -0.1 + Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.5) * 0.2);
    set('shR', 0.1, 0, -0.12);
    set('shL', 0.1, 0, 0.12);
    set('elR', -0.25);
    set('elL', -0.25);
    set('hipR', -0.55);
    set('hipL', -0.55);
    set('knR', 1.25);
    set('knL', 1.25);
    set('anR', -0.9);
    set('anL', -0.9);
    if (sp > 0.05) {
      const s = Math.sin(ph);
      const a = Math.min(1.6, sp);
      set('hipR', -0.55 - s * 0.6 * a);
      set('hipL', -0.55 + s * 0.6 * a);
      set('knR', 1.25 + Math.max(0, Math.cos(ph)) * 0.6 * a);
      set('knL', 1.25 + Math.max(0, -Math.cos(ph)) * 0.6 * a);
      set('shR', 0.1 + s * 0.6 * a, 0, -0.12);
      set('shL', 0.1 - s * 0.6 * a, 0, 0.12);
      set('spine', 0.55 + a * 0.25, s * 0.15);
      set('neck', -0.6 - a * 0.2);
    }
    if (st.mode === 'observe') {
      // Tête qui s'incline par à-coups (inquiétant)
      const tw = Math.floor(t * 2.3) % 3;
      set('head', 0.05, (tw - 1) * 0.3, (tw - 1) * 0.45);
      set('spine', 0.35);
      set('neck', -0.25);
    }
    if (st.mode === 'windup') {
      const p = st.p;
      set('spine', 0.95);
      set('neck', -0.9);
      set('shR', 1.4 * p, 0, -0.4);
      set('shL', 1.4 * p, 0, 0.4);
      set('elR', -0.8 * p);
      set('elL', -0.8 * p);
      set('hipR', -1.1);
      set('hipL', -1.1);
      set('knR', 1.9);
      set('knL', 1.9);
      set('anR', -1.2);
      set('anL', -1.2);
    }
    if (st.mode === 'lunge' || st.mode === 'swipe') {
      const p = st.p;
      set('spine', 0.7);
      set('neck', -0.4);
      set('head', 0.2);
      set('shR', lerp(1.4, -2.0, Math.min(1, p * 2)), 0, -0.3);
      set('shL', lerp(1.4, -1.8, Math.min(1, p * 2.4)), 0, 0.3);
      set('elR', -0.1);
      set('elL', -0.1);
      set('hipR', -1.4);
      set('knR', 0.6);
      set('hipL', 0.4);
      set('knL', 0.9);
    }
    if (st.mode === 'recover') {
      set('spine', 0.9);
      set('shR', -0.6, 0, -0.3);
      set('shL', -0.6, 0, 0.3);
    }
    if (st.mode === 'stagger') {
      set('spine', -0.2, 0, Math.sin(t * 20) * 0.1);
      set('neck', 0.4);
      set('shR', -0.8, 0, -1.0);
      set('shL', -0.8, 0, 1.0);
    }
    if (st.mode === 'dead') {
      const d = Math.min(1, st.p * 2);
      set('spine', 0.6 + d * 0.9);
      set('neck', 0.8 * d);
      set('hipR', -1.6 * d);
      set('hipL', -1.4 * d);
      set('knR', 2.4 * d);
      set('knL', 2.2 * d);
      set('shR', -0.5, 0, -1.2 * d);
      set('shL', -0.5, 0, 1.2 * d);
      this.body.rotation.x = d * 0.3;
    }
    this.joints.hips.position.y = 1.25 - (st.mode === 'windup' ? 0.3 : 0) - (st.mode === 'dead' ? Math.min(1, st.p * 2) * 0.85 : 0);
    this.glow.emissiveIntensity = st.mode === 'windup' ? 6 + Math.sin(t * 40) * 2 : st.alert ? 3.5 : 2;
    this.apply(P, st.dt, st.mode === 'lunge' || st.mode === 'windup' ? 22 : 10);
  }
}

// ----------------------------------------------------------------------------
export class BruteModel extends BaseModel {
  constructor() {
    super();
    const skin = new THREE.MeshStandardMaterial({
      map: skinTexture('#5a4a44', '#2a0a08', 13), roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0,
    });
    const plate = new THREE.MeshStandardMaterial({ color: '#2a2422', roughness: 0.35, metalness: 0.3, emissive: '#ffffff', emissiveIntensity: 0 });
    this.glow = new THREE.MeshStandardMaterial({ color: '#200000', emissive: '#ff3a1a', emissiveIntensity: 2.2 });
    const bone = new THREE.MeshStandardMaterial({ color: '#d8ccb0', roughness: 0.5 });
    this.skinMats = [skin, plate];
    this.allMats = [skin, plate, this.glow, bone];

    const hips = this.pivot('hips', this.body, 0, 1.25, 0);
    this.mesh(new THREE.SphereGeometry(0.45, 16, 12), skin, hips).scale.set(1.3, 0.8, 1);
    const spine = this.pivot('spine', hips, 0, 0.2, 0);
    // Torse massif penché vers l'avant
    const torso = this.mesh(new THREE.SphereGeometry(0.8, 20, 16), skin, spine, 0, 0.75, 0.15);
    torso.scale.set(1.25, 1.0, 0.95);
    // Plaques organiques sur le dos et les épaules
    const plates = [[0, 1.25, -0.35, 0.5], [-0.55, 1.15, -0.2, 0.42], [0.55, 1.15, -0.2, 0.42], [0, 0.8, -0.6, 0.45], [-0.35, 0.55, -0.55, 0.35], [0.35, 0.55, -0.55, 0.35]];
    for (const [x, y, z, s] of plates) {
      const p = this.mesh(new THREE.DodecahedronGeometry(s, 0), plate, spine, x, y, z, Math.random(), Math.random(), Math.random());
      p.scale.set(1, 0.45, 1);
    }
    // Fissures incandescentes sur la poitrine
    for (let i = 0; i < 5; i++) {
      this.mesh(new THREE.BoxGeometry(0.03, 0.35 + Math.random() * 0.3, 0.03), this.glow, spine, -0.4 + i * 0.2, 0.7 + Math.random() * 0.3, 0.86, 0, 0, (Math.random() - 0.5) * 0.8);
    }
    // Tête petite, enfoncée entre les épaules
    const head = this.pivot('head', spine, 0, 1.25, 0.75);
    const skull = this.mesh(new THREE.SphereGeometry(0.28, 14, 12), skin, head);
    skull.scale.set(1.1, 0.85, 1.1);
    for (const [ex, ey] of [[-0.1, 0.06], [0.1, 0.06], [-0.17, -0.02], [0.17, -0.02]]) {
      this.mesh(new THREE.SphereGeometry(0.035, 8, 6), this.glow, head, ex, ey, 0.27);
    }
    const jaw = this.pivot('jaw', head, 0, -0.12, 0.05);
    this.mesh(new THREE.BoxGeometry(0.4, 0.12, 0.35), skin, jaw, 0, -0.06, 0.1);
    for (let i = 0; i < 6; i++) {
      this.mesh(new THREE.ConeGeometry(0.025, 0.1, 5), bone, jaw, -0.15 + i * 0.06, 0.03, 0.26);
    }
    // Bras énormes (marche sur les poings)
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const sh = this.pivot('sh' + side, spine, sx * 0.95, 1.05, 0.25);
      this.mesh(new THREE.SphereGeometry(0.38, 14, 10), skin, sh);
      this.mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 10), skin, sh, 0, -0.45, 0);
      const pad = this.mesh(new THREE.DodecahedronGeometry(0.38, 0), plate, sh, sx * 0.15, 0.15, -0.05);
      pad.scale.set(1, 0.5, 1);
      const el = this.pivot('el' + side, sh, 0, -0.85, 0);
      this.mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 10), skin, el, 0, -0.4, 0);
      this.mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), this.glow, el, sx * 0.22, -0.35, 0.18);
      const fist = this.pivot('fist' + side, el, 0, -0.85, 0);
      this.mesh(new THREE.SphereGeometry(0.36, 12, 10), plate, fist).scale.set(1, 0.85, 1.1);
      for (let k = -1; k <= 1; k++) this.mesh(new THREE.ConeGeometry(0.06, 0.18, 5), bone, fist, k * 0.15, 0.05, 0.33, Math.PI / 2);
    }
    // Jambes courtes et épaisses
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const hip = this.pivot('hip' + side, hips, sx * 0.42, -0.1, 0);
      this.mesh(new THREE.CapsuleGeometry(0.26, 0.35, 4, 10), skin, hip, 0, -0.3, 0);
      const kn = this.pivot('kn' + side, hip, 0, -0.6, 0);
      this.mesh(new THREE.CapsuleGeometry(0.22, 0.3, 4, 10), skin, kn, 0, -0.25, 0);
      this.mesh(new THREE.BoxGeometry(0.42, 0.18, 0.55), plate, kn, 0, -0.5, 0.08);
    }
  }

  animate(st) {
    this.t += st.dt;
    const t = this.t;
    const P = {};
    const set = (k, x, y = 0, z = 0) => (P[k] = [x, y, z]);
    const sp = st.speed;
    const ph = st.phase;
    const br = Math.sin(t * 1.4) * 0.05;
    set('spine', 0.55 + br);
    set('head', -0.45);
    set('jaw', 0.1 + br);
    set('shR', -0.35, 0, -0.15);
    set('shL', -0.35, 0, 0.15);
    set('elR', -0.35);
    set('elL', -0.35);
    set('hipR', -0.3);
    set('hipL', -0.3);
    set('knR', 0.4);
    set('knL', 0.4);
    if (sp > 0.05) {
      const s = Math.sin(ph);
      const a = Math.min(1.5, sp);
      set('hipR', -0.3 - s * 0.45 * a);
      set('hipL', -0.3 + s * 0.45 * a);
      set('knR', 0.4 + Math.max(0, Math.cos(ph)) * 0.6 * a);
      set('knL', 0.4 + Math.max(0, -Math.cos(ph)) * 0.6 * a);
      // Les bras alternent avec les jambes opposées (allure de gorille)
      set('shR', -0.35 + s * 0.55 * a, 0, -0.15);
      set('shL', -0.35 - s * 0.55 * a, 0, 0.15);
      set('spine', 0.6 + a * 0.12, s * 0.12, s * 0.06);
    }
    if (st.mode === 'roar') {
      const k = Math.sin(Math.min(1, st.p) * Math.PI);
      set('spine', 0.1 - k * 0.3);
      set('head', -0.1 - k * 0.5);
      set('jaw', 0.2 + k * 0.6);
      set('shR', -0.6 - k * 0.8, 0, -0.6 - k * 0.5);
      set('shL', -0.6 - k * 0.8, 0, 0.6 + k * 0.5);
      set('elR', -0.6);
      set('elL', -0.6);
    }
    if (st.mode === 'slamWindup') {
      const p = st.p;
      set('spine', 0.1 - p * 0.35);
      set('head', -0.2);
      set('jaw', 0.5);
      set('shR', -2.5 * p - 0.3, 0, -0.3);
      set('shL', -2.5 * p - 0.3, 0, 0.3);
      set('elR', -0.6 * p);
      set('elL', -0.6 * p);
    }
    if (st.mode === 'slam') {
      set('spine', 1.05);
      set('head', -0.8);
      set('jaw', 0.6);
      set('shR', -1.4, 0, -0.1);
      set('shL', -1.4, 0, 0.1);
      set('elR', -0.1);
      set('elL', -0.1);
      set('hipR', -0.8);
      set('knR', 1.0);
      set('hipL', -0.8);
      set('knL', 1.0);
    }
    if (st.mode === 'swipeWindup') {
      set('spine', 0.4, 0.8 * st.p);
      set('shR', 0.4, 0.6, -1.3 * st.p);
      set('elR', -0.6);
    }
    if (st.mode === 'swipe') {
      set('spine', 0.5, -0.7);
      set('shR', -1.4, -0.4, -0.3);
      set('elR', -0.2);
    }
    if (st.mode === 'chargeWindup') {
      set('spine', 0.95);
      set('head', -0.9);
      set('jaw', 0.5);
      set('shR', 0.2 + Math.sin(t * 18) * 0.3, 0, -0.3);
      set('shL', 0.2 - Math.sin(t * 18) * 0.3, 0, 0.3);
      set('hipR', -0.7);
      set('knR', 1.0);
    }
    if (st.mode === 'charge') {
      const s = Math.sin(ph * 1.5);
      set('spine', 1.0);
      set('head', -0.9);
      set('shR', -0.9 + s * 0.8, 0, -0.2);
      set('shL', -0.9 - s * 0.8, 0, 0.2);
      set('hipR', -0.3 - s * 0.8);
      set('hipL', -0.3 + s * 0.8);
    }
    if (st.mode === 'stagger') {
      set('spine', -0.15, 0, Math.sin(t * 9) * 0.15);
      set('head', 0.3);
      set('jaw', 0.5);
      set('shR', -0.4, 0, -0.9);
      set('shL', -0.4, 0, 0.9);
      set('knR', 0.9);
      set('knL', 0.9);
    }
    if (st.mode === 'dead') {
      const d = Math.min(1, st.p * 1.5);
      set('spine', 0.55 + d * 0.8);
      set('head', 0.3);
      set('jaw', 0.7);
      set('knR', 1.8 * d);
      set('knL', 1.8 * d);
      set('hipR', -1.2 * d);
      set('hipL', -1.2 * d);
      set('shR', -0.2, 0, -1.2 * d);
      set('shL', -0.2, 0, 1.2 * d);
    }
    this.joints.hips.position.y = 1.25 - (st.mode === 'dead' ? Math.min(1, st.p * 1.5) * 0.7 : 0) - (st.mode === 'slam' ? 0.25 : 0);
    const warn = st.mode === 'slamWindup' || st.mode === 'swipeWindup' || st.mode === 'chargeWindup';
    this.glow.emissiveIntensity = warn ? 6 + Math.sin(t * 30) * 3 : st.alert ? 3 : 2;
    this.apply(P, st.dt, st.mode === 'slam' || st.mode === 'swipe' ? 25 : warn ? 12 : 7);
  }
}
