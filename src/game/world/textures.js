// Textures procédurales générées sur canvas (aucune image externe).
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function grain(ctx, w, h, rand, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${rand() * alpha})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
  }
}

// Façade : grille de fenêtres (8 travées x 8 étages par répétition).
// Renvoie { map, emissive } ; style : 'concrete' | 'brick' | 'glass'.
export function facadeTextures(style, seed = 1) {
  const key = `facade:${style}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const rand = mulberry32(seed * 977 + style.length);
  const W = 512;
  const H = 512;
  const bays = 8;
  const floors = 8;
  const bw = W / bays;
  const fh = H / floors;
  const [c, x] = canvas(W, H);
  const [e, ex] = canvas(W, H);
  const base = { concrete: '#5d5f66', brick: '#5a3a32', glass: '#1c2733' }[style];
  x.fillStyle = base;
  x.fillRect(0, 0, W, H);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, W, H);
  grain(x, W, H, rand, 6000, 0.12);

  // Traînées d'humidité verticales
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.1})`;
    x.fillRect(rand() * W, rand() * H * 0.5, 2 + rand() * 6, H * (0.3 + rand() * 0.7));
  }

  const warm = ['#ffcf8a', '#ffd9a0', '#ffe9c4', '#ffb45e'];
  const cold = ['#a8d4ff', '#cfe6ff', '#8fffe6'];
  for (let f = 0; f < floors; f++) {
    // Bandeau de dalle
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(0, f * fh + fh - 6, W, 6);
    for (let b = 0; b < bays; b++) {
      const wx = b * bw + bw * (style === 'glass' ? 0.06 : 0.2);
      const wy = f * fh + fh * (style === 'glass' ? 0.08 : 0.22);
      const ww = bw * (style === 'glass' ? 0.88 : 0.6);
      const wh = fh * (style === 'glass' ? 0.8 : 0.55);
      const lit = rand() < (style === 'glass' ? 0.28 : 0.22);
      const broken = !lit && rand() < 0.08;
      // Vitre sombre avec reflet
      const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
      g.addColorStop(0, '#1a2230');
      g.addColorStop(1, '#0b0f16');
      x.fillStyle = g;
      x.fillRect(wx, wy, ww, wh);
      if (style !== 'glass') {
        x.strokeStyle = 'rgba(0,0,0,0.6)';
        x.lineWidth = 3;
        x.strokeRect(wx, wy, ww, wh);
        x.fillStyle = 'rgba(255,255,255,0.08)';
        x.fillRect(wx - 2, wy + wh, ww + 4, 3); // rebord
      }
      if (broken) {
        x.strokeStyle = 'rgba(200,210,230,0.25)';
        x.lineWidth = 1;
        x.beginPath();
        const cx = wx + rand() * ww;
        const cy = wy + rand() * wh;
        for (let k = 0; k < 6; k++) {
          x.moveTo(cx, cy);
          x.lineTo(wx + rand() * ww, wy + rand() * wh);
        }
        x.stroke();
      }
      if (lit) {
        const pal = rand() < 0.75 ? warm : cold;
        const col = pal[Math.floor(rand() * pal.length)];
        const lg = ex.createLinearGradient(wx, wy, wx, wy + wh);
        lg.addColorStop(0, col);
        lg.addColorStop(1, 'rgba(60,40,20,1)');
        ex.globalAlpha = 0.5 + rand() * 0.5;
        ex.fillStyle = lg;
        ex.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        // Store / silhouette
        if (rand() < 0.4) {
          ex.fillStyle = '#000';
          ex.globalAlpha = 0.6;
          ex.fillRect(wx + 2, wy + 2, ww - 4, (wh - 4) * rand() * 0.6);
        }
        ex.globalAlpha = 1;
        x.fillStyle = col;
        x.globalAlpha = 0.35;
        x.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        x.globalAlpha = 1;
      }
    }
  }
  if (style === 'brick') {
    x.globalAlpha = 0.18;
    x.strokeStyle = '#2a1712';
    for (let y = 0; y < H; y += 6) {
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(W, y);
      x.stroke();
    }
    x.globalAlpha = 1;
  }
  const out = { map: tex(c), emissive: tex(e), bays, floors };
  cache.set(key, out);
  return out;
}

