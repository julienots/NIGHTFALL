// Effets visuels poolés : particules additives, ondes de choc, télégraphes
// d'attaque au sol, flash lumineux d'impact.
import * as THREE from 'three';

const MAX_PARTICLES = 1200;
const MAX_PUFFS = 300;
const WORDS = ['POW!', 'BAM!', 'CRAC!', 'BOUM!', 'WHAM!'];

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  x.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 22 : 60;
    const a = (i / 16) * Math.PI * 2;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
  x.fillStyle = '#ffffff';
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = 'rgba(30,10,60,0.9)';
  x.stroke();
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

    // --- Nuages de poussière / fumée (opaques, bord net : style cartoon) ---
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
          void main(){
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p);
            if (d > 0.5) discard;
            // Ombrage en deux tons + liseré sombre
            float shade = p.x + p.y < 0.1 ? 1.0 : 0.78;
            vec3 c = d > 0.44 ? vCol * 0.45 : vCol * shade;
            gl_FragColor = vec4(c, vA);
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

    // --- Traînées de coups (arcs « smear » cartoon) ---
    this.swooshes = [];
    this.swooshGeo = new Map();

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

  puff(pos, { color = '#ece6ff', size = 0.8, life = 0.8, rise = 0.6, spread = 0.6, count = 1, vel = null } = {}) {
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
  dustRing(pos, radius = 1.5, count = 12, color = '#d9d0f5') {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.puff({ x: pos.x + Math.cos(a) * radius * 0.3, y: pos.y + 0.1, z: pos.z + Math.sin(a) * radius * 0.3 }, {
        color, size: 0.9, life: 0.6, rise: 0.4, spread: 0.1, vel: { x: Math.cos(a) * radius * 2.2, z: Math.sin(a) * radius * 2.2 },
      });
    }
  }

  #sprite(map, pos, { size = 1.2, life = 0.25, color = '#ffffff', grow = 1.6, rise = 0 }) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, depthTest: false }));
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
    const w = WORDS[Math.floor(Math.random() * WORDS.length)];
    const key = w + color;
    if (!this.wordTex[key]) this.wordTex[key] = wordTexture(w, color);
    this.#sprite(this.wordTex[key], { x: pos.x, y: pos.y + 0.6, z: pos.z }, { size: 2.6, life: 0.7, grow: 1.15, rise: 1.2 });
  }

  // Anneau qui s'étend au sol (onde de choc) ou disque de télégraphe.
  ring(pos, { color = '#ffcd20', from = 0.5, to = 6, life = 0.5, y = 0.08, disc = false, opacity = 0.9, follow = null, dark = false } = {}) {
    const m = new THREE.Mesh(
      disc ? this.discGeo : this.ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
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
    this.emit(pos, { count: heavy ? 18 : 10, color, speed: heavy ? 9 : 6, size: heavy ? 0.3 : 0.22, life: 0.3 });
    this.starBurst(pos, heavy ? '#fff27a' : '#ffffff', heavy ? 1.9 : 1.2);
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
    this.puff({ x: pos.x, y: pos.y + 0.6, z: pos.z }, { color: '#6a4aa8', size: 1.4, life: 1.3, rise: 1.4, spread: 1.4, count: 14 });
    this.starBurst({ x: pos.x, y: pos.y + 1.2, z: pos.z }, color, 2.4);
    this.ring(pos, { color, from: 0.3, to: 3.5, life: 0.6 });
  }

  // Traînée de mouvement : arc coloré qui balaie devant le personnage.
  // yaw : orientation du personnage ; tilt : inclinaison du plan du coup
  // (0 = horizontal, π/2 = vertical) ; flip : sens du balayage.
  swoosh(pos, yaw, { color = '#ffffff', radius = 1.5, arc = 2.2, width = 0.3, tilt = 0.25, life = 0.2, flip = false, dark = false, y = 1.15, roll = 0 } = {}) {
    const key = `${arc.toFixed(2)}:${width.toFixed(2)}`;
    let geo = this.swooshGeo.get(key);
    if (!geo) {
      // Anneau partiel dont l'épaisseur s'affine vers la queue (couleur par sommet).
      geo = new THREE.RingGeometry(1 - width, 1, 40, 1, -arc / 2, arc);
      const n = geo.attributes.position.count;
      const fade = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = geo.attributes.position.getX(i);
        const y = geo.attributes.position.getY(i);
        const a = (Math.atan2(y, x) + arc / 2) / arc; // 0 = queue, 1 = tête
        const v = Math.min(1, 0.25 + Math.max(0, Math.min(1, a)) ** 0.7 * 1.1);
        fade[i * 3] = fade[i * 3 + 1] = fade[i * 3 + 2] = v;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(fade, 3));
      this.swooshGeo.set(key, geo);
    }
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide,
      blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
    }));
    if (dark) m.material.vertexColors = false;
    const o = new THREE.Object3D();
    o.position.set(pos.x, pos.y + y, pos.z);
    o.rotation.set(0, yaw, 0);
    m.rotation.set(-Math.PI / 2 + tilt, 0, -Math.PI / 2 + roll); // arc centré vers l’avant (+Z local)
    if (flip) m.scale.x = -1;
    o.add(m);
    o.scale.setScalar(radius * 0.7);
    this.scene.add(o);
    this.swooshes.push({ o, m, t: 0, life, radius, spin: (flip ? -1 : 1) * 1.4 });
  }

  // Arc électrique : particules serrées le long d'un tracé en zigzag.
  bolt(from, to, color = '#7fd0ff', segs = 7) {
    let px = from.x;
    let py = from.y;
    let pz = from.z;
    for (let i = 1; i <= segs; i++) {
      const k = i / segs;
      const j = i === segs ? 0 : 0.45;
      const nx = from.x + (to.x - from.x) * k + (Math.random() - 0.5) * j;
      const ny = from.y + (to.y - from.y) * k + (Math.random() - 0.5) * j;
      const nz = from.z + (to.z - from.z) * k + (Math.random() - 0.5) * j;
      for (let t = 0; t < 5; t++) {
        const u = t / 5;
        this.emit({ x: px + (nx - px) * u, y: py + (ny - py) * u, z: pz + (nz - pz) * u }, { count: 1, color, speed: 0.2, up: 0, size: 0.22, life: 0.18, gravity: 0, drag: 8 });
      }
      px = nx;
      py = ny;
      pz = nz;
    }
  }

  // Impact propre à chaque noyau équipé (couleur = glow du noyau).
  coreImpact(pos, core, color, heavy) {
    if (core === 'amber_knuckles') {
      // Ambre : étincelles chaudes qui retombent.
      this.emit(pos, { count: heavy ? 26 : 14, color: '#ffb347', speed: heavy ? 8 : 6, up: 4, size: 0.16, life: 0.75, gravity: 14, drag: 1 });
      this.emit(pos, { count: 6, color: '#fff1a8', speed: 3, size: 0.28, life: 0.25, gravity: 0 });
    } else if (core === 'eclipse_gauntlets') {
      // Éclipse : arcs bleus qui jaillissent du point d'impact.
      for (let i = 0; i < (heavy ? 4 : 2); i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 1 + Math.random() * (heavy ? 1.6 : 0.9);
        this.bolt(pos, { x: pos.x + Math.cos(a) * r, y: pos.y + (Math.random() - 0.3) * 1.4, z: pos.z + Math.sin(a) * r }, color);
      }
    } else if (core === 'void_phalanx') {
      // Vide : distorsion violette qui implose.
      this.ring({ x: pos.x, y: pos.y - 1, z: pos.z }, { color: '#2a0f4a', from: heavy ? 3 : 2, to: 0.2, life: 0.32, y: 1, opacity: 0.7, dark: true });
      this.ring({ x: pos.x, y: pos.y - 1, z: pos.z }, { color, from: 0.2, to: heavy ? 3.2 : 2.2, life: 0.4, y: 1, opacity: 0.8 });
      for (let i = 0; i < (heavy ? 14 : 8); i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 1.6;
        this.emit({ x: pos.x + Math.cos(a) * r, y: pos.y + (Math.random() - 0.5), z: pos.z + Math.sin(a) * r }, { count: 1, color, speed: 0.1, size: 0.22, life: 0.3, gravity: 0, dir: { x: -Math.cos(a), y: 0, z: -Math.sin(a) } });
      }
    } else {
      this.emit(pos, { count: heavy ? 10 : 6, color, speed: 5, size: 0.18, life: 0.35, gravity: 3 });
    }
    if (heavy) this.ring({ x: pos.x, y: pos.y - 1, z: pos.z }, { color, from: 0.3, to: 3, life: 0.35, y: 1, opacity: 0.85 });
  }

  // Forme Abysse : trois griffures parallèles et éclaboussures d'encre noire.
  claws(pos, yaw, { flip = false, color = '#b48cff' } = {}) {
    for (let i = -1; i <= 1; i++) {
      this.swoosh(pos, yaw, { color, radius: 1.8 + i * 0.16, arc: 1.4, width: 0.1, tilt: 0.75, roll: i * 0.1 + (flip ? -0.9 : 0.9), life: 0.24, flip, y: 1.2 + i * 0.16 });
    }
  }

  ink(pos, amount = 1) {
    this.puff(pos, { color: '#1d1530', size: 0.45, life: 0.5, rise: -0.5, spread: 0.9, count: Math.round(6 * amount) });
    this.emit(pos, { count: Math.round(10 * amount), color: '#3a1d6e', speed: 5, up: 2, size: 0.25, life: 0.45, gravity: 10 });
  }

  update(dt) {
    for (let i = this.swooshes.length - 1; i >= 0; i--) {
      const w = this.swooshes[i];
      w.t += dt;
      const k = w.t / w.life;
      w.m.rotation.z += w.spin * dt * (1 - k) * 3;
      w.o.scale.setScalar(w.radius * (0.7 + 0.35 * Math.min(1, k * 3)));
      w.m.material.opacity = 0.95 * (1 - k) ** 1.5;
      if (k >= 1) {
        this.scene.remove(w.o);
        w.m.material.dispose();
        this.swooshes.splice(i, 1);
      }
    }
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
      // Gonfle puis rétrécit (pop cartoon)
      this.uSize[i] = p.size * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) * 0.9);
      this.uAlpha[i] = k > 0.8 ? (1 - k) / 0.2 : 1;
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
      sp.s.material.opacity = k > 0.6 ? Math.max(0, (1 - k) / 0.4) : 1;
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
