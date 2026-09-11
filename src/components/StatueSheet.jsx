/**
 * StatueSheet.jsx — the same statue, stone and strike as a flat, layered SVG:
 * the practical view. No library, prints, runs on anything, and is what the
 * page shows when WebGL is not available. Every piece is a real element
 * (click, focus, keyboard). Drawn from lib/models/statue.js exactly like the
 * 3D scene — x across, y up (flipped here), z ignored.
 *
 * Updates are imperative (attributes set straight on the nodes each frame),
 * not React re-renders — 150-odd shards at 60 fps is nothing for the DOM this
 * way and a lot for a reconciler.
 */
import { useEffect, useRef } from 'react';
import {
  PIECES, STONE, MATERIALS, H_TOTAL, HIT,
  stoneAt, mountainAt, cameraAt, makeShards, shardAt, pieceWholeAt, makeDust, dustAt,
} from '../lib/models/statue.js';

const NS = 'http://www.w3.org/2000/svg';
const S = 46;                 // px per world unit
const W = 560, H = 420;
const OX = W / 2 + 30, GY = H - 46;      // where x=0 and y=0 fall on the sheet (statue a little right of centre so the stone has room on the left)
const px = (x) => OX + x * S;            // +x to the right, the same side the 3D camera shows
const py = (y) => GY - y * S;

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
}

function gradient(defs, id, m, vertical) {
  const g = el('linearGradient', vertical ? { id, x1: 0, y1: 0, x2: 0, y2: 1 } : { id, x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  [[0, m.lo], [0.3, m.hi], [0.55, m.color], [1, m.lo]].forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, g));
}

function shapeFor(part, fill, parent) {
  if (part.kind === 'lathe') {
    const right = part.profile.map(([r, y]) => `${px(part.x + r * (part.sx || 1))},${py(y)}`);
    const left = [...part.profile].reverse().map(([r, y]) => `${px(part.x - r * (part.sx || 1))},${py(y)}`);
    return el('polygon', { points: [...right, ...left].join(' '), fill }, parent);
  }
  if (part.kind === 'capsule') return el('line', { x1: px(part.a[0]), y1: py(part.a[1]), x2: px(part.b[0]), y2: py(part.b[1]), stroke: fill, 'stroke-width': part.r * 2 * S, 'stroke-linecap': 'round' }, parent);
  if (part.kind === 'sphere') return el('circle', { cx: px(part.x), cy: py(part.y), r: part.r * S, fill }, parent);
  if (part.kind === 'cylinder') return el('rect', { x: px(part.x) - part.r * S, y: py(part.y + part.h), width: part.r * 2 * S, height: part.h * S, rx: part.r * S * 0.45, fill }, parent);
  return el('rect', { x: px(part.x) - part.w * S / 2, y: py(part.y + part.h), width: part.w * S, height: part.h * S, rx: 5, fill }, parent);
}

