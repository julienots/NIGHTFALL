// Mise en scène de l'histoire : prologue (ado sans pouvoirs), Nightfall,
// poursuite, éveil des anneaux, tutoriel, arrivée de Mara.
// Les cinématiques avancent en temps de jeu (testables, synchronisées).
import * as THREE from 'three';
import { Npc } from '../actors/npc.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const HINTS = {
  prologue: `<span class="kbd">ZQSD/WASD</span>marcher · <span class="kbd">Maj</span>courir · <span class="kbd">Espace</span>sauter<br>
    <span class="kbd">Ctrl/C</span>rouler · <span class="kbd">E</span>parler / interagir · <span class="kbd">J</span>journal · <span class="kbd">Échap</span>pause`,
  rings: `<span class="kbd">Clic G</span>coups d'anneaux · <span class="kbd">Clic D</span>fouet d'anneaux · <span class="kbd">F</span>rafale<br>
    <span class="kbd">G</span>bouclier (le lever au dernier moment = parade) · <span class="kbd">Ctrl/C</span>rouler<br>
    <span class="kbd">R</span>verrouiller · <span class="kbd">H</span>soin · <span class="kbd">I</span>inventaire · <span class="kbd">J</span>journal`,
  flight: `<span class="kbd">V</span>décoller / se poser · <span class="kbd">ZQSD</span>voler vers où tu regardes<br>
    <span class="kbd">Espace</span>monter · <span class="kbd">Ctrl/C</span>descendre · <span class="kbd">Maj</span>boost · <span class="kbd">Clic G</span>piqué fracassant`,
};

const INES_TALK = [
  ['Inès', "Noa ! T'as encore fini en retenue avec Delcourt ?"],
  ['Noa', "Il m'a gardé vingt minutes pour un devoir que j'avais rendu. Vingt minutes."],
  ['Inès', 'Classique. Mon bus passe dans cinq minutes. Tu rentres à pied ?'],
  ['Noa', "Ouais. Ma mère est de garde cette nuit, personne m'attend."],
  ['Inès', "T'as vu les infos ? Encore des coupures vers Halden. Les gens disent que le sol vibre la nuit."],
  ['Noa', "Les gens disent n'importe quoi. C'est les vieux transfos d'Aegis. Mon père disait que tout le quartier tenait avec du scotch."],
  ['Inès', '… Désolée. Je pensais pas à ton père.'],
  ['Noa', "T'inquiète. Allez, file, tu vas le rater."],
  ['Inès', "Envoie-moi un message quand t'es rentré. Je rigole pas."],
];

export class Story {
  constructor(game) {
    this.game = game;
    this.npcs = [];
    this.seq = null; // séquence scriptée en cours
    this.cine = null; // caméra de cinématique { pos, look }
    this.flags = new Set(game.saveData?.storyFlags || []);
    this.hintTimer = 0;
  }

  get missions() {
    return this.game.missions;
  }

  stage() {
    const m = this.missions;
    if (m.state.p01_after_school?.status === 'active') return 'prologue';
    if (m.state.p02_nightfall?.status === 'active') return 'chase';
    if (m.state.p03_rings?.status === 'active') return 'tutorial';
    return 'free';
  }

  // Pouvoirs disponibles selon l'avancée.
  powers() {
    const m = this.missions;
    const rings = m.isDone('p02_nightfall');
    return { rings, flight: rings && m.stepReached('p03_rings', 3) };
  }

