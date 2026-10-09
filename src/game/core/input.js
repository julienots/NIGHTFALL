// Couche d'actions : clavier/souris (pointer lock) et manette standard.
const KEYMAP = {
  // Codes physiques : ZQSD en AZERTY = WASD en QWERTY.
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
  ControlLeft: 'dodge', KeyC: 'dodge',
  KeyF: 'power',
  KeyR: 'lock',
  KeyE: 'interact',
  KeyI: 'inventory', Tab: 'inventory',
  KeyJ: 'journal',
  Escape: 'pause', KeyP: 'pause',
  KeyH: 'heal',
  KeyN: 'markers',
  KeyV: 'fly',
  KeyG: 'shield',
};

// Boutons manette (mapping « standard »).
const PADMAP = {
  0: 'jump', 1: 'dodge', 2: 'light', 3: 'heavy', 4: 'lock', 5: 'power',
  10: 'sprint', 9: 'pause', 8: 'inventory', 12: 'interact', 13: 'heal', 11: 'fly', 14: 'shield', 6: 'shield',
};

export class Input {
  constructor(element) {
    this.el = element;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0 };
    this.locked = false;
    this.enabled = true;
    this.padPrev = [];
    this.gamepad = { lx: 0, ly: 0, rx: 0, ry: 0 };
    this.usingPad = false;

    const press = (a) => {
      if (!this.down.has(a)) this.pressed.add(a);
      this.down.add(a);
    };

    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      this.usingPad = false;
      press(a);
    });
    addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.down.delete(a);
    });
    element.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.requestLock();
        return;
      }
      press(e.button === 0 ? 'light' : e.button === 2 ? 'heavy' : 'lock');
    });
    addEventListener('mouseup', (e) => {
      this.down.delete(e.button === 0 ? 'light' : e.button === 2 ? 'heavy' : 'lock');
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === element;
      this.onLockChange?.(this.locked);
    });
    addEventListener('blur', () => this.down.clear());
  }

  requestLock() {
    if (!this.locked) this.el.requestPointerLock?.()?.catch?.(() => {});
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pollGamepad() {
    const pad = navigator.getGamepads?.().find((p) => p && p.mapping === 'standard');
    if (!pad) {
      this.gamepad = { lx: 0, ly: 0, rx: 0, ry: 0 };
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.gamepad = { lx: dz(pad.axes[0]), ly: dz(pad.axes[1]), rx: dz(pad.axes[2]), ry: dz(pad.axes[3]) };
    pad.buttons.forEach((b, i) => {
      const a = PADMAP[i];
      if (!a) return;
      if (b.pressed && !this.padPrev[i]) {
        this.pressed.add(a);
        this.usingPad = true;
      }
      if (b.pressed) this.down.add(a);
      else if (this.padPrev[i]) this.down.delete(a);
      this.padPrev[i] = b.pressed;
    });
    if (this.gamepad.lx || this.gamepad.ly || this.gamepad.rx || this.gamepad.ry) this.usingPad = true;
  }

  // Vecteur de déplacement local (x = droite, y = avant), longueur <= 1.
  move() {
    let x = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    let y = (this.down.has('up') ? 1 : 0) - (this.down.has('down') ? 1 : 0);
    x += this.gamepad.lx;
    y -= this.gamepad.ly;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  consumeLook(dt) {
    const out = { x: this.mouse.dx + this.gamepad.rx * 900 * dt, y: this.mouse.dy + this.gamepad.ry * 600 * dt };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return out;
  }

  was(action) {
    return this.enabled && this.pressed.has(action);
  }

  is(action) {
    return this.enabled && this.down.has(action);
  }

  endFrame() {
    this.pressed.clear();
  }
}
