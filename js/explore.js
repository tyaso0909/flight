// 着陸後の探索(星の地図から探索地点を選ぶ)
// 手に入れた素材はいったん「積み荷」に入れ、帰還するときに積載量の範囲で持ち帰る
// 探索のあとは「次の星へ」で残りの燃料のまま旅を続けられる(積み荷は1回の出撃で共通)
import { $, rnd, stars } from './dom.js';
import { KINDS, CREW, SPECIAL, TIER_WEIGHTS, TIER_QTY, MAX_TIER, BLUEPRINT, resKey, resTier, gearName, takeoffCost } from './data.js';
import { dropRow } from './resui.js';
import { save, persist, partFx, hasGear, hasCrew, crewHere, maxHull } from './save.js';
import { G } from './state.js';
import { showScreen } from './ui.js';
import { scene, world, clearWorld, resetCamera } from './world.js';
import { sfx } from './audio.js';
import { terrainURL } from './terrain.js';
import { record, checkAchievements } from './records.js';
import { relaunch } from './flight.js';

const DANGER_DAMAGE = 10;  // 危険地帯の落石で減る耐久
const rarMult = (p) => [1, 1.6, 2.5][p.rar - 1];

// 積み荷に入れる(設計図のかけらは積載量に数えない)
function addLoot(key, n) {
  G.trip.gained[key] = (G.trip.gained[key] || 0) + n;
}
const cargoUsed = (gained) => Object.entries(gained).reduce((s, [k, n]) => s + (k === BLUEPRINT.key ? 0 : n), 0);

// 着陸演出のあとに呼ばれる
export function beginExplore(p, run) {
  save.best = Math.max(save.best || 0, Math.round(run.dist / 10));  // 派遣の「遠く」に使う
  persist();
  // 着陸した星だけ残し、探索画面の背景に見せる
  world.planets.filter(q => q !== p).forEach(q => scene.remove(q.group));
  world.planets = [p];
  world.debris.forEach(d => scene.remove(d.mesh));
  world.debris = [];
  G.trip.stops.push({ name: `${p.type.name} ${p.name}`, rar: p.rar, ly: Math.round(run.dist / 10) });
  G.ex = { p, ly: Math.round(run.dist / 10), actions: 2, maxActions: 2, nodes: makeNodes(p), log: [] };
  record.land(p);
  G.mode = 'explore';
  renderExplore();
  showScreen('explore');
  checkAchievements();
}

function makeNodes(p) {
  const n = 3 + (p.rar >= 2 ? 1 : 0) + (p.rar === 3 ? 1 : 0);
  const slots = [[17, 30], [46, 24], [78, 32], [24, 72], [55, 70], [84, 74]]
    .map(s => [s, Math.random()]).sort((a, b) => a[1] - b[1]).slice(0, n).map(s => s[0]);
  const ws = { vein: 40, ruin: 20 + (p.rar - 1) * 8, village: 22, danger: 18 };
  const total = Object.values(ws).reduce((a, b) => a + b, 0);
  const pick = () => { let r = Math.random() * total; for (const k in ws) { r -= ws[k]; if (r < 0) return k; } return 'vein'; };
  const kinds = slots.map(pick);
  if (!kinds.includes('vein')) kinds[0] = 'vein';
  // 特殊エリア(装備がないと入れない)。レアな星ほど出やすい
  if (Math.random() < 0.35 + 0.15 * (p.rar - 1)) kinds[kinds.length - 1] = 'special';
  const goggles = hasGear('goggles');
  return slots.map(([x, y], i) => ({
    id: i, kind: kinds[i], x: x + rnd(-4, 4), y: y + rnd(-4, 4),
    hidden: !goggles && kinds[i] !== 'special' && i > 0 && Math.random() < 0.35, done: false
  }));
}

// ---------- 素材が手に入る ----------
function rollTier(p) {
  const w = TIER_WEIGHTS[p.rar], total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i + 1; }
  return 1;
}
// shift = レア度を何段上げるか、mult = 量の倍率、upChance = さらに1段上がる確率
function drop(p, { shift = 0, mult = 1, upChance = 0 } = {}) {
  let tier = Math.min(MAX_TIER, rollTier(p) + shift);
  if (upChance && Math.random() < upChance) tier = Math.min(MAX_TIER, tier + 1);
  const n = Math.max(1, Math.round(rnd(4, 7) * rarMult(p) * TIER_QTY[tier] * mult));
  const key = resKey(p.type.key, tier);
  addLoot(key, n);
  return { key, n };
}
// 同じ素材をまとめ、レア度の高い順に並べる
function merge(drops) {
  const sum = {};
  drops.forEach(d => { sum[d.key] = (sum[d.key] || 0) + d.n; });
  return Object.entries(sum).map(([key, n]) => ({ key, n })).sort((a, b) => resTier(b.key) - resTier(a.key));
}

