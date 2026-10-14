// Commandes tactiles (téléphone / tablette, paysage) :
// joystick dynamique à gauche, glisser à droite pour la caméra, boutons d'action.
// Les boutons écrivent directement dans la couche d'actions d'Input.

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);

const BUTTONS = [
  // id, action, libellé, classe de position, maintien ?, condition d'affichage
  ['light', 'light', '👊', 'b-light', false, 'rings'],
  ['heavy', 'heavy', '〰', 'b-heavy', false, 'rings'],
  ['power', 'power', '✦', 'b-power', false, 'rings'],
  ['shield', 'shield', '◎', 'b-shield', true, 'rings'],
  ['jump', 'jump', '⤒', 'b-jump', true, null],
  ['dodge', 'dodge', '⤓', 'b-dodge', true, null],
  ['fly', 'fly', '🜁', 'b-fly', false, 'flight'],
  ['interact', 'interact', 'E', 'b-interact', false, null],
  ['magnet', 'magnet', '🧲', 'b-magnet', false, 'magnet'],
  ['transform', 'transform', '◉', 'b-umbra', false, 'umbra'],
  ['creaPower', 'creaPower', '✪', 'b-crea', false, 'crea'],
];
const TOP = [
  ['pause', 'pause', '☰'],
  ['inventory', 'inventory', '🎒'],
  ['journal', 'journal', '📖'],
  ['skills', 'skills', '★'],
  ['lock', 'lock', '◇'],
  ['heal', 'heal', '✚'],
  ['relations', 'relations', '❤'],
  ['crea', 'crea', '🛠'],
  ['creaNext', 'creaNext', '⟳'],
];

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.el = document.createElement('div');
    this.el.className = 'touch-ui';
    this.el.innerHTML = `
      <div class="t-look"></div>
      <div class="t-stick"><div class="t-base"><div class="t-knob"></div></div></div>
      ${BUTTONS.map(([id, , label, cls]) => `<button class="t-btn ${cls}" data-id="${id}">${label}</button>`).join('')}
      <div class="t-top">${TOP.map(([id, , label]) => `<button class="t-small" data-id="${id}">${label}</button>`).join('')}</div>
      <div class="t-rotate">Tourne ton téléphone en mode paysage ↻</div>`;
    document.body.appendChild(this.el);
    document.body.classList.add('touch');
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, lx: 0, ly: 0 };
    this.base = this.el.querySelector('.t-base');
    this.knob = this.el.querySelector('.t-knob');
    this.#bindStickAndLook();
    this.#bindButtons();
    input.touch = this;
  }

  #bindStickAndLook() {
    const zone = this.el.querySelector('.t-look');
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // Moitié gauche : joystick ; moitié droite : caméra.
      if (e.clientX < innerWidth * 0.42 && this.stick.id === null) {
        this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
        this.base.style.left = `${e.clientX}px`;
        this.base.style.top = `${e.clientY}px`;
        this.base.classList.add('on');
      } else if (this.look.id === null) {
        this.look = { id: e.pointerId, lx: e.clientX, ly: e.clientY };
      }
      try { zone.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stick.id) {
        const R = 60;
        let dx = e.clientX - this.stick.ox;
        let dy = e.clientY - this.stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        this.stick.x = dx / R;
        this.stick.y = -dy / R;
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        // Joystick poussé à fond = courir.
        if (d > R * 1.05) this.input.down.add('sprint');
        else this.input.down.delete('sprint');
      } else if (e.pointerId === this.look.id) {
        this.input.mouse.dx += (e.clientX - this.look.lx) * 1.6;
        this.input.mouse.dy += (e.clientY - this.look.ly) * 1.6;
        this.look.lx = e.clientX;
        this.look.ly = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === this.stick.id) {
        this.stick = { id: null, x: 0, y: 0 };
        this.knob.style.transform = '';
        this.base.classList.remove('on');
        this.input.down.delete('sprint');
      }
      if (e.pointerId === this.look.id) this.look = { id: null };
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  #bindButtons() {
    const all = [...BUTTONS.map((b) => [b[0], b[1], b[4]]), ...TOP.map((b) => [b[0], b[1], false])];
    for (const [id, action, holdable] of all) {
      const btn = this.el.querySelector(`[data-id="${id}"]`);
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { btn.setPointerCapture(e.pointerId); } catch { /* idem */ }
        btn.classList.add('down');
        if (!this.input.down.has(action)) this.input.pressed.add(action);
        if (holdable) this.input.down.add(action);
        navigator.vibrate?.(8);
      });
      const up = () => {
        btn.classList.remove('down');
        if (holdable) this.input.down.delete(action);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  // Vecteur du joystick (x = droite, y = avant).
  move() {
    return { x: this.stick.x || 0, y: this.stick.y || 0 };
  }

  // Affiche les boutons selon les pouvoirs et le contexte ; masque tout en menu.
  update(state) {
    this.el.classList.toggle('hidden-ui', !!(state.menu || state.cinematic));
    this.el.classList.toggle('cine', !!state.cinematic);
    this.el.classList.toggle('choosing', !!state.choosing);
    for (const [id, , , , , cond] of BUTTONS) {
      const show = !cond || (cond === 'rings' && state.rings) || (cond === 'flight' && state.flight) || (cond === 'magnet' && state.magnet) || (cond === 'umbra' && state.umbra) || (cond === 'crea' && state.crea);
      this.el.querySelector(`[data-id="${id}"]`).style.display = show ? '' : 'none';
    }
    for (const id of ['crea', 'creaNext']) this.el.querySelector(`[data-id="${id}"]`).style.display = state.crea ? '' : 'none';
    // En vol : « saut » = monter, « roulade » = descendre.
    this.el.querySelector('.b-jump').textContent = state.flying ? '▲' : '⤒';
    this.el.querySelector('.b-dodge').textContent = state.flying ? '▼' : '⤓';
    this.el.querySelector('.b-interact').classList.toggle('pulse', !!state.canInteract);
    this.el.querySelector('.b-fly').classList.toggle('active', !!state.flying);
    this.el.querySelector('.b-magnet').classList.toggle('active', !!state.holding);
    this.el.querySelector('.b-umbra').classList.toggle('ready', !!state.canTransform);
  }
}
