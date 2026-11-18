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

// Bruit de pixels (grain fin réaliste) appliqué à tout un canvas.
function pixelNoise(ctx, w, h, rand, amp = 18, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amp;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + (mono ? n : (rand() - 0.5) * amp)));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + (mono ? n : (rand() - 0.5) * amp)));
  }
  ctx.putImageData(img, 0, 0);
}

// Taches diffuses (usure, humidité, salissures).
function blotches(ctx, w, h, rand, n, rgb, aMin, aMax, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const px = rand() * w;
    const py = rand() * h;
    const r = rMin + rand() * (rMax - rMin);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    const a = aMin + rand() * (aMax - aMin);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
}

// Façade réaliste : enduit / brique / mur-rideau, fenêtres vitrées avec reflet
// du ciel, intérieurs éclairés (texture émissive associée).
// (8 travées x 8 étages par répétition). style : 'concrete' | 'brick' | 'glass'.
const WALLS = ['#9a5b46', '#b8ab94', '#8d8f91', '#c9c1b2', '#6f7479', '#a8836a', '#d4cfc4', '#7d6a5a'];
const LIT = ['#ffd9a0', '#ffe6bf', '#fff1d8', '#ffcf8a', '#e8f0ff'];

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
  const glass = style === 'glass';
  const wall = glass ? ['#3e5468', '#3c5a60', '#46505e'][seed % 3] : WALLS[(seed * 3 + style.length) % WALLS.length];
  x.fillStyle = wall;
  x.fillRect(0, 0, W, H);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, W, H);
  if (style === 'brick') {
    x.fillStyle = shade(wall, 0.12);
    x.fillRect(0, 0, W, H);
    for (let row = 0; row < H / 8; row++) {
      for (let col = -1; col < W / 20 + 1; col++) {
        x.fillStyle = shade(wall, (rand() - 0.5) * 0.08);
        x.fillRect(col * 20 + (row % 2) * 10 + 1, row * 8 + 1, 18, 6);
      }
    }
  }
  blotches(x, W, H, rand, 30, '30,26,22', 0.04, 0.12, 20, 90);
  for (let f = 0; f < floors; f++) {
    // Bandeau d'étage en pierre
    x.fillStyle = shade(wall, 0.08);
    x.fillRect(0, f * fh + fh - 6, W, 6);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(0, f * fh + fh - 1, W, 1);
    for (let b = 0; b < bays; b++) {
      const ww = bw * (glass ? 0.86 : 0.52);
      const wh = fh * (glass ? 0.78 : 0.6);
      const wx = b * bw + (bw - ww) / 2;
      const wy = f * fh + fh * (glass ? 0.08 : 0.14);
      const lit = rand() < (glass ? 0.32 : 0.3);
      // Embrasure sombre + cadre aluminium
      x.fillStyle = 'rgba(0,0,0,0.45)';
      x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      x.fillStyle = '#5a5d62';
      x.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      if (lit) {
        const col = LIT[Math.floor(rand() * LIT.length)];
        for (const ctx of [x, ex]) {
          const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
          g.addColorStop(0, col);
          g.addColorStop(1, shade(col, -0.35));
          ctx.fillStyle = g;
          ctx.fillRect(wx, wy, ww, wh);
          // Stores / rideaux / silhouette de mobilier
          ctx.fillStyle = ctx === ex ? 'rgba(0,0,0,0.55)' : 'rgba(60,40,30,0.55)';
          if (rand() < 0.4) ctx.fillRect(wx, wy, ww, wh * (0.2 + rand() * 0.5));
          if (rand() < 0.35) ctx.fillRect(wx + ww * (0.2 + rand() * 0.5), wy + wh * 0.6, ww * 0.25, wh * 0.4);
        }
      } else {
        // Vitre éteinte : reflet du ciel (dégradé) + reflet diagonal discret
        const g = x.createLinearGradient(0, wy, 0, wy + wh);
        g.addColorStop(0, '#6d7f92');
        g.addColorStop(0.55, '#2c3640');
        g.addColorStop(1, '#151a20');
        x.fillStyle = g;
        x.fillRect(wx, wy, ww, wh);
        x.fillStyle = 'rgba(255,255,255,0.06)';
        x.beginPath();
        x.moveTo(wx + ww * 0.15, wy + wh);
        x.lineTo(wx + ww * 0.55, wy);
        x.lineTo(wx + ww * 0.75, wy);
        x.lineTo(wx + ww * 0.35, wy + wh);
        x.fill();
      }
      // Meneaux
      x.fillStyle = '#4a4d52';
      x.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      if (!glass) {
        x.fillRect(wx, wy + wh * 0.62, ww, 2);
        // Appui de fenêtre + coulure
        x.fillStyle = shade(wall, 0.15);
        x.fillRect(wx - 5, wy + wh + 2, ww + 10, 4);
        const sg = x.createLinearGradient(0, wy + wh + 6, 0, wy + wh + 26);
        sg.addColorStop(0, 'rgba(20,18,16,0.22)');
        sg.addColorStop(1, 'rgba(20,18,16,0)');
        x.fillStyle = sg;
        x.fillRect(wx - 2, wy + wh + 6, ww + 4, 20);
      }
    }
  }
  pixelNoise(x, W, H, rand, 14);
  const out = { map: tex(c), emissive: tex(e), bays, floors };
  cache.set(key, out);
  return out;
}

