// ゲームのデータ(数値・星・資源・仲間・強化・船)。数値の調整はまずここを見る

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

// 星の属性と、そこで採れる資源
export const TYPES = [
  { key: 'ice', name: '氷結星', code: 'GL', res: '氷晶', glow: 0xbfe3ff, css: '#bfe3ff' },
  { key: 'lava', name: '火山星', code: 'VR', res: '溶岩鉱', glow: 0xff8a4a, css: '#ff8a4a' },
  { key: 'forest', name: '森林星', code: 'SY', res: '樹脂', glow: 0x8fd6a0, css: '#8fd6a0' },
  { key: 'machine', name: '機械星', code: 'MK', res: '合金片', glow: 0x9fb7d6, css: '#9fb7d6' },
  { key: 'gas', name: 'ガス星', code: 'NB', res: 'ガス結晶', glow: 0xd7a6ff, css: '#d7a6ff' }
];
export const BLUEPRINT = { key: 'blueprint', res: '設計図のかけら', short: 'かけら' };
export const resName = (key) => key === BLUEPRINT.key ? BLUEPRINT.res : TYPES.find(t => t.key === key).res;
export const resShort = (key) => key === BLUEPRINT.key ? BLUEPRINT.short : TYPES.find(t => t.key === key).res;

// 着陸後の探索地点
export const KINDS = {
  vein: { name: '鉱脈' },
  ruin: { name: '遺跡' },
  village: { name: '集落' },
  danger: { name: '危険地帯' }
};

// 仲間
export const CREW = [
  { key: 'miner', role: '採掘士', name: 'ドゥーラ', note: '鉱脈で手に入る資源が1.3倍' },
  { key: 'engineer', role: '技師', name: 'ミロ', note: '推進系パーツの製作(未実装)' },
  { key: 'armor', role: '装甲職人', name: 'ハッカ', note: '防御系パーツの製作(未実装)' },
  { key: 'shipwright', role: '造船士', name: 'セナ', note: '新しい船の建造(未実装)' },
  { key: 'navigator', role: '航法士', name: 'ルオ', note: '星図の拡張(未実装)' }
];

// 強化(資源で機体を直接強化する)。mult は Lv0〜Lv5 の倍率
export const MAX_LV = 5;
export const UPGRADES = [
  { key: 'tank', name: '燃料タンク', desc: '出撃時の燃料が増える', res: ['gas', 'machine'], mult: [1, 1.2, 1.4, 1.65, 1.9, 2.2] },
  { key: 'engine', name: 'エンジン', desc: 'ブーストの加速が上がる', res: ['lava', 'machine'], mult: [1, 1.13, 1.27, 1.4, 1.53, 1.67] },
  { key: 'eff', name: '燃費', desc: 'ブースト中の燃料消費が減る', res: ['forest', 'gas'], mult: [1, 0.92, 0.85, 0.78, 0.72, 0.66] },
  { key: 'gyro', name: '姿勢制御', desc: '傾きへの反応が良くなる', res: ['ice', 'machine'], mult: [1, 1.08, 1.16, 1.24, 1.32, 1.4] },
  { key: 'armor', name: '装甲', desc: '最大耐久が増える', res: ['machine', 'ice'], mult: [1, 1.15, 1.3, 1.45, 1.6, 1.8] }
];
// その段階に上げる費用(main=主の資源、sub=副の資源、bp=設計図のかけら)
export const UPGRADE_COST = [null,
  { main: 10, sub: 5, bp: 0 },
  { main: 20, sub: 10, bp: 0 },
  { main: 35, sub: 15, bp: 0 },
  { main: 55, sub: 25, bp: 1 },
  { main: 80, sub: 35, bp: 2 }
];

// 船の種類。base は小型偵察機を1とした倍率(hull だけは最大耐久の値)
export const SHIPS = {
  scout: {
    name: '小型偵察機', desc: '初期機体。軽くて曲がりやすい',
    base: { tank: 1, accel: 1, burn: 1, steer: 1, hull: 100 }, cost: null
  },
  hauler: {
    name: '輸送船', desc: '頑丈で耐久が高い。重く、曲がりにくい',
    base: { tank: 1.1, accel: 0.85, burn: 1.15, steer: 0.8, hull: 150 }, cost: { machine: 60, ice: 30, blueprint: 2 }
  },
  explorer: {
    name: '長距離探査船', desc: '大きな燃料タンクで遠くまで行ける',
    base: { tank: 1.5, accel: 0.95, burn: 0.9, steer: 0.85, hull: 90 }, cost: { gas: 60, lava: 30, blueprint: 3 }
  }
};
export const SHIP_ORDER = ['scout', 'hauler', 'explorer'];
