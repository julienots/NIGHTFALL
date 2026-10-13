// Direction artistique cartoon : ombrage en aplats (3 paliers) + liseré de
// lumière (rim light) qui détache les silhouettes dans la nuit.
import * as THREE from 'three';

let ramp = null;
// Rampe d'ombrage : ombre colorée, ton moyen, pleine lumière.
function gradientMap() {
  if (ramp) return ramp;
  const data = new Uint8Array([125, 195, 255]); // ombres plus douces et plus claires
  ramp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

const cache = new Map();

// toon('#ff8844', { rim: '#ffd27a', rimPower: 2.5, emissive, emissiveIntensity, map })
export function toon(color, opts = {}) {
  const key = opts.shared === false ? null : JSON.stringify([color, opts.rim, opts.rimPower, opts.rimStrength, opts.emissive, opts.emissiveIntensity, opts.map?.uuid, opts.transparent, opts.side]);
  if (key && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(),
    map: opts.map || null,
    emissive: opts.emissive || '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    emissiveMap: opts.emissiveMap || null,
    transparent: !!opts.transparent,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.rim) addRim(m, opts.rim, opts.rimPower ?? 2.6, opts.rimStrength ?? 0.9);
  if (key) cache.set(key, m);
  return m;
}

export function addRim(material, color, power = 2.6, strength = 0.9) {
  material.userData.rim = { value: new THREE.Color(color) };
  material.userData.rimPower = { value: power };
  material.userData.rimStrength = { value: strength };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = material.userData.rim;
    shader.uniforms.rimPower = material.userData.rimPower;
    shader.uniforms.rimStrength = material.userData.rimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 rimColor; uniform float rimPower; uniform float rimStrength;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `float rimF = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
         rimF = smoothstep(0.55, 0.75, pow(rimF, rimPower / 2.0));
         outgoingLight += rimColor * rimF * rimStrength;
         #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'rim';
  material.needsUpdate = true;
  return material;
}

// Palette de la nuit de Vesper (saturée mais inquiétante).
export const PALETTE = {
  skyTop: '#140a33',
  skyMid: '#3a1a6e',
  horizon: '#ff6fa8',
  fog: '#2a1850',
  moon: '#bfe8ff',
  hemiSky: '#7a6cff',
  hemiGround: '#2a1438',
  asphalt: '#3b3561',
  sidewalk: '#6d6aa0',
  curb: '#8f8bc4',
  walls: ['#e86f6f', '#5fb7c9', '#f2b84b', '#8f7ad8', '#6fcf97', '#e98ccf', '#4f74c9'],
  windowLit: ['#ffe27a', '#ffd166', '#9ff3ff', '#ffb3e6'],
  windowDark: '#1d1640',
  trim: '#2b2050',
};
