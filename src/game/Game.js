// Cœur du jeu : rendu, boucle, caméra, et liaison entre tous les systèmes.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { CollisionWorld } from './core/physics.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { buildDowntown } from './world/downtown.js';
import { Crate } from './world/crate.js';
import { Effects } from './fx/effects.js';
import { Hero, MOVES } from './actors/hero.js';
import { Enemy, ENEMY_TYPES } from './actors/enemy.js';
import { Inventory } from './systems/inventory.js';
import { Progression } from './systems/progression.js';
import { MissionLog } from './systems/missions.js';
import { SaveSystem } from './systems/save.js';
import { loadSettings, saveSettings } from './systems/settings.js';
import { rollCrate, CRATE_TYPES } from './systems/loot.js';
import { ITEMS, RARITY_INFO } from './data/items.js';
import { MISSIONS, MISSION_KIND_LABEL } from './data/missions.js';
import { Hud } from './ui/hud.js';
import { Story } from './story/story.js';
import { Menus } from './ui/menus.js';
import './ui/game.css';

const BASE_STATS = { maxHp: 120, maxEnergy: 100, damage: 8, defense: 0, energyGain: 0, powerDamage: 0 };

// Dialogues radio (cellule de survivants).
const RADIO = {
  'm01_first_contact:1': ["C'est fini ? Bien joué, gamin. Il y a une caisse Aegis au fond du parking, près de la camionnette.", 'Ouvre-la. Je veux savoir ce qu’ils transportaient d’autre.'],
  'm01_first_contact:2': ['… Julien Vant. Ton père. Noa, rejoins-moi au refuge, dans le garage en face de chez toi. Il faut qu’on parle.'],
  'm01_first_contact:done': ['Te voilà. Repose-toi au terminal, et utilise l’établi pour renforcer tes anneaux.', 'Ton père n’a pas seulement travaillé pour Aegis, Noa. Il a construit ces anneaux. Pour toi.'],
  's01_rooftop_signal:1': ['Un émetteur Aegis sur un toit… Ils surveillent le quartier. Regarde ce qu’il protège.'],
  firstStalker: ['Un Stalker. Ils t’observent avant d’attaquer.', 'Quand sa fente s’illumine en vert, roule au dernier moment… ou lève ton bouclier pile à temps.'],
  firstBrute: ['Celui-là est énorme. Sors du cercle rouge avant qu’il frappe le sol, puis punis-le.', 'Le fouet et la rafale d’anneaux brisent sa garde. Et si ça tourne mal : envole-toi.'],
};

const LORE = {
  crate_tactical_1: `<b>BON DE TRANSFERT — AEGIS LABORATORIES</b><br>Objet : module « Éclipse », amplificateur pour anneaux magnétiques (série V).<br>
    Responsable du projet : Dr Julien Vant — <i>dossier clos (décès)</i>.<br><br>
    <i>Note manuscrite : « Son fils a seize ans. Si les anneaux se lient à lui, il faut qu'on le trouve avant EUX. — Dr H. »</i>`,
  crate_elite_roof: `<b>JOURNAL D'ÉMETTEUR — RELAIS 14</b><br>Signal capté sous Vesper : 0,3 Hz, en hausse constante depuis 41 jours.<br>
    Les créatures convergent vers la source. Ce n'est pas une invasion. C'est un <i>appel</i>.`,
};

export class Game {
  constructor(container, { saveData = null } = {}) {
    this.container = container;
    this.saveData = saveData;
    this.settings = loadSettings();
    this.saveSys = new SaveSystem();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.timeScale = 1;
    this.hitStopT = 0;
    this.slowT = 0;
    this.shakeAmp = 0;
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.camDist = 4.6;
    this.lockTarget = null;
    this.heroNoise = 0;
    this.enemies = [];
    this.crates = [];
    this.tokens = new Set();
    this.inCombat = false;
    this.paused = false;
    this.saidOnce = new Set();
    this.autosaveT = 90;
    this.playTime = 0;
    this.pendingLoot = {};
    this.opened = new Set();
    this.kills = 0;
    this.respawnQueue = [];
  }

  async init() {
    // Police cartoon des enseignes (si disponible ; repli sinon après 2 s).
    await Promise.race([document.fonts?.load('40px "Lilita One"'), new Promise((r) => setTimeout(r, 2000))]).catch(() => {});
    // --- Rendu ---
    const q = this.settings.quality;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping; // préserve les couleurs saturées
    r.toneMappingExposure = 1.0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.FogExp2('#4a2f7a', 0.0055);
    scene.background = new THREE.Color('#1a0d36');
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.0;

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 1500);
    this.hemi = new THREE.HemisphereLight('#d6d0ff', '#6a4a5a', 1.35);
    scene.add(this.hemi);
    const moon = (this.moon = new THREE.DirectionalLight('#e8f0ff', 1.6));
    moon.shadow.camera.left = moon.shadow.camera.bottom = -36;
    moon.shadow.camera.right = moon.shadow.camera.top = 36;
    moon.shadow.camera.far = 160;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.03;
    scene.add(moon, moon.target);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.4, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // --- Monde ---
    this.col = new CollisionWorld();
    this.world = buildDowntown(scene, this.col, q);
    this.fx = new Effects(scene);
    this.audio = new AudioEngine(this.settings);
    this.input = new Input(r.domElement);
    this.input.onLockChange = (locked) => {
      if (!locked && !this.menus.isOpen && !this.hero.dead) {
        this.lockLostAt = performance.now();
        this.menus.show('pause');
      }
    };

