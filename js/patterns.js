// patterns.js — named spell-card bullet patterns (factories returning a runner)
import { TAU, angleTo, rand, choice } from './utils.js';

// Each pattern: { name, sub, duration, update(ctx, t, dt) }
// ctx = { boss, bullets, lasers, player, spawnBullet, spawnLaser, particles, audio }

const COLORS = {
  pink: '#ff6ad5', cyan: '#7be7ff', gold: '#ffd76a',
  violet: '#b98cff', red: '#ff5a6a', green: '#7dffa8', white: '#ffffff',
};

const aimed = (b, p) => (p ? angleTo(b.x, b.y, p.x, p.y) : Math.PI / 2);

// ---------- 1. Spiral Storm ----------
export function spiralStorm(scale = 1) {
  let arm = 0;
  const arms = 4;
  return {
    name: 'SPIRAL STORM', sub: '나선의 폭풍', duration: 16, rate: 0.045 / scale, _acc: 0,
    update(ctx, t, dt) {
      this._acc += dt;
      const spd = 150 + 60 * scale;
      while (this._acc >= this.rate) {
        this._acc -= this.rate;
        const base = arm * (TAU / arms) + t * 1.6;
        for (let k = 0; k < arms; k++) {
          const a = base + (k * TAU) / arms;
          ctx.spawnBullet({ x: ctx.boss.x, y: ctx.boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, color: choice([COLORS.pink, COLORS.cyan, COLORS.violet]), type: 'circle', heading: a });
        }
        arm++;
      }
    },
  };
}

// ---------- 2. Ring Cascade ----------
export function ringCascade(scale = 1) {
  let n = 18;
  return {
    name: 'RING CASCADE', sub: '연쇄 환영륜', duration: 14, _acc: 0, rate: 0.7 / scale,
    update(ctx, t, dt) {
      this._acc += dt;
      while (this._acc >= this.rate) {
        this._acc -= this.rate;
        const cnt = n, spd = 120 + 50 * scale, jitter = rand(0, TAU), col = choice([COLORS.gold, COLORS.cyan, COLORS.pink]);
        for (let i = 0; i < cnt; i++) {
          const a = jitter + (i / cnt) * TAU;
          ctx.spawnBullet({ x: ctx.boss.x, y: ctx.boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 7, color: col, type: 'ring', heading: a, scaleIn: 0.12 });
        }
        n = 16 + ((Math.floor(t * 2) % 4) * 6);
      }
    },
  };
}

// ---------- 3. Aimed Scatter ----------
export function aimedScatter(scale = 1) {
  return {
    name: 'AIMED SCATTER', sub: '유도 산탄', duration: 12, _acc: 0, rate: 0.22 / scale,
    update(ctx, t, dt) {
      this._acc += dt;
      while (this._acc >= this.rate) {
        this._acc -= this.rate;
        const base = aimed(ctx.boss, ctx.player);
        const ways = 3 + Math.floor(scale * 2), spread = 0.5;
        for (let i = 0; i < ways; i++) {
          const a = base + (i - (ways - 1) / 2) * (spread / ways), spd = 220 + 40 * scale;
          ctx.spawnBullet({ x: ctx.boss.x, y: ctx.boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, color: COLORS.red, type: 'diamond', heading: a, spin: 6 });
        }
        if (scale > 1.2) {
          for (let i = 0; i < 4; i++) {
            const a = rand(0, TAU);
            ctx.spawnBullet({ x: ctx.boss.x, y: ctx.boss.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, r: 5, color: COLORS.white, type: 'orb', heading: a });
          }
        }
      }
    },
  };
}

// ---------- 4. Flower Bloom ----------
export function flowerBloom(scale = 1) {
  let petal = 0;
  return {
    name: 'FLOWER BLOOM', sub: '만개하는 꽃', duration: 15, _acc: 0, rate: 0.03 / scale,
    update(ctx, t, dt) {
      this._acc += dt;
      const petals = 6;
      while (this._acc >= this.rate) {
        this._acc -= this.rate;
        const spd = 110 + 40 * scale;
        const base = petal * (TAU / petals) + t * 0.9;
        for (let k = 0; k < petals; k++) {
          const a = base + (k * TAU) / petals + Math.sin(t * 2 + k) * 0.15;
          ctx.spawnBullet({ x: ctx.boss.x, y: ctx.boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, color: COLORS.pink, type: 'star', heading: a, spin: 3 });
        }
        petal++;
      }
    },
  };
}

