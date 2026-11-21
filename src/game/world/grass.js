// Herbe interactive (entièrement sur le GPU).
// - Des touffes de brins couvrent un carré autour de la caméra ; la grille
//   « s'enroule » (modulo) quand on avance : l'herbe paraît infinie sans aucun
//   calcul côté CPU.
// - Hauteur du sol et densité lues dans la texture du terrain (pas d'herbe
//   sur les chemins, la roche, l'eau, dans les villages pavés).
// - Vent : rafales qui balaient la prairie + frémissement des pointes.
// - Interaction : les personnages (Noa, créatures, villageois) écartent les
//   brins autour d'eux ; Noa laisse une trace (texture de piétinement) qui se
//   redresse en quelques secondes. Le souffle du vol couche l'herbe en cercle.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { PBR } from '../fx/pbr.js';
import { WORLD } from './terrain.js';

const MAX_BENDERS = 8;
const TRAMPLE_SIZE = 72; // m couverts par la texture de piétinement
const TRAMPLE_RES = 256;

// Deux couches : dense autour de Noa, plus clairsemée (brins plus larges) au loin.
const CFG = {
  low: [{ r: 13, sp: 0.42, blades: 6 }, { r: 30, sp: 1.0, blades: 4, wide: 1.6 }],
  medium: [{ r: 17, sp: 0.36, blades: 7 }, { r: 42, sp: 0.85, blades: 5, wide: 1.5 }],
  high: [{ r: 22, sp: 0.31, blades: 8 }, { r: 56, sp: 0.72, blades: 6, wide: 1.4 }],
  ultra: [{ r: 28, sp: 0.27, blades: 9 }, { r: 70, sp: 0.62, blades: 6, wide: 1.35 }],
};

