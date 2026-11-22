// Directeur du monde ouvert « Les Marches de Vesper ».
// Pas de couloir : une courte introduction, puis le joueur va où il veut.
// - Cycle jour / nuit continu (une journée ≈ 16 minutes) ; les Rôdeurs sortent la nuit.
// - Villageois qui vivent dans les villages (allées et venues, conversations).
// - Stèles (Mémoires), Sceaux à ranimer dans n'importe quel ordre, Faille.
// - Les pouvoirs reviennent au fil des Sceaux : vol (Aube), Forme Abysse (Marées).
// Même interface publique que Story (utilisée par Game, Social, le HUD).
import * as THREE from 'three';
import { Npc } from '../actors/npc.js';
import { MEMOIRES, VILLAGERS } from '../data/wilds.js';

const HINT = `<span class="kbd">ZQSD</span>se déplacer · <span class="kbd">Maj</span>courir · <span class="kbd">Espace</span>sauter · <span class="kbd">E</span>parler / examiner · <span class="kbd">M</span>carte · <span class="kbd">J</span>journal<br>
  <span class="kbd">Clic G</span>anneaux · <span class="kbd">Clic D</span>fouet · <span class="kbd">F</span>rafale · <span class="kbd">G</span>bouclier · <span class="kbd">Ctrl</span>rouler`;
const HINT_FLY = `<br><span class="kbd">V</span>voler · <span class="kbd">Maj</span>boost (mur du son) · <span class="kbd">Espace / Ctrl</span>monter / descendre · <span class="kbd">Clic G</span> en vol : piqué explosif`;
const HINT_UMBRA = `<br><span class="kbd">X</span>magnétisme : soulever / lancer rochers et barils (en vol : tempête) · <span class="kbd">T</span>Forme Abysse`;

// Durée de chaque phase (s) et ordre du cycle.
const CYCLE = { morning: 240, afternoon: 240, evening: 150, night: 330 };
const NEXT = { morning: 'afternoon', afternoon: 'evening', evening: 'night', night: 'morning' };

export class WildsStory {
  constructor(game) {
    this.game = game;
    this.npcs = [];
    this.students = [];
    this.seq = null;
    this.cine = null;
    this.nightTween = null;
    this.flags = new Set(game.saveData?.storyFlags || []);
    this.phaseT = game.saveData?.clock?.phaseT ?? 0;
    this.talk = null; // conversation en cours { lines, i, npc, onEnd }
    this.hintTimer = 0;
  }

  get missions() {
    return this.game.missions;
  }

  stage() {
    return 'free';
  }

  lifeMode() {
    return true;
  }

  showClock() {
    return true;
  }

  // Le dernier Veilleur se réveille avec tous ses pouvoirs : anneaux,
  // magnétisme (rochers, barils, charrettes), vol et Forme Abysse.
  powers() {
    return { rings: true, magnet: true, flight: true, umbra: true };
  }

  // ---------- Démarrage ----------
  init(isNew) {
    const g = this.game;
    const w = g.world;
    if (isNew) g.clock.phase = 'morning';
    g.setNight(g.constructor.PHASE_SKY[g.clock.phase]);
    if (g.clock.phase !== 'night') g.spawnGated();
    for (const id of ['seal_aube', 'seal_marees', 'seal_cendres']) w.setSeal(id, this.#sealDone(id));
    g.hero.setPowers(this.powers());
    if (isNew) g.hero.abyss = 100; // la Forme Abysse est disponible tout de suite
    g.hud.setName('NOA');
    this.#updateHint(true);
    this.#villagers();
    if (isNew) {
      g.hud.chapter('LES MARCHES DE VESPER', 'Mille ans après le Nightfall', 'Tu t’éveilles au Sanctuaire des Veilleurs.', 6);
      g.hud.say('', 'Des anneaux de métal d’étoile enserrent tes avant-bras. Une stèle luit faiblement au centre du cercle.', 6);
    } else g.hud.toast(g.clockLabel());
    if (this.missions.isDone('w05_faille')) this.flags.add('ending');
  }

  #sealDone(id) {
    return this.missions.isDone({ seal_aube: 'w02_aube', seal_marees: 'w03_marees', seal_cendres: 'w04_cendres' }[id]);
  }

