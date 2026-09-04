/**
 * holyLand.js — data + geometry for the "Holy Land in 3D" model
 * (src/pages/HolyLandMap.jsx).
 *
 * Everything here is IDEALIZED. Tribal borders in Joshua 13–19 are described
 * as lists of towns and landmarks, not surveyed lines, and half of those towns
 * are only tentatively identified — so the polygons below are the conventional
 * "study Bible map" shapes, hand-traced in lon/lat, not archaeology. Same for
 * the Ezekiel 47–48 layout: the text gives the outer border by landmarks and
 * the inner portions by measurement, so the bands are computed geometrically
 * from those landmarks, with the measured "holy portion" placed by the rules
 * in ch. 48 (see ezekielAllotment() below).
 *
 * Coordinates are [lon, lat] everywhere (GeoJSON order).
 *
 * City names carry a consonantal Hebrew spelling; the paleo form and the
 * app's own transliteration (Yabanaal, Chabarawan, …) are derived at runtime
 * from that spelling by squareToPaleo() + src/lib/translit.js, so the map
 * spells names exactly the way the Reader does. Never hand-type a
 * transliteration here — let the same code path produce it.
 */
import { transliterate } from '../translit.js';

// ── Square-script → Paleo-Hebrew (U+10900 block) ─────────────────────────────
const SQ_TO_PALEO = {
  'א':'𐤀','ב':'𐤁','ג':'𐤂','ד':'𐤃','ה':'𐤄','ו':'𐤅','ז':'𐤆','ח':'𐤇','ט':'𐤈',
  'י':'𐤉','כ':'𐤊','ך':'𐤊','ל':'𐤋','מ':'𐤌','ם':'𐤌','נ':'𐤍','ן':'𐤍','ס':'𐤎',
  'ע':'𐤏','פ':'𐤐','ף':'𐤐','צ':'𐤑','ץ':'𐤑','ק':'𐤒','ר':'𐤓','ש':'𐤔','ת':'𐤕',
};
export function squareToPaleo(s) {
  return [...String(s || '')].map((c) => SQ_TO_PALEO[c] ?? c).join('');
}
export function translitOf(hebrew) {
  return transliterate(squareToPaleo(hebrew));
}

// ── Tribe palette (shared by both overlays so a tribe keeps its colour) ──────
export const TRIBE_COLORS = {
  Dan:       '#e05555',
  Asher:     '#3ecfb0',
  Naphtali:  '#f2d94e',
  Manasseh:  '#4cca7a',
  Ephraim:   '#c9c3b8',
  Reuben:    '#f0883e',
  Judah:     '#6e8aa6',
  Benjamin:  '#2e4a6e',
  Simeon:    '#7a3b5e',
  Issachar:  '#8f8f8f',
  Zebulun:   '#a63b8a',
  Gad:       '#6b3fa0',
  Levi:      '#ffffff',
};

// Hebrew spellings of the tribes (for the labels' paleo line)
export const TRIBE_HEBREW = {
  Dan: 'דן', Asher: 'אשר', Naphtali: 'נפתלי', Manasseh: 'מנשה', Ephraim: 'אפרים',
  Reuben: 'ראובן', Judah: 'יהודה', Benjamin: 'בנימין', Simeon: 'שמעון',
  Issachar: 'יששכר', Zebulun: 'זבולון', Gad: 'גד', Levi: 'לוי',
};

// The app's own transliteration of each tribe (Ashar, Raawaban, Yahawadah…),
// derived from the spelling above the same way city names are.
export const TRIBE_TRANSLIT = Object.fromEntries(Object.entries(TRIBE_HEBREW).map(([k, he]) => [k, translitOf(he)]));
export const TRIBE_PALEO = Object.fromEntries(Object.entries(TRIBE_HEBREW).map(([k, he]) => [k, squareToPaleo(he)]));
/** "Manasseh (West)" → "Manashah (West)" — the display name with the tribe transliterated. */
export function tribeDisplayName(name, tribe) {
  return tribe && TRIBE_TRANSLIT[tribe] ? String(name).replace(tribe, TRIBE_TRANSLIT[tribe]) : name;
}

