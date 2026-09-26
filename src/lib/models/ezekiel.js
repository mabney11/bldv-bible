/**
 * ezekiel.js — the bayath (house) Yachazaqaal (Ezekiel) was shown on the very
 * high har (mountain) (Ezekiel 40–43): the chawamah (wall) five hundred square,
 * the three outer shairayam (gates) and the three inner, the chayatzawan
 * (outer) chatzar (court) with its ratzapah (pavement) and thirty rooms, the
 * inner court with the mazabach (altar) before the house, the awalam (porch),
 * the hayakal (temple), the most qadash (holy) place, the tzalai (side) rooms,
 * the banayan (building) on the west, the kahanayam (priests)' rooms — ALL the
 * model's data and its stories, read by the generic page, scene and sheet
 * (pages/ModelPage.jsx, components/ModelScene.jsx, components/ModelSheet.jsx)
 * exactly as lib/models/temple.js is.
 *
 * Units: ONE WORLD UNIT = ONE amah (cubit) — HIS cubit, "a amah (cubit) and a
 * tapach (handbreadth)" (40:5; 43:13), the long cubit; the qanah (reed) is six
 * of them. The ground outside the wall is y = 0; the outer court stands seven
 * steps up (3½), the inner court eight more (7½), the house on its raised base
 * of a full reed (13½; 41:8). The house faces qadayam (east) = +x, as
 * Shalamah's does in temple.js; darawam (south) = +z.
 *
 * Every measure the text gives is used as given; where it gives none the model
 * is idealised and SAYS so (each piece's `assumed`). The 500 of 42:16–20 the
 * model takes in amah, not reeds: the measures within (gate 50, court 100, gate
 * 50, court 100, house 100, separate place and building 100) sum to it exactly.
 *
 * One story on the model, WALK — the way the man with the qanah (reed) took him,
 * gate by gate, in the text's own order (40:5 → 43:17) — and ROAM, no story:
 * the finished house, the viewer walking where they will. Captions QUOTE the
 * live text ({{Ref | from … to}}, lib/passages.js) — nothing here is a copy of
 * a verse.
 */
import { makeKit, V, SPEEDS, smooth, timelineFor, BASE_MATERIALS } from './kit.js';

// ── Words of the text ────────────────────────────────────────────────────────
export const WORDS = {
  bayath:     { translit: 'Bayath',      paleo: '𐤁𐤉𐤕',   en: 'house',                       sn: 'H1004' },
  chawamah:   { translit: 'Chawamah',    paleo: '𐤇𐤅𐤌𐤄',  en: 'wall (of a city or enclosure)', sn: 'H2346' },
  qanah:      { translit: 'Qanah',       paleo: '𐤒𐤍𐤄',   en: 'reed — the measuring rod, six cubits', sn: 'H7070' },
  amah:       { translit: 'Amah',        paleo: '𐤀𐤌𐤄',   en: 'cubit',                       sn: 'H520' },
  tapach:     { translit: 'Tapach',      paleo: '𐤈𐤐𐤇',   en: 'handbreadth',                 sn: 'H2948' },
  shair:      { translit: 'Shair',       paleo: '𐤔𐤏𐤓',   en: 'gate',                        sn: 'H8179' },
  sap:        { translit: 'Sap',         paleo: '𐤎𐤐',    en: 'threshold',                   sn: 'H5592' },
  thaa:       { translit: 'Thaa',        paleo: '𐤕𐤀',    en: 'lodge / guard room',          sn: 'H8372' },
  ayal:       { translit: 'Ayal',        paleo: '𐤀𐤉𐤋',   en: 'post / pilaster',             sn: 'H352' },
  awalam:     { translit: 'Awalam',      paleo: '𐤀𐤅𐤋𐤌',  en: 'porch',                       sn: 'H197' },
  mailah:     { translit: 'Mailah',      paleo: '𐤌𐤏𐤋𐤄',  en: 'ascent / steps',              sn: 'H4609' },
  chalawan:   { translit: 'Chalawan',    paleo: '𐤇𐤋𐤅𐤍',  en: 'window',                      sn: 'H2474' },
  thamar:     { translit: 'Thamar',      paleo: '𐤕𐤌𐤓',   en: 'palm tree',                   sn: 'H8561' },
  chatzar:    { translit: 'Chatzar',     paleo: '𐤇𐤑𐤓',   en: 'court',                       sn: 'H2691' },
  ratzapah:   { translit: 'Ratzapah',    paleo: '𐤓𐤑𐤐𐤄',  en: 'pavement',                    sn: 'H7531' },
  lashakah:   { translit: 'Lashakah',    paleo: '𐤋𐤔𐤊𐤄',  en: 'room / chamber',              sn: 'H3957' },
  mazabach:   { translit: 'Mazabach',    paleo: '𐤌𐤆𐤁𐤇',  en: 'altar',                       sn: 'H4196' },
  shalachan:  { translit: 'Shalachan',   paleo: '𐤔𐤋𐤇𐤍',  en: 'table',                       sn: 'H7979' },
  hayakal:    { translit: 'Hayakal',     paleo: '𐤄𐤉𐤊𐤋',  en: 'temple / the great hall',     sn: 'H1964' },
  qadash:     { translit: 'Qadash',      paleo: '𐤒𐤃𐤔',   en: 'holy / set apart',            sn: 'H6944' },
  qayar:      { translit: 'Qayar',       paleo: '𐤒𐤉𐤓',   en: 'wall (of a building)',        sn: 'H7023' },
  tzalai:     { translit: 'Tzalai',      paleo: '𐤑𐤋𐤏',   en: 'side (chamber)',              sn: 'H6763' },
  gazarah:    { translit: 'Gazarah',     paleo: '𐤂𐤆𐤓𐤄',  en: 'separate place',              sn: 'H1508' },
  banayan:    { translit: 'Banayan',     paleo: '𐤁𐤍𐤉𐤍',  en: 'building',                    sn: 'H1146' },
  athawaq:    { translit: 'Athawaq',     paleo: '𐤀𐤕𐤉𐤒',  en: 'gallery',                     sn: 'H862' },
  karawab:    { translit: 'Karawab',     paleo: '𐤊𐤓𐤅𐤁',  en: 'cherub / cherubim',           sn: 'H3742' },
  itz:        { translit: 'Itz',         paleo: '𐤏𐤑',    en: 'wood / tree',                 sn: 'H6086' },
  dalath:     { translit: 'Dalath',      paleo: '𐤃𐤋𐤕',   en: 'door',                        sn: 'H1817' },
  mahalak:    { translit: 'Mahalak',     paleo: '𐤌𐤄𐤋𐤊',  en: 'walk / passage',              sn: 'H4109' },
  gadar:      { translit: 'Gadar',       paleo: '𐤂𐤃𐤓',   en: 'wall (of a court)',           sn: 'H1447' },
  kahanayam:  { translit: 'Kahanayam',   paleo: '𐤊𐤄𐤍𐤉𐤌', en: 'priests',                     sn: 'H3548' },
  tzadawaq:   { translit: 'Tzadawaq',    paleo: '𐤑𐤃𐤅𐤒',  en: 'Zadok — "righteous"',         sn: 'H6659' },
  araayal:    { translit: 'Araayal',     paleo: '𐤀𐤓𐤀𐤉𐤋', en: 'altar hearth — "lion of Al"', sn: 'H741' },
  haral:      { translit: 'Har\'Al',     paleo: '𐤄𐤓𐤀𐤋',  en: 'mountain of Al — the altar\'s upper block', sn: 'H2025' },
  qaran:      { translit: 'Qaran',       paleo: '𐤒𐤓𐤍',   en: 'horn',                        sn: 'H7161' },
  chayaq:     { translit: 'Chayaq',      paleo: '𐤇𐤉𐤒',   en: 'bottom / bosom — the altar\'s base', sn: 'H2436' },
  gabawal:    { translit: 'Gabawal',     paleo: '𐤂𐤁𐤅𐤋',  en: 'border / boundary',           sn: 'H1366' },
  kabawad:    { translit: 'Kabawad',     paleo: '𐤊𐤁𐤅𐤃',  en: 'glory / weight',              sn: 'H3519' },
  qadayam:    { translit: 'Qadayam',     paleo: '𐤒𐤃𐤉𐤌',  en: 'east — "the front"',          sn: 'H6921' },
  har:        { translit: 'Har',         paleo: '𐤄𐤓',    en: 'mountain',                    sn: 'H2022' },
  yachazaqaal:{ translit: 'Yachazaqaal', paleo: '𐤉𐤇𐤆𐤒𐤀𐤋', en: 'Ezekiel — "Al strengthens"', sn: 'H3168' },
};

// ── Materials ────────────────────────────────────────────────────────────────
export const MATERIALS = { ...BASE_MATERIALS, ground: { word: 'chatzar', color: '#7a6646', hi: '#9a8562', lo: '#4e3f2a', metal: 0, rough: 1 }, paving: { ...BASE_MATERIALS.paving, color: '#a99b7f' } };   // the pavement a shade deeper than the temple's, under the harder sun   // packed earth of the courts, darker than the pale stone (fieldy: contrast between the ground and the buildings)

// ── The frame, in cubits ─────────────────────────────────────────────────────
// 42:16–20: five hundred square, a wall about it. 40:5: the wall one reed thick, one reed high.
// 40:6–16: a gate fifty long (40:15), twenty-five broad (40:13). 40:19, 23, 27: a hundred from the
// outer gate to the inner court, gate to gate. 40:47: the inner court a hundred square, the altar
// before the house. 41:13–14: the house a hundred long; the separate place and the building a
// hundred; the face of the house and the separate place a hundred broad. 40:22, 26: seven steps up
// to the outer gates; 40:31, 34, 37: eight to the inner; 41:8: the house on a raised base of a full
// reed. Steps of half a cubit (assumed): 7 × ½ = 3½, 8 × ½ = 4, ten steps of 0.6 = the reed.
export const OUT = 250;                                 // the wall's outer face, ±250
export const WALL = { t: 6, h: 6 };                     // 40:5
export const GATE = { len: 50, w: 25, pass: 10, room: 6, gap: 5, sill: 6, porch: 8, post: 2, h: 12, postH: 60, wallT: 1.5 };   // 40:6–15 (h assumed; postH 40:14)
export const LEVEL = { out: 0, outer: 3.5, inner: 7.5, house: 13.5 };   // the ground outside, the outer court, the inner court, the house's floor
export const INNER = { x0: -50, x1: 50, z: 50 };        // the inner court, 100 square (40:47)
export const HOUSE = { x0: -150, x1: -50, z: 25 };      // the house, 100 long (41:13); 50 broad outside (6 + 4 + 5 each side of 20, 41:1–9)
export const HAY = { porchD: 11, porchPost: 5, front: 6, len: 40, inZ: 10, part: 2, holy: 20, back: 6, wall: 6, side: 4, sideWall: 5, h: 30 };   // 40:48–41:9 (h assumed, as Shalamah's)
// where things stand along x, from the porch's east face at HOUSE.x1
export const PORCH_X0 = HOUSE.x1 - HAY.porchD;                       // −61: the front wall's outer face (the posts of 41:1, six thick)
export const HAY_X1 = PORCH_X0 - HAY.front;                          // −67: the hall's east end inside
export const HAY_X0 = HAY_X1 - HAY.len;                              // −107: the partition's east face
export const HOLY_X1 = HAY_X0 - HAY.part;                            // −109
export const HOLY_X0 = HOLY_X1 - HAY.holy;                           // −129: the west wall's inner face
export const BACK_X = HOLY_X0 - HAY.back;                            // −135: the west wall's outer face
export const SIDE_X = BACK_X - HAY.side - HAY.sideWall;              // −144: the side rooms' outer face
export const PAD = 4;                                                // the base's margin east of the porch (assumed)
export const GIZRAH = { x0: -170, x1: HOUSE.x0 };                    // the separate place, twenty (41:13–14 imply it: 100 − 80)
export const BINYAN = { x0: -OUT, x1: -170, z: 45, wallT: 5 };       // 41:12: seventy broad, walls five, ninety long — eighty by a hundred outside, its back on the great wall
export const ALTAR = { x: 0, z: 0 };                                 // 43:13–17, before the house in the midst of the inner court (40:47)
export const CHAMBERS = { x0: -150, x1: -50, z0: 50, z1: 100, h: 18 };   // 42:1–8: a hundred long, fifty broad, three stories (north; the south mirrored, 42:10–12)

// ── Parts ────────────────────────────────────────────────────────────────────
const K = makeKit(LEVEL.out);
const { box, cyl, ideal, wallX, wallZ, slab, roofOf, stair, seat, lamp, chest, jars, paving, altarFlight } = K;
const pave = (...a) => paving(...a).map((b) => ({ ...b, ideal: false }));   // a pavement the text gives, shown as itself

/**
 * A gatehouse of 40:6–16, in a local frame: u runs along the passage from its OUTER end (u = 0, the
 * first threshold) inward to u = 50 (the porch's posts); v across it, 0 on the axis. `at(u, v)` maps
 * to the world. For the inner gates, whose porches face the outer court (40:31, 34), the layout is
 * mirrored (`flip`): the porch is met first from the outer court, the threshold last, into the inner
 * court. Everything sits on floor `y`.
 *   threshold 6 (40:6) · rooms 6 × 6, three a side, 5 between (40:7, 10, 12) · threshold 6 (40:7) · porch 8 (40:9) · posts 2 (40:9)
 *   = 50 (40:15); across: passage 10 (40:11) + rooms 6 + 6 + walls 1½ = 25 (40:13)
 */
