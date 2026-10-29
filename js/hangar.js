// 格納庫(強化・パーツ・造船)。左に船の3Dモデル、右にタブごとの一覧を出す
import { $ } from './dom.js';
import { BLUEPRINT, UPGRADES, UPGRADE_COST, MAX_LV, SHIPS, SHIP_ORDER, PARTS, PART_CREW, CREW, WEIGHT_BURN, resKey } from './data.js';
import { toList, canPay, pay, costHtml, ownedResHtml } from './resui.js';
import { save, persist, shipStats, totalLv, ZERO_LV, hasCrew } from './save.js';
import { G } from './state.js';
import { onShow, onHide, showScreen } from './ui.js';
import { onLayout } from './orientation.js';
import { ShipViewer } from './ships.js';

let viewer = null;
let tab = 'up';            // 'up' = 強化 / 'parts' = パーツ / 'build' = 造船
let preview = null;        // 造船タブで見ている船の種類

const TABS = { up: ['tabUp', 'hgUpgrade'], parts: ['tabParts', 'hgParts'], build: ['tabBuild', 'hgBuild'] };

// 強化の費用(主・副の素材はレア度つき)
const costList = (u, target) => {
  if (u.costs) return toList(u.costs[target]);
  const c = UPGRADE_COST[target];
  const list = [{ k: resKey(u.res[0], c.main[0]), n: c.main[1] }, { k: resKey(u.res[1], c.sub[0]), n: c.sub[1] }];
  if (c.bp) list.push({ k: BLUEPRINT.key, n: c.bp });
  return list;
};
const slotsOf = () => SHIPS[save.ship.kind].slots;

// 最大耐久が変わる操作のあと、今の耐久を合わせる(増えた分は足し、減ったら上限に収める)
function withHullAdjust(fn) {
  const oldMax = shipStats().maxHull;
  fn();
  const newMax = shipStats().maxHull;
  if (newMax > oldMax) save.hull += newMax - oldMax;
  save.hull = Math.min(save.hull, newMax);
}

