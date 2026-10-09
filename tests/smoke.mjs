// Test de bout en bout dans Chromium : joue l'histoire du prologue à la fin du
// chapitre 1 et vérifie chaque système. Usage : node tests/smoke.mjs [dossier]
// Le rendu logiciel (sans GPU) étant trop lent pour du temps réel, la boucle est
// arrêtée et le jeu simulé à pas fixe ; le rendu n'est fait que pour les captures.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'exports/screens';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`);
};

async function startGame(button) {
  await page.click('#start');
  await page.waitForTimeout(800);
  await page.keyboard.press('Space'); // passe l'intro du studio
  await page.waitForSelector('#title:not(.hidden)');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.click(button);
  await page.waitForFunction(() => window.__nightfall?.running, null, { timeout: 120000 }).catch((e) => {
    console.log(errors);
    throw e;
  });
  await page.evaluate(() => window.__nightfall.stopLoop());
}

await page.goto('http://localhost:5196/');
await page.evaluate((q) => {
  localStorage.clear();
  localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q }));
}, process.env.QUALITY || 'low');
await startGame('#btn-new');

const G = (fn, arg) => page.evaluate(fn, arg);
const sim = (s) => G((s) => window.__nightfall.simulate(s), s);
const shot = async (name) => {
  await G(() => window.__nightfall.renderOnce());
  await page.screenshot({ path: `${out}/${name}.png` });
};
const hold = (actions, s) => G(([a, s]) => {
  const g = window.__nightfall;
  a.forEach((x) => g.input.down.add(x));
  g.simulate(s);
  a.forEach((x) => g.input.down.delete(x));
}, [actions, s]);
const press = (action, s = 0.05) => G(([a, s]) => {
  const g = window.__nightfall;
  g.input.pressed.add(a);
  g.simulate(s);
}, [action, s]);
const stage = () => G(() => window.__nightfall.story.stage());
const place = (x, y, z, yaw = 0) => G(([x, y, z, yaw]) => {
  const g = window.__nightfall;
  g.hero.placeAt({ x, y, z }, yaw);
  g.camYaw = yaw;
}, [x, y, z, yaw]);

console.log('draw calls monde fusionné :', await G(() => window.__nightfall.world.drawCalls));

// ================= PROLOGUE =================
await sim(1);
await shot('01_lycee');
const pro = await G(() => {
  const g = window.__nightfall;
  return { st: g.story.stage(), rings: g.hero.powers.rings, enemies: g.enemies.length, night: g.night, npcs: g.story.npcs.length, crates: g.crates.some((c) => c.root.visible) };
});
check('prologue : ado sans pouvoirs au lycée', pro.st === 'prologue' && !pro.rings && pro.night === 0, JSON.stringify(pro));
check('prologue : aucune créature, passants présents', pro.enemies === 0 && pro.npcs >= 5);
check('prologue : caisses cachées', !pro.crates);

const p0 = await G(() => ({ ...window.__nightfall.hero.pos }));
await hold(['up'], 1.5);
const p1 = await G(() => ({ ...window.__nightfall.hero.pos }));
check('déplacement', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 6, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);
// Directions : « droite » doit déplacer Noa vers la droite de l'écran (projection caméra).
for (const [act, sign] of [['right', 1], ['left', -1]]) {
  const r = await G(([act]) => {
    const g = window.__nightfall;
    g.simulate(0.5);
    g.renderOnce();
    g.camera.updateMatrixWorld();
    // Axe « droite » réel de la caméra (1re colonne de sa matrice monde).
    const camRight = g.hero.pos.clone().setFromMatrixColumn(g.camera.matrixWorld, 0).setY(0).normalize();
    const before = g.hero.pos.clone();
    g.input.down.add(act); g.simulate(0.4); g.input.down.delete(act);
    return g.hero.pos.clone().sub(before).dot(camRight);
  }, [act]);
  check(`commande « ${act === 'right' ? 'droite' : 'gauche'} » dans le bon sens à l'écran`, r * sign > 0.5, `${r.toFixed(2)} m`);
}
await press('jump', 0.3);
check('saut', (await G(() => window.__nightfall.hero.pos.y)) > 1.0);
await sim(1);
await press('light', 0.3);
check('pas de combat avant les pouvoirs', (await G(() => window.__nightfall.hero.action)) === null);

