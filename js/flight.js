// 飛行パート(操縦・ブースト・引力・デブリ・着陸演出・計器盤)
import { $, clamp, stars } from './dom.js';
import { V_MIN, V_START, V_MAX } from './data.js';
import { cfg, save, shipStats, hullEffects, maxHull, partFx } from './save.js';
import { G } from './state.js';
import { showScreen } from './ui.js';
import { view, layout, tryLandscape } from './orientation.js';
import { scene, camera, updateStreaks, world, clearWorld, spawnPlanet, spawnDebris, capOf, resetCamera, spawnSparks } from './world.js';
import { sfx, engine } from './audio.js';
import { record } from './records.js';
import { tilt, calibrate, askTilt, readInput, boostHeld, boostButton } from './input.js';
import { beginExplore } from './explore.js';

const REDUCE = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const tmpV = new THREE.Vector3();
const lookCam = new THREE.PerspectiveCamera(); // カメラは -Z を向くので、向きの計算もカメラで行う
const startQ = new THREE.Quaternion();

export function resetRun() {
  clearWorld();
  const st = shipStats();
  Object.assign(G.run, {
    st, fx: partFx(), v: V_START, fuel: st.fuel, maxFuel: st.fuel, dist: 0, px: 0, py: 0, vx: 0, vy: 0, pull: 0, active: null,
    nextPlanet: 500, debrisT: 1.2, shake: 0, hitFx: 0, boostFx: 0
  });
}

// 出撃
export async function launch() {
  if (save.hull <= 0) return;
  await Promise.all([askTilt(), tryLandscape()]);
  setTimeout(() => {
    layout();
    resetRun();
    calibrate();
    $('btnRecal').hidden = !tilt.ok;
    $('stickHint').hidden = tilt.ok;
    G.mode = 'flying';
    showScreen('flying');
    sfx.launch();
    engine.start();
    record.launch();
  }, 250);
}

export function abort() {
  engine.stop();
  setFov(70);
  clearWorld();
  G.mode = 'base';
  resetCamera();
  showScreen('base');
}
$('btnAbort').addEventListener('click', abort);
$('btnRecal').addEventListener('click', calibrate);

export function updateFlying(dt) {
  const run = G.run;
  const [ix, iy] = readInput();
  const fx = hullEffects();
  const steer = 85 * fx.steer * run.st.steer;
  const k = Math.min(1, dt * 6);
  run.vx += (ix * steer - run.vx) * k; run.vy += (iy * steer - run.vy) * k;
  run.px += run.vx * dt; run.py += run.vy * dt;

  const boosting = boostHeld() && run.fuel > 0;
  if (boosting) {
    run.v += run.st.accel * dt;
    run.fuel = Math.max(0, run.fuel - run.st.burn * fx.burn * dt);
  } else {
    run.v -= cfg.drag * run.fx.drag * dt;
  }
  run.v = clamp(run.v, V_MIN, V_MAX);
  boostButton.classList.toggle('on', boosting);
  engine.update(run.v, boosting);
  // ブースト中は視野が少し広がり、画面の端が光る(加速している感じ)
  run.boostFx += ((boosting ? 1 : 0) - run.boostFx) * Math.min(1, dt * (boosting ? 5 : 2.5));
  setFov(70 + 9 * run.boostFx);
  $('boostFx').style.opacity = (run.boostFx * 0.9).toFixed(2);

  const dz = run.v * dt;
  run.dist += dz;
  if (run.dist >= run.nextPlanet) { spawnPlanet(run.dist); run.nextPlanet += cfg.spacing * (0.8 + Math.random() * 0.4); }
  run.debrisT -= dt;
  if (cfg.debris > 0 && run.debrisT <= 0) {
    spawnDebris(run);
    run.debrisT = (1.15 - Math.min(0.55, run.dist / 10 / 4000)) / cfg.debris * (0.6 + Math.random() * 0.8);
  }

  const planets = world.planets, debris = world.debris;
  for (let i = planets.length - 1; i >= 0; i--) {
    const p = planets[i];
    p.z += dz;
    p.group.position.z = p.z;
    p.body.rotation.y += p.spin * dt;
    if (p.z > 500) { scene.remove(p.group); planets.splice(i, 1); }
  }
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    const prev = d.z;
    d.z += dz; d.x += d.dx * dt; d.y += d.dy * dt;
    d.mesh.position.set(d.x, d.y, d.z);
    d.mesh.rotation.x += d.rx * dt; d.mesh.rotation.y += d.ry * dt;
    // デブリに当たると減速する
    if (prev < 0 && d.z >= 0 && Math.hypot(d.x - run.px, d.y - run.py) < d.r + 4) {
      run.v = Math.max(V_MIN, run.v * run.fx.hitKeep);
      run.shake = 0.4; run.hitFx = 1;
      sfx.hit();
      spawnSparks(d.x, d.y, -10);
      scene.remove(d.mesh); debris.splice(i, 1);
      continue;
    }
    if (d.z > 60) { scene.remove(d.mesh); debris.splice(i, 1); }
  }

  // 一番近い星の引力
  let act = null;
  for (const p of planets) if (p.z > -900 && p.z < -80 && (!act || p.z > act.z)) act = p;
  if (act !== run.active) { run.active = act; run.pull = 0; }
  if (act) {
    if (run.v < capOf(act)) run.pull += dt / 1.5; else run.pull -= dt / 0.7;
    run.pull = clamp(run.pull, 0, 1);
    if (run.pull > 0 && run.pull < 1) sfx.warn();
    if (run.pull > 0) {
      const dx = act.x - run.px, dy = act.y - run.py, L = Math.hypot(dx, dy) || 1;
      run.px += dx / L * run.pull * 55 * dt; run.py += dy / L * run.pull * 55 * dt;
    }
    if (run.pull >= 1) { startLanding(act); return; }
  } else {
    run.pull = Math.max(0, run.pull - dt);
  }
  if (!act || run.pull === 0) {
    const m = Math.hypot(run.px, run.py * 1.3);
    if (m > 100) { run.px *= 100 / m; run.py *= 100 / m; }
  }

  run.shake = Math.max(0, run.shake - dt);
  run.hitFx = Math.max(0, run.hitFx - dt * 2.5);
  const sh = REDUCE.matches ? 0 : run.shake * 6;
  camera.position.set(run.px + (Math.random() - 0.5) * sh, run.py + (Math.random() - 0.5) * sh, 0);
  camera.rotation.set(run.vy * 0.0016, -run.vx * 0.0016, -run.vx * 0.0045);
  updateStreaks(dz, run.v);
}

