// Google-Cardboard-style stereo renderer driven by a decoded viewer profile + physical phone metrics.
import * as THREE from 'three';

// Decoded from the QR on the Xiaomi Mi VR Play box: goo.gl/Cbrdp5 ->
// google.com/cardboard/cfg?p=CgZYaWFvbWkSCk1pIFZSIFBsYXkddEYUPSW28309KhAAAHBCAABwQgAAcEIAAHBCWAA12qz6PDoI7FG4PgrXI7xQAGAD
export const MI_VR_PLAY = {
  vendor: 'Xiaomi', model: 'Mi VR Play',
  screenToLens: 0.0362,          // m
  interLens: 0.062,              // m
  fov: [60, 60, 60, 60],         // left,right,bottom,top (deg) max per eye
  verticalAlignment: 'BOTTOM',
  trayToLens: 0.0306,            // m (lens centre height above the tray/bottom edge)
  k: [0.36, -0.01],              // radial distortion k1,k2
  button: 'INDIRECT_TOUCH',
};
// Physical screen metrics (landscape long x short, mm) and bottom bezel (mm)
export const PHONES = {
  nord: { name: 'OnePlus Nord (6.44", 2400x1080, 408 ppi)', long: 2400 / 408 * 25.4, short: 1080 / 408 * 25.4, bezel: 3.1 },
  s25u: { name: 'Samsung Galaxy S25 Ultra (6.9", 3120x1440, 498 ppi)', long: 3120 / 498 * 25.4, short: 1440 / 498 * 25.4, bezel: 2.1 },
  generic: { name: 'Generic phone (~160 CSS px/inch)', long: null, short: null, bezel: 3.0 },
};
export function detectPhone() {
  const ua = navigator.userAgent;
  if (/AC200[13]|OnePlus Nord\b|Nord Build/i.test(ua)) return 'nord';
  if (/SM-S938/i.test(ua)) return 's25u';
  return 'generic';
}

const distort = (r, k) => { const r2 = r * r; return r * (1 + k[0] * r2 + k[1] * r2 * r2); };

