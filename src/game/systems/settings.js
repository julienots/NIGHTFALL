// Paramètres du joueur, sauvegardés séparément de la partie.
const KEY = 'nightfall.settings';

export const DEFAULT_SETTINGS = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  sensitivity: 1.0,
  invertY: false,
  // Téléphones : qualité basse par défaut (fluidité avant tout).
  quality: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 'low' : 'medium', // low | medium | high
  markers: true,
  shake: true,
  subtitles: true,
  textScale: 1.0,
};

export function loadSettings(storage = globalThis.localStorage) {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(storage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* stockage indisponible : les paramètres restent en mémoire */
  }
}
