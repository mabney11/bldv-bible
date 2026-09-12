/**
 * TempleScene.jsx — the bayath (house) of 1 Kings 6–7 in WebGL (three.js):
 * hewn stone in courses, three storeys of side rooms, the porch tower, lattice
 * windows, cedar carved with cherubim and palms under a skin of gold, the two
 * great cherubim over the ark, the folding doors and the veil, Yakayan and
 * Baiz with their nets and pomegranates, the molten sea on its twelve oxen,
 * the ten wheeled bases, the brass altar, the lampstands and tables, the
 * courts and the king's houses. Everything it draws comes from
 * lib/models/temple.js — this file only turns that data into meshes, so the
 * flat sheet and this scene never disagree.
 *
 * Imported lazily by pages/Temple.jsx so three.js is fetched only when the 3D
 * view is shown. Rendering is on demand (frames only while playing, orbiting
 * or after a change). Every texture is drawn on a canvas here — nothing is
 * downloaded — except the optional sculpted parts (GET /api/models/temple-*.glb),
 * which replace the procedural ones when present.
 *
 * Static solids of a piece are merged per material into a handful of meshes
 * (a thousand little boxes would cost a thousand draw calls); box UVs are
 * scaled to world size so one stone texture tiles every wall at one scale.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  PIECES, MATERIALS, H,
  progressAt, xrayAt, openAt, cameraAt, focusFor,
  PLACES, ROUTES, MOVERS, moverAt, landAt,
} from '../lib/models/temple.js';

const SKY = 0xb9cfe3;          // a dry, bright morning over Mawarayah
const XRAY_ROLES = new Set(['roof', 'south', 'tower', 'lintel', 'ceiling', 'slab']);
const GLB_URL = (name) => `/api/models/${name}.glb`;

// ── Canvas textures ──────────────────────────────────────────────────────────
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
let seed = 11;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** Hewn stone in courses: one tile = 8 × 4 cubits (two courses of two, staggered). */
function ashlarTexture(base, mortar) {
  return canvas(512, 256, (g, w, h) => {
    g.fillStyle = mortar; g.fillRect(0, 0, w, h);
    const rows = 2, cols = 4;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? w / cols / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const x = c * (w / cols) + off, y = r * (h / rows);
        const k = 0.9 + rnd() * 0.2;
        g.fillStyle = shade(base, k); g.fillRect(x + 3, y + 3, w / cols - 6, h / rows - 6);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 3, y + 3, w / cols - 6, 5);
        g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x + 3, y + h / rows - 9, w / cols - 6, 6);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; g.fillRect(x + 4 + rnd() * (w / cols - 8), y + 4 + rnd() * (h / rows - 8), 2 + rnd() * 5, 1 + rnd() * 2); }
      }
    }
  });
}
function shade(hex, k) {
  const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
  return `#${c.getHexString()}`;
}
/** Cedar planks: one tile = 4 × 4 cubits. */
function plankTexture(base) {
  return canvas(256, 256, (g, w, h) => {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = shade(base, 0.9 + rnd() * 0.22); g.fillRect(0, i * (h / 6), w, h / 6);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, i * (h / 6), w, 2);
      for (let j = 0; j < 14; j++) { g.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.08})`; g.lineWidth = 1; g.beginPath(); const y = i * (h / 6) + rnd() * (h / 6); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.7, y + rnd() * 6 - 3, w, y); g.stroke(); }
    }
  });
}
/**
 * The carving of 6:29 — karawab (cherubim), thamar (palm) trees and open
 * tzatzayam (flowers) in bands, palm between cherub and cherub (Ezekiel 41:18).
 * One tile = 8 cubits wide × 8 high. `ink` is the relief's shadow colour; the same
 * drawing in grey is the bump map.
 */
function carvedCanvasDraw(base, ink, hi) {
  return (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const band = h / 2;
    const palm = (x, y, s) => {
      g.strokeStyle = ink; g.lineWidth = 3 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 60 * s); g.stroke();
      for (let i = 0; i < 4; i++) { g.lineWidth = 2 * s; g.beginPath(); g.moveTo(x, y - 60 * s); g.quadraticCurveTo(x - 30 * s, y - 60 * s - 10 * s * i, x - 44 * s, y - 40 * s - 10 * s * i); g.stroke(); g.beginPath(); g.moveTo(x, y - 60 * s); g.quadraticCurveTo(x + 30 * s, y - 60 * s - 10 * s * i, x + 44 * s, y - 40 * s - 10 * s * i); g.stroke(); }
      g.lineWidth = 2.5 * s; g.beginPath(); g.moveTo(x, y - 60 * s); g.lineTo(x, y - 92 * s); g.stroke();
      g.fillStyle = ink; for (let i = -1; i <= 1; i += 2) { g.beginPath(); g.ellipse(x + 6 * s * i, y - 50 * s, 4 * s, 7 * s, 0, 0, 6.29); g.fill(); }
    };
    const cherub = (x, y, s) => {
      g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 2 * s;
      g.beginPath(); g.ellipse(x, y - 78 * s, 7 * s, 8 * s, 0, 0, 6.29); g.fill();                       // head
      g.beginPath(); g.moveTo(x - 9 * s, y - 68 * s); g.lineTo(x + 9 * s, y - 68 * s); g.lineTo(x + 13 * s, y); g.lineTo(x - 13 * s, y); g.closePath(); g.fill();   // robe
      for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x + 9 * d * s, y - 64 * s); g.quadraticCurveTo(x + 44 * d * s, y - 95 * s, x + 46 * d * s, y - 40 * s); g.quadraticCurveTo(x + 30 * d * s, y - 52 * s, x + 12 * d * s, y - 44 * s); g.closePath(); g.fill(); }   // wings
      g.strokeStyle = hi; g.lineWidth = 1.2 * s; for (const d of [-1, 1]) for (let i = 1; i <= 3; i++) { g.beginPath(); g.moveTo(x + 12 * d * s, y - (44 + i * 6) * s); g.quadraticCurveTo(x + 30 * d * s, y - (56 + i * 8) * s, x + (40 + i) * d * s, y - (50 + i * 9) * s); g.stroke(); }
    };
    const flower = (x, y, s) => {
      g.fillStyle = ink; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 9 * s, y + Math.sin(a) * 9 * s, 5 * s, 3 * s, a, 0, 6.29); g.fill(); }
      g.fillStyle = hi; g.beginPath(); g.arc(x, y, 4 * s, 0, 6.29); g.fill();
    };
    for (let b = 0; b < 2; b++) {
      const y0 = band * (b + 1) - 14;
      // cherub · palm · cherub · palm across the tile, offset on the second band
      const off = b ? w / 8 : 0;
      for (let i = 0; i < 4; i++) { const x = off + (i + 0.5) * (w / 4); if (i % 2 === 0) cherub(x, y0, 1.1); else palm(x, y0, 1.15); }
      for (let i = 0; i < 8; i++) flower(off + (i + 0.5) * (w / 8), y0 - band + 22, 0.7);
      g.fillStyle = ink; g.fillRect(0, y0 + 6, w, 3);   // the rail between the bands
    }
  };
}
function carvedTextures(base, ink, hi) {
  const map = canvas(1024, 1024, carvedCanvasDraw(base, ink, hi));
  const bump = canvas(1024, 1024, carvedCanvasDraw('#808080', '#404040', '#b0b0b0'));
  bump.colorSpace = THREE.NoColorSpace;
  return { map, bump };
}
/** The lattice of 6:4 (an alpha map): a diagonal mesh in a frame. */
function latticeTexture() {
  const t = canvas(128, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 5;
    for (let i = -h; i < w + h; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    g.lineWidth = 12; g.strokeRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}
/** The veil: thakalath (blue), aragaman (purple), karamayal (crimson), bawatz (fine linen), with cherubim (2 Chronicles 3:14). */
function veilTexture() {
  return canvas(512, 768, (g, w, h) => {
    const cols = ['#23378a', '#4a2378', '#8c1a2e', '#d8cdb0'];
    for (let i = 0; i < 48; i++) { g.fillStyle = cols[i % 4]; g.fillRect(0, i * (h / 48), w, h / 48); }
    g.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 48; i++) g.fillRect(0, i * (h / 48), w, 1);
    const pat = document.createElement('canvas'); pat.width = w; pat.height = h;
    const pg = pat.getContext('2d'); carvedCanvasDraw('rgba(0,0,0,0)', '#f0d78c', '#fff0c8')(pg, w, h);
    g.globalAlpha = 0.85; g.drawImage(pat, 0, 0); g.globalAlpha = 1;
  });
}
/** The checker net of the capitals (7:17): an alpha map. */
function netTexture() {
  const t = canvas(256, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 4;
    for (let i = -h; i < w + h; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
  });
  t.colorSpace = THREE.NoColorSpace; return t;
}
/** The panels of the bases (7:29, 36): lions, oxen and cherubim between the ledges, wreaths beneath. */
function panelTexture(base, ink, hi) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = ink;
    // a lion
    g.beginPath(); g.ellipse(70, 110, 38, 18, 0, 0, 6.29); g.fill(); g.beginPath(); g.arc(112, 96, 16, 0, 6.29); g.fill();
    for (const x of [45, 60, 82, 97]) g.fillRect(x, 118, 7, 26);
    // an ox
    g.beginPath(); g.ellipse(180, 112, 40, 20, 0, 0, 6.29); g.fill(); g.fillRect(212, 88, 22, 22);
    g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(214, 88); g.lineTo(206, 72); g.moveTo(232, 88); g.lineTo(240, 72); g.stroke();
    for (const x of [150, 166, 190, 206]) g.fillRect(x, 122, 7, 24);
    // a cherub above
    g.beginPath(); g.arc(128, 34, 9, 0, 6.29); g.fill(); g.beginPath(); g.moveTo(118, 44); g.lineTo(138, 44); g.lineTo(142, 78); g.lineTo(114, 78); g.closePath(); g.fill();
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(128 + 10 * d, 48); g.quadraticCurveTo(128 + 60 * d, 20, 128 + 62 * d, 70); g.quadraticCurveTo(128 + 40 * d, 60, 128 + 14 * d, 66); g.closePath(); g.fill(); }
    // the ledges and the wreath beneath
    g.fillStyle = hi; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); g.fillRect(0, 150, w, 4);
    g.strokeStyle = hi; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= w; x += 32) g.arc(x, 200, 16, Math.PI, 0, false); g.stroke();
  });
}

// ── Materials ────────────────────────────────────────────────────────────────
function makeMaterials() {
  const std = (key, extra = {}) => { const m = MATERIALS[key]; return new THREE.MeshStandardMaterial({ color: new THREE.Color(m.color), metalness: m.metal, roughness: m.rough, ...extra }); };
  const ashlar = ashlarTexture(MATERIALS.stone.color, '#8a7a5e');
  const ashlarDark = ashlarTexture(MATERIALS.found.color, '#5b4d36');
  const plank = plankTexture(MATERIALS.cedar.color);
  const carvedCedar = carvedTextures(MATERIALS.cedar.color, '#3b1f0c', '#c58f60');
  const carvedGold = carvedTextures('#e2b649', '#8a6414', '#fff0b0');
  const carvedOlive = carvedTextures(MATERIALS.olive.color, '#3f3418', '#d8c58e');
  const carvedFir = carvedTextures(MATERIALS.fir.color, '#4b3218', '#e2c39a');
  const M = {
    stone: std('stone', { map: ashlar }),
    found: std('found', { map: ashlarDark }),
    cedar: std('cedar', { map: plank }),
    cedarPlain: std('cedar'),
    fir: std('fir', { map: plank }),
    olive: std('olive'),
    gold: std('gold'),
    goldDim: std('gold', { roughness: 0.45 }),
    brass: std('brass'),
    brassDark: std('brass', { color: new THREE.Color('#8a5228'), roughness: 0.55 }),
    veil: new THREE.MeshStandardMaterial({ map: veilTexture(), side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }),
    ground: std('ground'),
    earth: new THREE.MeshStandardMaterial({ color: new THREE.Color('#7c6d52'), roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: new THREE.Color(MATERIALS.water.color), roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85 }),
    ivory: std('ivory'),
    dark: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1712'), roughness: 1 }),
    lattice: new THREE.MeshStandardMaterial({ color: new THREE.Color('#d9ccb0'), alphaMap: latticeTexture(), transparent: true, side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.4 }),
    net: new THREE.MeshStandardMaterial({ color: new THREE.Color('#e6ab70'), metalness: 1, roughness: 0.45, alphaMap: netTexture(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.35 }),
    panel: std('brass', { map: panelTexture('#b9733a', '#5a2f12', '#e6ab70'), roughness: 0.5 }),
    flame: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a') }),
    carvedCedar: std('cedar', { map: carvedCedar.map, bumpMap: carvedCedar.bump, bumpScale: 0.12, roughness: 0.75 }),
    carvedGold: std('gold', { map: carvedGold.map, bumpMap: carvedGold.bump, bumpScale: 0.1, roughness: 0.32 }),
    carvedOlive: std('olive', { map: carvedOlive.map, bumpMap: carvedOlive.bump, bumpScale: 0.12 }),
    carvedFir: std('fir', { map: carvedFir.map, bumpMap: carvedFir.bump, bumpScale: 0.12 }),
  };
  M.stone.map.repeat.set(1, 1); M.found.map.repeat.set(1, 1);
  return M;
}
// Tile sizes in cubits (u, v) per texture, for the UV scaling of boxes.
const TILE = { stone: [8, 4], found: [8, 4], cedar: [4, 4], fir: [4, 4], carvedCedar: [8, 8], carvedGold: [8, 8], carvedOlive: [8, 8], carvedFir: [8, 8], panel: [4, 3] };

/** Scale a BoxGeometry's UVs so a texture tiles every face at world scale. */
function uvBox(geo, w, h, d, tile) {
  const uv = geo.attributes.uv, [tu, tv] = tile;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // +x −x +y −y +z −z
  for (let f = 0; f < 6; f++) { const [fw, fh] = dims[f]; for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * (fw / tu), uv.getY(i) * (fh / tv)); }
  uv.needsUpdate = true;
  return geo;
}

// ── Builders ─────────────────────────────────────────────────────────────────
// Each piece is a Group. Static solids are collected as {geometry-in-piece-space,
// material} and merged per material at the end (`bake`); animated or unique
// things (doors, veil, water, instanced pomegranates) are added as meshes.
const UP = new THREE.Vector3(0, 1, 0);
class PieceBuilder {
  constructor(M, piece) { this.M = M; this.piece = piece; this.group = new THREE.Group(); this.group.userData.id = piece.id; this.buckets = new Map(); this.slots = []; }
  matFor(part, carvedOverride) {
    const key = part.mat || this.piece.material;
    if (part.carved) return carvedOverride || ({ cedar: 'carvedCedar', gold: 'carvedGold', olive: 'carvedOlive', fir: 'carvedFir' }[key] || key);
    return key;
  }
  add(geo, matKey, xray = false) {
    const k = `${matKey}${xray ? '|x' : ''}`;
    if (!this.buckets.has(k)) this.buckets.set(k, { matKey, xray, geos: [] });
    this.buckets.get(k).geos.push(geo);
  }
  box(x, y, z, w, h, d, matKey, xray = false, rot = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (TILE[matKey]) uvBox(geo, w, h, d, TILE[matKey]);
    if (rot) geo.rotateY(rot);
    geo.translate(x, y + h / 2, z);
    this.add(geo, matKey, xray);
  }
  cyl(x, y, z, r, h, matKey, r2 = r, seg = 32, xray = false) {
    const geo = new THREE.CylinderGeometry(r2, r, h, seg); geo.translate(x, y + h / 2, z); this.add(geo, matKey, xray);
  }
  lathe(x, y, z, profile, matKey, seg = 48) {
    const geo = new THREE.LatheGeometry(profile.map(([r, dy]) => new THREE.Vector2(Math.max(r, 0.001), dy)), seg); geo.translate(x, y, z); this.add(geo, matKey);
  }
  sphere(x, y, z, r, matKey, seg = 16) { const geo = new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)); geo.translate(x, y, z); this.add(geo, matKey); }
  torus(x, y, z, R, r, matKey, rx = 0, ry = 0) { const geo = new THREE.TorusGeometry(R, r, 10, 40); geo.rotateX(rx); geo.rotateY(ry); geo.translate(x, y, z); this.add(geo, matKey); }
  capsule(a, b, r, matKey) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const geo = new THREE.CapsuleGeometry(r, len, 4, 14);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    geo.applyQuaternion(q); geo.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); this.add(geo, matKey);
  }
  mesh(obj) { this.group.add(obj); return obj; }
  bake() {
    for (const { matKey, xray, geos } of this.buckets.values()) {
      const list = geos.some((g) => !g.index) ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geo) continue;
      let mat = this.M[matKey] || this.M.stone;
      if (xray) { mat = mat.clone(); mat.transparent = true; mat.userData.xray = true; }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.xray = xray;
      this.group.add(mesh);
    }
    return this.group;
  }
}

/** A box with a doorway cut out of one long side: three boxes (two jambs and a lintel). */
function boxWithDoorway(b, part, matKey, xray) {
  const { w, h, d } = part, dw = part.doorway.w, dh = part.doorway.h;
  if (w < d) {   // the wall runs along z: the doorway is cut across z
    const side = (d - dw) / 2;
    b.box(part.x, part.y, part.z - dw / 2 - side / 2, w, h, side, matKey, xray);
    b.box(part.x, part.y, part.z + dw / 2 + side / 2, w, h, side, matKey, xray);
    b.box(part.x, part.y + dh, part.z, w, h - dh, dw, matKey, xray);
  } else {
    const side = (w - dw) / 2;
    b.box(part.x - dw / 2 - side / 2, part.y, part.z, side, h, d, matKey, xray);
    b.box(part.x + dw / 2 + side / 2, part.y, part.z, side, h, d, matKey, xray);
    b.box(part.x, part.y + dh, part.z, dw, h - dh, d, matKey, xray);
  }
}

function buildBox(b, part) {
  const matKey = b.matFor(part);
  const xray = XRAY_ROLES.has(part.role) && (b.piece.group === 'house' || b.piece.group === 'inside');
  if (part.doorway) { boxWithDoorway(b, part, matKey, xray); return; }
  if (part.window) {   // a narrowing, latticed window: a dark recess, a lattice in it, and a stone sill
    b.box(part.x, part.y, part.z, part.w, part.h, part.d, 'dark', xray);
    const zSign = Math.sign(part.z);
    const lat = new THREE.Mesh(new THREE.PlaneGeometry(part.w * 0.8, part.h * 0.85), b.M.lattice);
    lat.position.set(part.x, part.y + part.h / 2, part.z + zSign * part.d * 0.35); if (zSign < 0) lat.rotation.y = Math.PI;
    lat.userData.xray = xray; b.mesh(lat);
    b.box(part.x, part.y - 0.3, part.z + zSign * 0.2, part.w + 0.8, 0.3, part.d + 0.4, 'stone', xray);
    b.box(part.x, part.y + part.h, part.z + zSign * 0.2, part.w + 0.8, 0.5, part.d + 0.4, 'stone', xray);
    return;
  }
  if (part.hollowRoom) {   // three walls and no front (the porch of the throne opens north to the court)
    const t = 2, { x, y, z, w, h, d } = part;
    b.box(x - w / 2 + t / 2, y, z, t, h, d, matKey); b.box(x + w / 2 - t / 2, y, z, t, h, d, matKey); b.box(x, y, z + d / 2 - t / 2, w, h, t, matKey);
    b.box(x, y, z, w - 2 * t, 0.4, d - t, 'cedar');
    return;
  }
  b.box(part.x, part.y, part.z, part.w, part.h, part.d, matKey, xray);
  if (part.horns) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(part.x + sx * (part.w / 2 - part.w * 0.06), part.y + part.h, part.z + sz * (part.d / 2 - part.d * 0.06), part.w * 0.05, part.h * 0.12, matKey, part.w * 0.015, 10);
  if (part.cedarTop) b.box(part.x, part.y + part.h, part.z, part.w + 0.2, 0.7, part.d + 0.2, 'cedar');
  if (part.beams) {   // beam ends showing along the long edges, under the parapet line
    const n = Math.floor(part.w / 2.5);
    for (let i = 0; i <= n; i++) { const x = part.x - part.w / 2 + i * (part.w / n); b.box(x, part.y - 0.6, part.z, 1.2, 1.2, part.d + 1.2, 'cedar', xray); }
  }
  if (part.windows) {   // ranks of windows facing each other (7:4–5) on the long walls
    const long = part.w > part.d, n = long ? Math.floor(part.w / 6) : Math.floor(part.d / 6);
    for (let r = 0; r < part.windows; r++) for (let i = 0; i < n; i++) {
      const y = part.y + 3 + r * ((part.h - 6) / part.windows);
      if (long) b.box(part.x - part.w / 2 + (i + 0.5) * (part.w / n), y, part.z, 2.2, 4, part.d + 0.2, 'dark');
      else b.box(part.x, y, part.z - part.d / 2 + (i + 0.5) * (part.d / n), part.w + 0.2, 4, 2.2, 'dark');
    }
  }
}

function buildRamp(b, part) {   // a wedge rising to the altar's top from the south
  const len = part.len, h = part.h, w = part.w;
  const geo = new THREE.BufferGeometry();
  const x0 = part.x - w / 2, x1 = part.x + w / 2, z0 = part.z, z1 = part.z + len, y0 = part.y, y1 = part.y + h;
  const v = [
    x0, y0, z1, x1, y0, z1, x1, y1, z0, x0, y1, z0,          // top slope
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,          // back (against the altar)
    x0, y0, z0, x0, y1, z0, x0, y0, z1,                      // sides
    x1, y0, z0, x1, y0, z1, x1, y1, z0,
  ];
  const idx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  // uvs are needed for merging with textured geometry: give it plain ones
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((v.length / 3) * 2).fill(0), 2));
  b.add(geo, 'stone');
}

/**
 * A wing as a stylised cast plate, `len` long, in the x/y plane, root at x = 0 pointing +x:
 * a straight top edge, a lower edge stepped in four broad feather-ranks, the whole
 * blade tapering a little toward the tip. Faceless-statue style, no engraving.
 */
function wingGeo(len, s) {
  const sh = new THREE.Shape();
  const h0 = 1.15 * s;                 // half-depth at the root
  sh.moveTo(0, -h0); sh.lineTo(0, h0);
  sh.lineTo(len * 0.97, h0 * 0.82); sh.quadraticCurveTo(len, h0 * 0.7, len, h0 * 0.35);   // straight top edge, rounded tip
  // stepped lower edge: four ranks, each a little deeper than the one outside it
  const ranks = 4;
  for (let i = 0; i < ranks; i++) {
    const x1 = len * (1 - i / ranks), x0 = len * (1 - (i + 1) / ranks);
    const d1 = h0 * (0.35 + i * 0.22), d0 = h0 * (0.35 + (i + 1) * 0.22);
    sh.lineTo(x1 - len * 0.03, -d1); sh.quadraticCurveTo(x1 - len * 0.12, -d0 * 1.05, x0 + len * 0.02, -d0);
  }
  sh.lineTo(0, -h0);
  return new THREE.ExtrudeGeometry(sh, { depth: 0.22 * s, bevelEnabled: true, bevelThickness: 0.06 * s, bevelSize: 0.07 * s, bevelSegments: 2 });
}

/**
 * A great karawab, `h` high: a standing figure in a pleated robe belted at the waist,
 * a broad pectoral collar, shoulders, arms folded before the breast, a smooth
 * featureless head under a banded headdress that falls behind the neck; each wing a
 * FAN of feathers from the shoulder — long primaries at the tip, secondaries inside
 * them, a row of coverts over the roots — held straight out and level (1 Kings 6:27),
 * one to `side` (the wall), the other to the middle. Faces +x (east, toward the
 * house — 2 Chronicles 3:13). Faceless by fieldy's choice; no engraving.
 */
function buildCherub(b, part, mat = 'gold') {
  const { x, y, z, h, wing, side } = part;
  const s = h / 10;
  const g = new THREE.Group(); g.position.set(x, y, z); g.userData.slot = part.glb;
  const sub = new PieceBuilder(b.M, b.piece);
  const ellipsoid = (px, py, pz, rx, ry, rz, rotX = 0, rotY = 0, rotZ = 0, seg = 14) => {
    const geo = new THREE.SphereGeometry(1, seg, Math.max(8, seg - 4)); geo.scale(rx, ry, rz);
    if (rotX) geo.rotateX(rotX); if (rotY) geo.rotateY(rotY); if (rotZ) geo.rotateZ(rotZ);
    geo.translate(px, py, pz); sub.add(geo, mat);
  };
  // ── the robe: a pleated skirt from the hem to the belt, then the bodice to the collar
  const skirt = new THREE.LatheGeometry([[1.62, 0], [1.6, 0.18], [1.38, 1.2], [1.22, 3.0], [1.12, 4.6], [1.08, 5.1]].map(([r, dy]) => new THREE.Vector2(r * s, dy * s)), 96);
  { const p = skirt.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const a = Math.atan2(v.z, v.x), t = 1 - v.y / (5.1 * s); const k = 1 + 0.045 * t * Math.cos(a * 22); p.setXYZ(i, v.x * k, v.y, v.z * k); }
    skirt.computeVertexNormals(); sub.add(skirt, mat); }
  sub.lathe(0, 5.1 * s, 0, [[1.1 * s, 0], [1.02 * s, 0.6 * s], [1.08 * s, 1.5 * s], [1.22 * s, 2.1 * s], [1.28 * s, 2.35 * s], [0.9 * s, 2.55 * s], [0.42 * s, 2.7 * s], [0, 2.72 * s]], mat, 48);   // bodice to the shoulders
  sub.torus(0, 5.15 * s, 0, 1.1 * s, 0.11 * s, mat, Math.PI / 2);                                                                                   // the belt
  sub.torus(0, 5.15 * s, 0, 1.1 * s, 0.05 * s, mat, Math.PI / 2); ellipsoid(1.16 * s, 5.15 * s, 0, 0.14 * s, 0.22 * s, 0.22 * s);                    // its clasp, at the front
  sub.lathe(0, 7.15 * s, 0, [[0.55 * s, 0], [1.0 * s, 0.05 * s], [1.05 * s, 0.32 * s], [0.6 * s, 0.5 * s], [0.5 * s, 0.6 * s]], mat, 48);          // the pectoral collar
  for (let i = 0; i < 3; i++) sub.torus(0, 7.2 * s + i * 0.1 * s, 0, (1.02 - i * 0.14) * s, 0.035 * s, mat, Math.PI / 2);                             // its rows
  // ── shoulders and arms: a limb is a body of revolution swept along its bone, so the
  // deltoid, the biceps and the forearm's taper are real bulges, not capsules
  const limb = (from, to, profile) => {
    const A = new THREE.Vector3(...from), B = new THREE.Vector3(...to), d = B.clone().sub(A), len = d.length();
    const geo = new THREE.LatheGeometry(profile.map(([r, u]) => new THREE.Vector2(r * s, u * len)), 28);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize())); geo.translate(A.x, A.y, A.z); sub.add(geo, mat);
  };
  for (const sz of [-1, 1]) {
    const sh = [0.1 * s, 7.3 * s, sz * 1.12 * s], el = [0.72 * s, 5.9 * s, sz * 1.12 * s], wr = [1.22 * s, 6.05 * s, -sz * 0.3 * s];
    ellipsoid(0.05 * s, 7.3 * s, sz * 1.02 * s, 0.5 * s, 0.46 * s, 0.52 * s);                                                                     // deltoid
    limb(sh, el, [[0.26, 0], [0.33, 0.18], [0.37, 0.42], [0.34, 0.66], [0.27, 0.86], [0.24, 1]]);                                                 // upper arm, the biceps swelling
    ellipsoid(el[0], el[1], el[2], 0.27 * s, 0.25 * s, 0.27 * s);                                                                                  // elbow
    limb(el, wr, [[0.25, 0], [0.29, 0.22], [0.26, 0.5], [0.2, 0.8], [0.17, 1]]);                                                                    // forearm across the breast, tapering to the wrist
    // the hand: continues the forearm's line past the wrist — a palm, four fingers
    // curling down over the other forearm, a thumb laid along the top
    const dir = new THREE.Vector3(wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]).normalize(), perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const at = (k, side, drop = 0) => [wr[0] + dir.x * k * s + perp.x * side * s, wr[1] + dir.y * k * s - drop * s, wr[2] + dir.z * k * s + perp.z * side * s];
    const pc = at(0.22, 0); ellipsoid(pc[0], pc[1], pc[2], 0.2 * s, 0.11 * s, 0.24 * s, 0, Math.atan2(dir.x, dir.z), 0);
    for (let f = 0; f < 4; f++) { const off = (f - 1.5) * 0.1; sub.capsule(at(0.4, off), at(0.62, off * 1.1, 0.05), 0.048 * s, mat); sub.capsule(at(0.62, off * 1.1, 0.05), at(0.68, off * 1.15, 0.26), 0.044 * s, mat); }
    sub.capsule(at(0.2, 0.2, -0.06), at(0.45, 0.32, -0.02), 0.052 * s, mat);
  }
  // ── the head: featureless, under a banded headdress with a fall behind the neck
  sub.cyl(0, 7.75 * s, 0, 0.32 * s, 0.55 * s, mat, 0.34 * s, 20);                                                                                     // neck
  ellipsoid(0.02 * s, 8.95 * s, 0, 0.62 * s, 0.72 * s, 0.6 * s);                                                                                    // head
  sub.lathe(0, 9.0 * s, 0, [[0.66 * s, 0], [0.72 * s, 0.25 * s], [0.7 * s, 0.55 * s], [0.5 * s, 0.85 * s], [0.2 * s, 1.0 * s], [0, 1.02 * s]], mat, 32);   // the headdress cap
  sub.torus(0, 9.05 * s, 0, 0.7 * s, 0.07 * s, mat, Math.PI / 2);                                                                                      // its band
  // ── hair: thick corded locks from under the headdress, over the back and sides of the
  // head to the shoulders, each a rope — a tube along a gentle S-curve, ridged along its
  // length — the face left bare
  const lock = (ang, len, phase) => {
    const r0 = 0.66 * s, y0 = 8.9 * s;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const u = k / 5, rr = r0 + u * 0.22 * s + Math.sin(u * 6.2 + phase) * 0.06 * s;
      pts.push(new THREE.Vector3(Math.cos(ang) * rr + Math.sin(u * 9 + phase) * 0.03 * s, y0 - u * len, Math.sin(ang) * rr));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 24, 0.15 * s, 8, false);
    const p = geo.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {                          // the rope's twist: the radius swells and pinches along the lock
      v.fromBufferAttribute(p, i); const u = Math.floor(i / 9) / 24; curve.getPointAt(Math.min(1, u), c);
      const k = 1 + 0.2 * Math.sin(u * 40 + phase); p.setXYZ(i, c.x + (v.x - c.x) * k, c.y + (v.y - c.y) * k, c.z + (v.z - c.z) * k);
    }
    geo.computeVertexNormals(); sub.add(geo, mat);
    // knots along the cord read as the twist from any angle
    const tip = pts[pts.length - 1]; ellipsoid(tip.x, tip.y - 0.06 * s, tip.z, 0.15 * s, 0.19 * s, 0.15 * s);
  };
  for (let i = 0; i < 15; i++) { const ang = Math.PI * 0.62 + (i / 14) * Math.PI * 0.76; lock(ang, (1.55 + Math.sin(i * 1.7) * 0.15) * s, i * 1.3); }   // over the back, from ear to ear
  for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) lock(sz * (Math.PI * 0.5 - i * 0.2), (1.45 + i * 0.08) * s, i * 2.1 + (sz > 0 ? 0.5 : 0));            // and three before each ear
  // ── feet
  for (const sz of [-1, 1]) { sub.box(0.3 * s, 0, sz * 0.5 * s, 1.0 * s, 0.32 * s, 0.55 * s, mat); ellipsoid(0.8 * s, 0.16 * s, sz * 0.5 * s, 0.3 * s, 0.16 * s, 0.28 * s); }
  // ── the wings: fans of feathers from the shoulder, straight out and level
  const shoulderY = 7.3 * s;
  const feather = (dir, angle, len, w, t, xOff) => {
    // a feather: a flattened, tapered blade from the shoulder outward at `angle` below level
    const geo = new THREE.SphereGeometry(1, 10, 6); geo.scale(t, w, len / 2);
    geo.translate(0, 0, len / 2);                    // root at the origin, tip at +z
    geo.rotateX(angle);                              // droop toward −y (about the shoulder, in the wing's plane)
    if (dir < 0) geo.rotateY(Math.PI);               // to the other side
    geo.translate(xOff, shoulderY, dir * 0.9 * s);
    sub.add(geo, mat);
  };
  for (const dir of [side, -side]) {
    const span = wing - 0.9 * s;                     // shoulder to the wall
    // primaries: nine long feathers fanning from level (the tip) to ~55° down
    for (let i = 0; i < 9; i++) { const u = i / 8; feather(dir, u * 0.95, span * (1 - u * 0.42), (0.36 - u * 0.06) * s, 0.07 * s, 0.05 * s); }
    // secondaries: shorter, fanning through the same angles between the primaries
    for (let i = 0; i < 8; i++) { const u = (i + 0.5) / 8; feather(dir, u * 0.95 + 0.05, span * (0.66 - u * 0.24), 0.34 * s, 0.07 * s, 0.17 * s); }
    // coverts: short and full over the roots
    for (let i = 0; i < 7; i++) { const u = i / 6; feather(dir, u * 0.9 + 0.08, span * (0.36 - u * 0.1), 0.3 * s, 0.07 * s, 0.29 * s); }
    // the leading edge: a spar along the top, and a ridge of muscle at the root
    sub.capsule([0.1 * s, shoulderY + 0.12 * s, dir * 0.9 * s], [0.1 * s, shoulderY, dir * (wing - 0.25 * s)], 0.12 * s, mat);
    ellipsoid(0.2 * s, shoulderY - 0.15 * s, dir * 1.35 * s, 0.32 * s, 0.42 * s, 0.7 * s);
  }
  g.add(...sub.bake().children);
  b.mesh(g);
  b.slots.push({ slot: part.glb, node: g, h, face: 'x', mirror: side < 0 });
}

function buildArk(b, part) {
  const { x, y, z } = part; const g = new THREE.Group(); g.position.set(x, y, z);
  const sub = new PieceBuilder(b.M, b.piece);
  sub.box(0, 0, 0, 2.5, 1.5, 1.5, 'gold');
  sub.box(0, 1.45, 0, 2.7, 0.12, 1.7, 'gold'); sub.box(0, 0, 0, 2.7, 0.12, 1.7, 'gold');   // crown moulding top and bottom
  sub.box(0, 1.57, 0, 2.5, 0.1, 1.5, 'gold');                                                // the kaparath (mercy seat)
  for (const sz of [-1, 1]) { sub.torus(1.05, 0.35, sz * 0.75, 0.18, 0.05, 'gold', Math.PI / 2); sub.torus(-1.05, 0.35, sz * 0.75, 0.18, 0.05, 'gold', Math.PI / 2); }   // rings for the poles
  // poles along x
  for (const sz of [-1, 1]) { const geo = new THREE.CylinderGeometry(0.07, 0.07, 4.2, 10); geo.rotateZ(Math.PI / 2); geo.translate(0, 0.35, sz * 0.75); sub.add(geo, 'goldDim'); }
  // the two small cherubim at the ends of the mercy seat, wings spread upward toward each other, faces toward the seat (Exodus 25:20)
  for (const sx of [-1, 1]) {
    const k = 0.1;   // a tenth the size of the great ones: ~1 cubit high
    sub.lathe(sx * 0.85, 1.67, 0, [[1.4 * k, 0], [1.5 * k, 0.2 * k], [1.15 * k, 2.5 * k], [0.95 * k, 5 * k], [1.05 * k, 6.8 * k], [1.35 * k, 7.4 * k], [0.9 * k, 7.9 * k], [0.45 * k, 8.1 * k], [0, 8.15 * k]], 'gold', 20);
    sub.sphere(sx * 0.85, 1.67 + 8.85 * k, 0, 0.62 * k, 'gold', 12);
    for (const sz of [-1, 1]) { const geo = wingGeo(0.9, k * 1.6); geo.rotateY(sz > 0 ? Math.PI / 2 : -Math.PI / 2); geo.rotateX(-sz * 0.95); geo.rotateY(sx > 0 ? 0.35 : -0.35); geo.translate(sx * 0.85, 1.67 + 6.9 * k, 0); sub.add(geo, 'gold'); }
  }
  g.add(...sub.bake().children); b.mesh(g);
  b.slots.push({ slot: part.glb, node: g, h: 2.7, face: 'x' });
}

/** Two leaves (or two folding pairs) in a jambed opening; opened by openAt. */
function buildDoors(b, part) {
  const { x, y, z, w, h, t } = part;
  const carved = b.piece.material === 'olive' ? 'carvedOlive' : 'carvedFir';
  const post = 'olive';
  // posts and lintel (mazawazah)
  const sub = new PieceBuilder(b.M, b.piece);
  for (const sz of [-1, 1]) sub.box(x, y, z + sz * (w / 2 + 0.35), t + 0.8, h + 0.6, 0.7, post);
  sub.box(x, y + h, z, t + 0.8, 0.7, w + 1.4, post);
  b.group.add(...sub.bake().children);
  const leaves = [];
  for (const sz of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(x, y, z + sz * w / 2);
    const nLeaf = part.fold ? 2 : 1, lw = w / 2 / nLeaf;
    let parent = hinge;
    for (let i = 0; i < nLeaf; i++) {
      const leaf = new THREE.Group();
      const geo = new THREE.BoxGeometry(t, h, lw); uvBox(geo, t, h, lw, TILE[carved]);
      const m = new THREE.Mesh(geo, b.M[carved]); m.position.set(0, h / 2, -sz * lw / 2); m.castShadow = true; m.receiveShadow = true;
      leaf.add(m);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(t + 0.06, h - 0.4, 0.12), b.M.gold); trim.position.set(0, h / 2, -sz * (lw - 0.12)); leaf.add(trim);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(t + 0.06, 0.12, lw), b.M.gold); rim.position.set(0, h - 0.3, -sz * lw / 2); leaf.add(rim);
      parent.add(leaf);
      leaves.push({ node: leaf, sz, i });
      const next = new THREE.Group(); next.position.set(0, 0, -sz * lw); leaf.add(next); parent = next;
    }
    b.group.add(hinge);
  }
  b.group.userData.doors = { leaves, open: part.open, fold: !!part.fold };
}

function buildVeil(b, part) {
  const { x, y, z, w, h } = part;
  const halves = [];
  for (const sz of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(w / 2, h, 1, 1); geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, b.M.veil); m.position.set(x, y + h / 2, z + sz * w / 4); m.castShadow = true; m.receiveShadow = true;
    m.userData.rest = sz * w / 4; b.group.add(m); halves.push({ node: m, sz });
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, w + 1, 10), b.M.gold); rod.geometry.rotateX(Math.PI / 2); rod.position.set(x, y + h + 0.1, z); b.group.add(rod);
  b.group.userData.veil = { halves, open: part.open };
}

/** The sea: a lily-brimmed bowl a handbreadth thick on twelve oxen, two rows of buds under the brim. */
function buildSea(b, part) {
  const { x, y, z, r, h, oxH } = part, top = y + oxH;
  const th = 0.25;   // a tapach (handbreadth)
  const prof = [[r * 0.55, 0], [r * 0.8, 0.5], [r * 0.95, 1.5], [r, 2.6], [r, 3.9], [r * 1.05, 4.5], [r * 1.12, 4.85], [r * 1.08, h], [r * 1.02, h - 0.1], [r - th, 4.6], [r - th, 2.6], [r * 0.9, 1.4], [r * 0.7, th + 0.35], [0, th + 0.35]];
  const geo = new THREE.LatheGeometry(prof.map(([rr, dy]) => new THREE.Vector2(Math.max(rr, 0.001), dy)), 96);
  // the lily brim: scallop the top rows
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (v.y > 4.4) { const a = Math.atan2(v.z, v.x), k = 1 + 0.05 * Math.cos(a * 12) * ((v.y - 4.4) / 0.6); pos.setXYZ(i, v.x * k, v.y + 0.06 * Math.cos(a * 12) * ((v.y - 4.4) / 0.6), v.z * k); } }
  geo.computeVertexNormals(); geo.translate(x, top, z); b.add(geo, 'brass');
  // water
  const water = new THREE.Mesh(new THREE.CircleGeometry(r - th - 0.02, 64), b.M.water); water.rotation.x = -Math.PI / 2; water.position.set(x, top + 4.3, z); b.mesh(water);
  // buds (7:24 — ten to a cubit, two rows) → 2 × 300 instanced
  const knop = new THREE.SphereGeometry(0.16, 8, 6);
  const inst = new THREE.InstancedMesh(knop, b.M.brassDark, 600);
  const m4 = new THREE.Matrix4(); let k = 0;
  for (const [ry, rr] of [[3.7, r + 0.1], [3.15, r + 0.08]]) for (let i = 0; i < 300; i++) { const a = (i / 300) * Math.PI * 2 + (ry > 3.5 ? 0 : Math.PI / 300); m4.makeTranslation(x + Math.cos(a) * rr, top + ry, z + Math.sin(a) * rr); inst.setMatrixAt(k++, m4); }
  inst.castShadow = true; b.mesh(inst);
  // twelve oxen — three to each quarter of the sky, hinder parts inward (7:25): a ring of twelve, each facing its quarter
  for (let q = 0; q < 4; q++) {
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]][q];   // tzapawan (north) −z, mazarach (east) +x, nagab (south) +z, yam (west) −x
    for (let i = -1; i <= 1; i++) {
      const a = Math.atan2(dirs[1], dirs[0]) + i * (Math.PI / 6), rr = 3.8;
      const ox = new THREE.Group(); ox.position.set(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr); ox.rotation.y = Math.atan2(-dirs[1], dirs[0]);   // its +x is its front
      const sub = new PieceBuilder(b.M, b.piece); const s = oxH / 3.2;
      const el = (px, py, pz, rx, ry, rz, rotZ = 0, rotY = 0) => { const geo = new THREE.SphereGeometry(1, 16, 12); geo.scale(rx * s, ry * s, rz * s); if (rotZ) geo.rotateZ(rotZ); if (rotY) geo.rotateY(rotY); geo.translate(px * s, py * s, pz * s); sub.add(geo, 'brass'); };
      const tube = (pts, rad, segs = 12) => sub.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0] * s, q[1] * s, q[2] * s))), segs, rad * s, 8, false), 'brass');
      // the body: one long barrel, low withers, haunches, a thick neck rising to the head, a dewlap
      el(-0.15, 2.0, 0, 1.55, 0.86, 0.76);                                 // barrel
      el(0.7, 2.18, 0, 0.75, 0.66, 0.64);                                  // withers
      el(-1.2, 2.0, 0, 0.62, 0.72, 0.6);                                   // haunches
      sub.capsule([1.05 * s, 2.15 * s, 0], [1.85 * s, 2.4 * s, 0], 0.4 * s, 'brass');   // neck
      el(1.4, 1.5, 0, 0.5, 0.26, 0.28);                                    // dewlap
      // the head: one tapered form from skull to muzzle, tilted a little down, with a broad nose
      { const head = new THREE.LatheGeometry([[0.3, 0], [0.44, 0.2], [0.43, 0.5], [0.34, 0.85], [0.29, 1.05], [0.2, 1.18]].map(([rr, t]) => new THREE.Vector2(rr * s, t * s)), 24);
        head.rotateZ(-Math.PI / 2); head.rotateZ(-0.22); head.translate(1.85 * s, 2.45 * s, 0); sub.add(head, 'brass'); }
      el(3.0, 2.15, 0, 0.16, 0.2, 0.24);                                   // the nose
      for (const sz of [-1, 1]) {
        el(2.05, 2.6, sz * 0.42, 0.13, 0.09, 0.22, 0, sz * 0.5);          // ears, out to the side
        tube([[2.0, 2.72, sz * 0.12], [1.98, 2.88, sz * 0.4], [2.12, 3.0, sz * 0.58], [2.4, 2.98, sz * 0.62]], 0.07);   // horns: out, then curving forward
        el(2.4, 2.98, sz * 0.62, 0.05, 0.05, 0.05);
        el(2.35, 2.5, sz * 0.36, 0.09, 0.07, 0.05);                        // brow
      }
      // legs: thigh/upper, a knee, the shank, a hoof — hind legs angled back
      for (const [lx, lz, hind] of [[0.95, -0.42, false], [0.95, 0.42, false], [-1.0, -0.42, true], [-1.0, 0.42, true]]) {
        el(lx, 1.55, lz, 0.28, 0.5, 0.24);                                 // upper leg
        sub.capsule([lx * s, 1.35 * s, lz * s], [(lx + (hind ? -0.12 : 0.02)) * s, 0.75 * s, lz * s], 0.15 * s, 'brass');
        el(lx + (hind ? -0.1 : 0.02), 0.78, lz, 0.17, 0.15, 0.16);          // knee / hock
        sub.capsule([(lx + (hind ? -0.1 : 0.02)) * s, 0.75 * s, lz * s], [(lx + (hind ? -0.04 : 0.05)) * s, 0.2 * s, lz * s], 0.12 * s, 'brass');
        sub.cyl((lx + (hind ? -0.04 : 0.05)) * s, 0, lz * s, 0.17 * s, 0.22 * s, 'brassDark', 0.15 * s, 10);   // hoof
      }
      // tail, with its tuft
      tube([[-1.7, 2.45, 0], [-1.95, 2.0, 0.05], [-2.0, 1.3, 0.1], [-1.9, 0.8, 0.12]], 0.06, 10);
      el(-1.9, 0.72, 0.12, 0.11, 0.2, 0.11);
      ox.add(...sub.bake().children); b.mesh(ox);
      b.slots.push({ slot: part.glb, node: ox, h: oxH, face: 'x' });
    }
  }
}

/** One of the ten bases: a brass frame with pictured panels on chariot wheels, a round socket, a basin. */
function buildBase(b, part) {
  const { x, y, z, w, h, wheel, basinR } = part;
  const g = new THREE.Group(); g.position.set(x, y, z); g.userData.slot = part.glb;
  const sub = new PieceBuilder(b.M, b.piece);
  const fy = wheel * 2 * 0.35;   // the frame sits just above the axles
  const fh = h - fy;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sub.box(sx * (w / 2 - 0.2), fy, sz * (w / 2 - 0.2), 0.4, fh, 0.4, 'brass');            // corner posts (7:34 supports)
  for (const sz of [-1, 1]) { sub.box(0, fy, sz * (w / 2 - 0.15), w, 0.3, 0.3, 'brass'); sub.box(0, fy + fh - 0.3, sz * (w / 2 - 0.15), w, 0.3, 0.3, 'brass'); }   // ledges (shalabayam)
  for (const sx of [-1, 1]) { sub.box(sx * (w / 2 - 0.15), fy, 0, 0.3, 0.3, w, 'brass'); sub.box(sx * (w / 2 - 0.15), fy + fh - 0.3, 0, 0.3, 0.3, w, 'brass'); }
  // panels between the ledges: lions, oxen, cherubim (7:29)
  for (const sz of [-1, 1]) sub.box(0, fy + 0.3, sz * (w / 2 - 0.15), w - 0.8, fh - 0.6, 0.12, 'panel');
  for (const sx of [-1, 1]) { const geo = new THREE.BoxGeometry(0.12, fh - 0.6, w - 0.8); uvBox(geo, 0.12, fh - 0.6, w - 0.8, TILE.panel); geo.translate(sx * (w / 2 - 0.15), fy + 0.3 + (fh - 0.6) / 2, 0); sub.add(geo, 'panel'); }
  // axles and four wheels like chariot wheels (7:30–33): rim, hub, six spokes
  for (const sx of [-1, 1]) {
    const axle = new THREE.CylinderGeometry(0.1, 0.1, w + 0.9, 10); axle.rotateX(Math.PI / 2); axle.translate(sx * (w / 2 - 0.9), wheel, 0); sub.add(axle, 'brassDark');
    for (const sz of [-1, 1]) {
      const cz = sz * (w / 2 + 0.25), cx = sx * (w / 2 - 0.9);
      sub.torus(cx, wheel, cz, wheel - 0.12, 0.12, 'brass');                                  // rim (in the x/y plane: torus faces ±z) — no rotation needed
      { const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12); hub.rotateX(Math.PI / 2); hub.translate(cx, wheel, cz); sub.add(hub, 'brassDark'); }   // hub
      for (let i = 0; i < 6; i++) { const geo = new THREE.BoxGeometry(0.08, wheel - 0.2, 0.08); geo.translate(0, (wheel - 0.2) / 2, 0); geo.rotateZ((i / 6) * Math.PI * 2); geo.translate(cx, wheel, cz); sub.add(geo, 'brass'); }
    }
  }
  // the round socket on top (7:31, 35) and the basin (7:38)
  sub.lathe(0, h, 0, [[0.9, 0], [0.75, 0.25], [0.8, 0.5]], 'brass', 24);
  sub.lathe(0, h + 0.5, 0, [[0.6, 0], [1.3, 0.35], [basinR * 0.92, 1.0], [basinR, 1.5], [basinR - 0.12, 1.5], [basinR * 0.88, 1.0], [1.2, 0.5], [0.5, 0.3], [0, 0.3]], 'brass', 40);
  g.add(...sub.bake().children);
  const water = new THREE.Mesh(new THREE.CircleGeometry(basinR - 0.14, 40), b.M.water); water.rotation.x = -Math.PI / 2; water.position.set(0, h + 0.5 + 1.38, 0); g.add(water);
  b.mesh(g);
  b.slots.push({ slot: part.glb, node: g, h, face: 'x', keep: [water] });
}

/**
 * Yakayan / Baiz: a brass shaft 18 high, then the capital of 7:16–20 — the bowl
 * (galath) swelling at its belly (batan), a real CHECKER NET of chain laid over it
 * (two families of helical cords crossing in diamonds, 7:17), SEVEN WREATHS of
 * chain work, TWO ROWS OF A HUNDRED pomegranates each with its crown, and above
 * them the LILY WORK, four cubits — eight petals opening from a calyx (7:19, 22).
 */
function buildPillar(b, part) {
  const { x, y, z, r, h, capH, lilyH } = part;
  b.lathe(x, y, z, [[r * 1.3, 0], [r * 1.3, 0.25], [r * 1.12, 0.5], [r * 1.05, 0.7], [r, 0.9]], 'brass', 48);        // a base ring (assumed)
  b.cyl(x, y + 0.9, z, r, h - 0.9, 'brass', r, 64);                                                                     // the shaft, 18 high
  b.torus(x, y + h - 0.15, z, r * 1.02, 0.09, 'brassDark', Math.PI / 2);                                              // an astragal under the capital
  const cap = new THREE.Group(); cap.position.set(x, y + h, z); cap.userData.slot = part.glb;
  const sub = new PieceBuilder(b.M, b.piece);
  // the bowl: its radius as a function of height, shared by everything laid on it
  const bowlR = (t) => r * (1.0 + 0.48 * Math.sin(Math.PI * Math.min(1, t / capH)) * (t < capH * 0.4 ? 1 : 0.92) - 0.06 * (t / capH));   // belly low, easing in to the top
  const prof = []; for (let i = 0; i <= 24; i++) { const t = (i / 24) * capH; prof.push([bowlR(t), t]); }
  sub.lathe(0, 0, 0, prof, 'brass', 72);
  // the net: 18 cords winding one way and 18 the other, each a tube on the bowl's skin
  for (const dirn of [1, -1]) for (let i = 0; i < 18; i++) {
    const pts = []; const a0 = (i / 18) * Math.PI * 2;
    for (let k = 0; k <= 24; k++) { const t = 0.25 + (k / 24) * (capH - 0.6); const a = a0 + dirn * (k / 24) * Math.PI * 0.9; const rr = bowlR(t) + 0.07; pts.push(new THREE.Vector3(Math.cos(a) * rr, t, Math.sin(a) * rr)); }
    sub.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.05, 6, false), 'brassDark');
  }
  // seven wreaths of chain work: a torus at each of seven heights, beaded to read as chain
  for (let i = 0; i < 7; i++) {
    const t = 0.35 + i * ((capH - 0.7) / 6), rr = bowlR(t) + 0.1;
    sub.torus(0, t, 0, rr, 0.055, 'brassDark', Math.PI / 2);
    const beads = new THREE.SphereGeometry(0.075, 6, 5), n = Math.round(rr * 2 * Math.PI / 0.28);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const g2 = beads.clone(); g2.translate(Math.cos(a) * rr, t, Math.sin(a) * rr); sub.add(g2, 'brass'); }
  }
  // two rows of a hundred pomegranates (7:18, 20, 42): a globe with a crowned calyx, hung out from the net
  const pomGeo = new THREE.SphereGeometry(0.2, 12, 9); pomGeo.scale(1, 1.12, 1);
  const crownGeo = new THREE.CylinderGeometry(0.1, 0.06, 0.1, 6, 1, true);
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5);
  for (const [t, off] of [[capH * 0.34, 0], [capH * 0.58, Math.PI / 100]]) {
    const rr = bowlR(t) + 0.34;
    for (let i = 0; i < 100; i++) {
      const a = (i / 100) * Math.PI * 2 + off, cx = Math.cos(a), cz = Math.sin(a);
      const g2 = pomGeo.clone(); g2.translate(cx * rr, t - 0.1, cz * rr); sub.add(g2, 'brass');
      const c2 = crownGeo.clone(); c2.translate(cx * rr, t + 0.17, cz * rr); sub.add(c2, 'brassDark');
      const st = stemGeo.clone(); st.rotateZ(Math.PI / 2); st.rotateY(-a); st.translate(cx * (rr - 0.2), t + 0.02, cz * (rr - 0.2)); sub.add(st, 'brassDark');
    }
  }
  // the lily work: a calyx, then eight petals opening outward over four cubits, with a ridge down each
  sub.lathe(0, capH - 0.1, 0, [[bowlR(capH) * 0.95, 0], [r * 0.85, 0.4], [r * 0.8, 0.9], [r * 0.95, 1.2]], 'brass', 48);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pts = []; for (let k = 0; k <= 8; k++) { const u = k / 8; const rr = r * (0.8 + 1.25 * Math.pow(u, 1.6)); pts.push(new THREE.Vector3(Math.cos(a) * rr, capH + 0.9 + u * (lilyH - 0.9), Math.sin(a) * rr)); }
    const petal = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 1, 8, false);
    const p = petal.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3(); const curve = new THREE.CatmullRomCurve3(pts);
    for (let j = 0; j < p.count; j++) {                        // flatten the tube into a blade: wide across, thin radially, tapering at the tip
      v.fromBufferAttribute(p, j); const u = Math.floor(j / 9) / 16; curve.getPointAt(Math.min(1, u), c);
      const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z; const radial = dx * Math.cos(a) + dz * Math.sin(a), tang = -dx * Math.sin(a) + dz * Math.cos(a);
      const wdt = (0.55 + 0.35 * Math.sin(u * Math.PI)) * r * 0.9, thk = 0.09 * (1 - u * 0.5) + 0.05 * Math.cos(tang * 4);
      p.setXYZ(j, c.x + Math.cos(a) * radial * thk - Math.sin(a) * tang * wdt, c.y + dy * 0.12, c.z + Math.sin(a) * radial * thk + Math.cos(a) * tang * wdt);
    }
    petal.computeVertexNormals(); sub.add(petal, 'brass');
    const rib = []; for (let k = 0; k <= 8; k++) { const u = k / 8; const rr = r * (0.8 + 1.25 * Math.pow(u, 1.6)) - 0.06; rib.push(new THREE.Vector3(Math.cos(a) * rr, capH + 0.9 + u * (lilyH - 0.9) + 0.03, Math.sin(a) * rr)); }
    sub.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rib), 12, 0.05, 6, false), 'brassDark');
  }
  // the pistil in the middle
  sub.lathe(0, capH + 0.9, 0, [[0.4, 0], [0.34, 1.2], [0.42, 1.9], [0.3, 2.3], [0, 2.4]], 'brass', 24);
  cap.add(...sub.bake().children);
  b.mesh(cap);
  b.slots.push({ slot: part.glb, node: cap, h: capH + lilyH, face: 'x', keep: [] });
}

/**
 * A lampstand "according to the mashapat (ordinance)" (2 Chr 4:7) — Exodus 25:31–40: a
 * base, a shaft, six branches out of its sides (three each way) rising to one
 * height; on each branch three cups like almond blossoms with a bud and a flower;
 * on the shaft four; a lamp on each of the seven. Hammered gold. `h` is its height.
 */
function buildLampstand(b, part) {
  const { x, y, z, h } = part, s = h / 3;
  const g = new THREE.Group(); g.position.set(x, y, z); g.userData.slot = part.glb;
  const sub = new PieceBuilder(b.M, b.piece);
  const mat = 'gold';
  // the almond cup (a little flaring calyx), the bud (a knop) and the flower (a ring of petals) as one ornament
  const ornament = (px, py, pz, k = 1) => {
    sub.lathe(px, py, pz, [[0.05 * s * k, 0], [0.13 * s * k, 0.09 * s * k], [0.11 * s * k, 0.14 * s * k], [0.04 * s * k, 0.16 * s * k]], mat, 16);   // cup
    sub.sphere(px, py + 0.2 * s * k, pz, 0.075 * s * k, mat, 12);                                                                              // bud
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pt = new THREE.SphereGeometry(1, 8, 6); pt.scale(0.06 * s * k, 0.025 * s * k, 0.03 * s * k); pt.rotateY(-a); pt.translate(px + Math.cos(a) * 0.09 * s * k, py + 0.3 * s * k, pz + Math.sin(a) * 0.09 * s * k); sub.add(pt, mat); }   // flower
  };
  // base: a stepped foot on three low feet
  sub.lathe(0, 0, 0, [[0.6 * s, 0], [0.62 * s, 0.06 * s], [0.5 * s, 0.14 * s], [0.34 * s, 0.26 * s], [0.16 * s, 0.4 * s], [0.09 * s, 0.5 * s]], mat, 32);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 6; sub.sphere(Math.cos(a) * 0.5 * s, 0.04 * s, Math.sin(a) * 0.5 * s, 0.07 * s, mat, 10); }
  // the shaft, with its four ornaments (one under each pair of branches, one at the top)
  sub.cyl(0, 0.45 * s, 0, 0.065 * s, 2.2 * s, mat, 0.075 * s, 12);
  const branchY = [1.15, 1.5, 1.85].map((v) => v * s), TOP = 2.72 * s;
  for (let i = 0; i < 3; i++) ornament(0, branchY[i] - 0.28 * s, 0, 0.85);
  ornament(0, 2.28 * s, 0, 0.9);
  // six branches: each a quarter-round out of the shaft turning up to the common height, three ornaments along it
  for (let i = 0; i < 3; i++) {
    const R = (0.42 + i * 0.36) * s;             // outer branches spring lower and reach farther
    for (const sx of [-1, 1]) {
      const pts = []; for (let k = 0; k <= 10; k++) { const t = (k / 10) * Math.PI / 2; pts.push(new THREE.Vector3(sx * R * Math.sin(t), branchY[2 - i] + (TOP - branchY[2 - i]) * (1 - Math.cos(t)), 0)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      sub.add(new THREE.TubeGeometry(curve, 20, 0.05 * s, 8, false), mat);
      for (let k = 1; k <= 3; k++) { const q = curve.getPointAt(0.3 + k * 0.2); ornament(q.x, q.y - 0.14 * s, q.z, 0.62); }
    }
  }
  // seven lamps: a small bowl with a lip and a spout toward the shaft's front, a flame in each
  const lampAt = (px) => {
    sub.lathe(px, TOP - 0.02 * s, 0, [[0.03 * s, 0], [0.13 * s, 0.05 * s], [0.15 * s, 0.11 * s], [0.12 * s, 0.13 * s], [0.06 * s, 0.09 * s], [0, 0.09 * s]], mat, 16);
    const spout = new THREE.SphereGeometry(1, 8, 6); spout.scale(0.05 * s, 0.03 * s, 0.09 * s); spout.translate(px, TOP + 0.09 * s, 0.14 * s); sub.add(spout, mat);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.13 * s, 8), b.M.flame); f.position.set(px, TOP + 0.18 * s, 0.14 * s); g.add(f);
  };
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) lampAt(sx * (0.42 + i * 0.36) * s);
  lampAt(0);
  g.add(...sub.bake().children); b.mesh(g);
  const light = new THREE.PointLight(0xffc880, 0, 12, 2); light.position.set(0, TOP + 0.3 * s, 0); g.add(light); g.userData.lamp = light;
  b.slots.push({ slot: part.glb, node: g, h, face: 'x' });
}

/**
 * A table of the show bread — Exodus 25:23–30: 2 × 1, 1½ high, a crown of gold round
 * its top, a border a handbreadth wide with its own crown, four legs with rings at the
 * border's corners for the poles, and on it the twelve loaves in two rows of six
 * (Leviticus 24:6) with the dishes, spoons, jars and bowls of the ordinance.
 */
function buildTable(b, part) {
  const { x, y, z } = part; const g = new THREE.Group(); g.position.set(x, y, z); g.userData.slot = part.glb;
  const sub = new PieceBuilder(b.M, b.piece);
  sub.box(0, 1.36, 0, 2, 0.14, 1, 'gold');                                                                          // the top
  for (const sz of [-1, 1]) sub.box(0, 1.5, sz * 0.475, 2.04, 0.1, 0.05, 'gold'); for (const sx of [-1, 1]) sub.box(sx * 0.995, 1.5, 0, 0.05, 0.1, 1.04, 'gold');   // its crown (a raised rim)
  for (let i = 0; i < 28; i++) { const t = i / 28, per = 6; const u = (t * per) % 6; let px, pz;                       // beading on the crown
    if (u < 2) { px = -1 + u; pz = -0.475; } else if (u < 3) { px = 1; pz = -0.475 + (u - 2) * 0.95; } else if (u < 5) { px = 1 - (u - 3); pz = 0.475; } else { px = -1; pz = 0.475 - (u - 5) * 0.95; }
    sub.sphere(px, 1.58, pz, 0.035, 'gold', 8); }
  sub.box(0, 0.95, 0, 2, 0.16, 1, 'gold');                                                                          // the border, a handbreadth, below the top
  for (const sz of [-1, 1]) sub.box(0, 1.11, sz * 0.475, 2.02, 0.05, 0.04, 'gold'); for (const sx of [-1, 1]) sub.box(sx * 0.985, 1.11, 0, 0.04, 0.05, 1.02, 'gold');   // the border's crown
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.42, 0.42]) {
    sub.lathe(sx, 0, sz, [[0.09, 0], [0.07, 0.1], [0.06, 0.9], [0.075, 1.0], [0.06, 1.36]], 'gold', 12);              // legs, turned
    sub.sphere(sx, 0.45, sz, 0.075, 'gold', 10);                                                                     // a knop on each
    sub.torus(sx + Math.sign(sx) * 0.08, 1.0, sz, 0.07, 0.02, 'gold', 0, Math.PI / 2);                                // a ring for the poles at the border
  }
  for (const sz of [-0.24, 0.24]) for (let i = 0; i < 6; i++) { const lg = new THREE.SphereGeometry(1, 10, 6); lg.scale(0.13, 0.05, 0.19); lg.translate(-0.68 + i * 0.27, 1.49, sz); sub.add(lg, 'ivory'); }   // twelve loaves, two rows of six
  sub.lathe(0.86, 1.43, -0.32, [[0.02, 0], [0.09, 0.03], [0.1, 0.06], [0.04, 0.05], [0, 0.05]], 'gold', 12);          // a dish
  sub.lathe(0.86, 1.43, 0.32, [[0.05, 0], [0.06, 0.16], [0.045, 0.2], [0.03, 0.26], [0, 0.26]], 'gold', 12);          // a jar
  sub.lathe(-0.86, 1.43, 0.32, [[0.06, 0], [0.09, 0.05], [0.07, 0.08], [0, 0.08]], 'gold', 12);                        // a bowl
  { const sp = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6); sp.rotateZ(Math.PI / 2); sp.translate(-0.86, 1.45, -0.32); sub.add(sp, 'gold'); sub.sphere(-0.95, 1.45, -0.32, 0.03, 'gold', 8); }   // a spoon
  g.add(...sub.bake().children); b.mesh(g);
  b.slots.push({ slot: part.glb, node: g, h: 1.6, face: 'x' });
}

/** The ivory throne of 1 Kings 10:18–20: six steps, a round-backed seat, lions beside the arms and twelve on the steps. */
function buildThrone(b, part) {
  const { x, y, z } = part; const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.PI / 2; g.userData.slot = part.glb;
  const sub = new PieceBuilder(b.M, b.piece);
  for (let i = 0; i < 6; i++) sub.box(-3 + i * 0.55, i * 0.45, 0, 1.2, 0.45, 6 - i * 0.5, 'ivory');
  sub.box(1.2, 2.7, 0, 1.6, 0.4, 2, 'gold'); sub.box(1.9, 3.1, 0, 0.3, 2.2, 2, 'ivory');
  const back = new THREE.CylinderGeometry(1, 1, 0.3, 24, 1, false, 0, Math.PI); back.rotateX(Math.PI / 2); back.rotateY(Math.PI / 2); back.translate(1.95, 5.3, 0); sub.add(back, 'gold');
  const lion = (lx, ly, lz, s) => { sub.capsule([lx - 0.35 * s, ly + 0.3 * s, lz], [lx + 0.3 * s, ly + 0.32 * s, lz], 0.22 * s, 'gold'); sub.sphere(lx + 0.5 * s, ly + 0.5 * s, lz, 0.2 * s, 'gold', 10); for (const dx of [-0.3, 0.25]) for (const dz of [-0.12, 0.12]) sub.cyl(lx + dx * s, ly, lz + dz * s, 0.06 * s, 0.3 * s, 'gold', 0.06 * s, 8); };
  for (const sz of [-1, 1]) lion(1.2, 3.1, sz * 1.1, 1);
  for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) lion(-3 + i * 0.55, i * 0.45 + 0.45, sz * (2.6 - i * 0.25), 0.6);
  g.add(...sub.bake().children); b.mesh(g);
  b.slots.push({ slot: part.glb, node: g, h: 6, face: 'x' });
}

function buildPiece(M, piece) {
  const b = new PieceBuilder(M, piece);
  for (const part of piece.parts) {
    switch (part.kind) {
      case 'box': buildBox(b, part); break;
      case 'cyl': b.cyl(part.x, part.y, part.z, part.r, part.h, part.mat || piece.material, part.r2 || part.r); break;
      case 'lathe': b.lathe(part.x, part.y, part.z, part.profile, part.mat || piece.material); break;
      case 'ramp': buildRamp(b, part); break;
      case 'cherub': buildCherub(b, part); break;
      case 'ark': buildArk(b, part); break;
      case 'doors': buildDoors(b, part); break;
      case 'veil': buildVeil(b, part); break;
      case 'sea': buildSea(b, part); break;
      case 'base': buildBase(b, part); break;
      case 'pillar': buildPillar(b, part); break;
      case 'lampstand': buildLampstand(b, part); break;
      case 'table': buildTable(b, part); break;
      case 'throne': buildThrone(b, part); break;
      default: break;
    }
  }
  // gates in the court walls: cedar doors overlaid with brass (2 Chronicles 4:9), open
  for (const gate of piece.gates || []) {
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(gate.axis === 'z' ? 0.4 : gate.w / 2, 6, gate.axis === 'z' ? gate.w / 2 : 0.4), M.brassDark);
      leaf.position.set(gate.x + (gate.axis === 'x' ? s * gate.w * 0.36 : s * 1.6), H.courtY + 3, gate.z + (gate.axis === 'z' ? s * gate.w * 0.36 : s * 1.6));
      leaf.rotation.y = gate.axis === 'z' ? s * 1.2 : -s * 1.2; leaf.castShadow = true; b.mesh(leaf);
    }
  }
  const g = b.bake();
  g.userData.slots = b.slots;
  // The piece grows from its own base in the BUILD story: hoist the group to its
  // lowest point and shift the children down so scale.y rises from that base.
  const box = new THREE.Box3().setFromObject(g);
  const base = box.isEmpty() ? 0 : box.min.y;
  g.position.y = base; g.children.forEach((c) => { c.position.y -= base; });
  g.userData.base = base;
  return g;
}

/** Cut the court walls at their gates: done by rebuilding the wall boxes with a gap where a gate stands. */
function cutGates(piece) {
  if (!piece.gates) return piece;
  const parts = [];
  for (const p of piece.parts) {
    let cut = false;
    for (const gate of piece.gates) {
      if (p.kind !== 'box' || p.role === 'ground') continue;
      if (gate.axis === 'z' && Math.abs(p.x - gate.x) < p.w && p.d > gate.w * 2) {   // an east/west wall: the gap runs along z
        const d1 = (gate.z - gate.w / 2) - (p.z - p.d / 2), d2 = (p.z + p.d / 2) - (gate.z + gate.w / 2);
        parts.push({ ...p, z: p.z - p.d / 2 + d1 / 2, d: d1 }, { ...p, z: p.z + p.d / 2 - d2 / 2, d: d2 }, { ...p, y: p.y + 6, h: p.h - 6, z: gate.z, d: gate.w, courses: 0 });
        cut = true; break;
      }
      if (gate.axis === 'x' && Math.abs(p.z - gate.z) < p.d && p.w > gate.w * 2) {
        const w1 = (gate.x - gate.w / 2) - (p.x - p.w / 2), w2 = (p.x + p.w / 2) - (gate.x + gate.w / 2);
        parts.push({ ...p, x: p.x - p.w / 2 + w1 / 2, w: w1 }, { ...p, x: p.x + p.w / 2 - w2 / 2, w: w2 }, { ...p, y: p.y + 6, h: p.h - 6, x: gate.x, w: gate.w, courses: 0 });
        cut = true; break;
      }
    }
    if (!cut) parts.push(p);
  }
  return { ...piece, parts };
}

// ── Sculpted parts (Meshy) ───────────────────────────────────────────────────
// A GLB named for its slot replaces the procedural stand-in of every part that
// declares that slot: fitted to the slot's height, stood on y = 0, centred on
// x/z, turned to face +x (the sculpt should face +z, Meshy's default front).
const glbCache = new Map();
async function loadGlb(name) {
  if (!glbCache.has(name)) {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    glbCache.set(name, loader.loadAsync(GLB_URL(name)).then((gltf) => {
      const root = gltf.scene; root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return null;
      const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
      const group = new THREE.Group();
      root.traverse((m) => {
        if (!m.isMesh) return;
        const mesh = new THREE.Mesh(m.geometry, m.material);
        if (m.material) { m.material.envMapIntensity = 0.6; }
        mesh.applyMatrix4(m.matrixWorld); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
      });
      group.children.forEach((m) => { m.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z)); });
      group.userData.size = size;
      return group;
    }).catch((e) => { if (e?.message && !/404/.test(e.message)) console.warn(`[temple] sculpted ${name} not loaded:`, e.message || e); return null; }));
  }
  return glbCache.get(name);
}
function fitSlot(proto, slot) {
  const g = proto.clone(true);
  const k = slot.h / (proto.userData.size.y || 1);
  const wrap = new THREE.Group();
  g.scale.setScalar(k); g.rotation.y = -Math.PI / 2;   // +z front → +x
  if (slot.mirror) { wrap.scale.z = -1; g.traverse((o) => { if (o.isMesh && o.material) o.material.side = THREE.DoubleSide; }); }
  wrap.add(g);
  return wrap;
}


// ── The land: the relief map the Build story opens on ────────────────────────
// One map unit = ⅓ km, Yarawashalam at the origin (see PLACES in temple.js).
// A coloured height field: the yam to the west, the coast, the hill country,
// the rift of the Yaradan with the salt sea in it, Labanawan's mountains under
// cedar to the north; the routes drawn as pale ribbons; the places as small
// stone towns with their names; rafts, carts, sledges and a caravan slide along
// the routes. The site itself is a flat shelf at y = −4 so the house lands on it.
const SEA_Y = -12;
function coastX(z) { return -152 - 0.13 * z + 14 * Math.sin(z / 95) + 6 * Math.sin(z / 31); }   // the shore bends east going north, as it does
function landHeight(x, z) {
  const c = coastX(z);
  if (x < c) return SEA_Y - 3 - (c - x) * 0.02;
  let h = -8 + Math.min(1, (x - c) / 120) * 16;                       // the coastal plain climbing to the hill country
  h += 6 * Math.sin(x / 23 + z / 41) * Math.sin(z / 17) * Math.min(1, (x - c) / 60);
  const rift = Math.exp(-((x - 78) ** 2) / (2 * 22 * 22));            // the Yaradan's valley
  h = h * (1 - rift) + (-9) * rift;
  if (x > 78 + 40) h += Math.min(1, (x - 118) / 60) * 14;             // the land east of the Yaradan
  if (z < -430) { const k = Math.min(1, (-430 - z) / 90); h += k * (16 + 12 * Math.sin(x / 19) * Math.sin(z / 23) + 10 * Math.sin(x / 47 + z / 31)); }   // Labanawan
  if (z < -80 && x > 40 && x < 110) h = Math.max(h, -3);
  if (x > 62 && x < 96 && z > -4 && z < 180) h = -10;                 // the salt sea
  const r = Math.hypot(x, z);                                          // the shelf the house stands on
  if (r < 34) h = -4; else if (r < 70) { const k = (r - 34) / 36; h = -4 * (1 - k) + h * k; }
  return h;
}
function landColour(x, z, h) {
  const c = new THREE.Color();
  if (h < SEA_Y - 0.5) c.set('#3b6f8a');
  else if (h < -6 && x > 60 && x < 100) c.set('#c7b88f');           // the rift floor
  else if (z < -430 && h > 8) c.set(h > 22 ? '#8d8f86' : '#4c6a3a');  // Labanawan: rock above, forest below
  else if (x < coastX(z) + 25) c.set('#d8c79c');                       // the sandy plain
  else c.set('#9c8f66').lerp(new THREE.Color('#7f8a55'), Math.max(0, Math.min(1, (h + 4) / 16)));
  c.offsetHSL(0, 0, (Math.sin(x * 0.37) * Math.sin(z * 0.41)) * 0.03);
  return c;
}
function textSprite(text, scale = 1) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.font = '600 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(30,22,10,0.85)'; g.strokeText(text, 256, 48); g.fillStyle = '#ffe9b0'; g.fillText(text, 256, 48);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(64 * scale, 12 * scale, 1); sp.renderOrder = 10; return sp;
}
function buildLand(M) {
  const group = new THREE.Group(); group.name = 'land';
  const fades = [];   // materials whose opacity follows the map's presence
  const fadeMat = (m) => { m.transparent = true; fades.push(m); return m; };
  // height field
  const SZ = 2600, N = 260;
  const geo = new THREE.PlaneGeometry(SZ, SZ, N, N); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -150);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = landHeight(x, z); pos.setY(i, h);
    const c = landColour(x, z, h); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, fadeMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })));
  terrain.receiveShadow = true; group.add(terrain);
  // the yam
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(SZ, SZ), fadeMat(new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f6c8f'), roughness: 0.25, metalness: 0.05 })));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, SEA_Y, -150); group.add(sea);
  // cedars on Labanawan (instanced), and a few on the hills
  const nTrees = 420;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.7, 5, 6), fadeMat(new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a3b1f'), roughness: 1 })), nTrees);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(4.2, 9, 7), fadeMat(new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f5a2a'), roughness: 1 })), nTrees);
  const m4 = new THREE.Matrix4(); let sd = 5; const rr = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  for (let i = 0; i < nTrees; i++) {
    let x, z, h; let tries = 0;
    do { x = -160 + rr() * 260; z = -700 + rr() * 220; h = landHeight(x, z); tries++; } while ((h < 4 || h > 24 || x < coastX(z) + 10) && tries < 20);
    const k = 0.8 + rr() * 0.8;
    m4.compose(new THREE.Vector3(x, h + 2.5 * k, z), new THREE.Quaternion(), new THREE.Vector3(k, k, k)); trunk.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, h + 9 * k, z), new THREE.Quaternion(), new THREE.Vector3(k, k, k)); crown.setMatrixAt(i, m4);
  }
  trunk.castShadow = crown.castShadow = true; group.add(trunk, crown);
  // routes as pale ribbons
  const curves = {};
  for (const [key, r] of Object.entries(ROUTES)) {
    const pts = r.pts.map(([x, z]) => new THREE.Vector3(x, landHeight(x, z) + (key === 'raft' ? SEA_Y - landHeight(x, z) + 0.6 : 0.6), z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.4); curves[key] = curve;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, key === 'raft' ? 0.9 : 0.7, 6, false), fadeMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(key === 'raft' ? '#dbe9f0' : '#f2e6c8'), transparent: true, opacity: 0.75 })));
    group.add(tube);
  }
  // places: a huddle of stone blocks and a name
  const town = fadeMat(new THREE.MeshStandardMaterial({ color: new THREE.Color('#e4d7b4'), roughness: 0.9 }));
  for (const [key, pl] of Object.entries(PLACES)) {
    const [x, z] = pl.at; const h = landHeight(x, z);
    if (key !== 'yam' && key !== 'yaradan' && key !== 'labanawan' && key !== 'parawayam' && key !== 'har') {
      for (let i = 0; i < (key === 'yarawashalam' ? 14 : 7); i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2 + rr() * 2, 1.2 + rr() * 2, 2 + rr() * 2), town); b.position.set(x + (rr() - 0.5) * 12, h + 0.8, z + (rr() - 0.5) * 12); b.castShadow = true; group.add(b); }
    }
    if (key === 'har') { const qm = fadeMat(M.stone.clone()); for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), qm); b.position.set(x + (rr() - 0.5) * 10, h + 1.1, z + (rr() - 0.5) * 8); group.add(b); } }
    const sp = textSprite(pl.label, key === 'yam' || key === 'labanawan' ? 1.7 : key === 'parawayam' ? 1.3 : 1); sp.position.set(x, h + (key === 'yam' ? 8 : 16), z); sp.material.transparent = true; fades.push(sp.material); group.add(sp);
  }
  // the furnace by Sakawath: a plume of smoke
  const NS = 120, smokeGeo = new THREE.BufferGeometry(), smokePos = new Float32Array(NS * 3);
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smoke = new THREE.Points(smokeGeo, fadeMat(new THREE.PointsMaterial({ color: 0xcfc4b4, size: 3.2, transparent: true, opacity: 0.55, depthWrite: false })));
  smoke.frustumCulled = false; group.add(smoke);
  const sk = PLACES.sakawath.at, skh = landHeight(sk[0], sk[1]);
  // movers
  const loads = { logs: fadeMat(M.cedar.clone()), stone: fadeMat(M.stone.clone()), brass: fadeMat(M.brass.clone()), gold: fadeMat(M.gold.clone()) };
  const cartMat = fadeMat(new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b4a2c'), roughness: 0.9 })), oxMat = fadeMat(new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3524'), roughness: 1 }));
  const movers = MOVERS.map((m) => {
    const g = new THREE.Group();
    if (m.kind === 'raft') {
      for (let i = 0; i < 6; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 9, 8), loads.logs); log.rotation.z = Math.PI / 2; log.position.set(0, 0.4, -3 + i * 1.2); g.add(log); }
      const man = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.2, 3, 8), oxMat); man.position.set(3.5, 1.4, 0); g.add(man);
    } else if (m.kind === 'sledge') {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 2.6), cartMat); bed.position.y = 0.3; g.add(bed);
      const block = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 1.9), loads.stone); block.position.y = 1.5; g.add(block);
      for (const sx of [-1, 1]) { const ox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1), oxMat); ox.position.set(4.5, 1.2, sx * 0.8); g.add(ox); }
    } else if (m.kind === 'caravan') {
      for (let i = 0; i < 3; i++) { const camel = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 2.2, 3, 8), oxMat); camel.rotation.z = Math.PI / 2; camel.position.set(-i * 3.5, 1.8, 0); g.add(camel); const pack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.6), loads.gold); pack.position.set(-i * 3.5, 2.8, 0); g.add(pack); }
    } else {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.5, 2.6), cartMat); bed.position.y = 1.1; g.add(bed);
      for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 6, 14), cartMat); w.rotation.y = Math.PI / 2; w.position.set(0, 0.95, sx * 1.5); g.add(w); }
      if (m.load === 'logs') for (let i = 0; i < 3; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 8, 8), loads.logs); log.rotation.z = Math.PI / 2; log.position.set(0, 1.9 + (i === 2 ? 0.9 : 0), i === 2 ? 0 : (i ? 0.6 : -0.6)); g.add(log); }
      else { const load = new THREE.Mesh(m.load === 'brass' ? new THREE.SphereGeometry(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.BoxGeometry(2.6, 1.4, 1.8), loads[m.load]); load.position.y = 1.4 + (m.load === 'brass' ? 0 : 0.7); g.add(load); }
      for (const sx of [-1, 1]) { const ox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1), oxMat); ox.position.set(4.2, 1.2, sx * 0.8); g.add(ox); }
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.visible = false; group.add(g);
    return { m, node: g, curve: curves[m.route] };
  });
  const tangent = new THREE.Vector3(), pnt = new THREE.Vector3();
  function place(t, presence) {
    group.visible = presence > 0.001;
    for (const mat of fades) mat.opacity = Math.min(mat.userData.baseOpacity ?? (mat.userData.baseOpacity = mat.opacity ?? 1), 1) * presence;
    if (!group.visible) return;
    for (const { m, node, curve } of movers) {
      const a = moverAt(m, t); node.visible = a.visible; if (!a.visible) continue;
      curve.getPointAt(a.u, pnt); curve.getTangentAt(a.u, tangent);
      node.position.copy(pnt); node.rotation.y = Math.atan2(-tangent.z, tangent.x);
      if (m.kind === 'raft') node.position.y += Math.sin(t * 2.3 + m.t0 * 7) * 0.25;
    }
    // smoke drifts up from the casting ground once the brass is being cast
    const on = t > 6 && t < 13.5;
    smoke.visible = on;
    if (on) { for (let i = 0; i < NS; i++) { const u = ((t * 0.35 + i / NS) % 1); smokePos[i * 3] = sk[0] + Math.sin(i * 1.7) * 2 + u * 14; smokePos[i * 3 + 1] = skh + 2 + u * 40; smokePos[i * 3 + 2] = sk[1] + Math.cos(i * 2.3) * 2 - u * 6; } smokeGeo.attributes.position.needsUpdate = true; }
  }
  return { group, place };
}


// ── Export: any piece (or one sculpt slot of it) as a GLB — the procedural shape as
// a BASELINE to detail elsewhere (Meshy's texture pass on an uploaded model, or
// Blender). ?export=karawab downloads the whole piece; ?export=karawab:slot the first
// sculpt-slot node of it (one cherub, one ox, one capital…), unmirrored, stood on
// y = 0 — exactly the frame the slot's GLB is fitted back into, so a detailed copy
// drops in with no re-alignment. Units are cubits.
function exportGlb(obj, name, toFileFrame = false) {
  const exporter = new GLTFExporter();
  const clone = obj.clone(true);
  clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.scale.set(1, 1, 1);
  if (toFileFrame) clone.rotation.y = -Math.PI / 2;   // the slot's file frame faces +z (fitSlot turns it back to +x), so a detailed copy round-trips exactly
  clone.traverse((o) => { if (o.isLight || o.isSprite) o.removeFromParent?.(); });
  clone.updateMatrixWorld(true);
  exporter.parse(clone, (buf) => {
    const blob = new Blob([buf], { type: 'model/gltf-binary' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.glb`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, (e) => console.warn('[temple] export failed', e), { binary: true, onlyVisible: false });
}

