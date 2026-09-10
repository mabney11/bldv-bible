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
  nachash: { translit: 'Nachash',   paleo: '𐤍𐤇𐤔',  en: 'bronze / brass', sn: 'H5174' },
  shaq:    { translit: 'Shaq',      paleo: '𐤔𐤒',   en: 'legs',   sn: 'H8243' },
  parazal: { translit: 'Parazal',   paleo: '𐤐𐤓𐤆𐤋', en: 'iron',   sn: 'H6523' },
  ragal:   { translit: 'Ragal',     paleo: '𐤓𐤂𐤋',  en: 'feet',   sn: 'H7271' },
  atzabaith:{ translit: 'Atzabaith', paleo: '𐤀𐤑𐤁𐤏', en: 'toes', sn: 'H677' },
  chasap:  { translit: 'Chasap',    paleo: '𐤇𐤎𐤐',  en: 'clay',   sn: 'H2635' },
  aban:    { translit: 'Aban',      paleo: '𐤀𐤁𐤍',  en: 'stone',  sn: 'H69' },
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
  stone:  { word: 'aban',    color: '#7d8779', hi: '#b3bcae', lo: '#3c443a', metal: 0.0, rough: 0.9 },
};

// ── The pieces, in the order the text names them (head first) ────────────────
// y0/h = the piece's vertical span (ground = 0). `parts` are the solids each
// renderer builds — the WebGL scene as meshes, the sheet as flat shapes — kept
// simple: box, cylinder (vertical), sphere. Iron/clay mixing on the feet is
// its own list so both renderers show the same stripes and toes.
export const H_TOTAL = 7.4;
export const PIECES = [
  {
    id: 'head', order: 1, y0: 6.1, h: 1.3, material: 'gold',
    words: ['raash'], materialWord: 'dahab',
    title: 'The head of gold', dreamRef: 'Daniel 2:32', meaningRef: 'Daniel 2:37–38',
    named: { kingdom: 'Babal (Babylon)', who: 'Nabawakadanaatzar (Nebuchadnezzar) himself', ref: 'Daniel 2:37–38',
      note: 'The only piece the text itself names: "you are the head of gold" — the king of Babylon.' },
    parallel: { ref: 'Daniel 7:4', note: 'The first beast of Daniel 7 — a lion with eagle\'s wings — stands where the head of gold stands in the sequence of four kingdoms (Daniel 7:17).' },
    traditional: 'Babylon (626–539 BC)',
    parts: [
      { kind: 'cylinder', x: 0, y: 6.1, h: 0.3, r: 0.32 },                // neck
      { kind: 'sphere', x: 0, y: 6.9, r: 0.62 },                          // head
    ],
  },
  {
    id: 'chest', order: 2, y0: 4.4, h: 1.7, material: 'silver',
    words: ['chaday', 'darai'], materialWord: 'kasap',
    title: 'The breast and arms of silver', dreamRef: 'Daniel 2:32', meaningRef: 'Daniel 2:39',
    named: { kingdom: 'not named in Daniel 2', who: '"another kingdom inferior to you"', ref: 'Daniel 2:39; 5:28; 8:20',
      note: 'Daniel 2 gives no name. Daniel 5:28 gives Babylon to "the Medes and Persians", and Daniel 8:20 names "the kings of Media and Persia" as the two-horned ram — the kingdom that follows Babylon in the book\'s own telling.' },
    parallel: { ref: 'Daniel 7:5; Daniel 8:3–4, 20', note: 'The bear raised up on one side (7:5) and the ram with two horns, one higher than the other (8:3, 20).' },
    traditional: 'Medo-Persia (539–331 BC) — the two arms read as the two peoples',
    parts: [
      { kind: 'box', x: 0, y: 4.4, h: 1.7, w: 1.9, d: 1.05 },             // torso
      { kind: 'cylinder', x: -1.22, y: 4.45, h: 1.5, r: 0.29 },           // arms, hanging at the sides
      { kind: 'cylinder', x: 1.22, y: 4.45, h: 1.5, r: 0.29 },
      { kind: 'sphere', x: -1.16, y: 5.95, r: 0.36 },                     // shoulders
      { kind: 'sphere', x: 1.16, y: 5.95, r: 0.36 },
      { kind: 'sphere', x: -1.22, y: 4.42, r: 0.3 },                      // hands
      { kind: 'sphere', x: 1.22, y: 4.42, r: 0.3 },
    ],
  },
  {
    id: 'belly', order: 3, y0: 2.9, h: 1.5, material: 'bronze',
    words: ['maih', 'yarakaa'], materialWord: 'nachash',
    title: 'The belly and thighs of bronze', dreamRef: 'Daniel 2:32', meaningRef: 'Daniel 2:39',
    named: { kingdom: 'not named in Daniel 2', who: '"a third kingdom of bronze, which shall rule over all the earth"', ref: 'Daniel 2:39; 8:21',
      note: 'Daniel 2 gives no name. Daniel 8:21 names the rough goat as "the king of Greece", the power that breaks the ram of Media and Persia.' },
    parallel: { ref: 'Daniel 7:6; Daniel 8:5–8, 21', note: 'The leopard with four wings and four heads (7:6) and the goat whose great horn breaks into four (8:8, 21–22).' },
    traditional: 'Greece under Alexander and his successors (331–146 BC)',
    parts: [
      { kind: 'box', x: 0, y: 3.55, h: 0.85, w: 1.65, d: 1.0 },           // belly
      { kind: 'cylinder', x: -0.5, y: 2.9, h: 0.7, r: 0.44 },             // thighs
      { kind: 'cylinder', x: 0.5, y: 2.9, h: 0.7, r: 0.44 },
    ],
  },
  {
    id: 'legs', order: 4, y0: 0.5, h: 2.4, material: 'iron',
    words: ['shaq'], materialWord: 'parazal',
    title: 'The legs of iron', dreamRef: 'Daniel 2:33', meaningRef: 'Daniel 2:40',
    named: { kingdom: 'not named anywhere in Daniel', who: '"the fourth kingdom, strong as iron"', ref: 'Daniel 2:40',
      note: 'No book of scripture names the fourth kingdom. The text says only what it does: it breaks in pieces and crushes all the others.' },
    parallel: { ref: 'Daniel 7:7, 19, 23', note: 'The fourth beast, "dreadful and terrible", with great iron teeth — "the fourth kingdom upon earth" (7:23).' },
    traditional: 'Rome (146 BC onward) — the two legs read as its eastern and western halves',
    parts: [
      { kind: 'cylinder', x: -0.5, y: 0.5, h: 2.45, r: 0.38 },
      { kind: 'cylinder', x: 0.5, y: 0.5, h: 2.45, r: 0.38 },
    ],
  },
  {
    id: 'feet', order: 5, y0: 0, h: 0.5, material: 'clay',
    words: ['ragal', 'atzabaith'], materialWord: 'chasap',
    title: 'The feet of iron and clay', dreamRef: 'Daniel 2:33', meaningRef: 'Daniel 2:41–43',
    named: { kingdom: 'not named', who: '"a divided kingdom … partly strong and partly broken"', ref: 'Daniel 2:41–43',
      note: 'Iron mixed with potter\'s clay: strength that will not hold together, "they shall mingle themselves with the seed of men, but they shall not cling to one another". The toes are the text\'s own detail (2:41–42).' },
    parallel: { ref: 'Daniel 7:7–8, 24', note: 'The ten horns of the fourth beast, "ten kings that shall arise" (7:24), are often set beside the ten toes.' },
    traditional: 'The divided remains of Rome — ten kingdoms / a later divided power; the one piece the stone strikes',
    parts: [
      { kind: 'box', x: -0.55, y: 0, h: 0.5, w: 0.78, d: 1.7, z: 0.25, mixed: true },   // feet (clay body)
      { kind: 'box', x: 0.55, y: 0, h: 0.5, w: 0.78, d: 1.7, z: 0.25, mixed: true },
    ],
    // The iron in the clay: bands across each foot and alternating toes.
    iron: [
      { kind: 'box', x: -0.55, y: 0.18, h: 0.14, w: 0.8, d: 1.72, z: 0.25 },
      { kind: 'box', x: 0.55, y: 0.18, h: 0.14, w: 0.8, d: 1.72, z: 0.25 },
    ],
    toes: [-0.55, 0.55].flatMap((fx) => [-0.3, -0.15, 0, 0.15, 0.3].map((dx, i) => ({ kind: 'box', x: fx + dx, y: 0, h: 0.34, w: 0.13, d: 0.36, z: 1.22, material: i % 2 ? 'clay' : 'iron' }))),
  },
];

