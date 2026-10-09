// Test de fumée en navigateur réel : démarre une partie, joue, vérifie
// l'absence d'erreurs et capture des images. Usage : node tests/smoke.mjs [dossier]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'exports/screens';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); };

await page.goto('http://localhost:5196/');
await page.evaluate((q) => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q })); }, process.env.QUALITY || 'low');
await page.click('#start');
await page.waitForTimeout(800);
await page.keyboard.press('Space'); // passe l'intro
await page.waitForSelector('#title:not(.hidden)');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.click('#btn-new');
await page.waitForFunction(() => window.__nightfall?.running, null, { timeout: 120000 }).catch((e) => { console.log(errors); throw e; });
const G = (fn, arg) => page.evaluate(fn, arg);
// Le rendu logiciel (sans GPU) est trop lent pour du temps réel : on arrête la
// boucle et on simule à pas fixe ; le rendu n'est fait que pour les captures.
await G(() => window.__nightfall.stopLoop());
const sim = (s) => G((s) => window.__nightfall.simulate(s), s);
const shot = async (name) => { await G(() => window.__nightfall.renderOnce()); await page.screenshot({ path: `${out}/${name}.png` }); };
const hold = (action, s) => G(([a, s]) => { const g = window.__nightfall; g.input.down.add(a); g.simulate(s); g.input.down.delete(a); }, [action, s]);
const press = (action, s = 0.05) => G(([a, s]) => { const g = window.__nightfall; g.input.pressed.add(a); g.simulate(s); }, [action, s]);
console.log('draw calls monde fusionné :', await G(() => window.__nightfall.world.drawCalls));
await sim(0.5);
await shot('01_spawn');
check('démarrage', true);

// Déplacement
const p0 = await G(() => ({ ...window.__nightfall.hero.pos }));
await hold('up', 1.5);
const p1 = await G(() => ({ ...window.__nightfall.hero.pos }));
const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
check('déplacement', moved > 6, `${moved.toFixed(1)} m en 1,5 s`);
await hold('sprint', 0);
await G(() => { const g = window.__nightfall; g.input.down.add('up'); g.input.down.add('sprint'); g.simulate(1); g.input.down.clear(); });
const p2 = await G(() => ({ ...window.__nightfall.hero.pos }));
check('sprint plus rapide', Math.hypot(p2.x - p1.x, p2.z - p1.z) > 8, `${Math.hypot(p2.x - p1.x, p2.z - p1.z).toFixed(1)} m en 1 s`);

// Saut
await press('jump', 0.3);
const jy = await G(() => window.__nightfall.hero.pos.y);
check('saut', jy > 1.0, `y=${jy.toFixed(2)}`);
await sim(1);
const land = await G(() => ({ y: window.__nightfall.hero.pos.y, g: window.__nightfall.hero.grounded }));
check('atterrissage', land.g && land.y < 0.3, `y=${land.y.toFixed(2)}`);

// Collision : avancer contre le piédestal central depuis le sud
await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: 0, y: 0, z: 6 }, Math.PI); g.camYaw = Math.PI; });
await hold('up', 2);
const pc = await G(() => ({ ...window.__nightfall.hero.pos }));
check('collision monument', pc.z > 1.9 && pc.z < 3, `z=${pc.z.toFixed(2)}`);
const step = await G(() => window.__nightfall.missions.state.m01_first_contact.step);
check('mission : place Halden atteinte', step === 1, `étape=${step}`);

// Collision avec un bâtiment (pas de traversée à pleine vitesse)
await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: 5, y: 0.15, z: 20 }, Math.PI / 2); g.camYaw = Math.PI / 2; });
await G(() => { const g = window.__nightfall; g.input.down.add('up'); g.input.down.add('sprint'); g.simulate(3); g.input.down.clear(); });
const bx = await G(() => window.__nightfall.hero.pos.x);
check('collision bâtiment', bx < 10.5, `x=${bx.toFixed(2)} (façade à x=10)`);

// Perception : approche furtive par derrière vs sprint
// Approche au sprint (bruit) vers le parking.
await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: 24, y: 0.15, z: -10 }, Math.PI); g.camYaw = Math.PI; });
await G(() => { const g = window.__nightfall; g.input.down.add('up'); g.input.down.add('sprint'); g.simulate(1.0); g.input.down.clear(); g.simulate(1.5); });
await shot('02_parking');
const alerted = await G(() => window.__nightfall.enemies.filter((e) => e.spawn.group === 'parking' && e.alert).length);
check('IA détecte le joueur', alerted > 0, `${alerted} alerté(s)`);
const states = await G(() => window.__nightfall.enemies.filter((e) => e.spawn.group === 'parking').map((e) => e.type + ':' + e.state));
console.log('   états IA :', states.join(', '));

