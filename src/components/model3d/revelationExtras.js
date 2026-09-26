/**
 * revelationExtras.js — what only the city of the Revelation needs (revelation-city.js, MODEL.scene.extras: 'revelation'):
 * the city coming down out of heaven in the Descend story (the whole city's groups lowered together from far above the
 * earth to the ground, 21:2, 10), the light that is not the sun's (21:23; 22:5 — one still light, no day and no night, the
 * throne's glory breathing), the names of the tribes on the gates — inscribed in paleo and in the app's transliteration on
 * the pearl's lintel and flanks, on two standing stones and in the pavement before each gate (21:12) — and the tribes'
 * signs on standards among the trees along the river.
 */
import * as THREE from 'three';
import { labelTexture } from './sky.js';
import { CITY_IDS, descentAt, measureAt, SIDE, GATES, HALF, WALL, GATE_AT, CITY_Y, PEARL, RIVER_W, STREET_Y } from '../../lib/models/revelation-city.js';
import { TRIBE_PALEO } from '../../lib/models/holyLand.js';
import { makeColumn, puffTexture } from './tabernacleExtras.js';
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
    const under = Math.abs(x) < HALF && Math.abs(z) < HALF;   // under the city the land is held below its floor (the city rests on the mountains: the peaks do not rise through the street)
    pos[k * 3] = x; pos[k * 3 + 1] = Math.min(under ? -base - 2 : Infinity, (EXAG * (m - h0)) / CUBIT_M - base - 1); pos[k * 3 + 2] = z;   // level with the plain at the gate
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

// ── The tribes' signs: what the text says of each (Genesis 49; Deuteronomy 33), drawn as a sign on a standard (the standards
// themselves are the model's, after the dagal of Numbers 2; the text gives the tribes no devices — the card says so)
export const SIGNS = {
  Raawaban:    ['🌊', 'unstable as water', 'Genesis 49:4'],
  Yahawadah:   ['🦁', 'a lion\'s whelp', 'Genesis 49:9'],
  Laway:       ['📜', 'they shall teach Yaiqab your judgments', 'Deuteronomy 33:10'],
  Yawasap:     ['🐂', 'the firstborn of his ox', 'Deuteronomy 33:17'],
  Banayamayan: ['🐺', 'a wolf that tears', 'Genesis 49:27'],
  Dan:         ['🐍', 'a serpent in the way', 'Genesis 49:17'],
  Shamaiwan:   ['🗡️', 'weapons of violence', 'Genesis 49:5'],
  Yashashakar: ['⛺', 'in your tents', 'Deuteronomy 33:18'],
  Zabawalawan: ['⛵', 'a haven of ships', 'Genesis 49:13'],
  Gad:         ['⚔️', 'a troop shall press on him', 'Genesis 49:19'],
  Ashar:       ['🫒', 'let him dip his foot in oil', 'Deuteronomy 33:24'],
  Napathalay:  ['🦌', 'a hind let loose', 'Genesis 49:21'],
};
const PALEO_FONT = '"BLD Paleo", "Segoe UI Historic", "Noto Sans Phoenician", sans-serif';
const fontsReady = typeof document !== 'undefined' && document.fonts?.load ? document.fonts.load(`80px ${PALEO_FONT}`).catch(() => null) : Promise.resolve(null);
/** An inscription: the paleo over the transliteration, cut into the stone (dark letters with a light edge below — a relief in the pearl). */
function inscription(paleo, name, { w = 1024, h = 512, ink = '#5a4630', edge = 'rgba(255,255,255,0.7)', sign = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const draw = () => {
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
    const put = (text, font, y) => { g.font = font; g.fillStyle = edge; g.fillText(text, w / 2, y + h * 0.012); g.fillStyle = ink; g.fillText(text, w / 2, y); };
    if (sign) { put(sign, `${Math.round(h * 0.42)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`, h * 0.3); put(paleo, `${Math.round(h * 0.2)}px ${PALEO_FONT}`, h * 0.66); put(name, `600 ${Math.round(h * 0.12)}px system-ui, sans-serif`, h * 0.86); }
    else { put(paleo, `${Math.round(h * 0.46)}px ${PALEO_FONT}`, h * 0.34); put(name, `600 ${Math.round(h * 0.24)}px system-ui, sans-serif`, h * 0.74); }
  };
  draw(); const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  fontsReady.then(() => { draw(); t.needsUpdate = true; });   // drawn again once the paleo font has come
  return t;
}
/** A plane of w × h at (x, y, z) facing the unit direction (nx, nz), a hair off the face it is laid on. */
function plaque(tex, x, y, z, w, h, nx, nz, lift = 0.25) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.position.set(x + nx * lift, y, z + nz * lift); m.rotation.y = Math.atan2(nx, nz); m.renderOrder = 2; return m;
}

