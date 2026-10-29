// 拠点ステーションの中(3D)。窓の外に自分の船が停泊していて、仲間が部屋の中で過ごし、会話する
// タップ:仲間 = ひとこと、窓の船 = 格納庫、星図のテーブル = 派遣、作業台 = 工房、商人 = 買い物
import { clamp, rnd } from './dom.js';
import { CREW } from './data.js';
import { save, crewBusy, hasCrew, maxHull } from './save.js';
import { view, onLayout, toLocal } from './orientation.js';
import { renderer } from './world.js';
import { buildShip } from './ships.js';
import { PAIR_TALK, GENERIC_TALK, SITUATION_TALK, SOLO, PICO, GARAN } from './talk.js';

const PI = Math.PI;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a12);
const cam = new THREE.PerspectiveCamera(44, 2, 0.1, 600);
const LOOK = new THREE.Vector3(0, 1.4, -1.0);

// 画面の横長さに合わせて、部屋が収まるようにカメラを引く
function frameCamera() {
  const a = view.LW / view.LH;
  cam.aspect = a;
  cam.fov = a < 1.9 ? 47 : 41;
  cam.position.set(0, 3.8, a < 1.9 ? 13.6 : 12.8);
  cam.lookAt(LOOK);
  cam.updateProjectionMatrix();
}
let needRender = true;
onLayout(() => { frameCamera(); needRender = true; });

// ---------- 材料 ----------
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
function panelTex(base, line, cells, w = 256, h = 256) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  c.strokeStyle = line; c.lineWidth = 2;
  for (let i = 0; i <= cells; i++) {
    c.beginPath(); c.moveTo(i * w / cells, 0); c.lineTo(i * w / cells, h); c.stroke();
    c.beginPath(); c.moveTo(0, i * h / cells); c.lineTo(w, i * h / cells); c.stroke();
  }
  // ところどころにボルト
  c.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) c.fillRect(i * w / cells + 6, j * h / cells + 6, 3, 3);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  return t;
}
const MAT = {
  floor: (() => { const t = panelTex('#1d2431', '#11161f', 4); t.repeat.set(5, 3); return lam(0xffffff, { map: t }); })(),
  wall: (() => { const t = panelTex('#262f3f', '#1a212d', 2); t.repeat.set(11, 2); return lam(0xffffff, { map: t }); })(),
  metal: lam(0x3a4558), dark: lam(0x1a202b), trim: lam(0x56637a),
  wood: lam(0x7a5636), cloth: lam(0x3b5d7a), crate: lam(0x8a6a3f), crate2: lam(0x5f6f52), plant: lam(0x3f8a4c), pot: lam(0x6b4b3a),
  cyan: glow(0x62e0ff), amber: glow(0xffb84d), white: glow(0xdff3ff), red: glow(0xff5b3a), green: glow(0x7fe0a0),
  holo: new THREE.MeshBasicMaterial({ color: 0x62e0ff, wireframe: true, transparent: true, opacity: 0.55 }),
  beam: new THREE.MeshBasicMaterial({ color: 0x62e0ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  glass: new THREE.MeshBasicMaterial({ color: 0x7fc8ff, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending }),
  shadow: (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false });
  })(),
  hit: new THREE.MeshBasicMaterial({ visible: false })
};

function box(parent, w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  parent.add(m); return m;
}
function cyl(parent, rt, rb, h, mat, x, y, z, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}

// ---------- 部屋 ----------
const W = 10, ZB = -6, ZF = 17, H = 7;    // 横幅の半分、奥の壁、手前(カメラより後ろまで)、天井の高さ
const WIN = { x0: -6.6, x1: 6.6, y0: 1.15, y1: 5.7 };
const room = new THREE.Group();
scene.add(room);
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, ZF - ZB), MAT.floor);
  floor.rotation.x = -PI / 2; floor.position.set(0, 0, (ZF + ZB) / 2); room.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, ZF - ZB), MAT.dark);
  ceil.rotation.x = PI / 2; ceil.position.set(0, H, (ZF + ZB) / 2); room.add(ceil);
  // 奥の壁(真ん中に大きな窓)
  box(room, WIN.x0 + W, H, 0.4, MAT.wall, (-W + WIN.x0) / 2, H / 2, ZB);
  box(room, W - WIN.x1, H, 0.4, MAT.wall, (W + WIN.x1) / 2, H / 2, ZB);
  box(room, WIN.x1 - WIN.x0, WIN.y0, 0.4, MAT.wall, 0, WIN.y0 / 2, ZB);
  box(room, WIN.x1 - WIN.x0, H - WIN.y1, 0.4, MAT.wall, 0, (H + WIN.y1) / 2, ZB);
  // 窓枠と桟
  box(room, WIN.x1 - WIN.x0 + 0.3, 0.22, 0.6, MAT.trim, 0, WIN.y0, ZB + 0.1);
  box(room, WIN.x1 - WIN.x0 + 0.3, 0.22, 0.6, MAT.trim, 0, WIN.y1, ZB + 0.1);
  [-1, 1].forEach(s => box(room, 0.26, WIN.y1 - WIN.y0, 0.6, MAT.trim, s * WIN.x1, (WIN.y0 + WIN.y1) / 2, ZB + 0.1));
  [-2.2, 2.2].forEach(x => box(room, 0.14, WIN.y1 - WIN.y0, 0.3, MAT.metal, x, (WIN.y0 + WIN.y1) / 2, ZB + 0.05));
  box(room, WIN.x1 - WIN.x0, 0.06, 0.06, MAT.cyan, 0, WIN.y0 + 0.14, ZB + 0.42);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), MAT.glass);
  glass.position.set(0, (WIN.y0 + WIN.y1) / 2, ZB + 0.02); room.add(glass);
  // 左右の壁
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(ZF - ZB, H), MAT.wall);
    w.rotation.y = -s * PI / 2; w.position.set(s * W, H / 2, (ZF + ZB) / 2); room.add(w);
    // 壁ぎわの光るライン
    box(room, 0.05, 0.05, ZF - ZB, MAT.cyan, s * (W - 0.05), 0.35, (ZF + ZB) / 2);
    box(room, 0.4, 0.3, ZF - ZB, MAT.dark, s * (W - 0.2), H - 0.15, (ZF + ZB) / 2);
  });
  // 天井の照明
  [-5, 0, 5].forEach(x => box(room, 2.6, 0.08, 0.5, MAT.white, x, H - 0.05, -2.5));
  [-5, 0, 5].forEach(x => box(room, 2.6, 0.08, 0.5, MAT.white, x, H - 0.05, 2));
  // 床の案内線
  box(room, 0.08, 0.02, 7, MAT.amber, -1.2, 0.01, 1.5).material = glow(0xffb84d, 0.35);
  box(room, 0.08, 0.02, 7, MAT.amber, 1.2, 0.01, 1.5).material = glow(0xffb84d, 0.35);
}

