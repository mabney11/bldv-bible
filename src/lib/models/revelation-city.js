/**
 * revelation-city.js — the qadash (holy) shairay (city), New Yarawashalam, bawaa (coming) down out of shamayam (heaven)
 * (Revelation 21:1–22:5), as data for the generic model engine (ModelScene / ModelSheet / ModelPage).
 *
 * Units: one model unit = one amah (cubit) of 0.525 m — the same cubit and the same frame as the iyar (city) Yachazaqaal
 * (Ezekiel) saw (ezekiel-city.js), so that the two cities stand on the same ground and their twelve gates can be compared gate
 * for gate. The text measures this city in stadia (21:16, twelve thousand a side) and its wall in amah (21:17, a hundred and
 * forty-four): a stadion is drawn as 185 m, that is 352 amah — the city is 4,228,571 amah (2,220 km) a side and as high.
 * At that scale the whole aratz (land) of the Holy Land map lies under it: the city comes down over the land, its centre
 * where Yarawashalam stands, and the model draws the map's own land beneath (ezekiel-geo.js), with no yam (sea) — 21:1.
 *
 * Frame: the city's centre is the origin; north is −z, east +x. Two ways in: DESCEND (guided — the new earth, the city
 * coming down, the mountain, its light, the wall and the gates, the twelve foundations stone by stone, the measuring, the
 * gold, the river and the tree, the throne) and on foot — where the distances are the text's, so the map does not walk you
 * across the city but carries you, as the malaak (angel) carried Yawachanan (John): "{{Revelation 21:10 | He nahal … har}}".
 */
import { makeKit, V, SPEEDS, smooth, timelineFor, BASE_MATERIALS } from './kit.js';
import { GEO, CUBIT_M, HOUSE_XZ } from './ezekiel-geo.js';
import { GATES, WORDS as EZ_WORDS } from './ezekiel-city.js';
export { GATES };   // the gates' names, in Ezekiel's order (48:31–34), so the two cities pair gate for gate

// ── Words ────────────────────────────────────────────────────────────────────
export const WORDS = {
  iyar: EZ_WORDS.iyar, shair: EZ_WORDS.shair, chawamah: EZ_WORDS.chawamah, amah: EZ_WORDS.amah, shabat: EZ_WORDS.shabat, mayam: EZ_WORDS.mayam,
  shairay:    { translit: 'Shairay',     paleo: '𐤔𐤏𐤓𐤉',   en: 'city — the rendering\'s word here (a gate-place)', sn: 'H8179' },
  yarawashalam: { translit: 'Yarawashalam', paleo: '𐤉𐤓𐤅𐤔𐤋𐤌', en: 'Jerusalem', sn: 'H3389' },
  shamayam:   { translit: 'Shamayam',    paleo: '𐤔𐤌𐤉𐤌',   en: 'heavens',                          sn: 'H8064' },
  aratz:      { translit: 'Aratz',       paleo: '𐤀𐤓𐤑',    en: 'earth / land',                     sn: 'H776' },
  yam:        { translit: 'Yam',         paleo: '𐤉𐤌',     en: 'sea',                              sn: 'H3220' },
  kabawad:    { translit: 'Kabawad',     paleo: '𐤊𐤁𐤅𐤃',   en: 'glory — weight',                   sn: 'H3519' },
  awar:       { translit: 'Awar',        paleo: '𐤀𐤅𐤓',    en: 'light',                            sn: 'H216' },
  yashapah:   { translit: 'Yashapah',    paleo: '𐤉𐤔𐤐𐤄',   en: 'jasper',                           sn: 'H3471' },
  aban:       { translit: 'Aban',        paleo: '𐤀𐤁𐤍',    en: 'stone',                            sn: 'H68' },
  malaak:     { translit: 'Malaak',      paleo: '𐤌𐤋𐤀𐤊',   en: 'angel / messenger',                sn: 'H4397' },
  adanay:     { translit: 'Adanay',      paleo: '𐤀𐤃𐤍𐤉',   en: 'foundations / sockets — the rendering\'s "master"', sn: 'H134' },
  qanah:      { translit: 'Qanah',       paleo: '𐤒𐤍𐤄',    en: 'reed — the measuring rod',         sn: 'H7070' },
  madad:      { translit: 'Madad',       paleo: '𐤌𐤃𐤃',    en: 'measure',                          sn: 'H4058' },
  zahab:      { translit: 'Zahab',       paleo: '𐤆𐤄𐤁',    en: 'gold',                             sn: 'H2091' },
  rachab:     { translit: 'Rachab',      paleo: '𐤓𐤇𐤁',    en: 'broad place — the street',         sn: 'H7339' },
  nahar:      { translit: 'Nahar',       paleo: '𐤍𐤄𐤓',    en: 'river',                            sn: 'H5104' },
  chay:       { translit: 'Chay',        paleo: '𐤇𐤉',     en: 'life',                             sn: 'H2416' },
  ayalan:     { translit: 'Ayalan',      paleo: '𐤀𐤉𐤋𐤍',   en: 'tree',                             sn: 'H363' },
  kasaa:      { translit: 'Kasaa',       paleo: '𐤊𐤎𐤀',    en: 'throne',                           sn: 'H3678' },
  hayakal:    { translit: 'Hayakal',     paleo: '𐤄𐤉𐤊𐤋',   en: 'temple / palace',                  sn: 'H1964' },
  gawayam:    { translit: 'Gawayam',     paleo: '𐤂𐤅𐤉𐤌',   en: 'nations',                          sn: 'H1471' },
  layal:      { translit: 'Layal',       paleo: '𐤋𐤉𐤋',    en: 'night',                            sn: 'H3915' },
};

// ── The frame, in cubits ─────────────────────────────────────────────────────
export const STADION = 185 / CUBIT_M;                    // one stadion, 185 m, in the map's cubit: 352.4 amah
export const SIDE = Math.round(12000 * STADION);         // 21:16 — twelve thousand stadia: 4,228,571 amah
export const HALF = SIDE / 2;
export const WALL = { h: 144, t: 24, found: 72, block: 12, span: 2400 };   // 21:17 — the wall a hundred and forty-four amah: the lower 72 its twelve foundations of twelve stones (21:14, 19–20), set in blocks of 12 in the ephod's rows (Exodus 28:17–20), jasper above (21:18); thickness assumed. Within `span` of each gate the blocks are drawn one by one; beyond, as a pattern on the run.
export const GATE_W = 120;                               // the gap in the wall for each pearl (assumed)
export const GATE_AT = [-HALF * 2 / 3, 0, HALF * 2 / 3]; // three a side, a third of the side apart — as Ezekiel's city is drawn, so the gates pair off
export const CITY_Y = 0;                                  // the city stands on the plain: the land lies beneath its floor of gold
export const STREET_W = 240, RIVER_W = 40;                // the street of gold with the river of life in its midst (widths assumed)
export const LEVEL = 0;
export const LAYER = { land: -0.5 };   // the land a hand above the plain (plainDrop 1): outside the walls the walker stands a step below the city's floor
export const STONES = [   // 21:19–20, in the text's order, with a colour for each (the stones as they are known)
  ['yashapah', 'jasper', '#9fd8b0'], ['sapayar', 'sapphire', '#2f5fbf'], ['chalcedony', 'chalcedony', '#b9c8d8'], ['emerald', 'emerald', '#2e9e5c'],
  ['sardonyx', 'sardonyx', '#c9865f'], ['sardius', 'sardius', '#b8342a'], ['chrysolite', 'chrysolite', '#c8c84a'], ['tharashayash', 'beryl', '#7fc9b0'],
  ['patadah', 'topaz', '#e8c14a'], ['chrysoprase', 'chrysoprase', '#8fd46a'], ['jacinth', 'jacinth', '#e07a3a'], ['amethyst', 'amethyst', '#8a5bc4'],
];
/** which stone a block of the foundation is, by its row (0 at the ground) and its column along the wall: the twelve in four rows of three as the ephod's stones sit, each three-wide tile stepped a row on from the last — a checkerboard of the twelve */
export const stoneAt = (row, col) => ((((row % 4) + 4) % 4 + Math.floor((((col % 12) + 12) % 12) / 3)) % 4) * 3 + (((col % 3) + 3) % 3);
const ORD = ['raashawan (first)', 'shanay (second)', 'shalayashay (third)', 'rabayaiy (fourth)', 'chamayashay (fifth)', 'shashay (sixth)', 'shabayaiy (seventh)', 'shamayanay (eighth)', 'thashayaiy (ninth)', 'ishayaray (tenth)', 'eleventh', 'twelfth'];

