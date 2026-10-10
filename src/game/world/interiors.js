// Intérieurs praticables : le lycée Vesper-Nord et la maison de Noa.
// Les deux zones sont construites loin de la ville (x = 1000) et cachées par
// défaut ; le jeu y téléporte le joueur (fondu) et bascule leur visibilité.
// Style : cartoon chaleureux, lisible, avec quelques détails inquiétants.
// Optimisation mobile : cloisons en boîtes simples, mobilier répété en
// InstancedMesh, textes et affiches regroupés dans un atlas canvas unique par
// zone, puis fusion des maillages statiques (mergeStatic).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, mergeStatic } from './helpers.js';
import { mulberry32 } from '../core/rng.js';

const H = 3.8; // hauteur sous plafond (m)
const SKIN = 0.2; // épaisseur d'une peau de cloison (deux pièces voisines = 0,4 m)
const DOOR_H = 2.6; // hauteur des baies de porte
const FONT = '"Lilita One", "Arial Black", system-ui, sans-serif';
const HAND = '"Comic Sans MS", "Segoe Print", "Nunito", cursive';

export const SCHOOL_ORIGIN = { x: 1000, z: 0 };
export const HOME_ORIGIN = { x: 1000, z: 300 };

// ---------------------------------------------------------------------------
// Matériaux partagés (un matériau par couleur → la fusion regroupe tout)
// ---------------------------------------------------------------------------
const matCache = new Map();
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, M({ color, ...extra }));
  return matCache.get(key);
}
function glow(color, intensity = 1.2) {
  return mat('#ffffff', { emissive: color, emissiveIntensity: intensity });
}
let vcMat = null;
// Matériau à couleurs de sommets (mobilier instancié multicolore).
function vertexMat() {
  if (!vcMat) {
    vcMat = M({ color: '#ffffff' });
    vcMat.vertexColors = true;
  }
  return vcMat;
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const rb = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.1, h / 2.1, d / 2.1));

// Géométrie « prototype » : plusieurs pièces colorées fusionnées en une seule
// géométrie à couleurs de sommets (pour InstancedMesh).
// Pièce = [x, yBas, z, sx, sy, sz, couleur] (boîte) ou { geo, x, y, z, rx, ry, rz, color }.
function proto(parts) {
  const geos = [];
  const c = new THREE.Color();
  for (const p of parts) {
    let g;
    if (Array.isArray(p)) {
      const [x, y, z, sx, sy, sz, color] = p;
      g = UNIT.clone().toNonIndexed();
      g.scale(sx, sy, sz);
      g.translate(x, y + sy / 2, z);
      c.set(color);
    } else {
      g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone());
      const e = new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
      g.translate(p.x || 0, p.y || 0, p.z || 0);
      c.set(p.color);
    }
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const out = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return out;
}

// ---------------------------------------------------------------------------
// Atlas canvas : toutes les images d'une zone (affiches, panneaux, tableaux)
// dans une seule texture → un seul appel de dessin pour tous les décors peints.
// ---------------------------------------------------------------------------
class Atlas {
  // w x h : première page ; les pages suivantes (si besoin) font w x h2.
  constructor(w, h, h2 = h) {
    this.W = w;
    this.H2 = h2;
    this.pages = [];
    this.addPage(h);
    this.mat = this.pages[0].mat;
    this.glowMat = this.pages[0].glowMat;
    this.softMat = this.pages[0].softMat;
    this.tex = this.pages[0].tex;
  }

  addPage(h) {
    const c = document.createElement('canvas');
    c.width = this.W;
    c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const page = {
      c, H: h, ctx: c.getContext('2d'), tex, shelves: [], nextY: 0,
      mat: M({ map: tex }),
      glowMat: M({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.85 }),
      softMat: M({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.3 }),
    };
    this.pages.push(page);
    return page;
  }

  // Réserve un rectangle (rangement en étagères) et y dessine fn(ctx, w, h).
  draw(w, h, fn) {
    const pad = 6;
    let page = null;
    let best = null;
    // Meilleure étagère existante : assez haute mais pas trop (limite le gaspillage).
    for (const pg of this.pages) {
      for (const s of pg.shelves) {
        if (s.h >= h && s.h <= h * 1.5 + 8 && s.x + w <= this.W && (!best || s.h < best.h)) {
          best = s;
          page = pg;
        }
      }
    }
    if (!best) {
      page = this.pages.find((pg) => pg.nextY + h <= pg.H) || this.addPage(Math.max(this.H2, h));
      best = { y: page.nextY, h, x: 0 };
      page.nextY += h + pad;
      page.shelves.push(best);
    }
    const r = { x: best.x, y: best.y, w, h, page: this.pages.indexOf(page) };
    best.x += w + pad;
    const x = page.ctx;
    x.save();
    x.translate(r.x, r.y);
    x.beginPath();
    x.rect(0, 0, w, h);
    x.clip();
    fn(x, w, h);
    x.restore();
    return r;
  }

  // Plan (pw x ph mètres) dont les UV pointent sur le rectangle r.
  plane(r, pw, ph) {
    const g = new THREE.PlaneGeometry(pw, ph);
    const uv = g.attributes.uv;
    const inset = 1.5;
    const H = this.pages[r.page].H;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, (r.x + inset + u * (r.w - 2 * inset)) / this.W, 1 - (r.y + inset + (1 - v) * (r.h - 2 * inset)) / H);
    }
    g.userData.atlasPage = r.page;
    return g;
  }

  // Fin de construction : envoie les textures et affecte le bon matériau de
  // page aux plans qui pointent vers une page secondaire.
  finish(root) {
    for (const pg of this.pages) pg.tex.needsUpdate = true;
    root.traverse((o) => {
      const p = o.geometry?.userData.atlasPage;
      if (!o.isMesh || !p) return;
      if (o.material === this.mat) o.material = this.pages[p].mat;
      else if (o.material === this.glowMat) o.material = this.pages[p].glowMat;
      else if (o.material === this.softMat) o.material = this.pages[p].softMat;
    });
  }
}