export default function StatueSheet({ clock, selected, onSelect }) {
  const wrap = useRef(null);
  const api = useRef(null);

  useEffect(() => {
    const host = wrap.current; if (!host) return undefined;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'st-svg', role: 'img', 'aria-label': 'The statue of the dream, drawn flat' }, host);
    // Frame to the stage: a wide stage sees the whole sheet; a tall one (a phone held
    // upright) crops in around the statue and grows the sky above it instead of
    // shrinking the statue into a letterbox — the ground stays at the bottom either way.
    // `zoom` is the ending's scripted view (cameraAt): a window around the stone that
    // closes in, then opens again as the mountain grows. null = the whole sheet.
    let zoom = null;
    const fitFrame = () => {
      const aspect = host.clientWidth && host.clientHeight ? host.clientWidth / host.clientHeight : W / H;
      let vw = aspect >= 1.25 ? W : Math.max(380, Math.min(W, Math.round(aspect * 520)));
      let vh = Math.round(vw / aspect);
      // A narrow window is centred between the statue and the stone so both show.
      const cx0 = vw < W ? Math.max(vw / 2, px(-1.7)) : OX;
      if (!zoom) { svg.setAttribute('viewBox', `${Math.round(cx0 - vw / 2)} ${H - vh} ${vw} ${vh}`); return; }
      const k = Math.min(1, zoom.distance / 15.5);            // fraction of the full window
      vw = Math.round(vw * k); vh = Math.round(vh * k);
      const cx = px(zoom.target[0]), cy = py(zoom.target[1]);
      svg.setAttribute('viewBox', `${Math.round(cx - vw / 2)} ${Math.round(Math.min(cy - vh / 2, H - vh))} ${vw} ${vh}`);
    };
    const ro = new ResizeObserver(fitFrame); ro.observe(host); fitFrame();
    const defs = el('defs', {}, svg);
    for (const [k, m] of Object.entries(MATERIALS)) gradient(defs, `stg-${k}`, m, false);
    const sky = el('linearGradient', { id: 'stg-sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#1b1b27' }, sky); el('stop', { offset: 1, 'stop-color': '#2a2733' }, sky);
    el('rect', { x: -W, y: -2 * H, width: 3 * W, height: 3 * H, fill: 'url(#stg-sky)' }, svg);
    el('ellipse', { cx: OX, cy: GY + 6, rx: 190, ry: 16, fill: '#000', opacity: 0.35 }, svg);
    el('rect', { x: -W, y: GY, width: 3 * W, height: H - GY + 40, fill: '#3a3329' }, svg);
    const world = el('g', {}, svg);

    // Mountain (drawn first so shards fall in front of it while it grows).
    const mountain = el('path', { fill: 'url(#stg-stone)', opacity: 0, class: 'st-svg-pick', tabindex: 0, 'data-id': 'stone' }, world);
    const mTitle = el('title', {}, mountain); mTitle.textContent = STONE.title;

    // Pieces, bottom-up so higher pieces overlap correctly.
    const groups = new Map(), shardSets = [];
    for (const piece of [...PIECES].reverse()) {
      const g = el('g', { class: 'st-svg-piece st-svg-pick', tabindex: 0, 'data-id': piece.id, role: 'button' }, world);
      const t = el('title', {}, g); t.textContent = piece.title;
      const fill = `url(#stg-${piece.material})`;
      for (const part of piece.parts) shapeFor(part, part.mixed ? 'url(#stg-clay)' : fill, g);
      for (const part of piece.iron || []) shapeFor(part, 'url(#stg-iron)', g);
      for (const part of piece.toes || []) shapeFor(part, `url(#stg-${part.material})`, g);
      el('rect', { x: 0, y: 0, width: 0, height: 0 }, g); // keeps the group's bbox stable
      groups.set(piece.id, g);
      const sg = el('g', { class: 'st-svg-shards' }, world);
      const shards = makeShards(piece, 22, 3).map((s) => {
        const r = s.size * S * 0.5;
        const pts = [[-r, -r * 0.6], [r * 0.9, -r * 0.9], [r, r * 0.5], [-r * 0.2, r], [-r * 0.9, r * 0.4]].map((p) => p.join(',')).join(' ');
        const node = el('polygon', { points: pts, fill: `url(#stg-${s.material})`, stroke: '#0006', 'stroke-width': 0.6, visibility: 'hidden' }, sg);
        return { s, node };
      });
      shardSets.push({ piece, shards });
    }

    // Chaff.
    const dust = makeDust(260, 9);
    const dg = el('g', { fill: '#d9c9a0' }, world);
    const dots = dust.map(() => el('circle', { r: 1.4, visibility: 'hidden' }, dg));

    // The stone.
    const stone = el('g', { class: 'st-svg-pick', tabindex: 0, 'data-id': 'stone', role: 'button' }, world);
    const sTitle = el('title', {}, stone); sTitle.textContent = STONE.title;
    const r = STONE.r * S;
    el('polygon', { points: [[-r, -r * 0.5], [-r * 0.4, -r], [r * 0.6, -r * 0.85], [r, -r * 0.1], [r * 0.7, r * 0.8], [-r * 0.3, r], [-r * 0.95, r * 0.45]].map((p) => p.join(',')).join(' '), fill: 'url(#stg-stone)', stroke: '#0008', 'stroke-width': 1 }, stone);

    function place(t) {
      for (const [id, g] of groups) g.style.display = pieceWholeAt(PIECES.find((p) => p.id === id), t) ? '' : 'none';
      for (const { piece, shards } of shardSets) for (const { s, node } of shards) {
        const a = shardAt(piece, s, t);
        if (!a.visible) { node.setAttribute('visibility', 'hidden'); continue; }
        node.setAttribute('visibility', 'visible');
        node.setAttribute('transform', `translate(${px(a.x)} ${py(a.y)}) rotate(${(a.rot * 57.3).toFixed(1)}) scale(${a.scale.toFixed(3)})`);
        node.setAttribute('opacity', a.alpha.toFixed(2));
      }
      const st = stoneAt(t), sh = st.shake || 0;
      stone.style.display = st.visible ? '' : 'none';
      stone.setAttribute('transform', `translate(${(px(st.x) + Math.sin(t * 97) * 3 * sh).toFixed(1)} ${(py(st.y) - Math.abs(Math.sin(t * 131)) * 3 * sh).toFixed(1)}) rotate(${(-st.spin * 57.3 + Math.sin(t * 121) * 4 * sh).toFixed(1)}) scale(${(st.scale || 1).toFixed(3)})`);
      const cam = cameraAt(t);
      if (cam) { zoom = cam; scriptedNow = true; fitFrame(); }
      else if (scriptedNow) { scriptedNow = false; zoom = null; fitFrame(); if (currentSel) flyTo(currentSel); }
      else if (currentSel === 'stone' && !flight && zoom) { zoom = focusFor('stone', t); fitFrame(); }   // follow the falling stone
      const mt = mountainAt(t);
      if (mt.visible) {
        const k = STONE.r + mt.scale * 11, cx = px(mt.x), base = py(0);
        const wdt = k * S, hgt = k * S * 0.8;
        mountain.setAttribute('d', `M${cx - wdt} ${base} Q${cx - wdt * 0.55} ${base - hgt * 0.55} ${cx - wdt * 0.25} ${base - hgt * 0.8} L${cx} ${base - hgt} Q${cx + wdt * 0.35} ${base - hgt * 0.7} ${cx + wdt * 0.6} ${base - hgt * 0.4} L${cx + wdt} ${base} Z`);
        mountain.setAttribute('opacity', 1);
      } else mountain.setAttribute('opacity', 0);
      for (let i = 0; i < dust.length; i++) {
        const d = dustAt(dust[i], t);
        if (!d.visible) { dots[i].setAttribute('visibility', 'hidden'); continue; }
        dots[i].setAttribute('visibility', 'visible'); dots[i].setAttribute('cx', px(d.x)); dots[i].setAttribute('cy', py(d.y)); dots[i].setAttribute('opacity', (d.alpha * 0.8).toFixed(2));
      }
      const j = t - HIT;
      world.setAttribute('transform', j > 0 && j < 0.32 ? `translate(${(Math.sin(t * 173) * (0.32 - j) * 12).toFixed(1)} ${(Math.cos(t * 191) * (0.32 - j) * 8).toFixed(1)})` : '');
    }
    let currentSel = null, scriptedNow = false;
    function applySelection(id) {
      currentSel = id;
      svg.querySelectorAll('.st-svg-pick').forEach((n) => n.classList.toggle('on', !!id && n.getAttribute('data-id') === id));
    }
    // ── Focus: the frame glides to the chosen piece (or back out to the whole
    // sheet); as in the scene, the ending's scripted view takes precedence.
    const FULL = { target: [0, 0], distance: 15.5 };
    let flight = null;
    function focusFor(id, t) {
      const aspect = host.clientWidth && host.clientHeight ? host.clientWidth / host.clientHeight : 1;
      const upright = aspect < 1;                 // a phone: the sheet covers the lower part of the stage
      const fit = (height) => Math.max(4, Math.min(15.5, (height + (upright ? 3.2 : 2.2)) * 2.3 / Math.min(1, aspect)));
      // With the sheet up only the top ~55% of the stage shows: aim below the piece so it sits there.
      const lift = (f) => {
        if (!upright) return f;
        const vwFull = Math.max(380, Math.min(W, Math.round(aspect * 520))), winH = (vwFull / aspect) * (f.distance / 15.5) / S;
        return { ...f, target: [f.target[0], f.target[1] - winH * 0.21] };
      };
      if (!id) return FULL;
      if (id === 'stone') {
        const st = stoneAt(t), mt = mountainAt(t);
        if (st.visible) return lift({ target: [st.x, st.y], distance: fit(STONE.r * 2.6) });
        const hgt = (STONE.r + mt.scale * 11) * 0.8;
        return lift({ target: [mt.x, hgt * 0.45], distance: fit(hgt) });
      }
      const p = PIECES.find((q) => q.id === id); if (!p) return null;
      return lift({ target: [0, p.y0 + p.h / 2], distance: fit(p.h) });
    }
    function flyTo(id) {
      if (scriptedNow) return;
      const to = focusFor(id, clock.t); if (!to) return;
      const from = zoom || FULL;
      flight = { from, to, t0: performance.now(), ms: id ? 650 : 500, end: id ? to : null };
      const step = (now) => {
        if (!alive || flight?.to !== to) return;
        const k = Math.min(1, (now - flight.t0) / flight.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        zoom = { target: [from.target[0] + (to.target[0] - from.target[0]) * e, from.target[1] + (to.target[1] - from.target[1]) * e], distance: from.distance + (to.distance - from.distance) * e };
        fitFrame();
        if (k < 1) requestAnimationFrame(step); else { zoom = flight.end; flight = null; fitFrame(); }
      };
      requestAnimationFrame(step);
    }
    const onClick = (e) => {
      const n = e.target.closest?.('.st-svg-pick');
      onSelect?.(n && n.style.display !== 'none' ? n.getAttribute('data-id') : null);
    };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { const n = e.target.closest?.('.st-svg-pick'); if (n) { e.preventDefault(); onSelect?.(n.getAttribute('data-id')); } } };
    svg.addEventListener('click', onClick); svg.addEventListener('keydown', onKey);

    let raf = 0, last = -1, alive = true, lastW = 0;
    const frame = () => { if (!alive) return; raf = requestAnimationFrame(frame); const w = host.clientWidth; if (clock.t !== last || w !== lastW) { last = clock.t; lastW = w; place(clock.t); } };
    place(clock.t); frame();
    api.current = { select: (id) => { const changed = id !== currentSel; applySelection(id); if (changed) flyTo(id); } };
    applySelection(selected);
    if (selected) { zoom = focusFor(selected, clock.t); fitFrame(); }
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); svg.removeEventListener('click', onClick); svg.removeEventListener('keydown', onKey); host.removeChild(svg); api.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { api.current?.select(selected); }, [selected]);

  return <div ref={wrap} className="st-sheet" />;
}
