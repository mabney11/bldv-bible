/**
 * statue.js — the statue of Nebuchadnezzar's dream (Daniel 2:31–45) and the
 * stone cut without hands: ALL the model's data and its whole timeline, shared
 * by the WebGL scene (components/StatueScene.jsx) and the 2D sheet
 * (components/StatueSheet.jsx). Nothing here draws; it only says WHAT is where
 * at time t, so both renderers show the same model and a scrub bar can land on
 * any instant of it.
 *
 * Units: one "cubit-ish" world unit; ground at y = 0, y up, x to the statue's
 * right (the viewer's left), z toward the viewer. The statue stands ~7.4 high.
 * Names are the app's own transliterations of the Aramaic of Daniel 2 (the
 * reading text's own words), paleo from strongs-roots.json.
 */

// ── Words of the text ────────────────────────────────────────────────────────
export const WORDS = {
  tzalam:  { translit: 'Tzalam',    paleo: '𐤑𐤋𐤌',  en: 'image / likeness', sn: 'H6755' },
  raash:   { translit: 'Raash',     paleo: '𐤓𐤀𐤔',  en: 'head',   sn: 'H7217' },
  dahab:   { translit: 'Dahab',     paleo: '𐤃𐤄𐤁',  en: 'gold',   sn: 'H1722' },
  chaday:  { translit: 'Chaday',    paleo: '𐤇𐤃𐤉',  en: 'breast', sn: 'H2306' },
  darai:   { translit: 'Darai',     paleo: '𐤃𐤓𐤏',  en: 'arms',   sn: 'H1872' },
  kasap:   { translit: 'Kasap',     paleo: '𐤊𐤎𐤐',  en: 'silver', sn: 'H3702' },
  maih:    { translit: 'Maih',      paleo: '𐤌𐤏𐤄',  en: 'belly',  sn: 'H4577' },
  yarakaa: { translit: 'Yarakaa',   paleo: '𐤉𐤓𐤊𐤀', en: 'thighs', sn: 'H3410' },
  nachash: { translit: 'Nachash',   paleo: '𐤍𐤇𐤔',  en: 'brass', sn: 'H5174' },
  shaq:    { translit: 'Shaq',      paleo: '𐤔𐤒',   en: 'legs',   sn: 'H8243' },
  parazal: { translit: 'Parazal',   paleo: '𐤐𐤓𐤆𐤋', en: 'iron',   sn: 'H6523' },
  ragal:   { translit: 'Ragal',     paleo: '𐤓𐤂𐤋',  en: 'feet',   sn: 'H7271' },
  atzabaith:{ translit: 'Atzabaith', paleo: '𐤀𐤑𐤁𐤏', en: 'toes', sn: 'H677' },
  chasap:  { translit: 'Chasap',    paleo: '𐤇𐤎𐤐',  en: 'clay',   sn: 'H2635' },
  aban:    { translit: 'Aban',      paleo: '𐤀𐤁𐤍',  en: 'stone',  sn: 'H69' },
  yashapah:{ translit: 'Yashapah',  paleo: '𐤉𐤔𐤐𐤄', en: 'jasper', sn: 'H3471' },
  har:     { translit: 'Har',       paleo: '𐤄𐤓',   en: 'mountain (Hebrew)', sn: 'H2022' },
  arach:   { translit: 'Arach',     paleo: '𐤀𐤓𐤇',  en: 'path', sn: 'H734' },
  tawar:   { translit: 'Tawar',     paleo: '𐤈𐤅𐤓',  en: 'mountain', sn: 'H2906' },
  rawach:  { translit: 'Rawach',    paleo: '𐤓𐤅𐤇',  en: 'wind / spirit', sn: 'H7308' },
  daqaq:   { translit: 'Daqaq',     paleo: '𐤃𐤒𐤒',  en: 'break in pieces', sn: 'H1855' },
  malakaw: { translit: 'Malakaw',   paleo: '𐤌𐤋𐤊𐤅', en: 'kingdom', sn: 'H4437' },
};

