import { StudioIntro, TIMELINE } from './intro/StudioIntro.js';

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

async function boot() {
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
      show('title');
    });
    const skip = () => run.skip();
    // Petit délai pour ne pas capter le clic de démarrage comme un « passer ».
    setTimeout(() => {
      addEventListener('keydown', skip, { once: true });
      addEventListener('pointerdown', skip, { once: true });
    }, 300);
  };
  $('start').addEventListener('click', start, { once: true });
}

params.has('export') ? exportMode() : boot();
