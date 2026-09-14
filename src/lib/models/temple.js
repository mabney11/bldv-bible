/**
 * temple.js — the bayath (house) Shalamah (Solomon) built for Yahawah, with its
 * courts and the king's own houses (1 Kings 6–7; 2 Chronicles 3–4): ALL the
 * model's data and both of its timelines, shared by the WebGL scene
 * (components/TempleScene.jsx) and the flat sheet (components/TempleSheet.jsx).
 * Nothing here draws; it says WHAT is where, and at time t of either story
 * what is standing, what is see-through and where the eye is.
 *
 * Units: ONE WORLD UNIT = ONE amah (cubit). The floor of the house is y = 0,
 * y up. The house faces mazarach (east) = +x: the awalam (porch) and the two
 * pillars are at +x, the dabayar (oracle) at −x. Nagab (south) = +z, toward the
 * default camera, so the façade and the south side both show. The inner court's
 * ground is y = −4 (the house stands on a four-cubit foundation).
 *
 * Every measure the text gives is used as given; where the text gives none the
 * model is idealised and SAYS so (each piece's `assumed`). Names are the app's
 * own transliterations from its rendering of these chapters; paleo from
 * strongs-roots.json.
 *
 * Two stories on one model:
 *   BUILD — 1 Kings 6–7 in the text's order: the yasad (foundation) is laid,
 *           walls and side chambers rise, the roof goes on, cedar within, gold
 *           over the cedar, the karawab, the doors, the courts, the king's
 *           houses, Chayaram's brass, the gold vessels; last, the arawan (ark)
 *           comes in (1 Kings 8:6).
 *   WALK  — in through the gate of the great court, past the mazabach (altar),
 *           the yam (sea), the makanawath (bases), between Yakayan and Baiz,
 *           through the awalam (porch) and the doors, down the hayakal between
 *           the lampstands, through the parakath (veil) into the dabayar
 *           beneath the wings of the karawab, to the arawan (ark).
 * Captions QUOTE the live text ({{Ref | from … to}}, lib/passages.js) — nothing
 * here is a copy of a verse.
 */

// ── Words of the text ────────────────────────────────────────────────────────
export const WORDS = {
  bayath:     { translit: 'Bayath',      paleo: '𐤁𐤉𐤕',   en: 'house',                 sn: 'H1004' },
  hayakal:    { translit: 'Hayakal',     paleo: '𐤄𐤉𐤊𐤋',  en: 'temple / the great hall', sn: 'H1964' },
  dabayar:    { translit: 'Dabayar',     paleo: '𐤃𐤁𐤉𐤓',  en: 'oracle / the inner room', sn: 'H1687' },
  awalam:     { translit: 'Awalam',      paleo: '𐤀𐤅𐤋𐤌',  en: 'porch',                 sn: 'H197' },
  yasad:      { translit: 'Yasad',       paleo: '𐤉𐤎𐤃',   en: 'foundation',            sn: 'H3245' },
  aban:       { translit: 'Aban',        paleo: '𐤀𐤁𐤍',   en: 'stone',                 sn: 'H68' },
  gazayath:   { translit: 'Gazayath',    paleo: '𐤂𐤆𐤉𐤕',  en: 'cut / hewn stone',      sn: 'H1496' },
  qayar:      { translit: 'Qayar',       paleo: '𐤒𐤉𐤓',   en: 'wall',                  sn: 'H7023' },
  tzalai:     { translit: 'Tzalai',      paleo: '𐤑𐤋𐤏',   en: 'side (chamber)',        sn: 'H6763' },
  chalawan:   { translit: 'Chalawan',    paleo: '𐤇𐤋𐤅𐤍',  en: 'window',                sn: 'H2474' },
  araz:       { translit: 'Araz',        paleo: '𐤀𐤓𐤆',   en: 'cedar',                 sn: 'H730' },
  barawash:   { translit: 'Barawash',    paleo: '𐤁𐤓𐤅𐤔',  en: 'fir / cypress',         sn: 'H1265' },
  shaman:     { translit: 'Shaman',      paleo: '𐤔𐤌𐤍',   en: 'olive (wood)',          sn: 'H8081' },
  zahab:      { translit: 'Zahab',       paleo: '𐤆𐤄𐤁',   en: 'gold',                  sn: 'H2091' },
  nachashath: { translit: 'Nachashath',  paleo: '𐤍𐤇𐤔𐤕',  en: 'brass / bronze',        sn: 'H5178' },
  karawab:    { translit: 'Karawab',     paleo: '𐤊𐤓𐤅𐤁',  en: 'cherub / cherubim',     sn: 'H3742' },
  kanap:      { translit: 'Kanap',       paleo: '𐤊𐤍𐤐',   en: 'wing',                  sn: 'H3671' },
  arawan:     { translit: 'Arawan',      paleo: '𐤀𐤓𐤅𐤍',  en: 'ark',                   sn: 'H727' },
  kaparath:   { translit: 'Kaparath',    paleo: '𐤊𐤐𐤓𐤕',  en: 'mercy seat / covering', sn: 'H3727' },
  kayawar:    { translit: 'Kayawar',     paleo: '𐤊𐤉𐤅𐤓',  en: 'scaffold / laver — a bronze platform', sn: 'H3595' },
  inan:       { translit: 'Inan',        paleo: '𐤏𐤍𐤍',   en: 'cloud',                 sn: 'H6051' },
  kabawad:    { translit: 'Kabawad',     paleo: '𐤊𐤁𐤅𐤃',  en: 'glory / weight',        sn: 'H3519' },
  ash:        { translit: 'Ash',         paleo: '𐤀𐤔',    en: 'fire',                  sn: 'H784' },
  qahal:      { translit: 'Qahal',       paleo: '𐤒𐤄𐤋',   en: 'assembly',              sn: 'H6951' },
  kahanayam:  { translit: 'Kahanayam',   paleo: '𐤊𐤄𐤍𐤉𐤌', en: 'priests',               sn: 'H3548' },
  malak:      { translit: 'Malak',       paleo: '𐤌𐤋𐤊',   en: 'king',                  sn: 'H4428' },
  shalamah:   { translit: 'Shalamah',    paleo: '𐤔𐤋𐤌𐤄',  en: 'Solomon — "peaceful"',  sn: 'H8010' },
  thapalah:   { translit: 'Thapalah',    paleo: '𐤕𐤐𐤋𐤄',  en: 'prayer',                sn: 'H8605' },
  barak:      { translit: 'Barak',       paleo: '𐤁𐤓𐤊',   en: 'kneel / bless',         sn: 'H1288' },
  dalath:     { translit: 'Dalath',      paleo: '𐤃𐤋𐤕',   en: 'door',                  sn: 'H1817' },
  parakath:   { translit: 'Parakath',    paleo: '𐤐𐤓𐤊𐤕',  en: 'veil',                  sn: 'H6532' },
  sharasharah:{ translit: 'Sharasharah', paleo: '𐤔𐤓𐤔𐤄',  en: 'chain',                 sn: 'H8333' },
  imawad:     { translit: 'Imawad',      paleo: '𐤏𐤌𐤅𐤃',  en: 'pillar',                sn: 'H5982' },
  yakayan:    { translit: 'Yakayan',     paleo: '𐤉𐤊𐤉𐤍',  en: 'Jachin — "he establishes"', sn: 'H3199' },
  baiz:       { translit: 'Baiz',        paleo: '𐤁𐤏𐤆',   en: 'Boaz — "in him is strength"', sn: 'H1162' },
  shabakah:   { translit: 'Shabakah',    paleo: '𐤔𐤁𐤊𐤄',  en: 'net / network',         sn: 'H7639' },
  ramawan:    { translit: 'Ramawan',     paleo: '𐤓𐤌𐤅𐤍',  en: 'pomegranate',           sn: 'H7416' },
  shawashan:  { translit: 'Shawashan',   paleo: '𐤔𐤅𐤔𐤍',  en: 'lily',                  sn: 'H7799' },
  yam:        { translit: 'Yam',         paleo: '𐤉𐤌',    en: 'sea',                   sn: 'H3220' },
  shawar:     { translit: 'Shawar',      paleo: '𐤔𐤅𐤓',   en: 'ox',                    sn: 'H7794' },
  makawanah:  { translit: 'Makawanah',   paleo: '𐤌𐤊𐤅𐤍𐤄', en: 'base / stand',          sn: 'H4350' },
  awapan:     { translit: 'Awapan',      paleo: '𐤀𐤅𐤐𐤍',  en: 'wheel',                 sn: 'H212' },
  mazabach:   { translit: 'Mazabach',    paleo: '𐤌𐤆𐤁𐤇',  en: 'altar',                 sn: 'H4196' },
  manawarah:  { translit: 'Manawarah',   paleo: '𐤌𐤍𐤅𐤓𐤄', en: 'lampstand',             sn: 'H4501' },
  shalachan:  { translit: 'Shalachan',   paleo: '𐤔𐤋𐤇𐤍',  en: 'table',                 sn: 'H7979' },
  lacham:     { translit: 'Lacham',      paleo: '𐤋𐤇𐤌',   en: 'bread',                 sn: 'H3899' },
  chatzar:    { translit: 'Chatzar',     paleo: '𐤇𐤑𐤓',   en: 'court',                 sn: 'H2691' },
  yair:       { translit: 'Yair',        paleo: '𐤉𐤏𐤓',   en: 'forest',                sn: 'H3293' },
  labanawan:  { translit: 'Labanawan',   paleo: '𐤋𐤁𐤍𐤅𐤍', en: 'Lebanon',               sn: 'H3844' },
  kasaa:      { translit: 'Kasaa',       paleo: '𐤊𐤎𐤀',   en: 'throne',                sn: 'H3678' },
  mashapat:   { translit: 'Mashapat',    paleo: '𐤌𐤔𐤐𐤈',  en: 'judgment',              sn: 'H4941' },
  thamar:     { translit: 'Thamar',      paleo: '𐤕𐤌𐤓',   en: 'palm tree',             sn: 'H8558' },
  tzatzayam:  { translit: 'Tzatzayam',   paleo: '𐤑𐤉𐤑',   en: 'flowers',               sn: 'H6731' },
  amah:       { translit: 'Amah',        paleo: '𐤀𐤌𐤄',   en: 'cubit',                 sn: 'H520' },
  mawarayah:  { translit: 'Mawarayah',   paleo: '𐤌𐤅𐤓𐤉𐤄', en: 'Moriah',                sn: 'H4179' },
  qaraqai:    { translit: 'Qaraqai',     paleo: '𐤒𐤓𐤒𐤏',  en: 'floor',                 sn: 'H7172' },
  gabayam:    { translit: 'Gabayam',     paleo: '𐤂𐤁',    en: 'beams',                 sn: 'H1356' },
  qadash:     { translit: 'Qadash',      paleo: '𐤒𐤃𐤔',   en: 'set apart / holy',      sn: 'H6944' },
};

// ── Materials (colours shared by both renderers) ─────────────────────────────
export const MATERIALS = {
  stone:  { word: 'aban',       color: '#cbbb9a', hi: '#e9dfc6', lo: '#8d7b5c', metal: 0, rough: 0.92 },   // gazayath — hewn limestone
  found:  { word: 'yasad',      color: '#a89676', hi: '#cdbd9d', lo: '#6d5d42', metal: 0, rough: 0.95 },   // the great foundation stones, darker with the ground
  cedar:  { word: 'araz',       color: '#8d5a34', hi: '#c08a5c', lo: '#4e2d16', metal: 0, rough: 0.72 },
  cedarDark: { word: 'araz',    color: '#6a4022', hi: '#9a6a44', lo: '#3a2010', metal: 0, rough: 0.72 },   // the throne room's cedar, darker
  fir:    { word: 'barawash',   color: '#b98c5e', hi: '#d9b48a', lo: '#6f4c2c', metal: 0, rough: 0.7 },
  olive:  { word: 'shaman',     color: '#a08a57', hi: '#c9b57f', lo: '#5d4d2c', metal: 0, rough: 0.68 },
  gold:   { word: 'zahab',      color: '#d9a93a', hi: '#f7dd8a', lo: '#8a6716', metal: 1, rough: 0.3 },
  brass:  { word: 'nachashath', color: '#b9733a', hi: '#e6ab70', lo: '#653916', metal: 1, rough: 0.42 },
  veil:   { word: 'parakath',   color: '#4a2e8a', hi: '#8e6bd6', lo: '#25143f', metal: 0, rough: 0.9 },   // thakalath (blue), aragaman (purple), karamayal (crimson)
  ground: { word: 'chatzar',    color: '#8f8064', hi: '#a89a7e', lo: '#5f5340', metal: 0, rough: 1 },
  water:  { word: 'yam',        color: '#3c6f8a', hi: '#8fc3d9', lo: '#1e3d4e', metal: 0, rough: 0.15 },
  ivory:  { word: 'kasaa',      color: '#efe6cf', hi: '#fffaf0', lo: '#b8a98a', metal: 0, rough: 0.5 },
  plaster:{ word: 'sid',        color: '#e6dbc4', hi: '#f6efe0', lo: '#b5a88c', metal: 0, rough: 1 },     // lime-washed walls (Deuteronomy 27:2 "plaster them with plaster")
  paving: { word: 'ratzapah',   color: '#b9ab8e', hi: '#d6cbb2', lo: '#7f7359', metal: 0, rough: 0.95 },  // a paved floor
  plaster2:{ word: 'sid',       color: '#d9cfb8', hi: '#ece5d4', lo: '#a89c82', metal: 0, rough: 1 },     // a second plaster, greyer (the forest house's chambers, Pharaoh's daughter's house)
  garden: { word: 'gan',        color: '#5e7d3a', hi: '#8fb35c', lo: '#2f4a1c', metal: 0, rough: 1 },
  rug:    { word: 'marabad',    color: '#9a5a3a', hi: '#c98a62', lo: '#5a3018', metal: 0, rough: 1 },     // marabadayam (coverings of tapestry), Proverbs 7:16; 31:22
  'rug-runner': { word: 'marabad', color: '#a2603c', hi: '#cf9068', lo: '#5e341a', metal: 0, rough: 1 },
};

// ── The house's frame, in cubits ─────────────────────────────────────────────
// 1 Kings 6:2 — inside: 60 long, 20 broad, 30 high. 6:17 the hayakal 40; 6:16, 20
// the dabayar 20 × 20 × 20. 6:3 the awalam 20 across × 10 deep; 2 Chronicles 3:4
// its gabah (height) 120. 6:6 the side chambers 5, 6, 7 broad — offsets in the
// wall, so the wall thins by a cubit each storey (6 → 5 → 4) and the chambers'
// outer face stays flush; each storey 5 high (6:10). 6:36 the inner court: three
// courses of hewn stone and one of cedar beams.
export const H = {
  inX0: -30, inX1: 30, inZ: 10, inH: 30,     // interior span (x), half-breadth (z), height
  orX: -10,                                   // the partition: dabayar west of it (20), hayakal east (40)
  wall: [6, 5, 4],                            // wall thickness per storey (offsets, 6:6)
  storey: 6,                                  // 5 clear + 1 for the floor of the next (6:10)
  cham: [5, 6, 7],                            // side chambers' breadth per storey (6:6)
  chamWall: 2,                                // their outer wall (not measured; assumed)
  porchD: 10, porchZ: 10, porchH: 120,        // awalam: 10 deep, 20 across (6:3), 120 high (2 Chr 3:4)
  porchWall: 2.5,
  roofT: 2, parapet: 1,                       // beams + planks (6:9); parapet assumed
  found: 4,                                   // the yasad below the floor (its stones 8 and 10 long, 7:10)
  pad: 4,                                     // foundation's margin around the house (assumed)
  courtY: -4,                                 // ground of the courts
};
export const OUTER_Z = H.inZ + H.wall[0] + H.cham[0] + H.chamWall;          // 23 — flush outer face of the chambers
export const WEST_X = H.inX0 - H.wall[0] - H.cham[0] - H.chamWall;           // −43
export const EAST_X = H.inX1 + H.wall[0];                                     // 36 — the front wall's outer face
export const PORCH_X1 = EAST_X + H.porchD;                                    // 46
export const ROOF_Y = H.inH + H.roofT;                                        // 32
export const INNER_COURT = { x0: -70, x1: 110, z: 60, wallT: 2, wallH: 4.2 }; // size assumed (the text gives courses, not a measure)
export const GREAT_COURT = { x0: -128, x1: 128, z0: -76, z1: 172, wallT: 3, wallH: 7 }; // assumed
export const PILLAR = { x: PORCH_X1 + 3.2, z: 7.6, r: 12 / (2 * Math.PI), h: 18, capH: 5, lilyH: 4 }; // 7:15–19: 18 high, a line of 12 about it, capital 5, lily work 4
export const SEA = { x: 58, z: 32, r: 5, h: 5, oxH: 3.2 };                   // 7:23: 10 brim to brim, 5 high; on the right side eastward toward the south (7:39)
export const ALTAR = { x: 76, z: 0, w: 20, h: 10 };                           // 2 Chronicles 4:1: 20 × 20 × 10
export const BASES = { xs: [-36, -22, -8, 6, 20], z: 33, w: 4, h: 3, wheel: 1.5, basinR: 2 }; // 7:27, 32, 38: 4 × 4 × 3, wheels 1½, basins 4 across; five each side (7:39)

// ── Parts ────────────────────────────────────────────────────────────────────
// Solids both renderers understand (cubits; y = bottom unless noted):
//   box  {x,y,z,w,h,d}                  centre x/z, bottom y
//   cyl  {x,y,z,r,h,r2?}                vertical cylinder (r2 = top radius)
//   lathe{x,y,z,profile:[[r,dy]…]}       body of revolution, dy from y
//   ring {x,y,z,r,w,h}                  a hollow cylinder (wall of thickness w)
// `mat` overrides the piece's material; `role` lets the scene treat a solid as
// part of the roof/south wall for the see-through (xray) phases.
const box = (x, y, z, w, h, d, extra = {}) => ({ kind: 'box', x, y, z, w, h, d, ...extra });
const cyl = (x, y, z, r, h, extra = {}) => ({ kind: 'cyl', x, y, z, r, h, ...extra });
const lathe = (x, y, z, profile, extra = {}) => ({ kind: 'lathe', x, y, z, profile, ...extra });

// A rectangular wall ring (four walls) of thickness t around the box [x0,x1]×[-z,z], from y for h — as four boxes.
/** What the model IDEALIZED — `ideal: true` on a part draws it in lime plaster with a fine hatch and its edges drawn (TempleScene's
 *  idealOf), so a room, a stair or a doorway the text never gives is plainly the model's beside the things the text measures. */
const ideal = (part) => ({ ...part, ideal: true });
const Y0 = H.courtY;
/** An idealized doorway's frame: two jambs, a threshold and two cedar leaves standing open into the building. axis 'x': the wall runs
 *  along x (centre x, z; thickness t), the leaves open toward +z; axis 'z': the wall runs along z, the leaves open toward +x. The gap
 *  itself is cut by the piece's `gates`. */
function doorFrame(x, z, w, h, t, axis = 'x') {
  if (axis === 'z') return doorFrame(z, x, w, h, t).map((q) => ({ ...q, x: q.z, z: q.x, w: q.d, d: q.w }));
  return [
    ideal(box(x - w / 2 - 0.4, Y0, z, 0.8, h + 0.6, t + 0.4, { mat: 'stone', role: 'jamb' })), ideal(box(x + w / 2 + 0.4, Y0, z, 0.8, h + 0.6, t + 0.4, { mat: 'stone', role: 'jamb' })),
    ideal(box(x, Y0 - 0.1, z, w + 1.6, 0.3, t + 1.2, { mat: 'stone', role: 'threshold' })),
    ideal(box(x - w / 2 + 0.25, Y0, z + t / 2 + w / 4, 0.35, h, w / 2, { mat: 'cedar', role: 'leaf' })), ideal(box(x + w / 2 - 0.25, Y0, z + t / 2 + w / 4, 0.35, h, w / 2, { mat: 'cedar', role: 'leaf' })),
  ];
}

