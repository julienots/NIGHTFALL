// Personnages réalistes : modèles riggués (squelette Mixamo commun) animés
// par capture de mouvement. Remplacent les modèles procéduraux en gardant la
// même interface (root, joints, animate(s)…) pour que le gameplay, les
// anneaux, les PNJ et l'histoire fonctionnent sans changement.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CAST, CLIPS, LOOPS } from './realCast.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
const DIR = `${BASE}assets/characters/`;
const HIP = 0.95;

// ---------- Chargement ----------
export const REAL = { ready: false, chars: {}, clips: {}, failed: false };

// Noms d'os normalisés : « mixamorig9Hips », « mixamorig:Hips_14 »… -> « mixamorigHips ».
const normBone = (n) => n.replace(/^mixamorig\d*:?/, 'mixamorig').replace(/_\d+$/, '');

function fixClip(clip) {
  for (const t of clip.tracks) {
    const i = t.name.lastIndexOf('.');
    t.name = normBone(t.name.slice(0, i)) + t.name.slice(i);
  }
  // Animation « sur place » : la translation horizontale du bassin est
  // annulée (c'est le gameplay qui déplace le personnage).
  for (const t of clip.tracks) {
    if (/Hips\.position$/.test(t.name)) {
      const v = t.values;
      const x0 = v[0];
      const z0 = v[2];
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0;
        v[i + 2] = z0;
      }
    }
  }
  // Les pistes d'échelle ne servent à rien et coûtent cher.
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
  return clip;
}

export async function loadRealAssets(ids = Object.keys(CAST), onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let n = 0;
  const total = ids.length + 1;
  try {
    const anims = await loader.loadAsync(`${DIR}anims.glb`);
    const byName = new Map(anims.animations.map((a) => [a.name, a]));
    for (const [key, name] of Object.entries(CLIPS)) {
      const c = byName.get(name);
      if (c) REAL.clips[key] = fixClip(c.clone());
    }
    onProgress?.(++n / total);
    await Promise.all(ids.map(async (id) => {
      const g = await loader.loadAsync(`${DIR}${id}.glb`);
      g.scene.traverse((o) => {
        if (o.isBone) o.name = normBone(o.name);
        if (o.isMesh) {
          o.castShadow = true;
          o.frustumCulled = false; // les maillages skinnés ont des bornes fausses
          for (const m of [].concat(o.material)) {
            m.envMapIntensity = 0.9;
            if (m.map) m.map.anisotropy = 4;
            // Mélange alpha inutile (sauf cheveux/cils) : découpe nette, tri correct.
            if (m.transparent) {
              m.transparent = false;
              m.alphaTest = 0.45;
              m.depthWrite = true;
            }
          }
        }
      });
      REAL.chars[id] = g.scene;
      onProgress?.(++n / total);
    }));
    REAL.ready = true;
  } catch (e) {
    console.warn('Personnages réalistes indisponibles, modèles procéduraux utilisés.', e);
    REAL.failed = true;
  }
  return REAL.ready;
}

// Reflets d'environnement propres aux personnages (indépendants du réglage
// global de la scène, réglé très bas pour le style des décors).
export function applyRealEnv(tex, intensity = 0.9) {
  for (const sc of Object.values(REAL.chars)) {
    sc.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        m.envMap = tex;
        m.envMapIntensity = intensity;
        m.needsUpdate = true;
      }
    });
  }
}

const findBone = (root, suffix) => {
  let found = null;
  root.traverse((o) => {
    if (!found && o.isBone && o.name.endsWith(suffix)) found = o;
  });
  return found;
};

// Groupe attaché à un os, dont l'échelle compense celle de l'armature
// (Mixamo travaille souvent en centimètres).
function attach(bone, root) {
  const g = new THREE.Group();
  bone.add(g);
  root.updateMatrixWorld(true);
  const s = new THREE.Vector3();
  bone.getWorldScale(s);
  const r = new THREE.Vector3();
  root.getWorldScale(r);
  g.scale.setScalar(r.x / s.x);
  return g;
}

