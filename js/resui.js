// 素材の表示に使う小さな部品
import { RES, TYPES, BLUEPRINT, resName, resShort, resTier, resType } from './data.js';
import { save } from './save.js';

export const have = (k) => save.res[k] || 0;

// 素材の名前+レア度(★)
export function resLabel(key) {
  const t = resTier(key);
  return t ? `${resName(key)}<span class="rt rt${t}">★${t}</span>` : resName(key);
}

// ログや結果に使う1行:「色 / 名前 / ★ / 数」
export function dropRow(key, amount) {
  const t = resTier(key), type = resType(key);
  const color = type ? type.css : 'var(--amber)';
  return `<li class="drop"><span class="dot" style="background:${color}"></span><span class="dn">${resName(key)}</span>${t ? `<span class="rt rt${t}">★${t}</span>` : '<span></span>'}<b class="dq">${amount}</b></li>`;
}

// 費用の一覧({ k, n } の配列)。足りないものは赤くする
export const toList = (obj) => Object.entries(obj || {}).map(([k, n]) => ({ k, n }));
export const canPay = (list) => list.every(c => have(c.k) >= c.n);
export const pay = (list) => list.forEach(c => { save.res[c.k] = have(c.k) - c.n; });

const oneCost = (c) => {
  const t = resTier(c.k);
  return `<span class="${have(c.k) < c.n ? 'short' : ''}">${resShort(c.k)}${t ? `<i class="rt rt${t}">★${t}</i>` : ''} ${c.n}</span>`;
};
// 5つの星の素材が同じレア度・同じ数そろっている費用は「全属性★1 各4」とまとめて見せる
export function costHtml(list) {
  const groups = {};
  list.forEach(c => {
    const t = resTier(c.k);
    if (t) (groups[`${t}:${c.n}`] = groups[`${t}:${c.n}`] || []).push(c);
  });
  const out = [], done = new Set();
  for (const id in groups) {
    const g = groups[id];
    if (g.length !== TYPES.length) continue;
    const [t, n] = id.split(':');
    const short = g.filter(c => have(c.k) < c.n);
    const note = short.length ? `(${short.length}種不足)` : '';
    out.push(`<span class="${short.length ? 'short' : ''}" title="${g.map(c => resShort(c.k)).join('・')}">全属性<i class="rt rt${t}">★${t}</i> 各${n}${note}</span>`);
    g.forEach(c => done.add(c.k));
  }
  list.filter(c => !done.has(c.k)).forEach(c => out.push(oneCost(c)));
  return out.join(' / ');
}

// 持っている素材だけを並べる(画面下の所持素材の欄)
export function ownedResHtml() {
  const items = RES.filter(r => have(r.key) > 0).map(r => `<span>${resLabel(r.key)} <b>${have(r.key)}</b></span>`);
  items.push(`<span>${BLUEPRINT.short} <b>${have(BLUEPRINT.key)}</b></span>`);
  return items.join('');
}
