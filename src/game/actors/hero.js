// Contrôleur de Noa : ado ordinaire au début (courir, sauter, rouler), puis
// pouvoirs des anneaux magnétiques (coups, fouet, rafale, bouclier/parade)
// et vol (décollage, stationnaire, vol, boost, virages, atterrissage).
import * as THREE from 'three';
import { HeroModel, PALETTES } from './heroModel.js';
import { RingSystem } from './rings.js';
import { ITEMS } from '../data/items.js';

export const MOVES = {
  light: [
    { anim: 'jabR', dur: 0.32, hit: 0.3, range: 2.3, arc: 1.7, mult: 1.0, knock: 2.5, poise: 12, lunge: 2.5, ring: 'R' },
    { anim: 'jabL', dur: 0.32, hit: 0.3, range: 2.3, arc: 1.7, mult: 1.1, knock: 2.5, poise: 12, lunge: 2.5, ring: 'L' },
    { anim: 'ringPunch', dur: 0.6, hit: 0.38, range: 4.2, arc: 0.9, mult: 1.9, knock: 8, poise: 40, lunge: 3, heavy: true, ringShot: true },
  ],
  heavy: { anim: 'whip', dur: 0.85, hit: 0.45, range: 5.6, arc: 3.6, mult: 2.4, knock: 9, poise: 70, lunge: 0.5, heavy: true, whip: true },
  power: { anim: 'volley', dur: 0.75, hit: 0.42, range: 15, mult: 2.6, knock: 10, poise: 90, energy: 30, cooldown: 3.5, heavy: true, maxTargets: 5 },
  dive: { anim: 'diveImpact', dur: 0.45, aoe: 3.3, mult: 2.0, knock: 8, poise: 50, heavy: true },
};

// Forme Abysse : griffes, tentacules qui attirent, rugissement de zone.
export const UMBRA = {
  light: [
    { anim: 'clawR', dur: 0.4, hit: 0.32, range: 3.1, arc: 2.3, mult: 1.7, knock: 5, poise: 30, lunge: 4 },
    { anim: 'clawL', dur: 0.4, hit: 0.32, range: 3.1, arc: 2.3, mult: 1.8, knock: 5, poise: 30, lunge: 4 },
    { anim: 'smash', dur: 0.7, hit: 0.4, aoe: 3.6, mult: 2.9, knock: 11, poise: 80, lunge: 2.5, heavy: true, smash: true },
  ],
  heavy: { anim: 'lash', dur: 0.75, hit: 0.45, range: 11, arc: 1.1, mult: 1.6, knock: 9, poise: 60, lunge: 0, heavy: true, pull: true },
  power: { anim: 'roar', dur: 1.1, hit: 0.3, aoe: 7.5, centered: true, mult: 1.4, knock: 15, poise: 140, energy: 25, cooldown: 6, heavy: true, roar: true },
  drain: 4.2, // jauge perdue par seconde transformé
  regen: 3, // santé régénérée par seconde transformé
  grapple: 45, // portée du grappin de tentacule (m)
  min: 50, // jauge minimale pour se transformer
};

// Durées de la transformation (s) : recouvrement, éclosion, croissance ; retour.
const TF = { cover: 1.25, emerge: 1.6, grow: 0.75, shrink: 0.35, recede: 1.0 };

