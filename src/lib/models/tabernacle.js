/**
 * tabernacle.js — the mashakan (tabernacle) of Exodus 25–27 and 40 with the
 * machanah (camp) of Numbers 2–3 about it: the chatzar (court) of qalaiyam
 * (hangings) a hundred by fifty, its sixty imawadayam (pillars) and the screen of
 * its shair (gate); the mazabach (altar) of nachashath (brass) and the basin; the
 * qarashayam (boards) overlaid with zahab (gold) standing in adanayam (sockets)
 * of kasap (silver), their barayacham (bars); the yarayaihath (curtains) of the
 * mashakan and the ahal (tent) of izayam (goats)' hair and the coverings of
 * skins; the screen of the pathach (door), the shalachan (table), the manawarah
 * (lampstand), the mazabach (altar) of qatarath (incense), the parakath (veil),
 * the arawan (ark) with its kaparath (mercy seat) and karawab (cherubim); the
 * Lawayay (Levites) close about it and the twelve by their dagal (standards) —
 * ALL the model's data and its stories, read by the generic page, scene and
 * sheet (pages/ModelPage.jsx, components/ModelScene.jsx, components/ModelSheet.jsx)
 * exactly as lib/models/temple.js and lib/models/ezekiel.js are.
 *
 * Units: ONE WORLD UNIT = ONE amah (cubit). The ground is y = 0 (the court is
 * the wilderness floor; nothing is raised). The pathach (door) faces qadam
 * (east) = +x, as in the other models; the thayaman (south) = +z.
 *
 * Every measure the text gives is used as given; where it gives none the model
 * is idealised and SAYS so (each piece's `assumed`). The boards' thickness (1),
 * the pillars' form, the pins, the camps' distance and the tents are the
 * model's own, hatched.
 *
 * One story on the model, RAISE — the order Mashah (Moses) set it up in
 * (Exodus 40:17–33), part by part, then the inan (cloud) (40:34–38) and the
 * machanah (camp) about it (Numbers 2) — and ROAM, no story: the finished
 * mashakan and camp, the viewer walking where they will. Captions QUOTE the
 * live text ({{Ref | from … to}}, lib/passages.js) — nothing here is a copy of
 * a verse.
 */
import { makeKit, V, SPEEDS, smooth, timelineFor, BASE_MATERIALS } from './kit.js';

// ── Words of the text ────────────────────────────────────────────────────────
export const WORDS = {
  mashakan:  { translit: 'Mashakan',  paleo: '𐤌𐤔𐤊𐤍',  en: 'tabernacle — the dwelling place',        sn: 'H4908' },
  ahal:      { translit: 'Ahal',      paleo: '𐤀𐤄𐤋',   en: 'tent',                                    sn: 'H168' },
  mawaid:    { translit: 'Mawaid',    paleo: '𐤌𐤅𐤏𐤃',  en: 'appointed time / meeting',                sn: 'H4150' },
  maqadash:  { translit: 'Maqadash',  paleo: '𐤌𐤒𐤃𐤔',  en: 'sanctuary',                               sn: 'H4720' },
  yarayaih:  { translit: 'Yarayaih',  paleo: '𐤉𐤓𐤉𐤏𐤄', en: 'curtain',                                 sn: 'H3407' },
  qarash:    { translit: 'Qarash',    paleo: '𐤒𐤓𐤔',   en: 'board / plank',                           sn: 'H7175' },
  adan:      { translit: 'Adan',      paleo: '𐤀𐤃𐤍',   en: 'socket / base',                           sn: 'H134' },
  barayach:  { translit: 'Barayach',  paleo: '𐤁𐤓𐤉𐤇',  en: 'bar',                                     sn: 'H1280' },
  parakath:  { translit: 'Parakath',  paleo: '𐤐𐤓𐤊𐤕',  en: 'veil — the dividing curtain',             sn: 'H6532' },
  masak:     { translit: 'Masak',     paleo: '𐤌𐤎𐤊',   en: 'screen — a hanging over a doorway',       sn: 'H4539' },
  imawad:    { translit: 'Imawad',    paleo: '𐤏𐤌𐤅𐤃',  en: 'pillar',                                  sn: 'H5982' },
  chatzar:   { translit: 'Chatzar',   paleo: '𐤇𐤑𐤓',   en: 'court',                                   sn: 'H2691' },
  qalai:     { translit: 'Qalai',     paleo: '𐤒𐤋𐤏',   en: 'hanging (of the court)',                  sn: 'H7050' },
  shair:     { translit: 'Shair',     paleo: '𐤔𐤏𐤓',   en: 'gate',                                    sn: 'H8179' },
  pathach:   { translit: 'Pathach',   paleo: '𐤐𐤕𐤇',   en: 'door / opening',                          sn: 'H6607' },
  arawan:    { translit: 'Arawan',    paleo: '𐤀𐤓𐤅𐤍',  en: 'ark — a chest',                           sn: 'H727' },
  kaparath:  { translit: 'Kaparath',  paleo: '𐤊𐤐𐤓𐤕',  en: 'mercy seat — the covering',               sn: 'H3727' },
  karawab:   { translit: 'Karawab',   paleo: '𐤊𐤓𐤅𐤁',  en: 'cherub / cherubim',                       sn: 'H3742' },
  idawath:   { translit: 'Idawath',   paleo: '𐤏𐤃𐤅𐤕',  en: 'testimony / witness',                     sn: 'H5715' },
  shalachan: { translit: 'Shalachan', paleo: '𐤔𐤋𐤇𐤍',  en: 'table',                                   sn: 'H7979' },
  lacham:    { translit: 'Lacham',    paleo: '𐤋𐤇𐤌',   en: 'bread',                                   sn: 'H3899' },
  manawarah: { translit: 'Manawarah', paleo: '𐤌𐤍𐤅𐤓𐤄', en: 'lampstand — the menorah',                 sn: 'H4501' },
  nayar:     { translit: 'Nayar',     paleo: '𐤍𐤓',    en: 'lamp',                                    sn: 'H5216' },
  mazabach:  { translit: 'Mazabach',  paleo: '𐤌𐤆𐤁𐤇',  en: 'altar',                                   sn: 'H4196' },
  qatarath:  { translit: 'Qatarath',  paleo: '𐤒𐤈𐤓𐤕',  en: 'incense',                                 sn: 'H7004' },
  qaran:     { translit: 'Qaran',     paleo: '𐤒𐤓𐤍',   en: 'horn',                                    sn: 'H7161' },
  kayawar:   { translit: 'Kayawar',   paleo: '𐤊𐤉𐤅𐤓',  en: 'basin / laver',                           sn: 'H3595' },
  rachatz:   { translit: 'Rachatz',   paleo: '𐤓𐤇𐤑',   en: 'wash',                                    sn: 'H7364' },
  zahab:     { translit: 'Zahab',     paleo: '𐤆𐤄𐤁',   en: 'gold',                                    sn: 'H2091' },
  kasap:     { translit: 'Kasap',     paleo: '𐤊𐤎𐤐',   en: 'silver',                                  sn: 'H3701' },
  nachashath:{ translit: 'Nachashath',paleo: '𐤍𐤇𐤔𐤕',  en: 'brass / bronze',                          sn: 'H5178' },
  shash:     { translit: 'Shash',     paleo: '𐤔𐤔',    en: 'fine linen (byssus)',                     sn: 'H8336' },
  thakalath: { translit: 'Thakalath', paleo: '𐤕𐤊𐤋𐤕',  en: 'blue',                                    sn: 'H8504' },
  aragaman:  { translit: 'Aragaman',  paleo: '𐤀𐤓𐤂𐤌𐤍', en: 'purple',                                  sn: 'H713' },
  thawalai:  { translit: 'Thawalai',  paleo: '𐤕𐤅𐤋𐤏',  en: 'scarlet — the crimson worm',              sn: 'H8438' },
  izayam:    { translit: 'Izayam',    paleo: '𐤏𐤆𐤉𐤌',  en: 'goats',                                   sn: 'H5795' },
  ayalam:    { translit: 'Ayalam',    paleo: '𐤀𐤉𐤋𐤌',  en: 'rams',                                    sn: 'H352' },
  thachash:  { translit: 'Thachash',  paleo: '𐤕𐤇𐤔',   en: 'tachash — a hide (badger / sea cow / dyed skin)', sn: 'H8476' },
  iwarath:   { translit: 'Iwarath',   paleo: '𐤏𐤅𐤓𐤕',  en: 'skins / hides',                           sn: 'H5785' },
  itz:       { translit: 'Itz',       paleo: '𐤏𐤑',    en: 'wood / tree',                             sn: 'H6086' },
  amah:      { translit: 'Amah',      paleo: '𐤀𐤌𐤄',   en: 'cubit',                                   sn: 'H520' },
  yathad:    { translit: 'Yathad',    paleo: '𐤉𐤕𐤃',   en: 'pin / tent peg',                          sn: 'H3489' },
  inan:      { translit: 'Inan',      paleo: '𐤏𐤍𐤍',   en: 'cloud',                                   sn: 'H6051' },
  kabawad:   { translit: 'Kabawad',   paleo: '𐤊𐤁𐤅𐤃',  en: 'glory / weight',                          sn: 'H3519' },
  machanah:  { translit: 'Machanah',  paleo: '𐤌𐤇𐤍𐤄',  en: 'camp / company',                          sn: 'H4264' },
  dagal:     { translit: 'Dagal',     paleo: '𐤃𐤂𐤋',   en: 'standard / banner',                       sn: 'H1714' },
  matah:     { translit: 'Matah',     paleo: '𐤌𐤈𐤄',   en: 'staff / rod / tribe',                     sn: 'H4294' },
  lawayay:   { translit: 'Lawayay',   paleo: '𐤋𐤅𐤉',   en: 'Levites — "joined"',                      sn: 'H3881' },
  mashah:    { translit: 'Mashah',    paleo: '𐤌𐤔𐤄',   en: 'Moses — "drawn out"',                     sn: 'H4872' },
  aharawan:  { translit: 'Aharawan',  paleo: '𐤀𐤄𐤓𐤍',  en: 'Aaron',                                   sn: 'H175' },
  qadash:    { translit: 'Qadash',    paleo: '𐤒𐤃𐤔',   en: 'holy / set apart',                        sn: 'H6944' },
  nashayaa:  { translit: 'Nashayaa',  paleo: '𐤍𐤔𐤉𐤀',  en: 'prince / leader',                         sn: 'H5387' },
};

// ── Materials ────────────────────────────────────────────────────────────────
// the wilderness floor is sand; the cloths of the mashakan are named for what they are
export const MATERIALS = {
  ...BASE_MATERIALS,
  ground:    { word: 'chatzar',    color: '#c9b384', hi: '#e2d1a8', lo: '#8d7a52', metal: 0, rough: 1 },     // trodden sand of the court
  linen:     { word: 'shash',      color: '#efe6d2', hi: '#fffaf0', lo: '#b9ae97', metal: 0, rough: 0.95 },  // shash (fine linen) — the court's hangings
  goatshair: { word: 'izayam',     color: '#3d332a', hi: '#6a5c50', lo: '#1f1913', metal: 0, rough: 1 },     // the ahal (tent) of goats' hair
  ramskin:   { word: 'ayalam',     color: '#8e3f2a', hi: '#bd6a50', lo: '#4e2014', metal: 0, rough: 0.85 },  // rams' skins dyed red
  tachash:   { word: 'thachash',   color: '#6b5a48', hi: '#9a8670', lo: '#3a2f24', metal: 0, rough: 0.9 },   // the covering of tachash hides above
  acacia:    { word: 'itz',        color: '#a8834f', hi: '#cfae7d', lo: '#5f4526', metal: 0, rough: 0.75 },  // acacia wood
  cloud:     { word: 'inan',       color: '#eef0f4', hi: '#ffffff', lo: '#b8bfcc', metal: 0, rough: 1 },
};

// ── The frame, in cubits ─────────────────────────────────────────────────────
// 27:9–18: the court a hundred long, fifty broad, five high; twenty pillars a long side, ten a short, the gate's screen twenty on
// four pillars with fifteen of hangings on three pillars either side. 26:15–25: forty-eight boards a cubit and a half broad and ten
// long — twenty a side (30), six for the west with two for the corners; 26:33: the veil under the clasps (the first five curtains,
// 5 × 4 = 20 from the front). 40:22–30: the table north, the lampstand south, the gold altar before the veil, the screen, the
// altar of burnt offering at the door, the basin between the tent and the altar. Numbers 2: the camp on the four sides.
export const COURT = { x0: -50, x1: 50, z: 25, h: 5, gate: 20 };                      // 27:9–18
export const MISH = { x0: -40, x1: -10, z: 5, h: 10, boardW: 1.5, boardT: 1 };        // 26:15–25 (boardT assumed)
export const VEIL_X = MISH.x1 - 20;                                                    // −30: under the clasps (26:33)
export const HOLY = { x0: VEIL_X, x1: MISH.x1 };                                       // the holy place, 20 × 10
export const MOST_HOLY = { x0: MISH.x0, x1: VEIL_X };                                  // the most holy, 10 × 10
export const ALTAR = { x: 12, z: 0, w: 5, h: 3 };                                      // 27:1: at the door of the tabernacle (40:29)
export const BASIN = { x: -3, z: 0 };                                                  // 30:18: between the tent and the altar
export const TABLE = { x: -20, z: -3.5 };                                              // 40:22: the north side
export const LAMP = { x: -20, z: 3.5 };                                                // 40:24: the south side
export const INCENSE = { x: -27, z: 0 };                                               // 40:26: before the veil
export const ARK = { x: -35, z: 0 };                                                   // 40:21: within the veil
export const LEVEL = 0;
export const CAMP_R = 200;                                                             // the twelve at a distance (Numbers 2:2) — assumed
export const LEVITE_R = 60;                                                            // the Levites close about it (Numbers 1:53) — assumed

