// player.js — Player ship: movement (kb+mouse), focus, shots, graze, bombs, invuln
import { TAU, PLAYFIELD_W, PLAYFIELD_H, clamp, lerp, dist2, rand } from './utils.js';

const HIT_R = 3.2;          // actual hitbox radius (very small, Touhou-style)
const GRAZE_R = 20;         // graze detection radius
const SPEED_NORMAL = 250;
const SPEED_FOCUS = 115;

export class Player {
  constructor(sprites) {
    this.sprites = sprites;
    this.reset();
  }

  reset() {
    this.x = PLAYFIELD_W / 2;
    this.y = PLAYFIELD_H - 110;
    this.vx = 0; this.vy = 0;
    this.lives = 3;
    this.bombs = 3;
    this.power = 1;          // 1..4 shot level
    this.maxPower = 4;
    this.invuln = 1.2;       // spawn protection
    this.dead = false;
    this.respawnTimer = 0;
    this.graze = 0;
    this._shotAcc = 0;
    this._shotRate = 0.07;
    this._bombCool = 0;
    this._bombActive = 0;    // bomb visual duration
    this._trailT = 0;
    this._visible = true;
    this._blink = 0;
  }

  get hitRadius() { return HIT_R; }

  // returns true if a bomb just triggered (game clears bullets)
  update(dt, g) {
    let bombed = false;
    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        if (this.lives < 0) { return false; }
        this.dead = false;
        this.x = PLAYFIELD_W / 2; this.y = PLAYFIELD_H - 110;
        this.invuln = 2.0; this._visible = true;
        this.power = Math.max(1, this.power - 1);
      }
      return false;
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this._bombCool = Math.max(0, this._bombCool - dt);
    this._bombActive = Math.max(0, this._bombActive - dt);
    this._blink += dt;

    // ---- movement ----
    const focus = g.input.focus;
    const speed = focus ? SPEED_FOCUS : SPEED_NORMAL;
    if (g.input.mouseMode) {
      // mouse: smooth follow
      const tx = g.input.mouse.x, ty = g.input.mouse.y;
      const k = 1 - Math.pow(0.0001, dt); // strong follow
      this.x = lerp(this.x, tx, k);
      this.y = lerp(this.y, ty, k);
    } else {
      let dx = (g.input.moveRight ? 1 : 0) - (g.input.moveLeft ? 1 : 0);
      let dy = (g.input.moveDown ? 1 : 0) - (g.input.moveUp ? 1 : 0);
      if (dx && dy) { const inv = 1 / Math.SQRT2; dx *= inv; dy *= inv; }
      this.x = clamp(this.x + dx * speed * dt, 8, PLAYFIELD_W - 8);
      this.y = clamp(this.y + dy * speed * dt, 8, PLAYFIELD_H - 8);
    }
    // Allow mouse to also nudge if moved recently even without mode? keep simple.

    // ---- shooting ----
    if (g.input.shoot) {
      this._shotAcc += dt;
      while (this._shotAcc >= this._shotRate) {
        this._shotAcc -= this._shotRate;
        this._fire(g);
      }
    } else {
      this._shotAcc = 0;
    }

    // ---- bomb ----
    if (g.input.bombPressed && this.bombs > 0 && this._bombCool <= 0 && !this.dead) {
      this.bombs--;
      this._bombCool = 0.6;
      this._bombActive = 1.1;
      this.invuln = Math.max(this.invuln, 1.6);
      bombed = true;
      g.audio.bomb();
      g.camera.addShake(16); g.camera.addFlash(0.9, '#9fe6ff');
      g.particles.burst(this.x, this.y, 80, { speed: 360, color: '#7be7ff', life: 0.9, size: 5, drag: 0.86 });
    }

    // ---- graze ----
    this._checkGraze(dt, g);

