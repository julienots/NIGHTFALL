// Mise en scène de l'histoire.
// Prologue : cours de physique au lycée (le fragment d'Aegis « pique » Noa),
// couloir, casier, Inès devant le lycée, retour à pied → Nightfall → poursuite →
// le cristal de la camionnette se dissout dans Noa : son magnétisme s'éveille et
// forge dix anneaux avec le métal alentour → tutoriel → chapitre 1 (nuit) →
// l'Ombre (symbiote) → chapitre 2 « Double vie » (lycée le jour, héros la nuit).
// Les cinématiques avancent en temps de jeu (testables, synchronisées).
import * as THREE from 'three';
import { Npc } from '../actors/npc.js';
import { BULLY_SCENES, BULLY_GANG, powersUsed } from '../data/bully.js';
import { SCENES } from '../data/characters.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const HINTS = {
  prologue: `<span class="kbd">ZQSD/WASD</span>marcher · <span class="kbd">Maj</span>courir · <span class="kbd">Espace</span>sauter<br>
    <span class="kbd">E</span>parler / interagir · <span class="kbd">1-3</span>choisir une réponse · <span class="kbd">J</span>journal · <span class="kbd">L</span>relations · <span class="kbd">Échap</span>pause`,
  rings: `<span class="kbd">Clic G</span>coups d'anneaux · <span class="kbd">Clic D</span>fouet · <span class="kbd">F</span>rafale · <span class="kbd">G</span>bouclier / parade<br>
    <span class="kbd">X</span>magnétisme : soulever / lancer une voiture · <span class="kbd">Ctrl/C</span>rouler · <span class="kbd">R</span>verrouiller · <span class="kbd">K</span>compétences`,
  flight: `<span class="kbd">V</span>décoller / se poser · <span class="kbd">ZQSD</span>voler vers où tu regardes · <span class="kbd">Maj</span>boost<br>
    <span class="kbd">Espace</span>monter · <span class="kbd">Ctrl/C</span>descendre · <span class="kbd">Clic G</span>piqué · <span class="kbd">X</span> en vol : tempête de métal`,
  umbra: `<span class="kbd">T</span>Forme Abysse (jauge ≥ 50 %) · <span class="kbd">Clic G</span>griffes · <span class="kbd">Clic D</span>tentacules (attirent)<br>
    <span class="kbd">F</span>rugissement · <span class="kbd">Espace</span>bond géant · la jauge se remplit en frappant`,
};

const DELCOURT = 'M. Delcourt';

export class Story {
  constructor(game) {
    this.game = game;
    this.npcs = []; // passants
    this.students = []; // élèves du lycée
    this.seq = null; // séquence scriptée en cours
    this.cine = null; // caméra de cinématique { pos, look }
    this.flags = new Set(game.saveData?.storyFlags || []);
    this.hintTimer = 0;
  }

  get missions() {
    return this.game.missions;
  }

  get social() {
    return this.game.social;
  }

  stage() {
    const m = this.missions;
    if (m.state.p01_after_school?.status === 'active') return 'prologue';
    if (m.state.p02_nightfall?.status === 'active') return 'chase';
    if (m.state.p03_rings?.status === 'active') return 'tutorial';
    return 'free';
  }

  // Vie quotidienne débloquée (jour / nuit au choix) après l'Ombre.
  lifeMode() {
    return this.missions.isDone('m04_umbra');
  }

  showClock() {
    return this.stage() === 'prologue' || this.lifeMode();
  }

  // Pouvoirs disponibles selon l'avancée.
  powers() {
    const m = this.missions;
    const rings = m.isDone('p02_nightfall');
    return {
      rings,
      magnet: rings,
      flight: rings && m.stepReached('p03_rings', 4),
      umbra: m.stepReached('m04_umbra', 1),
    };
  }