// 右の壁の扉(商人はここから入ってくる)
const DOOR = { x: W - 0.02, z: -0.6 };
const doorLight = glow(0xffb84d);
{
  const g = new THREE.Group();
  g.position.set(DOOR.x, 0, DOOR.z); g.rotation.y = -PI / 2; room.add(g);
  box(g, 2.6, 3.6, 0.2, MAT.trim, 0, 1.8, 0);
  box(g, 2.1, 3.2, 0.24, MAT.dark, 0, 1.6, 0.02);
  box(g, 0.05, 3.0, 0.26, MAT.metal, 0, 1.6, 0.03);
  box(g, 2.1, 0.08, 0.28, doorLight, 0, 3.32, 0.03);
}

// 星図のテーブル(派遣)
const HOLO = new THREE.Vector3(-3.7, 0, -1.4);
const holo = new THREE.Group();
holo.position.copy(HOLO); room.add(holo);
const holoSpin = new THREE.Group();
{
  cyl(holo, 0.75, 1.0, 0.9, MAT.metal, 0, 0.45, 0, 20);
  cyl(holo, 1.35, 1.25, 0.14, MAT.trim, 0, 0.97, 0, 28);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.04, 6, 40), MAT.cyan);
  ring.rotation.x = PI / 2; ring.position.y = 1.05; holo.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 1.6, 24, 1, true), MAT.beam);
  beam.position.y = 1.85; holo.add(beam);
  holoSpin.position.y = 1.95; holo.add(holoSpin);
  const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), MAT.holo);
  holoSpin.add(globe);
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.012, 4, 48), MAT.holo);
  orbit.rotation.x = PI / 2.4; holoSpin.add(orbit);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.cyan);
  moon.position.set(0.78, 0, 0); orbit.add(moon);
}
const holoHit = box(holo, 2.8, 3, 2.8, MAT.hit, 0, 1.5, 0);

// 作業台(工房)
const BENCH = new THREE.Vector3(5.6, 0, -3.1);
const bench = new THREE.Group();
bench.position.copy(BENCH); bench.rotation.y = -0.18; room.add(bench);
{
  box(bench, 3.4, 0.14, 1.3, MAT.wood, 0, 1.0, 0);
  [-1.5, 1.5].forEach(x => box(bench, 0.14, 1.0, 1.1, MAT.metal, x, 0.5, 0));
  box(bench, 3.2, 0.1, 1.0, MAT.metal, 0, 0.32, 0);
  box(bench, 0.5, 0.3, 0.4, MAT.crate2, -1.0, 1.22, 0.1);
  box(bench, 0.7, 0.12, 0.3, MAT.trim, 0.2, 1.13, 0.2, 0.4);
  cyl(bench, 0.12, 0.12, 0.35, MAT.red, 1.1, 1.25, -0.2, 8).material = lam(0xb5452f);
  // 壁の工具棚
  box(bench, 3.4, 1.4, 0.12, MAT.dark, 0, 2.6, -0.62);
  for (let i = 0; i < 6; i++) box(bench, 0.08, 0.5 + (i % 3) * 0.15, 0.06, MAT.trim, -1.3 + i * 0.5, 2.6, -0.52);
  // ライト
  box(bench, 0.08, 1.1, 0.08, MAT.metal, 1.5, 1.6, -0.4);
  box(bench, 0.6, 0.1, 0.35, MAT.amber, 1.3, 2.15, -0.25);
}
const benchHit = box(bench, 3.8, 2.8, 2.2, MAT.hit, 0, 1.4, 0);

// ソファ・木箱・植木鉢
{
  const sofa = new THREE.Group(); sofa.position.set(-6.4, 0, -4.7); sofa.rotation.y = 0.25; room.add(sofa);
  box(sofa, 2.6, 0.5, 0.9, MAT.cloth, 0, 0.45, 0);
  box(sofa, 2.6, 0.8, 0.25, MAT.cloth, 0, 0.95, -0.38);
  [-1.35, 1.35].forEach(x => box(sofa, 0.2, 0.75, 0.9, MAT.cloth, x, 0.55, 0));
  box(room, 1.1, 1.1, 1.1, MAT.crate, -8.4, 0.55, 1.0, 0.2);
  box(room, 0.9, 0.9, 0.9, MAT.crate2, -8.5, 1.55, 0.9, -0.3);
  box(room, 1.0, 0.8, 1.0, MAT.crate, -7.4, 0.4, 2.4, 0.5);
  box(room, 1.2, 0.9, 1.0, MAT.crate2, 8.6, 0.45, -4.6, 0.3);
  cyl(room, 0.45, 0.35, 0.7, MAT.pot, -8.6, 0.35, -4.8, 10);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), MAT.plant);
  leaves.position.set(-8.6, 1.35, -4.8); leaves.scale.set(1, 1.3, 1); room.add(leaves);
  // 右の壁の操作盤
  const panel = new THREE.Group(); panel.position.set(W - 0.3, 0, 3.6); panel.rotation.y = -PI / 2; room.add(panel);
  box(panel, 2.2, 1.0, 0.5, MAT.metal, 0, 0.5, 0);
  box(panel, 2.0, 1.1, 0.1, MAT.dark, 0, 1.75, -0.2);
  box(panel, 1.8, 0.9, 0.05, glow(0x62e0ff, 0.25), 0, 1.75, -0.14);
  for (let i = 0; i < 5; i++) box(panel, 0.18, 0.06, 0.1, i % 2 ? MAT.green : MAT.amber, -0.7 + i * 0.35, 1.05, 0.1);
}

