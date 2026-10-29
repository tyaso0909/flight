// 宇宙の3D表示(背景の星空・流れ線・星・デブリ)
import { clamp } from './dom.js';
import { TYPES, V_MAX } from './data.js';
import { cfg } from './save.js';
import { onLayout } from './orientation.js';

export const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(0x04060c, 1);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x04060c, 1700, 3100);
export const camera = new THREE.PerspectiveCamera(70, 2, 1, 5000);

scene.add(new THREE.AmbientLight(0x6070a0, 0.35));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.25);
sun.position.set(-0.6, 0.7, 0.4);
scene.add(sun);

onLayout((v) => {
  renderer.setSize(v.LW, v.LH, false);
  camera.aspect = v.LW / v.LH;
  camera.updateProjectionMatrix();
});

// 空(星・星雲)はカメラに追従させる
export const sky = new THREE.Group();
scene.add(sky);
{
  const N = 2400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 3600;
    pos[i * 3] = R * s * Math.cos(th); pos[i * 3 + 1] = R * u; pos[i * 3 + 2] = R * s * Math.sin(th);
    const b = 0.35 + Math.random() * 0.65, warm = Math.random() < 0.2;
    col[i * 3] = b; col[i * 3 + 1] = b * (warm ? 0.85 : 0.95); col[i * 3 + 2] = b * (warm ? 0.7 : 1.05);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sky.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false })));
  const neb = (c1, x, y, z, s) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, c1); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, y, z); sp.scale.set(s, s, 1); sky.add(sp);
  };
  neb('rgba(40,110,140,0.35)', -1400, 600, -3000, 3200);
  neb('rgba(120,50,140,0.28)', 1600, -300, -3200, 2800);
  neb('rgba(170,90,40,0.18)', 300, 1200, -3300, 2200);
}

// 速度の流れ線
const STREAKS = 280;
const streakData = new Float32Array(STREAKS * 3);
const streakPos = new Float32Array(STREAKS * 6);
for (let i = 0; i < STREAKS; i++) {
  const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 300;
  streakData[i * 3] = Math.cos(a) * r; streakData[i * 3 + 1] = Math.sin(a) * r; streakData[i * 3 + 2] = -Math.random() * 2000;
}
const streakGeo = new THREE.BufferGeometry();
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
const streakMat = new THREE.LineBasicMaterial({ color: 0xa8c8ff, transparent: true, opacity: 0.45, fog: false });
scene.add(new THREE.LineSegments(streakGeo, streakMat));
export function updateStreaks(dz, v) {
  const len = clamp(v * 0.22, 3, 110);
  for (let i = 0; i < STREAKS; i++) {
    let z = streakData[i * 3 + 2] + dz;
    if (z > 0) z -= 2000;
    streakData[i * 3 + 2] = z;
    const x = streakData[i * 3], y = streakData[i * 3 + 1];
    streakPos.set([x, y, z, x, y, z - len], i * 6);
  }
  streakGeo.attributes.position.needsUpdate = true;
  streakMat.opacity = clamp(v / V_MAX, 0.12, 0.6);
}

// ---------- 星のテクスチャ(手続き生成) ----------
function mulberry(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function noise2(seed) {
  const r = mulberry(seed), G = 64, grid = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) grid[i] = r();
  const g = (i, j) => grid[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
const fbm = (n, x, y) => { let v = 0, a = 0.5, f = 1; for (let o = 0; o < 5; o++) { v += a * n(x * f, y * f); a *= 0.5; f *= 2; } return v; };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function planetTexture(type, seed) {
  const W = 256, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  const n1 = noise2(seed), n2 = noise2(seed + 7), n3 = noise2(seed + 13);
  const C = {
    ice: [hex('#6f95b8'), hex('#f2f8ff'), hex('#3e6a92')],
    lava: [hex('#1d0f0c'), hex('#4f2a20'), hex('#ff7a1a')],
    forest: [hex('#1d4a6e'), hex('#3d7a3c'), hex('#7da24c')],
    machine: [hex('#4b525d'), hex('#9aa3ad'), hex('#62e0ff')],
    gas: [hex('#4b3478'), hex('#dba8d6'), hex('#f4e1c8')]
  }[type];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W * 8, v = y / H * 4;
      const t = fbm(n1, u, v), t2 = fbm(n2, u * 1.7, v * 1.7);
      let c;
      if (type === 'ice') {
        c = mix(C[0], C[1], clamp((t - 0.3) * 2.2, 0, 1));
        if (Math.abs(t2 - 0.5) < 0.012) c = C[2];
        const pole = Math.abs(y / H - 0.5) * 2; if (pole > 0.78) c = mix(c, [255, 255, 255], (pole - 0.78) * 4);
      } else if (type === 'lava') {
        c = mix(C[0], C[1], t);
        const crack = 1 - clamp(Math.abs(t2 - 0.5) * 22, 0, 1);
        c = mix(c, C[2], crack);
      } else if (type === 'forest') {
        c = t < 0.47 ? mix(C[0], hex('#2c6a8e'), t / 0.47) : mix(C[1], C[2], clamp((t - 0.47) * 4, 0, 1));
        const cl = fbm(n3, u * 1.3 + 3, v * 2.2); if (cl > 0.6) c = mix(c, [240, 246, 250], clamp((cl - 0.6) * 4, 0, 0.85));
      } else if (type === 'machine') {
        c = mix(C[0], C[1], t);
        if (x % 16 === 0 || y % 16 === 0) c = mix(c, [30, 34, 40], 0.7);
        if (t2 > 0.7 && (x % 16 === 8) && (y % 4 === 0)) c = C[2];
      } else {
        const band = Math.sin(y * 0.16 + t * 5) * 0.5 + 0.5;
        c = mix(C[0], C[1], band);
        c = mix(c, C[2], clamp((t2 - 0.62) * 3, 0, 0.6));
      }
      const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
  return tex;
}
function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d'), g = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.45, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
const GLOW = glowTexture();
const SPHERE = new THREE.SphereGeometry(1, 48, 32);
const RING = new THREE.RingGeometry(1.45, 2.1, 72);
const MATS = {};
TYPES.forEach((t, i) => {
  MATS[t.key] = new THREE.MeshStandardMaterial({
    map: planetTexture(t.key, 101 + i * 37), roughness: 0.92, metalness: t.key === 'machine' ? 0.35 : 0,
    emissive: t.key === 'lava' ? 0x5a1a06 : 0x000000, emissiveIntensity: 1
  });
});

const ROCK = new THREE.IcosahedronGeometry(1, 0);
const SLAB = new THREE.BoxGeometry(1.6, 0.4, 1);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8178, roughness: 1, flatShading: true });
const slabMat = new THREE.MeshStandardMaterial({ color: 0x6f7a86, roughness: 0.6, metalness: 0.5, flatShading: true });

