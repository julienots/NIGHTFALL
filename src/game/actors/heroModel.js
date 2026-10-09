// Modèle procédural du héros VANT : squelette de pivots, pièces d'armure
// interchangeables, visière et veines d'énergie émissives, écharpe animée.
// Le modèle fait face à +Z ; son côté droit est en -X.
import * as THREE from 'three';
import { toon } from '../fx/toon.js';

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

// Interpolation entre images clés {p, pose} selon la progression p.
function keyed(keys, p) {
  if (p <= keys[0].p) return keys[0].pose;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (p <= b.p) {
      const t = ease((p - a.p) / (b.p - a.p));
      const out = {};
      for (const k of new Set([...Object.keys(a.pose), ...Object.keys(b.pose)])) {
        const va = a.pose[k] || [0, 0, 0];
        const vb = b.pose[k] || [0, 0, 0];
        out[k] = [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t), lerp(va[2], vb[2], t)];
      }
      return out;
    }
  }
  return keys[keys.length - 1].pose;
}

// Poses d'attaque (rotations euler en radians). Clés : spine, head, shR, elR, shL, elL, hipR, knR, hipL, knL, hips.
export const ATTACK_ANIMS = {
  jabR: [
    { p: 0, pose: { spine: [0, 0.35, 0], shR: [-0.6, 0, -0.2], elR: [-1.9, 0, 0], shL: [-0.9, 0, 0.3], elL: [-2.1, 0, 0] } },
    { p: 0.3, pose: { spine: [0.1, -0.45, 0], shR: [-1.55, 0, 0.05], elR: [-0.05, 0, 0], shL: [-0.7, 0, 0.3], elL: [-2.2, 0, 0], hipL: [-0.4, 0, 0], knL: [0.3, 0, 0] } },
    { p: 1, pose: { spine: [0, 0.1, 0], shR: [-0.7, 0, -0.2], elR: [-1.8, 0, 0], shL: [-0.8, 0, 0.3], elL: [-2.0, 0, 0] } },
  ],
  jabL: [
    { p: 0, pose: { spine: [0, -0.3, 0], shL: [-0.6, 0, 0.2], elL: [-1.9, 0, 0], shR: [-0.9, 0, -0.3], elR: [-2.1, 0, 0] } },
    { p: 0.3, pose: { spine: [0.1, 0.5, 0], shL: [-1.55, 0, -0.05], elL: [-0.05, 0, 0], shR: [-0.7, 0, -0.3], elR: [-2.2, 0, 0], hipR: [-0.4, 0, 0], knR: [0.3, 0, 0] } },
    { p: 1, pose: { spine: [0, -0.1, 0], shL: [-0.7, 0, 0.2], elL: [-1.8, 0, 0], shR: [-0.8, 0, -0.3], elR: [-2.0, 0, 0] } },
  ],
  hook: [
    { p: 0, pose: { spine: [0.1, 0.7, 0], shR: [-0.3, 0.3, -0.9], elR: [-1.7, 0, 0], shL: [-0.8, 0, 0.3], elL: [-2, 0, 0], hips: [0, 0.3, 0] } },
    { p: 0.4, pose: { spine: [-0.15, -0.9, 0.1], shR: [-2.4, 0.2, 0.2], elR: [-0.5, 0, 0], shL: [-0.5, 0, 0.5], elL: [-1.8, 0, 0], hips: [0, -0.4, 0], hipR: [0.3, 0, 0], knR: [0.5, 0, 0], hipL: [-0.5, 0, 0], knL: [0.4, 0, 0] } },
    { p: 1, pose: { spine: [0, -0.2, 0], shR: [-0.8, 0, -0.2], elR: [-1.8, 0, 0], shL: [-0.8, 0, 0.3], elL: [-2, 0, 0] } },
  ],
  slam: [
    { p: 0, pose: { spine: [0.2, 0, 0], shR: [-0.6, 0, 0], shL: [-0.6, 0, 0], elR: [-1.2, 0, 0], elL: [-1.2, 0, 0] } },
    { p: 0.4, pose: { spine: [-0.45, 0, 0], shR: [-3.0, 0, 0.3], shL: [-3.0, 0, -0.3], elR: [-0.8, 0, 0], elL: [-0.8, 0, 0], hipR: [0.2, 0, 0], hipL: [0.2, 0, 0], head: [-0.2, 0, 0] } },
    { p: 0.55, pose: { spine: [0.75, 0, 0], shR: [-1.2, 0, 0.1], shL: [-1.2, 0, -0.1], elR: [-0.2, 0, 0], elL: [-0.2, 0, 0], hipR: [-1.0, 0, 0], knR: [1.2, 0, 0], hipL: [0.5, 0, 0], knL: [0.9, 0, 0], hips: [0, 0, 0], drop: [0, -0.35, 0] } },
    { p: 1, pose: { spine: [0.1, 0, 0], shR: [-0.6, 0, -0.2], shL: [-0.6, 0, 0.2], elR: [-1.5, 0, 0], elL: [-1.5, 0, 0] } },
  ],
  voidStrike: [
    { p: 0, pose: { spine: [0, 0.8, 0], shR: [0.6, 0.2, -0.4], elR: [-2.2, 0, 0], shL: [-1.2, 0, 0.6], elL: [-0.4, 0, 0], hipL: [-0.5, 0, 0], knL: [0.6, 0, 0], hipR: [0.4, 0, 0], knR: [0.4, 0, 0], drop: [0, -0.2, 0] } },
    { p: 0.35, pose: { spine: [0.15, 0.9, 0], shR: [0.9, 0.2, -0.5], elR: [-2.4, 0, 0], shL: [-1.3, 0, 0.7], elL: [-0.3, 0, 0], hipL: [-0.6, 0, 0], knL: [0.7, 0, 0], hipR: [0.5, 0, 0], knR: [0.5, 0, 0], drop: [0, -0.3, 0] } },
    { p: 0.45, pose: { spine: [0.2, -0.6, 0], shR: [-1.6, 0, 0], elR: [0, 0, 0], shL: [0.3, 0, 0.5], elL: [-1.2, 0, 0], hipL: [-0.9, 0, 0], knL: [0.5, 0, 0], hipR: [0.6, 0, 0], knR: [0.2, 0, 0], drop: [0, -0.35, 0] } },
    { p: 1, pose: { spine: [0, 0, 0], shR: [-0.6, 0, -0.2], elR: [-1.5, 0, 0], shL: [-0.5, 0, 0.2], elL: [-1.4, 0, 0] } },
  ],
  diveImpact: [
    { p: 0, pose: { spine: [0.6, 0, 0], shR: [-2.0, 0, 0], shL: [-2.0, 0, 0], elR: [-0.3, 0, 0], elL: [-0.3, 0, 0], hipR: [-1.2, 0, 0], knR: [1.6, 0, 0], hipL: [-0.6, 0, 0], knL: [1.8, 0, 0], drop: [0, -0.45, 0] } },
    { p: 1, pose: { spine: [0.1, 0, 0], shR: [-0.6, 0, -0.2], shL: [-0.6, 0, 0.2], elR: [-1.5, 0, 0], elL: [-1.5, 0, 0] } },
  ],
  interact: [
    { p: 0, pose: {} },
    { p: 0.4, pose: { spine: [0.5, 0, 0], shR: [-1.2, 0, 0], elR: [-0.4, 0, 0], shL: [-1.2, 0, 0], elL: [-0.4, 0, 0], hipR: [-0.6, 0, 0], knR: [1.0, 0, 0], hipL: [-0.6, 0, 0], knL: [1.0, 0, 0], drop: [0, -0.35, 0] } },
    { p: 1, pose: {} },
  ],
  victory: [
    { p: 0, pose: {} },
    { p: 0.3, pose: { shR: [-2.9, 0, 0.2], elR: [-0.4, 0, 0], shL: [-0.3, 0, 0.3], elL: [-1.2, 0, 0], head: [-0.25, 0, 0], spine: [-0.1, 0, 0] } },
    { p: 0.8, pose: { shR: [-2.9, 0, 0.2], elR: [-0.4, 0, 0], shL: [-0.3, 0, 0.3], elL: [-1.2, 0, 0], head: [-0.25, 0, 0], spine: [-0.1, 0, 0] } },
    { p: 1, pose: {} },
  ],
};

