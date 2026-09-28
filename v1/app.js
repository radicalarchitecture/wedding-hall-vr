import * as THREE from 'three';

// ---------- Room dimensions (metres) ----------
const L = 15, W = 5, H = 5, EYE = 1.6, IPD = 0.063;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
const DPR_CAP = 2;
renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('#stage').appendChild(renderer.domElement);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120806);
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.05, 100);
camera.rotation.order = 'YXZ';
camera.position.set(0, EYE, 0);

// ---------- Surfaces: unlit texture + soft contact shading at room corners ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (u, a, b) => { $('#lprog').style.width = (a/b*100) + '%'; };
const loader = new THREE.TextureLoader(manager);
function surfMat(url, sizeX, sizeY, edges, tone = 1.0) {
  const tex = loader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, size: { value: new THREE.Vector2(sizeX, sizeY) }, edges: { value: new THREE.Vector4(...edges) }, tone: { value: tone } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec2 size; uniform vec4 edges; uniform float tone; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(map, vUv).rgb;
        vec2 m = vUv*size;            // metres from left/bottom
        vec2 n = (1.0-vUv)*size;      // metres from right/top
        float ao = 1.0;
        ao *= 1.0 - edges.x*0.30*exp(-m.x/0.35);
        ao *= 1.0 - edges.y*0.30*exp(-n.x/0.35);
        ao *= 1.0 - edges.z*0.30*exp(-m.y/0.35);
        ao *= 1.0 - edges.w*0.30*exp(-n.y/0.35);
        gl_FragColor = vec4(c*ao*tone, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.FrontSide
  });
}
const room = new THREE.Group(); scene.add(room);
function plane(w, h, mat, pos, rotX = 0, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(...pos); m.rotation.set(rotX, rotY, 0, 'YXZ'); room.add(m); return m;
}
// floor: image top edge toward entrance wall (-z)
plane(L, W, surfMat('tex/floor.jpg', L, W, [1,1,1,1], 1.0), [0, 0, 0], -Math.PI/2);
plane(L, W, surfMat('tex/ceiling.jpg', L, W, [1,1,1,1], 1.0), [0, H, 0], Math.PI/2);
plane(L, H, surfMat('tex/wall_entrance.jpg', L, H, [1,1,1,1]), [0, H/2, -W/2]);            // faces +z
plane(L, H, surfMat('tex/wall_water.jpg', L, H, [1,1,1,1]), [0, H/2, W/2], 0, Math.PI);     // faces -z
plane(W, H, surfMat('tex/wall_niche.jpg', W, H, [1,1,1,1]), [-L/2, H/2, 0], 0, Math.PI/2);  // faces +x
plane(W, H, surfMat('tex/wall_banquet.jpg', W, H, [1,1,1,1]), [L/2, H/2, 0], 0, -Math.PI/2);// faces -x

// ---------- Viewpoints ----------
const VIEWS = [
  { id: 'centre',  name: 'Hall centre',     x: 0,    z: 0,    yaw: -1.25 },
  { id: 'arrival', name: 'Arrival',         x: 0,    z: -1.5, yaw: Math.PI },
  { id: 'recept',  name: 'Reception',       x: 0,    z: 1.4,  yaw: 0 },
  { id: 'niche',   name: 'Lotus niche',     x: -5.0, z: 0,    yaw: Math.PI/2 },
  { id: 'banquet', name: 'Banquet doors',   x: 5.0,  z: 0,    yaw: -Math.PI/2 },
  { id: 'long',    name: 'Full-length view',x: -6.4, z: 0,    yaw: -Math.PI/2 },
];
const ringGeo = new THREE.RingGeometry(0.22, 0.3, 48);
const dotGeo = new THREE.CircleGeometry(0.1, 32);
const hotspots = [];
for (const v of VIEWS) {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf3d69a, transparent: true, opacity: 0.85, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  const hit = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ visible: false }));
  g.add(ring, dot, hit); g.rotation.x = -Math.PI/2; g.position.set(v.x, 0.012, v.z);
  g.userData = { view: v, ring, dot }; hit.userData.view = v;
  scene.add(g); hotspots.push(g);
}
const hitMeshes = hotspots.map(h => h.children[2]);

