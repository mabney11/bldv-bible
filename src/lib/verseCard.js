/**
 * verseCard — draws one verse as a shareable picture (PNG), the Detailed Verse
 * page's look: book name in spaced gold capitals, the big chapter:verse, the
 * verse with each transliterated root in the reader's gold, and a bldbible.com
 * mark at the foot. fieldy, 2026-11-04: "the ability to download an image with
 * the entire verse in it -- presented nicely with a bldbible.com marker on it".
 *
 * Drawn on a <canvas> (not a screenshot of the page), so it is the same at any
 * screen size and always holds the WHOLE verse: the text size is chosen so the
 * verse fills the card without running off it.
 */

// Same "root (gloss)" pattern as Reader.jsx / NovelText.jsx (kept identical).
const GLOSS_RE = /([A-Za-zÀ-ɏ\u{10900}-\u{1091F}][A-Za-zÀ-ɏ\u{10900}-\u{1091F}'’-]*)([‘’“”"']*)\s+\(([^()]*)\)/gu;
const PALEO_RE = /[\u{10900}-\u{1091F}]/u;

export const CARD_SIZES = [
  { id: 'square',   label: 'Square',   w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait', w: 1080, h: 1350 },
  { id: 'story',    label: 'Story',    w: 1080, h: 1920 },
  { id: 'wide',     label: 'Wide',     w: 1600, h: 900 },
];

export const CARD_THEMES = {
  night: {
    bg: '#14110c', glowTop: 'rgba(215,165,76,0.07)', glowBottom: 'rgba(0,0,0,0.30)',
    ink: '#ece4d4', soft: '#b6ac97', faint: '#857b67', accent: '#d7a54c', root: '#b48a3c', rule: 'rgba(215,165,76,0.45)',
  },
  parchment: {
    bg: '#efe4cc', glowTop: 'rgba(154,106,30,0.10)', glowBottom: 'rgba(107,78,31,0.14)',
    ink: '#2b2117', soft: '#5d5240', faint: '#8a7d62', accent: '#9a6a1e', root: '#9a6a1e', rule: 'rgba(154,106,30,0.50)',
  },
};

// Verse text -> runs [{ text, root }] in the chosen gloss mode, with the
// reader's <...> bracket quotes drawn as real quotation marks.
export function verseRuns(raw, glossMode = 'both') {
  let t = String(raw || '')
    .replace(/\s*־\s*/g, '.')                  // stray maqaf (Reader's sanitizeText)
    .replace(/[   -   　﻿]/g, ' ');
  let depth = 0;
  t = t.replace(/[<>]/g, ch => {
    if (ch === '<') { depth++; return depth % 2 ? '“' : '‘'; }
    const g = depth % 2 ? '”' : '’'; depth = Math.max(0, depth - 1); return g;
  });
  const runs = [];
  let last = 0, m;
  GLOSS_RE.lastIndex = 0;
  while ((m = GLOSS_RE.exec(t))) {
    const [full, heb, quote, gloss] = m;
    if (m.index > last) runs.push({ text: t.slice(last, m.index), root: false });
    const g = gloss.trim();
    if (glossMode === 'gloss') {
      runs.push({ text: (g || heb) + quote, root: !g });
    } else {
      runs.push({ text: heb, root: true, paleo: PALEO_RE.test(heb) });
      if (quote) runs.push({ text: quote, root: false });
      if (glossMode === 'both' && g) runs.push({ text: ` (${g})`, root: false });
    }
    last = m.index + full.length;
  }
  if (last < t.length) runs.push({ text: t.slice(last), root: false });
  return runs.map(r => ({ ...r, text: r.text.replace(/\s+/g, ' ') })).filter(r => r.text);
}

// runs -> words; a word is a list of pieces with no space between them.
function toWords(runs) {
  const words = [];
  let cur = [];
  for (const r of runs) {
    const parts = r.text.split(/( )/);
    for (const p of parts) {
      if (p === ' ') { if (cur.length) { words.push(cur); cur = []; } continue; }
      if (p) cur.push({ text: p, root: r.root, paleo: r.paleo });
    }
  }
  if (cur.length) words.push(cur);
  return words;
}

const fontFor = (piece, px, family) =>
  piece.paleo ? `400 ${px}px 'BLD Paleo', ${family}` : `${piece.root ? 700 : 400} ${px}px ${family}`;

function layout(ctx, words, px, family, maxW) {
  const space = (() => { ctx.font = `400 ${px}px ${family}`; return ctx.measureText(' ').width; })();
  const lines = [];
  let line = [], lineW = 0;
  for (const w of words) {
    const pieces = w.map(p => { ctx.font = fontFor(p, px, family); return { ...p, w: ctx.measureText(p.text).width }; });
    const ww = pieces.reduce((a, p) => a + p.w, 0);
    if (line.length && lineW + space + ww > maxW) { lines.push(line); line = []; lineW = 0; }
    line.push({ pieces, w: ww });
    lineW += (line.length > 1 ? space : 0) + ww;
  }
  if (line.length) lines.push(line);
  return { lines, space };
}

function spaced(ctx, text, x, y, tracking, align = 'left') {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + tracking; });
  return total;
}