// ── A toolkit for the king's buildings (1 Kings 7:1–12) ──────────────────────
// The text gives each building its measures and its work — pillars and beams,
// windows in ranks, cedar from floor to floor, courses of costly stone — and no
// plan. The plans here keep to what scripture says of houses: a court within
// (7:8), an upper chamber with a bed, a table, a seat and a lampstand (2 Kings
// 4:10), a stair to a roof with a parapet about it (Deuteronomy 22:8; 2 Samuel
// 11:2), storerooms with jars (1 Kings 17:12–16; 2 Kings 4:2–6), gardens
// (Ecclesiastes 2:5), gold shields hung in the house of the forest (1 Kings 10:17).
// fieldy: "houses need unique floorplans, ways to ascend multi stories and lead
// to roofs — creatively remain in bounds."
/** A colonnaded front along x at z (open to the court, the house's roof carried over it on a cedar beam): "of like work" as the porches (7:8). */
function portico(x0, x1, z, h, n) {
  const cols = Array.from({ length: n }, (_, i) => cyl(x0 + (i / (n - 1)) * (x1 - x0), Y0, z, 1.2, h, { mat: 'stone', role: 'column' }));
  return [...cols, box((x0 + x1) / 2, Y0 + h, z, x1 - x0 + 3, 1.2, 2.4, { mat: 'cedar', role: 'beam' }), box((x0 + x1) / 2, Y0, z, x1 - x0 + 4, 0.5, 3.4, { mat: 'stone', role: 'threshold' })];
}
/** The same colonnade along z at x (a front facing east or west). */
function porticoZ(z0, z1, x, h, n) {
  const cols = Array.from({ length: n }, (_, i) => cyl(x, Y0, z0 + (i / (n - 1)) * (z1 - z0), 1.2, h, { mat: 'stone', role: 'column' }));
  return [...cols, box(x, Y0 + h, (z0 + z1) / 2, 2.4, 1.2, z1 - z0 + 3, { mat: 'cedar', role: 'beam' }), box(x, Y0, (z0 + z1) / 2, 3.4, 0.5, z1 - z0 + 4, { mat: 'stone', role: 'threshold' })];
}
/** A partition wall (idealized, lime-plastered) along x between x0 and x1 at z, or along z at x, standing on floor y; a doorway (dw wide, 6 high) at `door`. */
function wallX(z, x0, x1, h, door = null, dw = 3, y = Y0) {
  const W = (cx, w) => ideal(box(cx, y, z, w, h, 1, { mat: 'plaster', role: 'partition' }));
  if (door == null) return [W((x0 + x1) / 2, x1 - x0)];
  return [W((x0 + door - dw / 2) / 2, door - dw / 2 - x0), W((door + dw / 2 + x1) / 2, x1 - door - dw / 2), ideal(box(door, y + 6, z, dw, h - 6, 1, { mat: 'plaster', role: 'partition' }))];
}
function wallZ(x, z0, z1, h, door = null, dw = 3, y = Y0) {
  const W = (cz, d) => ideal(box(x, y, cz, 1, h, d, { mat: 'plaster', role: 'partition' }));
  if (door == null) return [W((z0 + z1) / 2, z1 - z0)];
  return [W((z0 + door - dw / 2) / 2, door - dw / 2 - z0), W((door + dw / 2 + z1) / 2, z1 - door - dw / 2), ideal(box(x, y + 6, door, 1, h - 6, dw, { mat: 'plaster', role: 'partition' }))];
}
/** A floor slab (idealized cedar, 1 thick, its top at y) over x0…x1 × z0…z1, with rectangular openings cut out (holes: [{x0,x1,z0,z1}]). */
function slab(x0, x1, z0, z1, y, holes = [], mat = 'cedar', role = 'floor') {
  let rects = [[x0, x1, z0, z1]];
  for (const h of holes) rects = rects.flatMap(([a, b, c, d]) => {
    if (h.x1 <= a || h.x0 >= b || h.z1 <= c || h.z0 >= d) return [[a, b, c, d]];
    const hx0 = Math.max(h.x0, a), hx1 = Math.min(h.x1, b), hz0 = Math.max(h.z0, c), hz1 = Math.min(h.z1, d);
    return [[a, hx0, c, d], [hx1, b, c, d], [hx0, hx1, c, hz0], [hx0, hx1, hz1, d]].filter(([q0, q1, r0, r1]) => q1 - q0 > 0.01 && r1 - r0 > 0.01);
  });
  return rects.map(([a, b, c, d]) => ideal(box((a + b) / 2, y - 1, (c + d) / 2, b - a, 1, d - c, { mat, role })));
}
/** The roof (solid cedar, 1.5 thick, top at y + 1.5) with the same openings, and a parapet round it (Deuteronomy 22:8). */
function roofOf(x0, x1, z0, z1, y, holes = []) {
  return [...slab(x0, x1, z0, z1, y + 1.5, holes, 'cedar', 'roof').map((b) => ({ ...b, ideal: false, y: y, h: 1.5 })), ...parapet(x0, x1, z0, z1, y + 1.5)];
}
function parapet(x0, x1, z0, z1, y) {
  const t = 0.8, h = 1.4;
  return [box((x0 + x1) / 2, y, z0 + t / 2, x1 - x0, h, t, { mat: 'stone', role: 'parapet' }), box((x0 + x1) / 2, y, z1 - t / 2, x1 - x0, h, t, { mat: 'stone', role: 'parapet' }),
    box(x0 + t / 2, y, (z0 + z1) / 2, t, h, z1 - z0, { mat: 'stone', role: 'parapet' }), box(x1 - t / 2, y, (z0 + z1) / 2, t, h, z1 - z0, { mat: 'stone', role: 'parapet' })];
}
/** A balcony rail (idealized, low) along a line: axis 'x' from a0 to a1 at z = at, or 'z' from a0 to a1 at x = at, standing on floor y. */
const rail = (axis, a0, a1, at, y) => [ideal(axis === 'x' ? box((a0 + a1) / 2, y, at, a1 - a0, 1.2, 0.5, { mat: 'cedar', role: 'rail' }) : box(at, y, (a0 + a1) / 2, 0.5, 1.2, a1 - a0, { mat: 'cedar', role: 'rail' }))];
/** A straight stair (idealized): from (x, z) up n steps of 1 × 1, w wide, along ±x (axis 'x', dir) or ±z, from floor y. */
const stair = (axis, x, z, n, w, dir = 1, y = Y0) => Array.from({ length: n }, (_, i) => ideal(axis === 'x'
  ? box(x + dir * (i + 0.5), y + i, z, 1, 1, w, { mat: 'stone', role: 'stair' })
  : box(x, y + i, z + dir * (i + 0.5), w, 1, 1, { mat: 'stone', role: 'stair' })));
/** The furniture, idealized: a bed (w × l, its head at −x), a table with seats, a couch, a lampstand, a chest, jars. */
const bed = (x, z, w = 3, l = 6, y = Y0) => [ideal(box(x, y, z, l, 1.1, w, { mat: 'cedar', role: 'bed' })), ideal(box(x, y + 1.1, z, l - 0.4, 0.5, w - 0.4, { mat: 'linen', role: 'bed' })), ideal(box(x - l / 2 + 0.2, y, z, 0.4, 2.6, w, { mat: 'cedar', role: 'bed' }))];
const table = (x, z, w = 3, l = 5, y = Y0) => [ideal(box(x, y + 1.3, z, l, 0.25, w, { mat: 'cedar', role: 'table' })), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ideal(box(x + sx * (l / 2 - 0.3), y, z + sz * (w / 2 - 0.3), 0.3, 1.3, 0.3, { mat: 'cedar', role: 'table' })))];
const seat = (x, z, y = Y0) => [ideal(box(x, y, z, 1.1, 0.9, 1.1, { mat: 'cedar', role: 'seat' }))];
const couch = (x, z, y = Y0) => [ideal(box(x, y, z, 5, 1.0, 2, { mat: 'cedar', role: 'couch' })), ideal(box(x, y + 1, z, 4.8, 0.5, 1.8, { mat: 'linen', role: 'couch' })), ideal(box(x, y, z + 0.8, 5, 2.2, 0.35, { mat: 'cedar', role: 'couch' }))];
const lamp = (x, z, y = Y0) => [ideal(cyl(x, y, z, 0.35, 3.2, { mat: 'brass', role: 'lampstand', r2: 0.15 })), ideal(cyl(x, y + 3.2, z, 0.5, 0.3, { mat: 'brass', role: 'lampstand' }))];
const chest = (x, z, y = Y0) => [ideal(box(x, y, z, 2.4, 1.3, 1.3, { mat: 'cedar', role: 'chest' }))];
const jars = (x, z, n, y = Y0) => Array.from({ length: n }, (_, i) => ideal(cyl(x + (i % 3) * 1.3, y, z + Math.floor(i / 3) * 1.3, 0.55, 1.6, { mat: 'stone', role: 'jar', r2: 0.3 })));
/** A garden (Ecclesiastes 2:5–6): trees (a cedar trunk, a green crown) and a pool (water in a stone rim). */
const tree = (x, z, h = 6) => [ideal(cyl(x, Y0, z, 0.35, h * 0.55, { mat: 'cedar', role: 'tree' })), ideal(lathe(x, Y0 + h * 0.45, z, [[0.2, 0], [h * 0.32, h * 0.2], [h * 0.3, h * 0.45], [0.1, h * 0.6]], { mat: 'garden', role: 'tree' }))];
const pool = (x, z, w, l) => [ideal(box(x, Y0, z, w + 1.2, 0.6, l + 1.2, { mat: 'stone', role: 'pool' })), ideal(box(x, Y0 + 0.35, z, w, 0.2, l, { mat: 'water', role: 'pool' }))];
/** Gold shields (1 Kings 10:17) hung either side of a pillar at (x, z), at height y. */
const shields = (x, z, y) => [-1, 1].map((sg) => box(x + sg * 1.2, y, z, 0.15, 1.8, 1.8, { mat: 'gold', role: 'shield' }));
/** A row of n chambers (idealized) along z between z0 and z1, between the outer wall at xOut and the inner wall at xIn, on floor y, h high;
 *  each chamber has a door in the inner wall. */
function chambers(xOut, xIn, z0, z1, n, y, h) {
  const len = (z1 - z0) / n, lo = Math.min(xOut, xIn), hi = Math.max(xOut, xIn), out = [];
  for (let i = 1; i < n; i++) out.push(...wallX(z0 + i * len, lo, hi, h, null, 3, y));
  for (let i = 0; i < n; i++) out.push(...wallZ(xIn, z0 + i * len, z0 + (i + 1) * len, h, z0 + (i + 0.5) * len, 2.6, y));
  return out;
}
/** A room with cedar "from floor to floor" (7:7): thin cedar boards on the inside of its walls, a cedar floor and ceiling. */
function cedarLining(x0, x1, z0, z1, y, h) {
  const t = 0.25;
  return [box((x0 + x1) / 2, y, z0 + t / 2, x1 - x0, h, t, { mat: 'cedar', role: 'lining' }), box((x0 + x1) / 2, y, z1 - t / 2, x1 - x0, h, t, { mat: 'cedar', role: 'lining' }),
    box(x0 + t / 2, y, (z0 + z1) / 2, t, h, z1 - z0, { mat: 'cedar', role: 'lining' }), box(x1 - t / 2, y, (z0 + z1) / 2, t, h, z1 - z0, { mat: 'cedar', role: 'lining' }),
    box((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, 0.4, z1 - z0, { mat: 'cedar', role: 'floor' }), box((x0 + x1) / 2, y + h - 0.4, (z0 + z1) / 2, x1 - x0, 0.4, z1 - z0, { mat: 'cedar', role: 'ceiling' })];
}
/** A woven rug on the floor (marabadayam, Proverbs 7:16; 31:22): a thin slab carrying the photograph once; `which` 'rug' or 'rug-runner'. */
const rug = (x, z, w, l, which = 'rug', y = Y0) => [box(x, y + 0.3, z, w, 0.08, l, { mat: which, role: 'rug' })];   // a furnishing, shown as itself (not hatched)
/** A paved floor (idealized) over a room. */
const paving = (x0, x1, z0, z1, y = Y0) => [ideal(box((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mat: 'paving', role: 'pavement' }))];

// Where the king's buildings stand (all assumed — the text describes them one by one and never says where): south of the house of Yahawah
// within the great court, in a line from the inner court's south gate: the lesser porch → the porch of pillars → the porch of the throne;
// the king's house east of that line, the house of the forest along the west wall, the house for Pharaoh's daughter between.
export const PALACE = {
  hall:     { x0: -5,   x1: 45,  z0: 70,  z1: 100, h: 16 },   // the awalam of pillars, 50 × 30 (7:6); its lesser porch before it, z 63…70
  throne:   { x0: 5,    x1: 35,  z0: 103, z1: 133, h: 16 },   // the awalam of the throne, 30 × 30 (assumed), open north to the hall
  king:     { x0: 45,   x1: 115, z0: 103, z1: 165, h: 20 },   // his own house, 70 × 62, two storeys (assumed)
  daughter: { x0: -66,  x1: -10, z0: 103, z1: 157, h: 14 },   // the house for Paraih (Pharaoh)'s daughter, 56 × 54 (assumed)
  forest:   { x0: -125, x1: -75, z0: 65,  z1: 165, h: 30 },   // the house of the forest, 50 × 100 × 30 (7:2), stood north–south along the west wall
};

function walls(x0, x1, z, t, y, h, extra = {}) {
  const mid = (x0 + x1) / 2, len = x1 - x0 + 2 * t;
  return [
    box(mid, y, z + t / 2, len, h, t, { role: 'south', ...extra }),
    box(mid, y, -z - t / 2, len, h, t, { role: 'north', ...extra }),
    box(x0 - t / 2, y, 0, t, h, 2 * z, { role: 'west', ...extra }),
    box(x1 + t / 2, y, 0, t, h, 2 * z, { role: 'east', ...extra }),
  ];
}

// The house wall, storey by storey (its thickness steps in with the offsets of 6:6),
// then the plain wall up to the roof.
function houseWalls() {
  const out = [];
  const st = H.storey;
  for (let i = 0; i < 3; i++) {
    const t = H.wall[i], y = i * st;
    // north & south walls: inner face at ±inZ, thickness t (outer at ±(inZ+t))
    out.push(box(0, y, H.inZ + t / 2, H.inX1 - H.inX0, st, t, { role: 'south' }));
    out.push(box(0, y, -H.inZ - t / 2, H.inX1 - H.inX0, st, t, { role: 'north' }));
    out.push(box(H.inX0 - t / 2, y, 0, t, st, 2 * H.inZ + 2 * t, { role: 'west' }));
  }
  const t3 = H.wall[2], y3 = 3 * st, h3 = H.inH + H.roofT + H.parapet - y3;
  out.push(box(0, y3, H.inZ + t3 / 2, H.inX1 - H.inX0, h3, t3, { role: 'south' }));
  out.push(box(0, y3, -H.inZ - t3 / 2, H.inX1 - H.inX0, h3, t3, { role: 'north' }));
  out.push(box(H.inX0 - t3 / 2, y3, 0, t3, h3, 2 * H.inZ + 2 * t3, { role: 'west' }));
  // the front (east) wall, full thickness all the way up, with the doorway cut by the scene
  out.push(box(H.inX1 + H.wall[0] / 2, 0, 0, H.wall[0], H.inH + H.roofT + H.parapet, 2 * H.inZ + 2 * H.wall[0], { role: 'east', doorway: { w: 8, h: 14 } }));
  return out;
}

// Three storeys of side chambers on the north, south and west (6:5–6, 10): each
// storey's rooms sit against that storey's wall face and share one flush outer face.
function sideChambers() {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const y = i * H.storey, wIn = H.wall[i], b = H.cham[i], t = H.chamWall;
    const zIn = H.inZ + wIn;               // the wall's outer face this storey
    const xW = H.inX0 - wIn;               // the west wall's outer face
    // room cavities are implied: draw the outer shell (floor slab + outer wall) per storey
    out.push(box((xW - b - t + H.inX1) / 2 - 0, y, zIn + b + t / 2, H.inX1 - (xW - b - t), H.storey, t, { role: 'south', storey: i }));
    out.push(box((xW - b - t + H.inX1) / 2 - 0, y, -zIn - b - t / 2, H.inX1 - (xW - b - t), H.storey, t, { role: 'north', storey: i }));
    out.push(box(xW - b - t / 2, y, 0, t, H.storey, 2 * (zIn + b + t), { role: 'west', storey: i }));
    // the floor/ceiling slab of the storey (rests on the offsets, 6:6): three strips, south, north, west
    out.push(box((xW - b + H.inX1) / 2, y + H.storey - 1, zIn + b / 2, H.inX1 - (xW - b), 1, b, { role: 'slab', storey: i }));
    out.push(box((xW - b + H.inX1) / 2, y + H.storey - 1, -zIn - b / 2, H.inX1 - (xW - b), 1, b, { role: 'slab', storey: i }));
    out.push(box(xW - b / 2, y + H.storey - 1, 0, b, 1, 2 * zIn, { role: 'slab', storey: i }));
  }
  return out;
}

// ── The pieces ───────────────────────────────────────────────────────────────
// `on`: the verses that light up in the passage when the piece is chosen, as
// "book:chapter:v-v" (11 = 1 Kings, 14 = 2 Chronicles). `keys`: the text's words
// that pick this piece (see pieceForWord). `build`: [from, to] seconds of the
// BUILD story in which it rises. `walk`: the WALK phase key at which it is the
// subject. `parts`: the solids; decorations (pomegranates, oxen, wheels, lattice,
// carvings, chains…) are generated by the scene from the measures above.
const V = (...specs) => specs.flatMap((s) => {
  const [b, c, r] = s.split(':'); const [a, z] = r.split('-').map(Number);
  const out = []; for (let v = a; v <= (z ?? a); v++) out.push(`${b}:${c}:${v}`); return out;
});
const FOUND_X0 = WEST_X - H.pad, FOUND_X1 = PORCH_X1 + H.pad, FOUND_Z = OUTER_Z + H.pad;

