// Captures des intérieurs (lycée le matin, maison le soir) : contrôle de l'éclairage.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [out = 'exports/fx', quality = 'high'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5210, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(300000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5210/');
await p.evaluate((q) => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q })); }, quality);
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
await p.click('#btn-new');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 300000 });
const shots = [['school', 'morning', 0], ['school', 'afternoon', 2.5], ['home', 'evening', 0], ['home', 'night', 1.5]];
for (const [zone, phase, yaw] of shots) {
  await p.evaluate(([zone, phase, yaw]) => {
    const g = window.__nightfall; g.stopLoop(); g.hud.el.style.display = 'none';
    g.setPhase(phase); g.enterZone(zone); g.camYaw += yaw; g.camDist = 4; g.simulate(0.5); g.renderOnce();
  }, [zone, phase, yaw]);
  await p.screenshot({ path: `${out}/in_${zone}_${phase}.png` });
}
console.log('erreurs :', JSON.stringify(errs.slice(0, 5)));
await b.close(); await server.close();
