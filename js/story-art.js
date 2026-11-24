// 物語画面の絵。画像ファイルを使わず、場面ごとにキャンバスへ描く
import { TYPES } from './data.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const TAU = Math.PI * 2;

function glowDot(c, x, y, r, color, a = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = a; c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.globalAlpha = 1;
}
function space(c, W, H, seed = 1, tint = ['#05070f', '#0b1226']) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const r = rng(seed);
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H, s = r() < 0.08 ? 1.6 : 0.8;
    c.globalAlpha = 0.3 + r() * 0.7;
    c.fillStyle = r() < 0.15 ? '#ffe2b0' : '#cfe0ff';
    c.fillRect(x, y, s, s);
  }
  c.globalAlpha = 1;
}
function nebula(c, x, y, r, color, a = 0.35) { glowDot(c, x, y, r, color, a); }
function poly(c, pts, fill, stroke) {
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}
function rock(c, r, x, y, s, fill, hot) {
  const n = 7, pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * 0.5, d = s * (0.7 + r() * 0.4); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); }
  if (hot) glowDot(c, x, y, s * 1.8, 'rgba(255,90,40,0.6)', 0.5);
  poly(c, pts, fill);
  if (hot) { c.strokeStyle = 'rgba(255,140,60,0.9)'; c.lineWidth = Math.max(1, s * 0.06); c.stroke(); }
}

// ハルシオン号の影(古い探査船)
function halcyonShip(c, x, y, s, color = '#2a3446', lit = false) {
  c.save(); c.translate(x, y); c.scale(s, s);
  poly(c, [[-120, 0], [-60, -22], [70, -20], [130, -6], [140, 4], [70, 22], [-60, 24]], color);
  poly(c, [[-40, -22], [-10, -60], [30, -60], [20, -20]], color);
  poly(c, [[-40, 24], [-10, 58], [30, 58], [20, 22]], color);
  poly(c, [[-150, -12], [-120, -12], [-120, 14], [-150, 14]], color);
  c.fillStyle = lit ? 'rgba(255,200,120,0.9)' : 'rgba(140,180,220,0.35)';
  for (let i = 0; i < 6; i++) c.fillRect(-40 + i * 18, -6, 7, 5);
  c.restore();
}
// 星の灯台(岩の上の高い塔)
function lighthouse(c, W, H, lit, seed) {
  space(c, W, H, seed, lit ? ['#0a0c1c', '#1a1830'] : ['#040509', '#0c0f1c']);
  nebula(c, W * 0.2, H * 0.25, W * 0.35, lit ? 'rgba(255,220,160,0.35)' : 'rgba(90,60,140,0.35)');
  const bx = W * 0.58, top = H * 0.14, base = H * 0.78;
  if (lit) {
    // 光の帯
    c.save(); c.globalCompositeOperation = 'lighter';
    [[-1, 0.18], [1, 0.14], [-1, -0.08], [1, -0.05]].forEach(([dir, k]) => {
      const g = c.createLinearGradient(bx, top, bx + dir * W, top + k * H * 4);
      g.addColorStop(0, 'rgba(255,240,200,0.55)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(bx, top + 6); c.lineTo(bx + dir * W * 1.1, top + k * H * 4 - H * 0.12); c.lineTo(bx + dir * W * 1.1, top + k * H * 4 + H * 0.12); c.closePath(); c.fill();
    });
    c.restore();
  }
  // 地面(大きな小惑星)
  c.fillStyle = '#151a26';
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, base + H * 0.06);
  c.quadraticCurveTo(W * 0.3, base - H * 0.05, W * 0.6, base); c.quadraticCurveTo(W * 0.85, base + H * 0.02, W, base - H * 0.04); c.lineTo(W, H); c.fill();
  // 塔
  const tw = W * 0.035;
  poly(c, [[bx - tw * 1.4, base], [bx - tw * 0.7, top + H * 0.08], [bx + tw * 0.7, top + H * 0.08], [bx + tw * 1.4, base]], '#232a3a');
  for (let i = 1; i < 6; i++) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(bx - tw * 1.3, top + H * 0.08 + i * (base - top) / 6.5, tw * 2.6, 3); }
  poly(c, [[bx - tw * 1.1, top + H * 0.08], [bx, top - H * 0.02], [bx + tw * 1.1, top + H * 0.08]], '#2e3648');
  glowDot(c, bx, top + H * 0.04, lit ? W * 0.12 : W * 0.025, lit ? 'rgba(255,245,215,1)' : 'rgba(255,190,120,0.6)', lit ? 1 : 0.6);
  if (lit) glowDot(c, bx, top + H * 0.04, W * 0.03, '#ffffff');
  // ふもとのハルシオン号
  halcyonShip(c, W * 0.3, base - H * 0.02, Math.min(W, H) / 900, '#1f2636', lit);
}