// ── Materials (colours shared by both renderers) ─────────────────────────────
export const MATERIALS = {
  gold:   { word: 'dahab',   color: '#d9a93a', hi: '#f7dd8a', lo: '#8a6716', metal: 1.0, rough: 0.28 },
  silver: { word: 'kasap',   color: '#c6cad0', hi: '#f2f4f6', lo: '#6e747c', metal: 1.0, rough: 0.32 },
  bronze: { word: 'nachash', color: '#b9733a', hi: '#e6ab70', lo: '#653916', metal: 1.0, rough: 0.38 },
  iron:   { word: 'parazal', color: '#7a8087', hi: '#b3b8be', lo: '#33373c', metal: 0.9, rough: 0.5 },
  clay:   { word: 'chasap',  color: '#b8704e', hi: '#dca78d', lo: '#6b3a23', metal: 0.0, rough: 0.95 },
  // The aban is jasper — yashapah (Exodus 28:20; Revelation 4:3, 21:11, 18–19): warm mottled ochre and rust-brown, opaque.
  stone:  { word: 'aban',    color: '#a0653c', hi: '#d8a674', lo: '#5a3320', metal: 0.0, rough: 0.8 },
};

// ── The pieces, in the order the text names them (head first) ────────────────
// y0/h = the piece's vertical span (ground = 0). `parts` are the solids each
// renderer builds — the WebGL scene as meshes, the sheet as flat shapes — kept
// simple: box, cylinder (vertical), sphere. Iron/clay mixing on the feet is
// its own list so both renderers show the same stripes and toes.
// Part kinds both renderers understand:
//   sphere   {x,y,r,z?}                      y = centre
//   box      {x,y,h,w,d,z?}                  y = bottom
//   cylinder {x,y,h,r,z?}                    y = bottom
//   lathe    {x,z?,profile:[[r,y]…],sz?}     a body of revolution, y absolute, sz squashes it front-to-back
//   capsule  {a:[x,y,z],b:[x,y,z],r}         a limb between two joints
// The figure is the king of the references: a tall cap, a full beard, arms crossed on
// the breast, a belted kilt, legs with knee and calf, feet with toes.
export const H_TOTAL = 7.8;
export const PIECES = [
  {
    id: 'head', order: 1, y0: 6.1, h: 1.3, material: 'gold',
    words: ['raash'], materialWord: 'dahab',
    title: 'The raash (head) of dahab (gold)', dreamRef: 'Daniel 2:32', meaningRef: 'Daniel 2:37–38',
    named: { kingdom: 'Babal (Babylon)', who: 'Nabawakadanaatzar (Nebuchadnezzar) the malak (king) himself', ref: 'Daniel 2:37–38',
      note: 'The only piece the text itself names: "you are the raash (head) of dahab (gold)" — the malak (king) of Babal (Babylon).' },
    parallel: { ref: 'Daniel 7:4', note: 'The qadamay (first) animal of Daniel 7 — like a arayah (lion) with nashar (eagle\'s) gapayan (wings) — stands where the raash (head) of dahab (gold) stands among the arabai (four) malakayan (kings) (Daniel 7:17).' },
    traditional: 'Babal (Babylon), 626–539 BC',
    parts: [
      { kind: 'capsule', a: [0, 6.05, 0], b: [0, 6.5, 0], r: 0.27 },                                                     // neck
      { kind: 'lathe', x: 0, sz: 0.9, profile: [[0.16, 6.38], [0.38, 6.52], [0.5, 6.78], [0.53, 7.02], [0.48, 7.24], [0.32, 7.38], [0, 7.44]] }, // head
      { kind: 'lathe', x: 0, z: 0.24, sz: 0.7, profile: [[0.28, 6.0], [0.38, 6.22], [0.44, 6.5], [0.42, 6.68], [0.3, 6.76]] },              // beard
      { kind: 'box', x: 0, y: 6.72, h: 0.3, w: 0.15, d: 0.22, z: 0.5 },                                                  // nose
      { kind: 'lathe', x: 0, sz: 0.92, profile: [[0.57, 7.0], [0.58, 7.12], [0.52, 7.3], [0.46, 7.52], [0.38, 7.7], [0.22, 7.78], [0, 7.8]] }, // the tall cap
    ],
  },
  {
    id: 'chest', order: 2, y0: 4.4, h: 1.7, material: 'silver',
    words: ['chaday', 'darai'], materialWord: 'kasap',
    title: 'The chaday (breast) and darai (arms) of kasap (silver)', dreamRef: 'Daniel 2:32', meaningRef: 'Daniel 2:39',
    named: { kingdom: 'not named in Daniel 2', who: '"acharay (another) malakaw (kingdom) inferior to you"', ref: 'Daniel 2:39; 5:28; 8:20',
      note: 'Daniel 2 gives no name. Daniel 5:28 gives Babal (Babylon) to the Maday (Medes) and Paras (Persians), and Daniel 8:20 names the malakay (kings) of Maday (Media) and Paras (Persia) as the ayal (ram) with two qaranayam (horns) — the malakaw (kingdom) that follows Babal (Babylon) in the book\'s own telling.' },
    parallel: { ref: 'Daniel 7:5; Daniel 8:3–4, 20', note: 'The dab (bear) qawam (raised up) on chad (one) shatar (side) (7:5), and the ayal (ram) whose two qaranayam (horns) were gabah (high), achad (one) gabah (higher) than the other (8:3, 20).' },
    traditional: 'Maday (Media) and Paras (Persia), 539–331 BC — the two darai (arms) read as the two peoples',
    parts: [
      { kind: 'lathe', x: 0, sz: 0.66, profile: [[0.8, 4.55], [0.86, 4.9], [0.95, 5.3], [1.03, 5.62], [1.0, 5.85], [0.88, 6.0], [0.5, 6.1], [0.3, 6.16]] }, // torso, chest out
      { kind: 'sphere', x: -1.02, y: 5.84, r: 0.33 },                                                                    // shoulders
      { kind: 'sphere', x: 1.02, y: 5.84, r: 0.33 },
      { kind: 'capsule', a: [-1.08, 5.78, 0.02], b: [-1.1, 5.02, 0.38], r: 0.245 },                                        // upper arms
      { kind: 'capsule', a: [1.08, 5.78, 0.02], b: [1.1, 5.02, 0.38], r: 0.245 },
      { kind: 'capsule', a: [1.1, 5.02, 0.4], b: [-0.62, 5.34, 0.78], r: 0.21 },                                           // forearms, crossed on the breast
      { kind: 'capsule', a: [-1.1, 5.02, 0.38], b: [0.6, 5.06, 0.66], r: 0.21 },
      { kind: 'sphere', x: -0.66, y: 5.36, z: 0.8, r: 0.22 },                                                              // hands
      { kind: 'sphere', x: 0.64, y: 5.08, z: 0.68, r: 0.22 },
    ],
  },
  {
    id: 'belly', order: 3, y0: 2.9, h: 1.5, material: 'bronze',
    words: ['maih', 'yarakaa'], materialWord: 'nachash',
    title: 'The maih (belly) and yarakaa (thighs) of nachash (brass)', dreamRef: 'Daniel 2:32', meaningRef: 'Daniel 2:39',
    named: { kingdom: 'not named in Daniel 2', who: '"a thalayathay (third) malakaw (kingdom) of nachash (brass), which shall shalat (bear) rule over kal (every) the arai (earth)"', ref: 'Daniel 2:39; 8:21',
      note: 'Daniel 2 gives no name. Daniel 8:21 names the shaiyar (rough) tzapayar (goat) as the malak (king) of Yawan (Greece), the one that shabar (breaks) the ayal (ram) of Maday (Media) and Paras (Persia).' },
    parallel: { ref: 'Daniel 7:6; Daniel 8:5–8, 21', note: 'The namar (leopard) with arabai (four) gapayan (wings) and arabai (four) raashayan (heads) (7:6), and the tzapayar (goat) whose gadal (great) qaran (horn) was shabar (broken) for arabai (four) (8:8, 21–22).' },
    traditional: 'Yawan (Greece) under Alexander and his successors, 331–146 BC',
    parts: [
      { kind: 'lathe', x: 0, sz: 0.72, profile: [[0.78, 2.95], [0.84, 3.3], [0.87, 3.7], [0.85, 4.0], [0.82, 4.2]] },   // the kilt over the thighs
      { kind: 'lathe', x: 0, sz: 0.76, profile: [[0.86, 4.18], [0.9, 4.28], [0.86, 4.4]] },                              // belt
      { kind: 'lathe', x: 0, sz: 0.7, profile: [[0.8, 4.38], [0.82, 4.5], [0.8, 4.6]] },                                 // belly
    ],
  },
  {
    id: 'legs', order: 4, y0: 0.5, h: 2.4, material: 'iron',
    words: ['shaq'], materialWord: 'parazal',
    title: 'The shaq (legs) of parazal (iron)', dreamRef: 'Daniel 2:33', meaningRef: 'Daniel 2:40',
    named: { kingdom: 'not named anywhere in Daniel', who: '"the rabayaiy (fourth) malakaw (kingdom), thaqayap (strong) as parazal (iron)"', ref: 'Daniel 2:40',
      note: 'No book of scripture names the rabayaiy (fourth) malakaw (kingdom). The text says only what it does: it daqaq (breaks) in pieces and raii (crushes) kal (every) the others.' },
    parallel: { ref: 'Daniel 7:7, 19, 23', note: 'The rabayaiy (fourth) animal, awesome and powerful, with rabarab (great) parazal (iron) shanayan (teeth) — "a rabayaiy (fourth) malakaw (kingdom) on arai (earth)" (7:23).' },
    traditional: 'Rome, 146 BC onward — the two shaq (legs) read as its eastern and western halves',
    parts: [-0.42, 0.42].map((x) => ({ kind: 'lathe', x, profile: [[0.2, 0.42], [0.21, 0.7], [0.25, 1.1], [0.33, 1.55], [0.3, 1.9], [0.3, 2.15], [0.34, 2.45], [0.37, 2.8], [0.36, 3.0]] })), // ankle, calf, knee, thigh
  },
  {
    id: 'feet', order: 5, y0: 0, h: 0.5, material: 'clay',
    words: ['ragal', 'atzabaith'], materialWord: 'chasap',
    title: 'The ragal (feet) of parazal (iron) and chasap (clay)', dreamRef: 'Daniel 2:33', meaningRef: 'Daniel 2:41–43',
    named: { kingdom: 'not named', who: '"a palag (divided) malakaw (kingdom) … partly thaqayap (strong), and partly thabar (broken)"', ref: 'Daniel 2:41–43',
      note: 'Parazal (iron) irab (mixed) with pachar (potters\') chasap (clay): strength that will not hold together — "they shall not cling to dan (one) dan (another), even as parazal (iron) does not irab (mix) with chasap (clay)". The atzabaith (toes) are the text\'s own detail (2:41–42).' },
    parallel: { ref: 'Daniel 7:7–8, 24', note: 'The ishar (ten) qaranayan (horns) of the rabayaiy (fourth) animal — "ishar (ten) malakayan (kings)" (7:24) — are often set beside the ishar (ten) atzabaith (toes).' },
    traditional: 'The palag (divided) remains of Rome — ishar (ten) malakayan (kings) / a later divided power; the one piece the aban (stone) strikes',
    parts: [
      { kind: 'box', x: -0.44, y: 0, h: 0.42, w: 0.58, d: 1.3, z: 0.22, mixed: true },   // feet (clay body)
      { kind: 'box', x: 0.44, y: 0, h: 0.42, w: 0.58, d: 1.3, z: 0.22, mixed: true },
      { kind: 'sphere', x: -0.44, y: 0.22, z: -0.4, r: 0.24, mixed: true },              // heels
      { kind: 'sphere', x: 0.44, y: 0.22, z: -0.4, r: 0.24, mixed: true },
    ],
    // The iron in the clay: a band across each foot and alternating toes.
    iron: [
      { kind: 'box', x: -0.44, y: 0.14, h: 0.12, w: 0.6, d: 1.32, z: 0.22 },
      { kind: 'box', x: 0.44, y: 0.14, h: 0.12, w: 0.6, d: 1.32, z: 0.22 },
    ],
    toes: [-0.44, 0.44].flatMap((fx) => [-0.22, -0.11, 0, 0.11, 0.22].map((dx, i) => ({ kind: 'box', x: fx + dx, y: 0, h: 0.26 - Math.abs(dx) * 0.2, w: 0.1, d: 0.3, z: 1.0, material: i % 2 ? 'clay' : 'iron' }))),
  },
];

