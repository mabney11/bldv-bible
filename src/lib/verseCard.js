/**
 * verseCard — draws one verse as a shareable picture (PNG), the Detailed Verse
 * page's look: book name in spaced gold capitals, the big chapter:verse, the
 * verse with each transliterated root in the reader's gold, a BLDBIBLE.COM tag, and — on a verse
 * fieldy marked "Hebrew (English) verified and proofread" in the Studio — his 𐤌 translated-by mark,
 * and a bldbible.com
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
    ink: '#ece4d4', soft: '#b6ac97', faint: '#857b67', accent: '#d7a54c', root: '#b48a3c', rule: 'rgba(215,165,76,0.45)', seal: 'rgba(215,165,76,0.10)',
    sunHi: '#f6d987', sunMid: '#dcaa45', sunLo: '#b07d26', sunInk: '#4a2c10',
    frame: 'rgba(215,165,76,0.70)', frameFine: 'rgba(215,165,76,0.45)',
  },
  parchment: {
    bg: '#efe4cc', glowTop: 'rgba(154,106,30,0.10)', glowBottom: 'rgba(107,78,31,0.14)',
    ink: '#2b2117', soft: '#5d5240', faint: '#8a7d62', accent: '#9a6a1e', root: '#9a6a1e', rule: 'rgba(154,106,30,0.50)', seal: 'rgba(154,106,30,0.10)',
    sunHi: '#f3cf72', sunMid: '#d29d33', sunLo: '#9a6a1e', sunInk: '#4a2c10',
    frame: 'rgba(176,125,38,0.75)', frameFine: 'rgba(154,106,30,0.50)',
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

// The verse is set heavier than the reader's body text so it carries the card (fieldy, 2026-11-04:
// "make the scripture text more bold"): English 600, roots 800 (faces without those cuts use their nearest).
export const TEXT_WEIGHT = 600, ROOT_WEIGHT = 800;
const fontFor = (piece, px, family) =>
  piece.paleo ? `400 ${px}px 'BLD Paleo', ${family}` : `${piece.root ? ROOT_WEIGHT : TEXT_WEIGHT} ${px}px ${family}`;

function layout(ctx, words, px, family, maxW) {
  const space = (() => { ctx.font = `${TEXT_WEIGHT} ${px}px ${family}`; return ctx.measureText(' ').width; })();
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
    document.fonts.load(`${TEXT_WEIGHT} 40px '${first}'`),
    document.fonts.load(`${ROOT_WEIGHT} 40px '${first}'`),
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
  const padX = Math.round(112 * unit * (W > H ? 1.35 : 1));
  const padTop = Math.round((H > W * 1.5 ? 200 : 108) * unit);
  const padBottom = Math.round((H > W * 1.5 ? 170 : 74) * unit);

  // ── frame, on every shape (fieldy, 2026-11-04: "I like the idea of framing"): a gold band with a
  //    fine line inside it, round-cornered, inset from the edge ──
  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  const frameIn = Math.round(46 * unit);   // the frame's inner line
  {
    const m = Math.round(30 * unit), band = Math.max(3, Math.round(7 * unit));
    ctx.lineWidth = band; ctx.strokeStyle = th.frame;
    roundRect(m, m, W - m * 2, H - m * 2, Math.round(26 * unit)); ctx.stroke();
    const m2 = frameIn;
    ctx.lineWidth = Math.max(1, Math.round(1.6 * unit)); ctx.strokeStyle = th.frameFine;
    roundRect(m2, m2, W - m2 * 2, H - m2 * 2, Math.round(16 * unit)); ctx.stroke();
  }
  const maxW = W - padX * 2;
  const center = o.align === 'center';
  const x0 = center ? W / 2 : padX;

  // ── head: BOOK NAME / 28:9 ──
  let y = padTop;
  const bookPx = Math.round(52 * unit);   // 75% larger than the first cut (fieldy, 2026-11-04)
  ctx.fillStyle = th.accent;
  ctx.font = `400 ${bookPx}px ${family}`;
  y += bookPx;
  const bookW = spaced(ctx, String(o.bookName || '').toUpperCase(), x0, y, bookPx * 0.34, center ? 'center' : 'left');
  const refPx = Math.round(118 * unit);
  ctx.fillStyle = th.ink;
  ctx.font = `400 ${refPx}px ${family}`;
  y += Math.round(refPx * 1.0);
  ctx.textAlign = center ? 'center' : 'left';
  ctx.fillText(`${o.chapter}:${o.verse}`, x0, y);
  const refW = ctx.measureText(`${o.chapter}:${o.verse}`).width;
  ctx.textAlign = 'left';
  const headBottom = y + Math.round(44 * unit);
  const headW = Math.max(bookW, refW);
  const headRight = center ? W / 2 + headW / 2 : padX + headW;

  // ── foot: rule + BLDBIBLE.COM, and — on a verse fieldy marked "Hebrew (English) verified and
  //    proofread" — a small seal under it: "Hand translated by MaAratz". The big 𐤌 seal (no text)
  //    sits in the upper right corner. (fieldy, 2026-11-04)
  const markPx = Math.round(36 * unit);   // the foot fills its space (fieldy, 2026-11-04)
  const notePx = markPx;                  // "Hand translated…" the same size as BLDBIBLE.COM
  const miniD = Math.round(36 * unit);
  // bottom of the stack: 𐤀𐤕, the BLD Bible mark (under "Hand translated…", or under the site name)
  const atPx = Math.round(40 * unit);
  const footY = H - padBottom - (o.credit ? miniD * 1.56 + Math.round(10 * unit) : 0);
  const ruleY = footY - markPx - Math.round(30 * unit);
  ctx.fillStyle = th.rule;
  const ruleW = Math.round(56 * unit);
  // the separator runs the full width of the text column; the foot is always centred
  ctx.fillRect(padX, ruleY, W - padX * 2, Math.max(1, Math.round(2 * unit)));
  { // a small diamond at the middle of the separator
    const dd = Math.round(9 * unit), mx = W / 2, my = ruleY + Math.max(1, Math.round(2 * unit)) / 2;
    ctx.fillStyle = th.bg; ctx.fillRect(mx - dd * 2, my - dd, dd * 4, dd * 2);
    ctx.beginPath(); ctx.moveTo(mx, my - dd); ctx.lineTo(mx + dd, my); ctx.lineTo(mx, my + dd); ctx.lineTo(mx - dd, my); ctx.closePath();
    ctx.fillStyle = th.accent; ctx.fill();
  }
  ctx.fillStyle = th.accent;
  ctx.font = `700 ${markPx}px ${family}`;
  spaced(ctx, 'BLDBIBLE.COM', W / 2, footY, markPx * 0.26, 'center');
  let textBottom = ruleY - Math.round(34 * unit);

  // The 𐤌 badge is a gold sun: a starburst of long and short rays around a gold disk, with a brown
  // Mayam (𐤌) in the middle (fieldy, 2026-11-04: "a gold sun with a brown Mayam character as the tag").
  // d = the disk's diameter; the rays reach out to about 1.5x that.
  const seal = (cx, cy, d) => {
    const r = d / 2;
    const rays = 16;
    const long = r * 1.55, short = r * 1.22, valley = r * 0.98;
    ctx.save();
    // rays
    ctx.beginPath();
    for (let i = 0; i < rays * 2; i++) {
      const a = (i / (rays * 2)) * Math.PI * 2 - Math.PI / 2;
      const tip = i % 2 === 0;
      const rr = tip ? ((i / 2) % 2 === 0 ? long : short) : valley;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    let g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, long);
    g.addColorStop(0, th.sunHi); g.addColorStop(1, th.sunLo);
    ctx.fillStyle = g; ctx.fill();
    // disk (no outline — rays and disk read as one sun)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, th.sunHi); g.addColorStop(1, th.sunMid);
    ctx.fillStyle = g; ctx.fill();
    // the brown Mayam
    ctx.fillStyle = th.sunInk;
    ctx.font = `400 ${Math.round(d * 0.66)}px 'BLD Paleo', 'Noto Sans Phoenician', serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(o.credit.mark, cx, cy + d * 0.09);   // BLD Paleo's 𐤌 sits high on 'middle'
    ctx.restore();
  };
  if (o.credit) {
    // upper right: the mark alone, level with the book name / reference
    const bigD = Math.round(54 * unit);           // disk; with its rays the sun is ~84 px across (fieldy: smaller)
    // centred in the open space right of the heading, above the verse (fieldy, 2026-11-04)
    const openL = headRight, openR = W - padX;
    const sunX = Math.min(openR - bigD * 0.78, Math.max(openL + bigD * 0.9, (openL + openR) / 2));
    seal(sunX, (padTop + headBottom) / 2 - Math.round(6 * unit), bigD);
    // under BLDBIBLE.COM: small seal + the plain-English clarification
    const label = o.credit.note || 'Hand translated by MaAratz';
    ctx.font = `400 ${notePx}px ${family}`;
    const lw = ctx.measureText(label).width;
    const gap = Math.round(12 * unit);
    const rowW = miniD * 1.56 + gap + lw;
    const rx = W / 2 - rowW / 2;
    const cy = H - padBottom - miniD * 0.78;
    seal(rx + miniD * 0.78, cy, miniD);
    ctx.fillStyle = th.soft;
    ctx.font = `400 ${notePx}px ${family}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rx + miniD * 1.56 + gap, cy + Math.round(1 * unit));
    ctx.textBaseline = 'alphabetic';
  }

  // 𐤀𐤕 — the BLD Bible mark, bottom-right, sitting just above the frame's inner line (every card)
  ctx.save();
  ctx.fillStyle = th.accent;
  ctx.font = `400 ${atPx}px 'BLD Paleo', 'Noto Sans Phoenician', serif`;
  ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('𐤀𐤕', W - frameIn - Math.round(20 * unit), H - frameIn - Math.round(14 * unit));
  ctx.restore();

  // ── the verse: largest size that fits the space between head and foot ──
  const words = toWords(verseRuns(o.text, o.glossMode));
  const room = textBottom - headBottom;
  const LH = 1.5;
  let px = Math.round(74 * unit), fit = null;   // the verse is what should pop
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
