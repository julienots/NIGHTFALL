// Effets visuels poolés : particules additives, ondes de choc, télégraphes
// d'attaque au sol, flash lumineux d'impact.
import * as THREE from 'three';

const MAX_PARTICLES = 1200;
const MAX_PUFFS = 300;
const WORDS = ['POW!', 'BAM!', 'CRAC!', 'BOUM!', 'WHAM!'];

// Éclat lumineux d'impact : cœur doux + quatre traînées (façon objectif).
function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[128, 3], [3, 128], [70, 2], [2, 70]]) {
    const lg = x.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = lg;
    x.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wordTexture(word, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.font = '76px "Lilita One", "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineWidth = 14;
  x.strokeStyle = '#1d0f3a';
  x.translate(128, 64);
  x.rotate(-0.12);
  x.strokeText(word, 0, 0);
  x.fillStyle = color;
  x.fillText(word, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.realistic = true;
    this.groundAt = null; // (x, z) => hauteur du sol (monde ouvert)
    this.onBlast = null; // souffle sur l'herbe (pos, rayon, force)
    this.arcs = [];
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

    // --- Poussière / fumée : volutes douces et translucides ---
    const pg = new THREE.BufferGeometry();
    this.uPos = new Float32Array(MAX_PUFFS * 3);
    this.uCol = new Float32Array(MAX_PUFFS * 3);
    this.uSize = new Float32Array(MAX_PUFFS);
    this.uAlpha = new Float32Array(MAX_PUFFS);
    pg.setAttribute('position', new THREE.BufferAttribute(this.uPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.uCol, 3));
    pg.setAttribute('size', new THREE.BufferAttribute(this.uSize, 1));
    pg.setAttribute('alpha', new THREE.BufferAttribute(this.uAlpha, 1));
    this.puffPoints = new THREE.Points(
      pg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uScale: { value: 600 } },
        vertexShader: this.points.material.vertexShader,
        fragmentShader: `
          varying vec3 vCol; varying float vA;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
          void main(){
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p);
            // Bord irrégulier (volute) + densité décroissante
            float wob = n(p * 6.0 + vCol.rg * 40.0) * 0.18;
            float a = smoothstep(0.5, 0.08, d + wob) * vA * 0.4;
            if (a < 0.003) discard;
            float shade = 0.82 + 0.18 * (0.5 - p.y);
            gl_FragColor = vec4(vCol * shade, a);
          }`,
      }),
    );
    this.puffPoints.frustumCulled = false;
    scene.add(this.puffPoints);
    this.puffs = Array.from({ length: MAX_PUFFS }, () => ({ life: 0 }));
    this.ui = 0;

    // --- Étoiles d'impact et onomatopées (sprites) ---
    this.starTex = starTexture();
    this.wordTex = {};
    this.sprites = [];

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

  puff(pos, { color = '#8f8574', size = 0.8, life = 0.8, rise = 0.6, spread = 0.6, count = 1, vel = null } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this.puffs[this.ui];
      this.ui = (this.ui + 1) % MAX_PUFFS;
      p.x = pos.x + (Math.random() - 0.5) * spread;
      p.y = pos.y + Math.random() * 0.2;
      p.z = pos.z + (Math.random() - 0.5) * spread;
      p.vx = vel ? vel.x : (Math.random() - 0.5) * 0.6;
      p.vy = rise;
      p.vz = vel ? vel.z : (Math.random() - 0.5) * 0.6;
      p.life = p.max = life * (0.7 + Math.random() * 0.5);
      p.size = size * (0.7 + Math.random() * 0.6);
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
    }
  }

  // Couronne de poussière au sol (atterrissage, onde de choc)
  dustRing(pos, radius = 1.5, count = 12, color = '#8f8574') {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.puff({ x: pos.x + Math.cos(a) * radius * 0.3, y: pos.y + 0.1, z: pos.z + Math.sin(a) * radius * 0.3 }, {
        color, size: 1.1 + radius * 0.25, life: 0.9, rise: 0.5, spread: 0.1, vel: { x: Math.cos(a) * radius * 2.2, z: Math.sin(a) * radius * 2.2 },
      });
    }
  }

  #sprite(map, pos, { size = 1.2, life = 0.25, color = '#ffffff', grow = 1.6, rise = 0 }) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, depthTest: false, blending: this.realistic && map === this.starTex ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.position.set(pos.x, pos.y, pos.z);
    s.scale.setScalar(size * 0.3);
    s.material.rotation = Math.random() * Math.PI;
    s.renderOrder = 10;
    this.scene.add(s);
    this.sprites.push({ s, t: 0, life, size, grow, rise });
  }

  starBurst(pos, color = '#fff27a', size = 1.3) {
    this.#sprite(this.starTex, pos, { color, size, life: 0.18 });
  }

  comic(pos, color = '#ffd23f') {
    if (this.realistic) return; // onomatopées cartoon : réservées à l'ancien style
    const w = WORDS[Math.floor(Math.random() * WORDS.length)];
    const key = w + color;
    if (!this.wordTex[key]) this.wordTex[key] = wordTexture(w, color);
    this.#sprite(this.wordTex[key], { x: pos.x, y: pos.y + 0.6, z: pos.z }, { size: 2.6, life: 0.7, grow: 1.15, rise: 1.2 });
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
    this.emit(pos, { count: heavy ? 34 : 14, color, speed: heavy ? 14 : 8, size: heavy ? 0.18 : 0.13, life: 0.35, gravity: 14, drag: 3 });
    this.emit(pos, { count: heavy ? 10 : 4, color: '#ffffff', speed: heavy ? 18 : 10, size: 0.1, life: 0.18, gravity: 0 });
    this.starBurst(pos, heavy ? '#fff2c0' : '#ffffff', heavy ? 2.6 : 1.4);
    if (heavy) this.comic(pos);
    this.flash(pos, color, heavy ? 30 : 14, 0.12);
  }

  ichor(pos, color = '#7dff6a') {
    this.puff(pos, { color, size: 0.35, life: 0.45, rise: 2.5, spread: 0.4, count: 5 });
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
    this.dustRing(pos, radius * 0.5, 16);
    this.flash(pos, color, 30, 0.25);
  }

  deathBurst(pos, color) {
    this.emit({ x: pos.x, y: pos.y + 1, z: pos.z }, { count: 30, color, speed: 7, up: 4, size: 0.3, life: 0.9, gravity: 4 });
    this.puff({ x: pos.x, y: pos.y + 0.6, z: pos.z }, { color: '#1a1422', size: 1.8, life: 1.6, rise: 1.2, spread: 1.4, count: 14 });
    this.starBurst({ x: pos.x, y: pos.y + 1.2, z: pos.z }, color, 2.4);
    this.ring(pos, { color, from: 0.3, to: 3.5, life: 0.6 });
  }

  // ---------- Effets de pouvoirs ----------
  // Onde de choc : anneau lumineux au sol, éclair, débris de terre et de
  // roche projetés, nuage de poussière, herbe soufflée, lumière.
  shockwave(pos, { radius = 6, color = '#7fe3ff', power = 1, debris = true } = {}) {
    const y = this.groundAt ? this.groundAt(pos.x, pos.z) : pos.y;
    const g = { x: pos.x, y, z: pos.z };
    this.ring(g, { color, from: 0.3, to: radius, life: 0.45 + power * 0.15, opacity: 1 });
    this.ring(g, { color: '#ffffff', from: 0.2, to: radius * 0.65, life: 0.25, opacity: 0.8 });
    this.ring(g, { color, from: 0.5, to: radius * 1.35, life: 0.8, opacity: 0.35 });
    this.ring(g, { color, from: radius * 0.2, to: radius * 0.9, life: 0.3, disc: true, opacity: 0.25 });
    this.starBurst({ x: g.x, y: g.y + 0.8, z: g.z }, '#ffffff', 3 + power * 2);
    this.emit({ x: g.x, y: g.y + 0.3, z: g.z }, { count: Math.round(40 * power), color, speed: 10 + radius * 1.6, up: 1.2, size: 0.16, life: 0.55, gravity: 4, drag: 2.5 });
    if (debris) {
      this.emit({ x: g.x, y: g.y + 0.2, z: g.z }, { count: Math.round(26 * power), color: '#4a3c2c', speed: 6 + radius, up: 5, size: 0.2, life: 1.2, gravity: 22, drag: 0.6 });
      this.emit({ x: g.x, y: g.y + 0.2, z: g.z }, { count: Math.round(14 * power), color: '#7a7268', speed: 4 + radius * 0.8, up: 6, size: 0.26, life: 1.4, gravity: 22, drag: 0.4 });
    }
    // Couronne de poussière basse qui file vers l'extérieur.
    const n = Math.round(8 + radius * 1.2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const r = radius * (0.3 + Math.random() * 0.2);
      this.puff({ x: g.x + Math.cos(a) * r, y: g.y + 0.15, z: g.z + Math.sin(a) * r }, {
        color: '#8f8574', size: 0.9 + radius * 0.1, life: 0.9 + Math.random() * 0.5, rise: 0.25, spread: 0.3, vel: { x: Math.cos(a) * radius * 1.6, z: Math.sin(a) * radius * 1.6 },
      });
    }
    this.flash({ x: g.x, y: g.y + 1, z: g.z }, color, 60 * power, 0.35);
    this.onBlast?.(g, radius * 1.3, power);
  }

  // Éclair : ligne brisée lumineuse entre deux points (quelques images).
  lightning(from, to, { color = '#9fe8ff', life = 0.16, jag = 0.6, branches = 2, width = 1 } = {}) {
    const make = (a, b, jg, w) => {
      const pts = [];
      const N = 10;
      const dir = new THREE.Vector3().subVectors(b, a);
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = new THREE.Vector3().copy(a).addScaledVector(dir, t);
        if (i > 0 && i < N) {
          const k = Math.sin(t * Math.PI) * jg;
          p.addScaledVector(side, (Math.random() - 0.5) * k * 2);
          p.y += (Math.random() - 0.5) * k * 1.6;
        }
        pts.push(p);
      }
      // Arc épais : gaine colorée large (halo) + cœur blanc fin, en tubes.
      const path = new THREE.CurvePath();
      for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      for (const [col, op, rad] of [[color, 0.55, 0.09 * w], ['#ffffff', 1, 0.03 * w]]) {
        const geo = new THREE.TubeGeometry(path, (pts.length - 1) * 2, rad, 5, false);
        const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        line.frustumCulled = false;
        this.scene.add(line);
        this.arcs.push({ line, t: 0, life, op });
      }
      return pts;
    };
    const A = new THREE.Vector3(from.x, from.y, from.z);
    const B = new THREE.Vector3(to.x, to.y, to.z);
    const pts = make(A, B, jag * Math.max(1, A.distanceTo(B) * 0.12), width);
    for (let b = 0; b < branches; b++) {
      const s = pts[2 + Math.floor(Math.random() * (pts.length - 4))];
      const e = s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3));
      make(s, e, jag * 0.6, width * 0.6);
    }
    this.flash(B, color, 25, life);
  }

  // Explosion d'énergie (impact des anneaux, griffes de l'Abysse…).
  energyBurst(pos, color = '#7fe3ff', size = 1) {
    this.emit(pos, { count: Math.round(26 * size), color, speed: 11 * size, up: 2, size: 0.15, life: 0.45, gravity: 2, drag: 3 });
    this.emit(pos, { count: Math.round(10 * size), color: '#ffffff', speed: 6 * size, size: 0.1, life: 0.25, gravity: 0 });
    this.starBurst(pos, '#ffffff', 2.2 * size);
    const gy = this.groundAt ? this.groundAt(pos.x, pos.z) : pos.y - 1;
    this.ring({ x: pos.x, y: gy, z: pos.z }, { color, from: 0.2, to: 2.6 * size, life: 0.35, y: 0.06, opacity: 0.7 });
    this.flash(pos, color, 35 * size, 0.18);
  }

  // Bang du mur du son (boost en vol) : cône d'air et anneau vertical.
  sonicBoom(pos, dir, color = '#cfeaff') {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(pos.x, pos.y, pos.z);
    m.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z);
    m.scale.setScalar(0.5);
    this.scene.add(m);
    this.rings.push({ m, from: 0.5, to: 5, life: 0.4, t: 0, opacity: 0.7, disc: false, follow: null, free: true });
    this.emit(pos, { count: 30, color, speed: 12, size: 0.12, life: 0.4, gravity: 0, dir: { x: -dir.x, y: -dir.y, z: -dir.z }, spread: 1.2 });
  }

  update(dt) {
    let any = false;
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt;
      a.line.material.opacity = a.op * Math.max(0, 1 - a.t / a.life) * (0.6 + Math.random() * 0.4);
      if (a.t >= a.life) {
        this.scene.remove(a.line);
        a.line.geometry.dispose();
        a.line.material.dispose();
        this.arcs.splice(i, 1);
      }
    }
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
      const gy = this.groundAt ? this.groundAt(p.x, p.z) + 0.05 : 0.05;
      p.y = p.y + p.vy * dt;
      if (p.y < gy) {
        p.y = gy;
        p.vy *= -0.25; // rebond des débris
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
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

    let anyP = false;
    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = this.puffs[i];
      if (p.life <= 0) {
        if (this.uAlpha[i] !== 0) {
          this.uAlpha[i] = 0;
          anyP = true;
        }
        continue;
      }
      anyP = true;
      p.life -= dt;
      const k = 1 - p.life / p.max;
      const dg = Math.exp(-3 * dt);
      p.vx *= dg;
      p.vz *= dg;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const j = i * 3;
      this.uPos[j] = p.x;
      this.uPos[j + 1] = p.y;
      this.uPos[j + 2] = p.z;
      this.uCol[j] = p.r;
      this.uCol[j + 1] = p.g;
      this.uCol[j + 2] = p.b;
      // Volute qui s'étale et se dissipe
      this.uSize[i] = p.size * (0.45 + Math.sqrt(k) * 1.1);
      this.uAlpha[i] = (k < 0.1 ? k / 0.1 : 1) * (1 - k) * (1 - k);
    }
    if (anyP) {
      const a = this.puffPoints.geometry.attributes;
      a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
    }

    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const sp = this.sprites[i];
      sp.t += dt;
      const k = sp.t / sp.life;
      const pop = k < 0.25 ? 0.3 + (k / 0.25) * 0.9 : 1.2 + (k - 0.25) * (sp.grow - 1);
      sp.s.scale.setScalar(sp.size * pop);
      sp.s.position.y += sp.rise * dt;
      sp.s.material.opacity = this.realistic ? Math.max(0, 1 - k) ** 1.5 : k > 0.6 ? Math.max(0, (1 - k) / 0.4) : 1;
      if (k >= 1) {
        this.scene.remove(sp.s);
        sp.s.material.dispose();
        this.sprites.splice(i, 1);
      }
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