// ---------- 強化 ----------
// 強化の効果を「今 → 次」で見せる(付けているパーツ込み)
function effectText(key, kind, lvNow, lvNext) {
  const parts = save.ship.parts;
  const a = shipStats(kind, lvNow, parts), b = lvNext ? shipStats(kind, lvNext, parts) : null;
  const f = {
    tank: (s) => `${s.fuel}`,
    engine: (s) => `${Math.round(s.accel)}`,
    eff: (s) => `${s.burn.toFixed(1)}/秒`,
    gyro: (s) => `${Math.round(s.steer * 100)}%`,
    armor: (s) => `${s.maxHull}`,
    cargo: (s) => `${s.cargo}`
  }[key];
  const label = { tank: '燃料', engine: '加速', eff: '消費', gyro: '旋回', armor: '最大耐久', cargo: '積載' }[key];
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

function buy(key) {
  const u = UPGRADES.find(x => x.key === key);
  const cur = save.ship.lv[key];
  if (cur >= MAX_LV) return;
  const list = costList(u, cur + 1);
  if (!canPay(list)) return;
  withHullAdjust(() => { pay(list); save.ship.lv[key] = cur + 1; });
  persist();
  render();
  if (viewer) viewer.pulse();
}

// ---------- パーツ ----------
function renderParts() {
  const eq = save.ship.parts, slots = slotsOf();
  const st = shipStats();
  const weightPct = Math.round(WEIGHT_BURN * st.weight * 100);
  const head = `<div class="pt-head">
    <span>パーツ枠 <b>${eq.length} / ${slots}</b></span>
    <span>重さ <b>${st.weight}</b> → 燃料消費 <b>+${weightPct}%</b></span>
  </div>`;
  const groups = Object.keys(PART_CREW).map(crewKey => {
    const c = CREW.find(x => x.key === crewKey);
    const unlocked = hasCrew(crewKey);
    const rows = PARTS.filter(p => p.crew === crewKey).map(p => {
      const owned = save.parts.includes(p.key), on = eq.includes(p.key);
      const list = toList(p.cost);
      let btn;
      if (!unlocked) btn = `<span class="sh-state">${c.role}が必要</span>`;
      else if (!owned) {
        const ok = canPay(list);
        btn = `<button class="btn up-buy${ok ? ' primary' : ''}" type="button" data-make="${p.key}"${ok ? '' : ' disabled'}>製作<span class="cost">${costHtml(list)}</span></button>`;
      } else if (on) btn = `<button class="btn up-buy on" type="button" data-unequip="${p.key}">外す<span class="cost">装着中</span></button>`;
      else {
        const full = eq.length >= slots;
        btn = `<button class="btn up-buy" type="button" data-equip="${p.key}"${full ? ' disabled' : ''}>装着<span class="cost">${full ? '枠がいっぱい' : '作成済み'}</span></button>`;
      }
      const w = p.weight > 0 ? `+${p.weight}` : `${p.weight}`;
      return `<div class="up-row${on ? ' equipped' : ''}">
        <div>
          <div class="up-title"><b>${p.name}</b><span class="lv">重さ ${w}</span></div>
          <div class="up-eff">${p.desc}</div>
        </div>
        ${btn}
      </div>`;
    }).join('');
    const title = unlocked ? `${c.role} ${c.name} の${PART_CREW[crewKey]}パーツ` : `${PART_CREW[crewKey]}パーツ(${c.role}が仲間になると作れる)`;
    return `<h3 class="pt-group">${title}</h3>${rows}`;
  }).join('');
  $('hgParts').innerHTML = head + groups;
}

function make(key) {
  const p = PARTS.find(x => x.key === key);
  if (!p || save.parts.includes(key) || !hasCrew(p.crew)) return;
  const list = toList(p.cost);
  if (!canPay(list)) return;
  pay(list);
  save.parts.push(key);
  persist();
  render();
}
function equip(key, on) {
  const eq = save.ship.parts;
  if (on) {
    if (!save.parts.includes(key) || eq.includes(key) || eq.length >= slotsOf()) return;
    withHullAdjust(() => eq.push(key));
  } else {
    if (!eq.includes(key)) return;
    withHullAdjust(() => eq.splice(eq.indexOf(key), 1));
  }
  persist();
  render();
  if (viewer) viewer.pulse();
}

// ---------- 造船 ----------
function renderBuild() {
  const hasWright = hasCrew('shipwright');
  $('hgBuild').innerHTML = SHIP_ORDER.map(kind => {
    const sh = SHIPS[kind], st = shipStats(kind, ZERO_LV), own = kind === save.ship.kind;
    const state = own ? '<span class="sh-state own">使用中</span>'
      : !hasWright ? '<span class="sh-state">造船士が必要</span>'
      : '<span class="sh-state">建造は次の段階で実装</span>';
    const cost = sh.cost ? `<div class="sh-cost">建造:${costHtml(toList(sh.cost))}</div>` : '';
    return `<button type="button" class="sh-row" data-ship="${kind}" aria-pressed="${kind === preview}">
      <div>
        <b>${sh.name}</b>
        <div class="sh-desc">${sh.desc}</div>
        <div class="sh-stats"><span>燃料 <b>${st.fuel}</b></span><span>加速 <b>${Math.round(st.accel)}</b></span><span>消費 <b>${st.burn.toFixed(1)}</b></span><span>旋回 <b>${Math.round(st.steer * 100)}%</b></span><span>耐久 <b>${st.maxHull}</b></span><span>積載 <b>${st.cargo}</b></span><span>パーツ枠 <b>${sh.slots}</b></span></div>
        ${cost}
      </div>
      ${state}
    </button>`;
  }).join('') + '<p class="sh-note">数値は強化前(Lv0)・パーツなしのものです。船を選ぶと左にモデルが表示されます。建造と船の乗り換えは、NPC派遣と一緒に次の段階で作ります。</p>';
}

// ---------- 共通 ----------
function renderRes() {
  $('hgRes').innerHTML = ownedResHtml();
}

function showModel() {
  if (!viewer) return;
  if (tab !== 'build') {
    viewer.setShip(save.ship.kind, save.ship.lv, save.ship.parts);
    $('hgBadge').textContent = tab === 'up'
      ? `強化 Lv ${totalLv()} / ${UPGRADES.length * MAX_LV}`
      : `パーツ ${save.ship.parts.length} / ${slotsOf()}`;
    $('hgTitle').textContent = SHIPS[save.ship.kind].name;
  } else {
    const own = preview === save.ship.kind;
    viewer.setShip(preview, own ? save.ship.lv : ZERO_LV, own ? save.ship.parts : []);
    $('hgBadge').textContent = own ? '使用中の船' : '設計図';
    $('hgTitle').textContent = SHIPS[preview].name;
  }
}

function render() {
  for (const k in TABS) {
    const [btn, panel] = TABS[k];
    $(btn).setAttribute('aria-selected', String(k === tab));
    $(panel).hidden = k !== tab;
  }
  if (tab === 'up') renderUpgrade();
  else if (tab === 'parts') renderParts();
  else renderBuild();
  renderRes();
  showModel();
}

$('hgUpgrade').addEventListener('click', (e) => {
  const b = e.target.closest('[data-up]');
  if (b && !b.disabled) buy(b.dataset.up);
});
$('hgParts').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.make) make(b.dataset.make);
  else if (b.dataset.equip) equip(b.dataset.equip, true);
  else if (b.dataset.unequip) equip(b.dataset.unequip, false);
});
$('hgBuild').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ship]');
  if (!b) return;
  preview = b.dataset.ship;
  render();
});
const switchTab = (t) => { if (tab === t) return; tab = t; document.querySelector('.hg-side').scrollTop = 0; render(); };
$('tabUp').addEventListener('click', () => switchTab('up'));
$('tabParts').addEventListener('click', () => switchTab('parts'));
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
