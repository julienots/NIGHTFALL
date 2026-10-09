// Captures de la ville sous plusieurs angles (outil de contrôle visuel).
// Usage : node scripts/views.mjs [dossier] [qualité] [nuit 0|1]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [out = 'exports/views', quality = 'medium', night = '1'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5192 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(300000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5192/');
await p.evaluate((q) => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q })); }, quality);
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.click('#btn-new');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 300000 });
const info = await p.evaluate((night) => {
  const g = window.__nightfall; g.stopLoop();
  g.setNight(Number(night));
  g.hud.el.style.display = 'none';
  g.simulate(0.5);
  let tris = 0, calls = 0;
  g.renderer.info.autoReset = false; g.renderer.info.reset(); g.renderer.render(g.scene, g.camera);
  tris = g.renderer.info.render.triangles; calls = g.renderer.info.render.calls;
  return { tris, calls };
}, night);
console.log('rendu :', JSON.stringify(info), errs);
const V = [
  ['rue_halden', [3, 1.7, 24], [0, 6, -10]],
  ['vue_aerienne', [70, 55, 70], [0, 5, 0]],
  ['facade_brique', [-8, 6, -24], [-22, 6, -12]],
  ['lycee', [24, 2.5, 30], [26, 8, 40]],
  ['avenue_nord', [0, 2, 40], [0, 12, -60]],
  ['toit_corvin', [-30, 14, -30], [-20, 9, -22]],
];
for (const [name, pos, look] of V) {
  await p.evaluate(([pos, look]) => {
    const g = window.__nightfall;
    g.camera.position.set(...pos); g.camera.lookAt(...look);
    g.camera.fov = 60; g.camera.updateProjectionMatrix();
    g.world.update(0.016, g.time, g.camera, g.hero.pos);
    g.composer.render();
  }, [pos, look]);
  await p.screenshot({ path: `${out}/${name}.png` });
}
await b.close(); await server.close();
