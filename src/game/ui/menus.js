// Menus plein écran : inventaire/atelier, journal, pause/paramètres,
// récompenses de caisse, écran de mort.
import { ITEMS, RARITY_INFO, CATEGORIES, itemStats, upgradeCost, dismantleValue, UPGRADE_MAX } from '../data/items.js';
import { MISSIONS, MISSION_KIND_LABEL } from '../data/missions.js';
import { INVENTORY_CAPACITY } from '../systems/inventory.js';
import { BRANCHES, SKILLS, RESPEC_COST } from '../data/skills.js';
import { SHOP, SHOP_SECTIONS } from '../data/shop.js';
import { buy, canBuy } from '../systems/shop.js';
import { CHARACTERS, GIFTS } from '../data/characters.js';
import { CREA_POWERS } from '../systems/creative.js';
import { HEROES } from '../actors/fighter.js';

// Aide « Commandes manette » (même correspondance que PADMAP dans core/input.js).
const PAD_HELP = [
  ['A', 'a', 'Sauter / valider'], ['B', 'b', 'Roulade / annuler'], ['X', 'x', 'Coup léger'], ['Y', 'y', 'Coup lourd'],
  ['RB', '', 'Pouvoir'], ['LB', '', 'Verrouiller la cible'], ['LT', '', 'Bouclier'], ['RT', '', 'Magnétisme'],
  ['L3', '', 'Courir'], ['R3', '', 'Voler'], ['✚▲', '', 'Interagir'], ['✚▼', '', 'Soin'],
  ['✚▶', '', 'Forme Abysse'], ['✚◀', '', 'Relations'], ['☰', '', 'Pause'], ['⧉', '', 'Inventaire'],
];

