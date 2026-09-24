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
    // (a model may set its own levels: scene.lighting { sun, hemi } — a harder sun and a dimmer sky deepen the shadows and the contrast)
    const LIGHTING = { sun: 2.6, hemi: 0.85, ...(SC.lighting || {}) };
    const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x6b5a3e, LIGHTING.hemi); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3dc, LIGHTING.sun); sun.position.set(220, 300, 180); sun.castShadow = true;
    const sh = small ? 2048 : 4096; sun.shadow.mapSize.set(sh, sh);
    const R = SC.shadowR; sun.shadow.camera.left = -R; sun.shadow.camera.right = R; sun.shadow.camera.top = R; sun.shadow.camera.bottom = -R;
    sun.shadow.camera.near = 50; sun.shadow.camera.far = 800; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8;
    scene.add(sun); scene.add(sun.target);
    // The model's own lamps (the temple: the lampstands' light in the roofed hall, the oracle, the porch), each with a rule for
    // how bright it burns at t of the story (from the pieces' progress).
    const lights = {};
    for (const L of SC.lights) { const l = new THREE.PointLight(L.color, 0, L.distance, L.decay ?? 1.6); l.position.set(...L.pos); scene.add(l); lights[L.key] = l; }

    const world = new THREE.Group(); scene.add(world);
    const M = makeMaterials(model.MATERIALS);
    if (SC.earth) M.earth.color.set(SC.earth);   // the plain the model stands on, in the model's own tone
    M.earth.map.repeat.set(2800 / 16, 2800 / 16);   // the plain's mottle at 16 cubits a tile over the whole disc
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
    const lsDir = new THREE.Vector3(), lsRight = new THREE.Vector3(), lsUp = new THREE.Vector3(), lsUpWorld = new THREE.Vector3(0, 1, 0);
    function snapSun(target) {
      lsDir.copy(sunOffset).normalize(); lsRight.crossVectors(lsUpWorld, lsDir).normalize(); lsUp.crossVectors(lsDir, lsRight);   // the shadow camera's own axes (lookAt with y up)
      const texel = (2 * R) / sh;
      const a = Math.round(target.dot(lsRight) / texel) * texel, b = Math.round(target.dot(lsUp) / texel) * texel, c = target.dot(lsDir);
      sun.target.position.copy(lsRight).multiplyScalar(a).addScaledVector(lsUp, b).addScaledVector(lsDir, c);
      sun.position.copy(sun.target.position).add(sunOffset);
    }

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
      on: false, yaw: Math.PI, pitch: 0, body: Math.PI, foot: GROUND, keys: new Set(), glide: null, moving: false,   // yaw/pitch: where the EYE looks; body: which way the figure faces (his own way while being walked, the look otherwise)
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
    const PLAN_SKIP = new Set(['roof', 'floor', 'ceiling', 'slab', 'parapet', 'lining', 'rail', 'stair', 'pavement', 'paving', 'ground', 'terrace', 'base', 'ledge', 'border', 'beam', 'threshold', 'rug', 'bed', 'table', 'seat', 'couch', 'chest', 'jar', 'lampstand', 'tree', 'pool', 'inlay', 'vessel']);
    // what the feet may stand on, for the route finder's height field: the ground, terraces, bases, floors, stairs — and anything low
    // enough to step onto that names no role (a plain step); an upper storey's sketched slab, a roof, a lintel are not the ground under them
    const WALK_ROLES = new Set(['ground', 'terrace', 'base', 'pavement', 'paving', 'floor', 'stair', 'threshold', 'ledge', 'border', 'step']);
    const plan = [];   // { x0, x1, z0, z1 } walls (filled) and { x, z, r } rounds (pillars, the sea)
    const navWalk = [];   // { x0, x1, z0, z1, top } what can be walked on
    const navObs = [];    // everything else that stands in the way, whatever its height (a table, an altar's ledge, a wall), with its span
    const navDoors = [];  // every doorway and gate: { x, z, axis ('x': the opening lies along x), w, t (half the wall's thickness), y } — the route goes through them straight, on their axis
    const addDoor = (d) => {   // a doorway cut through a wall and its lining (or a gate and its threshold) are one door: joined into one span
      for (const e of navDoors) {
        if (e.axis !== d.axis || Math.abs(e.y - d.y) > 3) continue;
        const nA = e.axis === 'x' ? 'z' : 'x', uA = e.axis === 'x' ? 'x' : 'z';
        if (Math.abs(e[uA] - d[uA]) > 2 || Math.abs(e[nA] - d[nA]) > e.t + d.t + 1.5) continue;
        const lo = Math.min(e[nA] - e.t, d[nA] - d.t), hi = Math.max(e[nA] + e.t, d[nA] + d.t);
        e[nA] = (lo + hi) / 2; e.t = (hi - lo) / 2; e.w = Math.min(e.w, d.w); return;
      }
      navDoors.push(d);
    };
    const NAV_SKIP = new Set(SC.navSkip || []);   // pieces the route may ignore (a model's crowd, a proxy group)
    for (const piece of PIECES) {   // every piece feeds the route finder; only the plan's pieces are drawn on the map
      const onPlan = PLAN_PIECES.includes(piece.id);
      if (!onPlan && (NAV_SKIP.has(piece.id) || (SC.whole && piece.id === SC.whole.id) || (piece.modes && !piece.modes.includes('roam')))) continue;
      for (const part of cutGates(piece).parts) {
        const y0 = part.y ?? GROUND, y1 = y0 + (part.h ?? 3);
        const walkable = part.kind === 'box' && (WALK_ROLES.has(part.role) || (part.h <= 2.4 && !part.role)) && !(part.ideal && part.role === 'floor');
        if (walkable) navWalk.push({ x0: part.x - part.w / 2, x1: part.x + part.w / 2, z0: part.z - part.d / 2, z1: part.z + part.d / 2, top: y1 });
        else if (part.kind === 'box' && !['roof', 'ceiling', 'slab', 'rug', 'inlay'].includes(part.role)) {
          const R = { x0: part.x - part.w / 2, x1: part.x + part.w / 2, z0: part.z - part.d / 2, z1: part.z + part.d / 2, y0, y1 };
          if (part.doorway) { const dw = part.doorway.w, lintel = { y0: y0 + part.doorway.h, y1 }; addDoor({ x: part.x, z: part.z, axis: part.w < part.d ? 'z' : 'x', w: dw, t: Math.min(part.w, part.d) / 2, y: y0 }); if (part.w < part.d) navObs.push({ ...R, z1: part.z - dw / 2 }, { ...R, z0: part.z + dw / 2 }, { ...R, z0: part.z - dw / 2, z1: part.z + dw / 2, ...lintel }); else navObs.push({ ...R, x1: part.x - dw / 2 }, { ...R, x0: part.x + dw / 2 }, { ...R, x0: part.x - dw / 2, x1: part.x + dw / 2, ...lintel }); }
          else navObs.push(R);
          if (part.opening) addDoor({ ...part.opening });   // a partition's doorway (kit wallX/wallZ)
        } else if (part.kind === 'cyl' && part.r >= 0.4) navObs.push({ x: part.x, z: part.z, r: part.r, y0, y1 });
        else if (part.kind === 'base') navObs.push({ x0: part.x - part.w / 2, x1: part.x + part.w / 2, z0: part.z - part.w / 2, z1: part.z + part.w / 2, y0, y1: y0 + 4 });
        else if (part.kind === 'throne') navObs.push({ x0: part.x - 3, x1: part.x + 3, z0: part.z - 3, z1: part.z + 3, y0, y1: y0 + 6 });
        else if (part.kind === 'sea') navObs.push({ x: part.x, z: part.z, r: part.r + 1, y0, y1: y0 + 8 });
        else if (part.kind === 'pillar') navObs.push({ x: part.x, z: part.z, r: part.r * 1.4, y0, y1: y0 + part.h });
        else if (part.kind === 'cherub') navObs.push({ x: part.x, z: part.z, r: 2.4, y0, y1: y0 + (part.h || 10) });
        else if (part.kind === 'lampstand') navObs.push({ x: part.x, z: part.z, r: 0.8, y0, y1: y0 + (part.h || 3) });
        else if (part.kind === 'ark') navObs.push({ x0: part.x - 1.5, x1: part.x + 1.5, z0: part.z - 1, z1: part.z + 1, y0, y1: y0 + 3 });
        else if (part.kind === 'table') navObs.push({ x0: part.x - 1.2, x1: part.x + 1.2, z0: part.z - 0.8, z1: part.z + 0.8, y0, y1: y0 + 2 });
        if (!onPlan || PLAN_SKIP.has(part.role)) continue;
        // each thing keeps its height span: the map shows what stands at the walker's own level (a lintel over a gate, or an
        // upper storey's rooms, must not close a doorway on the ground)
        if (part.kind === 'box' && part.h >= 2.5) {
          const R = { x0: part.x - part.w / 2, x1: part.x + part.w / 2, z0: part.z - part.d / 2, z1: part.z + part.d / 2, y0, y1 };
          if (part.doorway) {   // a wall with a doorway cut through it: two flanks and the gap between (as builders' boxWithDoorway), so the way in is open on the map and to the route
            const dw = part.doorway.w, lintel = { y0: y0 + part.doorway.h, y1 };
            if (part.w < part.d) plan.push({ ...R, z1: part.z - dw / 2 }, { ...R, z0: part.z + dw / 2 }, { ...R, z0: part.z - dw / 2, z1: part.z + dw / 2, ...lintel });
            else plan.push({ ...R, x1: part.x - dw / 2 }, { ...R, x0: part.x + dw / 2 }, { ...R, x0: part.x - dw / 2, x1: part.x + dw / 2, ...lintel });
          } else plan.push(R);
        }
        else if (part.kind === 'cyl' && part.r >= 0.8 && part.h >= 2.5) plan.push({ x: part.x, z: part.z, r: part.r, y0, y1 });
        else if (part.kind === 'base') plan.push({ x0: part.x - part.w / 2, x1: part.x + part.w / 2, z0: part.z - part.w / 2, z1: part.z + part.w / 2, thin: true, y0, y1: y0 + 4 });
        else if (part.kind === 'throne') plan.push({ x0: part.x - 3, x1: part.x + 3, z0: part.z - 3, z1: part.z + 3, thin: true, y0, y1: y0 + 6 });
      }
    }
    // a gate's open leaves stand swung back along the jambs, still a little into the passage: the route keeps to its middle
    for (const piece of PIECES) for (const gate of piece.gates || []) {
      addDoor({ x: gate.x, z: gate.z, axis: gate.axis, w: gate.w, t: gate.t ?? 1, y: gate.y ?? GROUND });
      if (gate.leaves === false) continue;
      const gy = gate.y ?? GROUND, along = gate.axis === 'x', L = 2.6, D = 2.2;
      for (const sg of [-1, 1]) navObs.push(along
        ? { x0: gate.x + (sg > 0 ? gate.w / 2 - D : -gate.w / 2), x1: gate.x + (sg > 0 ? gate.w / 2 : -gate.w / 2 + D), z0: gate.z - L, z1: gate.z + L, y0: gy, y1: gy + 6 }
        : { x0: gate.x - L, x1: gate.x + L, z0: gate.z + (sg > 0 ? gate.w / 2 - D : -gate.w / 2), z1: gate.z + (sg > 0 ? gate.w / 2 : -gate.w / 2 + D), y0: gy, y1: gy + 6 });
    }
    plan.push(...SC.plan.extra);   // what the pieces' parts do not give (the temple: the yam (sea), Yakayan and Baiz)
    const PLAN_LABELS = SC.plan.labels;
    const MM_R = SC.plan.radius;   // amah shown from the centre to the edge
    // the whole model's extent, for the big map
    const EXT = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const r of [...plan, ...navWalk]) { const bx0 = r.r != null ? r.x - r.r : r.x0, bx1 = r.r != null ? r.x + r.r : r.x1, bz0 = r.r != null ? r.z - r.r : r.z0, bz1 = r.r != null ? r.z + r.r : r.z1; EXT.x0 = Math.min(EXT.x0, bx0); EXT.x1 = Math.max(EXT.x1, bx1); EXT.z0 = Math.min(EXT.z0, bz0); EXT.z1 = Math.max(EXT.z1, bz1); }
    for (const [lx, lz] of PLAN_LABELS) { EXT.x0 = Math.min(EXT.x0, lx - 10); EXT.x1 = Math.max(EXT.x1, lx + 10); EXT.z0 = Math.min(EXT.z0, lz - 10); EXT.z1 = Math.max(EXT.z1, lz + 10); }
    { const [sx, , sz] = ROAM_START.pos; EXT.x0 = Math.min(EXT.x0, sx); EXT.x1 = Math.max(EXT.x1, sx); EXT.z0 = Math.min(EXT.z0, sz); EXT.z1 = Math.max(EXT.z1, sz); const pad = 30; EXT.x0 -= pad; EXT.x1 += pad; EXT.z0 -= pad; EXT.z1 += pad; }

    // ── The route finder: a grid of one-cubit cells over the model, a height field of what can be stood on, and every wall that
    // stands at that height a block; A* between cells (a climb of more than a step is not a way; a drop is, but costs), then the
    // corners pulled straight. Built the first time a place is asked for.
    const STEP_MAX = 2.4, NAV_PAD = 0.8;   // a wall's margin on the grid: a three-cubit doorway must stay a way through
    let nav = null;
    function buildNav() {
      const x0 = Math.floor(EXT.x0), z0 = Math.floor(EXT.z0), W = Math.ceil(EXT.x1) - x0 + 1, Hn = Math.ceil(EXT.z1) - z0 + 1;
      const H = new Float32Array(W * Hn).fill(GROUND), block = new Uint8Array(W * Hn);
      // every cell whose CENTRE lies in [ax0, ax1] × [az0, az1] (a cell i covers x0 + i … x0 + i + 1)
      const cells = (ax0, ax1, az0, az1, fn) => { const i0 = Math.max(0, Math.floor(ax0 - x0)), i1 = Math.min(W - 1, Math.ceil(ax1 - x0)), j0 = Math.max(0, Math.floor(az0 - z0)), j1 = Math.min(Hn - 1, Math.ceil(az1 - z0)); for (let j = j0; j <= j1; j++) { const cz = z0 + j + 0.5; if (cz < az0 || cz > az1) continue; for (let i = i0; i <= i1; i++) { const cx = x0 + i + 0.5; if (cx < ax0 || cx > ax1) continue; fn(j * W + i, cx, cz); } } };
      for (const w of navWalk) cells(w.x0, w.x1, w.z0, w.z1, (k) => { if (w.top > H[k]) H[k] = w.top; });
      for (const r of [...navObs, ...SC.plan.extra]) {
        if (r.r != null) { const R = r.r + NAV_PAD; cells(r.x - R, r.x + R, r.z - R, r.z + R, (k, cx, cz) => { if (Math.hypot(cx - r.x, cz - r.z) <= R && r.y0 < H[k] + STEP_MAX && r.y1 > H[k] + 0.5) block[k] = 1; }); continue; }
        cells(r.x0 - NAV_PAD, r.x1 + NAV_PAD, r.z0 - NAV_PAD, r.z1 + NAV_PAD, (k) => { if (r.y0 < H[k] + STEP_MAX && r.y1 > H[k] + 0.5) block[k] = 1; });
      }
      // how far each open cell is from the nearest wall (to four): the route prefers the middle of a passage and the middle of a doorway
      const clear = new Uint8Array(W * Hn).fill(4); const q = [];
      for (let k = 0; k < W * Hn; k++) if (block[k]) { clear[k] = 0; q.push(k); }
      for (let h = 0; h < q.length; h++) { const c = q[h], d = clear[c]; if (d >= 4) continue; const ci = c % W, cj = (c / W) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= Hn) continue; const n = nj * W + ni; if (clear[n] > d + 1) { clear[n] = d + 1; q.push(n); } } }
      nav = { x0, z0, W, Hn, H, block, clear };
    }
    const cellOf = (x, z) => [Math.floor(x - nav.x0), Math.floor(z - nav.z0)];
    const inNav = (i, j) => i >= 0 && j >= 0 && i < nav.W && j < nav.Hn;
    /** may the feet go from cell a to cell b (a step up at most, any way down) */
    function passable(a, b) { if (nav.block[b]) return false; return nav.H[b] - nav.H[a] <= STEP_MAX; }
    function nearestFree(i, j) {
      if (inNav(i, j) && !nav.block[j * nav.W + i]) return [i, j];
      for (let r = 1; r < 40; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const ii = i + di, jj = j + dj; if (inNav(ii, jj) && !nav.block[jj * nav.W + ii]) return [ii, jj]; }
      return null;
    }
    function findRaw(ax, az, bx, bz) {
      if (!nav) buildNav();
      const clampC = ([i, j]) => [Math.max(0, Math.min(nav.W - 1, i)), Math.max(0, Math.min(nav.Hn - 1, j))];
      const A = nearestFree(...clampC(cellOf(ax, az))), B = nearestFree(...clampC(cellOf(bx, bz))); if (!A || !B) return null;
      const { W, Hn, H } = nav, N = W * Hn, start = A[1] * W + A[0], goal = B[1] * W + B[0];
      const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const heap = [], hk = [];   // a binary heap of [f, cell]
      const push = (f, c) => { heap.push(c); hk.push(f); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hk[p], hk[i]] = [hk[i], hk[p]]; i = p; } };
      const pop = () => { const c = heap[0], last = heap.pop(), lk = hk.pop(); if (heap.length) { heap[0] = last; hk[0] = lk; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hk[l] < hk[m]) m = l; if (r < heap.length && hk[r] < hk[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hk[m], hk[i]] = [hk[i], hk[m]]; i = m; } } return c; };
      const gi = goal % W, gj = (goal / W) | 0, heur = (c) => { const dx = Math.abs(c % W - gi), dz = Math.abs(((c / W) | 0) - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
      g[start] = 0; push(heur(start), start);
      const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
      let steps = 0;
      while (heap.length && steps++ < 400000) {
        const c = pop(); if (c === goal) break; if (closed[c]) continue; closed[c] = 1;
        const ci = c % W, cj = (c / W) | 0;
        for (const [di, dj, cost] of DIRS) {
          const ni = ci + di, nj = cj + dj; if (!inNav(ni, nj)) continue; const n = nj * W + ni; if (closed[n] || !passable(c, n)) continue;
          if (di && dj && (nav.block[cj * W + ni] || nav.block[nj * W + ci])) continue;   // no cutting a corner through a wall
          const drop = H[c] - H[n], nc = g[c] + cost * (1 + 2.5 * Math.max(0, 4 - nav.clear[n])) + (drop > STEP_MAX ? 6 + drop : 0);   // a drop is a way, but the stairs are a better one; a wall-hugging way costs more than the middle
          if (nc < g[n]) { g[n] = nc; from[n] = c; push(nc + heur(n), n); }
        }
      }
      if (from[goal] < 0 && goal !== start) return null;
      const cellsOut = []; for (let c = goal; c >= 0; c = from[c]) { cellsOut.push(c); if (c === start) break; } cellsOut.reverse();
      // pull the corners straight: keep a waypoint only where the straight line to the next kept one would cross a wall or a climb
      const onPath = new Set(cellsOut);
      const clear = (p, q) => { let i0 = p % W, j0 = (p / W) | 0; const i1 = q % W, j1 = (q / W) | 0; const di = Math.abs(i1 - i0), dj = Math.abs(j1 - j0), sx = i0 < i1 ? 1 : -1, sz = j0 < j1 ? 1 : -1; let err = di - dj, prev = p; for (;;) { const c = j0 * W + i0; if (c !== prev && (!passable(prev, c) || (nav.clear[c] < 3 && !onPath.has(c)))) return false; prev = c; if (i0 === i1 && j0 === j1) return true; const e2 = 2 * err; if (e2 > -dj) { err -= dj; i0 += sx; } if (e2 < di) { err += di; j0 += sz; } } };   // a straight line may not brush a wall the found way kept off
      const kept = [cellsOut[0]]; let anchor = 0;
      for (let k = 2; k < cellsOut.length; k++) if (!clear(cellsOut[anchor], cellsOut[k])) { kept.push(cellsOut[k - 1]); anchor = k - 1; }
      if (cellsOut.length > 1) kept.push(cellsOut[cellsOut.length - 1]);
      return kept.map((c) => [nav.x0 + (c % W) + 0.5, nav.z0 + ((c / W) | 0) + 0.5]);
    }
    /**
     * The route, taken through every doorway and gate on it squarely: the way is found, the doors it passes are read off it in
     * order, and it is found again leg by leg — to a point before each door on the door's own axis, straight through its middle,
     * to a point beyond — so he comes to a door face on and centred, never up its corner (fieldy).
     */
    const APPROACH = 4;   // cubits clear of the wall's face at which he lines up on the door
    function findPath(ax, az, bx, bz) {
      const raw = findRaw(ax, az, bx, bz); if (!raw || raw.length < 2) return raw;
      const crossed = [];   // [{ d, side, at }] in the order met
      const hits = (p, q, d) => {   // does the leg p → q cross the door d's line (its opening, a cubit wider each way)?
        const n = d.axis === 'x' ? [0, 1] : [1, 0], u = d.axis === 'x' ? [1, 0] : [0, 1];
        const sp = (p[0] - d.x) * n[0] + (p[1] - d.z) * n[1], sq = (q[0] - d.x) * n[0] + (q[1] - d.z) * n[1];
        if ((sp < 0) === (sq < 0) || sp === sq) return null;
        const f = sp / (sp - sq), cx = p[0] + f * (q[0] - p[0]), cz = p[1] + f * (q[1] - p[1]);
        const along = (cx - d.x) * u[0] + (cz - d.z) * u[1];
        if (Math.abs(along) > d.w / 2 + 1) return null;
        const [ci, cj] = cellOf(cx, cz); if (inNav(ci, cj) && Math.abs(nav.H[cj * nav.W + ci] - d.y) > 3) return null;   // a door on another storey
        return { side: sp < 0 ? -1 : 1, at: f };
      };
      for (let k = 0; k + 1 < raw.length; k++) {
        const legHits = [];
        for (const d of navDoors) { const h = hits(raw[k], raw[k + 1], d); if (h) legHits.push({ d, ...h }); }
        legHits.sort((a, b) => a.at - b.at); crossed.push(...legHits);
      }
      if (!crossed.length) return raw;
      const fixed = [[ax, az]];
      for (const { d, side } of crossed) {
        const n = d.axis === 'x' ? [0, 1] : [1, 0], r = d.t + APPROACH;
        fixed.push([d.x + side * n[0] * r, d.z + side * n[1] * r], [d.x - side * n[0] * r, d.z - side * n[1] * r]);
      }
      fixed.push([bx, bz]);
      const out = [];
      for (let k = 0; k + 1 < fixed.length; k++) {
        const leg = findRaw(fixed[k][0], fixed[k][1], fixed[k + 1][0], fixed[k + 1][1]);
        if (!leg) return raw;   // a leg that cannot be walked: the plain way, rather than none
        for (const p of leg) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 0.6) out.push(p);
      }
      return out.length > 1 ? out : raw;
    }

    // ── Being walked somewhere: the route as waypoints, followed on the walker's own feet (tryMove, so doors and steps hold);
    // any walking key or pad press cancels it and he stays where he is (fieldy); the mouse may still look about
    let auto = null;   // { path, i, label, dist0, still, lastD, gateTried }
    const autoEl = document.createElement('div'); autoEl.className = 'tp-autobar'; autoEl.hidden = true; el.appendChild(autoEl);
    function startAuto(x, z, label) {
      const path = findPath(camera.position.x, camera.position.z, x, z);
      if (!path || path.length < 2) { autoEl.hidden = false; autoEl.textContent = path ? 'You are there.' : 'No way there on foot from here.'; setTimeout(() => { if (!auto) autoEl.hidden = true; }, 2200); return false; }
      auto = { path, i: 1, label, dist0: roam.dist, still: 0, lastD: Infinity, tried: new Set() };
      roam.body = roam.yaw;   // the view stays as it was — first person walks first person (fieldy)
      autoEl.hidden = false; autoEl.innerHTML = `Walking to <b></b> · any walking key stops it`; autoEl.querySelector('b').textContent = label || 'the place';
      dirty = true; return true;
    }
    function cancelAuto() {
      if (!auto) return;
      auto = null; roam.keys.delete('run');
      autoEl.hidden = true; dirty = true; remember();
    }
    /** every shut gate and door with where it stands and the key that opens it */
    function shutThings() {   // each keyed opening at the MIDDLE of its passage (its leaves hang at the jambs either side)
      const acc = new Map(), p = new THREE.Vector3();
      const add = (key, node) => { node.getWorldPosition(p); const a = acc.get(key) || { key, x: 0, z: 0, n: 0 }; a.x += p.x; a.z += p.z; a.n++; acc.set(key, a); };
      for (const gs of gateSets) add(gs.key, gs.node);
      for (const ds of doorSets) { const key = model.roam.openKey ? model.roam.openKey(ds.open) : ds.open; if (!(key in roam.want)) continue; for (const l of ds.leaves) if (l.i === 0) add(key, l.node); }
      return [...acc.values()].map((a) => ({ key: a.key, x: a.x / a.n, z: a.z / a.n }));
    }
    /** how far a point lies from the route still ahead (the walker's feet through the coming waypoints) */
    function offRoute(a, x, z, reach) {
      let px = camera.position.x, pz = camera.position.z, along = 0, best = Infinity;
      for (let k = a.i; k < a.path.length && along < reach; k++) {
        const [qx, qz] = a.path[k], vx = qx - px, vz = qz - pz, L = Math.hypot(vx, vz) || 1e-6;
        const t = Math.max(0, Math.min(1, ((x - px) * vx + (z - pz) * vz) / (L * L)));
        best = Math.min(best, Math.hypot(px + vx * t - x, pz + vz * t - z));
        along += L; px = qx; pz = qz;
      }
      return best;
    }
    function autoStep(dt) {
      const a = auto, [tx, tz] = a.path[a.i], ex = camera.position.x, ez = camera.position.z;
      const dx = tx - ex, dz = tz - ez, d = Math.hypot(dx, dz);
      // a shut gate or door on the route is opened when he REACHES it: he stops before it, pauses a moment, it is asked open, and he
      // goes on once it stands open enough — so each opening is seen in its turn (fieldy)
      let wait = false;
      for (const t of shutThings()) {
        const dd = Math.hypot(t.x - ex, t.z - ez); if (dd > 5 || offRoute(a, t.x, t.z, 30) > 6) continue;
        if (roam.want[t.key] < 0.5) { a.pause = (a.pause || 0) + dt; if (a.pause >= 0.35) { roam.want[t.key] = 1; a.pause = 0; } wait = true; }
        else if (roam.open[t.key] < 0.7) wait = true;
      }
      if (wait) { roam.moving = false; roam.vel.x = roam.vel.z = 0; return; }
      if (d < 1.0) { a.i++; a.still = 0; a.lastD = Infinity; if (a.i >= a.path.length) { cancelAuto(true); return; } return; }
      const want = Math.atan2(dz, dx); let dy = want - roam.body; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      roam.body += Math.sign(dy) * Math.min(Math.abs(dy), 3.2 * dt);   // the figure turns to his way; the eye (the mouse) is free to look about
      const v = Math.min(d, WALK * dt), mx = dx / d * v, mz = dz / d * v;
      const before = Math.hypot(camera.position.x - tx, camera.position.z - tz);
      tryMove(mx, mz);
      const after = Math.hypot(camera.position.x - tx, camera.position.z - tz);
      if (before - after < v * 0.2) a.still += dt; else { a.still = 0; a.tried.clear(); }   // moving again: the next shut thing may be opened too
      if (a.still > 1.2) {   // held up: a shut gate or door near? open the nearest not yet tried; a waypoint right at it counts as reached
        let best = null, bd = 9;
        for (const gs of gateSets) { const p = new THREE.Vector3(); gs.node.getWorldPosition(p); const dd = Math.hypot(p.x - ex, p.z - ez); if (dd < bd && roam.want[gs.key] < 0.5 && !a.tried.has(gs.key)) { bd = dd; best = gs.key; } }
        for (const ds of doorSets) { const p = new THREE.Vector3(); ds.leaves[0]?.node.getWorldPosition(p); const dd = Math.hypot(p.x - ex, p.z - ez), key = model.roam.openKey ? model.roam.openKey(ds.open) : ds.open; if (dd < bd && key in roam.want && roam.want[key] < 0.5 && !a.tried.has(key)) { bd = dd; best = key; } }
        if (best) { roam.want[best] = 1; a.tried.add(best); a.still = 0; }
        else if (d < 3 && a.i < a.path.length - 1) { a.i++; a.still = 0; }   // close enough to a waypoint that cannot quite be reached: go on to the next
        else if (a.still > 4) cancelAuto(false);
      }
      const wantY = roam.foot + ROAM_EYE; camera.position.y += roam.air ? wantY - camera.position.y : (wantY - camera.position.y) * Math.min(1, dt * 10);
      roam.moving = true; roam.vel.x = mx / dt; roam.vel.z = mz / dt;
    }

    // ── The big map (M): the whole model, north up; its PLACES (MODEL.scene.plan.places, a tree: a building, and within it its
    // rooms) can be tapped — a place with parts within drills the map down into it, a room offers the walk to it; open ground
    // offers the walk to the spot. The mouse is handed back while the map is up (a locked pointer cannot press a button).
    let mapBig = false, mapView = null, mapHover = null;   // mapView: the place drilled into (null = the whole)
    const PLACES = SC.plan.places || [];
    const gotoEl = document.createElement('div'); gotoEl.className = 'tp-goto'; gotoEl.hidden = true; el.appendChild(gotoEl);
    const mapBar = document.createElement('div'); mapBar.className = 'tp-mapbar'; mapBar.hidden = true; el.appendChild(mapBar);
    let gotoAsk = null;   // { x, z, label }
    function setMapView(node) {
      mapView = node; mapHover = null; gotoEl.hidden = true; gotoAsk = null;
      mapBar.innerHTML = ''; const up = document.createElement('button'); up.type = 'button'; up.className = 'tp-mapbar-up'; up.textContent = node ? `↑ ${node.parent ? node.parent.label : 'whole map'}` : 'M closes';
      up.addEventListener('click', (e) => { e.stopPropagation(); if (mapView) setMapView(mapView.parent || null); else showBig(false); });
      const t = document.createElement('span'); t.textContent = node ? node.label : (model.title || 'the whole');
      mapBar.append(up, t); dirty = true;
    }
    (function link(nodes, parent) { for (const n of nodes) { n.parent = parent; if (n.children) link(n.children, n); } })(PLACES, null);
    function sizeBig() {   // square, by the stage's smaller side (a CSS percentage would take the width for one and the height for the other, and the picture would stretch)
      if (!mapBig) { mmap.style.removeProperty('width'); mmap.style.removeProperty('height'); return; }
      const size = Math.round(Math.min(el.clientWidth * 0.86, el.clientHeight * 0.88)); mmap.style.setProperty('width', `${size}px`, 'important'); mmap.style.setProperty('height', `${size}px`, 'important');
    }
    function showBig(on) {
      mapBig = on; mmap.classList.toggle('tp-map-big', on); mmap.style.pointerEvents = on ? 'auto' : ''; el.classList.toggle('tp-mapopen', on); mapBar.hidden = !on; sizeBig();
      if (on) { if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.(); setMapView(null); }
      else { gotoEl.hidden = true; gotoAsk = null; mapView = null; mapHover = null; }
      dirty = true;
    }
    function viewExt() {
      if (!mapView) return EXT;
      const b = mapView.bounds, m = Math.max(6, (b.x1 - b.x0) * 0.12, (b.z1 - b.z0) * 0.12);
      return { x0: b.x0 - m, x1: b.x1 + m, z0: b.z0 - m, z1: b.z1 + m };
    }
    function bigFrame(W) {   // the map's transform: world → pixels, north up, the view's extent fitted
      const E = viewExt(), ext = Math.max(E.x1 - E.x0, E.z1 - E.z0), S = W / ext;
      return { S, ox: W / 2 - (E.x0 + E.x1) / 2 * S, oz: W / 2 - (E.z0 + E.z1) / 2 * S };
    }
    const levelPlaces = () => (mapView ? mapView.children || [] : PLACES);
    const placeAt = (wx, wz) => { let best = null; for (const n of levelPlaces()) { const b = n.bounds; if (wx >= b.x0 && wx <= b.x1 && wz >= b.z0 && wz <= b.z1) { if (!best || (b.x1 - b.x0) * (b.z1 - b.z0) < (best.bounds.x1 - best.bounds.x0) * (best.bounds.z1 - best.bounds.z0)) best = n; } } return best; };
    const mapWorld = (e) => { const r = mmap.getBoundingClientRect(), dpr = mmap.width / r.width, px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr; const { S, ox, oz } = bigFrame(mmap.width); return { r, dpr, px, py, S, ox, oz, wx: (px - ox) / S, wz: (py - oz) / S }; };
    function askGo(e, x, z, label) {
      const { r } = mapWorld(e);
      gotoAsk = { x, z, label };
      gotoEl.innerHTML = '<span></span><button type="button" class="tp-goto-go">Go</button><button type="button" class="tp-goto-no">Cancel</button>';
      gotoEl.querySelector('span').textContent = label ? `Walk to ${label}?` : `Walk here (${Math.round(x)}, ${Math.round(z)})?`;
      gotoEl.style.left = `${Math.min(r.width - 230, Math.max(8, e.clientX - r.left + 8))}px`; gotoEl.style.top = `${Math.min(r.height - 44, Math.max(8, e.clientY - r.top + 8))}px`;
      gotoEl.hidden = false; dirty = true;
    }
    const onMapClick = (e) => {
      if (!mapBig || !roam.on) return;
      e.stopPropagation();
      const { dpr, px, py, S, ox, oz, wx, wz } = mapWorld(e);
      const n = placeAt(wx, wz);
      if (n && n.children?.length) { setMapView(n); return; }   // a building: look inside it
      if (n) { const [ax, az] = n.at || [(n.bounds.x0 + n.bounds.x1) / 2, (n.bounds.z0 + n.bounds.z1) / 2]; askGo(e, ax, az, n.label); return; }
      let label = null, bd = 14 * dpr, lx = wx, lz = wz;
      if (!mapView) for (const [x, z, t] of PLAN_LABELS) { const d = Math.hypot(x * S + ox - px, z * S + oz - py); if (d < bd) { bd = d; label = t; lx = x; lz = z; } }
      askGo(e, lx, lz, label);
    };
    const onMapMove = (e) => { if (!mapBig) return; const { wx, wz } = mapWorld(e); const n = placeAt(wx, wz); if (n !== mapHover) { mapHover = n; mmap.style.cursor = n ? 'pointer' : 'crosshair'; dirty = true; } };
    mmap.addEventListener('click', onMapClick); mmap.addEventListener('pointermove', onMapMove);
    // the clicks on the map must not fall through to the view (a pick, or taking the mouse)
    mmap.addEventListener('pointerdown', (e) => { if (mapBig) e.stopPropagation(); });
    mmap.addEventListener('pointerup', (e) => { if (mapBig) e.stopPropagation(); });
    for (const q of [gotoEl, mapBar]) { q.addEventListener('pointerdown', (e) => e.stopPropagation()); q.addEventListener('pointerup', (e) => e.stopPropagation()); }
    gotoEl.addEventListener('click', (e) => {
      e.stopPropagation(); const go = e.target.closest('.tp-goto-go');
      if (go && gotoAsk) { if (startAuto(gotoAsk.x, gotoAsk.z, gotoAsk.label)) showBig(false); }
      else if (e.target.closest('.tp-goto-no')) { gotoEl.hidden = true; gotoAsk = null; dirty = true; }
    });

    function drawMinimap() {
      const css = mmap.clientWidth || 170, dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(css * dpr);
      if (mmap.width !== W) { mmap.width = mmap.height = W; }
      const g = mmap.getContext('2d'); if (!g) return;
      const px = camera.position.x, pz = camera.position.z;
      const big = mapBig, S = big ? bigFrame(W).S : W / (2 * MM_R), a = big ? 0 : -(roam.yaw + Math.PI / 2);
      const { ox, oz } = big ? bigFrame(W) : { ox: 0, oz: 0 };
      // world → map pixels (the small map turns with him, centred on him; the big one is fixed, north up)
      const ca = Math.cos(a), sa = Math.sin(a);
      const P = (x, z) => big ? [x * S + ox, z * S + oz] : [W / 2 + ((x - px) * ca - (z - pz) * sa) * S, W / 2 + ((x - px) * sa + (z - pz) * ca) * S];
      g.clearRect(0, 0, W, W);
      g.save(); g.beginPath(); g.roundRect(0, 0, W, W, 10 * dpr); g.clip();
      g.fillStyle = big ? 'rgba(14, 11, 8, 0.9)' : 'rgba(14, 11, 8, 0.78)'; g.fillRect(0, 0, W, W);
      g.save();
      if (big) { g.translate(ox, oz); g.scale(S, S); } else { g.translate(W / 2, W / 2); g.rotate(a); g.scale(S, S); g.translate(-px, -pz); }
      // the grid, faint (twenty cubits; fifty on the big map)
      const G = big ? 50 : 20, gx0 = Math.floor(EXT.x0 / G) * G, gz0 = Math.floor(EXT.z0 / G) * G;
      g.strokeStyle = 'rgba(255, 208, 98, 0.08)'; g.lineWidth = 0.6 / S;
      for (let k = gx0; k <= EXT.x1; k += G) { g.beginPath(); g.moveTo(k, EXT.z0); g.lineTo(k, EXT.z1); g.stroke(); }
      for (let k = gz0; k <= EXT.z1; k += G) { g.beginPath(); g.moveTo(EXT.x0, k); g.lineTo(EXT.x1, k); g.stroke(); }
      g.fillStyle = 'rgba(255, 208, 98, 0.55)';
      const lo = roam.foot + 0.5, hi = roam.foot + 2.5;   // what stands at his level
      const groundAt = (x, z) => { if (!nav) buildNav(); const [i, j] = cellOf(x, z); return inNav(i, j) ? nav.H[j * nav.W + i] : GROUND; };
      for (const r of plan) {
        if (big) { const gy = groundAt(r.r != null ? r.x : (r.x0 + r.x1) / 2, r.r != null ? r.z : (r.z0 + r.z1) / 2); if (r.y0 > gy + 2.5 || r.y1 < gy + 0.5) continue; }   // the big map: every wall standing on its own ground
        else if (r.y0 > hi || r.y1 < lo) continue;
        if (r.r != null) { g.beginPath(); g.arc(r.x, r.z, r.r, 0, Math.PI * 2); g.fill(); continue; }
        if (!big && (r.x1 - px < -MM_R * 1.5 || r.x0 - px > MM_R * 1.5 || r.z1 - pz < -MM_R * 1.5 || r.z0 - pz > MM_R * 1.5)) continue;
        g.globalAlpha = r.thin ? 0.6 : 1; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); g.globalAlpha = 1;
      }
      // the stairs' marks
      g.fillStyle = '#ffd062';
      for (const m of stairMarks) if (m.userData.foot) { g.beginPath(); g.arc(m.position.x, m.position.z, 1.4, 0, Math.PI * 2); g.fill(); }
      g.restore();
      // the places that can be tapped: this level's, outlined; the one under the pointer filled; the whole's labels stay
      if (big) {
        for (const n of levelPlaces()) {
          const b = n.bounds, [x0, y0] = P(b.x0, b.z0), [x1, y1] = P(b.x1, b.z1), hov = n === mapHover;
          g.setLineDash(hov ? [] : [4 * dpr, 3 * dpr]); g.lineWidth = (hov ? 2 : 1) * dpr; g.strokeStyle = hov ? '#ffd062' : 'rgba(255, 208, 98, 0.45)';
          if (hov) { g.fillStyle = 'rgba(255, 208, 98, 0.14)'; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
          g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
          if (mapView || hov) {   // its name, shortened to what fits its box (the whole name under the pointer)
            g.font = `${Math.round((hov ? 12 : 11) * dpr)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
            let t = n.short || n.label; { const room = Math.abs(x1 - x0) - 6 * dpr; while (t.length > 2 && g.measureText(t).width > room) { const cut = t.lastIndexOf(' ', t.length - 2); t = (cut > 2 ? t.slice(0, cut) : t.slice(0, -2)) + '…'; } }   // what fits its box; the whole name goes in the footer
            g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(14, 11, 8, 0.85)'; g.strokeText(t, (x0 + x1) / 2, (y0 + y1) / 2); g.fillStyle = hov ? '#ffd062' : '#f3e3b8'; g.fillText(t, (x0 + x1) / 2, (y0 + y1) / 2);
          }
          if (n.children?.length) { g.font = `${Math.round(9 * dpr)}px system-ui, sans-serif`; g.fillStyle = 'rgba(255, 208, 98, 0.8)'; g.textAlign = 'right'; g.fillText('▸', x1 - 3 * dpr, y0 + 8 * dpr); g.textAlign = 'center'; }
        }
      }
      // the route he is being led on: a gold line from his feet through the waypoints, arrows along it pointing the way
      if (auto) {
        const pts = [[px, pz], ...auto.path.slice(auto.i)].map(([x, z]) => P(x, z));
        g.lineWidth = 2 * dpr; g.strokeStyle = 'rgba(255, 208, 98, 0.9)'; g.lineJoin = 'round'; g.lineCap = 'round';
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        g.fillStyle = '#ffd062'; const step = 22 * dpr, ah = 5 * dpr; let carry = step * 0.5;
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0); if (L < 1e-3) continue; const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
          for (let t = carry; t < L; t += step) { const x = x0 + ux * t, y = y0 + uy * t; g.beginPath(); g.moveTo(x + ux * ah, y + uy * ah); g.lineTo(x - uy * ah * 0.7, y + ux * ah * 0.7); g.lineTo(x + uy * ah * 0.7, y - ux * ah * 0.7); g.closePath(); g.fill(); }
          carry = ((carry - L) % step + step) % step;
        }
        const [ex, ey] = pts[pts.length - 1]; g.beginPath(); g.arc(ex, ey, 4 * dpr, 0, Math.PI * 2); g.fillStyle = '#fff3c4'; g.fill(); g.strokeStyle = '#8a6716'; g.lineWidth = 1.5 * dpr; g.stroke();
      }
      // labels stay upright (the big map: all of them, larger)
      g.font = `${Math.round((big ? 11 : 9) * dpr)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [lx, lz, t] of PLAN_LABELS) {
        if (!big && Math.hypot(lx - px, lz - pz) > MM_R * 1.25) continue;
        if (big && mapView) continue;   // drilled in: the place's own names
        if (big && mapHover && lx >= mapHover.bounds.x0 && lx <= mapHover.bounds.x1 && lz >= mapHover.bounds.z0 && lz <= mapHover.bounds.z1) continue;   // the hovered place shows its own name
        const [sx, sy] = P(lx, lz);
        g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(14, 11, 8, 0.85)'; g.strokeText(t, sx, sy); g.fillStyle = big && gotoAsk?.label === t ? '#ffd062' : '#f3e3b8'; g.fillText(t, sx, sy);
      }
      if (big && gotoAsk && !gotoAsk.label) { const [sx, sy] = P(gotoAsk.x, gotoAsk.z); g.beginPath(); g.arc(sx, sy, 5 * dpr, 0, Math.PI * 2); g.strokeStyle = '#ffd062'; g.lineWidth = 2 * dpr; g.stroke(); }
      // north, at the rim
      { const nx = big ? 0 : -sa * -1, ny = big ? -1 : ca * -1; const rx = W / 2 + nx * (W / 2 - 9 * dpr), ry = W / 2 + ny * (W / 2 - 9 * dpr); g.font = `bold ${Math.round(10 * dpr)}px system-ui, sans-serif`; g.fillStyle = '#ffd062'; g.fillText('N', rx, ry); }
      if (big) { g.font = `${Math.round(10 * dpr)}px system-ui, sans-serif`; g.fillStyle = mapHover ? '#ffd062' : '#c9b98a'; g.textAlign = 'left'; g.fillText(mapHover ? mapHover.label : mapView ? 'tap a room to be walked into it · Esc goes up' : 'tap a building to look inside it, a place or the ground to be walked there · M closes', 10 * dpr, W - 10 * dpr); g.textAlign = 'center'; }
      // the walker: at the centre, his way up (the small map); where he stands, turned his way (the big one)
      const [wx, wy] = big ? P(px, pz) : [W / 2, W / 2], wa = big ? roam.yaw + Math.PI / 2 : 0;
      g.save(); g.translate(wx, wy); g.rotate(wa);
      g.fillStyle = '#fff3c4'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.moveTo(0, -7 * dpr); g.lineTo(5 * dpr, 5 * dpr); g.lineTo(0, 2.5 * dpr); g.lineTo(-5 * dpr, 5 * dpr); g.closePath(); g.fill(); g.stroke();
      g.restore();
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
      if (auto && !roam.air) { autoStep(dt); aimCamera(); remember(); return true; }
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
      renderer.domElement.style.cursor = on ? 'crosshair' : 'grab'; mmap.hidden = !on; zoneEl.hidden = !(on && COARSE); if (!on) { touches.clear(); pinch = null; cancelAuto(false); showBig(false); }
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
        if (auto) cancelAuto(false);
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
    const onKeyDown = (e) => {
      if (!roam.on || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.code === 'KeyM' && !e.repeat) { e.preventDefault(); showBig(!mapBig); return; }   // the whole map
      if (e.code === 'Escape' && mapBig) { if (mapView) setMapView(mapView.parent || null); else showBig(false); return; }
      const k = KEYMAP[e.code]; if (!k) return; e.preventDefault();
      if (k === 'jump') { if (!e.repeat) jump(); return; }
      if (auto && k !== 'run') cancelAuto(false);   // a walking key of his own: the route is dropped, he stays where he is
      roam.keys.add(k);
    };
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
      // — moved in whole shadow-map texels (in the light's own frame), else the map's grid slides under the scene with every
      // move of the eye and the shading of a wall shimmers and swims (fieldy: "things fade in and out depending on how I look")
      snapSun(controls.target);
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
        avatar.position.set(avatarEye.x, roam.foot + bob, avatarEye.z); avatar.rotation.set(0, -(auto ? roam.body : roam.yaw), 0);
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
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; sizeBig();
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
      move: (key, on) => { if (key === 'jump') { if (on) jump(); return; } if (on && auto && key !== 'run') cancelAuto(false); if (on) roam.keys.add(key); else roam.keys.delete(key); },
      goTo: (x, z, label) => roam.on && startAuto(x, z, label),   // walk him to a place (the big map's Go); also for tests
      auto: () => (auto ? { i: auto.i, n: auto.path.length, path: auto.path, label: auto.label } : null),
      map: (on) => { if (roam.on) showBig(on ?? !mapBig); return mapBig; },
      mapPoint: (x, z) => { const r = mmap.getBoundingClientRect(), { S, ox, oz } = bigFrame(mmap.width), k = r.width / mmap.width; return [r.left + (x * S + ox) * k, r.top + (z * S + oz) * k]; },   // for tests: where a world point lies on the big map
      mapView: (label) => { const find = (ns) => { for (const n of ns) { if (n.label === label) return n; const c = n.children && find(n.children); if (c) return c; } return null; }; setMapView(label ? find(PLACES) : null); return mapView?.label || null; },   // for tests
      route: (ax, az, bx, bz) => findPath(ax, az, bx, bz),   // for tests
      look: (dx, dy = 0) => turnHead(dx, dy),   // for tests: the mouse turning the head
      body: () => roam.body,
      shut: () => shutThings().map((t) => ({ ...t, off: auto ? offRoute(auto, t.x, t.z, 60) : null, open: roam.open[t.key] })),   // for tests
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
        cancelAuto(false); showBig(false);
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
      cross.remove(); stickEl.remove(); mmap.remove(); zoneEl.remove(); gotoEl.remove(); autoEl.remove(); mapBar.remove();
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
