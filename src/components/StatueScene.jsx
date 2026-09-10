/**
 * StatueScene.jsx — the statue of Daniel 2 in WebGL (three.js): lit metals,
 * the stone in the air, the strike, the shards, the chaff on the wind, and the
 * mountain. Everything it draws comes from lib/models/statue.js — this file
 * only turns that timeline into meshes, so the 2D sheet and this scene never
 * disagree.
 *
 * Imported lazily by pages/Statue.jsx so three.js (~150 KB gzipped) is fetched
 * only when the 3D view is shown, the way maplibre-gl is on the map.
 *
 * Rendering is on demand: frames are drawn only while the animation is playing,
 * the orbit is moving, or something changed — a phone holding the page still
 * spends no battery on it. The environment is three's own RoomEnvironment (no
 * texture download, self-contained like everything else in Maps & Models).
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PIECES, STONE, MATERIALS, H_TOTAL, HIT, KING_BANDS, bandOf,
  stoneAt, mountainAt, cameraAt, makeShards, shardAt, pieceWholeAt, makeDust, dustAt,
} from '../lib/models/statue.js';

const KING_URL = '/api/models/statue.glb';
const STONE_URL = '/api/models/stone.glb';        // the aban, sculpted — absent → the procedural rock
const MOUNTAIN_URL = '/api/models/mountain.glb';  // the tawar, sculpted — absent → the procedural cone   // the sculpted king (fieldy's own asset, generated in Meshy on a paid plan); absent → the procedural figure stays
const SKY = 0x1a1a24;       // a night sky, the dream's own hour — one look in both themes
const GROUND = 0x3a3329;
const GOLD_GLOW = new THREE.Color(0xffc857);

function stdMaterial(key) {
  const m = MATERIALS[key];
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(m.color), metalness: m.metal, roughness: m.rough });
}

const UP = new THREE.Vector3(0, 1, 0);
function meshFor(part, material) {
  let geo, mesh;
  if (part.kind === 'lathe') {
    geo = new THREE.LatheGeometry(part.profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), 56);
    mesh = new THREE.Mesh(geo, material);
    mesh.position.set(part.x, 0, part.z || 0);
    mesh.scale.set(part.sx || 1, 1, part.sz || 1);
  } else if (part.kind === 'capsule') {
    const a = new THREE.Vector3(...part.a), b = new THREE.Vector3(...part.b), d = b.clone().sub(a), len = d.length();
    geo = new THREE.CapsuleGeometry(part.r, len, 6, 28);
    mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  } else {
    if (part.kind === 'sphere') geo = new THREE.SphereGeometry(part.r, 40, 28);
    else if (part.kind === 'cylinder') geo = new THREE.CylinderGeometry(part.r, part.r * 0.94, part.h, 36);
    else geo = new THREE.BoxGeometry(part.w, part.h, part.d, 1, 1, 1);
    mesh = new THREE.Mesh(geo, material);
    mesh.position.set(part.x, part.kind === 'sphere' ? part.y : part.y + part.h / 2, part.z || 0);
  }
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/** A rough, irregular stone: an icosahedron with its vertices jostled (deterministically). */
function stoneGeometry(r, detail = 2, seed = 5) {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const pos = geo.attributes.position;
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const v = new THREE.Vector3();
  const bumps = [];
  for (let i = 0; i < 9; i++) bumps.push(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(r));
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let k = 1;
    for (const b of bumps) { const d = v.distanceTo(b); k += Math.max(0, 0.55 - d / r) * 0.5; }
    v.multiplyScalar(k * (0.92 + 0.08 * Math.sin(v.x * 9) * Math.cos(v.z * 7)));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A mountain: a cone with ridges and shoulders, unit-sized (radius 1, height 1), grown by scale. */
function mountainGeometry(seed = 17) {
  const geo = new THREE.ConeGeometry(1, 1, 64, 18, false);
  geo.translate(0, 0.5, 0);                        // base on the ground
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x), h = v.y;
    const rr = Math.hypot(v.x, v.z);
    if (rr < 1e-4) continue;
    const ridge = 1 + 0.16 * Math.sin(a * 5 + seed) + 0.09 * Math.sin(a * 11 + h * 9) + 0.05 * Math.sin(a * 23 - h * 17);
    const shoulder = 1 + 0.12 * Math.sin(h * 6.3 + a * 2) * (1 - h);
    const k = ridge * shoulder;
    pos.setXYZ(i, v.x * k, h + 0.03 * Math.sin(a * 7 + seed) * (1 - h), v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A sculpted prop (the stone, the mountain): load the GLB, keep its own textured
 * materials if the sculptor gave it any (a Meshy texture pass), else use `fallbackMat`,
 * and normalise it into a unit frame the timeline already understands:
 *   'stone'    → centred on its bounding-sphere centre, radius = STONE.r
 *   'mountain' → base cut flat on y = 0, height 1, footprint radius 1 (place() scales it)
 * Returns a Group (castShadow set on every mesh) or null.
 */
async function loadProp(url, kind, fallbackMat, tag) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let gltf;
  try { gltf = await loader.loadAsync(url); } catch (e) { if (e?.message && !/404/.test(e.message)) console.warn(`[statue] sculpted ${tag} not loaded:`, e.message || e); return null; }
  try {
    const root = gltf.scene; root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const group = new THREE.Group();
    root.traverse((m) => {
      if (!m.isMesh) return;
      const textured = m.material && (m.material.map || m.material.normalMap);
      const mesh = new THREE.Mesh(m.geometry, textured ? m.material : fallbackMat);
      if (textured) { m.material.metalness = 0; m.material.roughness = Math.max(0.85, m.material.roughness ?? 1); m.material.envMapIntensity = 0.45; }   // matte: the room light would wash a painted prop out
      mesh.applyMatrix4(m.matrixWorld);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    });
    if (kind === 'stone') {
      const r = Math.max(size.x, size.y, size.z) / 2;
      const k = STONE.r / r;
      group.children.forEach((m) => { m.position.sub(centre).multiplyScalar(k); m.scale.multiplyScalar(k); });
    } else {
      // Base at y = 0 (whatever sat below the lowest 2% of the height is treated as the flat bottom).
      const k = 1 / size.y, rf = 1 / (Math.max(size.x, size.z) / 2);
      group.children.forEach((m) => {
        m.position.set((m.position.x - centre.x) * rf, (m.position.y - box.min.y) * k, (m.position.z - centre.z) * rf);
        m.scale.set(m.scale.x * rf, m.scale.y * k, m.scale.z * rf);
      });
    }
    group.userData.id = 'stone';
    return group;
  } catch (e) { console.warn(`[statue] sculpted ${tag} failed:`, e); return null; }
}

/**
 * The sculpted king: load the GLB, stand it on the ground at the statue's height,
 * and cut it into the five pieces by height — every triangle goes to the band its
 * centre falls in, so it does not matter how the sculptor organised the mesh, and
 * each band gets OUR metal (the GLB's own textures are ignored). The feet band is
 * "mingled": alternating stripes across the foot are iron, the rest clay.
 * Returns { groups: Map<id, Group>, samplers: Map<id, fn> } or null if unavailable.
 */
async function loadKing(mats) {
  try { return await loadKingInner(mats); } catch (e) { console.warn('[statue] sculpted king failed:', e); return null; }
}
async function loadKingInner(mats) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let gltf;
  try { gltf = await loader.loadAsync(KING_URL); } catch (e) { if (e?.message && !/404/.test(e.message)) console.warn('[statue] sculpted king not loaded:', e.message || e); return null; }
  const root = gltf.scene; root.updateMatrixWorld(true);
  // Gather every triangle in world space.
  const tris = [];   // flat xyz of 9 numbers per triangle
  root.traverse((m) => {
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const pos = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); tris.push(v.x, v.y, v.z); }
    if (g !== m.geometry) g.dispose();
  });
  if (tris.length < 9) return null;
  // Normalise: feet on the ground, cap at H_TOTAL, centred on x/z.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < tris.length; i += 3) { const x = tris[i], y = tris[i + 1], z = tris[i + 2]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  const h = maxY - minY, k = H_TOTAL / h, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  for (let i = 0; i < tris.length; i += 3) { tris[i] = (tris[i] - cx) * k; tris[i + 1] = (tris[i + 1] - minY) * k; tris[i + 2] = (tris[i + 2] - cz) * k; }
  // Split by band; feet get a second bucket for the iron stripes.
  const buckets = Object.fromEntries(Object.keys(KING_BANDS).map((id) => [id, []]));
  buckets.feetIron = [];
  for (let i = 0; i < tris.length; i += 9) {
    const cy = (tris[i + 1] + tris[i + 4] + tris[i + 7]) / 3;
    const id = bandOf(cy / H_TOTAL);
    let key = id;
    if (id === 'feet') { const cxx = (tris[i] + tris[i + 3] + tris[i + 6]) / 3; if (Math.floor((cxx + 10) * 7) % 2 === 0) key = 'feetIron'; }
    for (let j = 0; j < 9; j++) buckets[key].push(tris[i + j]);
  }
  const groups = new Map(), samplers = new Map();
  for (const piece of PIECES) {
    const g = new THREE.Group(); g.userData.id = piece.id;
    const add = (arr, mat) => {
      if (!arr.length) return;
      let geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      geo = mergeVertices(geo, 1e-4);      // weld the triangle soup back together so the normals are smooth, not faceted
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
    };
    add(buckets[piece.id], mats[piece.material]);
    if (piece.id === 'feet') add(buckets.feetIron, mats.iron);
    groups.set(piece.id, g);
    const pts = piece.id === 'feet' ? buckets.feet.concat(buckets.feetIron) : buckets[piece.id];
    const n = pts.length / 3;
    samplers.set(piece.id, (r) => { const i = Math.floor(r() * n) * 3; return [pts[i] * 0.92, pts[i + 1], pts[i + 2] * 0.92]; });
  }
  return { groups, samplers };
}

