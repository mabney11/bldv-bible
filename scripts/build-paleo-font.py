"""build-paleo-font.py — regenerate public/fonts/BLDPaleo-Regular.woff2

The app's Paleo-Hebrew letters are plain Unicode text (U+10900–U+10915) set in
the bundled "BLD Paleo" web font, so every platform (Windows, Android, iOS,
Linux) renders the SAME glyphs with the SAME spacing. The font is Noto Sans
Phoenician (SIL OFL 1.1, see public/fonts/OFL-BLDPaleo.txt) with two letters
redrawn to house style:

  • 𐤃 dalet — a closed triangle, no trailing tail
  • 𐤅 waw   — a clean capital-Y: straight arms, straight stem

Both are drawn as centre-line strokes (≈86 units on the 1000-unit em, matching
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
