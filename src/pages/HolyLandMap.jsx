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
 * Route: /models/holy-land   (linked from /models — "Renderings & Models")
 * Deep links: ?city=<id>  ?overlay=joshua|ezekiel|both|none  ?basemap=plain|online  ?relief=0
 *             ?pin=<lon>,<lat>[,<label>]  — a dropped pin; every selection then shows its distance from it
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
import {
  JOSHUA_TRIBES, BIBLICAL_CITIES, MODERN_CITIES, TRIBE_COLORS, TRIBE_HEBREW,
  HOLY_KIND_STYLE, EZEKIEL_ORDER, EZEKIEL_MEASURES, TRIBE_TRANSLIT, TRIBE_PALEO, tribeDisplayName,
  ezekielAllotment, toFeature, ringCentroid, pointInRing, joshuaTribeAt, ezekielAt,
  squareToPaleo, translitOf,
  REGIONS, searchPlaces, haversineKm, bearingDeg, compass, fmtDistance, HOLY_WORDS,
} from '../lib/models/holyLand.js';
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtLonLat([lon, lat]) {
  return `${lat.toFixed(3)}°N ${lon.toFixed(3)}°E`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HolyLandMap() {
  usePageTitle(pageTitle('Holy Land in 3D — Renderings & Models'));
  const { theme, toggle: toggleTheme } = useTheme();
  const [params, setParams] = useSearchParams();

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const styleReady = useRef(false);

  const initialOverlay = params.get('overlay') || 'ezekiel';
  const [showJoshua, setShowJoshua] = useState(initialOverlay === 'joshua' || initialOverlay === 'both');
  const [showEzekiel, setShowEzekiel] = useState(initialOverlay === 'ezekiel' || initialOverlay === 'both');
  const [showBiblical, setShowBiblical] = useState(true);
  const [showModern, setShowModern] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  const [sq, setSq] = useState('');                 // top-bar search text
  const [sqOpen, setSqOpen] = useState(false);
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
    const map = mapRef.current;
    if (fly && map) {
      // Far-off nations get a wide view; cities get a close one.
      // Gentle: come in to a readable scale when far away, never zoom in further when already close.
      const cur = map.getZoom();
      const zoom = c.kind === 'region' ? Math.min(Math.max(cur, 5.5), 7) : (cur < 9.5 ? 9.5 : cur);
      map.flyTo({ center: [c.lon, c.lat], zoom, pitch: threeD ? 55 : 0, duration: 1400, essential: true });
    }
    const next = new URLSearchParams(params);
    next.set('city', c.id);
    setParams(next, { replace: true });
  }, [describePoint, params, setParams, threeD]);

  const selectRegion = useCallback((kind, entry, opts = {}) => {
    setSel({ kind, entry, cities: citiesIn(entry.ring), at: opts.at || null });
    setPanelOpen(true);
    const map = mapRef.current;
    if (!map || opts.fly === false) return;
    const lons = entry.ring.map((p) => p[0]), lats = entry.ring.map((p) => p[1]);
    // maxZoom keeps the small holy plots from filling the screen (a portion is the focus, not a wall of colour).
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, duration: 1200, pitch: threeD ? 45 : 0, maxZoom: kind === 'holy' ? 11 : 9.5 });
  }, [citiesIn, threeD]);

  // ── Overlay (re)build — called on every style load and on data changes ─────
  const applyOverlays = useCallback((map) => {
    if (!map || !styleReady.current) return;
    const ensure = (id, data) => {
      const src = map.getSource(id);
      if (src) src.setData(data); else map.addSource(id, { type: 'geojson', data });
    };
    // Pin → selection line (great-circle, densified so it curves correctly when far).
    const selPt = sel?.kind === 'city' ? [sel.city.lon, sel.city.lat] : sel?.kind === 'point' ? sel.lonLat : null;
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
    ensure('hl-joshua', { type: 'FeatureCollection', features: JOSHUA_TRIBES.map((t) => toFeature(t, { color: TRIBE_COLORS[t.tribe] })) });
    ensure('hl-ez-bands', { type: 'FeatureCollection', features: ez.bands.map((b) => toFeature(b, { color: TRIBE_COLORS[b.tribe] })) });
    ensure('hl-ez-holy', { type: 'FeatureCollection', features: ez.holy.map((h) => toFeature(h, { color: HOLY_KIND_STYLE[h.kind].color, opacity: HOLY_KIND_STYLE[h.kind].opacity })) });

      // Allotment fills/lines go UNDER the basemap's water layer so the sea
    // paints over them — borders end at the coast instead of running into it.
    const waterId = map.getLayer('water') ? 'water' : undefined;
    const addLayer = (layer, under = true) => { if (!map.getLayer(layer.id)) map.addLayer(layer, under ? waterId : undefined); };
    const selId = sel?.entry?.id || null;
    const fillOpacity = (base) => ['case', ['==', ['get', 'id'], selId || '__none__'], Math.min(base + 0.3, 0.95), base];

    // Ezekiel first (below), Joshua above — so with both on, Joshua's smaller
    // shapes read on top of the wide bands. Each has its own toggle anyway.
    addLayer({ id: 'hl-ez-fill', type: 'fill', source: 'hl-ez-bands', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': fillOpacity(0.38) } });
    addLayer({ id: 'hl-ez-line', type: 'line', source: 'hl-ez-bands', paint: { 'line-color': '#1a1208', 'line-width': 1.2, 'line-opacity': 0.8 } });
    addLayer({ id: 'hl-holy-fill', type: 'fill', source: 'hl-ez-holy', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['*', ['get', 'opacity'], 0.85] } });
    addLayer({ id: 'hl-holy-line', type: 'line', source: 'hl-ez-holy', paint: { 'line-color': '#1a1208', 'line-width': 1.4 } });
    addLayer({ id: 'hl-joshua-fill', type: 'fill', source: 'hl-joshua', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': fillOpacity(0.42) } });
    addLayer({ id: 'hl-joshua-line', type: 'line', source: 'hl-joshua', paint: { 'line-color': '#1a1208', 'line-width': 1.6, 'line-dasharray': [2, 1] } });
    addLayer({ id: 'hl-focus-glow', type: 'line', source: 'hl-focus', paint: { 'line-color': '#e8aa55', 'line-width': 22, 'line-blur': 12, 'line-opacity': 0.85 } });
    addLayer({ id: 'hl-focus-line', type: 'line', source: 'hl-focus', paint: { 'line-color': '#f5c070', 'line-width': 2.5 } });
    addLayer({ id: 'hl-pin-line-casing', type: 'line', source: 'hl-pin-line', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.7 } }, false);
    addLayer({ id: 'hl-pin-line', type: 'line', source: 'hl-pin-line', paint: { 'line-color': '#e05555', 'line-width': 2.5, 'line-dasharray': [3, 2] } }, false);

    const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('hl-ez-fill', showEzekiel); vis('hl-ez-line', showEzekiel);
    vis('hl-holy-fill', showEzekiel); vis('hl-holy-line', showEzekiel);
    vis('hl-joshua-fill', showJoshua); vis('hl-joshua-line', showJoshua);
    map.setPaintProperty('hl-ez-fill', 'fill-opacity', fillOpacity(0.38));
    map.setPaintProperty('hl-joshua-fill', 'fill-opacity', fillOpacity(0.42));
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

    if (showBiblical) {
      for (const c of BIBLICAL_CITIES) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `hl-mk hl-mk-b${c.id === KEY_CITY ? ' hl-mk-key' : ''}${c.id === selCityId ? ' hl-mk-sel' : ''}`;
        el.innerHTML = `<span class="hl-mk-dot"></span><span class="hl-mk-lbl"><span class="hl-mk-name">${c.translit}</span><span class="hl-mk-paleo" dir="rtl">${c.paleo}</span><span class="hl-mk-en">${c.name}</span></span>`;
        el.title = `${c.translit} (${c.name}) — read ${c.ref}`;
        el.addEventListener('click', (e) => { e.stopPropagation(); selectCity(c, false); });
        mk([c.lon, c.lat], el, { pri: c.id === KEY_CITY ? 0 : c.id === selCityId ? 1 : 2, w: Math.max(c.translit.length, c.name.length) * 7 + 14 });
      }
    }
    if (showModern) {
      for (const c of MODERN_CITIES) {
        const el = document.createElement('button');
        el.type = 'button';
        // A modern city on top of a biblical one (Yavne on Jabneel, Hebron on
        // Hebron…) gets its label pushed below the dot so the two don't collide.
        const twin = showBiblical && BIBLICAL_CITIES.some((b) => Math.hypot(b.lon - c.lon, b.lat - c.lat) < 0.03);
        // A twin keeps only its dot (nudged aside); its name lives in the biblical city's card.
        el.className = `hl-mk hl-mk-m${twin ? ' hl-mk-twin' : ''}${c.id === selCityId ? ' hl-mk-sel' : ''}`;
        el.innerHTML = `<span class="hl-mk-dot"></span><span class="hl-mk-lbl"><span class="hl-mk-name">${c.name}</span></span>`;
        el.title = `${c.name} (${c.country})`;
        el.addEventListener('click', (e) => { e.stopPropagation(); selectCity(c, false); });
        mk([c.lon, c.lat], el, { pri: c.id === selCityId ? 1 : 4, w: c.name.length * 7 + 14, twin });
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
    const regionLabel = (entry, cls, onClick) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `hl-rl ${cls}`;
      const tribe = entry.tribe;
      el.innerHTML = `<span class="hl-rl-name">${tribeDisplayName(entry.name, tribe)}</span>${tribe ? `<span class="hl-rl-paleo" dir="rtl">${TRIBE_PALEO[tribe] || ''}</span><span class="hl-rl-en">${entry.name}</span>` : ''}`;
      el.style.setProperty('--c', TRIBE_COLORS[tribe] || '#fff');
      el.title = `${entry.name} — cities in this portion and ${entry.ref}`;
      el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      mk(ringCentroid(entry.ring), el);
    };
    if (showJoshua) for (const t of JOSHUA_TRIBES) regionLabel(t, 'hl-rl-j', () => selectRegion('joshua', t));
    if (showEzekiel) {
      for (const b of ez.bands) regionLabel(b, 'hl-rl-e', () => selectRegion('ezekiel', b));
      for (const h of ez.holy) {
        const st = HOLY_KIND_STYLE[h.kind];
        if (!st.label) continue;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `hl-rl hl-rl-h hl-rl-h-${h.kind}`;
        el.textContent = st.label;
        el.title = `${h.name} — ${h.ref}`;
        el.addEventListener('click', (e) => { e.stopPropagation(); selectRegion('holy', h); });
        mk(ringCentroid(h.ring), el);
      }
      // The Holy Portion itself — labelled above its square (48:8–20).
      // Sits out over the sea, level with the square, so it never covers a band label.
      const [, sqTop, , sqBot] = ez.meta.square;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hl-rl hl-rl-holy';
      el.innerHTML = `<span class="hl-rl-name">${HOLY_WORDS.terumah.tr} →</span><span class="hl-rl-paleo" dir="rtl">${HOLY_WORDS.terumah.paleo}</span><span class="hl-rl-en">the Holy Portion · Ezekiel 48:8–22</span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); selectRegion('holy', ez.holy.find((h) => h.kind === 'priests')); });
      const m = new maplibregl.Marker({ element: el, anchor: 'right', offset: [-6, 0] }).setLngLat([ez.meta.westLon, (sqTop + sqBot) / 2]).addTo(map);
      markersRef.current.push(m);
    }
  }, [ez, sel, pin, showBiblical, showEzekiel, showJoshua, showModern, showRegions, relief, onlineLabels, selectCity, selectRegion]);

  const applyRef = useRef(applyOverlays);
  applyRef.current = applyOverlays;

  // Label decluttering: at the current view, higher-priority labels win and
  // any label whose box would overlap one already placed is hidden (the dot
  // stays). Runs after every rebuild and at the end of every pan/zoom.
  const declutterRef = useRef(null);
  declutterRef.current = (map) => {
    if (!map) return;
    const z = map.getZoom();
    const showAll = z >= 7.5;
    const placed = [];
    const items = markersRef.current.filter((m) => m._hl).map((m) => ({ m, p: map.project(m.getLngLat()) }))
      .sort((a, b) => a.m._hl.pri - b.m._hl.pri);
    for (const { m, p } of items) {
      const { pri, w, twin } = m._hl;
      const el = m.getElement();
      const always = pri <= 1;                // key city + selection always labelled
      if (twin && !always) { el.classList.add('hl-mk-hide'); continue; }
      if (!showAll && !always && pri > 2) { el.classList.add('hl-mk-hide'); continue; }
      const box = { x1: p.x + 6, y1: p.y - 12, x2: p.x + 6 + w, y2: p.y + 22 };
      const hit = placed.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
      if (hit && !always) { el.classList.add('hl-mk-hide'); continue; }
      el.classList.remove('hl-mk-hide');
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
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');
      map.on('style.load', () => {
        styleReady.current = true;
        try { map.setTerrain(threeDRef.current ? { source: 'hl-dem', exaggeration: exagRef.current } : null); } catch { /* terrain unsupported */ }
        applyRef.current(map);
      });
      map.on('zoom', () => setZoom(map.getZoom()));
      map.on('moveend', () => declutterRef.current(map));
      map.on('click', (e) => {
        const lonLat = [e.lngLat.lng, e.lngLat.lat];
        // The shading itself is the button: a click inside a portion selects
        // that portion (most specific first — a holy sub-plot, then a Joshua
        // tribe, then an Ezekiel band). Only bare ground gives "This spot".
        const ez = ezRef.current;
        const hit = (layer) => map.getLayer(layer) && map.queryRenderedFeatures(e.point, { layers: [layer] })[0]?.properties?.id;
        const holyId = hit('hl-holy-fill'), joshId = hit('hl-joshua-fill'), ezId = hit('hl-ez-fill');
        const holy = holyId && ez.holy.find((h) => h.id === holyId);
        const josh = joshId && JOSHUA_TRIBES.find((t) => t.id === joshId);
        const band = ezId && ez.bands.find((b) => b.id === ezId);
        if (holy) selectRegionRef.current('holy', holy, { fly: false, at: lonLat });
        else if (josh) selectRegionRef.current('joshua', josh, { fly: false, at: lonLat });
        else if (band) selectRegionRef.current('ezekiel', band, { fly: false, at: lonLat });
        else {
          setSel({ kind: 'point', lonLat, joshua: joshuaTribeAt(lonLat), ezekiel: ezekielAt(lonLat, ez) });
          setPanelOpen(true);
        }
      });
      map.on('mousemove', (e) => {
        const layers = ['hl-holy-fill', 'hl-joshua-fill', 'hl-ez-fill'].filter((id) => map.getLayer(id));
        map.getCanvas().style.cursor = layers.length && map.queryRenderedFeatures(e.point, { layers }).length ? 'pointer' : '';
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

  // Deep-link ?city=… on first load (after the map exists).
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    const id = params.get('city');
    if (!id) { deepLinked.current = true; return; }
    const c = [...BIBLICAL_CITIES, ...MODERN_CITIES].find((x) => x.id === id);
    if (!c) { deepLinked.current = true; return; }
    const t = setInterval(() => {
      if (mapRef.current && styleReady.current) { clearInterval(t); deepLinked.current = true; selectCity(c, true); }
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
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJoshua, showEzekiel, basemap, relief, pin]);

  const searchHits = useMemo(() => searchPlaces(sq, 8), [sq]);
  const pickHit = (c) => { setSq(''); setSqOpen(false); selectCity(c, true); };
  const dropPin = useCallback((lonLat, label) => {
    setPin({ lon: lonLat[0], lat: lonLat[1], label: label || fmtLonLat(lonLat) });
  }, []);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const filteredBiblical = useMemo(() => {
    const s = q.trim().toLowerCase();
    return BIBLICAL_CITIES.filter((c) => !s || `${c.name} ${c.translit} ${c.he} ${c.ref}`.toLowerCase().includes(s));
  }, [q]);
  const filteredModern = useMemo(() => {
    const s = q.trim().toLowerCase();
    return MODERN_CITIES.filter((c) => !s || `${c.name} ${c.country}`.toLowerCase().includes(s));
  }, [q]);
  const filteredRegions = useMemo(() => {
    const s = q.trim().toLowerCase();
    return REGIONS.filter((c) => !s || `${c.name} ${c.translit} ${c.he} ${c.paleo} ${c.ref}`.toLowerCase().includes(s));
  }, [q]);

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

  const goHome = () => mapRef.current?.fitBounds(HOME_BOUNDS, { padding: 20, pitch: threeD ? 50 : 0, bearing: -8, duration: 1200 });
  const keyCity = BIBLICAL_CITIES.find((c) => c.id === KEY_CITY);

  return (
    <div className={`hl-page${panelOpen ? ' hl-panel-open' : ''}`} data-basemap={basemap}>
      <header className="hl-top">
        <Link to="/landing" className="hl-logo" title="Home">𐤀𐤁</Link>
        <Link to="/models" className="hl-back" title="Renderings & Models">← Models</Link>
        <h1 className="hl-h1">The Holy Land in 3D <span>Joshua &amp; Ezekiel allotments</span></h1>
        <div className="hl-searchbox">
          <input
            className="hl-searchbox-in"
            value={sq}
            onChange={(e) => { setSq(e.target.value); setSqOpen(true); }}
            onFocus={() => setSqOpen(true)}
            onBlur={() => setTimeout(() => setSqOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && searchHits[0]) pickHit(searchHits[0]); if (e.key === 'Escape') { setSq(''); setSqOpen(false); } }}
            placeholder="Go to… Greece, Yawan, 𐤉𐤅𐤍, Jabneel, Damascus"
            aria-label="Search places"
          />
          {sqOpen && searchHits.length > 0 && (
            <ul className="hl-searchbox-dd" role="listbox">
              {searchHits.map((c, i) => (
                <li key={c.id}>
                  <button type="button" className={`hl-hit${i === 0 ? ' first' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pickHit(c)}>
                    <span className={`hl-hit-kind k-${c.kind}`}>{c.kind === 'biblical' ? 'Bible' : c.kind === 'region' ? 'Nation' : 'Today'}</span>
                    <span className="hl-hit-main"><b>{c.translit || c.name}</b>{c.translit && <em> {c.name}</em>}{c.country && <em> · {c.country}</em>}</span>
                    {c.paleo && <span className="hl-hit-paleo" dir="rtl">{c.paleo}</span>}
                    {pin && <span className="hl-hit-dist">{fmtDistance(haversineKm([pin.lon, pin.lat], [c.lon, c.lat])).text.split(' · ')[0]}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="hl-top-actions">
          <button type="button" className="hl-btn" onClick={() => keyCity && selectCity(keyCity, true)} title="Fly to Jabneel — Joshua 15:11">
            <span className="hl-btn-paleo" dir="rtl">{keyCity?.paleo}</span> {keyCity?.translit}
          </button>
          <button type="button" className="hl-btn" onClick={goHome} title="Whole land">⌂</button>
          <button type="button" className="hl-btn" onClick={toggleTheme} title="Toggle light/dark">{theme === 'dark' ? '☀' : '☾'}</button>
          <button type="button" className="hl-btn hl-panel-toggle" onClick={() => setPanelOpen((v) => !v)} title="Toggle panel">☰</button>
        </div>
      </header>

      <div className="hl-body">
        <aside className="hl-panel" aria-label="Map controls">
          <div className="hl-tabs" role="tablist">
            {[['layers', 'Layers'], ['cities', 'Cities'], ['peoples', 'Peoples']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`hl-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {sel && <Detail sel={sel} ez={ez} pin={pin} onPin={dropPin} onUnpin={() => setPin(null)} onClose={() => setSel(null)} onCity={(c) => selectCity(c, true)} onRegion={selectRegion} />}
          {pin && !sel && (
            <div className="hl-detail hl-detail-pin">
              <div className="hl-detail-name">📍 {pin.label}</div>
              <div className="hl-detail-ref">Pinned — pick any place and its distance from here is shown. <button type="button" className="hl-link" onClick={() => setPin(null)}>Unpin</button></div>
            </div>
          )}

          {tab === 'layers' && (
            <div className="hl-sec">
              <div className="hl-sec-h">Allotment overlays</div>
              <label className="hl-row"><input type="checkbox" checked={showJoshua} onChange={(e) => setShowJoshua(e.target.checked)} /> <span className="hl-sw" style={{ background: 'repeating-linear-gradient(45deg,#4cca7a,#4cca7a 4px,#6e8aa6 4px,#6e8aa6 8px)' }} /> Joshua 13–19 (conquest)</label>
              <label className="hl-row"><input type="checkbox" checked={showEzekiel} onChange={(e) => setShowEzekiel(e.target.checked)} /> <span className="hl-sw" style={{ background: 'linear-gradient(#e05555,#3ecfb0,#f2d94e,#4cca7a,#c9c3b8,#f0883e,#6e8aa6,#fff,#2e4a6e,#7a3b5e,#8f8f8f,#a63b8a,#6b3fa0)' }} /> Ezekiel 47–48 (millennial)</label>
              {showEzekiel && (
                <div className="hl-sub">
                  <div className="hl-sub-h">Holy Portion — 25,000 × 25,000 cubits ≈ {ez.meta.holyKm.toFixed(1)} km / {(ez.meta.holyKm * 0.621371).toFixed(1)} mi a side</div>
                  <div className="hl-key">
                    {Object.entries(HOLY_KIND_STYLE).filter(([, st]) => st.label).map(([k, st]) => (
                      <span key={k} className="hl-key-i"><b style={{ background: st.color }}>{st.label}</b> {ez.holy.find((h) => h.kind === k)?.name}</span>
                    ))}
                  </div>
                  <div className="hl-note">Northern tribes ≈ {ez.meta.northKm.toFixed(0)} km ({(ez.meta.northKm * 0.621371).toFixed(0)} mi) each, southern ≈ {ez.meta.southKm.toFixed(0)} km ({(ez.meta.southKm * 0.621371).toFixed(0)} mi); the city {ez.meta.cityKm.toFixed(1)} km square, the sanctuary {ez.meta.sanctKm.toFixed(1)} km square.</div>
                  <details className="hl-measures">
                    <summary>Every measurement, with its verse</summary>
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
                </div>
              )}
              <div className="hl-sec-h">Places</div>
              <label className="hl-row"><input type="checkbox" checked={showBiblical} onChange={(e) => setShowBiblical(e.target.checked)} /> <span className="hl-sw hl-sw-b" /> Biblical cities (Joshua)</label>
              <label className="hl-row"><input type="checkbox" checked={showModern} onChange={(e) => setShowModern(e.target.checked)} /> <span className="hl-sw hl-sw-m" /> Today's cities</label>
              <label className="hl-row"><input type="checkbox" checked={showRegions} onChange={(e) => setShowRegions(e.target.checked)} /> <span className="hl-sw hl-sw-r" /> Nations &amp; lands beyond (Greece, Egypt, Babylon…)</label>
              <div className="hl-note">City labels appear from zoom 7.5 (now {zoom.toFixed(1)}); Jabneel is always labelled.</div>

              <div className="hl-sec-h">Base map</div>
              <div className="hl-seg">
                {BASEMAPS.map((b) => (
                  <button key={b.id} type="button" className={`hl-seg-b${basemap === b.id ? ' on' : ''}`} onClick={() => setBasemap(b.id)}>{b.label} <small>{b.sub}</small></button>
                ))}
              </div>
              {basemap === 'online' && <label className="hl-row"><input type="checkbox" checked={onlineLabels} onChange={(e) => setOnlineLabels(e.target.checked)} /> Show the online map's place names (English)</label>}
              <label className="hl-row"><input type="checkbox" checked={relief} onChange={(e) => setRelief(e.target.checked)} /> Relief shading <small className="hl-inline-note">(elevation tiles fetched online; off = fully self-contained)</small></label>
              <label className="hl-row"><input type="checkbox" checked={threeD} onChange={(e) => setThreeD(e.target.checked)} /> 3D terrain (drag with right mouse / two fingers to tilt &amp; rotate)</label>
              <label className="hl-row hl-range">Relief ×{exag.toFixed(1)} <input type="range" min="0.5" max="3" step="0.1" value={exag} disabled={!threeD} onChange={(e) => setExag(+e.target.value)} /></label>

              <div className="hl-sec-h">Tribes</div>
              <div className="hl-legend">
                {Object.entries(TRIBE_COLORS).map(([t, c]) => (
                  <span key={t} className="hl-legend-i"><i style={{ background: c }} /> <b>{TRIBE_TRANSLIT[t]}</b> <small>{t}</small> <span className="hl-legend-paleo" dir="rtl">{TRIBE_PALEO[t]}</span></span>
                ))}
              </div>
              <div className="hl-note hl-note-warn">Borders are idealized study-map shapes drawn from the landmark lists in Joshua 13–19 and Ezekiel 47–48, not surveyed lines; city dots use the conventional identifications.</div>
            </div>
          )}

          {tab === 'cities' && (
            <div className="hl-sec">
              <input className="hl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a city — English, transliteration, Hebrew, reference…" />
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
              <div className="hl-note">Who lives in each of Ezekiel's portions today — every band from north to south, with the modern cities that fall inside it. Click a band name to zoom to it.</div>
              {peoples.map((p) => {
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
        <div className={`hl-map-wrap${zoom >= 7.5 ? ' hl-z-labels' : ''}`}>
          <div ref={mapEl} className="hl-map" />
          {error && <div className="hl-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}


// ── Passage chips + inline verse text ────────────────────────────────────────
// Every reference on the map is a button: click it and the verses themselves
// appear right here (the app's own Novel English), with a link into the Reader
// that highlights the whole range (?verse=&verseEnd=). Chapters are cached.
const _chapterCache = new Map();
function loadChapter(bookId, chapter) {
  const k = `${bookId}:${chapter}`;
  if (!_chapterCache.has(k)) _chapterCache.set(k, apiTransChapter(bookId, chapter).then((d) => d?.verses || []).catch(() => []));
  return _chapterCache.get(k);
}

function Passage({ refObj }) {
  const [verses, setVerses] = useState(null);
  useEffect(() => {
    let live = true;
    setVerses(null);
    loadChapter(refObj.bookId, refObj.chapter).then((vs) => { if (live) setVerses(vs.filter((v) => inRanges(+v.verse, refObj.ranges))); });
    return () => { live = false; };
  }, [refObj]);
  return (
    <div className="hl-passage">
      <div className="hl-passage-h">
        <b>{refObj.label}</b>
        <Link to={readerHref(refObj)} className="hl-passage-open">Open in the Reader →</Link>
      </div>
      {verses === null && <div className="hl-passage-wait">Loading…</div>}
      {verses && verses.length === 0 && <div className="hl-passage-wait">No English text for this passage yet.</div>}
      {verses && verses.map((v) => (
        <p key={v.verse} className="hl-verse"><sup>{v.verse}</sup>{v.text}</p>
      ))}
    </div>
  );
}

export function PassageRefs({ refs, autoOpen = false, size = 'md' }) {
  const parsed = useMemo(() => parseRefs(refs), [refs]);
  const [open, setOpen] = useState(autoOpen ? 0 : -1);
  useEffect(() => { setOpen(autoOpen ? 0 : -1); }, [refs, autoOpen]);
  if (!parsed.length) return refs ? <span className="hl-detail-ref">{refs}</span> : null;
  return (
    <div className={`hl-refs hl-refs-${size}`}>
      <div className="hl-refs-row">
        {parsed.map((r, i) => (
          <button key={r.label} type="button" className={`hl-refchip${open === i ? ' on' : ''}`} onClick={() => setOpen(open === i ? -1 : i)} title="Show the verses">
            <span aria-hidden="true">📖</span> {r.label}
          </button>
        ))}
      </div>
      {open >= 0 && parsed[open] && <Passage refObj={parsed[open]} />}
    </div>
  );
}

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

function Detail({ sel, ez, pin, onPin, onUnpin, onClose, onCity, onRegion }) {
  if (sel.kind === 'city') {
    const c = sel.city;
    const twinBiblical = c.kind === 'modern' ? BIBLICAL_CITIES.filter((b) => Math.hypot(b.lon - c.lon, b.lat - c.lat) < 0.03) : [];
    const twinModern = c.kind === 'biblical' ? MODERN_CITIES.filter((m) => Math.hypot(m.lon - c.lon, m.lat - c.lat) < 0.03) : [];
    return (
      <div className={`hl-detail${c.id === KEY_CITY ? ' key' : ''}`}>
        <button type="button" className="hl-detail-x" onClick={onClose} aria-label="Close">×</button>
        {c.kind !== 'modern' ? (
          <>
            <div className="hl-detail-paleo" dir="rtl">{c.paleo}</div>
            <div className="hl-detail-name">{c.translit} <em>{c.name}</em></div>
            <div className="hl-detail-he">{c.he}</div>
            <Lexical he={c.he} />
            {c.note && <p className="hl-detail-note">{c.note}</p>}
            <PassageRefs refs={c.ref} autoOpen />
          </>
        ) : (
          <>
            <div className="hl-detail-name">{c.name} <em>{c.country}</em></div>
            <div className="hl-detail-ref">{c.pop}</div>
            {c.note && <p className="hl-detail-note">{c.note}</p>}
          </>
        )}
        <AllotmentLines joshua={sel.joshua} ezekiel={sel.ezekiel} />
        {twinModern.length > 0 && <div className="hl-detail-twin">Today: {twinModern.map((m) => <button key={m.id} type="button" className="hl-link" onClick={() => onCity(m)}>{m.name} ({m.country})</button>)}</div>}
        {twinBiblical.length > 0 && <div className="hl-detail-twin">Biblical: {twinBiblical.map((b) => <button key={b.id} type="button" className="hl-link" onClick={() => onCity(b)}>{b.translit} <span dir="rtl">{b.paleo}</span> ({b.name})</button>)}</div>}
        <PinRow pin={pin} at={[c.lon, c.lat]} label={c.translit || c.name} onPin={onPin} onUnpin={onUnpin} />
        <div className="hl-detail-coord">{fmtLonLat([c.lon, c.lat])}</div>
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
        {e.tribe && <div className="hl-detail-he">{e.name} · {TRIBE_HEBREW[e.tribe]}</div>}
        {e.he && <div className="hl-detail-paleo" dir="rtl">{squareToPaleo(e.he)}</div>}
        <div className="hl-detail-ref">{sel.kind === 'joshua' ? 'Joshua allotment' : 'Ezekiel — millennial allotment'}</div>
        <Lexical he={e.he || (e.tribe ? TRIBE_HEBREW[e.tribe] : null)} />
        <PassageRefs refs={e.ref} autoOpen />
        {sel.at && <PinRow pin={pin} at={sel.at} label={`${tribeDisplayName(e.name, e.tribe)} (${fmtLonLat(sel.at)})`} onPin={onPin} onUnpin={onUnpin} />}
        {sel.kind === 'holy' && e.kind === 'sanctuary' && <p className="hl-detail-note">500 × 500 with 50 of open land round it (45:2), in the midst of the priests' portion.</p>}
        <div className="hl-detail-sub">Biblical cities inside <span className="hl-count">{sel.cities.biblical.length}</span></div>
        <div className="hl-chips">{sel.cities.biblical.map((c) => <button key={c.id} type="button" className={`hl-chip${c.id === KEY_CITY ? ' key' : ''}`} onClick={() => onCity(c)}>{c.translit} <span>{c.paleo}</span><small> {c.name}</small></button>)}{sel.cities.biblical.length === 0 && <span className="dim">none listed</span>}</div>
        <div className="hl-detail-sub">Today's cities inside <span className="hl-count">{sel.cities.modern.length}</span></div>
        <div className="hl-chips">{sel.cities.modern.map((c) => <button key={c.id} type="button" className="hl-chip m" onClick={() => onCity(c)}>{c.name} <span>{c.country}</span></button>)}{sel.cities.modern.length === 0 && <span className="dim">none listed</span>}</div>
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