// ── Parts ────────────────────────────────────────────────────────────────────
const K = makeKit(LEVEL);
const { box, cyl, lathe, ideal } = K;

/** A pillar: a socket, an acacia shaft, a capital of the metal named, a hook. `pillarMat` gold for the tent's, acacia for the court's. */
function pillar(x, z, h, pillarMat = 'acacia', socketMat = 'brass', capMat = 'silver', r = 0.3) {
  return [
    box(x, 0, z, 0.9, 0.5, 0.9, { mat: socketMat, role: 'socket' }),
    cyl(x, 0.5, z, r, h - 0.5, { mat: pillarMat, role: 'pillar' }),
    cyl(x, h, z, r + 0.08, 0.3, { mat: capMat, role: 'capital' }),
    box(x, h - 0.6, z, 0.14, 0.4, 0.14, { mat: capMat, role: 'hook' }),
  ];
}
/** A pin of brass a little out from a pillar (27:19) — idealized: the text names them, not where they stand. */
const pin = (x, z) => [ideal(cyl(x, 0, z, 0.09, 0.45, { mat: 'brass', role: 'pin' }))];
/** A tent of the camp (idealized): a low cone of goats' hair with a dark doorway. */
const tent = (x, z, r = 2.4, h = 2.6) => [ideal(cyl(x, 0, z, r, h, { mat: 'goatshair', role: 'tent', r2: 0.12 }))];
/** A dagal (standard): a pole with a cloth — the text names the standards and banners, not their look. */
const standard = (x, z, big = false) => {
  const h = big ? 16 : 11, w = big ? 6 : 4, ch = big ? 3.5 : 2.4;
  return [ideal(cyl(x, 0, z, 0.16, h, { mat: 'acacia', role: 'pole' })), ideal(box(x, h - ch - 0.3, z + w / 2 + 0.16, 0.06, ch, w, { mat: 'linen', role: 'banner' }))];
};
/** A field of tents in rows between x0…x1 × z0…z1. */
function field(x0, x1, z0, z1, nx, nz) {
  const out = [];
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const jx = ((i * 7 + k * 3) % 5) * 0.35 - 0.7, jz = ((i * 3 + k * 5) % 5) * 0.35 - 0.7;   // a little irregularity, as camps are
    out.push(...tent(x0 + (i + 0.5) * ((x1 - x0) / nx) + jx, z0 + (k + 0.5) * ((z1 - z0) / nz) + jz));
  }
  return out;
}

/** The chatzar (court) of 27:9–19: hangings of fine linen five high on pillars every five cubits, the gate's opening left on the east; the sand within. */
function court() {
  const { x0, x1, z, h, gate } = COURT, out = [];
  out.push(box(0, -0.1, 0, x1 - x0, 0.2, 2 * z, { role: 'ground', mat: 'ground' }));                      // the court's floor, the sand a hand above the plain
  // the hangings, on the outer face of the pillars (27:9–15, 18)
  const t = 0.08, o = 0.36;
  out.push(box(0, 0, z + o, x1 - x0, h, t, { mat: 'linen', role: 'hanging' }), box(0, 0, -z - o, x1 - x0, h, t, { mat: 'linen', role: 'hanging' }));
  out.push(box(x0 - o, 0, 0, t, h, 2 * z, { mat: 'linen', role: 'hanging' }));
  out.push(box(x1 + o, 0, (gate / 2 + z) / 2, t, h, z - gate / 2, { mat: 'linen', role: 'hanging' }), box(x1 + o, 0, -(gate / 2 + z) / 2, t, h, z - gate / 2, { mat: 'linen', role: 'hanging' }));
  // the pillars, one every five cubits round the perimeter (27:10–12, 14–15); the east between the gate's own four (gateScreen) is theirs
  const P = [];
  for (let x = x0; x <= x1; x += 5) { P.push([x, z]); P.push([x, -z]); }
  for (let zz = -z + 5; zz <= z - 5; zz += 5) { P.push([x0, zz]); if (Math.abs(zz) > gate / 2 + 0.1) P.push([x1, zz]); }
  for (const [px, pz] of P) {
    out.push(...pillar(px, pz, h));
    // a pin a little out from each pillar, on the outside of the court (27:19; the cords are not drawn)
    out.push(...pin(px + (Math.abs(px) === x1 ? Math.sign(px) * 1.6 : 0), pz + (Math.abs(pz) === z ? Math.sign(pz) * 1.6 : 0)));
  }
  return out;
}

/** The screen of the shair (gate) of the court (27:16): twenty cubits on four pillars — a hanging the walker parts. */
function gateScreen() {
  const { x1, h, gate } = COURT, out = [];
  for (const zz of [-gate / 2, -gate / 6, gate / 6, gate / 2]) out.push(...pillar(x1, zz, h));
  out.push({ kind: 'veil', x: x1 + 0.4, y: 0, z: 0, w: gate, h, open: 'gate', tile: [4, 5.5] });
  return out;
}

/** The qarashayam (boards) of 26:15–25: forty-eight, ten long and a cubit and a half broad, overlaid with gold, each in two sockets of silver. */
function boards() {
  const { x0, x1, z, h, boardW: bw, boardT: bt } = MISH, out = [];
  const B = (x, zz, along) => {   // a board with its two sockets; `along` 'x' for the sides, 'z' for the west
    if (along === 'x') {
      out.push(box(x, 0, zz, bw - 0.08, h, bt, { mat: 'gold', role: zz > 0 ? 'south' : 'north' }));
      for (const s of [-1, 1]) out.push(box(x + s * 0.38, 0, zz, 0.5, 0.6, bt + 0.3, { mat: 'silver', role: 'socket' }));
    } else {
      out.push(box(x, 0, zz, bt, h, bw - 0.08, { mat: 'gold', role: 'west' }));
      for (const s of [-1, 1]) out.push(box(x, 0, zz + s * 0.38, bt + 0.3, 0.6, 0.5, { mat: 'silver', role: 'socket' }));
    }
  };
  for (let i = 0; i < 20; i++) { const x = x0 + (i + 0.5) * bw; B(x, z + bt / 2, 'x'); B(x, -z - bt / 2, 'x'); }   // twenty south (26:18), twenty north (26:20)
  for (let i = 0; i < 8; i++) B(x0 - bt / 2, -z - bt + (i + 0.5) * bw, 'z');                                       // six for the west and two for the corners (26:22–25): eight across the twelve
  return out;
}

/** The barayacham (bars) of 26:26–29: five a side, the middle one from end to end, all overlaid with gold — on the outer face of the boards. */
function bars() {
  const { x0, x1, z, boardT: bt } = MISH, out = [], t = 0.3, zo = z + bt + t / 2, xm = (x0 + x1) / 2;
  for (const s of [-1, 1]) {
    for (const y of [1.6, 8.1]) { out.push(box((x0 + xm) / 2, y, s * zo, xm - x0 - 0.3, t, t, { mat: 'gold', role: 'bar' }), box((xm + x1) / 2, y, s * zo, x1 - xm - 0.3, t, t, { mat: 'gold', role: 'bar' })); }
    out.push(box(xm, 4.85, s * zo, x1 - x0, t, t, { mat: 'gold', role: 'bar' }));   // the middle bar, end to end (26:28)
  }
  const xo = x0 - bt - t / 2, Z = z + bt;
  for (const y of [1.6, 8.1]) { out.push(box(xo, y, -Z / 2, t, t, Z - 0.3, { mat: 'gold', role: 'bar' }), box(xo, y, Z / 2, t, t, Z - 0.3, { mat: 'gold', role: 'bar' })); }
  out.push(box(xo, 4.85, 0, t, t, 2 * Z, { mat: 'gold', role: 'bar' }));
  return out;
}

/** The ten yarayaihath (curtains) of the mashakan itself (26:1–6): forty by twenty-eight, of blue, purple, scarlet and fine linen with cherubim, over the boards. */
function mashakanCurtains() {
  const { x0, x1, z, h, boardT: bt } = MISH, out = [], t = 0.1, zo = z + bt + 0.36, W = 28, L = 40;
  const drop = (W - 2 * zo) / 2;   // 28 across: what is left after the top hangs down each side (26:13's cubits belong to the goats' hair; the linen hangs 8)
  out.push(box((x0 + x1) / 2, h, 0, x1 - x0, t, 2 * zo + t, { mat: 'veil', role: 'roof' }));                                          // over the top
  for (const s of [-1, 1]) out.push(box((x0 + x1) / 2, h - drop, s * zo, x1 - x0, drop, t, { mat: 'veil', role: s > 0 ? 'south' : 'north' }));   // down the sides
  out.push(box(x0 - bt - 0.36 - t / 2, h - (L - (x1 - x0)), 0, t, L - (x1 - x0), 2 * zo + t, { mat: 'veil', role: 'west' }));         // forty long: thirty over, ten down the back to the ground
  return out;
}

/** The eleven yarayaihath (curtains) of goats' hair for the ahal (tent) over it (26:7–13): forty-four by thirty — to a cubit of the ground on the sides, doubled at the front, the half curtain over the back. */
function ahalCurtains() {
  const { x0, x1, z, h, boardT: bt } = MISH, out = [], t = 0.12, zo = z + bt + 0.62, W = 30, L = 44, yTop = h + 0.16;
  const drop = (W - 2 * zo) / 2;   // 9: "the cubit on this side and the cubit on that" (26:13) is the cubit left above the ground
  out.push(box((x0 + x1) / 2, yTop, 0, x1 - x0, t, 2 * zo + t, { mat: 'goatshair', role: 'roof' }));
  for (const s of [-1, 1]) out.push(box((x0 + x1) / 2, yTop - drop, s * zo, x1 - x0, drop, t, { mat: 'goatshair', role: s > 0 ? 'south' : 'north' }));
  const back = L - (x1 - x0) - 2 - 2;   // 44 = 30 over + 10 down the back (to the ground) + 2 trailing behind (26:12) + 2 doubled at the front (26:9)
  out.push(box(x0 - bt - 0.62 - t / 2, yTop - back, 0, t, back, 2 * zo + t, { mat: 'goatshair', role: 'west' }));
  out.push(box(x0 - bt - 0.62 - 1.1, 0.02, 0, 2.1, 0.12, 2 * zo + t, { mat: 'goatshair', role: 'cloth' }));                         // the half curtain that remains, on the ground behind
  out.push(box(x1 + 0.7, yTop - 2, 0, t, 2 + t, 2 * zo + t, { mat: 'goatshair', role: 'east' }));                                    // the sixth curtain doubled over the forefront: two cubits hang before the door's head
  return out;
}

/** The covering of rams' skins dyed red and the covering of tachash hides above (26:14): over the tent; their measure is not given. */
function coverings() {
  const { x0, x1, z, h, boardT: bt } = MISH, out = [], zo = z + bt + 0.62;
  out.push(box((x0 + x1) / 2 - 0.3, h + 0.3, 0, x1 - x0 + 0.6, 0.12, 2 * zo + 0.9, { mat: 'ramskin', role: 'roof' }));
  for (const s of [-1, 1]) out.push(box((x0 + x1) / 2 - 0.3, h - 1.2, s * (zo + 0.4), x1 - x0 + 0.6, 1.5, 0.12, { mat: 'ramskin', role: s > 0 ? 'south' : 'north' }));
  out.push(box((x0 + x1) / 2 - 0.3, h + 0.45, 0, x1 - x0 + 0.6, 0.12, 2 * zo + 1.1, { mat: 'tachash', role: 'roof' }));
  for (const s of [-1, 1]) out.push(box((x0 + x1) / 2 - 0.3, h - 0.8, s * (zo + 0.52), x1 - x0 + 0.6, 1.3, 0.12, { mat: 'tachash', role: s > 0 ? 'south' : 'north' }));
  return out;
}

/** The screen for the pathach (door) of the tent on its five pillars of acacia overlaid with gold, in sockets of brass (26:36–37). */
function doorScreen() {
  const { x1, z, h } = MISH, out = [];
  for (let i = 0; i < 5; i++) out.push(...pillar(x1, -z + i * (2 * z / 4), h, 'gold', 'brass', 'gold'));
  out.push({ kind: 'veil', x: x1 + 0.4, y: 0, z: 0, w: 2 * z, h, open: 'door', tile: [4, 11] });
  return out;
}

/** The parakath (veil) on four pillars of acacia overlaid with gold, in sockets of silver (26:31–33), dividing the holy from the most holy. */
function veil() {
  const { z, h } = MISH, out = [];
  for (const zz of [-4.5, -1.5, 1.5, 4.5]) out.push(...pillar(VEIL_X, zz, h, 'gold', 'silver', 'gold'));
  out.push({ kind: 'veil', x: VEIL_X + 0.4, y: 0, z: 0, w: 2 * z, h, open: 'veil', tile: [4, 11] });
  return out;
}

/** The mazabach (altar) of burnt offering (27:1–8): five square, three high, of acacia overlaid with brass, horns at its corners, a ledge round it at the middle, poles in rings. */
function altar() {
  const { x, z, w, h } = ALTAR, out = [];
  out.push(box(x, 0, z, w, h, w, { mat: 'brass', role: 'altar', horns: true }));
  out.push(box(x, h / 2, z, w + 0.6, 0.18, w + 0.6, { mat: 'brass', role: 'altar' }));                                    // the ledge (27:5), the grating beneath it
  for (const s of [-1, 1]) out.push(box(x, h / 2 - 0.1, z + s * (w / 2 + 0.22), w + 2.4, 0.22, 0.22, { mat: 'brass', role: 'pole' }));   // the poles on its two sides (27:6–7)
  return out;
}

