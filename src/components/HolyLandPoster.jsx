/**
 * HolyLandPoster.jsx — the Holy Land as a printable map: one static SVG, drawn from the
 * SAME data the interactive map uses (holyLand.js + the Natural Earth extract), so the
 * poster and the model never disagree. No tiles, no network, no relief — a map sheet.
 *
 * Three sheets (PRINTS): Ezekiel's allotment, Joshua's allotment, the Holy Portion close up.
 * Each is a <HolyLandPoster print="…"/> and can be saved as SVG or PNG (see posterToPng).
 *
 * Every name is the app's own transliteration first, the paleo beneath, the familiar
 * English name smallest — fieldy's rule for every label in the app.
 */
import { useMemo } from 'react';
import {
  JOSHUA_TRIBES, BIBLICAL_CITIES, TRIBE_COLORS, TRIBE_TRANSLIT, TRIBE_PALEO, tribeDisplayName,
  HOLY_KIND_STYLE, ezekielAllotment, labelAnchor, pointInRing, ringCentroid,
  WATERS, BIBLE_RIVERS, EZ_LANDMARKS, HOLY_WORDS,
} from '../lib/models/holyLand.js';
import levantBase from '../lib/models/levant-base.json';

const SEA = '#8db3d3', LAND = '#e6dcc4', RIVER = '#5f8db3', INK = '#1a1208', GOLD = '#b8860b';
const SERIF = "'Cochineal', Georgia, 'Times New Roman', serif";
const PALEO = "'BLD Paleo', 'Segoe UI Historic', 'Noto Sans Phoenician', sans-serif";

const HOLY_KINDS = ['prince', 'levites', 'priests', 'food', 'city', 'sanctuary'];
// cities on the Joshua sheet, in the order they win space (a label that would sit on an earlier one is dropped)
const JOSHUA_CITIES = ['jerusalem', 'hebron', 'beersheba', 'jericho', 'bethel', 'shiloh', 'shechem', 'samaria', 'megiddo', 'beth-shean', 'hazor', 'dan', 'tyre', 'sidon', 'acco', 'joppa', 'gaza', 'ashkelon', 'ashdod', 'ekron', 'gath', 'lachish', 'jabneel-judah', 'kadesh-barnea', 'ramoth-gilead', 'heshbon', 'dibon', 'rabbah', 'mahanaim', 'jabesh-gilead', 'kedesh', 'dor', 'engedi', 'bethlehem', 'gibeon', 'aphek', 'jezreel', 'tabor', 'carmel', 'hermon', 'nebo', 'aroer', 'golan', 'edrei', 'ashtaroth', 'succoth', 'jazer', 'ziklag', 'arad', 'tamar'];
const EZEKIEL_CITIES = ['jerusalem', ...EZ_LANDMARKS, 'hebron', 'beersheba', 'jericho', 'shechem', 'samaria', 'megiddo', 'hazor', 'dan', 'tyre', 'sidon', 'joppa', 'gaza', 'ashdod', 'ekron', 'lachish', 'ramoth-gilead', 'heshbon', 'rabbah', 'edrei'];

export const PRINTS = [
  { id: 'ezekiel', title: 'The allotment of Ezekiel 47–48', sub: 'the land divided among the twelve tribes of Yashar-Al (Israel) in the kingdom to come — the Holy Portion in the midst', ref: 'Ezekiel 47:13 – 48:29',
    frame: [[33.35, 30.55], [37.55, 34.62]] },
  { id: 'joshua', title: 'The allotment of Joshua 13–19', sub: 'the inheritance of the twelve tribes of Yashar-Al (Israel), on both sides of the Yaradan', ref: 'Joshua 13:8 – 19:51',
    frame: [[33.55, 30.42], [36.55, 33.62]] },
  { id: 'holy', title: 'The Holy Portion', sub: 'the offering of 25,000 × 25,000 cubits — the Levites, the priests of Tzadawaq, the city, and the prince on both sides', ref: 'Ezekiel 48:8–22; 45:1–8',
    frame: null },   // computed from the layout (see frameFor)
];

const close = (r) => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r);

/** The sheet's geometry: an equirectangular projection true at the frame's middle latitude. */
function frameFor(print, ez) {
  if (print.frame) return print.frame;
  // the square in the middle, a square's width of the prince's land either side
  const [w, top, e, bot] = ez.meta.square;
  const dx = e - w, dy = top - bot;
  return [[w - dx * 0.95, bot - dy * 0.42], [e + dx * 0.95, top + dy * 0.42]];
}