// Asphalte mouillé : couleur + rugosité (les flaques sont plus lisses).
export function asphaltTextures() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const rand = mulberry32(7);
  const S = 512;
  const [c, x] = canvas(S, S);
  const [r, rx] = canvas(S, S);
  x.fillStyle = '#26272b';
  x.fillRect(0, 0, S, S);
  grain(x, S, S, rand, 30000, 0.18);
  rx.fillStyle = '#c8c8c8';
  rx.fillRect(0, 0, S, S);
  // Flaques
  for (let i = 0; i < 14; i++) {
    const px = rand() * S;
    const py = rand() * S;
    const rad = 10 + rand() * 45;
    const g = rx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, '#101010');
    g.addColorStop(0.7, '#202020');
    g.addColorStop(1, 'rgba(200,200,200,0)');
    rx.fillStyle = g;
    rx.beginPath();
    rx.ellipse(px, py, rad, rad * (0.4 + rand() * 0.6), rand() * 3, 0, Math.PI * 2);
    rx.fill();
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.beginPath();
    x.ellipse(px, py, rad * 0.8, rad * 0.5, 0, 0, Math.PI * 2);
    x.fill();
  }
  // Fissures
  x.strokeStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 25; i++) {
    x.lineWidth = 0.5 + rand() * 1.5;
    x.beginPath();
    let px = rand() * S;
    let py = rand() * S;
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px += (rand() - 0.5) * 40;
      py += (rand() - 0.5) * 40;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  const out = { map: tex(c), roughness: tex(r, { srgb: false }) };
  cache.set('asphalt', out);
  return out;
}

export function sidewalkTexture() {
  if (cache.has('sidewalk')) return cache.get('sidewalk');
  const rand = mulberry32(11);
  const S = 256;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#5b5c60';
  x.fillRect(0, 0, S, S);
  grain(x, S, S, rand, 6000, 0.15);
  x.strokeStyle = 'rgba(20,20,22,0.7)';
  x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    x.beginPath();
    x.moveTo(i * 64, 0);
    x.lineTo(i * 64, S);
    x.moveTo(0, i * 64);
    x.lineTo(S, i * 64);
    x.stroke();
  }
  const out = tex(c);
  cache.set('sidewalk', out);
  return out;
}

// Métal nervuré (conteneurs, caisses).
export function ribbedTexture(color) {
  const key = 'ribbed:' + color;
  if (cache.has(key)) return cache.get(key);
  const rand = mulberry32(color.length * 31);
  const [c, x] = canvas(256, 256);
  x.fillStyle = color;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 16) {
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(i, 0, 5, 256);
    x.fillStyle = 'rgba(255,255,255,0.08)';
    x.fillRect(i + 6, 0, 2, 256);
  }
  // Rouille
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(${90 + rand() * 60},${40 + rand() * 20},10,${rand() * 0.35})`;
    x.beginPath();
    x.arc(rand() * 256, rand() * 256, 2 + rand() * 14, 0, Math.PI * 2);
    x.fill();
  }
  grain(x, 256, 256, rand, 3000, 0.1);
  const out = tex(c);
  cache.set(key, out);
  return out;
}

// Fissures d'anomalie lumineuses (texture émissive transparente).
export function riftTexture(seed = 3) {
  const key = 'rift:' + seed;
  if (cache.has(key)) return cache.get(key);
  const rand = mulberry32(seed);
  const S = 512;
  const [c, x] = canvas(S, S);
  x.clearRect(0, 0, S, S);
  const branch = (px, py, ang, len, w) => {
    if (w < 0.6 || len < 6) return;
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(px, py);
    const nx = px + Math.cos(ang) * len;
    const ny = py + Math.sin(ang) * len;
    x.lineTo(nx, ny);
    x.stroke();
    branch(nx, ny, ang + (rand() - 0.5) * 0.9, len * 0.85, w * 0.82);
    if (rand() < 0.35) branch(nx, ny, ang + (rand() < 0.5 ? 1 : -1) * (0.6 + rand() * 0.6), len * 0.6, w * 0.6);
  };
  x.lineCap = 'round';
  x.shadowColor = '#c38cff';
  x.shadowBlur = 18;
  x.strokeStyle = '#e8d4ff';
  for (let i = 0; i < 5; i++) branch(S / 2, S / 2, (i / 5) * Math.PI * 2 + rand(), 34 + rand() * 20, 7);
  const out = tex(c, { repeat: false });
  cache.set(key, out);
  return out;
}

export function signTexture(text, color, bg = '#08080c') {
  const key = `sign:${text}:${color}`;
  if (cache.has(key)) return cache.get(key);
  const [c, x] = canvas(512, 128);
  x.fillStyle = bg;
  x.fillRect(0, 0, 512, 128);
  x.font = '900 72px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = color;
  x.shadowBlur = 24;
  x.fillStyle = color;
  x.fillText(text, 256, 68);
  x.shadowBlur = 0;
  x.fillStyle = '#ffffff';
  x.globalAlpha = 0.6;
  x.fillText(text, 256, 68);
  const out = tex(c, { repeat: false });
  cache.set(key, out);
  return out;
}

export function roadMarkTexture() {
  if (cache.has('marks')) return cache.get('marks');
  const [c, x] = canvas(64, 256);
  x.clearRect(0, 0, 64, 256);
  x.fillStyle = 'rgba(235,230,210,0.85)';
  x.fillRect(24, 0, 16, 140);
  const out = tex(c);
  cache.set('marks', out);
  return out;
}
