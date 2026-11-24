// かんたんなチュートリアル。ピコが画面の部品を照らしながら説明する
// 序章のあと(拠点)→ はじめての飛行 → はじめて星が近づいたとき → はじめての探索 → はじめて帰還したとき(拠点)
import { $ } from './dom.js';
import { save, persist } from './save.js';
import { G } from './state.js';
import { view, toLocal } from './orientation.js';
import { tilt } from './input.js';

// 各段階の説明。target = 照らす部品(なければ真ん中に出す)。text は関数でもよい(そのときの状態で文を変える)
const TOURS = {
  base: [
    { target: null, text: 'ピピッ。ここからは、ピコが遊び方を案内しマス。' },
    { target: '#btnSignals', text: '受信した信号は「信号」で確認できマス。目標の星に着陸して帰ると、話が聞けてごほうびがもらえマス。' },
    { target: '.ship-card', text: '左上は、今の船の状態デス。燃料・耐久・積載(一度に持ち帰れる素材の量)が出ていマス。' },
    { target: '#btnLaunch', text: 'まずは出撃して、星に降りてみまショウ。「出撃する」を押してクダサイ。' }
  ],
  flight: [
    {
      target: () => (tilt.ok ? null : '#stickZone'),
      text: () => (tilt.ok
        ? 'スマホを傾けると、船が傾けた方へ動きマス。まっすぐ持った向きが基準デス(「傾きリセット」でやり直せマス)。'
        : matchMedia('(pointer: coarse)').matches
          ? '左下をドラッグすると、船が動きマス。'
          : '矢印キー(または WASD)で、船が動きマス。')
    },
    { target: '#btnBoost', text: () => `ブーストを押している間だけ加速しマス(${matchMedia('(pointer: coarse)').matches ? '' : 'パソコンはスペースキー。'}燃料を使いマス)。燃料は飛んでいる間は増えまセン。` },
    { target: '#console .speed', text: 'ブーストを離すと、だんだん遅くなりマス。速度計の赤い線より遅くなると、近くの星に引き寄せられて着陸しマス。' },
    { target: '#console .bars', text: '燃料が0になると、帰還用の燃料で自動的に拠点へ戻りマス。それまでに集めた素材は、そのまま持ち帰れマス。' },
    { target: null, text: 'デブリ(岩)に当たると減速しマス。傾けてよけまショウ。では、出発デス!' }
  ],
  planet: [
    { target: '#mfdTarget', text: '前方に星が見えてきまシタ。星の名前と★(レア度)がここに出マス。★が多いほど、珍しい素材が見つかりマス。' },
    { target: '#console .speed', text: '降りたいなら、ブーストを離して減速しまショウ。通り過ぎたいなら、ブーストで速度を保てば振り切れマス。' }
  ],
  explore: [
    { target: '#exMap', text: '星に着陸しまシタ! 地図の地点をタップすると探索できマス。1つの星で2か所まで調べられマス。' },
    { target: '.cargo-box', text: '手に入れた素材は積み荷に入りマス。積載量を超えた分は、帰るときに★の低い素材から置いていきマス。' },
    { target: '#btnExNext', text: '「次の星へ」で、そのまま旅を続けられマス。ただし、星から飛び立つのに燃料を使いマス。' },
    { target: '#btnExDone', text: '「拠点へ帰還」で、積み荷を持って帰りマス。今回は調べ終わったら帰ってみまショウ。' }
  ],
  home: [
    { target: '#btnHangar', text: 'おかえりなサイ! 持ち帰った素材で、格納庫から船を強化できマス。燃料タンクを強くすると、もっと遠くへ行けマス。' },
    { target: '#btnStorage', text: '持っている素材と仲間は「倉庫」で見られマス。集落を探索すると、仲間に出会えることがありマス。' },
    { target: null, text: '部屋の中の窓の船・星図のテーブル・作業台や、仲間もタップできマス。遠くへ行くほど、信号ははっきりしマス。いってらっしゃいマセ!' }
  ]
};
const ORDER = Object.keys(TOURS);

const st = () => save.tut;
let steps = null, si = 0, tourId = '', after = null;

// 今の状態で、その段階を始める(もう終わっていたら何もしない)。始めたら true
export function tutorial(id, onEnd) {
  if (!st() || st().skip || st().done.includes(id) || steps) return false;
  // 前の段階が終わっていないうちは始めない(序章のあと → 順番どおり)
  const i = ORDER.indexOf(id);
  if (i > 0 && !st().done.includes(ORDER[i - 1])) return false;
  steps = TOURS[id]; si = 0; tourId = id; after = onEnd || null;
  if (G.mode === 'flying') G.paused = true;
  $('tut').hidden = false;
  show();
  return true;
}
export const tutorialActive = () => !!steps;

const val = (v) => (typeof v === 'function' ? v() : v);
function rectOf(el) {
  // 画面を回しているときもあるので、四隅を #app の中の座標に直す
  const r = el.getBoundingClientRect();
  const pts = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([x, y]) => toLocal(x, y));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
function show() {
  const s = steps[si];
  const sel = val(s.target);
  const el = sel ? document.querySelector(sel) : null;
  const hole = $('tutHole'), card = $('tutCard');
  $('tutText').textContent = val(s.text);
  $('tutStep').textContent = `${si + 1} / ${steps.length}`;
  $('tutNext').textContent = si === steps.length - 1 ? 'わかった' : '次へ';
  card.classList.remove('top', 'bottom', 'mid');
  if (el && el.offsetParent !== null) {
    const r = rectOf(el), pad = 6;
    Object.assign(hole.style, { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px` });
    hole.classList.remove('none');
    // 照らした部品と重ならない側にカードを出す
    card.classList.add(r.y + r.h / 2 > view.LH / 2 ? 'top' : 'bottom');
  } else {
    Object.assign(hole.style, { left: '50%', top: '50%', width: '0px', height: '0px' });
    hole.classList.add('none');
    card.classList.add('mid');
  }
  card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
}
function finish(all) {
  if (all) st().skip = true;
  if (!st().done.includes(tourId)) st().done.push(tourId);
  persist();
  steps = null;
  $('tut').hidden = true;
  if (G.mode === 'flying') G.paused = false;
  const cb = after; after = null;
  if (cb) cb();
}
$('tutNext').addEventListener('click', (e) => {
  e.stopPropagation();
  si++;
  if (si < steps.length) show(); else finish(false);
});
$('tutSkip').addEventListener('click', (e) => { e.stopPropagation(); finish(true); });
// 部品の位置が変わったとき(画面の向き・大きさ)に照らし直す
window.addEventListener('resize', () => { if (steps) setTimeout(show, 120); });

// 設定画面から、もう一度見る
export function resetTutorial() {
  save.tut = { done: [], skip: false };
  persist();
}
