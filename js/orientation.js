// 横画面の強制。縦持ちのときは画面全体を90度回して横画面として表示する
import { $ } from './dom.js';

export const view = { LW: 800, LH: 400, rotated: false };
const listeners = [];
const app = $('app');

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
  listeners.forEach(f => f(view));
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 150));
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
