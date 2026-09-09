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
// The allowlist of compound names that render hyphenated (Bayath-Lacham,
// Yashar-Al, Abay-Dan). Maintained by server/hyphenate-compound-names.mjs and
// shared with the server's /api/strongs so the map, the Root Explorer and the
// reading text all agree. A name not listed keeps the joined form.
import hyphenAllow from '../../../server/lexicon/compound-hyphenation.json' with { type: 'json' };
// Modern country outlines (Natural Earth 50m admin-0, public domain), clipped
// to the same box as the base map — drawn in purple around a selected nation
// or city so "where is Greece / which country is Tyre in today" is visible.
import countriesBase from './countries.json' with { type: 'json' };
const HYPHEN_BY_HE = Object.fromEntries(Object.values(hyphenAllow).filter((r) => r && !r.skip && r.he).map((r) => [r.he.replace(/\s+/g, ''), r]));

// ── Square-script → Paleo-Hebrew (U+10900 block) ─────────────────────────────
const SQ_TO_PALEO = {
  'א':'𐤀','ב':'𐤁','ג':'𐤂','ד':'𐤃','ה':'𐤄','ו':'𐤅','ז':'𐤆','ח':'𐤇','ט':'𐤈',
  'י':'𐤉','כ':'𐤊','ך':'𐤊','ל':'𐤋','מ':'𐤌','ם':'𐤌','נ':'𐤍','ן':'𐤍','ס':'𐤎',
  'ע':'𐤏','פ':'𐤐','ף':'𐤐','צ':'𐤑','ץ':'𐤑','ק':'𐤒','ר':'𐤓','ש':'𐤔','ת':'𐤕',
};
export function squareToPaleo(s) {
  return [...String(s || '')].map((c) => SQ_TO_PALEO[c] ?? c).join('');
}
// Compound names are HYPHENATED so each piece can be enunciated on its own:
// בית לחם → 𐤁𐤉𐤕-𐤋𐤇𐤌 → Bayath-Lacham (fieldy's rule, 2026-09-08). A single
// word is unchanged.
const hyphenRule = (hebrew) => HYPHEN_BY_HE[String(hebrew || '').replace(/[\s־-]+/g, '')];
export function compoundPaleo(hebrew) {
  const r = hyphenRule(hebrew);
  if (r) return r.paleo;
  return squareToPaleo(String(hebrew || '').trim().replace(/[\s־-]+/g, ' '));
}
export function translitOf(hebrew) {
  const r = hyphenRule(hebrew);
  if (r) return r.to;
  return String(hebrew || '').trim().split(/[\s־-]+/).map((w) => transliterate(squareToPaleo(w))).join(' ');
}

