// Spectator page for the office TV / laptop: one wide, non-split, undistorted view that follows the headset.
import * as THREE from 'three';
import { LinkReceiver } from './link.js?v=7';
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const PANO = (i, hq) => `pano/v5/${hq ? 'e6' : 'e4'}_${i}_L.jpg?v=5`;   // left-eye image = mono 360 (4K default; ?q=hq -> 6K for a laptop)
const HQ = params.get('q') === 'hq';
const canvas = $('#c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' }); }
catch (e) { document.body.innerHTML = '<p style="padding:40px;font-size:24px">This browser has no WebGL. Please use a laptop with Chrome/Edge connected to the TV by HDMI.</p>'; throw e; }
renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
const maxTex = renderer.capabilities.maxTextureSize;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
// two pano spheres (same mapping as the headset viewer) for crossfades
const geo = new THREE.SphereGeometry(40, 64, 40); geo.scale(-1, 1, 1); geo.rotateY(-Math.PI / 2);
const spheres = [0, 1].map(() => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false })); scene.add(m); return m; });
let front = 0, curView = -1, fade = null, want = 0;
const loader = new THREE.TextureLoader();
function loadTex(i) {
  return new Promise((res, rej) => loader.load(PANO(i, HQ && maxTex >= 8192), t => { t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; res(t); }, undefined, rej));
}
async function showView(i) {
  if (i === curView || i === want && fade) return; want = i;
  let t; try { t = await loadTex(i); } catch (e) { return; }
  if (want !== i) { t.dispose(); return; }
  const back = spheres[1 - front]; if (back.material.map) back.material.map.dispose();
  back.material.map = t; back.material.needsUpdate = true; back.material.opacity = 0; back.renderOrder = 1; spheres[front].renderOrder = 0;
  fade = { t0: performance.now(), back, frontM: spheres[front] }; front = 1 - front; curView = i;
}
// watermark (drawn into the canvas so it is part of the recording)
const wmC = document.createElement('canvas'); wmC.width = 1024; wmC.height = 128;
{ const g = wmC.getContext('2d'); g.font = '500 54px Georgia, serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(243,223,179,0.9)';
  g.letterSpacing = '10px'; g.fillText('RADICAL ARCHITECTURE', 1000, 80); }
const wmTex = new THREE.CanvasTexture(wmC); wmTex.colorSpace = THREE.SRGBColorSpace;
const ortho = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1), oscene = new THREE.Scene();
const wm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: wmTex, transparent: true, opacity: 0.55, depthTest: false })); oscene.add(wm);
// output size (= recording size); canvas is letterboxed on screen via CSS
let outW = 1920, outH = 1080;
function layout() {
  const res = +$('#res').value, port = $('#aspect').value === 'port';
  const s = Math.min(res, 2160) / 1080; outW = Math.round((port ? 1080 : 1920) * s); outH = Math.round((port ? 1920 : 1080) * s);
  renderer.setSize(outW, outH, false);
  const k = Math.min(innerWidth / outW, innerHeight / outH); canvas.style.width = outW * k + 'px'; canvas.style.height = outH * k + 'px';
  const ww = outW * 0.34, wh = ww / 8; ortho.right = outW; ortho.top = outH; ortho.updateProjectionMatrix();
  wm.scale.set(ww, wh, 1); wm.position.set(outW - ww / 2 - outW * 0.02, wh / 2 + outH * 0.025, 0);
  setFov();
}
function setFov() {
  const f = +$('#fov').value; $('#fovO').textContent = f + '°'; camera.aspect = outW / outH;
  // slider = FOV across the shorter side (vertical on 16:9, horizontal on 9:16)
  camera.fov = outW >= outH ? f : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(f) / 2) / camera.aspect));
  camera.updateProjectionMatrix();
}
$('#fov').oninput = setFov; addEventListener('resize', layout);
// head pose: latest sample -> smoothed camera (slerp), optional roll removal
const qT = new THREE.Quaternion(), qC = new THREE.Quaternion(), eu = new THREE.Euler(0, 0, 0, 'YXZ');
let haveQ = false, lastMsg = 0, autoYaw = 1.15;
function onMsg(m) {
  if (!m || !m.q) return;
  qT.set(m.q[0], m.q[1], m.q[2], m.q[3]).normalize();
  if (!haveQ) { qC.copy(qT); haveQ = true; }
  lastMsg = performance.now();
  if (typeof m.v === 'number') showView(m.v);
}
window.__spec = { get q() { return qC.toArray(); }, get qT() { return qT.toArray(); }, get view() { return curView; }, get via() { return rx && rx.via; } };
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!haveQ) { autoYaw += dt * 0.05; eu.set(0.05, autoYaw, 0); qC.setFromEuler(eu); }
  else {
    const k = 1 - Math.exp(-dt * +$('#smooth').value); qC.slerp(qT, k);
  }
  camera.quaternion.copy(qC);
  if ($('#level').checked) { eu.setFromQuaternion(qC, 'YXZ'); eu.z = 0; camera.quaternion.setFromEuler(eu); }
  if (fade) { const k = Math.min(1, (now - fade.t0) / 700); fade.back.material.opacity = k * k * (3 - 2 * k); if (k >= 1) { fade.frontM.material.opacity = 0; fade = null; } }
  renderer.autoClear = true; renderer.render(scene, camera);
  if ($('#wm').checked) { renderer.autoClear = false; renderer.render(oscene, ortho); }
  if (recOn) $('#rec span').textContent = fmtT((now - recT0) / 1000);
  requestAnimationFrame(loop);
}
// ---------------- UI: auto-hide, fullscreen, keys
let hideT = 0; const poke = () => { document.body.classList.remove('hideui'); clearTimeout(hideT); hideT = setTimeout(() => { if (!document.activeElement || document.activeElement.tagName !== 'SELECT') document.body.classList.add('hideui'); }, 3500); };
['mousemove', 'keydown', 'pointerdown', 'touchstart'].forEach(e => addEventListener(e, poke)); poke();
const fullscreen = () => { const d = document.documentElement; if (!document.fullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); else document.exitFullscreen && document.exitFullscreen(); };
$('#bFull').onclick = fullscreen;
addEventListener('keydown', e => {
  if ($('#pair').hidden === false) return;
  if (e.key === 'f' || e.key === 'F') fullscreen(); else if (e.key === 'r' || e.key === 'R') toggleRec();
  else if (e.key === '+' || e.key === '=') { $('#fov').value = +$('#fov').value + 5; setFov(); } else if (e.key === '-') { $('#fov').value = +$('#fov').value - 5; setFov(); }
});
const msg = (t, ms = 6000) => { const m = $('#msg'); m.textContent = t; m.style.display = 'block'; clearTimeout(msg.t); msg.t = setTimeout(() => m.style.display = 'none', ms); };
// ---------------- recording (canvas only -> UI never appears in the video)
const FORMATS = [['video/mp4;codecs=avc1.640028', 'MP4 (H.264)', 'mp4'], ['video/mp4;codecs=avc1', 'MP4 (H.264)', 'mp4'], ['video/mp4', 'MP4', 'mp4'],
  ['video/webm;codecs=vp9', 'WebM (VP9)', 'webm'], ['video/webm;codecs=vp8', 'WebM (VP8)', 'webm'], ['video/webm', 'WebM', 'webm']];
