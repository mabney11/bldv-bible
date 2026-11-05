/**
 * rootCard — the Root page's card as a picture, trading-card style (5:7), for phones.
 * fieldy, 2026-11-05: "a download feature here too for downloading the main card in a way that fits
 * into a single image ... (imagine pokemon cards) ... an image that has two sides one with the card
 * info summarized ... and the other side with the first verse usage including the paleo".
 *
 *   FRONT  Strong's number + occurrences, the root's Paleo letters in an "art" window, the
 *          transliteration, the definition (big), first usage / this context / the numbers that
 *          share the letters, BLDBIBLE.COM and 𐤀𐤕.
 *   BACK   the verse: its reference, the English (roots gold, the hit pair lit), and the Paleo word
 *          blocks right-to-left — each word's letters coloured by morpheme (the page's own colours),
 *          its transliteration and gloss — the hit word framed in gold.
 *   BOTH   the two side by side in one image.
 *
 * Everything is drawn from data the page already shows (RootCard + the centrepiece verse); nothing
 * here re-derives a root, a gloss or a colour rule.
 */
import { CARD_THEMES, verseRuns, spaced, TEXT_WEIGHT, ROOT_WEIGHT } from './verseCard.js';

export const CARD_W = 1080, CARD_H = 1512;
const GAP = 48;
const PALEO = "'BLD Paleo', 'Noto Sans Phoenician', serif";
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function paper(ctx, th, W, H) {
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, Math.max(W, H) * 0.9);
  g.addColorStop(0, th.glowTop); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W / 2, H * 1.15, 0, W / 2, H * 1.15, Math.max(W, H) * 0.7);
  g.addColorStop(0, th.glowBottom); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // the same frame as the verse images
  ctx.lineWidth = 7; ctx.strokeStyle = th.frame;
  roundRect(ctx, 30, 30, W - 60, H - 60, 26); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.strokeStyle = th.frameFine;
  roundRect(ctx, 46, 46, W - 92, H - 92, 16); ctx.stroke();
}

// separator, BLDBIBLE.COM, 𐤀𐤕 — returns the y the content must stay above
function foot(ctx, th, W, H, family) {
  const markPx = 34, footY = H - 96, ruleY = footY - markPx - 26;
  ctx.fillStyle = th.rule; ctx.fillRect(96, ruleY, W - 192, 2);
  const dd = 9, mx = W / 2, my = ruleY + 1;
  ctx.fillStyle = th.bg; ctx.fillRect(mx - dd * 2, my - dd, dd * 4, dd * 2);
  ctx.beginPath(); ctx.moveTo(mx, my - dd); ctx.lineTo(mx + dd, my); ctx.lineTo(mx, my + dd); ctx.lineTo(mx - dd, my); ctx.closePath();
  ctx.fillStyle = th.accent; ctx.fill();
  ctx.font = `700 ${markPx}px ${family}`;
  spaced(ctx, 'BLDBIBLE.COM', W / 2, footY, markPx * 0.26, 'center');
  ctx.save();
  ctx.font = `400 40px ${PALEO}`; ctx.direction = 'rtl'; ctx.textAlign = 'right';
  ctx.fillText('𐤀𐤕', W - 66, H - 60);
  ctx.restore();
  return ruleY - 30;
}

function chip(ctx, th, text, x, y, px, { align = 'left', strong = true } = {}) {
  ctx.font = `700 ${px}px ${MONO}`;
  const w = ctx.measureText(text).width + px * 0.9, h = px * 1.45;
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  roundRect(ctx, x0, y - h * 0.74, w, h, px * 0.28);
  ctx.fillStyle = th.seal; ctx.fill();
  ctx.lineWidth = Math.max(2, px * 0.07); ctx.strokeStyle = strong ? th.accent : th.faint; ctx.stroke();
  ctx.fillStyle = strong ? th.accent : th.soft;
  ctx.textAlign = 'left'; ctx.fillText(text, x0 + px * 0.45, y);
  return w;
}