  // ---------- Initialisation selon la sauvegarde ----------
  init(isNew) {
    const g = this.game;
    const st = this.stage();
    g.setNight(st === 'prologue' ? 0 : 1);
    g.hero.setPowers(this.powers());
    this.#updateHint(true);
    g.hud.setName('NOA');
    if (st === 'prologue') {
      this.#spawnPrologueNpcs();
      if (isNew) {
        const sp = g.world.schoolSpawn;
        g.hero.placeAt(sp, sp.yaw);
        g.camYaw = sp.yaw;
        g.hud.chapter('PROLOGUE', 'Après les cours', 'Vesper, 17 h 42. Lycée Vesper-Nord.', 5);
      }
    } else if (st === 'chase') {
      this.#ensureCase();
      if (!g.missions.stepReached('p02_nightfall', 1)) this.#spawnChaser(V(g.hero.pos.x - 12, 0.15, g.hero.pos.z + 8));
    } else if (st === 'tutorial') {
      this.#ensureCase(true);
      if (!g.missions.stepReached('p03_rings', 1)) this.#spawnChaser(V(34, 0.15, -44), false);
    }
  }

  // Point de réapparition après une mort (selon le chapitre).
  checkpoint() {
    const st = this.stage();
    const w = this.game.world;
    if (st === 'prologue') return w.schoolSpawn;
    if (st === 'chase') return { x: 0, y: 0.15, z: -9, yaw: Math.PI * 0.75 };
    if (st === 'tutorial') return { x: 36, y: 0.15, z: -46, yaw: 0 };
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
    const html = p.flight ? HINTS.flight : p.rings ? HINTS.rings : HINTS.prologue;
    this.game.hud.setHint(html);
    if (show) {
      this.game.hud.showHint(true);
      this.hintTimer = 28;
    }
  }

