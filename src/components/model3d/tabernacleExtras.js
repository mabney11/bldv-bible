/**
 * tabernacleExtras.js — what only the mashakan's story needs, plugged into the generic scene by the model
 * (tabernacle.js MODEL.scene.extras):
 *
 *  · the OPENING, where the word comes to Mashah (Moses) — Yahawah as a column of ash (fire) and smoke on the bare plain where the
 *    sanctuary will stand, and Mashah standing before it (Exodus 25:1, 8–9) — before the day it was raised;
 *  · the DAYS AND NIGHTS over the camp — the sun rising and setting, the sky and the light with it (fieldy: "i want the scene to
 *    reflect day and night for the transitions, reflected by the sun rising and setting");
 *  · the INAN (cloud) on the tent (40:34–38): a tall column of smoke by day, and by night the fire in it, the one turning into
 *    the other as the days pass (fieldy: "the cloud transitioning from the smoke to the flame back and forth");
 *  · the KABAWAD (glory) that filled the mashakan (40:34–35), drawn as light filling the tent from the ark to the door;
 *  · the names of the camps over their tents, each in its own colour, so the reader knows which tribe is where and that those
 *    by the tent are the Lawayay (Levites).
 *
 * Everything here runs on the story clock (`after(mode, t)`), so a scrub lands on the same picture every time.
 */
import * as THREE from 'three';
import { PieceBuilder, personFigure } from './builders.js';
import { makeSky, labelTexture } from './sky.js';
import { smooth } from '../../lib/models/kit.js';
import { ARK, MISH, MATERIALS, PIECES, focusFor } from '../../lib/models/tabernacle.js';

