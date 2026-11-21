// Test de bout en bout du monde ouvert (Marches de Vesper) dans Chromium.
// Usage : node tests/wilds.mjs [dossier de captures]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'exports/wilds_test';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5213, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`);
};

await page.goto('http://localhost:5213/');
await page.evaluate((q) => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q })); }, process.env.QUALITY || 'low');
await page.click('#start');
await page.waitForTimeout(800);
await page.keyboard.press('Space');
await page.waitForSelector('#title:not(.hidden)');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.click('#btn-new');
await page.waitForFunction(() => window.__nightfall?.running, null, { timeout: 180000 });
const G = (fn, a) => page.evaluate(fn, a);
await G(() => { const g = window.__nightfall; g.stopLoop(); g.rifts.enabled = false; });
const shot = async (n) => { await G(() => window.__nightfall.renderOnce()); await page.screenshot({ path: `${out}/${n}.png` }); };

const st = await G(() => {
  const g = window.__nightfall;
  return { mode: g.mode, story: g.story.constructor.name, tracked: g.missions.tracked, terrain: !!g.col.heightFn, grass: g.world.kind, y: g.hero.pos.y, ground: g.col.terrainAt(g.hero.pos.x, g.hero.pos.z), npcs: g.story.npcs.length };
});
check('nouvelle partie = monde ouvert', st.mode === 'wilds' && st.story === 'WildsStory', JSON.stringify(st));
check('première quête suivie', st.tracked === 'w01_reveil');
check('Noa posé sur le relief', Math.abs(st.y - st.ground) < 0.8, `${st.y.toFixed(2)} / ${st.ground.toFixed(2)}`);
check('villageois présents', st.npcs >= 15, String(st.npcs));
await shot('01_depart');

// Marcher : le héros suit le relief.
const walk = await G(() => {
  const g = window.__nightfall;
  const a = g.hero.pos.clone();
  g.input.down.add('up');
  g.simulate(3);
  g.input.down.delete('up');
  const ground = g.col.terrainAt(g.hero.pos.x, g.hero.pos.z);
  return { d: a.distanceTo(g.hero.pos), dy: g.hero.pos.y - ground };
});
check('marcher sur le terrain', walk.d > 4 && Math.abs(walk.dy) < 0.8, JSON.stringify(walk));

// Lire la stèle du Sanctuaire (dialogue + étape).
const stele = await G(() => {
  const g = window.__nightfall;
  const t = g.world.targets.stele_0;
  g.hero.placeAt({ x: t.x, y: g.col.terrainAt(t.x, t.z), z: t.z }, Math.PI);
  g.simulate(0.2);
  const it = g.story.interactables().find((i) => i.id === 'stele_0');
  g.story.interact(it);
  const open = g.hud.dialogOpen;
  let n = 0;
  while (g.story.talking && n++ < 10) g.story.next();
  return { open, step: g.missions.state.w01_reveil.step };
});
check('stèle lue (dialogue)', stele.open && stele.step === 1, JSON.stringify(stele));

// Brumeval puis Aldric.
const ald = await G(() => {
  const g = window.__nightfall;
  const b = g.world.targets.brumeval;
  g.hero.placeAt({ x: b.x, y: g.col.terrainAt(b.x, b.z), z: b.z }, 0);
  g.simulate(0.5);
  const step = g.missions.state.w01_reveil.step;
  const it = g.story.interactables().find((i) => i.id === 'talk_aldric');
  g.story.interact(it);
  let n = 0;
  while (g.story.talking && n++ < 20) g.story.next();
  g.simulate(0.1);
  return { step, done: g.missions.isDone('w01_reveil'), active: g.missions.activeIds() };
});
check('arrivée à Brumeval', ald.step === 2, JSON.stringify(ald));
check('Aldric : les trois Sceaux s’ouvrent', ald.done && ['w02_aube', 'w03_marees', 'w04_cendres', 'ws_memoires'].every((id) => ald.active.includes(id)), ald.active.join(','));
await shot('02_brumeval');