// ── Materials ────────────────────────────────────────────────────────────────
export const MATERIALS = {
  ...BASE_MATERIALS,
  newearth: { word: 'aratz',     color: '#b9ae8c', hi: '#d8cfae', lo: '#7e765c', metal: 0, rough: 1 },                  // the new earth, no sea
  land:     { word: 'aratz',     color: '#7f9a5a', hi: '#a4bd7c', lo: '#52673a', metal: 0, rough: 1 },                  // the land of the map
  jasper:   { word: 'yashapah',  color: '#79c69c', hi: '#d4f4e0', lo: '#4a8a66', metal: 0.15, rough: 0.2, emissive: '#2f6a4a', emissiveIntensity: 0.35 },   // "clear as crystal"
  pearl:    { word: 'shair',     color: '#f6f1ea', hi: '#ffffff', lo: '#c9bfb4', metal: 0.05, rough: 0.15, emissive: '#e8d8c8', emissiveIntensity: 0.35 },
  goldglass:{ word: 'zahab',     color: '#f0bc3c', hi: '#ffe9a0', lo: '#9a7a2a', metal: 0.25, rough: 0.35, emissive: '#c8881a', emissiveIntensity: 1.1 },   // solid, and radiant (fieldy: "solid and very radiant in light")   // "pure gold, like clear glass" — the city's body
  goldfloor:{ word: 'zahab',     color: '#c9993a', hi: '#ffe08a', lo: '#8a6a20', metal: 0.85, rough: 0.3 },   // the city of gold underfoot; the land shows through it
  street:   { word: 'rachab',    color: '#ffe28a', hi: '#fff6c8', lo: '#a3862a', metal: 0.8, rough: 0.1, emissive: '#8a6a20', emissiveIntensity: 0.55 },   // "transparent glass"
  glory:    { word: 'kabawad',   color: '#fff6dc', hi: '#ffffff', lo: '#cbb98a', metal: 0, rough: 0.3, emissive: '#ffe9b0', emissiveIntensity: 1.2 },
  life:     { word: 'chay',      color: '#6fc9d8', hi: '#b8f0f8', lo: '#2f7f8c', metal: 0.1, rough: 0.1, opacity: 0.85, emissive: '#2a6a78', emissiveIntensity: 0.3 },   // "clear as crystal"
  leaf:     { word: 'ayalan',    color: '#5fae62', hi: '#8fd08e', lo: '#2e6a34', metal: 0, rough: 0.9 },
  angel:    { word: 'malaak',    color: '#ffffff', hi: '#ffffff', lo: '#cfd6e0', metal: 0, rough: 0.6, emissive: '#e0e8ff', emissiveIntensity: 0.4 },
  ...Object.fromEntries(STONES.map(([id, en, color]) => [`stone-${id}`, { word: 'aban', color, hi: color, lo: color, metal: 0.15, rough: 0.25, emissive: color, emissiveIntensity: 0.18 }])),
  ephod:    { word: 'aban', color: '#ffffff', hi: '#ffffff', lo: '#888888', metal: 0.15, rough: 0.3, cells: Array.from({ length: 4 }, (_, r) => Array.from({ length: 12 }, (_, c) => STONES[stoneAt(r, c)][2])), tile: [144, 48] },   // the foundations' pattern for the runs far from any gate: 12 columns × 4 rows of 12-cubit blocks, repeated
};

// ── Parts ────────────────────────────────────────────────────────────────────
const K = makeKit(LEVEL);
const { box, poly, cyl, lathe, ideal, person } = K;
const sphere = (x, y, z, r, extra = {}) => ({ kind: 'sphere', x, y, z, r, ...extra });
const sheetOf = (ring, top, mat) => poly(ring, top, { mat, role: 'land', ideal: false });

