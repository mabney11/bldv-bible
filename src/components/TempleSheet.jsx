/**
 * TempleSheet.jsx — the same house, courts and king's buildings as a flat,
 * measured drawing: a PLAN of the whole complex (north up, east to the right,
 * the way the text faces the house) and a SECTION lengthwise through the house
 * at its middle, porch to oracle. No library; prints; runs anywhere; the view
 * the page shows where WebGL is missing. Every piece is a real element (click,
 * focus, keyboard). Drawn from lib/models/temple.js exactly like the 3D scene.
 *
 * Updates are imperative (opacity set on the nodes each frame for the BUILD
 * story; an eye marker moves on the plan in the WALK), not React re-renders.
 */
import { useEffect, useRef } from 'react';
import { PIECES, MATERIALS, H, progressAt, cameraAt, xrayAt } from '../lib/models/temple.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1000, HGT = 700;
// Plan: cubits → px. The complex spans x −131…131, z −79…175.
const PS = 2.3;
const PX0 = 24 + 131 * PS, PZ0 = 26 + 79 * PS;
const px = (x) => PX0 + x * PS, pz = (z) => PZ0 + z * PS;
// Section (x/y), to the right of the plan: x −48…62, y −6…122.
const SS = 2.75;
const SX0 = 676 + 48 * SS, SY0 = HGT - 64 - 6 * SS;
const sx = (x) => SX0 + x * SS, sy = (y) => SY0 - y * SS;

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
}
const fillFor = (piece, part) => MATERIALS[part.mat || piece.material]?.color || '#999';
const dark = (hex, k = 0.7) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(((n >> v) & 255) * k).toString(16).padStart(2, '0'); return `#${f(16)}${f(8)}${f(0)}`; };

