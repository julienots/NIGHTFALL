// Textures procédurales du monde ouvert (villages, ruines) : enduit,
// pierre appareillée, ardoises, chaume, planches, runes des Veilleurs.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const cache = new Map();

function make(key, w, h, draw, { srgb = true, repeat = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h, mulberry32(key.length * 977 + key.charCodeAt(0) * 31));
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

function noise(x, w, h, r, amp) {
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
}

function blot(x, w, h, r, n, rgb, a0, a1, r0, r1) {
  for (let i = 0; i < n; i++) {
    const px = r() * w;
    const py = r() * h;
    const rad = r0 + r() * (r1 - r0);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(${rgb},${a0 + r() * (a1 - a0)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
}

// Enduit à la chaux (1 répétition = 2 m), taches d'humidité en bas.
export const plasterTex = () => make('plaster', 256, 256, (x, w, h, r) => {
  x.fillStyle = '#d6cbb4';
  x.fillRect(0, 0, w, h);
  blot(x, w, h, r, 40, '150,135,110', 0.05, 0.16, 10, 60);
  blot(x, w, h, r, 20, '255,250,240', 0.05, 0.12, 10, 50);
  const g = x.createLinearGradient(0, h * 0.7, 0, h);
  g.addColorStop(0, 'rgba(90,80,60,0)');
  g.addColorStop(1, 'rgba(90,80,60,0.25)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  noise(x, w, h, r, 14);
});

// Pierre appareillée irrégulière (1 répétition = 2 m).
export const stoneTex = () => make('stone', 256, 256, (x, w, h, r) => {
  x.fillStyle = '#4a463f';
  x.fillRect(0, 0, w, h);
  let y = 0;
  while (y < h) {
    const rh = 22 + r() * 18;
    let px = -r() * 30;
    while (px < w) {
      const rw = 30 + r() * 40;
      const v = 105 + Math.floor(r() * 45);
      x.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      x.beginPath();
      const j = () => (r() - 0.5) * 4;
      x.moveTo(px + 2 + j(), y + 2 + j());
      x.lineTo(px + rw - 2 + j(), y + 2 + j());
      x.lineTo(px + rw - 2 + j(), y + rh - 2 + j());
      x.lineTo(px + 2 + j(), y + rh - 2 + j());
      x.closePath();
      x.fill();
      px += rw;
    }
    y += rh;
  }
  blot(x, w, h, r, 18, '60,80,40', 0.08, 0.22, 8, 40); // mousse
  noise(x, w, h, r, 20);
});

// Ardoises (toits) : rangées décalées.
export const slateTex = () => make('slate', 256, 256, (x, w, h, r) => {
  x.fillStyle = '#26282c';
  x.fillRect(0, 0, w, h);
  for (let row = 0; row < 16; row++) {
    for (let k = -1; k < 9; k++) {
      const v = 52 + Math.floor(r() * 30);
      x.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      x.fillRect(k * 32 + (row % 2) * 16 + 1, row * 16 + 1, 30, 14);
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillRect(k * 32 + (row % 2) * 16 + 1, row * 16 + 13, 30, 2);
    }
  }
  blot(x, w, h, r, 10, '70,90,50', 0.1, 0.25, 6, 30);
  noise(x, w, h, r, 12);
});

// Chaume (toits des maisons pauvres).
export const thatchTex = () => make('thatch', 256, 256, (x, w, h, r) => {
  x.fillStyle = '#6a5636';
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.floor(r() * 80);
    x.strokeStyle = `rgba(${v},${Math.floor(v * 0.82)},${Math.floor(v * 0.5)},0.8)`;
    x.lineWidth = 1 + r();
    const px = r() * w;
    const py = r() * h;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (r() - 0.5) * 4, py + 10 + r() * 16);
    x.stroke();
  }
  for (let row = 0; row < 8; row++) {
    x.fillStyle = 'rgba(30,20,10,0.25)';
    x.fillRect(0, row * 32 + 28, w, 4);
  }
});

// Planches de bois (portes, volets, colombages, ponts).
export const woodTex = () => make('wood', 256, 256, (x, w, h, r) => {
  for (let i = 0; i < 8; i++) {
    const v = 70 + Math.floor(r() * 30);
    x.fillStyle = `rgb(${v},${Math.floor(v * 0.72)},${Math.floor(v * 0.5)})`;
    x.fillRect(i * 32, 0, 32, h);
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.fillRect(i * 32, 0, 2, h);
    for (let k = 0; k < 30; k++) {
      x.strokeStyle = `rgba(30,18,8,${0.1 + r() * 0.2})`;
      x.beginPath();
      const px = i * 32 + r() * 32;
      x.moveTo(px, 0);
      x.lineTo(px + (r() - 0.5) * 6, h);
      x.stroke();
    }
  }
  noise(x, w, h, r, 12);
});

// Runes des Veilleurs (émissives) sur fond noir.
export const runeTex = () => make('runes', 256, 512, (x, w, h, r) => {
  x.fillStyle = '#000';
  x.fillRect(0, 0, w, h);
  x.strokeStyle = '#fff';
  x.lineCap = 'round';
  x.shadowColor = '#fff';
  x.shadowBlur = 8;
  for (let row = 0; row < 7; row++) {
    const cy = 40 + row * 66;
    const cx = w / 2;
    x.lineWidth = 5;
    x.beginPath();
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const l = 14 + r() * 22;
      x.moveTo(cx + (r() - 0.5) * 20, cy + (r() - 0.5) * 20);
      x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
    }
    x.stroke();
    if (r() < 0.6) {
      x.beginPath();
      x.arc(cx, cy, 10 + r() * 14, 0, Math.PI * 2);
      x.stroke();
    }
  }
}, { repeat: false });
