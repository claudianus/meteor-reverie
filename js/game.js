// game.js — state machine, spawning, collision, HUD, game-feel orchestration
import { TAU, PLAYFIELD_W, PLAYFIELD_H, clamp, lerp, rand, choice, fmt, dist2, dist, easeOutBack, easeOutCubic } from './utils.js';
import { SpriteCache, Background, Particles, Camera, drawText } from './gfx.js';
import { BulletManager, Laser } from './bullets.js';
import { Player } from './player.js';
import { Boss } from './boss.js';

const BEST_KEY = 'meteor-reverie-best';

export class Game {
  constructor(canvas, input, audio, overlayEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.audio = audio;
    this.overlay = overlayEl;
    this.sprites = new SpriteCache();
    this.bg = new Background();
    this.particles = new Particles();
    this.camera = new Camera();
    this.enemyBullets = new BulletManager(this.sprites);
    this.playerBullets = new BulletManager(this.sprites);
    this.lasers = [];
    this.pickups = [];
    this.popups = [];
    this.player = new Player(this.sprites);
    this.boss = new Boss(this.sprites);
    this.state = 'title'; // title|playing|paused|over|win
    this.time = 0;
    this.score = 0;
    this.best = +(localStorage.getItem(BEST_KEY) || 0);
    this.combo = 0; this.comboTimer = 0;
    this._banner = null;   // {name, sub, t, dur}
    this._cardClearFlash = 0;
    this._onStateChange = null;
    this._showScreen('title');
  }

  onStateChange(fn) { this._onStateChange = fn; }

  _showScreen(name) {
    const screens = this.overlay.querySelectorAll('.screen');
    screens.forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
    if (this._onStateChange) this._onStateChange(name);
  }

  setState(s) {
    this.state = s;
    if (s === 'title') this._showScreen('title');
    else if (s === 'paused') this._showScreen('pause');
    else if (s === 'over') this._showScreen('over');
    else if (s === 'win') this._showScreen('win');
    else this._showScreen(''); // playing -> hide all
  }

  start() {
    this.audio.resume();
    this.audio.startMusic();
    this.score = 0; this.combo = 0; this.comboTimer = 0;
    this.time = 0;
    this.enemyBullets.reset();
    this.playerBullets.reset();
    this.lasers.length = 0;
    this.pickups.length = 0;
    this.popups.length = 0;
    this.particles.clear();
    this.camera = new Camera();
    this.player.reset();
    this.boss.reset();
    this._banner = { name: this.boss.cardName, sub: this.boss.cardSub, t: 0, dur: 2.6 };
    this.audio.spellcard();
    this.setState('playing');
  }

  // ---- pattern ctx ----
  _patternCtx() {
    const g = this;
    return {
      boss: g.boss, player: g.player, bullets: g.enemyBullets, lasers: g.lasers,
      particles: g.particles, audio: g.audio, camera: g.camera, time: g.time,
      spawnBullet: (o) => g.enemyBullets.spawn(o),
      spawnLaser: (o) => { const l = new Laser(); l.spawn(o); g.lasers.push(l); return l; },
    };
  }

  addScore(n, x, y, color = '#ffffff') {
    this.combo++; this.comboTimer = 2.0;
    const mult = 1 + Math.min(this.combo, 50) * 0.04;
    const val = Math.floor(n * mult);
    this.score += val;
    if (x !== undefined) this.popups.push({ x, y, text: '+' + fmt(val), life: 0.7, max: 0.7, color, vy: -60 });
  }

  addGraze(n, x, y) {
    this.player.graze += 0; // already incremented in player; keep counter source consistent
    this.addScore(50, x, y, '#ffd76a');
    this.popups.push({ x: x + 14, y: y - 6, text: 'GRAZE', life: 0.5, max: 0.5, color: '#ffd76a', vy: -50 });
  }

  dropItem(x, y, type) {
    this.pickups.push({ x, y, vx: rand(-30, 30), vy: -60, type, r: 8, t: 0, collected: false });
  }
  _dropCardClearItems(x, y) {
    // power + point items
    for (let i = 0; i < 3; i++) this.dropItem(x + rand(-30, 30), y + rand(-10, 10), 'power');
    for (let i = 0; i < 2; i++) this.dropItem(x + rand(-30, 30), y + rand(-10, 10), 'point');
  }