// Touffe : quelques brins effilés (4 segments), légèrement courbés.
function clumpGeometry(blades, seed = 7, wide = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = [];
  const uv = [];
  const idx = [];
  const SEG = 4;
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 0.28;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const yaw = rnd() * Math.PI * 2;
    const w = (0.016 + rnd() * 0.022) * wide;
    const h = 0.7 + rnd() * 0.5;
    const lean = (rnd() - 0.5) * 0.35;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const base = pos.length / 3;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      const width = w * (1 - t * 0.92);
      const bend = lean * t * t;
      for (const side of [-1, 1]) {
        if (k === SEG && side === 1) continue; // pointe : un seul sommet
        const lx = k === SEG ? 0 : side * width;
        pos.push(ox + lx * cy + bend * sy, t * h, oz - lx * sy + bend * cy);
        uv.push(side * 0.5 + 0.5, t);
      }
    }
    for (let k = 0; k < SEG; k++) {
      const a0 = base + k * 2;
      if (k < SEG - 1) idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
      else idx.push(a0, a0 + 1, a0 + 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

const TRAMPLE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tPrev;
  uniform vec2 uShift;
  uniform float uDecay;
  uniform vec4 uB[${MAX_BENDERS}]; // x, z (uv), rayon (uv), force
  void main(){
    vec2 puv = vUv + uShift;
    vec4 p = (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) ? vec4(0.0) : texture2D(tPrev, puv);
    vec3 v = p.xyz * uDecay;
    for (int i = 0; i < ${MAX_BENDERS}; i++) {
      if (uB[i].w <= 0.0) continue;
      vec2 d = vUv - uB[i].xy;
      float l = length(d);
      float k = smoothstep(uB[i].z, uB[i].z * 0.35, l) * uB[i].w;
      if (k > v.z) v = vec3(d / max(l, 1e-4) * k, k);
    }
    gl_FragColor = vec4(v, 1.0);
  }
`;

export class Grass {
  constructor(scene, renderer, terrain, quality = 'medium') {
    this.renderer = renderer;
    const layers = CFG[quality] || CFG.medium;
    this.cfg = layers[0];
    const makeGeo = (cfg) => {
      const geo = clumpGeometry(cfg.blades, 7, cfg.wide || 1);
      // Grille de touffes (avec jitter) sur [-r, r]².
      const side = Math.floor((cfg.r * 2) / cfg.sp);
      const count = side * side;
      const off = new Float32Array(count * 3);
      let s = 12345 + cfg.blades;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      let k = 0;
      for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
          off[k++] = -cfg.r + (i + rnd()) * cfg.sp;
          off[k++] = -cfg.r + (j + rnd()) * cfg.sp;
          off[k++] = rnd();
        }
      }
      geo.setAttribute('gOffset', new THREE.InstancedBufferAttribute(off, 3));
      geo.instanceCount = count;
      return geo;
    };

    // Piétinement : deux cibles en ping-pong (demi-flottants signés).
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(TRAMPLE_RES, TRAMPLE_RES, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(TRAMPLE_RES, TRAMPLE_RES, rtOpts);
    this.trampleMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: TRAMPLE_FRAG,
      uniforms: {
        tPrev: { value: null },
        uShift: { value: new THREE.Vector2() },
        uDecay: { value: 0.98 },
        uB: { value: Array.from({ length: MAX_BENDERS }, () => new THREE.Vector4()) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.trampleMat);
    this.area = new THREE.Vector2(1e9, 1e9); // coin bas-gauche de la zone de piétinement
    this.cleared = false;

    const uniforms = {
      gCenter: { value: new THREE.Vector2() },
      gInner: { value: 0 },
      gHalf: { value: WORLD.half },
      gN: { value: terrain.n },
      gHeight: { value: terrain.tex },
      gTrample: { value: this.rtA.texture },
      gArea: { value: new THREE.Vector3(0, 0, TRAMPLE_SIZE) },
      gB: { value: Array.from({ length: MAX_BENDERS }, () => new THREE.Vector4()) },
      gWind: { value: new THREE.Vector2(0.8, 0.35) },
      nfTime: PBR.time,
    };
    this.uniforms = uniforms;
    this.meshes = [];
    this.count = 0;
    layers.forEach((cfg, li) => {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
    // La couche lointaine s'efface là où la couche dense prend le relais.
    const own = { gR: { value: cfg.r }, gInner: { value: li > 0 ? layers[0].r * 0.8 : 0 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms, own);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 gOffset;
          uniform vec2 gCenter; uniform float gR, gInner, gHalf, gN, nfTime;
          uniform sampler2D gHeight, gTrample;
          uniform vec3 gArea;
          uniform vec4 gB[${MAX_BENDERS}];
          uniform vec2 gWind;
          varying float vGT;
          varying float vGRnd;
          varying float vGDry;
          vec3 gPos;`)
        .replace('#include <beginnormal_vertex>', `
          vec2 rel = mod(gOffset.xy - gCenter + gR, 2.0 * gR) - gR;
          vec2 wxz = gCenter + rel;
          vec2 tuv = (wxz + gHalf) / (2.0 * gHalf) * (gN - 1.0) / gN + 0.5 / gN;
          vec4 td = texture2D(gHeight, tuv);
          float rnd = gOffset.z;
          float dens = td.g;
          float edge = smoothstep(1.0, 0.72, length(rel) / gR) * (gInner > 0.0 ? smoothstep(gInner * 0.85, gInner * 1.15, length(rel)) : 1.0);
          float alive = step(rnd, dens * 1.15) * edge;
          float bh = (0.32 + rnd * 0.5) * mix(0.55, 1.0, clamp(dens, 0.0, 1.0)) * alive;
          float t = uv.y;
          vGT = t;
          vGRnd = rnd;
          vGDry = 1.0 - clamp(dens, 0.0, 1.0);
          // Rotation propre à la touffe
          float a = rnd * 37.7;
          float ca = cos(a), sa = sin(a);
          vec3 lp = position;
          lp.xz = mat2(ca, -sa, sa, ca) * lp.xz;
          lp.y = 0.0;
          // Vent : rafales qui avancent + frémissement
          float gust = sin(dot(wxz, normalize(gWind)) * 0.09 - nfTime * 1.7) * 0.5 + 0.5;
          float flutter = sin(nfTime * 4.3 + rnd * 40.0 + wxz.x * 0.7) * 0.12;
          vec2 bend = normalize(gWind) * (0.15 + gust * 0.55) + vec2(flutter, flutter * 0.6);
          // Personnages proches : les brins s'écartent
          vec2 push = vec2(0.0);
          for (int i = 0; i < ${MAX_BENDERS}; i++) {
            if (gB[i].w <= 0.0) continue;
            vec2 d = wxz - gB[i].xy;
            float l = length(d);
            float k = smoothstep(gB[i].w, gB[i].w * 0.25, l) * step(abs(gB[i].z - td.r), 3.5);
            push += d / max(l, 1e-3) * k * 1.6;
          }
          // Trace laissée par Noa (se redresse lentement)
          vec2 auv = (wxz - gArea.xy) / gArea.z;
          if (auv.x > 0.0 && auv.y > 0.0 && auv.x < 1.0 && auv.y < 1.0) push += texture2D(gTrample, auv).xy * 1.5;
          float flatten = clamp(length(push), 0.0, 1.0);
          bend = bend * (1.0 - flatten * 0.7) + push;
          float bl = length(bend);
          if (bl > 1.35) bend *= 1.35 / bl;
          float hh = bh * mix(1.0, 0.45, flatten);
          vec3 off = vec3(bend.x, 0.0, bend.y) * t * t * hh * 1.1;
          float ty = t * hh * (1.0 - 0.35 * min(1.0, length(off) / max(hh, 1e-3)));
          gPos = vec3(wxz.x + lp.x * alive, td.r + ty, wxz.y + lp.z * alive) + off;
          vec3 objectNormal = normalize(vec3(bend.x * 0.35, 1.0, bend.y * 0.35));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(1.0, 0.0, 0.0);
          #endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vGT;
          varying float vGRnd;
          varying float vGDry;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 gRoot = vec3(0.05, 0.09, 0.02);
          vec3 gTip = mix(vec3(0.24, 0.34, 0.08), vec3(0.42, 0.42, 0.14), vGRnd * 0.6 + vGDry * 0.5);
          diffuseColor.rgb = mix(gRoot, gTip, smoothstep(0.0, 0.9, vGT)) * (0.85 + vGRnd * 0.3);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Translucidité : la lumière traverse les pointes (contre-jour).
          totalEmissiveRadiance += diffuseColor.rgb * vGT * vGT * 0.12;`);
    };
    mat.customProgramCacheKey = () => 'nfgrass2';
    const geo = makeGeo(cfg);
    this.count += geo.instanceCount * cfg.blades;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'grass' + li;
    scene.add(mesh);
    this.meshes.push(mesh);
    });
  }

  // center : position de la caméra ; benders : [{x, y, z, r, trample}] ; hero : position de Noa.
  update(dt, center, benders, hero) {
    const u = this.uniforms;
    u.gCenter.value.set(center.x, center.z);
    for (let i = 0; i < MAX_BENDERS; i++) {
      const b = benders[i];
      if (b) u.gB.value[i].set(b.x, b.z, b.y, b.r);
      else u.gB.value[i].set(0, 0, 0, 0);
    }
    this.#trample(dt, benders, hero);
  }

  #trample(dt, benders, hero) {
    const r = this.renderer;
    const texel = TRAMPLE_SIZE / TRAMPLE_RES;
    // Zone recentrée sur Noa, alignée sur les texels (pas de glissement).
    const ox = Math.round((hero.x - TRAMPLE_SIZE / 2) / texel) * texel;
    const oz = Math.round((hero.z - TRAMPLE_SIZE / 2) / texel) * texel;
    const m = this.trampleMat.uniforms;
    const far = Math.abs(ox - this.area.x) > TRAMPLE_SIZE || Math.abs(oz - this.area.y) > TRAMPLE_SIZE;
    m.uShift.value.set(far ? 10 : (ox - this.area.x) / TRAMPLE_SIZE, far ? 10 : (oz - this.area.y) / TRAMPLE_SIZE);
    this.area.set(ox, oz);
    m.uDecay.value = Math.exp(-dt / 2.6);
    for (let i = 0; i < MAX_BENDERS; i++) {
      const b = benders[i];
      if (b && b.trample) m.uB.value[i].set((b.x - ox) / TRAMPLE_SIZE, (b.z - oz) / TRAMPLE_SIZE, (b.r * 0.75) / TRAMPLE_SIZE, b.trample);
      else m.uB.value[i].set(0, 0, 0, 0);
    }
    m.tPrev.value = this.rtA.texture;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rtB);
    this.quad.render(r);
    r.setRenderTarget(prev);
    [this.rtA, this.rtB] = [this.rtB, this.rtA];
    this.uniforms.gTrample.value = this.rtA.texture;
    this.uniforms.gArea.value.set(ox, oz, TRAMPLE_SIZE);
  }
}