// ---------- Look state ----------
let yaw = 0, pitch = -0.05, fov = innerHeight > innerWidth ? 90 : 75;
let gyroOn = false, gyroQ = new THREE.Quaternion(), gyroSeen = false, yawOffset = 0;
let current = VIEWS[0], tween = null, autoTour = false, idleT = 0;
let vrOn = false, distortion = false;

function goTo(v, instant = false) {
  current = v;
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.id === v.id));
  const from = { x: camera.position.x, z: camera.position.z, yaw, pitch };
  let dy = v.yaw - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const to = { x: v.x, z: v.z, yaw: yaw + dy, pitch: -0.05 };
  if (instant) { camera.position.x = to.x; camera.position.z = to.z; yaw = to.yaw; pitch = to.pitch; tween = null; return; }
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  tween = { from, to, t0: performance.now(), dur: 900 + dist*180, turn: !(gyroOn || vrOn) };
}
const nav = $('#views');
for (const v of VIEWS) {
  const b = document.createElement('button'); b.textContent = v.name; b.dataset.id = v.id;
  b.onclick = () => { stopTour(); goTo(v); poke(); }; nav.appendChild(b);
}

// ---------- Touch / mouse look + pinch ----------
const el = renderer.domElement;
const ptrs = new Map(); let pinch0 = 0, fov0 = fov, moved = 0, downT = 0;
el.addEventListener('pointerdown', e => {
  el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = 0; downT = performance.now(); poke(); stopTour();
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x-b.x, a.y-b.y); fov0 = fov; }
});
el.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptrs.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (vrOn) return;
  if (ptrs.size === 1) {
    moved += Math.abs(dx) + Math.abs(dy);
    const k = (fov * Math.PI/180) / innerHeight;           // drag feels "attached" to the image
    if (gyroOn) yawOffset += dx * k; else { yaw += dx * k; pitch = clamp(pitch + dy * k, -1.45, 1.45); }
    tween && (tween.turn = false);
  } else if (ptrs.size === 2) {
    moved += 99;
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x-b.x, a.y-b.y);
    if (pinch0 > 0) fov = clamp(fov0 * pinch0 / d, 30, 100);
  }
});
const up = e => {
  const had = ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0;
  if (!had) return;
  if (vrOn) { vrTap(); return; }
  if (moved < 8 && performance.now() - downT < 400) tapPick(e.clientX, e.clientY);
};
el.addEventListener('pointerup', up); el.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch0 = 0; });
el.addEventListener('wheel', e => { fov = clamp(fov + e.deltaY * 0.03, 30, 100); poke(); }, { passive: true });

const ray = new THREE.Raycaster();
function tapPick(x, y) {
  ray.setFromCamera(new THREE.Vector2(x/innerWidth*2-1, -(y/innerHeight)*2+1), camera);
  const h = ray.intersectObjects(hitMeshes)[0];
  if (h) { goTo(h.object.userData.view); return; }
  // tap on floor anywhere = walk there (keeps 0.6 m from walls)
  const f = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), 0), new THREE.Vector3());
  if (f && ray.ray.direction.y < -0.15) {
    goTo({ id: '_', name: '', x: clamp(f.x, -L/2+0.6, L/2-0.6), z: clamp(f.z, -W/2+0.6, W/2-0.6), yaw });
  }
}

