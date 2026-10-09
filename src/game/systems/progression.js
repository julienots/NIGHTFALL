// Niveau, expérience et points de compétence du joueur.
export const MAX_LEVEL = 30;

export const xpForLevel = (level) => Math.round(100 * level ** 1.4);

export class Progression {
  constructor(data) {
    this.level = 1;
    this.xp = 0;
    this.skillPoints = 0;
    if (data) Object.assign(this, { level: data.level, xp: data.xp, skillPoints: data.skillPoints });
  }

  get xpToNext() {
    return xpForLevel(this.level);
  }

  // Renvoie le nombre de niveaux gagnés.
  addXp(amount) {
    if (this.level >= MAX_LEVEL) return 0;
    this.xp += Math.max(0, Math.round(amount));
    let gained = 0;
    while (this.level < MAX_LEVEL && this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.skillPoints++;
      gained++;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    return gained;
  }

  // Bonus de base liés au niveau.
  levelStats() {
    return { maxHp: (this.level - 1) * 12, damage: (this.level - 1) * 1.5, maxEnergy: (this.level - 1) * 3 };
  }

  serialize() {
    return { level: this.level, xp: this.xp, skillPoints: this.skillPoints };
  }
}
