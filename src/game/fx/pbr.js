// Matériaux réalistes (PBR) pour tout le décor.
// Chaque matériau est un MeshStandardMaterial (rugosité / métal, éclairage
// d'environnement issu du ciel) enrichi par un shader de détail en
// coordonnées monde :
//  - variations d'albédo et de rugosité (salissures, usure) sur deux échelles ;
//  - micro-relief (bump procédural) pour casser les surfaces trop lisses ;
//  - crasse au pied des murs ;
//  - pluie : surfaces assombries, flaques miroir sur le sol (mêmes formes que
//    les réflexions écran de fx/cinematic.js) et ondes d'impact des gouttes.
// Les couleurs saturées héritées du style cartoon sont ramenées à des teintes
// crédibles (gris neutres pour l'asphalte, le béton, le métal…).
import * as THREE from 'three';

// Uniformes globaux partagés par tous les matériaux (mis à jour par Game).
export const PBR = {
  time: { value: 0 },
  wet: { value: 0 }, // 0 = sec, 1 = trempé (pluie de nuit en ville)
  rain: { value: 0 }, // intensité des impacts de gouttes
  detail: true, // shader de détail (désactivé en qualité basse)
};

export function setPbrDetail(on) {
  PBR.detail = !!on;
}

// Fonctions GLSL partagées (aussi utilisées par la passe de réflexions).
export const NOISE_GLSL = /* glsl */ `
  float nfHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float nfNoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(nfHash(i), nfHash(i + vec2(1.0, 0.0)), u.x), mix(nfHash(i + vec2(0.0, 1.0)), nfHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float nfFbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * nfNoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return v;
  }
  // Masque des flaques (sol horizontal, coordonnées monde XZ).
  float nfPuddle(vec2 xz){
    float n = nfFbm(xz * 0.16 + vec2(7.0, 3.0)) + (nfNoise(xz * 1.3) - 0.5) * 0.08;
    return smoothstep(0.54, 0.6, n);
  }
`;

// Préréglages de surface : rugosité, métal, saturation conservée, porosité
// (assombrissement sous la pluie), relief.
const SURFACES = {
  asphalt: { rough: 0.88, metal: 0, sat: 0.12, porous: 1, bump: 1.0, grime: 0.5, puddles: 1 },
  concrete: { rough: 0.86, metal: 0, sat: 0.18, porous: 0.9, bump: 0.7, grime: 1, puddles: 0.6 },
  paint: { rough: 0.55, metal: 0, sat: 0.62, porous: 0.4, bump: 0.25, grime: 0.7, puddles: 0.3 },
  plaster: { rough: 0.9, metal: 0, sat: 0.5, porous: 0.8, bump: 0.6, grime: 1, puddles: 0.3 },
  foliage: { rough: 0.8, metal: 0, sat: 0.72, porous: 0.5, bump: 1.4, grime: 0, puddles: 0 },
  metal: { rough: 0.42, metal: 0.85, sat: 0.3, porous: 0.2, bump: 0.3, grime: 0.6, puddles: 0.2 },
  glass: { rough: 0.06, metal: 0.2, sat: 0.6, porous: 0.1, bump: 0, grime: 0.2, puddles: 0 },
  plastic: { rough: 0.38, metal: 0, sat: 0.75, porous: 0.2, bump: 0.15, grime: 0.4, puddles: 0.2 },
  grass: { rough: 0.95, metal: 0, sat: 0.62, porous: 0.5, bump: 1.3, grime: 0, puddles: 0.15 },
  water: { rough: 0.03, metal: 0, sat: 0.5, porous: 0, bump: 0, grime: 0, puddles: 0 },
  emissive: { rough: 0.5, metal: 0, sat: 1, porous: 0, bump: 0, grime: 0, puddles: 0 },
};

const _hsl = { h: 0, s: 0, l: 0 };

// Devine la nature d'une surface à partir de sa couleur héritée.
function classify(color, p) {
  color.getHSL(_hsl);
  const { h, s, l } = _hsl;
  const deg = h * 360;
  if (p.emissive && (p.emissiveIntensity ?? 1) > 0.4 && new THREE.Color(p.emissive).getHSL({}).l > 0.15) return 'emissive';
  // Gris colorés (violets / bleutés) du style cartoon : béton, pierre, métal sombre.
  if (deg > 215 && deg < 300 && s < 0.6 && l < 0.62) return l < 0.3 ? 'metal' : 'concrete';
  if (s < 0.12) return l > 0.85 ? 'paint' : 'concrete';
  if (deg > 75 && deg < 170 && s > 0.2) return 'foliage';
  if (s > 0.55 && l > 0.35) return 'plastic';
  return 'paint';
}