    // --- Systèmes ---
    const d = this.saveData;
    this.seed = d?.seed ?? Math.floor(Math.random() * 1e9);
    this.inventory = new Inventory(d?.inventory);
    if (!d) {
      // Les « noyaux » d'anneaux remplacent les gants ; un ado n'a que quelques euros.
      this.inventory.add('patrol_gloves');
      this.inventory.equip(this.inventory.items[0].uid);
      this.inventory.add('medkit', 1);
      this.inventory.credits = 12;
    }
    this.progression = new Progression(d?.progression);
    this.missions = new MissionLog(d?.missions);
    this.opened = new Set(d?.opened || []);
    this.pendingLoot = d?.pendingLoot || {};
    this.kills = d?.kills || 0;
    this.playTime = d?.playTime || 0;
    this.saidOnce = new Set(d?.saidOnce || []);

    // --- Héros ---
    this.hero = new Hero(this);
    scene.add(this.hero.model.root);
    const sp = d?.hero || this.world.spawn;
    this.hero.placeAt({ x: sp.x, y: sp.y, z: sp.z }, sp.yaw ?? 0);
    this.camYaw = sp.yaw ?? 0;
    this.recomputeStats();
    if (d?.hero) {
      this.hero.hp = Math.min(this.hero.stats.maxHp, d.hero.hp ?? this.hero.stats.maxHp);
      this.hero.energy = d.hero.energy ?? 50;
    } else this.hero.hp = this.hero.stats.maxHp;

    // --- Ennemis : apparaissent selon l'avancée de l'histoire ---
    this.spawned = new Set();
    this.spawnGated();

    // --- Caisses ---
    for (const c of this.world.crates) {
      const crate = new Crate(c, scene, this.col);
      if (this.opened.has(c.id)) crate.setOpened();
      this.crates.push(crate);
    }
    this.#refreshCrateLocks();

    // --- Interface ---
    this.hud = new Hud(document.body);
    this.menus = new Menus(this);
    this.applySettings();
    addEventListener('resize', () => this.#resize());
    this.#resize();

    window.__nightfall = this; // accès de test/débogage
    this.story = new Story(this);
    this.story.init(!d);
    this.audio.resume();
    this.audio.startAmbience();
    this.running = true;
    this.renderer.setAnimationLoop(() => this.#frame());
  }

  spawnEnemy(spawn) {
    const e = new Enemy(this, spawn);
    e.id = `${spawn.group}:${spawn.x}:${spawn.z}`;
    this.scene.add(e.model.root);
    this.enemies.push(e);
    return e;
  }

  // Fait apparaître les créatures dont le chapitre est atteint (une seule fois).
  // Le groupe du parking déjà éliminé ne réapparaît pas.
  spawnGated() {
    const m = this.missions;
    const m01 = m.state.m01_first_contact;
    const parkingDone = m.stepReached('m01_first_contact', 1);
    let parkingSkip = m01 && m01.step === 0 ? m01.progress : 0;
    for (const s of this.world.enemySpawns) {
      const key = `${s.group}:${s.x}:${s.z}`;
      if (this.spawned.has(key) || (s.after && !m.isDone(s.after))) continue;
      this.spawned.add(key);
      if (s.group === 'parking') {
        if (parkingDone) continue;
        if (parkingSkip > 0 && s.type === 'stalker') {
          parkingSkip--;
          continue;
        }
      }
      this.spawnEnemy(s);
    }
  }

  // Ambiance : 0 = crépuscule doré (prologue), 1 = nuit violette du Nightfall.
  setNight(k) {
    this.night = k;
    this.world.setNight(k);
    const c = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    this.hemi.color.copy(c('#ffe0c8', '#d6d0ff'));
    this.hemi.groundColor.copy(c('#7a5a6a', '#6a4a5a'));
    this.hemi.intensity = 1.5 - k * 0.15;
    this.moon.color.copy(c('#ffc08a', '#e8f0ff'));
    this.moon.intensity = 2.0 - k * 0.4;
    this.scene.fog.color.copy(c('#e8a0a8', '#4a2f7a'));
    this.scene.fog.density = 0.0035 + k * 0.002;
    this.scene.background.copy(c('#e8a0a8', '#1a0d36'));
    this.audio.setRain?.(k > 0.5);
  }

  // ---------- Outils de test automatisé ----------
  // Simulation à pas fixe, sans rendu (indépendante de la vitesse de la machine).
  simulate(seconds, step = 1 / 60) {
    for (let t = 0; t < seconds; t += step) {
      this.#menuKeys();
      if (!this.menus.isOpen) {
        this.time += step;
        this.#update(step, step);
      }
      this.#updateCamera(step);
      this.input.endFrame();
    }
  }

  stopLoop() {
    this.renderer.setAnimationLoop(null);
  }

  renderOnce() {
    this.world.update(0.016, this.time, this.camera, this.hero.pos);
    this.#updateHud(0.016);
    this.composer.render();
  }

  // ---------- Paramètres ----------
  applySettings() {
    const s = this.settings;
    saveSettings(s);
    this.audio.applySettings(s);
    const q = s.quality;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(devicePixelRatio, 1) * 0.75 : q === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.moon.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.moon.shadow.mapSize.x !== size) {
      this.moon.shadow.mapSize.set(size, size);
      this.moon.shadow.map?.dispose();
      this.moon.shadow.map = null;
    }
    this.bloom.enabled = q !== 'low';
    document.documentElement.style.setProperty('--ts', s.textScale);
    this.hud?.setSubtitlesEnabled(s.subtitles);
    this.#resize();
  }