// ── The component ────────────────────────────────────────────────────────────
export default function TempleScene({ clock, mode, selected, onSelect, onReady, onFollow, apiRef }) {
  const wrap = useRef(null);
  const api = useRef(null);
  const modeRef = useRef(mode); modeRef.current = mode;

  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch (e) { onReady?.(false, e); return undefined; }
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement); renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 380, 1100);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.4, 6000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = true; controls.screenSpacePanning = false;
    controls.minDistance = 2; controls.maxDistance = 900; controls.maxPolarAngle = Math.PI / 2 - 0.02;

    // Light: the sun from the south-east, a warm sky, a cool fill.
    const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x6b5a3e, 0.85); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3dc, 2.6); sun.position.set(220, 300, 180); sun.castShadow = true;
    const sh = small ? 2048 : 4096; sun.shadow.mapSize.set(sh, sh);
    const R = 210; sun.shadow.camera.left = -R; sun.shadow.camera.right = R; sun.shadow.camera.top = R; sun.shadow.camera.bottom = -R;
    sun.shadow.camera.near = 50; sun.shadow.camera.far = 800; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.4;
    scene.add(sun); scene.add(sun.target);
    // Lamps inside the house (the lampstands' light — the hall is roofed and the sun cannot reach it).
    const hallLight = new THREE.PointLight(0xffd9a0, 600, 60, 1.6); hallLight.position.set(8, 12, 0); scene.add(hallLight);
    const oracleLight = new THREE.PointLight(0xffe2b0, 350, 40, 1.6); oracleLight.position.set(-20, 12, 0); scene.add(oracleLight);
    const porchLight = new THREE.PointLight(0xfff0d0, 200, 40, 1.6); porchLight.position.set(41, 12, 0); scene.add(porchLight);

    const world = new THREE.Group(); scene.add(world);
    const M = makeMaterials();

    // The mount: a wide plain fading into the haze; the courts lay their own ground.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 96), M.earth);
    ground.rotation.x = -Math.PI / 2; ground.position.y = H.courtY - 0.6; ground.receiveShadow = true; world.add(ground);

    // ── Pieces ──────────────────────────────────────────────────────────────
    const groups = new Map();
    const doorSets = [], veilSets = [], lampLights = [];
    for (const piece of PIECES) {
      const g = buildPiece(M, cutGates(piece));
      groups.set(piece.id, g); world.add(g);
      if (g.userData.doors) doorSets.push(g.userData.doors);
      if (g.userData.veil) veilSets.push(g.userData.veil);
      g.traverse((o) => { if (o.userData.lamp) lampLights.push(o.userData.lamp); });
    }
    const xrayMeshes = [];
    world.traverse((o) => { if (o.isMesh && o.userData.xray) xrayMeshes.push(o); });
    // the land the Build story opens on
    const land = buildLand(M); scene.add(land.group);
    const byId = (id) => groups.get(id);

    // sculpted parts, when their files exist
    for (const [id, g] of groups) {
      for (const slot of g.userData.slots || []) {
        loadGlb(slot.slot).then((proto) => {
          if (!alive || !proto) return;
          const fitted = fitSlot(proto, slot);
          // an unpainted sculpt takes the piece's own material (brass, gold…); a painted one keeps its skin
          const fallback = M[PIECES.find((p) => p.id === id)?.material] || M.brass;
          fitted.traverse((o) => { if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); if (!o.material?.map) o.material = fallback; } });
          const keep = new Set(slot.keep || []);
          [...slot.node.children].forEach((c) => { if (!keep.has(c) && !c.isLight) slot.node.remove(c); });
          slot.node.add(fitted); lastT = -1; dirty = true;
        });
      }
    }

    // ── Per-frame placement from the timeline ───────────────────────────────
    function place(t) {
      const mode = modeRef.current;
      const presence = landAt(mode, t);
      land.place(t, presence);
      ground.visible = presence < 0.999;
      scene.fog.near = 380 + 1800 * presence; scene.fog.far = 1100 + 3500 * presence;
      for (const piece of PIECES) {
        const g = byId(piece.id); if (!g || piece.id === 'house') continue;
        const p = progressAt(mode, piece, t);
        g.visible = p > 0.001;
        g.scale.y = Math.max(0.001, p);
      }
      const x = xrayAt(mode, t);
      for (const m of xrayMeshes) { m.material.opacity = 1 - 0.92 * x; m.material.depthWrite = x < 0.5; m.castShadow = x < 0.5; }
      for (const ds of doorSets) {
        const o = openAt(mode, ds.open, t);
        for (const { node, sz, i } of ds.leaves) node.rotation.y = sz * o * (ds.fold ? (i === 0 ? 1.55 : 2.7) : 1.75);   // swing inward; a folding pair doubles back on itself
      }
      for (const vs of veilSets) {
        const o = openAt(mode, vs.open, t);
        for (const { node, sz } of vs.halves) { node.scale.z = 1 - 0.82 * o; node.position.z = node.userData.rest * (1 + 0.62 * o); }
      }
      // the lamps burn once the lampstands stand (their light is the hall's light)
      const lampOn = progressAt(mode, PIECES.find((p) => p.id === 'manawarah'), t);
      for (const l of lampLights) l.intensity = 40 * lampOn;
      const goldOn = progressAt(mode, PIECES.find((p) => p.id === 'zahab'), t), porchOn = progressAt(mode, PIECES.find((p) => p.id === 'awalam'), t);
      hallLight.intensity = 420 * Math.max(0.3, lampOn) * goldOn; oracleLight.intensity = 300 * goldOn; porchLight.intensity = 160 * porchOn;
    }

    // ── Camera: scripted while following; the viewer's drag takes it ────────
    let following = true, flight = null, lastCamT = -1;
    const posV = new THREE.Vector3(), tgtV = new THREE.Vector3();
    function scriptCamera(t) {
      if (!following) return;
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
    outline.visibleEdgeColor.set(0xffd062); outline.hiddenEdgeColor.set(0x8a6a2a);
    outline.edgeStrength = 6; outline.edgeGlow = 1.2; outline.edgeThickness = 2.5; outline.pulsePeriod = 0;
    composer.addPass(outline); composer.addPass(new OutputPass());
    composer.setPixelRatio(renderer.getPixelRatio());
    let currentSel = selected;
    function applySelection(id) {
      currentSel = id;
      if (!id) { outline.selectedObjects = []; return; }
      if (id === 'house') { outline.selectedObjects = PIECES.filter((p) => p.group === 'house' && p.id !== 'house').map((p) => byId(p.id)); return; }
      outline.selectedObjects = [byId(id)].filter(Boolean);
    }

    // Tap vs drag
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
    const pickables = () => [...groups.values()].filter((g) => g.visible && g.userData.id !== 'house');
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
      if (moved > 8) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables(), true).find((h) => h.object.visible && !(h.object.material?.transparent && h.object.material.opacity < 0.3));
      let o = hit?.object; while (o && !o.userData.id) o = o.parent;
      onSelect?.(o?.userData.id || null);
    };
    let hoverT = 0;
    const onMove = (e) => {
      if (down) return;
      const now = performance.now(); if (now - hoverT < 80) return; hoverT = now;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      renderer.domElement.style.cursor = ray.intersectObjects(pickables(), true).length ? 'pointer' : 'grab';
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);

    // ── Loop ────────────────────────────────────────────────────────────────
    let dirty = true, raf = 0, lastT = -1, alive = true;
    controls.addEventListener('change', () => { dirty = true; });
    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const t = clock.t;
      if (t !== lastT) { place(t); scriptCamera(t); lastT = t; dirty = true; lastCamT = t; }
      if (stepFlight(performance.now())) dirty = true;
      if (controls.update()) dirty = true;
      if (!dirty) return;
      dirty = false;
      // the sun's shadow window follows the camera's target so the shadows stay sharp where the eye is
      sun.target.position.copy(controls.target); sun.position.copy(controls.target).add(new THREE.Vector3(220, 300, 180));
      composer.render();
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

    // ?export=<piece>[:slot] → download that piece's procedural shape as a GLB (see exportGlb)
    const exp = new URLSearchParams(window.location.search).get('export');
    if (exp) {
      const [pid, which] = exp.split(':'); const g = groups.get(pid);
      if (g) {
        const slot = which === 'slot' ? (g.userData.slots || []).find((sl) => !sl.mirror) : null;
        setTimeout(() => exportGlb(slot ? slot.node : g, slot ? slot.slot : `temple-${pid}`, !!slot), 300);
      }
    }
    window.__templeExport = (pid, which) => { const g = groups.get(pid); if (!g) return false; const slot = which === 'slot' ? (g.userData.slots || []).find((sl) => !sl.mirror) : null; exportGlb(slot ? slot.node : g, slot ? slot.slot : `temple-${pid}`, !!slot); return true; };

    api.current = {
      select: (id) => { const changed = id !== currentSel; applySelection(id); if (changed && id) flyTo(id); if (changed && !id) setFollow(true); dirty = true; },
      follow: () => { setFollow(true); lastT = -1; },
      modeChanged: () => { lastT = -1; setFollow(true); dirty = true; },
      invalidate: () => { dirty = true; },
    };
    applySelection(selected);
    if (selected) { flyTo(selected); if (flight) { flight.t0 -= flight.ms; stepFlight(performance.now()); } }

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
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

  return <div ref={wrap} className="st-gl" aria-label="The house of Yahawah in 3D — drag to look around, tap a part to read about it" />;
}