function station(c, W, H, lit) {
  // 窓の外
  space(c, W, H, 7);
  nebula(c, W * 0.3, H * 0.4, W * 0.3, 'rgba(70,110,170,0.35)');
  nebula(c, W * 0.75, H * 0.3, W * 0.25, 'rgba(140,70,150,0.3)');
  if (lit) {
    glowDot(c, W * 0.66, H * 0.36, W * 0.09, 'rgba(255,240,200,0.9)');
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,240,200,0.45)'; c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; c.beginPath(); c.moveTo(W * 0.66, H * 0.36); c.lineTo(W * 0.66 + Math.cos(a) * W * 0.14, H * 0.36 + Math.sin(a) * W * 0.14); c.stroke(); }
    c.restore();
    glowDot(c, W * 0.66, H * 0.36, W * 0.012, '#ffffff');
  }
  // 室内の枠
  c.fillStyle = '#141a26';
  c.fillRect(0, 0, W, H * 0.1); c.fillRect(0, H * 0.72, W, H * 0.28);
  c.fillRect(0, 0, W * 0.08, H); c.fillRect(W * 0.92, 0, W * 0.08, H);
  c.fillStyle = '#1e2636';
  [0.36, 0.64].forEach(x => c.fillRect(W * x - 4, H * 0.1, 8, H * 0.62));
  c.fillStyle = 'rgba(98,224,255,0.55)'; c.fillRect(W * 0.08, H * 0.72, W * 0.84, 2);
  // ピコ
  const px = W * 0.8, py = H * 0.62, pr = Math.min(W, H) * 0.07;
  glowDot(c, px, py, pr * 2.2, 'rgba(98,224,255,0.25)');
  c.fillStyle = '#e9edf5'; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
  c.fillStyle = '#62e0ff'; c.beginPath(); c.arc(px - pr * 0.15, py, pr * 0.32, 0, TAU); c.fill();
  c.strokeStyle = '#ffb84d'; c.lineWidth = Math.max(2, pr * 0.1);
  c.beginPath(); c.ellipse(px, py + pr * 0.1, pr * 1.5, pr * 0.35, 0, 0, TAU); c.stroke();
}

function signal(c, W, H) {
  space(c, W, H, 3, ['#030610', '#06142a']);
  c.strokeStyle = 'rgba(98,224,255,0.1)'; c.lineWidth = 1;
  for (let x = 0; x < W; x += W / 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += H / 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  const mid = H * 0.5;
  const wave = (alpha, width) => {
    c.strokeStyle = `rgba(98,224,255,${alpha})`; c.lineWidth = width;
    c.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const u = x / W;
      let y = Math.sin(u * 80) * H * 0.008;
      // 5回の山が2組
      [0.18, 0.62].forEach(s => { for (let k = 0; k < 5; k++) { const cx = s + k * 0.045; y -= Math.exp(-Math.pow((u - cx) / 0.008, 2)) * H * 0.28; } });
      x === 0 ? c.moveTo(x, mid + y) : c.lineTo(x, mid + y);
    }
    c.stroke();
  };
  c.save(); c.globalCompositeOperation = 'lighter';
  wave(0.15, 10); wave(0.35, 4); wave(1, 1.6);
  c.restore();
}

function debris(c, W, H, seed = 5, hotEvery = 4) {
  space(c, W, H, seed, ['#06070c', '#140e14']);
  nebula(c, W * 0.6, H * 0.5, W * 0.4, 'rgba(160,60,40,0.25)');
  const r = rng(seed * 13);
  for (let i = 0; i < 46; i++) {
    const s = 4 + r() * r() * Math.min(W, H) * 0.12;
    rock(c, r, r() * W, r() * H, s, i % 3 ? '#2b2f3a' : '#3a3f4c', i % hotEvery === 0);
  }
}

function blackbox(c, W, H) {
  debris(c, W, H, 9, 7);
  c.fillStyle = 'rgba(4,6,12,0.45)'; c.fillRect(0, 0, W, H);
  const x = W * 0.5, y = H * 0.5, s = Math.min(W, H) * 0.16;
  glowDot(c, x, y, s * 2.2, 'rgba(255,150,60,0.35)');
  c.save(); c.translate(x, y); c.rotate(-0.25);
  c.fillStyle = '#d9792b'; c.fillRect(-s, -s * 0.62, s * 2, s * 1.24);
  c.fillStyle = '#8a4a18'; c.fillRect(-s, -s * 0.62, s * 2, s * 0.18); c.fillRect(-s, s * 0.44, s * 2, s * 0.18);
  c.fillStyle = '#2a1a10'; c.font = `bold ${Math.round(s * 0.26)}px sans-serif`; c.textAlign = 'center'; c.fillText('HALCYON', 0, s * 0.1);
  c.restore();
  glowDot(c, x + s * 0.75, y - s * 0.75, s * 0.35, 'rgba(255,80,60,1)');
}

