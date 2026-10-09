// Intro animée du studio SUPERESSENCE.
// Le rendu est une fonction pure du temps (renderAt(t)) : la même timeline sert
// au jeu en temps réel et à l'export vidéo image par image.
import { IntroSfx } from './sfx.js';

const BASE = 'assets/brand/';

export const TIMELINE = {
  firstLetter: 0.7,
  superStep: 0.085,
  essenceGap: 0.18,
  essenceStep: 0.075,
  fall: 0.42,
  dotDelay: 0.32,
  dotFall: 0.36,
  shineStart: 3.35,
  shineDur: 0.75,
  taglineIn: 3.7,
  fadeOut: 5.7,
  end: 6.5,
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInQuad = (t) => t * t;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const smooth = (t) => t * t * (3 - 2 * t);

// Ressort amorti : 0 à l'impact, oscille puis revient à 0.
const spring = (t, freq = 14, damp = 7) => Math.exp(-damp * t) * Math.cos(freq * t);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class StudioIntro {
  constructor(canvas, { audio = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.lctx = this.layer.getContext('2d');
    this.sfx = audio ? new IntroSfx() : null;
    this.letters = [];
    this.meta = null;
    this.dpr = 1;
    const r = rng(1337);
    this.embers = Array.from({ length: 90 }, () => ({
      x: r(), y: r(), speed: 0.025 + r() * 0.06, size: 0.6 + r() * 2.2,
      sway: r() * Math.PI * 2, hue: r() < 0.7 ? 45 : 280, alpha: 0.15 + r() * 0.5,
    }));
  }

  async load() {
    this.meta = await (await fetch(BASE + 'superessence_logo.json')).json();
    this.letters = await Promise.all(this.meta.letters.map((l) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ ...l, img, shadow: this.#tint(img, this.meta.shadow.color) });
      img.onerror = reject;
      img.src = BASE + l.file;
    })));
    this.#computeSchedule();
    this.resize();
  }

  #tint(img, color) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  #computeSchedule() {
    const T = TIMELINE;
    let last = 0;
    this.letters.forEach((l, i) => {
      if (l.char === '.') {
        l.start = last + T.dotDelay;
        l.dur = T.dotFall;
        l.drop = 2.4;
      } else if (l.group === 'super') {
        l.start = T.firstLetter + i * T.superStep;
        l.dur = T.fall;
        l.drop = 1.0;
      } else {
        const k = i - 5;
        l.start = T.firstLetter + 4 * T.superStep + T.essenceGap + k * T.essenceStep;
        l.dur = T.fall;
        l.drop = 1.25;
      }
      l.land = l.start + l.dur;
      last = Math.max(last, l.start);
    });
    this.impactTime = this.letters[this.letters.length - 1].land;
  }

  resize(width = window.innerWidth, height = window.innerHeight, dpr = window.devicePixelRatio || 1) {
    this.dpr = Math.min(dpr, 2);
    this.w = width;
    this.h = height;
    for (const c of [this.canvas, this.layer]) {
      c.width = Math.round(width * this.dpr);
      c.height = Math.round(height * this.dpr);
    }
    if (this.canvas.style) {
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
    }
  }

  // Sons déclenchés quand la timeline franchit un événement.
  #triggerSfx(prev, t) {
    if (!this.sfx) return;
    const crossed = (at) => prev < at && t >= at;
    if (crossed(0.05)) this.sfx.drone();
    for (const l of this.letters) {
      if (crossed(l.land)) l.char === '.' ? this.sfx.impact() : this.sfx.pop(l.group === 'essence');
    }
    if (crossed(TIMELINE.shineStart)) this.sfx.shimmer();
  }

  play(onDone) {
    this.sfx?.resume();
    const t0 = performance.now();
    let prev = -1;
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      this.sfx?.fadeOut();
      onDone?.();
    };
    const frame = (now) => {
      if (stopped) return;
      const t = (now - t0) / 1000;
      this.#triggerSfx(prev, t);
      prev = t;
      this.renderAt(t);
      if (t >= TIMELINE.end) finish();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return { skip: finish };
  }

  renderAt(t) {
    const { ctx, w, h, dpr } = this;
    const T = TIMELINE;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const fade = 1 - smooth(clamp01((t - T.fadeOut) / (T.end - T.fadeOut - 0.15)));
    const intro = smooth(clamp01(t / 0.8));
    const sinceImpact = t - this.impactTime;

    // Échelle : le logo occupe ~68 % de la largeur (moins en portrait étroit).
    const logoW = this.meta.width;
    const scale = Math.min((w * 0.68) / logoW, (h * 0.34) / this.meta.height);
    const zoom = 1 + 0.035 * smooth(clamp01((t - T.fadeOut) / (T.end - T.fadeOut)));
    const s = scale * zoom;

    // Secousse de caméra à l'impact du point.
    let shakeX = 0;
    let shakeY = 0;
    if (sinceImpact > 0 && sinceImpact < 0.45) {
      const k = Math.exp(-sinceImpact * 9) * 7;
      shakeX = Math.sin(sinceImpact * 83) * k;
      shakeY = Math.cos(sinceImpact * 71) * k;
    }
    const ox = w / 2 - (logoW * s) / 2 + shakeX;
    const oy = h / 2 - (this.meta.height * s) / 2 + shakeY - h * 0.02;

    ctx.globalAlpha = fade;
    this.#drawBackdrop(t, intro, sinceImpact, ox, oy, s);
    this.#drawEmbers(t, intro);

    // Ombres (posées sur le « sol ») puis faces dans un calque pour l'éclat.
    const lctx = this.lctx;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, this.layer.width, this.layer.height);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sh = this.meta.shadow;
    for (const l of this.letters) {
      const st = this.#letterState(l, t);
      if (st.alpha <= 0) continue;
      const cx = ox + (l.x + l.w / 2) * s;
      const by = oy + l.h * s; // ligne de base de la boîte

      // Ombre : se rapproche et se densifie à mesure que la lettre atterrit.
      ctx.save();
      ctx.globalAlpha = fade * st.alpha * st.shadowK;
      ctx.translate(cx + sh.dx * s * st.shadowK, by + sh.dy * s * st.shadowK);
      ctx.scale(st.sx, st.sy);
      ctx.drawImage(l.shadow, (-l.w / 2) * s, -l.h * s, l.w * s, l.h * s);
      ctx.restore();

      lctx.save();
      lctx.globalAlpha = st.alpha;
      lctx.translate(cx, by + st.dy * s);
      lctx.rotate(st.rot);
      lctx.scale(st.sx, st.sy);
      lctx.drawImage(l.img, (-l.w / 2) * s, -l.h * s, l.w * s, l.h * s);
      lctx.restore();
    }

    this.#drawShine(t, ox, oy, s);

    // Halo doré derrière « Essence » après l'impact.
    if (sinceImpact > 0) {
      const glow = Math.exp(-sinceImpact * 1.6) * 0.9 + 0.25 * smooth(clamp01(sinceImpact / 1.2));
      ctx.save();
      ctx.globalAlpha = fade * glow;
      ctx.filter = `blur(${Math.max(6, 18 * s)}px)`;
      const e0 = this.letters[5];
      ctx.drawImage(this.layer,
        (ox + e0.x * s - 20) * dpr, 0, (logoW - e0.x) * s * dpr + 40 * dpr, this.layer.height,
        ox + e0.x * s - 20, 0, (logoW - e0.x) * s + 40, h);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.layer, 0, 0);
    ctx.restore();

    this.#drawShockwave(sinceImpact, ox, oy, s, fade);
    this.#drawTagline(t, ox, oy, s, fade);

    // Flash blanc très bref à l'impact.
    if (sinceImpact > 0 && sinceImpact < 0.25) {
      ctx.globalAlpha = (1 - sinceImpact / 0.25) * 0.18 * fade;
      ctx.fillStyle = '#fff6d6';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }

  #letterState(l, t) {
    const u = (t - l.start) / l.dur;
    if (u < 0) return { alpha: 0 };
    const H = this.meta.height;
    if (u < 1) {
      // Chute avec léger étirement vertical.
      const p = easeInQuad(u);
      return {
        alpha: clamp01(u * 4),
        dy: -(1 - p) * H * 1.1 * l.drop,
        sx: 1 - 0.12 * p,
        sy: 1 + 0.18 * p,
        rot: (1 - p) * (l.group === 'super' ? -0.12 : 0.12) * (l.char === '.' ? 0 : 1),
        shadowK: 0.25 + 0.75 * p,
      };
    }
    // Écrasement à l'atterrissage puis rebond amorti.
    const k = t - l.land;
    const amp = l.char === '.' ? 0.45 : 0.26;
    const sq = spring(k, 16, 6.5) * amp;
    return {
      alpha: 1,
      dy: Math.max(0, Math.sin(k * 16) * Math.exp(-k * 9)) * -H * 0.05,
      sx: 1 + sq * 0.6,
      sy: 1 - sq,
      rot: 0,
      shadowK: 1,
    };
  }

  #drawBackdrop(t, intro, sinceImpact, ox, oy, s) {
    const { ctx, w, h } = this;
    const cx = w / 2;
    const cy = oy + (this.meta.height * s) / 2;
    const pulse = sinceImpact > 0 ? Math.exp(-sinceImpact * 2.2) : 0;
    const r = Math.max(w, h) * (0.55 + 0.1 * pulse);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(40, 26, 70, ${0.55 * intro + 0.25 * pulse})`);
    g.addColorStop(0.45, `rgba(14, 10, 32, ${0.5 * intro})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Lueur dorée elliptique au « sol », sous le logo.
    const floorY = oy + this.meta.height * s * 0.95;
    const rx = this.meta.width * s * 0.7;
    ctx.save();
    ctx.translate(cx, floorY);
    ctx.scale(1, 0.12);
    const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    fg.addColorStop(0, `rgba(255, 205, 32, ${0.1 * intro + 0.25 * pulse})`);
    fg.addColorStop(1, 'rgba(255, 205, 32, 0)');
    ctx.fillStyle = fg;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }

  #drawEmbers(t, intro) {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const base = ctx.globalAlpha;
    for (const e of this.embers) {
      const y = ((e.y - t * e.speed) % 1 + 1) % 1;
      const x = e.x + Math.sin(t * 0.8 + e.sway) * 0.01;
      const edge = Math.sin(y * Math.PI); // fondu en haut/bas
      ctx.globalAlpha = base * intro * e.alpha * edge;
      ctx.fillStyle = e.hue === 45 ? '#ffcd20' : '#a070ff';
      ctx.beginPath();
      ctx.arc(x * w, y * h, e.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  #drawShine(t, ox, oy, s) {
    const u = (t - TIMELINE.shineStart) / TIMELINE.shineDur;
    if (u <= 0 || u >= 1) return;
    const lctx = this.lctx;
    const width = this.meta.width * s;
    const x = ox - width * 0.2 + easeOutCubic(u) * width * 1.4;
    const band = Math.max(40, 120 * s);
    lctx.save();
    lctx.globalCompositeOperation = 'source-atop';
    const g = lctx.createLinearGradient(x - band, oy, x + band, oy + band * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    lctx.fillStyle = g;
    lctx.fillRect(0, 0, this.w, this.h);
    lctx.restore();
  }

  #drawShockwave(k, ox, oy, s, fade) {
    if (k <= 0 || k > 0.9) return;
    const { ctx } = this;
    const dot = this.letters[this.letters.length - 1];
    const cx = ox + (dot.x + dot.w / 2) * s;
    const cy = oy + dot.h * s * 0.82;
    const p = easeOutCubic(k / 0.9);
    ctx.save();
    ctx.globalAlpha = fade * (1 - p);
    ctx.strokeStyle = '#ffcd20';
    ctx.lineWidth = Math.max(1.5, 6 * s * (1 - p) + 1);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 20 + p * 420 * s, 6 + p * 90 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Étincelles projetées.
    const r = rng(42);
    ctx.fillStyle = '#ffe48a';
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI * (0.1 + r() * 0.8);
      const v = (180 + r() * 260) * s;
      const px = cx + Math.cos(a) * v * p * (r() < 0.5 ? -1 : 1);
      const py = cy + Math.sin(a) * v * p + 300 * s * p * p;
      ctx.fillRect(px, py, 3, 3);
    }
    ctx.restore();
  }

  #drawTagline(t, ox, oy, s, fade) {
    const u = clamp01((t - TIMELINE.taglineIn) / 0.6);
    if (u <= 0) return;
    const { ctx, w } = this;
    const size = Math.max(11, 30 * s);
    ctx.save();
    ctx.globalAlpha = fade * smooth(u) * 0.75;
    ctx.fillStyle = '#d8d2e8';
    ctx.font = `600 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const spacing = size * (0.9 - 0.3 * smooth(u));
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText('PRÉSENTE', w / 2 + spacing / 2, oy + this.meta.height * s + size * 1.6 + (1 - smooth(u)) * 10);
    ctx.restore();
  }
}