// ---------- Petits outils de dessin ----------
function rr(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

function text(x, s, px, py, size, color, o = {}) {
  const { align = 'center', maxW = 0, font = FONT, stroke = null, lw = 0, base = 'middle' } = o;
  let sz = size;
  x.font = `${sz}px ${font}`;
  if (maxW) {
    while (x.measureText(s).width > maxW && sz > 8) {
      sz -= 2;
      x.font = `${sz}px ${font}`;
    }
  }
  x.textAlign = align;
  x.textBaseline = base;
  x.lineJoin = 'round';
  if (stroke) {
    x.lineWidth = lw || sz * 0.18;
    x.strokeStyle = stroke;
    x.strokeText(s, px, py);
  }
  x.fillStyle = color;
  x.fillText(s, px, py);
}

function star(x, cx, cy, r, color) {
  x.fillStyle = color;
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? r * 0.45 : r;
    x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  x.closePath();
  x.fill();
}

// Affiche : fond, cadre, illustration simple, titre et sous-titre.
function poster(atlas, { w = 200, h = 280, bg, fg = '#fff', title, sub = '', art = 'none', accent = '#ffe27a', ink = '#1d1640' }) {
  return atlas.draw(w, h, (x) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.10)';
    x.fillRect(0, 0, w, h * 0.08);
    x.strokeStyle = ink;
    x.lineWidth = 10;
    x.strokeRect(5, 5, w - 10, h - 10);
    const cx = w / 2;
    const cy = h * 0.4;
    const s = w * 0.28;
    x.lineCap = x.lineJoin = 'round';
    switch (art) {
      case 'stars':
        x.fillStyle = '#0d1440';
        x.beginPath();
        x.arc(cx, cy, s * 1.05, 0, Math.PI * 2);
        x.fill();
        for (let i = 0; i < 9; i++) star(x, cx + Math.cos(i * 2.1) * s * 0.7 * ((i % 3) / 3 + 0.4), cy + Math.sin(i * 2.1) * s * 0.7 * ((i % 3) / 3 + 0.4), 6 + (i % 3) * 4, accent);
        x.strokeStyle = accent;
        x.lineWidth = 6;
        x.beginPath();
        x.ellipse(cx, cy, s * 1.25, s * 0.35, -0.3, 0, Math.PI * 2);
        x.stroke();
        break;
      case 'heart':
        x.fillStyle = accent;
        x.beginPath();
        x.moveTo(cx, cy + s * 0.9);
        x.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.6, cy - s * 1.2, cx, cy - s * 0.35);
        x.bezierCurveTo(cx + s * 0.6, cy - s * 1.2, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.9);
        x.fill();
        for (let i = 0; i < 6; i++) star(x, 30 + i * 40, 40 + (i % 2) * 30, 9, '#fff');
        break;
      case 'runner':
        x.strokeStyle = ink;
        x.lineWidth = 12;
        x.beginPath();
        x.arc(cx + 10, cy - s * 0.8, 16, 0, Math.PI * 2);
        x.moveTo(cx + 5, cy - s * 0.5);
        x.lineTo(cx - 10, cy + s * 0.2);
        x.lineTo(cx + 30, cy + s * 0.8);
        x.moveTo(cx - 10, cy + s * 0.2);
        x.lineTo(cx - 45, cy + s * 0.7);
        x.moveTo(cx - 40, cy - s * 0.3);
        x.lineTo(cx + 2, cy - s * 0.35);
        x.lineTo(cx + 40, cy - s * 0.05);
        x.stroke();
        x.strokeStyle = '#e8343a';
        x.lineWidth = 14;
        x.beginPath();
        x.arc(cx, cy, s * 1.15, 0, Math.PI * 2);
        x.moveTo(cx - s * 0.8, cy - s * 0.8);
        x.lineTo(cx + s * 0.8, cy + s * 0.8);
        x.stroke();
        break;
      case 'gear':
        x.fillStyle = accent;
        x.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const rad = i % 2 ? s * 0.8 : s;
          x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
        x.fill();
        x.fillStyle = bg;
        x.beginPath();
        x.arc(cx, cy, s * 0.35, 0, Math.PI * 2);
        x.fill();
        break;
      case 'ball':
        x.fillStyle = '#fff';
        x.beginPath();
        x.arc(cx, cy, s, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = ink;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          x.beginPath();
          x.arc(cx + Math.cos(a) * s * 0.62, cy + Math.sin(a) * s * 0.62, s * 0.2, 0, Math.PI * 2);
          x.fill();
        }
        x.beginPath();
        x.arc(cx, cy, s * 0.25, 0, Math.PI * 2);
        x.fill();
        break;
      case 'moon':
        x.fillStyle = accent;
        x.beginPath();
        x.arc(cx, cy, s, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = bg;
        x.beginPath();
        x.arc(cx + s * 0.45, cy - s * 0.25, s * 0.85, 0, Math.PI * 2);
        x.fill();
        for (let i = 0; i < 6; i++) star(x, 30 + ((i * 53) % (w - 60)), 30 + ((i * 37) % 90), 5, '#fff');
        break;
      case 'missing':
        x.fillStyle = '#d8d0c0';
        x.fillRect(cx - s, cy - s * 1.1, s * 2, s * 2.1);
        x.fillStyle = '#4a4458';
        x.beginPath();
        x.arc(cx, cy - s * 0.35, s * 0.42, 0, Math.PI * 2);
        x.fill();
        x.beginPath();
        x.ellipse(cx, cy + s * 0.75, s * 0.75, s * 0.5, 0, Math.PI, 0);
        x.fill();
        text(x, '?', cx, cy - s * 0.3, 48, '#d8d0c0');
        break;
      case 'vote':
        x.fillStyle = '#fff';
        x.fillRect(cx - s, cy - s * 0.4, s * 2, s * 1.3);
        x.fillStyle = ink;
        x.fillRect(cx - s * 0.5, cy - s * 0.42, s, 10);
        x.fillStyle = accent;
        x.save();
        x.translate(cx, cy - s * 0.6);
        x.rotate(-0.2);
        x.fillRect(-s * 0.35, -s * 0.5, s * 0.7, s * 0.8);
        x.restore();
        break;
      case 'note':
        x.fillStyle = accent;
        x.beginPath();
        x.ellipse(cx - s * 0.5, cy + s * 0.6, s * 0.35, s * 0.25, -0.4, 0, Math.PI * 2);
        x.ellipse(cx + s * 0.55, cy + s * 0.4, s * 0.35, s * 0.25, -0.4, 0, Math.PI * 2);
        x.fill();
        x.fillRect(cx - s * 0.22, cy - s * 0.8, 12, s * 1.4);
        x.fillRect(cx + s * 0.82, cy - s, 12, s * 1.4);
        x.beginPath();
        x.moveTo(cx - s * 0.22, cy - s * 0.8);
        x.lineTo(cx + s * 0.94, cy - s);
        x.lineTo(cx + s * 0.94, cy - s * 0.65);
        x.lineTo(cx - s * 0.22, cy - s * 0.45);
        x.fill();
        break;
      case 'aegis':
        x.strokeStyle = accent;
        x.lineWidth = 10;
        x.beginPath();
        x.moveTo(cx, cy - s);
        x.lineTo(cx + s * 0.9, cy - s * 0.55);
        x.lineTo(cx + s * 0.7, cy + s * 0.5);
        x.lineTo(cx, cy + s);
        x.lineTo(cx - s * 0.7, cy + s * 0.5);
        x.lineTo(cx - s * 0.9, cy - s * 0.55);
        x.closePath();
        x.stroke();
        x.fillStyle = '#0d1430';
        x.beginPath();
        x.moveTo(cx, cy - s * 0.6);
        x.lineTo(cx + s * 0.25, cy);
        x.lineTo(cx, cy + s * 0.6);
        x.lineTo(cx - s * 0.25, cy);
        x.fill();
        break;
      case 'planets':
        for (const [px, py, r, c] of [[0.2, 0.3, 0.25, '#ffcd20'], [0.55, 0.25, 0.1, '#e86f6f'], [0.75, 0.45, 0.16, '#5fb7c9'], [0.4, 0.62, 0.13, '#6fcf97'], [0.8, 0.75, 0.08, '#e98ccf']]) {
          x.fillStyle = c;
          x.beginPath();
          x.arc(px * w, py * h * 0.85, r * w * 0.5, 0, Math.PI * 2);
          x.fill();
        }
        break;
      case 'leaf':
        x.fillStyle = accent;
        x.beginPath();
        x.ellipse(cx, cy, s * 0.55, s, 0.6, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = ink;
        x.lineWidth = 5;
        x.beginPath();
        x.moveTo(cx - s * 0.6, cy + s * 0.75);
        x.lineTo(cx + s * 0.5, cy - s * 0.6);
        x.stroke();
        x.fillStyle = '#ffe27a';
        x.beginPath();
        x.arc(w * 0.82, h * 0.13, 22, 0, Math.PI * 2);
        x.fill();
        break;
      case 'goggles':
        x.fillStyle = accent;
        rr(x, cx - s * 1.1, cy - s * 0.45, s * 2.2, s * 0.9, s * 0.4);
        x.fill();
        x.fillStyle = '#bfe8ff';
        x.beginPath();
        x.arc(cx - s * 0.5, cy, s * 0.33, 0, Math.PI * 2);
        x.arc(cx + s * 0.5, cy, s * 0.33, 0, Math.PI * 2);
        x.fill();
        break;
      case 'car':
        x.fillStyle = accent;
        rr(x, cx - s * 1.2, cy - s * 0.1, s * 2.4, s * 0.6, 18);
        x.fill();
        rr(x, cx - s * 0.6, cy - s * 0.55, s * 1.2, s * 0.6, 18);
        x.fill();
        x.fillStyle = ink;
        x.beginPath();
        x.arc(cx - s * 0.7, cy + s * 0.5, s * 0.25, 0, Math.PI * 2);
        x.arc(cx + s * 0.7, cy + s * 0.5, s * 0.25, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = '#4dd2ff';
        x.lineWidth = 6;
        for (let i = 0; i < 3; i++) {
          x.beginPath();
          x.moveTo(cx - s * 1.9, cy - s * 0.2 + i * 18);
          x.lineTo(cx - s * 1.35, cy - s * 0.2 + i * 18);
          x.stroke();
        }
        break;
      case 'bolt':
        x.fillStyle = accent;
        x.beginPath();
        x.moveTo(cx + s * 0.2, cy - s * 1.1);
        x.lineTo(cx - s * 0.6, cy + s * 0.15);
        x.lineTo(cx - s * 0.05, cy + s * 0.15);
        x.lineTo(cx - s * 0.3, cy + s * 1.1);
        x.lineTo(cx + s * 0.6, cy - s * 0.2);
        x.lineTo(cx + s * 0.05, cy - s * 0.2);
        x.closePath();
        x.fill();
        break;
      case 'jelly':
        x.fillStyle = accent;
        x.beginPath();
        x.arc(cx, cy - s * 0.2, s * 0.8, Math.PI, 0);
        x.fill();
        x.strokeStyle = accent;
        x.lineWidth = 7;
        for (let i = -2; i <= 2; i++) {
          x.beginPath();
          x.moveTo(cx + i * s * 0.3, cy - s * 0.2);
          x.quadraticCurveTo(cx + i * s * 0.3 + 18, cy + s * 0.4, cx + i * s * 0.3 - 6, cy + s * 0.95);
          x.stroke();
        }
        break;
      default:
        break;
    }
    text(x, title, cx, h * 0.76, Math.round(w * 0.15), fg, { maxW: w - 30, stroke: ink, lw: 8 });
    if (sub) text(x, sub, cx, h * 0.89, Math.round(w * 0.075), fg, { maxW: w - 30, font: '"Nunito", "Arial", sans-serif' });
  });
}

// Panneau de porte / plaque : bandeau arrondi avec texte.
function plaque(atlas, label, color = '#fff', bg = '#2b2050', w = 384, h = 96) {
  const key = [label, color, bg, w, h].join('|');
  atlas.cache = atlas.cache || new Map();
  if (atlas.cache.has(key)) return atlas.cache.get(key);
  const r = atlas.draw(w, h, (x) => {
    x.fillStyle = bg;
    rr(x, 0, 0, w, h, 22);
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.lineWidth = 5;
    rr(x, 8, 8, w - 16, h - 16, 16);
    x.stroke();
    text(x, label, w / 2, h / 2 + 3, Math.round(h * 0.55), color, { maxW: w - 40, stroke: '#120a2a', lw: 7 });
  });
  atlas.cache.set(key, r);
  return r;
}

// Fenêtre : ciel de jour (nuages, arbres) ou de nuit (étoiles, lune, ville).
function skyImage(atlas, night, seed) {
  const rand = mulberry32(seed);
  return atlas.draw(256, 192, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    if (night) {
      g.addColorStop(0, '#140a33');
      g.addColorStop(0.65, '#3a1a6e');
      g.addColorStop(1, '#ff6fa8');
    } else {
      g.addColorStop(0, '#7fd0ff');
      g.addColorStop(0.7, '#bfeaff');
      g.addColorStop(1, '#fff1c9');
    }
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    if (night) {
      for (let i = 0; i < 40; i++) {
        x.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`;
        x.fillRect(rand() * w, rand() * h * 0.6, 2, 2);
      }
      x.fillStyle = '#e8f6ff';
      x.beginPath();
      x.arc(w * 0.72, h * 0.25, 20, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#1d1640';
      let px = 0;
      while (px < w) {
        const bw = 18 + rand() * 30;
        const bh = 30 + rand() * 70;
        x.fillRect(px, h - bh, bw, bh);
        for (let k = 0; k < 4; k++) {
          if (rand() < 0.5) continue;
          x.fillStyle = '#ffe27a';
          x.fillRect(px + 4 + rand() * (bw - 10), h - bh + 6 + rand() * (bh - 12), 4, 5);
          x.fillStyle = '#1d1640';
        }
        px += bw + 2;
      }
    } else {
      x.fillStyle = 'rgba(255,255,255,0.95)';
      for (let i = 0; i < 4; i++) {
        const cx = rand() * w;
        const cy = 20 + rand() * 60;
        for (let k = 0; k < 4; k++) {
          x.beginPath();
          x.arc(cx + k * 14 - 20, cy + (k % 2) * -8, 14 + (k % 2) * 6, 0, Math.PI * 2);
          x.fill();
        }
      }
      // Cimes d'arbres et toits au loin
      for (let i = 0; i < 9; i++) {
        x.fillStyle = i % 2 ? '#56b88a' : '#3fa37a';
        x.beginPath();
        x.arc(i * 32 + rand() * 10, h - 10, 22 + rand() * 14, 0, Math.PI * 2);
        x.fill();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Kit de construction d'une zone (coordonnées locales → collisions en monde)
// ---------------------------------------------------------------------------
function zoneKit(group, col, ox, oz) {
  const k = {};
  // Collision (coordonnées locales, AABB).
  k.solid = (x0, z0, x1, z1, y0 = 0, y1 = H) => col.addBox({ x: ox + Math.min(x0, x1), y: y0, z: oz + Math.min(z0, z1) }, { x: ox + Math.max(x0, x1), y: y1, z: oz + Math.max(z0, z1) });
  // Collision centrée d'une empreinte tournée de ry.
  k.solidR = (x, z, sx, sz, h, ry = 0, y0 = 0) => {
    const c = Math.abs(Math.cos(ry));
    const s = Math.abs(Math.sin(ry));
    const ex = (sx * c + sz * s) / 2;
    const ez = (sx * s + sz * c) / 2;
    return k.solid(x - ex, z - ez, x + ex, z + ez, y0, y0 + h);
  };
  k.mesh = (geo, material, x, y, z, ry = 0, parent = group) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    return m;
  };
  // Boîte posée (y = bas) ; collide : ajoute la collision.
  k.box = (x, y, z, sx, sy, sz, material, collide = false, parent = group) => {
    const m = new THREE.Mesh(UNIT, material);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y + sy / 2, z);
    parent.add(m);
    if (collide) k.solid(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, y, y + sy);
    return m;
  };
  // Groupe d'accessoire positionné/tourné ; p.b(...) ajoute des boîtes dans son repère.
  k.prop = (x, z, ry = 0, y = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    group.add(g);
    g.b = (bx, by, bz, sx, sy, sz, material) => k.box(bx, by, bz, sx, sy, sz, material, false, g);
    g.m = (geo, material, bx, by, bz, rx = 0, ry2 = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(bx, by, bz);
      m.rotation.set(rx, ry2, rz);
      g.add(m);
      return m;
    };
    return g;
  };
  // Plan peint mural (face orientée selon ry ; ry=0 → face +z).
  k.decal = (geo, material, x, y, z, ry) => k.mesh(geo, material, x, y, z, ry);
  // Sol : plan horizontal avec UV en mètres / tile.
  k.floor = (x0, z0, x1, z1, material, tile = 2, y = 0.004) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
    const m = new THREE.Mesh(g, material);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    group.add(m);
    return m;
  };
  // Instances : liste de {x, y, z, ry, sx, sy, sz, color}.
  k.inst = (geo, material, list, dynamic = false) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, material, list.length);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach((p, i) => {
      d.position.set(p.x, p.y || 0, p.z);
      d.rotation.set(0, p.ry || 0, 0);
      d.scale.set(p.sx || 1, p.sy || 1, p.sz || 1);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      if (p.color) im.setColorAt(i, c.set(p.color));
    });
    if (list.some((p) => p.color) && !im.instanceColor) im.setColorAt(0, c.set('#fff'));
    im.computeBoundingSphere();
    if (dynamic) im.userData.dynamic = true;
    group.add(im);
    return im;
  };

  // Pièce : 4 peaux de murs (soubassement + frise + peinture) posées à
  // l'intérieur du rectangle, avec baies ouvertes (doors[côté] = [[centre, largeur]]).
  k.room = (x0, z0, x1, z1, o) => {
    const { wall, low, stripe, floorMat, tile = 2, doors = {}, frame = '#2b2050', lowH = 1.05 } = o;
    const wm = mat(wall);
    const lm = mat(low);
    const sm = mat(stripe);
    const fm = mat(frame);
    const sides = [
      // côté, axe le long, a0, a1, position de la peau, normale intérieure
      ['s', 'x', x0, x1, z0, 1],
      ['n', 'x', x0, x1, z1, -1],
      ['w', 'z', z0 + SKIN, z1 - SKIN, x0, 1],
      ['e', 'z', z0 + SKIN, z1 - SKIN, x1, -1],
    ];
    for (const [side, axis, a0, a1, p, nrm] of sides) {
      const gaps = (doors[side] || []).map(([c, w]) => [c - w / 2, c + w / 2]).sort((a, b) => a[0] - b[0]);
      // Segments pleins
      const segs = [];
      let a = a0;
      for (const [g0, g1] of gaps) {
        if (g0 > a) segs.push([a, g0]);
        a = Math.max(a, g1);
      }
      if (a < a1) segs.push([a, a1]);
      const inner = p + nrm * SKIN; // face intérieure
      const put = (s0, s1, y0, y1, depth, material, off = 0) => {
        const len = s1 - s0;
        const c = (s0 + s1) / 2;
        const dc = p + nrm * (depth / 2) + nrm * off;
        if (axis === 'x') k.box(c, y0, dc, len, y1 - y0, depth, material);
        else k.box(dc, y0, c, depth, y1 - y0, len, material);
      };
      const collide = (s0, s1, y0, y1) => {
        if (axis === 'x') k.solid(s0, p, s1, inner, y0, y1);
        else k.solid(p, s0, inner, s1, y0, y1);
      };
      for (const [s0, s1] of segs) {
        put(s0, s1, lowH + 0.15, H, SKIN, wm);
        put(s0, s1, 0, lowH, SKIN + 0.03, lm);
        put(s0, s1, lowH, lowH + 0.15, SKIN + 0.05, sm);
        collide(s0, s1, 0, H);
      }
      for (const [g0, g1] of gaps) {
        if (g1 - g0 < 7) {
          // Linteau + encadrement
          put(g0, g1, DOOR_H, H, SKIN, wm);
          collide(g0, g1, DOOR_H, H);
          // (l'encadrement est posé DANS la baie : pas de faces coplanaires)
          put(g0, g1, DOOR_H - 0.12, DOOR_H, SKIN + 0.04, fm);
          put(g0, g0 + 0.1, 0, DOOR_H - 0.12, SKIN + 0.04, fm);
          put(g1 - 0.1, g1, 0, DOOR_H - 0.12, SKIN + 0.04, fm);
          collide(g0, g0 + 0.1, 0, DOOR_H);
          collide(g1 - 0.1, g1, 0, DOOR_H);
        } else {
          // Grande ouverture : poutre basse sous plafond
          put(g0, g1, H - 0.45, H, SKIN, wm);
          collide(g0, g1, H - 0.45, H);
        }
      }
    }
    if (floorMat) k.floor(x0 + 0.01, z0 + 0.01, x1 - 0.01, z1 - 0.01, floorMat, tile);
  };

  // Plafond + coque extérieure + ceinture de collisions autour de la zone.
  k.shell = (x0, z0, x1, z1, ceilMat) => {
    k.floor(x0 - 1, z0 - 1, x1 + 1, z1 + 1, mat('#3a3050'), 4, -0.01);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), ceilMat);
    const uv = c.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / 2.4, (uv.getY(i) * (z1 - z0)) / 2.4);
    c.rotation.x = Math.PI / 2;
    c.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
    group.add(c);
    k.solid(x0 - 2, z0 - 2, x1 + 2, z1 + 2, H, H + 0.6); // dalle de plafond (caméra)
    const t = 1.5;
    k.solid(x0 - t, z0 - t, x1 + t, z0, 0, H + 0.6);
    k.solid(x0 - t, z1, x1 + t, z1 + t, 0, H + 0.6);
    k.solid(x0 - t, z0, x0, z1, 0, H + 0.6);
    k.solid(x1, z0, x1 + t, z1, 0, H + 0.6);
    // Coque sombre (jamais de vide visible, même en cas de clipping caméra)
    const sh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 3, H + 2, z1 - z0 + 3), mat('#241a3a', { side: THREE.BackSide }));
    sh.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    group.add(sh);
  };

  // Fenêtre murale : cadre épais + ciel émissif + croisillons.
  // n : normale intérieure (ry de la face), (x, z) sur la face intérieure du mur.
  k.window = (atlas, sky, x, z, ry, w, h, y0) => {
    const g = k.prop(x, z, ry);
    const frame = mat('#f7f3ea');
    g.b(0, y0 - 0.08, 0.04, w + 0.24, 0.12, 0.16, frame); // appui
    g.b(0, y0 + h, 0.03, w + 0.2, 0.1, 0.1, frame);
    g.b(-w / 2 - 0.05, y0, 0.03, 0.1, h, 0.1, frame);
    g.b(w / 2 + 0.05, y0, 0.03, 0.1, h, 0.1, frame);
    g.b(0, y0, 0.03, 0.06, h, 0.06, frame);
    g.b(0, y0 + h * 0.62, 0.03, w, 0.06, 0.06, frame);
    g.m(atlas.plane(sky, w, h), atlas.glowMat, 0, y0 + h / 2, 0.005);
    return g;
  };
  return k;
}

// Remplit une rangée de casiers le long d'un mur. Renvoie la liste d'instances.
function lockerRun(list, x0, x1, z, ry, color, startNo) {
  const w = 0.5;
  const n = Math.floor((x1 - x0) / w);
  const off = x0 + ((x1 - x0) - n * w) / 2 + w / 2;
  for (let i = 0; i < n; i++) list.push({ x: off + i * w, z, ry, color, no: startNo + i });
  return { n, x0: off - w / 2, x1: off - w / 2 + n * w };
}

// ===========================================================================
// LYCÉE VESPER-NORD
// ===========================================================================
function buildSchool(scene, col, quality) {
  const O = SCHOOL_ORIGIN;
  const group = new THREE.Group();
  group.name = 'interior-school';
  group.position.set(O.x, 0, O.z);
  group.visible = false;
  scene.add(group);
  const k = zoneKit(group, col, O.x, O.z);
  const rand = mulberry32(117);
  const atlas = new Atlas(2048, 2048, 1024);
  const updaters = [];
  const W = (x, z) => ({ x: O.x + x, z: O.z + z }); // local → monde

  // ---------- Textures de sol (lino) ----------
  const lino = (a, b, mode, seed) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const r = mulberry32(seed);
    x.fillStyle = a;
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (mode === 'checker' && (i + j) % 2) {
          x.fillStyle = b;
          x.fillRect(i * 64, j * 64, 64, 64);
        } else if (mode === 'speckle') {
          x.fillStyle = r() < 0.5 ? a : b;
          x.fillRect(i * 64, j * 64, 64, 64);
        }
      }
    }
    if (mode === 'carpet') {
      for (let i = 0; i < 1400; i++) {
        x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
        x.fillRect(r() * 256, r() * 256, 2, 2);
      }
    } else {
      for (let i = 0; i < 300; i++) {
        x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,30,60'},0.10)`;
        x.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 3);
      }
      x.strokeStyle = 'rgba(40,30,60,0.18)';
      x.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        x.beginPath();
        x.moveTo(i * 64, 0);
        x.lineTo(i * 64, 256);
        x.moveTo(0, i * 64);
        x.lineTo(256, i * 64);
        x.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return M({ map: t });
  };
  const floors = {
    hall: lino('#efe0c2', '#7b5cc6', 'checker', 1),
    corridor: lino('#e9dcc0', '#5aa6a0', 'checker', 2),
    classA: lino('#dfe7d4', '#cfd9c2', 'speckle', 3),
    classB: lino('#ecdccf', '#e0cbbb', 'speckle', 4),
    labo: lino('#cfd8e6', '#bccadc', 'speckle', 5),
    cafet: lino('#f4ecdc', '#e2733f', 'checker', 6),
    cdi: lino('#4f74c9', '#4f74c9', 'carpet', 7),
    stair: lino('#d8d2c4', '#c8c0b0', 'speckle', 8),
  };
  const ceilTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f1ea';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(80,70,100,0.25)';
    x.fillRect(0, 0, 128, 3);
    x.fillRect(0, 0, 3, 128);
    x.fillRect(0, 63, 128, 2);
    x.fillRect(63, 0, 2, 128);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return M({ map: t, side: THREE.DoubleSide });
  })();

  // ---------- Plan (coordonnées locales, mètres) ----------
  // Sud (z 0..12) : [vide] Salle 12 | Hall | Salle 14 [vide]
  // Couloir (z 12..18) de x -36 à 36
  // Nord (z 18..30) : Cafétéria | Labo | CDI | Escalier
  const CZ0 = 12;
  const CZ1 = 18;
  const R = {
    hall: [-8, 0, 8, 12],
    corridor: [-36, CZ0, 36, CZ1],
    salle12: [-22, 0, -8, 12],
    salle14: [8, 0, 22, 12],
    labo: [-8, CZ1, 8, 30],
    cafeteria: [-36, CZ1, -8, 30],
    cdi: [8, CZ1, 24, 30],
    stair: [24, CZ1, 36, 30],
  };
  const D12 = -9.6;
  const D14 = 9.6;
  const DW = 2.6; // largeur des baies (passage libre 2,4 m)
  const DCAF = -16;
  const DCDI = 11;
  k.room(...R.hall, { wall: '#f6e2c0', low: '#7b4ad6', stripe: '#ffcd20', floorMat: floors.hall, tile: 2, doors: { n: [[0, 6.2]] } });
  k.room(...R.corridor, {
    wall: '#f3e6c8', low: '#3f8f8a', stripe: '#f2b84b', floorMat: floors.corridor, tile: 2,
    doors: { s: [[0, 6.2], [D12, DW], [D14, DW]], n: [[DCAF, 3.8], [0, 2.8], [DCDI, DW], [30, 10]] },
  });
  k.room(...R.salle12, { wall: '#d9ecd9', low: '#4f9a6a', stripe: '#ff8a5a', floorMat: floors.classA, doors: { n: [[D12, DW]] } });
  k.room(...R.salle14, { wall: '#f6dbe8', low: '#b0507a', stripe: '#5fb7c9', floorMat: floors.classB, doors: { n: [[D14, DW]] } });
  k.room(...R.labo, { wall: '#dbe6f3', low: '#3d5f9a', stripe: '#ffd54f', floorMat: floors.labo, doors: { s: [[0, 2.8]] } });
  k.room(...R.cafeteria, { wall: '#ffe7b8', low: '#e2733f', stripe: '#6fcf97', floorMat: floors.cafet, tile: 2, doors: { s: [[DCAF, 3.8]] } });
  k.room(...R.cdi, { wall: '#efe2cf', low: '#8a5a3a', stripe: '#8f7ad8', floorMat: floors.cdi, tile: 3, doors: { s: [[DCDI, DW]] } });
  k.room(...R.stair, { wall: '#f3e6c8', low: '#3f8f8a', stripe: '#f2b84b', floorMat: floors.stair, doors: { s: [[30, 10]] } });
  // Volumes inaccessibles (derrière les fausses portes) : pleins.
  k.solid(-36, 0, -22, 12);
  k.solid(22, 0, 36, 12);
  k.shell(-36, 0, 36, 30, ceilTex);

  const BOUNDS = [O.x - 36, O.z + 0, O.x + 36, O.z + 30];

  // ---------- Matériaux du mobilier ----------
  const wood = mat('#e0b077');
  const woodDark = mat('#a8693f');
  const metal = mat('#3a2f6b');
  const steel = mat('#b9c0d6');
  const white = mat('#f7f3ea');
  const black = mat('#2b2b3a');
  const glass = M({ color: '#dff4ff', transparent: true, opacity: 0.06, depthWrite: false });
  const gold = mat('#ffcd20', { emissive: '#7a5200', emissiveIntensity: 0.3 });

  // Plafonniers : tubes fluorescents (instanciés).
  const tubeList = [];
  const tubeGrid = (x0, z0, x1, z1, nx, nz, ry = 0) => {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) tubeList.push({ x: x0 + ((i + 0.5) * (x1 - x0)) / nx, y: H - 0.07, z: z0 + ((j + 0.5) * (z1 - z0)) / nz, ry });
    }
  };
  tubeGrid(-7, 1, 7, 11, 3, 3);
  tubeGrid(-34, CZ0 + 1, 34, CZ1 - 1, 12, 1, Math.PI / 2);
  tubeGrid(-21, 1, -9, 11, 3, 3);
  tubeGrid(9, 1, 21, 11, 3, 3);
  tubeGrid(-7, CZ1 + 1, 7, 29, 3, 3);
  tubeGrid(-35, CZ1 + 1, -9, 29, 5, 3);
  tubeGrid(9, CZ1 + 1, 23, 29, 3, 3);
  tubeGrid(25, CZ1 + 1, 35, 22, 2, 1);
  // Un tube du couloir clignote (petit frisson) : maillage séparé.
  const flickIdx = 9;
  const flick = tubeList.splice(flickIdx, 1)[0];
  const tubeGeo = proto([
    [0, 0, 0, 1.36, 0.06, 0.34, '#d8d4e8'],
    [0, -0.05, 0, 1.24, 0.06, 0.24, '#ffffff'],
  ]);
  const tubeMat = M({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 1.25 });
  tubeMat.vertexColors = true;
  k.inst(tubeGeo, tubeMat, tubeList);
  const flickMat = M({ color: '#ffffff', emissive: '#e8f4ff', emissiveIntensity: 1.25 });
  flickMat.vertexColors = true;
  const flickMesh = k.mesh(tubeGeo, flickMat, flick.x, flick.y, flick.z, flick.ry);
  flickMesh.userData.dynamic = true;
  updaters.push((dt, t) => {
    const p = (t * 1.7) % 7;
    flickMat.emissiveIntensity = p > 6 ? (Math.sin(t * 60) > 0 ? 1.25 : 0.05) : p > 5.6 && p < 5.75 ? 0.1 : 1.25;
  });

  // ---------- Fenêtres (jour) ----------
  const day = [skyImage(atlas, false, 1), skyImage(atlas, false, 2), skyImage(atlas, false, 3)];
  for (const x of [-19, -15, -11]) k.window(atlas, day[Math.abs(x) % 3], x, 0.24, 0, 2.6, 1.9, 1.15);
  for (const x of [11, 15, 19]) k.window(atlas, day[x % 3], x, 0.24, 0, 2.6, 1.9, 1.15);
  for (const x of [-5.4, 5.4]) k.window(atlas, day[0], x, 0.24, 0, 2.4, 1.8, 1.1);
  k.window(atlas, day[1], -35.76, 15, Math.PI / 2, 3.2, 2.0, 1.1);
  k.window(atlas, day[2], 35.76, 15, -Math.PI / 2, 3.2, 2.0, 1.1);
  for (const x of [-6, 6]) k.window(atlas, day[x > 0 ? 1 : 2], x, 29.76, Math.PI, 2.2, 1.9, 1.15);
  for (const x of [-31, -21, -14]) k.window(atlas, day[Math.abs(x) % 3], x, 29.76, Math.PI, 2.4, 1.0, 2.45);
  for (const x of [14, 19]) k.window(atlas, day[x % 3], x, 29.76, Math.PI, 2.2, 1.0, 2.5);

  // ---------- HALL ----------
  // Portes vitrées (sortie) : double porte fermée, lumière du jour derrière.
  {
    const g = k.prop(0, 0.2, 0);
    const fr = mat('#3a2f6b');
    g.b(0, 0, 0.06, 3.6, 0.1, 0.12, fr);
    g.b(0, 2.7, 0.06, 3.6, 0.16, 0.12, fr);
    for (const sx of [-1.75, 0, 1.75]) g.b(sx, 0, 0.06, 0.12, 2.7, 0.12, fr);
    g.m(atlas.plane(day[1], 3.4, 2.6), atlas.glowMat, 0, 1.35, 0.01);
    for (const sx of [-0.8, 0.8]) {
      g.b(sx, 1.0, 0.16, 1.2, 0.08, 0.08, steel); // barres anti-panique
    }
    const sortie = plaque(atlas, 'SORTIE', '#ffffff', '#1f9a4a', 256, 96);
    g.m(atlas.plane(sortie, 0.9, 0.34), atlas.glowMat, 0, 3.15, 0.04);
    k.box(0, 0, 0.9, 2.6, 0.02, 1.2, mat('#5a3d7a')); // paillasson
  }
  // Accueil : comptoir arrondi + écran + plante, grande enseigne derrière.
  {
    const desk = k.prop(-5.6, 6, Math.PI / 2);
    desk.m(rb(4.2, 1.1, 0.8, 0.12), mat('#7b4ad6'), 0, 0.55, 0);
    desk.m(rb(4.4, 0.08, 1.0, 0.04), wood, 0, 1.14, 0);
    desk.b(0, 0.5, -0.41, 3.6, 0.12, 0.02, mat('#ffcd20'));
    desk.b(-1.2, 1.18, 0.15, 0.55, 0.38, 0.06, black);
    k.solidR(-5.6, 6, 4.4, 1.0, 1.2, Math.PI / 2);
    const crest = atlas.draw(896, 280, (x, w, h) => {
      x.scale(896 / 1024, 280 / 320);
      w = 1024;
      h = 320;
      x.fillStyle = '#2b2050';
      rr(x, 0, 0, w, h, 40);
      x.fill();
      // Blason : écu violet, étoile et croissant de lune
      x.fillStyle = '#ffcd20';
      x.beginPath();
      x.moveTo(60, 50);
      x.lineTo(250, 50);
      x.lineTo(250, 170);
      x.quadraticCurveTo(250, 260, 155, 290);
      x.quadraticCurveTo(60, 260, 60, 170);
      x.closePath();
      x.fill();
      x.fillStyle = '#7b4ad6';
      x.beginPath();
      x.moveTo(78, 68);
      x.lineTo(232, 68);
      x.lineTo(232, 168);
      x.quadraticCurveTo(232, 245, 155, 270);
      x.quadraticCurveTo(78, 245, 78, 168);
      x.closePath();
      x.fill();
      x.fillStyle = '#fff4d6';
      x.beginPath();
      x.arc(140, 150, 48, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#7b4ad6';
      x.beginPath();
      x.arc(162, 136, 42, 0, Math.PI * 2);
      x.fill();
      star(x, 180, 175, 24, '#ffcd20');
      text(x, 'LYCÉE VESPER-NORD', 640, 130, 92, '#ffffff', { maxW: 700, stroke: '#120a2a', lw: 14 });
      text(x, '« Lumen in tenebris » — depuis 1931', 640, 225, 40, '#ffcd20', { maxW: 680, font: '"Nunito", Arial, sans-serif' });
    });
    k.decal(atlas.plane(crest, 6.4, 2.0), atlas.mat, -7.76, 2.5, 6, Math.PI / 2);
    // Chaise de l'accueil
    const ch = k.prop(-6.9, 5.2, Math.PI / 2);
    ch.b(0, 0.0, 0, 0.08, 0.45, 0.08, metal);
    ch.m(rb(0.5, 0.1, 0.5), mat('#2b2050'), 0, 0.5, 0);
    ch.m(rb(0.5, 0.55, 0.08), mat('#2b2050'), 0, 0.82, -0.24);
  }
  // Vitrine à trophées (mur est).
  {
    const tc = k.prop(7.45, 8.6, -Math.PI / 2);
    tc.b(0, 0, 0, 2.6, 0.7, 0.6, woodDark);
    tc.b(0, 2.25, 0, 2.6, 0.15, 0.6, woodDark);
    tc.b(-1.27, 0.7, 0, 0.06, 1.55, 0.6, woodDark);
    tc.b(1.27, 0.7, 0, 0.06, 1.55, 0.6, woodDark);
    tc.b(0, 0.7, -0.27, 2.5, 1.55, 0.04, mat('#5a2f6a'));
    tc.b(0, 1.45, 0, 2.5, 0.04, 0.55, glass);
    tc.b(0, 0.7, 0.29, 2.5, 1.55, 0.02, glass);
    const cup = new THREE.CylinderGeometry(0.13, 0.05, 0.22, 10);
    const stem = new THREE.CylinderGeometry(0.03, 0.08, 0.16, 8);
    for (const [px, py, sc] of [[-0.8, 0.74, 1.3], [0, 0.74, 1.6], [0.8, 0.74, 1.1], [-0.5, 1.49, 1], [0.5, 1.49, 1.2]]) {
      tc.m(stem, gold, px, py + 0.08 * sc, 0).scale.setScalar(sc);
      tc.m(cup, gold, px, py + 0.27 * sc, 0).scale.setScalar(sc);
    }
    const tp = plaque(atlas, 'NOS CHAMPIONS', '#ffcd20', '#2b2050', 384, 96);
    tc.m(atlas.plane(tp, 1.6, 0.4), atlas.mat, 0, 2.62, 0.05);
    k.solidR(7.45, 8.6, 2.6, 0.6, 2.4, Math.PI / 2);
  }
  // Tableau d'affichage (liège + affiches colorées).
  {
    const board = atlas.draw(896, 490, (x, w, h) => {
      x.scale(896 / 1024, 490 / 560);
      w = 1024;
      h = 560;
      x.fillStyle = '#c98a4a';
      x.fillRect(0, 0, w, h);
      const r2 = mulberry32(5);
      for (let i = 0; i < 900; i++) {
        x.fillStyle = r2() < 0.5 ? 'rgba(90,50,20,0.25)' : 'rgba(255,220,160,0.2)';
        x.fillRect(r2() * w, r2() * h, 3, 3);
      }
      x.strokeStyle = '#6a3d1f';
      x.lineWidth = 22;
      x.strokeRect(0, 0, w, h);
      const notes = [
        ["Club d'astronomie", 'Mardi 18h — Toit du bât. B', '#1d2a6b', '#ffe27a'],
        ["Bal de fin d'année", 'Samedi 21 juin — Gymnase', '#e98ccf', '#ffffff'],
        ['Ne courez pas dans les couloirs !', 'La direction', '#ffcd20', '#1d1640'],
        ['Atelier robotique', 'Inscriptions au CDI', '#5fb7c9', '#ffffff'],
        ['Objets trouvés', 'Voir la vie scolaire', '#f2efe6', '#2b2050'],
        ['Couvre-feu : 22h', 'Mairie de Vesper', '#3a1a6e', '#ffcd20'],
      ];
      notes.forEach(([t, s, bg, fg], i) => {
        const px = 40 + (i % 3) * 320 + r2() * 20;
        const py = 40 + Math.floor(i / 3) * 250 + r2() * 20;
        x.save();
        x.translate(px + 130, py + 100);
        x.rotate((r2() - 0.5) * 0.12);
        x.fillStyle = 'rgba(0,0,0,0.25)';
        x.fillRect(-122, -92, 260, 200);
        x.fillStyle = bg;
        x.fillRect(-130, -100, 260, 200);
        text(x, t, 0, -25, 34, fg, { maxW: 230 });
        text(x, s, 0, 40, 22, fg, { maxW: 230, font: '"Nunito", Arial, sans-serif' });
        x.fillStyle = ['#e8343a', '#3d8fd1', '#6fcf97'][i % 3];
        x.beginPath();
        x.arc(0, -86, 10, 0, Math.PI * 2);
        x.fill();
        x.restore();
      });
    });
    k.box(7.74, 0.95, 3.6, 0.08, 1.6, 3.0, woodDark);
    k.decal(atlas.plane(board, 2.85, 1.5), atlas.mat, 7.69, 1.75, 3.6, -Math.PI / 2);
  }
  // Bancs + plantes du hall
  const pot = mat('#e2733f');
  const leaf = mat('#3cc29a');
  const leaf2 = mat('#2fa88a');
  const plant = (x, z, s = 1) => {
    const p = k.prop(x, z, rand() * 6);
    p.m(new THREE.CylinderGeometry(0.28 * s, 0.22 * s, 0.5 * s, 10), pot, 0, 0.25 * s, 0);
    for (const [lx, ly, lz, r] of [[0, 0.95, 0, 0.42], [0.22, 0.75, 0.1, 0.3], [-0.2, 0.8, -0.1, 0.32], [0.05, 1.25, 0.05, 0.28]]) {
      p.m(new THREE.IcosahedronGeometry(r * s, 0), r > 0.35 ? leaf : leaf2, lx * s, ly * s, lz * s);
    }
    k.solidR(x, z, 0.6 * s, 0.6 * s, 1.2 * s);
  };
  plant(-7.2, 0.9);
  plant(7.2, 0.9);
  plant(-7.2, 11.1, 0.9);
  plant(7.2, 11.1, 0.9);
  const bench = (x, z, ry, len = 2.0) => {
    const b = k.prop(x, z, ry);
    b.m(rb(len, 0.1, 0.45, 0.04), wood, 0, 0.45, 0);
    b.b(-len / 2 + 0.15, 0, 0, 0.08, 0.4, 0.4, metal);
    b.b(len / 2 - 0.15, 0, 0, 0.08, 0.4, 0.4, metal);
    k.solidR(x, z, len, 0.45, 0.5, ry);
  };
  bench(7.25, 3.6, -Math.PI / 2, 2.2);
  bench(-5.4, 0.55, 0, 2.2);
  bench(5.4, 0.55, 0, 2.2);
  // Emblème au sol (disques superposés) au centre du hall
  {
    const disc = (r, c, y) => k.mesh(new THREE.CylinderGeometry(r, r, 0.004, 40), mat(c), 0, y, 6.5);
    disc(1.9, '#2b2050', 0.006);
    disc(1.75, '#ffcd20', 0.008);
    disc(1.55, '#7b4ad6', 0.01);
    const st = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 ? 0.45 : 1.1;
      st[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, Math.cos(a) * r);
    }
    const sm = k.mesh(new THREE.ShapeGeometry(st), mat('#ffcd20'), 0, 0.014, 6.5);
    sm.rotation.x = -Math.PI / 2;
  }
  // Banderole de bienvenue au-dessus de l'ouverture vers le couloir
  {
    const ban = plaque(atlas, 'Bienvenue au lycée Vesper-Nord !', '#ffcd20', '#7b4ad6', 1024, 128);
    k.decal(atlas.plane(ban, 5.6, 0.7), atlas.mat, 0, 3.2, 12 - SKIN - 0.02, Math.PI);
  }
  // Fanions aux couleurs du lycée
  {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.36, 0, 0.18, 0, 0, -0.18, 0, 0, 0, -0.36, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0, 1, 1, 0, 1, 0.5, 0], 2));
    tri.computeVertexNormals();
    const cols = ['#7b4ad6', '#ffcd20', '#f7f3ea'];
    for (const z of [3.2, 8.8]) {
      for (let i = 0; i < 20; i++) {
        const x = -7.4 + i * 0.78;
        const sag = Math.sin((i / 19) * Math.PI) * 0.35;
        k.mesh(tri, mat(cols[i % 3]), x, 3.65 - sag, z);
      }
      k.box(0, 3.645 - 0.18, z, 15.6, 0.015, 0.015, mat('#2b2050'));
    }
  }
  // Borne d'information (écran)
  {
    const info = atlas.draw(256, 400, (x, w, h) => {
      x.fillStyle = '#1d2a6b';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#7b4ad6';
      x.fillRect(0, 0, w, 60);
      text(x, 'INFOS DU JOUR', w / 2, 32, 30, '#ffcd20');
      const lines = ['8h00 : Physique', 'Labo — prés. du', 'fragment Aegis', '', 'Sortie au musée', 'Halden : REPORTÉE', '', 'Cantine : lasagnes'];
      lines.forEach((l, i) => text(x, l, w / 2, 100 + i * 38, 24, i === 5 ? '#ff8a8a' : '#ffffff', { maxW: w - 20, font: '"Nunito", Arial, sans-serif' }));
    });
    const tk = k.prop(5.9, 10.7, -Math.PI / 2 - 0.4);
    tk.m(rb(0.75, 1.9, 0.3, 0.08), mat('#2b2050'), 0, 0.95, 0);
    tk.m(atlas.plane(info, 0.6, 0.94), atlas.softMat, 0, 1.25, 0.155);
    k.solidR(5.9, 10.7, 0.8, 0.8, 1.9);
  }
  // Porte-parapluies + présentoir à brochures près de l'entrée
  {
    const u = k.prop(2.6, 0.55);
    u.m(new THREE.CylinderGeometry(0.2, 0.18, 0.55, 10), mat('#3d8fd1'), 0, 0.27, 0);
    for (const [i, c] of ['#e8343a', '#ffcd20', '#2b2050'].entries()) u.m(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5), mat(c), -0.06 + i * 0.06, 0.6, 0.02 * i, 0.15 * (i - 1), 0, 0.1);
    k.solidR(2.6, 0.55, 0.45, 0.45, 0.9);
  }

  // ---------- COULOIR ----------
  // Casiers : rangées le long des murs ; numérotés à partir de 101.
  const lockers = [];
  const lockColors = ['#e86f6f', '#5fb7c9', '#f2b84b', '#8f7ad8', '#6fcf97', '#4f74c9'];
  const zS = CZ0 + SKIN + 0.23; // face sud du couloir (casiers tournés vers +z)
  const zN = CZ1 - SKIN - 0.23;
  let no = 101;
  const runs = [];
  const run = (x0, x1, side, color) => {
    const r = lockerRun(lockers, x0, x1, side === 's' ? zS : zN, side === 's' ? 0 : Math.PI, color, no);
    no += r.n;
    runs.push({ ...r, side });
    k.solid(r.x0, side === 's' ? CZ0 : zN - 0.23, r.x1, side === 's' ? zS + 0.23 : CZ1, 0, 1.95);
  };
  run(-21.2, -11.2, 's', lockColors[2]); // 101-120 → 117 ici
  run(-7.6, -3.4, 's', lockColors[1]);
  run(3.4, 7.6, 's', lockColors[0]);
  run(11.2, 21.2, 's', lockColors[3]);
  run(-35.4, -30.4, 's', lockColors[4]);
  run(-27.6, -22.4, 's', lockColors[5]);
  run(22.4, 27.6, 's', lockColors[4]);
  run(30.4, 35.4, 's', lockColors[2]);
  run(-35.2, -24.4, 'n', lockColors[0]);
  run(-10.2, -3.4, 'n', lockColors[5]);
  run(15.2, 23.6, 'n', lockColors[1]);
  const lockerGeo = proto([
    [0, 0.08, 0, 0.48, 1.8, 0.44, '#ffffff'],
    [0, 0, 0, 0.48, 0.08, 0.42, '#3a2f6b'],
    [0.15, 0.95, 0.225, 0.04, 0.16, 0.03, '#d8d8e8'],
    [-0.08, 1.62, 0.225, 0.26, 0.025, 0.02, '#3a2f6b'],
    [-0.08, 1.56, 0.225, 0.26, 0.025, 0.02, '#3a2f6b'],
    [-0.08, 1.5, 0.225, 0.26, 0.025, 0.02, '#3a2f6b'],
    [-0.08, 0.35, 0.225, 0.26, 0.025, 0.02, '#3a2f6b'],
    [-0.08, 0.29, 0.225, 0.26, 0.025, 0.02, '#3a2f6b'],
    [-0.235, 0.08, 0.225, 0.012, 1.8, 0.012, '#3a2f6b'],
  ]);
  const lk = lockers.map((l, i) => {
    const c = new THREE.Color(l.color).offsetHSL(0, 0, ((i * 7) % 5) * 0.012 - 0.02);
    return { ...l, color: '#' + c.getHexString() };
  });
  k.inst(lockerGeo, vertexMat(), lk);
  // Casier de Noa (n° 117) : autocollant étoile + numéro.
  const noaL = lockers.find((l) => l.no === 117);
  {
    const sticker = atlas.draw(128, 160, (x, w, h) => {
      x.fillStyle = '#1d1640';
      rr(x, 4, 4, w - 8, 56, 12);
      x.fill();
      text(x, '117', w / 2, 34, 40, '#ffffff');
      star(x, w / 2, 112, 42, '#ffe27a');
      text(x, 'N', w / 2, 116, 34, '#e8343a');
    });
    k.decal(atlas.plane(sticker, 0.22, 0.28), atlas.mat, noaL.x - 0.08, 1.15, noaL.z + 0.236, 0);
  }
  // Numéros sur quelques casiers (atlas commun)
  const lockerNo = {};
  for (const l of lockers) {
    if (l.no === 117 || l.no % 3) continue;
    const key = String(l.no);
    lockerNo[key] = lockerNo[key] || atlas.draw(64, 32, (x, w, h) => {
      x.fillStyle = '#f7f3ea';
      x.fillRect(0, 0, w, h);
      text(x, key, w / 2, h / 2 + 1, 24, '#1d1640');
    });
    const fwd = l.ry === 0 ? 1 : -1;
    k.decal(atlas.plane(lockerNo[key], 0.14, 0.07), atlas.mat, l.x - 0.08 * fwd, 1.74, l.z + 0.236 * fwd, l.ry);
  }

  // Distributeur(s) automatique(s)
  let vendScreen = null;
  const vending = (x, z, ry, body, label) => {
    const v = k.prop(x, z, ry);
    v.m(rb(1.0, 1.95, 0.8, 0.06), mat(body), 0, 0.975, 0);
    const sc = vendScreen || (vendScreen = atlas.draw(160, 256, (c, w, h) => {
      c.fillStyle = '#1d1640';
      c.fillRect(0, 0, w, h);
      for (let r = 0; r < 5; r++) {
        for (let q = 0; q < 4; q++) {
          c.fillStyle = ['#e86f6f', '#ffcd20', '#6fcf97', '#5fb7c9', '#e98ccf'][(r + q * 2) % 5];
          rr(c, 10 + q * 36, 12 + r * 46, 28, 34, 6);
          c.fill();
        }
      }
    }));
    v.m(atlas.plane(sc, 0.62, 1.1), atlas.glowMat, -0.1, 1.25, 0.41);
    const lab = plaque(atlas, label, '#ffffff', body === '#e8343a' ? '#a01a2a' : '#1d4a8a', 256, 64);
    v.m(atlas.plane(lab, 0.8, 0.2), atlas.mat, 0, 1.98 - 0.15, 0.41);
    v.b(0.33, 0.95, 0.4, 0.16, 0.5, 0.04, black);
    v.b(-0.1, 0.25, 0.4, 0.6, 0.22, 0.04, black);
    k.solidR(x, z, 1.0, 0.8, 1.95, ry);
  };
  vending(-22.3, CZ1 - SKIN - 0.42, Math.PI, '#e8343a', 'SNACKS');
  vending(-21.1, CZ1 - SKIN - 0.42, Math.PI, '#3d8fd1', 'BOISSONS');
  // Fontaine à eau
  {
    const f = k.prop(-12, CZ1 - SKIN - 0.25, Math.PI);
    f.m(rb(0.55, 0.85, 0.45, 0.06), steel, 0, 0.42, 0);
    f.m(rb(0.6, 0.12, 0.5, 0.05), white, 0, 0.9, 0);
    f.m(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), metal, 0, 1.0, 0.1);
    k.solidR(-12, CZ1 - SKIN - 0.25, 0.6, 0.5, 1.0, Math.PI);
  }
  // Bancs du couloir
  bench(5.5, CZ1 - SKIN - 0.3, Math.PI, 2.6);
  bench(14.0, CZ1 - SKIN - 0.3, Math.PI, 2.2);
  // Horloge murale (aiguilles animées) au-dessus de la porte du labo.
  const clock = { hh: null, mm: null };
  {
    const cz = CZ1 - SKIN - 0.03;
    const face = k.mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 24), white, -2.4, 2.95, cz);
    face.rotation.x = Math.PI / 2;
    const rim = k.mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 24), metal, -2.4, 2.95, cz - 0.02);
    void rim;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.box(-2.4 + Math.sin(a) * 0.27, 2.95 + Math.cos(a) * 0.27 - 0.02, cz - 0.04, 0.03, 0.04, 0.01, black);
    }
    const mk = (len, w) => {
      const g = new THREE.BoxGeometry(w, len, 0.015);
      g.translate(0, len / 2 - 0.03, 0);
      const m = k.mesh(g, black, -2.4, 2.95, cz - 0.06 - (len > 0.2 ? 0.01 : 0), Math.PI);
      m.userData.dynamic = true;
      return m;
    };
    clock.hh = mk(0.18, 0.04);
    clock.mm = mk(0.27, 0.025);
    updaters.push((dt, t) => {
      const minutes = 8 * 60 + 12 + t / 60; // 8h12 au départ, temps réel
      clock.mm.rotation.z = -((minutes % 60) / 60) * Math.PI * 2;
      clock.hh.rotation.z = -(((minutes / 60) % 12) / 12) * Math.PI * 2;
    });
  }
  // Fausses portes (Infirmerie, Salle des profs) côté sud.
  const fakeDoor = (x, z, ry, label, color) => {
    const d = k.prop(x, z, ry);
    d.b(0, 0, 0.02, 1.3, 2.3, 0.06, mat(color));
    d.b(0, 0, 0.0, 1.5, 2.42, 0.03, mat('#2b2050'));
    d.b(0.45, 1.0, 0.08, 0.14, 0.05, 0.06, steel);
    d.b(0, 1.35, 0.055, 0.6, 0.5, 0.01, mat('#bfe8ff'));
    const p = plaque(atlas, label, '#ffffff', '#2b2050', 384, 96);
    d.m(atlas.plane(p, 1.2, 0.3), atlas.mat, 0, 2.62, 0.05);
  };
  fakeDoor(-29, CZ0 + SKIN, 0, 'Infirmerie', '#e86f6f');
  fakeDoor(29, CZ0 + SKIN, 0, 'Salle des profs', '#8f7ad8');
  // Plaques au-dessus des portes (côté couloir)
  const doorSign = (label, x, z, ry, color = '#ffffff', bg = '#2b2050') => {
    const p = plaque(atlas, label, color, bg, 384, 96);
    k.decal(atlas.plane(p, 1.5, 0.38), atlas.mat, x, 3.0, z, ry);
  };
  doorSign('Salle 12', D12, CZ0 + SKIN + 0.07, 0, '#ffffff', '#4f9a6a');
  doorSign('Salle 14', D14, CZ0 + SKIN + 0.07, 0, '#ffffff', '#b0507a');
  doorSign('Labo de physique', 0, CZ1 - SKIN - 0.07, Math.PI, '#ffd54f', '#3d5f9a');
  doorSign('Cafétéria', DCAF, CZ1 - SKIN - 0.07, Math.PI, '#ffffff', '#e2733f');
  doorSign('CDI', DCDI, CZ1 - SKIN - 0.07, Math.PI, '#ffffff', '#8a5a3a');
  // Affiches du couloir
  const posters = [
    { bg: '#1d2a6b', title: "Club d'astronomie", sub: 'Mardi 18h · Toit du bât. B', art: 'stars' },
    { bg: '#e98ccf', title: "Bal de fin d'année", sub: 'Samedi 21 juin · Gymnase', art: 'heart', accent: '#ff4f7a' },
    { bg: '#ffcd20', fg: '#1d1640', ink: '#1d1640', title: 'Ne courez pas !', sub: 'dans les couloirs — merci', art: 'runner' },
    { bg: '#5fb7c9', title: 'Atelier robotique', sub: 'Inscriptions au CDI', art: 'gear', accent: '#fff4d6' },
    { bg: '#6fcf97', title: 'Tournoi de foot', sub: 'Vendredi 16h · Stade', art: 'ball' },
    { bg: '#3a1a6e', title: 'Couvre-feu 22h', sub: 'Arrêté municipal de Vesper', art: 'moon', accent: '#ffcd20' },
    { bg: '#f2efe6', fg: '#2b2050', ink: '#2b2050', title: 'Avez-vous vu Théo ?', sub: 'Disparu depuis le 2 octobre', art: 'missing' },
    { bg: '#3d8fd1', title: 'AEGIS recrute', sub: 'Stages d\'été · Bâtir demain', art: 'aegis', accent: '#bfe8ff' },
    { bg: '#ff8a5a', title: 'Élections délégués', sub: 'Votez jeudi !', art: 'vote', accent: '#ffe27a' },
    { bg: '#8f7ad8', title: 'Chorale Vesper', sub: 'Répétition mercredi 13h', art: 'note' },
  ].map((p) => poster(atlas, p));
  const zWS = CZ0 + SKIN + 0.012;
  const zWN = CZ1 - SKIN - 0.012;
  const postAt = (i, x, z, ry, y = 2.55, s = 1) => k.decal(atlas.plane(posters[i % posters.length], 0.7 * s, 0.98 * s), atlas.mat, x, y, z, ry);
  postAt(0, -14.3, zWS, 0, 2.6);
  postAt(1, -16.5, zWS, 0, 2.6);
  postAt(6, -19.5, zWS, 0, 2.6);
  postAt(2, -5.5, zWS, 0, 2.6);
  postAt(3, 5.5, zWS, 0, 2.6);
  postAt(4, 14.5, zWS, 0, 2.6);
  postAt(7, 18.5, zWS, 0, 2.6);
  postAt(5, -30, zWN, Math.PI, 2.6);
  postAt(8, 4.4, CZ1 - SKIN - 0.02, Math.PI, 1.9);
  postAt(9, 6.6, CZ1 - SKIN - 0.02, Math.PI, 1.9);
  postAt(2, -6.6, zWN, Math.PI, 2.6);
  postAt(1, 19.4, zWN, Math.PI, 2.6);
  postAt(6, 33, zWS, 0, 2.6);
  // Poubelles
  for (const [x, z] of [[-3.0, CZ1 - SKIN - 0.3], [8.0, CZ0 + SKIN + 0.3], [-23.4, CZ1 - SKIN - 0.3]]) {
    const p = k.prop(x, z);
    p.m(new THREE.CylinderGeometry(0.24, 0.2, 0.7, 10), mat('#6fcf97'), 0, 0.35, 0);
    k.solidR(x, z, 0.5, 0.5, 0.7);
  }

  // ---------- Escalier condamné ----------
  {
    const stepM = mat('#c8c0b0');
    const noseM = mat('#ffcd20');
    for (let i = 0; i < 17; i++) {
      k.box(30, 0, 21.4 + i * 0.48 + 0.24, 5, 0.2 * (i + 1), 0.48, stepM);
      k.box(30, 0.2 * (i + 1) - 0.03, 21.4 + i * 0.48 + 0.05, 5, 0.04, 0.1, noseM);
    }
    k.box(27.4, 0, 25.5, 0.2, 3.8, 8.6, mat('#3f8f8a'));
    k.box(32.6, 0, 25.5, 0.2, 3.8, 8.6, mat('#3f8f8a'));
    // Rubalise + barrières + bâche
    const bar = mat('#f2efe6');
    const red = mat('#e8343a');
    for (const x of [25.6, 28.3, 31, 33.7]) {
      const b = k.prop(x, 20.4);
      b.m(rb(2.4, 0.5, 0.5, 0.12), bar, 0, 0.25, 0);
      b.m(rb(2.3, 0.4, 0.25, 0.08), bar, 0, 0.8, 0);
      for (const s of [-0.7, 0, 0.7]) b.b(s, 0.6, 0, 0.3, 0.42, 0.27, red);
    }
    k.solid(24.2, 20.1, 35.8, 20.7, 0, H); // impossible de passer
    k.box(30, 0.5, 21.3, 5.2, 3.2, 0.03, M({ color: '#e6eef8', transparent: true, opacity: 0.55, depthWrite: false }));
    const ferm = plaque(atlas, 'Étage fermé — travaux', '#1d1640', '#ffcd20', 640, 128);
    const sp = k.prop(30, 20.05, Math.PI);
    sp.m(atlas.plane(ferm, 2.6, 0.52), atlas.mat, 0, 1.55, 0.05);
    sp.b(-1.35, 0, 0, 0.08, 1.85, 0.08, metal);
    sp.b(1.35, 0, 0, 0.08, 1.85, 0.08, metal);
    // Cônes de chantier
    const cone = new THREE.ConeGeometry(0.2, 0.55, 10);
    for (const x of [25, 35]) k.mesh(cone, mat('#ff8a3d'), x, 0.28, 19.4);
  }

  // ---------- CLASSES (Salle 12, Salle 14) ----------
  const deskGeo = proto([
    [0, 0.7, 0, 0.78, 0.045, 0.56, '#e0b077'],
    [-0.35, 0, -0.24, 0.04, 0.7, 0.04, '#3a2f6b'],
    [0.35, 0, -0.24, 0.04, 0.7, 0.04, '#3a2f6b'],
    [-0.35, 0, 0.24, 0.04, 0.7, 0.04, '#3a2f6b'],
    [0.35, 0, 0.24, 0.04, 0.7, 0.04, '#3a2f6b'],
    [0, 0.4, 0.25, 0.72, 0.28, 0.02, '#3a2f6b'],
    [0, 0.55, 0.02, 0.7, 0.03, 0.42, '#3a2f6b'],
  ]);
  const chairGeo = proto([
    [0, 0.42, 0, 0.44, 0.045, 0.42, '#ffffff'],
    [0, 0.58, -0.2, 0.44, 0.34, 0.04, '#ffffff'],
    [-0.19, 0, -0.18, 0.035, 0.42, 0.035, '#3a2f6b'],
    [0.19, 0, -0.18, 0.035, 0.42, 0.035, '#3a2f6b'],
    [-0.19, 0, 0.18, 0.035, 0.42, 0.035, '#3a2f6b'],
    [0.19, 0, 0.18, 0.035, 0.42, 0.035, '#3a2f6b'],
    [-0.19, 0.42, -0.2, 0.035, 0.2, 0.035, '#3a2f6b'],
    [0.19, 0.42, -0.2, 0.035, 0.2, 0.035, '#3a2f6b'],
  ]);
  const desks = [];
  const chairs = [];
  const rot = (lx, lz, ry) => [lx * Math.cos(ry) + lz * Math.sin(ry), -lx * Math.sin(ry) + lz * Math.cos(ry)];
  // Classe : élèves tournés vers yaw ; rangées le long de l'axe x.
  const classroom = (name, sgn, chairColor, boardColor, boardLines, boardTitle) => {
    // sgn = -1 : tableau à l'ouest (Salle 12) ; +1 : tableau à l'est (Salle 14)
    const yaw = sgn < 0 ? -Math.PI / 2 : Math.PI / 2;
    const wallX = sgn < 0 ? -22 + SKIN : 22 - SKIN;
    const seats = [];
    for (let r = 0; r < 6; r++) {
      const x = wallX - sgn * (4.4 + r * 1.42);
      for (const z of [2.5, 4.7, 7.3, 9.5]) {
        desks.push({ x, z, ry: yaw });
        const [cx, cz] = rot(0, -0.55, yaw);
        chairs.push({ x: x + cx, z: z + cz, ry: yaw, color: chairColor[(r + Math.round(z)) % chairColor.length] });
        const [hx, hz] = rot(0, -0.58, yaw);
        seats.push({ x: O.x + x + hx, z: O.z + z + hz, yaw, row: r });
        k.solidR(x, z, 0.78, 0.56, 0.78, yaw);
      }
    }
    // Tableau vert (craie) + rebord + règle
    const bx = wallX + sgn * -0.05;
    const bimg = atlas.draw(896, 350, (x, w, h) => {
      x.scale(896 / 1024, 350 / 400);
      w = 1024;
      h = 400;
      x.fillStyle = boardColor;
      x.fillRect(0, 0, w, h);
      const r2 = mulberry32(boardTitle.length);
      for (let i = 0; i < 30; i++) {
        x.fillStyle = 'rgba(255,255,255,0.05)';
        x.beginPath();
        x.ellipse(r2() * w, r2() * h, 60 + r2() * 90, 20 + r2() * 30, r2() * 3, 0, Math.PI * 2);
        x.fill();
      }
      x.strokeStyle = '#8a5a3a';
      x.lineWidth = 24;
      x.strokeRect(0, 0, w, h);
      text(x, boardTitle, 60, 58, 46, '#fff8e8', { align: 'left', font: HAND, maxW: 660 });
      text(x, 'mardi 14 octobre', w - 50, 50, 30, '#ffe27a', { align: 'right', font: HAND });
      boardLines.forEach((l, i) => text(x, l, 70, 130 + i * 56, 36, i % 2 ? '#bfe8ff' : '#fff8e8', { align: 'left', font: HAND, maxW: 880 }));
      x.strokeStyle = '#fff8e8';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(60, 88);
      x.lineTo(560, 92);
      x.stroke();
    });
    k.decal(atlas.plane(bimg, 5.6, 2.2), atlas.mat, bx, 1.95, 6, yaw + Math.PI);
    k.box(bx + sgn * -0.08, 0.82, 6, 0.16, 0.05, 5.6, woodDark);
    // Craies + éponge
    k.box(bx + sgn * -0.1, 0.87, 5.0, 0.06, 0.05, 0.14, mat('#e86f6f'));
    k.box(bx + sgn * -0.1, 0.87, 4.6, 0.06, 0.03, 0.08, white);
    // Bureau du professeur + chaise
    const tx = wallX - sgn * 2.4;
    const td = k.prop(tx, 7.6, yaw + Math.PI);
    td.m(rb(1.7, 0.08, 0.85, 0.04), woodDark, 0, 0.76, 0);
    td.b(-0.78, 0, 0, 0.08, 0.72, 0.8, woodDark);
    td.b(0.78, 0, 0, 0.08, 0.72, 0.8, woodDark);
    td.b(0, 0.25, 0.38, 1.5, 0.47, 0.04, woodDark);
    td.b(-0.4, 0.8, 0, 0.35, 0.06, 0.26, mat('#e86f6f'));
    td.b(-0.4, 0.86, 0, 0.33, 0.05, 0.25, mat('#5fb7c9'));
    td.m(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 8), mat('#ffcd20'), 0.5, 0.86, 0.1);
    td.m(new THREE.SphereGeometry(0.09, 10, 8), mat('#e8343a'), 0.25, 0.89, -0.15); // pomme
    k.solidR(tx, 7.6, 1.7, 0.85, 0.8, yaw);
    // Poubelle, porte-manteau, affiches pédagogiques
    const teacher = { x: O.x + wallX - sgn * 1.0, z: O.z + 4.2, yaw: yaw + Math.PI };
    return { seats, teacher };
  };
  const c12 = classroom('salle12', -1, ['#ff8a5a', '#ffcd20', '#5fb7c9'], '#2f6b4f', [
    '• 1912 : fondation de l\'usine Halden',
    '• 1931 : la Grande Panne — 3 nuits sans lumière',
    '• 1958 : construction du barrage nord',
    '→ Pourquoi la ville a-t-elle eu peur du noir ?',
    'Devoirs : lire p. 42 à 47 !!',
  ], 'Histoire — La ville de Vesper');
  const c14 = classroom('salle14', 1, ['#e98ccf', '#8f7ad8', '#6fcf97'], '#2a4f6b', [
    'f(x) = 2x² − 3x + 1',
    'Δ = b² − 4ac = 9 − 8 = 1',
    'x₁ = 1   et   x₂ = 1/2',
    'Contrôle JEUDI (chapitres 3 et 4)',
    'Calculatrice autorisée :)',
  ], 'Mathématiques — Second degré');
  // Affiches des classes
  const classPosters = [
    { bg: '#6fcf97', title: 'La photosynthèse', sub: 'lumière + CO₂ + eau', art: 'leaf', accent: '#2fa88a' },
    { bg: '#1d2a6b', title: 'Système solaire', sub: '8 planètes (désolé Pluton)', art: 'planets' },
    { bg: '#ff8a5a', title: 'Le passé simple', sub: 'je fus, tu fus, il fut…', art: 'none' },
    { bg: '#8f7ad8', title: 'Pythagore', sub: 'a² + b² = c²', art: 'none' },
  ].map((p) => poster(atlas, p));
  const cp = (i, x, z, ry) => k.decal(atlas.plane(classPosters[i], 0.8, 1.12), atlas.mat, x, 2.3, z, ry);
  cp(0, -17, 11.78, Math.PI);
  cp(2, -14, 11.78, Math.PI);
  cp(1, -8.22, 4.5, -Math.PI / 2);
  cp(3, 17, 11.78, Math.PI);
  cp(1, 14, 11.78, Math.PI);
  cp(0, 8.22, 4.5, Math.PI / 2);
  // Étagère de fond de classe + globe (Salle 12)
  {
    const s = k.prop(-8.55, 8.5, -Math.PI / 2);
    s.b(0, 0, 0, 2.4, 1.1, 0.45, woodDark);
    s.m(new THREE.SphereGeometry(0.22, 14, 10), mat('#4f74c9'), 0.6, 1.4, 0);
    s.b(0.6, 1.1, 0, 0.18, 0.08, 0.18, metal);
    s.b(-0.6, 1.1, 0, 0.5, 0.3, 0.3, mat('#ffcd20'));
    k.solidR(-8.55, 8.5, 2.4, 0.45, 1.1, Math.PI / 2);
    const s2 = k.prop(8.55, 8.5, Math.PI / 2);
    s2.b(0, 0, 0, 2.4, 1.1, 0.45, woodDark);
    s2.b(0.3, 1.1, 0, 0.6, 0.35, 0.3, mat('#e98ccf'));
    k.solidR(8.55, 8.5, 2.4, 0.45, 1.1, Math.PI / 2);
  }

  // ---------- LABO DE PHYSIQUE ----------
  const L0 = CZ1; // z de départ
  const benchGeo = proto([
    [0, 0, 0, 3.3, 0.86, 0.78, '#e8e8f0'],
    [0, 0.86, 0, 3.4, 0.06, 0.84, '#2b2b3a'],
    [0, 0.05, 0.4, 3.2, 0.1, 0.02, '#3d5f9a'],
    [-1.0, 0.4, 0.395, 0.6, 0.02, 0.02, '#3a2f6b'],
    [0.0, 0.4, 0.395, 0.6, 0.02, 0.02, '#3a2f6b'],
    [1.0, 0.4, 0.395, 0.6, 0.02, 0.02, '#3a2f6b'],
    [0, 0.88, 0.33, 0.5, 0.03, 0.12, '#5a6070'], // évier
    { geo: new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), x: 0, y: 1.1, z: 0.36, color: '#b9c0d6' },
    { geo: new THREE.BoxGeometry(0.04, 0.04, 0.2), x: 0, y: 1.27, z: 0.28, color: '#b9c0d6' },
    { geo: new THREE.CylinderGeometry(0.05, 0.07, 0.2, 8), x: -1.1, y: 0.99, z: -0.1, color: '#9ff3ff' }, // bécher
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), x: 1.05, y: 1.02, z: 0.0, color: '#e98ccf' }, // éprouvette
  ]);
  const stoolGeo = proto([
    { geo: new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), x: 0, y: 0.5, z: 0, color: '#ffffff' },
    { geo: new THREE.CylinderGeometry(0.03, 0.04, 0.48, 6), x: 0, y: 0.24, z: 0, color: '#3a2f6b' },
    { geo: new THREE.CylinderGeometry(0.2, 0.22, 0.03, 10), x: 0, y: 0.015, z: 0, color: '#3a2f6b' },
    { geo: new THREE.TorusGeometry(0.14, 0.015, 4, 12), x: 0, y: 0.2, z: 0, rx: Math.PI / 2, color: '#3a2f6b' },
  ]);
  const labBenches = [];
  const stools = [];
  const laboSeats = [];
  const benchZ = [L0 + 3.0, L0 + 5.3, L0 + 7.6];
  benchZ.forEach((bz, r) => {
    for (const bx of [-3.6, 3.6]) {
      labBenches.push({ x: bx, z: bz });
      k.solidR(bx, bz, 3.4, 0.84, 0.92);
      for (const sx of [-0.85, 0.85]) {
        stools.push({ x: bx + sx, z: bz - 0.7, color: ['#ffd54f', '#5fb7c9', '#e86f6f'][r] });
        laboSeats.push({ x: O.x + bx + sx, z: O.z + bz - 0.72, yaw: 0, row: 2 - r });
      }
    }
  });
  k.inst(benchGeo, vertexMat(), labBenches);
  // Tableau périodique (atlas)
  const SYM = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
  const ptable = atlas.draw(810, 504, (x, w, h) => {
    x.scale(0.9, 0.9);
    w = 900;
    h = 560;
    x.fillStyle = '#f7f3ea';
    x.fillRect(0, 0, w, h);
    text(x, 'Tableau périodique des éléments', w / 2, 34, 34, '#1d1640');
    const cw = 48;
    const chh = 50;
    const ox = 18;
    const oy = 64;
    const cell = (n, col2, row) => {
      const grp = n <= 2 ? 0 : [3, 11, 19, 37, 55, 87].includes(n) ? 1 : [4, 12, 20, 38, 56, 88].includes(n) ? 2 : (n >= 57 && n <= 71) || (n >= 89 && n <= 103) ? 3 : col2 >= 3 && col2 <= 12 ? 4 : col2 === 18 ? 5 : col2 === 17 ? 6 : 7;
      x.fillStyle = ['#ffe27a', '#ff8a5a', '#ffb347', '#e98ccf', '#9fc9ff', '#b9a6ff', '#9ff3c8', '#c8e6a0'][grp];
      const px = ox + (col2 - 1) * cw;
      const py = oy + (row - 1) * chh + (row > 7 ? 14 : 0);
      x.fillRect(px + 1, py + 1, cw - 2, chh - 2);
      text(x, SYM[n - 1], px + cw / 2, py + chh / 2 + 4, 20, '#1d1640');
      x.font = '10px Arial';
      x.fillStyle = '#1d1640';
      x.textAlign = 'left';
      x.fillText(String(n), px + 4, py + 9);
    };
    let n = 1;
    const periodLen = [2, 8, 8, 18, 18, 32, 32];
    for (let p = 1; p <= 7; p++) {
      for (let i = 0; i < periodLen[p - 1]; i++, n++) {
        let c;
        if (p === 1) c = i === 0 ? 1 : 18;
        else if (p <= 3) c = i < 2 ? i + 1 : i + 11;
        else if (p <= 5) c = i + 1;
        else {
          if (i < 2) c = i + 1;
          else if (i < 17) {
            cell(n, i - 2 + 3, p === 6 ? 9 : 10);
            continue;
          } else c = i - 14;
        }
        cell(n, c, p);
      }
    }
  });
  k.decal(atlas.plane(ptable, 3.2, 2.0), atlas.mat, -7.78, 2.15, L0 + 5.2, Math.PI / 2);
  // Écran de projection + vidéoprojecteur
  const screenImg = atlas.draw(720, 405, (x, w, h) => {
    x.scale(0.9, 0.9);
    w = 800;
    h = 450;
    x.fillStyle = '#f7fbff';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#1d2a6b';
    x.fillRect(0, 0, w, 70);
    text(x, "Physique — L'énergie cachée de la matière", w / 2, 36, 32, '#ffffff', { maxW: w - 40 });
    text(x, 'Présentation : le fragment Aegis', 40, 110, 30, '#1d2a6b', { align: 'left' });
    for (const [i, l] of ['• Découvert sous la ville en 1931', '• Émet une lumière froide sans source', '• Prêté par le musée Halden (1 semaine)'].entries()) text(x, l, 50, 170 + i * 46, 26, '#2b2050', { align: 'left', font: '"Nunito", Arial, sans-serif' });
    // Schéma du cristal
    x.fillStyle = '#0d1430';
    x.beginPath();
    x.moveTo(640, 150);
    x.lineTo(700, 260);
    x.lineTo(650, 400);
    x.lineTo(590, 270);
    x.closePath();
    x.fill();
    x.strokeStyle = '#1fd6ff';
    x.lineWidth = 4;
    x.stroke();
    x.setLineDash([8, 8]);
    x.beginPath();
    x.arc(645, 275, 95, 0, Math.PI * 2);
    x.stroke();
    x.setLineDash([]);
    text(x, 'E = ?', 645, 425, 28, '#e8343a');
  });
  {
    const sz = 30 - SKIN - 0.05;
    k.mesh(atlas.plane(screenImg, 3.6, 2.0), atlas.softMat, 0, 2.3, sz, Math.PI);
    k.box(0, 3.3, sz - 0.05, 3.9, 0.14, 0.14, white);
    const pj = k.prop(0, L0 + 5.5);
    pj.b(0, H - 0.6, 0, 0.06, 0.6, 0.06, metal);
    pj.m(rb(0.45, 0.18, 0.4, 0.05), white, 0, H - 0.7, 0);
    pj.m(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), black, 0, H - 0.7, 0.21, Math.PI / 2);
  }
  // Paillasse du professeur
  {
    const tdx = -3.2;
    const tdz = L0 + 9.6;
    const td = k.prop(tdx, tdz, Math.PI);
    td.b(0, 0, 0, 2.6, 0.9, 0.9, white);
    td.b(0, 0.9, 0, 2.7, 0.06, 0.96, black);
    td.b(0, 0.05, -0.46, 2.5, 0.1, 0.02, mat('#3d5f9a'));
    td.m(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), steel, 0.8, 1.2, 0);
    td.m(new THREE.SphereGeometry(0.12, 10, 8), mat('#9ff3ff', { transparent: true, opacity: 0.6 }), 0.8, 1.5, 0);
    td.b(-0.7, 0.96, 0.1, 0.4, 0.03, 0.3, mat('#f7f3ea'));
    td.b(-0.2, 0.96, 0.0, 0.25, 0.3, 0.2, mat('#ffcd20'));
    k.solidR(tdx, tdz, 2.7, 0.96, 0.96);
  }
  // Vitrine du fragment Aegis (piédestal + cloche de verre)
  const FX = 3.6;
  const FZ = L0 + 9.9;
  let fragment;
  let fragGlow;
  let fragMat;
  {
    const p = k.prop(FX, FZ);
    p.m(rb(0.7, 1.05, 0.7, 0.06), mat('#1d2a6b'), 0, 0.525, 0);
    p.m(rb(0.82, 0.08, 0.82, 0.03), gold, 0, 1.08, 0);
    p.b(0, 1.12, 0, 0.6, 0.6, 0.6, glass);
    for (const [sx, sz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) p.b(sx, 1.12, sz, 0.03, 0.6, 0.03, gold);
    p.b(0, 1.71, 0, 0.64, 0.03, 0.64, gold);
    p.m(new THREE.CylinderGeometry(0.1, 0.13, 0.06, 8), metal, 0, 1.15, 0);
    const pl = plaque(atlas, 'Fragment Aegis — NE PAS TOUCHER', '#ffcd20', '#1d1640', 640, 96);
    p.m(atlas.plane(pl, 0.62, 0.093), atlas.mat, 0, 0.82, -0.355, 0, Math.PI, 0);
    k.solidR(FX, FZ, 0.82, 0.82, 1.75);
    // Éclat de cristal : octaèdre étiré et irrégulier, facettes nettes.
    const g = new THREE.OctahedronGeometry(0.14, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setXYZ(i, pos.getX(i) * (y > 0 ? 0.7 : 1.0) + y * 0.18, y * 1.7, pos.getZ(i) * 0.75);
    }
    g.computeVertexNormals();
    fragMat = new THREE.MeshToonMaterial({ color: '#070a1c', emissive: '#12c8ff', emissiveIntensity: 0.008, gradientMap: M().gradientMap });
    fragment = new THREE.Mesh(g, fragMat);
    fragment.name = 'fragment';
    fragment.position.set(FX, 1.43, FZ);
    fragment.rotation.z = 0.12;
    fragment.userData.dynamic = true;
    group.add(fragment);
    // Halo additif discret (enfant : caché avec le fragment)
    fragGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#1fd6ff', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    fragGlow.userData.dynamic = true;
    fragment.add(fragGlow);
    // Arêtes cyan à peine lumineuses (cristal sombre « habité »)
    const fragEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(g),
      new THREE.LineBasicMaterial({ color: '#3fe0ff', transparent: true, opacity: 0.3, depthWrite: false }),
    );
    fragEdges.userData.dynamic = true;
    fragment.add(fragEdges);
    updaters.push((dt, t) => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.1) * Math.sin(t * 0.7 + 1);
      fragMat.emissiveIntensity = 0.004 + pulse * 0.012;
      fragEdges.material.opacity = 0.18 + pulse * 0.3;
      fragGlow.material.opacity = 0.006 + pulse * 0.014;
      fragGlow.scale.setScalar(0.9 + pulse * 0.25);
      fragment.rotation.y += dt * 0.35;
      fragment.position.y = 1.43 + Math.sin(t * 1.3) * 0.015;
    });
  }
  // Affiches du labo + armoire à produits + lavabo de sécurité
  const labPosters = [
    { bg: '#ffd54f', fg: '#1d1640', ink: '#1d1640', title: 'Lunettes obligatoires', sub: 'Sécurité au labo', art: 'goggles', accent: '#3d5f9a' },
    { bg: '#3d5f9a', title: 'Ohm : U = R × I', sub: 'Électricité', art: 'bolt', accent: '#ffe27a' },
  ].map((p) => poster(atlas, p));
  k.decal(atlas.plane(labPosters[0], 0.8, 1.12), atlas.mat, 7.78, 2.3, L0 + 3.5, -Math.PI / 2);
  k.decal(atlas.plane(labPosters[1], 0.8, 1.12), atlas.mat, 7.78, 2.3, L0 + 6.5, -Math.PI / 2);
  {
    const a = k.prop(7.45, L0 + 9.5, -Math.PI / 2);
    a.b(0, 0, 0, 1.6, 2.1, 0.55, mat('#f7f3ea'));
    a.b(0, 1.0, 0.28, 1.5, 1.0, 0.02, glass);
    for (let i = 0; i < 6; i++) a.m(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 8), mat(['#e86f6f', '#9ff3ff', '#ffcd20', '#6fcf97', '#e98ccf', '#ffffff'][i]), -0.6 + i * 0.24, 1.15, 0.05);
    a.b(0, 1.45, 0, 1.5, 0.03, 0.5, white);
    k.solidR(7.45, L0 + 9.5, 1.6, 0.55, 2.1, Math.PI / 2);
  }
  // Tabourets (labo)
  k.inst(stoolGeo, vertexMat(), stools);

  // ---------- CAFÉTÉRIA ----------
  const cafSeats = [];
  {
    const tableM = mat('#f2b84b');
    const benchM = mat('#6fcf97');
    const legM = metal;
    for (const tx of [-31, -23.3, -15.6]) {
      for (const tz of [L0 + 3.2, L0 + 6.6]) {
        const t = k.prop(tx, tz);
        t.m(rb(5.2, 0.08, 1.1, 0.04), tableM, 0, 0.74, 0);
        for (const sx of [-2.2, 2.2]) t.b(sx, 0, 0, 0.12, 0.72, 0.8, legM);
        for (const sz of [-0.85, 0.85]) {
          t.m(rb(5.0, 0.08, 0.4, 0.04), benchM, 0, 0.43, sz);
          for (const sx of [-2.1, 2.1]) t.b(sx, 0, sz, 0.1, 0.4, 0.3, legM);
          for (const sx of [-1.8, -0.6, 0.6, 1.8]) cafSeats.push({ x: O.x + tx + sx, z: O.z + tz + sz * 1.02, yaw: sz < 0 ? 0 : Math.PI });
        }
        k.solidR(tx, tz, 5.2, 1.1, 0.8);
        k.solidR(tx, tz - 0.85, 5.0, 0.4, 0.47);
        k.solidR(tx, tz + 0.85, 5.0, 0.4, 0.47);
      }
    }
    // Plateaux (instanciés) avec assiette + verre
    const trayGeo = proto([
      [0, 0, 0, 0.42, 0.025, 0.3, '#ffffff'],
      { geo: new THREE.CylinderGeometry(0.09, 0.07, 0.025, 10), x: -0.07, y: 0.04, z: 0, color: '#f7f3ea' },
      { geo: new THREE.SphereGeometry(0.05, 6, 4), x: -0.07, y: 0.06, z: 0, color: '#e2733f' },
      { geo: new THREE.CylinderGeometry(0.035, 0.03, 0.1, 6), x: 0.13, y: 0.075, z: 0.07, color: '#9ff3ff' },
    ]);
    const trays = [];
    for (const s of cafSeats) {
      if (rand() < 0.45) continue;
      const lx = s.x - O.x;
      const lz = s.z - O.z + (s.yaw === 0 ? 0.55 : -0.55);
      trays.push({ x: lx, y: 0.78, z: lz, ry: s.yaw + (rand() - 0.5) * 0.3, color: ['#e86f6f', '#5fb7c9', '#ffcd20', '#8f7ad8'][Math.floor(rand() * 4)] });
    }
    // Pile de plateaux sur le comptoir
    for (let i = 0; i < 6; i++) trays.push({ x: -33.2, y: 1.06 + i * 0.03, z: 28.4, color: '#e86f6f' });
    k.inst(trayGeo, vertexMat(), trays);
    // Comptoir de service (le long du mur nord) + vitre anti-postillons
    const cx0 = -34;
    const cx1 = -18;
    const cz = 28.3;
    k.box((cx0 + cx1) / 2, 0, cz, cx1 - cx0, 1.0, 0.9, mat('#e2733f'), true);
    k.box((cx0 + cx1) / 2, 1.0, cz, cx1 - cx0 + 0.1, 0.06, 1.0, steel);
    k.box((cx0 + cx1) / 2, 0.15, cz - 0.46, cx1 - cx0 - 0.2, 0.08, 0.02, mat('#ffcd20'));
    k.box((cx0 + cx1) / 2, 1.06, cz - 0.38, cx1 - cx0 - 0.4, 0.03, 0.3, steel); // rail à plateaux
    k.box((cx0 + cx1) / 2, 1.4, cz + 0.05, cx1 - cx0 - 0.4, 0.5, 0.02, glass);
    for (let i = 0; i < 6; i++) {
      const x = cx0 + 2.6 + i * 2.2;
      k.box(x, 1.06, cz + 0.15, 1.6, 0.08, 0.5, mat('#b9c0d6'));
      k.box(x, 1.14, cz + 0.15, 1.4, 0.04, 0.4, mat(['#e2733f', '#6fcf97', '#ffcd20', '#e86f6f', '#f7f3ea', '#a8693f'][i]));
    }
    k.box(-26, 0, 29.6, 16, 1.6, 0.2, mat('#bfe3dc')); // crédence carrelée
    const menu = atlas.draw(768, 300, (x, w, h) => {
      x.fillStyle = '#2b2b3a';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#a8693f';
      x.lineWidth = 16;
      x.strokeRect(0, 0, w, h);
      text(x, 'MENU DU JOUR', w / 2, 50, 52, '#ffcd20');
      for (const [i, l] of ['Carottes râpées', 'Lasagnes maison', 'Yaourt ou pomme', 'Bon appétit !'].entries()) text(x, l, w / 2, 115 + i * 50, 36, i === 3 ? '#6fcf97' : '#fff8e8', { font: HAND });
    });
    k.decal(atlas.plane(menu, 2.6, 1.0), atlas.mat, -10, 2.3, L0 + 0.24 + 0.002, 0);
    k.decal(atlas.plane(menu, 2.2, 0.86), atlas.mat, -26, 2.95, 29.78, Math.PI);
    // Distributeurs côté ouest
    vending(-35.38, L0 + 3.5, Math.PI / 2, '#3d8fd1', 'BOISSONS');
    vending(-35.38, L0 + 5.0, Math.PI / 2, '#e8343a', 'SNACKS');
    // Poubelles de tri
    for (const [i, c] of ['#ffcd20', '#3d8fd1', '#6fcf97'].entries()) {
      const x = -11.5 + i * 0.7;
      k.mesh(rb(0.6, 0.95, 0.6, 0.06), mat(c), x, 0.475, L0 + 0.62);
    }
    k.solid(-11.85, L0 + SKIN, -9.75, L0 + 0.95, 0, 1.0);
    plant(-9, 29.1);
    plant(-35, 29.1);
  }

  // ---------- CDI ----------
  {
    const shelfM = mat('#a8693f');
    const books = [];
    const shelf = (x, z, ry, len) => {
      const s = k.prop(x, z, ry);
      s.b(0, 0, 0, len, 0.06, 0.4, shelfM);
      for (let i = 1; i <= 4; i++) s.b(0, i * 0.5, 0, len, 0.04, 0.4, shelfM);
      s.b(-len / 2, 0, 0, 0.05, 2.2, 0.4, shelfM);
      s.b(len / 2, 0, 0, 0.05, 2.2, 0.4, shelfM);
      s.b(0, 0, -0.19, len, 2.2, 0.03, mat('#7a4a2a'));
      k.solidR(x, z, len, 0.42, 2.2, ry);
      const nb = quality === 'low' ? 0.6 : 1;
      for (let lvl = 0; lvl < 4; lvl++) {
        let bx = -len / 2 + 0.06;
        while (bx < len / 2 - 0.1) {
          const w = 0.04 + rand() * 0.04;
          if (rand() > 0.12 * (1 / nb)) {
            const h = 0.26 + rand() * 0.14;
            const [rx, rz] = rot(bx + w / 2, 0.02, ry);
            books.push({ x: x + rx, y: 0.06 + lvl * 0.5, z: z + rz, ry, sx: w, sy: h, sz: 0.24, color: ['#e86f6f', '#5fb7c9', '#f2b84b', '#8f7ad8', '#6fcf97', '#e98ccf', '#4f74c9', '#f7f3ea'][Math.floor(rand() * 8)] });
          }
          bx += w + 0.005;
        }
      }
    };
    shelf(12, 29.55, Math.PI, 3.6);
    shelf(16, 29.55, Math.PI, 3.6);
    shelf(20, 29.55, Math.PI, 3.6);
    shelf(23.55, 25, -Math.PI / 2, 3.6);
    shelf(23.55, 21, -Math.PI / 2, 2.4);
    shelf(13.5, 23.5, Math.PI, 3.2);
    shelf(13.5, 23.9, 0, 3.2);
    const bookGeo = new THREE.BoxGeometry(1, 1, 1);
    bookGeo.translate(0, 0.5, 0);
    k.inst(bookGeo, M({ color: '#ffffff' }), books);
    // Poufs
    const pouf = new THREE.SphereGeometry(0.55, 12, 8);
    for (const [x, z, c] of [[19, 22, '#e98ccf'], [20.6, 21.2, '#ffcd20'], [18.6, 24.2, '#5fb7c9']]) {
      const m = k.mesh(pouf, mat(c), x, 0.3, z);
      m.scale.set(1, 0.6, 1);
      k.solidR(x, z, 0.9, 0.9, 0.5);
    }
    // Table de lecture + tapis
    k.box(19.8, 0.003, 22.5, 3.6, 0.01, 3.2, mat('#ffcd20'));
    const sign = plaque(atlas, 'CDI — chut, on lit !', '#ffffff', '#8a5a3a', 512, 112);
    k.decal(atlas.plane(sign, 2.2, 0.48), atlas.mat, 16, 3.05, 29.78, Math.PI);
    const rt = k.prop(10, 20.6);
    rt.m(rb(1.6, 0.06, 0.9, 0.03), wood, 0, 0.74, 0);
    rt.b(0, 0, 0, 0.1, 0.72, 0.1, metal);
    rt.b(0, 0.78, 0, 0.3, 0.04, 0.22, mat('#e86f6f'));
    k.solidR(10, 20.6, 1.6, 0.9, 0.78);
  }

  // Chaises et bureaux instanciés (classes)
  k.inst(deskGeo, vertexMat(), desks);
  k.inst(chairGeo, vertexMat(), chairs);

  // ---------- Lumières ----------
  const lights = [];
  const addLight = (color, x, y, z, intensity, dist = 16) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    l.userData.base = intensity;
    group.add(l);
    lights.push(l);
  };
  addLight('#fff1d6', 0, 2.5, 6, 5, 16); // hall
  addLight('#e8f4ff', 0, 2.5, L0 + 6, 4.5, 15); // labo
  if (quality !== 'low') {
    addLight('#fff4e0', -14, 2.5, 15, 5, 18); // couloir
    addLight('#ffe8c0', -22, 2.5, L0 + 6, 5, 18); // cafétéria
  }

  // Finalisation : atlas, fusion.
  atlas.finish(group);
  const calls = mergeStatic(group);

  const L = (x, z, yaw) => ({ x: O.x + x, z: O.z + z, ...(yaw !== undefined ? { yaw } : {}) });
  const noaSeat = laboSeats.find((s) => s.row === 0 && Math.abs(s.x - O.x - 2.75) < 0.01) || laboSeats[0];
  return {
    zone: {
      group,
      lights,
      spawn: { x: O.x, y: 0, z: O.z + 2.2, yaw: 0 },
      exit: { x: O.x, y: 0, z: O.z + 1.0 },
      rooms: {
        hall: L(0, 6), corridor: L(0, 15), salle12: L(-15, 6), labo: L(0, 24), salle14: L(15, 6), cafeteria: L(-27.1, 22.9), cdi: L(16, 24), stair: L(30, 19),
      },
      doors: { salle12: L(D12, CZ0), salle14: L(D14, CZ0), labo: L(0, CZ1), cafeteria: L(DCAF, CZ1), cdi: L(DCDI, CZ1), hall: L(0, CZ0) },
      seats: { salle12: c12.seats, labo: laboSeats, salle14: c14.seats, cafeteria: cafSeats },
      seatHeight: { salle12: 0.45, salle14: 0.45, labo: 0.53, cafeteria: 0.47 },
      noaSeat: { room: 'labo', x: noaSeat.x, z: noaSeat.z, yaw: noaSeat.yaw },
      teacher: { labo: L(-3.2, L0 + 10.6, Math.PI), salle12: c12.teacher, salle14: c14.teacher },
      fragment: { x: O.x + FX, y: 1.43, z: O.z + FZ, mesh: fragment },
      locker: { x: O.x + noaL.x, z: O.z + noaL.z + 0.85, yaw: Math.PI, lockerX: O.x + noaL.x, lockerZ: O.z + noaL.z },
      standSpots: {
        corridor: [L(-6, 15.6, Math.PI / 2), L(-4.8, 15.4, -Math.PI / 2), L(14, 14.2, Math.PI), L(14, 13.1, 0), L(-26, 16.2, 0.6), L(-25, 15.6, -2.4), L(24, 15, -Math.PI / 2)],
        hall: [L(-3.6, 7.2, -Math.PI / 2), L(2, 9, 2.5), L(3, 8.2, -0.8), L(-2, 3.8, 0.4)],
        cafeteria: [L(-30, L0 + 9.2, 0), L(-28.8, L0 + 9.2, 0), L(-27.6, L0 + 9.3, 0), L(-14, L0 + 9.0, -Math.PI / 2), L(-15.2, L0 + 9.0, Math.PI / 2)],
      },
      bounds: BOUNDS,
      calls,
    },
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
  };
}

