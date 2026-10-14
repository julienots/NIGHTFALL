// Mode Créatif : bac à sable. Tous les pouvoirs dès le départ, menu pour faire
// apparaître créatures, Colosse, héros alliés, police, passants ; réglages
// (invincible, énergie / Abysse illimitées, police désactivée, heure) et cinq
// pouvoirs exclusifs (touche U pour lancer, O pour changer ; bouton ✪ au toucher).
import * as THREE from 'three';
import { Npc } from '../actors/npc.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const CREA_POWERS = [
  { id: 'singularity', name: 'Singularité', icon: '◉', color: '#9a6cff', cd: 6, desc: 'Un trou noir aspire tout pendant 2,5 s puis explose.' },
  { id: 'chain', name: 'Chaîne d’éclairs', icon: 'ϟ', color: '#7fe3ff', cd: 2.5, desc: 'La foudre saute entre 8 cibles.' },
  { id: 'freeze', name: 'Gel', icon: '❄', color: '#bfefff', cd: 5, desc: 'Fige les créatures dans la glace (12 m, 5 s).' },
  { id: 'blink', name: 'Téléportation', icon: '➹', color: '#ff9cf0', cd: 1.2, desc: 'Bond instantané de 15 m vers l’avant.' },
  { id: 'meteor', name: 'Météore', icon: '☄', color: '#ff7a3d', cd: 7, desc: 'Un météore s’abat là où tu regardes.' },
];

export class Creative {
  constructor(game) {
    this.game = game;
    this.invincible = false;
    this.infinite = true; // énergie et Abysse illimitées
    this.noPolice = false;
    this.power = 0;
    this.cd = 0;
    this.effects = []; // effets en cours (trou noir, glace, météore)
  }

  get current() {
    return CREA_POWERS[this.power];
  }

  next() {
    this.power = (this.power + 1) % CREA_POWERS.length;
    this.game.hud.toast(`Pouvoir créatif : ${this.current.icon} ${this.current.name} — ${this.current.desc}`, this.current.color);
  }

  select(i) {
    this.power = i;
  }