// Ville vivante : feux, circulation, arrêt devant un piéton
const city0 = await G(() => {
  const g = window.__nightfall; const st = g.world.street;
  const lights = new Set(); let moving = 0;
  for (let i = 0; i < 30; i++) { g.simulate(1); lights.add(st.lightState('NS') + '/' + st.lightState('EW')); }
  moving = st.cars.filter((c) => c.v > 3 && !c.bus).length;
  return { lights: [...lights], moving, cars: st.cars.length };
});
check('feux tricolores qui cyclent', city0.lights.length >= 3, city0.lights.join(' '));
check('circulation en mouvement', city0.moving >= 3, `${city0.moving}/${city0.cars} voitures roulent`);
const stopTest = await G(() => {
  const g = window.__nightfall; const st = g.world.street;
  const c = st.cars.filter((x) => x.lane.id === 'S' && x.s > -70 && x.s < -35 && !x.bus).sort((a, b) => b.s - a.s)[0] || st.cars.find((x) => x.lane.id === 'S');
  c.s = -50; c.v = 10;
  // Noa se plante au milieu de la voie, devant la voiture.
  const hx = c.lane.base[0], hz = c.lane.base[1] + c.lane.dir[1] * (-50 + 10);
  g.hero.placeAt({ x: hx, y: 0, z: hz }, 0);
  g.simulate(3);
  const gap = (hz - (c.lane.base[1] + c.lane.dir[1] * c.s)) * c.lane.dir[1];
  return { v: c.v, gap };
});
check('une voiture s’arrête devant Noa', stopTest.v < 0.3 && stopTest.gap > 2, JSON.stringify(stopTest));
await place(25, 0.15, 37.5, Math.PI);

// Parler à Inès
const ines = await G(() => ({ ...window.__nightfall.story.ines.pos }));
await place(ines.x + 1.6, 0.15, ines.z, -Math.PI / 2);
await sim(0.2);
const prompt1 = await page.evaluate(() => document.querySelector('.prompt').textContent);
check('Inès est interactive', prompt1.includes('Inès'), prompt1.trim());
await press('interact', 0.1);
await sim(4);
await shot('02_ines');
await sim(34);
await shot('03_message_maman');
const s1 = await G(() => window.__nightfall.missions.state.p01_after_school.step);
check('dialogue Inès terminé', s1 === 1);
await sim(30);
const busT = await G(() => ({ ines: window.__nightfall.story.ines.mode, bus: !!window.__nightfall.world.street.traffic.bus }));
check('Inès prend le bus 12', busT.ines === 'gone', JSON.stringify(busT));

// Place Halden -> le Nightfall
await place(0, 0.15, 5, Math.PI);
await sim(0.3);
check('cinématique du Nightfall déclenchée', await G(() => window.__nightfall.story.inCinematic));
await sim(5.5);
await shot('04_nightfall_ciel');
await sim(4.5);
await shot('05_nightfall_creature');
await sim(8);
const nf = await G(() => {
  const g = window.__nightfall;
  return { st: g.story.stage(), night: g.night, chaser: !!g.enemies.find((e) => e.spawn.group === 'chaser'), cine: g.story.inCinematic, fled: g.story.npcs.filter((n) => n.mode === 'flee' || n.mode === 'gone').length };
});
const after = await G(() => { const st = window.__nightfall.world.street; return { on: st.traffic.on, parked: st.cars.filter((c) => c.parked).length, cars: st.cars.length }; });
check('après le Nightfall : circulation arrêtée, voitures abandonnées', !after.on && after.parked === after.cars, JSON.stringify(after));
check('après le Nightfall : nuit, poursuivant, passants en fuite', nf.st === 'chase' && nf.night === 1 && nf.chaser && !nf.cine && nf.fled >= 5, JSON.stringify(nf));

// Fuite vers le parking (la créature poursuit vraiment)
await G(() => { const g = window.__nightfall; g.camYaw = Math.atan2(22 - g.hero.pos.x, -14 - g.hero.pos.z); });
await hold(['up', 'sprint'], 1.2);
const chaseD = await G(() => { const g = window.__nightfall; const c = g.enemies.find((e) => e.spawn.group === 'chaser'); return { st: c.state, d: c.pos.distanceTo(g.hero.pos) }; });
console.log('   poursuivant :', JSON.stringify(chaseD));
check('la créature poursuit Noa', chaseD.st !== 'patrol', chaseD.st);
await place(22, 0.15, -15, Math.PI);
await sim(0.3);
check('parking atteint', (await G(() => window.__nightfall.missions.state.p02_nightfall.step)) === 1);

