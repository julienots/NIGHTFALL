import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, INVENTORY_CAPACITY } from '../src/game/systems/inventory.js';
import { rollCrate, CRATE_TYPES } from '../src/game/systems/loot.js';
import { Progression, xpForLevel } from '../src/game/systems/progression.js';
import { MissionLog } from '../src/game/systems/missions.js';
import { SaveSystem } from '../src/game/systems/save.js';
import { ITEMS } from '../src/game/data/items.js';

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

test('équiper une arme modifie réellement les statistiques', () => {
  const inv = new Inventory();
  inv.add('patrol_gloves');
  inv.add('eclipse_gauntlets');
  const [a, b] = inv.items;
  inv.equip(a.uid);
  const d1 = inv.equipmentStats().damage;
  inv.equip(b.uid);
  const d2 = inv.equipmentStats().damage;
  assert.ok(d2 > d1, `${d2} > ${d1}`);
  assert.equal(inv.equipped.weapon, b.uid);
});

test('inventaire plein : refuse les nouveaux objets sans planter', () => {
  const inv = new Inventory();
  for (let i = 0; i < INVENTORY_CAPACITY; i++) assert.equal(inv.add('patrol_gloves'), true);
  assert.equal(inv.isFull(), true);
  assert.equal(inv.add('aegis_plate'), false);
  const overflow = inv.grant([{ kind: 'item', id: 'medkit', qty: 1 }, { kind: 'credits', amount: 50 }]);
  assert.equal(overflow.length, 1);
  assert.equal(inv.credits, 50, 'les monnaies passent même inventaire plein');
});

test('amélioration consomme les ressources et augmente les stats', () => {
  const inv = new Inventory();
  inv.add('patrol_gloves');
  const uid = inv.items[0].uid;
  assert.equal(inv.canUpgrade(uid), false);
  inv.add('scrap', 50);
  const before = inv.count('scrap');
  assert.equal(inv.upgrade(uid), true);
  assert.equal(inv.get(uid).level, 1);
  assert.ok(inv.count('scrap') < before);
});

test('démontage interdit sur un objet équipé ou favori', () => {
  const inv = new Inventory();
  inv.add('patrol_gloves');
  inv.add('amber_knuckles');
  const [a, b] = inv.items;
  inv.equip(a.uid);
  assert.equal(inv.dismantle(a.uid), null);
  inv.toggleFav(b.uid);
  assert.equal(inv.dismantle(b.uid), null);
  inv.toggleFav(b.uid);
  assert.ok(inv.dismantle(b.uid).scrap > 0);
  assert.equal(inv.items.length, 1);
});

test('butin de caisse déterministe et valide', () => {
  for (const type of Object.keys(CRATE_TYPES)) {
    const r1 = rollCrate(type, 'crate_x', 1234);
    const r2 = rollCrate(type, 'crate_x', 1234);
    assert.deepEqual(r1, r2);
    for (const r of r1) if (r.kind === 'item') assert.ok(ITEMS[r.id]);
  }
  assert.ok(rollCrate('tactical', 'a', 1).some((r) => r.id === 'eclipse_gauntlets'), 'contenu garanti');
});

test('progression : montée de niveau et points de compétence', () => {
  const p = new Progression();
  const lv = p.addXp(xpForLevel(1) + xpForLevel(2) + 5);
  assert.equal(lv, 2);
  assert.equal(p.level, 3);
  assert.equal(p.skillPoints, 2);
  assert.equal(p.xp, 5);
});

test('missions : prologue, chaînage et types d’étapes', () => {
  const log = new MissionLog();
  const targets = (n) => ({ rally: { x: 0, z: 0 }, parking_entry: { x: 20, z: -14 }, lumen_roof: { x: 50, y: 26, z: 45 }, safehouse: { x: -34, z: 24 } })[n];
  assert.equal(log.tracked, 'p01_after_school');
  assert.equal(log.state.m01_first_contact, undefined, 'chapitre 1 verrouillé au début');
  assert.equal(log.checkPosition({ x: 1, y: 0, z: 0 }, targets).length, 0, 'pas de raccourci : il faut d’abord finir le cours');
  log.handle({ type: 'event', id: 'class_over' });
  log.handle({ type: 'interact', target: 'malik' });
  log.handle({ type: 'interact', target: 'locker' });
  log.handle({ type: 'interact', target: 'ines' });
  const ev = log.checkPosition({ x: 1, y: 0, z: 0 }, targets);
  assert.ok(ev.some((e) => e.type === 'missionStart' && e.id === 'p02_nightfall'));
  assert.equal(log.tracked, 'p02_nightfall');
  log.checkPosition({ x: 20, y: 0, z: -14 }, targets);
  log.handle({ type: 'interact', target: 'aegis_case' });
  assert.equal(log.tracked, 'p03_rings');
  log.handle({ type: 'kill', group: 'chaser', enemyType: 'stalker' });
  assert.equal(log.state.c01_stalker_hunt, undefined);
  for (const id of ['volley', 'shield', 'magnet_throw', 'flight']) log.handle({ type: 'event', id });
  assert.equal(log.checkPosition({ x: 50, y: 10, z: 45 }, targets).length, 0, 'il faut être sur le toit, pas en dessous');
  const done = log.checkPosition({ x: 50, y: 26, z: 45 }, targets);
  assert.ok(done.some((e) => e.type === 'missionComplete' && e.id === 'p03_rings'));
  assert.ok(log.state.m01_first_contact && log.state.c01_stalker_hunt && log.state.s01_rooftop_signal);
  assert.equal(log.tracked, 'm01_first_contact');
  for (let i = 0; i < 4; i++) log.handle({ type: 'kill', group: 'parking', enemyType: 'stalker' });
  assert.equal(log.state.c01_stalker_hunt.progress, 4, 'le contrat compte aussi les kills');
  log.handle({ type: 'interact', target: 'crate_tactical_1' });
  log.checkPosition({ x: -34, y: 0, z: 24 }, targets);
  assert.equal(log.isDone('m01_first_contact'), true);
});

