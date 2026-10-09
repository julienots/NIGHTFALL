// Sauvegarde versionnée et résistante à la corruption :
// 1. écriture dans un emplacement temporaire, 2. vérification par relecture,
// 3. l'ancienne sauvegarde devient la sauvegarde de secours, 4. promotion.
// Au chargement : sauvegarde principale, sinon temporaire valide, sinon secours.
export const SAVE_VERSION = 2; // v2 : nouvelle histoire (prologue lycéen)
const KEY = 'nightfall.save';

function checksum(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

function pack(data) {
  const body = JSON.stringify(data);
  return JSON.stringify({ v: SAVE_VERSION, t: Date.now(), sum: checksum(body), body });
}

function unpack(raw) {
  if (!raw) return null;
  try {
    const env = JSON.parse(raw);
    if (typeof env.body !== 'string' || checksum(env.body) !== env.sum) return null;
    return migrate(env.v, JSON.parse(env.body));
  } catch {
    return null;
  }
}

// Point d'entrée des migrations futures (v1 -> v2, ...).
function migrate(version, data) {
  if (version > SAVE_VERSION) return null;
  // v1 (histoire précédente) : chapitres incompatibles, on repart du prologue.
  if (version < 2) return null;
  return data;
}

export class SaveSystem {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  save(data) {
    const packed = pack(data);
    try {
      this.storage.setItem(`${KEY}.tmp`, packed);
      if (!unpack(this.storage.getItem(`${KEY}.tmp`))) throw new Error('Vérification de la sauvegarde échouée');
      const previous = this.storage.getItem(`${KEY}.main`);
      if (previous && unpack(previous)) this.storage.setItem(`${KEY}.backup`, previous);
      this.storage.setItem(`${KEY}.main`, packed);
      this.storage.removeItem(`${KEY}.tmp`);
      return true;
    } catch (e) {
      console.error('Échec de la sauvegarde', e);
      return false;
    }
  }

  load() {
    for (const slot of ['main', 'tmp', 'backup']) {
      const data = unpack(this.storage.getItem(`${KEY}.${slot}`));
      if (data) return { data, slot };
    }
    return null;
  }

  exists() {
    return !!this.load();
  }

  clear() {
    for (const slot of ['main', 'tmp', 'backup']) this.storage.removeItem(`${KEY}.${slot}`);
  }
}
