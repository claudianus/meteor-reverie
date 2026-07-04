// input.js — unified keyboard + mouse input manager
import { clamp } from './utils.js';

const KEY_MOVE = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();          // currently held
    this._pressed = new Set();      // edge: pressed this frame
    this._released = new Set();     // edge: released this frame
    this.mouse = { x: 240, y: 600, down: false, right: false, moved: false };
    this.mouseMode = false;         // becomes true when the mouse actively drives the player
    this._mouseMoveAge = 999;
    this._listeners = [];
  }

  attach() {
    const kd = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (KEY_MOVE.has(e.code) || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.mouseMode = false; // keyboard takes over movement
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    const ku = (e) => {
      this.keys.delete(e.code);
      this._released.add(e.code);
    };
    const mm = (e) => this._onMouseMove(e);
    const md = (e) => {
      this._onMouseMove(e);
      if (e.button === 0) { this.mouse.down = true; this._pressed.add('Mouse0'); }
      if (e.button === 2) { this.mouse.right = true; this._pressed.add('Mouse2'); }
    };
    const mu = (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.right = false;
    };
    const ctx = (e) => e.preventDefault(); // suppress context menu on right click

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.canvas.addEventListener('mousemove', mm);
    this.canvas.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    this.canvas.addEventListener('contextmenu', ctx);

    this._listeners = [
      ['keydown', kd, window], ['keyup', ku, window],
      ['mousemove', mm, this.canvas], ['mousedown', md, this.canvas],
      ['mouseup', mu, window], ['contextmenu', ctx, this.canvas],
    ];
  }

  detach() {
    for (const [ev, fn, el] of this._listeners) el.removeEventListener(ev, fn);
    this._listeners = [];
  }

  // Convert client pixel coords -> canvas logical coords (0..PLAYFIELD).
  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / (rect.width || this.canvas.width);
    const sy = this.canvas.height / (rect.height || this.canvas.height);
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy;
    if (Math.hypot(x - this.mouse.x, y - this.mouse.y) > 0.6) {
      this.mouseMode = true;
      this._mouseMoveAge = 0;
    }
    this.mouse.x = clamp(x, 0, this.canvas.width);
    this.mouse.y = clamp(y, 0, this.canvas.height);
    this.mouse.moved = true;
  }

  // Called once per frame AFTER input is consumed.
  endFrame() {
    this._pressed.clear();
    this._released.clear();
    this.mouse.moved = false;
    this._mouseMoveAge++;
  }

  isDown(code) { return this.keys.has(code); }
  pressed(code) { return this._pressed.has(code); }
  released(code) { return this._released.has(code); }

  // ---- high level queries ----
  get moveLeft()  { return this.isDown('ArrowLeft')  || this.isDown('KeyA'); }
  get moveRight() { return this.isDown('ArrowRight') || this.isDown('KeyD'); }
  get moveUp()    { return this.isDown('ArrowUp')    || this.isDown('KeyW'); }
  get moveDown()  { return this.isDown('ArrowDown')  || this.isDown('KeyS'); }
  get focus()     { return this.isDown('ShiftLeft')  || this.isDown('ShiftRight'); }
  get shoot()     { return this.isDown('KeyZ') || this.isDown('Space') || this.mouse.down; }
  get bombHeld()  { return this.isDown('KeyX') || this.mouse.right; }
  get shootPressed()  { return this.pressed('KeyZ') || this.pressed('Space') || this.pressed('Mouse0'); }
  get bombPressed()   { return this.pressed('KeyX') || this.pressed('Mouse2'); }
  get pausePressed()  { return this.pressed('Escape') || this.pressed('KeyP'); }
  get mutePressed()   { return this.pressed('KeyM'); }
  get startPressed()  { return this.pressed('Enter') || this.pressed('Space') || this.pressed('Mouse0'); }
}
