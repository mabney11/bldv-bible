/**
 * templeExtras.js — what only the bayath of Yahawah's stories need: the relief
 * map of the land the Build story opens on (the materials coming in from
 * Labanawan, the quarry, the Yaradan's plain, the city of Dawad) and the
 * dedication's actors (the procession with the ark, the singers, the king on
 * the kayawar, the assembly, the inan (cloud), the ash (fire), the kabawad
 * (glory), seven days of the feast). Plugged into the generic scene by the
 * model (temple.js MODEL.scene.extras); a model without stories of its own
 * has none.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PieceBuilder, personFigure, SKIN_TONES, HAIR_TONES } from './builders.js';
import { H, PLACES, ROUTES, MOVERS, moverAt, landAt, PORCH_X1, EAST_X, ALTAR, INNER_COURT, GREAT_COURT } from '../../lib/models/temple.js';

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


// ── The dedication (1 Kings 8; 2 Chronicles 5–7): its actors ─────────────────
// Everything here keys off the DEDICATE story's times (lib/models/temple.js,
// DEDICATE_PHASES): the assembly in the courts, the priests carrying the ark from
// the gate to under the wings, the singers east of the altar, the inan (cloud)
// filling the house, the malak (king) on the kayawar, the ash (fire) from shamayam
// on the altar, the kabawad (glory), the sacrifices' smoke, seven days passing,
// the people going home. People are faceless, like the cherubim.
const DED = { start: 8, porch: 20, set: 28, singers: 33, out: 41, cloud: 45, king: 55, kneel: 63, fire: 72.6, glory: 74, bow: 80, zabach: 90, feast: 100, home: 110 };
/** Ground height along the procession's line: the court, the steps, the floor. */
function groundAlongX(x) { const x0 = PORCH_X1 + H.pad, x1 = x0 + 4; return x >= x1 ? H.courtY : x <= x0 ? 0 : H.courtY + (1 - (x - x0) / (x1 - x0)) * -H.courtY; }
/** The ark's road across the courts, gate → steps: south of the kayawar and the mazabach (altar), never through them (x, z; height from groundAlongX). */
const ROAD_IN = new THREE.CatmullRomCurve3([[156, 0], [124, 0], [110, -2], [104, -12], [98, -24], [86, -28], [66, -28], [59, -20], [56, -8], [54, 0], [PORCH_X1 + 2, 0], [PORCH_X1, 0]].map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
/** The priests' way out again: from under the wings, down the hall, out the doors and down the steps, to the south of the altar. */
const ROAD_OUT = new THREE.CatmullRomCurve3([[-16, 0], [0, 0], [PORCH_X1 - 2, 0], [PORCH_X1, 0], [54, 0], [56, -8], [59, -20], [66, -28], [74, -31]].map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Where the road is at u (0 … 1 by length), and which way it heads (yaw for a figure facing +x). */
function alongRoad(road, u, out) { road.getPointAt(u, out.p); road.getTangentAt(u, out.d); out.p.y = groundAlongX(out.p.x); out.yaw = Math.atan2(-out.d.z, out.d.x); return out; }
function buildDedication(M, byId, lights, sky) {
  const group = new THREE.Group(); group.name = 'dedication'; group.visible = false;
  const S = 0.35;                                                                        // a person 3½ amah tall
  let skinN = 3, hairN = 1; const nextSkin = () => `skin${(skinN = (skinN * 7 + 3) % SKIN_TONES.length)}`, nextHair = () => `hair${(hairN = (hairN * 3 + 2) % HAIR_TONES.length)}`;
  const person = (robe, pose, skin = nextSkin()) => { const sub = new PieceBuilder(M, { id: 'ded' }); personFigure(sub, S, robe, pose, skin, nextHair()); const g = sub.bake(); g.userData.id = undefined; return g; };
  // the procession: the ark (the arawan piece itself is moved) and four priests at the poles
  const priests = [];
  for (const [dx, dz] of [[2.9, 0.82], [2.9, -0.82], [-2.9, 0.82], [-2.9, -0.82]]) { const p = person('linen', 'carry'); p.position.set(dx, 0, dz); p.userData.dx = dx; p.userData.dz = dz; group.add(p); priests.push(p); }
  const ark = byId('arawan'), arkHome = new THREE.Vector3(-20, 0, 0);
  const road = { p: new THREE.Vector3(), d: new THREE.Vector3(), yaw: Math.PI }, off3 = new THREE.Vector3();
  // the singers and trumpeters, east of the altar, in white
  const singers = new THREE.Group(); group.add(singers);
  const singerProtos = [person('linen', 'trumpet'), person('linen', 'stand'), person('linen', 'trumpet'), person('linen', 'stand'), person('linen', 'trumpet')];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) { const c = singerProtos[(r * 12 + i) % singerProtos.length].clone(); const z = (i < 6 ? -19 + i * 2.4 : 6.6 + (i - 6) * 2.4) + (r % 2) * 1.2; c.position.set(ALTAR.x + ALTAR.w / 2 + 3 + r * 2.2, H.courtY, z); c.rotation.y = Math.PI; singers.add(c); }   // two blocks, the king's road between
  // the king: standing with hands spread, then kneeling, on the kayawar
  // — he lives in the 'malak' piece's group, so a tap on him opens that piece's card
  const kingStand = person('royal', 'spread', 'skin4'), kingKneel = person('royal', 'kneel', 'skin4');   // of Yahawadah (Judah)
  const kingHost = byId('malak') || group;
  for (const k of [kingStand, kingKneel]) { k.position.set(ALTAR.x + 19, H.courtY + 3.3, 0); k.rotation.y = Math.PI; k.visible = false; k.traverse((o) => { if (o.isMesh) o.castShadow = true; }); kingHost.add(k); }
  // the assembly: an instanced crowd in the courts (body + head as one geometry)
  const body = new THREE.CapsuleGeometry(0.55, 1.9, 4, 10); body.translate(0, 1.5, 0);
  const headG = new THREE.SphereGeometry(0.42, 12, 8); headG.translate(0, 3.1, 0);
  const personG = mergeGeometries([body.toNonIndexed(), headG.toNonIndexed()], false);
  const N = 900, crowd = new THREE.InstancedMesh(personG, new THREE.MeshStandardMaterial({ roughness: 0.95 }), N);
  crowd.castShadow = true; group.add(crowd);
  const hairG = new THREE.SphereGeometry(0.46, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62); hairG.translate(0, 3.14, 0);   // a cap of hair over each head
  const hairCap = new THREE.InstancedMesh(hairG, new THREE.MeshStandardMaterial({ roughness: 1 }), N); group.add(hairCap);
  const seats = []; let sd = 11; const rr = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const tone = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let x, z;
    if (i < 420) { x = INNER_COURT.x1 - 14 + rr() * 12; z = -52 + rr() * 104; if (Math.abs(z) < 6) z += 8 * Math.sign(z || 1); if (z < -6 && z > -34) z = -z; }   // before the altar, leaving the ark's road (and its turn south of the kayawar) clear
    else if (i < 640) { x = GREAT_COURT.x1 - 14 + rr() * 11; z = -70 + rr() * 140; if (Math.abs(z) < 8) z += 9 * Math.sign(z || 1); }
    else { x = -60 + rr() * 170; z = rr() < 0.5 ? -74 + rr() * 10 : INNER_COURT.z + 4 + rr() * 10; if (z > 0 && x > -12 && x < 52) x = x < 20 ? x - 64 : x + 40; }   // the king's porches' way stays clear
    const y = H.courtY, sc = 0.95 + rr() * 0.2, yaw = Math.PI + (rr() - 0.5) * 0.5;
    seats.push({ x, y, z, sc, yaw, d: rr() });
    tone.set(SKIN_TONES[Math.floor(rr() * SKIN_TONES.length)]).offsetHSL((rr() - 0.5) * 0.02, (rr() - 0.5) * 0.08, (rr() - 0.5) * 0.06); crowd.setColorAt(i, tone);
    tone.set(HAIR_TONES[Math.floor(rr() * HAIR_TONES.length)]); hairCap.setColorAt(i, tone);
  }
  crowd.instanceColor.needsUpdate = true; hairCap.instanceColor.needsUpdate = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sv = new THREE.Vector3();
  function seatCrowd(bow, gone) {
    for (let i = 0; i < N; i++) {
      const s = seats[i];
      const leave = Math.max(0, Math.min(1, (gone - s.d * 0.6) / 0.4));               // each goes in their own time
      e.set(0, s.yaw, -bow * 1.35, 'YXZ'); q.setFromEuler(e);                        // bowing: down on the face toward the house (−x)
      v3.set(s.x + leave * 14, s.y, s.z); const k = s.sc * (1 - leave); sv.set(k, k, k);
      m4.compose(v3, q, sv); crowd.setMatrixAt(i, m4); hairCap.setMatrixAt(i, m4);
    }
    crowd.instanceMatrix.needsUpdate = true; hairCap.instanceMatrix.needsUpdate = true;
  }
  seatCrowd(0, 0);
  // the inan (cloud) in the house
  const NC = 3000, cloudGeo = new THREE.BufferGeometry(), cp = new Float32Array(NC * 3), cv = [];
  for (let i = 0; i < NC; i++) { const inPorch = i > NC * 0.86; cp[i * 3] = inPorch ? EAST_X + rr() * (PORCH_X1 - EAST_X) : H.inX0 + rr() * (H.inX1 - H.inX0); cp[i * 3 + 1] = 0.8 + rr() * (H.inH - 1.6); cp[i * 3 + 2] = (rr() - 0.5) * 2 * (H.inZ - 0.6); cv.push(rr() * Math.PI * 2, 0.3 + rr()); }
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  const puff = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const cloudMat = new THREE.PointsMaterial({ map: puff, color: new THREE.Color('#f6ead0'), size: 7, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
  const cloud = new THREE.Points(cloudGeo, cloudMat); cloud.frustumCulled = false; cloud.renderOrder = 5; group.add(cloud);
  // the ash (fire) from shamayam: a shaft of light, then flames and smoke on the altar (and, for the sacrifices, over the court)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, 240, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(ALTAR.x, H.courtY + ALTAR.h + 120, 0); group.add(beam);
  const NF = 900, fireGeo = new THREE.BufferGeometry(), fp = new Float32Array(NF * 3), fc = new Float32Array(NF * 3), fseed = [];
  for (let i = 0; i < NF; i++) fseed.push(rr(), rr(), rr());
  fireGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fireGeo.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  const fire = new THREE.Points(fireGeo, new THREE.PointsMaterial({ map: puff, vertexColors: true, size: 4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); fire.frustumCulled = false; group.add(fire);
  const NS = 700, smokeGeo = new THREE.BufferGeometry(), sp = new Float32Array(NS * 3), sseed = [];
  for (let i = 0; i < NS; i++) sseed.push(rr(), rr(), rr());
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ map: puff, color: new THREE.Color('#8a8074'), size: 14, transparent: true, opacity: 0, depthWrite: false })); smoke.frustumCulled = false; group.add(smoke);
  // the kabawad (glory) seen from the court: light spilling from the doorway and the porch
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color('#ffd88a'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(EAST_X + 5, 10, 0); glow.scale.set(44, 34, 1); group.add(glow);
  const glowLight = new THREE.PointLight(0xffd27a, 0, 90, 1.5); glowLight.position.set(PORCH_X1 + 6, 12, 0); group.add(glowLight);
  const hearths = [[ALTAR.x, ALTAR.w / 2 - 1, H.courtY + ALTAR.h, 0]];                  // [x, spread, y, z]: the altar; the court's midst joins for the sacrifices
  for (const [x, z] of [[58, 24], [58, -24], [96, 30], [96, -30], [72, 44], [72, -44]]) hearths.push([x, 7, H.courtY + 0.4, z]);
  const fireCol = new THREE.Color();
  function burn(t, fireK, courtK) {
    const now = t;
    for (let i = 0; i < NF; i++) {
      const [a, b, c] = [fseed[i * 3], fseed[i * 3 + 1], fseed[i * 3 + 2]];
      const which = i < NF * 0.55 ? 0 : 1 + Math.floor(b * 6), h = hearths[which], k = which === 0 ? fireK : courtK;
      const u = ((now * (0.6 + c) + a * 7) % 1), rise = u * (which === 0 ? 11 : 6) * k;
      fp[i * 3] = h[0] + (a - 0.5) * 2 * h[1] * (1 - u * 0.5); fp[i * 3 + 1] = h[2] + rise; fp[i * 3 + 2] = h[3] + (c - 0.5) * 2 * (which === 0 ? ALTAR.w / 2 - 1 : h[1]) * (1 - u * 0.5);
      fireCol.setHSL(0.09 - u * 0.07, 1, 0.55 - u * 0.25 + (k < 0.01 ? -1 : 0)); fc[i * 3] = fireCol.r; fc[i * 3 + 1] = fireCol.g; fc[i * 3 + 2] = fireCol.b;
    }
    fireGeo.attributes.position.needsUpdate = true; fireGeo.attributes.color.needsUpdate = true;
    for (let i = 0; i < NS; i++) {
      const [a, b, c] = [sseed[i * 3], sseed[i * 3 + 1], sseed[i * 3 + 2]];
      const which = i < NS * 0.5 ? 0 : 1 + Math.floor(b * 6), h = hearths[which], k = which === 0 ? fireK : courtK;
      const u = ((now * 0.12 * (0.7 + c) + a) % 1);
      sp[i * 3] = h[0] + (a - 0.5) * 8 + u * 22 + Math.sin(u * 9 + a * 6) * 4; sp[i * 3 + 1] = h[2] + 4 + u * 70 * k; sp[i * 3 + 2] = h[3] + (c - 0.5) * 8 - u * 10;
    }
    smokeGeo.attributes.position.needsUpdate = true;
  }
  const { hallLight, oracleLight, porchLight, sun, hemi, scene } = lights;
  const skyDay = new THREE.Color(sky), skyNight = new THREE.Color('#141a2c'), skyDusk = new THREE.Color('#d8a06a'), tmpC = new THREE.Color();
  const sunOffset = new THREE.Vector3(220, 300, 180), dayOffset = sunOffset.clone();
  let on = false;
  function place(t) {
    if (!on) { on = true; group.visible = true; }
    const sm = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a))), ease = (u) => u * u * (3 - 2 * u);
    // the ark's road: the gate → round the south of the kayawar and the altar → the steps → the porch → the hall → under the wings
    if (t < DED.porch) alongRoad(ROAD_IN, t < DED.start ? 0 : ease(sm(DED.start, DED.porch)), road);
    else { road.p.set(t < DED.set ? PORCH_X1 + (arkHome.x - PORCH_X1) * ease(sm(DED.porch, DED.set)) : arkHome.x, 0, 0); road.p.y = groundAlongX(road.p.x); road.yaw = Math.PI; }
    const carried = t < DED.set ? 1 : 1 - ease(sm(DED.set, DED.set + 1.5));
    const bob = carried * Math.sin(t * 6.5) * 0.06, turn = road.yaw - Math.PI;   // the ark is built heading −x; the road's heading turns it
    ark.rotation.y = turn;
    ark.position.copy(road.p).sub(off3.copy(arkHome).applyAxisAngle(Y_AXIS, turn)); ark.position.y += carried * 2.55 + bob;
    for (const p of priests) {
      let vis = true, yaw = road.yaw;
      if (t < DED.set) { off3.set(p.userData.dx, 0, p.userData.dz).applyAxisAngle(Y_AXIS, turn).add(road.p); }
      else if (t < DED.out) { off3.set(arkHome.x + 5 + p.userData.dx * 0.5, 0, p.userData.dz * 1.6); yaw = 0; }   // set down; they stand east of it in the dabayar until the priests come out (1 Kings 8:10)
      else { const u = sm(DED.out, DED.out + 8); alongRoad(ROAD_OUT, u, road); /* a steady walk: out of the doors at ~45.5, before the cloud */ off3.set(0, 0, p.userData.dz).applyAxisAngle(Y_AXIS, road.yaw).add(road.p); off3.x += p.userData.dx * 0.5 * Math.cos(road.yaw); off3.z -= p.userData.dx * 0.5 * Math.sin(road.yaw); yaw = road.yaw; vis = u < 0.995; }
      p.position.set(off3.x, off3.y + Math.max(0, Math.sin(t * 6.5 + p.userData.dz) * 0.05), off3.z); p.rotation.y = yaw; p.visible = vis;
    }
    // singers from the trumpets' verse until the feast; the king on the scaffold; the crowd
    singers.visible = t >= DED.singers && t < DED.feast;
    kingStand.visible = (t >= DED.king && t < DED.kneel) || (t >= DED.zabach && t < DED.feast);
    kingKneel.visible = t >= DED.kneel && t < DED.zabach;
    seatCrowd(ease(sm(DED.bow, DED.bow + 3)) * (t < DED.zabach ? 1 : 1 - ease(sm(DED.zabach, DED.zabach + 2))), sm(DED.home, DED.home + 8));
    // the cloud, then the glory in it
    const cloudK = ease(sm(DED.cloud, DED.cloud + 6)), gloryK = ease(sm(DED.glory, DED.glory + 3));
    cloudMat.opacity = cloudK * (0.26 + 0.24 * gloryK); cloudMat.color.setHex(0xf6ead0).lerp(new THREE.Color('#ffd57a'), gloryK); cloud.visible = cloudK > 0.001;
    glow.material.opacity = gloryK * 0.7 * (t < DED.home ? 1 : 1 - ease(sm(DED.home, DED.home + 6))); glowLight.intensity = 900 * gloryK * (t < DED.home ? 1 : 1 - ease(sm(DED.home, DED.home + 6)));
    if (cloud.visible) { for (let i = 0; i < NC; i++) { const ph = cv[i * 2], sp2 = cv[i * 2 + 1]; cp[i * 3] += Math.sin(t * 0.3 * sp2 + ph) * 0.02; cp[i * 3 + 1] += Math.cos(t * 0.25 * sp2 + ph) * 0.015; cp[i * 3 + 2] += Math.sin(t * 0.2 * sp2 + ph * 2) * 0.02; } cloudGeo.attributes.position.needsUpdate = true; }
    // the fire: the shaft comes down over a second, then the altar burns; the court's midst from the sacrifices
    const beamK = t < DED.fire ? 0 : t < DED.fire + 1 ? sm(DED.fire, DED.fire + 1) : 1 - sm(DED.fire + 1.6, DED.fire + 4);
    beam.material.opacity = beamK * 0.55; beam.scale.y = Math.max(0.001, t < DED.fire + 1 ? sm(DED.fire, DED.fire + 1) : 1); beam.position.y = H.courtY + ALTAR.h + 120 * beam.scale.y;
    const fireK = t < DED.fire + 0.6 ? 0 : (t < DED.home ? ease(sm(DED.fire + 0.6, DED.fire + 2)) : 1 - ease(sm(DED.home, DED.home + 5)));
    const courtK = t < DED.zabach ? 0 : (t < DED.home ? ease(sm(DED.zabach, DED.zabach + 3)) : 1 - ease(sm(DED.home, DED.home + 5)));
    fire.visible = fireK > 0.001 || courtK > 0.001; smoke.visible = fire.visible;
    if (fire.visible) { burn(t, fireK, courtK); fire.material.opacity = Math.max(fireK, courtK) * 0.9; smoke.material.opacity = Math.max(fireK, courtK) * 0.32; }
    // the glory: the house's lights swell
    hallLight.intensity *= 1 + 2.5 * gloryK; oracleLight.intensity *= 1 + 2.5 * gloryK; porchLight.intensity *= 1 + 2 * gloryK;   // place() has just set the story's base values
    // seven days pass over the feast, and the eighth day ends in the evening
    let daylight = 1;
    if (t >= DED.feast && t < DED.home) { const th = (t - DED.feast) / (DED.home - DED.feast) * Math.PI * 2 * 7; daylight = Math.max(0, Math.sin(th)); sunOffset.set(220 * Math.cos(th) + 60, 60 + 300 * Math.max(0.05, Math.sin(th)), 180); }
    else if (t >= DED.home) { const u = ease(sm(DED.home, DED.home + 10)); daylight = 1 - 0.55 * u; sunOffset.set(280, 300 - 220 * u, 180); }
    else sunOffset.copy(dayOffset);
    sun.intensity = 2.6 * Math.max(0.06, daylight); hemi.intensity = 0.85 * (0.25 + 0.75 * daylight);
    tmpC.copy(skyNight).lerp(skyDay, daylight); if (t >= DED.home) tmpC.copy(skyDay).lerp(skyDusk, ease(sm(DED.home, DED.home + 10)));
    scene.background.copy(tmpC); scene.fog.color.copy(tmpC);
  }
  function off() {
    if (!on) return; on = false; group.visible = false;
    ark.position.set(0, 0, 0); ark.rotation.y = 0;
    sun.intensity = 2.6; hemi.intensity = 0.85; sunOffset.copy(dayOffset); scene.background.copy(skyDay); scene.fog.color.copy(skyDay);
  }
  return { group, place, off, sunOffset };
}

/** The temple's own actors for the generic scene: the land (Build) and the dedication (Dedicate). */
export function templeExtras({ M, byId, lights, sky, scene }) {
  const land = buildLand(M); scene.add(land.group);
  const ded = buildDedication(M, byId, lights, sky); scene.add(ded.group);
  return {
    sunOffset: ded.sunOffset,
    /** each frame from the timeline: the land's presence (Build) and the dedication's actors (Dedicate); returns the land's presence */
    place(mode, t) { const presence = landAt(mode, t); land.place(t, presence); return presence; },
    /** after the scene has set its lights for t: the dedication's actors (which swell the house's lights in the glory) */
    after(mode, t) { if (mode === 'dedicate') ded.place(t); else ded.off(); },
  };
}