// Éveil
const cp = await G(() => ({ ...window.__nightfall.world.targets.aegis_case }));
await place(cp.x - 1.4, 0.15, cp.z + 0.4, Math.PI / 2);
await sim(0.2);
const prompt2 = await page.evaluate(() => document.querySelector('.prompt').textContent);
check('mallette Aegis interactive', prompt2.includes('Aegis'), prompt2.trim());
await press('interact', 0.1);
await sim(4.6);
await shot('06_eveil_anneaux');
await sim(3.6);
await shot('07_onde_magnetique');
await sim(8);
const aw = await G(() => {
  const g = window.__nightfall;
  return { st: g.story.stage(), rings: g.hero.powers.rings, mode: g.hero.rings.mode, flight: g.hero.powers.flight, cine: g.story.inCinematic };
});
check('éveil : anneaux obtenus, tutoriel lancé', aw.st === 'tutorial' && aw.rings && !aw.flight && !aw.cine, JSON.stringify(aw));

// ================= TUTORIEL DES ANNEAUX =================
await G(() => { const g = window.__nightfall; g.hero.takeDamage = ((orig) => (...a) => { const r = orig(...a); if (g.hero.hp < 40) g.hero.hp = 100; return r; })(g.hero.takeDamage.bind(g.hero)); });
let ringModes = new Set();
for (let i = 0; i < 200; i++) {
  const st = await G(() => {
    const g = window.__nightfall;
    const e = g.enemies.find((x) => x.alive && x.spawn.group === 'chaser');
    if (!e) return { left: 0 };
    const dx = e.pos.x - g.hero.pos.x, dz = e.pos.z - g.hero.pos.z, d = Math.hypot(dx, dz);
    g.camYaw = Math.atan2(dx, dz);
    if (d > 2.4) { g.input.down.add('up'); g.simulate(0.15); g.input.down.delete('up'); }
    else { g.input.pressed.add(Math.random() < 0.3 ? 'heavy' : 'light'); g.simulate(0.12); }
    return { left: 1, mode: g.hero.rings.mode };
  });
  if (!st.left) break;
  ringModes.add(st.mode);
  if (i === 6) await shot('08_combat_anneaux');
}
console.log('   modes des anneaux observés :', [...ringModes].join(', '));
check('combat aux anneaux : créature vaincue', (await G(() => window.__nightfall.missions.state.p03_rings.step)) === 1);
const modeAfter = (a) => G((a) => { const g = window.__nightfall; g.simulate(0.8); g.input.pressed.add(a); g.simulate(0.15); const m = g.hero.rings.mode; g.simulate(0.9); return m; }, a);
const punchMode = await modeAfter('light');
const whipMode = await modeAfter('heavy');
check('animations d’anneaux : coup et fouet', punchMode === 'punch' && whipMode === 'whip', `${punchMode} / ${whipMode}`);

await G(() => { window.__nightfall.hero.energy = 100; window.__nightfall.hero.powerCd = 0; });
await press('power', 0.3);
await shot('09_rafale');
await sim(1);
check('rafale d’anneaux', (await G(() => window.__nightfall.missions.state.p03_rings.step)) === 2);

await hold(['shield'], 0.6);
await shot('10_bouclier').catch(() => {});
check('bouclier d’anneaux', (await G(() => window.__nightfall.missions.state.p03_rings.step)) === 3);
const blockTest = await G(() => {
  const g = window.__nightfall; const h = g.hero;
  const front = h.pos.clone().add(h.facing().multiplyScalar(2));
  h.energy = 100;
  h.shieldT = 0.1; const parry = h.takeDamage(10, front, {});
  h.shieldT = 0.6; const block = h.takeDamage(10, front, {});
  h.shieldT = -1;
  return { parry, block };
});
check('parade et blocage', blockTest.parry === 'parried' && blockTest.block === 'blocked', JSON.stringify(blockTest));
check('vol débloqué', await G(() => window.__nightfall.hero.powers.flight));

