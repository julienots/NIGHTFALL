// Sons de l'intro générés en Web Audio (aucun fichier audio requis).
export class IntroSfx {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC() : null;
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.noise = this.#makeNoise();
  }

  resume() {
    this.ctx?.resume?.();
  }

  #makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  #env(gain, t, attack, peak, release) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  drone() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.18, t + 1.5);
    out.gain.setValueAtTime(0.18, t + 4.5);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 6.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 3);
    lp.connect(out).connect(this.master);
    for (const [f, type] of [[55, 'sawtooth'], [55.4, 'sawtooth'], [82.4, 'triangle']]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 6.5);
    }
    this.droneOut = out;
  }

  pop(bright) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    const f = bright ? 520 : 330;
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    this.#env(g, t, 0.005, bright ? 0.22 : 0.18, 0.16);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  impact() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Grave « boum »
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    this.#env(g, t, 0.004, 0.9, 0.8);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1);
    // Souffle filtré
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(3000, t);
    bp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    const ng = this.ctx.createGain();
    this.#env(ng, t, 0.003, 0.35, 0.6);
    n.connect(bp).connect(ng).connect(this.master);
    n.start(t);
    n.stop(t + 0.8);
  }

  shimmer() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [1318.5, 1760, 2637].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      this.#env(g, t + i * 0.07, 0.02, 0.06, 0.9);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.07);
      o.stop(t + i * 0.07 + 1.1);
    });
  }

  fadeOut() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.6);
  }
}
