// LE COLOSSE — boss en 3 phases sur la place Halden.
// P1 : frappe au sol, balayage, onde de choc (à sauter).
// P2 : lancers de débris, charges ; s'il percute un obstacle, il est étourdi
//      et ses noyaux s'exposent (dégâts ×2,5). Sinon, son armure encaisse.
// P3 (rage) : plus rapide, invoque des Stalkers, ultime « Effondrement »
//      (saut puis écrasement massif), suivi d'un long épuisement.
import * as THREE from 'three';
import { toon } from '../fx/toon.js';

const HP = 2800;
const R = 2.3;
const H = 9;

const angleDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

class ColossusModel {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.joints = {};
    this.cur = {};
    this.t = 0;
    const rock = toon('#4a3a6a', { rim: '#b070ff', rimStrength: 0.8, emissive: '#ffffff', emissiveIntensity: 0, shared: false });
    const plate = toon('#2a2040', { rim: '#b070ff', rimStrength: 0.6, emissive: '#ffffff', emissiveIntensity: 0, shared: false });
    this.glow = toon('#c38cff', { emissive: '#a060ff', emissiveIntensity: 1.8, shared: false });
    this.core = toon('#ffe27a', { emissive: '#ffcd20', emissiveIntensity: 1, shared: false });
    this.skinMats = [rock, plate];
    const P = (name, parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    };
    const M = (geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const hips = P('hips', this.body, 0, 3.3, 0);
    M(new THREE.DodecahedronGeometry(1.4, 1), rock, hips).scale.set(1.3, 0.8, 1);
    const spine = P('spine', hips, 0, 0.6, 0);
    const torso = M(new THREE.DodecahedronGeometry(2.2, 1), rock, spine, 0, 2.0, 0.3);
    torso.scale.set(1.35, 1.05, 0.95);
    // Fissures lumineuses sur la poitrine
    for (let i = 0; i < 7; i++) M(new THREE.BoxGeometry(0.12, 1 + Math.random(), 0.12), this.glow, spine, -1.2 + i * 0.4, 1.8 + Math.random() * 0.8, 2.25, 0, 0, (Math.random() - 0.5) * 0.9);
    // Plaques dorsales + noyau dorsal (point faible)
    this.coreMeshes = [];
    this.coverPlates = [];
    const back = M(new THREE.SphereGeometry(0.5, 16, 12), this.core, spine, 0, 2.3, -1.9);
    this.coreMeshes.push(back);
    for (const sx of [-1, 1]) {
      const cp = M(new THREE.DodecahedronGeometry(0.75, 0), plate, spine, sx * 0.45, 2.3, -2.0);
      cp.scale.set(0.8, 1.2, 0.4);
      this.coverPlates.push({ m: cp, sx, base: cp.position.clone() });
    }
    // Tête enfoncée, visière lumineuse
    const head = P('head', spine, 0, 3.6, 1.1);
    M(new THREE.DodecahedronGeometry(0.85, 1), rock, head).scale.set(1.1, 0.9, 1);
    M(new THREE.BoxGeometry(1.2, 0.18, 0.3), this.glow, head, 0, 0.1, 0.75);
    for (const sx of [-1, 1]) M(new THREE.ConeGeometry(0.25, 1.1, 6), plate, head, sx * 0.7, 0.6, -0.1, -0.3, 0, sx * -0.6);
    // Bras massifs avec noyaux d'épaule
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const sh = P('sh' + side, spine, sx * 2.6, 3.0, 0.3);
      M(new THREE.DodecahedronGeometry(1.1, 1), plate, sh);
      const c = M(new THREE.SphereGeometry(0.38, 14, 10), this.core, sh, sx * 0.4, 0.75, -0.2);
      this.coreMeshes.push(c);
      M(new THREE.CapsuleGeometry(0.75, 1.6, 4, 10), rock, sh, 0, -1.4, 0);
      const el = P('el' + side, sh, 0, -2.6, 0);
      M(new THREE.CapsuleGeometry(0.7, 1.4, 4, 10), rock, el, 0, -1.1, 0);
      const fist = M(new THREE.DodecahedronGeometry(1.0, 1), plate, el, 0, -2.3, 0.1);
      fist.scale.set(1.1, 0.95, 1.1);
      M(new THREE.BoxGeometry(0.15, 1.2, 0.15), this.glow, el, sx * 0.55, -1.0, 0.45);
    }
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const hip = P('hip' + side, hips, sx * 1.2, -0.2, 0);
      M(new THREE.CapsuleGeometry(0.75, 1.0, 4, 10), rock, hip, 0, -0.9, 0);
      const kn = P('kn' + side, hip, 0, -1.7, 0);
      M(new THREE.CapsuleGeometry(0.65, 0.8, 4, 10), rock, kn, 0, -0.6, 0);
      M(new THREE.DodecahedronGeometry(0.8, 0), plate, kn, 0, -1.25, 0.25).scale.set(1, 0.5, 1.4);
    }
  }

  setCores(open, rage, t) {
    this.core.emissiveIntensity = open ? 3.5 + Math.sin(t * 12) * 1 : 0.6;
    for (const c of this.coverPlates) {
      const k = open ? 1 : 0;
      c.m.position.x += (c.base.x + c.sx * 0.9 * k - c.m.position.x) * 0.15;
      c.m.rotation.z += (c.sx * 0.9 * k - c.m.rotation.z) * 0.15;
    }
    this.glow.color.set(rage ? '#ff5a3a' : '#c38cff');
    this.glow.emissive.set(rage ? '#ff3a1a' : '#a060ff');
  }

  animate(st) {
    this.t += st.dt;
    const t = this.t;
    const P = {};
    const set = (k, x, y = 0, z = 0) => (P[k] = [x, y, z]);
    const ph = st.phase;
    const sp = Math.min(1.4, st.speed);
    const br = Math.sin(t * 1.1) * 0.04;
    set('spine', 0.25 + br);
    set('head', -0.2);
    set('shR', -0.2, 0, -0.25);
    set('shL', -0.2, 0, 0.25);
    set('elR', -0.4);
    set('elL', -0.4);
    if (sp > 0.05) {
      const s = Math.sin(ph);
      set('hipR', -s * 0.45 * sp);
      set('hipL', s * 0.45 * sp);
      set('knR', Math.max(0, Math.cos(ph)) * 0.6 * sp);
      set('knL', Math.max(0, -Math.cos(ph)) * 0.6 * sp);
      set('shR', -0.2 + s * 0.4 * sp, 0, -0.25);
      set('shL', -0.2 - s * 0.4 * sp, 0, 0.25);
      set('spine', 0.3 + br, s * 0.1);
    }
    const p = st.p;
    switch (st.mode) {
      case 'roar':
        set('spine', -0.3);
        set('head', -0.6);
        set('shR', -0.6, 0, -1.3);
        set('shL', -0.6, 0, 1.3);
        set('elR', -1.2);
        set('elL', -1.2);
        break;
      case 'slamWindup':
        set('spine', -0.3 * p);
        set('shR', -2.8 * p, 0, -0.2);
        set('shL', -2.8 * p, 0, 0.2);
        set('elR', -0.6 * p);
        set('elL', -0.6 * p);
        break;
      case 'slam':
        set('spine', 0.9);
        set('shR', -1.3, 0, 0.1);
        set('shL', -1.3, 0, -0.1);
        set('hipR', -0.6);
        set('knR', 0.8);
        set('hipL', -0.6);
        set('knL', 0.8);
        break;
      case 'sweepWindup':
        set('spine', 0.3, 0.9 * p);
        set('shR', -0.3, 0.6, -1.4 * p);
        break;
      case 'sweep':
        set('spine', 0.4, -0.9);
        set('shR', -1.4, -0.6, -0.2);
        set('elR', -0.1);
        break;
      case 'stompWindup':
        set('hipR', -1.2 * p);
        set('knR', 1.2 * p);
        set('spine', -0.1);
        break;
      case 'stomp':
        set('hipR', 0.1);
        set('knR', 0.2);
        set('spine', 0.4);
        break;
      case 'throwWindup':
        set('spine', -0.2, 0.6 * p);
        set('shR', 0.6 * p - 2.4 * p, 0, -0.3);
        set('elR', -1.4 * p);
        break;
      case 'throw':
        set('spine', 0.5, -0.5);
        set('shR', -1.8, 0, 0);
        set('elR', -0.2);
        break;
      case 'chargeWindup':
      case 'charge':
        set('spine', 0.95);
        set('head', -0.6);
        set('shR', 0.4 + Math.sin(t * 14) * 0.4, 0, -0.3);
        set('shL', 0.4 - Math.sin(t * 14) * 0.4, 0, 0.3);
        break;
      case 'leap':
        set('spine', -0.2);
        set('shR', -2.9, 0, 0.3);
        set('shL', -2.9, 0, -0.3);
        set('hipR', -1.2);
        set('knR', 1.6);
        set('hipL', -1.2);
        set('knL', 1.6);
        break;
      case 'stun':
        // Épuisé, à genoux : noyaux exposés.
        set('spine', 0.9 + Math.sin(t * 2) * 0.05);
        set('head', 0.4);
        set('shR', -0.6, 0, -0.5);
        set('shL', -0.6, 0, 0.5);
        set('hipR', -1.4);
        set('knR', 2.1);
        set('hipL', -0.3);
        set('knL', 1.6);
        break;
      case 'dead': {
        const d = Math.min(1, p);
        set('spine', 0.9 + d * 0.5);
        set('hipR', -1.4 * d);
        set('knR', 2.2 * d);
        set('hipL', -1.4 * d);
        set('knL', 2.2 * d);
        set('shR', -0.4, 0, -0.9 * d);
        set('shL', -0.4, 0, 0.9 * d);
        break;
      }
      default:
        break;
    }
    const down = st.mode === 'stun' ? 1.3 : st.mode === 'slam' ? 0.6 : st.mode === 'dead' ? Math.min(1, p) * 2.2 : 0;
    this.joints.hips.position.y += (3.3 - down - this.joints.hips.position.y) * Math.min(1, st.dt * 8);
    const k = 1 - Math.exp(-(st.fast ? 14 : 6) * st.dt);
    for (const name of Object.keys(this.joints)) {
      const tg = P[name] || [0, 0, 0];
      const c = this.cur[name] || (this.cur[name] = [0, 0, 0]);
      for (let i = 0; i < 3; i++) c[i] += (tg[i] - c[i]) * k;
      this.joints[name].rotation.set(c[0], c[1], c[2]);
    }
  }

  setFlash(f) {
    for (const m of this.skinMats) m.emissiveIntensity = f * 0.5;
  }
}