// ================= VOL =================
await sim(0.5);
await press('fly', 0.6);
const f1 = await G(() => ({ flying: window.__nightfall.hero.flying, y: window.__nightfall.hero.pos.y, step: window.__nightfall.missions.state.p03_rings.step }));
check('décollage', f1.flying && f1.y > 2, JSON.stringify(f1));
check('événement vol du tutoriel', f1.step === 4);
await hold(['jump'], 1.5);
await shot('11_vol_stationnaire');
const yUp = await G(() => window.__nightfall.hero.pos.y);
check('monter en vol', yUp > 10, `y=${yUp.toFixed(1)}`);
// Trajectoire dégagée au-dessus de l'avenue (évite les immeubles).
await G(() => { const g = window.__nightfall; g.hero.pos.set(0, 45, 40); g.hero.vel.set(0, 0, 0); g.hero.vy = 0; g.camYaw = Math.PI; g.camPitch = 0.1; });
await hold(['up'], 1.5);
const cruise = await G(() => ({ mode: window.__nightfall.hero.flightMode, pitch: window.__nightfall.hero.flyPitch }));
check('vol en avant (corps incliné)', cruise.mode === 'fly' && cruise.pitch > 0.6, JSON.stringify(cruise));
await shot('12_vol');
await hold(['up', 'sprint'], 2);
const boost = await G(() => ({ mode: window.__nightfall.hero.flightMode, v: Math.hypot(window.__nightfall.hero.vel.x, window.__nightfall.hero.vel.z) }));
check('boost', boost.mode === 'boost' && boost.v > 24, JSON.stringify(boost));
await shot('13_boost');
await G(() => { window.__nightfall.camYaw += 1.2; });
await hold(['up', 'sprint'], 0.5);
const roll = await G(() => window.__nightfall.hero.flyRoll);
check('roulis dans les virages', Math.abs(roll) > 0.15, `roll=${roll.toFixed(2)}`);
await shot('14_virage');

// Vers le toit de l'hôtel Lumen : se placer au-dessus puis descendre
await G(() => { const g = window.__nightfall; g.hero.pos.set(51.5, 34, 45.5); g.hero.vel.set(0, 0, 0); g.hero.vy = 0; });
await hold(['dodge'], 3);
await sim(1.2);
const roof = await G(() => ({ y: window.__nightfall.hero.pos.y, flying: window.__nightfall.hero.flying, done: window.__nightfall.missions.isDone('p03_rings') }));
check('atterrissage sur le toit du Lumen', !roof.flying && roof.y > 25.5, JSON.stringify(roof));
check('tutoriel terminé, Mara entre en scène', roof.done);
await sim(1);
await shot('15_toit_lumen');
const ch1 = await G(() => ({ m01: window.__nightfall.missions.state.m01_first_contact?.status, parking: window.__nightfall.enemies.filter((e) => e.spawn.group === 'parking').length, others: window.__nightfall.enemies.filter((e) => e.spawn.group !== 'parking' && e.spawn.group !== 'chaser').length }));
check('chapitre 1 : missions et créatures apparaissent', ch1.m01 === 'active' && ch1.parking === 4 && ch1.others >= 4, JSON.stringify(ch1));

// Atterrissage de super-héros en piqué depuis le toit
await press('fly', 0.4);
await G(() => { const g = window.__nightfall; g.hero.pos.set(30, 30, 0); g.hero.vel.set(0, 0, 0); });
await hold(['dodge', 'up'], 2.5);
await sim(0.2);
const land = await G(() => ({ anim: window.__nightfall.hero.action?.anim, g: window.__nightfall.hero.grounded }));
check('atterrissage de super-héros', land.g && land.anim === 'superLanding', JSON.stringify(land));
await shot('16_atterrissage');
await sim(1.5);

