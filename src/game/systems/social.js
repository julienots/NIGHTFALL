// Vie sociale de Noa : amis du lycée, affinité, dialogues à choix, cadeaux,
// rendez-vous et relation amoureuse ; cours en classe (quiz qui rapporte de
// l'expérience). Les conversations passent par la boîte de dialogue du HUD.
import * as THREE from 'three';
import { CHARACTERS, SCENES, SMALL_TALK, DATES, LESSONS, GIFTS, levelName } from '../data/characters.js';
import { ITEMS } from '../data/items.js';
import { Npc } from '../actors/npc.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MILESTONES = [[40, 80], [80, 150]]; // [affinité, XP] à franchir

export class Social {
  constructor(game, data) {
    this.game = game;
    const d = data || {};
    this.aff = { ines: 12, camille: 0, malik: 15, theo: 0, ...(d.aff || {}) };
    this.seen = new Set(d.seen || []);
    this.flags = new Set(d.flags || []);
    this.partner = d.partner || null; // id du personnage en couple avec Noa
    this.talkedDay = d.talkedDay || {};
    this.giftDay = d.giftDay || {};
    this.dateDay = d.dateDay || {};
    this.lessonDay = d.lessonDay ?? 0;
    this.grades = d.grades || [];
    this.milestones = new Set(d.milestones || []);
    this.friends = {}; // id -> Npc
    this.conv = null; // conversation en cours
  }

  serialize() {
    return {
      aff: this.aff, seen: [...this.seen], flags: [...this.flags], partner: this.partner,
      talkedDay: this.talkedDay, giftDay: this.giftDay, dateDay: this.dateDay,
      lessonDay: this.lessonDay, grades: this.grades.slice(-30), milestones: [...this.milestones],
    };
  }

  get day() {
    return this.game.clock.day;
  }

  name(id) {
    if (id === 'noa') return 'Noa';
    return CHARACTERS[id]?.name || id;
  }

  color(id) {
    if (id === 'noa') return '#ffcd20';
    return CHARACTERS[id]?.color || '#9fd8ff';
  }

  level(id) {
    return levelName(this.aff[id] || 0, this.partner === id ? 'couple' : null);
  }

  // Variation d'affinité, avec retour visuel et paliers de récompense.
  addAff(id, n) {
    if (!n || !CHARACTERS[id]) return;
    const before = this.level(id);
    this.aff[id] = Math.max(0, Math.min(100, (this.aff[id] || 0) + n));
    const g = this.game;
    const c = this.color(id);
    g.hud.toast(`${this.name(id)} ${n > 0 ? '♥ +' + n : '− ' + -n}`, n > 0 ? c : '#9a8ab8');
    if (n >= 5) g.audio.heart();
    const after = this.level(id);
    if (after !== before) g.hud.toast(`${this.name(id)} : ${after}`, c);
    for (const [min, xp] of MILESTONES) {
      const key = `${id}:${min}`;
      if (this.aff[id] >= min && !this.milestones.has(key)) {
        this.milestones.add(key);
        g.hud.banner('AMITIÉ', `${this.name(id)} — ${after}`, `+${xp} XP`);
        g.grantXp(xp);
      }
    }
  }

  // ---------- Conversations ----------
  // nodes : voir data/characters.js. opts : { with: npc, onEnd, cinematic }
  run(nodes, { with: npc = null, onEnd = null, char = null } = {}) {
    const g = this.game;
    this.conv = { queue: [...nodes], npc, onEnd, char, waiting: false };
    g.hero.cinematic = true;
    g.hero.vel.set(0, 0, 0);
    g.lockTarget = null;
    if (npc) {
      npc.faceTo(g.hero.pos);
      g.hero.yaw = Math.atan2(npc.pos.x - g.hero.pos.x, npc.pos.z - g.hero.pos.z);
      this.#frame(npc);
    }
    this.#step();
  }