export function gatehouse(axis, outer, dir, mid, y, flip = false, stepsOut = 7, stepRise = 0.5) {
  const { len, w, pass, room, gap, sill, porch, post, h, postH, wallT } = GATE;
  const U = (u) => (flip ? len - u : u);
  // a box from local (u0…u1) × (v0…v1), bottom yy, hh high
  const B = (u0, u1, v0, v1, yy, hh, extra = {}) => {
    const a0 = outer + dir * U(u0), a1 = outer + dir * U(u1), c = (a0 + a1) / 2, l = Math.abs(a1 - a0);
    const vc = mid + (v0 + v1) / 2, vw = Math.abs(v1 - v0);
    return axis === 'x' ? box(c, yy, vc, l, hh, vw, extra) : box(vc, yy, c, vw, hh, l, extra);
  };
  const out = [];
  const roleOut = axis === 'x' ? (dir < 0 ? 'east' : 'west') : (dir > 0 ? 'north' : 'south');
  // the side walls, full length, with the rooms as recesses: solid between the rooms, thin along them
  for (const s of [-1, 1]) {
    const vIn = s * pass / 2, vOut = s * w / 2;
    out.push(B(0, sill, vIn, vOut, y, h, { role: 'jamb' }));                                       // the first threshold's flanks
    let u = sill;
    for (let i = 0; i < 3; i++) {
      // the room: floor, an outer wall with a closed window, the border (sill) toward the passage, a roof
      out.push(B(u, u + room, s * (pass / 2 + room), vOut, y, h, { role: 'thaa', windows: 1 }));     // the outer wall (1½), a closed window in it (40:16)
      out.push(B(u, u + room, vIn, s * (pass / 2 + 1), y, 1, { role: 'border', mat: 'stone' }));   // the gabawal (border), one cubit before the room (40:12)
      out.push(B(u, u + room, vIn, s * (pass / 2 + room), y + h - 1.5, 1.5, { role: 'roof' }));     // the room's roof (40:13 measures roof to roof)
      u += room;
      if (i < 2) { out.push(B(u, u + gap, vIn, vOut, y, h, { role: 'thaa' })); u += gap; }        // the five between the rooms, solid
    }
    out.push(B(u, u + sill, vIn, vOut, y, h, { role: 'jamb' })); u += sill;                         // the second threshold's flanks
    out.push(B(u, u + porch, s * (pass / 2), vOut, y, h, { role: 'awalam', windows: 1 }));         // the porch's side, a window in it (40:16)
    u += porch;
    out.push(B(u, u + post, vIn, vOut, y, postH, { role: 'ayal', carved: true }));                  // the posts, sixty (40:14), palm trees on them (40:16)
  }
  // thresholds and floor: the passage's floor at y, the two thresholds a hand higher
  out.push(B(0, sill, -pass / 2, pass / 2, y, 0.3, { role: 'threshold', mat: 'stone' }));
  out.push(B(sill + 3 * room + 2 * gap, sill + 3 * room + 2 * gap + sill, -pass / 2, pass / 2, y, 0.3, { role: 'threshold', mat: 'stone' }));
  out.push(B(0, len, -pass / 2 - room, pass / 2 + room, y - 0.4, 0.5, { role: 'floor', mat: 'paving' }));   // its top a hand above the court's ground it stands in
  // the roof over the passage and the porch (the posts stand above it)
  out.push(B(0, len - post, -w / 2, w / 2, y + h, 1.5, { role: 'roof' }));
  // the steps up to the outer end (40:22, 26 seven; 40:31, 34, 37 eight): from the ground below, the gate's width
  const n = stepsOut, rise = stepRise, dOut = -dir;   // the steps lie OUTSIDE the outer end (for a flipped gate that end is the porch's, still at `outer`)
  const s0 = outer;
  // the steps the text counts, built solid (only their rise is assumed), a cheek wall of the gate's stone each side so the
  // flight stands as a founded mass against the gate (fieldy: "it doesn't look like it can support itself")
  const flight = (axis === 'x'
    ? stair('x', s0 + dOut * n, mid, n, w - 3, -dOut, y - n * rise, rise, 1)
    : stair('z', mid, s0 + dOut * n, n, w - 3, -dOut, y - n * rise, rise, 1)).map((b) => ({ ...b, ideal: false }));
  out.push(...flight);
  for (const sg of [-1, 1]) {
    const c = s0 + dOut * n / 2, len = n + 0.2, ch = n * rise + 1.2;
    out.push(axis === 'x' ? box(c, y - n * rise, mid + sg * (w / 2 - 0.75), len, ch, 1.5, { role: 'cheek' }) : box(mid + sg * (w / 2 - 0.75), y - n * rise, c, 1.5, ch, len, { role: 'cheek' }));
  }
  // the passage's ends, for the gate leaves (the east gate is shut, 44:1–2) and the plan
  // the leaves hang at the first threshold's inner face and swing into the passage (+u), clear of their own jambs
  const g0 = outer + dir * U(sill - 0.25), g1 = outer + dir * U(len - post / 2), open = dir * (flip ? -1 : 1);
  out.role = roleOut;
  out.gates = axis === 'x' ? [{ axis: 'z', x: g0, z: mid, w: pass, y, open, t: 3.5 }, { axis: 'z', x: g1, z: mid, w: pass, y, leaves: false }] : [{ axis: 'x', x: mid, z: g0, w: pass, y, open, t: 3.5 }, { axis: 'x', x: mid, z: g1, w: pass, y, leaves: false }];
  return out;
}

/** The great wall (42:20), 500 square, one reed thick and high, on the ground outside; its west run is the building's back. */
function greatWall() {
  const { t, h } = WALL, y = LEVEL.out;   // the piece's `gates` cut the three gaps (builders' cutGates); the east and west runs stand between the north and south ones
  return [
    box(0, y, OUT - t / 2, 2 * OUT, h, t, { role: 'south' }), box(0, y, -OUT + t / 2, 2 * OUT, h, t, { role: 'north' }),
    box(OUT - t / 2, y, 0, t, h, 2 * OUT - 2 * t, { role: 'east' }), box(-OUT + t / 2, y, 0, t, h, 2 * OUT - 2 * t, { role: 'west' }),
  ];
}

/** The outer court's ground (seven steps above the land), its pavement fifty wide along the wall (40:17–18) and the thirty rooms on it. */
function outerCourt() {
  const y = LEVEL.out, h = LEVEL.outer, out = [];
  // the terrace: everything inside the wall stands 3½ up (the gates' floors are at it)
  const E = 2 * OUT - 2 * WALL.t;
  out.push(box(0, y, 0, E, h - 0.3, E, { role: 'terrace', mat: 'found', courses: [10, 8] }));   // the terrace's retaining courses, seen from outside the wall as the built platform it is
  out.push(box(0, y + h - 0.3, 0, E, 0.3, E, { role: 'ground', mat: 'ground' }));
  // the pavement, fifty wide, along the east, north and south walls (the building stands along the west), the gates cut through it
  const P = GATE.len, e = OUT - WALL.t, g = GATE.w / 2;
  // the ratzapah (pavement) the text gives (40:17–18) — drawn as itself, not hatched — the gates cut through it
  out.push(...pave(e - P, e, -e, -g, h), ...pave(e - P, e, g, e, h));
  out.push(...pave(-e, -g, -e, -e + P, h), ...pave(g, e - P, -e, -e + P, h), ...pave(-e, -g, e - P, e, h), ...pave(g, e - P, e - P, e, h));
  // thirty rooms (40:17), ten on each paved side, five either side of the gate: 24 long, 20 deep, a door to the court (idealized)
  const rooms = (axis, wallAt, sign, from, to) => {
    const step = (to - from) / 5;
    for (let i = 0; i < 5; i++) {
      const a0 = from + i * step + 2, a1 = from + (i + 1) * step - 2, c = (a0 + a1) / 2, L = a1 - a0;
      if (axis === 'x') {   // rooms along the east wall (their long side along z)
        out.push(...wallZ(wallAt - sign * 20, a0, a1, 8, c, 3, h));
        out.push(...wallX(a0, wallAt - sign * 20, wallAt, 8, null, 3, h), ...wallX(a1, wallAt - sign * 20, wallAt, 8, null, 3, h));
        out.push(...roofOf(Math.min(wallAt, wallAt - sign * 20), Math.max(wallAt, wallAt - sign * 20), a0, a1, h + 8).filter((b) => b.role === 'roof'));
      } else {   // rooms along the north or south wall
        out.push(...wallX(wallAt - sign * 20, a0, a1, 8, c, 3, h));
        out.push(...wallZ(a0, Math.min(wallAt, wallAt - sign * 20), Math.max(wallAt, wallAt - sign * 20), 8, null, 3, h), ...wallZ(a1, Math.min(wallAt, wallAt - sign * 20), Math.max(wallAt, wallAt - sign * 20), 8, null, 3, h));
        out.push(...roofOf(a0, a1, Math.min(wallAt, wallAt - sign * 20), Math.max(wallAt, wallAt - sign * 20), h + 8).filter((b) => b.role === 'roof'));
      }
    }
  };
  rooms('x', e, 1, -e + 2, -GATE.w / 2 - 4); rooms('x', e, 1, GATE.w / 2 + 4, e - 2);
  rooms('z', -e, -1, -e + P + 2, -GATE.w / 2 - 4); rooms('z', -e, -1, GATE.w / 2 + 4, e - P - 2);
  rooms('z', e, 1, -e + P + 2, -GATE.w / 2 - 4); rooms('z', e, 1, GATE.w / 2 + 4, e - P - 2);
  return out;
}

