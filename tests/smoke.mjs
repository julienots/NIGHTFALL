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

// Fait défiler une conversation : choix n° pick (ou le premier), répliques avancées.
const talkThrough = (pick = 0, max = 60) => G(([pick, max]) => {
  const g = window.__nightfall;
  let n = 0;
  for (; n < max && g.social.active; n++) {
    if (g.hud.dl?.choices) g.hud.choose(Math.min(pick, g.hud.dl.choices.length - 1));
    else g.social.next();
    g.simulate(0.05);
  }
  return n;
}, [pick, max]);
const near = (pos, dx = 1.2, dz = 0) => place(pos.x + dx, pos.y ?? 0.15, pos.z + dz, Math.atan2(-dx, -dz));
const promptText = () => page.evaluate(() => document.querySelector('.prompt').textContent);

// ================= PROLOGUE : COURS DE PHYSIQUE =================
await sim(1);
const pro = await G(() => {
  const g = window.__nightfall;
  return { st: g.story.stage(), zone: g.zone, sit: g.hero.pose, cine: g.story.inCinematic, rings: g.hero.powers.rings, enemies: g.enemies.length, students: g.story.students.length, teacher: !!g.story.teacher };
});
check('prologue : Noa assis en cours de physique, au lycée', pro.st === 'prologue' && pro.zone === 'school' && pro.sit === 'sit' && pro.cine && !pro.rings, JSON.stringify(pro));
check('prologue : classe remplie (élèves + professeur), aucune créature', pro.students >= 5 && pro.teacher && pro.enemies === 0);
await shot('01_cours_physique');
await sim(6);
check('dialogue du professeur (boîte de dialogue)', await G(() => window.__nightfall.social.active && document.querySelector('.dialog.on') !== null));
await shot('02_dialogue_delcourt');
const aff0 = await G(() => window.__nightfall.social.aff.camille);
const nLines = await talkThrough(1);
const aff1 = await G(() => window.__nightfall.social.aff.camille);
check('choix de dialogue : affinité de Camille modifiée', aff1 > aff0, `${aff0} → ${aff1} (${nLines} répliques)`);
await sim(2.2);
await shot('03_fragment');
await sim(10);
const cls = await G(() => ({ step: window.__nightfall.missions.state.p01_after_school.step, sit: window.__nightfall.hero.pose, cine: window.__nightfall.story.inCinematic }));
check('le fragment « pique » Noa, fin du cours', cls.step === 1 && !cls.sit && !cls.cine, JSON.stringify(cls));

// Malik dans le couloir
const mk = await G(() => ({ ...window.__nightfall.social.friends.malik.pos }));
await near(mk, 1.3);
await sim(0.2);
check('Malik est là pour discuter', (await promptText()).includes('Malik'));
await press('interact', 0.1);
await talkThrough(1);
check('scène avec Malik → étape suivante', (await G(() => window.__nightfall.missions.state.p01_after_school.step)) === 2);
await shot('04_couloir');
const lk = await G(() => ({ ...window.__nightfall.interiors.zones.school.locker }));
await near(lk, 0.6, 0.6);
await sim(0.2);
await press('interact', 0.2);
check('casier 117', (await G(() => window.__nightfall.missions.state.p01_after_school.step)) === 3);
const ex = await G(() => ({ ...window.__nightfall.interiors.zones.school.exit }));
await near(ex, 0.8, 0.8);
await sim(0.2);
await press('interact', 0.1);
await sim(1.2);
const outside = await G(() => ({ zone: window.__nightfall.zone, phase: window.__nightfall.clock.phase, x: window.__nightfall.hero.pos.x }));
check('sortie du lycée : retour en ville, fin d’après-midi', outside.zone === 'city' && outside.phase === 'evening' && outside.x > 76, JSON.stringify(outside));
await sim(4);
await shot('05_parvis_lycee');

