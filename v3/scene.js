// Radical Architecture — Wedding Hall entrance foyer, procedural 3D model
// Dimensions from the plan DXF (inches): foyer 1038" x 240" = 26.37 m x 6.10 m; height 35'-0" = 10.67 m (double height).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

export const L = 26.37, W = 6.10, H = 10.67, HL = L / 2, HW = W / 2;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- textures
export function buildScene(renderer, manager) {
  const loader = new THREE.TextureLoader(manager);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (url, srgb = true, rep = true) => {
    const t = loader.load(url); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
  };
  const T = {
    cream: tex('tex2/marble_cream.jpg'), dark: tex('tex2/marble_dark.jpg'),
    floor: tex('tex2/floor.jpg', true, false), sculpt: tex('tex2/sculpture.jpg', true, false),
    door: tex('tex2/door_wood.jpg', true, false), outdoor: tex('tex2/outdoor4.jpg', true, false), banquet: tex('tex2/banquet4.jpg', true, false),
  };
   T.banquet.wrapS = THREE.MirroredRepeatWrapping;
  const glowTex = makeGlowTexture(), washTex = makeWashTexture(), aoTex = makeAOTexture(), blobTex = makeBlobTexture();

  // ---------------------------------------------------------------- materials
  const M = {
    cream: new THREE.MeshStandardMaterial({ map: T.cream, roughness: 0.22, metalness: 0, envMapIntensity: 0.9 }),
    creamMatte: new THREE.MeshStandardMaterial({ color: 0xded4c4, roughness: 0.85, metalness: 0 }),
    ceilingMaroon: new THREE.MeshStandardMaterial({ color: 0x4f141b, roughness: 0.8, metalness: 0 }),
    maroon: new THREE.MeshPhysicalMaterial({ color: 0x4f141b, roughness: 0.8, sheen: 0.6, sheenColor: 0xd89a9a, sheenRoughness: 0.5, metalness: 0, envMapIntensity: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ map: T.dark, roughness: 0.32, metalness: 0, envMapIntensity: 1.2 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xdcc497, roughness: 0.3, metalness: 1, envMapIntensity: 1.0 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd8c29c, roughness: 0.26, metalness: 1, side: THREE.DoubleSide }),
    bronzeDark: new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.45, metalness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ map: T.door, roughness: 0.45, metalness: 0, envMapIntensity: 0.8 }),
    woodPlain: new THREE.MeshStandardMaterial({ color: 0x4a2a17, roughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.035, envMapIntensity: 0.18, depthWrite: false }),
    frame: new THREE.MeshPhysicalMaterial({ color: 0xd4b276, roughness: 0.3, metalness: 1, anisotropy: 0.6, envMapIntensity: 1.0 }),
    glassSatin: new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.32, envMapIntensity: 0.3, depthWrite: false }),
    sculpt: new THREE.MeshStandardMaterial({ map: T.sculpt, bumpMap: T.sculpt, bumpScale: 4, roughness: 0.35, metalness: 0.25, emissive: 0xffffff, emissiveMap: T.sculpt, emissiveIntensity: 0.12 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.6, side: THREE.DoubleSide }),
    soil: new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 1 }),
    emissiveWarm: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.7).multiplyScalar(2.6) }),
    emissiveCove: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.88, 0.74).multiplyScalar(2.2) }),
    emissiveDown: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.93, 0.84).multiplyScalar(4.0) }),
    floor: new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.9, envMapIntensity: 0.35 }),
  };
  for (const [k, m] of Object.entries(M)) m.name = k;

  // ---------------------------------------------------------------- geometry buckets
  const buckets = new Map();
  const push = (mat, g) => { if (!buckets.has(mat)) buckets.set(mat, []); buckets.get(mat).push(g); };
  const rnd = mulberry(11);
  const obstacles = [];

  // wall frames: local u (right when facing the wall), v (up), w (out of the wall into the room)
  const frames = {
    N: frame([0, 0, -HW], [1, 0, 0], [0, 0, 1]),   // entrance (glass) wall
    S: frame([0, 0, HW], [-1, 0, 0], [0, 0, -1]),  // water-feature wall
    Wt: frame([-HL, 0, 0], [0, 0, -1], [1, 0, 0]), // west: lotus niche
    E: frame([HL, 0, 0], [0, 0, 1], [-1, 0, 0]),   // east: banquet doors
    World: new THREE.Matrix4(),
  };
  // box in a frame; uvScale (m per texture repeat) gives world-scaled UVs with random offset
  function box(F, mat, u, v, w, du, dv, dw, uvScale = 0, rot = null) {
    const g = new THREE.BoxGeometry(du, dv, dw);
    if (uvScale) worldUV(g, du, dv, dw, uvScale, rnd);
    const m = new THREE.Matrix4().makeTranslation(u, v, w);
    if (rot) m.multiply(rot);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, m));
    push(mat, g); return g;
  }
  function geo(F, mat, g, u, v, w, rot = null) {
    const m = new THREE.Matrix4().makeTranslation(u, v, w); if (rot) m.multiply(rot);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, m)); push(mat, g); return g;
  }
  const group = new THREE.Group(); group.name = 'hall';
  const extras = new THREE.Group(); // non-merged, animated or transparent things
  const lightsList = [];

  // ---------------------------------------------------------------- wall building blocks
  // marble cladding field: panels pw x ph with 14 mm gold reveals (proud 4 mm)
  function marbleField(F, u0, u1, v0, v1, pw = 1.3, ph = 1.8, w0 = 0) {
    const nU = Math.max(1, Math.round((u1 - u0) / pw)), nV = Math.max(1, Math.round((v1 - v0) / ph));
    const cw = (u1 - u0) / nU, ch = (v1 - v0) / nV, gap = 0.014;
    for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++)
      box(F, M.cream, u0 + (i + .5) * cw, v0 + (j + .5) * ch, w0 + 0.02, cw - gap, ch - gap, 0.04, 1.6);
    for (let i = 0; i <= nU; i++) box(F, M.gold, u0 + i * cw, (v0 + v1) / 2, w0 + 0.026, 0.012, v1 - v0, 0.04);
    for (let j = 0; j <= nV; j++) box(F, M.gold, (u0 + u1) / 2, v0 + j * ch, w0 + 0.026, u1 - u0, 0.012, 0.04);
  }
  // fluted maroon field with gold dividers every ~span
  function flutedField(F, u0, u1, v0, v1, span = 1.35, mat = M.maroon, w0 = 0) {
    const n = Math.max(1, Math.round((u1 - u0) / span)), cw = (u1 - u0) / n;
    box(F, M.bronzeDark, (u0 + u1) / 2, (v0 + v1) / 2, w0 + 0.005, u1 - u0, v1 - v0, 0.01);
    for (let i = 0; i < n; i++) geo(F, mat, flutedGeo(cw - 0.03, v1 - v0, 0.05, 0.016), u0 + i * cw + 0.015, v0, w0 + 0.012);
    for (let i = 0; i <= n; i++) box(F, M.gold, u0 + i * cw, (v0 + v1) / 2, w0 + 0.03, 0.03, v1 - v0, 0.04);
    box(F, M.gold, (u0 + u1) / 2, v1 + 0.02, w0 + 0.035, u1 - u0 + 0.03, 0.04, 0.07);
    box(F, M.gold, (u0 + u1) / 2, v0 + 0.06, w0 + 0.035, u1 - u0 + 0.03, 0.12, 0.07); // brass kick
  }
  // crown: the maroon/gold top band seen in every elevation (9.6 m -> ceiling)
  function crown(F, len) {
    box(F, M.creamMatte, 0, 9.47, 0.05, len, 0.26, 0.1);
    box(F, M.gold, 0, 9.62, 0.1, len, 0.04, 0.08);
    box(F, M.maroon, 0, 9.95, 0.07, len, 0.62, 0.06);
    box(F, M.gold, 0, 9.66, 0.11, len, 0.025, 0.04); box(F, M.gold, 0, 10.24, 0.11, len, 0.025, 0.04);
    box(F, M.creamMatte, 0, 10.3, 0.12, len, 0.1, 0.24);
  }
  const skirting = (F, u0, u1) => box(F, M.gold, (u0 + u1) / 2, 0.06, 0.03, u1 - u0, 0.12, 0.05);

  // sconce instances (brass cone shade projecting from wall)
  const sconces = []; // {F,u,v, size}
  const linearLights = [];
  const plants = [];
  const blobs = [];

  // ================================================================ NORTH: glass entrance wall (elevation 2c675ae8)
  {
    const F = frames.N, gx = 3.92;
    crown(F, L);
    // pilasters (marble) + fluted bays
    for (const s of [-1, 1]) {
      marbleField(F, s > 0 ? gx : -gx - 0.72, s > 0 ? gx + 0.72 : -gx, 0.12, 9.34, 0.72, 1.55);
      flutedField(F, s > 0 ? gx + 0.72 : -11.62, s > 0 ? 11.62 : -gx - 0.72, 0.0, 9.3, 1.38);
      marbleField(F, s > 0 ? 11.62 : -HL, s > 0 ? HL : -11.62, 0.12, 9.34, 0.78, 1.55);
      skirting(F, s > 0 ? gx : -HL, s > 0 ? HL : -gx);
      for (const v of [7.93, 3.3]) { sconces.push({ F, u: s * (gx + 0.36), v }); sconces.push({ F, u: s * 12.4, v }); }
      plants.push({ F, u: s * 4.55, w: 0.42, kind: 'spike', h: 1.35 });
    }
    // curtain wall (recessed 0.12 into wall thickness)
    const gw = -0.12, top = 9.34;
    const vx = [-gx, -2.98, -1.9, -1.55, 1.55, 1.9, 2.98, gx];
    box(F, M.glass, 0, top / 2, gw, 2 * gx, top, 0.02); // glass sheet (one merged pane)
    // slim architectural aluminium sections (~50 mm face x 120 mm depth), PVD finish
    for (const x of vx) box(F, M.frame, x, top / 2, gw + 0.05, 0.05, top, 0.12);
    for (const x of [-0.68, 0.68]) box(F, M.frame, x, (top + 3.42) / 2, gw + 0.05, 0.05, top - 3.42, 0.12);
    for (const y of [0.03, 3.42, 5.66, 7.66, top]) box(F, M.frame, 0, y, gw + 0.05, 2 * gx + 0.05, 0.05, 0.12);
    // door leaves (glass) with gold frames and tall pull handles
    for (const s of [-1, 1]) {
      const cx = s * 0.775;
      for (const x of [cx - 0.72, cx + 0.72]) box(F, M.frame, x, 1.71, gw + 0.06, 0.05, 3.38, 0.05);
      box(F, M.frame, cx, 3.38, gw + 0.06, 1.49, 0.05, 0.05); box(F, M.frame, cx, 0.08, gw + 0.06, 1.49, 0.1, 0.05);
      const hx = s * 0.12;
      box(F, M.frame, hx, 1.35, gw + 0.2, 0.03, 1.9, 0.03);
      for (const y of [0.45, 2.25]) box(F, M.frame, hx, y, gw + 0.14, 0.025, 0.025, 0.12);
    }
    // outdoor backdrop beyond the glass
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(34, 13), Object.assign(new THREE.MeshBasicMaterial({ map: T.outdoor, color: 0xffffff, toneMapped: false }), { name: 'backdrop_outdoor' }));
    
    bd.position.set(0, 5.9, -HW - 4.2); extras.add(bd); bd.scale.set(1, 1, 1);
    // ground outside
    const og = new THREE.Mesh(new THREE.PlaneGeometry(34, 4.3), Object.assign(new THREE.MeshBasicMaterial({ color: 0x8c8a84 }), { name: 'ground_out' }));
    og.rotation.x = -Math.PI / 2; og.position.set(0, -0.02, -HW - 2.1); og.material.color.set(0x8a8174); og.material.toneMapped = false; extras.add(og); // porch paving between glass and backdrop
  }

  // ================================================================ SOUTH: water cascade + reception + hall doors (elevation d1a91393)
  {
    const F = frames.S;
    crown(F, L);
    const doorX = 4.90, dw = 3.05, dh = 3.82, bayW = 3.35;
    for (const s of [-1, 1]) {
      // outer marble fields with gold mid band
      const o0 = s > 0 ? doorX + bayW / 2 : -HL, o1 = s > 0 ? HL : -doorX - bayW / 2;
      marbleField(F, o0, o1, 0.12, 3.9, 1.3, 1.9); marbleField(F, o0, o1, 3.94, 9.34, 1.3, 1.8);
      box(F, M.gold, (o0 + o1) / 2, 3.92, 0.035, o1 - o0, 0.04, 0.06);
      skirting(F, o0, o1);
      // door bay: fluted maroon above a recessed wooden double door
      const c = s * doorX;
      flutedField(F, c - bayW / 2, c + bayW / 2, dh + 0.12, 9.34, 1.1);
      box(F, M.cream, c - bayW / 2 + 0.07, dh / 2, 0.02, 0.14, dh + 0.1, 0.04, 1.6); box(F, M.cream, c + bayW / 2 - 0.07, dh / 2, 0.02, 0.14, dh + 0.1, 0.04, 1.6);
      doorway(F, c, dw, dh);
      // pilaster between door bay and cascade frame
      const p0 = s > 0 ? 2.12 : -(doorX - bayW / 2), p1 = s > 0 ? doorX - bayW / 2 : -2.12;
      marbleField(F, p0, p1, 0.12, 9.34, (p1 - p0), 1.55);
      skirting(F, p0, p1);
      linearLights.push({ F, u: s * 3.2, v: 5.35, h: 1.4 }, { F, u: s * 3.2, v: 2.1, h: 1.5 });
      // sconces per elevation rows
      for (const u of [7.3, 12.3]) sconces.push({ F, u: s * u, v: 7.97 });
      for (const u of [7.4, 9.7, 12.1]) sconces.push({ F, u: s * u, v: 3.46 });
      plants.push({ F, u: s * 6.95, w: 0.42, kind: 'palm', h: 1.5 }, { F, u: s * 2.95, w: 0.45, kind: 'palm', h: 1.3 });
    }
    cascade(F);
  }

  function doorway(F, c, dw, dh) {
    const rec = 0.2; // recess depth into wall
    // reveals (jambs + head) in dark marble, architrave in gold
    box(F, M.dark, c - dw / 2 - 0.02, dh / 2, -rec / 2, 0.04, dh, rec, 1.2);
    box(F, M.dark, c + dw / 2 + 0.02, dh / 2, -rec / 2, 0.04, dh, rec, 1.2);
    box(F, M.dark, c, dh + 0.02, -rec / 2, dw + 0.08, 0.04, rec, 1.2);
    box(F, M.gold, c - dw / 2 - 0.08, dh / 2 + 0.04, 0.03, 0.12, dh + 0.08, 0.07);
    box(F, M.gold, c + dw / 2 + 0.08, dh / 2 + 0.04, 0.03, 0.12, dh + 0.08, 0.07);
    box(F, M.gold, c, dh + 0.1, 0.03, dw + 0.28, 0.12, 0.07);
    // two leaves (door texture spans both), 55 mm thick
    const g = new THREE.BoxGeometry(dw - 0.02, dh - 0.02, 0.055);
    const uv = g.attributes.uv; // front face (+z) = indices 16..19 already 0..1
    geo(F, M.wood, g, c, dh / 2, -rec + 0.03);
    box(F, M.bronzeDark, c, dh / 2, -rec + 0.06, 0.012, dh - 0.04, 0.01); // meeting stile
    for (const s of [-1, 1]) { // long brass pulls
      const hx = c + s * 0.11;
      box(F, M.gold, hx, 1.55, -rec + 0.13, 0.035, 1.6, 0.035);
      for (const y of [0.8, 2.3]) box(F, M.gold, hx, y, -rec + 0.09, 0.025, 0.025, 0.09);
    }
    blobs.push({ F, u: c, w: 0.25, sx: dw + 0.6, sz: 0.7, a: 0.35 });
  }

  function cascade(F) {
    const fw = 4.2, ww = 3.1, rec = 0.45, top = 9.17, bot = 1.62;
    // marble frame around the recess
    marbleField(F, -fw / 2, -ww / 2, 0.12, 9.34, fw / 2 - ww / 2, 1.55);
    marbleField(F, ww / 2, fw / 2, 0.12, 9.34, fw / 2 - ww / 2, 1.55);
    box(F, M.cream, 0, (top + 9.34) / 2, 0.02, ww, 9.34 - top, 0.04, 1.6);
    // recess: dark stone back, reveals with gold edge
    box(F, M.dark, 0, (bot + top) / 2, -rec, ww, top - bot, 0.04, 2.2);
    box(F, M.dark, -ww / 2 - 0.01, (bot + top) / 2, -rec / 2, 0.02, top - bot, rec, 2);
    box(F, M.dark, ww / 2 + 0.01, (bot + top) / 2, -rec / 2, 0.02, top - bot, rec, 2);
    box(F, M.gold, -ww / 2 - 0.02, (bot + top) / 2, 0.02, 0.04, top - bot, 0.05); box(F, M.gold, ww / 2 + 0.02, (bot + top) / 2, 0.02, 0.04, top - bot, 0.05);
    box(F, M.dark, 0, top + 0.01, -rec / 2, ww + 0.04, 0.02, rec, 2);
    box(F, M.emissiveWarm, 0, top - 0.03, -rec + 0.08, ww - 0.1, 0.03, 0.06); // top light strip
    // basin: black granite trough the water falls into (rim at 1.62 m)
    box(F, M.dark, 0, bot / 2, -rec / 2 + 0.1, ww + 0.5, bot, rec + 0.2, 1.5);
    box(F, M.dark, 0, bot + 0.03, 0.12, ww + 0.6, 0.06, 0.34, 1.5);
    // water sheet (animated shader)
    const water = new THREE.Mesh(new THREE.PlaneGeometry(ww - 0.06, top - bot - 0.05, 1, 1), waterMaterial());
    water.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(0, (top + bot) / 2, -rec + 0.05)));
    water.renderOrder = 2; extras.add(water); extras.userData.water = water;
    // basin water surface (ripples) + rising mist at the impact line
    const basin = new THREE.Mesh(new THREE.PlaneGeometry(ww - 0.02, rec + 0.08), basinMaterial()); basin.name = 'basin_water'; basin.material.name = 'basin';
    basin.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(0, bot + 0.004, -rec / 2 + 0.06).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))));
    basin.renderOrder = 2; extras.add(basin); extras.userData.basin = basin;
    const mistT = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 40, 2, 32, 40, 30); r.addColorStop(0, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    const mistM = new THREE.MeshBasicMaterial({ map: mistT, color: 0x8f9396, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); mistM.name = 'fake_mist';
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(ww, 0.7), mistM);
    mist.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(0, bot + 0.25, -rec + 0.15)));
    mist.renderOrder = 3; extras.add(mist); extras.userData.mist = mist;
    // reception counter IN FRONT (solid volume): fluted gold front, black marble top, LED reveal
    const cw = 4.4, cd = 0.8, ch = 1.08, cz = 0.62 + cd / 2 + 0.25; // front face ~1.67 m off the wall
    box(F, M.woodPlain, 0, ch / 2, cz, cw - 0.06, ch - 0.1, cd - 0.06);
    geo(F, M.gold, flutedGeo(cw - 0.1, ch - 0.2, 0.045, 0.018), -(cw - 0.1) / 2, 0.1, cz + cd / 2 - 0.03);
    box(F, M.dark, 0, ch - 0.03, cz + 0.02, cw + 0.06, 0.06, cd + 0.1, 1.4);
    box(F, M.emissiveWarm, 0, ch - 0.075, cz + cd / 2 + 0.005, cw - 0.12, 0.015, 0.01);
    box(F, M.emissiveWarm, 0, 0.05, cz + cd / 2 - 0.02, cw - 0.12, 0.012, 0.01);
    box(F, M.bronzeDark, 0, 0.04, cz, cw - 0.1, 0.08, cd - 0.1);
    for (const s of [-1, 1]) box(F, M.gold, s * (cw / 2 - 0.03), ch / 2, cz, 0.06, ch - 0.06, cd);
    blobs.push({ F, u: 0, w: cz, sx: cw + 1.2, sz: cd + 1.0, a: 0.55 });
    blobs.push({ F, u: 0, w: 0.2, sx: ww + 1.4, sz: 0.8, a: 0.4 });
    obstacles.push(boxToWorld(F, 0, cz, cw + 0.8, cd + 0.9));
  }

  // ================================================================ WEST: lotus niche (elevation 443e2b85, exact scale 6.10 x 10.67)
  {
    const F = frames.Wt;
    const hw = HW;
    crown(F, W);
    // outer marble pilasters (full height) and tiled inner pilasters
    marbleField(F, -hw, -hw + 0.44, 0.12, 9.34, 0.44, 1.1); marbleField(F, hw - 0.44, hw, 0.12, 9.34, 0.44, 1.1);
    marbleField(F, -hw + 0.44, -2.27, 0.12, 9.3, 0.36, 0.42); marbleField(F, 2.27, hw - 0.44, 0.12, 9.3, 0.36, 0.42);
    marbleField(F, -2.27, 2.27, 9.3, 9.34 + 0.0, 4.54, 0.04);
    box(F, M.bronzeDark, 0, 9.55, 0.03, 4.7, 0.36, 0.06);
    // maroon surround panel from ledge to 9.26 m, projecting slightly
    { const pw = 2.83, pb = 2.33, pt = 8.33, e = 0.03;
      box(F, M.maroon, -(2.27 + pw / 2 + e) / 2, (2.28 + 9.26) / 2, 0.05, 2.27 - pw / 2 - e, 9.26 - 2.28, 0.1);
      box(F, M.maroon, (2.27 + pw / 2 + e) / 2, (2.28 + 9.26) / 2, 0.05, 2.27 - pw / 2 - e, 9.26 - 2.28, 0.1);
      box(F, M.maroon, 0, (pt + e + 9.26) / 2, 0.05, pw + 2 * e, 9.26 - pt - e, 0.1);
      box(F, M.maroon, 0, (2.28 + pb - e) / 2, 0.05, pw + 2 * e, pb - e - 2.28, 0.1); }
    box(F, M.gold, -2.27, (2.28 + 9.26) / 2, 0.1, 0.03, 9.26 - 2.28, 0.03); box(F, M.gold, 2.27, (2.28 + 9.26) / 2, 0.1, 0.03, 9.26 - 2.28, 0.03);
    // recessed sculpture panel 2.83 x 6.00 (8.33 -> 2.33 m), 0.16 deep, glowing reveal
    const pw = 2.83, pb = 2.33, pt = 8.33, rec = 0.16;
    const sp = new THREE.PlaneGeometry(pw, pt - pb);
    geo(F, M.sculpt, sp, 0, (pb + pt) / 2, 0.1 - rec);
    for (const s of [-1, 1]) {
      box(F, M.gold, s * (pw / 2 + 0.015), (pb + pt) / 2, 0.1 - rec / 2, 0.03, pt - pb + 0.06, rec);
      box(F, M.emissiveWarm, s * (pw / 2 + 0.04), (pb + pt) / 2, 0.1 - rec + 0.02, 0.02, pt - pb, 0.02);
    }
    box(F, M.gold, 0, pt + 0.015, 0.1 - rec / 2, pw + 0.06, 0.03, rec); box(F, M.emissiveWarm, 0, pt + 0.04, 0.1 - rec + 0.02, pw, 0.02, 0.02);
    box(F, M.gold, 0, pb - 0.015, 0.1 - rec / 2, pw + 0.06, 0.03, rec);
    // big brass sconces on the maroon
    sconces.push({ F, u: -2.04, v: 7.95, w0: 0.1, size: 1.35 }, { F, u: 2.04, v: 7.95, w0: 0.1, size: 1.35 });
    // LEDGE: projecting marble volume on the floor with under-ledge glow
    const lw = 4.8, d = 0.6;
    box(F, M.cream, 0, 1.03 / 2, d / 2 - 0.02, lw - 0.1, 1.03, d - 0.04, 1.2);           // marble base
    box(F, M.maroon, 0, (1.03 + 1.69) / 2, (d - 0.16) / 2, lw - 0.5, 0.66, d - 0.16);     // recessed maroon band
    box(F, M.emissiveWarm, 0, 1.06, d - 0.15, lw - 0.55, 0.025, 0.02);                      // glow line under ledge
    box(F, M.emissiveWarm, 0, 1.665, d - 0.15, lw - 0.55, 0.02, 0.02);
    box(F, M.cream, 0, (1.69 + 2.0) / 2, d / 2, lw - 0.3, 0.31, d, 1.2);                   // ledge body
    { const t = aoTex.clone(); t.center.set(0.5, 0.5); t.rotation = Math.PI; t.needsUpdate = true;
      const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.15).multiplyScalar(0.14), alphaMap: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      gm.name = 'fake_glow'; const gp = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.5, 0.64), gm);
      gp.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(0, 1.36, d - 0.155))); gp.renderOrder = 3; }
    box(F, M.cream, 0, 2.125, d / 2 + 0.03, lw, 0.25, d + 0.06, 1.2);                      // top slab
    box(F, M.gold, 0, 2.0, d + 0.005, lw - 0.3, 0.012, 0.012);
    blobs.push({ F, u: 0, w: d / 2, sx: lw + 1.0, sz: d + 0.9, a: 0.5 });
    obstacles.push(boxToWorld(F, 0, d / 2, lw + 0.8, d + 0.9));
    skirting(F, -hw, -2.4); skirting(F, 2.4, hw);
  }

  // ================================================================ EAST: glass banquet doors (elevation 33b8d891, exact scale)
  {
    const F = frames.E, hw = HW;
    crown(F, W);
    marbleField(F, -hw, -2.62, 0.12, 9.34, 0.43, 1.2); marbleField(F, 2.62, hw, 0.12, 9.34, 0.43, 1.2);
    skirting(F, -hw, -2.62); skirting(F, 2.62, hw);
    marbleField(F, -2.62, 2.62, 9.44, 9.34 + 0.0, 5.24, 0.1);
    box(F, M.cream, 0, 9.46, 0.02, 5.24, 0.24, 0.04, 1.6);
    box(F, M.woodPlain, 0, 9.1, 0.03, 4.6, 0.36, 0.05); box(F, M.gold, 0, 8.9, 0.06, 4.7, 0.03, 0.03);
    const gw = -0.1, top = 8.8, dh = 5.0;
    box(F, M.glass, 0, top / 2, gw, 5.24, top, 0.02);
    for (const x of [-2.62, -1.53, 1.53, 2.62]) box(F, M.frame, x, top / 2, gw + 0.05, 0.05, top, 0.12);
    box(F, M.frame, 0, (top + dh) / 2, gw + 0.05, 0.05, top - dh, 0.12);
    for (const y of [0.03, dh + 0.04, 7.2, top]) box(F, M.frame, 0, y, gw + 0.05, 5.29, 0.05, 0.12);
    for (const s of [-1, 1]) {
      const cx = s * 0.765;
      for (const x of [cx - 0.72, cx + 0.72]) box(F, M.frame, x, dh / 2, gw + 0.07, 0.05, dh, 0.05);
      box(F, M.frame, cx, dh - 0.025, gw + 0.07, 1.49, 0.05, 0.05); box(F, M.frame, cx, 0.08, gw + 0.07, 1.49, 0.1, 0.05);
      const hx = s * 0.1;
      box(F, M.frame, hx, 1.9, gw + 0.2, 0.03, 2.4, 0.03);
      for (const y of [0.8, 3.0]) box(F, M.frame, hx, y, gw + 0.14, 0.025, 0.025, 0.12);
      linearLights.push({ F, u: s * 2.86, v: 4.55, h: 1.0 });
    }
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(16, 10.2), Object.assign(new THREE.MeshBasicMaterial({ map: T.banquet, color: 0xffffff, toneMapped: false }), { name: 'backdrop_banquet' }));
    T.banquet.repeat.set(1, 1); T.banquet.offset.set(0, 0); // v3: Cycles render of the modelled dining hall, projected from the banquet viewpoint
    bd.rotation.y = -Math.PI / 2; bd.position.set(HL + 4.5, 4.6, 0); extras.add(bd);
    const bf = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 16), Object.assign(new THREE.MeshBasicMaterial({ color: 0x6a5642 }), { name: 'ground_banquet' }));
    bf.rotation.x = -Math.PI / 2; bf.position.set(HL + 2.25, -0.02, 0); bf.material.color.set(0xb09c80); bf.material.toneMapped = false; extras.add(bf);
  }

  // ================================================================ CEILING (per ceiling plan 824f82c4): bulkhead + stepped coffers + coves
  const downlights = [];
  {
    const F = frames.World;
    const b = 0.7, hb = 10.1, h1 = 10.35, h2 = 10.52, h3 = H;
    // perimeter bulkhead (underside maroon band with downlights) — four boxes
    const ring = (x0, x1, z0, z1, y0, y1, mat) => box(F, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
    ring(-HL + 0.25, HL - 0.25, -HW + 0.28, -HW + 0.52, hb - 0.01, hb, M.ceilingMaroon); ring(-HL + 0.25, HL - 0.25, HW - 0.52, HW - 0.28, hb - 0.01, hb, M.ceilingMaroon);
    ring(-HL + 0.28, -HL + 0.52, -HW + 0.52, HW - 0.52, hb - 0.01, hb, M.ceilingMaroon); ring(HL - 0.52, HL - 0.28, -HW + 0.52, HW - 0.52, hb - 0.01, hb, M.ceilingMaroon);
    // cove strip on top inner edge of bulkhead
    for (let x = -HL + 1.2; x <= HL - 1.1; x += 1.45) { downlights.push([x, hb - 0.012, -HW + 0.4], [x, hb - 0.012, HW - 0.4]); }
    for (const z of [-1.2, 0, 1.2]) { downlights.push([-HL + 0.4, hb - 0.012, z], [HL - 0.4, hb - 0.012, z]); }
    // ---- v3 CONTEMPORARY FLOWING CEILING (hall design family): layered petal/lens trays with warm coves,
    //      dark maroon recessed medallions with gold star mandalas, twinkle downlights.
    const hf = hb; // main soffit level (flush with bulkhead underside)
    const lens = (a, bw, n = 72) => { // pointed ogee petal, long axis x; returns [x,z] ring (CCW)
      const pts = [];
      for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, u = Math.cos(t), s = Math.sin(t) >= 0 ? 1 : -1, k = 1 - u * u;
        pts.push([a * u, s * bw * k * (1 + 0.55 * k) / 1.55]); }
      return pts;
    };
    const toShape = (pts, dx = 0, dz = 0, rot = false) => { const sh = new THREE.Shape(); pts.forEach(([x, z], i) => { const X = rot ? z : x, Z = rot ? x : z; i ? sh.lineTo(X + dx, Z + dz) : sh.moveTo(X + dx, Z + dz); }); sh.closePath(); return sh; };
    const toPath = (pts, dx = 0, dz = 0, rot = false) => { const p = new THREE.Path(); pts.slice().reverse().forEach(([x, z], i) => { const X = rot ? z : x, Z = rot ? x : z; i ? p.lineTo(X + dx, Z + dz) : p.moveTo(X + dx, Z + dz); }); p.closePath(); return p; };
    // horizontal soffit (faces down) at height y
    const soffit = (shape, y, mat) => { const g = new THREE.ShapeGeometry(shape, 6); g.rotateX(Math.PI / 2); geo(F, mat, g, 0, y, 0); };
    // vertical riser along a closed outline (both faces)
    const riser = (pts, dx, dz, y0, y1, mat, rot = false) => {
      const pos = [], nor = [], uv = [], idx = []; const n = pts.length;
      const P = pts.map(([x, z]) => rot ? [z + dx, x + dz] : [x + dx, z + dz]);
      for (let i = 0; i <= n; i++) { const [x, z] = P[i % n], [xa, za] = P[(i + 1) % n], [xb, zb] = P[(i - 1 + n) % n];
        let nx = -(za - zb), nz = xa - xb; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        pos.push(x, y0, z, x, y1, z); nor.push(nx, 0, nz, nx, 0, nz); uv.push(i / n, 0, i / n, 1); }
      for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); push(mat, g);
    };
    const star = (r, pts8 = 8, inner = 0.42) => { const sh = new THREE.Shape(); for (let i = 0; i < pts8 * 2; i++) { const a = i / (pts8 * 2) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * inner : r; i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } sh.closePath(); return sh; };
    const disc = (r, y, mat, cx0, cz0, seg = 64) => { const g = new THREE.CircleGeometry(r, seg); g.rotateX(Math.PI / 2); geo(F, mat, g, cx0, y, cz0); };
    const flat = (shape, y, mat, cx0, cz0, rotY = 0) => { const g = new THREE.ShapeGeometry(shape, 4); g.rotateX(Math.PI / 2); if (rotY) g.rotateY(rotY); geo(F, mat, g, cx0, y, cz0); };
    const mandala = (cx0, cz0, y, r) => { // maroon disc + gold 8-point star + 16-point halo + ring
      disc(r, y, M.ceilingMaroon, cx0, cz0);
      flat(star(r * 0.86, 16, 0.78), y - 0.004, M.gold, cx0, cz0, Math.PI / 16);
      disc(r * 0.72, y - 0.006, M.ceilingMaroon, cx0, cz0);
      flat(star(r * 0.66, 8, 0.4), y - 0.009, M.gold, cx0, cz0);
      flat(star(r * 0.5, 8, 0.4), y - 0.011, M.gold, cx0, cz0, Math.PI / 8);
      disc(r * 0.16, y - 0.013, M.ceilingMaroon, cx0, cz0, 24);
      const t = new THREE.TorusGeometry(r, 0.018, 6, 72); t.rotateX(Math.PI / 2); geo(F, M.gold, t, cx0, y - 0.01, cz0);
    };
    const cx = [-8.23, 0, 8.23];
    const T1 = [3.72, 2.3], T2 = [3.0, 1.78], T3 = [2.2, 1.28];    // tier half-sizes (a, b)
    const y1 = hf, y2 = hf + 0.2, y3 = hf + 0.38, y4 = H;
    // main soffit with three large petal openings and six small cross-petals
    const fx0 = -HL + 0.02, fx1 = HL - 0.02, fz0 = -HW + 0.02, fz1 = HW - 0.02;
    const main = new THREE.Shape(); main.moveTo(fx0, fz0); main.lineTo(fx1, fz0); main.lineTo(fx1, fz1); main.lineTo(fx0, fz1); main.closePath();
    const small = [-4.115, 4.115, -12.35, 12.35].filter(x => Math.abs(x) < HL - 0.5);
    for (const c0 of cx) main.holes.push(toPath(lens(T1[0], T1[1]), c0, 0));
    for (const x of small) main.holes.push(toPath(lens(1.25, 0.34), x, 0, true));
    soffit(main, y1, M.creamMatte);
    for (const c0 of cx) {
      // tier 1 riser + cove glow at its top edge
      riser(lens(T1[0], T1[1]), c0, 0, y1, y2, M.creamMatte);
      riser(lens(T1[0] - 0.012, T1[1] - 0.012), c0, 0, y2 - 0.035, y2 - 0.004, M.emissiveCove);
      const s2 = toShape(lens(T1[0], T1[1]), c0, 0); s2.holes.push(toPath(lens(T2[0], T2[1]), c0, 0)); soffit(s2, y2, M.creamMatte);
      // maroon inlay band on tier-2 soffit with gold pin lines
      const band = toShape(lens(T1[0] - 0.14, T1[1] - 0.1), c0, 0); band.holes.push(toPath(lens(T1[0] - 0.3, T1[1] - 0.2), c0, 0)); soffit(band, y2 - 0.003, M.ceilingMaroon);
      riser(lens(T2[0], T2[1]), c0, 0, y2, y3, M.creamMatte);
      riser(lens(T2[0] - 0.012, T2[1] - 0.012), c0, 0, y3 - 0.035, y3 - 0.004, M.emissiveCove);
      const s3 = toShape(lens(T2[0], T2[1]), c0, 0); s3.holes.push(toPath(lens(T3[0], T3[1]), c0, 0)); soffit(s3, y3, M.creamMatte);
      riser(lens(T3[0], T3[1]), c0, 0, y3, y4, M.creamMatte);
      riser(lens(T3[0] - 0.012, T3[1] - 0.012), c0, 0, y4 - 0.035, y4 - 0.004, M.emissiveCove);
      soffit(toShape(lens(T3[0], T3[1]), c0, 0), y4, M.creamMatte);
      mandala(c0, 0, y4 - 0.004, 1.02);
      // twinkle downlights following the petal outline on the main soffit
      const ring = lens(T1[0] + 0.32, T1[1] + 0.3, 20); for (const [x, z] of ring) if (Math.abs(z) < HW - 0.45) downlights.push([x + c0, y1 - 0.012, z]);
    }
    for (const x of small) {
      riser(lens(1.25, 0.34), x, 0, y1, y1 + 0.18, M.creamMatte, true);
      riser(lens(1.24, 0.33), x, 0, y1 + 0.145, y1 + 0.176, M.emissiveCove, true);
      soffit(toShape(lens(1.25, 0.34), x, 0, true), y1 + 0.18, M.ceilingMaroon);
      flat(star(0.24, 8, 0.42), y1 + 0.175, M.gold, x, 0);
    }
    // top slab closing the void above the soffit (not visible, keeps renders light-tight)
    ring(-HL, HL, -HW, HW, H + 0.02, H + 0.05, M.creamMatte);
  }

  // ================================================================ floor + perimeter AO
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = 1; floor.name = 'floor';
  const aoMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: aoTex, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const decals = new THREE.Group();
  {
    const strip = (len, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), aoMat); m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, 0.004, z); decals.add(m); };
    // v3: fake floor AO strips removed
    // vertical corner darkening on walls
    const vstrip = (x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, H), aoMat); m.position.set(x, H / 2, z); m.rotation.set(0, ry, Math.PI / 2 * 0); decals.add(m); };
  }
  // ================================================================ instanced fixtures: sconces, linear lights, downlights, plants
  const inst = [];
  {
    const n = sconces.length;
    // v3: contemporary up/down cylinder wall light in brushed PVD gold (replaces the brass cone sconces)
    const shadeG = new THREE.CylinderGeometry(0.058, 0.058, 0.36, 32, 1, true);
    const innerG = new THREE.CircleGeometry(0.05, 24); innerG.rotateX(Math.PI / 2);   // down-light lens (faces down)
    const capG = new THREE.CircleGeometry(0.05, 24); capG.rotateX(-Math.PI / 2);      // up-light lens (faces up)
    const plateG = new THREE.BoxGeometry(0.07, 0.16, 0.012);
    const armG = new THREE.BoxGeometry(0.03, 0.05, 1);
    const shade = new THREE.InstancedMesh(shadeG, M.frame, n), inner = new THREE.InstancedMesh(innerG, M.emissiveWarm, n);
    const cap = new THREE.InstancedMesh(capG, M.emissiveWarm, n), plate = new THREE.InstancedMesh(plateG, M.frame, n), arm = new THREE.InstancedMesh(armG, M.frame, n);
    const washMat = new THREE.MeshBasicMaterial({ map: washTex, color: new THREE.Color(1, 0.86, 0.7).multiplyScalar(0.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    washMat.name = 'fake_wash';
    const wash = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 2.6), washMat, n);
    const mm = new THREE.Matrix4(), s3 = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3();
    sconces.forEach((s, i) => {
      const size = s.size || 1, w0 = s.w0 || 0.04, out = 0.26 * size;
      const place = (mesh, u, v, w, sx = 1, sy = 1, sz = 1) => {
        mm.makeTranslation(u, v, w).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
        mesh.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(s.F, mm));
      };
      const o2 = 0.13 * size;
      place(shade, s.u, s.v, w0 + o2, size, size, size);
      place(inner, s.u, s.v - 0.175 * size, w0 + o2, size, size, size);
      place(cap, s.u, s.v + 0.175 * size, w0 + o2, size, size, size);
      place(plate, s.u, s.v, w0 + 0.006, size, size, 1);
      place(arm, s.u, s.v, w0 + o2 / 2, size, size, o2);
      place(wash, s.u, s.v, w0 + 0.012, size * 0.9, size * 1.5, 1);
    });
    for (const m of [shade, inner, cap, plate, arm, wash]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.frustumCulled = false; inst.push(m); }
    wash.renderOrder = 3;
    // linear vertical lights
    const ll = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 1, 0.06), M.emissiveWarm, linearLights.length);
    const llb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1, 0.05), M.gold, linearLights.length);
    const llw = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 1), washMat, linearLights.length);
    linearLights.forEach((l, i) => {
      ll.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(l.F, new THREE.Matrix4().makeTranslation(l.u, l.v, 0.1).scale(new THREE.Vector3(1, l.h, 1))));
      llb.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(l.F, new THREE.Matrix4().makeTranslation(l.u, l.v, 0.06).scale(new THREE.Vector3(1, l.h + 0.08, 1))));
      llw.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(l.F, new THREE.Matrix4().makeTranslation(l.u, l.v, 0.045).scale(new THREE.Vector3(1, l.h * 1.9, 1))));
    });
    for (const m of [ll, llb, llw]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; inst.push(m); }
    llw.renderOrder = 3;
    // recessed downlights
    const dl = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 16).rotateX(Math.PI / 2), M.emissiveDown, downlights.length);
    const dlr = new THREE.InstancedMesh(new THREE.RingGeometry(0.05, 0.07, 16).rotateX(Math.PI / 2), M.gold, downlights.length);
    downlights.forEach((d, i) => { dl.setMatrixAt(i, new THREE.Matrix4().makeTranslation(d[0], d[1] - 0.001, d[2])); dlr.setMatrixAt(i, new THREE.Matrix4().makeTranslation(d[0], d[1] - 0.0005, d[2])); });
    for (const m of [dl, dlr]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; inst.push(m); }
    // plants
    buildPlants(plants, inst, M, blobs);
  }
  // light pools on the floor (additive) under chandeliers + sconces, and shadow bands high on walls
  {
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1, 0.7, 0.4).multiplyScalar(0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    // v3: fake light pools removed
    const topMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: aoTex, transparent: true, opacity: 0.45, depthWrite: false });
    const band = (F, len) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2), topMat); m.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(0, 8.3, 0.2).multiply(new THREE.Matrix4().makeRotationZ(Math.PI)))); m.renderOrder = 3; decals.add(m); };
    // v3: fake dark wall band removed (caused the black band at ~8 m)
    const cm = [1, -1].map(s => { const t = aoTex.clone(); t.center.set(0.5, 0.5); t.rotation = s * Math.PI / 2; t.needsUpdate = true;
      return new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: 0.4, depthWrite: false }); });
    const corner = (F, u, flip) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, H), cm[flip ? 0 : 1]);
      m.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(u, H / 2, 0.21))); m.renderOrder = 3; decals.add(m); };
    // v3: fake corner AO removed
  }
  // blobs (contact shadows)
  for (const b of blobs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.sx, b.sz), blobMat.clone()); m.material.opacity = b.a;
    m.applyMatrix4(new THREE.Matrix4().multiplyMatrices(b.F, new THREE.Matrix4().makeTranslation(b.u, 0.006, b.w).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))));
    decals.add(m);
  }

  // ================================================================ chandeliers
  const chand = buildChandeliers([-8.23, 0, 8.23], M, glowTex, extras, lightsList);

  // ---------------------------------------------------------------- merge
  for (const [mat, list] of buckets) {
    const g = mergeGeometries(list.map(x => x.index ? x : x), false);
    const mesh = new THREE.Mesh(g, mat); mesh.matrixAutoUpdate = false; group.add(mesh);
  }
  for (const m of inst) group.add(m);
  group.add(chand);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0xfff4ea, 0x6a5a4a, 0.25);
  const lights = new THREE.Group(); lights.add(hemi);
  for (const x of [-8.23, 0, 8.23]) { const p = new THREE.PointLight(0xffe2c4, 26, 0, 1.6); p.position.set(x, 7.2, 0); lights.add(p); }
  const pn = new THREE.PointLight(0xffdcb8, 10, 0, 1.8); pn.position.set(-HL + 1.2, 5.5, 0); lights.add(pn);
  const pe = new THREE.PointLight(0xffe4c8, 8, 0, 1.8); pe.position.set(HL - 1.5, 4.5, 0); lights.add(pe);
  const pc = new THREE.PointLight(0xffdcb8, 5, 0, 1.8); pc.position.set(0, 3.2, 0.8); lights.add(pc);

  // mirrored copy for the polished-floor reflection (floor is drawn semi-transparent over it)
  const mirror = new THREE.Group(); mirror.name = 'mirror';
  mirror.scale.y = -1;
  mirror.add(group.clone(), extras.clone());
  mirror.traverse(o => { if (o.userData.glow) o.visible = true; });
  // v3: no mirrored copies of the exterior/dining backdrops in the floor (caused doubled 'ghost' images below the glass)
  mirror.traverse(o => { if (o.material && /^backdrop|^ground_/.test(o.material.name || '')) o.visible = false; });

  const lightSpots = {
    sconces: sconces.map(s => { const size = s.size || 1, w0 = s.w0 || 0.04; const p = new THREE.Vector3(s.u, s.v, w0 + 0.13 * size).applyMatrix4(s.F); return [p.x, p.y, p.z, size]; }),
    linear: linearLights.map(l => { const p = new THREE.Vector3(l.u, l.v, 0.16).applyMatrix4(l.F); const n = new THREE.Vector3(0, 0, 1).transformDirection(l.F); return [p.x, p.y, p.z, l.h, n.x, n.z]; }),
    downlights, chandeliers: [-8.23, 0, 8.23],
  };
  return { group, extras, floor, decals, lights, mirror, obstacles, M, T, water: extras.userData.water, basin: extras.userData.basin, mist: extras.userData.mist, chand, lightSpots };

  // ---------------------------------------------------------------- helpers bound to this build
  function boxToWorld(F, u, w, du, dw) { // footprint rectangle in world XZ (axis-aligned since walls are)
    const c = new THREE.Vector3(u, 0, w).applyMatrix4(F); const a = new THREE.Vector3(du, 0, dw).transformDirection(F).multiplyScalar(Math.hypot(du, dw));
    const ex = new THREE.Vector3(1, 0, 0).applyMatrix4(new THREE.Matrix4().extractRotation(F));
    const hx = Math.abs(ex.x) > 0.5 ? du / 2 : dw / 2, hz = Math.abs(ex.x) > 0.5 ? dw / 2 : du / 2;
    return { x0: c.x - hx, x1: c.x + hx, z0: c.z - hz, z1: c.z + hz };
  }
}

