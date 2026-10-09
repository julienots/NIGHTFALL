// Personnages non joueurs : passants (marchent, puis fuient pendant le
// Nightfall) et personnages parlants (Inès). Même modèle que Noa, autres palettes.
import * as THREE from 'three';
import { HeroModel, PALETTES } from './heroModel.js';
import { mulberry32 } from '../core/rng.js';

const SKINS = ['#f2c6a0', '#e8b48a', '#c98b5e', '#a8714a', '#7a4f32', '#5a3a26'];
const HAIRS = ['#2b1d16', '#1a1210', '#6a3a1a', '#c98a3a', '#e8d6a0', '#8a2a2a', '#3a3a5a'];
const TOPS = ['#e86f6f', '#5fb7c9', '#f2b84b', '#8f7ad8', '#6fcf97', '#e98ccf', '#4f74c9', '#3a3a4a', '#d0d0d0'];
const PANTS = ['#2b2b4a', '#3a5ba8', '#4a3a2a', '#1d1d24', '#6a6a7a'];

export function randomPalette(seed) {
  const r = mulberry32(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const top = pick(TOPS);
  const c = new THREE.Color(top).multiplyScalar(0.8);
  return {
    skin: pick(SKINS), hair: pick(HAIRS), hoodie: top, hoodie2: '#' + c.getHexString(), pants: pick(PANTS),
    shoe: pick(['#f2efe6', '#1d1d24', '#c9563f']), sole: '#e8e4ff', bag: r() < 0.3 ? pick(TOPS) : null,
    hairStyle: r() < 0.45 ? 'ponytail' : 'messy',
  };
}

export class Npc {
  constructor(game, def) {
    this.game = game;
    this.id = def.id;
    this.name = def.name || null;
    this.talk = def.talk || null;
    const palette = def.palette ? PALETTES[def.palette] : randomPalette(def.seed ?? Math.floor(Math.random() * 1e6));
    this.model = new HeroModel(palette, { backpack: !!palette.bag, rim: '#ffd9a8' });
    this.pos = new THREE.Vector3(def.x, 0.15, def.z);
    this.yaw = def.yaw ?? 0;
    this.route = (def.route || []).map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.ri = 0;
    this.wait = Math.random() * 2;
    this.mode = this.route.length ? 'walk' : 'idle';
    this.speed = def.speed ?? 1.4 + Math.random() * 0.4;
    this.phase = Math.random() * 6;
    this.anim = null;
    this.animT = 0;
    this.goneT = 0;
    this.radius = 0.35;
    game.scene.add(this.model.root);
  }

  play(anim, dur) {
    this.anim = anim;
    this.animT = 0;
    this.animDur = dur;
  }

  faceTo(p) {
    this.targetYaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  // Panique : court loin du point donné puis disparaît.
  flee(from) {
    if (this.mode === 'flee' || this.mode === 'gone') return;
    this.mode = 'flee';
    const away = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
    this.fleeTo = this.pos.clone().addScaledVector(away, 60);
    this.speed = 6.5 + Math.random() * 1.5;
    this.play('scared', 0.6);
  }

  walkTo(x, z, speed = 1.6, then = 'idle') {
    this.route = [new THREE.Vector3(x, 0, z)];
    this.ri = 0;
    this.mode = 'walk';
    this.once = then;
    this.speed = speed;
  }

  update(dt) {
    if (this.mode === 'gone') return;
    // Les passants éloignés ne sont ni animés ni dessinés (économie d'appels de dessin).
    const far = this.pos.distanceTo(this.game.hero.pos) > 70;
    this.model.root.visible = !far;
    if (far && this.mode !== 'flee') return;
    const col = this.game.col;
    let target = null;
    if (this.mode === 'walk') {
      if (this.wait > 0) this.wait -= dt;
      else target = this.route[this.ri];
    } else if (this.mode === 'flee') target = this.fleeTo;

    let moving = 0;
    if (target) {
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) {
        if (this.mode === 'walk') {
          if (this.once) {
            this.mode = this.once;
            this.once = null;
          } else {
            this.ri = (this.ri + 1) % this.route.length;
            this.wait = 1 + Math.random() * 3;
          }
        }
      } else {
        this.targetYaw = Math.atan2(dx, dz);
        const before = this.pos.clone();
        const sp = Math.min(this.speed, d / dt);
        const r = col.moveCylinder(this.pos, this.radius, 1.7, Math.sin(this.yaw) * sp * dt, Math.cos(this.yaw) * sp * dt);
        // Contourne grossièrement un obstacle en tournant.
        if (r.hitWall) this.yaw += dt * 2.5;
        moving = this.pos.distanceTo(before) / dt;
      }
    }
    if (this.targetYaw != null) {
      let d = this.targetYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-6 * dt));
    }
    this.pos.y = col.groundHeight(this.pos.x, this.pos.z, this.radius, this.pos.y);
    this.phase += dt * 8 * Math.min(1.6, moving / 3);
    if (this.anim) {
      this.animT += dt;
      if (this.animT >= this.animDur) this.anim = null;
    }
    // Fuite : disparaît une fois hors de vue.
    if (this.mode === 'flee') {
      this.goneT += dt;
      if (this.goneT > 9) {
        this.mode = 'gone';
        this.model.root.visible = false;
      }
    }
    this.model.animate({
      dt, speed: moving / 3.4, phase: this.phase, airborne: false, vy: 0,
      anim: this.anim, animP: this.anim ? Math.min(1, this.animT / this.animDur) : 0,
    });
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }

  dispose() {
    this.game.scene.remove(this.model.root);
  }
}
