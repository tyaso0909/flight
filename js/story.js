// 物語の進行と物語画面、信号(サブミッション)
// 拠点に戻るたびに「まだ見ていない章」「見つけた信号の報告」「新しく受信した信号」をまとめて再生する
import { $ } from './dom.js';
import { CREW, TYPES, BLUEPRINT, resKey, resName } from './data.js';
import { save, persist, hasCrew } from './save.js';
import { G } from './state.js';
import { onShow, showScreen } from './ui.js';
import { onLayout } from './orientation.js';
import { paintArt } from './story-art.js';
import { CHAPTERS, SIDE, SIDE_MAX, CORE } from './story-data.js';
import { sfx } from './audio.js';
import { setPlanetBias } from './world.js';

const story = () => save.story;
const seen = (id) => story().seen.includes(id);
const NAMES = { pico: 'ピコ', garan: 'ガラン', ella: 'エラ(記録)', sys: '' };
CREW.forEach(c => { NAMES[c.key] = c.name; });
const typeName = (k) => (k ? TYPES.find(t => t.key === k).name : '星');

// 信号の条件の文(例:1,200光年より先の火山星に着陸)
export const sideGoal = (m) => `${m.ly.toLocaleString('ja-JP')}光年より先の${typeName(m.type)}${m.rar ? `(★${m.rar}以上)` : ''}に着陸`;
const matches = (m, p, ly) => ly >= m.ly && (!m.type || p.type.key === m.type) && p.rar >= (m.rar || 1);

// ---------- 報酬 ----------
function grant(reward) {
  const out = [];
  for (const [k, n] of Object.entries(reward)) {
    if (k === 'warp') { save.items.warp += n; out.push(`ワープセル ×${n}`); }
    else if (k === 'credits') { save.credits += n; out.push(`${n} Cr`); }
    else if (k === 'r5') {
      for (let i = 0; i < n; i++) {
        const key = resKey(TYPES[Math.floor(Math.random() * TYPES.length)].key, 5);
        save.res[key] = (save.res[key] || 0) + 1;
        save.stats.tier5[key.replace(/\d$/, '')] = true;
        out.push(`${resName(key)} ×1`);
      }
    } else {
      save.res[k] = (save.res[k] || 0) + n;
      out.push(`${k === BLUEPRINT.key ? '設計図のかけら' : resName(k)} ×${n}`);
    }
  }
  return out.join('、');
}

// ---------- 場面を作る ----------
const chapterScene = (ch) => ({ eyebrow: ch.eyebrow, title: ch.title, art: ch.art, lines: ch.lines });
const sideIntro = (m) => ({ eyebrow: `${m.kind}を受信`, title: m.title, art: 'signal', lines: [...m.intro, ['sys', `目標:${sideGoal(m)}。「信号」の画面でいつでも確認できます。`]] });
const sideDone = (m, rewardText) => ({ eyebrow: `${m.kind}・解決`, title: m.title, art: 'signal', lines: [...m.done, ...(rewardText ? [['sys', `手に入れたもの:${rewardText}`]] : [])] });

// 拠点に戻ったときに再生する場面をまとめる(見たことにして、報酬もここで渡す)
function buildQueue() {
  const st = story(), out = [];
  const ctx = { best: save.best || 0, ready: st.ready, lit: st.lit, seen };
  // 本編は順番どおり。条件を満たしていない章があればそこで止める(「暗い灯台」は飛ばせる)
  for (const ch of CHAPTERS) {
    if (seen(ch.id)) continue;
    if (ch.id === 'dark' && (ctx.ready || ctx.lit)) continue;
    if (!ch.when(ctx)) { if (ch.id === 'dark') continue; break; }
    st.seen.push(ch.id);
    if (ch.reward && ch.reward.coreBp) st.coreBp = true;
    if (ch.reward && ch.reward.lit) {
      st.lit = true; st.ready = false; ctx.lit = true; ctx.ready = false;
      save.items.core = Math.max(0, save.items.core - 1);
    }
    out.push(chapterScene(ch));
  }
  // 見つけた信号の報告
  st.side.found.forEach(id => {
    const m = SIDE.find(x => x.id === id);
    if (!m) return;
    st.side.done.push(id);
    out.push(sideDone(m, grant(m.reward)));
  });
  st.side.found = [];
  // 新しい信号の受信(序章のあと、同時に SIDE_MAX 件まで)
  if (seen('prologue')) {
    const busy = new Set([...st.side.active, ...st.side.done]);
    for (const m of SIDE) {
      if (st.side.active.length >= SIDE_MAX) break;
      if (busy.has(m.id) || (save.best || 0) < m.unlock) continue;
      st.side.active.push(m.id);
      out.push(sideIntro(m));
    }
  }
  if (out.length) persist();
  return out;
}

