// 飛行パート(操縦・ブースト・引力・デブリ・着陸演出・計器盤)
import { $, clamp, rnd, stars } from './dom.js';
import { V_MIN, V_START, V_MAX, zoneAt, DEBRIS_DMG, TAKEOFF } from './data.js';
import { cfg, save, persist, shipStats, hullEffects, maxHull, partFx, cargoCap } from './save.js';
import { G } from './state.js';
import { showScreen } from './ui.js';
import { view, layout, tryLandscape } from './orientation.js';
import { scene, camera, updateStreaks, world, clearWorld, spawnPlanet, spawnDebris, capOf, resetCamera, spawnSparks } from './world.js';
import { sfx, engine } from './audio.js';
import { record } from './records.js';
import { tilt, calibrate, askTilt, readInput, boostHeld, boostButton } from './input.js';
import { beginExplore, finishTrip } from './explore.js';

const REDUCE = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const tmpV = new THREE.Vector3();
const lookCam = new THREE.PerspectiveCamera(); // カメラは -Z を向くので、向きの計算もカメラで行う
const startQ = new THREE.Quaternion();

// 星を離れるたび(出撃・探索のあとの再出発)に戻す値
function freshLeg(run) {
  Object.assign(run, {
    v: V_START, px: 0, py: 0, vx: 0, vy: 0, pull: 0, active: null, debrisT: 1.2, shake: 0, hitFx: 0, boostFx: 0,
    returning: null, belt: 0, beltWarn: 0, storm: 0, msg: null
  });
}
export function resetRun() {
  clearWorld();
  const st = shipStats();
  for (const k in G.run) delete G.run[k];
  Object.assign(G.run, {
    st, fx: partFx(), fuel: st.fuel, maxFuel: st.fuel, dist: 0, nextPlanet: 500,
    zone: null, nextBelt: 2000, nextStorm: 1500, stormPh: 0
  });
  freshLeg(G.run);
  // 1回の出撃(何個の星に寄っても)で集めた積み荷
  G.trip = { gained: {}, stops: [], crew: [], hullStart: save.hull, cap: cargoCap(), explores: 0 };
}

// 探索のあと、残りの燃料でそのまま次の星へ。cost = 離陸に使う燃料
export function relaunch(cost) {
  const run = G.run;
  clearWorld();
  resetCamera();
  freshLeg(run);
  run.fuel = Math.max(0, run.fuel - cost);
  run.v = Math.round(cfg.capture * TAKEOFF.speed);  // 引き込まれる速度ぎりぎり
  run.nextPlanet = run.dist + 900;
  run.nextBelt = Math.max(run.nextBelt, run.dist + 1500);
  run.nextStorm = Math.max(run.nextStorm, run.dist + 1200);
  G.ex = null;
  G.mode = 'flying';
  showScreen('flying');
  sfx.launch();
  engine.start();
  const f = $('flash');
  f.style.background = 'radial-gradient(circle at 50% 55%, #ffffff, #8fd3ff 60%, #04060c)';
  f.style.opacity = 1;
  fadeFlash();
}

