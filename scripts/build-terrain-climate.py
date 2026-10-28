#!/usr/bin/env python3
"""Bake src/lib/models/terrain-climate.json: how high and how warm every place and allotment on the Holy Land map is.

fieldy, 2026-10-28: "i want to know how high up the temple is, elevation of yaban-al, lot of yahawadah, lot of
aparayam, in ranges,, avg temperatures, etc".

Inputs (both free, fetched once, nothing at run time):
  - Elevation: AWS Terrain Tiles (Mapzen terrarium PNGs: SRTM/ASTER/ETOPO1 etc., public),
    https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png  — height = R*256 + G + B/256 - 32768 m.
    Tiles are cached in --cache.
  - Climate: WorldClim 2.1 monthly normals 1970–2000 at 2.5 arc-minutes (~4.6 km), tavg / tmin / tmax + its elev grid
    (Fick & Hijmans 2017, CC BY 4.0), https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_2.5m_{var}.zip
    A place's temperature is the grid value moved to the place's own height at 6.5 °C per 1,000 m (the grid cell's
    height is an average over ~5 km, so a hilltop and the wadi below it would otherwise read the same).
Shapes come from holyLand.js (dumped by scripts/dump-holyland-shapes.mjs) so the bake follows the map.

  node scripts/dump-holyland-shapes.mjs > /tmp/shapes.json
  python scripts/build-terrain-climate.py /tmp/shapes.json <dir with the 4 WorldClim zips> --cache /tmp/terrarium
"""
import argparse, io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image
import rasterio
from rasterio.windows import from_bounds
from shapely.geometry import Polygon, MultiPolygon, Point, shape
from shapely.ops import unary_union
import shapely
from shapely import prepared

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('shapes'); ap.add_argument('wcdir'); ap.add_argument('--cache', default='/tmp/terrarium')
a = ap.parse_args()
os.makedirs(a.cache, exist_ok=True)
S = json.load(open(a.shapes, encoding='utf-8'))
base = json.load(open(os.path.join(ROOT, 'src', 'lib', 'models', 'levant-base.json'), encoding='utf-8'))
LAPSE = -6.5 / 1000

# ── land mask (sea floor is in the tiles; lakes are kept as their surface, see below) ──
land = unary_union([Polygon(r[0], r[1:]).buffer(0) for r in base['land']])
lakes = unary_union([Polygon(l['ring']).buffer(0) for l in base['lakes'] if len(l['ring']) > 3])
land_p = prepared.prep(land)

# ── terrarium tiles ──
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
_tiles = {}
def tile(z, x, y):
    k = (z, x, y)
    if k not in _tiles:
        p = os.path.join(a.cache, f'{z}_{x}_{y}.png')
        if not os.path.exists(p):
            for attempt in range(5):
                try:
                    with urllib.request.urlopen(URL.format(z=z, x=x, y=y), timeout=60) as r:
                        body = r.read()
                    break
                except Exception:
                    if attempt == 4:
                        raise
            open(p, 'wb').write(body)
        im = np.asarray(Image.open(p).convert('RGB'), dtype=np.float64)
        _tiles[k] = im[:, :, 0] * 256 + im[:, :, 1] + im[:, :, 2] / 256 - 32768
    return _tiles[k]

