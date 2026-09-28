// Radical Architecture — Wedding Hall entrance foyer, procedural 3D model
// Dimensions from the plan DXF (inches): foyer 1038" x 240" = 26.37 m x 6.10 m; height 35'-0" = 10.67 m (double height).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

export const L = 26.37, W = 6.10, H = 10.67, HL = L / 2, HW = W / 2;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- textures
export function buildScene(renderer, manager) {
  const loader = new THREE.TextureLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (url, srgb = true, rep = true) => {
    const t = loader.load(url); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
  };
  const T = {
    cream: tex('../tex2/marble_cream.jpg'), dark: tex('../tex2/marble_dark.jpg'),
    floor: tex('../tex2/floor.jpg', true, false), sculpt: tex('../tex2/sculpture.jpg', true, false),
    door: tex('../tex2/door_wood.jpg', true, false), outdoor: tex('../tex2/outdoor.jpg', true, false), banquet: tex('../tex2/banquet.jpg', true, false),
  };
  T.outdoor.wrapS = THREE.MirroredRepeatWrapping; T.banquet.wrapS = THREE.MirroredRepeatWrapping;
  const glowTex = makeGlowTexture(), washTex = makeWashTexture(), aoTex = makeAOTexture(), blobTex = makeBlobTexture();

  // ---------------------------------------------------------------- materials
  const M = {
    cream: new THREE.MeshStandardMaterial({ map: T.cream, roughness: 0.22, metalness: 0, envMapIntensity: 0.9 }),
    creamMatte: new THREE.MeshStandardMaterial({ color: 0xf1e6d2, roughness: 0.75, metalness: 0 }),
    ceilingMaroon: new THREE.MeshStandardMaterial({ color: 0x5c1418, roughness: 0.55, metalness: 0 }),
    maroon: new THREE.MeshStandardMaterial({ color: 0x4a0b10, roughness: 0.62, metalness: 0, envMapIntensity: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ map: T.dark, roughness: 0.32, metalness: 0, envMapIntensity: 1.2 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9ab5c, roughness: 0.28, metalness: 1, envMapIntensity: 1.25 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89a52, roughness: 0.35, metalness: 1, side: THREE.DoubleSide }),
    bronzeDark: new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.45, metalness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ map: T.door, roughness: 0.45, metalness: 0, envMapIntensity: 0.8 }),
    woodPlain: new THREE.MeshStandardMaterial({ color: 0x4a2a17, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xe8f0ee, roughness: 0.03, metalness: 1, transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false }),
    sculpt: new THREE.MeshStandardMaterial({ map: T.sculpt, bumpMap: T.sculpt, bumpScale: 4, roughness: 0.35, metalness: 0.25, emissive: 0xffffff, emissiveMap: T.sculpt, emissiveIntensity: 0.35 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.6, side: THREE.DoubleSide }),
    soil: new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 1 }),
    emissiveWarm: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.38).multiplyScalar(3.2) }),
    emissiveCove: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.48).multiplyScalar(2.2) }),
    emissiveDown: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.9, 0.75).multiplyScalar(4.0) }),
    floor: new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.9, envMapIntensity: 0.35 }),
  };
  M.gold.name = 'gold';

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
    for (const x of vx) box(F, M.gold, x, top / 2, gw + 0.05, 0.07, top, 0.14);
    for (const x of [-0.68, 0.68]) box(F, M.gold, x, (top + 3.42) / 2, gw + 0.05, 0.06, top - 3.42, 0.12);
    for (const y of [0.05, 3.42, 5.66, 7.66, top]) box(F, M.gold, 0, y, gw + 0.05, 2 * gx + 0.07, 0.08, 0.14);
    // door leaves (glass) with gold frames and tall pull handles
    for (const s of [-1, 1]) {
      const cx = s * 0.775;
      for (const x of [cx - 0.72, cx + 0.72]) box(F, M.gold, x, 1.71, gw + 0.07, 0.06, 3.38, 0.06);
      box(F, M.gold, cx, 3.38, gw + 0.07, 1.5, 0.06, 0.06); box(F, M.gold, cx, 0.1, gw + 0.07, 1.5, 0.14, 0.06);
      const hx = s * 0.12;
      box(F, M.gold, hx, 1.35, gw + 0.2, 0.035, 1.9, 0.035);
      for (const y of [0.45, 2.25]) box(F, M.gold, hx, y, gw + 0.14, 0.03, 0.03, 0.12);
    }
    // outdoor backdrop beyond the glass
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(34, 13), new THREE.MeshBasicMaterial({ map: T.outdoor, color: 0xdddddd }));
    T.outdoor.repeat.set(34 / (13 * 1.3), 1); T.outdoor.offset.set(0.5 - T.outdoor.repeat.x / 2, 0);
    bd.position.set(0, 5.9, -HW - 4.2); extras.add(bd);
    // ground outside
    const og = new THREE.Mesh(new THREE.PlaneGeometry(34, 4.3), new THREE.MeshBasicMaterial({ color: 0x8c8a84 }));
    og.rotation.x = -Math.PI / 2; og.position.set(0, -0.02, -HW - 2.1); extras.add(og);
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
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.5, 0.64), gm);
      gp.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(0, 1.36, d - 0.155))); gp.renderOrder = 3; extras.add(gp); }
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
    for (const x of [-2.62, -1.53, 1.53, 2.62]) box(F, M.gold, x, top / 2, gw + 0.05, 0.08, top, 0.14);
    box(F, M.gold, 0, (top + dh) / 2, gw + 0.05, 0.07, top - dh, 0.12);
    for (const y of [0.04, dh + 0.04, 7.2, top]) box(F, M.gold, 0, y, gw + 0.05, 5.3, 0.09, 0.14);
    for (const s of [-1, 1]) {
      const cx = s * 0.765;
      for (const x of [cx - 0.72, cx + 0.72]) box(F, M.gold, x, dh / 2, gw + 0.08, 0.06, dh, 0.06);
      box(F, M.gold, cx, dh - 0.03, gw + 0.08, 1.5, 0.06, 0.06); box(F, M.gold, cx, 0.12, gw + 0.08, 1.5, 0.16, 0.06);
      const hx = s * 0.1;
      box(F, M.gold, hx, 1.9, gw + 0.2, 0.03, 2.4, 0.03);
      for (const y of [0.8, 3.0]) box(F, M.gold, hx, y, gw + 0.14, 0.025, 0.025, 0.12);
      linearLights.push({ F, u: s * 2.86, v: 4.55, h: 1.0 });
    }
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(16, 10.2), new THREE.MeshBasicMaterial({ map: T.banquet, color: 0xe0d8d0 }));
    T.banquet.repeat.set(16 / 10.2, 1); T.banquet.offset.set(0.5 - T.banquet.repeat.x / 2, 0);
    bd.rotation.y = -Math.PI / 2; bd.position.set(HL + 4.5, 4.6, 0); extras.add(bd);
    const bf = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 16), new THREE.MeshBasicMaterial({ color: 0x8a6a45 }));
    bf.rotation.x = -Math.PI / 2; bf.position.set(HL + 2.25, -0.02, 0); extras.add(bf);
  }

  // ================================================================ CEILING (per ceiling plan 824f82c4): bulkhead + stepped coffers + coves
  const downlights = [];
  {
    const F = frames.World;
    const b = 0.7, hb = 10.1, h1 = 10.35, h2 = 10.52, h3 = H;
    // perimeter bulkhead (underside maroon band with downlights) — four boxes
    const ring = (x0, x1, z0, z1, y0, y1, mat) => box(F, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
    ring(-HL, HL, -HW, -HW + b, hb, h1, M.creamMatte); ring(-HL, HL, HW - b, HW, hb, h1, M.creamMatte);
    ring(-HL, -HL + b, -HW + b, HW - b, hb, h1, M.creamMatte); ring(HL - b, HL, -HW + b, HW - b, hb, h1, M.creamMatte);
    ring(-HL + 0.25, HL - 0.25, -HW + 0.28, -HW + 0.52, hb - 0.01, hb, M.ceilingMaroon); ring(-HL + 0.25, HL - 0.25, HW - 0.52, HW - 0.28, hb - 0.01, hb, M.ceilingMaroon);
    ring(-HL + 0.28, -HL + 0.52, -HW + 0.52, HW - 0.52, hb - 0.01, hb, M.ceilingMaroon); ring(HL - 0.52, HL - 0.28, -HW + 0.52, HW - 0.52, hb - 0.01, hb, M.ceilingMaroon);
    // cove strip on top inner edge of bulkhead
    ring(-HL + b, HL - b, -HW + b - 0.02, -HW + b + 0.02, h1 + 0.02, h1 + 0.05, M.emissiveCove); ring(-HL + b, HL - b, HW - b - 0.02, HW - b + 0.02, h1 + 0.02, h1 + 0.05, M.emissiveCove);
    for (let x = -HL + 1.2; x <= HL - 1.1; x += 1.45) { downlights.push([x, hb - 0.012, -HW + 0.4], [x, hb - 0.012, HW - 0.4]); }
    for (const z of [-1.2, 0, 1.2]) { downlights.push([-HL + 0.4, hb - 0.012, z], [HL - 0.4, hb - 0.012, z]); }
    // main field at h1, with three coffers (5.0 x 3.7 outer) at x = -8.23, 0, 8.23 (27 ft spacing)
    const cx = [-8.23, 0, 8.23], cwo = 5.0, cdo = 3.7, iw = 3.4, id = 3.0;
    const fx0 = -HL + b, fx1 = HL - b, fz0 = -HW + b, fz1 = HW - b;
    // field plane pieces avoiding coffer openings
    const xs = [fx0]; for (const c of cx) xs.push(c - cwo / 2, c + cwo / 2); xs.push(fx1);
    for (let i = 0; i < xs.length - 1; i += 2) ring(xs[i], xs[i + 1], fz0, fz1, h1, h1 + 0.02, M.creamMatte);
    for (const c of cx) { ring(c - cwo / 2, c + cwo / 2, fz0, -cdo / 2, h1, h1 + 0.02, M.creamMatte); ring(c - cwo / 2, c + cwo / 2, cdo / 2, fz1, h1, h1 + 0.02, M.creamMatte); }
    // raised long side panels with coves (strips along z edges between bulkhead and coffers)
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i] + 0.15, x1 = xs[i + 1] - 0.15; if (x1 - x0 < 0.6) continue;
      for (const s of [-1, 1]) {
        const z0 = s < 0 ? fz0 + 0.12 : cdo / 2 + 0.12, z1 = s < 0 ? -cdo / 2 - 0.12 : fz1 - 0.12;
        ring(x0, x1, z0, z1, h1 - 0.14, h1 - 0.1, M.creamMatte);
        ring(x0 + 0.05, x1 - 0.05, (z0 + z1) / 2 - 0.01, (z0 + z1) / 2 + 0.01, h1 - 0.1, h1 - 0.095, M.gold);
        for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.3) downlights.push([x, h1 - 0.141, (z0 + z1) / 2]);
      }
    }
    // tall panels between coffers
    for (let i = 1; i < xs.length - 2; i += 2) {
      const m = (xs[i + 1] + xs[i + 2]) / 2; if (!isFinite(m)) continue;
    }
    for (const c of cx) {
      // maroon flanking panels with downlights (inside outer coffer, x sides)
      for (const s of [-1, 1]) {
        const x0 = c + s * (cwo / 2), x1 = c + s * (iw / 2);
        ring(Math.min(x0, x1), Math.max(x0, x1), -cdo / 2, cdo / 2, h1, h1 + 0.01, M.ceilingMaroon);
        downlights.push([(x0 + x1) / 2, h1 - 0.002, -0.9], [(x0 + x1) / 2, h1 - 0.002, 0.9]);
      }
      // cream strips (z sides) inside outer coffer
      ring(c - iw / 2, c + iw / 2, -cdo / 2, -id / 2, h1, h1 + 0.01, M.creamMatte); ring(c - iw / 2, c + iw / 2, id / 2, cdo / 2, h1, h1 + 0.01, M.creamMatte);
      // step 1: vertical faces up to h2, then step 2 to h3
      const step = (w, d, y0, y1) => {
        ring(c - w / 2, c + w / 2, -d / 2 - 0.02, -d / 2, y0, y1, M.creamMatte); ring(c - w / 2, c + w / 2, d / 2, d / 2 + 0.02, y0, y1, M.creamMatte);
        ring(c - w / 2 - 0.02, c - w / 2, -d / 2, d / 2, y0, y1, M.creamMatte); ring(c + w / 2, c + w / 2 + 0.02, -d / 2, d / 2, y0, y1, M.creamMatte);
        // cove LED on the ledge just inside the step
        ring(c - w / 2 + 0.03, c + w / 2 - 0.03, -d / 2 + 0.02, -d / 2 + 0.05, y0 + 0.005, y0 + 0.03, M.emissiveCove);
        ring(c - w / 2 + 0.03, c + w / 2 - 0.03, d / 2 - 0.05, d / 2 - 0.02, y0 + 0.005, y0 + 0.03, M.emissiveCove);
        ring(c - w / 2 + 0.02, c - w / 2 + 0.05, -d / 2 + 0.05, d / 2 - 0.05, y0 + 0.005, y0 + 0.03, M.emissiveCove);
        ring(c + w / 2 - 0.05, c + w / 2 - 0.02, -d / 2 + 0.05, d / 2 - 0.05, y0 + 0.005, y0 + 0.03, M.emissiveCove);
      };
      step(iw, id, h1, h2);
      ring(c - iw / 2, c + iw / 2, -id / 2, -id / 2 + 0.3, h2, h2 + 0.01, M.creamMatte); ring(c - iw / 2, c + iw / 2, id / 2 - 0.3, id / 2, h2, h2 + 0.01, M.creamMatte);
      ring(c - iw / 2, c - iw / 2 + 0.3, -id / 2 + 0.3, id / 2 - 0.3, h2, h2 + 0.01, M.creamMatte); ring(c + iw / 2 - 0.3, c + iw / 2, -id / 2 + 0.3, id / 2 - 0.3, h2, h2 + 0.01, M.creamMatte);
      step(iw - 0.6, id - 0.6, h2, h3);
      ring(c - iw / 2 + 0.3, c + iw / 2 - 0.3, -id / 2 + 0.3, id / 2 - 0.3, h3, h3 + 0.02, M.creamMatte);
      // gold medallion ring at chandelier canopy
      const med = new THREE.TorusGeometry(0.55, 0.035, 8, 48); med.rotateX(Math.PI / 2); geo(F, M.gold, med, c, h3 - 0.03, 0);
      const med2 = new THREE.TorusGeometry(0.85, 0.02, 6, 64); med2.rotateX(Math.PI / 2); geo(F, M.gold, med2, c, h3 - 0.02, 0);
    }
  }

  // ================================================================ floor + perimeter AO
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = 1; floor.name = 'floor';
  const aoMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: aoTex, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const decals = new THREE.Group();
  {
    const strip = (len, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), aoMat); m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, 0.004, z); decals.add(m); };
    strip(L, 0, -HW + 0.45, Math.PI); strip(L, 0, HW - 0.45, 0); strip(W, -HL + 0.45, 0, Math.PI / 2); strip(W, HL - 0.45, 0, -Math.PI / 2);
    // vertical corner darkening on walls
    const vstrip = (x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, H), aoMat); m.position.set(x, H / 2, z); m.rotation.set(0, ry, Math.PI / 2 * 0); decals.add(m); };
  }
  // ================================================================ instanced fixtures: sconces, linear lights, downlights, plants
  const inst = [];
  {
    const n = sconces.length;
    const shadeG = new THREE.LatheGeometry([new THREE.Vector2(0.075, 0.24), new THREE.Vector2(0.11, 0.12), new THREE.Vector2(0.2, -0.2), new THREE.Vector2(0.205, -0.22)], 32);
    const innerG = new THREE.CircleGeometry(0.19, 24); innerG.rotateX(Math.PI / 2);
    const capG = new THREE.CircleGeometry(0.075, 16); capG.rotateX(-Math.PI / 2);
    const plateG = new THREE.CylinderGeometry(0.07, 0.07, 0.03, 24); plateG.rotateX(Math.PI / 2);
    const armG = new THREE.BoxGeometry(0.03, 0.03, 1);
    const shade = new THREE.InstancedMesh(shadeG, M.brass, n), inner = new THREE.InstancedMesh(innerG, M.emissiveWarm, n);
    const cap = new THREE.InstancedMesh(capG, M.emissiveWarm, n), plate = new THREE.InstancedMesh(plateG, M.gold, n), arm = new THREE.InstancedMesh(armG, M.gold, n);
    const washMat = new THREE.MeshBasicMaterial({ map: washTex, color: new THREE.Color(1, 0.62, 0.3).multiplyScalar(0.42), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const wash = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 2.6), washMat, n);
    const mm = new THREE.Matrix4(), s3 = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3();
    sconces.forEach((s, i) => {
      const size = s.size || 1, w0 = s.w0 || 0.04, out = 0.26 * size;
      const place = (mesh, u, v, w, sx = 1, sy = 1, sz = 1) => {
        mm.makeTranslation(u, v, w).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
        mesh.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(s.F, mm));
      };
      place(shade, s.u, s.v, w0 + out, size, size, size);
      place(inner, s.u, s.v - 0.2 * size, w0 + out, size, size, size);
      place(cap, s.u, s.v + 0.24 * size, w0 + out, size, size, size);
      place(plate, s.u, s.v + 0.3 * size, w0 + 0.015, size, size, 1);
      place(arm, s.u, s.v + 0.3 * size, w0 + out / 2, size, size, out);
      place(wash, s.u, s.v - 0.25 * size, w0 + 0.012, size * 1.1, size * 1.2, 1);
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
    for (const x of [-8.23, 0, 8.23]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 5.6), poolMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.007, 0); decals.add(m); }
    const topMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: aoTex, transparent: true, opacity: 0.45, depthWrite: false });
    const band = (F, len) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2), topMat); m.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(0, 8.3, 0.2).multiply(new THREE.Matrix4().makeRotationZ(Math.PI)))); m.renderOrder = 3; decals.add(m); };
    band(frames.N, L); band(frames.S, L); band(frames.Wt, W); band(frames.E, W);
    const cm = [1, -1].map(s => { const t = aoTex.clone(); t.center.set(0.5, 0.5); t.rotation = s * Math.PI / 2; t.needsUpdate = true;
      return new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: 0.4, depthWrite: false }); });
    const corner = (F, u, flip) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, H), cm[flip ? 0 : 1]);
      m.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(u, H / 2, 0.21))); m.renderOrder = 3; decals.add(m); };
    for (const F of [frames.N, frames.S]) { corner(F, -HL + 0.45, true); corner(F, HL - 0.45, false); }
    for (const F of [frames.Wt, frames.E]) { corner(F, -HW + 0.45, true); corner(F, HW - 0.45, false); }
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
  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x4a2a1a, 0.2);
  const lights = new THREE.Group(); lights.add(hemi);
  for (const x of [-8.23, 0, 8.23]) { const p = new THREE.PointLight(0xffc98a, 26, 0, 1.6); p.position.set(x, 7.2, 0); lights.add(p); }
  const pn = new THREE.PointLight(0xffb070, 10, 0, 1.8); pn.position.set(-HL + 1.2, 5.5, 0); lights.add(pn);
  const pe = new THREE.PointLight(0xffd0a0, 8, 0, 1.8); pe.position.set(HL - 1.5, 4.5, 0); lights.add(pe);
  const pc = new THREE.PointLight(0xffc080, 5, 0, 1.8); pc.position.set(0, 3.2, 0.8); lights.add(pc);

  // mirrored copy for the polished-floor reflection (floor is drawn semi-transparent over it)
  const mirror = new THREE.Group(); mirror.name = 'mirror';
  mirror.scale.y = -1;
  mirror.add(group.clone(), extras.clone());
  mirror.traverse(o => { if (o.userData.glow) o.visible = true; });

  return { group, extras, floor, decals, lights, mirror, obstacles, M, T, water: extras.userData.water, chand };

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
function makeWashTexture() { return canvasTex(128, 256, (g, w, h) => {
  // light pool below the shade (fanning down) and softer glow above
  g.globalCompositeOperation = 'lighter';
  let r = g.createRadialGradient(64, 150, 4, 64, 150, 110); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.save(); g.translate(64, 150); g.scale(0.55, 1); g.translate(-64, -150); g.fillStyle = r; g.fillRect(0, 0, w, h); g.restore();
  r = g.createRadialGradient(64, 100, 2, 64, 100, 70); r.addColorStop(0, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.save(); g.translate(64, 100); g.scale(0.5, 1); g.translate(-64, -100); g.fillStyle = r; g.fillRect(0, 0, w, h); g.restore();
}); }
function makeAOTexture() { const t = canvasTex(4, 64, (g, w, h) => { const r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.6, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); t.colorSpace = THREE.NoColorSpace; return t; }
function makeBlobTexture() { const t = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); t.colorSpace = THREE.NoColorSpace; return t; }

// ------------------------------------------------------------------ water shader
function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float time; varying vec2 vUv;
      float h(float n){ return fract(sin(n)*43758.5453); }
      float n1(float x){ float i=floor(x), f=fract(x); return mix(h(i),h(i+1.0),f*f*(3.0-2.0*f)); }
      void main(){
        float cols = 150.0; float c = floor(vUv.x*cols); float fx = fract(vUv.x*cols);
        float sp = 0.55 + h(c)*0.6;
        float y = vUv.y*9.0 + time*sp*2.4 + h(c+7.0)*20.0;
        float streak = n1(y*1.3) * n1(y*0.37+c) ;
        float thread = smoothstep(0.5,0.0,abs(fx-0.5)) ;
        float s = pow(streak,2.2)*thread;
        // second finer layer
        float c2 = floor(vUv.x*310.0); float y2 = vUv.y*14.0 + time*(0.9+h(c2)*0.5)*3.0 + h(c2)*30.0;
        s += pow(n1(y2),6.0)*0.8*smoothstep(0.5,0.0,abs(fract(vUv.x*310.0)-0.5));
        float topGlow = smoothstep(0.75,1.0,vUv.y)*0.6;
        float bottomMist = smoothstep(0.08,0.0,vUv.y)*(0.15+0.15*n1(vUv.x*40.0+time*2.0));
        float edge = smoothstep(0.0,0.03,vUv.x)*smoothstep(1.0,0.97,vUv.x);
        vec3 col = vec3(0.95,0.98,1.0)*(s*(0.5+0.9*vUv.y)) + vec3(1.0,0.8,0.55)*topGlow*(0.4+s) + vec3(0.9,0.95,1.0)*bottomMist;
        gl_FragColor = vec4(col*edge*1.0, 1.0);
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
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.0, roughness: 0.04, envMapIntensity: 3.5, emissive: 0xffc890, emissiveIntensity: 1.1, flatShading: true });
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.55).multiplyScalar(5) });
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
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, 0.75, 0.45).multiplyScalar(0.75), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.set(4.8, 4.8, 1); glow.position.set(x, 7.9, 0); glow.userData.glow = true; glow.renderOrder = 4; extras.add(glow);
  }
  for (const im of [beads, drops, bulbs]) { im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; g.add(im); }
  if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
  const fr = new THREE.Mesh(mergeGeometries(frameParts.map(p => p.index ? p : p)), M.gold); g.add(fr);
  return g;
}