const drillMult = () => hasGear('drill2') ? 1.6 : hasGear('drill1') ? 1.3 : 1;

function explore(node) {
  const ex = G.ex;
  if (!ex || ex.actions <= 0 || node.done) return;
  const p = ex.p;
  if (node.kind === 'special' && !hasGear(SPECIAL[p.type.key].gear)) return;
  node.done = true; node.hidden = false; ex.actions--;
  let drops = [], cls = '', label = KINDS[node.kind].name;
  const notes = [];  // 素材以外の出来事 { text, cls }
  if (node.kind === 'vein') {
    const miner = crewHere('miner') ? 1.3 : 1;  // 派遣中の採掘士は効果なし
    const opt = { mult: drillMult() * miner, upChance: hasGear('drill2') ? 0.3 : 0 };
    drops = [drop(p, opt), drop(p, opt)];
    const by = [];
    if (miner > 1) by.push('採掘士');
    if (drillMult() > 1) by.push(hasGear('drill2') ? '精密ドリル' : '強化ドリル');
    if (by.length) notes.push({ text: `${by.join('と')}のおかげで増量`, cls: '' });
  } else if (node.kind === 'ruin') {
    drops = [drop(p)];
    const bp = 0.35 + 0.15 * (p.rar - 1) + (hasGear('goggles') ? 0.15 : 0);
    if (Math.random() < bp) { addLoot(BLUEPRINT.key, 1); drops.push({ key: BLUEPRINT.key, n: 1 }); }
    // まれにワープセル(派遣の時短に使う。積み荷には数えない)
    if (Math.random() < 0.05) { save.items.warp++; notes.push({ text: 'ワープセルを見つけた(派遣の時間を短くできる)', cls: 'good' }); }
  } else if (node.kind === 'village') {
    drops = [drop(p, { mult: 0.6 })];
    const left = CREW.filter(c => !hasCrew(c.key));
    if (left.length && Math.random() < 0.6) {
      const c = left[Math.floor(Math.random() * left.length)];
      save.crew.push({ key: c.key, planet: `${p.type.name} ${p.name}` });
      G.trip.crew.push(c);
      notes.push({ text: `${c.role}の${c.name}が仲間になった(お礼に素材をもらった)`, cls: 'good' });
      cls = 'crew';
    } else {
      notes.push({ text: left.length ? '誰もいなかった' : '集落の人から物資をもらった', cls: '' });
    }
  } else if (node.kind === 'danger') {
    drops = [drop(p, { shift: 1 }), drop(p, { shift: 1 })];
    const rockfall = Math.random() < 0.45;
    if (rockfall && partFx().dangerSafe) {
      notes.push({ text: '落石があったが、耐熱シールドで無傷', cls: 'good' });
    } else if (rockfall) {
      const before = save.hull;
      save.hull = Math.max(0, save.hull - DANGER_DAMAGE);
      record.damage();
      notes.push({ text: `落石で耐久 ${before} → ${save.hull}`, cls: 'bad' });
      cls = 'bad';
    }
  } else {
    label = SPECIAL[p.type.key].name;
    drops = [drop(p, { shift: 2, mult: 1.2 }), drop(p, { shift: 2, mult: 1.2 })];
    cls = 'special';
  }
  ex.log.unshift({ label, drops: merge(drops), notes, cls });
  record.explore(node.kind, p.type.key);
  G.trip.explores++;
  // 一番レアな素材の音。仲間が加わったときと落石のときは別の音
  const top = Math.max(1, ...drops.map(d => resTier(d.key)));
  if (cls === 'crew') sfx.crew(); else sfx.get(top);
  if (cls === 'bad') setTimeout(() => sfx.hit(), 250);
  checkAchievements();
  persist();
  renderExplore();
}

// ---------- 画面 ----------
const GLYPH = {
  vein: '<path class="glyph" d="M12 5.5L16.5 12L12 18.5L7.5 12Z"/>',
  ruin: '<path class="glyph" d="M6.5 7H17.5V8.8H6.5ZM7.5 9.6H9.3V17H7.5ZM11.1 9.6H12.9V17H11.1ZM14.7 9.6H16.5V17H14.7Z"/>',
  village: '<path class="glyph" d="M6.5 17.5V11.5L12 6.5L17.5 11.5V17.5H13.6V13.8H10.4V17.5Z"/>',
  danger: '<path class="glyph" fill-rule="evenodd" d="M12 5.5L18.5 17.5H5.5ZM11.2 10.2V14H12.8V10.2ZM11.2 15V16.4H12.8V15Z"/>',
  special: '<path class="glyph" d="M12 5L13.9 9.6L18.8 10L15.1 13.2L16.2 18L12 15.4L7.8 18L8.9 13.2L5.2 10L10.1 9.6Z"/>',
  locked: '<path class="glyph" fill-rule="evenodd" d="M8 11V9.2A4 4 0 0 1 16 9.2V11H17V18H7V11ZM9.6 11H14.4V9.2A2.4 2.4 0 0 0 9.6 9.2Z"/>',
  unknown: '<text class="glyph" x="12" y="16.3" text-anchor="middle" font-size="12" font-weight="700">?</text>'
};

