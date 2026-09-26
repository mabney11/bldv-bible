/**
 * sky.js — the days and nights over a model: the sun's height for a moment of its day, and the sky, the sun and the light
 * that follow it — a sun disc, stars for the night, the fog's colour, the scene's environment light. Shared by the models'
 * extras (the mashakan's story, the city's day and night on foot). `makeSky` returns { sunOffset, daylight(d) }: the scene
 * keeps `sunOffset` (moving it moves the sun and its shadows); `daylight(d)` sets everything for the day's moment `d`
 * (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset) and returns how much day it is (0 night … 1 day).
 * `reach` scales the disc's and the stars' distance for a model wider than a house.
 */
import * as THREE from 'three';
import { smooth } from '../../lib/models/kit.js';

function discTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,250,235,1)'); r.addColorStop(0.3, 'rgba(255,230,180,0.55)'); r.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
let seed = 19; const rr = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export function makeSky({ scene, lights, sky, reach = 1 }) {
  const { sun, hemi } = lights;
  const SUN0 = sun.intensity, HEMI0 = hemi.intensity, SUN_COL = sun.color.clone(), SKY0 = new THREE.Color(sky);
  const sunOffset = new THREE.Vector3(220, 300, 180);
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture(), color: new THREE.Color('#fff4d6'), transparent: true, opacity: 1, depthWrite: false, fog: false }));
  sunDisc.scale.set(150 * reach, 150 * reach, 1); scene.add(sunDisc);
  const NST = 700, stGeo = new THREE.BufferGeometry(), stp = new Float32Array(NST * 3), R = 1700 * reach;
  for (let i = 0; i < NST; i++) { const th = rr() * Math.PI * 2, ph = Math.acos(rr() * 0.92 + 0.05); stp[i * 3] = R * Math.sin(ph) * Math.cos(th); stp[i * 3 + 1] = R * Math.cos(ph); stp[i * 3 + 2] = R * Math.sin(ph) * Math.sin(th); }
  stGeo.setAttribute('position', new THREE.BufferAttribute(stp, 3));
  const stars = new THREE.Points(stGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 9 * reach, transparent: true, opacity: 0, depthWrite: false, fog: false, sizeAttenuation: true }));
  stars.frustumCulled = false; scene.add(stars);
  const SKY_NIGHT = new THREE.Color('#0c1224'), SKY_DUSK = new THREE.Color('#e08a5a'), SUN_LOW = new THREE.Color('#ff9a4a'), skyCol = new THREE.Color(), sunCol = new THREE.Color();
  let lastDay = -1, lastK = 1;
  function daylight(d) {
    if (d === lastDay) return lastK; lastDay = d;
    const a = (d - 0.25) * Math.PI * 2, el = Math.sin(a);                      // the sun's height: 1 at noon, −1 at midnight
    const day = smooth((el + 0.04) / 0.26), low = 1 - smooth(Math.abs(el) / 0.3);   // how much day it is; how near the horizon the sun is
    // the sun rises in the east (+x), stands a little to the south (+z) at noon, sets in the west
    sunOffset.set(Math.cos(a) * 300, Math.max(el, 0.12) * 300, 130);
    sunCol.copy(SUN_COL).lerp(SUN_LOW, low * 0.8); sun.color.copy(sunCol); sun.intensity = SUN0 * day;
    hemi.intensity = HEMI0 * (0.22 + 0.78 * day);
    scene.environmentIntensity = 0.08 + 0.92 * day;   // the room light every material also has goes down with the sun, or the ground stays noon-bright under the stars
    skyCol.copy(SKY0).lerp(SKY_DUSK, low * 0.7).lerp(SKY_NIGHT, 1 - day); scene.background.copy(skyCol); scene.fog.color.copy(skyCol);
    sunDisc.position.set(Math.cos(a) * 1500 * reach, el * 1500 * reach, 650 * reach); sunDisc.material.opacity = el > -0.06 ? 1 : 0; sunDisc.material.color.copy(SUN_COL).lerp(SUN_LOW, low);
    stars.material.opacity = 0.9 * (1 - day);
    return (lastK = day);
  }
  return { sunOffset, daylight };
}

/** A name drawn on a canvas for a sprite, in a colour with a dark edge (read against sky and ground alike). */
export function labelTexture(text, color = '#fff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d'); g.font = '600 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, 256, 64);
  g.fillStyle = color; g.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