export class HeroModel {
  constructor() {
    this.root = new THREE.Group();
    this.joints = {};
    this.time = 0;
    this.current = {};
    const rim = { rim: '#9fd8ff', rimStrength: 0.75, shared: false };
    this.mats = {
      suit: toon('#2f4bd1', rim),
      armor: toon('#26307a', rim),
      trim: toon('#ff9a3d', rim),
      helmet: toon('#1d2463', { ...rim, rimStrength: 1 }),
      visor: toon('#ffb020', { emissive: '#ffb020', emissiveIntensity: 1.6, shared: false }),
      vein: toon('#a060ff', { emissive: '#a060ff', emissiveIntensity: 1.2, shared: false }),
      gauntlet: toon('#8a93b8', rim),
      glow: toon('#ffb347', { emissive: '#ffb347', emissiveIntensity: 1.4, shared: false }),
      scarf: toon('#ff7a2a', { ...rim, side: THREE.DoubleSide }),
      boot: toon('#1d2463', rim),
      skin: toon('#f2c6a0', rim),
    };
    this.#build();
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  #pivot(name, parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.joints[name] = g;
    return g;
  }

  #mesh(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  #build() {
    const M = this.mats;
    const hips = this.#pivot('hips', this.root, 0, 0.98, 0);
    // Bassin + ceinture
    this.#mesh(new THREE.CapsuleGeometry(0.17, 0.12, 4, 12), M.suit, hips, 0, 0.02, 0, 0, 0, Math.PI / 2);
    this.#mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 20), M.trim, hips, 0, 0.1, 0, Math.PI / 2);
    this.#mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), M.glow, hips, 0, 0.1, 0.18);

