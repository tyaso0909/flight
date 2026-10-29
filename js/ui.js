// 画面の切り替え。各画面は onShow / onHide で表示・非表示のときの処理を登録する
import { $ } from './dom.js';

const SCREENS = {
  base: 'scrBase',
  hangar: 'scrHangar',
  workshop: 'scrWorkshop',
  dispatch: 'scrDispatch',
  records: 'scrRecords',
  settings: 'scrSettings',
  explore: 'scrExplore',
  result: 'scrResult'
};
const showHooks = {};
const hideHooks = {};
let current = null;

export function onShow(name, fn) { (showHooks[name] = showHooks[name] || []).push(fn); }
export function onHide(name, fn) { (hideHooks[name] = hideHooks[name] || []).push(fn); }

// name は SCREENS のどれか、または 'flying'(計器盤だけを出す)
export function showScreen(name) {
  if (current && current !== name) (hideHooks[current] || []).forEach(f => f());
  for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
  $('hud').hidden = name !== 'flying';
  current = name;
  (showHooks[name] || []).forEach(f => f());
}
