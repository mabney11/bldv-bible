/**
 * kit.js — the geometry toolkit every measured model shares (the bayath of
 * Yahawah, Yachazaqaal's house, the mashakan, the cities): solids both renderers
 * understand, idealized doorways, walls with doors, slabs with holes, stairs,
 * furniture, gardens, people — and the timeline helpers (phases, the scripted
 * eye, see-through stretches, scrub marks). Nothing here draws; the scene
 * (components/ModelScene.jsx, model3d/builders.js) turns the parts into meshes
 * and the sheet (components/ModelSheet.jsx) into SVG.
 *
 * Units: ONE WORLD UNIT = ONE amah (cubit), y up, +x east, +z south. Every model
 * chooses its own ground level (the temple's court is y = −4): makeKit(ground)
 * binds the toolkit to it.
 *
 * Solids (cubits; y = bottom unless noted):
 *   box  {x,y,z,w,h,d}                  centre x/z, bottom y
 *   cyl  {x,y,z,r,h,r2?}                vertical cylinder (r2 = top radius)
 *   lathe{x,y,z,profile:[[r,dy]…]}       body of revolution, dy from y
 * `mat` overrides the piece's material; `role` lets the scene treat a solid as
 * part of the roof/south wall for the see-through (xray) phases; `ideal: true`
 * draws it hatched and paled as the model's own conjecture.
 */

// ── Materials (colours shared by both renderers; every model starts from these and may add its own) ──
export const BASE_MATERIALS = {
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
  silver: { word: 'kasap',      color: '#cfd3d8', hi: '#f2f4f6', lo: '#7d838b', metal: 1, rough: 0.35 },
  'rug-runner': { word: 'marabad', color: '#a2603c', hi: '#cf9068', lo: '#5e341a', metal: 0, rough: 1 },
};

/** The toolkit bound to a ground level Y0 (the courts' y). */
export function makeKit(Y0) {
  const box = (x, y, z, w, h, d, extra = {}) => ({ kind: 'box', x, y, z, w, h, d, ...extra });
  const cyl = (x, y, z, r, h, extra = {}) => ({ kind: 'cyl', x, y, z, r, h, ...extra });
  const lathe = (x, y, z, profile, extra = {}) => ({ kind: 'lathe', x, y, z, profile, ...extra });

  // A rectangular wall ring (four walls) of thickness t around the box [x0,x1]×[-z,z], from y for h — as four boxes.
  /** What the model IDEALIZED — `ideal: true` on a part draws it in lime plaster with a fine hatch and its edges drawn (builders.js's
   *  idealOf), so a room, a stair or a doorway the text never gives is plainly the model's beside the things the text measures. */
  const ideal = (part) => ({ ...part, ideal: true });
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
  // each step is built solid down to the floor it rises from (a stepped mass of stone, not floating treads — fieldy)
  // `rise` and `run` (default 1 × 1) give shallower flights (Yachazaqaal's seven, eight and ten steps); `mat` the stone
  const stair = (axis, x, z, n, w, dir = 1, y = Y0, rise = 1, run = 1, mat = 'stone') => Array.from({ length: n }, (_, i) => ideal(axis === 'x'
    ? box(x + dir * (i + 0.5) * run, y, z, run, (i + 1) * rise, w, { mat, role: 'stair', stair: { axis, x, z, n, w, dir, y, i, rise, run } })
    : box(x, y, z + dir * (i + 0.5) * run, w, (i + 1) * rise, run, { mat, role: 'stair', stair: { axis, x, z, n, w, dir, y, i, rise, run } })));
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
  /** The gold drinking vessels of the house of the forest (1 Kings 10:21): cups and bowls on a table (the table is the model's). */
  const vessels = (x, z) => [...table(x, z, 3, 7), ...[[-2.6, -0.8], [-1.6, 0.6], [-0.5, -0.6], [0.6, 0.7], [1.7, -0.7], [2.6, 0.5]].map(([dx, dz]) => cyl(x + dx, Y0 + 1.55, z + dz, 0.28, 0.6, { mat: 'gold', role: 'vessel', r2: 0.36 })),
    cyl(x + 0.1, Y0 + 1.55, z + 0.05, 0.55, 0.35, { mat: 'gold', role: 'vessel', r2: 0.85 })];
  /** A person standing (faceless, as all the model's people): robe 'linen' | 'royal', yaw = which way they face (0 = +x). */
  const person = (x, z, yaw, robe = 'linen', extra = {}) => [{ kind: 'person', x, z, yaw, robe, skin: `skin${Math.abs(Math.round(x * 3 + z * 7)) % 8}`, hair: `hair${Math.abs(Math.round(x + z)) % 5}`, ...extra }];
  /** Shalamah's palanquin (Song of Songs 3:9–10): a litter of Labanawan cedar, its pillars of silver, its base of gold, its covering of purple. */
  function palanquin(x, z) {
    const out = [box(x, Y0 + 0.9, z, 5, 0.4, 3, { mat: 'gold', role: 'palanquin' }), box(x, Y0 + 1.3, z, 4.6, 0.5, 2.6, { mat: 'cedar', role: 'palanquin' }),
      box(x, Y0 + 1.8, z, 4.2, 0.35, 2.2, { mat: 'veil', role: 'palanquin' }), box(x, Y0 + 5.0, z, 5.4, 0.25, 3.4, { mat: 'veil', role: 'palanquin' }), box(x, Y0 + 5.25, z, 5.6, 0.2, 3.6, { mat: 'cedar', role: 'palanquin' })];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cyl(x + sx * 2.2, Y0 + 1.3, z + sz * 1.2, 0.14, 3.7, { mat: 'silver', role: 'palanquin' }));
    for (const sx of [-1, 1]) out.push(box(x + sx * 3.6, Y0 + 1.0, z, 2.4, 0.18, 0.18, { mat: 'cedar', role: 'palanquin' }));   // the carrying poles
    for (const sz of [-1, 1]) out.push(box(x, Y0 + 1.6, z + sz * 1.55, 4.4, 3.4, 0.06, { mat: 'veil', role: 'palanquin' }));   // side curtains
    return out;
  }
  /** Ivory inlay on furniture (Psalm 45:8; Amos 3:15): thin ivory bands along a piece's edges. */
  const inlay = (x, z, w, l, y = Y0) => [ideal(box(x, y + 1.1, z, l + 0.1, 0.1, 0.25, { mat: 'ivory', role: 'inlay' })), ideal(box(x, y + 1.1, z + w / 2 - 0.15, l + 0.1, 0.12, 0.25, { mat: 'ivory', role: 'inlay' })), ideal(box(x, y + 1.1, z - w / 2 + 0.15, l + 0.1, 0.12, 0.25, { mat: 'ivory', role: 'inlay' }))];
  /** A paved floor (idealized) over a room. */
  const paving = (x0, x1, z0, z1, y = Y0) => [ideal(box((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mat: 'paving', role: 'pavement' }))];

  function walls(x0, x1, z, t, y, h, extra = {}) {
    const mid = (x0 + x1) / 2, len = x1 - x0 + 2 * t;
    return [
      box(mid, y, z + t / 2, len, h, t, { role: 'south', ...extra }),
      box(mid, y, -z - t / 2, len, h, t, { role: 'north', ...extra }),
      box(x0 - t / 2, y, 0, t, h, 2 * z, { role: 'west', ...extra }),
      box(x1 + t / 2, y, 0, t, h, 2 * z, { role: 'east', ...extra }),
    ];
  }
  return { Y0, box, cyl, lathe, ideal, doorFrame, portico, porticoZ, wallX, wallZ, slab, roofOf, parapet, rail, stair, bed, table, seat, couch, lamp, chest, jars, tree, pool, shields, chambers, cedarLining, rug, vessels, person, palanquin, inlay, paving, walls };
}

