/**
 * ezekiel-geo.js — the land of Ezekiel 47–48 as the Holy Land map already lays it out (lib/models/holyLand.js:
 * ezekielAllotment — the tribes' bands from the sea to the Jordan, the holy square anchored on Jerusalem with its strips,
 * the prince's land to the borders; and the bundled coast, lakes and the Jordan of levant-base.json), turned into the city
 * model's cubits: the city's centre is the origin, north −z, east +x, one unit one amah of 0.525 m (the map's own cubit).
 * The strips' order (Levites north, the priests with the sanctuary in the midst, the city south) is the map's, so the two
 * agree — fieldy: "why not re-use components of what I already have".
 */
import { ezekielAllotment, TRIBE_COLORS, HOLY_KIND_STYLE, BIBLE_RIVERS } from './holyLand.js';
import levantBase from './levant-base.json' with { type: 'json' };

export const CUBIT_M = 0.525;
const EZ = ezekielAllotment();
const centroid = (ring) => { let x = 0, y = 0; for (const p of ring) { x += p[0]; y += p[1]; } return [x / ring.length, y / ring.length]; };
const cityRing = EZ.holy.find((h) => h.kind === 'city').ring;
const [LON0, LAT0] = centroid(cityRing);
const K_LAT = 111320 / CUBIT_M, K_LON = K_LAT * Math.cos((LAT0 * Math.PI) / 180);
/** lon/lat → [x, z] cubits about the city's centre */
export const toXZ = ([lon, lat]) => [(lon - LON0) * K_LON, -(lat - LAT0) * K_LAT];
/** [x, z] cubits → lon/lat (the inverse, for a heightfield laid over the frame) */
export const fromXZ = ([x, z]) => [LON0 + x / K_LON, LAT0 - z / K_LAT];
export const ORIGIN = [LON0, LAT0];
const ringXZ = (ring) => ring.map(toXZ);

// the window of the land the model draws (lon/lat): the whole plain, so the coast is the only edge of the sea
const WIN = { x0: 27.2, x1: 43.2, y0: 25.0, y1: 38.6 };   // as far as the plain reaches (plainR), so that no bare sea-blue plain shows beyond the land
/** Sutherland–Hodgman: a polygon clipped to the window (the coast of the whole Levant is bundled; the model needs the land about the borders) */
function clipRing(ring) {
  const edges = [
    (p) => p[0] >= WIN.x0, (p) => p[0] <= WIN.x1, (p) => p[1] >= WIN.y0, (p) => p[1] <= WIN.y1,
  ];
  const cross = [
    (a, b) => { const t = (WIN.x0 - a[0]) / (b[0] - a[0]); return [WIN.x0, a[1] + (b[1] - a[1]) * t]; },
    (a, b) => { const t = (WIN.x1 - a[0]) / (b[0] - a[0]); return [WIN.x1, a[1] + (b[1] - a[1]) * t]; },
    (a, b) => { const t = (WIN.y0 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, WIN.y0]; },
    (a, b) => { const t = (WIN.y1 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, WIN.y1]; },
  ];
  let out = ring;
  for (let e = 0; e < 4; e++) {
    const inp = out; out = [];
    if (!inp.length) break;
    let prev = inp[inp.length - 1];
    for (const cur of inp) {
      const ci = edges[e](cur), pi = edges[e](prev);
      if (ci) { if (!pi) out.push(cross[e](prev, cur)); out.push(cur); } else if (pi) out.push(cross[e](prev, cur));
      prev = cur;
    }
  }
  return out;
}
const flatRing = (p) => (typeof p[0][0] === 'number' ? p : p[0]);
const inWin = (pts) => pts.some(([x, y]) => x >= WIN.x0 && x <= WIN.x1 && y >= WIN.y0 && y <= WIN.y1);

/** a river's course as a ribbon `w` cubits wide (a polygon), from its points in cubits */
export function ribbon(pts, w) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    L.push([pts[i][0] - dz * w / 2, pts[i][1] + dx * w / 2]); R.push([pts[i][0] + dz * w / 2, pts[i][1] - dx * w / 2]);
  }
  return [...L, ...R.reverse()];
}

const strip = (kind) => { const h = EZ.holy.find((x) => x.kind === kind || x.id === kind); return h ? { ring: ringXZ(h.ring), centre: toXZ(centroid(h.ring)), color: HOLY_KIND_STYLE[h.kind]?.color, ref: h.ref } : null; };
export const GEO = {
  cubit: CUBIT_M,
  origin: [LON0, LAT0],
  strips: {
    levites: strip('levites'), priests: strip('priests'), sanctuary: strip('sanctuary'),
    foodW: strip('ez-food-w'), foodE: strip('ez-food-e'), princeW: strip('ez-prince-w'), princeE: strip('ez-prince-e'),
    suburbs: strip('suburbs'), city: strip('city'),
  },
  tribes: EZ.bands.map((b) => ({ id: b.id, name: b.name, tribe: b.tribe, ref: b.ref, color: TRIBE_COLORS[b.tribe] || '#8a8', ring: ringXZ(b.ring), centre: toXZ(centroid(b.ring)) })),
  land: levantBase.land.map(flatRing).filter(inWin).map((r) => ringXZ(clipRing(r))).filter((r) => r.length >= 3),
  lakes: levantBase.lakes.filter((l) => inWin(l.ring)).map((l) => ({ name: l.name, ring: ringXZ(l.ring) })),
  rivers: [
    ...levantBase.rivers.filter((r) => inWin(r.pts)).map((r) => ({ name: r.name, pts: r.pts.map(toXZ) })),
    ...BIBLE_RIVERS.map((r) => ({ name: r.id, pts: r.pts.map(toXZ) })),
  ],
  meta: EZ.meta,
};
/** where the house stands: the sanctuary in the midst of the priests' strip, in cubits */
export const HOUSE_XZ = GEO.strips.sanctuary.centre;
export const CITY_XZ = GEO.strips.city.centre;   // ≈ [0, 0] by construction
