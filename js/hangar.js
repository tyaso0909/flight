// 格納庫(強化・造船)。左に船の3Dモデル、右に強化の一覧または船の設計図を出す
import { $ } from './dom.js';
import { TYPES, BLUEPRINT, UPGRADES, UPGRADE_COST, MAX_LV, SHIPS, SHIP_ORDER, resShort } from './data.js';
import { save, persist, shipStats, totalLv, ZERO_LV } from './save.js';
import { G } from './state.js';
import { onShow, onHide, showScreen } from './ui.js';
import { onLayout } from './orientation.js';
import { ShipViewer } from './ships.js';

let viewer = null;
let tab = 'up';            // 'up' = 強化 / 'build' = 造船
let preview = null;        // 造船タブで見ている船の種類

const have = (k) => save.res[k] || 0;
const costList = (u, target) => {
  const c = UPGRADE_COST[target];
  const list = [{ k: u.res[0], n: c.main }, { k: u.res[1], n: c.sub }];
  if (c.bp) list.push({ k: BLUEPRINT.key, n: c.bp });
  return list;
};
const shipCost = (kind) => Object.entries(SHIPS[kind].cost || {}).map(([k, n]) => ({ k, n }));
const canPay = (list) => list.every(c => have(c.k) >= c.n);
const costHtml = (list) => list.map(c => `<span class="${have(c.k) < c.n ? 'short' : ''}">${resShort(c.k)} ${c.n}</span>`).join(' / ');

// 強化の効果を「今 → 次」で見せる
function effectText(key, kind, lvNow, lvNext) {
  const a = shipStats(kind, lvNow), b = lvNext ? shipStats(kind, lvNext) : null;
  const f = {
    tank: (s) => `${s.fuel}`,
    engine: (s) => `${Math.round(s.accel)}`,
    eff: (s) => `${s.burn.toFixed(1)}/秒`,
    gyro: (s) => `${Math.round(s.steer * 100)}%`,
    armor: (s) => `${s.maxHull}`
  }[key];
  const label = { tank: '燃料', engine: '加速', eff: '消費', gyro: '旋回', armor: '最大耐久' }[key];
  return b ? `${label} <b>${f(a)}</b> → <b>${f(b)}</b>` : `${label} <b>${f(a)}</b>(最大)`;
}

function renderUpgrade() {
  const kind = save.ship.kind, lv = save.ship.lv;
  $('hgUpgrade').innerHTML = UPGRADES.map(u => {
    const cur = lv[u.key], max = cur >= MAX_LV;
    const next = max ? null : { ...lv, [u.key]: cur + 1 };
    const pips = Array.from({ length: MAX_LV }, (_, i) => `<i class="${i < cur ? 'on' : ''}"></i>`).join('');
    const list = max ? [] : costList(u, cur + 1);
    const ok = !max && canPay(list);
    const btn = max
      ? `<button class="btn up-buy" type="button" disabled>最大</button>`
      : `<button class="btn up-buy${ok ? ' primary' : ''}" type="button" data-up="${u.key}"${ok ? '' : ' disabled'}>強化<span class="cost">${costHtml(list)}</span></button>`;
    return `<div class="up-row">
      <div>
        <div class="up-title"><b>${u.name}</b><span class="lv">Lv${cur}</span><span class="lvpips" aria-hidden="true">${pips}</span></div>
        <div class="up-eff">${u.desc}:${effectText(u.key, kind, lv, next)}</div>
      </div>
      ${btn}
    </div>`;
  }).join('');
}

