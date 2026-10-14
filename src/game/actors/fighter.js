// Combattants humains pilotés par l'IA : policiers et héros alliés.
// Même modèle que Noa (squelette animé), machine à états :
//   police : patrouille → poursuite → interpellation (matraque) / taser à
//            distance (à partir de 3 étoiles), contourne les obstacles,
//            s'écarte quand elle est trop nombreuse au contact, abandonne si
//            Noa n'est plus recherché.
//   héros  : choisit la créature la plus menaçante (proche de Noa d'abord),
//            esquive les coups, enchaîne coups et pouvoir spécial ; sans
//            ennemi, escorte Noa et le rejoint s'il s'éloigne.
import * as THREE from 'three';
import { HeroModel, PALETTES } from './heroModel.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const angleDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// Héros alliés (créations originales).
export const HEROES = {
  volt: { name: 'Volt', palette: 'volt', color: '#7fe3ff', power: 'chain', desc: 'Électricité : éclairs en chaîne.' },
  brasier: { name: 'Brasier', palette: 'brasier', color: '#ff9a3d', power: 'nova', desc: 'Feu : onde de flammes autour de lui.' },
  rempart: { name: 'Rempart', palette: 'rempart', color: '#9fc8ff', power: 'guard', desc: 'Bouclier : charge et protège Noa (soin).' },
  spectre: { name: 'Spectre', palette: 'spectre', color: '#b48cff', power: 'blink', desc: 'Ombre : se téléporte derrière l’ennemi.' },
};

export class Fighter {
  constructor(game, { kind, heroId = null, x, z }) {
    this.game = game;
    this.kind = kind;
    this.heroId = heroId;
    const H = heroId ? HEROES[heroId] : null;
    const pal = H ? PALETTES[H.palette] : PALETTES[Math.random() < 0.5 ? 'police' : 'policeB'];
    this.model = new HeroModel(pal, { backpack: false, rim: kind === 'hero' ? H.color : '#9fd8ff', lite: kind === 'police' });
    game.scene.add(this.model.root);
    this.pos = V(x, 0.15, z);
    this.vel = V(0, 0, 0);
    this.yaw = Math.random() * Math.PI * 2;
    this.radius = 0.4;
    this.maxHp = kind === 'hero' ? 400 : 90;
    this.hp = this.maxHp;
    this.alive = true;
    this.def = { height: 1.8, name: H ? H.name : 'Policier', color: H ? H.color : '#4f74c9' };
    this.name = this.def.name;
    this.state = 'idle';
    this.phase = 0;
    this.anim = null;
    this.animT = 0;
    this.atkCd = 0.5 + Math.random();
    this.specialCd = 3 + Math.random() * 3;
    this.dodgeCd = 0;
    this.combo = 0;
    this.deadT = 0;
    this.stuckT = 0;
    this.side = Math.random() < 0.5 ? -1 : 1; // sens de contournement
    this.target = null;
    this.hitPending = null;
  }

  play(anim, dur) {
    this.anim = anim;
    this.animT = 0;
    this.animDur = dur;
  }

  // Coup reçu (de Noa pour la police ; des créatures n'en infligent pas aux alliés).
  takeHit({ damage, dir, knock = 3 }) {
    if (!this.alive) return false;
    const g = this.game;
    this.hp -= damage;
    this.vel.addScaledVector(dir, Math.min(12, 2 + knock));
    g.fx.hitSpark({ x: this.pos.x - dir.x * 0.3, y: this.pos.y + 1.2, z: this.pos.z - dir.z * 0.3 }, '#ffffff', damage > 30);
    g.audio.hit(this.pos, damage > 30);
    if (this.kind === 'police') g.police?.crime(this.hp <= 0 ? 2 : 1, this.pos, true);
    if (this.hp <= 0) {
      this.alive = false;
      this.deadT = 0;
      this.state = 'down';
      g.fx.starBurst({ x: this.pos.x, y: this.pos.y + 1.4, z: this.pos.z }, '#fff27a', 1.6);
    } else {
      this.play('scared', 0.35);
      this.atkCd = Math.max(this.atkCd, 0.5);
    }
    return true;
  }

  dispose() {
    this.game.scene.remove(this.model.root);
  }