// 拠点に入ったときに呼ぶ。再生する場面があれば物語画面へ切り替えて true
export function runStory() {
  const q = buildQueue();
  if (!q.length) return false;
  setTimeout(() => playScenes(q, () => { G.mode = 'base'; showScreen('base'); }), 0);
  return true;
}

// ---------- 星に着陸したとき・飛行中 ----------
// 着陸した星が受信中の信号の発信源なら、見つけたことにする
export function onLanding(p, ly) {
  const st = story(), hit = [];
  st.side.active.slice().forEach(id => {
    const m = SIDE.find(x => x.id === id);
    if (m && matches(m, p, ly)) {
      st.side.active = st.side.active.filter(x => x !== id);
      st.side.found.push(id);
      hit.push(m);
    }
  });
  if (hit.length) persist();
  return hit;
}
// 飛行中:この星が信号の発信源か(計器盤に印を出す)
export function signalFor(p, ly) {
  return story().side.active.map(id => SIDE.find(x => x.id === id)).find(m => m && matches(m, p, ly)) || null;
}
// 星の出方:受信中の信号の星が、条件の距離を越えると少し出やすくなる
export function planetBias(ly) {
  const ms = story().side.active.map(id => SIDE.find(x => x.id === id)).filter(m => m && ly >= m.ly);
  if (!ms.length || Math.random() > 0.3) return null;
  const m = ms[Math.floor(Math.random() * ms.length)];
  return { type: m.type, rar: m.rar || 0 };
}
// 飛行中に、物語の節目を越えたか(帰還すると物語が進む、と知らせる)
export function storyMilestone(ly) {
  const ch = CHAPTERS.find(c => c.ly && !seen(c.id) && ly >= c.ly && (save.best || 0) < c.ly);
  return ch || null;
}
export const storyLit = () => story().lit;
setPlanetBias((ly) => planetBias(ly));

// ---------- 物語画面 ----------
let scenes = [], si = 0, lines = [], li = 0, art = '', done = null, typing = 0, full = '';
const art$ = $('storyArt');

function visibleLines(ls) {
  return ls.filter(([who]) => !CREW.some(c => c.key === who) || hasCrew(who));
}
function setArt(key) {
  if (!key || key === art) return;
  art = key;
  art$.classList.remove('show'); void art$.offsetWidth;
  paintArt(art$, key);
  art$.classList.add('show');
}
function showLine() {
  const [who, text, a] = lines[li];
  if (a) setArt(a);
  const name = who.startsWith('@') ? who.slice(1) : (NAMES[who] ?? '');
  $('storyWho').textContent = name;
  $('storyWho').hidden = !name;
  $('storyBox').classList.toggle('narr', !name);
  $('storyBox').classList.toggle('log', who === 'ella');
  full = text;
  clearInterval(typing);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let n = reduce ? text.length : 0;
  const el = $('storyText');
  el.textContent = text.slice(0, n);
  $('storyBox').classList.toggle('typing', n < text.length);
  typing = setInterval(() => {
    n = Math.min(text.length, n + 1);
    el.textContent = text.slice(0, n);
    if (n >= text.length) { clearInterval(typing); $('storyBox').classList.remove('typing'); }
  }, 32);
  $('storyCount').textContent = `${li + 1} / ${lines.length}`;
}
function startScene() {
  const sc = scenes[si];
  lines = visibleLines(sc.lines); li = 0; art = '';
  $('storyEyebrow').textContent = sc.eyebrow;
  $('storyTitle').textContent = sc.title;
  setArt(sc.art);
  const t = $('storyTitleCard');
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  showLine();
}
function advance() {
  if ($('storyBox').classList.contains('typing')) {
    clearInterval(typing);
    $('storyText').textContent = full;
    $('storyBox').classList.remove('typing');
    return;
  }
  li++;
  if (li < lines.length) { showLine(); return; }
  nextScene();
}
function nextScene() {
  si++;
  if (si < scenes.length) { startScene(); return; }
  clearInterval(typing);
  const cb = done; done = null;
  if (cb) cb();
}
export function playScenes(list, onEnd) {
  scenes = list; si = 0; done = onEnd;
  $('storyLog').hidden = true;
  G.mode = 'story';
  showScreen('story');
  sfx.crew();
  startScene();
}
// ログ:この場面のここまでのセリフを読み返す
function openLog() {
  const esc = (t) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  $('storyLogList').innerHTML = lines.slice(0, li + 1).map(([who, text]) => {
    const name = who.startsWith('@') ? who.slice(1) : (NAMES[who] ?? '');
    return `<li class="${who === 'ella' ? 'log' : name ? '' : 'narr'}">${name ? `<b>${esc(name)}</b>` : ''}<span>${esc(text)}</span></li>`;
  }).join('');
  $('storyLog').hidden = false;
  const l = $('storyLogList'); l.scrollTop = l.scrollHeight;
}
$('scrStory').addEventListener('click', (e) => {
  if (!$('storyLog').hidden) {
    if (e.target.closest('#btnStoryLogClose') || !e.target.closest('.sy-log')) $('storyLog').hidden = true;
    return;
  }
  if (e.target.closest('#btnStoryLog')) { openLog(); return; }
  if (e.target.closest('#btnStorySkip')) { sfx.click(); nextScene(); return; }
  advance();
});
document.addEventListener('keydown', (e) => {
  if (G.mode !== 'story') return;
  if (!$('storyLog').hidden) { if (e.code === 'Escape') $('storyLog').hidden = true; return; }
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); advance(); }
  if (e.code === 'Escape') nextScene();
});
onLayout(() => { if (G.mode === 'story' && art) { const k = art; art = ''; setArt(k); } });

