// Galerie de clips : chaque ligne = un clip, échantillonné de 0 à 100 %.
// Usage : node scripts/clipgallery.mjs dossier clé1,clé2,…  (clés de CLIPS)
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [out = 'exports/clips', keys = 'fall,land,diveImpact,flyingKick,float'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5215, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: Number(process.env.W || 240), height: Number(process.env.H || 300) } });
p.setDefaultTimeout(600000);
await p.goto('http://localhost:5215/');
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: 'low' })); });
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
await p.click('#btn-new');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 600000 });
await p.evaluate(() => { const g = window.__nightfall; g.stopLoop(); g.hud.el.style.display = 'none'; g.hero.rings.group && (g.hero.rings.group.visible = false); });
for (const key of keys.split(',')) {
  for (let i = 0; i <= 6; i++) {
    await p.evaluate(([key, pp]) => {
      const g = window.__nightfall; const m = g.hero.model; const h = g.hero.pos;
      m.blend.update(0, { [key]: { w: 1, p: pp, snap: true } }, 1000);
      for (const [k, a] of m.blend.actions) if (k !== key && a) { a.setEffectiveWeight(0); m.blend.w.set(k, 0); }
      m.blend.mixer.update(0);
      m.tilt.rotation.set(0, 0, 0);
      m.root.position.copy(h); m.root.rotation.y = Math.PI / 2;
      g.camera.position.set(h.x, h.y + 1.1, h.z + 3.6); g.camera.lookAt(h.x, h.y + 0.9, h.z);
      g.composer.render();
    }, [key, i / 6]);
    await p.screenshot({ path: `${out}/${key}_${i}.png` });
  }
}
await b.close(); await server.close();
