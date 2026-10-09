// Arbre de compétences : rangs investis, prérequis, réinitialisation, et
// conversion en modificateurs de jeu.
import { SKILLS } from '../data/skills.js';

export class SkillTree {
  constructor(data) {
    this.ranks = { ...(data?.ranks || {}) };
    for (const id of Object.keys(this.ranks)) if (!SKILLS[id]) delete this.ranks[id];
  }

  rank(id) {
    return this.ranks[id] || 0;
  }

  spent() {
    return Object.entries(this.ranks).reduce((s, [id, r]) => s + r * SKILLS[id].cost, 0);
  }

  // Raison du refus, ou null si possible.
  blocker(id, points) {
    const sk = SKILLS[id];
    if (!sk) return 'Compétence inconnue';
    if (this.rank(id) >= sk.max) return 'Rang maximal';
    if (points < sk.cost) return `Il faut ${sk.cost} point(s)`;
    if (sk.tier > 1) {
      const prev = Object.entries(SKILLS).find(([, s]) => s.branch === sk.branch && s.tier === sk.tier - 1)[0];
      if (!this.rank(prev)) return `Débloquer d’abord « ${SKILLS[prev].name} »`;
    }
    return null;
  }

  // progression : objet Progression (points disponibles). Renvoie true si appris.
  learn(id, progression) {
    if (this.blocker(id, progression.skillPoints)) return false;
    progression.skillPoints -= SKILLS[id].cost;
    this.ranks[id] = this.rank(id) + 1;
    return true;
  }

  // Rend tous les points.
  reset(progression) {
    progression.skillPoints += this.spent();
    this.ranks = {};
  }

  mods() {
    const r = (id) => this.rank(id);
    return {
      damageMult: 1 + 0.1 * r('f1'),
      whipRange: r('f2') * 1.0,
      whipArc: r('f2') * 0.4,
      punchPierce: r('f3') > 0,
      sprintMult: 1 + 0.08 * r('m1'),
      dodgeIFrames: 0.08 * r('m2'),
      dodgeCd: 0.12 * r('m2'),
      flightMult: r('m3') ? 1.25 : 1,
      energyRegen: 1.5 * r('e1'),
      volleyTargets: r('e2'),
      volleyCost: 4 * r('e2'),
      volleyDmg: r('e3') ? 1.35 : 1,
      maxHp: 20 * r('s1'),
      blockReduce: r('s2') ? 0.15 - 0.05 * r('s2') : 0.15,
      blockCostMult: 1 - 0.25 * r('s2'),
      secondWind: r('s3') > 0,
      parryWindow: 0.25 + 0.08 * r('x1'),
      riposte: r('x2') > 0,
      comboBonus: r('x3') > 0,
    };
  }

  serialize() {
    return { ranks: { ...this.ranks } };
  }
}
