// Sonde de réglage : une même vue rendue avec différents effets désactivés.
// Usage : node scripts/fxprobe.mjs dossier qualité phase
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [out = 'exports/probe', quality = 'high', phase = 'night'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5209, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
p.setDefaultTimeout(300000);
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('[error]', m.text().slice(0, 800)));
await p.goto('http://localhost:5209/');
await p.evaluate((q) => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: q })); }, quality);
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
await p.click('#btn-chapters'); await p.click('[data-ch="ch1"]');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 300000 });
const info = await p.evaluate((ph) => {
  const g = window.__nightfall; g.stopLoop(); g.rifts.enabled = false; g.hud.el.style.display = 'none';
  g.setPhase(ph); g.simulate(0.3);
  g.hero.placeAt({ x: -10, y: 0.15, z: -6 }, 2.4 + Math.PI); g.camYaw = 2.4; g.camDist = 7; g.camPitch = 0.25; g.simulate(0.6);
  const s = g.sky;
  let lights = 0; g.scene.traverse((o) => { if (o.isLight && o.visible && o.intensity > 0) lights++; });
  return { exposure: s.exposure, ambient: s.ambient, li: s.lightIntensity, lc: s.lightColor.toArray(), fog: s.fogColor.toArray(), dens: g.scene.fog.density, hemi: g.hemi.intensity, lights };
}, phase);
console.log(JSON.stringify(info));
const variants = {
  full: () => {},
  nobloom: (g) => { g.bloom.enabled = false; },
  nocine: (g) => { g.bloom.enabled = false; g.cine.cfg = { ...g.cine.cfg, ao: 0 }; g.cine.mat.uniforms.uShaft.value = 0; g.cine.state.shaft = 0; g.cine.state.wet = 0; g.cine.state.haloCol.set(0, 0, 0); },
  noenv: (g) => { g.scene.environmentIntensity = 0; },
  nohemi: (g) => { g.hemi.intensity = 0; },
  nofog: (g) => { g.scene.fog.density = 0; },
};
for (const [name, fn] of Object.entries(variants)) {
  await p.evaluate((src) => {
    const g = window.__nightfall;
    g.bloom.enabled = true; g.hemi.intensity = g.__hemi ?? (g.__hemi = g.hemi.intensity);
    g.setNight(g.night); g.cine.setQuality(g.settings.quality);
    // eslint-disable-next-line no-new-func
    const f = new Function('g', 'return (' + src + ')(g)');
    g.renderOnce(); // met à jour l'état
    f(g);
    g.composer.render();
  }, fn.toString());
  await p.screenshot({ path: `${out}/${phase}_${name}.png` });
}
await b.close(); await server.close();
