// Vitrine des personnages réalistes en jeu. Usage : node scripts/realistic/showcase.mjs [dossier]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'exports/realistic';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5201, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(600000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5201/');
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: 'high' })); });
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(500); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
await p.click('#btn-chapters'); await p.click('[data-ch="ch1"]');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 600000 });
const G = (fn, a) => p.evaluate(fn, a);
const shot = async (n) => { await G(() => { const g = window.__nightfall; g.hud.el.style.display = 'none'; g.renderOnce(); }); await p.screenshot({ path: `${out}/${n}.png` }); };
await G(() => { const g = window.__nightfall; g.stopLoop(); g.rifts.enabled = false; g.setPhase('evening'); g.hero.placeAt({ x: 3, y: 0.15, z: 24 }, 0); g.simulate(0.5); });
// Casting : tous les personnages alignés face caméra
await G(async () => {
  const g = window.__nightfall;
  const { Npc } = await import('/src/game/actors/npc.js');
  const roles = [['ines', 'wave'], ['camille', 'talk'], ['malik', 'phone'], ['theo', 'victory'], ['delcourt', 'talk'], ['mara', null]];
  window.__cast = roles.map(([pal, anim], i) => {
    const n = new Npc(g, { id: 'show' + i, palette: pal, x: 3 + (i - 2.5) * 1.3, z: 30, yaw: Math.PI });
    if (anim) n.play(anim, 30);
    return n;
  });
  for (let i = 0; i < 40; i++) { window.__cast.forEach((n) => n.update(1 / 30)); g.simulate(1 / 30); }
  g.hero.model.root.visible = false;
  g.camera.position.set(3, 1.5, 24.5); g.camera.lookAt(3, 1.0, 30);
});
await p.evaluate(() => { const g = window.__nightfall; g.world.update(0.016, g.time, g.camera, g.hero.pos); g.composer.render(); });
await p.screenshot({ path: `${out}/01_casting.png` });
// Noa de face, tenue de nuit
await G(() => {
  const g = window.__nightfall; window.__cast.forEach((n) => n.dispose());
  g.setPhase('night'); g.hero.model.root.visible = true; g.hero.placeAt({ x: 3, y: 0.15, z: 24 }, 0); g.simulate(0.6);
  g.hero.yaw = Math.PI; g.camYaw = 0.25; g.camDist = 1.5; g.camPitch = 0.02; g.simulate(0.3);
});
await shot('02_noa_masque');
// Combat contre une Brute
await G(() => {
  const g = window.__nightfall;
  const e = g.spawnEnemy({ type: 'brute', x: 3, z: 30, group: 'test', patrol: [[3, 30]] }); e.alertTo(g.hero.pos);
  g.camYaw = 0; g.camDist = 6; g.camPitch = 0.15; g.simulate(2.2);
});
await shot('03_brute');
await G(() => { const g = window.__nightfall; g.input.pressed.add('light'); g.simulate(0.14); });
await shot('04_coup');
await G(() => { const g = window.__nightfall; g.simulate(0.3); g.input.pressed.add('heavy'); g.simulate(0.35); });
await shot('05_fouet');
// Forme Abysse
await G(() => { const g = window.__nightfall; for (const e of g.enemies) { e.alive = false; e.model.root.visible = false; }
  g.hero.powers.umbra = true; g.hero.abyss = 100; g.input.pressed.add('transform'); g.simulate(2.0); g.camDist = 4; g.camYaw = Math.PI; g.simulate(0.4); });
await G(() => { const g = window.__nightfall; g.hero.yaw = Math.PI; g.camYaw = 0.3; g.camDist = 3.2; g.camPitch = 0.08; g.simulate(0.3); });
await shot('06_abysse');
await G(() => { const g = window.__nightfall; g.input.pressed.add('power'); g.simulate(0.5); });
await shot('07_rugissement');
// Vol
await G(() => { const g = window.__nightfall; g.hero.abyss = 0.1; g.simulate(1.5); g.camYaw = 0; g.input.pressed.add('fly'); g.simulate(1.0); g.input.down.add('up'); g.input.down.add('sprint'); g.simulate(1.0); g.camDist = 5; g.camYaw = 0.9; g.simulate(0.2); });
await shot('08_vol');
console.log('erreurs', JSON.stringify(errs.slice(0, 5)));
await b.close(); await server.close();
