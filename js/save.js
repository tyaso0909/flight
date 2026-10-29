// 調整値とセーブデータ。この端末のブラウザ(localStorage)に保存する
import { SETTINGS, UPGRADES, SHIPS, MAX_LV, PARTS, GEAR, TYPES, RES, WEIGHT_BURN } from './data.js';

const CFG_KEY = 'tiltflight.cfg';
const SAVE_KEY = 'tiltflight.save';
const SAVE_VERSION = 3;

export const cfg = { invX: false, invY: false };
SETTINGS.forEach(s => { cfg[s.key] = s.def; });

const zeroLv = () => Object.fromEntries(UPGRADES.map(u => [u.key, 0]));
export const ZERO_LV = Object.freeze(zeroLv());

export const save = {
  v: SAVE_VERSION,
  hull: SHIPS.scout.base.hull,
  res: {},
  crew: [],
  parts: [],                                        // 作ったパーツ
  gear: [],                                         // 作った探索装備
  ship: { kind: 'scout', lv: zeroLv(), parts: [] }  // parts = 今の船に付けているパーツ
};

// パーツの重さの合計(0未満にはならない)
export const partsWeight = (parts) => Math.max(0, parts.reduce((s, k) => s + PARTS.find(p => p.key === k).weight, 0));

// 船の性能(調整値 × 船の種類 × 強化の倍率 + パーツ)
// 引数を省くと今の船(付けているパーツ込み)。kind と lv を渡したときはパーツなしで計算する
export function shipStats(kind = save.ship.kind, lv = save.ship.lv, parts = (kind === save.ship.kind && lv === save.ship.lv) ? save.ship.parts : []) {
  const b = SHIPS[kind].base;
  const m = (key) => UPGRADES.find(u => u.key === key).mult[lv[key] || 0];
  const has = (k) => parts.includes(k);
  const weight = partsWeight(parts);
  return {
    fuel: Math.round(cfg.fuel * b.tank * m('tank')) + (has('subtank') ? 30 : 0),
    accel: cfg.accel * b.accel * m('engine') * (has('afterburner') ? 1.2 : 1),
    burn: cfg.burn * b.burn * m('eff') * (1 + WEIGHT_BURN * weight),
    steer: b.steer * m('gyro'),
    maxHull: Math.round(b.hull * m('armor')) + (has('frame') ? 25 : 0),
    weight
  };
}
export const maxHull = () => shipStats().maxHull;

// 数値以外のパーツの効果
export function partFx(parts = save.ship.parts) {
  const has = (k) => parts.includes(k);
  return {
    drag: has('damper') ? 0.75 : 1,       // ブーストしていないときの減速
    hitKeep: has('absorber') ? 0.89 : 0.78, // デブリに当たったあとに残る速度の割合
    crash: has('gear') ? 0.5 : 1,         // 不時着のダメージ
    dangerSafe: has('heatshield')         // 危険地帯で傷つかない
  };
}
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
  save.parts = [];
  save.gear = [];
  save.ship = { kind: 'scout', lv: zeroLv(), parts: [] };
  persist();
}

// 古いセーブデータを今の形に直して読み込む
function loadSave(s) {
  if (typeof s.hull === 'number') save.hull = s.hull;
  if (s.res && typeof s.res === 'object') {
    // v2までの素材(ice / lava など、レア度なし)は★1として引き継ぐ
    const res = {};
    for (const [k, n] of Object.entries(s.res)) {
      if (typeof n !== 'number' || n <= 0) continue;
      const key = TYPES.some(t => t.key === k) ? `${k}1` : k;
      if (key === 'blueprint' || RES.some(r => r.key === key)) res[key] = (res[key] || 0) + Math.floor(n);
    }
    save.res = res;
  }
  if (Array.isArray(s.crew)) save.crew = s.crew;
  // v1(船の情報なし)は、強化0の小型偵察機として引き継ぐ
  if (s.ship && SHIPS[s.ship.kind]) {
    save.ship.kind = s.ship.kind;
    UPGRADES.forEach(u => {
      const v = s.ship.lv && s.ship.lv[u.key];
      if (Number.isInteger(v)) save.ship.lv[u.key] = Math.max(0, Math.min(MAX_LV, v));
    });
  }
  // パーツ(この版から追加。知らないパーツと重複は捨てる)
  const valid = (arr) => Array.isArray(arr) ? [...new Set(arr.filter(k => PARTS.some(p => p.key === k)))] : [];
  save.parts = valid(s.parts);
  save.gear = Array.isArray(s.gear) ? [...new Set(s.gear.filter(k => GEAR.some(g => g.key === k)))] : [];
  save.ship.parts = valid(s.ship && s.ship.parts).filter(k => save.parts.includes(k)).slice(0, SHIPS[save.ship.kind].slots);
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

export const hasGear = (key) => save.gear.includes(key);
export const hasCrew = (key) => save.crew.some(c => c.key === key);
