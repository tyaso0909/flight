// 船の3Dモデル(3種類)と、格納庫で船を表示するビューア
// モデルは強化の段階で見た目が変わる:燃料タンク=外付けタンク、エンジン=ノズルの大きさと光、
// 燃費=吸気口、姿勢制御=小型スラスター、装甲=装甲板
// 付けたパーツも一部は見た目に出る:予備燃料タンク、アフターバーナー、補強フレーム、着陸ギア、耐熱シールド
import { clamp } from './dom.js';
import { toLocalDelta } from './orientation.js';

const PI = Math.PI;

const M = {
  hull: new THREE.MeshStandardMaterial({ color: 0xc9d2de, roughness: 0.55, metalness: 0.35, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 0.6, metalness: 0.5, flatShading: true }),
  accent: new THREE.MeshStandardMaterial({ color: 0xffb84d, roughness: 0.5, metalness: 0.2, flatShading: true }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1b3a52, roughness: 0.15, metalness: 0.6, emissive: 0x0d3550, emissiveIntensity: 0.8 }),
  tank: new THREE.MeshStandardMaterial({ color: 0x9fb7d6, roughness: 0.45, metalness: 0.5, flatShading: true }),
  plate: new THREE.MeshStandardMaterial({ color: 0x5b6573, roughness: 0.7, metalness: 0.4, flatShading: true }),
  heat: new THREE.MeshStandardMaterial({ color: 0x6b2a1c, roughness: 0.85, metalness: 0.2, emissive: 0x2a0a04, flatShading: true }),
  burner: new THREE.MeshBasicMaterial({ color: 0xff7a3a })
};
const thinMat = M.hull.clone();
thinMat.side = THREE.DoubleSide;

// ---------- 形を作る道具 ----------
function part(parent, geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  m.rotation.set(r[0], r[1], r[2]);
  if (s) m.scale.set(s[0], s[1], s[2]);
  parent.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const ball = () => new THREE.SphereGeometry(1, 14, 10);
// 前後(Z)方向の円柱。前が -Z
const cylZ = (rFront, rBack, len, seg = 12) => { const g = new THREE.CylinderGeometry(rBack, rFront, len, seg); g.rotateX(PI / 2); return g; };
// 先端が前(-Z)を向く円すい
const coneFwd = (r, len, seg = 12) => { const g = new THREE.ConeGeometry(r, len, seg); g.rotateX(-PI / 2); return g; };
// 水平な板(翼)。pts は [横, 前] の点
function flatGeo(pts, depth = 0.06) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(p => sh.lineTo(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  g.rotateX(-PI / 2);
  return g;
}
// 垂直な板(尾翼)。pts は [後ろ, 上] の点
function finGeo(pts, depth = 0.05) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(p => sh.lineTo(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-PI / 2);
  return g;
}
// 左右対称の2か所
const sym = (x, y, z, o = {}) => [{ x, y, z, ...o }, { x: -x, y, z, ...o }];

// ---------- 強化で付く部品 ----------
function addTank(g, t, lv) {
  const s = 1 + 0.07 * lv, r = t.r * s, len = t.len * (0.9 + 0.1 * s);
  const tg = new THREE.Group();
  part(tg, cylZ(r, r, len), M.tank);
  part(tg, ball(), M.tank, [0, 0, -len / 2], [0, 0, 0], [r, r, r]);
  part(tg, ball(), M.tank, [0, 0, len / 2], [0, 0, 0], [r, r, r]);
  part(tg, cylZ(r * 1.07, r * 1.07, len * 0.12), M.accent);
  tg.position.set(t.x, t.y, t.z);
  g.add(tg);
}
function addPlate(g, a) { part(g, box(a.w, a.h, a.d), M.plate, [a.x, a.y, a.z]); }
function addRcs(g, a) {
  part(g, box(0.13, 0.1, 0.18), M.dark, [a.x, a.y, a.z]);
  part(g, box(0.135, 0.025, 0.06), M.accent, [a.x, a.y + 0.06, a.z - 0.03]);
}
function addIntake(g, a, lv) { part(g, box(0.12, 0.16, 0.42), lv >= 5 ? M.accent : M.dark, [a.x, a.y, a.z]); }
function addNozzle(g, e, lv) {
  const s = 1 + 0.07 * lv;
  part(g, cylZ(e.r * 0.8 * s, e.r * 1.05 * s, 0.28, 14), M.dark, [e.x, e.y, e.z + 0.1]);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x245e86).lerp(new THREE.Color(0xd8f4ff), lv / 5) });
  glow.userData.own = true;
  part(g, new THREE.CircleGeometry(e.r * 0.86 * s, 20), glow, [e.x, e.y, e.z + 0.245]);
  if (lv >= 4) part(g, new THREE.TorusGeometry(e.r * 1.08 * s, 0.03, 6, 24), M.accent, [e.x, e.y, e.z + 0.24]);
}