// ---------- 信号と物語の画面 ----------
function renderSignals() {
  const st = story();
  const act = st.side.active.map(id => SIDE.find(x => x.id === id)).filter(Boolean);
  const card = (m, state) => `<li class="sg-card ${state}">
      <div class="sg-head"><span class="sg-kind">${m.kind}</span><b>${m.title}</b></div>
      <p class="sg-goal">${state === 'done' ? '解決済み' : `目標:${sideGoal(m)}`}</p>
      ${state === 'done' ? `<button class="btn" type="button" data-replay-side="${m.id}">見直す</button>` : `<button class="btn" type="button" data-replay-intro="${m.id}">通信を聞く</button>`}
    </li>`;
  $('sgActive').innerHTML = act.length ? act.map(m => card(m, 'active')).join('')
    : `<li class="sg-empty">${seen('prologue') ? '今は受信している信号はありません。遠くへ行くと、新しい信号が届くことがあります。' : '物語の序章のあとで、信号が届くようになります。'}</li>`;
  const doneList = st.side.done.map(id => SIDE.find(x => x.id === id)).filter(Boolean);
  $('sgDone').innerHTML = doneList.length ? doneList.map(m => card(m, 'done')).join('') : '<li class="sg-empty">まだありません。</li>';
  $('sgDoneCount').textContent = `${doneList.length} / ${SIDE.length}`;
  // 本編
  let nextShown = false;
  $('sgStory').innerHTML = CHAPTERS.filter(ch => ch.id !== 'dark' || seen('dark')).map(ch => {
    if (seen(ch.id)) return `<li class="sg-ch seen"><span class="sg-ep">${ch.eyebrow}</span><b>${ch.title}</b><button class="btn" type="button" data-replay="${ch.id}">見直す</button></li>`;
    if (nextShown) return `<li class="sg-ch locked"><span class="sg-ep">${ch.eyebrow}</span><b>???</b></li>`;
    nextShown = true;
    const hint = ch.id === 'final' ? '灯火の核を作り、積んだまま10,000光年より先へ'
      : ch.ly ? `${ch.ly.toLocaleString('ja-JP')}光年に到達して拠点へ帰る` : '';
    return `<li class="sg-ch next"><span class="sg-ep">${ch.eyebrow}</span><b>???</b><span class="sg-hint">次の手がかり:${hint}</span></li>`;
  }).join('');
  $('sgCore').innerHTML = !st.coreBp ? '' : st.lit ? `<p class="note">${CORE.name}:星の灯台にともした</p>`
    : `<p class="note">${CORE.name}:${save.items.core ? '製作済み。積んだまま10,000光年より先へ行き、拠点に戻ると物語が進みます' : '工房で作れます(★5の素材が5種類必要)'}</p>`;
}
$('scrSignals').addEventListener('click', (e) => {
  const r = e.target.closest('[data-replay]');
  const back = () => { G.mode = 'signals'; showScreen('signals'); };
  if (r) { const ch = CHAPTERS.find(c => c.id === r.dataset.replay); if (ch) playScenes([chapterScene(ch)], back); return; }
  const s = e.target.closest('[data-replay-side]');
  if (s) { const m = SIDE.find(x => x.id === s.dataset.replaySide); if (m) playScenes([sideIntro(m), sideDone(m, '')], back); return; }
  const i = e.target.closest('[data-replay-intro]');
  if (i) { const m = SIDE.find(x => x.id === i.dataset.replayIntro); if (m) playScenes([sideIntro(m)], back); }
});
onShow('signals', renderSignals);