// 照明
scene.add(new THREE.AmbientLight(0x4a5470, 0.75));
scene.add(new THREE.HemisphereLight(0x9cbcff, 0x1d1712, 0.45));
const winLight = new THREE.DirectionalLight(0xb0cdff, 0.55);
winLight.position.set(-2, 5, -14); winLight.target.position.set(0, 0, 2);
scene.add(winLight, winLight.target);
const sun = new THREE.DirectionalLight(0xfff1dc, 0.9);
sun.position.set(-6, 6, -4); scene.add(sun);
const holoLight = new THREE.PointLight(0x62e0ff, 1.2, 8, 2);
holoLight.position.set(HOLO.x, 2.2, HOLO.z); scene.add(holoLight);
const benchLight = new THREE.PointLight(0xffb066, 1.3, 7, 2);
benchLight.position.set(BENCH.x + 1.2, 2.2, BENCH.z + 0.6); scene.add(benchLight);

// ---------- 窓の外 ----------
const outside = new THREE.Group();
scene.add(outside);
{
  const N = 900, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rnd(-160, 160); pos[i * 3 + 1] = rnd(-60, 110); pos[i * 3 + 2] = rnd(-260, -60);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  outside.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.4, sizeAttenuation: false })));
  // 星雲
  const neb = (c1, x, y, z, s) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d'), gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, c1); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, y, z); sp.scale.set(s, s, 1); outside.add(sp);
  };
  neb('rgba(60,120,170,0.5)', -40, 30, -220, 220);
  neb('rgba(140,60,150,0.4)', 60, 10, -230, 200);
  // 大きな惑星(ガス星)
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  for (let y = 0; y < 128; y++) {
    const t = y / 128, v = Math.sin(t * 22) * 0.5 + 0.5;
    c.fillStyle = `rgb(${Math.round(120 + 70 * v)},${Math.round(90 + 50 * v)},${Math.round(160 + 40 * v)})`;
    c.fillRect(0, y, 256, 1);
  }
  const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
  const planet = new THREE.Mesh(new THREE.SphereGeometry(34, 40, 24), new THREE.MeshLambertMaterial({ map: tex }));
  planet.position.set(-48, -30, -120); planet.rotation.z = 0.35; outside.add(planet);
  const pRing = new THREE.Mesh(new THREE.RingGeometry(42, 56, 64), new THREE.MeshBasicMaterial({ color: 0xd9c4ea, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  pRing.position.copy(planet.position); pRing.rotation.set(PI / 2.3, 0.2, 0.35); outside.add(pRing);
  // 船をつなぐ桟橋
  box(outside, 0.9, 0.7, 8, MAT.metal, 1.8, 1.5, -10.2);
  for (let i = 0; i < 5; i++) box(outside, 1.0, 0.08, 0.08, MAT.amber, 1.8, 1.9, -7 - i * 1.6);
}
// 停泊中の自分の船
const SHIP_AT = new THREE.Vector3(1.8, 2.4, -17);
const shipHolder = new THREE.Group();
shipHolder.position.copy(SHIP_AT); shipHolder.rotation.y = PI * 0.66; outside.add(shipHolder);
const shipHit = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 6), MAT.hit);
shipHit.position.copy(SHIP_AT); outside.add(shipHit);
let shipSig = '';
function refreshShip() {
  const s = save.ship, sig = `${s.kind}|${JSON.stringify(s.lv)}|${s.parts.join(',')}`;
  if (sig === shipSig) return;
  shipSig = sig;
  while (shipHolder.children.length) shipHolder.remove(shipHolder.children[0]);
  const ship = buildShip(s.kind, s.lv, s.parts);
  const bb = new THREE.Box3().setFromObject(ship);
  const size = bb.getSize(new THREE.Vector3()), center = bb.getCenter(new THREE.Vector3());
  const k = 7.2 / Math.max(size.x, size.y, size.z);
  ship.scale.setScalar(k); ship.position.copy(center).multiplyScalar(-k);
  shipHolder.add(ship);
}

// 商人の船(来ているときだけ)
const merchShip = new THREE.Group();
{
  const hullM = lam(0x8a6a4a), sail = lam(0xb5452f);
  box(merchShip, 6, 2, 2.6, hullM, 0, 0, 0);
  box(merchShip, 2, 1.6, 2.2, lam(0x5c4632), -3.6, 0.1, 0);
  box(merchShip, 3, 1.2, 2.8, sail, 0.6, 1.5, 0);
  [-1.4, 0.4, 2.2].forEach(x => box(merchShip, 0.9, 0.9, 0.9, MAT.crate, x, -1.3, 1.2));
  box(merchShip, 0.4, 0.4, 0.4, MAT.amber, 3.2, 0.6, 1.35);
  box(merchShip, 0.4, 0.4, 0.4, MAT.amber, -2.4, 0.6, 1.35);
  cyl(merchShip, 0.6, 0.8, 1.0, MAT.dark, -4.9, 0.1, 0, 10).rotation.z = PI / 2;
  const fl = cyl(merchShip, 0.5, 0.05, 1.6, glow(0xffb066, 0.7), -5.8, 0.1, 0, 10); fl.rotation.z = PI / 2;
}
const MERCH_AT = new THREE.Vector3(-5.2, 4.3, -26);
merchShip.position.copy(MERCH_AT); merchShip.rotation.y = 0.3; merchShip.visible = false;
outside.add(merchShip);

