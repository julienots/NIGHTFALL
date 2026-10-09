// Base de données des objets. Les statistiques sont lues par l'inventaire et
// appliquées au héros ; `visual` pilote l'apparence de l'équipement en jeu.

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'abyssal'];

export const RARITY_INFO = {
  common: { label: 'Common', color: '#b9bec7', mult: 1.0 },
  uncommon: { label: 'Uncommon', color: '#5fd068', mult: 1.12 },
  rare: { label: 'Rare', color: '#3f9bff', mult: 1.28 },
  epic: { label: 'Epic', color: '#b05cff', mult: 1.48 },
  legendary: { label: 'Legendary', color: '#ffb020', mult: 1.75 },
  mythic: { label: 'Mythic', color: '#ff4d6d', mult: 2.05 },
  abyssal: { label: 'Abyssal', color: '#7cf7ff', mult: 2.4 },
};

export const CATEGORIES = {
  weapon: 'Armes',
  armor: 'Armures',
  resource: 'Ressources',
};

// slot: emplacement d'équipement ; stats de base avant multiplicateur d'amélioration.
export const ITEMS = {
  // --- Gants énergétiques (arme du vertical slice) ---
  patrol_gloves: {
    name: 'Gants de patrouille', category: 'weapon', slot: 'weapon', rarity: 'common',
    stats: { damage: 10 }, visual: { glow: '#ffb347', plate: '#8a93b8' },
    desc: 'Gants renforcés de la police de Vesper. Fiables, sans plus.',
  },
  amber_knuckles: {
    name: 'Poings Ambre', category: 'weapon', slot: 'weapon', rarity: 'uncommon',
    stats: { damage: 14, energyGain: 2 }, visual: { glow: '#fff27a', plate: '#ffb020' },
    desc: "Alliage chargé d'énergie résiduelle. Chaque coup recharge un peu d'énergie.",
  },
  eclipse_gauntlets: {
    name: 'Gantelets Éclipse', category: 'weapon', slot: 'weapon', rarity: 'rare',
    stats: { damage: 19, energyGain: 3 }, visual: { glow: '#7fe3ff', plate: '#2f7de1' },
    desc: 'Prototype Aegis. Les circuits brillent plus fort à chaque combo.',
  },
  void_phalanx: {
    name: 'Phalanges du Vide', category: 'weapon', slot: 'weapon', rarity: 'epic',
    stats: { damage: 26, energyGain: 4, powerDamage: 0.2 }, visual: { glow: '#e0a0ff', plate: '#6a3ad1' },
    desc: 'Arrachées à une créature. Amplifient Void Strike de 20 %.',
  },
  // --- Armures ---
  street_jacket: {
    name: 'Veste renforcée', category: 'armor', slot: 'armor', rarity: 'common',
    stats: { defense: 4, maxHp: 10 }, visual: { plate: '#c9563f', trim: '#ffd27a' },
    desc: 'Kevlar de récupération cousu à la main.',
  },
  aegis_plate: {
    name: 'Plastron Aegis', category: 'armor', slot: 'armor', rarity: 'rare',
    stats: { defense: 10, maxHp: 30 }, visual: { plate: '#e8ecff', trim: '#3f9bff' },
    desc: 'Plaque de confinement réutilisée. Lourde mais efficace.',
  },
  nightfall_shell: {
    name: 'Carapace Nightfall', category: 'armor', slot: 'armor', rarity: 'epic',
    stats: { defense: 15, maxHp: 45, maxEnergy: 20 }, visual: { plate: '#3a1d6e', trim: '#d08cff' },
    desc: "Tissu organique qui semble respirer. Augmente la réserve d'énergie.",
  },
  // --- Ressources ---
  scrap: {
    name: 'Ferraille', category: 'resource', rarity: 'common', stackable: true,
    desc: "Matériau d'amélioration de base. Obtenu en démontant ou dans les caisses.",
  },
  abyss_fragment: {
    name: "Fragment d'Abysse", category: 'resource', rarity: 'epic', stackable: true,
    desc: 'Cristal violet arraché aux créatures. Sert aux améliorations avancées.',
  },
  medkit: {
    name: 'Kit de soins', category: 'resource', rarity: 'uncommon', stackable: true, usable: true,
    desc: 'Restaure 50 points de vie. [H] pour utiliser.',
  },
};

export const UPGRADE_MAX = 5;

// Coût d'amélioration (niveau courant -> suivant).
export function upgradeCost(item) {
  const r = RARITIES.indexOf(ITEMS[item.id].rarity);
  const lvl = item.level || 0;
  return { scrap: 4 + lvl * 4 + r * 2, abyss_fragment: lvl >= 2 ? 1 + Math.floor(r / 2) : 0 };
}

// Statistiques effectives d'une instance (rareté + niveau d'amélioration).
export function itemStats(item) {
  const def = ITEMS[item.id];
  if (!def?.stats) return {};
  const lvlMult = 1 + (item.level || 0) * 0.12;
  const out = {};
  for (const [k, v] of Object.entries(def.stats)) {
    out[k] = k === 'powerDamage' ? v : Math.round(v * lvlMult * 10) / 10;
  }
  return out;
}

export function dismantleValue(item) {
  const r = RARITIES.indexOf(ITEMS[item.id].rarity);
  return { scrap: 2 + r * 3 + (item.level || 0) * 2, abyss_fragment: r >= 3 ? 1 : 0 };
}