/** The inner court (40:47): a hundred square, eight steps above the outer court; its low wall (idealized) where no gate or building stands. */
function innerCourt() {
  const y = LEVEL.outer, h = LEVEL.inner - LEVEL.outer, out = [];
  out.push(box(0, y, 0, INNER.x1 - INNER.x0, h - 0.3, 2 * INNER.z, { role: 'terrace', mat: 'found', courses: [10, 8] }));   // the terrace, built of courses
  out.push(box(0, y + h - 0.3, 0, INNER.x1 - INNER.x0, 0.3, 2 * INNER.z, { role: 'ground', mat: 'paving' }));   // paved
  // the house's platform runs west of it at the same level, the separate place and the building's ground with it
  // the house's platform runs west of it at the same level, with the priests' rooms north and south of the house, the separate place
  // and the building beyond: one founded block from the court to the great wall, as broad as the priests' rooms (their wall of 42:7
  // stands on its edge); and each inner gate is founded on the outer court too (its floor eight steps up, 40:31)
  const zE = CHAMBERS.z1 - 2, T = (x0, x1, z0, z1, mat) => out.push(box((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h - 0.3, z1 - z0, { role: 'terrace', mat: 'found', courses: [10, 8] }), box((x0 + x1) / 2, y + h - 0.3, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { role: 'ground', mat }));
  T(-OUT + WALL.t, INNER.x0, -zE, zE, 'ground');
  T(INNER.x1, INNER.x1 + GATE.len, -GATE.w / 2, GATE.w / 2, 'paving'); T(-GATE.w / 2, GATE.w / 2, -INNER.z - GATE.len, -INNER.z, 'paving'); T(-GATE.w / 2, GATE.w / 2, INNER.z, INNER.z + GATE.len, 'paving');
  // a parapet (idealized) on the east and along the north/south runs between the gates and the rooms
  const t = 2, ph = 4.2, gw = GATE.w / 2 + 1;
  out.push(ideal(box(INNER.x1 - t / 2, LEVEL.inner, -(INNER.z + gw) / 2, t, ph, INNER.z - gw, { role: 'east' })), ideal(box(INNER.x1 - t / 2, LEVEL.inner, (INNER.z + gw) / 2, t, ph, INNER.z - gw, { role: 'east' })));
  for (const s of [-1, 1]) { out.push(ideal(box((INNER.x1 - t + gw) / 2, LEVEL.inner, s * (INNER.z - t / 2), INNER.x1 - t - gw, ph, t, { role: s > 0 ? 'south' : 'north' })), ideal(box((INNER.x0 - gw) / 2, LEVEL.inner, s * (INNER.z - t / 2), -gw - INNER.x0, ph, t, { role: s > 0 ? 'south' : 'north' }))); }
  return out;
}

/** The mazabach (altar) of 43:13–17: the chayaq (base) a cubit with its border, the lower ledge two, the greater four, the Har'Al four with its horns; steps on the east. */
function altar() {
  // the chayaq (bottom) a cubit with its border (43:13), the lower ledge two (43:14), the greater ledge four, fourteen square (43:14, 17),
  // the Har'Al four with the araayal (hearth) twelve square and its horns (43:15–16); its steps toward the east (43:17), flush with the hearth
  return altarFlight(ALTAR.x, ALTAR.z, LEVEL.inner, [[20, 1], [16, 2], [14, 4], [12, 4]], 'x', 1, 8, 0.5, 0.7);
}

/** The awalam (porch) of the house (40:48–49): twenty across, eleven deep, posts five each side, pillars by the posts, ten steps up (the base of a full reed, 41:8). */
function porch() {
  const y = LEVEL.house, x1 = HOUSE.x1, x0 = PORCH_X0, out = [];
  const hh = HAY.h + 2;
  for (const s of [-1, 1]) out.push(box((x0 + x1) / 2, y, s * (HAY.inZ + HAY.porchPost / 2), x1 - x0, hh, HAY.porchPost, { role: s > 0 ? 'south' : 'north' }));   // the posts of the porch, five each side (40:48), as its side walls
  out.push(box((x0 + x1) / 2, y + hh, 0, x1 - x0, 1.5, 2 * HAY.inZ + 2 * HAY.porchPost, { role: 'roof' }));
  out.push(box(x1 - 1.5, y + 14, 0, 3, hh - 14, 2 * HAY.inZ, { role: 'lintel' }));                   // the front above the opening
  for (const s of [-1, 1]) out.push(cyl(x1 + 2, y, s * (HAY.inZ + 2.5), 1.6, hh, { role: 'pillar', mat: 'stone' }));   // the imawadayam (pillars) by the posts (40:49), on the base's margin
  out.push(box((x0 + x1) / 2, y, 0, x1 - x0, 0.3, 2 * HAY.inZ, { role: 'floor', mat: 'fir' }));
  // the raised base of a full reed (41:8) under the whole house, a margin of four before the porch (assumed), and its ten steps (assumed; 40:49) on the east
  out.push(box((HOUSE.x0 + HOUSE.x1 + PAD) / 2, LEVEL.inner, 0, HOUSE.x1 + PAD - HOUSE.x0, LEVEL.house - LEVEL.inner, 2 * HOUSE.z + 8, { role: 'base', mat: 'found', courses: [10, 8] }));
  out.push(...stair('x', x1 + PAD + 10, 0, 10, 2 * HAY.inZ + 2 * HAY.porchPost, -1, LEVEL.inner, 0.6, 1).map((b) => ({ ...b, ideal: false })));
  return out;
}

/** The hayakal (temple), forty by twenty (41:2): posts six each side (41:1), the entrance ten, the walls six (41:5). */
function hayakal() {
  const y = LEVEL.house, h = HAY.h, out = [];
  out.push(box((PORCH_X0 + HAY_X1) / 2, y, 0, HAY.front, h, 2 * HAY.inZ + 2 * HAY.wall, { role: 'east', doorway: { w: 10, h: 14 } }));   // the front, six thick — the posts of the temple (41:1) — its opening ten (41:2)
  for (const s of [-1, 1]) out.push(box((HAY_X0 + HAY_X1) / 2, y, s * (HAY.inZ + HAY.wall / 2), HAY.len, h, HAY.wall, { role: s > 0 ? 'south' : 'north' }));
  out.push(box((HAY_X0 + PORCH_X0) / 2, y + h, 0, PORCH_X0 - HAY_X0, 2, 2 * HAY.inZ + 2 * HAY.wall, { role: 'roof', beams: true }));
  out.push(box((HAY_X0 + HAY_X1) / 2, y, 0, HAY.len, 0.3, 2 * HAY.inZ, { role: 'floor', mat: 'fir' }));
  return out;
}

/** The most qadash (holy) place, twenty square (41:4), behind posts of two and an entrance of six (41:3); the west wall six. */
function holy() {
  const y = LEVEL.house, h = HAY.h, out = [];
  out.push(box((HAY_X0 + HOLY_X1) / 2, y, 0, HAY.part, h, 2 * HAY.inZ, { role: 'partition', carved: true, doorway: { w: 6, h: 10 } }));   // the posts of the entrance, two (41:3); the entrance six
  for (const s of [-1, 1]) out.push(box((HOLY_X0 + HOLY_X1) / 2, y, s * (HAY.inZ + HAY.wall / 2), HAY.holy, h, HAY.wall, { role: s > 0 ? 'south' : 'north' }));
  out.push(box((BACK_X + HOLY_X0) / 2, y, 0, HAY.back, h, 2 * HAY.inZ + 2 * HAY.wall, { role: 'west' }));
  out.push(box((BACK_X + HAY_X0) / 2, y + h, 0, HAY_X0 - BACK_X, 2, 2 * HAY.inZ + 2 * HAY.wall, { role: 'roof', beams: true }));
  out.push(box((HOLY_X0 + HOLY_X1) / 2, y, 0, HAY.holy, 0.3, 2 * HAY.inZ, { role: 'floor', mat: 'fir' }));
  return out;
}

/** The tzalai (side) rooms, three stories, thirty in order (41:5–11): four broad against the wall, their outer wall five, doors north and south. */
function sideRooms() {
  const y = LEVEL.house, st = 8, out = [];
  const zIn = HAY.inZ + HAY.wall, zOut = zIn + HAY.side + HAY.sideWall, x1 = HAY_X1, x0 = SIDE_X;
  for (let i = 0; i < 3; i++) {
    const yy = y + i * st;
    for (const s of [-1, 1]) {
      out.push(box((x0 + HAY.sideWall + PORCH_X0) / 2, yy, s * (zOut - HAY.sideWall / 2), PORCH_X0 - x0 - HAY.sideWall, st, HAY.sideWall, { role: s > 0 ? 'south' : 'north', storey: i, windows: 1 }));
      out.push(box((x0 + HAY.sideWall + PORCH_X0) / 2, yy + st - 1, s * (zIn + HAY.side / 2), PORCH_X0 - x0 - HAY.sideWall, 1, HAY.side, { role: 'slab', storey: i }));
      // ten rooms a storey (41:6): partitions every ten along the side (idealized)
      for (let k = 1; k < 8; k++) out.push(ideal(box(PORCH_X0 - k * ((PORCH_X0 - x0) / 8), yy, s * (zIn + HAY.side / 2), 0.6, st - 1, HAY.side, { mat: 'plaster', role: 'partition' })));
    }
    out.push(box(x0 + HAY.sideWall / 2, yy, 0, HAY.sideWall, st, 2 * zOut, { role: 'west', storey: i, windows: 1 }));   // the west run's outer wall
    out.push(box((x0 + HAY.sideWall + BACK_X) / 2, yy + st - 1, 0, BACK_X - x0 - HAY.sideWall, 1, 2 * zIn, { role: 'slab', storey: i }));
  }
  // the doors of the side rooms, one toward the north and one toward the south (41:11), in the ground storey
  return out;
}

/** The banayan (building) toward the west (41:12): seventy broad, walls five, ninety long — its back on the great wall; three stories of galleries (41:15–16). */
function binyan() {
  const y = LEVEL.inner, { x0, x1, z, wallT } = BINYAN, h = 24, out = [];
  out.push(box((x0 + x1) / 2, y, z - wallT / 2, x1 - x0, h, wallT, { role: 'south', windows: 3 }), box((x0 + x1) / 2, y, -z + wallT / 2, x1 - x0, h, wallT, { role: 'north', windows: 3 }));
  out.push(box(x1 - wallT / 2, y, 0, wallT, h, 2 * z - 2 * wallT, { role: 'east', doorway: { w: 6, h: 10 } }));
  out.push(box(x0 + WALL.t / 2, LEVEL.out + WALL.h, 0, WALL.t, h + y - LEVEL.out - WALL.h, 2 * z - 2 * wallT, { role: 'west' }));   // its back, on the great wall's line, rising from the wall's top
  out.push(box((x0 + x1) / 2, y + h, 0, x1 - x0, 1.5, 2 * z, { role: 'roof' }));
  // galleries (41:16): two floors round an open well, each reached by a flight of sixteen half-cubit steps along the north wall; the
  // opening over a flight runs from the step where the head nears the slab to EXACTLY its last step (the stair-opening rule)
  const well = { x0: x1 - 30, x1: x1 - 6, z0: -12, z1: 12 }, zf = -z + wallT + 1;
  const flight = (xs, yy) => stair('z', xs, zf, 16, 3, 1, yy, 0.5, 1), hole = (xs) => ({ x0: xs - 1.5, x1: xs + 1.5, z0: zf + 5, z1: zf + 16 });
  out.push(...slab(x0 + WALL.t, x1 - wallT, -z + wallT, z - wallT, y + 8, [well, hole(x1 - 10)], 'cedar', 'floor'));
  out.push(...slab(x0 + WALL.t, x1 - wallT, -z + wallT, z - wallT, y + 16, [well, hole(x1 - 18)], 'cedar', 'floor'));
  out.push(...flight(x1 - 10, y), ...flight(x1 - 18, y + 8));
  // the ground storey furnished as the house of the keepers of the gates (44:11, 14) — the Parbar westward with its courses of
  // keepers (1 Chronicles 26:18) — all idealized: quarters along the south wall, each with a door on the hall, a bed and a seat;
  // stores along the north wall west of the stairs, with jars; a table with seats and lamps in the hall
  const X0 = x0 + WALL.t, X1 = x1 - wallT, Z1 = z - wallT, Z0 = -z + wallT, H8 = 7;   // the partitions rise to the gallery's underside
  const nQ = 8, qw = (X1 - X0) / nQ, qz = Z1 - 10;
  for (let i = 0; i < nQ; i++) {
    const a = X0 + i * qw, b = a + qw, c = (a + b) / 2;
    out.push(...wallX(qz + 0.5, a, b, H8, c, 3, y));
    if (i) out.push(...wallZ(a, qz + 1, Z1, H8, null, 3, y));
    out.push(...K.bed(c - 0.2, Z1 - 2.2, 3, 6, y), ...seat(c + 3, qz + 3.2, y));
  }
  const nS = 4, sw = (x1 - 22 - X0) / nS, sz1 = Z0 + 10;
  for (let i = 0; i < nS; i++) {
    const a = X0 + i * sw, b = a + sw, c = (a + b) / 2;
    out.push(...wallX(sz1 - 0.5, a, b, H8, c, 3, y));
    if (i) out.push(...wallZ(a, Z0, sz1 - 1, H8, null, 3, y));
    out.push(...jars(a + 1.5, Z0 + 1.5, 6, y), ...jars(a + 1.5, Z0 + 5, 3, y));
  }
  out.push(...wallZ(x1 - 22, Z0, sz1 - 1, H8, null, 3, y));   // the stores' east end, the stairs beyond it
  out.push(...K.table(x0 + 30, 0, 3, 8, y), ...seat(x0 + 27, 2.6, y), ...seat(x0 + 30, 2.6, y), ...seat(x0 + 33, 2.6, y), ...seat(x0 + 27, -2.6, y), ...seat(x0 + 30, -2.6, y), ...seat(x0 + 33, -2.6, y));
  out.push(...lamp(x0 + 30, -6, y), ...lamp(x0 + 30, 6, y), ...lamp(X1 - 4, Z0 + 4, y), ...lamp(X1 - 4, qz - 3, y));
  return out;
}

/** The kahanayam (priests)' rooms (42:1–14): a hundred long, fifty broad, three stories stepping back; a walk of ten before them; north of the house, and the south the same. */
function chambers(s) {
  const y = LEVEL.inner, { x0, x1, z0, z1 } = CHAMBERS, out = [], sz = (v) => s * v, mm = (a, b) => [Math.min(sz(a), sz(b)), Math.max(sz(a), sz(b))];
  const ST = 8, D = 20, WK = 10;   // a storey, the depth of the rooms before the temple, the walk (42:4)
  // the plan (42:1–9): a row of rooms a hundred long before the temple (42:8), a walk of ten before them (42:4), and toward the
  // outer court a row fifty long (42:8) with the wall of fifty (42:7) taking the rest of the front; the entry from the outer
  // court at the east end, below (42:9), eight steps up to the walk; the rooms' doors on the walk — toward the north (42:4)
  const inner = mm(z0, z0 + D), walk = mm(z0 + D, z0 + D + WK), outer = mm(z0 + D + WK, z1 - 2);
  const row = (X0, X1, [Z0, Z1], doorsAt, n, windowsAt) => {   // a row of n rooms between Z0 and Z1: its two long walls (doors in one), ends, partitions, roof
    const t = 1, wide = (X1 - X0) / n;
    out.push(...wallX(windowsAt + (windowsAt < doorsAt ? t / 2 : -t / 2), X0 + t, X1 - t, ST, null, 3, y).map((b) => ({ ...b, windows: 1 })));
    for (let i = 0; i < n; i++) out.push(...wallX(doorsAt + (doorsAt < windowsAt ? t / 2 : -t / 2), X0 + (i ? 0 : t) + i * wide, X0 + (i + 1) * wide - (i === n - 1 ? t : 0), ST, X0 + (i + 0.5) * wide, 3, y));
    out.push(...wallZ(X0 + t / 2, Z0, Z1, ST, null, 3, y), ...wallZ(X1 - t / 2, Z0, Z1, ST, null, 3, y));
    for (let i = 1; i < n; i++) out.push(...wallZ(X0 + i * wide, Z0 + t, Z1 - t, ST, null, 3, y));
    out.push(...roofOf(X0, X1, Z0, Z1, y + ST).filter((b) => b.role === 'roof'));
  };
  row(x0, x1, inner, walk[s > 0 ? 0 : 1], 8, inner[s > 0 ? 0 : 1]);             // the row before the temple: doors on the walk, windows toward the house
  row(x1 - 50, x1, outer, walk[s > 0 ? 1 : 0], 4, outer[s > 0 ? 1 : 0]);        // the row toward the outer court: doors on the walk, windows toward the court
  out.push(box((x0 + x0 + 50) / 2, LEVEL.outer, sz(z1 - 1), 50, LEVEL.inner - LEVEL.outer + 6, 2, { role: s > 0 ? 'south' : 'north' }));   // the gadar (wall) of 42:7, fifty, from the outer court's ground
  out.push(...pave(x0, x1, ...walk, y));                                                                  // the mahalak (walk), paved
  out.push(...stair('x', x1 + 8, sz(z0 + D + WK / 2), 8, 8, -1, LEVEL.outer, 0.5, 1).map((b) => ({ ...b, ideal: false })));   // the entry on the east (42:9), up from the outer court
  // the upper stories, stepping back from the walk (42:5–6): solid, idealized, on the ground storey's roof
  for (let i = 1; i < 3; i++) {
    const yy = y + ST + 1.5 + (i - 1) * ST, [a0, a1] = mm(z0, z0 + D - 6 * i), [b0, b1] = mm(z1 - 2 - (outer[1] - outer[0]) + 6 * i, z1 - 2);
    out.push(ideal(box((x0 + x1) / 2, yy, (a0 + a1) / 2, x1 - x0, ST, a1 - a0, { mat: 'plaster', role: 'block', storey: i, windows: 1 })));
    out.push(ideal(box(x1 - 25, yy, (b0 + b1) / 2, 50, ST, b1 - b0, { mat: 'plaster', role: 'block', storey: i, windows: 1 })));
  }
  return out;
}

/** Eight shalachanawath (tables) at the north inner gate (40:39–41), four of cut stone for the burnt offering (40:42), a cubit and a half square, a cubit high. */
function tables() {
  const out = [], T = (x, z, y) => box(x, y, z, 1.5, 1, 1.5, { mat: 'stone', role: 'table' });
  // in the porch of the north inner gate (its porch is at the outer court's end, z −100…−92, on the gate's floor), two a side (40:39)
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) out.push(T(sx * 3.6, -98.5 + i * 3.5, LEVEL.inner));
  // outside, by the entry, as one goes up (40:40): two a side against the gate's outer walls, on the outer court, clear of the flight
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) out.push(T(sx * 14.5, -106.5 + i * 3.2, LEVEL.outer));
  // four of cut stone for the burnt offering, by the side of the gate (40:41–42), a cubit and a half square, a cubit high — in a row along its side
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) out.push(T(sx * 14.5, -96 + i * 3.2, LEVEL.outer));
  return out;
}