export class Colossus {
  constructor(game, pos) {
    this.game = game;
    this.type = 'colossus';
    this.spawn = { group: 'colossus', type: 'colossus', x: pos.x, z: pos.z };
    this.def = { name: 'LE COLOSSE', height: H, color: '#b070ff', hp: HP, xp: 600, credits: [300, 400], loot: [{ id: 'abyss_fragment', chance: 1, qty: [3, 4] }], poise: 0 };
    this.id = 'colossus';
    this.model = new ColossusModel();
    this.pos = new THREE.Vector3(pos.x, 0.15, pos.z);
    this.home = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.radius = R;
    this.hp = HP;
    this.alive = true;
    this.alert = true;
    this.state = 'intro';
    this.stateT = 0;
    this.phase = 0;
    this.walkPh = 0;
    this.flash = 0;
    this.showBar = 0;
    this.deadT = 0;
    this.stage = 1;
    this.slams = 0;
    this.waves = [];
    this.rocks = [];
    this.tele = null;
    this.exposed = false;
    this.model.root.position.copy(this.pos);
    game.scene.add(this.model.root);
    this.waveMat = new THREE.MeshBasicMaterial({ color: '#c38cff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.rockMat = toon('#4a3a6a', { rim: '#b070ff' });
  }

  get name() {
    return this.def.name;
  }

  alertTo() {}

  stagger(t = 1.5) {
    if (!this.alive || this.state === 'intro') return;
    this.#set('stun');
    this.stunFor = Math.max(1.5, t);
  }

  #set(s) {
    this.tele?.cancel();
    this.tele = null;
    this.state = s;
    this.stateT = 0;
    this.attackHit = false;
  }

  get hero() {
    return this.game.hero;
  }

  #dist() {
    return Math.hypot(this.hero.pos.x - this.pos.x, this.hero.pos.z - this.pos.z);
  }