/** The runs of one side of the wall between −E…E at height y, h high, with the gaps for the three gates (each side's own axis). */
function runs(side, y, h, t, mat, role, halfGap = GATE_W / 2) {
  const out = [], E = HALF + WALL.t, along = side === 'north' || side === 'south', at = side === 'north' ? -HALF - WALL.t / 2 : side === 'south' ? HALF + WALL.t / 2 : side === 'east' ? HALF + WALL.t / 2 : -HALF - WALL.t / 2;
  const a0 = along ? -E : -HALF, a1 = along ? E : HALF;
  let u = a0;
  const mk = (u0, u1) => (along ? box((u0 + u1) / 2, y, at, u1 - u0, h, t, { mat, role }) : box(at, y, (u0 + u1) / 2, t, h, u1 - u0, { mat, role }));
  for (const g of GATE_AT) { out.push(mk(u, g - halfGap)); u = g + halfGap; }
  out.push(mk(u, a1));
  return out;
}
/** The wall of jasper above the twelve foundations (21:17–18). */
function cityWall() { return ['north', 'east', 'south', 'west'].flatMap((s) => [...runs(s, CITY_Y + WALL.found, WALL.h - WALL.found, WALL.t, 'jasper', s), ...runs(s, CITY_Y, WALL.found, WALL.t, 'ephod', s, WALL.span)]); }
/** The i-th stone's blocks of the foundation (21:14, 19–20) within a gate's span of each gate: 12-cubit blocks, six rows, in the ephod's checker (stoneAt); the rest of the wall's length carries the same as a pattern (cityWall). */
function foundation(i) {
  const out = [], B = WALL.block, rows = WALL.found / B, n = Math.floor(WALL.span / B), mat = `stone-${STONES[i][0]}`;
  for (const side of ['north', 'east', 'south', 'west']) {
    const along = side === 'north' || side === 'south', at = side === 'north' ? -HALF - WALL.t / 2 : side === 'south' ? HALF + WALL.t / 2 : side === 'east' ? HALF + WALL.t / 2 : -HALF - WALL.t / 2;
    for (const g of GATE_AT) for (let c = -n; c < n; c++) {
      const u = g + (c + 0.5) * B; if (Math.abs(u - g) < GATE_W / 2 + B / 2) continue;   // the gate's gap
      const col = Math.round((u - B / 2) / B);   // the block's column counted from the city's centre line, so the pattern joins the runs' beyond the span
      for (let r = 0; r < rows; r++) { if (stoneAt(r, col) !== i) continue; out.push(along ? box(u, CITY_Y + r * B, at, B, B, WALL.t, { mat, role: side }) : box(at, CITY_Y + r * B, u, WALL.t, B, B, { mat, role: side })); }
    }
  }
  return out;
}
export const PEARL = { w: 150, d: 56, h: 170, wayW: 72, wayH: 110 };   // the gate: one block of pearl across the wall's gap, standing proud of the wall and above it, the way cut through it (fieldy: "a gate that is pure pearl")
/** A gate of one pearl (21:21): a gate of pearl set in the wall's gap, the way through it — with its malaak (angel) beside it (21:12). */
function pearlGate(side, i) {
  const at = GATE_AT[i], along = side === 'north' || side === 'south', c = side === 'north' ? -HALF - WALL.t / 2 : side === 'south' ? HALF + WALL.t / 2 : side === 'east' ? HALF + WALL.t / 2 : -HALF - WALL.t / 2;
  const [x, z] = along ? [at, c] : [c, at];
  const out = [along
    ? box(x, CITY_Y, z, PEARL.w, PEARL.h, PEARL.d, { mat: 'pearl', role: 'gate', doorway: { w: PEARL.wayW, h: PEARL.wayH } })
    : box(x, CITY_Y, z, PEARL.d, PEARL.h, PEARL.w, { mat: 'pearl', role: 'gate', doorway: { w: PEARL.wayW, h: PEARL.wayH } })];
  const ax = along ? x + 96 : x + (side === 'east' ? 48 : -48), az = along ? z + (side === 'north' ? -48 : 48) : z + 96;   // the angel stands outside, beside the gate
  out.push(...person(ax, az, along ? (side === 'north' ? Math.PI / 2 : -Math.PI / 2) : (side === 'east' ? Math.PI : 0), 'angel', { y: CITY_Y, s: 1.1, skin: 'skin1', hair: 'hair0' }));
  return out;
}
const gateWay = (side, i) => { const at = GATE_AT[i], along = side === 'north' || side === 'south', c = side === 'north' ? -HALF - WALL.t / 2 : side === 'south' ? HALF + WALL.t / 2 : side === 'east' ? HALF + WALL.t / 2 : -HALF - WALL.t / 2; return along ? { x: at, z: c, axis: 'x', w: PEARL.wayW, t: PEARL.d / 2, leaves: false } : { x: c, z: at, axis: 'z', w: PEARL.wayW, t: PEARL.d / 2, leaves: false }; };
/** The city's floor of gold, in slabs whose corners fall on the gates and the throne (where the walker stands, the vertices are near — float32 keeps its precision). */
function floor() { const L = [-HALF, GATE_AT[0], 0, GATE_AT[2], HALF], out = []; for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) out.push(box((L[i] + L[i + 1]) / 2, CITY_Y - 1, (L[k] + L[k + 1]) / 2, L[i + 1] - L[i], 1, L[k + 1] - L[k], { mat: 'goldfloor', role: 'ground' })); return out; }
/** The street of gold (21:21) from the throne to the east gate in the middle of the side, and on to the west; the river of the water of life in its midst (22:1–2). */
function street() { const L = [-HALF, GATE_AT[0], 0, GATE_AT[2], HALF]; return L.slice(0, -1).map((a, i) => box((a + L[i + 1]) / 2, CITY_Y - 0.98, 0, L[i + 1] - a, 1.0, STREET_W, { mat: 'street', role: 'ground' })); }   // its top a hair above the floor's: no one stands in it
function river() {
  const out = [box((150 + GATE_AT[2]) / 2, CITY_Y + 0.02, 0, GATE_AT[2] - 150, 0.3, RIVER_W, { mat: 'life', role: 'water' }), box((GATE_AT[2] + HALF - 150) / 2, CITY_Y + 0.02, 0, HALF - 150 - GATE_AT[2], 0.3, RIVER_W, { mat: 'life', role: 'water' })];   // from the throne's foot eastward to the gate
  for (let d = 0; d < 6; d++) out.push(ideal(cyl(0, CITY_Y + 0.02 + d * 0.06, 0, 58 - d * 6, 0.3, { mat: 'life', role: 'water' })));   // the spring at the throne's foot, a shallow pool stepping up
  return out;
}
/** The tree of life on this side of the river and on that (22:2): along the river where the walker can be — from the throne, and in from the gate. */
function trees() {
  const out = [], T = (x, z, h) => [ideal(cyl(x, CITY_Y, z, 1.2, h * 0.5, { mat: 'cedar', role: 'tree' })), ideal(lathe(x, CITY_Y + h * 0.4, z, [[0.4, 0], [h * 0.34, h * 0.22], [h * 0.3, h * 0.5], [0.2, h * 0.66]], { mat: 'leaf', role: 'tree' }))];
  const along = (u0, u1) => { for (let u = u0; u < u1; u += 160) for (const s of [-1, 1]) out.push(...T(u, s * (RIVER_W / 2 + 22 + ((u / 160) % 3) * 8), 26 + ((u / 160) % 4) * 4)); };
  along(220, 14000); along(HALF - 14000, HALF - 200);
  return out;
}
/** The throne of Alahayam and of the Lamb (22:1, 3) in the midst: a seat of light on a dais of glory — no one is drawn on it. */
function throne() {
  const out = [];
  for (let i = 0; i < 7; i++) out.push(ideal(cyl(0, CITY_Y + 1.6 + i * 2, 0, 120 - i * 12, 2, { mat: 'glory', role: 'dais' })));
  out.push(ideal(lathe(0, CITY_Y + 15.6, 0, [[0.1, 0], [18, 0], [16, 4], [14, 14], [20, 22], [22, 30], [12, 34], [0.1, 36]], { mat: 'glory', role: 'throne' })));
  return out;
}
/** The gawayam (nations) walking in its light (21:24–26): in at the east gate, along the street, before the throne. */
function nations() {
  const out = []; let seed = 7; const rr = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 26; i++) out.push(...person(HALF - 60 - rr() * 900, (rr() - 0.5) * (STREET_W - 60) + (rr() < 0.5 ? -RIVER_W : RIVER_W), Math.PI + (rr() - 0.5), i % 5 === 0 ? 'royal' : 'linen', { y: CITY_Y }));
  for (let i = 0; i < 18; i++) { const a = rr() * Math.PI * 2, r = 150 + rr() * 160; out.push(...person(Math.cos(a) * r, Math.sin(a) * r, a + Math.PI, i % 4 === 0 ? 'royal' : 'linen', { y: CITY_Y })); }
  for (let i = 0; i < 10; i++) out.push(...person(HALF + WALL.t + 40 + rr() * 300, (rr() - 0.5) * 160, Math.PI + (rr() - 0.5) * 0.6, 'linen', { y: CITY_Y }));
  return out;
}

