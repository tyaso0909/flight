// 調整値とセーブデータ。この端末のブラウザ(localStorage)に保存する
import { SETTINGS, UPGRADES, SHIPS, MAX_LV, PARTS, GEAR, TYPES, RES, CREW, WEIGHT_BURN } from './data.js';

const CFG_KEY = 'tiltflight.cfg';
const SAVE_KEY = 'tiltflight.save';
const SAVE_VERSION = 4;

export const cfg = { invX: false, invY: false };
SETTINGS.forEach(s => { cfg[s.key] = s.def; });

const zeroLv = () => Object.fromEntries(UPGRADES.map(u => [u.key, 0]));
export const ZERO_LV = Object.freeze(zeroLv());
const newShip = (kind, id) => ({ id, kind, lv: zeroLv(), parts: [], hull: SHIPS[kind].base.hull });

// ships = 持っている船(船ごとに強化・付けているパーツ・耐久を持つ)、active = 今乗っている船
export const save = {
  v: SAVE_VERSION,
  res: {},
  crew: [],
  parts: [],     // 作ったパーツ(どの船に付けるかは ships[].parts)
  gear: [],      // 作った探索装備
  ships: [newShip('scout', 's1')],
  active: 's1',
  nextId: 2,
  best: 0,       // これまでに到達した一番遠い距離(光年)
  dispatch: []   // 派遣中の一覧
};
// save.ship = 今乗っている船、save.hull = その耐久(保存はされない、ships の中身を指す)
Object.defineProperty(save, 'ship', {
  get() { return this.ships.find(s => s.id === this.active) || this.ships[0]; },
  enumerable: false
});
Object.defineProperty(save, 'hull', {
  get() { return this.ship.hull; },
  set(v) { this.ship.hull = v; },
  enumerable: false
});

// パーツの重さの合計(0未満にはならない)
export const partsWeight = (parts) => Math.max(0, parts.reduce((s, k) => s + PARTS.find(p => p.key === k).weight, 0));

// 船の性能(調整値 × 船の種類 × 強化の倍率 + パーツ)
// 引数を省くと今の船(付けているパーツ込み)。kind と lv だけを渡したときはパーツなしで計算する
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
    cargo: Math.round(b.cargo * m('cargo')) + (has('container') ? 20 : 0),
    weight
  };
}
export const statsOf = (ship) => shipStats(ship.kind, ship.lv, ship.parts);
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

export const hasGear = (key) => save.gear.includes(key);
export const hasCrew = (key) => save.crew.some(c => c.key === key);
// 派遣中かどうか
export const shipBusy = (id) => save.dispatch.some(d => d.ship === id);
export const crewBusy = (key) => save.dispatch.some(d => d.crew === key);
// 拠点にいる仲間(派遣中の仲間は探索での効果を出さない)
export const crewHere = (key) => hasCrew(key) && !crewBusy(key);

// 一度に持ち帰れる素材の数(今の船 + 圧縮バッグ)
export const cargoCap = () => shipStats().cargo + (hasGear('pack') ? 10 : 0);

export function addShip(kind) {
  const s = newShip(kind, `s${save.nextId++}`);
  save.ships.push(s);
  return s;
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
  save.res = {};
  save.crew = [];
  save.parts = [];
  save.gear = [];
  save.ships = [newShip('scout', 's1')];
  save.active = 's1';
  save.nextId = 2;
  save.best = 0;
  save.dispatch = [];
  persist();
}

// ---------- 古いセーブデータを今の形に直して読み込む ----------
const validParts = (arr) => Array.isArray(arr) ? [...new Set(arr.filter(k => PARTS.some(p => p.key === k)))] : [];
function readShip(o, id) {
  if (!o || !SHIPS[o.kind]) return null;
  const s = newShip(o.kind, typeof o.id === 'string' ? o.id : id);
  UPGRADES.forEach(u => {
    const v = o.lv && o.lv[u.key];
    if (Number.isInteger(v)) s.lv[u.key] = Math.max(0, Math.min(MAX_LV, v));
  });
  s.parts = validParts(o.parts);
  if (typeof o.hull === 'number') s.hull = o.hull;
  return s;
}

function loadSave(s) {
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
  if (Array.isArray(s.crew)) save.crew = s.crew.filter(c => c && CREW.some(x => x.key === c.key));
  save.parts = validParts(s.parts);
  save.gear = Array.isArray(s.gear) ? [...new Set(s.gear.filter(k => GEAR.some(g => g.key === k)))] : [];

  // 船:v4 は ships の一覧。v3 までは船1隻(ship)と耐久(hull)が別に入っている
  let ships = [];
  if (Array.isArray(s.ships)) ships = s.ships.map((o, i) => readShip(o, `s${i + 1}`)).filter(Boolean);
  else if (s.ship) {
    const one = readShip({ ...s.ship, hull: s.hull }, 's1');
    if (one) ships = [one];
  } else if (typeof s.hull === 'number') ships = [readShip({ kind: 'scout', hull: s.hull }, 's1')];
  if (!ships.length) ships = [newShip('scout', 's1')];
  // 同じ種類の船は1隻まで、同じパーツは1隻にだけ付ける
  const seenKind = new Set(), seenPart = new Set();
  ships = ships.filter(sh => !seenKind.has(sh.kind) && seenKind.add(sh.kind));
  ships.forEach(sh => {
    sh.parts = sh.parts.filter(k => save.parts.includes(k) && !seenPart.has(k) && seenPart.add(k)).slice(0, SHIPS[sh.kind].slots);
    sh.hull = Math.max(0, Math.min(statsOf(sh).maxHull, Math.round(sh.hull)));
  });
  save.ships = ships;
  save.active = ships.some(sh => sh.id === s.active) ? s.active : ships[0].id;
  const maxNum = Math.max(...ships.map(sh => parseInt(sh.id.slice(1), 10) || 0));
  save.nextId = Math.max(Number.isInteger(s.nextId) ? s.nextId : 0, maxNum + 1);
  save.best = typeof s.best === 'number' ? s.best : 0;
  save.dispatch = Array.isArray(s.dispatch)
    ? s.dispatch.filter(d => d && ships.some(sh => sh.id === d.ship) && d.ship !== save.active && hasCrew(d.crew) && typeof d.end === 'number')
    : [];
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