function renderCargo() {
  const trip = G.trip, used = cargoUsed(trip.gained), over = used - trip.cap;
  $('exCargoNum').textContent = `${used} / ${trip.cap}`;
  $('exCargoNum').classList.toggle('over', over > 0);
  $('exCargoFill').style.width = Math.min(100, used / trip.cap * 100) + '%';
  $('exCargoBar').classList.toggle('over', over > 0);
  const warn = $('exCargoWarn');
  warn.hidden = over <= 0;
  if (over > 0) warn.textContent = `積載量を ${over} 超えています。帰還するとき、★の低い素材から ${over} 個置いていきます。`;
}

function renderExplore() {
  const ex = G.ex, p = ex.p, c = p.type.css, sp = SPECIAL[p.type.key];
  $('exTitle').textContent = `${p.type.name} ${p.name}`;
  const tag = $('exTag'), nth = G.trip.stops.length;
  tag.textContent = nth > 1 ? `${nth}つ目の星` : '着陸成功';
  tag.className = 'tag ok';
  const map = $('exMap');
  map.style.background = `radial-gradient(120% 100% at 30% 15%, ${c}33, transparent 60%), url(${terrainURL(p.type.key, p.name)}) center / cover no-repeat, #0a0e16`;
  map.innerHTML = ex.nodes.map(n => {
    const isSp = n.kind === 'special';
    const locked = isSp && !hasGear(sp.gear);
    const glyph = n.hidden ? 'unknown' : locked ? 'locked' : n.kind;
    const label = n.hidden ? '未調査' : isSp ? sp.name : KINDS[n.kind].name;
    const sub = locked ? `<small>要:${gearName(sp.gear)}</small>` : '';
    const cls = ['ex-node', n.hidden ? 'unknown' : '', !n.hidden && n.kind === 'danger' ? 'danger' : '',
      isSp ? 'special' : '', locked ? 'locked' : '', n.done ? 'done' : ''].join(' ');
    const dis = (n.done || locked || ex.actions <= 0) ? ' disabled' : '';
    const aria = `${label}${locked ? `(${gearName(sp.gear)}が必要)` : ''}${n.done ? '(調査済み)' : ''}`;
    return `<button type="button" class="${cls}" data-id="${n.id}" style="left:${n.x.toFixed(1)}%;top:${n.y.toFixed(1)}%"${dis} aria-label="${aria}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="ring" cx="12" cy="12" r="11"/>${GLYPH[glyph]}</svg><span>${label}${n.done ? ' 済' : ''}${sub}</span></button>`;
  }).join('');
  $('exPips').innerHTML = Array.from({ length: ex.maxActions }, (_, i) => `<i class="pip${i < ex.actions ? ' on' : ''}"></i>`).join('');
  renderCargo();
  const run = G.run, fuel = Math.floor(run.fuel), cost = takeoffCost(p);
  const fuelOk = fuel > cost, canGo = fuelOk && save.hull > 0;
  $('exHint').textContent = ex.actions > 0 ? '調べる地点をタップしてください。'
    : save.hull <= 0 ? '耐久が0のため、これ以上は飛べません。拠点へ帰還してください。'
    : !fuelOk ? `この星から飛び立つには燃料が ${cost} より多く必要です。拠点へ帰還してください。`
    : '探索を終えました。次の星へ向かうか、拠点へ帰還します。';
  // ログ(新しいものが上)。素材は1行ずつ「色 / 名前 / ★ / +数」で並べる
  $('exLog').innerHTML = ex.log.length
    ? ex.log.map((l, i) => `<li class="${l.cls}${i === 0 ? ' latest' : ''}">
        <div class="lg-head"><b>${l.label}</b>${i === 0 ? '<span class="lg-new">いま</span>' : ''}</div>
        ${l.drops.length ? `<ul class="drops">${l.drops.map(d => dropRow(d.key, `+${d.n}`)).join('')}</ul>` : ''}
        ${l.notes.map(nt => `<p class="lg-note ${nt.cls}">${nt.text}</p>`).join('')}
      </li>`).join('')
    : '<li class="empty">鉱脈は素材が多く、遺跡では設計図のかけら、集落では仲間に出会えることがあります。危険地帯はレアな素材が出やすい代わりに機体が傷つくことがあります。★の付いた特殊エリアには、専用の装備がないと入れません。</li>';
  $('btnExDone').innerHTML = `拠点へ帰還<small>積み荷を持ち帰る</small>`;
  const next = $('btnExNext');
  next.disabled = !canGo;
  next.innerHTML = `${ex.actions > 0 ? '切り上げて' : ''}次の星へ<small>離陸 燃料−${cost}(${fuel} → ${Math.max(0, fuel - cost)})・耐久 ${save.hull}</small>`;
  $('btnExDone').classList.toggle('primary', !canGo);
  next.classList.toggle('primary', canGo);
}
$('exMap').addEventListener('click', (e) => {
  const b = e.target.closest('.ex-node');
  if (!b || b.disabled || !G.ex) return;
  explore(G.ex.nodes[Number(b.dataset.id)]);
});

