// Ciel physique de Vesper.
// - Diffusion atmosphérique simple (Rayleigh + Mie, intégrée par rayons) : bleu
//   du jour, horizons dorés, couchers de soleil et crépuscule exacts selon la
//   hauteur du soleil ; ciel nocturne éclairé par la lune.
// - Disque solaire, lune détaillée (mers, cratères, phase), halo.
// - Étoiles (tailles, couleurs, scintillement), Voie lactée, pollution
//   lumineuse de la ville, aurore abyssale et lueur de la faille (histoire).
// - Couche nuageuse procédurale éclairée (ombrage interne, liseré argenté,
//   dessous éclairé par la ville la nuit), qui dérive avec le vent.
// Le même shader sert à générer l'éclairage d'environnement (IBL) via PMREM.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const R_PLANET = 6371e3;
const R_ATMOS = 6471e3;
const K_RLH = [5.5e-6, 13.0e-6, 22.4e-6];
const K_MIE = 21e-6;

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main(){
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // toujours au plan lointain
  }
`;

const fragmentShader = /* glsl */ `
  #define PI 3.14159265
  varying vec3 vDir;
  uniform vec3 uSunDir, uMoonDir;
  uniform sampler2D uAtmo;
  uniform float uSunI, uMoonI, uTime, uNight, uCover, uCloudDark, uAurora, uRift, uPollution, uEnv, uStars;
  uniform vec3 uPollutionCol, uCloudAmb;

  float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(11.3, 7.9); a *= 0.5; } return v; }
  float fbm3(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.02 + vec2(11.3, 7.9); a *= 0.5; } return v; }

  vec2 rsi(vec3 r0, vec3 rd, float sr){
    float a = dot(rd, rd), b = 2.0 * dot(rd, r0), c = dot(r0, r0) - sr * sr;
    float d = b * b - 4.0 * a * c;
    if (d < 0.0) return vec2(1e5, -1e5);
    return vec2((-b - sqrt(d)) / (2.0 * a), (-b + sqrt(d)) / (2.0 * a));
  }

  // Diffusion simple (d'après glsl-atmosphere, domaine public).
  vec3 atmosphere(vec3 r, vec3 pSun, float iSun){
    const vec3 r0 = vec3(0.0, ${R_PLANET + 1000}.0, 0.0);
    const vec3 kRlh = vec3(${K_RLH.join(', ')});
    const float kMie = ${K_MIE};
    const float shRlh = 8e3, shMie = 1.2e3, g = 0.758;
    vec2 p = rsi(r0, r, ${R_ATMOS}.0);
    if (p.x > p.y) return vec3(0.0);
    p.y = min(p.y, rsi(r0, r, ${R_PLANET}.0).x);
    float iStep = (p.y - p.x) / float(ISTEPS);
    float iTime = 0.0;
    vec3 tRlh = vec3(0.0), tMie = vec3(0.0);
    float iOdRlh = 0.0, iOdMie = 0.0;
    float mu = dot(r, pSun), mumu = mu * mu, gg = g * g;
    float pRlh = 3.0 / (16.0 * PI) * (1.0 + mumu);
    float pMie = 3.0 / (8.0 * PI) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * g, 1.5) * (2.0 + gg));
    for (int i = 0; i < ISTEPS; i++) {
      vec3 iPos = r0 + r * (iTime + iStep * 0.5);
      float iH = length(iPos) - ${R_PLANET}.0;
      float odR = exp(-iH / shRlh) * iStep;
      float odM = exp(-iH / shMie) * iStep;
      iOdRlh += odR; iOdMie += odM;
      float jStep = rsi(iPos, pSun, ${R_ATMOS}.0).y / float(JSTEPS);
      float jTime = 0.0, jOdRlh = 0.0, jOdMie = 0.0;
      for (int j = 0; j < JSTEPS; j++) {
        vec3 jPos = iPos + pSun * (jTime + jStep * 0.5);
        float jH = length(jPos) - ${R_PLANET}.0;
        jOdRlh += exp(-jH / shRlh) * jStep;
        jOdMie += exp(-jH / shMie) * jStep;
        jTime += jStep;
      }
      vec3 attn = exp(-(kMie * (iOdMie + jOdMie) + kRlh * (iOdRlh + jOdRlh)));
      tRlh += odR * attn; tMie += odM * attn;
      iTime += iStep;
    }
    return iSun * (pRlh * kRlh * tRlh + pMie * kMie * tMie);
  }

  // Transmittance de l'atmosphère vers une direction (couleur du soleil/lune).
  vec3 transmittance(vec3 d){
    float el = max(d.y, -0.02) + 0.02;
    float airmass = 1.0 / (el + 0.15 * pow(max(degrees(asin(clamp(el, 0.0, 1.0))) + 3.885, 0.1), -1.253));
    return exp(-(vec3(${K_RLH.join(', ')}) * 8e3 + ${K_MIE} * 1.2e3 * 1.1) * airmass);
  }

  float hg(float mu, float g){ float gg = g * g; return (1.0 - gg) / (4.0 * PI * pow(1.0 + gg - 2.0 * g * mu, 1.5)); }

  void main(){
    vec3 d = normalize(vDir);
    // Sous l'horizon : on prolonge l'horizon (le sol de la ville masque le reste).
    vec3 da = vec3(d.x, max(d.y, 0.002), d.z);
    da = normalize(da);
    vec3 col = vec3(0.0);
    #ifdef USE_LUT
      // Diffusion précalculée (texture recalculée seulement quand l'heure change).
      vec2 luv = vec2(atan(da.z, da.x) / (2.0 * PI) + 0.5, sqrt(da.y));
      col = texture2D(uAtmo, luv).rgb;
    #else
      if (uSunI > 0.0) col += atmosphere(da, uSunDir, uSunI);
      if (uMoonI > 0.0) col += atmosphere(da, uMoonDir, uMoonI) * vec3(0.85, 0.92, 1.1);
    #endif
    float h = d.y;
    float skyLum = dot(col, vec3(0.2126, 0.7152, 0.0722));

    // Pollution lumineuse : la ville éclaire l'horizon et le dessous des nuages.
    float horizonGlow = exp(-max(h, 0.0) * 7.0);
    col += uPollutionCol * uPollution * horizonGlow;

    vec3 sunT = transmittance(uSunDir);
    vec3 moonT = transmittance(uMoonDir);
    float muS = dot(d, uSunDir);
    float muM = dot(d, uMoonDir);

    if (uEnv < 0.5) {
      // Étoiles (grille 3D sans couture), visibles quand le ciel est sombre.
      float starVis = uStars * (1.0 - smoothstep(0.004, 0.05, skyLum)) * smoothstep(0.0, 0.25, h);
      if (starVis > 0.0) {
        for (int k = 0; k < 2; k++) {
          float sc = k == 0 ? 220.0 : 420.0;
          vec3 q = d * sc;
          vec3 cell = floor(q);
          float rnd = hash13(cell + float(k) * 19.0);
          if (rnd > (k == 0 ? 0.985 : 0.97)) {
            vec3 c = cell + 0.5 + (vec3(hash13(cell + 1.7), hash13(cell + 4.3), hash13(cell + 8.1)) - 0.5) * 0.6;
            float dist = length(q - c);
            float mag = pow(hash13(cell + 2.9), 6.0);
            float tw = 0.75 + 0.25 * sin(uTime * (2.0 + rnd * 4.0) + rnd * 50.0);
            float temp = hash13(cell + 6.6);
            vec3 sc3 = mix(vec3(1.0, 0.75, 0.55), mix(vec3(1.0), vec3(0.7, 0.8, 1.0), smoothstep(0.5, 1.0, temp)), smoothstep(0.0, 0.5, temp));
            col += sc3 * smoothstep(0.55, 0.0, dist) * (0.4 + mag * 9.0) * tw * starVis;
          }
        }
        // Voie lactée : bande diffuse avec nuages de poussière.
        vec3 gN = normalize(vec3(0.3, 0.55, -0.78));
        float band = exp(-pow(dot(d, gN) * 4.2, 2.0));
        vec2 gp = vec2(atan(d.x, d.z) * 3.0, dot(d, gN) * 12.0);
        float mw = band * (0.55 + 0.45 * fbm3(gp * 2.0)) * (1.0 - 0.7 * smoothstep(0.45, 0.75, fbm3(gp * 4.0 + 3.0)) * band);
        col += vec3(0.62, 0.66, 0.85) * mw * 0.035 * starVis;
      }

      // Soleil : disque (assombrissement centre-bord) + auréole.
      float sunDisk = smoothstep(0.99996, 0.999975, muS);
      col += sunT * sunDisk * 60.0 * step(0.0, uSunI) * smoothstep(-0.02, 0.01, uSunDir.y);

      // Lune : disque ombré (phase gibbeuse), mers et cratères.
      float mr = 0.028;
      float ang = acos(clamp(muM, -1.0, 1.0));
      if (ang < mr * 1.02) {
        vec3 up = abs(uMoonDir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 tx = normalize(cross(up, uMoonDir));
        vec3 ty = cross(uMoonDir, tx);
        vec2 uv = vec2(dot(d, tx), dot(d, ty)) / mr;
        float rr = dot(uv, uv);
        if (rr < 1.0) {
          vec3 n = vec3(uv, sqrt(1.0 - rr));
          vec3 L = normalize(vec3(0.55, 0.25, 0.8));
          float lit = smoothstep(-0.05, 0.15, dot(n, L));
          float maria = smoothstep(0.45, 0.62, fbm(uv * 2.2 + 4.0));
          float crater = 0.0;
          for (int c = 0; c < 6; c++) {
            vec2 cc = vec2(hash12(vec2(float(c), 1.0)), hash12(vec2(float(c), 7.0))) * 1.4 - 0.7;
            float cr = 0.06 + hash12(vec2(float(c), 3.0)) * 0.12;
            float dd = length(uv - cc);
            crater += smoothstep(cr, cr * 0.7, dd) * 0.25 - smoothstep(cr * 1.15, cr, dd) * smoothstep(cr * 0.7, cr, dd) * 0.15;
          }
          float alb = 0.85 - maria * 0.35 - crater + (fbm(uv * 9.0) - 0.5) * 0.15;
          vec3 mc = vec3(0.98, 0.96, 0.92) * alb * (0.25 + 0.75 * pow(n.z, 0.35));
          float edge = smoothstep(1.0, 0.96, rr);
          col = mix(col, mc * lit * 4.0 * moonT + col * 0.6, edge * uStars);
        }
      }
    }
    // Halo de la lune (diffusion dans la brume) et éclat du soleil.
    col += moonT * vec3(0.75, 0.82, 1.0) * (pow(max(muM, 0.0), 2200.0) * 0.6 + pow(max(muM, 0.0), 60.0) * 0.05 + pow(max(muM, 0.0), 8.0) * 0.008) * uStars;
    col += sunT * pow(max(muS, 0.0), 900.0) * 3.0 * uSunI / 22.0 * (1.0 - uEnv);

    // ---------- Nuages ----------
    if (h > 0.0 && uCover > 0.0) {
      vec2 p = d.xz / (h + 0.06) * 1.3 + vec2(uTime * 0.006, uTime * 0.002);
      float n = fbm(p * 1.4);
      float thr = 1.0 - uCover;
      float dens = smoothstep(thr, thr + 0.32, n);
      if (dens > 0.0) {
        vec3 L = normalize(uSunDir.y > -0.1 ? uSunDir : uMoonDir);
        float ns = fbm(p * 1.4 + L.xz * 0.12);
        float shadow = clamp(1.0 - (ns - thr) * 2.4, 0.08, 1.0);
        float mu = dot(d, L);
        float phase = mix(hg(mu, 0.55), hg(mu, -0.2), 0.3) * 4.0 * PI;
        vec3 lightCol = uSunDir.y > -0.1 ? sunT * uSunI / 22.0 : moonT * uMoonI / 22.0 * vec3(0.8, 0.88, 1.0);
        vec3 ambient = uCloudAmb;
        vec3 base = ambient * (0.55 + 0.45 * shadow) * mix(1.0, 0.35, uCloudDark);
        vec3 lit = lightCol * shadow * phase * 2.2 * mix(1.0, 0.45, uCloudDark);
        // Liseré argenté sur les bords fins
        lit += lightCol * pow(max(mu, 0.0), 12.0) * (1.0 - dens) * 3.0;
        // Dessous éclairé par la ville la nuit
        vec3 under = uPollutionCol * uPollution * (1.4 + 1.2 * (1.0 - shadow));
        vec3 cc = base + lit + under;
        float fade = smoothstep(0.0, 0.08, h);
        col = mix(col, cc, dens * fade * 0.96);
      }
    }

    // ---------- Phénomènes de l'histoire ----------
    // Aurore abyssale : rideaux verticaux ondulants violet / cyan.
    if (uAurora > 0.0 && h > 0.05) {
      float az = atan(d.x, d.z);
      float band = 0.36 + sin(az * 3.0 + uTime * 0.05) * 0.07;
      float curtain = 0.55 + 0.45 * sin(az * 21.0 + uTime * 0.35 + sin(az * 6.0 - uTime * 0.15) * 3.0);
      float rays = 0.6 + 0.4 * noise(vec2(az * 60.0, uTime * 0.4));
      float rib = exp(-pow((h - band) * 9.0, 2.0)) * smoothstep(band - 0.1, band + 0.12, h + 0.08) * curtain * rays;
      vec3 aur = mix(vec3(0.15, 0.95, 0.8), vec3(0.65, 0.25, 1.0), smoothstep(band - 0.02, band + 0.1, h));
      col += aur * rib * 0.09 * uAurora;
    }
    // Lueur de la faille au nord (-Z).
    if (uRift > 0.0) {
      float a = max(dot(normalize(vec3(d.x, 0.0, d.z)), vec3(0.0, 0.0, -1.0)), 0.0);
      col += vec3(0.55, 0.2, 1.0) * pow(a, 40.0) * exp(-max(h, 0.0) * 5.0) * 0.12 * uRift;
    }
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

// Table de diffusion (équirectangulaire, hémisphère haut, horizon détaillé).
const lutFragment = fragmentShader
  .replace(/void main\(\)\{[\s\S]*$/, `
  varying vec2 vUv;
  void main(){
    float y = vUv.y * vUv.y;
    float a = (vUv.x - 0.5) * 2.0 * PI;
    vec3 d = normalize(vec3(cos(a) * sqrt(1.0 - y * y), max(y, 0.002), sin(a) * sqrt(1.0 - y * y)));
    vec3 col = vec3(0.0);
    if (uSunI > 0.0) col += atmosphere(d, uSunDir, uSunI);
    if (uMoonI > 0.0) col += atmosphere(d, uMoonDir, uMoonI) * vec3(0.85, 0.92, 1.1);
    gl_FragColor = vec4(col, 1.0);
  }`)
  .replace('varying vec3 vDir;', '');

// Transmittance (CPU) pour la couleur de la lumière directionnelle.
function transmittance(dir, out) {
  const el = Math.max(dir.y, -0.02) + 0.02;
  const deg = (Math.asin(Math.min(1, el)) * 180) / Math.PI;
  const airmass = 1 / (el + 0.15 * Math.pow(Math.max(deg + 3.885, 0.1), -1.253));
  const m = K_MIE * 1.2e3 * 1.1;
  out.setRGB(Math.exp(-(K_RLH[0] * 8e3 + m) * airmass), Math.exp(-(K_RLH[1] * 8e3 + m) * airmass), Math.exp(-(K_RLH[2] * 8e3 + m) * airmass));
  return out;
}

// Même diffusion que le shader, sur le CPU (couleur ambiante des nuages, brouillard).
function rsi(r0, rd, sr) {
  const a = rd.dot(rd);
  const b = 2 * rd.dot(r0);
  const c = r0.dot(r0) - sr * sr;
  const d = b * b - 4 * a * c;
  if (d < 0) return [1e5, -1e5];
  return [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
}
const _r0 = new THREE.Vector3(0, R_PLANET + 1000, 0);
const _ip = new THREE.Vector3();
const _jp = new THREE.Vector3();
export function atmosphereCPU(r, sun, iSun, out = new THREE.Color(), I = 12, J = 4) {
  const g = 0.758;
  const p = rsi(_r0, r, R_ATMOS);
  if (p[0] > p[1]) return out.setRGB(0, 0, 0);
  p[1] = Math.min(p[1], rsi(_r0, r, R_PLANET)[0]);
  const iStep = (p[1] - p[0]) / I;
  let iTime = 0;
  const tR = [0, 0, 0];
  const tM = [0, 0, 0];
  let iOdR = 0;
  let iOdM = 0;
  const mu = r.dot(sun);
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const pM = ((3 / (8 * Math.PI)) * ((1 - g * g) * (mu * mu + 1))) / (Math.pow(1 + g * g - 2 * mu * g, 1.5) * (2 + g * g));
  for (let i = 0; i < I; i++) {
    _ip.copy(r).multiplyScalar(iTime + iStep * 0.5).add(_r0);
    const iH = _ip.length() - R_PLANET;
    const odR = Math.exp(-iH / 8e3) * iStep;
    const odM = Math.exp(-iH / 1.2e3) * iStep;
    iOdR += odR;
    iOdM += odM;
    const jStep = rsi(_ip, sun, R_ATMOS)[1] / J;
    let jT = 0;
    let jR = 0;
    let jM = 0;
    for (let j = 0; j < J; j++) {
      _jp.copy(sun).multiplyScalar(jT + jStep * 0.5).add(_ip);
      const jH = _jp.length() - R_PLANET;
      jR += Math.exp(-jH / 8e3) * jStep;
      jM += Math.exp(-jH / 1.2e3) * jStep;
      jT += jStep;
    }
    for (let c = 0; c < 3; c++) {
      const attn = Math.exp(-(K_MIE * (iOdM + jM) + K_RLH[c] * (iOdR + jR)));
      tR[c] += odR * attn;
      tM[c] += odM * attn;
    }
    iTime += iStep;
  }
  return out.setRGB(...[0, 1, 2].map((c) => iSun * (pR * K_RLH[c] * tR[c] + pM * K_MIE * tM[c])));
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Sky {
  constructor(renderer, quality = 'medium') {
    this.renderer = renderer;
    const steps = { low: [6, 2], medium: [10, 3], high: [14, 4], ultra: [16, 6] }[quality] || [10, 3];
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: { ISTEPS: steps[0], JSTEPS: steps[1], USE_LUT: 1 },
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(-0.47, 0.6, 0.76).normalize() },
        uAtmo: { value: null },
        uSunI: { value: 22 },
        uMoonI: { value: 0 },
        uTime: { value: 0 },
        uNight: { value: 0 },
        uCover: { value: 0.4 },
        uCloudDark: { value: 0 },
        uAurora: { value: 0 },
        uRift: { value: 0 },
        uPollution: { value: 0 },
        uPollutionCol: { value: new THREE.Color(0.3, 0.16, 0.24) },
        uCloudAmb: { value: new THREE.Color() },
        uEnv: { value: 0 },
        uStars: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    // Table de diffusion atmosphérique (256 x 96, demi-flottants).
    this.atmoRT = new THREE.WebGLRenderTarget(256, 96, { type: THREE.HalfFloatType, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.atmoMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: lutFragment,
      defines: { ISTEPS: Math.max(steps[0], 14), JSTEPS: Math.max(steps[1], 4) },
      uniforms: this.material.uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.atmoQuad = new FullScreenQuad(this.atmoMat);
    this.material.uniforms.uAtmo.value = this.atmoRT.texture;
    this.atmoDirty = true;
    const geo = new THREE.SphereGeometry(10, 48, 24);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sky';
    // Le ciel suit la caméra (il est rendu au plan lointain, sans profondeur).
    this.mesh.onBeforeRender = (r, s, cam) => {
      this.mesh.position.copy(cam.position);
      this.mesh.updateMatrixWorld();
    };
    // Scène dédiée à la génération de l'éclairage d'environnement.
    this.envScene = new THREE.Scene();
    this.envMesh = new THREE.Mesh(geo, this.material);
    this.envMesh.frustumCulled = false;
    this.envScene.add(this.envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.envDirty = true;
    this.envT = 0;

    this.sunDir = new THREE.Vector3();
    this.moonDir = this.material.uniforms.uMoonDir.value;
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.lightColor = new THREE.Color();
    this.lightIntensity = 3;
    this.ambient = 1;
    this.exposure = 1;
    this.fogColor = new THREE.Color();
    this.night = 0;
    this.set(-1);
  }

  // v : −1 = plein jour, 0 = crépuscule doré, 1 = nuit du Nightfall.
  set(v, { rain = false, pollution = 1 } = {}) {
    this.night = v;
    const u = this.material.uniforms;
    const day = Math.max(0, -v);
    const k = Math.max(0, v);
    // Hauteur et azimut du soleil : haut le matin, rasant au crépuscule, couché la nuit.
    const elev = THREE.MathUtils.degToRad(v <= 0 ? 6 + day * 36 : 6 - k * 24);
    const az = 1.25 - v * 0.55;
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), -Math.cos(elev) * Math.cos(az)).normalize();
    u.uSunDir.value.copy(this.sunDir);
    u.uSunI.value = 22;
    u.uMoonI.value = 22 * 0.012 * smooth(0.2, 0.9, k);
    u.uStars.value = smooth(0.25, 0.9, k);
    u.uNight.value = k;
    u.uAurora.value = smooth(0.6, 1, k);
    u.uRift.value = smooth(0.5, 1, k);
    u.uCover.value = rain ? 0.78 : THREE.MathUtils.lerp(0.42, 0.55, smooth(0, 1, k));
    u.uCloudDark.value = rain ? 0.7 : 0.15 * k;
    u.uPollution.value = 0.06 * pollution * smooth(0.1, 1, k);
    // Lumière directionnelle : soleil, puis lune la nuit (changement doux).
    const s = smooth(0.35, 0.75, k);
    const sunT = transmittance(this.sunDir, new THREE.Color());
    const moonT = transmittance(this.moonDir, new THREE.Color()).multiply(new THREE.Color(0.75, 0.85, 1.0));
    this.lightDir.copy(this.sunDir).lerp(this.moonDir, s).normalize();
    if (this.lightDir.y < 0.08) this.lightDir.y = 0.08; // évite les ombres infinies au ras du sol
    this.lightDir.normalize();
    const sunAbove = smooth(-0.04, 0.06, this.sunDir.y);
    const sunI = 3.4 * sunAbove * (1 - s);
    const moonI = 0.55 * s;
    this.lightColor.copy(sunT).multiplyScalar(sunI).add(moonT.clone().multiplyScalar(moonI));
    this.lightIntensity = Math.max(1e-3, Math.max(this.lightColor.r, this.lightColor.g, this.lightColor.b));
    this.lightColor.multiplyScalar(1 / this.lightIntensity);
    // Exposition : l'œil s'adapte à la nuit (sans rendre la nuit « grise »).
    this.exposure = THREE.MathUtils.lerp(1.0, 1.25, smooth(-0.2, 0.3, v)) * THREE.MathUtils.lerp(1, 1.6, smooth(0.3, 1, k));
    // Intensité de l'éclairage d'environnement (le ciel nocturne est très sombre).
    this.ambient = THREE.MathUtils.lerp(1.0, 2.2, smooth(0.3, 1, k));
    // Couleur ambiante des nuages (zénith) et du brouillard (moyenne de l'horizon).
    const zen = new THREE.Vector3(0, 1, 0);
    const amb = atmosphereCPU(zen, this.sunDir, 22).add(atmosphereCPU(zen, this.moonDir, u.uMoonI.value).multiply(new THREE.Color(0.85, 0.92, 1.1)));
    u.uCloudAmb.value.copy(amb).multiplyScalar(1.4);
    const fog = new THREE.Color();
    const tmp = new THREE.Color();
    // Moyenne de l'horizon, en écartant la direction du soleil (brume neutre).
    let wsum = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0.06, Math.sin(a)).normalize();
      const w = 1 - smooth(-0.2, 0.8, dir.x * this.sunDir.x + dir.z * this.sunDir.z) * 0.85;
      fog.add(atmosphereCPU(dir, this.sunDir, 22, tmp, 8, 3).multiplyScalar(w));
      if (u.uMoonI.value > 0) fog.add(atmosphereCPU(dir, this.moonDir, u.uMoonI.value, tmp, 8, 3).multiplyScalar(w));
      wsum += w;
    }
    fog.multiplyScalar(1 / wsum);
    fog.multiply(new THREE.Color(0.9, 0.95, 1.06)); // brume légèrement bleutée
    fog.add(u.uPollutionCol.value.clone().multiplyScalar(u.uPollution.value));
    // Le brouillard ne doit pas être plus sombre qu'une nuit de ville humide.
    fog.r = Math.max(fog.r, 0.012);
    fog.g = Math.max(fog.g, 0.012);
    fog.b = Math.max(fog.b, 0.018);
    if (rain && k > 0.5) fog.lerp(new THREE.Color(0.03, 0.03, 0.04), 0.4);
    this.fogColor.copy(fog);
    this.envDirty = true;
    this.atmoDirty = true;
  }

  // Recalcule la table de diffusion (bon marché : 25 000 pixels).
  #bakeAtmosphere() {
    if (!this.atmoDirty) return;
    this.atmoDirty = false;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.atmoRT);
    this.atmoQuad.render(r);
    r.setRenderTarget(prev);
  }

  update(dt, time) {
    this.material.uniforms.uTime.value = time;
    this.envT -= dt;
  }

  // Régénère l'éclairage d'environnement si l'heure a changé (au plus 4 fois/s).
  envTexture(force = false) {
    this.#bakeAtmosphere();
    if ((this.envDirty && this.envT <= 0) || force || !this.envRT) {
      this.envDirty = false;
      this.envT = 0.25;
      const u = this.material.uniforms;
      u.uEnv.value = 1;
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
      u.uEnv.value = 0;
      old?.dispose();
    }
    return this.envRT.texture;
  }
}
