/**
 * tabernacleExtras.js — what only the mashakan's story needs: the opening, where
 * the word comes to Mashah (Moses) — Yahawah as a column of ash (fire) and
 * smoke on the bare plain where the sanctuary will stand, and Mashah standing
 * before it (Exodus 25:1, 8–9) — before the day it was raised. Plugged into the
 * generic scene by the model (tabernacle.js MODEL.scene.extras).
 *
 * The fire and the smoke are particles, as the temple's dedication draws them;
 * Mashah is the same faceless figure the model's people are. Both are shown
 * only in the guided story's first panes and fade as the raising begins.
 */
import * as THREE from 'three';
import { PieceBuilder, personFigure } from './builders.js';
import { ARK } from '../../lib/models/tabernacle.js';

const SITE = { x: ARK.x, z: ARK.z };            // where the column stands: the place of the ark, "that I may dwell in their midst"
const MASHAH = { x: ARK.x + 19, z: 6 };          // Mashah before it, a little to the south, facing the fire
export const OPENING = { until: 6, fade: 2.5 };  // the presence stands through the word to Mashah, then fades as the day of the raising comes

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.45, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let seed = 7; const rr = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export function tabernacleExtras({ M, scene }) {
  const group = new THREE.Group(); group.name = 'opening'; group.visible = false; scene.add(group);
  const puff = puffTexture();
  // the ash (fire): points rising from a hearth of light on the ground, yellow at the root to red at the tips
  const NF = 700, fireGeo = new THREE.BufferGeometry(), fp = new Float32Array(NF * 3), fc = new Float32Array(NF * 3), fseed = [];
  for (let i = 0; i < NF; i++) fseed.push(rr(), rr(), rr());
  fireGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fireGeo.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  const fire = new THREE.Points(fireGeo, new THREE.PointsMaterial({ map: puff, vertexColors: true, size: 4.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  fire.frustumCulled = false; group.add(fire);
  // the smoke: a broad column over the fire, turning slowly, thinning as it climbs
  const NS = 900, smokeGeo = new THREE.BufferGeometry(), sp = new Float32Array(NS * 3), sseed = [];
  for (let i = 0; i < NS; i++) sseed.push(rr(), rr(), rr());
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ map: puff, color: new THREE.Color('#7d7268'), size: 12, transparent: true, opacity: 0, depthWrite: false }));
  smoke.frustumCulled = false; group.add(smoke);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color('#ffb257'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(SITE.x, 5, SITE.z); glow.scale.set(26, 20, 1); group.add(glow);
  const light = new THREE.PointLight(0xffa64a, 0, 120, 1.6); light.position.set(SITE.x, 8, SITE.z); group.add(light);
  // Mashah, standing before the fire, the reader's own figure (the model's people are all this figure)
  const sub = new PieceBuilder(M, { id: 'opening' }); personFigure(sub, 0.35, 'linen', 'stand', 'skin4', 'hair2');
  const mashah = sub.bake(); mashah.userData.id = undefined;
  mashah.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });   // his own materials: fading him must not fade the court's linen
  mashah.position.set(MASHAH.x, 0, MASHAH.z); mashah.rotation.y = Math.atan2(-(SITE.z - MASHAH.z), SITE.x - MASHAH.x);   // turned to face the column
  group.add(mashah);
  const col = new THREE.Color();
  function burn(t, k) {
    for (let i = 0; i < NF; i++) {
      const [a, b, c] = [fseed[i * 3], fseed[i * 3 + 1], fseed[i * 3 + 2]];
      const u = (t * (0.5 + c * 0.7) + a * 7) % 1, r = 3.2 * (1 - u * 0.6), ang = b * Math.PI * 2 + t * 0.6;
      fp[i * 3] = SITE.x + Math.cos(ang) * r * (0.4 + a * 0.6); fp[i * 3 + 1] = 0.2 + u * 15; fp[i * 3 + 2] = SITE.z + Math.sin(ang) * r * (0.4 + c * 0.6);
      col.setHSL(0.11 - u * 0.09, 1, 0.58 - u * 0.3); fc[i * 3] = col.r; fc[i * 3 + 1] = col.g; fc[i * 3 + 2] = col.b;
    }
    fireGeo.attributes.position.needsUpdate = true; fireGeo.attributes.color.needsUpdate = true;
    for (let i = 0; i < NS; i++) {
      const [a, b, c] = [sseed[i * 3], sseed[i * 3 + 1], sseed[i * 3 + 2]];
      const u = (t * (0.08 + c * 0.1) + a) % 1, h = 9 + u * 46, r = 2.5 + u * 11, ang = b * Math.PI * 2 + t * 0.25 + u * 2.2;
      sp[i * 3] = SITE.x + Math.cos(ang) * r * (0.5 + a * 0.5) + u * u * 6; sp[i * 3 + 1] = h; sp[i * 3 + 2] = SITE.z + Math.sin(ang) * r * (0.5 + c * 0.5);
    }
    smokeGeo.attributes.position.needsUpdate = true;
    const flick = 0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 7.3);
    fire.material.opacity = 0.95 * k; smoke.material.opacity = 0.55 * k; glow.material.opacity = 0.6 * k * flick; light.intensity = 900 * k * flick;
    mashah.visible = k > 0.02; mashah.traverse((o) => { if (o.isMesh) { o.material.transparent = k < 0.999; o.material.opacity = k; } });
  }
  return {
    place() { return 0; },
    /** the opening stands through the word to Mashah and fades as the day of the raising comes; gone on foot and after */
    after(mode, t) {
      const k = mode === 'walk' ? Math.max(0, Math.min(1, 1 - (t - OPENING.until) / OPENING.fade)) : 0;
      group.visible = k > 0.001;
      if (group.visible) burn(t, k);
    },
  };
}