const STAT_LABEL = {
  damage: 'Dégâts', defense: 'Défense', maxHp: 'Santé max', maxEnergy: 'Énergie max', energyGain: 'Énergie / coup', powerDamage: 'Bonus pouvoirs',
};
const fmt = (k, v) => (k === 'powerDamage' ? `+${Math.round(v * 100)} %` : `${v > 0 && k !== 'damage' && k !== 'defense' ? '+' : ''}${v}`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function shape(def) {
  const c = RARITY_INFO[def.rarity].color;
  if (def.category === 'weapon') return `<svg class="shape" viewBox="0 0 24 24"><path d="M6 4h9l3 4v8l-4 4H8l-3-4V8z" fill="none" stroke="${c}" stroke-width="2"/><path d="M8 9h8M8 13h8" stroke="${c}"/></svg>`;
  if (def.category === 'armor') return `<svg class="shape" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6z" fill="none" stroke="${c}" stroke-width="2"/></svg>`;
  return `<svg class="shape" viewBox="0 0 24 24"><path d="M12 3 20 12 12 21 4 12z" fill="${c}" opacity=".7"/></svg>`;
}

export class Menus {
  constructor(game) {
    this.game = game;
    this.open = null;
    this.filter = 'all';
    this.sort = 'rarity';
    this.sel = null;
    this.el = {};
    this.shopSection = 'featured';
    for (const name of ['inventory', 'journal', 'pause', 'reward', 'death', 'skills', 'shop', 'relations', 'crea']) {
      const d = document.createElement('div');
      d.className = `menu ${name === 'inventory' ? 'inv' : name}`;
      document.body.appendChild(d);
      d.addEventListener('click', (e) => this.#onClick(e));
      d.addEventListener('input', (e) => this.#onInput(e));
      this.el[name] = d;
    }
  }

  // ---------- Navigation à la manette ----------
  #padItems() {
    const el = this.el[this.open];
    if (!el) return [];
    return [...el.querySelectorAll('button, select, input, summary, [data-act]')].filter((b) => {
      if (b.disabled) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    });
  }

  padMove(dir) {
    const items = this.#padItems();
    if (!items.length) return;
    let cur = items.includes(this.padSel) ? this.padSel : null;
    if (!cur) return this.#padFocus(items[0]);
    const c = cur.getBoundingClientRect();
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null;
    let bestScore = Infinity;
    for (const b of items) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect();
      const dx = r.x + r.width / 2 - cx;
      const dy = r.y + r.height / 2 - cy;
      const along = dx * v[0] + dy * v[1];
      if (along <= 4) continue;
      const across = Math.abs(dx * v[1] - dy * v[0]);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best) this.#padFocus(best);
  }

  #padFocus(b) {
    this.padSel?.classList.remove('pad-focus');
    this.padSel = b;
    b.classList.add('pad-focus');
    b.focus?.({ preventScroll: true });
    b.scrollIntoView?.({ block: 'nearest' });
    this.game.audio?.ui?.();
  }

  padActivate() {
    const b = this.padSel;
    if (!b || !b.isConnected) return this.padMove('down');
    if (b.tagName === 'SELECT') {
      b.selectedIndex = (b.selectedIndex + 1) % b.options.length;
      b.dispatchEvent(new Event('change', { bubbles: true }));
      b.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (b.tagName === 'INPUT' && b.type === 'checkbox') {
      b.checked = !b.checked;
      b.dispatchEvent(new Event('input', { bubbles: true }));
      b.dispatchEvent(new Event('change', { bubbles: true }));
    } else b.click();
  }

  get isOpen() {
    return !!this.open;
  }

  show(name, opts = {}) {
    if (this.open && this.open !== name) this.el[this.open].classList.remove('on');
    this.open = name;
    this.opts = opts;
    this.render();
    this.el[name].classList.add('on');
    this.game.onMenu(true);
  }

  hide() {
    if (!this.open) return;
    if (this.open === 'reward' || this.open === 'death') {
      const cb = this.opts.onClose;
      this.opts.onClose = null;
      cb?.();
    }
    this.el[this.open].classList.remove('on');
    this.open = null;
    this.game.onMenu(false);
  }

  toggle(name, opts) {
    if (this.open === name) this.hide();
    else if (!this.open || ['inventory', 'journal', 'skills', 'relations'].includes(this.open)) this.show(name, opts);
  }

  render() {
    const r = {
      inventory: () => this.#inventory(), journal: () => this.#journal(), pause: () => this.#pause(),
      reward: () => this.#reward(), death: () => this.#death(), skills: () => this.#skills(), shop: () => this.#shop(),
      relations: () => this.#relations(),
      crea: () => this.#crea(),
    }[this.open];
    r?.();
  }

  // ---------- Inventaire / atelier ----------
  #inventory() {
    const g = this.game;
    const inv = g.inventory;
    const workshop = !!this.opts.workshop;
    const list = inv.list({ category: this.filter, sort: this.sort });
    if (this.sel && !list.find((e) => String(e.uid) === String(this.sel))) this.sel = null;
    if (!this.sel && list.length) this.sel = String(list[0].uid);
    const eqIds = Object.values(inv.equipped);
    const cards = list.map((e) => {
      const rc = RARITY_INFO[e.def.rarity].color;
      return `<div class="card ${String(e.uid) === this.sel ? 'sel' : ''}" style="--rc:${rc}" data-sel="${e.uid}">
        <div class="r">${RARITY_INFO[e.def.rarity].label}</div>${shape(e.def)}<div class="n">${esc(e.def.name)}${e.level ? ` +${e.level}` : ''}</div>
        ${e.stack ? `<span class="q">×${e.qty}</span>` : ''}${eqIds.includes(e.uid) ? '<span class="eq">ÉQUIPÉ</span>' : ''}${e.fav ? '<span class="fav">★</span>' : ''}</div>`;
    }).join('') || '<p style="color:var(--dim)">Aucun objet dans cette catégorie.</p>';

    const tabs = [['all', 'Tout'], ...Object.entries(CATEGORIES)].map(([k, l]) => `<button class="btn ${this.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('');
    this.el.inventory.innerHTML = `
      <div class="head"><h2>${workshop ? 'ATELIER' : 'INVENTAIRE'}</h2>
        <div class="meta"><span>${inv.usedSlots} / ${INVENTORY_CAPACITY} emplacements</span><span>Credits ${inv.credits}</span><span>Abyss Shards ${inv.shards}</span>
        <span>Ferraille ${inv.count('scrap')}</span><span>Fragments ${inv.count('abyss_fragment')}</span>
        <button class="btn close" data-act="close">Fermer [Échap]</button></div></div>
      <div class="body"><div class="left">
        <div class="tabs">${tabs}<select data-sort><option value="rarity">Tri : rareté</option><option value="power">Tri : puissance</option><option value="name">Tri : nom</option></select></div>
        <div class="grid">${cards}</div></div>
        <div class="detail">${this.#detail(list.find((e) => String(e.uid) === this.sel), workshop)}</div></div>`;
    this.el.inventory.querySelector('[data-sort]').value = this.sort;
  }

  #detail(e, workshop) {
    if (!e) return '<p style="color:var(--dim)">Sélectionnez un objet.</p>';
    const inv = this.game.inventory;
    const def = e.def;
    const rc = RARITY_INFO[def.rarity].color;
    let html = `<div class="r" style="--rc:${rc}">${RARITY_INFO[def.rarity].label} · ${CATEGORIES[def.category]}</div>
      <h3>${esc(def.name)}${e.level ? ` <span style="color:var(--amber)">+${e.level}</span>` : ''}</h3><p class="desc">${esc(def.desc)}</p>`;
    if (e.stack) return html + `<p>Quantité : <b>${e.qty}</b></p>${def.usable ? '<div class="actions"><button class="btn primary" data-act="use" data-id="' + e.id + '">Utiliser</button></div>' : ''}`;
    const stats = itemStats(e);
    const cur = inv.equippedItem(def.slot);
    const curStats = cur && cur.uid !== e.uid ? itemStats(cur) : null;
    const keys = new Set([...Object.keys(stats), ...Object.keys(curStats || {})]);
    html += '<table class="stats">';
    for (const k of keys) {
      const v = stats[k] || 0;
      let delta = '';
      if (curStats) {
        const d = Math.round((v - (curStats[k] || 0)) * 100) / 100;
        if (d) delta = ` <span class="${d > 0 ? 'up' : 'down'}">(${d > 0 ? '+' : ''}${k === 'powerDamage' ? Math.round(d * 100) + ' %' : d})</span>`;
      }
      html += `<tr><td>${STAT_LABEL[k]}</td><td>${fmt(k, v)}${delta}</td></tr>`;
    }
    html += '</table>';
    if (curStats) html += `<p class="cost">Comparé à l'objet équipé : ${esc(ITEMS[cur.id].name)}</p>`;
    const equipped = inv.equipped[def.slot] === e.uid;
    const cost = upgradeCost(e);
    const maxed = (e.level || 0) >= UPGRADE_MAX;
    const dv = dismantleValue(e);
    html += `<div class="actions">
      ${equipped ? `<button class="btn" data-act="unequip" data-slot="${def.slot}">Retirer</button>` : `<button class="btn primary" data-act="equip" data-uid="${e.uid}">Équiper</button>`}
      <button class="btn" data-act="upgrade" data-uid="${e.uid}" ${!workshop || maxed || !inv.canUpgrade(e.uid) ? 'disabled' : ''}>Améliorer</button>
      <button class="btn" data-act="fav" data-uid="${e.uid}">${e.fav ? '★ Favori' : '☆ Favori'}</button>
      <button class="btn" data-act="dismantle" data-uid="${e.uid}" ${equipped || e.fav ? 'disabled' : ''}>Démonter</button></div>
      <p class="cost">${maxed ? 'Niveau maximal atteint.' : `Amélioration +${(e.level || 0) + 1} : ${cost.scrap} Ferraille${cost.abyss_fragment ? `, ${cost.abyss_fragment} Fragment(s) d'Abysse` : ''}.`}
      ${workshop ? '' : '<br>Les améliorations se font à l\'établi du refuge.'}<br>Démontage : ${dv.scrap} Ferraille${dv.abyss_fragment ? ` + ${dv.abyss_fragment} Fragment` : ''}.</p>`;
    return html;
  }

  // ---------- Compétences ----------
  #skills() {
    const g = this.game;
    const tree = g.skills;
    const pts = g.progression.skillPoints;
    const cols = Object.entries(BRANCHES).map(([b, info]) => {
      const nodes = Object.entries(SKILLS).filter(([, sk]) => sk.branch === b).sort((x, y) => x[1].tier - y[1].tier).map(([id, sk]) => {
        const r = tree.rank(id);
        const block = tree.blocker(id, pts);
        const pips = Array.from({ length: sk.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
        return `<div class="skill ${r ? 'got' : ''} ${block && !r ? 'locked' : ''}" style="--bc:${info.color}">
          <div class="sk-n">${esc(sk.name)}</div><div class="pips">${pips}</div><div class="sk-d">${esc(sk.desc)}</div>
          <button class="btn ${block ? '' : 'primary'}" data-act="learn" data-id="${id}" ${block ? 'disabled' : ''} title="${esc(block || '')}">${r >= sk.max ? 'Max' : `Apprendre · ${sk.cost} pt`}</button></div>`;
      }).join('<div class="sk-link"></div>');
      return `<div class="branch"><div class="b-h" style="color:${info.color}">${info.label}</div><div class="b-d">${info.desc}</div>${nodes}</div>`;
    }).join('');
    const atRefuge = !!this.opts.atRefuge;
    this.el.skills.innerHTML = `<div class="head"><h2>COMPÉTENCES</h2><div class="meta"><span class="pts">${pts} point(s) disponible(s)</span>
      <button class="btn" data-act="respec" ${atRefuge && tree.spent() && g.inventory.credits >= RESPEC_COST ? '' : 'disabled'}>Réinitialiser (${RESPEC_COST} Credits${atRefuge ? '' : ', au refuge'})</button>
      <button class="btn" data-act="close">Fermer</button></div></div><div class="tree">${cols}</div>`;
  }

  // ---------- Boutique ----------
  #shop() {
    const g = this.game;
    const inv = g.inventory;
    const tabs = Object.entries(SHOP_SECTIONS).map(([k, l]) => `<button class="btn ${this.shopSection === k ? 'on' : ''}" data-section="${k}">${l}</button>`).join('');
    const cards = SHOP.filter((e) => e.section === this.shopSection).map((e) => {
      const def = ITEMS[e.item];
      const rc = RARITY_INFO[def.rarity].color;
      const reason = canBuy(e, inv);
      const price = e.price.credits ? `${e.price.credits} Credits` : `${e.price.shards} Abyss Shards`;
      const st = def.stats ? Object.entries(itemStats({ id: e.item, level: 0 })).map(([k, v]) => `${STAT_LABEL[k]} ${fmt(k, v)}`).join(' · ') : '';
      return `<div class="card shopcard" style="--rc:${rc}"><div class="r">${RARITY_INFO[def.rarity].label}</div>${shape(def)}
        <div class="n">${esc(e.label || def.name)}${e.qty > 1 ? ` ×${e.qty}` : ''}</div><div class="sk-d">${esc(e.desc || def.desc)}</div>
        ${st ? `<div class="cost">${st}</div>` : ''}
        <button class="btn ${reason ? '' : 'primary'}" data-act="buy" data-key="${e.key}" ${reason ? 'disabled' : ''}>${reason || price}</button></div>`;
    }).join('');
    this.el.shop.innerHTML = `<div class="head"><h2>BOUTIQUE DE MARA</h2><div class="meta"><span>Credits ${inv.credits}</span><span>Abyss Shards ${inv.shards}</span>
      <span>${inv.usedSlots} / ${INVENTORY_CAPACITY}</span><button class="btn" data-act="skills">Compétences</button><button class="btn" data-act="close">Fermer</button></div></div>
      <div class="left"><div class="tabs">${tabs}</div><div class="grid shopgrid">${cards}</div>
      <p class="cost">Aucun achat avec de l'argent réel : tout s'obtient en jouant.</p></div>`;
  }

  // ---------- Journal ----------
  // ---------- Mode Créatif ----------
  #crea() {
    const g = this.game;
    const C = g.creative;
    const b = (op, label, on = false, extra = '') => `<button class="btn ${on ? 'primary' : ''}" data-act="crea" data-op="${op}" ${extra}>${label}</button>`;
    const h = g.clock.hour ?? 9;
    this.el.crea.innerHTML = `<div class="body crea-body"><div class="head"><h2>MODE CRÉATIF</h2><button class="btn" data-act="close">Fermer [B]</button></div>
      <h3>Créatures</h3><div class="crea-row">
        ${b('m:stalker', '👁 Stalker')}${b('m:crawler', '🕷 Crawler')}${b('m:brute', '🦍 Brute')}${b('m:colossus', '🗿 Colosse')}${b('m:wave', '🌊 Vague (6)')}${b('clearM', '✖ Tout effacer')}
      </div>
      <h3>Héros alliés <small>(${g.allies.length} en jeu)</small></h3><div class="crea-row">
        ${Object.entries(HEROES).map(([id, H]) => b('h:' + id, `<span style="color:${H.color}">●</span> ${H.name}`, false, `title="${H.desc}"`)).join('')}${b('clearH', '✖ Renvoyer')}
      </div>
      <h3>Ville</h3><div class="crea-row">
        ${b('crowd', '👥 Foule (+8 passants)')}${[1, 3, 5].map((n) => b('w:' + n, `🚓 Police ${'★'.repeat(n)}`)).join('')}${b('w:0', '✋ Lever l’alerte')}
      </div>
      <h3>Heure <small>(${Math.floor(h)} h)</small></h3><div class="crea-row">
        ${[[7, '🌅 Matin'], [13, '☀ Midi'], [19.2, '🌇 Crépuscule'], [22.5, '🌙 Nuit']].map(([v, l]) => b('t:' + v, l)).join('')}
      </div>
      <h3>Réglages</h3><div class="crea-row">
        ${b('inv', `🛡 Invincible : ${C.invincible ? 'OUI' : 'non'}`, C.invincible)}${b('inf', `⚡ Énergie / Abysse illimitées : ${C.infinite ? 'OUI' : 'non'}`, C.infinite)}${b('pol', `🚫 Police désactivée : ${C.noPolice ? 'OUI' : 'non'}`, C.noPolice)}
      </div>
      <h3>Pouvoir créatif <small>(U pour lancer, O pour changer · bouton ✪)</small></h3><div class="crea-row">
        ${CREA_POWERS.map((p, i) => b('p:' + i, `<span style="color:${p.color}">${p.icon}</span> ${p.name}`, C.power === i, `title="${p.desc}"`)).join('')}
      </div>
      <p class="cost">${C.current.desc}</p></div>`;
  }

  #creaOp(op) {
    const g = this.game;
    const C = g.creative;
    if (!C) return;
    const [k, v] = op.split(':');
    if (k === 'm') {
      if (v === 'wave') for (const t of ['stalker', 'stalker', 'crawler', 'crawler', 'stalker', 'brute']) C.spawnMonster(t);
      else C.spawnMonster(v);
      return this.hide();
    }
    if (k === 'h') {
      g.spawnAlly(v);
      g.hud.toast(`${HEROES[v].name} arrive en renfort !`, HEROES[v].color);
      return this.hide();
    }
    if (k === 'w') return g.police.setStars(Number(v));
    if (k === 't') {
      g.clock.hour = Number(v);
      g.skyT = 0;
      return;
    }
    if (k === 'p') return C.select(Number(v));
    if (op === 'clearM') C.clearMonsters();
    if (op === 'clearH') C.clearAllies();
    if (op === 'crowd') C.spawnCrowd(8);
    if (op === 'inv') C.invincible = !C.invincible;
    if (op === 'inf') C.infinite = !C.infinite;
    if (op === 'pol') {
      C.noPolice = !C.noPolice;
      if (C.noPolice) g.police.reset();
    }
  }

  // ---------- Relations ----------
  #relations() {
    const g = this.game;
    const so = g.social;
    const cards = Object.entries(CHARACTERS).filter(([, c]) => !c.hiddenUntil || so.flags.has(c.hiddenUntil)).map(([id, c]) => {
      const met = so.friends[id] || so.seen.size && [...so.seen].some((k) => k.startsWith(id)) || (so.aff[id] || 0) > 0;
      const aff = so.aff[id] || 0;
      const lvl = so.level(id);
      const likes = GIFTS.filter((k) => (c.likes[k] || 0) >= 15).map((k) => ITEMS[k].name);
      const known = aff >= 30 ? likes.join(', ') || '—' : '<i>Deviens plus proche pour le découvrir</i>';
      const heart = c.romance ? (so.partner === id ? '<span class="rel-tag love">En couple ❤</span>' : '<span class="rel-tag">Romance possible</span>') : '<span class="rel-tag">Ami</span>';
      const today = so.talkedDay[id] === g.clock.day ? 'Déjà parlé aujourd’hui' : 'Disponible aujourd’hui';
      return `<div class="rel-card" style="--rc:${c.color}">
        <div class="rel-top"><div class="rel-name">${met ? c.name : '???'}</div>${heart}</div>
        <div class="rel-lvl">${lvl}</div>
        <div class="rel-bar"><i style="width:${aff}%"></i></div>
        <p>${c.desc}</p>
        <div class="rel-meta">Cadeau préféré : ${known}<br>${today}${c.romance && aff >= 50 && !so.partner ? '<br><b>Tu peux lui proposer un rendez-vous ❤</b>' : ''}</div>
      </div>`;
    }).join('');
    const grades = so.grades.slice(-6).map((gr) => `<li>Jour ${gr.day} · ${gr.subject} : <b>${gr.score}/3</b></li>`).join('') || '<li>Aucun cours suivi pour l’instant.</li>';
    const partner = so.partner ? `<p class="rel-bonus">❤ En couple avec <b>${CHARACTERS[so.partner].name}</b> — bonus permanent : +10 % d’expérience.</p>` : '';
    this.el.relations.innerHTML = `<div class="body"><div class="head"><h2>RELATIONS</h2><span class="rel-clock">${g.clockLabel()}</span><button class="btn" data-act="close">Fermer [L]</button></div>
      ${partner}<div class="rel-grid">${cards}</div>
      <div class="rel-grades"><h3>Bulletin</h3><ul>${grades}</ul>
      <p class="rel-help">Parle à tes amis une fois par jour pour faire avancer vos histoires. Offre des cadeaux (boutique, section « Cadeaux »). À 50 d’affinité, propose un rendez-vous à Inès ou Camille.</p></div></div>`;
  }

  #journal() {
    const log = this.game.missions;
    const rows = Object.entries(MISSIONS).map(([id, def]) => {
      const st = log.state[id];
      if (!st) return '';
      const steps = def.steps.map((s, i) => {
        const cls = st.status === 'done' || i < st.step ? 'done' : i === st.step ? 'cur' : '';
        const c = s.type === 'kill' && i === st.step && st.status !== 'done' ? ` (${st.progress}/${s.count})` : '';
        return `<li class="${cls}">${s.text}${c}</li>`;
      }).join('');
      const rw = def.reward;
      const reward = [rw.xp && `${rw.xp} XP`, rw.credits && `${rw.credits} Credits`, rw.shards && `${rw.shards} Abyss Shards`, ...(rw.items || []).map((i) => `${i.qty}× ${ITEMS[i.id].name}`)].filter(Boolean).join(' · ');
      return `<div class="mission"><div class="k">${MISSION_KIND_LABEL[def.kind]} ${st.status === 'done' ? '· TERMINÉE' : ''}</div>
        <div class="t">${def.title}</div><p>${def.intro}</p><ol>${steps}</ol><div class="rw">Récompense : ${reward}</div>
        ${st.status === 'active' ? `<div class="actions"><button class="btn ${log.tracked === id ? 'primary' : ''}" data-act="track" data-id="${id}">${log.tracked === id ? 'Suivie' : 'Suivre'}</button></div>` : ''}</div>`;
    }).join('');
    this.el.journal.innerHTML = `<div class="body"><div class="head"><h2>JOURNAL</h2><button class="btn" data-act="close">Fermer</button></div>${rows}</div>`;
  }

  // ---------- Pause / paramètres ----------
  #pause() {
    const s = this.game.settings;
    const slider = (key, label, min, max, step) =>
      `<label>${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-set="${key}"><span>${Math.round(s[key] * 100)}%</span></label>`;
    const check = (key, label) => `<label>${label}<input type="checkbox" data-set="${key}" ${s[key] ? 'checked' : ''}><span></span></label>`;
    this.el.pause.innerHTML = `<div class="body">
      <h2>PAUSE</h2>
      <div class="col">
        <button class="btn primary" data-act="close">Reprendre</button>
        <button class="btn" data-act="save" ${this.game.inCombat ? 'disabled' : ''}>${this.game.inCombat ? 'Sauvegarde impossible en combat' : 'Sauvegarder'}</button>
        <button class="btn" data-act="load">Charger la dernière sauvegarde</button>
        <button class="btn" data-act="quit">Quitter vers le titre</button>
      </div>
      <div class="settings">
        ${slider('master', 'Volume général', 0, 1, 0.05)}
        ${slider('music', 'Musique', 0, 1, 0.05)}
        ${slider('sfx', 'Effets sonores', 0, 1, 0.05)}
        ${slider('sensitivity', 'Sensibilité caméra', 0.3, 2.5, 0.05)}
        ${slider('textScale', "Taille de l'interface", 0.8, 1.4, 0.05)}
        ${check('invertY', 'Inverser l’axe vertical')}
        ${check('shake', 'Secousses de caméra')}
        ${check('markers', 'Marqueurs d’objectif')}
        ${check('subtitles', 'Sous-titres')}
        <label>Qualité graphique<select data-set="quality">
          <option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Élevée</option></select><span></span></label>
        <p class="cost">La qualité modifie immédiatement la résolution, les ombres et le bloom ; le nombre de lumières et la densité de pluie s'appliquent au prochain chargement.</p>
      </div>
      <div class="controls">Clavier : ZQSD/WASD déplacer · Maj sprint · Espace sauter · Clic gauche combo (en l'air : attaque plongeante) · Clic droit coup lourd<br>
        Ctrl/C esquive (au bon moment : esquive parfaite) · F pouvoir · G bouclier · X magnétisme · V voler · T Forme Abysse · R verrouiller · E interagir · H soin<br>
        I inventaire · J journal · K compétences · L relations · N marqueurs · 1-2-3 réponses de dialogue</div>
      <details class="controls pad-controls"><summary><b>Commandes manette (Xbox)</b></summary>
        <div class="pad-table">
          ${PAD_HELP.map(([g, cls, label]) => `<span class="g ${cls}">${g}</span><span>${label}</span>`).join('')}
        </div>
        <p>Dans les dialogues : <span class="g a">A</span> continuer · <span class="g x">X</span> <span class="g y">Y</span> <span class="g b">B</span> réponses 1 / 2 / 3. Dans les menus : <span class="g b">B</span> fermer.</p>
      </details>
    </div>`;
    this.el.pause.querySelector('[data-set=quality]').value = s.quality;
  }

  // ---------- Récompenses ----------
  #reward() {
    const { title, color, rewards, overflow, lore } = this.opts;
    const cards = rewards.map((r, i) => {
      if (r.kind === 'item') {
        const def = ITEMS[r.id];
        const rc = RARITY_INFO[def.rarity].color;
        const lost = overflow?.includes(r);
        return `<div class="card" style="--rc:${rc};animation-delay:${i * 0.12}s"><div class="r">${RARITY_INFO[def.rarity].label}</div>${shape(def)}
          <div class="n">${esc(def.name)}</div>${r.qty > 1 ? `<span class="q">×${r.qty}</span>` : ''}${lost ? '<div class="r" style="--rc:#ff5a6a">Inventaire plein</div>' : ''}</div>`;
      }
      const label = r.kind === 'credits' ? 'Credits' : r.kind === 'shards' ? 'Abyss Shards' : r.kind === 'xp' ? 'XP' : r.kind;
      const rc = r.kind === 'shards' ? '#7cf7ff' : r.kind === 'xp' ? '#a060ff' : '#ffcd20';
      return `<div class="card" style="--rc:${rc};animation-delay:${i * 0.12}s"><div class="r">Monnaie</div><div class="n" style="font-size:1.6em;margin:10px 0">+${r.amount}</div><div class="n">${label}</div></div>`;
    }).join('');
    this.el.reward.innerHTML = `<div class="body"><div style="letter-spacing:.4em;color:${color}">RÉCOMPENSES</div><h2>${esc(title)}</h2>
      <div class="items">${cards}</div>${lore ? `<div class="lore">${lore}</div>` : ''}
      ${overflow?.length ? '<p class="cost">Certains objets n’ont pas pu être ajoutés : libérez de la place (démontage) et rouvrez la caisse — ils restent à l’intérieur.</p>' : ''}
      <button class="btn primary" data-act="close">Continuer [E]</button></div>`;
  }

  #death() {
    this.el.death.innerHTML = `<div class="body"><h2>VOUS ÊTES TOMBÉ</h2>
      <p style="color:var(--dim)">Les créatures retournent dans l'ombre. Votre progression de mission est conservée.</p>
      <button class="btn primary" data-act="respawn">Réapparaître au refuge</button></div>`;
  }

  // ---------- Événements ----------
  #onClick(e) {
    const t = e.target.closest('[data-act],[data-sel],[data-filter],[data-section]');
    if (!t) return;
    const g = this.game;
    const inv = g.inventory;
    g.audio.ui();
    if (t.dataset.sel) {
      this.sel = t.dataset.sel;
      return this.render();
    }
    if (t.dataset.section) {
      this.shopSection = t.dataset.section;
      return this.render();
    }
    if (t.dataset.filter) {
      this.filter = t.dataset.filter;
      this.sel = null;
      return this.render();
    }
    const uid = t.dataset.uid ? Number(t.dataset.uid) : null;
    switch (t.dataset.act) {
      case 'close': return this.hide();
      case 'crea': this.#creaOp(t.dataset.op); break;
      case 'equip': inv.equip(uid); g.onEquipmentChanged(); break;
      case 'unequip': inv.unequip(t.dataset.slot); g.onEquipmentChanged(); break;
      case 'fav': inv.toggleFav(uid); break;
      case 'upgrade':
        if (inv.upgrade(uid)) {
          g.audio.levelUp();
          g.onEquipmentChanged();
          g.save('upgrade');
        } else g.audio.denied();
        break;
      case 'dismantle': {
        const v = inv.dismantle(uid);
        if (v) g.hud.toast(`Démonté : +${v.scrap} Ferraille${v.abyss_fragment ? ` +${v.abyss_fragment} Fragment` : ''}`);
        this.sel = null;
        break;
      }
      case 'use': g.useMedkit(); break;
      case 'track': g.missions.track(t.dataset.id); break;
      case 'learn':
        if (g.skills.learn(t.dataset.id, g.progression)) {
          g.audio.levelUp();
          g.onSkillsChanged();
          g.save('skills');
        } else g.audio.denied();
        break;
      case 'respec':
        if (inv.credits >= RESPEC_COST) {
          inv.credits -= RESPEC_COST;
          g.skills.reset(g.progression);
          g.onSkillsChanged();
          g.save('skills');
        }
        break;
      case 'buy': {
        const r = buy(t.dataset.key, inv);
        if (r.ok) {
          g.audio.crateOpen(false);
          g.hud.toast(`Acheté : ${r.entry.label || ITEMS[r.entry.item].name}`, '#5fd068');
          g.save('shop');
        } else {
          g.audio.denied();
          g.hud.toast(r.reason, '#ff6a6a');
        }
        break;
      }
      case 'skills': this.show('skills', { atRefuge: true }); return;
      case 'save': g.save('manual', true); break;
      case 'load': this.hide(); g.loadLast(); return;
      case 'quit': this.hide(); g.quitToTitle(); return;
      case 'respawn': this.hide(); return;
      default: break;
    }
    this.render();
  }

  #onInput(e) {
    const key = e.target.dataset.set;
    if (e.target.dataset.sort !== undefined) {
      this.sort = e.target.value;
      return this.render();
    }
    if (!key) return;
    const s = this.game.settings;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    s[key] = v;
    if (e.target.type === 'range') e.target.nextElementSibling.textContent = `${Math.round(v * 100)}%`;
    this.game.applySettings();
  }
}
