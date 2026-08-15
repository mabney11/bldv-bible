import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { apiBookOrder, apiTransChapter, apiTokens, apiSourceChapter, apiSourceVerse, apiBookSections } from '../lib/api.js';
import { buildBookSlugs, resolveBookParam, bookToParam } from '../lib/bookSlug.js';
import { usePageTitle, formatRef } from '../hooks/usePageTitle.js';
import { computeWordParts } from '../components/WordBlock.jsx';
import { transliterate } from '../lib/translit.js';
import { TYPEFACES } from '../lib/typefaces.js';
// Same morphology color system Parallel/HebrewViewer use (.mod-conj, .pfm-3ms,
// .root, …) — imported here so the Hebrew reading mode below colors each
// transliterated morpheme identically to the rest of the app.
import '../lib/morphColors.css';
// Reading typefaces. Self-hosted so they work offline and behind ngrok — no request to
// Google's CDN. Weights: 400 body, 600/700 for the chapter numeral and bar.
//
// THREE are packaged on npm — install once:
//   npm i @fontsource/alegreya @fontsource/ysabeau @fontsource/opendyslexic
//
// The other four (Cochineal, Antykwa Toruńska, Coelacanth, Kierkegaard) are TeX/OSP
// faces with no @fontsource package. They are declared as @font-face in Reader.css
// reading from /fonts/ — drop the .woff2 files there and they light up. Until then each
// one falls back to Alegreya, so the reader never breaks on a missing file.
import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/ysabeau/400.css';
import '@fontsource/ysabeau/600.css';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import './Reader.css';

/**
 * Reader — the "pretty" reading surface for the average reader.
 *
 * Purely text. It renders the SAME English that powers the rest of the app
 * (your saved translations, with the loaded baseline standing in for verses you
 * haven't touched yet) as clean, flowing scripture — no Strong's, no surf, no
 * gloss. Mobile-first, two themes (Parchment / Night), and it shares the app's
 * ?book=<slug>&chapter=&verse= URLs so you can hop to any other reader at the
 * exact same place.
 */
// FONT_MIN is deliberately very low (5px): some readers zoom the whole page and
// want the text small relative to it, and a few of these faces (OpenDyslexic,
// Verdana) run large for their em, so a floor of 15 was effectively ~17.
const FONT_MIN = 5, FONT_MAX = 32, FONT_DEFAULT = 20;

// ── Reading typefaces ────────────────────────────────────────────────────────
// Chosen for legibility rather than flavour. `id` is what we persist, so never
// rename one — add a new entry instead, or a saved preference silently falls back.
// Catalog itself lives in ../lib/typefaces.js (2026-08-15 extraction) so
// Parallel.jsx's English column can offer the exact same set of faces
// without a second hand-maintained copy — see that file's own comment for
// the per-face notes.
const TYPEFACE_DEFAULT = 'alegreya';
const TYPEFACE_KEY = 'reader-typeface';

// ── Gloss display mode ───────────────────────────────────────────────────────
// The baseline English carries "translit (gloss)" pairs — "yawam (days)". This lets a
// reader show both, the Hebrew alone, or the English alone, without touching the data:
// it's a pure display transform over the same text.
const GLOSS_MODES = [
  { id: 'both',   label: 'Both',         note: 'yawam (days)' },
  { id: 'hebrew', label: 'Hebrew only',  note: 'yawam' },
  { id: 'gloss',  label: 'English only', note: 'days' },
];
const GLOSS_DEFAULT = 'both';
const GLOSS_KEY = 'reader-gloss-mode';

// ── Script mode: English prose vs. plain transliterated source text ────────
// "English" is the reader as it's always worked — the saved English
// translation. "Hebrew" reads the verse in actual Hebrew word order, straight
// from the same token stream (components[]: css class + translit + gloss)
// that powers the Parallel viewer — BHS (Masoretic OT) or HEB (NT, Jasher,
// and any further Hebrew source ingested under that table). "Ge'ez" does the
// same for the Ethiopic source, transliterated client-side (translit.js) —
// that source has no Strong's/morphology breakdown, so there's no per-
// morpheme color coding there, just the plain transliteration and its gloss.
// Either non-English mode simply isn't offered for a book with no matching
// source — "for the texts that have it".
const SCRIPT_MODES = [
  { id: 'english', label: 'English', note: 'who doesn’t halak (move)' },
  { id: 'hebrew',  label: 'Hebrew',  note: 'Asharay HaAyash…' },
  { id: 'geez',    label: 'Ge’ez',   note: 'transliterated Ethiopic' },
];
const SCRIPT_DEFAULT = 'english';
const SCRIPT_KEY = 'reader-script';

// Gloss toggle for the two non-English scripts. Simpler than GLOSS_MODES
// above — there's no "English only" here (that's just the English script) —
// so it's the two ends of the same idea: bare transliteration, or
// transliteration + gloss. Same ids or both scripts (the persisted choice
// carries over between them); only the label/note text differs.
const HEB_GLOSS_MODES = [
  { id: 'translit', label: 'All Hebrew',   note: 'Asharay HaAyash' },
  { id: 'glossed',  label: 'With glosses', note: 'Asharay (who/that)' },
];
const GEEZ_GLOSS_MODES = [
  { id: 'translit', label: 'All Ge’ez',    note: 'Bagize Fatara' },
  { id: 'glossed',  label: 'With glosses', note: 'Bagize (in-beginning)' },
];
const HEB_GLOSS_DEFAULT = 'glossed';
const HEB_GLOSS_KEY = 'reader-heb-gloss-mode';

// ── Verse-number click behavior ─────────────────────────────────────────────
// "Multi": every tap adds to the set of lit verses (the original behavior — any
// number can be lit at once, independent of each other).
// "Single": tapping a verse replaces the whole set with just that one — tap v3,
// then v4, and by the end only v4 is lit. Tapping the already-lit verse clears
// it (same "clearing works the same" behavior in both modes).
const MARK_MODES = [
  { id: 'multi',  label: 'Multi',  note: 'each tap adds a highlight' },
  { id: 'single', label: 'Single', note: 'only the last tap stays lit' },
];
const MARK_MODE_DEFAULT = 'multi';
const MARK_MODE_KEY = 'reader-mark-mode';
// Traditional Ancient Hebrew pictographic sense of each root letter — shown next to
// the acrostic stanza heading (Psalm 119, 25, 34, 37, 111, 112, 145, Lamentations
// 1-4, Proverbs 31) so the letter isn't just a label but carries its picture, e.g.
// "𐤀 – Alap (strength)". Keyed by the paleo glyph headings.json already sends.
const LETTER_MEANING = {
  '𐤀': 'strength', '𐤁': 'house',   '𐤂': 'camel',   '𐤃': 'door',
  '𐤄': 'behold',   '𐤅': 'nail',    '𐤆': 'weapon',  '𐤇': 'fence',
  '𐤈': 'surround', '𐤉': 'hand',    '𐤊': 'palm',    '𐤋': 'goad',
  '𐤌': 'water',    '𐤍': 'fish',    '𐤎': 'support', '𐤏': 'eye',
  '𐤐': 'mouth',    '𐤑': 'harvest', '𐤒': 'horizon', '𐤓': 'head',
  '𐤔': 'teeth',    '𐤕': 'sign',
};
// The baseline English occasionally carries a raw Hebrew maqaf (\u05BE, U+05BE) \u2014
// the source text's word-joining hyphen \u2014 left over from how the baseline was
// generated. Reading faces (Alegreya, Ysabeau, \u2026) have no glyph for it, so the
// browser falls back to a system/historic face that draws it as a wildly
// oversized dash (the "long line" that isn't a period or a maqaf at all
// visually \u2014 just a missing-glyph fallback). Normalize every occurrence to an
// ordinary period, glued straight onto the preceding word with no leading
// space \u2014 the same "end sentences with punctuation, right at the end of the
// last word" treatment as every other full stop in the text.
const MAQAF_RE = /\s*\u05BE\s*/g;
// A manually-typed/pasted verse can carry non-breaking spaces and other
// look-alike Unicode whitespace (from a word processor, or the Studio's
// rich-text editor inserting &nbsp; between words) instead of an ordinary
// space. Browsers treat those as NOT a valid line-break point, so a stretch
// of them reads as one unbreakable "word" and can run the whole rest of a
// sentence off the edge of the page (see also the CSS `overflow-wrap` safety
// net on .rd-body, which is the hard backstop \u2014 this fixes it at the text
// level too, so the line wraps at an actual word boundary instead of an
// arbitrary mid-word point).
const ODD_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g;
const sanitizeText = (s) => (s || '').replace(MAQAF_RE, '.').replace(ODD_SPACE_RE, ' ');