export const STONE = {
  id: 'stone', title: 'The stone cut out without hands', words: ['aban'], materialWord: 'aban', material: 'stone',
  dreamRef: 'Daniel 2:34–35', meaningRef: 'Daniel 2:44–45',
  named: { kingdom: 'the kingdom the God of heaven sets up', who: '"it shall never be destroyed … it shall stand for ever"', ref: 'Daniel 2:44',
    note: 'Cut out of the mountain, not by hands; it strikes the feet, the whole statue becomes chaff, and the stone becomes a great mountain that fills the whole earth.' },
  parallel: { ref: 'Psalm 118:22; Isaiah 28:16; Isaiah 2:2–3; Matthew 21:42–44; Luke 20:17–18; 1 Peter 2:6–8', note: 'The stone the builders rejected; the tried, precious corner stone; the mountain of the house of Yah established above the hills; "on whomever it falls, it will scatter him as dust".' },
  traditional: 'The kingdom of the Messiah / the kingdom of heaven',
  r: 0.46,
  start: { x: -4.6, y: 6.9, z: 1.6 },       // in the air, well clear of the statue
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
  { from: 0,             key: 'falls',    caption: 'A stone, cut out without hands, comes down.', ref: 'Daniel 2:34' },
  { from: HIT,           key: 'strikes',  caption: 'It strikes the image on its feet of iron and clay, and breaks them in pieces.', ref: 'Daniel 2:34' },
  { from: HIT + 0.55,    key: 'shatters', caption: 'Then the iron, the clay, the bronze, the silver and the gold are broken in pieces together.', ref: 'Daniel 2:35' },
  { from: DUST_FROM,     key: 'chaff',    caption: 'They become like the chaff of the summer threshing floors, and the wind carries them away, so that no place is found for them.', ref: 'Daniel 2:35' },
  { from: MOUNTAIN_FROM, key: 'mountain', caption: 'And the stone that struck the image becomes a great mountain, and fills the whole earth.', ref: 'Daniel 2:35, 44–45' },
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
export function makeShards(piece, count = 26, seed = 7) {
  const r = rng(seed * 131 + piece.order * 17);
  const parts = piece.parts;
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = parts[i % parts.length];
    const size = 0.16 + r() * 0.3;
    let x, y, z;
    if (p.kind === 'sphere') { const a = r() * Math.PI * 2, b = (r() - 0.5) * Math.PI, rr = r() * p.r; x = p.x + Math.cos(b) * Math.cos(a) * rr; y = p.y + Math.sin(b) * rr; z = Math.cos(b) * Math.sin(a) * rr; }
    else if (p.kind === 'cylinder') { const a = r() * Math.PI * 2, rr = r() * p.r; x = p.x + Math.cos(a) * rr; y = p.y + r() * p.h; z = Math.sin(a) * rr; }
    else { x = p.x + (r() - 0.5) * p.w; y = p.y + r() * p.h; z = (p.z || 0) + (r() - 0.5) * p.d; }
    const k = STONE.strike;
    const dx = x - k.x, dz = z - k.z, dist = Math.hypot(dx, dz) || 0.3;
    const push = 2.2 + r() * 2.4;
    out.push({
      x, y, z, size,
      material: p.mixed && r() < 0.4 ? 'iron' : p.material || piece.material,
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
