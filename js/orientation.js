// 横画面の強制。縦持ちのときは画面全体を90度回して横画面として表示する
import { $ } from './dom.js';

export const view = { LW: 800, LH: 400, rotated: false, compact: true };
const listeners = [];
const app = $('app');

// ノッチやホームバーの幅(safe area)を読む。画面を回しているときは、回した後の上下左右に入れ替える
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
  'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
document.body.appendChild(probe);
function safeArea() {
  const cs = getComputedStyle(probe);
  const t = parseFloat(cs.paddingTop) || 0, r = parseFloat(cs.paddingRight) || 0;
  const b = parseFloat(cs.paddingBottom) || 0, l = parseFloat(cs.paddingLeft) || 0;
  // 90度回したとき:画面の左 = 端末の上、右 = 下、上 = 右、下 = 左
  return view.rotated ? { t: r, r: b, b: l, l: t } : { t, r, b, l };
}

// 画面の大きさが変わったときに呼ばれる関数を登録する(登録時にも1回呼ぶ)
export function onLayout(fn) {
  listeners.push(fn);
  fn(view);
}

export function layout() {
  const W = window.innerWidth, H = window.innerHeight;
  view.rotated = H > W;
  if (view.rotated) {
    view.LW = H; view.LH = W;
    app.style.transform = `translateX(${W}px) rotate(90deg)`;
  } else {
    view.LW = W; view.LH = H;
    app.style.transform = 'none';
  }
  app.style.width = view.LW + 'px';
  app.style.height = view.LH + 'px';
  app.style.setProperty('--lw', view.LW + 'px');
  app.style.setProperty('--lh', view.LH + 'px');
  const sa = safeArea();
  app.style.setProperty('--st', sa.t + 'px');
  app.style.setProperty('--sr', sa.r + 'px');
  app.style.setProperty('--sb', sa.b + 'px');
  app.style.setProperty('--sl', sa.l + 'px');
  // スマホ(画面が低い・狭い)では、各画面を全画面のシートにする
  view.compact = view.LH < 560 || view.LW < 900;
  app.classList.toggle('compact', view.compact);
  listeners.forEach(f => f(view));
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 150));
// iPhone のブラウザはバーの出し入れで高さが変わる
if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
layout();

// 画面の座標を、回した後の横画面の座標に直す
export const toLocal = (cx, cy) => view.rotated ? [cy, window.innerWidth - cx] : [cx, cy];
export const toLocalDelta = (dx, dy) => view.rotated ? [dy, -dx] : [dx, dy];

// Android などでは全画面にして横向きに固定する(できない環境は表示を回して対応)
export async function tryLandscape() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch (e) { /* 全画面にできない環境 */ }
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (e) { /* 向きを固定できない環境 */ }
}

// Android などでは、最初に画面をタップしたときに全画面にする(ブラウザのバーを消して画面を広く使う)
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (!isIOS && document.documentElement.requestFullscreen && window.matchMedia && matchMedia('(pointer: coarse)').matches) {
  // 指を置いた瞬間ではなくタップ(click)のときにする。スクロールしようとした指で全画面に切り替わると、
  // 画面の大きさが変わってスクロールが途中で止まってしまうため
  const once = () => { tryLandscape(); window.removeEventListener('click', once, true); };
  window.addEventListener('click', once, true);
}
