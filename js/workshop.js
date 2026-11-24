// 工房(探索装備)。道具職人が仲間になると装備を作れる
import { $ } from './dom.js';
import { GEAR, CREW, SPECIAL, TYPES, gearName } from './data.js';
import { save, persist, hasGear, hasCrew } from './save.js';
import { G } from './state.js';
import { onShow, showScreen } from './ui.js';
import { toList, canPay, pay, costHtml, ownedResHtml } from './resui.js';
import { sfx } from './audio.js';
import { checkAchievements } from './records.js';
import { CORE } from './story-data.js';

const smith = CREW.find(c => c.key === 'toolsmith');

// その装備で入れる特殊エリアの星
const areaOf = (key) => {
  const t = TYPES.find(x => SPECIAL[x.key].gear === key);
  return t ? `${t.name}・${SPECIAL[t.key].name}` : '';
};

// 灯火の核(物語の最後に使う特別な品)。設計図を手に入れると、道具職人がいなくても作れる(ピコが組み立てる)
function coreRow() {
  const st = save.story;
  if (!st.coreBp) return '';
  let btn;
  if (st.lit) btn = '<span class="sh-state own">灯台にともした</span>';
  else if (save.items.core > 0) btn = '<span class="sh-state own">製作済み</span>';
  else {
    const list = toList(CORE.cost), can = canPay(list);
    btn = `<button class="btn up-buy${can ? ' primary' : ''}" type="button" data-core="1"${can ? '' : ' disabled'}>製作<span class="cost">${costHtml(list)}</span></button>`;
  }
  return `<div class="up-row special-item${st.lit || save.items.core ? ' equipped' : ''}">
      <div>
        <div class="up-title"><b>${CORE.name}</b><span class="ws-tag story">物語</span></div>
        <div class="up-eff">${CORE.desc}</div>
      </div>
      ${btn}
    </div>`;
}

function render() {
  const ok = hasCrew('toolsmith');
  $('wsWho').innerHTML = ok
    ? `${smith.role}の${smith.name}が作ってくれます。装備は一度作ればずっと有効です。`
    : `${smith.role}が仲間になると、ここで探索装備を作れます。集落を探索すると出会えることがあります。`;
  $('wsList').innerHTML = coreRow() + GEAR.map(g => {
    const owned = hasGear(g.key);
    const needOk = !g.needs || hasGear(g.needs);
    const list = toList(g.cost);
    let btn;
    if (owned) btn = '<span class="sh-state own">作成済み</span>';
    else if (!ok) btn = `<span class="sh-state">${smith.role}が必要</span>`;
    else if (!needOk) btn = `<span class="sh-state">先に${gearName(g.needs)}</span>`;
    else {
      const can = canPay(list);
      btn = `<button class="btn up-buy${can ? ' primary' : ''}" type="button" data-gear="${g.key}"${can ? '' : ' disabled'}>製作<span class="cost">${costHtml(list)}</span></button>`;
    }
    const area = areaOf(g.key);
    const tag = area ? `<span class="ws-tag">特殊エリア</span>` : '';
    return `<div class="up-row${owned ? ' equipped' : ''}">
      <div>
        <div class="up-title"><b>${g.name}</b>${tag}</div>
        <div class="up-eff">${g.desc}${g.needs ? `(要:${gearName(g.needs)})` : ''}</div>
      </div>
      ${btn}
    </div>`;
  }).join('');
  $('wsRes').innerHTML = ownedResHtml();
}

function make(key) {
  const g = GEAR.find(x => x.key === key);
  if (!g || hasGear(key) || !hasCrew('toolsmith') || (g.needs && !hasGear(g.needs))) return;
  const list = toList(g.cost);
  if (!canPay(list)) return;
  pay(list);
  save.gear.push(key);
  persist();
  render();
  sfx.buy();
  checkAchievements();
}

function makeCore() {
  if (!save.story.coreBp || save.story.lit || save.items.core > 0) return;
  const list = toList(CORE.cost);
  if (!canPay(list)) return;
  pay(list);
  save.items.core = 1;
  persist();
  render();
  sfx.crew();
}

$('wsList').addEventListener('click', (e) => {
  if (e.target.closest('[data-core]:not([disabled])')) { makeCore(); return; }
  const b = e.target.closest('[data-gear]');
  if (b && !b.disabled) make(b.dataset.gear);
});
$('btnWsBack').addEventListener('click', () => { G.mode = 'base'; showScreen('base'); });
onShow('workshop', render);
