// 拠点(出撃準備・修理)と「数値の調整」画面
import { $, clamp } from './dom.js';
import { SETTINGS, TYPES, CREW, SHIPS, MAX_LV, UPGRADES, MAX_TIER, FULL_FIX_COST, resKey } from './data.js';
import { cfg, save, persist, shipStats, maxHull, hullEffects, totalLv, resetSave, cargoCap, hasGear, crewBusy } from './save.js';
import { G } from './state.js';
import { onShow, showScreen } from './ui.js';
import { tilt, onFirstTilt } from './input.js';
import { launch } from './flight.js';

const QUICK_FIX_RATE = 0.3; // 応急修理で戻る耐久(最大耐久に対する割合)

export function renderBase() {
  const st = shipStats(), mh = st.maxHull;
  $('bShipName').textContent = SHIPS[save.ship.kind].name;
  $('bShipSub').textContent = `強化 Lv ${totalLv()} / ${UPGRADES.length * MAX_LV} ・ パーツ ${save.ship.parts.length} / ${SHIPS[save.ship.kind].slots}`;
  $('bFuel').textContent = st.fuel;
  $('bFuelBar').style.width = clamp(st.fuel / 300 * 100, 0, 100) + '%';
  $('bHull').textContent = `${save.hull} / ${mh}`;
  const cap = cargoCap();
  $('bCargo').textContent = cap;
  $('bCargoBar').style.width = clamp(cap / 200 * 100, 0, 100) + '%';
  $('bCargoNote').textContent = hasGear('pack') ? `船 ${st.cargo} + 圧縮バッグ 10` : '';
  $('bHullBar').style.width = (save.hull / mh * 100) + '%';
  const fx = hullEffects(), chips = [];
  if (fx.low70) chips.push('旋回性ダウン(耐久70%未満)');
  if (fx.low40) chips.push('燃費悪化(耐久40%未満)');
  $('bChips').innerHTML = chips.map(c => `<span class="chip">${c}</span>`).join('');
  $('bChips').hidden = !chips.length;

  // 素材の表(行=星の属性、列=レア度)
  const tiers = Array.from({ length: MAX_TIER }, (_, i) => i + 1);
  $('resList').innerHTML = `<table class="res-grid">
    <thead><tr><th scope="col"><span class="sr">星</span></th>${tiers.map(t => `<th scope="col" class="rt rt${t}">★${t}</th>`).join('')}</tr></thead>
    <tbody>${TYPES.map(t => `<tr><th scope="row"><span class="dot" style="background:${t.css}"></span>${t.name}</th>${tiers.map(i => {
      const n = save.res[resKey(t.key, i)] || 0;
      return `<td class="${n ? '' : 'zero'}"><span class="rn">${t.items[i - 1]}</span><b>${n}</b></td>`;
    }).join('')}</tr>`).join('')}</tbody>
  </table>
  <p class="bp-line"><span><span class="dot" style="background:var(--amber)"></span>設計図のかけら<small>(遺跡)</small></span><b>${save.res.blueprint || 0}</b></p>`;
  $('crewList').innerHTML = CREW.map(c => {
    const got = save.crew.find(s => s.key === c.key);
    return `<li class="crew${got ? ' on' : ''}" title="${got ? `${got.planet}で出会った` : '集落で出会えることがある'}">
      <span class="crew-role">${c.role}</span><b>${got ? c.name : '未発見'}</b>
      <small>${got ? (crewBusy(c.key) ? '<em class="busy">派遣中</em>' : c.note) : '集落で出会えることがある'}</small>
    </li>`;
  }).join('');
  // ホーム画面に追加していないスマホには、全画面で遊ぶ方法を出す
  const standalone = (window.matchMedia && (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches)) || navigator.standalone;
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  $('pwaHint').hidden = !touch || !!standalone;

  const total = TYPES.reduce((s, t) => s + (save.res[resKey(t.key, 1)] || 0), 0);
  const dead = save.hull <= 0;
  $('btnLaunch').disabled = dead;
  $('btnQuickFix').hidden = save.hull >= Math.ceil(mh * QUICK_FIX_RATE);
  $('btnFullFix').hidden = save.hull >= mh;
  $('btnFullFix').disabled = total < FULL_FIX_COST;
  $('baseNotice').innerHTML = dead ? '<div class="notice">耐久が0のため出撃できません。修理してください。</div>' : '';
  $('ctrlNote').innerHTML = tilt.ok
    ? '<b>操作</b> 端末を傾けて操縦します。出撃した瞬間の持ち方がまっすぐの基準になります。'
    : '<b>操作</b> 傾きセンサーが使えないため、左下のドラッグで操縦します(パソコンは矢印キーとスペース)。スマホで傾き操作を試すには、HTTPSのサイトで開いてください。';
}
onShow('base', renderBase);
onFirstTilt(() => { if (G.mode === 'base') renderBase(); });