    // trail particles
    this._trailT += dt;
    if (this._trailT > 0.03) {
      this._trailT = 0;
      g.particles.burst(this.x, this.y + 10, 1, { speed: 20, color: '#7be7ff', life: 0.3, size: 2.5, dir: Math.PI / 2, spread: 0.4, drag: 0.8 });
    }
    return bombed;
  }

  _fire(g) {
    const pb = g.playerBullets;
    const x = this.x, y = this.y - 10;
    const spd = 720;
    const shoot = (ox, oy, vx, vy, r = 4, col = '#9fe6ff') => {
      pb.spawn({ x: x + ox, y: y + oy, vx, vy, r, color: col, type: 'orb', heading: Math.atan2(vy, vx) });
    };
    shoot(0, 0, 0, -spd, 5, '#ffffff');
    if (this.power >= 1) { shoot(-8, 4, -30, -spd, 4, '#7be7ff'); shoot(8, 4, 30, -spd, 4, '#7be7ff'); }
    if (this.power >= 2) { shoot(-14, 8, -80, -spd, 4, '#7be7ff'); shoot(14, 8, 80, -spd, 4, '#7be7ff'); }
    if (this.power >= 3) { shoot(-20, 12, -150, -spd * 0.95, 4, '#ffd76a'); shoot(20, 12, 150, -spd * 0.95, 4, '#ffd76a'); }
    if (this.power >= 4) { shoot(0, 6, 0, -spd * 1.15, 6, '#ffd76a'); }
    g.audio.shoot();
  }

  _checkGraze(dt, g) {
    const gr2 = GRAZE_R * GRAZE_R, hr2 = (HIT_R + 1) * (HIT_R + 1);
    g.enemyBullets.forEachAlive((b) => {
      if (b.grazed) return;
      const d2 = dist2(b.x, b.y, this.x, this.y);
      if (d2 < gr2 && d2 > hr2) {
        b.grazed = true;
        this.graze++;
        g.addGraze(1, this.x, this.y);
        g.audio.graze();
        g.particles.burst(this.x, this.y, 5, { speed: 90, color: '#ffffff', life: 0.3, size: 2.5, drag: 0.8 });
      }
    });
  }

  hit(g) {
    if (this.invuln > 0 || this.dead) return false;
    this.dead = true;
    this.lives--;
    this.respawnTimer = 1.4;
    this._visible = false;
    g.audio.playerHit();
    g.camera.addShake(20); g.camera.addFlash(0.7, '#ff5a6a'); g.camera.addHitstop(0.12);
    g.particles.burst(this.x, this.y, 60, { speed: 320, color: '#ff5a6a', life: 0.8, size: 5, drag: 0.85 });
    g.particles.burst(this.x, this.y, 30, { speed: 180, color: '#ffd76a', life: 0.6, size: 4, drag: 0.85 });
    // auto-bomb rescue: clear bullets around death so respawn is survivable
    g.enemyBullets.reset();
    return true;
  }

  addPower(n = 1) { this.power = clamp(this.power + n, 1, this.maxPower); }

  draw(ctx, g) {
    if (this.dead) return;
    if (this.invuln > 0 && Math.floor(this._blink * 20) % 2 === 0) {
      // blinking during invuln — still draw faintly
      ctx.globalAlpha = 0.45;
    }
    const t = g.time;
    ctx.save();
    ctx.translate(this.x, this.y);

    // bomb aura
    if (this._bombActive > 0) {
      const r = 40 + (1 - this._bombActive / 1.1) * 120;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, 'rgba(159,230,255,0.5)');
      grad.addColorStop(1, 'rgba(159,230,255,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // engine flame
    const flame = 6 + Math.sin(t * 40) * 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createLinearGradient(0, 8, 0, 8 + flame + 8);
    fg.addColorStop(0, 'rgba(123,231,255,0.9)');
    fg.addColorStop(1, 'rgba(123,231,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-5, 8); ctx.lineTo(5, 8); ctx.lineTo(0, 8 + flame + 8); ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ship body (procedural triangle w/ glow)
    ctx.shadowColor = '#7be7ff'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#eaf4ff';
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(10, 10); ctx.lineTo(4, 6); ctx.lineTo(-4, 6); ctx.lineTo(-10, 10); ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // core
    ctx.fillStyle = '#7be7ff';
    ctx.beginPath(); ctx.arc(0, -2, 3, 0, TAU); ctx.fill();
    // wing accents
    ctx.fillStyle = '#ff6ad5';
    ctx.fillRect(-10, 8, 4, 3); ctx.fillRect(6, 8, 4, 3);

    // hitbox marker (focus)
    if (g.input.focus) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,215,106,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
      const blink = 0.5 + 0.5 * Math.sin(t * 16);
      ctx.fillStyle = `rgba(255,215,106,${0.6 + 0.4 * blink})`;
      ctx.beginPath(); ctx.arc(0, 0, HIT_R, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * blink})`;
      ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, HIT_R + 2, 0, TAU); ctx.stroke();
      ctx.restore();
    } else {
      // faint hitbox always
      ctx.fillStyle = 'rgba(255,215,106,0.25)';
      ctx.beginPath(); ctx.arc(0, 0, HIT_R, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