// ── The pieces ───────────────────────────────────────────────────────────────
const D = (key) => ({ descend: key });
export const PIECES = [
  {
    id: 'aratz', order: 0, group: 'earth', material: 'land', raise: D('newearth'), sheet: false,
    tag: 'aratz (earth) · thayarawash (new)', title: 'A thayarawash (new) shamayam (heaven) and a thayarawash (new) aratz (earth) — and the yam (sea) is no more',
    words: ['aratz', 'shamayam', 'yam'], keys: ['aratz', 'earth', 'land', 'yam', 'sea', 'thayarawash', 'new'],
    on: V('66:21:1'), refs: 'Revelation 21:1',
    measures: [['the earth', 'the Holy Land map\'s own land, as under Yachazaqaal\'s city', 'the map\'s'], ['its mountains', 'the map\'s relief (the same terrain tiles), drawn two and a half times their height so they read against the city', 'the map\'s'], ['the sea', 'none — "the yam (sea) is no more"', '21:1']],
    note: '"{{Revelation 21:1 | the raashawan … more}}" — the land the city comes down over is the map\'s own, the same ground the iyar (city) of Ezekiel 48 stands on, drawn without its seas.',
    elsewhere: { ref: 'Isaiah 65:17–19; 66:22; 2 Peter 3:13; Ezekiel 47:13–20', note: 'New heavens and a new earth, and Jerusalem a rejoicing; the borders of the land the map draws.' },
    assumed: 'That the new earth keeps the old land\'s shape — the model draws the map\'s coast, without the sea.',
    parts: GEO.land.map((r) => sheetOf(r, LAYER.land, 'land')),
  },
  {   // the body of the city — its own piece so that the walker's rays and the route can be told to pass through it (it is neither wall nor floor)
    id: 'guph', group: 'city', material: 'goldglass', raise: D('coming'), order: 1,
    tag: 'the shairay (city)\'s height', title: 'The shairay (city) as ilay (high) as it is arak (long): naqaa (pure) zahab (gold), hamah (like) naqaa (pure) glass',
    words: ['shairay', 'zahab'], keys: [],
    on: V('66:21:16', '66:21:18'), refs: 'Revelation 21:16, 18',
    measures: [['height', '12,000 stadia — the same as its length and breadth', '21:16'], ['of what', 'pure gold, like pure glass', '21:18']],
    note: '"{{Revelation 21:16 | width and height … thakan}}" — the city\'s body, as high as it is broad, drawn as gold one can see through.',
    elsewhere: { ref: 'Revelation 21:16', note: 'The measure of the city.' },
    assumed: 'A cube (a pyramid is also read).',
    parts: [{ kind: 'shell', x: 0, y: CITY_Y + WALL.h, z: 0, w: SIDE, h: SIDE - WALL.h, d: SIDE, mat: 'goldglass' }],   // the body rests on the wall (through a gate one sees the street) and has no underside: solid gold from without, clear as glass from within — the sky over the street
  },
  {
    id: 'zahab', order: 1, group: 'city', material: 'goldfloor', raise: D('coming'), sheet: false,
    tag: 'shairay (city) · naqaa (pure) zahab (gold)', title: 'The shairay (city) of naqaa (pure) zahab (gold), hamah (like) naqaa (pure) glass — twelve thousand stadia every way',
    words: ['shairay', 'zahab', 'iyar'], keys: ['shairay', 'city', 'zahab', 'gold', 'glass', 'stadia', 'square', 'arak', 'length', 'width', 'height'],
    on: V('66:21:16', '66:21:18'), refs: 'Revelation 21:16, 18',
    measures: [['arak (length)', '12,000 stadia — 4,228,571 amah, 2,220 km', '21:16'], ['width', 'the same', '21:16'], ['height', 'the same — drawn as a cube', '21:16'], ['of what', 'pure gold, like pure glass', '21:18']],
    note: '"{{Revelation 21:16 | He madad … thakan}}" — a stadion is drawn as 185 m, 352 amah of the map\'s cubit: the city is as broad as the whole land from Egypt to the Euphrates and as high, and the model draws it so, its body of gold like glass, the earth showing through its floor.',
    elsewhere: { ref: 'Ezekiel 48:16, 35; Isaiah 60:11–19; Hebrews 11:10', note: 'Yachazaqaal\'s city of 4,500 amah a side — a thousandth of this one\'s — with the same twelve gates; the city whose gates stand open and whose light is Yahawah; the city with foundations.' },
    assumed: 'That the equal height makes a cube (a pyramid is also read); the body of gold drawn as glass one can see the earth through.',
    parts: floor(),
  },
  {
    id: 'chawamah', order: 2, group: 'city', material: 'jasper', raise: D('wall'),
    tag: 'chawamah (wall) · 144 amah · yashapah (jasper)', title: 'A kabad (great) and ilay (high) wall of yashapah (jasper), achad (one) hundred forty-arabai (four) amah (cubits)',
    words: ['chawamah', 'yashapah', 'amah'], keys: ['wall', 'walls', 'yashapah', 'jasper', 'amah', 'cubits'],
    on: V('66:21:12', '66:21:17-18'), refs: 'Revelation 21:12, 17–18',
    measures: [['its measure', '144 amah, by the measure of a man, that is, of an angel — drawn as its height', '21:17'], ['its stuff', 'jasper', '21:18'], ['its thickness', 'not measured — 24 here', 'assumed'], ['its foundations', 'twelve stones through its lower half, set as the ephod\'s rows', '21:14, 19–20']],
    note: '"{{Revelation 21:17}}" — the one measure of the text that is in amah, and small against the city\'s stadia: a wall a hundred and forty-four high about a city four million wide; the model keeps both, so that from the gate the wall towers and from the mountain it is a line.',
    elsewhere: { ref: 'Ezekiel 40:5; 42:20; Zechariah 2:4–5; Isaiah 60:18', note: 'The reed of six cubits that measured Yachazaqaal\'s wall; the wall of the sanctuary five hundred round; a city with no wall, for Yahawah a wall of fire; walls called Salvation.' },
    assumed: 'That the hundred and forty-four is the height (it may be the thickness); the thickness.',
    parts: cityWall(),
  },
  ...STONES.map(([id, en, color], i) => ({
    id: `yasawad-${i + 1}`, order: 3 + i, group: 'foundations', material: `stone-${id}`, raise: D(`stone-${i + 1}`),
    tag: `${ORD[i]} · ${en}`, title: `The ${ORD[i]} adanay (foundation): ${id === en ? en : `${id} (${en})`}`,
    words: ['adanay', 'aban'], keys: [id, en, ORD[i].split(' ')[0]],
    on: V(i < 4 ? '66:21:19' : '66:21:20', '66:21:14'), refs: `Revelation 21:${i < 4 ? 19 : 20}, 14`,
    measures: [['which', `the ${ORD[i]} of twelve`, `21:${i < 4 ? 19 : 20}`], ['whose name', 'one of the twelve Apostles of the Lamb — which, the text does not say', '21:14'], ['its place', 'blocks of twelve amah in the lower half of the wall, the twelve stones set in four rows of three as on the ephod (Exodus 28:17–20), stepped on from tile to tile — a checker of the twelve round the whole city', 'assumed']],
    note: `"{{Revelation 21:${i < 4 ? 19 : 20} | ${i === 0 ? 'The raashawan' : i === 4 ? 'the chamayashay' : ORD[i].split(' ')[0]} … ${en}}}" — the ${ORD[i]} of the twelve stones, its blocks set through the foundation of the wall in the ephod's order, ${i === 0 ? 'the jasper the wall itself is built of' : 'in its own colour'}.`,
    elsewhere: { ref: 'Exodus 28:17–21; Ezekiel 28:13; Isaiah 54:11–12', note: 'The twelve stones of the breastplate, a tribe\'s name on each; the stones of Eden\'s covering; foundations of sapphires and gates of carbuncles.' },
    assumed: 'That the twelve foundations are set through the wall\'s lower half in the ephod\'s rows (they may be twelve stones side by side, one under each gate); the blocks\' size; the colours.',
    idealized: 'The course.',
    parts: foundation(i),
  })),
  ...['north', 'east', 'south', 'west'].flatMap((side, si) => GATES[side].map(([name, en], i) => ({
    id: `gate-${side}-${i}`, order: 20 + si * 3 + i, group: 'gates', material: 'pearl', raise: D(`gates-${side}`),
    tag: `shair (gate) of ${name} · pearl`, title: `The shair (gate) of ${name} (${en}) on the ${side} — achad (one) pearl, and its malaak (angel)`,
    words: ['shair', 'malaak', 'shabat'], keys: [name.toLowerCase(), en.toLowerCase()],
    on: V('66:21:12-13', '66:21:21', '66:21:25'), refs: 'Revelation 21:12–13, 21, 25',
    measures: [['the side', `the ${side}: three gates — ${GATES[side].map((g) => g[0]).join(', ')}`, '21:13'], ['of what', 'one pearl', '21:21'], ['its name', `a tribe's — ${name}: the order of Ezekiel 48:${{ north: 31, east: 32, south: 33, west: 34 }[side]}, so the two cities pair gate for gate`, '21:12; assumed'], ['shut?', 'never by day, and there is no night', '21:25'], ['its size', `one block of pearl ${PEARL.w} across and ${PEARL.h} high, the way through it ${PEARL.wayW} wide and ${PEARL.wayH} high`, 'assumed']],
    note: `"{{Revelation 21:21 | The twelve … pearl}}" — every gate one pearl, with a malaak (angel) at it and a tribe's name on it; which name on which gate the Revelation does not say, so this one is ${name}'s as in Yachazaqaal's city.`,
    elsewhere: { ref: 'Ezekiel 48:30–34; Isaiah 60:11; Genesis 28:17', note: 'The gates of Yachazaqaal\'s city, three a side, with the same names; gates open continually; "this is the gate of heaven".' },
    assumed: 'The pearl\'s size and form (a gate of one block of pearl, the way cut through it), the gate\'s place a third along the side, and which tribe\'s name it bears.',
    idealized: 'The pearl.',
    parts: pearlGate(side, i), gates: [gateWay(side, i)],
  }))),
  {
    id: 'rachab', order: 40, group: 'city', material: 'street', raise: D('gold'),
    tag: 'rachab (street) · zahab (gold)', title: 'The rachab (street) of the shairay (city), naqaa (pure) zahab (gold), hamah (like) transparent glass',
    words: ['rachab', 'zahab'], keys: ['rachab', 'street'],
    on: V('66:21:21', '66:22:2'), refs: 'Revelation 21:21; 22:2',
    measures: [['of what', 'pure gold, like transparent glass', '21:21'], ['where', 'from the throne to the gate in the middle of the east side, and on to the west — the river in its midst', '22:1–2; assumed'], ['its breadth', '240 amah', 'assumed']],
    note: '"{{Revelation 21:21 | The rachab … glass}}" — one street is named, and the river runs in the middle of it; the model lays it from the throne in the midst to the middle gate of the east, the gate the walker comes in at, and on through to the west.',
    elsewhere: { ref: 'Revelation 22:2; Ezekiel 47:1–2; Isaiah 35:8', note: 'The river in the midst of the street; the waters from the house that ran east; the highway called holy.' },
    assumed: 'The street\'s course and breadth.',
    parts: street(),
  },
  {
    id: 'nahar', order: 41, group: 'life', material: 'life', raise: D('river'),
    tag: 'nahar (river) of mayam (water) of chay (life)', title: 'A nahar (river) of mayam (water) of chay (life), clear as crystal, out of the kasaa (throne)',
    words: ['nahar', 'mayam', 'chay', 'kasaa'], keys: ['nahar', 'river', 'mayam', 'water', 'waters', 'crystal'],
    on: V('66:22:1-2'), refs: 'Revelation 22:1–2',
    measures: [['from where', 'out of the throne of Alahayam and of the Lamb', '22:1'], ['where', 'in the middle of the street', '22:2'], ['its breadth', '40 amah', 'assumed']],
    note: '"{{Revelation 22:1}}" — the spring at the foot of the throne and the river down the middle of the street to the east gate; the waters of Ezekiel 47 came out of the house the same way, eastward.',
    elsewhere: { ref: 'Ezekiel 47:1–12; Zechariah 14:8; Genesis 2:10; John 4:14', note: 'The waters from under the threshold that healed the sea; living waters from Jerusalem; the river out of Eden; a well of water springing up to everlasting life.' },
    assumed: 'Its breadth and where it ends.',
    parts: river(),
  },
  {
    id: 'itz', order: 42, group: 'life', material: 'leaf', raise: D('river'),
    tag: 'ayalan (tree) of chay (life)', title: 'The ayalan (tree) of chay (life) on this tzad (side) of the nahar (river) and on that: twelve zanay (kinds) of thabawaahath (fruits)',
    words: ['ayalan', 'chay', 'nahar', 'gawayam'], keys: ['ayalan', 'tree', 'trees', 'thabawaahath', 'fruit', 'fruits', 'ipay', 'leaves', 'rapaah', 'healing'],
    on: V('66:22:2', '66:22:14'), refs: 'Revelation 22:2, 14',
    measures: [['where', 'on either side of the river', '22:2'], ['its fruit', 'twelve kinds, one every month', '22:2'], ['its leaves', 'for the healing of the nations', '22:2'], ['how many', 'one tree, or a kind of tree, on both banks — drawn as many', 'assumed']],
    note: '"{{Revelation 22:2 | On this … chadash}}" — the tree on both banks, as the trees of Ezekiel 47:12 whose fruit was for food and whose leaf was for medicine; the model plants them along the river where the walker goes, from the throne and in from the gate.',
    elsewhere: { ref: 'Genesis 2:9; 3:22–24; Ezekiel 47:12; Revelation 2:7', note: 'The tree of life in the midst of the garden, and the way to it kept; the trees on the river\'s banks whose leaf does not fade; "to him who overcomes".' },
    assumed: 'The trees\' number, spacing and form.',
    idealized: 'The trees.',
    parts: trees(),
  },
  {
    id: 'kasaa', order: 43, group: 'life', material: 'glory', raise: D('throne'),
    tag: 'kasaa (throne) · in its midst', title: 'The kasaa (throne) of Alahayam and of the Lamb, in the thawak (midst) of the shairay (city)',
    words: ['kasaa', 'kabawad', 'awar', 'hayakal'], keys: ['kasaa', 'throne', 'kabawad', 'glory', 'nayar', 'lamp', 'hayakal', 'temple'],
    on: V('66:22:3-5', '66:21:22-23'), refs: 'Revelation 22:3–5; 21:22–23',
    measures: [['where', 'in the city — the river proceeds from it, so in its midst', '22:1, 3'], ['the temple', 'none: the Adanay Alahayam and the Lamb are its temple', '21:22'], ['the light', 'no sun nor moon: the glory of Alahayam lights it, and its lamp is the Lamb', '21:23'], ['the night', 'none', '22:5']],
    note: '"{{Revelation 21:22}}" — where Yachazaqaal\'s portion had the house in its midst, this city has a throne and no temple. The model draws a seat of light on a dais of light and no one on it; from it the river runs, and by it the whole city is lit, day without night.',
    elsewhere: { ref: 'Revelation 4:2–6; Isaiah 6:1; Ezekiel 1:26–28; 43:7', note: 'The throne set in heaven with the rainbow about it; the throne high and lifted up; the likeness of a throne over the firmament; "the place of my throne … in the midst of the children of Israel forever".' },
    assumed: 'Everything of its form; that it stands at the city\'s centre.',
    idealized: 'The throne and its dais.',
    parts: throne(),
  },
  {
    id: 'gawayam', order: 44, group: 'city', material: 'linen', raise: D('gates-east'), sheet: false,
    tag: 'gawayam (nations) · malakayam (kings)', title: 'The gawayam (nations) who mahalak (walk) in its awar (light), and the malakayam (kings) of the aratz (earth) who bring their kabawad (glory) into it',
    words: ['gawayam', 'awar', 'kabawad', 'shair'], keys: ['gawayam', 'heathen', 'nations', 'malakayam', 'kings', 'mahalak', 'walk', 'nachath', 'enter'],
    on: V('66:21:24-27'), refs: 'Revelation 21:24–27',
    measures: [['who comes in', 'the nations and the kings of the earth', '21:24, 26'], ['who does not', 'anything profane, or who makes an abomination or a lie', '21:27'], ['where they stand', 'in the east gate and along the street, before the throne', 'assumed']],
    note: '"{{Revelation 21:24 | The gawayam … awar}}" — the people at the gate, along the street and about the throne are the nations walking in the light; the model stands them where the walker walks.',
    elsewhere: { ref: 'Isaiah 60:3–11; Ezekiel 48:19; Psalm 72:10–11', note: 'The nations coming to the light and the kings bringing their wealth, the gates open day and night; the servants of Yachazaqaal\'s city out of all the tribes.' },
    assumed: 'The people themselves — where they stand, how many.',
    parts: nations(),
  },
];

