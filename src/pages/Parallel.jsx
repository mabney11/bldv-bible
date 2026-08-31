import { useState, useEffect, useRef, useCallback, useMemo, Component } from 'react';
import { Link, useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { useLocalStorageNumber } from '../hooks/useLocalStorageNumber.js';
import { paleoToSVG } from '../lib/paleoGlyphs.js';
import { transliterate } from '../lib/translit.js';
import { sqToPaleo } from '../lib/sqToPaleo.js';
import { buildBookSlugs, resolveBookParam, bookToParam, parallelHref } from '../lib/bookSlug.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { truncateTitle, versePreviewTranslit } from '../lib/versePreview.js';
import { TYPEFACES } from '../lib/typefaces.js';
import { remapSourceVerseToDisplay } from '../lib/sourceVerseRemap.js';
// Same reading typefaces the novel Reader offers (see ../lib/typefaces.js) —
// pulled in here 2026-08-15 so the English column can look like the Reader
// instead of the plain system-UI stack it used to render in. Self-hosted,
// same as Reader.jsx, so it works offline/behind ngrok with no Google CDN
// request. The four TeX/OSP faces (Cochineal, Antykwa, Coelacanth,
// Kierkegaard) have no @fontsource package and fall back to Alegreya until
// their .woff2 files are dropped in /fonts/ — see Reader.jsx's own note.
import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/ysabeau/400.css';
import '@fontsource/ysabeau/600.css';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
// The shared morphology color system — .root/.mod-conj/.pfm-3ms/.vbe-3ms/etc.,
// same file Reader.jsx and components/WordBlock.jsx import. Parallel used to
// carry its own hand-duplicated copy of this palette in Parallel.css, and that
// copy had quietly drifted incomplete (the ENTIRE .vbe-* verbal-ending family
// and .mod-cstr were missing, plus every [data-alt="1"] alternating variant) —
// so any word using one of those morphology classes rendered in plain
// foreground color here while the exact same word showed its real color in
// the novel Reader. Fieldy, 2026-08-16: "I want to keep the colors from the
// novel reader in the parallel reader." Importing the ONE canonical file (as
// every other reader already does) instead of a second copy is what actually
// keeps them identical, not just similar-looking today.
import '../lib/morphColors.css';
import './Parallel.css';
import { isPlaceholderGloss, hasTrailingMaqaf } from '../components/WordBlock.jsx';
// The SAME component the novel reader (MultiViewer.jsx) and Gloss Studio use
// for every non-Hebrew script (Ge'ez/Greek/Latin/Syriac/…) — this page used
// to render those with a bespoke glyph+gloss-only block that never showed a
// transliteration line at all and had no "this word has a real gloss" color
// treatment. Fieldy, 2026-08-16: "transliterations have slipped from the
// parallel view... i think multiwordblock is what we use" / "the colors
// have disappeared, glossed words should be golden like the novel reader."
import MultiWordBlock from '../components/MultiWordBlock.jsx';
// MultiWordBlock's own styling (font per script, glyph/translit/gloss
// layout, and the gold-vs-dim "is this glossed" treatment added alongside
// this page's own MultiWordBlock adoption) lives in MultiViewer.css, the
// same file the novel reader itself already relies on for these classes —
// importing it here instead of re-declaring any of it is what keeps this
// page looking IDENTICAL to the reader rather than a re-approximation.
import './MultiViewer.css';
import { getAdminStatus, getLocalVersesForChapter, mergeChapterVersesWithLocal } from '../lib/localOverlay.js';

// ── English column: text size + typeface (persisted) ───────────────────────
// Own keys, deliberately NOT shared with Reader.jsx's 'reader-font'/
// 'reader-typeface' — this page's English column sits in a dense two-column
// layout next to the Hebrew side, not a full-width reading page, so it gets
// its own independent size range/default rather than inheriting whatever a
// reader has their (much wider) novel Reader set to. The typeface CATALOG is
// shared (../lib/typefaces.js); the DEFAULT is not — OpenDyslexic here,
// Alegreya there, per the reader's 2026-08-15 request.
const PAR_FONT_MIN = 12, PAR_FONT_MAX = 32, PAR_FONT_DEFAULT = 18;
const PAR_TYPEFACE_DEFAULT = 'opendyslexic';
const PAR_TYPEFACE_KEY = 'par-en-typeface';
// Hebrew column: reuses the SAME --paleo-size/--sub-size CSS custom
// properties the Root/Surface Explorer and Hebrew Viewer already use (see
// useLocalStorageNumber's cssVar param), but under Parallel-specific
// localStorage keys — so adjusting Hebrew glyph size here never changes
// what those other pages default to (and vice versa), even though the CSS
// variable name is shared. Defaults match this page's existing hardcoded
// Parallel.css values (30px / 11px) so shipping this changes nothing for a
// reader who never opens the new size controls.
const PAR_PALEO_MIN = 16, PAR_PALEO_MAX = 60;
const PAR_SUB_MIN = 8, PAR_SUB_MAX = 22;

// A component whose text carries no Paleo-Hebrew letter (U+10900–U+1091F) has no
// glyph in the Paleo script — it's punctuation or a literal mark (sof-pasuq ׃,
// maqaf ־, the : stops). We render the mark itself as text, exactly like the
// Ge'ez reader renders ፡ / ። inline, instead of dropping it to a blank block.
const PALEO_LETTER_RE = /[\u{10900}-\u{1091F}]/u;
const hasPaleo = (s) => PALEO_LETTER_RE.test(s || '');

// Ge'ez word-separator/sentence-mark tokens (፡ ። ፣ ፤ ፥ ፦ ፧ ፨) arrive as their
// OWN standalone tokens from the tokenizer — folded onto the PRECEDING real
// word's `trailMark` instead of rendered as their own block, exactly mirroring
// MultiViewer.jsx's foldGeezPunct/_geezRank (duplicated here deliberately,
// same convention as every other small link/render helper this page already
// keeps its own copy of rather than importing across pages). Only Ge'ez emits
// is_punct tokens today, so this is a no-op for every other script.
const _geezRank = (m) => {
  const c = (m || '').codePointAt(0) || 0;
  if (c >= 0x1362 && c <= 0x1368) return 2;   // ። ፣ ፤ ፥ ፦ ፧ ፨  (section / sentence)
  if (c === 0x1361) return 1;                 // ፡  (wordspace)
  return 0;
};
function foldGeezPunct(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  const out = [];
  for (const t of tokens) {
    if (t && t.is_punct) {
      const mark = t.punct || '';
      for (let j = out.length - 1; j >= 0; j--) {
        if (!out[j].is_punct) {
          const prev = out[j].trailMark || '';
          out[j] = { ...out[j], trailMark: _geezRank(mark) >= _geezRank(prev) ? mark : prev };
          break;
        }
      }
      continue;
    }
    out.push(t);
  }
  return out;
}

// The "… Viewer →" button opens the reader for whichever source is selected
// here, so its label names that reader. Greek folds LXX/GNT/GRC together.
const READER_NAME = {
  BHS: 'Hebrew', HEB: 'Hebrew', GEZ: "Ge'ez", SYR: 'Syriac',
  LXX: 'Greek', GRC: 'Greek', GNT: 'Greek',
  LAT: 'Latin', ENG: 'English',
};

const BOOK_NAMES = {
  1:'Genesis',2:'Exodus',3:'Leviticus',4:'Numbers',5:'Deuteronomy',6:'Joshua',7:'Judges',8:'Ruth',
  9:'1 Samuel',10:'2 Samuel',11:'1 Kings',12:'2 Kings',13:'1 Chronicles',14:'2 Chronicles',15:'Ezra',
  16:'Nehemiah',17:'Esther',18:'Job',19:'Psalms',20:'Proverbs',21:'Ecclesiastes',22:'Song of Songs',
  23:'Isaiah',24:'Jeremiah',25:'Lamentations',26:'Ezekiel',27:'Daniel',28:'Hosea',29:'Joel',30:'Amos',
  31:'Obadiah',32:'Jonah',33:'Micah',34:'Nahum',35:'Habakkuk',36:'Zephaniah',37:'Haggai',38:'Zechariah',
  39:'Malachi',40:'Matthew',41:'Mark',42:'Luke',43:'John',44:'Acts',45:'Romans',46:'1 Corinthians',
  47:'2 Corinthians',48:'Galatians',49:'Ephesians',50:'Philippians',51:'Colossians',52:'1 Thessalonians',
  53:'2 Thessalonians',54:'1 Timothy',55:'2 Timothy',56:'Titus',57:'Philemon',58:'Hebrews',59:'James',
  60:'1 Peter',61:'2 Peter',62:'1 John',63:'2 John',64:'3 John',65:'Jude',66:'Revelation',
};
const bookLabel = (id) => `${id}. ${BOOK_NAMES[id] || `Book ${id}`}`;

// Guards the verse output: if a verse/word throws while rendering (bad token
// shape for an unusual book), it does NOT blank the app. It calls onError so the
// reader can drop to a language that renders, and shows a message only if every
// language has been exhausted. Resets when the key (book/chapter/lang) changes.
class VerseErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch() { if (this.props.onError) this.props.onError(); }
  render() {
    if (this.state.err) return <div className="no-translation">{this.props.fallbackMsg || 'This chapter isn’t available in any source yet.'}</div>;
    return this.props.children;
  }
}

// Paleo conversion must never throw — a single odd character in an unusual book
// should degrade to raw text, not take down the chapter. These wrap the two
// library calls so rendering is total.
const safeSq = (s) => { try { return sqToPaleo(s) || ''; } catch { return s || ''; } };
const safeSVG = (p) => { try { return paleoToSVG(p) || ''; } catch { return ''; } };

const RTL_SCRIPTS = new Set(['paleo-hebrew', 'hebrew', 'syriac']);
const dirForScript = (s) => (RTL_SCRIPTS.has(s) ? 'rtl' : 'ltr');

// Language hierarchy — when the chosen language has no text for a book, fall
// back down this list (Hebrew first). BHS = the glossed Paleo OT; HEB = the
// wider Hebrew source (NT, deuterocanon, works) that BHS/tokens_bhs doesn't hold.
const LANG_PRIORITY = ['BHS', 'HEB', 'GEZ', 'SYR', 'LXX', 'GNT', 'GRC', 'LAT'];

const parseJ = (v, fb) => Array.isArray(v) ? v : (() => { try { return JSON.parse(v); } catch { return fb; } })();

// ── Gloss display mode (shared with the Reader) ──────────────────────────────
// The baseline English carries "translit (gloss)" pairs — "Rawach (spirit / wind)".
// Same three modes the Reader offers, and the SAME localStorage key, so the choice
// carries across the two views. Change GLOSS_KEY to 'par-gloss-mode' to decouple.
const GLOSS_MODES = [
  { id: 'both',   label: 'Both',         note: 'yawam (days)' },
  { id: 'hebrew', label: 'Hebrew only',  note: 'yawam' },
  { id: 'gloss',  label: 'English only', note: 'days' },
];
const GLOSS_DEFAULT = 'both';
const GLOSS_KEY = 'reader-gloss-mode';

