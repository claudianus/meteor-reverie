// boss.js — Boss entity cycling through spell cards with intro/death sequences
import { TAU, PLAYFIELD_W, clamp, lerp, rand, choice, easeOutCubic, easeInOutSine } from './utils.js';
import { buildLineup } from './patterns.js';

const BOSS_R = 26; // body radius for collision with player shots

export class Boss {
  constructor(sprites) {
    this.sprites = sprites;
    this.lineup = buildLineup();
    this.reset();
  }

  reset() {
    this.x = PLAYFIELD_W / 2;
    this.y = -60;
    this.state = 'intro'; // intro|fighting|break|dying|dead
    this.cardIdx = 0;
    this.cardTime = 0;
    this.cardHP = 0;
    this.cardMaxHP = 0;
    this.breakTime = 0;
    this.deathTime = 0;
    this.t = 0;
    this._wx = PLAYFIELD_W / 2; this._wy = 120; // waypoint
    this._moveT = 0; this._moveDur = 2;
    this._fromX = this.x; this._fromY = this.y;
    this.alive = true;
    this.hurt = 0; // flash timer
    this.current = null;
    this._breakAnnounced = false;
    this._startNextCard();
    this.state = 'intro'; // override 'fighting' from _startNextCard; descend from top first
    // intro target
    this._wx = PLAYFIELD_W / 2; this._wy = 120;
    this._fromX = this.x; this._fromY = this.y; this._moveT = 0; this._moveDur = 2.2;
  }

  get radius() { return BOSS_R; }

  _startNextCard() {
    this._breakAnnounced = false;
    if (this.cardIdx >= this.lineup.length) {
      this.state = 'dying'; this.deathTime = 0; return;
    }
    this.current = this.lineup[this.cardIdx];
    this.cardTime = 0;
    this.cardMaxHP = this.cardHP = 900 + this.cardIdx * 260;
    this.state = 'fighting';
  }

  takeDamage(dmg) {
    if (this.state !== 'fighting') return false;
    this.cardHP -= dmg;
    this.hurt = 0.08;
    if (this.cardHP <= 0) {
      this.cardHP = 0;
      // card cleared -> break then next
      this.state = 'break';
      this.breakTime = 1.6;
      return true;
    }
    return false;
  }

  // ctx provides: spawnBullet, spawnLaser, bullets, lasers, player, particles, audio, camera, time, addScore, dropItem
  update(dt, ctx) {
    this.t += dt;
    this.hurt = Math.max(0, this.hurt - dt);

    // movement easing to waypoint
    this._moveT += dt;
    const mp = clamp(this._moveT / this._moveDur, 0, 1);
    const e = easeInOutSine(mp);
    this.x = lerp(this._fromX, this._wx, e);
    this.y = lerp(this._fromY, this._wy, e);
    if (mp >= 1 && this.state === 'fighting') {
      // pick a new waypoint occasionally
      if (Math.random() < dt * 0.5) this._newWaypoint();
    }

    if (this.state === 'intro') {
      if (mp >= 1) { this.state = 'fighting'; this._newWaypoint(); }
      return null;
    }

    if (this.state === 'fighting') {
      this.cardTime += dt;
      this.current.update(ctx, this.cardTime, dt);
      if (this.cardTime >= this.current.duration) {
        // timed out -> break, treat as cleared (no bonus)
        this.state = 'break'; this.breakTime = 1.2;
      }
      return null;
    }

    if (this.state === 'break') {
      let evt = null;
      if (!this._breakAnnounced) { this._breakAnnounced = true; evt = { type: 'break' }; }
      this.breakTime -= dt;
      if (this.breakTime <= 0) {
        this.cardIdx++; this._startNextCard();
        if (this.state === 'fighting') return { type: 'cardStart' };
      }
      return evt;
    }

    if (this.state === 'dying') {
      this.deathTime += dt;
      if (Math.random() < dt * 14) {
        const ex = this.x + rand(-30, 30), ey = this.y + rand(-26, 26);
        ctx.particles.burst(ex, ey, 12, { speed: 220, color: choice(['#ffd76a', '#ff6ad5', '#7be7ff']), life: 0.6, size: 4, drag: 0.85 });
        ctx.audio.explosionSmall();
        ctx.camera.addShake(4);
      }
      if (this.deathTime > 2.4) {
        ctx.audio.explosionBig();
        ctx.camera.addShake(22); ctx.camera.addFlash(1, '#ffffff');
        ctx.particles.burst(this.x, this.y, 120, { speed: 420, color: '#ffd76a', life: 1.1, size: 6, drag: 0.88 });
        ctx.particles.burst(this.x, this.y, 80, { speed: 300, color: '#ff6ad5', life: 0.9, size: 5, drag: 0.88 });
        this.state = 'dead'; this.alive = false;
        return { type: 'dead' };
      }
      return null;
    }
    return null;
  }