/** Make sure the faces the card uses are loaded before drawing (canvas won't wait). */
export async function loadCardFonts(family) {
  if (!document.fonts?.load) return;
  const first = (family.match(/'([^']+)'/) || [])[1] || 'Alegreya';
  await Promise.all([
    document.fonts.load(`400 40px '${first}'`),
    document.fonts.load(`700 40px '${first}'`),
    document.fonts.load(`400 40px 'BLD Paleo'`, '𐤀'),
  ]).catch(() => {});
}

/**
 * drawVerseCard(canvas, { bookName, chapter, verse, text, size, theme, family, glossMode, align })
 */
export function drawVerseCard(canvas, o) {
  const size = CARD_SIZES.find(s => s.id === o.size) || CARD_SIZES[0];
  const th = CARD_THEMES[o.theme] || CARD_THEMES.night;
  const family = o.family || "'Alegreya', Georgia, serif";
  const W = size.w, H = size.h;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // paper, with the reader's quiet glow at the top and vignette at the foot
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, Math.max(W, H) * 0.9);
  g.addColorStop(0, th.glowTop); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W / 2, H * 1.15, 0, W / 2, H * 1.15, Math.max(W, H) * 0.7);
  g.addColorStop(0, th.glowBottom); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const unit = Math.min(W, H) / 1080;
  const padX = Math.round(96 * unit * (W > H ? 1.4 : 1));
  const padTop = Math.round((H > W * 1.5 ? 200 : 96) * unit);
  const padBottom = Math.round((H > W * 1.5 ? 200 : 92) * unit);
  const maxW = W - padX * 2;
  const center = o.align === 'center';
  const x0 = center ? W / 2 : padX;

  // ── head: BOOK NAME / 28:9 ──
  let y = padTop;
  const bookPx = Math.round(30 * unit);
  ctx.fillStyle = th.accent;
  ctx.font = `400 ${bookPx}px ${family}`;
  y += bookPx;
  spaced(ctx, String(o.bookName || '').toUpperCase(), x0, y, bookPx * 0.34, center ? 'center' : 'left');
  const refPx = Math.round(132 * unit);
  ctx.fillStyle = th.ink;
  ctx.font = `400 ${refPx}px ${family}`;
  y += Math.round(refPx * 1.0);
  ctx.textAlign = center ? 'center' : 'left';
  ctx.fillText(`${o.chapter}:${o.verse}`, x0, y);
  ctx.textAlign = 'left';
  const headBottom = y + Math.round(56 * unit);

  // ── foot: rule + bldbible.com ──
  const markPx = Math.round(26 * unit);
  const footY = H - padBottom;
  const ruleY = footY - markPx - Math.round(26 * unit);
  ctx.fillStyle = th.rule;
  const ruleW = Math.round(56 * unit);
  ctx.fillRect(center ? W / 2 - ruleW / 2 : padX, ruleY, ruleW, Math.max(1, Math.round(2 * unit)));
  ctx.fillStyle = th.accent;
  ctx.font = `700 ${markPx}px ${family}`;
  spaced(ctx, 'BLDBIBLE.COM', x0, footY, markPx * 0.26, center ? 'center' : 'left');
  const textBottom = ruleY - Math.round(48 * unit);

  // ── the verse: largest size that fits the space between head and foot ──
  const words = toWords(verseRuns(o.text, o.glossMode));
  const room = textBottom - headBottom;
  const LH = 1.6;
  let px = Math.round(66 * unit), fit = null;
  const minPx = Math.round(16 * unit);
  for (; px >= minPx; px -= 1) {
    const l = layout(ctx, words, px, family, maxW);
    if (l.lines.length * px * LH <= room) { fit = l; break; }
  }
  if (!fit) { px = minPx; fit = layout(ctx, words, px, family, maxW); }
  const blockH = fit.lines.length * px * LH;
  // centre the verse vertically in its space (a short verse doesn't hug the heading)
  let ly = headBottom + Math.max(0, (room - blockH) / 2) + px * 1.12;
  for (const line of fit.lines) {
    const lw = line.reduce((a, w) => a + w.w, 0) + fit.space * (line.length - 1);
    let lx = center ? W / 2 - lw / 2 : padX;
    line.forEach((w, i) => {
      if (i) lx += fit.space;
      for (const p of w.pieces) {
        ctx.font = fontFor(p, px, family);
        ctx.fillStyle = p.root ? th.root : th.ink;
        ctx.fillText(p.text, lx, ly);
        lx += p.w;
      }
    });
    ly += px * LH;
  }
  return { fontPx: px, lines: fit.lines.length };
}

export function cardFileName(bookName, chapter, verse) {
  const slug = String(bookName || 'verse').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}-${chapter}-${verse}-bldbible.png`;
}
