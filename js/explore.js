// 着陸後の探索(星の地図から探索地点を選ぶ)
import { $, rnd, stars } from './dom.js';
import { KINDS, CREW, resName } from './data.js';
import { save, persist } from './save.js';
import { G } from './state.js';
import { showScreen } from './ui.js';
import { scene, world, clearWorld, resetCamera } from './world.js';

const CRASH_DAMAGE = 30;   // 不時着で減る耐久
const DANGER_DAMAGE = 10;  // 危険地帯の落石で減る耐久
const rarMult = (p) => [1, 1.6, 2.5][p.rar - 1];

function addRes(key, n) {
  save.res[key] = (save.res[key] || 0) + n;
  G.ex.gained[key] = (G.ex.gained[key] || 0) + n;
}

// 着陸演出のあとに呼ばれる
export function beginExplore(p, crash, run) {
  const hullBefore = save.hull;
  if (crash) save.hull = Math.max(0, save.hull - CRASH_DAMAGE);
  persist();
  // 着陸した星だけ残し、探索画面の背景に見せる
  world.planets.filter(q => q !== p).forEach(q => scene.remove(q.group));
  world.planets = [p];
  world.debris.forEach(d => scene.remove(d.mesh));
  world.debris = [];
  const acts = crash ? 1 : 2;
  G.ex = {
    p, crash, hullBefore, ly: Math.round(run.dist / 10), fuel: Math.round(run.fuel), maxFuel: run.maxFuel,
    actions: acts, maxActions: acts, nodes: makeNodes(p), gained: {}, crew: [], log: []
  };
  G.mode = 'explore';
  renderExplore();
  showScreen('explore');
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
  return slots.map(([x, y], i) => ({
    id: i, kind: kinds[i], x: x + rnd(-4, 4), y: y + rnd(-4, 4),
    hidden: i > 0 && Math.random() < 0.35, done: false
  }));
}

function explore(node) {
  const ex = G.ex;
  if (!ex || ex.actions <= 0 || node.done) return;
  const p = ex.p, m = rarMult(p), k = p.type.key;
  node.done = true; node.hidden = false; ex.actions--;
  let text = '', cls = '';
  if (node.kind === 'vein') {
    const bonus = save.crew.some(c => c.key === 'miner') ? 1.3 : 1;
    const n = Math.round(rnd(8, 14) * m * bonus);
    addRes(k, n);
    text = `${p.type.res} ×${n}${bonus > 1 ? '(採掘士のおかげで増量)' : ''}`;
  } else if (node.kind === 'ruin') {
    const n = Math.round(rnd(3, 7) * m);
    addRes(k, n);
    text = `${p.type.res} ×${n}`;
    if (Math.random() < 0.35 + 0.15 * (p.rar - 1)) { addRes('blueprint', 1); text += '、設計図のかけら ×1'; }
  } else if (node.kind === 'village') {
    const n = Math.round(rnd(2, 4) * m);
    addRes(k, n);
    const left = CREW.filter(c => !save.crew.some(s => s.key === c.key));
    if (left.length && Math.random() < 0.6) {
      const c = left[Math.floor(Math.random() * left.length)];
      save.crew.push({ key: c.key, planet: `${p.type.name} ${p.name}` });
      ex.crew.push(c);
      text = `${c.role}の${c.name}が仲間になった。お礼に${p.type.res} ×${n}`;
      cls = 'crew';
    } else {
      text = `${left.length ? '誰もいなかった' : '集落の人から物資をもらった'}。${p.type.res} ×${n}`;
    }
  } else {
    const n = Math.round(rnd(14, 22) * m);
    addRes(k, n);
    text = `${p.type.res} ×${n}`;
    if (Math.random() < 0.45) {
      const before = save.hull;
      save.hull = Math.max(0, save.hull - DANGER_DAMAGE);
      text += `。落石で耐久 ${before} → ${save.hull}`;
      cls = 'bad';
    }
  }
  ex.log.push({ kind: node.kind, text, cls });
  persist();
  renderExplore();
}

const GLYPH = {
  vein: '<path class="glyph" d="M12 5.5L16.5 12L12 18.5L7.5 12Z"/>',
  ruin: '<path class="glyph" d="M6.5 7H17.5V8.8H6.5ZM7.5 9.6H9.3V17H7.5ZM11.1 9.6H12.9V17H11.1ZM14.7 9.6H16.5V17H14.7Z"/>',
  village: '<path class="glyph" d="M6.5 17.5V11.5L12 6.5L17.5 11.5V17.5H13.6V13.8H10.4V17.5Z"/>',
  danger: '<path class="glyph" fill-rule="evenodd" d="M12 5.5L18.5 17.5H5.5ZM11.2 10.2V14H12.8V10.2ZM11.2 15V16.4H12.8V15Z"/>',
  unknown: '<text class="glyph" x="12" y="16.3" text-anchor="middle" font-size="12" font-weight="700">?</text>'
};