    const spine = this.#pivot('spine', hips, 0, 0.12, 0);
    // Abdomen et torse
    this.#mesh(new THREE.CapsuleGeometry(0.135, 0.18, 4, 12), M.suit, spine, 0, 0.14, 0);
    const chest = this.#mesh(new THREE.CapsuleGeometry(0.2, 0.2, 6, 16), M.suit, spine, 0, 0.42, 0);
    chest.scale.set(1.35, 1.05, 0.9); // torse en V héroïque
    // Plastron (armure)
    this.armorParts = [];
    const plate = this.#mesh(new THREE.SphereGeometry(0.25, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.armor, spine, 0, 0.38, 0.03, Math.PI / 2 - 0.1);
    plate.scale.set(1.1, 0.75, 0.85);
    this.armorParts.push(plate);
    // Abdominaux segmentés
    for (let i = 0; i < 3; i++) {
      this.#mesh(new THREE.BoxGeometry(0.2 - i * 0.02, 0.055, 0.06), M.armor, spine, 0, 0.27 - i * 0.07, 0.14 + i * 0.005);
    }
    // Noyau d'énergie au centre du torse
    this.core = this.#mesh(new THREE.OctahedronGeometry(0.065, 0), M.vein, spine, 0, 0.44, 0.255);
    this.#mesh(new THREE.TorusGeometry(0.085, 0.014, 6, 20), M.trim, spine, 0, 0.44, 0.235);
    // Dos : module dorsal
    this.#mesh(new THREE.BoxGeometry(0.3, 0.32, 0.1), M.armor, spine, 0, 0.4, -0.2);
    for (const s of [-1, 1]) this.#mesh(new THREE.BoxGeometry(0.03, 0.26, 0.03), M.vein, spine, s * 0.09, 0.4, -0.26);