export const PIECES = [
  {
    id: 'house', order: 0, group: 'house', material: 'stone',
    tag: 'bayath (house)', title: 'The bayath (house) Shalamah (Solomon) banah (built) for Yahawah',
    words: ['bayath', 'amah', 'mawarayah'], keys: ['bayath'],
    on: V('11:6:1-2', '11:6:14', '11:6:37-38', '11:7:51', '14:3:1-3'),
    refs: '1 Kings 6:1–2, 37–38; 2 Chronicles 3:1–3',
    build: [0, 36], walk: 'gate',
    measures: [['arak (length)', '60 amah', '1 Kings 6:2; 2 Chronicles 3:3'], ['rachab (breadth)', '20 amah', '1 Kings 6:2'], ['qawamah (height)', '30 amah', '1 Kings 6:2'], ['begun', '4th year, chadash (month) Zaw', '1 Kings 6:1, 37'], ['finished', '11th year, yarach (month) Bawal — seven years', '1 Kings 6:38']],
    note: 'Banah (built) on har (mountain) Mawarayah (Moriah), in the garan (threshing) floor of Aranan (Ornan) the Yabawasay (Jebusite), the maqawam (place) Dawad (David) had appointed (2 Chronicles 3:1). The whole house faces mazarach (east): the awalam (porch) and the two imawadayam (pillars) toward the sunrise, the dabayar (oracle) at the west end.',
    elsewhere: { ref: '2 Samuel 24:18–25; 1 Chronicles 21:18–22:1; Genesis 22:2, 14; Ezekiel 40:2–4', note: 'The garan (threshing) floor Dawad (David) bought from Aranan (Ornan) — "this is the bayath (house) of Yahawah Alahayam" (1 Chronicles 22:1) — on the mountain where Abaraham (Abraham) was sent with Yatzachaq (Isaac). Yachazaqaal (Ezekiel) 40–43 measures another house on a very high mountain.' },
    assumed: 'The wall\'s thickness (6, 5 and 4 amah, following the offsets of 6:6), the side chambers\' outer wall, the parapet and the four-cubit yasad (foundation) under the floor are not measured in the text.',
    parts: [],   // the whole house is the union of the pieces below
  },
  {
    id: 'yasad', order: 1, group: 'house', material: 'found',
    tag: 'yasad (foundation)', title: 'The yasad (foundation) of yaqar (costly) abanayam (stones)',
    words: ['yasad', 'aban', 'gazayath'], keys: ['yasad', 'masad'],
    on: V('11:6:37', '11:7:9-11', '14:3:3'),
    refs: '1 Kings 6:37; 7:9–11; 2 Chronicles 3:3',
    build: [0, 3], walk: 'court',
    measures: [['abanayam (stones)', 'of 10 amah and of 8 amah', '1 Kings 7:10'], ['laid', '4th year, yarach (month) Zaw', '1 Kings 6:37']],
    note: 'The stones are sawed with magarah (saws) according to madah (measure), inside and out, "{{1 Kings 7:9 | from the masad … tapach}}" — the same costly work runs from the house\'s foundation to the great court.',
    elsewhere: { ref: 'Isaiah 28:16; Psalm 118:22; 1 Peter 2:6; Ephesians 2:20', note: 'A tried, precious corner aban (stone) laid for a yasad (foundation) in Tzayawan (Zion); the aban (stone) the builders rejected made the raash (head) of the corner.' },
    assumed: 'Four amah high with a four-cubit margin around the house — the text gives the stones\' lengths (10 and 8), not the platform\'s size.',
    parts: [box((FOUND_X0 + FOUND_X1) / 2, H.courtY, 0, FOUND_X1 - FOUND_X0, H.found, 2 * FOUND_Z, { courses: [10, 8] }),
      // the steps up to the porch, on the east
      box(FOUND_X1 + 2, H.courtY, 0, 4, 1, 24, { mat: 'stone' }), box(FOUND_X1 + 1.5, H.courtY + 1, 0, 3, 1, 24, { mat: 'stone' }), box(FOUND_X1 + 1, H.courtY + 2, 0, 2, 1, 24, { mat: 'stone' }), box(FOUND_X1 + 0.5, H.courtY + 3, 0, 1, 1, 24, { mat: 'stone' })],
  },
  {
    id: 'qayar', order: 2, group: 'house', material: 'stone',
    tag: 'qayarawath (walls) · aban (stone)', title: 'The qayarawath (walls) of aban (stone) shalam (finished) at the quarry',
    words: ['qayar', 'aban', 'gazayath'], keys: ['qayar', 'qayarawath', 'maqabah', 'kalay'],
    on: V('11:6:5-7', '11:6:2'),
    refs: '1 Kings 6:2, 5–7; 2 Chronicles 3:3',
    build: [3, 6.5], walk: 'porch',
    measures: [['inside', '60 × 20 × 30 amah', '1 Kings 6:2'], ['offsets', 'the wall steps in above each storey', '1 Kings 6:6']],
    note: '"{{1 Kings 6:7 | there was neither … build}}" — every stone was shaped at the quarry, so the house rose in silence. The offsets on the outside (6:6) are the ledges the chamber beams rest on, so nothing is cut into the house\'s own wall.',
    elsewhere: { ref: 'Ezekiel 41:5–7; 1 Kings 5:17–18; Exodus 20:25', note: 'Yachazaqaal (Ezekiel)\'s house has a wall of shash (six) amah with tzalai (side) rooms widening as they go up "for the winding about of the house" (41:7) — the same device. Chayaram (Hiram)\'s builders and the Gebalites shaped the stones (5:18).' },
    assumed: 'The wall thickness (6 → 5 → 4 amah) follows the three offsets; Ezekiel\'s house gives 6. The doorway\'s size is a guess.',
    parts: houseWalls(),
  },
  {
    id: 'tzalai', order: 3, group: 'house', material: 'stone',
    tag: 'tzalai (side) rooms', title: 'The tzalai (side) rooms, shalawash (three) stories all around',
    words: ['tzalai', 'qayar'], keys: ['tzalai', 'thachathawan', 'thayakawan', 'shalayashay', 'stories', 'lawal'],
    on: V('11:6:5-6', '11:6:8', '11:6:10'),
    refs: '1 Kings 6:5–6, 8, 10',
    build: [4, 7.5], walk: 'porch',
    measures: [['thachathawan (nethermost)', '5 amah broad', '1 Kings 6:6'], ['thayakawan (middle)', '6 amah broad', '1 Kings 6:6'], ['shalayashay (third)', '7 amah broad', '1 Kings 6:6'], ['each story', '5 amah high, resting on araz (cedar) itz (timber)', '1 Kings 6:10'], ['pathach (door)', 'in the yamanay (right) kathap (side); lawal (winding) stairs up', '1 Kings 6:8']],
    note: 'Rooms wrapped around the hayakal (temple) and the dabayar (oracle) on three sides, wider on each storey because the house wall steps in — "{{1 Kings 6:6 | that the beams … build}}". The door is on the south side, and a winding stair climbs from the middle storey to the third.',
    elsewhere: { ref: 'Ezekiel 41:6–11; 1 Chronicles 28:11–12', note: 'Yachazaqaal (Ezekiel) counts shalawashayam (thirty) rooms in three stories; Dawad (David) gave Shalamah (Solomon) the pattern of the house\'s atzarawath (treasuries) and upper rooms.' },
    assumed: 'The outer wall of the rooms (2 amah) and their number are not given; the winding stair is inside and not drawn.',
    parts: sideChambers(),
  },
  {
    id: 'chalawan', order: 4, group: 'house', material: 'stone',
    tag: 'chalawanay (windows)', title: 'Chalawanay (windows) of fixed lattice shaqap (work)',
    words: ['chalawan'], keys: ['chalawanay', 'chalawan', 'shaqap'],
    on: V('11:6:4'),
    refs: '1 Kings 6:4',
    build: [6.5, 8], walk: 'hayakal',
    measures: [['kind', 'narrowing, latticed and fixed', '1 Kings 6:4']],
    note: 'Set high in the walls above the roof of the side rooms, where light can reach the hayakal (temple) — the only place on the long walls that is not covered by the three storeys of rooms.',
    elsewhere: { ref: 'Ezekiel 40:16; 41:16, 26', note: 'Yachazaqaal (Ezekiel)\'s house has the same closed, narrowing windows, with thamar (palm) trees between them.' },
    assumed: 'Number, size and placement — six each side above the chambers — are a reconstruction; the text only says what kind they were.',
    parts: [-25, -15, -5, 5, 15, 25].flatMap((x) => [box(x, 21, OUTER_Z - 0.5, 3, 6, 1.4, { role: 'south', window: true }), box(x, 21, -OUTER_Z + 0.5, 3, 6, 1.4, { role: 'north', window: true })]),
  },
  {
    id: 'awalam', order: 5, group: 'house', material: 'stone',
    tag: 'awalam (porch)', title: 'The awalam (porch) panayam (before) the hayakal (temple)',
    words: ['awalam', 'hayakal'], keys: ['awalam'],
    on: V('11:6:3', '14:3:4', '11:7:21'),
    refs: '1 Kings 6:3; 2 Chronicles 3:4',
    build: [7, 9.5], walk: 'porch',
    measures: [['arak (length), across the front', '20 amah — the breadth of the house', '1 Kings 6:3'], ['rachab (breadth), out from the house', '10 amah', '1 Kings 6:3'], ['gabah (height)', '120 amah', '2 Chronicles 3:4'], ['overlaid within', 'tahawar (pure) zahab (gold)', '2 Chronicles 3:4']],
    note: 'Malakayam (Kings) gives its footprint; Dabaray-Hayamayam (Chronicles) gives its height — "{{2 Chronicles 3:4 | the gabah … isharayam}}" — so the porch stands as a tower four times the height of the house, and the model builds it as the text says. Yakayan (Jachin) and Baiz (Boaz) stand at it (7:21).',
    elsewhere: { ref: 'Ezekiel 40:48–49; Joel 2:17; 2 Chronicles 29:7, 17', note: 'Yachazaqaal (Ezekiel)\'s awalam (porch) is 20 × 11 with pillars beside its posts; the kahanayam (priests) weep "between the awalam (porch) and the mazabach (altar)".' },
    assumed: 'The side walls (2½ amah) and the open front are a reconstruction; many read the 120 of 2 Chronicles 3:4 as 20.',
    parts: [
      box((EAST_X + PORCH_X1) / 2, 0, H.porchZ - H.porchWall / 2, H.porchD, H.porchH, H.porchWall, { role: 'south' }),
      box((EAST_X + PORCH_X1) / 2, 0, -H.porchZ + H.porchWall / 2, H.porchD, H.porchH, H.porchWall, { role: 'north' }),
      box((EAST_X + PORCH_X1) / 2, H.inH + H.roofT, 0, H.porchD, H.porchH - H.inH - H.roofT, 2 * H.porchZ, { role: 'tower' }),   // the tower above the house's roof line, solid
      box((EAST_X + PORCH_X1) / 2, 16, 0, H.porchD, 2, 2 * H.porchZ, { role: 'lintel', mat: 'cedar' }),                             // the lintel over the opening
      box(PORCH_X1 - H.porchWall / 2, 18, 0, H.porchWall, H.inH + H.roofT - 18, 2 * H.porchZ, { role: 'tower' }),                    // the front above the lintel, solid up to the tower (no hollow behind the opening)
      box((EAST_X + PORCH_X1) / 2, H.porchH, 0, H.porchD + 1, 1, 2 * H.porchZ + 1, { role: 'tower' }),                              // its cap
    ],
  },
  {
    id: 'roof', order: 6, group: 'house', material: 'cedar',
    tag: 'gabayam (beams) · araz (cedar)', title: 'Sapan (covered) with gabayam (beams) and planks of araz (cedar)',
    words: ['gabayam', 'araz'], keys: ['gabayam', 'sapan', 'planks', 'ceiling', 'chapah'],
    on: V('11:6:9', '14:3:5'),
    refs: '1 Kings 6:9; 2 Chronicles 3:5',
    build: [9.5, 11.5], walk: 'hayakal',
    measures: [['roof', 'gabayam (beams) and planks of araz (cedar)', '1 Kings 6:9'], ['chapah (ceiling) of the greater house', 'barawash (fir), overlaid with tawab (good) zahab (gold), with thamar (palm) trees and sharasharawath (chains)', '2 Chronicles 3:5']],
    note: 'Flat, as roofs of that land are: cedar beams laid across the twenty amah, planks over them. Inside, the ceiling of fir is gold with palms and chains worked on it (2 Chronicles 3:5).',
    elsewhere: { ref: '1 Kings 5:6–10; Ezra 3:7', note: 'The araz (cedar) came from Labanawan (Lebanon) by sea in floats, cut by Chayaram (Hiram)\'s men with Shalamah (Solomon)\'s.' },
    assumed: 'The depth of the beams (2 amah) and the parapet are not given.',
    parts: [box((H.inX0 + H.inX1) / 2, H.inH, 0, H.inX1 - H.inX0 + 2 * H.wall[2], H.roofT, 2 * H.inZ + 2 * H.wall[2], { role: 'roof', beams: true }),
      // the chambers' roof: three strips from the third storey's wall face out to the flush outer face
      box((WEST_X + H.inX1) / 2, 3 * H.storey - 1, (H.inZ + H.wall[2] + OUTER_Z) / 2, H.inX1 - WEST_X, 1, OUTER_Z - H.inZ - H.wall[2], { role: 'roof' }),
      box((WEST_X + H.inX1) / 2, 3 * H.storey - 1, -(H.inZ + H.wall[2] + OUTER_Z) / 2, H.inX1 - WEST_X, 1, OUTER_Z - H.inZ - H.wall[2], { role: 'roof' }),
      box((WEST_X + H.inX0 - H.wall[2]) / 2, 3 * H.storey - 1, 0, H.inX0 - H.wall[2] - WEST_X, 1, 2 * (H.inZ + H.wall[2]), { role: 'roof' })],
  },
  {
    id: 'araz', order: 7, group: 'inside', material: 'cedar',
    tag: 'tzalaiwath (boards) · araz (cedar)', title: 'Tzalaiwath (boards) of araz (cedar) from the qaraqai (floor) to the ceiling',
    words: ['araz', 'barawash', 'qaraqai', 'thamar', 'tzatzayam', 'karawab'], keys: ['tzalaiwath', 'maqalaith', 'buds', 'tzatzayam', 'thamar', 'qalai', 'pathawach', 'maqalaiwath', 'panayamah'],
    on: V('11:6:15', '11:6:18', '11:6:29', '14:3:5', '14:3:7'),
    refs: '1 Kings 6:15, 18, 29; 2 Chronicles 3:5–7',
    build: [11.5, 14], walk: 'hayakal',
    measures: [['walls', 'araz (cedar) boards, floor to ceiling', '1 Kings 6:15'], ['qaraqai (floor)', 'tzalaiwath (boards) of barawash (fir)', '1 Kings 6:15'], ['carving', 'buds and open tzatzayam (flowers); karawab (cherubim) and thamar (palm) trees, inside and outside', '1 Kings 6:18, 29']],
    note: '"{{1 Kings 6:18 | all was araz … raah}}" — inside the house no stone shows anywhere. Every wall is carved: karawab (cherubim), thamar (palm) trees, open tzatzayam (flowers), and gourds in bud, cut into the cedar before the gold went on.',
    elsewhere: { ref: 'Ezekiel 41:16–20, 25–26; Psalm 92:12–13', note: 'Yachazaqaal (Ezekiel) sees the same walls: "{{Ezekiel 41:18 | It was ishah … and karawab}}", palm and cherub alternating. "The tzadayaq (righteous) shall flourish like the thamar (palm) tree … planted in the bayath (house) of Yahawah."' },
    assumed: 'The carving pattern (palm · cherub · flower) is drawn after Ezekiel 41:18; the boards\' thickness is a guess.',
    parts: [
      box(0, 0, H.inZ - 0.25, H.inX1 - H.inX0, H.inH, 0.5, { role: 'lining', carved: true }), box(0, 0, -H.inZ + 0.25, H.inX1 - H.inX0, H.inH, 0.5, { role: 'lining', carved: true }),
      box(H.inX0 + 0.25, 0, 0, 0.5, H.inH, 2 * H.inZ, { role: 'lining', carved: true }), box(H.inX1 - 0.25, 0, 0, 0.5, H.inH, 2 * H.inZ, { role: 'lining', carved: true, doorway: { w: 8, h: 14 } }),
      box(0, 0, 0, H.inX1 - H.inX0, 0.3, 2 * H.inZ, { role: 'floor', mat: 'fir' }),
      box(0, H.inH - 0.3, 0, H.inX1 - H.inX0, 0.3, 2 * H.inZ, { role: 'ceiling', mat: 'fir' }),
    ],
  },
  {
    id: 'dabayar', order: 8, group: 'inside', material: 'cedar',
    tag: 'dabayar (oracle)', title: 'The dabayar (oracle) — the most qadash (holy) place',
    words: ['dabayar', 'qadash', 'zahab', 'araz'], keys: ['dabayar', 'hinder', 'qadash'],
    on: V('11:6:16', '11:6:19-20', '14:3:8-9'),
    refs: '1 Kings 6:16, 19–20; 2 Chronicles 3:8–9',
    build: [13, 15], walk: 'dabayar',
    measures: [['arak (length)', '20 amah', '1 Kings 6:20; 2 Chronicles 3:8'], ['rachab (breadth)', '20 amah', '1 Kings 6:20'], ['qawamah (height)', '20 amah', '1 Kings 6:20'], ['overlaid', 'sagar (pure) zahab (gold) — 600 kakarayam (talents)', '1 Kings 6:20; 2 Chronicles 3:8'], ['nails', '50 shaqalayam (shekels) of zahab (gold)', '2 Chronicles 3:9']],
    note: 'A perfect cube of twenty amah at the west end, walled off with cedar boards from floor to ceiling (6:16) and lined with pure gold — "{{1 Kings 6:19 | He kawan … Yahawah}}". Since the house is thirty high the ten amah above the dabayar are the upper rooms, which were also overlaid with gold (2 Chronicles 3:9).',
    elsewhere: { ref: 'Exodus 26:33–34; Hebrews 9:3–5; Revelation 21:16', note: 'The most holy place of the mashakan (tabernacle) behind its veil; and the city that comes down, whose arak (length), rachab (breadth) and gabah (height) are equal — a cube, as the dabayar is.' },
    assumed: 'The partition (1 amah of cedar boards) and the upper room above are drawn from 6:16 and 2 Chronicles 3:9; nothing else about them is given.',
    parts: [
      box(H.orX - 0.5, 0, 0, 1, H.inH, 2 * H.inZ, { role: 'partition', carved: true, doorway: { w: 6, h: 10 } }),   // the partition, with the oracle's doorway
      box((H.inX0 + H.orX) / 2, 20, 0, H.orX - H.inX0, 0.6, 2 * H.inZ, { role: 'ceiling' }),                        // the oracle's ceiling at 20 — the upper room above
    ],
  },
  {
    id: 'zahab', order: 9, group: 'inside', material: 'gold',
    tag: 'zahab (gold)', title: 'The whole bayath (house) overlaid with zahab (gold)',
    words: ['zahab'], keys: ['zahab', 'sagar', 'tahawar', 'overlaid', 'parawayam'],
    on: V('11:6:20-22', '11:6:30', '14:3:4-9'),
    refs: '1 Kings 6:20–22, 30; 2 Chronicles 3:4–9',
    build: [14.5, 17], walk: 'hayakal',
    measures: [['the dabayar', 'sagar (pure) zahab (gold), 600 kakarayam (talents)', '1 Kings 6:20; 2 Chronicles 3:8'], ['the house within, the altar, the floor', 'zahab (gold)', '1 Kings 6:21–22, 30'], ['the gold', 'zahab (gold) of Parawayam (Parvaim)', '2 Chronicles 3:6'], ['the upper rooms', 'zahab (gold)', '2 Chronicles 3:9']],
    note: '"{{1 Kings 6:22 | The whole bayath … finished}}" — over every carved cedar board, over the floor, over the altar before the oracle: gold. In the model the gold goes on after the cedar, the order the text gives, so scrub back and the carving shows through.',
    elsewhere: { ref: '1 Chronicles 22:14; 29:2–7; Haggai 2:8; Revelation 21:18, 21', note: 'Dawad (David) laid up a hundred thousand kakarayam (talents) of gold for it; "the zahab (gold) is mine, says Yahawah of tzabaawath (hosts)"; the city\'s street is tahawar (pure) zahab (gold).' },
    assumed: 'Shown as a skin over the cedar (not measured).',
    parts: [
      box(0, 0, H.inZ - 0.6, H.inX1 - H.inX0, H.inH, 0.2, { role: 'lining', carved: true }), box(0, 0, -H.inZ + 0.6, H.inX1 - H.inX0, H.inH, 0.2, { role: 'lining', carved: true }),
      box(H.inX0 + 0.6, 0, 0, 0.2, H.inH, 2 * H.inZ, { role: 'lining', carved: true }), box(H.inX1 - 0.6, 0, 0, 0.2, H.inH, 2 * H.inZ, { role: 'lining', carved: true, doorway: { w: 8, h: 14 } }),
      box(H.orX - 0.5, 0, 0, 1.3, H.inH, 2 * H.inZ, { role: 'partition', carved: true, doorway: { w: 6, h: 10 } }),
      box(0, 0.3, 0, H.inX1 - H.inX0, 0.1, 2 * H.inZ, { role: 'floor' }),
      box(0, H.inH - 0.45, 0, H.inX1 - H.inX0, 0.1, 2 * H.inZ, { role: 'ceiling' }),
    ],
  },
  {
    id: 'sharasharah', order: 10, group: 'inside', material: 'gold',
    tag: 'rathayaqawath (chains) · zahab (gold)', title: 'Rathayaqawath (chains) of zahab (gold) panayam (before) the dabayar (oracle)',
    words: ['sharasharah', 'zahab'], keys: ['rathayaqawath', 'sharasharawath', 'chains'],
    on: V('11:6:21', '14:3:16'),
    refs: '1 Kings 6:21; 2 Chronicles 3:16',
    build: [16, 17.5], walk: 'veil',
    measures: [['where', 'drawn across panayam (before) the dabayar (oracle)', '1 Kings 6:21'], ['and', 'sharasharawath (chains) in the dabayar, on the raash (head) of the pillars, with a hundred ramawanayam (pomegranates)', '2 Chronicles 3:16']],
    note: '"{{1 Kings 6:21 | he drew … dabayar}}" — gold chains hung across the front of the inner room, before its olive doors.',
    elsewhere: { ref: 'Exodus 28:14, 22; 2 Chronicles 3:5', note: 'Sharasharawath (chains) of wreathen work on the kahan (priest)\'s breastplate; chains worked on the ceiling of the greater house.' },
    assumed: 'Number and hang of the chains.',
    parts: [box(H.orX + 0.9, 12, 0, 0.2, 8, 2 * H.inZ - 2, { role: 'chains', decor: 'chains' })],
  },
  {
    id: 'karawab', order: 11, group: 'inside', material: 'olive',
    tag: 'karawab (cherubim)', title: 'Shanayam (two) karawab (cherubim) of shaman (olive) itz (wood), ishar (ten) amawath (cubits) high',
    words: ['karawab', 'kanap', 'shaman', 'zahab'], keys: ['karawab', 'kanap', 'kanapay', 'kanapayam'],
    on: V('11:6:23-28', '14:3:10-13'),
    refs: '1 Kings 6:23–28; 2 Chronicles 3:10–13',
    build: [17, 19.5], walk: 'karawab',
    measures: [['qawamah (height)', '10 amah each', '1 Kings 6:23, 26'], ['each kanap (wing)', '5 amah', '1 Kings 6:24'], ['wingtip to wingtip', '10 amah each; 20 amah the two together', '1 Kings 6:24; 2 Chronicles 3:11–13'], ['made of', 'shaman (olive) itz (wood), overlaid with zahab (gold)', '1 Kings 6:23, 28'], ['stance', 'imad (standing) on their ragal (feet), panayam (faces) toward the bayath (house)', '2 Chronicles 3:13']],
    note: '"{{1 Kings 6:27 | the kanapay … bayath}}" — one wing of each touches a wall, their other wings touch each other over the middle of the room, so the two together span the whole twenty amah of the dabayar. They stand facing the hayakal (temple), and the arawan (ark) is brought in beneath their wings (1 Kings 8:6–7).',
    elsewhere: { ref: 'Exodus 25:18–20; Ezekiel 10:1–22; 41:18–19; Genesis 3:24; Psalm 80:1', note: 'The karawab (cherubim) of the kaparath (mercy) seat face each other with wings spread upward; Yachazaqaal (Ezekiel)\'s have four faces and wheels; every carved cherub in his house has two faces, a man\'s and a lion\'s. Yahawah "sits between the karawab (cherubim)".' },
    assumed: 'Their form — a standing figure with two wings — is not described here; Ezekiel 41:18–19 gives the carved ones a man\'s face and a lion\'s.',
    parts: [-5, 5].map((z) => ({ kind: 'cherub', x: -20, y: 0, z, h: 10, wing: 5, side: Math.sign(z), glb: 'temple-cherub' })),
  },
  {
    id: 'arawan', order: 12, group: 'inside', material: 'gold',
    tag: 'arawan (ark)', title: 'The arawan (ark) of the barayath (covenant) beneath the wings',
    words: ['arawan', 'kaparath', 'karawab'], keys: ['arawan'],
    on: V('11:6:19', '11:8:6-9'),
    refs: '1 Kings 6:19; 8:6–9; Exodus 25:10–22',
    build: [34.5, 36], walk: 'arawan',
    measures: [['arak (length)', '2½ amah', 'Exodus 25:10'], ['rachab (breadth) · qawamah (height)', '1½ amah each', 'Exodus 25:10'], ['kaparath (mercy seat)', 'tahawar (pure) zahab (gold), two karawab (cherubim) of hammered gold at its ends', 'Exodus 25:17–20'], ['within', 'the two lachawath (tables) of stone', '1 Kings 8:9']],
    note: 'The dabayar (oracle) was prepared "{{1 Kings 6:19 | to nathan … Yahawah}}". The ark came in last, when the house was finished: "{{1 Kings 8:7 | the karawab … mail}}". Its poles were long enough to be seen from the holy place before the oracle (8:8).',
    elsewhere: { ref: 'Exodus 25:10–22; 37:1–9; Hebrews 9:4; Revelation 11:19', note: 'Made by Batzalaal (Bezalel) of acacia wood overlaid with gold, the kaparath (mercy) seat of pure gold with its two cherubim; seen again in the hayakal (temple) of Alahayam in shamayam (heaven).' },
    assumed: 'Placed centred under the meeting wingtips, poles east–west (8:8 puts their ends toward the holy place).',
    parts: [{ kind: 'ark', x: -20, y: 0, z: 0, glb: 'temple-ark' }],
  },
  {
    id: 'oracle-doors', order: 13, group: 'inside', material: 'olive',
    tag: 'dalathawath (doors) · shaman (olive)', title: 'Dalathawath (doors) of shaman (olive) itz (wood) for the dabayar (oracle)',
    words: ['dalath', 'shaman', 'karawab', 'thamar', 'tzatzayam'], keys: ['dalathawath', 'dalath', 'ayal', 'mazawazah', 'chamayashay', 'radad', 'dalathay'],
    on: V('11:6:31-32', '14:4:22'),
    refs: '1 Kings 6:31–32; 2 Chronicles 4:22',
    build: [20, 21.5], walk: 'veil',
    measures: [['made of', 'shaman (olive) itz (wood)', '1 Kings 6:31'], ['ayal (lintel) and posts', 'a chamayashay (fifth) part of the wall', '1 Kings 6:31'], ['carved', 'karawab (cherubim), thamar (palm) trees, open tzatzayam (flowers); gold radad (spread) on them', '1 Kings 6:32']],
    note: 'Two leaves of olive wood in the partition, carved like the walls and overlaid with gold — "{{1 Kings 6:32 | he radad … trees}}". The parakath (veil) of 2 Chronicles 3:14 hangs before them.',
    elsewhere: { ref: 'Ezekiel 41:23–25; Psalm 24:7', note: 'Yachazaqaal (Ezekiel)\'s hayakal and its sanctuary each have two doors of two turning leaves, with cherubim and palms on them.' },
    assumed: 'The opening (6 × 10) is a reading of "a fifth part".',
    parts: [{ kind: 'doors', x: H.orX, y: 0, z: 0, w: 6, h: 10, t: 0.3, hinge: 'x', open: 'oracle', carved: true }],
  },
  {
    id: 'doors', order: 14, group: 'house', material: 'fir',
    tag: 'dalathawath (doors) · barawash (fir)', title: 'Galayal (folding) dalathawath (doors) of barawash (fir) for the hayakal (temple)',
    words: ['dalath', 'barawash', 'shaman', 'karawab', 'thamar', 'tzatzayam'], keys: ['dalathawath', 'dalath', 'galayal', 'mazawazah', 'leaves', 'pathawath', 'dalathay'],
    on: V('11:6:33-35', '11:7:50', '14:4:22'),
    refs: '1 Kings 6:33–35; 7:50; 2 Chronicles 4:22',
    build: [20, 21.5], walk: 'doors',
    measures: [['mazawazah (door) posts', 'shaman (olive) itz (wood), a rabayaiy (fourth) part of the wall', '1 Kings 6:33'], ['leaves', 'two doors of barawash (fir), each of two galayal (folding) leaves', '1 Kings 6:34'], ['carved', 'karawab (cherubim), thamar (palm) trees, open tzatzayam (flowers), gold yashar (fitted) on the work', '1 Kings 6:35'], ['pathawath (hinges)', 'zahab (gold)', '1 Kings 7:50']],
    note: '"{{1 Kings 6:34 | the shanayam … galayal}}" — each door folds in two, so the whole doorway opens wide. Olive posts a quarter of the wall; fir leaves; gold laid into the carving.',
    elsewhere: { ref: 'Ezekiel 41:23–25; 2 Kings 18:16; Psalm 118:19–20', note: 'Chazaqayah (Hezekiah) later cut the gold from these doors for the king of Ashawar (Assyria).' },
    assumed: 'The opening (8 × 14) is a reading of "a fourth part".',
    parts: [{ kind: 'doors', x: EAST_X, y: 0, z: 0, w: 8, h: 14, t: 0.4, hinge: 'x', open: 'hayakal', fold: true, carved: true }],
  },
  {
    id: 'parakath', order: 15, group: 'inside', material: 'veil',
    tag: 'parakath (veil)', title: 'The parakath (veil) of thakalath (blue), aragaman (purple), karamayal (crimson) and bawatz (fine linen)',
    words: ['parakath', 'karawab'], keys: ['parakath', 'thakalath', 'aragaman', 'karamayal', 'bawatz'],
    on: V('14:3:14'),
    refs: '2 Chronicles 3:14',
    build: [21.5, 22.5], walk: 'veil',
    measures: [['of', 'thakalath (blue), aragaman (purple), karamayal (crimson), bawatz (fine) linen', '2 Chronicles 3:14'], ['worked with', 'karawab (cherubim)', '2 Chronicles 3:14']],
    note: 'Only Dabaray-Hayamayam (Chronicles) gives the veil: "{{2 Chronicles 3:14}}" It hangs before the olive doors of the dabayar (oracle), as the mashakan (tabernacle)\'s veil hung before its most holy place.',
    elsewhere: { ref: 'Exodus 26:31–33; Matthew 27:51; Hebrews 10:19–20', note: 'The tabernacle\'s veil of the same four threads, with cherubim, dividing the holy from the most holy; the veil of the hayakal (temple) torn in two from the top.' },
    assumed: 'Hung a cubit before the doors, the width of the doorway.',
    parts: [{ kind: 'veil', x: H.orX + 1.2, y: 0, z: 0, w: 8, h: 11, open: 'oracle' }],
  },
  {
    id: 'chatzar', order: 16, group: 'courts', material: 'stone',
    tag: 'chatzar (inner court)', title: 'The inner chatzar (court) — shalawash (three) courses of gazayath (stone) and one of araz (cedar)',
    words: ['chatzar', 'gazayath', 'araz'], keys: ['chatzar', 'izarah', 'courses'],
    on: V('11:6:36', '14:4:9'),
    refs: '1 Kings 6:36; 2 Chronicles 4:9',
    build: [22.5, 24.5], walk: 'court',
    measures: [['wall', '3 courses of cut gazayath (stone), 1 course of araz (cedar) karathath (beams)', '1 Kings 6:36'], ['called', 'the chatzar (court) of the kahanayam (priests); its doors overlaid with nachashath (brass)', '2 Chronicles 4:9']],
    note: '"{{1 Kings 6:36}}" The same wall bounds the great court (7:12). Within it stand the mazabach (altar), the yam (sea) on the right side toward the south, and the ten makanawath (bases).',
    elsewhere: { ref: 'Ezekiel 40:28–47; Psalm 84:2, 10; Isaiah 1:12', note: 'Yachazaqaal (Ezekiel)\'s inner court is a hundred amah square with the mazabach (altar) before the house. "For a yawam (day) in your chatzar (courts) is tawab (better) than a thousand."' },
    assumed: 'Its size (180 × 120) and its gates; the text gives the courses only.',
    parts: [...walls(INNER_COURT.x0, INNER_COURT.x1, INNER_COURT.z, INNER_COURT.wallT, H.courtY, INNER_COURT.wallH, { courses: 3, cedarTop: true }),
      box((INNER_COURT.x0 + INNER_COURT.x1) / 2, H.courtY - 0.2, 0, INNER_COURT.x1 - INNER_COURT.x0, 0.2, 2 * INNER_COURT.z, { role: 'ground', mat: 'ground' })],
    gates: [{ x: INNER_COURT.x1 + 1, z: 0, w: 12, axis: 'z' }, { x: 20, z: INNER_COURT.z + 1, w: 12, axis: 'x' }],
  },
  {
    id: 'mazabach', order: 17, group: 'courts', material: 'brass',
    tag: 'mazabach (altar) · nachashath (brass)', title: 'The mazabach (altar) of nachashath (brass)',
    words: ['mazabach', 'nachashath'], keys: ['mazabach'],
    on: V('14:4:1', '11:8:64'),
    refs: '2 Chronicles 4:1; 1 Kings 8:64; 9:25',
    build: [30, 31.5], walk: 'altar',
    measures: [['arak (length) · rachab (breadth)', '20 × 20 amah', '2 Chronicles 4:1'], ['qawamah (height)', '10 amah', '2 Chronicles 4:1']],
    note: '"{{2 Chronicles 4:1}}" Malakayam (Kings) gives it no measure but knows it: the brass altar before Yahawah was too little for the offerings of the dedication (1 Kings 8:64). It stands in the court before the porch, in line with the doors.',
    elsewhere: { ref: 'Exodus 27:1–8; Ezekiel 43:13–17; 2 Kings 16:14; Exodus 20:26', note: 'The mashakan (tabernacle)\'s altar was 5 × 5 × 3, of acacia and brass; Yachazaqaal (Ezekiel)\'s rises in ledges with steps toward the east. "Neither shall you go up by steps to my altar."' },
    assumed: 'The horns and the ramp on the south are not in the text (Exodus 20:26 forbids steps; Ezekiel\'s altar has them facing east).',
    parts: [box(ALTAR.x, H.courtY, ALTAR.z, ALTAR.w, ALTAR.h, ALTAR.w, { horns: true }),
      { kind: 'ramp', x: ALTAR.x, y: H.courtY, z: ALTAR.z + ALTAR.w / 2, w: 6, h: ALTAR.h, len: 24, dir: 'z' }],
  },
  {
    id: 'kayawar', order: 17.5, group: 'courts', material: 'brass', modes: ['dedicate'],
    tag: 'kayawar (scaffold) · nachashath (brass)', title: 'The nachashath (bronze) kayawar (scaffold) Shalamah (Solomon) kneeled on',
    words: ['kayawar', 'nachashath', 'qahal'], keys: ['kayawar'],
    on: V('14:6:12-13', '11:8:22', '11:8:54'),
    refs: '2 Chronicles 6:12–13; 1 Kings 8:22, 54',
    build: [1e9, 1e9 + 1], walk: null,
    measures: [['arak (length) · rachab (breadth)', '5 × 5 amah', '2 Chronicles 6:13'], ['qawamah (height)', '3 amah', '2 Chronicles 6:13'], ['set', 'in the thawak (midst) of the izarah (court)', '2 Chronicles 6:13']],
    note: 'Only Dabaray-Hayamayam (Chronicles) has it: "{{2 Chronicles 6:13 | For Shalamah … izarah}}" — the malak (king) stood on it before the mazabach (altar), kneeled, and spread his hands toward shamayam (heavens) for the whole prayer of the dedication. It is on the model only in the Dedicate story, where it belongs.',
    elsewhere: { ref: '1 Kings 8:22, 54; Nehemiah 8:4', note: 'Malakayam (Kings) has the malak (king) stand before the altar and rise from kneeling, without naming what he stood on; Izara (Ezra) later reads the law from a wooden pulpit made for the purpose.' },
    assumed: 'Its place — east of the mazabach (altar), facing the house — is a reading of "in the midst of the court"; the text gives its size, not its spot.',
    parts: [box(ALTAR.x + 19, H.courtY, 0, 5, 3, 5), box(ALTAR.x + 19, H.courtY + 3, 0, 5.4, 0.3, 5.4)],
  },
  {
    // the figure itself is placed by the Dedicate story (TempleScene's buildDedication) inside this piece's group, so a click on him opens this card
    id: 'malak', order: 17.6, group: 'courts', material: 'brass', modes: ['dedicate'],
    tag: 'malak (king) · Shalamah (Solomon)', title: 'Shalamah (Solomon) the malak (king), at his thapalah (prayer)',
    words: ['malak', 'shalamah', 'thapalah', 'barak', 'kayawar', 'qahal'], keys: ['malak', 'shalamah', 'thapalah'],
    on: V('11:8:22-23', '11:8:54', '14:6:12-13'),
    refs: '1 Kings 8:22–53, 54; 2 Chronicles 6:12–42',
    build: [1e9, 1e9 + 1], walk: null,
    measures: [['stands', 'before the mazabach (altar), before all the qahal (assembly)', '1 Kings 8:22; 2 Chronicles 6:12'], ['on', 'the nachashath (bronze) kayawar (scaffold)', '2 Chronicles 6:13'], ['hands', 'spread toward shamayam (heavens)', '1 Kings 8:22, 54'], ['kneels', 'on his knees, through the thapalah (prayer)', '1 Kings 8:54; 2 Chronicles 6:13']],
    note: 'The man on the kayawar is the malak (king): "{{1 Kings 8:22}}" He blesses the qahal (assembly) standing, then kneels for the whole thapalah (prayer) — "{{1 Kings 8:54}}" — and stands again to bless them. The prayer is the heart of both accounts (1 Kings 8:23–53; 2 Chronicles 6:14–42); the story\'s captions quote its opening and its end.',
    elsewhere: { ref: '1 Kings 8:62–66; 2 Chronicles 7:4–10; 1 Kings 3:5–15', note: 'After the prayer the malak (king) and all the people offer the zabach (sacrifices) and keep the chag (feast); at Gabaiwan (Gibeon) he had asked for a hearing heart, and here he asks that this bayath (house) be heard.' },
    assumed: 'A faceless figure in a royal robe (its colour is not in the text). His place on the scaffold, east of the mazabach (altar) facing the house, is the model\'s reading of "in the midst of the court".',
    parts: [],
  },
  {
    id: 'yam', order: 18, group: 'courts', material: 'brass',
    tag: 'yam (sea) · shanayam ishar (twelve) oxen', title: 'The yatzaq (molten) yam (sea) on twelve oxen',
    words: ['yam', 'shawar', 'shawashan', 'nachashath'], keys: ['yam', 'oxen', 'shapah', 'igal', 'kawas', 'bath', 'bathayam', 'buds'],
    on: V('11:7:23-26', '11:7:39', '11:7:44', '14:4:2-6', '14:4:10', '14:4:15'),
    refs: '1 Kings 7:23–26, 39; 2 Chronicles 4:2–6, 10',
    build: [29, 30.5], walk: 'yam',
    measures: [['shapah (brim) to shapah (brim)', '10 amah, igal (round)', '1 Kings 7:23'], ['qawamah (height)', '5 amah', '1 Kings 7:23'], ['a qaw (line) around it', '30 amah', '1 Kings 7:23'], ['ibay (thick)', 'a tapach (handbreadth)', '1 Kings 7:26'], ['brim', 'like the shapah (brim) of a kawas (cup), the parach (flower) of a shawashan (lily)', '1 Kings 7:26'], ['under the brim', 'buds in two rows, cast with it (Chronicles: the likeness of oxen)', '1 Kings 7:24; 2 Chronicles 4:3'], ['holds', '2,000 bath (Kings) · 3,000 bathayam (Chronicles)', '1 Kings 7:26; 2 Chronicles 4:5'], ['stands on', 'twelve oxen, three facing each way, hinder parts inward', '1 Kings 7:25'], ['for', 'the kahanayam (priests) to rachatz (wash) in', '2 Chronicles 4:6']],
    note: '"{{1 Kings 7:25 | It imad … mazarach}}" — three oxen look to each quarter of the sky and the yam (sea) rests on their backs. It is set "{{1 Kings 7:39 | on the yamanay … nagab}}" — the south-east of the court, between the altar and the house. In the app\'s rendering of 7:25 the twelve stand as "shanayam (two)"; the count is the text\'s ishar shanayam.',
    elsewhere: { ref: 'Exodus 30:18–21; Revelation 4:6; 15:2; Jeremiah 52:17, 20; Ezekiel 47:1', note: 'The laver of the mashakan (tabernacle) for washing hands and feet; "before the kasaa (throne) a yam (sea) of glass like crystal"; the Chaldeans broke the sea and its oxen and carried the brass to Babal (Babylon).' },
    assumed: 'The oxen\'s height and the bowl\'s curve.',
    parts: [{ kind: 'sea', x: SEA.x, y: H.courtY, z: SEA.z, r: SEA.r, h: SEA.h, oxH: SEA.oxH, glb: 'temple-ox' }],
  },
  {
    id: 'makanawath', order: 19, group: 'courts', material: 'brass',
    tag: 'makanawath (bases) · basins', title: 'The ishar (ten) makanawath (bases) of nachashath (brass) with their basins',
    words: ['makawanah', 'awapan', 'nachashath', 'karawab', 'thamar'], keys: ['makanawath', 'makawanah', 'awapan', 'awapanay', 'awapanayam', 'basin', 'basins', 'shalabayam', 'panels', 'arayawath', 'marakabah', 'lachath', 'mawatzaq', 'pedestal'],
    on: V('11:7:27-39', '11:7:43', '14:4:6', '14:4:14'),
    refs: '1 Kings 7:27–39, 43; 2 Chronicles 4:6, 14',
    build: [29.5, 31.5], walk: 'bases',
    measures: [['each makawanah (base)', '4 × 4 amah, 3 high', '1 Kings 7:27'], ['awapanayam (wheels)', 'four of brass, 1½ amah high, like a marakabah (chariot) wheel', '1 Kings 7:30, 32–33'], ['panels', 'arayawath (lions), oxen, karawab (cherubim), thamar (palm) trees; wreaths beneath', '1 Kings 7:29, 36'], ['the round top', '½ amah high, its pah (mouth) 1½ amah', '1 Kings 7:31, 35'], ['each basin', '4 amah across, 40 bath', '1 Kings 7:38'], ['placed', 'five on the right side of the house, five on the left', '1 Kings 7:39'], ['for', 'washing what belongs to the burnt offering', '2 Chronicles 4:6']],
    note: '"{{1 Kings 7:37 | In this way … form}}" — ten identical carts of cast brass on chariot wheels, each carrying a basin, five along the south side of the house and five along the north. Their panels carry lions, oxen and cherubim between the ledges.',
    elsewhere: { ref: 'Exodus 30:18; Ezekiel 1:15–21; 2 Kings 16:17; Jeremiah 52:17', note: 'Yachazaqaal (Ezekiel)\'s living creatures also go on wheels; Achaz (Ahaz) cut the panels from the bases and took down the sea from its oxen.' },
    assumed: 'Their spacing along the house.',
    parts: BASES.xs.flatMap((x) => [1, -1].map((s) => ({ kind: 'base', x, y: H.courtY, z: s * BASES.z, w: BASES.w, h: BASES.h, wheel: BASES.wheel, basinR: BASES.basinR, glb: 'temple-base' }))),
  },
  {
    id: 'pillars', order: 20, group: 'courts', material: 'brass',
    tag: 'Yakayan (Jachin) · Baiz (Boaz)', title: 'The shanayam (two) imawadayam (pillars) of nachashath (brass): Yakayan (Jachin) and Baiz (Boaz)',
    words: ['imawad', 'yakayan', 'baiz', 'shabakah', 'ramawan', 'shawashan', 'nachashath'], keys: ['imawad', 'imawadayam', 'imadayam', 'imawaday', 'yakayan', 'baiz', 'shabakah', 'shabakayam', 'shabakawath', 'ramawanayam', 'ramanayam', 'shawashan', 'capital', 'capitals', 'gadalayam', 'galath', 'galawath', 'batan', 'chawat', 'tzawar'],
    on: V('11:7:15-22', '11:7:41-42', '14:3:15-17', '14:4:12-13'),
    refs: '1 Kings 7:15–22, 41–42; 2 Chronicles 3:15–17; 4:12–13',
    build: [28, 29.5], walk: 'pillars',
    measures: [['qawamah (height)', '18 amah each (Chronicles: 35 for the pair)', '1 Kings 7:15; 2 Chronicles 3:15'], ['chawat (line) about each', '12 amah', '1 Kings 7:15'], ['capital', 'yatzaq (molten) brass, 5 amah high', '1 Kings 7:16'], ['on the capital', 'shabakayam (nets) of checker work, gadalayam (wreaths) of chain work, seven each', '1 Kings 7:17'], ['ramawanayam (pomegranates)', 'two rows, 200 on each capital — 400 for the two networks', '1 Kings 7:18, 20, 42'], ['shawashan (lily) work', '4 amah, at the top', '1 Kings 7:19, 22'], ['names', 'the yamanay (right) Yakayan, the shamaalay (left) Baiz', '1 Kings 7:21']],
    note: '"{{1 Kings 7:21 | He qawam … Baiz}}" Chayaram (Hiram) of Tzar (Tyre), ban (son) of a widow of Napathalay (Naphtali), cast them in the clay ground of the Yaradan (Jordan) between Sakawath (Succoth) and Tzarathan (Zarethan) (7:46). Yakayan (Jachin) stands on the south, the right hand of one facing the house\'s east; Baiz (Boaz) on the north.',
    elsewhere: { ref: 'Jeremiah 52:21–23; 2 Kings 25:13, 17; Revelation 3:12; Galatians 2:9', note: 'Yaramayahaw (Jeremiah) measured them as they were broken: 18 amah high, 12 about, four fingers thick and hollow, 96 pomegranates on a side and a hundred in all round about. "He who overcomes, I will make him an imawad (pillar) in the hayakal (temple) of my Alahayam."' },
    assumed: 'Free-standing at the porch (7:21 places them at the porch; 2 Chronicles 3:17 before the temple); the hollow of Jeremiah 52:21 is not drawn.',
    parts: [{ kind: 'pillar', x: PILLAR.x, y: 0, z: PILLAR.z, r: PILLAR.r, h: PILLAR.h, capH: PILLAR.capH, lilyH: PILLAR.lilyH, name: 'yakayan', glb: 'temple-capital' },
      { kind: 'pillar', x: PILLAR.x, y: 0, z: -PILLAR.z, r: PILLAR.r, h: PILLAR.h, capH: PILLAR.capH, lilyH: PILLAR.lilyH, name: 'baiz', glb: 'temple-capital' }],
  },
  {
    id: 'gold-altar', order: 21, group: 'inside', material: 'gold',
    tag: 'mazabach (altar) · zahab (gold)', title: 'The zahab (gold) mazabach (altar) before the dabayar (oracle)',
    words: ['mazabach', 'zahab', 'araz'], keys: ['mazabach'],
    on: V('11:6:20', '11:6:22', '11:7:48', '14:4:19'),
    refs: '1 Kings 6:20, 22; 7:48; 2 Chronicles 4:19; Exodus 30:1–6',
    build: [31, 32.5], walk: 'lamps',
    measures: [['covered', 'araz (cedar), then zahab (gold)', '1 Kings 6:20, 22'], ['pattern', '1 × 1 amah, 2 high, with horns (the altar of incense)', 'Exodus 30:1–3'], ['place', 'before the veil that is by the ark', 'Exodus 30:6']],
    note: '"{{1 Kings 6:22 | the whole mazabach … zahab}}" — the altar that belonged to the dabayar (oracle) stood before it in the hayakal (temple), the golden altar of 7:48.',
    elsewhere: { ref: 'Exodus 30:1–10; Revelation 8:3; Luke 1:11', note: 'Aharan (Aaron) burns qatarath (incense) on it morning and evening; the golden altar before the throne.' },
    assumed: 'Its size follows the tabernacle\'s altar of incense; the text here gives none.',
    parts: [box(H.orX + 4, 0.4, 0, 1, 2, 1, { horns: true, mat: 'gold' })],
  },
  {
    id: 'manawarah', order: 22, group: 'inside', material: 'gold',
    tag: 'manawarah (lampstands)', title: 'Ishar (ten) lampstands of sagar (pure) zahab (gold)',
    words: ['manawarah', 'zahab'], keys: ['lampstands', 'lampstand', 'narath', 'narawath', 'nayar', 'malaqachayam', 'mazamarawath', 'parach'],
    on: V('11:7:49', '14:4:7', '14:4:20-21'),
    refs: '1 Kings 7:49; 2 Chronicles 4:7, 20–21; Exodus 25:31–40',
    build: [31.5, 33], walk: 'lamps',
    measures: [['number', 'ten — five on the right, five on the left, before the dabayar', '1 Kings 7:49'], ['of', 'sagar (pure) zahab (gold), with their parach (flowers), narath (lamps), malaqachayam (tongs)', '1 Kings 7:49'], ['pattern', '"according to the mashapat (ordinance)": the seven-branched lampstand of hammered gold', '2 Chronicles 4:7; Exodus 25:31–37']],
    note: '"{{1 Kings 7:49 | And the lampstands … zahab}}" — where the mashakan (tabernacle) had one, this house has ten, in two rows down the hayakal (temple), their lamps burning before the oracle "according to the ordinance" (2 Chronicles 4:20).',
    elsewhere: { ref: 'Exodus 25:31–40; 37:17–24; Zechariah 4:2; Revelation 1:12–13, 20', note: 'The lampstand with six branches, cups like almond blossoms, buds and flowers; the seven golden lampstands among which the Son of Man walks.' },
    assumed: 'Placed along the walls of the hayakal in two rows; the text gives only right and left.',
    parts: [-3, 3, 9, 15, 21].flatMap((x) => [1, -1].map((s) => ({ kind: 'lampstand', x, y: 0.4, z: s * 7, h: 3, glb: 'temple-lampstand' }))),
  },
  {
    id: 'shalachan', order: 23, group: 'inside', material: 'gold',
    tag: 'shalachan (tables) · lacham (bread)', title: 'The shalachan (table) of the show lacham (bread) — ten of zahab (gold)',
    words: ['shalachan', 'lacham', 'zahab'], keys: ['shalachan', 'shalachanawath', 'lacham', 'sapawath', 'kapawath', 'machathah'],
    on: V('11:7:48', '11:7:50', '14:4:8', '14:4:19', '14:4:22'),
    refs: '1 Kings 7:48, 50; 2 Chronicles 4:8, 19, 22; Exodus 25:23–30',
    build: [32, 33.5], walk: 'lamps',
    measures: [['Kings', 'the shalachan (table) of the show lacham (bread), of zahab (gold)', '1 Kings 7:48'], ['Chronicles', 'ten shalachanawath (tables), five right and five left; a hundred basins of gold', '2 Chronicles 4:8'], ['pattern', '2 × 1 amah, 1½ high, with its dishes, spoons, cups and bowls', 'Exodus 25:23–29']],
    note: 'Malakayam (Kings) names the table; Dabaray-Hayamayam (Chronicles) counts ten, "{{2 Chronicles 4:8 | chamash … shamaawal}}". The model shows the ten, in two rows between the lampstands and the middle of the hall.',
    elsewhere: { ref: 'Exodus 25:23–30; Leviticus 24:5–9; 1 Samuel 21:6; Matthew 12:4', note: 'Twelve loaves set in two rows every shabath (sabbath) before Yahawah; the bread Dawad (David) ate.' },
    assumed: 'The tables\' size follows Exodus 25:23; their places in the hall are a guess.',
    parts: [0, 6, 12, 18, 24].flatMap((x) => [1, -1].map((s) => ({ kind: 'table', x, y: 0.4, z: s * 4.2, glb: 'temple-table' }))),
  },
  {
    id: 'great-court', order: 24, group: 'courts', material: 'stone',
    tag: 'gadawal (great) chatzar (court)', title: 'The gadawal (great) chatzar (court) around all',
    words: ['chatzar', 'gazayath', 'araz'], keys: ['gadawal', 'tapach', 'magarah'],
    on: V('11:7:9', '11:7:12', '14:4:9'),
    refs: '1 Kings 7:9, 12; 2 Chronicles 4:9',
    build: [27, 28.5], walk: 'gate',
    measures: [['wall', 'three courses of gazayath (stone) and one of araz (cedar) beams — like the inner court', '1 Kings 7:12'], ['stones', 'yaqar (costly), sawed to madah (measure), from the foundation to the coping', '1 Kings 7:9'], ['doors', 'overlaid with nachashath (brass)', '2 Chronicles 4:9']],
    note: '"{{1 Kings 7:12 | The gadawal … karathath}}" — the outer wall, of the same three-and-one courses as the inner court and the porch of the house, encloses the house of Yahawah and the king\'s houses together.',
    elsewhere: { ref: '2 Kings 21:5; 23:12; Ezekiel 40:17–19; 42:20', note: 'Manashah (Manasseh) built altars in the two chatzarawath (courts) of the house; Yachazaqaal (Ezekiel)\'s outer court is 500 reeds square.' },
    assumed: 'Its size and gates; the text gives its wall.',
    parts: [
      box((GREAT_COURT.x0 + GREAT_COURT.x1) / 2, H.courtY, GREAT_COURT.z1 + GREAT_COURT.wallT / 2, GREAT_COURT.x1 - GREAT_COURT.x0 + 2 * GREAT_COURT.wallT, GREAT_COURT.wallH, GREAT_COURT.wallT, { courses: 3, cedarTop: true, role: 'south' }),
      box((GREAT_COURT.x0 + GREAT_COURT.x1) / 2, H.courtY, GREAT_COURT.z0 - GREAT_COURT.wallT / 2, GREAT_COURT.x1 - GREAT_COURT.x0 + 2 * GREAT_COURT.wallT, GREAT_COURT.wallH, GREAT_COURT.wallT, { courses: 3, cedarTop: true, role: 'north' }),
      box(GREAT_COURT.x0 - GREAT_COURT.wallT / 2, H.courtY, (GREAT_COURT.z0 + GREAT_COURT.z1) / 2, GREAT_COURT.wallT, GREAT_COURT.wallH, GREAT_COURT.z1 - GREAT_COURT.z0, { courses: 3, cedarTop: true, role: 'west' }),
      box(GREAT_COURT.x1 + GREAT_COURT.wallT / 2, H.courtY, (GREAT_COURT.z0 + GREAT_COURT.z1) / 2, GREAT_COURT.wallT, GREAT_COURT.wallH, GREAT_COURT.z1 - GREAT_COURT.z0, { courses: 3, cedarTop: true, role: 'east' }),
      box((GREAT_COURT.x0 + GREAT_COURT.x1) / 2, H.courtY - 0.4, (GREAT_COURT.z0 + GREAT_COURT.z1) / 2, GREAT_COURT.x1 - GREAT_COURT.x0, 0.2, GREAT_COURT.z1 - GREAT_COURT.z0, { role: 'ground', mat: 'ground' }),
    ],
    gates: [{ x: GREAT_COURT.x1 + 1.5, z: 0, w: 14, axis: 'z' }],
  },
  {
    id: 'yair', order: 25, group: 'palace', material: 'stone',
    tag: 'bayath yair Labanawan (house of the forest)', title: 'The bayath (house) of the yair (forest) of Labanawan (Lebanon)',
    words: ['yair', 'labanawan', 'imawad', 'araz'], keys: ['yair', 'labanawan', 'tawaray', 'tawarayam', 'tzalaith', 'paimayam', 'pathachayam', 'mazawazawath', 'shields', 'maganayam'],
    on: V('11:7:2-5', '11:10:17'),
    refs: '1 Kings 7:2–5; 10:17, 21; Isaiah 22:8',
    build: [24, 26], walk: 'gate',
    measures: [['arak (length)', '100 amah', '1 Kings 7:2'], ['rachab (breadth)', '50 amah', '1 Kings 7:2'], ['qawamah (height)', '30 amah', '1 Kings 7:2'], ['imawaday (pillars)', 'four tawaray (rows) of araz (cedar), with cedar beams on them', '1 Kings 7:2'], ['tzalaith (beams / chambers)', '45, fifteen in a row, over the pillars', '1 Kings 7:3'], ['windows', 'three ranks, window against window', '1 Kings 7:4–5'], ['shields', 'three hundred of beaten gold hung in it', '1 Kings 10:17']],
    note: '"{{1 Kings 7:2 | its arak … imawaday}}" — a hall of cedar columns so many it was named for the forest they came from. Shalamah (Solomon) hung his shields of beaten gold in it (10:17); it was the armoury of the house (Isaiah 22:8).',
    elsewhere: { ref: '1 Kings 10:17, 21; 2 Chronicles 9:16, 20; Isaiah 22:8', note: 'Three hundred shields of gold, the drinking vessels of gold — "none were of silver; it was nothing accounted of in the days of Shalamah (Solomon)".' },
    assumed: 'Its place along the west wall of the great court, stood north–south, and its door on the east; the whole layout of the king\'s buildings — the text describes them one by one and never says where each stood.',
    idealized: 'The forty-five tzalaith of 7:3, "fifteen in a row", are read here as three storeys of chambers along the long walls — eight on the west and seven on the east of each floor, their windows facing each other across the hall in three ranks (7:4) — with a stair at the south end climbing through them to the roof. The chambers, their floors and the stair are sketched in; the hall, its four rows of pillars, its windows and the gold shields on the pillars are the text\'s.',
    parts: (() => {
      const F = PALACE.forest, W = 3, out = [];
      out.push(...walls(F.x0, F.x1, (F.z1 - F.z0) / 2, W, Y0, F.h, { windows: 3 }).map((b) => ({ ...b, z: b.z + (F.z0 + F.z1) / 2 })));
      out.push(...roofOf(F.x0 - W, F.x1 + W, F.z0 - W, F.z1 + W, Y0 + F.h - 2, [{ x0: -97, x1: -90, z0: 160.5, z1: 163.5 }]));
      // four rows of cedar pillars down the nave (x −117…−83), fourteen to a row, with gold shields on every other one
      for (const x of [-110.2, -103.4, -96.6, -89.8]) for (let i = 0; i < 14; i++) { const z = 70 + i * (86 / 13); out.push(cyl(x, Y0, z, 1.1, F.h - 2.6, { mat: 'cedar', role: 'column' })); if (i % 2 === 0) out.push(...shields(x, z, Y0 + 9)); }
      out.push(box(-100, Y0 + F.h - 2.6, 115, 34, 0.6, 100, { mat: 'cedar', role: 'ceiling' }));
      // three storeys of chambers along both long walls (floors at −4, 5, 14), a walkway with a rail on the upper floors
      [Y0, Y0 + 9, Y0 + 18].forEach((y, k) => {
        const h = k === 2 ? F.h - 2.6 - 18 : 8;
        out.push(...chambers(F.x0, F.x0 + 6, F.z0, 156, 8, y, h));
        if (k === 0) { out.push(...chambers(F.x1, F.x1 - 6, F.z0, 76, 1, y, h)); out.push(...chambers(F.x1, F.x1 - 6, 88, 156, 6, y, h)); }
        else out.push(...chambers(F.x1, F.x1 - 6, F.z0, 156, 7, y, h));
        if (k > 0) {
          out.push(...slab(F.x0, F.x0 + 8, F.z0, F.z1, y), ...slab(F.x1 - 8, F.x1, F.z0, F.z1, y), ...slab(F.x0 + 8, F.x1 - 8, 156, F.z1, y, [{ x0: -122, x1: -92, z0: 160.5, z1: 163.5 }]));
          out.push(...rail('z', F.z0, 156, F.x0 + 8, y), ...rail('z', F.z0, 156, F.x1 - 8, y), ...rail('x', F.x0 + 8, F.x1 - 8, 156, y));
        }
      });
      // the stair hall at the south end: one straight flight of thirty steps along the south wall, up through the floors to the roof
      out.push(...stair('x', -122, 162, 30, 3));
      out.push(...paving(F.x0, F.x1, F.z0, F.z1));
      out.push(...doorFrame(F.x1 + W / 2, 82, 8, 6, W, 'z'));
      return out.map((q) => (q.mat === 'plaster' ? { ...q, mat: 'plaster2' } : q));
    })(),
    gates: [{ x: PALACE.forest.x1 + 1.5, z: 82, w: 8, axis: 'z', leaves: false }],
  },
  {
    id: 'porch-pillars', order: 26, group: 'palace', material: 'stone',
    tag: 'awalam (porch) of imawadayam (pillars)', title: 'The awalam (porch) of imawadayam (pillars)',
    words: ['awalam', 'imawad'], keys: ['threshold'],
    on: V('11:7:6'),
    refs: '1 Kings 7:6',
    build: [25, 26.5], walk: 'gate',
    measures: [['arak (length)', '50 amah', '1 Kings 7:6'], ['rachab (breadth)', '30 amah', '1 Kings 7:6'], ['before it', 'a awalam (porch), imawadayam (pillars) and a threshold', '1 Kings 7:6']],
    note: '"{{1 Kings 7:6}}" A hall of pillars with a lesser porch of pillars before it — the way in from the inner court\'s south gate to the porch of the throne behind, and to the king\'s house beyond that (7:7–8).',
    elsewhere: { ref: 'Ezekiel 40:48–49; John 10:23; Acts 3:11; Acts 5:12', note: '"Shalamah (Solomon)\'s porch" of John 10:23 and Acts 3:11; 5:12 is not this: it is the colonnade on the east of the second temple\'s outer court, called after him because it was held to stand on his eastern wall of the mount. It belongs to that later house, not to 1 Kings 7.' },
    assumed: 'Its place, on the line from the inner court\'s south gate; that it is a roofed hall walled on three sides and open to the north, its two rows of pillars, and the four pillars of the lesser porch before it — the text gives the measures, "pillars", and a porch with pillars and a beam before them.',
    parts: (() => {
      const P = PALACE.hall, out = [];
      out.push(...walls(P.x0, P.x1, (P.z1 - P.z0) / 2, 3, Y0, P.h).map((b) => ({ ...b, z: b.z + (P.z0 + P.z1) / 2 })).filter((b) => b.role !== 'north'));
      out.push(...roofOf(P.x0 - 3, P.x1 + 3, P.z0 - 3, P.z1 + 3, Y0 + P.h - 1.5));
      for (const z of [80, 90]) for (let i = 0; i < 6; i++) out.push(cyl(P.x0 + 5 + i * 8, Y0, z, 1.2, P.h - 2, { mat: 'stone', role: 'column' }));
      out.push(box((P.x0 + P.x1) / 2, Y0 + P.h - 2.1, (P.z0 + P.z1) / 2, P.x1 - P.x0, 0.6, P.z1 - P.z0, { mat: 'cedar', role: 'ceiling' }));
      out.push(...portico(8, 32, 66, 11, 4), box(20, Y0 + 12.2, 66.5, 30, 1.2, 8, { mat: 'cedar', role: 'roof' }));
      out.push(box((P.x0 + P.x1) / 2, Y0, (P.z0 + P.z1) / 2, P.x1 - P.x0, 0.3, P.z1 - P.z0, { mat: 'paving', role: 'pavement' }), box(20, Y0, 66, 32, 0.3, 8, { mat: 'paving', role: 'pavement' }));
      out.push(...doorFrame(20, P.z1 + 1.5, 8, 7, 3));
      return out;
    })(),
    gates: [{ x: 20, z: PALACE.hall.z1 + 1.5, w: 8, axis: 'x', leaves: false }],
  },
  {
    id: 'porch-throne', order: 27, group: 'palace', material: 'stone',
    tag: 'awalam (porch) of the kasaa (throne)', title: 'The awalam (porch) of the kasaa (throne) — the awalam (porch) of mashapat (judgment)',
    words: ['awalam', 'kasaa', 'mashapat', 'araz'], keys: ['shapat', 'judgment'],
    on: V('11:7:7'),
    refs: '1 Kings 7:7',
    build: [26, 27.5], walk: 'gate',
    measures: [['covered', 'araz (cedar) from qaraqai (floor) to qaraqai (floor)', '1 Kings 7:7']],
    note: '"{{1 Kings 7:7 | He ishah … mashapat}}" — where the king sat to judge, behind the hall of pillars; its walls, floor and ceiling of cedar. The kasaa (throne) itself stands at its far end.',
    elsewhere: { ref: '1 Kings 3:16–28; Psalm 122:5; Isaiah 6:1', note: '"There are set kasaawath (thrones) for mashapat (judgment), the thrones of the house of Dawad (David)."' },
    assumed: 'Its size (30 × 30) and place, behind the porch of pillars and open to it; the text gives the cedar from floor to floor.',
    parts: (() => {
      const T = PALACE.throne, out = [];
      out.push(...walls(T.x0, T.x1, (T.z1 - T.z0) / 2, 3, Y0, T.h).map((b) => ({ ...b, z: b.z + (T.z0 + T.z1) / 2 })).filter((b) => b.role !== 'north'));
      out.push(...roofOf(T.x0 - 3, T.x1 + 3, T.z0 - 3, T.z1 + 3, Y0 + T.h - 1.5));
      out.push(...cedarLining(T.x0, T.x1, T.z0, T.z1, Y0, T.h - 1.5).filter((b) => !(b.role === 'lining' && b.d < 1 && b.z < T.z0 + 1)).map((b) => ({ ...b, mat: 'cedarDark' })));
      out.push(...portico(T.x0 + 5, T.x1 - 5, T.z0, T.h - 2, 3));
      out.push(...rug(20, 113, 6, 18, 'rug-runner').map((r) => ({ ...r, y: Y0 + 0.4 })));
      return out;
    })(),
  },
  {
    id: 'kasaa', order: 27.5, group: 'palace', material: 'ivory',
    tag: 'kasaa (throne) · shan (ivory)', title: 'The gadawal (great) kasaa (throne) of shan (ivory), overlaid with zahab (gold)',
    words: ['kasaa', 'zahab'], keys: ['kasaa', 'shan', 'ivory', 'arayawath', 'lions', 'mailawath'],
    on: V('11:10:18-20', '14:9:17-19'),
    refs: '1 Kings 10:18–20; 2 Chronicles 9:17–19',
    build: [27, 27.5], walk: 'gate',
    measures: [['made of', 'shan (ivory), overlaid with tawab (fine) zahab (gold)', '1 Kings 10:18'], ['steps', 'shash (six)', '1 Kings 10:19'], ['the top', 'round behind; stays on either side of the seat', '1 Kings 10:19'], ['lions', 'two by the stays; twelve on the six steps, one at each end of each', '1 Kings 10:19–20'], ['footstool', 'of gold, fastened to the throne', '2 Chronicles 9:18']],
    note: '"{{1 Kings 10:18}} {{1 Kings 10:20 | Twelve … mamalakah}}." — set here in the porch of judgment (7:7), where "he might judge".',
    elsewhere: { ref: '1 Kings 7:7; Psalm 122:5; Matthew 19:28; Revelation 4:2', note: 'The thrones of the house of Dawad (David) set for judgment; twelve thrones to judge the twelve tribes.' },
    assumed: 'Its size, the lions\' forms and which way they face (turned here to look down the steps at the one ascending — the text gives their number and places, not their facing), and that it stands in the porch of the throne — the text says he made it, not where it stood.',
    parts: [{ kind: 'throne', x: 20, y: Y0 + 0.6, z: 126, glb: 'temple-throne', rot: -Math.PI / 2 }],
  },
  {
    id: 'king-house', order: 28, group: 'palace', material: 'stone',
    tag: 'bayath (house) of the malak (king)', title: 'The bayath (house) where he was to yashab (dwell)',
    words: ['bayath', 'chatzar', 'gazayath'], keys: ['yashab'],
    on: V('11:7:1', '11:7:8', '11:7:12'),
    refs: '1 Kings 7:1, 8, 12',
    build: [26.5, 28], walk: 'gate',
    measures: [['building', 'thirteen shanah (years)', '1 Kings 7:1'], ['where', 'the other chatzar (court), within the porch', '1 Kings 7:8'], ['work', '"of like work" — as the porches', '1 Kings 7:8'], ['the court', 'three courses of hewn stone and a course of cedar beams, as the great court', '1 Kings 7:12']],
    note: '"{{1 Kings 7:8 | His bayath … maishah}}" — the king\'s dwelling in a court of its own behind the porches.',
    elsewhere: { ref: '2 Kings 4:10; Deuteronomy 22:8; 2 Samuel 11:2; 1 Kings 17:12–16', note: 'What scripture says a house had: an upper chamber with a bed, a table, a seat and a lampstand; a roof to walk on, with a parapet; jars of meal and oil in store.' },
    assumed: 'Its size and place east of the porches — the text gives none.',
    idealized: 'The plan is the model\'s, kept within what scripture says of houses. A colonnade "of like work" as the porches (7:8) opens onto the court within; round the court, below, a hall with a table and seats, a sitting room, a storeroom with jars and chests, the servants\' room and the stair; above, the king\'s upper chamber with the bed, table, seat and lampstand of 2 Kings 4:10, a second chamber, a third to the south, and a gallery round the court; a second stair from the upper landing through the roof to the roof, which has a parapet about it (Deuteronomy 22:8). All of it sketched in.',
    parts: (() => {
      const K = PALACE.king, out = [];
      const cx = (K.x0 + K.x1) / 2, cz = (K.z0 + K.z1) / 2, ox0 = 67, ox1 = 93, oz0 = 123, oz1 = 145;
      out.push(...walls(K.x0, K.x1, (K.z1 - K.z0) / 2, 3, Y0, K.h).map((b) => ({ ...b, z: b.z + cz })).filter((b) => b.role !== 'north'));
      out.push(...portico(K.x0 + 5, K.x1 - 5, K.z0 + 2, 12, 7));
      out.push(...roofOf(K.x0 - 3, K.x1 + 3, K.z0 - 3, K.z1 + 3, Y0 + K.h - 1.5, [{ x0: ox0, x1: ox1, z0: oz0, z1: oz1 }, { x0: 51.5, x1: 56, z0: 150.5, z1: 153.5 }]));
      for (let i = 0; i <= 3; i++) for (const z of [oz0, oz1]) out.push(ideal(cyl(ox0 + (i / 3) * (ox1 - ox0), Y0, z, 0.9, K.h - 1.5, { mat: 'cedar', role: 'column' })));
      for (let i = 1; i < 3; i++) for (const x of [ox0, ox1]) out.push(ideal(cyl(x, Y0, oz0 + (i / 3) * (oz1 - oz0), 0.9, K.h - 1.5, { mat: 'cedar', role: 'column' })));
      out.push(...paving(K.x0, K.x1, K.z0, K.z1));
      const G = 10, U = Y0 + 10;
      out.push(...wallZ(ox0, 108, K.z1, G, 116), ...wallX(135, K.x0, ox0, G, 56), ...wallZ(ox1, 108, K.z1, G, 116), ...wallX(135, ox1, K.x1, G, 104), ...wallX(oz1, ox0, ox1, G, cx));
      out.push(...wallZ(ox0, 135, K.z1, G, 150), ...wallZ(ox1, 135, K.z1, G, 150));
      out.push(...rug(56, 120, 10, 14), ...table(56, 118, 3, 6), ...seat(52, 118), ...seat(60, 118), ...seat(56, 115), ...seat(56, 121), ...lamp(49, 111));
      out.push(...stair('z', 48, 137, 10, 3), ...jars(59, 152, 6));
      out.push(...rug(104, 121, 9, 12, 'rug-runner'), ...couch(104, 118), ...seat(98, 124), ...table(104, 124, 2.5, 3.5), ...lamp(111, 110), ...jars(97, 152, 9), ...chest(110, 160), ...chest(110, 150));
      out.push(...bed(74, 155, 2.6, 5.5), ...bed(86, 155, 2.6, 5.5));
      out.push(...slab(K.x0, K.x1, K.z0, K.z1, U, [{ x0: ox0 - 3, x1: ox1 + 3, z0: oz0 - 3, z1: oz1 + 3 }, { x0: 46, x1: 50, z0: 142.5, z1: 147 }]));
      out.push(...rail('x', ox0 - 3, ox1 + 3, oz0 - 3, U), ...rail('x', ox0 - 3, ox1 + 3, oz1 + 3, U), ...rail('z', oz0 - 3, oz1 + 3, ox0 - 3, U), ...rail('z', oz0 - 3, oz1 + 3, ox1 + 3, U));
      const H2 = K.h - 10 - 1.5;
      out.push(...wallZ(ox0 - 4, 108, 135, H2, 122, 3, U), ...wallX(135, K.x0, ox0 - 4, H2, null, 3, U), ...wallZ(ox1 + 4, 108, 135, H2, 122, 3, U), ...wallX(135, ox1 + 4, K.x1, H2, null, 3, U), ...wallX(oz1 + 4, ox0 - 4, ox1 + 4, H2, cx, 3, U));
      out.push(...rug(56, 121, 10, 14, 'rug', U), ...bed(53, 112, 3.4, 6.5, U), ...table(58, 126, 2.6, 4, U), ...seat(58, 129, U), ...lamp(49, 130, U), ...chest(63, 112, U));
      out.push(...bed(108, 112, 3.2, 6, U), ...seat(103, 126, U), ...table(103, 130, 2.2, 3.5, U), ...lamp(111, 130, U));
      out.push(...bed(75, 158, 3, 5.5, U), ...bed(87, 158, 3, 5.5, U), ...lamp(80, 152, U));
      out.push(...stair('x', 46, 152, 10, 3, 1, U));   // from the upper landing, east along it, through the roof
      return out;
    })(),
  },
  {
    id: 'daughter-house', order: 28.5, group: 'palace', material: 'stone',
    tag: 'bayath (house) of Paraih (Pharaoh)\'s banath (daughter)', title: 'The bayath (house) for Paraih (Pharaoh)\'s banath (daughter)',
    words: ['bayath', 'awalam'], keys: ['paraih', 'banath', 'wife'],
    on: V('11:7:8', '11:3:1', '11:9:24', '14:8:11'),
    refs: '1 Kings 7:8; 3:1; 9:24; 2 Chronicles 8:11',
    build: [27, 28], walk: 'gate',
    measures: [['made', 'a house like this porch', '1 Kings 7:8'], ['for', 'Paraih (Pharaoh)\'s daughter, whom he had taken to wife', '1 Kings 7:8'], ['she came', 'up out of the city of Dawad (David) into her house', '1 Kings 9:24']],
    note: '"{{1 Kings 7:8 | Shalamah also … banath}}" — a house of the same work as the porch, for the daughter of Paraih (Pharaoh), whom he brought up out of the city of Dawad (David) into it (9:24).',
    elsewhere: { ref: '2 Chronicles 8:11; Song of Songs 4:12–15; Ecclesiastes 2:5–6', note: '"My wife shall not dwell in the house of Dawad (David) malak (king) of Yashar-Al (Israel), because the places are holy where the arawan (ark) of Yahawah has come" (2 Chronicles 8:11). "I made me gardens and orchards … pools of water" (Ecclesiastes 2:5–6).' },
    assumed: 'Its size and place, between the house of the forest and the porches — the text gives none.',
    idealized: 'The plan is the model\'s. A colonnade on the east, facing the porches, opens into a garden court with trees and a pool (Ecclesiastes 2:5–6); her chamber on the west with the bed, table, seat and lampstand of 2 Kings 4:10; a hall to the north, a room for her maids, a storeroom, and a stair to the roof with its parapet. All of it sketched in.',
    parts: (() => {
      const D = PALACE.daughter, out = [];
      const cz = (D.z0 + D.z1) / 2, gx0 = -52, gx1 = -24, gz0 = 115, gz1 = 145;
      out.push(...walls(D.x0, D.x1, (D.z1 - D.z0) / 2, 3, Y0, D.h).map((b) => ({ ...b, z: b.z + cz })).filter((b) => b.role !== 'east'));
      out.push(...porticoZ(D.z0 + 5, D.z1 - 5, D.x1 - 2, 12, 6));
      out.push(...roofOf(D.x0 - 3, D.x1 + 3, D.z0 - 3, D.z1 + 3, Y0 + D.h - 1.5, [{ x0: gx0, x1: gx1, z0: gz0, z1: gz1 }, { x0: -41, x1: -36, z0: 149, z1: 152 }]));
      out.push(...paving(D.x0, D.x1, D.z0, D.z1));
      out.push(...pool(-38, 130, 8, 6));
      for (const [x, z] of [[-49, 118], [-27, 118], [-49, 142], [-27, 142], [-38, 118], [-49, 130], [-27, 130], [-38, 142]]) out.push(...tree(x, z, 6 + (Math.abs(x + z) % 3)));
      out.push(ideal(box(-38, Y0 + 0.05, 130, gx1 - gx0, 0.15, gz1 - gz0, { mat: 'garden', role: 'lawn' })));
      const G = D.h - 1.5;
      out.push(...wallZ(gx0, gz0, gz1, G, 135), ...wallX(135, D.x0, gx0, G), ...wallX(gz0, D.x0, D.x1 - 4, G, -38), ...wallX(gz1, D.x0, D.x1 - 4, G, -46), ...wallZ(gx1, gz0, gz1, G, 122));
      out.push(...rug(-59, 127, 8, 12), ...bed(-60, 124, 3.2, 6), ...table(-57, 131, 2.4, 3.6), ...seat(-57, 128), ...lamp(-64, 132), ...chest(-55, 120));
      out.push(...bed(-61, 141, 2.6, 5), ...bed(-61, 150, 2.6, 5), ...chest(-55, 146));
      out.push(...rug(-38, 109, 14, 8, 'rug-runner'), ...table(-38, 109, 3, 6), ...seat(-42, 109), ...seat(-34, 109), ...seat(-38, 106), ...seat(-38, 112), ...couch(-22, 110), ...lamp(-14, 106));
      out.push(...jars(-62, 149, 6), ...jars(-48, 150, 6), ...chest(-40, 152));
      out.push(...stair('x', -50, 150.5, 14, 3));
      return out.map((q) => (q.mat === 'plaster' ? { ...q, mat: 'plaster2' } : q));
    })(),
  },
];

