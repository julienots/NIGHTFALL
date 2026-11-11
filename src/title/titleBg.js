// Fond animé de l'écran titre (canvas 2D, léger) : ciel nocturne en dégradé,
// lune fendue par la faille, silhouettes de Vesper en parallaxe avec fenêtres
// qui s'allument, braises abyssales qui montent, anneaux magnétiques en orbite.
export function startTitleBackground(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let mx = 0;
  let my = 0;
  const rnd = mulberry(7);

  // Trois rangées d'immeubles (loin → près), générées une fois.
  const layers = [0.25, 0.5, 0.85].map((depth, li) => {
    const list = [];
    let x = -0.1;
    while (x < 1.2) {
      const bw = 0.03 + rnd() * 0.06 * (1 + li * 0.4);
      const bh = 0.12 + rnd() * (0.28 - li * 0.06) + (rnd() < 0.08 ? 0.18 : 0);
      const wins = [];
      for (let i = 0; i < 40; i++) wins.push({ u: rnd(), v: rnd(), on: rnd() < 0.35, t: rnd() * 10 });
      list.push({ x, w: bw, h: bh, antenna: rnd() < 0.25, wins, roof: rnd() < 0.3 ? 'slope' : 'flat' });
      x += bw + rnd() * 0.012;
    }
    return { depth, list, color: ['#3a1f73', '#25124f', '#120728'][li] };
  });
  const embers = Array.from({ length: 90 }, () => ({ x: rnd(), y: rnd(), s: 0.5 + rnd() * 2.2, v: 0.02 + rnd() * 0.06, p: rnd() * 6, c: rnd() < 0.6 ? '#7a5cff' : rnd() < 0.5 ? '#5fe3ff' : '#ffcd20' }));
  const stars = Array.from({ length: 140 }, () => ({ x: rnd(), y: rnd() * 0.6, s: rnd() * 1.4 + 0.2, p: rnd() * 6 }));

  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth || innerWidth;
    h = canvas.clientHeight || innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  };
  const onMove = (e) => {
    mx = (e.clientX / w - 0.5) * 2;
    my = (e.clientY / h - 0.5) * 2;
  };
  addEventListener('resize', resize);
  addEventListener('pointermove', onMove);
  resize();

  const t0 = performance.now();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const t = (performance.now() - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Ciel
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#07031a');
    g.addColorStop(0.45, '#2a1066');
    g.addColorStop(0.78, '#8a2f9a');
    g.addColorStop(1, '#ff6fa8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Étoiles scintillantes
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + s.p));
      ctx.fillStyle = '#e8e0ff';
      ctx.fillRect(s.x * w - mx * 4, s.y * h - my * 3, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    // Lune + halo + faille
    const R = Math.min(w, h) * 0.17;
    const cx = w * 0.72 - mx * 10;
    const cy = h * 0.3 - my * 6;
    const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 3.2);
    halo.addColorStop(0, 'rgba(190,160,255,.55)');
    halo.addColorStop(1, 'rgba(190,160,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    const mg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    mg.addColorStop(0, '#fbf6ff');
    mg.addColorStop(1, '#bfa8ff');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,90,200,.25)';
    for (const [a, b, r] of [[-0.3, 0.2, 0.18], [0.35, -0.25, 0.12], [0.1, 0.45, 0.1]]) {
      ctx.beginPath();
      ctx.arc(cx + a * R, cy + b * R, r * R, 0, Math.PI * 2);
      ctx.fill();
    }
    // Faille : zigzag lumineux qui pulse à travers la lune
    const pulse = 0.6 + 0.4 * Math.sin(t * 2.2);
    ctx.save();
    ctx.shadowColor = '#5fe3ff';
    ctx.shadowBlur = 24 * pulse;
    ctx.strokeStyle = `rgba(160,240,255,${0.7 + 0.3 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const pts = [[-1.4, -1.1], [-0.5, -0.35], [-0.65, -0.05], [0.1, 0.25], [-0.05, 0.5], [0.7, 1.2]];
    pts.forEach(([a, b], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, cx + a * R, cy + b * R));
    ctx.stroke();
    ctx.restore();
    // Rayon de la faille vers le sol (comme dans le jeu)
    const beam = ctx.createLinearGradient(cx, 0, cx, h);
    beam.addColorStop(0, 'rgba(160,110,255,0)');
    beam.addColorStop(0.5, `rgba(160,110,255,${0.18 * pulse})`);
    beam.addColorStop(1, 'rgba(160,110,255,.05)');
    ctx.fillStyle = beam;
    ctx.fillRect(cx - R * 0.12, cy, R * 0.24, h);

    // Immeubles en parallaxe
    for (const L of layers) {
      const off = -mx * 30 * L.depth + Math.sin(t * 0.05) * 8 * L.depth;
      const base = h * (0.98 - (1 - L.depth) * 0.08) - my * 8 * L.depth;
      for (const b of L.list) {
        const bx = b.x * w + off;
        const bw = b.w * w;
        const bh = b.h * h * (0.7 + L.depth * 0.6);
        ctx.fillStyle = L.color;
        ctx.beginPath();
        ctx.moveTo(bx, base);
        ctx.lineTo(bx, base - bh);
        if (b.roof === 'slope') ctx.lineTo(bx + bw * 0.5, base - bh - bw * 0.35);
        ctx.lineTo(bx + bw, base - bh);
        ctx.lineTo(bx + bw, base);
        ctx.fill();
        // Liseré lumineux côté lune
        ctx.fillStyle = `rgba(200,170,255,${0.12 + L.depth * 0.1})`;
        ctx.fillRect(bx + bw - 2, base - bh, 2, bh);
        if (b.antenna) {
          ctx.fillRect(bx + bw * 0.5, base - bh - 22 * L.depth, 2, 22 * L.depth);
          if (Math.sin(t * 3 + b.x * 40) > 0.2) {
            ctx.fillStyle = '#ff3b4a';
            ctx.beginPath();
            ctx.arc(bx + bw * 0.5 + 1, base - bh - 22 * L.depth, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (L.depth > 0.4) {
          for (const wi of b.wins) {
            const lit = wi.on !== Math.sin(t * 0.3 + wi.t) > 0.97;
            if (!lit) continue;
            ctx.fillStyle = wi.t > 5 ? 'rgba(255,226,122,.85)' : 'rgba(159,243,255,.8)';
            ctx.fillRect(bx + 3 + wi.u * (bw - 8), base - bh + 6 + wi.v * (bh - 14), 3 * L.depth + 1, 4 * L.depth + 1);
          }
        }
      }
    }
    // Brume au sol
    const fog = ctx.createLinearGradient(0, h * 0.75, 0, h);
    fog.addColorStop(0, 'rgba(60,20,110,0)');
    fog.addColorStop(1, 'rgba(20,6,45,.9)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, h * 0.75, w, h * 0.25);

    // Braises abyssales
    ctx.globalCompositeOperation = 'lighter';
    for (const e of embers) {
      e.y -= e.v * 0.016;
      if (e.y < -0.05) {
        e.y = 1.05;
        e.x = Math.random();
      }
      const x = (e.x + Math.sin(t * 0.8 + e.p) * 0.01) * w - mx * 15;
      const y = e.y * h;
      ctx.globalAlpha = Math.min(1, e.y * 1.5) * (0.5 + 0.5 * Math.sin(t * 3 + e.p));
      ctx.fillStyle = e.c;
      ctx.beginPath();
      ctx.arc(x, y, e.s, 0, Math.PI * 2);
      ctx.fill();
    }
    // Anneaux magnétiques qui tournent autour du logo
    const ox = w * 0.5;
    const oy = h * 0.26;
    for (let i = 0; i < 10; i++) {
      const a = t * 0.9 + (i / 10) * Math.PI * 2;
      const rx = Math.min(w * 0.42, 560);
      const x = ox + Math.cos(a) * rx;
      const y = oy + Math.sin(a) * rx * 0.16;
      const front = Math.sin(a) > 0;
      ctx.globalAlpha = front ? 0.9 : 0.35;
      ctx.strokeStyle = '#7fe3ff';
      ctx.lineWidth = front ? 3 : 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 9, 4, a * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Vignette
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(5,0,15,.75)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  };
  frame();
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    removeEventListener('pointermove', onMove);
  };
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