/** The rooms of the singers in the inner court (40:44–46): one by the north gate looking south (the keepers of the house), one by the east gate looking north (the keepers of the altar). */
function singers() {
  const y = LEVEL.inner, out = [];
  // by the north gate, looking south (40:45): x 16…40, z −49…−30, its door in the south wall
  out.push(...wallX(-30, 16, 40, 8, 28, 3, y), ...wallX(-49, 16, 40, 8, null, 3, y), ...wallZ(16, -49, -30, 8, null, 3, y), ...wallZ(40, -49, -30, 8, null, 3, y), ...roofOf(16, 40, -49, -30, y + 8).filter((b) => b.role === 'roof'));
  // by the east gate, looking north (40:46): x 30…49, z 16…40, its door in the north wall
  out.push(...wallX(16, 30, 49, 8, 40, 3, y), ...wallX(40, 30, 49, 8, null, 3, y), ...wallZ(30, 16, 40, 8, null, 3, y), ...wallZ(49, 16, 40, 8, null, 3, y), ...roofOf(30, 49, 16, 40, y + 8).filter((b) => b.role === 'roof'));
  out.push(...seat(22, -44, y), ...lamp(36, -34, y), ...chest(44, 20, y), ...jars(33, 34, 3, y));
  return out;
}

// ── The pieces ───────────────────────────────────────────────────────────────
// `on`: the verses that light up in the passage when the piece is chosen (26 = Ezekiel). `keys`: the
// text's words that pick this piece (see pieceForWord). `walk`: the WALK phase key at which it is the
// subject. `parts`: the solids.
const EAST = gatehouse('x', OUT, -1, 0, LEVEL.outer), NORTH = gatehouse('z', -OUT, 1, 0, LEVEL.outer), SOUTH = gatehouse('z', OUT, -1, 0, LEVEL.outer);
const IN_EAST = gatehouse('x', INNER.x1 + GATE.len, -1, 0, LEVEL.inner, true, 8), IN_NORTH = gatehouse('z', -INNER.z - GATE.len, 1, 0, LEVEL.inner, true, 8), IN_SOUTH = gatehouse('z', INNER.z + GATE.len, -1, 0, LEVEL.inner, true, 8);
const GATE_MEASURES = (ref) => [['arak (length)', '50 amah', '40:15; 40:21'], ['rachab (breadth), gag (roof) to gag (roof)', '25 amah', '40:13'], ['sap (threshold)', '1 qanah (reed) — 6 amah — each', '40:6–7'], ['lodges', '3 a side, 6 × 6, five between; a border of 1 before them', '40:7, 10, 12'], ['pathach (opening)', '10 amah', '40:11'], ['awalam (porch)', '8 amah; its ayalayam (posts) 2', '40:9'], ['ayalayam (posts)', '60 amah', '40:14'], ['mailahawath (steps)', ref, '']];
const OUTER_GATE = (id, name, dirWord, parts, on, refs, extra = {}) => ({
  id, group: 'gates', material: 'stone',
  tag: `${name} shair (gate)`, title: `The shair (gate) darak (toward) the ${name}`,
  words: ['shair', 'sap', 'thaa', 'ayal', 'awalam', 'mailah', 'thamar', 'chalawan'], keys: [],
  on, refs, walk: extra.walk,
  measures: GATE_MEASURES(extra.steps || '7, up from the land (40:22, 26)'),
  note: extra.note || `A gatehouse fifty long: through the ${dirWord} sap (threshold) into a passage ten wide between three lodges a side, over the second threshold into the awalam (porch) between its posts — "{{Ezekiel 40:16 | There were closed … thamar}}".`,
  elsewhere: { ref: '1 Kings 7:6–8; Ezekiel 44:1–3; 46:1–3, 8–10', note: 'The east gate the kabawad (glory) came in by is shut afterward, for the nashayaa (prince) to sit in and eat bread before Yahawah (44:1–3); the people come in by the north gate and go out by the south, and by the south and out by the north (46:9).' },
  assumed: extra.assumed || 'The height of the walls (12) is not given; the ayalayam (posts) are built to the sixty of 40:14, read as their height (as the awalam of 2 Chronicles 3:4); the side walls\' thickness (1½) closes the twenty-five; the steps are half a cubit each.',
  parts, gates: parts.gates,
});

