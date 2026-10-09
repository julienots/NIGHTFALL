// Achat en boutique : vérifie la monnaie, la place et l'unicité, puis débite.
import { SHOP } from '../data/shop.js';

export function canBuy(entry, inv) {
  if (entry.once && inv.owns(entry.item)) return 'Déjà possédé';
  if (entry.price.credits && inv.credits < entry.price.credits) return 'Credits insuffisants';
  if (entry.price.shards && inv.shards < entry.price.shards) return 'Abyss Shards insuffisants';
  if (inv.isFull() && !inv.count(entry.item)) return 'Inventaire plein';
  return null;
}

export function buy(key, inv) {
  const entry = SHOP.find((e) => e.key === key);
  if (!entry) return { ok: false, reason: 'Article inconnu' };
  const reason = canBuy(entry, inv);
  if (reason) return { ok: false, reason };
  // L'objet d'abord : si l'ajout échoue, on ne débite rien.
  if (!inv.add(entry.item, entry.qty || 1)) return { ok: false, reason: 'Inventaire plein' };
  if (entry.price.credits) inv.credits -= entry.price.credits;
  if (entry.price.shards) inv.shards -= entry.price.shards;
  return { ok: true, entry };
}