export function pieceById(id) { return PIECES.find((p) => p.id === id) || null; }
export const GROUPS = { house: 'The bayath (house)', inside: 'Within', courts: 'The chatzarawath (courts)', palace: 'The malak (king)\'s houses' };

// ── The passages the model is drawn from ─────────────────────────────────────
// Books: 11 = 1 Kings, 14 = 2 Chronicles (the app's own numbering).
export const PASSAGES = [
  { bookId: 11, book: '1 Kings', chapter: 6, from: 1, to: 38, label: '1 Kings 6', modes: ['build', 'walk', 'roam'] },
  { bookId: 11, book: '1 Kings', chapter: 7, from: 1, to: 51, label: '1 Kings 7', modes: ['build', 'walk', 'roam'] },
  { bookId: 14, book: '2 Chronicles', chapter: 3, from: 1, to: 17, label: '2 Chronicles 3', modes: ['build', 'walk', 'roam'] },
  { bookId: 14, book: '2 Chronicles', chapter: 4, from: 1, to: 22, label: '2 Chronicles 4', modes: ['build', 'walk', 'roam'] },
  // the dedication — 1 Kings 8 leads, Chronicles beneath (it alone has the singers, the scaffold and the fire)
  { bookId: 11, book: '1 Kings', chapter: 8, from: 1, to: 66, label: '1 Kings 8', modes: ['dedicate'] },
  { bookId: 14, book: '2 Chronicles', chapter: 5, from: 1, to: 14, label: '2 Chronicles 5', modes: ['dedicate'] },
  { bookId: 14, book: '2 Chronicles', chapter: 6, from: 1, to: 42, label: '2 Chronicles 6', modes: ['dedicate'] },
  { bookId: 14, book: '2 Chronicles', chapter: 7, from: 1, to: 22, label: '2 Chronicles 7', modes: ['dedicate'] },
];
export const ALL_REFS = '1 Kings 6:1–7:51; 2 Chronicles 3:1–4:22';
export const DEDICATE_REFS = '1 Kings 8:1–66; 2 Chronicles 5:1–7:22';
export const passagesFor = (mode) => PASSAGES.filter((p) => !p.modes || p.modes.includes(mode));
export const refsFor = (mode) => (mode === 'dedicate' ? DEDICATE_REFS : ALL_REFS);

