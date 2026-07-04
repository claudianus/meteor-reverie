// audio.js — Web Audio synthesized SFX + procedural BGM (no asset files)
import { rand } from './utils.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._noise = null;
    this._musicTimer = null;
    this._step = 0;
    this._nextTime = 0;
    this.musicOn = false;
    this._sched = null;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.30;
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.85;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 1.2;
    this._noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  resume() { this.ensure(); if (this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.9; }
  _now() { return this.ctx.currentTime; }

  _tone(o) {
    const t = this._now();
    const { freq = 440, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, glideTo, dest = this.sfxBus } = o;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + dur + 0.02);
  }

  _noiseHit(o) {
    const t = this._now();
    const { dur = 0.3, vol = 0.4, type = 'lowpass', freq = 1200, glideTo, dest = this.sfxBus } = o;
    const src = this.ctx.createBufferSource(); src.buffer = this._noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (glideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, glideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.02);
  }

  shoot() { this._tone({ freq: 880, glideTo: 1500, type: 'square', dur: 0.07, vol: 0.10 }); }
  enemyShot() { this._tone({ freq: 320, glideTo: 180, type: 'sawtooth', dur: 0.08, vol: 0.05 }); }
  graze() { this._tone({ freq: rand(1400, 1900), glideTo: 2400, type: 'triangle', dur: 0.06, vol: 0.06 }); }
  powerup() {
    this._tone({ freq: 520, glideTo: 1040, type: 'triangle', dur: 0.18, vol: 0.18 });
    setTimeout(() => this._tone({ freq: 1040, glideTo: 1560, type: 'triangle', dur: 0.16, vol: 0.14 }), 70);
  }
  explosionSmall() { this._noiseHit({ dur: 0.22, vol: 0.3, freq: 1800, glideTo: 200 }); }
  explosionBig() {
    this._noiseHit({ dur: 0.6, vol: 0.5, freq: 1400, glideTo: 120 });
    this._tone({ freq: 90, glideTo: 40, type: 'sine', dur: 0.5, vol: 0.3 });
  }
  bomb() {
    this._noiseHit({ dur: 1.0, vol: 0.45, freq: 3000, glideTo: 120 });
    this._tone({ freq: 1200, glideTo: 120, type: 'sawtooth', dur: 0.9, vol: 0.2 });
    this._tone({ freq: 240, glideTo: 60, type: 'sine', dur: 1.0, vol: 0.3 });
  }
  playerHit() {
    this._tone({ freq: 420, glideTo: 70, type: 'sawtooth', dur: 0.5, vol: 0.3 });
    this._noiseHit({ dur: 0.4, vol: 0.25, freq: 900, glideTo: 120 });
  }
  select() { this._tone({ freq: 660, type: 'square', dur: 0.06, vol: 0.12 }); }
  confirm() {
    this._tone({ freq: 523, type: 'triangle', dur: 0.1, vol: 0.16 });
    setTimeout(() => this._tone({ freq: 784, type: 'triangle', dur: 0.14, vol: 0.16 }), 90);
  }
  spellcard() {
    this._tone({ freq: 220, glideTo: 880, type: 'sawtooth', dur: 0.5, vol: 0.16 });
    this._tone({ freq: 330, glideTo: 1100, type: 'square', dur: 0.5, vol: 0.08 });
  }
  gameOver() {
    [523, 466, 392, 330, 262].forEach((f, i) =>
      setTimeout(() => this._tone({ freq: f, type: 'sawtooth', dur: 0.4, vol: 0.2 }), i * 180));
  }
  victory() {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => this._tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.2 }), i * 150));
  }

  // ---- procedural BGM (energetic, looping) ----
  startMusic() {
    this.ensure();
    if (this.musicOn) return;
    this.musicOn = true;
    this._step = 0;
    this._nextTime = this._now() + 0.1;
    this._spb = 60 / 144; // 144 BPM
    this._sched = setInterval(() => this._scheduler(), 25);
  }
  stopMusic() {
    this.musicOn = false;
    if (this._sched) { clearInterval(this._sched); this._sched = null; }
  }

  _scheduler() {
    if (!this.ctx || !this.musicOn) return;
    const ahead = 0.12;
    while (this._nextTime < this._now() + ahead) {
      this._playStep(this._step, this._nextTime);
      this._nextTime += this._spb / 4;
      this._step = (this._step + 1) % 64; // 4 bars of 16ths
    }
  }

  _playStep(s, t) {
    const roots = [220.0, 174.61, 261.63, 196.0]; // Am F C G
    const bar = (s / 16) | 0;
    const root = roots[bar];
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const inBar = s % 16;

    if (inBar % 4 === 0) this._schedTone({ freq: root / 2, type: 'sawtooth', dur: 0.18, vol: 0.18, t, glideTo: root / 2 * 0.98 });
    if (inBar % 8 === 4) this._schedTone({ freq: root / 2 * 1.5, type: 'square', dur: 0.12, vol: 0.10, t });

    const noteIdx = scale[(s * 3) % scale.length];
    const leadFreq = root * 2 * Math.pow(2, noteIdx / 12);
    this._schedTone({ freq: leadFreq, type: 'square', dur: 0.12, vol: 0.06, t });

    if (inBar === 0) [0, 7, 12].forEach((iv) =>
      this._schedTone({ freq: root * 2 * Math.pow(2, iv / 12), type: 'triangle', dur: this._spb * 3.6, vol: 0.04, t }));

    if (inBar % 8 === 0) this._schedNoise({ dur: 0.16, vol: 0.22, freq: 160, glideTo: 50, t });
    if (inBar % 8 === 4) this._schedNoise({ dur: 0.14, vol: 0.14, freq: 2200, glideTo: 1600, type: 'highpass', t });
    if (inBar % 2 === 1) this._schedNoise({ dur: 0.04, vol: 0.05, freq: 6000, type: 'highpass', t });
  }

  _schedTone(o) {
    const { freq, type, dur, vol, t, glideTo } = o;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.musicBus); osc.start(t); osc.stop(t + dur + 0.02);
  }

  _schedNoise(o) {
    const { dur, vol, freq, glideTo, type = 'lowpass', t } = o;
    const src = this.ctx.createBufferSource(); src.buffer = this._noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (glideTo) f.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.musicBus); src.start(t); src.stop(t + dur + 0.02);
  }
}
