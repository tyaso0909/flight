// 探索画面の地図に使う地形(星の属性ごとに手続きで描く)
const cache = new Map();

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const hashStr = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

function blob(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
function wander(ctx, r, x, y, steps, len, turn) {
  let a = r() * Math.PI * 2;
  ctx.beginPath(); ctx.moveTo(x, y);
  for (let i = 0; i < steps; i++) {
    a += (r() - 0.5) * turn; x += Math.cos(a) * len; y += Math.sin(a) * len;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

const PAINT = {
  ice(ctx, W, H, r) {
    ctx.fillStyle = '#28435e'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) blob(ctx, r() * W, r() * H, 30 + r() * 90, '#b8d8f2', 0.35);
    ctx.strokeStyle = 'rgba(20,40,70,0.7)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 14; i++) wander(ctx, r, r() * W, r() * H, 14, 9, 1.4);
    ctx.strokeStyle = 'rgba(240,250,255,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) wander(ctx, r, r() * W, r() * H, 10, 8, 1.2);
  },
  lava(ctx, W, H, r) {
    ctx.fillStyle = '#1c0f0c'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 20; i++) blob(ctx, r() * W, r() * H, 40 + r() * 80, '#4a2a20', 0.6);
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const x = r() * W, y = r() * H;
      ctx.strokeStyle = 'rgba(255,110,30,0.25)'; ctx.lineWidth = 9; wander(ctx, rng(i * 97 + 1), x, y, 18, 12, 0.9);
      ctx.strokeStyle = 'rgba(255,170,60,0.85)'; ctx.lineWidth = 2.2; wander(ctx, rng(i * 97 + 1), x, y, 18, 12, 0.9);
    }
  },
  forest(ctx, W, H, r) {
    ctx.fillStyle = '#1f3d25'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) blob(ctx, r() * W, r() * H, 50 + r() * 60, '#2c6a8e', 0.75);
    for (let i = 0; i < 160; i++) blob(ctx, r() * W, r() * H, 6 + r() * 14, r() < 0.5 ? '#3d7a3c' : '#7da24c', 0.55);
  },
  machine(ctx, W, H, r) {
    ctx.fillStyle = '#2a3038'; ctx.fillRect(0, 0, W, H);
    const s = 24;
    for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
      const v = 38 + Math.floor(r() * 28);
      ctx.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
      ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
      if (r() < 0.05) { ctx.fillStyle = 'rgba(98,224,255,0.8)'; ctx.fillRect(x + s / 2 - 2, y + s / 2 - 2, 4, 4); }
    }
    ctx.strokeStyle = 'rgba(98,224,255,0.25)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); let x = Math.floor(r() * W / s) * s, y = Math.floor(r() * H / s) * s; ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) { if (r() < 0.5) x += s * (r() < 0.5 ? -2 : 2); else y += s * (r() < 0.5 ? -2 : 2); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  gas(ctx, W, H, r) {
    ctx.fillStyle = '#2e2248'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(219,168,214,0.28)' : 'rgba(244,225,200,0.18)';
      ctx.lineWidth = 10 + r() * 22;
      ctx.beginPath();
      const y0 = r() * H;
      ctx.moveTo(-20, y0);
      for (let x = 0; x <= W + 40; x += 40) ctx.lineTo(x, y0 + Math.sin(x / 60 + i) * 18 + (r() - 0.5) * 10);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) blob(ctx, r() * W, r() * H, 20 + r() * 50, '#f4e1c8', 0.15);
  }
};

// 星ごとに同じ地形になるよう、星の名前から作る
export function terrainURL(typeKey, name) {
  const key = `${typeKey}:${name}`;
  if (cache.has(key)) return cache.get(key);
  const W = 480, H = 240, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  PAINT[typeKey](ctx, W, H, rng(hashStr(key)));
  // 端を暗くして地点の表示を読みやすくする
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
  v.addColorStop(0, 'rgba(4,6,12,0)'); v.addColorStop(1, 'rgba(4,6,12,0.7)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const url = cv.toDataURL('image/jpeg', 0.82);
  cache.set(key, url);
  return url;
}
