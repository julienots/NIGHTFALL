// Captures de contrôle du rendu (shaders, éclairage, post-traitement) en ville,
// à plusieurs heures de la journée. Usage :
//   node scripts/fxviews.mjs [dossier] [qualité] [phases séparées par des virgules]
// ex. node scripts/fxviews.mjs exports/fx ultra night,morning,evening
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out = 'exports/fx', quality = 'high', phases = 'night,morning'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5207, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(600000);
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
await p.goto('http://localhost:5207/');
await p.evaluate((q) => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q })); }, quality);
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
await p.click('#btn-chapters'); await p.click('[data-ch="ch1"]');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 600000 });
const T0 = Date.now();
const G = async (fn, a) => { const r = await p.evaluate(fn, a); console.log('  étape', ((Date.now() - T0) / 1000).toFixed(1), 's'); return r; };
await G(() => { const g = window.__nightfall; g.stopLoop(); g.rifts.enabled = false; g.hud.el.style.display = 'none'; });

// [nom, position du héros, lacet caméra, distance, tangage]
const SHOTS = [
  ['rue', [3, 0.15, 24], 0, 5, 0.12],
  ['avenue', [0, 0.15, 10], 0.3, 6, 0.05],
  ['carrefour', [-10, 0.15, -6], 2.4, 7, 0.25],
];
const STATIC = [
  ['aerien', [70, 55, 70], [0, 5, 0]],
  ['horizon', [0, 30, 60], [0, 25, -200]],
];
for (const phase of phases.split(',')) {
  await G((ph) => { const g = window.__nightfall; g.setPhase(ph); g.simulate(0.3); }, phase);
  for (const [name, pos, yaw, dist, pitch] of SHOTS) {
    await G(([pos, yaw, dist, pitch]) => {
      const g = window.__nightfall;
      g.hero.placeAt({ x: pos[0], y: pos[1], z: pos[2] }, yaw + Math.PI);
      g.camYaw = yaw; g.camDist = dist; g.camPitch = pitch;
      g.simulate(0.6);
      g.renderOnce();
    }, [pos, yaw, dist, pitch]);
    await p.screenshot({ path: `${out}/${phase}_${name}.png` });
  }
  for (const [name, pos, look] of STATIC) {
    await G(([pos, look]) => {
      const g = window.__nightfall;
      g.camera.position.set(...pos); g.camera.lookAt(...look);
      g.world.update(0.016, g.time, g.camera, g.hero.pos);
      g.composer.render();
    }, [pos, look]);
    await p.screenshot({ path: `${out}/${phase}_${name}.png` });
  }
}
const info = await G(() => {
  const g = window.__nightfall; const i = g.renderer.info;
  return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs?.length };
});
console.log('rendu :', JSON.stringify(info));
console.log('erreurs :', JSON.stringify(errs.slice(0, 8)));
await b.close(); await server.close();