  // ---------- PNJ du prologue ----------
  #spawnPrologueNpcs() {
    const g = this.game;
    this.ines = new Npc(g, { id: 'ines', name: 'Inès', palette: 'ines', x: 21.8, z: 35.2, yaw: Math.PI / 2 });
    this.npcs.push(this.ines);
    const routes = [
      [[12, 30], [12, 12.5], [30, 10.5]], [[-10.5, 30], [-10.5, 50]], [[30, 10.5], [55, 10.5]], [[-30, 10.5], [-55, 10.5]],
      [[10.5, -20], [10.5, -50]], [[-10.5, -14], [-10.5, -50]], [[18, 27], [38, 27]], [[-5, 10], [5, 10], [5, -10], [-5, -10]],
    ];
    routes.forEach((r, i) => this.npcs.push(new Npc(g, { id: 'civ' + i, seed: 100 + i * 17, x: r[0][0], z: r[0][1], route: r })));
  }

  // Valise Aegis lumineuse dans la camionnette accidentée.
  #ensureCase(opened = false) {
    if (this.case) return;
    const g = this.game;
    const t = g.world.targets.aegis_case;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.55), new THREE.MeshToonMaterial({ color: '#e8ecff' }));
    body.position.y = 0.13;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 0.57), new THREE.MeshToonMaterial({ color: '#5fe3ff', emissive: '#5fe3ff', emissiveIntensity: 1.5 }));
    band.position.y = 0.2;
    const light = new THREE.PointLight('#5fe3ff', 6, 7, 2);
    light.position.y = 0.8;
    grp.add(body, band, light);
    grp.position.set(t.x, t.y, t.z);
    grp.rotation.y = 0.4;
    g.scene.add(grp);
    this.case = { grp, light, band, opened };
    if (opened) {
      light.intensity = 0;
      band.material.emissiveIntensity = 0.1;
    }
  }

  #spawnChaser(pos, scripted = true) {
    const g = this.game;
    const e = g.spawnEnemy({ type: 'stalker', x: pos.x, z: pos.z, group: 'chaser', chaser: scripted, patrol: [[pos.x, pos.z]] });
    e.id = 'chaser';
    this.chaser = e;
    return e;
  }

  // ---------- Interactions propres à l'histoire ----------
  interactables() {
    const out = [];
    const st = this.stage();
    if (st === 'prologue' && this.ines && !this.seq && !this.missions.stepReached('p01_after_school', 1)) {
      out.push({ kind: 'story', id: 'ines', pos: this.ines.pos, label: '<kbd>E</kbd>Parler — <span style="color:#ff9cf0">Inès</span>' });
    }
    if (st === 'chase' && this.missions.stepReached('p02_nightfall', 1) && this.case && !this.case.opened) {
      out.push({ kind: 'story', id: 'aegis_case', pos: this.game.world.targets.aegis_case, label: '<kbd>E</kbd>Ouvrir la mallette <span style="color:#5fe3ff">Aegis</span>' });
    }
    return out;
  }

  interact(it) {
    if (it.id === 'ines') this.#talkToInes();
    if (it.id === 'aegis_case') this.#awakening();
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
    g.hero.suspended = false;
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

  #talkToInes() {
    const g = this.game;
    const ines = this.ines;
    const hero = g.hero;
    ines.faceTo(hero.pos);
    hero.yaw = Math.atan2(ines.pos.x - hero.pos.x, ines.pos.z - hero.pos.z);
    const steps = INES_TALK.map(([who, text], i) => ({
      wait: i === 0 ? 0.2 : 3.6,
      do: () => {
        this.#say(who, text, 3.6);
        if (who === 'Inès') ines.play('phone', 0.01);
      },
    }));
    steps.push({ wait: 3.6, do: () => {
      ines.walkTo(60, 11, 1.8, 'gone');
      g.missionEvents(g.missions.handle({ type: 'interact', target: 'ines' }));
    } });
    steps.push({ wait: 2.5, do: () => {
      g.audio.phoneBuzz();
      hero.playAnim('phone', 4.5, false);
      g.hud.phone('Maman', "Je suis de garde jusqu'à 7 h. Il y a des plats au frigo. Rentre directement, d'accord ? Il y a des coupures partout. ❤");
    } });
    steps.push({ wait: 3, do: () => this.#say('Noa', '« Rentre directement. » Comme d’hab.', 3) });
    steps.push({ wait: 3, do: () => this.#say('Noa', 'Je coupe par la place Halden, ça ira plus vite.', 3) });
    this.#run(steps);
  }

  // Le Nightfall : ciel qui se déchire, coupure, première créature.
  #nightfall() {
    const g = this.game;
    const hero = g.hero;
    const hp = hero.pos.clone();
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
        this.nightTween = { from: 0, to: 1, t: 0, dur: 3.5 };
        g.shake(0.6);
      } },
      { wait: 1.6, do: () => {
        g.world.setPower(false);
        g.audio.blackout();
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
        this.nightTween = null;
        for (const npc of this.npcs) npc.flee(hp);
        this.#ensureCase();
        if (!this.chaser?.alive) this.#spawnChaser(V(-14, 0.15, 10));
        g.save('story');
      },
    });
  }

  // L'éveil : la mallette Aegis, les anneaux, la première onde magnétique.
  #awakening() {
    const g = this.game;
    const hero = g.hero;
    const c = this.case;
    c.opened = true;
    const hp = hero.pos.clone();
    hero.yaw = Math.atan2(c.grp.position.x - hp.x, c.grp.position.z - hp.z);
    const chaser = this.chaser?.alive ? this.chaser : this.#spawnChaser(hp.clone().add(V(-6, 0, 4)));
    this.#run([
      { wait: 0, do: () => {
        hero.playAnim('interact', 1.2);
        this.cine = { pos: hp.clone().add(V(1.5, 1.2, 1.8)), look: c.grp.position.clone().add(V(0, 0.3, 0)) };
        this.#say('Noa', 'Aegis… C’est le logo du badge de papa.', 3);
      } },
      { wait: 2.4, do: () => {
        // La créature bondit par derrière : ralenti.
        chaser.pos.copy(hp).add(V(-5, 0, 3));
        chaser.yaw = Math.atan2(hp.x - chaser.pos.x, hp.z - chaser.pos.z);
        chaser.alert = true;
        g.audio.stalkerHiss(chaser.pos);
        this.cine = { pos: hp.clone().add(V(3, 2.2, -3)), look: chaser.pos.clone().add(V(0, 1.2, 0)), lerp: 4 };
        hero.playAnim('scared', 1.5);
      } },
      { wait: 1.4, do: () => {
        // Les anneaux jaillissent de la mallette.
        c.light.intensity = 30;
        g.fx.flash(c.grp.position, '#5fe3ff', 120, 0.6);
        g.audio.awaken();
        hero.setPowers({ rings: true });
        hero.rings.placed = false;
        hero.rings.set('awaken', { dur: 3.6 });
        for (const r of hero.rings.rings) r.pos.copy(c.grp.position).add(V(0, 0.3, 0));
        hero.playAnim('awaken', 4.2);
        hero.suspended = true;
        this.cine = { pos: hp.clone().add(V(0, 1.4, 4.2)), look: hp.clone().add(V(0, 1.5, 0)), lerp: 1.2, orbit: 0.35 };
      } },
      { wait: 1.2, do: () => (hero.pos.y = hp.y + 0.4) },
      { wait: 2.4, do: () => {
        // Onde magnétique : la créature est projetée.
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
      { wait: 1.6, do: () => this.#say('Noa', 'C’est… c’est moi qui fais ça ?', 3) },
      { wait: 2.2, do: () => g.hud.chapter('CHAPITRE 0', 'Le réveil', 'Les anneaux répondent à ta volonté.', 4) },
    ], {
      cinematic: true,
      onEnd: () => {
        hero.suspended = false;
        hero.setPowers({ rings: true });
        if (hero.rings.mode === 'awaken' || hero.rings.mode === 'hidden') hero.rings.set('idle');
        c.opened = true;
        c.light.intensity = 0;
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
    if (ev.type === 'stepComplete' && ev.id === 'p02_nightfall') {
      this.#say('Noa', 'La camionnette… il y a quelque chose qui brille dedans.', 3.5);
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
        this.#say('Noa', 'Ils réagissent avant moi… Attends. Mes pieds…', 3.5);
        this.#say('Noa', 'Ils me tirent vers le haut. Je… je peux voler ?!', 3.5);
        g.hero.setPowers({ flight: true });
        this.#updateHint(true);
      } else if (step === 4) {
        this.#say('Noa', 'C’EST INCROYABLE !', 2.5);
        this.#say('Noa', 'L’hôtel Lumen. De là-haut, je verrai tout le quartier.', 3.5);
      }
    }
    if (ev.type === 'missionComplete' && ev.id === 'p03_rings') {
      const L = [
        ['Mara (radio)', 'Joli vol, Noa Vant.'],
        ['Noa', 'Quoi ?! Qui êtes-vous ? Comment vous connaissez mon nom ?'],
        ['Mara (radio)', 'Je m’appelle Mara. J’ai piraté ton téléphone pendant que tu jouais les comètes.'],
        ['Mara (radio)', 'Ces anneaux viennent d’Aegis, comme la camionnette. Comme ton père. On en parlera.'],
        ['Mara (radio)', 'Pour l’instant, une faille s’est ouverte dans le parking Halden. Il en sort d’autres créatures.'],
        ['Noa', 'Et vous voulez que moi, j’y aille ? J’ai seize ans.'],
        ['Mara (radio)', 'Je veux que tu restes en vie. Et pour ça, il faut que tu apprennes. Nettoie le parking.'],
      ];
      L.forEach(([w, t]) => this.#say(w, t, 4.2));
      g.hud.chapter('CHAPITRE 1', 'Vesper Downtown', 'La ville a besoin d’un héros. Elle n’a qu’un lycéen.', 5);
      g.spawnGated();
    }
    if (ev.type === 'missionStart') g.spawnGated();
  }

  // ---------- Mise à jour ----------
  update(dt) {
    const g = this.game;
    for (const n of this.npcs) n.update(dt);
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
    if (this.case && !this.case.opened) this.case.light.intensity = 5 + Math.sin(g.time * 4) * 2;
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