export const PIECES = [
  {
    id: 'chawamah', order: 0, group: 'courts', material: 'stone',
    tag: 'chawamah (wall)', title: 'The chawamah (wall) chamash (five) maah (hundred) sabayab (all around)',
    words: ['chawamah', 'qanah', 'amah', 'tapach'], keys: ['chawamah', 'thickness', 'banayan'],
    on: V('26:40:5', '26:42:15-20'),
    refs: 'Ezekiel 40:5; 42:15–20', walk: 'wall',
    measures: [['thickness', '1 qanah (reed) — 6 amah (cubits) of a amah (cubit) and a tapach (handbreadth)', '40:5'], ['qawamah (height)', '1 qanah (reed)', '40:5'], ['east · north · south · west', '500 each', '42:16–19'], ['arak (length) · rachab (breadth)', '500 × 500', '42:20']],
    note: '"{{Ezekiel 40:5 | Behold, a chawamah … qanah}}" — the first thing measured, and the last (42:20): a square wall, "{{Ezekiel 42:20 | to badal … chal}}". The reed in the man\'s hand is six of these long cubits, and every measure after is in them.',
    elsewhere: { ref: 'Revelation 21:15–17; Zechariah 2:1–5; Ezekiel 45:1–4', note: 'The malaak (messenger) with a golden reed measures the city, its gates and its wall; Zakarayah (Zechariah)\'s man with a measuring line; the holy portion of the land, 25,000 by 10,000, with the sanctuary in the midst of it (45:1–4).' },
    assumed: 'The 500 is taken as amah, not qanahayam (reeds): the gate (50), court (100), gate (50), court (100), house (100) and the separate place with the building (100) measured inside sum to 500 exactly, with the gates\' thresholds in the wall\'s thickness and the building\'s back on the wall.',
    parts: greatWall(), gates: [{ axis: 'z', x: OUT - WALL.t / 2, z: 0, w: GATE.w, leaves: false }, { axis: 'x', x: 0, z: -OUT + WALL.t / 2, w: GATE.w, leaves: false }, { axis: 'x', x: 0, z: OUT - WALL.t / 2, w: GATE.w, leaves: false }],
  },
  OUTER_GATE('gate-east', 'qadayam (east)', 'first', EAST, V('26:40:6-16', '26:43:1-4', '26:44:1-3'), 'Ezekiel 40:6–16; 43:1–4', { walk: 'gate', note: '"{{Ezekiel 40:6 | Then bawaa … mailah}}" — the first gate, and the one the kabawad (glory) came in by (43:4): up its steps, over the sap (threshold) one reed deep, past three lodges on this side and three on that, each one reed square with five between and a border of a cubit before it, over the second threshold into the awalam (porch) of eight between posts of two — fifty from face to face (40:15), twenty-five from roof to roof (40:13).' }),
  OUTER_GATE('gate-north', 'tzapawan (north)', 'north', NORTH, V('26:40:20-23'), 'Ezekiel 40:20–23', { walk: 'north', note: '"{{Ezekiel 40:21 | The lodges … amah}}" — after the measure of the first gate in everything: its lodges, its posts, its arches, its windows and its palm trees; seven steps up to it (40:22); from it to the inner gate over against it, a hundred (40:23).' }),
  OUTER_GATE('gate-south', 'darawam (south)', 'south', SOUTH, V('26:40:24-27'), 'Ezekiel 40:24–27', { walk: 'south', note: '"{{Ezekiel 40:24 | He yalak … madahawath}}" — the same measures again; seven steps, a palm tree on either post (40:26); from gate to gate southward a hundred (40:27). There is no gate on the west: the building stands there (41:12).' }),
  {
    id: 'outer-court', order: 4, group: 'courts', material: 'stone',
    tag: 'chayatzawan (outer) chatzar (court)', title: 'The chayatzawan (outer) chatzar (court), its ratzapah (pavement) and thirty rooms',
    words: ['chatzar', 'ratzapah', 'lashakah'], keys: ['ratzapah', 'rooms', 'chayatzawan', 'lower', 'thachathawan'],
    on: V('26:40:17-19'),
    refs: 'Ezekiel 40:17–19', walk: 'court',
    measures: [['rooms', 'shalawashayam (thirty), on the pavement', '40:17'], ['ratzapah (pavement)', 'by the side of the gates, as long as the gates — the lower pavement', '40:18'], ['from the lower gate to the inner court', '100 amah, east and north', '40:19']],
    note: '"{{Ezekiel 40:17 | Then bawaa … around}}" — a pavement fifty wide runs along the inside of the wall, the length of the gates, and the thirty rooms stand on it; from the inner face of an outer gate to the inner court, a hundred cubits of open court, seven steps above the land.',
    elsewhere: { ref: 'Ezekiel 46:21–24; 2 Chronicles 4:9; Psalm 84:2, 10', note: 'In its four corners the courts of forty by thirty with their boiling places (46:21–24); "a day in your courts is better than a thousand".' },
    assumed: 'The thirty rooms\' size and arrangement (ten on each paved side, five either side of its gate, 24 × 20, a door to the court) are not given; the pavement is drawn on the east, north and south (the building fills the west).',
    parts: outerCourt(),
  },
  OUTER_GATE('inner-south', 'inner darawam (south)', 'south', IN_SOUTH, V('26:40:28-31'), 'Ezekiel 40:28–31', { walk: 'inner-south', steps: '8, up from the outer court (40:31)', note: '"{{Ezekiel 40:28 | Then he bawaa … madahawath}}" — the inner gates are the outer gates turned about: their arches toward the outer court (40:31), so one meets the awalam (porch) first and crosses the threshold last, into the inner court; eight steps up.', assumed: 'As the outer gates; turned so the porch faces the outer court (40:31, 34, 37), its posts on the outer court\'s side.' }),
  OUTER_GATE('inner-east', 'inner qadayam (east)', 'east', IN_EAST, V('26:40:32-34'), 'Ezekiel 40:32–34', { walk: 'inner-east', steps: '8, up from the outer court (40:34)', note: '"{{Ezekiel 40:32 | He bawaa … madahawath}}"; palm trees on its posts on this side and on that; eight steps (40:34). Straight through it lies the mazabach (altar), and beyond it the house.', assumed: 'As the outer gates; turned so the porch faces the outer court.' }),
  OUTER_GATE('inner-north', 'inner tzapawan (north)', 'north', IN_NORTH, V('26:40:35-37'), 'Ezekiel 40:35–37', { walk: 'inner-north', steps: '8, up from the outer court (40:37)', note: '"{{Ezekiel 40:35 | He bawaa … madahawath}}"; here are the tables of the sacrifices (40:39–43) and the room where the burnt offering is washed (40:38).', assumed: 'As the outer gates; turned so the porch faces the outer court.' }),
  {
    id: 'tables', order: 8, group: 'courts', material: 'stone',
    tag: 'shalachanawath (tables)', title: 'Shamanah (eight) shalachanawath (tables) at the north gate',
    words: ['shalachan', 'aban'], keys: ['shalachanawath', 'shalachan', 'tables', 'shachat', 'shapathayam', 'hooks', 'dawach'],
    on: V('26:40:38-43'),
    refs: 'Ezekiel 40:38–43', walk: 'tables',
    measures: [['in the awalam (porch) of the gate', '2 tables on this side, 2 on that', '40:39'], ['outside, by the entry', '2 on this side, 2 on that — 8', '40:40–41'], ['of cut aban (stone), for the burnt offering', '4, 1½ × 1½ × 1 high', '40:42'], ['shapathayam (hooks)', 'a tapach (handbreadth) long, fastened all around', '40:43']],
    note: '"{{Ezekiel 40:39 | In the awalam … offering}}" — the slaughtering tables of the north gate: on them the burnt offering, the sin offering and the trespass offering are killed, the instruments laid on the four of hewn stone, the flesh of the offering on the tables.',
    elsewhere: { ref: 'Leviticus 1:11; 2 Chronicles 4:8; Ezekiel 46:1–2', note: 'The burnt offering is killed on the north side of the altar before Yahawah (Leviticus 1:11); Shalamah\'s ten tables in the hayakal.' },
    assumed: 'Where exactly each table stands about the porch is a reconstruction: two a side within it, two a side against its outer walls, the four of stone in a row along its side.',
    parts: tables(),
  },
  {
    id: 'singers', order: 9, group: 'courts', material: 'plaster',
    tag: 'rooms of the kahanayam (priests)', title: 'The rooms of the singers — the kahanayam (priests) who keep the house and the altar',
    words: ['lashakah', 'kahanayam', 'tzadawaq'], keys: ['singers', 'keepers', 'mashamarath', 'tzadawaq', 'laway'],
    on: V('26:40:44-46'),
    refs: 'Ezekiel 40:44–46', walk: 'singers',
    measures: [['by the north gate, looking south', 'for the kahanayam (priests), keepers of the mashamarath (duty) of the bayath (house)', '40:45'], ['by the east gate, looking north', 'for the kahanayam (priests), keepers of the mashamarath (duty) of the mazabach (altar) — the banay (sons) of Tzadawaq (Zadok)', '40:46']],
    note: '"{{Ezekiel 40:46 | And the room … him}}" — two rooms in the inner court, beside the gates, for the priests who come near.',
    elsewhere: { ref: 'Ezekiel 44:15–16; 1 Chronicles 6:31–32; 2 Chronicles 5:12', note: 'The Lawayay (Levites) whom Dawad (David) set over the service of song; the priests the sons of Tzadawaq (Zadok) who kept the charge of the sanctuary when Yashar-Al (Israel) went astray (44:15).' },
    assumed: 'Their size (24 × 20) and what is in them.',
    parts: singers(),
  },
  {
    id: 'inner-court', order: 10, group: 'courts', material: 'stone',
    tag: 'inner chatzar (court)', title: 'The inner chatzar (court), a hundred square, the mazabach (altar) before the house',
    words: ['chatzar', 'mazabach'], keys: ['rabai', 'inner'],
    on: V('26:40:47', '26:43:5'),
    refs: 'Ezekiel 40:47; 43:5', walk: 'inner-court',
    measures: [['arak (length) · rachab (breadth)', '100 × 100, foursquare', '40:47'], ['the mazabach (altar)', 'panayam (before) the bayath (house)', '40:47'], ['above the outer court', '8 steps (40:31, 34, 37)', '']],
    note: '"{{Ezekiel 40:47 | He madad … bayath}}" — the square before the house, eight steps above the outer court, with the altar in the midst of it; here the spirit set him down and "{{Ezekiel 43:5 | the kabawad … bayath}}".',
    elsewhere: { ref: '1 Kings 6:36; 2 Chronicles 4:9; Joel 2:17', note: 'Shalamah\'s inner court of three courses of hewn stone and a course of cedar beams; the priests weep between the porch and the altar.' },
    assumed: 'A low parapet (idealized) closes the court where no gate stands; its level is eight half-cubit steps above the outer court.',
    parts: innerCourt(),
  },
  {
    id: 'mazabach', order: 11, group: 'courts', material: 'stone',
    tag: 'mazabach (altar)', title: 'The mazabach (altar) — the chayaq (base), the ledges, the Har\'Al with its qaran (horns)',
    words: ['mazabach', 'chayaq', 'haral', 'araayal', 'qaran', 'gabawal', 'amah', 'tapach'], keys: ['mazabach', 'chayaq', 'ledge', 'haral', 'araayal', 'qaran', 'horns', 'hearth'],
    on: V('26:43:13-27'),
    refs: 'Ezekiel 43:13–27', walk: 'altar',
    measures: [['the amah (cubit)', 'a amah (cubit) and a tapach (handbreadth)', '43:13'], ['chayaq (base)', '1 amah, a border of a zarath (span) about its edge', '43:13'], ['lower ledge', '2 amah high, 1 in', '43:14'], ['greater ledge', '4 amah high, 1 in; 14 × 14', '43:14, 17'], ['Har\'Al', '4 amah; the araayal (hearth) 12 × 12, four qaran (horns)', '43:15–16'], ['mailah (steps)', 'toward the qadayam (east)', '43:17']],
    note: '"{{Ezekiel 43:13 | These are … mazabach}}" — the altar rises in three ledges, each a cubit narrower than the one below, to the Har\'Al ("mountain of Al"), the hearth twelve square with a horn at each corner; its steps face the east, so the priest climbs with his back to the sunrise. Seven days it is cleansed (43:25–26); on the eighth the offerings begin (43:27).',
    elsewhere: { ref: 'Exodus 27:1–8; 2 Chronicles 4:1; Exodus 20:26; Ezekiel 43:18–27', note: 'The mashakan (tabernacle)\'s altar of five square and three high with its horns; Shalamah\'s of twenty square and ten high; "neither shall you go up by steps to my altar" (Exodus 20:26) — here the text itself gives the steps.' },
    assumed: 'The hearth\'s twelve and the ledge\'s fourteen are the Hebrew\'s (shathayam-isharah, arabai-isharah); the lower ledge is drawn sixteen square; the flight eight wide with risers of half a cubit, the ledges running on beside it.',
    parts: altar(),
  },
  {
    id: 'awalam', order: 12, group: 'house', material: 'stone',
    tag: 'awalam (porch)', title: 'The awalam (porch) of the bayath (house), its posts and its imawadayam (pillars)',
    words: ['awalam', 'ayal', 'mailah'], keys: ['awalam', 'imawadayam', 'pillars', 'mailahawath'],
    on: V('26:40:48-49', '26:41:25-26'),
    refs: 'Ezekiel 40:48–49; 41:25–26', walk: 'porch',
    measures: [['each ayal (post)', '5 amah, this side and that', '40:48'], ['the shair (gate)', '3 amah this side, 3 that', '40:48'], ['arak (length)', '20 amah', '40:49'], ['rachab (breadth)', '11 amah', '40:49'], ['imawadayam (pillars)', 'by the posts, one on this side and another on that', '40:49'], ['threshold', 'of itz (wood) on the face of the porch', '41:25'], ['on its sides', 'closed windows and thamar (palm) trees', '41:26']],
    note: '"{{Ezekiel 40:49 | The arak … side}}" — twenty across like the house, eleven out from it, with steps up to it and a pillar beside each post, as Yakayan (Jachin) and Baiz (Boaz) stood before Shalamah\'s.',
    elsewhere: { ref: '1 Kings 6:3; 7:21; 2 Chronicles 3:4, 15–17; Joel 2:17', note: 'Shalamah\'s porch of twenty by ten, a hundred and twenty high; his two pillars of brass named at the porch.' },
    assumed: 'The height (as the house\'s), the ten steps of 40:49 (the Greek gives ten; the Hebrew only "steps"), the pillars\' form; the raised base of 41:8 carries the whole house a full reed above the inner court.',
    parts: porch(),
  },
  {
    id: 'hayakal', order: 13, group: 'house', material: 'stone',
    tag: 'hayakal (temple)', title: 'The hayakal (temple), arabaiyam (forty) by isharayam (twenty)',
    words: ['hayakal', 'ayal', 'qayar'], keys: ['hayakal', 'ahal', 'kathapawath'],
    on: V('26:41:1-2', '26:41:5', '26:41:16-17', '26:41:21'),
    refs: 'Ezekiel 41:1–2, 5; 41:16–17, 21', walk: 'hayakal',
    measures: [['ayalayam (posts)', '6 amah broad on the one side and 6 on the other — the breadth of the ahal (tent)', '41:1'], ['pathach (entrance)', '10 amah; its sides 5 and 5', '41:2'], ['arak (length) · rachab (breadth)', '40 × 20', '41:2'], ['qayar (wall) of the house', '6 amah', '41:5'], ['mazawazah (door) posts', 'rabai (foursquare)', '41:21']],
    note: '"{{Ezekiel 41:1 | He bawaa … ahal}}" — the front wall six thick, the door ten wide with five of wall either side of it, and within, forty by twenty, the same hall Shalamah built (1 Kings 6:17); the walls ceiled with wood from the ground to the windows (41:16), and every wall carved (41:18–20).',
    elsewhere: { ref: '1 Kings 6:2, 17; Exodus 26:15–30; Revelation 11:1–2', note: 'The house of 1 Kings, sixty long, twenty broad — its hayakal forty; the mashakan (tabernacle) of boards, whose breadth the posts here recall ("the breadth of the tent", 41:1); Yawachanan (John) given a reed to measure the temple.' },
    assumed: 'The height (30, as 1 Kings 6:2) is not given.',
    parts: hayakal(),
  },
  {
    id: 'qadash', order: 14, group: 'house', material: 'stone',
    tag: 'qadash (holy) · most', title: 'The most qadash (holy) place, isharayam (twenty) square',
    words: ['qadash', 'ayal', 'hayakal'], keys: ['qadash', 'inward', 'holy'],
    on: V('26:41:3-4', '26:41:21', '26:41:23'),
    refs: 'Ezekiel 41:3–4, 21, 23', walk: 'qadash',
    measures: [['each ayal (post) of the entrance', '2 amah', '41:3'], ['pathach (entrance)', '6 amah; its breadth 7', '41:3'], ['arak (length) · rachab (breadth)', '20 × 20, before the hayakal (temple)', '41:4']],
    note: '"{{Ezekiel 41:4 | He madad … place}}" — the man goes inward alone to measure it, and tells him what it is. Twenty square, as the dabayar (oracle) of Shalamah; no ark is named in it.',
    elsewhere: { ref: '1 Kings 6:16, 19–20; Exodus 26:33–34; Hebrews 9:3–5; Ezekiel 43:7', note: 'The dabayar (oracle) twenty by twenty by twenty; the holiest of all behind the veil; "the place of my throne and the place of the soles of my feet" (43:7).' },
    assumed: 'Its height, and that it is empty (the text names nothing within it).',
    parts: holy(),
  },
  {
    id: 'tzalai', order: 15, group: 'house', material: 'stone',
    tag: 'tzalai (side) rooms', title: 'The tzalai (side) rooms, shalawash (three) stories, shalawashayam (thirty) in order',
    words: ['tzalai', 'qayar', 'bayath'], keys: ['tzalai', 'stories', 'thachathawan', 'thayakawan', 'broader', 'base', 'mayasadahawath', 'yanach'],
    on: V('26:41:5-11', '26:41:26'),
    refs: 'Ezekiel 41:5–11, 26', walk: 'tzalai',
    measures: [['rachab (breadth) of every room', '4 amah, all around', '41:5'], ['stories', '3, thirty in order', '41:6'], ['broader as they go up', 'for the winding about of the house', '41:7'], ['raised base', 'a full qanah (reed) of 6 great amah', '41:8'], ['their outer qayar (wall)', '5 amah', '41:9'], ['between the rooms', '20 amah around the house', '41:10'], ['pathach (doors)', 'one toward the north, one toward the south; the place left 5 amah', '41:11']],
    note: '"{{Ezekiel 41:6 | The tzalai … bayath}}" — the rooms rest on ledges of the house wall and never cut into it, exactly as in 1 Kings 6:6; their outer wall five thick, and beyond it twenty cubits of open ground before the priests\' rooms.',
    elsewhere: { ref: '1 Kings 6:5–10; 1 Chronicles 28:11–12', note: 'Shalamah\'s three stories of five, six and seven broad; the pattern Dawad (David) gave of the treasuries and upper rooms.' },
    assumed: 'Each storey eight high; the partitions between the ten rooms of a storey; the doors are drawn on the ground storey.',
    parts: sideRooms(),
  },
  {
    id: 'karawab', order: 16, group: 'inside', material: 'cedar',
    tag: 'karawab (cherubim) · thamar (palm)', title: 'Karawab (cherubim) and thamar (palm) trees on every wall, itz (wood) ceilings',
    words: ['karawab', 'thamar', 'itz', 'chalawan'], keys: ['karawab', 'thamar', 'panayam', 'kapayar', 'ceilings', 'kasah'],
    on: V('26:41:16-20', '26:41:25'),
    refs: 'Ezekiel 41:16–20, 25', walk: 'karawab',
    measures: [['ceilings', 'of itz (wood) all around, from the ground to the windows', '41:16'], ['the pattern', 'a thamar (palm) tree between karawab (cherub) and karawab (cherub)', '41:18'], ['each karawab (cherub)', 'two faces: a adam (man)\'s toward the palm on one side, a young kapayar (lion)\'s toward the palm on the other', '41:18–19'], ['from the ground to above the door', 'karawab (cherubim) and thamar (palm) trees — thus the wall of the hayakal (temple)', '41:20']],
    note: '"{{Ezekiel 41:18 | It was ishah … panayam}}" — the carving of 1 Kings 6:29 seen again, and here the cherubim\'s faces are told: a man\'s and a lion\'s, each turned to the palm beside it. The model lines the hall and the sanctuary with the pattern.',
    elsewhere: { ref: '1 Kings 6:29, 32, 35; Ezekiel 1:10; 10:14; Revelation 4:7', note: 'The four faces of the chayawath (living creatures) — a man, a lion, an ox, an eagle — of which the carved walls keep two.' },
    assumed: 'The carving is drawn as a repeating panel; the wood lining\'s thickness.',
    parts: [
      box((HAY_X0 + HAY_X1) / 2, LEVEL.house, HAY.inZ - 0.25, HAY.len, HAY.h, 0.5, { role: 'lining', carved: true }), box((HAY_X0 + HAY_X1) / 2, LEVEL.house, -HAY.inZ + 0.25, HAY.len, HAY.h, 0.5, { role: 'lining', carved: true }),
      box(HAY_X1 - 0.25, LEVEL.house, 0, 0.5, HAY.h, 2 * HAY.inZ, { role: 'lining', carved: true, doorway: { w: 10, h: 14 } }),
      box((HOLY_X0 + HOLY_X1) / 2, LEVEL.house, HAY.inZ - 0.25, HAY.holy, HAY.h, 0.5, { role: 'lining', carved: true }), box((HOLY_X0 + HOLY_X1) / 2, LEVEL.house, -HAY.inZ + 0.25, HAY.holy, HAY.h, 0.5, { role: 'lining', carved: true }),
      box(HOLY_X0 + 0.25, LEVEL.house, 0, 0.5, HAY.h, 2 * HAY.inZ, { role: 'lining', carved: true }),
      box((HAY_X0 + HAY_X1) / 2, LEVEL.house + HAY.h - 0.3, 0, HAY.len, 0.3, 2 * HAY.inZ, { role: 'ceiling', mat: 'fir' }), box((HOLY_X0 + HOLY_X1) / 2, LEVEL.house + HAY.h - 0.3, 0, HAY.holy, 0.3, 2 * HAY.inZ, { role: 'ceiling', mat: 'fir' }),
    ],
  },
  {
    id: 'wood-altar', order: 17, group: 'inside', material: 'cedar',
    tag: 'mazabach (altar) of itz (wood)', title: 'The mazabach (altar) of itz (wood) — "the shalachan (table) that is before Yahawah"',
    words: ['mazabach', 'itz', 'shalachan'], keys: ['maqatzawai', 'corners'],
    on: V('26:41:22'),
    refs: 'Ezekiel 41:22', walk: 'wood-altar',
    measures: [['gabah (height)', '3 amah', '41:22'], ['arak (length)', '2 amah', '41:22'], ['its corners, its length, its walls', 'of itz (wood)', '41:22']],
    note: '"{{Ezekiel 41:22 | The mazabach … Yahawah}}" — where Shalamah\'s hall had the gold altar and the tables of the showbread, here stands one thing of wood before the sanctuary, and the man calls it a table.',
    elsewhere: { ref: 'Exodus 25:23–30; 30:1–6; 1 Kings 6:20–22; 7:48; Malachi 1:7', note: 'The table of showbread of acacia wood overlaid with gold, two long, one broad, a cubit and a half high; the altar of incense before the veil; "the table of Yahawah".' },
    assumed: 'Its breadth (2) and its place, before the entrance of the sanctuary in the middle of the hall.',
    parts: [box(HAY_X0 + 6, LEVEL.house, 0, 2, 3, 2, { role: 'altar', horns: true }), box(HAY_X0 + 6, LEVEL.house + 3, 0, 2.3, 0.15, 2.3, { role: 'altar' })],
  },
  {
    id: 'doors', order: 18, group: 'inside', material: 'cedar',
    tag: 'dalathawath (doors)', title: 'Shanayam (two) dalathawath (doors), each of shanayam (two) turning leaves',
    words: ['dalath', 'karawab', 'thamar'], keys: ['dalathawath', 'dalath', 'leaves', 'mawasabah', 'turning', 'pathach'],
    on: V('26:41:23-25'),
    refs: 'Ezekiel 41:23–25', walk: 'doors',
    measures: [['the hayakal (temple) and the qadash (holy) place', 'two doors', '41:23'], ['each door', 'two leaves, two turning leaves', '41:24'], ['on them', 'karawab (cherubim) and thamar (palm) trees, as on the walls', '41:25']],
    note: '"{{Ezekiel 41:24 | The dalathawath … other}}" — folding doors, as Shalamah\'s of fir (1 Kings 6:34): tap them on foot to open and go in.',
    elsewhere: { ref: '1 Kings 6:31–35; Psalm 24:7–9; Ezekiel 44:1–2', note: 'The doors of olive and fir carved with cherubim and palms and overlaid with gold; "lift up your heads, O you gates".' },
    assumed: 'Their height and thickness; the wood.',
    parts: [{ kind: 'doors', x: PORCH_X0, y: LEVEL.house, z: 0, w: 10, h: 14, t: 0.4, hinge: 'x', open: 'hayakal', fold: true, carved: true }],
  },
  {
    id: 'holy-doors', order: 19, group: 'inside', material: 'cedar',
    tag: 'dalathawath (doors) · qadash (holy)', title: 'The dalathawath (doors) of the qadash (holy) place, two turning leaves',
    words: ['dalath', 'qadash', 'karawab', 'thamar'], keys: [],
    on: V('26:41:23-25', '26:41:3'),
    refs: 'Ezekiel 41:3, 23–25', walk: 'doors',
    measures: [['the pathach (entrance)', '6 amah; its posts 2', '41:3'], ['each door', 'two leaves, two turning leaves', '41:24'], ['on them', 'karawab (cherubim) and thamar (palm) trees', '41:25']],
    note: 'The second of the two doors of 41:23: in the posts of two between the hall and the most holy place, six wide (41:3). Tap it on foot to open and go in.',
    elsewhere: { ref: '1 Kings 6:31–32; 2 Chronicles 3:14; Hebrews 9:3', note: 'Shalamah\'s doors of olive for the oracle, a fifth part of the wall; the veil before them; "after the second veil, the tabernacle which is called the holiest of all".' },
    assumed: 'Their height and thickness; the wood.',
    parts: [{ kind: 'doors', x: HAY_X0, y: LEVEL.house, z: 0, w: 6, h: 10, t: 0.3, hinge: 'x', open: 'oracle', fold: true, carved: true }],
  },
  {
    id: 'binyan', order: 20, group: 'house', material: 'stone',
    tag: 'banayan (building) · yam (west)', title: 'The banayan (building) toward the yam (west), before the gazarah (separate) place',
    words: ['banayan', 'gazarah', 'qayar', 'athawaq'], keys: ['banayan', 'banayah', 'gazarah', 'separate', 'athawaq', 'athawaqayam', 'galleries', 'yam'],
    on: V('26:41:12-15'),
    refs: 'Ezekiel 41:12–15', walk: 'binyan',
    measures: [['rachab (breadth)', '70 amah', '41:12'], ['its qayar (wall)', '5 amah thick all around', '41:12'], ['arak (length)', '90 amah', '41:12'], ['the house', '100 long; the separate place and the building with its walls, 100', '41:13'], ['the face of the house and the separate place', '100 broad, toward the east', '41:14'], ['the building before the separate place, with its galleries', '100', '41:15']],
    note: '"{{Ezekiel 41:12 | The banayan … amahawath}}" — behind the house, across the separate place, a great building eighty by a hundred outside its walls, its purpose never told; galleries on three stories (41:15–16).',
    elsewhere: { ref: '1 Chronicles 26:18; 2 Kings 23:11; Ezekiel 42:1, 10', note: 'The Parbar westward with its gates and its courses of keepers (1 Chronicles 26:18); the priests\' rooms stand over against the separate place and this building.' },
    assumed: 'Its height (24) and its galleries as floors round an open well with stairs; its back wall is the great wall\'s west run, so the separate place is twenty (41:13–14). Its use is not told: the model furnishes its ground storey as the house of the keepers of the gates (44:11, 14) — the Parbar westward with its courses of keepers (1 Chronicles 26:18) — quarters with a door on the hall, a bed and a seat, stores with jars, a table and lamps in the hall; all of it hatched as the model\'s own.',
    parts: binyan(),
  },
  {
    id: 'chambers-north', order: 21, group: 'house', material: 'plaster',
    tag: 'kahanayam (priests)\' rooms · north', title: 'The rooms of the kahanayam (priests) toward the north — a hundred long, fifty broad, three stories',
    words: ['lashakah', 'mahalak', 'athawaq', 'gadar', 'kahanayam'], keys: ['rooms', 'mahalak', 'walk', 'gadar', 'straitened', 'atzal', 'uppermost', 'ilayawan', 'mabawaa', 'entry', 'bagadayam', 'garments'],
    on: V('26:42:1-9', '26:42:13-14'),
    refs: 'Ezekiel 42:1–9, 13–14', walk: 'chambers',
    measures: [['arak (length)', '100 amah, before which the north door', '42:2'], ['rachab (breadth)', '50 amah', '42:2'], ['athawaq (gallery) against gallery', 'in the third story', '42:3'], ['mahalak (walk)', '10 amah broad inward; a way of 1', '42:4'], ['stories', '3, the uppermost straitened, without pillars', '42:5–6'], ['the gadar (wall) toward the outer court', '50 amah', '42:7'], ['entry', 'on the east, from the outer court', '42:9']],
    note: '"{{Ezekiel 42:13 | Then he amar … qadawash}}" — the holy rooms where the priests who come near eat the most holy things and lay down the garments they minister in (42:14); over against the separate place and the building, three stories stepping back as they rise.',
    elsewhere: { ref: 'Ezekiel 44:19; 46:19–20; Leviticus 6:16, 26; 1 Kings 6:5', note: 'They shall put off their garments in the holy rooms (44:19); the priests\' boiling place at their west end (46:19–20); the most holy things eaten in the holy place.' },
    assumed: 'The plan is a reconstruction of 42:1–9: a row of eight rooms a hundred long before the temple and a row of four toward the outer court, their doors on the walk of ten between them, the wall of fifty before the rest of the front, the entry from the outer court up eight steps at the east end; a storey of eight, and the upper two stories solid, stepping back from the walk.',
    parts: chambers(-1),
  },
  {
    id: 'chambers-south', order: 22, group: 'house', material: 'plaster',
    tag: 'kahanayam (priests)\' rooms · south', title: 'The rooms toward the south, after the pattern of the north',
    words: ['lashakah', 'mahalak', 'gadar'], keys: [],
    on: V('26:42:10-14'),
    refs: 'Ezekiel 42:10–14', walk: 'chambers',
    measures: [['in the thickness of the wall of the court toward the east', 'rooms, before the separate place and the building', '42:10'], ['their way', 'like the appearance of the rooms toward the north — their length, their breadth, their exits, their doors', '42:11'], ['a door', 'at the head of the way, directly before the wall toward the east', '42:12']],
    note: '"{{Ezekiel 42:11 | The darak … pathach}}" — the south rooms are the north rooms over again, so the model mirrors them.',
    elsewhere: { ref: 'Ezekiel 42:13–14; 46:19', note: 'Both are the holy rooms of 42:13.' },
    assumed: 'As the north.',
    parts: chambers(1),
  },
];

