import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/addons/RoomEnvironment.js';
import { buildScene, L, W, H, HL, HW } from './scene.js';
import { CardboardRenderer, PHONES, MI_VR_PLAY } from './cardboard.js';

const EYE = 1.6;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const params = new URLSearchParams(location.search);
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let DPR_CAP = isMobile ? 1.75 : 2;
renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
$('#stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0605);
const head = new THREE.Object3D(); head.position.set(0, EYE, 0); scene.add(head);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
head.add(camera);
const cardboard = new CardboardRenderer(renderer);

// ------------------------------------------------------------------ build
const manager = new THREE.LoadingManager();
manager.onProgress = (u, a, b) => { $('#lprog').style.width = (a / b * 100) + '%'; };
const S = buildScene(renderer, manager);
scene.add(S.group, S.extras, S.floor, S.decals, S.lights, S.mirror);
let reflections = params.get('refl') !== '0';
S.mirror.visible = reflections;

// environment: start with a neutral room, then re-capture the hall itself for true local reflections
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
function captureEnv() {
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cc = new THREE.CubeCamera(0.1, 100, rt); cc.position.set(0, 4.5, 0); scene.add(cc);
  const vis = hotspots.map(h => h.visible); hotspots.forEach(h => h.visible = false); reticle.visible = false;
  cc.update(renderer, scene);
  const env = pmrem.fromCubemap(rt.texture).texture;
  scene.environment = env; scene.environmentIntensity = 0.85;
  hotspots.forEach((h, i) => h.visible = vis[i]); reticle.visible = true; scene.remove(cc); rt.dispose();
}

// ------------------------------------------------------------------ viewpoints + hotspots
const VIEWS = [
  { id: 'centre', name: 'Foyer centre', x: 0, z: 0.2, yaw: 1.15 },
  { id: 'arrival', name: 'Arrival', x: 0, z: -2.1, yaw: Math.PI },
  { id: 'cascade', name: 'Cascade & reception', x: 0, z: -0.2, yaw: Math.PI },
  { id: 'chand', name: 'Chandeliers', x: -5.6, z: 0.3, yaw: 1.2, pitch: 0.55 },
  { id: 'niche', name: 'Lotus niche', x: -9.4, z: 0, yaw: Math.PI / 2 },
  { id: 'banquet', name: 'Banquet doors', x: 9.6, z: 0, yaw: -Math.PI / 2 },
  { id: 'hall', name: 'Hall doors', x: 4.9, z: 0.4, yaw: Math.PI },
  { id: 'long', name: 'Full length', x: 11.6, z: -1.6, yaw: 1.42 },
];
const hotspots = [];
const hitMeshes = [];
{
  const ringG = new THREE.RingGeometry(0.34, 0.46, 64).rotateX(-Math.PI / 2);
  const discG = new THREE.CircleGeometry(0.34, 48).rotateX(-Math.PI / 2);
  const beamG = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 32, 1, true);
  const beamMat = new THREE.ShaderMaterial({ uniforms: { c: { value: new THREE.Color(1, 0.8, 0.45) }, a: { value: 0.35 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying float vy; void main(){ vy=position.y/1.5+0.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform vec3 c; uniform float a; varying float vy; void main(){ gl_FragColor=vec4(c*a*pow(1.0-vy,2.0),1.0); }` });
  for (const v of VIEWS) {
    const g = new THREE.Group(); g.position.set(v.x, 0.015, v.z);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.78, 0.4).multiplyScalar(2.2), transparent: true, opacity: 0.95, depthWrite: false });
    const ring = new THREE.Mesh(ringG, ringMat);
    const disc = new THREE.Mesh(discG, new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.12, depthWrite: false }));
    const beam = new THREE.Mesh(beamG, beamMat.clone()); beam.position.y = 0.75;
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 12), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.8;
    const label = makeLabel(v.name); label.position.y = 1.75; label.visible = false;
    hit.userData.view = v; g.userData = { view: v, ring, disc, beam, label };
    g.add(ring, disc, beam, hit, label); g.renderOrder = 5; scene.add(g); hotspots.push(g); hitMeshes.push(hit);
  }
}
function makeLabel(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,10,6,0.72)'; roundRect(g, 4, 8, 504, 80, 40); g.fill(); g.strokeStyle = 'rgba(216,178,106,0.9)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#f6e4bf'; g.font = '600 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false })); s.scale.set(1.3, 0.244, 1); s.renderOrder = 10; return s;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// 3D gaze reticle (rendered in both eyes at 2 m) with dwell arc
const reticle = new THREE.Group();
const retMat = new THREE.ShaderMaterial({ uniforms: { p: { value: 0 }, on: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `uniform float p; uniform float on; varying vec2 vUv;
    void main(){ vec2 d=vUv-0.5; float r=length(d)*2.0; float a=atan(d.x,d.y)/6.28318+0.5;
      float dot_=smoothstep(0.16,0.11,r);
      float ring=smoothstep(0.02,0.0,abs(r-0.8)-0.07)*on;
      float prog=smoothstep(0.02,0.0,abs(r-0.8)-0.09)*step(a,p);
      vec3 col=mix(vec3(1.0), vec3(1.0,0.82,0.45), prog);
      float al=max(dot_*0.95, max(ring*0.35, prog));
      gl_FragColor=vec4(col, al); }` });
const retMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), retMat); retMesh.position.z = -2; retMesh.renderOrder = 20;
reticle.add(retMesh); head.add(reticle); reticle.visible = false;
// VR toast (3D, in front of the viewer)
const vrToastC = document.createElement('canvas'); vrToastC.width = 1024; vrToastC.height = 128;
const vrToastT = new THREE.CanvasTexture(vrToastC); vrToastT.colorSpace = THREE.SRGBColorSpace;
const vrToast = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.2), new THREE.MeshBasicMaterial({ map: vrToastT, transparent: true, depthTest: false, toneMapped: false }));
vrToast.position.set(0, -0.35, -2); vrToast.renderOrder = 21; vrToast.visible = false; head.add(vrToast);
let vrToastTimer;
function showVRToast(msg, ms = 2200) {
  const g = vrToastC.getContext('2d'); g.clearRect(0, 0, 1024, 128); g.fillStyle = 'rgba(15,8,5,0.75)'; roundRect(g, 60, 14, 904, 100, 50); g.fill();
  g.fillStyle = '#f6e4bf'; g.font = '500 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(msg, 512, 66);
  vrToastT.needsUpdate = true; vrToast.visible = true; clearTimeout(vrToastTimer); vrToastTimer = setTimeout(() => vrToast.visible = false, ms);
}

// ------------------------------------------------------------------ look state
let yaw = VIEWS[0].yaw, pitch = 0.08, fov = innerHeight > innerWidth ? 82 : 70;
let gyroOn = false, gyroSeen = false, yawOffset = 0, current = VIEWS[0], tween = null, autoTour = false, idleT = 0;
let vrOn = false;
const qGyro = new THREE.Quaternion();

function goTo(v, instant = false) {
  current = v; document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.id === v.id));
  const from = { x: head.position.x, z: head.position.z, yaw, pitch };
  let dy = v.yaw - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const to = { x: v.x, z: v.z, yaw: yaw + dy, pitch: v.pitch ?? 0.06 };
  if (instant) { head.position.x = to.x; head.position.z = to.z; yaw = to.yaw; pitch = to.pitch; tween = null; return; }
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  tween = { from, to, t0: performance.now(), dur: vrOn ? 650 + dist * 60 : 1000 + dist * 140, turn: !(gyroOn || vrOn) };
}
const nav = $('#views');
for (const v of VIEWS) { const b = document.createElement('button'); b.textContent = v.name; b.dataset.id = v.id; b.onclick = () => { stopTour(); goTo(v); poke(); }; nav.appendChild(b); }

// ------------------------------------------------------------------ touch look / pinch / tap-to-walk (normal mode)
const el = renderer.domElement; const ptrs = new Map(); let pinch0 = 0, fov0 = fov, moved = 0, downT = 0;
el.addEventListener('pointerdown', e => {
  if (vrOn) return;
  el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; downT = performance.now(); poke(); stopTour();
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = fov; }
});
el.addEventListener('pointermove', e => {
  if (vrOn || !ptrs.has(e.pointerId)) return;
  const p = ptrs.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 1) { moved += Math.abs(dx) + Math.abs(dy); const k = (fov * Math.PI / 180) / innerHeight;
    if (gyroOn) yawOffset += dx * k; else { yaw += dx * k; pitch = clamp(pitch + dy * k, -1.45, 1.45); } if (tween) tween.turn = false; }
  else if (ptrs.size === 2) { moved += 99; const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) fov = clamp(fov0 * pinch0 / d, 30, 100); }
});
el.addEventListener('pointerup', e => { const had = ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (had && !vrOn && moved < 8 && performance.now() - downT < 400) tapPick(e.clientX, e.clientY); });
el.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch0 = 0; });
el.addEventListener('wheel', e => { fov = clamp(fov + e.deltaY * 0.03, 30, 100); poke(); }, { passive: true });
const ray = new THREE.Raycaster();
function walkable(x, z) {
  if (Math.abs(x) > HL - 0.6 || Math.abs(z) > HW - 0.6) return false;
  return !S.obstacles.some(o => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1);
}
function tapPick(x, y) {
  ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const h = ray.intersectObjects(hitMeshes)[0]; if (h) { goTo(h.object.userData.view); return; }
  const f = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  if (f && ray.ray.direction.y < -0.12) {
    const px = clamp(f.x, -HL + 0.6, HL - 0.6), pz = clamp(f.z, -HW + 0.6, HW - 0.6);
    if (walkable(px, pz)) goTo({ id: '_', name: '', x: px, z: pz, yaw, pitch });
  }
}

// ------------------------------------------------------------------ orientation sensors
// Preferred: Generic Sensor API RelativeOrientationSensor (quaternion, 60 Hz, gyro-fused, no compass jitter)
// Fallback: deviceorientation Euler angles.
let sensor = null, devOri = null, sensorQ = null;
const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const zee = new THREE.Vector3(0, 0, 1), eul = new THREE.Euler(), q0 = new THREE.Quaternion(), qScreen = new THREE.Quaternion();
const screenAngle = () => ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI / 180;
function onOri(e) { if (e.alpha == null && e.beta == null) return; devOri = e; gyroSeen = true; }
function readGyro(out) {
  qScreen.setFromAxisAngle(zee, -screenAngle());
  if (sensorQ) { out.set(sensorQ[0], sensorQ[1], sensorQ[2], sensorQ[3]); out.premultiply(qX).multiply(qScreen); return true; }
  if (devOri) {
    const a = (devOri.alpha || 0) * Math.PI / 180, b = (devOri.beta || 0) * Math.PI / 180, g = (devOri.gamma || 0) * Math.PI / 180;
    eul.set(b, a, -g, 'YXZ'); out.setFromEuler(eul); out.multiply(q0.set(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)); out.multiply(qScreen); return true;
  }
  return false;
}
async function startSensors() {
  // iOS permission (must run inside the tap)
  try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { toast('Motion permission denied'); return false; } } } catch (e) {}
  if (!window.isSecureContext) { toast('Motion sensors need HTTPS'); return false; }
  if ('RelativeOrientationSensor' in window && !params.has('nosensor')) {
    try {
      const s = new RelativeOrientationSensor({ frequency: 60, referenceFrame: 'device' });
      s.addEventListener('reading', () => { sensorQ = s.quaternion; gyroSeen = true; });
      s.addEventListener('error', () => { sensorQ = null; try { s.stop(); } catch (e) {} sensor = null; window.addEventListener('deviceorientation', onOri); });
      s.start(); sensor = s;
    } catch (e) { sensor = null; }
  }
  window.addEventListener('deviceorientation', onOri); // also listen; sensor readings take priority
  return true;
}
function stopSensors() { try { sensor?.stop(); } catch (e) {} sensor = null; sensorQ = null; devOri = null; window.removeEventListener('deviceorientation', onOri); }
async function enableGyro(on) {
  if (on) {
    if (!(await startSensors())) return false;
    gyroOn = true; gyroSeen = false; yawOffset = null;
    setTimeout(() => { if (gyroOn && !gyroSeen && !window.__mockGyro) { toast('No motion-sensor data — drag to look'); if (!vrOn) enableGyro(false); } }, 2000);
  } else {
    if (gyroOn) { const e = new THREE.Euler().setFromQuaternion(head.quaternion, 'YXZ'); yaw = e.y; pitch = clamp(e.x, -1.45, 1.45); }
    stopSensors(); gyroOn = false;
  }
  $('#btnMotion').classList.toggle('on', gyroOn); return gyroOn;
}
$('#btnMotion').onclick = async () => { stopTour(); await enableGyro(!gyroOn); if (gyroOn) toast('Motion on — move your phone to look around'); };
function recenter() { yawOffset = null; }

// ------------------------------------------------------------------ tour / UI helpers
let tourIdx = 0, tourNext = 0;
function stopTour() { if (autoTour) { autoTour = false; $('#btnAuto').classList.remove('on'); } }
$('#btnAuto').onclick = () => { autoTour = !autoTour; $('#btnAuto').classList.toggle('on', autoTour); tourNext = 0; if (autoTour) toast('Guided tour — touch to stop'); };
const fsEl = document.documentElement;
async function goFS() { try { if (!document.fullscreenElement) await (fsEl.requestFullscreen?.({ navigationUI: 'hide' }) ?? fsEl.webkitRequestFullscreen?.()); } catch (e) {} }
$('#btnFS').onclick = () => document.fullscreenElement ? document.exitFullscreen() : goFS();
let toastT; function toast(msg, ms = 2400) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
function poke() { idleT = 0; $('#hint').classList.add('hide'); }
setTimeout(() => $('#title').classList.add('mini'), 5000);

// settings panel
const phoneSel = $('#setPhone');
for (const [k, p] of Object.entries(PHONES)) { const o = document.createElement('option'); o.value = k; o.textContent = p.name; phoneSel.appendChild(o); }
phoneSel.value = params.get('phone') || cardboard.phoneKey; cardboard.phoneKey = phoneSel.value;
phoneSel.onchange = () => { cardboard.phoneKey = phoneSel.value; onResize(); showInfo(); };
$('#setLens').checked = params.get('lens') !== '0'; cardboard.distortion = $('#setLens').checked;
$('#setLens').onchange = e => { cardboard.distortion = e.target.checked; onResize(); showInfo(); };
$('#setRefl').checked = reflections; $('#setRefl').onchange = e => { reflections = e.target.checked; S.mirror.visible = reflections; };
$('#btnSet').onclick = () => { $('#settings').classList.toggle('show'); showInfo(); };
$('#setClose').onclick = () => $('#settings').classList.remove('show');
function showInfo() {
  const I = cardboard.layout(Math.max(innerWidth, innerHeight), Math.min(innerWidth, innerHeight));
  $('#setInfo').textContent = `Viewer: ${MI_VR_PLAY.vendor} ${MI_VR_PLAY.model} — lens separation ${MI_VR_PLAY.interLens * 1000} mm, screen-to-lens ${MI_VR_PLAY.screenToLens * 1000} mm, tray-to-lens ${MI_VR_PLAY.trayToLens * 1000} mm, k1 ${MI_VR_PLAY.k[0]}, k2 ${MI_VR_PLAY.k[1]}, max FOV ${MI_VR_PLAY.fov[0]}°. ` +
    `Eye FOV L/R/B/T: ${I.fovDeg.map(d => d.toFixed(1)).join(' / ')}°. Screen ${I.screenMM[0].toFixed(1)}×${I.screenMM[1].toFixed(1)} mm. Camera IPD ${cardboard.ipd * 1000} mm.`;
}

// ------------------------------------------------------------------ VR mode
let wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (vrOn && document.visibilityState === 'visible') keepAwake(); });
const isPortrait = () => innerHeight > innerWidth;
async function enterVR(opts = {}) {
  stopTour(); $('#settings').classList.remove('show');
  if (!opts.noGyro) await enableGyro(true);   // inside the user gesture
  if (!opts.noFullscreen) await goFS();
  let locked = false; try { if (screen.orientation?.lock) { await screen.orientation.lock('landscape'); locked = true; } } catch (e) {}
  keepAwake();
  vrOn = true; document.body.classList.add('vr'); reticle.visible = true;
  hotspots.forEach(h => h.userData.label.visible = false);
  if (!opts.noHistory) history.pushState({ vr: 1 }, '');
  onResize();
  if (!locked && isPortrait() && !opts.noRotatePrompt) $('#rotate').classList.add('show');
  setTimeout(() => showVRToast('Look at a gold ring and press the button to walk'), 700);
  vrFrames = 0; vrT0 = performance.now(); vrQualityStep = 0;
}
async function exitVR(fromPop = false) {
  if (!vrOn) return; vrOn = false; document.body.classList.remove('vr'); $('#rotate').classList.remove('show'); reticle.visible = false; vrToast.visible = false;
  hotspots.forEach(h => h.userData.label.visible = !isMobile || true);
  try { screen.orientation?.unlock?.(); } catch (e) {}
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
  try { await wakeLock?.release(); } catch (e) {} wakeLock = null;
  if (!fromPop && history.state?.vr) history.back();
  cardboard.scale = 1; S.mirror.visible = reflections; onResize();
}
$('#btnVR').onclick = () => enterVR();
$('#rotCancel').onclick = e => { e.stopPropagation(); exitVR(); };
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && vrOn && !window.__keepVR) exitVR(); });
window.addEventListener('popstate', () => { if (vrOn) exitVR(true); });
// VR input: ANY touch = select (Mi VR button presses a nib on the screen). Holding 1.5 s re-centres.
let holdTimer = null;
$('#vr').addEventListener('pointerdown', e => {
  if (e.target.closest('#vrExit')) return;
  vrSelect();
  clearTimeout(holdTimer); holdTimer = setTimeout(() => { recenter(); showVRToast('View re-centred'); }, 1500);
});
$('#vr').addEventListener('pointerup', () => clearTimeout(holdTimer));
$('#vr').addEventListener('pointercancel', () => clearTimeout(holdTimer));
// exit: deliberate long-press on the small X
let exitT = null;
const exitBtn = $('#vrExit');
exitBtn.addEventListener('pointerdown', e => { e.stopPropagation(); exitBtn.classList.add('arming'); exitT = setTimeout(() => { exitBtn.classList.remove('arming'); exitVR(); }, 1200); });
const disarm = () => { clearTimeout(exitT); exitBtn.classList.remove('arming'); };
exitBtn.addEventListener('pointerup', disarm); exitBtn.addEventListener('pointerleave', disarm); exitBtn.addEventListener('pointercancel', disarm);
let gazeTarget = null, gazeT = 0;
function vrSelect() {
  if (gazeTarget) { const v = gazeTarget.userData.view; goTo(v); showVRToast(v.name, 1400); gazeTarget = null; gazeT = 0; }
  else { retMat.uniforms.on.value = 1; setTimeout(() => retMat.uniforms.on.value = 0, 150); }
}

// ------------------------------------------------------------------ minimap
const mm = $('#minimap'), mctx = mm.getContext('2d');
function drawMinimap() {
  const w = mm.width, h = mm.height, s = Math.min((w - 12) / L, (h - 12) / W), ox = w / 2, oy = h / 2;
  mctx.clearRect(0, 0, w, h);
  mctx.strokeStyle = '#d8b26a'; mctx.lineWidth = 2; mctx.strokeRect(ox - HL * s, oy - HW * s, L * s, W * s);
  mctx.fillStyle = 'rgba(160,210,255,.85)'; mctx.fillRect(ox - 3.92 * s, oy - HW * s - 2, 7.84 * s, 3);
  mctx.fillRect(ox + HL * s - 1, oy - 2.62 * s, 3, 5.24 * s);
  mctx.fillStyle = 'rgba(120,200,255,.9)'; mctx.fillRect(ox - 1.55 * s, oy + HW * s - 2, 3.1 * s, 3);
  mctx.fillStyle = 'rgba(200,140,90,.9)'; for (const x of [-4.9, 4.9]) mctx.fillRect(ox + (x - 1.52) * s, oy + HW * s - 2, 3.05 * s, 3);
  for (const o of S.obstacles) { mctx.fillStyle = 'rgba(216,178,106,.35)'; mctx.fillRect(ox + o.x0 * s, oy + o.z0 * s, (o.x1 - o.x0) * s, (o.z1 - o.z0) * s); }
  for (const v of VIEWS) { mctx.fillStyle = v === current ? '#fff' : 'rgba(255,255,255,.4)'; mctx.beginPath(); mctx.arc(ox + v.x * s, oy + v.z * s, 2.5, 0, 7); mctx.fill(); }
  const e = new THREE.Euler().setFromQuaternion(head.quaternion, 'YXZ');
  const cx = ox + head.position.x * s, cy = oy + head.position.z * s, hf = camera.fov * camera.aspect * Math.PI / 360, dir = -e.y - Math.PI / 2;
  mctx.fillStyle = 'rgba(243,214,154,.35)'; mctx.beginPath(); mctx.moveTo(cx, cy); mctx.arc(cx, cy, 34, dir - Math.min(hf, 1.2), dir + Math.min(hf, 1.2)); mctx.closePath(); mctx.fill();
  mctx.fillStyle = '#f3d69a'; mctx.beginPath(); mctx.arc(cx, cy, 4, 0, 7); mctx.fill();
}
mm.addEventListener('pointerup', e => {
  const r = mm.getBoundingClientRect(), w = mm.width, h = mm.height, s = Math.min((w - 12) / L, (h - 12) / W);
  const x = ((e.clientX - r.left) / r.width * w - w / 2) / s, z = ((e.clientY - r.top) / r.height * h - h / 2) / s;
  let best = VIEWS[0], bd = 1e9; for (const v of VIEWS) { const d = Math.hypot(v.x - x, v.z - z); if (d < bd) { bd = d; best = v; } } stopTour(); goTo(best);
});

// ------------------------------------------------------------------ resize
function onResize() {
  const pr = Math.min(devicePixelRatio, vrOn ? Math.min(DPR_CAP, 1.5) : DPR_CAP);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (vrOn) cardboard.setSize(innerWidth, innerHeight, pr);
  if (vrOn && !isPortrait()) $('#rotate').classList.remove('show');
}
addEventListener('resize', onResize); screen.orientation?.addEventListener?.('change', () => setTimeout(onResize, 120));

// ------------------------------------------------------------------ loop
let last = performance.now(), vrFrames = 0, vrT0 = 0, vrQualityStep = 0;
const yAxis = new THREE.Vector3(0, 1, 0), qYaw = new THREE.Quaternion(), qT = new THREE.Quaternion();
function updateHead(dt, now) {
  if (tween) {
    const t = clamp((now - tween.t0) / tween.dur, 0, 1), k = ease(t);
    head.position.x = tween.from.x + (tween.to.x - tween.from.x) * k; head.position.z = tween.from.z + (tween.to.z - tween.from.z) * k;
    if (tween.turn) { yaw = tween.from.yaw + (tween.to.yaw - tween.from.yaw) * k; pitch = tween.from.pitch + (tween.to.pitch - tween.from.pitch) * k; }
    if (t >= 1) tween = null;
  }
  if (autoTour && !tween) { if (now > tourNext) { if (tourNext) { tourIdx = (tourIdx + 1) % VIEWS.length; goTo(VIEWS[tourIdx]); } tourNext = now + 7000; } else yaw += dt * 0.1; }
  else if (!gyroOn && !vrOn && !tween) { idleT += dt; if (idleT > 14) yaw += dt * 0.05; }
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix();
  if (window.__mockGyro) { const m = window.__mockGyro; head.quaternion.setFromEuler(new THREE.Euler(m.pitch, m.yaw, m.roll || 0, 'YXZ')); return; }
  if (gyroOn && readGyro(qGyro)) {
    if (yawOffset === null) { const ge = new THREE.Euler().setFromQuaternion(qGyro, 'YXZ'); yawOffset = yaw - ge.y; }
    qT.copy(qYaw.setFromAxisAngle(yAxis, yawOffset)).multiply(qGyro);
    // Generic Sensor data is already fused & smooth -> apply directly (lowest latency); light smoothing for the Euler fallback
    if (sensorQ) head.quaternion.copy(qT); else head.quaternion.slerp(qT, 0.65);
  } else head.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
}
function updateHotspots(now, dt) {
  // gaze target (VR) = hotspot under the view centre
  let target = null;
  if (vrOn) { ray.setFromCamera(new THREE.Vector2(0, 0), camera); const h = ray.intersectObjects(hitMeshes.filter(m => m.parent.visible))[0]; target = h ? h.object : null; }
  if (target !== gazeTarget) { gazeTarget = target; gazeT = 0; }
  if (gazeTarget) gazeT += dt;
  const p = clamp(gazeT / 2.0, 0, 1); retMat.uniforms.p.value = p; if (gazeTarget) retMat.uniforms.on.value = 1; else if (retMat.uniforms.on.value === 1 && !gazeTarget) retMat.uniforms.on.value = 0;
  if (vrOn && p >= 1) { const v = gazeTarget.userData.view; goTo(v); showVRToast(v.name, 1400); gazeTarget = null; gazeT = 0; }
  for (const h of hotspots) {
    const d = Math.hypot(h.position.x - head.position.x, h.position.z - head.position.z);
    h.visible = d > 0.5;
    const hot = gazeTarget && gazeTarget.parent === h;
    const pulse = 1 + Math.sin(now * 0.004 + h.position.x) * 0.06;
    h.userData.ring.scale.setScalar(hot ? 1.35 : pulse);
    h.userData.ring.material.color.setRGB(hot ? 3 : 2.2, hot ? 3 : 1.7, hot ? 3 : 0.9);
    h.userData.disc.material.opacity = hot ? 0.45 : 0.12;
    h.userData.beam.material.uniforms.a.value = hot ? 0.9 : 0.32;
    h.userData.label.visible = vrOn ? hot : (d > 2.6 && d < 10);
  }
}
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  updateHead(dt, now); head.updateMatrixWorld(true); updateHotspots(now, dt);
  if (S.water) S.water.material.uniforms.time.value = now / 1000;
  S.mirror.children[1]?.traverse?.(o => { if (o.material?.uniforms?.time) o.material.uniforms.time.value = now / 1000; });
  if (vrOn) {
    cardboard.render(scene, camera.parent === head ? camObj() : camera, innerWidth, innerHeight);
    // adaptive quality after 2 s: drop reflections, then eye resolution, if under ~45 fps
    vrFrames++; const el2 = now - vrT0;
    if (el2 > 2000) { const fps = vrFrames / (el2 / 1000); vrFrames = 0; vrT0 = now;
      if (fps < 45 && vrQualityStep === 0) { S.mirror.visible = false; vrQualityStep = 1; }
      else if (fps < 45 && vrQualityStep === 1) { cardboard.scale = 0.75; onResize(); vrQualityStep = 2; } }
  } else renderer.render(scene, camera);
  drawMinimap();
  requestAnimationFrame(loop);
}
const _cam = new THREE.Object3D();
function camObj() { head.getWorldPosition(_cam.position); head.getWorldQuaternion(_cam.quaternion); return _cam; }
manager.onLoad = () => {
  goTo(VIEWS[0], true);
  requestAnimationFrame(() => { captureEnv(); captureEnv(); $('#loader').classList.add('done'); window.__ready = true; });
};
requestAnimationFrame(loop);

// ------------------------------------------------------------------ 8K equirectangular export (run offline; also callable in browser)
async function exportPanorama(width = 8192, quality = 0.92) {
  const height = width / 2, face = Math.min(4096, width / 4);
  const cubeRT = new THREE.WebGLCubeRenderTarget(face, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cc = new THREE.CubeCamera(0.05, 200, cubeRT); cc.position.set(0, EYE, 0); scene.add(cc);
  hotspots.forEach(h => h.visible = false); reticle.visible = false;
  cc.update(renderer, scene);
  const eqMat = new THREE.ShaderMaterial({ uniforms: { cube: { value: cubeRT.texture }, exposure: { value: renderer.toneMappingExposure } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: `uniform samplerCube cube; uniform float exposure; varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }
      vec3 aces(vec3 c){ const mat3 I=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));
        const mat3 O=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));
        c*=exposure/0.6; c=I*c; c=RRTAndODTFit(c); c=O*c; return clamp(c,0.,1.); }
      void main(){ float lon=(vUv.x-0.5)*6.28318530718; float lat=(vUv.y-0.5)*3.14159265359;
        vec3 d=vec3(sin(lon)*cos(lat), sin(lat), -cos(lon)*cos(lat));
        gl_FragColor=vec4(aces(textureCube(cube,d).rgb),1.0);
        #include <colorspace_fragment>
      }` });
  const s2 = new THREE.Scene(); s2.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), eqMat));
  const out = new THREE.WebGLRenderTarget(width, height, { colorSpace: THREE.SRGBColorSpace });
  renderer.setRenderTarget(out); renderer.render(s2, cardboard.postCam); renderer.setRenderTarget(null);
  const cnv = document.createElement('canvas'); cnv.width = width; cnv.height = height;
  const ctx = cnv.getContext('2d'); const strip = 512; const buf = new Uint8Array(width * strip * 4);
  for (let y = 0; y < height; y += strip) {
    renderer.readRenderTargetPixels(out, 0, y, width, strip, buf);
    const img = new ImageData(width, strip);
    for (let r = 0; r < strip; r++) img.data.set(buf.subarray((strip - 1 - r) * width * 4, (strip - r) * width * 4), r * width * 4);
    ctx.putImageData(img, 0, height - y - strip);
  }
  hotspots.forEach(h => h.visible = true); scene.remove(cc); cubeRT.dispose(); out.dispose();
  return cnv.toDataURL('image/jpeg', quality);
}

window.app = { enterVR, exitVR, goTo, VIEWS, exportPanorama, cardboard, vrSelect,
  look: (y, p, f) => { poke(); yaw = y; pitch = p; if (f) { fov = f; camera.fov = f; } idleT = -1e9; },
  place: (x, z) => { head.position.x = x; head.position.z = z; tween = null; },
  setReflections: v => { reflections = v; S.mirror.visible = v; }, camera, renderer, scene, S };