/** "book:chapter:a-b" specs → ["book:chapter:v", …] — the verses a piece lights up. */
export const V = (...specs) => specs.flatMap((s) => {
  const [b, c, r] = s.split(':'); const [a, z] = r.split('-').map(Number);
  const out = []; for (let v = a; v <= (z ?? a); v++) out.push(`${b}:${c}:${v}`); return out;
});

// ── Timelines ────────────────────────────────────────────────────────────────
export const SPEEDS = [0.25, 0.5, 1, 2];
export const clamp01 = (u) => Math.max(0, Math.min(1, u));
export const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
export const ease = { out: (u) => 1 - (1 - u) * (1 - u), inOut: smooth };

/**
 * The timeline functions for a model's MODES ({ key: { label, phases, duration, camera, xray, free? } }):
 *   phaseAt(mode, t)      the phase whose `from` is the last at/before t
 *   xrayAt(mode, t)       how see-through the roof/south side is (0 solid … 1 glass)
 *   cameraAt(mode, t)     the scripted eye { pos, target }, eased between keyframes
 *   marksFor(mode, labels) scrub-bar marks from the phases whose key is in labels[mode]
 */
export function timelineFor(MODES) {
  function phaseAt(mode, t) {
    const ph = MODES[mode].phases; let p = ph[0];
    for (const q of ph) if (t >= q.from) p = q;
    return p;
  }
  function xrayAt(mode, t) {
    let k = 0;
    for (const [a, b] of MODES[mode].xray || []) { const f = 0.5; k = Math.max(k, Math.min(smooth((t - a) / f), smooth((b - t) / f))); }
    return k;
  }
  function cameraAt(mode, t) {
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
  function marksFor(mode, labels) {
    const ph = MODES[mode].phases, d = MODES[mode].duration, label = labels[mode] || {};
    return ph.filter((p) => label[p.key]).map((p) => ({ at: p.from / d, label: label[p.key] }));
  }
  return { phaseAt, xrayAt, cameraAt, marksFor };
}
