// Menus plein écran : inventaire/atelier, journal, pause/paramètres,
// récompenses de caisse, écran de mort.
import { ITEMS, RARITY_INFO, CATEGORIES, itemStats, upgradeCost, dismantleValue, UPGRADE_MAX } from '../data/items.js';
import { MISSIONS, MISSION_KIND_LABEL } from '../data/missions.js';
import { INVENTORY_CAPACITY } from '../systems/inventory.js';

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
    for (const name of ['inventory', 'journal', 'pause', 'reward', 'death']) {
      const d = document.createElement('div');
      d.className = `menu ${name === 'inventory' ? 'inv' : name}`;
      document.body.appendChild(d);
      d.addEventListener('click', (e) => this.#onClick(e));
      d.addEventListener('input', (e) => this.#onInput(e));
      this.el[name] = d;
    }
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
    else if (!this.open || this.open === 'inventory' || this.open === 'journal') this.show(name, opts);
  }

  render() {
    const r = {
      inventory: () => this.#inventory(), journal: () => this.#journal(), pause: () => this.#pause(),
      reward: () => this.#reward(), death: () => this.#death(),
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
      ${workshop ? '' : '<br>Les améliorations se font à l\'atelier du refuge.'}<br>Démontage : ${dv.scrap} Ferraille${dv.abyss_fragment ? ` + ${dv.abyss_fragment} Fragment` : ''}.</p>`;
    return html;
  }

  // ---------- Journal ----------
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
      <div class="controls">ZQSD/WASD déplacer · Maj sprint · Espace sauter · Clic gauche combo (en l'air : attaque plongeante) · Clic droit coup lourd<br>
        Ctrl/C esquive (au bon moment : esquive parfaite) · F Void Strike · R verrouiller · E interagir · H soin · I inventaire · J journal · N marqueurs<br>
        Manette : stick G/D, A saut, X combo, Y lourd, B esquive, RB pouvoir, LB verrouillage, ↑ interagir</div>
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
    const t = e.target.closest('[data-act],[data-sel],[data-filter]');
    if (!t) return;
    const g = this.game;
    const inv = g.inventory;
    g.audio.ui();
    if (t.dataset.sel) {
      this.sel = t.dataset.sel;
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