function renderExplore() {
  const ex = G.ex, p = ex.p, c = p.type.css;
  $('exTitle').textContent = `${p.type.name} ${p.name}`;
  const tag = $('exTag');
  tag.textContent = ex.crash ? '不時着' : '着陸成功';
  tag.className = 'tag ' + (ex.crash ? 'bad' : 'ok');
  const map = $('exMap');
  map.style.background = `radial-gradient(120% 100% at 30% 15%, ${c}55, transparent 60%), radial-gradient(90% 80% at 80% 90%, ${c}33, transparent 70%), repeating-radial-gradient(circle at 40% 60%, rgba(255,255,255,0.035) 0 2px, transparent 2px 18px), #0a0e16`;
  map.innerHTML = ex.nodes.map(n => {
    const kind = n.hidden ? 'unknown' : n.kind;
    const label = n.hidden ? '未調査' : KINDS[n.kind].name;
    const cls = ['ex-node', n.hidden ? 'unknown' : '', !n.hidden && n.kind === 'danger' ? 'danger' : '', n.done ? 'done' : ''].join(' ');
    const dis = (n.done || ex.actions <= 0) ? ' disabled' : '';
    return `<button type="button" class="${cls}" data-id="${n.id}" style="left:${n.x.toFixed(1)}%;top:${n.y.toFixed(1)}%"${dis} aria-label="${label}${n.done ? '(調査済み)' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="ring" cx="12" cy="12" r="11"/>${GLYPH[kind]}</svg><span>${label}${n.done ? ' 済' : ''}</span></button>`;
  }).join('');
  $('exPips').innerHTML = Array.from({ length: ex.maxActions }, (_, i) => `<i class="pip${i < ex.actions ? ' on' : ''}"></i>`).join('');
  $('exHint').textContent = ex.actions > 0
    ? (ex.crash ? '不時着したため、探索できるのは1回だけです。' : '調べる地点をタップしてください。')
    : '探索を終えました。';
  $('exLog').innerHTML = ex.log.length
    ? ex.log.map(l => `<li class="${l.cls}"><b>${KINDS[l.kind].name}</b> ${l.text}</li>`).join('')
    : '<li class="empty">鉱脈は資源が多く、遺跡では設計図のかけら、集落では仲間に出会えることがあります。危険地帯は資源が多い代わりに機体が傷つくことがあります。</li>';
  $('btnExDone').textContent = ex.actions > 0 ? '切り上げて帰還' : '拠点へ帰還';
}
$('exMap').addEventListener('click', (e) => {
  const b = e.target.closest('.ex-node');
  if (!b || b.disabled || !G.ex) return;
  explore(G.ex.nodes[Number(b.dataset.id)]);
});

function showExploreResult() {
  const ex = G.ex, p = ex.p;
  $('resTitle').textContent = `${p.type.name} ${p.name}`;
  const tag = $('resTag');
  tag.textContent = ex.crash ? '不時着' : '着陸成功';
  tag.className = 'tag ' + (ex.crash ? 'bad' : 'ok');
  const got = Object.keys(ex.gained).map(k => `${resName(k)} ×${ex.gained[k]}`).join('、') || 'なし';
  const rows = [
    ['到達距離', `${ex.ly.toLocaleString('ja-JP')} 光年`],
    ['星のレア度', `<span class="stars">${stars(p.rar)}</span>`],
    ['探索', `${ex.maxActions - ex.actions} / ${ex.maxActions} 回${ex.crash ? '(不時着で1回に減少)' : ''}`],
    ['獲得資源', got],
    ['仲間', ex.crew.length ? ex.crew.map(c => `${c.role} ${c.name}`).join('、') : 'なし'],
    ['残り燃料', `${ex.fuel} / ${ex.maxFuel}`],
    ['耐久', ex.hullBefore === save.hull ? `${save.hull}(損傷なし)` : `${ex.hullBefore} → ${save.hull}`]
  ];
  $('resKv').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  clearWorld();
  G.ex = null;
  G.mode = 'result';
  resetCamera();
  showScreen('result');
}
$('btnExDone').addEventListener('click', () => { if (G.ex) showExploreResult(); });
$('btnHome').addEventListener('click', () => { G.mode = 'base'; showScreen('base'); });