  #face(dt, rate) {
    const want = Math.atan2(this.hero.pos.x - this.pos.x, this.hero.pos.z - this.pos.z);
    this.yaw += angleDiff(this.yaw, want) * (1 - Math.exp(-rate * dt));
  }

  #fwd() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  #hit(dmg, from, opts) {
    this.hero.takeDamage(dmg, from, { ...opts, source: this });
  }

  // Les dégâts sont réduits par l'armure, sauf quand les noyaux sont exposés.
  takeHit({ damage, dir, heavy, power }) {
    if (!this.alive || this.state === 'intro') return false;
    const mult = this.exposed ? 2.5 : 0.45;
    const dmg = Math.max(1, Math.round(damage * mult));
    this.hp -= dmg;
    this.flash = 1;
    this.game.onEnemyDamaged(this, dmg, heavy || this.exposed);
    const at = { x: this.pos.x - dir.x * R, y: this.pos.y + (this.exposed ? 5.6 : 3.5), z: this.pos.z - dir.z * R };
    this.game.fx.hitSpark(at, this.exposed ? '#ffe27a' : '#c38cff', heavy);
    this.game.audio.hit(this.pos, true);
    if (!this.exposed && Math.random() < 0.25) this.game.hud.toast('L’armure encaisse — attends que ses noyaux s’ouvrent !', '#c38cff');
    const ratio = this.hp / HP;
    if (this.stage === 1 && ratio < 0.66) this.#phase(2);
    else if (this.stage === 2 && ratio < 0.33) this.#phase(3);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.exposed = false;
      this.#set('dead');
      this.#clearWaves();
      this.game.audio.bruteRoar(this.pos);
      this.game.shake(1);
      this.game.onEnemyKilled(this);
    }
    void power;
    return true;
  }

  #phase(n) {
    this.stage = n;
    this.exposed = false;
    this.#set('roar');
    this.game.onBossPhase?.(this, n);
    if (n === 3) {
      // Rage : invoque deux Stalkers
      for (const k of [-1, 1]) {
        const e = this.game.spawnEnemy({ type: 'stalker', x: this.pos.x + k * 8, z: this.pos.z + 6, group: 'colossus_adds', patrol: [[this.pos.x, this.pos.z]] });
        e.alertTo(this.hero.pos);
      }
    }
  }

  #clearWaves() {
    for (const w of this.waves) this.game.scene.remove(w.mesh);
    this.waves = [];
    for (const r of this.rocks) {
      this.game.scene.remove(r.mesh);
      r.tele?.cancel();
    }
    this.rocks = [];
  }

  #chooseAttack() {
    const d = this.#dist();
    const st = this.stage;
    const roll = Math.random();
    if (st === 3 && this.stateT > 0 && roll < 0.25) return 'leapWindup';
    if (this.slams >= 3) {
      this.slams = 0;
      this.stunFor = 3;
      this.game.hud.toast('Le Colosse s’essouffle — ses noyaux s’ouvrent !', '#ffe27a');
      return 'stun';
    }
    if (d < 7.5) return roll < 0.45 ? 'slamWindup' : roll < 0.75 ? 'sweepWindup' : 'stompWindup';
    if (st >= 2 && d > 12 && roll < 0.5) return 'chargeWindup';
    if (st >= 2 && roll < 0.8) return 'throwWindup';
    return d < 16 ? 'stompWindup' : 'walk';
  }

  update(dt) {
    const g = this.game;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    const speedMul = this.stage === 3 ? 1.3 : 1;
    let move = 0;
    const fwd = this.#fwd();
    const T = this.stateT * speedMul;
    this.exposed = this.state === 'stun';

    switch (this.state) {
      case 'intro': {
        // Émerge lentement de la faille.
        const k = Math.min(1, this.stateT / (this.introDur || 0.1));
        this.pos.y = 0.15 - 11 * (1 - k) ** 2;
        if (Math.random() < dt * 20) g.fx.dustRing({ x: this.pos.x, y: 0.15, z: this.pos.z }, 3, 6, '#9a8c7a');
        if (k >= 1) this.#set('roar');
        break;
      }
      case 'roar':
        if (this.stateT < dt * 1.5) {
          g.audio.bruteRoar(this.pos);
          g.shake(0.6);
        }
        this.#face(dt, 2);
        if (this.stateT > 1.8) this.#set('walk');
        break;
      case 'walk': {
        this.#face(dt, 1.6);
        move = this.stage === 3 ? 3.6 : 2.6;
        if (this.stateT > 1.2) this.#set(this.#chooseAttack());
        break;
      }
      case 'slamWindup': {
        this.#face(dt, 2.5);
        const at = this.pos.clone().addScaledVector(fwd, 4);
        if (!this.tele) {
          this.tele = g.fx.telegraph(at, 6, 1.1 / speedMul);
          g.audio.telegraph(this.pos);
        }
        if (T > 1.1) {
          this.#set('slam');
          this.slams++;
          g.fx.slamWave(at, 8, '#b070ff');
          g.audio.bruteSlam(at);
          g.shake(0.8);
          if (Math.hypot(this.hero.pos.x - at.x, this.hero.pos.z - at.z) < 6 + this.hero.radius && this.hero.pos.y < 2) this.#hit(35, at, { knock: 13, heavy: true });
        }
        break;
      }
      case 'sweepWindup':
        this.#face(dt, 3);
        if (!this.tele) {
          this.tele = g.fx.telegraph(this.pos.clone(), 7.5, 0.9 / speedMul);
          g.audio.telegraph(this.pos);
        }
        if (T > 0.9) this.#set('sweep');
        break;
      case 'sweep':
        if (!this.attackHit && this.stateT > 0.1) {
          this.attackHit = true;
          g.audio.swing(true);
          g.fx.dustRing(this.pos, 4, 18);
          // Sauter (ou rouler) permet d'éviter le balayage bas.
          if (this.#dist() < 7.5 + this.hero.radius && this.hero.pos.y - this.pos.y < 1.2) this.#hit(25, this.pos, { knock: 10, heavy: true });
          this.slams++;
        }
        if (this.stateT > 0.8) this.#set('walk');
        break;
      case 'stompWindup':
        this.#face(dt, 2);
        if (this.stateT < dt * 1.5) g.audio.telegraph(this.pos);
        if (T > 0.8) {
          this.#set('stomp');
          g.audio.bruteSlam(this.pos);
          g.shake(0.5);
          // Onde de choc annulaire : il faut être en l'air quand elle passe.
          const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), this.waveMat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(this.pos.x, 0.3, this.pos.z);
          g.scene.add(mesh);
          this.waves.push({ mesh, r: 1, center: this.pos.clone(), hit: false });
          this.slams++;
        }
        break;
      case 'stomp':
        if (this.stateT > 0.7) this.#set('walk');
        break;
      case 'throwWindup':
        this.#face(dt, 3);
        if (T > 1.0) {
          this.#set('throw');
          // Débris lancé vers la position anticipée ; zone d'impact affichée.
          const target = this.hero.pos.clone().addScaledVector(this.hero.vel, 0.6);
          target.y = 0.15;
          const from = this.pos.clone().add(new THREE.Vector3(0, 7, 0)).addScaledVector(fwd, 1.5);
          const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), this.rockMat);
          mesh.position.copy(from);
          mesh.castShadow = true;
          g.scene.add(mesh);
          const flight = 1.25;
          this.rocks.push({ mesh, from, target, t: 0, flight, tele: g.fx.telegraph(target, 3, flight) });
          g.audio.swing(true);
        }
        break;
      case 'throw':
        if (this.stateT > 0.6) this.#set('walk');
        break;
      case 'chargeWindup':
        this.#face(dt, 4);
        if (!this.tele) {
          this.tele = g.fx.telegraph(this.pos.clone().addScaledVector(fwd, 6), 2.2, 1.0);
          g.audio.bruteRoar(this.pos);
        }
        if (T > 1.0) {
          this.chargeDir = this.#fwd();
          this.#set('charge');
        }
        break;
      case 'charge': {
        move = 0;
        this.vel.copy(this.chargeDir).multiplyScalar(18 * speedMul);
        if (Math.random() < dt * 25) g.fx.dustRing(this.pos, 1.2, 4, '#9a8c7a');
        if (!this.attackHit && this.#dist() < R + this.hero.radius + 0.6 && this.hero.pos.y < 3) {
          this.attackHit = true;
          this.#hit(40, this.pos, { knock: 18, heavy: true });
        }
        if (this.hitWall) {
          // Percute un obstacle : étourdi, noyaux exposés.
          g.shake(0.8);
          g.audio.bruteSlam(this.pos);
          g.fx.slamWave(this.pos.clone().addScaledVector(this.chargeDir, 2), 5, '#9a8c7a');
          g.hud.toast('Le Colosse est sonné — vise ses noyaux !', '#ffe27a');
          this.vel.set(0, 0, 0);
          this.stunFor = 4;
          this.#set('stun');
        } else if (this.stateT > 1.8) {
          this.vel.set(0, 0, 0);
          this.#set('walk');
        }
        break;
      }
      case 'leapWindup':
        this.#face(dt, 3);
        if (this.stateT < dt * 1.5) {
          g.audio.bruteRoar(this.pos);
          g.hud.toast('EFFONDREMENT — éloigne-toi ou envole-toi !', '#ff5a3a');
        }
        if (this.stateT > 0.8) {
          this.leapTo = this.hero.pos.clone().setY(0.15);
          this.leapFrom = this.pos.clone();
          this.tele = g.fx.telegraph(this.leapTo, 9, 1.6);
          this.state = 'leap';
          this.stateT = 0;
        }
        break;
      case 'leap': {
        const k = Math.min(1, this.stateT / 1.6);
        this.pos.lerpVectors(this.leapFrom, this.leapTo, k);
        this.pos.y = 0.15 + Math.sin(k * Math.PI) * 16;
        if (k >= 1) {
          this.tele = null;
          g.fx.slamWave(this.pos, 12, '#ff5a3a');
          g.fx.dustRing(this.pos, 6, 30);
          g.audio.bruteSlam(this.pos);
          g.shake(1.2);
          if (this.#dist() < 9 + this.hero.radius && this.hero.pos.y - this.pos.y < 3) this.#hit(55, this.pos, { knock: 20, heavy: true });
          this.stunFor = 5;
          this.#set('stun');
        }
        break;
      }
      case 'stun':
        if (this.stateT > (this.stunFor || 3)) {
          this.#set('roar');
          this.stateT = 1.2;
        }
        break;
      case 'dead':
        this.deadT += dt;
        if (Math.random() < dt * 30) g.fx.emit({ x: this.pos.x + (Math.random() - 0.5) * 4, y: 1 + Math.random() * 7, z: this.pos.z + (Math.random() - 0.5) * 4 }, { count: 3, color: '#c38cff', speed: 2, up: 3, size: 0.6, life: 1.2, gravity: -2 });
        if (this.deadT > 3) this.model.root.scale.setScalar(Math.max(0.01, 1 - (this.deadT - 3) / 1.5));
        if (this.deadT > 4.5) this.model.root.visible = false;
        break;
      default:
        break;
    }

    // Déplacement + collisions
    if (this.state !== 'leap' && this.state !== 'intro') {
      const v = this.state === 'charge' ? this.vel : this.#fwd().multiplyScalar(move);
      const r = g.col.moveCylinder(this.pos, R, H, v.x * dt, v.z * dt);
      this.hitWall = r.hitWall && this.state === 'charge';
      this.pos.y = 0.15;
    }
    this.walkPh += dt * 4 * (move / 2.6);

    this.#updateWaves(dt);
    this.#updateRocks(dt);
    // Le héros ne traverse pas le Colosse
    const hx = this.hero.pos.x - this.pos.x;
    const hz = this.hero.pos.z - this.pos.z;
    const hd = Math.hypot(hx, hz);
    if (this.alive && hd < R + this.hero.radius && hd > 0.01 && this.hero.pos.y < this.pos.y + H) {
      this.hero.pos.x = this.pos.x + (hx / hd) * (R + this.hero.radius);
      this.hero.pos.z = this.pos.z + (hz / hd) * (R + this.hero.radius);
    }

    const mode = { slamWindup: 'slamWindup', slam: 'slam', sweepWindup: 'sweepWindup', sweep: 'sweep', stompWindup: 'stompWindup', stomp: 'stomp', throwWindup: 'throwWindup', throw: 'throw', chargeWindup: 'chargeWindup', charge: 'charge', leapWindup: 'roar', leap: 'leap', stun: 'stun', roar: 'roar', dead: 'dead' }[this.state] || 'walk';
    const p = mode === 'slamWindup' ? Math.min(1, T / 1.1) : mode === 'sweepWindup' ? Math.min(1, T / 0.9) : mode === 'stompWindup' ? Math.min(1, T / 0.8) : mode === 'throwWindup' ? Math.min(1, T / 1.0) : mode === 'dead' ? this.deadT / 2 : 1;
    this.model.animate({ dt, mode, p, phase: this.walkPh, speed: move / 2.6, fast: ['slam', 'sweep', 'stomp', 'throw'].includes(mode) });
    this.model.setCores(this.exposed, this.stage === 3, g.time);
    this.model.setFlash(this.flash);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }

  #updateWaves(dt) {
    const hero = this.hero;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += dt * 10;
      w.mesh.scale.setScalar(w.r);
      w.mesh.material.opacity = Math.max(0, 0.85 * (1 - w.r / 24));
      const d = Math.hypot(hero.pos.x - w.center.x, hero.pos.z - w.center.z);
      // Touché seulement si au sol quand le front de l'onde passe.
      const ground = this.game.col.groundHeight(hero.pos.x, hero.pos.z, hero.radius, hero.pos.y);
      if (!w.hit && Math.abs(d - w.r) < 0.7 && hero.pos.y - ground < 0.4) {
        w.hit = true;
        this.#hit(20, w.center, { knock: 8 });
      }
      if (w.r > 24) {
        this.game.scene.remove(w.mesh);
        this.waves.splice(i, 1);
      }
    }
  }

  #updateRocks(dt) {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.flight);
      r.mesh.position.lerpVectors(r.from, r.target, k);
      r.mesh.position.y += Math.sin(k * Math.PI) * 8;
      r.mesh.rotation.x += dt * 5;
      r.mesh.rotation.z += dt * 3;
      if (k >= 1) {
        this.game.fx.slamWave(r.target, 4, '#9a8c7a');
        this.game.audio.bruteSlam(r.target);
        this.game.shake(0.4, r.target);
        const h = this.hero;
        if (Math.hypot(h.pos.x - r.target.x, h.pos.z - r.target.z) < 3 + h.radius && h.pos.y < 2.5) this.#hit(25, r.target, { knock: 9, heavy: true });
        this.game.scene.remove(r.mesh);
        this.rocks.splice(i, 1);
      }
    }
  }
}
