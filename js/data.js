// ゲームのデータ(数値・星・素材・仲間・強化・パーツ・装備・船)。数値の調整はまずここを見る

// 速度の範囲
export const V_MIN = 55;
export const V_START = 240;
export const V_MAX = 420;

// 「数値の調整」画面に出す項目(燃料・加速・燃料消費は強化前の基本値)
export const SETTINGS = [
  { key: 'capture', label: '引力の強さ', hint: 'この速度を下回ると引き寄せられる(星の大きさで±)', min: 100, max: 240, step: 5, def: 165 },
  { key: 'drag', label: '減速の速さ', hint: 'ブーストしていないとき1秒に落ちる速度', min: 4, max: 30, step: 1, def: 12 },
  { key: 'accel', label: 'ブーストの加速(基本値)', hint: 'ブースト中に1秒で上がる速度', min: 30, max: 160, step: 5, def: 75 },
  { key: 'fuel', label: '燃料タンク(基本値)', hint: '出撃時の燃料', min: 40, max: 200, step: 10, def: 100 },
  { key: 'burn', label: '燃料消費(基本値)', hint: 'ブースト1秒あたりの消費', min: 4, max: 25, step: 1, def: 10 },
  { key: 'debris', label: 'デブリの量', hint: '0で出現しない', min: 0, max: 3, step: 0.5, def: 1 },
  { key: 'sens', label: '傾きの感度', hint: '大きいほど少しの傾きで動く', min: 0.5, max: 2.5, step: 0.1, def: 1.5 },
  { key: 'spacing', label: '星の間隔', hint: '次の星が現れるまでの距離', min: 900, max: 3000, step: 100, def: 1700 }
];

// 星の属性と、そこで採れる素材(★1〜★5)。素材の名前は items を書き換えれば変えられる
export const TYPES = [
  { key: 'ice', name: '氷結星', code: 'GL', items: ['氷晶', '蒼氷石', '霜光石', '凍星晶', '零度核'], glow: 0xbfe3ff, css: '#bfe3ff' },
  { key: 'lava', name: '火山星', code: 'VR', items: ['溶岩鉱', '赤鉄鉱', '炎晶石', '竜炎鉱', '陽核石'], glow: 0xff8a4a, css: '#ff8a4a' },
  { key: 'forest', name: '森林星', code: 'SY', items: ['樹脂', '琥珀', '翠樹晶', '古樹芯', '命の種'], glow: 0x8fd6a0, css: '#8fd6a0' },
  { key: 'machine', name: '機械星', code: 'MK', items: ['合金片', '精密部品', 'チタン', '古代回路', '量子核'], glow: 0x9fb7d6, css: '#9fb7d6' },
  { key: 'gas', name: 'ガス星', code: 'NB', items: ['ガス結晶', '圧縮ガス', '虹色ガス', '星雲晶', '暗黒物質'], glow: 0xd7a6ff, css: '#d7a6ff' }
];
TYPES.forEach(t => { t.res = `${t.items[0]}など`; });

// 素材の一覧。キーは「星の属性 + レア度」(例:ice2 = 蒼氷石)
export const MAX_TIER = 5;
export const RES = TYPES.flatMap(t => t.items.map((name, i) => ({ key: `${t.key}${i + 1}`, type: t.key, tier: i + 1, name })));
export const resKey = (type, tier) => `${type}${tier}`;
export const BLUEPRINT = { key: 'blueprint', res: '設計図のかけら', short: 'かけら' };
const RES_BY_KEY = Object.fromEntries(RES.map(r => [r.key, r]));
export const resName = (key) => key === BLUEPRINT.key ? BLUEPRINT.res : RES_BY_KEY[key].name;
export const resShort = (key) => key === BLUEPRINT.key ? BLUEPRINT.short : RES_BY_KEY[key].name;
export const resTier = (key) => RES_BY_KEY[key] ? RES_BY_KEY[key].tier : 0;