  #resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  // ---------- Statistiques ----------
  recomputeStats() {
    const lv = this.progression.levelStats();
    const eq = this.inventory.equipmentStats();
    const s = { ...BASE_STATS };
    for (const src of [lv, eq]) for (const [k, v] of Object.entries(src)) s[k] = (s[k] || 0) + v;
    s.maxHp = Math.round(s.maxHp);
    s.maxEnergy = Math.round(s.maxEnergy);
    this.hero.setStats(s);
    const w = this.inventory.equippedItem('weapon');
    const a = this.inventory.equippedItem('armor');
    // Équipement visible : couleur des anneaux (noyau) et du sweat (protection).
    this.hero.rings.setColor(w ? ITEMS[w.id].visual.glow : '#5fe3ff');
    const pal = this.hero.model.palette;
    this.hero.model.mats.hoodie.color.set(a ? ITEMS[a.id].visual.plate : pal.hoodie);
    this.hero.model.mats.hoodie2.color.set(a ? ITEMS[a.id].visual.trim : pal.hoodie2);
  }

  onEquipmentChanged() {
    this.recomputeStats();
  }

  // ---------- Boucle ----------
  #frame() {
    const realDt = Math.min(0.05, this.clock.getDelta());
    const menuOpen = this.menus.isOpen;
    this.#menuKeys();