/**
 * Which piece a "translit (gloss)" word in the passage belongs to, if any.
 * Words that name many things (bayath, araz, zahab, aban, dalathawath, awalam,
 * mazabach, chatzar, imawadayam) are settled by WHERE they stand — book, chapter
 * and verse — in the RULES first; then a piece's own keys.
 */
const R = (book, chapter, verses, words, piece) => ({ book, chapter, verses, words, piece });
const RULES = [
  // the whole house
  R(11, 6, [1, 2, 14, 37, 38], ['bayath'], 'house'), R(11, 7, [51], ['bayath'], 'house'), R(14, 3, [1, 2, 3], ['bayath'], 'house'),
  // araz (cedar) by place
  R(11, 6, [9, 10], ['araz', 'itz'], 'roof'), R(14, 3, [5], ['araz', 'barawash', 'itz', 'chapah'], 'roof'),
  R(11, 6, [15, 16, 18], ['araz', 'barawash', 'itz', 'tzalaiwath', 'qaraqai'], 'araz'),
  R(11, 6, [20], ['araz'], 'gold-altar'),
  R(11, 6, [36], ['araz', 'gazayath', 'karathath', 'courses'], 'chatzar'), R(11, 7, [12], ['araz', 'gazayath', 'karathath', 'courses'], 'great-court'),
  R(11, 7, [2, 3], ['araz', 'imawaday', 'imawadayam', 'karathawath', 'tzalaith'], 'yair'), R(11, 7, [7], ['araz', 'awalam', 'kasaa', 'shapat', 'mashapat'], 'porch-throne'),
  R(11, 7, [11], ['araz', 'aban', 'abanayam'], 'yasad'),
  // zahab (gold) by place
  R(11, 6, [20, 21, 22, 30], ['zahab', 'sagar', 'overlaid'], 'zahab'), R(14, 3, [4, 5, 6, 7, 8, 9], ['zahab', 'tahawar', 'tawab', 'overlaid', 'parawayam', 'kakarayam', 'masamarawath', 'shaqalayam'], 'zahab'),
  R(11, 6, [28], ['zahab'], 'karawab'), R(14, 3, [10], ['zahab'], 'karawab'), R(11, 6, [32], ['zahab', 'radad'], 'oracle-doors'), R(11, 6, [35], ['zahab'], 'doors'),
  R(11, 7, [48], ['zahab', 'mazabach'], 'gold-altar'), R(14, 4, [19], ['mazabach'], 'gold-altar'),
  // aban (stone)
  R(11, 6, [7], ['aban', 'maqabah', 'kalay', 'barazal', 'quarry'], 'qayar'), R(11, 6, [18], ['aban'], 'araz'), R(11, 7, [9, 10], ['aban', 'abanayam', 'yaqar', 'gazayath', 'masad', 'magarah'], 'yasad'), R(14, 3, [6], ['aban', 'yaqar'], 'zahab'),
  // doors
  R(11, 6, [31, 32], ['dalathawath', 'dalath', 'pathach', 'shaman', 'itz', 'ayal', 'mazawazah'], 'oracle-doors'), R(11, 6, [33, 34, 35], ['dalathawath', 'dalath', 'pathach', 'shaman', 'barawash', 'itz', 'mazawazah', 'galayal', 'leaves'], 'doors'),
  R(11, 7, [50], ['dalathawath', 'pathawath'], 'doors'), R(14, 4, [22], ['dalathay'], 'doors'), R(14, 4, [9], ['dalathawath'], 'great-court'),
  // awalam (porch)
  R(11, 6, [3], ['awalam', 'hayakal'], 'awalam'), R(14, 3, [4], ['awalam'], 'awalam'), R(11, 7, [6], ['awalam', 'imawadayam', 'threshold'], 'porch-pillars'), R(11, 7, [8], ['awalam', 'bayath', 'chatzar', 'yashab'], 'king-house'), R(11, 7, [8], ['paraih', 'banath'], 'daughter-house'), R(11, 9, [24], ['paraih', 'banath', 'bayath'], 'daughter-house'), R(11, 10, [18, 19, 20], ['kasaa', 'shan', 'arayawath', 'mailawath', 'zahab'], 'kasaa'), R(14, 9, [17, 18, 19], ['kasaa', 'shan', 'arayawath', 'mailawath', 'zahab', 'kabash'], 'kasaa'),
  R(11, 7, [12, 19, 21], ['awalam'], 'awalam'),
  // mazabach (altar)
  R(14, 4, [1], ['mazabach', 'nachashath'], 'mazabach'), R(11, 6, [20, 22], ['mazabach'], 'gold-altar'),
  // chatzar (court)
  R(11, 7, [9, 12], ['chatzar', 'gadawal', 'tapach'], 'great-court'), R(14, 4, [9], ['izarah', 'gadawal'], 'great-court'), R(11, 6, [36], ['chatzar'], 'chatzar'), R(14, 4, [9], ['chatzar', 'kahanayam'], 'chatzar'),
  // the walls
  R(11, 6, [5, 6], ['qayar', 'qayarawath', 'offsets'], 'qayar'), R(11, 6, [15, 29], ['qayarawath'], 'araz'), R(11, 6, [27], ['qayar'], 'karawab'), R(14, 3, [7], ['qayarawath', 'qarawath', 'sapayam', 'dalath'], 'zahab'), R(14, 3, [11, 12], ['qayar'], 'karawab'),
  // the hayakal as a room
  R(11, 6, [17], ['hayakal'], 'araz'), R(11, 6, [5, 33], ['hayakal'], 'qayar'), R(14, 4, [7, 8], ['hayakal'], 'manawarah'),
  // the yam & its oxen (Chronicles says damawath of oxen)
  R(14, 4, [3, 4, 15], ['oxen', 'damawath'], 'yam'), R(11, 7, [44], ['oxen'], 'yam'),
  // the vessels (the pieces that hold them)
  R(11, 7, [40, 45], ['basins', 'sayarawath', 'yaiyam', 'kalayam'], 'makanawath'), R(14, 4, [11, 16], ['basins', 'sayarawath', 'yaiyam', 'forks', 'kalay'], 'makanawath'),
  R(11, 7, [49, 50], ['basins', 'sapawath', 'kapawath', 'machathah', 'mazamarawath'], 'shalachan'), R(14, 4, [8], ['basins'], 'shalachan'), R(14, 4, [22], ['basins', 'kapawath', 'machathah', 'mazamarawath'], 'shalachan'),
  R(14, 4, [6], ['basins', 'rachatz', 'dawach'], 'makanawath'),
  // the pillars' capitals/bowls in the summary lists
  R(11, 7, [41, 42], ['galath', 'capitals', 'shabakawath', 'shabakah', 'ramanayam'], 'pillars'), R(14, 4, [12, 13], ['galawath', 'capitals', 'networks', 'shabakawath', 'shabakah', 'ramawanayam'], 'pillars'),
  R(14, 3, [15, 16, 17], ['imawadayam', 'imadayam', 'capital', 'sharasharawath', 'ramawanayam'], 'pillars'),
  // the karawab carved on walls/doors are the lining/doors, not the two great ones
  R(11, 6, [29], ['karawab', 'thamar', 'tzatzayam', 'pathawach'], 'araz'), R(11, 6, [32], ['karawab', 'thamar', 'tzatzayam', 'maqalaiwath'], 'oracle-doors'), R(11, 6, [35], ['karawab', 'thamar', 'tzatzayam'], 'doors'),
  R(11, 7, [29, 36], ['karawab', 'thamar', 'arayawath', 'oxen'], 'makanawath'), R(14, 3, [7], ['karawab'], 'zahab'), R(14, 3, [14], ['karawab'], 'parakath'), R(14, 3, [5], ['thamar', 'sharasharawath'], 'roof'),
  // the stairs/door of the chambers
  R(11, 6, [8], ['pathach', 'yamanay', 'kathap', 'lawal', 'stairs'], 'tzalai'),
  // the floor
  R(11, 6, [30], ['qaraqai'], 'zahab'),
  // the dedication (1 Kings 8; 2 Chronicles 5–7): the ark under the wings, the altar, the scaffold, the courts
  R(11, 8, [6, 7, 8], ['arawan', 'karawab', 'kanapay', 'kanapayam', 'dabayar', 'poles'], 'arawan'), R(14, 5, [7, 8, 9], ['arawan', 'karawab', 'dabayar', 'poles'], 'arawan'),
  R(11, 8, [22, 31, 54, 64], ['mazabach'], 'mazabach'), R(14, 6, [12, 22], ['mazabach'], 'mazabach'), R(14, 7, [7, 9], ['mazabach'], 'mazabach'), R(14, 5, [12], ['mazabach'], 'mazabach'),
  R(14, 6, [13], ['kayawar', 'izarah', 'nachashath', 'bronze'], 'kayawar'),
  R(11, 8, [22, 54, 55], ['shalamah', 'malak', 'kneeling', 'kneeled', 'knees', 'hands', 'kapayaw', 'thapalah'], 'malak'), R(14, 6, [12, 13, 14], ['shalamah', 'malak', 'kneeled', 'knees', 'hands', 'kapayaw', 'thapalah'], 'malak'),
  R(11, 8, [64], ['chatzar'], 'chatzar'), R(14, 7, [7], ['chatzar'], 'chatzar'),
  R(11, 8, [6], ['bayath'], 'house'), R(11, 8, [10, 11, 13, 63], ['bayath'], 'house'), R(14, 5, [13, 14], ['bayath'], 'house'), R(14, 7, [1, 2, 3, 5, 16], ['bayath'], 'house'),
];
const KEY_INDEX = PIECES.flatMap((p) => p.keys.map((k) => [k, p.id]));
export function pieceForWord(word, book, chapter, verse) {
  const w = word.toLowerCase();
  for (const r of RULES) if (r.book === book && r.chapter === chapter && r.verses.includes(verse) && r.words.some((k) => w === k || w.startsWith(k))) return r.piece;
  // 'bayath' outside its summary verses is just "the house" of the sentence — not a piece
  if (w === 'bayath') return null;
  for (const [k, id] of KEY_INDEX) if (w === k) return id;
  for (const [k, id] of KEY_INDEX) if (k.length > 4 && w.startsWith(k)) return id;
  return null;
}