  // ============ UPDATE ============
  update(dt) {
    this.time += dt;
    this.bg.update(dt);
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
    this._cardClearFlash = Math.max(0, this._cardClearFlash - dt);

    if (this.input.mutePressed) this.audio.setMuted(!this.audio.muted);
    if (this.state === 'title') {
      if (this.input.startPressed) { this.audio.confirm(); this.start(); }
      return this.input.endFrame();
    }
    if (this.state === 'paused') {
      if (this.input.pausePressed) { this.audio.select(); this.setState('playing'); }
      else if (this.input.pressed('Enter')) { this.audio.confirm(); this.start(); }
      return this.input.endFrame();
    }
    if (this.state === 'over' || this.state === 'win') {
      if (this.input.startPressed) { this.audio.confirm(); this.start(); }
      return this.input.endFrame();
    }

    if (this.input.pausePressed) { this.audio.select(); this.setState('paused'); return this.input.endFrame(); }

    const frozen = this.camera.update(dt);
    const simDt = frozen ? 0 : dt;

    const bombed = this.player.update(simDt, this);
    if (bombed) { this.enemyBullets.reset(); this.lasers.length = 0; this.addScore(500, this.player.x, this.player.y, '#7be7ff'); }

    if (this.player.lives < 0 && this.player.dead && this.player.respawnTimer <= 0) {
      this._gameOver(); return this.input.endFrame();
    }

    const evt = this.boss.update(simDt, this._patternCtx());
    if (evt) {
      if (evt.type === 'break') {
        this.enemyBullets.reset(); this.lasers.length = 0;
        this.addScore(3000, this.boss.x, this.boss.y, '#ffd76a');
        this._dropCardClearItems(this.boss.x, this.boss.y);
        this.camera.addShake(10); this.camera.addFlash(0.5, '#ffd76a');
        this.audio.explosionBig();
      } else if (evt.type === 'cardStart') {
        this._banner = { name: this.boss.cardName, sub: this.boss.cardSub, t: 0, dur: 2.6 };
        this.audio.spellcard();
      } else if (evt.type === 'dead') { this._win(); return this.input.endFrame(); }
    }

    this.enemyBullets.update(simDt);
    this.playerBullets.update(simDt);
    this._updateLasers(simDt);
    this.particles.update(simDt);
    this._updatePickups(simDt);
    this._updatePopups(dt);

    if (this._banner) { this._banner.t += dt; if (this._banner.t >= this._banner.dur) this._banner = null; }

    this._collidePlayerShotsVsBoss();
    this._collideEnemyVsPlayer();
    this._collideLasersVsPlayer();

    this.input.endFrame();
  }

  _updateLasers(dt) {
    for (let i = this.lasers.length - 1; i >= 0; i--) { this.lasers[i].update(dt); if (!this.lasers[i].active) this.lasers.splice(i, 1); }
  }