// Les gardiens du Sceau de l'Aube sont là de jour.
const guards = await G(() => {
  const g = window.__nightfall;
  g.spawnGated();
  return g.enemies.filter((e) => e.alive && e.spawn.group === 'seal_aube').length;
});
check('gardiens du Sceau présents (de jour)', guards === 3, String(guards));

// Le Sceau refuse tant que les gardiens vivent, puis se ranime : vol débloqué.
const seal = await G(() => {
  const g = window.__nightfall;
  const t = g.world.targets.seal_aube;
  g.hero.placeAt({ x: t.x, y: g.col.terrainAt(t.x, t.z), z: t.z }, 0);
  g.simulate(0.2);
  const it = () => g.story.interactables().find((i) => i.id === 'seal_aube');
  g.story.interact(it());
  const refused = g.missions.state.w02_aube.step === 0;
  for (const e of g.enemies.filter((e) => e.alive && e.spawn.group === 'seal_aube')) e.takeHit({ damage: 99999, dir: { x: 0, y: 0, z: 1 }, knock: 0, poise: 0, heavy: true, power: true });
  g.simulate(2);
  const killed = g.missions.state.w02_aube.step;
  g.story.interact(it());
  g.simulate(0.2);
  return { refused, killed, done: g.missions.isDone('w02_aube'), fly: g.hero.powers.flight };
});
check('le Sceau refuse tant que les gardiens vivent', seal.refused, JSON.stringify(seal));
check('gardiens vaincus', seal.killed === 1, String(seal.killed));
check('Sceau de l’Aube ranimé, vol débloqué', seal.done && seal.fly);

// Voler au-dessus des collines.
const fly = await G(() => {
  const g = window.__nightfall;
  g.input.pressed.add('fly');
  g.simulate(0.5);
  g.input.down.add('jump');
  g.simulate(1.5);
  g.input.down.delete('jump');
  return { flying: g.hero.flying, alt: g.hero.pos.y - g.col.terrainAt(g.hero.pos.x, g.hero.pos.z) };
});
check('vol', fly.flying && fly.alt > 3, JSON.stringify(fly));
await shot('03_vol');

// Herbe : la trace de piétinement se crée sous Noa.
const grass = await G(() => {
  const g = window.__nightfall;
  g.input.pressed.add('fly');
  g.simulate(3);
  const p = g.world.places.brumeval;
  g.hero.placeAt({ x: -30, y: g.col.terrainAt(-30, 80), z: 80 }, 0);
  g.input.down.add('up');
  g.simulate(1.5);
  g.input.down.delete('up');
  g.renderOnce();
  return { flying: g.hero.flying, grass: !!g.scene.getObjectByName('grass0') };
});
check('herbe interactive présente', grass.grass, JSON.stringify(grass));

// Cycle jour / nuit : la nuit tombe d'elle-même, les rôdeurs sortent.
const night = await G(() => {
  const g = window.__nightfall;
  g.story.phaseT = 1e6;
  g.simulate(0.1); // matin -> après-midi
  g.story.phaseT = 1e6;
  g.simulate(0.1); // -> soirée
  g.story.phaseT = 1e6;
  g.simulate(0.1); // -> nuit
  g.simulate(4);
  return { phase: g.clock.phase, wild: g.enemies.filter((e) => e.alive && e.spawn.group === 'wild').length };
});
check('la nuit tombe (cycle continu)', night.phase === 'night', JSON.stringify(night));
check('rôdeurs nocturnes', night.wild >= 5, String(night.wild));
await shot('04_nuit');