// 段階ごとに見せる部品のまとまりの数
const TANK_G = [0, 1, 1, 2, 2, 2];
const RCS_G = [0, 1, 1, 2, 2, 3];
const INTAKE_G = [0, 1, 1, 1, 2, 2];
function applyUpgrades(g, slots, lv) {
  const take = (groups, n) => groups.slice(0, n).flat();
  take(slots.tanks, TANK_G[lv.tank]).forEach(t => addTank(g, t, lv.tank));
  take(slots.armor, Math.min(lv.armor, slots.armor.length)).forEach(a => addPlate(g, a));
  take(slots.rcs, RCS_G[lv.gyro]).forEach(a => addRcs(g, a));
  take(slots.intakes, INTAKE_G[lv.eff]).forEach(a => addIntake(g, a, lv.eff));
  slots.engines.forEach(e => addNozzle(g, e, lv.engine));
}

// パーツの見た目
function applyParts(g, slots, parts) {
  const has = (k) => parts.includes(k);
  if (has('subtank')) slots.extraTank.forEach(t => addTank(g, t, 0));
  if (has('afterburner')) slots.engines.forEach(e => part(g, new THREE.TorusGeometry(e.r * 1.2, 0.04, 6, 24), M.burner, [e.x, e.y, e.z + 0.3]));
  if (has('frame')) slots.rails.forEach(a => part(g, box(a.w, a.h, a.d), M.dark, [a.x, a.y, a.z]));
  if (has('gear')) slots.legs.forEach(a => {
    part(g, box(0.06, 0.3, 0.06), M.dark, [a.x, a.y, a.z]);
    part(g, box(0.2, 0.03, 0.2), M.dark, [a.x, a.y - 0.16, a.z]);
  });
  if (has('heatshield')) {
    const sh = slots.shield;
    if (sh.cone) part(g, coneFwd(sh.r, sh.len, 12), M.heat, [sh.x, sh.y, sh.z]);
    else part(g, box(sh.w, sh.h, sh.d), M.heat, [sh.x, sh.y, sh.z]);
  }
}

// ---------- 船の形 ----------
function scout(g) {
  part(g, cylZ(0.36, 0.5, 2.4, 10), M.hull, [0, 0, 0.1]);
  part(g, coneFwd(0.36, 1.1, 10), M.hull, [0, 0, -1.65]);
  part(g, coneFwd(0.13, 0.32, 10), M.dark, [0, 0, -2.08]);
  part(g, ball(), M.glass, [0, 0.33, -0.7], [0, 0, 0], [0.26, 0.2, 0.6]);
  part(g, box(0.09, 0.02, 1.5), M.accent, [0, 0.455, 0.35], [-0.058, 0, 0]);
  const wing = flatGeo([[0.3, 0.6], [0.3, -0.6], [1.55, -0.9], [1.55, -0.55]]);
  part(g, wing, thinMat, [0, -0.05, 0.35]);
  part(g, wing, thinMat, [0, -0.05, 0.35], [0, 0, 0], [-1, 1, 1]);
  part(g, finGeo([[0, 0], [0.75, 0], [0.85, 0.62], [0.55, 0.62]]), thinMat, [0, 0.38, 0.45]);
  part(g, cylZ(0.46, 0.52, 0.4, 12), M.dark, [0, 0, 1.45]);
  return {
    engines: [{ x: 0, y: 0, z: 1.55, r: 0.4 }],
    tanks: [[{ x: 0, y: -0.6, z: 0.25, len: 1.3, r: 0.17 }], sym(1.58, -0.1, 1.02, { len: 0.8, r: 0.1 })],
    armor: [
      sym(0.47, 0.02, 0.35, { w: 0.05, h: 0.34, d: 0.95 }),
      [{ x: 0, y: 0.48, z: 0.95, w: 0.42, h: 0.05, d: 0.5 }],
      sym(0.38, 0, -0.85, { w: 0.05, h: 0.3, d: 0.6 }),
      [{ x: 0, y: -0.48, z: 0.9, w: 0.42, h: 0.05, d: 0.55 }],
      sym(0.36, 0.3, 1.2, { w: 0.05, h: 0.2, d: 0.32 })
    ],
    rcs: [sym(1.56, 0.08, 1.0), sym(0.3, 0.06, -1.45), sym(0.5, 0.36, 1.25)],
    intakes: [sym(0.5, -0.18, -0.35), sym(0.44, -0.3, 0.85)],
    extraTank: sym(0.78, -0.2, 0.5, { len: 0.75, r: 0.1 }),
    rails: sym(0.53, -0.14, 0.35, { w: 0.04, h: 0.06, d: 1.8 }),
    legs: [{ x: 0, y: -0.62, z: -0.9 }, ...sym(0.55, -0.35, 0.75)],
    shield: { cone: true, x: 0, y: 0, z: -1.78, r: 0.4, len: 0.55 }
  };
}

