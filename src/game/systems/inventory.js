// Inventaire : objets uniques (armes/armures) + piles de ressources,
// emplacements équipés, monnaies. Aucune dépendance au rendu.
import { ITEMS, itemStats, upgradeCost, dismantleValue, UPGRADE_MAX, RARITIES } from '../data/items.js';

export const INVENTORY_CAPACITY = 40;

export class Inventory {
  constructor(data) {
    this.items = []; // { uid, id, level, fav }
    this.stacks = {}; // id -> quantité
    this.equipped = { weapon: null, armor: null }; // uid
    this.credits = 0;
    this.shards = 0;
    this.nextUid = 1;
    this.listeners = new Set();
    if (data) this.load(data);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.listeners) fn(this);
  }

  get usedSlots() {
    return this.items.length + Object.keys(this.stacks).filter((k) => this.stacks[k] > 0).length;
  }

  isFull() {
    return this.usedSlots >= INVENTORY_CAPACITY;
  }

  // Ajoute un objet ; renvoie false si l'inventaire est plein (l'objet n'est pas perdu
  // par l'appelant qui peut le conserver ailleurs).
  add(id, qty = 1) {
    const def = ITEMS[id];
    if (!def) throw new Error(`Objet inconnu : ${id}`);
    if (def.stackable) {
      if (!this.stacks[id] && this.isFull()) return false;
      this.stacks[id] = (this.stacks[id] || 0) + qty;
    } else {
      for (let i = 0; i < qty; i++) {
        if (this.isFull()) {
          this.#emit();
          return false;
        }
        this.items.push({ uid: this.nextUid++, id, level: 0, fav: false });
      }
    }
    this.#emit();
    return true;
  }

  // Applique un butin de caisse. Renvoie la liste des entrées non ajoutées (inventaire plein).
  grant(rewards) {
    const overflow = [];
    for (const r of rewards) {
      if (r.kind === 'credits') this.credits += r.amount;
      else if (r.kind === 'shards') this.shards += r.amount;
      else if (!this.add(r.id, r.qty)) overflow.push(r);
    }
    this.#emit();
    return overflow;
  }

  count(id) {
    return this.stacks[id] || 0;
  }

  consume(id, qty = 1) {
    if (this.count(id) < qty) return false;
    this.stacks[id] -= qty;
    if (this.stacks[id] <= 0) delete this.stacks[id];
    this.#emit();
    return true;
  }

  get(uid) {
    return this.items.find((i) => i.uid === uid) || null;
  }

  equippedItem(slot) {
    return this.get(this.equipped[slot]);
  }

  equip(uid) {
    const item = this.get(uid);
    if (!item) return false;
    const slot = ITEMS[item.id].slot;
    if (!slot) return false;
    this.equipped[slot] = uid;
    this.#emit();
    return true;
  }

  unequip(slot) {
    this.equipped[slot] = null;
    this.#emit();
  }

  toggleFav(uid) {
    const item = this.get(uid);
    if (item) item.fav = !item.fav;
    this.#emit();
  }

  canUpgrade(uid) {
    const item = this.get(uid);
    if (!item || (item.level || 0) >= UPGRADE_MAX) return false;
    const cost = upgradeCost(item);
    return Object.entries(cost).every(([k, v]) => this.count(k) >= v);
  }

  upgrade(uid) {
    if (!this.canUpgrade(uid)) return false;
    const item = this.get(uid);
    for (const [k, v] of Object.entries(upgradeCost(item))) if (v) this.consume(k, v);
    item.level = (item.level || 0) + 1;
    this.#emit();
    return true;
  }

  // Démontage : impossible sur un objet équipé ou favori.
  dismantle(uid) {
    const item = this.get(uid);
    if (!item || item.fav || Object.values(this.equipped).includes(uid)) return null;
    const value = dismantleValue(item);
    this.items = this.items.filter((i) => i.uid !== uid);
    for (const [k, v] of Object.entries(value)) {
      if (v) this.stacks[k] = (this.stacks[k] || 0) + v;
    }
    this.#emit();
    return value;
  }

  // Statistiques cumulées de l'équipement porté.
  equipmentStats() {
    const total = { damage: 0, defense: 0, maxHp: 0, maxEnergy: 0, energyGain: 0, powerDamage: 0 };
    for (const slot of Object.keys(this.equipped)) {
      const item = this.equippedItem(slot);
      if (!item) continue;
      for (const [k, v] of Object.entries(itemStats(item))) total[k] = (total[k] || 0) + v;
    }
    return total;
  }

  // Liste filtrée/triée pour l'interface.
  list({ category = 'all', sort = 'rarity' } = {}) {
    const uniques = this.items.map((i) => ({ ...i, def: ITEMS[i.id], stack: false }));
    const stacks = Object.entries(this.stacks)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => ({ uid: `s:${id}`, id, qty, def: ITEMS[id], stack: true }));
    let all = [...uniques, ...stacks];
    if (category !== 'all') all = all.filter((e) => e.def.category === category);
    const rank = (e) => RARITIES.indexOf(e.def.rarity);
    const sorters = {
      rarity: (a, b) => rank(b) - rank(a) || a.def.name.localeCompare(b.def.name),
      name: (a, b) => a.def.name.localeCompare(b.def.name),
      power: (a, b) => (itemStats(b).damage || itemStats(b).defense || 0) - (itemStats(a).damage || itemStats(a).defense || 0),
    };
    all.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || sorters[sort](a, b));
    return all;
  }

  serialize() {
    return {
      items: this.items.map(({ uid, id, level, fav }) => ({ uid, id, level, fav })),
      stacks: { ...this.stacks },
      equipped: { ...this.equipped },
      credits: this.credits,
      shards: this.shards,
      nextUid: this.nextUid,
    };
  }

  load(d) {
    this.items = (d.items || []).filter((i) => ITEMS[i.id]);
    this.stacks = Object.fromEntries(Object.entries(d.stacks || {}).filter(([k]) => ITEMS[k]));
    this.equipped = { weapon: null, armor: null, ...(d.equipped || {}) };
    for (const slot of Object.keys(this.equipped)) {
      if (this.equipped[slot] != null && !this.get(this.equipped[slot])) this.equipped[slot] = null;
    }
    this.credits = d.credits || 0;
    this.shards = d.shards || 0;
    this.nextUid = Math.max(d.nextUid || 1, ...this.items.map((i) => i.uid + 1), 1);
    this.#emit();
  }
}