// A sculpted king (a GLB at /api/models/statue.glb — see StatueScene.jsx's loadKing)
// is cut into the five pieces by HEIGHT, as fractions of the figure's total height,
// feet on the ground = 0, top of the cap = 1. Measured off the Meshy king: bare
// feet to the ankle, legs to the hem of the kilt, kilt and belly to the belt's top,
// breast and crossed arms to the chin, then the bearded head and the tall cap.
export const KING_BANDS = { feet: [0, 0.07], legs: [0.07, 0.36], belly: [0.36, 0.56], chest: [0.56, 0.815], head: [0.815, 1.001] };
export function bandOf(yFraction) {
  for (const [id, [a, b]] of Object.entries(KING_BANDS)) if (yFraction >= a && yFraction < b) return id;
  return yFraction < 0 ? 'feet' : 'head';
}

export const STONE = {
  id: 'stone', title: 'The aban (stone) gazar (cut) out laa (NOT) yadayan (hands)', words: ['aban'], materialWord: 'aban', material: 'stone',
  dreamRef: 'Daniel 2:34–35', meaningRef: 'Daniel 2:44–45',
  named: { kingdom: 'the malakaw (kingdom) the Alahayam of shamayan (heaven) qawam (raises up)', who: '"which shall ilam (never) be chabal (destroyed) … it shall qawam (stand) ilam (forever)"', ref: 'Daniel 2:44',
    note: 'Gazar (cut) out of the tawar (mountain), laa (NOT) by yadayan (hands); it strikes the ragal (feet), the whole tzalam (likeness) becomes iwar (chaff), and the aban (stone) becomes a rab (great) tawar (mountain) that malaa (fills) the kal (every) arai (earth).' },
  parallel: { ref: 'Psalm 118:22; Isaiah 28:16; Isaiah 2:2–3; Matthew 21:42–44; Luke 20:17–18; 1 Peter 2:6–8', note: 'The aban (stone) the builders rejected; the tried, precious corner aban (stone); the tawar (mountain) of the house of Yah set above the hills; "on whomever it falls, it will scatter him as dust".' },
  traditional: 'The malakaw (kingdom) of the Mashayach (Messiah) / the malakaw (kingdom) of shamayan (heaven)',
  mountain: { ref: 'Isaiah 2:2–3; Micah 4:1–2; Isaiah 11:9; Isaiah 25:6; Ezekiel 36:8; Isaiah 65:25',
    note: 'Daniel says only that the aban (stone) becomes a rab (great) tawar (mountain) that malaa (fills) the arai (earth); the prophets say what that mountain is like. It is the har (mountain) of Yahawah\'s bayath (house), kawan (established) on the raash (head) of the harayam (mountains), and all gawayam (nations) nahar (flow) to it: "yalak (come), let\'s ilah (go up) to the har (mountain) of Yahawah … he will yarah (teach) us of his darak (ways), and we will yalak (walk) in his arach (paths)" — that is why this mountain is climbed by many arach (paths). "They will not raii (evil) nor shachath (destroy) in all my qadash (holy) har (mountain); for the aratz (earth) will be malaa (full) of the daih (knowledge) of Yahawah" — that is why it is green and teeming with life: the haray (mountains) of Yashar-Al (Israel) nathan (give) forth their branches and nashaa (lift) their paray (fruit), and on this har (mountain) is a mashathah (feast) for all imayam (peoples). The Hebrew prophets say har (𐤄𐤓); Daniel\'s Aramaic says tawar (𐤈𐤅𐤓).' },
  colour: { ref: 'Exodus 28:20; Revelation 4:3; Revelation 21:11, 18–19', note: 'The aban (stone) here is shown as yashapah (jasper): the last of the abanay (stones) of the breastplate, the look of the One on the throne — "like a yashapah (jasper) stone and a sardius" — and the stone of the city that comes down from shamayan (heaven): her light "as if it were a jasper stone, clear as crystal", her wall of jasper, her first foundation jasper — the stone the city is built of, sent first to break the tzalam (likeness).' },
  r: 0.46,
  start: { x: -4.6, y: 7.3, z: 1.6 },       // in the air, well clear of the statue
  strike: { x: -0.85, y: 0.55, z: 1.1 },    // the feet, from the statue's right / the viewer's left
};