  // Point visé : devant Noa dans l'axe de la caméra, posé au sol (ou sur un mur).
  #aim(dist) {
    const g = this.game;
    const yaw = g.camYaw;
    const o = g.hero.pos.clone().add(V(0, 1.4, 0));
    const d = V(Math.sin(yaw), 0, Math.cos(yaw));
    const t = g.col.raycast(o, d.clone().multiplyScalar(dist), 1);
    const p = o.addScaledVector(d, Math.max(2, dist * t - 0.8));
    p.y = g.col.groundHeight(p.x, p.z, 0.3, p.y + 2);
    return p;
  }

  #targets(center, r) {
    return this.game.aimTargets().filter((e) => e.alive && e.pos.distanceTo(center) < r);
  }

  use() {
    const g = this.game;
    const P = this.current;
    if (this.cd > 0) return g.onPowerDenied?.('cooldown');
    if (g.hero.dead || g.zone !== 'city') return;
    this.cd = P.cd;
    g.hero.playAnim?.('volley', 0.6);
    ({ singularity: () => this.#singularity(), chain: () => this.#chain(), freeze: () => this.#freeze(), blink: () => this.#blink(), meteor: () => this.#meteor() })[P.id]();
  }

  #singularity() {
    const g = this.game;
    const c = this.#aim(11).add(V(0, 1.6, 0));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), new THREE.MeshBasicMaterial({ color: '#05020c' }));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: '#9a6cff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    core.position.copy(c);
    halo.position.copy(c);
    g.scene.add(core, halo);
    g.audio.magnetHum?.(1);
    this.effects.push({
      t: 0, dur: 2.5,
      tick: (e, dt) => {
        const k = Math.min(1, e.t / 0.4);
        core.scale.setScalar(k * (1 + Math.sin(e.t * 30) * 0.05));
        halo.rotation.x += dt * 3;
        halo.rotation.y += dt * 5;
        halo.scale.setScalar(k * (1.2 + Math.sin(e.t * 8) * 0.15));
        // Aspiration (créatures, policiers) + débris
        for (const x of this.#targets(c, 14)) {
          const dir = c.clone().sub(x.pos).setY(0);
          const d = dir.length();
          if (d > 0.8) g.col.moveCylinder(x.pos, x.radius || 0.4, 1.8, (dir.x / d) * 9 * dt, (dir.z / d) * 9 * dt);
        }
        if (Math.random() < 0.8) {
          const a = Math.random() * Math.PI * 2;
          g.fx.emit(c.clone().add(V(Math.cos(a) * 6, (Math.random() - 0.3) * 3, Math.sin(a) * 6)), { count: 1, color: '#9a6cff', speed: 0.1, size: 0.25, life: 0.5, gravity: 0, dir: { x: -Math.cos(a), y: 0, z: -Math.sin(a) } });
        }
      },
      end: () => {
        g.scene.remove(core, halo);
        g.fx.voidBurst(c.clone().setY(c.y - 1.6), { x: 0, y: 1, z: 0 });
        g.shake(0.8, c);
        for (const x of this.#targets(c, 7)) x.takeHit({ damage: 140, dir: x.pos.clone().sub(c).setY(0).normalize(), knock: 14, poise: 200, heavy: true, power: true });
      },
    });
  }

  #chain() {
    const g = this.game;
    let from = g.hero.pos.clone().add(V(0, 1.4, 0));
    let cur = this.#targets(g.hero.pos, 20).sort((a, b) => a.pos.distanceTo(g.hero.pos) - b.pos.distanceTo(g.hero.pos))[0];
    if (!cur) {
      g.fx.bolt(from, this.#aim(12).add(V(0, 1, 0)), '#7fe3ff', 10);
      return;
    }
    const hit = new Set();
    for (let i = 0; i < 8 && cur; i++) {
      hit.add(cur);
      const to = cur.pos.clone().add(V(0, (cur.def?.height || 1.6) * 0.6, 0));
      g.fx.bolt(from, to, '#7fe3ff', 10);
      g.fx.bolt(from, to, '#ffffff', 6);
      cur.takeHit({ damage: 90, dir: to.clone().sub(from).setY(0).normalize(), knock: 3, poise: 40, heavy: true, power: true });
      from = to;
      const p = to;
      cur = this.#targets(p, 10).filter((x) => !hit.has(x)).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
    }
    g.fx.flash(g.hero.pos, '#7fe3ff', 60, 0.25);
  }

  #freeze() {
    const g = this.game;
    const c = g.hero.pos.clone();
    g.fx.ring(c, { color: '#bfefff', from: 0.5, to: 12, life: 0.6 });
    g.fx.emit(c.clone().add(V(0, 1, 0)), { count: 70, color: '#dff6ff', speed: 12, up: 2, size: 0.3, life: 0.7, gravity: 1 });
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshToonMaterial({ color: '#bfefff', transparent: true, opacity: 0.55, emissive: '#5fb7ff', emissiveIntensity: 0.4 });
    for (const x of this.#targets(c, 12)) {
      if (x.stagger) x.stagger(5);
      if (x.atkCd != null) x.atkCd = 5;
      const ice = new THREE.Mesh(geo, mat);
      const h = x.def?.height || 1.8;
      ice.scale.set((x.radius || 0.5) * 1.8, h * 0.65, (x.radius || 0.5) * 1.8);
      ice.position.set(x.pos.x, x.pos.y + h * 0.5, x.pos.z);
      g.scene.add(ice);
      this.effects.push({
        t: 0, dur: 5,
        tick: (e) => {
          ice.position.set(x.pos.x, x.pos.y + h * 0.5, x.pos.z);
          ice.visible = x.alive;
          if (x.vel) x.vel.set(0, 0, 0);
          ice.material.opacity = e.t > 4.5 ? 0.55 * (5 - e.t) * 2 : 0.55;
        },
        end: () => g.scene.remove(ice),
      });
    }
  }

  #blink() {
    const g = this.game;
    const h = g.hero;
    const from = h.pos.clone();
    const yaw = g.camYaw;
    const d = V(Math.sin(yaw), 0, Math.cos(yaw));
    const o = from.clone().add(V(0, 1, 0));
    const t = g.col.raycast(o, d.clone().multiplyScalar(15), 1);
    const to = from.clone().addScaledVector(d, Math.max(0, 15 * t - 0.8));
    to.y = g.col.groundHeight(to.x, to.z, 0.4, from.y + 2);
    g.fx.emit(from.clone().add(V(0, 1, 0)), { count: 30, color: '#ff9cf0', speed: 5, size: 0.3, life: 0.4, gravity: 0 });
    for (let i = 0; i <= 10; i++) g.fx.emit(from.clone().lerp(to, i / 10).add(V(0, 1, 0)), { count: 2, color: '#ffd0f4', speed: 0.5, size: 0.25, life: 0.35, gravity: 0 });
    h.placeAt(to, yaw);
    g.fx.ring(to, { color: '#ff9cf0', from: 0.3, to: 3.5, life: 0.35 });
  }

  #meteor() {
    const g = this.game;
    const target = this.#aim(18);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshToonMaterial({ color: '#3a2a20', emissive: '#ff5a1a', emissiveIntensity: 0.9 }));
    const start = target.clone().add(V(-14, 40, -10));
    rock.position.copy(start);
    g.scene.add(rock);
    const tele = g.fx.telegraph(target, 7, 1.1);
    void tele;
    this.effects.push({
      t: 0, dur: 1.1,
      tick: (e) => {
        const k = e.t / e.dur;
        rock.position.lerpVectors(start, target, k * k);
        rock.rotation.x += 0.2;
        rock.rotation.z += 0.13;
        g.fx.emit(rock.position, { count: 3, color: '#ff9a3d', speed: 1.5, size: 0.6, life: 0.5, gravity: -1 });
      },
      end: () => {
        g.scene.remove(rock);
        g.fx.slamWave(target, 9, '#ff7a3d');
        g.fx.emit(target.clone().add(V(0, 1, 0)), { count: 90, color: '#ffb347', speed: 14, up: 8, size: 0.4, life: 1.0, gravity: 12 });
        g.fx.puff(target.clone().add(V(0, 0.5, 0)), { color: '#5a4a48', size: 2.2, life: 1.6, rise: 2.5, spread: 3, count: 14 });
        g.fx.flash(target, '#ff7a3d', 120, 0.4);
        g.shake(1.2, target);
        g.audio.crash?.(target);
        for (const x of this.#targets(target, 8)) x.takeHit({ damage: 180, dir: x.pos.clone().sub(target).setY(0).normalize(), knock: 18, poise: 300, heavy: true, power: true });
        if (g.hero.pos.distanceTo(target) < 8 && !this.invincible) g.hero.takeDamage(25, target, { knock: 8, heavy: true });
        g.panic(target, 25);
      },
    });
  }

  // ---------- Apparitions ----------
  spawnMonster(type) {
    const g = this.game;
    const p = this.#aim(12);
    if (type === 'colossus') {
      if (g.boss) return g.hud.toast('Un Colosse est déjà là !', '#ff6a6a');
      const b = g.spawnBoss({ x: p.x, z: p.z });
      b.introDur = 0.1;
      return;
    }
    const e = g.spawnEnemy({ type, x: p.x, z: p.z, group: 'crea', patrol: [[p.x, p.z]] });
    e.alertTo?.(g.hero.pos);
    g.fx.ring(p, { color: '#7a5cff', from: 0.3, to: 3, life: 0.4 });
    g.fx.ink(p.clone().add(V(0, 0.5, 0)), 1);
  }

  spawnCrowd(n = 8) {
    const g = this.game;
    const h = g.hero.pos;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = h.x + Math.sin(a) * 6;
      const z = h.z + Math.cos(a) * 6;
      const route = [[x, z], [x + Math.sin(a + 1.5) * 10, z + Math.cos(a + 1.5) * 10]];
      const npc = new Npc(g, { id: 'crowd' + Date.now() + i, seed: Math.floor(Math.random() * 1e6), x, z, route });
      g.story.npcs.push(npc);
    }
  }

  clearMonsters() {
    const g = this.game;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      g.scene.remove(e.model.root);
      e.alive = false;
      e.deadT = 99;
    }
    g.enemies = g.enemies.filter((e) => e.alive);
    g.boss = null;
  }

  clearAllies() {
    for (const a of this.game.allies) a.dispose();
    this.game.allies = [];
  }

  update(dt) {
    const g = this.game;
    this.cd = Math.max(0, this.cd - dt);
    if (this.infinite) {
      g.hero.energy = g.hero.stats.maxEnergy;
      if (g.hero.powers.umbra) g.hero.abyss = 100;
    }
    if (this.invincible) g.hero.hp = g.hero.stats.maxHp;
    for (const e of this.effects) {
      e.t += dt;
      e.tick?.(e, dt);
      if (e.t >= e.dur) {
        e.done = true;
        e.end?.();
      }
    }
    this.effects = this.effects.filter((e) => !e.done);
  }
}