export function pieceById(id) { return PIECES.find((p) => p.id === id) || null; }
export const GROUPS = { gates: 'The shairayam (gates)', courts: 'The chatzarawath (courts)', house: 'The bayath (house)', inside: 'Within' };

// ── The passages the model is drawn from ─────────────────────────────────────
export const PASSAGES = [
  { bookId: 26, book: 'Ezekiel', chapter: 40, from: 1, to: 49, label: 'Ezekiel 40' },
  { bookId: 26, book: 'Ezekiel', chapter: 41, from: 1, to: 26, label: 'Ezekiel 41' },
  { bookId: 26, book: 'Ezekiel', chapter: 42, from: 1, to: 20, label: 'Ezekiel 42' },
  { bookId: 26, book: 'Ezekiel', chapter: 43, from: 1, to: 27, label: 'Ezekiel 43' },
];
export const ALL_REFS = 'Ezekiel 40:1–43:27';
export const passagesFor = () => PASSAGES;
export const refsFor = () => ALL_REFS;

/** Which piece a "translit (gloss)" word in the passage belongs to: the words that name many things (shair, chatzar, ayal, awalam,
 *  mazabach, qayar) are settled by WHERE they stand — chapter and verse — in the RULES first; then a piece's own keys. */
const R = (chapter, verses, words, piece) => ({ chapter, verses, words, piece });
const vs = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const GATE_WORDS = ['shair', 'shairayam', 'sap', 'thaa', 'lodge', 'lodges', 'ayal', 'ayalam', 'ayalayam', 'awalam', 'arches', 'mailah', 'mailahawath', 'steps', 'chalawan', 'chalawanawath', 'chalawanayam', 'thamar', 'pathach', 'gabawal', 'gag', 'qanah', 'madad', 'madah', 'madahawath'];
const RULES = [
  R(40, vs(6, 16), GATE_WORDS, 'gate-east'), R(40, [43], ['kawan'], 'tables'),
  R(40, vs(17, 19), ['chatzar', 'ratzapah', 'rooms', 'shairayam', 'shair', 'madad', 'rachab'], 'outer-court'),
  R(40, vs(20, 23), GATE_WORDS, 'gate-north'), R(40, vs(24, 27), GATE_WORDS, 'gate-south'),
  R(40, vs(28, 31), [...GATE_WORDS, 'chatzar'], 'inner-south'), R(40, vs(32, 34), [...GATE_WORDS, 'chatzar'], 'inner-east'), R(40, vs(35, 38), [...GATE_WORDS, 'chatzar', 'room', 'dawach'], 'inner-north'),
  R(40, vs(39, 43), ['shalachanawath', 'shalachan', 'tables', 'aban', 'shachat', 'shapathayam', 'kalayam', 'bashar'], 'tables'), R(40, vs(39, 41), ['awalam', 'shair'], 'inner-north'),
  R(40, vs(44, 46), ['rooms', 'room', 'singers', 'kahanayam', 'mashamarath', 'tzadawaq', 'laway', 'chatzar'], 'singers'), R(40, [44], ['shair'], 'inner-north'),
  R(40, [47], ['chatzar', 'madad', 'rabai', 'maah'], 'inner-court'), R(40, [47], ['mazabach'], 'mazabach'),
  R(40, vs(48, 49), ['awalam', 'ayal', 'ayalayam', 'shair', 'mailahawath', 'imawadayam', 'madad'], 'awalam'),
  R(41, vs(1, 2), ['hayakal', 'ayalayam', 'ahal', 'pathach', 'kathapawath', 'madad'], 'hayakal'), R(41, vs(3, 4), ['ayal', 'pathach', 'hayakal', 'qadash', 'madad'], 'qadash'),
  R(41, vs(5, 11), ['qayar', 'tzalai', 'stories', 'bayath', 'base', 'mayasadahawath', 'qanah', 'pathach', 'yanach', 'maqawam'], 'tzalai'),
  R(41, vs(12, 15), ['banayan', 'banayah', 'gazarah', 'qayar', 'bayath', 'athawaq', 'porches', 'hayakal', 'madad'], 'binyan'),
  R(41, vs(16, 20), ['sapayam', 'sap', 'chalawanayam', 'athawaqayam', 'itz', 'ceilings', 'pathach', 'qayar', 'karawab', 'thamar', 'panayam', 'adam', 'kapayar', 'hayakal', 'bayath'], 'karawab'),
  R(41, [21], ['hayakal', 'mazawazah', 'qadash'], 'hayakal'), R(41, [22], ['mazabach', 'itz', 'maqatzawai', 'qayar', 'shalachan'], 'wood-altar'),
  R(41, vs(23, 24), ['hayakal', 'qadash', 'dalathawath', 'dalath', 'leaves', 'mawasabah'], 'doors'), R(41, [25], ['dalathawath', 'hayakal', 'karawab', 'thamar', 'qayarawath'], 'doors'), R(41, [25], ['threshold', 'itz', 'awalam'], 'awalam'), R(41, [26], ['chalawanayam', 'thamar', 'awalam', 'tzalai'], 'awalam'),
  R(42, vs(1, 9), ['chatzar', 'room', 'rooms', 'gazarah', 'banayan', 'pathach', 'athawaq', 'athawaqayam', 'ratzapah', 'mahalak', 'darak', 'ilayawan', 'stories', 'imawadayam', 'atzal', 'gadar', 'hayakal', 'mabawaa'], 'chambers-north'),
  R(42, vs(10, 12), ['gadar', 'chatzar', 'gazarah', 'banayan', 'rooms', 'darak', 'lashakah', 'pathach', 'pathachay', 'gadarah'], 'chambers-south'),
  R(42, vs(13, 14), ['rooms', 'kahanayam', 'qadash', 'gazarah', 'chatzar', 'bagadayam', 'maqawam'], 'chambers-north'),
  R(42, vs(15, 20), ['bayath', 'shair', 'qanah', 'qanahayam', 'madad', 'madah', 'chawamah', 'rawach', 'rawachawath', 'arak', 'rachab', 'badal', 'qadash', 'chal'], 'chawamah'),
  R(43, vs(1, 4), ['shair', 'qadayam', 'kabawad', 'bayath', 'darak'], 'gate-east'), R(43, [5], ['chatzar', 'kabawad', 'bayath'], 'inner-court'),
  R(43, vs(13, 27), ['mazabach', 'amah', 'amahawath', 'tapach', 'chayaq', 'gabawal', 'shapah', 'zarath', 'ledge', 'haral', 'araayal', 'qaran', 'mailah', 'qadayam', 'chataa', 'kapar'], 'mazabach'),
];
const KEY_INDEX = PIECES.flatMap((p) => p.keys.map((k) => [k, p.id]));
export function pieceForWord(word, book, chapter, verse) {
  if (book !== 26) return null;
  const w = word.toLowerCase();
  for (const r of RULES) if (r.chapter === chapter && r.verses.includes(verse) && r.words.some((k) => w === k || w.startsWith(k))) return r.piece;
  for (const [k, id] of KEY_INDEX) if (w === k) return id;
  for (const [k, id] of KEY_INDEX) if (k.length > 4 && w.startsWith(k)) return id;
  return null;
}