const SITE = { x: ARK.x, z: ARK.z };            // where the column stands: the place of the ark, "that I may dwell in their midst"
const MASHAH = { x: ARK.x + 19, z: 6 };          // Mashah before it, a little to the south, facing the fire
export const OPENING = { until: 6, fade: 2.5 };  // the presence stands through the word to Mashah, then fades as the day of the raising comes
const CLOUD_AT = 84, CAMP_AT = 91;               // the story's moments (RAISE_PHASES): the cloud comes down, the camp stands about it
const TENT = { x: (MISH.x0 + MISH.x1) / 2, z: 0, top: MISH.h + 1.2 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.45, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let seed = 7; const rr = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** A column of smoke with fire in its root: points for the fire (additive, yellow to red) and for the smoke (soft grey) over a spot.
 *  `H` how high the smoke climbs, `R` how broad it grows; the fire reaches `fireH`. */
function makeColumn(group, puff, { NF = 700, NS = 900, H = 46, R = 11, fireH = 15, base = 0, sizeF = 4.5, sizeS = 12 }) {
  const fireGeo = new THREE.BufferGeometry(), fp = new Float32Array(NF * 3), fc = new Float32Array(NF * 3), fseed = [];
  for (let i = 0; i < NF; i++) fseed.push(rr(), rr(), rr());
  fireGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fireGeo.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  const fire = new THREE.Points(fireGeo, new THREE.PointsMaterial({ map: puff, vertexColors: true, size: sizeF, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  fire.frustumCulled = false; group.add(fire);
  const smokeGeo = new THREE.BufferGeometry(), sp = new Float32Array(NS * 3), sseed = [];
  for (let i = 0; i < NS; i++) sseed.push(rr(), rr(), rr());
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ map: puff, color: new THREE.Color('#7d7268'), size: sizeS, transparent: true, opacity: 0, depthWrite: false }));
  smoke.frustumCulled = false; group.add(smoke);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color('#ffb257'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(R * 2.4, R * 1.8, 1); group.add(glow);
  const light = new THREE.PointLight(0xffa64a, 0, R * 11, 1.6); group.add(light);
  const col = new THREE.Color();
  /** lay the points for the moment `t` over (x, z): `kF` the fire's strength, `kS` the smoke's, `smokeCol` its colour */
  function burn(t, x, z, kF, kS, smokeCol) {
    for (let i = 0; i < NF; i++) {
      const [a, b, c] = [fseed[i * 3], fseed[i * 3 + 1], fseed[i * 3 + 2]];
      const u = (t * (0.5 + c * 0.7) + a * 7) % 1, r = (R * 0.3) * (1 - u * 0.6), ang = b * Math.PI * 2 + t * 0.6;
      fp[i * 3] = x + Math.cos(ang) * r * (0.4 + a * 0.6); fp[i * 3 + 1] = base + 0.2 + u * fireH; fp[i * 3 + 2] = z + Math.sin(ang) * r * (0.4 + c * 0.6);
      col.setHSL(0.11 - u * 0.09, 1, 0.58 - u * 0.3); fc[i * 3] = col.r; fc[i * 3 + 1] = col.g; fc[i * 3 + 2] = col.b;
    }
    fireGeo.attributes.position.needsUpdate = true; fireGeo.attributes.color.needsUpdate = true;
    for (let i = 0; i < NS; i++) {
      const [a, b, c] = [sseed[i * 3], sseed[i * 3 + 1], sseed[i * 3 + 2]];
      const u = (t * (0.08 + c * 0.1) + a) % 1, h = base + fireH * 0.6 + u * H, r = R * 0.22 + u * R, ang = b * Math.PI * 2 + t * 0.25 + u * 2.2;
      sp[i * 3] = x + Math.cos(ang) * r * (0.5 + a * 0.5) + u * u * R * 0.5; sp[i * 3 + 1] = h; sp[i * 3 + 2] = z + Math.sin(ang) * r * (0.5 + c * 0.5);
    }
    smokeGeo.attributes.position.needsUpdate = true;
    const flick = 0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 7.3);
    fire.material.opacity = 0.95 * kF; smoke.material.opacity = 0.55 * kS; if (smokeCol) smoke.material.color.copy(smokeCol);
    glow.material.opacity = 0.6 * kF * flick; glow.position.set(x, base + fireH * 0.35, z);
    light.intensity = 900 * (R / 11) * kF * flick; light.position.set(x, base + fireH * 0.5, z);
  }
  return { fire, smoke, glow, light, burn };
}

/** The sun's place in its day: `d` runs 0 → 1 over a day, 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. The story's day: the
 *  word to Mashah before dawn; the sun rises as "the first day of the first month" comes and climbs through the raising; sets as
 *  the court goes up; then over the cloud and the camp the days and nights pass quickly, so the cloud is seen by day and the fire
 *  by night (40:38). On foot it is mid-morning. */
export function dayOf(mode, t, night = false) {
  if (mode !== 'walk') return night ? 0.0 : 0.42;   // on foot: mid-morning, or midnight when asked
  if (t < OPENING.until) return 0.215;
  if (t < 10) return 0.215 + 0.095 * smooth((t - OPENING.until) / 4);   // the sun comes up with "the first day of the first month"
  if (t < 78) return 0.31 + 0.31 * ((t - 10) / 68);
  if (t < CLOUD_AT) return 0.62 + 0.14 * smooth((t - 78) / 6);
  return 0.76 + (t - CLOUD_AT) / 7.3;                       // a day every seven seconds or so: night, day, night, day …
}

export function tabernacleExtras({ M, byId, lights, sky, scene }) {
  const puff = puffTexture();
  const { sunOffset, daylight } = makeSky({ scene, lights, sky });   // the days and nights (sky.js): the scene keeps sunOffset

  // ── the opening: the column on the bare plain, and Mashah before it ─────
  const opening = new THREE.Group(); opening.name = 'opening'; opening.visible = false; scene.add(opening);
  const col0 = makeColumn(opening, puff, { NF: 700, NS: 900, H: 46, R: 11, fireH: 15 });
  const sub = new PieceBuilder(M, { id: 'opening' }); personFigure(sub, 0.35, 'linen', 'stand', 'skin4', 'hair2');
  const mashah = sub.bake(); mashah.userData.id = undefined;
  mashah.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });   // his own materials: fading him must not fade the court's linen
  mashah.position.set(MASHAH.x, 0, MASHAH.z); mashah.rotation.y = Math.atan2(-(SITE.z - MASHAH.z), SITE.x - MASHAH.x);   // turned to face the column
  opening.add(mashah);

  // ── the inan (cloud) on the tent: a tall column of smoke, the fire in it by night ──
  const cloud = new THREE.Group(); cloud.name = 'inan'; cloud.visible = false; scene.add(cloud);
  const col1 = makeColumn(cloud, puff, { NF: 900, NS: 1500, H: 80, R: 16, fireH: 34, base: TENT.top, sizeF: 6, sizeS: 16 });
  byId('inan')?.traverse((o) => { if (o.isMesh) o.castShadow = false; });   // the core is a body to choose, not a shadow on the roof
  const SMOKE_DAY = new THREE.Color('#e9e6df'), SMOKE_NIGHT = new THREE.Color('#5a4a40'), smokeCol = new THREE.Color();

  // ── the kabawad (glory) filling the mashakan (40:34–35): light from the ark's end to the door ──
  const glory = new THREE.Group(); glory.name = 'kabawad'; glory.visible = false; scene.add(glory);
  const NG = 1400, gGeo = new THREE.BufferGeometry(), gp = new Float32Array(NG * 3), gseed = [];
  for (let i = 0; i < NG; i++) gseed.push(rr(), rr(), rr(), rr());
  gGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  const gPts = new THREE.Points(gGeo, new THREE.PointsMaterial({ map: puff, color: new THREE.Color('#ffc85a'), size: 4.6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  gPts.frustumCulled = false; glory.add(gPts);
  const gGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color('#ffe2a0'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  gGlow.scale.set(34, 18, 1); glory.add(gGlow);
  const gDoor = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color('#ffe8b0'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  gDoor.position.set(MISH.x1 + 2, MISH.h / 2, 0); gDoor.scale.set(14, 14, 1); glory.add(gDoor);   // the light at the door, where Mashah could not go in
  const gLight = new THREE.PointLight(0xffe0a0, 0, 60, 1.4); gLight.position.set(TENT.x, MISH.h - 1, 0); glory.add(gLight);
  function shine(t, k) {
    const L = MISH.x1 - MISH.x0, W = 2 * MISH.z, front = MISH.x0 + L * Math.min(1, k * 1.15);   // the light's front, from the ark eastward to the door
    for (let i = 0; i < NG; i++) {
      const [a, b, c, d] = [gseed[i * 4], gseed[i * 4 + 1], gseed[i * 4 + 2], gseed[i * 4 + 3]];
      const x = MISH.x0 + a * L, drift = Math.sin(t * (0.6 + d) + b * 6.28) * 0.6;
      const on = x < front;
      gp[i * 3] = on ? x + drift : 0; gp[i * 3 + 1] = on ? 0.4 + c * (MISH.h - 0.8) + Math.cos(t * (0.4 + b) + a * 6.28) * 0.4 : -100; gp[i * 3 + 2] = on ? -MISH.z + 0.4 + b * (W - 0.8) : 0;
    }
    gGeo.attributes.position.needsUpdate = true;
    const pulse = 0.9 + 0.1 * Math.sin(t * 2.3);
    gPts.material.opacity = k * pulse; gGlow.material.opacity = 0.7 * k * pulse; gGlow.position.set(MISH.x0 + L * Math.min(1, k * 1.15) / 2, MISH.h / 2, 0);
    gDoor.material.opacity = 0.7 * smooth((k - 0.7) / 0.3) * pulse; gLight.intensity = 500 * k * pulse;
  }

  // ── the names of the camps over their tents, each in its own colour ──
  const labels = new THREE.Group(); labels.name = 'camp-names'; labels.visible = false; scene.add(labels);
  for (const p of PIECES) {
    if (p.group !== 'camp' && p.group !== 'levites') continue;
    const f = focusFor(p.id); if (!f) continue;
    const name = p.group === 'levites' ? 'Lawayay' : p.tag.split(' ')[0];
    const key = p.group === 'levites' ? 'camp-levites' : `camp-${p.id}`, color = MATERIALS[key]?.color || '#fff';
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(name, color), transparent: true, depthWrite: false, depthTest: false }));
    sp.position.set(f.target[0], p.group === 'levites' ? 14 : 26, f.target[2]); sp.userData.big = p.group !== 'levites'; sp.renderOrder = 998; labels.add(sp);
  }
  function nameplates(mode, k) {
    labels.visible = k > 0.01;
    for (const sp of labels.children) { const s = (mode === 'walk' ? (sp.userData.big ? 64 : 40) : (sp.userData.big ? 22 : 16)) * (0.6 + 0.4 * k); sp.scale.set(s, s / 4, 1); sp.material.opacity = k; }
  }

  let wantNight = false, lastMode = 'walk', lastDayK = 1, lastKc = 0;
  /** the cloud's smoke and fire for the moment: `sec` the time the particles flow by, `day` how much day it is, `kc` how far the cloud has come down */
  function cloudAt(sec, day, kc) {
    const night = 1 - day;
    cloud.visible = kc > 0.001;
    if (cloud.visible) { smokeCol.copy(SMOKE_DAY).lerp(SMOKE_NIGHT, night); col1.burn(sec, TENT.x, TENT.z, kc * (0.15 + 0.85 * night), kc * (0.55 + 0.45 * day), smokeCol); }
  }
  return {
    sunOffset,
    place() { return 0; },
    /** the hour on foot: { time: 'day' | 'night' } */
    set({ time }) { if (time) wantNight = time === 'night'; },
    /** on foot, called every frame by the scene: the fire and the smoke flow on though the story clock stands (fieldy); true when something moved */
    tick(sec) {
      if (lastMode === 'walk') return false;
      cloudAt(sec, lastDayK, lastKc); return cloud.visible;
    },
    after(mode, t) {
      const walk = mode === 'walk'; lastMode = mode;
      const day = daylight(dayOf(mode, t, wantNight)); lastDayK = day;
      // the opening stands through the word to Mashah and fades as the day of the raising comes; gone on foot and after
      const k0 = walk ? clamp01(1 - (t - OPENING.until) / OPENING.fade) : 0;
      opening.visible = k0 > 0.001;
      if (opening.visible) {
        col0.burn(t, SITE.x, SITE.z, k0, k0, null);
        mashah.visible = k0 > 0.02; mashah.traverse((o) => { if (o.isMesh) { o.material.transparent = k0 < 0.999; o.material.opacity = k0; } });
      }
      // the cloud on the tent: comes down as its verse is read; by day smoke, by night the fire in it, each turning into the other
      const kc = walk ? smooth((t - CLOUD_AT + 0.8) / 2.2) : 1; lastKc = kc;
      cloudAt(walk ? t : performance.now() / 1000, day, kc);
      // the glory fills the mashakan as the cloud comes down (40:34), and rests there while the camp is seen
      const kg = walk ? smooth((t - CLOUD_AT - 0.5) / 3) * (1 - smooth((t - CAMP_AT - 3) / 3)) : 0;
      glory.visible = kg > 0.001;
      if (glory.visible) shine(t, kg);
      // the camps' names, once the camp stands (always on foot)
      nameplates(mode, walk ? smooth((t - CAMP_AT + 0.4) / 2) : 1);
    },
  };
}