// ======================================================================== geometry helpers
function frame(o, r, n) {
  const R = new THREE.Vector3(...r), N = new THREE.Vector3(...n), U = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().makeBasis(R, U, N); m.setPosition(...o); return m;
}
function worldUV(g, du, dv, dw, s, rnd) {
  const uv = g.attributes.uv; const dims = [[dw, dv], [dw, dv], [du, dw], [du, dw], [du, dv], [du, dv]];
  for (let f = 0; f < 6; f++) {
    const ou = rnd() * 4, ov = rnd() * 4;
    for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, ou + uv.getX(i) * dims[f][0] / s, ov + uv.getY(i) * dims[f][1] / s); }
  }
}
export function flutedGeo(width, height, pitch, depth) {
  const n = Math.max(1, Math.round(width / pitch)), seg = 6, pw = width / n;
  const pos = [], nor = [], uv = [], idx = [];
  const cols = n * seg + 1;
  for (let i = 0; i < cols; i++) {
    const t = (i % seg) / seg + (i === cols - 1 ? 1 : 0), rib = Math.floor(i / seg);
    const tt = i === cols - 1 ? 1 : (i % seg) / seg;
    const u = (i / seg) * pw; const a = Math.PI * tt;
    const w = depth * Math.sin(a); const dw = depth * Math.PI / pw * Math.cos(a);
    const nx = -dw, nz = 1, nl = Math.hypot(nx, nz);
    for (let j = 0; j < 2; j++) { pos.push(u, j * height, w); nor.push(nx / nl, 0, nz / nl); uv.push(u / width, j); }
  }
  for (let i = 0; i < cols - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function makeGlowTexture() { return canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); }
function makeWashTexture() { return canvasTex(128, 512, (g, w, h) => {
  // up/down grazing beams from a cylinder wall light (centre of texture = fitting)
  g.globalCompositeOperation = 'lighter';
  for (const dir of [-1, 1]) for (let y = 0; y < h / 2; y++) {
    const t = y / (h / 2), spread = 6 + t * 40, a = Math.pow(1 - t, 1.6) * 0.9;
    const cy = h / 2 + dir * (y + 8);
    const r = g.createLinearGradient(w / 2 - spread, 0, w / 2 + spread, 0);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, `rgba(255,255,255,${a})`); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, cy, w, 1);
  }
}); }
function makeAOTexture() { const t = canvasTex(4, 64, (g, w, h) => { const r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.6, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); t.colorSpace = THREE.NoColorSpace; return t; }
function makeBlobTexture() { const t = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); t.colorSpace = THREE.NoColorSpace; return t; }