function hauler(g) {
  part(g, box(1.5, 1.0, 2.6), M.hull, [0, 0, 0.2]);
  part(g, box(1.1, 0.62, 0.7), M.hull, [0, 0.12, -1.42]);
  part(g, box(0.92, 0.24, 0.04), M.glass, [0, 0.24, -1.79]);
  part(g, box(1.52, 0.1, 0.34), M.accent, [0, 0.2, -0.7]);
  [1, -1].forEach(sx => {
    part(g, box(0.46, 0.72, 1.9), M.dark, [sx * 1.0, -0.05, 0.35]);
    part(g, box(0.47, 0.08, 0.3), M.accent, [sx * 1.0, 0.2, -0.3]);
    part(g, box(0.3, 0.12, 0.5), M.hull, [sx * 0.8, 0, 0.35]);
    part(g, cylZ(0.3, 0.34, 0.4, 12), M.dark, [sx * 0.45, 0, 1.7]);
    part(g, finGeo([[0, 0], [0.5, 0], [0.6, 0.4], [0.35, 0.4]]), thinMat, [sx * 0.55, 0.48, 1.0]);
  });
  return {
    engines: [{ x: 0.45, y: 0, z: 1.8, r: 0.26 }, { x: -0.45, y: 0, z: 1.8, r: 0.26 }],
    tanks: [[{ x: 0, y: 0.66, z: 0.4, len: 1.6, r: 0.16 }], sym(0.44, 0.62, 0.5, { len: 1.3, r: 0.12 })],
    armor: [
      [{ x: 0, y: -0.32, z: -1.13, w: 1.3, h: 0.3, d: 0.05 }],
      sym(1.245, 0, 0.35, { w: 0.04, h: 0.5, d: 1.4 }),
      [{ x: 0, y: 0.525, z: 1.25, w: 1.2, h: 0.05, d: 0.4 }],
      sym(0.565, 0.12, -1.42, { w: 0.04, h: 0.4, d: 0.55 }),
      [{ x: 0, y: -0.525, z: 0.2, w: 1.2, h: 0.05, d: 1.8 }]
    ],
    rcs: [sym(0.78, 0.55, -0.95), sym(0.78, 0.55, 1.4), sym(1.0, 0.36, 1.2)],
    intakes: [sym(0.6, -0.58, -0.7), sym(0.6, -0.58, 0.9)],
    extraTank: sym(1.0, -0.6, 0.35, { len: 1.3, r: 0.13 }),
    rails: sym(0.7, 0.53, 0.2, { w: 0.06, h: 0.05, d: 2.4 }),
    legs: [...sym(0.6, -0.68, -0.7), ...sym(0.6, -0.68, 1.1)],
    shield: { x: 0, y: -0.12, z: -1.8, w: 1.0, h: 0.14, d: 0.08 }
  };
}

function explorer(g) {
  part(g, cylZ(0.17, 0.17, 3.6, 10), M.dark, [0, 0, 0.15]);
  part(g, ball(), M.hull, [0, 0, -1.75], [0, 0, 0], [0.55, 0.47, 0.66]);
  part(g, ball(), M.glass, [0, 0.2, -2.2], [0, 0, 0], [0.3, 0.18, 0.25]);
  part(g, ball(), M.tank, [0, 0, 0.35], [0, 0, 0], [0.72, 0.72, 0.95]);
  part(g, cylZ(0.74, 0.74, 0.1, 16), M.accent, [0, 0, 0.35]);
  part(g, new THREE.TorusGeometry(1.05, 0.06, 8, 48), M.accent, [0, 0, 0.35]);
  part(g, box(0.06, 0.35, 0.06), M.dark, [0, 0.88, 0.35]);
  part(g, box(0.06, 0.35, 0.06), M.dark, [0, -0.88, 0.35]);
  part(g, box(0.35, 0.06, 0.06), M.dark, [0.88, 0, 0.35]);
  part(g, box(0.35, 0.06, 0.06), M.dark, [-0.88, 0, 0.35]);
  part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), M.dark, [0, 0.62, -1.2]);
  part(g, new THREE.ConeGeometry(0.42, 0.16, 20, 1, true), thinMat, [0, 0.86, -1.2], [PI, 0, 0]);
  part(g, cylZ(0.4, 0.48, 0.55, 12), M.dark, [0, 0, 2.15]);
  return {
    engines: [{ x: 0, y: 0, z: 2.32, r: 0.38 }],
    tanks: [sym(0.62, -0.2, 1.45, { len: 0.9, r: 0.15 }), [{ x: 0, y: -0.5, z: -1.05, len: 0.8, r: 0.14 }]],
    armor: [
      [{ x: 0, y: 0.46, z: -1.6, w: 0.5, h: 0.05, d: 0.55 }],
      sym(0.53, 0, -1.7, { w: 0.05, h: 0.4, d: 0.55 }),
      sym(0.2, 0, 1.3, { w: 0.04, h: 0.26, d: 0.9 }),
      [{ x: 0, y: -0.45, z: -1.6, w: 0.5, h: 0.05, d: 0.55 }],
      [{ x: 0, y: 0.5, z: 2.1, w: 0.4, h: 0.05, d: 0.4 }]
    ],
    rcs: [sym(1.1, 0, 0.35), [{ x: 0, y: 1.1, z: 0.35 }, { x: 0, y: -1.1, z: 0.35 }], sym(0.5, 0.1, -1.95)],
    intakes: [sym(0.26, -0.18, 1.75), [{ x: 0, y: 0.3, z: 1.75 }, { x: 0, y: -0.3, z: 1.75 }]],
    extraTank: [{ x: 0, y: 0.5, z: 1.4, len: 0.8, r: 0.13 }],
    rails: sym(0.2, 0.12, 0.15, { w: 0.04, h: 0.04, d: 3.0 }),
    legs: [{ x: 0, y: -0.6, z: -1.6 }, ...sym(0.45, -0.82, 0.35)],
    shield: { x: 0, y: -0.05, z: -2.42, w: 0.62, h: 0.5, d: 0.06 }
  };
}