export default function StatueScene({ clock, selected, onSelect, onReady, tagsRef }) {
  const wrap = useRef(null);
  const api = useRef(null);

  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { onReady?.(false, e); return undefined; }
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;   // a phone: lighter on the GPU and the battery
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 22, 60);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    camera.position.set(8.5, 5.2, 13.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 3.6, 0);
    controls.enablePan = false;
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 2.5; controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;   // never below the ground
    controls.update();

    // Light: a low moon from the statue's left-front, a soft fill from the sky.
    scene.add(new THREE.HemisphereLight(0xcfd6ff, 0x2a2419, 0.55));
    const moon = new THREE.DirectionalLight(0xfff1d6, 2.2);
    moon.position.set(-7, 12, 9);
    moon.castShadow = true;
    const shadowPx = small ? 1024 : 2048;
    moon.shadow.mapSize.set(shadowPx, shadowPx);
    moon.shadow.camera.left = -12; moon.shadow.camera.right = 12; moon.shadow.camera.top = 14; moon.shadow.camera.bottom = -4;
    moon.shadow.camera.near = 1; moon.shadow.camera.far = 40; moon.shadow.bias = -0.0008;
    scene.add(moon);
    const rim = new THREE.DirectionalLight(0x6f86ff, 0.6); rim.position.set(9, 6, -8); scene.add(rim);

    const world = new THREE.Group(); scene.add(world);

    // Ground: a wide dark plain fading into the fog.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: GROUND, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.7, 96), new THREE.MeshBasicMaterial({ color: 0x5a4f3c, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; world.add(ring);

    // ── Pieces ──────────────────────────────────────────────────────────────
    const mats = Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, stdMaterial(k)]));
    let pieceGroups = new Map();
    let shardSets = [];
    // Nothing of the figure or the stone is drawn until the sculpted file has either
    // arrived or been found missing — otherwise the procedural stand-ins flash for the
    // half-second the GLBs take to download on every fresh load.
    let figureReady = false, stoneReady = false;
    const disposeGroup = (g) => { world.remove(g); g.traverse((o) => { o.geometry?.dispose?.(); if (o.userData.ownMat) o.material.dispose?.(); }); };
    // Build the figure: the procedural king now; the sculpted one replaces it when its file arrives.
    function buildFigure(groups, samplers) {
      for (const g of pieceGroups.values()) disposeGroup(g);
      for (const { shards } of shardSets) for (const { mesh } of shards) { world.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
      pieceGroups = groups; shardSets = [];
      for (const piece of PIECES) {
        world.add(groups.get(piece.id));
        // Shards: ~26 small meshes per piece, placed by the shared timeline.
        const shards = makeShards(piece, 26, 7, samplers?.get(piece.id) || null).map((s) => {
          const geo = s.size > 0.3 ? new THREE.DodecahedronGeometry(s.size * 0.55, 0) : new THREE.BoxGeometry(s.size, s.size * 0.7, s.size * 0.8);
          const m = mats[s.material].clone(); m.transparent = true;
          const mesh = new THREE.Mesh(geo, m);
          mesh.castShadow = true; mesh.visible = false;
          world.add(mesh);
          return { s, mesh, axis: new THREE.Vector3(...s.spinAxis).normalize() };
        });
        shardSets.push({ piece, shards });
      }
    }
    const proceduralGroups = new Map();
    for (const piece of PIECES) {
      const g = new THREE.Group(); g.userData.id = piece.id;
      for (const part of piece.parts) g.add(meshFor(part, mats[part.mixed ? 'clay' : piece.material]));
      for (const part of piece.iron || []) g.add(meshFor(part, mats.iron));
      for (const part of piece.toes || []) g.add(meshFor(part, mats[part.material]));
      proceduralGroups.set(piece.id, g);
    }
    buildFigure(proceduralGroups, null);

    // ── Stone + mountain ────────────────────────────────────────────────────
    const stoneMat = stdMaterial('stone');
    let stone = new THREE.Mesh(stoneGeometry(STONE.r), stoneMat);
    stone.castShadow = true; stone.userData.id = 'stone'; world.add(stone);
    const mountainMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x7a4a2c), metalness: 0, roughness: 0.98, flatShading: true, envMapIntensity: 0.35 });   // the same jasper stone, weathered
    let mountain = new THREE.Mesh(mountainGeometry(), mountainMat);
    mountain.castShadow = true; mountain.receiveShadow = true; mountain.userData.id = 'stone'; mountain.visible = false;
    world.add(mountain);

    // ── Chaff on the wind ───────────────────────────────────────────────────
    const dust = makeDust();
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dust.length * 3);
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({ color: 0xd9c9a0, size: 0.07, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
    const dustPts = new THREE.Points(dustGeo, dustMat); dustPts.visible = false; dustPts.frustumCulled = false; world.add(dustPts);

    // ── Per-frame placement from the timeline ───────────────────────────────
    const q = new THREE.Quaternion();
    function place(t) {
      for (const [id, g] of pieceGroups) g.visible = figureReady && pieceWholeAt(PIECES.find((p) => p.id === id), t);
      for (const { piece, shards } of shardSets) {
        for (const { s, mesh, axis } of shards) {
          const a = shardAt(piece, s, t);
          mesh.visible = figureReady && a.visible;
          if (!a.visible) continue;
          mesh.position.set(a.x, a.y, a.z);
          q.setFromAxisAngle(axis, a.rot); mesh.quaternion.copy(q);
          mesh.scale.setScalar(a.scale);
          mesh.material.opacity = a.alpha;
        }
      }
      const st = stoneAt(t);
      stone.visible = stoneReady && st.visible;
      const sh = st.shake || 0;   // the tremor: a growing jitter in place, a pulse in size
      stone.position.set(st.x + Math.sin(t * 97) * 0.05 * sh, st.y + Math.abs(Math.sin(t * 131)) * 0.05 * sh, st.z + Math.cos(t * 113) * 0.05 * sh);
      stone.rotation.set(st.spin * 0.7 + Math.sin(t * 121) * 0.06 * sh, st.spin + Math.cos(t * 89) * 0.06 * sh, st.spin * 0.3);
      stone.scale.setScalar(st.scale || 1);
      scriptCamera(cameraAt(t));
      const mt = mountainAt(t);
      mountain.visible = mt.visible;
      if (mt.visible) {
        // Grows from the stone's size to a mountain that fills the frame: its base runs
        // out past the fog, its peak rises above the camera's line of sight.
        const r = STONE.r + mt.scale * 11, h = STONE.r * 1.2 + mt.scale * 9;
        mountain.position.set(mt.x, 0, mt.z);
        mountain.scale.set(r, h, r);
      }
      // Dust
      let any = false, alphaSum = 0, n = 0;
      for (let i = 0; i < dust.length; i++) {
        const d = dustAt(dust[i], t);
        if (d.visible) { dustPos[i * 3] = d.x; dustPos[i * 3 + 1] = d.y; dustPos[i * 3 + 2] = d.z; any = true; alphaSum += d.alpha; n++; }
        else { dustPos[i * 3 + 1] = -50; }
      }
      dustPts.visible = any;
      if (any) { dustGeo.attributes.position.needsUpdate = true; dustMat.opacity = Math.min(0.85, (alphaSum / n) * 0.9); }
      // A jolt at the strike.
      const j = t - HIT;
      if (j > 0 && j < 0.32) { const k = (0.32 - j) / 0.32 * 0.08; world.position.set(Math.sin(t * 173) * k, Math.cos(t * 191) * k * 0.6, 0); }
      else world.position.set(0, 0, 0);
    }

    // ── The ending's camera ─────────────────────────────────────────────────
    // While the timeline scripts the camera (close-in, tremor, growth) the viewer's
    // azimuth is kept so an orbit they made still counts; when the scrub leaves that
    // stretch the default view comes back. Between t changes the orbit is free.
    const DEFAULT_POS = new THREE.Vector3(8.5, 5.2, 13.5), DEFAULT_TARGET = new THREE.Vector3(0, 3.6, 0);
    const sph = new THREE.Spherical(), off = new THREE.Vector3(), tgt = new THREE.Vector3();
    let scripted = false;
    function scriptCamera(cam) {
      if (!cam) {
        if (scripted) { camera.position.copy(DEFAULT_POS); controls.target.copy(DEFAULT_TARGET); scripted = false; if (currentSel) flyTo(currentSel); }
        return;
      }
      scripted = true; flight = null; followFrom = null;
      off.copy(camera.position).sub(controls.target);
      sph.setFromVector3(off); sph.radius = cam.distance; sph.phi = cam.polar;
      tgt.set(cam.target[0], cam.target[1], cam.target[2]);
      camera.position.copy(tgt).add(off.setFromSpherical(sph));
      controls.target.copy(tgt);
    }

    // ── Selection: emissive glow on the chosen piece ────────────────────────
    let glowTargets = [], currentSel = selected;
    function applySelection(id) {
      currentSel = id;
      for (const m of glowTargets) m.material.emissive.setHex(0);
      glowTargets = [];
      if (!id) return;
      const objs = id === 'stone' ? [stone, mountain] : [pieceGroups.get(id)];
      for (const o of objs) o?.traverse((m) => {
        if (m.isMesh && m.material?.emissive) {
          if (!m.userData.ownMat) { m.material = m.material.clone(); m.userData.ownMat = true; }
          const isMountain = m === mountain || mountain.children?.includes(m);
          // Textured props (the jasper stone, the green mountain) take less than the
          // metal pieces, so their own colour still reads through the glow.
          m.material.emissive.copy(GOLD_GLOW).multiplyScalar(isMountain ? 0.12 : m.material.map ? 0.26 : 0.45);
          glowTargets.push(m);
        }
      });
    }

    // ── Focus: fly the camera to the chosen piece ───────────────────────────
    // Like the map: choosing a piece frames it (whatever the current zoom), the
    // viewer's azimuth is kept, and choosing nothing flies back to the overview.
    // A drag by the viewer cancels the flight. While the ending scripts the
    // camera there is no flight — the script owns the view.
    let flight = null;                       // { from:{pos,tgt}, to:{tgt,dist}, t0, ms }
    const fTgt = new THREE.Vector3(), fOff = new THREE.Vector3(), fSph = new THREE.Spherical();
    function focusFor(id, t) {
      const aspect = camera.aspect || 1, fov = THREE.MathUtils.degToRad(camera.fov);
      const fit = (height) => Math.max(2.6, (height / 2 + 0.6) / Math.tan(fov / 2) / Math.min(1, aspect) * 1.1);
      if (!id) return { tgt: DEFAULT_TARGET.clone(), dist: DEFAULT_POS.distanceTo(DEFAULT_TARGET) };
      if (id === 'stone') {
        const st = stoneAt(t), mt = mountainAt(t);
        if (st.visible) return { tgt: new THREE.Vector3(st.x, st.y, st.z), dist: fit(STONE.r * 2.6) };
        const hgt = mt.scale * 9;
        return { tgt: new THREE.Vector3(mt.x, hgt * 0.45, mt.z), dist: fit(hgt * 1.15) };
      }
      const p = PIECES.find((q) => q.id === id); if (!p) return null;
      return { tgt: new THREE.Vector3(0, p.y0 + p.h / 2, 0), dist: fit(p.h) };
    }
    function flyTo(id) {
      if (scripted) { flight = null; return; }
      const to = focusFor(id, clock.t); if (!to) return;
      flight = { from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to, t0: performance.now(), ms: id ? 700 : 550 };
      controls.minDistance = Math.min(controls.minDistance, to.dist);
      dirty = true;
    }
    function stepFlight(now) {
      if (!flight) return false;
      const k = Math.min(1, (now - flight.t0) / flight.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      // Keep the azimuth/polar the viewer had; slide the target and the distance.
      fOff.copy(flight.from.pos).sub(flight.from.tgt); fSph.setFromVector3(fOff);
      fSph.radius = fOff.length() + (flight.to.dist - fOff.length()) * e;
      if (currentSel) fSph.phi += (1.35 - fSph.phi) * e * 0.5;   // ease toward a level look at the piece
      fTgt.copy(flight.from.tgt).lerp(flight.to.tgt, e);
      controls.target.copy(fTgt);
      camera.position.copy(fTgt).add(fOff.setFromSpherical(fSph));
      if (k >= 1) flight = null;
      return true;
    }
    controls.addEventListener('start', () => { flight = null; });
    // While the stone is the focus and the timeline moves it, the view follows it.
    const follow = new THREE.Vector3();
    let followFrom = null;
    function followStone(t) {
      if (currentSel !== 'stone' || scripted || flight) { followFrom = null; return; }
      const st = stoneAt(t); if (!st.visible) { followFrom = null; return; }
      follow.set(st.x, st.y, st.z);
      if (followFrom) { const d = follow.clone().sub(followFrom); controls.target.add(d); camera.position.add(d); }
      followFrom = follow.clone();
    }

    // Tap vs drag: a pointer that moved is an orbit, not a pick.
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
      if (moved > 8) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const cands = [stone, mountain, ...[...pieceGroups.values()]].filter((o) => o.visible);
      const hit = ray.intersectObjects(cands, true)[0];
      let o = hit?.object; while (o && !o.userData.id) o = o.parent;
      onSelect?.(o?.userData.id || null);
    };
    const onMove = (e) => {
      if (down) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const cands = [stone, mountain, ...[...pieceGroups.values()]].filter((o) => o.visible);
      renderer.domElement.style.cursor = ray.intersectObjects(cands, true).length ? 'pointer' : 'grab';
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);

    // ── Loop: draw only when something moved ────────────────────────────────
    let dirty = true, raf = 0, lastT = -1, alive = true;
    controls.addEventListener('change', () => { dirty = true; });
    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const t = clock.t;
      if (t !== lastT) { place(t); followStone(t); lastT = t; dirty = true; }
      if (stepFlight(performance.now())) dirty = true;
      if (controls.update()) dirty = true;
      if (!dirty) return;
      dirty = false;
      renderer.render(scene, camera);
      placeTags(t);
    }
    // The floating tags (buttons the page renders over the stage): put each one
    // beside its piece's screen position; hide it once the piece has shattered.
    const tagV = new THREE.Vector3();
    function placeTags(t) {
      const box = tagsRef?.current; if (!box) return;
      const w = el.clientWidth, h = el.clientHeight;
      const put = (id, x, y, z, show) => {
        const btn = box.querySelector(`[data-id="${id}"]`); if (!btn) return;
        tagV.set(x, y, z).project(camera);
        const visible = show && tagV.z < 1 && Math.abs(tagV.x) < 1.2 && Math.abs(tagV.y) < 1.2;
        btn.style.visibility = visible ? 'visible' : 'hidden';
        if (!visible) return;
        const sx = (tagV.x + 1) / 2 * w, sy = (1 - tagV.y) / 2 * h;
        // On a narrow stage a tag that would run off the right edge sits to the
        // LEFT of its anchor instead (leader line on its right).
        const flip = sx + 14 + btn.offsetWidth > w - 4;
        btn.classList.toggle('flip', flip);
        btn.style.transform = `translate(${(flip ? sx - btn.offsetWidth : sx).toFixed(1)}px, ${sy.toFixed(1)}px)`;
      };
      for (const p of PIECES) put(p.id, 0.55, p.y0 + p.h * 0.55, 0.5, figureReady && pieceWholeAt(p, t));
      const st = stoneAt(t), mt = mountainAt(t);
      if (st.visible) put('stone', st.x, st.y + STONE.r * 1.2, st.z, stoneReady);
      else put('stone', mt.x, (STONE.r * 1.2 + mt.scale * 9) * 0.98, mt.z, stoneReady);
    }
    function resize() {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      controls.minDistance = 2.5;
      dirty = true;
    }
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    place(clock.t);
    frame();
    onReady?.(true);
    const swapProp = (which, obj) => {
      if (!alive || !obj) return;
      const old = which === 'stone' ? stone : mountain;
      world.remove(old); old.geometry?.dispose?.();
      obj.visible = old.visible; obj.position.copy(old.position); obj.rotation.copy(old.rotation); obj.scale.copy(old.scale);
      world.add(obj);
      if (which === 'stone') stone = obj; else mountain = obj;
      lastT = -1; applySelection(currentSel); dirty = true;
    };
    loadProp(STONE_URL, 'stone', stoneMat, 'stone').then((o) => { swapProp('stone', o); stoneReady = true; lastT = -1; dirty = true; });
    loadProp(MOUNTAIN_URL, 'mountain', mountainMat, 'mountain').then((o) => swapProp('mountain', o));
    loadKing(mats).then((king) => {
      if (!alive) return;
      if (king) { buildFigure(king.groups, king.samplers); applySelection(currentSel); }
      figureReady = true; lastT = -1; dirty = true;
    });

    api.current = {
      select: (id) => { const changed = id !== currentSel; applySelection(id); if (changed) flyTo(id); },
      invalidate: () => { dirty = true; },
      resetView: () => { camera.position.set(8.5, 5.2, 13.5); controls.target.set(0, 3.6, 0); controls.update(); dirty = true; },
    };
    applySelection(selected);
    if (selected) { flyTo(selected); if (flight) { flight.t0 -= flight.ms; stepFlight(performance.now()); } }   // arrive at once on load

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); });
      scene.environment?.dispose?.();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { api.current?.select(selected); api.current?.invalidate(); }, [selected]);

  return <div ref={wrap} className="st-gl" aria-label="The statue in 3D — drag to look around, tap a piece to read about it" />;
}