export function pieceById(id) { return PIECES.find((p) => p.id === id) || null; }
export const GROUPS = { earth: 'The thayarawash (new) aratz (earth)', city: 'The shairay (city)', foundations: 'The twelve adanay (foundations)', gates: 'The twelve shairayam (gates) of pearl', life: 'The nahar (river), the ayalan (tree), the kasaa (throne)' };

// ── The passages the model is drawn from ─────────────────────────────────────
export const PASSAGES = [
  { bookId: 66, book: 'Revelation', chapter: 21, from: 1, to: 27, label: 'Revelation 21' },
  { bookId: 66, book: 'Revelation', chapter: 22, from: 1, to: 5, label: 'Revelation 22:1–5' },
];
export const ALL_REFS = 'Revelation 21; 22:1–5';
export const passagesFor = () => PASSAGES;
export const refsFor = () => ALL_REFS;

const KEY_INDEX = [];
for (const p of PIECES) for (const k of p.keys || []) KEY_INDEX.push([k.toLowerCase(), p.id]);
const RULES = [
  { chapter: 21, verses: [1], words: ['aratz', 'earth', 'shamayam', 'heavens', 'yam', 'sea'], piece: 'aratz' },
  { chapter: 21, verses: [2, 10, 11, 16, 18], words: ['shairay', 'city', 'zahab', 'gold', 'glass', 'stadia', 'kabawad', 'awar'], piece: 'zahab' },
  { chapter: 21, verses: [12, 17, 18], words: ['wall', 'amah', 'yashapah', 'jasper'], piece: 'chawamah' },
  { chapter: 21, verses: [12, 13, 21, 25], words: ['shair', 'gates', 'gate', 'pearl', 'pearls', 'malaakayam', 'angels'], piece: 'gate-east-1' },
  { chapter: 21, verses: [14, 19, 20], words: ['adanay', 'foundation', 'foundations', 'aban', 'stones'], piece: 'yasawad-1' },
  { chapter: 21, verses: [21], words: ['rachab', 'street'], piece: 'rachab' },
  { chapter: 21, verses: [22, 23], words: ['hayakal', 'temple', 'kabawad', 'glory', 'nayar', 'lamp', 'shamash', 'sun', 'yarach', 'moon'], piece: 'kasaa' },
  { chapter: 21, verses: [24, 26, 27], words: ['gawayam', 'heathen', 'malakayam', 'kings', 'nachath', 'enter'], piece: 'gawayam' },
  { chapter: 22, verses: [1], words: ['nahar', 'river', 'mayam', 'water', 'chay', 'life'], piece: 'nahar' },
  { chapter: 22, verses: [2, 14], words: ['ayalan', 'tree', 'thabawaahath', 'fruit', 'ipay', 'leaves', 'rapaah'], piece: 'itz' },
  { chapter: 22, verses: [1, 3, 4, 5], words: ['kasaa', 'throne', 'layal', 'night', 'awar', 'light', 'nayar', 'lamp'], piece: 'kasaa' },
];
export function pieceForWord(word, book, chapter, verse) {
  if (book !== 66) return null;
  const w = word.toLowerCase();
  for (const r of RULES) if (r.chapter === chapter && r.verses.includes(verse) && r.words.some((k) => w === k || w.startsWith(k))) return r.piece;
  for (const [k, id] of KEY_INDEX) if (w === k) return id;
  for (const [k, id] of KEY_INDEX) if (k.length > 4 && w.startsWith(k)) return id;
  return null;
}