// ------------------------------------------------------------------ water shader
function waterMaterial() {
  // v3: falling water sheet — three streak layers at different speeds/scales, sheet shimmer, accelerating flow,
  // specular sparkle from the top light strip, turbulent splash zone at the basin.
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float time; varying vec2 vUv;
      float h(float n){ return fract(sin(n)*43758.5453); }
      float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n1(float x){ float i=floor(x), f=fract(x); return mix(h(i),h(i+1.0),f*f*(3.0-2.0*f)); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
      float layer(vec2 uv, float cols, float speed, float scale, float seed){
        float c=floor(uv.x*cols), fx=fract(uv.x*cols); float sp=speed*(0.7+h(c+seed)*0.6);
        float fall = 1.0-uv.y; float y = (fall*fall*0.6+fall)*scale - time*sp + h(c*1.7+seed)*40.0;   // accelerating fall
        float s = pow(n1(y)*n1(y*0.31+c), 2.0);
        return s*smoothstep(0.5,0.05,abs(fx-0.5));
      }
      void main(){
        vec2 uv=vUv; uv.x += (n2(vec2(uv.y*6.0 - time*1.3, 3.0))-0.5)*0.004;
        float s = layer(uv, 120.0, 2.2, 10.0, 1.0)*0.9 + layer(uv, 260.0, 3.1, 16.0, 7.0)*0.6 + layer(uv, 55.0, 1.5, 6.0, 13.0)*0.45;
        float sheet = 0.10 + 0.08*n2(vec2(uv.x*18.0, (1.0-uv.y)*5.0 + time*2.6));                 // thin continuous film
        float spark = step(0.996, h2(floor(vec2(uv.x*420.0, uv.y*900.0 + time*260.0)))) * (0.4+0.6*uv.y);
        float topGlow = smoothstep(0.82,1.0,uv.y)*0.55;
        float splash = smoothstep(0.1,0.0,uv.y)*(0.35+0.45*n2(vec2(uv.x*30.0, uv.y*40.0 - time*6.0)));
        float edge = smoothstep(0.0,0.02,uv.x)*smoothstep(1.0,0.98,uv.x);
        vec3 wcol = vec3(0.93,0.97,1.0);
        vec3 col = wcol*(s*(0.35+0.75*uv.y) + sheet*0.5) + vec3(1.0,0.9,0.78)*(topGlow*(0.35+s) + spark*1.6) + wcol*splash;
        gl_FragColor = vec4(col*edge, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
function basinMaterial() {
  // rippling basin surface: moving interference highlights where the sheet lands
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float time; varying vec2 vUv;
      float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
      void main(){
        float d = vUv.y; // 0 = back (impact line), 1 = front rim
        float w = sin(d*70.0 - time*7.0 + n2(vec2(vUv.x*12.0, time*0.8))*6.0)*0.5+0.5;
        float r = pow(w, 8.0)*(1.0-d)*0.55 + pow(n2(vec2(vUv.x*40.0, d*20.0 - time*3.0)), 6.0)*0.5;
        float foam = smoothstep(0.25,0.0,d)*(0.25+0.35*n2(vec2(vUv.x*60.0, time*4.0)));
        vec3 col = vec3(0.92,0.96,1.0)*(r+foam);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
// ------------------------------------------------------------------ plants
function buildPlants(list, inst, M, blobs) {
  const potG = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0.2, 0.05), new THREE.Vector2(0.22, 0.62), new THREE.Vector2(0.235, 0.66), new THREE.Vector2(0.2, 0.66), new THREE.Vector2(0.2, 0.6), new THREE.Vector2(0, 0.6)], 32);
  // leaf: tapered, curved blade
  const leafG = (() => {
    const seg = 8, pos = [], idx = [], uv = [];
    for (let i = 0; i <= seg; i++) { const t = i / seg, wdt = 0.045 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)) + 0.004; const bend = 0.18 * t * t;
      pos.push(-wdt, t, bend, wdt, t, bend); uv.push(0, t, 1, t); }
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  })();
  const perPlant = 34; const rnd = mulberry(99);
  const pots = new THREE.InstancedMesh(potG, M.gold, list.length);
  const soil = new THREE.InstancedMesh(new THREE.CircleGeometry(0.2, 16).rotateX(-Math.PI / 2), M.soil, list.length);
  const leaves = new THREE.InstancedMesh(leafG, M.leaf, list.length * perPlant);
  const col = new THREE.Color();
  let k = 0;
  list.forEach((p, i) => {
    const base = new THREE.Vector3(p.u, 0, p.w).applyMatrix4(p.F);
    pots.setMatrixAt(i, new THREE.Matrix4().makeTranslation(base.x, 0, base.z));
    soil.setMatrixAt(i, new THREE.Matrix4().makeTranslation(base.x, 0.61, base.z));
    for (let j = 0; j < perPlant; j++) {
      const a = rnd() * Math.PI * 2, tilt = (p.kind === 'spike' ? 0.12 : 0.35) + rnd() * (p.kind === 'spike' ? 0.25 : 0.55);
      const len = p.h * (0.55 + rnd() * 0.5) * (p.kind === 'spike' ? 1 : 0.9);
      const m = new THREE.Matrix4().makeTranslation(base.x + Math.cos(a) * 0.05, 0.6, base.z + Math.sin(a) * 0.05)
        .multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeRotationX(tilt))
        .multiply(new THREE.Matrix4().makeScale(p.kind === 'spike' ? 1.0 : 1.9, len, 1));
      leaves.setMatrixAt(k, m); leaves.setColorAt(k, col.setHSL(0.27 + rnd() * 0.06, 0.45, 0.2 + rnd() * 0.12)); k++;
    }
    blobs.push({ F: p.F, u: p.u, w: p.w, sx: 0.9, sz: 0.9, a: 0.55 });
  });
  for (const m of [pots, soil, leaves]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; inst.push(m); }
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
}