// ---------- 着陸演出 ----------
function startLanding(p) {
  G.mode = 'landing';
  G.land = { p, t: 0, crash: G.run.fuel <= 0, from: p.group.position.clone() };
  engine.stop();
  sfx.land(G.land.crash);
  $('boostFx').style.opacity = 0;
  // 大気圏突入:星の色に光る。不時着は赤く光る
  $('flash').style.background = G.land.crash
    ? 'radial-gradient(circle at 50% 55%, #ffe2c8, #ff5b3a 55%, #5a0d02)'
    : `radial-gradient(circle at 50% 55%, #ffffff, ${p.type.css} 60%, #04060c)`;
  startQ.copy(camera.quaternion);
  boostButton.classList.remove('on');
  $('warn').hidden = true;
}
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export function updateLanding(dt) {
  const land = G.land, run = G.run, p = land.p;
  land.t += dt;
  const k = ease(Math.min(1, land.t / 2.2));
  tmpV.set(run.px, run.py, -p.r * 2.3);
  p.group.position.lerpVectors(land.from, tmpV, k);
  p.body.rotation.y += p.spin * dt;
  lookCam.position.copy(camera.position);
  lookCam.lookAt(p.group.position);
  camera.quaternion.copy(startQ).slerp(lookCam.quaternion, Math.min(1, k * 1.6));
  run.v = Math.max(0, run.v - 120 * dt);
  updateStreaks(run.v * dt, run.v);
  setFov(70 + 9 * Math.max(0, run.boostFx *= 0.95) + 14 * k);  // 近づくほど吸い込まれるように広がる
  if (land.crash && land.t > 1.5 && !REDUCE.matches) {
    const sh = (land.t - 1.5) * 10;
    camera.position.x = run.px + (Math.random() - 0.5) * sh;
    camera.position.y = run.py + (Math.random() - 0.5) * sh;
  }
  $('flash').style.opacity = clamp((land.t - 1.7) / 0.6, 0, 1);
  if (land.t >= 2.4) {
    const { crash } = land;
    G.land = null;
    setFov(70);
    beginExplore(p, crash, run);
    fadeFlash();
  }
}
function setFov(f) {
  if (Math.abs(camera.fov - f) < 0.01) return;
  camera.fov = f;
  camera.updateProjectionMatrix();
}
function fadeFlash() {
  const f = $('flash'); let o = parseFloat(f.style.opacity || '0');
  const step = () => { o -= 0.05; f.style.opacity = Math.max(0, o); if (o > 0) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- 計器盤 ----------
const ticksG = $('ticks');
for (let v = 0; v <= V_MAX; v += 50) {
  const r = -120 + 240 * v / V_MAX;
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('class', 'tick'); l.setAttribute('x1', '60'); l.setAttribute('y1', '16'); l.setAttribute('x2', '60'); l.setAttribute('y2', v % 100 === 0 ? '23' : '20');
  l.setAttribute('transform', `rotate(${r} 60 60)`);
  ticksG.appendChild(l);
}
const memo = {};
const setText = (id, t) => { if (memo[id] !== t) { memo[id] = t; $(id).textContent = t; } };
const setW = (id, pct) => { const s = pct.toFixed(1) + '%'; if (memo[id] !== s) { memo[id] = s; $(id).style.width = s; } };
const ret = $('reticle'), retL = $('retLabel');

export function updateHud() {
  const run = G.run;
  $('needle').setAttribute('transform', `rotate(${-120 + 240 * run.v / V_MAX} 60 60)`);
  setText('spdNum', String(Math.round(run.v)));
  const cap = $('capTick');
  if (run.active) {
    cap.setAttribute('visibility', 'visible');
    cap.setAttribute('transform', `rotate(${-120 + 240 * capOf(run.active) / V_MAX} 60 60)`);
  } else cap.setAttribute('visibility', 'hidden');
  setText('distNum', Math.floor(run.dist / 10).toLocaleString('ja-JP'));
  setText('fuelNum', String(Math.round(run.fuel)));
  setW('fuelFill', run.fuel / run.maxFuel * 100);
  const mh = maxHull();
  setText('hullNum', String(save.hull));
  setW('hullFill', save.hull / mh * 100);
  setW('pullFill', run.pull * 100);
  setText('pullPct', Math.round(run.pull * 100) + '%');
  const tgt = $('mfdTarget');
  if (run.active) {
    const p = run.active;
    setText('mfdTarget', `${p.type.name} ${p.name}`);
    setText('mfdMeta', `${stars(p.rar)} 資源:${p.type.res}`);
    tgt.classList.remove('idle');
  } else {
    setText('mfdTarget', '航路に星なし');
    setText('mfdMeta', ' ');
    tgt.classList.add('idle');
  }

  const w = $('warn');
  let msg = '', calm = false;
  if (G.mode === 'flying') {
    if (run.fuel <= 0) { msg = '燃料切れ:最寄りの星に不時着します'; }
    else if (run.pull > 0) { msg = '引力圏:ブーストで離脱'; }
    else if (run.active && run.v < capOf(run.active) + 25) { msg = '星の引力が近い'; calm = true; }
  }
  if (msg) { setText('warn', msg); w.classList.toggle('calm', calm); w.hidden = false; } else w.hidden = true;

  boostButton.disabled = run.fuel <= 0;
  $('hitFx').style.opacity = run.hitFx.toFixed(2);

  // 目標の星の枠
  if (run.active && G.mode === 'flying') {
    const p = run.active;
    tmpV.set(p.x, p.y, p.z).project(camera);
    if (tmpV.z < 1) {
      const sx = (tmpV.x + 1) / 2 * view.LW, sy = (1 - tmpV.y) / 2 * view.LH;
      const f = view.LH / 2 / Math.tan(camera.fov * Math.PI / 360);
      const size = clamp(p.r * 2.3 * f / Math.max(1, -p.z), 44, view.LH * 0.9);
      ret.style.left = sx + 'px'; ret.style.top = sy + 'px';
      ret.style.width = size + 'px'; ret.style.height = size + 'px';
      retL.style.left = sx + 'px'; retL.style.top = (sy + size / 2 + 4) + 'px';
      setText('retLabel', `${p.type.name} ${'★'.repeat(p.rar)}`);
      const hot = run.pull > 0;
      ret.classList.toggle('hot', hot); retL.classList.toggle('hot', hot);
      ret.hidden = false; retL.hidden = false;
    } else { ret.hidden = true; retL.hidden = true; }
  } else { ret.hidden = true; retL.hidden = true; }

  const fx = hullEffects(), chips = [];
  if (fx.low70) chips.push('旋回性ダウン');
  if (fx.low40) chips.push('燃費悪化');
  const ch = chips.join('|');
  if (memo.chips !== ch) { memo.chips = ch; $('chips').innerHTML = chips.map(c => `<span class="chip">${c}</span>`).join(''); }
}