// ── Timeline ─────────────────────────────────────────────────────────────────
// DESCEND — in the order of 21:1–22:5: the new earth, the city coming down, the mountain, its light, the wall and the gates,
// the twelve foundations stone by stone, the measuring, the gold, the river and the tree, the throne.
const STONE_FROM = 66, STONE_EACH = 3.4;
export const DESCEND_PHASES = [
  { from: 0,   key: 'newearth', caption: '{{Revelation 21:1}}', ref: 'Revelation 21:1', title: '{{Revelation 21:1 | a thayarawash … aratz}}' },
  { from: 9,   key: 'coming',   caption: '{{Revelation 21:2}} {{Revelation 21:3 | Hanah … im}}.', ref: 'Revelation 21:2–3', title: '{{Revelation 21:2 | bawaa … Alahayam}}' },
  { from: 26,  key: 'mountain', caption: '{{Revelation 21:9 | Come here … bride}}. {{Revelation 21:10}}', ref: 'Revelation 21:9–10', title: '{{Revelation 21:10 | a kabad … har}}' },
  { from: 38,  key: 'light',    caption: '{{Revelation 21:11}} {{Revelation 21:23}}', ref: 'Revelation 21:11, 23', title: '{{Revelation 21:11 | Her awar … crystal}}' },
  { from: 50,  key: 'wall',     caption: '{{Revelation 21:12}} {{Revelation 21:13}}', ref: 'Revelation 21:12–13', title: '{{Revelation 21:12 | a kabad … wall}}' },
  { from: STONE_FROM, key: 'foundations', caption: '{{Revelation 21:14}} {{Revelation 21:19}} {{Revelation 21:20}}', ref: 'Revelation 21:14, 19–20', title: '{{Revelation 21:14 | The wall … master}}' },
  { from: STONE_FROM + 12 * STONE_EACH + 6, key: 'measure', caption: '{{Revelation 21:15}} {{Revelation 21:16}} {{Revelation 21:17}}', ref: 'Revelation 21:15–17', title: '{{Revelation 21:16 | twelve thousand … stadia}}' },
  { from: STONE_FROM + 12 * STONE_EACH + 22, key: 'gold', caption: '{{Revelation 21:18}} {{Revelation 21:21}}', ref: 'Revelation 21:18, 21', title: '{{Revelation 21:21 | The rachab … glass}}' },
  { from: STONE_FROM + 12 * STONE_EACH + 34, key: 'gates-east', caption: '{{Revelation 21:24}} {{Revelation 21:25}} {{Revelation 21:27 | but only … chay}}.', ref: 'Revelation 21:24–27', title: '{{Revelation 21:25 | Its shair … day}}' },
  { from: STONE_FROM + 12 * STONE_EACH + 48, key: 'river', caption: '{{Revelation 22:1}} {{Revelation 22:2}}', ref: 'Revelation 22:1–2', title: '{{Revelation 22:1 | a nahar … crystal}}' },
  { from: STONE_FROM + 12 * STONE_EACH + 66, key: 'throne', caption: '{{Revelation 21:22}} {{Revelation 22:3}} {{Revelation 22:4}} {{Revelation 22:5}}', ref: 'Revelation 21:22; 22:3–5', title: '{{Revelation 22:5 | There will … layal}}' },
];
export const DESCEND_DURATION = STONE_FROM + 12 * STONE_EACH + 84;   // ≈ 191 s
const E = HALF + WALL.t, G1 = GATE_AT[1];
const T0 = DESCEND_PHASES.reduce((o, p) => ({ ...o, [p.key]: p.from }), {});
export const DESCEND_CAMERA = [
  [0,   [1400000, 1600000, 3600000], [0, 0, -400000]],                          // the new earth from the south, from far: the land without its seas, its mountains
  [9,   [HOUSE_XZ[0] - 12000, 26000, HOUSE_XZ[1] + 16000], [HOUSE_XZ[0] + 400000, -6000, HOUSE_XZ[1] + 140000]],   // from the great and high mountain — the house's mountain, where Yachazaqaal was set (40:2) — looking out over the land as the city comes down over it
  [17,  [HOUSE_XZ[0] - 12000, 26000, HOUSE_XZ[1] + 16000], [HOUSE_XZ[0] + 400000, 40000, HOUSE_XZ[1] + 140000]],
  [24,  [HOUSE_XZ[0] - 12000, 26000, HOUSE_XZ[1] + 16000], [HOUSE_XZ[0] + 380000, 260000, HOUSE_XZ[1] + 130000]],   // … the eye lifts as the city fills the sky
  [26,  [5200000, 300000, 5600000], [0, 1200000, 0]],                           // from the mountain: a mountain of gold before the eye, its edge and its top
  [38,  [4200000, 900000, 4400000], [0, 1500000, 0]],                           // its light
  [50,  [E + 700, 90, G1 + 520], [E - 100, 70, G1]],                             // the east wall and its middle gate, close
  [58,  [E + 260, 110, G1 + 700], [E, 60, G1 - 4000]],                            // along the wall from the gate: the three of a side are a third of the side apart
  [STONE_FROM, [E + 360, 60, G1 - 300], [E, 36, G1 - 80]],                         // the foundations, course by course, at the gate's corner
  [STONE_FROM + 12 * STONE_EACH + 3, [E + 520, 100, G1 - 420], [E, 60, G1 - 40]],   // … all twelve under the jasper
  [STONE_FROM + 12 * STONE_EACH + 6, [10500000, 3600000, 10800000], [0, 1700000, 0]],   // the measuring: the cube whole
  [STONE_FROM + 12 * STONE_EACH + 22, [E - 400, 9, 40], [E - 3000, 6, 0]],            // the street of gold from inside the gate, westward
  [STONE_FROM + 12 * STONE_EACH + 34, [E + 300, 12, 90], [E - 200, 30, 0]],           // the east gate: the nations coming in
  [STONE_FROM + 12 * STONE_EACH + 48, [E - 900, 16, 0], [E - 1600, 2, 0]],            // down the river in the midst of the street, the trees either side
  [STONE_FROM + 12 * STONE_EACH + 66, [620, 90, 460], [0, 40, 0]],                     // the throne
  [DESCEND_DURATION, [1600, 400, 1200], [0, 60, 0]],
];

