// Tables de butin des caisses. Le tirage est déterministe : graine de la partie
// + identifiant de la caisse. Recharger une sauvegarde ne permet donc pas de
// « relancer » le contenu d'une caisse.
import { hashString, mulberry32, pickWeighted } from '../core/rng.js';
import { ITEMS } from '../data/items.js';

export const CRATE_TYPES = {
  supply: {
    label: 'Supply Crate', color: '#b9bec7',
    rolls: 2,
    guaranteed: [{ id: 'scrap', qty: [3, 6] }],
    table: [
      { id: 'scrap', qty: [2, 5], weight: 50 },
      { id: 'medkit', qty: [1, 1], weight: 25 },
      { id: 'street_jacket', weight: 12 },
      { id: 'amber_knuckles', weight: 10 },
      { credits: [20, 60], weight: 30 },
    ],
  },
  tactical: {
    label: 'Tactical Crate', color: '#3f9bff',
    rolls: 2,
    guaranteed: [{ id: 'eclipse_gauntlets' }, { id: 'scrap', qty: [6, 10] }],
    table: [
      { id: 'aegis_plate', weight: 30 },
      { id: 'medkit', qty: [1, 2], weight: 40 },
      { id: 'abyss_fragment', qty: [1, 1], weight: 20 },
      { credits: [80, 150], weight: 40 },
    ],
  },
  boss: {
    label: 'Cache du Colosse', color: '#ffcd20',
    rolls: 2,
    guaranteed: [{ id: 'void_phalanx' }, { shards: [10, 14] }, { id: 'abyss_fragment', qty: [3, 5] }],
    table: [
      { id: 'nightfall_shell', weight: 40 },
      { id: 'hoodie_abyss', weight: 15 },
      { credits: [200, 350], weight: 45 },
    ],
  },
  elite: {
    label: 'Elite Crate', color: '#b05cff',
    rolls: 3,
    guaranteed: [{ id: 'abyss_fragment', qty: [1, 2] }],
    table: [
      { id: 'void_phalanx', weight: 20 },
      { id: 'nightfall_shell', weight: 20 },
      { id: 'aegis_plate', weight: 25 },
      { id: 'scrap', qty: [6, 12], weight: 40 },
      { shards: [3, 6], weight: 25 },
    ],
  },
};

const randInt = (rand, [a, b]) => a + Math.floor(rand() * (b - a + 1));

function resolve(rand, entry) {
  if (entry.credits) return { kind: 'credits', amount: randInt(rand, entry.credits) };
  if (entry.shards) return { kind: 'shards', amount: randInt(rand, entry.shards) };
  if (!ITEMS[entry.id]) throw new Error(`Objet inconnu dans une table de butin : ${entry.id}`);
  return { kind: 'item', id: entry.id, qty: entry.qty ? randInt(rand, entry.qty) : 1 };
}

export function rollCrate(type, crateId, worldSeed) {
  const def = CRATE_TYPES[type];
  if (!def) throw new Error(`Type de caisse inconnu : ${type}`);
  const rand = mulberry32(hashString(`${worldSeed}:${crateId}`));
  const out = def.guaranteed.map((e) => resolve(rand, e));
  for (let i = 0; i < def.rolls; i++) out.push(resolve(rand, pickWeighted(rand, def.table)));
  return out;
}