const BUILDERS = { scout, hauler, explorer };

// 船のモデルを作る。lv は { tank, engine, eff, gyro, armor } の段階(0〜5)、parts は付けているパーツ
export function buildShip(kind, lv, parts = []) {
  const g = new THREE.Group();
  const slots = BUILDERS[kind](g);
  applyUpgrades(g, slots, lv);
  applyParts(g, slots, parts);
  return g;
}

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (o.material.userData.own) o.material.dispose();
    }
  });
}

// ---------- 格納庫のビューア ----------
export class ShipViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x20170f, 0.8));
    const key = new THREE.DirectionalLight(0xfff1dc, 1.35); key.position.set(3, 4, 2.5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd3ff, 0.9); rim.position.set(-3, 1.5, -3); this.scene.add(rim);

    // 船を載せる台(2本の輪)
    this.stand = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    [[1.55, 1.58], [1.75, 1.765]].forEach(([a, b]) => {
      const r = new THREE.Mesh(new THREE.RingGeometry(a, b, 72), ringMat);
      r.rotation.x = -PI / 2;
      this.stand.add(r);
    });
    this.scene.add(this.stand);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    this.yaw = 0.75; this.pitch = 0.32;
    this.drag = null; this.idleAt = 0; this.pulseT = 0;
    this.running = false; this.last = 0;
    this.loop = this.loop.bind(this);

    canvas.addEventListener('pointerdown', (e) => {
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const [dx, dy] = toLocalDelta(e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      this.yaw -= dx * 0.012;
      this.pitch = clamp(this.pitch + dy * 0.008, -0.25, 1.15);
    });
    const end = (e) => {
      if (this.drag && e.pointerId === this.drag.id) { this.drag = null; this.idleAt = performance.now(); }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  setShip(kind, lv, parts = []) {
    while (this.holder.children.length) {
      const c = this.holder.children.pop();
      disposeTree(c);
    }
    const ship = buildShip(kind, lv, parts);
    const bb = new THREE.Box3().setFromObject(ship);
    const size = bb.getSize(new THREE.Vector3()), center = bb.getCenter(new THREE.Vector3());
    const s = 3.0 / Math.max(size.x, size.y, size.z);
    ship.scale.setScalar(s);
    ship.position.copy(center).multiplyScalar(-s);
    this.holder.add(ship);
    this.stand.position.y = -size.y * s / 2 - 0.22;
  }

  // 強化したときに少しだけ弾ませる
  pulse() { this.pulseT = 0.45; }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }
  stop() { this.running = false; }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.drag && now - this.idleAt > 1500) this.yaw += dt * 0.35;
    this.pulseT = Math.max(0, this.pulseT - dt);
    this.holder.scale.setScalar(1 + 0.07 * Math.sin(this.pulseT / 0.45 * PI));
    const R = 1.9, v = this.camera.fov * PI / 180;
    const hfov = 2 * Math.atan(Math.tan(v / 2) * this.camera.aspect);
    const dist = R / Math.sin(Math.min(v, hfov) / 2);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(dist * cp * Math.sin(this.yaw), dist * Math.sin(this.pitch), dist * cp * Math.cos(this.yaw));
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }
}