export class CardboardRenderer {
  constructor(renderer) {
    this.renderer = renderer; this.viewer = MI_VR_PLAY; this.phoneKey = detectPhone(); this.distortion = true; this.ipd = 0.063;
    this.scale = 1.0; // eye render-target scale
    this.ss = 1.4;   // supersampling factor vs native pixel density at the lens centre
    this.eye = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
    const opts = { type: THREE.HalfFloatType, samples: 4, depthBuffer: true };
    this.rt = [new THREE.WebGLRenderTarget(16, 16, opts), new THREE.WebGLRenderTarget(16, 16, opts)];
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, vpMM: { value: new THREE.Vector4() }, lensMM: { value: new THREE.Vector2() }, stl: { value: 36.2 },
        tan: { value: new THREE.Vector4() }, k: { value: new THREE.Vector2() }, fovTan: { value: new THREE.Vector4() }, pxMM: { value: 0.16 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `uniform sampler2D tex; uniform vec4 vpMM; uniform vec2 lensMM; uniform float stl; uniform vec4 tan; uniform vec2 k; uniform vec4 fovTan; uniform float pxMM;
        varying vec2 vUv;
        void main(){
          vec2 pmm = vpMM.xy + vUv*vpMM.zw;               // position on the physical screen (mm, origin bottom-left)
          vec2 s = (pmm - lensMM)/stl;                      // tan-angle on the screen as seen through the lens centre
          float r2 = dot(s,s);
          vec2 e = s*(1.0 + k.x*r2 + k.y*r2*r2);            // eye-space tan-angle after lens (Cardboard model)
          // tan = (left,right,bottom,top) extents of the eye texture
          vec2 uv = vec2((e.x + tan.x)/(tan.x+tan.y), (e.y + tan.z)/(tan.z+tan.w));
          // soft 1.5px edge so the rounded border is anti-aliased
          float aa = 1.5*pxMM/stl;
          float m = smoothstep(-tan.x, -tan.x+aa, e.x)*smoothstep(tan.y, tan.y-aa, e.x)*smoothstep(-tan.z, -tan.z+aa, e.y)*smoothstep(tan.w, tan.w-aa, e.y);
          vec3 c = texture2D(tex, clamp(uv,0.0,1.0)).rgb * m;
          gl_FragColor = vec4(c,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false, toneMapped: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.postScene = new THREE.Scene(); this.postScene.add(this.quad); this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.info = {};
  }
  // mm per CSS px from physical screen length and the screen's CSS size
  metrics(cssW, cssH) {
    const P = PHONES[this.phoneKey] || PHONES.generic;
    const longCss = Math.max(screen.width, screen.height) || Math.max(cssW, cssH);
    const mmPerCss = P.long ? P.long / longCss : 25.4 / 160;
    return { mmPerCss, bezel: P.bezel, W: cssW * mmPerCss, H: cssH * mmPerCss };
  }
  layout(cssW, cssH) {
    const v = this.viewer, m = this.metrics(cssW, cssH), k = this.distortion ? v.k : [0, 0];
    const stl = v.screenToLens * 1000, il = v.interLens * 1000;
    const lensY = Math.min(m.H, Math.max(0, v.trayToLens * 1000 - m.bezel));
    const lensXL = m.W / 2 - il / 2, lensXR = m.W / 2 + il / 2;
    const fovT = v.fov.map(d => Math.tan(d * Math.PI / 180));
    const ang = d => Math.min(distort(d / stl, k), 1e3);
    // left eye tan extents: left(outer), right(inner), bottom, top — clamped by viewer FOV
    const outer = Math.min(ang(lensXL), fovT[0]), inner = Math.min(ang(m.W / 2 - lensXL), fovT[1]);
    const bottom = Math.min(ang(lensY), fovT[2]), top = Math.min(ang(m.H - lensY), fovT[3]);
    this.info = { mmPerCss: m.mmPerCss, screenMM: [m.W, m.H], lensY, lensXL, lensXR, stl, il, tanL: [outer, inner, bottom, top], k,
      fovDeg: [outer, inner, bottom, top].map(t => Math.atan(t) * 180 / Math.PI) };
    return this.info;
  }
  setSize(cssW, cssH, pr) {
    const I = this.layout(cssW, cssH);
    // texture resolution ~ matches centre pixel density of the eye viewport
    const eyeCssW = cssW / 2, eyeCssH = cssH;
    const tw = I.tanL[0] + I.tanL[1], th = I.tanL[2] + I.tanL[3];
    const pxPerTan = I.stl / I.mmPerCss * pr * this.scale;
    // supersample the pre-distortion eye buffer (~1.4x native centre density) so the barrel warp doesn't soften/pixelate
    const maxS = Math.min(4096, this.renderer.capabilities.maxTextureSize);
    const w = Math.min(maxS, Math.round(tw * pxPerTan * this.ss)), h = Math.min(maxS, Math.round(th * pxPerTan * this.ss));
    this.rt.forEach(r => r.setSize(w, h)); this.rtSize = [w, h];
  }
  render(scene, head, cssW, cssH) {
    const r = this.renderer, I = this.info, near = 0.05, far = 200;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(head.quaternion);
    for (let e = 0; e < 2; e++) {
      const cam = this.eye[e], s = e === 0 ? -1 : 1;
      const [o, i, b, t] = I.tanL;
      const l = e === 0 ? o : i, rr = e === 0 ? i : o; // mirror for right eye
      cam.projectionMatrix.makePerspective(-near * l, near * rr, near * t, -near * b, near, far);
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      cam.position.copy(head.position).addScaledVector(right, s * this.ipd / 2);
      cam.quaternion.copy(head.quaternion); cam.updateMatrixWorld(true);
      r.setRenderTarget(this.rt[e]); r.clear(); r.render(scene, cam);
    }
    r.setRenderTarget(null);
    r.setScissorTest(true); r.setClearColor(0x000000, 1); r.clear();
    const half = cssW / 2, mm = I.mmPerCss;
    for (let e = 0; e < 2; e++) {
      const [o, i, b, t] = I.tanL;
      r.setViewport(e * half, 0, half, cssH); r.setScissor(e * half, 0, half, cssH);
      this.mat.uniforms.tex.value = this.rt[e].texture;
      this.mat.uniforms.vpMM.value.set(e * half * mm, 0, half * mm, cssH * mm);
      this.mat.uniforms.lensMM.value.set(e === 0 ? I.lensXL : I.lensXR, I.lensY);
      this.mat.uniforms.stl.value = I.stl; this.mat.uniforms.pxMM.value = mm;
      this.mat.uniforms.tan.value.set(e === 0 ? o : i, e === 0 ? i : o, b, t);
      this.mat.uniforms.k.value.set(I.k[0], I.k[1]);
      r.render(this.postScene, this.postCam);
    }
    r.setScissorTest(false); r.setViewport(0, 0, cssW, cssH);
  }
}
