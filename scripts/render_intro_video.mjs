// Exporte l'intro SuperEssence en vidéo MP4 (sans son) via Chromium + ffmpeg.
// Usage : npm run intro:video -- [sortie.mp4] [largeur] [hauteur] [fps]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const [out = 'exports/superessence_intro.mp4', w = '1920', h = '1080', fps = '60'] = process.argv.slice(2);
mkdirSync(dirname(out), { recursive: true });

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' },
);
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.error(e));
await page.goto(`http://localhost:5199/?export&w=${w}&h=${h}`);
await page.waitForFunction(() => window.__intro);
const duration = await page.evaluate(() => window.__intro.duration);

const ffmpeg = spawn('ffmpeg', [
  '-y', '-f', 'image2pipe', '-framerate', fps, '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow',
  '-movflags', '+faststart', out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const canvas = page.locator('#intro');
const frames = Math.ceil(duration * +fps);
for (let i = 0; i <= frames; i++) {
  await page.evaluate((t) => window.__intro.renderAt(t), i / +fps);
  ffmpeg.stdin.write(await canvas.screenshot({ type: 'png' }));
  if (i % 60 === 0) process.stdout.write(`\rimage ${i}/${frames}`);
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on('close', r));
await browser.close();
await server.close();
console.log(`\nVidéo écrite : ${out}`);