  // ---------- Déplacement avec contournement d'obstacles ----------
  #moveTo(tx, tz, speed, dt, stopAt = 0) {
    const col = this.game.col;
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt) return 0;
    let want = Math.atan2(dx, dz);
    // Contournement : si bloqué, on longe l'obstacle quelques instants.
    if (this.stuckT > 0) want += this.side * 1.1;
    this.yaw += angleDiff(this.yaw, want) * (1 - Math.exp(-10 * dt));
    const sp = Math.min(speed, (d - stopAt) / dt);
    const before = this.pos.clone();
    const r = col.moveCylinder(this.pos, this.radius, 1.8, Math.sin(want) * sp * dt, Math.cos(want) * sp * dt);
    const moved = this.pos.distanceTo(before) / dt;
    if (r?.hitWall && moved < speed * 0.4) {
      this.stuckT = 0.8;
      if (Math.random() < 0.02) this.side *= -1;
    } else this.stuckT = Math.max(0, this.stuckT - dt);
    return moved;
  }

  #face(tx, tz, dt, rate = 12) {
    this.yaw += angleDiff(this.yaw, Math.atan2(tx - this.pos.x, tz - this.pos.z)) * (1 - Math.exp(-rate * dt));
  }

  // Écartement entre combattants pour ne pas s'empiler sur la cible.
  #separate(dt, list) {
    for (const o of list) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < 1.2) {
        const push = (1.2 - d) * 3 * dt;
        this.game.col.moveCylinder(this.pos, this.radius, 1.8, (dx / d) * push, (dz / d) * push);
      }
    }
  }

  update(dt, peers) {
    const g = this.game;
    this.atkCd -= dt;
    this.specialCd -= dt;
    this.dodgeCd -= dt;
    if (this.anim) {
      this.animT += dt;
      if (this.animT >= this.animDur) this.anim = null;
    }
    let moving = 0;
    if (!this.alive) {
      this.deadT += dt;
    } else {
      // Recul
      if (this.vel.lengthSq() > 0.01) {
        this.vel.multiplyScalar(Math.exp(-6 * dt));
        g.col.moveCylinder(this.pos, this.radius, 1.8, this.vel.x * dt, this.vel.z * dt);
      }
      moving = this.kind === 'police' ? this.#police(dt) : this.#hero(dt);
      this.#separate(dt, peers);
      // Coup porté au bon moment de l'animation.
      if (this.hitPending) {
        this.hitPending.t -= dt;
        if (this.hitPending.t <= 0) {
          this.hitPending.fn();
          this.hitPending = null;
        }
      }
    }
    this.pos.y = g.col.groundHeight(this.pos.x, this.pos.z, this.radius, this.pos.y + 0.5);
    this.phase += (moving / (1.3 + 1.4 * Math.min(1.6, moving / 5.8))) * Math.PI * 2 * dt;
    this.model.animate({
      dt, speed: moving / 5.8 * 1.6, phase: this.phase, airborne: false, vy: 0,
      anim: this.anim, animP: this.anim ? Math.min(1, this.animT / this.animDur) : 0,
      dead: !this.alive, deadP: Math.min(1, this.deadT * 1.5),
    });
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }

  // ---------- Police ----------
  #police(dt) {
    const g = this.game;
    const hero = g.hero;
    const wanted = g.police?.stars || 0;
    if (!wanted || hero.dead || g.zone !== 'city') {
      // Plus recherché : on s'éloigne tranquillement (puis on disparaît).
      this.state = 'leave';
      const away = this.pos.clone().sub(hero.pos).setY(0).normalize();
      return this.#moveTo(this.pos.x + away.x * 10, this.pos.z + away.z * 10, 1.6, dt);
    }
    const d = Math.hypot(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z);
    // Sur les toits ou en vol, Noa échappe aux agents au sol (ils l'attendent en bas).
    const high = hero.pos.y > 8;
    if (high) {
      this.state = 'search';
      this.#face(hero.pos.x, hero.pos.z, dt, 3);
      return d > 10 ? this.#moveTo(hero.pos.x, hero.pos.z, 3.5, dt, 8) : 0;
    }
    const sees = d < 40 && g.col.lineOfSight(V(this.pos.x, 1.6, this.pos.z), V(hero.pos.x, hero.pos.y + 1.2, hero.pos.z));
    if (sees) g.police.seen(hero.pos);
    // Taser à distance (3 étoiles et plus) : arc électrique.
    if (wanted >= 3 && sees && d > 4 && d < 18 && this.specialCd <= 0) {
      this.specialCd = 3 + Math.random() * 1.5;
      this.#face(hero.pos.x, hero.pos.z, 1);
      this.play('jabR', 0.4);
      this.hitPending = {
        t: 0.2,
        fn: () => {
          const from = this.pos.clone().add(V(0, 1.3, 0));
          const to = hero.pos.clone().add(V(0, 1.1, 0));
          g.fx.bolt(from, to, '#9fe8ff', 9);
          g.audio.magnetThrow?.();
          if (Math.random() < 0.75) hero.takeDamage(8 + wanted * 2, this.pos, { knock: 2, source: this });
        },
      };
      return 0;
    }
    if (d > 1.7) {
      this.state = 'chase';
      // Approche en éventail : chacun vise un point autour de Noa.
      const a = this.side * 0.9 + (this.heroId ? 0 : (this.model.root.id % 5) * 0.5);
      const tx = d > 6 ? hero.pos.x : hero.pos.x + Math.sin(a) * 1.3;
      const tz = d > 6 ? hero.pos.z : hero.pos.z + Math.cos(a) * 1.3;
      return this.#moveTo(tx, tz, d > 12 ? 7.2 : 5.2, dt, 1.2);
    }
    // Interpellation : coups de matraque.
    this.state = 'arrest';
    this.#face(hero.pos.x, hero.pos.z, dt);
    if (this.atkCd <= 0) {
      this.atkCd = 1.0 + Math.random() * 0.6;
      this.play(this.combo++ % 2 ? 'jabL' : 'jabR', 0.45);
      this.hitPending = {
        t: 0.15,
        fn: () => {
          if (Math.hypot(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z) < 2.2) hero.takeDamage(6 + wanted * 2, this.pos, { knock: 3, source: this });
        },
      };
    }
    return 0;
  }

  // ---------- Héros allié ----------
  #pickTarget() {
    const g = this.game;
    const hero = g.hero;
    let best = null;
    let bestScore = Infinity;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const dSelf = e.pos.distanceTo(this.pos);
      const dHero = e.pos.distanceTo(hero.pos);
      if (dSelf > 45 && dHero > 30) continue;
      // Priorité : ce qui menace Noa, puis ce qui est proche, puis les blessés.
      const score = dSelf + dHero * 0.8 - (e.state === 'attack' || e.state === 'charge' ? 6 : 0) + (e.hp / e.def.hp) * 4;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  #hero(dt) {
    const g = this.game;
    const hero = g.hero;
    const H = HEROES[this.heroId];
    if (!this.target || !this.target.alive || Math.random() < dt * 0.5) this.target = this.#pickTarget();
    const e = this.target;
    if (!e) {
      // Escorte : reste à 3-5 m de Noa, sur le côté.
      this.state = 'follow';
      const side = V(Math.cos(hero.yaw), 0, -Math.sin(hero.yaw)).multiplyScalar(this.side * 2.5);
      const tx = hero.pos.x + side.x - Math.sin(hero.yaw) * 1.5;
      const tz = hero.pos.z + side.z - Math.cos(hero.yaw) * 1.5;
      const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
      // Trop loin ou coincé derrière un obstacle : il « arrive en renfort ».
      this.lostT = d > 7 && this.stuckT > 0 ? (this.lostT || 0) + dt : 0;
      if (d > 30 || this.lostT > 1.5) {
        this.lostT = 0;
        this.pos.set(tx, hero.pos.y, tz);
        g.fx.ring(this.pos, { color: H.color, from: 0.3, to: 3, life: 0.4 });
      }
      if (d < 1) this.#face(hero.pos.x + Math.sin(hero.yaw) * 10, hero.pos.z + Math.cos(hero.yaw) * 10, dt, 4);
      return this.#moveTo(tx, tz, d > 8 ? 8.5 : 4.5, dt, 0.6);
    }
    const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    // Esquive : si la créature attaque de près, saut de côté.
    if (d < 3 && this.dodgeCd <= 0 && (e.state === 'attack' || e.state === 'lunge' || e.state === 'slam' || e.state === 'charge')) {
      this.dodgeCd = 2.5;
      const side = V(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(this.side * 3);
      this.vel.add(side.multiplyScalar(3));
      this.play('scared', 0.3);
      return 4;
    }
    // Pouvoir spécial
    if (this.specialCd <= 0 && d < 12) {
      this.specialCd = 6 + Math.random() * 2;
      this.#special(H, e);
      return 0;
    }
    const reach = 1.4 + e.radius;
    if (d > reach) {
      this.state = 'chase';
      return this.#moveTo(e.pos.x, e.pos.z, 8, dt, reach - 0.2);
    }
    this.state = 'fight';
    this.#face(e.pos.x, e.pos.z, dt);
    if (this.atkCd <= 0) {
      this.atkCd = 0.45 + Math.random() * 0.25;
      const heavy = this.combo % 3 === 2;
      this.play(heavy ? 'ringPunch' : this.combo % 2 ? 'jabL' : 'jabR', heavy ? 0.55 : 0.35);
      this.combo++;
      this.hitPending = {
        t: heavy ? 0.2 : 0.1,
        fn: () => {
          if (!e.alive) return;
          const dir = V(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
          e.takeHit({ damage: heavy ? 38 : 18, dir, knock: heavy ? 7 : 2.5, poise: heavy ? 40 : 12, heavy, power: true });
          g.fx.coreImpact({ x: e.pos.x - dir.x * e.radius, y: e.pos.y + e.def.height * 0.55, z: e.pos.z - dir.z * e.radius }, null, H.color, heavy);
          g.fx.swoosh(this.pos, this.yaw, { color: H.color, radius: 1.6, arc: 1.5, width: 0.45, tilt: 0.7, life: 0.18, flip: this.combo % 2 === 0 });
        },
      };
    }
    return 0;
  }

  #special(H, e) {
    const g = this.game;
    const hero = g.hero;
    const c = H.color;
    this.play('volley', 0.6);
    if (H.power === 'chain') {
      // Éclairs en chaîne : jusqu'à 4 créatures.
      let from = this.pos.clone().add(V(0, 1.4, 0));
      const hit = new Set();
      let cur = e;
      for (let i = 0; i < 4 && cur; i++) {
        hit.add(cur);
        const to = cur.pos.clone().add(V(0, cur.def.height * 0.6, 0));
        g.fx.bolt(from, to, c, 8);
        cur.takeHit({ damage: 45, dir: to.clone().sub(from).setY(0).normalize(), knock: 2, poise: 30, heavy: true, power: true });
        from = to;
        cur = g.enemies.filter((x) => x.alive && !hit.has(x) && x.pos.distanceTo(to) < 9).sort((a, b) => a.pos.distanceTo(to) - b.pos.distanceTo(to))[0];
      }
      g.fx.flash(this.pos, c, 40, 0.2);
    } else if (H.power === 'nova') {
      // Onde de flammes autour de lui.
      g.fx.ring(this.pos, { color: c, from: 0.5, to: 8, life: 0.5 });
      g.fx.emit(this.pos.clone().add(V(0, 1, 0)), { count: 60, color: '#ffb347', speed: 12, up: 3, size: 0.35, life: 0.6, gravity: 2 });
      for (const x of g.enemies) if (x.alive && x.pos.distanceTo(this.pos) < 7) x.takeHit({ damage: 60, dir: x.pos.clone().sub(this.pos).setY(0).normalize(), knock: 10, poise: 60, heavy: true, power: true });
      g.shake(0.3, this.pos);
    } else if (H.power === 'guard') {
      // Charge au bouclier + soin de Noa s'il est proche.
      const dir = V(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
      this.vel.addScaledVector(dir, 16);
      g.fx.ring(this.pos.clone().add(V(0, 1, 0)), { color: c, from: 0.4, to: 3, life: 0.4, y: 0 });
      this.hitPending = { t: 0.3, fn: () => e.alive && e.takeHit({ damage: 50, dir, knock: 14, poise: 90, heavy: true, power: true }) };
      if (hero.pos.distanceTo(this.pos) < 12) {
        hero.hp = Math.min(hero.stats.maxHp, hero.hp + 30);
        g.fx.ring(hero.pos, { color: '#6fcf97', from: 0.3, to: 2.5, life: 0.5 });
        g.hud.toast(`${H.name} te soigne (+30)`, '#6fcf97');
      }
    } else if (H.power === 'blink') {
      // Se téléporte derrière la créature et frappe.
      g.fx.ink(this.pos.clone().add(V(0, 1, 0)), 0.8);
      const back = V(Math.sin(e.yaw ?? 0), 0, Math.cos(e.yaw ?? 0)).multiplyScalar(-(e.radius + 1));
      this.pos.set(e.pos.x + back.x, this.pos.y, e.pos.z + back.z);
      g.fx.ink(this.pos.clone().add(V(0, 1, 0)), 0.8);
      this.#face(e.pos.x, e.pos.z, 1);
      e.takeHit({ damage: 70, dir: back.clone().negate().normalize(), knock: 5, poise: 50, heavy: true, power: true });
      e.stagger?.(1.2);
    }
  }
}