const RADIUS = 0.4;
const HEIGHT = 1.75;
const GRAVITY = 25;
const JUMP_V = 8.7;
const FLY = { cruise: 17, boost: 34, climb: 9, maxAlt: 140 };

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
    // Seconde silhouette : la forme Abysse (même squelette, autre modèle).
    this.umbraModel = new HeroModel(PALETTES.umbra);
    this.model.enableCorruption();
    this.umbraModel.root.visible = false;
    this.form = 'human';
    this.abyss = 0;
    this.rings = new RingSystem(game.scene, this);
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
    this.powers = { rings: false, flight: false, magnet: false, umbra: false };
    this.flying = false;
    this.flightMode = 'hover';
    this.flyRoll = 0;
    this.flyPitch = 0;
    this.accelLean = 0;
    this.turnRate = 0;
    this.landT = 0;
    this.shieldT = -1;
    this.cinematic = false;
    this.mods = { damageMult: 1, whipRange: 0, whipArc: 0, punchPierce: false, sprintMult: 1, dodgeIFrames: 0, dodgeCd: 0, flightMult: 1, energyRegen: 0, volleyTargets: 0, volleyCost: 0, volleyDmg: 1, blockReduce: 0.15, blockCostMult: 1, secondWind: false, parryWindow: 0.25, riposte: false, comboBonus: false };
    this.chain = 0;
    this.chainT = 0;
    this.secondWindT = 0;
    this.stats = { maxHp: 100, maxEnergy: 100, damage: 10, defense: 0, energyGain: 0, powerDamage: 0 };
    this.hp = 100;
    this.energy = 60;
  }

  get radius() {
    return RADIUS;
  }

  get busy() {
    return !!this.action;
  }

  get shielding() {
    return this.shieldT >= 0;
  }

  setPowers(p) {
    Object.assign(this.powers, p);
    if (!this.powers.umbra && this.form === 'umbra') this.#revert(true);
    if (!this.powers.rings || this.form === 'umbra') this.rings.set('hidden');
    else if (this.rings.mode === 'hidden') this.rings.set('idle');
    this.model.setBackpack(!this.powers.rings);
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
    this.flying = false;
    this.grounded = true;
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

  playAnim(anim, dur, lockMove = true) {
    this.action = { kind: 'anim', anim, dur, t: 0, lockMove };
  }

  // Jeu de coups selon la forme.
  get moves() {
    return this.form === 'umbra' ? UMBRA : MOVES;
  }

  // ---------- Forme Abysse ----------
  canTransform() {
    return this.powers.umbra && this.form === 'human' && this.abyss >= UMBRA.min && !this.flying && !this.dead;
  }

  #toggleForm() {
    if (this.form === 'umbra') return this.#revert();
    if (!this.powers.umbra) return;
    if (this.abyss < UMBRA.min) {
      this.game.onPowerDenied('abyss', UMBRA.min);
      return;
    }
    if (this.flying) return;
    this.game.magnet?.drop();
    // Transformation en trois temps : la substance recouvre Noa depuis la
    // poitrine (INFECT), le corps enfle, puis le monstre surgit (EMERGE).
    this.action = { kind: 'transform', t: 0, dur: TF.emerge + TF.grow, swapped: false, lockMove: true };
    this.shieldT = -1;
    this.rings.set('hidden'); // les anneaux sont engloutis par la substance
    this.game.audio.transform();
    this.game.onTransform?.('start');
  }

  #swapModel(umbra) {
    this.form = umbra ? 'umbra' : 'human';
    this.model.root.visible = !umbra;
    this.umbraModel.root.visible = umbra;
    if (umbra) this.rings.set('hidden');
    else if (this.powers.rings) this.rings.set('idle');
    const fx = this.game.fx;
    const c = this.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
    fx.emit(c, { count: 40, color: '#1d1530', speed: 6, up: 3, size: 0.4, life: 0.8, gravity: 4 });
    fx.emit(c, { count: 18, color: '#5fe3ff', speed: 5, up: 2, size: 0.18, life: 0.6, gravity: 2 });
    fx.ring(this.pos, { color: umbra ? '#7a5cff' : '#7fe3ff', from: 0.4, to: 6, life: 0.5 });
    this.game.shake(umbra ? 0.5 : 0.2);
  }

  #revert(instant = false) {
    if (this.grapple) {
      this.grapple = null;
      this.#tendril(null);
    }
    if (this.form !== 'umbra' || this.action?.kind === 'revert') return;
    this.game.audio.revert();
    if (instant) {
      this.#swapModel(false);
      this.model.setCorruption(0);
      this.game.onTransform?.('end');
      return;
    }
    // Le monstre se ratatine et fond ; la substance se retire du corps de Noa.
    this.action = { kind: 'revert', t: 0, dur: TF.shrink + TF.recede, swapped: false, lockMove: true };
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
      if (d > maxDist || Math.abs(e.pos.y - this.pos.y) > 3) continue;
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
    const target = def.roar ? null : this.#pickAim(kind === 'power' ? 14 : def.whip ? 6 : def.pull ? 11 : 5, inputDir);
    if (target) this.yaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    else if (inputDir) this.yaw = Math.atan2(inputDir.x, inputDir.z);
    let lunge = def.lunge || 0;
    if (target) {
      const d = Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z) - target.radius - RADIUS - 0.4;
      lunge = Math.max(0, Math.min(lunge * def.dur * 0.5, d)) / (def.dur * 0.5);
    }
    this.action = { kind, def, t: 0, hitDone: false, anim: def.anim, lunge };
    this.game.audio.swing(!!def.heavy);
    if (def.roar) this.game.audio.roar(this.pos);
    if (this.form === 'umbra') return;
    if (def.ring) this.rings.set('punch', { side: def.ring });
    if (def.whip) this.rings.set('whip');
  }

  // Noyau équipé : identifiant et couleur (traînées, étincelles d'impact).
  #core() {
    const w = this.game.inventory?.equippedItem('weapon');
    return { id: w?.id || null, glow: (w && ITEMS[w.id]?.visual?.glow) || '#7fe3ff' };
  }

  // Traînée du coup au moment de l'impact (style cartoon).
  #swingFx(def) {
    const fx = this.game.fx;
    const p = this.pos;
    if (this.form === 'umbra') {
      if (def.anim === 'clawR' || def.anim === 'clawL') fx.claws(p, this.yaw, { flip: def.anim === 'clawL' });
      else if (def.pull) fx.swoosh(p, this.yaw, { color: '#2a1050', radius: 4.5, arc: 0.7, width: 0.18, tilt: 0.05, life: 0.3, dark: true });
      return;
    }
    const { glow } = this.#core();
    if (def.whip) fx.swoosh(p, this.yaw, { color: glow, radius: 3.2, arc: 3.3, width: 0.35, tilt: 0.55, life: 0.28, flip: true });
    else if (def.ringShot) fx.swoosh(p, this.yaw, { color: glow, radius: 2, arc: 1.6, width: 0.45, tilt: 0.8, roll: 1.1, life: 0.22 });
    else if (def.ring) fx.swoosh(p, this.yaw, { color: glow, radius: 1.6, arc: 1.5, width: 0.5, tilt: 0.7, life: 0.17, flip: def.ring === 'L', roll: def.ring === 'L' ? -0.25 : 0.25 });
  }

  // Multiplicateur de compétences : force, enchaînement, riposte.
  #dmgMult() {
    let m = this.mods.damageMult;
    if (this.mods.comboBonus) m *= 1 + Math.min(0.4, 0.05 * this.chain);
    if (this.riposteReady) {
      m *= 2;
      this.riposteReady = false;
      this.game.hud.toast('RIPOSTE ×2', '#ffcd20');
    }
    return m;
  }

  #resolveHit(def) {
    let hits = 0;
    const base = this.stats.damage * def.mult * (def === MOVES.power ? 1 + this.stats.powerDamage : 1) * this.#dmgMult();
    const umbra = this.form === 'umbra';
    const hit = (e, dir) => {
      const dmg = Math.round(base * (0.92 + Math.random() * 0.16));
      // Tentacules : la créature est tirée vers Noa au lieu d'être repoussée.
      const d = def.pull ? dir.clone().negate() : dir;
      const pullDist = def.pull ? Math.max(0, Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - 2.2) : 0;
      if (e.takeHit({ damage: dmg, dir: d, knock: def.knock, poise: def.poise, heavy: !!def.heavy, power: def === MOVES.power || umbra, pullDist })) hits++;
      if (umbra) this.hp = Math.min(this.stats.maxHp, this.hp + Math.max(1, Math.round(dmg * 0.06))); // la substance se nourrit
      // Effets d'impact : encre noire en Forme Abysse, sinon propres au noyau.
      const at = { x: e.pos.x - dir.x * (e.radius || 0.5), y: e.pos.y + (e.def?.height || 1.6) * 0.55, z: e.pos.z - dir.z * (e.radius || 0.5) };
      if (umbra) this.game.fx.ink(at, def.heavy ? 1.4 : 0.8);
      else {
        const c = this.#core();
        this.game.fx.coreImpact(at, c.id, c.glow, !!def.heavy);
      }
      if (def.roar) e.stagger?.(1.4);
      if (def.pull) this.game.fx.emit({ x: e.pos.x, y: e.pos.y + 1, z: e.pos.z }, { count: 10, color: '#1d1530', speed: 3, size: 0.3, life: 0.4 });
    };
    if (def === MOVES.power) {
      // Rafale : jusqu'à 5 cibles devant, les anneaux volent vers elles.
      const f = this.facing();
      const list = this.game.enemies
        .filter((e) => e.alive && e.pos.distanceTo(this.pos) < def.range)
        .filter((e) => e.pos.clone().sub(this.pos).setY(0).normalize().dot(f) > 0.3 || e === this.game.lockTarget)
        .sort((a, b) => a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos))
        .slice(0, def.maxTargets + this.mods.volleyTargets);
      const tg = list.length
        ? list.map((e) => ({ x: e.pos.x, y: e.pos.y + e.def.height * 0.55, z: e.pos.z }))
        : [this.pos.clone().addScaledVector(f, 9).add(new THREE.Vector3(0, 1.2, 0))];
      this.rings.launch(tg, 0.9);
      this.pendingVolley = { t: 0.3, list, mult: base / (this.stats.damage * def.mult * (1 + this.stats.powerDamage)) };
      return list.length;
    }
    const f = this.facing();
    const center = def.aoe ? this.pos.clone().addScaledVector(f, def === MOVES.dive || def.centered ? 0 : 1.2) : this.pos;
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      if (Math.abs(e.pos.y - this.pos.y) > 2.6) continue;
      let ok;
      if (def.aoe) ok = Math.hypot(e.pos.x - center.x, e.pos.z - center.z) <= def.aoe + e.radius;
      else {
        const ang = Math.abs(angleDiff(this.yaw, Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z)));
        const dd = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        const range = def.range + (def.whip ? this.mods.whipRange : 0) + (def.ringShot && this.mods.punchPierce ? 1.5 : 0);
        const arc = def.arc + (def.whip ? this.mods.whipArc : 0);
        ok = dd <= range + e.radius && (ang <= arc / 2 || dd < e.radius + RADIUS + 0.3);
      }
      if (ok) hit(e, new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize());
    }
    if (hits) {
      // La jauge d'Abysse se remplit en frappant (elle se vide transformé).
      if (this.powers.umbra) this.abyss = Math.min(100, this.abyss + hits * (umbra ? 2 : 4));
      this.chain++;
      this.chainT = 2;
      this.energy = Math.min(this.stats.maxEnergy, this.energy + hits * (5 + this.stats.energyGain));
      this.game.hitStop(def.heavy ? 0.09 : 0.05);
      this.game.shake(def.heavy ? 0.35 : 0.15);
      this.flash = Math.max(this.flash, 0.5);
    }
    return hits;
  }

  // Les dégâts de la rafale tombent quand les anneaux arrivent (temps de jeu).
  #updateVolley(dt) {
    const v = this.pendingVolley;
    if (!v) return;
    v.t -= dt;
    if (v.t > 0) return;
    this.pendingVolley = null;
    const def = MOVES.power;
    const base = this.stats.damage * def.mult * (1 + this.stats.powerDamage) * this.mods.volleyDmg * (v.mult || 1);
    for (const e of v.list) {
      if (!e.alive) continue;
      const dmg = Math.round(base * (0.92 + Math.random() * 0.16));
      e.takeHit({ damage: dmg, dir: e.pos.clone().sub(this.pos).setY(0).normalize(), knock: def.knock, poise: def.poise, heavy: true, power: true });
      this.game.fx.starBurst({ x: e.pos.x, y: e.pos.y + e.def.height * 0.6, z: e.pos.z }, '#7fe3ff', 1.6);
    }
    if (v.list.length) {
      this.game.hitStop(0.06);
      this.game.shake(0.3);
    }
    this.game.onVolley?.(v.list.length);
  }

  // Renvoie 'dodged' | 'parried' | 'blocked' | true (touché) | false (ignoré).
  takeDamage(amount, from, { knock = 4, heavy = false, source = null } = {}) {
    if (this.dead || this.cinematic) return false;
    if (this.action?.kind === 'dodge' && this.action.t < 0.3 + this.mods.dodgeIFrames) {
      this.energy = Math.min(this.stats.maxEnergy, this.energy + 15);
      this.game.onPerfectDodge();
      return 'dodged';
    }
    // Bouclier d'anneaux : bloque de face ; parade s'il est levé au dernier moment.
    if (this.shielding) {
      const ang = Math.abs(angleDiff(this.yaw, Math.atan2(from.x - this.pos.x, from.z - this.pos.z)));
      if (ang < 1.6) {
        if (this.shieldT < this.mods.parryWindow) {
          this.energy = Math.min(this.stats.maxEnergy, this.energy + 20);
          if (this.mods.riposte) this.riposteReady = true;
          this.game.onParry(source, from);
          return 'parried';
        }
        this.energy = Math.max(0, this.energy - (heavy ? 18 : 8) * this.mods.blockCostMult);
        this.game.onBlock(from);
        if (this.energy > 0) {
          this.hp -= Math.max(1, Math.round(amount * this.mods.blockReduce));
          this.vel.addScaledVector(new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize(), knock * 0.4);
          if (this.hp <= 0) this.#die();
          return 'blocked';
        }
        this.shieldT = -1; // garde brisée faute d'énergie
      }
    }
    const armor = this.form === 'umbra' ? 0.5 : 1;
    const dmg = Math.max(1, Math.round(amount * armor * (100 / (100 + this.stats.defense * 4))));
    this.hp -= dmg;
    if (this.powers.umbra && this.form === 'human') this.abyss = Math.min(100, this.abyss + 6);
    this.game.onHeroHurt(dmg);
    this.vel.addScaledVector(new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize(), knock);
    if (this.flying) {
      this.flying = false; // désarçonné en plein vol
      this.vy = 2;
      this.grounded = false;
    }
    if (this.action?.kind !== 'power' && this.action?.kind !== 'transform' && this.action?.kind !== 'revert' && !(this.form === 'umbra' && !heavy)) this.action = { kind: 'hurt', t: 0, dur: heavy ? 0.55 : 0.3 };
    this.hurtT = 1;
    if (this.hp <= 0) this.#die();
    return true;
  }

  #die() {
    // Second souffle : survit une fois à un coup mortel.
    if (this.mods.secondWind && this.secondWindT <= 0) {
      this.hp = 1;
      this.secondWindT = 90;
      this.game.hud.toast('SECOND SOUFFLE !', '#4fc3f7');
      this.game.slowT = 0.6;
      return;
    }
    if (this.form === 'umbra') this.#revert(true);
    this.hp = 0;
    this.dead = true;
    this.action = null;
    this.flying = false;
    this.shieldT = -1;
    this.game.onHeroDeath();
  }

  // ---------- Vol ----------
  #toggleFlight() {
    if (!this.powers.flight || this.form === 'umbra') return;
    if (this.flying) {
      this.flying = false;
      this.grounded = false;
      this.vy = Math.min(this.vy, 0);
      this.game.audio.dodge();
      return;
    }
    if (this.grounded) this.action = { kind: 'takeoff', t: 0, dur: 0.28 };
    else this.#beginFlight(false);
  }

  #beginFlight(fromGround) {
    this.flying = true;
    this.grounded = false;
    this.flightMode = 'hover';
    if (fromGround) {
      this.vy = 13;
      this.game.fx.dustRing(this.pos, 1.6, 14, '#c9d8ff');
      this.game.fx.ring(this.pos, { color: '#7fe3ff', from: 0.3, to: 4, life: 0.4 });
      this.game.shake(0.2);
    }
    this.game.audio.takeoff();
    this.game.onFlightStart?.();
  }

  #flightUpdate(dt, input, wishLen, camYaw, camPitch) {
    const col = this.game.col;
    const boosting = input.is('sprint') && wishLen > 0.3;
    // « En avant » suit la caméra, inclinaison comprise : on vole là où l'on regarde.
    const look = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), -Math.sin(camPitch) * 0.9, Math.cos(camYaw) * Math.cos(camPitch));
    const mv = input.move();
    const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const dir = new THREE.Vector3().addScaledVector(look, mv.y).addScaledVector(right, mv.x);
    if (dir.lengthSq() > 1) dir.normalize();
    const speed = (boosting ? FLY.boost : wishLen > 0.1 ? FLY.cruise : 0) * this.mods.flightMult;
    const target = dir.multiplyScalar(speed);
    if (input.is('jump')) target.y += FLY.climb * this.mods.flightMult;
    if (input.is('dodge')) target.y -= FLY.climb * 1.3;
    const acc = boosting ? 3.2 : 4.5;
    const k = 1 - Math.exp(-acc * dt);
    this.vel.x += (target.x - this.vel.x) * k;
    this.vel.z += (target.z - this.vel.z) * k;
    this.vy += (target.y - this.vy) * k;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    const prevMode = this.flightMode;
    this.flightMode = hs > 24 * this.mods.flightMult ? 'boost' : hs > 4 ? 'fly' : 'hover';
    if (this.flightMode === 'boost' && prevMode !== 'boost') {
      // « Bang » d'air au passage en boost
      this.game.fx.ring(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: '#ffffff', from: 0.5, to: 6, life: 0.35, y: 0 });
      this.game.shake(0.25);
      this.game.audio.boost();
    }
    const prevYaw = this.yaw;
    if (hs > 1) this.yaw += angleDiff(this.yaw, Math.atan2(this.vel.x, this.vel.z)) * (1 - Math.exp(-6 * dt));
    else if (wishLen < 0.1) this.yaw += angleDiff(this.yaw, camYaw) * (1 - Math.exp(-3 * dt));
    const yawRate = angleDiff(prevYaw, this.yaw) / Math.max(dt, 1e-4);
    // Roulis dans les virages, tangage selon vitesse et montée/descente.
    this.flyRoll += (Math.max(-0.9, Math.min(0.9, -yawRate * 0.35)) - this.flyRoll) * (1 - Math.exp(-5 * dt));
    this.flyPitch = this.flightMode === 'hover' ? 0.08 : Math.min(1.45, 0.5 + hs / 30) - Math.max(-0.5, Math.min(0.5, this.vy / 30));

    col.moveCylinder(this.pos, RADIUS, HEIGHT, this.vel.x * dt, this.vel.z * dt);
    this.pos.y = Math.min(FLY.maxAlt, this.pos.y + this.vy * dt);
    const gh = col.groundHeight(this.pos.x, this.pos.z, RADIUS, this.pos.y + 0.3, 0.6);
    if (this.pos.y <= gh) {
      const impact = Math.hypot(hs, this.vy);
      const hard = impact > 9 || this.vy < -6;
      this.pos.y = gh;
      this.flying = false;
      this.grounded = true;
      this.vy = 0;
      if (hard) {
        // Atterrissage de super-héros
        this.vel.multiplyScalar(0.1);
        this.action = { kind: 'anim', anim: 'superLanding', dur: 0.95, t: 0, lockMove: true };
        this.game.fx.dustRing(this.pos, 2, 18);
        this.game.fx.ring(this.pos, { color: '#7fe3ff', from: 0.4, to: 4.5, life: 0.45 });
        this.game.shake(0.45);
        this.game.audio.hit(this.pos, true);
      } else this.game.fx.dustRing(this.pos, 0.9, 8);
    }
    // Traînées lumineuses derrière les anneaux ; souffle au sol en stationnaire.
    if (hs > 6 || Math.random() < 0.3) {
      const pts = this.rings.positions();
      const n = this.flightMode === 'boost' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const p = pts[Math.floor(Math.random() * pts.length)];
        this.game.fx.emit(p, { count: 1, color: '#7fe3ff', speed: 0.3, size: this.flightMode === 'boost' ? 0.35 : 0.22, life: 0.45, gravity: 0, drag: 6 });
      }
    }
    if (this.flying && this.flightMode === 'hover' && Math.random() < 0.25) {
      const g = col.groundHeight(this.pos.x, this.pos.z, RADIUS, this.pos.y);
      if (this.pos.y - g < 4) this.game.fx.puff({ x: this.pos.x, y: g + 0.1, z: this.pos.z }, { color: '#c9d8ff', size: 0.7, life: 0.6, rise: 0.2, spread: 1.4 });
    }
  }

  // ---------- Mise à jour ----------
  update(dt, input, camYaw, camPitch = 0.3) {
    const col = this.game.col;
    this.powerCd = Math.max(0, this.powerCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.comboReset -= dt;
    if (this.comboReset <= 0) this.combo = 0;
    this.flash = Math.max(0, this.flash - dt * 2);
    this.hurtT = Math.max(0, this.hurtT - dt * 4);
    if (this.powers.rings) this.energy = Math.min(this.stats.maxEnergy, this.energy + dt * (3 + this.mods.energyRegen));
    this.secondWindT = Math.max(0, this.secondWindT - dt);
    this.chainT -= dt;
    if (this.chainT <= 0) this.chain = 0;
    this.#updateVolley(dt);

    if (this.dead || this.cinematic) {
      if (this.dead) this.deadT += dt;
      if (this.action?.kind === 'anim') {
        this.action.t += dt;
        if (this.action.t >= this.action.dur && !this.action.hold) this.action = null;
      }
      if (!this.flying && !this.suspended) this.#physics(dt, 0, 0);
      this.#animate(dt);
      return;
    }

    const mv = input.move();
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3().addScaledVector(fwd, mv.y).addScaledVector(right, mv.x);
    const wishLen = Math.min(1, wish.length());
    const wishDir = wishLen > 0.01 ? wish.clone().normalize() : null;
    const R = this.powers.rings;
    const U = this.form === 'umbra';
    const MV = this.moves;

    // Jauge d'Abysse : se vide pendant la transformation, retour humain à zéro.
    if (U) {
      this.abyss -= UMBRA.drain * dt;
      // La substance régénère Noa tant qu'il est transformé.
      if (!this.dead) this.hp = Math.min(this.stats.maxHp, this.hp + UMBRA.regen * dt);
      if (this.abyss <= 0) {
        this.abyss = 0;
        this.#revert();
      }
    }
    if (input.was('transform') && (!this.action || this.action.kind === 'attack' || this.action.kind === 'hurt')) this.#toggleForm();
    // Magnétisme : saisir / lancer (forme humaine seulement).
    const mag = this.game.magnet;
    if (input.was('magnet') && R && this.powers.magnet && !U && mag && (!this.action || this.action.lockMove === false)) mag.press();
    const holding = mag?.holding;
    // Forme Abysse : grappin de tentacule vers un mur ou un toit (X / RT).
    if (U && input.was('magnet') && !this.grapple && (!this.action || this.action.kind === 'attack')) this.#startGrapple(camYaw);
    if (this.grapple) {
      this.#updateGrapple(dt);
      this.#animate(dt);
      return;
    }

    if (input.was('fly')) this.#toggleFlight();
    if (input.was('jump')) this.jumpBuffer = 0.15;
    this.jumpBuffer -= dt;
    const a = this.action;
    const canCancel = !a || (a.kind === 'attack' && a.hitDone && a.t / a.def.dur > a.def.hit + 0.1);

    // Bouclier (maintenu)
    if (R && !U && !holding && input.is('shield') && !this.flying && (!a || a.kind === 'hurt') && this.energy > 0) {
      if (this.shieldT < 0) {
        this.shieldT = 0;
        this.game.audio.shield();
      } else this.shieldT += dt;
    } else this.shieldT = -1;

    if (!this.flying && !this.shielding) {
      if (input.was('dodge') && this.dodgeCd <= 0 && this.grounded && (!a || a.kind === 'attack' || a.kind === 'hurt')) {
        const dir = wishDir || this.facing().negate();
        this.action = { kind: 'dodge', t: 0, dur: 0.42, dir };
        if (wishDir) this.yaw = Math.atan2(dir.x, dir.z);
        this.dodgeCd = 0.55 - this.mods.dodgeCd;
        this.game.audio.dodge();
        this.game.fx.dustRing(this.pos, 0.8, 7, '#c9b8ff');
      } else if (holding && (input.was('light') || input.was('heavy') || input.was('power'))) {
        mag.throwHeld();
      } else if (input.was('power') || input.was('light') || input.was('heavy')) {
        if (!R) this.game.onNoPowers();
        else if (input.was('power')) {
          const def = MV.power;
          const cost = def.energy - (U ? 0 : this.mods.volleyCost);
          if (this.powerCd > 0 || this.energy < cost) this.game.onPowerDenied(this.powerCd > 0 ? 'cooldown' : 'energy');
          else if (!a || canCancel || a.kind === 'attack') {
            this.energy -= cost;
            this.powerCd = def.cooldown;
            this.#startMove(def, 'power', wishDir);
            if (!U) this.game.audio.powerCharge();
          }
        } else if (input.was('light')) {
          if (!this.grounded && this.pos.y - col.groundHeight(this.pos.x, this.pos.z, RADIUS, this.pos.y) > 1.0 && !a) {
            this.action = { kind: 'dive', t: 0, def: MOVES.dive, anim: 'diveImpact', falling: true };
            this.vy = -22;
            this.game.audio.swing(true);
          } else if (!a || canCancel) {
            this.#startMove(MV.light[this.combo % 3], 'attack', wishDir);
            this.combo = (this.combo + 1) % 3;
            this.comboReset = 0.9;
          } else if (a.kind === 'attack') this.buffer = 'light';
        } else if (input.was('heavy')) {
          if (!a || canCancel) {
            this.#startMove(MV.heavy, 'attack', wishDir);
            this.combo = 0;
          } else if (a.kind === 'attack') this.buffer = 'heavy';
        }
      }
    } else if (this.flying && input.was('light')) {
      // En vol : piqué fracassant vers le sol.
      this.flying = false;
      this.action = { kind: 'dive', t: 0, def: MOVES.dive, anim: 'diveImpact', falling: true };
      this.vy = -26;
      this.game.audio.swing(true);
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
          if (act.def.ringShot) {
            this.rings.set('ringShot');
            this.game.fx.ring(this.pos.clone().addScaledVector(this.facing(), 2), { color: '#7fe3ff', from: 0.3, to: 2.5, life: 0.3, y: 1.2 });
          }
          if (act.def.whip) this.game.fx.slamWave(this.pos, 4, '#7fe3ff');
          if (act.def.smash) this.game.fx.slamWave(this.pos.clone().addScaledVector(this.facing(), 1.2), 3.6, '#7a5cff');
          if (act.def.roar) {
            this.game.fx.ring(this.pos, { color: '#7a5cff', from: 0.5, to: 9, life: 0.6, y: 1 });
            this.game.fx.ring(this.pos, { color: '#5fe3ff', from: 0.5, to: 7, life: 0.5 });
            this.game.shake(0.6);
          }
          if (act.def.pull) this.game.fx.emit(this.pos.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(this.facing(), 2), { count: 20, color: '#1d1530', speed: 9, size: 0.3, life: 0.35, gravity: 0, dir: this.facing() });
          if (act.kind === 'power' && !U) this.game.audio.voidStrike();
          if (act.kind === 'attack') this.#swingFx(act.def);
          this.#resolveHit(act.def);
        }
        if (p >= 1) {
          this.action = null;
          const b = this.buffer;
          this.buffer = null;
          if (b === 'light') {
            this.#startMove(MV.light[this.combo % 3], 'attack', wishDir);
            this.combo = (this.combo + 1) % 3;
            this.comboReset = 0.9;
          } else if (b === 'heavy') this.#startMove(MV.heavy, 'attack', wishDir);
        } else if (this.buffer && act.hitDone && p > act.def.hit + 0.15 && act.kind === 'attack') {
          act.t = act.def.dur;
        }
      } else if (act.kind === 'dodge') {
        const k = 1 - act.t / act.dur;
        const sp = (this.form === 'umbra' ? 17 : 13) * Math.max(0, k) ** 0.6;
        moveX = act.dir.x * sp;
        moveZ = act.dir.z * sp;
        if (act.t >= act.dur) this.action = null;
      } else if (act.kind === 'dive') {
        if (this.grounded) {
          if (act.falling) {
            act.falling = false;
            act.t = 0;
            this.game.fx.slamWave(this.pos, MOVES.dive.aoe + 1, '#7fe3ff');
            this.game.audio.hit(this.pos, true);
            this.#resolveHit(MOVES.dive);
            this.game.shake(0.45);
          }
          if (act.t >= MOVES.dive.dur) this.action = null;
        } else act.t = 0;
      } else if (act.kind === 'takeoff') {
        if (act.t >= act.dur) {
          this.action = null;
          this.#beginFlight(true);
        }
      } else if (act.kind === 'transform') {
        const t = act.t;
        const chest = this.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
        if (!act.swapped) {
          // La substance gagne tout le corps, de la poitrine aux extrémités.
          const k = Math.min(1, t / TF.cover);
          this.model.setCorruption(k * k * (3 - 2 * k), t);
          if (Math.random() < 0.6) this.game.fx.emit(chest, { count: 2, color: '#1d1530', speed: 2 + k * 3, size: 0.25 + k * 0.2, life: 0.5, gravity: -2 });
          if (Math.random() < 0.25) this.game.fx.bolt(chest, chest.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, (Math.random() - 0.3) * 1.4, (Math.random() - 0.5) * 1.4)), '#5fe3ff', 4);
          if (t > TF.cover * 0.5) this.game.shakeAmp = Math.max(this.game.shakeAmp || 0, 0.08 * k);
          if (t >= TF.emerge) {
            act.swapped = true;
            this.#swapModel(true);
            this.game.audio.roar?.(this.pos);
            this.game.shake(0.8);
            this.game.fx.ink(chest, 2.5);
            this.game.fx.ring(this.pos, { color: '#1d1530', from: 0.5, to: 7, life: 0.6, opacity: 0.8, dark: true });
            this.game.onTransform?.('done');
          }
        }
        if (act.t >= act.dur) this.action = null;
      } else if (act.kind === 'revert') {
        if (!act.swapped && act.t >= TF.shrink) {
          act.swapped = true;
          this.#swapModel(false);
          this.game.fx.ink(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 2);
        }
        if (act.swapped) {
          const k = Math.min(1, (act.t - TF.shrink) / TF.recede);
          this.model.setCorruption(1 - k, act.t);
        }
        if (act.t >= act.dur) {
          this.action = null;
          this.model.setCorruption(0);
          this.game.onTransform?.('end');
        }
      } else if (act.kind === 'hurt' || act.kind === 'anim') {
        if (act.t >= act.dur) this.action = null;
      }
    }

    // --- Mode des anneaux selon l'action ---
    const morphing = this.action?.kind === 'transform' || (this.action?.kind === 'revert' && this.action.t < TF.shrink + TF.recede * 0.6);
    if (morphing) this.rings.set('hidden');
    else if (R && this.form === 'human') {
      const m = this.rings.mode;
      const transient = m === 'volley' || m === 'awaken' || m === 'ringShot' || m === 'whip' || m === 'punch';
      const done = (m === 'ringShot' && this.rings.modeT > 0.5) || ((m === 'whip' || m === 'punch') && !(this.action?.kind === 'attack'));
      if (!transient || done) this.rings.set(this.flying ? 'flight' : this.shielding ? 'shield' : 'idle');
    }

    if (this.flying) {
      this.#flightUpdate(dt, input, wishLen, camYaw, camPitch);
      this.#animate(dt);
      return;
    }

    // --- Locomotion au sol ---
    const free = !this.action || this.action.lockMove === false;
    const sprint = input.is('sprint') && wishLen > 0.3;
    const maxSpeed = this.shielding ? 2.5 : U ? (sprint ? 13 : 7.4) : holding ? 4.2 : sprint ? 9.5 * this.mods.sprintMult : 5.8;
    const targetV = free && wishDir ? wish.clone().multiplyScalar(maxSpeed) : new THREE.Vector3();
    const accel = this.grounded ? 14 : 4;
    const kv = 1 - Math.exp(-accel * dt);
    this.vel.x += (targetV.x - this.vel.x) * kv;
    this.vel.z += (targetV.z - this.vel.z) * kv;

    const lockT = this.game.lockTarget;
    let targetYaw = this.yaw;
    if (free && lockT?.alive) targetYaw = Math.atan2(lockT.pos.x - this.pos.x, lockT.pos.z - this.pos.z);
    else if (this.shielding) targetYaw = camYaw;
    else if (free && wishDir) targetYaw = Math.atan2(wishDir.x, wishDir.z);
    const dyaw = angleDiff(this.yaw, targetYaw);
    this.yaw += dyaw * (1 - Math.exp(-14 * dt));
    this.lean += ((free ? -dyaw * 0.25 * Math.min(1, this.vel.length() / 6) : 0) - this.lean) * (1 - Math.exp(-8 * dt));

    if (this.grounded) this.coyote = 0.12;
    else this.coyote -= dt;
    if (this.jumpBuffer > 0 && this.coyote > 0 && free) {
      this.vy = U ? JUMP_V * 1.45 : JUMP_V;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    this.#physics(dt, this.vel.x + moveX, this.vel.z + moveZ);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed01 = hs / 5.8;
    // Élan : inclinaison à l'accélération / au freinage ; rotation sur place.
    const dv = (hs - (this.prevHs ?? hs)) / Math.max(dt, 1e-4);
    this.prevHs = hs;
    this.accelLean += (Math.max(-0.18, Math.min(0.22, dv * 0.025)) - this.accelLean) * (1 - Math.exp(-6 * dt));
    this.turnRate = dyaw / Math.max(dt, 1e-4) * 0.05;
    if (this.grounded && hs > 0.3) {
      // Cadence liée à la vitesse et à la longueur de foulée : pas de pieds qui glissent.
      const stride = 1.3 + 1.4 * Math.min(1.6, hs / 5.8);
      this.phase += (hs / stride) * Math.PI * 2 * dt;
      this.stepDist += hs * dt;
      if (this.stepDist > (sprint ? 2.5 : 1.8)) {
        this.stepDist = 0;
        this.game.audio.step(this.pos, sprint);
      }
    }
    this.#animate(dt);
  }

  // Lance une tentacule dans la direction de la caméra (légèrement vers le haut) ;
  // si elle accroche une façade à moins de 45 m, Noa est tracté puis bondit.
  #startGrapple(camYaw) {
    const col = this.game.col;
    const o = this.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    for (const up of [0.55, 0.25, 0.9]) {
      const d = fwd.clone().add(new THREE.Vector3(0, up, 0)).normalize();
      const t = col.raycast(o, d.clone().multiplyScalar(UMBRA.grapple), 1);
      if (t < 0.98 && t * UMBRA.grapple > 3) {
        const target = o.clone().addScaledVector(d, t * UMBRA.grapple - 0.8);
        this.grapple = { target, t: 0, dir: d };
        this.abyss = Math.max(0, this.abyss - 4);
        this.yaw = Math.atan2(d.x, d.z);
        this.grounded = false;
        this.game.audio.magnetThrow();
        this.game.fx.ink(target, 0.7);
        return true;
      }
    }
    this.game.hud.toast('Rien à agripper dans cette direction', '#9a7aff');
    return false;
  }

  #updateGrapple(dt) {
    const gr = this.grapple;
    gr.t += dt;
    const to = gr.target.clone().sub(this.pos).sub(new THREE.Vector3(0, 1.0, 0));
    const d = to.length();
    const step = Math.min(d, 42 * dt * Math.min(1, gr.t * 6 + 0.3));
    if (d > 0.01) {
      const mv = to.multiplyScalar(step / d);
      this.game.col.moveCylinder(this.pos, RADIUS, HEIGHT, mv.x, mv.z);
      this.pos.y += mv.y;
    }
    this.vel.set(0, 0, 0);
    this.#tendril(gr.target);
    if (d < 0.9 || gr.t > 1.6) {
      // Arrivée : bond pour se hisser sur le toit / continuer.
      this.grapple = null;
      this.vy = 11;
      this.grounded = false;
      this.#tendril(null);
      this.game.fx.ink(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.6);
    }
  }

  // Tentacule visible de la main droite jusqu'au point d'accroche.
  #tendril(target) {
    if (!this.tendrilMesh) {
      const geo = new THREE.CylinderGeometry(0.035, 0.06, 1, 7, 1, true).translate(0, 0.5, 0);
      this.tendrilMesh = new THREE.Mesh(geo, this.umbraModel.mats.skin);
      this.game.scene.add(this.tendrilMesh);
    }
    const m = this.tendrilMesh;
    m.visible = !!target;
    if (!target) return;
    const from = new THREE.Vector3();
    (this.umbraModel.joints.handR || this.umbraModel.joints.elR).getWorldPosition(from);
    const dir = target.clone().sub(from);
    const len = dir.length();
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.divideScalar(len || 1));
    m.scale.set(1, len, 1);
  }

  #physics(dt, vx, vz) {
    const col = this.game.col;
    col.moveCylinder(this.pos, RADIUS, HEIGHT, vx * dt, vz * dt);
    const gh = col.groundHeight(this.pos.x, this.pos.z, RADIUS, this.pos.y);
    if (this.grounded && gh < this.pos.y - 0.05 && this.vy <= 0) {
      if (this.pos.y - gh < 0.6) this.pos.y = gh;
      else this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gh && this.vy <= 0) {
        if (this.vy < -14 && this.action?.kind !== 'dive') this.game.shake(0.12);
        if (this.vy < -6) this.game.fx.dustRing(this.pos, 0.9, 8);
        this.landT = Math.min(1, -this.vy / 20);
        this.pos.y = gh;
        this.vy = 0;
        this.grounded = true;
      }
    } else if (gh > this.pos.y) this.pos.y = gh;
    if (this.pos.y < -5) this.pos.y = 0.2;
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
    } else if (a?.kind === 'takeoff') {
      anim = 'superLanding';
      animP = 0.3;
    } else if (a?.kind === 'transform') {
      // Noa se débat pendant l'infection ; le monstre rugit en surgissant.
      if (!a.swapped) {
        anim = 'infect';
        animP = Math.min(1, a.t / TF.emerge);
      } else {
        anim = 'roar';
        animP = Math.min(1, (a.t - TF.emerge) / TF.grow);
      }
    } else if (a?.kind === 'revert') {
      anim = a.swapped ? 'scared' : 'smash';
      animP = a.swapped ? Math.min(1, (a.t - TF.shrink) / TF.recede) : 0.4;
    }
    // Objet en lévitation : bras levés (les jambes continuent de marcher).
    if (!anim && this.game.magnet?.holding) {
      anim = 'magnetHold';
      animP = 0.5;
    }
    if (!anim && this.pose) {
      anim = this.pose; // pose imposée par l'histoire (assis en classe…)
      animP = 0.5;
    }
    this.landT = Math.max(0, (this.landT || 0) - dt * 3.5);
    const model = this.form === 'umbra' ? this.umbraModel : this.model;
    model.animate({
      dt,
      accel: this.accelLean,
      turn: this.turnRate,
      land: a ? 0 : this.landT,
      speed: this.grounded ? Math.min(1.6, this.speed01) : 0,
      phase: this.phase,
      airborne: !this.grounded && !this.flying && a?.kind !== 'dive',
      vy: this.vy,
      anim,
      animP,
      dodge: a?.kind === 'dodge',
      shield: this.shielding,
      hurt: a?.kind === 'hurt' ? this.hurtT : 0,
      lean: this.lean,
      dead: this.dead,
      deadP: this.deadT,
      flight: this.flying ? { mode: this.flightMode, pitch: this.flyPitch, roll: this.flyRoll } : null,
    });
    model.root.position.copy(this.pos);
    // Gonflement du corps avant l'éclosion, croissance élastique du monstre.
    if (this.form === 'human') {
      const sw = a?.kind === 'transform' && !a.swapped ? Math.max(0, (a.t - TF.cover * 0.85) / (TF.emerge - TF.cover * 0.85)) : a?.kind === 'revert' && a.swapped ? Math.max(0, 1 - (a.t - TF.shrink) / 0.4) * 0.6 : 0;
      const tr = a?.kind === 'transform' && !a.swapped ? Math.sin(a.t * 60) * 0.012 * Math.min(1, a.t) : 0;
      model.root.scale.set(1 + sw * 0.28, 1 + sw * 0.16, 1 + sw * 0.28);
      model.root.position.x += tr;
    } else {
      const b = model.baseScale || 1;
      let g = 1;
      if (a?.kind === 'transform' && a.swapped) {
        const k = Math.min(1, (a.t - TF.emerge) / TF.grow);
        g = 0.62 + 0.38 * (1 - Math.cos(k * Math.PI * 1.5) * Math.exp(-k * 3.5)) + 0.0;
      } else if (a?.kind === 'revert' && !a.swapped) g = 1 - 0.4 * (a.t / TF.shrink);
      model.root.scale.setScalar(b * g);
    }
    model.root.rotation.y = this.yaw;
    this.rings.update(dt, this.game.time, this.energy / this.stats.maxEnergy);
  }
}