const p0 = await G(() => ({ ...window.__nightfall.hero.pos }));
await hold(['up'], 1.5);
const p1 = await G(() => ({ ...window.__nightfall.hero.pos }));
check('déplacement', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 6, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);
for (const [act, sign] of [['right', 1], ['left', -1]]) {
  const r = await G(([act]) => {
    const g = window.__nightfall;
    g.simulate(0.5);
    g.renderOnce();
    g.camera.updateMatrixWorld();
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
  const c = st.cars.filter((x) => x.lane.id === 'S' && !x.bus).sort((a, b) => b.s - a.s)[0];
  c.s = -50; c.v = 10;
  const hx = c.lane.base[0], hz = c.lane.base[1] + c.lane.dir[1] * (-50 + 10);
  for (const o of st.cars) if (o !== c && o.lane === c.lane && o.s > -60 && o.s < -30) o.s = 150;
  g.hero.placeAt({ x: hx, y: 0, z: hz }, 0);
  g.simulate(3);
  const gap = (hz - (c.lane.base[1] + c.lane.dir[1] * c.s)) * c.lane.dir[1];
  return { v: c.v, gap };
});
check('une voiture s’arrête devant Noa', stopTest.v < 0.3 && stopTest.gap > 2, JSON.stringify(stopTest));

// Monde ouvert : quartiers, limites
const ow = await G(() => {
  const g = window.__nightfall;
  return { districts: g.districts.districts.length, names: g.districts.districts.map((d) => d.name).join(','), cars: g.magnet.props.length, targets: ['school_door', 'home_door', 'park_cafe', 'park_pond', 'aegis_tower'].every((k) => !!g.world.targets[k]) };
});
check('monde ouvert : quartiers construits', ow.districts >= 6 && ow.targets, JSON.stringify(ow));
const edge = await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: 0, y: 0.15, z: 230 }, 0); g.camYaw = 0; g.input.down.add('up'); g.input.down.add('sprint'); g.simulate(12); g.input.down.clear(); return g.hero.pos.z; });
check('limite de la carte infranchissable', edge < 299, `z=${edge.toFixed(1)}`);

// Inès devant le lycée
const inesP = await G(() => ({ ...window.__nightfall.social.friends.ines.pos }));
await near(inesP, 1.4);
await sim(0.2);
check('Inès est interactive', (await promptText()).includes('Inès'));
await press('interact', 0.1);
await sim(0.5);
await shot('06_ines');
await talkThrough(1);
const s1 = await G(() => window.__nightfall.missions.state.p01_after_school.step);
check('dialogue Inès terminé', s1 === 4);
await sim(12);
await shot('07_message_maman');
await sim(40);
const busT = await G(() => ({ ines: window.__nightfall.social.friends.ines.mode, bus: !!window.__nightfall.world.street.traffic.bus }));
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
const modeAfter = (a) => G((a) => { const g = window.__nightfall; g.simulate(0.8); g.hero.combo = 0; g.input.pressed.add(a); g.simulate(0.15); const m = g.hero.rings.mode; g.simulate(0.9); return m; }, a);
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
check('vol pas encore débloqué', !(await G(() => window.__nightfall.hero.powers.flight)));

// ================= ANNEAUX & MAGNÉTISME =================
const ringGap = await G(() => {
  const g = window.__nightfall; const h = g.hero;
  h.placeAt({ x: 30, y: 0.15, z: -30 }, 0); g.camYaw = 0;
  h.rings.set('idle'); g.simulate(0.6);
  g.input.down.add('up'); g.input.down.add('sprint');
  let worst = 0;
  for (let i = 0; i < 50; i++) {
    g.simulate(1 / 60);
    const el = h.model.joints.elR; el.updateWorldMatrix(true, false);
    const o = el.position.clone().setFromMatrixPosition(el.matrixWorld);
    for (const r of h.rings.rings.filter((r) => r.side === 'R')) worst = Math.max(worst, r.pos.distanceTo(o));
  }
  g.input.down.clear();
  return worst;
});
check('anneaux collés à l’avant-bras pendant la course', ringGap < 0.35, `écart max ${ringGap.toFixed(2)} m`);
const mg = await G(() => {
  const g = window.__nightfall; const h = g.hero;
  const p = g.magnet.props.filter((p) => p.kind === 'car' && p.state === 'rest').sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos))[0];
  h.placeAt({ x: p.pos.x + 7, y: 0.15, z: p.pos.z }, -Math.PI / 2); g.camYaw = -Math.PI / 2; h.energy = 100;
  const foe = g.spawnEnemy({ type: 'stalker', x: p.pos.x - 6, z: p.pos.z, group: 'magtest', patrol: [[p.pos.x - 6, p.pos.z]] });
  foe.stagger(10);
  const hp0 = foe.hp;
  const from = p.pos.clone();
  g.input.pressed.add('magnet'); g.simulate(1.0);
  const held = g.magnet.holding; const y = p.pos.y;
  g.renderOnce();
  g.input.pressed.add('magnet'); g.simulate(3);
  return { held, y, moved: p.pos.distanceTo(from), state: p.state, step: g.missions.state.p03_rings.step, dmg: hp0 - foe.hp };
});
check('magnétisme : une voiture arrachée du sol lévite', mg.held && mg.y > 2.5, JSON.stringify(mg));
check('magnétisme : lancée sur la créature, elle la blesse et retombe', mg.dmg > 20 && mg.moved > 5 && mg.state === 'rest');
check('tutoriel : lancer magnétique validé, vol débloqué', mg.step === 4 && (await G(() => window.__nightfall.hero.powers.flight)));
await G(() => { const g = window.__nightfall; for (const e of g.enemies) if (e.spawn.group === 'magtest') { g.scene.remove(e.model.root); e.alive = false; e.deadT = 99; } });
await place(36, 0.15, -46, 0);

