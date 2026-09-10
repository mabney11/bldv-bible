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
import {
  PIECES, STONE, MATERIALS, H_TOTAL, HIT,
  stoneAt, mountainAt, makeShards, shardAt, pieceWholeAt, makeDust, dustAt,
} from '../lib/models/statue.js';

const SKY = 0x1a1a24;       // a night sky, the dream's own hour — one look in both themes
const GROUND = 0x3a3329;
const GOLD_GLOW = new THREE.Color(0xffc857);

function stdMaterial(key) {
  const m = MATERIALS[key];
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(m.color), metalness: m.metal, roughness: m.rough });
}

function meshFor(part, material) {
  let geo;
  if (part.kind === 'sphere') geo = new THREE.SphereGeometry(part.r, 40, 28);
  else if (part.kind === 'cylinder') geo = new THREE.CylinderGeometry(part.r, part.r * 0.94, part.h, 36);
  else geo = new THREE.BoxGeometry(part.w, part.h, part.d, 1, 1, 1);
  const mesh = new THREE.Mesh(geo, material);
  const cy = part.kind === 'sphere' ? part.y : part.y + part.h / 2;
  mesh.position.set(part.x, cy, part.z || 0);
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

export default function StatueScene({ clock, selected, onSelect, onReady }) {
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
    controls.target.set(0, 3.3, 0);
    controls.enablePan = false;
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 6; controls.maxDistance = 34;
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
    const pieceGroups = new Map();
    const shardSets = [];
    for (const piece of PIECES) {
      const g = new THREE.Group(); g.userData.id = piece.id;
      for (const part of piece.parts) g.add(meshFor(part, mats[part.mixed ? 'clay' : piece.material]));
      for (const part of piece.iron || []) g.add(meshFor(part, mats.iron));
      for (const part of piece.toes || []) g.add(meshFor(part, mats[part.material]));
      world.add(g); pieceGroups.set(piece.id, g);

      // Shards: one InstancedMesh-free approach keeps selection/fade simple — ~26 small meshes per piece.
      const shards = makeShards(piece).map((s) => {
        const geo = s.size > 0.3 ? new THREE.DodecahedronGeometry(s.size * 0.55, 0) : new THREE.BoxGeometry(s.size, s.size * 0.7, s.size * 0.8);
        const m = mats[s.material].clone(); m.transparent = true;
        const mesh = new THREE.Mesh(geo, m);
        mesh.castShadow = true; mesh.visible = false;
        world.add(mesh);
        return { s, mesh, axis: new THREE.Vector3(...s.spinAxis).normalize() };
      });
      shardSets.push({ piece, shards });
    }

    // ── Stone + mountain ────────────────────────────────────────────────────
    const stoneMat = stdMaterial('stone');
    const stone = new THREE.Mesh(stoneGeometry(STONE.r), stoneMat);
    stone.castShadow = true; stone.userData.id = 'stone'; world.add(stone);
    const mountainMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x515b4f), metalness: 0, roughness: 0.98, flatShading: true, envMapIntensity: 0.35 });
    const mountain = new THREE.Mesh(mountainGeometry(), mountainMat);
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
      for (const [id, g] of pieceGroups) g.visible = pieceWholeAt(PIECES.find((p) => p.id === id), t);
      for (const { piece, shards } of shardSets) {
        for (const { s, mesh, axis } of shards) {
          const a = shardAt(piece, s, t);
          mesh.visible = a.visible;
          if (!a.visible) continue;
          mesh.position.set(a.x, a.y, a.z);
          q.setFromAxisAngle(axis, a.rot); mesh.quaternion.copy(q);
          mesh.scale.setScalar(a.scale);
          mesh.material.opacity = a.alpha;
        }
      }
      const st = stoneAt(t);
      stone.visible = st.visible;
      stone.position.set(st.x, st.y, st.z);
      stone.rotation.set(st.spin * 0.7, st.spin, st.spin * 0.3);
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

    // ── Selection: emissive glow on the chosen piece ────────────────────────
    let glowTargets = [];
    function applySelection(id) {
      for (const m of glowTargets) m.material.emissive.setHex(0);
      glowTargets = [];
      if (!id) return;
      const objs = id === 'stone' ? [stone, mountain] : [pieceGroups.get(id)];
      for (const o of objs) o?.traverse((m) => {
        if (m.isMesh && m.material?.emissive) {
          if (!m.userData.ownMat) { m.material = m.material.clone(); m.userData.ownMat = true; }
          m.material.emissive.copy(GOLD_GLOW).multiplyScalar(m === mountain ? 0.06 : 0.22);
          glowTargets.push(m);
        }
      });
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
      if (t !== lastT) { place(t); lastT = t; dirty = true; }
      if (controls.update()) dirty = true;
      if (!dirty) return;
      dirty = false;
      renderer.render(scene, camera);
    }
    function resize() {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      // On a tall phone stage, pull back so the whole statue fits.
      controls.minDistance = w < h ? 9 : 6;
      dirty = true;
    }
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    place(clock.t);
    frame();
    onReady?.(true);

    api.current = {
      select: applySelection,
      invalidate: () => { dirty = true; },
      resetView: () => { camera.position.set(8.5, 5.2, 13.5); controls.target.set(0, 3.3, 0); controls.update(); dirty = true; },
    };
    applySelection(selected);

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