// ---------- 人物 ----------
const SKIN = [0xf1c7a1, 0xc98f63, 0x8d5a3b, 0xe8b48a, 0xb87c56, 0xf3d2b8];
const LOOKS = {
  miner: { suit: 0xd9792b, skin: SKIN[1], w: 1.14, h: 1.0 },
  engineer: { suit: 0x3d6fb6, skin: SKIN[0], w: 0.95, h: 0.98 },
  armor: { suit: 0x8a3b3b, skin: SKIN[2], w: 1.12, h: 1.1 },
  toolsmith: { suit: 0x4e8a4a, skin: SKIN[3], w: 0.95, h: 0.9 },
  shipwright: { suit: 0x7a5aa8, skin: SKIN[5], w: 0.92, h: 1.04 },
  navigator: { suit: 0x2f8c8c, skin: SKIN[4], w: 0.95, h: 1.02 },
  garan: { suit: 0x6b4a2f, skin: 0x3a2a20, w: 1.2, h: 1.06 }
};
const eyeMat = lam(0x14161c);

function makePerson(key) {
  const L = LOOKS[key];
  const root = new THREE.Group();
  const fig = new THREE.Group(); fig.scale.set(L.w, L.h, L.w); root.add(fig);
  const suit = lam(L.suit), skin = lam(L.skin), dark = lam(0x232833);
  const legL = new THREE.Group(), legR = new THREE.Group();
  [legL, legR].forEach((g, i) => {
    g.position.set(i ? 0.13 : -0.13, 0.48, 0); fig.add(g);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.44, 8), dark); l.position.y = -0.22; g.add(l);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.26), dark); f.position.set(0, -0.44, 0.04); g.add(f);
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 0.62, 12), suit);
  body.position.y = 0.78; fig.add(body);
  const head = new THREE.Group(); head.position.y = 1.36; fig.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), skin));
  [-0.09, 0.09].forEach(x => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.03), eyeMat); e.position.set(x, 0.01, 0.255); head.add(e); });
  const armL = new THREE.Group(), armR = new THREE.Group();
  [armL, armR].forEach((g, i) => {
    g.position.set(i ? 0.33 : -0.33, 1.02, 0); fig.add(g);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.12), suit); a.position.y = -0.21; g.add(a);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skin); h.position.y = -0.46; g.add(h);
  });
  const add = (parent, geo, mat, p, r = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); parent.add(m); return m; };
  const half = (r) => new THREE.SphereGeometry(r, 16, 8, 0, PI * 2, 0, PI / 2);
  if (key === 'miner') {
    add(head, half(0.3), lam(0xf2c230), [0, 0.04, 0]);
    add(head, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), lam(0xf2c230), [0, 0.04, 0.02]);
    add(head, new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8), glow(0xfff2b0), [0, 0.17, 0.27], [PI / 2, 0, 0]);
    add(fig, new THREE.BoxGeometry(0.66, 0.08, 0.66), lam(0x5a3b20), [0, 0.6, 0]);
  } else if (key === 'engineer') {
    add(head, half(0.285), lam(0x5a3b28), [0, 0.03, -0.03], [-0.35, 0, 0]);
    [-0.1, 0.1].forEach(x => add(head, new THREE.TorusGeometry(0.065, 0.022, 6, 14), MAT.cyan, [x, 0.14, 0.24], [-0.3, 0, 0]));
    add(head, new THREE.TorusGeometry(0.28, 0.02, 4, 24), lam(0x222831), [0, 0.13, 0], [PI / 2 - 0.3, 0, 0]);
  } else if (key === 'armor') {
    [-1, 1].forEach(s => add(fig, new THREE.BoxGeometry(0.3, 0.16, 0.36), lam(0x7b8594), [s * 0.32, 1.08, 0], [0, 0, -s * 0.25]));
    add(fig, new THREE.BoxGeometry(0.46, 0.34, 0.1), lam(0x7b8594), [0, 0.86, 0.27]);
    add(head, half(0.28), lam(0x1f1f24), [0, 0.02, -0.02], [-0.5, 0, 0]);
  } else if (key === 'toolsmith') {
    add(head, half(0.29), lam(0x3f9a6a), [0, 0.06, 0], [-0.15, 0, 0]);
    add(head, new THREE.ConeGeometry(0.08, 0.2, 6), lam(0x3f9a6a), [0, 0.06, -0.3], [-PI / 2.4, 0, 0]);
    add(fig, new THREE.BoxGeometry(0.44, 0.52, 0.06), lam(0xc9a46c), [0, 0.72, 0.29]);
  } else if (key === 'shipwright') {
    add(head, half(0.29), lam(0x2a1f3d), [0, 0.02, -0.02], [-0.3, 0, 0]);
    add(head, new THREE.CylinderGeometry(0.06, 0.03, 0.5, 8), lam(0x2a1f3d), [0, -0.12, -0.3], [0.5, 0, 0]);
    add(head, new THREE.CylinderGeometry(0.3, 0.3, 0.07, 16), lam(0xe9edf5), [0, 0.19, 0.02], [0.12, 0, 0]);
  } else if (key === 'navigator') {
    add(fig, new THREE.ConeGeometry(0.42, 0.95, 14, 1, true), lam(0xcfe6e8, { side: THREE.DoubleSide }), [0, 0.6, 0]);
    add(fig, new THREE.TorusGeometry(0.2, 0.06, 6, 16), lam(0xb5452f), [0, 1.1, 0], [PI / 2, 0, 0]);
    add(head, half(0.285), lam(0xe0e4ea), [0, 0.03, -0.03], [-0.4, 0, 0]);
    add(head, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), MAT.trim, [0.24, 0.25, 0], [0, 0, -0.3]);
    add(head, new THREE.SphereGeometry(0.04, 6, 4), MAT.cyan, [0.29, 0.39, 0]);
  } else if (key === 'garan') {
    add(fig, new THREE.ConeGeometry(0.5, 1.15, 14, 1, true), lam(0x6b4a2f, { side: THREE.DoubleSide }), [0, 0.62, 0]);
    add(head, new THREE.SphereGeometry(0.32, 16, 12, 0, PI * 2, 0, PI * 0.62), lam(0x4e3420, { side: THREE.DoubleSide }), [0, 0.02, -0.04], [-0.25, 0, 0]);
    add(fig, new THREE.BoxGeometry(0.62, 0.7, 0.36), lam(0x8a6a3f), [0, 0.95, -0.4]);
    add(fig, new THREE.BoxGeometry(0.16, 0.2, 0.16), glow(0xffc066), [0.38, 0.6, -0.42]);
    head.children.slice(1, 3).forEach(e => { e.material = glow(0xffc066); });
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), MAT.shadow);
  shadow.rotation.x = -PI / 2; shadow.position.y = 0.012; root.add(shadow);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 1.1), MAT.hit);
  hit.position.y = 0.9; root.add(hit);
  return { root, fig, head, armL, armR, legL, legR, hit, top: 1.85 * L.h };
}

