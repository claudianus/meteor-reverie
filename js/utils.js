// utils.js — math, easing, rng, color helpers (no dependencies)

export const TAU = Math.PI * 2;
export const PLAYFIELD_W = 480;
export const PLAYFIELD_H = 720;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (n, m) => ((n % m) + m) % m;
export const deg = (d) => (d * Math.PI) / 180;

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const choice = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

// ---- easing ----
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInQuad = (t) => t * t;
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

// ---- color ----
export const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
export const hsla = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function lerpColorHex(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return rgba(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t), 1);
}

// Approach a target by at most `step`.
export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

// Format a score with thousand separators.
export const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// Small deterministic RNG (mulberry32) for repeatable patterns if desired.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
