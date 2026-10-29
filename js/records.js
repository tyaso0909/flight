// 記録と実績(やりこみの目標)。達成すると通知が出て、設計図のかけらがもらえる
import { $ } from './dom.js';
import { TYPES, CREW, PARTS, GEAR, SHIP_ORDER, UPGRADES, MAX_LV, SPECIAL, BLUEPRINT, resKey } from './data.js';
import { save, persist, totalLv } from './save.js';
import { G } from './state.js';
import { onShow, showScreen } from './ui.js';
import { sfx } from './audio.js';

const st = () => save.stats;
const count = (obj) => Object.keys(obj || {}).length;
const maxLvShip = () => Math.max(...save.ships.map(s => totalLv(s.lv)));
const tier5 = () => TYPES.filter(t => st().tier5[t.key]).length;

// get() は今の値、max は目標。reward は設計図のかけら
export const ACHIEVEMENTS = [
  { key: 'land1', name: 'はじめての着陸', desc: '星に1回着陸する', max: 1, get: () => st().landings, reward: 1 },
  { key: 'ly1000', name: '信号の届く距離', desc: '1,000光年に到達する', max: 1000, get: () => save.best, reward: 1, unit: '光年' },
  { key: 'ly3000', name: '影の宇宙', desc: '3,000光年に到達する', max: 3000, get: () => save.best, reward: 2, unit: '光年' },
  { key: 'ly6000', name: '星の海の奥', desc: '6,000光年に到達する', max: 6000, get: () => save.best, reward: 3, unit: '光年' },
  { key: 'ly10000', name: '信号の先へ', desc: '10,000光年に到達する', max: 10000, get: () => save.best, reward: 5, unit: '光年' },
  { key: 'types', name: '五つの星', desc: '5種類すべての星に着陸する', max: TYPES.length, get: () => count(st().typesLanded), reward: 2 },
  { key: 'rare3', name: '光る星', desc: '★★★の星に着陸する', max: 1, get: () => st().rare3, reward: 2 },
  { key: 'special', name: '秘境めぐり', desc: '5つの特殊エリアをすべて探索する', max: Object.keys(SPECIAL).length, get: () => count(st().specials), reward: 3 },
  { key: 't5one', name: '至宝', desc: '★5の素材を手に入れる', max: 1, get: () => tier5(), reward: 2 },
  { key: 't5all', name: '五つの至宝', desc: '5種類すべての★5素材を手に入れる', max: TYPES.length, get: () => tier5(), reward: 5 },
  { key: 'crew', name: '仲間がそろった', desc: '仲間を全員集める', max: CREW.length, get: () => save.crew.length, reward: 3 },
  { key: 'fleet', name: '船団', desc: '船を3隻そろえる', max: SHIP_ORDER.length, get: () => save.ships.length, reward: 3 },
  { key: 'lv15', name: '熟練の整備', desc: '1隻の強化合計を Lv15 にする', max: 15, get: maxLvShip, reward: 2 },
  { key: 'lvmax', name: '究極の一隻', desc: '1隻の強化をすべて最大にする', max: UPGRADES.length * MAX_LV, get: maxLvShip, reward: 5 },
  { key: 'parts', name: 'パーツ職人', desc: 'パーツを全部作る', max: PARTS.length, get: () => save.parts.length, reward: 3 },
  { key: 'gear', name: '全装備', desc: '探索装備を全部作る', max: GEAR.length, get: () => save.gear.length, reward: 3 },
  { key: 'dispatch', name: '頼もしい仲間', desc: '派遣を10回成功させる', max: 10, get: () => st().dispatches, reward: 2 },
  { key: 'safe', name: '無傷の航海', desc: '機体を傷つけずに10回続けて着陸する', max: 10, get: () => st().bestStreak, reward: 2 },
  { key: 'chain3', name: '星めぐり', desc: '1回の出撃で3つの星に着陸する', max: 3, get: () => st().bestChain, reward: 2 },
  { key: 'chain6', name: '長い旅路', desc: '1回の出撃で6つの星に着陸する', max: 6, get: () => st().bestChain, reward: 3 },
  { key: 'full', name: '満載', desc: '積載量いっぱいまで持ち帰る', max: 1, get: () => st().fullLoads, reward: 1 }
];