/** The basin of brass and its base (30:18–21; 38:8): between the tent and the altar; its form is not given. */
function basin() {
  const { x, z } = BASIN;
  return [
    ideal(cyl(x, 0, z, 0.75, 1.2, { mat: 'brass', role: 'basin', r2: 0.55 })),
    ideal(lathe(x, 1.2, z, [[0.55, 0], [1.4, 0.35], [1.75, 0.8], [1.8, 1.05], [1.6, 1.1], [1.45, 0.9], [1.3, 0.55], [0, 0.5]], { mat: 'brass', role: 'basin' })),
    ideal(cyl(x, 1.95, z, 1.28, 0.06, { mat: 'water', role: 'basin' })),
  ];
}

/** The mazabach (altar) of qatarath (incense) (30:1–6; 37:25–28): a cubit square, two high, of acacia overlaid with gold, horns, a molding, rings and poles. */
function incenseAltar() {
  const { x, z } = INCENSE;
  return [
    box(x, 0, z, 1, 2, 1, { mat: 'gold', role: 'altar', horns: true }),
    box(x, 1.86, z, 1.16, 0.1, 1.16, { mat: 'gold', role: 'altar' }),
    ...[-1, 1].map((s) => box(x, 1.6, z + s * 0.6, 2.6, 0.12, 0.12, { mat: 'goldDim', role: 'pole' })),
  ];
}

/** The inan (cloud) over the tent (40:34–38) — its form the model's own. */
function cloud() {
  const { x0, x1 } = MISH, cx = (x0 + x1) / 2, out = [];
  // a heap of rounded lumps over the tent, low and broad, its underside a little above the roof
  const lump = (dx, dz, r, dy) => ideal(lathe(cx + dx, MISH.h + 1.6 + dy, dz, [[0.2, 0], [r * 0.55, r * 0.06], [r * 0.85, r * 0.28], [r, r * 0.6], [r * 0.92, r * 0.95], [r * 0.65, r * 1.25], [r * 0.3, r * 1.42], [0.2, r * 1.48]], { mat: 'cloud', role: 'cloud' }));
  out.push(lump(0, 0, 15, 0), lump(-11, 5, 11, 0.5), lump(9, -6, 12, 0.3), lump(-4, -9, 9, 1.5), lump(6, 8, 9, 1.2), lump(-15, -3, 8, 2), lump(13, 4, 8, 1.8), lump(-2, 2, 10, 6));
  return out;
}

// the camps — the Levites close about (Numbers 1:53; 3:23, 29, 35, 38), the twelve at a distance by their standards (Numbers 2)
const LEV = (side) => {   // a Levite family's tents on one side
  const R = LEVITE_R, w = 30, d = 22;
  if (side === 'east') return [...field(R, R + d, -13, 13, 3, 3), ...standard(R - 3, 0)];
  if (side === 'south') return field(-w, w, R - 8, R - 8 + d, 6, 2);
  if (side === 'west') return field(-R - d, -R, -w, w, 2, 6);
  return field(-w, w, -R + 8 - d, -R + 8, 6, 2);
};
const TRIBE = (side, slot) => {   // a tribe's field of tents: `slot` −1 | 0 | 1 along the side, the middle tribe carrying the camp's dagal
  const R = CAMP_R, L = 70, D = 60, c = slot * 80, out = [];
  const F = (a0, a1, b0, b1) => (side === 'east' || side === 'west' ? field(a0, a1, b0, b1, 5, 6) : field(b0, b1, a0, a1, 6, 5));
  const S = (a, b, big) => (side === 'east' || side === 'west' ? standard(a, b, big) : standard(b, a, big));
  const sign = side === 'east' || side === 'south' ? 1 : -1;
  out.push(...F(sign * R, sign * (R + D), c - L / 2, c + L / 2));
  out.push(...S(sign * (R - 6), c + (slot === 0 ? 0 : 0), slot === 0));
  return out;
};