// ---------- Mélangeur d'animations ----------
// Chaque animation reçoit un poids cible ; les poids convergent en douceur
// (fondu ≈ 0,15 s). Les boucles avancent avec le temps ; les animations
// d'action sont « scrubbées » sur leur progression (synchronisées au combat).
class Blender {
  constructor(root) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.w = new Map();
  }

  action(key) {
    let a = this.actions.get(key);
    if (a !== undefined) return a;
    const clip = REAL.clips[key];
    a = clip ? this.mixer.clipAction(clip) : null;
    if (a) {
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      if (!LOOPS.has(key)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        a.paused = true;
      }
    }
    this.actions.set(key, a);
    return a;
  }

  // targets : { key: { w, p?, ts? } }
  update(dt, targets, fade = 10) {
    const k = 1 - Math.exp(-fade * dt);
    for (const key of Object.keys(targets)) this.action(key);
    for (const [key, a] of this.actions) {
      if (!a) continue;
      const t = targets[key];
      const cur = this.w.get(key) || 0;
      const nw = cur + ((t ? t.w : 0) - cur) * (t?.snap ? 1 : k);
      this.w.set(key, nw < 0.002 && !t ? 0 : nw);
      a.setEffectiveWeight(this.w.get(key));
      if (t && t.p != null) {
        a.paused = true;
        a.time = Math.min(a.getClip().duration - 1e-3, Math.max(0, t.p) * a.getClip().duration);
      } else if (t) {
        a.paused = false;
        a.timeScale = t.ts ?? 1;
      }
    }
    this.mixer.update(dt);
  }
}

// Plage utile de chaque action « scrubbée » (début, fin) dans le clip.
const RANGES = {
  jabR: [0.05, 0.75], jabL: [0.05, 0.75], ringPunch: [0.05, 0.8], whip: [0.1, 0.85], volley: [0.05, 0.8],
  diveImpact: [0.45, 0.95], superLanding: [0.05, 0.6], interact: [0.05, 0.95], magnetLift: [0, 0.45], magnetThrow: [0.1, 0.8],
  awaken: [0, 1], transform: [0, 0.9], roar: [0.05, 0.85], clawR: [0.1, 0.8], clawL: [0.1, 0.8], smash: [0.25, 0.9], lash: [0.1, 0.8],
  victory: [0, 1], wave: [0, 1], hug: [0, 1], roll: [0.05, 0.75], hitSmall: [0, 0.8], hitLarge: [0, 0.7], death: [0, 1],
};

