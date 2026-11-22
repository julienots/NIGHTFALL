// Planche d'animation de Noa dans le monde ouvert : chaque ligne = une action,
// filmée image par image (caméra fixe de profil). Usage :
//   node scripts/animstrip.mjs [dossier]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'exports/anim';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5214, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 360, height: 360 } });
p.setDefaultTimeout(600000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5214/');
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: 'low' })); });
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
await p.click('#btn-new');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 600000 });
await p.evaluate(() => {
  const g = window.__nightfall; g.stopLoop(); g.rifts.enabled = false; g.hud.el.style.display = 'none';
  g.hero.setPowers({ rings: true, magnet: true, flight: true, umbra: true });
  g.hero.energy = 999; g.hero.abyss = 100;
  window.__reset = () => {
    const x = -10, z = 60;
    g.hero.form === 'umbra' || null;
    g.hero.placeAt({ x, y: g.col.terrainAt(x, z), z }, Math.PI / 2);
    g.hero.energy = 999; g.hero.cooldowns && Object.keys(g.hero.cooldowns).forEach((k) => (g.hero.cooldowns[k] = 0));
    g.input.down.clear();
  };
  window.__frame = () => {
    const h = g.hero.pos;
    g.camera.position.set(h.x, h.y + 1.3, h.z + 4.2);
    g.camera.lookAt(h.x, h.y + 0.95, h.z);
    g.world.update(0.016, g.time, g.camera, g.hero.pos);
    g.composer.render();
  };
});
// [nom, script de mise en place, entrées maintenues, pressions au début, durée totale, images]
const ROWS = [
  ['repos', [], [], 1.2, 6],
  ['marche', ['right'], [], 1.2, 6],
  ['course', ['right', 'sprint'], [], 1.2, 6],
  ['saut', ['right'], ['jump'], 1.0, 6],
  ['combo', [], ['light', '+0.33:light', '+0.66:light'], 1.4, 8],
  ['fouet', [], ['heavy'], 0.9, 6],
  ['rafale', [], ['power'], 0.8, 6],
  ['roulade', ['right'], ['dodge'], 0.6, 6],
  ['vol', ['right'], ['fly', '+0.5:jump'], 2.0, 6],
];
let rowI = 0;
for (const [name, hold, presses, dur, frames] of ROWS) {
  await p.evaluate(() => { window.__reset(); window.__nightfall.simulate(0.4); });
  const timed = presses.map((s) => (s.startsWith('+') ? [Number(s.slice(1, s.indexOf(':'))), s.slice(s.indexOf(':') + 1)] : [0, s]));
  let t = 0;
  const step = dur / frames;
  for (let f = 0; f < frames; f++) {
    await p.evaluate(([hold, timed, t, step]) => {
      const g = window.__nightfall;
      for (const h of hold) g.input.down.add(h);
      const n = Math.max(1, Math.round(step / (1 / 60)));
      for (let i = 0; i < n; i++) {
        const now = t + i / 60;
        for (const [at, a] of timed) if (now <= at && now + 1 / 60 > at) {
          if (a === 'jump' && g.hero.flying) g.input.down.add('jump'); else g.input.pressed.add(a);
        }
        g.simulate(1 / 60);
      }
      window.__frame();
    }, [hold, timed, t, step]);
    t += step;
    await p.screenshot({ path: `${out}/${String(rowI).padStart(2, '0')}_${name}_${f}.png` });
  }
  rowI++;
}
console.log('erreurs', JSON.stringify(errs.slice(0, 5)));
await b.close(); await server.close();