function renderBuild() {
  const hasWright = save.crew.some(c => c.key === 'shipwright');
  $('hgBuild').innerHTML = SHIP_ORDER.map(kind => {
    const sh = SHIPS[kind], st = shipStats(kind, ZERO_LV), own = kind === save.ship.kind;
    const state = own ? '<span class="sh-state own">使用中</span>'
      : !hasWright ? '<span class="sh-state">造船士が必要</span>'
      : '<span class="sh-state">建造は次の段階で実装</span>';
    const cost = sh.cost ? `<div class="sh-cost">建造:${costHtml(shipCost(kind))}</div>` : '';
    return `<button type="button" class="sh-row" data-ship="${kind}" aria-pressed="${kind === preview}">
      <div>
        <b>${sh.name}</b>
        <div class="sh-desc">${sh.desc}</div>
        <div class="sh-stats"><span>燃料 <b>${st.fuel}</b></span><span>加速 <b>${Math.round(st.accel)}</b></span><span>消費 <b>${st.burn.toFixed(1)}</b></span><span>旋回 <b>${Math.round(st.steer * 100)}%</b></span><span>耐久 <b>${st.maxHull}</b></span></div>
        ${cost}
      </div>
      ${state}
    </button>`;
  }).join('') + '<p class="sh-note">数値は強化前(Lv0)のものです。船を選ぶと左にモデルが表示されます。建造と船の乗り換えは、NPC派遣と一緒に次の段階で作ります。</p>';
}

function renderRes() {
  $('hgRes').innerHTML = TYPES.map(t => `<span>${t.res} <b>${have(t.key)}</b></span>`).join('')
    + `<span>${BLUEPRINT.short} <b>${have(BLUEPRINT.key)}</b></span>`;
}

function showModel() {
  if (!viewer) return;
  if (tab === 'up') {
    viewer.setShip(save.ship.kind, save.ship.lv);
    $('hgBadge').textContent = `強化 Lv ${totalLv()} / ${UPGRADES.length * MAX_LV}`;
    $('hgTitle').textContent = SHIPS[save.ship.kind].name;
  } else {
    const own = preview === save.ship.kind;
    viewer.setShip(preview, own ? save.ship.lv : ZERO_LV);
    $('hgBadge').textContent = own ? '使用中の船' : '設計図';
    $('hgTitle').textContent = SHIPS[preview].name;
  }
}

function render() {
  const up = tab === 'up';
  $('tabUp').setAttribute('aria-selected', String(up));
  $('tabBuild').setAttribute('aria-selected', String(!up));
  $('hgUpgrade').hidden = !up;
  $('hgBuild').hidden = up;
  if (up) renderUpgrade(); else renderBuild();
  renderRes();
  showModel();
}

function buy(key) {
  const u = UPGRADES.find(x => x.key === key);
  const cur = save.ship.lv[key];
  if (cur >= MAX_LV) return;
  const list = costList(u, cur + 1);
  if (!canPay(list)) return;
  const oldMax = shipStats().maxHull;
  list.forEach(c => { save.res[c.k] = have(c.k) - c.n; });
  save.ship.lv[key] = cur + 1;
  // 装甲を強化したら、増えた分だけ今の耐久も増やす
  if (key === 'armor') save.hull += shipStats().maxHull - oldMax;
  persist();
  render();
  if (viewer) viewer.pulse();
}

$('hgUpgrade').addEventListener('click', (e) => {
  const b = e.target.closest('[data-up]');
  if (b && !b.disabled) buy(b.dataset.up);
});
$('hgBuild').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ship]');
  if (!b) return;
  preview = b.dataset.ship;
  render();
});
const switchTab = (t) => { if (tab === t) return; tab = t; document.querySelector('.hg-side').scrollTop = 0; render(); };
$('tabUp').addEventListener('click', () => switchTab('up'));
$('tabBuild').addEventListener('click', () => switchTab('build'));
$('btnHgBack').addEventListener('click', () => { G.mode = 'base'; showScreen('base'); });

onShow('hangar', () => {
  if (!viewer) {
    viewer = new ShipViewer($('shipCanvas'));
    onLayout(() => viewer.resize());
  }
  if (!preview) preview = save.ship.kind;
  render();
  viewer.start();
});
onHide('hangar', () => { if (viewer) viewer.stop(); });