// ── Timeline ─────────────────────────────────────────────────────────────────
// Whole thing ~7 s at 1×. Phases are pure functions of t so any renderer,
// the scrub bar and the captions all agree.
export const HIT = 1.8;            // stone meets the feet
export const DUST_FROM = HIT + 1.3; // fragments start turning to chaff
export const DUST_GONE = HIT + 3.2; // wind has carried them off
export const MOUNTAIN_FROM = HIT + 2.6;
export const DURATION = 7.0;
export const SPEEDS = [0.25, 0.5, 1, 2];

// How long after the strike each piece gives way: feet first, then the statue
// comes down on itself — "broken in pieces together" (2:35), so the gaps are short.
export const BREAK_DELAY = { feet: 0, legs: 0.12, belly: 0.24, chest: 0.36, head: 0.5 };

export const PHASES = [
  { from: 0,             key: 'falls',    caption: 'An aban (stone), gazar (cut) out laa (NOT) yadayan (hands), comes down.', ref: 'Daniel 2:34' },
  { from: HIT,           key: 'strikes',  caption: 'It strikes the tzalam (likeness) on its ragal (feet) of parazal (iron) and chasap (clay), and daqaq (breaks) them in pieces.', ref: 'Daniel 2:34' },
  { from: HIT + 0.55,    key: 'shatters', caption: 'Then the parazal (iron), the chasap (clay), the nachash (brass), the kasap (silver) and the dahab (gold) are daqaq (broken) in pieces chad (together).', ref: 'Daniel 2:35' },
  { from: DUST_FROM,     key: 'chaff',    caption: 'They become like the iwar (chaff) of the qayat (summer) threshing floors, and the rawach (wind) nashaa (lifts) them away, so that no athar (place) is shakach (found) for them.', ref: 'Daniel 2:35' },
  { from: MOUNTAIN_FROM, key: 'mountain', caption: 'And the aban (stone) that struck the tzalam (likeness) becomes a rab (great) tawar (mountain), and malaa (fills) the kal (every) arai (earth).', ref: 'Daniel 2:35, 44–45' },
];
export function phaseAt(t) {
  let p = PHASES[0];
  for (const ph of PHASES) if (t >= ph.from) p = ph;
  return p;
}