// Asphalte réaliste : granulats, rapiéçages, fissures fines, taches d'huile
// et traces de pneus ; carte de rugosité associée (zones lissées plus brillantes).
export function asphaltTextures() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const rand = mulberry32(7);
  const S = 1024;
  const [c, x] = canvas(S, S);
  const [r, rx] = canvas(S, S);
  x.fillStyle = '#3a3a3c';
  x.fillRect(0, 0, S, S);
  rx.fillStyle = '#e0e0e0';
  rx.fillRect(0, 0, S, S);
  blotches(x, S, S, rand, 60, '70,70,72', 0.08, 0.2, 30, 160);
  blotches(x, S, S, rand, 40, '18,18,20', 0.1, 0.25, 30, 140);
  // Rapiéçages rectangulaires plus sombres
  for (let i = 0; i < 6; i++) {
    const w = 60 + rand() * 180;
    const h = 40 + rand() * 120;
    const px = rand() * S;
    const py = rand() * S;
    x.fillStyle = `rgba(22,22,24,${0.35 + rand() * 0.25})`;
    x.fillRect(px, py, w, h);
    x.strokeStyle = 'rgba(10,10,10,0.5)';
    x.lineWidth = 1.5;
    x.strokeRect(px, py, w, h);
    rx.fillStyle = '#c8c8c8';
    rx.fillRect(px, py, w, h);
  }
  // Taches d'huile (plus lisses)
  for (let i = 0; i < 18; i++) {
    const px = rand() * S;
    const py = rand() * S;
    const rr = 8 + rand() * 30;
    const g = x.createRadialGradient(px, py, 0, px, py, rr);
    g.addColorStop(0, 'rgba(8,8,10,0.5)');
    g.addColorStop(1, 'rgba(8,8,10,0)');
    x.fillStyle = g;
    x.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    const gr = rx.createRadialGradient(px, py, 0, px, py, rr);
    gr.addColorStop(0, 'rgba(60,60,60,0.9)');
    gr.addColorStop(1, 'rgba(60,60,60,0)');
    rx.fillStyle = gr;
    rx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
  }
  // Fissures fines ramifiées
  x.lineCap = x.lineJoin = 'round';
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = `rgba(12,12,12,${0.5 + rand() * 0.4})`;
    x.lineWidth = 0.8 + rand() * 1.4;
    x.beginPath();
    let px = rand() * S;
    let py = rand() * S;
    let a = rand() * Math.PI * 2;
    x.moveTo(px, py);
    for (let k = 0; k < 14; k++) {
      a += (rand() - 0.5) * 1.1;
      px += Math.cos(a) * (6 + rand() * 12);
      py += Math.sin(a) * (6 + rand() * 12);
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // Granulats : points clairs et sombres
  for (let i = 0; i < 42000; i++) {
    const v = rand();
    x.fillStyle = v < 0.5 ? `rgba(140,140,140,${0.2 + rand() * 0.3})` : `rgba(10,10,10,${0.2 + rand() * 0.3})`;
    const sz = 0.8 + rand() * 1.8;
    x.fillRect(rand() * S, rand() * S, sz, sz);
  }
  pixelNoise(x, S, S, rand, 16);
  pixelNoise(rx, S, S, rand, 30);
  const out = { map: tex(c), roughness: tex(r, { srgb: false }) };
  cache.set('asphalt', out);
  return out;
}