function makePico() {
  const root = new THREE.Group(), fig = new THREE.Group(); root.add(fig);
  const head = new THREE.Group(); fig.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), lam(0xe9edf5)));
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), MAT.cyan); eye.position.z = 0.255; head.add(eye);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 6, 28), MAT.amber); ring.rotation.x = PI / 2; fig.add(ring);
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.1), MAT.trim); p.position.set(s * 0.3, 0, 0); head.add(p); });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), MAT.shadow);
  shadow.rotation.x = -PI / 2; shadow.position.y = 0.012; root.add(shadow);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), MAT.hit); fig.add(hit);
  return { root, fig, head, ring, hit, shadow, top: 0.45 };
}

// 部屋の中の立ち位置。face = 着いたときに向く方向(見る点)
const SPOTS = [
  { k: 'holo', x: -3.7, z: 0.35, look: HOLO }, { k: 'holo', x: -5.4, z: -0.7, look: HOLO }, { k: 'holo', x: -2.0, z: -0.6, look: HOLO },
  { k: 'bench', x: 4.8, z: -1.7, look: BENCH }, { k: 'bench', x: 6.6, z: -1.9, look: BENCH },
  { k: 'window', x: 0.6, z: -4.5, look: new THREE.Vector3(0.6, 0, -20) }, { k: 'window', x: 2.6, z: -4.4, look: SHIP_AT },
  { k: 'sofa', x: -6.2, z: -3.4, look: null }, { k: 'center', x: 0.4, z: 0.9, look: null }, { k: 'center', x: 2.4, z: 1.9, look: null }, { k: 'center', x: -1.6, z: 2.4, look: null }, { k: 'center', x: 4.2, z: 2.6, look: null },
  { k: 'crates', x: -6.9, z: 0.2, look: new THREE.Vector3(-8.4, 0, 1.0) }, { k: 'door', x: -7.6, z: -1.6, look: null }
];
const PREFER = { miner: ['crates', 'center'], engineer: ['bench'], armor: ['door', 'crates'], toolsmith: ['bench'], shipwright: ['window'], navigator: ['holo', 'window'] };
const OBST = [{ x: HOLO.x, z: HOLO.z, r: 1.35 }, { x: BENCH.x, z: BENCH.z, r: 1.1 }, { x: -6.4, z: -4.7, r: 1.2 }, { x: -8.2, z: 1.0, r: 1.1 }, { x: -7.4, z: 2.4, r: 0.8 }, { x: 7.0, z: 1.6, r: 1.0 }];
const STALL = { x: 6.6, z: 1.6 };

// 商人の屋台
const stall = new THREE.Group();
stall.position.set(STALL.x + 0.4, 0, STALL.z - 0.2); stall.visible = false; room.add(stall);
{
  box(stall, 1.8, 0.9, 0.9, MAT.wood, 0, 0.45, 0, -0.5);
  [[-0.5, 0.15], [0.2, -0.1], [0.5, 0.25]].forEach(([x, z], i) => box(stall, 0.4, 0.3, 0.4, i % 2 ? MAT.crate2 : MAT.crate, x, 1.05, z, i));
  box(stall, 0.25, 0.25, 0.25, glow(0x9fe4ff), -0.1, 1.02, 0.25);
  [[-0.8, -0.4], [0.8, 0.4]].forEach(([x, z]) => box(stall, 0.08, 2.2, 0.08, MAT.wood, x, 1.1, -z, -0.5));
  const awn = box(stall, 2.2, 0.08, 1.4, lam(0xb5452f), 0, 2.2, 0, -0.5); awn.rotation.z = -0.08;
}

// ---------- 吹き出しとタップの目印(HTML) ----------
const layer = document.getElementById('stLayer');
const v3 = new THREE.Vector3();
function project(obj, yOff) {
  obj.getWorldPosition(v3); v3.y += yOff;
  v3.project(cam);
  return { x: (v3.x + 1) / 2 * view.LW, y: (1 - v3.y) / 2 * view.LH, behind: v3.z > 1 };
}
const NAMES = { pico: 'ピコ', garan: 'ガラン' };
CREW.forEach(c => { NAMES[c.key] = c.name; });

// 目印のボタン(格納庫・派遣・工房・商人)
const tags = {};
function makeTag(key, label, obj, yOff) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'st-tag'; b.dataset.tag = key;
  b.innerHTML = `<span>${label}</span><small></small>`;
  layer.appendChild(b);
  tags[key] = { el: b, obj, yOff, sub: b.querySelector('small') };
  return tags[key];
}

// ---------- 状態 ----------
const agents = {};     // key -> { ...model, key, x, z, ry, state, timer, path, speak }
let pico = null, garan = null;
let chat = null, chatTimer = 4, lastTalk = '';
let merchState = 'none';  // none | arriving | here | leaving
let merchT = 0;
let actions = {};         // タップしたときに呼ぶ関数(base.js などから渡す)
let ctxFn = () => ({});

export function setStationActions(a) { actions = a; }
export function setStationContext(fn) { ctxFn = fn; }

function spawnAgent(key, at) {
  const m = makePerson(key);
  const a = { ...m, key, x: at.x, z: at.z, ry: 0, state: 'idle', timer: rnd(1, 4), path: null, walkT: rnd(0, 6), spot: null, bubble: null, faceTo: null };
  m.root.position.set(a.x, 0, a.z);
  m.hit.userData.agent = key;
  room.add(m.root);
  agents[key] = a;
  return a;
}
function removeAgent(key) {
  const a = agents[key];
  if (!a) return;
  room.remove(a.root);
  if (a.bubble) a.bubble.el.remove();
  delete agents[key];
  if (chat && chat.who.includes(key)) endChat();
}

