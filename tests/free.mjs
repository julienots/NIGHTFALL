// Test du Mode libre : horloge jour/nuit continue, portes de commerces et leurs
// intérieurs (interactions réelles), grappin de la Forme Abysse.
// Usage : node tests/free.mjs [dossier de captures]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'exports/screens';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5199, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
p.setDefaultTimeout(180000);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const check = (n, ok, i = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${n} ${i}`); if (!ok) fails++; };
const G = (fn, a) => p.evaluate(fn, a);

await p.goto('http://localhost:5199/');
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: 'low' })); });
await p.click('#start');
await p.waitForTimeout(800);
await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)');
await p.waitForTimeout(300);
await p.keyboard.press('Enter');
await p.click('#btn-chapters');
await p.click('[data-ch=free]');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 180000 });
await p.evaluate(() => window.__nightfall.stopLoop());

// --- Horloge ---
const c0 = await G(() => { const g = window.__nightfall; g.simulate(2); return { free: g.freeRoam, hour: g.clock.hour, phase: g.clock.phase, night: g.night, st: g.story.stage(), umbra: g.hero.powers.umbra }; });
check('mode libre : tous les pouvoirs, histoire passée, matin', c0.free && c0.st === 'free' && c0.umbra && c0.phase === 'morning' && c0.night === -1, JSON.stringify(c0));
const c1 = await G(() => { const g = window.__nightfall; const h0 = g.clock.hour; g.simulate(6); return g.clock.hour - h0; });
check('l’horloge avance (1 h de jeu = 60 s)', Math.abs(c1 - 0.1) < 0.01, c1.toFixed(3));
const dusk = await G(() => { const g = window.__nightfall; g.clock.hour = 19.4; g.skyT = 0; g.simulate(1); return { phase: g.clock.phase, night: g.night }; });
check('crépuscule : ciel intermédiaire', dusk.phase === 'evening' && dusk.night > -0.5 && dusk.night < 0.6, JSON.stringify(dusk));
const night = await G(() => { const g = window.__nightfall; g.clock.hour = 22; g.skyT = 0; g.simulate(1); return { phase: g.clock.phase, night: g.night, enemies: g.enemies.filter((e) => e.alive).length }; });
check('nuit : créatures dehors', night.phase === 'night' && night.night === 1 && night.enemies > 0, JSON.stringify(night));
const morning = await G(() => { const g = window.__nightfall; g.clock.hour = 23.99; g.simulate(1); g.clock.hour = 8.5; g.skyT = 0; g.simulate(1); return { day: g.clock.day, phase: g.clock.phase, enemies: g.enemies.filter((e) => e.alive).length, label: g.clockLabel() }; });
check('nouveau jour, créatures parties', morning.day === 2 && morning.phase === 'morning' && morning.enemies === 0, JSON.stringify(morning));
await G(() => { const g = window.__nightfall; g.camYaw = Math.PI; g.camPitch = 0.18; g.simulate(0.3); g.renderOnce(); });
await p.screenshot({ path: `${out}/50_mode_libre_jour.png` });

// --- Commerces ---
const doors = await G(() => { const by = {}; for (const d of window.__nightfall.shopDoors) by[d.kind] = (by[d.kind] || 0) + 1; return by; });
check('portes praticables pour les 5 intérieurs', ['cafe', 'store', 'boutique', 'arcade', 'lobby'].every((k) => doors[k] > 0), JSON.stringify(doors));
for (const kind of ['cafe', 'store', 'arcade', 'lobby', 'boutique']) {
  const r = await G((kind) => {
    const g = window.__nightfall;
    const h = g.hero;
    if (g.menus.isOpen) g.menus.hide();
    const d = g.shopDoors.filter((x) => x.kind === kind).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    h.placeAt({ x: d.x + d.nx * 0.8, y: 0.15, z: d.z + d.nz * 0.8 }, Math.atan2(-d.nx, -d.nz));
    g.simulate(0.3);
    const prompt = document.querySelector('.prompt').textContent;
    g.input.pressed.add('interact');
    g.simulate(1.3);
    const inside = g.zone;
    const Z = g.interiors.zones[g.zone];
    const it = Z.interact[0];
    h.placeAt({ x: it.pos.x, y: 0, z: it.pos.z - 0.5 }, 0);
    g.simulate(0.3);
    const before = { credits: g.inventory.credits, xp: g.progression.level * 1e5 + g.progression.xp, medkits: g.inventory.count('medkit') };
    h.hp = 10;
    g.input.pressed.add('interact');
    g.simulate(0.4);
    const effect = {
      paid: before.credits - g.inventory.credits,
      healed: h.hp > 10,
      medkit: g.inventory.count('medkit') - before.medkits,
      xp: g.progression.level * 1e5 + g.progression.xp - before.xp,
      menu: g.menus.open,
    };
    while (g.menus.isOpen) g.menus.hide();
    return { prompt, inside, npcs: g.story.students.length, effect, door: d };
  }, kind);
  const e = r.effect;
  const ok = { cafe: e.paid === 15 && e.healed, store: e.paid === 45 && e.medkit === 1, arcade: e.paid === 10 && e.xp > 0, lobby: e.paid === 0 && e.healed, boutique: e.menu === 'shop' }[kind];
  check(`${kind} : porte « ${r.door.name} », intérieur peuplé, interaction réelle`, r.prompt.includes('Entrer') && r.inside === kind && r.npcs >= 1 && ok, JSON.stringify(e));
  if (kind === 'cafe' || kind === 'arcade') {
    await G(() => { const g = window.__nightfall; const Z = g.interiors.zones[g.zone]; g.hero.placeAt({ x: Z.spawn.x + 0.5, y: 0, z: Z.spawn.z + 2.5 }, 0); g.camYaw = 0; g.camPitch = 0.25; g.simulate(0.8); g.renderOnce(); });
    await p.screenshot({ path: `${out}/51_interieur_${kind}.png` });
  }
  await p.waitForTimeout(100);
  const ex = await G((d) => {
    const g = window.__nightfall;
    // (le navigateur de test rouvre la pause en perdant le verrou de souris)
    while (g.menus.isOpen) g.menus.hide();
    const Z = g.interiors.zones[g.zone];
    g.hero.placeAt({ x: Z.exit.x, y: 0, z: Z.exit.z + 0.4 }, Math.PI);
    g.simulate(0.3);
    g.input.pressed.add('interact');
    g.simulate(1.3);
    return { zone: g.zone, d: Math.hypot(g.hero.pos.x - d.x, g.hero.pos.z - d.z) };
  }, r.door);
  check(`${kind} : on ressort devant la même porte`, ex.zone === 'city' && ex.d < 1.5, JSON.stringify(ex));
}

// --- Grappin de la Forme Abysse ---
const gr = await G(() => {
  const g = window.__nightfall;
  while (g.menus.isOpen) g.menus.hide();
  const h = g.hero;
  h.abyss = 100;
  g.input.pressed.add('transform');
  g.simulate(1.6);
  for (let i = 0; i < 8; i++) {
    h.placeAt({ x: 0, y: 0.15, z: 20 }, 0);
    g.simulate(0.2);
    g.camYaw = (i * Math.PI) / 4;
    g.input.pressed.add('magnet');
    g.simulate(0.05);
    if (h.grapple) {
      const y0 = h.pos.y;
      g.simulate(0.4);
      return { form: h.form, ok: true, rise: h.pos.y - y0 };
    }
  }
  return { form: h.form, ok: false };
});
check('Forme Abysse : le grappin tracte Noa vers une façade', gr.form === 'umbra' && gr.ok && gr.rise > 1.5, JSON.stringify(gr));
check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(fails ? 1 : 0);