def px(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x * 256, y * 256

def elev(lon, lat, z):
    """Bilinear height at a point."""
    X, Y = px(lon, lat, z)
    X -= 0.5; Y -= 0.5
    x0, y0 = math.floor(X), math.floor(Y)
    fx, fy = X - x0, Y - y0
    def at(xx, yy):
        return tile(z, xx // 256, yy // 256)[yy % 256, xx % 256]
    return ((1 - fx) * (1 - fy) * at(x0, y0) + fx * (1 - fy) * at(x0 + 1, y0)
            + (1 - fx) * fy * at(x0, y0 + 1) + fx * fy * at(x0 + 1, y0 + 1))

def elev_many(lons, lats, z):
    return np.array([elev(lo, la, z) for lo, la in zip(lons, lats)])

# ── WorldClim ──
W = (-9, 7, 59, 47)   # lon0 lat0 lon1 lat1 — everything the map names
def wc_read(var, month=None):
    name = f'wc2.1_2.5m_{var}' + (f'_{month:02d}' if month else '')
    path = f'/vsizip/{os.path.join(a.wcdir, f"wc2.1_2.5m_{var}.zip")}/{name}.tif'
    with rasterio.open(path) as ds:
        win = from_bounds(*W, transform=ds.transform).round_offsets().round_lengths()
        arr = ds.read(1, window=win).astype(np.float64)
        arr[arr <= -1e30] = np.nan
        if ds.nodata is not None:
            arr[arr == ds.nodata] = np.nan
        return arr, ds.window_transform(win)
print('reading WorldClim…', file=sys.stderr)
WC = {v: np.stack([wc_read(v, m)[0] for m in range(1, 13)]) for v in ('tavg', 'tmin', 'tmax')}
WCZ, T = wc_read('elev')
inv = ~T
RES = T.a

def wc_cell(lon, lat):
    c, r = inv * (lon, lat)
    return int(math.floor(r)), int(math.floor(c))

def wc_point(lon, lat):
    """Bilinear (NaN-aware) monthly values + grid height at a point."""
    c, r = inv * (lon, lat)
    c -= 0.5; r -= 0.5
    c0, r0 = int(math.floor(c)), int(math.floor(r))
    fx, fy = c - c0, r - r0
    out = {}
    for k, arr in (('z', WCZ[None]), *WC.items()):
        acc = np.zeros(arr.shape[0]); wsum = 0
        for dr, dc, w in ((0, 0, (1 - fx) * (1 - fy)), (0, 1, fx * (1 - fy)), (1, 0, (1 - fx) * fy), (1, 1, fx * fy)):
            v = arr[:, r0 + dr, c0 + dc]
            if not np.isnan(v).any() and w > 0:
                acc += w * v; wsum += w
        if wsum == 0:   # a coastal point between sea cells: nearest land cell
            best = None
            for dr in range(-3, 4):
                for dc in range(-3, 4):
                    v = arr[:, r0 + dr, c0 + dc]
                    if not np.isnan(v).any():
                        d = dr * dr + dc * dc
                        if best is None or d < best[0]:
                            best = (d, v)
            acc, wsum = (best[1], 1) if best else (np.full(arr.shape[0], np.nan), 1)
        out[k] = acc / wsum
    out['z'] = float(out['z'][0])
    return out

MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
def climate(tavg, tmin, tmax):
    cold, hot = int(np.argmin(tavg)), int(np.argmax(tavg))
    r1 = lambda v: round(float(v), 1)
    return {'year': r1(tavg.mean()),
            'cold': {'m': MON[cold], 'avg': r1(tavg[cold]), 'low': r1(tmin[cold])},
            'hot': {'m': MON[hot], 'avg': r1(tavg[hot]), 'high': r1(tmax[hot])}}

# ── points ──
out_pts = {}
for p in S['pts']:
    lon, lat = p['lon'], p['lat']
    inbase = 29 <= lat <= 34.8 and 33.5 <= lon <= 37.5
    h = elev(lon, lat, 13 if inbase else 11)
    over_lake = lakes.contains(Point(lon, lat))
    if h < 0 and not land_p.contains(Point(lon, lat)) and not over_lake:
        h = 0.0    # a coastal dot that falls just off the coastline: sea level, not the sea floor
    w = wc_point(lon, lat)
    if np.isnan(w['tavg']).any():
        out_pts[p['id']] = {'m': round(h)}
        continue
    dz = (h - w['z']) * LAPSE
    out_pts[p['id']] = {'m': round(h), **climate(w['tavg'] + dz, w['tmin'] + dz, w['tmax'] + dz)}
print(f'{len(out_pts)} places', file=sys.stderr)

# ── areas ──
def geom_of(polys):
    g = unary_union([Polygon(P[0], P[1:]).buffer(0) for P in polys])
    return g

out_areas = {}
for ar in S['areas']:
    g = geom_of(ar['polys'])
    g_land = g.intersection(land)
    if g_land.is_empty:
        continue
    x0, y0, x1, y1 = g_land.bounds
    km2 = g_land.area * 111.32 ** 2 * math.cos(math.radians((y0 + y1) / 2))
    # elevation: a grid of ≥ ~6,000 samples (or every 60 m for small plots), one zoom finer than the spacing
    step = max(math.sqrt(g_land.area / 20000), 0.0006)
    z = 13 if step < 0.004 else 12 if step < 0.008 else 11 if step < 0.016 else 10
    xs = np.arange(x0 + step / 2, x1, step); ys = np.arange(y0 + step / 2, y1, step)
    GX, GY = np.meshgrid(xs, ys)
    inside = shapely.contains_xy(g_land, GX, GY)
    lons, lats = GX[inside], GY[inside]
    if len(lons) < 20:   # a thin sliver: use its outline points too
        pts = [c for P in ar['polys'] for c in P[0]] + [g_land.representative_point().coords[0]]
        lons = np.array([q[0] for q in pts]); lats = np.array([q[1] for q in pts])
    hs = elev_many(lons, lats, z)
    on_lake = shapely.contains_xy(lakes, lons, lats) if not lakes.is_empty else np.zeros(len(lons), bool)
    hs_land = hs[~on_lake]
    if len(hs_land) == 0:
        hs_land = hs
    lo, hi = np.percentile(hs_land, [0.2, 99.8])   # trims single-pixel spikes and pits
    rec = {'lo': round(float(lo)), 'mid': round(float(np.median(hs_land))), 'hi': round(float(hi)), 'km2': round(km2)}
    lo_i, hi_i = int(np.argmin(np.abs(hs_land - lo))), int(np.argmin(np.abs(hs_land - hi)))
    LL = np.stack([lons[~on_lake], lats[~on_lake]], 1) if (~on_lake).any() else np.stack([lons, lats], 1)
    rec['loAt'] = [round(float(LL[lo_i][0]), 3), round(float(LL[lo_i][1]), 3)]
    rec['hiAt'] = [round(float(LL[hi_i][0]), 3), round(float(LL[hi_i][1]), 3)]
    # climate: every WorldClim cell whose centre is in the area (each moved to the area's own sampled heights is
    # overkill; cells are already ~5 km) — area mean, plus the spread of the year's mean across it
    r0, c0 = wc_cell(x0, y1); r1_, c1 = wc_cell(x1, y0)
    cells = []
    for r in range(r0, r1_ + 1):
        for c in range(c0, c1 + 1):
            lon_c, lat_c = T * (c + 0.5, r + 0.5)
            if g_land.contains(Point(lon_c, lat_c)) and not np.isnan(WC['tavg'][:, r, c]).any():
                cells.append((r, c))
    if not cells:
        cx, cy = g_land.representative_point().coords[0]
        w = wc_point(cx, cy)
        hc = elev(cx, cy, 12); dz = (hc - w['z']) * LAPSE
        tv, tn, tx = w['tavg'] + dz, w['tmin'] + dz, w['tmax'] + dz
        spread = None
    else:
        rr = np.array([c[0] for c in cells]); cc = np.array([c[1] for c in cells])
        tv, tn, tx = WC['tavg'][:, rr, cc], WC['tmin'][:, rr, cc], WC['tmax'][:, rr, cc]
        ann = tv.mean(0)
        spread = [round(float(np.percentile(ann, 2)), 1), round(float(np.percentile(ann, 98)), 1)]
        tv, tn, tx = tv.mean(1), tn.mean(1), tx.mean(1)
    rec.update(climate(tv, tn, tx))
    if spread and spread[1] - spread[0] >= 1:
        rec['yearSpread'] = spread
    out_areas[ar['id']] = rec
    print(f"  {ar['id']:18s} {rec['lo']:6d} {rec['mid']:6d} {rec['hi']:6d} m  z{z} n={len(hs)}  year {rec['year']} °C", file=sys.stderr)

doc = {
    'source': 'Elevation: AWS Terrain Tiles (terrarium; SRTM, ASTER, ETOPO1 and others). Climate: WorldClim 2.1, '
              'monthly normals 1970–2000, 2.5′ (Fick & Hijmans 2017, CC BY 4.0), moved to each place\'s height at 6.5 °C per 1,000 m.',
    'points': out_pts, 'areas': out_areas,
}
dst = os.path.join(ROOT, 'src', 'lib', 'models', 'terrain-climate.json')
json.dump(doc, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('wrote', dst, os.path.getsize(dst), 'bytes', file=sys.stderr)