  // ---------- Initialisation selon la sauvegarde ----------
  // Ville « vivante » (jour) ou « abandonnée » (nuit du Nightfall).
  #cityState(night, instant) {
    const w = this.game.world;
    w.street.setTraffic(!night);
    w.setBarricades(night && !this.lifeMode());
    if (night || this.missions.isDone('p01_after_school')) w.toppleMonument(instant);
  }

  init(isNew) {
    const g = this.game;
    const st = this.stage();
    // Phase imposée par l'histoire avant la vie quotidienne.
    if (st === 'prologue') g.clock.phase = this.missions.stepReached('p01_after_school', 3) ? 'evening' : 'afternoon';
    else if (!this.lifeMode()) g.clock.phase = 'night';
    g.setNight(g.constructor.PHASE_SKY[g.clock.phase]);
    this.#cityState(g.clock.phase === 'night', true);
    if (g.clock.phase !== 'night') {
      for (const e of g.enemies) g.scene.remove(e.model.root);
      g.enemies = [];
    }
    g.hero.setPowers(this.powers());
    this.#updateHint(true);
    g.hud.setName('NOA');
    this.#ambient(g.clock.phase !== 'night');
    if (g.zone === 'school') this.#populateSchool();
    if (st === 'prologue') {
      if (isNew) this.#classIntro();
      else if (!this.missions.stepReached('p01_after_school', 1) && g.zone === 'school') this.#classIntro();
    } else if (st === 'chase') {
      this.#ensureCase();
      if (!g.missions.stepReached('p02_nightfall', 1)) this.#spawnChaser(V(g.hero.pos.x - 12, 0.15, g.hero.pos.z + 8));
    } else if (st === 'tutorial') {
      this.#ensureCase(true);
      if (!g.missions.stepReached('p03_rings', 1)) this.#spawnChaser(V(34, 0.15, -44), false);
    }
    // Reprise en cours de chapitre 1
    const m02 = g.missions.state.m02_aegis_echo;
    if (m02?.status === 'active' && m02.step === 1) this.#spawnCrawlers(3 - m02.progress, false);
    if (m02?.status === 'active' && m02.step === 2) this.#ensureDrone();
    const m03 = g.missions.state.m03_colossus;
    if (m03?.status === 'active' && m03.step === 1 && !g.boss) {
      const b = g.spawnBoss({ x: 0, z: -14 });
      b.introDur = 0.1;
    }
    const m04 = g.missions.state.m04_umbra;
    if (m04?.status === 'active' && m04.step === 0) this.#ensureOoze();
    if (m04?.status === 'active' && m04.step === 2) this.#spawnUmbraTest(4 - m04.progress);
    this.#placeFriends();
    if (isNew === false && g.saveData && !g.saveData.social && this.lifeMode()) g.hud.toast(g.clockLabel());
    // Départ du chapitre 2 (sélection de chapitre) : réveil dans la chambre.
    if (this.flags.has('skipIntro') && this.lifeMode() && g.zone === 'home' && !this.missions.stepReached('d01_double_life', 1)) {
      this.flags.delete('skipIntro');
      this.#morningIntro();
    } else if (this.flags.has('skipIntro') && st === 'free' && !this.lifeMode()) {
      this.flags.delete('skipIntro');
      g.hud.chapter('CHAPITRE 1', 'Vesper Downtown', 'La ville a besoin d’un héros. Elle n’a qu’un lycéen.', 5);
      g.spawnGated();
    }
  }

  // ---------- Amis, élèves, passants ----------
  #friendSpots() {
    const g = this.game;
    const S = g.interiors.zones.school;
    const H = g.districts.hangouts || {};
    const T = g.world.targets;
    const st = this.stage();
    const at = (arr, i, dflt) => {
      const a = arr?.[i % Math.max(1, arr?.length || 0)];
      if (!a) return dflt;
      return Array.isArray(a) ? { x: a[0], z: a[1], yaw: a[2] || 0 } : { ...a };
    };
    const spots = {};
    if (st === 'prologue') {
      const p = this.missions.state.p01_after_school;
      if (p.step >= 1) spots.camille = { ...at(S.standSpots?.labo || [], 0, { x: S.rooms.labo.x + 2, z: S.rooms.labo.z, yaw: 0 }), y: 0 };
      if (p.step >= 1 && p.step <= 1) spots.malik = { ...at(S.standSpots.corridor, 0), y: 0 };
      if (p.step <= 3 && !this.flags.has('ines_left')) {
        const gate = T.school_gate || T.school_door;
        spots.ines = { x: gate.x - 2.5, z: gate.z - 1.5, yaw: Math.PI };
      }
      return spots;
    }
    if (!this.lifeMode()) return spots;
    const ph = g.clock.phase;
    if (ph === 'morning') {
      spots.ines = { ...at(S.standSpots.cafeteria, 0), y: 0 };
      spots.malik = { ...at(S.standSpots.corridor, 0), y: 0 };
      spots.camille = { ...at(S.standSpots.corridor, 2, { x: S.rooms.labo.x, z: S.rooms.labo.z, yaw: 0 }), y: 0 };
      spots.theo = { ...at(S.standSpots.hall, 0), y: 0 };
      const j = this.#jordanSpot();
      if (j) spots.jordan = j;
    } else if (ph === 'afternoon' || ph === 'evening') {
      spots.ines = at(H.cafe, 0, T.park_cafe);
      spots.camille = at(H.park, 0, T.park_pond);
      if (ph === 'afternoon') {
        spots.malik = at(H.schoolyard, 0, T.school_gate);
        spots.theo = T.stadium ? { x: T.stadium.x + 3, z: T.stadium.z, yaw: 0 } : null;
        // Jordan, réconcilié, traîne dans la cour avec Malik.
        if (this.social.flags.has('jordan_ally')) spots.jordan = at(H.schoolyard, 1, T.school_gate);
      }
    }
    if (this.social.partner && spots[this.social.partner] == null && ph === 'evening') spots[this.social.partner] = at(H.park, 1, T.park_pond);
    return spots;
  }

  #placeFriends() {
    this.social.placeFriends(this.#friendSpots());
  }

  // ---------- Mission « Casier 117 » (harcèlement) ----------
  // Étape en cours si elle peut se jouer aujourd'hui (certaines attendent le lendemain).
  #bullyStep() {
    const st = this.missions.state.b01_bully;
    if (st?.status !== 'active') return -1;
    return this.game.clock.day >= (st.after || 0) ? st.step : -1;
  }

  // Où se trouve Jordan le matin, selon l'étape (null : absent).
  #jordanSpot() {
    const S = this.game.interiors.zones.school;
    const face = (x, z, t) => ({ x, y: 0, z, yaw: Math.atan2(t.x - x, t.z - z) });
    const step = this.#bullyStep();
    if (step === 0) return face(S.locker.x + 1.5, S.locker.z + 0.3, S.locker);
    if (step === 2) {
      const c = S.standSpots.cafeteria[3];
      return { ...c, y: 0 };
    }
    if (step === 4) return face(S.rooms.cdi.x - 1.1, S.rooms.cdi.z, { x: S.rooms.cdi.x + 1, z: S.rooms.cdi.z });
    return null;
  }

  // La bande (deux élèves) autour de Jordan, et Mme Ferrand (CPE) le matin.
  #populateBully() {
    const g = this.game;
    const S = g.interiors.zones.school;
    const step = this.#bullyStep();
    const j = this.#jordanSpot();
    this.gang = [];
    if (j && (step === 0 || step === 2)) {
      [[0.9, 0.7], [-0.4, 1.0]].forEach(([dx, dz], i) => {
        const x = j.x + dx;
        const z = j.z + dz;
        const npc = new Npc(g, { id: 'gang' + i, seed: 777 + i * 31, x, y: 0, z, yaw: Math.atan2(j.x - x, j.z - z) });
        this.gang.push(npc);
        this.students.push(npc);
      });
    }
    if (this.lifeMode() && g.clock.phase === 'morning') {
      const at = step === 4 ? { x: S.rooms.cdi.x + 1, z: S.rooms.cdi.z, yaw: -Math.PI / 2 } : { x: S.rooms.hall.x + 3.2, z: S.rooms.hall.z - 1.2, yaw: Math.PI };
      this.cpe = new Npc(g, { id: 'cpe', name: 'Mme Ferrand', palette: 'ferrand', x: at.x, y: 0, z: at.z, yaw: at.yaw });
      this.students.push(this.cpe);
    }
  }

  #bullyCtx() {
    const g = this.game;
    return {
      usePowers: (n) => {
        const so = this.social;
        so.flags.add(n === 1 ? 'bully_powers' : 'bully_powers2');
        g.audio.magnetThrow();
        if (g.settings.shake) g.shakeAmp = Math.max(g.shakeAmp, 0.25);
        g.hud.toast('Des élèves ont filmé la scène…', '#ff6a6a');
        if (n === 2) {
          so.addAff('ines', -4);
          if (powersUsed(so) >= 2) g.hud.say('MARA (radio)', 'Noa… une vidéo de plateaux qui volent tourne en ligne. Si Aegis la voit, ils sauront où te chercher. Fais attention.', 6);
        }
      },
    };
  }

  #bullyTalk(id, done) {
    const g = this.game;
    const so = this.social;
    const st = this.missions.state.b01_bully;
    const step = st.step;
    const npc = so.friends[id];
    so.talkedDay[id] = g.clock.day;
    const leave = () => {
      for (const n of this.gang || []) n.walkTo(n.pos.x + 8, n.pos.z, 1.8, 'gone');
      if (id === 'jordan' && npc) npc.walkTo(npc.pos.x + 8, npc.pos.z, 1.8, 'gone');
    };
    if (step === 0) {
      so.run(BULLY_SCENES.locker(so, this.#bullyCtx()), { with: npc, char: 'jordan', onEnd: () => { leave(); done(); } });
    } else if (step === 1) {
      so.run(BULLY_SCENES.ines(so), { with: npc, char: 'ines', onEnd: () => {
        st.after = g.clock.day + 1; // Jordan revient… un autre jour.
        done();
      } });
    } else if (step === 2) {
      g.hero.playAnim('interact', 0.6);
      so.run(BULLY_SCENES.cafeteria(so, this.#bullyCtx()), { with: npc, char: 'jordan', onEnd: () => { leave(); done(); } });
    } else if (step === 4) {
      so.run(BULLY_SCENES.mediation(so), { with: npc, char: 'jordan', onEnd: () => {
        done();
        this.#bullyEpilogue();
      } });
    } else return false;
    return true;
  }

  // Récompenses de fin : vraies conséquences des choix.
  #bullyEpilogue() {
    const g = this.game;
    const so = this.social;
    so.addAff('ines', 5);
    so.addAff('malik', 3);
    if (so.flags.has('jordan_ally')) {
      so.reward('jordan_hoodie');
      g.hud.toast('Jordan devient un allié : on le croise dans la cour l’après-midi', '#ff7a45');
    }
    if (!powersUsed(so)) {
      g.hud.banner('COURAGE', 'Tu as tenu bon sans tes pouvoirs', '+150 XP');
      g.grantXp(150);
    } else {
      g.hud.toast('La rumeur du « casier qui bouge » court encore dans les couloirs…', '#ff6a6a');
    }
  }

  #cpeTalk() {
    const g = this.game;
    const so = this.social;
    if (this.missions.currentStep('b01_bully')?.target === 'cpe') {
      so.run(BULLY_SCENES.cpe(so), { with: this.cpe, onEnd: () => {
        const st = this.missions.state.b01_bully;
        st.after = g.clock.day + 1; // médiation le lendemain matin
        g.missionEvents(g.missions.handle({ type: 'interact', target: 'cpe' }));
        this.#placeFriends();
      } });
      return;
    }
    const lines = ['Bonjour Noa. Tout va bien ? Ma porte est toujours ouverte.', 'On ne court pas dans les couloirs ! … Bonne journée, Noa.', 'Si quelque chose ne va pas, toi ou un ami, tu viens me voir. D’accord ?'];
    so.run([['Mme Ferrand (CPE)', lines[g.clock.day % lines.length]]], { with: this.cpe });
  }

  // Élèves et professeur dans le lycée (selon le moment de la journée).
  #populateSchool() {
    const g = this.game;
    const S = g.interiors.zones.school;
    for (const n of this.students) n.dispose();
    this.students = [];
    this.teacher?.dispose();
    this.teacher = null;
    const ph = g.clock.phase;
    const prologueClass = this.stage() === 'prologue' && !this.missions.stepReached('p01_after_school', 1);
    const n = g.settings.quality === 'low' ? 5 : 9;
    if (prologueClass || (ph === 'morning' && this.social.canAttendLesson())) {
      const L = prologueClass ? { room: 'labo', teacher: DELCOURT } : this.social.lesson();
      const seats = (S.seats[L.room] || []).filter((s) => !this.#isNoaSeat(L.room, s));
      seats.slice(prologueClass ? 1 : 0, n + (prologueClass ? 1 : 0)).forEach((s, i) => this.students.push(new Npc(g, { id: 'st' + i, seed: 300 + i * 13, x: s.x, y: 0, z: s.z, yaw: s.yaw, pose: 'sit' })));
      const t = S.teacher[L.room] || S.teacher.labo;
      this.teacher = new Npc(g, { id: 'teacher', name: L.teacher, palette: L.teacher === DELCOURT ? 'delcourt' : undefined, seed: 999, x: t.x, y: 0, z: t.z, yaw: t.yaw });
    }
    // Élèves qui discutent dans le couloir et à la cafétéria.
    const stand = [...(S.standSpots.corridor || []).slice(1), ...(S.standSpots.cafeteria || []).slice(1), ...(S.standSpots.hall || []).slice(1)];
    stand.slice(0, g.settings.quality === 'low' ? 3 : 7).forEach((s, i) => {
      const npc = new Npc(g, { id: 'sc' + i, seed: 500 + i * 7, x: s.x, y: 0, z: s.z, yaw: s.yaw });
      this.students.push(npc);
    });
    this.cpe = null;
    this.#populateBully();
  }

  #isNoaSeat(room, s) {
    const S = this.game.interiors.zones.school;
    const ns = room === S.noaSeat.room ? S.noaSeat : (S.seats[room] || [])[1];
    return !!ns && Math.hypot(ns.x - s.x, ns.z - s.z) < 0.3;
  }

  #lessonSeat() {
    const S = this.game.interiors.zones.school;
    const L = this.social.lesson();
    return L.room === S.noaSeat.room ? S.noaSeat : { room: L.room, ...(S.seats[L.room] || [])[1] };
  }

  // Passants de jour (centre-ville + quartiers) ; fuient / disparaissent la nuit.
  #ambient(day) {
    const g = this.game;
    if (!this.npcs.length) {
      const routes = [
        [[9.6, 30], [9.6, 12], [30, 9.4]], [[-9.6, 28], [-9.6, 50]], [[34, 9.4], [55, 9.4]], [[-33, 9.4], [-55, 9.4]],
        [[9.6, -28], [9.6, -50]], [[-9.6, -17], [-9.6, -50]], [[18, 28.5], [28.5, 28.5]], [[-12, 9.4], [-28, 9.4]],
        ...(g.districts.npcRoutes || []),
      ];
      const n = g.settings.quality === 'low' ? 8 : g.settings.quality === 'medium' ? 14 : routes.length;
      routes.slice(0, n).forEach((r, i) => this.npcs.push(new Npc(g, { id: 'civ' + i, seed: 100 + i * 17, x: r[0][0], z: r[0][1], route: r })));
    }
    for (const npc of this.npcs) {
      if (day) {
        npc.mode = 'walk';
        npc.goneT = 0;
        npc.speed = 1.3 + Math.random() * 0.4;
        npc.model.root.visible = true;
      } else if (npc.mode !== 'flee') npc.mode = 'gone';
    }
  }

  // ---------- Événements de zone / de phase ----------
  onZone(name, prev) {
    const g = this.game;
    if (name === 'school') {
      this.#populateSchool();
      g.missionEvents(g.missions.handle({ type: 'event', id: 'enter_school' }));
    } else {
      for (const n of this.students) n.dispose();
      this.students = [];
      this.teacher?.dispose();
      this.teacher = null;
    }
    if (prev === 'school' && name === 'city' && this.stage() === 'prologue' && g.clock.phase === 'afternoon') {
      // On sort du lycée : la lumière tourne au crépuscule.
      g.clock.phase = 'evening';
      this.nightTween = { from: g.night, to: 0, t: 0, dur: 4 };
    }
    this.#placeFriends();
  }

  onPhase(phase) {
    this.#cityState(phase === 'night', true);
    this.#ambient(phase !== 'night');
    this.#placeFriends();
    this.#updateHint(false);
  }

  // ---------- Interactions propres à l'histoire ----------
  interactables() {
    const g = this.game;
    const out = [];
    const st = this.stage();
    const T = g.world.targets;
    const Z = g.interiors.zones;
    const life = this.lifeMode();
    // Une séquence non cinématique (SMS du réveil…) ne bloque pas les interactions.
    if (this.seq?.cinematic || this.social.active) return out;
    if (g.zone === 'city') {
      if (this.drone && !this.drone.done && g.missions.currentStep('m02_aegis_echo')?.target === 'aegis_drone') {
        out.push({ kind: 'story', id: 'aegis_drone', pos: T.aegis_drone, label: '<kbd>E</kbd>Récupérer l’enregistrement — <span style="color:#5fe3ff">drone Aegis</span>' });
      }
      if (st === 'chase' && this.missions.stepReached('p02_nightfall', 1) && this.case && !this.case.opened) {
        out.push({ kind: 'story', id: 'aegis_case', pos: T.aegis_case, label: '<kbd>E</kbd>Approcher du cristal <span style="color:#5fe3ff">Aegis</span>' });
      }
      if (this.ooze && !this.ooze.taken) out.push({ kind: 'story', id: 'abyss_ooze', pos: T.abyss_ooze, label: '<kbd>E</kbd>Toucher la <span style="color:#9a7aff">substance noire</span>' });
      if (T.school_door && (st === 'prologue' || life)) {
        const open = g.clock.phase !== 'night';
        out.push({ kind: 'story', id: 'school_enter', pos: T.school_door, label: open ? '<kbd>E</kbd>Entrer dans le <b>lycée Vesper-Nord</b>' : '<span style="color:#ff6a6a">Lycée fermé la nuit</span>' });
      }
      if (T.home_door && life) out.push({ kind: 'story', id: 'home_enter', pos: T.home_door, label: '<kbd>E</kbd>Rentrer à la maison' });
    } else if (g.zone === 'school') {
      const S = Z.school;
      out.push({ kind: 'story', id: 'school_exit', pos: { ...S.exit, y: 0 }, label: '<kbd>E</kbd>Sortir du lycée' });
      if (st === 'prologue' && g.missions.currentStep('p01_after_school')?.target === 'locker') {
        out.push({ kind: 'story', id: 'locker', pos: { ...S.locker, y: 0 }, label: '<kbd>E</kbd>Ouvrir le casier <b>117</b>' });
      }
      if (this.cpe && this.cpe.mode !== 'gone') {
        const job = this.missions.currentStep('b01_bully')?.target === 'cpe';
        out.push({ kind: 'story', id: 'cpe', pos: this.cpe.pos, label: `<kbd>E</kbd>${job ? 'Parler à' : 'Saluer'} <span style="color:#7fe0d0">Mme Ferrand</span> <small>(CPE)</small>` });
      }
      if (life && this.social.canAttendLesson() && this.teacher) {
        const seat = this.#lessonSeat();
        out.push({ kind: 'story', id: 'lesson', pos: { x: seat.x, y: 0, z: seat.z }, label: `<kbd>E</kbd>S’asseoir — cours de <b>${this.social.lesson().subject}</b>` });
      }
    } else if (g.zone === 'home') {
      const Hm = Z.home;
      out.push({ kind: 'story', id: 'home_exit', pos: { ...Hm.exit, y: 0 }, label: '<kbd>E</kbd>Sortir' });
      if (life) {
        const night = g.clock.phase === 'night';
        out.push({ kind: 'story', id: 'bed', pos: { ...Hm.bed, y: 0 }, label: night ? '<kbd>E</kbd>Dormir jusqu’au matin' : '<kbd>E</kbd>Se reposer jusqu’à la nuit' });
        if (Hm.fridge) out.push({ kind: 'story', id: 'fridge', pos: { ...Hm.fridge, y: 0 }, label: '<kbd>E</kbd>Frigo — manger quelque chose' });
      }
    }
    return out;
  }

  interact(it) {
    const g = this.game;
    const T = g.world.targets;
    const Z = g.interiors.zones;
    switch (it.id) {
      case 'aegis_case': return this.#awakening();
      case 'aegis_drone': return this.#playRecording();
      case 'abyss_ooze': return this.#oozeBond();
      case 'school_enter':
        if (g.clock.phase === 'night') return g.audio.denied();
        g.audio.door();
        return g.transition(() => g.enterZone('school'));
      case 'school_exit': {
        g.audio.door();
        const d = T.school_door;
        return g.transition(() => g.enterZone('city', { x: d.x, y: 0.15, z: d.z - 2.2, yaw: Math.PI }));
      }
      case 'home_enter':
        g.audio.door();
        return g.transition(() => g.enterZone('home'));
      case 'home_exit': {
        g.audio.door();
        const d = T.home_door;
        return g.transition(() => g.enterZone('city', { x: d.x, y: 0.15, z: d.z - 2, yaw: Math.PI }));
      }
      case 'locker':
        g.hero.playAnim('interact', 0.9);
        g.audio.door();
        g.hud.toast('Sac récupéré. Une photo de ton père est scotchée dans le casier.', '#ffcd20');
        this.#say('Noa', 'Salut, papa. Pas aujourd’hui, les souvenirs.', 3);
        return g.missionEvents(g.missions.handle({ type: 'interact', target: 'locker' }));
      case 'lesson': return this.#lesson();
      case 'cpe': return this.#cpeTalk();
      case 'bed': return this.#sleep();
      case 'fridge':
        g.hero.hp = g.hero.stats.maxHp;
        g.hero.playAnim('interact', 0.8);
        g.hud.toast('Mot de maman sur le frigo : « Mange quelque chose de chaud. Je t’aime. » — santé restaurée', '#ffcd20');
        return;
      default:
        void Z;
    }
  }

  // Un ami propose une scène imposée par une mission (« parler à… »).
  onFriendTalk(id) {
    const g = this.game;
    const mission = g.missions.activeIds().find((mid) => {
      const step = g.missions.currentStep(mid);
      return step?.type === 'talk' && step.target === id;
    });
    if (!mission) return false;
    const done = () => g.missionEvents(g.missions.handle({ type: 'interact', target: id }));
    if (mission === 'b01_bully') return this.#bullyTalk(id, done);
    if (mission === 'p01_after_school') {
      if (id === 'malik') this.social.playScene('malik_corridor', done);
      else if (id === 'ines') this.social.playScene('ines_gate', () => this.#inesBus(done));
      return true;
    }
    const sc = this.social.nextScene(id);
    if (sc) {
      this.social.seen.add(sc.id);
      this.social.talkedDay[id] = g.clock.day;
      this.social.run(sc.lines, { with: this.social.friends[id], char: id, onEnd: done });
    } else this.social.run([[id, 'Te voilà ! Je t’attendais.']], { with: this.social.friends[id], char: id, onEnd: done });
    return true;
  }

  blocksTalk(id) {
    // Pendant le cours du prologue, Camille chuchote… mais on ne se lève pas.
    return this.stage() === 'prologue' && !this.missions.stepReached('p01_after_school', 1) && id === 'camille';
  }

  // ---------- Prologue : le cours de physique ----------
  #classIntro() {
    const g = this.game;
    const S = g.interiors.zones.school;
    if (g.zone !== 'school') g.enterZone('school');
    const seat = S.noaSeat;
    const hero = g.hero;
    hero.placeAt({ x: seat.x, y: 0, z: seat.z }, seat.yaw);
    hero.pose = 'sit';
    hero.suspended = true;
    g.camYaw = seat.yaw;
    // Camille, assise juste à côté.
    const near = (S.seats.labo || []).filter((s) => !this.#isNoaSeat('labo', s)).sort((a, b) => Math.hypot(a.x - seat.x, a.z - seat.z) - Math.hypot(b.x - seat.x, b.z - seat.z))[0];
    if (near) this.social.placeFriends({ camille: { x: near.x, y: 0, z: near.z, yaw: near.yaw, pose: 'sit' } });
    const t = S.teacher.labo;
    const frag = S.fragment;
    this.#run([
      { wait: 0, do: () => {
        g.hud.chapter('PROLOGUE', 'Après les cours', 'Vesper, 16 h 55. Lycée Vesper-Nord, labo de physique.', 5);
        this.cine = { pos: V(t.x, 2.2, t.z).lerp(V(seat.x, 1.6, seat.z), 0.25), look: V(seat.x, 1.0, seat.z) };
      } },
      { wait: 3.2, do: () => {
        this.cine = { pos: V(seat.x, 1.4, seat.z).add(V(Math.sin(seat.yaw) * -1.6, 0.2, Math.cos(seat.yaw) * -1.6)), look: V(frag.x, frag.y, frag.z), lerp: 1.2 };
      } },
    ], {
      cinematic: true,
      onEnd: () => {
        const camilleLines = SCENES.find((s) => s.id === 'camille_lab').lines.map((n) => (n.choices ? { ...n, choices: n.choices.map((c) => ({ ...c, char: 'camille' })) } : n));
        this.social.seen.add('camille_lab');
        this.social.run([
          [DELCOURT, '… et voici le clou du spectacle. Un fragment prêté par les laboratoires Aegis. Tombé près de Blackwood il y a trente ans.'],
          [DELCOURT, 'Il réagit aux champs magnétiques. Personne ne sait vraiment pourquoi. Pas même Aegis.'],
          ...camilleLines,
          [DELCOURT, 'Vant ! Puisque vous bavardez, venez donc tenir l’aimant. Allez.'],
        ], { with: this.teacher, char: 'camille', onEnd: () => this.#fragmentShock() });
      },
    });
  }

  #fragmentShock() {
    const g = this.game;
    const S = g.interiors.zones.school;
    const hero = g.hero;
    const frag = S.fragment;
    const fp = V(frag.x, frag.y, frag.z);
    const stand = fp.clone().add(V(0, 0, 0)).setY(0);
    const t = S.teacher.labo;
    // Noa se place devant la vitrine, côté classe.
    const dir = V(t.x - frag.x, 0, t.z - frag.z);
    const side = dir.lengthSq() > 0.01 ? V(-dir.z, 0, dir.x).normalize() : V(1, 0, 0);
    stand.addScaledVector(side, 1.1);
    hero.pose = null;
    hero.suspended = false;
    hero.placeAt({ x: stand.x, y: 0, z: stand.z }, Math.atan2(fp.x - stand.x, fp.z - stand.z));
    this.#run([
      { wait: 0.2, do: () => {
        hero.playAnim('interact', 1.4);
        this.cine = { pos: stand.clone().add(V(0, 1.5, 0)).addScaledVector(side, 2.2).add(V(dir.x, 0, dir.z).normalize().multiplyScalar(1.2)), look: fp.clone().lerp(stand.clone().add(V(0, 1.2, 0)), 0.4) };
      } },
      { wait: 1.0, do: () => {
        // Le fragment s'illumine et « pique » Noa ; les aimants du labo volent vers lui.
        g.fx.flash(fp, '#5fe3ff', 60, 0.5);
        g.fx.starBurst(fp, '#7fe3ff', 2.5);
        g.audio.parry();
        g.shake(0.4);
        if (frag.mesh?.material?.emissiveIntensity != null) frag.mesh.material.emissiveIntensity = 6;
        for (let i = 0; i < 6; i++) g.fx.emit(fp.clone().add(V((Math.random() - 0.5) * 5, 0.6 + Math.random(), (Math.random() - 0.5) * 5)), { count: 4, color: '#c9d8ff', speed: 3, size: 0.12, life: 0.5, gravity: 0, dir: stand.clone().add(V(0, 1.2, 0)).sub(fp).normalize() });
        hero.playAnim('scared', 1.6);
      } },
      { wait: 1.4, do: () => {
        this.#say('Noa', 'Aïe ! Il… il m’a piqué ?!', 2.5);
        this.#say(DELCOURT, '… Fascinant. Il ne fait jamais ça. Jamais.', 3);
        if (frag.mesh?.material?.emissiveIntensity != null) frag.mesh.material.emissiveIntensity = 1.2;
      } },
      { wait: 3.0, do: () => {
        g.audio.schoolBell();
        this.#say(DELCOURT, 'Bon. La cloche. Vant, vous restez vingt minutes ranger le labo. Les autres, dehors !', 4);
        for (const n of this.students) if (n.pose === 'sit') n.mode = 'gone';
      } },
      { wait: 2.5, do: () => g.hud.toast('Vingt minutes plus tard…', '#c9b8ff') },
    ], {
      cinematic: true,
      onEnd: () => {
        hero.pose = null;
        hero.suspended = false;
        g.missionEvents(g.missions.handle({ type: 'event', id: 'class_over' }));
        this.teacher?.dispose();
        this.teacher = null;
        this.#placeFriends();
        g.save('story');
      },
    });
  }

  // Inès part en bus ; maman écrit ; Noa décide de couper par Halden.
  #inesBus(done) {
    const g = this.game;
    const ines = this.social.friends.ines;
    const stop = g.world.street.schoolStop || g.world.street.busStop;
    this.flags.add('ines_left');
    ines.walkPath([[stop.x + 1.2, stop.z + 0.6]], 2.0, 'idle');
    ines.onArrive = () => ines.faceTo(V(stop.x, 0, 0));
    g.world.street.callBus({
      wait: 3,
      stopX: stop.x,
      waitFor: () => ines.mode === 'idle' || ines.mode === 'gone',
      onDepart: () => {
        ines.mode = 'gone';
      },
    });
    done();
    this.#run([
      { wait: 2.5, do: () => {
        g.audio.phoneBuzz();
        g.hero.playAnim('phone', 4.5, false);
        g.hud.phone('Maman', "Je suis de garde jusqu'à 7 h. Il y a des plats au frigo. Rentre directement, d'accord ? Il y a des coupures partout. ❤");
      } },
      { wait: 3, do: () => this.#say('Noa', '« Rentre directement. » Comme d’hab.', 3) },
      { wait: 3, do: () => this.#say('Noa', 'Je coupe par la place Halden, ça ira plus vite.', 3) },
    ]);
  }

  // ---------- Chapitre 1 (suite) ----------
  #spawnCrawlers(n, fromRoofs = true) {
    const g = this.game;
    const spots = [[17, 30], [24, 36], [27, 30]];
    for (let i = 0; i < n; i++) {
      const [x, z] = spots[i];
      const e = g.spawnEnemy({ type: 'crawler', x, z, group: 'crawlers', patrol: [[x, z]] });
      if (fromRoofs) {
        // Tombent des toits de la ruelle.
        e.pos.y = 12 + i * 2;
        e.vy = -2;
      }
      e.alertTo(g.hero.pos);
    }
  }

  #ensureDrone() {
    if (this.drone) return;
    const g = this.game;
    const t = g.world.targets.aegis_drone;
    const grp = new THREE.Group();
    const white = new THREE.MeshToonMaterial({ color: '#e8ecff' });
    const dark = new THREE.MeshToonMaterial({ color: '#2b2050' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.7), white);
    body.position.y = 0.2;
    grp.add(body);
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.5), dark);
      arm.position.set(x * 0.6, 0.22, z * 0.6);
      arm.rotation.y = Math.atan2(x, z);
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 12), dark);
      rotor.position.set(x, 0.3, z);
      rotor.rotation.z = Math.random() * 0.5;
      grp.add(arm, rotor);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#5fe3ff' }));
    led.position.set(0, 0.34, 0.3);
    grp.add(led);
    grp.position.set(t.x, t.y, t.z);
    grp.rotation.set(0.25, 0.6, 0.15);
    g.scene.add(grp);
    this.drone = { grp, led, done: false };
  }

  #playRecording() {
    const g = this.game;
    this.drone.done = true;
    g.hero.playAnim('interact', 1.2);
    g.audio.phoneBuzz();
    const L = [
      ['Julien Vant (enregistrement)', 'Journal du projet ANNEAU, entrée quarante-trois. Si ce message est lu, c’est que le cristal a choisi quelqu’un.'],
      ['Julien Vant (enregistrement)', '… Noa. Si c’est toi qui entends ça, je suis désolé. Je n’ai pas eu le temps de t’expliquer.'],
      ['Julien Vant (enregistrement)', 'Aegis voulait une arme. Le cristal, lui, cherche un porteur. Il réveille ce que le porteur a déjà en lui.'],
      ['Julien Vant (enregistrement)', 'Toi, tu as toujours fait sauter les aimants du frigo en passant. Ta mère riait. Moi, j’avais peur.'],
      ['Julien Vant (enregistrement)', 'Et méfie-toi de Hollis. Il sait ce qu’il y a sous la ville. Il l’a toujours su.'],
      ['Noa', '… Papa.'],
    ];
    L.forEach(([w, t]) => this.#say(w, t, 5));
    this.#run([{ wait: 1.2, do: () => g.missionEvents(g.missions.handle({ type: 'interact', target: 'aegis_drone' })) }]);
  }

  // Le Colosse sort de la faille de la place Halden.
  #colossusIntro() {
    const g = this.game;
    const hp = g.hero.pos.clone();
    let boss = null;
    this.#run([
      { wait: 0, do: () => {
        g.audio.rumble(6);
        g.shake(0.6);
        this.cine = { pos: V(10, 2.2, 12), look: V(0, 2, -14) };
        this.#say('Noa', 'Le sol… il se soulève.', 3);
      } },
      { wait: 1.6, do: () => {
        boss = g.spawnBoss({ x: 0, z: -14 });
        boss.introDur = 4;
        boss.yaw = Math.atan2(hp.x, hp.z + 14);
        g.fx.ring({ x: 0, y: 0.15, z: -14 }, { color: '#b070ff', from: 1, to: 14, life: 1.2 });
        this.cine = { pos: V(8, 1.2, 4), look: V(0, 6, -14), lerp: 0.8 };
      } },
      { wait: 3.6, do: () => {
        this.cine = { pos: V(4, 3, 2), look: V(0, 8, -14), lerp: 1.2 };
        g.hud.chapter('BOSS', 'Le Colosse', 'Son armure encaisse. Trouve l’ouverture. Les voitures autour… sont en métal.', 4);
      } },
      { wait: 2.6, do: () => this.#say('Mara (radio)', 'Ses noyaux brillent quand il s’épuise. C’est là qu’il faut frapper, Noa.', 4) },
    ], { cinematic: true });
  }

  #afterColossus() {
    const g = this.game;
    this.#run([
      { wait: 1.5, do: () => {
        this.#say('Mara (radio)', 'Tu l’as fait. Un lycéen contre ça. Je n’y croyais pas moi-même.', 4);
        this.#say('Mara (radio)', 'Le nom que ton père a donné : Hollis. Directeur de la recherche d’Aegis. Ses labos sont dans la forêt de Blackwood.', 5);
      } },
      { wait: 9, do: () => {
        g.audio.phoneBuzz();
        g.hud.phone('Inès', 'Noa ?? Y’a une vidéo d’un mec qui VOLE au-dessus d’Halden. Il a TON sweat. Rappelle-moi. Maintenant.', 8);
      } },
      { wait: 3, do: () => this.#say('Noa', '… Oh non.', 2.5) },
      { wait: 3, do: () => this.#say('Mara (radio)', 'Noa. La place Halden. Là où il est tombé… il reste une flaque noire. Et elle bouge.', 4.5) },
    ]);
  }

  // ---------- L'Ombre : la substance noire se lie à Noa ----------
  #ensureOoze() {
    if (this.ooze) return;
    const g = this.game;
    const t = g.world.targets.abyss_ooze || (g.world.targets.abyss_ooze = { x: 0, y: 0.15, z: -11 });
    const grp = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ color: '#140c22', emissive: '#2a1650', emissiveIntensity: 0.6 });
    const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mat);
    blob.scale.set(1.6, 0.35, 1.3);
    grp.add(blob);
    for (let i = 0; i < 7; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.25 + Math.random() * 0.2, 10, 8), mat);
      d.position.set((Math.random() - 0.5) * 3, 0.05, (Math.random() - 0.5) * 2.4);
      d.scale.y = 0.4;
      grp.add(d);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#5fe3ff' }));
    eye.position.set(0.3, 0.32, 0.4);
    grp.add(eye);
    const light = new THREE.PointLight('#7a5cff', 4, 8, 2);
    light.position.y = 1;
    grp.add(light);
    grp.position.set(t.x, t.y, t.z);
    g.scene.add(grp);
    this.ooze = { grp, blob, eye, light, taken: false };
  }

  #oozeBond() {
    const g = this.game;
    const hero = g.hero;
    const o = this.ooze;
    o.taken = true;
    const hp = hero.pos.clone();
    const op = o.grp.position.clone();
    hero.yaw = Math.atan2(op.x - hp.x, op.z - hp.z);
    this.#run([
      { wait: 0, do: () => {
        hero.playAnim('interact', 1.2);
        this.cine = { pos: hp.clone().add(V(2.2, 1.3, 2.2)), look: op.clone().add(V(0, 0.4, 0)) };
        this.#say('Noa', 'Elle… respire ?', 2.2);
      } },
      { wait: 1.8, do: () => {
        // La flaque bondit et s'enroule autour du bras de Noa.
        this.oozeLeap = { t: 0, from: op.clone(), to: hp.clone().add(V(0, 1.1, 0)) };
        hero.playAnim('scared', 2.2);
        g.audio.transform();
        g.shake(0.5);
        this.cine = { pos: hp.clone().add(V(-1.6, 1.4, 2.4)), look: hp.clone().add(V(0, 1.3, 0)), lerp: 3 };
      } },
      { wait: 1.2, do: () => {
        o.grp.visible = false;
        g.fx.emit(hp.clone().add(V(0, 1.2, 0)), { count: 50, color: '#140c22', speed: 4, size: 0.35, life: 0.9, gravity: -1 });
        hero.abyss = 100;
        hero.setPowers({ umbra: true });
        this.#say('L’Ombre', 'Tu as tué la bête qui me retenait. Merci, petit aimant.', 3.5);
      } },
      { wait: 3.6, do: () => this.#say('Noa', 'Qui… qu’est-ce que t’es ?! Sors de ma tête !', 3) },
      { wait: 3.2, do: () => this.#say('L’Ombre', 'Je suis ce qui vit de l’autre côté de la faille. Et maintenant, je vis en toi. Laisse-moi sortir. Juste une fois.', 4.5) },
      { wait: 4.6, do: () => g.hud.chapter('CHAPITRE 1', 'L’Ombre', 'Une force qui n’est pas la tienne. Pas encore.', 4) },
    ], {
      cinematic: true,
      onEnd: () => {
        hero.abyss = 100;
        hero.setPowers({ umbra: true });
        o.grp.visible = false;
        g.missionEvents(g.missions.handle({ type: 'interact', target: 'abyss_ooze' }));
        this.#updateHint(true);
        g.save('story');
      },
    });
  }

  #spawnUmbraTest(n = 4) {
    const g = this.game;
    const spots = [[-14, -18, 'stalker'], [14, -18, 'stalker'], [-16, 14, 'stalker'], [0, -26, 'brute']];
    for (let i = 4 - n; i < 4; i++) {
      const [x, z, type] = spots[i];
      const e = g.spawnEnemy({ type, x, z, group: 'umbra_test', patrol: [[x, z]] });
      e.alertTo(g.hero.pos);
    }
  }

  // Fin de la nuit : on rentre, on dort, le lendemain commence.
  #endOfNight() {
    const g = this.game;
    g.hud.chapter('FIN DU CHAPITRE 1', 'Vesper Downtown', 'Le quartier respire. Pour cette nuit.', 4.5);
    this.#run([{ wait: 5, do: () => {
      g.transition(() => {
        g.clock.day = Math.max(2, g.clock.day + 1);
        g.enterZone('home');
        g.setPhase('morning');
      }, () => this.#morningIntro());
    } }]);
  }

  #morningIntro() {
    const g = this.game;
    const Hm = g.interiors.zones.home;
    if (g.zone !== 'home') g.enterZone('home');
    g.hero.placeAt({ ...Hm.bed, y: 0 }, Hm.bed.yaw ?? 0);
    g.hud.chapter('CHAPITRE 2', 'Double vie', 'Lycéen le jour. Héros la nuit. Personne ne doit savoir.', 5);
    this.#run([
      { wait: 5.5, do: () => {
        g.audio.phoneBuzz();
        g.hud.phone('Maman', 'Bien rentrée de garde. Tu dormais comme un bébé. Les cours reprennent, le lycée a appelé. Mange ! ❤', 7);
      } },
      { wait: 4, do: () => {
        g.audio.phoneBuzz();
        g.hud.phone('Inès', 'Cafète, 8 h. Tu me dois des explications. Et un chocolat chaud.', 6);
      } },
      { wait: 3, do: () => this.#say('Noa', 'Une journée normale. Je peux faire ça. … Je crois.', 3) },
    ]);
    this.#placeFriends();
  }

  #lesson() {
    const g = this.game;
    const seat = this.#lessonSeat();
    const hero = g.hero;
    hero.placeAt({ x: seat.x, y: 0, z: seat.z }, seat.yaw ?? 0);
    hero.pose = 'sit';
    hero.suspended = true;
    this.social.attendLesson(this.teacher, () => {
      hero.pose = null;
      hero.suspended = false;
      for (const n of this.students) if (n.pose === 'sit') n.mode = 'gone';
      g.setPhase('afternoon');
      g.hud.toast(g.clockLabel() + ' — les cours sont finis', '#ffcd20');
      g.missionEvents(g.missions.handle({ type: 'event', id: 'lesson' }));
    });
  }

  #sleep() {
    const g = this.game;
    if (g.inCombat) return g.hud.toast('Impossible de dormir avec des créatures dehors… si près.', '#ff6a6a');
    const night = g.clock.phase === 'night';
    g.transition(() => {
      g.hero.hp = g.hero.stats.maxHp;
      g.hero.energy = g.hero.stats.maxEnergy;
      if (night) g.advancePhase('morning');
      else g.setPhase('night');
    }, () => {
      g.hud.toast(g.clockLabel(), '#ffcd20');
      if (!night) {
        g.missionEvents(g.missions.handle({ type: 'event', id: 'night' }));
        this.#say('Mara (radio)', 'La nuit tombe, Noa. Les failles se réveillent. Je compte sur toi.', 4);
      } else {
        g.audio.phoneBuzz();
        const p = this.social.partner;
        if (p) g.hud.phone(this.social.name(p), 'Bonjour toi ❤ On se voit au lycée ?', 6);
        else g.hud.phone('Maman', 'Bonne journée mon grand. Il reste des crêpes. ❤', 6);
      }
      g.save('sleep', true);
    });
  }

  // Point de réapparition après une mort (selon le chapitre).
  checkpoint() {
    const st = this.stage();
    const w = this.game.world;
    if (this.game.missions.state.m03_colossus?.status === 'active') return { x: 0, y: 0.15, z: 24, yaw: Math.PI };
    if (st === 'prologue') return { x: w.targets.school_door.x, y: 0.15, z: w.targets.school_door.z - 3, yaw: Math.PI };
    if (st === 'chase') return { x: 0, y: 0.15, z: -9, yaw: Math.PI * 0.75 };
    if (st === 'tutorial') return { x: 36, y: 0.15, z: -46, yaw: 0 };
    if (this.lifeMode() && w.targets.home_door) return { x: w.targets.home_door.x, y: 0.15, z: w.targets.home_door.z - 3, yaw: Math.PI };
    return w.spawn;
  }

  onRespawn() {
    const st = this.stage();
    const chaser = this.game.enemies.find((e) => e.spawn.group === 'chaser' && e.alive);
    if (st === 'chase' && chaser) {
      chaser.pos.set(-14, 0.15, 10);
      chaser.alert = false;
    }
  }

  #updateHint(show) {
    const p = this.powers();
    let html = p.flight ? HINTS.flight : p.rings ? HINTS.rings : HINTS.prologue;
    if (p.umbra) html += '<br>' + HINTS.umbra;
    this.game.hud.setHint(html);
    if (show) {
      this.game.hud.showHint(true);
      this.hintTimer = 28;
    }
  }

  // Valise Aegis lumineuse dans la camionnette accidentée : le gros cristal.
  #ensureCase(opened = false) {
    if (this.case) return;
    const g = this.game;
    const t = g.world.targets.aegis_case;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.55), new THREE.MeshToonMaterial({ color: '#e8ecff' }));
    body.position.y = 0.13;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 0.57), new THREE.MeshToonMaterial({ color: '#5fe3ff', emissive: '#5fe3ff', emissiveIntensity: 1.5 }));
    band.position.y = 0.2;
    // Le cristal (même matière que le fragment du labo, en plus gros).
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshToonMaterial({ color: '#1d1530', emissive: '#5fe3ff', emissiveIntensity: 1.2 }));
    crystal.position.y = 0.48;
    crystal.scale.y = 1.6;
    const light = new THREE.PointLight('#5fe3ff', 6, 7, 2);
    light.position.y = 0.8;
    grp.add(body, band, crystal, light);
    grp.position.set(t.x, t.y, t.z);
    grp.rotation.y = 0.4;
    g.scene.add(grp);
    this.case = { grp, light, band, crystal, opened };
    if (opened) {
      light.intensity = 0;
      band.material.emissiveIntensity = 0.1;
      crystal.visible = false;
    }
  }

  #spawnChaser(pos, scripted = true) {
    const g = this.game;
    const e = g.spawnEnemy({ type: 'stalker', x: pos.x, z: pos.z, group: 'chaser', chaser: scripted, patrol: [[pos.x, pos.z]] });
    e.id = 'chaser';
    this.chaser = e;
    return e;
  }

  // ---------- Séquences ----------
  // run([{ wait, do }, …]) : exécute chaque action après son délai (temps de jeu).
  #run(steps, { cinematic = false, onEnd } = {}) {
    this.seq = { steps, i: 0, t: 0, cinematic, onEnd };
    if (cinematic) this.#cineOn();
  }

  #cineOn() {
    const g = this.game;
    g.hero.cinematic = true;
    g.hud.cinematic(true);
    g.lockTarget = null;
  }

  #cineOff() {
    const g = this.game;
    g.hero.cinematic = false;
    g.hero.suspended = !!g.hero.pose;
    g.hud.cinematic(false);
    this.cine = null;
    g.camPos = null;
  }

  get inCinematic() {
    return !!this.seq?.cinematic;
  }

  skip() {
    if (!this.seq?.cinematic) return;
    // Exécute instantanément le reste de la séquence.
    const s = this.seq;
    for (let i = s.i; i < s.steps.length; i++) s.steps[i].do?.();
    this.#endSeq();
  }

  #endSeq() {
    const s = this.seq;
    this.seq = null;
    if (s.cinematic) this.#cineOff();
    s.onEnd?.();
  }

  #say(who, text, dur = 4.2) {
    this.game.hud.say(who, text, dur);
  }

  // Le Nightfall : ciel qui se déchire, coupure, première créature.
  #nightfall() {
    const g = this.game;
    const hero = g.hero;
    const hp = hero.pos.clone();
    g.clock.phase = 'night';
    this.#run([
      { wait: 0, do: () => {
        this.cine = { pos: hp.clone().add(V(3, 1.2, 3)), look: hp.clone().add(V(0, 1.5, 0)) };
        g.audio.rumble(6);
        g.shake(0.4);
        hero.yaw = Math.PI;
        this.#say('Noa', '… Qu’est-ce que… ?', 2.5);
        for (const npc of this.npcs) if (npc.mode !== 'gone') npc.play('scared', 3);
      } },
      { wait: 2.2, do: () => {
        // On regarde vers le nord : le ciel bascule.
        this.cine = { pos: hp.clone().add(V(0, 1.2, 4)), look: V(30, 140, -600), lerp: 1.5 };
        this.nightTween = { from: g.night ?? 0, to: 1, t: 0, dur: 3.5 };
        g.shake(0.6);
      } },
      { wait: 1.6, do: () => {
        g.world.setPower(false);
        g.audio.blackout();
        // Le séisme fait tomber le haut de l'obélisque ; la circulation s'arrête.
        g.world.toppleMonument();
        g.world.street.setTraffic(false);
        g.shake(0.8);
      } },
      { wait: 0.3, do: () => g.world.setPower(true) },
      { wait: 0.2, do: () => g.world.setPower(false) },
      { wait: 1.6, do: () => {
        this.cine = { pos: hp.clone().add(V(-2.5, 1.0, -3)), look: hp.clone().add(V(0, 1.6, 0)), lerp: 3 };
        hero.playAnim('scared', 2.5);
        g.audio.startRain?.();
        for (const npc of this.npcs) npc.flee(hp);
        this.#say('Noa', 'Le ciel… Le ciel est en train de se déchirer.', 3);
      } },
      { wait: 2.6, do: () => {
        g.world.setPower(true);
        const c = this.#spawnChaser(V(-14, 0.15, 10));
        c.yaw = Math.atan2(hp.x - c.pos.x, hp.z - c.pos.z);
        this.cine = { pos: hp.clone().add(V(-4, 1.4, 2)), look: V(-14, 1.6, 10), lerp: 2 };
        g.audio.stalkerHiss(c.pos);
      } },
      { wait: 2.4, do: () => this.#say('Noa', 'Non. Non, non, non…', 2.5) },
      { wait: 1.5, do: () => {
        g.hud.chapter('CHAPITRE 0', 'La nuit tombe', 'Tu n’as aucun pouvoir. Cours.', 4);
      } },
    ], {
      cinematic: true,
      onEnd: () => {
        g.setNight(1);
        this.#cityState(true, false);
        this.nightTween = null;
        for (const npc of this.npcs) npc.flee(hp);
        this.#ensureCase();
        if (!this.chaser?.alive) this.#spawnChaser(V(-14, 0.15, 10));
        g.save('story');
      },
    });
  }

  // L'éveil : le cristal se dissout dans Noa ; son magnétisme arrache le métal
  // alentour et le forge en dix anneaux autour de ses avant-bras.
  #awakening() {
    const g = this.game;
    const hero = g.hero;
    const c = this.case;
    c.opened = true;
    const hp = hero.pos.clone();
    const cp = c.grp.position.clone().add(V(0, 0.5, 0));
    hero.yaw = Math.atan2(c.grp.position.x - hp.x, c.grp.position.z - hp.z);
    const chaser = this.chaser?.alive ? this.chaser : this.#spawnChaser(hp.clone().add(V(-6, 0, 4)));
    const props = g.magnet.props.filter((p) => p.state === 'rest' && p.pos.distanceTo(hp) < 26);
    this.#run([
      { wait: 0, do: () => {
        hero.playAnim('interact', 1.2);
        this.cine = { pos: hp.clone().add(V(1.5, 1.2, 1.8)), look: cp };
        this.#say('Noa', 'Le même cristal qu’au labo… en plus gros. Il pulse. Comme mon bras.', 3);
      } },
      { wait: 2.4, do: () => {
        // La créature bondit par derrière.
        chaser.pos.copy(hp).add(V(-5, 0, 3));
        chaser.yaw = Math.atan2(hp.x - chaser.pos.x, hp.z - chaser.pos.z);
        chaser.alert = true;
        g.audio.stalkerHiss(chaser.pos);
        this.cine = { pos: hp.clone().add(V(3, 2.2, -3)), look: chaser.pos.clone().add(V(0, 1.2, 0)), lerp: 4 };
        hero.playAnim('scared', 1.5);
      } },
      { wait: 1.2, do: () => {
        // Noa lève la main : le cristal se brise et sa lumière remonte le long de son bras.
        c.crystal.visible = false;
        c.light.intensity = 30;
        g.fx.flash(cp, '#5fe3ff', 120, 0.6);
        g.fx.emit(cp, { count: 40, color: '#7fe3ff', speed: 6, size: 0.2, life: 0.6, gravity: 0, dir: hp.clone().add(V(0, 1.2, 0)).sub(cp).normalize() });
        g.audio.awaken();
        hero.playAnim('awaken', 4.4);
        hero.suspended = true;
        this.cine = { pos: hp.clone().add(V(0, 1.4, 4.2)), look: hp.clone().add(V(0, 1.5, 0)), lerp: 1.2, orbit: 0.35 };
        this.#say('Noa', 'Qu’est-ce qui m’arrive ?!', 2);
      } },
      { wait: 0.8, do: () => {
        // Tout le métal alentour vibre, puis s'arrache en éclats.
        this.propShake = { list: props, t: 0 };
        g.shake(0.6);
        g.audio.magnetGrab(hp);
        hero.pos.y = hp.y + 0.4;
      } },
      { wait: 1.2, do: () => {
        // Les éclats volent vers Noa et se forgent en anneaux.
        hero.setPowers({ rings: true, magnet: true });
        hero.rings.placed = false;
        hero.rings.set('awaken', { dur: 3.2 });
        hero.rings.rings.forEach((r, i) => {
          const src = props[i % Math.max(1, props.length)]?.pos || hp;
          r.pos.copy(src).add(V((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2));
        });
        for (const p of props) g.fx.emit(p.pos.clone().add(V(0, 1, 0)), { count: 12, color: '#dfe6f5', speed: 4, size: 0.12, life: 0.5, gravity: 2 });
        g.audio.crash(hp);
      } },
      { wait: 2.4, do: () => {
        // Onde magnétique : la créature est projetée.
        this.propShake = null;
        for (const p of props) p.g.position.y = p.pos.y;
        hero.pos.y = hp.y;
        g.fx.ring(hp, { color: '#7fe3ff', from: 0.5, to: 12, life: 0.7 });
        g.fx.ring(hp, { color: '#ffffff', from: 0.3, to: 6, life: 0.4, y: 1 });
        g.fx.dustRing(hp, 3, 24);
        g.shake(0.8);
        g.audio.boost();
        const dir = chaser.pos.clone().sub(hp).setY(0).normalize();
        chaser.vel.addScaledVector(dir, 22);
        chaser.spawn.chaser = false;
        chaser.stagger(2.5);
        c.light.intensity = 0;
        c.band.material.emissiveIntensity = 0.1;
        hero.rings.set('idle');
        this.cine = { pos: hp.clone().add(V(-2.2, 1.3, 2.4)), look: hp.clone().add(V(0, 1.3, 0)), lerp: 2 };
      } },
      { wait: 1.6, do: () => this.#say('Noa', 'Le métal… il m’obéit. C’est MOI qui fais ça ?', 3) },
      { wait: 2.2, do: () => g.hud.chapter('CHAPITRE 0', 'Le réveil', 'Le métal de la ville répond à ta volonté.', 4) },
    ], {
      cinematic: true,
      onEnd: () => {
        hero.suspended = false;
        this.propShake = null;
        for (const p of props) p.g.position.y = p.pos.y;
        hero.setPowers({ rings: true, magnet: true });
        if (hero.rings.mode === 'awaken' || hero.rings.mode === 'hidden') hero.rings.set('idle');
        c.opened = true;
        c.light.intensity = 0;
        c.crystal.visible = false;
        g.missionEvents(g.missions.handle({ type: 'interact', target: 'aegis_case' }));
        this.#updateHint(true);
        g.recomputeStats();
        g.save('story');
      },
    });
  }

  // ---------- Réactions aux étapes de mission ----------
  onMissionEvent(ev) {
    const g = this.game;
    if (ev.type === 'missionComplete' && ev.id === 'p01_after_school') this.#nightfall();
    if (ev.type === 'stepComplete' && ev.id === 'p01_after_school') {
      const step = g.missions.state.p01_after_school.step;
      if (step === 1) this.#say('Noa', 'Vingt minutes à ranger des aimants. Super. Bon… Malik doit m’attendre.', 3.5);
      if (step === 3) this.#say('Noa', 'Inès doit déjà être devant. Elle va me tuer.', 3);
      this.#placeFriends();
    }
    if (ev.type === 'stepComplete' && ev.id === 'p02_nightfall') {
      this.#say('Noa', 'La camionnette… il y a quelque chose qui brille dedans. Bleu. Comme au labo.', 3.5);
    }
    if (ev.id === 'p03_rings' && ev.type === 'stepComplete') {
      const step = g.missions.state.p03_rings.step;
      if (step === 1) {
        this.#say('Noa', 'Je… je l’ai eu. OK. Respire. Respire.', 3.5);
        this.#say('Noa', 'Si je les pousse vers l’avant… tous en même temps ?', 3.5);
      } else if (step === 2) {
        this.#say('Noa', 'Ils reviennent tout seuls. Comme des aimants.', 3.5);
        this.#say('Noa', 'Et s’ils pouvaient me protéger ?', 3);
      } else if (step === 3) {
        this.#say('Noa', 'Ils réagissent avant moi… Et si je tirais sur quelque chose de plus gros ?', 3.5);
        this.#say('Noa', 'Cette voiture. Elle est en métal. Elle aussi.', 3);
      } else if (step === 4) {
        this.#say('Noa', 'J’ai soulevé une VOITURE. Avec ma tête. … Attends. Mes pieds…', 3.5);
        this.#say('Noa', 'Le métal du sol me repousse. Je… je peux voler ?!', 3.5);
        g.hero.setPowers({ flight: true });
        this.#updateHint(true);
      } else if (step === 5) {
        this.#say('Noa', 'C’EST INCROYABLE !', 2.5);
        this.#say('Noa', 'L’hôtel Lumen. De là-haut, je verrai tout le quartier.', 3.5);
      }
    }
    if (ev.type === 'missionComplete' && ev.id === 'p03_rings') {
      const L = [
        ['Mara (radio)', 'Joli vol, Noa Vant.'],
        ['Noa', 'Quoi ?! Qui êtes-vous ? Comment vous connaissez mon nom ?'],
        ['Mara (radio)', 'Je m’appelle Mara. J’ai piraté ton téléphone pendant que tu jouais les comètes.'],
        ['Mara (radio)', 'Ce cristal venait d’Aegis, comme la camionnette. Comme ton père. On en parlera.'],
        ['Mara (radio)', 'Pour l’instant, une faille s’est ouverte dans le parking Halden. Il en sort d’autres créatures.'],
        ['Noa', 'Et vous voulez que moi, j’y aille ? J’ai seize ans.'],
        ['Mara (radio)', 'Je veux que tu restes en vie. Et pour ça, il faut que tu apprennes. Nettoie le parking.'],
      ];
      L.forEach(([w, t]) => this.#say(w, t, 4.2));
      g.hud.chapter('CHAPITRE 1', 'Vesper Downtown', 'La ville a besoin d’un héros. Elle n’a qu’un lycéen.', 5);
      g.spawnGated();
    }
    if (ev.type === 'missionComplete' && ev.id === 'm01_first_contact') {
      this.#run([
        { wait: 9, do: () => {
          g.audio.phoneBuzz();
          g.hud.phone('Maman', 'Tu dors ? Les infos parlent de coupures et d’émeutes à Halden. Réponds-moi s’il te plaît.', 7);
        } },
        { wait: 3.5, do: () => this.#say('Noa', '« Je suis à la maison, t’inquiète. » … Envoyé.', 3) },
        { wait: 3, do: () => this.#say('Noa', 'Premier mensonge. Sûrement pas le dernier.', 3) },
        { wait: 3, do: () => this.#say('Mara (radio)', 'Noa. Je capte un signal Aegis dans la ruelle derrière Nova Market. On dirait… une voix.', 4.5) },
      ]);
    }
    if (ev.type === 'stepComplete' && ev.id === 'm02_aegis_echo') {
      const step = g.missions.state.m02_aegis_echo.step;
      if (step === 1) {
        this.#say('Noa', 'Le signal vient d’ici… Attends. Ça bouge sur les toits.', 3);
        this.#spawnCrawlers(3, true);
      } else if (step === 2) {
        this.#say('Noa', 'Un drone Aegis, écrasé. Sa lumière clignote encore.', 3);
        this.#ensureDrone();
      } else if (step === 3) {
        this.#say('Mara (radio)', 'J’ai tout entendu, Noa. Reviens au refuge. Prends ton temps.', 4);
      }
    }
    if (ev.type === 'missionComplete' && ev.id === 'm02_aegis_echo') {
      this.#say('Mara (radio)', 'Hollis… Je connais ce nom. On en reparlera. Pour l’instant, regarde dehors.', 4);
      this.#say('Mara (radio)', 'La faille de la place Halden s’élargit. Le sol se soulève. Il faut que tu y ailles.', 4.5);
    }
    if (ev.type === 'stepComplete' && ev.id === 'm03_colossus') {
      const step = g.missions.state.m03_colossus.step;
      if (step === 1) this.#colossusIntro();
      if (step === 2) {
        this.#say('Noa', 'Il… il est tombé. Je tremble encore.', 3);
        this.#say('Mara (radio)', 'Il a laissé quelque chose derrière lui, au coin de la rue Corvin.', 4);
      }
    }
    if (ev.type === 'missionComplete' && ev.id === 'm03_colossus') this.#afterColossus();
    if (ev.type === 'missionStart' && ev.id === 'm04_umbra') this.#ensureOoze();
    if (ev.type === 'stepComplete' && ev.id === 'm04_umbra') {
      const step = g.missions.state.m04_umbra.step;
      if (step === 1) this.#say('L’Ombre', 'Appuie, Noa. [T] Laisse-moi respirer.', 3.5);
      if (step === 2) {
        this.#say('L’Ombre', 'Elles sentent notre odeur. Qu’elles viennent.', 3);
        this.#spawnUmbraTest(4);
      }
      if (step === 3) {
        this.#say('Noa', 'Ça suffit. Rentre. RENTRE.', 2.5);
        this.#say('L’Ombre', 'Comme tu veux… pour l’instant.', 3);
        this.#say('Mara (radio)', 'Rentre chez toi, Noa. Aux Tilleuls. Dors. Demain, tu as cours.', 4);
      }
    }
    if (ev.type === 'missionComplete' && ev.id === 'm04_umbra') this.#endOfNight();
    if (ev.type === 'missionComplete' && ev.id === 'd01_double_life') {
      g.hud.chapter('CHAPITRE 2', 'Double vie', 'Vis ta vie. Protège la ville. Ne choisis pas… pour l’instant.', 5);
      this.#say('Mara (radio)', 'Tu as un contrat : « Ronde de nuit ». Et Théo cherche son frère, il paraît. Ça me dit quelque chose.', 5);
      this.#say('Mara (radio)', 'La suite de l’enquête — Blackwood, Hollis — arrive bientôt. Pour l’instant : vis, Noa.', 5);
    }
    if (ev.type === 'stepComplete' && ev.id === 'd01_double_life') this.#placeFriends();
    if (ev.type === 'missionStart') g.spawnGated();
  }

  // ---------- Mise à jour ----------
  update(dt) {
    const g = this.game;
    for (const n of this.npcs) n.update(dt);
    for (const n of this.students) n.update(dt);
    this.teacher?.update(dt);
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) g.hud.showHint(false);
    }
    if (this.nightTween) {
      const tw = this.nightTween;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      g.setNight(tw.from + (tw.to - tw.from) * (k * k * (3 - 2 * k)));
      if (k >= 1) this.nightTween = null;
    }
    if (this.case && !this.case.opened) {
      this.case.light.intensity = 5 + Math.sin(g.time * 4) * 2;
      this.case.crystal.rotation.y += dt * 1.5;
    }
    if (this.ooze && !this.ooze.taken) {
      const o = this.ooze;
      o.blob.scale.y = 0.35 + Math.sin(g.time * 2.4) * 0.06;
      o.light.intensity = 3 + Math.sin(g.time * 3) * 1.5;
    }
    if (this.oozeLeap) {
      const L = this.oozeLeap;
      L.t = Math.min(1, L.t + dt / 0.9);
      this.ooze.grp.position.lerpVectors(L.from, L.to, L.t);
      this.ooze.grp.position.y += Math.sin(L.t * Math.PI) * 1.5;
      this.ooze.grp.scale.setScalar(1 - L.t * 0.7);
      if (L.t >= 1) this.oozeLeap = null;
    }
    if (this.propShake) {
      const P = this.propShake;
      P.t += dt;
      for (const p of P.list) p.g.position.y = p.pos.y + Math.min(1, P.t) * 0.5 + Math.sin(P.t * 40 + p.pos.x) * 0.06;
    }
    if (this.cine?.orbit) {
      const c = this.cine;
      const off = c.pos.clone().sub(c.look).setY(0);
      off.applyAxisAngle(V(0, 1, 0), c.orbit * dt);
      c.pos.set(c.look.x + off.x, c.pos.y, c.look.z + off.z);
    }

    // Tutoriel : bouclier levé
    if (this.stage() === 'tutorial' && g.missions.currentStep('p03_rings')?.id === 'shield' && g.hero.shielding && g.hero.shieldT > 0.3) {
      g.missionEvents(g.missions.handle({ type: 'event', id: 'shield' }));
    }

    const s = this.seq;
    if (!s) return;
    s.t += dt;
    while (s.i < s.steps.length && s.t >= (s.steps[s.i].wait || 0)) {
      s.t -= s.steps[s.i].wait || 0;
      s.steps[s.i].do?.();
      s.i++;
    }
    if (s.i >= s.steps.length && s.t > 0.8) this.#endSeq();
  }
}
