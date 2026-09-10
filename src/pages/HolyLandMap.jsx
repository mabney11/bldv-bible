/**
 * HolyLandMap.jsx — "The Holy Land in 3D": an interactive terrain map of the
 * Levant with two switchable tribal-allotment overlays:
 *
 *   • Joshua 13–19  — the conquest-era allotments (idealized polygons)
 *   • Ezekiel 47–48 — the millennial allotments: east–west bands from Dan in
 *     the north to Gad in the south, with the 25,000-square holy portion
 *     (Levites / priests + sanctuary / the city) and the prince's land either
 *     side, computed from the landmarks in ch. 47 (see lib/models/holyLand.js)
 *
 * plus the biblical cities of Joshua (paleo spelling + the app's own
 * transliteration) and today's cities, so that for any spot you can answer
 * "who is there now, and whose portion is it in?" — click a city, a band, or
 * anywhere on the map.
 *
 * Route: /models/holy-land   (linked from /models — "Maps & Models")
 * Deep links: ?city=<id>  ?overlay=joshua|ezekiel|both|none  ?basemap=plain|online  ?relief=0  ?places=1|0
 *             ?pin=<lon>,<lat>[,<label>]  — a dropped pin; every selection then shows its distance from it
 *
 * Phones (≤720px): the panel is a bottom sheet over the lower half and the map
 * is padded to match, so whatever was tapped or picked stays in view above it;
 * place dots start off (allotments only) and the ⚙ widget under the zoom
 * buttons toggles them. One "Find a place" box replaces the old search + Jabneel
 * button: empty it lists every place A→Z, typing filters live.
 *
 * Map engine: maplibre-gl (npm). The base map is BUILT IN — Natural Earth
 * coastlines/lakes/rivers bundled in lib/models/levant-base.json — so nothing
 * external is required. Relief shading / 3D (AWS Terrain Tiles) and the
 * optional "Online" base map (OpenFreeMap) are fetched only when enabled and
 * fail soft. Everything overlay-related is computed client-side from
 * lib/models/holyLand.js — no server route involved.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { useTheme } from '../hooks/useTheme.js';
import { apiTransChapter, apiSurface, apiLexicon, apiStrongsLookup } from '../lib/api.js';
import { transliterate } from '../lib/translit.js';
import { parseRefs, readerHref, inRanges } from '../lib/models/refs.js';
import { PassageRefs } from '../components/PassageRefs.jsx';
export { PassageRefs };
import {
  JOSHUA_TRIBES, BIBLICAL_CITIES, MODERN_CITIES, TRIBE_COLORS, TRIBE_HEBREW,
  HOLY_KIND_STYLE, EZEKIEL_ORDER, EZEKIEL_MEASURES, TRIBE_TRANSLIT, TRIBE_PALEO, tribeDisplayName,
  ezekielAllotment, toFeature, ringCentroid, labelAnchor, pointInRing, joshuaTribeAt, ezekielAt,
  squareToPaleo, translitOf,
  REGIONS, ALL_PLACES, PLACES_AZ, searchPlaces, haversineKm, bearingDeg, compass, fmtDistance, HOLY_WORDS,
  countryOf, countryFeature, countryName, twinOf, WATERS, BIBLE_RIVERS, EZ_LANDMARKS, TRIBE_SCRIPTURE, HOLY_SCRIPTURE,
} from '../lib/models/holyLand.js';

// Phones and narrow windows: the panel is a bottom sheet, place dots start off
// (allotments only), and the map is padded so a selection stays visible above the sheet.
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth <= 720;
const SHEET_FRACTION = 0.5;                       // the sheet covers the lower half
// How close a click on a portion takes you (fitBounds is capped here so the view is the
// same from every starting zoom): the bands stay in their country, the holy plots close
// enough that their names read as area text.
const PORTION_MAX_ZOOM = { joshua: 9.5, ezekiel: 9.5, prince: 11, levites: 12.5, priests: 12.5, food: 13, suburbs: 13, city: 13.5, sanctuary: 14 };
const WATER_MAX_ZOOM = 10.5;                       // a short brook still shows its surroundings
const REGION_DETAIL_ZOOM = 7.8;                   // from here the band labels also show the paleo line + English
const HOLY_BTN_ZOOM = 10.5;                       // above this the "Tharawamah" caption appears over the square
// The prince's portion (Ezekiel 48:21–22): a king and a lion — fieldy's pick.
const sheetPx = () => Math.round(window.innerHeight * SHEET_FRACTION);
import './HolyLandMap.css';

// ── Base map ─────────────────────────────────────────────────────────────────
// Default "Built-in" mode renders entirely from data shipped WITH the app —
// Natural Earth 10m coastlines, lakes and rivers (public domain), clipped to
// the wider Bible lands and bundled as src/lib/models/levant-base.json — so
// the map, every allotment, and every marker work with no tile server at all.
// Two things are fetched at runtime and degrade silently if unreachable:
//   • relief shading / 3D terrain — the AWS Terrain Tiles DEM (optional, a
//     checkbox; the map is flat without it)
//   • the optional "Online" base map — OpenFreeMap vector tiles (coast at street
//     precision, modern borders, English place names) — never loaded unless chosen.
import levantBase from '../lib/models/levant-base.json';

const OFM_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const DEM_ATTR = 'Relief: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a> (Mapzen)';
const NE_ATTR = 'Coastlines: <a href="https://www.naturalearthdata.com/">Natural Earth</a>';

const HOME_BOUNDS = [[33.3, 29.9], [37.6, 34.7]];
const KEY_CITY = 'jabneel-judah';   // Joshua 15:11 — always labelled, always highlighted

const BASEMAPS = [
  { id: 'plain',  label: 'Built-in',       sub: 'bundled coast & water — no tile server' },
  { id: 'online', label: 'Online terrain', sub: 'OpenFreeMap tiles' },
];
const EN_TEXT_FIELD = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
const SEA = '#7fa7c9', LAND = '#d9cfb8', RIVER = '#6d98bd';

let _ofmStylePromise = null;
function loadOfmStyle() {
  if (!_ofmStylePromise) {
    _ofmStylePromise = fetch(OFM_STYLE_URL).then((r) => {
      if (!r.ok) throw new Error(`basemap style ${r.status}`);
      return r.json();
    }).catch((e) => { _ofmStylePromise = null; throw e; });
  }
  return _ofmStylePromise;
}

// GeoJSON from the bundled Natural Earth extract. The sea is one polygon with
// every land polygon as a hole, so it can be drawn OVER the allotments —
// that is what clips every border at the coast (see applyOverlays).
let _levantGeo = null;
function levantGeo() {
  if (_levantGeo) return _levantGeo;
  const [x0, y0, x1, y1] = levantBase.bbox;
  const outer = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const close = (r) => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r);
  const landRings = levantBase.land.map((p) => close(p[0]));
  _levantGeo = {
    land:  { type: 'FeatureCollection', features: landRings.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r] } })) },
    sea:   { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [outer, ...landRings] } },
    lakes: { type: 'FeatureCollection', features: levantBase.lakes.map((l) => ({ type: 'Feature', properties: { name: l.name }, geometry: { type: 'Polygon', coordinates: [close(l.ring)] } })) },
    rivers:{ type: 'FeatureCollection', features: levantBase.rivers.map((l) => ({ type: 'Feature', properties: { name: l.name }, geometry: { type: 'LineString', coordinates: l.pts } })) },
  };
  return _levantGeo;
}

// The outline of a water (its shore, or the river's course) for the gold focus.
function waterGeometry(w) {
  const g = levantGeo();
  const feats = [];
  if (w.base === 'sea') feats.push(...g.land.features.map((f) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: f.geometry.coordinates[0] } })));
  else {
    for (const f of g.lakes.features) if (f.properties.name === w.base) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: f.geometry.coordinates[0] } });
    for (const f of g.rivers.features) if (f.properties.name === w.base) feats.push(f);
    for (const r of BIBLE_RIVERS) if (r.id === w.base) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.pts } });
  }
  return feats;
}

// The view a water gets: the whole body (or course) plus its label, so the name is on it.
// The Great Sea has no far shore to frame: the view holds the reach that was tapped AND the
// sea's name (a phone cannot zoom all the way out — fieldy — but the name must be on the water).
function waterBounds(w, at) {
  if (w.base === 'sea') {
    const pts = [[w.lon, w.lat], at || [w.lon, w.lat]];
    const lons = pts.map((q) => q[0]), lats = pts.map((q) => q[1]);
    return [[Math.min(...lons) - 0.25, Math.min(...lats) - 0.25], [Math.max(...lons) + 0.25, Math.max(...lats) + 0.25]];
  }
  let pts = waterGeometry(w).flatMap((f) => f.geometry.coordinates);
  let labels = WATERS.filter((x) => x.id === w.id || x.twin === w.id).map((x) => [x.lon, x.lat]);
  const lake = levantGeo().lakes.features.some((f) => f.properties.name === w.base);
  if (!lake && at) {
    // a river runs the length of the land: frame the REACH that was tapped (± ~40 km) with the
    // nearest of its names, not the whole course from Hermon to the Salt Sea
    const near = pts.filter((q) => Math.abs(q[0] - at[0]) < 0.3 && Math.abs(q[1] - at[1]) < 0.35);
    if (near.length > 1) pts = near;
    labels.sort((p1, p2) => Math.hypot(p1[0] - at[0], p1[1] - at[1]) - Math.hypot(p2[0] - at[0], p2[1] - at[1]));
    labels = labels.slice(0, 1);
    pts = [...pts, at];
  }
  const all = [...pts, ...labels];
  if (!all.length) return [[w.lon - 0.2, w.lat - 0.2], [w.lon + 0.2, w.lat + 0.2]];
  const lons = all.map((p) => p[0]), lats = all.map((p) => p[1]);
  // a river's label sits beside it: give the frame a little air on every side
  const padX = Math.max(0.06, (Math.max(...lons) - Math.min(...lons)) * 0.08);
  const padY = Math.max(0.06, (Math.max(...lats) - Math.min(...lats)) * 0.08);
  return [[Math.min(...lons) - padX, Math.min(...lats) - padY], [Math.max(...lons) + padX, Math.max(...lats) + padY]];
}

// Which water (if any) a tap on the base map landed on: a lake, a river, the Bible's rivers,
// or the sea itself. Rivers get 14 px of tolerance either side.
function waterHit(map, pt) {
  const q = (layers, pad = 0) => {
    const ls = layers.filter((id) => map.getLayer(id));
    if (!ls.length) return null;
    const box = pad ? [[pt.x - pad, pt.y - pad], [pt.x + pad, pt.y + pad]] : pt;
    return map.queryRenderedFeatures(box, { layers: ls })[0] || null;
  };
  const f = q(['hl-lakes']) || q(['hl-rivers', 'hl-bible-rivers'], 14) || q(['water']);
  if (!f) return null;
  const base = f.layer.id === 'water' ? 'sea' : f.properties.name;
  return WATERS.find((w) => w.base === base && !w.twin) || null;
}

// Runs of shoreline (coast and lakeshore) inside a ring → LineStrings, for the gold border.
function shoreInside(ring) {
  const g = levantGeo();
  const lines = [...g.land.features.map((f) => f.geometry.coordinates[0]), ...g.lakes.features.map((f) => f.geometry.coordinates[0])];
  const out = [];
  const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  const bx = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  const near = (p) => p[0] >= bx[0] && p[0] <= bx[2] && p[1] >= bx[1] && p[1] <= bx[3];
  for (const pts of lines) {
    let run = [];
    const push = (p) => { if (pointInRing(p, ring)) run.push(p); else { if (run.length > 1) out.push(run); run = []; } };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      push(p);
      // long shoreline edges (a lake drawn with few vertices) are split so the gold follows
      // the shore right up to the portion's cut line instead of stopping at the last vertex
      if (q && (near(p) || near(q))) {
        const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.01);
        for (let k = 1; k < n; k++) push([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n]);
      }
    }
    if (run.length > 1) out.push(run);
  }
  return out.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }));
}

const DEM_SOURCES = {
  'hl-dem':      { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: DEM_ATTR },
  'hl-dem-hill': { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 },
};
const HILLSHADE = { id: 'hl-hillshade', type: 'hillshade', source: 'hl-dem-hill',
  paint: { 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': '#3b2f1e', 'hillshade-highlight-color': '#fff8e8' } };

// The built-in style: needs nothing from the network except (optionally) relief.
function buildPlainStyle() {
  const g = levantGeo();
  return {
    version: 8,
    sources: {
      'hl-land':   { type: 'geojson', data: g.land, attribution: NE_ATTR },
      'hl-sea':    { type: 'geojson', data: g.sea },
      'hl-lakes':  { type: 'geojson', data: g.lakes },
      'hl-rivers': { type: 'geojson', data: g.rivers },
      'hl-bible-rivers': { type: 'geojson', data: { type: 'FeatureCollection', features: BIBLE_RIVERS.map((r) => ({ type: 'Feature', properties: { name: r.id }, geometry: { type: 'LineString', coordinates: r.pts } })) } },
      ...DEM_SOURCES,
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': SEA } },
      { id: 'hl-land', type: 'fill', source: 'hl-land', paint: { 'fill-color': LAND } },
      HILLSHADE,
      // ── allotment layers are inserted here, beneath 'water' ──
      { id: 'water', type: 'fill', source: 'hl-sea', paint: { 'fill-color': SEA } },
      { id: 'hl-lakes', type: 'fill', source: 'hl-lakes', paint: { 'fill-color': SEA } },
      { id: 'hl-coast', type: 'line', source: 'hl-land', paint: { 'line-color': '#4f7599', 'line-width': 0.8, 'line-opacity': 0.8 } },
      { id: 'hl-lake-line', type: 'line', source: 'hl-lakes', paint: { 'line-color': '#4f7599', 'line-width': 0.8, 'line-opacity': 0.8 } },
      { id: 'hl-rivers', type: 'line', source: 'hl-rivers', paint: { 'line-color': RIVER, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 9, 1.8] } },
      { id: 'hl-bible-rivers', type: 'line', source: 'hl-bible-rivers', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': RIVER, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 9, 1.6] } },
    ],
  };
}

// The online style: OpenFreeMap "liberty" trimmed to water, borders and (English) place names.
function buildOnlineStyle(ofm) {
  const base = JSON.parse(JSON.stringify(ofm));
  const layers = base.layers.filter((l) => l.type === 'background' || ['water', 'waterway', 'water_name', 'boundary', 'place'].includes(l['source-layer']));
  const bg = layers.find((l) => l.type === 'background');
  if (bg) bg.paint = { 'background-color': LAND };
  for (const l of layers) {
    if (l['source-layer'] === 'water' && l.type === 'fill') l.paint = { ...(l.paint || {}), 'fill-color': SEA, 'fill-opacity': 1 };
    if (l['source-layer'] === 'waterway' && l.type === 'line') l.paint = { ...(l.paint || {}), 'line-color': RIVER };
    if (l.type === 'symbol' && l.layout?.['text-field'] !== undefined) l.layout = { ...l.layout, 'text-field': EN_TEXT_FIELD };
  }
  const idx = Math.max(0, layers.findIndex((l) => l.type === 'symbol' || ['water', 'waterway'].includes(l['source-layer'])));
  const style = { ...base, sources: { ...base.sources, ...DEM_SOURCES }, layers: [...layers.slice(0, idx), HILLSHADE, ...layers.slice(idx)] };
  delete style.terrain;
  return style;
}

// ── Fitting a portion into view ──────────────────────────────────────────────
// The bottom sheet's share of the screen lives in the MAP's padding (so the centre of the
// visible half is the centre), and fitBounds' own padding is only the margin around the
// portion. Handing fitBounds the sheet AND the margin double-counted the sheet: after a
// water tap had set the map's padding, the next portion could not fit "within the canvas"
// and fitBounds silently did nothing — the card changed, the view did not (fieldy, on his
// phone and in the browser). If even the margin cannot fit, fit with none rather than not at all.
function fitView(map, bounds, { maxZoom = 9.5, pitch = 0, duration = 1200, margin = 80, sheet = true } = {}) {
  const narrow = isNarrow();
  map.setPadding({ top: 0, left: 0, right: 0, bottom: narrow && sheet ? sheetPx() : 0 });
  const pad = narrow ? { top: 40, left: 30, right: 30, bottom: 30 } : margin;
  const opts = { padding: pad, maxZoom, pitch, duration, essential: true };
  if (!map.cameraForBounds(bounds, opts)) opts.padding = 0;
  map.fitBounds(bounds, opts);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtLonLat([lon, lat]) {
  return `${lat.toFixed(3)}°N ${lon.toFixed(3)}°E`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HolyLandMap() {
  usePageTitle(pageTitle('Holy Land in 3D — Maps & Models'));
  const { theme, toggle: toggleTheme } = useTheme();
  const [params, setParams] = useSearchParams();

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const styleReady = useRef(false);

  const initialOverlay = params.get('overlay') || 'ezekiel';
  const [showJoshua, setShowJoshua] = useState(initialOverlay === 'joshua' || initialOverlay === 'both');
  const [showEzekiel, setShowEzekiel] = useState(initialOverlay === 'ezekiel' || initialOverlay === 'both');
  // Place dots: OFF when the model opens (fieldy: "upon entry I see a nice visual of the
  // allotments"); the ⚙ widget / Layers tab / picking a place turns them on. ?places=1 overrides.
  const placesParam = params.get('places');         // ?places=1|0 overrides
  const placesDefault = placesParam ? placesParam !== '0' : false;
  const [showBiblical, setShowBiblical] = useState(placesDefault);
  const [showModern, setShowModern] = useState(placesDefault);
  const [showRegions, setShowRegions] = useState(placesDefault);
  const [gearOpen, setGearOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);  // the ⚙ widget beside the zoom buttons
  const [ctxOnly, setCtxOnly] = useState(true);     // Cities / Peoples tabs limited to the focused portion
  const [pin, setPin] = useState(() => {            // { lon, lat, label }
    const p = params.get('pin');
    if (!p) return null;
    const [lon, lat, ...rest] = p.split(',');
    return Number.isFinite(+lon) && Number.isFinite(+lat) ? { lon: +lon, lat: +lat, label: rest.join(',') || 'Pin' } : null;
  });
  const [basemap, setBasemap] = useState(params.get('basemap') === 'online' ? 'online' : 'plain');
  const [relief, setRelief] = useState(params.get('relief') !== '0');   // hillshade from the DEM (network)
  const [onlineLabels, setOnlineLabels] = useState(false);              // place names in the online base map
  const [exag, setExag] = useState(1.6);
  const [threeD, setThreeD] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 720);
  const panelOpenRef = useRef(panelOpen); panelOpenRef.current = panelOpen;
  const [tab, setTab] = useState('layers');    // layers | cities | peoples
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);         // { kind:'city'|'joshua'|'ezekiel'|'holy'|'point', ... }
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(6);

  const ez = useMemo(() => ezekielAllotment(), []);

  // ── What's at a point (shared by every click) ──────────────────────────────
  const describePoint = useCallback((lonLat) => {
    const j = joshuaTribeAt(lonLat);
    const e = ezekielAt(lonLat, ez);
    return { joshua: j, ezekiel: e };
  }, [ez]);

  const citiesIn = useCallback((ring) => ({
    biblical: BIBLICAL_CITIES.filter((c) => pointInRing([c.lon, c.lat], ring)),
    modern:   MODERN_CITIES.filter((c) => pointInRing([c.lon, c.lat], ring)),
  }), []);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const selectCity = useCallback((c, fly = true) => {
    const at = describePoint([c.lon, c.lat]);
    setSel({ kind: 'city', city: c, ...at });
    setPanelOpen(true);
    setGearOpen(false);
    // Picking a place turns its kind of dot on, so the gold focus has a dot to sit on.
    if (c.kind === 'modern') setShowModern(true); else if (c.kind === 'region') setShowRegions(true); else setShowBiblical(true);
    const map = mapRef.current;
    const padding = isNarrow() ? { top: 0, left: 0, right: 0, bottom: sheetPx() } : { top: 0, left: 0, right: 0, bottom: 0 };
    if (fly && map) {
      // Far-off nations get a wide view; cities get a close one.
      // Gentle: come in to a readable scale when far away, never zoom in further when already close.
      const cur = map.getZoom();
      const outline = c.kind === 'region' ? countryFeature(countryOf(c)) : null;
      if (outline) {
        // A nation: frame the whole country whose border is outlined.
        const pts = outline.geometry.coordinates.flatMap((poly) => poly[0]);
        const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
        map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: { top: 40 + padding.top, left: 40, right: 40, bottom: 40 + padding.bottom }, maxZoom: 7, pitch: threeD ? 55 : 0, duration: 1400, essential: true });
      } else {
        const zoom = c.kind === 'region' ? Math.min(Math.max(cur, 5.5), 7) : (cur < 9.5 ? 9.5 : cur);
        map.flyTo({ center: [c.lon, c.lat], zoom, padding, pitch: threeD ? 55 : 0, duration: 1400, essential: true });
      }
    } else if (map && isNarrow()) {
      // Tapped on the map: slide the point up into the half the sheet leaves free.
      map.easeTo({ center: [c.lon, c.lat], padding, duration: 500 });
    }
    const next = new URLSearchParams(params);
    next.set('city', c.id);
    setParams(next, { replace: true });
  }, [describePoint, params, setParams, threeD]);

  // A river or a sea: its card (verses, prophecies, the name's anatomy) and a gold outline.
  const selectWater = useCallback((w, opts = {}) => {
    const water = w.twin ? WATERS.find((x) => x.id === w.twin) || w : w;
    setSel({ kind: 'water', water, at: opts.at || [w.lon, w.lat] });
    setPanelOpen(true);
    setGearOpen(false);
    const map = mapRef.current;
    if (!map) return;
    // Frame the WHOLE water with its name on it (fieldy, on his phone: "I would rather be
    // zoomed out to see the full body of water and clearly see the name of it") — the same
    // view whether it was tapped from far out or from inside a city. The Great Sea has no
    // end: frame its Levant shore, from the Brook of Egypt up past Tyre, with the label.
    const fit = () => fitView(map, waterBounds(water, opts.at), { maxZoom: water.base === 'sea' ? 8.5 : WATER_MAX_ZOOM, pitch: threeD ? 45 : 0, duration: 1100, margin: 60 });
    if (!isNarrow() && !panelOpenRef.current) {
      let done = false;
      const go = () => { if (done) return; done = true; fit(); };
      map.once('resize', go);
      setTimeout(go, 150);
    } else fit();
  }, [threeD]);
  const selectWaterRef = useRef(selectWater); selectWaterRef.current = selectWater;

  const selectRegion = useCallback((kind, entry, opts = {}) => {
    setSel({ kind, entry, cities: citiesIn(entry.ring), at: opts.at || null });
    setPanelOpen(true);
    setGearOpen(false);
    const map = mapRef.current;
    if (!map) return;
    const narrow = isNarrow();
    const lons = entry.ring.map((p) => p[0]), lats = entry.ring.map((p) => p[1]);
    // Every portion has ONE view — the same whether it was tapped on the map, picked from a
    // chip or a card, and whatever the zoom was before: a tap from far away zooms in until
    // the portion fills the screen, a tap from inside the city zooms out to the whole band.
    // maxZoom keeps a portion from becoming a wall of colour, but stays close enough on the
    // small plots that their captions (Maqadash, Iyar…) are still readable.
    const bounds = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
    const fit = () => fitView(map, bounds, { maxZoom: PORTION_MAX_ZOOM[kind === 'holy' ? entry.kind : kind] ?? 9.5, pitch: threeD ? 45 : 0, duration: 1200 });
    if (!narrow && !panelOpenRef.current) {
      // On a desktop the side panel is about to open and take 360 px from the map: fit AFTER
      // the canvas has shrunk, or the portion lands half under the panel.
      let done = false;
      const go = () => { if (done) return; done = true; fit(); };
      map.once('resize', go);
      setTimeout(go, 150);
    } else fit();
  }, [citiesIn, threeD]);

  // ── Overlay (re)build — called on every style load and on data changes ─────
  const applyOverlays = useCallback((map) => {
    if (!map || !styleReady.current) return;
    const ensure = (id, data) => {
      const src = map.getSource(id);
      if (src) src.setData(data); else map.addSource(id, { type: 'geojson', data });
    };
    // Pin → selection line (great-circle, densified so it curves correctly when far).
    const selPt = sel?.kind === 'city' ? [sel.city.lon, sel.city.lat] : sel?.kind === 'point' ? sel.lonLat : sel?.kind === 'water' ? sel.at : null;
    const lineFeatures = [];
    if (pin && selPt && (pin.lon !== selPt[0] || pin.lat !== selPt[1])) {
      const n = 48, pts = [];
      const r = Math.PI / 180, a1 = pin.lat * r, o1 = pin.lon * r, a2 = selPt[1] * r, o2 = selPt[0] * r;
      const d = 2 * Math.asin(Math.sqrt(Math.sin((a2 - a1) / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin((o2 - o1) / 2) ** 2)) || 1e-9;
      for (let i = 0; i <= n; i++) {
        const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(a1) * Math.cos(o1) + B * Math.cos(a2) * Math.cos(o2);
        const y = A * Math.cos(a1) * Math.sin(o1) + B * Math.cos(a2) * Math.sin(o2);
        const z = A * Math.sin(a1) + B * Math.sin(a2);
        pts.push([Math.atan2(y, x) / r, Math.atan2(z, Math.sqrt(x * x + y * y)) / r]);
      }
      lineFeatures.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
    }
    ensure('hl-pin-line', { type: 'FeatureCollection', features: lineFeatures });
    // Gold glow around the selected portion (the app's focus colour).
    const focusEntry = sel?.entry?.ring ? sel.entry : null;
    ensure('hl-focus', { type: 'FeatureCollection', features: focusEntry ? [toFeature(focusEntry)] : [] });
    // The portion's border along the water is the SHORE, not the offshore ring: every run of
    // coast / lakeshore vertices that lies inside the selected ring is drawn gold above the water.
    ensure('hl-focus-shore', { type: 'FeatureCollection', features: focusEntry ? shoreInside(focusEntry.ring) : sel?.kind === 'water' ? waterGeometry(sel.water) : [] });
    // Purple outline of the modern country a selected NATION stands in (Greece, Egypt, Edom → Jordan).
    // Cities get only their gold dot — a whole country lit up around Ashdod read as "what is highlighted?".
    const countryF = sel?.kind === 'city' && sel.city.kind === 'region' ? countryFeature(countryOf(sel.city)) : null;
    ensure('hl-country', { type: 'FeatureCollection', features: countryF ? [countryF] : [] });
    ensure('hl-joshua', { type: 'FeatureCollection', features: JOSHUA_TRIBES.map((t) => toFeature(t, { color: TRIBE_COLORS[t.tribe] })) });
    ensure('hl-ez-bands', { type: 'FeatureCollection', features: ez.bands.map((b) => toFeature(b, { color: TRIBE_COLORS[b.tribe] })) });
    ensure('hl-ez-holy', { type: 'FeatureCollection', features: ez.holy.map((h) => toFeature(h, { color: HOLY_KIND_STYLE[h.kind].color, opacity: HOLY_KIND_STYLE[h.kind].opacity })) });
    // The 25,000 × 25,000 square itself — a permanent golden glow (Matthew 5:14–16), visible at every zoom.
    const [sqW, sqTop, sqE, sqBot] = ez.meta.square;
    ensure('hl-holy-square', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[sqW, sqTop], [sqE, sqTop], [sqE, sqBot], [sqW, sqBot], [sqW, sqTop]]] } }] });

      // Allotment fills/lines go UNDER the basemap's water layer so the sea
    // paints over them — borders end at the coast instead of running into it.
    const waterId = map.getLayer('water') ? 'water' : undefined;
    const addLayer = (layer, under = true) => { if (!map.getLayer(layer.id)) map.addLayer(layer, under ? waterId : undefined); };
    const selId = sel?.entry?.id || null;
    // Baseline is what used to be the selected shade (fieldy: "I like the color they turn when
    // selected as the baseline"); the selection now adds a touch more plus the gold glow.
    const fillOpacity = (base) => ['case', ['==', ['get', 'id'], selId || '__none__'], Math.min(base + 0.15, 0.95), base];

    // Ezekiel first (below), Joshua above — so with both on, Joshua's smaller
    // shapes read on top of the wide bands. Each has its own toggle anyway.
    addLayer({ id: 'hl-ez-fill', type: 'fill', source: 'hl-ez-bands', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': fillOpacity(0.68) } });
    addLayer({ id: 'hl-ez-line', type: 'line', source: 'hl-ez-bands', paint: { 'line-color': '#1a1208', 'line-width': 1.2, 'line-opacity': 0.8 } });
    addLayer({ id: 'hl-holy-fill', type: 'fill', source: 'hl-ez-holy', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['*', ['get', 'opacity'], 0.85] } });
    addLayer({ id: 'hl-holy-line', type: 'line', source: 'hl-ez-holy', paint: { 'line-color': '#1a1208', 'line-width': 1.4 } });
    addLayer({ id: 'hl-joshua-fill', type: 'fill', source: 'hl-joshua', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': fillOpacity(0.72) } });
    addLayer({ id: 'hl-joshua-line', type: 'line', source: 'hl-joshua', paint: { 'line-color': '#1a1208', 'line-width': 1.6, 'line-dasharray': [2, 1] } });
    // red, so it can never be mistaken for the gold selection glow
    addLayer({ id: 'hl-holy-square-glow', type: 'line', source: 'hl-holy-square', paint: { 'line-color': '#e03030', 'line-width': 14, 'line-blur': 9, 'line-opacity': 0.85 } }, false);
    addLayer({ id: 'hl-holy-square-line', type: 'line', source: 'hl-holy-square', paint: { 'line-color': '#c02020', 'line-width': 1.6, 'line-opacity': 0.95 } }, false);
    addLayer({ id: 'hl-focus-glow', type: 'line', source: 'hl-focus', paint: { 'line-color': '#e8aa55', 'line-width': 22, 'line-blur': 12, 'line-opacity': 0.85 } });
    addLayer({ id: 'hl-focus-line', type: 'line', source: 'hl-focus', paint: { 'line-color': '#f5c070', 'line-width': 2.5 } });
    addLayer({ id: 'hl-focus-shore-glow', type: 'line', source: 'hl-focus-shore', paint: { 'line-color': '#e8aa55', 'line-width': 22, 'line-blur': 12, 'line-opacity': 0.85 } }, false);
    addLayer({ id: 'hl-focus-shore-line', type: 'line', source: 'hl-focus-shore', paint: { 'line-color': '#f5c070', 'line-width': 2.5 } }, false);
    addLayer({ id: 'hl-country-glow', type: 'line', source: 'hl-country', paint: { 'line-color': '#a78bfa', 'line-width': 10, 'line-blur': 6, 'line-opacity': 0.55 } }, false);
    addLayer({ id: 'hl-country-line', type: 'line', source: 'hl-country', paint: { 'line-color': '#7c3aed', 'line-width': 2.2, 'line-opacity': 0.95 } }, false);
    addLayer({ id: 'hl-pin-line-casing', type: 'line', source: 'hl-pin-line', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.7 } }, false);
    addLayer({ id: 'hl-pin-line', type: 'line', source: 'hl-pin-line', paint: { 'line-color': '#e05555', 'line-width': 2.5, 'line-dasharray': [3, 2] } }, false);

    const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('hl-ez-fill', showEzekiel); vis('hl-ez-line', showEzekiel);
    vis('hl-holy-fill', showEzekiel); vis('hl-holy-line', showEzekiel);
    vis('hl-holy-square-glow', showEzekiel); vis('hl-holy-square-line', showEzekiel);
    vis('hl-joshua-fill', showJoshua); vis('hl-joshua-line', showJoshua);
    map.setPaintProperty('hl-ez-fill', 'fill-opacity', fillOpacity(0.68));
    map.setPaintProperty('hl-joshua-fill', 'fill-opacity', fillOpacity(0.72));
    vis('hl-hillshade', relief);
    // Online base map: place names off unless asked for (they collide with ours).
    for (const l of map.getStyle().layers) {
      if (l.type === 'symbol' && l.source === 'openmaptiles') map.setLayoutProperty(l.id, 'visibility', onlineLabels ? 'visible' : 'none');
    }

    // ── DOM markers (cities + region labels) — rebuilt wholesale; cheap at this size.
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    const mk = (lonLat, el, meta) => {
      const m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lonLat).addTo(map);
      if (meta) m._hl = meta;
      markersRef.current.push(m);
      return m;
    };
    const selCityId = sel?.kind === 'city' ? sel.city.id : null;

    // Ezekiel's border landmarks (47:15–20) — Hethlon, Lebo-hamath, Zedad, Berothah,
    // Hazar-enan, Damascus, Hauran, Tamar, Meribath-kadesh — stand out as gold anchors
    // among the biblical cities when those are on (fieldy: the first view is the pure
    // allotments — no Damashaq until the cities are turned on).
    const anchorIds = showEzekiel && showBiblical ? new Set(EZ_LANDMARKS) : new Set();
    for (const id of anchorIds) {
      const c = BIBLICAL_CITIES.find((x) => x.id === id);
      if (!c) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `hl-mk hl-mk-b hl-mk-anchor${c.id === selCityId ? ' hl-mk-sel' : ''}`;
      el.innerHTML = `<span class="hl-mk-dot"></span><span class="hl-mk-lbl"><span class="hl-mk-name">${c.translit}</span><span class="hl-mk-paleo" dir="rtl">${c.paleo}</span><span class="hl-mk-en">${c.name}</span></span>`;
      el.title = `${c.translit} (${c.name}) — a landmark of Ezekiel's border — read ${c.ref}`;
      el.addEventListener('click', (e) => { e.stopPropagation(); selectCity(c, false); });
      mk([c.lon, c.lat], el, { pri: c.id === selCityId ? 1 : 1.5, w: Math.max(c.translit.length, c.name.length) * 7 + 14 });
    }
    if (showBiblical) {
      for (const c of BIBLICAL_CITIES) {
        if (anchorIds.has(c.id)) continue;   // already on the map as a border anchor
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `hl-mk hl-mk-b${c.id === KEY_CITY ? ' hl-mk-key' : ''}${c.id === selCityId ? ' hl-mk-sel' : ''}`;
        // One site, one dot: when today's city stands on the tel (TWINS rel 'same') its name
        // rides on this marker and its own dot is not drawn — nothing to fumble between.
        const tw = twinOf(c);
        const today = showModern && tw && tw.rel === 'same' ? `<span class="hl-mk-today">today ${tw.modern.name}</span>` : '';
        el.innerHTML = `<span class="hl-mk-dot${today ? ' hl-mk-dot-twin' : ''}"></span><span class="hl-mk-lbl"><span class="hl-mk-name">${c.translit}</span><span class="hl-mk-paleo" dir="rtl">${c.paleo}</span><span class="hl-mk-en">${c.name}</span>${today}</span>`;
        el.title = `${c.translit} (${c.name})${tw && tw.rel === 'same' ? ` — ${tw.modern.name} today` : ''} — read ${c.ref}`;
        el.addEventListener('click', (e) => { e.stopPropagation(); selectCity(c, false); });
        mk([c.lon, c.lat], el, { pri: c.id === KEY_CITY ? 0 : c.id === selCityId ? 1 : 2, w: Math.max(c.translit.length, c.name.length) * 7 + 14 });
      }
    }
    if (showModern) {
      for (const c of MODERN_CITIES) {
        const el = document.createElement('button');
        el.type = 'button';
        // A modern city on the same tel as a biblical one (Yavne on Jabneel, Hebron on
        // Hebron…) is folded into the biblical marker when both layers are on (see above).
        const tw = twinOf(c);
        if (showBiblical && tw && tw.rel === 'same') continue;
        el.className = `hl-mk hl-mk-m${c.id === selCityId ? ' hl-mk-sel' : ''}`;
        el.innerHTML = `<span class="hl-mk-dot"></span><span class="hl-mk-lbl"><span class="hl-mk-name">${c.name}</span></span>`;
        el.title = `${c.name} (${c.country})`;
        el.addEventListener('click', (e) => { e.stopPropagation(); selectCity(c, false); });
        mk([c.lon, c.lat], el, { pri: c.id === selCityId ? 1 : 4, w: c.name.length * 7 + 14 });
      }
    }
    if (showRegions) {
      for (const c of REGIONS) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `hl-mk hl-mk-r${c.id === selCityId ? ' hl-mk-sel' : ''}`;
        el.innerHTML = `<span class="hl-mk-dot"></span><span class="hl-mk-lbl"><span class="hl-mk-name">${c.translit}</span><span class="hl-mk-paleo" dir="rtl">${c.paleo}</span><span class="hl-mk-en">${c.name}</span></span>`;
        el.title = `${c.name} — ${c.translit} — ${c.ref}`;
        el.addEventListener('click', (e) => { e.stopPropagation(); selectCity(c, false); });
        mk([c.lon, c.lat], el, { pri: c.id === selCityId ? 1 : 3, w: Math.max(c.translit.length, c.name.length) * 7 + 14 });
      }
    }
    declutterRef.current(map);
    if (pin) {
      const el = document.createElement('div');
      el.className = 'hl-pin';
      el.innerHTML = `<span class="hl-pin-icon">📍</span><span class="hl-pin-lbl">${pin.label}</span>`;
      el.title = `Pin: ${pin.label}`;
      const m = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([pin.lon, pin.lat]).addTo(map);
      markersRef.current.push(m);
    }
    // a Joshua lot that lies inside another (Simeon within Judah) keeps the outer lot's label off it
    const ringArea = (r) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    const innerLots = (entry) => JOSHUA_TRIBES.filter((t) => t !== entry && ringArea(t.ring) < ringArea(entry.ring) && pointInRing(ringCentroid(t.ring), entry.ring)).map((t) => t.ring);
    const regionLabel = (entry, cls, onClick, avoid = []) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `hl-rl ${cls}`;
      const tribe = entry.tribe;
      el.innerHTML = `<span class="hl-rl-name">${tribeDisplayName(entry.name, tribe)}</span>${tribe ? `<span class="hl-rl-paleo" dir="rtl">${TRIBE_PALEO[tribe] || ''}</span><span class="hl-rl-en">${entry.name}</span>` : ''}`;
      el.style.setProperty('--c', TRIBE_COLORS[tribe] || '#fff');
      el.title = `${entry.name} — cities in this portion and ${entry.ref}`;
      el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      // anchored INSIDE the shape (widest run at mid-latitude); fitRegionLabels() sizes the
      // name to that run's width and the band's height
      const a = labelAnchor(entry.ring, 2.5, avoid);
      const m = mk([a.lon, a.lat], el);
      m._rl = { west: a.west, east: a.east, latSpan: a.latSpan, len: tribeDisplayName(entry.name, tribe).length, kind: 'band' };
    };
    if (showJoshua) for (const t of JOSHUA_TRIBES) regionLabel(t, 'hl-rl-j', () => selectRegion('joshua', t), innerLots(t));
    if (showEzekiel) {
      for (const b of ez.bands) regionLabel(b, 'hl-rl-e', () => selectRegion('ezekiel', b));
      for (const h of ez.holy) {
        const st = HOLY_KIND_STYLE[h.kind];
        if (!st.label) continue;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `hl-rl hl-rl-h hl-rl-h-${h.kind}`;
        // Zoomed out the plot is a lettered button (Z, L, C, S, X); once its name fits inside
        // the plot (data-fit="lg") the button goes and the name stands as free text in the area,
        // like the prince's 🦁🤴🏾 Nashayaa Chalaqayam — the whole plot is the button, and the
        // sanctuary is the whole red square, not a box within it.
        el.innerHTML = h.kind === 'prince'
          ? `<span class="hl-prince"><span class="hl-prince-ico">🦁🤴🏾</span><span class="hl-rl-cap">${h.short}</span><span class="hl-rl-en">${h.en}</span></span>`
          : `<span class="hl-rl-letter">${st.label}</span><span class="hl-rl-cap">${h.short}</span><span class="hl-rl-en">${h.en}</span>`;
        el.title = `${h.name} — ${h.ref}`;
        el.addEventListener('click', (e) => { e.stopPropagation(); selectRegion('holy', h); });
        const a = labelAnchor(h.ring);
        // the sanctuary sits in the middle of the priests' land: put the priests' label to its left
        const lon = h.kind === 'priests' ? a.west + (a.east - a.west) * 0.2 : a.lon;
        const m = mk([lon, a.lat], el);
        m._rl = { west: a.west, east: h.kind === 'priests' ? a.west + (a.east - a.west) * 0.4 : a.east, latSpan: a.ringLatSpan, len: h.kind === 'prince' ? 2.6 : 1.6, capLen: Math.max(h.short.length, h.en.length * 0.8), capMax: h.kind === 'prince' ? 15 : 20, kind: 'plot' };
      }
      // A small caption above the glowing square when zoomed in (the plot buttons are always shown;
      // zoomed out, the buttons themselves say where it is). Click → the priests' portion.
      const [sqW2, sqTop2, sqE2] = ez.meta.square;
      const small = document.createElement('button');
      small.type = 'button';
      small.className = 'hl-rl hl-rl-holy-sm';
      small.innerHTML = `<span class="hl-rl-name">${HOLY_WORDS.terumah.tr}</span><span class="hl-rl-paleo" dir="rtl">${HOLY_WORDS.terumah.paleo}</span><span class="hl-rl-en">the Holy Portion · Ezekiel 48:8–22</span>`;
      small.addEventListener('click', (e) => { e.stopPropagation(); selectRegion('holy', ez.holy.find((h) => h.kind === 'priests')); });
      markersRef.current.push(new maplibregl.Marker({ element: small, anchor: 'bottom', offset: [0, -6] }).setLngLat([(sqW2 + sqE2) / 2, sqTop2]).addTo(map));
    }
    // Waters named the way the Bible names them (the online basemap has its own names).
    if (!onlineLabels) for (const wtr of WATERS) {
      const el = document.createElement('button');
      el.type = 'button';
      const on = sel?.kind === 'water' && (sel.water.id === wtr.id || sel.water.id === wtr.twin);
      el.className = `hl-rl hl-rl-w${wtr.always ? ' hl-rl-w-always' : ''}${on ? ' on' : ''}`;
      el.innerHTML = `<span class="hl-rl-name">${wtr.tr}</span><span class="hl-rl-paleo" dir="rtl">${wtr.paleo}</span><span class="hl-rl-en">${wtr.en}</span>`;
      el.title = `${wtr.en} — ${wtr.ref.split(';')[0]}…`;
      el.addEventListener('click', (e) => { e.stopPropagation(); selectWater(wtr); });
      mk([wtr.lon, wtr.lat], el);
    }
    fitRegionLabelsRef.current(map);   // the band labels exist only now — size them to their bands
  }, [ez, sel, pin, showBiblical, showEzekiel, showJoshua, showModern, showRegions, relief, onlineLabels, selectCity, selectRegion, selectWater]);

  const applyRef = useRef(applyOverlays);
  applyRef.current = applyOverlays;
  const fitRegionLabelsRef = useRef(() => {});

  // Frame the Holy Portion so all six plot buttons fit without touching (≈ zoom 11+).
  const zoomHoly = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const [w, top, e, bot] = ez.meta.square;
    fitView(map, [[w, bot], [e, top]], { maxZoom: 12.5, pitch: threeD ? 45 : 0, duration: 1400, margin: 90, sheet: panelOpen });
  }, [ez, panelOpen, threeD]);
  const zoomHolyRef = useRef(zoomHoly); zoomHolyRef.current = zoomHoly;

  // Label decluttering: at the current view, higher-priority labels win and
  // any label whose box would overlap one already placed is hidden (the dot
  // stays). Runs after every rebuild and at the end of every pan/zoom.
  const declutterRef = useRef(null);
  // Region names: sized so the transliteration spans its territory comfortably; the
  // paleo line and the English appear only when there is room (CSS: .hl-z-region).
  const fitRegionLabels = (map) => {
    for (const m of markersRef.current) {
      if (!m._rl) continue;
      const { lng, lat } = m.getLngLat();
      const w = Math.abs(map.project([m._rl.east, lat]).x - map.project([m._rl.west, lat]).x);
      const h = Math.abs(map.project([lng, lat + m._rl.latSpan / 2]).y - map.project([lng, lat - m._rl.latSpan / 2]).y);
      // uppercase bold letters ≈ 0.8 em wide (with the tracking), one line ≈ 1.2 em tall; 11 % margin each side.
      // The label must fit BOTH the width of its run and the height of its band, at every zoom.
      const byW = (w * 0.78) / (m._rl.len * 0.8), byH = h * 0.42;
      const size = Math.min(m._rl.kind === 'plot' ? 26 : 16, byW, byH);
      const el = m.getElement();
      let tier;
      if (m._rl.kind === 'plot') {
        // area text (name + what it is, two lines ≈ 2.3 em) only when it fits the plot at ≥ 8 px
        const cap = Math.min(m._rl.capMax, (w * 0.85) / (m._rl.capLen * 0.6), h * 0.3);
        el.style.setProperty('--rl-cap', `${Math.max(cap, 6).toFixed(1)}px`);
        tier = size < 6 ? 'hide' : cap >= 8 ? 'lg' : 'sm';
      } else {
        // the name alone on a fresh load; paleo + English only when zoomed in AND the band has
        // height for three lines (name 1 em + paleo 1.05 em + English 0.75 em + gaps ≈ 3.6 em)
        tier = size < 6 ? 'hide' : (map.getZoom() >= REGION_DETAIL_ZOOM && size >= 11 && h > size * 4.2) ? 'lg' : 'sm';
      }
      el.style.setProperty('--rl-size', `${Math.max(size, 6).toFixed(1)}px`);
      el.dataset.fit = tier;
    }
  };
  fitRegionLabelsRef.current = fitRegionLabels;
  declutterRef.current = (map) => {
    if (!map) return;
    fitRegionLabels(map);
    const z = map.getZoom();
    const showAll = z >= 7.5;
    // The holy plots' lettered buttons (Z, L, C, X, S — shown while the plot is too small for
    // its name) are placed first, as obstacles: a city label that would sit on one flips to
    // the left of its dot, and hides if it can't (fieldy, 2026-09-10: "the x collides with my
    // paleo — it should be its own button, not colliding").
    const cont = map.getContainer().getBoundingClientRect();
    const placed = [];
    for (const m of markersRef.current) {
      if (!m._rl || m._rl.kind !== 'plot') continue;
      const el = m.getElement();
      if (el.dataset.fit === 'hide') continue;      // lettered button or the plot's free text — both are obstacles
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      placed.push({ x1: r.left - cont.left - 3, y1: r.top - cont.top - 3, x2: r.right - cont.left + 3, y2: r.bottom - cont.top + 3, plot: true });
    }
    const overlaps = (box) => placed.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
    const items = markersRef.current.filter((m) => m._hl).map((m) => ({ m, p: map.project(m.getLngLat()) }))
      .sort((a, b) => a.m._hl.pri - b.m._hl.pri);
    for (const { m, p } of items) {
      const { pri, w, twin } = m._hl;
      const el = m.getElement();
      const always = pri <= 1;                // key city + selection always labelled
      if (twin && !always) { el.classList.add('hl-mk-hide'); continue; }
      if (!showAll && !always && pri > 2) { el.classList.add('hl-mk-hide'); continue; }
      const right = { x1: p.x + 6, y1: p.y - 12, x2: p.x + 6 + w, y2: p.y + 22 };
      const left = { x1: p.x - 6 - w, y1: p.y - 12, x2: p.x - 6, y2: p.y + 22 };
      let box = right, flip = false;
      if (overlaps(right)) {
        if (!overlaps(left)) { box = left; flip = true; }
        else if (!always) { el.classList.add('hl-mk-hide'); continue; }
      }
      el.classList.remove('hl-mk-hide');
      el.classList.toggle('hl-mk-flip', flip);
      placed.push(box);
    }
  };

  // ── Map init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let map;
    {
      map = new maplibregl.Map({
        container: mapEl.current,
        style: buildPlainStyle(),
        bounds: HOME_BOUNDS,
        fitBoundsOptions: { padding: 20 },
        pitch: threeDRef.current ? 50 : 0, bearing: 0,
        maxPitch: 75,
        minZoom: 2, maxZoom: 15,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      mapRef.current = map;
      mapEl.current.__map = map;   // debugging handle (the Map is otherwise only reachable through React internals)
      // Zoom only — the pitch/compass arrows are useless on a phone; the ⚙ widget below the zoom buttons holds the toggles.
      map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');
      map.on('style.load', () => {
        styleReady.current = true;
        try { map.setTerrain(threeDRef.current ? { source: 'hl-dem', exaggeration: exagRef.current } : null); } catch { /* terrain unsupported */ }
        applyRef.current(map);
      });
      map.on('zoom', () => { setZoom(map.getZoom()); fitRegionLabelsRef.current(map); });
      map.on('moveend', () => declutterRef.current(map));
      map.on('click', (e) => {
        const lonLat = [e.lngLat.lng, e.lngLat.lat];
        // The shading itself is the button: a click inside a portion selects
        // that portion (most specific first — a holy sub-plot, then a Joshua
        // tribe, then an Ezekiel band). Only bare ground gives "This spot".
        const ez = ezRef.current;
        const hit = (layer) => map.getLayer(layer) && map.queryRenderedFeatures(e.point, { layers: [layer] })[0]?.properties?.id;
        // Water first: the band fills run on under the sea and the lakes (the water paints over
        // them), so a tap on the water is the water — and a tap NEAR a river is the river; a
        // tap meant for the territory will not be that close to it.
        const water = waterHit(map, e.point);
        if (water) { selectWaterRef.current(water, { at: lonLat }); return; }
        const holyId = hit('hl-holy-fill'), joshId = hit('hl-joshua-fill'), ezId = hit('hl-ez-fill');
        const holy = holyId && ez.holy.find((h) => h.id === holyId);
        const josh = joshId && JOSHUA_TRIBES.find((t) => t.id === joshId);
        const band = ezId && ez.bands.find((b) => b.id === ezId);
        if (holy) selectRegionRef.current('holy', holy, { at: lonLat });
        else if (josh) selectRegionRef.current('joshua', josh, { at: lonLat });
        else if (band) selectRegionRef.current('ezekiel', band, { at: lonLat });
        else {
          setSel({ kind: 'point', lonLat, joshua: joshuaTribeAt(lonLat), ezekiel: ezekielAt(lonLat, ez) });
          setPanelOpen(true);
          setGearOpen(false);
          if (isNarrow()) map.easeTo({ center: lonLat, padding: { top: 0, left: 0, right: 0, bottom: sheetPx() }, duration: 500 });
        }
      });
      map.on('mousemove', (e) => {
        const layers = ['hl-holy-fill', 'hl-joshua-fill', 'hl-ez-fill'].filter((id) => map.getLayer(id));
        map.getCanvas().style.cursor = (layers.length && map.queryRenderedFeatures(e.point, { layers }).length) || waterHit(map, e.point) ? 'pointer' : '';
      });
      map.on('error', (ev) => {
        const msg = ev?.error?.message || '';
        // The bundled base map never errors; only the optional relief tiles can.
        if (/terrarium|elevation-tiles/i.test(ev?.error?.url || msg)) setError('Relief tiles are not reachable right now — the map is flat until they are. Everything else is built in.');
      });
    }
    return () => { if (map) { map.remove(); mapRef.current = null; styleReady.current = false; } };
  }, []);

  // Refs so map callbacks see current values without re-creating the map.
  const threeDRef = useRef(threeD); threeDRef.current = threeD;
  const exagRef = useRef(exag); exagRef.current = exag;
  const ezRef = useRef(ez); ezRef.current = ez;
  const selectRegionRef = useRef(selectRegion); selectRegionRef.current = selectRegion;

  // Re-apply overlays whenever their inputs change.
  useEffect(() => { applyOverlays(mapRef.current); }, [applyOverlays]);

  // Basemap switch — full style swap, overlays come back via style.load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (basemap === 'plain') { styleReady.current = false; map.setStyle(buildPlainStyle()); return; }
    loadOfmStyle()
      .then((ofm) => { styleReady.current = false; map.setStyle(buildOnlineStyle(ofm)); setError(null); })
      .catch((err) => { setError(`The online base map is not reachable (${err.message}) — staying on the built-in map.`); setBasemap('plain'); });
  }, [basemap]);

  // Terrain on/off + exaggeration.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    try { map.setTerrain(threeD ? { source: 'hl-dem', exaggeration: exag } : null); } catch { /* ignore */ }
    if (!threeD) map.easeTo({ pitch: 0, duration: 600 });
    else if (map.getPitch() < 20) map.easeTo({ pitch: 50, duration: 600 });
  }, [threeD, exag]);

  // Bottom sheet (phones): pad the map so the visible half is what fitBounds / flyTo aim at.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isNarrow()) return;
    const bottom = panelOpen ? sheetPx() : 0;
    // A fly/fit that opened the panel already carries this padding — don't cut it short.
    if (map.isMoving() || map.getPadding().bottom === bottom) return;
    map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom }, duration: 300 });
  }, [panelOpen]);

  // Deep-link ?city=… on first load (after the map exists).
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    const id = params.get('city');
    const view = params.get('view');                       // ?view=holy — the Holy Portion framed (from the printable sheets)
    if (!id && view !== 'holy') { deepLinked.current = true; return; }
    const c = id ? ALL_PLACES.find((x) => x.id === id) : null;
    if (id && !c) { deepLinked.current = true; return; }
    const t = setInterval(() => {
      if (mapRef.current && styleReady.current) { clearInterval(t); deepLinked.current = true; if (c) selectCity(c, true); else zoomHolyRef.current(); }
    }, 200);
    return () => clearInterval(t);
  }, [params, selectCity]);

  // Keep ?overlay= / ?unit= in the URL so a view can be shared.
  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set('overlay', showJoshua && showEzekiel ? 'both' : showJoshua ? 'joshua' : showEzekiel ? 'ezekiel' : 'none');
    if (basemap === 'online') next.set('basemap', 'online'); else next.delete('basemap');
    if (!relief) next.set('relief', '0'); else next.delete('relief');
    if (pin) next.set('pin', `${pin.lon.toFixed(4)},${pin.lat.toFixed(4)},${pin.label}`); else next.delete('pin');
    const anyPlaces = showBiblical || showModern || showRegions;
    if (anyPlaces) next.set('places', '1'); else next.delete('places');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJoshua, showEzekiel, basemap, relief, pin, showBiblical, showModern, showRegions]);

  const dropPin = useCallback((lonLat, label) => {
    setPin({ lon: lonLat[0], lat: lonLat[1], label: label || fmtLonLat(lonLat) });
  }, []);

  // ── Focus: the portion the Cities / Peoples tabs are scoped to ─────────────
  // A selected portion is the focus; a selected city / spot focuses the Ezekiel
  // band (or Joshua tribe) it stands in. "Show all" lifts the scope.
  const focus = useMemo(() => {
    if (!sel) return null;
    if (sel.entry?.ring) return { kind: sel.kind, entry: sel.entry, label: tribeDisplayName(sel.entry.name, sel.entry.tribe) };
    const band = sel.ezekiel?.sub || sel.ezekiel?.band || sel.joshua;
    if (!band?.ring) return null;
    return { kind: sel.ezekiel?.sub ? 'holy' : sel.ezekiel?.band ? 'ezekiel' : 'joshua', entry: band, label: tribeDisplayName(band.name, band.tribe) };
  }, [sel]);
  const scoped = focus && ctxOnly;
  const inFocus = useCallback((c) => !scoped || pointInRing([c.lon, c.lat], focus.entry.ring), [scoped, focus]);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const filteredBiblical = useMemo(() => {
    const s = q.trim().toLowerCase();
    return BIBLICAL_CITIES.filter((c) => inFocus(c) && (!s || `${c.name} ${c.translit} ${c.he} ${c.ref}`.toLowerCase().includes(s)));
  }, [q, inFocus]);
  const filteredModern = useMemo(() => {
    const s = q.trim().toLowerCase();
    return MODERN_CITIES.filter((c) => inFocus(c) && (!s || `${c.name} ${c.country}`.toLowerCase().includes(s)));
  }, [q, inFocus]);
  const filteredRegions = useMemo(() => {
    const s = q.trim().toLowerCase();
    return REGIONS.filter((c) => inFocus(c) && (!s || `${c.name} ${c.translit} ${c.he} ${c.paleo} ${c.ref}`.toLowerCase().includes(s)));
  }, [q, inFocus]);

  // "Peoples" table: every Ezekiel band → the modern cities inside it, by country.
  const peoples = useMemo(() => EZEKIEL_ORDER.map((name) => {
    if (name === 'HOLY') {
      const rings = ez.holy.map((h) => h.ring);
      const inside = MODERN_CITIES.filter((c) => rings.some((r) => pointInRing([c.lon, c.lat], r)));
      return { name: 'Holy portion (Levites · priests · city · prince)', tribe: 'Levi', cities: inside };
    }
    const band = ez.bands.find((b) => b.name === name);
    return { name, tribe: name, cities: MODERN_CITIES.filter((c) => pointInRing([c.lon, c.lat], band.ring)) };
  }), [ez]);

  // Peoples tab, scoped: only the focused band (the holy portion counts as one).
  const peoplesShown = useMemo(() => {
    if (!scoped) return peoples;
    if (focus.kind === 'holy') return peoples.filter((p) => p.tribe === 'Levi');
    return peoples.filter((p) => p.tribe !== 'Levi' && p.name === focus.entry.name);
  }, [peoples, scoped, focus]);

  const goHome = () => { setGearOpen(false); mapRef.current?.fitBounds(HOME_BOUNDS, { padding: 20, pitch: threeD ? 50 : 0, bearing: -8, duration: 1200 }); };
  const closeDetail = () => { setSel(null); if (isNarrow()) setPanelOpen(false); };
  const scopeBar = focus && (
    <div className={`hl-scope${scoped ? ' on' : ''}`}>
      <i style={{ background: focus.kind === 'holy' ? HOLY_KIND_STYLE[focus.entry.kind].color : TRIBE_COLORS[focus.entry.tribe] }} />
      {scoped ? <>In <b>{focus.label}</b> only</> : <>All portions</>}
      <button type="button" className="hl-link" onClick={() => setCtxOnly((v) => !v)}>{scoped ? 'Show all' : `Only ${focus.label}`}</button>
    </div>
  );

  return (
    <div className={`hl-page${panelOpen ? ' hl-panel-open' : ''}`} data-basemap={basemap}>
      <header className="hl-top">
        <Link to="/landing" className="hl-logo" title="Home">𐤀𐤁</Link>
        <Link to="/models" className="hl-back" title="Maps & Models">← Models</Link>
        <h1 className="hl-h1">The Holy Land in 3D <span>Joshua &amp; Ezekiel allotments</span></h1>
        <PlacePicker pin={pin} selId={sel?.city?.id} onPick={(c) => selectCity(c, true)} />
        <div className="hl-top-actions">
          <button type="button" className="hl-btn" onClick={goHome} title="Whole land">⌂</button>
          <button type="button" className="hl-btn" onClick={toggleTheme} title="Toggle light/dark">{theme === 'dark' ? '☀' : '☾'}</button>
          <button type="button" className="hl-btn hl-panel-toggle" onClick={() => setPanelOpen((v) => !v)} title="Toggle panel" aria-expanded={panelOpen}>☰</button>
        </div>
      </header>

      <div className="hl-body">
        <aside className="hl-panel" aria-label="Map controls">
          <div className="hl-sheet-bar">
            <span className="hl-sheet-grip" aria-hidden="true" />
            <button type="button" className="hl-sheet-x" onClick={() => setPanelOpen(false)} aria-label="Hide panel">{isNarrow() ? 'Map ×' : '◀ Hide panel'}</button>
          </div>
          <div className="hl-tabs" role="tablist">
            {[['layers', 'Detailed Look'], ['cities', 'Cities'], ['peoples', 'Peoples']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`hl-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {sel && <Detail sel={sel} ez={ez} pin={pin} onPin={dropPin} onUnpin={() => setPin(null)} onClose={closeDetail} onCity={(c) => selectCity(c, true)} onRegion={selectRegion} />}
          {pin && !sel && (
            <div className="hl-detail hl-detail-pin">
              <div className="hl-detail-name">📍 {pin.label}</div>
              <div className="hl-detail-ref">Pinned — pick any place and its distance from here is shown. <button type="button" className="hl-link" onClick={() => setPin(null)}>Unpin</button></div>
            </div>
          )}

          {tab === 'layers' && !sel && (
            <div className="hl-sec hl-look-empty">
              <div className="hl-note">Tap a portion, a city, a river or a sea. What the scriptures say of it — its birth, its blessing, its prophecies — opens here, book by book. Map layers and terrain are under ⚙; the colours and the Holy Portion's key are under <b>Legend</b>.</div>
              {showEzekiel && (
                <details className="hl-measures">
                  <summary>Every measurement of Ezekiel 47–48, with its verse</summary>
                  <ol>
                    {EZEKIEL_MEASURES.map((m) => (
                      <li key={m.ref}>
                        <PassageRefs refs={m.ref} size="sm" />
                        <div className="hl-measure-given">{m.given}</div>
                        <div className="hl-measure-read">→ {m.read}</div>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          )}

          {tab === 'cities' && (
            <div className="hl-sec">
              {scopeBar}
              <input className="hl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter — English, transliteration, paleo, reference…" />
              <div className="hl-sec-h">Biblical cities <span className="hl-count">{filteredBiblical.length}</span></div>
              <ul className="hl-list">
                {filteredBiblical.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={`hl-li${c.id === KEY_CITY ? ' key' : ''}${sel?.city?.id === c.id ? ' on' : ''}`} onClick={() => selectCity(c, true)}>
                      <span className="hl-li-paleo" dir="rtl">{c.paleo}</span>
                      <span className="hl-li-main"><b>{c.translit}</b> <em>{c.name}</em></span>
                      <span className="hl-li-ref">{c.ref}{pin ? ` · ${fmtDistance(haversineKm([pin.lon, pin.lat], [c.lon, c.lat])).text}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hl-sec-h">Nations &amp; lands <span className="hl-count">{filteredRegions.length}</span></div>
              <ul className="hl-list">
                {filteredRegions.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={`hl-li${sel?.city?.id === c.id ? ' on' : ''}`} onClick={() => selectCity(c, true)}>
                      <span className="hl-li-paleo" dir="rtl">{c.paleo}</span>
                      <span className="hl-li-main"><b>{c.translit}</b> <em>{c.name}</em></span>
                      <span className="hl-li-ref">{c.ref}{pin ? ` · ${fmtDistance(haversineKm([pin.lon, pin.lat], [c.lon, c.lat])).text}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hl-sec-h">Today's cities <span className="hl-count">{filteredModern.length}</span></div>
              <ul className="hl-list">
                {filteredModern.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={`hl-li${sel?.city?.id === c.id ? ' on' : ''}`} onClick={() => selectCity(c, true)}>
                      <span className="hl-li-main"><b>{c.name}</b> <em>{c.country}</em></span>
                      <span className="hl-li-ref">{c.pop}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'peoples' && (
            <div className="hl-sec">
              {scopeBar}
              <div className="hl-note">Who lives in {scoped ? 'this portion' : "each of Ezekiel's portions"} today — {scoped ? '' : 'every band from north to south, '}with the modern cities that fall inside it. Click a band name to zoom to it.</div>
              {peoplesShown.length === 0 && <div className="hl-people-none">Not an Ezekiel portion — switch to "All portions".</div>}
              {peoplesShown.map((p) => {
                const byCountry = {};
                for (const c of p.cities) (byCountry[c.country] = byCountry[c.country] || []).push(c);
                const entry = p.tribe === 'Levi' ? null : ez.bands.find((b) => b.name === p.name);
                return (
                  <div key={p.name} className="hl-people">
                    <button type="button" className="hl-people-h" style={{ '--c': TRIBE_COLORS[p.tribe] }} onClick={() => entry && selectRegion('ezekiel', entry)}>
                      <i /> {tribeDisplayName(p.name, p.tribe)} {p.tribe !== 'Levi' && <small>{p.name}</small>} <span className="hl-legend-paleo" dir="rtl">{TRIBE_PALEO[p.tribe] || ''}</span>
                    </button>
                    {Object.keys(byCountry).length === 0 && <div className="hl-people-none">No listed city — sparsely settled today.</div>}
                    {Object.entries(byCountry).map(([country, cs]) => (
                      <div key={country} className="hl-people-row">
                        <span className="hl-people-country">{country}</span>
                        <span className="hl-people-cities">{cs.map((c, i) => (
                          <span key={c.id}>{i > 0 && ', '}<button type="button" className="hl-link" onClick={() => selectCity(c, true)}>{c.name}</button></span>
                        ))}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* zoom class lives on the WRAPPER: maplibre owns the inner div's className */}
        <div className={`hl-map-wrap${zoom >= 7.5 ? ' hl-z-labels' : ''}${zoom >= REGION_DETAIL_ZOOM ? ' hl-z-region' : ''}${zoom >= HOLY_BTN_ZOOM ? ' hl-z-holy' : ''}`}>
          <div ref={mapEl} className="hl-map" />
          {!panelOpen && <button type="button" className="hl-panel-show" onClick={() => setPanelOpen(true)} title="Show the panel">☰ Detailed Look · Cities · Peoples</button>}
          {/* ⚙ beside the zoom buttons: the everyday toggles, reachable without opening the panel */}
          <div className={`hl-gear${gearOpen ? ' open' : ''}`}>
            <button type="button" className="hl-gear-btn" onClick={() => setGearOpen((v) => !v)} title="Map settings" aria-expanded={gearOpen} aria-label="Map settings">⚙</button>
            {gearOpen && (
              <div className="hl-gear-pop" role="group" aria-label="Map settings">
                <div className="hl-gear-h">Places</div>
                <label className="hl-row"><input type="checkbox" checked={showBiblical} onChange={(e) => setShowBiblical(e.target.checked)} /> <span className="hl-sw hl-sw-b" /> Biblical cities</label>
                <label className="hl-row"><input type="checkbox" checked={showModern} onChange={(e) => setShowModern(e.target.checked)} /> <span className="hl-sw hl-sw-m" /> Today's cities</label>
                <label className="hl-row"><input type="checkbox" checked={showRegions} onChange={(e) => setShowRegions(e.target.checked)} /> <span className="hl-sw hl-sw-r" /> Nations &amp; lands</label>
                <div className="hl-gear-h">Allotments</div>
                <label className="hl-row"><input type="checkbox" checked={showEzekiel} onChange={(e) => setShowEzekiel(e.target.checked)} /> Ezekiel 47–48</label>
                <label className="hl-row"><input type="checkbox" checked={showJoshua} onChange={(e) => setShowJoshua(e.target.checked)} /> Joshua 13–19</label>
                <div className="hl-gear-h">Base map</div>
                <div className="hl-seg">
                  {BASEMAPS.map((b) => (
                    <button key={b.id} type="button" className={`hl-seg-b${basemap === b.id ? ' on' : ''}`} onClick={() => setBasemap(b.id)}>{b.label} <small>{b.sub}</small></button>
                  ))}
                </div>
                {basemap === 'online' && <label className="hl-row"><input type="checkbox" checked={onlineLabels} onChange={(e) => setOnlineLabels(e.target.checked)} /> Online map's place names (English)</label>}
                <div className="hl-gear-h">Terrain</div>
                <label className="hl-row"><input type="checkbox" checked={relief} onChange={(e) => setRelief(e.target.checked)} /> Relief shading <small className="hl-inline-note">(tiles fetched online)</small></label>
                <label className="hl-row"><input type="checkbox" checked={threeD} onChange={(e) => setThreeD(e.target.checked)} /> 3D (two fingers to tilt)</label>
                <label className="hl-row hl-range">Relief ×{exag.toFixed(1)} <input type="range" min="0.5" max="3" step="0.1" value={exag} disabled={!threeD} onChange={(e) => setExag(+e.target.value)} /></label>
                <button type="button" className="hl-link hl-gear-more" onClick={() => { setGearOpen(false); zoomHoly(); }}>Zoom to the Holy Portion ✦</button>
                <Link className="hl-link hl-gear-more" to={`/models/prints?map=${showJoshua && !showEzekiel ? 'joshua' : 'ezekiel'}`}>Printable map sheet (PNG · SVG · PDF) ↗</Link>
              </div>
            )}
          </div>
          {/* Legend: the tribe colours and the Holy Portion's key, off the panel so the panel is for the details */}
          <div className={`hl-legend-w${legendOpen ? ' open' : ''}`}>
            <button type="button" className="hl-legend-btn" onClick={() => setLegendOpen((v) => !v)} aria-expanded={legendOpen}>Legend</button>
            {legendOpen && (
              <div className="hl-legend-pop" role="group" aria-label="Legend">
                <div className="hl-gear-h">Tribes</div>
                <div className="hl-legend">
                  {Object.entries(TRIBE_COLORS).map(([t, c]) => (
                    <span key={t} className="hl-legend-i"><i style={{ background: c }} /> <b>{TRIBE_TRANSLIT[t]}</b> <small>{t}</small> <span className="hl-legend-paleo" dir="rtl">{TRIBE_PALEO[t]}</span></span>
                  ))}
                </div>
                {showEzekiel && (
                  <>
                    <div className="hl-gear-h">Holy Portion — 25,000 × 25,000 cubits ≈ {ez.meta.holyKm.toFixed(1)} km / {(ez.meta.holyKm * 0.621371).toFixed(1)} mi a side</div>
                    <div className="hl-key">
                      {Object.entries(HOLY_KIND_STYLE).filter(([, st]) => st.label).map(([k, st]) => (
                        <span key={k} className="hl-key-i">{k === 'prince' ? <span className="hl-key-prince">🦁🤴🏾</span> : <b style={{ background: st.color }}>{st.label}</b>} {ez.holy.find((h) => h.kind === k)?.name}</span>
                      ))}
                    </div>
                    <div className="hl-note">Northern tribes ≈ {ez.meta.northKm.toFixed(0)} km ({(ez.meta.northKm * 0.621371).toFixed(0)} mi) each, southern ≈ {ez.meta.southKm.toFixed(0)} km ({(ez.meta.southKm * 0.621371).toFixed(0)} mi); the city {ez.meta.cityKm.toFixed(1)} km square, the sanctuary {ez.meta.sanctKm.toFixed(1)} km square.</div>
                  </>
                )}
                <div className="hl-gear-h">Marks</div>
                <div className="hl-legend hl-legend-marks">
                  <span className="hl-legend-i"><i className="hl-lg-dot" /> biblical city</span>
                  <span className="hl-legend-i"><i className="hl-lg-anchor" /> a landmark of Ezekiel's border</span>
                  <span className="hl-legend-i"><i className="hl-lg-modern" /> today's city</span>
                  <span className="hl-legend-i"><i className="hl-lg-gold" /> the selected portion</span>
                  <span className="hl-legend-i"><i className="hl-lg-red" /> the Holy Portion</span>
                </div>
                <div className="hl-note hl-note-warn">Borders are idealized study-map shapes drawn from the landmark lists in Joshua 13–19 and Ezekiel 47–48, not surveyed lines; city dots use the conventional identifications.</div>
              </div>
            )}
          </div>
          {error && <div className="hl-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}


// ── Place picker: one box for every place ────────────────────────────────────
// Empty → the whole list A→Z (biblical cities, nations & lands, today's cities,
// with Jabneel — Joshua 15:11 — pinned at the top); typing filters live by
// English, transliteration, paleo or square Hebrew. Picking flies there and
// opens the card: the name's roots, its history and every prophecy about it.
function PlacePicker({ pin, selId, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef(null);
  const keyCity = useMemo(() => BIBLICAL_CITIES.find((c) => c.id === KEY_CITY), []);
  const hits = useMemo(() => {
    const t = q.trim();
    if (t) return searchPlaces(t, 80);
    return [keyCity, ...PLACES_AZ.filter((c) => c.id !== KEY_CITY)];
  }, [q, keyCity]);
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.children[hi];
    if (el && open) el.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);
  const inputRef = useRef(null);
  const pick = (c) => { setQ(''); setOpen(false); inputRef.current?.blur(); onPick(c); };   // blur → the phone keyboard goes away
  const kindLabel = (c) => (c.kind === 'biblical' ? 'Bible' : c.kind === 'region' ? 'Nation' : 'Today');
  return (
    <div className="hl-searchbox">
      <input
        ref={inputRef}
        className="hl-searchbox-in"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && hits[hi]) pick(hits[hi]);
          else if (e.key === 'Escape') { setQ(''); setOpen(false); e.currentTarget.blur(); }
        }}
        placeholder="Find a place — Jabneel, Greece, Yawan, 𐤉𐤅𐤍, Damascus…"
        aria-label="Find a place"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
      />
      {open && (
        <ul className="hl-searchbox-dd" role="listbox" ref={listRef}>
          {hits.length === 0 && <li className="hl-hit-none">Nothing by that name — try the English, the app's spelling, or paleo.</li>}
          {hits.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === hi}>
              <button type="button" className={`hl-hit${i === hi ? ' first' : ''}${c.id === selId ? ' on' : ''}${c.id === KEY_CITY ? ' key' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)} onMouseEnter={() => setHi(i)}>
                <span className={`hl-hit-kind k-${c.kind}`}>{c.id === KEY_CITY ? '★ Key' : kindLabel(c)}</span>
                <span className="hl-hit-main"><b>{c.translit || c.name}</b>{c.translit && <em> {c.name}</em>}{c.country && <em> · {c.country}</em>}</span>
                {c.paleo && <span className="hl-hit-paleo" dir="rtl">{c.paleo}</span>}
                {pin && <span className="hl-hit-dist">{fmtDistance(haversineKm([pin.lon, pin.lat], [c.lon, c.lat])).text.split(' · ')[0]}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Passage chips + inline verse text live in components/PassageRefs.jsx (shared with the statue model).

// ── Lexical breakdown: Bayath [house] Lacham [bread] ─────────────────────────
// Each word of the Hebrew name is looked up in the app's own surface index
// (/api/surface — the same parse the Hebrew Viewer shows: root + affixes with
// their glosses and Strong's number); words not in the tagged text fall back
// to server/lexicon/lexicon.json. Nothing is invented here: no entry → "—".
const _surfCache = new Map();
let _lexPromise = null;
function lookupWord(he) {
  const paleo = squareToPaleo(he);
  if (!_surfCache.has(paleo)) {
    _surfCache.set(paleo, apiSurface(paleo).then((d) => ({ paleo, comps: d.components || [], sn: d.strongs, root: d.root_paleo }))
      .catch(async () => {
        _lexPromise ||= apiLexicon().catch(() => ({}));
        const lex = await _lexPromise;
        return { paleo, comps: lex[paleo] ? [{ paleo, css: 'root', translation: lex[paleo] }] : [], sn: null, root: paleo };
      }));
  }
  return _surfCache.get(paleo);
}
const _anatCache = new Map();
function lookupName(he) {
  if (!_anatCache.has(he)) _anatCache.set(he, apiStrongsLookup(he).then((d) => d.matches || []).catch(() => []));
  return _anatCache.get(he);
}
function Lexical({ he }) {
  const [rows, setRows] = useState(null);
  const [anat, setAnat] = useState(null);   // the name's own Strong's number(s) + what builds them
  useEffect(() => {
    if (!he) return;
    let live = true;
    setRows(null); setAnat(null);
    lookupName(he).then((m) => { if (live) setAnat(m); });
    Promise.all(he.split(/\s+/).map(lookupWord)).then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, [he]);
  if (!he) return null;
  // The dictionary knows this name: headline number, hyphenated form, meaning, parts.
  if (anat && anat.length) {
    return (
      <div className="hl-lex hl-lex-anat">
        {anat.map((a) => (
          <div key={a.sn} className="hl-anat">
            <div className="hl-anat-h">
              <Link to={`/roots?sn=${a.sn}`} className="hl-anat-sn" title="Explore this root">{a.sn}</Link>
              <b>{a.translit}</b>
              <span className="hl-anat-paleo" dir="rtl">{a.paleo}</span>
              {a.meaning && <em>"{a.meaning}"</em>}
            </div>
            {a.strongs_def && <div className="hl-anat-def">{a.strongs_def}</div>}
            {a.parts.length > 0 && (
              <div className="hl-anat-parts">
                {a.parts.map((p, i) => (
                  <span key={p.sn} className="hl-lex-c root">
                    {i > 0 && <span className="hl-anat-plus">+</span>}
                    <b>{p.translit}</b>
                    <em>{p.gloss || p.kjv || '—'}</em>
                    <Link to={`/roots?sn=${p.sn}`} className="hl-lex-sn" title="Explore this root">{p.sn}</Link>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (!rows) return null;
  return (
    <div className="hl-lex">
      {rows.map((w) => (
        <span key={w.paleo} className="hl-lex-w">
          {w.comps.length ? w.comps.map((c, i) => (
            <span key={i} className={`hl-lex-c ${c.css === 'root' ? 'root' : 'affix'}`}>
              <b>{c.translit || (c.paleo ? transliterate(c.paleo) : '')}</b>
              {c.translation && <em>{String(c.translation).replace(/^\[|\]$/g, '')}</em>}
            </span>
          )) : <span className="hl-lex-c"><b>{transliterate(w.paleo)}</b><em>—</em></span>}
          {w.sn && <Link to={`/roots?sn=${w.sn}`} className="hl-lex-sn" title="Explore this root">{w.sn}</Link>}
        </span>
      ))}
    </div>
  );
}

// ── Scripture tree: tribe → book → passages, each opening inline or in the reader ──
function ScriptureTree({ tree, title }) {
  if (!tree || !tree.length) return null;
  return (
    <div className="hl-tree">
      <div className="hl-detail-sub">{title}</div>
      {tree.map((b, i) => (
        <details key={b.book} className="hl-tree-book" open={i === 0}>
          <summary><span className="hl-tree-book-name">{b.book}</span> <span className="hl-count">{b.items.length}</span></summary>
          <ul className="hl-tree-items">
            {b.items.map((it) => (
              <li key={it.ref} className="hl-tree-item">
                <PassageRefs refs={it.ref} size="sm" />
                <span className="hl-tree-why">{it.why}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

// ── Detail card ──────────────────────────────────────────────────────────────
function AllotmentLines({ joshua, ezekiel }) {
  return (
    <div className="hl-allot">
      <div className="hl-allot-row">
        <span className="hl-allot-k">Joshua</span>
        {joshua ? <span className="hl-allot-v"><i style={{ background: TRIBE_COLORS[joshua.tribe] }} /> {tribeDisplayName(joshua.name, joshua.tribe)} <small>{joshua.name}</small> <PassageRefs refs={joshua.ref} size="sm" /></span> : <span className="hl-allot-v dim">outside the listed allotments</span>}
      </div>
      <div className="hl-allot-row">
        <span className="hl-allot-k">Ezekiel</span>
        {ezekiel ? (
          ezekiel.sub
            ? <span className="hl-allot-v"><i style={{ background: HOLY_KIND_STYLE[ezekiel.sub.kind].color }} /> {ezekiel.sub.name} <PassageRefs refs={ezekiel.sub.ref} size="sm" /></span>
            : <span className="hl-allot-v"><i style={{ background: TRIBE_COLORS[ezekiel.band.tribe] }} /> {TRIBE_TRANSLIT[ezekiel.band.tribe]} <small>{ezekiel.band.name}</small> <PassageRefs refs={ezekiel.band.ref} size="sm" /></span>
        ) : <span className="hl-allot-v dim">outside the borders of Ezekiel 47</span>}
      </div>
    </div>
  );
}

function PinRow({ pin, at, label, onPin, onUnpin }) {
  const isPin = pin && Math.abs(pin.lon - at[0]) < 1e-6 && Math.abs(pin.lat - at[1]) < 1e-6;
  const d = pin && !isPin ? fmtDistance(haversineKm([pin.lon, pin.lat], at)) : null;
  const brg = pin && !isPin ? bearingDeg([pin.lon, pin.lat], at) : null;
  return (
    <div className="hl-pinrow">
      {d && (
        <div className="hl-dist">
          <span className="hl-dist-k">From 📍 {pin.label}</span>
          <b>{d.text}</b>
          <small>{compass(brg)} ({Math.round(brg)}°) · {d.daysText}</small>
        </div>
      )}
      {isPin
        ? <button type="button" className="hl-pinbtn on" onClick={onUnpin}>📍 Pinned here · unpin</button>
        : <button type="button" className="hl-pinbtn" onClick={() => onPin(at, label)}>📍 {pin ? 'Move pin here' : 'Pin here'} — measure distances from this spot</button>}
    </div>
  );
}

// A biblical city and the town on (or near) it, side by side: what the place was, what
// it is, and what happened to the name in between.
function TwinCard({ tw, focus, onCity }) {
  const { biblical: b, modern: m } = tw;
  const country = countryName(countryOf(b));
  return (
    <div className={`hl-twin hl-twin-${tw.rel}`}>
      <div className="hl-twin-h">
        <span className="hl-twin-arrow"><b>{b.translit}</b> <span dir="rtl" className="hl-twin-paleo">{b.paleo}</span></span>
        {tw.rel === 'near'
          ? <span className="hl-twin-flag warn">today's {m.name} is not the same site — ≈ {tw.km.toFixed(1)} km away</span>
          : <span className="hl-twin-flag">the site of today's {m.name}</span>}
      </div>
      <div className="hl-twin-cols">
        <button type="button" className={`hl-twin-col${focus === 'biblical' ? ' on' : ''}`} onClick={() => focus !== 'biblical' && onCity(b)}>
          <div className="hl-twin-k">In scripture</div>
          <div className="hl-detail-paleo" dir="rtl">{b.paleo}</div>
          <div className="hl-twin-name">{b.translit}</div>
          <div className="hl-twin-sub">{b.name}</div>
          <div className="hl-twin-sub dim">{b.ref.split(';')[0]}</div>
        </button>
        <button type="button" className={`hl-twin-col hl-twin-col-m${focus === 'modern' ? ' on' : ''}`} onClick={() => focus !== 'modern' && onCity(m)}>
          <div className="hl-twin-k">Today, for context</div>
          <div className="hl-twin-name m">{m.name}</div>
          <div className="hl-twin-sub dim">{m.country}{country && !country.includes(m.country) ? ` · ${country}` : ''} · {m.pop}</div>
          {m.note && <div className="hl-twin-sub dim">{m.note}</div>}
        </button>
      </div>
      <div className="hl-twin-name-row"><span className="hl-twin-k">What became of the name</span> {tw.name}</div>
    </div>
  );
}

function Detail({ sel, ez, pin, onPin, onUnpin, onClose, onCity, onRegion }) {
  if (sel.kind === 'city') {
    const c0 = sel.city;
    const tw = twinOf(c0);
    // The biblical name is always the headline: a modern town standing on a biblical city
    // (Yavne on Yaban-Al) opens under the biblical name, with the modern one as context.
    const c = c0.kind === 'modern' && tw ? tw.biblical : c0;
    // "Today:" — the modern twin's own label when there is one (Jerusalem: Israel / West Bank), else the country the point falls in.
    const today = c.kind !== 'modern' ? ((tw && tw.rel === 'same' ? tw.modern.country : null) || countryName(countryOf(c))) : null;
    return (
      <div className={`hl-detail${c.id === KEY_CITY ? ' key' : ''}`}>
        <button type="button" className="hl-detail-x" onClick={onClose} aria-label="Close">×</button>
        {c.kind !== 'modern' ? (
          <>
            <div className="hl-detail-paleo" dir="rtl">{c.paleo}</div>
            <div className="hl-detail-name">{c.translit} <em>{c.name}</em></div>
            {today && <div className="hl-detail-ref">Today: {today}</div>}
            <Lexical he={c.he} />
            {c.note && <p className="hl-detail-note">{c.note}</p>}
            <div className="hl-detail-sub">{c.proph ? 'History' : 'Scripture'}</div>
            <PassageRefs refs={c.ref} autoOpen />
            {c.proph && <><div className="hl-detail-sub">Prophecies</div><PassageRefs refs={c.proph} /></>}
          </>
        ) : (
          <>
            <div className="hl-detail-name hl-detail-name-m">{c.name} <em>{c.country}</em></div>
            <div className="hl-detail-ref">Today's city, for context · {c.pop}</div>
            {c.note && <p className="hl-detail-note">{c.note}</p>}
          </>
        )}
        <AllotmentLines joshua={sel.joshua} ezekiel={sel.ezekiel} />
        {tw && <TwinCard tw={tw} focus={c0.kind} onCity={onCity} />}
        <PinRow pin={pin} at={[c0.lon, c0.lat]} label={c.translit || c.name} onPin={onPin} onUnpin={onUnpin} />
        <div className="hl-detail-coord">{fmtLonLat([c0.lon, c0.lat])}</div>
      </div>
    );
  }
  if (sel.kind === 'joshua' || sel.kind === 'ezekiel' || sel.kind === 'holy') {
    const e = sel.entry;
    const color = sel.kind === 'holy' ? HOLY_KIND_STYLE[e.kind].color : TRIBE_COLORS[e.tribe];
    return (
      <div className="hl-detail">
        <button type="button" className="hl-detail-x" onClick={onClose} aria-label="Close">×</button>
        <div className="hl-detail-name"><i className="hl-detail-sw" style={{ background: color }} /> {tribeDisplayName(e.name, e.tribe)} {e.tribe && <span className="hl-detail-paleo-inline" dir="rtl">{TRIBE_PALEO[e.tribe]}</span>}</div>
        {e.he && <div className="hl-detail-paleo" dir="rtl">{squareToPaleo(e.he)}</div>}
        <div className="hl-detail-ref">{sel.kind === 'joshua' ? 'Joshua allotment' : 'Ezekiel — millennial allotment'}</div>
        <Lexical he={e.he || (e.tribe ? TRIBE_HEBREW[e.tribe] : null)} />
        <PassageRefs refs={e.ref} autoOpen />
        <ScriptureTree tree={sel.kind === 'holy' ? HOLY_SCRIPTURE[e.kind] : TRIBE_SCRIPTURE[e.tribe]} title={sel.kind === 'holy' ? 'What the scriptures say of it' : `What the scriptures say of ${TRIBE_TRANSLIT[e.tribe] || e.tribe}`} />
        {sel.at && <PinRow pin={pin} at={sel.at} label={`${tribeDisplayName(e.name, e.tribe)} (${fmtLonLat(sel.at)})`} onPin={onPin} onUnpin={onUnpin} />}
        {sel.kind === 'holy' && e.kind === 'sanctuary' && <p className="hl-detail-note">500 × 500 with 50 of open land round it (45:2), in the midst of the priests' portion.</p>}
        <div className="hl-detail-sub">Biblical cities inside <span className="hl-count">{sel.cities.biblical.length}</span></div>
        <div className="hl-chips">{sel.cities.biblical.map((c) => <button key={c.id} type="button" className={`hl-chip${c.id === KEY_CITY ? ' key' : ''}`} onClick={() => onCity(c)}>{c.translit} <span>{c.paleo}</span><small> {c.name}</small></button>)}{sel.cities.biblical.length === 0 && <span className="dim">none listed</span>}</div>
        <div className="hl-detail-sub">Today's cities inside <span className="hl-count">{sel.cities.modern.length}</span></div>
        <div className="hl-chips">{sel.cities.modern.map((c) => <button key={c.id} type="button" className="hl-chip m" onClick={() => onCity(c)}>{c.name} <span>{c.country}</span></button>)}{sel.cities.modern.length === 0 && <span className="dim">none listed</span>}</div>
      </div>
    );
  }
  if (sel.kind === 'water') {
    const w = sel.water;
    return (
      <div className="hl-detail hl-detail-water">
        <button type="button" className="hl-detail-x" onClick={onClose} aria-label="Close">×</button>
        <div className="hl-detail-paleo" dir="rtl">{w.paleo}</div>
        <div className="hl-detail-name">{w.tr} <em>{w.en}</em></div>
        <div className="hl-detail-ref">{w.base === 'sea' || w.base === 'Dead Sea' || w.base === 'Sea of Galilee' ? 'Sea' : 'River'}</div>
        <Lexical he={w.he} />
        <div className="hl-detail-sub">{w.proph ? 'History' : 'Scripture'}</div>
        <PassageRefs refs={w.ref} autoOpen />
        {w.proph && <><div className="hl-detail-sub">Prophecies</div><PassageRefs refs={w.proph} /></>}
        <PinRow pin={pin} at={sel.at} label={w.tr} onPin={onPin} onUnpin={onUnpin} />
        <div className="hl-detail-coord">{fmtLonLat(sel.at)}</div>
      </div>
    );
  }
  // Plain point
  return (
    <div className="hl-detail">
      <button type="button" className="hl-detail-x" onClick={onClose} aria-label="Close">×</button>
      <div className="hl-detail-name">This spot</div>
      <div className="hl-detail-ref">{fmtLonLat(sel.lonLat)}</div>
      <AllotmentLines joshua={sel.joshua} ezekiel={sel.ezekiel} />
      <div className="hl-detail-twin">
        {sel.joshua && <button type="button" className="hl-link" onClick={() => onRegion('joshua', sel.joshua)}>Open {sel.joshua.name} (Joshua)</button>}
        {sel.ezekiel?.band && <button type="button" className="hl-link" onClick={() => onRegion('ezekiel', sel.ezekiel.band)}>Open {sel.ezekiel.band.name} (Ezekiel)</button>}
        {sel.ezekiel?.sub && <button type="button" className="hl-link" onClick={() => onRegion('holy', sel.ezekiel.sub)}>Open {sel.ezekiel.sub.name}</button>}
      </div>
      <PinRow pin={pin} at={sel.lonLat} label={fmtLonLat(sel.lonLat)} onPin={onPin} onUnpin={onUnpin} />
    </div>
  );
}