test('missions : l’Ombre puis la double vie (chapitre 2)', () => {
  const ids = ['p01_after_school', 'p02_nightfall', 'p03_rings', 'm01_first_contact', 'm02_aegis_echo', 'm03_colossus'];
  const state = Object.fromEntries(ids.map((id) => [id, { status: 'done', step: 9, progress: 0 }]));
  const log = new MissionLog({ state });
  assert.ok(log.state.m04_umbra, 'l’Ombre démarre après le Colosse');
  assert.equal(log.state.d01_double_life, undefined);
  const T = (n) => ({ home_door: { x: 30, z: 78 } })[n];
  log.handle({ type: 'interact', target: 'abyss_ooze' });
  log.handle({ type: 'event', id: 'transform' });
  for (let i = 0; i < 4; i++) log.handle({ type: 'kill', group: 'umbra_test', enemyType: 'stalker' });
  log.checkPosition({ x: 30, y: 0, z: 78 }, T);
  assert.ok(log.isDone('m04_umbra'));
  assert.equal(log.tracked, 'd01_double_life');
  log.handle({ type: 'event', id: 'enter_school' });
  log.handle({ type: 'interact', target: 'ines' });
  log.handle({ type: 'event', id: 'lesson' });
  log.handle({ type: 'interact', target: 'camille' });
  const ev = log.handle({ type: 'event', id: 'night' });
  assert.ok(ev.some((e) => e.type === 'missionComplete' && e.id === 'd01_double_life'));
  assert.ok(log.state.n01_night_watch && log.state.s02_lucas, 'contrat de nuit et quête de Théo débloqués');
  for (let i = 0; i < 8; i++) log.handle({ type: 'kill', group: 'park', enemyType: 'crawler' });
  assert.ok(log.isDone('n01_night_watch'), 'toute créature compte pour la ronde');
});

test('sauvegarde v1 (ancienne histoire) ignorée proprement', () => {
  const store = new MemStorage();
  const body = JSON.stringify({ n: 1 });
  let h = 0;
  for (let i = 0; i < body.length; i++) h = (Math.imul(h, 31) + body.charCodeAt(i)) | 0;
  store.setItem('nightfall.save.main', JSON.stringify({ v: 1, t: 0, sum: h >>> 0, body }));
  assert.equal(new SaveSystem(store).load(), null);
});

test('sauvegarde : aller-retour complet', () => {
  const store = new MemStorage();
  const save = new SaveSystem(store);
  const inv = new Inventory();
  inv.add('aegis_plate');
  inv.equip(inv.items[0].uid);
  const data = { inventory: inv.serialize(), opened: ['c1'], pos: [1, 2, 3] };
  assert.equal(save.save(data), true);
  const loaded = save.load();
  assert.equal(loaded.slot, 'main');
  const inv2 = new Inventory(loaded.data.inventory);
  assert.equal(inv2.equippedItem('armor').id, 'aegis_plate');
  assert.deepEqual(loaded.data.opened, ['c1']);
});

test('sauvegarde : corruption de la principale -> secours', () => {
  const store = new MemStorage();
  const save = new SaveSystem(store);
  save.save({ n: 1 });
  save.save({ n: 2 });
  store.setItem('nightfall.save.main', store.getItem('nightfall.save.main').slice(0, 30));
  const loaded = save.load();
  assert.equal(loaded.slot, 'backup');
  assert.equal(loaded.data.n, 1);
});

test('sauvegarde : fermeture pendant l’écriture (tmp écrit, main intact)', () => {
  const store = new MemStorage();
  const save = new SaveSystem(store);
  save.save({ n: 1 });
  // Simule un arrêt juste après l'écriture d'un temporaire tronqué.
  store.setItem('nightfall.save.tmp', '{"v":1,"body":"{\\"n\\":');
  assert.equal(save.load().data.n, 1);
});

