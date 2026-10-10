// Anneaux magnétiques de Noa : 10 anneaux (5 par avant-bras) placés dans le
// monde. Chaque image, on calcule une cible (position, orientation, échelle)
// selon le mode, puis chaque anneau s'en rapproche avec un lissage : les
// transitions entre modes sont donc toujours fluides.
import * as THREE from 'three';
import { toon } from '../fx/toon.js';
import { bakeRigid } from '../core/bake.js';

const N = 10;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _z = new THREE.Vector3(0, 0, 1);

export class RingSystem {
  constructor(scene, hero) {
    this.hero = hero;
    this.scene = scene;
    this.mode = 'hidden';
    this.modeT = 0;
    this.color = new THREE.Color('#5fe3ff');
    this.metal = toon('#dfe6f5', { rim: '#ffffff', rimStrength: 0.9, shared: false });
    this.glow = toon('#5fe3ff', { emissive: '#5fe3ff', emissiveIntensity: 1.6, shared: false });
    const ringGeo = new THREE.TorusGeometry(0.085, 0.017, 8, 28);
    const bandGeo = new THREE.TorusGeometry(0.085, 0.006, 6, 28);
    this.rings = [];
    for (let i = 0; i < N; i++) {
      const g = new THREE.Group();
      const outer = new THREE.Mesh(ringGeo, this.metal);
      const band = new THREE.Mesh(bandGeo, this.glow);
      band.scale.setScalar(1.12);
      // Encoches gravées (rythme visuel quand l'anneau tourne)
      for (let k = 0; k < 4; k++) {
        const notch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.036, 0.04), this.glow);
        const a = (k / 4) * Math.PI * 2;
        notch.position.set(Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0);
        notch.rotation.z = a;
        g.add(notch);
      }
      g.add(outer, band);
      g.visible = false;
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      bakeRigid(g);
      scene.add(g);
      this.rings.push({ g, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1, spin: Math.random() * 6, side: i < 5 ? 'R' : 'L', k: i % 5 });
    }
    // Arcs électriques entre anneaux (lignes brisées régénérées)
    this.arcGeo = new THREE.BufferGeometry();
    this.arcPos = new Float32Array(6 * 6 * 6);
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arcs = new THREE.LineSegments(this.arcGeo, new THREE.LineBasicMaterial({ color: '#bff6ff', transparent: true, opacity: 0.9 }));
    this.arcs.frustumCulled = false;
    scene.add(this.arcs);
    this.targets = [];
    this.placed = false;
    this.lastHero = new THREE.Vector3();
    this.lastYaw = 0;
  }

  setColor(hex) {
    this.color.set(hex);
    this.glow.color.set(hex);
    this.glow.emissive.set(hex);
    this.arcs.material.color.set(hex).lerp(new THREE.Color('#ffffff'), 0.6);
  }

  // Modes : hidden | idle | punch | whip | volley | shield | flight | awaken
  set(mode, opts = {}) {
    if (mode !== this.mode) this.modeT = 0;
    this.mode = mode;
    this.opts = opts;
    if (mode !== 'hidden' && !this.placed) {
      // Première apparition : partent de la position du héros.
      for (const r of this.rings) r.pos.copy(this.hero.pos).add(_v.set(0, 1, 0));
      this.placed = true;
    }
  }

  // Lance la rafale vers des cibles (positions) ; les anneaux reviennent ensuite.
  launch(targets, dur = 0.9) {
    this.targets = targets;
    this.launchDur = dur;
    this.set('volley');
  }

  #forearm(side) {
    const el = this.hero.model.joints['el' + side];
    el.updateWorldMatrix(true, false);
    const origin = new THREE.Vector3().setFromMatrixPosition(el.matrixWorld);
    const axis = new THREE.Vector3(0, -1, 0).transformDirection(el.matrixWorld);
    return { origin, axis, matrix: el.matrixWorld };
  }

  update(dt, t, energy01 = 1) {
    this.modeT += dt;
    const hidden = this.mode === 'hidden';
    for (const r of this.rings) r.g.visible = !hidden;
    this.arcs.visible = !hidden;
    if (hidden) return;
    const hero = this.hero;
    // Les anneaux suivent le corps : on reporte d'abord le déplacement et la
    // rotation du héros depuis l'image précédente (sinon ils traînent derrière
    // les bras quand on court ou qu'on tourne).
    const dYaw = hero.yaw - this.lastYaw;
    for (const r of this.rings) {
      if (this.mode === 'volley' || this.mode === 'awaken') continue;
      r.pos.sub(this.lastHero).applyAxisAngle(_up, dYaw).add(hero.pos);
      _q.setFromAxisAngle(_up, dYaw);
      r.quat.premultiply(_q);
    }
    this.lastHero.copy(hero.pos);
    this.lastYaw = hero.yaw;
    const arms = { R: this.#forearm('R'), L: this.#forearm('L') };
    const fwd = new THREE.Vector3(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let rate = 16;

    this.rings.forEach((r, i) => {
      const arm = arms[r.side];
      let pos = new THREE.Vector3();
      let normal = arm.axis.clone(); // axe de l'anneau (perpendiculaire à son plan)
      let scale = 1;
      r.spin += dt * (this.mode === 'flight' ? 14 : 3 + r.k);

      switch (this.mode) {
        case 'idle':
        default: {
          // Empilés le long de l'avant-bras, légère oscillation.
          const d = 0.06 + r.k * 0.045;
          pos.copy(arm.origin).addScaledVector(arm.axis, d);
          pos.y += Math.sin(t * 3 + i) * 0.006;
          scale = 0.92 + r.k * 0.04;
          break;
        }
        case 'punch': {
          // Glissent jusqu'au poing et s'élargissent à l'impact.
          const side = this.opts.side || 'R';
          if (r.side === side) {
            const p = Math.min(1, this.modeT / 0.12);
            const d = 0.25 + r.k * 0.05 * p + p * 0.05;
            pos.copy(arm.origin).addScaledVector(arm.axis, d);
            scale = 1 + p * (0.3 + r.k * 0.18);
            rate = 30;
          } else {
            pos.copy(arm.origin).addScaledVector(arm.axis, 0.06 + r.k * 0.045);
          }
          break;
        }
        case 'ringShot': {
          // L'anneau 0 du bras droit part en avant puis revient (3e coup du combo).
          if (r.side === 'R') {
            const p = this.modeT / 0.5;
            const out = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
            pos.copy(arm.origin).addScaledVector(arm.axis, 0.28).addScaledVector(fwd, Math.max(0, out) * (1.2 + r.k * 0.8));
            normal.copy(fwd);
            scale = 1.4 + r.k * 0.25;
            rate = 40;
          } else pos.copy(arm.origin).addScaledVector(arm.axis, 0.06 + r.k * 0.045);
          break;
        }
        case 'whip': {
          // Chaîne d'anneaux qui prolonge le bras droit en arc.
          const p = Math.min(1, this.modeT / 0.45);
          const ang = hero.yaw + (1.6 - p * 3.4);
          const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
          const idx = r.side === 'R' ? r.k : r.k + 5;
          const reach = 0.5 + idx * 0.48;
          pos.copy(hero.pos).add(_v.set(0, 1.25 - idx * 0.03, 0)).addScaledVector(dir, reach);
          normal.copy(dir).cross(_up).normalize();
          scale = 1.5 + idx * 0.05;
          rate = 34;
          break;
        }
        case 'volley': {
          const tg = this.targets[i % Math.max(1, this.targets.length)];
          const p = this.modeT / this.launchDur;
          const start = arm.origin.clone().addScaledVector(arm.axis, 0.15);
          if (!tg || p >= 1) {
            pos.copy(arm.origin).addScaledVector(arm.axis, 0.06 + r.k * 0.045);
            if (p >= 1.3) this.set('idle');
          } else {
            // Aller courbe puis retour : arc latéral propre à chaque anneau.
            const out = p < 0.45 ? p / 0.45 : 1 - (p - 0.45) / 0.55;
            const e = 1 - (1 - Math.max(0, out)) ** 2;
            const off = ((i % 5) - 2) * 0.6 * Math.sin(e * Math.PI);
            pos.copy(start).lerp(_v.set(tg.x, tg.y, tg.z), e).addScaledVector(right, off * (r.side === 'R' ? 1 : -1));
            pos.y += Math.sin(e * Math.PI) * (0.6 + (i % 3) * 0.3);
            normal.copy(_v.set(tg.x, tg.y, tg.z).sub(start)).normalize();
            scale = 1.5;
            r.spin += dt * 30;
            rate = 60;
          }
          break;
        }
        case 'shield': {
          // Disques concentriques tournoyants devant le héros.
          const ringI = r.side === 'R' ? r.k : r.k;
          const layer = r.side === 'R' ? 0 : 1;
          const center = hero.pos.clone().add(_v.set(0, 1.15, 0)).addScaledVector(fwd, 0.75 + layer * 0.06);
          const a = t * (layer ? -3 : 3) + (ringI / 5) * Math.PI * 2;
          const rad = 0.18 + ringI * 0.02 + layer * 0.3;
          pos.copy(center).addScaledVector(right, Math.cos(a) * rad).add(_v.set(0, Math.sin(a) * rad, 0));
          normal.copy(fwd);
          scale = 1.6 + layer * 0.6;
          rate = 26;
          break;
        }
        case 'flight': {
          // Orbitent largement autour des poignets et propulsent.
          const a = r.spin * 0.6 + (r.k / 5) * Math.PI * 2;
          const base = arm.origin.clone().addScaledVector(arm.axis, 0.22);
          const perp1 = new THREE.Vector3().crossVectors(arm.axis, _up).normalize();
          if (perp1.lengthSq() < 0.01) perp1.copy(right);
          const perp2 = new THREE.Vector3().crossVectors(arm.axis, perp1).normalize();
          const rad = 0.14 + Math.sin(t * 6 + i) * 0.02;
          pos.copy(base).addScaledVector(perp1, Math.cos(a) * rad).addScaledVector(perp2, Math.sin(a) * rad).addScaledVector(arm.axis, r.k * 0.03);
          scale = 0.9;
          rate = 24;
          break;
        }
        case 'awaken': {
          // Cinématique : spirale qui se resserre autour de Noa.
          const p = Math.min(1, this.modeT / (this.opts.dur || 4));
          const a = t * (3 + p * 6) + (i / N) * Math.PI * 2;
          const rad = 2.2 * (1 - p) + 0.35;
          const h = 0.4 + (i / N) * 1.6 * (1 - p) + p * 1.1;
          pos.copy(hero.pos).add(_v.set(Math.cos(a) * rad, h, Math.sin(a) * rad));
          if (p > 0.85) pos.copy(arm.origin).addScaledVector(arm.axis, 0.06 + r.k * 0.045);
          normal.set(Math.cos(a), 0.3, Math.sin(a)).normalize();
          scale = 1 + (1 - p) * 1.5;
          rate = p > 0.85 ? 18 : 10;
          break;
        }
      }

      // Lissage position/orientation/échelle. Une fois posés sur l'avant-bras,
      // les anneaux y sont verrouillés (aucun retard pendant la course).
      const attached = (this.mode === 'idle' || (this.mode === 'punch' && r.side !== (this.opts.side || 'R'))) && this.modeT > 0.3;
      const k = attached ? 1 : 1 - Math.exp(-rate * dt);
      r.pos.lerp(pos, k);
      _q.setFromUnitVectors(_z, normal.normalize());
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(_z, r.spin));
      r.quat.slerp(_q, attached ? 1 : Math.min(1, k * 1.4));
      r.scale += (scale - r.scale) * k;
      r.g.position.copy(r.pos);
      r.g.quaternion.copy(r.quat);
      r.g.scale.setScalar(r.scale);
    });

    // Lueur selon l'énergie et l'action
    const active = this.mode !== 'idle';
    this.glow.emissiveIntensity = 1.0 + energy01 * 0.8 + (active ? 1.2 : 0) + Math.sin(t * 5) * 0.15;

    // Arcs électriques : quelques segments brisés entre anneaux voisins
    let j = 0;
    const show = active || Math.sin(t * 1.7) > 0.6;
    for (let s = 0; s < 6; s++) {
      const a = this.rings[(s * 3 + Math.floor(t * 12)) % N].pos;
      const b = this.rings[(s * 3 + 1 + Math.floor(t * 12)) % N].pos;
      let prev = a;
      for (let seg = 1; seg <= 6; seg++) {
        const f = seg / 6;
        const p = seg === 6 ? b : new THREE.Vector3().lerpVectors(a, b, f).add(_v.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08));
        const ok = show && a.distanceTo(b) < 1.4;
        this.arcPos.set(ok ? [prev.x, prev.y, prev.z, p.x, p.y, p.z] : [0, -99, 0, 0, -99, 0], j);
        j += 6;
        prev = p;
      }
    }
    this.arcGeo.attributes.position.needsUpdate = true;
    this.arcs.material.opacity = 0.5 + Math.random() * 0.5;
  }

  // Positions des anneaux (pour les traînées de particules)
  positions() {
    return this.rings.map((r) => r.pos);
  }
}