// ── Timelines ────────────────────────────────────────────────────────────────
export const SPEEDS = [0.25, 0.5, 1, 2];
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const ease = { out: (u) => 1 - (1 - u) * (1 - u), inOut: smooth };

// BUILD — captions quote the live text in the order the chapters give it.
const SITE_PHASES = [
  { from: 0,    key: 'yasad',    caption: '{{1 Kings 6:37 | In the rabayaiy … Zaw}}.', ref: '1 Kings 6:37' },
  { from: 3,    key: 'qayar',    caption: '{{1 Kings 6:7 | The bayath … quarry}}; {{1 Kings 6:7 | there was neither … build}}.', ref: '1 Kings 6:7' },
  { from: 4.5,  key: 'tzalai',   caption: '{{1 Kings 6:5 | Against the qayar … around}} — {{1 Kings 6:6 | The thachathawan … broad}}.', ref: '1 Kings 6:5–6' },
  { from: 6.5,  key: 'chalawan', caption: '{{1 Kings 6:4}}', ref: '1 Kings 6:4' },
  { from: 7.5,  key: 'awalam',   caption: '{{1 Kings 6:3 | The awalam … bayath}}; {{2 Chronicles 3:4 | the gabah … isharayam}}.', ref: '1 Kings 6:3; 2 Chronicles 3:4' },
  { from: 9.5,  key: 'roof',     caption: '{{1 Kings 6:9 | So he banah … araz}}.', ref: '1 Kings 6:9' },
  { from: 11.5, key: 'araz',     caption: '{{1 Kings 6:18 | There was araz … raah}}', ref: '1 Kings 6:18' },
  { from: 13,   key: 'dabayar',  caption: '{{1 Kings 6:19 | He kawan … Yahawah}}.', ref: '1 Kings 6:19' },
  { from: 14.5, key: 'zahab',    caption: '{{1 Kings 6:22 | The whole bayath … finished}}.', ref: '1 Kings 6:22' },
  { from: 16,   key: 'chains',   caption: '{{1 Kings 6:21 | he drew … dabayar}}.', ref: '1 Kings 6:21' },
  { from: 17,   key: 'karawab',  caption: '{{1 Kings 6:23}} {{1 Kings 6:27 | the kanapay … bayath}}.', ref: '1 Kings 6:23, 27' },
  { from: 20,   key: 'doors',    caption: '{{1 Kings 6:31 | For the pathach … itz}}; {{1 Kings 6:34 | And shanayam … galayal}}.', ref: '1 Kings 6:31, 34' },
  { from: 21.5, key: 'parakath', caption: '{{2 Chronicles 3:14}}', ref: '2 Chronicles 3:14' },
  { from: 22.5, key: 'chatzar',  caption: '{{1 Kings 6:36}} {{1 Kings 6:38 | So was he … it}}.', ref: '1 Kings 6:36, 38' },
  { from: 24,   key: 'palace',   caption: '{{1 Kings 7:1 | Shalamah … shanah}}. {{1 Kings 7:2 | he banah … Labanawan}}.', ref: '1 Kings 7:1–2' },
  { from: 26,   key: 'palace2',  caption: '{{1 Kings 7:6 | He ishah … amah}}. {{1 Kings 7:7 | He ishah … mashapat}}. {{1 Kings 7:8 | His bayath … maishah}}.', ref: '1 Kings 7:6–8' },
  { from: 27,   key: 'great',    caption: '{{1 Kings 7:12 | The gadawal … karathath}}.', ref: '1 Kings 7:12' },
  { from: 28,   key: 'pillars',  caption: '{{1 Kings 7:14 | He bawaa … malaakah}}. {{1 Kings 7:21 | He qawam … Baiz}}.', ref: '1 Kings 7:14, 21' },
  { from: 29,   key: 'yam',      caption: '{{1 Kings 7:23 | He ishah … to shapah}}, {{1 Kings 7:25 | It imad … mazarach}}.', ref: '1 Kings 7:23, 25' },
  { from: 29.5, key: 'bases',    caption: '{{1 Kings 7:27 | He ishah … nachashath}}; {{1 Kings 7:39 | He nathan … bayath}}.', ref: '1 Kings 7:27, 39' },
  { from: 30,   key: 'altar',    caption: '{{2 Chronicles 4:1}}', ref: '2 Chronicles 4:1' },
  { from: 31,   key: 'vessels',  caption: '{{1 Kings 7:48 | Shalamah … Yahawah}}: {{1 Kings 7:48 | the zahab … of zahab}}; {{1 Kings 7:49 | And the lampstands … zahab}}.', ref: '1 Kings 7:48–49' },
  { from: 33.5, key: 'finished', caption: '{{1 Kings 7:51 | Thus all … shalam}}.', ref: '1 Kings 7:51' },
  { from: 34.5, key: 'arawan',   caption: '{{1 Kings 8:6 | The kahanayam … karawab}}.', ref: '1 Kings 8:6' },
];
const SITE_DURATION = 36;
// See-through stretches of the build: the roof, the south wall and the porch's
// south side go to glass so the work inside shows.
const SITE_XRAY = [[11.3, 22.2], [30.8, 33.6]];
// Where the eye is during the build (the viewer may take the camera; the next
// keyframe hands it back). [t, position, target].
const SITE_CAMERA = [
  [0,    [190, 110, 200], [0, 30, 20]],
  [3,    [110, 45, 110],  [0, 10, 0]],
  [7.5,  [95, 40, 85],    [10, 14, 0]],
  [9.5,  [80, 70, 70],    [10, 30, 0]],
  [11.5, [45, 48, 42],    [0, 8, 0]],
  [14.5, [30, 30, 26],    [-8, 8, 0]],
  [17,   [-11, 9, 6],     [-20, 6, 0]],
  [20,   [54, 12, 14],    [36, 8, 0]],
  [22.5, [130, 60, 110],  [20, 4, 0]],
  [24,   [230, 130, 280], [0, 5, 90]],
  [27,   [270, 150, 260], [0, 5, 60]],
  [28,   [95, 24, 46],    [50, 12, 8]],
  [29,   [85, 16, 44],    [58, 4, 30]],
  [29.5, [60, 14, 60],    [-6, 2, 33]],
  [30,   [110, 24, 40],   [76, 5, 0]],
  [31,   [32, 12, 10],    [4, 6, 0]],
  [33.5, [200, 120, 215], [10, 40, 20]],
  [34.5, [-8, 6, 6],      [-20, 6, 0]],
  [36,   [-13, 5, 3],     [-20, 7, 0]],
];