// ── Joshua 13–19 allotments (idealized, [lon,lat]) ───────────────────────────
// Each entry: name, tribe (for colour), ref, polygon ring (unclosed).
export const JOSHUA_TRIBES = [
  { id:'asher', name:'Asher', tribe:'Asher', ref:'Joshua 19:24–31',
    ring:[[34.95,32.76],[34.98,32.9],[35.07,33.05],[35.12,33.3],[35.2,33.5],[35.45,33.45],[35.45,33.15],[35.32,32.96],[35.15,32.82]] },
  { id:'naphtali', name:'Naphtali', tribe:'Naphtali', ref:'Joshua 19:32–39',
    ring:[[35.45,33.45],[35.6,33.42],[35.72,33.3],[35.7,33.15],[35.65,32.85],[35.58,32.72],[35.42,32.7],[35.32,32.96],[35.45,33.15]] },
  { id:'zebulun', name:'Zebulun', tribe:'Zebulun', ref:'Joshua 19:10–16',
    ring:[[35.05,32.86],[35.15,32.82],[35.32,32.96],[35.42,32.7],[35.3,32.62],[35.08,32.7]] },
  { id:'issachar', name:'Issachar', tribe:'Issachar', ref:'Joshua 19:17–23',
    ring:[[35.08,32.7],[35.3,32.62],[35.42,32.7],[35.58,32.72],[35.56,32.5],[35.4,32.45],[35.2,32.5],[35.08,32.56]] },
  { id:'manasseh-w', name:'Manasseh (West)', tribe:'Manasseh', ref:'Joshua 17:7–11',
    ring:[[34.88,32.5],[34.95,32.76],[35.05,32.86],[35.08,32.7],[35.08,32.56],[35.2,32.5],[35.4,32.45],[35.56,32.5],[35.55,32.2],[35.3,32.2],[35.0,32.25],[34.85,32.3]] },
  { id:'ephraim', name:'Ephraim', tribe:'Ephraim', ref:'Joshua 16:5–10',
    ring:[[34.82,32.3],[35.0,32.25],[35.3,32.2],[35.55,32.2],[35.52,31.97],[35.2,31.96],[35.05,31.92],[34.9,31.98],[34.78,32.1]] },
  { id:'dan', name:'Dan (original)', tribe:'Dan', ref:'Joshua 19:40–46',
    ring:[[34.62,32.08],[34.78,32.1],[34.9,31.98],[35.05,31.92],[35.0,31.8],[34.95,31.75],[34.85,31.8],[34.74,31.89],[34.6,31.9]] },
  { id:'benjamin', name:'Benjamin', tribe:'Benjamin', ref:'Joshua 18:11–28',
    ring:[[35.05,31.92],[35.2,31.96],[35.52,31.97],[35.5,31.78],[35.24,31.76],[35.05,31.8]] },
  { id:'judah', name:'Judah', tribe:'Judah', ref:'Joshua 15:1–63',
    // Northern border per 15:5–11: … Ekron → Shikkeron → Mount Baalah → Jabneel → the sea.
    ring:[[34.22,31.32],[34.35,31.45],[34.5,31.65],[34.6,31.9],[34.74,31.89],[34.85,31.8],[34.95,31.75],[35.0,31.8],[35.05,31.8],[35.24,31.76],[35.5,31.78],[35.42,31.45],[35.4,31.15],[35.25,30.85],[34.95,30.75],[34.42,30.65],[34.2,31.15]] },
  { id:'simeon', name:'Simeon', tribe:'Simeon', ref:'Joshua 19:1–9',
    ring:[[34.4,31.3],[34.5,31.5],[34.9,31.55],[35.02,31.32],[34.9,31.1],[34.5,31.05]] },
  { id:'reuben', name:'Reuben', tribe:'Reuben', ref:'Joshua 13:15–23',
    ring:[[35.55,31.86],[35.9,31.86],[36.02,31.5],[35.8,31.3],[35.55,31.35]] },
  { id:'gad', name:'Gad', tribe:'Gad', ref:'Joshua 13:24–28',
    ring:[[35.55,31.86],[35.9,31.86],[36.02,32.0],[35.88,32.35],[35.72,32.52],[35.6,32.46],[35.55,32.2]] },
  { id:'manasseh-e', name:'Manasseh (East)', tribe:'Manasseh', ref:'Joshua 13:29–31',
    ring:[[35.6,32.46],[35.72,32.52],[35.88,32.35],[36.32,32.5],[36.42,32.9],[36.2,33.3],[35.78,33.3],[35.72,33.3],[35.7,33.15],[35.65,32.85],[35.6,32.7]] },
  { id:'dan-north', name:'Dan (Laish)', tribe:'Dan', ref:'Joshua 19:47',
    ring:[[35.55,33.32],[35.72,33.3],[35.7,33.15],[35.55,33.18]] },
];

// ── Ezekiel 47–48 borders (landmarks, [lon,lat]) ─────────────────────────────
// West edge = the Great Sea's coast, north → south.
// Points sit a few km OFFSHORE so coastal cities (Beirut, Haifa, Tel Aviv,
// Gaza…) fall inside their band rather than on the line.
const EZ_WEST = [
  [35.78,34.45],[35.6,34.2],[35.44,33.9],[35.3,33.56],[35.13,33.27],[35.04,33.09],
  [35.0,32.93],[34.9,32.83],[34.83,32.5],[34.74,32.2],[34.68,32.05],[34.57,31.8],
  [34.36,31.5],[34.18,31.3],[33.75,31.13],
];
// East edge, north → south: Hazar-enan → Damascus → Hauran → Jordan → Salt Sea → Tamar.
const EZ_EAST = [
  [37.2,34.35],[36.6,33.9],[36.38,33.5],[36.3,33.0],[35.68,32.72],[35.58,32.4],
  [35.53,32.0],[35.5,31.75],[35.45,31.3],[35.35,30.95],[35.24,30.78],
];
// North edge, west → east: sea → Hethlon → Lebo-hamath → Zedad → Hazar-enan (47:15–17).
const EZ_NORTH = [[35.78,34.45],[36.0,34.45],[36.2,34.2],[36.9,34.3],[37.2,34.35]];
// South edge, west → east: Brook of Egypt → Meribath-kadesh → Tamar (47:19).
const EZ_SOUTH = [[33.75,31.13],[34.1,30.85],[34.42,30.65],[34.8,30.65],[35.24,30.78]];

