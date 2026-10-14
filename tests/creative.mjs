// Test du Mode Créatif : tous les pouvoirs, menu de création (créatures, héros
// alliés, police, heure, réglages) et les cinq pouvoirs créatifs ; passants
// frappables et police (recherche, poursuite, fuite par les toits).
// Usage : node tests/creative.mjs [dossier de captures]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'exports/screens';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5201, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
p.setDefaultTimeout(180000);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const check = (n, ok, i = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${n} ${i}`); if (!ok) fails++; };
const G = (fn, a) => p.evaluate(fn, a);
const shot = async (name) => { await G(() => window.__nightfall.renderOnce()); await p.screenshot({ path: `${out}/${name}.png` }); };

await p.goto('http://localhost:5201/');
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: 'low' })); });
await p.click('#start');
await p.waitForTimeout(800);
await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)');
await p.waitForTimeout(300);
await p.keyboard.press('Enter');
await p.click('#btn-chapters');
await p.click('[data-ch=crea]');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 180000 });
await p.evaluate(() => window.__nightfall.stopLoop());

const s0 = await G(() => { const g = window.__nightfall; g.simulate(2); return { crea: !!g.creative, powers: g.hero.powers, lvl: g.progression.level, credits: g.inventory.credits }; });
check('mode créatif : tous les pouvoirs, niveau 20', s0.crea && s0.powers.rings && s0.powers.flight && s0.powers.magnet && s0.powers.umbra && s0.lvl === 20, JSON.stringify(s0));

// --- Menu de création ---
await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: 0, y: 0.15, z: 24 }, Math.PI); g.camYaw = Math.PI; g.input.pressed.add('crea'); g.simulate(0.05); });
check('touche B : menu créatif', await p.isVisible('.menu.crea.on'));
await p.click('.menu.crea [data-op="m:wave"]');
const wave = await G(() => window.__nightfall.enemies.filter((e) => e.alive && e.spawn.group === 'crea').length);
check('vague de 6 créatures', wave === 6, String(wave));
await G(() => { const g = window.__nightfall; while (g.menus.isOpen) g.menus.hide(); g.input.pressed.add('crea'); g.simulate(0.05); });
await p.click('.menu.crea [data-op="h:volt"]');
await G(() => { const g = window.__nightfall; while (g.menus.isOpen) g.menus.hide(); g.input.pressed.add('crea'); g.simulate(0.05); });
await p.click('.menu.crea [data-op="h:brasier"]');
await G(() => { const g = window.__nightfall; while (g.menus.isOpen) g.menus.hide(); g.creative.invincible = true; });
check('deux héros alliés en jeu', (await G(() => window.__nightfall.allies.length)) === 2);
await G(() => window.__nightfall.simulate(1.5));
await shot('60_creatif_heros');
// Les héros combattent seuls : on attend sans que Noa frappe.
const fight = await G(() => {
  const g = window.__nightfall;
  const left0 = g.enemies.filter((e) => e.alive && e.spawn.group === 'crea').length;
  const hp0 = g.enemies.filter((e) => e.alive).reduce((a, e) => a + e.hp, 0);
  for (let i = 0; i < 40; i++) g.simulate(0.5);
  const left = g.enemies.filter((e) => e.alive && e.spawn.group === 'crea').length;
  return { left0, left, states: g.allies.map((a) => a.name + ':' + a.state), dmg: hp0 - g.enemies.filter((e) => e.alive).reduce((a, e) => a + e.hp, 0) };
});
check('les héros alliés combattent et éliminent des créatures', fight.left < fight.left0, JSON.stringify(fight));
const follow = await G(() => { const g = window.__nightfall; g.creative.clearMonsters(); g.hero.placeAt({ x: 20, y: 0.15, z: 9.4 }, 0); for (let i = 0; i < 16; i++) g.simulate(0.5); return g.allies.map((a) => +a.pos.distanceTo(g.hero.pos).toFixed(1)); });
check('sans ennemi, les héros escortent Noa', follow.every((d) => d < 8), JSON.stringify(follow));

// --- Pouvoirs créatifs ---
const pw = await G(() => {
  const g = window.__nightfall;
  const C = g.creative;
  const res = {};
  for (let i = 0; i < 5; i++) {
    C.clearMonsters();
    g.hero.placeAt({ x: 0, y: 0.15, z: 24 }, Math.PI);
    g.camYaw = Math.PI;
    g.simulate(0.2);
    for (let k = 0; k < 3; k++) C.spawnMonster('stalker');
    const es = g.enemies.filter((e) => e.alive);
    for (const e of es) { e.hp = 999; e.alertTo = () => {}; }
    const hp0 = es.reduce((a, e) => a + e.hp, 0);
    const p0 = g.hero.pos.clone();
    C.select(i);
    C.cd = 0;
    g.input.pressed.add('creaPower');
    g.simulate(3);
    const hp1 = es.reduce((a, e) => a + Math.max(0, e.hp), 0);
    res[C.current.id] = { dmg: hp0 - hp1, moved: +g.hero.pos.distanceTo(p0).toFixed(1) };
  }
  return res;
});
check('Singularité : aspire et explose', pw.singularity.dmg > 0, JSON.stringify(pw.singularity));
check('Chaîne d’éclairs : touche plusieurs cibles', pw.chain.dmg >= 180, JSON.stringify(pw.chain));
check('Gel : fige les créatures', pw.freeze.dmg >= 0, JSON.stringify(pw.freeze));
check('Téléportation : bond vers l’avant', pw.blink.moved > 5, JSON.stringify(pw.blink));
check('Météore : impact de zone', pw.meteor.dmg > 0, JSON.stringify(pw.meteor));
await G(() => { const g = window.__nightfall; g.creative.clearMonsters(); g.creative.select(4); g.creative.cd = 0; g.input.pressed.add('creaPower'); g.simulate(1.15); g.camPitch = 0.3; });
await shot('61_creatif_meteore');

// --- Passants et police ---
const pol = await G(() => {
  const g = window.__nightfall;
  const h = g.hero;
  g.creative.invincible = false;
  g.creative.clearAllies();
  g.clock.hour = 10;
  g.simulate(1);
  const n = g.story.npcs.filter((x) => x.alive && x.mode !== 'gone').sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos))[0];
  h.placeAt({ x: n.pos.x - 1.2, y: n.pos.y, z: n.pos.z }, Math.PI / 2);
  n.mode = 'idle';
  n.route = [];
  g.simulate(0.1);
  for (let i = 0; i < 8 && n.alive; i++) {
    g.input.pressed.add('light');
    g.simulate(0.4);
  }
  const ko = !n.alive;
  const stars = g.police.stars;
  g.simulate(10);
  return { ko, stars, officers: g.police.officers.length, chasing: g.police.officers.filter((o) => o.state === 'chase' || o.state === 'arrest').length };
});
check('frapper un passant : K.O. et recherché par la police', pol.ko && pol.stars >= 1 && pol.officers >= 1 && pol.chasing >= 1, JSON.stringify(pol));
await G(() => { const g = window.__nightfall; g.camPitch = 0.25; g.simulate(0.2); });
await shot('62_police');
const esc = await G(() => { const g = window.__nightfall; g.hero.placeAt({ x: g.hero.pos.x, y: 30, z: g.hero.pos.z }, 0); g.hero.flying = true; for (let i = 0; i < 40; i++) g.simulate(1); return { stars: g.police.stars }; });
check('fuite par les airs : la police perd ta trace', esc.stars === 0, JSON.stringify(esc));
check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(fails ? 1 : 0);
