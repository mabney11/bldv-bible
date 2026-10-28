// Dump every place and allotment shape on the Holy Land map as JSON, for scripts/build-terrain-climate.py.
import * as H from '../src/lib/models/holyLand.js';
const ez = H.ezekielAllotment();
const pts = [...H.BIBLICAL_CITIES, ...H.MODERN_CITIES, ...H.REGIONS, ...H.COMMUNITIES].map(p => ({ id: p.id, lon: p.lon, lat: p.lat }));
const areas = [
  ...H.JOSHUA_TRIBES.map(t => ({ id: t.id, polys: [[t.ring]] })),
  ...ez.bands.map(b => ({ id: b.id, polys: [[b.ring]] })),
  ...ez.holy.map(b => ({ id: b.id, polys: [[b.ring]] })),
  { id: 'ez-holy', polys: [[[[ez.meta.square[0], ez.meta.square[1]], [ez.meta.square[2], ez.meta.square[1]], [ez.meta.square[2], ez.meta.square[3]], [ez.meta.square[0], ez.meta.square[3]]]]] },
  ...H.WORLDLY.map(w => ({ id: 'wl-' + w.id, polys: w.polys })),
];
console.log(JSON.stringify({ pts, areas }));
