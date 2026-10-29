// 起動と毎フレームの処理
import { G } from './state.js';
import { renderer, scene, camera, sky, updateStreaks } from './world.js';
import { updateFlying, updateLanding, updateHud } from './flight.js';
import { showScreen } from './ui.js';
import './explore.js';
import './base.js';
import './hangar.js';
import './workshop.js';

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.mode === 'flying') updateFlying(dt);
  else if (G.mode === 'landing') updateLanding(dt);
  else if (G.mode === 'explore') { if (G.ex) G.ex.p.body.rotation.y += G.ex.p.spin * dt * 0.4; }
  else {
    // 拠点などでは背景をゆっくり流す
    updateStreaks(70 * dt, 70);
    camera.rotation.z += dt * 0.02;
  }
  sky.position.copy(camera.position);
  if (G.mode === 'flying' || G.mode === 'landing') updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

showScreen('base');
requestAnimationFrame(frame);
