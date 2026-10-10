// Modèle procédural d'un personnage « ado » (Noa, Inès, passants) en style
// cartoon : sweat à capuche, jean, baskets, visage expressif. Squelette de
// pivots animé procéduralement. Face à +Z ; côté droit en -X.
// Un groupe « tilt » au niveau du bassin permet d'incliner tout le corps
// (vol à plat, virages, atterrissage).
import * as THREE from 'three';
import { toon } from '../fx/toon.js';
import { bakeJoints } from '../core/bake.js';

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
  constructor(palette = PALETTES.noa, { backpack = true, rim = '#9fd8ff' } = {}) {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.tilt.position.y = HIP_Y;
    this.root.add(this.tilt);
    this.joints = {};
    this.time = 0;
    this.current = {};
    this.palette = palette;
    this.umbra = palette.variant === 'umbra';
    const R = this.umbra ? { rim: '#7a5cff', rimStrength: 1.1, shared: false } : { rim, rimStrength: 0.6, shared: false };
    this.mats = {
      skin: toon(palette.skin, R),
      hair: toon(palette.hair, R),
      hoodie: toon(palette.hoodie, R),
      hoodie2: toon(palette.hoodie2, R),
      pants: toon(palette.pants, R),
      shoe: toon(palette.shoe, R),
      sole: toon(palette.sole, R),
      bag: toon(palette.bag || '#555', R),
      white: toon('#ffffff', { shared: false }),
      pupil: toon('#1d0f3a', { shared: false }),
      mouth: toon('#7a2f3a', { shared: false }),
      phone: toon('#1d0f3a', { emissive: '#7fe3ff', emissiveIntensity: 0, shared: false }),
      vein: toon('#5fe3ff', { emissive: '#5fe3ff', emissiveIntensity: 1.8, shared: false }),
      tooth: toon('#f4f0ff', { rim: '#ffffff', shared: false }),
      maw: toon('#2a0820', { shared: false }),
    };
    this.#build(backpack && palette.bag);
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    // Fusion des pièces fixes de chaque articulation (≈ 3x moins d'appels de dessin).
    bakeJoints(this.root, new Set([this.phone, this.mouth, this.ponytail, this.bagFlap, ...(this.brows || [])].filter(Boolean)));
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
    const hips = this.#pivot('hips', this.tilt, 0, 0, 0);
    // Bassin (jean) + bas du sweat
    this.#mesh(new THREE.CapsuleGeometry(0.15, 0.1, 4, 12), M.pants, hips, 0, 0.02, 0, 0, 0, Math.PI / 2).scale.set(1, 1.05, 0.9);
    const spine = this.#pivot('spine', hips, 0, 0.1, 0);
    // Sweat à capuche : buste un peu ample, poche kangourou, cordons
    const torso = this.#mesh(new THREE.CapsuleGeometry(0.19, 0.3, 6, 16), M.hoodie, spine, 0, 0.27, 0);
    torso.scale.set(1.18, 1, 0.82);
    this.#mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 20), M.hoodie2, spine, 0, 0.06, 0, Math.PI / 2).scale.set(1.12, 0.8, 1);
    if (!this.umbra) {
      const pocket = this.#mesh(new THREE.BoxGeometry(0.24, 0.1, 0.03), M.hoodie2, spine, 0, 0.17, 0.155);
      pocket.rotation.x = -0.1;
      // Capuche repliée dans le dos + cordons
      const hood = this.#mesh(new THREE.TorusGeometry(0.13, 0.065, 8, 18), M.hoodie2, spine, 0, 0.53, -0.04, Math.PI / 2 - 0.4);
      hood.scale.set(1.1, 1, 1);
      for (const sx of [-1, 1]) this.#mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), M.white, spine, sx * 0.05, 0.42, 0.15, 0.15);
    } else torso.scale.set(1.5, 1.08, 1.0);
    // Sac à dos
    if (withBag) {
      const bag = this.#mesh(new THREE.CapsuleGeometry(0.14, 0.16, 4, 12), M.bag, spine, 0, 0.3, -0.22);
      bag.scale.set(1.2, 1, 0.7);
      this.bagFlap = this.#mesh(new THREE.BoxGeometry(0.2, 0.1, 0.05), M.hoodie2, spine, 0, 0.22, -0.31);
      for (const sx of [-1, 1]) this.#mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 12, Math.PI), M.bag, spine, sx * 0.12, 0.38, -0.05, 0, Math.PI / 2, 0);
      this.backpack = bag;
    }

    // Tête cartoon (grosse) : visage, yeux, cheveux
    const head = this.#pivot('head', spine, 0, 0.56, 0.01);
    this.#mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 10), M.skin, head, 0, 0.0, 0);
    const face = new THREE.Group();
    face.position.y = 0.17;
    face.scale.setScalar(1.3);
    head.add(face);
    this.face = face;
    const skull = this.#mesh(new THREE.SphereGeometry(0.12, 24, 18), M.skin, face);
    skull.scale.set(0.95, 1.05, 1.0);
    if (!this.umbra) {
      for (const sx of [-1, 1]) {
        // Oreilles
        this.#mesh(new THREE.SphereGeometry(0.03, 10, 8), M.skin, face, sx * 0.115, 0, 0).scale.set(0.6, 1, 1);
        // Yeux : blanc + pupille + éclat
        const eye = this.#mesh(new THREE.SphereGeometry(0.026, 12, 10), M.white, face, sx * 0.045, 0.02, 0.105);
        eye.scale.set(0.9, 1.15, 0.5);
        this.#mesh(new THREE.SphereGeometry(0.014, 10, 8), M.pupil, face, sx * 0.045, 0.018, 0.118);
        // Sourcils
        const brow = this.#mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), M.hair, face, sx * 0.047, 0.058, 0.112, 0, 0, sx * -0.12);
        (this.brows ||= []).push(brow);
      }
      this.#mesh(new THREE.SphereGeometry(0.012, 8, 6), M.skin, face, 0, -0.012, 0.122);
      this.mouth = this.#mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12, Math.PI), M.mouth, face, 0, -0.045, 0.112, 0, 0, Math.PI);
    } else this.#umbraFace(face);
    // Cheveux
    const hairCap = this.#mesh(new THREE.SphereGeometry(0.128, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, face, 0, 0.012, -0.008);
    hairCap.rotation.x = -0.25;
    if (P.hairStyle === 'messy') {
      for (const [x, y, z, r, rx, rz] of [[0.04, 0.11, 0.07, 0.05, 0.5, -0.4], [-0.05, 0.12, 0.05, 0.05, 0.4, 0.5], [0.0, 0.13, -0.02, 0.055, 0, 0], [0.08, 0.08, 0.0, 0.04, 0, -0.8], [-0.08, 0.08, -0.02, 0.04, 0, 0.8], [0.0, 0.07, 0.1, 0.04, 1.2, 0]]) {
        this.#mesh(new THREE.ConeGeometry(r, 0.11, 6), M.hair, face, x, y, z, rx, 0, rz);
      }
    } else if (P.hairStyle === 'short') {
      // Coupe courte : calotte un peu plus épaisse + petite mèche.
      this.#mesh(new THREE.SphereGeometry(0.132, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), M.hair, face, 0, 0.03, 0.0);
      this.#mesh(new THREE.ConeGeometry(0.04, 0.08, 6), M.hair, face, 0.03, 0.12, 0.08, 1.1, 0, -0.3);
    } else if (P.hairStyle === 'bob') {
      // Carré : volume sur les côtés jusqu'au menton, frange.
      const bob = this.#mesh(new THREE.SphereGeometry(0.145, 18, 12, Math.PI * 0.78, Math.PI * 1.44, 0, Math.PI * 0.62), M.hair, face, 0, 0.0, -0.015);
      this.#mesh(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), M.hair, face, 0, 0.02, 0);
      bob.scale.set(1.05, 1.0, 1.0);
      this.#mesh(new THREE.BoxGeometry(0.17, 0.04, 0.05), M.hair, face, 0, 0.085, 0.095, 0.3);
    } else if (P.hairStyle !== 'none') {
      // Queue de cheval
      this.#mesh(new THREE.SphereGeometry(0.05, 10, 8), M.hair, face, 0, 0.06, -0.12);
      const tail = this.#mesh(new THREE.CapsuleGeometry(0.035, 0.14, 4, 8), M.hair, face, 0, -0.04, -0.15, 0.35);
      this.ponytail = tail;
    }

    // Bras : manches de sweat + mains
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const sh = this.#pivot('sh' + side, spine, sx * 0.24, 0.43, 0);
      this.#mesh(new THREE.SphereGeometry(0.075, 12, 8), M.hoodie, sh);
      this.#mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 10), M.hoodie, sh, 0, -0.15, 0);
      const el = this.#pivot('el' + side, sh, 0, -0.3, 0);
      this.#mesh(new THREE.CapsuleGeometry(0.055, 0.17, 4, 10), M.hoodie, el, 0, -0.11, 0);
      this.#mesh(new THREE.TorusGeometry(0.052, 0.018, 6, 14), M.hoodie2, el, 0, -0.22, 0, Math.PI / 2);
      const hand = this.#mesh(new THREE.SphereGeometry(0.052, 12, 10), M.skin, el, 0, -0.28, 0.01);
      hand.scale.set(1, 1.1, 1.1);
      this.joints['fist' + side] = hand;
      if (side === 'R') {
        // Téléphone (visible pendant l'animation « phone »)
        this.phone = this.#mesh(new THREE.BoxGeometry(0.07, 0.13, 0.012), M.phone, el, 0, -0.3, 0.06);
        this.phone.visible = false;
      }
    }

    // Jambes : jean + baskets
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const hip = this.#pivot('hip' + side, hips, sx * 0.09, -0.02, 0);
      this.#mesh(new THREE.CapsuleGeometry(0.075, 0.28, 4, 10), M.pants, hip, 0, -0.2, 0);
      const kn = this.#pivot('kn' + side, hip, 0, -0.41, 0);
      this.#mesh(new THREE.CapsuleGeometry(0.065, 0.28, 4, 10), M.pants, kn, 0, -0.18, 0);
      // Cheville : le pied déroule du talon à la pointe.
      const an = this.#pivot('an' + side, kn, 0, -0.4, 0);
      const shoe = this.#mesh(new THREE.SphereGeometry(0.075, 14, 10), M.shoe, an, 0, -0.03, 0.05);
      shoe.scale.set(1.1, 0.7, 1.7);
      this.#mesh(new THREE.BoxGeometry(0.15, 0.03, 0.25), M.sole, an, 0, -0.075, 0.05);
    }
    if (this.umbra) this.#umbraBody(spine);
  }

  // Tête de la forme Abysse : yeux en fentes lumineuses, gueule crénelée.
  #umbraFace(face) {
    const M = this.mats;
    for (const sx of [-1, 1]) {
      const eye = this.#mesh(new THREE.SphereGeometry(0.03, 10, 8), M.vein, face, sx * 0.05, 0.03, 0.1, 0, sx * 0.3, sx * -0.5);
      eye.scale.set(1.9, 0.55, 0.5);
    }
    // Arête du crâne (crête) + cornes courtes
    this.#mesh(new THREE.ConeGeometry(0.03, 0.12, 5), M.hoodie2, face, 0, 0.13, -0.02, -0.4);
    for (const sx of [-1, 1]) this.#mesh(new THREE.ConeGeometry(0.022, 0.1, 5), M.hoodie2, face, sx * 0.08, 0.1, -0.03, -0.5, 0, sx * -0.6);
    // Gueule : ouverture sombre + rangée de crocs (s'ouvre au rugissement).
    const maw = new THREE.Group();
    maw.position.set(0, -0.045, 0.098);
    face.add(maw);
    const hole = this.#mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.maw, maw, 0, 0.012, 0);
    hole.scale.set(1.25, 0.55, 0.35);
    for (let i = -3; i <= 3; i++) {
      this.#mesh(new THREE.ConeGeometry(0.008, 0.026, 4), M.tooth, maw, i * 0.016, 0.0, 0.012, Math.PI);
      this.#mesh(new THREE.ConeGeometry(0.007, 0.02, 4), M.tooth, maw, i * 0.016 + 0.008, -0.03 * (1 - Math.abs(i) / 5), 0.01);
    }
    this.maw = maw;
  }

  // Corps de la forme Abysse : épaules à pointes, veines cyan, griffes,
  // tentacules dorsales animées.
  #umbraBody(spine) {
    const M = this.mats;
    for (const sx of [-1, 1]) {
      this.#mesh(new THREE.ConeGeometry(0.05, 0.16, 5), M.hoodie2, this.joints['sh' + (sx < 0 ? 'R' : 'L')], sx * 0.04, 0.08, -0.02, 0, 0, sx * -0.9);
      // Veines lumineuses sur le buste et les bras
      this.#mesh(new THREE.TorusGeometry(0.2, 0.008, 4, 16, Math.PI * 0.8), M.vein, spine, sx * 0.02, 0.3, 0.02, 0, sx * 0.25, sx > 0 ? 1.2 : 2.0);
      const el = this.joints['el' + (sx < 0 ? 'R' : 'L')];
      this.#mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), M.vein, el, sx * -0.03, -0.12, 0.045, 0.1);
      // Griffes : trois lames par main
      for (let k = -1; k <= 1; k++) this.#mesh(new THREE.ConeGeometry(0.012, 0.12, 4), M.tooth, el, k * 0.025, -0.36, 0.035, Math.PI - 0.25);
    }
    this.#mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 4), M.vein, spine, 0, 0.28, 0.16, 0.1);
    // Tentacules : chaînes de 4 segments qui ondulent dans le dos.
    this.tendrils = [];
    for (const [x, y, a] of [[-0.1, 0.45, -0.6], [0.1, 0.45, 0.6], [-0.07, 0.25, -1.1], [0.07, 0.25, 1.1]]) {
      let parent = this.#pivot('tnd' + this.tendrils.length, spine, x, y, -0.15);
      parent.rotation.set(-0.9, 0, a * 0.5);
      const chain = [parent];
      for (let i = 0; i < 4; i++) {
        const r = 0.035 * (1 - i * 0.2);
        this.#mesh(new THREE.CapsuleGeometry(r, 0.14, 3, 6), M.skin, parent, 0, 0.08, 0);
        if (i < 3) {
          parent = this.#pivot('tnd' + this.tendrils.length + '_' + i, parent, 0, 0.17, 0);
          chain.push(parent);
        } else this.#mesh(new THREE.ConeGeometry(r, 0.12, 5), M.vein, parent, 0, 0.2, 0);
      }
      this.tendrils.push({ chain, a, seed: Math.random() * 6 });
    }
    this.root.scale.setScalar(1.22);
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
    if (this.ponytail) this.ponytail.rotation.x = 0.35 + Math.min(1, sp) * 0.5 + Math.sin(t * 8) * 0.1 * Math.min(1, sp);
    this.setPhone(s.anim === 'phone');
  }
}
