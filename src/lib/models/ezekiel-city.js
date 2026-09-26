/**
 * ezekiel-city.js — the iyar (city) Yachazaqaal (Ezekiel) was shown and the holy tharawamah (portion) it stands in
 * (Ezekiel 45:1–8; 47:1–12; 48), as data for the generic model engine (ModelScene / ModelSheet / ModelPage).
 *
 * Units: one model unit = one amah (cubit), as the house model (ezekiel.js) is drawn. The text counts the portion in
 * thousands with no unit named in most places ("twenty-five thousand", 45:1; 48:8 …), and where the rendering says
 * "reeds" the model still draws the thousands as amah: drawn in reeds (six amah and more each, 40:5) the city alone would
 * be twenty-seven thousand amah a side and the house a speck in it. The card says so.
 *
 * Frame: the city's centre is the origin; north is −z, east +x (the house model's frame, so its pieces stand in this one
 * unmoved, only set down 17,500 north — 48:8–20: the priests' strip of 10,000 with the sanctuary in its midst, the
 * Levites' 10,000, then the city's 5,000, north to south).
 *
 * Two stories: PORTION (from above — the oblation laid out at scale, the house in it, the tribes' strips north and south,
 * the waters from the house running east) and CITY (the wall, the twelve gates in the text's order, the dwellings, the
 * open land and the fields — guided, or on foot).
 */
import { makeKit, V, SPEEDS, smooth, timelineFor, BASE_MATERIALS } from './kit.js';
import { WORDS as HOUSE_WORDS, MATERIALS as HOUSE_MATERIALS, PIECES as HOUSE_PIECES, gatehouse, GATE, OUT as HOUSE_OUT } from './ezekiel.js';

// ── Words ────────────────────────────────────────────────────────────────────
export const WORDS = {
  ...HOUSE_WORDS,
  iyar:       { translit: 'Iyar',        paleo: '𐤏𐤉𐤓',   en: 'city',                                sn: 'H5892' },
  tharawamah: { translit: 'Tharawamah',  paleo: '𐤕𐤓𐤅𐤌𐤄', en: 'offering / oblation — what is lifted up', sn: 'H8641' },
  maqadash:   { translit: 'Maqadash',    paleo: '𐤌𐤒𐤃𐤔',  en: 'sanctuary',                           sn: 'H4720' },
  lawayay:    { translit: 'Lawayay',     paleo: '𐤋𐤅𐤉',   en: 'Levites',                             sn: 'H3881' },
  nashayaa:   { translit: 'Nashayaa',    paleo: '𐤍𐤔𐤉𐤀',  en: 'prince / leader',                     sn: 'H5387' },
  magarash:   { translit: 'Magarash',    paleo: '𐤌𐤂𐤓𐤔',  en: 'open land about a city / suburbs',    sn: 'H4054' },
  mawashab:   { translit: 'Mawashab',    paleo: '𐤌𐤅𐤔𐤁',  en: 'dwelling',                            sn: 'H4186' },
  chal:       { translit: 'Chal',        paleo: '𐤇𐤋',    en: 'common — not set apart',              sn: 'H2455' },
  nachal:     { translit: 'Nachal',      paleo: '𐤍𐤇𐤋',   en: 'stream / river / wadi',               sn: 'H5158' },
  mayam:      { translit: 'Mayam',       paleo: '𐤌𐤉𐤌',   en: 'waters',                              sn: 'H4325' },
  alap:       { translit: 'Alap',        paleo: '𐤀𐤋𐤐',   en: 'thousand',                            sn: 'H505' },
  shabat:     { translit: 'Shabat',      paleo: '𐤔𐤁𐤈',   en: 'tribe / rod',                         sn: 'H7626' },
  rabayaiy:   { translit: 'Rabayaiy',    paleo: '𐤓𐤁𐤉𐤏𐤉', en: 'foursquare — a fourth on every side',  sn: 'H7243' },
  shamah:     { translit: 'Shamah',      paleo: '𐤔𐤌𐤄',   en: 'there — "Yahawah Shamah", the city\'s name', sn: 'H8033' },
};

// ── Materials ────────────────────────────────────────────────────────────────
export const MATERIALS = {
  ...BASE_MATERIALS, ...HOUSE_MATERIALS,
  ground:   { word: 'iyar',       color: '#b9a98a', hi: '#d6c8aa', lo: '#7d6f56', metal: 0, rough: 1 },     // the city's trodden ground
  suburb:   { word: 'magarash',   color: '#8fa757', hi: '#b3c87a', lo: '#5b6e35', metal: 0, rough: 1 },     // the open land about it, kept green
  field:    { word: 'sadah',      color: '#c8b45a', hi: '#e2d07e', lo: '#8a7a34', metal: 0, rough: 1 },     // the fields east and west, in grain
  priests:  { word: 'kahanayam',  color: '#d9c9a6', hi: '#f0e4c8', lo: '#9a8c6c', metal: 0, rough: 1 },     // the priests' strip, pale
  levites:  { word: 'lawayay',    color: '#c6b48f', hi: '#e0d0ac', lo: '#8a7a5a', metal: 0, rough: 1 },     // the Levites', a shade deeper
  cityland: { word: 'chal',       color: '#a8b87a', hi: '#c6d49a', lo: '#6e7c4a', metal: 0, rough: 1 },     // the city's common land
  prince:   { word: 'nashayaa',   color: '#9c8f7a', hi: '#bcae96', lo: '#665c4c', metal: 0, rough: 1 },     // the prince's land either side
  tribeN:   { word: 'shabat',     color: '#8aa868', hi: '#a9c489', lo: '#56703f', metal: 0, rough: 1 },     // the tribes' strips, two greens turn about
  tribeS:   { word: 'shabat',     color: '#5f7a48', hi: '#829c68', lo: '#3a4d2c', metal: 0, rough: 1 },
  citywall: { word: 'chawamah',   color: '#cfc3ad', hi: '#e8dfcc', lo: '#8c8270', metal: 0, rough: 0.9 },   // the city's wall, of stone
  house:    { word: 'mawashab',   color: '#d8cdb3', hi: '#ece4d0', lo: '#948b74', metal: 0, rough: 1 },     // the dwellings
};

// ── The frame, in cubits ─────────────────────────────────────────────────────
export const CITY = { half: 2250, wallT: 10, wallH: 24 };         // 48:16: 4,500 a side (wall's thickness and height assumed)
export const SUBURB = 250;                                        // 48:17: 250 all around
export const STRIP = { x: 12500, priests: [-22500, -12500], levites: [-12500, -2500], city: [-2500, 2500] };   // 48:8–20: 25,000 wide; 10,000 + 10,000 + 5,000 north to south
export const FIELDS = { x0: 2500, x1: 12500 };                    // 48:18: 10,000 eastward and 10,000 westward of the city's 5,000
export const PRINCE = { x0: 12500, x1: 25000, z0: -22500, z1: 2500 };   // 45:7; 48:21: from the portion to the east and west borders (the borders' distance assumed)
export const LAND_X = 25000;                                      // the land's breadth east to west (assumed — 47:18–20 give places, not measures)
export const TRIBE_H = 10000;                                     // each tribe's strip north to south (assumed equal; 48:1–7, 23–27 say "one portion" each)
export const HOUSE_AT = [0, 0.9, -17500];                           // the sanctuary in the midst of the priests' strip (48:10)
export const RIVER_Z = HOUSE_AT[2] + 10;                          // the waters come out on the south side of the altar (47:1)
export const LEVEL = 0;
export const CITY_Y = 1.8;   // the city's ground layer (LAYER.city): the wall, the gates, the houses and the people stand on it
export const TRIBES_N = ['Dan', 'Ashar', 'Napathalay', 'Manashah', 'Aparayam', 'Raawaban', 'Yahawadah'];       // 48:1–7, from the north border to the portion
export const TRIBES_S = ['Banayamayan', 'Shamaiwan', 'Yashashakar', 'Zabawalawan', 'Gad'];                      // 48:23–27, from the portion to the south border
export const GATES = {   // 48:30–34, in the text's order along each side (the order along a side is the model's)
  north: [['Raawaban', 'Reuben'], ['Yahawadah', 'Judah'], ['Laway', 'Levi']],
  east:  [['Yawasap', 'Joseph'], ['Banayamayan', 'Benjamin'], ['Dan', 'Dan']],
  south: [['Shamaiwan', 'Simeon'], ['Yashashakar', 'Issachar'], ['Zabawalawan', 'Zebulun']],
  west:  [['Gad', 'Gad'], ['Ashar', 'Asher'], ['Napathalay', 'Naphtali']],
};
const GATE_AT = [-1500, 0, 1500];   // the three of a side, a third apart (assumed)