// ---------- Personnage humain ----------
export class RealModel {
  constructor(id, { gear = false, umbra = false } = {}) {
    const def = CAST[id];
    this.id = id;
    this.realistic = true;
    this.umbra = umbra;
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.tilt.position.y = HIP;
    this.root.add(this.tilt);
    const inner = new THREE.Group();
    inner.position.y = -HIP;
    this.tilt.add(inner);
    this.model = SkeletonUtils.clone(REAL.chars[id]);
    inner.add(this.model);
    // Mise à l'échelle et pieds au sol
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const h = box.max.y - box.min.y || 1.7;
    const s = (def.height * (umbra ? 1.12 : 1)) / h;
    this.model.scale.multiplyScalar(s);
    this.model.position.y = -box.min.y * s;
    this.baseY = this.model.position.y;
    this.drop = 0;
    this.blend = new Blender(this.model);
    this.time = 0;
    this.mats = {};
    // Articulations utilisées par le gameplay (anneaux, traînées, effets)
    const B = (n) => findBone(this.model, n);
    this.bones = { hips: B('Hips'), spine: B('Spine2'), neck: B('Neck'), head: B('Head'), handR: B('RightHand'), handL: B('LeftHand'), armR: B('RightForeArm'), armL: B('LeftForeArm') };
    this.joints = { hips: this.bones.hips, spine: this.bones.spine, head: this.bones.head, fistR: this.bones.handR, fistL: this.bones.handL };
    for (const side of ['R', 'L']) {
      const fore = this.bones['arm' + side];
      if (!fore) continue;
      // Le code des anneaux suppose l'avant-bras orienté vers -Y local.
      const p = attach(fore, this.root);
      p.rotation.z = Math.PI;
      this.joints['el' + side] = p;
    }
    // Haut du personnage (pull, sweat…) : matériau propre, recolorable par les tenues.
    this.model.traverse((o) => {
      if (!this.top && o.isMesh && /sweater|shirt|hoodie|top|jacket|sweat/i.test(o.name)) {
        this.top = o.material.clone();
        this.topMap = this.top.map;
        o.material = this.top;
      }
    });
    if (this.top) {
      this.mats.hoodie = this.top;
      this.mats.hoodie2 = this.top;
    }
    if (umbra) this.#makeUmbra();
    if (gear) this.#buildGear();
    this.gearOn = false;
    if (this.gear) this.setGear(false);
    // Téléphone (main droite)
    if (this.bones.handR) {
      const g = attach(this.bones.handR, this.root);
      this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.01), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#7fe3ff', emissiveIntensity: 0, roughness: 0.3 }));
      this.phone.position.set(0, 0.09, 0.03);
      this.phone.visible = false;
      g.add(this.phone);
    }
    this.prevHurt = 0;
  }

  // Forme Abysse : la substance noire recouvre le corps (vernis noir,
  // reflets violets, veines cyan qui pulsent), yeux lumineux, tentacules.
  #makeUmbra() {
    const mat = new THREE.MeshStandardMaterial({ color: '#07060d', roughness: 0.16, metalness: 0.35, envMapIntensity: 1.4 });
    mat.userData.t = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = mat.userData.t;
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform float uT;\nvoid main() {')
        .replace('#include <opaque_fragment>', `vec3 nn = normal / max(length(normal), 1e-4);
          vec3 vv = vViewPosition / max(length(vViewPosition), 1e-4);
          float fr = pow(clamp(1.0 - dot(nn, vv), 0.0, 1.0), 2.5);
          outgoingLight += mix(vec3(0.48, 0.36, 1.0), vec3(0.37, 0.89, 1.0), 0.5 + 0.5 * sin(uT * 2.0)) * fr * 1.4;
          // Garde-fou : jamais de valeur invalide (le bloom l'étalerait en tache noire).
          if (any(isnan(outgoingLight)) || any(isinf(outgoingLight))) outgoingLight = vec3(0.0);
          outgoingLight = min(outgoingLight, vec3(20.0));
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'umbra';
    this.model.traverse((o) => {
      if (o.isMesh) o.material = mat;
    });
    this.mats.umbra = mat;
    const glow = new THREE.MeshBasicMaterial({ color: '#5fe3ff', toneMapped: false });
    if (this.bones.head) {
      const g = attach(this.bones.head, this.root);
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), glow);
        e.scale.set(1.8, 0.6, 0.6);
        e.position.set(sx * 0.035, 0.085, 0.095);
        e.rotation.z = sx * -0.35;
        g.add(e);
      }
      // Gueule crénelée (s'ouvre au rugissement)
      const maw = new THREE.Group();
      maw.position.set(0, 0.03, 0.1);
      g.add(maw);
      const tooth = new THREE.MeshStandardMaterial({ color: '#f4f0ff', roughness: 0.3 });
      for (let i = -3; i <= 3; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.022, 4), tooth);
        t.position.set(i * 0.011, 0, 0);
        t.rotation.x = Math.PI;
        maw.add(t);
      }
      this.maw = maw;
    }
    if (this.bones.spine) {
      const sp = attach(this.bones.spine, this.root);
      const tm = mat;
      this.tendrils = [];
      for (const [x, y, a] of [[-0.1, 0.12, -0.6], [0.1, 0.12, 0.6], [-0.07, -0.02, -1.1], [0.07, -0.02, 1.1]]) {
        let parent = new THREE.Group();
        parent.position.set(x, y, -0.13);
        sp.add(parent);
        const chain = [parent];
        for (let i = 0; i < 5; i++) {
          const r = 0.03 * (1 - i * 0.16);
          const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 0.14, 3, 6), i === 4 ? glow : tm);
          m.position.y = 0.08;
          parent.add(m);
          if (i < 4) {
            const nx = new THREE.Group();
            nx.position.y = 0.17;
            parent.add(nx);
            parent = nx;
            chain.push(nx);
          }
        }
        this.tendrils.push({ chain, a, seed: Math.random() * 6 });
      }
    }
  }

  // Tenue de justicier : bandeau-masque à lentilles lumineuses + écharpe.
  #buildGear() {
    const head = this.bones.head;
    const neck = this.bones.neck || this.bones.spine;
    if (!head || !neck) return;
    const maskM = new THREE.MeshStandardMaterial({ color: '#0d0a14', roughness: 0.45, metalness: 0.1 });
    const lens = new THREE.MeshBasicMaterial({ color: '#bff6ff', toneMapped: false });
    const scarfM = new THREE.MeshStandardMaterial({ color: '#b3123a', roughness: 0.85 });
    const hg = attach(head, this.root);
    const mask = new THREE.Group();
    mask.position.set(0, 0.088, 0.012);
    hg.add(mask);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.098, 0.045, 32, 1, true, -1.75, 3.5), maskM);
    band.material.side = THREE.DoubleSide;
    band.scale.set(0.84, 1, 1.22);
    mask.add(band);
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), lens);
      l.scale.set(1.45, 0.6, 0.25);
      l.position.set(sx * 0.031, 0.0, 0.123);
      l.rotation.z = sx * 0.3;
      mask.add(l);
    }
    const ng = attach(neck, this.root);
    const collar = new THREE.Group();
    ng.add(collar);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.026, 8, 22), scarfM);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1.05, 1.2, 1);
    ring.position.set(0, -0.02, 0.005);
    collar.add(ring);
    let parent = new THREE.Group();
    parent.position.set(0.04, 0.02, -0.08);
    collar.add(parent);
    this.scarf = [parent];
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.09 - i * 0.007, 0.16, 0.012), scarfM);
      seg.position.y = -0.08;
      parent.add(seg);
      if (i < 4) {
        const nx = new THREE.Group();
        nx.position.y = -0.16;
        parent.add(nx);
        parent = nx;
        this.scarf.push(nx);
      }
    }
    this.gear = { mask, collar };
  }

  setGear(on) {
    if (!this.gear) return;
    this.gearOn = on;
    this.gear.mask.visible = on;
    this.gear.collar.visible = on;
  }

  // Tenue : couleur unie sur le haut (la texture de tissu d'origine sinon).
  setOutfit(color) {
    if (!this.top) return;
    if (color) {
      this.top.map = null;
      this.top.color.set(color);
      this.top.roughness = 0.85;
    } else {
      this.top.map = this.topMap;
      this.top.color.set('#ffffff');
    }
    this.top.needsUpdate = true;
  }

  setPhone(on) {
    if (!this.phone) return;
    this.phone.visible = on;
    this.phone.material.emissiveIntensity = on ? 1.2 : 0;
  }

  setBackpack() {}

  setExpression() {}

  // Même état d'entrée que HeroModel.animate.
  animate(s) {
    let dt = s.dt || 0.016;
    // Personnage lointain : animation mise à jour une image sur trois.
    if (s.skip) {
      this.acc = (this.acc || 0) + dt;
      this.skipN = ((this.skipN || 0) + 1) % 3;
      if (this.skipN) return;
      dt = this.acc;
      this.acc = 0;
    } else this.acc = 0;
    this.time += dt;
    const t = this.time;
    const T = {};
    const hs = s.speedMs ?? (s.speed || 0) * 5.8; // vitesse au sol (m/s)
    const U = this.umbra;
    let tiltX = 0;
    let tiltZ = (s.lean || 0) * 0.6;
    const scrub = (key, p) => {
      const r = RANGES[key] || [0, 1];
      T[key] = { w: 1, p: r[0] + (r[1] - r[0]) * Math.min(1, Math.max(0, p)) };
    };
    const anim = s.anim && CLIPS[s.anim] ? s.anim : null;
    if (s.dead) scrub('death', Math.min(1, (s.deadP || 0) * 0.8));
    else if (s.dodge) scrub('roll', s.dodgeP ?? 0.4);
    else if (anim && LOOPS.has(anim)) T[anim] = { w: 1, ts: 1 };
    else if (anim) scrub(anim, s.animP || 0);
    else if (s.flight) {
      T.float = { w: 1, ts: s.flight.mode === 'boost' ? 1.6 : 1 };
      if (s.flight.mode !== 'hover') {
        tiltX = s.flight.pitch;
        tiltZ = s.flight.roll;
      } else tiltX = 0.08;
    } else if (s.shield) T.block = { w: 1 };
    else if (s.hurt > 0) scrub(s.hurt > 0.95 && this.prevHurt <= 0 ? 'hitSmall' : 'hitSmall', 1 - s.hurt);
    else if (s.airborne) T.fall = { w: 1 };
    else {
      // Locomotion : idle / marche / course / sprint fondus selon la vitesse,
      // cadence ajustée pour que les pieds ne glissent pas.
      const idleKey = U ? 'umbraIdle' : s.combat ? 'fightIdle' : 'idle';
      if (U) {
        const k = Math.min(1, hs / 4);
        T[idleKey] = { w: 1 - k };
        T.umbraRun = { w: k, ts: Math.max(0.6, hs / 7) };
      } else {
        const wWalk = hs < 0.25 ? 0 : hs < 2.2 ? Math.min(1, (hs - 0.25) / 1.0) : Math.max(0, 1 - (hs - 2.2) / 2.2);
        const wRun = hs < 2.2 ? 0 : hs < 6.5 ? Math.min(1, (hs - 2.2) / 2.2) : Math.max(0, 1 - (hs - 6.5) / 2);
        const wSprint = hs < 6.5 ? 0 : Math.min(1, (hs - 6.5) / 2);
        const wIdle = Math.max(0, 1 - wWalk - wRun - wSprint);
        if (wIdle > 0.001) T[idleKey] = { w: wIdle };
        if (wWalk > 0.001) T.walk = { w: wWalk, ts: Math.max(0.5, hs / 1.5) };
        if (wRun > 0.001) T.run = { w: wRun, ts: Math.max(0.6, hs / 5.2) };
        if (wSprint > 0.001) T.sprint = { w: wSprint, ts: Math.max(0.7, hs / 8.5) };
      }
      if (s.land > 0.35) T.land = { w: s.land * 0.6, p: 0.5 - s.land * 0.4 };
    }
    // Assis : le clip garde le bassin à hauteur debout, on descend sur la chaise.
    const wantDrop = anim === 'sit' ? -0.44 * (CAST[this.id].height / 1.74) : 0;
    this.drop += (wantDrop - this.drop) * Math.min(1, dt * 10);
    this.model.position.y = this.baseY + this.drop;
    this.prevHurt = s.hurt || 0;
    const fast = s.anim || s.dodge || s.hurt > 0 || s.dead;
    this.blend.update(dt, T, fast ? 18 : 9);
    // Inclinaison du corps entier (vol, virages) lissée.
    const kt = 1 - Math.exp(-6 * dt);
    this.tilt.rotation.x += (tiltX - this.tilt.rotation.x) * kt;
    this.tilt.rotation.z += (tiltZ - this.tilt.rotation.z) * kt;
    if (this.mats.umbra) this.mats.umbra.userData.t.value = t;
    if (this.tendrils) {
      const act = s.anim ? 2.2 : 1 + Math.min(1, s.speed || 0);
      for (const td of this.tendrils) {
        td.chain.forEach((j, i) => {
          if (i === 0) j.rotation.set(-1.1 - (s.anim ? 0.6 : 0) + Math.sin(t * 2 * act + td.seed) * 0.2, 0, td.a * 0.5 + Math.cos(t * 1.7 + td.seed) * 0.25);
          else j.rotation.set(Math.sin(t * 3 * act + td.seed + i) * 0.4, 0, Math.cos(t * 2.4 + td.seed + i * 0.7) * 0.3 * td.a);
        });
      }
    }
    if (this.maw) {
      const open = s.anim === 'roar' || s.anim === 'transform' ? 1 : 0.2;
      this.maw.scale.y += (0.6 + open * 1.4 - this.maw.scale.y) * Math.min(1, dt * 12);
    }
    if (this.scarf && this.gearOn) {
      const fly = s.flight && s.flight.mode !== 'hover';
      const lift = fly ? 1.45 : Math.min(1.2, (s.speed || 0) * 0.75 + (s.airborne ? 0.5 : 0) + (s.dodge ? 0.6 : 0));
      this.scarfLift = (this.scarfLift ?? 0) + (lift - (this.scarfLift ?? 0)) * Math.min(1, dt * 5);
      const L = this.scarfLift;
      const amp = 0.12 + L * 0.22;
      const freq = 4 + L * 9;
      this.scarf.forEach((j, i) => {
        const wave = Math.sin(t * freq - i * 0.9) * amp * (0.4 + i * 0.25);
        j.rotation.set(i === 0 ? 0.25 + L * 1.15 : wave * 0.6 + L * 0.12, 0, Math.cos(t * freq * 0.7 - i) * amp * 0.5);
      });
    }
    this.setPhone(s.anim === 'phone');
  }
}

// ---------- Créatures réalistes (Stalker, Brute) ----------
const CREATURE_MAP = {
  stalker: {
    move: (st) => (st.speed > 0.25 ? { zRun: { w: 1, ts: Math.max(0.7, st.speed * 0.9) } } : { zIdle: { w: 1 } }),
    observe: () => ({ mBreath: { w: 1 } }), lurk: () => ({ zIdle: { w: 1, ts: 0.4 } }),
    windup: (st) => ({ mRoar: { w: 1, p: 0.1 + st.p * 0.25 } }), lunge: (st) => ({ mJump: { w: 1, p: 0.3 + st.p * 0.45 } }),
    swipeWindup: (st) => ({ mSwipe: { w: 1, p: st.p * 0.35 } }), swipe: (st) => ({ mSwipe: { w: 1, p: 0.35 + st.p * 0.5 } }),
    recover: () => ({ mBreath: { w: 1 } }), stagger: (st) => ({ zStumble: { w: 1, p: Math.min(1, st.p) * 0.6 } }),
    dead: (st) => ({ zDie: { w: 1, p: Math.min(1, st.p / 2) } }),
  },
  brute: {
    move: (st) => (st.speed > 0.2 ? { mRun: { w: 1, ts: Math.max(0.6, st.speed * 0.8) } } : { mIdle: { w: 1 } }),
    roar: (st) => ({ mRoar: { w: 1, p: st.p * 0.9 } }), slamWindup: (st) => ({ mJump: { w: 1, p: st.p * 0.42 } }),
    slam: (st) => ({ mJump: { w: 1, p: 0.42 + Math.min(1, st.p) * 0.5 } }), swipeWindup: (st) => ({ mSwipe: { w: 1, p: st.p * 0.35 } }),
    swipe: (st) => ({ mSwipe: { w: 1, p: 0.35 + Math.min(1, st.p) * 0.5 } }), chargeWindup: (st) => ({ mFlex: { w: 1, p: st.p * 0.6 } }),
    charge: () => ({ mRun: { w: 1, ts: 1.7 } }), recover: () => ({ mBreath: { w: 1 } }), stagger: (st) => ({ hitLarge: { w: 1, p: Math.min(1, st.p) * 0.7 } }),
    dead: (st) => ({ mDie: { w: 1, p: Math.min(1, st.p / 2.2) } }),
  },
};

export class RealCreatureModel {
  constructor(type) {
    this.realistic = true;
    this.type = type;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.model = SkeletonUtils.clone(REAL.chars[type]);
    this.body.add(this.model);
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const s = CAST[type].height / (box.max.y - box.min.y || 2);
    this.model.scale.multiplyScalar(s);
    this.model.position.y = -box.min.y * s;
    this.blend = new Blender(this.model);
    // Matériaux propres à l'instance (flash d'impact, dissolution)
    this.allMats = [];
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.material = [].concat(o.material).map((m) => {
          const c = m.clone();
          c.emissive = new THREE.Color('#ffffff');
          c.emissiveIntensity = 0;
          this.allMats.push(c);
          return c;
        });
        if (o.material.length === 1) o.material = o.material[0];
      }
    });
    this.skinMats = this.allMats;
    this.joints = {};
    this.map = CREATURE_MAP[type];
  }

  animate(st) {
    const f = this.map[st.mode] || this.map.move;
    const T = f(st);
    this.blend.update(st.dt, T, st.mode === 'move' ? 8 : 16);
  }

  setFlash(f) {
    for (const m of this.allMats) m.emissiveIntensity = f * 0.35;
    const s = f * f;
    this.body.scale.set(1 + s * 0.08, 1 - s * 0.07, 1 + s * 0.08);
  }

  setDissolve(k) {
    this.root.scale.setScalar(Math.max(0.001, (this.baseScale || 1) * (1 - k * 0.15)));
    this.body.position.y = -k * 0.8;
    for (const m of this.allMats) {
      m.transparent = k > 0;
      m.depthWrite = k < 0.5;
      m.opacity = 1 - k;
    }
  }
}

export const hasReal = (id) => REAL.ready && !!REAL.chars[id];