// ---------- 物語の振り返り(記録の画面の「物語」) ----------
// 見た章と信号を、あらすじと一緒に並べる。「見る」で物語画面をもう一度再生できる
export function renderArchive(el) {
  const st = story();
  const chs = CHAPTERS.filter(ch => seen(ch.id));
  const next = CHAPTERS.find(ch => !seen(ch.id) && ch.id !== 'dark');
  const nextHint = !next ? '' : next.id === 'final' ? '灯火の核を作り、積んだまま10,000光年より先へ'
    : next.ly ? `${next.ly.toLocaleString('ja-JP')}光年に到達して拠点へ帰る` : '';
  const item = (ep, title, summary, btn) => `<li class="ar-item">
      <div class="ar-text"><span class="ar-ep">${ep}</span><b>${title}</b><p>${summary}</p></div>${btn}</li>`;
  const sideDoneList = st.side.done.map(id => SIDE.find(x => x.id === id)).filter(Boolean);
  const sideActive = st.side.active.map(id => SIDE.find(x => x.id === id)).filter(Boolean);
  el.innerHTML = `
    <section class="ar-sec">
      <h2>本編「謎の信号を追う」<span class="loot-n">${chs.length} / ${CHAPTERS.length - (seen('dark') ? 0 : 1)}</span></h2>
      ${chs.length ? `<ol class="ar-list">${chs.map(ch => item(ch.eyebrow, ch.title, ch.summary, `<button class="btn" type="button" data-replay="${ch.id}">見る</button>`)).join('')}</ol>` : '<p class="note">まだ物語はありません。</p>'}
      ${next && nextHint ? `<p class="ar-next">次の手がかり:${nextHint}</p>` : ''}
    </section>
    <section class="ar-sec">
      <h2>信号 <span class="loot-n">解決 ${sideDoneList.length} / ${SIDE.length}</span></h2>
      ${sideActive.length || sideDoneList.length ? `<ol class="ar-list">
        ${sideActive.map(m => item(`${m.kind}・受信中`, m.title, `目標:${sideGoal(m)}`, `<button class="btn" type="button" data-replay-intro="${m.id}">通信を聞く</button>`)).join('')}
        ${sideDoneList.map(m => item(`${m.kind}・解決`, m.title, m.summary, `<button class="btn" type="button" data-replay-side="${m.id}">見る</button>`)).join('')}
      </ol>` : '<p class="note">まだ信号はありません。</p>'}
    </section>`;
}
$('rcStory').addEventListener('click', (e) => {
  const back = () => { G.mode = 'records'; showScreen('records'); };
  const r = e.target.closest('[data-replay]');
  if (r) { const ch = CHAPTERS.find(c => c.id === r.dataset.replay); if (ch) playScenes([chapterScene(ch)], back); return; }
  const s = e.target.closest('[data-replay-side]');
  if (s) { const m = SIDE.find(x => x.id === s.dataset.replaySide); if (m) playScenes([sideIntro(m), sideDone(m, '')], back); return; }
  const i = e.target.closest('[data-replay-intro]');
  if (i) { const m = SIDE.find(x => x.id === i.dataset.replayIntro); if (m) playScenes([sideIntro(m)], back); }
});
$('btnSignals').addEventListener('click', () => { G.mode = 'signals'; showScreen('signals'); });
$('btnSgBack').addEventListener('click', () => { G.mode = 'base'; showScreen('base'); });
export const signalCount = () => story().side.active.length;