// ── Plan shapes ──────────────────────────────────────────────────────────────
function planShape(piece, part, g) {
  const fill = fillFor(piece, part), stroke = dark(fill);
  const rect = (x, z, w, d, extra = {}) => el('rect', { x: px(x - w / 2), y: pz(z - d / 2), width: w * PS, height: d * PS, fill, stroke, 'stroke-width': 0.6, ...extra }, g);
  const circ = (x, z, r, extra = {}) => el('circle', { cx: px(x), cy: pz(z), r: r * PS, fill, stroke, 'stroke-width': 0.6, ...extra }, g);
  switch (part.kind) {
    case 'box': if (part.role === 'ground') return rect(part.x, part.z, part.w, part.d, { fill: MATERIALS.ground.color, stroke: 'none', opacity: 0.6 }); return rect(part.x, part.z, part.w, part.d, { 'data-role': part.role || null, ...(part.role === 'roof' || part.role === 'ceiling' || part.role === 'slab' ? { opacity: 0.35 } : {}) });
    case 'cyl': return circ(part.x, part.z, part.r);
    case 'ramp': return rect(part.x, part.z + part.len / 2, part.w, part.len, { fill: MATERIALS.stone.color });
    case 'cherub': { const w = part.wing; el('line', { x1: px(part.x), y1: pz(part.z - w), x2: px(part.x), y2: pz(part.z + w), stroke: MATERIALS.gold.color, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g); return circ(part.x, part.z, 1.3); }
    case 'ark': return rect(part.x, part.z, 2.5, 1.5);
    case 'doors': return el('line', { x1: px(part.x), y1: pz(part.z - part.w / 2), x2: px(part.x), y2: pz(part.z + part.w / 2), stroke, 'stroke-width': 2.4 }, g);
    case 'veil': return el('line', { x1: px(part.x), y1: pz(part.z - part.w / 2), x2: px(part.x), y2: pz(part.z + part.w / 2), stroke: MATERIALS.veil.color, 'stroke-width': 1.6, 'stroke-dasharray': '3 2' }, g);
    case 'sea': { circ(part.x, part.z, part.r * 1.1); return circ(part.x, part.z, part.r - 0.3, { fill: MATERIALS.water.color }); }
    case 'base': { rect(part.x, part.z, part.w, part.w); return circ(part.x, part.z, part.basinR, { fill: MATERIALS.water.color }); }
    case 'pillar': return circ(part.x, part.z, part.r * 1.9);
    case 'lampstand': return circ(part.x, part.z, 0.9, { fill: MATERIALS.gold.color });
    case 'table': return rect(part.x, part.z, 2, 1);
    case 'throne': return rect(part.x, part.z, 6, 4, { fill: MATERIALS.ivory.color });
    default: return null;
  }
}
// ── Section shapes (x across, y up) — only what the middle plane (z ≈ 0) cuts or shows behind it ─
function sectionShape(piece, part, g) {
  const fill = fillFor(piece, part), stroke = dark(fill);
  const rect = (x, y, w, h, extra = {}) => el('rect', { x: sx(x - w / 2), y: sy(y + h), width: w * SS, height: h * SS, fill, stroke, 'stroke-width': 0.6, ...extra }, g);
  const inPlane = (z, d) => Math.abs(z) - d / 2 < 0.01;
  switch (part.kind) {
    case 'box': {
      if (part.role === 'ground') return rect(part.x, part.y, part.w, 0.6, { fill: MATERIALS.ground.color, stroke: 'none' });
      if (part.role === 'south') return null;                      // the near wall is cut away
      if (part.role === 'north') return rect(part.x, part.y, part.w, part.h, { opacity: 0.55 });   // the far wall, seen inside
      if (part.role === 'east' || part.role === 'west' || part.role === 'roof' || part.role === 'ceiling' || part.role === 'partition' || part.role === 'tower' || part.role === 'lintel' || part.role === 'floor' || part.role === 'lining' || part.role === 'chains' || part.doorway || !part.role) {
        if (!inPlane(part.z, part.d) && part.role !== 'north') return null;
        if (part.doorway) { const dh = part.doorway.h; rect(part.x, part.y + dh, part.w, part.h - dh); return el('rect', { x: sx(part.x - part.w / 2), y: sy(part.y + dh), width: part.w * SS, height: dh * SS, fill: '#1c1712', opacity: 0.35 }, g); }
        return rect(part.x, part.y, part.w, part.h);
      }
      if (part.role === 'slab') return null;
      return null;
    }
    case 'cyl': return inPlane(part.z, part.r * 2) ? rect(part.x, part.y, part.r * 2, part.h) : null;
    case 'ramp': return el('polygon', { points: `${sx(part.x - part.w / 2)},${sy(part.y)} ${sx(part.x + part.w / 2)},${sy(part.y)} ${sx(part.x + part.w / 2)},${sy(part.y + part.h)}`, fill: MATERIALS.stone.color, stroke, 'stroke-width': 0.6, opacity: 0.5 }, g);
    case 'cherub': { rect(part.x, part.y, 2.6, part.h * 0.82); el('circle', { cx: sx(part.x), cy: sy(part.y + part.h * 0.9), r: 0.7 * SS, fill, stroke }, g); return el('line', { x1: sx(part.x - 0.2), y1: sy(part.y + part.h * 0.69), x2: sx(part.x + 0.2), y2: sy(part.y + part.h * 0.69), stroke: MATERIALS.gold.color, 'stroke-width': 3 }, g); }
    case 'ark': { rect(part.x, part.y, 2.5, 1.6); return rect(part.x, part.y + 1.6, 2.5, 0.9, { opacity: 0.8 }); }
    case 'doors': return rect(part.x, part.y, part.t + 0.2, part.h, { fill: stroke });
    case 'veil': return rect(part.x, part.y, 0.3, part.h, { fill: MATERIALS.veil.color });
    case 'sea': { rect(part.x, part.y, 3.6, part.oxH, { opacity: 0.8 }); rect(part.x, part.y + part.oxH, part.r * 2, part.h); return rect(part.x, part.y + part.oxH + part.h - 0.7, part.r * 2 - 0.5, 0.35, { fill: MATERIALS.water.color, stroke: 'none' }); }
    case 'base': return null;
    case 'pillar': { rect(part.x, part.y, part.r * 2, part.h); rect(part.x, part.y + part.h, part.r * 2.9, part.capH); return rect(part.x, part.y + part.h + part.capH, part.r * 3.6, part.lilyH); }
    case 'lampstand': return Math.abs(part.z) < 8 ? rect(part.x, part.y, 2.2, part.h, { opacity: 0.6 }) : null;
    case 'table': return Math.abs(part.z) < 5 ? rect(part.x, part.y, 2, 1.6, { opacity: 0.6 }) : null;
    case 'throne': return null;
    default: return null;
  }
}

const LABELS = [
  ['hayakal', 10, 0], ['dabayar', -20, 0], ['awalam', 41, 0], ['Yakayan', 49, 13], ['Baiz', 49, -13], ['mazabach', 76, 0], ['yam', 58, 40],
  ['chatzar (inner court)', 20, -54], ['gadawal chatzar (great court)', 0, -70], ['bayath yair Labanawan', 0, 128], ['awalam of imawadayam', 0, 82], ['awalam of the kasaa', 72, 82],
  ['bayath of the malak', -90, 100], ['bayath for Paraih\'s banath', 91, 134], ['makanawath', -8, 40], ['makanawath', -8, -40],
];

export default function TempleSheet({ clock, mode, selected, onSelect }) {
  const wrap = useRef(null);
  const api = useRef(null);
  const modeRef = useRef(mode); modeRef.current = mode;

  useEffect(() => {
    const host = wrap.current; if (!host) return undefined;
    const svg = el('svg', { viewBox: `0 0 ${W} ${HGT}`, class: 'st-svg', role: 'img', 'aria-label': 'The house of Yahawah, drawn flat: a plan of the whole and a section through the house' }, host);
    const defs = el('defs', {}, svg);
    const hatch = el('pattern', { id: 'tp-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#0003', 'stroke-width': 2 }, hatch);
    el('rect', { x: 0, y: 0, width: W, height: HGT, fill: '#f4efe4' }, svg);
    // titles
    el('text', { x: 24, y: 16, 'font-size': 11, 'font-weight': 700, fill: '#5a4a2e', 'letter-spacing': 1.2 }, svg).textContent = 'PLAN · tzapawan (north) up · mazarach (east) right · one square = 20 amah';
    el('text', { x: 676, y: 16, 'font-size': 11, 'font-weight': 700, fill: '#5a4a2e', 'letter-spacing': 1.2 }, svg).textContent = 'SECTION · through the middle, awalam to dabayar';
    // grid on the plan, 20 cubits
    const grid = el('g', { stroke: '#0000000e', 'stroke-width': 0.6 }, svg);
    for (let x = -120; x <= 120; x += 20) el('line', { x1: px(x), y1: pz(-78), x2: px(x), y2: pz(174) }, grid);
    for (let z = -60; z <= 160; z += 20) el('line', { x1: px(-130), y1: pz(z), x2: px(130), y2: pz(z) }, grid);
    // ground line of the section
    el('line', { x1: sx(-48), y1: sy(H.courtY), x2: sx(62), y2: sy(H.courtY), stroke: '#7a6a4e', 'stroke-width': 1 }, svg);
    for (let y = 0; y <= 120; y += 20) { el('line', { x1: sx(-48), y1: sy(y), x2: sx(-46), y2: sy(y), stroke: '#7a6a4e', 'stroke-width': 0.8 }, svg); el('text', { x: sx(-45), y: sy(y) + 3, 'font-size': 8, fill: '#7a6a4e' }, svg).textContent = String(y); }

    const planG = el('g', {}, svg), secG = el('g', {}, svg);
    const nodes = new Map();   // piece id → [{g}]
    const order = [...PIECES].sort((a, b) => a.order - b.order);
    for (const piece of order) {
      if (!piece.parts.length) continue;
      const gp = el('g', { class: `st-svg-pick${selected === piece.id ? ' on' : ''}`, tabindex: 0, role: 'button', 'aria-label': piece.tag, 'data-id': piece.id }, planG);
      const gs = el('g', { class: `st-svg-pick${selected === piece.id ? ' on' : ''}`, 'data-id': piece.id }, secG);
      const inner = el('g', {}, gp), innerS = el('g', {}, gs);
      for (const part of piece.parts) { planShape(piece, part, inner); sectionShape(piece, part, innerS); }
      const pick = () => onSelect?.(selected === piece.id ? null : piece.id);
      gp.addEventListener('click', pick); gs.addEventListener('click', pick);
      gp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      nodes.set(piece.id, [gp, gs]);
    }
    // labels
    const lab = el('g', { 'font-size': 8.5, fill: '#3b2f1c', 'text-anchor': 'middle', 'pointer-events': 'none' }, svg);
    for (const [t, x, z] of LABELS) el('text', { x: px(x), y: pz(z) + 3 }, lab).textContent = t;
    // compass
    el('text', { x: px(122), y: pz(-66), 'font-size': 14, fill: '#8a6716', 'text-anchor': 'middle' }, svg).textContent = '𐤑𐤐𐤅𐤍';
    el('path', { d: `M${px(122)},${pz(-60)} l-4,10 l4,-3 l4,3 z`, fill: '#8a6716' }, svg);
    // the eye (walk)
    const eye = el('g', { 'pointer-events': 'none' }, svg);
    const eyeDot = el('circle', { r: 4, fill: '#ffc857', stroke: '#5a3a00', 'stroke-width': 1 }, eye);
    const eyeRay = el('line', { stroke: '#ffc857', 'stroke-width': 1.5, 'stroke-dasharray': '3 2' }, eye);

    function place(t) {
      const mode = modeRef.current;
      for (const piece of order) {
        const n = nodes.get(piece.id); if (!n) continue;
        const p = progressAt(mode, piece, t);
        for (const g of n) { g.style.opacity = String(p); g.style.pointerEvents = p > 0.5 ? '' : 'none'; }
      }
      // the roof and the near walls thin out in the see-through stretches, on the plan
      const x = xrayAt(mode, t);
      for (const piece of order) {
        const n = nodes.get(piece.id); if (!n || (piece.group !== 'house' && piece.group !== 'inside')) continue;
        n[0].querySelectorAll('[data-role="roof"],[data-role="tower"]').forEach((r) => { r.style.opacity = String(0.35 * (1 - x) + 0.05); });
      }
      const cam = cameraAt(mode, t);
      eye.style.display = mode === 'walk' ? '' : 'none';
      eyeDot.setAttribute('cx', px(cam.pos[0])); eyeDot.setAttribute('cy', pz(cam.pos[2]));
      eyeRay.setAttribute('x1', px(cam.pos[0])); eyeRay.setAttribute('y1', pz(cam.pos[2])); eyeRay.setAttribute('x2', px(cam.target[0])); eyeRay.setAttribute('y2', pz(cam.target[2]));
    }
    let raf = 0, lastT = -1, alive = true;
    function frame() { if (!alive) return; raf = requestAnimationFrame(frame); if (clock.t !== lastT) { lastT = clock.t; place(clock.t); } }
    place(clock.t); frame();
    api.current = {
      select: (id) => { for (const [pid, n] of nodes) for (const g of n) g.classList.toggle('on', pid === id || (id === 'house' && PIECES.find((p) => p.id === pid)?.group === 'house')); },
      refresh: () => { lastT = -1; },
    };
    return () => { alive = false; cancelAnimationFrame(raf); host.removeChild(svg); api.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { api.current?.select(selected); }, [selected]);
  useEffect(() => { api.current?.refresh(); }, [mode]);
  return <div ref={wrap} className="st-sheet" />;
}