const ease = { in: (u) => u * u, out: (u) => 1 - (1 - u) * (1 - u) };
const clamp01 = (u) => Math.max(0, Math.min(1, u));

/** Where the stone is at t: a falling arc from `start` to `strike`, then at rest, then swallowed by the mountain. */
export function stoneAt(t) {
  const u = clamp01(t / HIT), e = ease.in(u);
  const s = STONE.start, k = STONE.strike;
  const arc = Math.sin(u * Math.PI) * 0.9;            // a slight lob so it is clearly "from above"
  const spin = t * 3.1;
  if (t <= HIT) return { x: s.x + (k.x - s.x) * e, y: s.y + (k.y - s.y) * e + arc, z: s.z + (k.z - s.z) * e, spin, scale: 1, visible: true };
  // A small settle after impact, then still.
  const a = clamp01((t - HIT) / 0.5);
  const m = mountainAt(t);
  return { x: k.x + 0.35 * ease.out(a), y: k.y - 0.1 * ease.out(a), z: k.z + 0.3 * ease.out(a), spin: spin + 0.0, scale: 1, visible: m.scale < 0.12 };
}

/** The mountain the stone becomes: scale 0 → 1 over MOUNTAIN_FROM → DURATION (never shrinks back while scrubbing forward). */
export function mountainAt(t) {
  const u = clamp01((t - MOUNTAIN_FROM) / (DURATION - MOUNTAIN_FROM));
  const k = STONE.strike;
  return { x: k.x + 0.35, y: 0, z: k.z + 0.3, scale: ease.out(u), visible: u > 0 };
}