function storm(c, W, H) {
  space(c, W, H, 11, ['#0a0614', '#1b0d2e']);
  c.save(); c.globalCompositeOperation = 'lighter';
  const cx = W * 0.55, cy = H * 0.45;
  for (let i = 0; i < 26; i++) {
    c.strokeStyle = `rgba(${170 + i * 2},${90 + i},255,${0.05 + (i % 4) * 0.03})`;
    c.lineWidth = 2 + (i % 5) * 2;
    c.beginPath(); c.ellipse(cx, cy, W * (0.08 + i * 0.022), H * (0.04 + i * 0.012), 0.3, i * 0.7, i * 0.7 + 3.6); c.stroke();
  }
  glowDot(c, cx, cy, W * 0.08, 'rgba(220,180,255,0.6)');
  c.restore();
  // 塔の残がい
  c.fillStyle = '#120c1c';
  [[0.12, 0.42], [0.26, 0.3], [0.8, 0.36], [0.92, 0.5]].forEach(([x, h]) => {
    const bx = W * x, w = W * 0.03;
    poly(c, [[bx - w, H], [bx - w * 0.6, H * (1 - h)], [bx + w * 0.2, H * (1 - h) - H * 0.03], [bx + w * 0.6, H * (1 - h) + H * 0.02], [bx + w, H]], '#160f22');
  });
}

function merchant(c, W, H) {
  space(c, W, H, 13);
  nebula(c, W * 0.3, H * 0.6, W * 0.35, 'rgba(200,120,60,0.25)');
  const x = W * 0.52, y = H * 0.5, s = Math.min(W, H) / 260;
  c.save(); c.translate(x, y); c.scale(s, s);
  glowDot(c, -110, 0, 40, 'rgba(255,170,90,0.7)');
  c.fillStyle = '#8a6a4a'; c.fillRect(-70, -18, 140, 40);
  c.fillStyle = '#5c4632'; c.fillRect(-100, -14, 32, 32);
  poly(c, [[-30, -18], [40, -18], [30, -50], [-20, -50]], '#b5452f');
  c.fillStyle = '#8a6a3f'; [-50, -10, 30].forEach(cx => c.fillRect(cx, 22, 22, 18));
  glowDot(c, 62, 4, 14, 'rgba(255,200,110,1)'); glowDot(c, -46, 4, 12, 'rgba(255,200,110,1)');
  c.restore();
}

function pod(c, W, H) {
  planet(c, W, H, 'gas');
  const x = W * 0.42, y = H * 0.4, s = Math.min(W, H) * 0.06;
  glowDot(c, x, y, s * 3, 'rgba(255,240,200,0.5)');
  c.fillStyle = '#e9edf5'; c.beginPath(); c.ellipse(x, y, s, s * 0.7, -0.4, 0, TAU); c.fill();
  c.fillStyle = '#62e0ff'; c.beginPath(); c.arc(x + s * 0.2, y - s * 0.1, s * 0.28, 0, TAU); c.fill();
}

function planet(c, W, H, typeKey) {
  const t = TYPES.find(x => x.key === typeKey) || TYPES[4];
  space(c, W, H, 17 + typeKey.length);
  const R = Math.min(W, H) * 0.62, cx = W * 0.62, cy = H * 0.95;
  glowDot(c, cx, cy, R * 1.25, t.css, 0.45);
  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
  c.fillStyle = t.css; c.fillRect(cx - R, cy - R, R * 2, R * 2);
  const r = rng(typeKey.length * 31);
  for (let i = 0; i < 9; i++) {
    c.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.12})`;
    c.fillRect(cx - R, cy - R + r() * R * 2, R * 2, 6 + r() * R * 0.12);
  }
  for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.beginPath(); c.arc(cx - R + r() * R * 2, cy - R + r() * R, 4 + r() * R * 0.08, 0, TAU); c.fill(); }
  const sh = c.createRadialGradient(cx - R * 0.4, cy - R * 0.5, R * 0.2, cx, cy, R);
  sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = sh; c.fillRect(cx - R, cy - R, R * 2, R * 2);
  c.restore();
  if (typeKey === 'any') {
    c.strokeStyle = 'rgba(255,210,122,0.6)'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(cx, cy, R * 1.35, R * 0.22, -0.15, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  }
}

// key の絵を描く
export function paintArt(cv, key) {
  const W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (key === 'station' || key === 'station_lit') station(c, W, H, key === 'station_lit');
  else if (key === 'signal') signal(c, W, H);
  else if (key === 'halcyon') { space(c, W, H, 21, ['#05070f', '#101626']); nebula(c, W * 0.5, H * 0.5, W * 0.4, 'rgba(98,160,220,0.2)'); halcyonShip(c, W * 0.5, H * 0.52, Math.min(W, H) / 330, '#2a3446'); }
  else if (key === 'debris') debris(c, W, H);
  else if (key === 'blackbox') blackbox(c, W, H);
  else if (key === 'storm') storm(c, W, H);
  else if (key === 'lighthouse' || key === 'lighthouse_lit') lighthouse(c, W, H, key === 'lighthouse_lit', 23);
  else if (key === 'merchant') merchant(c, W, H);
  else if (key === 'pod') pod(c, W, H);
  else if (key.startsWith('planet:')) planet(c, W, H, key.slice(7));
  else space(c, W, H, 1);
}
