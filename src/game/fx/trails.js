// Traînées de mouvement (rubans additifs qui suivent les poings / griffes
// pendant les attaques) et images rémanentes (silhouettes fantômes laissées
// pendant une esquive ou un boost en vol).
import * as THREE from 'three';

const N = 18; // points d'historique par traînée

export class Trail {
  constructor(scene, { color = '#7fe3ff', width = 0.32, life = 0.22 } = {}) {
    this.pts = [];
    this.width = width;
    this.life = life;
    this.color = new THREE.Color(color);
    this.active = false;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    this.alpha = new Float32Array(N * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: this.color } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(mix(uColor, vec3(1.0), vA * vA * 0.6) * vA * 1.6, vA); }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.tmp = new THREE.Vector3();
    this.side = new THREE.Vector3();
  }

  setColor(c) {
    this.color.set(c);
  }

  // p : position monde de la pointe ; cam : position caméra.
  update(dt, p, cam, emitting) {
    const now = performance.now() / 1000;
    if (emitting && p) {
      const last = this.pts[this.pts.length - 1];
      if (!last || last.p.distanceToSquared(p) > 0.0004) this.pts.push({ p: p.clone(), t: now });
    }
    while (this.pts.length && (now - this.pts[0].t > this.life || this.pts.length > N)) this.pts.shift();
    const n = this.pts.length;
    this.mesh.visible = n > 1;
    if (n < 2) return;
    for (let i = 0; i < N; i++) {
      const k = Math.min(i, n - 1);
      const cur = this.pts[k].p;
      const nxt = this.pts[Math.min(k + 1, n - 1)].p;
      const prv = this.pts[Math.max(k - 1, 0)].p;
      this.tmp.subVectors(nxt, prv);
      this.side.subVectors(cam, cur).cross(this.tmp).normalize();
      const age = (now - this.pts[k].t) / this.life;
      const a = i < n ? Math.max(0, 1 - age) * (k / (n - 1)) : 0;
      const w = this.width * (0.25 + 0.75 * a);
      this.pos.set([cur.x + this.side.x * w, cur.y + this.side.y * w, cur.z + this.side.z * w], i * 6);
      this.pos.set([cur.x - this.side.x * w, cur.y - this.side.y * w, cur.z - this.side.z * w], i * 6 + 3);
      this.alpha[i * 2] = a;
      this.alpha[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }
}

// Images rémanentes : copies figées du modèle (géométries partagées) avec un
// matériau fantôme additif qui s'estompe.
export class Afterimages {
  constructor(scene, model, { count = 4, color = '#7a5cff' } = {}) {
    this.scene = scene;
    this.model = model;
    this.ghosts = [];
    this.nodes = [];
    model.root.traverse((o) => this.nodes.push(o));
    // userData est copié en JSON par clone() : on retire la liste des coques.
    const outlines = model.root.userData.outlines;
    delete model.root.userData.outlines;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const root = model.root.clone(true);
      const nodes = [];
      root.traverse((o) => {
        nodes.push(o);
        if (o.isMesh) {
          o.material = mat;
          o.castShadow = false;
          if (o.userData.isOutline) o.visible = false;
        }
      });
      root.visible = false;
      scene.add(root);
      this.ghosts.push({ root, nodes, mat, t: 0, life: 0.35 });
    }
    if (outlines) model.root.userData.outlines = outlines;
    this.i = 0;
    this.spawnT = 0;
  }

  setColor(c) {
    for (const g of this.ghosts) g.mat.color.set(c);
  }

  // Fige une copie de la pose actuelle.
  snap(life = 0.35) {
    const g = this.ghosts[this.i];
    this.i = (this.i + 1) % this.ghosts.length;
    const src = this.nodes;
    for (let k = 0; k < src.length && k < g.nodes.length; k++) {
      const a = src[k];
      const b = g.nodes[k];
      b.position.copy(a.position);
      b.quaternion.copy(a.quaternion);
      b.scale.copy(a.scale);
      if (!b.userData.isOutline) b.visible = a.visible;
    }
    g.root.visible = this.model.root.visible;
    g.t = 0;
    g.life = life;
  }

  update(dt, emitting, every = 0.06) {
    if (emitting) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = every;
        this.snap();
      }
    } else this.spawnT = 0;
    for (const g of this.ghosts) {
      if (!g.root.visible) continue;
      g.t += dt;
      const k = g.t / g.life;
      g.mat.opacity = Math.max(0, 0.55 * (1 - k));
      if (k >= 1) g.root.visible = false;
    }
  }
}
