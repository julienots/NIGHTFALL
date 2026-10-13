// Test des commandes tactiles sur un téléphone émulé en paysage.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const out = process.argv[2] || 'exports/screens';
const server = await createServer({ server: { port: 5193, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const p = await ctx.newPage();
p.setDefaultTimeout(120000);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const check = (n, ok, i = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${n} ${i}`); if (!ok) fails++; };
await p.goto('http://localhost:5193/');
await p.evaluate(() => localStorage.clear());
await p.tap('#start');
await p.waitForTimeout(800);
await p.touchscreen.tap(400, 200);
await p.waitForSelector('#title:not(.hidden)');
await p.waitForTimeout(300);
await p.touchscreen.tap(400, 200);
await p.tap('#btn-new');
await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 120000 });
await p.evaluate(() => window.__nightfall.stopLoop());
// Le jeu commence en classe : on vérifie qu'un toucher sur la bulle fait avancer
// le dialogue, puis on termine l'introduction et on sort sur le parvis.
await p.evaluate(() => { const g = window.__nightfall; g.story.skip(); g.simulate(0.2); });
const line0 = await p.evaluate(() => document.querySelector('.dl-text').textContent);
const bub = await p.evaluate(() => { const r = document.querySelector('.dialog').getBoundingClientRect(); return { x: r.x + 30, y: r.y + 20 }; });
await p.touchscreen.tap(bub.x, bub.y);
const line1 = await p.evaluate(() => document.querySelector('.dl-text').textContent);
check('toucher la bulle fait avancer le dialogue', line0 && line1 !== line0, `${line0.slice(0, 30)}… → ${line1.slice(0, 30)}…`);
await p.touchscreen.tap(420, 80); // haut de l'écran, loin de la bulle
const line2 = await p.evaluate(() => document.querySelector('.dl-text').textContent);
check('toucher n’importe où fait avancer le dialogue', line2 && line2 !== line1, `${line2.slice(0, 30)}…`);
// Dialogue à choix : un vrai toucher sur la réponse 2 doit la choisir, même
// avec la couche tactile en mode cinématique (bug v1.3-beta : rien ne réagissait).
const chosen = await p.evaluate(() => {
  const g = window.__nightfall;
  window.__picked = null;
  g.hud.dialog({ who: 'Test', text: '…', choices: ['Un', 'Deux', 'Trois'], onChoose: (i) => { window.__picked = i; g.hud.closeDialog(); } });
  g.touch.update({ cinematic: true, choosing: true });
  const r = document.querySelectorAll('.dl-choice')[1].getBoundingClientRect();
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, hit: el?.closest('.dl-choice') ? 'choix' : el?.className };
});
check('la réponse est au premier plan (pas sous les commandes)', chosen.hit === 'choix', chosen.hit);
await p.touchscreen.tap(chosen.x, chosen.y);
check('toucher une réponse la choisit', (await p.evaluate(() => window.__picked)) === 1);
await p.evaluate(() => {
  const g = window.__nightfall;
  for (let i = 0; i < 200 && g.social.active; i++) { if (g.hud.dl?.choices) g.hud.choose(0); else g.social.next(); g.simulate(0.05); }
  g.story.skip();
  g.simulate(0.5);
  const d = g.world.targets.school_door;
  g.enterZone('city', { x: d.x, y: 0.15, z: d.z - 6, yaw: Math.PI });
  g.simulate(0.3);
  g.touch.update({}); // boucle arrêtée : on rafraîchit la couche tactile à la main
});
const st = await p.evaluate(() => ({ touch: !!window.__nightfall.touch, q: window.__nightfall.settings.quality, ui: !!document.querySelector('.touch-ui') }));
check('commandes tactiles actives', st.touch && st.ui, JSON.stringify(st));
check('qualité basse par défaut sur mobile', st.q === 'low');
const ptr = (type, x, y, id) => p.evaluate(([type, x, y, id]) => {
  const el = type === 'pointerdown' ? document.elementFromPoint(x, y) : document.querySelector('.t-look');
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
}, [type, x, y, id]);
// Joystick : appui à gauche, glisser vers le haut
const p0 = await p.evaluate(() => ({ ...window.__nightfall.hero.pos }));
await ptr('pointerdown', 150, 280, 11);
await ptr('pointermove', 150, 225, 11);
await p.evaluate(() => window.__nightfall.simulate(1.2));
const p1 = await p.evaluate(() => ({ ...window.__nightfall.hero.pos }));
const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
check('joystick : Noa marche', d > 3, `${d.toFixed(1)} m`);
await ptr('pointermove', 150, 150, 11);
await p.evaluate(() => window.__nightfall.simulate(0.2));
check('joystick à fond : course', await p.evaluate(() => window.__nightfall.input.down.has('sprint')));
await p.evaluate(() => { window.__nightfall.renderOnce(); window.__nightfall.touch.update({ rings: false }); });
await p.screenshot({ path: `${out}/touch_prologue.png` });
await ptr('pointerup', 150, 150, 11);
// Caméra : glisser à droite
const y0 = await p.evaluate(() => window.__nightfall.camYaw);
await ptr('pointerdown', 600, 120, 12);
await ptr('pointermove', 680, 120, 12);
await ptr('pointerup', 680, 120, 12);
await p.evaluate(() => window.__nightfall.simulate(0.05));
check('glisser : la caméra tourne', Math.abs((await p.evaluate(() => window.__nightfall.camYaw)) - y0) > 0.1);
// Bouton saut
const jb = await p.evaluate(() => { const r = document.querySelector('.b-jump').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await ptr('pointerdown', jb.x, jb.y, 13);
await p.evaluate(() => window.__nightfall.simulate(0.3));
check('bouton saut', (await p.evaluate(() => window.__nightfall.hero.pos.y)) > 1);
// Avec les pouvoirs : boutons visibles, vol au bouton
await p.evaluate(() => { const g = window.__nightfall; g.hero.setPowers({ rings: true, flight: true, magnet: true, umbra: true }); g.simulate(1); g.touch.update({ rings: true, flight: true, magnet: true, umbra: true }); });
const vis = await p.evaluate(() => ['.b-light', '.b-power', '.b-shield', '.b-fly', '.b-magnet', '.b-umbra'].every((s) => getComputedStyle(document.querySelector(s)).display !== 'none'));
check('boutons de pouvoirs affichés', vis);
const fb = await p.evaluate(() => { const r = document.querySelector('.b-fly').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await ptr('pointerdown', fb.x, fb.y, 14);
await p.evaluate(() => window.__nightfall.simulate(0.8));
check('bouton vol', await p.evaluate(() => window.__nightfall.hero.flying));
// Bouton Abysse : transformation au toucher (jauge pleine, au sol)
await p.evaluate(() => { const g = window.__nightfall; g.hero.flying = false; g.hero.placeAt({ ...g.hero.pos, y: 0.15 }, 0); g.hero.abyss = 100; g.simulate(0.5); });
const ub = await p.evaluate(() => { const r = document.querySelector('.b-umbra').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await ptr('pointerdown', ub.x, ub.y, 15);
await p.evaluate(() => window.__nightfall.simulate(2.4));
check('bouton Forme Abysse', (await p.evaluate(() => window.__nightfall.hero.form)) === 'umbra');
await p.evaluate(() => { window.__nightfall.renderOnce(); window.__nightfall.touch.update({ rings: true, umbra: true, canTransform: true }); });
await p.screenshot({ path: `${out}/touch_abysse.png` });
await p.evaluate(() => { const g = window.__nightfall; g.hero.abyss = 0.1; g.simulate(1.2); });
await p.evaluate(() => { window.__nightfall.renderOnce(); window.__nightfall.touch.update({ rings: true, flight: true, flying: true }); });
await p.screenshot({ path: `${out}/touch_vol.png` });
check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
await b.close(); await server.close();
process.exit(fails ? 1 : 0);