// ── Parts ────────────────────────────────────────────────────────────────────
const K = makeKit(LEVEL);   // the city's own pieces are lifted to their layer below (CITY_Y)
const { box, cyl, ideal, tree, person } = K;
// the land's layers lie one on the other, each a hand above the last, so none fights another at a distance: the tribes' strips
// on the plain, the prince's over them, the portion's strips over those, the fields, the open land, the city's own ground
export const LAYER = { tribes: 0.3, prince: 0.6, strips: 0.9, fields: 1.2, suburb: 1.5, city: 1.8 };
const flat = (x0, x1, z0, z1, mat, top = 0.6, extra = {}) => box((x0 + x1) / 2, top - 1, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, { mat, role: 'ground', ...extra });

/** The city's wall, 4,500 square (48:16), in runs between the gates' gaps (each the house-gate's 25 wide) with a lintel over each gap. Thickness and height are the model's. */
function cityWall() {
  const { half: H, wallT: t, wallH: h } = CITY, out = [], gw = GATE.w, E = H + t;
  const runs = (a0, a1, mk) => {   // the runs of one side between −E…E, the gaps at GATE_AT
    let u = a0; const cuts = GATE_AT.map((g) => [g - gw / 2, g + gw / 2]);
    for (const [c0, c1] of cuts) { out.push(mk(u, c0, 0, h)); out.push(mk(c0, c1, h - 4, 4)); u = c1; }   // the wall, then the lintel over the gap
    out.push(mk(u, a1, 0, h));
  };
  runs(-E, E, (u0, u1, y, hh) => ideal(box((u0 + u1) / 2, y + CITY_Y, -H - t / 2, u1 - u0, hh, t, { mat: 'citywall', role: 'north' })));
  runs(-E, E, (u0, u1, y, hh) => ideal(box((u0 + u1) / 2, y + CITY_Y, H + t / 2, u1 - u0, hh, t, { mat: 'citywall', role: 'south' })));
  runs(-H, H, (u0, u1, y, hh) => ideal(box(H + t / 2, y + CITY_Y, (u0 + u1) / 2, t, hh, u1 - u0, { mat: 'citywall', role: 'east' })));
  runs(-H, H, (u0, u1, y, hh) => ideal(box(-H - t / 2, y + CITY_Y, (u0 + u1) / 2, t, hh, u1 - u0, { mat: 'citywall', role: 'west' })));
  return out;
}
/** A gate of the city, drawn after the house's own gates (40:6–16) — the text names the city's gates and does not measure them — set in the wall, its steps outside. */
function cityGate(side, i) {
  const { half: H, wallT: t } = CITY, at = GATE_AT[i], outer = H + t;   // the gate's outer end at the wall's outer face
  if (side === 'north') return gatehouse('z', -outer, 1, at, CITY_Y, false, 3, 0.5);
  if (side === 'south') return gatehouse('z', outer, -1, at, CITY_Y, false, 3, 0.5);
  if (side === 'east') return gatehouse('x', outer, -1, at, CITY_Y, false, 3, 0.5);
  return gatehouse('x', -outer, 1, at, CITY_Y, false, 3, 0.5);
}
/** The dwellings (48:15) — blocks of low houses in a grid of streets, the three streets of each side running gate to gate (the model's own). */
function dwellings() {
  const out = [], pitch = 150, block = 118, H = CITY.half - 30, n = Math.floor((2 * H) / pitch);
  let seed = 11; const rr = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    const x = -H + (i + 0.5) * pitch + 15, z = -H + (k + 0.5) * pitch + 15;
    if (Math.abs(x) < 40 && Math.abs(z) < 40) continue;   // the square in the midst
    const hh = 5 + rr() * 4;
    out.push(ideal(box(x, CITY_Y, z, block, hh, block, { mat: 'house', role: 'dwelling' })));
    if (rr() < 0.35) out.push(ideal(box(x + (rr() - 0.5) * 60, CITY_Y + hh, z + (rr() - 0.5) * 60, 30 + rr() * 30, 3 + rr() * 3, 30 + rr() * 30, { mat: 'house', role: 'dwelling' })));   // an upper room here and there
  }
  return out;
}
/** The people of the city: at the gates within, along the streets, in the square. */
function citizens() {
  const out = [], H = CITY.half;
  let seed = 5; const rr = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const at of GATE_AT) for (const [x, z] of [[at, -H + 70], [at, H - 70], [H - 70, at], [-H + 70, at]]) for (let i = 0; i < 4; i++) out.push(...person(x + (rr() - 0.5) * 24, z + (rr() - 0.5) * 24, rr() * Math.PI * 2, 'linen', { y: CITY_Y }));
  for (let i = 0; i < 24; i++) { const along = rr() < 0.5, s = (rr() - 0.5) * 2 * H * 0.9, off = (rr() - 0.5) * 22; out.push(...person(along ? s : off + GATE_AT[(i % 3)], along ? off + GATE_AT[(i % 3)] : s, rr() * Math.PI * 2, 'linen', { y: CITY_Y })); }
  for (let i = 0; i < 10; i++) out.push(...person((rr() - 0.5) * 60, (rr() - 0.5) * 60, rr() * Math.PI * 2, i < 2 ? 'royal' : 'linen', { y: CITY_Y }));
  return out;
}
/** The waters from under the threshold of the house, eastward (47:1–12): a thousand measured four times — to the ankles, the knees, the loins, a river to swim in — then on to the east country and the sea; trees on either bank. */
function river() {
  const x0 = HOUSE_AT[0] + HOUSE_OUT, z = RIVER_Z, out = [];
  const W = [[0, 1000, 5, 9], [1000, 2000, 9, 18], [2000, 3000, 18, 40], [3000, 4000, 40, 110], [4000, LAND_X - x0, 110, 160]];   // widths at each stretch's start and end (the depths the text gives are the model's widths)
  for (const [a, b, w0, w1] of W) {
    const n = Math.max(1, Math.round((b - a) / 250));
    for (let i = 0; i < n; i++) { const u0 = a + (i / n) * (b - a), u1 = a + ((i + 1) / n) * (b - a), w = w0 + ((w1 - w0) * (i + 0.5)) / n; out.push(box(x0 + (u0 + u1) / 2, LAYER.strips - 0.2, z, u1 - u0 + 2, 0.5, w, { mat: 'water', role: 'water', ideal: false })); }
  }
  // "very many trees on the one side and on the other" (47:7, 12): a tree every fifty cubits, either bank, along the measured four thousand and beyond
  for (let u = 60; u < 9000; u += 50) { const w = u < 1000 ? 7 : u < 2000 ? 14 : u < 3000 ? 30 : u < 4000 ? 76 : 130; for (const s of [-1, 1]) out.push(...tree(x0 + u + (s > 0 ? 17 : -13) % 30, z + s * (w / 2 + 12 + ((u / 50) % 3) * 6), 14 + ((u / 50) % 4) * 3)); }
  return out;
}