// Quête de Bran (Cendreval) et Mémoires.
const side = await G(() => {
  const g = window.__nightfall;
  const bran = g.story.npcs.find((n) => n.villager === 'bran');
  g.hero.placeAt({ x: bran.pos.x + 1.5, y: g.col.terrainAt(bran.pos.x + 1.5, bran.pos.z), z: bran.pos.z }, 0);
  g.simulate(0.2);
  g.story.interact(g.story.interactables().find((i) => i.id === 'talk_bran'));
  let n = 0;
  while (g.story.talking && n++ < 20) g.story.next();
  const t = g.world.targets.stele_3;
  g.hero.placeAt({ x: t.x, y: g.col.terrainAt(t.x, t.z), z: t.z }, 0);
  g.simulate(0.2);
  g.story.interact(g.story.interactables().find((i) => i.id === 'stele_3'));
  n = 0;
  while (g.story.talking && n++ < 10) g.story.next();
  return { loups: !!g.missions.state.ws_loups, mem: g.missions.state.ws_memoires.progress };
});
check('Bran donne une quête', side.loups, JSON.stringify(side));
check('Mémoire comptée', side.mem === 1);

// Fin : les trois Sceaux, la Faille et son gardien.
const end = await G(() => {
  const g = window.__nightfall;
  g.hero.takeDamage = () => false;
  for (const id of ['seal_marees', 'seal_cendres']) {
    g.spawnGated();
    for (const e of g.enemies.filter((e) => e.alive && e.spawn.group === id)) e.takeHit({ damage: 99999, dir: { x: 0, y: 0, z: 1 }, knock: 0, poise: 0, heavy: true, power: true });
    g.simulate(1.5);
    const t = g.world.targets[id];
    g.hero.placeAt({ x: t.x, y: g.col.terrainAt(t.x, t.z), z: t.z }, 0);
    g.simulate(0.2);
    g.story.interact(g.story.interactables().find((i) => i.id === id));
  }
  const started = g.missions.state.w05_faille?.status;
  const f = g.world.targets.faille;
  g.hero.placeAt({ x: f.x, y: g.col.terrainAt(f.x, f.z), z: f.z }, Math.PI);
  g.simulate(1);
  const boss = !!g.boss && g.boss.alive;
  if (g.boss) { g.boss.hp = 1; g.boss.exposed = true; g.boss.state = 'stun'; g.boss.stunFor = 5; g.boss.takeHit({ damage: 99999, dir: { x: 0, y: 0, z: 1 } }); }
  g.simulate(4);
  const step = g.missions.state.w05_faille?.step;
  const h = g.world.targets.faille_heart;
  g.hero.placeAt({ x: h.x, y: g.col.terrainAt(h.x, h.z), z: h.z }, 0);
  g.simulate(0.2);
  const it = g.story.interactables().find((i) => i.id === 'faille_heart');
  if (it) g.story.interact(it);
  g.simulate(0.2);
  return { started, boss, step, umbra: g.hero.powers.umbra, done: g.missions.isDone('w05_faille') };
});
check('les trois Sceaux ouvrent la Faille', end.started === 'active' && end.umbra, JSON.stringify(end));
check('le gardien de la Faille apparaît', end.boss);
check('Faille scellée (fin)', end.done);
await shot('05_faille');

// Sauvegarde / rechargement en monde ouvert.
const sv = await G(() => { const g = window.__nightfall; return { ok: g.save('manual'), mode: g.serialize().mode }; });
check('sauvegarde avec mode monde ouvert', sv.ok && sv.mode === 'wilds', JSON.stringify(sv));
await page.reload();
await page.click('#start');
await page.waitForTimeout(800);
await page.keyboard.press('Space');
await page.waitForSelector('#title:not(.hidden)');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.click('#btn-continue');
await page.waitForFunction(() => window.__nightfall?.running, null, { timeout: 180000 });
const re = await G(() => { const g = window.__nightfall; g.stopLoop(); return { mode: g.mode, aube: g.missions.isDone('w02_aube'), fly: g.hero.powers.flight }; });
check('rechargement : monde ouvert, progression conservée', re.mode === 'wilds' && re.aube && re.fly, JSON.stringify(re));

check('aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} vérifications réussies`);
await browser.close();
await server.close();
process.exit(ok === results.length ? 0 : 1);