// ------------------------------------------------------------------ chandeliers: tiered crystal
function buildChandeliers(xs, M, glowTex, extras, lightsList) {
  const g = new THREE.Group(); g.name = 'chandeliers';
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.0, roughness: 0.04, envMapIntensity: 2.0, emissive: 0xfff0e0, emissiveIntensity: 0.5, flatShading: true });
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.78).multiplyScalar(5) });
  const bead = new THREE.OctahedronGeometry(0.03); bead.scale(1, 1.4, 1);
  const drop = new THREE.OctahedronGeometry(0.06); drop.scale(1, 2.2, 1);
  const tiers = [ // radius, y (top of strands), strands, beads
    { r: 0.98, y: 8.75, n: 84, b: 8 }, { r: 0.8, y: 8.22, n: 70, b: 8 }, { r: 0.6, y: 7.72, n: 54, b: 7 }, { r: 0.4, y: 7.28, n: 38, b: 6 }, { r: 0.2, y: 6.92, n: 20, b: 5 }];
  let nb = 0, nd = 0; for (const t of tiers) { nb += t.n * t.b; nd += t.n; }
  const beads = new THREE.InstancedMesh(bead, crystalMat, nb * xs.length), drops = new THREE.InstancedMesh(drop, crystalMat, nd * xs.length);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 8, 6), bulbMat, 24 * xs.length);
  let bi = 0, di = 0, ui = 0; const m = new THREE.Matrix4(), col = new THREE.Color();
  const frameParts = [];
  for (const x of xs) {
    // rod + canopy + gold hoops
    const rod = new THREE.CylinderGeometry(0.025, 0.025, H - 8.8, 8); rod.translate(x, (H + 8.8) / 2, 0); frameParts.push(rod);
    const can = new THREE.CylinderGeometry(0.22, 0.28, 0.12, 24); can.translate(x, H - 0.06, 0); frameParts.push(can);
    for (const t of tiers) { const hoop = new THREE.TorusGeometry(t.r, 0.016, 6, 64); hoop.rotateX(Math.PI / 2); hoop.translate(x, t.y, 0); frameParts.push(hoop); }
    const crown = new THREE.TorusGeometry(0.97, 0.03, 8, 64); crown.rotateX(Math.PI / 2); crown.translate(x, 8.8, 0); frameParts.push(crown);
    for (let k = 0; k < 8; k++) { // spokes
      const a = k / 8 * TAU; const sp = new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4); sp.rotateZ(Math.PI / 2); sp.rotateY(-a); sp.translate(x + Math.cos(a) * 0.48, 8.8, Math.sin(a) * 0.48); frameParts.push(sp);
    }
    const core = new THREE.SphereGeometry(0.16, 20, 14); core.translate(x, 7.1, 0); frameParts.push(core);
    const stem = new THREE.CylinderGeometry(0.05, 0.03, 1.7, 12); stem.translate(x, 7.95, 0); frameParts.push(stem);
    for (const t of tiers) {
      for (let s = 0; s < t.n; s++) {
        const a = (s + (t.r * 7) % 1) / t.n * TAU, cx = x + Math.cos(a) * t.r, cz = Math.sin(a) * t.r;
        const len = t.b;
        for (let k = 0; k < len; k++) {
          m.makeRotationY(a * 3.1 + k).setPosition(cx, t.y - 0.03 - k * 0.07, cz);
          beads.setMatrixAt(bi, m); beads.setColorAt(bi, col.setScalar(0.85 + Math.random() * 0.3)); bi++;
        }
        m.makeRotationY(a).setPosition(cx, t.y - 0.06 - len * 0.07, cz); drops.setMatrixAt(di++, m);
      }
    }
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; m.makeTranslation(x + Math.cos(a) * 0.9, 8.84, Math.sin(a) * 0.9); bulbs.setMatrixAt(ui++, m); }
    // soft glow billboard around each chandelier
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, 0.9, 0.78).multiplyScalar(0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.set(4.8, 4.8, 1); glow.position.set(x, 7.9, 0); glow.userData.glow = true; glow.renderOrder = 4; extras.add(glow);
  }
  for (const im of [beads, drops, bulbs]) { im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; g.add(im); }
  if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
  const fr = new THREE.Mesh(mergeGeometries(frameParts.map(p => p.index ? p : p)), M.gold); g.add(fr);
  return g;
}