// ================= VOL =================
await sim(0.5);
await press('fly', 0.6);
const f1 = await G(() => ({ flying: window.__nightfall.hero.flying, y: window.__nightfall.hero.pos.y, step: window.__nightfall.missions.state.p03_rings.step }));
check('décollage', f1.flying && f1.y > 2, JSON.stringify(f1));
check('événement vol du tutoriel', f1.step === 5);
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
const storm = await G(() => {
  const g = window.__nightfall; const h = g.hero;
  h.placeAt({ x: 28, y: 6, z: -33 }, 0); h.flying = true; h.grounded = false; h.energy = 100; g.magnet.stormCd = 0;
  const foe = g.spawnEnemy({ type: 'brute', x: 28, z: -40, group: 'stormtest', patrol: [[28, -40]] });
  const hp0 = foe.hp;
  g.input.pressed.add('magnet'); g.simulate(0.8);
  const lifted = g.magnet.props.filter((p) => p.state === 'storm').length;
  g.renderOnce();
  g.simulate(4);
  const left = g.magnet.props.filter((p) => p.state !== 'rest').length;
  foe.alive && g.scene.remove(foe.model.root); foe.alive = false; foe.deadT = 99;
  h.flying = false;
  return { lifted, left, dmg: hp0 - foe.hp };
});
check('tempête de métal (en vol) : objets soulevés puis projetés', storm.lifted >= 3 && storm.left === 0 && storm.dmg > 0, JSON.stringify(storm));
await sim(1);

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

// ================= BOUTIQUE & COMPÉTENCES (vraie interface) =================
await G(() => { const g = window.__nightfall; g.inventory.credits += 500; g.progression.skillPoints += 3; });
await place(-31, 0.15, 30.8, 0);
await press('interact', 0.1);
await page.waitForTimeout(200);
check('terminal : boutique ouverte', await page.isVisible('.menu.shop.on'));
await page.click('[data-section=skins]');
const cr0 = await G(() => window.__nightfall.inventory.credits);
await page.click('[data-key=skin_ember]');
const shopR = await G(() => ({ cr: window.__nightfall.inventory.credits, own: window.__nightfall.inventory.owns('hoodie_ember') }));
check('achat en boutique', shopR.own && shopR.cr === cr0 - 300, JSON.stringify(shopR));
await G(() => { const g = window.__nightfall; const it = g.inventory.items.find((i) => i.id === 'hoodie_ember'); g.inventory.equip(it.uid); g.onEquipmentChanged(); });
check('la tenue change le sweat de Noa', (await G(() => '#' + window.__nightfall.hero.model.mats.hoodie.color.getHexString())) === '#e8553f');
await page.click('[data-act=skills]');
const d0 = await G(() => window.__nightfall.hero.mods.damageMult);
await page.click('[data-act=learn][data-id=f1]');
await page.click('[data-act=learn][data-id=s1]');
const sk = await G(() => ({ d: window.__nightfall.hero.mods.damageMult, hp: window.__nightfall.hero.stats.maxHp, pts: window.__nightfall.progression.skillPoints }));
check('compétences apprises et appliquées', sk.d > d0 && sk.pts >= 1, JSON.stringify(sk));
await shot('19_competences');
await page.click('.menu.skills.on [data-act=close]');
await sim(0.2);