const takenSpots = () => new Set(Object.values(agents).map(a => a.spot).filter(Boolean));
function pickSpot(a) {
  const taken = takenSpots();
  const free = SPOTS.filter(s => !taken.has(s) && s !== a.spot);
  const pref = free.filter(s => (PREFER[a.key] || []).includes(s.k));
  const list = pref.length && Math.random() < 0.6 ? pref : free;
  return list[Math.floor(Math.random() * list.length)] || null;
}
function walkTo(a, x, z, then) {
  a.path = { x, z, then };
  a.state = 'walk';
}

// 吹き出し
function say(a, text, dur) {
  if (!a) return;
  if (!a.bubble) {
    const el = document.createElement('div');
    el.className = 'st-bubble';
    el.setAttribute('role', 'status');
    layer.appendChild(el);
    a.bubble = { el, t: 0 };
  }
  a.bubble.el.innerHTML = `<b>${NAMES[a.key]}</b>${text}`;
  a.bubble.t = dur || clamp(1.6 + text.length * 0.09, 2.4, 5);
  a.bubble.el.classList.remove('out');
  a.bubble.el.classList.add('in');
  a.talkT = a.bubble.t;
}

function present() { return Object.values(agents); }
function endChat() {
  if (chat) chat.who.forEach(k => { const a = agents[k]; if (a && a.state === 'chat') { a.state = 'idle'; a.timer = rnd(2, 5); } });
  chat = null;
  chatTimer = rnd(13, 22);
}

// 会話を選ぶ(状況に合うもの → 2人の組み合わせ → だれでも)
function pickTalk(here, depth = 0) {
  const ctx = ctxFn();
  ctx.here = here;
  const order = CREW.map(c => c.key);
  const sit = SITUATION_TALK.filter(s => s.when(ctx)).filter(s => s.talk.every(([w]) => w === 'A' || w === 'B' || here.includes(w)));
  const pairs = [];
  for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
    const [p, q] = [here[i], here[j]].sort((m, n) => order.indexOf(m) - order.indexOf(n));
    (PAIR_TALK[`${p}|${q}`] || []).forEach(t => pairs.push({ talk: t, a: p, b: q }));
  }
  const two = () => { const s = [...here].sort(() => Math.random() - 0.5); return [s[0], s[1]]; };
  let pick = null;
  const r = Math.random();
  if (sit.length && r < 0.4) {
    const s = sit[Math.floor(Math.random() * sit.length)];
    const named = s.talk.map(([w]) => w).filter(w => w !== 'A' && w !== 'B');
    const others = here.filter(k => !named.includes(k)).sort(() => Math.random() - 0.5);
    pick = { talk: s.talk, a: others[0], b: others[1] || named[0] };
  } else if (pairs.length && r < 0.75) {
    pick = pairs[Math.floor(Math.random() * pairs.length)];
  } else {
    const [A, B] = two();
    pick = { talk: GENERIC_TALK[Math.floor(Math.random() * GENERIC_TALK.length)], a: A, b: B };
  }
  // 同じ会話が続かないように
  const sig = pick.talk[0][1];
  if (sig === lastTalk && depth < 4) return pickTalk(here, depth + 1);
  lastTalk = sig;
  const lines = pick.talk.map(([w, text]) => [w === 'A' ? pick.a : w === 'B' ? pick.b : w, text]);
  const who = [...new Set(lines.map(l => l[0]))];
  return { lines, who };
}

function startChat() {
  const here = present().map(a => a.key);
  if (here.length === 0) {
    if (pico) say(pico, PICO[Math.floor(Math.random() * PICO.length)]);
    chatTimer = rnd(14, 22);
    return;
  }
  if (here.length === 1) {
    const a = agents[here[0]];
    say(a, SOLO[a.key][Math.floor(Math.random() * SOLO[a.key].length)]);
    chatTimer = rnd(14, 22);
    return;
  }
  const t = pickTalk(here);
  if (t.who.length < 2) { chatTimer = 4; return; }
  chat = { ...t, i: -1, t: 0, ready: false };
  const [A, B] = t.who.map(k => agents[k]);
  // A が B のそばまで歩いていく(遠いときだけ)
  [A, B].forEach(a => { a.state = 'chat'; a.path = null; });
  const dx = A.x - B.x, dz = A.z - B.z, d = Math.hypot(dx, dz);
  if (d > 2.2) {
    const nx = B.x + dx / d * 1.3, nz = B.z + dz / d * 1.3;
    A.spot = null;
    A.path = { x: nx, z: nz, then: null };
  }
}

function updateChat(dt) {
  if (!chat) {
    chatTimer -= dt;
    if (chatTimer <= 0) startChat();
    return;
  }
  const [A, B] = chat.who.map(k => agents[k]);
  if (!A || !B) { endChat(); return; }
  if (A.path) return;   // まだ歩いている
  // 向き合う
  A.faceTo = { x: B.x, z: B.z }; B.faceTo = { x: A.x, z: A.z };
  chat.t -= dt;
  if (chat.t <= 0) {
    chat.i++;
    if (chat.i >= chat.lines.length) { endChat(); return; }
    const [w, text] = chat.lines[chat.i];
    const a = agents[w];
    say(a, text);
    chat.t = a ? a.bubble.t * 0.82 : 2;
  }
}

