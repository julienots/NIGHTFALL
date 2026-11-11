// Minicarte (HUD) et carte du monde (touche M).
// Le fond est « cuit » une seule fois depuis les boîtes de collision de la
// ville (vue de dessus : immeubles, petites constructions, eau), puis chaque
// image n'affiche qu'un recadrage tourné autour de Noa, avec les marqueurs :
// objectif, créatures, caisses, failles, amis.
const HALF = 300; // la ville couvre [-300, 300] en X et en Z
const RES = 2; // pixels par mètre de la texture cuite
// Noms affichés des quartiers (identifiants internes → français).
export const DISTRICT_LABELS = {
  campus: 'Lycée Vesper-Nord', stade: 'Stade', parc: 'Parc Vesper', parc_sud: 'Parc Sud', industrie: 'Zone industrielle',
  nord: 'Quartier Nord', aegis: 'Tour Aegis', affaires: 'Quartier d’affaires', foret: 'Forêt de Blackwood', port: 'Port',
  est: 'Faubourg Est', sud: 'Faubourg Sud', routes: 'Centre-ville', tilleuls_ouest: 'Les Tilleuls (ouest)',
  tilleuls_vant: 'Les Tilleuls', tilleuls_est: 'Les Tilleuls (est)',
};
const label = (n) => DISTRICT_LABELS[n] || n;