// ROAM — no story: the city stands, its gates open, and the walker goes where they will — carried, when it is far.
export const ROAM_EYE = 3.4;
export const ROAM_START = { pos: [E + 90, CITY_Y + ROAM_EYE, 30], look: [E - 200, CITY_Y + 40, 0] };   // outside the middle east gate, facing the pearl
const MILES = (c) => (c * CUBIT_M / 1609.34);
export const ROAM_PHASES = [{ from: 0, key: 'roam', caption: `Walk where you will — in at the gate of pearl before you, down the rachab (street) of gold with the nahar (river) of the water of chay (life) in its midst and the ayalan (tree) of life on either side. The city is twelve thousand stadia a side — ${Math.round(MILES(SIDE))} miles, and as high — so the map does not walk you across it: as the malaak (angel) carried Yawachanan, it carries you to any gate or to the kasaa (throne) in the midst. At ${Math.round(32 * CUBIT_M * 2.23694)} miles an hour the walk from this gate to the throne would take ${Math.round(MILES(HALF) / (32 * CUBIT_M * 2.23694))} hours. Tap a part for its details. Yachazaqaal's city stood on this same ground, a thousandth the size — its gates bear the same names.`, ref: '' }];
export const ROAM_ENTER = {};

export const MODES = {
  descend: { label: 'Descend', phases: DESCEND_PHASES, duration: DESCEND_DURATION, camera: DESCEND_CAMERA, xray: [] },
  roam: { label: 'Roam', phases: ROAM_PHASES, duration: 1, camera: [[0, ROAM_START.pos, ROAM_START.look]], xray: [], free: true },
};
const TL = timelineFor(MODES);
export const { phaseAt, xrayAt, cameraAt } = TL;
/** Each piece appears at its phase; the foundations one after another; on foot everything stands. */
export function progressAt(mode, piece, t) {
  if (mode === 'roam') return 1;
  const key = piece.raise?.[mode]; if (!key) return 1;
  const m = /^stone-(\d+)$/.exec(key);
  if (m) return smooth((t - (STONE_FROM + (+m[1] - 1) * STONE_EACH) + 0.3) / 1.6);
  const k2 = /^gates-/.test(key) ? 'wall' : key;   // the gates come with the wall
  const at = T0[k2]; if (at == null) return 1;
  if (k2 === 'coming' || k2 === 'newearth') return t >= at - 0.01 ? 1 : 0;   // the city descends whole (revelationExtras moves it); no rising from the ground
  return smooth((t - at + 0.6) / 2.4);
}
/** how far the city has come down: 1 = in heaven (the coming phase's start), 0 = on the earth */
export function descentAt(mode, t) { if (mode !== 'descend') return 0; const a = T0.coming, b = T0.mountain; return 1 - smooth((t - a) / (b - a)); }
/** where the measuring light is on its way round the city, 0 → 1 through the Measure phase (null outside it) */
export function measureAt(mode, t) { if (mode !== 'descend') return null; const a = T0.measure, b = T0.gold; if (t < a || t >= b) return null; return (t - a) / (b - a); }
export const CITY_IDS = PIECES.filter((p) => p.id !== 'aratz').map((p) => p.id);   // guph included: the body descends with the rest
export function openAt() { return 1; }
const MARK_LABELS = { descend: { newearth: 'aratz', coming: 'bawaa', mountain: 'har', light: 'awar', wall: 'chawamah', foundations: 'adanay', measure: 'madad', gold: 'zahab', 'gates-east': 'shair', river: 'nahar', throne: 'kasaa' } };
export const marksFor = (mode) => TL.marksFor(mode, MARK_LABELS);
export const CHIP_ORDER = ['zahab', 'chawamah', ...STONES.map((_, i) => `yasawad-${i + 1}`), 'gate-east-1', 'gate-east-0', 'gate-east-2', 'gate-north-0', 'gate-north-1', 'gate-north-2', 'gate-south-0', 'gate-south-1', 'gate-south-2', 'gate-west-0', 'gate-west-1', 'gate-west-2', 'rachab', 'nahar', 'itz', 'kasaa', 'gawayam', 'aratz'];
/** Where the eye goes when a piece is chosen (the focus target and a fitting distance), in cubits. */
export function focusFor(id) {
  const F = {
    aratz: [[0, 0, -200000], 5000000], zahab: [[0, 1200000, 0], 9000000], chawamah: [[E, 80, G1 - 300], 900], rachab: [[E - 1200, 4, 0], 700], nahar: [[E - 700, 4, 0], 260], itz: [[E - 600, 12, 0], 220], kasaa: [[0, 40, 0], 480], gawayam: [[E - 300, 6, 0], 260],
  };
  let m = /^yasawad-(\d+)$/.exec(id); if (m) return { target: [E, 36, G1 - 300], distance: 200 };
  m = /^gate-(\w+)-(\d)$/.exec(id);
  if (m) { const g = gateWay(m[1], +m[2]); return { target: [g.x, 70, g.z], distance: 480 }; }
  const f = F[id]; return f ? { target: f[0], distance: f[1] } : null;
}

// ── The MODEL ────────────────────────────────────────────────────────────────
export const STORIES = [
  { key: 'descend', label: 'Descend', modes: ['descend', 'roam'], icon: 'city', go: 'See it come down →', roamLabel: 'Stand in its gate on your own feet',
    kicker: 'Revelation 21:1–22:5 · "coming down out of heaven"',
    blurb: 'The qadash (holy) shairay (city), New Yarawashalam, coming down over the aratz (earth) — twelve thousand stadia a side and as high, drawn at that scale over the map\'s own land; its wall of yashapah (jasper) a hundred and forty-four amah on twelve adanay (foundations) of twelve stones, its twelve shairayam (gates) each one pearl with a malaak (angel) at it; the rachab (street) of zahab (gold), the nahar (river) of the water of chay (life) from the kasaa (throne), the ayalan (tree) of life on either side. Guided from the new earth to the throne, or on foot at the gate — carried across the city as Yawachanan was.' },
];