  _newWaypoint() {
    this._fromX = this.x; this._fromY = this.y;
    this._wx = PLAYFIELD_W / 2 + rand(-130, 130);
    this._wy = rand(90, 170);
    this._moveT = 0; this._moveDur = rand(1.4, 2.6);
  }

  get cardName() { return this.current ? this.current.name : ''; }
  get cardSub() { return this.current ? this.current.sub : ''; }
  get cardProgress() { return this.cardMaxHP > 0 ? 1 - this.cardHP / this.cardMaxHP : 0; }
  get totalProgress() { return this.lineup.length ? this.cardIdx / this.lineup.length : 1; }

  draw(ctx) {
    if (this.state === 'dead') return;
    const t = this.t;
    ctx.save();
    ctx.translate(this.x, this.y);

    // intro: fade/scale in
    let alpha = 1, scale = 1;
    if (this.state === 'intro') {
      const p = clamp(this._moveT / this._moveDur, 0, 1);
      alpha = easeOutCubic(p); scale = 0.5 + 0.5 * easeOutCubic(p);
    }
    if (this.state === 'dying') {
      alpha = 0.6 + 0.4 * Math.abs(Math.sin(t * 30));
      scale = 1 + Math.sin(t * 20) * 0.04;
    }
    ctx.globalAlpha = alpha;
    ctx.scale(scale, scale);

    // outer rotating energy ring
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.rotate(t * 0.6);
    const ringR = BOSS_R + 14;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = Math.cos(a) * ringR, py = Math.sin(a) * ringR;
      ctx.fillStyle = 'rgba(255,106,213,0.7)';
      ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,106,213,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, ringR, 0, TAU); ctx.stroke();
    ctx.restore();

    // counter-rotating inner ring
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.rotate(-t * 1.1);
    ctx.strokeStyle = 'rgba(123,231,255,0.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, BOSS_R + 6, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      ctx.fillStyle = 'rgba(123,231,255,0.8)';
      ctx.beginPath(); ctx.arc(Math.cos(a) * (BOSS_R + 6), Math.sin(a) * (BOSS_R + 6), 3, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // body — hexagon core with glow
    const hurtFlash = this.hurt > 0;
    ctx.shadowColor = hurtFlash ? '#ffffff' : '#b98cff';
    ctx.shadowBlur = 24;
    const bodyCol = hurtFlash ? '#ffffff' : '#2a1850';
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const px = Math.cos(a) * BOSS_R, py = Math.sin(a) * BOSS_R;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hurtFlash ? '#ffffff' : '#b98cff';
    ctx.lineWidth = 2; ctx.stroke();

    // pulsing core
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    cg.addColorStop(0, `rgba(255,255,255,${0.8 * pulse})`);
    cg.addColorStop(0.5, `rgba(185,140,255,${0.6 * pulse})`);
    cg.addColorStop(1, 'rgba(185,140,255,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
    ctx.restore();

    // eyes
    ctx.fillStyle = '#ff6ad5';
    ctx.beginPath(); ctx.arc(-7, -4, 2.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -4, 2.4, 0, TAU); ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
