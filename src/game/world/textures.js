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

// Façade cartoon : mur en aplat, fenêtres arrondies à cadre épais.
// (8 travées x 8 étages par répétition). style : 'concrete' | 'brick' | 'glass'.
const WALLS = ['#e86f6f', '#5fb7c9', '#f2b84b', '#8f7ad8', '#6fcf97', '#e98ccf', '#4f74c9', '#ff9f5a'];
const LIT = ['#ffe27a', '#ffd166', '#9ff3ff', '#ffb3e6', '#ffe27a'];

function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

export function facadeTextures(style, seed = 1) {
  const key = `facade:${style}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const rand = mulberry32(seed * 977 + style.length * 31);
  const W = 512;
  const H = 512;
  const bays = 8;
  const floors = 8;
  const bw = W / bays;
  const fh = H / floors;
  const [c, x] = canvas(W, H);
  const [e, ex] = canvas(W, H);
  const wall = style === 'glass' ? ['#3d6fd1', '#2fa8a8', '#7b4ad6'][seed % 3] : WALLS[(seed * 3 + style.length) % WALLS.length];
  x.fillStyle = wall;
  x.fillRect(0, 0, W, H);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, W, H);
  if (style === 'brick') {
    // Briques arrondies, à peine plus sombres
    x.fillStyle = 'rgba(0,0,0,0.10)';
    for (let row = 0; row < H / 14; row++) {
      for (let col = -1; col < W / 32; col++) {
        if (rand() < 0.35) continue;
        roundRect(x, col * 32 + (row % 2) * 16 + 2, row * 14 + 2, 28, 10, 4);
        x.fill();
      }
    }
  }
  // Bandeaux d'étage
  for (let f = 0; f < floors; f++) {
    x.fillStyle = 'rgba(20,10,50,0.22)';
    x.fillRect(0, f * fh + fh - 7, W, 7);
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.fillRect(0, f * fh + fh - 9, W, 2);
    for (let b = 0; b < bays; b++) {
      const glass = style === 'glass';
      const ww = bw * (glass ? 0.8 : 0.56);
      const wh = fh * (glass ? 0.72 : 0.58);
      const wx = b * bw + (bw - ww) / 2;
      const wy = f * fh + fh * (glass ? 0.1 : 0.16);
      const lit = rand() < (glass ? 0.35 : 0.3);
      // Cadre épais sombre
      x.fillStyle = '#1d1640';
      roundRect(x, wx - 4, wy - 4, ww + 8, wh + 8, 9);
      x.fill();
      x.fillStyle = lit ? LIT[Math.floor(rand() * LIT.length)] : '#2a2160';
      roundRect(x, wx, wy, ww, wh, 6);
      x.fill();
      if (lit) {
        ex.fillStyle = x.fillStyle;
        roundRect(ex, wx, wy, ww, wh, 6);
        ex.fill();
        // Rideaux ou silhouette
        if (rand() < 0.45) {
          const cc = ['#e86f6f', '#6fcf97', '#8f7ad8'][Math.floor(rand() * 3)];
          for (const ctx of [x, ex]) {
            ctx.fillStyle = ctx === ex ? '#000' : cc;
            ctx.fillRect(wx, wy, ww * 0.22, wh);
            ctx.fillRect(wx + ww * 0.78, wy, ww * 0.22, wh);
          }
        }
      } else {
        // Reflet cartoon : deux traits diagonaux
        x.strokeStyle = 'rgba(160,200,255,0.35)';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(wx + ww * 0.2, wy + wh * 0.65);
        x.lineTo(wx + ww * 0.55, wy + wh * 0.2);
        x.moveTo(wx + ww * 0.45, wy + wh * 0.75);
        x.lineTo(wx + ww * 0.7, wy + wh * 0.45);
        x.stroke();
      }
      if (!glass) {
        // Rebord + croisillon
        x.fillStyle = 'rgba(255,255,255,0.35)';
        roundRect(x, wx - 6, wy + wh + 3, ww + 12, 5, 2);
        x.fill();
        x.fillStyle = '#1d1640';
        x.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
      }
    }
  }
  const out = { map: tex(c), emissive: tex(e), bays, floors };
  cache.set(key, out);
  return out;
}

// Asphalte cartoon : violet-bleu, flaques stylisées bleu ciel, fissures épaisses.
export function asphaltTextures() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const rand = mulberry32(7);
  const S = 512;
  const [c, x] = canvas(S, S);
  const [r, rx] = canvas(S, S);
  x.fillStyle = '#3b3561';
  x.fillRect(0, 0, S, S);
  rx.fillStyle = '#d0d0d0';
  rx.fillRect(0, 0, S, S);
  // Taches plus claires (usure) en formes rondes
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(120,110,190,${0.08 + rand() * 0.08})`;
    x.beginPath();
    x.ellipse(rand() * S, rand() * S, 10 + rand() * 40, 6 + rand() * 20, rand() * 3, 0, Math.PI * 2);
    x.fill();
  }
  // Flaques : aplat clair + reflet
  for (let i = 0; i < 9; i++) {
    const px = rand() * S;
    const py = rand() * S;
    const a = 18 + rand() * 30;
    const b = a * (0.4 + rand() * 0.3);
    x.fillStyle = '#5a5fa8';
    x.beginPath();
    x.ellipse(px, py, a, b, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(190,230,255,0.7)';
    x.lineWidth = 3;
    x.beginPath();
    x.ellipse(px - a * 0.2, py - b * 0.2, a * 0.5, b * 0.35, 0, Math.PI * 1.1, Math.PI * 1.6);
    x.stroke();
    rx.fillStyle = '#202020';
    rx.beginPath();
    rx.ellipse(px, py, a, b, 0, 0, Math.PI * 2);
    rx.fill();
  }
  // Fissures épaisses arrondies
  x.strokeStyle = '#231d45';
  x.lineCap = x.lineJoin = 'round';
  for (let i = 0; i < 10; i++) {
    x.lineWidth = 2 + rand() * 2;
    x.beginPath();
    let px = rand() * S;
    let py = rand() * S;
    x.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      px += (rand() - 0.5) * 50;
      py += (rand() - 0.5) * 50;
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
  x.fillStyle = '#4b4880';
  x.fillRect(0, 0, S, S);
  const tiles = ['#7a76b8', '#8480c2', '#706cae'];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      x.fillStyle = tiles[Math.floor(rand() * tiles.length)];
      roundRect(x, i * 64 + 3, j * 64 + 3, 58, 58, 10);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(x, i * 64 + 7, j * 64 + 6, 40, 6, 3);
      x.fill();
    }
  }
  const out = tex(c);
  cache.set('sidewalk', out);
  return out;
}