// ── Tribe palette (shared by both overlays so a tribe keeps its colour) ──────
export const TRIBE_COLORS = {
  Dan:       '#e05555',
  Asher:     '#3ecfb0',
  Naphtali:  '#f2d94e',
  Manasseh:  '#4cca7a',
  Ephraim:   '#8d8d8d',
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
// Units — everything below is derived from these two verses:
//   40:5  the measuring reed is six cubits long, "by the cubit and an hand breadth"
//         (the long cubit ≈ 0.525 m), so a reed ≈ 3.15 m.
const CUBIT_M = 0.525;
const REED_M = 6 * CUBIT_M;
const JERUSALEM = [35.235, 31.778];

// The words of the holy portion, in the app's own transliteration (never
// "the LORD"/"YHWH": fieldy's rule — his transliterations and the roots).
const W = (he) => ({ he, paleo: compoundPaleo(he), tr: translitOf(he) });
export const HOLY_WORDS = {
  terumah:   W('תרומה'),    // the offering / holy portion  (48:8)
  nasi:      W('נשיא'),     // the prince                   (48:21)
  leviim:    W('לוים'),     // the Levites                  (48:13)
  kohanim:   W('כהנים'),    // the priests                  (48:10)
  tzadoq:    W('צדוק'),     // Zadok                        (48:11)
  ir:        W('עיר'),      // the city                     (48:15)
  miqdash:   W('מקדש'),     // the sanctuary                (48:10)
  yhwhShammah: W('יהוה שמה'), // the city's name             (48:35)
  aratzQadash: W('ארץ קדש'),
  chalaqim:  W('חלקים'),    // portions — "Nashayaa Chalaqayam", the prince's portion (fieldy's label)  // "Aratz Qadash" — the Holy Land label on the square (fieldy's phrase; cf. Zechariah 2:12 אדמת הקדש)
};
const HW = HOLY_WORDS;

/**
 * The measurements of Ezekiel 45 & 48 and how each one is read on this map.
 * Rendered in the panel so the reader can check every line against the text.
 * `given` = what the verse states; `read` = how it is applied here.
 */
export const EZEKIEL_MEASURES = [
  { ref: 'Ezekiel 47:15–20', given: 'The border: the Great Sea → Hethlon → Lebo-hamath → Zedad → Berothah → Sibraim → Hazar-enan (north); between Hauran and Damascus along the Jordan to the eastern sea (east); Tamar → Meribath-kadesh → the Brook of Egypt → the Great Sea (south); the Great Sea (west).', read: 'Each landmark is a dot on the map; the border polyline joins them.' },
  { ref: 'Ezekiel 48:1–7, 23–27', given: 'Dan, Asher, Naphtali, Manasseh, Ephraim, Reuben, Judah — then the offering — then Benjamin, Simeon, Issachar, Zebulun, Gad; each "from the east side unto the west side".', read: 'Twelve bands in that order, every one spanning sea to Jordan. The text gives no band widths: the seven northern tribes share the land north of the offering equally, the five southern share the south.' },
  { ref: 'Ezekiel 48:8; 45:1', given: 'The offering (terumah): 25,000 in breadth, and in length as one of the tribal parts, from the east side to the west side; "the sanctuary shall be in the midst of it".', read: 'A 25,000-cubit band (≈ 13.1 km / 8.2 mi) between Judah and Benjamin, sea to Jordan.' },
  { ref: 'Ezekiel 48:20', given: '"All the offering shall be 25,000 by 25,000: you shall offer the holy offering foursquare, with the possession of the city."', read: 'The 25,000 × 25,000 square in the middle of that band.' },
  { ref: 'Ezekiel 48:21–22', given: 'The residue is the prince\'s, on one side and on the other of the holy offering, "over against the 25,000 of the offering toward the east border, and westward … toward the west border".', read: 'Prince\'s land from the square out to the sea on the west and to the Jordan on the east. This verse fixes the unit: from the Great Sea to the Jordan is under 80 km, so a square of 25,000 reeds (≈ 79 km) would leave the prince nothing on either side — the 25,000 must be cubits (≈ 13 km), the cubit of 40:5.' },
  { ref: 'Ezekiel 48:10–12', given: 'The priests (the sons of Tzadawaq): 25,000 long, 10,000 broad; "the sanctuary of Yahawah shall be in the midst thereof"; a most holy portion next to the Levites\' border.', read: 'The 10,000-cubit strip with the sanctuary at its centre — the middle strip of the square.' },
  { ref: 'Ezekiel 48:13–14; 45:5', given: 'The Levites: 25,000 long, 10,000 broad, "over against the border of the priests".', read: 'The northern 10,000-cubit strip. (Which of the two 10,000 strips lies north is not stated — drawn per the traditional reading.)' },
  { ref: 'Ezekiel 48:15–17; 45:6', given: 'The remaining 5,000 broad × 25,000 long is common land for the city, its dwellings and open land; the city is in the midst, 4,500 on each of its four sides, with 250 of open land round it.', read: 'The southern 5,000-cubit strip: the city 4,500 cubits square (≈ 2.4 km / 1.5 mi) in its centre, 250 cubits of open land on each side.' },
  { ref: 'Ezekiel 48:18–19', given: 'The residue alongside the holy portion, 10,000 eastward and 10,000 westward, yields food for those who serve the city.', read: 'The two 10,000 × 5,000 plots either side of the city ("X").' },
  { ref: 'Ezekiel 45:2; 42:15–20', given: 'For the sanctuary, 500 by 500 square, and 50 cubits of open land round about. The outer wall of the temple house is measured with the reed: 500 reeds on each side.', read: 'The sanctuary drawn 500 reeds (≈ 1.6 km / 1 mi) square, 50 cubits of open land, at the centre of the priests\' strip.' },
  { ref: 'Ezekiel 47:1–8; Zechariah 14:8; Joel 3:18', given: 'Water issues from under the threshold of the house, eastward, goes down into the Arabah (the desert) and into the eastern sea, whose waters are healed. Zechariah: living waters go out from Jerusalem, half toward the former (eastern) sea.', read: 'The sanctuary must sit west of the Dead Sea at its latitude, on the watershed — the map anchors the city on Jerusalem, 31.78°N, and the square on its meridian.' },
  { ref: 'Ezekiel 48:35', given: '"The name of the city from that day shall be Yahawah Shamah" — יהוה שמה, Yahawah is there.', read: 'The "C" block.' },
];

// Cut lines and helpers for the bands (see below) — unchanged geometry code.

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
/**
 * Build the Ezekiel 48 layout. One reading only — every number is traced to
 * its verse in EZEKIEL_MEASURES above.
 * @returns {{ bands: Array, holy: Array, meta: object }} GeoJSON-ready rings.
 */
export function ezekielAllotment() {
  const holyKm = 25000 * CUBIT_M / 1000;                 // 48:20 — 25,000 cubits square ≈ 13.1 km
  const holyDeg = holyKm / KM_PER_DEG_LAT;
  const latTop = (EZ_NORTH[0][1] + EZ_NORTH[EZ_NORTH.length - 1][1]) / 2;   // ≈ 34.4
  const latBot = (EZ_SOUTH[0][1] + EZ_SOUTH[EZ_SOUTH.length - 1][1]) / 2;   // ≈ 30.95
  // City strip is the southern 5,000 of the square, so its centre is 22,500
  // down from the top; that centre is anchored on Jerusalem (47:1–8; Zech 14:8).
  const hTopAnch = JERUSALEM[1] + holyDeg * (22500 / 25000);
  const northDeg = (latTop - hTopAnch) / 7;               // 48:1–7 — seven tribes north of the offering
  const southDeg = (hTopAnch - holyDeg - latBot) / 5;     // 48:23–27 — five tribes south of it
  const unit = 'cubits', layout = 'anchored';

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
  let sqW = JERUSALEM[0] - holyLonDeg / 2;                // centred on Jerusalem's meridian
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
  const sanctKm = 500 * REED_M / 1000;                    // 45:2 with 42:20 — 500 reeds square ≈ 1.6 km
  const sanctSide = sanctKm / kmPerDegLon;
  const sanctSideLat = sanctKm / KM_PER_DEG_LAT;
  const midLon = (sqW + sqE) / 2;
  const cityW = midLon - holyLonDeg * (2250 / 25000), cityE = midLon + holyLonDeg * (2250 / 25000);
  const cityMidLat = (cityTop + cityBot) / 2;
  const cityN = cityMidLat + holyDeg * (2250 / 25000), cityS = cityMidLat - holyDeg * (2250 / 25000);
  const subW = midLon - holyLonDeg * (2500 / 25000), subE = midLon + holyLonDeg * (2500 / 25000);

  const holy = [
    { id:'ez-prince-w', kind:'prince', name:`${HW.nasi.tr} (the prince) — west`, short:`${HW.nasi.tr} ${HW.chalaqim.tr}`, en:"Prince's Portion", he: HW.nasi.he, ref:'Ezekiel 48:21', ring: bandClipLon(holyTop.cutTop, holyTop.cutBot, -180, sqW) },
    { id:'ez-prince-e', kind:'prince', name:`${HW.nasi.tr} (the prince) — east`, short:`${HW.nasi.tr} ${HW.chalaqim.tr}`, en:"Prince's Portion", he: HW.nasi.he, ref:'Ezekiel 48:21', ring: bandClipLon(holyTop.cutTop, holyTop.cutBot, sqE, 180) },
    { id:'ez-levites',  kind:'levites', name:`${HW.leviim.tr} (the Levites)`, short: HW.leviim.tr, en:'the Levites', he: HW.leviim.he, ref:'Ezekiel 48:13–14', ring: rect(sqW, sqE, levitesTop, levitesBot) },
    { id:'ez-priests',  kind:'priests', name:`${HW.kohanim.tr} (the priests), sons of ${HW.tzadoq.tr}`, short: HW.kohanim.tr, en:`the priests, sons of ${HW.tzadoq.tr}`, he: HW.kohanim.he, ref:'Ezekiel 48:10–12', ring: rect(sqW, sqE, priestsTop, priestsBot) },
    { id:'ez-food-w',   kind:'food', name:'Food for the city workers (west)', short:'Food', en:'for the city workers', ref:'Ezekiel 48:18–19', ring: rect(sqW, subW, cityTop, cityBot) },
    { id:'ez-food-e',   kind:'food', name:'Food for the city workers (east)', short:'Food', en:'for the city workers', ref:'Ezekiel 48:18–19', ring: rect(subE, sqE, cityTop, cityBot) },
    { id:'ez-suburbs',  kind:'suburbs', name:'Open land round the city', ref:'Ezekiel 48:17', ring: rect(subW, subE, cityTop, cityBot) },
    { id:'ez-city',     kind:'city', name:`${HW.ir.tr} (the city) — ${HW.yhwhShammah.tr}`, short: HW.ir.tr, en:`the city — ${HW.yhwhShammah.tr}`, he: HW.yhwhShammah.he, ref:'Ezekiel 48:15–16, 35', ring: rect(cityW, cityE, cityN, cityS) },
    { id:'ez-sanctuary', kind:'sanctuary', name:`${HW.miqdash.tr} (the sanctuary)`, short: HW.miqdash.tr, en:'the sanctuary', he: HW.miqdash.he, ref:'Ezekiel 48:10; 45:2',
      ring: rect(midLon - sanctSide / 2, midLon + sanctSide / 2, (priestsTop + priestsBot) / 2 + sanctSideLat / 2, (priestsTop + priestsBot) / 2 - sanctSideLat / 2) },
  ];

  return {
    bands, holy,
    meta: { unit, layout, holyKm, sanctKm, cityKm: 4500 * CUBIT_M / 1000, westLon, eastLon, northKm: northDeg * KM_PER_DEG_LAT, southKm: southDeg * KM_PER_DEG_LAT, latTop, latBot, square: [sqW, hTop, sqE, hBot], sanctuary: [midLon, (priestsTop + priestsBot) / 2], city: [midLon, cityMidLat] },
  };
}

export const HOLY_KIND_STYLE = {
  prince:    { color:'#f2c14e', opacity:0.55, label:'P' },   // gold — the prince's land (48:21–22)
  levites:   { color:'#b9a7e6', opacity:0.7,  label:'L' },   // lavender — the Levites (48:13)
  priests:   { color:'#e8aa55', opacity:0.75, label:'Z' },
  food:      { color:'#a8c686', opacity:0.7,  label:'X' },   // green — the city's farmland (48:18)
  suburbs:   { color:'#f5efe0', opacity:0.85, label:'' },
  city:      { color:'#4a9eff', opacity:0.9,  label:'C' },
  sanctuary: { color:'#e05555', opacity:1,    label:'S' },
};

// ── Biblical cities (idealized, conventional identifications) ────────────────
// [id, English, Hebrew, lon, lat, reference, note]
// B(id, name, he, lon, lat, history, note, prophecy) — `prophecy` is what the prophets (and the NT) say of the place, in canonical order
const B = (id, name, he, lon, lat, ref, note = '', proph = '') => ({ id, name, he, lon, lat, ref, note, proph, kind:'biblical' });
export const BIBLICAL_CITIES = [
  B('jabneel-judah', 'Jabneel', 'יבנאל', 34.74, 31.87, 'Joshua 15:11; 2 Chronicles 26:6', 'On Judah\'s northern border, "the border went out to Jabneel; and the goings out of the border were at the sea." Later Jabneh / Yavne (2 Chr 26:6). Modern Yavne.'),
  B('jabneel-naphtali', 'Jabneel (Naphtali)', 'יבנאל', 35.53, 32.71, 'Joshua 19:33', 'A second Jabneel, on Naphtali\'s border — a different town from Judah\'s Jabneel.'),
  B('jerusalem', 'Jerusalem', 'ירושלם', 35.235, 31.778, 'Joshua 15:8, 63; Judges 1:8; 2 Samuel 5:6–9; 1 Kings 8; 2 Kings 25:1–10; Ezra 1:2–3; Nehemiah 2', 'Jebus; on the Judah–Benjamin line.', 'Psalms 122; Isaiah 2:2–4; Isaiah 52:1–10; Isaiah 62; Jeremiah 3:17; Ezekiel 48:30–35; Daniel 9:24–27; Joel 3:16–21; Micah 4:1–8; Zechariah 8:1–8; Zechariah 12; Zechariah 14; Luke 21:20–24; Revelation 21:2, 10'),
  B('hebron', 'Hebron', 'חברון', 35.10, 31.53, 'Genesis 13:18; Genesis 23; Genesis 35:27; Numbers 13:22; Joshua 10:36; Joshua 14:13–15; Joshua 20:7; Judges 1:10; 2 Samuel 2:1–4; 2 Samuel 5:1–5; 2 Samuel 15:7–10', 'Kiriath-arba; Caleb\'s inheritance.'),
  B('beersheba', 'Beer-sheba', 'באר שבע', 34.79, 31.24, 'Genesis 21:22–33; Genesis 22:19; Genesis 26:23–33; Genesis 28:10; Genesis 46:1–5; Joshua 15:28; Joshua 19:2; Judges 20:1; 1 Samuel 8:2; 1 Kings 19:3', '', 'Amos 5:5; Amos 8:14'),
  B('jericho', 'Jericho', 'יריחו', 35.44, 31.87, 'Numbers 22:1; Deuteronomy 34:3; Joshua 2; Joshua 6; 1 Kings 16:34; 2 Kings 2:4–22', '', 'Luke 10:30; Luke 18:35; Luke 19:1–10; Hebrews 11:30'),
  B('gilgal', 'Gilgal', 'גלגל', 35.47, 31.88, 'Joshua 4:19–24; Joshua 5:2–12; Joshua 9:6; Joshua 10:6–9; Judges 2:1; 1 Samuel 7:16; 1 Samuel 10:8; 1 Samuel 11:14–15; 1 Samuel 13:4–15; 1 Samuel 15:12–33; 2 Samuel 19:15; 2 Kings 2:1', 'Israel\'s first camp west of the Jordan.', 'Hosea 4:15; Hosea 9:15; Hosea 12:11; Amos 4:4; Amos 5:5; Micah 6:5'),
  B('bethel', 'Bethel', 'בית אל', 35.22, 31.93, 'Genesis 12:8; Genesis 13:3; Genesis 28:10–22; Genesis 35:1–15; Joshua 8:9; Joshua 16:1; Judges 20:18–28; 1 Samuel 7:16; 1 Kings 12:28–33; 2 Kings 2:2–3; 2 Kings 23:15', 'Luz.', 'Jeremiah 48:13; Hosea 10:15; Hosea 12:4; Amos 3:14; Amos 4:4; Amos 5:5–6; Amos 7:10–13'),
  B('ai', 'Ai', 'עי', 35.257, 31.917, 'Genesis 12:8; Genesis 13:3; Joshua 7; Joshua 8; Ezra 2:28', '', 'Isaiah 10:28; Jeremiah 49:3'),
  B('gibeon', 'Gibeon', 'גבעון', 35.185, 31.847, 'Joshua 9; Joshua 10:1–14; Joshua 18:25; 2 Samuel 2:12–17; 2 Samuel 21:1–9; 1 Kings 3:4–15; 1 Chronicles 16:39', '', 'Isaiah 28:21; Jeremiah 28:1; Jeremiah 41:12–16'),
  B('ramah', 'Ramah', 'רמה', 35.23, 31.90, 'Joshua 18:25; Judges 4:5; 1 Samuel 1:19; 1 Samuel 7:17; 1 Samuel 15:34; 1 Samuel 19:18–24; 1 Kings 15:17–22', '', 'Isaiah 10:29; Jeremiah 31:15; Jeremiah 40:1; Hosea 5:8; Matthew 2:18'),
  B('mizpah', 'Mizpah', 'מצפה', 35.216, 31.885, 'Joshua 18:26; Judges 20:1; Judges 21:1; 1 Samuel 7:5–16; 1 Samuel 10:17; 1 Kings 15:22; 2 Kings 25:23–25; Jeremiah 40:6; Jeremiah 41', '', 'Hosea 5:1'),
  B('kiriath-jearim', 'Kiriath-jearim', 'קרית יערים', 35.11, 31.80, 'Joshua 9:17; Joshua 15:9, 60; Joshua 18:14–15; Judges 18:12; 1 Samuel 6:21; 1 Samuel 7:1–2; 1 Chronicles 13:5–6', '', 'Psalms 132:6; Jeremiah 26:20'),
  B('beth-shemesh', 'Beth-shemesh', 'בית שמש', 34.98, 31.75, 'Joshua 15:10; Joshua 19:22; Joshua 21:16; Judges 1:33; 1 Samuel 6:9–20; 1 Kings 4:9; 2 Kings 14:11–13', ''),
  B('timnah', 'Timnah', 'תמנה', 34.92, 31.79, 'Genesis 38:12–14; Joshua 15:10, 57; Joshua 19:43; Judges 14:1–5; 2 Chronicles 28:18', ''),
  B('ekron', 'Ekron', 'עקרון', 34.85, 31.78, 'Joshua 13:3; Joshua 15:11, 45; Joshua 19:43; Judges 1:18; 1 Samuel 5:10; 1 Samuel 6:17; 1 Samuel 17:52; 2 Kings 1:2', 'Philistine city; named with Jabneel on Judah\'s border.', 'Jeremiah 25:20; Amos 1:8; Zephaniah 2:4; Zechariah 9:5–7'),
  B('ashdod', 'Ashdod', 'אשדוד', 34.655, 31.755, 'Joshua 11:22; Joshua 13:3; Joshua 15:47; 1 Samuel 5:1–7; 1 Samuel 6:17; 2 Chronicles 26:6; Nehemiah 13:23–24', 'Tel Ashdod (31.755°N 34.655°E), the ancient mound — about 5 km south of the modern city\'s centre, which was founded in 1956 on the coast to the north.', 'Isaiah 20:1; Jeremiah 25:20; Amos 1:8; Amos 3:9; Zephaniah 2:4; Zechariah 9:6; Acts 8:40'),
  B('ashkelon', 'Ashkelon', 'אשקלון', 34.55, 31.66, 'Joshua 13:3; Judges 1:18; Judges 14:19; 1 Samuel 6:17; 2 Samuel 1:20', '', 'Jeremiah 25:20; Jeremiah 47:5–7; Amos 1:8; Zephaniah 2:4–7; Zechariah 9:5'),
  B('gaza', 'Gaza', 'עזה', 34.46, 31.50, 'Genesis 10:19; Joshua 10:41; Joshua 15:47; Judges 1:18; Judges 16:1–3, 21–30; 1 Samuel 6:17; 1 Kings 4:24', '', 'Jeremiah 25:20; Jeremiah 47:1, 5; Amos 1:6–7; Zephaniah 2:4; Zechariah 9:5; Acts 8:26'),
  B('gath', 'Gath', 'גת', 34.847, 31.70, 'Joshua 11:22; Joshua 13:3; 1 Samuel 5:8; 1 Samuel 6:17; 1 Samuel 17:4; 1 Samuel 21:10; 1 Samuel 27:2; 2 Samuel 1:20; 2 Chronicles 26:6', '', 'Amos 6:2; Micah 1:10'),
  B('lachish', 'Lachish', 'לכיש', 34.85, 31.56, 'Joshua 10:3–35; Joshua 12:11; Joshua 15:39; 2 Kings 14:19; 2 Kings 18:14–17; 2 Chronicles 11:9', '', 'Isaiah 36:2; Jeremiah 34:7; Micah 1:13'),
  B('libnah', 'Libnah', 'לבנה', 34.87, 31.62, 'Numbers 33:20; Joshua 10:29–32; Joshua 12:15; Joshua 15:42; Joshua 21:13; 2 Kings 8:22; 2 Kings 19:8; 2 Kings 23:31', '', 'Isaiah 37:8'),
  B('debir', 'Debir', 'דבר', 35.02, 31.42, 'Joshua 10:38–39; Joshua 11:21; Joshua 12:13; Joshua 15:15–17, 49; Joshua 21:15; Judges 1:11–13', 'Kiriath-sepher.'),
  B('bethlehem', 'Bethlehem', 'בית לחם', 35.20, 31.70, 'Genesis 35:19; Judges 17:7; Ruth 1; Ruth 4:11; 1 Samuel 16:1–13; 1 Samuel 17:12', '', 'Micah 5:2; Matthew 2:1–6; Luke 2:4–15; John 7:42'),
  B('tekoa', 'Tekoa', 'תקוע', 35.22, 31.63, '2 Samuel 14:2; 2 Chronicles 11:6; 2 Chronicles 20:20', '', 'Jeremiah 6:1; Amos 1:1'),
  B('engedi', 'En-gedi', 'עין גדי', 35.39, 31.46, 'Joshua 15:62; 1 Samuel 23:29; 1 Samuel 24; 2 Chronicles 20:2', '', 'Song of Songs 1:14; Ezekiel 47:10'),
  B('arad', 'Arad', 'ערד', 35.13, 31.28, 'Numbers 21:1–3; Numbers 33:40; Joshua 12:14; Judges 1:16', ''),
  B('hormah', 'Hormah', 'חרמה', 34.90, 31.30, 'Numbers 14:45; Numbers 21:3; Deuteronomy 1:44; Joshua 12:14; Joshua 15:30; Joshua 19:4; Judges 1:17; 1 Samuel 30:30', ''),
  B('ziklag', 'Ziklag', 'צקלג', 34.70, 31.38, 'Joshua 15:31; Joshua 19:5; 1 Samuel 27:6; 1 Samuel 30; 2 Samuel 1:1; 2 Samuel 4:10; Nehemiah 11:28', ''),
  B('gerar', 'Gerar', 'גרר', 34.60, 31.38, 'Genesis 10:19; Genesis 20; Genesis 26:1–22; 2 Chronicles 14:13–14', ''),
  B('kadesh-barnea', 'Kadesh-barnea', 'קדש ברנע', 34.42, 30.65, 'Genesis 14:7; Numbers 13:26; Numbers 20:1–22; Numbers 27:14; Deuteronomy 1:2, 19–46; Joshua 10:41; Joshua 14:6–7', 'Meribath-kadesh — the south-west anchor of Ezekiel\'s border.', 'Psalms 29:8; Ezekiel 47:19; Ezekiel 48:28'),
  B('tamar', 'Tamar', 'תמר', 35.24, 30.78, '1 Kings 9:18', 'South-east anchor of Ezekiel\'s border.', 'Ezekiel 47:19; Ezekiel 48:28'),
  B('brook-of-egypt', 'Brook of Egypt', 'נחל מצרים', 33.80, 31.13, 'Genesis 15:18; Numbers 34:5; Joshua 15:4, 47; 1 Kings 8:65; 2 Kings 24:7', 'Wadi el-Arish.', 'Isaiah 27:12; Ezekiel 47:19; Ezekiel 48:28'),
  B('joppa', 'Joppa', 'יפו', 34.75, 32.05, 'Joshua 19:46; 2 Chronicles 2:16; Ezra 3:7; Jonah 1:3', '', 'Acts 9:36–43; Acts 10; Acts 11:5–13'),
  B('aphek', 'Aphek', 'אפק', 34.93, 32.10, 'Joshua 12:18; Joshua 13:4; 1 Samuel 4:1; 1 Samuel 29:1; 1 Kings 20:26–30; 2 Kings 13:17', ''),
  B('shiloh', 'Shiloh', 'שלה', 35.29, 32.06, 'Joshua 18:1–10; Joshua 22:9; Judges 21:19; 1 Samuel 1–4', 'Where the tabernacle stood and the land was divided.', 'Psalms 78:60; Jeremiah 7:12–14; Jeremiah 26:6–9'),
  B('shechem', 'Shechem', 'שכם', 35.28, 32.21, 'Genesis 12:6–7; Genesis 33:18–20; Genesis 34; Genesis 37:12–14; Joshua 20:7; Joshua 24:1, 25–32; Judges 9; 1 Kings 12:1, 25', '', 'Psalms 60:6; Hosea 6:9; John 4:5–6'),
  B('ebal', 'Mount Ebal', 'עיבל', 35.27, 32.23, 'Deuteronomy 11:29; Deuteronomy 27:4–13; Joshua 8:30–35', ''),
  B('gerizim', 'Mount Gerizim', 'גרזים', 35.27, 32.20, 'Deuteronomy 11:29; Deuteronomy 27:12; Joshua 8:33; Judges 9:7', '', 'John 4:20–21'),
  B('samaria', 'Samaria', 'שמרון', 35.19, 32.28, '1 Kings 16:24–29; 1 Kings 20; 1 Kings 22:37–38; 2 Kings 6:24–33; 2 Kings 17:5–24', '', 'Isaiah 7:9; Isaiah 9:9; Isaiah 10:9–11; Isaiah 28:1–4; Jeremiah 31:5; Ezekiel 16:46–55; Ezekiel 23:4–10; Hosea 7:1; Hosea 8:5–6; Hosea 13:16; Amos 3:9–12; Amos 4:1; Amos 6:1; Micah 1:1–7; John 4:4–42; Acts 1:8; Acts 8:5–25'),
  B('dor', 'Dor', 'דור', 34.92, 32.62, 'Joshua 11:2; Joshua 12:23; Joshua 17:11; Judges 1:27; 1 Kings 4:11', ''),
  B('megiddo', 'Megiddo', 'מגדון', 35.18, 32.58, 'Joshua 12:21; Joshua 17:11; Judges 1:27; Judges 5:19; 1 Kings 4:12; 1 Kings 9:15; 2 Kings 9:27; 2 Kings 23:29–30; 2 Chronicles 35:22', '', 'Zechariah 12:11; Revelation 16:16'),
  B('taanach', 'Taanach', 'תענך', 35.22, 32.52, 'Joshua 12:21; Joshua 17:11; Joshua 21:25; Judges 1:27; Judges 5:19; 1 Kings 4:12', ''),
  B('jezreel', 'Jezreel', 'יזרעאל', 35.33, 32.56, 'Joshua 19:18; 1 Samuel 29:1; 1 Kings 18:45–46; 1 Kings 21; 2 Kings 9:10–37; 2 Kings 10:1–11', '', 'Hosea 1:4–5, 11; Hosea 2:22'),
  B('shunem', 'Shunem', 'שונם', 35.33, 32.61, 'Joshua 19:18; 1 Samuel 28:4; 1 Kings 1:3; 2 Kings 4:8–37', ''),
  B('endor', 'En-dor', 'עין דר', 35.38, 32.63, 'Joshua 17:11; 1 Samuel 28:7', '', 'Psalms 83:10'),
  B('beth-shean', 'Beth-shean', 'בית שאן', 35.50, 32.50, 'Joshua 17:11, 16; Judges 1:27; 1 Samuel 31:10–12; 1 Kings 4:12', ''),
  B('tabor', 'Mount Tabor', 'תבור', 35.39, 32.69, 'Joshua 19:22; Judges 4:6–14; Judges 8:18; 1 Samuel 10:3', '', 'Psalms 89:12; Jeremiah 46:18; Hosea 5:1'),
  B('carmel', 'Mount Carmel', 'כרמל', 35.00, 32.73, 'Joshua 12:22; Joshua 19:26; 1 Kings 18:19–46; 2 Kings 2:25; 2 Kings 4:25', '', 'Song of Songs 7:5; Isaiah 33:9; Isaiah 35:2; Jeremiah 46:18; Jeremiah 50:19; Amos 1:2; Amos 9:3; Micah 7:14; Nahum 1:4'),
  B('chinnereth', 'Chinnereth', 'כנרת', 35.55, 32.87, 'Numbers 34:11; Deuteronomy 3:17; Joshua 11:2; Joshua 13:27; Joshua 19:35; 1 Kings 15:20', 'On the Sea of Chinnereth (Galilee).', 'Isaiah 9:1; Matthew 4:13–18; Luke 5:1'),
  B('acco', 'Acco', 'עכו', 35.07, 32.93, 'Judges 1:31', '', 'Acts 21:7'),
  B('achzib', 'Achzib', 'אכזיב', 35.10, 33.05, 'Joshua 19:29; Judges 1:31', '', 'Micah 1:14'),
  B('tyre', 'Tyre', 'צר', 35.19, 33.27, 'Joshua 19:29; 2 Samuel 5:11; 1 Kings 5; 1 Kings 7:13–14; 1 Kings 9:11', '', 'Psalms 45:12; Psalms 87:4; Isaiah 23; Jeremiah 25:22; Jeremiah 47:4; Ezekiel 26; Ezekiel 27; Ezekiel 28:1–19; Joel 3:4–8; Amos 1:9–10; Zechariah 9:2–4; Matthew 11:21–22; Matthew 15:21–28; Acts 21:3–6'),
  B('sidon', 'Sidon', 'צידון', 35.37, 33.56, 'Genesis 10:15, 19; Joshua 11:8; Joshua 19:28; Judges 1:31; Judges 10:6; 1 Kings 11:1; 1 Kings 16:31; 1 Kings 17:9', '"Great Sidon."', 'Isaiah 23:2–12; Jeremiah 25:22; Jeremiah 27:3; Jeremiah 47:4; Ezekiel 27:8; Ezekiel 28:20–24; Joel 3:4–8; Zechariah 9:2; Matthew 11:21–22; Luke 4:26; Acts 27:3'),
  B('hazor', 'Hazor', 'חצור', 35.57, 33.02, 'Joshua 11:1–13; Joshua 19:36; Judges 4:2, 17; 1 Kings 9:15; 2 Kings 15:29', '"Head of all those kingdoms."', 'Jeremiah 49:28–33'),
  B('kedesh', 'Kedesh', 'קדש', 35.53, 33.11, 'Joshua 12:22; Joshua 19:37; Joshua 20:7; Joshua 21:32; Judges 4:6–11; 2 Kings 15:29', 'City of refuge.'),
  B('dan', 'Dan (Laish)', 'דן', 35.65, 33.25, 'Genesis 14:14; Joshua 19:47; Judges 18; Judges 20:1; 1 Kings 12:29–30; 1 Kings 15:20', '', 'Jeremiah 4:15; Jeremiah 8:16; Amos 8:14; Ezekiel 48:1'),
  B('hermon', 'Mount Hermon', 'חרמון', 35.86, 33.42, 'Deuteronomy 3:8–9; Joshua 11:3, 17; Joshua 12:1; Joshua 13:5, 11', '', 'Psalms 42:6; Psalms 89:12; Psalms 133:3; Song of Songs 4:8'),
  B('baal-gad', 'Baal-gad', 'בעל גד', 35.72, 33.40, 'Joshua 11:17; Joshua 12:7; Joshua 13:5', ''),
  B('golan', 'Golan', 'גולן', 35.80, 32.85, 'Deuteronomy 4:43; Joshua 20:8; Joshua 21:27', 'City of refuge.'),
  B('ashtaroth', 'Ashtaroth', 'עשתרות', 36.02, 32.80, 'Genesis 14:5; Deuteronomy 1:4; Joshua 9:10; Joshua 12:4; Joshua 13:12, 31; 1 Chronicles 6:71', ''),
  B('edrei', 'Edrei', 'אדרעי', 36.10, 32.62, 'Numbers 21:33–35; Deuteronomy 1:4; Deuteronomy 3:1–10; Joshua 12:4; Joshua 13:12, 31; Joshua 19:37', ''),
  B('ramoth-gilead', 'Ramoth-gilead', 'ראמת גלעד', 35.85, 32.55, 'Deuteronomy 4:43; Joshua 20:8; Joshua 21:38; 1 Kings 4:13; 1 Kings 22:1–38; 2 Kings 8:28; 2 Kings 9:1–14', 'City of refuge.'),
  B('jabesh-gilead', 'Jabesh-gilead', 'יבש גלעד', 35.65, 32.40, 'Judges 21:8–14; 1 Samuel 11; 1 Samuel 31:11–13; 2 Samuel 2:4–7; 2 Samuel 21:12', ''),
  B('mahanaim', 'Mahanaim', 'מחנים', 35.65, 32.20, 'Genesis 32:1–2; Joshua 13:26, 30; Joshua 21:38; 2 Samuel 2:8; 2 Samuel 17:24–27; 1 Kings 2:8', '', 'Song of Songs 6:13'),
  B('succoth', 'Succoth', 'סכות', 35.62, 32.17, 'Genesis 33:17; Joshua 13:27; Judges 8:5–16; 1 Kings 7:46', '', 'Psalms 60:6; Psalms 108:7'),
  B('penuel', 'Penuel', 'פנואל', 35.70, 32.17, 'Genesis 32:22–32; Judges 8:8–17; 1 Kings 12:25', '', 'Hosea 12:4'),
  B('jazer', 'Jazer', 'יעזר', 35.78, 32.05, 'Numbers 21:32; Numbers 32:1–3, 35; Joshua 13:25; Joshua 21:39; 2 Samuel 24:5; 1 Chronicles 26:31', '', 'Isaiah 16:8–9; Jeremiah 48:32'),
  B('rabbah', 'Rabbah', 'רבה', 35.93, 31.95, 'Deuteronomy 3:11; Joshua 13:25; 2 Samuel 11:1; 2 Samuel 12:26–31; 1 Chronicles 20:1', 'Rabbath-ammon; modern Amman.', 'Jeremiah 49:2–3; Ezekiel 21:20; Ezekiel 25:5; Amos 1:14'),
  B('heshbon', 'Heshbon', 'חשבון', 35.81, 31.80, 'Numbers 21:25–30; Deuteronomy 2:24–30; Joshua 12:2; Joshua 13:17; Joshua 21:39; Judges 11:19–26', '', 'Isaiah 15:4; Isaiah 16:8–9; Jeremiah 48:2, 34, 45; Jeremiah 49:3'),
  B('nebo', 'Mount Nebo', 'נבו', 35.73, 31.77, 'Numbers 32:3, 38; Deuteronomy 32:49; Deuteronomy 34:1–6', '', 'Isaiah 15:2; Jeremiah 48:1, 22'),
  B('medeba', 'Medeba', 'מידבא', 35.79, 31.72, 'Numbers 21:30; Joshua 13:9, 16; 1 Chronicles 19:7', '', 'Isaiah 15:2'),
  B('bezer', 'Bezer', 'בצר', 35.90, 31.62, 'Deuteronomy 4:43; Joshua 20:8; Joshua 21:36', 'City of refuge.'),
  B('dibon', 'Dibon', 'דיבן', 35.78, 31.50, 'Numbers 21:30; Numbers 32:3, 34; Joshua 13:9, 17', '', 'Isaiah 15:2, 9; Jeremiah 48:18, 22'),
  B('aroer', 'Aroer', 'ערער', 35.83, 31.47, 'Deuteronomy 2:36; Joshua 12:2; Joshua 13:9, 16; Judges 11:26; 2 Samuel 24:5; 2 Kings 10:33', 'On the Arnon.', 'Isaiah 17:2; Jeremiah 48:19'),
  // Ezekiel's northern landmarks
  B('damascus', 'Damascus', 'דמשק', 36.30, 33.51, 'Genesis 14:15; Genesis 15:2; 2 Samuel 8:5–6; 1 Kings 11:24; 2 Kings 5; 2 Kings 16:9; Ezekiel 47:16', '', 'Isaiah 7:8; Isaiah 8:4; Isaiah 17:1–3; Jeremiah 49:23–27; Ezekiel 27:18; Amos 1:3–5; Zechariah 9:1; Acts 9:1–25'),
  B('berothah', 'Berothah', 'ברותה', 35.98, 33.78, '2 Samuel 8:8; Ezekiel 47:16', ''),
  B('lebo-hamath', 'Lebo-hamath', 'לבוא חמת', 36.20, 34.19, 'Numbers 13:21; Numbers 34:8; Joshua 13:5; Judges 3:3; 1 Kings 8:65; 2 Kings 14:25', '"The entrance of Hamath."', 'Amos 6:14; Ezekiel 47:15–20; Ezekiel 48:1'),
  B('hethlon', 'Hethlon', 'חתלן', 36.00, 34.45, 'Ezekiel 47:15; Ezekiel 48:1', ''),
  B('zedad', 'Zedad', 'צדד', 36.92, 34.31, 'Numbers 34:8; Ezekiel 47:15', ''),
  B('hazar-enan', 'Hazar-enan', 'חצר עינן', 37.24, 34.23, 'Numbers 34:9–10; Ezekiel 47:17; Ezekiel 48:1', 'North-east corner of Ezekiel\'s border.'),
  B('hauran', 'Hauran', 'חורן', 36.50, 32.75, 'Ezekiel 47:16, 18', ''),
].map((c) => ({ ...c, paleo: compoundPaleo(c.he), translit: translitOf(c.he) }));

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
  M('ashdod-modern', 'Ashdod', 'Israel', 34.65, 31.80, '≈ 225k', 'City centre (31.80°N 34.65°E); Tel Ashdod, the biblical site, lies ≈ 5 km south — which is why the two dots can fall in different portions.'),
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

// ── Nations & lands beyond the borders (for search + distance) ───────────────
// Biblical names with their Hebrew spelling; NT-era Greek/Roman places use the
// Hebrew-NT spelling. Coordinates are a conventional centre (a capital or the
// best-known site), not a boundary.
// R(id, name, he, lon, lat, history, note, prophecy, iso)
//   history  — where the place enters the story (Genesis 10 table of nations, patriarchs, kings…)
//   prophecy — what the prophets say about it, in canonical order, through the New Testament
//   iso      — the modern country whose border is drawn (purple) when the place is selected
const R = (id, name, he, lon, lat, ref, note = '', proph = '', iso = null) => ({ id, name, he, lon, lat, ref, note, proph, iso, kind:'region' });
export const REGIONS = [
  R('greece', 'Greece (Javan)', 'יון', 23.73, 37.98, 'Genesis 10:2; 1 Chronicles 1:5; Ezekiel 27:13', 'Athens shown. Javan, son of Japheth — the Ionians / Greeks.',
    'Isaiah 66:19; Daniel 7:6; Daniel 8:5–8, 21–22; Daniel 10:20; Daniel 11:2–4; Joel 3:6; Zechariah 9:13; 1 Maccabees 1:1–10; 1 Maccabees 8:17–32; Acts 17:16–34; Acts 20:2', 'GRC'),
  R('egypt', 'Egypt (Mizraim)', 'מצרים', 31.23, 30.05, 'Genesis 10:6; Genesis 12:10; Genesis 46:6; Exodus 1; Exodus 12:40–41; 1 Kings 3:1', 'Memphis / Cairo shown.',
    'Isaiah 19; Jeremiah 46; Ezekiel 29; Ezekiel 30; Ezekiel 32; Hosea 11:1; Joel 3:19; Zechariah 10:10–11; Zechariah 14:18–19; Matthew 2:13–15', 'EGY'),
  R('assyria', 'Assyria (Asshur)', 'אשור', 43.26, 35.46, 'Genesis 2:14; Genesis 10:11; 2 Kings 15:29; 2 Kings 17:5–6; 2 Kings 18:13', 'The city of Asshur on the Tigris.',
    'Isaiah 10:5–19; Isaiah 14:24–27; Isaiah 19:23–25; Isaiah 30:31; Micah 5:5–6; Nahum 1–3; Zephaniah 2:13–15; Zechariah 10:10–11', 'IRQ'),
  R('nineveh', 'Nineveh', 'נינוה', 43.15, 36.36, 'Genesis 10:11; 2 Kings 19:36; Jonah 1:2; Jonah 3', '',
    'Nahum 1–3; Zephaniah 2:13–15; Matthew 12:41', 'IRQ'),
  R('babylon', 'Babylon (Babel)', 'בבל', 44.42, 32.54, 'Genesis 10:10; Genesis 11:1–9; 2 Kings 20:12–18; 2 Kings 24:1; 2 Kings 25; Daniel 1:1', '',
    'Isaiah 13; Isaiah 14:3–23; Isaiah 21:1–10; Isaiah 47; Jeremiah 25:11–12; Jeremiah 50; Jeremiah 51; Daniel 2:36–38; Daniel 5; Habakkuk 1:6; Zechariah 2:7; Revelation 17; Revelation 18', 'IRQ'),
  R('ur', 'Ur of the Chaldees', 'אור', 46.10, 30.96, 'Genesis 11:28–31; Genesis 15:7; Nehemiah 9:7', '', '', 'IRQ'),
  R('haran', 'Haran', 'חרן', 39.03, 36.87, 'Genesis 11:31; Genesis 12:4; Genesis 28:10; Genesis 29:4; 2 Kings 19:12', '', 'Ezekiel 27:23; Acts 7:2–4', 'TUR'),
  R('ararat', 'Ararat', 'אררט', 44.30, 39.70, 'Genesis 8:4; 2 Kings 19:37', 'Mount Ararat shown (Urartu).', 'Jeremiah 51:27', 'TUR'),
  R('persia', 'Persia (Paras)', 'פרס', 52.89, 29.93, '2 Chronicles 36:20–23; Ezra 1:1–4; Esther 1:1', 'Persepolis shown.',
    'Isaiah 44:28; Isaiah 45:1–4; Ezekiel 38:5; Daniel 8:20; Daniel 10:13, 20; Daniel 11:2', 'IRN'),
  R('media', 'Media (Madai)', 'מדי', 48.51, 34.80, 'Genesis 10:2; 2 Kings 17:6; Ezra 6:2', 'Ecbatana / Hamadan shown.',
    'Isaiah 13:17; Isaiah 21:2; Jeremiah 51:11, 28; Daniel 5:28; Daniel 6:8; Daniel 8:20; Acts 2:9', 'IRN'),
  R('elam', 'Elam', 'עילם', 48.25, 32.19, 'Genesis 10:22; Genesis 14:1; Ezra 4:9', 'Shushan / Susa shown.',
    'Isaiah 11:11; Isaiah 21:2; Isaiah 22:6; Jeremiah 25:25; Jeremiah 49:34–39; Ezekiel 32:24–25; Daniel 8:2; Acts 2:9', 'IRN'),
  R('kittim', 'Kittim (Cyprus)', 'כתים', 33.38, 35.13, 'Genesis 10:4; 1 Chronicles 1:7', '',
    'Numbers 24:24; Isaiah 23:1, 12; Jeremiah 2:10; Ezekiel 27:6; Daniel 11:30; Acts 13:4', 'CYP'),
  R('tarshish', 'Tarshish', 'תרשיש', -6.03, 36.85, 'Genesis 10:4; 1 Kings 10:22; 2 Chronicles 9:21; Jonah 1:3', 'Placed at Tartessos in southern Spain — one of several identifications.',
    'Psalms 72:10; Isaiah 2:16; Isaiah 23:1–14; Isaiah 60:9; Isaiah 66:19; Jeremiah 10:9; Ezekiel 27:12, 25; Ezekiel 38:13', 'ESP'),
  R('cush', 'Cush (Ethiopia)', 'כוש', 33.75, 16.93, 'Genesis 2:13; Genesis 10:6–8; 2 Kings 19:9; 2 Chronicles 14:9', 'Meroë shown.',
    'Psalms 68:31; Isaiah 11:11; Isaiah 18; Isaiah 20:3–5; Isaiah 45:14; Ezekiel 30:4–9; Ezekiel 38:5; Amos 9:7; Nahum 3:9; Zephaniah 2:12; Zephaniah 3:10; Acts 8:27', 'SDN'),
  R('sheba', 'Sheba', 'שבא', 45.33, 15.46, 'Genesis 10:7, 28; Genesis 25:3; 1 Kings 10:1–13', 'Marib shown.',
    'Job 6:19; Psalms 72:10, 15; Isaiah 60:6; Jeremiah 6:20; Ezekiel 27:22–23; Ezekiel 38:13; Joel 3:8; Matthew 12:42', 'YEM'),
  R('put', 'Put (Libya)', 'פוט', 21.86, 32.82, 'Genesis 10:6; 1 Chronicles 1:8', 'Cyrene shown.',
    'Jeremiah 46:9; Ezekiel 27:10; Ezekiel 30:5; Ezekiel 38:5; Nahum 3:9; Acts 2:10', 'LBY'),
  R('lud', 'Lud (Lydia)', 'לוד', 28.04, 38.49, 'Genesis 10:13, 22; 1 Chronicles 1:11, 17', 'Sardis shown.',
    'Isaiah 66:19; Jeremiah 46:9; Ezekiel 27:10; Ezekiel 30:5; Revelation 3:1–6', 'TUR'),
  R('edom', 'Edom', 'אדום', 35.62, 30.73, 'Genesis 25:30; Genesis 32:3; Genesis 36:1–9; Numbers 20:14–21; Deuteronomy 2:4–8; Deuteronomy 23:7; 1 Samuel 14:47; 2 Samuel 8:13–14; 2 Kings 8:20–22; 2 Chronicles 28:17', 'Bozrah region. Esau\'s line; Mount Seir.',
    'Psalms 137:7; Isaiah 11:14; Isaiah 21:11–12; Isaiah 34:5–17; Isaiah 63:1–6; Jeremiah 49:7–22; Lamentations 4:21–22; Ezekiel 25:12–14; Ezekiel 35; Ezekiel 36:5; Joel 3:19; Amos 1:11–12; Amos 9:12; Obadiah 1; Malachi 1:2–5', 'JOR'),
  R('moab', 'Moab', 'מואב', 35.75, 31.35, 'Genesis 19:37; Numbers 22; Numbers 23; Numbers 24; Numbers 25:1–3; Deuteronomy 2:9; Deuteronomy 34:1–6; Judges 3:12–30; Ruth 1; 2 Samuel 8:2; 2 Kings 3', '',
    'Isaiah 11:14; Isaiah 15; Isaiah 16; Isaiah 25:10–12; Jeremiah 9:26; Jeremiah 25:21; Jeremiah 48; Ezekiel 25:8–11; Amos 2:1–3; Zephaniah 2:8–11; Daniel 11:41', 'JOR'),
  R('ammon', 'Ammon', 'עמון', 35.93, 31.95, 'Genesis 19:38; Deuteronomy 2:19; Judges 11; 1 Samuel 11; 2 Samuel 10; 2 Samuel 12:26–31; Nehemiah 4:7', '',
    'Isaiah 11:14; Jeremiah 9:26; Jeremiah 25:21; Jeremiah 49:1–6; Ezekiel 21:28–32; Ezekiel 25:1–7; Amos 1:13–15; Zephaniah 2:8–11; Daniel 11:41', 'JOR'),
  R('philistia', 'Philistia', 'פלשת', 34.60, 31.60, 'Genesis 10:14; Genesis 21:32; Genesis 26:1; Exodus 13:17; Exodus 15:14; Joshua 13:2–3; Judges 13:1; Judges 16; 1 Samuel 4; 1 Samuel 17', 'The five lords: Gaza, Ashkelon, Ashdod, Ekron, Gath.',
    'Psalms 60:8; Isaiah 2:6; Isaiah 11:14; Isaiah 14:28–32; Jeremiah 25:20; Jeremiah 47; Ezekiel 25:15–17; Joel 3:4–8; Amos 1:6–8; Obadiah 1:19; Zephaniah 2:4–7; Zechariah 9:5–7', null),
  R('sinai', 'Mount Sinai', 'סיני', 33.97, 28.54, 'Exodus 3:1; Exodus 19; Exodus 20; Exodus 24; Exodus 34; Numbers 10:12; Deuteronomy 33:2; 1 Kings 19:8', 'Jebel Musa shown — the traditional site. Horeb.',
    'Judges 5:5; Psalms 68:8, 17; Habakkuk 3:3; Malachi 4:4; Acts 7:30–38; Galatians 4:24–25; Hebrews 12:18–22', 'EGY'),
  R('arabia', 'Arabia', 'ערב', 37.92, 26.61, 'Genesis 25:1–6, 12–18; 1 Kings 10:15; 2 Chronicles 9:14; 2 Chronicles 17:11; Nehemiah 2:19', 'Dedan / al-ʿUla shown. Ishmael and Keturah\'s sons.',
    'Isaiah 13:20; Isaiah 21:13–17; Isaiah 60:6–7; Jeremiah 25:23–24; Jeremiah 49:28–33; Ezekiel 27:20–21; Ezekiel 38:13; Acts 2:11; Galatians 1:17; Galatians 4:25', 'SAU'),
  R('ophir', 'Ophir', 'אופיר', 44.0, 14.5, 'Genesis 10:29; 1 Kings 9:28; 1 Kings 10:11; 1 Kings 22:48; 1 Chronicles 29:4', 'Location unknown — placed in southern Arabia, one of several proposals.',
    'Job 22:24; Job 28:16; Psalms 45:9; Isaiah 13:12', 'YEM'),
  R('rome', 'Rome', 'רומי', 12.49, 41.89, 'Acts 2:10; Acts 18:2; Acts 23:11; Acts 28:14–16; Romans 1:7', 'Hebrew-NT spelling.',
    'Daniel 2:40–44; Daniel 7:7, 19–25; Daniel 9:26; Luke 2:1; Luke 21:20–24; 2 Timothy 1:17', 'ITA'),
  R('athens', 'Athens', 'אתינס', 23.73, 37.98, 'Acts 17:15–34; 1 Thessalonians 3:1', 'Hebrew-NT spelling.', '', 'GRC'),
  R('corinth', 'Corinth', 'קורנתוס', 22.88, 37.91, 'Acts 18:1–18; 1 Corinthians 1:2; 2 Corinthians 1:1', 'Hebrew-NT spelling.', '', 'GRC'),
  R('ephesus', 'Ephesus', 'אפסוס', 27.34, 37.94, 'Acts 18:19–21; Acts 19; Acts 20:17–38; Ephesians 1:1; 1 Timothy 1:3', 'Hebrew-NT spelling.', 'Revelation 1:11; Revelation 2:1–7', 'TUR'),
  R('antioch', 'Antioch', 'אנטיוכיא', 36.16, 36.20, 'Acts 11:19–30; Acts 13:1–3; Acts 15:22–35; Galatians 2:11', 'Hebrew-NT spelling. Where the disciples were first called Christians.', '', 'TUR'),
  R('patmos', 'Patmos', 'פטמוס', 26.55, 37.31, 'Revelation 1:9', 'Hebrew-NT spelling.', 'Revelation 1:9–20', 'GRC'),
  R('tarsus', 'Tarsus', 'טרסוס', 34.90, 36.92, 'Acts 9:11, 30; Acts 11:25; Acts 21:39; Acts 22:3', 'Hebrew-NT spelling. Paul\'s home city.', '', 'TUR'),
  R('alexandria', 'Alexandria', 'אלכסנדריא', 29.92, 31.20, 'Acts 6:9; Acts 18:24; Acts 27:6; Acts 28:11', 'Hebrew-NT spelling.', '', 'EGY'),
].map((c) => ({ ...c, paleo: compoundPaleo(c.he), translit: translitOf(c.he) }));

// ── Twins: a biblical city and the town that stands there today ───────────────
// rel 'same' — one site: the map draws ONE dot (the biblical one; the modern dot is
//              folded into it) and the card is split biblical | today.
// rel 'near' — a different foundation a few km away (Tel Ashdod vs the 1956 city,
//              Shechem vs Neapolis/Nablus): two dots, and both cards say how far
//              apart they are, so nobody takes them for the same place.
// name — how the name travelled from the paleo spelling to today's, in one line.
const T = (modern, rel, name) => ({ modern, rel, name });
export const TWINS = {
  'jabneel-judah': T('yavne', 'same', 'Yaban-Al (Joshua 15:11) → Yabanah / Jabneh (2 Chronicles 26:6) → Greek Iamnia → Yavne.'),
  'beth-shean':    T('beit-shean', 'same', 'Bayath-Shaan → Greek Scythopolis → Arabic Beisan → Beit She\'an: the biblical name restored.'),
  'bethlehem':     T('bethlehem-modern', 'same', 'Bayath-Lacham → Greek Βηθλεέμ → Bethlehem; Arabic Beit Lahm keeps both words.'),
  'brook-of-egypt':T('el-arish', 'same', 'Nachal Matzarayam is the wadi (Wadi el-Arish); El-Arish is the town at its mouth.'),
  'edrei':         T('daraa', 'same', 'Adaraiy → Adraa → Daraa: the consonants ד־ר־ע kept, the opening א dropped.'),
  'gaza':          T('gaza-city', 'same', 'Izah (עזה) → Greek Γάζα (the ע heard as g) → Gaza.'),
  'hebron':        T('hebron-modern', 'same', 'Chabarawan → Hebron; Arabic al-Khalil, "the friend", for Abaraham (Isaiah 41:8).'),
  'rabbah':        T('amman', 'same', 'Rabah (Rabbath-Ammon) → Greek Philadelphia → Amman: the people\'s name, Ammon, outlived the city\'s.'),
  'ramoth-gilead': T('irbid', 'same', 'Raamath Galaid → Irbid — a conventional identification (Tell er-Rumeith / Irbid), not a certain one.'),
  'sidon':         T('sidon-modern', 'same', 'Tzayadawan → Greek Σιδών → Sidon; Arabic Saida keeps the root ص־ي־د.'),
  'acco':          T('acre', 'same', 'Ikaw → Greek Ptolemais → Acre; Hebrew Akko keeps the old name.'),
  'damascus':      T('damascus-modern', 'same', 'Damashaq → Greek Δαμασκός → Damascus; Arabic Dimashq keeps the consonants.'),
  'medeba':        T('madaba', 'same', 'Mayadabaa → Madaba: the same consonants מ־ד־ב־א.'),
  'tyre':          T('tyre-modern', 'same', 'Tzar (צר, "rock") → Greek Τύρος → Tyre; Arabic Sour keeps the ص.'),
  'beersheba':     T('beersheba-modern', 'same', 'Baar-Shabai → Beersheba / Be\'er Sheva; the ancient tel lies east of the modern centre.'),
  'jericho':       T('jericho-modern', 'same', 'Yarayachaw → Greek Ἰεριχώ → Jericho; the tel (Tell es-Sultan) is at the modern town\'s northern edge.'),
  'shechem':       T('nablus', 'near', 'Shakam → Greek Neapolis ("new city", founded AD 72 two km west of the tel) → Arabic Nablus: a different name because it is a different foundation.'),
  'ashkelon':      T('ashkelon-modern', 'near', 'Ashaqalawan → Greek Ἀσκάλων → Ashkelon; the ancient site is the seaside park, the modern city grew 2 km inland.'),
  'jerusalem':     T('jerusalem-modern', 'near', 'Yarawashalam → Greek Ἱεροσόλυμα → Jerusalem; the biblical dot is the City of David and the Temple Mount, the modern one the city centre.'),
  'ashdod':        T('ashdod-modern', 'near', 'Ashadawad → Greek Ἄζωτος (Azotus, Acts 8:40) → Ashdod; Tel Ashdod is 5 km south of the city founded in 1956.'),
  'joppa':         T('tel-aviv', 'near', 'Yapaw → Greek Ἰόππη → Joppa / Jaffa (Yafo); Tel Aviv grew north of it from 1909.'),
  'aphek':         T('petah-tikva', 'near', 'Apaq (Tel Afek, later Antipatris) lies 4 km from Petah Tikva\'s centre.'),
  'arad':          T('arad-modern', 'near', 'Irad → Arad; Tel Arad is 8 km west of the modern town (1962).'),
};
const TWIN_OF_MODERN = Object.fromEntries(Object.entries(TWINS).map(([b, t]) => [t.modern, b]));
/** { biblical, modern, rel, name, km } for either half of a twin pair, else null. */
export function twinOf(place) {
  if (!place) return null;
  const bId = place.kind === 'biblical' ? place.id : place.kind === 'modern' ? TWIN_OF_MODERN[place.id] : null;
  const t = bId && TWINS[bId];
  if (!t) return null;
  const biblical = BIBLICAL_CITIES.find((c) => c.id === bId), modern = MODERN_CITIES.find((c) => c.id === t.modern);
  if (!biblical || !modern) return null;
  return { biblical, modern, rel: t.rel, name: t.name, km: haversineKm([biblical.lon, biblical.lat], [modern.lon, modern.lat]) };
}

export const ALL_PLACES = [...BIBLICAL_CITIES, ...REGIONS, ...MODERN_CITIES];
/** Every place, A→Z by the name it is shown under (the app's transliteration for biblical names). */
export const PLACES_AZ = [...ALL_PLACES].sort((a, b) => (a.translit || a.name).localeCompare(b.translit || b.name, 'en', { sensitivity: 'base' }));

// ── Country outlines ─────────────────────────────────────────────────────────
// The `country` label on a modern city → ISO code in countries.json.
const COUNTRY_ISO = { 'Israel': 'ISR', 'West Bank': 'PSE', 'Gaza': 'PSE', 'Israel / West Bank': 'ISR', 'Golan (Druze)': 'ISR', 'Jordan': 'JOR', 'Lebanon': 'LBN', 'Syria': 'SYR', 'Egypt': 'EGY', 'Iraq': 'IRQ', 'Iran': 'IRN', 'Turkey': 'TUR', 'Greece': 'GRC', 'Cyprus': 'CYP', 'Saudi Arabia': 'SAU' };
/** ISO code of the modern country a place stands in (regions carry it; modern cities via their label; biblical cities by point-in-polygon). */
export function countryOf(place) {
  if (!place) return null;
  if (place.iso !== undefined) return place.iso;
  if (place.country && COUNTRY_ISO[place.country]) return COUNTRY_ISO[place.country];
  const pt = [place.lon, place.lat];
  for (const [iso, c] of Object.entries(countriesBase.countries)) {
    if (c.polys.some(([outer, ...holes]) => pointInRing(pt, outer) && !holes.some((h) => pointInRing(pt, h)))) return iso;
  }
  // Coastal towns (Tyre, Joppa, Dor…) can sit a hair seaward of the 50 m coastline: take the nearest border within ~15 km.
  let best = null, bestD = 0.15;
  for (const [iso, c] of Object.entries(countriesBase.countries)) {
    for (const [outer] of c.polys) for (const [x, y] of outer) {
      const d = Math.hypot(x - pt[0], (y - pt[1]));
      if (d < bestD) { bestD = d; best = iso; }
    }
  }
  return best;
}
// Israel, the West Bank and Gaza are outlined together, as one land, and named
// descriptively — the map draws no partition line through the land of the allotments.
const OUTLINE_GROUP = { ISR: ['ISR', 'PSE'], PSE: ['ISR', 'PSE'] };
const GROUP_NAME = { ISR: 'Israel / West Bank / Gaza', PSE: 'Israel / West Bank / Gaza' };
/** GeoJSON MultiPolygon feature of the country (or group of territories) to outline — or null. */
export function countryFeature(iso) {
  const isos = (OUTLINE_GROUP[iso] || [iso]).filter((k) => countriesBase.countries[k]);
  if (!isos.length) return null;
  return { type: 'Feature', properties: { iso, name: countryName(iso) }, geometry: { type: 'MultiPolygon', coordinates: isos.flatMap((k) => countriesBase.countries[k].polys) } };
}
export function countryName(iso) { return GROUP_NAME[iso] || countriesBase.countries[iso]?.name || null; }

// ── Search ───────────────────────────────────────────────────────────────────
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u05B0-\u05C7]/g, '').replace(/-/g, ' ');
/** Search every place by English, transliteration, square Hebrew or paleo. Prefix hits rank first. */
export function searchPlaces(q, limit = 8) {
  const s = fold(q).trim();
  if (!s) return [];
  const scored = [];
  for (const p of ALL_PLACES) {
    const fields = [p.name, p.translit, p.he, p.paleo, p.country, p.ref].filter(Boolean).map(fold);
    let best = 0;
    for (const f of fields) {
      if (f === s) best = Math.max(best, 3);
      else if (f.startsWith(s) || f.split(/[\s(]+/).some((w) => w.startsWith(s))) best = Math.max(best, 2);
      else if (f.includes(s)) best = Math.max(best, 1);
    }
    if (best) scored.push([best, p]);
  }
  const rank = { biblical: 0, region: 1, modern: 2 };
  scored.sort((a, b) => (b[0] - a[0]) || (rank[a[1].kind] - rank[b[1].kind]) || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, limit).map(([, p]) => p);
}

// ── Distance ─────────────────────────────────────────────────────────────────
const EARTH_KM = 6371.0088;
export function haversineKm([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}
export function bearingDeg([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
export function compass(deg) {
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg / 22.5) % 16];
}
/** A day's journey on foot is reckoned at roughly 30 km / 20 mi. */
export function fmtDistance(km) {
  const mi = km * 0.621371;
  const days = km / 30;
  return { km, mi, days, text: `${km < 100 ? km.toFixed(1) : Math.round(km).toLocaleString()} km · ${mi < 100 ? mi.toFixed(1) : Math.round(mi).toLocaleString()} mi`, daysText: days < 1 ? `under a day's walk` : `≈ ${days < 10 ? days.toFixed(1) : Math.round(days)} days' journey on foot` };
}

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
/**
 * Where a label sits so it is INSIDE the shape: the centre of the largest label-shaped
 * box (≈ 2.5 : 1, wide) that fits wholly within the ring. A bent wedge or a band with a
 * notch (Ezekiel's Dan, whose north edge rises to Hamath) has its centroid on an edge;
 * the biggest inscribed box lands in the body of the shape instead.
 * Returns { lon, lat, west, east, latSpan } — west/east are the ends of the horizontal
 * run through the anchor (symmetric about it), latSpan the box height (ringLatSpan the whole
 * ring's): fitRegionLabels() sizes the label to those.
 */
const ANCHOR_CACHE = new WeakMap();
export function labelAnchor(ring, aspect = 2.5) {
  const hit = ANCHOR_CACHE.get(ring);
  if (hit) return hit;
  const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const W = maxLon - minLon, H = maxLat - minLat, cx0 = (minLon + maxLon) / 2, cy0 = (minLat + maxLat) / 2;
  // a box of half-height hh (half-width aspect·hh) centred at (x, y) lies inside the ring?
  const fits = (x, y, hh) => {
    const hw = hh * aspect;
    for (let i = 0; i <= 6; i++) {
      const t = -1 + i / 3;
      if (!pointInRing([x + hw * t, y - hh], ring) || !pointInRing([x + hw * t, y + hh], ring)) return false;
    }
    return pointInRing([x - hw, y], ring) && pointInRing([x + hw, y], ring);
  };
  let best = null;
  const N = 24;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const x = minLon + W * i / N, y = minLat + H * j / N;
    if (!pointInRing([x, y], ring)) continue;
    let lo = 0, hi = Math.min(H / 2, W / 2 / aspect);
    if (!fits(x, y, hi * 0.02)) continue;
    for (let k = 0; k < 11; k++) { const mid = (lo + hi) / 2; if (fits(x, y, mid)) lo = mid; else hi = mid; }
    // tie-break toward the shape's centre so equal boxes don't drift to a corner
    const d = Math.hypot((x - cx0) / (W || 1), (y - cy0) / (H || 1));
    const score = lo * (1 - 0.06 * d);
    if (!best || score > best.score) best = { score, lon: x, lat: y, hh: lo };
  }
  let out;
  if (!best) out = { lon: cx0, lat: cy0, west: cx0, east: cx0, latSpan: H, ringLatSpan: H };
  else {
    // the horizontal run through the anchor, made symmetric about it (the label is centred there)
    const xs = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j], [x2, y2] = ring[i];
      if ((y1 > best.lat) !== (y2 > best.lat)) xs.push(x1 + (best.lat - y1) * (x2 - x1) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    let half = best.hh * aspect;
    for (let k = 0; k + 1 < xs.length; k += 2) if (best.lon >= xs[k] && best.lon <= xs[k + 1]) half = Math.max(half, Math.min(best.lon - xs[k], xs[k + 1] - best.lon));
    out = { lon: best.lon, lat: best.lat, west: best.lon - half, east: best.lon + half, latSpan: best.hh * 2, ringLatSpan: H };
  }
  ANCHOR_CACHE.set(ring, out);
  return out;
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