  #updateHint(show) {
    const p = this.powers();
    this.game.hud.setHint(HINT + (p.flight ? HINT_FLY : '') + (p.umbra ? HINT_UMBRA : ''));
    if (show) {
      this.game.hud.showHint(true);
      this.hintTimer = 24;
    }
  }

  // ---------- Habitants ----------
  #villagers() {
    const g = this.game;
    const w = g.world;
    const H = (x, z) => g.col.terrainAt(x, z) + 0.15;
    const P = w.places;
    const named = [
      ['aldric', 'delcourt', P.brumeval, 3, -6],
      ['tomas', null, P.brumeval, -5, -4],
      ['bran', 'malik', P.cendreval, 4, 5],
      ['maelle', 'mara', P.port_saule, -4, 4],
      ['lina', 'camille', P.port_saule, 6, -3],
    ];
    for (const [id, palette, p, dx, dz] of named) {
      const x = p.x + dx;
      const z = p.z + dz;
      const n = new Npc(g, { id, name: VILLAGERS[id].name, palette: palette || undefined, seed: 77, x, y: H(x, z), z, yaw: Math.random() * 6 });
      n.villager = id;
      this.npcs.push(n);
      g.world.targets[id] = n.pos;
    }
    // Villageois anonymes : vont de porte en porte.
    let seed = 300;
    for (const [key, n] of [['brumeval', 7], ['cendreval', 4], ['port_saule', 5]]) {
      const doors = w.doors[key];
      const p = P[key];
      for (let i = 0; i < n; i++) {
        const route = [];
        for (let k = 0; k < 4; k++) {
          const d = doors[(i + k * 2) % doors.length];
          route.push([d.x, d.z]);
          if (k % 2 === 0) route.push([p.x + (Math.random() - 0.5) * 10, p.z + (Math.random() - 0.5) * 10]);
        }
        const [x, z] = route[0];
        const npc = new Npc(g, { id: `v_${key}_${i}`, seed: seed++, x, y: H(x, z), z, route, speed: 1.2 + Math.random() * 0.4 });
        npc.villager = null;
        this.npcs.push(npc);
      }
    }
  }

  blocksTalk() {
    return false;
  }

  // ---------- Interactions ----------
  interactables() {
    if (this.talk) return [];
    const g = this.game;
    const t = g.world.targets;
    const out = [];
    for (const s of g.world.steles) {
      const read = this.flags.has('read_' + s.id);
      out.push({ kind: 'story', id: s.id, pos: t[s.id], label: `<kbd>E</kbd>${read ? 'Relire' : 'Lire'} la stèle des Veilleurs` });
    }
    for (const id of ['seal_aube', 'seal_marees', 'seal_cendres']) {
      if (this.#sealDone(id)) continue;
      out.push({ kind: 'story', id, pos: t[id], label: `<kbd>E</kbd>Poser les anneaux sur l’obélisque` });
    }
    if (g.missions.currentStep('w05_faille')?.target === 'faille_heart') out.push({ kind: 'story', id: 'faille_heart', pos: t.faille_heart, label: '<kbd>E</kbd>Sceller le cœur de la Faille' });
    if (g.missions.currentStep('ws_fleur')?.target === 'fleur_lune') out.push({ kind: 'story', id: 'fleur_lune', pos: t.fleur_lune, label: '<kbd>E</kbd>Cueillir la fleur de lune' });
    for (const n of this.npcs) {
      if (!n.villager || !n.model.root.visible) continue;
      const v = VILLAGERS[n.villager];
      out.push({ kind: 'story', id: 'talk_' + n.villager, npc: n, pos: n.pos, label: `<kbd>E</kbd>Parler — <span style="color:#ffd88a">${v.name}</span> <small>(${v.role})</small>` });
    }
    return out;
  }

  interact(it) {
    const g = this.game;
    if (it.id.startsWith('stele_')) return this.#readStele(it.id);
    if (it.id.startsWith('seal_')) return this.#restoreSeal(it.id);
    if (it.id === 'faille_heart') return this.#sealFaille();
    if (it.id === 'fleur_lune') {
      g.audio.pickup?.();
      g.missionEvents(g.missions.handle({ type: 'interact', target: 'fleur_lune' }));
      g.hud.toast('Fleur de lune cueillie', '#9fe8ff');
      return;
    }
    if (it.id.startsWith('talk_')) return this.#talkTo(it.npc);
  }

  #readStele(id) {
    const g = this.game;
    const m = MEMOIRES[id];
    const first = !this.flags.has('read_' + id);
    this.flags.add('read_' + id);
    this.#dialog([['Stèle des Veilleurs — ' + m.title, m.text]], () => {
      g.missionEvents(g.missions.handle({ type: 'interact', target: id }));
      if (first && id !== 'stele_0') g.missionEvents(g.missions.handle({ type: 'collect', item: 'memoire' }));
      if (first) g.grantXp(40);
    });
  }

  #restoreSeal(id) {
    const g = this.game;
    const mission = { seal_aube: 'w02_aube', seal_marees: 'w03_marees', seal_cendres: 'w04_cendres' }[id];
    const step = g.missions.currentStep(mission);
    if (!step) return g.hud.toast('Le Sceau ne répond pas encore. Parle d’abord aux habitants de Brumeval.', '#ffcd20');
    if (step.type === 'kill') return g.hud.toast('Les Rôdeurs rôdent encore autour du Sceau.', '#ff7a6a');
    g.hero.playAnim?.('awaken', 1.6);
    g.fx.ring(g.world.targets[id], { color: '#7fe3ff', from: 0.5, to: 12, life: 1.2 });
    g.shake?.(0.4);
    g.world.setSeal(id, true);
    g.missionEvents(g.missions.handle({ type: 'interact', target: id }));
    // Chaque Sceau rend une part de la force des anciens Veilleurs : points de
    // compétence (touche K), énergie et vie restaurées, jauge d'Abysse pleine.
    g.progression.skillPoints += 2;
    g.hero.hp = g.hero.stats.maxHp;
    g.hero.energy = g.hero.stats.maxEnergy;
    g.hero.abyss = 100;
    g.fx.shockwave?.(g.world.targets[id], { radius: 14, color: '#7fe3ff', power: 2, debris: false });
    const names = { seal_aube: 'L’Aube', seal_marees: 'Les Marées', seal_cendres: 'Les Cendres' };
    g.hud.banner('SCEAU RANIMÉ', names[id], 'Force des Veilleurs : +2 points de compétence [K]');
  }

  #sealFaille() {
    const g = this.game;
    g.fx.ring(g.world.targets.faille_heart, { color: '#ffffff', from: 1, to: 30, life: 2 });
    g.shake?.(0.8);
    g.missionEvents(g.missions.handle({ type: 'interact', target: 'faille_heart' }));
    this.flags.add('ending');
    g.hud.chapter('LA FAILLE EST SCELLÉE', 'Pour mille ans de plus', 'Les Marches t’appartiennent. Les Rôdeurs errants, eux, sont toujours là.', 7);
  }

  #talkTo(npc) {
    const g = this.game;
    const id = npc.villager;
    const v = VILLAGERS[id];
    npc.faceTo(g.hero.pos);
    npc.play?.('talk', 6);
    const m = g.missions;
    let lines = null;
    let after = null;
    if (id === 'aldric' && m.currentStep('w01_reveil')?.target === 'aldric') {
      lines = v.first;
      after = () => m.handle && g.missionEvents(m.handle({ type: 'interact', target: 'aldric' }));
    } else if (id === 'bran' && !m.state.ws_loups) {
      lines = v.first;
      after = () => g.missionEvents(m.start('ws_loups'));
    } else if (id === 'bran' && m.currentStep('ws_loups')?.target === 'bran') {
      lines = v.done;
      after = () => g.missionEvents(m.handle({ type: 'interact', target: 'bran' }));
    } else if (id === 'maelle' && !m.state.ws_fleur) {
      lines = v.first;
      after = () => g.missionEvents(m.start('ws_fleur'));
    } else if (id === 'maelle' && m.currentStep('ws_fleur')?.target === 'maelle') {
      lines = v.done;
      after = () => g.missionEvents(m.handle({ type: 'interact', target: 'maelle' }));
    } else {
      const idle = v.idle;
      lines = [idle[(this.flags.has('talked_' + id) ? Math.floor(Math.random() * idle.length) : 0)]];
      this.flags.add('talked_' + id);
    }
    this.#dialog(lines, after);
  }

  // Boîte de dialogue : « Continuer » fait avancer (clic, toucher, 1, E).
  #dialog(lines, onEnd) {
    const g = this.game;
    this.talk = { lines, i: 0, onEnd };
    g.hero.vel?.set(0, 0, 0);
    g.hero.cinematic = true;
    this.#showLine();
  }

  #showLine() {
    const g = this.game;
    const t = this.talk;
    const [who, text] = t.lines[t.i];
    const last = t.i >= t.lines.length - 1;
    g.hud.dialog({
      who,
      color: who === 'Noa' ? '#7fe3ff' : '#ffd88a',
      text,
      choices: [last ? 'Terminer' : 'Continuer'],
      onChoose: () => this.next(),
    });
  }

  next() {
    const t = this.talk;
    if (!t) return;
    t.i++;
    if (t.i < t.lines.length) return this.#showLine();
    this.talk = null;
    this.game.hud.closeDialog();
    this.game.hero.cinematic = false;
    t.onEnd?.();
  }

  get inCinematic() {
    return false;
  }

  get talking() {
    return !!this.talk;
  }

  skip() {}

  // ---------- Événements ----------
  onZone() {}

  onPhase(phase) {
    if (phase === 'night') this.game.hud.toast('La nuit tombe. Les Rôdeurs sortent des bois.', '#c9a6ff');
    if (phase === 'morning') this.game.hud.toast(`Jour ${this.game.clock.day} — l’aube se lève sur les Marches`, '#ffd88a');
  }

  onMissionEvent(ev) {
    const g = this.game;
    if (ev.type === 'missionComplete' && ev.id === 'w01_reveil') {
      g.hud.chapter('LES TROIS SCEAUX', 'L’Aube · les Marées · les Cendres', 'Va où tu veux. La carte [M] montre les lieux connus.', 5);
    }
    if (ev.type === 'missionStart' && ev.id === 'w05_faille') {
      g.hud.chapter('LA FAILLE', 'Les Sceaux chantent', 'Au nord, la lumière violette vacille. Il est temps.', 5);
    }
    if (ev.type === 'stepComplete' && ev.id === 'w05_faille' && g.missions.state.w05_faille.step === 1 && !g.boss) {
      const f = g.world.places.faille;
      const b = g.spawnBoss({ x: f.x, z: f.z - 6 });
      b.def = { ...b.def, name: 'YSOLDE, LA REINE COLOSSE' };
    }
  }

  checkpoint() {
    const t = this.game.world.targets.terminal;
    if (this.missions.isDone('w01_reveil')) return { x: t.x, y: t.y, z: t.z + 2, yaw: 0 };
    return this.game.world.spawn;
  }

  onRespawn() {}

  // ---------- Mise à jour ----------
  update(dt) {
    const g = this.game;
    for (const n of this.npcs) n.update(dt);
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) g.hud.showHint(false);
    }
    // Clavier : E / 1 / Espace font avancer le dialogue.
    if (this.talk && (g.input.was('interact') || g.input.was('jump'))) this.next();
    if (this.nightTween) {
      const tw = this.nightTween;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      g.setNight(tw.from + (tw.to - tw.from) * (k * k * (3 - 2 * k)));
      if (k >= 1) this.nightTween = null;
    }
    // Cycle jour / nuit continu (en pause pendant les dialogues).
    if (!this.talk) {
      this.phaseT += dt;
      g.clock.phaseT = this.phaseT;
      if (this.phaseT >= CYCLE[g.clock.phase]) {
        this.phaseT = 0;
        g.advancePhase(NEXT[g.clock.phase]);
      }
    }
    // Boss vaincu → l'étape suivante est l'interaction (gérée par la mission).
    // Le Colosse ne quitte pas l'arène de la Faille.
    if (g.boss?.alive) {
      const f = g.world.places.faille;
      const d = Math.hypot(g.hero.pos.x - f.x, g.hero.pos.z - f.z);
      if (d > 90) g.boss.alert = false;
    }
  }
}

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