// ================= CHAPITRE 1 (suite) : L'écho d'Aegis =================
await sim(16); // SMS de maman puis appel de Mara
check('mission « L’écho d’Aegis » active', (await G(() => window.__nightfall.missions.state.m02_aegis_echo?.status)) === 'active');
await G(() => { const g = window.__nightfall; g.hero.takeDamage = ((o) => (...a) => { const r = o(...a); if (g.hero.hp < 40) g.hero.hp = g.hero.stats.maxHp; return r; })(g.hero.takeDamage.bind(g.hero)); });
await place(20, 0.15, 30, 0);
await sim(2.5);
const crawl = await G(() => window.__nightfall.enemies.filter((e) => e.type === 'crawler').map((e) => e.state));
check('embuscade : 3 Crawlers tombent des toits', crawl.length === 3, crawl.join(','));
const fightGroup = async (group, maxIter, label) => {
  for (let i = 0; i < maxIter; i++) {
    const left = await G((group) => {
      const g = window.__nightfall;
      const alive = g.enemies.filter((e) => e.alive && e.spawn.group === group);
      if (!alive.length) return 0;
      const e = alive.sort((a, b) => a.pos.distanceTo(g.hero.pos) - b.pos.distanceTo(g.hero.pos))[0];
      const dx = e.pos.x - g.hero.pos.x, dz = e.pos.z - g.hero.pos.z, d = Math.hypot(dx, dz);
      g.camYaw = Math.atan2(dx, dz);
      if (d > 2.4 + e.radius) { g.input.down.add('up'); g.simulate(0.15); g.input.down.delete('up'); }
      else if (g.hero.energy >= 30 && g.hero.powerCd <= 0) { g.input.pressed.add('power'); g.simulate(0.2); }
      else { g.input.pressed.add(Math.random() < 0.3 ? 'heavy' : 'light'); g.simulate(0.15); }
      return alive.length;
    }, group);
    if (!left) return true;
    if (i === 20 && label) await shot(label);
  }
  return false;
};
check('Crawlers vaincus', await fightGroup('crawlers', 400, '20_crawlers'));
const dpos = await G(() => ({ ...window.__nightfall.world.targets.aegis_drone }));
await place(dpos.x - 1.2, 0.15, dpos.z, Math.PI / 2);
await sim(0.2);
await press('interact', 0.1);
await sim(2);
check('enregistrement du père récupéré', (await G(() => window.__nightfall.missions.state.m02_aegis_echo.step)) === 3);
await place(-33, 0.15, 23, 0);
await sim(0.5);
check('« L’écho d’Aegis » terminée, « Le Colosse » commence', await G(() => window.__nightfall.missions.isDone('m02_aegis_echo') && window.__nightfall.missions.state.m03_colossus?.status === 'active'));