// ── The pieces ───────────────────────────────────────────────────────────────
// `on`: the verses that light in the passage when the piece is chosen (2 = Exodus, 4 = Numbers). `keys`: the text's words that
// pick this piece (see pieceForWord). `raise`: the RAISE phase at which the piece goes up. `parts`: the solids.
const CLOTHS = 'thakalath (blue), aragaman (purple), thawalai (scarlet) and fine twined shash (linen)';
export const PIECES = [
  {
    id: 'court', order: 0, group: 'court', material: 'acacia', raise: 'court',
    tag: 'chatzar (court)', title: 'The chatzar (court): qalaiyam (hangings) of shash (fine linen), maah (hundred) by chamashayam (fifty), on sixty imawadayam (pillars)',
    words: ['chatzar', 'qalai', 'imawad', 'adan', 'shash', 'nachashath', 'kasap', 'yathad', 'amah'], keys: ['chatzar', 'qalaiyam', 'qalaiy', 'hangings', 'imawadayam', 'imawaday', 'adan', 'chashaq', 'fillets', 'yathadath', 'pins'],
    on: V('2:27:9-19', '2:40:33'),
    refs: 'Exodus 27:9–19; 40:33',
    measures: [['arak (length)', '100 amah — the south and the north sides', '27:9, 11, 18'], ['rachab (breadth)', '50 amah — the west, and the east with its gate', '27:12–13, 18'], ['qawamah (height)', '5 amah, of fine twined shash (linen)', '27:18'], ['imawadayam (pillars)', '20 a long side, 10 a short — 60; their adan (sockets) of nachashath (brass)', '27:10–12, 14–16'], ['hooks and chashaq (fillets)', 'of kasap (silver)', '27:10, 17'], ['yathadath (pins)', 'of nachashath (brass), of the court and of the tabernacle', '27:19']],
    note: '"{{Exodus 27:18}}" — a court of cloth on posts, open to the sky, a hundred long and fifty broad, its hangings five high so that no one sees in; the tent stands in its western half and the altar before it in the eastern. Mashah raised it last of all (40:33).',
    elsewhere: { ref: 'Exodus 38:9–20; Numbers 3:26, 37; 1 Kings 6:36; Ezekiel 40:17; Psalm 84:10', note: 'The making of the court (38:9–20) and the Gershonites\' and Merarites\' charge of its hangings, pillars, sockets, pins and cords; the courts of stone of the houses after it.' },
    assumed: 'The pillars stand one every five cubits (three hundred cubits, sixty pillars) — how the corners are counted the text leaves; their thickness and capitals, and where each pin stands, are the model\'s. The hangings are drawn as one cloth a side.',
    idealized: 'The pins.',
    parts: court(),
  },
  {
    id: 'gate-screen', order: 1, group: 'court', material: 'acacia', raise: 'court',
    tag: 'screen of the shair (gate)', title: 'The screen of the shair (gate) of the court, isharayam (twenty) amah on arabai (four) pillars',
    words: ['shair', 'masak', 'imawad', 'thakalath', 'aragaman', 'thawalai', 'shash'], keys: ['shair', 'gate', 'screen', 'embroiderer', 'raqam'],
    on: V('2:27:14-16', '2:40:33'),
    refs: 'Exodus 27:14–16; 40:33',
    measures: [['the screen', `20 amah, of ${CLOTHS}, the work of the embroiderer`, '27:16'], ['its imawad (pillars) · adan (sockets)', '4 · 4', '27:16'], ['the hangings either side of it', '15 amah, on 3 pillars each', '27:14–15']],
    note: '"{{Exodus 27:16 | For the shair … arabai}}" — the only way in, on the east: not a door but a hanging, coloured where the court\'s hangings are white. On foot, tap it to part it and go in.',
    elsewhere: { ref: 'Exodus 38:18–19; Numbers 3:26; 4:26; Ezekiel 40:6; 44:1–3', note: 'Its making, its height five (38:18); the Gershonites carry it; the gates of the houses after it face the same way, east.' },
    assumed: 'That the screen parts in the middle when opened; the pillars\' form.',
    parts: gateScreen(),
  },
  {
    id: 'mazabach', order: 2, group: 'court', material: 'brass', raise: 'altar',
    tag: 'mazabach (altar)', title: 'The mazabach (altar) of burnt offering: chamash (five) square, shalawash (three) high, overlaid with nachashath (brass)',
    words: ['mazabach', 'qaran', 'nachashath', 'itz', 'amah'], keys: ['mazabach', 'qaran', 'horn', 'grating', 'makabar', 'rashath', 'net', 'ledge', 'sayar', 'pots', 'yai', 'shovels', 'nabab', 'hollow'],
    on: V('2:27:1-8', '2:40:29'),
    refs: 'Exodus 27:1–8; 40:29',
    measures: [['arak (length) · rachab (breadth)', '5 × 5 amah, rabai (foursquare)', '27:1'], ['qawamah (height)', '3 amah', '27:1'], ['qaran (horns)', 'on its four corners, of one piece with it; overlaid with nachashath (brass)', '27:2'], ['the grating of network', 'of brass, under the ledge, reaching halfway up', '27:4–5'], ['poles', 'of acacia overlaid with brass, in rings on its two sides', '27:6–7'], ['hollow with planks', '', '27:8']],
    note: '"{{Exodus 27:1}}" — a box of acacia planks sheathed in brass, hollow, carried on poles; at the pathach (door) of the tabernacle (40:29), so that whoever comes in through the gate meets it first. Its vessels — pots, shovels, basins, forks, fire pans — all of brass (27:3).',
    elsewhere: { ref: 'Exodus 38:1–7; 20:24–26; Leviticus 1:1–9; 2 Chronicles 4:1; Ezekiel 43:13–17; Hebrews 13:10', note: 'Its making (38:1–7); "you shall not go up by steps to my altar" (20:26); Shalamah\'s of twenty square and ten high; Yachazaqaal\'s of ledges with steps to the east.' },
    assumed: 'The ledge\'s projection and the grating within (not seen); no steps or ramp are drawn (20:26).',
    parts: altar(),
  },
  {
    id: 'basin', order: 3, group: 'court', material: 'brass', raise: 'basin',
    tag: 'basin of nachashath (brass)', title: 'The basin of nachashath (brass) and its base, to rachatz (wash) in',
    words: ['kayawar', 'rachatz', 'nachashath', 'mawaid'], keys: ['basin', 'rachatz', 'wash', 'mirrors'],
    on: V('2:30:17-21', '2:40:30-32', '2:38:8'),
    refs: 'Exodus 30:17–21; 38:8; 40:30–32',
    measures: [['of nachashath (brass), and its base of brass', '', '30:18'], ['its place', 'between the ahal (tent) of mawaid and the mazabach (altar)', '30:18; 40:30'], ['its use', 'Aharawan and his sons rachatz (wash) their hands and feet, lest they die', '30:19–21'], ['its metal', 'the mirrors of the ministering women', '38:8']],
    note: '"{{Exodus 30:18 | You shall … rachatz}}" — no measure is given for it at all, only its place and its use: the priest washes before he goes into the tent and before he comes near the altar.',
    elsewhere: { ref: '1 Kings 7:23–39; 2 Chronicles 4:2–6; Ezekiel 47:1; Revelation 4:6', note: 'Where the tabernacle had one basin, Shalamah\'s house had the yam (sea) on twelve oxen for the priests and ten bases with their basins for the offerings.' },
    assumed: 'Its whole form and size — a bowl on a stand — is the model\'s; it stands on the axis, a little west of the middle of the court.',
    idealized: 'The basin and its base.',
    parts: basin(),
  },
  {
    id: 'boards', order: 4, group: 'house', material: 'gold', raise: 'boards',
    tag: 'qarashayam (boards)', title: 'The qarashayam (boards) of the mashakan: forty-eight, ishar (ten) long, overlaid with zahab (gold), in adanayam (sockets) of kasap (silver)',
    words: ['qarash', 'adan', 'mashakan', 'zahab', 'kasap', 'itz', 'amah'], keys: ['qarash', 'qarashayam', 'qarashay', 'boards', 'board', 'tenons', 'adanay', 'adanayam', 'sockets', 'maqatzaih', 'maqatzawaith', 'corners'],
    on: V('2:26:15-25', '2:26:29', '2:40:18'),
    refs: 'Exodus 26:15–25, 29; 40:18',
    measures: [['arak (length) of a board', '10 amah', '26:16'], ['rachab (breadth) of a board', '1½ amah', '26:16'], ['tenons', '2 in a board, each in a socket of kasap (silver)', '26:17, 19'], ['south · north', '20 boards each — 40 sockets each', '26:18–21'], ['west', '6 boards, and 2 for the corners — 8, 16 sockets', '26:22–25'], ['overlaid', 'with zahab (gold)', '26:29']],
    note: '"{{Exodus 26:16 | Ishar … qarash}}" — twenty boards a side make thirty cubits; six across the back with the two corner boards close the west; the whole ten high, open to the east where the screen hangs. Inside, then, a house of gold: the boards are gold on both faces, and nothing else shows but the curtains overhead.',
    elsewhere: { ref: 'Exodus 36:20–34; Numbers 3:36; 4:31; 1 Kings 6:2; Ezekiel 41:1; Hebrews 9:1–5', note: 'Their making; the Merarites carry the boards, bars, pillars and sockets; the houses of stone after it kept the breadth of the tent (Ezekiel 41:1).' },
    assumed: 'The boards\' thickness (1) and how the corner boards close the west (eight boards across twelve cubits, the inside ten) are a reconstruction; the sockets are drawn as low blocks at the boards\' feet.',
    parts: boards(),
  },
  {
    id: 'bars', order: 5, group: 'house', material: 'gold', raise: 'bars',
    tag: 'barayacham (bars)', title: 'The barayacham (bars) of acacia overlaid with zahab (gold), chamash (five) to a side',
    words: ['barayach', 'zahab', 'itz'], keys: ['barayacham', 'barayach', 'bars', 'bar', 'thayakawan', 'middle', 'rings'],
    on: V('2:26:26-29', '2:40:18'),
    refs: 'Exodus 26:26–29; 40:18',
    measures: [['bars', '5 for the south, 5 for the north, 5 for the west', '26:26–27'], ['the thayakawan (middle) bar', 'through the midst of the boards from end to end', '26:28'], ['their rings', 'of zahab (gold), on the boards', '26:29'], ['overlaid', 'with zahab (gold)', '26:29']],
    note: '"{{Exodus 26:28}}" — the bars hold the boards to one wall; the middle bar runs the whole thirty cubits, the others the model draws in halves, two above and two below it.',
    elsewhere: { ref: 'Exodus 36:31–34; Numbers 3:36; 4:31', note: 'Their making; the sons of Merari carry them.' },
    assumed: 'The bars\' size and the height of each; that the upper and lower bars are halves (the text says only the middle one goes end to end); the rings are not drawn.',
    parts: bars(),
  },
  {
    id: 'mashakan', order: 6, group: 'house', material: 'veil', raise: 'mashakan',
    tag: 'yarayaihath (curtains) · mashakan', title: 'The mashakan (tabernacle) itself: ishar (ten) yarayaihath (curtains) with karawab (cherubim), coupled into one',
    words: ['mashakan', 'yarayaih', 'karawab', 'thakalath', 'aragaman', 'thawalai', 'shash'], keys: ['yarayaihath', 'yarayaih', 'curtains', 'curtain', 'lalaahath', 'loops', 'clasps', 'chabarath', 'machabarath', 'coupling', 'chabar', 'skillful'],
    on: V('2:26:1-6', '2:40:19'),
    refs: 'Exodus 26:1–6; 40:19',
    measures: [['curtains', `10, of fine twined shash (linen), ${CLOTHS.replace(' and fine twined shash (linen)', '')}, with karawab (cherubim)`, '26:1'], ['each curtain', '28 amah long, 4 broad — one measure', '26:2'], ['coupled', '5 to 5, with 50 loops of thakalath (blue) and 50 clasps of zahab (gold) — one mashakan', '26:3–6']],
    note: '"{{Exodus 26:1 | Moreover … cherubim}}" — this is what the text calls THE mashakan: not the boards but the ten curtains of cherubim, forty cubits by twenty-eight, laid over the boards so that the seam of the clasps falls where the veil hangs (26:33). From inside it is the ceiling; from outside almost none of it shows under the tent of goats\' hair.',
    elsewhere: { ref: 'Exodus 36:8–13; Numbers 4:25; 2 Samuel 7:2, 6; Psalm 104:2; Isaiah 40:22; Hebrews 9:11', note: 'Its making; the Gershonites carry it; "I have walked in a tent and in a tabernacle" (2 Samuel 7:6); the heavens stretched out like a curtain.' },
    assumed: 'How the twenty-eight lies over the twelve of the boards (eight hanging down each side, the sides a cubit thick with the bars); the cherubim are a woven pattern on the model\'s veil cloth.',
    parts: mashakanCurtains(),
  },
  {
    id: 'ahal', order: 7, group: 'house', material: 'goatshair', raise: 'ahal',
    tag: 'ahal (tent) · izayam (goats)\' hair', title: 'The ahal (tent) over the mashakan: ishathay (eleven) yarayaihath (curtains) of izayam (goats)\' hair',
    words: ['ahal', 'yarayaih', 'izayam'], keys: ['ahal', 'tent', 'izayam', 'goats', 'kapal', 'double', 'doubled', 'overhanging', 'forefront', 'mawal', 'achawar'],
    on: V('2:26:7-13', '2:40:19'),
    refs: 'Exodus 26:7–13; 40:19',
    measures: [['curtains', '11, of izayam (goats)\' hair', '26:7'], ['each curtain', '30 amah long, 4 broad', '26:8'], ['coupled', '5 by themselves and 6 by themselves; the sixth doubled over the forefront', '26:9'], ['loops · clasps', '50 · 50, of nachashath (brass)', '26:10–11'], ['what remains', 'the half curtain over the back; a cubit either side hangs over the sides', '26:12–13']],
    note: '"{{Exodus 26:7}}" — the black tent that is seen: thirty across covers the ten of the boards and hangs nine down either side, a cubit above the ground; forty-four long covers the thirty, hangs down the back to the ground and trails two more, and is doubled at the front over the door\'s head.',
    elsewhere: { ref: 'Exodus 36:14–18; Numbers 4:25; Song of Songs 1:5; Isaiah 54:2', note: '"I am dark … as the tents of Qadar (Kedar)" — goats\' hair tents; "enlarge the place of your tent".' },
    assumed: 'That the doubled curtain hangs before the door as a valance of two cubits and the remaining half curtain lies on the ground behind; the tent is drawn with straight sides, not pegged out (its pins and cords, 27:19; 35:18, are not drawn).',
    parts: ahalCurtains(),
  },
  {
    id: 'makasah', order: 8, group: 'house', material: 'ramskin', raise: 'makasah',
    tag: 'coverings · iwarath (skins)', title: 'The coverings: ayalam (rams)\' iwarath (skins) dyed red, and thachash (tachash) hides above',
    words: ['ayalam', 'iwarath', 'thachash', 'ahal'], keys: ['makasah', 'covering', 'coverings', 'ayalam', 'rams', 'iwarath', 'skins', 'hides', 'thachash', 'roof'],
    on: V('2:26:14', '2:40:19'),
    refs: 'Exodus 26:14; 40:19',
    measures: [['a covering for the tent', 'of ayalam (rams)\' iwarath (skins) dyed red', '26:14'], ['a covering above it', 'of thachash hides', '26:14'], ['measure', 'none is given', '']],
    note: '"{{Exodus 26:14}}" — two more layers, of hide, with no measure at all; 40:19 calls it "the roof of the mashakan". The model lays them over the top and a little down the sides.',
    elsewhere: { ref: 'Exodus 36:19; Numbers 4:6–14, 25; Ezekiel 16:10', note: 'Every holy thing was wrapped in tachash hide for the journey (Numbers 4); "I shod you with tachash" (Ezekiel 16:10).' },
    assumed: 'Their whole extent — a roof over the tent, with a short hang over the sides — is the model\'s.',
    parts: coverings(),
  },
  {
    id: 'door-screen', order: 9, group: 'house', material: 'gold', raise: 'screen',
    tag: 'screen of the pathach (door)', title: 'The screen for the pathach (door) of the tent, on chamash (five) pillars overlaid with zahab (gold)',
    words: ['pathach', 'masak', 'imawad', 'adan', 'nachashath', 'zahab'], keys: ['screen', 'pathach', 'door', 'imawaday', 'embroiderer', 'raqam'],
    on: V('2:26:36-37', '2:40:28'),
    refs: 'Exodus 26:36–37; 40:28',
    measures: [['the screen', `of ${CLOTHS}, the work of the embroiderer`, '26:36'], ['its pillars', '5, of acacia overlaid with zahab (gold); their hooks of gold', '26:37'], ['their sockets', '5, of nachashath (brass)', '26:37']],
    note: '"{{Exodus 26:36}}" — the east end of the boards is open; this hanging closes it, ten wide and ten high across the five pillars. The sockets under these pillars are brass, as the court\'s; the veil\'s within are silver. On foot, tap it to part it and go in.',
    elsewhere: { ref: 'Exodus 36:37–38; Numbers 3:25; 4:25; Leviticus 1:3; Hebrews 6:19', note: 'Its making; the Gershonites\' charge; "at the door of the tent of meeting" the offerings are brought.' },
    assumed: 'That the screen parts in the middle when opened; that it hangs from the pillars\' hooks over the whole opening.',
    parts: doorScreen(),
  },
  {
    id: 'shalachan', order: 10, group: 'inside', material: 'gold', raise: 'table',
    tag: 'shalachan (table)', title: 'The shalachan (table) of the lacham (bread) of the presence, on the tzapawan (north) side',
    words: ['shalachan', 'lacham', 'zahab', 'itz'], keys: ['shalachan', 'table', 'lacham', 'bread', 'dishes', 'kap', 'spoons', 'manaqayath', 'bowls', 'rim'],
    on: V('2:25:23-30', '2:26:35', '2:40:22-23'),
    refs: 'Exodus 25:23–30; 26:35; 40:22–23',
    measures: [['arak (length) · rachab (breadth)', '2 × 1 amah', '25:23'], ['qawamah (height)', '1½ amah', '25:23'], ['overlaid', 'with pure zahab (gold); a molding round it, a rim of a tapach (handbreadth) with its own molding', '25:24–25'], ['rings · poles', '4 of gold at the corners on the feet; poles of acacia overlaid with gold', '25:26–28'], ['on it', 'the lacham (bread) of the presence, always; its dishes, spoons, ladles and bowls of pure gold', '25:29–30'], ['its place', 'the north side, outside the veil', '26:35; 40:22']],
    note: '"{{Exodus 25:23 | You shall … qawamah}}" — a small table of gold on the north; "{{Exodus 25:30}}" The model sets the twelve loaves on it in two rows (Leviticus 24:5–6).',
    elsewhere: { ref: 'Exodus 37:10–16; Leviticus 24:5–9; 1 Samuel 21:6; 1 Kings 7:48; Ezekiel 41:22', note: 'Its making; the ordinance of the bread every sabbath; Dawad (David) given the holy bread at Nob; Shalamah\'s tables of gold.' },
    assumed: 'The loaves\' shape and the vessels\' places on it.',
    parts: [{ kind: 'table', x: TABLE.x, y: 0, z: TABLE.z, glb: 'temple-table' }],
  },
  {
    id: 'manawarah', order: 11, group: 'inside', material: 'gold', raise: 'lampstand',
    tag: 'manawarah (lampstand)', title: 'The manawarah (lampstand) of pure zahab (gold), shabai (seven) nayarawath (lamps), on the thayaman (south) side',
    words: ['manawarah', 'nayar', 'zahab'], keys: ['manawarah', 'lampstand', 'nayar', 'nayarath', 'lamp', 'lamps', 'branches', 'gabayai', 'gabayaiyam', 'cups', 'almond', 'shaqad', 'buds', 'bud', 'parach', 'flowers', 'kakar', 'talent', 'malaqach', 'snuffers', 'maawar'],
    on: V('2:25:31-40', '2:26:35', '2:27:20-21', '2:40:24-25'),
    refs: 'Exodus 25:31–40; 26:35; 27:20–21; 40:24–25',
    measures: [['of hammered work, one piece', 'base, shaft, cups, buds and flowers', '25:31, 36'], ['branches', '6 out of its sides, 3 and 3', '25:32'], ['cups like almond blossoms', '3 on each branch, 4 on the shaft, with their buds and flowers', '25:33–34'], ['nayar (lamps)', '7, to give light in front of it', '25:37'], ['a kakar (talent) of pure zahab (gold)', 'with all its vessels', '25:39'], ['its place', 'the south side, opposite the table', '26:35; 40:24'], ['its oil', 'pure beaten olive oil, a lamp to burn always, evening to morning', '27:20–21']],
    note: '"{{Exodus 25:31 | You shall … zahab}}" — the one light inside the tent: six branches and the shaft, a lamp on each of the seven, tended by Aharawan (Aaron) from evening to morning (27:21). Its height is not given.',
    elsewhere: { ref: 'Exodus 37:17–24; Leviticus 24:1–4; Numbers 8:1–4; 1 Kings 7:49; Zechariah 4:2; Revelation 1:12–13', note: 'Its making; the seven lamps lit to give light in front of it (Numbers 8:2); Shalamah\'s ten; the seven golden lampstands.' },
    assumed: 'Its height (3) and the form of its ornaments.',
    parts: [{ kind: 'lampstand', x: LAMP.x, y: 0, z: LAMP.z, h: 3, glb: 'temple-lampstand' }],
  },
  {
    id: 'qatarath', order: 12, group: 'inside', material: 'gold', raise: 'incense',
    tag: 'mazabach (altar) of qatarath (incense)', title: 'The mazabach (altar) of qatarath (incense): a cubit square, shanayam (two) high, of pure zahab (gold), before the parakath (veil)',
    words: ['mazabach', 'qatarath', 'qaran', 'zahab', 'parakath'], keys: ['qatarath', 'incense', 'maqatar', 'qatar', 'ribs', 'gag', 'molding'],
    on: V('2:30:1-10', '2:37:25-28', '2:40:26-27'),
    refs: 'Exodus 30:1–10; 37:25–28; 40:26–27',
    measures: [['arak (length) · rachab (breadth)', '1 × 1 amah, rabai (foursquare)', '30:2'], ['qawamah (height)', '2 amah; its horns of one piece', '30:2'], ['overlaid', 'top, sides and horns with pure zahab (gold); a molding round it', '30:3'], ['rings · poles', '2 rings of gold under the molding on two sides; poles of acacia overlaid with gold', '30:4–5'], ['its place', 'before the parakath (veil) that is by the arawan (ark)', '30:6; 40:26'], ['its use', 'sweet incense every morning and evening; no strange incense, no offering, no drink offering; atonement on its horns once a year', '30:7–10']],
    note: '"{{Exodus 30:2}}" — the gold altar stands in the holy place on the axis, before the veil, "where I will meet with you" (30:6): the smallest of the furniture, and the nearest to the ark on this side of the veil.',
    elsewhere: { ref: 'Exodus 40:5; Leviticus 16:12–13, 18; 1 Kings 6:20–22; Revelation 8:3–4; Hebrews 9:4', note: 'Shalamah\'s altar of cedar overlaid with gold before the oracle; the golden altar before the throne; the golden censer.' },
    assumed: 'Its molding\'s profile and the poles\' rest.',
    parts: incenseAltar(),
  },
  {
    id: 'parakath', order: 13, group: 'inside', material: 'gold', raise: 'veil',
    tag: 'parakath (veil)', title: 'The parakath (veil) with karawab (cherubim), on arabai (four) pillars, dividing the qadash (holy) from the most qadash (holy)',
    words: ['parakath', 'karawab', 'imawad', 'adan', 'kasap', 'thakalath', 'aragaman', 'thawalai', 'shash', 'qadash'], keys: ['parakath', 'veil', 'badal', 'separated', 'clasps'],
    on: V('2:26:31-35', '2:40:21'),
    refs: 'Exodus 26:31–35; 40:21',
    measures: [['the veil', `of ${CLOTHS}, with karawab (cherubim), skilful work`, '26:31'], ['its pillars', '4, of acacia overlaid with zahab (gold); hooks of gold', '26:32'], ['their sockets', '4, of kasap (silver)', '26:32'], ['its place', 'under the clasps — 20 amah from the door', '26:33'], ['what it divides', 'the qadash (holy) place from the most qadash (holy)', '26:33']],
    note: '"{{Exodus 26:33 | You shall nathan … idawath}}" — the veil hangs where the two sets of curtains are clasped together overhead, twenty in from the door: the holy place before it twenty long, the most holy behind it ten square. On foot, tap it to part it.',
    elsewhere: { ref: 'Exodus 36:35–36; Leviticus 16:2, 12–15; 2 Chronicles 3:14; Matthew 27:51; Hebrews 9:3; 10:19–20', note: 'Once a year, with blood and incense, within the veil (Leviticus 16); Shalamah\'s veil; the veil of the temple torn in two from the top.' },
    assumed: 'The pillars\' places across the ten; that the veil parts in the middle when opened (for the walker; the priest went in at its side).',
    parts: veil(),
  },
  {
    id: 'arawan', order: 14, group: 'inside', material: 'gold', raise: 'ark',
    tag: 'arawan (ark)', title: 'The arawan (ark) of the idawath (testimony), its kaparath (mercy seat) and shanayam (two) karawab (cherubim)',
    words: ['arawan', 'kaparath', 'karawab', 'idawath', 'zahab', 'itz'], keys: ['arawan', 'ark', 'kaparath', 'mercy', 'karawab', 'cherubim', 'cherub', 'idawath', 'testimony', 'poles', 'tabaith', 'kanapayam', 'wings', 'sakak', 'yaid', 'meet'],
    on: V('2:25:10-22', '2:26:33-34', '2:40:20-21'),
    refs: 'Exodus 25:10–22; 26:33–34; 40:20–21',
    measures: [['arak (length)', '2½ amah', '25:10'], ['rachab (breadth) · qawamah (height)', '1½ × 1½ amah', '25:10'], ['overlaid', 'with pure zahab (gold) within and without; a molding of gold round it', '25:11'], ['rings · poles', '4 rings of gold on its feet, 2 a side; poles of acacia overlaid with gold, never taken out', '25:12–15'], ['kaparath (mercy seat)', 'of pure gold, 2½ × 1½', '25:17'], ['karawab (cherubim)', '2, of hammered gold, at its two ends, one piece with it; wings spread upward covering the seat, faces toward each other and toward the seat', '25:18–20'], ['within it', 'the idawath (testimony)', '25:16, 21'], ['its place', 'within the parakath (veil), in the most holy place', '26:33–34; 40:21']],
    note: '"{{Exodus 25:22 | There I … karawab}}" — the one thing in the most holy place, and the first thing the text describes (25:10): a gold chest the size of a small trunk, the mercy seat on it with the two cherubim rising from its ends, their wings meeting over it.',
    elsewhere: { ref: 'Exodus 37:1–9; Numbers 10:33–36; 1 Samuel 4–6; 1 Kings 8:6–9; Hebrews 9:4–5; Revelation 11:19', note: 'Its making; it goes before the camp; taken by the Palashathayam (Philistines) and brought back; set under the great cherubim of Shalamah\'s oracle, the staves drawn out.' },
    assumed: 'The cherubim\'s form (they are drawn as the temple\'s, small); it stands in the middle of the most holy place, its length east to west.',
    parts: [{ kind: 'ark', x: ARK.x, y: 0, z: ARK.z, glb: 'temple-ark' }],
  },
  {
    id: 'inan', order: 15, group: 'sky', material: 'cloud', raise: 'inan',
    tag: 'inan (cloud)', title: 'The inan (cloud) on the mashakan by day, and ash (fire) in it by night',
    words: ['inan', 'kabawad', 'mawaid'], keys: ['inan', 'cloud', 'kabawad', 'glory', 'malaa', 'filled', 'masai', 'journeys'],
    on: V('2:40:34-38'),
    refs: 'Exodus 40:34–38',
    measures: [['the cloud', 'covered the ahal (tent) of mawaid', '40:34'], ['the kabawad (glory)', 'filled the mashakan — Mashah could not go in', '40:34–35'], ['when it lifted', 'the children of Yashar-Al set out; when it stayed, they stayed', '40:36–37'], ['by day · by night', 'the cloud on the tabernacle; fire in the cloud', '40:38']],
    note: '"{{Exodus 40:34}}" — the end of the raising and the beginning of the journeys: what the camp saw over the tent every day it stood.',
    elsewhere: { ref: 'Exodus 13:21–22; 33:9–10; Numbers 9:15–23; 1 Kings 8:10–11; Ezekiel 43:4–5', note: 'The pillar of cloud and fire; the cloud at the door of the tent when Mashah went in; the cloud that filled Shalamah\'s house so the priests could not stand to minister.' },
    assumed: 'Its shape entirely — a pale mass over the tent, hatched as the model\'s own; it is drawn always, as 40:38 says it was, throughout their journeys.',
    idealized: 'The whole cloud.',
    parts: cloud(), sheet: false,
  },
  // the Levites about the mashakan (Numbers 1:53; 3:21–38)
  ...[
    ['levites-east', 'east', 'Mashah (Moses), Aharawan (Aaron) and his banay (sons) — before the mashakan eastward', V('4:3:38'), 'Numbers 3:38', [['who', 'Mashah (Moses), Aharawan (Aaron) and his sons', '3:38'], ['their charge', 'the requirements of the maqadash (sanctuary); the stranger who comes near shall die', '3:38']], '"{{Numbers 3:38 | Those who … banay}}" — the east side, before the door, is the priests\' own: from here the way runs in through the gate to the altar and the tent.', ['mashah', 'aharawan', 'maqadash']],
    ['levites-south', 'south', 'The banay (sons) of Qahath (Kohath) — the south side', V('4:3:27-32'), 'Numbers 3:27–32', [['number', '8,600, from a month old', '3:28'], ['their charge', 'the arawan (ark), the shalachan (table), the manawarah (lampstand), the altars, the vessels of the holy place, the screen', '3:31'], ['their prince', 'Alayatzapan (Elizaphan) the son of Izayaal (Uzziel)', '3:30']], '"{{Numbers 3:29}}" — the Kohathites, who carry the holy things themselves on their shoulders, camp on the south, the lampstand\'s side.', ['lawayay', 'machanah']],
    ['levites-west', 'west', 'The banay (sons) of Garashawan (Gershon) — behind the mashakan westward', V('4:3:21-26'), 'Numbers 3:21–26', [['number', '7,500, from a month old', '3:22'], ['their charge', 'the mashakan, the ahal (tent), its covering, the screen of the door, the hangings of the court, the screen of the gate, the cords', '3:25–26'], ['their prince', 'Alayasap (Eliasaph) the son of Laal (Lael)', '3:24']], '"{{Numbers 3:23}}" — the Gershonites, who carry all the cloth, camp behind the tent on the west.', ['lawayay', 'machanah']],
    ['levites-north', 'north', 'The banay (sons) of Mararay (Merari) — the north side', V('4:3:33-37'), 'Numbers 3:33–37', [['number', '6,200, from a month old', '3:34'], ['their charge', 'the boards, the bars, the pillars, the sockets, all the instruments; the pillars of the court, their sockets, pins and cords', '3:36–37'], ['their prince', 'Tzawarayaal (Zuriel) the son of Abayahayal (Abihail)', '3:35']], '"{{Numbers 3:35 | They shall … mashakan}}" — the Merarites, who carry the frame, camp on the north, the table\'s side.', ['lawayay', 'machanah']],
  ].map(([id, side, title, on, refs, measures, note, words], i) => ({
    id, order: 16 + i, group: 'levites', material: 'goatshair', raise: 'camp', sheet: false,
    tag: `Lawayay (Levites) · ${side}`, title,
    words, keys: [],
    on, refs, measures, note,
    elsewhere: { ref: 'Numbers 1:47–53; 4:1–33; 18:1–7; 1 Chronicles 23:24–32', note: 'The Levites are not numbered with the tribes but set over the tabernacle, to camp about it that there be no wrath (1:53); Numbers 4 gives each family its burden for the march.' },
    assumed: 'The Levites\' tents are drawn as a small company close about the court (about sixty cubits out); their number and the room they took the model cannot show.',
    idealized: 'The tents and the standard.',
    parts: LEV(side),
  })),
  // the twelve about them by their standards (Numbers 2)
  ...[
    ['judah',     'east',  0,  'Yahawadah (Judah)',       'Nachashawan (Nahshon) the son of Imayanadab (Amminadab)', '74,600',  V('4:2:3-4'),   'Numbers 2:3–4',   'the camp of Yahawadah — 186,400 — sets out first (2:9)'],
    ['issachar',  'east', -1,  'Yashashakar (Issachar)',  'Nathanaal (Nethanel) the son of Tzawair (Zuar)',          '54,400',  V('4:2:5-6'),   'Numbers 2:5–6',   'with Yahawadah, first'],
    ['zebulun',   'east',  1,  'Zabawalawan (Zebulun)',   'Alayaab (Eliab) the son of Chalan (Helon)',               '57,400',  V('4:2:7-9'),   'Numbers 2:7–9',   'with Yahawadah, first'],
    ['reuben',    'south', 0,  'Raawaban (Reuben)',        'Alayatzawar (Elizur) the son of Shadayaawar (Shedeur)',   '46,500',  V('4:2:10-11'), 'Numbers 2:10–11', 'the camp of Raawaban — 151,450 — sets out second (2:16)'],
    ['simeon',    'south', 1,  'Shamaiwan (Simeon)',       'Shalamayaal (Shelumiel) the son of Tzawarayashaday (Zurishaddai)', '59,300', V('4:2:12-13'), 'Numbers 2:12–13', 'with Raawaban, second'],
    ['gad',       'south', -1, 'Gad (Gad)',                'Alayasap (Eliasaph) the son of Raiwaal (Reuel)',           '45,650',  V('4:2:14-16'), 'Numbers 2:14–16', 'with Raawaban, second'],
    ['ephraim',   'west',  0,  'Aparayam (Ephraim)',       'Alayashamai (Elishama) the son of Imayahawad (Ammihud)',   '40,500',  V('4:2:18-19'), 'Numbers 2:18–19', 'the camp of Aparayam — 108,100 — sets out third (2:24)'],
    ['manasseh',  'west',  1,  'Manashah (Manasseh)',      'Gamalayaal (Gamaliel) the son of Padahatzawar (Pedahzur)', '32,200',  V('4:2:20-21'), 'Numbers 2:20–21', 'with Aparayam, third'],
    ['benjamin',  'west', -1,  'Banayamayan (Benjamin)',   'Abay-Dan (Abidan) the son of Gadainay (Gideoni)',          '35,400',  V('4:2:22-24'), 'Numbers 2:22–24', 'with Aparayam, third'],
    ['dan',       'north', 0,  'Dan (Dan)',                'Achayaizar (Ahiezer) the son of Imayashaday (Ammishaddai)', '62,700', V('4:2:25-26'), 'Numbers 2:25–26', 'the camp of Dan — 157,600 — sets out last (2:31)'],
    ['asher',     'north', 1,  'Ashar (Asher)',            'Pagaiyaal (Pagiel) the son of Ikaran (Ochran)',            '41,500',  V('4:2:27-28'), 'Numbers 2:27–28', 'with Dan, last'],
    ['naphtali',  'north', -1, 'Napathalay (Naphtali)',    'Achayarai (Ahira) the son of Iyanan (Enan)',               '53,400',  V('4:2:29-31'), 'Numbers 2:29–31', 'with Dan, last'],
  ].map(([id, side, slot, name, prince, number, on, refs, march], i) => ({
    id, order: 20 + i, group: 'camp', material: 'goatshair', raise: 'camp', sheet: false,
    tag: `${name.split(' ')[0]} · ${side}`, title: `The matah (tribe) of ${name} — the ${side} side${slot === 0 ? `, the dagal (standard) of the machanah (camp) of ${name}` : ''}`,
    words: ['machanah', 'dagal', 'matah', 'nashayaa'], keys: [name.split(' ')[0].toLowerCase()],
    on, refs,
    measures: [['side', `the ${side}${slot === 0 ? ' — under its own dagal (standard)' : `, next to ${['Yahawadah', 'Raawaban', 'Aparayam', 'Dan'][['east', 'south', 'west', 'north'].indexOf(side)]}`}`, refs.split(' ')[1].split('–')[0]], ['nashayaa (prince)', prince, ''], ['numbered', number, ''], ['the march', march, '']],
    note: `The children of ${name} "shall chanah (encamp) every ayash (man) by his own dagal (standard), with the banners of their fathers' house" (2:2) — on the ${side} of the tent, ${slot === 0 ? 'the middle tribe of three, whose standard the two beside it follow' : 'beside the standard of the middle tribe'}.`,
    elsewhere: { ref: 'Numbers 1:20–46; 10:11–28; Genesis 49; Deuteronomy 33; Revelation 7:4–8; 21:12–13', note: 'The census the camp is drawn from (Numbers 1); the order of the march (Numbers 10); the blessings of the tribes; the twelve gates of the city, three on a side.' },
    assumed: 'Each tribe is a company of tents about two hundred cubits from the court, three tribes to a side in the text\'s order — "at a distance" (2:2) is not measured, and the tents stand for tens of thousands the model cannot draw. The standards\' colours and devices are not given and are drawn plain.',
    idealized: 'Every tent and standard.',
    parts: TRIBE(side, slot),
  })),
];