// Combat réel : le héros subit les coups normalement ; on regarde s'il survit en jouant.
let maxEnemyStates = new Set();
let heroHits = 0;
await G(() => { const g = window.__nightfall; const orig = g.hero.takeDamage.bind(g.hero); window.__hits = 0; g.hero.takeDamage = (...a) => { const r = orig(...a); if (r === true) window.__hits++; if (g.hero.hp < 40) g.hero.hp = 120; return r; }; });
for (let i = 0; i < 400; i++) {
  const st = await G(() => {
    const g = window.__nightfall;
    const alive = g.enemies.filter((e) => e.alive && e.spawn.group === 'parking');
    if (!alive.length) return { left: 0 };
    const e = alive.sort((a, b) => a.pos.distanceTo(g.hero.pos) - b.pos.distanceTo(g.hero.pos))[0];
    const dx = e.pos.x - g.hero.pos.x, dz = e.pos.z - g.hero.pos.z, d = Math.hypot(dx, dz);
    g.camYaw = Math.atan2(dx, dz);
    if (d > 2.4) { g.input.down.add('up'); g.simulate(0.15); g.input.down.delete('up'); }
    else if (g.hero.energy >= 35 && g.hero.powerCd <= 0 && e.type === 'brute') { g.input.pressed.add('power'); g.simulate(0.2); }
    else if (['windup', 'slamWindup', 'swipeWindup', 'chargeWindup'].includes(e.state)) { g.input.pressed.add('dodge'); g.simulate(0.2); }
    else { g.input.pressed.add(Math.random() < 0.2 ? 'heavy' : 'light'); g.simulate(0.15); }
    return { left: alive.length, st: e.type + ':' + e.state };
  });
  if (!st.left) break;
  maxEnemyStates.add(st.st);
  if (i % 60 === 5) await shot(`03_combat_${i}`);
}
heroHits = await G(() => window.__hits);
console.log('   états ennemis observés :', [...maxEnemyStates].join(', '));
console.log('   coups encaissés par le héros :', heroHits);
const m = await G(() => window.__nightfall.missions.state.m01_first_contact);
check('groupe du parking éliminé au combat', m.step === 2, `étape=${m.step} progression=${m.progress}`);
check('les créatures attaquent réellement', heroHits > 0, `${heroHits} coups reçus`);

// Caisse tactique : inspection puis ouverture
const locked = await G(() => window.__nightfall.crates.find((c) => c.id === 'crate_tactical_1').locked);
check('caisse déverrouillée après le combat', locked === false);
await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: 37.5, y: 0.15, z: -52.4 }, Math.PI); });
await press('interact', 0.1);
const inspected = await page.evaluate(() => document.querySelector('.prompt').textContent);
check('inspection de la caisse', inspected.includes('Ouvrir'), inspected.trim());
await press('interact', 0.1);
await page.waitForTimeout(1200);
await G(() => window.__nightfall.simulate(1.2));
await shot('04_reward');
const inv = await G(() => window.__nightfall.inventory.items.map((i) => i.id));
check('récompense ajoutée à l’inventaire', inv.includes('eclipse_gauntlets'), inv.join(','));
await press('interact', 0.05); // ferme la fenêtre
await press('interact', 0.05);
await press('interact', 0.05);
await page.waitForTimeout(1200);
const count = await G(() => window.__nightfall.inventory.items.filter((i) => i.id === 'eclipse_gauntlets').length);
check('ouverture répétée sans duplication', count === 1, `${count}`);

// Équipement : stats + apparence
const before = await G(() => window.__nightfall.hero.stats.damage);
await G(() => { const g = window.__nightfall; const it = g.inventory.items.find((i) => i.id === 'eclipse_gauntlets'); g.inventory.equip(it.uid); g.onEquipmentChanged(); });
const after = await G(() => ({ d: window.__nightfall.hero.stats.damage, glow: '#' + window.__nightfall.hero.model.mats.glow.emissive.getHexString() }));
check('équiper modifie stats + visuel', after.d > before && after.glow === '#3f9bff', `${before} -> ${after.d}, ${after.glow}`);