// Métal nervuré cartoon (conteneurs, caisses) : bandes franches, bosses.
export function ribbedTexture(color) {
  const key = 'ribbed:' + color;
  if (cache.has(key)) return cache.get(key);
  const [c, x] = canvas(256, 256);
  x.fillStyle = color;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 32) {
    x.fillStyle = 'rgba(20,10,50,0.28)';
    x.fillRect(i + 22, 0, 8, 256);
    x.fillStyle = 'rgba(255,255,255,0.22)';
    x.fillRect(i + 4, 0, 5, 256);
  }
  x.strokeStyle = 'rgba(20,10,50,0.6)';
  x.lineWidth = 8;
  x.strokeRect(4, 4, 248, 248);
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

// Enseigne : lettres épaisses arrondies avec contour (style du logo SuperEssence).
export function signTexture(text, color, bg = '#1d1640') {
  const key = `sign:${text}:${color}:${bg}`;
  if (cache.has(key)) return cache.get(key);
  const [c, x] = canvas(512, 128);
  x.fillStyle = bg;
  roundRect(x, 0, 0, 512, 128, 28);
  x.fill();
  let size = 76;
  x.font = `${size}px "Lilita One", "Arial Black", system-ui, sans-serif`;
  while (x.measureText(text).width > 450 && size > 30) {
    size -= 4;
    x.font = `${size}px "Lilita One", "Arial Black", system-ui, sans-serif`;
  }
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineWidth = 12;
  x.strokeStyle = '#120a2a';
  x.strokeText(text, 262, 72);
  x.fillStyle = '#120a2a';
  x.fillText(text, 262, 74);
  x.fillStyle = color;
  x.fillText(text, 256, 66);
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

// ---------- Murs des bâtiments détaillés (1 répétition = 4 m) ----------
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return '#' + c.getHexString();
}

