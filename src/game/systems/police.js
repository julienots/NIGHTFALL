// Police de Vesper : niveau de recherche (0 à 5 étoiles) selon les délits de
// Noa (passants frappés ou mis K.O., policiers agressés). Des agents arrivent
// hors champ et le prennent en chasse ; s'ils le perdent de vue assez
// longtemps, les étoiles retombent une à une. Mort de Noa = recherche annulée.
import * as THREE from 'three';
import { Fighter } from '../actors/fighter.js';

const MAX_STARS = 5;
const LOSE_SIGHT = 14; // secondes sans être vu avant de perdre une étoile
const STAR_DECAY = 8; // puis une étoile de moins toutes les … s

export class Police {
  constructor(game) {
    this.game = game;
    this.heat = 0; // points de délit (2 par étoile)
    this.officers = [];
    this.unseenT = 0;
    this.spawnT = 0;
    this.el = document.createElement('div');
    this.el.className = 'wanted';
    game.hud.el.appendChild(this.el);
    this.#render();
  }

  get stars() {
    return Math.min(MAX_STARS, Math.ceil(this.heat / 2));
  }

  // Délit : sévérité 1 (coup) ou 2 (K.O.) ; contre un policier, ça compte double.
  crime(severity, pos, onOfficer = false) {
    const g = this.game;
    if (g.zone !== 'city' || g.creative?.noPolice) return;
    const before = this.stars;
    this.heat = Math.min(MAX_STARS * 2, this.heat + severity * (onOfficer ? 1.5 : 1));
    this.unseenT = 0;
    this.lastPos = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, 0, pos.z);
    if (this.stars > before) {
      g.hud.toast(`Recherché ${'★'.repeat(this.stars)} — la police arrive !`, '#ff6a6a');
      g.audio.denied?.();
    }
    this.#render();
  }

  // Un agent voit Noa : le compteur de fuite repart de zéro.
  seen() {
    this.unseenT = 0;
  }

  setStars(n) {
    this.heat = Math.max(0, Math.min(MAX_STARS, n)) * 2;
    this.unseenT = 0;
    this.#render();
  }

  reset() {
    this.heat = 0;
    this.#render();
  }

  #render() {
    const s = this.stars;
    this.el.classList.toggle('on', s > 0);
    this.el.innerHTML = Array.from({ length: MAX_STARS }, (_, i) => `<i class="${i < s ? 'lit' : ''}">★</i>`).join('');
  }

  // Point d'apparition hors champ : un trottoir (porte de commerce) à 30-60 m.
  #spawnPoint() {
    const g = this.game;
    const hp = g.hero.pos;
    const cands = (g.shopDoors || []).filter((d) => {
      const dd = Math.hypot(d.x - hp.x, d.z - hp.z);
      return dd > 28 && dd < 65;
    });
    if (cands.length) {
      const d = cands[Math.floor(Math.random() * cands.length)];
      return { x: d.x + d.nx * 1.5, z: d.z + d.nz * 1.5 };
    }
    const a = Math.random() * Math.PI * 2;
    return { x: hp.x + Math.sin(a) * 35, z: hp.z + Math.cos(a) * 35 };
  }

  update(dt) {
    const g = this.game;
    const hero = g.hero;
    if (hero.dead && this.heat > 0) this.reset();
    const stars = this.stars;
    // Fuite : sans être vu, les étoiles retombent.
    if (stars > 0) {
      this.unseenT += dt;
      if (this.unseenT > LOSE_SIGHT + STAR_DECAY) {
        this.unseenT = LOSE_SIGHT;
        this.heat = Math.max(0, (stars - 1) * 2);
        g.hud.toast(stars - 1 > 0 ? `Recherche : ${'★'.repeat(stars - 1)}` : 'La police a perdu ta trace', '#ffcd20');
        this.#render();
      }
    }
    // Renforts : 2 agents par étoile (8 au maximum).
    const want = g.zone === 'city' ? Math.min(8, stars * 2) : 0;
    const alive = this.officers.filter((o) => o.alive);
    this.spawnT -= dt;
    if (alive.length < want && this.spawnT <= 0) {
      this.spawnT = 2.5;
      const p = this.#spawnPoint();
      const o = new Fighter(g, { kind: 'police', x: p.x, z: p.z });
      this.officers.push(o);
    }
    for (const o of this.officers) o.update(dt, this.officers);
    // Nettoyage : agents à terre depuis longtemps ou partis loin quand l'alerte est levée.
    this.officers = this.officers.filter((o) => {
      const far = o.pos.distanceTo(hero.pos) > 70;
      const gone = (!o.alive && o.deadT > 10) || (stars === 0 && far) || (g.zone !== 'city' && stars === 0);
      if (gone) o.dispose();
      return !gone;
    });
    for (const o of this.officers) o.model.root.visible = g.zone === 'city';
  }
}