// 積載量を超えた分を、★の低い素材から置いていく
function packCargo(gained, cap) {
  const kept = { ...gained }, left = {};
  let over = cargoUsed(gained) - cap;
  const order = Object.keys(gained).filter(k => k !== BLUEPRINT.key).sort((a, b) => resTier(a) - resTier(b) || gained[a] - gained[b]);
  for (const k of order) {
    if (over <= 0) break;
    const take = Math.min(over, kept[k]);
    kept[k] -= take; left[k] = take; over -= take;
    if (!kept[k]) delete kept[k];
  }
  return { kept, left };
}

// 出撃を終えて拠点へ(reason:home = 自分で帰還、fuel = 燃料切れ、hull = 機体の損傷、abort = 飛行中に帰還)
const REASON = {
  home: ['帰還', 'ok'], abort: ['途中で帰還', 'ok'], fuel: ['燃料切れで帰還', 'warn'], hull: ['機体損傷で帰還', 'bad']
};
export function finishTrip(reason) {
  const trip = G.trip, run = G.run;
  const { kept, left } = packCargo(trip.gained, trip.cap);
  Object.entries(kept).forEach(([k, n]) => { save.res[k] = (save.res[k] || 0) + n; });
  save.best = Math.max(save.best || 0, Math.round(run.dist / 10));
  record.loot(kept, cargoUsed(kept) >= trip.cap);
  record.trip(trip.stops.length, reason);
  persist();

  const n = trip.stops.length;
  $('resTitle').textContent = n === 0 ? '星に寄らずに帰還' : n === 1 ? trip.stops[0].name : `${n}つの星を探査`;
  const tag = $('resTag');
  tag.textContent = REASON[reason][0];
  tag.className = 'tag ' + REASON[reason][1];
  const list = (obj, sign) => {
    const ks = Object.keys(obj).sort((a, b) => resTier(b) - resTier(a));
    return ks.length ? `<ul class="drops">${ks.map(k => dropRow(k, `${sign}${obj[k]}`)).join('')}</ul>` : 'なし';
  };
  const keptN = cargoUsed(kept), leftN = cargoUsed(left);
  const rows = [
    ['到達距離', `${Math.round(run.dist / 10).toLocaleString('ja-JP')} 光年`],
    ['寄った星', n ? `<ol class="stops">${trip.stops.map(st => `<li>${st.name} <span class="stars">${stars(st.rar)}</span></li>`).join('')}</ol>` : 'なし'],
    ['探索', `${trip.explores} か所`],
    ['仲間', trip.crew.length ? trip.crew.map(c => `${c.role} ${c.name}`).join('、') : 'なし'],
    ['残り燃料', `${Math.round(run.fuel)} / ${Math.round(run.maxFuel)}`],
    ['耐久', trip.hullStart === save.hull ? `${save.hull}(損傷なし)` : `${trip.hullStart} → ${save.hull}`]
  ];
  $('resKv').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  // 右側:持ち帰った素材と、積載オーバーで置いてきた素材
  $('resLoot').innerHTML = `<h2>持ち帰った素材<span class="loot-n">${keptN} / ${trip.cap}</span></h2>${list(kept, '+')}`
    + (leftN ? `<h2 class="left">置いてきた素材<span class="loot-n">積載オーバー ${leftN}</span></h2><div class="left-list">${list(left, '−')}</div>` : '');
  clearWorld();
  G.ex = null;
  G.mode = 'result';
  resetCamera();
  showScreen('result');
  checkAchievements();
}
$('btnExDone').addEventListener('click', () => { if (G.ex) finishTrip('home'); });
$('btnExNext').addEventListener('click', () => {
  if (!G.ex || save.hull <= 0) return;
  const cost = takeoffCost(G.ex.p);
  if (Math.floor(G.run.fuel) > cost) relaunch(cost);
});
$('btnHome').addEventListener('click', () => { G.mode = 'base'; showScreen('base'); });