// ================= BOSS : LE COLOSSE =================
await sim(10);
await place(0, 0.15, 10, Math.PI);
await sim(2.2);
check('cinématique d’apparition du Colosse', await G(() => window.__nightfall.story.inCinematic && !!window.__nightfall.boss));
await sim(5);
await shot('21_colosse_emerge');
await sim(9);
const bossInfo = await G(() => { const b = window.__nightfall.boss; return { st: b.state, y: b.pos.y, hp: b.hp }; });
check('le Colosse est sorti et combat', bossInfo.st !== 'intro' && bossInfo.y > 0, JSON.stringify(bossInfo));
const armor = await G(() => {
  const g = window.__nightfall; const b = g.boss; const dir = { x: 0, y: 0, z: 1 };
  b.state = 'walk'; b.exposed = false; let h0 = b.hp; b.takeHit({ damage: 100, dir }); const closed = h0 - b.hp;
  b.stagger(3); b.update(0.016); h0 = b.hp; b.takeHit({ damage: 100, dir }); const open = h0 - b.hp;
  return { closed, open, exposed: b.exposed };
});
check('armure vs noyaux exposés (la parade l’étourdit)', armor.open > armor.closed * 4 && armor.exposed, JSON.stringify(armor));
const seen = new Set();
for (let i = 0; i < 220; i++) {
  const st = await G(() => { const g = window.__nightfall; g.simulate(0.1); const b = g.boss; return b ? b.state : 'none'; });
  seen.add(st);
}
console.log('   attaques du Colosse observées :', [...seen].join(', '));
check('le Colosse utilise plusieurs attaques', ['slamWindup', 'sweepWindup', 'stompWindup', 'slam', 'sweep', 'stomp'].filter((x) => seen.has(x)).length >= 2);
await shot('22_combat_colosse');
const ph = await G(() => { const g = window.__nightfall; const b = g.boss; b.state = 'walk'; b.exposed = true; b.takeHit({ damage: Math.ceil((b.hp - b.def.hp * 0.3 + 10) / 2.5), dir: { x: 0, y: 0, z: 1 } }); return b.stage; });
check('passage en phase 3 (rage + renforts)', ph === 3 && (await G(() => window.__nightfall.enemies.filter((e) => e.spawn.group === 'colossus_adds').length)) === 2);
await G(() => { const g = window.__nightfall; const b = g.boss; b.state = 'stun'; b.stunFor = 30; b.exposed = true; b.hp = 50; g.hero.takeDamage = () => false; g.hero.hp = g.hero.stats.maxHp; });
await fightGroup('colossus', 200);
await sim(6);
check('Colosse vaincu', await G(() => window.__nightfall.missions.state.m03_colossus.step === 2));
const cache = await G(() => window.__nightfall.crates.find((c) => c.id === 'boss_cache').root.visible);
check('la cache du Colosse apparaît', cache);
await place(-13, 0.15, -14.6, 0);
await press('interact', 0.1);
await press('interact', 0.1);
await page.waitForTimeout(1200);
await sim(1.2);
await shot('23_cache_colosse');
await press('interact', 0.05);
check('fin du chapitre 1', await G(() => window.__nightfall.missions.isDone('m03_colossus')));
check('butin de boss (Noyau du Vide)', await G(() => window.__nightfall.inventory.owns('void_phalanx')));

// ================= L'OMBRE (symbiote) =================
await sim(24);
const oz = await G(() => ({ m04: window.__nightfall.missions.state.m04_umbra?.status, ooze: !!window.__nightfall.story.ooze }));
check('« L’Ombre » : la flaque noire attend sur la place', oz.m04 === 'active' && oz.ooze, JSON.stringify(oz));
const opos = await G(() => ({ ...window.__nightfall.world.targets.abyss_ooze }));
await near(opos, 1.8);
await sim(0.2);
await press('interact', 0.1);
await sim(4);
await shot('24_ombre_bondit');
await sim(14);
const bond = await G(() => ({ umbra: window.__nightfall.hero.powers.umbra, abyss: window.__nightfall.hero.abyss, step: window.__nightfall.missions.state.m04_umbra.step }));
check('l’Ombre se lie à Noa (jauge pleine)', bond.umbra && bond.abyss >= 99 && bond.step === 1, JSON.stringify(bond));
await press('transform', 0.2);
await sim(1.4);
const tf = await G(() => { const h = window.__nightfall.hero; return { form: h.form, um: h.umbraModel.root.visible, hu: h.model.root.visible, rings: h.rings.mode, step: window.__nightfall.missions.state.m04_umbra.step }; });
check('transformation en Forme Abysse', tf.form === 'umbra' && tf.um && !tf.hu && tf.rings === 'hidden' && tf.step === 2, JSON.stringify(tf));
await shot('25_forme_abysse');
const pulled = await G(() => {
  const g = window.__nightfall; const h = g.hero;
  const e = g.enemies.filter((x) => x.alive && x.spawn.group === 'umbra_test').sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos))[0];
  e.pos.set(h.pos.x + 8, e.pos.y, h.pos.z); e.vel.set(0, 0, 0); e.stagger(3);
  h.yaw = Math.PI / 2; g.camYaw = Math.PI / 2; g.lockTarget = e;
  const d0 = e.pos.distanceTo(h.pos);
  g.input.pressed.add('heavy'); g.simulate(1.0);
  g.lockTarget = null;
  return { d0, d1: e.pos.distanceTo(h.pos) };
});
check('tentacules : la créature est attirée vers Noa', pulled.d1 < pulled.d0 - 2, JSON.stringify(pulled));
check('créatures de test vaincues en Forme Abysse', await fightGroup('umbra_test', 500, '26_combat_abysse'));
const rv = await G(() => { const g = window.__nightfall; g.hero.abyss = 0.3; g.simulate(1.2); return g.hero.form; });
check('jauge vide : retour à la forme humaine', rv === 'human');
check('étape : rentrer à la maison', (await G(() => window.__nightfall.missions.state.m04_umbra.step)) === 3);
const hd = await G(() => ({ ...window.__nightfall.world.targets.home_door }));
await place(hd.x, 0.15, hd.z - 1, 0);
await sim(0.5);
check('« L’Ombre » terminée', await G(() => window.__nightfall.missions.isDone('m04_umbra')));
await sim(8);
const morning = await G(() => ({ zone: window.__nightfall.zone, day: window.__nightfall.clock.day, phase: window.__nightfall.clock.phase, d01: window.__nightfall.missions.state.d01_double_life?.status, night: window.__nightfall.night, enemies: window.__nightfall.enemies.filter((e) => e.alive).length }));
check('le lendemain : réveil chez soi, jour 2, matin', morning.zone === 'home' && morning.day === 2 && morning.phase === 'morning' && morning.d01 === 'active', JSON.stringify(morning));
check('le jour : ciel de jour, aucune créature', morning.night === -1 && morning.enemies === 0);
await sim(10);
await shot('27_chambre');

