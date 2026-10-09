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
    <span class="kbd">R</span>verrouiller · <span class="kbd">H</span>soin · <span class="kbd">I</span>inventaire · <span class="kbd">J</span>journal · <span class="kbd">K</span>compétences`,
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
  // Ville « vivante » (prologue) ou « abandonnée » (après le Nightfall).
  #cityState(night, instant) {
    const w = this.game.world;
    w.street.setTraffic(!night);
    w.setBarricades(night);
    if (night) w.toppleMonument(instant);
  }

  init(isNew) {
    const g = this.game;
    const st = this.stage();
    g.setNight(st === 'prologue' ? 0 : 1);
    this.#cityState(st !== 'prologue', true);
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
    // Reprise en cours de chapitre 1
    const m02 = g.missions.state.m02_aegis_echo;
    if (m02?.status === 'active' && m02.step === 1) this.#spawnCrawlers(3 - m02.progress, false);
    if (m02?.status === 'active' && m02.step === 2) this.#ensureDrone();
    const m03 = g.missions.state.m03_colossus;
    if (m03?.status === 'active' && m03.step === 1 && !g.boss) {
      const b = g.spawnBoss({ x: 0, z: -14 });
      b.introDur = 0.1;
    }
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
      ['Julien Vant (enregistrement)', 'Journal du projet ANNEAU, entrée quarante-trois. Si ce message est lu, c’est que les anneaux se sont activés.'],
      ['Julien Vant (enregistrement)', '… Noa. Si c’est toi qui entends ça, je suis désolé. Je n’ai pas eu le temps de t’expliquer.'],
      ['Julien Vant (enregistrement)', 'Aegis voulait une arme. Je leur ai donné des plans. Mais ces anneaux-là, je les ai faits pour te protéger.'],
      ['Julien Vant (enregistrement)', 'Ils écoutent le cœur de celui qui les porte. Ne les laisse jamais décider de qui tu es.'],
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
        g.hud.chapter('BOSS', 'Le Colosse', 'Son armure encaisse. Trouve l’ouverture.', 4);
      } },
      { wait: 2.6, do: () => this.#say('Mara (radio)', 'Ses noyaux brillent quand il s’épuise. C’est là qu’il faut frapper, Noa.', 4) },
    ], { cinematic: true });
  }

  #ending() {
    const g = this.game;
    this.#run([
      { wait: 1.5, do: () => g.hud.chapter('FIN DU CHAPITRE 1', 'Vesper Downtown', 'Le quartier respire. Pour cette nuit.', 5) },
      { wait: 5.5, do: () => {
        this.#say('Mara (radio)', 'Tu l’as fait. Un lycéen contre ça. Je n’y croyais pas moi-même.', 4);
        this.#say('Mara (radio)', 'Le nom que ton père a donné : Hollis. Directeur de la recherche d’Aegis. Ses labos sont dans la forêt de Blackwood.', 5);
      } },
      { wait: 9, do: () => {
        g.audio.phoneBuzz();
        g.hud.phone('Inès', 'Noa ?? Y’a une vidéo d’un mec qui VOLE au-dessus d’Halden. Il a TON sweat. Rappelle-moi. Maintenant.', 8);
      } },
      { wait: 3, do: () => this.#say('Noa', '… Oh non.', 2.5) },
      { wait: 4, do: () => g.hud.chapter('CHAPITRE 2', 'Blackwood', 'À suivre…', 5) },
    ]);
  }

  // Point de réapparition après une mort (selon le chapitre).
  checkpoint() {
    const st = this.stage();
    const w = this.game.world;
    if (this.game.missions.state.m03_colossus?.status === 'active') return { x: 0, y: 0.15, z: 24, yaw: Math.PI };
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
      [[9.6, 30], [9.6, 12], [30, 9.4]], [[-9.6, 28], [-9.6, 50]], [[34, 9.4], [55, 9.4]], [[-33, 9.4], [-55, 9.4]],
      [[9.6, -28], [9.6, -50]], [[-9.6, -17], [-9.6, -50]], [[18, 28.5], [28.5, 28.5]], [[-12, 9.4], [-28, 9.4]],
    ];
    const n = g.settings.quality === 'low' ? 5 : routes.length;
    routes.slice(0, n).forEach((r, i) => this.npcs.push(new Npc(g, { id: 'civ' + i, seed: 100 + i * 17, x: r[0][0], z: r[0][1], route: r })));
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
    if (this.drone && !this.drone.done && this.game.missions.currentStep('m02_aegis_echo')?.target === 'aegis_drone') {
      out.push({ kind: 'story', id: 'aegis_drone', pos: this.game.world.targets.aegis_drone, label: '<kbd>E</kbd>Récupérer l’enregistrement — <span style="color:#5fe3ff">drone Aegis</span>' });
    }
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
    if (it.id === 'aegis_drone') this.#playRecording();
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
      // Inès rejoint l'abribus ; le bus 12 arrive, elle monte, il repart.
      const stop = g.world.street.busStop;
      ines.walkPath([[29.2, 31], [29.2, 9.8], [stop.x + 0.6, stop.z]], 2.0, 'idle');
      ines.onArrive = () => ines.faceTo(new THREE.Vector3(stop.x, 0, 0));
      g.world.street.callBus({
        wait: 3,
        waitFor: () => ines.mode === 'idle' || ines.mode === 'gone',
        onDepart: () => {
          ines.mode = 'gone';
        },
      });
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
    if (ev.type === 'missionComplete' && ev.id === 'm03_colossus') this.#ending();
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