export class Minimap {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.range = 70; // rayon visible (m)
    this.t = 0;
    this.base = this.#bake();
  }

  #bake() {
    const size = HALF * 2 * RES;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    // Sol : asphalte nocturne + légère trame
    x.fillStyle = '#251450';
    x.fillRect(0, 0, size, size);
    x.strokeStyle = 'rgba(160,120,255,.07)';
    x.lineWidth = 1;
    for (let i = 0; i < size; i += 20 * RES) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, size); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(size, i); x.stroke();
    }
    const P = (v) => (v + HALF) * RES;
    // Quartiers : teinte légère par zone
    const tints = ['#3a1f73', '#2a2a6a', '#24305a', '#3a2460', '#203a4a', '#2e2058'];
    (this.game.districts?.districts || []).forEach((d, i) => {
      const [x0, z0, x1, z1] = d.bounds;
      x.fillStyle = tints[i % tints.length];
      x.globalAlpha = 0.55;
      x.fillRect(P(x0), P(z0), (x1 - x0) * RES, (z1 - z0) * RES);
      x.globalAlpha = 1;
    });
    // Boîtes de collision triées par hauteur (les hautes par-dessus)
    const boxes = this.game.col.boxes
      .filter((b) => b.tag !== 'bounds' && b.min.x > -HALF && b.max.x < HALF && b.min.z > -HALF && b.max.z < HALF && b.max.y - b.min.y > 0.6 && b.min.y < 3)
      .sort((a, b) => a.max.y - b.max.y);
    for (const b of boxes) {
      const w = (b.max.x - b.min.x) * RES;
      const h = (b.max.z - b.min.z) * RES;
      if (w * h < 2) continue;
      const hgt = b.max.y;
      if (b.tag === 'water') x.fillStyle = '#2a6fd6';
      else if (hgt > 18) x.fillStyle = '#8a6ae0';
      else if (hgt > 7) x.fillStyle = '#6a4fc0';
      else if (hgt > 2.5) x.fillStyle = '#4a3690';
      else continue; // mobilier urbain : ignoré
      x.fillRect(P(b.min.x), P(b.min.z), w, h);
      if (hgt > 7 && b.tag !== 'water') {
        // Liseré lumineux (style néon)
        x.strokeStyle = hgt > 18 ? '#c9b0ff' : '#9a80f0';
        x.lineWidth = 1;
        x.strokeRect(P(b.min.x) + 0.5, P(b.min.z) + 0.5, w - 1, h - 1);
      }
    }
    return c;
  }

  // Transforme un décalage monde (dx, dz) en coordonnées écran centrées.
  #toScreen(dx, dz, yaw, S) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [(-c * dx + s * dz) * S, -(s * dx + c * dz) * S];
  }

  #markers() {
    const g = this.game;
    const list = [];
    for (const e of g.enemies) {
      if (!e.alive || !e.model?.root?.visible) continue;
      list.push({ x: e.pos.x, z: e.pos.z, kind: e.isBoss || e === g.boss ? 'boss' : e.elite ? 'elite' : 'enemy', alert: e.alert });
    }
    for (const c of g.crates || []) {
      if (c.state === 'opened' || g.opened?.has(c.def.id) || g.crateHidden?.(c)) continue;
      const p = c.def;
      list.push({ x: p.x, z: p.z, kind: 'crate' });
    }
    for (const r of g.rifts?.active || []) list.push({ x: r.pos.x, z: r.pos.z, kind: 'rift' });
    for (const f of Object.values(g.social?.friends || {})) {
      if (f?.pos && f.model?.root?.visible && f.mode !== 'gone' && g.zone === 'city') list.push({ x: f.pos.x, z: f.pos.z, kind: 'friend' });
    }
    return list;
  }

  // Minicarte du HUD (appelée environ 15 fois par seconde).
  draw(dt, camYaw, objPos) {
    const g = this.game;
    this.t += dt;
    const cv = this.canvas;
    const x = this.ctx;
    const W = cv.width;
    const cx = W / 2;
    const S = (W / 2) / this.range;
    const h = g.hero.pos;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#12062e';
    x.fillRect(0, 0, W, W);
    if (g.zone !== 'city') {
      // Intérieur : pas de carte, juste un motif et le nom du lieu.
      x.fillStyle = '#2a1460';
      for (let i = 0; i < 12; i++) x.fillRect(0, i * 30 + ((this.t * 20) % 30), W, 10);
      this.#arrow(x, cx, cx, 0);
      return;
    }
    const c = Math.cos(camYaw);
    const s = Math.sin(camYaw);
    const k = S / RES;
    // Fond tourné : voir #toScreen ; image (px, pz) = ((wx+HALF)·RES, (wz+HALF)·RES)
    const a = -c * k, b = -s * k, cc = s * k, d = -c * k;
    const ox = (h.x + HALF) * RES;
    const oz = (h.z + HALF) * RES;
    x.setTransform(a, b, cc, d, cx - (a * ox + cc * oz), cx - (b * ox + d * oz));
    x.imageSmoothingEnabled = true;
    x.drawImage(this.base, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0);
    // Cercles de distance
    x.strokeStyle = 'rgba(95,227,255,.12)';
    x.lineWidth = 2;
    for (const r of [0.33, 0.66]) {
      x.beginPath(); x.arc(cx, cx, cx * r, 0, Math.PI * 2); x.stroke();
    }
    // Marqueurs
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    for (const m of this.#markers()) {
      const [sx, sy] = this.#toScreen(m.x - h.x, m.z - h.z, camYaw, S);
      const dd = Math.hypot(sx, sy);
      if (dd > cx - 6) continue;
      const px = cx + sx;
      const py = cx + sy;
      if (m.kind === 'crate') {
        x.fillStyle = '#ffcd20';
        x.fillRect(px - 5, py - 5, 10, 10);
        x.strokeStyle = '#12062e'; x.lineWidth = 2; x.strokeRect(px - 5, py - 5, 10, 10);
      } else if (m.kind === 'rift') {
        x.fillStyle = `rgba(160,96,255,${0.3 + pulse * 0.4})`;
        x.beginPath(); x.arc(px, py, 14 + pulse * 6, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#e0d0ff';
        x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill();
      } else if (m.kind === 'friend') {
        x.fillStyle = '#ff9cf0';
        x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill();
      } else {
        const r = m.kind === 'boss' ? 11 : m.kind === 'elite' ? 8 : 6;
        x.fillStyle = m.kind === 'elite' ? '#ffb020' : '#ff3b5c';
        if (m.alert) { x.shadowColor = '#ff3b5c'; x.shadowBlur = 12; }
        x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
        x.shadowBlur = 0;
        x.strokeStyle = '#12062e'; x.lineWidth = 2; x.stroke();
      }
    }
    // Objectif : losange (ou flèche au bord si hors champ)
    if (objPos) {
      let [sx, sy] = this.#toScreen(objPos.x - h.x, objPos.z - h.z, camYaw, S);
      const dd = Math.hypot(sx, sy);
      const edge = cx - 16;
      const out = dd > edge;
      if (out) { sx *= edge / dd; sy *= edge / dd; }
      x.save();
      x.translate(cx + sx, cx + sy);
      if (out) x.rotate(Math.atan2(sy, sx) + Math.PI / 4);
      else x.rotate(Math.PI / 4);
      x.shadowColor = '#ffcd20';
      x.shadowBlur = 14;
      x.fillStyle = '#ffcd20';
      const r = out ? 9 : 10 + pulse * 2;
      x.fillRect(-r, -r, r * 2, r * 2);
      x.shadowBlur = 0;
      x.strokeStyle = '#12062e'; x.lineWidth = 3; x.strokeRect(-r, -r, r * 2, r * 2);
      x.restore();
    }
    this.#arrow(x, cx, cx, 0);
  }

  // Flèche du joueur (toujours vers le haut : carte orientée caméra).
  #arrow(x, px, py, rot) {
    x.save();
    x.translate(px, py);
    x.rotate(rot);
    x.shadowColor = '#5fe3ff';
    x.shadowBlur = 16;
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.moveTo(0, -16); x.lineTo(12, 13); x.lineTo(0, 6); x.lineTo(-12, 13); x.closePath();
    x.fill();
    x.shadowBlur = 0;
    x.strokeStyle = '#12062e'; x.lineWidth = 3; x.stroke();
    x.restore();
  }

  // Nom du quartier où se trouve Noa.
  zoneName() {
    const g = this.game;
    if (g.zone !== 'city') return g.zone === 'school' ? 'Lycée Vesper-Nord' : g.zone === 'home' ? 'Maison de Noa' : g.zone;
    const p = g.hero.pos;
    for (const d of g.districts?.districts || []) {
      const [x0, z0, x1, z1] = d.bounds;
      if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1 && d.name !== 'routes') return label(d.name);
    }
    return Math.abs(p.x) < 80 && Math.abs(p.z) < 80 ? 'Centre-ville' : 'Vesper';
  }

  // Carte du monde plein écran (nord en haut).
  drawWorld(canvas) {
    const g = this.game;
    const x = canvas.getContext('2d');
    const W = canvas.width;
    const S = W / (HALF * 2);
    const P = (v) => (v + HALF) * S;
    x.setTransform(1, 0, 0, 1, 0, 0);
    // La texture est déjà orientée nord (-Z) en haut et est (+X) à droite.
    x.fillStyle = '#12062e';
    x.fillRect(0, 0, W, W);
    x.drawImage(this.base, 0, 0, W, W);
    const map = (wx, wz) => [P(wx), P(wz)];
    // Noms des quartiers
    x.textAlign = 'center';
    x.font = `${Math.round(W / 42)}px "Lilita One", sans-serif`;
    for (const d of g.districts?.districts || []) {
      if (d.name === 'routes' || d.name === 'tilleuls_ouest' || d.name === 'tilleuls_est') continue;
      const [x0, z0, x1, z1] = d.bounds;
      const [px, py] = map((x0 + x1) / 2, (z0 + z1) / 2);
      x.lineWidth = 5;
      x.strokeStyle = '#12062e';
      x.strokeText(label(d.name), px, py);
      x.fillStyle = '#e8e0ff';
      x.fillText(label(d.name), px, py);
    }
    // Points cardinaux
    x.font = `${Math.round(W / 30)}px "Lilita One", sans-serif`;
    x.fillStyle = '#ffcd20';
    for (const [t, px, py] of [['N', W / 2, W * 0.04], ['S', W / 2, W * 0.98], ['O', W * 0.03, W / 2], ['E', W * 0.97, W / 2]]) {
      x.strokeText(t, px, py);
      x.fillText(t, px, py);
    }
    for (const m of this.#markers()) {
      const [px, py] = map(m.x, m.z);
      x.fillStyle = { crate: '#ffcd20', rift: '#a060ff', friend: '#ff9cf0', elite: '#ffb020', boss: '#ff3b5c' }[m.kind] || '#ff3b5c';
      x.beginPath(); x.arc(px, py, m.kind === 'rift' ? 9 : 5, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#12062e'; x.lineWidth = 2; x.stroke();
    }
    const obj = g.objectivePosPublic?.();
    if (obj) {
      const [px, py] = map(obj.x, obj.z);
      x.save(); x.translate(px, py); x.rotate(Math.PI / 4);
      x.fillStyle = '#ffcd20'; x.shadowColor = '#ffcd20'; x.shadowBlur = 16;
      x.fillRect(-9, -9, 18, 18); x.restore();
    }
    if (g.zone === 'city') {
      const [px, py] = map(g.hero.pos.x, g.hero.pos.z);
      // Monde → carte retournée : la direction (sin yaw, cos yaw) devient (-sin, -cos).
      this.#arrow(x, px, py, Math.PI - g.hero.yaw);
    }
  }
}
