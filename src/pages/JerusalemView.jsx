/**
 * JerusalemView.jsx — /models/toward-jerusalem: stand somewhere in the land and look toward Jerusalem, at eye level,
 * on the real ground.
 *
 * fieldy, 2026-10-28: "id like to see the realistic perspective of someone looking toward Jerusalem from a particular
 * location including elevation -- I expect to see Jerusalem and the temple on a high hill / mountain -- realistic".
 *
 * Realistic means: true heights (no exaggeration), the earth's curve (with ordinary refraction), the haze of distance,
 * the sun, and an honest answer to "can I see it from here?" — a line of sight traced over the same ground. The land is
 * drawn as it lies, without today's buildings; its colours are the land's (wetter western hills, the dry wilderness
 * east of the ridge, the rift and the Salt Sea), not a photograph.
 *
 * Ground: the AWS Terrain Tiles (terrarium) the Holy Land map's relief already uses, fetched by the browser and laid
 * out finer near you and coarser far off (z14 ≈ 8 m pixels at your feet, out to ~110 km). The house on the Mount is
 * 1 Kings 6:2–3 at the app's cubit (0.525 m), set where the Dome of the Rock stands — one of the proposed sites.
 *
 * Deep links: ?from=<biblical city id or lookout id>  ?at=lon,lat  ?eye=1.7|10|300  ?lens=eyes|x7  ?sun=morning|noon|evening
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { pageTitle } from '../hooks/usePageTitle.js';
import { useModelSeo } from '../lib/models/seo.js';
import { BIBLICAL_CITIES, translitOf, haversineKm, bearingDeg, compass } from '../lib/models/holyLand.js';
import { PassageRefs } from '../components/PassageRefs.jsx';
import './JerusalemView.css';

const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const CUBIT = 0.525;
const R_EFF = 6371000 / (1 - 0.13);          // the earth's radius, lengthened by ordinary refraction (k = 0.13)
const MAX_KM = 115;
const TEMPLE = { lon: 35.23535, lat: 31.77805 };   // the Dome of the Rock — one proposed site of the house
const MORIAH = '𐤄𐤓 𐤄𐤌𐤓𐤉𐤄';

// Lookouts beyond the map's cities (Paleo, read through translitOf like every other name)
const LOOKOUTS = [
  { id: 'olives', paleo: '𐤄𐤓 𐤄𐤆𐤉𐤕𐤉𐤌', en: 'the Mount of Olives', lon: 35.2445, lat: 31.7785, ref: 'Zechariah 14:4; 2 Samuel 15:30; Luke 19:37–41' },
  { id: 'gihon', paleo: '𐤂𐤇𐤅𐤍', en: 'the Gihon spring, in the Kidron below the Mount', lon: 35.2365, lat: 31.7735, ref: '1 Kings 1:33–45; 2 Chronicles 32:30' },
  { id: 'adummim', paleo: '𐤌𐤏𐤋𐤄 𐤀𐤃𐤌𐤉𐤌', en: 'the ascent of Adummim, on the road up from Jericho', lon: 35.3655, lat: 31.8236, ref: 'Joshua 15:7; Joshua 18:17; Luke 10:30' },
  { id: 'pisgah', paleo: '𐤄𐤐𐤎𐤂𐤄', en: 'the top of Pisgah on Mount Nebo, where Moses was shown the land', lon: 35.7255, lat: 31.7681, ref: 'Deuteronomy 34:1–4; Deuteronomy 3:27; Numbers 21:20' },
  { id: 'saltsea', paleo: '𐤉𐤌 𐤄𐤌𐤋𐤇', en: 'the shore of the Salt Sea', lon: 35.462, lat: 31.712, ref: 'Joshua 15:5; Ezekiel 47:8' },
].map((l) => ({ ...l, translit: translitOf(l.paleo), kind: 'lookout' }));

const CITIES = BIBLICAL_CITIES.filter((c) => c.id !== 'jerusalem' && haversineKm([c.lon, c.lat], [TEMPLE.lon, TEMPLE.lat]) < 100);
const PLACES = [...LOOKOUTS, ...CITIES.map((c) => ({ ...c, kind: 'city' }))];
const placeById = (id) => PLACES.find((p) => p.id === id);
const EYES = [{ v: 1.7, label: 'Standing' }, { v: 10, label: 'On a roof' }, { v: 300, label: 'A bird' }];
const LENSES = { eyes: { hfov: 70, label: 'Your eyes' }, x7: { hfov: 10, label: 'Binoculars ×7' } };
const SUNS = { morning: { az: 105, alt: 22, label: 'Morning' }, noon: { az: 180, alt: 62, label: 'Noon' }, evening: { az: 255, alt: 16, label: 'Evening' } };

// ── tiles ──
const tileLon = (x, z) => x / 2 ** z * 360 - 180;
const tileLat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(Math.sinh(n)); };
const lonToX = (lon, z) => (lon + 180) / 360 * 2 ** z;
const latToY = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z; };

const heightCache = new Map();     // 'z/x/y' → Promise<Float32Array>
function loadTile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (!heightCache.has(k)) {
    heightCache.set(k, (async () => {
      const res = await fetch(DEM.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      if (!res.ok) throw new Error(`tile ${k}: ${res.status}`);
      const bmp = await createImageBitmap(await res.blob());
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, 256, 256).data;
      const h = new Float32Array(256 * 256);
      for (let i = 0; i < h.length; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
      return h;
    })().catch((e) => { heightCache.delete(k); throw e; }));
  }
  return heightCache.get(k);
}
const loaded = new Map();          // 'z/x/y' → Float32Array, once resolved (for synchronous sampling)

function sampleTile(h, fx, fy) {   // fx, fy in pixels (0..256)
  const X = Math.min(255, Math.max(0, fx - 0.5)), Y = Math.min(255, Math.max(0, fy - 0.5));
  const x0 = Math.floor(X), y0 = Math.floor(Y), x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1);
  const ax = X - x0, ay = Y - y0;
  return (h[y0 * 256 + x0] * (1 - ax) + h[y0 * 256 + x1] * ax) * (1 - ay) + (h[y1 * 256 + x0] * (1 - ax) + h[y1 * 256 + x1] * ax) * ay;
}
/** ground height at a point from the finest tile loaded there (null when none is) */
function heightAt(lon, lat) {
  for (let z = 14; z >= 6; z--) {
    const X = lonToX(lon, z), Y = latToY(lat, z);
    const h = loaded.get(`${z}/${Math.floor(X)}/${Math.floor(Y)}`);
    if (h) return sampleTile(h, (X - Math.floor(X)) * 256, (Y - Math.floor(Y)) * 256);
  }
  return null;
}