export function pieceById(id) { return PIECES.find((p) => p.id === id) || null; }
export const GROUPS = { court: 'The chatzar (court)', house: 'The mashakan (tabernacle) and the ahal (tent)', inside: 'Within the tent', sky: 'Over it', levites: 'The Lawayay (Levites)', camp: 'The machanah (camp) of the twelve' };

// ── The passages the model is drawn from ─────────────────────────────────────
export const PASSAGES = [
  { bookId: 2, book: 'Exodus', chapter: 25, from: 8, to: 40, label: 'Exodus 25:8–40' },
  { bookId: 2, book: 'Exodus', chapter: 26, from: 1, to: 37, label: 'Exodus 26' },
  { bookId: 2, book: 'Exodus', chapter: 27, from: 1, to: 21, label: 'Exodus 27' },
  { bookId: 2, book: 'Exodus', chapter: 30, from: 1, to: 21, label: 'Exodus 30:1–21' },
  { bookId: 2, book: 'Exodus', chapter: 40, from: 17, to: 38, label: 'Exodus 40:17–38' },
  { bookId: 4, book: 'Numbers', chapter: 2, from: 1, to: 34, label: 'Numbers 2' },
  { bookId: 4, book: 'Numbers', chapter: 3, from: 21, to: 38, label: 'Numbers 3:21–38' },
];
export const ALL_REFS = 'Exodus 25:8–27:21; 30:1–21; 40:17–38; Numbers 2:1–34; 3:21–38';
export const passagesFor = () => PASSAGES;
export const refsFor = () => ALL_REFS;