// Ezekiel 48:1–7, 23–27: north → south, with the holy portion between Judah and Benjamin.
export const EZEKIEL_ORDER = [
  'Dan','Asher','Naphtali','Manasseh','Ephraim','Reuben','Judah',
  'HOLY',
  'Benjamin','Simeon','Issachar','Zebulun','Gad',
];

const KM_PER_DEG_LAT = 111.32;
const CUBIT_M = 0.525;                 // long cubit, 47:16 "a cubit and a handbreadth" ≈ 0.525 m
// Where the 25,000-square sits north–south. Ezekiel gives no band widths, so:
//   anchored — the City (48:15–20, "YHWH is there", 48:35) is placed at
//              Jerusalem's latitude, the seven northern tribes share what is
//              left above it and the five southern tribes what is left below —
//              the conventional study-map layout (and the reference map this
//              model was built from).
//   equal    — all twelve tribal bands the same height, the holy portion
//              simply taking its measured share between Judah and Benjamin.
export const HOLY_LAYOUTS = {
  anchored: { label: 'City at Jerusalem', sub: 'reference-map layout' },
  equal:    { label: 'Equal bands',       sub: 'twelve equal strips' },
};
const JERUSALEM = [35.235, 31.778];
const JERUSALEM_LAT = JERUSALEM[1];

export const HOLY_UNITS = {
  reeds:  { label:'reeds (6 cubits)', km: 25000 * 6 * CUBIT_M / 1000 },   // ≈ 78.8 km
  cubits: { label:'cubits',          km: 25000 * CUBIT_M / 1000 },       // ≈ 13.1 km
};

// Point on a lat-monotone (N→S) polyline at a given latitude.
function lonAtLat(line, lat) {
  if (lat >= line[0][1]) return line[0][0];
  const last = line[line.length - 1];
  if (lat <= last[1]) return last[0];
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = line[i], [x2, y2] = line[i + 1];
    if (lat <= y1 && lat >= y2) {
      const t = y1 === y2 ? 0 : (y1 - lat) / (y1 - y2);
      return x1 + (x2 - x1) * t;
    }
  }
  return last[0];
}
// Vertices of a N→S polyline strictly between two latitudes, in N→S order.
function between(line, latTop, latBot) {
  return line.filter(([, y]) => y < latTop && y > latBot);
}
// A cut line (W→E) at a given latitude between the two edges.
function cutAt(lat) {
  return [[lonAtLat(EZ_WEST, lat), lat], [lonAtLat(EZ_EAST, lat), lat]];
}
// Band between two W→E cut lines: top(W→E) + east edge down + bottom(E→W) + west edge up.
function bandBetween(top, bot) {
  const topE = top[top.length - 1], botE = bot[bot.length - 1];
  const topW = top[0], botW = bot[0];
  return [
    ...top,
    ...between(EZ_EAST, topE[1], botE[1]),
    ...[...bot].reverse(),
    ...between(EZ_WEST, botW[1], topW[1]).reverse(),
  ];
}
// Sub-rectangle of a band clipped to a lon range (used for the prince's portions).
function bandClipLon(top, bot, lonMin, lonMax) {
  const poly = bandBetween(top, bot);
  return poly.map(([x, y]) => [Math.min(Math.max(x, lonMin), lonMax), y]);
}

/**
 * Build the Ezekiel 48 layout.
 * @param {'reeds'|'cubits'} unit — how to read the 25,000 × 25,000 holy portion.
 * @returns {{ bands: Array, holy: Array, meta: object }} GeoJSON-ready rings.
 */
