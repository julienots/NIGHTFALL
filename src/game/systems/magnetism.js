// Magnétisme de Noa : il arrache du sol les objets métalliques (voitures,
// bennes, barils), les fait léviter au-dessus de lui puis les projette sur les
// créatures. En vol, la « tempête de métal » soulève tout ce qui est proche et
// le fait pleuvoir sur les ennemis.
import * as THREE from 'three';
import { toon } from '../fx/toon.js';
import { bakeRigid } from '../core/bake.js';

const GRAVITY = 20;
const GRAB_RANGE = 24;
const HOLD_COST = 5; // énergie par seconde de lévitation
export const STORM = { energy: 55, cooldown: 14, max: 5 };

// Dimensions (largeur x hauteur x longueur) et puissance par type d'objet.
const KINDS = {
  car: { size: [2.0, 1.6, 4.1], dmg: 5.5, aoe: 3.6, holdY: 3.4 },
  van: { size: [2.0, 2.2, 5.2], dmg: 6.5, aoe: 4.2, holdY: 3.8 },
  dumpster: { size: [1.9, 1.3, 1.3], dmg: 3.6, aoe: 2.8, holdY: 3.0 },
  barrel: { size: [0.8, 1.1, 0.8], dmg: 2.4, aoe: 2.2, holdY: 2.8 },
};

let mats = null;
function propMats() {
  if (mats) return mats;
  mats = {
    dumpster: toon('#3fae6a', { rim: '#bfffd8', rimStrength: 0.5, shared: false }),
    lid: toon('#2b6e48', { shared: false }),
    barrel: toon('#e2533f', { rim: '#ffd0c0', rimStrength: 0.5, shared: false }),
    band: toon('#ffcd20', { shared: false }),
    dark: toon('#2b2050', { shared: false }),
  };
  return mats;
}

function makeDumpster() {
  const m = propMats();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.3), m.dumpster);
  body.position.y = 0.65;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 1.4), m.lid);
  lid.position.y = 1.25;
  lid.rotation.x = -0.12;
  g.add(body, lid);
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.45, 0.45]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8), m.dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx, 0.1, sz);
    g.add(w);
  }
  return g;
}

function makeBarrel() {
  const m = propMats();
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 12), m.barrel);
  b.position.y = 0.55;
  g.add(b);
  for (const y of [0.25, 0.85]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.03, 6, 14), m.band);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    g.add(r);
  }
  return g;
}

export class Magnetism {
  constructor(game) {
    this.game = game;
    this.props = [];
    this.held = null;
    this.storm = null;
    this.stormCd = 0;
    this.group = new THREE.Group();
    this.group.name = 'magnet-props';
    game.scene.add(this.group);
  }

  // Ajoute un objet soulevable. spot : { kind, x, z, yaw, color }
  add(spot) {
    const kind = KINDS[spot.kind] ? spot.kind : 'car';
    let g;
    if (kind === 'car' || kind === 'van') g = this.game.world.makeCar({ van: kind === 'van', color: spot.color, burnt: spot.burnt, decal: spot.decal });
    else g = kind === 'dumpster' ? makeDumpster() : makeBarrel();
    bakeRigid(g);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    this.group.add(g);
    const def = KINDS[kind];
    const p = {
      kind, def, g,
      pos: new THREE.Vector3(spot.x, 0, spot.z),
      vel: new THREE.Vector3(),
      yaw: spot.yaw || 0,
      spin: new THREE.Vector3(),
      rot: new THREE.Euler(0, spot.yaw || 0, 0),
      state: 'rest',
      box: null,
      hit: new Set(),
    };
    p.pos.y = this.game.col.groundHeight(p.pos.x, p.pos.z, 0.5, 2);
    p.box = this.game.col.addBox({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 'prop');
    this.#settle(p);
    this.props.push(p);
    return p;
  }

  // Remet l'objet au repos : à plat, collision recalculée à sa nouvelle place.
  #settle(p) {
    p.state = 'rest';
    p.rot.set(0, p.yaw, 0);
    p.vel.set(0, 0, 0);
    p.g.position.copy(p.pos);
    p.g.rotation.copy(p.rot);
    const [w, h, l] = p.def.size;
    const c = Math.abs(Math.cos(p.yaw));
    const s = Math.abs(Math.sin(p.yaw));
    const hx = (w * c + l * s) * 0.47;
    const hz = (w * s + l * c) * 0.47;
    p.box.disabled = false;
    this.game.col.moveBox(p.box, { x: p.pos.x - hx, y: p.pos.y, z: p.pos.z - hz }, { x: p.pos.x + hx, y: p.pos.y + h, z: p.pos.z + hz });
  }