// wrap plain text to lines within maxW (single style)
function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
// the largest size (<= max) at which `text` fits in maxLines lines of maxW
function fitText(ctx, text, weightFamily, max, min, maxW, maxLines) {
  for (let px = max; px >= min; px -= 2) {
    ctx.font = `${weightFamily(px)}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) return { px, lines };
  }
  ctx.font = weightFamily(min);
  return { px: min, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
}

// ── FRONT ───────────────────────────────────────────────────────────────────
function drawFront(ctx, th, f, d) {
  const W = CARD_W, H = CARD_H, L = 96, R = W - 96;
  paper(ctx, th, W, H);
  ctx.textBaseline = 'alphabetic';
  // top row: the Strong's number, the count
  chip(ctx, th, d.sn, L, 150, 58);
  ctx.textAlign = 'right'; ctx.fillStyle = th.ink; ctx.font = `700 60px ${f}`;
  ctx.fillText((d.total || 0).toLocaleString(), R, 146);
  ctx.fillStyle = th.faint; ctx.font = `400 26px ${f}`;
  spaced(ctx, 'OCCURRENCES', R, 186, 26 * 0.22, 'right');
  ctx.textAlign = 'left';

  // the art window: the root's letters
  const ax = L, ay = 220, aw = R - L, ah = 400;
  roundRect(ctx, ax, ay, aw, ah, 22);
  const g = ctx.createLinearGradient(0, ay, 0, ay + ah);
  g.addColorStop(0, th.seal); g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = th.frameFine; ctx.stroke();
  ctx.save();
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let gpx = 250;
  ctx.font = `400 ${gpx}px ${PALEO}`;
  const gw = ctx.measureText(d.root || '').width;
  if (gw > aw - 120) { gpx = Math.floor(gpx * (aw - 120) / gw); ctx.font = `400 ${gpx}px ${PALEO}`; }
  ctx.fillStyle = th.ink;
  ctx.fillText(d.root || '', W / 2, ay + ah / 2 + gpx * 0.06);
  ctx.restore();
  ctx.fillStyle = th.faint; ctx.font = `400 22px ${f}`;
  spaced(ctx, 'ROOT', ax + 26, ay + 44, 22 * 0.3);

  // transliteration, definition
  let y = ay + ah + 92;
  ctx.textAlign = 'center'; ctx.fillStyle = th.accent;
  ctx.font = `italic 400 62px ${f}`;
  ctx.fillText(d.translit || '', W / 2, y);
  y += 40;
  const def = d.definition || '';
  if (def) {
    const ft = fitText(ctx, def, px => `800 ${px}px ${f}`, 92, 40, R - L, 2);
    ctx.fillStyle = th.ink;
    ft.lines.forEach(line => { y += ft.px * 1.08; ctx.fillText(line, W / 2, y); });
  } else {
    ctx.fillStyle = th.faint; ctx.font = `400 80px ${PALEO}`;
    y += 86; ctx.fillText(d.root || '', W / 2, y);
  }
  ctx.textAlign = 'left';

  // facts
  const stop = foot(ctx, th, W, H, f);
  y += 56;
  ctx.fillStyle = th.rule; ctx.fillRect(L, y, R - L, 1.5);
  y += 52;
  const fact = (label, value, extra) => {
    if (y > stop - 30) return;
    ctx.fillStyle = th.faint; ctx.font = `400 22px ${f}`;
    spaced(ctx, label.toUpperCase(), L, y, 22 * 0.22);
    ctx.fillStyle = th.accent; ctx.font = `600 38px ${f}`;
    ctx.fillText(value, L, y + 48);
    if (extra) { const vw = ctx.measureText(value).width; chip(ctx, th, extra, L + vw + 22, y + 46, 30); }
    y += 104;
  };
  if (d.first) fact('Root first usage', d.first, d.firstSn);
  if (d.snFirst && d.snFirst !== d.first) fact(`${d.sn} first usage`, d.snFirst, d.sn);
  if (d.context && d.context !== d.first) fact('This context', d.context);
  const others = (d.homographs || []).filter(h => h.sn !== d.sn).slice(0, 3);
  if (others.length && y < stop - 60) {
    ctx.fillStyle = th.faint; ctx.font = `400 22px ${f}`;
    spaced(ctx, 'SHARES ITS LETTERS WITH', L, y, 22 * 0.22);
    y += 50;
    for (const h of others) {
      if (y > stop) break;
      const cw = chip(ctx, th, h.sn, L, y, 30, { strong: false });
      ctx.fillStyle = th.ink; ctx.font = `700 32px ${f}`;
      const t = `${h.definition || ''}`;
      ctx.fillText(t, L + cw + 20, y);
      ctx.fillStyle = th.faint; ctx.font = `400 26px ${f}`;
      ctx.textAlign = 'right'; ctx.fillText(`${(h.count || 0).toLocaleString()} occ.`, R, y); ctx.textAlign = 'left';
      // where THIS number is first used (fieldy, 2026-11-05)
      if (h.first) {
        ctx.fillStyle = th.faint; ctx.font = `400 24px ${f}`; ctx.fillText('first', L + cw + 20, y + 40);
        const fw = ctx.measureText('first ').width;
        ctx.fillStyle = th.accent; ctx.font = `600 28px ${f}`; ctx.fillText(h.first, L + cw + 20 + fw, y + 40);
        y += 38;
      }
      y += 60;
    }
  }
}

// ── BACK ────────────────────────────────────────────────────────────────────
// verse English as wrapped runs; the hit pair gets a gold box
function layoutEnglish(ctx, runs, px, f, maxW) {
  const words = []; let cur = [];
  for (const r of runs) {
    for (const p of r.text.split(/( )/)) {
      if (p === ' ') { if (cur.length) { words.push(cur); cur = []; } continue; }
      if (p) cur.push({ text: p, root: r.root, hit: r.hit });
    }
  }
  if (cur.length) words.push(cur);
  ctx.font = `${TEXT_WEIGHT} ${px}px ${f}`;
  const space = ctx.measureText(' ').width;
  const lines = []; let line = [], lw = 0;
  for (const w of words) {
    const pieces = w.map(p => { ctx.font = `${p.root ? ROOT_WEIGHT : TEXT_WEIGHT} ${px}px ${f}`; return { ...p, w: ctx.measureText(p.text).width }; });
    const ww = pieces.reduce((a, p) => a + p.w, 0);
    if (line.length && lw + space + ww > maxW) { lines.push(line); line = []; lw = 0; }
    line.push({ pieces, w: ww, hit: pieces.some(p => p.hit) });
    lw += (line.length > 1 ? space : 0) + ww;
  }
  if (line.length) lines.push(line);
  return { lines, space };
}

function wordMetrics(ctx, w, P, T, G, f, maxGlossW) {
  ctx.font = `400 ${P}px ${PALEO}`;
  const paleoParts = w.comps.filter(c => c.paleo).map(c => ({ ...c, w: ctx.measureText(c.paleo).width }));
  const paleoW = paleoParts.reduce((a, c) => a + c.w, 0);
  ctx.font = `700 ${T}px ${f}`;
  const tlParts = w.comps.filter(c => !c.isMark && c.translit).map(c => ({ ...c, w: ctx.measureText(c.translit).width }));
  const tlW = tlParts.reduce((a, c) => a + c.w, 0);
  ctx.font = `400 ${G}px ${f}`;
  const glossLines = w.gloss ? wrap(ctx, w.gloss, maxGlossW) : [];
  const glossW = Math.max(0, ...glossLines.map(l => ctx.measureText(l).width));
  const bw = Math.max(paleoW, tlW, glossW) + 18;
  const bh = P * 1.12 + T * 1.25 + glossLines.length * G * 1.25 + 14;
  return { paleoParts, paleoW, tlParts, tlW, glossLines, bw, bh };
}

function drawBack(ctx, th, f, d) {
  const W = CARD_W, H = CARD_H, L = 96, R = W - 96;
  paper(ctx, th, W, H);
  ctx.textBaseline = 'alphabetic';
  const v = d.verse;
  ctx.fillStyle = th.accent; ctx.font = `400 26px ${f}`;
  spaced(ctx, (v?.label || 'FIRST USAGE').toUpperCase(), L, 132, 26 * 0.3);
  ctx.fillStyle = th.ink; ctx.font = `600 72px ${f}`;
  ctx.fillText(v?.ref || '', L, 212);
  chip(ctx, th, v?.sn || d.sn, R, 206, 40, { align: 'right' });
  const stop = foot(ctx, th, W, H, f);
  if (!v) {
    ctx.fillStyle = th.faint; ctx.font = `400 34px ${f}`; ctx.fillText('No verse to show.', L, 320);
    return;
  }

  // the English (up to ~34% of the card)
  let y = 262;
  const runs = verseRuns(v.text || '', 'both');
  // light the hit pair: a root run the page's hit test accepts, and the gloss right after it
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].root && v.isHitWord && v.isHitWord(runs[i].text)) {
      runs[i].hit = true;
      for (let j = i + 1; j < runs.length && j <= i + 2; j++) { if (/^\s*\(/.test(runs[j].text) || /^[’'”"]+$/.test(runs[j].text)) runs[j].hit = true; else break; }
    }
  }
  const engRoom = Math.round((stop - y) * 0.38);
  let epx = 44, eng;
  for (; epx >= 22; epx -= 1) { eng = layoutEnglish(ctx, runs, epx, f, R - L); if (eng.lines.length * epx * 1.45 <= engRoom) break; }
  let ly = y + epx * 1.1;
  for (const line of eng.lines) {
    // one box around each run of hit words on the line (the pair "WaYaHaragahaw (and killed him)")
    { let x = L, runStart = null;
      const box = (a, b) => { roundRect(ctx, a - 7, ly - epx * 0.98, b - a + 14, epx * 1.32, 8);
        ctx.fillStyle = th.seal; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = th.accent; ctx.stroke(); };
      line.forEach((w, i) => {
        if (i) x += eng.space;
        if (w.hit && runStart == null) runStart = x;
        if (!w.hit && runStart != null) { box(runStart, x - eng.space); runStart = null; }
        x += w.w;
      });
      if (runStart != null) box(runStart, x);
    }
    let lx = L;
    line.forEach((w, i) => {
      if (i) lx += eng.space;
      for (const p of w.pieces) {
        ctx.font = `${p.root ? ROOT_WEIGHT : TEXT_WEIGHT} ${epx}px ${f}`;
        ctx.fillStyle = p.root ? th.root : th.soft;
        ctx.fillText(p.text, lx, ly); lx += p.w;
      }
    });
    ly += epx * 1.45;
  }
  y = ly + 6;
  ctx.fillStyle = th.rule; ctx.fillRect(L, y, R - L, 1.5);
  y += 30;

  // the Paleo word blocks, right to left; the largest size at which they all fit
  const words = v.words || [];
  const room = stop - y;
  let P = 92, plan = null;
  for (; P >= 30; P -= 4) {
    const T = Math.round(P * 0.36), G = Math.round(P * 0.3), gapX = Math.round(P * 0.34), gapY = Math.round(P * 0.3);
    const ms = words.map(w => wordMetrics(ctx, w, P, T, G, f, Math.round(P * 3.4)));
    const rows = []; let row = [], rw = 0;
    for (const m of ms) {
      const bw = Math.min(m.bw, R - L);
      if (row.length && rw + gapX + bw > R - L) { rows.push(row); row = []; rw = 0; }
      row.push(m); rw += (row.length > 1 ? gapX : 0) + bw;
    }
    if (row.length) rows.push(row);
    const total = rows.reduce((a, r) => a + Math.max(...r.map(m => m.bh)), 0) + gapY * Math.max(0, rows.length - 1);
    plan = { P, T, G, gapX, gapY, rows, ms };
    if (total <= room) break;
  }
  if (!plan) return;
  const { T, G, gapX, gapY, rows } = plan; P = plan.P;
  const gridH = rows.reduce((a, r) => a + Math.max(...r.map(m => m.bh)), 0) + gapY * Math.max(0, rows.length - 1);
  y += Math.max(0, (room - gridH) / 2);   // centred in the space left
  let wi = 0;
  for (const row of rows) {
    const rh = Math.max(...row.map(m => m.bh));
    let xr = R;   // right edge of the next block
    for (const m of row) {
      const w = words[wi++];
      const bw = Math.min(m.bw, R - L);
      const cx = xr - bw / 2;
      if (w.isHit) {
        roundRect(ctx, xr - bw - 4, y - 6, bw + 8, rh + 10, 12);
        ctx.fillStyle = th.seal; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = th.accent; ctx.stroke();
      }
      // letters, right to left, each morpheme in its own colour
      ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = 'right';
      let px = cx + m.paleoW / 2;
      for (const c of m.paleoParts) {
        ctx.font = `400 ${P}px ${PALEO}`; ctx.fillStyle = (w.isHit && c.hit) ? th.accent : (c.color || th.ink);
        ctx.fillText(c.paleo, px, y + P * 0.92); px -= c.w;
      }
      ctx.restore();
      // transliteration, left to right, same colours
      let tx = cx - m.tlW / 2;
      for (const c of m.tlParts) {
        ctx.font = `700 ${T}px ${f}`; ctx.fillStyle = c.color || th.ink;
        ctx.fillText(c.translit, tx, y + P * 1.12 + T); tx += c.w;
      }
      // gloss
      ctx.font = `400 ${G}px ${f}`; ctx.fillStyle = th.soft; ctx.textAlign = 'center';
      m.glossLines.forEach((gl, i) => ctx.fillText(gl, cx, y + P * 1.12 + T * 1.25 + G * (1.05 + i * 1.25)));
      ctx.textAlign = 'left';
      xr -= bw + gapX;
    }
    y += rh + gapY;
  }
}

/** drawRootCard(canvas, { side: 'front'|'back'|'both', theme, family, data }) */
export function drawRootCard(canvas, o) {
  const th = CARD_THEMES[o.theme] || CARD_THEMES.night;
  const f = o.family || "'Alegreya', Georgia, serif";
  const both = o.side === 'both';
  canvas.width = both ? CARD_W * 2 + GAP * 3 : CARD_W;
  canvas.height = both ? CARD_H + GAP * 2 : CARD_H;
  const ctx = canvas.getContext('2d');
  if (both) {
    ctx.fillStyle = o.theme === 'parchment' ? '#d9ccaf' : '#0b0906';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(GAP, GAP); drawFront(ctx, th, f, o.data); ctx.restore();
    ctx.save(); ctx.translate(GAP * 2 + CARD_W, GAP); drawBack(ctx, th, f, o.data); ctx.restore();
  } else if (o.side === 'back') drawBack(ctx, th, f, o.data);
  else drawFront(ctx, th, f, o.data);
}

export const rootCardFileName = (sn, side) => `${String(sn || 'root').toLowerCase()}-${side}-bldbible.png`;
