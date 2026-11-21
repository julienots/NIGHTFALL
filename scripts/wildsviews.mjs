// Captures du monde ouvert (Marches de Vesper). Usage :
//   node scripts/wildsviews.mjs [dossier] [qualité] [phases]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out = 'exports/wilds', quality = 'high', phases = 'morning,evening,night'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5212, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(600000);
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
await p.goto('http://localhost:5212/');
await p.evaluate((q) => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q })); }, quality);
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
const t0 = Date.now();
await p.click('#btn-new');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 600000 }).catch((e) => { console.log(errs); throw e; });
console.log('chargement', ((Date.now() - t0) / 1000).toFixed(1), 's');
const G = (fn, a) => p.evaluate(fn, a);
await G(() => { const g = window.__nightfall; g.stopLoop(); g.rifts.enabled = false; g.hud.el.style.display = 'none'; g.story.hintTimer = 0; });

// [nom, position du héros (x, z), lacet caméra, distance, tangage]
const SHOTS = [
  ['sanctuaire', [-40, 46], 0.4, 6, 0.15],
  ['prairie', [-30, 80], 2.8, 5, 0.08],
  ['brumeval', [-22, 86], 0.1, 8, 0.2],
  ['lac', [120, 175], 0.6, 7, 0.12],
  ['foret', [-150, -60], 1.5, 6, 0.1],
  ['sceau', [72, 22], 3.1, 9, 0.2],
];
for (const phase of phases.split(',')) {
  await G((ph) => { const g = window.__nightfall; g.setPhase(ph); g.simulate(0.2); }, phase);
  for (const [name, [x, z], yaw, dist, pitch] of SHOTS) {
    await G(([x, z, yaw, dist, pitch]) => {
      const g = window.__nightfall;
      g.hero.placeAt({ x, y: g.col.terrainAt(x, z) + 0.2, z }, yaw + Math.PI);
      g.camYaw = yaw; g.camDist = dist; g.camPitch = pitch;
      g.simulate(0.8);
      g.renderOnce();
    }, [x, z, yaw, dist, pitch]);
    await p.screenshot({ path: `${out}/${phase}_${name}.png` });
  }
}
// Vue aérienne
await G(() => { const g = window.__nightfall; g.camera.position.set(-120, 120, 230); g.camera.lookAt(20, 0, 40); g.world.update(0.016, g.time, g.camera, g.hero.pos); g.composer.render(); });
await p.screenshot({ path: `${out}/aerien.png` });
const info = await G(() => { const g = window.__nightfall; const i = g.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, grass: g.world.drawCalls }; });
console.log('rendu :', JSON.stringify(info));
console.log('erreurs :', JSON.stringify(errs.slice(0, 8)));
await b.close(); await server.close();
