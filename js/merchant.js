// 行商人ガラン:ときどき拠点に来て、素材の買い取りと品物の販売をする
// 来る:はじめて着陸して戻ったとき / 出撃から戻るたびに40% / 前に来てから6時間たったとき
// 帰る:来てから60分(現実の時間)、または出撃3回
import { $ } from './dom.js';
import { TYPES, MAX_TIER, BLUEPRINT, resKey, resTier, resName, resType } from './data.js';
import { save, persist } from './save.js';
import { G } from './state.js';
import { onShow, showScreen } from './ui.js';
import { sfx } from './audio.js';

export const SELL = [0, 2, 5, 12, 30, 80];   // ★ごとの買い取り値(Cr)
const STAY_MS = 60 * 60000, AGAIN_MS = 6 * 3600000, STAY_FLIGHTS = 3, CHANCE = 0.4;
export const WARP = { name: 'ワープセル', price: 120, desc: '派遣中の1件の残り時間を半分にする(残り10分以下ならすぐ帰還)' };

const pickType = () => {
  // 持っている数が少ない星ほど選ばれやすい
  const w = TYPES.map(t => 1 / (1 + [2, 3].reduce((s, i) => s + (save.res[resKey(t.key, i)] || 0), 0) / 10));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < TYPES.length; i++) { r -= w[i]; if (r < 0) return TYPES[i]; }
  return TYPES[0];
};

function makeStock() {
  const stock = [{ id: 'warp', kind: 'warp', n: 1, left: 3, price: WARP.price }];
  const used = new Set();
  for (let i = 0; i < 2; i++) {
    let t = pickType();
    if (used.has(t.key)) t = TYPES.find(x => !used.has(x.key));
    used.add(t.key);
    const tier = Math.random() < 0.6 ? 2 : 3;
    stock.push({ id: `res${i}`, kind: 'res', key: resKey(t.key, tier), n: 5, left: 2, price: Math.round(SELL[tier] * 5 * 1.6) });
  }
  const rare = TYPES[Math.floor(Math.random() * TYPES.length)];
  stock.push({ id: 'rare', kind: 'res', key: resKey(rare.key, 4), n: 1, left: 1, price: SELL[4] * 2 });
  if (Math.random() < 0.5) stock.push({ id: 'bp', kind: 'res', key: BLUEPRINT.key, n: 1, left: 1, price: 150 });
  return stock;
}

// 拠点に入ったときに呼ぶ。'arrive' / 'leave' / null を返す
export function merchantTick() {
  const m = save.merchant, now = Date.now(), flights = save.stats.flights;
  const newFlights = Math.max(0, flights - m.seenFlights);
  m.seenFlights = flights;
  if (m.here) {
    m.flights -= newFlights;
    if (now >= m.until || m.flights <= 0) {
      m.here = false; m.last = now; m.stock = [];
      persist();
      return 'leave';
    }
    persist();
    return null;
  }
  const first = !m.met && save.stats.landings >= 1;
  const come = first || (m.met && ((newFlights > 0 && Math.random() < CHANCE) || now - m.last >= AGAIN_MS));
  if (!come) { persist(); return null; }
  m.here = true; m.met = true; m.until = now + STAY_MS; m.flights = STAY_FLIGHTS; m.last = now;
  m.stock = makeStock();
  persist();
  return 'arrive';
}
export const merchantHere = () => save.merchant.here;