function makeProj(frame, mapW, mapH, ox, oy) {
  const [[lon0, lat0], [lon1, lat1]] = frame;
  const kLon = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
  const scale = Math.min(mapW / ((lon1 - lon0) * kLon), mapH / (lat1 - lat0));
  const w = (lon1 - lon0) * kLon * scale, h = (lat1 - lat0) * scale;
  const x0 = ox + (mapW - w) / 2, y0 = oy + (mapH - h) / 2;
  const p = ([lon, lat]) => [x0 + (lon - lon0) * kLon * scale, y0 + (lat1 - lat) * scale];
  return { p, scale, kLon, box: { x: x0, y: y0, w, h }, kmPerPx: 111.32 / scale };
}

const path = (ring, p) => close(ring).map((pt, i) => `${i ? 'L' : 'M'}${p(pt).map((v) => v.toFixed(1)).join(',')}`).join('') + 'Z';
const line = (pts, p) => pts.map((pt, i) => `${i ? 'L' : 'M'}${p(pt).map((v) => v.toFixed(1)).join(',')}`).join('');
const inBox = ([x, y], b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** Text sized to a run of `px` pixels: uppercase letters ≈ 0.72 em at 0.12 em tracking. */
const fitSize = (len, px, cap, min = 7) => Math.max(min, Math.min(cap, (px * 0.9) / (Math.max(len, 1) * 0.84)));

export default function HolyLandPoster({ print, width = 1400, id = 'hl-poster' }) {
  const ez = useMemo(() => ezekielAllotment(), []);
  const spec = typeof print === 'string' ? PRINTS.find((x) => x.id === print) || PRINTS[0] : print;
  const model = useMemo(() => buildSheet(spec, ez, width), [spec, ez, width]);
  const { W, H, proj, layers, title } = model;
  const { box } = proj;
  const clipId = `${id}-land`;
  return (
    <svg id={id} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', background: '#f4eddc' }} role="img" aria-label={`${spec.title} — a printable map`}>
      <defs>
        <clipPath id={clipId}>{layers.land.map((d, i) => <path key={i} d={d} />)}</clipPath>
        <clipPath id={`${id}-map`}><rect x={box.x} y={box.y} width={box.w} height={box.h} /></clipPath>
        <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
        <filter id={`${id}-halo`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.4" /></filter>
        <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f2c14e" fillOpacity="0.55" /><line x1="0" y1="0" x2="0" y2="6" stroke="#8a5a00" strokeWidth="1.2" strokeOpacity="0.55" /></pattern>
      </defs>
      {/* sheet */}
      <rect x="0" y="0" width={W} height={H} fill="#f4eddc" />
      <rect x="18" y="18" width={W - 36} height={H - 36} fill="none" stroke={INK} strokeWidth="2.5" />
      <rect x="26" y="26" width={W - 52} height={H - 52} fill="none" stroke={GOLD} strokeWidth="1" />
      {/* title */}
      <text x={W / 2} y={title.y1} textAnchor="middle" fontFamily={PALEO} fontSize={title.paleoSize} fill={GOLD}>{HOLY_WORDS.aratzQadash.paleo}</text>
      <text x={W / 2} y={title.y2} textAnchor="middle" fontFamily={SERIF} fontSize={title.size} fontWeight="700" letterSpacing="0.16em" fill={INK}>{HOLY_WORDS.aratzQadash.tr.toUpperCase()} · THE HOLY LAND</text>
      <text x={W / 2} y={title.y3} textAnchor="middle" fontFamily={SERIF} fontSize={title.size * 0.62} fontStyle="italic" fill="#4a3a20">{spec.title} — {spec.ref}</text>
      <text x={W / 2} y={title.y4} textAnchor="middle" fontFamily={SERIF} fontSize={title.size * 0.42} fill="#6a5a40">{spec.sub}</text>
      {/* map */}
      <g clipPath={`url(#${id}-map)`}>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={SEA} />
        {layers.land.map((d, i) => <path key={i} d={d} fill={LAND} />)}
        <g clipPath={`url(#${clipId})`}>
          {layers.fills.map((f) => <path key={f.id} d={f.d} fill={f.color} fillOpacity={f.opacity} />)}
          {layers.hatch.map((f) => <path key={f.id} d={f.d} fill={`url(#${id}-hatch)`} />)}
          {layers.outlines.map((f) => <path key={f.id} d={f.d} fill="none" stroke={INK} strokeWidth={f.w} strokeDasharray={f.dash} strokeOpacity="0.85" />)}
          {layers.holy.map((f) => <path key={f.id} d={f.d} fill={f.color} fillOpacity={f.opacity} stroke={INK} strokeWidth={f.w} />)}
        </g>
        {layers.lakes.map((d, i) => <path key={i} d={d} fill={SEA} stroke="#3f6a92" strokeWidth="0.9" />)}
        {layers.coast.map((d, i) => <path key={i} d={d} fill="none" stroke="#3f6a92" strokeWidth="1.1" />)}
        {layers.rivers.map((d, i) => <path key={i} d={d} fill="none" stroke={RIVER} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />)}
        {layers.square && <>
          <path d={layers.square} fill="none" stroke="#e03030" strokeWidth="12" strokeOpacity="0.55" filter={`url(#${id}-glow)`} />
          <path d={layers.square} fill="none" stroke="#c02020" strokeWidth="1.8" />
        </>}
        {/* band names */}
        {layers.bandLabels.map((l) => (
          <g key={l.id} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)})`}>
            <text textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize={l.size} letterSpacing="0.14em" fill={INK} stroke="#fff" strokeWidth={l.size * 0.22} strokeOpacity="0.75" paintOrder="stroke" style={{ textTransform: 'uppercase' }}>{l.name.toUpperCase()}</text>
            {l.paleo && <text y={l.size * 1.05} textAnchor="middle" fontFamily={PALEO} fontSize={l.size * 0.95} fill="#4a2f00" stroke="#fff" strokeWidth={l.size * 0.18} strokeOpacity="0.7" paintOrder="stroke">{l.paleo}</text>}
            {l.en && <text y={l.size * (l.paleo ? 1.85 : 0.95)} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={l.size * 0.62} fill="#3a2a10" stroke="#fff" strokeWidth={l.size * 0.14} strokeOpacity="0.7" paintOrder="stroke">{l.en}</text>}
          </g>
        ))}
        {/* holy plots' names */}
        {layers.plotLabels.map((l) => (
          <g key={l.id} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)})`}>
            {l.ico && <text y={-l.size * 1.1} textAnchor="middle" fontSize={l.size * 1.2}>{l.ico}</text>}
            <text textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize={l.size} fill={l.color || INK} stroke={l.stroke || '#fff'} strokeWidth={l.size * 0.2} strokeOpacity="0.8" paintOrder="stroke">{l.name}</text>
            {l.paleo && <text y={l.size * 1.05} textAnchor="middle" fontFamily={PALEO} fontSize={l.size * 0.9} fill={l.color || '#4a2f00'} stroke={l.stroke || '#fff'} strokeWidth={l.size * 0.16} strokeOpacity="0.75" paintOrder="stroke">{l.paleo}</text>}
            {l.en && <text y={l.size * (l.paleo ? 1.8 : 0.95)} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={l.size * 0.6} fill={l.color || '#3a2a10'} stroke={l.stroke || '#fff'} strokeWidth={l.size * 0.14} strokeOpacity="0.75" paintOrder="stroke">{l.en}</text>}
          </g>
        ))}
        {layers.sideLabels.map((l) => (
          <g key={l.id}>
            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={INK} strokeWidth="1.2" />
            <circle cx={l.x1} cy={l.y1} r="2.5" fill={INK} />
            <text x={l.x2 + (l.ta === 'start' ? 6 : -6)} y={l.y2 + 5} textAnchor={l.ta} fontFamily={SERIF} fontWeight="700" fontSize={l.size} fill={INK} stroke="#fff" strokeWidth={l.size * 0.2} strokeOpacity="0.8" paintOrder="stroke">{l.name} <tspan fontFamily={PALEO} fontWeight="400" fill="#4a2f00">{l.paleo}</tspan></text>
            <text x={l.x2 + (l.ta === 'start' ? 6 : -6)} y={l.y2 + 5 + l.size * 0.85} textAnchor={l.ta} fontFamily={SERIF} fontStyle="italic" fontSize={l.size * 0.7} fill="#3a2a10" stroke="#fff" strokeWidth={l.size * 0.14} strokeOpacity="0.8" paintOrder="stroke">{l.en}</text>
          </g>
        ))}
        {layers.captions.map((c) => (
          <text key={c.id} x={c.x} y={c.y} textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="15" letterSpacing="0.12em" fill={INK} stroke="#fff" strokeWidth="3" strokeOpacity="0.8" paintOrder="stroke">{c.text} <tspan fontFamily={PALEO} fontWeight="400" letterSpacing="0" fill="#4a2f00">{c.paleo}</tspan></text>
        ))}
        {/* waters */}
        {layers.waterLabels.map((l) => (
          <g key={l.id} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)})`}>
            <text textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontWeight="700" fontSize={l.size} letterSpacing="0.1em" fill="#1f3f5f" stroke="#cfe0ef" strokeWidth={l.size * 0.22} strokeOpacity="0.8" paintOrder="stroke">{l.name}</text>
            <text y={l.size * 1.0} textAnchor="middle" fontFamily={PALEO} fontSize={l.size * 0.9} fill="#1f3f5f" stroke="#cfe0ef" strokeWidth={l.size * 0.16} strokeOpacity="0.8" paintOrder="stroke">{l.paleo}</text>
            <text y={l.size * 1.75} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={l.size * 0.62} fill="#1f3f5f" stroke="#cfe0ef" strokeWidth={l.size * 0.14} strokeOpacity="0.8" paintOrder="stroke">{l.en}</text>
          </g>
        ))}
        {/* cities */}
        {layers.cities.map((c) => (
          <g key={c.id} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
            {c.lead && <line x1="0" y1="0" x2="0" y2={c.lead} stroke={INK} strokeWidth="1.2" strokeDasharray="3 2" />}
            {c.anchor
              ? <rect x="-4.5" y="-4.5" width="9" height="9" fill="#fff8e6" stroke={GOLD} strokeWidth="2" />
              : <circle r={c.key ? 4.6 : 3.2} fill={c.key ? '#e05555' : INK} stroke="#fff" strokeWidth="1.2" />}
            <text x={c.dx} y={c.dy} textAnchor={c.ta} fontFamily={SERIF} fontWeight="700" fontSize={c.size} fill={c.anchor ? '#7a5200' : INK} stroke="#fff" strokeWidth={c.size * 0.22} strokeOpacity="0.8" paintOrder="stroke">{c.translit}</text>
            <text x={c.dx} y={c.dy + c.size * 0.95} textAnchor={c.ta} fontFamily={PALEO} fontSize={c.size * 0.85} fill="#4a2f00" stroke="#fff" strokeWidth={c.size * 0.16} strokeOpacity="0.75" paintOrder="stroke">{c.paleo}</text>
            <text x={c.dx} y={c.dy + c.size * 1.65} textAnchor={c.ta} fontFamily={SERIF} fontStyle="italic" fontSize={c.size * 0.6} fill="#5a4a30" stroke="#fff" strokeWidth={c.size * 0.14} strokeOpacity="0.75" paintOrder="stroke">{c.name}</text>
          </g>
        ))}
        {/* callout for the holy portion on the wide sheet */}
        {layers.callout && (
          <g>
            <line x1={layers.callout.x1} y1={layers.callout.y1} x2={layers.callout.x2} y2={layers.callout.y2} stroke="#c02020" strokeWidth="1.4" strokeDasharray="4 3" />
            <rect x={layers.callout.bx} y={layers.callout.by} width={layers.callout.bw} height={layers.callout.bh} rx="6" fill="#fffaf0" fillOpacity="0.94" stroke="#c02020" strokeWidth="1.2" />
            {layers.callout.lines.map((t, i) => (
              <text key={i} x={layers.callout.bx + 14} y={layers.callout.by + 26 + i * 21} fontFamily={t.paleo ? PALEO : SERIF} fontSize={t.size} fontWeight={t.bold ? 700 : 400} fontStyle={t.italic ? 'italic' : 'normal'} fill={t.color || INK}>{t.text}</text>
            ))}
          </g>
        )}
        {/* frame, compass, scale */}
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke={INK} strokeWidth="2" />
        <g transform={`translate(${box.x + box.w - 60} ${box.y + 70})`}>
          <circle r="30" fill="#fffaf0" fillOpacity="0.85" stroke={INK} strokeWidth="1.2" />
          <path d="M0,-26 L7,0 L0,-6 L-7,0 Z" fill={INK} />
          <path d="M0,26 L7,0 L0,6 L-7,0 Z" fill="none" stroke={INK} strokeWidth="1" />
          <text y="-32" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="15" fill={INK}>N</text>
          <text y="46" textAnchor="middle" fontFamily={PALEO} fontSize="13" fill={GOLD}>𐤑𐤐𐤅𐤍</text>
        </g>
        <g transform={`translate(${box.x + box.w - 40 - layers.scale.px} ${box.y + box.h - 40})`}>
          <rect x="-10" y="-30" width={layers.scale.px + 20} height="48" rx="4" fill="#fffaf0" fillOpacity="0.85" stroke={INK} strokeWidth="0.8" />
          <rect x="0" y="0" width={layers.scale.px / 2} height="6" fill={INK} />
          <rect x={layers.scale.px / 2} y="0" width={layers.scale.px / 2} height="6" fill="#fff" stroke={INK} strokeWidth="0.8" />
          <text x={layers.scale.px / 2} y="-12" textAnchor="middle" fontFamily={SERIF} fontSize="13" fill={INK}>{layers.scale.km} km · {layers.scale.mi} mi</text>
          <text x="0" y="-12" textAnchor="start" fontFamily={SERIF} fontSize="11" fill={INK}>0</text>
        </g>
      </g>
      {/* legend */}
      <Legend model={model} spec={spec} ez={ez} />
      <text x={W / 2} y={H - 34} textAnchor="middle" fontFamily={SERIF} fontSize="13" fontStyle="italic" fill="#6a5a40">Borders are idealized study-map shapes drawn from the landmark lists of the text, not surveyed lines; city dots follow the conventional identifications. · bldbible.com — Maps &amp; Models</text>
    </svg>
  );
}

function Legend({ model, spec, ez }) {
  const { W, legend } = model;
  const tribes = spec.id === 'holy' ? [] : Object.keys(TRIBE_COLORS).filter((t) => t !== 'Levi' || spec.id === 'joshua');
  const cols = W > 1100 ? 5 : 4;
  const colW = (W - 80) / cols;
  const rowH = 40;
  const rows = Math.ceil(tribes.length / cols);
  const holyY = legend.y + (tribes.length ? 34 + rows * rowH + 16 : 22);
  return (
    <g>
      <line x1="40" y1={legend.y} x2={W - 40} y2={legend.y} stroke={GOLD} strokeWidth="1" />
      {tribes.length > 0 && <text x="40" y={legend.y + 22} fontFamily={SERIF} fontWeight="700" fontSize="15" letterSpacing="0.14em" fill={INK}>THE TRIBES</text>}
      {tribes.map((t, i) => {
        const x = 40 + (i % cols) * colW, y = legend.y + 40 + Math.floor(i / cols) * rowH;
        return (
          <g key={t} transform={`translate(${x} ${y})`}>
            <rect x="0" y="0" width="26" height="18" fill={TRIBE_COLORS[t]} fillOpacity="0.85" stroke={INK} strokeWidth="0.8" />
            <text x="34" y="14" fontFamily={SERIF} fontWeight="700" fontSize="15" fill={INK}>{TRIBE_TRANSLIT[t]}</text>
            <text x="34" y="30" fontFamily={SERIF} fontStyle="italic" fontSize="11" fill="#5a4a30">{t}</text>
            <text x={colW - 16} y="15" textAnchor="end" fontFamily={PALEO} fontSize="14" fill={GOLD}>{TRIBE_PALEO[t]}</text>
          </g>
        );
      })}
      {spec.id !== 'joshua' && (
        <g transform={`translate(40 ${holyY})`}>
          <text y="0" fontFamily={SERIF} fontWeight="700" fontSize="15" letterSpacing="0.14em" fill={INK}>THE HOLY PORTION — {HOLY_WORDS.terumah.tr.toUpperCase()} <tspan fontFamily={PALEO} fill={GOLD} letterSpacing="0">{HOLY_WORDS.terumah.paleo}</tspan> <tspan fontWeight="400" letterSpacing="0" fontStyle="italic">25,000 × 25,000 cubits ≈ {ez.meta.holyKm.toFixed(1)} km / {(ez.meta.holyKm * 0.621371).toFixed(1)} mi a side · Ezekiel 48:8–22</tspan></text>
          {HOLY_KINDS.map((k, i) => {
            const st = HOLY_KIND_STYLE[k], h = ez.holy.find((x) => x.kind === k);
            const x = (i % 3) * ((W - 80) / 3), y = 22 + Math.floor(i / 3) * 32;
            return (
              <g key={k} transform={`translate(${x} ${y})`}>
                {k === 'prince' ? <text x="0" y="15" fontSize="13">🦁🤴🏾</text> : <><rect x="2" y="1" width="22" height="18" fill={st.color} fillOpacity="0.9" stroke={INK} strokeWidth="0.8" /><text x="13" y="15" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="12" fill={k === 'city' || k === 'sanctuary' ? '#fff' : INK}>{st.label}</text></>}
                <text x={k === 'prince' ? 48 : 34} y="15" fontFamily={SERIF} fontSize="13" fill={INK}>{k === 'prince' ? `${HOLY_WORDS.nasi.tr} ${HOLY_WORDS.chalaqim.tr} — the prince's portion, on both sides` : h?.name} <tspan fontStyle="italic" fill="#6a5a40">— {h?.ref}</tspan></text>
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}

