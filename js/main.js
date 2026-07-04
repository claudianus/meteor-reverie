// main.js — bootstrap, fixed-timestep loop, viewport scaling, UI wiring
import { PLAYFIELD_W, PLAYFIELD_H, clamp, fmt } from './utils.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const muteBtn = document.getElementById('mute');
const bestTitle = document.getElementById('best-title');

const input = new Input(canvas);
const audio = new AudioEngine();
const game = new Game(canvas, input, audio, overlay);
input.attach();

// reflect mute state on the button + sync audio
function syncMuteUI() {
  muteBtn.classList.toggle('muted', audio.muted);
  muteBtn.textContent = audio.muted ? '♪' : '♪';
}
muteBtn.addEventListener('click', () => {
  audio.resume();
  audio.setMuted(!audio.muted);
  syncMuteUI();
});

// keep title best-score in sync
function syncBestUI() {
  if (bestTitle) bestTitle.textContent = fmt(game.best);
}
game.onStateChange((name) => {
  stage.classList.toggle('playing', name === '' || name === 'playing');
  if (name === 'title' || name === 'over' || name === 'win') syncBestUI();
});
syncBestUI();

// click-to-start on title / game-over / win screens (overlay intercepts canvas clicks)
overlay.addEventListener('click', () => {
  if (game.state === 'title' || game.state === 'over' || game.state === 'win') {
    audio.resume();
    audio.confirm();
    game.start();
  }
});

// ---- viewport scaling: fit 480x720 inside the window, preserve aspect ----
function resize() {
  const pad = 24;
  const aw = window.innerWidth - pad * 2;
  const ah = window.innerHeight - pad * 2;
  const scale = clamp(Math.min(aw / PLAYFIELD_W, ah / PLAYFIELD_H), 0.4, 1.6);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', resize);
resize();

// ---- fixed-timestep game loop ----
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let running = true;

// keep title screen alive (background drift + occasional particles)
function titleAmbience(dt) {
  if (game.state !== 'title') return;
  if (Math.random() < dt * 6) {
    game.particles.burst(Math.random() * PLAYFIELD_W, PLAYFIELD_H + 10, 1,
      { speed: 60, color: '#7be7ff', life: 2.4, size: 2, dir: -Math.PI / 2, spread: 0.3, drag: 0.99 });
  }
}

function frame(now) {
  if (!running) return;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // clamp big stalls (tab switch)
  titleAmbience(dt);
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard < 5) {
    game.update(STEP);
    acc -= STEP;
    guard++;
  }
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

// pause simulation when tab is hidden (avoid huge dt / runaway music scheduling)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false;
    if (audio.musicOn) { audio.stopMusic(); audio._wasMusic = true; }
  } else {
    if (!running) {
      running = true;
      last = performance.now();
      acc = 0;
      if (audio._wasMusic && (game.state === 'playing')) audio.startMusic();
      requestAnimationFrame(frame);
    }
  }
});

// first user gesture unlocks audio
const unlock = () => {
  audio.resume();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