export function ezekielAllotment(unit = 'cubits', layout = 'anchored') {
  const holyKm = HOLY_UNITS[unit].km;
  const holyDeg = holyKm / KM_PER_DEG_LAT;
  const latTop = (EZ_NORTH[0][1] + EZ_NORTH[EZ_NORTH.length - 1][1]) / 2;   // ≈ 34.4
  const latBot = (EZ_SOUTH[0][1] + EZ_SOUTH[EZ_SOUTH.length - 1][1]) / 2;   // ≈ 30.95
  let northDeg, southDeg;
  if (layout === 'equal') {
    northDeg = southDeg = (latTop - latBot - holyDeg) / 12;
  } else {
    // City strip is the southern 5,000 of the square → its centre sits 22,500
    // down from the top; anchor that centre on Jerusalem.
    const hTopAnch = JERUSALEM_LAT + holyDeg * (22500 / 25000);
    northDeg = (latTop - hTopAnch) / 7;
    southDeg = (hTopAnch - holyDeg - latBot) / 5;
  }

  const bands = [];
  let lat = latTop;
  let holyTop = null;
  let prevCut = EZ_NORTH;
  EZEKIEL_ORDER.forEach((name, i) => {
    const h = name === 'HOLY' ? holyDeg : (i < 7 ? northDeg : southDeg);
    const next = lat - h;
    const isLast = i === EZEKIEL_ORDER.length - 1;
    const cut = isLast ? EZ_SOUTH : cutAt(next);
    if (name === 'HOLY') holyTop = { lat, cutTop: prevCut, cutBot: cut };
    else bands.push({ id:`ez-${name.toLowerCase()}`, name, tribe:name, ref:`Ezekiel 48:${i < 7 ? i + 1 : i + 15}`  /* 48:1–7 Dan…Judah; 48:23–27 Benjamin…Gad */, ring: bandBetween(prevCut, cut) });
    prevCut = cut;
    lat = next;
  });

  // ── The holy portion (48:8–22): a 25,000-square in the middle of the band,
  //    prince's land on both sides out to the borders.
  const hTop = holyTop.lat, hBot = hTop - holyDeg, hMid = (hTop + hBot) / 2;
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos(hMid * Math.PI / 180);
  const holyLonDeg = holyKm / kmPerDegLon;
  const westLon = lonAtLat(EZ_WEST, hMid), eastLon = lonAtLat(EZ_EAST, hMid);
  // E–W: centred between the coast and the Jordan (equal layout), or on
  // Jerusalem itself (anchored) — clamped so the square never leaves the land.
  let sqW = (layout === 'equal' ? (westLon + eastLon) / 2 : JERUSALEM[0]) - holyLonDeg / 2;
  sqW = Math.max(westLon, Math.min(sqW, eastLon - holyLonDeg));
  const sqE = sqW + holyLonDeg;
  const rect = (x1, x2, y1, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

  // Vertical split of the square, north → south, in 25,000ths (48:10–15).
  const y = (frac) => hTop - holyDeg * frac;
  const levitesTop = y(0), levitesBot = y(10 / 25);
  const priestsTop = levitesBot, priestsBot = y(20 / 25);
  const cityTop = priestsBot, cityBot = y(1);
  // Sanctuary "in the midst" of the priests' portion (48:10); the city 4,500
  // square in the middle of the 5,000 strip with 250 of open land round it
  // (48:15–17); the 10,000 on either side of it feed the city's workers (48:18).
  const sanctSide = holyLonDeg * (500 / 25000);           // 45:2 — 500 × 500
  const sanctSideLat = holyDeg * (500 / 25000);
  const midLon = (sqW + sqE) / 2;
  const cityW = midLon - holyLonDeg * (2250 / 25000), cityE = midLon + holyLonDeg * (2250 / 25000);
  const cityMidLat = (cityTop + cityBot) / 2;
  const cityN = cityMidLat + holyDeg * (2250 / 25000), cityS = cityMidLat - holyDeg * (2250 / 25000);
  const subW = midLon - holyLonDeg * (2500 / 25000), subE = midLon + holyLonDeg * (2500 / 25000);

  const holy = [
    { id:'ez-prince-w', kind:'prince', name:"Prince's portion (west)", ref:'Ezekiel 48:21', ring: bandClipLon(holyTop.cutTop, holyTop.cutBot, -180, sqW) },
    { id:'ez-prince-e', kind:'prince', name:"Prince's portion (east)", ref:'Ezekiel 48:21', ring: bandClipLon(holyTop.cutTop, holyTop.cutBot, sqE, 180) },
    { id:'ez-levites',  kind:'levites', name:"Levites' portion", ref:'Ezekiel 48:13–14', ring: rect(sqW, sqE, levitesTop, levitesBot) },
    { id:'ez-priests',  kind:'priests', name:"Priests' portion (sons of Zadok)", ref:'Ezekiel 48:10–12', ring: rect(sqW, sqE, priestsTop, priestsBot) },
    { id:'ez-food-w',   kind:'food', name:'Food for the city workers (west)', ref:'Ezekiel 48:18–19', ring: rect(sqW, subW, cityTop, cityBot) },
    { id:'ez-food-e',   kind:'food', name:'Food for the city workers (east)', ref:'Ezekiel 48:18–19', ring: rect(subE, sqE, cityTop, cityBot) },
    { id:'ez-suburbs',  kind:'suburbs', name:'Open land round the city', ref:'Ezekiel 48:17', ring: rect(subW, subE, cityTop, cityBot) },
    { id:'ez-city',     kind:'city', name:'The City — "YHWH is there"', ref:'Ezekiel 48:15–16, 35', ring: rect(cityW, cityE, cityN, cityS) },
    { id:'ez-sanctuary', kind:'sanctuary', name:'The Sanctuary', ref:'Ezekiel 48:10; 45:2',
      ring: rect(midLon - sanctSide / 2, midLon + sanctSide / 2, (priestsTop + priestsBot) / 2 + sanctSideLat / 2, (priestsTop + priestsBot) / 2 - sanctSideLat / 2) },
  ];

  return {
    bands, holy,
    meta: { unit, layout, holyKm, northKm: northDeg * KM_PER_DEG_LAT, southKm: southDeg * KM_PER_DEG_LAT, latTop, latBot, sanctuary: [midLon, (priestsTop + priestsBot) / 2], city: [midLon, cityMidLat] },
  };
}

export const HOLY_KIND_STYLE = {
  prince:    { color:'#ffffff', opacity:0.55, label:'P' },
  levites:   { color:'#ffffff', opacity:0.75, label:'L' },
  priests:   { color:'#e8aa55', opacity:0.75, label:'Z' },
  food:      { color:'#d9d2c2', opacity:0.75, label:'X' },
  suburbs:   { color:'#f5efe0', opacity:0.85, label:'' },
  city:      { color:'#4a9eff', opacity:0.9,  label:'C' },
  sanctuary: { color:'#e05555', opacity:1,    label:'S' },
};

// ── Biblical cities (idealized, conventional identifications) ────────────────
// [id, English, Hebrew, lon, lat, reference, note]
const B = (id, name, he, lon, lat, ref, note = '') => ({ id, name, he, lon, lat, ref, note, kind:'biblical' });
export const BIBLICAL_CITIES = [
  B('jabneel-judah', 'Jabneel', 'יבנאל', 34.74, 31.87, 'Joshua 15:11', 'On Judah\'s northern border, "the border went out to Jabneel; and the goings out of the border were at the sea." Later Jabneh / Yavne (2 Chr 26:6). Modern Yavne.'),
  B('jabneel-naphtali', 'Jabneel (Naphtali)', 'יבנאל', 35.53, 32.71, 'Joshua 19:33', 'A second Jabneel, on Naphtali\'s border — a different town from Judah\'s Jabneel.'),
  B('jerusalem', 'Jerusalem', 'ירושלם', 35.235, 31.778, 'Joshua 15:8, 63', 'Jebus; on the Judah–Benjamin line.'),
  B('hebron', 'Hebron', 'חברון', 35.10, 31.53, 'Joshua 14:13–15', 'Kiriath-arba; Caleb\'s inheritance.'),
  B('beersheba', 'Beer-sheba', 'באר שבע', 34.79, 31.24, 'Joshua 15:28; 19:2', ''),
  B('jericho', 'Jericho', 'יריחו', 35.44, 31.87, 'Joshua 6', ''),
  B('gilgal', 'Gilgal', 'גלגל', 35.47, 31.88, 'Joshua 4:19', 'Israel\'s first camp west of the Jordan.'),
  B('bethel', 'Bethel', 'בית אל', 35.22, 31.93, 'Joshua 8:9; 16:1', 'Luz.'),
  B('ai', 'Ai', 'עי', 35.257, 31.917, 'Joshua 7–8', ''),
  B('gibeon', 'Gibeon', 'גבעון', 35.185, 31.847, 'Joshua 9–10', ''),
  B('ramah', 'Ramah', 'רמה', 35.23, 31.90, 'Joshua 18:25', ''),
  B('mizpah', 'Mizpah', 'מצפה', 35.216, 31.885, 'Joshua 18:26', ''),
  B('kiriath-jearim', 'Kiriath-jearim', 'קרית יערים', 35.11, 31.80, 'Joshua 9:17; 15:9', ''),
  B('beth-shemesh', 'Beth-shemesh', 'בית שמש', 34.98, 31.75, 'Joshua 15:10', ''),
  B('timnah', 'Timnah', 'תמנה', 34.92, 31.79, 'Joshua 15:10', ''),
  B('ekron', 'Ekron', 'עקרון', 34.85, 31.78, 'Joshua 15:11, 45', 'Philistine city; named with Jabneel on Judah\'s border.'),
  B('ashdod', 'Ashdod', 'אשדוד', 34.65, 31.76, 'Joshua 15:47', ''),
  B('ashkelon', 'Ashkelon', 'אשקלון', 34.55, 31.66, 'Joshua 13:3', ''),
  B('gaza', 'Gaza', 'עזה', 34.46, 31.50, 'Joshua 15:47', ''),
  B('gath', 'Gath', 'גת', 34.847, 31.70, 'Joshua 11:22', ''),
  B('lachish', 'Lachish', 'לכיש', 34.85, 31.56, 'Joshua 10:31', ''),
  B('libnah', 'Libnah', 'לבנה', 34.87, 31.62, 'Joshua 10:29', ''),
  B('debir', 'Debir', 'דבר', 35.02, 31.42, 'Joshua 15:15', 'Kiriath-sepher.'),
  B('bethlehem', 'Bethlehem', 'בית לחם', 35.20, 31.70, 'Judges 17:7; Ruth 1', ''),
  B('tekoa', 'Tekoa', 'תקוע', 35.22, 31.63, '2 Chronicles 11:6', ''),
  B('engedi', 'En-gedi', 'עין גדי', 35.39, 31.46, 'Joshua 15:62', ''),
  B('arad', 'Arad', 'ערד', 35.13, 31.28, 'Joshua 12:14', ''),
  B('hormah', 'Hormah', 'חרמה', 34.90, 31.30, 'Joshua 12:14; 19:4', ''),
  B('ziklag', 'Ziklag', 'צקלג', 34.70, 31.38, 'Joshua 15:31; 19:5', ''),
  B('gerar', 'Gerar', 'גרר', 34.60, 31.38, 'Genesis 20:1', ''),
  B('kadesh-barnea', 'Kadesh-barnea', 'קדש ברנע', 34.42, 30.65, 'Joshua 10:41; Ezekiel 47:19', 'Meribath-kadesh — the south-west anchor of Ezekiel\'s border.'),
  B('tamar', 'Tamar', 'תמר', 35.24, 30.78, 'Ezekiel 47:19', 'South-east anchor of Ezekiel\'s border.'),
  B('brook-of-egypt', 'Brook of Egypt', 'נחל מצרים', 33.80, 31.13, 'Joshua 15:4; Ezekiel 47:19', 'Wadi el-Arish.'),
  B('joppa', 'Joppa', 'יפו', 34.75, 32.05, 'Joshua 19:46', ''),
  B('aphek', 'Aphek', 'אפק', 34.93, 32.10, 'Joshua 12:18', ''),
  B('shiloh', 'Shiloh', 'שלה', 35.29, 32.06, 'Joshua 18:1', 'Where the tabernacle stood and the land was divided.'),
  B('shechem', 'Shechem', 'שכם', 35.28, 32.21, 'Joshua 24:1', ''),
  B('ebal', 'Mount Ebal', 'עיבל', 35.27, 32.23, 'Joshua 8:30', ''),
  B('gerizim', 'Mount Gerizim', 'גרזים', 35.27, 32.20, 'Joshua 8:33', ''),
  B('samaria', 'Samaria', 'שמרון', 35.19, 32.28, '1 Kings 16:24', ''),
  B('dor', 'Dor', 'דור', 34.92, 32.62, 'Joshua 12:23', ''),
  B('megiddo', 'Megiddo', 'מגדו', 35.18, 32.58, 'Joshua 12:21', ''),
  B('taanach', 'Taanach', 'תענך', 35.22, 32.52, 'Joshua 12:21', ''),
  B('jezreel', 'Jezreel', 'יזרעאל', 35.33, 32.56, 'Joshua 19:18', ''),
  B('shunem', 'Shunem', 'שונם', 35.33, 32.61, 'Joshua 19:18', ''),
  B('endor', 'En-dor', 'עין דר', 35.38, 32.63, 'Joshua 17:11', ''),
  B('beth-shean', 'Beth-shean', 'בית שאן', 35.50, 32.50, 'Joshua 17:11', ''),
  B('tabor', 'Mount Tabor', 'תבור', 35.39, 32.69, 'Joshua 19:22', ''),
  B('carmel', 'Mount Carmel', 'כרמל', 35.00, 32.73, 'Joshua 19:26', ''),
  B('chinnereth', 'Chinnereth', 'כנרת', 35.55, 32.87, 'Joshua 19:35', 'On the Sea of Chinnereth (Galilee).'),
  B('acco', 'Acco', 'עכו', 35.07, 32.93, 'Judges 1:31', ''),
  B('achzib', 'Achzib', 'אכזיב', 35.10, 33.05, 'Joshua 19:29', ''),
  B('tyre', 'Tyre', 'צר', 35.19, 33.27, 'Joshua 19:29', ''),
  B('sidon', 'Sidon', 'צידון', 35.37, 33.56, 'Joshua 19:28', '"Great Sidon."'),
  B('hazor', 'Hazor', 'חצור', 35.57, 33.02, 'Joshua 11:10', '"Head of all those kingdoms."'),
  B('kedesh', 'Kedesh', 'קדש', 35.53, 33.11, 'Joshua 20:7', 'City of refuge.'),
  B('dan', 'Dan (Laish)', 'דן', 35.65, 33.25, 'Joshua 19:47', ''),
  B('hermon', 'Mount Hermon', 'חרמון', 35.86, 33.42, 'Joshua 11:17', ''),
  B('baal-gad', 'Baal-gad', 'בעל גד', 35.72, 33.40, 'Joshua 11:17', ''),
  B('golan', 'Golan', 'גולן', 35.80, 32.85, 'Joshua 20:8', 'City of refuge.'),
  B('ashtaroth', 'Ashtaroth', 'עשתרות', 36.02, 32.80, 'Joshua 12:4', ''),
  B('edrei', 'Edrei', 'אדרעי', 36.10, 32.62, 'Joshua 12:4', ''),
  B('ramoth-gilead', 'Ramoth-gilead', 'ראמת גלעד', 35.85, 32.55, 'Joshua 20:8', 'City of refuge.'),
  B('jabesh-gilead', 'Jabesh-gilead', 'יבש גלעד', 35.65, 32.40, 'Judges 21:8', ''),
  B('mahanaim', 'Mahanaim', 'מחנים', 35.65, 32.20, 'Joshua 13:26', ''),
  B('succoth', 'Succoth', 'סכות', 35.62, 32.17, 'Joshua 13:27', ''),
  B('penuel', 'Penuel', 'פנואל', 35.70, 32.17, 'Judges 8:8', ''),
  B('jazer', 'Jazer', 'יעזר', 35.78, 32.05, 'Joshua 13:25', ''),
  B('rabbah', 'Rabbah', 'רבה', 35.93, 31.95, 'Joshua 13:25', 'Rabbath-ammon; modern Amman.'),
  B('heshbon', 'Heshbon', 'חשבון', 35.81, 31.80, 'Joshua 13:17', ''),
  B('nebo', 'Mount Nebo', 'נבו', 35.73, 31.77, 'Deuteronomy 34:1', ''),
  B('medeba', 'Medeba', 'מידבא', 35.79, 31.72, 'Joshua 13:9', ''),
  B('bezer', 'Bezer', 'בצר', 35.90, 31.62, 'Joshua 20:8', 'City of refuge.'),
  B('dibon', 'Dibon', 'דיבן', 35.78, 31.50, 'Joshua 13:17', ''),
  B('aroer', 'Aroer', 'ערער', 35.83, 31.47, 'Joshua 13:9', 'On the Arnon.'),
  // Ezekiel's northern landmarks
  B('damascus', 'Damascus', 'דמשק', 36.30, 33.51, 'Ezekiel 47:16', ''),
  B('berothah', 'Berothah', 'ברותה', 35.98, 33.78, 'Ezekiel 47:16', ''),
  B('lebo-hamath', 'Lebo-hamath', 'לבוא חמת', 36.20, 34.19, 'Ezekiel 47:15; 48:1', '"The entrance of Hamath."'),
  B('hethlon', 'Hethlon', 'חתלן', 36.00, 34.45, 'Ezekiel 47:15', ''),
  B('zedad', 'Zedad', 'צדד', 36.92, 34.31, 'Ezekiel 47:15', ''),
  B('hazar-enan', 'Hazar-enan', 'חצר עינן', 37.24, 34.23, 'Ezekiel 47:17', 'North-east corner of Ezekiel\'s border.'),
  B('hauran', 'Hauran', 'חורן', 36.50, 32.75, 'Ezekiel 47:16, 18', ''),
].map((c) => ({ ...c, paleo: squareToPaleo(c.he), translit: translitOf(c.he) }));

// ── Modern cities / peoples (approximate populations, for context) ───────────
const M = (id, name, country, lon, lat, pop, note = '') => ({ id, name, country, lon, lat, pop, note, kind:'modern' });
export const MODERN_CITIES = [
  M('tripoli', 'Tripoli', 'Lebanon', 35.84, 34.44, '≈ 230k'),
  M('beirut', 'Beirut', 'Lebanon', 35.50, 33.89, '≈ 2.4M metro'),
  M('zahle', 'Zahlé', 'Lebanon', 35.90, 33.85, '≈ 120k'),
  M('baalbek', 'Baalbek', 'Lebanon', 36.21, 34.01, '≈ 80k'),
  M('sidon-modern', 'Sidon (Saida)', 'Lebanon', 35.37, 33.56, '≈ 80k'),
  M('tyre-modern', 'Tyre (Sour)', 'Lebanon', 35.20, 33.27, '≈ 60k'),
  M('nabatieh', 'Nabatieh', 'Lebanon', 35.48, 33.38, '≈ 80k'),
  M('damascus-modern', 'Damascus', 'Syria', 36.29, 33.51, '≈ 2.5M'),
  M('homs', 'Homs', 'Syria', 36.72, 34.73, '≈ 800k', 'Just north of Lebo-hamath.'),
  M('quneitra', 'Quneitra', 'Syria', 35.82, 33.13, ''),
  M('daraa', 'Daraa', 'Syria', 36.10, 32.62, '≈ 100k', 'Ancient Edrei.'),
  M('suwayda', 'As-Suwayda', 'Syria', 36.57, 32.71, '≈ 75k', 'Druze heartland (Jabal al-Druze).'),
  M('kiryat-shmona', 'Kiryat Shmona', 'Israel', 35.57, 33.21, '≈ 25k'),
  M('majdal-shams', 'Majdal Shams', 'Golan (Druze)', 35.77, 33.27, '≈ 12k'),
  M('safed', 'Safed', 'Israel', 35.50, 32.96, '≈ 40k'),
  M('acre', 'Acre (Akko)', 'Israel', 35.08, 32.93, '≈ 50k'),
  M('haifa', 'Haifa', 'Israel', 34.99, 32.79, '≈ 290k'),
  M('tiberias', 'Tiberias', 'Israel', 35.53, 32.79, '≈ 50k'),
  M('nazareth', 'Nazareth', 'Israel', 35.30, 32.70, '≈ 80k'),
  M('afula', 'Afula', 'Israel', 35.29, 32.61, '≈ 60k'),
  M('jenin', 'Jenin', 'West Bank', 35.30, 32.46, '≈ 50k'),
  M('beit-shean', 'Beit She\'an', 'Israel', 35.50, 32.50, '≈ 18k'),
  M('irbid', 'Irbid', 'Jordan', 35.85, 32.55, '≈ 570k'),
  M('netanya', 'Netanya', 'Israel', 34.86, 32.32, '≈ 230k'),
  M('tulkarm', 'Tulkarm', 'West Bank', 35.03, 32.31, '≈ 65k'),
  M('nablus', 'Nablus', 'West Bank', 35.26, 32.22, '≈ 160k', 'Ancient Shechem.'),
  M('salt', 'As-Salt', 'Jordan', 35.73, 32.04, '≈ 100k'),
  M('zarqa', 'Zarqa', 'Jordan', 36.09, 32.07, '≈ 640k'),
  M('amman', 'Amman', 'Jordan', 35.93, 31.95, '≈ 4M metro', 'Ancient Rabbah of the Ammonites.'),
  M('petah-tikva', 'Petah Tikva', 'Israel', 34.89, 32.09, '≈ 250k'),
  M('tel-aviv', 'Tel Aviv–Yafo', 'Israel', 34.78, 32.08, '≈ 4M metro'),
  M('rishon', 'Rishon LeZion', 'Israel', 34.79, 31.96, '≈ 250k'),
  M('modiin', 'Modi\'in', 'Israel', 35.01, 31.90, '≈ 100k'),
  M('ramallah', 'Ramallah', 'West Bank', 35.20, 31.90, '≈ 40k (≈ 300k metro)'),
  M('jericho-modern', 'Jericho', 'West Bank', 35.44, 31.86, '≈ 20k'),
  M('yavne', 'Yavne', 'Israel', 34.74, 31.87, '≈ 55k', 'Modern successor of Jabneel / Jabneh (Joshua 15:11).'),
  M('ashdod-modern', 'Ashdod', 'Israel', 34.65, 31.80, '≈ 225k'),
  M('jerusalem-modern', 'Jerusalem', 'Israel / West Bank', 35.21, 31.77, '≈ 1M'),
  M('bethlehem-modern', 'Bethlehem', 'West Bank', 35.20, 31.70, '≈ 30k'),
  M('madaba', 'Madaba', 'Jordan', 35.80, 31.72, '≈ 60k'),
  M('ashkelon-modern', 'Ashkelon', 'Israel', 34.57, 31.67, '≈ 150k'),
  M('hebron-modern', 'Hebron', 'West Bank', 35.10, 31.53, '≈ 200k'),
  M('gaza-city', 'Gaza City', 'Gaza', 34.46, 31.50, '≈ 600k'),
  M('khan-yunis', 'Khan Yunis', 'Gaza', 34.31, 31.35, '≈ 200k'),
  M('rafah', 'Rafah', 'Gaza', 34.25, 31.29, '≈ 170k'),
  M('beersheba-modern', 'Beersheba', 'Israel', 34.79, 31.25, '≈ 210k'),
  M('arad-modern', 'Arad', 'Israel', 35.21, 31.26, '≈ 28k'),
  M('karak', 'Al-Karak', 'Jordan', 35.70, 31.18, '≈ 30k', 'Kir of Moab.'),
  M('dimona', 'Dimona', 'Israel', 35.03, 31.07, '≈ 35k'),
  M('el-arish', 'El-Arish', 'Egypt', 33.80, 31.13, '≈ 165k', 'At the mouth of the Brook of Egypt (Wadi el-Arish).'),
  M('mitzpe-ramon', 'Mitzpe Ramon', 'Israel', 34.80, 30.61, '≈ 5k'),
  M('aqaba', 'Aqaba', 'Jordan', 35.00, 29.53, '≈ 150k', 'Outside the southern border.'),
  M('eilat', 'Eilat', 'Israel', 34.95, 29.56, '≈ 50k', 'Outside the southern border.'),
];

// ── Geometry helpers ─────────────────────────────────────────────────────────
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
export function ringCentroid(ring) {
  // Area-weighted centroid (falls back to the vertex mean for degenerate rings).
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}
export function toFeature(entry, props = {}) {
  return {
    type: 'Feature',
    properties: { id: entry.id, name: entry.name, tribe: entry.tribe || null, ref: entry.ref || null, kind: entry.kind || null, ...props },
    geometry: { type: 'Polygon', coordinates: [[...entry.ring, entry.ring[0]]] },
  };
}

/** Which Joshua allotment contains a point (first hit). */
export function joshuaTribeAt(lonLat) {
  return JOSHUA_TRIBES.find((t) => pointInRing(lonLat, t.ring)) || null;
}
/** Which Ezekiel band / holy sub-portion contains a point. */
export function ezekielAt(lonLat, layout) {
  const sub = [...layout.holy].reverse().find((h) => pointInRing(lonLat, h.ring)); // most specific first
  if (sub) return { name: 'Holy portion', sub };
  const band = layout.bands.find((b) => pointInRing(lonLat, b.ring));
  return band ? { name: band.name, band } : null;
}