import { SkillTree } from '../src/game/systems/skills.js';
import { buy } from '../src/game/systems/shop.js';

test('compétences : coût, prérequis, effets et réinitialisation', () => {
  const p = new Progression();
  p.skillPoints = 4;
  const t = new SkillTree();
  assert.equal(t.learn('f2', p), false, 'niveau 2 bloqué sans niveau 1');
  assert.equal(t.learn('f1', p), true);
  assert.equal(t.learn('f2', p), true);
  assert.equal(p.skillPoints, 2);
  assert.equal(t.learn('f3', p), true, 'niveau 3 coûte 2 points');
  assert.equal(p.skillPoints, 0);
  assert.equal(t.learn('s1', p), false, 'plus de points');
  const m = t.mods();
  assert.ok(m.damageMult > 1 && m.whipRange > 0 && m.punchPierce);
  t.reset(p);
  assert.equal(p.skillPoints, 4);
  assert.equal(t.mods().damageMult, 1);
  const t2 = new SkillTree(t.serialize());
  assert.deepEqual(t2.ranks, {});
});

test('boutique : monnaies, unicité, inventaire plein', () => {
  const inv = new Inventory();
  assert.equal(buy('core_amber', inv).ok, false);
  inv.credits = 1000;
  inv.shards = 30;
  assert.equal(buy('core_amber', inv).ok, true);
  assert.equal(inv.credits, 650);
  assert.equal(buy('skin_abyss', inv).ok, true);
  assert.equal(buy('skin_abyss', inv).reason, 'Déjà possédé');
  assert.equal(inv.shards, 10);
  const before = inv.count('medkit');
  assert.equal(buy('pack_medkits', inv).ok, true);
  assert.equal(inv.count('medkit'), before + 3);
  while (!inv.isFull()) inv.add('patrol_gloves');
  const c = inv.credits;
  assert.equal(buy('core_amber', inv).reason, 'Inventaire plein');
  assert.equal(inv.credits, c, 'rien n’est débité si l’achat échoue');
});

test('relations : affinité bornée, paliers uniques, conditions de rendez-vous', async () => {
  const { Social } = await import('../src/game/systems/social.js');
  const xp = [];
  const fake = { hud: { toast() {}, banner() {} }, audio: { heart() {} }, grantXp: (n) => xp.push(n), clock: { day: 2, phase: 'afternoon' } };
  const s = new Social(fake, null);
  s.addAff('malik', 200);
  assert.equal(s.aff.malik, 100, 'affinité plafonnée à 100');
  assert.deepEqual(xp, [80, 150], 'les deux paliers d’amitié donnent de l’XP une seule fois');
  s.addAff('malik', 5);
  assert.equal(xp.length, 2);
  assert.equal(s.canDate('malik'), false, 'Malik n’est pas une romance');
  s.aff.ines = 49;
  assert.equal(s.canDate('ines'), false, 'il faut 50 d’affinité');
  s.aff.ines = 55;
  assert.equal(s.canDate('ines'), true);
  fake.clock.phase = 'night';
  assert.equal(s.canDate('ines'), false, 'pas de rendez-vous la nuit');
  fake.clock.phase = 'afternoon';
  s.partner = 'camille';
  assert.equal(s.canDate('ines'), false, 'déjà en couple');
  assert.equal(s.xpMult, 1.1, 'bonus d’expérience en couple');
  const back = new Social(fake, JSON.parse(JSON.stringify(s.serialize())));
  assert.equal(back.partner, 'camille');
  assert.equal(back.aff.malik, 100);
});

test('données sociales et sélection de chapitre cohérentes', async () => {
  const { CHARACTERS, SCENES, DATES, LESSONS } = await import('../src/game/data/characters.js');
  const { chapterPreset } = await import('../src/game/data/presets.js');
  const ids = new Set(Object.keys(CHARACTERS));
  for (const sc of SCENES) {
    assert.ok(ids.has(sc.char), sc.id);
    for (const n of sc.lines) if (n.choices) assert.ok(n.choices.length >= 2 && n.choices.every((c) => c.t), sc.id);
  }
  for (const [id, c] of Object.entries(CHARACTERS)) if (c.romance) assert.ok(DATES[id]?.confess, `rendez-vous de ${id}`);
  for (const L of LESSONS) for (const q of L.qs) assert.ok(q.ok >= 0 && q.ok < q.a.length);
  assert.equal(chapterPreset('prologue'), null);
  for (const ch of ['ch1', 'ch2']) {
    const d = chapterPreset(ch);
    const log = new MissionLog(d.missions);
    const inv = new Inventory(d.inventory);
    assert.ok(inv.equippedItem('weapon'), `${ch} : noyau équipé`);
    assert.ok(log.activeIds().length > 0, `${ch} : missions actives`);
    if (ch === 'ch1') assert.equal(log.tracked, 'm01_first_contact');
    if (ch === 'ch2') assert.equal(log.tracked, 'd01_double_life');
  }
});