/** Which piece a "translit (gloss)" word in the passage belongs to: settled by WHERE it stands — book, chapter and verse — first, then a piece's own keys. */
const R = (book, chapter, verses, words, piece) => ({ book, chapter, verses, words, piece });
const vs = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const RULES = [
  R(2, 25, vs(10, 22), ['arawan', 'kaparath', 'karawab', 'idawath', 'zahab', 'itz', 'amah', 'amahathayam', 'tabaith', 'poles', 'kanapayam', 'panayam', 'qatzah', 'qatzahawath', 'arak', 'rachab', 'qawamah', 'yaid'], 'arawan'),
  R(2, 25, vs(23, 30), ['shalachan', 'lacham', 'zahab', 'itz', 'tabaith', 'poles', 'rim', 'tapach', 'dishes', 'kap', 'ladles', 'manaqayath', 'arak', 'rachab', 'qawamah', 'amah', 'amahathayam'], 'shalachan'),
  R(2, 25, vs(31, 40), ['manawarah', 'nayar', 'zahab', 'branches', 'gabayai', 'gabayaiyam', 'shaqad', 'almond', 'bud', 'buds', 'parach', 'yarak', 'kakar', 'malaqach', 'maqashah', 'thabanayath'], 'manawarah'),
  R(2, 26, vs(1, 6), ['mashakan', 'yarayaih', 'yarayaihath', 'cherubim', 'thakalath', 'aragaman', 'shanay', 'shash', 'shazar', 'lalaahath', 'clasps', 'chabar', 'chabarath', 'machabarath', 'zahab', 'arak', 'rachab', 'madah', 'amah', 'maishah'], 'mashakan'),
  R(2, 26, vs(7, 13), ['yarayaih', 'yarayaihath', 'ahal', 'izayam', 'lalaahath', 'clasps', 'nachashath', 'chabar', 'chabarath', 'kapal', 'shashay', 'mawal', 'achawar', 'idap', 'kasah', 'tzaday', 'arak', 'rachab', 'amah', 'madah'], 'ahal'),
  R(2, 26, [14], ['makasah', 'ahal', 'ayalam', 'iwarath', 'thachash', 'adam'], 'makasah'),
  R(2, 26, vs(15, 25), ['qarash', 'qarashayam', 'qarashay', 'mashakan', 'itz', 'imad', 'tenons', 'adanay', 'adanayam', 'kasap', 'yarakah', 'maqatzaih', 'maqatzawaith', 'tabaith', 'raash', 'arak', 'rachab', 'amahawath', 'amah'], 'boards'),
  R(2, 26, vs(26, 29), ['barayacham', 'barayach', 'qarashay', 'qarashayam', 'itz', 'zahab', 'tabaith', 'thayakawan', 'qatzah', 'mashakan'], 'bars'),
  R(2, 26, vs(31, 35), ['parakath', 'karawab', 'imawaday', 'zahab', 'adanay', 'kasap', 'clasps', 'badal', 'qadash', 'thakalath', 'aragaman', 'shanay', 'shash', 'shazar', 'maishah', 'waw'], 'parakath'),
  R(2, 26, vs(33, 34), ['arawan', 'idawath', 'kaparath'], 'arawan'), R(2, 26, [35], ['shalachan', 'tzapawan'], 'shalachan'), R(2, 26, [35], ['manawarah', 'thayaman'], 'manawarah'),
  R(2, 26, vs(36, 37), ['screen', 'pathach', 'ahal', 'imawaday', 'zahab', 'adanay', 'nachashath', 'thakalath', 'aragaman', 'thawalai', 'shash', 'shazar', 'raqam', 'maishah', 'waw'], 'door-screen'),
  R(2, 27, vs(1, 8), ['mazabach', 'qaran', 'nachashath', 'itz', 'makabar', 'rashath', 'tabaith', 'poles', 'sayar', 'yai', 'machathah', 'kalay', 'nabab', 'ledge', 'arak', 'rachab', 'qawamah', 'rabai', 'amahawath', 'panah', 'tzalaith', 'dashan'], 'mazabach'),
  R(2, 27, vs(9, 13), ['chatzar', 'mashakan', 'qalaiyam', 'imawadayam', 'imawad', 'adan', 'nachashath', 'kasap', 'waway', 'chashaq', 'shash', 'shazar', 'paah', 'arak', 'rachab', 'maah', 'amah', 'nagab', 'tzapawan', 'yam', 'qadam'], 'court'),
  R(2, 27, vs(14, 16), ['shair', 'screen', 'qalaiyam', 'kathap', 'imawad', 'adan', 'thakalath', 'aragaman', 'shanay', 'shash', 'shazar', 'raqam', 'embroiderer', 'chatzar', 'amah'], 'gate-screen'),
  R(2, 27, vs(17, 19), ['imawaday', 'chatzar', 'chashaq', 'kasap', 'waw', 'adan', 'nachashath', 'arak', 'rachab', 'qawamah', 'maah', 'amahawath', 'shash', 'shazar', 'kalay', 'mashakan', 'ibadah', 'yathadath'], 'court'),
  R(2, 27, vs(20, 21), ['nayar', 'maawar', 'shaman', 'zayath', 'ahal', 'mawaid', 'parakath', 'idawath', 'aharawan', 'irak', 'irab', 'baqar'], 'manawarah'),
  R(2, 30, vs(1, 10), ['mazabach', 'qatarath', 'maqatar', 'qatar', 'qaran', 'zahab', 'itz', 'tabaith', 'poles', 'gag', 'qayar', 'molding', 'ribs', 'tzad', 'arak', 'rachab', 'qawamah', 'rabai', 'amah', 'amahathayam', 'parakath', 'arawan', 'idawath', 'kaparath', 'yaid', 'aharawan', 'nayarath', 'kapar'], 'qatarath'),
  R(2, 30, vs(17, 21), ['basin', 'nachashath', 'kan', 'rachatz', 'mayam', 'ahal', 'mawaid', 'mazabach', 'aharawan', 'yad', 'ragal', 'mawath', 'nagash', 'sharath'], 'basin'),
  R(2, 40, [17], ['mashakan', 'qawam'], 'boards'), R(2, 40, [18], ['adan', 'qarash', 'imawad', 'mashakan', 'qawam'], 'boards'), R(2, 40, [18], ['barayach'], 'bars'),
  R(2, 40, [19], ['ahal'], 'ahal'), R(2, 40, [19], ['roof', 'mashakan'], 'makasah'),
  R(2, 40, vs(20, 21), ['arawan', 'idawath', 'kaparath', 'poles', 'mashakan'], 'arawan'), R(2, 40, [21], ['parakath', 'screen'], 'parakath'),
  R(2, 40, vs(22, 23), ['shalachan', 'lacham', 'irak', 'ahal', 'mawaid', 'tzapawan', 'parakath', 'yarak'], 'shalachan'),
  R(2, 40, vs(24, 25), ['manawarah', 'nayarath', 'ahal', 'mawaid', 'shalachan', 'yarak'], 'manawarah'),
  R(2, 40, vs(26, 27), ['zahab', 'mazabach', 'qatarath', 'parakath', 'ahal', 'mawaid'], 'qatarath'),
  R(2, 40, [28], ['screen', 'pathach', 'mashakan'], 'door-screen'),
  R(2, 40, [29], ['mazabach', 'pathach', 'mashakan', 'mawaid', 'ilah', 'manachah'], 'mazabach'),
  R(2, 40, vs(30, 32), ['basin', 'mayam', 'rachatz', 'ahal', 'mawaid', 'mazabach', 'yad', 'ragal', 'qarab'], 'basin'),
  R(2, 40, [33], ['chatzar', 'mashakan', 'mazabach', 'qawam', 'malaakah', 'kalah'], 'court'), R(2, 40, [33], ['screen', 'shair'], 'gate-screen'),
  R(2, 40, vs(34, 38), ['inan', 'kabawad', 'ahal', 'mawaid', 'mashakan', 'malaa', 'kasah', 'ash', 'masai', 'yawamam', 'layal', 'nasai', 'ilah'], 'inan'),
  R(4, 2, vs(1, 2), ['chanah', 'dagal', 'machanah', 'ahal', 'mawaid', 'banners', 'ab', 'bayath'], 'judah'),
  R(4, 2, vs(3, 4), ['yahawadah', 'nachashawan', 'imayanadab', 'qadam', 'sunrise', 'dagal', 'machanah', 'chanah', 'nashayaa', 'division', 'divisions', 'paqad'], 'judah'),
  R(4, 2, vs(5, 6), ['yashashakar', 'nathanaal', 'tzawair', 'chanah', 'matah', 'nashayaa', 'division', 'paqad'], 'issachar'),
  R(4, 2, vs(7, 9), ['zabawalawan', 'alayaab', 'chalan', 'matah', 'nashayaa', 'division', 'paqad', 'yahawadah', 'machanah', 'nasai', 'raashawan'], 'zebulun'),
  R(4, 2, vs(10, 11), ['raawaban', 'alayatzawar', 'shadayaawar', 'thayaman', 'dagal', 'machanah', 'nashayaa', 'division', 'paqad'], 'reuben'),
  R(4, 2, vs(12, 13), ['shamaiwan', 'shalamayaal', 'tzawarayashaday', 'chanah', 'matah', 'nashayaa', 'division', 'paqad'], 'simeon'),
  R(4, 2, vs(14, 16), ['gad', 'alayasap', 'raiwaal', 'matah', 'nashayaa', 'division', 'paqad', 'raawaban', 'machanah', 'tzabaa', 'nasai', 'shanay'], 'gad'),
  R(4, 2, [17], ['ahal', 'mawaid', 'nasai', 'machanah', 'machanahath', 'lawayay', 'thawak', 'chanah', 'dagal'], 'levites-east'),
  R(4, 2, vs(18, 19), ['aparayam', 'alayashamai', 'imayahawad', 'yam', 'dagal', 'machanah', 'nashayaa', 'division', 'paqad'], 'ephraim'),
  R(4, 2, vs(20, 21), ['manashah', 'gamalayaal', 'padahatzawar', 'matah', 'nashayaa', 'division', 'paqad'], 'manasseh'),
  R(4, 2, vs(22, 24), ['banayamayan', 'abay-dan', 'gadainay', 'matah', 'nashayaa', 'tzabaa', 'paqad', 'aparayam', 'machanah', 'nasai', 'shalayashay'], 'benjamin'),
  R(4, 2, vs(25, 26), ['dan', 'achayaizar', 'imayashaday', 'tzapawan', 'dagal', 'machanah', 'nashayaa', 'division', 'paqad'], 'dan'),
  R(4, 2, vs(27, 28), ['ashar', 'pagaiyaal', 'ikaran', 'chanah', 'matah', 'nashayaa', 'division', 'paqad'], 'asher'),
  R(4, 2, vs(29, 31), ['napathalay', 'achayarai', 'iyanan', 'matah', 'nashayaa', 'division', 'paqad', 'dan', 'machanah', 'nasai', 'acharawan', 'dagal'], 'naphtali'),
  R(4, 2, vs(32, 34), ['paqad', 'machanahath', 'tzabaa', 'lawayay', 'chanah', 'dagal', 'nasai', 'mashapachah', 'ab', 'bayath'], 'judah'),
  R(4, 3, vs(21, 26), ['garashawan', 'garashanay', 'labanay', 'shimeites', 'alayasap', 'laal', 'mashakan', 'ahal', 'mawaid', 'screen', 'pathach', 'qalaiy', 'chatzar', 'mazabach', 'mayathar', 'chanah', 'paqad', 'mashamarath', 'nashayaa', 'mashapachah', 'mashapachahath'], 'levites-west'),
  R(4, 3, vs(27, 32), ['qahath', 'qahathay', 'imaramay', 'yatzaharay', 'chabarawanay', 'izayaalay', 'alayatzapan', 'izayaal', 'alaizar', 'aharawan', 'arawan', 'shalachan', 'manawarah', 'mazabachath', 'kalay', 'qadash', 'screen', 'thayaman', 'chanah', 'mashamarath', 'nashayaa', 'lawayay', 'paqadah', 'mashapachah', 'mashapachahath'], 'levites-south'),
  R(4, 3, vs(33, 37), ['mararay', 'machalay', 'mawashay', 'tzawarayaal', 'abayahayal', 'qarashay', 'barayach', 'imawad', 'imawaday', 'adan', 'kalay', 'chatzar', 'yathad', 'mayathar', 'tzapawan', 'chanah', 'mashamarath', 'nashayaa', 'mashapachah', 'mashapachahath'], 'levites-north'),
  R(4, 3, [38], ['mashah', 'aharawan', 'banay', 'mashakan', 'mawaid', 'sunrise', 'maqadash', 'mashamarath', 'chanah', 'panayam', 'mawath'], 'levites-east'),
];
const KEY_INDEX = PIECES.flatMap((p) => p.keys.map((k) => [k, p.id]));
export function pieceForWord(word, book, chapter, verse) {
  if (book !== 2 && book !== 4) return null;
  const w = word.toLowerCase();
  for (const r of RULES) if (r.book === book && r.chapter === chapter && r.verses.includes(verse) && r.words.some((k) => w === k || w.startsWith(k))) return r.piece;
  for (const [k, id] of KEY_INDEX) if (w === k) return id;
  for (const [k, id] of KEY_INDEX) if (k.length > 4 && w.startsWith(k)) return id;
  return null;
}