export const MODEL = {
  id: 'revelation-city', base: '/models/revelation-city', defaultStory: 'descend',
  title: 'The Shairay (City) Coming Down Out of Shamayam (Heaven)', paleo: '𐤉𐤓𐤅𐤔𐤋𐤌 𐤇𐤃𐤔𐤄',
  description: 'The qadash (holy) shairay (city), New Yarawashalam, of Revelation 21–22 as an interactive 3D model measured from the text at the text\'s own scale — twelve thousand stadia a side and as high, coming down over the Holy Land map\'s own land; the wall of yashapah (jasper) a hundred and forty-four amah on twelve adanay (foundations) of twelve stones, the twelve shairayam (gates) of pearl named for the shabatay (tribes) with a malaak (angel) at each, the rachab (street) of zahab (gold), the nahar (river) of the water of chay (life) from the kasaa (throne) and the ayalan (tree) of life on either side. Watch it come down, or stand in its gate on your own feet and be carried to the throne.',
  indexDescription: 'The holy city of Revelation 21–22 as an interactive 3D model at the text\'s own scale — twelve thousand stadia a side over the Holy Land, its jasper wall on twelve foundations of stones, its twelve gates of pearl, the street of gold, the river of life and the throne — see it come down, or stand in its gate on your own feet.',
  indexIntro: 'One model, drawn at the scale the text gives — a stadion 185 m, a cubit 0.525 m as the Holy Land map takes it — over the map\'s own land, on the same ground as the iyar (city) Yachazaqaal (Ezekiel) saw, so that the two can be compared gate for gate. Two ways in: the city coming down out of heaven, from the new earth to the throne, verse by verse; and the gate of pearl at your own height, the street of gold and the river before you, the wall towering — carried, as Yawachanan was, to any gate or to the throne.',
  ground: LEVEL, cubit: CUBIT_M,
  WORDS, MATERIALS, PIECES, GROUPS, MODES, SPEEDS, CHIP_ORDER, PASSAGES, STORIES,
  pieceById, pieceForWord, passagesFor, refsFor, phaseAt, progressAt, xrayAt, openAt, cameraAt, marksFor, focusFor,
  stories: STORIES,
  related: [
    { label: 'Open Yachazaqaal\'s city →', to: '/models/ezekiel-city', note: 'The iyar (city) of Ezekiel 48 on this same ground, four thousand five hundred amah a side, with twelve gates bearing the same names — three to a side, in the same order.' },
    { label: 'The house Yachazaqaal saw →', to: '/models/ezekiel', note: 'Where that city\'s portion had a house in its midst, this city has no hayakal (temple): the Adanay Alahayam and the Lamb are its temple (21:22).' },
  ],
  card: {
    title: 'The qadash (holy) shairay (city), New Yarawashalam, bawaa (coming) down out of shamayam (heaven)',
    subtitle: (mode) => (mode === 'roam' ? 'Revelation 21:12–27; 22:1–5' : 'Revelation 21:1–22:5'),
    intro: (mode) => (mode === 'roam'
      ? 'No story here: the city stands, and you stand at its middle east gate — the gate of pearl before you, the wall of jasper on its twelve foundations towering either side, the street of gold running in to the throne with the river in its midst. The city is the text\'s size, so the map carries you across it rather than walking you; tap a part for its words and measures.'
      : 'Play, and the vision unfolds as the text gives it: the new earth without its sea, the city coming down out of heaven whole, the mountain it is seen from, its light like jasper, the wall and the twelve gates, the twelve foundations named stone by stone, the measuring with the golden reed, the gold like glass, the nations coming in at gates never shut, the river of life and the tree, and the throne where there is no temple and no night.'),
    extras: () => [{ heading: 'The scale, and what the model adds', refs: 'Revelation 21:15–17; Ezekiel 40:5; 48:16', text: 'The text measures the city in stadia and its wall in amah (cubits): the model draws both at their word — a stadion 185 m, that is 352 amah of the map\'s cubit of 0.525 m — so the city is 4,228,571 amah, about 1,380 miles, a side and as high, and the wall 144 amah high about it. That is the whole land from the river of Egypt to the Euphrates under one city, and the model sets it down over the Holy Land map\'s own land with its centre where Yarawashalam stands, on the same ground as the city of Ezekiel 48 (a thousandth the size), whose gates give these their names in the same order. What the text does not give — the wall\'s thickness, the foundations as courses, the pearls\' form, the street\'s course and breadth, the river\'s breadth, the trees\' number, the throne\'s form, the people — is the model\'s, and each card says so.' }],
    choose: 'Tap a part — a gate, a foundation, the wall, the street, the river, the throne — or a chip under the model, or a marked word in the text, for its measures verse by verse, the same thing elsewhere in scripture, and what the model had to assume.',
  },
  strings: { parts: 'Parts of the city', storiesTitle: 'The city\'s story', guidedTitle: 'Guided: as the text gives it, verse by verse' },
  roam: { eye: ROAM_EYE, start: ROAM_START, enter: ROAM_ENTER, openKeys: [], openKey: (which) => which, openDefault: () => 1 },
  scene: {
    sky: 0xcfe3f2, shadowR: 240, fog: [30000000, 120000000], maxDistance: 20000000, far: 60000000, plainR: 8000000, logDepth: true, earth: '#c4b894', plainDrop: 1,
    lighting: { sun: 2.6, hemi: 1.1 }, extras: 'revelation',
    navCell: 4, navAround: 2400,   // the route grid is built about the walker (2,400 amah each way) and rebuilt where he is carried — the whole city would be a million cells a side
    carryBeyond: 1800,             // a place on the map farther than this is not walked to but carried to (21:10)
    navSkip: ['aratz', 'gawayam', 'itz', 'guph'],
    lights: [],
    walls: ['chawamah', ...STONES.map((_, i) => `yasawad-${i + 1}`), ...['north', 'east', 'south', 'west'].flatMap((s) => [0, 1, 2].map((i) => `gate-${s}-${i}`))],
    notSolid: ['gawayam', 'aratz', 'guph'],
    proxies: [],
    stairHouses: {},
    plan: {
      pieces: ['chawamah', ...['north', 'east', 'south', 'west'].flatMap((s) => [0, 1, 2].map((i) => `gate-${s}-${i}`)), 'rachab', 'nahar'],
      extra: [],
      labels: [
        ...['north', 'east', 'south', 'west'].flatMap((s) => GATES[s].map(([name], i) => { const at = GATE_AT[i], o = HALF + 60000; return s === 'north' ? [at, -o, name] : s === 'south' ? [at, o, name] : s === 'east' ? [o, at, name] : [-o, at, name]; })),
        [0, 0, 'the throne'],
      ],
      radius: 1600,
      places: [
        ...['north', 'east', 'south', 'west'].flatMap((s) => GATES[s].map(([name, en], i) => { const g = gateWay(s, i), r = 60000; return { label: `shair (gate) of ${name} (${en}) · ${s} — of pearl`, short: name, bounds: { x0: g.x - r, x1: g.x + r, z0: g.z - r, z1: g.z + r }, at: [g.x + (s === 'east' ? 90 : s === 'west' ? -90 : 0), g.z + (s === 'south' ? 90 : s === 'north' ? -90 : 0)], face: [g.x, g.z] }; })),
        { label: 'the kasaa (throne) in the midst, the spring of the river', short: 'throne', bounds: { x0: -90000, x1: 90000, z0: -90000, z1: 90000 }, at: [230, 90], face: [0, 0] },
        { label: 'the ayalan (tree) of life by the river, inside the east gate', short: 'tree of life', bounds: { x0: HALF - 14000, x1: HALF - 300, z0: -40000, z1: 40000 }, at: [HALF - 600, 60], face: [HALF - 700, 0] },
      ],
    },
    inHouse: () => false,
    floorAt: (c) => (Math.abs(c.x) < HALF && Math.abs(c.z) < HALF ? CITY_Y : LEVEL - 1),
  },
  sheet: {
    plan: { x0: -HALF - 200000, x1: HALF + 200000, z0: -HALF - 200000, z1: HALF + 200000, scale: 0.000126, left: 24, top: 26, grid: Math.round(1000 * STADION) },
    section: { x0: -HALF - 200000, x1: HALF + 200000, y0: -60000, y1: SIDE + 200000, scale: 0.00006, left: 660, bottom: 64, tick: Math.round(2000 * STADION) },
    titles: ['PLAN · tzapawan (north) up · qadayam (east) right · one square = 1,000 stadia', 'SECTION · through the middle, gate to gate — as high as it is broad'],
    labels: [
      ...['north', 'east', 'south', 'west'].flatMap((s) => GATES[s].map(([name], i) => { const at = GATE_AT[i], o = HALF + 120000; return s === 'north' ? [name, at, -o] : s === 'south' ? [name, at, o] : s === 'east' ? [name, o + 60000, at] : [name, -o - 60000, at]; })),
      ['shairay (city) · 12,000 stadia', 0, -HALF / 2], ['kasaa (throne)', 0, -90000],
    ],
    compass: [HALF + 100000, -HALF - 100000],
    aria: 'The city of Revelation 21, drawn flat: a plan of the square with its twelve gates and a section through the middle, as high as it is broad',
  },
};
export default MODEL;