// 星のレア度(★1〜★3)ごとの、素材のレア度(★1〜★5)の出やすさ
export const TIER_WEIGHTS = {
  1: [70, 25, 5, 0, 0],
  2: [40, 35, 20, 5, 0],
  3: [15, 30, 30, 20, 5]
};
// レア度ごとの、一度に手に入る量の倍率
export const TIER_QTY = [0, 1, 0.7, 0.5, 0.35, 0.25];

// 着陸後の探索地点
export const KINDS = {
  vein: { name: '鉱脈' },
  ruin: { name: '遺跡' },
  village: { name: '集落' },
  danger: { name: '危険地帯' },
  special: { name: '特殊エリア' }
};
// 星の属性ごとの特殊エリアと、入るのに要る装備
export const SPECIAL = {
  ice: { name: '氷河の裂け目', gear: 'coldsuit' },
  lava: { name: '溶岩洞窟', gear: 'firesuit' },
  forest: { name: '水没した森', gear: 'divesuit' },
  machine: { name: '封鎖区画', gear: 'hacktool' },
  gas: { name: '濃霧の谷', gear: 'gasmask' }
};

// 仲間
export const CREW = [
  { key: 'miner', role: '採掘士', name: 'ドゥーラ', note: '鉱脈で手に入る素材が1.3倍' },
  { key: 'engineer', role: '技師', name: 'ミロ', note: '推進系パーツを作れる(格納庫)' },
  { key: 'armor', role: '装甲職人', name: 'ハッカ', note: '防御系パーツを作れる(格納庫)' },
  { key: 'toolsmith', role: '道具職人', name: 'ベルカ', note: '探索装備を作れる(工房)' },
  { key: 'shipwright', role: '造船士', name: 'セナ', note: '新しい船の建造(未実装)' },
  { key: 'navigator', role: '航法士', name: 'ルオ', note: '星図の拡張(未実装)' }
];

// 強化(素材で機体を直接強化する)。mult は Lv0〜Lv5 の倍率、res は [主, 副] の星の属性
export const MAX_LV = 5;
export const UPGRADES = [
  { key: 'tank', name: '燃料タンク', desc: '出撃時の燃料が増える', res: ['gas', 'machine'], mult: [1, 1.2, 1.4, 1.65, 1.9, 2.2] },
  { key: 'engine', name: 'エンジン', desc: 'ブーストの加速が上がる', res: ['lava', 'machine'], mult: [1, 1.13, 1.27, 1.4, 1.53, 1.67] },
  { key: 'eff', name: '燃費', desc: 'ブースト中の燃料消費が減る', res: ['forest', 'gas'], mult: [1, 0.92, 0.85, 0.78, 0.72, 0.66] },
  { key: 'gyro', name: '姿勢制御', desc: '傾きへの反応が良くなる', res: ['ice', 'machine'], mult: [1, 1.08, 1.16, 1.24, 1.32, 1.4] },
  { key: 'armor', name: '装甲', desc: '最大耐久が増える', res: ['machine', 'ice'], mult: [1, 1.15, 1.3, 1.45, 1.6, 1.8] }
];
// その段階に上げる費用。main / sub は [素材のレア度, 数]、bp は設計図のかけら
export const UPGRADE_COST = [null,
  { main: [1, 10], sub: [1, 5], bp: 0 },
  { main: [1, 20], sub: [2, 5], bp: 0 },
  { main: [2, 12], sub: [2, 8], bp: 0 },
  { main: [3, 10], sub: [3, 6], bp: 1 },
  { main: [4, 8], sub: [4, 5], bp: 2 }
];