/** the tiles to draw from a viewpoint: finer near, coarser far (a quadtree split by distance) */
function chooseTiles(lon0, lat0) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  const out = [];
  const z0 = 7;
  const span = MAX_KM / 100;
  const xa = Math.floor(lonToX(lon0 - span * 1.3, z0)), xb = Math.floor(lonToX(lon0 + span * 1.3, z0));
  const ya = Math.floor(latToY(lat0 + span, z0)), yb = Math.floor(latToY(lat0 - span, z0));
  const visit = (z, x, y) => {
    const w = tileLon(x, z), e = tileLon(x + 1, z), n = tileLat(y, z), s = tileLat(y + 1, z);
    const dx = Math.max(w - lon0, 0, lon0 - e) * kx, dy = Math.max(s - lat0, 0, lat0 - n) * ky;
    const d = Math.hypot(dx, dy);
    if (d > MAX_KM * 1000) return;
    const size = (e - w) * kx;
    if (z < 14 && d < size * 1.6) { for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) visit(z + 1, x * 2 + i, y * 2 + j); return; }
    out.push({ z, x, y, d });
  };
  for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) visit(z0, x, y);
  return out.sort((a, b) => a.d - b.d);
}

// ── the land's colours ──
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C = {
  sea: [0.23, 0.42, 0.55], salt: [0.27, 0.47, 0.55], sand: [0.84, 0.78, 0.62],
  plain: [0.64, 0.6, 0.4], scrub: [0.66, 0.61, 0.45], olive: [0.52, 0.52, 0.35], rock: [0.76, 0.72, 0.63],
  chalk: [0.86, 0.8, 0.66], desert: [0.78, 0.68, 0.5], marl: [0.84, 0.77, 0.6], oasis: [0.32, 0.42, 0.22], plateau: [0.66, 0.6, 0.44],
};
function isSea(lon, h) { return lon < 35.0 && h <= 0.5; }
function isSalt(lon, lat, h) { return lon > 35.3 && lon < 35.62 && lat > 30.9 && lat < 31.8 && h <= -409; }
function landColour(lon, lat, h, slope) {
  if (isSea(lon, h)) return C.sea;
  if (isSalt(lon, lat, h)) return C.salt;
  // the rain falls on the west of the watershed (≈ 35.25 at Jerusalem) and the wilderness lies east of it
  const wet = 1 - sstep(35.2, 35.42, lon) * sstep(-200, 600, h) - sstep(35.42, 35.5, lon) * (1 - sstep(-200, 300, h)) * 0.0;
  const n1 = vnoise(lon * 900, lat * 900), n2 = vnoise(lon * 140, lat * 140);
  let c;
  if (lon < 34.95 && h < 60) c = mixc(C.plain, C.sand, sstep(34.85, 34.6, lon) * 0.9);                // the coastal plain and its dunes
  else if (h < 250 && lon < 35.1) c = mixc(C.plain, C.scrub, sstep(80, 250, h));                    // the low hills (Shephelah)
  else c = mixc(C.scrub, C.olive, n2 * 0.8);
  // east of the ridge: the wilderness of Judah, then the rift's marl
  c = mixc(c, C.desert, (1 - wet) * 0.95);
  if (h < -200 && lon > 35.35 && lon < 35.62) c = mixc(c, C.marl, 0.75);
  if (lon > 35.62 && h > 500) c = mixc(c, C.plateau, 0.7);                                       // the plateau beyond the Jordan
  // Jericho's spring and the Jordan's green ribbon
  const jer = Math.hypot((lon - 35.445) * 95, (lat - 31.87) * 111);
  if (jer < 3.2 && h < -150) c = mixc(c, C.oasis, (1 - jer / 3.2) * 0.85);
  if (h < -330 && lon > 35.54 && lon < 35.58 && lat > 31.76) c = mixc(c, C.oasis, 0.55);
  // bare rock on steep ground, chalk on the wilderness's slopes
  c = mixc(c, wet > 0.5 ? C.rock : C.chalk, sstep(0.35, 0.8, slope) * 0.8);
  const k = 0.88 + n1 * 0.2;
  return [c[0] * k, c[1] * k, c[2] * k];
}

