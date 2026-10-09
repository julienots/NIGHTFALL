import { StudioIntro, TIMELINE } from './intro/StudioIntro.js';
import { SaveSystem } from './game/systems/save.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');

async function exportMode() {
  // Mode utilisé par scripts/render_intro_video.mjs : rendu image par image.
  hide('boot');
  show('intro');
  const intro = new StudioIntro($('intro'), { audio: false });
  await intro.load();
  const w = Number(params.get('w') || 1920);
  const h = Number(params.get('h') || 1080);
  intro.resize(w, h, 1);
  window.__intro = { renderAt: (t) => intro.renderAt(t), duration: TIMELINE.end };
}

async function startGame(saveData) {
  hide('title');
  hide('boot');
  show('loading');
  const { Game } = await import('./game/Game.js');
  const game = new Game($('game'), { saveData });
  await game.init();
  hide('loading');
  show('game');
  game.input.requestLock();
}

function titleScreen() {
  show('title');
  const saves = new SaveSystem();
  const existing = saves.load();
  const menu = document.querySelector('.title-menu');
  const press = document.querySelector('#title .press');
  const reveal = () => {
    press.classList.add('hidden');
    menu.classList.remove('hidden');
    if (!existing) hide('btn-continue');
    else {
      const d = existing.data;
      const min = Math.round((d.playTime || 0) / 60);
      $('save-info').textContent = `Niveau ${d.progression?.level ?? 1} · ${min} min de jeu${existing.slot !== 'main' ? ' · restaurée depuis la copie de secours' : ''}`;
    }
  };
  addEventListener('keydown', reveal, { once: true });
  addEventListener('pointerdown', reveal, { once: true });
  $('btn-continue').addEventListener('click', () => startGame(existing.data));
  $('btn-new').addEventListener('click', () => {
    if (existing && !confirm('Commencer une nouvelle partie ? La sauvegarde actuelle sera remplacée.')) return;
    saves.clear();
    startGame(null);
  });
}

async function boot() {
  // « Charger la dernière sauvegarde » depuis le jeu : on saute l'intro.
  if (sessionStorage.getItem('nightfall.autocontinue')) {
    sessionStorage.removeItem('nightfall.autocontinue');
    const existing = new SaveSystem().load();
    $('start').textContent = 'Cliquez pour reprendre';
    $('start').addEventListener('click', () => startGame(existing?.data ?? null), { once: true });
    return;
  }
  const intro = new StudioIntro($('intro'));
  const ready = intro.load();
  window.addEventListener('resize', () => intro.resize());

  const start = async () => {
    await ready;
    hide('boot');
    show('intro');
    show('skip');
    const run = intro.play(() => {
      removeEventListener('keydown', skip);
      removeEventListener('pointerdown', skip);
      hide('intro');
      hide('skip');
      // Laisse passer la touche qui a sauté l'intro avant d'écouter l'écran titre.
      setTimeout(titleScreen, 150);
    });
    const skip = () => run.skip();
    setTimeout(() => {
      addEventListener('keydown', skip, { once: true });
      addEventListener('pointerdown', skip, { once: true });
    }, 300);
  };
  $('start').addEventListener('click', start, { once: true });
}

params.has('export') ? exportMode() : boot();