// ================= CHAPITRE 2 : DOUBLE VIE =================
const hx = await G(() => ({ ...window.__nightfall.interiors.zones.home.exit }));
await near(hx, 0.8, 0.8);
await sim(0.2);
await press('interact', 0.1);
await sim(1.2);
check('sortie de la maison', (await G(() => window.__nightfall.zone)) === 'city');
await G(() => { const g = window.__nightfall; g.camYaw = Math.PI; g.camPitch = 0.2; });
await sim(1);
await shot('28_matin_tilleuls');
const sd = await G(() => ({ ...window.__nightfall.world.targets.school_door }));
await place(sd.x, 0.15, sd.z - 1.2, 0);
await sim(0.2);
check('porte du lycée interactive', (await promptText()).includes('lycée'));
await press('interact', 0.1);
await sim(1.2);
const insch = await G(() => ({ zone: window.__nightfall.zone, step: window.__nightfall.missions.state.d01_double_life.step, students: window.__nightfall.story.students.length }));
check('au lycée : élèves présents, étape validée', insch.zone === 'school' && insch.step === 1 && insch.students >= 5, JSON.stringify(insch));
await shot('29_hall_lycee');
const ip = await G(() => ({ ...window.__nightfall.social.friends.ines.pos }));
await near(ip, 1.3);
await sim(0.2);
await press('interact', 0.1);
const affI0 = await G(() => window.__nightfall.social.aff.ines);
await talkThrough(2);
check('Inès à la cafétéria (scène à choix)', (await G(() => window.__nightfall.missions.state.d01_double_life.step)) === 2 && (await G(() => window.__nightfall.social.aff.ines)) > affI0);
const lessonPos = await G(() => window.__nightfall.story.interactables().find((i) => i.id === 'lesson')?.pos);
check('place de cours proposée', !!lessonPos);
await near(lessonPos, 0.5, 0.5);
await sim(0.2);
const xp0 = await G(() => window.__nightfall.progression.xp + window.__nightfall.progression.level * 10000);
await press('interact', 0.1);
await sim(0.5);
check('en cours : Noa assis', (await G(() => window.__nightfall.hero.pose)) === 'sit');
await shot('30_cours');
await talkThrough(1);
await sim(0.5);
const les = await G(() => ({ step: window.__nightfall.missions.state.d01_double_life.step, phase: window.__nightfall.clock.phase, grades: window.__nightfall.social.grades.length, xp: window.__nightfall.progression.xp + window.__nightfall.progression.level * 10000 }));
check('cours suivi : note, XP, après-midi', les.step === 3 && les.phase === 'afternoon' && les.grades === 1 && les.xp > xp0, JSON.stringify(les));
const sx = await G(() => ({ ...window.__nightfall.interiors.zones.school.exit }));
await near(sx, 0.8, 0.8);
await sim(0.2);
await press('interact', 0.1);
await sim(1.2);
const cp2 = await G(() => ({ ...window.__nightfall.social.friends.camille.pos, vis: window.__nightfall.social.friends.camille.model.root.visible }));
await near(cp2, 1.3);
await sim(0.3);
check('Camille à l’étang du parc', (await promptText()).includes('Camille'), JSON.stringify(cp2));
await press('interact', 0.1);
await sim(0.3);
await shot('31_camille_etang');
await talkThrough(0);
check('scène avec Camille', (await G(() => window.__nightfall.missions.state.d01_double_life.step)) === 4);
await place(hd.x, 0.15, hd.z - 1.2, 0);
await sim(0.2);
await press('interact', 0.1);
await sim(1.2);
const bed = await G(() => ({ ...window.__nightfall.interiors.zones.home.bed }));
await near(bed, 0.9, 0.9);
await sim(0.2);
check('lit : attendre la nuit', (await promptText()).includes('nuit'));
await press('interact', 0.1);
await sim(1.4);
const nt = await G(() => ({ phase: window.__nightfall.clock.phase, d01: window.__nightfall.missions.isDone('d01_double_life'), n01: window.__nightfall.missions.state.n01_night_watch?.status, enemies: window.__nightfall.enemies.filter((e) => e.alive).length }));
check('la nuit tombe : « Double vie » terminée, ronde de nuit, créatures dehors', nt.phase === 'night' && nt.d01 && nt.n01 === 'active' && nt.enemies >= 6, JSON.stringify(nt));