// Ramène une couleur cartoon vers une teinte réaliste.
function realColor(color, surf) {
  color.getHSL(_hsl);
  let { h, s, l } = _hsl;
  s *= surf.sat;
  // Les aplats très clairs du cartoon deviennent des blancs cassés, les plus
  // sombres gardent du détail.
  l = 0.03 + l * 0.82;
  color.setHSL(h, s, l);
  return color;
}

const VERT_DECL = /* glsl */ `
  varying vec3 nfWPos;
  varying vec3 nfWNrm;
`;
const VERT_BODY = /* glsl */ `
  {
    mat4 nfM = modelMatrix;
    #ifdef USE_INSTANCING
      nfM = modelMatrix * instanceMatrix;
    #endif
    nfWPos = (nfM * vec4(transformed, 1.0)).xyz;
    nfWNrm = normalize(mat3(nfM) * objectNormal);
  }
`;

const FRAG_DECL = /* glsl */ `
  varying vec3 nfWPos;
  varying vec3 nfWNrm;
  uniform float nfTime, nfWet, nfRain, nfMapSat, nfColSat, nfBump, nfGrime, nfPorous, nfPuddles, nfVar;
  ${NOISE_GLSL}
  // Ondes d'impact des gouttes dans les flaques : gradient de hauteur.
  vec2 nfRipples(vec2 p, float t){
    vec2 g = vec2(0.0);
    for (int k = 0; k < 2; k++) {
      vec2 q = p * (k == 0 ? 2.2 : 3.1) + float(k) * 13.7;
      vec2 cell = floor(q);
      vec2 f = fract(q) - 0.5;
      float rnd = nfHash(cell + float(k) * 7.0);
      vec2 c = (vec2(nfHash(cell + 3.1), nfHash(cell + 5.7)) - 0.5) * 0.5;
      float ph = fract(t * (0.9 + rnd * 0.6) + rnd * 9.0);
      vec2 d = f - c;
      float r = length(d);
      float wave = sin((r - ph * 0.45) * 60.0) * exp(-abs(r - ph * 0.45) * 30.0) * (1.0 - ph);
      g += normalize(d + 1e-4) * wave;
    }
    return g;
  }
`;

// Albédo (après lecture de la texture) : variations, crasse, assombrissement humide.
const FRAG_ALBEDO = /* glsl */ `
  #if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )
    diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, nfColSat);
  #endif
  vec3 nfN = normalize(nfWNrm);
  float nfUp = smoothstep(0.65, 0.95, nfN.y);
  vec2 nfUv = abs(nfN.y) > 0.6 ? nfWPos.xz : (abs(nfN.x) > abs(nfN.z) ? nfWPos.zy : nfWPos.xy);
  float nfLarge = nfFbm(nfUv * 0.22);
  float nfFine = nfNoise(nfUv * 4.7);
  diffuseColor.rgb *= 1.0 + ((nfLarge - 0.5) * 0.42 + (nfFine - 0.5) * 0.16) * nfVar;
  // Crasse au pied des murs et coulures sous les rebords.
  float nfDirt = (1.0 - smoothstep(0.0, 1.4, nfWPos.y)) * (1.0 - nfUp) * 0.35;
  nfDirt += smoothstep(0.62, 0.9, nfNoise(vec2(nfUv.x * 3.0, nfUv.y * 0.25))) * (1.0 - abs(nfN.y)) * 0.12;
  diffuseColor.rgb *= 1.0 - nfDirt * nfGrime;
  float nfPud = nfPuddle(nfWPos.xz) * nfUp * nfPuddles;
  float nfWetK = nfWet * mix(0.55, 1.0, nfUp);
  diffuseColor.rgb *= mix(1.0, mix(1.0 - 0.38 * nfPorous, 0.5, nfPud), nfWetK);
`;

// Rugosité (après roughnessmap_fragment).
const FRAG_ROUGH = /* glsl */ `
  roughnessFactor = clamp(roughnessFactor + (nfLarge - 0.5) * 0.3 * nfVar + (nfFine - 0.5) * 0.08 * nfVar, 0.03, 1.0);
  roughnessFactor = mix(roughnessFactor, mix(roughnessFactor * 0.45, 0.025, nfPud), nfWetK * mix(0.5, 1.0, nfPorous));
`;

