// Modèle procédural d'un personnage « ado » (Noa, Inès, passants) en style
// cartoon : sweat à capuche, jean, baskets, visage expressif. Squelette de
// pivots animé procéduralement. Face à +Z ; côté droit en -X.
// Un groupe « tilt » au niveau du bassin permet d'incliner tout le corps
// (vol à plat, virages, atterrissage).
import * as THREE from 'three';
import { toon, addRim } from '../fx/toon.js';
import { bakeJoints } from '../core/bake.js';
import { lathe, headGeometry, blob, lock, finger, soleGeometry, shoeUpper, eyeWhite, arc, hairShell, setDetail } from './bodyParts.js';

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const HIP_Y = 0.94;

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

// Animations clés (rotations en radians). Clés : spine, head, shR, elR, shL, elL,
// hipR, knR, hipL, knL, hips, drop (translation verticale du bassin).
export const ATTACK_ANIMS = {
  jabR: [
    { p: 0, pose: { spine: [0, 0.35, 0], shR: [-0.6, 0, -0.2], elR: [-1.9, 0, 0], shL: [-0.9, 0, 0.3], elL: [-2.1, 0, 0] } },
    // Élan : épaule reculée, buste armé (anticipation).
    { p: 0.14, pose: { spine: [0.02, 0.62, 0], shR: [-0.35, 0, -0.35], elR: [-2.25, 0, 0], shL: [-1.0, 0, 0.35], elL: [-2.1, 0, 0], drop: [0, -0.06, 0] } },
    { p: 0.3, pose: { spine: [0.14, -0.6, 0], shR: [-1.6, 0, 0.08], elR: [-0.02, 0, 0], shL: [-0.65, 0, 0.3], elL: [-2.2, 0, 0], hipL: [-0.5, 0, 0], knL: [0.35, 0, 0], drop: [0, -0.1, 0] } },
    // Prolongement après l'impact, puis retour en garde.
    { p: 0.46, pose: { spine: [0.16, -0.7, 0], shR: [-1.5, 0, 0.12], elR: [-0.15, 0, 0], shL: [-0.7, 0, 0.3], elL: [-2.1, 0, 0], hipL: [-0.45, 0, 0], knL: [0.3, 0, 0], drop: [0, -0.08, 0] } },
    { p: 1, pose: { spine: [0, 0.1, 0], shR: [-0.7, 0, -0.2], elR: [-1.8, 0, 0], shL: [-0.8, 0, 0.3], elL: [-2.0, 0, 0] } },
  ],
  jabL: [
    { p: 0, pose: { spine: [0, -0.3, 0], shL: [-0.6, 0, 0.2], elL: [-1.9, 0, 0], shR: [-0.9, 0, -0.3], elR: [-2.1, 0, 0] } },
    { p: 0.14, pose: { spine: [0.02, -0.6, 0], shL: [-0.35, 0, 0.35], elL: [-2.25, 0, 0], shR: [-1.0, 0, -0.35], elR: [-2.1, 0, 0], drop: [0, -0.06, 0] } },
    { p: 0.3, pose: { spine: [0.14, 0.65, 0], shL: [-1.6, 0, -0.08], elL: [-0.02, 0, 0], shR: [-0.65, 0, -0.3], elR: [-2.2, 0, 0], hipR: [-0.5, 0, 0], knR: [0.35, 0, 0], drop: [0, -0.1, 0] } },
    { p: 0.46, pose: { spine: [0.16, 0.75, 0], shL: [-1.5, 0, -0.12], elL: [-0.15, 0, 0], shR: [-0.7, 0, -0.3], elR: [-2.1, 0, 0], hipR: [-0.45, 0, 0], knR: [0.3, 0, 0], drop: [0, -0.08, 0] } },
    { p: 1, pose: { spine: [0, -0.1, 0], shL: [-0.7, 0, 0.2], elL: [-1.8, 0, 0], shR: [-0.8, 0, -0.3], elR: [-2.0, 0, 0] } },
  ],
  // Coup d'anneaux : poing droit tendu, les anneaux partent en avant.
  ringPunch: [
    { p: 0, pose: { spine: [0.1, 0.8, 0], shR: [0.3, 0.3, -0.4], elR: [-2.0, 0, 0], shL: [-1.1, 0, 0.5], elL: [-0.6, 0, 0], hipL: [-0.5, 0, 0], knL: [0.5, 0, 0], drop: [0, -0.15, 0] } },
    { p: 0.2, pose: { spine: [0.05, 1.05, 0], shR: [0.45, 0.3, -0.5], elR: [-2.1, 0, 0], shL: [-1.2, 0, 0.55], elL: [-0.5, 0, 0], hipL: [-0.55, 0, 0], knL: [0.65, 0, 0], drop: [0, -0.24, 0] } },
    { p: 0.38, pose: { spine: [0.18, -0.85, 0], shR: [-1.62, 0, 0], elR: [0, 0, 0], shL: [0.25, 0, 0.5], elL: [-1.4, 0, 0], hipL: [-0.85, 0, 0], knL: [0.5, 0, 0], hipR: [0.55, 0, 0], knR: [0.2, 0, 0], drop: [0, -0.28, 0] } },
    { p: 0.55, pose: { spine: [0.2, -0.95, 0], shR: [-1.55, 0, 0.1], elR: [-0.1, 0, 0], shL: [0.2, 0, 0.5], elL: [-1.3, 0, 0], hipL: [-0.8, 0, 0], knL: [0.5, 0, 0], hipR: [0.5, 0, 0], knR: [0.2, 0, 0], drop: [0, -0.24, 0] } },
    { p: 1, pose: { spine: [0, -0.1, 0], shR: [-0.7, 0, -0.2], elR: [-1.6, 0, 0], shL: [-0.6, 0, 0.2], elL: [-1.5, 0, 0] } },
  ],
  // Fouet d'anneaux : grand balayage horizontal du bras droit.
  whip: [
    { p: 0, pose: { spine: [0.1, 1.1, 0], shR: [-1.4, 0.2, -1.2], elR: [-0.4, 0, 0], shL: [-0.6, 0, 0.4], elL: [-1.6, 0, 0], hips: [0, 0.5, 0] } },
    { p: 0.25, pose: { spine: [0.12, 1.45, 0], shR: [-1.35, 0.25, -1.35], elR: [-0.5, 0, 0], shL: [-0.7, 0, 0.45], elL: [-1.6, 0, 0], hips: [0, 0.7, 0], drop: [0, -0.12, 0] } },
    { p: 0.45, pose: { spine: [0.05, -1.1, 0], shR: [-1.5, -0.2, 0.95], elR: [-0.1, 0, 0], shL: [-0.4, 0, 0.6], elL: [-1.4, 0, 0], hips: [0, -0.55, 0], hipR: [0.3, 0, 0], knR: [0.4, 0, 0], hipL: [-0.5, 0, 0], knL: [0.4, 0, 0], drop: [0, -0.18, 0] } },
    { p: 0.62, pose: { spine: [0.08, -1.35, 0], shR: [-1.4, -0.3, 1.1], elR: [-0.2, 0, 0], shL: [-0.4, 0, 0.6], elL: [-1.4, 0, 0], hips: [0, -0.7, 0], hipR: [0.3, 0, 0], knR: [0.4, 0, 0], hipL: [-0.5, 0, 0], knL: [0.4, 0, 0], drop: [0, -0.16, 0] } },
    { p: 1, pose: { spine: [0, -0.2, 0], shR: [-0.7, 0, -0.2], elR: [-1.5, 0, 0], shL: [-0.6, 0, 0.2], elL: [-1.5, 0, 0] } },
  ],
  // Rafale : les deux bras projettent les anneaux vers l'avant.
  volley: [
    { p: 0, pose: { spine: [-0.15, 0, 0], shR: [-0.2, 0, -0.9], elR: [-1.6, 0, 0], shL: [-0.2, 0, 0.9], elL: [-1.6, 0, 0], drop: [0, -0.1, 0] } },
    { p: 0.3, pose: { spine: [-0.2, 0, 0], shR: [0.3, 0, -1.1], elR: [-1.9, 0, 0], shL: [0.3, 0, 1.1], elL: [-1.9, 0, 0], hipL: [-0.5, 0, 0], knL: [0.7, 0, 0], hipR: [0.4, 0, 0], knR: [0.5, 0, 0], drop: [0, -0.3, 0] } },
    { p: 0.45, pose: { spine: [0.3, 0, 0], shR: [-1.5, 0, 0.15], elR: [0, 0, 0], shL: [-1.5, 0, -0.15], elL: [0, 0, 0], hipL: [-0.9, 0, 0], knL: [0.5, 0, 0], hipR: [0.6, 0, 0], knR: [0.2, 0, 0], drop: [0, -0.3, 0] } },
    { p: 1, pose: { spine: [0, 0, 0], shR: [-0.6, 0, -0.2], elR: [-1.5, 0, 0], shL: [-0.6, 0, 0.2], elL: [-1.5, 0, 0] } },
  ],
  diveImpact: [
    { p: 0, pose: { spine: [0.6, 0, 0], shR: [-2.0, 0, 0], shL: [-2.0, 0, 0], elR: [-0.3, 0, 0], elL: [-0.3, 0, 0], hipR: [-1.2, 0, 0], knR: [1.6, 0, 0], hipL: [-0.6, 0, 0], knL: [1.8, 0, 0], drop: [0, -0.45, 0] } },
    { p: 1, pose: { spine: [0.1, 0, 0], shR: [-0.6, 0, -0.2], shL: [-0.6, 0, 0.2], elR: [-1.5, 0, 0], elL: [-1.5, 0, 0] } },
  ],
  // Atterrissage de super-héros : genou à terre, poing au sol, puis relevé.
  superLanding: [
    { p: 0, pose: { spine: [0.75, 0, 0], head: [-0.4, 0, 0], shR: [-0.9, 0, 0.1], elR: [-0.1, 0, 0], shL: [-0.2, 0, 0.9], elL: [-0.5, 0, 0], hipR: [-1.5, 0, 0], knR: [1.4, 0, 0], hipL: [0.3, 0, 0], knL: [2.3, 0, 0], drop: [0, -0.55, 0] } },
    { p: 0.6, pose: { spine: [0.6, 0, 0], head: [-0.6, 0, 0], shR: [-0.9, 0, 0.1], elR: [-0.1, 0, 0], shL: [-0.2, 0, 0.9], elL: [-0.5, 0, 0], hipR: [-1.4, 0, 0], knR: [1.4, 0, 0], hipL: [0.3, 0, 0], knL: [2.2, 0, 0], drop: [0, -0.52, 0] } },
    { p: 1, pose: {} },
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
  // Regarde son téléphone (main droite devant le visage).
  phone: [
    { p: 0, pose: {} },
    { p: 0.15, pose: { head: [0.45, 0, 0], shR: [-0.5, 0.4, 0.2], elR: [-1.9, 0, 0], spine: [0.08, 0, 0] } },
    { p: 0.85, pose: { head: [0.45, 0, 0], shR: [-0.5, 0.4, 0.2], elR: [-1.9, 0, 0], spine: [0.08, 0, 0] } },
    { p: 1, pose: {} },
  ],
  // Se protège, terrifié.
  scared: [
    { p: 0, pose: {} },
    { p: 0.2, pose: { spine: [-0.25, 0, 0], head: [0.3, 0, 0], shR: [-1.9, 0.3, 0.4], elR: [-1.6, 0, 0], shL: [-1.9, -0.3, -0.4], elL: [-1.6, 0, 0], hipR: [0.2, 0, 0], knR: [0.3, 0, 0], drop: [0, -0.08, 0] } },
    { p: 0.85, pose: { spine: [-0.25, 0, 0], head: [0.3, 0, 0], shR: [-1.9, 0.3, 0.4], elR: [-1.6, 0, 0], shL: [-1.9, -0.3, -0.4], elL: [-1.6, 0, 0], hipR: [0.2, 0, 0], knR: [0.3, 0, 0], drop: [0, -0.08, 0] } },
    { p: 1, pose: {} },
  ],
  // Éveil : soulevé par les anneaux, bras écartés.
  awaken: [
    { p: 0, pose: { spine: [-0.1, 0, 0], shR: [-0.3, 0, -0.4], shL: [-0.3, 0, 0.4] } },
    { p: 0.4, pose: { spine: [-0.35, 0, 0], head: [-0.5, 0, 0], shR: [-0.2, 0, -1.3], elR: [-0.2, 0, 0], shL: [-0.2, 0, 1.3], elL: [-0.2, 0, 0], hipR: [0.1, 0, 0], knR: [0.4, 0, 0], hipL: [-0.1, 0, 0], knL: [0.3, 0, 0] } },
    { p: 0.8, pose: { spine: [0.2, 0, 0], head: [0.1, 0, 0], shR: [-1.3, 0, -0.3], elR: [-1.2, 0, 0], shL: [-1.3, 0, 0.3], elL: [-1.2, 0, 0], hipR: [-0.4, 0, 0], knR: [0.6, 0, 0], drop: [0, -0.15, 0] } },
    { p: 1, pose: { shR: [-0.5, 0, -0.2], elR: [-1.4, 0, 0], shL: [-0.5, 0, 0.2], elL: [-1.4, 0, 0] } },
  ],
  // ---------- Magnétisme ----------
  // Lévitation : bras tendus vers l'objet au-dessus, doigts écartés.
  magnetLift: [
    { p: 0, pose: { spine: [-0.1, 0, 0], shR: [-0.6, 0, -0.5], elR: [-0.8, 0, 0], shL: [-0.6, 0, 0.5], elL: [-0.8, 0, 0] } },
    { p: 0.35, pose: { spine: [-0.25, 0, 0], head: [-0.35, 0, 0], shR: [-2.5, 0.2, -0.35], elR: [-0.25, 0, 0], shL: [-2.5, -0.2, 0.35], elL: [-0.25, 0, 0] } },
    { p: 1, pose: { spine: [-0.2, 0, 0], head: [-0.3, 0, 0], shR: [-2.4, 0.2, -0.4], elR: [-0.3, 0, 0], shL: [-2.4, -0.2, 0.4], elL: [-0.3, 0, 0] } },
  ],
  magnetHold: [
    { p: 0, pose: { spine: [-0.15, 0, 0], head: [-0.25, 0, 0], shR: [-2.3, 0.2, -0.45], elR: [-0.35, 0, 0], shL: [-2.3, -0.2, 0.45], elL: [-0.35, 0, 0] } },
    { p: 1, pose: { spine: [-0.15, 0, 0], head: [-0.25, 0, 0], shR: [-2.3, 0.2, -0.45], elR: [-0.35, 0, 0], shL: [-2.3, -0.2, 0.45], elL: [-0.35, 0, 0] } },
  ],
  // Lancer : les deux bras rabattus vers l'avant d'un coup.
  magnetThrow: [
    { p: 0, pose: { spine: [-0.3, 0, 0], shR: [-2.8, 0, -0.3], elR: [-0.4, 0, 0], shL: [-2.8, 0, 0.3], elL: [-0.4, 0, 0] } },
    { p: 0.3, pose: { spine: [0.35, 0, 0], shR: [-1.3, 0, -0.1], elR: [0, 0, 0], shL: [-1.3, 0, 0.1], elL: [0, 0, 0], hipL: [-0.6, 0, 0], knL: [0.5, 0, 0], drop: [0, -0.15, 0] } },
    { p: 1, pose: {} },
  ],
  // ---------- Vie quotidienne ----------
  // Assis (chaise ~45 cm) : pose fixe, mains sur la table.
  sit: [
    { p: 0, pose: { spine: [0.12, 0, 0], head: [0.1, 0, 0], hipR: [-1.5, 0.08, 0], knR: [1.5, 0, 0], hipL: [-1.5, -0.08, 0], knL: [1.5, 0, 0], shR: [-0.7, 0, -0.1], elR: [-1.0, 0, 0], shL: [-0.7, 0, 0.1], elL: [-1.0, 0, 0], drop: [0, -0.47, 0] } },
    { p: 1, pose: { spine: [0.12, 0, 0], head: [0.1, 0, 0], hipR: [-1.5, 0.08, 0], knR: [1.5, 0, 0], hipL: [-1.5, -0.08, 0], knL: [1.5, 0, 0], shR: [-0.7, 0, -0.1], elR: [-1.0, 0, 0], shL: [-0.7, 0, 0.1], elL: [-1.0, 0, 0], drop: [0, -0.47, 0] } },
  ],
  // Discussion : gestes de la main droite, tête qui accompagne.
  talk: [
    { p: 0, pose: {} },
    { p: 0.2, pose: { shR: [-0.7, 0.3, -0.2], elR: [-1.5, 0, 0], head: [0.05, 0.15, 0] } },
    { p: 0.45, pose: { shR: [-0.5, 0.4, -0.35], elR: [-1.2, 0, 0], shL: [-0.3, 0, 0.2], elL: [-0.9, 0, 0], head: [-0.05, -0.1, 0.05] } },
    { p: 0.7, pose: { shR: [-0.8, 0.2, -0.15], elR: [-1.6, 0, 0], head: [0.08, 0.1, 0] } },
    { p: 1, pose: {} },
  ],
  wave: [
    { p: 0, pose: {} },
    { p: 0.2, pose: { shR: [-2.6, 0, -0.5], elR: [-0.6, 0, 0.3], head: [-0.1, 0, 0.1] } },
    { p: 0.4, pose: { shR: [-2.6, 0, -0.7], elR: [-0.6, 0, -0.3], head: [-0.1, 0, 0.1] } },
    { p: 0.6, pose: { shR: [-2.6, 0, -0.5], elR: [-0.6, 0, 0.3], head: [-0.1, 0, 0.1] } },
    { p: 0.8, pose: { shR: [-2.6, 0, -0.7], elR: [-0.6, 0, -0.3], head: [-0.1, 0, 0.1] } },
    { p: 1, pose: {} },
  ],
  // Gêné / timide : main derrière la tête, regard au sol.
  shy: [
    { p: 0, pose: {} },
    { p: 0.25, pose: { shL: [-2.7, 0.4, 0.6], elL: [-1.9, 0, 0], head: [0.35, -0.3, 0], spine: [0.05, 0.15, 0] } },
    { p: 0.8, pose: { shL: [-2.7, 0.4, 0.6], elL: [-1.9, 0, 0], head: [0.35, -0.3, 0], spine: [0.05, 0.15, 0] } },
    { p: 1, pose: {} },
  ],
  hug: [
    { p: 0, pose: {} },
    { p: 0.25, pose: { shR: [-1.4, -0.6, -0.2], elR: [-1.3, 0, 0], shL: [-1.4, 0.6, 0.2], elL: [-1.3, 0, 0], head: [0.15, 0.2, 0], spine: [0.15, 0, 0] } },
    { p: 0.8, pose: { shR: [-1.4, -0.6, -0.2], elR: [-1.3, 0, 0], shL: [-1.4, 0.6, 0.2], elL: [-1.3, 0, 0], head: [0.15, 0.2, 0], spine: [0.15, 0, 0] } },
    { p: 1, pose: {} },
  ],
  // ---------- Forme Abysse ----------
  clawR: [
    { p: 0, pose: { spine: [0.15, 0.7, 0], shR: [-2.4, 0.4, -0.9], elR: [-0.6, 0, 0], shL: [-0.5, 0, 0.6], elL: [-1.2, 0, 0], drop: [0, -0.15, 0] } },
    { p: 0.32, pose: { spine: [0.35, -0.8, 0], shR: [-0.6, -0.5, 0.5], elR: [-0.2, 0, 0], shL: [-0.8, 0, 0.6], elL: [-1.4, 0, 0], hipL: [-0.7, 0, 0], knL: [0.6, 0, 0], drop: [0, -0.3, 0] } },
    { p: 1, pose: { spine: [0.25, 0, 0], shR: [-0.8, 0, -0.5], elR: [-1.0, 0, 0], shL: [-0.8, 0, 0.5], elL: [-1.0, 0, 0], drop: [0, -0.15, 0] } },
  ],
  clawL: [
    { p: 0, pose: { spine: [0.15, -0.7, 0], shL: [-2.4, -0.4, 0.9], elL: [-0.6, 0, 0], shR: [-0.5, 0, -0.6], elR: [-1.2, 0, 0], drop: [0, -0.15, 0] } },
    { p: 0.32, pose: { spine: [0.35, 0.8, 0], shL: [-0.6, 0.5, -0.5], elL: [-0.2, 0, 0], shR: [-0.8, 0, -0.6], elR: [-1.4, 0, 0], hipR: [-0.7, 0, 0], knR: [0.6, 0, 0], drop: [0, -0.3, 0] } },
    { p: 1, pose: { spine: [0.25, 0, 0], shR: [-0.8, 0, -0.5], elR: [-1.0, 0, 0], shL: [-0.8, 0, 0.5], elL: [-1.0, 0, 0], drop: [0, -0.15, 0] } },
  ],
  // Double frappe au sol des deux poings.
  smash: [
    { p: 0, pose: { spine: [-0.4, 0, 0], head: [-0.3, 0, 0], shR: [-3.0, 0, -0.3], elR: [-0.5, 0, 0], shL: [-3.0, 0, 0.3], elL: [-0.5, 0, 0], drop: [0, 0.05, 0] } },
    { p: 0.4, pose: { spine: [0.9, 0, 0], head: [-0.5, 0, 0], shR: [-1.2, 0, -0.2], elR: [-0.1, 0, 0], shL: [-1.2, 0, 0.2], elL: [-0.1, 0, 0], hipR: [-1.1, 0, 0], knR: [1.3, 0, 0], hipL: [-0.4, 0, 0], knL: [1.5, 0, 0], drop: [0, -0.5, 0] } },
    { p: 1, pose: { spine: [0.25, 0, 0], shR: [-0.8, 0, -0.5], elR: [-1.0, 0, 0], shL: [-0.8, 0, 0.5], elL: [-1.0, 0, 0], drop: [0, -0.15, 0] } },
  ],
  // Tentacules projetées : bras ouverts puis tirés vers soi.
  lash: [
    { p: 0, pose: { spine: [0.2, 0, 0], shR: [-1.6, 0, -0.2], elR: [0, 0, 0], shL: [-1.6, 0, 0.2], elL: [0, 0, 0] } },
    { p: 0.45, pose: { spine: [0.3, 0, 0], shR: [-1.6, 0, -0.9], elR: [-0.1, 0, 0], shL: [-1.6, 0, 0.9], elL: [-0.1, 0, 0], drop: [0, -0.2, 0] } },
    { p: 1, pose: { spine: [-0.1, 0, 0], shR: [-0.6, 0, -0.4], elR: [-1.8, 0, 0], shL: [-0.6, 0, 0.4], elL: [-1.8, 0, 0] } },
  ],
  roar: [
    { p: 0, pose: { spine: [0.4, 0, 0], shR: [-0.5, 0, -0.4], shL: [-0.5, 0, 0.4], elR: [-1.5, 0, 0], elL: [-1.5, 0, 0], drop: [0, -0.2, 0] } },
    { p: 0.3, pose: { spine: [-0.45, 0, 0], head: [-0.6, 0, 0], shR: [-0.6, 0, -1.4], elR: [-0.3, 0, 0], shL: [-0.6, 0, 1.4], elL: [-0.3, 0, 0], hipR: [-0.3, 0, 0.2], hipL: [-0.3, 0, -0.2], knR: [0.4, 0, 0], knL: [0.4, 0, 0], drop: [0, -0.2, 0] } },
    { p: 0.8, pose: { spine: [-0.45, 0, 0], head: [-0.6, 0, 0], shR: [-0.6, 0, -1.4], elR: [-0.3, 0, 0], shL: [-0.6, 0, 1.4], elL: [-0.3, 0, 0], hipR: [-0.3, 0, 0.2], hipL: [-0.3, 0, -0.2], knR: [0.4, 0, 0], knL: [0.4, 0, 0], drop: [0, -0.2, 0] } },
    { p: 1, pose: { spine: [0.25, 0, 0], shR: [-0.8, 0, -0.5], elR: [-1.0, 0, 0], shL: [-0.8, 0, 0.5], elL: [-1.0, 0, 0], drop: [0, -0.15, 0] } },
  ],
  // Infection : la substance gagne le corps — main sur la poitrine, Noa se plie,
  // se débat, puis se cambre, bras écartés, avant de gonfler.
  infect: [
    { p: 0, pose: {} },
    { p: 0.12, pose: { spine: [0.25, 0, 0], head: [0.3, 0, 0], shR: [-1.3, -0.6, 0.4], elR: [-1.9, 0, 0], shL: [-0.3, 0, 0.3], elL: [-0.6, 0, 0], drop: [0, -0.05, 0] } },
    { p: 0.3, pose: { spine: [0.75, 0.2, 0.1], head: [0.4, 0.2, 0], shR: [-1.4, -0.6, 0.5], elR: [-2.1, 0, 0], shL: [-1.0, 0.3, -0.2], elL: [-1.7, 0, 0], hipR: [-0.6, 0, 0], knR: [1.0, 0, 0], hipL: [-0.4, 0, 0], knL: [0.9, 0, 0], drop: [0, -0.3, 0] } },
    { p: 0.45, pose: { spine: [0.55, -0.3, -0.15], head: [0.1, -0.4, 0], shR: [-0.6, 0, -1.0], elR: [-0.4, 0, 0], shL: [-1.6, 0.4, 0.2], elL: [-1.9, 0, 0], hipR: [-0.5, 0, 0], knR: [0.9, 0, 0], hipL: [-0.7, 0, 0], knL: [1.2, 0, 0], drop: [0, -0.32, 0] } },
    { p: 0.62, pose: { spine: [0.8, 0.25, 0.15], head: [0.6, 0.3, 0], shR: [-1.2, -0.4, 0.3], elR: [-2.2, 0, 0], shL: [-1.2, 0.4, -0.3], elL: [-2.2, 0, 0], hipR: [-0.9, 0, 0], knR: [1.5, 0, 0], hipL: [-0.9, 0, 0], knL: [1.5, 0, 0], drop: [0, -0.45, 0] } },
    { p: 0.82, pose: { spine: [-0.55, 0, 0], head: [-0.75, 0, 0], shR: [-0.3, 0, -1.55], elR: [-0.15, 0, 0], shL: [-0.3, 0, 1.55], elL: [-0.15, 0, 0], hipR: [-0.2, 0, 0.15], knR: [0.3, 0, 0], hipL: [-0.2, 0, -0.15], knL: [0.3, 0, 0], drop: [0, -0.08, 0] } },
    { p: 1, pose: { spine: [0.6, 0, 0], head: [0.2, 0, 0], shR: [-0.7, 0, -0.9], elR: [-1.2, 0, 0], shL: [-0.7, 0, 0.9], elL: [-1.2, 0, 0], hipR: [-0.8, 0, 0], knR: [1.2, 0, 0], hipL: [-0.8, 0, 0], knL: [1.2, 0, 0], drop: [0, -0.35, 0] } },
  ],
  // Transformation : recroquevillé, puis explose vers l'extérieur.
  transform: [
    { p: 0, pose: {} },
    { p: 0.35, pose: { spine: [0.8, 0, 0], head: [0.5, 0, 0], shR: [-1.2, 0.5, 0.3], elR: [-2.0, 0, 0], shL: [-1.2, -0.5, -0.3], elL: [-2.0, 0, 0], hipR: [-0.8, 0, 0], knR: [1.4, 0, 0], hipL: [-0.8, 0, 0], knL: [1.4, 0, 0], drop: [0, -0.45, 0] } },
    { p: 0.7, pose: { spine: [-0.5, 0, 0], head: [-0.7, 0, 0], shR: [-0.4, 0, -1.5], elR: [-0.2, 0, 0], shL: [-0.4, 0, 1.5], elL: [-0.2, 0, 0], drop: [0, -0.1, 0] } },
    { p: 1, pose: { spine: [0.25, 0, 0], shR: [-0.8, 0, -0.5], elR: [-1.0, 0, 0], shL: [-0.8, 0, 0.5], elL: [-1.0, 0, 0], drop: [0, -0.15, 0] } },
  ],
};

// Palettes : héros + passants.
export const PALETTES = {
  // Police de Vesper : uniforme bleu nuit, casquette, insigne doré.
  police: { skin: '#d9a07a', hair: '#2b1d16', hoodie: '#24407a', hoodie2: '#162a52', pants: '#1d2440', shoe: '#1d1d24', sole: '#1d1d24', bag: null, hairStyle: 'short', cap: '#162a52', emblem: '#ffcd20' },
  policeB: { skin: '#7a4f32', hair: '#1a1210', hoodie: '#24407a', hoodie2: '#162a52', pants: '#1d2440', shoe: '#1d1d24', sole: '#1d1d24', bag: null, hairStyle: 'bob', cap: '#162a52', emblem: '#ffcd20' },
  // Héros de Vesper (créations originales) : combinaison, masque, cape, emblème.
  volt: { skin: '#e8b48a', hair: '#e8d6a0', hoodie: '#ffcd20', hoodie2: '#1d1d24', pants: '#1d1d24', shoe: '#ffcd20', sole: '#1d1d24', bag: null, hairStyle: 'messy', mask: '#1d1d24', emblem: '#7fe3ff' },
  brasier: { skin: '#a8714a', hair: '#1a1210', hoodie: '#e8553f', hoodie2: '#ffcd20', pants: '#5a1a14', shoe: '#2b1d16', sole: '#ffb347', bag: null, hairStyle: 'short', mask: '#2b1d16', cape: '#ffb347', emblem: '#ffcd20' },
  rempart: { skin: '#f2c6a0', hair: '#c9563f', hoodie: '#3f6fd1', hoodie2: '#dfe6f5', pants: '#1d2b5a', shoe: '#dfe6f5', sole: '#1d2b5a', bag: null, hairStyle: 'bob', cape: '#1d2b5a', emblem: '#ffffff' },
  spectre: { skin: '#c98b5e', hair: '#1a1210', hoodie: '#2b2f3a', hoodie2: '#7a5cff', pants: '#1d1d24', shoe: '#1d1d24', sole: '#7a5cff', bag: null, hairStyle: 'ponytail', mask: '#7a5cff', cape: '#3a1d6e', emblem: '#b48cff' },
  noa: { skin: '#e8b48a', hair: '#2b1d16', hoodie: '#2f8f9f', hoodie2: '#246f7c', pants: '#3a5ba8', shoe: '#f2efe6', sole: '#e8553f', bag: '#ff9a3d', hairStyle: 'messy' },
  ines: { skin: '#a8714a', hair: '#1a1210', hoodie: '#f2b84b', hoodie2: '#d99a2e', pants: '#2b2b4a', shoe: '#f2efe6', sole: '#7b4ad6', bag: null, hairStyle: 'ponytail' },
  malik: { skin: '#7a4f32', hair: '#1a1210', hoodie: '#e8553f', hoodie2: '#b93e2c', pants: '#2b2b4a', shoe: '#1d1d24', sole: '#f2efe6', bag: '#3a3a4a', hairStyle: 'short' },
  camille: { skin: '#f2c6a0', hair: '#c9563f', hoodie: '#8f7ad8', hoodie2: '#6f5ab8', pants: '#1d1d24', shoe: '#f2efe6', sole: '#ff9cf0', bag: null, hairStyle: 'bob' },
  theo: { skin: '#e8b48a', hair: '#e8d6a0', hoodie: '#3a3a4a', hoodie2: '#2a2a36', pants: '#3a5ba8', shoe: '#c9563f', sole: '#f2efe6', bag: '#c9563f', hairStyle: 'short' },
  delcourt: { skin: '#e8b48a', hair: '#8a8a9a', hoodie: '#6a5a4a', hoodie2: '#4a3e34', pants: '#3a3448', shoe: '#2b1d16', sole: '#2b1d16', bag: null, hairStyle: 'short' },
  jordan: { skin: '#d9a07a', hair: '#3a2416', hoodie: '#c8323c', hoodie2: '#f2efe6', pants: '#1d1d24', shoe: '#f2efe6', sole: '#c8323c', bag: null, hairStyle: 'short' },
  ferrand: { skin: '#8a5a3c', hair: '#1a1210', hoodie: '#2f6f6a', hoodie2: '#24524e', pants: '#3a3448', shoe: '#2b1d16', sole: '#2b1d16', bag: null, hairStyle: 'bob' },
  mara: { skin: '#c98b5e', hair: '#2b1d16', hoodie: '#2b2050', hoodie2: '#5fe3ff', pants: '#1d1d24', shoe: '#1d1d24', sole: '#5fe3ff', bag: null, hairStyle: 'bob' },
  // Forme Abysse : la substance noire recouvre Noa (veines cyan magnétiques).
  umbra: { skin: '#17111f', hair: '#17111f', hoodie: '#1d1530', hoodie2: '#0d0915', pants: '#140f1f', shoe: '#120c1a', sole: '#5fe3ff', bag: null, hairStyle: 'none', variant: 'umbra' },
};

export class HeroModel {
  // lite : version allégée pour les passants (moins de polygones, couleurs dans
  // les sommets → un seul appel de dessin par articulation).
  constructor(palette = PALETTES.noa, { backpack = true, rim = '#9fd8ff', lite = false } = {}) {
    this.lite = lite;
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.tilt.position.y = HIP_Y;
    this.root.add(this.tilt);
    this.joints = {};
    this.time = 0;
    this.current = {};
    this.palette = palette;
    this.umbra = palette.variant === 'umbra';
    // Matériaux propres à chaque personnage (l'équipement recolore ceux de Noa).
    const R = this.umbra ? { rim: '#7a5cff', rimStrength: 1.1, shared: false } : { rim, rimStrength: 0.55, shared: false };
    const shade = (c, f) => '#' + new THREE.Color(c).multiplyScalar(f).getHexString();
    this.mats = {
      skin: toon(palette.skin, R),
      skin2: toon(shade(palette.skin, 0.82), R),
      hair: toon(palette.hair, R),
      hoodie: toon(palette.hoodie, R),
      hoodie2: toon(palette.hoodie2, R),
      pants: toon(palette.pants, R),
      shoe: toon(palette.shoe, R),
      sole: toon(palette.sole, R),
      bag: toon(palette.bag || '#555', R),
      white: toon('#fbf8ff', {}),
      iris: toon(palette.eye || '#6b4423', {}),
      pupil: toon('#1d0f3a', {}),
      mouth: toon('#8a3440', {}),
      lip: toon(shade(palette.skin, 0.78), {}),
      phone: toon('#1d0f3a', { emissive: '#7fe3ff', emissiveIntensity: 0, shared: false }),
      vein: toon('#5fe3ff', { emissive: '#5fe3ff', emissiveIntensity: 1.8, shared: false }),
      tooth: toon('#f4f0ff', { rim: '#ffffff', shared: false }),
      maw: toon('#2a0820', { shared: false }),
    };
    if (this.umbra) {
      // Substance de l'Abysse : noir liquide et brillant (vernis), liseré violet.
      const gloss = (c) => addRim(new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.6, sheenColor: new THREE.Color('#5a3aa8') }), '#8a6cff', 2.2, 1.0);
      this.mats.skin = this.mats.hoodie = this.mats.pants = this.mats.shoe = this.mats.hair = gloss('#110b1a');
      this.mats.hoodie2 = gloss('#06040b');
    }
    setDetail(lite ? 0.45 : 1);
    this.#build(backpack && palette.bag);
    setDetail(1);
    if (lite) this.#vertexColors();
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    // Fusion des pièces fixes de chaque articulation (≈ 3x moins d'appels de dessin).
    bakeJoints(this.root, new Set([this.phone, this.mouth, this.ponytail, this.bagFlap, this.cape, ...(this.brows || [])].filter(Boolean)));
  }

  // Infection par la substance de l'Abysse : un shader recouvre peu à peu le
  // corps de noir brillant à partir d'un point (la poitrine), avec un front de
  // veines cyan qui avance. setCorruption(0..1).
  enableCorruption() {
    if (this.corr) return;
    this.corr = { k: { value: 0 }, origin: { value: new THREE.Vector3() }, t: { value: 0 } };
    const U = this.corr;
    for (const m of new Set(Object.values(this.mats))) {
      if (m === this.mats.phone || m === this.mats.vein) continue;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, r) => {
        prev?.call(m, shader, r);
        shader.uniforms.uCorr = U.k;
        shader.uniforms.uCorrO = U.origin;
        shader.uniforms.uCorrT = U.t;
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', 'varying vec3 vCorrW;\nvoid main() {')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvCorrW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'varying vec3 vCorrW; uniform float uCorr; uniform vec3 uCorrO; uniform float uCorrT;\nvoid main() {')
          .replace(
            '#include <opaque_fragment>',
            `float cN = sin(vCorrW.x * 23.0 + uCorrT * 3.0) * sin(vCorrW.y * 17.0 - uCorrT * 2.3) * sin(vCorrW.z * 21.0 + uCorrT) * 0.16
                      + sin(vCorrW.y * 47.0 + vCorrW.x * 31.0) * 0.05;
             float cFront = uCorr * 1.9 - distance(vCorrW, uCorrO) + cN;
             float cCov = smoothstep(0.0, 0.05, cFront);
             float cEdge = smoothstep(-0.02, 0.03, cFront) * (1.0 - smoothstep(0.03, 0.16, cFront));
             float cFr = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 3.0);
             // Noir liquide : reflet spéculaire net + liseré violet sur les bords.
             float cSp = pow(max(dot(normalize(normal), normalize(vec3(0.3, 0.8, 0.5))), 0.0), 24.0);
             vec3 cGoo = vec3(0.02, 0.016, 0.035) + vec3(0.7, 0.75, 0.9) * cSp * 0.6 + vec3(0.32, 0.2, 0.75) * cFr * 0.7;
             outgoingLight = mix(outgoingLight, cGoo, cCov) + vec3(0.37, 0.89, 1.0) * cEdge * 2.4 * step(0.001, uCorr);
             #include <opaque_fragment>`,
          );
      };
      m.customProgramCacheKey = () => 'rim-corr';
      m.needsUpdate = true;
    }
  }

  setCorruption(k, t = 0) {
    if (!this.corr) return;
    this.corr.k.value = k;
    this.corr.t.value = t;
    this.joints.spine.getWorldPosition(this.corr.origin.value);
    this.corr.origin.value.y += 0.35 * this.root.scale.y;
  }

  // Remplace les matériaux unis par un matériau commun à couleurs de sommets.
  #vertexColors() {
    const keep = new Set([this.mats.phone, this.mats.vein]);
    const shared = (HeroModel.liteMat ||= (() => {
      const m = toon('#ffffff', { rim: '#ffd9a8', rimStrength: 0.55, shared: false });
      m.vertexColors = true;
      return m;
    })());
    const c = new THREE.Color();
    this.root.traverse((o) => {
      if (!o.isMesh || keep.has(o.material) || o === this.phone) return;
      c.copy(o.material.color);
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      o.geometry = g;
      o.material = shared;
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

  #build(withBag) {
    const M = this.mats;
    const P = this.palette;
    const U = this.umbra;
    const k = U ? 1.28 : 1; // carrure de la Forme Abysse
    const hips = this.#pivot('hips', this.tilt, 0, 0, 0);
    // Bassin : jean galbé + ceinture
    this.#mesh(lathe('pelvis', [[0.05, 0.1], [0.14, 0.08], [0.165, 0.02], [0.16, -0.05], [0.12, -0.1], [0.02, -0.12]], { sz: 0.8 }), M.pants, hips);
    if (!U) this.#mesh(new THREE.TorusGeometry(0.162, 0.012, 6, 24), M.hoodie2, hips, 0, 0.075, 0, Math.PI / 2).scale.set(1, 0.8, 1);
    const spine = this.#pivot('spine', hips, 0, 0.1, 0);
    // Buste : sweat ample (ou torse en V de la Forme Abysse)
    const torsoProfile = U
      ? [[0.07, 0.57], [0.16, 0.54], [0.235, 0.47], [0.245, 0.37], [0.205, 0.23], [0.16, 0.11], [0.15, 0.01], [0.12, -0.05], [0.02, -0.06]]
      : [[0.06, 0.55], [0.125, 0.525], [0.178, 0.47], [0.2, 0.4], [0.198, 0.3], [0.182, 0.18], [0.172, 0.07], [0.176, -0.01], [0.12, -0.06], [0.02, -0.07]];
    this.#mesh(lathe(U ? 'torsoU' : 'torso', torsoProfile, { sx: U ? 1.2 : 1.15, sz: U ? 0.78 : 0.74, seg: 18 }), M.hoodie, spine);
    if (!U) {
      // Bord-côte, poche kangourou, capuche repliée, cordons
      this.#mesh(new THREE.TorusGeometry(0.175, 0.022, 6, 24), M.hoodie2, spine, 0, 0.0, 0, Math.PI / 2).scale.set(1.15, 0.74, 1);
      this.#mesh(blob(0.115, 0.05, 0.022), M.hoodie2, spine, 0, 0.13, 0.122, -0.12);
      const hood = this.#mesh(new THREE.TorusGeometry(0.105, 0.048, 8, 20), M.hoodie2, spine, 0, 0.5, -0.07, Math.PI / 2 - 0.55);
      hood.scale.set(1.25, 1, 1);
      for (const sx of [-1, 1]) {
        this.#mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 5), M.white, spine, sx * 0.045, 0.4, 0.15, 0.12);
        this.#mesh(blob(0.01, 0.014, 0.01, 6), M.white, spine, sx * 0.045, 0.32, 0.158);
      }
    }
    // Sac à dos
    if (withBag) {
      const bag = this.#mesh(lathe('bag', [[0.02, 0.17], [0.11, 0.15], [0.135, 0.06], [0.135, -0.08], [0.11, -0.15], [0.02, -0.16]], { sx: 1.25, sz: 0.62 }), M.bag, spine, 0, 0.3, -0.2);
      this.bagFlap = this.#mesh(blob(0.1, 0.06, 0.03), M.hoodie2, spine, 0, 0.24, -0.29);
      for (const sx of [-1, 1]) this.#mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 12, Math.PI), M.bag, spine, sx * 0.12, 0.38, -0.05, 0, Math.PI / 2, 0);
      this.backpack = bag;
    }

    // Cou + tête
    const head = this.#pivot('head', spine, 0, 0.56, 0.01);
    this.#mesh(lathe('neck', [[0.042, 0.1], [0.046, 0.03], [0.052, -0.04], [0.06, -0.06]]), M.skin, head, 0, 0, 0);
    const face = new THREE.Group();
    face.position.y = 0.16;
    face.scale.setScalar(U ? 1.12 : 1.16);
    head.add(face);
    this.face = face;
    this.#mesh(headGeometry(0.12, U ? 0.18 : 0.3), M.skin, face);
    if (!U) this.#humanFace(face);
    else this.#umbraFace(face);
    if (!U) this.#hair(face, P.hairStyle);
    if (!U) this.#accessories(spine, face, P);

    // Bras : manches galbées, poignets, mains à cinq doigts
    const arm = U
      ? { up: [[0.0001, 0.08], [0.08, 0.07], [0.105, 0.02], [0.1, -0.08], [0.085, -0.2], [0.075, -0.3], [0.072, -0.32]], fore: [[0.075, 0.03], [0.08, -0.04], [0.072, -0.13], [0.06, -0.2], [0.0001, -0.23]] }
      : { up: [[0.0001, 0.07], [0.062, 0.06], [0.08, 0.02], [0.075, -0.06], [0.066, -0.16], [0.06, -0.26], [0.058, -0.31]], fore: [[0.058, 0.03], [0.058, -0.02], [0.054, -0.1], [0.05, -0.17], [0.052, -0.2], [0.0001, -0.215]] };
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const sh = this.#pivot('sh' + side, spine, sx * 0.24, 0.43, 0);
      this.#mesh(lathe(U ? 'armUpU' : 'armUp', arm.up), M.hoodie, sh);
      const el = this.#pivot('el' + side, sh, 0, -0.3, 0);
      this.#mesh(lathe(U ? 'armForeU' : 'armFore', arm.fore), M.hoodie, el);
      if (!U) {
        this.#mesh(new THREE.TorusGeometry(0.047, 0.014, 6, 16), M.hoodie2, el, 0, -0.2, 0, Math.PI / 2);
        this.#mesh(lathe('wrist', [[0.03, -0.19], [0.029, -0.235], [0.0001, -0.245]]), M.skin, el);
      }
      const hand = this.#hand(el, sx, U ? 1.2 : 1);
      this.joints['fist' + side] = hand;
      if (side === 'R') {
        // Téléphone (visible pendant l'animation « phone »)
        this.phone = this.#mesh(new THREE.BoxGeometry(0.07, 0.13, 0.012), M.phone, el, 0, -0.3, 0.06);
        this.phone.visible = false;
      }
    }

    // Jambes : jean galbé (genou, mollet, ourlet) + baskets
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const hip = this.#pivot('hip' + side, hips, sx * 0.09, -0.02, 0);
      this.#mesh(lathe(U ? 'thighU' : 'thigh', [[0.0001, 0.06], [0.07 * k, 0.04], [0.088 * k, -0.02], [0.083 * k, -0.15], [0.072 * k, -0.3], [0.065 * k, -0.4], [0.064 * k, -0.44]]), M.pants, hip);
      const kn = this.#pivot('kn' + side, hip, 0, -0.41, 0);
      this.#mesh(lathe(U ? 'calfU' : 'calf', [[0.064 * k, 0.03], [0.064 * k, -0.02], [0.067 * k, -0.12], [0.057 * k, -0.26], [0.054 * k, -0.33], [0.062 * k, -0.37], [0.0001, -0.39]]), M.pants, kn);
      // Cheville : le pied déroule du talon à la pointe.
      const an = this.#pivot('an' + side, kn, 0, -0.4, 0);
      this.#mesh(lathe('collar', [[0.05, 0.01], [0.056, -0.03], [0.06, -0.05]]), M.shoe, an);
      this.#mesh(shoeUpper(0.068, 0.135, 0.07), M.shoe, an, 0, -0.052, 0.045);
      this.#mesh(soleGeometry(0.066, 0.26, 0.026), M.sole, an, 0, -0.056, 0);
      if (!U && !this.lite) {
        // Bout renforcé et lacets
        this.#mesh(blob(0.05, 0.026, 0.04), M.sole, an, 0, -0.05, 0.15);
        for (let i = 0; i < 3; i++) this.#mesh(new THREE.BoxGeometry(0.05, 0.006, 0.01), M.white, an, 0, -0.0 - i * 0.012, 0.055 + i * 0.026, -0.5 - i * 0.12);
      }
    }
    if (U) this.#umbraBody(spine);
  }

  // Main : paume, quatre doigts légèrement repliés vers l'intérieur, pouce en avant.
  #hand(el, sx, k = 1) {
    const M = this.mats;
    const g = this.#pivot('hand' + (sx < 0 ? 'R' : 'L'), el, 0, -0.245, 0.005);
    g.scale.setScalar(k);
    const inward = -sx; // vers le corps
    this.#mesh(blob(0.022, 0.04, 0.036), M.skin, g, 0, -0.032, 0);
    if (this.lite) {
      // Passant : moufle (doigts joints) + pouce.
      this.#mesh(blob(0.018, 0.035, 0.034), M.skin, g, inward * 0.006, -0.07, 0, 0, 0, inward * 0.3);
      this.#mesh(blob(0.01, 0.022, 0.01), M.skin, g, inward * 0.012, -0.04, 0.034, -0.6, 0, 0);
      return g;
    }
    const lens = [0.036, 0.046, 0.049, 0.044];
    [-0.024, -0.008, 0.008, 0.024].forEach((z, i) => {
      const f = this.#mesh(finger(lens[3 - i], 0.0095), M.skin, g, inward * 0.004, -0.064, z);
      f.rotation.set(0, 0, inward * 0.32);
    });
    const th = this.#mesh(finger(0.034, 0.011), M.skin, g, inward * 0.012, -0.022, 0.034);
    th.rotation.set(-0.7, 0, inward * 0.45);
    return g;
  }

  // Visage : yeux en amande (iris, pupille, reflet), cils, sourcils, nez, bouche, oreilles.
  #humanFace(face) {
    const M = this.mats;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.043, 0.014, 0.097);
      eye.rotation.y = sx * 0.28;
      face.add(eye);
      this.#mesh(eyeWhite(0.021), M.white, eye);
      this.#mesh(blob(0.0125, 0.0135, 0.006, 10), M.iris, eye, 0, -0.001, 0.0085);
      this.#mesh(blob(0.0062, 0.0068, 0.004, 8), M.pupil, eye, 0, -0.001, 0.0118);
      if (!this.lite) {
        this.#mesh(blob(0.003, 0.003, 0.002, 6), M.white, eye, sx * -0.004, 0.004, 0.0138);
        // Cils (trait sombre au-dessus de l'œil)
        this.#mesh(arc(0.026, 0.0035, 2.0), M.pupil, eye, 0, -0.008, 0.002, 0, 0, Math.PI / 2 - 1.0);
      }
      // Sourcil (groupe orientable pour les expressions)
      const brow = new THREE.Group();
      brow.position.set(sx * 0.044, 0.048, 0.104);
      brow.rotation.y = sx * 0.25;
      face.add(brow);
      this.#mesh(arc(0.032, 0.0055, 1.5), M.hair, brow, 0, -0.026, 0, 0, 0, Math.PI / 2 - 0.75);
      (this.brows ||= []).push(brow);
      // Oreilles
      this.#mesh(blob(0.012, 0.026, 0.02, 10), M.skin, face, sx * 0.108, -0.004, -0.006, 0, sx * -0.3, 0);
      this.#mesh(arc(0.014, 0.004, Math.PI * 1.4), M.skin2, face, sx * 0.116, -0.002, -0.004, 0, sx * Math.PI / 2, -0.3);
    }
    // Nez : arête + bout arrondi
    this.#mesh(blob(0.011, 0.024, 0.012), M.skin, face, 0, -0.008, 0.115, -0.25);
    this.#mesh(blob(0.014, 0.011, 0.012), M.skin, face, 0, -0.026, 0.121);
    // Bouche : lèvre supérieure (sourire, sert aux expressions) + lèvre inférieure
    this.mouth = this.#mesh(arc(0.017, 0.0045, Math.PI), M.mouth, face, 0, -0.049, 0.106, 0, 0, Math.PI);
    this.#mesh(blob(0.012, 0.0045, 0.006), M.lip, face, 0, -0.068, 0.102);
  }

  // Casquette (police), masque, cape et emblème lumineux (héros).
  #accessories(spine, face, P) {
    const M = this.mats;
    if (P.cap) {
      const cm = toon(P.cap, { rim: '#9fd8ff', rimStrength: 0.5, shared: false });
      this.#mesh(new THREE.CylinderGeometry(0.128, 0.134, 0.07, 18), cm, face, 0, 0.1, -0.005);
      this.#mesh(new THREE.SphereGeometry(0.128, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), cm, face, 0, 0.135, -0.005).scale.y = 0.45;
      this.#mesh(blob(0.08, 0.008, 0.06), cm, face, 0, 0.07, 0.115, -0.15);
      this.#mesh(blob(0.016, 0.018, 0.006), toon('#ffcd20', { emissive: '#ffcd20', emissiveIntensity: 0.4 }), face, 0, 0.11, 0.128);
    }
    if (P.mask) {
      const mm = toon(P.mask, { shared: false });
      this.#mesh(blob(0.112, 0.03, 0.06), mm, face, 0, 0.016, 0.07);
    }
    if (P.cape) {
      const cp = toon(P.cape, { rim: '#ffffff', rimStrength: 0.4, shared: false, side: THREE.DoubleSide });
      const g = new THREE.CylinderGeometry(0.2, 0.36, 1.05, 16, 4, true, Math.PI * 0.6, Math.PI * 0.8);
      g.translate(0, -0.52, 0);
      this.cape = this.#mesh(g, cp, spine, 0, 0.52, -0.02);
      this.cape.scale.set(1.1, 1, 0.75);
    }
    if (P.emblem) {
      const em = toon(P.emblem, { emissive: P.emblem, emissiveIntensity: 1.2, shared: false });
      const e = this.#mesh(new THREE.OctahedronGeometry(0.045, 0), em, spine, P.cap ? 0.09 : 0, P.cap ? 0.42 : 0.36, 0.15);
      e.scale.set(1, P.cap ? 1 : 1.3, 0.35);
    }
  }

  // Cheveux : chevelure sculptée selon la coupe + quelques mèches de style.
  #hair(face, style) {
    if (style === 'none') return;
    const M = this.mats;
    const HAIR = {
      messy: { front: 1.12, side: 1.5, back: 2.05, jag: 0.22, tufts: 9, lump: 0.1, flare: 0.06 },
      short: { front: 1.02, side: 1.42, back: 1.95, jag: 0.06, tufts: 12, lump: 0.05 },
      bob: { front: 1.12, side: 2.35, back: 2.3, jag: 0.07, tufts: 14, lump: 0.05, flare: 0.12 },
      ponytail: { front: 0.98, side: 1.45, back: 1.85, jag: 0.04, tufts: 10, lump: 0.025 },
    };
    const key = HAIR[style] ? style : 'ponytail';
    this.#mesh(hairShell(key, HAIR[key]), M.hair, face, 0, 0.004, -0.004);
    const Y = new THREE.Vector3(0, 1, 0);
    const add = (x, y, z, dir, len, r, bend, parent = face) => {
      const m = this.#mesh(lock(len, r, bend), M.hair, parent, x, y, z);
      m.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...dir).normalize());
      return m;
    };
    if (style === 'messy') {
      // Épis sur le sommet, couchés vers l'arrière.
      for (let i = 0; i < 5; i++) add((i - 2) * 0.03, 0.115, -0.02 - Math.abs(i - 2) * 0.01, [(i - 2) * 0.25, 0.7, -1], 0.07, 0.022, 0.5);
      add(0.02, 0.11, 0.06, [0.3, 0.5, 1], 0.06, 0.02, -0.6);
    } else if (style === 'ponytail') {
      const tail = new THREE.Group();
      tail.position.set(0, 0.05, -0.122);
      face.add(tail);
      this.#mesh(blob(0.022, 0.022, 0.022, 8), M.hoodie2, tail);
      for (let i = 0; i < 3; i++) {
        const m = this.#mesh(lock(0.22 - i * 0.03, 0.036 - i * 0.005, 0.3, (i - 1) * 0.2), M.hair, tail, (i - 1) * 0.008, 0, -0.006);
        m.rotation.x = Math.PI - 0.2;
      }
      this.ponytail = tail;
    }
  }

  // Tête de la forme Abysse : yeux lumineux effilés, crête, gueule crénelée.
  #umbraFace(face) {
    const M = this.mats;
    for (const sx of [-1, 1]) {
      // Orbite sombre + œil effilé lumineux, incliné vers le centre.
      this.#mesh(blob(0.042, 0.024, 0.016), M.maw, face, sx * 0.045, 0.026, 0.098, 0, sx * 0.3, sx * 0.38);
      this.#mesh(blob(0.034, 0.012, 0.012), M.vein, face, sx * 0.046, 0.027, 0.108, 0, sx * 0.3, sx * 0.38);
    }
    // Crête et cornes effilées
    const Y = new THREE.Vector3(0, 1, 0);
    for (const [x, y, z, dx, dy, dz, len] of [[0, 0.11, -0.02, 0, 0.6, -1, 0.14], [-0.06, 0.09, -0.03, -0.6, 0.6, -0.8, 0.11], [0.06, 0.09, -0.03, 0.6, 0.6, -0.8, 0.11]]) {
      const m = this.#mesh(lock(len, 0.022, 0.4), M.hoodie2, face, x, y, z);
      m.quaternion.setFromUnitVectors(Y, new THREE.Vector3(dx, dy, dz).normalize());
    }
    // Gueule : ouverture sombre + deux rangées de crocs (s'ouvre au rugissement).
    const maw = new THREE.Group();
    maw.position.set(0, -0.05, 0.096);
    face.add(maw);
    const hole = this.#mesh(new THREE.SphereGeometry(0.068, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.maw, maw, 0, 0.012, 0);
    hole.scale.set(1.3, 0.55, 0.35);
    for (let i = -4; i <= 4; i++) {
      const c = 1 - Math.abs(i) / 6;
      this.#mesh(new THREE.ConeGeometry(0.0075, 0.03 * c + 0.008, 5), M.tooth, maw, i * 0.0145, 0.0, 0.014 - Math.abs(i) * 0.002, Math.PI);
      this.#mesh(new THREE.ConeGeometry(0.0065, 0.024 * c + 0.006, 5), M.tooth, maw, i * 0.0145 + 0.007, -0.032 * c, 0.012 - Math.abs(i) * 0.002);
    }
    this.maw = maw;
  }

  // Corps de la forme Abysse : épaules à pointes, veines cyan, griffes,
  // tentacules dorsales effilées et animées.
  #umbraBody(spine) {
    const M = this.mats;
    const Y = new THREE.Vector3(0, 1, 0);
    for (const sx of [-1, 1]) {
      const sh = this.joints['sh' + (sx < 0 ? 'R' : 'L')];
      for (const [y, a, len] of [[0.08, -0.9, 0.14], [0.03, -1.3, 0.1]]) {
        const m = this.#mesh(lock(len, 0.03, 0.3), M.hoodie2, sh, sx * 0.04, y, -0.02);
        m.quaternion.setFromUnitVectors(Y, new THREE.Vector3(sx * Math.sin(-a), Math.cos(a), -0.3).normalize());
      }
      // Veines lumineuses sur le buste et les bras
      this.#mesh(new THREE.TorusGeometry(0.21, 0.007, 4, 18, Math.PI * 0.8), M.vein, spine, sx * 0.02, 0.3, 0.03, 0, sx * 0.25, sx > 0 ? 1.2 : 2.0);
      this.#mesh(new THREE.TorusGeometry(0.16, 0.006, 4, 16, Math.PI * 0.6), M.vein, spine, sx * 0.03, 0.12, 0.04, 0, sx * 0.3, sx > 0 ? 1.0 : 2.2);
      const el = this.joints['el' + (sx < 0 ? 'R' : 'L')];
      this.#mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), M.vein, el, sx * -0.04, -0.1, 0.06, 0.1);
      // Griffes : trois lames recourbées par main
      const hand = this.joints['hand' + (sx < 0 ? 'R' : 'L')];
      for (let i = -1; i <= 1; i++) {
        const c = this.#mesh(lock(0.09, 0.011, 0.5), M.tooth, hand, sx * -0.004, -0.07, i * 0.02);
        c.quaternion.setFromUnitVectors(Y, new THREE.Vector3(0, -1, 0.35).normalize());
      }
    }
    this.#mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 4), M.vein, spine, 0, 0.22, 0.19, 0.1);
    // Éclat de cristal Aegis incrusté dans la poitrine (lumineux).
    const shard = this.#mesh(new THREE.OctahedronGeometry(0.05, 0), M.vein, spine, 0, 0.36, 0.19);
    shard.scale.set(0.8, 1.5, 0.45);
    // Veines des jambes
    for (const sx of [-1, 1]) {
      this.#mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 4), M.vein, this.joints['hip' + (sx < 0 ? 'R' : 'L')], sx * 0.05, -0.2, 0.08, 0.15);
      this.#mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), M.vein, this.joints['kn' + (sx < 0 ? 'R' : 'L')], sx * -0.04, -0.17, 0.07, -0.1);
    }
    // Tentacules : chaînes de 4 segments effilés qui ondulent dans le dos.
    this.tendrils = [];
    for (const [x, y, a] of [[-0.1, 0.45, -0.6], [0.1, 0.45, 0.6], [-0.07, 0.25, -1.1], [0.07, 0.25, 1.1]]) {
      let parent = this.#pivot('tnd' + this.tendrils.length, spine, x, y, -0.15);
      parent.rotation.set(-0.9, 0, a * 0.5);
      const chain = [parent];
      for (let i = 0; i < 4; i++) {
        const r0 = 0.04 * (1 - i * 0.2);
        const r1 = 0.04 * (1 - (i + 1) * 0.2);
        this.#mesh(lathe(`tnd${i}`, [[r0, 0], [r0 * 1.05, 0.06], [(r0 + r1) / 2, 0.12], [Math.max(0.006, r1), 0.18]]), M.skin, parent);
        if (i < 3) {
          parent = this.#pivot('tnd' + this.tendrils.length + '_' + i, parent, 0, 0.17, 0);
          chain.push(parent);
        } else this.#mesh(lock(0.14, Math.max(0.01, r1), 0.3), M.vein, parent, 0, 0.17, 0);
      }
      this.tendrils.push({ chain, a, seed: Math.random() * 6 });
    }
    // Masse musculaire : trapèzes, pectoraux, dorsaux, épaules, avant-bras, mollets.
    const S = M.skin;
    this.#mesh(blob(0.2, 0.09, 0.12), S, spine, 0, 0.5, -0.06);
    for (const sx of [-1, 1]) {
      this.#mesh(blob(0.13, 0.09, 0.07), S, spine, sx * 0.1, 0.38, 0.13, 0.2, sx * 0.3, 0);
      this.#mesh(blob(0.12, 0.17, 0.08), S, spine, sx * 0.14, 0.3, -0.12, 0, 0, sx * 0.2);
      for (let i = 0; i < 3; i++) this.#mesh(blob(0.045, 0.035, 0.03), M.hoodie2, spine, sx * 0.05, 0.2 - i * 0.075, 0.17);
      const sh = this.joints['sh' + (sx < 0 ? 'R' : 'L')];
      this.#mesh(blob(0.13, 0.12, 0.12), S, sh, sx * 0.02, 0.01, 0);
      this.#mesh(blob(0.085, 0.1, 0.085), S, sh, 0, -0.14, 0.03);
      const el = this.joints['el' + (sx < 0 ? 'R' : 'L')];
      this.#mesh(blob(0.09, 0.11, 0.085), S, el, 0, -0.07, 0.01);
      const kn = this.joints['kn' + (sx < 0 ? 'R' : 'L')];
      this.#mesh(blob(0.085, 0.12, 0.08), S, kn, 0, -0.1, -0.03);
      // Pointes dorsales le long de la colonne
    }
    for (let i = 0; i < 5; i++) {
      const m = this.#mesh(lock(0.09 + (i % 2) * 0.03, 0.025, 0.4), M.hoodie2, spine, 0, 0.5 - i * 0.1, -0.2);
      m.quaternion.setFromUnitVectors(Y, new THREE.Vector3(0, 0.5, -1).normalize());
    }
    // Un monstre : bien plus grand que Noa.
    this.baseScale = 1.72;
    this.root.scale.setScalar(this.baseScale);
  }

  setPhone(on) {
    if (!this.phone) return;
    this.phone.visible = on;
    this.mats.phone.emissiveIntensity = on ? 1.2 : 0;
  }

  setBackpack(on) {
    if (!this.backpack) return;
    this.joints.spine.children.forEach((c) => {
      if (c.material === this.mats.bag) c.visible = on;
    });
    if (this.bagFlap) this.bagFlap.visible = on;
  }

  // Expression : 'neutral' | 'worried' | 'angry' | 'determined'
  setExpression(e) {
    const tilt = { neutral: -0.12, worried: 0.35, angry: -0.45, determined: -0.3 }[e] ?? -0.12;
    this.brows?.forEach((b, i) => (b.rotation.z = (i === 0 ? -1 : 1) * tilt));
    if (this.mouth) this.mouth.rotation.z = e === 'worried' ? 0 : Math.PI;
  }

  // Marche / course / repos, fondés sur les phases réelles de la foulée :
  // attaque du talon, mise en charge, poussée, oscillation. Le bassin monte et
  // descend deux fois par cycle, pivote avec la jambe avant et bascule ; le buste
  // contre-tourne, la tête se stabilise, les bras balancent en opposition.
  #locomotion(set, s, t, sp, ph) {
    const g = Math.min(1, Math.max(0, (sp - 0.04) / 0.3)); // poids de la marche vs repos
    const a = Math.min(1.6, sp); // amplitude (1 = course, > 1 = sprint)
    const run = Math.min(1, Math.max(0, (sp - 0.55) / 0.5)); // 0 marche -> 1 course
    const leg = (p) => {
      // p = 0 : talon devant au contact ; p = π : orteils derrière.
      const hip = -(0.32 + 0.38 * a) * Math.cos(p);
      const swing = Math.max(0, Math.sin(p - Math.PI)); // phase d'oscillation
      const load = Math.max(0, Math.sin(p)) * Math.max(0, Math.cos(p * 0.5)); // amorti après contact
      const knee = 0.08 + (0.9 + 0.7 * run) * a * swing ** 0.9 + (0.12 + 0.2 * run) * load;
      // Cheville : pointe relevée au contact, poussée en fin d'appui, pied à plat en l'air.
      const ankle = -0.22 * Math.max(0, Math.cos(p)) ** 3 + (0.35 + 0.35 * run) * Math.max(0, Math.sin(p - Math.PI * 0.55)) ** 4 * (p < Math.PI * 1.25 ? 1 : 0) - 0.08 * swing;
      return [hip, knee, ankle];
    };
    const [hR, kR, aR] = leg(ph % (Math.PI * 2));
    const [hL, kL, aL] = leg((ph + Math.PI) % (Math.PI * 2));
    const pelvisYaw = 0.1 * a * Math.cos(ph);
    const pelvisRoll = 0.05 * a * Math.sin(ph);
    const bob = -(0.025 + 0.035 * run) * a * Math.cos(2 * ph - 0.5);
    const lean = 0.04 + 0.1 * a + 0.16 * run + (s.accel || 0);
    const armA = (0.22 + 0.42 * a) * (1 + 0.3 * run);
    const elbow = -(0.25 + 0.55 * a + 0.5 * run);

    // Repos : transfert du poids, respiration, regard qui erre.
    const shift = Math.sin(t * 0.45);
    const br = Math.sin(t * 1.7) * 0.018;
    const look = Math.sin(t * 0.31) * 0.35 + Math.sin(t * 0.83) * 0.12;
    const idle = {
      spine: [0.03 + br, -shift * 0.03, 0],
      head: [-0.02 + Math.sin(t * 0.5) * 0.04, look, 0],
      shR: [0.04, 0, -0.09 - br], elR: [-0.22 - br * 2, 0, 0],
      shL: [0.04, 0, 0.09 + br], elL: [-0.22 - br * 2, 0, 0],
      hipR: [-0.04 + shift * 0.05, 0.08, -0.02 + shift * 0.03], knR: [0.06 + Math.max(0, shift) * 0.18, 0, 0], anR: [-0.02 - Math.max(0, shift) * 0.1, 0, 0],
      hipL: [0.03 - shift * 0.05, -0.08, 0.02 + shift * 0.03], knL: [0.06 + Math.max(0, -shift) * 0.18, 0, 0], anL: [-0.02 - Math.max(0, -shift) * 0.1, 0, 0],
      hips: [0, 0, shift * 0.035],
      drop: [0, -0.01 - Math.abs(shift) * 0.012 + br * 0.3, 0],
    };
    // Petits pas sur place quand on pivote à l'arrêt.
    const turnStep = Math.min(1, Math.abs(s.turn || 0) * 0.6) * (1 - g);
    const ts = Math.sin(t * 9);
    const gait = {
      spine: [lean, -pelvisYaw * 0.7, 0],
      head: [-lean * 0.6, pelvisYaw * 0.6, -pelvisRoll * 0.5],
      shR: [armA * Math.cos(ph), 0, -0.1 - 0.05 * run], elR: [elbow - 0.2 * Math.max(0, -Math.cos(ph)), 0, 0],
      shL: [-armA * Math.cos(ph), 0, 0.1 + 0.05 * run], elL: [elbow - 0.2 * Math.max(0, Math.cos(ph)), 0, 0],
      hipR: [hR, 0, 0], knR: [kR, 0, 0], anR: [aR, 0, 0],
      hipL: [hL, 0, 0], knL: [kL, 0, 0], anL: [aL, 0, 0],
      hips: [0, pelvisYaw, pelvisRoll],
      drop: [0, bob - 0.02 * a - 0.03 * run, 0],
    };
    for (const k of Object.keys(gait)) {
      const i = idle[k] || [0, 0, 0];
      const w = gait[k];
      set(k, i[0] + (w[0] - i[0]) * g, i[1] + (w[1] - i[1]) * g, i[2] + (w[2] - i[2]) * g);
    }
    if (turnStep > 0.05) {
      set('hipR', -0.25 * turnStep * Math.max(0, ts));
      set('knR', 0.5 * turnStep * Math.max(0, ts));
      set('hipL', -0.25 * turnStep * Math.max(0, -ts));
      set('knL', 0.5 * turnStep * Math.max(0, -ts));
    }
    // Amorti de réception après un saut (genoux qui plient puis se redressent).
    if (s.land > 0) {
      const k = s.land;
      set('knR', 0.9 * k);
      set('knL', 0.9 * k);
      set('hipR', -0.55 * k);
      set('hipL', -0.55 * k);
      set('anR', -0.35 * k);
      set('anL', -0.35 * k);
      set('spine', 0.35 * k);
      set('drop', 0, -0.2 * k, 0);
    }
  }

  // s : { dt, speed, phase, airborne, vy, anim, animP, dodge, hurt, lean, dead, deadP,
  //       flight: { mode: 'hover'|'fly'|'boost', pitch, roll, speed } | null }
  animate(s) {
    const dt = s.dt;
    this.time += dt;
    const t = this.time;
    const pose = {};
    const set = (k, x, y = 0, z = 0) => (pose[k] = [x, y, z]);
    const sp = s.speed;
    const ph = s.phase;
    let tiltX = 0;
    let tiltZ = s.lean || 0;

    if (s.flight) {
      const f = s.flight;
      const bob = Math.sin(t * 2.4) * 0.05;
      if (f.mode === 'hover') {
        // Vol stationnaire : un genou relevé, bras ouverts paumes vers le sol.
        set('spine', 0.05 + bob);
        set('head', -0.05);
        set('shR', -0.25, 0, -0.55 - bob);
        set('shL', -0.25, 0, 0.55 + bob);
        set('elR', -0.35);
        set('elL', -0.35);
        set('hipR', -0.55 + bob);
        set('knR', 1.1);
        set('hipL', -0.1);
        set('knL', 0.35 + bob);
        set('drop', 0, bob * 0.6);
        tiltX = 0.08;
      } else {
        // Vol : corps à l'horizontale, jambes tendues, bras le long du corps
        // (boost : poing droit en avant, pose classique de super-héros).
        const boost = f.mode === 'boost';
        set('spine', -0.15);
        set('head', -1.0 + (boost ? -0.1 : 0));
        set('hipR', 0.12 + Math.sin(t * 9) * 0.05);
        set('hipL', 0.02 + Math.sin(t * 9 + 1) * 0.05);
        set('knR', 0.25);
        set('knL', 0.12);
        if (boost) {
          set('shR', -3.0, 0, 0.05);
          set('elR', 0);
          set('shL', 0.3, 0, 0.35);
          set('elL', -0.2);
        } else {
          set('shR', 0.35, 0, -0.35);
          set('shL', 0.35, 0, 0.35);
          set('elR', -0.3);
          set('elL', -0.3);
        }
        tiltX = f.pitch;
        tiltZ = f.roll;
      }
    } else if (s.airborne) {
      const up = s.vy > 0;
      set('spine', up ? -0.15 : 0.1);
      set('shR', -0.4, 0, -0.6);
      set('shL', -0.4, 0, 0.6);
      set('elR', -1.0);
      set('elL', -1.0);
      set('hipR', up ? -1.1 : -0.4);
      set('knR', up ? 1.6 : 0.5);
      set('hipL', up ? -0.2 : -0.7);
      set('knL', up ? 0.6 : 0.9);
    } else {
      this.#locomotion(set, s, t, sp, ph);
    }

    if (s.anim && ATTACK_ANIMS[s.anim]) {
      const k = keyed(ATTACK_ANIMS[s.anim], s.animP);
      for (const key of Object.keys(k)) pose[key] = k[key];
    }
    // Garde (bouclier d'anneaux) : avant-bras croisés devant soi.
    if (s.shield) {
      set('spine', 0.15);
      set('shR', -1.35, 0.5, 0);
      set('elR', -1.1);
      set('shL', -1.35, -0.5, 0);
      set('elL', -1.1);
      set('hipR', -0.4);
      set('knR', 0.6);
      set('hipL', 0.2);
      set('knL', 0.5);
      set('drop', 0, -0.12);
    }
    if (s.dodge) {
      set('spine', 0.5);
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

    // Monstre : voûté, épaules en avant, bras écartés, tête en avant.
    if (this.umbra && !s.dead) {
      const add = (k, x, y = 0, z = 0) => {
        const v = pose[k] || [0, 0, 0];
        pose[k] = [v[0] + x, v[1] + y, v[2] + z];
      };
      add('spine', 0.28);
      add('head', -0.22);
      add('shR', 0, 0, -0.22);
      add('shL', 0, 0, 0.22);
      add('elR', -0.25);
      add('elL', -0.25);
      add('hipR', -0.15, 0, -0.06);
      add('hipL', -0.15, 0, 0.06);
      add('knR', 0.25);
      add('knL', 0.25);
      add('drop', 0, -0.06);
    }
    const rate = s.anim || s.dodge || s.hurt > 0 || s.shield ? 26 : s.flight ? 8 : s.land > 0 ? 30 : 18;
    const k = 1 - Math.exp(-rate * dt);
    for (const name of ['spine', 'head', 'shR', 'elR', 'shL', 'elL', 'hipR', 'knR', 'anR', 'hipL', 'knL', 'anL', 'hips', 'drop']) {
      const target = pose[name] || [0, 0, 0];
      const cur = this.current[name] || (this.current[name] = [0, 0, 0]);
      for (let i = 0; i < 3; i++) cur[i] += (target[i] - cur[i]) * k;
      if (name === 'drop') this.joints.hips.position.y = cur[1];
      else this.joints[name].rotation.set(cur[0], cur[1], cur[2]);
    }
    // Inclinaison du corps entier (vol, virages) lissée.
    const kt = 1 - Math.exp(-6 * dt);
    this.tilt.rotation.x += (tiltX - this.tilt.rotation.x) * kt;
    this.tilt.rotation.z += (tiltZ - this.tilt.rotation.z) * kt;
    if (this.tendrils) {
      // Ondulation des tentacules (plus vive en mouvement ou en attaque).
      const act = s.anim ? 2.2 : 1 + Math.min(1, sp);
      for (const td of this.tendrils) {
        td.chain.forEach((j, i) => {
          if (i === 0) j.rotation.set(-0.9 - (s.anim ? 0.6 : 0) + Math.sin(t * 2 * act + td.seed) * 0.15, 0, td.a * 0.5 + Math.cos(t * 1.7 + td.seed) * 0.2);
          else j.rotation.set(Math.sin(t * 3 * act + td.seed + i) * 0.35, 0, Math.cos(t * 2.4 + td.seed + i * 0.7) * 0.3 * td.a);
        });
      }
    }
    if (this.maw) {
      const open = s.anim === 'roar' || s.anim === 'transform' ? 1 : s.anim ? 0.5 : 0.15 + Math.sin(t * 2) * 0.05;
      this.maw.scale.y += (1 + open * 1.4 - this.maw.scale.y) * Math.min(1, dt * 12);
    }
    // Veines de l'Abysse qui pulsent (plus vite en combat).
    if (this.umbra) this.mats.vein.emissiveIntensity = 1.7 + Math.sin(t * (s.anim ? 9 : 3)) * 0.7;
    // Cape : flotte vers l'arrière avec la vitesse.
    if (this.cape) this.cape.rotation.x = -0.08 - Math.min(1.4, sp) * 0.55 - Math.sin(t * 7) * 0.05 * Math.min(1, sp + 0.2);
    if (this.ponytail) this.ponytail.rotation.x = 0.35 + Math.min(1, sp) * 0.5 + Math.sin(t * 8) * 0.1 * Math.min(1, sp);
    this.setPhone(s.anim === 'phone');
  }
}