// Cadeau, rendez-vous et couple
await G(() => { const g = window.__nightfall; g.social.aff.ines = 58; g.inventory.add('gift_flowers', 1); g.setPhase('afternoon'); g.enterZone('city', { x: 0, y: 0.15, z: 20, yaw: 0 }); });
const ic = await G(() => ({ ...window.__nightfall.social.friends.ines.pos }));
await near(ic, 1.3);
await sim(0.2);
await press('interact', 0.1);
await G(() => window.__nightfall.social.next()); // salutation → menu
const opts = await G(() => window.__nightfall.hud.dl?.choices || []);
check('menu d’amitié : cadeau et rendez-vous proposés', opts.some((o) => o.includes('cadeau')) && opts.some((o) => o.includes('rendez-vous')), opts.join(' | '));
await G((i) => window.__nightfall.hud.choose(i), opts.findIndex((o) => o.includes('rendez-vous')));
await sim(0.2);
await sim(1.3);
check('rendez-vous au café du parc', await G(() => window.__nightfall.social.active));
await shot('32_rendez_vous');
await talkThrough(0);
await sim(0.2);
await talkThrough(0);
const love = await G(() => ({ p: window.__nightfall.social.partner, m: window.__nightfall.social.xpMult }));
check('déclaration : en couple avec Inès (+10 % XP)', love.p === 'ines' && love.m === 1.1, JSON.stringify(love));
await press('relations', 0.1);
await page.waitForTimeout(200);
check('menu Relations', await page.isVisible('.menu.relations.on'));
await shot('33_relations');
await press('relations', 0.1);
await G(() => { const g = window.__nightfall; g.menus.hide(); });

// ================= SAUVEGARDE / RECHARGEMENT =================
await sim(0.5);
await G(() => window.__nightfall.save('test', true));
const saved = await G(() => window.__nightfall.serialize());
await page.reload();
await startGame('#btn-continue');
const re = await G(() => ({ s: window.__nightfall.serialize(), powers: window.__nightfall.hero.powers, night: window.__nightfall.night, parking: window.__nightfall.enemies.filter((e) => e.spawn.group === 'parking').length }));
check('rechargement : missions', JSON.stringify(re.s.missions) === JSON.stringify(saved.missions));
check('rechargement : inventaire', JSON.stringify(re.s.inventory) === JSON.stringify(saved.inventory));
check('rechargement : relations, couple et horloge', JSON.stringify(re.s.social) === JSON.stringify(saved.social) && JSON.stringify(re.s.clock) === JSON.stringify(saved.clock), JSON.stringify(re.s.clock));
check('rechargement : pouvoirs restaurés', re.powers.rings && re.powers.flight && re.powers.magnet && re.powers.umbra);
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