// ---------- 毎フレーム ----------
let T = 0;
const tmpV = new THREE.Vector2();
function stepAgent(a, dt) {
  const speed = 1.25;
  if (a.path) {
    const dx = a.path.x - a.x, dz = a.path.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.08) {
      a.path = null;
      if (a.state === 'walk') { a.state = 'idle'; a.timer = rnd(5, 11); }
      a.faceTo = a.spot && a.spot.look ? { x: a.spot.look.x, z: a.spot.look.z } : (a.state === 'chat' ? a.faceTo : { x: a.x, z: a.z + 5 });
    } else {
      // 机などをよけながら進む
      tmpV.set(dx / d, dz / d);
      if (d > 0.9) OBST.forEach(o => {
        const ox = a.x - o.x, oz = a.z - o.z, od = Math.hypot(ox, oz);
        if (od < o.r + 0.3) tmpV.x += ox / od * 1.2, tmpV.y += oz / od * 1.2;
      });
      tmpV.normalize();
      const step = Math.min(d, speed * dt);
      a.x += tmpV.x * step; a.z += tmpV.y * step;
      a.x = clamp(a.x, -W + 0.8, W - 0.8); a.z = clamp(a.z, ZB + 0.9, 3.4);
      const want = Math.atan2(tmpV.x, tmpV.y);
      a.ry += angDiff(a.ry, want) * Math.min(1, dt * 8);
      a.walkT += dt * 9;
    }
  } else if (a.faceTo) {
    const want = Math.atan2(a.faceTo.x - a.x, a.faceTo.z - a.z);
    a.ry += angDiff(a.ry, want) * Math.min(1, dt * 5);
  }
  if (a.state === 'idle') {
    a.timer -= dt;
    // 立ち止まっている間に、ときどきこちらを向く
    if (!a.path && !a.turned && a.timer < 3 && Math.random() < dt * 0.5) { a.turned = true; a.faceTo = { x: cam.position.x * 0.3 + a.x * 0.7, z: cam.position.z }; }
    if (a.timer <= 0) {
      const s = pickSpot(a);
      a.turned = false;
      if (s) { a.spot = s; walkTo(a, s.x + rnd(-0.2, 0.2), s.z + rnd(-0.2, 0.2)); } else a.timer = rnd(3, 6);
    }
  }
  const walking = !!a.path;
  const sw = walking ? Math.sin(a.walkT) * 0.6 : 0;
  a.legL.rotation.x = sw; a.legR.rotation.x = -sw;
  const talking = a.talkT > 0;
  a.talkT = Math.max(0, (a.talkT || 0) - dt);
  a.armL.rotation.x = walking ? -sw * 0.8 : talking ? -0.5 + Math.sin(T * 6) * 0.25 : 0;
  a.armR.rotation.x = walking ? sw * 0.8 : 0;
  a.armL.rotation.z = -0.08; a.armR.rotation.z = 0.08;
  a.fig.position.y = walking ? Math.abs(Math.cos(a.walkT)) * 0.05 : Math.sin(T * 2 + a.x) * 0.012;
  a.head.rotation.x = talking ? Math.sin(T * 9) * 0.05 : 0;
  a.head.rotation.y = !walking && !talking ? Math.sin(T * 0.6 + a.z * 3) * 0.3 : 0;
  a.root.position.set(a.x, 0, a.z);
  a.root.rotation.y = a.ry;
}
const angDiff = (a, b) => { let d = b - a; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2; return d; };

// ピコはふわふわ飛び回る
let picoTarget = { x: 1.5, y: 2.4, z: 0.5 }, picoTimer = 0;
function stepPico(dt) {
  const p = pico;
  picoTimer -= dt;
  if (picoTimer <= 0) { picoTarget = { x: rnd(-6, 6), y: rnd(2.0, 3.0), z: rnd(-3.5, 2.2) }; picoTimer = rnd(5, 10); }
  const pos = p.root.position;
  pos.x += (picoTarget.x - pos.x) * Math.min(1, dt * 0.6);
  pos.z += (picoTarget.z - pos.z) * Math.min(1, dt * 0.6);
  p.fig.position.y = picoTarget.y + Math.sin(T * 2.2) * 0.12;
  p.ring.rotation.z += dt * 2;
  const want = Math.atan2(picoTarget.x - pos.x, picoTarget.z - pos.z + 3);
  p.root.rotation.y += angDiff(p.root.rotation.y, want) * Math.min(1, dt * 2);
  p.shadow.material.opacity = 0.6;
}

// 商人の出入り
function stepMerchant(dt) {
  if (merchState === 'arriving') {
    merchT += dt;
    const k = Math.min(1, merchT / 3.2), e = 1 - Math.pow(1 - k, 3);
    merchShip.visible = true;
    merchShip.position.set(MERCH_AT.x - 70 * (1 - e), MERCH_AT.y + 6 * (1 - e), MERCH_AT.z);
    if (k >= 1 && !garan) {
      garan = { ...makePerson('garan'), key: 'garan', x: DOOR.x - 0.8, z: DOOR.z, ry: -PI / 2, state: 'walk', path: null, walkT: 0, talkT: 0 };
      garan.hit.userData.agent = 'garan';
      room.add(garan.root);
      garan.path = { x: STALL.x - 0.9, z: STALL.z + 0.7 };
      stall.visible = true;
    }
    if (garan && !garan.path) { merchState = 'here'; garan.faceTo = { x: garan.x - 2, z: 12 }; say(garan, 'まいど!行商人のガランだよ。いい品が入ってるよ'); }
  } else if (merchState === 'leaving') {
    merchT += dt;
    if (garan && !garan.path) { room.remove(garan.root); if (garan.bubble) garan.bubble.el.remove(); garan = null; stall.visible = false; }
    if (!garan) {
      const k = Math.min(1, merchT / 3.5);
      merchShip.position.x = MERCH_AT.x + 80 * k * k;
      if (k >= 1) { merchShip.visible = false; merchState = 'none'; }
    }
  }
  if (garan) {
    garan.state = 'walk';
    stepAgent(garan, dt);
    if (!garan.path) garan.state = 'stay';
  }
  if (merchShip.visible) merchShip.position.y += Math.sin(T * 0.8) * 0.004;
}

