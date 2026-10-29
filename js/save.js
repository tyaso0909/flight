// 調整値とセーブデータ。この端末のブラウザ(localStorage)に保存する
import { SETTINGS, UPGRADES, SHIPS, MAX_LV } from './data.js';

const CFG_KEY = 'tiltflight.cfg';
const SAVE_KEY = 'tiltflight.save';
const SAVE_VERSION = 2;

export const cfg = { invX: false, invY: false };
SETTINGS.forEach(s => { cfg[s.key] = s.def; });

const zeroLv = () => Object.fromEntries(UPGRADES.map(u => [u.key, 0]));
export const ZERO_LV = Object.freeze(zeroLv());

export const save = {
  v: SAVE_VERSION,
  hull: SHIPS.scout.base.hull,
  res: {},
  crew: [],
  ship: { kind: 'scout', lv: zeroLv() }
};

// 船の性能(調整値 × 船の種類 × 強化の倍率)
export function shipStats(kind = save.ship.kind, lv = save.ship.lv) {
  const b = SHIPS[kind].base;
  const m = (key) => UPGRADES.find(u => u.key === key).mult[lv[key] || 0];
  return {
    fuel: Math.round(cfg.fuel * b.tank * m('tank')),
    accel: cfg.accel * b.accel * m('engine'),
    burn: cfg.burn * b.burn * m('eff'),
    steer: b.steer * m('gyro'),
    maxHull: Math.round(b.hull * m('armor'))
  };
}
export const maxHull = () => shipStats().maxHull;
export const totalLv = (lv = save.ship.lv) => UPGRADES.reduce((s, u) => s + (lv[u.key] || 0), 0);

// 耐久が減ったときのステータスダウン(最大耐久に対する割合で判定)
export function hullEffects() {
  const r = save.hull / maxHull();
  return { steer: r < 0.7 ? 0.8 : 1, burn: r < 0.4 ? 1.3 : 1, low70: r < 0.7, low40: r < 0.4 };
}

export function persist() {
  try {
    // 調整値は初期値から変えた項目だけ保存する(初期値を見直したとき、変えていない人には新しい値が効く)
    const out = { v: 2, invX: cfg.invX, invY: cfg.invY };
    SETTINGS.forEach(s => { if (cfg[s.key] !== s.def) out[s.key] = cfg[s.key]; });
    localStorage.setItem(CFG_KEY, JSON.stringify(out));
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) { /* 保存できない環境では保存しない */ }
}

export function resetSave() {
  save.hull = SHIPS.scout.base.hull;
  save.res = {};
  save.crew = [];
  save.ship = { kind: 'scout', lv: zeroLv() };
  persist();
}

// 古いセーブデータを今の形に直して読み込む
function loadSave(s) {
  if (typeof s.hull === 'number') save.hull = s.hull;
  if (s.res && typeof s.res === 'object') save.res = s.res;
  if (Array.isArray(s.crew)) save.crew = s.crew;
  // v1(船の情報なし)は、強化0の小型偵察機として引き継ぐ
  if (s.ship && SHIPS[s.ship.kind]) {
    save.ship.kind = s.ship.kind;
    UPGRADES.forEach(u => {
      const v = s.ship.lv && s.ship.lv[u.key];
      if (Number.isInteger(v)) save.ship.lv[u.key] = Math.max(0, Math.min(MAX_LV, v));
    });
  }
  save.hull = Math.max(0, Math.min(maxHull(), Math.round(save.hull)));
}

try {
  const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
  if (c) {
    // 旧版は全項目を保存していたので、旧初期値(感度1)のままなら新しい初期値を使う
    if (!c.v && c.sens === 1) delete c.sens;
    delete c.v;
    Object.assign(cfg, c);
  }
  const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (s) loadSave(s);
} catch (e) { /* 保存なしで始める */ }
