#!/usr/bin/env python3
"""Bake src/lib/models/nations.json for the Genesis nations globe (/models/nations).

fieldy, 2026-10-28: "a world map/globe with the full allotments from genesis" — one page, every genealogy a view
("its the same earth at different times, they can be views"), each nation's land filled in (a full partition).

Input  scripts/nations-source.json (edit that), server/strongs-hebrew-paleo.json (the Paleo name of every entry is
       its Strong's lemma — no name is typed by hand), Natural Earth 1:50m land (public domain).
Output src/lib/models/nations.json: views, entries (+ paleo, family, colour), territories per view, globe land, and the
       story panes (passed through: the page reads the verses LIVE from the translation — {{ref}} — never a copy).

A territory is the land nearer to its entry's place than to any other placed entry of the same view, inside the
view's frame (a Voronoi partition clipped to land). It shows where each name has been identified, not a surveyed
border; entries with no proposed place get none and are listed instead.

  pip install shapely
  curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
  curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson
  python scripts/build-nations.py ne_50m_land.geojson ne_50m_lakes.geojson
"""
import colorsys, json, os, sys
from shapely.geometry import shape, box, MultiPoint, Point
from shapely.ops import unary_union, voronoi_diagram

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
land_path, lakes_path = sys.argv[1:3]
src = json.load(open(os.path.join(ROOT, 'scripts', 'nations-source.json'), encoding='utf-8'))
strongs = json.load(open(os.path.join(ROOT, 'server', 'strongs-hebrew-paleo.json'), encoding='utf-8'))
land = unary_union([shape(f['geometry']) for f in json.load(open(land_path, encoding='utf-8'))['features']])
# Natural Earth's land includes its lakes: take the big ones out (the Caspian, the Aral, the African lakes…)
lakes = unary_union([g for g in (shape(f['geometry']) for f in json.load(open(lakes_path, encoding='utf-8'))['features']) if g.area > 0.05])
land = land.difference(lakes)

entries = src['entries']
by_id = {e['id']: e for e in entries}
missing = [e['sn'] for e in entries if e['sn'] not in strongs]
if missing:
    sys.exit(f'Strong\'s numbers not in the dictionary: {missing}')

def family_of(e):
    while e:
        if e.get('family'):
            return e['family']
        e = by_id.get(e.get('parent'))
    return None

def line_of(e):
    """The family head's child this entry descends through (Gomer, Javan, Cush, Aram…) — for the shade."""
    chain = []
    while e:
        chain.append(e)
        if e.get('family'):
            break
        e = by_id.get(e.get('parent'))
    return chain[-2]['id'] if len(chain) >= 2 else (chain[-1]['id'] if chain else None)

def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))

# colour: the family's hue; each line a step lighter/darker, so a son's line reads as one block
lines = {}
for e in entries:
    f = family_of(e)
    if f:
        lines.setdefault((e['view'], f), [])
        ln = line_of(e)
        if ln not in lines[(e['view'], f)]:
            lines[(e['view'], f)].append(ln)

out_entries = []
for e in entries:
    f = family_of(e)
    o = dict(e)
    o['paleo'] = strongs[e['sn']]['lemma'].replace(' ', '-')
    o['family'] = f
    if f:
        h, l, s = colorsys.rgb_to_hls(*hex_rgb(src['families'][f]['color']))
        ls = lines[(e['view'], f)]
        k = ls.index(line_of(e))
        n = max(len(ls) - 1, 1)
        l2 = 0.36 + 0.30 * (k / n)
        h2 = (h + (k / n - 0.5) * 0.06) % 1
        r, g, b = colorsys.hls_to_rgb(h2, l2, min(1, s * 1.05))
        o['color'] = '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))
    else:
        o['color'] = '#8b8578'
    o['line'] = line_of(e) if f else None
    out_entries.append(o)

def rings_of(g, tol, nd, min_area=0.0):
    polys = list(g.geoms) if g.geom_type in ('MultiPolygon', 'GeometryCollection') else [g]
    out = []
    for p in polys:
        if p.geom_type != 'Polygon' or p.is_empty:
            continue
        p = p.simplify(tol, preserve_topology=True)
        if p.is_empty or p.area < max(tol * tol * 4, min_area):
            continue
        rs = [p.exterior] + [h for h in p.interiors]
        out.append([[[round(x, nd), round(y, nd)] for x, y in r.coords] for r in rs])
    return out

territories = {}
for vid, v in src['views'].items():
    seeds = [e for e in entries if e['view'] == vid and 'lon' in e and 'lat' in e]
    if vid == 'gen11' or len(seeds) < 2:
        continue                                   # a lineage and a road, not a partition
    frame = box(*v['frame'])
    span = max(v['frame'][2] - v['frame'][0], v['frame'][3] - v['frame'][1])
    tol, nd = (0.02, 3) if span > 20 else (0.004, 4)
    pts = MultiPoint([Point(e['lon'], e['lat']) for e in seeds])
    cells = voronoi_diagram(pts, envelope=frame.buffer(span))
    area = land.intersection(frame)
    terr = []
    for e in seeds:
        pt = Point(e['lon'], e['lat'])
        cell = next(c for c in cells.geoms if c.buffer(1e-9).contains(pt))
        g = cell.intersection(area)
        if g.is_empty:
            print(f'  {vid} {e["id"]}: its place is not on land in the frame', file=sys.stderr)
            continue
        terr.append({'id': e['id'], 'polys': rings_of(g, tol, nd)})
    territories[vid] = terr
    print(f'{vid}: {len(terr)} territories, {sum(len(r) for t in terr for p in t["polys"] for r in p)} points')

globe = rings_of(land, 0.1, 2, min_area=0.25)     # the globe: small islands dropped
print(f'globe land: {len(globe)} polygons, {sum(len(r) for p in globe for r in p)} points')

doc = {
    'source': 'scripts/nations-source.json + server/strongs-hebrew-paleo.json; land: Natural Earth 1:50m (public domain)',
    'views': src['views'], 'families': src['families'], 'entries': out_entries,
    'territories': territories, 'land': globe,
    'stories': src.get('stories', {}),
}
dst = os.path.join(ROOT, 'src', 'lib', 'models', 'nations.json')
json.dump(doc, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('wrote', dst, os.path.getsize(dst), 'bytes')