    // Tête
    const neck = this.#pivot('head', spine, 0, 0.66, 0);
    this.#mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10), M.suit, neck, 0, 0.0, 0);
    const helm = this.#mesh(new THREE.SphereGeometry(0.135, 24, 18), M.helmet, neck, 0, 0.14, 0.01);
    helm.scale.set(0.95, 1.08, 1.05);
    neck.scale.setScalar(1.4); // tête cartoon plus grosse
    // Visière en V
    for (const s of [-1, 1]) {
      this.#mesh(new THREE.BoxGeometry(0.11, 0.028, 0.04), M.visor, neck, s * 0.05, 0.15, 0.125, 0, s * 0.35, s * 0.22);
    }
    // Mentonnière et crête
    this.#mesh(new THREE.BoxGeometry(0.13, 0.06, 0.07), M.armor, neck, 0, 0.06, 0.1);
    this.#mesh(new THREE.BoxGeometry(0.025, 0.06, 0.2), M.trim, neck, 0, 0.29, -0.01);
    for (const s of [-1, 1]) this.#mesh(new THREE.BoxGeometry(0.02, 0.05, 0.12), M.trim, neck, s * 0.13, 0.16, -0.03, 0, 0, s * 0.2);

    // Écharpe : 3 segments chaînés
    this.scarf = [];
    let parent = this.#pivot('scarfRoot', spine, 0, 0.6, -0.12);
    this.#mesh(new THREE.TorusGeometry(0.12, 0.045, 8, 16), M.scarf, spine, 0, 0.6, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0 : -0.16, 0);
      parent.add(seg);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16 - i * 0.02, 0.17), M.scarf);
      m.position.y = -0.08;
      m.castShadow = true;
      seg.add(m);
      this.scarf.push(seg);
      parent = seg;
    }

    // Bras
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const sh = this.#pivot('sh' + side, spine, sx * 0.29, 0.5, 0);
      // Épaulière (armure)
      const pad = this.#mesh(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.armor, sh, sx * 0.03, 0.03, 0);
      pad.scale.set(1.45, 1.1, 1.45);
      this.armorParts.push(pad);
      this.#mesh(new THREE.BoxGeometry(0.02, 0.02, 0.18), M.trim, sh, sx * 0.08, 0.09, 0, 0, 0, sx * 0.6);
      this.#mesh(new THREE.CapsuleGeometry(0.068, 0.2, 4, 10), M.suit, sh, 0, -0.16, 0);
      // Veine d'énergie le long du bras
      this.#mesh(new THREE.BoxGeometry(0.015, 0.2, 0.015), M.vein, sh, sx * 0.06, -0.16, 0.03);
      const el = this.#pivot('el' + side, sh, 0, -0.33, 0);
      this.#mesh(new THREE.CapsuleGeometry(0.06, 0.18, 4, 10), M.suit, el, 0, -0.13, 0);
      // Gantelet (arme)
      const g = this.#mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.22, 14), M.gauntlet, el, 0, -0.18, 0);
      g.scale.z = 1.1;
      for (let k = 0; k < 2; k++) {
        this.#mesh(new THREE.TorusGeometry(0.095 - k * 0.012, 0.012, 6, 16), M.glow, el, 0, -0.12 - k * 0.08, 0, Math.PI / 2);
      }
      const fist = this.#mesh(new THREE.SphereGeometry(0.075, 14, 10), M.gauntlet, el, 0, -0.33, 0.01);
      fist.scale.set(1.25, 1.1, 1.3); // gros poings cartoon
      this.#mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), M.glow, fist, 0, 0.0, 0.07);
      this.joints['fist' + side] = fist;
    }

    // Jambes
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const hip = this.#pivot('hip' + side, hips, sx * 0.11, -0.02, 0);
      this.#mesh(new THREE.CapsuleGeometry(0.085, 0.3, 4, 10), M.suit, hip, 0, -0.21, 0);
      const thighPlate = this.#mesh(new THREE.BoxGeometry(0.1, 0.18, 0.04), M.armor, hip, sx * 0.01, -0.18, 0.08);
      this.armorParts.push(thighPlate);
      const kn = this.#pivot('kn' + side, hip, 0, -0.43, 0);
      this.#mesh(new THREE.SphereGeometry(0.06, 10, 8), M.armor, kn, 0, 0, 0.06);
      this.#mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), M.suit, kn, 0, -0.2, 0);
      this.#mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.2, 12), M.boot, kn, 0, -0.37, 0.0);
      const shoe = this.#mesh(new THREE.SphereGeometry(0.1, 14, 10), M.boot, kn, 0, -0.47, 0.07);
      shoe.scale.set(1.05, 0.6, 1.6); // grosses bottes arrondies
      this.#mesh(new THREE.BoxGeometry(0.16, 0.02, 0.05), M.trim, kn, 0, -0.42, 0.1);
      this.#mesh(new THREE.BoxGeometry(0.1, 0.012, 0.012), M.glow, kn, 0, -0.43, 0.17);
    }

    // Aura d'énergie (visible pendant les pouvoirs)
    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#a060ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.aura.position.y = 1;
    this.aura.scale.set(0.7, 1.15, 0.7);
    this.root.add(this.aura);
  }

  // Apparence de l'équipement (visuels définis dans data/items.js).
  setEquipment(weaponVisual, armorVisual) {
    const w = weaponVisual || { glow: '#ffb347', plate: '#8a93b8' };
    this.mats.glow.emissive.set(w.glow);
    this.mats.gauntlet.color.set(w.plate);
    const a = armorVisual || { plate: '#26307a', trim: '#ff9a3d' };
    this.mats.armor.color.set(a.plate);
    this.mats.trim.color.set(a.trim);
    for (const p of this.armorParts) p.visible = !!armorVisual || p.geometry.type !== 'BoxGeometry';
  }

  // Intensité des veines selon l'énergie (0..1) et le flash d'attaque.
  setEnergy(e, flash = 0) {
    this.mats.vein.emissiveIntensity = 0.5 + e * 1.2 + flash * 2.5;
    this.mats.glow.emissiveIntensity = 1.3 + flash * 2.5;
    this.aura.material.opacity = flash * 0.18;
    this.aura.scale.setScalar(0.7 + flash * 0.4);
    this.aura.scale.y = 1.15 + flash * 0.4;
  }

  // Calcule la pose cible et l'applique avec lissage.
  // s : { mode, speed, phase, airborne, vy, anim, animP, lean, hurt, dead, deadP, dt }
  animate(s) {
    const dt = s.dt;
    this.time += dt;
    const t = this.time;
    const pose = {};
    const set = (k, x, y = 0, z = 0) => (pose[k] = [x, y, z]);

    // Locomotion de base
    const sp = s.speed; // 0..1 (marche->course), 1..1.6 sprint
    const ph = s.phase;
    if (s.airborne) {
      const up = s.vy > 0;
      set('spine', up ? -0.15 : 0.1);
      set('shR', -0.4, 0, -0.5);
      set('shL', -0.4, 0, 0.5);
      set('elR', -1.2);
      set('elL', -1.2);
      set('hipR', up ? -1.1 : -0.4);
      set('knR', up ? 1.6 : 0.5);
      set('hipL', up ? -0.2 : -0.7);
      set('knL', up ? 0.6 : 0.9);
    } else if (sp > 0.05) {
      const a = Math.min(sp, 1.5);
      const sw = Math.sin(ph);
      set('hipR', -sw * 0.75 * a);
      set('hipL', sw * 0.75 * a);
      set('knR', (Math.max(0, Math.cos(ph)) * 1.2 + 0.15) * a);
      set('knL', (Math.max(0, -Math.cos(ph)) * 1.2 + 0.15) * a);
      set('shR', sw * 0.7 * a, 0, -0.12);
      set('shL', -sw * 0.7 * a, 0, 0.12);
      set('elR', -0.5 - a * 0.7);
      set('elL', -0.5 - a * 0.7);
      set('spine', 0.08 + a * 0.18, sw * 0.12 * a);
      set('hips', 0, -sw * 0.15 * a);
      set('drop', 0, Math.abs(Math.cos(ph)) * 0.06 * a - 0.04 * a);
    } else {
      // Repos : garde légère + respiration
      const br = Math.sin(t * 1.8) * 0.025;
      set('spine', 0.05 + br, 0.1);
      set('head', -0.05, -0.08);
      set('shR', -0.25, 0, -0.18);
      set('shL', -0.2, 0, 0.18);
      set('elR', -1.1 - br * 2);
      set('elL', -0.9 - br * 2);
      set('hipR', -0.12, 0.1);
      set('hipL', 0.1, -0.1);
      set('knR', 0.15);
      set('knL', 0.1);
      set('drop', 0, -0.02 + br * 0.3);
    }

    // Surcouche d'animation (attaque, pouvoir, interaction…)
    if (s.anim && ATTACK_ANIMS[s.anim]) {
      const k = keyed(ATTACK_ANIMS[s.anim], s.animP);
      for (const key of Object.keys(k)) {
        // Les jambes gardent la locomotion si l'attaque ne les définit pas.
        pose[key] = k[key];
      }
    }

    if (s.dodge) {
      set('spine', 0.5, 0, 0);
      set('shR', -0.6, 0, -0.6);
      set('shL', -0.6, 0, 0.6);
      set('elR', -1.6);
      set('elL', -1.6);
      set('hipR', -1.2);
      set('knR', 1.2);
      set('hipL', -0.2);
      set('knL', 0.8);
      set('drop', 0, -0.3);
    }
    if (s.hurt > 0) {
      set('spine', -0.35 * s.hurt, 0, 0.1 * s.hurt);
      set('head', -0.4 * s.hurt);
    }
    if (s.dead) {
      const d = Math.min(1, s.deadP * 1.6);
      set('spine', 0.6 * d);
      set('hipR', -1.4 * d);
      set('knR', 2.2 * d);
      set('hipL', -1.6 * d);
      set('knL', 2.3 * d);
      set('shR', -0.3, 0, -0.6 * d);
      set('shL', -0.3, 0, 0.6 * d);
      set('head', 0.6 * d);
      set('drop', 0, -0.5 * d);
    }

    // Application lissée
    const rate = s.anim || s.dodge || s.hurt > 0 ? 28 : 12;
    const k = 1 - Math.exp(-rate * dt);
    for (const name of ['spine', 'head', 'shR', 'elR', 'shL', 'elL', 'hipR', 'knR', 'hipL', 'knL', 'hips', 'drop']) {
      const target = pose[name] || [0, 0, 0];
      const cur = this.current[name] || (this.current[name] = [0, 0, 0]);
      for (let i = 0; i < 3; i++) cur[i] += (target[i] - cur[i]) * k;
      if (name === 'drop') {
        this.joints.hips.position.y = 0.98 + cur[1];
      } else {
        this.joints[name].rotation.set(cur[0], cur[1], cur[2]);
      }
    }

    // Inclinaison du corps dans les virages / à l'accélération
    this.root.children[0].rotation.z = s.lean || 0;

    // Écharpe : traîne en fonction de la vitesse, ondulation
    const drag = Math.min(1.2, sp * 0.8 + (s.airborne ? 0.6 : 0));
    this.scarf.forEach((seg, i) => {
      seg.rotation.x = 0.25 + drag * (0.5 + i * 0.12) + Math.sin(t * 7 - i * 0.9) * (0.08 + drag * 0.1);
      seg.rotation.z = Math.sin(t * 3.1 - i) * 0.08;
    });
    this.core.rotation.y += dt * 2;
  }
}
