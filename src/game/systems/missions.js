// Suivi des missions : progression par étapes, pilotée par des événements
// (kill, interact) et par la position du joueur (reach).
import { MISSIONS } from '../data/missions.js';

export class MissionLog {
  constructor(data, defs = MISSIONS) {
    this.defs = defs;
    this.state = {}; // id -> { status: 'active'|'done', step, progress }
    this.tracked = null;
    if (data) {
      this.state = structuredClone(data.state || {});
      this.tracked = data.tracked || null;
    }
    this.#startAvailable();
    if (!this.tracked || this.state[this.tracked]?.status !== 'active') this.#retrack();
  }

  // Démarre les missions automatiques et celles dont le prérequis est terminé.
  #startAvailable(out) {
    for (const [id, def] of Object.entries(this.defs)) {
      if (this.state[id]) continue;
      if (def.autoStart || (def.requires && this.state[def.requires]?.status === 'done')) {
        this.state[id] = { status: 'active', step: 0, progress: 0 };
        out?.push({ type: 'missionStart', id, title: def.title });
      }
    }
  }

  #retrack() {
    const active = this.activeIds();
    this.tracked = active.find((id) => this.defs[id].kind === 'story') || active.find((id) => this.defs[id].kind === 'main') || active[0] || null;
  }

  activeIds() {
    return Object.keys(this.state).filter((id) => this.state[id].status === 'active');
  }

  isDone(id) {
    return this.state[id]?.status === 'done';
  }

  currentStep(id) {
    const s = this.state[id];
    if (!s || s.status !== 'active') return null;
    return this.defs[id].steps[s.step];
  }

  // Indique si une étape donnée d'une mission est déjà franchie.
  stepReached(id, stepIndex) {
    const s = this.state[id];
    return !!s && (s.status === 'done' || s.step >= stepIndex);
  }

  track(id) {
    if (this.state[id]?.status === 'active') this.tracked = id;
  }

  // Avance d'une étape ; renvoie les événements produits (pour l'interface).
  #advance(id, out) {
    const s = this.state[id];
    const def = this.defs[id];
    s.step++;
    s.progress = 0;
    if (s.step >= def.steps.length) {
      s.status = 'done';
      out.push({ type: 'missionComplete', id, title: def.title, reward: def.reward });
      this.#startAvailable(out);
      if (this.tracked === id || !this.tracked) this.#retrack();
    } else {
      out.push({ type: 'stepComplete', id, text: def.steps[s.step].text });
    }
  }

  handle(event) {
    const out = [];
    for (const id of this.activeIds()) {
      const step = this.currentStep(id);
      if (!step) continue;
      if (event.type === 'kill' && step.type === 'kill') {
        const okGroup = !step.group || step.group === event.group;
        const okType = !step.enemyType || step.enemyType === event.enemyType;
        if (okGroup && okType) {
          this.state[id].progress++;
          out.push({ type: 'progress', id });
          if (this.state[id].progress >= step.count) this.#advance(id, out);
        }
      } else if (event.type === 'interact' && (step.type === 'interact' || step.type === 'talk') && step.target === event.target) {
        this.#advance(id, out);
      } else if (event.type === 'event' && step.type === 'event' && step.id === event.id) {
        this.#advance(id, out);
      }
    }
    return out;
  }

  // targets : (nom) => {x, z} | null
  checkPosition(pos, targets) {
    const out = [];
    for (const id of this.activeIds()) {
      const step = this.currentStep(id);
      if (step?.type !== 'reach') continue;
      const t = targets(step.target);
      if (!t) continue;
      const dy = t.y != null ? Math.abs(pos.y - t.y) : 0;
      if (Math.hypot(pos.x - t.x, pos.z - t.z) <= step.radius && dy < 3) this.#advance(id, out);
    }
    return out;
  }

  // Objectif suivi pour le HUD.
  objective() {
    if (!this.tracked) return null;
    const def = this.defs[this.tracked];
    const s = this.state[this.tracked];
    const step = def.steps[s.step];
    const counter = step.type === 'kill' ? ` (${s.progress}/${step.count})` : '';
    return { id: this.tracked, title: def.title, kind: def.kind, text: step.text + counter, step };
  }

  serialize() {
    return { state: structuredClone(this.state), tracked: this.tracked };
  }
}