// ── The pieces ───────────────────────────────────────────────────────────────
// `raise.portion` / `raise.city`: the phase at which the piece appears in each story; a piece with `modes` stands only in them.
const CLOTH = 'a strip of the land, drawn flat';
export const PIECES = [
  // — the city (both stories, and on foot) —
  {
    id: 'chawamah', order: 0, group: 'city', material: 'citywall', raise: { portion: 'city', city: 'measures' },
    tag: 'chawamah (wall) · 4,500 square', title: 'The iyar (city), arabai (four) alap (thousand) and chamash (five) maah (hundred) on every paah (side)',
    words: ['iyar', 'chawamah', 'alap', 'amah', 'gabawal'], keys: ['iyar', 'city', 'measures', 'madah'],
    on: V('26:48:15-16', '26:48:30', '26:48:35'),
    refs: 'Ezekiel 48:15–16, 30, 35',
    measures: [['tzapawan (north) paah (side)', '4,500', '48:16, 30'], ['nagab (south)', '4,500', '48:16, 33'], ['qadayam (east)', '4,500', '48:16, 32'], ['yam (sea) — west', '4,500', '48:16, 34'], ['around', '18,000', '48:35'], ['the wall', 'not measured — 10 thick and 24 high here', '']],
    note: '"{{Ezekiel 48:16}}" — a square city, eighteen thousand round, and its name from that day: "{{Ezekiel 48:35 | the sham … there}}". The text gives the sides and the gates; the wall between the gates is the model\'s, since a city with gates has a wall.',
    elsewhere: { ref: 'Revelation 21:12–16; Zechariah 2:1–5; Nehemiah 3', note: 'The city of the Revelation with the same twelve gates, three a side, and Yachazaqaal\'s own words for the sanctuary\'s wall (42:20). Zakarayah\'s city is measured too — and told it will have no wall, "for I will be a wall of fire about it".' },
    assumed: 'The wall\'s thickness and height, and that there is one. The city is drawn at 4,500 amah (cubits) a side; if the thousands were reeds it would be six times larger every way.',
    idealized: 'The wall.',
    parts: cityWall(),
  },
  ...['north', 'east', 'south', 'west'].flatMap((side, si) => GATES[side].map(([name, en], i) => { const g = cityGate(side, i); return {
    id: `gate-${side}-${i}`, order: 1 + si * 3 + i, group: 'gates', material: 'stone', raise: { portion: 'city', city: `gates-${side}` },
    tag: `shair (gate) of ${name}`, title: `The shair (gate) of ${name} (${en}) — the ${side} side`,
    words: ['shair', 'shabat', 'iyar'], keys: [name.toLowerCase()],
    on: V(`26:48:${{ north: 31, east: 32, south: 33, west: 34 }[side]}`),
    refs: `Ezekiel 48:${{ north: 31, east: 32, south: 33, west: 34 }[side]}`,
    measures: [['side', `the ${side} — with the gates of ${GATES[side].filter((g) => g[0] !== name).map((g) => g[0]).join(' and ')}`, `48:${{ north: 31, east: 32, south: 33, west: 34 }[side]}`], ['its form', 'the house\'s gate of 40:6–16 — 50 long, 25 broad, lodges three a side', 'assumed']],
    note: `"{{Ezekiel 48:31 | And the shairay … Yashar-Al}}" — every gate bears a tribe\'s name, three to a side; this one ${name}\'s. Yawasap (Joseph) has a gate and Laway (Levi) has a gate, so Aparayam (Ephraim) and Manashah (Manasseh) are one here, as in the Revelation\'s city.`,
    elsewhere: { ref: 'Revelation 21:12–13; Ezekiel 40:6–16; Numbers 2', note: 'The twelve gates with the twelve names in the Revelation, three east, three north, three south, three west; the house\'s gates the form is taken from; the camp of the twelve about the tabernacle in the same four quarters.' },
    assumed: 'Its form (the house\'s gate) and its place along the side, a third of the way; the order of the three along a side.',
    parts: g, gates: g.gates,
  }; })),
  {
    id: 'mawashab', order: 13, group: 'city', material: 'house', raise: { portion: 'city', city: 'dwelling' },
    tag: 'mawashab (dwellings)', title: 'The iyar (city) for mawashab (dwelling): its houses and streets',
    words: ['mawashab', 'chal', 'iyar'], keys: ['mawashab', 'dwelling', 'dwellings'],
    on: V('26:48:15'),
    refs: 'Ezekiel 48:15',
    measures: [['the city\'s use', 'chal (common) — for dwelling and for open land', '48:15'], ['the houses', 'not in the text: blocks of low houses on streets running gate to gate', 'assumed']],
    note: '"{{Ezekiel 48:15 | The chamash … thawak}}" — of the whole holy square only this strip is chal (common), for people to live in; who lives here is answered in 48:19: workers out of all the tribes.',
    elsewhere: { ref: 'Ezekiel 48:18–19; Isaiah 60:11; Zechariah 8:4–5', note: 'The city\'s workers and their food; a city whose gates stand open; old men and women in its streets, and boys and girls playing.' },
    assumed: 'Every house and street: the text gives the city\'s measure and its gates, not its plan.',
    idealized: 'The houses.',
    parts: dwellings(),
  },
  {
    id: 'people', order: 14, group: 'city', material: 'linen', raise: { portion: 'city', city: 'workers' }, sheet: false,
    tag: 'those who ibad (serve) the city', title: 'Those who ibad (serve) in the iyar (city), out of all the shabatay (tribes) of Yashar-Al (Israel)',
    words: ['iyar', 'shabat'], keys: ['ibad', 'servant', 'serve', 'cultivate'],
    on: V('26:48:18-19'),
    refs: 'Ezekiel 48:18–19',
    measures: [['who', 'out of all the tribes', '48:19'], ['their bread', 'the increase of the fields east and west', '48:18']],
    note: '"{{Ezekiel 48:19}}" — the city belongs to no one tribe: the people in its gates and streets come from all twelve, and the fields either side feed them.',
    elsewhere: { ref: 'Ezekiel 45:6; Revelation 21:24–26', note: '"for the whole house of Yashar-Al"; the nations walking in the light of the city of the Revelation, its gates never shut.' },
    assumed: 'The people themselves — where they stand, how many.',
    parts: citizens(),
  },
  {
    id: 'magarash', order: 15, group: 'city', material: 'suburb', raise: { portion: 'city', city: 'suburbs' }, sheet: false,
    tag: 'magarash (open land) · 250', title: 'The magarash (open land) of the iyar (city): two hundred and fifty on every side',
    words: ['magarash', 'iyar'], keys: ['magarash', 'suburbs', 'suburb'],
    on: V('26:48:17'),
    refs: 'Ezekiel 48:17',
    measures: [['north · south · east · west', '250 each', '48:17'], ['the strip it fills', '5,000: 250 + 4,500 + 250', '48:15–17']],
    note: '"{{Ezekiel 48:17}}" — a belt of open ground round the wall, and with it the city fills its five thousand exactly.',
    elsewhere: { ref: 'Numbers 35:2–5; Ezekiel 45:2', note: 'The Levites\' cities with their open land a thousand round; the sanctuary\'s own fifty of open land.' },
    parts: [flat(-CITY.half - SUBURB, CITY.half + SUBURB, -CITY.half - SUBURB, -CITY.half - CITY.wallT, 'suburb', LAYER.suburb), flat(-CITY.half - SUBURB, CITY.half + SUBURB, CITY.half + CITY.wallT, CITY.half + SUBURB, 'suburb', LAYER.suburb),
      flat(-CITY.half - SUBURB, -CITY.half - CITY.wallT, -CITY.half - CITY.wallT, CITY.half + CITY.wallT, 'suburb', LAYER.suburb), flat(CITY.half + CITY.wallT, CITY.half + SUBURB, -CITY.half - CITY.wallT, CITY.half + CITY.wallT, 'suburb', LAYER.suburb),
      flat(-CITY.half, CITY.half, -CITY.half, CITY.half, 'ground', LAYER.city)],   // the city's own ground within the wall
  },
  {
    id: 'sadah', order: 16, group: 'portion', material: 'field', raise: { portion: 'fields', city: 'fields' }, sheet: false,
    tag: 'fields · 10,000 east and west', title: 'The remainder: ishar (ten) alap (thousand) eastward and ishar (ten) alap (thousand) westward, for lacham (bread)',
    words: ['iyar', 'alap'], keys: ['remainder', 'eastward', 'westward', 'thabawaah', 'increase', 'lacham'],
    on: V('26:48:18-19'),
    refs: 'Ezekiel 48:18–19',
    measures: [['east of the city', '10,000 × 5,000', '48:18'], ['west of the city', '10,000 × 5,000', '48:18'], ['their increase', 'bread for those who serve the city', '48:18']],
    note: '"{{Ezekiel 48:18}}" — the city\'s strip is twenty-five thousand long like the others; the five thousand square in its middle is the city and its open land, and the ten thousand either side grow its food.',
    elsewhere: { ref: 'Ezekiel 45:6; Leviticus 25:34', note: 'The city\'s possession beside the holy oblation; the fields of the Levites\' cities that may not be sold.' },
    parts: [flat(FIELDS.x0, FIELDS.x1, STRIP.city[0], STRIP.city[1], 'field', LAYER.fields), flat(-FIELDS.x1, -FIELDS.x0, STRIP.city[0], STRIP.city[1], 'field', LAYER.fields)],
  },
  // — the holy portion (the Portion story) —
  {
    id: 'kahanayam', order: 20, group: 'portion', material: 'priests', raise: { portion: 'priests' }, modes: ['portion'], sheet: false,
    tag: 'kahanayam (priests) · 25,000 × 10,000', title: 'The qadash (holy) tharawamah (portion) for the kahanayam (priests): the maqadash (sanctuary) in its thawak (midst)',
    words: ['tharawamah', 'kahanayam', 'maqadash', 'tzadawaq', 'alap'], keys: ['kahanayam', 'priests', 'tzadawaq', 'zadok', 'maqadash', 'sanctuary'],
    on: V('26:45:1-4', '26:48:9-12'),
    refs: 'Ezekiel 45:1–4; 48:9–12',
    measures: [['arak (length)', '25,000, east to west', '45:1; 48:10'], ['rachab (breadth)', '10,000', '45:3; 48:10'], ['the sanctuary', '500 square, with 50 of open land, in its midst', '45:2; 48:10'], ['whose', 'the priests of the sons of Tzadawaq (Zadok), who kept the charge', '48:11']],
    note: '"{{Ezekiel 48:10 | For these … thawak}}" — the northern strip of the oblation, most holy, with the house standing in the middle of it; the house drawn here is the house model itself, set down in its place.',
    elsewhere: { ref: 'Ezekiel 40–43; 44:15–16; Numbers 35:1–8', note: 'The house that stands in this strip (its own model); the sons of Zadok who come near; the Levites\' cities of the first settlement.' },
    assumed: 'The strips are drawn 25,000 by 10,000 amah (cubits), not reeds — see the wall\'s card.',
    parts: [flat(-STRIP.x, STRIP.x, STRIP.priests[0], STRIP.priests[1], 'priests', LAYER.strips)],
  },
  {
    id: 'lawayay', order: 21, group: 'portion', material: 'levites', raise: { portion: 'levites' }, modes: ['portion'], sheet: false,
    tag: 'Lawayay (Levites) · 25,000 × 10,000', title: 'The Lawayay (Levites), the sharath (ministers) of the bayath (house): isharayam (twenty) - chamash (five) alap (thousand) by ishar (ten) alap (thousand)',
    words: ['lawayay', 'bayath', 'alap'], keys: ['lawayay', 'levites', 'levite'],
    on: V('26:45:5', '26:48:13-14'),
    refs: 'Ezekiel 45:5; 48:13–14',
    measures: [['arak (length)', '25,000', '48:13'], ['rachab (breadth)', '10,000', '48:13'], ['may it be sold?', 'no — nor exchanged; it is holy to Yahawah', '48:14']],
    note: '"{{Ezekiel 48:13 | Answerable … rachab}}" — the middle strip, between the priests\' and the city\'s, for the Levites who serve the house.',
    elsewhere: { ref: 'Ezekiel 44:10–14; Numbers 3:5–10', note: 'The Levites who went astray and keep the charge of the house but do not come near; their first charge about the tabernacle.' },
    parts: [flat(-STRIP.x, STRIP.x, STRIP.levites[0], STRIP.levites[1], 'levites', LAYER.strips)],
  },
  {
    id: 'achazah', order: 22, group: 'portion', material: 'cityland', raise: { portion: 'cityland' }, modes: ['portion'], sheet: false,
    tag: 'the iyar (city)\'s strip · 25,000 × 5,000', title: 'The achazah (possession) of the iyar (city): chamash (five) alap (thousand) broad, isharayam (twenty) - chamash (five) alap (thousand) long',
    words: ['iyar', 'chal', 'alap'], keys: ['achazah', 'possession', 'common'],
    on: V('26:45:6', '26:48:15'),
    refs: 'Ezekiel 45:6; 48:15',
    measures: [['rachab (breadth)', '5,000', '45:6; 48:15'], ['arak (length)', '25,000, side by side with the holy portion', '45:6'], ['for whom', 'the whole house of Yashar-Al', '45:6']],
    note: '"{{Ezekiel 45:6}}" — the southern strip, common ground: the city in its middle, its fields either side.',
    elsewhere: { ref: 'Ezekiel 48:16–19', note: 'The city\'s own measures, its open land, its fields and its workers.' },
    parts: [flat(-STRIP.x, STRIP.x, STRIP.city[0], STRIP.city[1], 'cityland', LAYER.strips)],
  },
  {
    id: 'nashayaa', order: 23, group: 'portion', material: 'prince', raise: { portion: 'prince' }, modes: ['portion'], sheet: false,
    tag: 'nashayaa (prince) · east and west', title: 'The nashayaa (prince)\'s achazah (possession): on the one side and on the other of the qadash (holy) tharawamah (portion)',
    words: ['nashayaa', 'tharawamah', 'gabawal'], keys: ['nashayaa', 'prince', 'princes'],
    on: V('26:45:7-8', '26:48:21-22'),
    refs: 'Ezekiel 45:7–8; 48:21–22',
    measures: [['where', 'west of the portion to the sea, east of it to the Jordan', '45:7'], ['its length', 'answerable to one of the tribes\' portions — the whole 25,000 north to south', '45:7; 48:21'], ['the borders', 'not measured: drawn 12,500 each side', 'assumed']],
    note: '"{{Ezekiel 45:8}}" — land of his own either side of the holy square, so that the princes need no longer take the people\'s.',
    elsewhere: { ref: 'Ezekiel 46:16–18; 34:23–24', note: 'The prince may give of his own inheritance to his sons and not thrust the people from theirs; my servant David a prince among them.' },
    assumed: 'How far the land runs east and west of the portion.',
    parts: [flat(PRINCE.x0, PRINCE.x1, PRINCE.z0, PRINCE.z1, 'prince', LAYER.prince), flat(-PRINCE.x1, -PRINCE.x0, PRINCE.z0, PRINCE.z1, 'prince', LAYER.prince)],
  },
  ...TRIBES_N.map((name, i) => ({
    id: `tribe-n-${i}`, order: 30 + i, group: 'tribes', material: 'tribeN', raise: { portion: 'north' }, modes: ['portion'], sheet: false,
    tag: `${name} · north`, title: `${name}: one portion, from the qadayam (east) paah (side) to the yam (sea) paah (side)`,
    words: ['shabat', 'gabawal'], keys: [name.toLowerCase()],
    on: V(`26:48:${[1, 2, 3, 4, 5, 6, 7][i]}`), refs: `Ezekiel 48:${[1, 2, 3, 4, 5, 6, 7][i]}`,
    measures: [['place', `${i === 0 ? 'at the north border, ' : ''}strip ${i + 1} of seven north of the holy portion${i === 6 ? ', its border the portion\'s' : ''}`, `48:${i + 1}`], ['breadth north to south', 'not measured — drawn 10,000 each', 'assumed']],
    note: `"{{Ezekiel 48:${i + 1}}}" — ${name}\'s strip, the whole breadth of the land from east to west, ${i === 6 ? 'the last before the oblation, whose north border is Yahawadah\'s' : `${['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][i]} from the north`}.`,
    elsewhere: { ref: 'Ezekiel 47:13–21; Joshua 13–19', note: 'The land\'s borders these strips are cut across; the first division under Yahawashai (Joshua), tribe by tribe.' },
    assumed: 'The strips\' equal breadth; the land\'s breadth east to west.',
    parts: [flat(-LAND_X, LAND_X, STRIP.priests[0] - (7 - i) * TRIBE_H, STRIP.priests[0] - (6 - i) * TRIBE_H, i % 2 ? 'tribeS' : 'tribeN', LAYER.tribes)],
  })),
  ...TRIBES_S.map((name, i) => ({
    id: `tribe-s-${i}`, order: 40 + i, group: 'tribes', material: 'tribeS', raise: { portion: 'south' }, modes: ['portion'], sheet: false,
    tag: `${name} · south`, title: `${name}: one portion, from the qadayam (east) paah (side) to the yam (sea) paah (side)`,
    words: ['shabat', 'gabawal'], keys: [name.toLowerCase()],
    on: V(`26:48:${[23, 24, 25, 26, 27][i]}`), refs: `Ezekiel 48:${[23, 24, 25, 26, 27][i]}`,
    measures: [['place', `strip ${i + 1} of five south of the holy portion${i === 4 ? ', at the south border' : ''}`, `48:${23 + i}`], ['breadth north to south', 'not measured — drawn 10,000 each', 'assumed']],
    note: `"{{Ezekiel 48:${23 + i}}}" — ${name}\'s strip, ${i === 0 ? 'the first south of the city\'s strip' : `${['second', 'third', 'fourth', 'fifth'][i - 1]} from the portion`}${i === 4 ? '; beyond it the south border, from Thamar to the waters of Meriboth Qadash and the great sea (48:28)' : ''}.`,
    elsewhere: { ref: 'Ezekiel 47:19; 48:28–29; Joshua 15; 18:11–28', note: 'The south border; Yahawadah\'s and Banayamayan\'s first lots, that lay here too.' },
    assumed: 'The strips\' equal breadth; the land\'s breadth east to west.',
    parts: [flat(-LAND_X, LAND_X, STRIP.city[1] + i * TRIBE_H, STRIP.city[1] + (i + 1) * TRIBE_H, i % 2 ? 'tribeN' : 'tribeS', LAYER.tribes)],
  })),
  {
    id: 'nachal', order: 50, group: 'portion', material: 'water', raise: { portion: 'river' }, modes: ['portion'], sheet: false,
    tag: 'nachal (river) from the house', title: 'The mayam (waters) from under the mapathan (threshold) of the bayath (house), eastward: a nachal (river) that could not be passed through',
    words: ['mayam', 'nachal', 'bayath', 'itz', 'alap'], keys: ['mayam', 'waters', 'nachal', 'river', 'apasayam', 'ankles', 'barakayam', 'knees', 'shachaw', 'swim', 'dagah', 'fish'],
    on: V('26:47:1-12'),
    refs: 'Ezekiel 47:1–12',
    measures: [['the first alap (thousand)', 'waters to the apasayam (ankles)', '47:3'], ['the second', 'to the barakayam (knees)', '47:4'], ['the third', 'to the waist', '47:4'], ['the fourth', 'a river to shachaw (swim) in, not to be passed', '47:5'], ['its way', 'east, down into the irabah (arabah), into the yam (sea), and the waters healed', '47:8'], ['its banks', 'very many trees, fruit every month, leaves for healing', '47:7, 12']],
    note: '"{{Ezekiel 47:5}}" — four thousand amah measured from the house and the waters a river; the text gives depths, and the model shows the growing depth as a growing breadth, with the trees of verse 12 on both banks. From the house it runs east across the priests\' strip and the prince\'s land toward the sea.',
    elsewhere: { ref: 'Revelation 22:1–2; Zechariah 14:8; Joel 3:18; Genesis 2:10', note: 'The river of the water of life from the throne, with the tree of life on either side; living waters from Jerusalem, half to the east sea; a fountain from the house of Yahawah; the river out of Eden.' },
    assumed: 'The breadths (the text gives depths), the course beyond the four thousand, the trees\' spacing.',
    idealized: 'The trees.',
    parts: river(),
  },
  // — the house itself, the house model's pieces set down in the priests' strip (48:10) —
  ...HOUSE_PIECES.map((p) => ({
    ...p, id: `house-${p.id}`, group: 'house', modes: ['portion'], raise: { portion: 'priests' }, sheet: false, offset: HOUSE_AT,
    tag: `bayath (house) · ${p.tag}`, title: `In the bayath (house): ${p.title}`,
    elsewhere: { ref: 'Ezekiel 40–43', note: `Part of the house model, standing here in its place in the portion — open the house itself to walk it: ${p.elsewhere?.note || ''}` },
  })),
];

export function pieceById(id) { return PIECES.find((p) => p.id === id) || null; }
export const GROUPS = { city: 'The iyar (city)', gates: 'The twelve shairayam (gates)', portion: 'The qadash (holy) tharawamah (portion)', tribes: 'The shabatay (tribes)', house: 'The bayath (house) in its midst' };

// ── The passages the model is drawn from ─────────────────────────────────────
export const PASSAGES = [
  { bookId: 26, book: 'Ezekiel', chapter: 45, from: 1, to: 8, label: 'Ezekiel 45:1–8' },
  { bookId: 26, book: 'Ezekiel', chapter: 47, from: 1, to: 23, label: 'Ezekiel 47' },
  { bookId: 26, book: 'Ezekiel', chapter: 48, from: 1, to: 35, label: 'Ezekiel 48' },
];
export const ALL_REFS = 'Ezekiel 45:1–8; 47; 48';
export const passagesFor = () => PASSAGES;
export const refsFor = () => ALL_REFS;

const KEY_INDEX = [];
for (const p of PIECES) for (const k of p.keys || []) KEY_INDEX.push([k.toLowerCase(), p.id]);
const RULES = [
  { chapter: 48, verses: [15, 16, 30, 35], words: ['iyar', 'city', 'madah', 'measures', 'paah', 'side'], piece: 'chawamah' },
  { chapter: 48, verses: [17], words: ['magarash', 'suburbs', 'iyar'], piece: 'magarash' },
  { chapter: 48, verses: [18, 19], words: ['ibad', 'servant', 'cultivate', 'iyar'], piece: 'people' },
  { chapter: 48, verses: [8, 9, 10, 11, 12], words: ['tharawamah', 'offering', 'maqadash', 'sanctuary', 'kahanayam', 'priests'], piece: 'kahanayam' },
  { chapter: 45, verses: [1, 2, 3, 4], words: ['tharawamah', 'offering', 'maqadash', 'sanctuary', 'kahanayam', 'priests', 'qadash'], piece: 'kahanayam' },
  { chapter: 45, verses: [6], words: ['iyar', 'city', 'achazah', 'possession'], piece: 'achazah' },
  { chapter: 47, verses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], words: ['mayam', 'waters', 'nachal', 'river', 'itz', 'trees', 'tree'], piece: 'nachal' },
];
export function pieceForWord(word, book, chapter, verse) {
  if (book !== 26) return null;
  const w = word.toLowerCase();
  for (const r of RULES) if (r.chapter === chapter && r.verses.includes(verse) && r.words.some((k) => w === k || w.startsWith(k))) return r.piece;
  for (const [k, id] of KEY_INDEX) if (w === k) return id;
  for (const [k, id] of KEY_INDEX) if (k.length > 4 && w.startsWith(k)) return id;
  return null;
}

// ── Timelines ────────────────────────────────────────────────────────────────
// PORTION — from above, in the order of 45:1–8 and 48:8–22, then the tribes, the river, the name.
export const PORTION_PHASES = [
  { from: 0,  key: 'oblation', caption: '{{Ezekiel 45:1 | Moreover … all around}}.', ref: 'Ezekiel 45:1', title: '{{Ezekiel 45:1 | a qadash … aratz}}' },
  { from: 9,  key: 'priests',  caption: '{{Ezekiel 48:10 | For these … thawak}}. {{Ezekiel 45:4 | It is … Yahawah}}.', ref: 'Ezekiel 48:10; 45:4', title: '{{Ezekiel 48:10 | the maqadash … thawak}}' },
  { from: 20, key: 'house',    caption: '{{Ezekiel 45:2}}', ref: 'Ezekiel 45:2', title: '{{Ezekiel 45:2 | chamash … around}}' },
  { from: 28, key: 'levites',  caption: '{{Ezekiel 45:5}}', ref: 'Ezekiel 45:5', title: '{{Ezekiel 45:5 | shall be … bayath}}' },
  { from: 36, key: 'cityland', caption: '{{Ezekiel 45:6}}', ref: 'Ezekiel 45:6', title: '{{Ezekiel 45:6 | the achazah … iyar}}' },
  { from: 44, key: 'city',     caption: '{{Ezekiel 48:16}} {{Ezekiel 48:17 | The iyar … magarash}}.', ref: 'Ezekiel 48:16–17', title: '{{Ezekiel 48:15 | the iyar … thawak}}' },
  { from: 56, key: 'fields',   caption: '{{Ezekiel 48:18}} {{Ezekiel 48:20}}', ref: 'Ezekiel 48:18, 20', title: '{{Ezekiel 48:20 | rabayaiy … iyar}}' },
  { from: 68, key: 'prince',   caption: '{{Ezekiel 45:7 | Whatever … iyar}}. {{Ezekiel 45:8}}', ref: 'Ezekiel 45:7–8', title: '{{Ezekiel 45:7 | Whatever … nashayaa}}' },
  { from: 79, key: 'north',    caption: '{{Ezekiel 48:1 | Now these … Dan}}. {{Ezekiel 48:7}} {{Ezekiel 48:8}}', ref: 'Ezekiel 48:1, 7–8', title: '{{Ezekiel 48:1 | Now these … shabatayam}}' },
  { from: 90, key: 'south',    caption: '{{Ezekiel 48:23}} {{Ezekiel 48:27}} {{Ezekiel 48:29}}', ref: 'Ezekiel 48:23, 27, 29', title: '{{Ezekiel 48:29 | the aratz … nachalah}}' },
  { from: 100, key: 'river',   caption: '{{Ezekiel 47:1 | behold, mayam … eastward}}. {{Ezekiel 47:5}} {{Ezekiel 47:12}}', ref: 'Ezekiel 47:1, 5, 12', title: '{{Ezekiel 47:9 | everything … bawaa}}' },
  { from: 114, key: 'name',    caption: '{{Ezekiel 48:35}}', ref: 'Ezekiel 48:35', title: '{{Ezekiel 48:35 | the sham … there}}' },
];
export const PORTION_DURATION = 122;
export const PORTION_CAMERA = [
  [0,   [26000, 30000, 30000],  [0, 0, -10000]],                 // the land from the south-east, high
  [9,   [0, 22000, -2000],      [0, 0, -14000]],                 // the priests' strip from above
  [20,  [1200, 900, -16200],    [0, 20, -17500]],                // down to the house in its midst
  [28,  [0, 20000, 6000],       [0, 0, -8000]],                  // the Levites' strip
  [36,  [0, 16000, 9000],       [0, 0, 0]],                      // the city's strip
  [44,  [3200, 3400, 4200],     [0, 0, 0]],                      // the city itself
  [56,  [0, 20000, 8000],       [0, 0, 0]],                      // its fields east and west, the foursquare whole
  [68,  [0, 36000, 12000],      [0, 0, -10000]],                 // the prince's land either side
  [79,  [0, 80000, -20000],     [0, 0, -50000]],                 // the tribes north
  [90,  [0, 80000, 40000],      [0, 0, 20000]],                  // the tribes south
  [100, [3500, 1600, -15200],   [2500, 0, -17400]],              // the river from the house, eastward
  [110, [12000, 6000, -12000],  [8000, 0, -17400]],              // … on toward the sea
  [114, [3000, 3200, 4000],     [0, 0, 0]],                      // the city, and its name
  [122, [6000, 5000, 7000],     [0, 0, 0]],
];
// CITY — the wall and the twelve gates in the text's order, then who lives here.
export const CITY_PHASES = [
  { from: 0,  key: 'measures',    caption: '{{Ezekiel 48:15 | The chamash … thawak}}. {{Ezekiel 48:16}}', ref: 'Ezekiel 48:15–16', title: '{{Ezekiel 48:16 | These … madah}}' },
  { from: 14, key: 'suburbs',     caption: '{{Ezekiel 48:17}}', ref: 'Ezekiel 48:17', title: '{{Ezekiel 48:17 | The iyar … magarash}}' },
  { from: 24, key: 'gates-north', caption: '{{Ezekiel 48:30}} {{Ezekiel 48:31}}', ref: 'Ezekiel 48:30–31', title: '{{Ezekiel 48:31 | shalawash … northward}}' },
  { from: 38, key: 'gates-east',  caption: '{{Ezekiel 48:32}}', ref: 'Ezekiel 48:32', title: '{{Ezekiel 48:32 | At the qadayam … paah}}' },
  { from: 48, key: 'gates-south', caption: '{{Ezekiel 48:33}}', ref: 'Ezekiel 48:33', title: '{{Ezekiel 48:33 | At the nagab … paah}}' },
  { from: 58, key: 'gates-west',  caption: '{{Ezekiel 48:34}}', ref: 'Ezekiel 48:34', title: '{{Ezekiel 48:34 | At the yam … paah}}' },
  { from: 68, key: 'dwelling',    caption: '{{Ezekiel 48:15 | shall be … magarash}}; {{Ezekiel 45:6 | it shall … Yashar-Al}}.', ref: 'Ezekiel 48:15; 45:6', title: '{{Ezekiel 48:15 | for mawashab … magarash}}' },
  { from: 78, key: 'fields',      caption: '{{Ezekiel 48:18}}', ref: 'Ezekiel 48:18', title: '{{Ezekiel 48:18 | its thabawaah … iyar}}' },
  { from: 88, key: 'workers',     caption: '{{Ezekiel 48:19}}', ref: 'Ezekiel 48:19', title: '{{Ezekiel 48:19}}' },
  { from: 96, key: 'name',        caption: '{{Ezekiel 48:35}}', ref: 'Ezekiel 48:35', title: '{{Ezekiel 48:35 | the sham … there}}' },
];
export const CITY_DURATION = 106;
const G = CITY.half;
export const CITY_CAMERA = [
  [0,   [4200, 3000, 4600],   [0, 0, 0]],                        // the square from the south-east
  [14,  [3600, 900, 3600],    [0, 0, 0]],                        // the belt about it
  [24,  [300, 260, -G - 700], [0, 20, -G]],                      // the north wall and its three gates
  [30,  [40, 40, -G - 160],   [0, 12, -G + 40]],                 // through the middle north gate
  [38,  [G + 700, 260, 300],  [G, 20, 0]],                       // the east side
  [48,  [-300, 260, G + 700], [0, 20, G]],                       // the south side
  [58,  [-G - 700, 260, -300], [-G, 20, 0]],                     // the west side
  [68,  [60, 30, 700],        [0, 8, 0]],                        // down a street toward the square
  [78,  [0, 5200, 6000],      [0, 0, 0]],                        // the fields either side
  [88,  [30, 12, 60],         [0, 5, 0]],                        // among the people in the square
  [96,  [1800, 1200, 2200],   [0, 0, 0]],
  [106, [4200, 3000, 4600],   [0, 0, 0]],
];

// ROAM — no story: the city stands, its gates open, and the walker goes where they will.
export const ROAM_EYE = 3.4;
export const ROAM_START = { pos: [CITY.half + CITY.wallT + 60, LAYER.suburb + ROAM_EYE, 0], look: [0, CITY_Y + ROAM_EYE, 0] };   // outside the middle east gate — Banayamayan's — facing the city
export const ROAM_PHASES = [{ from: 0, key: 'roam', caption: 'Walk where you will — in at any of the twelve shairayam (gates), each with a shabat (tribe)\'s name, down its street to the square in the midst, or out through the magarash (open land) to the fields. Tap a part for its details. The bayath (house) stands seventeen thousand five hundred amah north of here, in the kahanayam (priests)\' strip — the map takes you toward it, or open the house model to walk it.', ref: '' }];
export const ROAM_ENTER = {};

export const MODES = {
  portion: { label: 'Portion', phases: PORTION_PHASES, duration: PORTION_DURATION, camera: PORTION_CAMERA, xray: [] },
  city: { label: 'City', phases: CITY_PHASES, duration: CITY_DURATION, camera: CITY_CAMERA, xray: [] },
  roam: { label: 'Roam', phases: ROAM_PHASES, duration: 1, camera: [[0, ROAM_START.pos, ROAM_START.look]], xray: [], free: true },
};
const TL = timelineFor(MODES);
export const { phaseAt, xrayAt, cameraAt } = TL;
const AT = { portion: Object.fromEntries(PORTION_PHASES.map((p) => [p.key, p.from])), city: Object.fromEntries(CITY_PHASES.map((p) => [p.key, p.from])) };
/** Each piece appears at its phase of its story; on foot everything stands. A piece with `modes` stands only in them. */
export function progressAt(mode, piece, t) {
  if (piece.modes && !piece.modes.includes(mode)) return 0;
  if (mode === 'roam') return 1;
  const key = piece.raise?.[mode]; if (!key) return 1;
  const at = AT[mode]?.[key]; if (at == null) return 1;
  return smooth((t - at + 0.6) / 2.4);
}
export function openAt() { return 1; }   // the city's gates stand open (48:35's city is named for the presence, not shut against anyone)
const MARK_LABELS = {
  portion: { oblation: 'tharawamah', priests: 'kahanayam', house: 'bayath', levites: 'Lawayay', cityland: 'chal', city: 'iyar', fields: 'lacham', prince: 'nashayaa', north: 'north', south: 'south', river: 'nachal', name: 'shamah' },
  city: { measures: '4,500', suburbs: 'magarash', 'gates-north': 'north', 'gates-east': 'east', 'gates-south': 'south', 'gates-west': 'west', dwelling: 'mawashab', fields: 'lacham', workers: 'ibad', name: 'shamah' },
};
export const marksFor = (mode) => TL.marksFor(mode, MARK_LABELS);
export const CHIP_ORDER = ['chawamah', 'gate-north-0', 'gate-north-1', 'gate-north-2', 'gate-east-0', 'gate-east-1', 'gate-east-2', 'gate-south-0', 'gate-south-1', 'gate-south-2', 'gate-west-0', 'gate-west-1', 'gate-west-2', 'mawashab', 'people', 'magarash', 'sadah', 'kahanayam', 'lawayay', 'achazah', 'nashayaa', 'nachal'];
/** Where the eye goes when a piece is chosen (the focus target and a fitting distance), in cubits. */
export function focusFor(id) {
  const G = CITY.half, o = G + CITY.wallT / 2;
  const F = {
    chawamah: [[0, 10, 0], 6200], mawashab: [[0, 6, 0], 3000], people: [[0, 4, 0], 90], magarash: [[0, 0, 0], 6800], sadah: [[0, 0, 0], 26000],
    kahanayam: [[0, 0, -17500], 30000], lawayay: [[0, 0, -7500], 30000], achazah: [[0, 0, 0], 30000], nashayaa: [[0, 0, -10000], 60000], nachal: [[4000, 0, RIVER_Z], 5000],
  };
  const m = /^gate-(\w+)-(\d)$/.exec(id);
  if (m) { const at = GATE_AT[+m[2]], s = m[1]; const [x, z] = s === 'north' ? [at, -o] : s === 'south' ? [at, o] : s === 'east' ? [o, at] : [-o, at]; return { target: [x, 12, z], distance: 120 }; }
  if (id.startsWith('tribe-n-')) { const i = +id.slice(8); return { target: [0, 0, STRIP.priests[0] - (6.5 - i) * TRIBE_H], distance: 60000 }; }
  if (id.startsWith('tribe-s-')) { const i = +id.slice(8); return { target: [0, 0, STRIP.city[1] + (i + 0.5) * TRIBE_H], distance: 60000 }; }
  if (id.startsWith('house-')) return { target: [HOUSE_AT[0], 10, HOUSE_AT[2]], distance: 900 };
  const f = F[id]; return f ? { target: f[0], distance: f[1] } : null;
}

// ── The MODEL: what the generic page, scene and sheet read ───────────────────
export const STORIES = [
  { key: 'portion', label: 'Portion', modes: ['portion'], icon: 'measure', go: 'Lay out the portion →',
    kicker: 'Ezekiel 45:1–8 · 48 · the land divided',
    blurb: 'From above: the qadash (holy) tharawamah (portion) lifted up out of the land, twenty-five alap (thousand) square — the kahanayam (priests)\' strip with the bayath (house) in its thawak (midst), the Lawayay (Levites)\' strip, the iyar (city)\'s strip with the city in the middle and its fields either side; the nashayaa (prince)\'s land east and west; the shabatay (tribes)\' portions stacked north and south; the mayam (waters) from under the threshold of the house, measured four times, running east to heal the sea.' },
  { key: 'city', label: 'City', modes: ['city', 'roam'], icon: 'city', go: 'Enter the city →', roamLabel: 'Walk its streets on your own feet',
    kicker: 'Ezekiel 48:15–20, 30–35 · "Yahawah is there"',
    blurb: 'The iyar (city) four thousand five hundred on every paah (side), its magarash (open land) two hundred and fifty round about, and its twelve shairayam (gates) named for the shabatay (tribes) — three to the north, three east, three south, three west — in the text\'s order; the mawashab (dwellings) and those out of all the tribes who serve the city; and its name from that day. Guided, or on foot through any gate.' },
];

export const MODEL = {
  id: 'ezekiel-city', base: '/models/ezekiel-city', defaultStory: 'portion',
  title: 'The Iyar (City) Yachazaqaal (Ezekiel) Saw and the Holy Portion', paleo: '𐤉𐤄𐤅𐤄 𐤔𐤌𐤄',
  description: 'The iyar (city) of Ezekiel 48 and the qadash (holy) tharawamah (portion) it stands in (Ezekiel 45:1–8; 48) as an interactive 3D model measured in amah (cubits) from the text — the portion twenty-five alap (thousand) square with the kahanayam (priests)\' strip and the bayath (house) in its midst, the Lawayay (Levites)\' strip, the city\'s strip; the city four thousand five hundred a side with its magarash (open land) and its twelve shairayam (gates) named for the shabatay (tribes); the nashayaa (prince)\'s land, the tribes\' portions north and south, and the nachal (river) from the house (Ezekiel 47). Lay it out from above, or walk the city\'s streets and gates on your own feet.',
  indexDescription: 'The city of Ezekiel 48 and the holy portion of Ezekiel 45 and 48 as an interactive 3D model measured in cubits from the text, with the house model standing in its place — lay out the portion from above, or walk the city and its twelve gates on your own feet.',
  indexIntro: 'One model, measured in amah (cubits) from the text, two ways in: the whole qadash (holy) tharawamah (portion) laid out from above with the bayath (house) — the house model itself — standing in its midst and the tribes\' strips about it; and the iyar (city) at your own height, its twelve shairayam (gates) named for the tribes, its streets and its people. Every part can be tapped for its measures and verses.',
  ground: LEVEL,
  WORDS, MATERIALS, PIECES, GROUPS, MODES, SPEEDS, CHIP_ORDER, PASSAGES, STORIES,
  pieceById, pieceForWord, passagesFor, refsFor, phaseAt, progressAt, xrayAt, openAt, cameraAt, marksFor, focusFor,
  stories: STORIES,
  related: [{ label: 'Open the house model →', to: '/models/ezekiel', note: 'The bayath (house) standing in the portion\'s midst is its own model, walked gate by gate the way the man with the qanah (reed) led him.' }],
  card: {
    title: 'The iyar (city) and the qadash (holy) tharawamah (portion) Yachazaqaal (Ezekiel) raah (saw)',
    subtitle: (mode) => (mode === 'portion' ? 'Ezekiel 45:1–8; 47; 48' : 'Ezekiel 48:15–20, 30–35'),
    intro: (mode) => (mode === 'roam'
      ? 'No story here: the city stands, and you walk it — in at any of the twelve gates, each with a tribe\'s name over it, down the streets to the square in the midst, out to the open land and the fields; tap a part for its words and measures. The house stands far to the north in the priests\' strip; open the house model to walk it.'
      : mode === 'portion'
        ? 'Play, and the land is divided from above as the text divides it: the holy oblation lifted up, twenty-five thousand square; the priests\' strip with the house in its midst; the Levites\'; the city\'s with the city and its fields; the prince\'s land either side; the tribes\' strips north and south; and the waters from the house, measured a thousand four times, running east.'
        : 'Play, and the city is measured as the text measures it: four thousand five hundred a side, two hundred and fifty of open land round about; then the twelve gates in the text\'s order, three to a side, each named for a tribe; the dwellings and the fields; those who serve the city out of all the tribes; and its name.'),
    extras: () => [{ heading: 'The unit, and what the model adds', refs: 'Ezekiel 45:1–6; 48:8–35; 40:5', text: 'The text counts the portion and the city in thousands and hundreds, and where the rendering says "reeds" the model still draws them as amah (cubits), one unit each, as the house is drawn: in reeds (six amah and a handbreadth each, 40:5) the city alone would be twenty-seven thousand amah a side and the house, at five hundred, a speck in its strip. The strips\' order north to south (priests, Levites, city) is 48:8–22\'s; the tribes\' strips are drawn equal, the land\'s breadth east to west and the prince\'s reach to the borders are the model\'s; the city\'s wall, houses and streets, and the gates\' form (the house\'s own gates) are the model\'s too — the text gives the sides, the open land, and the gates\' names.' }],
    choose: 'Tap a part — a gate, the wall, a strip of the land, the river — or a chip under the model, or a marked word in the text, for its measures verse by verse, the same thing elsewhere in scripture, and what the model had to assume.',
  },
  strings: { parts: 'Parts of the city and the portion', storiesTitle: 'The city\'s stories', guidedTitle: 'Guided: measured as the text measures it, verse by verse' },
  roam: {
    eye: ROAM_EYE, start: ROAM_START, enter: ROAM_ENTER,
    openKeys: [],
    openKey: (which) => which,
    openDefault: () => 1,
  },
  scene: {
    sky: 0xc9dbea, shadowR: 220, fog: [200000, 900000], maxDistance: 160000, far: 1000000, plainR: 120000, logDepth: true, earth: '#6f8a44', plainDrop: 0.02, times: ['day', 'night'],
    lighting: { sun: 3.0, hemi: 0.7 }, extras: 'city',
    navCell: 4,   // the route grid at four cubits a cell (the city is 4,500 square — a cubit grid would be twenty million cells)
    navSkip: ['people', 'sadah', 'kahanayam', 'lawayay', 'achazah', 'nashayaa', 'nachal', ...TRIBES_N.map((_, i) => `tribe-n-${i}`), ...TRIBES_S.map((_, i) => `tribe-s-${i}`)],
    lights: [],
    walls: ['chawamah', 'mawashab', ...['north', 'east', 'south', 'west'].flatMap((s) => [0, 1, 2].map((i) => `gate-${s}-${i}`))],
    notSolid: ['people'],
    proxies: [],
    stairHouses: {},
    plan: {
      pieces: ['chawamah', 'mawashab', ...['north', 'east', 'south', 'west'].flatMap((s) => [0, 1, 2].map((i) => `gate-${s}-${i}`))],
      extra: [],
      labels: [
        ...['north', 'east', 'south', 'west'].flatMap((s) => GATES[s].map(([name], i) => { const at = GATE_AT[i], o = CITY.half + 40; return s === 'north' ? [at, -o, name] : s === 'south' ? [at, o, name] : s === 'east' ? [o, at, name] : [-o, at, name]; })),
        [0, 0, 'the square'],
      ],
      radius: 2800,
      places: [
        ...['north', 'east', 'south', 'west'].flatMap((s) => GATES[s].map(([name, en], i) => { const at = GATE_AT[i], o = CITY.half + CITY.wallT, a = o + 60; const [x, z, b] = s === 'north' ? [at, -o, { x0: at - 14, x1: at + 14, z0: -a, z1: -o + 52 }] : s === 'south' ? [at, o, { x0: at - 14, x1: at + 14, z0: o - 52, z1: a }] : s === 'east' ? [o, at, { x0: o - 52, x1: a, z0: at - 14, z1: at + 14 }] : [-o, at, { x0: -a, x1: -o + 52, z0: at - 14, z1: at + 14 }]; return { label: `shair (gate) of ${name} (${en}) · ${s}`, short: name, bounds: b, at: [s === 'east' ? o - 26 : s === 'west' ? -o + 26 : x, s === 'north' ? -o + 26 : s === 'south' ? o - 26 : z] }; })),
        { label: 'the square in the midst', short: 'square', bounds: { x0: -45, x1: 45, z0: -45, z1: 45 }, at: [0, 0] },
        { label: 'toward the bayath (house) — 17,500 north (open the house model to walk it)', short: 'north road', bounds: { x0: -30, x1: 30, z0: -CITY.half - SUBURB - 400, z1: -CITY.half - SUBURB }, at: [0, -CITY.half - SUBURB - 300] },
      ],
    },
    inHouse: () => false,
    floorAt: (c) => (Math.abs(c.x) < CITY.half && Math.abs(c.z) < CITY.half ? CITY_Y : Math.abs(c.x) < CITY.half + SUBURB && Math.abs(c.z) < CITY.half + SUBURB ? LAYER.suburb : LAYER.strips),
  },
  sheet: {
    plan: { x0: -2700, x1: 2700, z0: -2700, z1: 2700, scale: 0.112, left: 24, top: 26, grid: 500 },
    section: { x0: -2700, x1: 3000, y0: -4, y1: 80, scale: 0.06, left: 660, bottom: 64, tick: 500 },
    titles: ['PLAN · tzapawan (north) up · qadayam (east) right · one square = 500 amah', 'SECTION · through the middle, gate to gate'],
    labels: [
      ...['north', 'east', 'south', 'west'].flatMap((s) => GATES[s].map(([name], i) => { const at = GATE_AT[i], o = CITY.half + 140; return s === 'north' ? [name, at, -o] : s === 'south' ? [name, at, o] : s === 'east' ? [name, o + 60, at] : [name, -o - 60, at]; })),
      ['iyar (city) · 4,500', 0, -200], ['magarash · 250', 0, CITY.half + 120],
    ],
    compass: [2560, -2560],
    aria: 'The city Ezekiel saw, drawn flat: a plan of the square with its twelve gates and a section through the middle',
  },
};
export default MODEL;
