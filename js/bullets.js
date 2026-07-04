// bullets.js — Bullet, pooled BulletManager, Laser
import { TAU, PLAYFIELD_W, PLAYFIELD_H, clamp, rand } from './utils.js';

const MARGIN = 40;

export class Bullet {
  constructor() { this.active = false; this.grazed = false; }
  spawn(o) {
    this.active = true;
    this.grazed = false;
    this.x = o.x; this.y = o.y;
    this.vx = o.vx ?? 0; this.vy = o.vy ?? 0;
    this.r = o.r ?? 5;
    this.color = o.color ?? '#ff6ad5';
    this.type = o.type ?? 'circle'; // circle|diamond|star|ring|orb
    this.rot = o.rot ?? 0;
    this.spin = o.spin ?? 0;
    this.accel = o.accel ?? 0;        // speed accel along heading
    this.heading = o.heading ?? Math.atan2(this.vy, this.vx);
    this.life = o.life ?? Infinity;
    this.maxLife = this.life;
    this.fade = o.fade ?? false;
    this.scaleIn = o.scaleIn ?? 0;     // seconds to grow to full size
    this._age = 0;
    this._curScale = this.scaleIn > 0 ? 0 : 1;
    this.glow = o.glow ?? true;
  }
  update(dt) {
    this._age += dt;
    if (this._age > this.life) { this.active = false; return; }
    if (this.scaleIn > 0) this._curScale = clamp(this._age / this.scaleIn, 0, 1);
    if (this.accel !== 0) {
      const sp = Math.hypot(this.vx, this.vy) + this.accel * dt;
      this.vx = Math.cos(this.heading) * sp;
      this.vy = Math.sin(this.heading) * sp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    if (this.x < -MARGIN || this.x > PLAYFIELD_W + MARGIN || this.y < -MARGIN || this.y > PLAYFIELD_H + MARGIN) {
      this.active = false;
    }
  }
}

// Object-pooled manager
export class BulletManager {
  constructor(sprites) {
    this.sprites = sprites;
    this.pool = [];
    this.active = [];
    this._cap = 0;
  }
  reset() {
    for (const b of this.active) { b.active = false; this.pool.push(b); }
    this.active.length = 0;
  }
  get count() { return this.active.length; }
  spawn(o) {
    let b = this.pool.pop();
    if (!b) b = new Bullet();
    b.spawn(o);
    this.active.push(b);
    return b;
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.update(dt);
      if (!b.active) {
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
        this.pool.push(b);
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.active) {
      const s = b._curScale;
      if (s <= 0) continue;
      const sprite = this.sprites.get(b.type, b.r, b.color);
      const sw = sprite.width * s;
      let alpha = 1;
      if (b.fade) alpha = clamp(1 - b._age / b.life, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.rot) ctx.rotate(b.rot);
      ctx.drawImage(sprite, -sw / 2, -sw / 2, sw, sw);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  forEachAlive(fn) { for (const b of this.active) fn(b); }
}

// Laser: warning -> active beam with finite width
export class Laser {
  constructor() { this.active = false; }
  spawn(o) {
    this.active = true;
    this.x = o.x; this.y = o.y;
    this.angle = o.angle ?? 0;
    this.length = o.length ?? 1400;
    this.warnTime = o.warnTime ?? 0.9;
    this.activeTime = o.activeTime ?? 1.6;
    this.width = o.width ?? 14;
    this.color = o.color ?? '#7be7ff';
    this._t = 0;
    this._phase = 'warn'; // warn|active|done
    this.rotSpeed = o.rotSpeed ?? 0;
  }
  get hitWidth() { return this._phase === 'active' ? this.width * 0.5 : 0; }
  update(dt) {
    this._t += dt;
    this.angle += this.rotSpeed * dt;
    if (this._phase === 'warn' && this._t >= this.warnTime) { this._phase = 'active'; this._t = 0; }
    else if (this._phase === 'active' && this._t >= this.activeTime) { this._phase = 'done'; this.active = false; }
  }
  // signed distance from point to beam centerline
  distTo(px, py) {
    const dx = px - this.x, dy = py - this.y;
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    const along = dx * ca + dy * sa;
    const perp = -dx * sa + dy * ca;
    if (along < 0 || along > this.length) return Infinity;
    return Math.abs(perp);
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.globalCompositeOperation = 'lighter';
    if (this._phase === 'warn') {
      const p = this._t / this.warnTime;
      const w = this.width * 0.25;
      ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(this._t * 30));
      const g = ctx.createLinearGradient(0, -w, 0, w);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, this.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, -w, this.length, w * 2);
    } else {
      const p = clamp(this._t / 0.12, 0, 1); // grow in
      const fade = clamp(1 - (this._t - (this.activeTime - 0.3)) / 0.3, 0, 1);
      const w = this.width * 0.5 * p * fade;
      const g = ctx.createLinearGradient(0, -w, 0, w);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, this.color); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.65, this.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, -w, this.length, w * 2);
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(0, -w * 0.3, this.length, w * 0.6);
    }
    ctx.restore();
  }
}
