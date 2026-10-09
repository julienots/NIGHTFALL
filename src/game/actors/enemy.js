// IA des créatures : machine à états modulaire.
// Communs : patrouille, perception (vue + ouïe + ligne de vue), enquête,
// poursuite, alerte du groupe, perte de cible, retour à la zone, repli.
// Spécifiques : Stalker (observe, contourne, bondit) et Brute (rugit, frappe
// le sol, balaie, charge), avec attaques télégraphiées.
import * as THREE from 'three';
import { StalkerModel, BruteModel } from './enemyModels.js';

export const ENEMY_TYPES = {
  stalker: {
    name: 'Stalker', Model: StalkerModel, hp: 70, radius: 0.45, height: 2.2, mass: 1,
    walk: 2.2, run: 7.2, sight: 26, fov: 2.2, hearing: 14, poise: 0,
    xp: 40, credits: [8, 18], color: '#7dff6a', leash: 40, forget: 5,
    loot: [{ id: 'scrap', chance: 0.5, qty: [1, 2] }, { id: 'abyss_fragment', chance: 0.12, qty: [1, 1] }],
  },
  brute: {
    name: 'Brute', Model: BruteModel, hp: 340, radius: 1.05, height: 3.0, mass: 0.22,
    walk: 1.6, run: 4.3, sight: 22, fov: 2.0, hearing: 18, poise: 120,
    xp: 140, credits: [40, 70], color: '#ff5a2a', leash: 45, forget: 7,
    loot: [{ id: 'scrap', chance: 1, qty: [3, 5] }, { id: 'abyss_fragment', chance: 0.6, qty: [1, 2] }],
  },
};

const angleDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class Enemy {
  constructor(game, spawn) {
    this.game = game;
    this.spawn = spawn;
    this.type = spawn.type;
    this.def = ENEMY_TYPES[spawn.type];
    this.model = new this.def.Model();
    this.radius = this.def.radius;
    this.pos = new THREE.Vector3(spawn.x, 0.15, spawn.z);
    this.home = this.pos.clone();
    this.patrol = (spawn.patrol || [[spawn.x, spawn.z]]).map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.patrolI = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.hp = this.def.hp;
    this.poise = this.def.poise;
    this.alive = true;
    this.state = 'patrol';
    this.stateT = 0;
    this.wait = Math.random() * 2;
    this.lastKnown = null;
    this.sinceSeen = Infinity;
    this.sees = false;
    this.alert = false;
    this.perceiveT = Math.random() * 0.2;
    this.phase = 0;
    this.speedNow = 0;
    this.flash = 0;
    this.showBar = 0;
    this.deadT = 0;
    this.attackHit = false;
    this.telegraph = null;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.retreated = false;
    this.model.root.position.copy(this.pos);
  }

  get name() {
    return this.def.name;
  }

  #set(state) {
    this.telegraph?.cancel();
    this.telegraph = null;
    this.state = state;
    this.stateT = 0;
    this.attackHit = false;
  }

  // ---------- Perception ----------
  #perceive() {
    const hero = this.game.hero;
    if (hero.dead) {
      this.sees = false;
      return;
    }
    const dx = hero.pos.x - this.pos.x;
    const dz = hero.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    let sees = false;
    const range = this.alert ? this.def.sight * 1.3 : this.def.sight;
    if (d < range) {
      const ang = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz)));
      // Vision périphérique très proche : on « sent » le joueur à moins de 3 m.
      if (ang < this.def.fov / 2 || d < 3 || this.alert) {
        const eye = { x: this.pos.x, y: this.pos.y + this.def.height * 0.85, z: this.pos.z };
        const tgt = { x: hero.pos.x, y: hero.pos.y + 1.4, z: hero.pos.z };
        sees = this.game.col.lineOfSight(eye, tgt);
      }
    }
    // Ouïe : sprint, combat, pouvoirs.
    const noise = this.game.heroNoise;
    if (!sees && noise > 0 && d < this.def.hearing * noise) {
      this.lastKnown = hero.pos.clone();
      if (this.state === 'patrol' || this.state === 'return') this.#set('investigate');
    }
    this.sees = sees;
    if (sees) {
      this.lastKnown = hero.pos.clone();
      this.sinceSeen = 0;
      if (!this.alert) this.#onSpot();
    }
  }

  #onSpot() {
    this.alert = true;
    this.game.onEnemyAlert(this);
    if (this.type === 'stalker') {
      this.game.audio.stalkerClick(this.pos);
      this.#set('observe');
      this.observeFor = 1.2 + Math.random() * 1.6;
    } else {
      this.game.audio.bruteRoar(this.pos);
      this.#set('roar');
    }
  }

  // Alerte transmise par un congénère.
  alertTo(pos) {
    if (!this.alive || this.alert) return;
    this.lastKnown = pos.clone();
    this.alert = true;
    this.sinceSeen = 0.5;
    this.#set(this.type === 'stalker' ? 'circle' : 'chase');
  }

  // ---------- Dégâts reçus ----------
  takeHit({ damage, dir, knock, poise, heavy, power }) {
    if (!this.alive) return false;
    this.hp -= damage;
    this.flash = 1;
    this.showBar = 4;
    this.game.onEnemyDamaged(this, damage, heavy);
    this.game.fx.ichor({ x: this.pos.x, y: this.pos.y + this.def.height * 0.55, z: this.pos.z }, this.def.color);
    this.game.fx.hitSpark({ x: this.pos.x - dir.x * this.radius, y: this.pos.y + this.def.height * 0.55, z: this.pos.z - dir.z * this.radius }, power ? '#c38cff' : '#ffd27a', heavy);
    this.game.audio.hit(this.pos, heavy);
    this.vel.addScaledVector(dir, knock * this.def.mass * (this.state === 'charge' ? 0.2 : 1));
    if (!this.alert) {
      this.lastKnown = this.game.hero.pos.clone();
      this.alertTo(this.game.hero.pos);
    }
    this.sinceSeen = 0;
    if (this.hp <= 0) {
      this.#die();
      return true;
    }
    if (this.type === 'stalker') {
      // Interrompu sauf pendant le bond déjà lancé.
      if (this.state !== 'lunge' || heavy) this.#set('stagger');
      this.staggerFor = heavy ? 0.7 : 0.35;
      if (!this.retreated && this.hp < this.def.hp * 0.3) {
        this.retreated = true;
        this.retreatAfter = true;
      }
    } else {
      this.poise -= poise;
      if (this.poise <= 0) {
        this.poise = this.def.poise;
        this.#set('stagger');
        this.staggerFor = power ? 2.0 : 1.4;
        this.game.onEnemyBroken(this);
      }
    }
    return true;
  }

  #die() {
    this.alive = false;
    this.#set('dead');
    this.game.audio.enemyDie(this.pos, this.type === 'brute');
    this.game.onEnemyKilled(this);
  }

  // ---------- Attaques vers le héros ----------
  #strike(damage, opts) {
    const r = this.game.hero.takeDamage(damage, this.pos, opts);
    this.attackHit = true;
    return r;
  }

  #heroDist() {
    const h = this.game.hero.pos;
    return Math.hypot(h.x - this.pos.x, h.z - this.pos.z);
  }

  #faceHero(dt, rate = 8) {
    const h = this.game.hero.pos;
    this.#faceTo(Math.atan2(h.x - this.pos.x, h.z - this.pos.z), dt, rate);
  }

  #faceTo(yaw, dt, rate) {
    this.yaw += angleDiff(this.yaw, yaw) * (1 - Math.exp(-rate * dt));
  }

  // Déplacement vers un point (renvoie la distance restante).
  #moveTo(target, speed, dt, rate = 6) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    this.#faceTo(Math.atan2(dx, dz), dt, rate);
    // Avance dans la direction regardée (virages naturels).
    const s = Math.min(speed, d / dt);
    this.desired.set(Math.sin(this.yaw) * s, 0, Math.cos(this.yaw) * s);
    return d;
  }

  update(dt) {
    this.desired = this.desired || new THREE.Vector3();
    this.desired.set(0, 0, 0);
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.showBar = Math.max(0, this.showBar - dt);

    if (!this.alive) {
      this.deadT += dt;
      this.model.animate({ mode: 'dead', p: this.deadT, dt, speed: 0, phase: 0 });
      this.model.setFlash(0);
      if (this.deadT > 2.2) this.model.setDissolve(Math.min(1, (this.deadT - 2.2) / 1.2));
      this.#physics(dt);
      return;
    }

    this.perceiveT -= dt;
    if (this.perceiveT <= 0) {
      this.perceiveT = 0.15;
      this.#perceive();
    }
    if (this.sees) this.sinceSeen = 0;
    else this.sinceSeen += dt;

    // Perte de cible / laisse
    const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    if (this.alert && (this.sinceSeen > this.def.forget || fromHome > this.def.leash || this.game.hero.dead)) {
      this.alert = false;
      this.#set(fromHome > this.def.leash || this.game.hero.dead ? 'return' : 'investigate');
    }

    if (this.type === 'stalker') this.#stalkerAI(dt);
    else this.#bruteAI(dt);

    this.#physics(dt);
    this.#animate(dt);
  }

  // ---------- États communs ----------
  #commonStates(dt) {
    switch (this.state) {
      case 'patrol': {
        const p = this.patrol[this.patrolI];
        if (this.wait > 0) {
          this.wait -= dt;
          return true;
        }
        if (this.#moveTo(p, this.def.walk, dt, 3) < 0.6) {
          this.patrolI = (this.patrolI + 1) % this.patrol.length;
          this.wait = 1 + Math.random() * 2.5;
        }
        return true;
      }
      case 'investigate': {
        if (!this.lastKnown) {
          this.#set('return');
          return true;
        }
        const d = this.#moveTo(this.lastKnown, this.def.walk * 1.6, dt, 5);
        if (d < 1.2 || this.stateT > 8) {
          // Regarde autour puis abandonne
          this.yaw += dt * 1.5 * Math.sin(this.stateT * 2);
          if (this.stateT > 3 && d < 1.2) this.#set('return');
          if (this.stateT > 10) this.#set('return');
        }
        return true;
      }
      case 'return': {
        this.hp = Math.min(this.def.hp, this.hp + dt * this.def.hp * 0.1);
        if (this.#moveTo(this.home, this.def.walk * 1.5, dt, 4) < 1) this.#set('patrol');
        return true;
      }
      case 'stagger':
        if (this.stateT > this.staggerFor) {
          if (this.retreatAfter) {
            this.retreatAfter = false;
            this.#set('retreat');
          } else this.#set(this.type === 'stalker' ? 'circle' : 'chase');
        }
        return true;
      default:
        return false;
    }
  }

  // ---------- Stalker ----------
  #stalkerAI(dt) {
    if (this.#commonStates(dt)) return;
    const hero = this.game.hero;
    const d = this.#heroDist();
    switch (this.state) {
      case 'observe':
        this.#faceHero(dt, 5);
        if (this.stateT > this.observeFor || d < 6) this.#set('circle');
        if (Math.random() < dt * 0.6) this.game.audio.stalkerClick(this.pos);
        break;
      case 'circle': {
        // Contourne vers le dos du joueur en gardant ses distances.
        const toMe = Math.atan2(this.pos.x - hero.pos.x, this.pos.z - hero.pos.z);
        const behind = hero.yaw + Math.PI;
        this.strafeDir = angleDiff(toMe, behind) > 0 ? 1 : -1;
        const want = 7.5;
        const ang = toMe + this.strafeDir * 0.9;
        const target = new THREE.Vector3(hero.pos.x + Math.sin(ang) * want, 0, hero.pos.z + Math.cos(ang) * want);
        this.#moveTo(target, this.def.run * 0.75, dt, 7);
        // Toujours tourné vers sa proie quand il est proche
        if (d < 12) this.#faceHero(dt, 6);
        const flanked = Math.abs(angleDiff(toMe, behind)) < 1.1;
        if (d < 2.4 && this.stateT > 0.3) this.#set('swipeWindup');
        else if ((this.stateT > 1.4 && flanked) || this.stateT > 3.2) {
          if (d < 11 && this.game.attackToken(this)) this.#set('windup');
        }
        if (!this.sees && this.stateT > 2 && this.lastKnown) this.#moveTo(this.lastKnown, this.def.run, dt);
        break;
      }
      case 'windup':
        // Télégraphe : lueur verte stridente + sifflement, 0,55 s.
        this.#faceHero(dt, 10);
        if (this.stateT < dt * 1.5) {
          this.game.audio.stalkerHiss(this.pos);
          this.game.fx.flash({ x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z }, '#7dff6a', 12, 0.5);
        }
        if (this.stateT > 0.55) {
          this.lungeDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          this.#set('lunge');
        }
        break;
      case 'lunge':
        this.desired.copy(this.lungeDir).multiplyScalar(16 * Math.max(0.2, 1 - this.stateT / 0.45));
        if (!this.attackHit && d < this.radius + hero.radius + 0.9) this.#strike(16, { knock: 7 });
        if (this.stateT > 0.45) this.#set('recover');
        break;
      case 'swipeWindup':
        this.#faceHero(dt, 10);
        if (this.stateT < dt * 1.5) this.game.audio.telegraph(this.pos);
        if (this.stateT > 0.42) this.#set('swipe');
        break;
      case 'swipe': {
        if (!this.attackHit && this.stateT > 0.08) {
          const ang = Math.abs(angleDiff(this.yaw, Math.atan2(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z)));
          if (d < 2.6 && ang < 1.1) this.#strike(11, { knock: 4 });
          else this.attackHit = true;
        }
        if (this.stateT > 0.35) this.#set('recover');
        break;
      }
      case 'recover':
        // Fenêtre de vulnérabilité après l'attaque.
        if (this.stateT > 0.75) {
          this.game.releaseToken(this);
          this.#set('circle');
        }
        break;
      case 'retreat': {
        const away = new THREE.Vector3(this.pos.x - hero.pos.x, 0, this.pos.z - hero.pos.z).normalize().multiplyScalar(10).add(this.pos);
        this.#moveTo(away, this.def.run, dt, 8);
        if (this.stateT > 2.2) this.#set('circle');
        break;
      }
      default:
        this.#set('patrol');
    }
  }

  // ---------- Brute ----------
  #bruteAI(dt) {
    if (this.#commonStates(dt)) return;
    const hero = this.game.hero;
    const d = this.#heroDist();
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    switch (this.state) {
      case 'roar':
        this.#faceHero(dt, 3);
        if (this.stateT > 1.3) this.#set('chase');
        break;
      case 'chase': {
        const target = this.sees ? hero.pos : this.lastKnown || this.home;
        this.#moveTo(target, this.def.run, dt, 3.5);
        if (!this.game.attackToken(this)) break;
        if (d < 3.3) this.#set(Math.random() < 0.55 ? 'swipeWindup' : 'slamWindup');
        else if (d < 4.8) this.#set('slamWindup');
        else if (d > 8 && d < 18 && this.sees && this.stateT > 1.5 && Math.random() < dt * 1.2) this.#set('chargeWindup');
        else this.game.releaseToken(this);
        break;
      }
      case 'slamWindup': {
        // Disque rouge au sol : zone d'impact lisible, 1 s pour sortir.
        if (this.stateT < 0.6) this.#faceHero(dt, 4);
        if (!this.telegraph) {
          this.slamAt = this.pos.clone().addScaledVector(fwd, 1.8);
          this.telegraph = this.game.fx.telegraph(this.slamAt, 4.2, 1.0);
          this.game.audio.telegraph(this.pos);
        }
        this.slamAt.copy(this.pos).addScaledVector(fwd, 1.8);
        this.telegraph.outline.m.position.set(this.slamAt.x, this.telegraph.outline.m.position.y, this.slamAt.z);
        this.telegraph.fill.m.position.set(this.slamAt.x, this.telegraph.fill.m.position.y, this.slamAt.z);
        if (this.stateT > 1.0) {
          this.telegraph = null;
          this.#set('slam');
          this.game.fx.slamWave(this.slamAt, 5);
          this.game.audio.bruteSlam(this.slamAt);
          this.game.shake(0.5, this.slamAt);
          const hd = Math.hypot(hero.pos.x - this.slamAt.x, hero.pos.z - this.slamAt.z);
          if (hd < 4.2 + hero.radius && Math.abs(hero.pos.y - this.pos.y) < 1.5) this.#strike(30, { knock: 11, heavy: true });
        }
        break;
      }
      case 'slam':
        if (this.stateT > 1.0) {
          this.game.releaseToken(this);
          this.#set('chase');
        }
        break;
      case 'swipeWindup':
        this.#faceHero(dt, 5);
        if (!this.telegraph) {
          this.telegraph = this.game.fx.telegraph(this.pos.clone().addScaledVector(fwd, 1.6), 2.4, 0.6);
          this.game.audio.telegraph(this.pos);
        }
        if (this.stateT > 0.6) {
          this.telegraph = null;
          this.#set('swipe');
        }
        break;
      case 'swipe': {
        if (!this.attackHit && this.stateT > 0.05) {
          const ang = Math.abs(angleDiff(this.yaw, Math.atan2(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z)));
          if (d < 3.9 + hero.radius && ang < 1.2) this.#strike(20, { knock: 9, heavy: true });
          else this.attackHit = true;
          this.game.audio.swing(true);
        }
        this.desired.copy(fwd).multiplyScalar(2);
        if (this.stateT > 0.7) {
          this.game.releaseToken(this);
          this.#set('chase');
        }
        break;
      }
      case 'chargeWindup':
        this.#faceHero(dt, 6);
        if (this.stateT < dt * 1.5) this.game.audio.bruteRoar(this.pos);
        if (!this.telegraph) {
          // Ligne de charge au sol
          this.telegraph = this.game.fx.telegraph(this.pos.clone().addScaledVector(fwd, 3), 1.6, 0.85);
        }
        if (this.stateT > 0.85) {
          this.chargeDir = fwd.clone();
          this.telegraph = null;
          this.#set('charge');
        }
        break;
      case 'charge': {
        // Légère correction de trajectoire au début seulement.
        if (this.stateT < 0.3) {
          const want = Math.atan2(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z);
          this.#faceTo(want, dt, 2);
          this.chargeDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        }
        this.desired.copy(this.chargeDir).multiplyScalar(15);
        if (Math.random() < dt * 20) this.game.fx.emit({ x: this.pos.x, y: 0.2, z: this.pos.z }, { count: 2, color: '#8a7a6a', speed: 3, size: 0.4, life: 0.5, gravity: 4 });
        if (!this.attackHit && d < this.radius + hero.radius + 0.6) this.#strike(28, { knock: 15, heavy: true });
        if (this.hitWall) {
          // Percute un obstacle : étourdi, vulnérable.
          this.game.shake(0.4, this.pos);
          this.game.audio.bruteSlam(this.pos);
          this.game.fx.slamWave(this.pos.clone().addScaledVector(this.chargeDir, 1), 2.5, '#9a8c7a');
          this.staggerFor = 1.6;
          this.game.releaseToken(this);
          this.#set('stagger');
        } else if (this.stateT > 1.5) {
          this.game.releaseToken(this);
          this.#set('chase');
        }
        break;
      }
      default:
        this.#set('patrol');
    }
  }

  // ---------- Physique ----------
  #physics(dt) {
    const col = this.game.col;
    // Le recul s'amortit ; la vitesse voulue est ajoutée.
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    const vx = this.desired ? this.desired.x + this.vel.x : this.vel.x;
    const vz = this.desired ? this.desired.z + this.vel.z : this.vel.z;
    const before = { x: this.pos.x, z: this.pos.z };
    const r = col.moveCylinder(this.pos, this.radius, this.def.height, vx * dt, vz * dt);
    this.hitWall = r.hitWall && this.state === 'charge';
    const gh = col.groundHeight(this.pos.x, this.pos.z, this.radius, this.pos.y);
    if (gh < this.pos.y - 0.6 || this.vy > 0) {
      this.vy -= 25 * dt;
      this.pos.y = Math.max(gh, this.pos.y + this.vy * dt);
      if (this.pos.y <= gh) this.vy = 0;
    } else this.pos.y = gh;
    this.speedNow = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
  }

  #animate(dt) {
    const sp = this.speedNow / (this.type === 'brute' ? 3 : 4);
    this.phase += dt * (this.type === 'brute' ? 5 : 9) * Math.min(1.6, sp);
    const mode = {
      observe: 'observe', windup: 'windup', lunge: 'lunge', swipeWindup: this.type === 'brute' ? 'swipeWindup' : 'windup',
      swipe: 'swipe', recover: 'recover', stagger: 'stagger', roar: 'roar', slamWindup: 'slamWindup', slam: 'slam',
      chargeWindup: 'chargeWindup', charge: 'charge',
    }[this.state] || 'move';
    const p = mode === 'roar' ? this.stateT / 1.3 : mode === 'windup' ? Math.min(1, this.stateT / 0.55) : mode === 'slamWindup' ? Math.min(1, this.stateT / 0.9) : mode === 'swipeWindup' ? Math.min(1, this.stateT / 0.5) : Math.min(1, this.stateT / 0.3);
    this.model.animate({ mode, speed: sp, phase: this.phase, p, dt, alert: this.alert });
    this.model.setFlash(this.flash);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }
}
