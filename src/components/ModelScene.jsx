/**
 * ModelScene.jsx — a measured model in WebGL (three.js), whatever the model:
 * the bayath (house) of 1 Kings 6–7, Yachazaqaal's house of Ezekiel 40–43, the
 * mashakan, a city and its gates. Everything it draws comes from the model's
 * data file (lib/models/*.js, a MODEL object) — this file only turns that data
 * into meshes and runs the stories, the guided camera, the walker on foot, the
 * doors and gates, the minimap and the stair marks, so the flat sheet and this
 * scene never disagree. The part builders live in model3d/builders.js; a
 * model's own actors (the temple's land and dedication) come in through
 * MODEL.scene.extras.
 *
 * Imported lazily by pages/ModelPage.jsx so three.js is fetched only when the 3D
 * view is shown. Rendering is on demand (frames only while playing, orbiting
 * or after a change). Every texture is drawn on a canvas — nothing is
 * downloaded — except fieldy's photographs and the optional sculpted parts
 * (GET /api/models/<slot>.glb), which replace the procedural ones when present.
 *
 * What the scene reads from MODEL (see lib/models/temple.js for the whole):
 *   id, title, ground, PIECES, MATERIALS, MODES, progressAt, xrayAt, openAt, cameraAt, focusFor
 *   roam: { eye, start:{pos,look}, enter:{pieceId:{open}}, openKeys, openKey(which), openDefault(key) }
 *   scene: { sky, shadowR, xrayGroups, whole:{id,group}, lights:[{key,color,distance,decay,pos,on(progressOf,mode,t)}],
 *            walls:[ids], notSolid:[ids], proxies:[{x,y,z,r,h}], stairHouses:{id:box}, plan:{pieces,labels,extra,radius},
 *            inHouse(p), floorAt(p,mode,t), extras(ctx) → { sunOffset, place(mode,t) → presence, after(mode,t) } }
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SKY, XRAY_GROUPS, makeMaterials, loadPhotos, buildPiece, cutGates, loadGlb, fitSlot, personFigure, exportGlb, PieceBuilder } from './model3d/builders.js';
import { templeExtras } from './model3d/templeExtras.js';

/** A model's own actors, by the name its MODEL.scene.extras gives (a function is taken as is). */
const EXTRAS = { temple: templeExtras };

/** Where the viewer last stood on foot (position, yaw, pitch) — kept while the page lives, so opening a card, a re-mount or a
 *  switch of view never sends them back to the gate ("don't move me back to the beginning"). */
const MEMO = {};   // model id → where the viewer last stood
function readMemo(id) { if (!(id in MEMO)) { try { MEMO[id] = JSON.parse(sessionStorage.getItem(`${id}-roam`) || 'null'); } catch { MEMO[id] = null; /* no storage: the gate it is */ } } return MEMO[id]; }
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;   // a touch screen: the thumb stick + a look drag instead of the mouse