// ── The gathering: where the house's materials came from ─────────────────────
// The Build story opens on a relief map of the land, drawn at ONE MAP UNIT = ⅓ km
// (not to the house's cubit scale — the house is a dot at this scale), with
// Yarawashalam (Jerusalem) at the origin, x east, z south. Positions are the
// real lie of the places, idealised; the routes are the text's: Labanawan's
// araz and barawash down to the yam, in rafts to Yapaw, up to Yarawashalam
// (1 Kings 5:22–23; 2 Chronicles 2:15); stones cut in the har (5:29–32);
// the brass cast in the kakar of the Yaradan between Sakawath and Tzarathan
// (7:46); the zahab out of Dawad's store in the city of Dawad (1 Chronicles
// 29:2–4) — and the zahab of Parawayam (2 Chronicles 3:6), whose place the
// text does not give, so it comes in from the far south-east, marked so.
export const GATHER_DURATION = 14;
export const MAP_KM = 3;                        // map units per km
export const PLACES = {
  labanawan:   { at: [-20, -600], label: 'Labanawan (Lebanon)' },
  tzar:        { at: [-64, -495], label: 'Tzar (Tyre)' },
  yapaw:       { at: [-152, -36], label: 'Yapaw (Joppa)' },
  yarawashalam:{ at: [0, 0],      label: 'Yarawashalam (Jerusalem)' },
  har:         { at: [-14, -34],  label: 'the har (quarry)' },
  sakawath:    { at: [105, -135], label: 'Sakawath (Succoth)' },
  tzarathan:   { at: [92, -118],  label: 'Tzarathan (Zarethan)' },
  dawad:       { at: [4, 14],     label: 'city of Dawad (David)' },
  parawayam:   { at: [330, 330],  label: 'Parawayam (Parvaim) — place not given' },
  yam:         { at: [-300, -200], label: 'the yam (sea)' },
  yaradan:     { at: [78, -60],   label: 'Yaradan (Jordan)' },
};
// Routes as polylines (map units); the scene draws them and slides the movers along them.
export const ROUTES = {
  raft:   { pts: [[-82, -472], [-115, -400], [-145, -300], [-168, -200], [-175, -100], [-153, -36]], material: 'cedar' },
  cedar:  { pts: [[-152, -36], [-110, -24], [-60, -10], [-10, -1]], material: 'cedar' },
  stone:  { pts: [[-14, -34], [-10, -16], [-6, -3]], material: 'stone' },
  brass:  { pts: [[105, -135], [82, -96], [46, -54], [14, -14], [3, -2]], material: 'brass' },
  gold:   { pts: [[4, 14], [3, 5], [1, 1]], material: 'gold' },
  parawayam: { pts: [[330, 330], [230, 215], [120, 110], [40, 36], [3, 3]], material: 'gold' },
};
// Every mover: which route, when it sets out, how long it takes. `kind` picks the mesh.
export const MOVERS = [
  ...[0, 1, 2, 3].map((i) => ({ route: 'raft', kind: 'raft', t0: 0.4 + i * 0.9, dur: 6.4 })),
  ...[0, 1, 2].map((i) => ({ route: 'cedar', kind: 'cart', load: 'logs', t0: 7.2 + i * 0.8, dur: 4.6 })),
  ...[0, 1, 2, 3].map((i) => ({ route: 'stone', kind: 'sledge', load: 'stone', t0: 4 + i * 0.9, dur: 4.2 })),
  ...[0, 1, 2].map((i) => ({ route: 'brass', kind: 'cart', load: 'brass', t0: 8.6 + i * 0.7, dur: 4.4 })),
  ...[0, 1].map((i) => ({ route: 'gold', kind: 'cart', load: 'gold', t0: 11 + i * 0.7, dur: 2.2 })),
  ...[0, 1, 2].map((i) => ({ route: 'parawayam', kind: 'caravan', load: 'gold', t0: 2.5 + i * 0.9, dur: 9.5 })),
];
/** Where a mover is at t: { u (0…1 along its route), visible } — gone once it has arrived. */
export function moverAt(m, t) {
  const u = (t - m.t0) / m.dur;
  return { u: clamp01(u), visible: u > 0 && u < 1 };
}
/** The map's presence at t of the BUILD story: 1 on the map, fading to 0 as the eye lands on the site. */
export function landAt(mode, t) {
  if (mode !== 'build') return 0;
  return 1 - smooth((t - (GATHER_DURATION - 2.2)) / 2.2);
}
export const GATHER_PHASES = [
  { from: 0,    key: 'gather-cedar', caption: '{{2 Chronicles 2:15 | we will cut … Yarawashalam}}.', ref: '2 Chronicles 2:15' },
  { from: 3,    key: 'gather-rafts', caption: '{{1 Kings 5:23 | My servants … yam}}; {{1 Kings 5:23 | I will nathan … receive them}}.', ref: '1 Kings 5:23' },
  { from: 5.5,  key: 'gather-stone', caption: '{{1 Kings 5:29}} {{1 Kings 5:32}}', ref: '1 Kings 5:29, 32' },
  { from: 8.5,  key: 'gather-brass', caption: '{{1 Kings 7:46}}', ref: '1 Kings 7:46' },
  { from: 11,   key: 'gather-gold',  caption: '{{1 Chronicles 29:4 | Even shalawash … Awapayar}} — and {{2 Chronicles 3:6 | the zahab … Parawayam}}.', ref: '1 Chronicles 29:4; 2 Chronicles 3:6' },
];
export const GATHER_REFS = '1 Kings 5:20–32; 2 Chronicles 2:8–17; 1 Kings 7:46; 1 Chronicles 22:2–4, 14; 29:2–4; 2 Chronicles 3:6';
export const GATHER_CAMERA = [
  [0,    [-320, 520, 180],  [-80, 0, -320]],
  [4,    [-290, 260, 110],  [-110, 0, -130]],
  [7,    [-90, 190, 130],   [-40, 0, -30]],
  [9.5,  [140, 230, 30],    [60, 0, -80]],
  [12,   [130, 170, 210],   [0, 0, 20]],
];
export const BUILD_PHASES = [...GATHER_PHASES, ...SITE_PHASES.map((p) => ({ ...p, from: p.from + GATHER_DURATION }))];
export const BUILD_DURATION = GATHER_DURATION + SITE_DURATION;
export const BUILD_XRAY = SITE_XRAY.map(([a, b]) => [a + GATHER_DURATION, b + GATHER_DURATION]);
export const BUILD_CAMERA = [...GATHER_CAMERA, ...SITE_CAMERA.map(([t, p, g]) => [t + GATHER_DURATION, p, g])];