export function wallTexture(kind, color) {
  const key = `wall:${kind}:${color}`;
  if (cache.has(key)) return cache.get(key);
  const rand = mulberry32(kind.length * 131 + color.charCodeAt(1) * 7 + color.charCodeAt(3));
  const S = 256;
  const [c, x] = canvas(S, S);
  x.fillStyle = color;
  x.fillRect(0, 0, S, S);
  if (kind === 'brick') {
    // Briques (≈ 0,5 x 0,2 m) avec joints et légères variations.
    x.fillStyle = shade(color, 0.22);
    x.fillRect(0, 0, S, S);
    const bw = 32;
    const bh = 12;
    for (let row = 0; row < S / bh; row++) {
      for (let k = -1; k < S / bw + 1; k++) {
        const px = k * bw + (row % 2) * (bw / 2) + 1.5;
        const py = row * bh + 1.5;
        x.fillStyle = shade(color, (rand() - 0.5) * 0.09);
        roundRect(x, px, py, bw - 3, bh - 3, 2.5);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.10)';
        x.fillRect(px + 2, py + 1, bw - 8, 2);
      }
    }
  } else if (kind === 'stucco' || kind === 'artdeco') {
    for (let i = 0; i < 70; i++) {
      x.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '40,20,60'},${0.03 + rand() * 0.04})`;
      x.beginPath();
      x.ellipse(rand() * S, rand() * S, 10 + rand() * 40, 6 + rand() * 20, rand() * 3, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = 'rgba(40,20,60,0.10)';
    for (let y = 0; y < S; y += 64) x.fillRect(0, y, S, 2);
  } else if (kind === 'office' || kind === 'stone') {
    // Panneaux / pierres de taille
    const pw = kind === 'stone' ? 64 : 128;
    const ph = kind === 'stone' ? 32 : 64;
    for (let row = 0; row < S / ph; row++) {
      for (let k = -1; k < S / pw + 1; k++) {
        const px = k * pw + (kind === 'stone' ? (row % 2) * (pw / 2) : 0);
        x.fillStyle = shade(color, (rand() - 0.5) * 0.06);
        x.fillRect(px + 2, row * ph + 2, pw - 4, ph - 4);
        x.fillStyle = 'rgba(255,255,255,0.12)';
        x.fillRect(px + 3, row * ph + 3, pw - 8, 3);
      }
    }
  } else if (kind === 'glass' || kind === 'glassLit') {
    // Mur-rideau : panneaux de verre (1 m) avec reflets ; version émissive = bureaux allumés.
    const lit = kind === 'glassLit';
    x.fillStyle = lit ? '#000' : shade(color, -0.12);
    x.fillRect(0, 0, S, S);
    const p = S / 4;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (lit) {
          if (rand() < 0.3) {
            x.fillStyle = ['#ffe27a', '#d0f4ff', '#ffd9a0'][Math.floor(rand() * 3)];
            x.globalAlpha = 0.5 + rand() * 0.4;
            x.fillRect(i * p + 4, j * p + 4, p - 8, p - 8);
            x.globalAlpha = 1;
          }
        } else {
          const g = x.createLinearGradient(i * p, j * p, i * p + p, j * p + p);
          g.addColorStop(0, shade(color, 0.12));
          g.addColorStop(1, shade(color, -0.08));
          x.fillStyle = g;
          x.fillRect(i * p + 3, j * p + 3, p - 6, p - 6);
          x.strokeStyle = 'rgba(255,255,255,0.35)';
          x.lineWidth = 3;
          x.beginPath();
          x.moveTo(i * p + 10, j * p + p * 0.6);
          x.lineTo(i * p + p * 0.5, j * p + 10);
          x.stroke();
        }
      }
    }
  }
  const out = tex(c);
  cache.set(key, out);
  return out;
}

export function roofTexture() {
  if (cache.has('roof')) return cache.get('roof');
  const rand = mulberry32(99);
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#6a6488';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    x.fillStyle = rand() < 0.5 ? '#7a74a0' : '#58527a';
    x.beginPath();
    x.arc(rand() * 256, rand() * 256, 1 + rand() * 2.5, 0, Math.PI * 2);
    x.fill();
  }
  x.strokeStyle = 'rgba(30,20,50,0.5)';
  x.lineWidth = 3;
  x.strokeRect(0, 0, 256, 256);
  const out = tex(c);
  cache.set('roof', out);
  return out;
}

export function awningTexture() {
  if (cache.has('awning')) return cache.get('awning');
  const [c, x] = canvas(128, 64);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#ffffff' : '#c8c8d8';
    x.fillRect(i * 16, 0, 16, 64);
  }
  // Bord festonné
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(0, 56, 128, 8);
  const out = tex(c);
  cache.set('awning', out);
  return out;
}