// ---------- 達成の確認と通知 ----------
const queue = [];
let showing = false;
function toast(a) {
  queue.push(a);
  if (showing) return;
  const next = () => {
    const x = queue.shift();
    if (!x) { showing = false; return; }
    showing = true;
    const el = $('toast');
    el.innerHTML = `<span class="tt-eye">実績を達成</span><b>${x.name}</b><span>設計図のかけら +${x.reward}</span>`;
    el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    sfx.crew();
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; next(); }, 300); }, 2600);
  };
  next();
}

// 何か起きたあとに呼ぶ。新しく達成したものに報酬を渡す
export function checkAchievements() {
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (save.ach.includes(a.key)) continue;
    if (a.get() >= a.max) {
      save.ach.push(a.key);
      save.res[BLUEPRINT.key] = (save.res[BLUEPRINT.key] || 0) + a.reward;
      toast(a);
      changed = true;
    }
  }
  if (changed) persist();
}

// ---------- 記録を数える(他の画面から呼ぶ) ----------
export const record = {
  launch() { st().flights++; },
  land(p) {
    st().landings++;
    st().typesLanded[p.type.key] = true;
    if (p.rar === 3) st().rare3 = 1;
    st().streak++; st().bestStreak = Math.max(st().bestStreak, st().streak);
  },
  // 機体が傷ついたら、無傷の連続着陸が途切れる
  damage() { st().streak = 0; },
  // 出撃から帰ってきたとき(寄った星の数、帰還の理由)
  trip(stops, reason) {
    st().bestChain = Math.max(st().bestChain, stops);
    if (reason === 'fuel') st().forced++;
  },
  explore(kind, typeKey) {
    st().explores++;
    if (kind === 'special') st().specials[typeKey] = true;
  },
  loot(gained, full) {
    TYPES.forEach(t => { if (gained[resKey(t.key, 5)]) st().tier5[t.key] = true; });
    if (full) st().fullLoads++;
  },
  dispatch(loot) {
    st().dispatches++;
    TYPES.forEach(t => { if (loot[resKey(t.key, 5)]) st().tier5[t.key] = true; });
  }
};

// ---------- 記録の画面 ----------
function render() {
  const s = st();
  const rows = [
    ['最高到達距離', `${(save.best || 0).toLocaleString('ja-JP')} 光年`],
    ['出撃', `${s.flights} 回`],
    ['着陸', `${s.landings} 回`],
    ['1回の出撃で寄った星', `最多 ${s.bestChain} 個`],
    ['燃料切れで帰還', `${s.forced} 回`],
    ['無傷の連続着陸', `最高 ${s.bestStreak} 回`],
    ['探索した地点', `${s.explores} か所`],
    ['派遣', `${s.dispatches} 回`],
    ['着陸した星', TYPES.map(t => `<span class="${s.typesLanded[t.key] ? 'on' : 'off'}">${t.name}</span>`).join(' ')],
    ['探索した特殊エリア', TYPES.map(t => `<span class="${s.specials[t.key] ? 'on' : 'off'}">${SPECIAL[t.key].name}</span>`).join(' ')],
    ['手に入れた★5', TYPES.map(t => `<span class="${s.tier5[t.key] ? 'on' : 'off'}">${t.items[4]}</span>`).join(' ')]
  ];
  $('rcStats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const done = ACHIEVEMENTS.filter(a => save.ach.includes(a.key)).length;
  $('rcCount').textContent = `${done} / ${ACHIEVEMENTS.length}`;
  $('rcList').innerHTML = ACHIEVEMENTS.map(a => {
    const ok = save.ach.includes(a.key), cur = Math.min(a.max, a.get());
    const pct = cur / a.max * 100;
    const prog = a.unit ? `${cur.toLocaleString('ja-JP')} / ${a.max.toLocaleString('ja-JP')} ${a.unit}` : `${cur} / ${a.max}`;
    return `<li class="ach${ok ? ' ok' : ''}">
      <div class="ach-main"><b>${a.name}</b><small>${a.desc}</small>
        <div class="bar ach-bar"><i style="width:${pct.toFixed(1)}%"></i></div></div>
      <div class="ach-side"><span class="ach-prog">${ok ? '達成' : prog}</span><span class="ach-rew">かけら +${a.reward}</span></div>
    </li>`;
  }).join('');
}
onShow('records', render);
$('btnRecords').addEventListener('click', () => { G.mode = 'records'; showScreen('records'); });
$('btnRcBack').addEventListener('click', () => { G.mode = 'base'; showScreen('base'); });
// 起動したときにも確認(古いセーブで、すでに条件を満たしているもの)
setTimeout(checkAchievements, 1500);