// ── the terrain material: sun, sky light, the haze of distance, and the earth's curve ──
const VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 camPos; uniform float rEff;
attribute vec3 color;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vPos;
void main() {
  vec3 p = position;
  vec2 d = p.xz - camPos.xz;
  p.y -= dot(d, d) / (2.0 * rEff);
  vColor = color; vNormal = normal; vPos = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}`;
const FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 camPos; uniform vec3 sunDir; uniform vec3 haze; uniform float vis; uniform float sunK;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vPos;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y); }
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  float dist = length(vPos - camPos);
  vec3 base = vColor;
  // the ground's grain — rock, terraces, scrub and olive trees — fading out with distance
  float near = 1.0 - smoothstep(300.0, 9000.0, dist);
  float mid = 1.0 - smoothstep(4000.0, 40000.0, dist);
  vec2 q = vPos.xz;
  float g1 = vn(q / 7.0), g2 = vn(q / 31.0), g3 = vn(q / 160.0), g4 = vn(q / 900.0);
  float water = step(0.9, vColor.b / max(0.01, vColor.r) * 0.75);
  float green = clamp((vColor.g - vColor.b) * 4.0 - 0.3, 0.0, 1.0) * (1.0 - water);
  base *= mix(1.0, 0.82 + 0.36 * g3, mid * (1.0 - water));
  base *= mix(1.0, 0.86 + 0.28 * g4, 1.0 - water);
  float bush = smoothstep(0.62, 0.8, g1 * 0.6 + g2 * 0.4) * green;
  base = mix(base, vec3(0.2, 0.24, 0.15), bush * near * 0.85);
  float stone = smoothstep(0.78, 0.95, vn(q / 1.3 + 17.0)) * smoothstep(0.4, 0.7, g2) * (1.0 - water);
  base = mix(base, vec3(0.82, 0.79, 0.72), stone * (1.0 - smoothstep(50.0, 1500.0, dist)) * 0.35);
  float diff = max(dot(n, sunDir), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 col = base * (0.22 + 0.24 * sky + sunK * diff);
  col = mix(col, vec3(0.55, 0.7, 0.8), water * pow(1.0 - abs(normalize(camPos - vPos).y), 4.0) * 0.5);
  float f = 1.0 - exp(-dist / vis);
  col = mix(col, haze, clamp(f, 0.0, 0.94));
  gl_FragColor = vec4(pow(col, vec3(0.92)), 1.0);
}`;
const SKY_VERT = `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `uniform vec3 sunDir; uniform vec3 haze; uniform vec3 zenith; varying vec3 vDir;
void main() {
  float h = max(vDir.y, -0.05);
  vec3 c = mix(haze, zenith, pow(clamp(h * 2.2, 0.0, 1.0), 0.6));
  float s = max(dot(normalize(vDir), sunDir), 0.0);
  c += vec3(1.0, 0.93, 0.8) * (smoothstep(0.99996, 0.99999, s) * 2.5 + pow(s, 900.0) * 0.6 + pow(s, 24.0) * 0.12);
  if (vDir.y < 0.0) c = haze;
  gl_FragColor = vec4(c, 1.0);
}`;

export default function JerusalemView() {
  const [params, setParams] = useSearchParams();
  const at = params.get('at')?.split(',').map(Number);
  const from = useMemo(() => {
    if (at && at.length === 2 && at.every(Number.isFinite)) return { id: 'at', translit: 'Here', en: `${at[1].toFixed(4)}° N, ${at[0].toFixed(4)}° E`, lon: at[0], lat: at[1] };
    return placeById(params.get('from') || 'olives') || LOOKOUTS[0];
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const eye = Number(params.get('eye')) || 1.7;
  const lens = LENSES[params.get('lens')] ? params.get('lens') : 'eyes';
  const sun = SUNS[params.get('sun')] ? params.get('sun') : 'morning';
  const [hazy, setHazy] = useState(false);
  const [status, setStatus] = useState({ loaded: 0, total: 0, err: 0 });
  const [info, setInfo] = useState(null);
  const [labels, setLabels] = useState([]);
  const [panel, setPanel] = useState(true);
  const wrapRef = useRef(null);
  const stateRef = useRef({});

  useModelSeo(pageTitle('Toward Jerusalem — Maps'), 'Stand anywhere in the land and look toward Jerusalem at eye level on the real ground: true heights, the curve of the earth, the haze of distance, and whether the Temple Mount is in sight from there.');

  const set = useCallback((k, v) => { const n = new URLSearchParams(params); if (v == null) n.delete(k); else n.set(k, v); if (k === 'from') n.delete('at'); setParams(n, { replace: true }); }, [params, setParams]);

  // ── the scene (once) ──
  useEffect(() => {
    const wrap = wrapRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    wrap.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400000);
    camera.rotation.order = 'YXZ';
    const uni = {
      camPos: { value: new THREE.Vector3() }, rEff: { value: R_EFF }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      haze: { value: new THREE.Color('#d9dde0') }, vis: { value: 60000 }, sunK: { value: 0.75 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uni, side: THREE.DoubleSide });
    const skyUni = { sunDir: uni.sunDir, haze: uni.haze, zenith: { value: new THREE.Color('#5d8fcf') } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyUni, side: THREE.BackSide, depthWrite: false }));
    sky.renderOrder = -1;
    scene.add(sky);
    const group = new THREE.Group(); scene.add(group);
    const S = stateRef.current;
    Object.assign(S, { renderer, scene, camera, uni, skyUni, mat, group, yaw: 0, pitch: 0, hfov: 70, dirty: true, gen: 0 });

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      S.dirty = true;
    };
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();

    // look around: drag; zoom: wheel / pinch (field of view)
    const el = renderer.domElement;
    const pts = new Map();
    let pinch0 = null;
    const onDown = (e) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), f: S.hfov }; } };
    const onMove = (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; S.hfov = Math.min(80, Math.max(3, pinch0.f * pinch0.d / Math.hypot(a[0] - b[0], a[1] - b[1]))); S.dirty = true; return; }
      const k = (S.hfov * Math.PI / 180) / el.clientWidth;
      S.yaw += (e.clientX - prev[0]) * k; S.pitch = Math.max(-1.4, Math.min(1.4, S.pitch + (e.clientY - prev[1]) * k));
      S.dirty = true;
    };
    const onUp = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
    const onWheel = (e) => { e.preventDefault(); S.hfov = Math.min(80, Math.max(3, S.hfov * Math.exp(e.deltaY * 0.001))); S.dirty = true; };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!S.dirty) return;
      S.dirty = false;
      camera.fov = 2 * Math.atan(Math.tan(S.hfov * Math.PI / 360) / camera.aspect) * 180 / Math.PI;
      camera.updateProjectionMatrix();
      camera.rotation.set(S.pitch, S.yaw, 0);
      camera.updateMatrixWorld();
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
      S.onFrame?.();
    };
    tick();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('wheel', onWheel);
      group.children.forEach((m) => m.geometry.dispose());
      renderer.dispose(); wrap.removeChild(el);
    };
  }, []);

  // ── sun, haze, lens, eye ──
  useEffect(() => {
    const S = stateRef.current; if (!S.uni) return;
    const { az, alt } = SUNS[sun];
    const a = az * Math.PI / 180, b = alt * Math.PI / 180;
    S.uni.sunDir.value.set(Math.sin(a) * Math.cos(b), Math.sin(b), -Math.cos(a) * Math.cos(b));
    S.uni.sunK.value = sun === 'noon' ? 0.72 : 0.95;
    S.uni.haze.value.set(hazy ? '#d6d2c8' : sun === 'evening' ? '#e3d6c4' : '#d5dde3');
    S.skyUni.zenith.value.set(hazy ? '#8aa3bf' : '#5d8fcf');
    S.uni.vis.value = hazy ? 22000 : 70000;
    S.dirty = true;
  }, [sun, hazy]);
  useEffect(() => { const S = stateRef.current; S.hfov = LENSES[lens].hfov; S.dirty = true; }, [lens]);

  // ── the viewpoint: choose and load the ground, then face the Mount ──
  useEffect(() => {
    const S = stateRef.current; if (!S.group) return;
    const gen = ++S.gen;
    const lon0 = from.lon, lat0 = from.lat;
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
    const toLocal = (lon, lat, h) => [(lon - lon0) * kx, h, -(lat - lat0) * ky];
    S.toLocal = toLocal; S.origin = [lon0, lat0];
    S.group.children.forEach((m) => m.geometry.dispose()); S.group.clear();
    setInfo(null);
    const tiles = chooseTiles(lon0, lat0);
    loaded.clear();      // sample only the ground drawn from here, so the house and the eye sit on what is shown
    setStatus({ loaded: 0, total: tiles.length, err: 0 });
    let done = 0, err = 0;

    const buildTile = ({ z, x, y, d }, h) => {
      const N = z === 14 && d < 1600 ? 256 : z >= 13 ? 128 : z >= 11 ? 64 : 48;
      const V = (N + 1) * (N + 1);
      const pos = new Float32Array((V + 4 * (N + 1)) * 3), col = new Float32Array(pos.length);
      const ll = new Float32Array(V * 3);
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const u = i / N, v = j / N;
        const lon = tileLon(x + u, z), lat = tileLat(y + v, z);
        let hh = sampleTile(h, u * 256, v * 256);
        if (isSea(lon, hh)) hh = 0;
        const [px, py, pz] = toLocal(lon, lat, hh);
        const k = (j * (N + 1) + i) * 3;
        pos[k] = px; pos[k + 1] = py; pos[k + 2] = pz;
        ll[k] = lon; ll[k + 1] = lat; ll[k + 2] = hh;
      }
      const idx = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      // skirts: hang each edge down so finer and coarser neighbours never show a crack of sky
      const edge = [];
      for (let i = 0; i <= N; i++) edge.push(i);                       // north edge, west → east
      for (let j = 1; j <= N; j++) edge.push(j * (N + 1) + N);         // east edge
      for (let i = N - 1; i >= 0; i--) edge.push(N * (N + 1) + i);     // south edge
      for (let j = N - 1; j >= 1; j--) edge.push(j * (N + 1));         // west edge
      const drop = Math.max(20, (tileLon(x + 1, z) - tileLon(x, z)) * kx / N * 0.6);
      edge.forEach((src, e) => {
        const k = (V + e) * 3;
        pos[k] = pos[src * 3]; pos[k + 1] = pos[src * 3 + 1] - drop; pos[k + 2] = pos[src * 3 + 2];
      });
      for (let e = 0; e < edge.length; e++) {
        const a = edge[e], b = edge[(e + 1) % edge.length], a2 = V + e, b2 = V + (e + 1) % edge.length;
        idx.push(a, b, a2, b, b2, a2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const nrm = g.attributes.normal.array;
      for (let v = 0; v < V; v++) {
        const k = v * 3;
        const slope = 1 - Math.max(0, nrm[k + 1]);
        const c = landColour(ll[k], ll[k + 1], ll[k + 2], Math.min(1, slope * 3));
        col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
      }
      edge.forEach((src, e) => { const k = (V + e) * 3; col[k] = col[src * 3]; col[k + 1] = col[src * 3 + 1]; col[k + 2] = col[src * 3 + 2]; nrm[k] = nrm[src * 3]; nrm[k + 1] = nrm[src * 3 + 1]; nrm[k + 2] = nrm[src * 3 + 2]; });
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      g.boundingSphere.radius += 400;   // the curve lowers far ground; keep it from being culled
      const m = new THREE.Mesh(g, S.mat);
      m.frustumCulled = false;
      return m;
    };

    // the house of 1 Kings 6:2–3: 60 cubits long, 20 wide, 30 high, the porch 20 by 10 before it, facing east
    const buildHouse = () => {
      const gh = heightAt(TEMPLE.lon, TEMPLE.lat);
      if (gh == null) return null;
      const [cx, , cz] = toLocal(TEMPLE.lon, TEMPLE.lat, 0);
      const L = 60 * CUBIT, W = 20 * CUBIT, H = 30 * CUBIT, P = 10 * CUBIT;
      const boxes = [[cx - L / 2, cx + L / 2, gh, gh + H, cz - W / 2, cz + W / 2, [0.93, 0.88, 0.74]], [cx + L / 2, cx + L / 2 + P, gh, gh + H, cz - W / 2, cz + W / 2, [0.88, 0.78, 0.5]],
        [cx - L / 2 - 8, cx + L / 2 + P + 8, gh - 3, gh + 1.2, cz - W / 2 - 8, cz + W / 2 + 8, [0.8, 0.76, 0.66]]];
      const pos = [], nrm = [], col = [];
      for (const [x0, x1, y0, y1, z0, z1, c] of boxes) {
        const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
        g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array);
        for (let i = 0; i < g.attributes.position.count; i++) col.push(...c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, S.mat); m.frustumCulled = false;
      return { mesh: m, ground: gh, top: gh + H };
    };

    const placeEye = () => {
      const g0 = heightAt(lon0, lat0) ?? 0;
      S.ground = g0;
      S.camera.position.set(0, g0 + eye + 0.3, 0);
      S.uni.camPos.value.copy(S.camera.position);
      S.dirty = true;
    };
    const faceTemple = () => {
      const [tx, , tz] = toLocal(TEMPLE.lon, TEMPLE.lat, 0);
      const d = Math.hypot(tx, tz);
      const th = (S.house?.ground ?? 740) + 8 - d * d / (2 * R_EFF);
      S.yaw = Math.atan2(-tx, -tz);
      S.pitch = d < 1 ? 0 : Math.atan2(th - S.camera.position.y, d);
      S.dirty = true;
    };
    S.faceTemple = faceTemple;

    let lastLabels = 0;
    const refresh = () => {
      if (gen !== S.gen) return;
      placeEye();
      if (!S.house) { const h = buildHouse(); if (h) { S.house = h; S.group.add(h.mesh); } }
      setInfo(computeInfo(S, from, eye));
      S.dirty = true;
    };
    S.onFrame = () => {
      const now = performance.now();
      if (now - lastLabels < 120) { clearTimeout(S.lt); S.lt = setTimeout(() => { S.dirty = true; }, 140); return; }
      lastLabels = now;
      setLabels(projectLabels(S, from));
    };

    S.house = null;
    let order = 0;
    (async () => {
      // the ground under your feet first, so the eye and the facing are right from the start
      const queue = [...tiles];
      const worker = async () => {
        while (queue.length && gen === S.gen) {
          const t = queue.shift();
          try {
            const h = await loadTile(t.z, t.x, t.y);
            loaded.set(`${t.z}/${t.x}/${t.y}`, h);
            if (gen !== S.gen) return;
            S.group.add(buildTile(t, h));
            done++;
          } catch { err++; }
          if (gen !== S.gen) return;
          order++;
          if (order === 1 || order % 8 === 0) { refresh(); if (order === 1) faceTemple(); }
          setStatus({ loaded: done, total: tiles.length, err });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
      if (gen !== S.gen) return;
      refresh(); faceTemple();
      setStatus({ loaded: done, total: tiles.length, err });
    })();
  }, [from, eye]);

  const near = useMemo(() => {
    const d = haversineKm([from.lon, from.lat], [TEMPLE.lon, TEMPLE.lat]);
    return { km: d, dir: compass(bearingDeg([from.lon, from.lat], [TEMPLE.lon, TEMPLE.lat])) };
  }, [from]);

  const loading = status.total && status.loaded + status.err < status.total;
  return (
    <div className="jv-page">
      <header className="jv-top">
        <Link to="/landing" className="jv-logo" title="Home">𐤀𐤁</Link>
        <Link to="/models/holy-land" className="jv-back">← Holy Land map</Link>
        <h1 className="jv-h1">Toward Yarawashalam <span>from {from.translit}{from.name && from.name !== from.translit ? ` (${from.name})` : from.en ? ` (${from.en})` : ''}</span></h1>
      </header>
      <div className="jv-body">
        <div className="jv-view" ref={wrapRef}>
          <div className="jv-labels" aria-hidden="true">
            {labels.map((l) => (
              <div key={l.id} className={`jv-lbl${l.temple ? ' jv-lbl-t' : ''}${l.hidden ? ' hidden' : ''}`} style={{ left: l.x, top: l.y }}>
                <span className="jv-lbl-pin" />
                <span className="jv-lbl-text">{l.paleo && <i>{l.paleo}</i>}<b>{l.name}</b>{l.sub && <small>{l.sub}</small>}</span>
              </div>
            ))}
          </div>
          {loading ? <div className="jv-loading">Laying the ground… {status.loaded} / {status.total}</div> : null}
          {status.err > 0 && !loading && <div className="jv-loading err">Some ground could not be fetched ({status.err} tiles) — the terrain tiles come from the internet.</div>}
          <div className="jv-tools">
            <button type="button" onClick={() => stateRef.current.faceTemple?.()}>Face the Mount</button>
            <button type="button" className={lens === 'x7' ? 'on' : ''} onClick={() => set('lens', lens === 'x7' ? null : 'x7')}>{lens === 'x7' ? '🔭 ×7' : '🔭'}</button>
            <button type="button" onClick={() => setPanel((p) => !p)}>{panel ? 'Hide' : 'Details'}</button>
          </div>
          <div className="jv-hint">Drag to look around · pinch or scroll to zoom</div>
        </div>
        {panel && (
          <aside className="jv-panel">
            <label className="jv-field">
              <span>Stand at</span>
              <select value={from.id === 'at' ? '' : from.id} onChange={(e) => set('from', e.target.value)}>
                {from.id === 'at' && <option value="">{from.en}</option>}
                <optgroup label="Lookouts">{LOOKOUTS.map((l) => <option key={l.id} value={l.id}>{l.translit} — {l.en}</option>)}</optgroup>
                <optgroup label="Cities and mountains">{CITIES.map((c) => <option key={c.id} value={c.id}>{c.translit}{c.name !== c.translit ? ` (${c.name})` : ''} · {Math.round(haversineKm([c.lon, c.lat], [TEMPLE.lon, TEMPLE.lat]))} km</option>)}</optgroup>
              </select>
            </label>
            {info && (
              <div className="jv-facts">
                <div className="jv-fact"><span>You</span><b>{fmtH(info.ground)}</b><small>{eye > 2 ? ` · eyes ${eye} m up` : ''}</small></div>
                <div className="jv-fact"><span>The Mount</span><b>{fmtH(info.mount)}</b><small> · {fmtKm(near.km)} {near.dir}</small></div>
                <div className={`jv-verdict ${info.rise > 0 ? 'up' : 'down'}`}>
                  {Math.abs(info.rise) < 15 ? 'About level with you.' : <>The Mount {info.rise > 0 ? 'stands' : 'lies'} <b>{fmtM(Math.abs(info.rise))} {info.rise > 0 ? 'above' : 'below'}</b> you — your eye looks {info.angle >= 0 ? 'up' : 'down'} {Math.abs(info.angle).toFixed(1)}° to it{(info.rise > 0) !== (info.angle >= 0) ? ', the earth\u2019s curve having lowered it' : ''}.</>}
                </div>
                <div className={`jv-verdict ${info.seen ? 'seen' : 'hid'}`}>
                  {info.seen ? (info.seenGround ? 'The Mount is in sight from here.' : 'Its top is in sight; the ground at its foot is hidden.')
                    : <>Hidden from here: {info.block.name ? <><b>{info.block.name}</b> rises</> : 'the ground rises'} to {fmtH(info.block.h)} {fmtKm(info.block.km)} from you, in the way. {info.seenAt ? <>It comes into sight if you rise about {fmtM(info.seenAt)}.</> : null}</>}
                </div>
                {info.curve > 1 && <div className="jv-note">The earth's curve hides {fmtM(info.curve)} of height at this distance (light bending in the air included).</div>}
              </div>
            )}
            <div className="jv-row">
              <span>Eyes</span>
              {EYES.map((e) => <button key={e.v} type="button" className={eye === e.v ? 'on' : ''} onClick={() => set('eye', e.v === 1.7 ? null : String(e.v))}>{e.label}</button>)}
            </div>
            <div className="jv-row">
              <span>Lens</span>
              {Object.entries(LENSES).map(([k, l]) => <button key={k} type="button" className={lens === k ? 'on' : ''} onClick={() => set('lens', k === 'eyes' ? null : k)}>{l.label}</button>)}
            </div>
            <div className="jv-row">
              <span>Sun</span>
              {Object.entries(SUNS).map(([k, s]) => <button key={k} type="button" className={sun === k ? 'on' : ''} onClick={() => set('sun', k === 'morning' ? null : k)}>{s.label}</button>)}
              <button type="button" className={hazy ? 'on' : ''} onClick={() => setHazy((h) => !h)}>Hazy</button>
            </div>
            {from.ref && <><div className="jv-sub">{from.translit} in the scriptures</div><PassageRefs refs={from.ref} size="sm" /></>}
            <div className="jv-sub">The Mount — {translitOf(MORIAH)} (Mount Moriah)</div>
            <PassageRefs refs="2 Chronicles 3:1; Genesis 22:2; 1 Kings 6:2–3; Psalms 125:2; Psalms 48:1–2; Isaiah 2:2–3" size="sm" />
            <p className="jv-note">
              True heights, nothing raised. The land is drawn as it lies, without today's buildings. The house is the size
              1 Kings 6:2–3 gives it (60 × 20 cubits, 30 high, its porch facing east), set where the Dome of the Rock stands — one
              of the proposed sites. At a few kilometres it is a speck to the eye, as it would have been; the binoculars show it.
            </p>
            <p className="jv-src">Ground: AWS Terrain Tiles (SRTM and others), fetched as you look. Earth's curve with ordinary refraction.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

const fmtM = (m) => `${Math.round(m).toLocaleString('en-US')} m (${Math.round(m * 3.28084).toLocaleString('en-US')} ft)`;
const fmtH = (m) => m < 0 ? `${fmtM(-m)} below the sea` : fmtM(m);
const fmtKm = (km) => km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;

/** heights, the angle, the curve, and the line of sight from the eye to the Mount */
function computeInfo(S, from, eye) {
  const mount = heightAt(TEMPLE.lon, TEMPLE.lat);
  if (mount == null || S.ground == null) return null;
  const eyeH = S.ground + eye;
  const km = haversineKm([from.lon, from.lat], [TEMPLE.lon, TEMPLE.lat]);
  const d = km * 1000;
  const curve = d * d / (2 * R_EFF);
  const rise = mount - S.ground;
  const angle = Math.atan2(mount - curve - eyeH, d) * 180 / Math.PI;
  // trace the line from the eye to the Mount over the ground, curve included
  const trace = (targetH, eyeAt) => {
    const steps = Math.max(60, Math.round(d / 30));
    let worst = null;
    for (let i = 1; i < steps; i++) {
      const t = i / steps, s = d * t;
      const lon = from.lon + (TEMPLE.lon - from.lon) * t, lat = from.lat + (TEMPLE.lat - from.lat) * t;
      const g = heightAt(lon, lat); if (g == null) continue;
      const bulge = s * (d - s) / (2 * R_EFF);          // the earth between the two ends stands up by this much
      const line = eyeAt + (targetH - eyeAt) * t;
      const over = g + bulge - line;
      if (over > 0 && (!worst || over > worst.over)) worst = { over, h: g, km: s / 1000, t };
    }
    return worst;
  };
  if (d < 150) return { ground: S.ground, mount, rise, angle, curve, seen: true, seenGround: true };
  const top = trace(mount + 16, eyeH), foot = trace(mount + 1, eyeH);
  let seenAt = null;
  if (top) {
    for (const up of [5, 10, 20, 50, 100, 200, 300, 500, 800]) if (!trace(mount + 16, eyeH + up)) { seenAt = up; break; }
  }
  if (top) {
    const lon = from.lon + (TEMPLE.lon - from.lon) * top.t, lat = from.lat + (TEMPLE.lat - from.lat) * top.t;
    let best = null;
    for (const p of [...LOOKOUTS, ...BIBLICAL_CITIES]) {
      if (p.id === from.id) continue;
      const k = haversineKm([lon, lat], [p.lon, p.lat]);
      if (k < 1.5 && (!best || k < best.k)) best = { k, name: p.kind === 'lookout' ? `${p.translit} (${p.en.replace(/,.*/, '')})` : `${p.translit}${p.name !== p.translit ? ` (${p.name})` : ''}` };
    }
    if (best) top.name = best.name;
  }
  return { ground: S.ground, mount, rise, angle, curve, seen: !top, seenGround: !foot, block: top, seenAt };
}

/** labels: the Mount always, and the cities in front of you (dimmed when the ground hides them) */
function projectLabels(S, from) {
  if (!S.toLocal || !S.camera) return [];
  const cam = S.camera, w = S.renderer.domElement.clientWidth, h = S.renderer.domElement.clientHeight;
  const v = new THREE.Vector3();
  const eyeH = cam.position.y;
  const out = [];
  const add = (id, lon, lat, gh, lift, extra) => {
    const [x, , z] = S.toLocal(lon, lat, 0);
    const d = Math.hypot(x, z);
    if (d < 30) return;
    v.set(x, gh + lift - d * d / (2 * R_EFF), z).project(cam);
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) return;
    // line of sight to the label's point
    let hidden = false;
    const steps = Math.min(220, Math.max(30, Math.round(d / 60)));
    for (let i = 1; i < steps - 1 && !hidden; i++) {
      const t = i / steps, s = d * t;
      const g = heightAt(from.lon + (lon - from.lon) * t, from.lat + (lat - from.lat) * t);
      if (g == null) continue;
      if (g + s * (d - s) / (2 * R_EFF) > eyeH + (gh + lift - eyeH) * t + 1) hidden = true;
    }
    out.push({ id, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, d, hidden, ...extra });
  };
  const mh = heightAt(TEMPLE.lon, TEMPLE.lat);
  if (mh != null) add('temple', TEMPLE.lon, TEMPLE.lat, mh, 16, { temple: true, paleo: MORIAH, name: `${translitOf(MORIAH)} · the house`, sub: `${Math.round(mh)} m · ${fmtKm(haversineKm([from.lon, from.lat], [TEMPLE.lon, TEMPLE.lat]))}` });
  for (const c of BIBLICAL_CITIES) {
    if (c.id === from.id || c.id === 'jerusalem') continue;
    if (haversineKm([from.lon, from.lat], [c.lon, c.lat]) > MAX_KM) continue;
    const gh = heightAt(c.lon, c.lat); if (gh == null) continue;
    add(c.id, c.lon, c.lat, gh, 3, { name: c.translit, sub: fmtKm(haversineKm([from.lon, from.lat], [c.lon, c.lat])) });
  }
  // nearer labels win; drop the ones that would sit on top of another
  out.sort((a, b) => (b.temple ? 1 : 0) - (a.temple ? 1 : 0) || a.d - b.d);
  const kept = [];
  for (const l of out) {
    if (kept.some((k) => Math.abs(k.x - l.x) < (k.temple ? 120 : 70) && (k.temple ? l.y > k.y - 70 && l.y < k.y + 20 : Math.abs(k.y - l.y) < 26))) continue;
    kept.push(l);
  }
  return kept;
}