// WALK — in through the gate, to the ark.
export const WALK_PHASES = [
  { from: 0,    key: 'gate',    caption: '{{1 Kings 7:12 | The gadawal … karathath}}.', ref: '1 Kings 7:12' },
  { from: 4,    key: 'court',   caption: '{{1 Kings 6:36}}', ref: '1 Kings 6:36' },
  { from: 8,    key: 'altar',   caption: '{{2 Chronicles 4:1}}', ref: '2 Chronicles 4:1' },
  { from: 11,   key: 'yam',     caption: '{{1 Kings 7:23 | He ishah … to shapah}}; {{1 Kings 7:25 | It imad … mazarach}}.', ref: '1 Kings 7:23, 25' },
  { from: 14,   key: 'bases',   caption: '{{1 Kings 7:27 | He ishah … nachashath}}; {{1 Kings 7:29 | And on the panels … karawab}}.', ref: '1 Kings 7:27, 29' },
  { from: 17,   key: 'pillars', caption: '{{1 Kings 7:21 | He qawam … Baiz}}.', ref: '1 Kings 7:21' },
  { from: 19.5, key: 'capital', caption: '{{1 Kings 7:18 | there were shanayam … pillars}}; {{1 Kings 7:19 | The capitals … amawath}}.', ref: '1 Kings 7:18–19' },
  { from: 22,   key: 'porch',   caption: '{{1 Kings 6:3 | The awalam … bayath}}.', ref: '1 Kings 6:3' },
  { from: 23.5, key: 'doors',   caption: '{{1 Kings 6:34 | And shanayam … galayal}}. {{1 Kings 6:35 | He qalai … tzatzayam}}.', ref: '1 Kings 6:34–35' },
  { from: 25,   key: 'hayakal', caption: '{{1 Kings 6:17}} {{1 Kings 6:29 | He qalai … outside}}.', ref: '1 Kings 6:17, 29' },
  { from: 28,   key: 'lamps',   caption: '{{1 Kings 7:49 | And the lampstands … zahab}}.', ref: '1 Kings 7:49' },
  { from: 31,   key: 'veil',    caption: '{{2 Chronicles 3:14}} {{1 Kings 6:21 | he drew … dabayar}}.', ref: '2 Chronicles 3:14; 1 Kings 6:21' },
  { from: 34,   key: 'dabayar', caption: '{{1 Kings 6:20 | Within the dabayar … zahab}}.', ref: '1 Kings 6:20' },
  { from: 36.5, key: 'karawab', caption: '{{1 Kings 6:27 | the kanapay … bayath}}.', ref: '1 Kings 6:27' },
  { from: 39,   key: 'arawan',  caption: '{{1 Kings 8:7}}', ref: '1 Kings 8:6–7' },
];
export const WALK_DURATION = 42;
export const WALK_CAMERA = [
  [0,    [300, 120, 200],  [0, 30, 30]],
  [4,    [140, 7, 2],      [60, 8, 0]],
  [8,    [104, 6, 6],      [76, 6, 0]],
  [11,   [76, 8, 22],      [58, 5, 32]],
  [12.5, [72, 7, 46],      [58, 4, 32]],
  [14,   [44, 7, 50],      [-6, 3, 33]],
  [17,   [66, 10, 14],     [48, 14, 0]],
  [19.5, [61, 22, -4],     [49.2, 21.5, 7.6]],
  [22,   [50, 8, 0],       [36, 8, 0]],
  [23.5, [47, 9, 0],       [36, 7, 0]],
  [25,   [31, 8, 0],       [0, 10, 0]],
  [28,   [20, 6, 2],       [4, 5, 7]],
  [31,   [3, 7, 0],        [-10, 8, 0]],
  [34,   [-9.2, 5, 1],     [-20, 6.5, 0]],
  [36.5, [-12.4, 4, 2.8],  [-20, 5.5, -1]],
  [39,   [-12.6, 3.5, 2.5], [-20, 3, 0]],
  [42,   [-13.2, 3, 2],    [-20, 2.4, 0]],
];

// ROAM — no story: the finished house, and the viewer walks where they will.
export const ROAM_EYE = 3.4;                                                  // eye height above the ground, in cubits (≈ 1.7 m)
export const ROAM_START = { pos: [150, H.courtY + ROAM_EYE, 0], look: [100, H.courtY + ROAM_EYE, 0] };   // outside the great court's east gate, facing the house
export const ROAM_PHASES = [{ from: 0, key: 'roam', caption: 'Walk where you will — through the gates, around the yam (sea), between the pillars. Tap a part for its details; tap a door again to go through it.', ref: '' }];
/** Where a second tap on an openable piece takes the eye — just inside, facing on. */
export const ROAM_ENTER = {
  doors: { pos: [26, ROAM_EYE, 0], look: [0, ROAM_EYE, 0], open: 'hayakal' },
  'oracle-doors': { pos: [-13.5, ROAM_EYE, 0], look: [-20, ROAM_EYE, 0], open: 'dabayar' },
  parakath: { pos: [-13.5, ROAM_EYE, 0], look: [-20, ROAM_EYE, 0], open: 'dabayar' },
};

// DEDICATE — 1 Kings 8 (2 Chronicles 5–7 beneath): the ark carried in, the inan
// (cloud), the malak (king)'s prayer on the kayawar, the ash (fire) from shamayam,
// the kabawad (glory), the sacrifices, the chag (feast), the people sent home.
// The scene's own actors (the procession, the singers, the assembly, the cloud,
// the fire, the days of the feast) key off these times — see TempleScene's DED.
export const DEDICATE_PHASES = [
  { from: 0,   key: 'qahal',    caption: '{{1 Kings 8:1 | Then Shalamah … Tzayawan}}. {{1 Kings 8:2 | All the ayash … yarach}}.', ref: '1 Kings 8:1–2' },
  { from: 8,   key: 'nashaa',   caption: '{{1 Kings 8:3}} {{1 Kings 8:5 | Malak Shalamah … rab}}.', ref: '1 Kings 8:3, 5' },
  { from: 20,  key: 'arawan',   caption: '{{1 Kings 8:6}} {{1 Kings 8:7}}', ref: '1 Kings 8:6–7' },
  { from: 28,  key: 'poles',    caption: '{{1 Kings 8:8 | The poles … dabayar}}; {{1 Kings 8:9 | There was nothing … Charab}}.', ref: '1 Kings 8:8–9' },
  { from: 34,  key: 'singers',  caption: '{{2 Chronicles 5:12 | Also the Lawayay … chatzatzarawath}}; {{2 Chronicles 5:13 | It happened … iwalam}}!"', ref: '2 Chronicles 5:12–13' },
  { from: 41,  key: 'inan',     caption: '{{1 Kings 8:10}} {{1 Kings 8:11}}', ref: '1 Kings 8:10–11' },
  { from: 49,  key: 'shakan',   caption: '{{1 Kings 8:12}} {{1 Kings 8:13}}', ref: '1 Kings 8:12–13' },
  { from: 55,  key: 'kayawar',  caption: '{{1 Kings 8:22}} {{2 Chronicles 6:13 | For Shalamah … izarah}}.', ref: '1 Kings 8:22; 2 Chronicles 6:13' },
  { from: 63,  key: 'thapalah', caption: '{{1 Kings 8:27}} {{1 Kings 8:30 | Shamai … salach}}.', ref: '1 Kings 8:27, 30' },
  { from: 72,  key: 'ash',      caption: '{{2 Chronicles 7:1}}', ref: '2 Chronicles 7:1' },
  { from: 80,  key: 'kabawad',  caption: '{{2 Chronicles 7:2}} {{2 Chronicles 7:3 | All the banay … iwalam}}."', ref: '2 Chronicles 7:2–3' },
  { from: 90,  key: 'zabach',   caption: '{{1 Kings 8:62}} {{1 Kings 8:63 | Shalamah zabach … Yahawah}}. {{1 Kings 8:64 | The same yawam … Yahawah}}.', ref: '1 Kings 8:62–64' },
  { from: 100, key: 'chag',     caption: '{{1 Kings 8:65}}', ref: '1 Kings 8:65' },
  { from: 110, key: 'shalach',  caption: '{{1 Kings 8:66}}', ref: '1 Kings 8:66' },
];
export const DEDICATE_DURATION = 120;
export const DEDICATE_CAMERA = [
  [0,   [200, 70, 150],   [110, 0, 10]],     // the assembly gathers in the courts
  [8,   [172, 10, 40],    [140, 3, 0]],      // the ark at the gate
  [14,  [128, 12, -56],   [86, 3, -24]],    // carried through the court, round the south of the kayawar and the altar, the assembly either side
  [20,  [70, 8, -26],     [48, 5, -2]],      // up the steps, into the porch
  [24,  [22, 8, 5],       [-8, 6, 0]],       // down the hall
  [28,  [-11, 6, 3],      [-20, 5, 0]],      // set down under the wings
  [33,  [-11, 6, 3],      [-20, 5, 0]],
  [34,  [110, 12, 34],    [90, 3, 0]],       // the singers, east of the altar
  [40,  [110, 12, 34],    [90, 3, 0]],
  [41,  [63, 6, 2],       [34, 7, 0]],       // the priests come out through the doors, between the pillars …
  [45.5,[63, 6, 2],       [34, 7, 0]],
  [49,  [24, 10, 3],      [-6, 9, 0]],       // … and the cloud fills the hall (the eye goes in through the doorway, not the jamb)
  [54,  [24, 10, 3],      [-6, 9, 0]],
  [55,  [112, 8, 18],     [95, 3, 0]],       // the king on the scaffold
  [63,  [102, 4, 7],      [95, 3.5, 0]],     // kneeling, hands to heaven
  [71,  [102, 4, 7],      [95, 3.5, 0]],
  [72,  [140, 34, 70],    [76, 22, 0]],      // fire from heaven on the altar
  [79,  [140, 34, 70],    [76, 22, 0]],
  [80,  [118, 13, 46],    [86, 3, 0]],       // the glory on the house; the people on the pavement before the altar
  [89,  [118, 13, 46],    [86, 3, 0]],
  [90,  [150, 40, 95],    [76, 6, 0]],       // the sacrifices
  [100, [240, 110, 210],  [20, 10, 20]],     // seven days
  [110, [175, 46, 140],   [128, 2, 0]],      // sent home through the gates
  [120, [260, 120, 220],  [0, 20, 20]],
];

export const MODES = {
  build: { label: 'Build', phases: BUILD_PHASES, duration: BUILD_DURATION, camera: BUILD_CAMERA, xray: BUILD_XRAY },
  dedicate: { label: 'Dedicate', phases: DEDICATE_PHASES, duration: DEDICATE_DURATION, camera: DEDICATE_CAMERA, xray: [] },
  walk:  { label: 'Walk',  phases: WALK_PHASES,  duration: WALK_DURATION,  camera: WALK_CAMERA,  xray: [] },
  roam:  { label: 'Roam',  phases: ROAM_PHASES,  duration: 1,              camera: [[0, ROAM_START.pos, ROAM_START.look]], xray: [], free: true },
};
export function phaseAt(mode, t) {
  const ph = MODES[mode].phases; let p = ph[0];
  for (const q of ph) if (t >= q.from) p = q;
  return p;
}

/** How far a piece has risen at t of the BUILD story: 0 (absent) … 1 (finished). In the WALK the whole house stands. */
export function progressAt(mode, piece, t) {
  if (piece.modes && !piece.modes.includes(mode)) return 0;   // the kayawar stands only for the dedication
  if (mode !== 'build') return 1;
  const [a, b] = piece.build;
  return smooth((t - GATHER_DURATION - a) / (b - a));
}
/** How see-through the roof/south side is at t (0 solid … 1 glass). */
export function xrayAt(mode, t) {
  let k = 0;
  for (const [a, b] of MODES[mode].xray) { const f = 0.5; k = Math.max(k, Math.min(smooth((t - a) / f), smooth((b - t) / f))); }
  return k;
}
/** How far the doors and the veil stand open at t (0 shut … 1 open). */
export function openAt(mode, which, t) {
  if (mode === 'build') return 0;
  if (mode === 'dedicate') return which === 'hayakal' ? smooth((t - 17) / 1.5) : smooth((t - 24) / 1.5);
  if (which === 'hayakal') return smooth((t - 23.6) / 1.3);
  return smooth((t - 32.6) / 1.4);   // the oracle's doors and the veil
}
/** The scripted eye at t: { pos:[x,y,z], target:[x,y,z] }, eased between keyframes. */
export function cameraAt(mode, t) {
  const keys = MODES[mode].camera;
  if (t <= keys[0][0]) return { pos: keys[0][1], target: keys[0][2] };
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, p0, g0] = keys[i - 1], [t1, p1, g1] = keys[i];
      const u = ease.inOut((t - t0) / (t1 - t0));
      const lerp = (a, b) => a.map((v, k) => v + (b[k] - v) * u);
      return { pos: lerp(p0, p1), target: lerp(g0, g1) };
    }
  }
  const last = keys[keys.length - 1];
  return { pos: last[1], target: last[2] };
}
/** Scrub-bar marks: the phases, thinned so labels do not pile up. */
export function marksFor(mode) {
  const ph = MODES[mode].phases, d = MODES[mode].duration;
  const label = mode === 'build'
    ? { 'gather-cedar': 'Labanawan', yasad: 'yasad', qayar: 'qayarawath', awalam: 'awalam', roof: 'gabayam', araz: 'araz', zahab: 'zahab', karawab: 'karawab', chatzar: 'chatzar', palace: 'malak', pillars: 'nachashath', vessels: 'manawarah', arawan: 'arawan' }
    : mode === 'dedicate'
    ? { qahal: 'qahal', nashaa: 'arawan', arawan: 'dabayar', singers: 'halal', inan: 'inan', shakan: 'shakan', kayawar: 'kayawar', thapalah: 'thapalah', ash: 'ash', kabawad: 'kabawad', zabach: 'zabach', chag: 'chag', shalach: 'shalach' }
    : { gate: 'gadawal', court: 'chatzar', altar: 'mazabach', yam: 'yam', bases: 'makanawath', pillars: 'imawadayam', porch: 'awalam', hayakal: 'hayakal', veil: 'parakath', dabayar: 'dabayar', karawab: 'karawab', arawan: 'arawan' };
  return ph.filter((p) => label[p.key]).map((p) => ({ at: p.from / d, label: label[p.key] }));
}
/** The pieces the chips row shows, in walking order (gate → ark). */
export const CHIP_ORDER = ['great-court', 'yair', 'porch-pillars', 'porch-throne', 'kasaa', 'king-house', 'daughter-house', 'chatzar', 'mazabach', 'kayawar', 'malak', 'yam', 'makanawath', 'pillars', 'awalam', 'yasad', 'qayar', 'tzalai', 'chalawan', 'roof', 'doors', 'araz', 'zahab', 'manawarah', 'shalachan', 'gold-altar', 'sharasharah', 'parakath', 'oracle-doors', 'dabayar', 'karawab', 'arawan'];
/** Where the eye goes when a piece is chosen (the focus target and a fitting distance), in cubits. */
export function focusFor(id) {
  const F = {
    house: [[0, 16, 0], 150], yasad: [[10, -2, 20], 110], qayar: [[0, 15, 0], 120], tzalai: [[0, 9, 20], 90], chalawan: [[0, 23, 22], 60],
    awalam: [[41, 30, 0], 110], roof: [[0, 31, 0], 100], araz: [[8, 10, 0], 24], dabayar: [[-20, 8, 0], 12], zahab: [[6, 10, 0], 24],
    sharasharah: [[-9, 12, 0], 12], karawab: [[-20, 6, 0], 11], arawan: [[-20, 2, 0], 8], 'oracle-doors': [[-10, 5, 0], 12], doors: [[36, 7, 0], 30],
    parakath: [[-8.8, 6, 0], 12], chatzar: [[20, -2, 0], 200], mazabach: [[76, 2, 0], 60], yam: [[58, 2, 32], 34], makanawath: [[-8, -1, 33], 80],
    pillars: [[48, 12, 0], 60], 'gold-altar': [[-6, 1.4, 0], 6], manawarah: [[9, 2, 7], 16], shalachan: [[12, 1.5, 4], 14],
    'great-court': [[0, 0, 50], 380], yair: [[-100, 12, 115], 170], kayawar: [[95, -1, 0], 26], malak: [[95, 1, 0], 16], 'porch-pillars': [[20, 6, 85], 90], 'porch-throne': [[20, 6, 118], 70], kasaa: [[20, 2, 126], 18], 'king-house': [[80, 8, 134], 150], 'daughter-house': [[-38, 6, 130], 120],
  };
  const f = F[id]; return f ? { target: f[0], distance: f[1] } : null;
}
