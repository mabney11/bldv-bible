"""build-paleo-font.py — regenerate public/fonts/BLDPaleo-Regular.woff2

The app's Paleo-Hebrew letters are plain Unicode text (U+10900–U+10915) set in
the bundled "BLD Paleo" web font, so every platform (Windows, Android, iOS,
Linux) renders the SAME glyphs with the SAME spacing. The font is Noto Sans
Phoenician (SIL OFL 1.1, see public/fonts/OFL-BLDPaleo.txt) with two letters
redrawn to house style:

  • 𐤃 dalet — a closed triangle, no trailing tail
  • 𐤅 waw   — a clean capital-Y: straight arms, straight stem
  • 𐤏 ayin  — a full-height circle
  • 𐤈 tet   — the same circle with an X running edge to edge
  • 𐤌 mem / 𐤍 nun — Noto's zigzag heads, tail dropping steeply (M / N ancestry)

Then EVERY letter is uniformly scaled to span exactly baseline…cap height so
the alphabet sits on one normalised height.

The redrawn letters are drawn as centre-line strokes (≈86 units on the 1000-unit em, matching
Noto's main stroke) that are stroked/unioned with shapely and written into the
glyf table with proper advance widths + sidebearings, which is what makes them
space naturally next to every other letter. Tweak the coordinates below and
re-run:

    pip install fonttools brotli shapely
    python scripts/build-paleo-font.py

This replaced the old per-character inline-SVG overrides in src/lib/paleoGlyphs.js
(SG_MOBILE + negative-margin config), which could never kern with real text.
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, '..', 'public', 'fonts')
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
import math

f = TTFont(os.path.join(HERE, 'fonts-src', 'NotoSansPhoenician-base.ttf'))
cmap = f.getBestCmap()
glyf = f['glyf']; hmtx = f['hmtx']

def quad(p0, c, p1, n=14):
    return [((1-t)**2*p0[0] + 2*(1-t)*t*c[0] + t*t*p1[0],
             (1-t)**2*p0[1] + 2*(1-t)*t*c[1] + t*t*p1[1]) for t in [i/n for i in range(n+1)]]

def stroke(pts, w):
    return LineString(pts).buffer(w/2, join_style=1, cap_style=1, resolution=6)

def build(name, shapes, lsb=50, rsb=50):
    poly = unary_union(shapes).simplify(1.5)
    polys = [poly] if poly.geom_type == 'Polygon' else list(poly.geoms)
    minx = min(p.bounds[0] for p in polys)
    dx = lsb - minx
    pen = TTGlyphPen(None)
    def ring(coords, want_cw):
        coords = list(coords)[:-1]
        from shapely.geometry import LinearRing
        is_ccw = LinearRing(coords).is_ccw
        # TrueType (y-up): outer contours clockwise, holes counter-clockwise
        if is_ccw == want_cw: coords = coords[::-1]
        pen.moveTo((round(coords[0][0]+dx), round(coords[0][1])))
        for x, y in coords[1:]:
            pen.lineTo((round(x+dx), round(y)))
        pen.closePath()
    for p in polys:
        ring(p.exterior.coords, want_cw=True)
        for i in p.interiors:
            ring(i.coords, want_cw=False)
    glyf[name] = pen.glyph()
    maxx = max(p.bounds[2] for p in polys) + dx
    hmtx[name] = (round(maxx + rsb), lsb)
    glyf[name].recalcBounds(glyf)

W = 86   # Noto Phoenician main stroke ≈ 80–90 units

# ── Dalet: closed isoceles triangle, no tail ─────────────────────────────────
apex = (295, 705); bl = (45, 120); br = (545, 120)
dalet = [stroke([bl, apex], W), stroke([apex, br], W-10), stroke([bl, br], W)]
build(cmap[0x10903], dalet, lsb=49, rsb=49)

# ── Waw: Y-fork with a gently cupped bowl and a straight stem ────────────────
# Straight arms, straight stem — a clear capital-Y silhouette (2026-09-07: the
# reader asked for this so the descent Waw → Y is obvious at a glance).
j = (300, 370)
waw = [stroke([(60, 700), j], W), stroke([(540, 700), j], W-8), stroke([j, (300, -8)], W)]
build(cmap[0x10905], waw, lsb=30, rsb=30)

# ── Ayin + Tet: one shared full-height circle (normalised — Noto's ayin was a
#    small high circle while its tet was full-size). Tet adds an X whose arms
#    run all the way out to the ring ("X-Men" mark). ─────────────────────────
from shapely.geometry import Point
CX, CY, R = 360, 360, 360 - W/2          # outer edge spans y 0…720 = cap height
ring = Point(CX, CY).buffer(R + W/2, resolution=24).difference(Point(CX, CY).buffer(R - W/2, resolution=24))
build(cmap[0x1090F], [ring], lsb=45, rsb=45)                       # ayin ○
d = R * math.cos(math.pi/4)
x_arms = [stroke([(CX-d, CY-d), (CX+d, CY+d)], W-6), stroke([(CX-d, CY+d), (CX+d, CY-d)], W-6)]
build(cmap[0x10908], [ring] + x_arms, lsb=45, rsb=45)              # tet ⊗

# ── Mem + Nun: the same zigzag "water/snake" heads as Noto, but the tail drops
#    steeply from the RIGHT end of a 'w' / 'v' head (mostly DOWN, only slightly
#    right) so the M / N ancestry reads at a glance. 2026-09-08. ─────────────────────────────────────────────────────
mem = [stroke([(40, 720), (150, 490), (260, 720), (370, 490), (480, 720), (560, 0)], W)]   # 'w' head, stem on the RIGHT
build(cmap[0x1090C], mem, lsb=40, rsb=40)                          # mem
nun = [stroke([(40, 720), (150, 500), (260, 720), (340, 0)], W)]                          # 'v' head, stem on the RIGHT
build(cmap[0x1090D], nun, lsb=40, rsb=40)                          # nun

# ── Normalise heights: every letter is scaled UNIFORMLY (stroke weight and
#    proportions stay Noto's) so its outline spans exactly baseline…cap height
#    (0…720). Sidebearings are kept; advance width follows the new outline. ────
from fontTools.pens.transformPen import TransformPen
TOP = 720
for cp in range(0x10900, 0x10916):
    name = cmap[cp]
    g = glyf[name]
    if g.numberOfContours <= 0: continue
    g.recalcBounds(glyf)
    h = g.yMax - g.yMin
    if h < 1: continue
    k = TOP / h
    adv, lsb = hmtx[name]
    rsb = adv - g.xMax
    pen = TTGlyphPen(None)
    # scale about the glyph's own origin, then drop it onto the baseline / left bearing
    tp = TransformPen(pen, (k, 0, 0, k, lsb - g.xMin * k, -g.yMin * k))
    g.draw(tp, glyf)
    ng = pen.glyph(); ng.recalcBounds(glyf)
    glyf[name] = ng
    hmtx[name] = (round(ng.xMax + rsb), lsb)

# ── Rename family so it never shadows a system Noto ──────────────────────────
FAMILY = 'BLD Paleo'
for rec in f['name'].names:
    if rec.nameID in (1, 4, 16): rec.string = FAMILY
    elif rec.nameID == 6:        rec.string = 'BLDPaleo-Regular'
    elif rec.nameID == 3:        rec.string = 'BLDPaleo-Regular;bldbible'
f['head'].flags |= 0
f.save(os.path.join(OUT, 'BLDPaleo-Regular.ttf'))
f.flavor = 'woff2'; f.save(os.path.join(OUT, 'BLDPaleo-Regular.woff2'))
print('ok', hmtx[cmap[0x10903]], hmtx[cmap[0x10905]])