/** Deterministic pseudo-random (so every scrub lands on the same shards). */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Shards for one piece: positions inside its parts (in the piece's own frame),
 * each with an outward velocity away from the strike point. Built once per
 * renderer; `shardAt` places them.
 */
export function makeShards(piece, count = 26, seed = 7, sampler = null) {
  const r = rng(seed * 131 + piece.order * 17);
  const parts = piece.parts;
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = parts[i % parts.length];
    const size = 0.16 + r() * 0.3;
    let x, y, z;
    if (sampler) { const q = sampler(r); x = q[0]; y = q[1]; z = q[2]; }
    else if (p.kind === 'sphere') { const a = r() * Math.PI * 2, b = (r() - 0.5) * Math.PI, rr = r() * p.r; x = p.x + Math.cos(b) * Math.cos(a) * rr; y = p.y + Math.sin(b) * rr; z = (p.z || 0) + Math.cos(b) * Math.sin(a) * rr; }
    else if (p.kind === 'lathe') { const ys = p.profile.map((q) => q[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), rm = Math.max(...p.profile.map((q) => q[0])); const a = r() * Math.PI * 2, rr = r() * rm; x = p.x + Math.cos(a) * rr; y = y0 + r() * (y1 - y0); z = (p.z || 0) + Math.sin(a) * rr * (p.sz || 1); }
    else if (p.kind === 'capsule') { const u = r(); x = p.a[0] + (p.b[0] - p.a[0]) * u + (r() - 0.5) * p.r; y = p.a[1] + (p.b[1] - p.a[1]) * u; z = p.a[2] + (p.b[2] - p.a[2]) * u + (r() - 0.5) * p.r; }
    else if (p.kind === 'cylinder') { const a = r() * Math.PI * 2, rr = r() * p.r; x = p.x + Math.cos(a) * rr; y = p.y + r() * p.h; z = Math.sin(a) * rr; }
    else { x = p.x + (r() - 0.5) * p.w; y = p.y + r() * p.h; z = (p.z || 0) + (r() - 0.5) * p.d; }
    const k = STONE.strike;
    const dx = x - k.x, dz = z - k.z, dist = Math.hypot(dx, dz) || 0.3;
    const push = 2.2 + r() * 2.4;
    out.push({
      x, y, z, size,
      material: (sampler ? piece.id === 'feet' : p.mixed) && r() < 0.4 ? 'iron' : (sampler ? piece.material : p.material || piece.material),
      vx: (dx / dist) * push + (r() - 0.5) * 1.6,
      vy: 1.2 + r() * 3.4 + (y / H_TOTAL) * 0.8,
      vz: (dz / dist) * push * 0.6 + (r() - 0.5) * 1.6 + 0.6,
      spin: (r() - 0.5) * 9, spinAxis: [r(), r(), r()],
      rest: (r() - 0.5) * 0.35,
    });
  }
  return out;
}

/** Is the piece still whole at t? */
export function pieceWholeAt(piece, t) {
  return t < HIT + BREAK_DELAY[piece.id];
}

const G = 9.2;
/**
 * A shard's place at t: {x,y,z,rot,alpha,scale,visible}. Flies from its
 * origin, lands on the ground (never sinks below it), then fades and shrinks
 * to nothing as the chaff blows off to the statue's left (+x) with the wind.
 */
export function shardAt(piece, s, t) {
  const a = t - HIT - BREAK_DELAY[piece.id];
  if (a <= 0) return { x: s.x, y: s.y, z: s.z, rot: 0, alpha: 1, scale: 1, visible: false };
  let x = s.x + s.vx * a, z = s.z + s.vz * a;
  let y = s.y + s.vy * a - 0.5 * G * a * a;
  const floor = s.size * 0.5 + Math.max(0, s.rest);
  let rot = s.spin * a;
  if (y < floor) {                                 // landed: sit still where it came down
    const tl = (s.vy + Math.sqrt(Math.max(0, s.vy * s.vy + 2 * G * (s.y - floor)))) / G;
    x = s.x + s.vx * tl; z = s.z + s.vz * tl; y = floor; rot = s.spin * tl;
  }
  const w = clamp01((t - DUST_FROM) / (DUST_GONE - DUST_FROM));   // wind
  const gone = ease.in(w);
  x += gone * 9 * (0.6 + Math.abs(s.rest));                          // carried off downwind
  y += gone * 1.6;
  const alpha = 1 - clamp01((w - 0.35) / 0.65);
  const scale = 1 - gone * 0.85;
  return { x, y, z, rot, alpha, scale, visible: alpha > 0.02 };
}

/** Chaff particles: one cloud for the whole statue, blown downwind and fading. */
export function makeDust(count = 700, seed = 3) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) out.push({ x: (r() - 0.5) * 3.2, y: r() * H_TOTAL, z: (r() - 0.5) * 2.4, drift: 0.4 + r() * 1.2, lift: (r() - 0.3) * 2.2, jitter: r() * 6.28 });
  return out;
}
export function dustAt(d, t) {
  const w = clamp01((t - DUST_FROM + 0.4) / (DUST_GONE - DUST_FROM + 0.4));
  if (w <= 0 || w >= 1) return { visible: false };
  const g = ease.in(w) * 12 * d.drift;
  return { visible: true, x: d.x + g + Math.sin(d.jitter + w * 9) * 0.25, y: d.y + w * d.lift + Math.cos(d.jitter + w * 7) * 0.2, z: d.z + Math.sin(d.jitter * 2 + w * 5) * 0.4, alpha: Math.sin(w * Math.PI) };
}

/** What can be selected at t — after the end, only the stone remains. */
export function selectableAt(t) {
  const ids = PIECES.filter((p) => pieceWholeAt(p, t)).map((p) => p.id);
  ids.push('stone');
  return ids;
}
export function pieceById(id) { return id === 'stone' ? STONE : PIECES.find((p) => p.id === id) || null; }
export const ALL_REFS = 'Daniel 2:31–45';
