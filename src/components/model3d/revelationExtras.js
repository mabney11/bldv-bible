/**
 * revelationExtras.js — what only the city of the Revelation needs (revelation-city.js, MODEL.scene.extras: 'revelation'):
 * the city coming down out of heaven in the Descend story (the whole city's groups lowered together from far above the
 * earth to the ground, 21:2, 10), the light that is not the sun's (21:23; 22:5 — one still light, no day and no night, the
 * throne's glory breathing), and the names over the gates.
 */
import * as THREE from 'three';
import { labelTexture } from './sky.js';
import { CITY_IDS, descentAt, SIDE, GATES, HALF, WALL, GATE_AT, CITY_Y } from '../../lib/models/revelation-city.js';
import { toXZ, CUBIT_M } from '../../lib/models/ezekiel-geo.js';

// ── The mountains of the new earth: the relief of the land under and about the city, from the same AWS Terrain Tiles the
// Holy Land map shades its relief with (fetched online, optional — the land is flat until they arrive, as on the map).
// Zoom 6, tiles x 36–40, y 23–28: lon 22.5–50.6, lat 16.6–48.9, the city's whole footprint. Heights are taken relative to the
// ground at the east gate where the walker stands, so the city's floor meets the land there; the seabed (the sea is no more,
// 21:1) is left level.
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/6/{x}/{y}.png', TX = [36, 40], TY = [23, 28], STEP = 4;
export const EXAG = 2.5;   // the relief drawn two and a half times its height, so the mountains read against a city a thousand miles wide (the card says so)
const tileLon = (x) => (x / 64) * 360 - 180, tileLat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 64))) * 180) / Math.PI;
async function loadRelief() {
  const W = (TX[1] - TX[0] + 1) * 256, H = (TY[1] - TY[0] + 1) * 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const jobs = [];
  for (let tx = TX[0]; tx <= TX[1]; tx++) for (let ty = TY[0]; ty <= TY[1]; ty++) jobs.push(fetch(DEM.replace('{x}', tx).replace('{y}', ty)).then((r) => r.blob()).then(createImageBitmap).then((bm) => g.drawImage(bm, (tx - TX[0]) * 256, (ty - TY[0]) * 256)));
  await Promise.all(jobs);
  const d = g.getImageData(0, 0, W, H).data, w = W / STEP, h = H / STEP, hm = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let sum = 0; for (let dj = 0; dj < STEP; dj++) for (let di = 0; di < STEP; di++) { const p = ((j * STEP + dj) * W + (i * STEP + di)) * 4; sum += Math.max(0, d[p] * 256 + d[p + 1] + d[p + 2] / 256 - 32768); } hm[j * w + i] = sum / (STEP * STEP); }
  // the pixel (i, j) → lon/lat (web mercator, the y of a pixel row from the tile edge)
  const lonOf = (i) => tileLon(TX[0] + (i * STEP) / 256), latOf = (j) => tileLat(TY[0] + (j * STEP) / 256);
  return { w, h, hm, lonOf, latOf };
}
function reliefMesh({ w, h, hm, lonOf, latOf }, gateXZ, base) {
  // the height under the east gate, so the floor of the city meets the ground there
  let gi = 0, gj = 0, bd = Infinity;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const [x, z] = toXZ([lonOf(i), latOf(j)]); const dd = Math.hypot(x - gateXZ[0], z - gateXZ[1]); if (dd < bd) { bd = dd; gi = i; gj = j; } }
  const h0 = hm[gj * w + gi];
  const pos = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3), cA = new THREE.Color('#b9ae8c'), cB = new THREE.Color('#7f9a5a'), cC = new THREE.Color('#8a7a5a'), cD = new THREE.Color('#f4f2ec'), cc = new THREE.Color();
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, m = hm[k], [x, z] = toXZ([lonOf(i), latOf(j)]);
    pos[k * 3] = x; pos[k * 3 + 1] = (EXAG * (m - h0)) / CUBIT_M - base - 1; pos[k * 3 + 2] = z;   // level with the plain at the gate
    if (m < 400) cc.copy(cA).lerp(cB, m / 400); else if (m < 1600) cc.copy(cB).lerp(cC, (m - 400) / 1200); else cc.copy(cC).lerp(cD, Math.min(1, (m - 1600) / 1400));
    col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
  }
  const idx = [];
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i, b = a + 1, c2 = a + w, d2 = c2 + 1; idx.push(a, c2, b, b, c2, d2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); mesh.receiveShadow = true; mesh.userData.relief = true;
  return mesh;
}

const DROP = SIDE * 1.15;   // how far above the earth the city starts its descent

export function revelationExtras({ M, byId, lights, scene }) {
  const { sun, hemi } = lights;
  const sunOffset = new THREE.Vector3(300, 280, 140);   // one still light, from the east and high: no sun to rise or set — low enough that the mountains and the wall's courses take a shadow
  sun.color.set('#fff3dc'); hemi.color?.set?.('#fff6e6');
  const mk = (text, color, x, y, z, big) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, color), transparent: true, depthWrite: false, depthTest: false }));
    sp.position.set(x, y, z); sp.userData.size = big; sp.renderOrder = 998; return sp;
  };
  // the gates' names, over each pearl
  const gateNames = new THREE.Group(); scene.add(gateNames);
  const o = HALF + WALL.t / 2;
  for (const side of ['north', 'east', 'south', 'west']) GATES[side].forEach(([name], i) => {
    const at = GATE_AT[i], [x, z] = side === 'north' ? [at, -o] : side === 'south' ? [at, o] : side === 'east' ? [o, at] : [-o, at];
    gateNames.add(mk(name, '#fff0c0', x, 196, z, 110));
  });
  for (const sp of gateNames.children) { const s = sp.userData.size; sp.scale.set(s, s / 4, 1); }
  let glow = null;
  // the mountains, when the tiles come
  const land = byId('aratz');
  if (land && typeof fetch === 'function') loadRelief().then((r) => { if (!land.parent) return; land.add(reliefMesh(r, [HALF + WALL.t + 90, 0], land.userData.base || 0)); }).catch(() => {});
  M.goldglass.fog = false; M.goldglass.needsUpdate = true;   // the body of gold seen from its foot: not greyed by the distance to its far corners
  return {
    sunOffset,
    place() { return 0; },
    after(mode, t) {
      const d = descentAt(mode, t), y = DROP * d;
      for (const id of CITY_IDS) { const g = byId(id); if (g) g.position.y = (g.userData.base || 0) + y; }   // each group is hoisted to its own base (buildPiece), the descent on top of that
      gateNames.position.y = y;
      // the throne's glory breathes a little
      if (!glow) { const g = byId('kasaa'); if (g) g.traverse((m) => { if (m.isMesh && m.material?.emissive && !glow) glow = m.material; }); }
      if (glow) glow.emissiveIntensity = 1.1 + 0.25 * Math.sin(t * 1.3);
    },
  };
}
