// Capture du cours de physique (personnages assis) — contrôle visuel.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ server: { port: 5204, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:5204/');
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: 'medium' })); });
await p.click('#start'); await p.waitForTimeout(500); await p.keyboard.press('Space');
await p.waitForSelector('#title:not(.hidden)'); await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.click('#btn-new');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 300000 });
await p.evaluate(() => { const g = window.__nightfall; g.stopLoop(); g.simulate(1.5); g.hud.el.style.display = 'none'; g.renderOnce(); });
await p.screenshot({ path: process.argv[2] });
await b.close(); await server.close();
