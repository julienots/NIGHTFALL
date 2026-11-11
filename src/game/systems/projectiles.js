// Projectiles ennemis (orbes abyssaux du Veilleur). Ils peuvent être esquivés
// (ils continuent leur route), bloqués par le bouclier (détruits) ou parés :
// une parade les RENVOIE vers les créatures, qui encaissent alors les dégâts.
import * as THREE from 'three';

const GEO = new THREE.SphereGeometry(0.22, 12, 8);

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.mats = new Map();
  }

  #mat(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    return this.mats.get(color);
  }

  // owner : créature qui tire ; target : héros.
  fire(owner, from, dir, { speed = 15, damage = 14, color = '#ff4dd2', homing = 1.2, life = 3.2 } = {}) {
    const mesh = new THREE.Mesh(GEO, this.#mat(color));
    const halo = new THREE.Mesh(GEO, this.#mat('#ffffff'));
    halo.scale.setScalar(0.5);
    mesh.add(halo);
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    const p = { mesh, owner, vel: dir.clone().normalize().multiplyScalar(speed), speed, damage, color, homing, life, friendly: false, t: 0, prev: from.clone() };
    this.list.push(p);
    return p;
  }

  #explode(p, big = false, why = 'impact') {
    this.lastEnd = why;
    const fx = this.game.fx;
    fx.emit(p.mesh.position, { count: big ? 22 : 12, color: p.friendly ? '#7fe3ff' : p.color, speed: 5, size: 0.3, life: 0.4, gravity: 2 });
    fx.ring(p.mesh.position, { color: p.friendly ? '#7fe3ff' : p.color, from: 0.2, to: big ? 2.6 : 1.4, life: 0.3, y: p.mesh.position.y });
    this.game.scene.remove(p.mesh);
    p.dead = true;
  }

  update(dt) {
    const g = this.game;
    const hero = g.hero;
    const tmp = new THREE.Vector3();
    for (const p of this.list) {
      p.t += dt;
      p.life -= dt;
      p.prev.copy(p.mesh.position);
      // Guidage léger (vers le héros, ou vers le tireur après une parade)
      const tgt = p.friendly ? (p.owner?.alive ? p.owner.pos : null) : hero.pos;
      if (tgt && p.homing > 0) {
        tmp.set(tgt.x, tgt.y + (p.friendly ? (p.owner.def?.height || 2) * 0.6 : 1.2), tgt.z).sub(p.mesh.position).normalize().multiplyScalar(p.speed);
        p.vel.lerp(tmp, Math.min(1, dt * p.homing * (p.friendly ? 3 : 1)));
        p.vel.setLength(p.speed);
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(1 + Math.sin(p.t * 30) * 0.12);
      if (Math.random() < 0.6) g.fx.emit(p.mesh.position, { count: 1, color: p.friendly ? '#7fe3ff' : p.color, speed: 0.5, size: 0.25, life: 0.3, gravity: 0 });
      // Mur / sol
      if (p.mesh.position.y < 0.1 || !g.col.lineOfSight(p.prev, p.mesh.position) || p.life <= 0) {
        this.#explode(p, false, p.life <= 0 ? 'timeout' : 'wall');
        continue;
      }
      if (p.friendly) {
        // Orbe renvoyé : touche la première créature sur sa route.
        for (const e of g.enemies) {
          if (!e.alive) continue;
          const h = e.def?.height || 2;
          if (Math.hypot(e.pos.x - p.mesh.position.x, e.pos.z - p.mesh.position.z) < e.radius + 0.4 && p.mesh.position.y > e.pos.y && p.mesh.position.y < e.pos.y + h + 0.3) {
            e.takeHit({ damage: Math.round(p.damage * 2.5), dir: p.vel.clone().setY(0).normalize(), knock: 8, poise: 80, heavy: true, power: true, kind: 'parry' });
            g.hud.toast('RENVOI !', '#7fe3ff');
            this.#explode(p, true);
            break;
          }
        }
        continue;
      }
      // Contact avec le héros
      const dx = hero.pos.x - p.mesh.position.x;
      const dz = hero.pos.z - p.mesh.position.z;
      const dy = p.mesh.position.y - (hero.pos.y + 1.0);
      if (!hero.dead && Math.hypot(dx, dz) < 0.65 && Math.abs(dy) < 1.0) {
        const r = hero.takeDamage(p.damage, p.mesh.position.clone(), { knock: 5, source: p.owner });
        if (r === 'parried') {
          p.friendly = true;
          p.vel.negate().multiplyScalar(1.6);
          p.speed *= 1.6;
          p.life = 3;
          p.mesh.material = this.#mat('#7fe3ff');
        } else if (r === 'dodged' || r === false) {
          // passe à travers
        } else this.#explode(p, r === true, 'hero:' + r);
      }
    }
    this.list = this.list.filter((p) => !p.dead);
  }

  clear() {
    for (const p of this.list) this.game.scene.remove(p.mesh);
    this.list = [];
  }
}
