#!/usr/bin/env python3
"""Bake src/lib/models/worldly.json — the Holy Land map's "Worldly allotments" layer.

fieldy, 2026-10-28: "as a toggle under 'allotments' I want 'worldly allotments' and have
geographical outlines of the different modern peoples in the land including well known
places like 'gaza strip' / places with conflicts".

Source: Natural Earth 1:10m (public domain) — admin_0_map_units (countries, and Gaza /
West Bank as their own units) + admin_0_disputed_areas (the Green-Line Israel, Golan
Heights, East Jerusalem, Shebaa Farms, the UNDOF zone). Natural Earth draws DE FACTO lines;
each entry's `status` says who administers it and who claims it, in neutral words.

Baked offline (fieldy's bake-static-data rule): the map only reads the JSON.

  pip install shapely
  curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_map_units.geojson
  curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_disputed_areas.geojson
  python scripts/build-worldly-allotments.py ne_10m_admin_0_map_units.geojson ne_10m_admin_0_disputed_areas.geojson src/lib/models/worldly.json
"""
import json, sys
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union

units_path, disputed_path, out_path = sys.argv[1:4]
CLIP = box(31.0, 26.5, 40.5, 36.5)     # the Levant the map shows (lon/lat)

def load(path):
    return json.load(open(path, encoding='utf-8'))['features']

UNITS = load(units_path)
DISP = load(disputed_path)

def find(feats, name, a3=None):
    hits = [f for f in feats if f['properties'].get('NAME') == name and (a3 is None or f['properties'].get('ADM0_A3') == a3)]
    if len(hits) != 1:
        raise SystemExit(f'expected one feature named {name!r}, found {len(hits)}')
    return shape(hits[0]['geometry'])

# (id, name, kind, colour, geometry, status, note) — drawn in this order (later on top).
# kind: state (solid border) · territory (solid) · disputed (dashed) · buffer (dotted)
E = [
    ('egypt', 'Egypt', 'state', '#c9b458', find(UNITS, 'Egypt'),
     'Arab Republic of Egypt — here, the Sinai Peninsula',
     'Sinai was held by Israel from 1967 and returned to Egypt under the 1979 peace treaty.'),
    ('saudi-arabia', 'Saudi Arabia', 'state', '#7f9e45', find(UNITS, 'Saudi Arabia'),
     'Kingdom of Saudi Arabia — its north-west, the Hejaz and Tabuk', None),
    ('iraq', 'Iraq', 'state', '#6a8fab', find(UNITS, 'Iraq'), 'Republic of Iraq', None),
    ('jordan', 'Jordan', 'state', '#b98a5c', find(UNITS, 'Jordan'),
     'Hashemite Kingdom of Jordan, east of the Jordan and the Dead Sea',
     'At peace with Israel since 1994.'),
    ('syria', 'Syria', 'state', '#9b72b3', find(UNITS, 'Syria'),
     'Syrian Arab Republic',
     'Civil war from 2011; the Assad government fell in December 2024.'),
    ('lebanon', 'Lebanon', 'state', '#2f9e95', find(UNITS, 'Lebanon'),
     'Lebanese Republic',
     'Its south saw fighting between Israel and Hezbollah from October 2023; a ceasefire was agreed in November 2024.'),
    ('israel', 'Israel', 'state', '#4d7fd0', find(DISP, 'Israel'),
     'State of Israel within the 1949 armistice line (the "Green Line")', None),
    ('west-bank', 'West Bank', 'territory', '#3d9b61', find(UNITS, 'West Bank'),
     'Palestinian territory, held by Israel since 1967',
     'The Palestinian Authority administers the cities (Areas A and B); Israel controls Area C, including its settlements.'),
    # East Jerusalem with the 1949-67 no man's land in the city and the Mount Scopus enclave
    ('east-jerusalem', 'East Jerusalem', 'disputed', '#b45fc6',
     unary_union([find(DISP, 'East Jerusalem'), find(DISP, "No Man's Land (Jerusalem)"), find(DISP, 'Mount Scopus')]),
     'Administered by Israel (annexed 1980); claimed by Palestine',
     'Includes the Old City. Most states do not recognize the annexation.'),
    ('latrun', 'Latrun salient', 'disputed', '#a0896b', find(DISP, "No Man's Land (Fort Latrun)"),
     "Former no man's land of the 1949 armistice; administered by Israel since 1967, claimed by Palestine", None),
    ('gaza', 'Gaza Strip', 'territory', '#d97a3b', find(UNITS, 'Gaza'),
     'Palestinian territory; governed by Hamas from 2007',
     'War between Israel and Hamas from October 2023; under a ceasefire since October 2025.'),
    ('golan', 'Golan Heights', 'disputed', '#c9a227', find(DISP, 'Golan Heights'),
     'Administered by Israel since 1967 (annexed 1981); claimed by Syria', None),
    ('undof', 'UNDOF buffer zone', 'buffer', '#8d939c', find(DISP, 'UNDOF Zone'),
     'UN-patrolled separation zone between Israel and Syria (1974)',
     'Israeli forces entered the zone in December 2024, after the fall of the Assad government.'),
    ('shebaa', 'Shebaa Farms', 'disputed', '#c4568a', find(DISP, 'Shebaa Farms'),
     'Administered by Israel; claimed by Lebanon', 'The UN has treated the area as part of the Golan, i.e. Syrian.'),
]

def rnd(ring):
    out = []
    for x, y in ring:
        p = [round(x, 4), round(y, 4)]
        if not out or out[-1] != p:
            out.append(p)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()                       # rings are stored unclosed, like the tribes'
    return out

def polys_of(g):
    return list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]

out = []
for id_, name, kind, color, geom, status, note in E:
    g = geom.intersection(CLIP)
    small = g.area < 0.2                # Gaza, East Jerusalem, Shebaa… keep their detail
    g = g.simplify(0.0004 if small else 0.003, preserve_topology=True)
    polys = []
    for p in polys_of(g):
        if p.area < 1e-6:
            continue
        rings = [rnd(p.exterior.coords)] + [rnd(h.coords) for h in p.interiors if h.area > 1e-5]
        polys.append(rings)
    polys.sort(key=lambda rs: -abs(sum(rs[0][i][0] * rs[0][(i + 1) % len(rs[0])][1] - rs[0][(i + 1) % len(rs[0])][0] * rs[0][i][1] for i in range(len(rs[0])))))
    e = {'id': id_, 'name': name, 'kind': kind, 'color': color, 'status': status, 'polys': polys}
    if note:
        e['note'] = note
    out.append(e)
    print(f'{name:20} {kind:9} parts={len(polys)} pts={sum(len(r) for p in polys for r in p)}')

doc = {
    'attr': 'Natural Earth 1:10m admin-0 map units + disputed areas (public domain), de facto lines',
    'entries': out,
}
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
print('wrote', out_path)