// ===========================================================================
// MAISON DE NOA
// ===========================================================================
function buildHome(scene, col, quality) {
  const O = HOME_ORIGIN;
  const group = new THREE.Group();
  group.name = 'interior-home';
  group.position.set(O.x, 0, O.z);
  group.visible = false;
  scene.add(group);
  const k = zoneKit(group, col, O.x, O.z);
  const rand = mulberry32(16);
  const atlas = new Atlas(1024, 1024, 512);
  const updaters = [];

  const plank = (a, b, seed) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const r = mulberry32(seed);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = r() < 0.5 ? a : b;
      x.fillRect(0, i * 32, 256, 32);
      x.fillStyle = 'rgba(60,30,20,0.35)';
      x.fillRect(0, i * 32, 256, 2);
      x.fillRect(Math.floor(r() * 256), i * 32, 2, 32);
      for (let k2 = 0; k2 < 5; k2++) {
        x.fillStyle = 'rgba(60,30,20,0.12)';
        x.fillRect(r() * 256, i * 32 + 6 + r() * 20, 30 + r() * 60, 2);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return M({ map: t });
  };
  const tiles = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#d8d0c8';
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? '#f2ece4' : '#5fb7c9';
      x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return M({ map: t });
  })();
  const woodFloor = plank('#c98a4a', '#b87a40', 1);
  const woodFloor2 = plank('#9a6a8a', '#8a5a7a', 2);

  // Plan : séjour + cuisine (x -7..7, z 0..10) → couloir (x -2.5..2.5, z 10..15) → chambre (x -5..5, z 15..24.5)
  k.room(-7, 0, 7, 10, { wall: '#f2d7b6', low: '#c46a4a', stripe: '#f7f3ea', floorMat: woodFloor, tile: 2.5, doors: { n: [[0, 2.6]] } });
  k.room(-2.5, 10, 2.5, 15, { wall: '#e8d9c0', low: '#8a5a3a', stripe: '#f7f3ea', floorMat: woodFloor, tile: 2.5, doors: { s: [[0, 2.6]], n: [[0, 2.6]] } });
  k.room(-5, 15, 5, 24.5, { wall: '#3d3a7a', low: '#2b2860', stripe: '#ff4fa3', floorMat: woodFloor2, tile: 2.5, doors: { s: [[0, 2.6]] } });
  // Carrelage de la cuisine (par-dessus le parquet)
  k.floor(1.5, 0.2, 6.8, 9.8, tiles, 1, 0.008);
  // Volumes pleins autour du couloir et de la chambre
  k.solid(-7, 10, -2.5, 15);
  k.solid(2.5, 10, 7, 15);
  k.solid(-7, 15, -5, 24.5);
  k.solid(5, 15, 7, 24.5);
  const ceil = mat('#f4efe6', { side: THREE.DoubleSide });
  k.shell(-7, 0, 7, 24.5, ceil);
  const BOUNDS = [O.x - 7, O.z, O.x + 7, O.z + 24.5];

  const wood = mat('#c98a4a');
  const woodDark = mat('#7a4a2a');
  const white = mat('#f7f3ea');
  const black = mat('#2b2b3a');
  const metal = mat('#3a2f6b');
  const steel = mat('#b9c0d6');
  const night = [skyImage(atlas, true, 4), skyImage(atlas, true, 5)];

  // ---------- Porte d'entrée (sortie) ----------
  const doorX = -3.5;
  {
    const d = k.prop(doorX, SKIN, 0);
    d.b(0, 0, 0.02, 1.3, 2.35, 0.08, mat('#e2533f'));
    d.b(0, 0, 0, 1.55, 2.5, 0.04, white);
    d.m(new THREE.SphereGeometry(0.05, 8, 6), mat('#ffcd20'), 0.48, 1.05, 0.1);
    d.b(0, 1.6, 0.065, 0.5, 0.4, 0.02, mat('#ffe8b0', { emissive: '#ffb35c', emissiveIntensity: 0.4 }));
    d.b(0, 0, 0.7, 1.4, 0.02, 0.8, mat('#5a3d7a'));
    // Porte-manteau + chaussures
    d.b(1.3, 1.7, 0.05, 0.8, 0.06, 0.1, woodDark);
    for (const [i, c] of ['#ffcd20', '#3d8fd1'].entries()) d.m(rb(0.4, 0.75, 0.15, 0.07), mat(c), 1.1 + i * 0.4, 1.3, 0.15);
    d.b(1.4, 0, 0.3, 0.32, 0.12, 0.14, mat('#e8343a'));
    d.b(1.8, 0, 0.32, 0.32, 0.12, 0.14, mat('#f7f3ea'));
  }
  // Fenêtres (nuit)
  k.window(atlas, night[0], 1.0, SKIN + 0.04, 0, 2.2, 1.6, 1.0);
  k.window(atlas, night[1], -6.76, 2.4, Math.PI / 2, 1.8, 1.5, 1.1);
  k.window(atlas, night[0], 4.3, SKIN + 0.04, 0, 1.8, 1.0, 1.6);

  // ---------- Séjour ----------
  // Tapis, canapé (face au mur ouest), télé, table basse, plantes
  k.box(-4.2, 0.004, 5.2, 3.6, 0.012, 3.0, mat('#8f7ad8'));
  k.box(-4.2, 0.008, 5.2, 3.0, 0.012, 2.4, mat('#b9a6ff'));
  {
    const s = k.prop(-2.2, 5.2, -Math.PI / 2);
    const fab = mat('#4f9a8a');
    s.m(rb(2.6, 0.45, 0.95, 0.15), fab, 0, 0.3, 0);
    s.m(rb(2.6, 0.75, 0.3, 0.15), fab, 0, 0.75, -0.4);
    s.m(rb(0.3, 0.65, 0.95, 0.12), fab, -1.3, 0.5, 0);
    s.m(rb(0.3, 0.65, 0.95, 0.12), fab, 1.3, 0.5, 0);
    for (const cx of [-0.6, 0.6]) s.m(rb(1.1, 0.18, 0.8, 0.09), mat('#5fb7a0'), cx, 0.6, 0.05);
    s.m(rb(0.45, 0.42, 0.14, 0.07), mat('#ffcd20'), -0.8, 0.85, -0.18).rotation.z = 0.2;
    s.m(rb(0.42, 0.42, 0.14, 0.07), mat('#e98ccf'), 0.85, 0.85, -0.18).rotation.z = -0.2;
    k.solidR(-2.2, 5.2, 2.9, 1.0, 0.95, -Math.PI / 2);
  }
  k.box(-4.3, 0, 5.2, 0.7, 0.4, 1.2, wood, true); // table basse
  k.box(-4.3, 0.4, 5.0, 0.18, 0.1, 0.12, mat('#e8343a')); // mug
  k.box(-4.3, 0.4, 5.5, 0.3, 0.03, 0.2, black); // télécommande + magazine
  let tvMat;
  {
    const tvX = -6.65;
    k.box(tvX + 0.1, 0, 5.2, 0.45, 0.5, 2.4, woodDark, true);
    const tvImg = atlas.draw(512, 288, (x, w, h) => {
      x.fillStyle = '#1d2a6b';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#e8343a';
      x.fillRect(0, h - 70, w, 70);
      text(x, 'FLASH INFO', 90, h - 50, 26, '#ffffff');
      text(x, 'Pannes inexpliquées à Vesper', 300, h - 22, 24, '#ffffff', { maxW: 400 });
      x.fillStyle = '#3a1a6e';
      x.fillRect(30, 30, 260, 150);
      x.fillStyle = '#ff6fa8';
      x.beginPath();
      x.arc(160, 100, 40, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#1d1640';
      for (let i = 0; i < 6; i++) x.fillRect(40 + i * 42, 120 - (i % 3) * 20, 34, 60 + (i % 3) * 20);
      text(x, 'EN DIRECT', 400, 50, 26, '#ffcd20');
      text(x, 'Quartier Halden', 400, 95, 22, '#ffffff', { maxW: 200 });
    });
    const tvTex = atlas.pages[tvImg.page].tex;
    tvMat = M({ map: tvTex, emissive: '#ffffff', emissiveMap: tvTex, emissiveIntensity: 0.9 });
    const tv = k.prop(tvX + 0.15, 5.2, Math.PI / 2);
    tv.m(rb(1.9, 1.1, 0.08, 0.03), black, 0, 1.25, 0);
    const scr = tv.m(atlas.plane(tvImg, 1.78, 1.0), tvMat, 0, 1.25, 0.045);
    scr.userData.dynamic = true;
    tv.b(0, 0.5, -0.02, 0.3, 0.2, 0.15, black);
    updaters.push((dt, t) => {
      tvMat.emissiveIntensity = 0.8 + Math.sin(t * 7) * 0.05 + (Math.sin(t * 23.1) > 0.97 ? 0.4 : 0);
    });
  }
  const plant = (x, z, s = 1) => {
    const p = k.prop(x, z, rand() * 6);
    p.m(new THREE.CylinderGeometry(0.26 * s, 0.2 * s, 0.45 * s, 10), mat('#f7f3ea'), 0, 0.225 * s, 0);
    for (const [lx, ly, lz, r] of [[0, 0.85, 0, 0.38], [0.2, 0.65, 0.1, 0.28], [-0.2, 0.7, -0.1, 0.3], [0.05, 1.15, 0.05, 0.25]]) p.m(new THREE.IcosahedronGeometry(r * s, 0), mat(r > 0.3 ? '#3cc29a' : '#2fa88a'), lx * s, ly * s, lz * s);
    k.solidR(x, z, 0.55 * s, 0.55 * s, 1.1 * s);
  };
  plant(-6.4, 0.7);
  plant(-6.4, 9.3, 1.1);
  plant(1.0, 9.3, 0.8);
  // Bibliothèque + cadres photo
  {
    const b = k.prop(-4.6, 9.55, Math.PI);
    b.b(0, 0, 0, 2.4, 1.9, 0.4, woodDark);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 9; j++) b.b(-1.0 + j * 0.24, 0.12 + i * 0.6, 0.2, 0.16, 0.36, 0.05, mat(['#e86f6f', '#5fb7c9', '#f2b84b', '#8f7ad8', '#6fcf97'][(i + j) % 5]));
    }
    k.solidR(-4.6, 9.55, 2.4, 0.4, 1.9, Math.PI);
    const photo = atlas.draw(256, 192, (x, w, h) => {
      x.fillStyle = '#ffe8b0';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#7fd0ff';
      x.fillRect(12, 12, w - 24, h - 24);
      x.fillStyle = '#6fcf97';
      x.fillRect(12, h - 60, w - 24, 48);
      for (const [px, c, r] of [[80, '#e2733f', 34], [140, '#3a2f6b', 26], [190, '#8f7ad8', 30]]) {
        x.fillStyle = c;
        x.beginPath();
        x.arc(px, h - 90, r, 0, Math.PI * 2);
        x.fill();
        x.fillRect(px - r * 0.8, h - 70, r * 1.6, 60);
      }
    });
    for (const [px, py] of [[-1.5, 2.4], [-0.5, 2.6], [0.5, 2.35]]) {
      k.box(-4.6 + px, py - 0.25, 9.79, 0.8, 0.62, 0.03, mat('#2b2050'));
      k.decal(atlas.plane(photo, 0.7, 0.52), atlas.mat, -4.6 + px, py + 0.06, 9.77, Math.PI);
    }
  }
  // Lampadaire de salon
  {
    const l = k.prop(-0.8, 7.2);
    l.m(new THREE.CylinderGeometry(0.2, 0.25, 0.05, 12), metal, 0, 0.03, 0);
    l.m(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), metal, 0, 0.82, 0);
    l.m(new THREE.CylinderGeometry(0.2, 0.32, 0.35, 12, 1, true), mat('#ffe8b0', { emissive: '#ffb35c', emissiveIntensity: 0.9, side: THREE.DoubleSide }), 0, 1.75, 0);
    k.solidR(-0.8, 7.2, 0.4, 0.4, 1.9);
  }

  // ---------- Cuisine ----------
  {
    const cab = mat('#6fcf97');
    const top = mat('#f2efe6');
    // Plan de travail le long du mur est (z 0.5..6.5) + évier + plaques
    k.box(6.45, 0, 3.6, 0.7, 0.9, 6.0, cab, true);
    k.box(6.42, 0.9, 3.6, 0.78, 0.05, 6.1, top);
    for (let i = 0; i < 5; i++) k.box(6.08, 0.15, 1.0 + i * 1.2, 0.02, 0.6, 1.1, mat('#5ab884'));
    k.box(6.45, 0.92, 2.6, 0.5, 0.03, 0.7, steel); // évier
    k.mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 10, Math.PI), steel, 6.65, 1.08, 2.6, Math.PI / 2);
    k.box(6.45, 0.95, 4.8, 0.55, 0.02, 0.6, black); // plaques
    for (const dz of [-0.14, 0.14]) k.mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 12), mat('#e8343a', { emissive: '#ff3020', emissiveIntensity: 0.2 }), 6.45, 0.965, 4.8 + dz);
    // Meubles hauts
    k.box(6.62, 1.8, 3.6, 0.36, 0.8, 6.0, mat('#f7f3ea'));
    for (let i = 0; i < 5; i++) k.box(6.43, 1.85, 1.0 + i * 1.2, 0.02, 0.7, 1.1, mat('#e8e2d8'));
    // Grille-pain, bouilloire, corbeille de fruits
    k.box(6.4, 0.95, 1.2, 0.25, 0.2, 0.35, mat('#e86f6f'));
    k.mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 10), steel, 6.4, 1.07, 3.6);
    for (const [i, c] of ['#e8343a', '#ffcd20', '#6fcf97'].entries()) k.mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(c), 6.3 + (i % 2) * 0.1, 1.0, 5.7 + i * 0.08);
  }
  // Frigo + mot de maman
  const FRX = 6.35;
  const FRZ = 8.6;
  {
    const f = k.prop(FRX, FRZ, -Math.PI / 2);
    f.m(rb(1.0, 2.0, 0.75, 0.1), mat('#f7f3ea'), 0, 1.0, 0);
    f.b(0, 1.32, 0.378, 0.96, 0.02, 0.02, mat('#c8c0b0'));
    f.b(-0.4, 0.5, 0.39, 0.05, 0.6, 0.04, steel);
    f.b(-0.4, 1.5, 0.39, 0.05, 0.35, 0.04, steel);
    const note = atlas.draw(320, 300, (x, w, h) => {
      x.fillStyle = '#fff3a0';
      x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(0,0,0,0.06)';
      for (let i = 1; i < 9; i++) x.fillRect(0, i * 32, w, 2);
      text(x, 'Noa,', 20, 34, 30, '#2b2050', { align: 'left', font: HAND });
      text(x, 'il reste des lasagnes', 20, 82, 26, '#2b2050', { align: 'left', font: HAND, maxW: 280 });
      text(x, 'au frigo. Rentre AVANT', 20, 122, 26, '#2b2050', { align: 'left', font: HAND, maxW: 280 });
      text(x, 'le couvre-feu !!', 20, 162, 26, '#e8343a', { align: 'left', font: HAND, maxW: 280 });
      text(x, 'Bisous, Maman ♥', 120, 230, 28, '#2b2050', { align: 'left', font: HAND, maxW: 190 });
    });
    f.m(atlas.plane(note, 0.34, 0.32), atlas.mat, 0.1, 1.62, 0.383, 0, 0, 0.06);
    f.m(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10), mat('#e8343a'), 0.1, 1.77, 0.39, Math.PI / 2);
    // Magnets + dessin
    for (const [mx, my, c] of [[0.3, 1.1, '#3d8fd1'], [-0.1, 0.9, '#ffcd20'], [0.25, 0.75, '#6fcf97']]) f.m(new THREE.SphereGeometry(0.04, 8, 6), mat(c), mx, my, 0.39);
    k.solidR(FRX, FRZ, 1.0, 0.75, 2.0, -Math.PI / 2);
  }
  // Table + chaises
  {
    const tx = 3.4;
    const tz = 5.0;
    const t = k.prop(tx, tz);
    t.m(rb(1.6, 0.07, 1.1, 0.03), wood, 0, 0.75, 0);
    for (const [lx, lz] of [[-0.7, -0.45], [0.7, -0.45], [-0.7, 0.45], [0.7, 0.45]]) t.b(lx, 0, lz, 0.07, 0.72, 0.07, woodDark);
    t.b(0, 0.785, 0, 0.6, 0.01, 0.3, mat('#e86f6f'));
    t.m(new THREE.CylinderGeometry(0.1, 0.08, 0.1, 10), mat('#5fb7c9'), 0, 0.84, 0);
    k.solidR(tx, tz, 1.6, 1.1, 0.79);
    for (const [cx, cz, ry] of [[0, -0.85, 0], [0, 0.85, Math.PI], [-1.1, 0, Math.PI / 2], [1.1, 0, -Math.PI / 2]]) {
      const c = k.prop(tx + cx, tz + cz, ry);
      c.m(rb(0.44, 0.06, 0.42, 0.03), mat('#ffcd20'), 0, 0.45, 0);
      c.m(rb(0.44, 0.45, 0.05, 0.03), mat('#ffcd20'), 0, 0.72, -0.2);
      for (const [lx, lz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) c.b(lx, 0, lz, 0.04, 0.42, 0.04, woodDark);
    }
  }
  // Suspension de cuisine
  {
    k.mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 4), black, 3.4, H - 0.5, 5.0);
    k.mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e2733f', { side: THREE.DoubleSide }), 3.4, H - 1.0, 5.0);
    k.mesh(new THREE.SphereGeometry(0.1, 8, 6), mat('#fff', { emissive: '#ffe0a0', emissiveIntensity: 1.5 }), 3.4, H - 1.02, 5.0);
  }

  // ---------- Couloir ----------
  {
    // Fausses portes : salle de bain (est), chambre de maman (ouest)
    const fd = (x, z, ry, label, color) => {
      const d = k.prop(x, z, ry);
      d.b(0, 0, 0.02, 1.0, 2.2, 0.06, mat(color));
      d.b(0, 0, 0, 1.2, 2.3, 0.03, white);
      d.m(new THREE.SphereGeometry(0.045, 8, 6), mat('#ffcd20'), 0.38, 1.0, 0.08);
      const p = plaque(atlas, label, '#2b2050', '#f7f3ea', 256, 80);
      d.m(atlas.plane(p, 0.5, 0.16), atlas.mat, 0, 1.6, 0.06);
    };
    fd(2.3 - 0.0, 12.5, -Math.PI / 2, 'Salle de bain', '#5fb7c9');
    fd(-2.3, 12.5, Math.PI / 2, 'Maman', '#e98ccf');
    k.box(0, 0.005, 12.5, 1.4, 0.01, 3.4, mat('#c46a4a'));
  }

  // ---------- Chambre de Noa ----------
  const BZ0 = 15;
  // Commode + lampe à lave + miroir (mur ouest, près de la porte)
  {
    const d = k.prop(-4.5, 16.4, Math.PI / 2);
    d.m(rb(1.3, 0.9, 0.5, 0.05), mat('#c98a4a'), 0, 0.45, 0);
    for (const y of [0.2, 0.5]) d.b(0, y, 0.255, 1.2, 0.02, 0.01, woodDark);
    for (const y of [0.32, 0.62]) d.b(0, y, 0.26, 0.2, 0.04, 0.03, steel);
    d.m(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), black, -0.35, 0.95, 0);
    d.m(new THREE.CapsuleGeometry(0.07, 0.18, 3, 8), mat('#ff4fa3', { emissive: '#ff4fa3', emissiveIntensity: 1.1, transparent: true, opacity: 0.85 }), -0.35, 1.15, 0);
    d.m(new THREE.CylinderGeometry(0.05, 0.08, 0.06, 8), black, -0.35, 1.31, 0);
    d.b(0.3, 0.9, 0, 0.35, 0.25, 0.25, mat('#4dd2ff')); // console de jeu
    d.m(rb(0.7, 0.9, 0.04, 0.03), mat('#bfe8ff', { emissive: '#3a3a7a', emissiveIntensity: 0.3 }), 0, 1.75, -0.24);
    k.solidR(-4.5, 16.4, 1.3, 0.5, 0.95, Math.PI / 2);
  }
  // Pouf + skateboard + pancarte « Frappe d'abord »
  {
    const pf = k.mesh(new THREE.SphereGeometry(0.5, 12, 8), mat('#ffcd20'), 1.6, 0.28, 18.4);
    pf.scale.set(1, 0.6, 1);
    k.solidR(1.6, 18.4, 0.8, 0.8, 0.45);
    const sk = k.prop(-2.9, 15.32, 0);
    const deck = sk.m(rb(0.22, 0.8, 0.03, 0.01), mat('#6fcf97'), 0, 0.42, 0.04, -0.12, 0, 0);
    void deck;
    for (const y of [0.15, 0.68]) sk.m(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), mat('#ffcd20'), 0, y, 0.08, 0, 0, Math.PI / 2);
    const knock = plaque(atlas, "NOA — frappe d'abord !", '#ff4fa3', '#1d1640', 512, 112);
    k.decal(atlas.plane(knock, 1.4, 0.3), atlas.mat, 0, 3.0, BZ0 - SKIN - 0.02, Math.PI);
  }
  // Lit (coin nord-est), tête contre le mur nord
  const bedX = 3.5;
  const bedZ = 22.9;
  {
    const b = k.prop(bedX, bedZ, Math.PI);
    b.m(rb(1.5, 0.35, 2.2, 0.08), woodDark, 0, 0.2, 0);
    b.m(rb(1.4, 0.22, 2.1, 0.1), white, 0, 0.48, 0);
    b.m(rb(1.46, 0.12, 1.5, 0.08), mat('#4f74c9'), 0, 0.6, 0.32);
    b.m(rb(1.45, 0.08, 0.35, 0.06), mat('#f7f3ea'), 0, 0.62, -0.45);
    b.m(rb(0.7, 0.18, 0.4, 0.09), white, 0, 0.66, -0.85);
    b.m(rb(1.56, 1.0, 0.1, 0.05), woodDark, 0, 0.5, -1.1);
    b.m(rb(0.4, 0.3, 0.3, 0.1), mat('#8f7ad8'), 0.4, 0.72, 0.6); // peluche/coussin
    k.solidR(bedX, bedZ, 1.56, 2.3, 0.7);
    // Table de chevet + lampe + réveil
    const n = k.prop(bedX - 1.15, 24.0);
    n.b(0, 0, 0, 0.5, 0.55, 0.45, woodDark);
    n.m(new THREE.CylinderGeometry(0.06, 0.1, 0.25, 8), metal, 0, 0.67, 0);
    n.m(new THREE.CylinderGeometry(0.12, 0.17, 0.18, 10, 1, true), mat('#ffe8b0', { emissive: '#ffb35c', emissiveIntensity: 0.9, side: THREE.DoubleSide }), 0, 0.87, 0);
    n.b(0.15, 0.55, 0.1, 0.14, 0.08, 0.06, mat('#e8343a'));
    k.solidR(bedX - 1.15, 24.0, 0.5, 0.45, 0.6);
  }
  // Fenêtre (nuit) au-dessus du bureau / mur nord
  k.window(atlas, night[1], -1.4, 24.5 - SKIN - 0.04, Math.PI, 2.2, 1.5, 1.1);
  // Bureau + écran + PC + chaise gamer
  const deskX = -4.35;
  const deskZ = 19.6;
  let monMat;
  {
    const d = k.prop(deskX, deskZ, Math.PI / 2);
    d.m(rb(1.8, 0.06, 0.8, 0.03), mat('#2b2b3a'), 0, 0.74, 0);
    d.b(-0.85, 0, 0, 0.06, 0.72, 0.75, black);
    d.b(0.85, 0, 0, 0.06, 0.72, 0.75, black);
    d.b(0, 0.74, -0.38, 1.7, 0.02, 0.02, mat('#ff4fa3', { emissive: '#ff4fa3', emissiveIntensity: 1.2 })); // bande LED
    // Écran
    const scrImg = atlas.draw(640, 360, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2a0a5a');
      g.addColorStop(1, '#ff4fa3');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#4dd2ff';
      x.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        x.beginPath();
        x.moveTo(w / 2, h * 0.55);
        x.lineTo((i / 9) * w * 1.6 - w * 0.3, h);
        x.stroke();
      }
      for (let i = 0; i < 5; i++) {
        x.beginPath();
        x.moveTo(0, h * 0.6 + i * i * 6);
        x.lineTo(w, h * 0.6 + i * i * 6);
        x.stroke();
      }
      x.fillStyle = '#ffcd20';
      x.beginPath();
      x.arc(w / 2, h * 0.45, 60, Math.PI, 0);
      x.fill();
      text(x, 'NEON RACERS', w / 2, 80, 64, '#4dd2ff', { stroke: '#1d1640', lw: 10 });
      text(x, 'APPUIE SUR START', w / 2, h - 40, 26, '#ffffff');
    });
    const monTex = atlas.pages[scrImg.page].tex;
    monMat = M({ map: monTex, emissive: '#ffffff', emissiveMap: monTex, emissiveIntensity: 1.0 });
    d.m(rb(1.1, 0.64, 0.05, 0.02), black, 0, 1.25, 0.12);
    const scr = d.m(atlas.plane(scrImg, 1.04, 0.585), monMat, 0, 1.25, 0.148);
    scr.userData.dynamic = true;
    d.b(0, 0.77, 0.12, 0.08, 0.2, 0.08, black);
    d.b(0, 0.77, 0.15, 0.35, 0.02, 0.2, black);
    d.b(0, 0.77, -0.08, 0.6, 0.025, 0.2, mat('#3a2f6b')); // clavier
    d.b(0.45, 0.77, -0.1, 0.08, 0.03, 0.12, mat('#3a2f6b')); // souris
    d.b(-0.62, 0.77, 0.1, 0.22, 0.48, 0.45, mat('#1d1640')); // tour PC
    d.b(-0.62, 0.9, -0.125, 0.18, 0.3, 0.01, mat('#4dd2ff', { emissive: '#4dd2ff', emissiveIntensity: 1.3 }));
    d.m(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), mat('#ffcd20'), 0.6, 0.83, 0.1); // canette
    k.solidR(deskX, deskZ, 1.8, 0.8, 0.8, Math.PI / 2);
    updaters.push((dt, t) => {
      monMat.emissiveIntensity = 0.95 + Math.sin(t * 3) * 0.05 + (Math.sin(t * 17.3) > 0.985 ? -0.5 : 0);
    });
    // Chaise gamer (tournée vers le bureau)
    const c = k.prop(deskX + 0.95, deskZ, -Math.PI / 2);
    c.m(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 5), black, 0, 0.08, 0);
    c.m(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), steel, 0, 0.27, 0);
    c.m(rb(0.55, 0.12, 0.52, 0.05), mat('#1d1640'), 0, 0.5, 0);
    c.m(rb(0.55, 0.85, 0.12, 0.05), mat('#1d1640'), 0, 1.0, -0.26);
    c.b(-0.18, 0.62, -0.33, 0.06, 0.75, 0.03, mat('#ff4fa3'));
    c.b(0.18, 0.62, -0.33, 0.06, 0.75, 0.03, mat('#ff4fa3'));
    c.m(rb(0.3, 0.15, 0.1, 0.05), mat('#ff4fa3'), 0, 1.38, -0.24);
  }
  // Armoire (mur est, côté porte)
  {
    const w = k.prop(4.45, 16.6, -Math.PI / 2);
    w.m(rb(2.0, 2.4, 0.7, 0.06), mat('#c98a4a'), 0, 1.2, 0);
    w.b(0, 0.1, 0.355, 0.02, 2.2, 0.02, woodDark);
    w.b(-0.12, 1.1, 0.37, 0.04, 0.3, 0.04, steel);
    w.b(0.12, 1.1, 0.37, 0.04, 0.3, 0.04, steel);
    w.m(rb(0.6, 0.35, 0.5, 0.1), mat('#e2733f'), 0.4, 2.58, 0); // carton
    k.solidR(4.45, 16.6, 2.0, 0.7, 2.4, -Math.PI / 2);
  }
  // Guitare posée contre le mur ouest
  {
    const g = k.prop(-4.6, 22.6, Math.PI / 2);
    const body = mat('#e8343a');
    g.m(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 14), body, 0, 0.35, 0.05, Math.PI / 2);
    g.m(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 14), body, 0, 0.66, 0.05, Math.PI / 2);
    g.m(new THREE.CylinderGeometry(0.06, 0.06, 0.11, 10), black, 0, 0.5, 0.055, Math.PI / 2);
    g.b(0, 0.7, 0.05, 0.06, 0.7, 0.03, woodDark);
    g.b(0, 1.38, 0.05, 0.1, 0.16, 0.03, black);
    g.rotation.z = 0.12;
    k.solidR(-4.6, 22.6, 0.5, 0.5, 1.5);
  }
  // Tapis rond, étagère murale, linge, ballon
  {
    const rug = k.mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.012, 24), mat('#ff4fa3'), 0.2, 0.006, 19.4);
    void rug;
    k.mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.014, 24), mat('#4dd2ff'), 0.2, 0.008, 19.4);
    k.box(-4.65, 1.8, 17.2, 0.3, 0.04, 1.4, woodDark);
    for (let i = 0; i < 5; i++) k.box(-4.65, 1.84, 16.7 + i * 0.22, 0.2, 0.25 + (i % 2) * 0.06, 0.06, mat(['#4dd2ff', '#ff4fa3', '#ffcd20', '#6fcf97', '#f7f3ea'][i]));
    k.mesh(new THREE.IcosahedronGeometry(0.11, 1), mat('#ffcd20'), -4.6, 1.95, 17.6);
    k.mesh(rb(0.7, 0.2, 0.5, 0.1), mat('#5fb7c9'), 1.4, 0.1, 16.3).rotation.y = 0.5; // linge
    k.mesh(rb(0.4, 0.12, 0.3, 0.06), mat('#e86f6f'), 1.6, 0.25, 16.2).rotation.y = 0.2;
    k.mesh(new THREE.IcosahedronGeometry(0.16, 1), mat('#f7f3ea'), 2.2, 0.16, 17.6); // ballon
    // Sac de cours au pied du lit
    k.mesh(rb(0.45, 0.5, 0.25, 0.1), mat('#7b4ad6'), 1.9, 0.25, 21.0).rotation.y = -0.4;
    // Guirlande lumineuse au-dessus du lit
    for (let i = 0; i < 9; i++) k.mesh(new THREE.SphereGeometry(0.04, 6, 4), mat('#fff', { emissive: ['#ffcd20', '#ff4fa3', '#4dd2ff'][i % 3], emissiveIntensity: 1.6 }), 2.6 + i * 0.25, 2.6 - Math.sin((i / 8) * Math.PI) * 0.25, 24.5 - SKIN - 0.04);
  }
  // Affiches (jeu vidéo + groupes inventés)
  const homePosters = [
    { bg: '#1d1640', title: 'NEON RACERS', sub: 'Saison 3 — Turbo Nuit', art: 'car', accent: '#ff4fa3' },
    { bg: '#ffcd20', fg: '#1d1640', ink: '#1d1640', title: 'VOLT KIDS', sub: 'Tournée 2026 · Vesper Arena', art: 'bolt', accent: '#e8343a' },
    { bg: '#2a4f6b', title: 'MÉDUSE ÉLECTRIQUE', sub: 'nouvel album « Abysse »', art: 'jelly', accent: '#9ff3ff' },
    { bg: '#3a1a6e', title: 'Les Chats de Minuit', sub: 'live au Lumen', art: 'moon', accent: '#ff6fa8' },
  ].map((p) => poster(atlas, p));
  k.decal(atlas.plane(homePosters[0], 1.0, 1.4), atlas.mat, -4.78, 2.3, 21.0, Math.PI / 2);
  k.decal(atlas.plane(homePosters[1], 0.8, 1.12), atlas.mat, 1.6, 2.25, 24.5 - SKIN - 0.02, Math.PI);
  k.decal(atlas.plane(homePosters[2], 0.8, 1.12), atlas.mat, 4.78, 2.3, 20.6, -Math.PI / 2);
  k.decal(atlas.plane(homePosters[3], 0.7, 0.98), atlas.mat, -2.6, 2.3, BZ0 + SKIN + 0.02, 0);

  // ---------- Lumières ----------
  const lights = [];
  const addLight = (color, x, y, z, intensity, dist) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    l.userData.base = intensity;
    group.add(l);
    lights.push(l);
  };
  addLight('#ffd9a0', -3.2, 2.5, 5.0, 4.5, 14); // séjour
  addLight('#a890ff', 0, 2.5, 20.5, 3.5, 12); // chambre (ambiance violette)
  if (quality !== 'low') {
    addLight('#ffe8c0', 3.6, 2.6, 5.0, 4, 12); // cuisine
    addLight('#4dd2ff', -3.4, 1.6, 19.6, 1.5, 6); // lueur de l'écran
  }

  atlas.finish(group);
  const calls = mergeStatic(group);
  const L = (x, z, yaw) => ({ x: O.x + x, z: O.z + z, ...(yaw !== undefined ? { yaw } : {}) });
  return {
    zone: {
      group,
      lights,
      spawn: { x: O.x + doorX, y: 0, z: O.z + 1.6, yaw: 0 },
      exit: { x: O.x + doorX, y: 0, z: O.z + 0.9 },
      bed: L(bedX - 1.35, 21.6, Math.PI / 2), // à côté du lit, tourné vers lui
      bedTop: { x: O.x + bedX, y: 0.62, z: O.z + bedZ - 0.2, yaw: Math.PI }, // allongé : tête au nord
      desk: L(deskX + 1.0, deskZ, -Math.PI / 2), // assis sur la chaise gamer face à l'écran
      fridge: L(FRX - 0.95, FRZ),
      rooms: { living: L(-3.2, 5), kitchen: L(3.6, 5), hall: L(0, 12.5), bedroom: L(0, 19.8) },
      bounds: BOUNDS,
      calls,
    },
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
  };
}

// ===========================================================================
// API publique
// ===========================================================================
export function buildInteriors({ scene, col, quality = 'medium' }) {
  const school = buildSchool(scene, col, quality);
  const home = buildHome(scene, col, quality);
  return {
    zones: { school: school.zone, home: home.zone },
    // Petites animations (seulement utiles quand la zone est visible).
    update(dt, t) {
      if (school.zone.group.visible) school.update(dt, t);
      if (home.zone.group.visible) home.update(dt, t);
    },
  };
}