// 拠点へ帰る(燃料切れ・機体の損傷・自分で帰る)。集めた素材はそのまま持ち帰る
const RETURN_MSG = { fuel: '燃料切れ:帰還用の燃料で拠点へ戻ります', hull: '機体損傷:緊急帰還します', abort: '拠点へ帰還します' };
export function startReturn(reason) {
  const run = G.run;
  if (G.mode !== 'flying' || run.returning) return;
  run.returning = { t: 0, reason };
  boostButton.classList.remove('on');
  sfx.launch();
}
function updateReturn(dt) {
  const run = G.run, r = run.returning;
  r.t += dt;
  run.v = Math.min(V_MAX * 2.2, run.v + 260 * dt);
  engine.update(Math.min(V_MAX, run.v), true);
  updateStreaks(run.v * dt * 2, run.v * 1.4);
  setFov(70 + 22 * Math.min(1, r.t / 1.8));
  run.boostFx = Math.min(1, run.boostFx + dt * 2);
  $('boostFx').style.opacity = (run.boostFx * 0.9).toFixed(2);
  const f = $('flash');
  if (r.t < 0.1) f.style.background = 'radial-gradient(circle at 50% 50%, #ffffff, #cfe9ff 55%, #8fd3ff)';
  f.style.opacity = clamp((r.t - 1.3) / 0.6, 0, 1);
  if (r.t >= 2.0) {
    engine.stop();
    setFov(70);
    $('boostFx').style.opacity = 0;
    $('stormFx').style.opacity = 0;
    finishTrip(r.reason);
    fadeFlash();
  }
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

$('btnAbort').addEventListener('click', () => startReturn('abort'));
$('btnRecal').addEventListener('click', calibrate);

// ---------- 遠くの宙域の危険(デブリ帯・磁気嵐) ----------
function say(text, t = 3) { G.run.msg = { text, t }; }
function updateHazards(dt, zone) {
  const run = G.run;
  // 新しい宙域に入ったとき
  if (zone !== run.zone) {
    if (run.zone && zone.ly > run.zone.ly) { say(`${zone.name}に入りました:${zone.note}`, 3.5); sfx.warn(); }
    run.zone = zone;
  }
  // デブリ帯:予告のあと、しばらくデブリが大量に流れてくる
  if (zone.belt) {
    if (run.beltWarn > 0) { run.beltWarn -= dt; if (run.beltWarn <= 0) run.belt = 6 + Math.random() * 3; }
    else if (run.belt > 0) run.belt -= dt;
    else if (run.dist >= run.nextBelt) { run.beltWarn = 2.5; run.nextBelt = run.dist + rnd(2600, 4600); sfx.warn(); }
  }
  // 磁気嵐:船が横に流され、画面が紫に揺らぐ
  if (zone.storm) {
    if (run.storm > 0) {
      run.storm -= dt; run.stormPh += dt;
      const k = Math.min(1, run.storm / 1.2, (8 - run.storm) / 1.2);
      run.px += Math.sin(run.stormPh * 0.9) * 48 * k * dt;
      run.py += Math.cos(run.stormPh * 0.65) * 26 * k * dt;
    } else if (run.dist >= run.nextStorm) { run.storm = 8; run.stormPh = Math.random() * 6; run.nextStorm = run.dist + rnd(4200, 7500); sfx.warn(); }
  }
  const sf = run.storm > 0 ? Math.min(1, run.storm / 1.2, (8 - run.storm) / 1.2) : 0;
  $('stormFx').style.opacity = (sf * (0.65 + Math.random() * 0.35)).toFixed(2);
  if (run.msg) { run.msg.t -= dt; if (run.msg.t <= 0) run.msg = null; }
}

export function updateFlying(dt) {
  const run = G.run;
  if (run.returning) { updateReturn(dt); return; }
  const zone = zoneAt(run.dist / 10);
  updateHazards(dt, zone);
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
    if (run.fuel <= 0) { startReturn('fuel'); return; }
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
    // 遠くの宙域ほど多く、大型・巨大デブリも混ざる。デブリ帯の中はさらに多い
    const r = Math.random();
    const kind = r < zone.huge ? 'huge' : r < zone.huge + zone.large ? 'large' : 'normal';
    const belt = run.belt > 0;
    spawnDebris(run, kind, belt);
    run.debrisT = 1.15 / (cfg.debris * zone.rate * (belt ? 3.2 : 1)) * (0.6 + Math.random() * 0.8);
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
      const heavy = d.kind !== 'normal';
      run.v = Math.max(V_MIN, run.v * run.fx.hitKeep * (heavy ? 0.85 : 1));
      run.shake = heavy ? 0.7 : 0.4; run.hitFx = 1;
      sfx.hit();
      spawnSparks(d.x, d.y, -10);
      scene.remove(d.mesh); debris.splice(i, 1);
      // 大型・巨大デブリは耐久も削る
      if (heavy) {
        const dmg = Math.max(1, Math.round(DEBRIS_DMG[d.kind] * run.fx.bigHit));
        save.hull = Math.max(0, save.hull - dmg);
        record.damage();
        persist();
        say(`${d.kind === 'huge' ? '巨大' : '大型'}デブリに衝突:耐久 −${dmg}`, 1.8);
        if (save.hull <= 0) { startReturn('hull'); return; }
      }
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
  const wob = run.storm > 0 && !REDUCE.matches ? Math.sin(run.stormPh * 3.1) * 0.03 : 0;
  camera.rotation.set(run.vy * 0.0016, -run.vx * 0.0016, -run.vx * 0.0045 + wob);
  updateStreaks(dz, run.v);
}

// ---------- 着陸演出 ----------
function startLanding(p) {
  G.mode = 'landing';
  G.land = { p, t: 0, from: p.group.position.clone() };
  engine.stop();
  sfx.land(false);
  $('boostFx').style.opacity = 0;
  $('stormFx').style.opacity = 0;
  // 大気圏突入:星の色に光る
  $('flash').style.background = `radial-gradient(circle at 50% 55%, #ffffff, ${p.type.css} 60%, #04060c)`;
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
  $('flash').style.opacity = clamp((land.t - 1.7) / 0.6, 0, 1);
  if (land.t >= 2.4) {
    G.land = null;
    setFov(70);
    beginExplore(p, run);
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
const tripCargo = () => Object.entries(G.trip.gained).reduce((a, [k, n]) => a + (k === 'blueprint' ? 0 : n), 0);
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
    if (run.returning) { msg = RETURN_MSG[run.returning.reason]; calm = run.returning.reason === 'abort'; }
    else if (run.beltWarn > 0) { msg = '前方にデブリ帯'; }
    else if (run.msg && /衝突/.test(run.msg.text)) { msg = run.msg.text; }
    else if (run.pull > 0) { msg = '引力圏:ブーストで離脱'; }
    else if (run.storm > 0) { msg = '磁気嵐:船が流されます'; }
    else if (run.belt > 0) { msg = 'デブリ帯を通過中'; calm = true; }
    else if (run.msg) { msg = run.msg.text; calm = true; }
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
  if (G.trip && G.trip.stops.length) chips.push(`積み荷 ${tripCargo()} / ${G.trip.cap}`);
  const zone = run.zone ? run.zone.name : '';
  const ch = zone + chips.join('|');
  if (memo.chips !== ch) {
    memo.chips = ch;
    $('chips').innerHTML = (zone ? `<span class="chip zone">${zone}</span>` : '') + chips.map(c => `<span class="chip${c.startsWith('積み荷') ? ' zone' : ''}">${c}</span>`).join('');
  }
}
