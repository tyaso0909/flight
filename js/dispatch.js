// NPC派遣。乗っていない船と仲間を送り出し、現実の時間がたつと素材を持ち帰る(ゲームを閉じていても進む)
import { $, rnd } from './dom.js';
import { TYPES, CREW, SHIPS, DISPATCH, TIER_WEIGHTS, TIER_QTY, BLUEPRINT, resKey, resTier } from './data.js';
import { save, persist, cfg, statsOf, hasCrew, shipBusy, crewBusy } from './save.js';
import { G } from './state.js';
import { onShow, onHide, showScreen } from './ui.js';
import { dropRow } from './resui.js';
import { sfx } from './audio.js';

const crewOf = (key) => CREW.find(c => c.key === key);
const shipOf = (id) => save.ships.find(s => s.id === id);
const CREW_FX = { miner: '持ち帰る量 1.3倍', navigator: '時間 -30%' };

// 「遠く」の星のレア度(自分が到達した一番遠い距離で決まる)
const farRar = () => save.best >= 3000 ? 3 : save.best >= 1500 ? 2 : 1;
const tierRange = (rar) => ({ 1: '★1〜★3', 2: '★1〜★4', 3: '★1〜★5' }[rar]);

// かかる時間(ミリ秒)
function durationMs(target, crewKey) {
  const D = DISPATCH[target];
  let min = target === 'near' ? D.minutes : Math.min(D.maxMinutes, D.minutes + save.best / 1000 * D.perThousandLy);
  if (crewKey === 'navigator') min *= 0.7;
  return Math.max(5000, min * 60000 * cfg.dispatchScale);
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return h ? `${h}時間${String(m).padStart(2, '0')}分` : m ? `${m}分${String(sec).padStart(2, '0')}秒` : `${sec}秒`;
}

// 持ち帰る素材を決める(出発のときに決めておく)
function rollLoot(target, ship, crewKey) {
  const D = DISPATCH[target], cap = statsOf(ship).cargo;
  const rar = target === 'near' ? 1 : farRar();
  const w = TIER_WEIGHTS[rar], wt = w.reduce((a, b) => a + b, 0);
  const total = cap * rnd(D.fill[0], D.fill[1]) * (crewKey === 'miner' ? 1.3 : 1);
  const loot = {};
  for (let i = 0; i < D.drops; i++) {
    let r = Math.random() * wt, tier = 1;
    for (let j = 0; j < w.length; j++) { r -= w[j]; if (r < 0) { tier = j + 1; break; } }
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    const key = resKey(type.key, tier);
    loot[key] = (loot[key] || 0) + Math.max(1, Math.round(total / D.drops * TIER_QTY[tier]));
  }
  // 積載量を超えた分は★の低いものから置いてくる
  let over = Object.values(loot).reduce((a, b) => a + b, 0) - cap;
  for (const k of Object.keys(loot).sort((a, b) => resTier(a) - resTier(b))) {
    if (over <= 0) break;
    const take = Math.min(over, loot[k]);
    loot[k] -= take; over -= take;
    if (!loot[k]) delete loot[k];
  }
  if (target === 'far' && Math.random() < 0.3) loot[BLUEPRINT.key] = 1;
  return loot;
}

// ---------- 状態 ----------
let sel = { ship: null, crew: null, target: 'near' };
let lastGot = null;   // 直前に受け取った派遣の結果
let timer = 0;

const idleShips = () => save.ships.filter(s => s !== save.ship && !shipBusy(s.id));
const idleCrew = () => save.crew.map(c => c.key).filter(k => !crewBusy(k));
export const doneCount = () => save.dispatch.filter(d => Date.now() >= d.end).length;

function fixSelection() {
  const ships = idleShips(), crew = idleCrew();
  if (!ships.some(s => s.id === sel.ship)) sel.ship = ships.length ? ships[0].id : null;
  if (!crew.includes(sel.crew)) sel.crew = crew.length ? crew[0] : null;
  if (sel.target === 'far' && !save.best) sel.target = 'near';
}

// ---------- 画面 ----------
let activeSig = '';
function renderActive() {
  const now = Date.now();
  // 形が変わらないときは、残り時間とバーだけ書き換える(ボタンを押している途中に作り直さない)
  const sig = save.dispatch.map(d => `${d.id}:${now >= d.end}`).join('|') + (lastGot ? '+got' : '');
  if (sig === activeSig) {
    save.dispatch.forEach(d => {
      const card = document.querySelector(`.dp-card[data-id="${d.id}"]`);
      if (!card) return;
      card.querySelector('.dp-bar i').style.width = Math.min(100, (now - d.start) / (d.end - d.start) * 100).toFixed(1) + '%';
      if (now < d.end) card.querySelector('.dp-time').textContent = `あと ${fmtTime(d.end - now)}`;
    });
    return;
  }
  activeSig = sig;
  const got = lastGot ? `<div class="dp-got">
      <div class="lg-head"><b>受け取った素材</b><span class="lg-new">${SHIPS[lastGot.kind].name} ・ ${crewOf(lastGot.crew).role} ${crewOf(lastGot.crew).name}</span></div>
      <ul class="drops">${Object.keys(lastGot.loot).sort((a, b) => resTier(b) - resTier(a)).map(k => dropRow(k, `+${lastGot.loot[k]}`)).join('')}</ul>
    </div>` : '';
  const cards = save.dispatch.map(d => {
    const sh = shipOf(d.ship), c = crewOf(d.crew), done = now >= d.end;
    const pct = Math.min(100, (now - d.start) / (d.end - d.start) * 100);
    return `<div class="dp-card${done ? ' done' : ''}" data-id="${d.id}">
      <div class="dp-top"><b>${DISPATCH[d.target].name}へ</b><span>${SHIPS[sh.kind].name} ・ ${c.role} ${c.name}</span></div>
      <div class="bar dp-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="dp-bottom">
        <span class="dp-time">${done ? '帰還しました' : `あと ${fmtTime(d.end - now)}`}</span>
        ${done ? `<button class="btn primary" type="button" data-receive="${d.id}">受け取る</button>` : ''}
      </div>
    </div>`;
  }).join('');
  $('dpActive').innerHTML = got + (cards || '<p class="note">派遣中の仲間はいません。</p>');
}

