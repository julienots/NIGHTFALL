// Rang de style : chaque coup qui touche fait monter un score ; varier les
// attaques (coups, fouet, rafale, magnétisme, Abysse) rapporte plus que
// répéter la même. Être touché fait chuter le rang. À la fin d'un enchaînement
// d'au moins 5 coups, un bonus d'XP proportionnel au rang est versé.
export const RANKS = [
  { id: 'D', min: 0, word: 'DISCRET', mult: 1, decay: 1 },
  { id: 'C', min: 60, word: 'COSTAUD', mult: 1.2, decay: 1.2 },
  { id: 'B', min: 150, word: 'BRILLANT', mult: 1.5, decay: 1.45 },
  { id: 'A', min: 280, word: 'ATOMIQUE', mult: 1.9, decay: 1.75 },
  { id: 'S', min: 450, word: 'STELLAIRE', mult: 2.5, decay: 2.1 },
  { id: 'SS', min: 680, word: 'SUPERESSENCE', mult: 3.2, decay: 2.6 },
];
const WINDOW = 3.2; // secondes sans toucher avant la fin de l'enchaînement

export class ComboMeter {
  constructor() {
    this.reset();
    this.best = 0;
  }

  reset() {
    this.hits = 0;
    this.score = 0;
    this.timer = 0;
    this.recent = [];
  }

  get rank() {
    let r = RANKS[0];
    for (const k of RANKS) if (this.score >= k.min) r = k;
    return r;
  }

  get rankIndex() {
    return RANKS.indexOf(this.rank);
  }

  // kind : 'light' | 'heavy' | 'power' | 'magnet' | 'umbra' | 'dive' | 'parry'
  hit(kind, damage = 10) {
    this.hits++;
    this.best = Math.max(this.best, this.hits);
    // Variété : moins de points si la même attaque revient sans cesse.
    const same = this.recent.filter((k) => k === kind).length;
    const variety = 1.4 - Math.min(0.9, same * 0.22);
    this.recent.push(kind);
    if (this.recent.length > 6) this.recent.shift();
    const base = { light: 10, heavy: 18, power: 24, magnet: 30, umbra: 16, dive: 26, parry: 40, kill: 20 }[kind] ?? 10;
    const before = this.rank;
    this.score += (base + Math.min(20, damage * 0.15)) * variety;
    this.timer = WINDOW;
    return this.rank !== before ? this.rank : null; // rang gagné
  }

  hurt() {
    // Chute de deux rangs environ, sans casser complètement l'enchaînement.
    const i = Math.max(0, this.rankIndex - 2);
    this.score = Math.min(this.score * 0.4, RANKS[i].min + 5);
    this.hits = 0;
  }

  // Renvoie le bonus d'XP quand l'enchaînement se termine (sinon 0).
  update(dt) {
    if (this.timer <= 0) return 0;
    this.timer -= dt;
    // Le score s'érode plus vite aux rangs élevés : il faut rester agressif.
    this.score = Math.max(0, this.score - dt * 12 * this.rank.decay);
    if (this.timer > 0) return 0;
    const bonus = this.hits >= 5 ? Math.round(this.hits * 2 * this.rank.mult) : 0;
    this.reset();
    return bonus;
  }

  state() {
    if (this.timer <= 0) return null;
    const r = this.rank;
    return { hits: this.hits, rank: r.id, word: r.word, timer: Math.max(0, this.timer / WINDOW) };
  }
}
