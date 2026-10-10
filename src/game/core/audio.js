// Moteur audio entièrement synthétisé (Web Audio) : ambiance de pluie et de vent,
// musique adaptative exploration/combat, effets spatialisés simples.
// Bus séparés : général, musique, effets (réglables dans les paramètres).

export class AudioEngine {
  constructor(settings) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC() : null;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.combat = 0;
    if (!this.ctx) return;
    const c = this.ctx;
    this.master = c.createGain();
    this.music = c.createGain();
    this.sfx = c.createGain();
    this.amb = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.master.connect(this.comp).connect(c.destination);
    this.noiseBuf = this.#noise(2);
    this.applySettings(settings);
  }

  applySettings(s) {
    if (!this.ctx) return;
    this.master.gain.value = s.master;
    this.music.gain.value = s.music * 0.5;
    this.sfx.gain.value = s.sfx;
    this.amb.gain.value = s.sfx * 0.6;
  }

  resume() {
    this.ctx?.resume();
  }

  #noise(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * w; // composante brune pour le grondement
      d[i] = w * 0.6 + b * 2.5;
    }
    return buf;
  }

  #noiseSrc(loop = false) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = loop;
    return n;
  }

  // Volume + panoramique selon la position relative à l'auditeur.
  #spatial(pos, range = 40) {
    const out = this.ctx.createGain();
    if (!pos) {
      out.connect(this.sfx);
      return out;
    }
    const dx = pos.x - this.listener.x;
    const dz = pos.z - this.listener.z;
    const d = Math.hypot(dx, dz);
    out.gain.value = Math.max(0, 1 - d / range) ** 1.5;
    const pan = this.ctx.createStereoPanner?.();
    if (pan) {
      // Projection sur l'axe « droite » de la caméra.
      const rx = Math.cos(this.listener.yaw);
      const rz = -Math.sin(this.listener.yaw);
      pan.pan.value = d > 0.5 ? Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / d) * 0.8)) : 0;
      out.connect(pan).connect(this.sfx);
    } else out.connect(this.sfx);
    return out;
  }

  #env(param, t, a, peak, r) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + r);
  }

  #tone({ type = 'sine', f0, f1, dur, peak = 0.3, attack = 0.005, dest, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.#env(g.gain, t, attack, peak, dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  #burst({ type = 'bandpass', f0, f1, q = 1, dur, peak = 0.3, attack = 0.004, dest, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const n = this.#noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    this.#env(g.gain, t, attack, peak, dur);
    n.connect(f).connect(g).connect(dest || this.sfx);
    n.start(t, Math.random());
    n.stop(t + attack + dur + 0.05);
  }

  // ---------- Ambiance & musique ----------
  startAmbience() {
    if (!this.ctx || this.ambStarted) return;
    this.ambStarted = true;
    const c = this.ctx;
    // Pluie
    const rain = this.#noiseSrc(true);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const rg = c.createGain();
    rg.gain.value = this.rainOn === false ? 0 : 0.12;
    this.rainGain = rg;
    rain.connect(hp).connect(rg).connect(this.amb);
    rain.start();
    // Vent / grondement lointain modulé
    const wind = this.#noiseSrc(true);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const wg = c.createGain();
    wg.gain.value = 0.25;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = c.createGain();
    lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    wind.connect(lp).connect(wg).connect(this.amb);
    wind.start(0, 0.7);

    // Musique d'exploration : nappe sombre (accords lents filtrés).
    this.explore = c.createGain();
    this.explore.gain.value = 1;
    this.explore.connect(this.music);
    const padF = c.createBiquadFilter();
    padF.type = 'lowpass';
    padF.frequency.value = 700;
    padF.connect(this.explore);
    const chords = [[110, 130.8, 164.8], [98, 116.5, 146.8], [87.3, 110, 130.8], [92.5, 110, 138.6]];
    this.padOsc = [0, 1, 2].map((i) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = (i - 1) * 7;
      const g = c.createGain();
      g.gain.value = 0.05;
      o.connect(g).connect(padF);
      o.start();
      return o;
    });
    let ci = 0;
    const nextChord = () => {
      const t = c.currentTime;
      chords[ci % chords.length].forEach((f, i) => this.padOsc[i].frequency.setTargetAtTime(f, t, 1.2));
      ci++;
    };
    nextChord();
    this.chordTimer = setInterval(nextChord, 8000);

    // Couche combat : basse pulsée + percussions, gain piloté par this.combat.
    this.combatBus = c.createGain();
    this.combatBus.gain.value = 0;
    this.combatBus.connect(this.music);
    this.beat = 0;
    this.beatTimer = setInterval(() => this.#combatBeat(), 60000 / 132 / 2);
  }

  #combatBeat() {
    if (!this.ctx || this.combat < 0.02) {
      this.beat++;
      return;
    }
    const step = this.beat++ % 16;
    const d = this.combatBus;
    if (step % 4 === 0) this.#tone({ f0: 120, f1: 40, dur: 0.25, peak: 0.6, dest: d });
    if (step % 8 === 4) this.#burst({ f0: 1800, q: 0.7, dur: 0.12, peak: 0.25, dest: d });
    if (step % 2 === 1) this.#burst({ type: 'highpass', f0: 7000, dur: 0.03, peak: 0.08, dest: d });
    const bass = [55, 55, 65.4, 55, 49, 49, 58.3, 61.7][Math.floor(step / 2)];
    this.#tone({ type: 'sawtooth', f0: bass, dur: 0.18, peak: 0.12, dest: d });
  }

  setCombat(level, dt) {
    if (!this.ctx || !this.combatBus) return;
    this.combat += (level - this.combat) * Math.min(1, dt * (level > this.combat ? 3 : 0.6));
    this.combatBus.gain.value = this.combat;
    this.explore.gain.value = 1 - this.combat * 0.7;
  }

  // ---------- Effets ----------
  step(pos, sprint) {
    if (!this.ctx) return;
    this.#burst({ type: 'lowpass', f0: sprint ? 900 : 600, dur: 0.07, peak: sprint ? 0.18 : 0.1, dest: this.#spatial(pos, 25) });
  }

  swing(heavy) {
    if (!this.ctx) return;
    this.#burst({ f0: heavy ? 600 : 1400, f1: heavy ? 200 : 500, q: 2, dur: heavy ? 0.22 : 0.12, peak: 0.22 });
  }

  hit(pos, heavy) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 30);
    this.#tone({ f0: heavy ? 160 : 220, f1: 50, dur: heavy ? 0.25 : 0.14, peak: heavy ? 0.7 : 0.45, dest });
    this.#burst({ type: 'lowpass', f0: 2500, f1: 300, dur: 0.12, peak: 0.4, dest });
  }

  voidStrike() {
    if (!this.ctx) return;
    this.#tone({ type: 'sawtooth', f0: 90, f1: 30, dur: 0.7, peak: 0.6 });
    this.#tone({ f0: 900, f1: 120, dur: 0.4, peak: 0.25 });
    this.#burst({ type: 'lowpass', f0: 4000, f1: 100, dur: 0.8, peak: 0.6 });
  }

  powerCharge() {
    if (!this.ctx) return;
    this.#tone({ type: 'triangle', f0: 200, f1: 700, dur: 0.25, peak: 0.12 });
  }

  dodge() {
    if (!this.ctx) return;
    this.#burst({ f0: 3000, f1: 600, q: 3, dur: 0.18, peak: 0.18 });
  }

  hurt() {
    if (!this.ctx) return;
    this.#tone({ type: 'square', f0: 160, f1: 70, dur: 0.18, peak: 0.15 });
    this.#burst({ type: 'lowpass', f0: 1500, dur: 0.15, peak: 0.3 });
  }

  stalkerHiss(pos) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 35);
    this.#burst({ f0: 3500, f1: 5200, q: 6, dur: 0.6, peak: 0.25, attack: 0.15, dest });
    this.#tone({ type: 'sawtooth', f0: 340, f1: 290, dur: 0.5, peak: 0.05, attack: 0.1, dest });
  }

  stalkerClick(pos) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 25);
    for (let i = 0; i < 3; i++) this.#burst({ f0: 2500, q: 10, dur: 0.02, peak: 0.25, dest, delay: i * 0.07 });
  }

  bruteRoar(pos) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 50);
    this.#tone({ type: 'sawtooth', f0: 70, f1: 45, dur: 1.1, peak: 0.45, attack: 0.15, dest });
    this.#tone({ type: 'sawtooth', f0: 104, f1: 70, dur: 1.0, peak: 0.25, attack: 0.15, dest });
    this.#burst({ type: 'lowpass', f0: 700, dur: 1.0, peak: 0.4, attack: 0.2, dest });
  }

  bruteSlam(pos) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 60);
    this.#tone({ f0: 80, f1: 25, dur: 0.9, peak: 0.9, dest });
    this.#burst({ type: 'lowpass', f0: 1200, f1: 80, dur: 0.9, peak: 0.7, dest });
  }

  telegraph(pos) {
    if (!this.ctx) return;
    this.#tone({ type: 'square', f0: 880, dur: 0.08, peak: 0.08, dest: this.#spatial(pos, 30) });
  }

  enemyDie(pos, big) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 40);
    this.#tone({ type: 'sawtooth', f0: big ? 120 : 400, f1: big ? 30 : 80, dur: big ? 1.2 : 0.5, peak: 0.3, dest });
    this.#burst({ type: 'lowpass', f0: 1500, f1: 100, dur: 0.6, peak: 0.3, dest });
  }

  crateOpen(rare) {
    if (!this.ctx) return;
    this.#burst({ type: 'lowpass', f0: 900, dur: 0.15, peak: 0.3 });
    const notes = rare ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((f, i) => this.#tone({ type: 'triangle', f0: f, dur: 0.5, peak: 0.12, delay: 0.15 + i * 0.08 }));
  }

  pickup() {
    if (!this.ctx) return;
    this.#tone({ type: 'triangle', f0: 880, f1: 1320, dur: 0.12, peak: 0.1 });
  }

  levelUp() {
    if (!this.ctx) return;
    [392, 523, 659, 784, 1047].forEach((f, i) => this.#tone({ type: 'triangle', f0: f, dur: 0.6, peak: 0.12, delay: i * 0.09 }));
  }

  setRain(on) {
    this.rainOn = on;
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 1.5);
  }

  startRain() {
    this.setRain(true);
  }

  takeoff() {
    if (!this.ctx) return;
    this.#burst({ type: 'lowpass', f0: 300, f1: 2400, dur: 0.5, peak: 0.45 });
    this.#tone({ type: 'sine', f0: 180, f1: 720, dur: 0.45, peak: 0.18 });
  }

  boost() {
    if (!this.ctx) return;
    this.#tone({ f0: 90, f1: 35, dur: 0.6, peak: 0.6 });
    this.#burst({ f0: 5000, f1: 800, q: 0.8, dur: 0.5, peak: 0.35 });
  }

  // Souffle continu du vol (appelé chaque image) : intensité 0..1
  wind(level) {
    if (!this.ctx) return;
    if (!this.windSrc) {
      this.windSrc = this.#noiseSrc(true);
      this.windF = this.ctx.createBiquadFilter();
      this.windF.type = 'bandpass';
      this.windF.Q.value = 0.8;
      this.windG = this.ctx.createGain();
      this.windG.gain.value = 0;
      this.windSrc.connect(this.windF).connect(this.windG).connect(this.sfx);
      this.windSrc.start();
    }
    const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime(level * 0.35, t, 0.15);
    this.windF.frequency.setTargetAtTime(400 + level * 1800, t, 0.15);
  }

  shield() {
    if (!this.ctx) return;
    this.#tone({ type: 'triangle', f0: 600, f1: 1200, dur: 0.15, peak: 0.12 });
  }

  parry() {
    if (!this.ctx) return;
    this.#tone({ type: 'triangle', f0: 1760, dur: 0.5, peak: 0.25 });
    this.#tone({ type: 'triangle', f0: 2637, dur: 0.4, peak: 0.12, delay: 0.03 });
    this.#burst({ type: 'highpass', f0: 3000, dur: 0.1, peak: 0.3 });
  }

  block() {
    if (!this.ctx) return;
    this.#tone({ type: 'square', f0: 300, f1: 150, dur: 0.12, peak: 0.15 });
  }

  // Cinématiques
  rumble(dur = 4) {
    if (!this.ctx) return;
    this.#tone({ type: 'sawtooth', f0: 38, f1: 30, dur, peak: 0.5, attack: 0.8 });
    this.#burst({ type: 'lowpass', f0: 200, dur, peak: 0.6, attack: 0.6 });
  }

  blackout() {
    if (!this.ctx) return;
    this.#tone({ type: 'square', f0: 120, f1: 30, dur: 0.6, peak: 0.25 });
    this.#burst({ type: 'highpass', f0: 4000, dur: 0.08, peak: 0.4 });
  }

  awaken() {
    if (!this.ctx) return;
    [220, 330, 440, 660, 880].forEach((f, i) => this.#tone({ type: 'triangle', f0: f, dur: 2.5, peak: 0.08, attack: 0.6, delay: i * 0.35 }));
    this.#tone({ type: 'sawtooth', f0: 55, f1: 110, dur: 3.5, peak: 0.25, attack: 1 });
  }

  honk(pos) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 45);
    for (const f of [392, 494]) this.#tone({ type: 'square', f0: f, dur: 0.35, peak: 0.08, attack: 0.02, dest });
  }

  phoneBuzz() {
    if (!this.ctx) return;
    for (let i = 0; i < 2; i++) this.#tone({ type: 'square', f0: 180, dur: 0.12, peak: 0.08, delay: i * 0.18 });
  }

  ui() {
    if (!this.ctx) return;
    this.#tone({ f0: 1200, dur: 0.04, peak: 0.06 });
  }

  denied() {
    if (!this.ctx) return;
    this.#tone({ type: 'square', f0: 180, dur: 0.12, peak: 0.08 });
  }
  // ---------- Magnétisme ----------
  // Grincement métallique quand un objet est arraché du sol.
  magnetGrab(pos) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 50);
    this.#tone({ type: 'sawtooth', f0: 70, f1: 140, dur: 0.6, peak: 0.25, attack: 0.05, dest });
    this.#burst({ type: 'bandpass', f0: 900, f1: 2400, q: 6, dur: 0.5, peak: 0.25, dest });
    this.#tone({ type: 'triangle', f0: 440, f1: 880, dur: 0.4, peak: 0.06, delay: 0.1 });
  }

  // Bourdonnement pendant la lévitation (appelé chaque image : 0 = arrêt).
  magnetHum(level) {
    if (!this.ctx) return;
    if (!this.humO) {
      this.humO = this.ctx.createOscillator();
      this.humO.type = 'sawtooth';
      this.humO.frequency.value = 55;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400;
      this.humG = this.ctx.createGain();
      this.humG.gain.value = 0;
      this.humO.connect(f).connect(this.humG).connect(this.sfx);
      this.humO.start();
    }
    const t = this.ctx.currentTime;
    this.humG.gain.setTargetAtTime(level * 0.12, t, 0.1);
    this.humO.frequency.setTargetAtTime(55 + level * 25, t, 0.2);
  }

  magnetThrow() {
    if (!this.ctx) return;
    this.#burst({ type: 'lowpass', f0: 2600, f1: 300, dur: 0.45, peak: 0.45 });
    this.#tone({ f0: 220, f1: 60, dur: 0.4, peak: 0.3 });
  }

  // Impact lourd d'un objet métallique (voiture qui retombe).
  crash(pos) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 70);
    this.#tone({ f0: 80, f1: 28, dur: 0.7, peak: 0.8, dest });
    this.#burst({ type: 'bandpass', f0: 2200, f1: 600, q: 2, dur: 0.6, peak: 0.6, dest });
    this.#burst({ type: 'highpass', f0: 5000, dur: 0.35, peak: 0.3, dest, delay: 0.05 });
  }

  // ---------- Forme Abysse ----------
  transform() {
    if (!this.ctx) return;
    this.#burst({ type: 'lowpass', f0: 180, f1: 900, dur: 1.2, peak: 0.6, attack: 0.3 });
    this.#tone({ type: 'sawtooth', f0: 45, f1: 90, dur: 1.4, peak: 0.35, attack: 0.4 });
    this.#tone({ type: 'square', f0: 110, f1: 55, dur: 0.6, peak: 0.15, delay: 1.0 });
  }

  roar(pos) {
    if (!this.ctx) return;
    const dest = this.#spatial(pos, 60);
    this.#tone({ type: 'sawtooth', f0: 95, f1: 60, dur: 1.0, peak: 0.5, attack: 0.05, dest });
    this.#burst({ type: 'bandpass', f0: 420, f1: 260, q: 1.5, dur: 1.0, peak: 0.7, dest });
  }

  revert() {
    if (!this.ctx) return;
    this.#burst({ type: 'lowpass', f0: 900, f1: 150, dur: 0.8, peak: 0.35 });
  }

  // ---------- Vie quotidienne ----------
  schoolBell() {
    if (!this.ctx) return;
    for (let i = 0; i < 6; i++) this.#tone({ type: 'triangle', f0: i % 2 ? 1046 : 880, dur: 0.22, peak: 0.07, delay: i * 0.25 });
  }

  door() {
    if (!this.ctx) return;
    this.#burst({ type: 'bandpass', f0: 500, f1: 300, q: 2, dur: 0.25, peak: 0.25 });
    this.#tone({ type: 'square', f0: 140, f1: 90, dur: 0.1, peak: 0.06, delay: 0.2 });
  }

  // Petit « bip » de dialogue (choix, bulle).
  blip(pitch = 1) {
    if (!this.ctx) return;
    this.#tone({ type: 'triangle', f0: 660 * pitch, f1: 880 * pitch, dur: 0.06, peak: 0.05 });
  }

  // Jingle doux (relation qui progresse, rendez-vous réussi).
  heart() {
    if (!this.ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => this.#tone({ type: 'sine', f0: f, dur: 0.5, peak: 0.08, attack: 0.02, delay: i * 0.12 }));
  }
}