// ---------- Gyroscope ----------
const zee = new THREE.Vector3(0,0,1), qX = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5)), eul = new THREE.Euler(), q0 = new THREE.Quaternion();
let devOri = null;
function onOri(e) {
  if (e.alpha == null && e.beta == null) return;
  devOri = e; gyroSeen = true;
}
function screenAngle() { return ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI/180; }
function deviceQuat(out) {
  const a = (devOri.alpha||0)*Math.PI/180, b = (devOri.beta||0)*Math.PI/180, g = (devOri.gamma||0)*Math.PI/180;
  eul.set(b, a, -g, 'YXZ'); out.setFromEuler(eul); out.multiply(qX); out.multiply(q0.setFromAxisAngle(zee, -screenAngle()));
  return out;
}
async function enableGyro(on) {
  if (on) {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { toast('Motion permission denied — use touch to look around'); return false; }
      }
    } catch (err) { toast('Motion sensors unavailable'); return false; }
    if (!window.isSecureContext) { toast('Motion needs HTTPS'); return false; }
    window.addEventListener('deviceorientation', onOri);
    gyroOn = true; gyroSeen = false; yawOffset = null;
    setTimeout(() => { if (gyroOn && !gyroSeen) { toast('No gyroscope data — drag to look'); if (!vrOn) enableGyro(false); } }, 1800);
  } else {
    window.removeEventListener('deviceorientation', onOri);
    if (gyroOn) { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); yaw = e.y; pitch = clamp(e.x, -1.45, 1.45); }
    gyroOn = false; devOri = null;
  }
  $('#btnMotion').classList.toggle('on', gyroOn);
  return gyroOn;
}
$('#btnMotion').onclick = async () => { stopTour(); await enableGyro(!gyroOn); if (gyroOn) toast('Motion on — move your phone to look around'); };

// ---------- Auto tour ----------
let tourIdx = 0, tourNext = 0;
function stopTour() { if (autoTour) { autoTour = false; $('#btnAuto').classList.remove('on'); } }
$('#btnAuto').onclick = () => { autoTour = !autoTour; $('#btnAuto').classList.toggle('on', autoTour); tourNext = 0; if (autoTour) toast('Guided tour — touch to stop'); };

// ---------- Fullscreen / UI ----------
const fsEl = document.documentElement;
async function goFS() { try { if (!document.fullscreenElement) await (fsEl.requestFullscreen?.({ navigationUI: 'hide' }) ?? fsEl.webkitRequestFullscreen?.()); } catch (e) {} }
$('#btnFS').onclick = () => document.fullscreenElement ? document.exitFullscreen() : goFS();
let toastT; function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
let vrToastT; function vrToast(msg) { document.querySelectorAll('.vrtoast').forEach(t => { t.textContent = msg; t.classList.add('show'); }); clearTimeout(vrToastT); vrToastT = setTimeout(() => document.querySelectorAll('.vrtoast').forEach(t => t.classList.remove('show')), 1800); }
function poke() { idleT = 0; $('#hint').classList.add('hide'); }
setTimeout(() => $('#title').classList.add('mini'), 5000);