// ---------- 星とデブリ ----------
export const world = { planets: [], debris: [] };

export function clearWorld() {
  world.planets.forEach(p => scene.remove(p.group));
  world.debris.forEach(d => scene.remove(d.mesh));
  world.planets = []; world.debris = [];
}

// 遠くまで飛ぶほど、輪のある星(★2)や光る星(★3)が出やすい
export function spawnPlanet(dist) {
  const ly = dist / 10;
  const p3 = clamp((ly - 800) / 4000, 0, 0.15), p2 = clamp(ly / 2000 * 0.5, 0, 0.5);
  const roll = Math.random();
  const rar = roll < p3 ? 3 : roll < p3 + p2 ? 2 : 1;
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  const r = 45 + Math.random() * 50;
  const ang = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.3;
  const off = 150 + Math.random() * 80 + r * 0.6;
  const group = new THREE.Group();
  const body = new THREE.Mesh(SPHERE, MATS[type.key]);
  body.scale.setScalar(r);
  body.rotation.z = (Math.random() - 0.5) * 0.6;
  group.add(body);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: type.glow, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(r * 2.7);
  group.add(halo);
  if (rar >= 2) {
    const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: rar === 3 ? 0xffd27a : type.glow, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.scale.setScalar(r);
    ring.rotation.x = 1.15 + Math.random() * 0.3;
    ring.rotation.y = (Math.random() - 0.5) * 0.5;
    group.add(ring);
  }
  if (rar === 3) {
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffcf6a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.scale.setScalar(r * 4.2);
    group.add(aura);
  }
  const p = {
    group, body, type, rar, r,
    x: Math.cos(ang) * off, y: Math.sin(ang) * off * 0.7, z: -2600,
    name: `${type.code}-${100 + Math.floor(Math.random() * 900)}`,
    spin: 0.05 + Math.random() * 0.08
  };
  group.position.set(p.x, p.y, p.z);
  scene.add(group);
  world.planets.push(p);
  return p;
}

// その星に引き寄せられる速度(大きい星ほど高い)
export const capOf = (p) => cfg.capture * (0.8 + (p.r - 45) / 50 * 0.4);

export function spawnDebris(run) {
  const ly = run.dist / 10;
  const big = Math.random() < 0.25 + Math.min(0.3, ly / 6000);
  const r = big ? 8 + Math.random() * 7 : 3 + Math.random() * 4;
  const slab = Math.random() < 0.3;
  const mesh = new THREE.Mesh(slab ? SLAB : ROCK, slab ? slabMat : rockMat);
  mesh.scale.setScalar(r);
  const moving = ly > 1200 && Math.random() < 0.4;
  const d = {
    mesh, r, z: -1500,
    x: run.px + (Math.random() - 0.5) * 100, y: run.py + (Math.random() - 0.5) * 75,
    dx: moving ? (Math.random() - 0.5) * 40 : 0, dy: moving ? (Math.random() - 0.5) * 30 : 0,
    rx: (Math.random() - 0.5) * 2, ry: (Math.random() - 0.5) * 2
  };
  mesh.position.set(d.x, d.y, d.z);
  scene.add(mesh);
  world.debris.push(d);
}

export function resetCamera() {
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
}
