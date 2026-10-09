// Caisse interactive : repérage (faisceau), inspection, ouverture animée.
import * as THREE from 'three';
import { CRATE_TYPES } from '../systems/loot.js';
import { ribbedTexture } from './textures.js';
import { toon } from '../fx/toon.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const STYLE = {
  supply: { body: '#c98a4a', trim: '#6a3a2a', size: [1.2, 0.75, 0.8] },
  tactical: { body: '#3d8fd1', trim: '#fff27a', size: [1.4, 0.8, 0.9] },
  elite: { body: '#7b4ad6', trim: '#ff9cf0', size: [1.5, 0.9, 1.0] },
};

export class Crate {
  constructor(def, scene, col) {
    this.def = def;
    this.id = def.id;
    this.type = def.type;
    this.info = CRATE_TYPES[def.type];
    this.state = 'closed';
    this.openT = 0;
    this.pos = new THREE.Vector3(def.x, def.y, def.z);
    const st = STYLE[def.type];
    const [w, h, d] = st.size;
    this.root = new THREE.Group();
    this.root.position.copy(this.pos);
    this.root.rotation.y = def.rot || 0;

    const body = toon('#ffffff', { map: ribbedTexture(st.body), rim: '#ffffff', rimStrength: 0.5 });
    const trim = toon(st.trim, { emissive: def.type === 'supply' ? '#000000' : st.trim, emissiveIntensity: def.type === 'supply' ? 0 : 0.8, shared: false });
    this.trimMat = trim;
    const base = new THREE.Mesh(new RoundedBoxGeometry(w, h * 0.7, d, 3, 0.07), body);
    base.position.y = h * 0.35;
    this.root.add(base);
    // Renforts d'angle
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.08, h * 0.72, 0.08), trim);
        c.position.set(sx * (w / 2 - 0.02), h * 0.36, sz * (d / 2 - 0.02));
        this.root.add(c);
      }
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.06, d + 0.02), trim);
    band.position.y = h * 0.62;
    this.root.add(band);
    // Couvercle sur charnière arrière
    this.lid = new THREE.Group();
    this.lid.position.set(0, h * 0.7, -d / 2);
    const lidMesh = new THREE.Mesh(new RoundedBoxGeometry(w + 0.04, h * 0.3, d + 0.04, 3, 0.07), body);
    lidMesh.position.set(0, h * 0.15, d / 2);
    this.lid.add(lidMesh);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), trim);
    lock.position.set(0, 0.02, d + 0.01);
    this.lid.add(lock);
    this.root.add(this.lid);
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });

    // Lueur intérieure (révélée à l'ouverture)
    this.inner = new THREE.PointLight(this.info.color, 0, 6, 2);
    this.inner.position.y = h;
    this.root.add(this.inner);

    // Faisceau de repérage
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.5, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: this.info.color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.position.y = 7;
    this.root.add(this.beam);

    // Voyant de verrouillage
    this.lockLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
    this.lockLight.position.set(0, h * 0.5, d / 2 + 0.03);
    this.lockLight.visible = false;
    this.root.add(this.lockLight);

    scene.add(this.root);
    const c = Math.abs(Math.cos(def.rot || 0));
    const s = Math.abs(Math.sin(def.rot || 0));
    col.addCentered(def.x, def.y, def.z, w * c + d * s, h, w * s + d * c);
    this.height = h;
  }

  setLocked(locked) {
    this.locked = locked;
    this.lockLight.visible = locked && this.state !== 'opened';
  }

  // Ouverture déjà faite (chargement de sauvegarde)
  setOpened() {
    this.state = 'opened';
    this.lid.rotation.x = -1.9;
    this.beam.visible = false;
    this.lockLight.visible = false;
    this.trimMat.emissiveIntensity = 0;
  }

  open() {
    if (this.state === 'opening' || this.state === 'opened') return false;
    this.state = 'opening';
    this.openT = 0;
    this.lockLight.visible = false;
    return true;
  }

  update(dt, t) {
    if (this.state === 'opening') {
      this.openT += dt;
      const k = Math.min(1, this.openT / 0.7);
      // Petit tremblement avant l'ouverture
      const shake = this.openT < 0.25 ? Math.sin(this.openT * 80) * 0.03 : 0;
      this.lid.rotation.x = -1.9 * (k < 0.35 ? 0 : (1 - (1 - (k - 0.35) / 0.65) ** 3)) + shake;
      this.inner.intensity = 14 * Math.sin(Math.min(1, this.openT / 1.4) * Math.PI);
      this.beam.material.opacity = 0.5 * (1 - k);
      this.beam.scale.x = this.beam.scale.z = 1 + k * 2;
      if (this.openT > 1.4) {
        this.state = 'opened';
        this.beam.visible = false;
        this.trimMat.emissiveIntensity = 0;
      }
    } else if (this.state !== 'opened') {
      this.beam.material.opacity = 0.1 + Math.sin(t * 2 + this.pos.x) * 0.04;
      this.trimMat.emissiveIntensity = this.type === 'supply' ? 0 : 0.7 + Math.sin(t * 3) * 0.3;
    }
  }
}