// Trottoir : dalles de béton (joints, usure, taches de chewing-gum).
export function sidewalkTexture() {
  if (cache.has('sidewalk')) return cache.get('sidewalk');
  const rand = mulberry32(11);
  const S = 512;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#4c4b48';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const v = 128 + Math.floor((rand() - 0.5) * 18);
      x.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      x.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
    }
  }
  blotches(x, S, S, rand, 40, '50,48,44', 0.06, 0.18, 10, 70);
  for (let i = 0; i < 70; i++) {
    x.fillStyle = `rgba(40,40,40,${0.2 + rand() * 0.3})`;
    x.beginPath();
    x.arc(rand() * S, rand() * S, 1 + rand() * 2.5, 0, Math.PI * 2);
    x.fill();
  }
  pixelNoise(x, S, S, rand, 22);
  const out = tex(c);
  cache.set('sidewalk', out);
  return out;
}

// Tôle nervurée (conteneurs, caisses) : ondulations ombrées, rouille, rayures.
export function ribbedTexture(color) {
  const key = 'ribbed:' + color;
  if (cache.has(key)) return cache.get(key);
  const rand = mulberry32(color.charCodeAt(1) * 13 + color.charCodeAt(4));
  const [c, x] = canvas(256, 256);
  x.fillStyle = color;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 32) {
    const g = x.createLinearGradient(i, 0, i + 32, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.35, 'rgba(0,0,0,0.0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0.06)');
    x.fillStyle = g;
    x.fillRect(i, 0, 32, 256);
  }
  blotches(x, 256, 256, rand, 14, '110,58,30', 0.12, 0.35, 6, 30);
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(200,200,200,${0.05 + rand() * 0.12})`;
    x.lineWidth = 0.7;
    x.beginPath();
    const px = rand() * 256;
    const py = rand() * 256;
    x.moveTo(px, py);
    x.lineTo(px + (rand() - 0.5) * 30, py + (rand() - 0.5) * 8);
    x.stroke();
  }
  x.strokeStyle = 'rgba(0,0,0,0.45)';
  x.lineWidth = 4;
  x.strokeRect(2, 2, 252, 252);
  pixelNoise(x, 256, 256, rand, 14);
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
        x.fillStyle = shade(color, (rand() - 0.5) * 0.1);
        x.fillRect(px, py, bw - 3, bh - 3);
        x.fillStyle = 'rgba(0,0,0,0.12)';
        x.fillRect(px, py + bh - 5, bw - 3, 2);
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
        x.fillStyle = 'rgba(0,0,0,0.08)';
        x.fillRect(px + 2, row * ph + ph - 4, pw - 4, 2);
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
          x.fillStyle = 'rgba(255,255,255,0.05)';
          x.fillRect(i * p + 3, j * p + 3, p - 6, (p - 6) * 0.35);
        }
      }
    }
  }
  if (kind !== 'glassLit') pixelNoise(x, S, S, rand, 12);
  const out = tex(c);
  cache.set(key, out);
  return out;
}

export function roofTexture() {
  if (cache.has('roof')) return cache.get('roof');
  const rand = mulberry32(99);
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#6b6a66';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = rand() < 0.5 ? '#7d7b76' : '#55534f';
    x.beginPath();
    x.arc(rand() * 256, rand() * 256, 1 + rand() * 2.5, 0, Math.PI * 2);
    x.fill();
  }
  blotches(x, 256, 256, rand, 12, '30,30,28', 0.08, 0.2, 10, 50);
  x.strokeStyle = 'rgba(20,20,20,0.35)';
  x.lineWidth = 2;
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
