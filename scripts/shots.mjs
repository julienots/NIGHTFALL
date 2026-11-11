// Captures de contrôle visuel de la refonte : écran titre, HUD, héros, combat, menus.
// Usage : node scripts/shots.mjs [dossier] [qualité]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [out = 'exports/shots', quality = 'medium'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5193, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(300000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5193/');
await p.evaluate((q) => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q })); }, quality);
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(600);
await p.keyboard.press('Enter'); await p.waitForTimeout(400);
await p.click('#btn-chapters'); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/00_titre.png` });
await p.click('[data-ch="ch1"]');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 300000 }).catch((e) => { console.log(errs); throw e; });
const G = (fn, a) => p.evaluate(fn, a);
await G(() => { const g = window.__nightfall; g.stopLoop(); g.simulate(1.5); });
const shot = async (n) => { await G(() => window.__nightfall.renderOnce()); await p.screenshot({ path: `${out}/${n}.png` }); };
await shot('01_ch1_depart');
// Gros plan du héros
await G(() => { const g = window.__nightfall; g.camDist = 2.6; g.camPitch = 0.12; g.camYaw = g.hero.yaw + Math.PI; g.simulate(0.6); });
await shot('02_heros_gros_plan');
// Combat : Veilleur, Stalker d'élite et Crawler devant la caméra
const info = await G(() => {
  const g = window.__nightfall; g.camDist = 5.2; g.camPitch = 0.22;
  g.hero.placeAt({ x: 3, y: 0.15, z: 24 }, Math.PI); g.camYaw = Math.PI; g.simulate(0.3);
  const h = g.hero.pos; const f = { x: Math.sin(g.camYaw), z: Math.cos(g.camYaw) };
  const out = [];
  [['wisp', -2.5, 9, null], ['stalker', 1.5, 6, 'enraged'], ['crawler', 3.5, 8, null]].forEach(([t, side, dist, elite]) => {
    const e = g.spawnEnemy({ type: t, x: h.x + f.x * dist - f.z * side, z: h.z + f.z * dist + f.x * side, group: 'test', elite, patrol: [[h.x, h.z]] });
    e.alertTo(h); out.push(e.name);
  });
  g.simulate(1.0); g.input.pressed.add('light'); g.simulate(0.12); g.input.pressed.add('light'); g.simulate(0.1);
  return out;
});
await shot('03_combat');
await G(() => { const g = window.__nightfall; g.input.pressed.add('power'); g.simulate(0.3); });
await shot('04_rafale');
await G(() => { const g = window.__nightfall; for (let i = 0; i < 12; i++) { g.input.pressed.add(i % 3 ? 'light' : 'heavy'); g.simulate(0.25); } g.input.pressed.add('dodge'); g.simulate(0.12); });
await shot('04b_combo_esquive');
// Faille instable
await G(() => { const g = window.__nightfall; for (const e of g.enemies) if (e.spawn.group === 'test') { e.hp = 0; e.alive = false; e.model.root.visible = false; }
  const h = g.hero.pos; g.rifts.spawnNear({ x: h.x - 14, z: h.z + 4 }); g.simulate(2.5); g.camDist = 7; g.camPitch = 0.05; g.camYaw = Math.atan2(-14, 4); g.simulate(0.4); });
await shot('04c_faille');
await G(() => { const g = window.__nightfall; g.camDist = 4.6; g.camPitch = 0.28; });
await G(() => { const g = window.__nightfall; g.menus.show('pause'); });
await p.waitForTimeout(300); await p.screenshot({ path: `${out}/05_pause.png` });
await G(() => { const g = window.__nightfall; g.menus.hide(); g.menus.show('inventory'); });
await p.waitForTimeout(300); await p.screenshot({ path: `${out}/06_inventaire.png` });
await G(() => { const g = window.__nightfall; g.menus.hide(); g.menus.show('worldmap'); });
await p.waitForTimeout(300); await p.screenshot({ path: `${out}/06b_carte.png` });
await G(() => { const g = window.__nightfall; g.menus.hide(); });
// Vue aérienne de jour
await G(() => { const g = window.__nightfall; g.setPhase('afternoon'); g.hud.el.style.display = 'none'; g.simulate(0.2);
  g.camera.position.set(90, 70, 90); g.camera.lookAt(0, 0, 0); g.world.update(0.016, g.time, g.camera, g.hero.pos); g.composer.render(); });
await p.screenshot({ path: `${out}/07_aerien_jour.png` });
await G(() => { const g = window.__nightfall; g.setPhase('night'); g.simulate(0.2);
  g.camera.position.set(6, 2.2, 30); g.camera.lookAt(0, 5, -10); g.world.update(0.016, g.time, g.camera, g.hero.pos); g.composer.render(); });
await p.screenshot({ path: `${out}/08_rue_nuit.png` });
console.log('spawn', JSON.stringify(info), 'rifts', await G(() => window.__nightfall.rifts.active.map((r) => r.state + ':' + r.wave).join(',')), 'erreurs', JSON.stringify(errs.slice(0, 10)));
await b.close(); await server.close();