// CRITICAL DIFFERENCE FROM THE READER. The Reader applies the gloss transform to a
// whole verse string. Parallel CANNOT: it renders one <span> per word and highlights
// alignment via `english_indices`, which are positions in the ORIGINAL word list.
// Rewriting the text would shift every index and silently break the Hebrew<->English
// highlighting — the feature this page exists for.
//
// So this returns one entry per ORIGINAL word, keeping its index, and only marks
// entries hidden or rewrites their display text. Indices never move.
// A parenthetical may span several whitespace-separated tokens ("(spirit / wind)"),
// so the closing token is scanned for rather than assumed to be the next one.
const GLOSS_TRAIL = /[.,;:!?'"\u2019\u201d)]+$/;

// \u2500\u2500\u2500 "Missing in this translation" flag \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Fieldy, 2026-08-17, after finding Latin Genesis 1:5 genuinely has no word
// for "Alahayam" (the Vulgate leaves the subject implied from v4 \u2014 not a
// bug): "I would like to flag and display that information in the reader...
// a word for `Alahayam` is missing from this translation." Duplicated from
// Translate.jsx's identically-named helpers (same convention as
// glossOwnerMap/glossTokens above \u2014 this page doesn't share link-processing
// logic with the Studio by import) so this page can independently ask "does
// ANY word in this language's own verse text carry a lexicon gloss that
// transliterates to this English root word", the same question Auto-Link
// itself answers when deciding whether to create a link.
const AL_LEX_LEAD_STRIP = /^(and|the|to|of|in|for|so|that|he|it|they)\s+/i;
function cleanEnWordAL(w) { return String(w || '').replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''); }
function cleanAutoLinkWordAL(raw) {
  const s = String(raw || '');
  if (PALEO_LETTER_RE.test(s)) {
    const glyphsOnly = s.replace(/[^\u{10900}-\u{1091F}]/gu, '');
    return transliterate(glyphsOnly, { script: 'paleo-hebrew' }).toLowerCase();
  }
  return cleanEnWordAL(s).toLowerCase();
}
// Mirrors Translate.jsx's identically-named CAMEL_SEGMENT_RE/lastCamelSegment
// (deliberately duplicated \u2014 this page doesn't share link-processing logic
// with the Studio by import, same convention as glossOwnerMap/glossTokens
// above). Hebrew-extra's own fused-prefix convention ("HaRaqayai",
// "MiThachath", "MeIl"...) bakes a grammar prefix onto its root as one
// CamelCase word, but fieldy's English spells that prefix as its own plain
// word ("the raqayai", "from thachath") \u2014 so the bare ROOT (the final
// CamelCase segment) needs to be a candidate too, or Auto-Link's "missing"
// underline flags these as unmatched even though the concept IS curated.
const AL_CAMEL_SEGMENT_RE = /^[A-Z][a-z]*(?:[A-Z][a-z]*)+$/;
function lastCamelSegmentAL(word) {
  if (!AL_CAMEL_SEGMENT_RE.test(word)) return null;
  const segs = word.split(/(?=[A-Z])/);
  return segs[segs.length - 1] || null;
}
function lexTranslitCandidatesAL(val) {
  if (!val || val === '\u2014') return [];
  const s = String(val);
  const slashIdx = s.indexOf('/');
  const dashIdx = s.indexOf(' - ');
  const cut = slashIdx >= 0 && dashIdx >= 0 ? Math.min(slashIdx, dashIdx) : Math.max(slashIdx, dashIdx);
  let left = (cut >= 0 ? s.slice(0, cut) : s).trim();
  // Older no-separator entries store the gloss as a trailing parenthetical
  // instead \u2014 "Mayam (waters)" \u2014 see Translate.jsx's lexTranslitCandidates
  // for the full note; same fix, same reason, mirrored here.
  left = left.replace(/\s*\(.*$/, '').trim();
  let prev;
  do { prev = left; left = left.replace(AL_LEX_LEAD_STRIP, '').trim(); } while (left !== prev);
  if (!left) return [];
  const words = left.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = new Set([words.join('').toLowerCase(), words[words.length - 1].toLowerCase()]);
  for (const w of words) {
    const root = lastCamelSegmentAL(w);
    if (root) out.add(root.toLowerCase());
  }
  return [...out].filter(Boolean);
}

// Mirrors Translate.jsx's identically-named translitMatches/
// FUZZY_TRANSLIT_MIN_LEN (deliberately duplicated, same reason as everywhere
// else on this page). A word is a match if the SHORTER of the two translit
// strings is a suffix of the longer one — handles fieldy's own
// transliteration spelling for the same root differing by a Hebrew prefix
// morpheme between one verse's English and another's stored lexicon value
// (e.g. lexicon "hayah" vs. English "WaYaHayah"), in either direction.
const FUZZY_TRANSLIT_MIN_LEN_AL = 4;
function translitMatchesAL(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= FUZZY_TRANSLIT_MIN_LEN_AL && longer.endsWith(shorter);
}
// srcCandidates is a Set of exact candidate strings (sourceCandidateSet
// above) — Set.has() alone only catches exact matches, so this walks it
// with the fuzzy suffix comparison instead of a plain membership test.
function candidateSetHasFuzzyAL(set, word) {
  if (!set || !word) return false;
  for (const c of set) { if (translitMatchesAL(c, word)) return true; }
  return false;
}
// Every transliteration string this language's OWN verse tokens could
// possibly be auto-linked against, from their own lexicon `.gloss` values.
// Only meaningful for the generic (!rich) MultiWordBlock languages \u2014 BHS's
// Strong's-tagged tokens are a completely different, already-comprehensive
// system (per-component translit, not a flat lexicon gloss), and flagging
// "missing" there would just be noise on top of a system that already
// covers virtually every word.
function sourceCandidateSet(words) {
  const set = new Set();
  for (const w of words || []) {
    if (w?.is_punct) continue;
    for (const c of lexTranslitCandidatesAL(w?.gloss)) set.add(c);
  }
  return set;
}

function glossTokens(words, mode) {
  const out = words.map((w, idx) => ({ idx, text: w, hide: false }));
  for (let i = 1; i < out.length; i++) {
    if (!out[i].text.startsWith('(')) continue;
    let j = i;
    while (j < out.length && !out[j].text.includes(')')) j++;
    if (j >= out.length) break;                       // unclosed — leave it alone
    const head = out[i - 1];
    const headBare = head.text.replace(GLOSS_TRAIL, '');
    // The preceding token must end in a letter. KNOWN LIMITATION, shared with the
    // Reader's GLOSS_RE: any "word (parenthetical)" is treated as a gloss, so an
    // editorial aside such as "note (see below)" is folded too. Kept identical to
    // the Reader deliberately — the two views must not disagree about what a gloss
    // is. Fix it in one place if it ever matters, not here alone.
    if (head.hide || !/[A-Za-z\u00C0-\u024F]$/.test(headBare)) { i = j; continue; }
    const joined = out.slice(i, j + 1).map(t => t.text).join(' ');
    const inner  = joined.replace(/^\(/, '').replace(/\)[^)]*$/, '').trim();
    const tail   = (joined.match(/\)([.,;:!?'"\u2019\u201d]*)$/) || ['', ''])[1];
    // An empty parenthetical — "()" with nothing (or only whitespace) inside,
    // e.g. a component whose translation came back blank — carries no
    // information in ANY mode, 'both' included. Hide it unconditionally so a
    // reader never sees a bare "()" hanging off a word ("Alahayam ()").
    // Fieldy, 2026-08-16: "Empty glosses shouldn't have parens in this view."
    if (!inner) {
      if (tail) head.text = head.text + tail;
      for (let k = i; k <= j; k++) out[k].hide = true;
      i = j;
      continue;
    }
    if (mode === 'both') continue;   // non-empty gloss, 'both' mode: leave fully visible
    if (mode === 'gloss') {
      const headTrail = (head.text.match(/[.,;:!?'"\u2019\u201d]+$/) || [''])[0];
      head.text = inner + (headTrail || tail);
    } else if (tail) {
      head.text = head.text + tail;                   // keep sentence punctuation
    }
    for (let k = i; k <= j; k++) out[k].hide = true;
    i = j;
  }
  return out;
}

// Maps every word index to the index of its "head" — the transliteration word
// a following "(gloss)" parenthetical belongs to (a head maps to itself; a
// gloss-parenthetical's tokens map to their head; anything else is absent).
// Mirrors glossTokens' own parenthetical-detection rules (deliberately
// duplicated — see that function's header comment on why this page doesn't
// share logic with the Reader by import). Used so hovering EITHER half of a
// "raashayath (beginning)" pair — or the Hebrew word-block that links to
// it — highlights both halves together, instead of only whichever single
// index a link happened to be recorded against. Fieldy, 2026-08-16: "I want
// the gloss highlighted as well so raashayath (beginning)."
function glossOwnerMap(words) {
  const owner = {};
  for (let i = 1; i < words.length; i++) {
    if (!words[i].startsWith('(')) continue;
    let j = i;
    while (j < words.length && !words[j].includes(')')) j++;
    if (j >= words.length) break;
    const headIdx = i - 1;
    if (owner[headIdx] !== undefined) { i = j; continue; }   // head already claimed
    const headBare = words[headIdx].replace(GLOSS_TRAIL, '');
    if (!/[A-Za-z\u00C0-\u024F]$/.test(headBare)) { i = j; continue; }
    owner[headIdx] = headIdx;
    for (let k = i; k <= j; k++) owner[k] = headIdx;
    i = j;
  }
  return owner;
}

// Keep the most-recent link per unique token-set that carries english_indices.
function dedupeLinks(links) {
  const byTok = {};
  links.forEach(l => {
    const key = JSON.stringify(parseJ(l.token_ordinals, []));
    const ei  = parseJ(l.english_indices, []);
    (byTok[key] || (byTok[key] = [])).push({ ...l, _ei: ei });
  });
  const out = [];
  for (const entries of Object.values(byTok)) {
    const withIdx = entries.filter(e => e._ei.length > 0);
    const pool = withIdx.length ? withIdx : entries;
    out.push(pool.reduce((best, e) => (e.id > best.id ? e : best)));
  }
  return out;
}

// `avoid`, if given, is a Set of word-indices already claimed by an earlier
// link's resolved span — the search skips any candidate span overlapping it,
// so a SECOND link sharing the same phrase text finds the phrase's SECOND
// occurrence instead of colliding on the first. See resolvePhraseLinks below,
// which is what actually orders and feeds these calls. Mirrors the identical
// fix in Translate.jsx (deliberately duplicated — this page doesn't share
// link-processing logic with the Studio by import, same convention as
// glossOwnerMap/glossTokens above).
function findPhraseIndices(phrase, words, avoid) {
  const ph = phrase.trim().split(/\s+/);
  const clean = w => w.replace(/[,.!?;:]+$/, '').toLowerCase();
  for (let i = 0; i <= words.length - ph.length; i++) {
    if (avoid && avoid.size && Array.from({ length: ph.length }, (_, k) => i + k).some(idx => avoid.has(idx))) continue;
    if (words.slice(i, i + ph.length).map(clean).join(' ') === ph.map(clean).join(' '))
      return Array.from({ length: ph.length }, (_, k) => i + k);
  }
  return [];
}

// Resolves every link's english_indices in place, walked in the SOURCE
// tokens' own reading order (token_ordinals[0] ascending) so two links that
// share identical phrase text — the same word linked twice, once per
// occurrence — claim successive occurrences instead of both colliding on the
// first. Fieldy, 2026-08-16: "the order matters... assume my usage will be
// in the order of the words themselves." Mutates and returns the same array.
function resolvePhraseLinks(links, enWords) {
  const claimed = new Set();
  for (const l of links) if (l.english_indices?.length) l.english_indices.forEach(i => claimed.add(i));
  const needsPhrase = links
    .filter(l => !l.english_indices?.length && l.english_phrase)
    .sort((a, b) => (a.token_ordinals?.[0] ?? 0) - (b.token_ordinals?.[0] ?? 0));
  for (const l of needsPhrase) {
    l.english_indices = findPhraseIndices(l.english_phrase, enWords, claimed);
    l.english_indices.forEach(i => claimed.add(i));
  }
  return links;
}

// Heb-extra's rich/grouped token stream (/api/tokens?source=HEB) decomposes each
// NATIVE whitespace-delimited HEB word (the same words Translate.jsx's Auto-Link
// stores established links against, via /api/source/HEB/*) into one or more
// BHS-style morpheme components, and can also FUSE several consecutive native
// words into one display block (e.g. a maqaf-joined "Ath" + "HaRaqayai" render
// as one rich block, three components, one Strong's badge). Its own
// token_ordinal numbering is therefore NOT the native per-word ordinal scheme
// links are stored against (see the 2026-08-27 hover-mislink postmortem in
// project memory: hovering "badal" lit up "HaRaqayai" because the two schemes
// disagree on what ordinal 5 means). fieldy wants to KEEP the rich/Strong's-badge
// display, so instead of falling back to the plain native-list render (the
// original narrow fix), this reconciles the two schemes: walk both lists in
// native-word order, greedily consuming each rich block's own non-mark
// component glyphs until they reconstruct a native word's raw glyphs
// (codepoint-safe via Array.from — see fix-heb-extra-surfaces.js's established
// convention for why plain .length/[i] indexing corrupts Paleo-Hebrew surrogate
// pairs), and return nativeOrd -> that block's own representative token_ordinal
// (the same field WordBlock's `compOrds` keys hover-matching off of). Best-effort
// by design: a spelling mismatch between HEB's own text and BHS's reconstructed
// word_raw (a known, documented recurring drift in this corpus) just means that
// one word doesn't get remapped — no highlight for it, same as pre-fix behavior
// for that one word — it never throws or corrupts anything else in the verse.
function buildHebNativeOrdMap(nativeWords, richBlocks) {
  const map = new Map();
  let ni = 0;
  for (const block of richBlocks) {
    const comps = block.components?.length
      ? block.components
      : [{ token_ordinal: block.token_ordinal, paleo: block.word_raw || block.word || '', isMark: false }];
    let ci = 0;
    while (ci < comps.length) {
      if (comps[ci].isMark) { ci++; continue; }
      if (ni >= nativeWords.length) break;
      const nw = nativeWords[ni];
      const targetLen = Array.from(nw.word || '').length;
      let acc = 0;
      // Record the SPECIFIC component ordinal(s) this native word actually
      // consumes, not the block's own overall representative ordinal — a
      // fused block's components carry their own distinct ordinals (e.g. a
      // block spanning native words 8/9/10 has components ordinal 9, then
      // two components ordinal 10, then two components ordinal 11), and
      // WordBlock's per-glyph highlight (`hoveredOrds.has(ord)`, keyed off
      // each component's OWN ordinal, not the block's) lights up whichever
      // ordinal we hand it. Mapping every native word in the block to the
      // block's last-component ordinal made every native word in a fused
      // block glow the LAST word's own components — e.g. hovering
      // "thachath" (native word 9, "MiThachath") lit up "LaRaqayai"
      // (native word 10's components, which happen to share the block's
      // own token_ordinal) instead of "Ma"/"Thachatha" (ordinal 10).
      const consumedOrds = new Set();
      while (ci < comps.length && acc < targetLen) {
        if (!comps[ci].isMark) {
          acc += Array.from(comps[ci].paleo || '').length;
          consumedOrds.add(comps[ci].token_ordinal != null ? comps[ci].token_ordinal : block.token_ordinal);
        }
        ci++;
      }
      map.set(nw.ord, consumedOrds.size ? [...consumedOrds] : [block.token_ordinal]);
      ni++;
      if (targetLen === 0) break; // a zero-length native word can never satisfy acc<targetLen — bail, don't spin
    }
  }
  return map;
}

// Click-to-copy — same mechanism as HebrewViewer's WordBlock / MultiWordBlock:
// copy the Paleo glyphs (or the source-language word) and flash the shared
// `.copied` → `::after "Copied!"` tooltip. No new copy UI is introduced here.
function copyOnClick(el, text) {
  if (!el || !text) return;
  try {
    navigator.clipboard.writeText(text);
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1500);
  } catch { /* ignore */ }
}

// H0430 / 430 / h430 all become H430, so a chip's href matches the root
// explorer's keys however the value was stored.
const fmtSN = sn => (sn ? 'H' + String(sn).replace(/^[Hh]+/, '') : '');
// H9000+ are virtual/grammar codes (connectors, prepositions, articles) —
// the root-index builder deliberately skips them, so /roots?sn=H9xxx always
// 404s. Same check as WordBlock.jsx; keep the badge but drop the link.
const isVirtualSN = sn => {
  const n = parseInt(String(sn).replace(/^[Hh]/, ''), 10);
  return !isNaN(n) && n >= 9000;
};

// ─── A single source word block ──────────────────────────────────────────────
// `rich` = this language has a Strong's-tagged token stream, so it renders
// glossed Paleo components (per-component colour + highlight). It used to be
// `isBHS`, a language-name test, which sent HEB — which HAS that token stream —
// down the plain surface+gloss path, so the same Hebrew read fully decomposed in
// one pane and as bare glyphs in the other. Ask the capability, not the name.
function WordBlock({ word, showSub, rich, isPaleoScript, dir, hoveredOrds, onHoverLink, blockLinks, lang }) {
  const linked = blockLinks.length > 0;
  const enter = () => linked && onHoverLink(blockLinks);
  const leave = () => linked && onHoverLink(null);

  if (!rich) {
    // The SAME renderer the novel reader (MultiViewer.jsx) and Gloss Studio
    // use for every non-Hebrew script — glyph, transliteration (computed
    // client-side from the raw word via lib/translit.js, script-detected so
    // Ge'ez/Greek/Latin/Syriac/Hebrew-extra square script all need zero
    // per-language code here), gloss, and gold-vs-dim coloring for whether
    // this word actually has a curated gloss. This page used to carry its
    // OWN bespoke glyph+gloss-only block with no transliteration line and no
    // color treatment at all — see the import comment above for the ask
    // this replaced it for. `word` already carries every field
    // MultiWordBlock reads (word/word_norm/gloss_key/gloss/is_punct/punct/
    // trailMark/lemma/strongs) — see the src.push sites in loadChapter.
    const hl = hoveredOrds.has(word.token_ordinal);
    return (
      <div className={`par-mwb-wrap ${linked ? 'lnk' : ''} ${hl ? 'hl' : ''}`}
           onMouseEnter={enter} onMouseLeave={leave}>
        <MultiWordBlock token={word} source={lang} />
      </div>
    );
  }

  const comps = word.components?.length
    ? word.components
    : [{ paleo: word.word_raw || '', css: 'root', token_ordinal: word.token_ordinal }];

  // A maqaf baked WITHIN this single word's own components (a two-part
  // construct chain sharing one token, e.g. Genesis 1:11's עַל־הָאָרֶץ, "Il" +
  // maqaf + "HaAratz") is NOT the same bug as a maqaf trailing off to a
  // wholly separate next word (that case is handled by the standalone
  // divider VerseRow inserts between word-blocks, below). Left alone here,
  // computeParts-equivalent logic just flattens BOTH halves into one
  // unbroken transliteration ("IlHaAratz") with nothing to show a maqaf ever
  // existed between them. Mirrors components/WordBlock.jsx's own
  // maqafSplit: split on every isMaqaf component, and only treat it as a
  // genuine compound when EVERY resulting half has real (non-mark) content —
  // a maqaf with nothing on one side is an ordinary trailing mark and falls
  // through to the normal (non-split) render below.
  let maqafHalves = null;
  if (comps.some(c => c.isMaqaf)) {
    const segs = [[]];
    for (const c of comps) {
      if (c.isMaqaf) { segs.push([]); continue; }
      segs[segs.length - 1].push(c);
    }
    if (!segs.some(s => s.length === 0)) maqafHalves = segs;
  }
  if (maqafHalves) {
    return (
      <div className={`word-block maqaf-chip ${linked ? 'lnk' : ''}`} onMouseEnter={enter} onMouseLeave={leave}
           style={{ flexDirection: 'row', alignItems: 'flex-start', gap: '2px' }}>
        {maqafHalves.flatMap((seg, hi) => {
          const els = [];
          if (hi > 0) {
            els.push(<span key={`d${hi}`} className="par-maqaf-divider" aria-hidden="true">-</span>);
          }
          // Recurse — each half is rendered by this SAME function, reusing
          // every existing glyph/translit/gloss code path unchanged instead
          // of a second copy of it. blockLinks/onHoverLink are intentionally
          // empty here: the OUTER chip div (above) already fires the
          // English<->Hebrew hover-link for the combined word; per-glyph
          // highlight (hoveredOrds) still works inside the recursive call
          // regardless, since that reads token_ordinal directly off comps.
          els.push(
            <WordBlock key={`h${hi}`}
                       word={{ token_ordinal: seg[0]?.token_ordinal ?? word.token_ordinal, components: seg }}
                       showSub={showSub} rich={rich} isPaleoScript={isPaleoScript} dir={dir}
                       hoveredOrds={hoveredOrds} onHoverLink={() => {}} blockLinks={[]} />
          );
          return els;
        })}
        {/* One badge for the WHOLE compound (not one per half) — the fetched
            word already carries word_raw/strongs for the combined form, and
            splitting that accurately per half would need per-token surf/SN
            data this page doesn't fetch. Matches components/WordBlock.jsx's
            own coreStrongs badge, which is likewise shown once at the end. */}
        {showSub && (word.word_raw || word.strongs) && (
          <div className="strongs-badge" style={{ alignSelf: 'flex-start', marginTop: '4px' }}>
            <span className="surf-sn-group" style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
              {word.word_raw && (
                <a className="surf-badge-link"
                   href={`/surfaces?${new URLSearchParams({ word: word.word_raw })}`}
                   title={`Browse surface ${word.word_raw}`}
                   onClick={(e) => e.stopPropagation()}>surf</a>
              )}
              {word.strongs && (
                isVirtualSN(word.strongs) ? (
                  <span className="sn-link root sn-virtual"
                        title="Grammar/virtual code — no root entry"
                        style={{ opacity: 0.6, cursor: 'default' }}
                        onClick={(e) => e.stopPropagation()}>{fmtSN(word.strongs)}</span>
                ) : (
                  <a className="sn-link root"
                     href={`/roots?sn=${fmtSN(word.strongs)}`}
                     title={`Explore root ${fmtSN(word.strongs)}`}
                     onClick={(e) => e.stopPropagation()}>{fmtSN(word.strongs)}</a>
                )
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Sub-line glosses: root gloss + bracketed modifier glosses (mirrors reference).
  let rootTrans = null; const mods = [];
  if (showSub) {
    // A block with no root-class component is headed by its proper noun — same
    // rule as components/WordBlock.jsx, so a name reads (𐤉𐤔𐤅𐤏) here too.
    const hasRootComp = comps.some(c => c && c.css === 'root');
    comps.forEach((c, i) => {
      // Mark tokens (maqaf ־, sof-pasuq ׃, paseq …) carry no real gloss — the
      // server sets their `translation` field to the mark character itself,
      // which otherwise slips through as a bogus extra modifier chip (e.g.
      // "[and-He/It-־]"). Mirrors components/WordBlock.jsx's isMark skip;
      // this page duplicates that logic instead of reusing WordBlock.
      if (c.isMark) return;
      const clean = (c.translation || '').replace(/[[\]]/g, '');
      // isPlaceholderGloss is IMPORTED, not re-implemented: the redundancy rule
      // (gloss === transliteration) must never hide the paleo placeholder that
      // marks a word still needing a lexicon entry.
      const suppress =
        (!clean || clean.toLowerCase() === (c.translit || '').toLowerCase()) &&
        !isPlaceholderGloss(c, clean);
      if (suppress) return;
      if (c.css === 'root' || (!hasRootComp && c.css === 'mod-nmpr')) rootTrans = clean;
      else mods.push(<span key={i} className={c.css}>{clean}</span>);
    });
  }
  const modRun = mods.reduce((acc, m, i) => i ? [...acc, <span key={`b${i}`} className="brk">-</span>, m] : [m], []);

  return (
    <div className={`word-block ${linked ? 'lnk' : ''}`} onMouseEnter={enter} onMouseLeave={leave}>
      <div className="paleo">
        <span className="visible-text"
              onClick={(e) => { const el = e.target.closest && e.target.closest('.clickable-comp'); if (el) copyOnClick(el, el.getAttribute('data-paleo') || ''); }}>
          {comps.map((c, i) => {
            const ord = c.token_ordinal != null ? c.token_ordinal : word.token_ordinal;
            const hl = hoveredOrds.has(ord);
            // A trailing maqaf (־) never draws inline in this word's own glyph
            // row — it gets a real standalone divider between this
            // word-block and the next instead (see VerseRow below). Other
            // marks (sof-pasuq ׃, paseq …) keep their previous inline
            // treatment below — only the maqaf's placement was the reported
            // bug. Previously a maqaf rendered inline here, flush against
            // THIS word's own edge — which is what actually made it read as
            // glued to one word instead of sitting between both.
            if (c.isMark && c.isMaqaf) return null;
            // Punctuation / non-Paleo marks (sof-pasuq ׃, maqaf ־, the : stops)
            // carry no Paleo glyph — render the mark itself as text, the way the
            // Ge'ez reader shows ፡ / ። inline, instead of a blank block.
            if (!hasPaleo(c.paleo)) {
              const mark = c.paleo || word.word_raw || '';
              return (
                <span key={i} className={`${c.css} clickable-comp paleo-punct ${hl ? 'hl' : ''}`}
                      data-paleo={mark}
                      title={`Copy ${mark}`}
                      style={{ fontSize: '0.5em', opacity: 0.75, padding: '0 0.12em', alignSelf: 'center' }}>
                  {mark}
                </span>
              );
            }
            return (
              <span key={i} className={`${c.css} clickable-comp ${hl ? 'hl' : ''}`}
                    data-paleo={c.paleo}
                    title={c.translit ? `Copy ${c.paleo} (${c.translit})` : `Copy ${c.paleo}`}
                    dangerouslySetInnerHTML={{ __html: safeSVG(c.paleo) }} />
            );
          })}
        </span>
      </div>
      {showSub ? (
        <div className="w">
          <span className="w-translit">
            {/* Mark tokens (maqaf ־, sof-pasuq ׃, paseq …) never get their own
                translit span here — a maqaf specifically is rendered as its
                own SIBLING between this word-block and the next one (see
                VerseRow below), not embedded inside this block's own
                (centered, width-capped) translit line. Embedding it here
                first put the dash flush against THIS word's own right edge,
                with the real gap to the next word-block landing entirely
                AFTER it — reading as glued to one word instead of sitting
                between both, exactly the "at the end of one" bug reported
                against this page. */}
            {comps.map((c, i) => c.isMark ? null : <span key={i} className={c.css}>{c.translit}</span>)}
          </span>
          {(rootTrans || mods.length) ? (
            <>{' '}<span className="brk">(</span>
              {rootTrans ? <span className="root">{rootTrans}</span> : null}
              {mods.length ? (
                <>{rootTrans ? ' ' : null}<span className="brk">[</span>{modRun}<span className="brk">]</span></>
              ) : null}
              <span className="brk">)</span>
            </>
          ) : null}
          {/* Same chips as the main reader, same destinations: surf -> the
              surface explorer for this exact form, H#### -> the root explorer.
              Without them a word here was a dead end, while the identical word
              in the reader was a link into the corpus-wide index. */}
          {(word.word_raw || word.strongs) && (
            // Breathing room between the gloss line and the chips. Inline rather
            // than in CSS because `.strongs-badge` is styled globally and shared
            // with the main reader — this keeps the change to this page.
            <div className="strongs-badge" style={{ marginTop: '7px' }}>
              <span className="surf-sn-group" style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
                {word.word_raw && (
                  <a className="surf-badge-link"
                     href={`/surfaces?${new URLSearchParams({ word: word.word_raw })}`}
                     title={`Browse surface ${word.word_raw}`}
                     onClick={(e) => e.stopPropagation()}>surf</a>
                )}
                {word.strongs && (
                  isVirtualSN(word.strongs) ? (
                    <span className="sn-link root sn-virtual"
                          title="Grammar/virtual code — no root entry"
                          style={{ opacity: 0.6, cursor: 'default' }}
                          onClick={(e) => e.stopPropagation()}>{fmtSN(word.strongs)}</span>
                  ) : (
                    <a className="sn-link root"
                       href={`/roots?sn=${fmtSN(word.strongs)}`}
                       title={`Explore root ${fmtSN(word.strongs)}`}
                       onClick={(e) => e.stopPropagation()}>{fmtSN(word.strongs)}</a>
                  )
                )}
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── One verse: English | source ─────────────────────────────────────────────
function VerseRow({ v, words, tx, showSub, rich, isPaleoScript, dir, isActive, onRefClick, hovered, setHovered, unaligned, glossMode, lang }) {
  // Verse 0 is a chapter title/superscription, not a real verse (see Reader.jsx's
  // matching treatment) — its English is typically one short line while its source
  // column is a handful of tall, stacked word-blocks (glyph + translit + gloss +
  // Strong's). With the grid's normal `align-items: start`, that short single line
  // sits pinned to the TOP of a row whose height is dictated by the taller source
  // column, so it visually reads as lined up with whatever comes AFTER it (the
  // start of verse 1) rather than with its own source words. Centering just this
  // row's columns keeps the title vertically matched to its own Hebrew, regardless
  // of which side is taller.
  const isTitle = v === 0;
  const links = tx?.links || [];
  const hoveredOrds = useMemo(() => {
    const s = new Set();
    if (hovered?.verse === v) hovered.links.forEach(l => (l.token_ordinals || []).forEach(o => s.add(o)));
    return s;
  }, [hovered, v]);
  const enIsHl = (idx) => hovered?.verse === v && hovered.links.some(l => (l.english_indices || []).includes(idx));
  const onHoverLink = useCallback((ls) => setHovered(ls ? { verse: v, links: ls } : null), [setHovered, v]);

  const enWords = (tx?.text || '').trim().split(/\s+/).filter(Boolean);
  // display list keeps each word's ORIGINAL index so english_indices still resolve
  const enTokens = useMemo(() => glossTokens(enWords, glossMode), [tx?.text, glossMode]);
  // idx -> its group's head idx (see glossOwnerMap) — a link recorded against
  // just the translit word's index still lights up its trailing "(gloss)" too,
  // and hovering the gloss itself now triggers the same link as its head word.
  const glossOwner = useMemo(() => glossOwnerMap(enWords), [tx?.text]);
  // "Missing in this translation" — see sourceCandidateSet's header comment.
  // null (not an empty Set) for BHS/rich languages, which turns the flag off
  // entirely below rather than flagging every word against zero candidates.
  const srcCandidates = useMemo(() => (rich ? null : sourceCandidateSet(words)), [words, rich]);

  return (
    <div className={`par-verse ${isTitle ? 'par-verse-title' : ''}`} data-verse={v}>
      <div className={`par-verse-ref ${isActive ? 'active-v' : ''}`} title={`View verse ${v}`}
           onClick={() => onRefClick(v)}>{v}</div>
      <div className="par-cols">
        <div className="par-col-en">
          {tx?.text?.trim() ? (
            <div className="en-verse-text">
              {enTokens.map(({ idx, text, hide }) => {
                if (hide) return null;
                // Route through the group's head index so a linked translit
                // word and its own trailing "(gloss)" parenthetical act as one
                // unit — hovering or linking either highlights both.
                const ownerIdx = glossOwner[idx] ?? idx;
                const link = links.find(l => (l.english_indices || []).includes(ownerIdx));
                // A word that OWNS a following "(gloss)" — i.e. is itself the
                // transliteration half of a "raashayath (beginning)" pair —
                // reads in the gold accent, same signal Reader.css's
                // .rd-root gives the identical pairing in the novel reader.
                // Fieldy, 2026-08-16, correcting an earlier miss that colored
                // the ORIGINAL-language column instead: "I want color for my
                // english hebrew glosses like the novel reader, the other
                // language... can remain grey."
                const isRoot = glossOwner[idx] === idx;
                // Flag a translit-head word as "missing in this translation"
                // when nothing in THIS language's own verse text carries a
                // lexicon gloss transliterating to it — i.e. the same check
                // Auto-Link itself would make, surfaced instead of silently
                // producing zero matches. Fieldy, 2026-08-17, after learning
                // Latin Genesis 1:5 genuinely has no word for "Alahayam":
                // "I would like to flag and display that information in the
                // reader... a word for `Alahayam` is missing from this
                // translation." Only for translit-head words with no
                // existing link — a plain word ("the", "and") or one that's
                // already linked has nothing to flag.
                const isMissing = isRoot && !link && srcCandidates && !candidateSetHasFuzzyAL(srcCandidates, cleanAutoLinkWordAL(text));
                // The trailing space used to live INSIDE the span (`{text}{' '}`),
                // so a highlighted/linked word's background/underline box
                // stretched to cover that space too — visibly oversized next to
                // its neighbor (fieldy, 2026-08-17: strip highlights to content).
                // Rendering it as a sibling text node after the span keeps the
                // same whitespace between words with no box around it.
                return (
                  <span key={idx}>
                    <span className={`en-w ${isRoot ? 'en-root' : ''} ${link ? 'lnk' : ''} ${enIsHl(ownerIdx) ? 'hl' : ''} ${isMissing ? 'en-missing' : ''}`}
                          title={isMissing ? `No matching word found in this translation for "${text.replace(GLOSS_TRAIL, '')}" — may be genuinely absent from this edition, or just not linked yet` : undefined}
                          onMouseEnter={() => link && setHovered({ verse: v, links: [link] })}
                          onMouseLeave={() => link && setHovered(null)}>
                      {text}
                    </span>
                    {' '}
                  </span>
                );
              })}
            </div>
          ) : <div className="no-translation">—</div>}
        </div>
        <div className="par-col-sep" />
        <div className="par-col-heb">
          <div className="heb-col-wrap" dir={dir} style={{ direction: dir }}>
            {unaligned && words.length === 0 ? (
              <div className="par-unaligned">Source text isn’t verse-aligned here — showing English only.</div>
            ) : words.flatMap((wordObj) => {
              const compOrds = wordObj.components?.length
                ? wordObj.components.map(c => c.token_ordinal != null ? c.token_ordinal : wordObj.token_ordinal)
                : [wordObj.token_ordinal];
              const blockLinks = links.filter(l => (l.token_ordinals || []).some(o => compOrds.includes(o)));
              const els = [
                <WordBlock key={wordObj.token_ordinal} word={wordObj} showSub={showSub} rich={rich}
                           isPaleoScript={isPaleoScript} lang={lang}
                           dir={dir} hoveredOrds={hoveredOrds} onHoverLink={onHoverLink} blockLinks={blockLinks} />
              ];
              // A trailing maqaf (־) couples this word to the NEXT one — a real
              // flex sibling BETWEEN the two word-blocks, not a glyph inside
              // either one's own (centered, width-capped) box. Rendering it as
              // its own flex item is what makes it land visibly in the gap
              // between blocks instead of glued to one side of it. Only for
              // `rich` (tokenised) sources — the plain (!rich) branch has no
              // `components` to carry a mark in the first place.
              if (rich && hasTrailingMaqaf(wordObj)) {
                els.push(
                  <span key={`${wordObj.token_ordinal}-mq`} className="par-maqaf-divider" aria-hidden="true">-</span>
                );
              }
              return els;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Parallel() {
  const [searchParams] = useSearchParams();
  // Path params from the clean-URL routes (/parallel/:bookSlug/:chapterVerse
  // and /parallel/:bookSlug — see App.jsx). Both are undefined when mounted
  // on the bare /parallel route (ParallelDispatcher already resolved any
  // legacy ?book=&chapter=&verse= into a redirect before Parallel ever
  // mounts on THAT path, so searchParams below is only a defensive fallback
  // for the bare-route case, not a second live source of truth).
  const pathParams = useParams();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();

  const [books, setBooks] = useState([]);
  const bookMeta = useRef({});
  const bhsBooks = useRef(new Set());   // ids that actually have Hebrew (BHS) tokens
  // chapterVerse is "13" (chapter only) or "13-3" (chapter-verse) — see
  // bookSlug.js's parallelHref, the only place this app WRITES that shape;
  // this is its exact inverse.
  const chapterVerseMatch = /^(\d+)(?:-(\d+))?$/.exec(pathParams.chapterVerse || '');
  // Capture the ORIGINAL book identifier once (path segment first, ?book=
  // only as the bare-route fallback described above). The URL-sync effect
  // rewrites it to a slug, so slug resolution must read this ref, not the
  // live (rewritten) URL — that race was what dropped a refresh back to
  // Genesis.
  const initialBookRef = useRef(pathParams.bookSlug ?? searchParams.get('book'));
  const bookIsSlug = !!initialBookRef.current && !/^\d+$/.test(initialBookRef.current);
  const [book, setBook] = useState(() => (/^\d+$/.test(initialBookRef.current || '') ? +initialBookRef.current : 1));
  const [bookResolved, setBookResolved] = useState(!bookIsSlug);   // slug URLs wait for the map
  const [chapter, setChapter] = useState(() => {
    if (chapterVerseMatch) return +chapterVerseMatch[1];
    return +searchParams.get('chapter') || 1;
  });
  const [verse, setVerse] = useState(() => {
    if (chapterVerseMatch) return chapterVerseMatch[2] != null ? +chapterVerseMatch[2] : null;
    const raw = searchParams.get('verse');
    return raw != null && raw !== '' ? +raw : null;
  }); // null = chapter mode
  const [lang, setLang] = useState(() => searchParams.get('lang') || 'BHS');
  const [tokensEmpty, setTokensEmpty] = useState(false);
  // What the loader ACTUALLY fetched — token stream or plain text. The renderer
  // must read this, never re-derive the answer: two independent computations of
  // the same fact will disagree, and when they do the rich renderer gets plain
  // data (no `components`, no `word_raw`) and draws an empty pane.
  const [wordsRich, setWordsRich] = useState(false);
  const [sources, setSources] = useState([{ id: 'BHS', label: 'Hebrew (BHS)', script: 'paleo-hebrew' }]);
  // Have the capability lookups (/api/books, /api/sources) SETTLED? Until they
  // have, langHasTokens() cannot answer — bhsBooks is an empty Set and `sources`
  // is the seed — and any chapter fetched meanwhile is fetched the wrong way.
  const [capsReady, setCapsReady] = useState(false);
  const loadSeq = useRef(0);          // guards against out-of-order chapter loads

  // Slug ↔ canon_id maps, built from the master book list (same input + slugify
  // as the Hebrew Viewer, so slugs match across readers). Numbers still resolve.
  const { slugToId, idToSlug } = useMemo(
    () => buildBookSlugs((books || []).map(b => {
      const id = b.book_id ?? b.id ?? b.canon_id;   // tolerate whichever id field the API returns
      return { id, name: b.name || BOOK_NAMES[id] };
    })),
    [books]
  );
  // Resolve a slug ?book=john to its canon_id once the book list loads. Reads the
  // captured ref (not the live URL, which the sync effect may have rewritten) and
  // flips bookResolved so the load/sync effects below can run against the real id.
  useEffect(() => {
    if (bookResolved) return;
    if (!Object.keys(slugToId).length) return;
    const id = slugToId[(initialBookRef.current || '').toLowerCase()];
    if (id != null) setBook(id);
    setBookResolved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookResolved, slugToId]);

  const [words, setWords] = useState([]);               // flat source words for the chapter
  const [translations, setTranslations] = useState({}); // verse -> { text, links }
  const [unaligned, setUnaligned] = useState(() => new Set()); // verses whose source blob was dropped
  const [status, setStatus] = useState('');
  const [hovered, setHovered] = useState(null);         // { verse, links: [...] }

  // Transliteration & gloss are NOT optional and never were. They are the whole
  // point of the parallel view, and /parallel must not diverge from the main
  // reader, which has no such switch. Kept as a const so every WordBlock below
  // still receives it and nothing else has to change.
  const showSub = true;
  const [perLine, setPerLine] = useState(() => localStorage.getItem('par-vpl') === '1');
  const [glossMode, setGlossMode] = useState(() => {
    try {
      const saved = localStorage.getItem(GLOSS_KEY);
      return GLOSS_MODES.some(m => m.id === saved) ? saved : GLOSS_DEFAULT;
    } catch { return GLOSS_DEFAULT; }
  });
  useEffect(() => {
    try { localStorage.setItem(GLOSS_KEY, glossMode); } catch { /* non-fatal */ }
  }, [glossMode]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── English text size (persisted) — same stepper pattern as Reader.jsx's
  // fontPx, just a narrower range/default suited to this page's two-column
  // layout (see PAR_FONT_MIN/MAX/DEFAULT above).
  const [fontPx, setFontPx] = useState(() => {
    const v = parseInt(localStorage.getItem('par-en-size') || '', 10);
    return (v >= PAR_FONT_MIN && v <= PAR_FONT_MAX) ? v : PAR_FONT_DEFAULT;
  });
  useEffect(() => { localStorage.setItem('par-en-size', String(fontPx)); }, [fontPx]);

  // ── English typeface (persisted) — same validate-against-catalogue pattern
  // as Reader.jsx's typeface state; see PAR_TYPEFACE_KEY/DEFAULT above for
  // why this page uses its own key instead of Reader's.
  const [typeface, setTypeface] = useState(() => {
    try {
      const saved = localStorage.getItem(PAR_TYPEFACE_KEY);
      return TYPEFACES.some(f => f.id === saved) ? saved : PAR_TYPEFACE_DEFAULT;
    } catch { return PAR_TYPEFACE_DEFAULT; }
  });
  useEffect(() => {
    try { localStorage.setItem(PAR_TYPEFACE_KEY, typeface); } catch { /* non-fatal */ }
  }, [typeface]);
  const typefaceStack = useMemo(
    () => (TYPEFACES.find(f => f.id === typeface) || TYPEFACES[0]).stack,
    [typeface]
  );

  // ── Hebrew glyph size (persisted) — reuses the app-wide --paleo-size/
  // --sub-size CSS vars (see useLocalStorageNumber's doc comment) under
  // page-scoped keys. The hook writes its value straight onto :root, which
  // would otherwise permanently shadow this page's old
  // `@media (max-width: 760px) { .pl-root { --paleo-size: 26px } }` rule
  // (an inline :root style always wins over a stylesheet rule, media query
  // or not) — so the FIRST-EVER default (nothing saved yet) is computed
  // from the viewport once here, to preserve the smaller mobile default a
  // reader who never opens the size stepper still gets. Once a reader
  // actually picks a size, that's what sticks regardless of viewport.
  const [paleoSize, setPaleoSize] = useLocalStorageNumber(
    'par-paleo-size', window.innerWidth <= 760 ? 26 : 30, '--paleo-size'
  );
  const [subSize, setSubSize] = useLocalStorageNumber('par-sub-size', 11, '--sub-size');

  const srcMeta = sources.find(s => s.id === lang) || { id: lang, label: lang, script: 'paleo-hebrew' };
  const dir = dirForScript(srcMeta.script);
  // Does THIS language carry a Strong's-tagged token stream for THIS book?
  // BHS: the /api/books set. Everything else: the source's own strongs_tokens +
  // token_books, straight from /api/sources — no hardcoded language list, so a
  // newly tagged edition starts rendering richly on its own.
  const langHasTokens = (l, b) => {
    if (!l || !b) return false;
    if (l === 'BHS') return bhsBooks.current.has(b);
    const meta = sources.find(o => o.id === l);
    if (!meta || !meta.strongs_tokens) return false;
    const range = meta.token_books;
    return !Array.isArray(range) || range.length !== 2 || (b >= range[0] && b <= range[1]);
  };
  // langHasTokens says the token stream SHOULD exist. tokensEmpty says the fetch
  // came back with nothing anyway — a book-id mismatch, a chapter the bake has
  // not reached, a 404. Never render an empty pane on the strength of a
  // capability flag: fall back to the text path, the same self-correcting shape
  // HebrewViewer uses when apiTokens returns empty.
  const rich = wordsRich;

  // Does a language actually carry this book? BHS = tokens_bhs set; everything
  // else = the sources list from /api/book-order.
  const langHasBook = useCallback((l, b) => {
    if (l === 'BHS') return bhsBooks.current.has(b);
    const m = bookMeta.current[b];
    return !!(m && m.sources && m.sources.includes(l));
  }, []);
  // Keep the chosen language if it has the book; otherwise walk the hierarchy
  // (Hebrew first) to the best available source that's offered in the dropdown.
  const bestLang = useCallback((b, desired) => {
    if (langHasBook(desired, b)) return desired;
    for (const l of LANG_PRIORITY) if (langHasBook(l, b) && (l === 'BHS' || sources.some(o => o.id === l))) return l;
    // Metadata couldn't confirm a source (book-order may omit per-book `sources`).
    // Never strand the user on BHS for a book it lacks — fall to the highest-
    // priority non-BHS source that's actually offered (HEB covers the whole
    // corpus), so navigating e.g. Genesis→John lands on Hebrew, not a blank.
    for (const l of LANG_PRIORITY) if (l !== 'BHS' && sources.some(o => o.id === l)) return l;
    const alt = sources.find(s => s.id !== 'BHS');
    return alt ? alt.id : desired;
  }, [langHasBook, sources]);

  // Self-heal: if the verse output throws in the current language, drop to the
  // next language that carries this book and hasn't already failed here — so the
  // reader ALWAYS lands on something rather than a dead error. Only when every
  // candidate has been tried does the boundary show its message.
  const triedLangs = useRef({});
  const onRenderError = useCallback(() => {
    const key = `${book}:${chapter}`;
    const tried = triedLangs.current[key] || (triedLangs.current[key] = new Set());
    tried.add(lang);
    const offered = (l) => l === 'BHS' || sources.some(o => o.id === l);
    const next = LANG_PRIORITY.find(l => !tried.has(l) && offered(l) && langHasBook(l, book))
              || LANG_PRIORITY.find(l => l !== 'BHS' && !tried.has(l) && offered(l));
    if (next && next !== lang) setLang(next);
  }, [book, chapter, lang, sources, langHasBook]);

  // If the current language can't render this book (e.g. BHS on an NT book or a
  // Hebrew-less work), hop to the highest-priority language that can. Depends on
  // `sources` too: the source catalog loads async, and until it's present
  // bestLang can't confirm a fallback is offered — so we must re-run when it lands.
  useEffect(() => {
    if (!bookResolved) return;
    if (books.length && !langHasBook(lang, book)) {
      const nl = bestLang(book, lang);
      if (nl !== lang) setLang(nl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, book, sources, bookResolved]);

  // URL sync — held until the slug is resolved so it can't rewrite /parallel/john
  // to a stale /parallel/1 before resolution (the refresh-to-Genesis race).
  // Writes the clean path form (/parallel/<slug>/<chapter>[-<verse>]) via
  // navigate() instead of rewriting query params — see bookSlug.js's
  // parallelHref, the single shared builder every page that links INTO
  // Parallel also uses, so the address bar and every internal link always
  // agree on the same URL shape.
  useEffect(() => {
    if (!bookResolved) return;
    navigate(parallelHref(book, idToSlug, chapter, verse, lang), { replace: true });
  }, [book, chapter, verse, lang, idToSlug, navigate, bookResolved]);

  useEffect(() => { localStorage.setItem('par-vpl', perLine ? '1' : '0'); }, [perLine]);

  // Books + source catalog
  useEffect(() => {
    // Master cross-language list — every canonical/promoted book, ordered and
    // named exactly like the readers (book-order.json). Includes chapter spans.
    fetch('/api/book-order').then(r => r.json()).then(list => {
      const bs = (list || []).map(b => ({
        book_id: b.id, name: b.name, first_chapter: b.first || 1, last_chapter: b.last || 1, sources: b.sources || [],
      }));
      bs.forEach(b => { bookMeta.current[b.book_id] = { first: b.first_chapter, last: b.last_chapter, sources: b.sources }; });
      setBooks(bs);
    }).catch(() => {});
    // Which books actually carry Hebrew (BHS) tokens — so we only leave BHS
    // selected where it has text, and offer a source that does otherwise.
    // BOTH are prerequisites for knowing how to fetch a chapter, so they settle
    // together and flip one flag. Note bhsBooks is a REF: writing it triggers no
    // re-render, so an early load could never self-correct for BHS the way the
    // `sources` dependency does for the others. The flag covers both.
    const booksP = fetch('/api/books').then(r => r.json()).then(bs => {
      bhsBooks.current = new Set((bs || []).map(b => b.book_id));
    }).catch(() => {});
    const sourcesP = fetch('/api/sources').then(r => r.json()).then(ss => {
      // Carry the CAPABILITY flags through. Dropping them here is why HEB kept
      // rendering plain: langHasTokens() asks `sources` for strongs_tokens, and
      // this map was rebuilding each source with only id/label/script, so the
      // answer was always undefined -> false.
      // ENG is excluded here deliberately — this page pairs the reading English
      // against an ORIGINAL-language source; offering English as that source
      // too produces a pointless English<->English comparison. Fieldy,
      // 2026-08-16: "there need not be a parallel english <> english choice."
      const opts = [{ id: 'BHS', label: 'Hebrew (BHS)', script: 'paleo-hebrew' }]
        .concat((ss || []).filter(s => s.id !== 'BHS' && s.id !== 'ENG' && s.available && !s.worksOnly)
                          .map(s => ({ id: s.id, label: s.label || s.id, script: s.script,
                                       strongs_tokens: !!s.strongs_tokens,
                                       token_books: s.token_books || null })));
      setSources(opts);
    }).catch(() => {});
    // `finally`, not `then`: if a lookup fails we still have to render — with
    // whatever capability we could determine — rather than hang on a blank pane.
    Promise.all([booksP, sourcesP]).finally(() => setCapsReady(true));
  }, []);

  // Load a chapter (multi-language). Source tokens come from the same endpoints
  // the Studio links against, so ordinals align with stored links.
  //
  // Fast path: the source /chapter endpoint already returns every token per verse,
  // and /translate/chapter returns per-verse links (newer server), so a whole
  // chapter loads in TWO parallel requests instead of ~2 + one-per-verse×2. A
  // per-verse fallback keeps it working against a server that predates chapter
  // links.
  const loadChapter = useCallback(async (b, c, l) => {
    // Only the newest load may write state. Two can be in flight whenever the
    // book, chapter or language changes faster than a fetch returns, and the
    // responses need not come back in order — a slow earlier one landing last
    // would repaint the pane with the chapter you just navigated away from.
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;

    setStatus('Loading…'); setWords([]); setTranslations({}); setUnaligned(new Set()); setHovered(null);
    setTokensEmpty(false); setWordsRich(false);
    try {
      const [txDataRaw, chap] = await Promise.all([
        fetch(`/api/translate/chapter?book=${b}&chapter=${c}&lang=${encodeURIComponent(l)}`)
          .then(r => r.ok ? r.json() : { verses: [] }).catch(() => ({ verses: [] })),
        langHasTokens(l, b)
          // /api/tokens 404s (returns {error}) for a book a source lacks; coerce to
          // an array so a missing book renders empty instead of crashing the page.
          // `source` is what keeps the two Hebrew editions apart — without it the
          // OT would be served whichever edition the book range guessed.
          ? fetch(`/api/tokens?book=${b}&chapter=${c}&source=${encodeURIComponent(l)}`)
              .then(r => r.ok ? r.json() : []).catch(() => [])
          : fetch(`/api/source/${encodeURIComponent(l)}/chapter?book=${b}&chapter=${c}`)
              .then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      // Overlay a non-admin's local Translate Studio edits (src/lib/localOverlay.js)
      // on top of the published chapter — same fetch this page always made, this
      // page just no longer shows stale published text for a verse you edited
      // locally. Admins see exactly what's published, unchanged.
      let txData = txDataRaw;
      const { isAdmin } = await getAdminStatus();
      if (!isAdmin) {
        const localOverrides = await getLocalVersesForChapter(b, c).catch(() => []);
        txData = { ...txDataRaw, verses: mergeChapterVersesWithLocal(txDataRaw.verses, localOverrides) };
      }

      let src;
      let usedTokens = langHasTokens(l, b);
      // Set below when the source's /chapter endpoint silently snapped to a
      // DIFFERENT chapter than the one requested (see the long comment further
      // down) — every verse in this chapter has no real text in this source,
      // so every VerseRow should show the "not verse-aligned" message rather
      // than a wordless blank pane.
      let payload = chap;
      if (usedTokens) {
        const got = Array.isArray(chap) ? chap : (chap?.tokens || chap?.words || chap?.rows || []);
        if (!got.length) {
          // The capability said yes and the endpoint said nothing. Rather than
          // show a blank pane, re-fetch the text form and render that — and say
          // so in the console, because this means the two disagree about which
          // book id addresses this book.
          console.warn(`[parallel] /api/tokens?book=${b}&chapter=${c}&source=${l} returned no tokens; ` +
                       `falling back to /api/source/${l}/chapter`);
          setTokensEmpty(true);
          usedTokens = false;
          payload = await fetch(`/api/source/${encodeURIComponent(l)}/chapter?book=${b}&chapter=${c}`)
            .then(r => r.ok ? r.json() : null).catch(() => null);
        }
      }
      const chapData = payload;
      // The source's /chapter endpoint silently snaps to that source's own
      // FIRST available chapter when the requested chapter has no rows there
      // (see its "graceful empty-chapter handling" in server.js) — meant for
      // a book that simply starts late (e.g. Ge'ez Apocalypse of Ezra has no
      // chapter 1). That's fine for a single-source reader, which shows the
      // snapped chapter number honestly. Here it's fatal: it splices an
      // unrelated chapter's verses in under the CHAPTER/VERSE THE READER
      // ASKED FOR, and if that other chapter happens to also have a verse N,
      // it renders as if it were a real translation of verse N. Concretely:
      // Syriac 4 Ezra/2 Esdras has no chapters 1-2 or 15-16 (the Christian-
      // only "5 Ezra"/"6 Ezra" additions aren't in the Peshitta) — asking for
      // chapter 16 snapped silently to chapter 3, and chapter 3 verse 13
      // "coincidentally" exists too, so 16:13 rendered chapter 3 verse 13
      // (about the choosing of Abraham) as if it were a Syriac translation of
      // the English 16:13 (about a bow's arrows). Treat a mismatched chapter
      // as "this language has no text here", not as real content.
      let chapterHasNoSourceText = false;
      if (!usedTokens && chapData && chapData.chapter != null && Number(chapData.chapter) !== Number(c)) {
        chapData.verses = [];
        chapterHasNoSourceText = true;
      }
      if (usedTokens) {
        src = Array.isArray(chapData) ? chapData : (chapData?.tokens || chapData?.words || chapData?.rows || []);
      } else {
        const verses = Array.isArray(chapData?.verses) ? chapData.verses : [];
        src = [];
        if (verses.some(v => Array.isArray(v.tokens))) {
          // Fast path: tokens are already in the chapter payload. Spread `t`
          // FIRST so every field /api/source/:src/verse|chapter returns rides
          // along (word_norm, gloss_key, is_punct, punct, lemma, strongs,
          // …) — MultiWordBlock (the shared non-Hebrew word renderer, see
          // the WordBlock !rich branch below) reads several of these that a
          // narrower {token_ordinal, word, gloss} pick used to drop.
          verses.forEach(v =>
            remapSourceVerseToDisplay(l, b, c, v.verse).forEach(dv =>
              (v.tokens || []).forEach((t, i) => src.push({
                ...t, verse: dv, token_ordinal: t.ord ?? (i + 1), word: t.word ?? '', gloss: t.gloss || '', _src: true,
              }))
            )
          );
        } else {
          // Fallback for a server whose /chapter omits tokens: fetch per verse.
          const vList = verses.length ? verses.map(x => x.verse)
                      : Array.isArray(chapData?.rows) ? [...new Set(chapData.rows.map(x => x.verse))] : [];
          await Promise.all(vList.map(vn =>
            fetch(`/api/source/${encodeURIComponent(l)}/verse?book=${b}&chapter=${c}&verse=${vn}`)
              .then(r => r.ok ? r.json() : { tokens: [] }).catch(() => ({ tokens: [] }))
              .then(sv => remapSourceVerseToDisplay(l, b, c, vn).forEach(dv =>
                (sv.tokens || []).forEach((t, i) => src.push({
                  ...t, verse: dv, token_ordinal: t.ord ?? (i + 1), word: t.word ?? '', gloss: t.gloss || '', _src: true,
                }))
              ))
          ));
        }
        src.sort((a, z) => a.verse - z.verse || a.token_ordinal - z.token_ordinal);
      }

      // Heb-extra's rich stream numbers ordinals differently than the native
      // list links are stored against (see buildHebNativeOrdMap's comment above).
      // Reconcile the two ONLY for HEB's rich render — every other language's
      // token_ordinal scheme already agrees with what its links were built
      // against, so this fetch/remap is skipped entirely for them.
      let hebOrdMapsByVerse = null;
      if (l === 'HEB' && usedTokens) {
        try {
          const nativeChap = await fetch(`/api/source/HEB/chapter?book=${b}&chapter=${c}`)
            .then(r => r.ok ? r.json() : null).catch(() => null);
          const nativeVerses = Array.isArray(nativeChap?.verses) ? nativeChap.verses : [];
          hebOrdMapsByVerse = new Map();
          for (const nv of nativeVerses) {
            const nativeWords = (nv.tokens || [])
              .map(t => ({ ord: t.ord, word: t.word || '' }))
              .sort((a, z) => a.ord - z.ord);
            const richBlocks = src.filter(w => w.verse === nv.verse).slice()
              .sort((a, z) => a.token_ordinal - z.token_ordinal);
            if (nativeWords.length && richBlocks.length) {
              hebOrdMapsByVerse.set(nv.verse, buildHebNativeOrdMap(nativeWords, richBlocks));
            }
          }
        } catch { /* best-effort — links just won't remap, same as pre-fix behavior */ }
      }
      const remapHebOrds = (links, verseNum) => {
        const ordMap = hebOrdMapsByVerse?.get(verseNum);
        if (!ordMap) return links;
        // ordMap now maps each native ordinal to an ARRAY of rich-block
        // component ordinals (a fused/decomposed native word can span more
        // than one), so this expands (flatMap) rather than 1:1 maps.
        return links.map(lk => ({
          ...lk,
          token_ordinals: [...new Set((lk.token_ordinals || []).flatMap(o => ordMap.get(o) ?? [o]))],
        }));
      };

      const tmap = {};
      const translated = (txData.verses || []).filter(vs => vs.text?.trim());
      const buildLinks = (rawLinks, enWords) => resolvePhraseLinks(
        dedupeLinks(rawLinks || []).map(lk => ({
          ...lk, token_ordinals: parseJ(lk.token_ordinals, []), english_indices: parseJ(lk.english_indices, []),
        })),
        enWords
      );

      if (translated.some(vs => Array.isArray(vs.links))) {
        // Newer server: links ride along on the chapter payload.
        translated.forEach(vs => {
          const enWords = (vs.text || '').trim().split(/\s+/).filter(Boolean);
          tmap[vs.verse] = { text: vs.text, links: remapHebOrds(buildLinks(vs.links, enWords), vs.verse) };
        });
      } else {
        // Fallback for a server without chapter links: fetch links per verse.
        await Promise.all(translated.map(vs =>
          fetch(`/api/translate/verse?book=${b}&chapter=${c}&verse=${vs.verse}&lang=${encodeURIComponent(l)}`)
            .then(r => r.ok ? r.json() : null).catch(() => null)
            .then(d => {
              const enWords = (vs.text || '').trim().split(/\s+/).filter(Boolean);
              tmap[vs.verse] = { text: vs.text, links: remapHebOrds(buildLinks(d?.links, enWords), vs.verse) };
            })
        ));
      }

      // ── Verse-alignment guard ──────────────────────────────────────────────
      // The English versification is the source of truth. Some sources store a
      // whole chapter's text under a single "verse" (e.g. Hebrew-extra for works
      // like Jasher), which would otherwise line a chapter's worth of paleo up
      // against one short English verse. If a verse's source-token count is far
      // out of proportion to its English word count, treat that verse's source as
      // un-aligned and drop it. Proportionate verses pass through untouched, so
      // normal Hebrew/Greek/Ge'ez/etc. render exactly as before.
      const dropped = new Set();
      // See chapterHasNoSourceText above: the ratio guard just below only
      // drops verses it can actually SEE some (disproportionate) source text
      // for, so it never fires when src is empty outright — mark every
      // English verse in this chapter as unaligned here instead, so the
      // reader gets the same "not verse-aligned" message a partial mismatch
      // would show, not a silent blank pane.
      if (chapterHasNoSourceText) {
        translated.forEach(vs => dropped.add(Number(vs.verse)));
      }
      if (l !== 'BHS' && src.length) {
        const enCount = {};
        for (const vs of (txData.verses || []))
          enCount[vs.verse] = (vs.text || '').trim().split(/\s+/).filter(Boolean).length;
        const srcCount = {};
        for (const w of src) srcCount[w.verse] = (srcCount[w.verse] || 0) + 1;
        for (const vn of Object.keys(srcCount)) {
          const ec = enCount[vn] || 0;
          // With an English verse to compare to, allow up to 5× its length (Hebrew
          // is usually ≤2×, so 5× only trips on a chapter-sized blob); with no
          // English, only trip on a large absolute block.
          const ceiling = ec > 0 ? Math.max(50, ec * 5) : 80;
          if (srcCount[vn] > ceiling) dropped.add(Number(vn));
        }
        if (dropped.size) src = src.filter(w => !dropped.has(w.verse));
      }

      if (stale()) return;
      setWords(src); setWordsRich(usedTokens);
      setTranslations(tmap); setUnaligned(dropped); setStatus('');
    } catch (e) { if (!stale()) setStatus('Error: ' + e.message); }
    // `sources` MUST be a dependency. With [] this callback captured the FIRST
    // render's sources — which is the hardcoded [{id:'BHS'}] seed, before
    // /api/sources has answered — so langHasTokens('HEB') was permanently false
    // in here and the loader always took the text path. The RENDERER, computing
    // the same thing from current state, said rich. Rich renderer + plain data =
    // the blank pane. Re-running when capability arrives is the point.
  }, [sources]);

  // Wait for capability before the FIRST fetch. Previously this fired
  // immediately, took the plain path because nothing was loaded yet, and only
  // corrected when `sources` arrived and re-ran it — so the first paint of a
  // freshly-mounted page showed the wrong thing (or nothing), and a manual
  // refresh "fixed" it only because the browser had /api/sources cached by then.
  // One load, once the answer is knowable.
  useEffect(() => {
    if (bookResolved && capsReady) loadChapter(book, chapter, lang);
  }, [book, chapter, lang, loadChapter, bookResolved, capsReady]);

  // Versification cross-reference note (added 2026-08-18, fieldy comparing this
  // page's Deuteronomy 13:3 against biblehub.com's interlinear and finding the
  // CONTENT disagreed — a genuine Hebrew-vs-English chapter/verse numbering
  // divergence, not a bug. FLIPPED 2026-08-20: display authority moved from
  // BHS/Masoretic to English/KJV-tradition numbering (fieldy: "I want my app to
  // line up with what everyone will line up with in their bible"), so `verse`/
  // `chapter` are now the English-authoritative numbers and this note shows the
  // Hebrew/BHS equivalent as a courtesy for anyone cross-referencing a
  // BHS-numbered source — the same information as before, opposite direction.
  // BHS-only concept (Greek/Ge'ez/Latin/Syriac editions don't have this
  // Hebrew/English split), and purely informational — never changes
  // book/chapter/verse state.
  const [versificationRanges, setVersificationRanges] = useState([]);
  useEffect(() => {
    if (lang !== 'BHS' || !bookResolved) { setVersificationRanges([]); return; }
    let cancelled = false;
    fetch(`/api/versification-note?book=${book}&chapter=${chapter}`)
      .then(r => r.ok ? r.json() : [])
      .then(ranges => { if (!cancelled) setVersificationRanges(Array.isArray(ranges) ? ranges : []); })
      .catch(() => { if (!cancelled) setVersificationRanges([]); });
    return () => { cancelled = true; };
  }, [lang, book, chapter, bookResolved]);
  // The single range covering the CURRENTLY SELECTED (English) verse, when one
  // is selected — a chapter can have more than one range (e.g. English Numbers
  // 16 draws from two BHS chapters), so this picks the one that actually
  // applies to what's on screen rather than showing the whole chapter's
  // breakdown. Response shape from /api/versification-note is now
  // {engStart, engEnd, hebChapter, hebStart} — see server.js's ENG_TO_HEB_NOTE.
  const versificationNote = useMemo(() => {
    if (verse == null || !versificationRanges.length) return null;
    const r = versificationRanges.find(r => verse >= r.engStart && verse <= r.engEnd);
    if (!r) return null;
    // Each range covers the SAME number of verses on both sides (a versification
    // split renumbers, it never adds/removes verses), so the correspondence
    // within a range is a simple linear offset — verse 2 in an engStart:1/
    // hebStart:2 range is (2 - 1 + 2) = heb verse 3, not "somewhere in 2-19".
    const hebVerse = verse - r.engStart + r.hebStart;
    return `Versification note: Hebrew (BHS) numbers this verse ${r.hebChapter}:${hebVerse}.`;
  }, [verse, versificationRanges]);

  // Verse list = union of source-token verses and English-baseline verses, so
  // the English column always renders even when the chosen source carries no
  // tokens for this book (e.g. BHS on Prayer of Manasseh) — no blank screen.
  const verseNums = useMemo(() => {
    const s = new Set(words.map(w => w.verse));
    for (const k of Object.keys(translations)) s.add(Number(k));
    return [...s].sort((a, b) => a - b);
  }, [words, translations]);
  const verseCount = verseNums.length ? Math.max(...verseNums) : 0;
  const wordsByVerse = useMemo(() => {
    const m = {}; words.forEach(w => (m[w.verse] || (m[w.verse] = [])).push(w));
    // Ge'ez word-separator/sentence-mark tokens arrive standalone — fold each
    // verse's onto its preceding real word (foldGeezPunct above), same as the
    // novel reader (MultiViewer.jsx) already does before handing tokens to
    // MultiWordBlock. Only GEZ ever emits is_punct tokens, so this is a no-op
    // for every other language.
    if (lang === 'GEZ') for (const v of Object.keys(m)) m[v] = foldGeezPunct(m[v]);
    return m;
  }, [words, lang]);

  const meta = bookMeta.current[book] || { first: 1, last: chapter };

  const goChapter = useCallback((c) => {
    if (c >= (meta.first || 1) && c <= (meta.last || c)) { setVerse(null); setChapter(c); }
  }, [meta]);
  const stepVerse = useCallback((d) => {
    if (verse == null) { goChapter(chapter + d); return; }
    const next = verse + d;
    if (next < 1) { if (chapter > (meta.first || 1)) { setChapter(chapter - 1); setVerse(-1); } }
    else if (next > verseCount) { if (chapter < (meta.last || chapter)) { setChapter(chapter + 1); setVerse(1); } }
    else setVerse(next);
  }, [verse, chapter, verseCount, meta, goChapter]);

  // After a backward cross-chapter step, -1 means "land on the last verse".
  useEffect(() => { if (verse === -1 && verseCount) setVerse(verseCount); }, [verse, verseCount]);

  // Mobile swipe → prev/next
  const touch = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) stepVerse(dx < 0 ? 1 : -1);
    touch.current = null;
  };

  const chapterOptions = [];
  for (let c = (meta.first || 1); c <= (meta.last || chapter); c++) chapterOptions.push(c);

  const visibleVerses = verse != null ? verseNums.filter(v => v === verse) : verseNums;
  const curBookName = (books.find(b => b.book_id === book) || {}).name || BOOK_NAMES[book] || `Book ${book}`;
  const refTitle = `${curBookName} ${chapter}${verse != null ? ':' + verse : ''}`;

  // ── browser tab title ──────────────────────────────────────────────────
  // Chapter view: "<book> <ch> | Parallel". Single-verse view appends a
  // short preview of THIS verse's English and transliterated source text
  // (see ../lib/versePreview.js) — matches BibleHub-style tabs, at the
  // reader's request, so a tab is identifiable/searchable on its own
  // instead of a dozen indistinguishable "Parallel" tabs.
  const titlePreviewParts = [refTitle, 'Parallel'];
  if (verse != null) {
    const enPreview = truncateTitle((translations[verse]?.text || '').trim(), 60);
    const srcPreview = truncateTitle(versePreviewTranslit(wordsByVerse[verse]), 60);
    if (enPreview) titlePreviewParts.push(enPreview);
    if (srcPreview) titlePreviewParts.push(srcPreview);
  }
  usePageTitle(titlePreviewParts.join(' | '));

  // Open the reader at this verse in the SAME source we're viewing here. Without
  // the source, the reader defaults to BHS — which blanks for a book that has no
  // Masoretic Hebrew (e.g. a NT verse shown in Heb·extra). Carrying lang keeps
  // Heb·extra on Heb·extra; BHS stays on the (source-less) BHS reader.
  const hebHref = `/?${lang && lang !== 'BHS' ? `source=${encodeURIComponent(lang)}&` : ''}book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`;

  return (
    <div className={`pl-root ${perLine ? 'verse-per-line' : ''} ${verse != null ? 'single-verse' : ''}`}
         style={{ '--par-en-size': `${fontPx}px`, '--par-en-font': typefaceStack }}>
      <div className="pl-top-bar">
        <div className="pl-row1">
          <Link to="/landing" className="pl-logo" title="Home" aria-label="Home">𐤀𐤁</Link>
          <h1 className="pl-title">Parallel</h1>
          <div className="pl-nav-group">
            <select value={book} onChange={e => {
              const nb = +e.target.value; const nl = bestLang(nb, lang);
              setChapter(1); setVerse(null); setBook(nb);
              if (nl !== lang) setLang(nl);
            }}>
              {books.map((b, i) => <option key={b.book_id} value={b.book_id}>{i + 1}. {b.name || BOOK_NAMES[b.book_id] || `Book ${b.book_id}`}</option>)}
            </select>
            <select value={chapter} onChange={e => { setVerse(null); setChapter(+e.target.value); }}>
              {chapterOptions.map(c => <option key={c} value={c}>Chapter {c}</option>)}
            </select>
            <select value={verse ?? ''} onChange={e => setVerse(e.target.value ? +e.target.value : null)}>
              <option value="">— verse —</option>
              {verseNums.map(v => <option key={v} value={v}>Verse {v}</option>)}
            </select>
            <select className="pl-lang" value={lang} onChange={e => setLang(bestLang(book, e.target.value))} title="Source language">
              {sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <span className="pl-status">{status}</span>
        </div>
        <div className="pl-row2">
          <Link className="pl-txt-btn" to={hebHref}>{(READER_NAME[lang] || 'Hebrew')} Viewer →</Link>
          <Link className="pl-txt-btn" to={`/bible?book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`}
                title="Open this passage in the Reader — flowing prose, no Strong's">📗 Reader →</Link>
          <Link className="pl-txt-btn" to={`/translate?book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`}>✎ Studio</Link>
          <button className="pl-icon-btn" onClick={toggleTheme} title="Toggle theme">{theme === 'light' ? '☾' : '☀'}</button>
          <button className="pl-icon-btn" onClick={() => setSettingsOpen(o => !o)} title="Display options">⚙</button>
        </div>
        {settingsOpen && (
          <div className="pl-settings">
            <label><input type="checkbox" checked={perLine} onChange={e => setPerLine(e.target.checked)} /> One verse per line</label>
            <div className="pl-gloss-row">
              <span className="pl-gloss-label">Text size</span>
              <div className="pl-size-stepper">
                <button type="button" className="pl-size-btn" disabled={fontPx <= PAR_FONT_MIN}
                        onClick={() => setFontPx(v => Math.max(PAR_FONT_MIN, v - 1))} aria-label="Smaller English text">A−</button>
                <span className="pl-size-val">{fontPx}</span>
                <button type="button" className="pl-size-btn" disabled={fontPx >= PAR_FONT_MAX}
                        onClick={() => setFontPx(v => Math.min(PAR_FONT_MAX, v + 1))} aria-label="Larger English text">A+</button>
              </div>
            </div>
            <div className="pl-gloss-row">
              <span className="pl-gloss-label">Hebrew size</span>
              <div className="pl-size-stepper">
                <button type="button" className="pl-size-btn" disabled={paleoSize <= PAR_PALEO_MIN}
                        onClick={() => { setPaleoSize(Math.max(PAR_PALEO_MIN, paleoSize - 2)); setSubSize(Math.max(PAR_SUB_MIN, subSize - 1)); }}
                        aria-label="Smaller Hebrew text">𐤀−</button>
                <span className="pl-size-val">{paleoSize}</span>
                <button type="button" className="pl-size-btn" disabled={paleoSize >= PAR_PALEO_MAX}
                        onClick={() => { setPaleoSize(Math.min(PAR_PALEO_MAX, paleoSize + 2)); setSubSize(Math.min(PAR_SUB_MAX, subSize + 1)); }}
                        aria-label="Larger Hebrew text">𐤀+</button>
              </div>
            </div>
            <div className="pl-gloss-row">
              <span className="pl-gloss-label">English typeface</span>
              <div className="pl-gloss-chips">
                {TYPEFACES.map(f => (
                  <button key={f.id} type="button"
                          className={`pl-gloss-chip ${typeface === f.id ? 'sel' : ''}`}
                          style={{ fontFamily: f.stack }}
                          onClick={() => setTypeface(f.id)}
                          aria-pressed={typeface === f.id}
                          title={f.note}>
                    <span className="pl-gloss-name">{f.label}</span>
                    <span className="pl-gloss-note">{f.note}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="pl-gloss-row">
              <span className="pl-gloss-label">Glosses</span>
              <div className="pl-gloss-chips">
                {GLOSS_MODES.map(m => (
                  <button key={m.id} type="button"
                          className={`pl-gloss-chip ${glossMode === m.id ? 'sel' : ''}`}
                          onClick={() => setGlossMode(m.id)}
                          aria-pressed={glossMode === m.id}
                          title={`Show ${m.label.toLowerCase()} — e.g. ${m.note}`}>
                    <span className="pl-gloss-name">{m.label}</span>
                    <span className="pl-gloss-note">{m.note}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pl-main" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="pl-head-row">
          <div className="pl-ref-title">{refTitle}</div>
          {verse != null && <button className="pl-txt-btn" onClick={() => setVerse(null)}>↑ Full chapter</button>}
          <button className="pl-txt-btn" onClick={() => setLegendOpen(o => !o)}>Legend ▾</button>
        </div>

        {versificationNote && (
          <div className="pl-versification-note">{versificationNote}</div>
        )}

        {legendOpen && (
          <div className="pl-legend">
            <span className="leg root">Root</span>
            <span className="leg mod-conj">Conjunction</span>
            <span className="leg mod-prep">Preposition</span>
            <span className="leg mod-art">Article</span>
            <span className="leg mod-nega">Negation</span>
            <span className="leg mod-nmpr">Proper noun</span>
            <span className="leg pfm-3ms">He/It (3ms)</span>
            <span className="leg vbs-hif">Causative</span>
            <span className="leg-note">Hover linked words to see correspondences · gold = match</span>
          </div>
        )}

        <div className="pl-output">
          {visibleVerses.length === 0 && !status && <div className="no-translation">No text available for this chapter.</div>}
          <VerseErrorBoundary key={`${book}-${chapter}-${lang}`} onError={onRenderError}>
            {visibleVerses.map(v => (
              <VerseRow key={v} v={v} words={wordsByVerse[v] || []} tx={translations[v]}
                        showSub={showSub} rich={rich} isPaleoScript={srcMeta.script === 'paleo-hebrew'} dir={dir}
                        isActive={verse === v} onRefClick={setVerse} unaligned={unaligned.has(v)}
                        hovered={hovered} setHovered={setHovered} glossMode={glossMode} lang={lang} />
            ))}
          </VerseErrorBoundary>
        </div>

        <button className="pl-side-nav prev" onClick={() => stepVerse(-1)} title="Previous">◀</button>
        <button className="pl-side-nav next" onClick={() => stepVerse(1)} title="Next">▶</button>
      </div>
    </div>
  );
}
