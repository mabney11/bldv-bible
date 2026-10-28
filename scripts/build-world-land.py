#!/usr/bin/env python3
"""Bake src/lib/models/world-land.json — the land OUTSIDE levant-base.json's box, for the Holy Land
map's built-in base map, so far-off places (the Communities layer: the Rhineland, Poland, Spain, India)
stand on land instead of on the empty background. Natural Earth 1:50m land (public domain), simplified.
The levant box is cut out SOUTH of 44°N (levant-base.json draws it at 1:10m); the band 42.7–46°N is kept and
drawn over the 1:10m sea there, which hides the seam at the box edge and a broken ring east of the Sea of Azov.

  curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
  python scripts/build-world-land.py ne_50m_land.geojson src/lib/models/levant-base.json src/lib/models/world-land.json
"""
import json, sys
from shapely.geometry import shape, box
from shapely.ops import unary_union
land_path, levant_path, out_path = sys.argv[1:4]
x0, y0, x1, y1 = json.load(open(levant_path, encoding='utf-8'))['bbox']
BAND = 42.7   # keep the world land north of this inside the levant box (the broken ring reaches ~43.1N)
WORLD = box(-30.0, -5.0, 100.0, 72.0)
land = unary_union([shape(f['geometry']) for f in json.load(open(land_path, encoding='utf-8'))['features']])
# inside the levant box, world land takes over in these boxes (drawn over the 1:10m sea there):
# the band north of BAND, and the Caucasus east of 40E down to 40.6N, where the 1:10m ring is broken
COVERS = [[x0, BAND, x1, y1], [40.0, 40.6, x1, BAND]]
keep = unary_union([box(*c) for c in COVERS])
g = land.intersection(WORLD).difference(box(x0, y0, x1, y1).difference(keep)).simplify(0.03, preserve_topology=True)
polys = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
out = []
for p in polys:
    if p.area < 0.05: continue
    rings = [p.exterior] + [h for h in p.interiors if abs(shape({'type': 'Polygon', 'coordinates': [list(h.coords)]}).area) > 0.05]
    out.append([[[round(x, 3), round(y, 3)] for x, y in r.coords] for r in rings])
json.dump({'covers': COVERS, 'source': 'Natural Earth 1:50m land (public domain), outside levant-base bbox', 'polys': out}, open(out_path, 'w', encoding='utf-8'), separators=(',', ':'))
print(len(out), 'polygons', sum(len(r) for p in out for r in p), 'points')