export function revelationExtras({ M, byId, lights, scene, camera }) {
  const { sun, hemi } = lights;
  const sunOffset = new THREE.Vector3(200, 400, 130);   // one still light, from the east and high: no sun to rise or set (steep, so the shadow window's edge does not cut the street into planes)
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
  // the names inscribed where the walker is (fieldy: "I need to see the name of the tribes on the gates and in the general
  // entrance area … the paleo and transliteration inscripted in a few locations"): on the lintel of the pearl without and
  // within, large on its two flanks, at eye level beside the way, on two standing stones before the gate, and in the pavement
  const inscr = new THREE.Group(); scene.add(inscr);
  const stoneMat = M.pearl;
  for (const side of ['north', 'east', 'south', 'west']) GATES[side].forEach(([name, en], i) => {
    const at = GATE_AT[i], [x, z] = side === 'north' ? [at, -o] : side === 'south' ? [at, o] : side === 'east' ? [o, at] : [-o, at];
    const [nx, nz] = side === 'north' ? [0, -1] : side === 'south' ? [0, 1] : side === 'east' ? [1, 0] : [-1, 0];   // outward
    const [ax, az] = [-nz, nx];   // along the wall
    const paleo = TRIBE_PALEO[en] || '', tex = inscription(paleo, name), texEye = inscription(paleo, name, { w: 512, h: 384 });
    const P = (u, v, y, w, h, out, t = tex) => inscr.add(plaque(t, x + ax * u + nx * v, y, z + az * u + nz * v, w, h, nx * out, nz * out));
    const f = PEARL.d / 2, lintelY = CITY_Y + (PEARL.wayH + PEARL.h) / 2, flankU = (PEARL.wayW / 2 + PEARL.w / 2) / 2, flankW = PEARL.w / 2 - PEARL.wayW / 2 - 4;
    for (const out of [1, -1]) {
      P(0, f * out, lintelY, 112, 52, out);                                          // the lintel
      for (const su of [-1, 1]) { P(su * flankU, f * out, CITY_Y + 62, flankW, flankW * 0.6, out); P(su * flankU, f * out, CITY_Y + 4.2, 9, 6.5, out, texEye); }   // the flanks, high and at eye level
    }
    // two standing stones before the gate, either side of the way, the name on both faces
    for (const su of [-1, 1]) {
      const sx = x + ax * su * 64 + nx * 58, sz = z + az * su * 64 + nz * 58, sw = 7, sh = 10, st = 1.6;
      const st3 = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(ax) * sw + Math.abs(nx) * st, sh, Math.abs(az) * sw + Math.abs(nz) * st), stoneMat); st3.position.set(sx, CITY_Y + sh / 2, sz); st3.castShadow = true; inscr.add(st3);
      for (const out of [1, -1]) inscr.add(plaque(texEye, sx + nx * (st / 2) * out, CITY_Y + sh * 0.56, sz + nz * (st / 2) * out, sw - 0.8, sh * 0.7, nx * out, nz * out));
    }
    // in the pavement before the gate, read by one coming in
    const pav = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pav.position.set(x + nx * 118, CITY_Y + 0.12, z + nz * 118); pav.rotation.set(-Math.PI / 2, Math.atan2(nx, nz), 0, 'YXZ'); pav.renderOrder = 2; inscr.add(pav);   // laid flat, its top toward the city: read by one walking in
  });
  // the tribes' signs on standards among the trees along the river — twelve in from the east gate, twelve out from the throne
  // (fieldy: "include each tribe's symbol in the area of my makeshift trees")
  const ALL = ['north', 'east', 'south', 'west'].flatMap((sd) => GATES[sd]);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#7a5a34', roughness: 0.8 });
  const standard = (u, sgn, [name, en]) => {
    const zz = sgn * (RIVER_W / 2 + 76), y0 = CITY_Y + STREET_Y, ph = 16;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, ph, 8), poleMat); pole.position.set(u, y0 + ph / 2, zz); pole.castShadow = true; inscr.add(pole);
    const tex = inscription(TRIBE_PALEO[en] || '', name, { w: 512, h: 512, ink: '#3a2c18', edge: 'rgba(255,255,255,0.5)', sign: SIGNS[name]?.[0] || '' });
    const cz = zz + sgn * 5.9, cy = y0 + ph - 6.2;   // the cloth hangs from the pole away from the river, its face along the street
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshStandardMaterial({ color: '#f3ead6', roughness: 0.9, side: THREE.DoubleSide })); cloth.position.set(u, cy, cz); cloth.rotation.y = Math.PI / 2; cloth.castShadow = true; inscr.add(cloth);
    for (const out of [1, -1]) inscr.add(plaque(tex, u, cy, cz, 10.4, 10.4, out, 0, 0.08));   // read by one walking the street, either way
  };
  ALL.forEach((g, k) => { standard(HALF - 420 - k * 210, k % 2 ? 1 : -1, g); standard(380 + k * 210, k % 2 ? -1 : 1, g); });
  // the gates seen from afar: a pearl of light over each, sized by the eye's distance (a gate of 170 amah is nothing on a wall of four million)
  const puff = puffTexture();
  const gateFar = new THREE.Group(); scene.add(gateFar);
  for (const side of ['north', 'east', 'south', 'west']) GATE_AT.forEach((at) => { const [x, z] = side === 'north' ? [at, -o] : side === 'south' ? [at, o] : side === 'east' ? [o, at] : [-o, at]; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color('#ffffff'), transparent: true, opacity: 1, depthWrite: false, depthTest: false })); sp.position.set(x, CITY_Y + 120, z); sp.renderOrder = 997; const rim = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color('#4a3210'), transparent: true, opacity: 0.85, depthWrite: false, depthTest: false })); rim.position.copy(sp.position); rim.renderOrder = 996; rim.userData.rim = true; gateFar.add(rim, sp); });
  // the measuring (21:15–17): a light that flies the city round — its wall, its gates — and up its height
  const meter = new THREE.Group(); meter.visible = false; scene.add(meter);
  const meterHead = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color('#ffffff'), transparent: true, opacity: 1, depthWrite: false, depthTest: false })); meterHead.renderOrder = 999; meter.add(meterHead);
  const trail = Array.from({ length: 14 }, (_, i) => { const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color('#ffe9a8'), transparent: true, opacity: 0.8 * (1 - i / 14), depthWrite: false, depthTest: false })); t.renderOrder = 999; meter.add(t); return t; });
  const E = HALF + WALL.t, TOP = CITY_Y + SIDE;
  /** the measuring light's path, u 0 → 1: round the four sides at the wall's top from the east middle gate, then up the south-east edge, along the top's east edge and back down — the length, the breadth, the height (21:16) */
  const meterAt = (u, v) => { const legs = [[E, 0, E, E], [E, E, -E, E], [-E, E, -E, -E], [-E, -E, E, -E], [E, -E, E, 0]]; const per = 0.62; if (u < per) { const s = (u / per) * 4.5; const k = Math.min(4, Math.floor(s)), f = s - k, [x0, z0, x1, z1] = legs[k]; v.set(x0 + (x1 - x0) * f, CITY_Y + WALL.h + 40, z0 + (z1 - z0) * f); } else { const s = (u - per) / (1 - per); if (s < 0.4) v.set(E, CITY_Y + WALL.h + (TOP - WALL.h) * (s / 0.4), E); else if (s < 0.7) v.set(E, TOP, E - 2 * E * ((s - 0.4) / 0.3)); else v.set(E, TOP - (TOP - WALL.h) * ((s - 0.7) / 0.3), -E); } return v; };
  const mv = new THREE.Vector3();
  // the kabawad (glory) over the throne: a column of white-gold light, ever flowing, as the cloud and the fire over the mashakan (fieldy)
  const glory = new THREE.Group(); scene.add(glory);
  const column = makeColumn(glory, puff, { NF: 1400, NS: 900, H: 280, R: 70, fireH: 150, base: CITY_Y + 2, sizeF: 16, sizeS: 44, hue: 0.12, sat: 0.5, lum: 0.9, glowCol: '#fff4d0', lightCol: 0xfff2cc });
  const cloudCol = new THREE.Color('#fff9ec');
  // the shining about it: halos of light, additive, breathing (the fire's shining rather than its burning — fieldy)
  const halos = [[260, 120, 0.55, '#fff6dc'], [140, 70, 0.7, '#ffffff'], [90, 300, 0.35, '#fff0c0']].map(([w, y, op, col]) => { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color(col), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); h.position.set(0, CITY_Y + y, 0); h.scale.set(w, w * (y > 200 ? 2.2 : 1), 1); h.userData.op = op; glory.add(h); return h; });
  let lastBurn = -1;
  function burn(sec) { if (Math.abs(sec - lastBurn) < 0.03) return; lastBurn = sec; column.burn(sec, 0, 0, 1, 0.55, cloudCol); const p = 0.85 + 0.15 * Math.sin(sec * 1.7) * Math.sin(sec * 0.9); for (const h of halos) h.material.opacity = h.userData.op * p; }
  let glow = null;
  // the gates' far lights: sized by the eye's distance from the city's centre, gone when the eye is near enough to see the gates
  // themselves — in the story from high up, and on foot when the view is pulled far back (then from the tick, as the view moves)
  function farLights() {
    const vp = camera ? (camera.userData.viewPulled ? camera.userData.view : camera.position) : null;   // on foot with the view pulled back, where it is drawn from
    const dist = vp ? vp.length() : 0, k = Math.max(0, Math.min(1, ((vp?.y || 0) - 20000) / 300000));   // only from high up
    gateFar.visible = k > 0 && !!byId('gate-east-1')?.visible;
    for (const sp of gateFar.children) { const s2 = dist * (sp.userData.rim ? 0.05 : 0.03) * k; sp.scale.set(s2, s2, 1); }
    return dist;
  }
  // the mountains, when the tiles come
  const land = byId('aratz');
  if (land && typeof fetch === 'function') loadRelief().then((r) => { if (!land.parent) return; land.add(reliefMesh(r, [HALF + WALL.t + 90, 0], land.userData.base || 0)); }).catch(() => {});
  M.goldglass.fog = false; M.goldglass.needsUpdate = true;   // the body of gold seen from its foot: not greyed by the distance to its far corners
  for (const id of ['zahab', 'rachab', 'nahar']) byId(id)?.traverse((m) => { if (m.isMesh) m.receiveShadow = false; });   // slabs a million amah long take shadow acne, not shadows
  return {
    sunOffset,
    place() { return 0; },
    after(mode, t) {
      const d = descentAt(mode, t), y = DROP * d;
      for (const id of CITY_IDS) { const g = byId(id); if (g) g.position.y = (g.userData.base || 0) + y; }   // each group is hoisted to its own base (buildPiece), the descent on top of that
      gateNames.position.y = y; inscr.position.y = y;
      gateFar.position.y = y; glory.position.y = y; burn(t);
      // the seat's own light breathes a little with the column
      if (!glow) { const g = byId('kasaa'); if (g) g.traverse((m) => { if (m.isMesh && m.material?.emissive && !glow) glow = m.material; }); }
      if (glow) glow.emissiveIntensity = 1.0 + 0.3 * Math.sin(t * 1.3);
      const dist = farLights();
      // the measuring light
      const mu = measureAt(mode, t);
      meter.visible = mu != null;
      if (mu != null) { meterAt(mu, mv); meterHead.position.copy(mv); const sz = Math.max(20000, dist * 0.09); meterHead.scale.set(sz, sz, 1); trail.forEach((tr, i) => { meterAt(Math.max(0, mu - (i + 1) * 0.004), mv); tr.position.copy(mv); const s2 = sz * (0.9 - i * 0.05); tr.scale.set(s2, s2, 1); }); }
    },
    tick(sec) { burn(sec); farLights(); return true; },
  };
}