    if (!menuOpen) {
      this.hitStopT -= realDt;
      this.slowT -= realDt;
      this.timeScale = this.hitStopT > 0 ? 0.06 : this.slowT > 0 ? 0.35 : 1;
      const dt = realDt * this.timeScale;
      this.time += dt;
      this.playTime += realDt;
      this.input.pollGamepad();
      this.#update(dt, realDt);
    }
    this.#updateCamera(menuOpen ? 0 : realDt);
    this.world.update(realDt, this.time, this.camera, this.hero.pos);
    this.#updateHud(realDt);
    this.composer.render();
    this.input.endFrame();
  }

  #menuKeys() {
    const p = this.input.pressed;
    const m = this.menus;
    if (p.has('pause')) {
      if (performance.now() - (this.lockLostAt || 0) < 250) return;
      if (m.open === 'death') return;
      if (m.isOpen) m.hide();
      else m.show('pause');
    } else if (p.has('inventory') && (!m.isOpen || m.open === 'inventory' || m.open === 'journal')) m.toggle('inventory');
    else if (p.has('journal') && (!m.isOpen || m.open === 'journal' || m.open === 'inventory')) m.toggle('journal');
    else if (p.has('interact') && m.open === 'reward') m.hide();
  }

  onMenu(open) {
    this.input.enabled = !open;
    this.input.down.clear();
    if (open) this.input.releaseLock();
    this.hud?.prompt('');
  }

  #update(dt, realDt) {
    const hero = this.hero;
    const input = this.input;

    this.story.update(dt);
    if (this.story.inCinematic && input.was('interact')) this.story.skip();
    hero.update(dt, input, this.camYaw, this.camPitch);
    this.audio.wind(hero.flying ? Math.min(1, Math.hypot(hero.vel.x, hero.vel.z, hero.vy) / 34) : 0);

    // Bruit émis par le joueur (perçu par l'ouïe des créatures)
    const moving = Math.hypot(hero.vel.x, hero.vel.z);
    this.heroNoise = hero.action?.kind === 'power' ? 2 : hero.action?.kind === 'attack' ? 1.2 : input.is('sprint') && moving > 7 ? 1 : moving > 3 ? 0.35 : 0;

    for (const e of this.enemies) e.update(dt);
    this.#separateEnemies();
    for (const c of this.crates) {
      c.root.visible = hero.powers.rings;
      c.update(dt, this.time);
    }
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.25;
      for (const p of this.world.smokeSources) {
        if (p.distanceTo(hero.pos) < 40) this.fx.puff(p, { color: '#8a6ab8', size: 0.9, life: 2.2, rise: 1.2 });
      }
    }
    this.fx.update(dt);

    // Lumière de lune qui suit le joueur (ombres)
    this.moon.position.set(hero.pos.x + 30, 60, hero.pos.z + 18);
    this.moon.target.position.copy(hero.pos);

    // Actions générales
    if (input.was('lock')) this.#toggleLock();
    if (this.lockTarget && (!this.lockTarget.alive || this.lockTarget.pos.distanceTo(hero.pos) > 30)) this.lockTarget = null;
    if (input.was('heal')) this.useMedkit();
    if (input.was('markers')) {
      this.settings.markers = !this.settings.markers;
      saveSettings(this.settings);
      this.hud.toast(`Marqueurs ${this.settings.markers ? 'activés' : 'désactivés'}`);
    }
    this.#interactions();

    // Missions : positions
    if (!hero.dead) this.missionEvents(this.missions.checkPosition(hero.pos, (n) => this.#target(n)));

    // Combat & musique
    this.inCombat = this.enemies.some((e) => e.alive && e.alert && e.pos.distanceTo(hero.pos) < 32);
    this.audio.setCombat(this.inCombat ? 1 : 0, realDt);
    this.audio.listener = { x: hero.pos.x, z: hero.pos.z, yaw: this.camYaw };

    // Réapparition des créatures hors mission, loin du joueur
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i];
      r.t -= dt;
      if (r.t <= 0 && Math.hypot(hero.pos.x - r.spawn.x, hero.pos.z - r.spawn.z) > 45) {
        this.spawnEnemy(r.spawn);
        this.respawnQueue.splice(i, 1);
      }
    }
    // Nettoyage des cadavres dissous
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive && e.deadT > 3.6) {
        this.scene.remove(e.model.root);
        this.enemies.splice(i, 1);
      }
    }

    // Sauvegarde automatique périodique hors combat
    this.autosaveT -= realDt;
    if (this.autosaveT <= 0 && !this.inCombat && !hero.dead && hero.grounded) {
      this.autosaveT = 90;
      this.save('auto');
    }
  }

  #separateEnemies() {
    const list = this.enemies.filter((e) => e.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < min) {
          const push = (min - d) / 2;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
        }
      }
      // Le héros ne traverse pas les créatures
      const e = list[i];
      const h = this.hero;
      const dx = h.pos.x - e.pos.x;
      const dz = h.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const min = e.radius + h.radius;
      if (d > 0.001 && d < min && Math.abs(h.pos.y - e.pos.y) < 2 && h.action?.kind !== 'dodge') {
        h.pos.x += (dx / d) * (min - d);
        h.pos.z += (dz / d) * (min - d);
      }
    }
  }

  // Limite le nombre de créatures qui attaquent en même temps (combat lisible).
  attackToken(e) {
    for (const t of this.tokens) if (!t.alive) this.tokens.delete(t);
    if (this.tokens.has(e)) return true;
    if (this.tokens.size >= 2) return false;
    this.tokens.add(e);
    return true;
  }

  releaseToken(e) {
    this.tokens.delete(e);
  }

  // ---------- Caméra ----------
  #updateCamera(dt) {
    const s = this.settings;
    if (dt > 0) {
      const look = this.input.consumeLook(dt);
      const sens = 0.0024 * s.sensitivity;
      this.camYaw -= look.x * sens;
      this.camPitch += look.y * sens * (s.invertY ? -1 : 1);
      this.camPitch = Math.max(-0.45, Math.min(1.15, this.camPitch));
      const lt = this.lockTarget;
      if (lt?.alive) {
        const want = Math.atan2(lt.pos.x - this.hero.pos.x, lt.pos.z - this.hero.pos.z);
        let d = want - this.camYaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.camYaw += d * (1 - Math.exp(-5 * dt));
        this.camPitch += (0.3 - this.camPitch) * (1 - Math.exp(-3 * dt));
      }
    }
    const hero = this.hero;
    // Caméra de cinématique (mise en scène de l'histoire)
    const cine = this.story?.cine;
    if (cine) {
      const k = 1 - Math.exp(-(cine.lerp || 3) * (dt || 0.016));
      if (!this.cineLook || this.cineFresh !== cine) {
        if (!this.cineLook || !cine.lerp) {
          this.camPos = cine.pos.clone();
          this.cineLook = cine.look.clone();
        }
        this.cineFresh = cine;
      }
      this.camPos.lerp(cine.pos, k);
      this.cineLook.lerp(cine.look, k);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.cineLook);
      if (this.shakeAmp > 0.001 && dt > 0) {
        this.shakeAmp *= Math.exp(-5 * dt);
        this.camera.position.x += (Math.random() - 0.5) * this.shakeAmp * 0.3;
        this.camera.position.y += (Math.random() - 0.5) * this.shakeAmp * 0.3;
      }
      this.camera.fov += (55 - this.camera.fov) * (1 - Math.exp(-3 * (dt || 0.016)));
      this.camera.updateProjectionMatrix();
      return;
    }
    this.cineLook = null;
    const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = new THREE.Vector3(-f.z, 0, f.x);
    const fs = hero.flying ? Math.hypot(hero.vel.x, hero.vel.z) : 0;
    const targetDist = hero.flying ? 6 + fs / 12 : this.lockTarget ? 5.6 : this.inCombat ? 5.0 : 4.4;
    this.camDist += (targetDist - this.camDist) * (1 - Math.exp(-3 * (dt || 0.016)));
    const pivot = hero.pos.clone().add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(right, 0.55);
    const dir = new THREE.Vector3(
      -f.x * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      -f.z * Math.cos(this.camPitch),
    );
    // Collision caméra : raccourcit la perche si un mur s'interpose.
    const t = this.col.raycast(pivot, dir.clone().multiplyScalar(this.camDist + 0.3), 1);
    const dist = Math.max(0.7, (this.camDist + 0.3) * t - 0.3);
    const want = pivot.clone().addScaledVector(dir, dist);
    want.y = Math.max(want.y, 0.4);
    if (!this.camPos) this.camPos = want.clone();
    // Rapprochement instantané (évite de traverser un mur), éloignement doux.
    const curD = this.camPos.distanceTo(pivot);
    if (dist < curD - 0.05) this.camPos.copy(want);
    else this.camPos.lerp(want, 1 - Math.exp(-14 * (dt || 0.016)));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(pivot.x, pivot.y - 0.1, pivot.z);
    // Secousse
    if (this.shakeAmp > 0.001 && dt > 0) {
      this.shakeAmp *= Math.exp(-7 * dt);
      const a = this.shakeAmp * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.rotation.z += (Math.random() - 0.5) * a * 0.1;
    }
    // Léger élargissement du champ en sprint / pouvoir
    const sprint = this.input.is('sprint') && Math.hypot(hero.vel.x, hero.vel.z) > 7;
    const fov = hero.flying ? 62 + Math.min(16, fs / 2.2) : hero.action?.kind === 'power' ? 68 : sprint ? 67 : 62;
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-6 * (dt || 0.016)));
    this.camera.updateProjectionMatrix();
  }

  shake(amount, at) {
    if (!this.settings.shake) return;
    const fall = at ? Math.max(0, 1 - at.distanceTo(this.hero.pos) / 25) : 1;
    this.shakeAmp = Math.max(this.shakeAmp, amount * fall);
  }

  hitStop(t) {
    this.hitStopT = Math.max(this.hitStopT, t);
  }

  #toggleLock() {
    if (this.lockTarget) {
      this.lockTarget = null;
      return;
    }
    const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    let best = null;
    let bestS = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(this.hero.pos);
      if (d > 24) continue;
      const v = e.pos.clone().sub(this.hero.pos).setY(0).normalize();
      const dot = v.dot(f);
      if (dot < 0.2) continue;
      const s = d * (1.6 - dot);
      if (s < bestS) {
        bestS = s;
        best = e;
      }
    }
    this.lockTarget = best;
    if (!best) this.hud.toast('Aucune cible à verrouiller');
  }

  // ---------- Interactions ----------
  #interactables() {
    const list = [...this.story.interactables()];
    // Avant le réveil, Noa n'est qu'un ado : pas de caisses, pas de refuge.
    if (!this.hero.powers.rings) return list;
    for (const c of this.crates) {
      const pending = this.pendingLoot[c.id]?.length;
      if (c.state === 'opened' && !pending) continue;
      if (c.state === 'opening') continue;
      list.push({ kind: 'crate', crate: c, pos: c.pos, pending });
    }
    list.push({ kind: 'terminal', pos: this.world.targets.terminal });
    list.push({ kind: 'workbench', pos: this.world.targets.workbench });
    return list;
  }

  #interactions() {
    const hero = this.hero;
    if (hero.dead || this.story.inCinematic) return this.hud.prompt(this.story.inCinematic ? '<kbd>E</kbd>Passer la cinématique' : '');
    let near = null;
    let nd = 2.6;
    for (const it of this.#interactables()) {
      const d = Math.hypot(it.pos.x - hero.pos.x, it.pos.z - hero.pos.z);
      if (d < nd && Math.abs(it.pos.y - hero.pos.y) < 1.6) {
        nd = d;
        near = it;
      }
    }
    if (!near) {
      this.inspected = null;
      return this.hud.prompt('');
    }
    let html = '';
    if (near.kind === 'crate') {
      const c = near.crate;
      const info = CRATE_TYPES[c.type];
      const color = info.color;
      if (c.locked) {
        html = `<span style="color:${color}">${info.label}</span> — <span style="color:#ff6a6a">Verrouillée</span><div class="sub">Le verrou magnétique est actif. Éliminez les créatures du parking.</div>`;
      } else if (near.pending) {
        html = `<kbd>E</kbd>Récupérer le reste — <span style="color:${color}">${info.label}</span>`;
      } else if (this.inspected === c) {
        html = `<kbd>E</kbd>Ouvrir — <span style="color:${color}">${info.label}</span><div class="sub">${this.#crateHint(c.type)}</div>`;
      } else html = `<kbd>E</kbd>Inspecter — <span style="color:${color}">${info.label}</span>`;
    } else if (near.kind === 'story') html = near.label;
    else if (near.kind === 'terminal') html = '<kbd>E</kbd>Terminal du refuge — se reposer et sauvegarder';
    else html = '<kbd>E</kbd>Établi — atelier d’amélioration';
    this.hud.prompt(html);

    if (!this.input.was('interact') || hero.busy) return;
    if (near.kind === 'story') return this.story.interact(near);
    if (near.kind === 'crate') {
      const c = near.crate;
      if (c.locked) {
        this.audio.denied();
        return;
      }
      if (near.pending) return this.#claimPending(c);
      if (this.inspected !== c) {
        this.inspected = c;
        this.audio.ui();
        return;
      }
      this.#openCrate(c);
    } else if (near.kind === 'terminal') {
      if (this.inCombat) {
        this.hud.toast('Impossible de se reposer pendant un combat', '#ff6a6a');
        return;
      }
      hero.hp = hero.stats.maxHp;
      hero.energy = hero.stats.maxEnergy;
      hero.playAnim('interact', 0.8);
      this.save('terminal', true);
    } else {
      hero.playAnim('interact', 0.6);
      this.menus.show('inventory', { workshop: true });
    }
  }

  #crateHint(type) {
    return {
      supply: 'Ressources et équipement courant.',
      tactical: 'Contenu garanti : équipement Rare.',
      elite: 'Contenu de haute valeur : Fragments d’Abysse garantis.',
    }[type];
  }

  #openCrate(c) {
    if (!c.open()) return;
    this.inspected = null;
    this.hero.yaw = Math.atan2(c.pos.x - this.hero.pos.x, c.pos.z - this.hero.pos.z);
    this.hero.playAnim('interact', 0.9);
    const rare = c.type !== 'supply';
    this.audio.crateOpen(rare);
    this.opened.add(c.id);
    const rewards = rollCrate(c.type, c.id, this.seed);
    setTimeout(() => {
      this.fx.emit({ x: c.pos.x, y: c.pos.y + 0.8, z: c.pos.z }, { count: rare ? 50 : 20, color: CRATE_TYPES[c.type].color, speed: 4, up: 4, size: 0.25, life: 1, gravity: 2 });
      const overflow = this.inventory.grant(rewards);
      if (overflow.length) this.pendingLoot[c.id] = overflow;
      this.missionEvents(this.missions.handle({ type: 'interact', target: c.id }));
      this.recomputeStats();
      this.menus.show('reward', { title: CRATE_TYPES[c.type].label, color: CRATE_TYPES[c.type].color, rewards, overflow, lore: LORE[c.id] });
      this.save('crate');
    }, 900);
  }

  #claimPending(c) {
    const left = this.inventory.grant(this.pendingLoot[c.id]);
    const got = this.pendingLoot[c.id].filter((r) => !left.includes(r));
    if (left.length) this.pendingLoot[c.id] = left;
    else delete this.pendingLoot[c.id];
    if (!got.length) {
      this.audio.denied();
      this.hud.toast('Inventaire plein', '#ff6a6a');
      return;
    }
    this.audio.pickup();
    this.menus.show('reward', { title: CRATE_TYPES[c.type].label, color: CRATE_TYPES[c.type].color, rewards: got, overflow: left });
    this.save('crate');
  }

  #refreshCrateLocks() {
    for (const c of this.crates) {
      const l = c.def.lockedUntil;
      c.setLocked(!!l && !this.missions.stepReached(l.mission, l.step));
    }
  }

  useMedkit() {
    const h = this.hero;
    if (h.dead) return;
    if (this.inventory.count('medkit') <= 0) {
      this.hud.toast('Aucun kit de soins', '#ff6a6a');
      return this.audio.denied();
    }
    if (h.hp >= h.stats.maxHp) {
      this.hud.toast('Santé déjà au maximum');
      return;
    }
    this.inventory.consume('medkit');
    h.hp = Math.min(h.stats.maxHp, h.hp + 50);
    this.audio.pickup();
    this.fx.emit({ x: h.pos.x, y: h.pos.y + 1, z: h.pos.z }, { count: 24, color: '#5fd068', speed: 2, up: 3, size: 0.25, life: 0.8, gravity: -2 });
    this.menus.isOpen && this.menus.render();
  }

  // ---------- Missions ----------
  #target(name) {
    if (this.world.targets[name]) return this.world.targets[name];
    const c = this.crates.find((k) => k.id === name);
    return c ? c.pos : null;
  }

  #objectivePos() {
    const o = this.missions.objective();
    if (!o) return null;
    const step = o.step;
    if (step.type === 'reach' || step.type === 'interact') return this.#target(step.target);
    // Kill : créature vivante la plus proche correspondante
    let best = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (step.group && e.spawn.group !== step.group) continue;
      if (step.enemyType && e.type !== step.enemyType) continue;
      const d = e.pos.distanceTo(this.hero.pos);
      if (d < bd) {
        bd = d;
        best = e.pos;
      }
    }
    return best;
  }

  missionEvents(events) {
    for (const ev of events) {
      this.story?.onMissionEvent(ev);
      if (ev.type === 'missionStart') {
        if (MISSIONS[ev.id].kind !== 'story') this.hud.toast(`Nouvelle mission : ${ev.title}`, '#7fe3ff');
      } else if (ev.type === 'stepComplete') {
        this.audio.pickup();
        this.hud.toast(`Nouvel objectif : ${ev.text}`);
        const st = this.missions.state[ev.id];
        (RADIO[`${ev.id}:${st.step}`] || []).forEach((l) => this.hud.say('MARA (radio)', l, 5));
        this.#refreshCrateLocks();
        this.save('mission');
      } else if (ev.type === 'missionComplete') {
        const rw = ev.reward;
        const granted = [];
        if (rw.credits) granted.push({ kind: 'credits', amount: rw.credits });
        if (rw.shards) granted.push({ kind: 'shards', amount: rw.shards });
        for (const it of rw.items || []) granted.push({ kind: 'item', id: it.id, qty: it.qty });
        this.inventory.grant(granted);
        this.audio.levelUp();
        if (MISSIONS[ev.id].kind !== 'story' || rw.xp) this.hud.banner(MISSION_KIND_LABEL[MISSIONS[ev.id].kind].toUpperCase() + ' TERMINÉE', ev.title, [rw.xp && `+${rw.xp} XP`, rw.credits && `+${rw.credits} Credits`, rw.shards && `+${rw.shards} Abyss Shards`].filter(Boolean).join('   '));
        (RADIO[`${ev.id}:done`] || []).forEach((l) => this.hud.say('MARA (radio)', l, 5));
        if (!this.inCombat && !this.hero.busy && !this.hero.flying && MISSIONS[ev.id].kind !== 'story') this.hero.playAnim('victory', 1.8);
        this.#refreshCrateLocks();
        if (rw.xp) this.grantXp(rw.xp);
        this.save('mission');
      }
    }
  }

  grantXp(xp) {
    const gained = this.progression.addXp(xp);
    if (gained) {
      this.recomputeStats();
      this.hero.hp = this.hero.stats.maxHp;
      this.audio.levelUp();
      this.hud.banner('NIVEAU SUPÉRIEUR', `NIVEAU ${this.progression.level}`, `+${gained} point(s) de compétence · santé, dégâts et énergie augmentés`);
      this.fx.ring(this.hero.pos, { color: '#ffcd20', from: 0.5, to: 5, life: 0.8 });
    }
  }

  // ---------- Événements de combat ----------
  onEnemyAlert(e) {
    for (const o of this.enemies) {
      if (o !== e && o.alive && !o.alert && o.pos.distanceTo(e.pos) < 18) o.alertTo(this.hero.pos);
    }
    const key = e.type === 'stalker' ? 'firstStalker' : 'firstBrute';
    if (this.story.stage() === 'free' && !this.saidOnce.has(key)) {
      this.saidOnce.add(key);
      RADIO[key].forEach((l) => this.hud.say('MARA (radio)', l, 4.5));
    }
  }

  onEnemyDamaged(e, dmg, heavy) {
    const p = this.#project(new THREE.Vector3(e.pos.x, e.pos.y + e.def.height, e.pos.z));
    if (p) this.hud.damageNumber(p.x, p.y, dmg, heavy);
  }

  onEnemyBroken(e) {
    this.hud.toast(`${e.name} : garde brisée !`, '#ffcd20');
    this.slowT = 0.25;
  }

  onEnemyKilled(e) {
    this.releaseToken(e);
    if (this.lockTarget === e) this.lockTarget = null;
    this.kills++;
    const def = e.def;
    this.fx.deathBurst(e.pos, def.color);
    const credits = def.credits[0] + Math.floor(Math.random() * (def.credits[1] - def.credits[0] + 1));
    const drops = [{ kind: 'credits', amount: credits }];
    for (const l of def.loot) {
      if (Math.random() < l.chance) drops.push({ kind: 'item', id: l.id, qty: l.qty[0] + Math.floor(Math.random() * (l.qty[1] - l.qty[0] + 1)) });
    }
    this.inventory.grant(drops);
    const parts = drops.map((d) => (d.kind === 'credits' ? `+${d.amount} Credits` : `+${d.qty} ${ITEMS[d.id].name}`));
    this.hud.toast(`${def.name} éliminé · +${def.xp} XP · ${parts.join(' · ')}`, def.color);
    this.grantXp(def.xp);
    this.missionEvents(this.missions.handle({ type: 'kill', group: e.spawn.group, enemyType: e.type }));
    if (e.spawn.group !== 'parking') this.respawnQueue.push({ spawn: e.spawn, t: 75 });
  }

  onNoPowers() {
    const now = performance.now();
    if (now - (this.noPowAt || 0) < 2500) return;
    this.noPowAt = now;
    const lines = ['Je sais pas me battre… Faut que je cours !', 'Me battre contre ÇA ? Je suis pas fou.', 'Fuis, Noa. Fuis !'];
    this.hud.say('Noa', lines[Math.floor(Math.random() * lines.length)], 2.5);
  }

  onVolley() {
    this.missionEvents(this.missions.handle({ type: 'event', id: 'volley' }));
  }

  onFlightStart() {
    this.missionEvents(this.missions.handle({ type: 'event', id: 'flight' }));
  }

  onParry(source, from) {
    this.audio.parry();
    this.slowT = 0.45;
    this.fx.ring(this.hero.pos, { color: '#ffffff', from: 0.3, to: 3.5, life: 0.35, y: 1 });
    this.fx.starBurst(this.hero.pos.clone().add(new THREE.Vector3(0, 1.3, 0)).lerp(from, 0.3), '#7fe3ff', 2.2);
    source?.stagger?.(1.6);
    this.hud.toast('PARADE ! · +20 énergie', '#7fe3ff');
  }

  onBlock() {
    this.audio.block();
    this.fx.starBurst(this.hero.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(this.hero.facing(), 0.8), '#bff6ff', 1.2);
  }

  onHeroHurt(dmg) {
    this.hud.hurt();
    this.audio.hurt();
    this.shake(0.3);
  }

  onPerfectDodge() {
    this.slowT = 0.5;
    this.hud.toast('ESQUIVE PARFAITE · +15 énergie', '#a060ff');
    this.fx.ring(this.hero.pos, { color: '#a060ff', from: 0.3, to: 3, life: 0.4 });
  }

  onPowerDenied(why) {
    const now = performance.now();
    if (now - (this.deniedAt || 0) < 600) return;
    this.deniedAt = now;
    this.audio.denied();
    this.hud.toast(why === 'cooldown' ? 'Void Strike en recharge' : `Énergie insuffisante (${MOVES.power.energy} requis)`, '#a060ff');
  }

  onHeroDeath() {
    this.lockTarget = null;
    this.tokens.clear();
    this.audio.enemyDie(this.hero.pos, true);
    setTimeout(() => {
      this.menus.show('death', { onClose: () => this.#respawn() });
    }, 2200);
  }

  #respawn() {
    const sp = this.story.checkpoint();
    this.hero.placeAt(sp, sp.yaw);
    this.hero.revive();
    this.camYaw = sp.yaw;
    this.camPos = null;
    for (const e of this.enemies) {
      if (!e.alive || e.spawn.group === 'chaser') continue;
      e.pos.copy(e.home);
      e.hp = e.def.hp;
      e.alert = false;
      e.lastKnown = null;
      e.sinceSeen = Infinity;
      e.state = 'patrol';
      e.stateT = 0;
    }
    this.story.onRespawn();
    this.hud.toast(this.story.stage() === 'free' ? 'De retour au refuge' : 'Point de passage');
  }

  // ---------- Sauvegarde ----------
  serialize() {
    const h = this.hero;
    return {
      seed: this.seed,
      playTime: Math.round(this.playTime),
      hero: { x: h.pos.x, y: h.pos.y, z: h.pos.z, yaw: h.yaw, hp: h.hp, energy: h.energy },
      inventory: this.inventory.serialize(),
      progression: this.progression.serialize(),
      missions: this.missions.serialize(),
      opened: [...this.opened],
      pendingLoot: this.pendingLoot,
      kills: this.kills,
      saidOnce: [...this.saidOnce],
    };
  }

  save(reason, notify = false) {
    if (this.hero.dead) return false;
    const ok = this.saveSys.save(this.serialize());
    if (notify || reason === 'manual') this.hud.toast(ok ? 'Partie sauvegardée' : 'Échec de la sauvegarde', ok ? '#5fd068' : '#ff6a6a');
    return ok;
  }

  loadLast() {
    sessionStorage.setItem('nightfall.autocontinue', '1');
    location.reload();
  }

  quitToTitle() {
    if (!this.inCombat) this.save('quit');
    location.reload();
  }

  // ---------- HUD ----------
  #project(v) {
    const p = v.clone().project(this.camera);
    if (p.z > 1 || p.z < -1) return null;
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, onScreen: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 };
  }

  #updateHud(dt) {
    const h = this.hero;
    const inv = this.inventory;
    const w = inv.equippedItem('weapon');
    const o = this.missions.objective();
    const op = this.#objectivePos();
    const objDist = op ? Math.hypot(op.x - h.pos.x, op.z - h.pos.z) : null;
    this.hud.update({
      dt,
      hp: h.hp, maxHp: h.stats.maxHp, energy: h.energy, maxEnergy: h.stats.maxEnergy,
      xp: this.progression.xp, xpNext: this.progression.xpToNext, level: this.progression.level, skillPoints: this.progression.skillPoints,
      credits: inv.credits, shards: inv.shards, medkits: inv.count('medkit'),
      powerCd: h.powerCd, powerCdMax: MOVES.power.cooldown, powerCost: MOVES.power.energy,
      weaponName: w ? `${ITEMS[w.id].name}${w.level ? ' +' + w.level : ''}` : 'Mains nues',
      weaponColor: w ? RARITY_INFO[ITEMS[w.id].rarity].color : '#ccc',
      objective: o && { ...o, kindLabel: MISSION_KIND_LABEL[o.kind], step: undefined },
      otherCount: Math.max(0, this.missions.activeIds().length - 1),
      objDist,
      objBearing: op && this.settings.markers ? Math.atan2(op.x - h.pos.x, op.z - h.pos.z) : null,
      camYaw: this.camYaw,
      rings: h.powers.rings, flight: h.powers.flight, flying: h.flying,
    });
    // Marqueur d'objectif
    if (op && this.settings.markers && !this.menus.isOpen) {
      const p = this.#project(new THREE.Vector3(op.x, (op.y || 0) + 2.2, op.z));
      this.hud.marker(p?.x, p?.y, objDist, !!p?.onScreen && objDist > 4);
    } else this.hud.marker(0, 0, 0, false);
    // Barres de vie des créatures
    const bars = [];
    if (!this.menus.isOpen) {
      for (const e of this.enemies) {
        if (!e.alive || (e.showBar <= 0 && e !== this.lockTarget && !(e.alert && e.pos.distanceTo(h.pos) < 14))) continue;
        const p = this.#project(new THREE.Vector3(e.pos.x, e.pos.y + e.def.height + 0.5, e.pos.z));
        if (!p?.onScreen) continue;
        bars.push({ id: e.id, x: p.x, y: p.y, name: e.name, hp: e.hp / e.def.hp, poise: e.def.poise ? e.poise / e.def.poise : null, alert: e.alert });
      }
    }
    this.hud.enemyBars(bars);
    const lt = this.lockTarget;
    const lp = lt && this.#project(new THREE.Vector3(lt.pos.x, lt.pos.y + lt.def.height * 0.55, lt.pos.z));
    this.hud.reticle(lp?.x, lp?.y, !!lp?.onScreen && !this.menus.isOpen);
  }
}

export { ENEMY_TYPES };
