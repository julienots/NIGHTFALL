// Catalogue de la boutique (terminal de Mara au refuge).
// price : { credits } ou { shards }. once : achat unique (tenues).
export const SHOP_SECTIONS = {
  featured: 'À la une',
  weapons: 'Noyaux',
  armor: 'Protections',
  skins: 'Tenues',
  gifts: 'Cadeaux',
  resources: 'Ressources',
};

export const SHOP = [
  { key: 'pack_medkits', section: 'featured', label: 'Trousse de Mara', item: 'medkit', qty: 3, price: { credits: 140 }, desc: '3 kits de soins, prix d’ami.' },
  { key: 'pack_scrap', section: 'featured', label: 'Lot de ferraille', item: 'scrap', qty: 12, price: { credits: 160 }, desc: 'De quoi améliorer un noyau ou une protection.' },
  { key: 'core_amber', section: 'weapons', item: 'amber_knuckles', price: { credits: 350 } },
  { key: 'core_eclipse', section: 'weapons', item: 'eclipse_gauntlets', price: { credits: 900 } },
  { key: 'core_void', section: 'weapons', item: 'void_phalanx', price: { shards: 25 } },
  { key: 'armor_jacket', section: 'armor', item: 'street_jacket', price: { credits: 250 } },
  { key: 'armor_aegis', section: 'armor', item: 'aegis_plate', price: { credits: 800 } },
  { key: 'armor_shell', section: 'armor', item: 'nightfall_shell', price: { shards: 30 } },
  { key: 'skin_midnight', section: 'skins', item: 'hoodie_midnight', price: { credits: 180 }, once: true },
  { key: 'skin_ember', section: 'skins', item: 'hoodie_ember', price: { credits: 300 }, once: true },
  { key: 'skin_lime', section: 'skins', item: 'hoodie_lime', price: { credits: 300 }, once: true },
  { key: 'skin_abyss', section: 'skins', item: 'hoodie_abyss', price: { shards: 20 }, once: true },
  { key: 'gift_flowers', section: 'gifts', item: 'gift_flowers', qty: 1, price: { credits: 45 } },
  { key: 'gift_choco', section: 'gifts', item: 'gift_choco', qty: 1, price: { credits: 30 } },
  { key: 'gift_comic', section: 'gifts', item: 'gift_comic', qty: 1, price: { credits: 70 } },
  { key: 'gift_starmap', section: 'gifts', item: 'gift_starmap', qty: 1, price: { credits: 85 } },
  { key: 'gift_game', section: 'gifts', item: 'gift_game', qty: 1, price: { credits: 110 } },
  { key: 'res_medkit', section: 'resources', item: 'medkit', qty: 1, price: { credits: 55 } },
  { key: 'res_scrap', section: 'resources', item: 'scrap', qty: 5, price: { credits: 75 } },
  { key: 'res_fragment', section: 'resources', item: 'abyss_fragment', qty: 1, price: { shards: 6 } },
];
