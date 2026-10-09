// Effets visuels poolés : particules additives, ondes de choc, télégraphes
// d'attaque au sol, flash lumineux d'impact.
import * as THREE from 'three';

const MAX_PARTICLES = 1200;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // --- Particules ---
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pAlpha = new Float32Array(MAX_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1));
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uScale: { value: 600 } },
        vertexShader: `
          attribute float size; attribute float alpha; attribute vec3 color;
          varying vec3 vCol; varying float vA; uniform float uScale;
          void main(){
            vCol = color; vA = alpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * uScale / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec3 vCol; varying float vA;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vCol * a * vA, a * vA);
          }`,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({ life: 0 }));
    this.pi = 0;

    // --- Anneaux / télégraphes ---
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 64);
    this.discGeo = new THREE.CircleGeometry(1, 48);

    // --- Lumière d'impact ---
    this.flashes = [0, 1].map(() => {
      const l = new THREE.PointLight('#ffffff', 0, 12, 2);
      scene.add(l);
      return { light: l, life: 0, max: 1, peak: 0 };
    });
    this.fi = 0;
  }

  emit(pos, { count = 12, color = '#ffd27a', speed = 6, up = 2, size = 0.25, life = 0.5, gravity = 9, spread = 1, dir = null, drag = 2 } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.pi];
      this.pi = (this.pi + 1) % MAX_PARTICLES;
      let vx = (Math.random() - 0.5) * 2;
      let vy = Math.random() * up;
      let vz = (Math.random() - 0.5) * 2;
      if (dir) {
        vx = dir.x + vx * spread;
        vz = dir.z + vz * spread;
        vy = (dir.y || 0) + vy;
      }
      const s = speed * (0.4 + Math.random() * 0.6);
      p.x = pos.x;
      p.y = pos.y;
      p.z = pos.z;
      p.vx = vx * s;
      p.vy = vy * s * 0.5;
      p.vz = vz * s;
      p.life = p.max = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.5 + Math.random());
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
      p.grav = gravity;
      p.drag = drag;
    }
  }

  // Anneau qui s'étend au sol (onde de choc) ou disque de télégraphe.
  ring(pos, { color = '#ffcd20', from = 0.5, to = 6, life = 0.5, y = 0.08, disc = false, opacity = 0.9, follow = null } = {}) {
    const m = new THREE.Mesh(
      disc ? this.discGeo : this.ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + y, pos.z);
    m.scale.setScalar(from);
    this.scene.add(m);
    const r = { m, from, to, life, t: 0, opacity, disc, follow };
    this.rings.push(r);
    return r;
  }

  // Télégraphe d'attaque de zone : disque rouge qui se remplit jusqu'à l'impact.
  telegraph(pos, radius, duration) {
    const outline = this.ring(pos, { color: '#ff2a2a', from: radius, to: radius, life: duration, opacity: 0.8, y: 0.06 });
    const fill = this.ring(pos, { color: '#ff3020', from: 0.2, to: radius, life: duration, disc: true, opacity: 0.35, y: 0.05 });
    return { outline, fill, cancel: () => { outline.t = outline.life; fill.t = fill.life; } };
  }

  flash(pos, color = '#ffffff', intensity = 30, life = 0.15) {
    const f = this.flashes[this.fi];
    this.fi = (this.fi + 1) % this.flashes.length;
    f.light.position.set(pos.x, pos.y + 0.8, pos.z);
    f.light.color.set(color);
    f.peak = intensity;
    f.life = f.max = life;
  }

  hitSpark(pos, color = '#ffd27a', heavy = false) {
    this.emit(pos, { count: heavy ? 26 : 14, color, speed: heavy ? 9 : 6, size: heavy ? 0.3 : 0.2, life: 0.35 });
    this.emit(pos, { count: heavy ? 10 : 5, color: '#ffffff', speed: 3, size: 0.5, life: 0.12, gravity: 0 });
    this.flash(pos, color, heavy ? 40 : 18, 0.12);
  }

  ichor(pos, color = '#7dff6a') {
    this.emit(pos, { count: 10, color, speed: 4, up: 3, size: 0.18, life: 0.6, gravity: 14 });
  }

  voidBurst(pos, dir) {
    this.ring(pos, { color: '#b070ff', from: 0.5, to: 8, life: 0.55 });
    this.ring(pos, { color: '#ffffff', from: 0.3, to: 4.5, life: 0.3, opacity: 0.6 });
    this.emit({ x: pos.x, y: pos.y + 1.2, z: pos.z }, { count: 70, color: '#b070ff', speed: 16, size: 0.35, life: 0.6, dir, spread: 0.7, gravity: 0, drag: 4 });
    this.emit({ x: pos.x, y: pos.y + 1, z: pos.z }, { count: 30, color: '#e8d4ff', speed: 8, size: 0.25, life: 0.5, gravity: 0 });
    this.flash(pos, '#a060ff', 80, 0.35);
  }

  slamWave(pos, radius, color = '#ff5a2a') {
    this.ring(pos, { color, from: 0.5, to: radius, life: 0.45 });
    this.emit(pos, { count: 40, color: '#9a8c7a', speed: 7, up: 3, size: 0.35, life: 0.9, gravity: 12 });
    this.flash(pos, color, 40, 0.25);
  }

  deathBurst(pos, color) {
    this.emit({ x: pos.x, y: pos.y + 1, z: pos.z }, { count: 60, color, speed: 7, up: 4, size: 0.3, life: 1.1, gravity: 4 });
    this.emit({ x: pos.x, y: pos.y + 1, z: pos.z }, { count: 30, color: '#1a0a20', speed: 3, up: 3, size: 0.6, life: 1.4, gravity: -1 });
    this.ring(pos, { color, from: 0.3, to: 3.5, life: 0.6 });
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        if (this.pAlpha[i] !== 0) {
          this.pAlpha[i] = 0;
          any = true;
        }
        continue;
      }
      any = true;
      p.life -= dt;
      const dg = Math.exp(-p.drag * dt);
      p.vx *= dg;
      p.vz *= dg;
      p.vy = p.vy * dg - p.grav * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.05, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const j = i * 3;
      this.pPos[j] = p.x;
      this.pPos[j + 1] = p.y;
      this.pPos[j + 2] = p.z;
      this.pCol[j] = p.r;
      this.pCol[j + 1] = p.g;
      this.pCol[j + 2] = p.b;
      this.pSize[i] = p.size;
      this.pAlpha[i] = Math.max(0, p.life / p.max);
    }
    if (any) {
      const a = this.points.geometry.attributes;
      a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      const s = r.from + (r.to - r.from) * (r.disc ? k : 1 - (1 - k) ** 3);
      r.m.scale.setScalar(Math.max(0.01, s));
      if (r.follow) r.m.position.set(r.follow.x, r.m.position.y, r.follow.z);
      r.m.material.opacity = r.disc ? r.opacity * (0.4 + 0.6 * k) : r.opacity * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }

    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        f.light.intensity = f.peak * Math.max(0, f.life / f.max);
      } else f.light.intensity = 0;
    }
  }
}