// ── Timelines ────────────────────────────────────────────────────────────────
// RAISE — the order Mashah set it up in (Exodus 40:17–33), then the cloud, then the camp.
export const RAISE_PHASES = [
  { from: 0,   key: 'command',   caption: '{{Exodus 25:1}} {{Exodus 25:8}} {{Exodus 25:9}}', ref: 'Exodus 25:1, 8–9' },
  { from: 6, key: 'day',       caption: '{{Exodus 40:17}}', ref: 'Exodus 40:17' },
  { from: 11, key: 'boards',    caption: '{{Exodus 40:18}} {{Exodus 26:16 | Ishar … qarash}}; {{Exodus 26:18}}', ref: 'Exodus 40:18; 26:16, 18' },
  { from: 17, key: 'bars',      caption: '{{Exodus 26:26 | You shall … mashakan}}; {{Exodus 26:28}} {{Exodus 26:29}}', ref: 'Exodus 26:26–29' },
  { from: 22, key: 'mashakan',  caption: '{{Exodus 40:19}} {{Exodus 26:1 | Moreover … cherubim}}. {{Exodus 26:2 | The arak … amah}}.', ref: 'Exodus 40:19; 26:1–2' },
  { from: 27, key: 'ahal',      caption: '{{Exodus 26:7}} {{Exodus 26:8}} {{Exodus 26:12}}', ref: 'Exodus 26:7–8, 12' },
  { from: 32, key: 'makasah',   caption: '{{Exodus 26:14}}', ref: 'Exodus 26:14' },
  { from: 37, key: 'ark',       caption: '{{Exodus 40:20}} {{Exodus 25:10 | They shall … amahathayam}}. {{Exodus 25:22 | There I … karawab}}.', ref: 'Exodus 40:20; 25:10, 22' },
  { from: 43, key: 'veil',      caption: '{{Exodus 40:21}} {{Exodus 26:33 | You shall nathan … idawath}}.', ref: 'Exodus 40:21; 26:33' },
  { from: 48, key: 'table',     caption: '{{Exodus 40:22}} {{Exodus 25:23 | You shall … qawamah}}. {{Exodus 25:30}}', ref: 'Exodus 40:22; 25:23, 30' },
  { from: 53, key: 'lampstand', caption: '{{Exodus 40:24}} {{Exodus 25:31 | You shall … zahab}}. {{Exodus 25:37}}', ref: 'Exodus 40:24; 25:31, 37' },
  { from: 58, key: 'incense',   caption: '{{Exodus 40:26}} {{Exodus 30:2}} {{Exodus 30:6 | You shall … idawath}}.', ref: 'Exodus 40:26; 30:2, 6' },
  { from: 63, key: 'screen',    caption: '{{Exodus 40:28}} {{Exodus 26:36}} {{Exodus 26:37}}', ref: 'Exodus 40:28; 26:36–37' },
  { from: 68, key: 'altar',     caption: '{{Exodus 40:29 | He shawam … mawaid}}. {{Exodus 27:1}} {{Exodus 27:2}}', ref: 'Exodus 40:29; 27:1–2' },
  { from: 73, key: 'basin',     caption: '{{Exodus 40:30}} {{Exodus 30:19}} {{Exodus 30:20 | When they … mawath}}.', ref: 'Exodus 40:30; 30:19–20' },
  { from: 78, key: 'court',     caption: '{{Exodus 40:33}} {{Exodus 27:18}} {{Exodus 27:16 | For the shair … arabai}}.', ref: 'Exodus 40:33; 27:16, 18' },
  { from: 84, key: 'inan',      caption: '{{Exodus 40:34}} {{Exodus 40:35}} {{Exodus 40:38}}', ref: 'Exodus 40:34–38' },
  { from: 91, key: 'camp',      caption: '{{Numbers 2:2}} {{Numbers 2:3 | Those who … Yahawadah}}; {{Numbers 3:38 | Those who … banay}}.', ref: 'Numbers 2:2–3; 3:38' },
  { from: 97, key: 'camps',     caption: '{{Numbers 2:10 | On the … Raawaban}}; {{Numbers 2:18 | On the … Aparayam}}; {{Numbers 2:25 | On the … Dan}}. {{Numbers 2:17}}', ref: 'Numbers 2:10, 17, 18, 25' },
  { from: 102, key: 'march',     caption: '{{Numbers 2:9 | They shall … raashawan}}. {{Numbers 2:31 | They shall … dagal}}. {{Numbers 2:34}}', ref: 'Numbers 2:9, 31, 34' },
];
export const RAISE_DURATION = 106;
export const RAISE_CAMERA = [
  [0,   [260, 120, 210],  [0, 0, 0]],                          // the word on the mountain: the bare plain where the sanctuary will stand, from high and far
  [6,   [150, 70, 120],   [0, 3, 0]],                          // the bare court's ground, from the south-east
  [11,   [12, 12, 34],     [-25, 5, 0]],                        // the boards go up
  [17,  [-14, 7, 20],     [-25, 5, 0]],                        // the bars, close
  [22,  [6, 18, 30],      [-25, 8, 0]],                        // the curtains spread over
  [27,  [4, 16, 34],      [-25, 8, 0]],                        // the goats' hair tent
  [32,  [-2, 24, 30],     [-25, 9, 0]],                        // the coverings
  [37,  [-31.6, 3.6, 2.8], [-35, 1.8, 0]],                     // in the most holy place: the ark
  [43,  [-19, 3.6, 0],    [-30, 4, 0]],                        // the veil from the holy place
  [48,  [-16.5, 3.2, 1.2], [-20, 1.4, -3.5]],                  // the table, north
  [53,  [-16.5, 3.2, -1.2], [-20, 2, 3.5]],                    // the lampstand, south
  [58,  [-22, 3.4, 2],    [-27, 1.4, 0]],                      // the gold altar before the veil
  [63,  [2, 4.2, 7],      [-10, 5, 0]],                        // the screen of the door, from outside
  [68,  [24, 6, 14],      [12, 1.8, 0]],                       // the altar
  [73,  [4, 3.4, 5],      [-3, 1.6, 0]],                       // the basin
  [78,  [96, 46, 74],     [0, 3, 0]],                          // the court goes up around it
  [84,  [64, 26, 48],     [-25, 9, 0]],                        // the cloud
  [91,  [420, 260, 380],  [0, 0, 0]],                          // the camp about it
  [97,  [30, 560, 320],   [0, 0, 0]],                          // the four camps from above
  [102,  [560, 320, 440],  [0, 0, 0]],
  [106, [640, 360, 500],  [0, 0, 0]],
];

// ROAM — no story: the finished mashakan and its camp, and the viewer walks where they will.
export const ROAM_EYE = 3.4;
export const ROAM_START = { pos: [57, LEVEL + ROAM_EYE, 0], look: [0, LEVEL + ROAM_EYE, 0] };   // before the gate of the court (the priests' tents behind), facing the tent
export const ROAM_PHASES = [{ from: 0, key: 'roam', caption: 'Walk where you will — through the screen of the shair (gate), past the mazabach (altar) and the basin, through the screen of the pathach (door) into the tent and, past the parakath (veil), to the arawan (ark); or out to the machanah (camp). Tap a part for its details; tap a screen or the veil again to part it.', ref: '' }];
export const ROAM_ENTER = {
  'gate-screen': { pos: [56, ROAM_EYE, 0], look: [0, ROAM_EYE, 0], open: 'gate' },
  'door-screen': { pos: [-6, ROAM_EYE, 0], look: [-30, ROAM_EYE, 0], open: 'door' },
  parakath: { pos: [-26, ROAM_EYE, 0], look: [-40, ROAM_EYE, 0], open: 'veil' },
};

export const MODES = {
  walk: { label: 'Raise', phases: RAISE_PHASES, duration: RAISE_DURATION, camera: RAISE_CAMERA, xray: [[37, 63]] },
  roam: { label: 'Roam', phases: ROAM_PHASES, duration: 1, camera: [[0, ROAM_START.pos, ROAM_START.look]], xray: [], free: true },
};
const TL = timelineFor(MODES);
export const { phaseAt, xrayAt, cameraAt } = TL;
const RAISE_AT = Object.fromEntries(RAISE_PHASES.map((p) => [p.key, p.from]));
/** Each piece goes up at its phase of the raising (Exodus 40's order); on foot everything stands. */
export function progressAt(mode, piece, t) {
  if (piece.modes && !piece.modes.includes(mode)) return 0;
  if (mode !== 'walk') return 1;
  const at = RAISE_AT[piece.raise] ?? 0;
  return smooth((t - at + 0.8) / 2.2);   // begins a breath before its caption, so it stands when the eye arrives
}
/** The screens and the veil stay drawn in the story (the eye is placed within); on foot the walker parts them. */
export function openAt() { return 0; }
const MARK_LABELS = { walk: { command: 'maqadash', boards: 'qarash', mashakan: 'yarayaih', ahal: 'ahal', ark: 'arawan', veil: 'parakath', table: 'shalachan', lampstand: 'manawarah', screen: 'screen', altar: 'mazabach', basin: 'basin', court: 'chatzar', inan: 'inan', camp: 'machanah' } };
export const marksFor = (mode) => TL.marksFor(mode, MARK_LABELS);
/** The pieces the chips row shows, in the way's order (gate → ark, then the camp). */
export const CHIP_ORDER = ['court', 'gate-screen', 'mazabach', 'basin', 'boards', 'bars', 'mashakan', 'ahal', 'makasah', 'door-screen', 'shalachan', 'manawarah', 'qatarath', 'parakath', 'arawan', 'inan', 'levites-east', 'levites-south', 'levites-west', 'levites-north', 'judah', 'issachar', 'zebulun', 'reuben', 'simeon', 'gad', 'ephraim', 'manasseh', 'benjamin', 'dan', 'asher', 'naphtali'];
/** Where the eye goes when a piece is chosen (the focus target and a fitting distance), in cubits. */
export function focusFor(id) {
  const F = {
    court: [[0, 3, 0], 150], 'gate-screen': [[50, 3, 0], 34], mazabach: [[12, 2, 0], 16], basin: [[-3, 1.4, 0], 9],
    boards: [[-25, 5, 0], 46], bars: [[-25, 5, 8], 30], mashakan: [[-25, 8, 0], 48], ahal: [[-25, 8, 0], 50], makasah: [[-25, 10, 0], 46],
    'door-screen': [[-10, 5, 0], 22], shalachan: [[-20, 1.4, -3.5], 6], manawarah: [[-20, 1.8, 3.5], 6], qatarath: [[-27, 1.2, 0], 5], parakath: [[-30, 5, 0], 16], arawan: [[-35, 1.6, 0], 7],
    inan: [[-25, 16, 0], 90],
    'levites-east': [[72, 2, 0], 60], 'levites-south': [[0, 2, 63], 70], 'levites-west': [[-72, 2, 0], 60], 'levites-north': [[0, 2, -63], 70],
  };
  const T = { judah: [230, 0], issachar: [230, -80], zebulun: [230, 80], reuben: [0, 230], simeon: [80, 230], gad: [-80, 230], ephraim: [-230, 0], manasseh: [-230, 80], benjamin: [-230, -80], dan: [0, -230], asher: [80, -230], naphtali: [-80, -230] };
  if (T[id]) return { target: [T[id][0], 2, T[id][1]], distance: 120 };
  const f = F[id]; return f ? { target: f[0], distance: f[1] } : null;
}

// ── The MODEL: what the generic page, scene and sheet read ───────────────────
export const STORIES = [
  { key: 'walk', label: 'Raise', modes: ['walk', 'roam'], icon: 'raise', go: 'Raise the mashakan →',
    kicker: 'Exodus 40:17–38 · Numbers 2 · the order Mashah set it up',
    blurb: 'On the first day of the first month of the second year Mashah (Moses) qawam (raised) the mashakan (tabernacle): its adanayam (sockets) and qarashayam (boards) and barayacham (bars), the ahal (tent) spread over it and the roof above; the arawan (ark) brought in and the parakath (veil) hung; the shalachan (table) on the north, the manawarah (lampstand) on the south, the zahab (gold) mazabach (altar) before the veil, the screen of the pathach (door); the mazabach (altar) of burnt offering at the door, the basin between; the chatzar (court) round it all and the screen of its shair (gate) — then the inan (cloud) covered the tent, and the twelve camped about it by their dagal (standards). Guided, part by part with its verses, or on your own feet.' },
];
const IN_HOUSE = (p) => p.x > MISH.x0 - 2.5 && p.x < MISH.x1 + 1.5 && Math.abs(p.z) < MISH.z + 2.5 && p.y < MISH.h + 3;