// ── The component ────────────────────────────────────────────────────────────
export default function ModelScene({ model, clock, mode, selected, onSelect: onSelectProp, onReady, onFollow: onFollowProp, onLock: onLockProp, apiRef }) {
  const wrap = useRef(null);
  // The scene is built once ([] effect) and lives across the page's re-renders — so its callbacks must always be the page's
  // CURRENT ones. 2026-09-14: the mount-time onSelect was captured; it carried the page's navigate from the first render (the
  // guided walk he had opened before pressing "On foot"), so a pick on foot resolved its "?piece=" against /walk and threw the
  // viewer out of on-foot into the guided story — "when I click a basin I shouldn't be taken out of on foot".
  const cbs = useRef({}); cbs.current = { onSelect: onSelectProp, onFollow: onFollowProp, onLock: onLockProp };
  const onSelect = (id) => cbs.current.onSelect?.(id), onFollow = (on) => cbs.current.onFollow?.(on), onLock = (on, why) => cbs.current.onLock?.(on, why);
  const api = useRef(null);
  const modeRef = useRef(mode); modeRef.current = mode;
  const modelRef = useRef(model);

  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    const model = modelRef.current;
    const { PIECES, MODES, progressAt, xrayAt, openAt, cameraAt, focusFor } = model;
    const SC = { sky: SKY, shadowR: 210, xrayGroups: XRAY_GROUPS, walls: [], notSolid: [], proxies: [], stairHouses: {}, plan: { pieces: [], labels: [], extra: [], radius: 85 }, lights: [], ...model.scene };
    const GROUND = model.ground, ROAM_EYE = model.roam.eye, ROAM_START = model.roam.start, ROAM_ENTER = model.roam.enter || {};
    const STORE = `${model.id}-roam`;
    let ROAM_MEMO = readMemo(model.id);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch (e) { onReady?.(false, e); return undefined; }
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement); renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SC.sky);
    const FOG = SC.fog || [380, 1100]; scene.fog = new THREE.Fog(SC.sky, FOG[0], FOG[1]);   // a wider model (Yachazaqaal's five hundred square) pushes the haze back
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.4, 6000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = true; controls.screenSpacePanning = false;
    controls.minDistance = 2; controls.maxDistance = SC.maxDistance || 900; controls.maxPolarAngle = Math.PI - 0.02;   // tilt as far as you like — looking up from the floor included

    // Light: the sun from the south-east, a warm sky, a cool fill.
    const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x6b5a3e, 0.85); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3dc, 2.6); sun.position.set(220, 300, 180); sun.castShadow = true;
    const sh = small ? 2048 : 4096; sun.shadow.mapSize.set(sh, sh);
    const R = SC.shadowR; sun.shadow.camera.left = -R; sun.shadow.camera.right = R; sun.shadow.camera.top = R; sun.shadow.camera.bottom = -R;
    sun.shadow.camera.near = 50; sun.shadow.camera.far = 800; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.4;
    scene.add(sun); scene.add(sun.target);
    // The model's own lamps (the temple: the lampstands' light in the roofed hall, the oracle, the porch), each with a rule for
    // how bright it burns at t of the story (from the pieces' progress).
    const lights = {};
    for (const L of SC.lights) { const l = new THREE.PointLight(L.color, 0, L.distance, L.decay ?? 1.6); l.position.set(...L.pos); scene.add(l); lights[L.key] = l; }

    const world = new THREE.Group(); scene.add(world);
    const M = makeMaterials(model.MATERIALS);
    loadPhotos(M, () => { dirty = true; });

    // The mount: a wide plain fading into the haze; the courts lay their own ground.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 96), M.earth);
    ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND - 0.6; ground.receiveShadow = true; world.add(ground);

    // ── Pieces ──────────────────────────────────────────────────────────────
    const groups = new Map();
    const doorSets = [], veilSets = [], lampLights = [];
    for (const piece of PIECES) {
      const g = buildPiece(M, cutGates(piece), GROUND, SC.xrayGroups);
      groups.set(piece.id, g); world.add(g);
      if (g.userData.doors) doorSets.push(...g.userData.doors);
      if (g.userData.veil) veilSets.push(...g.userData.veil);
      g.traverse((o) => { if (o.userData.lamp) lampLights.push({ light: o.userData.lamp, piece }); });
    }
    const xrayMeshes = [];
    world.traverse((o) => { if (o.isMesh && o.userData.xray) xrayMeshes.push(o); });
    const byId = (id) => groups.get(id);
    // the model's own actors, if it has stories with any (the temple: the land the Build opens on, the dedication)
    const extrasOf = typeof SC.extras === 'string' ? EXTRAS[SC.extras] : SC.extras;
    const extras = extrasOf ? extrasOf({ M, byId, lights: { ...lights, sun, hemi, scene }, sky: SC.sky, scene, world }) : null;
    const sunOffset = extras?.sunOffset || new THREE.Vector3(220, 300, 180);

    // sculpted parts, when their files exist
    for (const [id, g] of groups) {
      for (const slot of g.userData.slots || []) {
        loadGlb(slot.slot).then((proto) => {
          if (!alive || !proto) return;
          const fitted = fitSlot(proto, slot);
          // an unpainted sculpt takes the piece's own material (brass, gold…); a painted one keeps its skin
          const fallback = M[PIECES.find((p) => p.id === id)?.material] || M.brass, forced = slot.mat ? M[slot.mat] : null;   // a slot may insist on a material whatever the sculpt's skin (the throne's lions: gold)
          fitted.traverse((o) => { if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); if (forced) o.material = forced; else if (!o.material?.map) o.material = fallback; } });
          const keep = new Set(slot.keep || []);
          [...slot.node.children].forEach((c) => { if (!keep.has(c) && !c.isLight) slot.node.remove(c); });
          slot.node.add(fitted); lastT = -1; dirty = true;
        });
      }
    }

    // ── Roam: the viewer on their own feet (state; the controller is below) ──
    const roam = {
      on: false, yaw: Math.PI, pitch: 0, foot: GROUND, keys: new Set(), glide: null, moving: false,
      stick: { x: 0, y: 0 },                                                  // the thumb stick (touch): x strafe, y forward, each −1 … 1
      air: 0, vy: 0,                                                          // in the air (a jump, or walked off an edge): 1 while airborne, and the feet's upward speed
      airV: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, landAt: 0,                  // the jump's carry (amah/s, kept through the air), the last ground speed, when the feet last landed
      dist: 0,                                                                // the wheel: 0 = through his own eyes, up to DIST_MAX behind him (third person)
      open: Object.fromEntries((model.roam.openKeys || []).map((k) => [k, 0])), want: Object.fromEntries((model.roam.openKeys || []).map((k) => [k, 0])),   // the doors, the veil and the court gates (keys 'piece:i'), 0 shut … 1 open, eased toward what the viewer asked
    };
    const DIST_MAX = 15;
    // the court gates' leaves: every hinge group built for a gate, by key; open (1) unless the walker shuts one
    const gateSets = [];
    // what stands open at the start (the temple: the court gates open except the great court's — the outermost, where the walk begins — fieldy; the doors and the veil shut)
    const openDefault = model.roam.openDefault || ((k) => (k.includes(':') ? 1 : 0));
    for (const g of groups.values()) g.traverse((o) => { if (o.userData.gateLeaf) { gateSets.push({ key: o.userData.gateLeaf.key, node: o, swing: o.userData.gateLeaf.swing }); roam.open[o.userData.gateLeaf.key] = roam.want[o.userData.gateLeaf.key] = openDefault(o.userData.gateLeaf.key); } });
    // our figure on foot — one of the attendants (linen, faceless like all of them), seen when the wheel pulls the view back; the
    // walker's own position (the eye) is what everything else uses, the figure just stands under it, facing where he looks
    const avatar = (() => {
      const sub = new PieceBuilder(M, { id: 'avatar' }); personFigure(sub, 0.35, 'linen', 'stand', 'skin4', 'hair1');
      const g = sub.bake(); g.userData.id = undefined; g.traverse((o) => { o.userData.id = undefined; }); g.visible = false; scene.add(g); return g;
    })();

    // ── Where the stairs are: a gold mark at the foot and the head of every stair, drawn through the walls while he is on foot
    // inside (or on) that house — "right now I'm having to find stairs with memory" (fieldy)
    const stairMarks = [];
    {
      const tex = (down) => {
        const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
        g.fillStyle = 'rgba(20,14,8,0.62)'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#ffd062'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
        g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 7;                                    // three steps
        g.beginPath(); g.moveTo(30, 92); g.lineTo(48, 92); g.lineTo(48, 74); g.lineTo(66, 74); g.lineTo(66, 56); g.lineTo(84, 56); g.lineTo(84, 38); g.lineTo(100, 38); g.stroke();
        g.beginPath();                                                                                    // the arrow: up at the foot, down at the head
        if (down) { g.moveTo(40, 34); g.lineTo(40, 64); g.moveTo(28, 52); g.lineTo(40, 64); g.lineTo(52, 52); }
        else { g.moveTo(40, 64); g.lineTo(40, 30); g.moveTo(28, 42); g.lineTo(40, 30); g.lineTo(52, 42); }
        g.stroke();
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
      };
      const matUp = new THREE.SpriteMaterial({ map: tex(false), transparent: true, depthTest: false, depthWrite: false }), matDown = new THREE.SpriteMaterial({ map: tex(true), transparent: true, depthTest: false, depthWrite: false });
      for (const [id, box] of Object.entries(SC.stairHouses)) {
        for (const part of PIECES.find((p) => p.id === id)?.parts || []) {
          const st = part.stair; if (!st || st.i !== 0) continue;
          const rise = st.rise ?? 1, run = st.run ?? 1;
          const foot = st.axis === 'x' ? [st.x - st.dir * 1.2, st.y, st.z] : [st.x, st.y, st.z - st.dir * 1.2];
          const head = st.axis === 'x' ? [st.x + st.dir * (st.n * run + 0.8), st.y + st.n * rise, st.z] : [st.x, st.y + st.n * rise, st.z + st.dir * (st.n * run + 0.8)];
          for (const [pt, mat] of [[foot, matUp], [head, matDown]]) {
            const sp = new THREE.Sprite(mat); sp.position.set(pt[0], pt[1] + 3.6, pt[2]); sp.scale.set(2.6, 2.6, 1); sp.renderOrder = 999; sp.visible = false; sp.userData.foot = mat === matUp;
            sp.userData.house = box; sp.raycast = () => {}; scene.add(sp); stairMarks.push(sp);
          }
        }
      }
    }
    const inHouseOf = (b, p) => p.x > b.x0 - 1 && p.x < b.x1 + 1 && p.z > b.z0 - 1 && p.z < b.z1 + 1 && p.y > GROUND - 2 && p.y < GROUND + b.h + 6;

    // ── The minimap: a plan of the courts and houses round the walker, turned so his way is up (a game's minimap — fieldy:
    // "labeled buildings and marks so I can see what building I am next to at a glance"). The walls are every wall-high box of
    // the built pieces; the labels are the parts' names in his renderings.
    const mmap = document.createElement('canvas'); mmap.className = 'tp-minimap'; mmap.hidden = true; el.appendChild(mmap);
    const PLAN_PIECES = SC.plan.pieces;
    const PLAN_SKIP = new Set(['roof', 'floor', 'ceiling', 'slab', 'parapet', 'lining', 'rail', 'stair', 'pavement', 'paving', 'ground', 'beam', 'threshold', 'rug', 'bed', 'table', 'seat', 'couch', 'chest', 'jar', 'lampstand', 'tree', 'pool', 'inlay', 'vessel']);
    const plan = [];   // { x0, x1, z0, z1 } walls (filled) and { x, z, r } rounds (pillars, the sea)
    for (const id of PLAN_PIECES) {
      const piece = PIECES.find((q) => q.id === id); if (!piece) continue;
      for (const part of cutGates(piece).parts) {
        if (PLAN_SKIP.has(part.role)) continue;
        // each thing keeps its height span: the map shows what stands at the walker's own level (a lintel over a gate, or an
        // upper storey's rooms, must not close a doorway on the ground)
        const y0 = part.y ?? GROUND, y1 = y0 + (part.h ?? 3);
        if (part.kind === 'box' && part.h >= 2.5) plan.push({ x0: part.x - part.w / 2, x1: part.x + part.w / 2, z0: part.z - part.d / 2, z1: part.z + part.d / 2, y0, y1 });
        else if (part.kind === 'cyl' && part.r >= 0.8 && part.h >= 2.5) plan.push({ x: part.x, z: part.z, r: part.r, y0, y1 });
        else if (part.kind === 'base') plan.push({ x0: part.x - part.w / 2, x1: part.x + part.w / 2, z0: part.z - part.w / 2, z1: part.z + part.w / 2, thin: true, y0, y1: y0 + 4 });
        else if (part.kind === 'throne') plan.push({ x0: part.x - 3, x1: part.x + 3, z0: part.z - 3, z1: part.z + 3, thin: true, y0, y1: y0 + 6 });
      }
    }
    plan.push(...SC.plan.extra);   // what the pieces' parts do not give (the temple: the yam (sea), Yakayan and Baiz)
    const PLAN_LABELS = SC.plan.labels;
    const MM_R = SC.plan.radius;   // amah shown from the centre to the edge
    function drawMinimap() {
      const css = mmap.clientWidth || 170, dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(css * dpr);
      if (mmap.width !== W) { mmap.width = mmap.height = W; }
      const g = mmap.getContext('2d'); if (!g) return;
      const S = W / (2 * MM_R), cx = W / 2, cy = W / 2, px = camera.position.x, pz = camera.position.z, a = -(roam.yaw + Math.PI / 2);
      g.clearRect(0, 0, W, W);
      g.save(); g.beginPath(); g.roundRect(0, 0, W, W, 10 * dpr); g.clip();
      g.fillStyle = 'rgba(14, 11, 8, 0.78)'; g.fillRect(0, 0, W, W);
      g.save(); g.translate(cx, cy); g.rotate(a); g.scale(S, S);
      // the grid of the court, faint
      g.strokeStyle = 'rgba(255, 208, 98, 0.08)'; g.lineWidth = 0.6 / S;
      for (let k = -200; k <= 200; k += 20) { g.beginPath(); g.moveTo(k - px, -200 - pz); g.lineTo(k - px, 200 - pz); g.moveTo(-200 - px, k - pz); g.lineTo(200 - px, k - pz); g.stroke(); }
      g.fillStyle = 'rgba(255, 208, 98, 0.55)';
      const lo = roam.foot + 0.5, hi = roam.foot + 2.5;   // what stands at his level
      for (const r of plan) {
        if (r.y0 > hi || r.y1 < lo) continue;
        if (r.r != null) { g.beginPath(); g.arc(r.x - px, r.z - pz, r.r, 0, Math.PI * 2); g.fill(); continue; }
        if (r.x1 - px < -MM_R * 1.5 || r.x0 - px > MM_R * 1.5 || r.z1 - pz < -MM_R * 1.5 || r.z0 - pz > MM_R * 1.5) continue;
        g.globalAlpha = r.thin ? 0.6 : 1; g.fillRect(r.x0 - px, r.z0 - pz, r.x1 - r.x0, r.z1 - r.z0); g.globalAlpha = 1;
      }
      // the stairs' marks
      g.fillStyle = '#ffd062';
      for (const m of stairMarks) if (m.userData.foot) { g.beginPath(); g.arc(m.position.x - px, m.position.z - pz, 1.4, 0, Math.PI * 2); g.fill(); }
      g.restore();
      // labels stay upright
      g.font = `${Math.round(9 * dpr)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const [lx, lz, t] of PLAN_LABELS) {
        const dx = lx - px, dz = lz - pz; if (Math.hypot(dx, dz) > MM_R * 1.25) continue;
        const sx = cx + (dx * ca - dz * sa) * S, sy = cy + (dx * sa + dz * ca) * S;
        g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(14, 11, 8, 0.85)'; g.strokeText(t, sx, sy); g.fillStyle = '#f3e3b8'; g.fillText(t, sx, sy);
      }
      // north, at the rim
      { const nx = -sa * -1, ny = ca * -1; const rx = cx + nx * (cx - 9 * dpr), ry = cy + ny * (cy - 9 * dpr); g.font = `bold ${Math.round(10 * dpr)}px system-ui, sans-serif`; g.fillStyle = '#ffd062'; g.fillText('N', rx, ry); }
      // the walker, at the centre, his way up
      g.fillStyle = '#fff3c4'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.moveTo(cx, cy - 7 * dpr); g.lineTo(cx + 5 * dpr, cy + 5 * dpr); g.lineTo(cx, cy + 2.5 * dpr); g.lineTo(cx - 5 * dpr, cy + 5 * dpr); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }

    // ── Per-frame placement from the timeline ───────────────────────────────
    function place(t) {
      const mode = modeRef.current;
      const presence = extras?.place ? extras.place(mode, t) : 0;   // the temple's Build opens on the land: 1 on the map, 0 on the site
      ground.visible = presence < 0.999;
      scene.fog.near = FOG[0] + 1800 * presence; scene.fog.far = FOG[1] + 3500 * presence;
      for (const piece of PIECES) {
        const g = byId(piece.id); if (!g || piece.id === SC.whole?.id) continue;
        const p = progressAt(mode, piece, t);
        g.visible = p > 0.001;
        g.scale.y = Math.max(0.001, p);
      }
      const x = xrayAt(mode, t);
      for (const m of xrayMeshes) { m.material.opacity = 1 - 0.92 * x; m.material.depthWrite = x < 0.5; m.castShadow = x < 0.5; }
      const openOf = (which) => (roam.on ? (roam.open[model.roam.openKey ? model.roam.openKey(which) : which] || 0) : openAt(mode, which, t));
      for (const ds of doorSets) {
        const o = openOf(ds.open);
        for (const { node, sz, i } of ds.leaves) node.rotation.y = sz * o * (ds.fold ? (i === 0 ? 1.55 : 2.7) : 1.75);   // swing inward; a folding pair doubles back on itself
      }
      for (const gs of gateSets) gs.node.rotation.y = gs.swing * (roam.on ? roam.open[gs.key] : 1);
      for (const vs of veilSets) {
        const o = openOf(vs.open);
        for (const { node, sz } of vs.halves) { node.scale.z = 1 - 0.82 * o; node.position.z = node.userData.rest * (1 + 0.62 * o); }
      }
      // the lamps burn once their lampstands stand; the model's lights follow their own rules of the pieces' progress
      const progressOf = (id) => { const p = PIECES.find((q) => q.id === id); return p ? progressAt(mode, p, t) : 1; };
      for (const { light, piece } of lampLights) light.intensity = 40 * progressAt(mode, piece, t);
      for (const L of SC.lights) lights[L.key].intensity = L.on ? L.on(progressOf, mode, t) : L.intensity;
      if (extras?.after) extras.after(mode, t);   // the temple's dedication swells the house's lights in the glory
    }

    // ── Camera: scripted while following; the viewer's drag takes it ────────
    let following = true, flight = null, lastCamT = -1;
    const posV = new THREE.Vector3(), tgtV = new THREE.Vector3();
    function scriptCamera(t) {
      if (!following || roam.on) return;
      const cam = cameraAt(modeRef.current, t);
      posV.set(...cam.pos); tgtV.set(...cam.target);
      camera.position.copy(posV); controls.target.copy(tgtV);
    }
    function setFollow(on) { following = on; flight = null; onFollow?.(on); if (on) { lastT = -1; dirty = true; } }
    controls.addEventListener('start', () => { if (following) setFollow(false); flight = null; });

    // Focus: fly to a piece (keeping the viewer's azimuth), like the map.
    const fTgt = new THREE.Vector3(), fOff = new THREE.Vector3(), fSph = new THREE.Spherical();
    function flyTo(id) {
      const f = focusFor(id); if (!f) return;
      setFollow(false);
      flight = { from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to: { tgt: new THREE.Vector3(...f.target), dist: f.distance }, t0: performance.now(), ms: 800 };
      dirty = true;
    }
    function stepFlight(now) {
      if (!flight) return false;
      const k = Math.min(1, (now - flight.t0) / flight.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      fOff.copy(flight.from.pos).sub(flight.from.tgt); fSph.setFromVector3(fOff);
      fSph.radius = fOff.length() + (flight.to.dist - fOff.length()) * e;
      fSph.phi = Math.min(fSph.phi + (1.2 - fSph.phi) * e * 0.4, Math.PI / 2 - 0.05);
      fTgt.copy(flight.from.tgt).lerp(flight.to.tgt, e);
      controls.target.copy(fTgt); camera.position.copy(fTgt).add(fOff.setFromSpherical(fSph));
      if (k >= 1) flight = null;
      return true;
    }

    // ── Selection: a gold halo ──────────────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    outline.visibleEdgeColor.set(0xffd062); outline.hiddenEdgeColor.set(0x000000);   // black = nothing added where a wall hides the part: the halo never shows through
    outline.edgeStrength = 6; outline.edgeGlow = 1.2; outline.edgeThickness = 2.5; outline.pulsePeriod = 0;
    composer.addPass(outline); composer.addPass(new OutputPass());
    composer.setPixelRatio(renderer.getPixelRatio());
    let currentSel = selected;
    function applySelection(id) {
      currentSel = id;
      if (!id) { outline.selectedObjects = []; return; }
      if (SC.whole && id === SC.whole.id) { outline.selectedObjects = PIECES.filter((p) => p.group === SC.whole.group && p.id !== SC.whole.id).map((p) => byId(p.id)); return; }
      outline.selectedObjects = [byId(id)].filter(Boolean);
    }

    // ── Roam controller: drag to look, keys (or the pad) to walk, the walls solid ──
    // Collision is two short rays against the built things — one ahead at eye
    // height and one at the knee (so a court wall stops you and a door leaf does
    // until it is opened) — and one straight down for the ground under the next
    // step, so steps and ramps are climbed and the eye stays 3.4 amah above them.
    // Every built thing is solid to the walker (fieldy: "make every solid thing
    // solid so I can't pass through it") — the vessels, the lampstands and tables,
    // the cherubim, the ark, the furniture of the houses — except Yakayan and Baiz,
    // whose capitals carry four hundred pomegranates: a ray through those would
    // cost more than the frame, so they get two plain cylinders instead. The
    // guided camera, which only has to keep out of the WALLS inside the house,
    // tests the short list.
    const WALLS = SC.walls;                      // the pieces the guided camera keeps out of, and the third-person back ray
    const NOT_SOLID = new Set(SC.notSolid);      // the temple: the whole (a proxy group), the proxied pillars, the chains before the oracle (hung high), the king's figures of the dedication
    const wallSolids = [ground], solids = [ground];
    for (const id of WALLS) byId(id)?.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.lamp) wallSolids.push(o); });
    for (const [id, g] of groups) if (!NOT_SOLID.has(id)) g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.lamp) solids.push(o); });
    for (const p of SC.proxies) { const c = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, p.h, 12)); c.position.set(p.x, p.y + p.h / 2, p.z); c.updateMatrixWorld(true); solids.push(c); wallSolids.push(c); }   // plain stand-ins for what is too fine to ray against (Yakayan and Baiz with their four hundred pomegranates)
    const rRay = new THREE.Raycaster(); rRay.firstHitOnly = true;
    const fwd = new THREE.Vector3(), rightV = new THREE.Vector3(), step = new THREE.Vector3(), probe = new THREE.Vector3(), downV = new THREE.Vector3(0, -1, 0), upV = new THREE.Vector3(0, 1, 0), avatarEye = new THREE.Vector3(), backV = new THREE.Vector3();
    const WALK = 32, RUN = 56, STEP_UP = 2.4, RADIUS = 1.1, TURN = 1.6;   // amah/s: a brisk walk by default (fieldy: the old Shift pace), Shift to run
    const JUMP_V = 9.5, GRAVITY = 26;                                        // a spacebar jump of ~1¾ amah (v²/2g), up and down in ~¾ s
    function roamDir(out, pitch = roam.pitch) { return out.set(Math.cos(pitch) * Math.cos(roam.yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(roam.yaw)); }
    function aimCamera() {
      roamDir(fwd); camera.lookAt(probe.copy(camera.position).add(fwd));
      controls.target.copy(camera.position).add(fwd.multiplyScalar(12));   // the shadow window and the sun follow the target
    }
    function blocked(from, dir, len) {
      rRay.set(from, dir); rRay.far = len; rRay.near = 0;
      return rRay.intersectObjects(solids, false).some((h) => h.object.visible && !(h.object.material?.transparent && h.object.material.opacity < 0.3));
    }
    function groundUnder(x, z, fromY) {
      probe.set(x, fromY, z); rRay.set(probe, downV); rRay.far = 80; rRay.near = 0;
      const h = rRay.intersectObjects(solids, false).find((q) => q.object.visible);
      return h ? h.point.y : null;
    }
    /** Try a horizontal move; slides along walls; climbs what is under STEP_UP. Returns true if the eye moved. */
    function tryMove(dx, dz) {
      const len = Math.hypot(dx, dz); if (len < 1e-4) return false;
      const attempt = (mx, mz) => {
        const l = Math.hypot(mx, mz); if (l < 1e-4) return false;
        step.set(mx / l, 0, mz / l);
        const eye = camera.position, nx = eye.x + mx, nz = eye.z + mz;
        const gy = groundUnder(nx, nz, roam.foot + STEP_UP + 0.3);
        if (gy == null || gy > roam.foot + STEP_UP) return false;   // nothing under, or a wall / a roof too high to mantle
        // the way there is clear at the knee and the eye — measured from the higher of the two grounds, so a flight of steps
        // (1 high, 1 deep, so the risers two and three ahead stand above the knee) is climbed just by walking at it, while a court
        // wall or a shut door still blocks
        const base = Math.max(roam.foot, gy), knee = probe.set(eye.x, base + STEP_UP + 0.2, eye.z), high = knee.clone().setY(base + ROAM_EYE);
        // climbing (the ground ahead is higher): the thing ahead IS the step, so only the eye's ray is asked — on a stair of
        // 1 × 1 steps the knee's ray would meet the third step up and stop you halfway; on the level, the knee's ray stops a court
        // wall or a shut door
        if (blocked(high, step, l + RADIUS) || (gy <= roam.foot + 0.05 && blocked(knee.clone(), step, l + RADIUS))) return false;
        eye.x = nx; eye.z = nz;
        // the feet: a step up or the level is walked (in the air, coming down, it is where he lands — or rising, a ledge mantled);
        // a short drop is a step down; a longer one walks him off the edge and he falls (basic physics — fieldy)
        if (gy >= roam.foot - 0.05) { if (!roam.air) roam.foot = gy; else if (roam.vy <= 0) { roam.foot = gy; touchDown(); } else if (gy > roam.foot) roam.foot = gy; }
        else if (!roam.air) { if (gy >= roam.foot - STEP_UP) roam.foot = gy; else { roam.air = 1; roam.vy = 0; } }
        return true;
      };
      // a long move (a slow frame) is walked in short strides, so no step or wall is skipped over
      const strides = Math.max(1, Math.ceil(len / 1.0)); let moved = false;
      for (let i = 0; i < strides; i++) { const sx = dx / strides, sz = dz / strides; if (!(attempt(sx, sz) || attempt(sx, 0) || attempt(0, sz))) break; moved = true; }
      return moved;
    }
    function roamStep(dt) {
      if (!roam.on) return false;
      let changed = false;
      // the doors and the veil ease toward what was asked
      for (const k of Object.keys(roam.open)) {
        const d = roam.want[k] - roam.open[k];
        if (Math.abs(d) > 1e-4) { roam.open[k] += Math.sign(d) * Math.min(Math.abs(d), dt / 1.3); changed = true; }
      }
      if (changed) place(clock.t);
      if (roam.glide) {
        const g = roam.glide, k = Math.min(1, (performance.now() - g.t0) / g.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        camera.position.lerpVectors(g.from, g.to, e); roam.yaw = g.yaw0 + (g.yaw1 - g.yaw0) * e; roam.pitch = g.pitch0 * (1 - e);
        roam.foot = camera.position.y - ROAM_EYE;
        if (k >= 1) roam.glide = null;
        aimCamera(); return true;
      }
      // in the air (a jump, or off an edge): the feet fall under gravity until the ground under them is met — a roof, a floor,
      // the court — while any walking goes on; a ceiling stops the rise
      if (roam.air) {
        if (roam.vy > 0 && blocked(probe.copy(camera.position), upV, roam.vy * dt + 0.3)) roam.vy = 0;
        const prevFoot = roam.foot;
        roam.vy -= GRAVITY * dt; roam.foot += roam.vy * dt;
        // the ground is sought from where the feet WERE, so a long fall on a slow frame (Yachazaqaal's altar, eleven down) cannot skip the floor
        if (roam.vy <= 0) { const gy = groundUnder(camera.position.x, camera.position.z, prevFoot + 0.6); if (gy != null && roam.foot <= gy) { roam.foot = gy; touchDown(); } else if (gy == null && roam.foot < GROUND - 40) { roam.foot = GROUND; touchDown(); } }
        camera.position.y = roam.foot + ROAM_EYE; changed = true;
      }
      const K = roam.keys, S = roam.stick, stickMag = Math.hypot(S.x, S.y);
      if (!K.size && stickMag < 0.05) {
        // in the air with nothing pressed: the jump carries him on (a jump is more than straight up and down)
        if (roam.air > 0 && (roam.airV.x || roam.airV.z)) { tryMove(roam.airV.x * dt, roam.airV.z * dt); aimCamera(); remember(); return true; }
        roam.moving = false; roam.vel.x = roam.vel.z = 0; if (changed) aimCamera(); return changed; }
      const v = (K.has('run') || stickMag > 0.92 ? RUN : WALK) * dt;
      if (K.has('turnL')) roam.yaw -= TURN * dt; if (K.has('turnR')) roam.yaw += TURN * dt;
      fwd.set(Math.cos(roam.yaw), 0, Math.sin(roam.yaw)); rightV.set(-fwd.z, 0, fwd.x);
      let mx = 0, mz = 0;
      if (K.has('forward')) { mx += fwd.x * v; mz += fwd.z * v; } if (K.has('back')) { mx -= fwd.x * v; mz -= fwd.z * v; }
      if (K.has('right')) { mx += rightV.x * v; mz += rightV.z * v; } if (K.has('left')) { mx -= rightV.x * v; mz -= rightV.z * v; }
      if (stickMag >= 0.05) { const k = Math.min(1, stickMag); mx += (fwd.x * S.y + rightV.x * S.x) * v * k / stickMag; mz += (fwd.z * S.y + rightV.z * S.x) * v * k / stickMag; }
      if (roam.air > 0) { mx = mx * 0.35 + roam.airV.x * dt; mz = mz * 0.35 + roam.airV.z * dt; }   // in the air the keys steer only a little; the launch carries him
      else { roam.vel.x = mx / dt; roam.vel.z = mz / dt; }
      tryMove(mx, mz);
      // settle the eye onto the ground (a smooth rise on steps)
      const wantY = roam.foot + ROAM_EYE; camera.position.y += roam.air ? wantY - camera.position.y : (wantY - camera.position.y) * Math.min(1, dt * 10);
      roam.moving = true; aimCamera(); remember(); return true;
    }
    let memoAt = 0;
    function remember() {
      ROAM_MEMO = { pos: camera.position.toArray(), yaw: roam.yaw, pitch: roam.pitch, dist: roam.dist, open: { ...roam.want } };
      const now = performance.now(); if (now - memoAt > 1000) { memoAt = now; MEMO[model.id] = ROAM_MEMO; try { sessionStorage.setItem(STORE, JSON.stringify(ROAM_MEMO)); } catch { /* fine */ } }   // a reload keeps the spot too
    }
    function touchDown() { roam.air = 0; roam.vy = 0; roam.airV.x = roam.airV.z = 0; roam.landAt = performance.now(); }
    function jump() {
      if (!roam.on || roam.glide || roam.air) return;
      roam.air = 1; roam.vy = JUMP_V; dirty = true;
      // the carry: the speed he had, or from standing a short hop forward
      if (roam.moving && (roam.vel.x || roam.vel.z)) { roam.airV.x = roam.vel.x; roam.airV.z = roam.vel.z; }
      else { roam.airV.x = Math.cos(roam.yaw) * WALK * 0.18; roam.airV.z = Math.sin(roam.yaw) * WALK * 0.18; }
    }
    function roamEnter(on) {
      roam.on = on; roam.keys.clear(); roam.stick.x = roam.stick.y = 0; roam.air = 0; roam.vy = 0; roam.glide = null; controls.enabled = !on;
      renderer.domElement.style.cursor = on ? 'crosshair' : 'grab'; mmap.hidden = !on; zoneEl.hidden = !(on && COARSE); if (!on) { touches.clear(); pinch = null; }
      if (on) {
        following = false; onFollow?.(true);   // no "follow" button in the roam: there is no story to follow
        if (ROAM_MEMO) { camera.position.set(...ROAM_MEMO.pos); roam.yaw = ROAM_MEMO.yaw; roam.pitch = ROAM_MEMO.pitch; roam.dist = ROAM_MEMO.dist || 0; }   // back where they stood
        else { camera.position.set(...ROAM_START.pos); const [lx, , lz] = ROAM_START.look; roam.yaw = Math.atan2(lz - camera.position.z, lx - camera.position.x); roam.pitch = 0; }
        roam.foot = camera.position.y - ROAM_EYE;
        const gy = groundUnder(camera.position.x, camera.position.z, camera.position.y + 2); if (gy != null) { roam.foot = gy; camera.position.y = gy + ROAM_EYE; }
        for (const k of Object.keys(roam.open)) roam.open[k] = roam.want[k] = ROAM_MEMO?.open?.[k] ?? openDefault(k);
        aimCamera(); place(clock.t);
      } else {
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
        camera.up.set(0, 1, 0); camera.rotation.set(0, 0, 0); avatar.visible = false; for (const k of Object.keys(roam.open)) roam.open[k] = roam.want[k] = openDefault(k);
      }
      setLocked(false); dirty = true;
    }
    /** A second tap on a door, the veil or a court gate that is already chosen: open it if shut, shut it if open (fieldy). The walker
     *  goes through on his own feet. Tapping elsewhere and back only chooses it again. */
    function roamGo(id, gateKey) {
      const key = gateKey || ROAM_ENTER[id]?.open; if (!key || !(key in roam.want)) return false;
      roam.want[key] = roam.want[key] > 0.5 ? 0 : 1;
      return true;
    }
    // look — with a mouse: a click takes the pointer (pointer lock) and the mouse turns the head like a first-person game, Esc gives
    // it back; a drag also turns the head when the lock is refused. On a touch screen: a thumb on the left of the view raises a
    // stick that walks (like Roblox), the other thumb drags to look.
    const canLock = !COARSE && !!renderer.domElement.requestPointerLock;
    let locked = false, look = null, stickPtr = null;
    const cross = document.createElement('div'); cross.className = 'tp-cross'; el.appendChild(cross);                      // the crosshair, while the mouse is taken
    const stickEl = document.createElement('div'); stickEl.className = 'tp-stick'; stickEl.innerHTML = '<div class="tp-stick-knob"></div>'; el.appendChild(stickEl);
    const knobEl = stickEl.firstChild, STICK_R = 44;
    function setLocked(v) { locked = v; cross.hidden = !v; el.classList.toggle('tp-locked', v); onLock?.(v); }
    let lockFailed = false;
    function takeMouse() {
      // Chrome returns a promise (rejects when the page is not the active document, when no user gesture is seen, or when the user
      // pressed Esc a moment ago); older browsers return nothing and fire pointerlockerror. Either way the drag-look still works.
      let p; try { p = renderer.domElement.requestPointerLock(); } catch { p = null; }
      if (p && typeof p.catch === 'function') p.catch((err) => { lockFailed = true; onLock?.(false, err?.name || 'error'); });
    }
    const onLockError = () => { lockFailed = true; onLock?.(false, 'error'); };
    document.addEventListener('pointerlockerror', onLockError);
    const onLockChange = () => { setLocked(document.pointerLockElement === renderer.domElement); dirty = true; };
    document.addEventListener('pointerlockchange', onLockChange);
    const turnHead = (dx, dy) => { roam.yaw += dx * 0.0042; roam.pitch = Math.max(-1.45, Math.min(1.45, roam.pitch - dy * 0.0034)); aimCamera(); remember(); dirty = true; };
    // Touch (fieldy): the stick lives ONLY in the bottom-left of the view — a thumb landing there walks; a touch anywhere higher
    // or to the right looks, and two fingers pinch the view out to third person (or in, to his eyes) — never mistaken for walking
    const stickZone = (r, x, y) => x - r.left < r.width * 0.45 && y - r.top > r.height * 0.5;
    const touches = new Map(); let pinch = null;
    const zoneEl = document.createElement('div'); zoneEl.className = 'tp-stickzone'; zoneEl.hidden = true; el.appendChild(zoneEl);
    const onLookDown = (e) => {
      if (!roam.on || e.button === 2) return;
      const r = renderer.domElement.getBoundingClientRect();
      if (e.pointerType === 'touch' && stickPtr == null && stickZone(r, e.clientX, e.clientY)) {   // the left thumb: a stick where it landed
        stickPtr = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
        stickEl.style.left = `${e.clientX - r.left}px`; stickEl.style.top = `${e.clientY - r.top}px`; stickEl.hidden = false; knobEl.style.transform = '';
        try { renderer.domElement.setPointerCapture?.(e.pointerId); } catch { /* a synthetic pointer */ } return;
      }
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size >= 2) { const [a, b] = [...touches.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), dist0: roam.dist }; look = null; return; }
      }
      if (locked) return;
      look = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { renderer.domElement.setPointerCapture?.(e.pointerId); } catch { /* a synthetic pointer */ }
    };
    const onLookMove = (e) => {
      if (!roam.on) return;
      if (stickPtr && e.pointerId === stickPtr.id) {
        let dx = e.clientX - stickPtr.x0, dy = e.clientY - stickPtr.y0; const m = Math.hypot(dx, dy);
        if (m > STICK_R) { dx *= STICK_R / m; dy *= STICK_R / m; }
        roam.stick.x = dx / STICK_R; roam.stick.y = -dy / STICK_R; knobEl.style.transform = `translate(${dx}px, ${dy}px)`; return;
      }
      if (touches.has(e.pointerId)) { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
      if (pinch) {
        if (touches.size >= 2) {
          const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
          roam.dist = Math.max(0, Math.min(DIST_MAX, pinch.dist0 + (pinch.d0 - d) * 0.06));   // fingers together: the view pulls back; apart: into his eyes
          remember(); dirty = true;
        }
        return;
      }
      if (locked) { if (e.movementX || e.movementY) turnHead(e.movementX, e.movementY); return; }
      if (!look || e.pointerId !== look.id) return;
      turnHead(e.clientX - look.x, e.clientY - look.y); look.x = e.clientX; look.y = e.clientY;
    };
    const onLookUp = (e) => {
      if (stickPtr && e.pointerId === stickPtr.id) { stickPtr = null; roam.stick.x = roam.stick.y = 0; stickEl.hidden = true; return; }
      touches.delete(e.pointerId);
      if (pinch && touches.size < 2) { pinch = null; look = null; return; }   // the pinch ends: the finger left behind does not turn the head until it lifts and lands again
      if (look && e.pointerId === look.id) look = null;
    };
    stickEl.hidden = true; cross.hidden = true;
    // the wheel never moves the walker (fieldy): it only pulls the view back from his eyes to a third-person view of him, and
    // forward again into his eyes
    const onWheel = (e) => { if (!roam.on) return; e.preventDefault(); roam.dist = Math.max(0, Math.min(DIST_MAX, roam.dist + Math.sign(e.deltaY) * 1.5)); remember(); dirty = true; };
    const KEYMAP = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', KeyD: 'right', ArrowLeft: 'turnL', ArrowRight: 'turnR', ShiftLeft: 'run', ShiftRight: 'run', Space: 'jump' };
    const onKeyDown = (e) => { if (!roam.on || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; const k = KEYMAP[e.code]; if (!k) return; e.preventDefault(); if (k === 'jump') { if (!e.repeat) jump(); return; } roam.keys.add(k); };
    const onKeyUp = (e) => { const k = KEYMAP[e.code]; if (k) roam.keys.delete(k); };
    renderer.domElement.addEventListener('pointerdown', onLookDown);
    renderer.domElement.addEventListener('pointermove', onLookMove);
    renderer.domElement.addEventListener('pointerup', onLookUp);
    renderer.domElement.addEventListener('pointercancel', onLookUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => roam.keys.clear());

    // Tap vs drag
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
    const pickables = () => [...groups.values()].filter((g) => g.visible && g.userData.id !== 'house');
    let stillSelect = null;   // a selection made by tapping the view: the camera stays put (the chips, the words and "refocus" fly)
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY, at: performance.now(), button: e.button }; };
    const onUp = (e) => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), held = performance.now() - down.at, button = down.button; down = null;
      if (roam.on && locked) { if (held > 350 || button !== 0) return; }   // the mouse is taken: any click picks what the crosshair is on
      else if (moved > 10 || held > 350 || button !== 0) return;   // a drag, a hold, or a right/middle button: the viewer was moving the view, not choosing
      // On foot with a mouse: the first click only takes the mouse (the crosshair comes up) — it never chooses what happened to be
      // under the cursor on the way in ("a click should only enable the crosshair if I'm not currently scoped"); once the mouse is
      // taken, a click picks what the crosshair is on. When the browser refuses the lock, clicks pick as before.
      if (roam.on && canLock && !locked && !lockFailed && e.pointerType === 'mouse') { takeMouse(); return; }
      const r = renderer.domElement.getBoundingClientRect();
      if (roam.on && locked) ndc.set(0, 0); else ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables(), true).find((h) => h.object.visible && !(h.object.material?.transparent && h.object.material.opacity < 0.3));
      let o = hit?.object; while (o && !o.userData.id) o = o.parent;
      const id = o?.userData.id || null;
      if (roam.on && id && id === currentSel && roamGo(id, hit?.object?.userData?.gate)) { dirty = true; return; }   // the second tap on a door or a gate: open or shut it
      stillSelect = id; onSelect?.(id);
    };
    let hoverT = 0;
    const onMove = (e) => {
      if (down) return;
      const now = performance.now(); if (now - hoverT < 80) return; hoverT = now;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      renderer.domElement.style.cursor = ray.intersectObjects(pickables(), true).length ? 'pointer' : roam.on ? 'crosshair' : 'grab';
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);

    // ── Loop ────────────────────────────────────────────────────────────────
    let dirty = true, raf = 0, lastT = -1, alive = true;
    controls.addEventListener('change', () => { dirty = true; });
    let lastNow = performance.now(); const stats = { frames: 0, ms: 0 };
    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
      const t = clock.t;
      if (t !== lastT) { place(t); scriptCamera(t); lastT = t; dirty = true; lastCamT = t; }
      if (roamStep(dt)) dirty = true;
      if (stepFlight(now)) dirty = true;
      if (!roam.on && controls.update()) dirty = true;
      const inHouse = SC.inHouse || (() => false);
      if (!roam.on && !following && !flight && xrayAt(modeRef.current, clock.t) < 0.5 && (inHouse(camera.position) || inHouse(controls.target))) {   // never through a wall INSIDE the house; out in the courts the walls are low and the eye is free (pulling it in there dropped it into the crowd)
        const off = probe.copy(camera.position).sub(controls.target), dist = off.length();
        if (dist > 0.5) {
          rRay.set(controls.target, off.normalize()); rRay.far = dist; rRay.near = 0;
          const h = rRay.intersectObjects(wallSolids, false).find((q) => q.object.visible && !(q.object.material?.transparent && q.object.material.opacity < 0.3));
          if (h && h.distance < dist - 0.3) { camera.position.copy(controls.target).addScaledVector(off, Math.max(0.6, h.distance - 0.5)); dirty = true; }
        }
      }
      if (!roam.on) {                                // never below the floor: the house's floor inside its footprint, the court's ground outside
        const c = camera.position;
        const floor = (SC.floorAt ? SC.floorAt(c, modeRef.current, clock.t) : GROUND) + 0.7;
        if (c.y < floor) { c.y = floor; if (controls.target.y < floor) controls.target.y = floor; dirty = true; }
      }
      if (!dirty) return;
      dirty = false; stats.frames++; const f0 = performance.now();
      // the sun's shadow window follows the camera's target so the shadows stay sharp where the eye is
      sun.target.position.copy(controls.target); sun.position.copy(controls.target).add(sunOffset);
      // third person on foot: the walker's eye stays where all the walking is reckoned; only for the drawing is the camera pulled
      // back along his line of sight (no further than the nearest wall or floor behind him), looking at him, with our figure under
      // the eye — so the crosshair's pick, from the eye, is the same line the drawn view centres on
      for (const m of stairMarks) m.visible = roam.on && inHouseOf(m.userData.house, camera.position);
      if (roam.on) drawMinimap();
      let pulled = false;
      if (roam.on && roam.dist > 0.01) {
        roamDir(fwd); avatarEye.copy(camera.position);
        rRay.set(avatarEye, backV.copy(fwd).negate()); rRay.far = roam.dist + 0.6; rRay.near = 0;
        const h = rRay.intersectObjects(wallSolids, false).find((q) => q.object.visible && !(q.object.material?.transparent && q.object.material.opacity < 0.3));
        const d = h ? Math.max(0.4, h.distance - 0.6) : roam.dist;
        avatar.visible = d > 1.2;
        const bob = roam.moving && roam.air <= 0 ? 0.1 * Math.abs(Math.sin(now / 120)) : 0;
        avatar.position.set(avatarEye.x, roam.foot + bob, avatarEye.z); avatar.rotation.set(0, -roam.yaw, 0);
        const sinceLand = now - roam.landAt, crouch = sinceLand < 220 ? 0.14 * Math.sin((sinceLand / 220) * Math.PI) : 0;   // the knees give on landing
        avatar.scale.set(1 + crouch * 0.5, 1 - crouch, 1 + crouch * 0.5);
        // the figure faces +x before its yaw (Euler XYZ: z is applied first, in the figure's own frame), so a lean forward is a
        // turn about z: a sway with the gait on the ground, a lean into a running jump in the air
        avatar.rotation.z = roam.air > 0 ? -0.22 * Math.min(1, Math.hypot(roam.airV.x, roam.airV.z) / WALK) : roam.moving ? 0.03 * Math.sin(now / 120) : 0;
        camera.position.copy(avatarEye).addScaledVector(fwd, -d); camera.lookAt(probe.copy(avatarEye).addScaledVector(fwd, 2));
        pulled = true;
      } else avatar.visible = false;
      composer.render(); stats.ms = performance.now() - f0;
      if (pulled) { camera.position.copy(avatarEye); aimCamera(); if (now - roam.landAt < 240) dirty = true; }   // the landing crouch plays out
    }
    function resize() {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); composer.setSize(w, h); outline.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
    }
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    place(clock.t); scriptCamera(clock.t); lastT = clock.t;
    frame();
    onReady?.(true);

    window.__modelExport = window.__templeExport = (pid, which) => {
      const g = groups.get(pid); if (!g) return false;
      if (which && which.startsWith('part:')) { let node = null; g.traverse((o) => { if (!node && o.userData.part === which.slice(5)) node = o; }); if (!node) return false; exportGlb(node, `${model.id}-${which.slice(5)}`, false); return true; }
      const slot = which === 'slot' ? (g.userData.slots || []).find((sl) => !sl.mirror) : null; exportGlb(slot ? slot.node : g, slot ? slot.slot : `${model.id}-${pid}`, !!slot); return true;
    };

    // ?export=<piece>[:slot] → download that piece's procedural shape as a GLB (see exportGlb)
    const exp = new URLSearchParams(window.location.search).get('export');
    if (exp) {
      const [pid, ...rest] = exp.split(':'); const which = rest.join(':');
      setTimeout(() => window.__modelExport(pid, which), 4500);   // after the sculpted parts have had time to arrive
    }
    api.current = {
      select: (id) => { const changed = id !== currentSel; applySelection(id); if (roam.on) { dirty = true; return; } const still = stillSelect === id; stillSelect = null; if (changed && id && !still) flyTo(id); if (changed && !id && !still) setFollow(true); dirty = true; },
      follow: () => { if (roam.on) return; setFollow(true); lastT = -1; },
      refocus: () => { if (roam.on) return; if (currentSel) flyTo(currentSel); else { setFollow(true); lastT = -1; } dirty = true; },
      modeChanged: () => { const free = !!MODES[modeRef.current]?.free; if (free !== roam.on) roamEnter(free); lastT = -1; if (!free) setFollow(true); dirty = true; },
      move: (key, on) => { if (key === 'jump') { if (on) jump(); return; } if (on) roam.keys.add(key); else roam.keys.delete(key); },
      teleport: (x, z, yaw, y) => { if (!roam.on) return; camera.position.x = x; camera.position.z = z; if (yaw != null) roam.yaw = yaw; if (y != null) roam.foot = y; roam.air = 0; roam.vy = 0; const gy = groundUnder(x, z, roam.foot + 3);   /* from just above the feet, so a roof overhead is not mistaken for the ground */ if (gy != null) { roam.foot = gy; camera.position.y = gy + ROAM_EYE; } aimCamera(); remember(); dirty = true; },   // for tests
      locked: () => locked,
      piece: (id) => byId(id),   // for tests
      pick: (nx = 0, ny = 0) => { ndc.set(nx, ny); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(pickables(), true).find((h) => h.object.visible); let o = hit?.object; while (o && !o.userData.id) o = o.parent; return { id: o?.userData.id || null, dist: hit?.distance, obj: hit?.object?.name, yaw: roam.yaw, pitch: roam.pitch }; },   // for tests: what the crosshair is on
      invalidate: () => { dirty = true; },
      roam: () => ({ on: roam.on, pos: camera.position.toArray(), foot: roam.foot, air: roam.air, vy: roam.vy, dist: roam.dist, avatar: avatar.visible ? avatar.position.toArray() : null, open: { ...roam.open }, frames: stats.frames, ms: stats.ms }),
      zoom: (d) => { roam.dist = Math.max(0, Math.min(DIST_MAX, d)); dirty = true; },   // for tests: the wheel's distance   // for tests
      go: (id, gate) => roam.on && roamGo(id, gate),
      reset: () => {   // back to the start, outside the great court's gate, every door and gate as at the first (fieldy: "a reset button")
        if (!roam.on) return;
        ROAM_MEMO = null; MEMO[model.id] = null; try { sessionStorage.removeItem(STORE); } catch { /* fine */ }
        camera.position.set(...ROAM_START.pos); const [lx, , lz] = ROAM_START.look; roam.yaw = Math.atan2(lz - camera.position.z, lx - camera.position.x); roam.pitch = 0;
        roam.air = 0; roam.vy = 0; roam.keys.clear(); roam.foot = camera.position.y - ROAM_EYE;
        const gy = groundUnder(camera.position.x, camera.position.z, camera.position.y + 2); if (gy != null) { roam.foot = gy; camera.position.y = gy + ROAM_EYE; }
        for (const k of Object.keys(roam.open)) roam.open[k] = roam.want[k] = openDefault(k);
        place(clock.t); aimCamera(); remember(); dirty = true;
      },
      marks: () => stairMarks.filter((m) => m.visible).map((m) => m.position.toArray().map((v) => Math.round(v * 10) / 10)),   // for tests: the stair marks shown
      bench: (n = 200) => { const t0 = performance.now(); for (let i = 0; i < n; i++) { probe.copy(camera.position); blocked(probe, step.set(Math.cos(i), 0, Math.sin(i)), 3); groundUnder(camera.position.x, camera.position.z, roam.foot + 3); } return (performance.now() - t0) / n; },   // for tests: ms per (ahead + down) probe pair
      solidTris: () => { const m = {}; for (const o of solids) { let q = o; while (q && !q.userData.id) q = q.parent; const k = q?.userData.id || o.name || 'proxy'; m[k] = (m[k] || 0) + Math.round((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3); } return m; },
    };
    window.__modelApi = window.__templeApi = api.current;
    applySelection(selected);
    if (MODES[modeRef.current]?.free) roamEnter(true);
    else if (selected) { flyTo(selected); if (flight) { flight.t0 -= flight.ms; stepFlight(performance.now()); } }

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onLookDown);
      renderer.domElement.removeEventListener('pointermove', onLookMove);
      renderer.domElement.removeEventListener('pointerup', onLookUp);
      renderer.domElement.removeEventListener('pointercancel', onLookUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onLockChange); document.removeEventListener('pointerlockerror', onLockError);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
      cross.remove(); stickEl.remove(); mmap.remove(); zoneEl.remove();
      controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.bumpMap?.dispose?.(); m.alphaMap?.dispose?.(); m.dispose?.(); }); });
      scene.environment?.dispose?.();
      composer.dispose?.(); outline.dispose?.();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { api.current?.select(selected); }, [selected]);
  const firstMode = useRef(true);
  useEffect(() => { if (firstMode.current) { firstMode.current = false; return; } api.current?.modeChanged(); }, [mode]);
  useEffect(() => { if (apiRef) apiRef.current = api.current; });

  return <div ref={wrap} className="st-gl" aria-label={`${model.title} in 3D — drag to look around, tap a part to read about it`} />;
}