// A transliterated head word followed by its parenthetical gloss. Accents allowed;
// nested parens deliberately excluded so an ordinary "(see note)" aside is left alone.
const GLOSS_RE = /([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'\u2019-]*)([\u2018\u2019\u201C\u201D"']*)\s+\(([^()]*)\)/g;
const applyGlossMode = (t, mode) => (!t || mode === 'both') ? t
  : t.replace(GLOSS_RE, (_m, heb, quote, gloss) => (mode === 'hebrew' ? heb + quote : (gloss.trim() || heb)));
// Same "term (gloss)" pairs as applyGlossMode, but returns React nodes instead of a
// string so the transliterated Hebrew/Aramaic root can be wrapped in its own span
// (.rd-root) and stand out from the English gloss beside it. 'gloss' mode has no root
// left on screen, so it stays a plain string — nothing to highlight.
function renderVerseNodes(t, mode) {
  if (!t) return t;
  if (mode === 'gloss') return applyGlossMode(t, mode);
  const nodes = [];
  let last = 0, key = 0, m;
  GLOSS_RE.lastIndex = 0;
  while ((m = GLOSS_RE.exec(t))) {
    const [full, heb, quote, gloss] = m;
    if (m.index > last) nodes.push(t.slice(last, m.index));
    nodes.push(<span className="rd-root" key={key++}>{heb}</span>);
    if (quote) nodes.push(quote);
    if (mode === 'both' && gloss.trim()) nodes.push(` (${gloss.trim()})`);
    last = m.index + full.length;
  }
  nodes.push(t.slice(last));
  return nodes;
}
// ── Embedded scripture quotations (Pistis Sophia and similar apocryphal/
// Gnostic works) ─────────────────────────────────────────────────────────
// These texts frequently quote an Old Testament passage mid-paragraph and
// keep the QUOTED passage's OWN verse numbers rather than this app's, e.g.
// Pistis Sophia II 1 quoting Psalm 85:10-11:
//   ..."'10. Grace and truth met together...' "'11. Truth hath sprouted...'"
// ingest-gnostic-priority.py already merges these into one app paragraph
// instead of fabricating extra app verse numbers for each quoted line (no
// invented numbering) — but left as plain prose, the quotation's own numbers
// read as clutter in the middle of the narrative. Detect the run and render
// it as its own indented block, with each embedded number as its own small
// badge (echoing .rd-vnum's treatment, dimmer so it never reads as one of
// THIS book's own verse numbers).
const QUOTE_MARK_RE = /(["'‘’“”]{1,2})(\d{1,3})\.\s+/g;
const QUOTE_CLOSE_RE = /\.\s*["'‘’“”]{1,2}(?=\s|$)/g;
function splitScriptureQuote(raw) {
  if (!raw || typeof raw !== 'string') return null;
  QUOTE_MARK_RE.lastIndex = 0;
  const marks = [];
  let m;
  while ((m = QUOTE_MARK_RE.exec(raw))) marks.push(m);
  if (!marks.length) return null;
  const first = marks[0];
  const last = marks[marks.length - 1];
  const lastMarkEnd = last.index + last[0].length;
  QUOTE_CLOSE_RE.lastIndex = lastMarkEnd;
  const close = QUOTE_CLOSE_RE.exec(raw);
  const quoteEnd = close ? close.index + close[0].length : raw.length;
  const lines = marks.map((mm, i) => {
    const start = mm.index + mm[0].length;
    const end = (i + 1 < marks.length) ? marks[i + 1].index : quoteEnd;
    return { num: mm[2], text: raw.slice(start, end).trim() };
  }).filter(l => l.text);
  if (!lines.length) return null;
  // The last line's own text runs up through the quotation's closing marks
  // (".'\"" etc, matched by QUOTE_CLOSE_RE above) — strip the trailing quote
  // character(s) so the visible sentence ends cleanly at its period; the
  // blockquote styling itself already signals "this is a quotation," so a
  // literal closing quote mark baked into the text is redundant clutter.
  const lastLine = lines[lines.length - 1];
  lastLine.text = lastLine.text.replace(/["'‘’“”]{1,2}$/, '').trim();
  return { before: raw.slice(0, first.index), lines, after: raw.slice(quoteEnd) };
}

// Renders a detected embedded quotation as its own block; `mode` is the
// same glossMode used for the surrounding prose so gloss display stays
// consistent between the narrative and the quoted passage. `citation`
// (optional, from server/public/scripture-citations.json — see the fetch in
// Reader()) points it back at the canonical passage it quotes: the whole
// block becomes a link, and hovering shows the reference. The link carries
// &verseEnd= alongside the usual &verse= so the destination page can
// highlight the FULL cited range (Psalm 85:10 AND :11), not just the first
// verse — see the verse-range highlight effect in Reader() for the landing
// side of this.
function renderScriptureQuote(q, mode, key, citation, idToSlug) {
  const body = (
    <>
      {q.lines.map((l, i) => (
        <p className="rd-squote-line" key={i}>
          <sup className="rd-squote-num">{l.num}</sup>
          {renderVerseNodes(l.text, mode)}
        </p>
      ))}
      {citation && <span className="rd-squote-ref">{citation.label}</span>}
    </>
  );
  if (!citation) {
    return <blockquote className="rd-squote" key={key}>{body}</blockquote>;
  }
  const to = `/?book=${bookToParam(citation.book, idToSlug)}&chapter=${citation.chapter}` +
             `&verse=${citation.verseStart}${citation.verseEnd ? `&verseEnd=${citation.verseEnd}` : ''}`;
  return (
    <Link to={to} className="rd-squote rd-squote-link" key={key} title={`Open ${citation.label}`}>
      {body}
    </Link>
  );
}

const idOf = m => m.id ?? m.book_id ?? m.canon_id;

// Splits a verse's rendered content into "its first word/token" and "the rest",
// so the verse number can be glued (via CSS white-space:nowrap, see .rd-vnum-glue
// in Reader.css) to the piece it actually numbers instead of the browser being
// free to break the line right after the number and leave it dangling at the
// end of the PREVIOUS verse's line. Handles all three shapes `text` can be:
// a node array (renderVerseNodes/renderHebrewProseNodes/renderHebrewWordCells),
// a plain string (English-only gloss mode collapses to one string), or the '·'
// empty-verse placeholder.
function splitFirstToken(t) {
  if (Array.isArray(t)) {
    if (!t.length) return { first: null, rest: [] };
    const [head, ...tail] = t;
    // A leading STRING element (the shape renderVerseNodes produces for
    // English prose: text is only split at gloss-pair MATCHES, not per word)
    // can be many words long whenever the verse's first gloss pair sits well
    // into the sentence — e.g. "And Alahayam called the light … Evening came
    // and morning came — " was ALL one array element ahead of the one match,
    // "achad (one)". Gluing that whole run into the nowrap number span (see
    // .rd-vnum-glue below) ran the entire sentence off the edge of the page
    // with no wrap opportunity at all. Only that chunk's own FIRST WORD may
    // be glued to the verse number; the remainder of the chunk goes back
    // in front of the tail so it flows and wraps normally like everything
    // else. A non-string head (a Hebrew word-cell node, one cell per array
    // element) already IS a single token — glue it whole, as before.
    if (typeof head === 'string') {
      const m = head.match(/^(\S*)(\s*)([\s\S]*)$/);
      const restOfHead = m ? m[2] + m[3] : '';
      return { first: m ? m[1] : head, rest: restOfHead ? [restOfHead, ...tail] : tail };
    }
    return { first: head, rest: tail };
  }
  if (typeof t === 'string') {
    const m = t.match(/^(\S*)(\s*)([\s\S]*)$/);
    if (m) return { first: m[1], rest: m[2] + m[3] };
    return { first: t, rest: '' };
  }
  return { first: t, rest: null };
}

// "All Hebrew" — flowing prose, no gloss. Reuses computeWordParts (the exact
// per-component breakdown Parallel/WordBlock use) so every morpheme's color
// matches the rest of the app; a word's components are joined with no space
// (they spell one word — "Ha" + "Ayash" -> "HaAyash") and every word gets the
// SAME weight (.hw-word), so e.g. "Ba"+"Raashayath" reads as one uniform word
// rather than a bold root stitched to a lighter-weight prefix.
function renderHebrewProseNodes(words) {
  const nodes = [];
  let key = 0;
  (words || []).forEach((word) => {
    const parts = computeWordParts(word);
    parts.transliterations.forEach((t) => {
      nodes.push(
        <span key={key++} className={`hw hw-word ${t.css}`} data-alt={t.altAttr || undefined}>{t.text}</span>
      );
    });
    nodes.push(' ');
  });
  return nodes;
}

// "With glosses" — one cell per word, laid out the way the Hebrew Viewer's
// WordBlock does: the transliteration on top, its gloss directly BELOW it in
// visible parens, so which gloss belongs to which word is never ambiguous.
// Unlike WordBlock/Parallel this still reads left-to-right, word 1 → word N
// (no RTL flip) — cells are inline-flex, so the browser wraps them exactly
// like words in running text; it just reads as a novel with a caption under
// each word instead of the caption folded into the sentence.
//
// A word whose LAST component is a maqaf (isMaqaf — server.js flushes a fresh
// word block right after one, so it's always the final component when present)
// is typographically glued to the word that follows it ("Kal-Iwalah" is one
// prosodic unit). Left alone, two separate wrapping cells can end up split
// across a line break — the dash stranded at the end of one line, its partner
// starting the next. Those two cells are grouped into one `.hwc-maqaf-pair`
// (display:inline-flex, so it can never wrap internally) instead.
const endsWithMaqaf = (word) => {
  const comps = word?.components || [];
  const last = comps[comps.length - 1];
  return !!(last && last.isMaqaf);
};

// A maqaf baked WITHIN this single word's own components — a two-part
// construct chain sharing one token, e.g. Genesis 1:11's עַל־הָאָרֶץ ("Il" +
// maqaf + "HaAratz") — is a DIFFERENT case from endsWithMaqaf above (a maqaf
// trailing off to a wholly separate next word/token). Left undetected, the
// two halves fell through to computeWordParts() unsplit and rendered as one
// unbroken run ("IlHaAratz") with no sign a maqaf ever separated them.
// Mirrors components/WordBlock.jsx's own maqafSplit exactly: split on every
// isMaqaf component, and only treat it as a genuine compound when EVERY
// resulting half has real (non-mark) content — a maqaf with nothing on one
// side is an ordinary trailing mark, not a baked-in compound.
const internalMaqafSplit = (word) => {
  const comps = word?.components || [];
  if (!comps.some(c => c && c.isMaqaf)) return null;
  const segs = [[]];
  for (const c of comps) {
    if (c && c.isMaqaf) { segs.push([]); continue; }
    segs[segs.length - 1].push(c);
  }
  return segs.some(s => s.length === 0) ? null : segs;
};

// Divine names/titles — surfaced systematically by Strong's number, not
// hand-picked per word, so every occurrence gets its paleo spelling
// regardless of which epithet the curated gloss happens to use that day
// (the user's own complaint: "I don't want to have to stumble across a name
// that doesn't also show the hebrew"):
//   H410  El         H426  Elah (Aramaic)   H430  Elohim   H433  Eloah
//   H3050 Yah        H3068 YHWH             H3069 YHWH (Adonai-vocalized)
//   H136  Adonai     H7706 Shaddai          H5945 Elyon
// H113 (adown, "lord/master") is deliberately excluded — it's the ordinary
// word for a human master/sir, not a divine title, and tagging it would
// paleo-prefix every "my lord" a servant says to a person.
const DIVINE_SN = new Set(['H410', 'H426', 'H430', 'H433', 'H3050', 'H3068', 'H3069', 'H136', 'H7706', 'H5945']);
const normSN = (s) => (s ? 'H' + String(s).replace(/^H+/i, '') : null);

// The component that HEADS a word block — same rule computeWordParts uses to
// decide what a gloss is "about": a root-class component, or (when the block
// has none — a bare proper noun) the mod-nmpr component promoted to head.
function headComponent(word) {
  const comps = word?.components || [];
  const root = comps.find(c => c && c.css === 'root');
  if (root) return root;
  return comps.find(c => c && c.css === 'mod-nmpr') || null;
}

// If this word's head component is a divine title, its (server-resolved,
// canonical) paleo spelling — else null.
function divinePaleo(word) {
  const comp = headComponent(word);
  if (!comp) return null;
  const sn = normSN(comp.sn || word?.strongs);
  return sn && DIVINE_SN.has(sn) ? comp.paleo : null;
}

function renderHebrewWordCells(words) {
  const list = words || [];
  let key = 0;
  const buildCell = (word) => {
    const parts = computeWordParts(word);
    if (!parts.transliterations.length) return null;
    const hasGloss = parts.rootTrans.length > 0 || parts.modTrans.length > 0;
    const divine = divinePaleo(word);
    return (
      <span className="hwc" key={key++}>
        <span className="hwc-word">
          {parts.transliterations.map((t, ti) => (
            <span key={ti} className={`hw hw-word ${t.css}`} data-alt={t.altAttr || undefined}>{t.text}</span>
          ))}
        </span>
        {/* Always rendered, even with nothing to show — every cell reserves the
            same gloss-line height so a row of words with mixed gloss coverage
            still lines up cell to cell instead of the "expects a gloss" ones
            standing taller than their gloss-less neighbors. */}
        <span className="hwc-gloss">
          {(hasGloss || divine) ? (
            <>
              <span className="brk">(</span>
              {divine && <span className="hw-divine" dir="rtl">{divine}</span>}
              {divine && hasGloss && ' '}
              {parts.rootTrans.map((r, ri) => <span key={`r${ri}`} className="hw root">{spaceGloss(r.clean)}</span>)}
              {parts.modTrans.length > 0 && (
                <>
                  {parts.rootTrans.length > 0 && ' '}
                  <span className="brk">[</span>
                  {parts.modTrans.map((m, mi) => (
                    <span key={`m${mi}`}>
                      {mi > 0 && <span className="brk">-</span>}
                      <span className={`hw ${m.css}`} data-alt={m.altAttr || undefined}>{spaceGloss(m.clean)}</span>
                    </span>
                  ))}
                  <span className="brk">]</span>
                </>
              )}
              <span className="brk">)</span>
            </>
          ) : (
            <span className="hw-src-fallback" dir="rtl">{parts.purePaleo}</span>
 )}
        </span>
      </span>
    );
  };

  const out = [];
  for (let i = 0; i < list.length; i++) {
    const word = list[i];

    const split = internalMaqafSplit(word);
    if (split) {
      const cells = split.map(seg => buildCell({ components: seg })).filter(Boolean);
      if (cells.length >= 2) {
        out.push(
          <span className="hwc-maqaf-pair" key={key++}>
            {cells.flatMap((c, ci) => ci > 0
              ? [<span key={`d${ci}`} className="hwc-maqaf-dash" aria-hidden="true">-</span>, c]
              : [c])}
          </span>
        );
        continue;
      }
      // Fell through (e.g. a half produced no transliterations at all) —
      // treat it as an ordinary word below rather than dropping it silently.
    }

    const cell = buildCell(word);
    if (!cell) continue;
    if (endsWithMaqaf(word) && i + 1 < list.length) {
      const nextCell = buildCell(list[i + 1]);
      i++;   // the next word is consumed into this pair
      // The maqaf itself (e.g. Genesis 1:8's way'hi-erev) is real punctuation
      // computeWordParts() deliberately pulls OUT of the word's own glyph/
      // translit row (see its `trailingMark` comment — an inline mark there
      // would drag the real letters off-center from their gloss line below).
      // That's correct for the glyph row, but this cell format has no OTHER
      // place the connector gets drawn, so without it the pair just reads as
      // two unrelated words with a plain space — the coupling the Hebrew
      // itself shows is silently lost. Render it explicitly here instead.
      out.push(
        <span className="hwc-maqaf-pair" key={key++}>
          {cell}<span className="hwc-maqaf-dash" aria-hidden="true">-</span>{nextCell}
        </span>
      );
    } else {
      out.push(cell);
    }
  }
  return out;
}

// ── Ge'ez ("plain" source: word + gloss, no Strong's/morphology breakdown) ──
// Same two render shapes as Hebrew (flowing prose vs. word cells), but there
// are no components to color-code — Ge'ez tokens aren't tagged the way BHS/
// HEB are — so this is just the transliteration (via translit.js, client-
// side, same table the rest of the app uses for Ethiopic) and its gloss, in
// the reader's plain ink color. `.hw-word` still applies (bold, uniform
// size), it just never picks up a morphology `--mc` tint since no morphology
// class is present.
// Lexicon entries write alternatives as "righteous/just/fair" with no space
// around the slash — fine for the Parallel viewer's single-line gloss, but
// in a width-bound word cell it leaves the wrapper no break opportunity
// except mid-word (the "righteou / s" fragmenting the user flagged). Rather
// than asking for a lexicon-wide edit, normalize the spacing at render time:
// "a/b/c", "a /b/ c", etc. all become "a / b / c" — a real space either side
// of every slash, which both reads better and gives the browser a proper
// place to wrap between alternatives instead of splitting a word in half.
const spaceGloss = s => (s || '').replace(/\s*\/\s*/g, ' / ');

const cleanGloss = g => spaceGloss((g || '').replace(/[[\]]/g, '').trim());

function renderPlainProseNodes(words) {
  const nodes = [];
  let key = 0;
  (words || []).forEach((w) => {
    const t = transliterate(w.word || '', { script: 'ethiopic' });
    if (!t) return;
    nodes.push(<span key={key++} className="hw-word">{t}</span>, ' ');
  });
  return nodes;
}

function renderPlainWordCells(words) {
  let key = 0;
  return (words || []).map((w) => {
    const t = transliterate(w.word || '', { script: 'ethiopic' });
    if (!t) return null;
    const gloss = cleanGloss(w.gloss);
    return (
      <span className="hwc" key={key++}>
        <span className="hwc-word"><span className="hw-word">{t}</span></span>
        {/* Always rendered (see the matching Hebrew comment above) so every
            word's cell reserves the same gloss-line height, whether or not
            this particular token happens to have gloss data. */}
        <span className="hwc-gloss">
          {gloss
            ? (<><span className="brk">(</span>{gloss}<span className="brk">)</span></>)
            : <span className="hw-geez-fallback">{w.word}</span>}
        </span>
      </span>
    );
  });
}

export default function Reader() {
  const [sp, setSp] = useSearchParams();
  const { theme, toggle: toggleTheme } = useTheme();

  // ── books / slug map ───────────────────────────────────────────────────────
  const [masterBooks, setMasterBooks] = useState([]);
  useEffect(() => { apiBookOrder().then(b => setMasterBooks(b || [])).catch(() => setMasterBooks([])); }, []);

  const { slugToId, idToSlug } = useMemo(
    () => buildBookSlugs((masterBooks || []).map(mb => ({ id: idOf(mb), name: mb.name }))),
    [masterBooks]
  );

  const bookParam  = sp.get('book');
  const book       = resolveBookParam(bookParam, slugToId, 1);
  const chapter    = parseInt(sp.get('chapter') || '1', 10);
  const verseParam = sp.get('verse');
  const verse      = verseParam ? parseInt(verseParam, 10) : null;
  // Optional companion to ?verse= — set by a citation link from an embedded
  // scripture quotation (see renderScriptureQuote) that cites a RANGE, not a
  // single verse (Psalm 85:10-11). When present, the scroll/highlight effect
  // below lights up every verse from `verse` through `verseEnd`, not just the
  // first one.
  const verseEndParam = sp.get('verseEnd');
  const verseEnd = verseEndParam ? parseInt(verseEndParam, 10) : null;
  // A slug URL resolves only once the map has loaded — until then, don't act on
  // the Genesis fallback (mirrors the other readers).
  const bookReady  = !bookParam || /^\d+$/.test(bookParam) || Object.keys(slugToId).length > 0;

  const booksOrdered = masterBooks;
  const bookIndex = useMemo(() => booksOrdered.findIndex(m => idOf(m) === book), [booksOrdered, book]);
  const meta      = booksOrdered[bookIndex] || null;
  const bookName  = meta?.name || `Book ${book}`;
  // Every other plural-looking book name ("Chronicles", "Kings"...) still refers to
  // the whole book when paired with a chapter number ("2 Kings 4"). Psalms is the
  // one exception in ordinary English usage — a single chapter IS "a psalm" — so a
  // chapter reference reads "Psalm 119", not "Psalms 119". Book-level labels (the
  // nav sheet's book row, its "— chapters" heading) keep the plural "Psalms" since
  // that's the book's actual name; this is only for text that pairs the name with
  // a specific chapter.
  const chapterBookName = bookName === 'Psalms' ? 'Psalm' : bookName;
  const firstCh   = meta?.first || 1;
  const lastCh    = meta?.last  || chapter;

  // ── chapter text ───────────────────────────────────────────────────────────
  const [verses, setVerses]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [chapKey, setChapKey] = useState('');   // drives the fade-in on chapter change

  useEffect(() => {
    if (!bookReady) return;
    let cancelled = false;
    setLoading(true);
    apiTransChapter(book, chapter)
      .then(d => { if (cancelled) return; setVerses((d && d.verses) || []); setLoading(false); setChapKey(`${book}-${chapter}-${Date.now()}`); })
      .catch(() => { if (cancelled) return; setVerses([]); setLoading(false); });
    return () => { cancelled = true; };
  }, [book, chapter, bookReady]);

  // ── font size (persisted) ──────────────────────────────────────────────────
  const [fontPx, setFontPx] = useState(() => {
    const v = parseInt(localStorage.getItem('reader-font') || '', 10);
    return (v >= FONT_MIN && v <= FONT_MAX) ? v : FONT_DEFAULT;
  });
  useEffect(() => { localStorage.setItem('reader-font', String(fontPx)); }, [fontPx]);

  // ── typeface (persisted) ───────────────────────────────────────────────────
  // Sticky by design: once chosen it survives reloads, chapter changes and
  // navigation, and only ever changes when the reader picks a different face.
  // Validated against the catalogue so a stale/hand-edited value can't wedge the
  // reader into an unusable font — an unknown id falls back to the default.
  const [typeface, setTypeface] = useState(() => {
    try {
      const saved = localStorage.getItem(TYPEFACE_KEY);
      return TYPEFACES.some(f => f.id === saved) ? saved : TYPEFACE_DEFAULT;
    } catch { return TYPEFACE_DEFAULT; }   // private mode / storage disabled
  });
  useEffect(() => {
    try { localStorage.setItem(TYPEFACE_KEY, typeface); } catch { /* non-fatal */ }
  }, [typeface]);
  const typefaceStack = useMemo(
    () => (TYPEFACES.find(f => f.id === typeface) || TYPEFACES[0]).stack,
    [typeface]
  );

  // ── browser tab ────────────────────────────────────────────────────────────
  // Reference first ("Genesis 1 | Reader", 2026-08-15 — see
  // hooks/usePageTitle.js). An empty chapter is flagged in the tab too, so a
  // book that isn't translated is obvious without opening it.
  const readerRef = bookReady && meta ? formatRef(chapterBookName, chapter, verse) : '';
  const readerNote = (!loading && verses.length === 0) ? ' · not translated' : '';
  usePageTitle(readerRef ? `${readerRef}${readerNote} | Reader` : '');

  // ── gloss display mode (persisted) ─────────────────────────────────────────
  // both | hebrew | gloss. Validated the same way as the typeface, so a stale value
  // can't wedge the reader into a mode that no longer exists.
  const [glossMode, setGlossMode] = useState(() => {
    try {
      const saved = localStorage.getItem(GLOSS_KEY);
      return GLOSS_MODES.some(m => m.id === saved) ? saved : GLOSS_DEFAULT;
    } catch { return GLOSS_DEFAULT; }
  });
  useEffect(() => {
    try { localStorage.setItem(GLOSS_KEY, glossMode); } catch { /* non-fatal */ }
  }, [glossMode]);

  // ── verse-number click mode (persisted) ─────────────────────────────────────
  // multi | single. Validated the same way as gloss mode / typeface.
  const [markMode, setMarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem(MARK_MODE_KEY);
      return MARK_MODES.some(m => m.id === saved) ? saved : MARK_MODE_DEFAULT;
    } catch { return MARK_MODE_DEFAULT; }
  });
  useEffect(() => {
    try { localStorage.setItem(MARK_MODE_KEY, markMode); } catch { /* non-fatal */ }
  }, [markMode]);

  // ── script mode (persisted + shareable via ?script=) ───────────────────────
  // The URL is checked FIRST, once, on mount — a link with ?script=hebrew opens
  // straight into that mode, so you can send someone straight to the English or
  // the Hebrew. Absent that, fall back to whatever this browser had saved.
  // Every change writes BOTH: localStorage (so the next visit with no ?script=
  // remembers it) and the URL (so the current tab's address bar always reflects
  // the mode you're actually reading in, and can be copied/shared as-is).
  const [script, setScript] = useState(() => {
    const urlScript = sp.get('script');
    if (SCRIPT_MODES.some(m => m.id === urlScript)) return urlScript;
    try {
      const saved = localStorage.getItem(SCRIPT_KEY);
      return SCRIPT_MODES.some(m => m.id === saved) ? saved : SCRIPT_DEFAULT;
    } catch { return SCRIPT_DEFAULT; }
  });
  useEffect(() => {
    try { localStorage.setItem(SCRIPT_KEY, script); } catch { /* non-fatal */ }
  }, [script]);
  useEffect(() => {
    setSp(prev => {
      if (prev.get('script') === script) return prev;
      const p = new URLSearchParams(prev);
      p.set('script', script);
      return p;
    }, { replace: true });
  }, [script, setSp]);

  // ── Hebrew-mode gloss toggle (persisted) — All Hebrew | With glosses ──────
  const [hebGlossMode, setHebGlossMode] = useState(() => {
    try {
      const saved = localStorage.getItem(HEB_GLOSS_KEY);
      return HEB_GLOSS_MODES.some(m => m.id === saved) ? saved : HEB_GLOSS_DEFAULT;
    } catch { return HEB_GLOSS_DEFAULT; }
  });
  useEffect(() => {
    try { localStorage.setItem(HEB_GLOSS_KEY, hebGlossMode); } catch { /* non-fatal */ }
  }, [hebGlossMode]);

  // ── Hebrew token stream — fetched only once the Hebrew script is selected,
  // so a reader who never touches it costs nothing extra. `hebTried` tells the
  // render below "the fetch for THIS book/chapter has settled" so it can tell
  // a genuinely Hebrew-less book apart from still-loading.
  //
  // Two source tables carry Hebrew tokens (same split Parallel uses): BHS is
  // the Masoretic OT; HEB is "everything else with a Hebrew/Strong's token
  // stream" — the NT, Jasher, and any further Hebrew source ingested under
  // that table. Try BHS first (the common case); if a book has nothing there
  // (a 404, or a 200 with zero tokens), fall back to HEB before giving up, so
  // Matthew/Jasher/future non-Masoretic ingests light up here too instead of
  // only in the Parallel viewer.
  const [hebWords, setHebWords] = useState([]);
  const [hebLoading, setHebLoading] = useState(false);
  const [hebTried, setHebTried] = useState(false);
  useEffect(() => {
    // Also probes while still on 'english' once the English baseline has come
    // back empty — the auto-language-fallback effect below needs to know
    // whether Hebrew has this passage BEFORE dead-ending the reader on "not
    // translated". Once the English chapter fetch is still in flight this is
    // simply skipped (nothing to react to yet).
    const need = script === 'hebrew' || (script === 'english' && !loading && verses.length === 0);
    if (!need || !bookReady) return;
    let cancelled = false;
    setHebLoading(true);
    setHebTried(false);
    const asWords = d => Array.isArray(d) ? d : (d?.tokens || d?.words || d?.rows || []);
    apiTokens(book, chapter, 'BHS')
      .then(asWords)
      .catch(() => [])
      .then(words => (words.length ? words : apiTokens(book, chapter, 'HEB').then(asWords).catch(() => [])))
      .then(words => { if (!cancelled) setHebWords(words); })
      .finally(() => { if (!cancelled) { setHebLoading(false); setHebTried(true); } });
    return () => { cancelled = true; };
  }, [script, book, chapter, bookReady, loading, verses.length]);

  const hebWordsByVerse = useMemo(() => {
    const m = {};
    (hebWords || []).forEach(w => (m[w.verse] || (m[w.verse] = [])).push(w));
    return m;
  }, [hebWords]);
  const hebUnavailable = script === 'hebrew' && hebTried && !hebLoading && Object.keys(hebWordsByVerse).length === 0;

  // ── Ge'ez token stream — same lazy, fetch-once-selected pattern as Hebrew.
  // The Ge'ez source has no Strong's-tagged token table, so it's read the way
  // Parallel reads any "plain" source: /api/source/GEZ/chapter, using its
  // embedded per-verse tokens if present, otherwise one /api/source/GEZ/verse
  // fetch per verse — the exact fallback Parallel.jsx's loadChapter uses for
  // this same source, so it never drifts from what's already proven to work.
  const [gzWords, setGzWords] = useState([]);
  const [gzLoading, setGzLoading] = useState(false);
  const [gzTried, setGzTried] = useState(false);
  useEffect(() => {
    // Same broadened trigger as the Hebrew probe above — also checked while
    // still on 'english' with an empty baseline, so the auto-fallback effect
    // has an answer from Ge'ez too, not just Hebrew.
    const need = script === 'geez' || (script === 'english' && !loading && verses.length === 0);
    if (!need || !bookReady) return;
    let cancelled = false;
    setGzLoading(true);
    setGzTried(false);
    apiSourceChapter('GEZ', { book }, chapter)
      .then(async (chapData) => {
        const verses = Array.isArray(chapData?.verses) ? chapData.verses : [];
        const out = [];
        if (verses.some(v => Array.isArray(v.tokens))) {
          verses.forEach(v => (v.tokens || []).forEach((t, i) => out.push({
            verse: v.verse, token_ordinal: t.ord ?? (i + 1), word: t.word ?? '', gloss: t.gloss || '',
          })));
        } else if (verses.length) {
          await Promise.all(verses.map(vs =>
            apiSourceVerse('GEZ', { book }, chapter, vs.verse)
              .then(sv => (sv?.tokens || []).forEach((t, i) => out.push({
                verse: vs.verse, token_ordinal: t.ord ?? (i + 1), word: t.word ?? '', gloss: t.gloss || '',
              })))
              .catch(() => {})
          ));
        }
        out.sort((a, z) => a.verse - z.verse || a.token_ordinal - z.token_ordinal);
        return out;
      })
      .catch(() => [])
      .then(words => { if (!cancelled) setGzWords(words); })
      .finally(() => { if (!cancelled) { setGzLoading(false); setGzTried(true); } });
    return () => { cancelled = true; };
  }, [script, book, chapter, bookReady, loading, verses.length]);

  const gzWordsByVerse = useMemo(() => {
    const m = {};
    (gzWords || []).forEach(w => (m[w.verse] || (m[w.verse] = [])).push(w));
    return m;
  }, [gzWords]);
  const gzUnavailable = script === 'geez' && gzTried && !gzLoading && Object.keys(gzWordsByVerse).length === 0;

  // ── auto language fallback ──────────────────────────────────────────────────
  // A book/chapter with no English translation used to dead-end the reader —
  // "not translated" — even when the passage plainly exists in Hebrew or
  // Ge'ez (e.g. Psalm 151/154, translated nowhere in English yet but present
  // in the source). Rather than force a trip out to the Parallel Viewer, walk
  // English -> Hebrew -> Ge'ez once each has settled and land on whichever
  // one actually has this passage. Only ever acts while still on the default
  // 'english' script with genuinely nothing to show — it never overrides a
  // script you picked yourself (Hebrew/Ge'ez's own "no source text" state
  // already offers a manual "Read in English" button for that direction).
  useEffect(() => {
    if (script !== 'english' || loading || verses.length > 0) return;
    if (hebTried && !hebLoading && Object.keys(hebWordsByVerse).length > 0) { setScript('hebrew'); return; }
    if (gzTried && !gzLoading && Object.keys(gzWordsByVerse).length > 0) setScript('geez');
  }, [script, loading, verses.length, hebTried, hebLoading, hebWordsByVerse, gzTried, gzLoading, gzWordsByVerse]);

  // ── chapter headings: superscriptions and acrostic stanza letters ──────────
  // Neither is verse text. A superscription ("A Psalm of David") lives at verse 0 in
  // tokens_bhs and belongs ABOVE verse 1; an acrostic letter (Alap, Bayath) heads the
  // stanza that starts at a given verse. build-headings.mjs writes public/headings.json
  // for EVERY chapter that has them — Psalms, Lamentations, Proverbs 31, Habakkuk 3 —
  // so nothing here is psalm-specific.
  const [headings, setHeadings] = useState({});
  useEffect(() => {
    let live = true;
    fetch('/headings.json')
      .then(r => (r.ok ? r.json() : {}))
      .then(j => { if (live) setHeadings(j || {}); })
      .catch(() => {});                        // absent file is not an error
    return () => { live = false; };
  }, []);
  const chapHead = headings[`${book}:${chapter}`] || null;

  // ── embedded scripture-quote citations ──────────────────────────────────────
  // Hand-curated links from an embedded quotation (splitScriptureQuote above)
  // back to the canonical passage it quotes — see server/public/scripture-
  // citations.json. Not auto-detected (matching a quoted passage against the
  // whole Bible is a much bigger, separate problem); this only lights up the
  // specific instances someone has confirmed by hand. Absent file/entry is not
  // an error — the quote still renders, just without the link.
  const [citations, setCitations] = useState({});
  useEffect(() => {
    let live = true;
    fetch('/scripture-citations.json')
      .then(r => (r.ok ? r.json() : {}))
      .then(j => { if (live) setCitations(j || {}); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // ── verse highlights (session-only; a refresh clears them) ─────────────────
  // Tap a verse number to light it; tap again to clear it — keyed by
  // book:chapter:verse so marks survive moving between chapters but not a page
  // reload. Two modes (see MARK_MODES above, toggled in the Aa panel):
  // "multi" (default) — any number of verses can be lit at once, each
  // independent, exactly the original behavior. "single" — lighting a NEW
  // verse replaces the whole set, so only the most recently tapped verse stays
  // lit; tapping the already-lit verse still clears it in both modes.
  const [marks, setMarks] = useState(() => new Set());
  const markKey = (vnum) => `${book}:${chapter}:${vnum}`;
  const toggleMark = useCallback((vnum) => {
    const k = `${book}:${chapter}:${vnum}`;
    setMarks(prev => {
      if (markMode === 'single') {
        return prev.has(k) ? new Set() : new Set([k]);
      }
      const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n;
    });
  }, [book, chapter, markMode]);

  // A citation link (?verse=10&verseEnd=11, from renderScriptureQuote) marks
  // the WHOLE cited range as lit — same persistent highlight as tapping each
  // verse number — not just a transient flash, so "snap to and highlight
  // verse 10 and 11" actually stays lit once you arrive rather than fading
  // after the scroll animation like a single-verse deep link does.
  useEffect(() => {
    if (verse == null || !verseEnd || verseEnd < verse) return;
    const keys = [];
    for (let v = verse; v <= verseEnd; v++) keys.push(markKey(v));
    setMarks(prev => new Set([...prev, ...keys]));
  }, [book, chapter, verse, verseEnd]);

  // ── scroll: top on chapter change; smooth-scroll + flash a targeted verse ───
  const scrollRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    if (verse != null) {
      const el = document.getElementById(`rv-${verse}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash every verse in the cited range (verse..verseEnd), not just
        // the first — a range citation should draw the eye across the whole
        // quoted span, not just where it lands.
        const rangeEnd = (verseEnd && verseEnd >= verse) ? verseEnd : verse;
        const flashed = [];
        for (let v = verse; v <= rangeEnd; v++) {
          const ve = document.getElementById(`rv-${v}`);
          if (ve) { ve.classList.add('rd-flash'); flashed.push(ve); }
        }
        const t = setTimeout(() => flashed.forEach(ve => ve.classList.remove('rd-flash')), 1500);
        return () => clearTimeout(t);
      }
    }
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [loading, chapKey, verse]);

  // ── navigation ─────────────────────────────────────────────────────────────
  // Built from the CURRENT search params, not a fresh URLSearchParams, so a
  // chapter/book jump never drops ?script= (or any other param riding along) —
  // only book/chapter/verse are ever touched here.
  const go = useCallback((b, c, v) => {
    setSp(prev => {
      const p = new URLSearchParams(prev);
      p.set('book', bookToParam(b, idToSlug));
      p.set('chapter', String(c));
      if (v != null) p.set('verse', String(v)); else p.delete('verse');
      return p;
    });
  }, [idToSlug, setSp]);

  const prevLoc = useMemo(() => {
    if (chapter > firstCh) return { b: book, c: chapter - 1 };
    const pb = booksOrdered[bookIndex - 1];
    return pb ? { b: idOf(pb), c: pb.last || 1 } : null;
  }, [book, chapter, firstCh, booksOrdered, bookIndex]);
  const nextLoc = useMemo(() => {
    if (chapter < lastCh) return { b: book, c: chapter + 1 };
    const nb = booksOrdered[bookIndex + 1];
    return nb ? { b: idOf(nb), c: nb.first || 1 } : null;
  }, [book, chapter, lastCh, booksOrdered, bookIndex]);

  // ── overlays ───────────────────────────────────────────────────────────────
  const [navOpen, setNavOpen]     = useState(false);
  const [bookQuery, setBookQuery] = useState('');
  const [aaOpen, setAaOpen]       = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  const openNav  = () => { setBookQuery(''); setAaOpen(false); setSwitchOpen(false); setNavOpen(true); };
  const closeAll = () => { setAaOpen(false); setSwitchOpen(false); };

  // Land the picker already scrolled to where you are, in both columns, instead of
  // opening at the top of Genesis chapter 1 every time. Each column keeps a ref to
  // just its "cur" row/cell (there's only ever one per column); on open, wait a frame
  // so the sheet has actually laid out — scrollIntoView on a just-mounted, zero-size
  // container is a no-op — then jump both into view with no animation.
  const curBookRef = useRef(null);
  const curChapterRef = useRef(null);
  useEffect(() => {
    if (!navOpen) return;
    const id = requestAnimationFrame(() => {
      curBookRef.current?.scrollIntoView({ block: 'center' });
      curChapterRef.current?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [navOpen]);

  const curChapters = [];
  for (let c = firstCh; c <= lastCh; c++) curChapters.push(c);

  // Named sections spanning a chapter range within this book (e.g. Book of
  // Melchizedek's 3 originally-separate parts) — [] for the vast majority of
  // books that don't have any, which is the normal/expected case.
  const [bookSections, setBookSections] = useState([]);
  useEffect(() => {
    if (!bookReady) return;
    let cancelled = false;
    apiBookSections(book).then(s => { if (!cancelled) setBookSections(s); });
    return () => { cancelled = true; };
  }, [book, bookReady]);
  // section title covering chapter c, or null if c is before the first section's
  // 'from' or this book has no sections at all.
  const sectionTitleFor = (c) => {
    let title = null;
    for (const s of bookSections) { if (s.from <= c) title = s.title; else break; }
    return title;
  };
  const filteredBooks = booksOrdered.filter(m =>
    !bookQuery.trim() || (m.name || '').toLowerCase().includes(bookQuery.trim().toLowerCase()));

  const loc = `book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`;
  const readers = [
    { label: 'Paleo Reader',   to: `/?${loc}`,          hint: 'Paleo-Hebrew, glossed' },
    { label: 'Parallel',       to: `/parallel?${loc}`,  hint: 'English beside the source' },
    { label: 'Translation Studio', to: `/translate?${loc}`, hint: 'Edit the English' },
  ];

  // ── keyboard nav: ← previous chapter, → next chapter ────────────────────────
  // Skipped while typing in a form control (the book-search box, etc.) or while
  // any sheet/menu is open, so arrow keys there behave normally instead of
  // silently paging the chapter underneath the open overlay.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (navOpen || aaOpen || switchOpen) return;
      if (e.key === 'ArrowLeft') { if (prevLoc) { e.preventDefault(); go(prevLoc.b, prevLoc.c, null); } }
      else if (e.key === 'ArrowRight') { if (nextLoc) { e.preventDefault(); go(nextLoc.b, nextLoc.c, null); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevLoc, nextLoc, go, navOpen, aaOpen, switchOpen]);

  // Swipe left/right → next/prev chapter (mobile).
  const touch = useRef(null);
  const onTouchStart = e => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = e => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      const dest = dx < 0 ? nextLoc : prevLoc;
      if (dest) go(dest.b, dest.c, null);
    }
  };

  const refLabel = `${chapterBookName} ${chapter}${verse != null ? `:${verse}` : ''}`;
  // Either non-English script shares the same two-way gloss toggle and the
  // same "own block per verse in glossed mode" layout rule below.
  const isForeignScript = script !== 'english';
  const srcLoading = script === 'hebrew' ? hebLoading : script === 'geez' ? gzLoading : false;
  const srcWordsByVerse = script === 'hebrew' ? hebWordsByVerse : script === 'geez' ? gzWordsByVerse : null;
  const srcLabel = script === 'geez' ? 'Ge’ez' : 'Hebrew';

  // Verse numbers to actually render, driven by the ACTIVE script rather than
  // always the English baseline — a book with zero English translation but a
  // full Hebrew (or Ge'ez) token stream must still render when you're reading
  // it in that script, instead of going blank just because `verses` (English)
  // came back empty. `renderVerseNums.length === 0` is the one signal the
  // markup below needs to decide "nothing to show here at all."
  const versesByNum = useMemo(() => {
    const m = {};
    (verses || []).forEach(v => { m[v.verse] = v; });
    return m;
  }, [verses]);
  const renderVerseNums = useMemo(() => {
    if (!isForeignScript) return verses.map(v => v.verse);
    return Object.keys(srcWordsByVerse || {}).map(Number).sort((a, b) => a - b);
  }, [isForeignScript, verses, srcWordsByVerse]);

  // Verse 0 is a superscription/title ("A Psalm of David"), not verse 1 — see
  // the headings note below. It used to fall through the ordinary per-verse
  // loop and render glued directly onto verse 1 ("0 · 1 In the beginning…"),
  // with a bare middot standing in for its own untranslated text. Pull its
  // text out here so the title block (below, alongside the Paleo heading)
  // can show it on its own line, and the main loop can skip vnum 0 entirely.
  const verse0Text = useMemo(() => {
    if (!renderVerseNums.includes(0)) return null;
    if (script === 'hebrew' || script === 'geez') {
      const words = srcWordsByVerse ? srcWordsByVerse[0] : null;
      if (!words?.length) return null;
      if (hebGlossMode === 'glossed') {
        return script === 'hebrew' ? renderHebrewWordCells(words) : renderPlainWordCells(words);
      }
      return script === 'hebrew' ? renderHebrewProseNodes(words) : renderPlainProseNodes(words);
    }
    const raw = sanitizeText((versesByNum[0]?.text || '').trim());
    return raw ? renderVerseNodes(raw, glossMode) : null;
  }, [renderVerseNums, script, srcWordsByVerse, hebGlossMode, versesByNum, glossMode]);

  return (
    <div className="reader-root" data-typeface={typeface}
         style={{ '--reader-size': `${fontPx}px`, '--pr-reading': typefaceStack }}>
      {/* ── top bar ─────────────────────────────────────────────────────────── */}
      <header className="rd-bar">
        <Link to="/landing" className="rd-bar-btn rd-home" title="Home" aria-label="Home">𐤀𐤁</Link>

        <button className="rd-ref" onClick={openNav} aria-haspopup="dialog" title="Choose book, chapter & verse">
          <span className="rd-ref-txt">{refLabel}</span>
          <span className="rd-ref-caret" aria-hidden="true">▾</span>
        </button>

        <div className="rd-bar-right">
          <button className={`rd-bar-btn ${switchOpen ? 'on' : ''}`} onClick={() => { setSwitchOpen(o => !o); setAaOpen(false); }}
                  title="Switch reader" aria-label="Switch reader">⇄</button>
          <button className={`rd-bar-btn rd-aa ${aaOpen ? 'on' : ''}`} onClick={() => { setAaOpen(o => !o); setSwitchOpen(false); }}
                  title="Text size, typeface & theme" aria-label="Text size, typeface and theme">A<span className="rd-aa-sm">a</span></button>
        </div>

        {switchOpen && (
          <div className="rd-menu rd-menu-switch" role="menu">
            <div className="rd-menu-head">Open this place in</div>
            {readers.map(r => (
              <Link key={r.to} to={r.to} className="rd-menu-item" role="menuitem" onClick={closeAll}>
                <span className="rd-menu-item-label">{r.label}</span>
                <span className="rd-menu-item-hint">{r.hint}</span>
              </Link>
            ))}
          </div>
        )}

        {aaOpen && (
          <div className="rd-menu rd-menu-aa" role="dialog" aria-label="Text size, typeface and theme">
            <div className="rd-aa-row">
              <span className="rd-aa-label">Text size</span>
              <div className="rd-aa-size">
                <button className="rd-aa-step" disabled={fontPx <= FONT_MIN}
                        onClick={() => setFontPx(v => Math.max(FONT_MIN, v - 1))} aria-label="Smaller">A−</button>
                <span className="rd-aa-val">{fontPx}</span>
                <button className="rd-aa-step" disabled={fontPx >= FONT_MAX}
                        onClick={() => setFontPx(v => Math.min(FONT_MAX, v + 1))} aria-label="Larger">A+</button>
              </div>
            </div>
            <div className="rd-aa-row rd-aa-row-col">
              <span className="rd-aa-label">Script</span>
              <div className="rd-aa-gloss">
                {SCRIPT_MODES.map(m => (
                  <button key={m.id}
                          className={`rd-gloss-chip ${script === m.id ? 'sel' : ''}`}
                          onClick={() => setScript(m.id)}
                          aria-pressed={script === m.id}
                          title={`Read in ${m.label} — e.g. ${m.note}`}>
                    <span className="rd-gloss-name">{m.label}</span>
                    <span className="rd-gloss-note">{m.note}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rd-aa-row rd-aa-row-col">
              <span className="rd-aa-label">Glosses</span>
              <div className={`rd-aa-gloss ${isForeignScript ? 'cols-2' : ''}`}>
                {(isForeignScript ? (script === 'geez' ? GEEZ_GLOSS_MODES : HEB_GLOSS_MODES) : GLOSS_MODES).map(m => (
                  <button key={m.id}
                          className={`rd-gloss-chip ${(isForeignScript ? hebGlossMode : glossMode) === m.id ? 'sel' : ''}`}
                          onClick={() => (isForeignScript ? setHebGlossMode(m.id) : setGlossMode(m.id))}
                          aria-pressed={(isForeignScript ? hebGlossMode : glossMode) === m.id}
                          title={`Show ${m.label.toLowerCase()} — e.g. ${m.note}`}>
                    <span className="rd-gloss-name">{m.label}</span>
                    <span className="rd-gloss-note">{m.note}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rd-aa-row rd-aa-row-col">
              <span className="rd-aa-label">Verse selection</span>
              <div className="rd-aa-gloss">
                {MARK_MODES.map(m => (
                  <button key={m.id}
                          className={`rd-gloss-chip ${markMode === m.id ? 'sel' : ''}`}
                          onClick={() => setMarkMode(m.id)}
                          aria-pressed={markMode === m.id}
                          title={m.note}>
                    <span className="rd-gloss-name">{m.label}</span>
                    <span className="rd-gloss-note">{m.note}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rd-aa-row rd-aa-row-col">
              <span className="rd-aa-label">Typeface</span>
              <div className="rd-aa-fonts">
                {TYPEFACES.map(f => (
                  <button key={f.id}
                          className={`rd-font-chip ${typeface === f.id ? 'sel' : ''}`}
                          style={{ fontFamily: f.stack }}
                          onClick={() => setTypeface(f.id)}
                          aria-pressed={typeface === f.id}
                          title={f.note}>
                    <span className="rd-font-name">{f.label}</span>
                    <span className="rd-font-note">{f.note}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rd-aa-row">
              <span className="rd-aa-label">Theme</span>
              <div className="rd-aa-themes">
                <button className={`rd-theme-chip parchment ${theme === 'light' ? 'sel' : ''}`}
                        onClick={() => { if (theme !== 'light') toggleTheme(); }}>Parchment</button>
                <button className={`rd-theme-chip night ${theme !== 'light' ? 'sel' : ''}`}
                        onClick={() => { if (theme === 'light') toggleTheme(); }}>Night</button>
              </div>
            </div>
          </div>
        )}
      </header>

      {(aaOpen || switchOpen) && <div className="rd-scrim rd-scrim-menu" onClick={closeAll} />}

      {/* ── reading surface ─────────────────────────────────────────────────── */}
      <main className="rd-scroll" ref={scrollRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <article className="rd-page">
          {loading ? (
            <div className="rd-state">Opening {bookName}…</div>
          ) : (script === 'english' && verses.length === 0 && (hebLoading || gzLoading)) ? (
            // English came back empty and Hebrew/Ge'ez are still being checked
            // (see the auto-fallback effect above) — a plain loading state so a
            // book that resolves into another script never flashes the "not
            // translated" dead end first.
            <div className="rd-state">Opening {bookName}…</div>
          ) : (isForeignScript && srcLoading) ? (
            <div className="rd-state">Loading {srcLabel}…</div>
          ) : renderVerseNums.length === 0 ? (
            <div className="rd-state rd-state-untranslated">
              <div className="rd-state-icon">𐤀𐤁</div>
              {isForeignScript ? (
                <>
                  <p className="rd-state-title">{bookName} has no {srcLabel} source text.</p>
                  <p className="rd-state-sub">
                    {script === 'geez'
                      ? "The Ge’ez reading needs a source text for this book, and this one doesn't have one yet. Read it in English, or open the Parallel Viewer to see whatever source text does exist."
                      : "The Hebrew reading needs a tokenized Hebrew source for this book — the Masoretic Old Testament, or a Hebrew edition of the New Testament, Jasher, or similar. This book doesn't have one yet. Read it in English, or open the Parallel Viewer to see whatever source text does exist."}
                  </p>
                  <div className="rd-state-actions">
                    <button className="rd-state-btn rd-state-btn-primary" onClick={() => setScript('english')}>
                      Read in English
                    </button>
                    <Link className="rd-state-btn rd-state-btn-secondary" to={`/parallel?${loc}`}>
                      Open in Parallel Viewer →
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="rd-state-title">{bookName} has not been translated into English yet.</p>
                  <p className="rd-state-sub">
                    It has no Hebrew or Ge’ez source text here either — view whatever
                    the Parallel Viewer does have, or start a translation in the Studio.
                  </p>
                  <div className="rd-state-actions">
                    <Link className="rd-state-btn rd-state-btn-primary" to={`/parallel?${loc}`}>
                      Open in Parallel Viewer →
                    </Link>
                    <Link className="rd-state-btn rd-state-btn-secondary" to={`/translate?${loc}`}>
                      Translate in the Studio
                    </Link>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rd-chapter" key={chapKey}>
              <header className="rd-chapter-head">
                <div className="rd-book-name">{chapterBookName}</div>
                <div className="rd-chapter-num">{chapter}</div>
                {sectionTitleFor(chapter) && (
                  <div className="rd-section-heading">{sectionTitleFor(chapter)}</div>
                )}
              </header>
              {/* superscription — a title, not verse 1. Folds together the
                  BHS-derived Paleo heading (when build-headings.mjs has one)
                  and the verse-0 translation itself (once someone's entered
                  it in the Studio), so a Psalm's title always reads as a
                  title on its own line — never glued onto verse 1. */}
              {(chapHead?.super || verse0Text) && (
                <div className="rd-super" id={renderVerseNums.includes(0) ? 'rv-0' : undefined}>
                  {chapHead?.super && (
                    <>
                      <div className="rd-super-paleo">{chapHead.super.paleo}</div>
                      <div className="rd-super-translit">{chapHead.super.translit}</div>
                    </>
                  )}
                  {verse0Text && <div className="rd-super-en">{verse0Text}</div>}
                </div>
              )}
              <div className={`rd-body ${isForeignScript ? 'rd-heb' : ''} ${isForeignScript && hebGlossMode === 'glossed' ? 'rd-heb-glossed' : ''}`} style={{ fontSize: `${fontPx}px` }}>
                {renderVerseNums.filter(vnum => vnum !== 0).map((vnum) => {
                  const verseSrcWords = srcWordsByVerse ? srcWordsByVerse[vnum] : null;
                  const text = script === 'hebrew'
                    ? (verseSrcWords?.length
                        ? (hebGlossMode === 'glossed' ? renderHebrewWordCells(verseSrcWords) : renderHebrewProseNodes(verseSrcWords))
                        : '·')
                    : script === 'geez'
                    ? (verseSrcWords?.length
                        ? (hebGlossMode === 'glossed' ? renderPlainWordCells(verseSrcWords) : renderPlainProseNodes(verseSrcWords))
                        : '·')
                    : (() => {
                        const raw = sanitizeText((versesByNum[vnum]?.text || '').trim());
                        if (!raw) return '·';
                        const q = splitScriptureQuote(raw);
                        if (!q) return renderVerseNodes(raw, glossMode);
                        // English-only gloss mode stays a plain string for the
                        // surrounding prose (see renderVerseNodes/applyGlossMode) —
                        // the quote block itself is always React nodes, so the
                        // overall verse becomes a small mixed array either way.
                        const before = q.before ? renderVerseNodes(q.before, glossMode) : null;
                        const after  = q.after  ? renderVerseNodes(q.after,  glossMode) : null;
                        const citation = citations[`${book}:${chapter}:${vnum}`] || null;
                        const out = [];
                        if (before != null) out.push(...(Array.isArray(before) ? before : [before]));
                        out.push(renderScriptureQuote(q, glossMode, 'sq', citation, idToSlug));
                        if (after != null) out.push(...(Array.isArray(after) ? after : [after]));
                        return out;
                      })();
                  const on = marks.has(markKey(vnum));
                  const acro = chapHead?.acrostics?.[vnum];
                  // Glue the verse number to the FIRST piece of its own text (see
                  // splitFirstToken above) so a tight line never breaks right after
                  // the number, stranding it at the end of the previous line while
                  // its own verse starts fresh on the next.
                  const { first: vFirst, rest: vRest } = splitFirstToken(text);
                  return (
                    <Fragment key={vnum}>
                    {acro && (
                      <div className="rd-acrostic">
                        <span className="rd-acrostic-glyph">{acro.letter}</span>
                        <span className="rd-acrostic-name">
                          {acro.label}
                          {LETTER_MEANING[acro.letter[0]] && ` (${LETTER_MEANING[acro.letter[0]]})`}
                          {acro.spelled && (
                            <>
                              {' – '}
                              <span className="rd-acrostic-spelled">{acro.spelled}</span>
                            </>
                          )}
                        </span>
                      </div>
                    )}
                    <span className={`rd-verse ${on ? 'marked' : ''}`} id={`rv-${vnum}`}>
                      <span className="rd-vnum-glue">
                        <sup className="rd-vnum" role="button" tabIndex={0}
                             title={on ? `Clear highlight on verse ${vnum}` : `Highlight verse ${vnum}`}
                             onClick={() => toggleMark(vnum)}
                             onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMark(vnum); } }}>
                          {vnum}
                        </sup>
                        <span className="rd-vfirst">{vFirst}</span>
                      </span>
                      <span className="rd-vtext">{vRest}</span>{' '}
                    </span>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* chapter foot — prev / next roll across books */}
          {!loading && (
            <nav className="rd-foot" aria-label="Chapter navigation">
              <button className="rd-foot-btn" disabled={!prevLoc}
                      onClick={() => prevLoc && go(prevLoc.b, prevLoc.c, null)}>‹ Previous</button>
              <button className="rd-foot-ref" onClick={openNav}>{chapterBookName} {chapter}</button>
              <button className="rd-foot-btn" disabled={!nextLoc}
                      onClick={() => nextLoc && go(nextLoc.b, nextLoc.c, null)}>Next ›</button>
            </nav>
          )}
        </article>
      </main>

      {/* ── book / chapter / verse picker ───────────────────────────────────── */}
      {navOpen && (
        <div className="rd-sheet-wrap" role="dialog" aria-label="Choose passage">
          <div className="rd-scrim" onClick={() => setNavOpen(false)} />
          <div className="rd-sheet">
            <div className="rd-sheet-grip" />
            <div className="rd-sheet-head">
              <input className="rd-sheet-search" placeholder="Find a book…" value={bookQuery}
                     onChange={e => setBookQuery(e.target.value)} autoFocus />
              <button className="rd-sheet-close" onClick={() => setNavOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="rd-sheet-body">
              {/* Books — one tap jumps straight to that book (chapter 1). */}
              <div className="rd-sheet-col rd-col-books">
                {filteredBooks.map((m, i) => {
                  const id = idOf(m);
                  return (
                    <button key={id}
                            ref={id === book ? curBookRef : null}
                            className={`rd-book-row ${id === book ? 'cur' : ''}`}
                            onClick={() => { go(id, 1, null); setNavOpen(false); }}>
                      <span className="rd-book-idx">{i + 1}</span>
                      <span className="rd-book-label">{m.name || `Book ${id}`}</span>
                    </button>
                  );
                })}
                {filteredBooks.length === 0 && <div className="rd-sheet-empty">No match.</div>}
              </div>

              {/* Chapter / verse jumps within the book you're reading. */}
              <div className="rd-sheet-col rd-col-chapters">
                <div className="rd-sheet-sub">{bookName} — chapters</div>
                {bookSections.length === 0 ? (
                  <div className="rd-grid">
                    {curChapters.map(c => (
                      <button key={c}
                              ref={c === chapter ? curChapterRef : null}
                              className={`rd-grid-cell ${c === chapter ? 'cur' : ''}`}
                              onClick={() => { go(book, c, null); setNavOpen(false); }}>{c}</button>
                    ))}
                  </div>
                ) : (
                  // This book has named sections (e.g. Book of Melchizedek's 3
                  // originally-separate parts) — break the chapter grid into one
                  // sub-grid per section, with the section's title as a heading,
                  // instead of one flat run of numbers.
                  bookSections.map((s, i) => {
                    const nextFrom = bookSections[i + 1]?.from ?? (lastCh + 1);
                    const chaptersInSection = curChapters.filter(c => c >= s.from && c < nextFrom);
                    if (!chaptersInSection.length) return null;
                    return (
                      <div key={s.from} className="rd-section-group">
                        <div className="rd-section-title">{s.title}</div>
                        <div className="rd-grid">
                          {chaptersInSection.map(c => (
                            <button key={c}
                                    ref={c === chapter ? curChapterRef : null}
                                    className={`rd-grid-cell ${c === chapter ? 'cur' : ''}`}
                                    onClick={() => { go(book, c, null); setNavOpen(false); }}>{c}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
                {verses.length > 0 && (
                  <>
                    <div className="rd-sheet-sub">Jump to verse</div>
                    <div className="rd-grid rd-grid-verses">
                      {verses.map(v => (
                        <button key={v.verse}
                                className={`rd-grid-cell ${v.verse === verse ? 'cur' : ''}`}
                                onClick={() => { go(book, chapter, v.verse); setNavOpen(false); }}>{v.verse}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