// ---------- VR (side-by-side stereo, optional barrel distortion) ----------
const eyeCam = new THREE.PerspectiveCamera(80, 1, 0.05, 100);
const rtOpts = { colorSpace: THREE.SRGBColorSpace, samples: 4 };
let rtL = new THREE.WebGLRenderTarget(16, 16, rtOpts), rtR = new THREE.WebGLRenderTarget(16, 16, rtOpts);
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, k: { value: new THREE.Vector2(0, 0) }, aspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 k; uniform float aspect; varying vec2 vUv;
    void main(){
      vec2 p = vUv*2.0-1.0; p.x *= aspect;
      float r2 = dot(p,p);
      float f = 1.0 + k.x*r2 + k.y*r2*r2;
      float norm = 1.0 + k.x + k.y;          // keep the edge of the short axis in view
      vec2 q = p*f/norm; q.x /= aspect;
      vec2 uv = q*0.5+0.5;
      if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor=vec4(0.,0.,0.,1.); return; }
      gl_FragColor = texture2D(tDiffuse, uv);
      #include <colorspace_fragment>
    }`,
  depthTest: false, depthWrite: false
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
let wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (vrOn && document.visibilityState === 'visible') keepAwake(); });
const isPortrait = () => innerHeight > innerWidth;

async function enterVR(opts = {}) {
  stopTour();
  if (!opts.noGyro) await enableGyro(true);      // inside the user gesture (iOS permission)
  if (!opts.noFullscreen) await goFS();
  let locked = false;
  try { if (screen.orientation?.lock) { await screen.orientation.lock('landscape'); locked = true; } } catch (e) {}
  keepAwake();
  vrOn = true; document.body.classList.add('vr');
  fov = 75; onResize();
  if (!locked && isPortrait() && !opts.noRotatePrompt) $('#rotate').classList.add('show');
  setTimeout(() => vrToast('Tap: lens correction · Double-tap: exit'), 600);
}
async function exitVR() {
  if (!vrOn) return;
  vrOn = false; document.body.classList.remove('vr'); $('#rotate').classList.remove('show');
  try { screen.orientation?.unlock?.(); } catch (e) {}
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
  try { await wakeLock?.release(); } catch (e) {} wakeLock = null;
  onResize();
}
let tapTimer = null;
function vrTap() {
  if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; exitVR(); return; }
  tapTimer = setTimeout(() => { tapTimer = null; setDistortion(!distortion); }, 300);
}
function setDistortion(on) { distortion = on; vrToast(on ? 'Lens correction ON (Cardboard)' : 'Lens correction OFF'); }
$('#btnVR').onclick = () => enterVR();
$('#rotCancel').onclick = e => { e.stopPropagation(); exitVR(); };
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && vrOn && !window.__keepVR) exitVR(); });
$('#vr').addEventListener('pointerup', () => vrTap());

// ---------- Minimap ----------
const mm = $('#minimap'), mctx = mm.getContext('2d');
function drawMinimap() {
  const w = mm.width, h = mm.height, s = Math.min((w-16)/L, (h-16)/W), ox = w/2, oy = h/2;
  mctx.clearRect(0, 0, w, h);
  mctx.strokeStyle = '#d8b26a'; mctx.lineWidth = 2; mctx.strokeRect(ox - L/2*s, oy - W/2*s, L*s, W*s);
  mctx.fillStyle = 'rgba(216,178,106,.9)'; // entrance marker (glass door on -z wall)
  mctx.fillRect(ox - 1.6*s, oy - W/2*s - 3, 3.2*s, 4);
  mctx.fillStyle = 'rgba(120,200,255,.8)'; mctx.fillRect(ox - 0.9*s, oy + W/2*s - 1, 1.8*s, 4); // water wall
  for (const v of VIEWS) { mctx.fillStyle = v === current ? '#fff' : 'rgba(255,255,255,.35)'; mctx.beginPath(); mctx.arc(ox + v.x*s, oy + v.z*s, 2.5, 0, 7); mctx.fill(); }
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  const cx = ox + camera.position.x*s, cy = oy + camera.position.z*s, hf = camera.fov*camera.aspect*Math.PI/360;
  const dir = -e.y - Math.PI/2;
  mctx.fillStyle = 'rgba(243,214,154,.35)'; mctx.beginPath(); mctx.moveTo(cx, cy);
  mctx.arc(cx, cy, 30, dir - Math.min(hf, 1.2), dir + Math.min(hf, 1.2)); mctx.closePath(); mctx.fill();
  mctx.fillStyle = '#f3d69a'; mctx.beginPath(); mctx.arc(cx, cy, 4, 0, 7); mctx.fill();
}
mm.addEventListener('pointerup', e => {
  const r = mm.getBoundingClientRect(), w = mm.width, h = mm.height, s = Math.min((w-16)/L, (h-16)/W);
  const x = ((e.clientX - r.left)/r.width*w - w/2)/s, z = ((e.clientY - r.top)/r.height*h - h/2)/s;
  let best = VIEWS[0], bd = 1e9; for (const v of VIEWS) { const d = Math.hypot(v.x-x, v.z-z); if (d < bd) { bd = d; best = v; } }
  stopTour(); goTo(best);
});

// ---------- Resize ----------
function onResize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  const ew = Math.floor(sz.x/2), eh = sz.y;
  rtL.setSize(ew, eh); rtR.setSize(ew, eh);
  if (vrOn && !isPortrait()) $('#rotate').classList.remove('show');
}
addEventListener('resize', onResize); screen.orientation?.addEventListener?.('change', () => setTimeout(onResize, 100));

// ---------- Loop ----------
let last = performance.now(), gazeTarget = null, gazeT = 0;
const tmpQ = new THREE.Quaternion(), yawQ = new THREE.Quaternion(), yAxis = new THREE.Vector3(0,1,0), right = new THREE.Vector3();
function updateCamera(dt, now) {
  if (tween) {
    const t = clamp((now - tween.t0)/tween.dur, 0, 1), k = ease(t);
    camera.position.x = tween.from.x + (tween.to.x - tween.from.x)*k;
    camera.position.z = tween.from.z + (tween.to.z - tween.from.z)*k;
    if (tween.turn) { yaw = tween.from.yaw + (tween.to.yaw - tween.from.yaw)*k; pitch = tween.from.pitch + (tween.to.pitch - tween.from.pitch)*k; }
    camera.position.y = EYE + Math.sin(k*Math.PI)*0.025;     // subtle step feel
    if (t >= 1) tween = null;
  }
  if (autoTour && !tween) {
    if (now > tourNext) { if (tourNext) { tourIdx = (tourIdx + 1) % VIEWS.length; goTo(VIEWS[tourIdx]); } tourNext = now + 6500; }
    else yaw += dt*0.12;
  } else if (!gyroOn && !vrOn && !tween) {
    idleT += dt; if (idleT > 12) yaw += dt*0.06;          // gentle idle drift
  }
  camera.fov += (fov - camera.fov)*Math.min(1, dt*12); 
  if (gyroOn && devOri) {
    deviceQuat(gyroQ);
    if (yawOffset === null) { const ge = new THREE.Euler().setFromQuaternion(gyroQ, 'YXZ'); yawOffset = yaw - ge.y; }
    yawQ.setFromAxisAngle(yAxis, yawOffset);
    tmpQ.copy(yawQ).multiply(gyroQ);
    camera.quaternion.slerp(tmpQ, Math.min(1, dt*30));         // light smoothing of sensor jitter
  } else if (window.__mockGyro) {
    camera.quaternion.setFromEuler(new THREE.Euler(window.__mockGyro.pitch, window.__mockGyro.yaw, window.__mockGyro.roll||0, 'YXZ'));
  } else {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  camera.updateProjectionMatrix();
}
function updateHotspots(now) {
  for (const h of hotspots) {
    const d = Math.hypot(h.position.x - camera.position.x, h.position.z - camera.position.z);
    const here = d < 0.3;
    h.visible = !here;
    const s = 1 + Math.sin(now*0.004 + h.position.x)*0.08; h.userData.ring.scale.setScalar(s);
    h.userData.ring.material.opacity = h.userData === gazeTarget?.parent?.userData ? 1 : 0.8;
  }
}
function gaze(dt) {
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const h = ray.intersectObjects(hitMeshes.filter(m => m.parent.visible))[0];
  const tgt = h ? h.object : null;
  if (tgt !== gazeTarget) { gazeTarget = tgt; gazeT = 0; }
  if (gazeTarget) gazeT += dt;
  const p = clamp(gazeT/1.6, 0, 1);
  document.querySelectorAll('.reticle').forEach(r => { r.classList.toggle('gazing', !!gazeTarget); r.querySelector('.rp').style.strokeDashoffset = 88*(1-p); });
  if (p >= 1) { goTo(gazeTarget.userData.view); vrToast(gazeTarget.userData.view.name); gazeTarget = null; gazeT = 0; }
}
function renderStereo() {
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  const ew = Math.floor(sz.x/2), eh = sz.y;
  eyeCam.fov = 85; eyeCam.aspect = ew/eh; eyeCam.near = 0.05; eyeCam.updateProjectionMatrix();
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const kk = distortion ? [0.22, 0.24] : [0, 0];
  postMat.uniforms.k.value.set(kk[0], kk[1]); postMat.uniforms.aspect.value = ew/eh;
  [[rtL, -1], [rtR, 1]].forEach(([rt, s]) => {
    eyeCam.position.copy(camera.position).addScaledVector(right, s*IPD/2);
    eyeCam.quaternion.copy(camera.quaternion);
    renderer.setRenderTarget(rt); renderer.render(scene, eyeCam);
  });
  renderer.setRenderTarget(null);
  renderer.setScissorTest(true);
  const cssW = innerWidth/2, cssH = innerHeight;
  [[rtL, 0], [rtR, cssW]].forEach(([rt, x]) => {
    renderer.setViewport(x, 0, cssW, cssH); renderer.setScissor(x, 0, cssW, cssH);
    postMat.uniforms.tDiffuse.value = rt.texture; renderer.render(postScene, postCam);
  });
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
}
function loop(now) {
  const dt = Math.min(0.1, (now - last)/1000); last = now;
  updateCamera(dt, now); updateHotspots(now);
  if (vrOn) { gaze(dt); renderStereo(); } else renderer.render(scene, camera);
  if ((now|0) % 3 === 0 || true) drawMinimap();
  requestAnimationFrame(loop);
}
manager.onLoad = () => { $('#loader').classList.add('done'); goTo(VIEWS[0], true); window.__ready = true; };
requestAnimationFrame(loop);

// ---------- Equirectangular export (used offline to build the 8K panorama; also callable in-browser) ----------
async function exportPanorama(width = 8192, quality = 0.92) {
  const height = width/2, face = Math.min(4096, width/4 * 1.0 | 0);
  const cubeRT = new THREE.WebGLCubeRenderTarget(face, { colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cc = new THREE.CubeCamera(0.05, 100, cubeRT);
  cc.position.set(0, EYE, 0);
  hotspots.forEach(h => h.visible = false);
  cc.update(renderer, scene);
  const eqMat = new THREE.ShaderMaterial({
    uniforms: { cube: { value: cubeRT.texture } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: `uniform samplerCube cube; varying vec2 vUv;
      void main(){
        float lon = (vUv.x - 0.5) * 6.28318530718;  // centre of image = looking at -z (entrance)
        float lat = (vUv.y - 0.5) * 3.14159265359;
        vec3 d = vec3(sin(lon)*cos(lat), sin(lat), -cos(lon)*cos(lat));
        gl_FragColor = textureCube(cube, d);
        #include <colorspace_fragment>
      }`
  });
  const s2 = new THREE.Scene(); s2.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), eqMat));
  const out = new THREE.WebGLRenderTarget(width, height, { colorSpace: THREE.SRGBColorSpace });
  renderer.setRenderTarget(out); renderer.render(s2, postCam); renderer.setRenderTarget(null);
  const cnv = document.createElement('canvas'); cnv.width = width; cnv.height = height;
  const ctx = cnv.getContext('2d'); const strip = 512; const buf = new Uint8Array(width*strip*4);
  for (let y = 0; y < height; y += strip) {
    renderer.readRenderTargetPixels(out, 0, y, width, strip, buf);
    const img = new ImageData(width, strip);
    for (let r = 0; r < strip; r++) img.data.set(buf.subarray((strip-1-r)*width*4, (strip-r)*width*4), r*width*4);
    ctx.putImageData(img, 0, height - y - strip);
  }
  hotspots.forEach(h => h.visible = true);
  cubeRT.dispose(); out.dispose();
  return cnv.toDataURL('image/jpeg', quality);
}

window.app = { enterVR, exitVR, goTo, VIEWS, exportPanorama, setDistortion,
  look: (y, p, f) => { yaw = y; pitch = p; if (f) { fov = f; camera.fov = f; } idleT = -1e9; },
  camera, renderer };
