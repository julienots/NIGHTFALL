// Chaîne de rendu « cinéma » (HDR linéaire, avant le bloom et la tonalité) :
//  - ScenePass : rendu de la scène en HDR avec anticrénelage MSAA et texture
//    de profondeur (partagée par les effets suivants) ;
//  - occlusion ambiante (SSAO) à mi-résolution + flou bilatéral ;
//  - réflexions écran (SSR) sur le sol mouillé : flaques miroir (mêmes formes
//    que dans les matériaux, voir pbr.js), asphalte luisant sous la pluie ;
//  - rayons crépusculaires (soleil / lune derrière les immeubles et nuages) ;
//  - diffusion du soleil dans la brume (halo atmosphérique) ;
//  - flou de mouvement de caméra (reprojection de la profondeur).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { NOISE_GLSL } from './pbr.js';

export const FX_QUALITY = {
  low: { samples: 0, ao: 0, ssr: 0, shafts: 0, mb: false },
  medium: { samples: 2, ao: 8, ssr: 0, shafts: 16, mb: false },
  high: { samples: 4, ao: 12, ssr: 24, shafts: 28, mb: true },
  ultra: { samples: 4, ao: 16, ssr: 40, shafts: 40, mb: true },
};

// ---------- Rendu de la scène avec profondeur ----------
export class ScenePass extends Pass {
  constructor(scene, camera, samples = 4) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthTexture: depth, depthBuffer: true });
    this.rt.texture.name = 'Scene.color';
  }

  get depthTexture() {
    return this.rt.depthTexture;
  }

  setSamples(n) {
    if (this.rt.samples === n) return;
    this.rt.samples = n;
    this.rt.dispose();
  }

  setSize(w, h) {
    this.rt.setSize(w, h);
  }

  render(renderer) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.rt.dispose();
  }
}

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMMON = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uInvProj, uProj;
  float rawDepth(vec2 uv){ return texture2D(tDepth, uv).x; }
  vec3 viewPos(vec2 uv, float d){ vec4 v = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
  vec3 viewNormal(vec2 uv, vec3 P, vec2 px){
    vec3 r = viewPos(uv + vec2(px.x, 0.0), rawDepth(uv + vec2(px.x, 0.0)));
    vec3 l = viewPos(uv - vec2(px.x, 0.0), rawDepth(uv - vec2(px.x, 0.0)));
    vec3 u = viewPos(uv + vec2(0.0, px.y), rawDepth(uv + vec2(0.0, px.y)));
    vec3 d = viewPos(uv - vec2(0.0, px.y), rawDepth(uv - vec2(0.0, px.y)));
    vec3 dx = abs(r.z - P.z) < abs(P.z - l.z) ? r - P : P - l;
    vec3 dy = abs(u.z - P.z) < abs(P.z - d.z) ? u - P : P - d;
    vec3 n = normalize(cross(dx, dy));
    return dot(n, P) > 0.0 ? -n : n;
  }
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// ---------- Occlusion ambiante ----------
const AOShader = {
  defines: { SAMPLES: 12 },
  uniforms: { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uRadius: { value: 0.9 }, uIntensity: { value: 1.0 } },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform vec2 uRes; uniform float uRadius, uIntensity;
    ${COMMON}
    void main(){
      float d = rawDepth(vUv);
      if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 P = viewPos(vUv, d);
      vec2 px = 1.0 / uRes;
      vec3 N = viewNormal(vUv, P, px);
      float rs = min(uRadius * uProj[1][1] * 0.5 / -P.z, 0.15);
      float aspect = uRes.y / uRes.x;
      float ang = ign(gl_FragCoord.xy) * 6.2831;
      float occ = 0.0;
      for (int i = 0; i < SAMPLES; i++) {
        float t = (float(i) + 0.5) / float(SAMPLES);
        float a = ang + float(i) * 2.39996;
        vec2 off = vec2(cos(a) * aspect, sin(a)) * rs * sqrt(t);
        vec2 suv = vUv + off;
        vec3 S = viewPos(suv, rawDepth(suv));
        vec3 v = S - P;
        float len = length(v);
        float f = max(0.0, dot(v / max(len, 1e-4), N) - 0.12);
        occ += f * (1.0 - smoothstep(uRadius * 0.6, uRadius * 1.6, len));
      }
      float ao = clamp(1.0 - uIntensity * occ / float(SAMPLES) * 1.6, 0.0, 1.0);
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }`,
};

const BlurShader = {
  uniforms: { tAO: { value: null }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uDir: { value: new THREE.Vector2() } },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tAO; uniform vec2 uDir;
    ${COMMON}
    void main(){
      float z0 = viewPos(vUv, rawDepth(vUv)).z;
      float sum = 0.0, wsum = 0.0;
      for (int i = -3; i <= 3; i++) {
        vec2 uv = vUv + uDir * float(i);
        float z = viewPos(uv, rawDepth(uv)).z;
        float w = exp(-float(i * i) * 0.12) * (1.0 / (1e-3 + abs(z - z0) * 4.0 / max(-z0, 1.0)));
        sum += texture2D(tAO, uv).r * w;
        wsum += w;
      }
      float ao = sum / max(wsum, 1e-4);
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }`,
};

// ---------- Composition HDR ----------
const CompositeShader = {
  defines: { SSR_STEPS: 24, SHAFT_STEPS: 24, USE_SSR: 1, USE_SHAFTS: 1, USE_MB: 1 },
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    tAO: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uProj: { value: new THREE.Matrix4() },
    uInvView: { value: new THREE.Matrix4() },
    uPrevViewProj: { value: new THREE.Matrix4() },
    uRes: { value: new THREE.Vector2() },
    uAO: { value: 0.85 },
    uWet: { value: 0 },
    uSSR: { value: 1 },
    uSunUv: { value: new THREE.Vector2() },
    uShaft: { value: 0 },
    uShaftCol: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() },
    uHaloCol: { value: new THREE.Color() },
    uFogDensity: { value: 0.003 },
    uMB: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tColor, tAO;
    uniform mat4 uInvView, uPrevViewProj;
    uniform vec2 uRes, uSunUv;
    uniform float uAO, uWet, uSSR, uShaft, uFogDensity, uMB, uTime;
    uniform vec3 uShaftCol, uSunDir, uHaloCol;
    ${COMMON}
    ${NOISE_GLSL}
    void main(){
      vec2 px = 1.0 / uRes;
      float d = rawDepth(vUv);
      bool sky = d >= 0.99999;
      vec3 col = texture2D(tColor, vUv).rgb;
      vec3 P = viewPos(vUv, d);
      vec3 W = (uInvView * vec4(P, 1.0)).xyz;
      vec3 camW = (uInvView * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

      #if USE_MB
      // Flou de mouvement de la caméra (le héros, proche, reste net).
      if (uMB > 0.0) {
        vec4 pc = uPrevViewProj * vec4(sky ? camW + normalize(W - camW) * 1000.0 : W, 1.0);
        vec2 prev = pc.xy / pc.w * 0.5 + 0.5;
        vec2 vel = (vUv - prev) * uMB;
        float near = sky ? 1.0 : smoothstep(6.5, 12.0, -P.z);
        vel *= near;
        float vl = length(vel);
        if (vl > 0.04) vel *= 0.04 / vl;
        if (vl * uRes.x > 1.0) {
          vec3 acc = col;
          float j = ign(gl_FragCoord.xy + uTime * 60.0);
          for (int i = 1; i < 8; i++) {
            float t = (float(i) + j) / 8.0 - 0.5;
            acc += texture2D(tColor, vUv - vel * t).rgb;
          }
          col = acc / 8.0;
        }
      }
      #endif

      if (!sky) {
        // Occlusion ambiante (contact des objets, coins, pieds des murs).
        float ao = texture2D(tAO, vUv).r;
        col *= mix(1.0, ao, uAO);

        #if USE_SSR
        // Réflexions écran sur sol mouillé.
        if (uWet > 0.01 && uSSR > 0.0) {
          vec3 N = viewNormal(vUv, P, px);
          vec3 Nw = normalize(mat3(uInvView) * N);
          if (Nw.y > 0.92) {
            float pud = smoothstep(0.54, 0.6, nfFbm(W.xz * 0.16 + vec2(7.0, 3.0)) + (nfNoise(W.xz * 1.3) - 0.5) * 0.08);
            float wetMask = uWet * mix(0.3, 1.0, pud);
            vec3 V = normalize(P);
            float F = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
            vec3 R = normalize(reflect(V, N));
            // Rugosité : l'asphalte simplement mouillé floute un peu le reflet.
            R = normalize(R + (vec3(nfNoise(W.xz * 3.0), 0.0, nfNoise(W.zx * 3.0 + 5.0)) - 0.5) * 0.05 * (1.0 - pud));
            vec3 O = P + N * 0.03;
            float jit = 0.5;
            vec2 hitUv = vec2(-1.0);
            float prevT = 0.0;
            for (int i = 0; i < SSR_STEPS; i++) {
              float t = (float(i) + jit) / float(SSR_STEPS);
              float dist = 0.3 + t * t * 80.0;
              vec3 Q = O + R * dist;
              if (Q.z > -0.1) break;
              vec4 c = uProj * vec4(Q, 1.0);
              vec2 uvq = c.xy / c.w * 0.5 + 0.5;
              if (uvq.x < 0.0 || uvq.x > 1.0 || uvq.y < 0.0 || uvq.y > 1.0) break;
              float sd = rawDepth(uvq);
              if (sd >= 0.99999) { prevT = dist; continue; }
              float sz = viewPos(uvq, sd).z;
              float thick = 0.4 + dist * 0.08;
              if (Q.z < sz && sz - Q.z < thick) {
                // Affinage par dichotomie
                float a = prevT, b = dist;
                for (int k = 0; k < 4; k++) {
                  float m = (a + b) * 0.5;
                  vec3 Qm = O + R * m;
                  vec4 cm = uProj * vec4(Qm, 1.0);
                  vec2 um = cm.xy / cm.w * 0.5 + 0.5;
                  if (Qm.z < viewPos(um, rawDepth(um)).z) b = m; else a = m;
                  uvq = um;
                }
                hitUv = uvq;
                break;
              }
              prevT = dist;
            }
            if (hitUv.x >= 0.0) {
              vec2 e = smoothstep(0.0, 0.08, hitUv) * smoothstep(1.0, 0.92, hitUv);
              float fade = e.x * e.y * smoothstep(0.0, 0.25, -R.z + 0.6);
              vec3 refl = texture2D(tColor, hitUv).rgb;
              col = mix(col, refl * mix(0.55, 0.9, pud), clamp(F * 1.6 + pud * 0.25, 0.0, 1.0) * wetMask * fade * uSSR);
            }
          }
        }
        #endif

        // Diffusion du soleil / de la lune dans la brume (halo atmosphérique).
        vec3 vd = normalize(W - camW);
        float dist = length(W - camW);
        float fogK = 1.0 - exp(-dist * uFogDensity * 1.4);
        float mie = pow(max(dot(vd, uSunDir), 0.0), 6.0) * 0.8 + pow(max(dot(vd, uSunDir), 0.0), 40.0) * 2.0;
        col += uHaloCol * mie * fogK;
      }

      #if USE_SHAFTS
      // Rayons crépusculaires : on marche vers la source lumineuse en ne
      // gardant que les pixels de ciel (les bâtiments font de l'ombre).
      if (uShaft > 0.0) {
        vec2 delta = (uSunUv - vUv) / float(SHAFT_STEPS) * 0.85;
        vec2 uv = vUv + delta * ign(gl_FragCoord.xy);
        float illum = 1.0, acc = 0.0;
        vec3 sacc = vec3(0.0);
        for (int i = 0; i < SHAFT_STEPS; i++) {
          uv += delta;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
          float m = step(0.99999, rawDepth(uv));
          vec2 dd = (uv - uSunUv) * vec2(uRes.x / uRes.y, 1.0);
          float g = exp(-dot(dd, dd) * 6.0);
          sacc += min(texture2D(tColor, uv).rgb, vec3(6.0)) * m * g * illum;
          illum *= 0.96;
        }
        col += sacc / float(SHAFT_STEPS) * uShaftCol * uShaft;
      }
      #endif
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class CinematicPass extends Pass {
  constructor(scenePass, camera, quality = 'high') {
    super();
    this.scenePass = scenePass;
    this.camera = camera;
    this.aoRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.aoRT2 = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.white.needsUpdate = true;
    this.aoMat = new THREE.ShaderMaterial({ ...AOShader, uniforms: THREE.UniformsUtils.clone(AOShader.uniforms), defines: { ...AOShader.defines }, depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ ...BlurShader, uniforms: THREE.UniformsUtils.clone(BlurShader.uniforms), depthTest: false, depthWrite: false });
    this.mat = new THREE.ShaderMaterial({ ...CompositeShader, uniforms: THREE.UniformsUtils.clone(CompositeShader.uniforms), defines: { ...CompositeShader.defines }, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat);
    this.prevVP = new THREE.Matrix4();
    this.hasPrev = false;
    this.lastCamPos = new THREE.Vector3();
    this.w = 1;
    this.h = 1;
    this.state = { wet: 0, sunDir: new THREE.Vector3(0, 1, 0), shaftCol: new THREE.Color(), haloCol: new THREE.Color(), shaft: 0, fogDensity: 0.003, time: 0, mbScale: 1 };
    this.setQuality(quality);
  }

  setQuality(q) {
    const cfg = FX_QUALITY[q] || FX_QUALITY.high;
    this.cfg = cfg;
    const d = this.mat.defines;
    const next = { SSR_STEPS: Math.max(1, cfg.ssr), SHAFT_STEPS: Math.max(1, cfg.shafts), USE_SSR: cfg.ssr > 0 ? 1 : 0, USE_SHAFTS: cfg.shafts > 0 ? 1 : 0, USE_MB: cfg.mb ? 1 : 0 };
    if (Object.keys(next).some((k) => d[k] !== next[k])) {
      Object.assign(d, next);
      this.mat.needsUpdate = true;
    }
    if (cfg.ao && this.aoMat.defines.SAMPLES !== cfg.ao) {
      this.aoMat.defines.SAMPLES = cfg.ao;
      this.aoMat.needsUpdate = true;
    }
    this.scenePass.setSamples(cfg.samples);
    this.setSize(this.w, this.h);
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    const s = this.cfg?.ao >= 16 ? 1 : 0.5;
    this.aoRT.setSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    this.aoRT2.setSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    this.mat.uniforms.uRes.value.set(w, h);
    this.aoMat.uniforms.uRes.value.set(this.aoRT.width, this.aoRT.height);
  }

  // Coupe (téléportation, changement de zone) : pas de flou de mouvement.
  resetHistory() {
    this.hasPrev = false;
  }

  render(renderer, writeBuffer) {
    const cam = this.camera;
    const depth = this.scenePass.depthTexture;
    const u = this.mat.uniforms;
    cam.updateMatrixWorld();
    const inv = cam.projectionMatrixInverse;
    const proj = cam.projectionMatrix;
    // --- Occlusion ambiante ---
    if (this.cfg.ao > 0) {
      const a = this.aoMat.uniforms;
      a.tDepth.value = depth;
      a.uInvProj.value.copy(inv);
      a.uProj.value.copy(proj);
      this.quad.material = this.aoMat;
      renderer.setRenderTarget(this.aoRT);
      this.quad.render(renderer);
      const b = this.blurMat.uniforms;
      b.tDepth.value = depth;
      b.uInvProj.value.copy(inv);
      b.uProj.value.copy(proj);
      this.quad.material = this.blurMat;
      b.tAO.value = this.aoRT.texture;
      b.uDir.value.set(1 / this.aoRT.width, 0);
      renderer.setRenderTarget(this.aoRT2);
      this.quad.render(renderer);
      b.tAO.value = this.aoRT2.texture;
      b.uDir.value.set(0, 1 / this.aoRT.height);
      renderer.setRenderTarget(this.aoRT);
      this.quad.render(renderer);
      u.tAO.value = this.aoRT.texture;
      u.uAO.value = 0.9;
    } else {
      u.tAO.value = this.white;
      u.uAO.value = 0;
    }
    // --- Composition ---
    const s = this.state;
    u.tColor.value = this.scenePass.rt.texture;
    u.tDepth.value = depth;
    u.uInvProj.value.copy(inv);
    u.uProj.value.copy(proj);
    u.uInvView.value.copy(cam.matrixWorld);
    u.uWet.value = s.wet;
    u.uSSR.value = 1;
    u.uTime.value = s.time;
    u.uFogDensity.value = s.fogDensity;
    u.uSunDir.value.copy(s.sunDir);
    u.uHaloCol.value.copy(s.haloCol);
    // Position écran de la source des rayons (devant la caméra uniquement).
    _v.copy(s.sunDir).multiplyScalar(1000).add(cam.position).project(cam);
    const facing = cam.getWorldDirection(new THREE.Vector3()).dot(s.sunDir);
    u.uSunUv.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
    u.uShaft.value = this.cfg.shafts > 0 && facing > 0 ? s.shaft * THREE.MathUtils.smoothstep(facing, 0.0, 0.5) : 0;
    u.uShaftCol.value.copy(s.shaftCol);
    // Flou de mouvement : matrice vue-projection de l'image précédente.
    const vp = _m.multiplyMatrices(proj, cam.matrixWorldInverse);
    const jump = this.lastCamPos.distanceTo(cam.position) > 6;
    u.uPrevViewProj.value.copy(this.hasPrev && !jump ? this.prevVP : vp);
    u.uMB.value = this.cfg.mb ? 0.55 * s.mbScale : 0;
    this.prevVP.copy(vp);
    this.lastCamPos.copy(cam.position);
    this.hasPrev = true;
    this.quad.material = this.mat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.aoRT.dispose();
    this.aoRT2.dispose();
    this.aoMat.dispose();
    this.blurMat.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