// ================= CHAPITRE 1 : combat du parking =================
let heroHits = 0;
await G(() => { const g = window.__nightfall; window.__hits = 0; const orig = g.hero.takeDamage; g.hero.takeDamage = (...a) => { const r = orig(...a); if (r === true) window.__hits++; return r; }; });
await place(24, 0.15, -12, Math.PI);
for (let i = 0; i < 500; i++) {
  const st = await G(() => {
    const g = window.__nightfall;
    const alive = g.enemies.filter((e) => e.alive && e.spawn.group === 'parking');
    if (!alive.length) return { left: 0 };
    const e = alive.sort((a, b) => a.pos.distanceTo(g.hero.pos) - b.pos.distanceTo(g.hero.pos))[0];
    const dx = e.pos.x - g.hero.pos.x, dz = e.pos.z - g.hero.pos.z, d = Math.hypot(dx, dz);
    g.camYaw = Math.atan2(dx, dz);
    if (d > 2.6) { g.input.down.add('up'); g.simulate(0.15); g.input.down.delete('up'); }
    else if (g.hero.energy >= 30 && g.hero.powerCd <= 0) { g.input.pressed.add('power'); g.simulate(0.2); }
    else if (['windup', 'slamWindup', 'swipeWindup', 'chargeWindup'].includes(e.state)) { g.input.pressed.add('dodge'); g.simulate(0.2); }
    else { g.input.pressed.add(Math.random() < 0.3 ? 'heavy' : 'light'); g.simulate(0.15); }
    return { left: alive.length };
  });
  if (!st.left) break;
  if (i === 30) await shot('17_parking');
}
heroHits = await G(() => window.__hits);
const m = await G(() => window.__nightfall.missions.state.m01_first_contact);
check('parking nettoyé', m.step === 1, `étape=${m.step}`);
console.log('   coups encaissés :', heroHits);

// Caisse Aegis + document sur le père
await place(37.5, 0.15, -52.4, Math.PI);
await press('interact', 0.1);
await press('interact', 0.1);
await page.waitForTimeout(1200);
await sim(1.2);
await shot('18_document_aegis');
const lore = await page.evaluate(() => document.querySelector('.lore')?.textContent || '');
check('document : le père de Noa', lore.includes('Julien Vant'));
const inv = await G(() => window.__nightfall.inventory.items.map((i) => i.id));
check('récompense dans l’inventaire', inv.includes('eclipse_gauntlets'), inv.join(','));
await press('interact', 0.05);
await press('interact', 0.05);
await press('interact', 0.05);
await page.waitForTimeout(1200);
check('pas de duplication', (await G(() => window.__nightfall.inventory.items.filter((i) => i.id === 'eclipse_gauntlets').length)) === 1);
await G(() => { const g = window.__nightfall; g.inventory.equip(g.inventory.items.find((i) => i.id === 'eclipse_gauntlets').uid); g.onEquipmentChanged(); });
const glow = await G(() => '#' + window.__nightfall.hero.rings.glow.color.getHexString());
check('l’équipement change la couleur des anneaux', glow === '#4d7cff', glow);

await place(-33, 0.15, 23, 0);
await sim(0.3);
check('chapitre 1 : retour au refuge', await G(() => window.__nightfall.missions.isDone('m01_first_contact')));

// ================= SAUVEGARDE / RECHARGEMENT =================
await sim(0.5);
await G(() => window.__nightfall.save('test', true));
const saved = await G(() => window.__nightfall.serialize());
await page.reload();
await startGame('#btn-continue');
const re = await G(() => ({ s: window.__nightfall.serialize(), powers: window.__nightfall.hero.powers, night: window.__nightfall.night, parking: window.__nightfall.enemies.filter((e) => e.spawn.group === 'parking').length }));
check('rechargement : missions', JSON.stringify(re.s.missions) === JSON.stringify(saved.missions));
check('rechargement : inventaire', JSON.stringify(re.s.inventory) === JSON.stringify(saved.inventory));
check('rechargement : pouvoirs et nuit restaurés', re.powers.rings && re.powers.flight && re.night === 1);
check('rechargement : groupe vaincu absent', re.parking === 0);

await G(() => { const g = window.__nightfall; g.hero.takeDamage(9999, g.hero.pos.clone().add({ x: 1, y: 0, z: 0 })); });
await page.waitForTimeout(2600);
check('écran de mort', await page.isVisible('.menu.death.on'));
await page.click('[data-act=respawn]');
await sim(0.2);
check('réapparition', !(await G(() => window.__nightfall.hero.dead)));

const ms = await G(() => { const g = window.__nightfall; const t = performance.now(); for (let i = 0; i < 60; i++) g.simulate(1 / 60); return (performance.now() - t) / 60; });
console.log(`Logique de jeu : ${ms.toFixed(2)} ms par image (hors rendu)`);
check('aucune erreur JavaScript', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
