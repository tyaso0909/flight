// 入力(傾きセンサー・左下のドラッグ操縦・ブーストボタン・キーボード)
import { $, clamp } from './dom.js';
import { cfg } from './save.js';
import { G } from './state.js';
import { view, toLocal } from './orientation.js';

// ---------- 傾きセンサー ----------
export const tilt = { ok: false, beta: 0, gamma: 0, s0: 0, p0: 0, listening: false };
const firstTiltHooks = [];
export const onFirstTilt = (fn) => firstTiltHooks.push(fn);

function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  const first = !tilt.ok;
  tilt.ok = true; tilt.beta = e.beta; tilt.gamma = e.gamma;
  if (first) firstTiltHooks.forEach(f => f());
}
function listenTilt() {
  if (tilt.listening) return;
  tilt.listening = true;
  window.addEventListener('deviceorientation', onOrient);
}
listenTilt();

function screenAngle() {
  if (view.rotated) return 90; // 縦持ちの画面を回して表示 = 端末の上側を左にした横持ちとみなす
  const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
  return ((a % 360) + 360) % 360;
}
function rawTilt() {
  const a = screenAngle(), b = tilt.beta, g = tilt.gamma;
  if (a === 90) return [b, -g];
  if (a === 270) return [-b, g];
  if (a === 180) return [-g, -b];
  return [g, b];
}
// 今の持ち方を「まっすぐ」の基準にする
export function calibrate() { const [s, p] = rawTilt(); tilt.s0 = s; tilt.p0 = p; }

// iPhone は傾きセンサーを使う前にユーザーの許可が要る
export async function askTilt() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') return false;
    }
    listenTilt();
    return true;
  } catch (e) { return false; }
}

// ---------- 左下のドラッグ操縦 ----------
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const zone = $('stickZone'), sBase = $('stickBase'), sKnob = $('stickKnob');
zone.addEventListener('pointerdown', (e) => {
  if (stick.id !== null) return;
  stick.id = e.pointerId;
  try { zone.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  const [x, y] = toLocal(e.clientX, e.clientY);
  stick.ox = x; stick.oy = y; stick.x = 0; stick.y = 0;
  sBase.style.left = x + 'px'; sBase.style.top = y + 'px'; sBase.hidden = false;
  sKnob.style.transform = 'translate(-50%,-50%)';
  $('stickHint').hidden = true;
});
zone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return;
  const [x, y] = toLocal(e.clientX, e.clientY);
  const R = view.LH * 0.12;
  let dx = (x - stick.ox) / R, dy = (y - stick.oy) / R;
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  stick.x = dx; stick.y = -dy;
  sKnob.style.transform = `translate(calc(-50% + ${dx * R}px), calc(-50% + ${dy * R}px))`;
});
const stickEnd = (e) => {
  if (e.pointerId !== stick.id) return;
  stick.id = null; stick.x = 0; stick.y = 0; sBase.hidden = true;
};
zone.addEventListener('pointerup', stickEnd);
zone.addEventListener('pointercancel', stickEnd);

// ---------- ブースト ----------
let boostBtn = false, boostKey = false;
export const boostButton = $('btnBoost');
boostButton.addEventListener('pointerdown', (e) => {
  boostBtn = true;
  try { boostButton.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  e.preventDefault();
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => boostButton.addEventListener(t, () => { boostBtn = false; }));
boostButton.addEventListener('contextmenu', (e) => e.preventDefault());
export const boostHeld = () => boostBtn || boostKey;

// ---------- キーボード(パソコンでの確認用) ----------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { boostKey = true; if (G.mode === 'flying') e.preventDefault(); }
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') boostKey = false; keys.delete(e.code); });

// 左右・上下の入力を -1〜1 で返す
export function readInput() {
  let ix = 0, iy = 0;
  if (tilt.ok) {
    const [s, p] = rawTilt();
    let tx = (s - tilt.s0) / 22 * cfg.sens, ty = (p - tilt.p0) / 22 * cfg.sens;
    if (cfg.invX) tx = -tx;
    if (cfg.invY) ty = -ty;
    ix += tx; iy += ty;
  }
  ix += stick.x; iy += stick.y;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) ix -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) ix += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) iy += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) iy -= 1;
  const dz = (v) => Math.abs(v) < 0.06 ? 0 : v;
  return [clamp(dz(ix), -1, 1), clamp(dz(iy), -1, 1)];
}