// ---------- 買い物の画面 ----------
let tab = 'buy';
const fmtLeft = () => {
  const m = save.merchant, min = Math.max(0, Math.ceil((m.until - Date.now()) / 60000));
  return `あと${min}分か、出撃${Math.max(0, m.flights)}回で次の星へ`;
};
// 品物の名前(色の点・名前・★・数)
function itemHtml(key, amount) {
  const t = resTier(key), type = resType(key);
  const color = key === 'warp' ? 'var(--ice)' : type ? type.css : 'var(--amber)';
  const name = key === 'warp' ? WARP.name : resName(key);
  return `<span class="shop-item"><span class="dot" style="background:${color}"></span><b>${name}</b>${t ? `<span class="rt rt${t}">★${t}</span>` : ''}<span class="shop-n">${amount}</span></span>`;
}
function render() {
  $('shopCr').textContent = save.credits.toLocaleString('ja-JP');
  $('shopWarp').textContent = save.items.warp;
  $('shopLeave').textContent = save.merchant.here ? fmtLeft() : '';
  $('tabBuy').setAttribute('aria-selected', String(tab === 'buy'));
  $('tabSell').setAttribute('aria-selected', String(tab === 'sell'));
  $('shopBuy').hidden = tab !== 'buy';
  $('shopSell').hidden = tab !== 'sell';
  if (tab === 'buy') {
    const rows = save.merchant.stock.map(s => {
      const can = s.left > 0 && save.credits >= s.price;
      const desc = s.kind === 'warp' ? WARP.desc : s.key === BLUEPRINT.key ? '特別なパーツや装備に使う' : `★${resTier(s.key)}の素材 ${s.n}個`;
      return `<li class="shop-row">
        <div class="shop-main">${itemHtml(s.kind === 'warp' ? 'warp' : s.key, `×${s.n}`)}<small>${desc}</small></div>
        <span class="shop-left">${s.left ? `残り ${s.left}` : '売り切れ'}</span>
        <button type="button" class="btn${can ? ' primary' : ''}" data-buy="${s.id}"${can ? '' : ' disabled'}>買う<small>${s.price} Cr</small></button>
      </li>`;
    }).join('');
    $('shopBuy').innerHTML = `<ul class="shop-list">${rows}</ul>`;
  } else {
    const keys = [];
    for (let t = MAX_TIER; t >= 1; t--) TYPES.forEach(ty => { const k = resKey(ty.key, t); if (save.res[k]) keys.push(k); });
    const rows = keys.map(k => {
      const n = save.res[k], p = SELL[resTier(k)];
      const all = Math.floor(n / 2);
      return `<li class="shop-row">
        <div class="shop-main">${itemHtml(k, `所持 ${n}`)}<small>1個 ${p} Cr</small></div>
        <button type="button" class="btn" data-sell="${k}" data-n="1">1個<small>+${p}</small></button>
        <button type="button" class="btn" data-sell="${k}" data-n="10"${n >= 10 ? '' : ' disabled'}>10個<small>+${p * 10}</small></button>
        <button type="button" class="btn" data-sell="${k}" data-n="${all}"${all >= 1 ? '' : ' disabled'}>半分<small>+${p * all}</small></button>
      </li>`;
    }).join('');
    $('shopSell').innerHTML = rows ? `<ul class="shop-list">${rows}</ul>` : '<p class="note">売れる素材がありません。設計図のかけらは買い取れません。</p>';
  }
}
function say(text) { $('shopSay').textContent = text; }

$('shopBuy').addEventListener('click', (e) => {
  const b = e.target.closest('[data-buy]');
  if (!b || b.disabled) return;
  const s = save.merchant.stock.find(x => x.id === b.dataset.buy);
  if (!s || s.left <= 0 || save.credits < s.price) return;
  save.credits -= s.price; s.left--;
  if (s.kind === 'warp') save.items.warp += s.n;
  else save.res[s.key] = (save.res[s.key] || 0) + s.n;
  persist(); sfx.buy();
  say(s.kind === 'warp' ? '毎度あり!派遣の画面で使えるよ' : '毎度あり!大事に使ってくれよ');
  render();
});
$('shopSell').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sell]');
  if (!b || b.disabled) return;
  const k = b.dataset.sell, n = Math.min(parseInt(b.dataset.n, 10), save.res[k] || 0);
  if (n <= 0) return;
  save.res[k] -= n;
  if (!save.res[k]) delete save.res[k];
  const gain = SELL[resTier(k)] * n;
  save.credits += gain;
  persist(); sfx.get(1);
  say(resTier(k) >= 4 ? 'おお、これは珍しい!いい値で買うよ' : `${gain} Cr で買い取ったよ`);
  render();
});
$('tabBuy').addEventListener('click', () => { tab = 'buy'; render(); });
$('tabSell').addEventListener('click', () => { tab = 'sell'; render(); });
$('btnShopBack').addEventListener('click', () => { G.mode = 'base'; showScreen('base'); });

export function openShop() {
  if (!save.merchant.here) return;
  tab = 'buy';
  say(save.credits < 100 ? 'いらっしゃい!お金がなければ、素材を買い取るよ' : 'いらっしゃい!今日の品ぞろえはこれだよ');
  G.mode = 'shop';
  showScreen('shop');
}
onShow('shop', render);
