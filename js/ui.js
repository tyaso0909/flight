// 画面の切り替え。各画面は onShow / onHide で表示・非表示のときの処理を登録する
import { $ } from './dom.js';

const SCREENS = {
  base: 'scrBase',
  hangar: 'scrHangar',
  workshop: 'scrWorkshop',
  dispatch: 'scrDispatch',
  records: 'scrRecords',
  storage: 'scrStorage',
  shop: 'scrShop',
  settings: 'scrSettings',
  explore: 'scrExplore',
  result: 'scrResult'
};
const showHooks = {};
const hideHooks = {};
let current = null;

export function onShow(name, fn) { (showHooks[name] = showHooks[name] || []).push(fn); }
export function onHide(name, fn) { (hideHooks[name] = hideHooks[name] || []).push(fn); }

// ステーションの中を背景にする画面(それ以外は宇宙と操縦席の枠)
export const STATION_SCREENS = new Set(['base', 'storage', 'shop', 'hangar', 'workshop', 'dispatch', 'records', 'settings']);

// name は SCREENS のどれか、または 'flying'(計器盤だけを出す)
export function showScreen(name) {
  if (current && current !== name) (hideHooks[current] || []).forEach(f => f());
  for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
  $('hud').hidden = name !== 'flying';
  $('canopy').style.display = STATION_SCREENS.has(name) ? 'none' : '';
  current = name;
  (showHooks[name] || []).forEach(f => f());
}
