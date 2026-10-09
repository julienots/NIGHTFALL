// HUD en DOM superposé au canvas.
const POWER_ICON = `<svg class="ico" viewBox="0 0 24 24"><path d="M12 2 4 13h6l-2 9 10-13h-6l2-7z" fill="#c9a0ff"/></svg>`;
const MED_ICON = `<svg class="ico" viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#ff5a6a"/></svg>`;

export class Hud {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="vignette"></div>
      <div class="layer bars"></div>
      <div class="layer nums"></div>
      <div class="reticle"></div>
      <div class="marker"><span></span></div>
      <div class="wallet"><span class="cr">0</span><span class="sh">0</span></div>
      <div class="compass"></div>
      <div class="objective"></div>
      <div class="toasts"></div>
      <div class="prompt"></div>
      <div class="subtitle"></div>
      <div class="hint"></div>
      <div class="letterbox"><i></i><i></i></div>
      <div class="phone"><div class="ph-app">Messages</div><div class="ph-from"></div><div class="ph-text"></div></div>
      <div class="chapter"><div class="c1"></div><div class="c2"></div><div class="c3"></div></div>
      <div class="vitals">
        <div class="name">NOA <small class="lvl">NIV. 1</small></div>
        <div class="bar hp"><b></b><i></i><span class="bar-label hpv"></span></div>
        <div class="bar en"><i></i><span class="bar-label env"></span></div>
        <div class="bar xp"><i></i></div>
      </div>
      <div class="abilities">
        <div class="weapon"><div class="lbl">NOYAU</div><div class="wn"></div></div>
        <div class="slot small med">${MED_ICON}<span class="qty">0</span><span class="key">H</span></div>
        <div class="slot pw">${POWER_ICON}<div class="cd"></div><span class="key">F</span></div>
        <div class="slot small fly"><svg class="ico" viewBox="0 0 24 24"><path d="M12 3c2 3 2 6 0 9-2-3-2-6 0-9zM4 14c3-1 5 0 8 3 3-3 5-4 8-3-2 3-5 5-8 6-3-1-6-3-8-6z" fill="#7fe3ff"/></svg><span class="key">V</span></div>
      </div>`;
    parent.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.$ = {
      hp: q('.bar.hp > i'), hpLag: q('.bar.hp > b'), hpv: q('.hpv'), en: q('.bar.en > i'), env: q('.env'), xp: q('.bar.xp > i'),
      lvl: q('.lvl'), cr: q('.cr'), sh: q('.sh'), obj: q('.objective'), prompt: q('.prompt'), toasts: q('.toasts'),
      sub: q('.subtitle'), bars: q('.bars'), nums: q('.nums'), ret: q('.reticle'), marker: q('.marker'), markerTxt: q('.marker span'),
      pw: q('.slot.pw'), pwcd: q('.slot.pw .cd'), med: q('.med .qty'), wn: q('.wn'), vig: q('.vignette'), compass: q('.compass'),
      hint: q('.hint'),
    };
    this.barEls = new Map();
    this.last = {};
    this.subQueue = [];
    this.subT = 0;
  }

  #setText(key, el, v) {
    if (this.last[key] !== v) {
      this.last[key] = v;
      el.textContent = v;
    }
  }

  update(s) {
    const hpK = s.hp / s.maxHp;
    this.$.hp.style.transform = `scaleX(${hpK})`;
    this.$.hpLag.style.transform = `scaleX(${hpK})`;
    this.#setText('hpv', this.$.hpv, `${Math.ceil(s.hp)} / ${s.maxHp}`);
    this.$.en.style.transform = `scaleX(${s.energy / s.maxEnergy})`;
    this.#setText('env', this.$.env, `${Math.floor(s.energy)}`);
    this.$.xp.style.transform = `scaleX(${s.xp / s.xpNext})`;
    this.#setText('lvl', this.$.lvl, `NIV. ${s.level}${s.skillPoints ? `  ·  ${s.skillPoints} PT` : ''}`);
    this.#setText('cr', this.$.cr, s.credits.toLocaleString('fr-FR'));
    this.#setText('sh', this.$.sh, String(s.shards));
    this.#setText('med', this.$.med, String(s.medkits));
    this.el.classList.toggle('no-powers', !s.rings);
    this.el.querySelector('.fly').style.display = s.flight ? '' : 'none';
    this.el.querySelector('.fly').classList.toggle('ready', !!s.flying);
    const cdK = s.powerCd > 0 ? (s.powerCd / s.powerCdMax) * 100 : s.energy < s.powerCost ? 100 : 0;
    this.$.pwcd.style.setProperty('--cd', `${cdK}%`);
    this.$.pw.classList.toggle('ready', cdK === 0);
    if (this.last.wn !== s.weaponName) {
      this.last.wn = s.weaponName;
      this.$.wn.textContent = s.weaponName;
      this.$.wn.style.color = s.weaponColor;
    }
    this.$.vig.classList.toggle('lowhp', hpK < 0.3 && hpK > 0);
    const objKey = JSON.stringify(s.objective) + s.otherCount;
    if (this.last.obj !== objKey) {
      this.last.obj = objKey;
      const o = s.objective;
      this.$.obj.innerHTML = o
        ? `<div class="kind">${o.kindLabel}</div><div class="title">${o.title}</div><div class="step">${o.text}</div><div class="dist"></div>
           ${s.otherCount ? `<div class="others">+${s.otherCount} autre(s) mission(s) — <span class="kbd">J</span></div>` : ''}`
        : '<div class="kind">Exploration libre</div>';
      this.$.dist = this.$.obj.querySelector('.dist');
    }
    if (this.$.dist) this.$.dist.textContent = s.objDist != null ? `${Math.round(s.objDist)} m` : '';
    this.#compass(s.camYaw, s.objBearing);
    this.#subtitles(s.dt);
  }

  #compass(yaw, objBearing) {
    // yaw caméra : 0 = regarde vers +Z (sud). Nord = -Z.
    const W = this.$.compass.clientWidth || 400;
    const items = [['N', Math.PI], ['E', Math.PI / 2], ['S', 0], ['O', -Math.PI / 2], ['NE', Math.PI * 0.75], ['SE', Math.PI * 0.25], ['SO', -Math.PI * 0.25], ['NO', -Math.PI * 0.75]];
    if (objBearing != null) items.push(['◆', objBearing, 'obj']);
    let html = '';
    for (const [label, ang, cls] of items) {
      let d = ang - yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      // Droite écran = -X monde, donc l'angle croissant va vers la gauche.
      const x = W / 2 - (d / (Math.PI / 2)) * (W / 2);
      if (x < -20 || x > W + 20) continue;
      html += `<i class="${cls || ''}" style="left:${x.toFixed(0)}px;opacity:${label.length > 1 && !cls ? 0.5 : 1}">${label}</i>`;
    }
    this.$.compass.innerHTML = html;
  }

  showHint(on) {
    this.$.hint.classList.toggle('off', !on);
  }

  setHint(html) {
    if (this.last.hint === html) return;
    this.last.hint = html;
    this.$.hint.innerHTML = html;
  }

  // Bandes noires de cinématique ; masque le reste du HUD.
  cinematic(on) {
    this.el.classList.toggle('cine', on);
  }

  phone(from, text, dur = 6) {
    const p = this.el.querySelector('.phone');
    p.querySelector('.ph-from').textContent = from;
    p.querySelector('.ph-text').textContent = text;
    p.classList.add('on');
    clearTimeout(this.phoneT);
    this.phoneT = setTimeout(() => p.classList.remove('on'), dur * 1000);
  }

  // Carton de chapitre (titre plein écran)
  chapter(c1, c2, c3 = '', dur = 4.5) {
    const c = this.el.querySelector('.chapter');
    c.querySelector('.c1').textContent = c1;
    c.querySelector('.c2').textContent = c2;
    c.querySelector('.c3').textContent = c3;
    c.classList.remove('on');
    void c.offsetWidth;
    c.classList.add('on');
    clearTimeout(this.chapT);
    this.chapT = setTimeout(() => c.classList.remove('on'), dur * 1000);
  }

  setName(name) {
    this.el.querySelector('.name').firstChild.textContent = name + ' ';
  }

  prompt(html) {
    if (this.last.prompt === html) return;
    this.last.prompt = html;
    this.$.prompt.innerHTML = html || '';
    this.$.prompt.classList.toggle('on', !!html);
  }

  toast(text, color) {
    const t = document.createElement('div');
    t.className = 'toast';
    if (color) t.style.setProperty('--c', color);
    t.textContent = text;
    this.$.toasts.appendChild(t);
    while (this.$.toasts.children.length > 5) this.$.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 3300);
  }

  // Les bannières s'enchaînent au lieu de se superposer.
  banner(t1, t2, t3 = '') {
    const now = performance.now();
    const at = Math.max(now, this.bannerFree || 0);
    this.bannerFree = at + 3000;
    setTimeout(() => this.#showBanner(t1, t2, t3), at - now);
  }

  #showBanner(t1, t2, t3) {
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML = `<div class="t1">${t1}</div><div class="t2">${t2}</div><div class="t3">${t3}</div>`;
    this.el.appendChild(b);
    setTimeout(() => b.remove(), 3700);
  }

  // Dialogues radio sous-titrés (file d'attente).
  say(speaker, text, dur = 4.5) {
    this.subQueue.push({ speaker, text, dur });
  }

  clearSay() {
    this.subQueue = [];
    this.subT = 0;
  }

  get talking() {
    return this.subT > 0 || this.subQueue.length > 0;
  }

  setSubtitlesEnabled(on) {
    this.subsOn = on;
  }

  #subtitles(dt) {
    this.subT -= dt || 0;
    if (this.subT > 0) return;
    const next = this.subQueue.shift();
    if (!next) {
      this.$.sub.classList.remove('on');
      return;
    }
    this.subT = next.dur;
    if (this.subsOn === false) return;
    const cls = /^noa/i.test(next.speaker) ? 'noa' : /^in/i.test(next.speaker) ? 'ines' : '';
    this.$.sub.innerHTML = `<b class="${cls}">${next.speaker} :</b> ${next.text}`;
    this.$.sub.classList.add('on');
  }

  damageNumber(x, y, value, heavy) {
    const d = document.createElement('div');
    d.className = 'dmg' + (heavy ? ' heavy' : '');
    d.style.left = `${x + (Math.random() - 0.5) * 30}px`;
    d.style.top = `${y}px`;
    d.textContent = value;
    this.$.nums.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }

  enemyBars(list) {
    const seen = new Set();
    for (const e of list) {
      seen.add(e.id);
      let el = this.barEls.get(e.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ebar';
        el.innerHTML = `<div class="nm"></div><div class="bar"><i></i></div><div class="bar poise"><i></i></div>`;
        this.$.bars.appendChild(el);
        this.barEls.set(e.id, el);
      }
      el.style.left = `${e.x}px`;
      el.style.top = `${e.y}px`;
      el.querySelector('.nm').textContent = e.name;
      el.querySelector('.bar > i').style.transform = `scaleX(${Math.max(0, e.hp)})`;
      const pz = el.querySelector('.poise');
      pz.style.display = e.poise == null ? 'none' : '';
      if (e.poise != null) pz.firstChild.style.transform = `scaleX(${e.poise})`;
      el.classList.toggle('alert', e.alert);
    }
    for (const [id, el] of this.barEls) {
      if (!seen.has(id)) {
        el.remove();
        this.barEls.delete(id);
      }
    }
  }

  reticle(x, y, on) {
    this.$.ret.classList.toggle('on', on);
    if (on) {
      this.$.ret.style.left = `${x}px`;
      this.$.ret.style.top = `${y}px`;
    }
  }

  marker(x, y, dist, on) {
    this.$.marker.classList.toggle('on', on);
    if (on) {
      this.$.marker.style.left = `${x}px`;
      this.$.marker.style.top = `${y}px`;
      this.$.markerTxt.textContent = `${Math.round(dist)} m`;
    }
  }

  hurt() {
    this.$.vig.style.boxShadow = 'inset 0 0 160px 60px rgba(200,0,20,.55)';
    clearTimeout(this.hurtTimer);
    this.hurtTimer = setTimeout(() => (this.$.vig.style.boxShadow = ''), 160);
  }

  setVisible(on) {
    this.el.style.display = on ? '' : 'none';
  }
}
