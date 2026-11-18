// Fabrique de matériaux historique du projet (anciennement ombrage cartoon).
// Depuis la refonte réaliste, toon() produit un matériau PBR (voir pbr.js) :
// mêmes paramètres, même cache, mais rendu physique (rugosité, reflets du
// ciel, détails procéduraux, pluie). Le liseré cartoon (rim) est abandonné.
import { pbr } from './pbr.js';

const cache = new Map();

// toon('#ff8844', { emissive, emissiveIntensity, map, transparent, side, surface, roughness, metalness })
export function toon(color, opts = {}) {
  const key = opts.shared === false ? null : JSON.stringify([color, opts.emissive, opts.emissiveIntensity, opts.map?.uuid, opts.emissiveMap?.uuid, opts.transparent, opts.side, opts.surface, opts.roughness, opts.metalness]);
  if (key && cache.has(key)) return cache.get(key);
  const m = pbr({
    color,
    map: opts.map || null,
    emissive: opts.emissive || '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    emissiveMap: opts.emissiveMap || null,
    transparent: !!opts.transparent,
    side: opts.side,
    surface: opts.surface,
    roughness: opts.roughness,
    metalness: opts.metalness,
  });
  if (key) cache.set(key, m);
  return m;
}

// Conservé pour compatibilité : le liseré cartoon n'existe plus en rendu réaliste.
export function addRim(material) {
  return material;
}

// Palette historique de la nuit de Vesper (encore utilisée par quelques décors).
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