// ---------- 5. Cross Fire ----------
export function crossFire(scale = 1) {
  return {
    name: 'CROSS FIRE', sub: '십자 포화', duration: 12, _acc: 0, rate: 0.5 / scale,
    update(ctx, t, dt) {
      this._acc += dt;
      while (this._acc >= this.rate) {
        this._acc -= this.rate;
        const cnt = 8 + Math.floor(scale * 2), spd = 140 + 30 * scale, a0 = aimed(ctx.boss, ctx.player);
        for (let i = 0; i < cnt; i++) {
          const f = (i - (cnt - 1) / 2) * 0.32;
          for (const ang of [a0 + f, a0 + Math.PI / 2 + f]) {
            ctx.spawnBullet({ x: ctx.boss.x, y: ctx.boss.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: 5, color: COLORS.gold, type: 'diamond', heading: ang, spin: 4 });
          }
        }
      }
    },
  };
}

// ---------- 6. Laser Weave ----------
export function laserWeave(scale = 1) {
  let laserIdx = 0;
  return {
    name: 'LASER WEAVE', sub: '레이저 직물', duration: 14, _acc: 0, rate: 1.2, _fillAcc: 0, fillRate: 0.18 / scale,
    update(ctx, t, dt) {
      this._acc += dt; this._fillAcc += dt;
      while (this._acc >= this.rate) {
        this._acc -= this.rate;
        const base = (laserIdx * TAU) / 5 + t * 0.4;
        ctx.spawnLaser({ x: ctx.boss.x, y: ctx.boss.y, angle: base, width: 26 + 8 * scale, warnTime: 0.8, activeTime: 1.4, color: COLORS.cyan, rotSpeed: 0.5 });
        laserIdx++;
      }
      while (this._fillAcc >= this.fillRate) {
        this._fillAcc -= this.fillRate;
        const a = rand(0, TAU), spd = 130;
        ctx.spawnBullet({ x: ctx.boss.x, y: ctx.boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 5, color: COLORS.violet, type: 'circle', heading: a });
      }
    },
  };
}

// ---------- Final: Resonance ----------
export function resonance(scale = 1) {
  let arm = 0;
  return {
    name: 'RESONANCE', sub: '공명의 끝', duration: 20, _acc: 0, rate: 0.05, _ringAcc: 0, ringRate: 1.1,
    update(ctx, t, dt) {
      this._acc += dt; this._ringAcc += dt;
      const arms = 5;
      while (this._acc >= this.rate) {
        this._acc -= this.rate;
        const spd = 160 + 50 * scale;
        const base = arm * (TAU / arms) - t * 2.0;
        for (let k = 0; k < arms; k++) {
          const a = base + (k * TAU) / arms;
          ctx.spawnBullet({ x: ctx.boss.x, y: ctx.boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 5.5, color: choice([COLORS.pink, COLORS.cyan, COLORS.gold]), type: 'star', heading: a, spin: 4 });
        }
        arm++;
      }
      while (this._ringAcc >= this.ringRate) {
        this._ringAcc -= this.ringRate;
        const cnt = 26, spd = 120, j = rand(0, TAU);
        for (let i = 0; i < cnt; i++) {
          const a = j + (i / cnt) * TAU;
          ctx.spawnBullet({ x: ctx.boss.x, y: ctx.boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, color: COLORS.white, type: 'ring', heading: a, scaleIn: 0.1 });
        }
      }
    },
  };
}

// Ordered spell-card lineup for a full run.
export function buildLineup() {
  return [spiralStorm(1), ringCascade(1), aimedScatter(1), flowerBloom(1.1), crossFire(1.2), laserWeave(1.3), resonance(1.4)];
}