  _updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      it.t += dt; it.vy += 80 * dt;
      const d = dist(it.x, it.y, p.x, p.y);
      if (d < 90 && !p.dead) {
        const a = Math.atan2(p.y - it.y, p.x - it.x), pull = lerp(420, 120, d / 90);
        it.vx += Math.cos(a) * pull * dt; it.vy += Math.sin(a) * pull * dt;
      }
      it.vx *= Math.pow(0.9, dt * 60);
      it.x += it.vx * dt; it.y += it.vy * dt;
      if (d < 14 && !p.dead) { this._collect(it); this.pickups.splice(i, 1); continue; }
      if (it.y > PLAYFIELD_H + 20) this.pickups.splice(i, 1);
    }
  }

  _collect(it) {
    if (it.type === 'power') { this.player.addPower(1); this.addScore(100, it.x, it.y, '#7be7ff'); this.audio.powerup(); }
    else if (it.type === 'point') { this.addScore(500, it.x, it.y, '#ffd76a'); this.audio.powerup(); }
    else if (it.type === 'life') { this.player.lives++; this.addScore(1000, it.x, it.y, '#ff6ad5'); this.audio.confirm(); }
    else if (it.type === 'bomb') { this.player.bombs++; this.addScore(1000, it.x, it.y, '#7be7ff'); this.audio.confirm(); }
    this.particles.burst(it.x, it.y, 10, { speed: 120, color: '#ffffff', life: 0.4, size: 3, drag: 0.85 });
  }

  _updatePopups(dt) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt; p.y += p.vy * dt; p.vy *= Math.pow(0.92, dt * 60);
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  _collidePlayerShotsVsBoss() {
    if (this.boss.state !== 'fighting') return;
    const b = this.boss, rsum = b.radius, pb = this.playerBullets;
    let dmg = 0;
    for (let i = pb.active.length - 1; i >= 0; i--) {
      const s = pb.active[i];
      const rr = rsum + s.r;
      if (dist2(s.x, s.y, b.x, b.y) < rr * rr) {
        dmg += 10; s.active = false;
        this.particles.burst(s.x, s.y, 3, { speed: 90, color: '#ffffff', life: 0.2, size: 2, drag: 0.8 });
      }
    }
    if (dmg > 0) b.takeDamage(dmg);
  }

  _collideEnemyVsPlayer() {
    const p = this.player;
    if (p.invuln > 0 || p.dead) return;
    const hr = p.hitRadius;
    for (const b of this.enemyBullets.active) {
      const rr = hr + b.r * 0.6;
      if (dist2(b.x, b.y, p.x, p.y) < rr * rr) { p.hit(this); return; }
    }
  }

  _collideLasersVsPlayer() {
    const p = this.player;
    if (p.invuln > 0 || p.dead) return;
    const hr = p.hitRadius + 2;
    for (const l of this.lasers) {
      if (l.hitWidth <= 0) continue;
      if (l.distTo(p.x, p.y) < l.hitWidth + hr) { p.hit(this); return; }
    }
  }

  _gameOver() {
    this.audio.stopMusic(); this.audio.gameOver(); this._saveBest();
    document.getElementById('over-score').textContent = fmt(this.score);
    document.getElementById('over-best').textContent = fmt(this.best);
    document.getElementById('over-graze').textContent = fmt(this.player.graze);
    this.setState('over');
  }

  _win() {
    this.audio.stopMusic(); this.audio.victory();
    this.score += this.player.lives * 2000 + this.player.bombs * 1000;
    this._saveBest();
    document.getElementById('win-score').textContent = fmt(this.score);
    document.getElementById('win-best').textContent = fmt(this.best);
    document.getElementById('win-graze').textContent = fmt(this.player.graze);
    this.setState('win');
  }

  _saveBest() {
    if (this.score > this.best) { this.best = this.score; localStorage.setItem(BEST_KEY, String(this.best)); }
  }

  // ============ DRAW ============
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, PLAYFIELD_W, PLAYFIELD_H);
    this.camera.apply(ctx);
    this.bg.draw(ctx);

    ctx.save();
    ctx.strokeStyle = 'rgba(123,231,255,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, PLAYFIELD_W - 1, PLAYFIELD_H - 1);
    ctx.restore();

    if (this.state !== 'title') {
      this.playerBullets.draw(ctx);
      this._drawPickups(ctx);
      this.boss.draw(ctx);
      for (const l of this.lasers) l.draw(ctx);
      this.enemyBullets.draw(ctx);
      this.player.draw(ctx, this);
      this.particles.draw(ctx);
      this._drawPopups(ctx);
    } else {
      this.particles.draw(ctx);
    }

    this.camera.drawFlash(ctx);
    this.camera.restore(ctx);

    if (this.state === 'playing' || this.state === 'paused') {
      this._drawHUD(ctx);
      this._drawBossBar(ctx);
      this._drawBanner(ctx);
    }
    if (this.state === 'paused') this._drawPauseVeil(ctx);
  }

  _drawPickups(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const it of this.pickups) {
      let col = '#7be7ff', label = 'P';
      if (it.type === 'point') { col = '#ffd76a'; label = '★'; }
      else if (it.type === 'life') { col = '#ff6ad5'; label = '♥'; }
      else if (it.type === 'bomb') { col = '#7be7ff'; label = 'B'; }
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.t * 3);
      const sprite = this.sprites.get('star', 9, col);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
      ctx.save(); ctx.translate(it.x, it.y);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 1); ctx.restore();
    }
    ctx.restore();
  }

  _drawPopups(ctx) {
    for (const p of this.popups) {
      const a = clamp(p.life / p.max, 0, 1);
      drawText(ctx, p.text, p.x, p.y, { size: 13, weight: 700, align: 'center', color: p.color, glow: p.color, alpha: a });
    }
  }

  _drawHUD(ctx) {
    const p = this.player;
    drawText(ctx, 'SCORE', 12, 18, { size: 10, weight: 600, color: '#9aa3c7', letterSpacing: 2 });
    drawText(ctx, fmt(this.score), 12, 38, { size: 22, weight: 900, color: '#fff', glow: 'rgba(123,231,255,0.5)' });
    drawText(ctx, 'BEST ' + fmt(this.best), 12, 56, { size: 10, weight: 600, color: '#ffd76a' });

    drawText(ctx, 'GRAZE', PLAYFIELD_W - 12, 18, { size: 10, weight: 600, align: 'right', color: '#9aa3c7', letterSpacing: 2 });
    drawText(ctx, fmt(p.graze), PLAYFIELD_W - 12, 38, { size: 22, weight: 900, align: 'right', color: '#ffd76a', glow: 'rgba(255,215,106,0.5)' });
    if (this.combo > 1) {
      const a = clamp(this.comboTimer / 2, 0, 1);
      drawText(ctx, 'x' + this.combo, PLAYFIELD_W - 12, 56, { size: 12, weight: 700, align: 'right', color: '#ff6ad5', alpha: a });
    }

    for (let i = 0; i < Math.max(0, p.lives); i++) {
      ctx.save(); ctx.translate(16 + i * 16, PLAYFIELD_H - 18);
      ctx.fillStyle = '#ff6ad5'; ctx.shadowColor = '#ff6ad5'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    drawText(ctx, 'x' + Math.max(0, p.lives), 16 + Math.max(0, p.lives) * 16 + 4, PLAYFIELD_H - 14, { size: 12, weight: 700, color: '#ff6ad5' });
    for (let i = 0; i < p.bombs; i++) {
      ctx.save(); ctx.translate(90 + i * 16, PLAYFIELD_H - 18);
      ctx.fillStyle = '#7be7ff'; ctx.shadowColor = '#7be7ff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); ctx.restore();
    }

    drawText(ctx, 'POWER', PLAYFIELD_W - 12, PLAYFIELD_H - 22, { size: 9, weight: 600, align: 'right', color: '#9aa3c7', letterSpacing: 1 });
    drawText(ctx, p.power + '/' + p.maxPower, PLAYFIELD_W - 12, PLAYFIELD_H - 8, { size: 14, weight: 800, align: 'right', color: '#7be7ff' });
  }

  _drawBossBar(ctx) {
    if (this.boss.state === 'dead' || this.boss.state === 'dying') return;
    const y = 70, x = 30, w = PLAYFIELD_W - 60, h = 6;
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,30,0.6)'; ctx.fillRect(x, y, w, h);
    const prog = this.boss.cardProgress;
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#ff6ad5'); grad.addColorStop(1, '#b98cff');
    ctx.fillStyle = grad; ctx.fillRect(x, y, w * (1 - prog), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    for (let i = 0; i < this.boss.lineup.length; i++) {
      const px = x + (i / this.boss.lineup.length) * w;
      ctx.fillStyle = i < this.boss.cardIdx ? '#ffd76a' : 'rgba(255,255,255,0.15)';
      ctx.fillRect(px - 0.5, y - 2, 1.5, h + 4);
    }
    ctx.restore();
  }

  _drawBanner(ctx) {
    if (!this._banner) return;
    const b = this._banner, t = b.t / b.dur;
    let a = 1, ox = 0;
    if (t < 0.18) { const k = t / 0.18; a = easeOutCubic(k); ox = (1 - easeOutBack(k)) * -60; }
    else if (t > 0.82) { const k = (t - 0.82) / 0.18; a = 1 - k; ox = k * 60; }
    const cy = 130;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,6,24,0.55)'; ctx.fillRect(0, cy - 26, PLAYFIELD_W, 52);
    ctx.fillStyle = 'rgba(255,106,213,0.9)';
    ctx.fillRect(0, cy - 26, PLAYFIELD_W, 2); ctx.fillRect(0, cy + 24, PLAYFIELD_W, 2);
    drawText(ctx, b.name, PLAYFIELD_W / 2 + ox, cy - 4, { size: 22, weight: 900, align: 'center', color: '#fff', glow: 'rgba(255,106,213,0.8)', letterSpacing: 3 });
    drawText(ctx, b.sub, PLAYFIELD_W / 2 + ox, cy + 16, { size: 12, weight: 600, align: 'center', color: '#ffd76a', letterSpacing: 4 });
    ctx.restore();
  }

  _drawPauseVeil(ctx) {
    ctx.save(); ctx.fillStyle = 'rgba(4,3,12,0.45)';
    ctx.fillRect(0, 0, PLAYFIELD_W, PLAYFIELD_H); ctx.restore();
  }
}

