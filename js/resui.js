// 素材の表示に使う小さな部品
import { RES, BLUEPRINT, resName, resShort, resTier } from './data.js';
import { save } from './save.js';

export const have = (k) => save.res[k] || 0;

// 素材の名前+レア度(★)
export function resLabel(key) {
  const t = resTier(key);
  return t ? `${resName(key)}<span class="rt rt${t}">★${t}</span>` : resName(key);
}

// 費用の一覧({ k, n } の配列)。足りないものは赤くする
export const toList = (obj) => Object.entries(obj || {}).map(([k, n]) => ({ k, n }));
export const canPay = (list) => list.every(c => have(c.k) >= c.n);
export const pay = (list) => list.forEach(c => { save.res[c.k] = have(c.k) - c.n; });
export const costHtml = (list) => list.map(c => {
  const t = resTier(c.k);
  return `<span class="${have(c.k) < c.n ? 'short' : ''}">${resShort(c.k)}${t ? `<i class="rt rt${t}">★${t}</i>` : ''} ${c.n}</span>`;
}).join(' / ');

// 持っている素材だけを並べる(画面下の所持素材の欄)
export function ownedResHtml() {
  const items = RES.filter(r => have(r.key) > 0).map(r => `<span>${resLabel(r.key)} <b>${have(r.key)}</b></span>`);
  items.push(`<span>${BLUEPRINT.short} <b>${have(BLUEPRINT.key)}</b></span>`);
  return items.join('');
}