const canRec = !!(window.MediaRecorder && canvas.captureStream);
const fmts = []; if (canRec) for (const f of FORMATS) if (MediaRecorder.isTypeSupported(f[0]) && !fmts.some(g => g[1] === f[1])) fmts.push(f);
$('#fmt').innerHTML = fmts.map(f => `<option value="${f[0]}">${f[1]}</option>`).join('') || '<option>recording not supported</option>';
let rec = null, recOn = false, recT0 = 0, chunks = [];
const fmtT = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
function toggleRec() {
  if (!canRec || !fmts.length) { msg('This browser cannot record video (no MediaRecorder). For recording, open this page on a laptop (Chrome/Edge) connected to the TV by HDMI.', 9000); return; }
  if (recOn) { rec.stop(); return; }
  const mime = $('#fmt').value, ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const stream = canvas.captureStream(30);
  rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: outW * outH > 3e6 ? 40e6 : 12e6 });
  chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    recOn = false; $('#rec').classList.remove('on'); $('#bRec').classList.remove('on'); $('#bRec').textContent = '● Record';
    ['res', 'aspect', 'fmt'].forEach(id => $('#' + id).disabled = false);
    const blob = new Blob(chunks, { type: mime.split(';')[0] }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `radical-lobby-${stamp()}.${ext}`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    msg(`Saved ${a.download} (${(blob.size / 1e6).toFixed(1)} MB)`);
    stream.getTracks().forEach(t => t.stop());
  };
  rec.start(1000); recOn = true; recT0 = performance.now();
  $('#rec').classList.add('on'); $('#bRec').classList.add('on'); $('#bRec').textContent = '■ Stop';
  ['res', 'aspect', 'fmt'].forEach(id => $('#' + id).disabled = true);
}
$('#bRec').onclick = toggleRec;
$('#res').onchange = $('#aspect').onchange = () => { if ($('#res').value === '2160' && maxTex < 4096) msg('4K may be too heavy for this device.'); layout(); };
window.__rec = { toggle: toggleRec, get on() { return recOn; } };
// ---------------- pairing
let rx = null;
function connect(code) {
  $('#pair').hidden = true; $('#codeO').textContent = code; history.replaceState(null, '', `?room=${code}${HQ ? '&q=hq' : ''}`);
  rx = new LinkReceiver(code, 'vendor/', onMsg, s => { $('#status span').textContent = s; $('#status').classList.toggle('ok', s.startsWith('connected')); }, params.get('transport') || 'auto');
  rx.start();
}
$('#pairForm').onsubmit = e => { e.preventDefault(); const c = $('#code').value.trim(); if (/^\d{4}$/.test(c)) connect(c); };
$('#bCode').onclick = () => { location.href = 'spectator.html'; };
layout(); showView(0);
if (/^\d{4}$/.test(params.get('room') || '')) connect(params.get('room'));
requestAnimationFrame(loop);