  get holding() {
    return !!this.held;
  }

  // Touche « aimant » : saisir, ou lancer ce qu'on tient. En vol : tempête de métal.
  press() {
    const hero = this.game.hero;
    if (this.held) return this.throwHeld();
    if (hero.flying) return this.startStorm();
    const p = this.#pick();
    if (!p) {
      this.game.hud.toast('Aucun objet métallique à portée', '#7fe3ff');
      this.game.audio.denied();
      return false;
    }
    if (hero.energy < 10) {
      this.game.onPowerDenied('energy');
      return false;
    }
    this.#lift(p, 'held');
    this.held = p;
    hero.playAnim('magnetLift', 0.45, false);
    this.game.audio.magnetGrab(p.pos);
    this.game.onMagnet?.('grab', p);
    return true;
  }

  #lift(p, state) {
    p.state = state;
    p.box.disabled = true;
    p.hit.clear();
    p.spin.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6);
    this.game.fx.dustRing(p.pos, 1.6, 12);
    this.game.fx.ring(p.pos, { color: '#7fe3ff', from: 0.5, to: 3.2, life: 0.4 });
    this.game.shake(0.15, p.pos);
  }

  // Objet le plus pertinent devant la caméra.
  #pick() {
    const g = this.game;
    const hero = g.hero;
    const f = new THREE.Vector3(Math.sin(g.camYaw), 0, Math.cos(g.camYaw));
    let best = null;
    let bs = Infinity;
    for (const p of this.props) {
      if (p.state !== 'rest') continue;
      const dx = p.pos.x - hero.pos.x;
      const dz = p.pos.z - hero.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > GRAB_RANGE || Math.abs(p.pos.y - hero.pos.y) > 12) continue;
      const dot = d > 0.1 ? (dx * f.x + dz * f.z) / d : 1;
      if (dot < 0.25 && d > 4) continue;
      const s = d * (1.8 - dot);
      if (s < bs) {
        bs = s;
        best = p;
      }
    }
    return best;
  }

  // Cible du lancer : verrou, sinon créature la mieux placée devant la caméra.
  #aim(from) {
    const g = this.game;
    if (g.lockTarget?.alive) return g.lockTarget;
    const f = new THREE.Vector3(Math.sin(g.camYaw), 0, Math.cos(g.camYaw));
    let best = null;
    let bs = Infinity;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const v = e.pos.clone().sub(from).setY(0);
      const d = v.length();
      if (d > 45) continue;
      const dot = v.normalize().dot(f);
      if (dot < 0.55) continue;
      const s = d * (1.6 - dot);
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    return best;
  }

  #launch(p, target) {
    const g = this.game;
    const speed = 32;
    let to;
    if (target) to = target.pos.clone().add(new THREE.Vector3(0, target.def.height * 0.4, 0));
    else {
      const f = new THREE.Vector3(Math.sin(g.camYaw) * Math.cos(g.camPitch), -Math.sin(g.camPitch) * 0.6, Math.cos(g.camYaw) * Math.cos(g.camPitch));
      to = p.pos.clone().addScaledVector(f.normalize(), 30);
    }
    const d = to.clone().sub(p.pos);
    const t = Math.max(0.25, d.length() / speed);
    // Tir balistique : la gravité est compensée pour arriver sur la cible.
    p.vel.set(d.x / t, d.y / t + 0.5 * GRAVITY * t, d.z / t);
    p.state = 'thrown';
    p.target = target;
    p.flightT = 0;
    p.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8);
  }

  throwHeld() {
    const p = this.held;
    if (!p) return false;
    const g = this.game;
    this.held = null;
    const target = this.#aim(p.pos);
    if (target) g.hero.yaw = Math.atan2(target.pos.x - g.hero.pos.x, target.pos.z - g.hero.pos.z);
    this.#launch(p, target);
    g.hero.playAnim('magnetThrow', 0.45, false);
    g.audio.magnetThrow();
    g.shake(0.25);
    g.onMagnet?.('throw', p);
    return true;
  }

  drop() {
    const p = this.held;
    if (!p) return;
    this.held = null;
    p.state = 'thrown';
    p.vel.set(0, -2, 0);
    p.target = null;
    p.flightT = 0;
  }

  // Tempête de métal : jusqu'à 5 objets proches orbitent puis s'abattent.
  startStorm() {
    const g = this.game;
    const hero = g.hero;
    if (this.storm) return false;
    if (this.stormCd > 0 || hero.energy < STORM.energy) {
      g.onPowerDenied(this.stormCd > 0 ? 'storm' : 'energy', STORM.energy);
      return false;
    }
    const list = this.props
      .filter((p) => p.state === 'rest' && p.pos.distanceTo(hero.pos) < 38)
      .sort((a, b) => a.pos.distanceTo(hero.pos) - b.pos.distanceTo(hero.pos))
      .slice(0, STORM.max);
    if (!list.length) {
      g.hud.toast('Rien de métallique assez proche pour la tempête', '#7fe3ff');
      g.audio.denied();
      return false;
    }
    hero.energy -= STORM.energy;
    this.stormCd = STORM.cooldown;
    list.forEach((p, i) => {
      this.#lift(p, 'storm');
      p.orbit = (i / list.length) * Math.PI * 2;
    });
    this.storm = { list, t: 0, fired: 0 };
    hero.playAnim('magnetLift', 1.6, false);
    g.audio.magnetGrab(hero.pos);
    g.audio.rumble(1.6);
    g.shake(0.5);
    g.hud.toast('TEMPÊTE DE MÉTAL !', '#7fe3ff');
    g.onMagnet?.('storm', list);
    return true;
  }

  // Dégâts d'un objet sur une créature ou à l'impact au sol.
  #damage(p, e, mult = 1) {
    const g = this.game;
    const base = g.hero.stats.damage * p.def.dmg * (g.hero.mods.damageMult || 1) * mult;
    const dmg = Math.round(base * (0.9 + Math.random() * 0.2));
    const dir = new THREE.Vector3(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z);
    if (dir.lengthSq() < 1e-4) dir.set(p.vel.x, 0, p.vel.z);
    dir.normalize();
    e.takeHit({ damage: dmg, dir, knock: 12, poise: 120, heavy: true, power: true });
  }

  #impact(p) {
    const g = this.game;
    for (const e of g.enemies) {
      if (!e.alive || p.hit.has(e)) continue;
      if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < p.def.aoe + e.radius && Math.abs(e.pos.y - p.pos.y) < 4) {
        p.hit.add(e);
        this.#damage(p, e, 0.6);
      }
    }
    g.fx.dustRing(p.pos, p.def.aoe * 0.8, 20);
    g.fx.ring(p.pos, { color: '#7fe3ff', from: 0.5, to: p.def.aoe * 1.6, life: 0.45 });
    g.fx.starBurst({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, '#ffffff', 2.2);
    g.audio.crash(p.pos);
    g.shake(0.45, p.pos);
    g.hitStop(0.05);
  }

  update(dt) {
    const g = this.game;
    const hero = g.hero;
    this.stormCd = Math.max(0, this.stormCd - dt);
    const col = g.col;
    // Lâche l'objet si Noa est touché, transformé, mort ou à court d'énergie.
    if (this.held) {
      hero.energy -= HOLD_COST * dt;
      if (hero.energy <= 0 || hero.dead || hero.action?.kind === 'hurt' || hero.form === 'umbra' || hero.cinematic) {
        hero.energy = Math.max(0, hero.energy);
        this.drop();
      }
    }
    g.audio.magnetHum(this.held || this.storm ? 1 : 0);

    const f = hero.facing();
    for (const p of this.props) {
      if (p.state === 'rest') continue;
      if (p.state === 'held') {
        // Lévite au-dessus de l'épaule, tourne lentement, oscille.
        const want = hero.pos.clone().addScaledVector(f, 1.2).add(new THREE.Vector3(0, p.def.holdY + Math.sin(g.time * 3) * 0.15, 0));
        p.pos.lerp(want, 1 - Math.exp(-7 * dt));
        p.rot.x += (Math.sin(g.time * 1.3) * 0.25 - p.rot.x) * dt * 2;
        p.rot.y += dt * 0.6;
        p.rot.z += (Math.cos(g.time * 1.1) * 0.2 - p.rot.z) * dt * 2;
        if (Math.random() < 0.3) g.fx.emit({ x: p.pos.x, y: p.pos.y - 0.3, z: p.pos.z }, { count: 1, color: '#7fe3ff', speed: 0.6, size: 0.18, life: 0.4, gravity: -1 });
      } else if (p.state === 'storm') {
        const s = this.storm;
        p.orbit += dt * 2.2;
        const r = 4.2;
        const want = hero.pos.clone().add(new THREE.Vector3(Math.cos(p.orbit) * r, 3 + Math.sin(p.orbit * 2) * 0.6, Math.sin(p.orbit) * r));
        p.pos.lerp(want, 1 - Math.exp(-4 * dt));
        p.rot.x += dt * 1.5;
        p.rot.z += dt * 1.1;
        void s;
      } else if (p.state === 'thrown') {
        p.flightT += dt;
        // Léger guidage vers la cible (la créature bouge).
        if (p.target?.alive && p.flightT < 1.2) {
          const to = p.target.pos.clone().sub(p.pos).setY(0);
          const hv = Math.hypot(p.vel.x, p.vel.z);
          if (to.lengthSq() > 1) {
            to.normalize().multiplyScalar(hv);
            p.vel.x += (to.x - p.vel.x) * Math.min(1, dt * 3);
            p.vel.z += (to.z - p.vel.z) * Math.min(1, dt * 3);
          }
        }
        p.vel.y -= GRAVITY * dt;
        const prev = p.pos.clone();
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        if (Math.random() < 0.6) g.fx.emit(prev, { count: 1, color: '#7fe3ff', speed: 0.2, size: 0.3, life: 0.35, gravity: 0 });
        // Touche une créature en vol
        for (const e of g.enemies) {
          if (!e.alive || p.hit.has(e)) continue;
          const dy = p.pos.y - (e.pos.y + e.def.height * 0.5);
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < e.radius + 1.4 && Math.abs(dy) < e.def.height * 0.5 + 1.2) {
            p.hit.add(e);
            this.#damage(p, e, 1);
            g.fx.hitSpark?.(p.pos, true);
            p.vel.multiplyScalar(0.35);
            p.vel.y = Math.max(p.vel.y, 3);
          }
        }
        // Mur : rebond mou vers le bas
        const d = p.pos.clone().sub(prev);
        if (d.lengthSq() > 1e-6) {
          const tt = col.raycast(new THREE.Vector3(prev.x, prev.y + 0.6, prev.z), d, 1);
          if (tt < 1) {
            p.pos.copy(prev).addScaledVector(d, Math.max(0, tt - 0.05));
            p.vel.x *= -0.2;
            p.vel.z *= -0.2;
          }
        }
        const gh = col.groundHeight(p.pos.x, p.pos.z, 0.6, p.pos.y + 0.5, 0.6);
        if (p.pos.y <= gh && p.vel.y <= 0) {
          p.pos.y = gh;
          const hard = p.vel.length() > 6;
          if (hard) this.#impact(p);
          p.yaw = p.rot.y;
          this.#settle(p);
          continue;
        }
        if (p.pos.y < -10) {
          p.pos.y = 0;
          this.#settle(p);
          continue;
        }
      }
      p.g.position.copy(p.pos);
      p.g.rotation.copy(p.rot);
    }

    // Tempête : après 1,4 s, lance les objets un à un sur les créatures.
    const s = this.storm;
    if (s) {
      s.t += dt;
      if (s.t > 1.4) {
        const next = s.list[s.fired];
        if (next && s.t > 1.4 + s.fired * 0.22) {
          const foes = g.enemies.filter((e) => e.alive && e.pos.distanceTo(hero.pos) < 45);
          const target = foes.length ? foes[s.fired % foes.length] : null;
          this.#launch(next, target);
          if (!target) next.vel.set((Math.random() - 0.5) * 10, -18, (Math.random() - 0.5) * 10);
          g.audio.magnetThrow();
          s.fired++;
        }
        if (s.fired >= s.list.length) this.storm = null;
      }
      if (hero.dead) {
        for (const p of s.list) if (p.state === 'storm') this.#launch(p, null);
        this.storm = null;
      }
    }
  }
}
