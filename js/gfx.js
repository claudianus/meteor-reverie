// gfx.js — renderer: cached glow sprites, starfield/nebula bg, particles, shake, text
import { TAU, PLAYFIELD_W, PLAYFIELD_H, clamp, lerp, rand, randInt, rgba } from './utils.js';

// ---- Pre-rendered sprite cache (additive-glow circles/diamonds) ----
export class SpriteCache {
  constructor() {
    this.cache = new Map();
  }
  _key(type, r, color) { return `${type}|${r}|${color}`; }

  get(type, r, color) {
    const k = this._key(type, r, color);
    let s = this.cache.get(k);
    if (!s) { s = this._make(type, r, color); this.cache.set(k, s); }
    return s;
  }

  _make(type, r, color) {
    const pad = Math.ceil(r * 2.4);
    const size = pad * 2;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    x.translate(pad, pad);
    if (type === 'circle') {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, r * 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(0, 0, r * 2, 0, TAU); x.fill();
      x.fillStyle = '#fff';
      x.beginPath(); x.arc(0, 0, r * 0.5, 0, TAU); x.fill();
    } else if (type === 'diamond') {
      x.save(); x.rotate(Math.PI / 4);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
      x.fillStyle = '#fff'; x.fillRect(-r * 0.5, -r * 0.5, r, r);
      x.restore();
    } else if (type === 'star') {
      this._star(x, r, color, 5);
    } else if (type === 'ring') {
      x.strokeStyle = color; x.lineWidth = Math.max(1, r * 0.18);
      x.shadowColor = color; x.shadowBlur = r;
      x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke();
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(255,255,255,0.85)';
      x.beginPath(); x.arc(0, 0, r * 0.32, 0, TAU); x.fill();
    } else if (type === 'orb') {
      const g = x.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
    }
    return c;
  }

  _star(x, r, color, points) {
    x.shadowColor = color; x.shadowBlur = r * 1.4;
    x.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = (i / (points * 2)) * TAU - Math.PI / 2;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, color); g.addColorStop(1, color);
    x.fillStyle = g; x.fill();
    x.shadowBlur = 0;
  }
}

// ---- Parallax starfield + nebula background ----
export class Background {
  constructor() {
    this.layers = [
      this._makeStars(70, 0.4, 1.0, 'rgba(180,200,255,'),
      this._makeStars(45, 1.0, 1.8, 'rgba(120,170,255,'),
      this._makeStars(22, 2.0, 2.6, 'rgba(255,220,180,'),
    ];
    this.nebula = this._makeNebula();
    this.t = 0;
  }
  _makeStars(n, speed, size, colorPrefix) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ x: rand(PLAYFIELD_W), y: rand(PLAYFIELD_H), s: rand(size * 0.5, size), v: speed, tw: rand(0, TAU), c: colorPrefix });
    return { stars: arr, speed };
  }
  _makeNebula() {
    const c = document.createElement('canvas');
    c.width = PLAYFIELD_W; c.height = PLAYFIELD_H;
    const x = c.getContext('2d');
    const blobs = [
      { hx: 0.3, hy: 0.25, r: 320, col: 'rgba(90,40,160,0.28)' },
      { hx: 0.8, hy: 0.55, r: 300, col: 'rgba(180,40,120,0.22)' },
      { hx: 0.5, hy: 0.85, r: 360, col: 'rgba(30,90,180,0.26)' },
    ];
    for (const b of blobs) {
      const g = x.createRadialGradient(b.hx * PLAYFIELD_W, b.hy * PLAYFIELD_H, 0, b.hx * PLAYFIELD_W, b.hy * PLAYFIELD_H, b.r);
      g.addColorStop(0, b.col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, PLAYFIELD_W, PLAYFIELD_H);
    }
    return c;
  }
  update(dt) {
    this.t += dt;
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        s.y += layer.speed * 60 * dt;
        s.tw += dt * 4;
        if (s.y > PLAYFIELD_H) { s.y = -2; s.x = rand(PLAYFIELD_W); }
      }
    }
  }
  draw(ctx) {
    ctx.drawImage(this.nebula, 0, 0);
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        const tw = 0.55 + 0.45 * Math.sin(s.tw);
        ctx.fillStyle = s.c + (0.5 * tw).toFixed(3) + ')';
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
    }
  }
}

// ---- Particle system ----
export class Particles {
  constructor() { this.list = []; }
  burst(x, y, n, opts = {}) {
    const { speed = 120, color = '#ffd76a', life = 0.5, size = 3, spread = TAU, dir = 0, gravity = 0, drag = 0.9 } = opts;
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-spread / 2, spread / 2);
      const sp = speed * rand(0.4, 1);
      this.list.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life, max: life, size: size * rand(0.6, 1.2), color, gravity, drag, rot: rand(0, TAU), vr: rand(-6, 6),
      });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  clear() { this.list.length = 0; }
}

// ---- Camera shake ----
export class Camera {
  constructor() { this.shake = 0; this.ox = 0; this.oy = 0; this.flash = 0; this.flashColor = '#fff'; this.hitstop = 0; }
  addShake(v) { this.shake = Math.min(22, this.shake + v); }
  addFlash(v, color = '#fff') { this.flash = Math.min(1, this.flash + v); this.flashColor = color; }
  addHitstop(t) { this.hitstop = Math.max(this.hitstop, t); }
  update(dt) {
    if (this.hitstop > 0) { this.hitstop -= dt; this.ox = this.oy = 0; return true; } // frozen
    this.shake *= Math.pow(0.0008, dt); // fast decay
    if (this.shake < 0.05) this.shake = 0;
    this.ox = rand(-this.shake, this.shake);
    this.oy = rand(-this.shake, this.shake);
    this.flash *= Math.pow(0.02, dt);
    if (this.flash < 0.01) this.flash = 0;
    return false;
  }
  apply(ctx) {
    ctx.save();
    ctx.translate(this.ox, this.oy);
  }
  drawFlash(ctx) {
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-40, -40, PLAYFIELD_W + 80, PLAYFIELD_H + 80);
      ctx.restore();
    }
  }
  restore(ctx) { ctx.restore(); }
}

// ---- Text helpers ----
export function drawText(ctx, text, x, y, opts = {}) {
  const { size = 14, font = 'Orbitron', weight = 700, align = 'left', baseline = 'alphabetic', color = '#fff', glow = null, alpha = 1, letterSpacing = 0 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px "${font}", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = baseline;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.9; }
  ctx.fillStyle = color;
  if (letterSpacing > 0) {
    let cx = x;
    if (align === 'center') cx = x - (text.length * letterSpacing) / 2;
    else if (align === 'right') cx = x - text.length * letterSpacing;
    for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + letterSpacing; }
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}
