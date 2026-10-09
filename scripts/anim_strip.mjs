// Planche d'images d'un cycle de marche / course vu de profil (contrôle des animations).
import { createServer } from 'vite';
import { chromium } from 'playwright';
const out = process.argv[2] || 'exports';
const server = await createServer({ server: { port: 5191 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 300, height: 340 } });
p.setDefaultTimeout(300000);
await p.goto('http://localhost:5191/');
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: 'low' })); });
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.click('#btn-new');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 300000 });
await p.evaluate(() => { const g = window.__nightfall; g.stopLoop(); g.hud.el.style.display = 'none'; for (const n of g.story.npcs) n.model.root.visible = false; });
let i = 0;
async function frames(label, setup, n, dt) {
  await p.evaluate(setup);
  for (let k = 0; k < n; k++) {
    await p.evaluate((dt) => {
      const g = window.__nightfall;
      g.simulate(dt);
      const h = g.hero.pos;
      g.camera.position.set(h.x + 4.2, 1.1, h.z); g.camera.lookAt(h.x, 0.95, h.z); g.camera.fov = 35; g.camera.updateProjectionMatrix();
      g.composer.render();
    }, dt);
    await p.screenshot({ path: `${out}/a_${String(i++).padStart(2, '0')}.png` });
  }
  console.log(label, 'ok');
}
const start = () => { const g = window.__nightfall; g.hero.placeAt({ x: -9.6, y: 0.15, z: 40 }, Math.PI); g.camYaw = Math.PI; g.input.down.clear(); };
await frames('repos', () => { (() => { const g = window.__nightfall; g.hero.placeAt({ x: -9.6, y: 0.15, z: 40 }, Math.PI); g.input.down.clear(); g.simulate(1); })(); }, 4, 0.6);
await frames('marche', () => { const g = window.__nightfall; g.hero.placeAt({ x: -9.6, y: 0.15, z: 40 }, Math.PI); g.camYaw = Math.PI; g.input.down.clear(); g.input.down.add('up'); g.input.touch = { move: () => ({ x: 0, y: 0.32 }) }; g.input.down.delete('up'); g.simulate(1.2); }, 8, 0.07);
await frames('course', () => { const g = window.__nightfall; g.input.touch = null; g.input.down.add('up'); g.simulate(0.8); }, 8, 0.045);
await frames('sprint', () => { const g = window.__nightfall; g.input.down.add('sprint'); g.simulate(0.8); }, 8, 0.035);
await frames('reception', () => { const g = window.__nightfall; g.input.down.clear(); g.simulate(1); g.hero.pos.y = 3; g.hero.grounded = false; g.hero.vy = 0; }, 8, 0.07);
void start;
await b.close(); await server.close();
