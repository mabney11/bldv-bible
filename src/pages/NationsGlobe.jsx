/**
 * NationsGlobe.jsx — /models/nations: the nations of Genesis on a globe.
 *
 * fieldy, 2026-10-28: "a world map/globe with the full allotments from genesis" — a new page, every nation's land
 * filled in, and every genealogy as a view of the same earth ("its the same earth at different times, they can be
 * views"): Genesis 10 (the sons of Noah), 11 (Shem to Abram, Ur to Haran), 25 (Keturah and Ishmael), 36 (Edom).
 *
 * Everything is baked offline by scripts/build-nations.py into lib/models/nations.json — names are the Strong's
 * lemmas (Paleo) of server/strongs-hebrew-paleo.json, read here through translitOf like every other model; places
 * are the conventional identifications in scripts/nations-source.json, each marked known / probable / uncertain;
 * a territory is the land nearer its place than any other's in that view. Nothing is fetched but the verses.
 *
 * THE STORY (fieldy, same day: "make the allotments story read the story (my translated scriptures) similar to how the
 * interacted models do … animated story with text and also interactive"): each view plays its chapter pane by pane —
 * `stories` in the source, one pane per verse or verse group. The caption is the verse itself, quoted LIVE from his
 * translation ({{Genesis 10:2}} — never a copy), spoken word by word into the globe (CanvasSubtitles) under a title of
 * the names it introduces; the lands it names rise as it is read and stay, the camera flies to them, and Genesis 11's
 * road is drawn as the family walks it. Play / pause / scrub / speed / reading pace / subtitles are the story models'
 * own player (ModelKit). Before the first play — or after "Show all lands" — every land is on show to explore.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { pageTitle } from '../hooks/usePageTitle.js';
import { useModelSeo } from '../lib/models/seo.js';
import { PassageRefs, Glossed } from '../components/PassageRefs.jsx';
import { usePlayer, Caption, PaceSelect, CanvasSubtitles, CanvasTitle, SubtitlesToggle, useSubtitles } from '../components/ModelKit.jsx';
import { translitOf, labelAnchor } from '../lib/models/holyLand.js';
import NATIONS from '../lib/models/nations.json';
import './NationsGlobe.css';

const SEA = '#7fa6c9', LAND = '#e6dcc6', GOLD = '#f5c070';
const VIEW_IDS = Object.keys(NATIONS.views);
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth <= 720;
const CERT = { known: 'known place', probable: 'probable identification', uncertain: 'uncertain identification', unknown: 'place not known' };
// Genesis 11's road: Ur of the Chaldees → Haran (11:31) → the land of Canaan, Shechem (12:5–6)
const G11_ROAD = [[46.1, 30.96], [39.03, 36.87], [35.28, 32.21]];
const G11_STOPS = [
  { lon: 46.1, lat: 30.96, en: 'Ur of the Chaldees', ref: 'Genesis 11:28, 31' },
  { lon: 39.03, lat: 36.87, en: 'Haran', ref: 'Genesis 11:31–32' },
  { lon: 35.28, lat: 32.21, en: 'Shechem, in the land of Canaan', ref: 'Genesis 12:5–6' },
];

const ENTRIES = NATIONS.entries.map((e) => ({ ...e, tr: translitOf(e.paleo) }));
const BY_ID = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));

// ── The story: one timeline a view, a pane per verse (group) ──
const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
const PANE_SECS = 7;      // a pane's story time; the subtitles slow the player wherever its verse needs longer
const TIMELINES = Object.fromEntries(VIEW_IDS.map((vid) => {
  let t = 0;
  const phases = (NATIONS.stories?.[vid] || []).map((p, i) => {
    const ph = { ...p, i, key: `${vid}:${i}`, from: t, caption: `{{${p.ref}}}`, title: (p.names || []).map((id) => BY_ID[id]?.tr).filter(Boolean).join(' · ') };
    t += p.dur || PANE_SECS;
    return ph;
  });
  const empty = { i: 0, key: `${vid}:-`, from: 0, caption: '', ref: '' };
  const phaseAt = (x) => { let cur = phases[0] || empty; for (const ph of phases) if (ph.from <= x + 1e-6) cur = ph; return cur; };
  return [vid, { key: vid, duration: t || 1, phases, phaseAt }];
}));
// the pane at which each land (and each Genesis 11 mark) first rises; a land no pane names is there from the start
const AT = Object.fromEntries(VIEW_IDS.map((vid) => {
  const at = {};
  TIMELINES[vid].phases.forEach((ph) => {
    for (const id of [...(ph.show || []), ...(ph.points || [])]) if (at[id] == null) at[id] = ph.i;
    for (const n of ph.stops || []) if (at[`stop:${n}`] == null) at[`stop:${n}`] = ph.i;
  });
  return [vid, at];
}));
const atOf = (vid, id) => AT[vid][id] ?? 0;
const TERR = Object.fromEntries(Object.entries(NATIONS.territories).map(([v, ts]) => [v, Object.fromEntries(ts.map((t) => [t.id, t]))]));
const close = (r) => [...r, r[0]];
const ringArea = (r) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

function landStyle() {
  return {
    version: 8,
    projection: { type: 'globe' },
    sources: {
      'ng-land': { type: 'geojson', data: { type: 'FeatureCollection', features: NATIONS.land.map((rings) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } })) }, attribution: 'Coastlines: Natural Earth' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': SEA } },
      { id: 'ng-land', type: 'fill', source: 'ng-land', paint: { 'fill-color': LAND } },
      { id: 'ng-coast', type: 'line', source: 'ng-land', paint: { 'line-color': '#4f7599', 'line-width': 0.6, 'line-opacity': 0.7 } },
    ],
  };
}

// the genealogy of a view, as a tree: [{ e, kids: [...] }]
function treeOf(view) {
  const es = ENTRIES.filter((e) => e.view === view);
  const kids = (id) => es.filter((e) => e.parent === id).map((e) => ({ e, kids: kids(e.id) }));
  return es.filter((e) => !e.parent || !BY_ID[e.parent] || BY_ID[e.parent].view !== view).map((e) => ({ e, kids: kids(e.id) }));
}

export default function NationsGlobe() {
  useModelSeo(pageTitle('The Nations of Genesis — Maps'), 'The table of nations of Genesis 10 and the genealogies of Genesis 11, 25 and 36 on a globe: every name in Paleo-Hebrew with its land, its verses and how sure the identification is.');
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(VIEW_IDS.includes(params.get('view')) ? params.get('view') : 'gen10');
  const [selId, setSelId] = useState(params.get('n') && BY_ID[params.get('n')] ? params.get('n') : null);
  const [panelOpen, setPanelOpen] = useState(() => !isNarrow());
  const panelOpenRef = useRef(panelOpen); panelOpenRef.current = panelOpen;
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef([]);
  const ready = useRef(false);
  const sel = selId ? BY_ID[selId] : null;
  const v = NATIONS.views[view];
  const tree = useMemo(() => treeOf(view), [view]);

  const fitFrame = useCallback((vid, duration = 1200) => {
    const map = mapRef.current;
    if (!map) return;
    const [x0, y0, x1, y1] = NATIONS.views[vid].frame;
    map.fitBounds([[x0, y0], [x1, y1]], { padding: isNarrow() ? { top: 16, left: 12, right: 12, bottom: panelOpenRef.current ? Math.round(window.innerHeight * 0.42) : 16 } : 40, duration });
  }, []);

  const select = useCallback((e, fly = true) => {
    setSelId(e ? e.id : null);
    if (!e) return;
    if (isNarrow()) setPanelOpen(true);
    const map = mapRef.current;
    if (!fly || !map) return;
    const t = TERR[e.view]?.[e.id];
    const pad = isNarrow() ? { top: 30, left: 30, right: 30, bottom: Math.round(window.innerHeight * 0.48) } : 60;
    if (t) {
      const pts = t.polys.flatMap((p) => p[0]);
      const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: pad, maxZoom: e.view === 'gen36' ? 9 : 6.5, duration: 1100 });
    } else if (e.lon != null) map.flyTo({ center: [e.lon, e.lat], zoom: Math.max(map.getZoom(), 5), duration: 1100 });
  }, []);

  // ── draw the view (territories, labels, the Genesis 11 road) ──
  const draw = useCallback(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const terr = NATIONS.territories[view] || [];
    const feats = terr.flatMap((t) => t.polys.map((rings) => ({ type: 'Feature', properties: { id: t.id, color: BY_ID[t.id].color, at: atOf(view, t.id) }, geometry: { type: 'Polygon', coordinates: rings } })));
    const set = (id, data) => { const s = map.getSource(id); if (s) s.setData(data); else map.addSource(id, { type: 'geojson', data }); };
    set('ng-terr', { type: 'FeatureCollection', features: feats });
    const st = sel && sel.view === view && TERR[view]?.[sel.id];
    set('ng-sel', { type: 'FeatureCollection', features: st ? st.polys.map((rings) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } })) : [] });
    if (!map.getSource('ng-road')) set('ng-road', { type: 'FeatureCollection', features: [] });
    const add = (l) => { if (!map.getLayer(l.id)) map.addLayer(l); };
    add({ id: 'ng-terr-fill', type: 'fill', source: 'ng-terr', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.72 } });
    add({ id: 'ng-terr-line', type: 'line', source: 'ng-terr', paint: { 'line-color': '#1a1208', 'line-width': 0.8, 'line-opacity': 0.65 } });
    add({ id: 'ng-coast-top', type: 'line', source: 'ng-land', paint: { 'line-color': '#4f7599', 'line-width': 0.7, 'line-opacity': 0.8 } });
    // the lands of the pane being read: a gold rim as they rise
    add({ id: 'ng-now-glow', type: 'line', source: 'ng-terr', filter: ['==', ['get', 'at'], -1], paint: { 'line-color': '#e8aa55', 'line-width': 9, 'line-blur': 6, 'line-opacity': 0.8 } });
    add({ id: 'ng-sel-glow', type: 'line', source: 'ng-sel', paint: { 'line-color': '#e8aa55', 'line-width': 14, 'line-blur': 8, 'line-opacity': 0.85 } });
    add({ id: 'ng-sel-line', type: 'line', source: 'ng-sel', paint: { 'line-color': GOLD, 'line-width': 2.4 } });
    add({ id: 'ng-road', type: 'line', source: 'ng-road', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#b8860b', 'line-width': 3, 'line-dasharray': [2, 1.4] } });

    for (const m of markers.current) m.remove();
    markers.current = [];
    const mk = (lonLat, el, pri, at = 0) => { const m = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat(lonLat).addTo(map); m._pri = pri; m._at = at; markers.current.push(m); };
    const label = (e, cls, lonLat, pri) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `ng-lbl ${cls}${sel && sel.id === e.id ? ' on' : ''}`;
      el.style.setProperty('--c', e.color);
      el.innerHTML = `<span class="ng-lbl-tr">${e.tr}</span><span class="ng-lbl-paleo" dir="rtl">${e.paleo}</span><span class="ng-lbl-en">${e.en}</span>`;
      el.title = `${e.tr} (${e.en}) — ${e.ref}`;
      el.addEventListener('click', (ev) => { ev.stopPropagation(); select(e, false); });
      mk(lonLat, el, pri, atOf(view, e.id));
    };
    for (const t of terr) {
      const e = BY_ID[t.id];
      const ring = t.polys.map((p) => p[0]).sort((a, b) => ringArea(b) - ringArea(a))[0].slice(0, -1);
      const a = labelAnchor(ring, 2.2);
      // a son of Noah's own line reads first; within a line, the bigger land first
      label(e, `ng-lbl-terr${e.cert === 'uncertain' ? ' unc' : ''}`, [a.lon, a.lat], (sel && sel.id === e.id ? 0 : 1) + 1 / (1 + ringArea(ring)));
    }
    if (view === 'gen11') {
      // the road's stops carry the people placed at or beside them (Tharach died in Haran, Haran in Ur); the rest stand alone
      // within ~1°: Sharawag (Serug) and Nachawar (Nahor) are towns of the Haran district
      const at = (e, s) => Math.abs(e.lon - s.lon) < 1.1 && Math.abs(e.lat - s.lat) < 1.1;
      const placed = ENTRIES.filter((x) => x.view === 'gen11' && x.lon != null);
      G11_STOPS.forEach((s, i) => {
        const el = document.createElement('div');
        el.className = 'ng-stop';
        const who = placed.filter((e) => at(e, s)).map((e) => `${e.tr} <span dir="rtl">${e.paleo}</span>`).join(' · ');
        el.innerHTML = `<b>${i + 1}</b><span>${s.en}${who ? `<br><i>${who}</i>` : ''}</span>`;
        el.title = s.ref;
        mk([s.lon, s.lat], el, 0.5, atOf(view, `stop:${i}`));
      });
      for (const e of placed.filter((x) => !G11_STOPS.some((s) => at(x, s)))) label(e, 'ng-lbl-pt ng-detail', [e.lon, e.lat], 0.8);
    }
    revealRef.current();
  }, [view, sel, select]);

  // labels: higher priority first; a label touching one already placed is hidden
  const declutter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    const placed = [];
    for (const m of [...markers.current].sort((a, b) => a._pri - b._pri)) {
      const el = m.getElement();
      el.classList.toggle('ng-detail', z >= 5);
      el.classList.remove('ng-hide');
      if (el.classList.contains('ng-later')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const box = { l: r.left - 2, r: r.right + 2, t: r.top - 1, b: r.bottom + 1 };
      if (m._pri >= 1 && placed.some((q) => box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t)) { el.classList.add('ng-hide'); continue; }
      placed.push(box);
    }
  }, []);

  // ── the story ──
  const tl = TIMELINES[view];
  const player = usePlayer(tl);
  const { clock, playing, speed, setSpeed, loop, setLoop, phase, play, pause, seek, restart, scrubRef, timeRef, hold, continueNow } = player;
  const subs = useSubtitles();
  const [scrubbed, setScrubbed] = useState(null);
  const [story, setStory] = useState(false);            // lands rise pane by pane (once played / scrubbed); false = every land on show
  useEffect(() => { if (playing) setStory(true); }, [playing]);
  useEffect(() => { setStory(false); setScrubbed(null); }, [view]);
  const idx = phase?.i ?? 0;
  const storyRef = useRef({ story, idx, phase }); storyRef.current = { story, idx, phase };

  // which lands, labels and marks are up
  const reveal = useCallback(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !map.getLayer('ng-terr-fill')) return;
    const { story: on, idx: i } = storyRef.current;
    const upTo = on ? ['<=', ['get', 'at'], i] : null;
    map.setFilter('ng-terr-fill', upTo); map.setFilter('ng-terr-line', upTo);
    map.setFilter('ng-now-glow', ['==', ['get', 'at'], on ? i : -1]);
    for (const m of markers.current) m.getElement().classList.toggle('ng-later', on && m._at > i);
    declutter();
  }, [declutter]);
  const revealRef = useRef(reveal); revealRef.current = reveal;
  useEffect(() => { reveal(); }, [reveal, story, idx]);

  // the camera goes where the pane's verse is
  const boundsOf = useCallback((ph) => {
    const vw = NATIONS.views[view];
    const spec = ph.focus ?? (ph.show?.length ? ph.show : 'frame');
    if (spec === 'frame') return [[vw.frame[0], vw.frame[1]], [vw.frame[2], vw.frame[3]]];
    let ids = Array.isArray(spec) ? spec : [];
    if (typeof spec === 'string' && spec.startsWith('family:')) ids = ENTRIES.filter((e) => e.view === view && e.family === spec.slice(7)).map((e) => e.id);
    if (typeof spec === 'string' && spec.startsWith('parent:')) ids = ENTRIES.filter((e) => e.view === view && e.parent === spec.slice(7)).map((e) => e.id);
    const pts = [];
    for (const id of ids) {
      if (id.startsWith('stop:')) { const s = G11_STOPS[+id.slice(5)]; pts.push([s.lon - 1, s.lat - 1], [s.lon + 1, s.lat + 1]); continue; }
      const t = TERR[view]?.[id];
      if (t) pts.push(...t.polys.flatMap((p) => p[0]));
      else if (BY_ID[id]?.lon != null) { const e = BY_ID[id]; pts.push([e.lon - 1, e.lat - 1], [e.lon + 1, e.lat + 1]); }
    }
    if (!pts.length) return [[vw.frame[0], vw.frame[1]], [vw.frame[2], vw.frame[3]]];
    const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
    return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
  }, [view]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !story || !phase?.ref) return;
    const pad = isNarrow() ? { top: 30, left: 24, right: 24, bottom: panelOpenRef.current ? Math.round(window.innerHeight * 0.48) : 90 } : { top: 60, left: 60, right: 60, bottom: 110 };
    map.fitBounds(boundsOf(phase), { padding: pad, maxZoom: { gen10: 5.6, gen11: 5.5, gen25: 6.4, gen36: 8.6 }[view] ?? 6, duration: 1800, essential: true });
  }, [story, phase, boundsOf, view]);

  // Genesis 11: the road is walked as its verse is read (Ur → Haran in 11:31, Haran → Shechem in 12:4–6)
  useEffect(() => {
    if (view !== 'gen11') return undefined;
    let raf = 0, last = '', alive = true;
    const legPane = {}; tl.phases.forEach((ph) => { if (ph.road) legPane[ph.road[0]] = ph; });
    const tick = () => {
      if (!alive) return; raf = requestAnimationFrame(tick);
      const map = mapRef.current, src = map && ready.current && map.getSource('ng-road');
      if (!src) return;
      const { story: on } = storyRef.current;
      const lines = [];
      for (let k = 0; k + 1 < G11_ROAD.length; k++) {
        const ph = legPane[k];
        let f = 1;
        if (on && ph) { const end = (tl.phases[ph.i + 1]?.from ?? tl.duration); f = Math.max(0, Math.min(1, (clock.t - ph.from) / ((end - ph.from) * 0.85))); }
        if (f <= 0) continue;
        const [a, b] = [G11_ROAD[k], G11_ROAD[k + 1]];
        lines.push([a, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]]);
      }
      const key = JSON.stringify(lines.map((l) => l[1].map((x) => x.toFixed(2))));
      if (key === last) return; last = key;
      src.setData({ type: 'FeatureCollection', features: lines.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })) });
    };
    tick();
    return () => { alive = false; cancelAnimationFrame(raf); const src = mapRef.current?.getSource('ng-road'); if (src) src.setData({ type: 'FeatureCollection', features: [] }); };
  }, [view, tl, clock]);

  const onScrub = (e) => { const t = (+e.target.value / 1000) * tl.duration; seek(t); setStory(true); setScrubbed(tl.phaseAt(t).key); };
  const showAll = () => { pause(); setStory(false); setScrubbed(null); fitFrame(view); };
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
      if (e.key === 'Enter' && hold) { e.preventDefault(); continueNow(); return; }
      if (e.key === ' ') { e.preventDefault(); if (hold) continueNow(); else playing ? pause() : play(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (mapRef.current || !mapEl.current) return;
    const map = new maplibregl.Map({ container: mapEl.current, style: landStyle(), center: [36, 30], zoom: 2.2, minZoom: 1, maxZoom: 11, attributionControl: { compact: true } });
    mapRef.current = map;
    mapEl.current.__map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { ready.current = true; drawRef.current(); fitFrame(viewRef.current, 0); });
    map.on('dragstart', () => { if (storyRef.current.story) pauseRef.current(); });   // taking the globe in hand pauses the story
    map.on('moveend', () => declutter());
    map.on('click', (ev) => {
      const f = map.getLayer('ng-terr-fill') && map.queryRenderedFeatures(ev.point, { layers: ['ng-terr-fill'] })[0];
      if (f) selectRef.current(BY_ID[f.properties.id], false);
    });
    map.on('mousemove', (ev) => { map.getCanvas().style.cursor = map.getLayer('ng-terr-fill') && map.queryRenderedFeatures(ev.point, { layers: ['ng-terr-fill'] }).length ? 'pointer' : ''; });
    return () => { map.remove(); mapRef.current = null; ready.current = false; };
  }, [declutter, fitFrame]);
  const drawRef = useRef(draw); drawRef.current = draw;
  const viewRef = useRef(view); viewRef.current = view;
  const selectRef = useRef(select); selectRef.current = select;
  const pauseRef = useRef(pause); pauseRef.current = pause;
  useEffect(() => { draw(); }, [draw]);

  // URL: ?view=…&n=…
  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set('view', view);
    if (selId) next.set('n', selId); else next.delete('n');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selId]);

  const pickView = (vid) => { setView(vid); setSelId(null); fitFrame(vid); };

  const Row = ({ node, depth }) => {
    const { e, kids } = node;
    const has = !!TERR[e.view]?.[e.id] || (e.view === 'gen11' && e.lon != null);
    return (
      <li>
        <button type="button" className={`ng-row${sel && sel.id === e.id ? ' on' : ''}${has ? '' : ' noplace'}`} style={{ '--c': e.color, paddingLeft: 8 + depth * 14 }} onClick={() => select(e, true)}>
          <i className="ng-sw" />
          <b>{e.tr}</b>
          <span className="ng-row-paleo" dir="rtl">{e.paleo}</span>
          <em>{e.en}</em>
          {e.cert && e.cert !== 'known' && <small className={`ng-cert ng-cert-${e.cert}`}>{e.cert === 'unknown' ? 'place not known' : e.cert}</small>}
        </button>
        {kids.length > 0 && <ul>{kids.map((k) => <Row key={k.e.id} node={k} depth={depth + 1} />)}</ul>}
      </li>
    );
  };

  const parent = sel && sel.parent ? BY_ID[sel.parent] : null;
  const children = sel ? ENTRIES.filter((e) => e.parent === sel.id) : [];
  return (
    <div className={`ng-page${panelOpen ? ' ng-panel-open' : ''}`}>
      <header className="ng-top">
        <Link to="/landing" className="ng-logo" title="Home">𐤀𐤁</Link>
        <Link to="/models" className="ng-back">← Maps</Link>
        <h1 className="ng-h1">The Nations of Genesis <span>{v.ref}</span></h1>
      </header>
      <nav className="ng-views" aria-label="Genealogies">
        {VIEW_IDS.map((vid) => (
          <button key={vid} type="button" className={`ng-view${vid === view ? ' on' : ''}`} onClick={() => pickView(vid)}>
            <b>{NATIONS.views[vid].title}</b><small>{NATIONS.views[vid].en}</small>
          </button>
        ))}
      </nav>
      <div className="ng-body">
        <div className="ng-left">
          <div className="ng-map-wrap">
            <div ref={mapEl} className="ng-map" />
            <CanvasTitle phase={phase} on={subs.on} playing={playing} scrubbed={scrubbed} />
            <CanvasSubtitles phase={phase} clock={clock} timeline={tl} on={subs.on} playing={playing} scrubbed={scrubbed} report={(r) => { player.subs.current = r; }} />
            <button type="button" className="ng-panel-btn" onClick={() => setPanelOpen((o) => !o)}>{panelOpen ? (isNarrow() ? 'Map ×' : 'Hide names') : '☰ Names'}</button>
          </div>
          <div className="ng-playerbox">
            <div className="st-player">
              <button type="button" className="st-play" onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
              <button type="button" className="st-restart" onClick={() => { setStory(true); restart(); }} aria-label="Play from the beginning" title="From the beginning">↺</button>
              <div className="st-scrubwrap">
                <input ref={scrubRef} id="st-scrub" type="range" min="0" max="1000" defaultValue="0" step="1" onInput={onScrub} className="st-scrub" aria-label={`Scrub through ${v.title}`} />
                <div className="st-marks" aria-hidden="true">
                  {tl.phases.map((ph, i) => (i % Math.ceil(tl.phases.length / (isNarrow() ? 4 : 9)) === 0
                    ? <span key={ph.key} className={i === 0 ? 'st-mark-l' : ''} style={{ left: `${(ph.from / tl.duration) * 100}%` }} title={ph.ref}>{ph.ref.replace(/^Genesis /, '')}</span> : null))}
                </div>
              </div>
              <span ref={timeRef} className="st-time">0.0 s</span>
              <div className="st-opts">
                <label className="st-speed">
                  <span>speed</span>
                  <select id="st-speed" value={speed} onChange={(e) => setSpeed(+e.target.value)}>
                    {SPEEDS.map((x) => <option key={x} value={x}>{x === 0.25 ? '¼×' : x === 0.5 ? '½×' : `${x}×`}</option>)}
                  </select>
                </label>
                <PaceSelect player={player} />
                <label className="st-loop"><input id="st-loop" type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> repeat</label>
                <SubtitlesToggle subs={subs} />
                {story && <button type="button" className="ng-showall" onClick={showAll} title="Stop the story and show every land">Show all lands</button>}
              </div>
            </div>
            {story && <Caption player={player} phase={phase} render={(t) => <Glossed text={t} />} />}
          </div>
        </div>
        {panelOpen && (
          <aside className="ng-panel">
            {sel ? (
              <div className="ng-card">
                <button type="button" className="ng-card-x" onClick={() => setSelId(null)} aria-label="Close">×</button>
                <div className="ng-card-paleo" dir="rtl">{sel.paleo}</div>
                <div className="ng-card-name"><i className="ng-sw" style={{ '--c': sel.color }} /> {sel.tr} <em>{sel.en}</em></div>
                <div className="ng-card-sub">{sel.sn}{parent ? <> · son of <button type="button" className="ng-link" onClick={() => select(parent, true)}>{parent.tr}</button></> : null}</div>
                {sel.place && <p className="ng-card-place">{sel.place}</p>}
                <div className={`ng-card-cert ng-cert-${sel.cert || 'none'}`}>{sel.cert ? CERT[sel.cert] : 'no land of its own on this map'}</div>
                <PassageRefs refs={sel.ref} autoOpen />
                {children.length > 0 && (
                  <>
                    <div className="ng-card-h">Sons</div>
                    <div className="ng-chips">{children.map((c) => <button key={c.id} type="button" className="ng-chip" style={{ '--c': c.color }} onClick={() => select(c, true)}>{c.tr} <span dir="rtl">{c.paleo}</span></button>)}</div>
                  </>
                )}
              </div>
            ) : (
              <div className="ng-intro">
                <div className="ng-intro-h">{v.title} — {v.en}</div>
                <p>Every name is the Strong's Paleo spelling. A coloured land is where that name is placed by the usual identification — <b>known</b>, <b>probable</b> or <b>uncertain</b>; the land nearest each place is drawn as its share. Names whose place is not known are listed without land.</p>
                <PassageRefs refs={v.ref} size="sm" />
              </div>
            )}
            <ul className="ng-tree">{tree.map((n) => <Row key={n.e.id} node={n} depth={0} />)}</ul>
          </aside>
        )}
      </div>
    </div>
  );
}