// ── Timelines ────────────────────────────────────────────────────────────────
// WALK — the way the man with the reed took him, in the text's own order.
export const WALK_PHASES = [
  { from: 0,   key: 'mountain',    caption: '{{Ezekiel 40:2 | In the maraahawath … nagab}}.', ref: 'Ezekiel 40:2' },
  { from: 4,   key: 'man',         caption: '{{Ezekiel 40:3 | He bawaa … shair}}.', ref: 'Ezekiel 40:3' },
  { from: 7,   key: 'wall',        caption: '{{Ezekiel 40:5 | Behold, a chawamah … qanah}}.', ref: 'Ezekiel 40:5' },
  { from: 10,  key: 'gate',        caption: '{{Ezekiel 40:6 | Then bawaa … rachab}}; {{Ezekiel 40:7 | Every lodge … amahawath}}.', ref: 'Ezekiel 40:6–7' },
  { from: 14,  key: 'lodges',      caption: '{{Ezekiel 40:10}} {{Ezekiel 40:12 | And a gabawal … side}}.', ref: 'Ezekiel 40:10, 12' },
  { from: 18,  key: 'gate-porch',  caption: '{{Ezekiel 40:9}} {{Ezekiel 40:14}}', ref: 'Ezekiel 40:9, 14' },
  { from: 22,  key: 'court',       caption: '{{Ezekiel 40:17}} {{Ezekiel 40:19 | Then he madad … tzapawan}}.', ref: 'Ezekiel 40:17, 19' },
  { from: 26,  key: 'north',       caption: '{{Ezekiel 40:20}} {{Ezekiel 40:22 | and they ilah … them}}.', ref: 'Ezekiel 40:20, 22' },
  { from: 29,  key: 'south',       caption: '{{Ezekiel 40:24}} {{Ezekiel 40:27}}', ref: 'Ezekiel 40:24, 27' },
  { from: 32,  key: 'inner-south', caption: '{{Ezekiel 40:28}} {{Ezekiel 40:31}}', ref: 'Ezekiel 40:28, 31' },
  { from: 35,  key: 'inner-east',  caption: '{{Ezekiel 40:32}} {{Ezekiel 40:34}}', ref: 'Ezekiel 40:32, 34' },
  { from: 38,  key: 'inner-north', caption: '{{Ezekiel 40:35}} {{Ezekiel 40:38}}', ref: 'Ezekiel 40:35, 38' },
  { from: 41,  key: 'tables',      caption: '{{Ezekiel 40:39}} {{Ezekiel 40:41}}', ref: 'Ezekiel 40:39, 41' },
  { from: 44,  key: 'singers',     caption: '{{Ezekiel 40:44 | Chawatz … darawam}}; {{Ezekiel 40:46 | And the room … mazabach}}.', ref: 'Ezekiel 40:44, 46' },
  { from: 47,  key: 'inner-court', caption: '{{Ezekiel 40:47}}', ref: 'Ezekiel 40:47' },
  { from: 50,  key: 'porch',       caption: '{{Ezekiel 40:48 | Then he bawaa … side}}. {{Ezekiel 40:49 | The arak … side}}.', ref: 'Ezekiel 40:48–49' },
  { from: 54,  key: 'hayakal',     caption: '{{Ezekiel 41:1 | He bawaa … ahal}}. {{Ezekiel 41:2 | The rachab … amahawath}}.', ref: 'Ezekiel 41:1–2' },
  { from: 58,  key: 'karawab',     caption: '{{Ezekiel 41:18}} {{Ezekiel 41:19 | So that … side}}.', ref: 'Ezekiel 41:18–19' },
  { from: 62,  key: 'wood-altar',  caption: '{{Ezekiel 41:22}}', ref: 'Ezekiel 41:22' },
  { from: 65,  key: 'doors',       caption: '{{Ezekiel 41:23}} {{Ezekiel 41:24}}', ref: 'Ezekiel 41:23–24' },
  { from: 68,  key: 'qadash',      caption: '{{Ezekiel 41:3}} {{Ezekiel 41:4}}', ref: 'Ezekiel 41:3–4' },
  { from: 72,  key: 'tzalai',      caption: '{{Ezekiel 41:5}} {{Ezekiel 41:6 | The tzalai … paim}}; {{Ezekiel 41:8}}', ref: 'Ezekiel 41:5–6, 8' },
  { from: 76,  key: 'binyan',      caption: '{{Ezekiel 41:12}} {{Ezekiel 41:13}}', ref: 'Ezekiel 41:12–13' },
  { from: 80,  key: 'chambers',    caption: '{{Ezekiel 42:1}} {{Ezekiel 42:2}} {{Ezekiel 42:13 | they are … things}}.', ref: 'Ezekiel 42:1–2, 13' },
  { from: 84,  key: 'square',      caption: '{{Ezekiel 42:15}} {{Ezekiel 42:20}}', ref: 'Ezekiel 42:15, 20' },
  { from: 88,  key: 'kabawad',     caption: '{{Ezekiel 43:2}} {{Ezekiel 43:4}} {{Ezekiel 43:5 | the kabawad … bayath}}.', ref: 'Ezekiel 43:2–5' },
  { from: 93,  key: 'altar',       caption: '{{Ezekiel 43:13 | These are … mazabach}}. {{Ezekiel 43:15}} {{Ezekiel 43:17 | and its mailah … qadayam}}.', ref: 'Ezekiel 43:13–17' },
  { from: 97,  key: 'law',         caption: '{{Ezekiel 43:12}}', ref: 'Ezekiel 43:12' },
];
export const WALK_DURATION = 100;
const E = (y) => y;   // eye heights below are absolute
export const WALK_CAMERA = [
  [0,    [640, 330, 520],   [0, 20, 0]],                       // the frame of a city on the mountain, from the south-east
  [4,    [300, 24, 60],     [252, E(6), 0]],                    // the man in the east gate
  [7,    [330, 60, 240],    [0, 6, 0]],                         // along the wall
  [10,   [268, E(7), 0],    [230, E(7), 0]],                    // into the east gate
  [14,   [236, E(8), -1],   [220, E(6), -9]],                   // the lodges
  [18,   [214, E(9), 0],    [196, E(14), 0]],                   // the porch and its posts
  [22,   [190, 40, 120],    [150, 6, 0]],                       // the outer court, the pavement and its rooms
  [26,   [40, 60, -150],    [0, 6, -230]],                      // the north gate
  [29,   [-40, 60, 150],    [0, 6, 230]],                       // the south gate
  [32,   [30, 30, 150],     [0, 10, 80]],                       // the inner south gate
  [35,   [150, 26, 40],     [80, 10, 0]],                       // the inner east gate
  [38,   [30, 30, -150],    [0, 10, -80]],                      // the inner north gate
  [41,   [24, E(9), -122],  [0, 6, -100]],                      // the tables
  [44,   [70, 24, -20],     [30, 10, -30]],                     // the singers' rooms
  [47,   [84, 40, 58],      [0, 12, 0]],                        // the inner court, the altar in the midst
  [50,   [-20, E(22), 30],  [-50, 20, 0]],                      // the porch of the house
  [54,   [-58, E(18), 0],   [-90, 18, 0]],                      // into the hall
  [58,   [-80, E(17), 4],   [-90, 22, 10]],                     // the carved wall
  [62,   [-93, E(17), 3],   [-101, 15, 0]],                     // the wooden altar
  [65,   [-98, E(17), 2],   [-108, 17, 0]],                     // the doors of the sanctuary
  [68,   [-112, E(17), 1],  [-119, 17, 0]],                     // the most holy place
  [72,   [-30, 40, 90],     [-100, 20, 20]],                    // the side rooms from the south
  [76,   [-120, 60, -140],  [-210, 12, 0]],                     // the building on the west
  [80,   [-30, 50, -170],   [-100, 12, -80]],                   // the priests' rooms
  [84,   [700, 480, 560],   [0, 0, 0]],                         // the whole square
  [88,   [330, 20, 0],      [250, 8, 0]],                       // the glory from the east
  [91,   [60, 30, 0],       [-50, 20, 0]],                      // … into the house
  [93,   [34, 24, 24],      [0, 13, 0]],                        // the altar
  [97,   [80, 46, 60],      [0, 12, 0]],
  [100,  [520, 300, 420],   [0, 10, 0]],
];

// ROAM — no story: the finished house, and the viewer walks where they will.
export const ROAM_EYE = 3.4;
export const ROAM_START = { pos: [285, LEVEL.out + ROAM_EYE, 0], look: [200, LEVEL.out + ROAM_EYE, 0] };   // outside the east gate, facing the house
export const ROAM_PHASES = [{ from: 0, key: 'roam', caption: 'Walk where you will — up the seven steps and through the shairayam (gates), across the chatzarawath (courts), up to the awalam (porch) and in. Tap a part for its details; tap a door or a gate again to open or shut it.', ref: '' }];
export const ROAM_ENTER = {
  doors: { pos: [HAY_X1 + 3, LEVEL.house + ROAM_EYE, 0], look: [HAY_X0, LEVEL.house + ROAM_EYE, 0], open: 'hayakal' },
  'holy-doors': { pos: [HOLY_X1 - 3, LEVEL.house + ROAM_EYE, 0], look: [HOLY_X0, LEVEL.house + ROAM_EYE, 0], open: 'dabayar' },
};

export const MODES = {
  walk: { label: 'Walk', phases: WALK_PHASES, duration: WALK_DURATION, camera: WALK_CAMERA, xray: [[54, 72]] },
  roam: { label: 'Roam', phases: ROAM_PHASES, duration: 1, camera: [[0, ROAM_START.pos, ROAM_START.look]], xray: [], free: true },
};
const TL = timelineFor(MODES);
export const { phaseAt, xrayAt, cameraAt } = TL;
export function progressAt() { return 1; }   // no Build story: the whole house stands
/** How far the doors stand open at t (0 shut … 1 open): the hall's doors as the walk reaches them, the sanctuary's after. */
export function openAt(mode, which, t) {
  if (mode !== 'walk') return 0;
  if (which === 'hayakal') return smooth((t - 53) / 1.4);
  return smooth((t - 66.5) / 1.4);
}
const MARK_LABELS = { walk: { wall: 'chawamah', gate: 'shair', court: 'chatzar', 'inner-south': 'inner', tables: 'shalachanawath', 'inner-court': 'chatzar', hayakal: 'hayakal', qadash: 'qadash', binyan: 'banayan', chambers: 'kahanayam', square: '500', kabawad: 'kabawad', altar: 'mazabach' } };
export const marksFor = (mode) => TL.marksFor(mode, MARK_LABELS);
/** The pieces the chips row shows, in the way's order (east gate → sanctuary). */
export const CHIP_ORDER = ['chawamah', 'gate-east', 'outer-court', 'gate-north', 'gate-south', 'inner-south', 'inner-east', 'inner-north', 'tables', 'singers', 'inner-court', 'mazabach', 'awalam', 'hayakal', 'karawab', 'wood-altar', 'doors', 'holy-doors', 'qadash', 'tzalai', 'binyan', 'chambers-north', 'chambers-south'];
/** Where the eye goes when a piece is chosen (the focus target and a fitting distance), in cubits. */
export function focusFor(id) {
  const F = {
    chawamah: [[0, 4, 0], 720], 'gate-east': [[225, 16, 0], 110], 'gate-north': [[0, 16, -225], 110], 'gate-south': [[0, 16, 225], 110],
    'outer-court': [[150, 4, 0], 320], 'inner-south': [[0, 18, 75], 110], 'inner-east': [[75, 18, 0], 110], 'inner-north': [[0, 18, -75], 110],
    tables: [[0, 5, -105], 40], singers: [[30, 10, -20], 70], 'inner-court': [[0, 8, 0], 200], mazabach: [[0, 12, 0], 50],
    awalam: [[-55, 26, 0], 70], hayakal: [[-87, 22, 0], 44], qadash: [[-119, 22, 0], 22], tzalai: [[-100, 20, 30], 110], karawab: [[-90, 22, 8], 18],
    'wood-altar': [[-101, 15, 0], 9], doors: [[-64, 20, 0], 24], 'holy-doors': [[-108, 18, 0], 16], binyan: [[-210, 14, 0], 170], 'chambers-north': [[-100, 12, -75], 130], 'chambers-south': [[-100, 12, 75], 130],
  };
  const f = F[id]; return f ? { target: f[0], distance: f[1] } : null;
}

// ── The MODEL: what the generic page, scene and sheet read ───────────────────
export const STORIES = [
  { key: 'walk', label: 'Walk', modes: ['walk', 'roam'], icon: 'measure', go: 'Walk the measures →',
    kicker: 'Ezekiel 40–43 · the man with the qanah (reed)',
    blurb: 'Follow the ayash (man) whose appearance was like nachashath (brass), gate by gate in the text\'s own order: up the seven steps into the east shair (gate), across the chayatzawan (outer) chatzar (court) with its thirty rooms, up the eight to the inner gates and the mazabach (altar), up to the awalam (porch) and into the hayakal (temple) and the most qadash (holy) place, round the tzalai (side) rooms, the banayan (building) and the kahanayam (priests)\' rooms, and out to measure the chawamah (wall) five hundred square — then the kabawad (glory) comes in by the way of the east. Guided, or on your own feet.' },
];
const IN_HOUSE = (p) => p.x > SIDE_X - 1 && p.x < HOUSE.x1 + 1 && Math.abs(p.z) < HOUSE.z + 1 && p.y < LEVEL.house + HAY.h + 4;

