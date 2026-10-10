// Test de la mission « Casier 117 » (harcèlement au lycée), depuis le départ du
// chapitre 2. Deux parcours : avec la tentation des pouvoirs, puis sans.
// Usage : node tests/bully.mjs [dossier de captures]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'exports/screens';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5198, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (n, ok, i = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${n} ${i}`); if (!ok) fails++; };

async function run(pickPowers, tag) {
  const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
  p.setDefaultTimeout(180000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:5198/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('nightfall.settings', JSON.stringify({ quality: 'low' })); });
  await p.click('#start');
  await p.waitForTimeout(800);
  await p.keyboard.press('Space');
  await p.waitForSelector('#title:not(.hidden)');
  await p.waitForTimeout(300);
  await p.keyboard.press('Enter');
  await p.click('#btn-chapters');
  await p.click('[data-ch=ch2]');
  await p.waitForFunction(() => window.__nightfall?.running, null, { timeout: 180000 });
  await p.evaluate(() => window.__nightfall.stopLoop());
  const G = (fn, a) => p.evaluate(fn, a);
  const shot = async (n) => { await G(() => window.__nightfall.renderOnce()); await p.screenshot({ path: `${out}/${n}.png` }); };
  // Fait défiler la conversation en choisissant l'option `pick`.
  const talk = (pick) => G((pick) => {
    const g = window.__nightfall;
    for (let n = 0; n < 80 && g.social.active; n++) {
      if (g.hud.dl?.choices) g.hud.choose(Math.min(pick, g.hud.dl.choices.length - 1));
      else g.social.next();
      g.simulate(0.05);
    }
  }, pick);
  const newDay = (day) => G((day) => { const g = window.__nightfall; g.enterZone('home'); g.clock.day = day; g.setPhase('morning'); g.enterZone('school'); g.simulate(0.5); }, day);
  const jordan = () => G(() => { const n = window.__nightfall.social.friends.jordan; return n && { x: n.pos.x, z: n.pos.z, vis: n.model.root.visible && n.mode !== 'gone' }; });
  const meet = (pos, dx, dz) => G(([x, z]) => { const g = window.__nightfall; g.hero.placeAt({ x, y: 0, z }, 0); g.simulate(0.3); g.input.pressed.add('interact'); g.simulate(0.3); }, [pos.x + dx, pos.z + dz]);
  const step = () => G(() => window.__nightfall.missions.state.b01_bully?.step);

  // « Double vie » terminée → la mission démarre ; jour 3 au matin, au lycée.
  await G(() => {
    const g = window.__nightfall;
    g.simulate(1);
    g.missions.state.d01_double_life = { status: 'done', step: 5, progress: 0 };
    g.missions = new g.missions.constructor(g.missions.serialize());
  });
  await newDay(3);
  check(`[${tag}] mission « Casier 117 » active`, (await G(() => window.__nightfall.missions.state.b01_bully?.status)) === 'active');
  const j0 = await jordan();
  check(`[${tag}] Jordan et sa bande au casier, CPE dans le hall`, j0?.vis && (await G(() => window.__nightfall.story.gang?.length)) === 2 && (await G(() => !!window.__nightfall.story.cpe)));
  await G(() => { const g = window.__nightfall; const S = g.interiors.zones.school; g.hero.placeAt({ x: S.locker.x, y: 0, z: S.locker.z }, Math.PI); g.camYaw = Math.PI; g.simulate(0.3); });
  check(`[${tag}] invite « Faire face à Jordan »`, (await G(() => document.querySelector('.prompt').textContent)).includes('Jordan'));
  if (tag === 'pouvoirs') await shot('40_casier_jordan');
  await G(() => { const g = window.__nightfall; g.input.pressed.add('interact'); g.simulate(0.3); });
  await talk(pickPowers ? 2 : 1);
  check(`[${tag}] scène du casier → étape 1`, (await step()) === 1);
  // Inès (cafétéria)
  const ines = await G(() => { const n = window.__nightfall.social.friends.ines; return { x: n.pos.x, z: n.pos.z }; });
  const aI = await G(() => window.__nightfall.social.aff.ines);
  await meet(ines, 1.2, 0);
  await talk(0);
  check(`[${tag}] en parler à Inès → étape 2 (le lendemain)`, (await step()) === 2 && (await G(() => window.__nightfall.social.aff.ines)) > aI);
  check(`[${tag}] Jordan absent le jour même`, !(await jordan())?.vis || (await G(() => window.__nightfall.social.friends.jordan.mode)) === 'walk');
  // Cafétéria, jour 4
  await newDay(4);
  const j2 = await jordan();
  check(`[${tag}] Jordan à la cafétéria le lendemain`, j2?.vis);
  await meet(j2, 1.2, 0);
  if (tag === 'pouvoirs') await shot('41_cafeteria');
  await talk(pickPowers ? 2 : 0);
  check(`[${tag}] cafétéria → étape 3`, (await step()) === 3);
  // CPE
  const c = await G(() => { const n = window.__nightfall.story.cpe; return { x: n.pos.x, z: n.pos.z }; });
  await meet(c, 0, 1.3);
  await talk(0);
  check(`[${tag}] parler à Mme Ferrand → étape 4`, (await step()) === 4);
  // Médiation, jour 5
  await newDay(5);
  const j3 = await jordan();
  check(`[${tag}] médiation : Jordan au CDI`, j3?.vis);
  await G(() => { const g = window.__nightfall; window.__xp = 0; const o = g.grantXp.bind(g); g.grantXp = (x) => { window.__xp += x; return o(x); }; });
  await meet(j3, 0, -1.4);
  if (tag === 'courage') await shot('42_mediation');
  await talk(2);
  await G(() => window.__nightfall.simulate(1));
  const fin = await G(() => ({
    done: window.__nightfall.missions.isDone('b01_bully'),
    ally: window.__nightfall.social.flags.has('jordan_ally'),
    hoodie: window.__nightfall.inventory.count('hoodie_vesper') || window.__nightfall.inventory.items.filter((i) => i.id === 'hoodie_vesper').length,
    xp: window.__xp,
  }));
  check(`[${tag}] mission terminée, Jordan allié, sweat offert`, fin.done && fin.ally && fin.hoodie >= 1, JSON.stringify(fin));
  // XP : 350 de mission (+150 de courage sans pouvoirs).
  check(`[${tag}] ${pickPowers ? 'pas de bonus de courage (pouvoirs utilisés)' : 'bonus de courage sans pouvoirs'}`, fin.xp === (pickPowers ? 350 : 500), `XP +${fin.xp}`);
  await G(() => { const g = window.__nightfall; g.setPhase('afternoon'); g.enterZone('city'); g.simulate(0.3); });
  // (loin du héros, le modèle est masqué : on vérifie sa place, pas sa visibilité)
  const ja = await G(() => { const g = window.__nightfall; const n = g.social.friends.jordan; const sy = g.districts.hangouts.schoolyard[1]; return n.mode !== 'gone' && Math.hypot(n.pos.x - sy[0], n.pos.z - sy[1]) < 1; });
  check(`[${tag}] Jordan dans la cour l’après-midi`, ja);
  check(`[${tag}] aucune erreur JavaScript`, errors.length === 0, errors.join(' | '));
  await p.close();
}

await run(true, 'pouvoirs');
await run(false, 'courage');
await browser.close();
await server.close();
process.exit(fails ? 1 : 0);
