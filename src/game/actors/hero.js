// Contrôleur du héros : déplacements, saut, esquive, combos, attaque lourde,
// attaque plongeante, pouvoir VOID STRIKE, réception des dégâts.
import * as THREE from 'three';
import { HeroModel } from './heroModel.js';

export const MOVES = {
  light: [
    { anim: 'jabR', dur: 0.34, hit: 0.3, range: 2.2, arc: 1.7, mult: 1.0, knock: 2.5, poise: 12, lunge: 2.5 },
    { anim: 'jabL', dur: 0.34, hit: 0.3, range: 2.2, arc: 1.7, mult: 1.1, knock: 2.5, poise: 12, lunge: 2.5 },
    { anim: 'hook', dur: 0.56, hit: 0.4, range: 2.5, arc: 2.3, mult: 1.8, knock: 7, poise: 35, lunge: 3.5, heavy: true },
  ],
  heavy: { anim: 'slam', dur: 0.9, hit: 0.55, range: 2.8, arc: 2.6, mult: 2.6, knock: 9, poise: 70, lunge: 2, aoe: 2.4, heavy: true },
  power: { anim: 'voidStrike', dur: 0.8, hit: 0.45, range: 7.5, arc: 1.5, mult: 4.2, knock: 18, poise: 250, energy: 35, cooldown: 4, heavy: true },
  dive: { anim: 'diveImpact', dur: 0.45, aoe: 3.3, mult: 2.0, knock: 8, poise: 50, heavy: true },
};

const RADIUS = 0.42;
const HEIGHT = 1.8;
const GRAVITY = 25;
const JUMP_V = 8.7;

const angleDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class Hero {
  constructor(game) {
    this.game = game;
    this.model = new HeroModel();
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.vy = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.action = null;
    this.combo = 0;
    this.comboReset = 0;
    this.buffer = null;
    this.powerCd = 0;
    this.dodgeCd = 0;
    this.hurtT = 0;
    this.flash = 0;
    this.stepDist = 0;
    this.phase = 0;
    this.speed01 = 0;
    this.lean = 0;
    this.dead = false;
    this.deadT = 0;
    this.stats = { maxHp: 120, maxEnergy: 100, damage: 10, defense: 0, energyGain: 0, powerDamage: 0 };
    this.hp = 120;
    this.energy = 60;
  }

  get radius() {
    return RADIUS;
  }

  get busy() {
    return !!this.action;
  }

  setStats(stats) {
    const hpRatio = this.hp / this.stats.maxHp;
    this.stats = stats;
    this.hp = Math.min(stats.maxHp, Math.max(1, Math.round(hpRatio * stats.maxHp)));
    this.energy = Math.min(this.energy, stats.maxEnergy);
  }

  placeAt(p, yaw = 0) {
    this.pos.set(p.x, p.y ?? 0, p.z);
    this.yaw = yaw;
    this.vy = 0;
    this.vel.set(0, 0, 0);
    this.action = null;
  }

  revive() {
    this.dead = false;
    this.deadT = 0;
    this.hp = this.stats.maxHp;
    this.energy = this.stats.maxEnergy * 0.5;
    this.action = null;
    this.hurtT = 0;
  }

  facing() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  playAnim(anim, dur) {
    this.action = { kind: 'anim', anim, dur, t: 0, lockMove: true };
  }

  // ---------- Combat ----------
  #pickAim(maxDist, inputDir) {
    const { enemies, lockTarget } = this.game;
    if (lockTarget && lockTarget.alive) return lockTarget;
    let best = null;
    let bestScore = Infinity;
    const ref = inputDir || this.facing();
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist || Math.abs(e.pos.y - this.pos.y) > 2.5) continue;
      const dot = (dx * ref.x + dz * ref.z) / (d || 1);
      if (dot < -0.2) continue;
      const score = d - dot * 2;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  #startMove(def, kind, inputDir) {
    const target = this.#pickAim(kind === 'power' ? 9 : 4.5, inputDir);
    if (target) {
      this.yaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    } else if (inputDir) {
      this.yaw = Math.atan2(inputDir.x, inputDir.z);
    }
    // La fente s'arrête au contact de la cible.
    let lunge = def.lunge || 0;
    if (target) {
      const d = Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z) - target.radius - RADIUS - 0.4;
      lunge = Math.max(0, Math.min(lunge * def.dur * 0.5, d)) / (def.dur * 0.5);
    }
    this.action = { kind, def, t: 0, hitDone: false, anim: def.anim, lunge };
    this.game.audio.swing(!!def.heavy);
  }

  #resolveHit(def) {
    const f = this.facing();
    const center = def.aoe ? this.pos.clone().addScaledVector(f, def === MOVES.dive ? 0 : 1.2) : this.pos;
    let hits = 0;
    const base = this.stats.damage * def.mult * (def === MOVES.power ? 1 + this.stats.powerDamage : 1);
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - center.x;
      const dz = e.pos.z - center.z;
      const d = Math.hypot(dx, dz);
      if (Math.abs(e.pos.y - this.pos.y) > 2.6) continue;
      let ok;
      if (def.aoe) ok = d <= def.aoe + e.radius;
      else {
        const ang = Math.abs(angleDiff(this.yaw, Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z)));
        const dd = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        ok = dd <= def.range + e.radius && (ang <= def.arc / 2 || dd < e.radius + RADIUS + 0.3);
      }
      if (!ok) continue;
      const dir = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
      const dmg = Math.round(base * (0.92 + Math.random() * 0.16));
      if (e.takeHit({ damage: dmg, dir, knock: def.knock, poise: def.poise, heavy: !!def.heavy, power: def === MOVES.power })) hits++;
    }
    if (hits) {
      this.energy = Math.min(this.stats.maxEnergy, this.energy + hits * (4 + this.stats.energyGain));
      this.game.hitStop(def.heavy ? 0.09 : 0.05);
      this.game.shake(def.heavy ? 0.35 : 0.15);
      this.flash = Math.max(this.flash, 0.5);
    }
    return hits;
  }

  // Renvoie 'dodged' | true (touché) | false (ignoré).
  takeDamage(amount, from, { knock = 4, heavy = false } = {}) {
    if (this.dead) return false;
    if (this.action?.kind === 'dodge' && this.action.t < 0.3) {
      this.energy = Math.min(this.stats.maxEnergy, this.energy + 15);
      this.game.onPerfectDodge();
      return 'dodged';
    }
    const dmg = Math.max(1, Math.round(amount * (100 / (100 + this.stats.defense * 4))));
    this.hp -= dmg;
    this.game.onHeroHurt(dmg);
    const dir = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
    this.vel.addScaledVector(dir, knock);
    if (this.action?.kind !== 'power') {
      this.action = { kind: 'hurt', t: 0, dur: heavy ? 0.55 : 0.3 };
    }
    this.hurtT = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.action = null;
      this.game.onHeroDeath();
    }
    return true;
  }

  // ---------- Mise à jour ----------
  update(dt, input, camYaw) {
    const col = this.game.col;
    this.powerCd = Math.max(0, this.powerCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.comboReset -= dt;
    if (this.comboReset <= 0) this.combo = 0;
    this.flash = Math.max(0, this.flash - dt * 2);
    this.hurtT = Math.max(0, this.hurtT - dt * 4);
    this.energy = Math.min(this.stats.maxEnergy, this.energy + dt * 3);

    if (this.dead) {
      this.deadT += dt;
      this.#physics(dt, 0, 0);
      this.#animate(dt);
      return;
    }

    // Direction souhaitée relative à la caméra.
    const mv = input.move();
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3().addScaledVector(fwd, mv.y).addScaledVector(right, -mv.x);
    const wishLen = Math.min(1, wish.length());
    const wishDir = wishLen > 0.01 ? wish.clone().normalize() : null;

    // --- Entrées d'action ---
    if (input.was('jump')) this.jumpBuffer = 0.15;
    this.jumpBuffer -= dt;
    const a = this.action;
    const canCancel = !a || (a.kind === 'attack' && a.hitDone && a.t / a.def.dur > a.def.hit + 0.1);

    if (input.was('dodge') && this.dodgeCd <= 0 && this.grounded && (!a || a.kind === 'attack' || a.kind === 'hurt')) {
      const dir = wishDir || this.facing().negate();
      this.action = { kind: 'dodge', t: 0, dur: 0.42, dir };
      this.yaw = wishDir ? Math.atan2(dir.x, dir.z) : this.yaw;
      this.dodgeCd = 0.55;
      this.game.audio.dodge();
      this.game.fx.emit({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z }, { count: 16, color: '#a060ff', speed: 2, size: 0.3, life: 0.35, gravity: 0 });
    } else if (input.was('power')) {
      const def = MOVES.power;
      if (this.powerCd > 0 || this.energy < def.energy) this.game.onPowerDenied(this.powerCd > 0 ? 'cooldown' : 'energy');
      else if (!a || canCancel || a.kind === 'attack') {
        this.energy -= def.energy;
        this.powerCd = def.cooldown;
        this.#startMove(def, 'power', wishDir);
        this.game.audio.powerCharge();
        this.flash = 1;
      }
    } else if (input.was('light')) {
      if (!this.grounded && this.pos.y - col.groundHeight(this.pos.x, this.pos.z, RADIUS, this.pos.y) > 1.0 && !a) {
        this.action = { kind: 'dive', t: 0, def: MOVES.dive, anim: 'diveImpact', falling: true };
        this.vy = -22;
        this.game.audio.swing(true);
      } else if (!a || canCancel) {
        this.#startMove(MOVES.light[this.combo % 3], 'attack', wishDir);
        this.combo = (this.combo + 1) % 3;
        this.comboReset = 0.9;
      } else if (a.kind === 'attack') this.buffer = 'light';
    } else if (input.was('heavy')) {
      if (!a || canCancel) {
        this.#startMove(MOVES.heavy, 'attack', wishDir);
        this.combo = 0;
      } else if (a.kind === 'attack') this.buffer = 'heavy';
    }

    // --- Action en cours ---
    let moveX = 0;
    let moveZ = 0;
    const act = this.action;
    if (act) {
      act.t += dt;
      if (act.kind === 'attack' || act.kind === 'power') {
        const p = act.t / act.def.dur;
        if (p < act.def.hit) {
          const f = this.facing();
          moveX = f.x * act.lunge;
          moveZ = f.z * act.lunge;
        }
        if (!act.hitDone && p >= act.def.hit) {
          act.hitDone = true;
          if (act.kind === 'power') {
            const f = this.facing();
            this.game.fx.voidBurst(this.pos.clone().addScaledVector(f, 1.2), f);
            this.game.audio.voidStrike();
            this.game.shake(0.6);
          } else if (act.def.aoe) {
            this.game.fx.slamWave(this.pos.clone().addScaledVector(this.facing(), 1.2), act.def.aoe + 0.8, '#ffb347');
            this.game.audio.hit(this.pos, true);
          }
          this.#resolveHit(act.def);
        }
        if (p >= 1) {
          this.action = null;
          const b = this.buffer;
          this.buffer = null;
          if (b === 'light') {
            this.#startMove(MOVES.light[this.combo % 3], 'attack', wishDir);
            this.combo = (this.combo + 1) % 3;
            this.comboReset = 0.9;
          } else if (b === 'heavy') this.#startMove(MOVES.heavy, 'attack', wishDir);
        } else if (this.buffer && act.hitDone && p > act.def.hit + 0.15 && act.kind === 'attack') {
          // Enchaînement anticipé : coupe la récupération.
          act.t = act.def.dur;
        }
      } else if (act.kind === 'dodge') {
        const k = 1 - act.t / act.dur;
        const sp = 14 * Math.max(0, k) ** 0.6;
        moveX = act.dir.x * sp;
        moveZ = act.dir.z * sp;
        if (Math.random() < 0.6) {
          this.game.fx.emit({ x: this.pos.x, y: this.pos.y + 0.9, z: this.pos.z }, { count: 1, color: '#7a50ff', speed: 0.5, size: 0.5, life: 0.3, gravity: 0 });
        }
        if (act.t >= act.dur) this.action = null;
      } else if (act.kind === 'dive') {
        if (this.grounded) {
          if (act.falling) {
            act.falling = false;
            act.t = 0;
            this.game.fx.slamWave(this.pos, MOVES.dive.aoe + 1, '#b070ff');
            this.game.audio.hit(this.pos, true);
            this.#resolveHit(MOVES.dive);
            this.game.shake(0.45);
          }
          if (act.t >= MOVES.dive.dur) this.action = null;
        } else act.t = 0;
      } else if (act.kind === 'hurt' || act.kind === 'anim') {
        if (act.t >= act.dur) this.action = null;
      }
    }

    // --- Locomotion ---
    const free = !this.action;
    const sprint = input.is('sprint') && wishLen > 0.3;
    const maxSpeed = sprint ? 10 : 6.3;
    const targetV = free && wishDir ? wish.clone().multiplyScalar(maxSpeed) : new THREE.Vector3();
    const accel = this.grounded ? 14 : 4;
    const kv = 1 - Math.exp(-accel * dt);
    this.vel.x += (targetV.x - this.vel.x) * kv;
    this.vel.z += (targetV.z - this.vel.z) * kv;

    // Orientation
    const lockT = this.game.lockTarget;
    let targetYaw = this.yaw;
    if (free && lockT?.alive) targetYaw = Math.atan2(lockT.pos.x - this.pos.x, lockT.pos.z - this.pos.z);
    else if (free && wishDir) targetYaw = Math.atan2(wishDir.x, wishDir.z);
    const dyaw = angleDiff(this.yaw, targetYaw);
    this.yaw += dyaw * (1 - Math.exp(-14 * dt));
    this.lean += ((free ? -dyaw * 0.25 * Math.min(1, this.vel.length() / 6) : 0) - this.lean) * (1 - Math.exp(-8 * dt));

    // Saut
    if (this.grounded) this.coyote = 0.12;
    else this.coyote -= dt;
    if (this.jumpBuffer > 0 && this.coyote > 0 && free) {
      this.vy = JUMP_V;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    this.#physics(dt, this.vel.x + moveX, this.vel.z + moveZ);

    // Pas
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed01 = hs / 6.3;
    if (this.grounded && hs > 0.5) {
      this.phase += dt * (hs < 7 ? 9.5 : 12) * Math.min(1, hs / 4);
      this.stepDist += hs * dt;
      if (this.stepDist > (sprint ? 2.6 : 1.9)) {
        this.stepDist = 0;
        this.game.audio.step(this.pos, sprint);
      }
    }
    this.#animate(dt);
  }

  #physics(dt, vx, vz) {
    const col = this.game.col;
    // Amortissement du recul résiduel
    col.moveCylinder(this.pos, RADIUS, HEIGHT, vx * dt, vz * dt);
    const gh = col.groundHeight(this.pos.x, this.pos.z, RADIUS, this.pos.y);
    if (this.grounded && gh < this.pos.y - 0.05 && this.vy <= 0) {
      // Bord d'un rebord : on tombe (sauf petite marche descendue).
      if (this.pos.y - gh < 0.6) this.pos.y = gh;
      else this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gh && this.vy <= 0) {
        if (this.vy < -14 && this.action?.kind !== 'dive') this.game.shake(0.12);
        this.pos.y = gh;
        this.vy = 0;
        this.grounded = true;
      }
    } else if (gh > this.pos.y) {
      this.pos.y = gh; // montée de marche
    }
    if (this.pos.y < -5) this.pos.y = 0.2; // filet de sécurité
  }

  #animate(dt) {
    const a = this.action;
    let anim = null;
    let animP = 0;
    if (a && (a.kind === 'attack' || a.kind === 'power')) {
      anim = a.anim;
      animP = Math.min(1, a.t / a.def.dur);
    } else if (a?.kind === 'dive') {
      anim = 'diveImpact';
      animP = a.falling ? 0 : Math.min(1, a.t / MOVES.dive.dur);
    } else if (a?.kind === 'anim') {
      anim = a.anim;
      animP = Math.min(1, a.t / a.dur);
    }
    const flashPower = a?.kind === 'power' ? Math.sin(Math.min(1, a.t / a.def.dur) * Math.PI) : 0;
    this.model.setEnergy(this.energy / this.stats.maxEnergy, Math.max(this.flash * 0.5, flashPower));
    this.model.animate({
      dt,
      speed: this.grounded ? Math.min(1.6, this.speed01) : 0,
      phase: this.phase,
      airborne: !this.grounded && !(a?.kind === 'dive'),
      vy: this.vy,
      anim,
      animP,
      dodge: a?.kind === 'dodge',
      hurt: a?.kind === 'hurt' ? this.hurtT : 0,
      lean: this.lean,
      dead: this.dead,
      deadP: this.deadT,
    });
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }
}