// パーツ(仲間が作れるようにする)。重さの合計1につき燃料消費が WEIGHT_BURN 増える
export const WEIGHT_BURN = 0.05;
export const PART_CREW = { engineer: '推進系', armor: '防御系' };
export const PARTS = [
  { key: 'subtank', crew: 'engineer', name: '予備燃料タンク', desc: '燃料 +30', weight: 2, cost: { gas1: 25, machine1: 10 } },
  { key: 'afterburner', crew: 'engineer', name: 'アフターバーナー', desc: 'ブーストの加速 +20%', weight: 2, cost: { lava1: 25, machine1: 10 } },
  { key: 'damper', crew: 'engineer', name: '慣性ダンパー', desc: 'ブーストしていないときの減速 -25%', weight: 1, cost: { ice1: 20, gas1: 15 } },
  { key: 'lightkit', crew: 'engineer', name: '軽量化キット', desc: '重さ -3(他のパーツの重さを打ち消す)', weight: -3, cost: { forest2: 10, gas2: 6, blueprint: 1 } },
  { key: 'absorber', crew: 'armor', name: '衝撃吸収材', desc: 'デブリに当たったときの減速が半分', weight: 1, cost: { forest1: 25, ice1: 10 } },
  { key: 'frame', crew: 'armor', name: '補強フレーム', desc: '最大耐久 +25', weight: 3, cost: { machine1: 30, lava1: 10 } },
  { key: 'gear', crew: 'armor', name: '着陸ギア', desc: '不時着のダメージが半分', weight: 2, cost: { machine1: 20, forest1: 15 } },
  { key: 'heatshield', crew: 'armor', name: '耐熱シールド', desc: '危険地帯で機体が傷つかない', weight: 2, cost: { lava2: 10, ice2: 6, blueprint: 1 } }
];

// 探索装備(道具職人が作る)。一度作ればずっと有効。needs は先に作っておく装備
export const GEAR = [
  { key: 'drill1', name: '強化ドリル', desc: '鉱脈で手に入る量 +30%', cost: { machine1: 20, lava2: 6 } },
  { key: 'drill2', name: '精密ドリル', desc: '鉱脈で手に入る量 +60%。素材のレア度が1段上がることがある', needs: 'drill1', cost: { machine2: 10, lava3: 5, blueprint: 1 } },
  { key: 'goggles', name: '解析ゴーグル', desc: '未調査の地点の種類がわかる。遺跡で設計図のかけらが出やすい', cost: { machine2: 6, ice2: 6 } },
  { key: 'coldsuit', name: '防寒スーツ', desc: '氷結星の「氷河の裂け目」に入れる', cost: { forest2: 8, ice1: 15 } },
  { key: 'firesuit', name: '耐火スーツ', desc: '火山星の「溶岩洞窟」に入れる', cost: { ice2: 8, lava1: 15 } },
  { key: 'divesuit', name: 'ダイビングスーツ', desc: '森林星の「水没した森」に入れる', cost: { forest1: 20, gas2: 6 } },
  { key: 'hacktool', name: 'ハッキングツール', desc: '機械星の「封鎖区画」に入れる', cost: { machine1: 15, ice2: 6 } },
  { key: 'gasmask', name: 'ガスマスク', desc: 'ガス星の「濃霧の谷」に入れる', cost: { gas1: 20, forest2: 6 } }
];
export const gearName = (key) => GEAR.find(g => g.key === key).name;

// 船の種類。base は小型偵察機を1とした倍率(hull だけは最大耐久の値)。slots はパーツ枠の数
export const SHIPS = {
  scout: {
    name: '小型偵察機', desc: '初期機体。軽くて曲がりやすい', slots: 3,
    base: { tank: 1, accel: 1, burn: 1, steer: 1, hull: 100 }, cost: null
  },
  hauler: {
    name: '輸送船', desc: '頑丈で耐久が高い。重く、曲がりにくい', slots: 4,
    base: { tank: 1.1, accel: 0.85, burn: 1.15, steer: 0.8, hull: 150 }, cost: { machine2: 30, ice2: 15, blueprint: 2 }
  },
  explorer: {
    name: '長距離探査船', desc: '大きな燃料タンクで遠くまで行ける', slots: 3,
    base: { tank: 1.5, accel: 0.95, burn: 0.9, steer: 0.85, hull: 90 }, cost: { gas3: 15, lava2: 15, blueprint: 3 }
  }
};
export const SHIP_ORDER = ['scout', 'hauler', 'explorer'];

// 完全修理に使う★1素材の合計
export const FULL_FIX_COST = 20;