function updateTags() {
  const show = (key, on) => { const t = tags[key]; if (!t) return; t.el.hidden = !on; if (!on) return; const p = project(t.obj, t.yOff); t.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`; };
  show('hangar', true); show('dispatch', true); show('workshop', true);
  show('shop', !!garan && merchState === 'here');
}
function updateBubbles(dt) {
  const list = [...present(), pico, garan].filter(a => a && a.bubble);
  list.forEach(a => {
    const b = a.bubble;
    b.t -= dt;
    if (b.t <= 0 && b.el.classList.contains('in')) { b.el.classList.remove('in'); b.el.classList.add('out'); }
    const p = project(a.head || a.root, (a.key === 'pico' ? 0.3 : 0.38));
    const x = clamp(p.x, 90, view.LW - 90), y = clamp(p.y, 70, view.LH - 120);
    b.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
  });
}

export function updateStation(dt) {
  T += dt;
  holoSpin.rotation.y += dt * 0.5;
  holoLight.intensity = 1.1 + Math.sin(T * 3) * 0.12;
  doorLight.color.setHex(merchState === 'arriving' || merchState === 'leaving' ? (Math.sin(T * 10) > 0 ? 0xffb84d : 0x5a3a10) : 0xffb84d);
  outside.rotation.y = Math.sin(T * 0.05) * 0.01;
  shipHolder.position.y = SHIP_AT.y + Math.sin(T * 0.7) * 0.12;
  shipHolder.rotation.z = Math.sin(T * 0.5) * 0.02;
  present().forEach(a => stepAgent(a, dt));
  if (pico) stepPico(dt);
  stepMerchant(dt);
  updateChat(dt);
  updateTags();
  updateBubbles(dt);
}
export function renderStation() {
  renderer.render(scene, cam);
  needRender = false;
}
export const stationNeedsRender = () => needRender;

// 拠点に入ったとき:いる仲間・船・商人を今の状態に合わせる
export function refreshStation() {
  refreshShip();
  const here = save.crew.map(c => c.key).filter(k => !crewBusy(k));
  Object.keys(agents).forEach(k => { if (!here.includes(k)) removeAgent(k); });
  here.forEach((k, i) => {
    if (agents[k]) return;
    const s = pickSpot({ key: k, spot: null }) || SPOTS[i % SPOTS.length];
    const a = spawnAgent(k, s);
    a.spot = s;
    a.faceTo = s.look ? { x: s.look.x, z: s.look.z } : { x: s.x, z: s.z + 5 };
    a.ry = Math.atan2(a.faceTo.x - a.x, a.faceTo.z - a.z);
  });
  if (!pico) {
    pico = { ...makePico(), key: 'pico' };
    pico.hit.userData.agent = 'pico';
    pico.root.position.set(1.5, 0, 0.5);
    room.add(pico.root);
  }
  const m = save.merchant.here;
  if (m && (merchState === 'none' || merchState === 'leaving')) {
    merchState = 'arriving'; merchT = 0;
    if (garan) { room.remove(garan.root); garan = null; }
  } else if (!m && (merchState === 'here' || merchState === 'arriving')) {
    merchState = 'leaving'; merchT = 0;
    if (garan) { garan.state = 'walk'; garan.path = { x: DOOR.x - 0.8, z: DOOR.z }; say(garan, GARAN[3]); }
  }
  needRender = true;
}
// 来てすぐ(拠点を開いたときにすでにいる)なら、歩いてくる演出を省く
export function merchantInstant() {
  if (merchState !== 'arriving') return;
  merchT = 99;
  merchShip.visible = true; merchShip.position.copy(MERCH_AT);
  garan = { ...makePerson('garan'), key: 'garan', x: STALL.x - 0.9, z: STALL.z + 0.7, ry: -0.6, state: 'stay', path: null, walkT: 0, talkT: 0 };
  garan.hit.userData.agent = 'garan';
  garan.faceTo = { x: garan.x - 2, z: 12 };
  room.add(garan.root);
  stall.visible = true;
  merchState = 'here';
}
export function stationSay(key, text) {
  const a = key === 'pico' ? pico : key === 'garan' ? garan : agents[key];
  if (a) say(a, text);
}
// だれかに一言しゃべらせる(仲間がいなければピコ)
export function someoneSays(text, picoText = text) {
  const list = present().filter(a => a.state !== 'chat');
  const a = list.length ? list[Math.floor(Math.random() * list.length)] : pico;
  if (a) say(a, a === pico ? picoText : text);
}

// ---------- タップ ----------
makeTag('hangar', '格納庫', shipHolder, 2.3);
makeTag('dispatch', '派遣', holo, 2.95);
makeTag('workshop', '工房', bench, 3.0);
const shopTag = makeTag('shop', '買い物', stall, 2.7);
shopTag.sub.textContent = 'ガラン';
export function setTagSub(key, text, hot) {
  const t = tags[key]; if (!t) return;
  t.sub.textContent = text || '';
  t.el.classList.toggle('hot', !!hot);
}
layer.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tag]');
  if (b && actions[b.dataset.tag]) actions[b.dataset.tag]();
});

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function stationTap(clientX, clientY) {
  const [lx, ly] = toLocal(clientX, clientY);
  ndc.set(lx / view.LW * 2 - 1, -(ly / view.LH * 2 - 1));
  ray.setFromCamera(ndc, cam);
  const targets = [...present().map(a => a.hit), shipHit, holoHit, benchHit];
  if (pico) targets.push(pico.hit);
  if (garan && merchState === 'here') targets.push(garan.hit);
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) return false;
  const o = hit.object;
  if (o === shipHit) return actions.hangar && (actions.hangar(), true);
  if (o === holoHit) return actions.dispatch && (actions.dispatch(), true);
  if (o === benchHit) return actions.workshop && (actions.workshop(), true);
  const key = o.userData.agent;
  if (key === 'garan') return actions.shop && (actions.shop(), true);
  if (key === 'pico') { say(pico, PICO[Math.floor(Math.random() * PICO.length)]); return true; }
  const a = agents[key];
  if (a && a.state !== 'chat') {
    const lines = (actions.lineFor && actions.lineFor(key)) || SOLO[key];
    say(a, lines[Math.floor(Math.random() * lines.length)]);
    a.faceTo = { x: cam.position.x, z: cam.position.z };
    a.path = null; a.state = 'idle'; a.timer = rnd(4, 7);
  }
  return true;
}