$('btnLaunch').addEventListener('click', launch);
$('btnHangar').addEventListener('click', () => { G.mode = 'hangar'; showScreen('hangar'); });
$('btnWorkshop').addEventListener('click', () => { G.mode = 'workshop'; showScreen('workshop'); });
$('btnDispatch').addEventListener('click', () => { G.mode = 'dispatch'; showScreen('dispatch'); });

// 派遣ボタンに、帰ってきた件数・派遣中の件数を出す(拠点にいる間は15秒ごとに更新)
function renderDispatchBadge() {
  const now = Date.now(), done = save.dispatch.filter(d => now >= d.end).length, going = save.dispatch.length - done;
  const b = $('dispatchBadge');
  b.textContent = done ? `${done}件 帰還!` : going ? `${going}件 派遣中` : '仲間を送り出す';
  $('btnDispatch').classList.toggle('alert', done > 0);
}
onShow('base', renderDispatchBadge);
setInterval(() => { if (G.mode === 'base') renderDispatchBadge(); }, 15000);

// 応急修理(無料):出撃できる最低ラインまで戻す。ステータスダウンは残る
$('btnQuickFix').addEventListener('click', () => {
  save.hull = Math.max(save.hull, Math.ceil(maxHull() * QUICK_FIX_RATE));
  persist(); renderBase();
});
// 完全修理:★1の素材を多く持っているものから順に合計20使って、最大まで戻す
$('btnFullFix').addEventListener('click', () => {
  let cost = FULL_FIX_COST;
  const byStock = TYPES.map(t => resKey(t.key, 1)).sort((a, b) => (save.res[b] || 0) - (save.res[a] || 0));
  for (const k of byStock) {
    const take = Math.min(cost, save.res[k] || 0);
    save.res[k] = (save.res[k] || 0) - take; cost -= take;
    if (!cost) break;
  }
  save.hull = maxHull();
  persist(); renderBase();
});

// ---------- 数値の調整 ----------
$('setGrid').innerHTML = SETTINGS.map(s => `
  <div class="set-row">
    <label for="set-${s.key}"><span>${s.label}</span><output id="out-${s.key}"></output></label>
    <input type="range" id="set-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">
    <small>${s.hint}</small>
  </div>`).join('');
function syncSettings() {
  SETTINGS.forEach(s => { $('set-' + s.key).value = cfg[s.key]; $('out-' + s.key).textContent = cfg[s.key]; });
  $('invX').checked = cfg.invX; $('invY').checked = cfg.invY;
}
SETTINGS.forEach(s => {
  $('set-' + s.key).addEventListener('input', (e) => { cfg[s.key] = parseFloat(e.target.value); $('out-' + s.key).textContent = cfg[s.key]; persist(); });
});
$('invX').addEventListener('change', (e) => { cfg.invX = e.target.checked; persist(); });
$('invY').addEventListener('change', (e) => { cfg.invY = e.target.checked; persist(); });
onShow('settings', syncSettings);
$('btnSettings').addEventListener('click', () => { G.mode = 'settings'; showScreen('settings'); });
$('btnSetClose').addEventListener('click', () => { G.mode = 'base'; showScreen('base'); });
$('btnSetReset').addEventListener('click', () => { SETTINGS.forEach(s => { cfg[s.key] = s.def; }); cfg.invX = cfg.invY = false; persist(); syncSettings(); });

// セーブデータを最初からにする(画面内で2回押して確定)
const wipe = $('btnWipe');
let wipeArmed = false, wipeTimer = 0;
wipe.addEventListener('click', () => {
  if (!wipeArmed) {
    wipeArmed = true;
    wipe.textContent = 'もう一度押すと消えます';
    clearTimeout(wipeTimer);
    wipeTimer = setTimeout(() => { wipeArmed = false; wipe.textContent = 'セーブデータを最初からにする'; }, 3000);
    return;
  }
  wipeArmed = false; clearTimeout(wipeTimer);
  wipe.textContent = 'セーブデータを最初からにする';
  resetSave();
  G.mode = 'base'; showScreen('base');
});
