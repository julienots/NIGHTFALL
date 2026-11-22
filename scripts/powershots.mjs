// Captures des pouvoirs en combat dans le monde ouvert (caméra de jeu).
// Usage : node scripts/powershots.mjs [dossier] [qualité]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [out = 'exports/powers', quality = 'high'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5217, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.setDefaultTimeout(600000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5217/');
await p.evaluate((q) => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q })); }, quality);
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
await p.click('#btn-new');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 600000 });
const G = (fn, a) => p.evaluate(fn, a);
await G(() => {
  const g = window.__nightfall; g.stopLoop(); g.rifts.enabled = false; g.hud.el.style.display = 'none';
  g.story.hintTimer = 0; g.setPhase('evening');
  g.hero.takeDamage = () => false;
  window.__arena = (n = 4, type = 'stalker') => {
    for (const e of g.enemies) { e.alive = false; e.model.root.visible = false; }
    const x = -30, z = 80;
    g.hero.placeAt({ x, y: g.col.terrainAt(x, z), z }, Math.PI);
    g.hero.energy = 999; g.hero.abyss = 100;
    g.camYaw = 0; g.camDist = 7; g.camPitch = 0.2;
    for (let i = 0; i < n; i++) {
      const e = g.spawnEnemy({ type, x: x + (i - (n - 1) / 2) * 2.6, z: z - 6 - (i % 2) * 2, group: 'test', patrol: [[x, z - 6]] });
      e.alertTo?.(g.hero.pos);
    }
    g.simulate(0.4);
  };
});
const shot = async (name, setup, waits) => {
  await G(setup);
  for (const [i, w] of waits.entries()) {
    await G((w) => { const g = window.__nightfall; g.simulate(w); g.renderOnce(); }, w);
    await p.screenshot({ path: `${out}/${name}_${i}.png` });
  }
};
await shot('fouet', () => { window.__arena(4); const g = window.__nightfall; g.input.pressed.add('heavy'); }, [0.36, 0.08]);
await shot('rafale', () => { window.__arena(5); const g = window.__nightfall; g.input.pressed.add('power'); }, [0.33, 0.3]);
await shot('pique', () => {
  window.__arena(4); const g = window.__nightfall;
  g.input.pressed.add('fly'); g.simulate(0.4); g.input.down.add('jump'); g.simulate(1.2); g.input.down.delete('jump');
  g.camDist = 9; g.camPitch = 0.35; g.input.pressed.add('light');
}, [0.5, 0.25]);
await shot('abysse', () => {
  window.__arena(5, 'brute'); const g = window.__nightfall;
  g.input.pressed.add('transform'); g.simulate(2.2); g.camDist = 8; g.input.pressed.add('power');
}, [0.32, 0.12]);
await shot('magnetisme', () => {
  const g = window.__nightfall; window.__arena(3);
  if (g.hero.form === 'umbra') { g.input.pressed.add('transform'); g.simulate(1.5); }
  const r = g.magnet.props.find((p) => p.kind === 'boulder');
  r.pos.set(g.hero.pos.x + 3, g.col.terrainAt(g.hero.pos.x + 3, g.hero.pos.z), g.hero.pos.z);
  g.input.pressed.add('magnet');
}, [1.0, 0.2]);
await G(() => { const g = window.__nightfall; g.input.pressed.add('magnet'); g.simulate(0.45); g.renderOnce(); });
await p.screenshot({ path: `${out}/magnetisme_2.png` });
console.log('erreurs', JSON.stringify(errs.slice(0, 5)));
await b.close(); await server.close();