// Relief (après normal_fragment_maps) : bump procédural et ondes de pluie.
const FRAG_NORMAL = /* glsl */ `
  {
    float e = 0.04;
    vec2 bp = nfUv * 3.3;
    float h0 = nfNoise(bp * 2.0) + nfNoise(bp * 7.0) * 0.5;
    float hx = nfNoise((bp + vec2(e, 0.0)) * 2.0) + nfNoise((bp + vec2(e, 0.0)) * 7.0) * 0.5;
    float hy = nfNoise((bp + vec2(0.0, e)) * 2.0) + nfNoise((bp + vec2(0.0, e)) * 7.0) * 0.5;
    vec2 grad = vec2(hx - h0, hy - h0) / e * 0.012 * nfBump * (1.0 - nfPud * nfWetK);
    vec2 rip = nfRipples(nfWPos.xz, nfTime) * nfPud * nfRain * nfUp * 0.35;
    vec3 bw;
    if (abs(nfN.y) > 0.6) bw = vec3(grad.x + rip.x, 0.0, grad.y + rip.y);
    else if (abs(nfN.x) > abs(nfN.z)) bw = vec3(0.0, grad.y, grad.x);
    else bw = vec3(grad.x, grad.y, 0.0);
    normal = normalize(normal - (viewMatrix * vec4(bw, 0.0)).xyz);
  }
`;

const MAP_FRAGMENT = /* glsl */ `
  #ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D(map, vMapUv);
    sampledDiffuseColor.rgb = mix(vec3(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), sampledDiffuseColor.rgb, nfMapSat);
    diffuseColor *= sampledDiffuseColor;
  #endif
`;

function injectDetail(m, surf, mapSat) {
  const u = {
    nfMapSat: { value: mapSat },
    nfColSat: { value: Math.min(1, surf.sat + 0.2) },
    nfBump: { value: surf.bump },
    nfGrime: { value: surf.grime },
    nfPorous: { value: surf.porous },
    nfPuddles: { value: surf.puddles },
    nfVar: { value: surf.bump > 0 ? 1 : 0.3 },
  };
  m.userData.pbr = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { nfTime: PBR.time, nfWet: PBR.wet, nfRain: PBR.rain });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', VERT_BODY + '\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <map_fragment>', MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', FRAG_ALBEDO + '\n#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL);
  };
  m.customProgramCacheKey = () => 'nfpbr1';
}

// Désaturation simple de la texture (qualité basse, sans shader de détail).
function injectMapSat(m, mapSat) {
  const u = { nfMapSat: { value: mapSat } };
  m.userData.pbr = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float nfMapSat;')
      .replace('#include <map_fragment>', MAP_FRAGMENT);
  };
  m.customProgramCacheKey = () => 'nfpbr0';
}

const COPY = ['map', 'emissiveMap', 'emissiveIntensity', 'transparent', 'opacity', 'side', 'wireframe', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'depthWrite', 'depthTest', 'alphaTest', 'roughnessMap', 'normalMap', 'vertexColors', 'flatShading', 'fog'];

// Crée un matériau réaliste. p : paramètres « standard » + surface (facultatif).
export function pbr(p = {}) {
  const m = new THREE.MeshStandardMaterial();
  for (const k of COPY) if (p[k] !== undefined) m[k] = p[k];
  if (p.color !== undefined) m.color.set(p.color);
  if (p.emissive !== undefined) m.emissive.set(p.emissive);
  const kind = p.surface || classify(m.color, p);
  const surf = SURFACES[kind] || SURFACES.paint;
  m.userData.surface = kind;
  if (kind !== 'emissive' && p.keepColor !== true) realColor(m.color, surf);
  m.roughness = p.roughness ?? surf.rough;
  m.metalness = p.metalness ?? surf.metal;
  // Les émissifs (néons, fenêtres) gardent leur éclat : lumière HDR + halo.
  if (kind === 'emissive') m.emissiveIntensity = (p.emissiveIntensity ?? 1) * 1.6;
  const mapSat = p.map ? Math.min(1, surf.sat + 0.25) : 1;
  const detailed = PBR.detail && !m.transparent && !m.wireframe && kind !== 'emissive' && p.detail !== false;
  if (detailed) injectDetail(m, surf, mapSat);
  else if (p.map) injectMapSat(m, mapSat);
  return m;
}