export const MODEL = {
  id: 'tabernacle', base: '/models/tabernacle', defaultStory: 'walk',
  title: 'The Mashakan (Tabernacle) and Its Machanah (Camp)', paleo: '𐤌𐤔𐤊𐤍',
  description: 'The mashakan (tabernacle) of Exodus 25–27 and 40 as an interactive 3D model measured in amah (cubits) from the text — the chatzar (court) of qalaiyam (hangings) a hundred by fifty on its sixty imawadayam (pillars), the mazabach (altar) of nachashath (brass) and the basin, the qarashayam (boards) overlaid with zahab (gold) in adanayam (sockets) of kasap (silver), the yarayaihath (curtains) with karawab (cherubim), the ahal (tent) of izayam (goats)\' hair and the coverings of skins, the screen of the pathach (door), the shalachan (table), the manawarah (lampstand), the mazabach (altar) of qatarath (incense), the parakath (veil) and the arawan (ark) — with the Lawayay (Levites) and the twelve tribes camped about it by their dagal (standards) (Numbers 2–3). Raise it in the order Mashah (Moses) did, or walk it on your own feet.',
  indexDescription: 'The mashakan (tabernacle) of Exodus 25–27 and 40 with the machanah (camp) of Numbers 2 about it, as an interactive 3D model measured in amah (cubits) from the text — raise it part by part in the order Mashah (Moses) set it up, or roam it and the camp on your own feet.',
  indexIntro: 'One model, measured in amah (cubits) from the text, and the order the text itself gives for it: Mashah (Moses) raises it part by part on the first day of the first month, and every part can be tapped for its measures and verses; then the camp of Numbers 2 stands about it on its four sides.',
  ground: LEVEL,
  WORDS, MATERIALS, PIECES, GROUPS, MODES, SPEEDS, CHIP_ORDER, PASSAGES, STORIES,
  pieceById, pieceForWord, passagesFor, refsFor, phaseAt, progressAt, xrayAt, openAt, cameraAt, marksFor, focusFor,
  stories: STORIES,
  card: {
    title: 'The mashakan (tabernacle) Mashah (Moses) qawam (raised) in the wilderness, and the machanah (camp) about it',
    subtitle: () => 'Exodus 25–27, 30, 40 · Numbers 2–3',
    intro: (mode) => (mode === 'roam'
      ? 'No story here: the mashakan stands finished in its court and the camp about it, and you walk it — through the screen of the shair (gate), past the mazabach (altar) and the basin, through the screen of the pathach (door) into the holy place with its shalachan (table), manawarah (lampstand) and zahab (gold) altar, and past the parakath (veil) to the arawan (ark); or out among the tents of the Lawayay (Levites) and the twelve. Tap a part for its words; tap a screen or the veil again to part it and go through.'
      : 'Play, and see it go up in the order Exodus 40 gives: the qarashayam (boards) in their adanayam (sockets) and the barayacham (bars); the ten yarayaihath (curtains) with karawab (cherubim), the ahal (tent) of izayam (goats)\' hair and the coverings of skins over them; the arawan (ark) brought in and the parakath (veil) hung before it; the shalachan (table) north, the manawarah (lampstand) south, the mazabach (altar) of qatarath (incense) before the veil, the screen of the pathach (door); the mazabach (altar) of burnt offering at the door and the basin between; the chatzar (court) with the screen of its shair (gate) — then the inan (cloud) covers it, and Yashar-Al (Israel) camps about it by their dagal (standards): Yahawadah (Judah) east, Raawaban (Reuben) south, Aparayam (Ephraim) west, Dan north, and the Lawayay (Levites) between.'),
    extras: () => [{ heading: 'What the model takes from the text, and what it adds', refs: 'Exodus 26:15–30; 27:9–18; 40:17–33; Numbers 2:2', text: 'Every measure the text gives is built as given — the court a hundred by fifty and five high, the boards ten by a cubit and a half, the veil twenty in from the door under the clasps, the furniture to its cubits. Where it gives none — the boards\' thickness, the height of the lampstand, the basin\'s form, the pillars\' shape, the way the sixty pillars share the corners, the coverings\' extent — the model chooses and says so on each part\'s card, hatched on the model. The camp is the model\'s own picture of Numbers 2: three tribes to a side in the text\'s order, about two hundred cubits out, each a company of tents that stands for tens of thousands.' }],
    choose: 'Tap a part of the tabernacle or a camp, one of the chips under it, or a marked word in the text for its measures, verse by verse, the same thing elsewhere in scripture, and what the model had to assume where the text is silent.',
  },
  strings: { parts: 'Parts of the tabernacle and the camp', storiesTitle: 'The tabernacle\'s stories', guidedTitle: 'Guided: raised in the order of Exodus 40, verse by verse' },
  roam: {
    eye: ROAM_EYE, start: ROAM_START, enter: ROAM_ENTER,
    openKeys: ['gate', 'door', 'veil'],
    openKey: (which) => which,
    openDefault: () => 0,   // every hanging shut at the start: the screen of the gate, the screen of the door, the veil — the walker parts them
  },
  scene: {
    sky: 0xd7e3ee, shadowR: 140, fog: [700, 2000], maxDistance: 1400, earth: '#cdb98d', plainDrop: 0.02,   // the plain is the model's ground: the tents and the court's pillars stand on it   // a bright sky over the wilderness; the plain sand
    lighting: { sun: 3.0, hemi: 0.7 },
    lights: [
      { key: 'holyLight', color: 0xffd9a0, distance: 40, pos: [(HOLY.x0 + HOLY.x1) / 2, MISH.h - 2, 0], on: () => 60 },
      { key: 'mostHolyLight', color: 0xffe6c0, distance: 24, pos: [(MOST_HOLY.x0 + MOST_HOLY.x1) / 2, MISH.h - 2, 0], on: (P, mode, t) => (mode === 'walk' ? 40 + 420 * smooth((t - 84) / 2.5) : 60) },   // the kabawad (glory) fills the tent (40:34)
    ],
    walls: ['court', 'gate-screen', 'boards', 'mashakan', 'ahal', 'makasah', 'door-screen', 'parakath', 'mazabach'],
    notSolid: ['inan'],
    navSkip: ['gate-screen', 'door-screen', 'parakath', 'inan'],
    proxies: [],
    stairHouses: {},
    plan: {
      pieces: ['court', 'gate-screen', 'mazabach', 'basin', 'boards', 'door-screen', 'parakath', 'arawan', 'shalachan', 'manawarah', 'qatarath', 'levites-east', 'levites-south', 'levites-west', 'levites-north', 'judah', 'issachar', 'zebulun', 'reuben', 'simeon', 'gad', 'ephraim', 'manasseh', 'benjamin', 'dan', 'asher', 'naphtali'],
      extra: [],
      labels: [
        [50, 0, 'shair'], [12, 0, 'mazabach'], [-3, 0, 'basin'], [-20, 0, 'qadash'], [-35, 0, 'most qadash'], [25, -18, 'chatzar'],
        [72, 0, 'Mashah · Aharawan'], [0, 63, 'Qahath'], [-72, 0, 'Garashawan'], [0, -63, 'Mararay'],
        [230, 0, 'Yahawadah'], [230, -80, 'Yashashakar'], [230, 80, 'Zabawalawan'], [0, 230, 'Raawaban'], [80, 230, 'Shamaiwan'], [-80, 230, 'Gad'],
        [-230, 0, 'Aparayam'], [-230, 80, 'Manashah'], [-230, -80, 'Banayamayan'], [0, -230, 'Dan'], [80, -230, 'Ashar'], [-80, -230, 'Napathalay'],
      ],
      radius: 70,
      places: [
        { label: 'chatzar (court)', bounds: { x0: -50, x1: 50, z0: -25, z1: 25 }, children: [
          { label: 'the screen of the shair (gate)', short: 'shair', bounds: { x0: 44, x1: 56, z0: -11, z1: 11 }, at: [46, 0] },
          { label: 'mazabach (altar) of burnt offering', short: 'mazabach', bounds: { x0: 8, x1: 16, z0: -4, z1: 4 }, at: [18, 0] },
          { label: 'the basin', short: 'basin', bounds: { x0: -6, x1: 0, z0: -3, z1: 3 }, at: [-3, 4] },
          { label: 'the screen of the pathach (door)', short: 'pathach', bounds: { x0: -12, x1: -6, z0: -6, z1: 6 }, at: [-7, 0] },
        ] },
        { label: 'mashakan (tabernacle)', bounds: { x0: -43, x1: -9, z0: -7, z1: 7 }, children: [
          { label: 'the qadash (holy) place', short: 'qadash', bounds: { x0: -30, x1: -10, z0: -5, z1: 5 }, at: [-18, 0] },
          { label: 'shalachan (table)', short: 'shalachan', bounds: { x0: -21.5, x1: -18.5, z0: -5, z1: -2.5 }, at: [-20, -1] },
          { label: 'manawarah (lampstand)', short: 'manawarah', bounds: { x0: -21.5, x1: -18.5, z0: 2.5, z1: 5 }, at: [-20, 1] },
          { label: 'mazabach (altar) of qatarath (incense)', short: 'qatarath', bounds: { x0: -28, x1: -26, z0: -1, z1: 1 }, at: [-25, 0] },
          { label: 'the most qadash (holy) place — the arawan (ark)', short: 'most qadash', bounds: { x0: -40, x1: -30, z0: -5, z1: 5 }, at: [-32.5, 0] },
        ] },
        { label: 'the Lawayay (Levites) about it', bounds: { x0: -85, x1: 85, z0: -78, z1: 78 }, children: [
          { label: 'Mashah (Moses), Aharawan (Aaron) and his sons — east', short: 'Mashah', bounds: { x0: 60, x1: 82, z0: -13, z1: 13 }, at: [64, -16] },
          { label: 'the sons of Qahath (Kohath) — south', short: 'Qahath', bounds: { x0: -30, x1: 30, z0: 52, z1: 74 }, at: [0, 49] },
          { label: 'the sons of Garashawan (Gershon) — west', short: 'Garashawan', bounds: { x0: -82, x1: -60, z0: -30, z1: 30 }, at: [-57, 0] },
          { label: 'the sons of Mararay (Merari) — north', short: 'Mararay', bounds: { x0: -30, x1: 30, z0: -74, z1: -52 }, at: [0, -49] },
        ] },
        { label: 'machanah (camp) of Yahawadah (Judah) — east', short: 'Yahawadah', bounds: { x0: 200, x1: 260, z0: -115, z1: 115 }, children: [
          { label: 'Yashashakar (Issachar)', bounds: { x0: 200, x1: 260, z0: -115, z1: -45 }, at: [196, -80] }, { label: 'Yahawadah (Judah)', bounds: { x0: 200, x1: 260, z0: -35, z1: 35 }, at: [192, 0] }, { label: 'Zabawalawan (Zebulun)', bounds: { x0: 200, x1: 260, z0: 45, z1: 115 }, at: [196, 80] },
        ] },
        { label: 'machanah (camp) of Raawaban (Reuben) — south', short: 'Raawaban', bounds: { x0: -115, x1: 115, z0: 200, z1: 260 }, children: [
          { label: 'Gad (Gad)', bounds: { x0: -115, x1: -45, z0: 200, z1: 260 }, at: [-80, 196] }, { label: 'Raawaban (Reuben)', bounds: { x0: -35, x1: 35, z0: 200, z1: 260 }, at: [0, 192] }, { label: 'Shamaiwan (Simeon)', bounds: { x0: 45, x1: 115, z0: 200, z1: 260 }, at: [80, 196] },
        ] },
        { label: 'machanah (camp) of Aparayam (Ephraim) — west', short: 'Aparayam', bounds: { x0: -260, x1: -200, z0: -115, z1: 115 }, children: [
          { label: 'Banayamayan (Benjamin)', bounds: { x0: -260, x1: -200, z0: -115, z1: -45 }, at: [-196, -80] }, { label: 'Aparayam (Ephraim)', bounds: { x0: -260, x1: -200, z0: -35, z1: 35 }, at: [-192, 0] }, { label: 'Manashah (Manasseh)', bounds: { x0: -260, x1: -200, z0: 45, z1: 115 }, at: [-196, 80] },
        ] },
        { label: 'machanah (camp) of Dan — north', short: 'Dan', bounds: { x0: -115, x1: 115, z0: -260, z1: -200 }, children: [
          { label: 'Napathalay (Naphtali)', bounds: { x0: -115, x1: -45, z0: -260, z1: -200 }, at: [-80, -196] }, { label: 'Dan (Dan)', bounds: { x0: -35, x1: 35, z0: -260, z1: -200 }, at: [0, -192] }, { label: 'Ashar (Asher)', bounds: { x0: 45, x1: 115, z0: -260, z1: -200 }, at: [80, -196] },
        ] },
      ],
    },
    inHouse: IN_HOUSE,
    floorAt: () => LEVEL,
  },
  sheet: {
    plan: { x0: -66, x1: 66, z0: -33, z1: 33, scale: 4.3, left: 24, top: 26, grid: 10 },
    section: { x0: -66, x1: 66, y0: -1, y1: 22, scale: 2.6, left: 640, bottom: 64, tick: 5 },
    titles: ['PLAN · tzapawan (north) up · qadam (east) right · one square = 10 amah', 'SECTION · through the middle, gate to ark'],
    labels: [
      ['shair', 50, -14], ['mazabach', 12, -5], ['basin', -3, -4], ['qadash', -20, -8], ['most qadash', -35, -8], ['chatzar (court)', 25, 18], ['shalachan', -20, -3.5], ['manawarah', -20, 3.5],
    ],
    compass: [58, -28],
    aria: 'The tabernacle, drawn flat: a plan of the court with the tent and its furniture, and a section through the middle from the gate to the ark',
  },
};
export default MODEL;