/** Everything the SVG draws, in sheet pixels. */
function buildSheet(spec, ez, W) {
  const frame = frameFor(spec, ez);
  const titleH = 150, legendH = spec.id === 'joshua' ? 200 : spec.id === 'holy' ? 150 : 310, margin = 40;
  const [[lon0, lat0], [lon1, lat1]] = frame;
  const kLon = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
  const mapW = W - 2 * margin;
  const mapH = Math.round(mapW * (lat1 - lat0) / ((lon1 - lon0) * kLon));
  const H = titleH + mapH + legendH + 2 * margin;
  const proj = makeProj(frame, mapW, mapH, margin, titleH + margin);
  const { p, box, scale } = proj;
  const px = (deg) => deg * scale;   // degrees of latitude → px

  const land = levantBase.land.map((poly) => path(poly[0], p));
  const lakes = levantBase.lakes.map((l) => path(l.ring, p));
  const rivers = [...levantBase.rivers.map((r) => line(r.pts, p)), ...BIBLE_RIVERS.map((r) => line(r.pts, p))];

  const fills = [], outlines = [], holy = [], hatch = [], bandLabels = [], plotLabels = [], sideLabels = [], cities = [], waterLabels = [], captions = [];
  let square = null, callout = null;
  const placed = [];   // label boxes already on the sheet (cities keep off each other)
  const free = (b) => !placed.some((o) => b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);

  const ringArea = (r) => Math.abs(r.reduce((a, pt, i) => { const q = r[(i + 1) % r.length]; return a + pt[0] * q[1] - q[0] * pt[1]; }, 0)) / 2;
  const bandLabel = (entry, avoid = [], cap = 30) => {
    const a = labelAnchor(entry.ring, 2.5, avoid);
    const [x, y] = p([a.lon, a.lat]);
    const runPx = Math.abs(p([a.east, a.lat])[0] - p([a.west, a.lat])[0]);
    const hPx = px(a.ringLatSpan);
    const name = tribeDisplayName(entry.name, entry.tribe);
    const size = Math.min(cap, fitSize(name.length, runPx, cap), hPx * 0.3);
    const three = hPx > size * 4.2;
    bandLabels.push({ id: entry.id, x, y: y - (three ? size * 0.5 : -size * 0.35), size, name, paleo: three ? TRIBE_PALEO[entry.tribe] : '', en: three ? entry.name : '' });
    const tw = name.length * size * 0.84;
    placed.push({ x1: x - tw / 2, y1: y - size, x2: x + tw / 2, y2: y + size * (three ? 2.2 : 0.6) });
  };

  if (spec.id === 'joshua') {
    const innerLots = (entry) => JOSHUA_TRIBES.filter((t) => t !== entry && ringArea(t.ring) < ringArea(entry.ring) && pointInRing(ringCentroid(t.ring), entry.ring)).map((t) => t.ring);
    for (const t of JOSHUA_TRIBES) {
      fills.push({ id: t.id, d: path(t.ring, p), color: TRIBE_COLORS[t.tribe], opacity: 0.72 });
      outlines.push({ id: t.id, d: path(t.ring, p), w: 1.8, dash: '6 3' });
    }
    for (const t of JOSHUA_TRIBES) bandLabel(t, innerLots(t), 26);
  } else {
    for (const b of ez.bands) {
      fills.push({ id: b.id, d: path(b.ring, p), color: TRIBE_COLORS[b.tribe], opacity: 0.68 });
      outlines.push({ id: b.id, d: path(b.ring, p), w: 1.4 });
    }
    for (const h of ez.holy) {
      const st = HOLY_KIND_STYLE[h.kind];
      if (h.kind === 'prince') { fills.push({ id: h.id, d: path(h.ring, p), color: st.color, opacity: 0.5 }); hatch.push({ id: `${h.id}-h`, d: path(h.ring, p) }); outlines.push({ id: h.id, d: path(h.ring, p), w: 1.4 }); }
      else holy.push({ id: h.id, d: path(h.ring, p), color: st.color, opacity: Math.min(1, st.opacity + 0.1), w: spec.id === 'holy' ? 1.6 : 0.8 });
    }
    const [sqW, sqTop, sqE, sqBot] = ez.meta.square;
    square = path([[sqW, sqTop], [sqE, sqTop], [sqE, sqBot], [sqW, sqBot]], p);
    if (spec.id === 'ezekiel') for (const b of ez.bands) bandLabel(b, [], 30);
    // the plots' names as area text (the wide sheet: only the prince, the square gets a callout)
    for (const h of ez.holy) {
      const st = HOLY_KIND_STYLE[h.kind];
      if (!st.label) continue;
      const a = labelAnchor(h.ring, h.kind === 'prince' ? 2.6 : 1.6);
      // the run the name may span — on the close-up the prince's strips run off the sheet, so only their visible part counts
      let [wx, ex] = [p([a.west, a.lat])[0], p([a.east, a.lat])[0]];
      if (spec.id === 'holy') { wx = Math.max(wx, box.x + 10); ex = Math.min(ex, box.x + box.w - 10); }
      const x = (wx + ex) / 2, runPx = Math.max(0, ex - wx);
      let y = p([a.lon, a.lat])[1];
      const hPx = px(a.ringLatSpan);
      if (h.kind === 'priests') y += hPx * 0.16;      // the sanctuary sits in the middle of the priests' plot: the name goes beneath it
      const capMax = h.kind === 'prince' ? 30 : 26;
      const size = Math.min(capMax, fitSize(h.short.length, runPx, capMax), hPx * 0.28);
      const enFits = h.en.length * size * 0.6 * 0.5 <= runPx;
      if (spec.id === 'ezekiel' && h.kind !== 'prince') continue;
      const dark = h.kind === 'city' || h.kind === 'sanctuary';
      const paleo = h.kind === 'prince' ? '' : (HOLY_WORDS[{ levites: 'leviim', priests: 'kohanim', city: 'ir', sanctuary: 'miqdash' }[h.kind]]?.paleo || '');
      if (size >= 10) {
        plotLabels.push({ id: h.id, x, y: y + size * 0.2, size, name: h.short, paleo, en: enFits ? h.en : '', ico: h.kind === 'prince' ? '🦁🤴🏾' : '', color: dark ? '#fff' : INK, stroke: dark ? '#0008' : '#fff' });
        placed.push({ x1: x - runPx / 2, y1: y - size * 2, x2: x + runPx / 2, y2: y + size * 2 });
      } else if (spec.id === 'holy') {
        // too small for its name (the sanctuary, the food strips): the name stands beside it with a leader
        const lons = h.ring.map((q) => q[0]), lats = h.ring.map((q) => q[1]);
        const east = h.kind === 'food' && h.id.endsWith('-w');
        const [ex, ey] = p([east ? Math.min(...lons) : Math.max(...lons), (Math.min(...lats) + Math.max(...lats)) / 2]);
        const dir = east ? -1 : 1;
        sideLabels.push({ id: h.id, x1: ex, y1: ey, x2: ex + dir * 26, y2: ey + (h.kind === 'sanctuary' ? -46 : 0), ta: dir > 0 ? 'start' : 'end', size: 16, name: h.short, paleo, en: h.en, color: st.color });
      }
    }
    if (spec.id === 'ezekiel') {
      // a callout in the sea, pointing at the square
      const [cx, cy] = p([sqW, (sqTop + sqBot) / 2]);
      // up in the open sea (the coast runs north-east, so there is room off Ashar), above the sea's own name
      const bw = 440, bh = 118;
      const bx = box.x + 16, by = Math.max(box.y + 16, cy - 400);
      callout = { x1: bx + bw, y1: by + bh - 12, x2: cx, y2: cy, bx, by, bw, bh, lines: [
        { text: `✦ ${HOLY_WORDS.terumah.tr} — the Holy Portion`, size: 16, bold: true, color: '#8a1a1a' },
        { text: HOLY_WORDS.terumah.paleo, size: 16, paleo: true, color: GOLD },
        { text: `25,000 × 25,000 cubits ≈ ${ez.meta.holyKm.toFixed(1)} km square · Ezekiel 48:8–22`, size: 13, italic: true },
        { text: `🦁🤴🏾 ${HOLY_WORDS.nasi.tr} ${HOLY_WORDS.chalaqim.tr} — the prince's portion, both sides · 48:21`, size: 13, italic: true },
      ] };
      placed.push({ x1: bx, y1: by, x2: bx + bw, y2: by + bh });
    }
  }

  // the compass (top right) and the scale bar (bottom right) keep labels off them
  placed.push({ x1: box.x + box.w - 100, y1: box.y + 20, x2: box.x + box.w - 20, y2: box.y + 125 });
  placed.push({ x1: box.x + box.w - 250, y1: box.y + box.h - 75, x2: box.x + box.w - 10, y2: box.y + box.h - 10 });
  if (spec.id === 'holy') {
    // the bands the offering lies between, named along the sheet's edges (48:7, 48:23)
    const jud = ez.bands.find((b) => b.tribe === 'Judah'), ben = ez.bands.find((b) => b.tribe === 'Benjamin');
    captions.push({ id: 'n', x: box.x + box.w / 2, y: box.y + 30, text: `${TRIBE_TRANSLIT.Judah.toUpperCase()} · ${jud?.name} — north of the offering · ${jud?.ref}`, paleo: TRIBE_PALEO.Judah });
    captions.push({ id: 's', x: box.x + box.w / 2, y: box.y + box.h - 16, text: `${TRIBE_TRANSLIT.Benjamin.toUpperCase()} · ${ben?.name} — south of the offering · ${ben?.ref}`, paleo: TRIBE_PALEO.Benjamin });
    placed.push({ x1: box.x, y1: box.y, x2: box.x + box.w, y2: box.y + 48 });
    placed.push({ x1: box.x, y1: box.y + box.h - 40, x2: box.x + box.w, y2: box.y + box.h });
  }

  // cities: a few on the wide sheets, the border landmarks on Ezekiel's, the towns round the city on the close-up
  const ids = spec.id === 'joshua' ? JOSHUA_CITIES : spec.id === 'ezekiel' ? EZEKIEL_CITIES : ['jerusalem', 'bethlehem', 'jericho', 'gibeon', 'bethel', 'kiriath-jearim', 'beth-shemesh', 'ramah', 'mizpah', 'ai', 'gilgal', 'tekoa'];
  const anchors = spec.id === 'ezekiel' ? new Set(EZ_LANDMARKS) : new Set();
  const cSize = spec.id === 'holy' ? 17 : 13;
  for (const id of ids) {
    const c = BIBLICAL_CITIES.find((x) => x.id === id);
    if (!c) continue;
    const [x, y] = p([c.lon, c.lat]);
    if (!inBox([x, y], { x: box.x + 10, y: box.y + 10, w: box.w - 20, h: box.h - 20 })) continue;
    const tw = Math.max(c.translit.length, c.name.length * 0.7) * cSize * 0.6;
    // label to the right; flips left near the sheet's edge or when the right side is taken
    const tryBox = (side) => side > 0 ? { x1: x + 6, y1: y - cSize, x2: x + 8 + tw, y2: y + cSize * 1.9 }
      : side < 0 ? { x1: x - 8 - tw, y1: y - cSize, x2: x - 6, y2: y + cSize * 1.9 }
      : { x1: x - tw / 2, y1: y + 6, x2: x + tw / 2, y2: y + 8 + cSize * 2.9 };   // beneath the dot
    let side = 1, b = tryBox(1);
    if (b.x2 > box.x + box.w - 8 || !free(b)) { side = -1; b = tryBox(-1); }
    if (!free(b)) { side = 0; b = tryBox(0); }
    if (spec.id === 'holy' && id === 'jerusalem') {
      // the dot stands in the city plot: its name beneath the square, on a leader
      const yb = p([0, ez.meta.square[3]])[1] + 34;
      cities.push({ id, x, y, dx: 0, dy: yb - y + 12, ta: 'middle', size: cSize, translit: c.translit, paleo: c.paleo, name: c.name, key: true, anchor: false, lead: yb - y });
      placed.push({ x1: x - 80, y1: yb - 4, x2: x + 80, y2: yb + cSize * 3 });
      continue;
    }
    if (!free(b) && id !== 'jerusalem' && !anchors.has(id)) continue;
    placed.push(b);
    cities.push({ id, x, y, dx: side * 8, dy: side ? cSize * 0.35 : cSize + 8, ta: side > 0 ? 'start' : side < 0 ? 'end' : 'middle', size: cSize, translit: c.translit, paleo: c.paleo, name: c.name, key: id === 'jerusalem', anchor: anchors.has(id) });
  }

  // waters — every name the Bible gives the seas and rivers, where the map puts them
  for (const w of WATERS) {
    if (w.twin && spec.id !== 'joshua') continue;
    const [x, y] = p([w.lon, w.lat]);
    if (!inBox([x, y], box)) continue;
    const size = spec.id === 'holy' ? 22 : w.base === 'sea' ? 26 : ['Dead Sea', 'Sea of Galilee'].includes(w.base) ? 17 : 13;
    const bw = Math.max(w.tr.length, w.en.length * 0.7) * size * 0.62;
    const b = { x1: x - bw / 2, y1: y - size, x2: x + bw / 2, y2: y + size * 2 };
    const inside = b.x1 >= box.x + 4 && b.x2 <= box.x + box.w - 4 && b.y1 >= box.y + 4 && b.y2 <= box.y + box.h - 4;
    const named = w.base === 'sea' || (!w.twin && ['Dead Sea', 'Sea of Galilee', 'Jordan'].includes(w.base));   // the seas and the Jordan are always named
    if (!inside && w.base !== 'sea') continue;
    if (!free(b) && !named) continue;
    waterLabels.push({ id: w.id, x, y, size, name: w.tr, paleo: w.paleo, en: w.en });
    placed.push(b);
  }

  // scale bar: a round number of km that is ≈ a fifth of the sheet
  const kmPerPx = proj.kmPerPx;
  const target = box.w * 0.18 * kmPerPx;
  const km = [1, 2, 5, 10, 20, 25, 50, 100].reduce((a, v) => (Math.abs(v - target) < Math.abs(a - target) ? v : a), 10);
  const scaleBar = { km, mi: +(km * 0.621371).toFixed(km < 5 ? 1 : 0), px: km / kmPerPx };

  return {
    W, H, proj,
    title: { y1: 62, y2: 100, y3: 128, y4: 150, size: 30, paleoSize: 30 },
    legend: { y: titleH + margin + mapH + 24 },
    layers: { land, lakes, coast: land, rivers, fills, hatch, outlines, holy, square, bandLabels, plotLabels, sideLabels, waterLabels, cities, callout, captions, scale: scaleBar },
  };
}

// ── Saving the sheet ─────────────────────────────────────────────────────────
let _fontCss = null;
async function fontCss() {
  if (_fontCss) return _fontCss;
  const load = async (url, family, weight = 400) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return '';
      const buf = await r.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`;
    } catch { return ''; }
  };
  _fontCss = (await Promise.all([
    load('/fonts/BLDPaleo-Regular.woff2', 'BLD Paleo'),
    load('/fonts/Cochineal-Roman.woff2', 'Cochineal'),
    load('/fonts/Cochineal-Bold.woff2', 'Cochineal', 700),
  ])).join('');
  return _fontCss;
}

/** The sheet as a self-contained SVG document (fonts embedded so it prints the same anywhere). */
export async function posterSvgText(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.removeAttribute('width');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = await fontCss();
  clone.insertBefore(style, clone.firstChild);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

/** Rasterize the sheet at `scale` × its sheet pixels (3 ≈ 300 dpi on a 14" wide print). */
export async function posterToPng(svgEl, scale = 3) {
  const text = await posterSvgText(svgEl);
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(text).map(Number);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4eddc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