function renderForm() {
  fixSelection();
  const ships = save.ships.filter(s => s !== save.ship);
  if (!ships.length) {
    $('dpForm').innerHTML = `<p class="note">派遣するには、今乗っている船とは別の船が要ります。造船士が仲間になったら、格納庫の「造船」で建造してください。</p>`;
    $('btnDpGo').disabled = true;
    $('dpSummary').textContent = '';
    return;
  }
  const shipBtns = ships.map(s => {
    const busy = shipBusy(s.id), st = statsOf(s);
    return `<button type="button" class="pick${sel.ship === s.id ? ' on' : ''}" data-pick-ship="${s.id}"${busy ? ' disabled' : ''}>
      <b>${SHIPS[s.kind].name}</b><small>${busy ? '派遣中' : `積載 ${st.cargo}`}</small></button>`;
  }).join('');
  const crewBtns = save.crew.map(c => {
    const info = crewOf(c.key), busy = crewBusy(c.key);
    return `<button type="button" class="pick${sel.crew === c.key ? ' on' : ''}" data-pick-crew="${c.key}"${busy ? ' disabled' : ''}>
      <b>${info.role} ${info.name}</b><small>${busy ? '派遣中' : (CREW_FX[c.key] || '効果なし')}</small></button>`;
  }).join('') || '<p class="note">仲間がいません。集落で仲間を探してください。</p>';
  const ship = shipOf(sel.ship), cap = ship ? statsOf(ship).cargo : 0;
  const tgt = (key) => {
    const D = DISPATCH[key], disabled = key === 'far' && !save.best;
    const rar = key === 'near' ? 1 : farRar();
    const mult = sel.crew === 'miner' ? 1.3 : 1;
    const lo = Math.round(cap * D.fill[0] * mult * 0.75), hi = Math.min(cap, Math.round(cap * D.fill[1] * mult));
    const where = key === 'near' ? '拠点の近くの星' : `${save.best.toLocaleString('ja-JP')} 光年先まで`;
    return `<button type="button" class="pick tgt${sel.target === key ? ' on' : ''}" data-pick-target="${key}"${disabled ? ' disabled' : ''}>
      <b>${D.name}</b><small>${disabled ? 'まだ遠くへ行っていません' : where}</small>
      <span class="tgt-meta"><span>${fmtTime(durationMs(key, sel.crew))}</span><span>${tierRange(rar)}</span><span>約 ${lo}〜${hi} 個${key === 'far' ? '・かけら' : ''}</span></span>
    </button>`;
  };
  $('dpForm').innerHTML = `
    <h3 class="pt-group">行き先</h3><div class="picks two">${tgt('near')}${tgt('far')}</div>
    <h3 class="pt-group">船</h3><div class="picks">${shipBtns}</div>
    <h3 class="pt-group">仲間</h3><div class="picks">${crewBtns}</div>`;
  const ok = !!(sel.ship && sel.crew);
  $('btnDpGo').disabled = !ok;
  $('dpSummary').textContent = ok ? `${DISPATCH[sel.target].name}へ ・ ${fmtTime(durationMs(sel.target, sel.crew))}で帰還` : '船と仲間を選んでください';
}

function render() {
  activeSig = '';
  renderActive();
  renderForm();
}

function start() {
  fixSelection();
  const ship = shipOf(sel.ship);
  if (!ship || !sel.crew || shipBusy(ship.id) || crewBusy(sel.crew) || ship === save.ship || !hasCrew(sel.crew)) return;
  const now = Date.now();
  save.dispatch.push({
    id: `d${now.toString(36)}`, ship: ship.id, crew: sel.crew, target: sel.target,
    start: now, end: now + durationMs(sel.target, sel.crew), loot: rollLoot(sel.target, ship, sel.crew)
  });
  lastGot = null;
  persist();
  render();
  sfx.launch();
}

function receive(id) {
  const d = save.dispatch.find(x => x.id === id);
  if (!d || Date.now() < d.end) return;
  Object.entries(d.loot).forEach(([k, n]) => { save.res[k] = (save.res[k] || 0) + n; });
  save.dispatch = save.dispatch.filter(x => x !== d);
  lastGot = { kind: shipOf(d.ship).kind, crew: d.crew, loot: d.loot };
  persist();
  render();
  sfx.get(Math.max(1, ...Object.keys(d.loot).map(resTier)));
}

$('dpActive').addEventListener('click', (e) => {
  const b = e.target.closest('[data-receive]');
  if (b) receive(b.dataset.receive);
});
$('dpForm').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.pickShip) sel.ship = b.dataset.pickShip;
  if (b.dataset.pickCrew) sel.crew = b.dataset.pickCrew;
  if (b.dataset.pickTarget) sel.target = b.dataset.pickTarget;
  renderForm();
});
$('btnDpGo').addEventListener('click', start);
$('btnDpBack').addEventListener('click', () => { G.mode = 'base'; showScreen('base'); });

onShow('dispatch', () => {
  render();
  clearInterval(timer);
  timer = setInterval(renderActive, 1000);
});
onHide('dispatch', () => { clearInterval(timer); lastGot = null; });
