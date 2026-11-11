// Failles instables : événements dynamiques de nuit. Une colonne de lumière
// abyssale s'ouvre quelque part dans Vesper (visible de loin et sur la
// minicarte). En s'approchant, Noa déclenche trois vagues de créatures ; une
// fois la faille refermée, elle lâche une vraie récompense. Une faille ignorée
// finit par se refermer seule.
import * as THREE from 'three';

const WAVES = [
  [{ type: 'crawler' }, { type: 'crawler' }, { type: 'stalker' }],
  [{ type: 'stalker' }, { type: 'wisp' }, { type: 'crawler' }, { type: 'crawler' }],
  [{ type: 'brute' }, { type: 'wisp' }, { type: 'stalker', elite: 'enraged' }],
];
const TRIGGER = 22; // distance d'activation
const IDLE_LIFE = 240; // une faille ignorée se referme au bout de 4 min

function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uK; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float edge = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 0.6);
        float bands = 0.65 + 0.35 * sin(vUv.y * 40.0 - uTime * 6.0);
        float fade = smoothstep(1.0, 0.25, vUv.y) * smoothstep(0.0, 0.03, vUv.y);
        float a = edge * bands * fade * uK;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), edge * 0.35) * a * 1.6, a);
      }`,
  });
}

export class Rifts {
  constructor(game) {
    this.game = game;
    this.enabled = true;
    this.active = [];
    this.timer = 100; // première faille après ~1 min 40 de nuit libre
    this.closed = 0;
  }

  eligible() {
    const g = this.game;
    return this.enabled && g.zone === 'city' && g.clock.phase === 'night' && g.story?.stage() === 'free' && g.hero.powers.rings && !g.boss && !g.hero.dead;
  }

  update(dt) {
    const g = this.game;
    if (this.eligible() && this.active.length === 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.spawnNear();
    }
    for (const r of this.active) this.#updateRift(r, dt);
    this.active = this.active.filter((r) => !r.removed);
    // De jour ou à l'intérieur, les failles inactives disparaissent.
    if ((g.clock.phase !== 'night' || g.zone !== 'city') && this.active.length) {
      for (const r of this.active) if (r.state !== 'closing') this.#close(r, false);
    }
  }

  // Ouvre une faille à distance raisonnable du héros (ou à une position donnée).
  spawnNear(at = null) {
    const g = this.game;
    const h = g.hero.pos;
    let p = at;
    if (!p) {
      const cands = g.world.enemySpawns.filter((s) => {
        const d = Math.hypot(s.x - h.x, s.z - h.z);
        return d > 50 && d < 160 && Math.abs(s.x) < 280 && Math.abs(s.z) < 280;
      });
      if (!cands.length) {
        this.timer = 30;
        return null;
      }
      const s = cands[Math.floor(Math.random() * cands.length)];
      p = { x: s.x, z: s.z };
    }
    const y = g.col.groundHeight(p.x, p.z, 0.5, 50);
    const r = { pos: new THREE.Vector3(p.x, y, p.z), state: 'idle', wave: -1, life: IDLE_LIFE, t: 0, alive: new Set(), k: 0 };
    this.#build(r);
    this.active.push(r);
    const d = Math.round(Math.hypot(p.x - h.x, p.z - h.z));
    g.hud.toast(`Une faille instable s'ouvre à ${d} m — referme-la !`, '#a060ff');
    g.hud.say?.('MARA (radio)', 'Je capte une faille instable ! Si on la laisse ouverte, d’autres créatures vont en sortir.', 5);
    return r;
  }

  #build(r) {
    const root = new THREE.Group();
    root.position.copy(r.pos);
    const mat = beamMaterial('#a060ff');
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 90, 20, 1, true), mat);
    beam.position.y = 45;
    root.add(beam);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 90, 12, 1, true), beamMaterial('#e0d0ff'));
    inner.position.y = 45;
    root.add(inner);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#c9a0ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(2.6 + i * 0.9, 0.08, 6, 40), ringMat);
      m.position.y = 1.5 + i * 2.2;
      m.rotation.x = Math.PI / 2;
      root.add(m);
      rings.push(m);
    }
    // Fissure au sol : disque sombre + couronne lumineuse
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), new THREE.MeshBasicMaterial({ color: '#0b0418', transparent: true, opacity: 0.85, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    root.add(disc);
    const crown = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.7, 40), new THREE.MeshBasicMaterial({ color: '#ff4dd2', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    crown.rotation.x = -Math.PI / 2;
    crown.position.y = 0.07;
    root.add(crown);
    root.scale.setScalar(0.01);
    this.game.scene.add(root);
    r.root = root;
    r.mats = [mat, inner.material];
    r.rings = rings;
    r.crown = crown;
  }

  #updateRift(r, dt) {
    const g = this.game;
    r.t += dt;
    // Apparition / fermeture animées
    const target = r.state === 'closing' ? 0 : 1;
    r.k += (target - r.k) * Math.min(1, dt * (r.state === 'closing' ? 3 : 1.5));
    const pulse = r.state === 'wave' ? 1.15 + Math.sin(r.t * 8) * 0.08 : 1;
    r.root.scale.set(r.k * pulse, Math.max(0.01, r.k), r.k * pulse);
    for (const m of r.mats) {
      m.uniforms.uTime.value = r.t;
      m.uniforms.uK.value = r.state === 'wave' ? 1.3 : 1;
    }
    r.rings.forEach((m, i) => {
      m.rotation.z = r.t * (0.6 + i * 0.4) * (i % 2 ? -1 : 1);
      m.position.y = 1.5 + i * 2.2 + Math.sin(r.t * 2 + i) * 0.3;
    });
    r.crown.material.opacity = 0.5 + Math.sin(r.t * 4) * 0.3;
    if (Math.random() < dt * 8 && r.k > 0.5) g.fx.emit({ x: r.pos.x + (Math.random() - 0.5) * 4, y: r.pos.y + 0.3, z: r.pos.z + (Math.random() - 0.5) * 4 }, { count: 1, color: '#c9a0ff', speed: 0.5, up: 4, size: 0.4, life: 1.2, gravity: -3 });
    if (r.state === 'closing') {
      if (r.k < 0.03) {
        g.scene.remove(r.root);
        r.removed = true;
      }
      return;
    }
    const d = Math.hypot(g.hero.pos.x - r.pos.x, g.hero.pos.z - r.pos.z);
    if (r.state === 'idle') {
      r.life -= dt;
      if (r.life <= 0) return this.#close(r, false);
      if (d < TRIGGER && !g.hero.dead) {
        r.state = 'wave';
        g.hud.banner('FAILLE INSTABLE', 'TIENS BON !', '3 vagues de créatures');
        g.audio.bruteRoar?.(r.pos);
        this.#nextWave(r);
      }
    } else if (r.state === 'wave') {
      if (r.alive.size === 0) {
        r.pause = (r.pause ?? 2) - dt;
        if (r.pause <= 0) {
          r.pause = 2;
          if (r.wave >= WAVES.length - 1) this.#reward(r);
          else this.#nextWave(r);
        }
      }
      // Noa s'est enfui loin : la faille se rendort (les créatures restent).
      if (d > 110) {
        r.state = 'idle';
        r.life = IDLE_LIFE / 2;
      }
    }
  }

  #nextWave(r) {
    const g = this.game;
    r.wave++;
    const lvl = g.progression?.level || 1;
    const list = [...WAVES[r.wave]];
    if (lvl >= 8) list.push({ type: 'crawler' });
    list.forEach((w, i) => {
      const a = (i / list.length) * Math.PI * 2 + Math.random() * 0.5;
      const rad = 4.5 + Math.random() * 3;
      const x = r.pos.x + Math.sin(a) * rad;
      const z = r.pos.z + Math.cos(a) * rad;
      const e = g.spawnEnemy({ type: w.type, x, z, group: 'rift', elite: w.elite ?? null, patrol: [[x, z]] });
      e.pos.y = g.col.groundHeight(x, z, e.radius, r.pos.y + 2);
      e.alertTo(g.hero.pos);
      e.riftOf = r;
      r.alive.add(e);
      g.fx.emit({ x, y: e.pos.y + 1, z }, { count: 18, color: '#a060ff', speed: 4, size: 0.4, life: 0.6, gravity: -1 });
      g.fx.ring({ x, y: e.pos.y, z }, { color: '#ff4dd2', from: 0.3, to: 2, life: 0.4 });
    });
    g.hud.toast(`Vague ${r.wave + 1} / ${WAVES.length}`, '#ff4dd2');
  }

  onKill(e) {
    const r = e.riftOf;
    if (r) r.alive.delete(e);
  }

  #reward(r) {
    const g = this.game;
    const lvl = g.progression?.level || 1;
    const credits = 60 + lvl * 20;
    const shards = 4 + Math.floor(lvl / 3);
    const xp = 120 + lvl * 25;
    g.inventory.grant([{ kind: 'credits', amount: credits }, { kind: 'shards', amount: shards }, { kind: 'item', id: 'abyss_fragment', qty: 2 }]);
    g.hud.banner('FAILLE REFERMÉE', 'VESPER RESPIRE', `+${xp} XP   +${credits} Credits   +${shards} Abyss Shards`);
    g.fx.ring(r.pos, { color: '#ffffff', from: 0.5, to: 14, life: 0.9 });
    g.fx.ring(r.pos, { color: '#a060ff', from: 0.5, to: 10, life: 0.7 });
    g.shake(0.4, r.pos);
    g.audio.levelUp?.();
    g.grantXp(xp);
    this.closed++;
    this.#close(r, true);
  }

  #close(r, won) {
    r.state = 'closing';
    this.timer = won ? 200 + Math.random() * 80 : 120;
  }
}
