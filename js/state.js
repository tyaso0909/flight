// 画面をまたいで共有するゲームの状態
// mode: base | hangar | workshop | settings | flying | landing | explore | result
export const G = {
  mode: 'base',
  run: {},     // 飛行中の状態(速度・燃料・位置など)
  land: null,  // 着陸演出中の情報
  ex: null     // 着陸後の探索の情報
};