export const MODEL = {
  id: 'ezekiel', base: '/models/ezekiel', defaultStory: 'walk',
  title: 'The Bayath (House) Yachazaqaal (Ezekiel) Saw', paleo: '𐤁𐤉𐤕 𐤉𐤇𐤆𐤒𐤀𐤋',
  description: 'The bayath (house) shown to Yachazaqaal (Ezekiel) on the very high har (mountain) (Ezekiel 40–43) as an interactive 3D model, measured in the long amah (cubit) of the man\'s qanah (reed): the chawamah (wall) five hundred square, the six shairayam (gates) with their lodges and posts, the chatzarawath (courts), the mazabach (altar) with its Har\'Al, the awalam (porch), the hayakal (temple) and the most qadash (holy) place, the tzalai (side) rooms, the banayan (building) and the kahanayam (priests)\' rooms. Walk it the way he was led, or on your own feet.',
  indexDescription: 'The bayath (house) Yachazaqaal (Ezekiel) was shown (Ezekiel 40–43) as an interactive 3D model, measured in the long amah (cubit) from the text — walk it gate by gate the way the man with the qanah (reed) led him, or roam it on your own feet.',
  indexIntro: 'One model, measured in the long amah (cubit) of the man\'s qanah (reed), and the way through it the text itself gives: the man leads, gate by gate, and every part on the model can be tapped for its measures and verses.',
  ground: LEVEL.out, cubit: 0.525,   // the long cubit, "a cubit and a handbreadth" (40:5)
  WORDS, MATERIALS, PIECES, GROUPS, MODES, SPEEDS, CHIP_ORDER, PASSAGES, STORIES,
  pieceById, pieceForWord, passagesFor, refsFor, phaseAt, progressAt, xrayAt, openAt, cameraAt, marksFor, focusFor,
  stories: STORIES,
  related: [{ label: 'Open the city and the portion →', to: '/models/ezekiel-city', note: 'This house stands in the thawak (midst) of the kahanayam (priests)\' strip of the qadash (holy) tharawamah (portion), with the iyar (city) of the twelve shairayam (gates) south of it (Ezekiel 45; 48) — laid out at scale in its own model.' }],
  card: {
    title: 'The bayath (house) Yachazaqaal (Ezekiel) raah (saw) on the gabah (high) har (mountain)',
    subtitle: () => 'Ezekiel 40–43',
    intro: (mode) => (mode === 'roam'
      ? 'No story here: the house stands finished, and you walk it — up the seven steps of the east shair (gate), between its lodges, across the chayatzawan (outer) chatzar (court), up the eight steps of an inner gate to the mazabach (altar), up to the awalam (porch) and in through the dalathawath (doors); tap a part for its words, and tap a door or a gate again to go through.'
      : 'Play, and go the way the man with the qanah (reed) took him: the chawamah (wall) one reed thick and high; the east shair (gate) — its sap (threshold), its lodges three a side, its awalam (porch) and posts; the chayatzawan (outer) chatzar (court) with its ratzapah (pavement) and thirty rooms; the north and south gates; the three inner gates and the shalachanawath (tables); the inner court, a hundred square, with the mazabach (altar) before the house; the awalam (porch), the hayakal (temple), the karawab (cherubim) and thamar (palm) trees, the mazabach (altar) of itz (wood), the dalathawath (doors), the most qadash (holy) place, the tzalai (side) rooms; the banayan (building) on the west and the kahanayam (priests)\' rooms; then the whole measured, chamash (five) maah (hundred) on every side — and the kabawad (glory) of Yahawah comes in by the way of the east.'),
    extras: () => [{ heading: 'What the model takes from the text, and what it adds', refs: 'Ezekiel 40:5; 42:15–20; 41:8, 13–14; 43:13', text: 'The amah (cubit) here is the long one, "a amah (cubit) and a tapach (handbreadth)" (40:5; 43:13), and one unit in the model. The 500 of 42:16–20 is taken in amah (the gates, courts, house and building measured inside sum to it). Where the text gives no measure — the height of the gates and the house, the thirty rooms of the outer court, the plan of the priests\' rooms, the galleries of the building — the model idealises and says so on each part\'s card, hatched on the model.' }],
    choose: 'Tap a part of the house, one of the chips under it, or a marked word in the text for its measures, verse by verse, the same thing elsewhere in scripture, and what the model had to assume where the text is silent.',
  },
  strings: { parts: 'Parts of the house', storiesTitle: 'The house\'s stories', guidedTitle: 'Guided: the way the man with the reed took him, verse by verse' },
  roam: {
    eye: ROAM_EYE, start: ROAM_START, enter: ROAM_ENTER,
    openKeys: ['hayakal', 'dabayar'],
    openKey: (which) => (which === 'hayakal' ? 'hayakal' : 'dabayar'),
    openDefault: (k) => (k.includes(':') && !k.startsWith('gate-east') ? 1 : 0),   // every gate open but the east one, where the walk begins (and which is shut afterward, 44:1–2); the doors shut
  },
  scene: {
    sky: 0xc4d6e8, shadowR: 300, fog: [900, 2400], maxDistance: 1400, earth: '#557139',   // the land about the house green (the waters of 47:1–12 heal it — fieldy: an oasis), the courts trodden earth and stone
    lighting: { sun: 3.1, hemi: 0.62 },   // a harder sun, a dimmer sky: the walls' faces and the drops between the levels read (fieldy: better shading and contrast)
    lights: [
      { key: 'hallLight', color: 0xffd9a0, distance: 70, pos: [(HAY_X0 + HAY_X1) / 2, LEVEL.house + 14, 0], on: () => 320 },
      { key: 'holyLight', color: 0xffe2b0, distance: 40, pos: [(HOLY_X0 + HOLY_X1) / 2, LEVEL.house + 12, 0], on: () => 220 },
      { key: 'porchLight', color: 0xfff0d0, distance: 40, pos: [(PORCH_X0 + HOUSE.x1) / 2, LEVEL.house + 12, 0], on: () => 140 },
    ],
    walls: ['chawamah', 'gate-east', 'gate-north', 'gate-south', 'inner-south', 'inner-east', 'inner-north', 'inner-court', 'mazabach', 'awalam', 'hayakal', 'qadash', 'tzalai', 'doors', 'holy-doors', 'binyan', 'chambers-north', 'chambers-south', 'outer-court', 'singers'],
    notSolid: [],
    proxies: [],
    stairHouses: { binyan: { x0: BINYAN.x0, x1: BINYAN.x1, z0: -BINYAN.z, z1: BINYAN.z, h: 24 } },
    plan: {
      pieces: ['chawamah', 'gate-east', 'gate-north', 'gate-south', 'inner-south', 'inner-east', 'inner-north', 'outer-court', 'inner-court', 'mazabach', 'awalam', 'hayakal', 'qadash', 'tzalai', 'binyan', 'chambers-north', 'chambers-south', 'singers'],
      extra: [],
      labels: [
        [225, 0, 'shair'], [0, -225, 'shair'], [0, 225, 'shair'], [75, 0, 'inner shair'], [0, -75, 'inner shair'], [0, 75, 'inner shair'],
        [150, 0, 'chayatzawan chatzar'], [0, -150, 'chayatzawan chatzar'], [0, 150, 'chayatzawan chatzar'], [25, 25, 'chatzar'], [0, 0, 'mazabach'],
        [-55, 0, 'awalam'], [-87, 0, 'hayakal'], [-119, 0, 'qadash'], [-100, -60, 'kahanayam'], [-100, 60, 'kahanayam'], [-210, 0, 'banayan'], [-160, 0, 'gazarah'],
      ],
      radius: 120,
      // the places the big map offers (a building drills down to its rooms; `at` is where the walker is taken to stand)
      places: [
        { label: 'qadayam (east) shair (gate)', bounds: { x0: 200, x1: 258, z0: -13, z1: 13 }, at: [225, 0] },
        { label: 'tzapawan (north) shair (gate)', bounds: { x0: -13, x1: 13, z0: -258, z1: -200 }, at: [0, -225] },
        { label: 'darawam (south) shair (gate)', bounds: { x0: -13, x1: 13, z0: 200, z1: 258 }, at: [0, 225] },
        { label: 'inner qadayam (east) shair (gate)', bounds: { x0: 50, x1: 108, z0: -13, z1: 13 }, at: [75, 0] },
        { label: 'inner tzapawan (north) shair (gate)', bounds: { x0: -13, x1: 13, z0: -108, z1: -50 }, at: [0, -75] },
        { label: 'inner darawam (south) shair (gate)', bounds: { x0: -13, x1: 13, z0: 50, z1: 108 }, at: [0, 75] },
        { label: 'shalachanawath (tables)', bounds: { x0: -18, x1: 18, z0: -112, z1: -90 }, at: [0, -104] },
        { label: 'mazabach (altar)', bounds: { x0: -11, x1: 24, z0: -11, z1: 11 }, at: [25, 0] },
        { label: 'rooms of the singers', bounds: { x0: 16, x1: 49, z0: -49, z1: 40 }, children: [
          { label: 'room by the north gate (the keepers of the house)', bounds: { x0: 16, x1: 40, z0: -49, z1: -30 }, at: [28, -40] },
          { label: 'room by the east gate (the keepers of the altar)', bounds: { x0: 30, x1: 49, z0: 16, z1: 40 }, at: [40, 28] },
        ] },
        { label: 'bayath (house)', bounds: { x0: -146, x1: -34, z0: -31, z1: 31 }, children: [
          { label: 'mailahawath (steps) and imawadayam (pillars)', bounds: { x0: -46, x1: -34, z0: -16, z1: 16 }, at: [-40, 0] },
          { label: 'awalam (porch)', bounds: { x0: -61, x1: -46, z0: -15, z1: 15 }, at: [-55, 0] },
          { label: 'hayakal (temple)', bounds: { x0: -107, x1: -61, z0: -16, z1: 16 }, at: [-87, 0] },
          { label: 'mazabach (altar) of itz (wood)', bounds: { x0: -104, x1: -98, z0: -4, z1: 4 }, at: [-97, 3] },
          { label: 'most qadash (holy) place', bounds: { x0: -135, x1: -107, z0: -16, z1: 16 }, at: [-119, 0] },
          { label: 'tzalai (side) rooms · north', bounds: { x0: -146, x1: -61, z0: -31, z1: -16 }, at: [-100, -36] },
          { label: 'tzalai (side) rooms · south', bounds: { x0: -146, x1: -61, z0: 16, z1: 31 }, at: [-100, 36] },
        ] },
        { label: 'banayan (building) — the keepers\' house', short: 'banayan', bounds: { x0: -250, x1: -170, z0: -45, z1: 45 }, children: [
          { label: 'the hall and its well', short: 'hall', bounds: { x0: -244, x1: -175, z0: -30, z1: 30 }, at: [-214, 0] },
          { label: 'the stairs to the galleries', short: 'stairs', bounds: { x0: -192, x1: -175, z0: -40, z1: -30 }, at: [-184, -34] },
          ...Array.from({ length: 8 }, (_, i) => ({ label: `quarters ${i + 1} of the keepers`, short: `${i + 1}`, bounds: { x0: -244 + i * 8.625, x1: -244 + (i + 1) * 8.625, z0: 30, z1: 40 }, at: [-244 + (i + 0.5) * 8.625, 35] })),
          ...Array.from({ length: 4 }, (_, i) => ({ label: `store ${i + 1}`, short: `store ${i + 1}`, bounds: { x0: -244 + i * 13, x1: -244 + (i + 1) * 13, z0: -40, z1: -30 }, at: [-244 + (i + 0.5) * 13, -35] })),
        ] },
        ...[-1, 1].map((s) => ({ label: `kahanayam (priests)' rooms · ${s < 0 ? 'north' : 'south'}`, bounds: { x0: -150, x1: -42, z0: Math.min(s * 50, s * 100), z1: Math.max(s * 50, s * 100) }, children: [
          { label: 'the entry from the outer court (42:9)', short: 'entry', bounds: { x0: -58, x1: -42, z0: Math.min(s * 70, s * 80), z1: Math.max(s * 70, s * 80) }, at: [-46, s * 75] },
          { label: 'mahalak (walk) of ten', short: 'mahalak (walk)', bounds: { x0: -150, x1: -58, z0: Math.min(s * 70, s * 80), z1: Math.max(s * 70, s * 80) }, at: [-100, s * 75] },
          ...Array.from({ length: 8 }, (_, i) => ({ label: `room ${i + 1} before the hayakal (temple)`, short: `${i + 1}`, bounds: { x0: -150 + i * 12.5, x1: -150 + (i + 1) * 12.5, z0: Math.min(s * 50, s * 70), z1: Math.max(s * 50, s * 70) }, at: [-150 + (i + 0.5) * 12.5, s * 60] })),
          ...Array.from({ length: 4 }, (_, i) => ({ label: `room ${i + 1} toward the chatzar (court)`, short: `${i + 1}`, bounds: { x0: -100 + i * 12.5, x1: -100 + (i + 1) * 12.5, z0: Math.min(s * 80, s * 98), z1: Math.max(s * 80, s * 98) }, at: [-100 + (i + 0.5) * 12.5, s * 89] })),
        ] })),
      ],
    },
    inHouse: IN_HOUSE,
    floorAt: (c) => (IN_HOUSE(c) ? LEVEL.house : Math.abs(c.x) < INNER.x1 && Math.abs(c.z) < INNER.z ? LEVEL.inner : Math.abs(c.x) < OUT && Math.abs(c.z) < OUT ? LEVEL.outer : LEVEL.out),
  },
  sheet: {
    plan: { x0: -262, x1: 262, z0: -262, z1: 262, scale: 1.16, left: 24, top: 26, grid: 50 },
    section: { x0: -262, x1: 300, y0: -4, y1: 80, scale: 0.6, left: 640, bottom: 64, tick: 20 },
    titles: ['PLAN · tzapawan (north) up · qadayam (east) right · one square = 50 amah', 'SECTION · through the middle, east gate to the building'],
    labels: [
      ['shair', 225, -20], ['shair', 20, -225], ['shair', 20, 225], ['inner shair', 75, -20], ['inner shair', 20, -75], ['inner shair', 20, 75],
      ['chayatzawan chatzar (outer court)', 150, -60], ['chatzar (inner court)', 30, 30], ['mazabach', 0, -14], ['awalam', -55, -18], ['hayakal', -87, -18], ['qadash', -119, -18],
      ['lashakawath (priests\' rooms)', -100, -110], ['lashakawath (priests\' rooms)', -100, 110], ['banayan (building)', -210, 0], ['gazarah', -160, 40],
    ],
    compass: [236, -236],
    aria: 'The house Ezekiel saw, drawn flat: a plan of the whole square and a section through the middle',
  },
};
export default MODEL;