  // Cadrage « champ / contrechamp » : caméra sur le côté le plus dégagé.
  #frame(npc) {
    const g = this.game;
    const a = g.hero.pos;
    const b = npc.pos;
    const mid = a.clone().lerp(b, 0.5);
    const along = b.clone().sub(a).setY(0).normalize();
    const side = V(-along.z, 0, along.x);
    let best = null;
    for (const s of [1, -1]) {
      const dir = side.clone().multiplyScalar(s).addScaledVector(along, -0.35).normalize();
      const from = mid.clone().add(V(0, 1.6, 0));
      const t = g.col.raycast(from, dir.clone().multiplyScalar(3.2), 1);
      if (!best || t > best.t) best = { t, dir };
    }
    const dist = Math.max(1.4, 3.2 * best.t - 0.25);
    this.prevCine = g.story.cine;
    g.story.cine = { pos: mid.clone().add(V(0, 1.65, 0)).addScaledVector(best.dir, dist), look: mid.clone().add(V(0, 1.45, 0)), lerp: 4 };
    this.framed = true;
  }

  #step() {
    const c = this.conv;
    const g = this.game;
    if (!c) return;
    const node = c.queue.shift();
    if (!node) return this.#end();
    if (typeof node.do === 'function') {
      node.do(this);
      return this.#step();
    }
    if (node.choices) {
      c.waiting = true;
      const shown = node.choices.filter((ch) => !ch.when || ch.when(this));
      g.hud.dialog({
        who: 'Noa', color: this.color('noa'), text: node.prompt || '…',
        choices: shown.map((ch) => ch.t),
        onChoose: (i) => {
          const ch = shown[i];
          g.audio.blip(1.2);
          const who = ch.char || c.char;
          if (ch.aff && who) this.addAff(who, ch.aff);
          if (ch.flag) this.flags.add(ch.flag);
          ch.do?.(this);
          if (ch.good != null) c.score = (c.score || 0) + (ch.good ? 1 : 0);
          if (ch.couple != null) c.couple = ch.couple;
          c.queue.unshift(...(ch.reply || []));
          c.waiting = false;
          this.#step();
        },
      });
      return;
    }
    const [who, text] = node;
    c.waiting = true;
    g.hud.dialog({ who: this.name(who), color: this.color(who), text });
    g.audio.blip(who === 'noa' ? 1 : 1.4);
    if (c.npc && who !== 'noa') c.npc.play('talk', 2.2);
    else if (who === 'noa') g.hero.playAnim('talk', 2.2, true);
  }

  // Avance d'une réplique (E / clic / toucher). Sans effet pendant un choix.
  next() {
    const c = this.conv;
    if (!c || this.game.hud.dl?.choices) return;
    c.waiting = false;
    this.#step();
  }

  #end() {
    const g = this.game;
    const c = this.conv;
    this.conv = null;
    g.hud.closeDialog();
    g.hero.cinematic = false;
    if (this.framed) {
      g.story.cine = this.prevCine || null;
      this.framed = false;
    }
    g.save('social');
    c?.onEnd?.(c);
  }

  get active() {
    return !!this.conv;
  }

  // Joue une scène nommée (utilisé par l'histoire) ; marque la scène comme vue.
  playScene(id, onEnd) {
    const sc = SCENES.find((s) => s.id === id);
    if (!sc) return onEnd?.();
    this.seen.add(id);
    const npc = this.friends[sc.char] || null;
    this.run(sc.lines, { with: npc, char: sc.char, onEnd: () => onEnd?.() });
  }

  // ---------- Amis présents dans le monde ----------
  // spots : { id: { x, y, z, yaw, pose } | null }
  placeFriends(spots) {
    const g = this.game;
    for (const id of Object.keys(CHARACTERS)) {
      const sp = spots[id];
      let npc = this.friends[id];
      if (!sp) {
        if (npc) npc.mode = 'gone';
        continue;
      }
      if (!npc) {
        npc = new Npc(g, { id, name: CHARACTERS[id].name, palette: CHARACTERS[id].palette, x: sp.x, z: sp.z, yaw: sp.yaw });
        this.friends[id] = npc;
      }
      npc.mode = 'idle';
      npc.route = [];
      npc.pos.set(sp.x, sp.y ?? 0.15, sp.z);
      npc.yaw = sp.yaw ?? 0;
      npc.targetYaw = npc.yaw;
      npc.pose = sp.pose || null;
      npc.model.root.visible = true;
    }
  }

  update(dt) {
    for (const n of Object.values(this.friends)) n.update(dt);
    const inp = this.game.input;
    const hud = this.game.hud;
    if (this.conv && hud.dl?.choices) {
      // Manette : X / Y / B = réponses 1 / 2 / 3.
      const n = inp.was('light') ? 0 : inp.was('heavy') ? 1 : inp.was('dodge') ? 2 : -1;
      if (n >= 0 && n < hud.dl.choices.length) hud.choose(n);
    } else if (this.conv && (inp.was('interact') || (inp.usingPad && inp.was('jump')))) this.next();
  }

  // Interactions proposées par les amis proches.
  interactables() {
    if (this.conv || this.game.story.inCinematic) return [];
    const out = [];
    for (const [id, npc] of Object.entries(this.friends)) {
      if (npc.mode === 'gone' || !npc.model.root.visible) continue;
      if (this.game.story.blocksTalk?.(id)) continue;
      const lvl = this.level(id);
      out.push({ kind: 'friend', id, pos: npc.pos, label: `<kbd>E</kbd>Parler — <span style="color:${this.color(id)}">${this.name(id)}</span> <small>(${lvl})</small>` });
    }
    return out;
  }

  // Menu de conversation avec un ami.
  open(id) {
    const g = this.game;
    const npc = this.friends[id];
    if (!npc) return;
    // Les scènes imposées par l'histoire passent en priorité.
    if (g.story.onFriendTalk?.(id)) return;
    const opts = [{ t: 'Discuter', go: () => this.chat(id) }];
    const gifts = GIFTS.filter((k) => g.inventory.count(k) > 0);
    if (gifts.length && this.giftDay[id] !== this.day) opts.push({ t: 'Offrir un cadeau…', go: () => this.giftMenu(id, gifts) });
    const dateOk = this.canDate(id);
    if (dateOk === true) opts.push({ t: `Proposer un rendez-vous (${DATES[id].placeLabel}) ❤`, go: () => this.startDate(id) });
    if (this.partner === id) opts.push({ t: 'Passer un moment ensemble ❤', go: () => this.together(id) });
    opts.push({ t: 'À plus tard', go: () => {} });
    npc.faceTo(g.hero.pos);
    this.run([
      [id, this.#greeting(id)],
      { prompt: 'Que veux-tu faire ?', choices: opts.map((o) => ({ t: o.t, do: () => { this.after = o.go; } })) },
    ], { with: npc, char: id, onEnd: () => {
      const go = this.after;
      this.after = null;
      go?.();
    } });
  }

  #greeting(id) {
    if (this.partner === id) return ['Hé toi ❤', 'Je pensais justement à toi.', 'Tu m’as manqué. Depuis ce matin.'][this.day % 3];
    const a = this.aff[id] || 0;
    if (a >= 60) return 'Noa ! Enfin quelqu’un de normal dans ce lycée.';
    if (a >= 30) return 'Salut Noa. Ça va ?';
    return 'Oh… salut.';
  }

  // Prochaine scène disponible (affinité suffisante, jamais vue).
  nextScene(id) {
    return SCENES.find((s) => s.char === id && !s.prologue && !this.seen.has(s.id) && (this.aff[id] || 0) >= s.min && (!s.when || s.when(this)));
  }

  chat(id) {
    const g = this.game;
    const npc = this.friends[id];
    const fresh = this.talkedDay[id] !== this.day;
    const sc = fresh ? this.nextScene(id) : null;
    this.talkedDay[id] = this.day;
    if (sc) {
      this.seen.add(sc.id);
      this.run(sc.lines, { with: npc, char: id, onEnd: () => g.onSocial?.('scene', id, sc.id) });
      return;
    }
    const lines = SMALL_TALK[id];
    this.run([[id, lines[(this.day + Object.keys(this.seen).length) % lines.length]]], {
      with: npc, char: id, onEnd: () => {
        if (fresh) this.addAff(id, 2);
        else g.hud.toast(`${this.name(id)} a déjà beaucoup discuté avec toi aujourd’hui`, '#9a8ab8');
      },
    });
  }

  giftMenu(id, gifts) {
    const npc = this.friends[id];
    this.run([{ prompt: 'Quel cadeau offrir ?', choices: [...gifts.map((k) => ({ t: ITEMS[k].name, do: () => (this.after = () => this.give(id, k)) })), { t: 'Finalement, non', do: () => {} }] }], {
      with: npc, char: id, onEnd: () => {
        const go = this.after;
        this.after = null;
        go?.();
      },
    });
  }

  give(id, item) {
    const g = this.game;
    if (!g.inventory.consume(item, 1)) return;
    this.giftDay[id] = this.day;
    const v = CHARACTERS[id].likes[item] ?? 4;
    const react = v >= 15 ? 'C’est… exactement ce que je voulais. Comment tu savais ?' : v >= 8 ? 'Oh, c’est trop gentil ! Merci, Noa.' : 'Merci… c’est l’intention qui compte, hein ?';
    this.run([[id, react]], { with: this.friends[id], char: id, onEnd: () => this.addAff(id, v) });
    this.friends[id]?.play(v >= 15 ? 'hug' : 'wave', 1.6);
  }

  // ---------- Romance ----------
  canDate(id) {
    const c = CHARACTERS[id];
    if (!c?.romance || this.partner === id) return false;
    if (this.partner) return false;
    if ((this.aff[id] || 0) < 50) return false;
    if (this.dateDay[id] === this.day) return false;
    if (this.game.clock.phase === 'night') return false;
    return true;
  }

  startDate(id) {
    const g = this.game;
    const date = DATES[id];
    const place = g.world.targets[date.place];
    this.dateDay[id] = this.day;
    if (!place) return;
    g.transition(() => {
      const spot = { x: place.x, y: place.y ?? 0.15, z: place.z + 1.2, yaw: Math.PI };
      if (g.zone !== 'city') g.enterZone('city', spot);
      g.setPhase('evening', true);
      const npc = this.friends[id];
      g.hero.placeAt(spot, Math.PI);
      npc.pos.set(place.x, place.y ?? 0.15, place.z - 0.4);
      npc.yaw = 0;
      npc.mode = 'idle';
      npc.model.root.visible = true;
      g.hud.chapter('RENDEZ-VOUS', `${CHARACTERS[id].name}`, date.placeLabel, 3);
    }, () => {
      this.run(date.lines, {
        with: this.friends[id], char: id,
        onEnd: (c) => {
          const score = c.score || 0;
          if (score >= 2) this.#confess(id);
          else {
            this.addAff(id, 3);
            g.hud.toast(`Le rendez-vous était sympa… mais pas magique. Réessaie un autre jour.`, '#9a8ab8');
          }
        },
      });
    });
  }

  #confess(id) {
    const g = this.game;
    const date = DATES[id];
    this.run(date.confess, {
      with: this.friends[id], char: id,
      onEnd: (c) => {
        if (c.couple) {
          this.partner = id;
          this.addAff(id, 10);
          this.friends[id]?.play('hug', 2.5);
          g.hero.playAnim('hug', 2.5);
          g.audio.heart();
          g.hud.banner('EN COUPLE ❤', `${CHARACTERS[id].name} & Noa`, 'Bonus permanent : +10 % d’expérience (motivation)');
          g.onSocial?.('couple', id);
        } else {
          this.addAff(id, 2);
          g.hud.toast(`${CHARACTERS[id].name} reste ton amie.`, this.color(id));
        }
        g.save('social');
      },
    });
  }

  together(id) {
    const g = this.game;
    const lines = {
      ines: [['ines', 'On fait juste… rien ? Cinq minutes ? Sans créatures, sans devoirs ?'], ['noa', 'Cinq minutes. Promis.']],
      camille: [['camille', 'Ce soir, je te montre Cassiopée. Tu verras, elle a la forme d’un W.'], ['noa', 'W comme… « wow » ?'], ['camille', 'T’es nul. J’adore.']],
    }[id] || [[id, '…']];
    this.run(lines, {
      with: this.friends[id], char: id,
      onEnd: () => {
        this.friends[id]?.play('hug', 2);
        g.hero.playAnim('hug', 2);
        if (this.talkedDay['_t' + id] !== this.day) {
          this.talkedDay['_t' + id] = this.day;
          g.hero.hp = g.hero.stats.maxHp;
          g.hud.toast('Moment à deux : santé restaurée ❤', this.color(id));
        }
      },
    });
  }

  // Bonus d'expérience lié à la relation amoureuse.
  get xpMult() {
    return this.partner ? 1.1 : 1;
  }

  reward(key) {
    const g = this.game;
    if (this.flags.has('rw:' + key)) return;
    this.flags.add('rw:' + key);
    if (key === 'malik_drawing') {
      g.inventory.add('hoodie_lime');
      g.hud.toast('Malik t’offre le Sweat Citron vert (« de la part de Yasmine »)', '#9be35a');
    }
  }

  // ---------- Cours ----------
  canAttendLesson() {
    return this.game.clock.phase === 'morning' && this.lessonDay !== this.day;
  }

  lesson() {
    // Jour 2 : physique (premier cours du chapitre 2), puis histoire, français…
    return LESSONS[(((this.day - 2) % LESSONS.length) + LESSONS.length) % LESSONS.length];
  }

  // Le cours : présentation du prof, trois questions, cloche.
  attendLesson(teacherNpc, onEnd) {
    const g = this.game;
    const L = this.lesson();
    this.lessonDay = this.day;
    let good = 0;
    const nodes = [[L.teacher, L.intro]];
    L.qs.forEach((q, i) => {
      nodes.push([L.teacher, `Question ${i + 1} : ${q.q}`]);
      nodes.push({ prompt: q.q, choices: q.a.map((a, k) => ({ t: a, do: () => {
        if (k === q.ok) good++;
        this.conv.queue.unshift([L.teacher, k === q.ok ? 'Exact. Bien, Vant.' : `Non… la bonne réponse était : ${q.a[q.ok]}.`]);
      } })) });
    });
    nodes.push({ do: () => g.audio.schoolBell() });
    nodes.push([L.teacher, 'C’est l’heure. Relisez vos notes pour demain.']);
    this.run(nodes, {
      with: teacherNpc, onEnd: () => {
        const xp = good * 40 + 20;
        this.grades.push({ day: this.day, subject: L.subject, score: good });
        g.hud.banner('COURS TERMINÉ', L.subject, `${good}/3 bonnes réponses · +${xp} XP`);
        g.grantXp(xp);
        onEnd?.(good);
      },
    });
  }
}