await press('inventory', 0.02);
await G(() => window.__nightfall.renderOnce());
await page.screenshot({ path: `${out}/05_inventory.png` });
check('menu inventaire', await page.isVisible('.menu.inv.on'));
await press('inventory', 0.02);

// Retour au refuge -> mission terminée
await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: -33, y: 0.15, z: 23 }, 0); });
await sim(0.3);
const done = await G(() => window.__nightfall.missions.isDone('m01_first_contact'));
check('mission principale terminée', done);
await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: -30, y: 0.15, z: 20 }, Math.PI * 0.8); g.camYaw = Math.PI * 0.85; g.camPitch = 0.2; });
await sim(1);
await shot('06_safehouse');

// Toit Corvin par le parcours vertical, au clavier
const route = [[-42.4, -19.6], [-42.4, -21.1], [-42.4, -23], [-42.4, -25], [-42.4, -29], [-42.4, -33.5], [-42.4, -35.6], [-42, -38.6], [-37, -38.6], [-28, -28]];
await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: -42.5, y: 0.15, z: -14.5 }, Math.PI); });
const heights = [];
for (const [x, z] of route) {
  for (let i = 0; i < 60; i++) {
    const r = await G(([x, z]) => {
      const g = window.__nightfall; const h = g.hero;
      const dx = x - h.pos.x, dz = z - h.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.35) return { done: true, y: h.pos.y };
      g.camYaw = Math.atan2(dx, dz);
      if (h.grounded) g.input.pressed.add('jump');
      g.input.down.add('up'); g.simulate(Math.min(0.1, d / 7)); g.input.down.delete('up');
      return { done: false, y: h.pos.y };
    }, [x, z]);
    if (r.done) { heights.push(r.y.toFixed(1)); break; }
  }
}
await sim(1);
const roofY = await G(() => window.__nightfall.hero.pos.y);
check('toit Corvin accessible', roofY > 8.9, `paliers ${heights.join(' > ')} · final ${roofY.toFixed(2)}`);
const side = await G(() => window.__nightfall.missions.state.s01_rooftop_signal.step);
check('mission secondaire : toit atteint', side === 1, `étape=${side}`);
await G(() => { const g = window.__nightfall; g.camYaw = -2.4; g.camPitch = 0.35; });
await sim(0.5);
await shot('07_rooftop');

// Sauvegarde / rechargement
await G(() => window.__nightfall.save('test', true));
const saved = await G(() => window.__nightfall.serialize());
await page.reload();
await page.click('#start');
await page.waitForTimeout(800);
await page.keyboard.press('Space');
await page.waitForSelector('#title:not(.hidden)');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.click('#btn-continue');
await page.waitForFunction(() => window.__nightfall?.running, null, { timeout: 120000 });
await G(() => window.__nightfall.stopLoop());
const re = await G(() => window.__nightfall.serialize());
check('rechargement : missions', JSON.stringify(re.missions) === JSON.stringify(saved.missions));
check('rechargement : inventaire et équipement', JSON.stringify(re.inventory) === JSON.stringify(saved.inventory));
check('rechargement : caisses ouvertes', re.opened.includes('crate_tactical_1'));
check('rechargement : position', Math.abs(re.hero.y - saved.hero.y) < 0.5 && Math.hypot(re.hero.x - saved.hero.x, re.hero.z - saved.hero.z) < 0.5);
const parkingLeft = await G(() => window.__nightfall.enemies.filter((e) => e.spawn.group === 'parking').length);
check('groupe vaincu ne réapparaît pas après rechargement', parkingLeft === 0, `${parkingLeft}`);

// Mort du joueur
await G(() => { const g = window.__nightfall; g.hero.takeDamage(9999, g.hero.pos.clone().add({ x: 1, y: 0, z: 0 })); });
await page.waitForTimeout(2600);
check('écran de mort', await page.isVisible('.menu.death.on'));
await page.click('[data-act=respawn]');
await sim(0.2);
const alive = await G(() => ({ dead: window.__nightfall.hero.dead, hp: window.__nightfall.hero.hp }));
check('réapparition au refuge', !alive.dead && alive.hp > 0);

// Performance (rendu logiciel : valeur indicative seulement)
const ms = await G(() => { const g = window.__nightfall; const t = performance.now(); for (let i = 0; i < 60; i++) g.simulate(1 / 60); return (performance.now() - t) / 60; });
console.log(`Logique de jeu : ${ms.toFixed(2)} ms par image (hors rendu)`);

check('aucune erreur JavaScript', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
