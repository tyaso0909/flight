// 効果音とBGM。音声ファイルは使わず、ブラウザの Web Audio で合成する
// スマホは画面に触れるまで音を出せないので、最初のタップで音の準備をする
import { cfg } from './save.js';

let ctx = null, master = null, sfxBus = null, bgmBus = null, noise = null;

function init() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
  } catch (e) { return false; }
  master = ctx.createGain(); master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  bgmBus = ctx.createGain(); bgmBus.connect(master);
  // ホワイトノイズ(ブースト・衝突・風切り音に使う)
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolume();
  startBgm();
  return true;
}
const unlock = () => {
  if (!init()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
};
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);
// 別のアプリに切り替えたら音を止める
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
});

export function applyVolume() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(cfg.mute ? 0 : 1, t, 0.05);
  sfxBus.gain.setTargetAtTime(cfg.sfxVol, t, 0.05);
  bgmBus.gain.setTargetAtTime(cfg.bgmVol * 0.5, t, 0.3);
}
const ready = () => ctx && ctx.state === 'running' && !cfg.mute;

// ---------- 小さな部品 ----------
function tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.005 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}
function hiss(dur, { freq = 1200, q = 1, vol = 0.3, at = 0, toFreq = 0, type = 'bandpass' } = {}) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus);
  s.start(t); s.stop(t + dur + 0.05);
}

// ---------- 効果音 ----------
const TIER_NOTE = [0, 523, 659, 784, 988, 1175];
let lastWarn = 0;
export const sfx = {
  click() { if (ready()) tone(1400, 0.05, { type: 'triangle', vol: 0.08 }); },
  buy() { if (!ready()) return; tone(660, 0.18, { type: 'triangle', vol: 0.18 }); tone(990, 0.3, { type: 'triangle', vol: 0.16, at: 0.09 }); },
  // 素材が手に入った(レア度が高いほど高い音、★4以上はきらきら)
  get(tier = 1) {
    if (!ready()) return;
    tone(TIER_NOTE[tier], 0.22, { type: 'sine', vol: 0.2 });
    tone(TIER_NOTE[tier] * 1.5, 0.3, { type: 'sine', vol: 0.12, at: 0.07 });
    if (tier >= 4) [0, 1, 2].forEach(i => tone(TIER_NOTE[tier] * 2 * (1 + i * 0.26), 0.25, { type: 'sine', vol: 0.06, at: 0.15 + i * 0.07 }));
  },
  crew() { if (!ready()) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.15, at: i * 0.1 })); },
  hit() { if (!ready()) return; hiss(0.35, { freq: 400, q: 0.7, vol: 0.5, type: 'lowpass' }); tone(110, 0.3, { type: 'sine', vol: 0.4, slide: 0.4 }); },
  warn() {
    if (!ready()) return;
    const now = performance.now();
    if (now - lastWarn < 650) return;
    lastWarn = now;
    tone(880, 0.09, { type: 'square', vol: 0.05 });
  },
  launch() { if (!ready()) return; hiss(1.1, { freq: 300, toFreq: 2400, q: 0.8, vol: 0.25 }); tone(80, 1.0, { type: 'sawtooth', vol: 0.06, slide: 2.5, attack: 0.2 }); },
  // 大気圏突入の風切り音。不時着は最後にどすんと鳴る
  land(crash) {
    if (!ready()) return;
    hiss(2.2, { freq: 2600, toFreq: 250, q: 0.6, vol: 0.3 });
    if (crash) { hiss(0.5, { freq: 300, q: 0.6, vol: 0.55, at: 2.1, type: 'lowpass' }); tone(70, 0.5, { type: 'sine', vol: 0.5, at: 2.1, slide: 0.5 }); }
  },
  bad() { if (ready()) tone(220, 0.25, { type: 'square', vol: 0.05, slide: 0.7 }); }
};

// ---------- エンジン音(飛行中ずっと鳴る) ----------
let eng = null;
export const engine = {
  start() {
    if (!ctx || eng) return;
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = 9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.6);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxBus);
    // ブーストの噴射音
    const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0;
    ns.connect(bp); bp.connect(ng); ng.connect(sfxBus);
    o1.start(); o2.start(); ns.start();
    eng = { o1, o2, lp, g, ns, bp, ng };
  },
  // 速度で音程が上がり、ブースト中は噴射音が重なる
  update(v, boosting) {
    if (!eng) return;
    const t = ctx.currentTime, f = 45 + v * 0.16;
    eng.o1.frequency.setTargetAtTime(f, t, 0.1);
    eng.o2.frequency.setTargetAtTime(f * 1.5, t, 0.1);
    eng.lp.frequency.setTargetAtTime(220 + v * 1.6 + (boosting ? 500 : 0), t, 0.15);
    eng.ng.gain.setTargetAtTime(boosting ? 0.16 : 0, t, boosting ? 0.05 : 0.2);
    eng.bp.frequency.setTargetAtTime(boosting ? 1300 : 700, t, 0.2);
  },
  stop() {
    if (!eng) return;
    const t = ctx.currentTime, e = eng;
    eng = null;
    e.g.gain.setTargetAtTime(0.0001, t, 0.3);
    e.ng.gain.setTargetAtTime(0.0001, t, 0.2);
    [e.o1, e.o2, e.ns].forEach(n => { try { n.stop(t + 1.5); } catch (err) { /* noop */ } });
  }
};

// ---------- BGM(ゆっくり和音が変わる宇宙っぽい音) ----------
const CHORDS = [
  [110, 164.8, 246.9, 329.6],   // Am9 っぽい
  [87.3, 130.8, 220, 329.6],    // Fmaj7
  [98, 146.8, 246.9, 293.7],    // G6
  [82.4, 123.5, 196, 293.7]     // Em7
];
let bgm = null;
function startBgm() {
  if (bgm) return;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
  // 残響の代わりに短いディレイを重ねる
  const dl = ctx.createDelay(1); dl.delayTime.value = 0.42;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  lp.connect(bgmBus); lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(bgmBus);
  const voices = CHORDS[0].map((f, i) => {
    const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
    o.frequency.value = f; o.detune.value = (i - 1.5) * 4;
    const g = ctx.createGain(); g.gain.value = i === 0 ? 0.22 : 0.09;
    // ゆらぎ
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.05 + i * 0.03; lg.gain.value = 0.04;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(g); g.connect(lp); o.start(); lfo.start();
    return o;
  });
  let n = 0;
  const step = () => {
    n = (n + 1) % CHORDS.length;
    const t = ctx.currentTime;
    voices.forEach((o, i) => o.frequency.setTargetAtTime(CHORDS[n][i], t, 2.5));
  };
  bgm = { lp, voices, timer: setInterval(step, 9000) };
}
// 飛行中はBGMを少し下げる
export function bgmMode(mode) {
  if (!bgm) return;
  const t = ctx.currentTime;
  bgm.lp.frequency.setTargetAtTime(mode === 'flying' ? 600 : 1200, t, 1);
  bgmBus.gain.setTargetAtTime(cfg.bgmVol * (mode === 'flying' ? 0.25 : 0.5), t, 1);
}
