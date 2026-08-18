/**
 * MultiViewer.jsx — verse/chapter reader for LXX and Ge'ez.
 *
 * Mounted at `/` when ?source != hebrew. Mirrors the Hebrew Viewer's chrome
 * exactly: same TopBar with book/chapter/verse dropdowns, same action set
 * (Parallel link, source pills, presentation, settings), keyboard navigation
 * with arrow keys, and prev/next that chain across chapter and book
 * boundaries the way the Hebrew Viewer does.
 *
 * Tokens render via MultiWordBlock (same column-style block as Hebrew
 * WordBlock: word on top, translit + gloss below). No hover-cards.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { BOOK_NAMES } from '../lib/books.js';
import { buildBookSlugs, resolveBookParam, bookToParam, parallelHref } from '../lib/bookSlug.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { truncateTitle, versePreviewMultiTokens } from '../lib/versePreview.js';
import {
  apiSourceBooks, apiSourceDocs, apiSourceVerse, apiSourceChapter, apiSourceChapters,
  apiBookOrder, apiDocTokens,
} from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';
import BookChapterVerseSelects from '../components/BookChapterVerseSelects.jsx';
import MultiWordBlock from '../components/MultiWordBlock.jsx';
import WordBlock from '../components/WordBlock.jsx';
import './MultiViewer.css';

// Sources MultiViewer can render (GRC is reached only via the Works library).
//
// HEB's history here: it was in this list from when "Hebrew extra" had no tokens
// and was rendered as plain text; then removed once App.jsx routed every Hebrew
// source to HebrewViewer unconditionally, since HEB could then never arrive here at
// all. 2026-07-31: re-added, but narrowly — App.jsx's ReaderDispatcher now only
// sends source=HEB here when a `doc` param is present (a Works Library literary
// work, e.g. a Dead Sea Scroll, with no canonical book_id and no Strong's tokens
// baked by HebrewViewer's usual path). A bare canonical-book HEB visit (the
// BHS ⇄ Heb·extra toggle) still goes to HebrewViewer, unchanged — see the redirect
// effect below, DSS_INGESTION_PLAN.md, and CLAUDE.md's ingestion checklist. This is
// the ONLY Hebrew-script source in this list; the render branch below special-cases
// it (WordBlock + apiDocTokens) rather than the generic MultiWordBlock path every
// other source here uses.
const MULTI_SOURCES = ['LXX', 'GEZ', 'LAT', 'GRC', 'SYR', 'ENG', 'HEB'];

// Ge'ez punctuation folding. The tokenizer can emit a wordspace (፡) or section
// mark (። …) as its own standalone token, which then floats between word blocks
// AND duplicates the mark peeled onto each word. Fold every standalone Ethiopic
// punctuation token into the word before it as a single `trailMark`, keeping the
// STRONGEST mark (a sentence-ender ። outranks a wordspace ፡), and drop the
// standalone token. Result: one mark, hugging its word, and a sentence-ending
// word shows only "።" — never "፡" then a separate "።". Scoped to Ge'ez so other
// scripts' punctuation tokens are untouched.
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
        if (!out[j].is_punct) {                // attach to the last real word
          const prev = out[j].trailMark || '';
          out[j] = { ...out[j], trailMark: _geezRank(mark) >= _geezRank(prev) ? mark : prev };
          break;
        }
      }
      continue;                                // drop the standalone punctuation block
    }
    out.push(t);
  }
  return out;
}
// Scripture readers shown in the cross-source switcher. No GRC; the NT now
// lives inside LXX (Greek Scriptures), so there is no separate GNT button.
// Fixed language switcher: identical order in every language so the active one
// only highlights in place and never drops out / reshuffles the rest. Hebrew is
// consolidated here (BHS flagship for canonical books, corpus-Hebrew otherwise)
// so there's a single "Hebrew" — no separate "Heb·extra".
const SWITCHER = [
  { key: 'HEB', label: 'Hebrew'  },
  { key: 'GEZ', label: "Ge'ez"   },
  { key: 'SYR', label: 'Syriac'  },
  { key: 'LXX', label: 'Greek'   },
  { key: 'LAT', label: 'Latin'   },
  { key: 'ENG', label: 'English' },
];
// When the chosen book isn't in the current language, switch to the first of
// these that has it.
// Hebrew is the anchor — every other tradition is a translation that points back
// to it, so it always wins. Order: Hebrew (BHS, then the corpus.db Hebrew for
// apocrypha) → Ge'ez → Syriac → Greek → Latin; Greek-literature and
// English are last-resort fallbacks only.
const SOURCE_PRIORITY = ['BHS', 'HEB', 'GEZ', 'SYR', 'LXX', 'LAT', 'GRC', 'ENG'];
const PILL_LABEL = { BHS:'Hebrew', HEB:'Heb·extra', GEZ:"Ge'ez", SYR:'Syriac', LXX:'Greek', LAT:'Latin', ENG:'English' };
// BHS (bible.db) holds the Hebrew OT canon = canon_ids 1–39; it isn't a corpus.db
// source, so inject it as an available Hebrew witness for those books.
const HEBREW_OT = (id) => id >= 1 && id <= 39;
const SOURCE_LABELS = {
  LXX: 'Greek Scriptures',
  GEZ: "Ge'ez (BETMAS)",
  LAT: 'Latin (Vulgate)',
  GRC: 'Greek Literature',
  SYR: 'Syriac (Peshitta)',
  ENG: 'English',
  HEB: 'Hebrew (extra)',
};
const pickSource = (sources=[]) => SOURCE_PRIORITY.find(s => sources.includes(s)) || sources[0] || null;

export default function MultiViewer() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state — `doc` takes precedence over `book` when both are present.
  // doc = literary work (e.g. LIT0183EtanaMogar); book = canonical (1-71)
  const sourceRaw = (searchParams.get('source') || 'LXX').toUpperCase();
  const source  = sourceRaw === 'GNT' ? 'LXX' : sourceRaw;  // NT folded into Greek Scriptures
  const doc     = searchParams.get('doc') || null;
  const bookParam = searchParams.get('book') || '1';
  const chapter = parseInt(searchParams.get('chapter') || '1', 10);
  const verseParam = searchParams.get('verse');
  const verse   = verseParam != null ? parseInt(verseParam, 10) : null;
  const mode    = verse != null ? 'verse' : 'chapter';
  const usingDoc = !!doc;
  // Dead Sea Scrolls / any other doc-based (canon_id NULL) Hebrew work. These get
  // the same rich Strong's/morphology token stream canonical BHS/HEB books get
  // (via /api/tokens?doc=...), rendered with WordBlock — NOT the shallow
  // whitespace-tokenizer + flat-gloss path (v.tokens/MultiWordBlock) every other
  // MultiViewer source uses. See build-heb-index.mjs --docs and CLAUDE.md.
  const isHebDoc = usingDoc && source === 'HEB';

  // Data
  const [books, setBooks]             = useState([]);
  const [booksLoaded, setBooksLoaded] = useState(false);  // true once the books request SETTLES (ok or failed)
  const [booksSource, setBooksSource] = useState(null);   // which source `books` was loaded for
  const [docs, setDocs]               = useState([]);  // literary docs + canonical docs
  const [verseData, setVerseData]     = useState(null);
  const [chapterData, setChapterData] = useState(null);
  const [docTokens, setDocTokens]     = useState([]);   // rich Strong's tokens for isHebDoc (flat, per-verse)
  const [docTokensErr, setDocTokensErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [present, setPresent] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [tokenViewerOpen, setTokenViewerOpen] = useState(false);  // read-only raw-token panel
  const [docChapters, setDocChapters] = useState([]);
  const [masterBooks, setMasterBooks] = useState([]);  // [{id, sources:[...]}] cross-language order

  useEffect(() => { apiBookOrder().then(setMasterBooks).catch(() => setMasterBooks([])); }, []);

  // Slug ↔ canon_id, from the master book list (same input + slugify as the other
  // readers, so slugs agree app-wide). Slug URLs resolve once masterBooks loads;
  // numeric ?book still works.
  const { slugToId, idToSlug } = useMemo(
    () => buildBookSlugs((masterBooks || []).map(mb => {
      const id = mb.id ?? mb.book_id ?? mb.canon_id;   // tolerate whichever id field the API returns
      return { id, name: mb.name || BOOK_NAMES[id] };
    })),
    [masterBooks]
  );
  const book = resolveBookParam(bookParam, slugToId, 1);
  // A slug ?book= only resolves once the map loads; until then don't act on the
  // Genesis fallback for book-based locations (doc-based locations don't use it).
  const bookReady = !bookParam || /^\d+$/.test(bookParam) || Object.keys(slugToId).length > 0;

  // Which sources this book actually has (book-based only; docs route via Works).
  // `hasSource` folds the Greek family (LXX/GNT/GRC) onto the single "Greek" tab,
  // and returns true when we can't yet tell — so a tab is only ever disabled when
  // we KNOW the text is missing, never on a not-yet-loaded guess.
  const curSources = useMemo(() => {
    if (usingDoc) return null;   // null = don't gate
    const mb = masterBooks.find(m => (m.id ?? m.book_id ?? m.canon_id) === book);
    return mb?.sources || null;
  }, [masterBooks, book, usingDoc]);
  const hasSource = useCallback((key) => {
    if (!curSources) return true;
    if (key === 'LXX') return curSources.some(s => s === 'LXX' || s === 'GNT' || s === 'GRC');
    return curSources.includes(key);
  }, [curSources]);

  // URL helper. Accepts { book } OR { doc } as the primary location key.
  const goTo = useCallback(({ src, b, c, v, d }) => {
    src = src || source;
    if (src === 'BHS') {
      const p = new URLSearchParams({ book: bookToParam(b, idToSlug), chapter: String(c) });
      if (v != null) p.set('verse', String(v));
      navigate(`/?${p}`);
      return;
    }
    const p = new URLSearchParams({ source: src, chapter: String(c) });
    if (d)      p.set('doc',  d);
    else        p.set('book', bookToParam(b, idToSlug));
    if (v != null) p.set('verse', String(v));
    setSearchParams(p);
  }, [navigate, setSearchParams, source, idToSlug]);

  // Cross-language book dropdown: every book in the master order, even those this
  // language lacks. Books present here keep their real chapter range; foreign ones
  // carry the language they'll open in, and selecting one switches source.
  const bookMeta = useMemo(() => {
    const m = {}; for (const b of books) m[b.book_id] = b; return m;
  }, [books]);
  const dropdownBooks = useMemo(() => {
    if (!masterBooks.length) return books;            // fallback before master loads
    return masterBooks.map((mb, i) => {
      const here = bookMeta[mb.id];
      const foreign = !here;
      const cand = HEBREW_OT(mb.id) ? ['BHS', ...mb.sources] : mb.sources;
      const primary = foreign ? pickSource(cand) : source;
      // See the identical fix in HebrewViewer.jsx's dropdownBooks — mb.name is
      // the server-resolved title (/api/book-order's canonName()), and needs
      // to win over here?.name, which only exists for books THIS source has.
      const name = mb.name || BOOK_NAMES[mb.id] || here?.name || `Book ${mb.id}`;
      return {
        book_id: mb.id, seq: i + 1,
        // See the identical fix in HebrewViewer.jsx's dropdownBooks — mb.first/
        // mb.last (from /api/book-order, computed across ALL sources) must win
        // over a bare 1 for books this language's own list (`here`) lacks.
        first_chapter: here?.first_chapter ?? mb.first ?? 1,
        last_chapter:  here?.last_chapter  ?? mb.last  ?? 1,
        name,
        label: name,
        foreign, sources: mb.sources, primary,
      };
    });
  }, [masterBooks, bookMeta, books, source]);
  const onPickBook = useCallback((id) => {
    const mb = dropdownBooks.find(b => b.book_id === id);
    if (mb && mb.foreign && mb.primary && mb.primary !== source) {
      const urlSrc = mb.primary === 'BHS' ? 'hebrew' : mb.primary;
      goTo({ src: urlSrc, b: id, c: 1 });
    } else goTo({ b: id, c: 1 });
  }, [dropdownBooks, source, goTo]);

  // A Hebrew source reaching this viewer WITHOUT a doc param means a routing bug
  // upstream, not a rendering job — hand it to the Hebrew path instead of quietly
  // showing the text-only version, same as before (that divergence is what made
  // "Heb extra" look broken for weeks). BUT a doc param means this IS the rendering
  // job: a Works Library literary work in the HEB corpus (e.g. a Dead Sea Scroll)
  // has no Strong's token stream for HebrewViewer to show, and belongs on this
  // plain chapter/verse text path like every other Works Library source. Without
  // the `!usingDoc` guard this redirect fired unconditionally and threw away the
  // `doc` param, which is what silently landed every DSS link on Genesis 1.
  useEffect(() => {
    if ((source === 'BHS' || source === 'HEB' || source === 'HEBREW') && !usingDoc) {
      navigate(`/?source=${source === 'BHS' ? 'hebrew' : 'heb'}`, { replace: true });
    }
  }, [source, usingDoc, navigate]);

  // Catalogs
  useEffect(() => {
    if (!MULTI_SOURCES.includes(source)) return;
    setBooksLoaded(false);
    apiSourceBooks(source)
      .then(b => { setBooks(b); setBooksSource(source); })
      // The catch path forgot setBooksLoaded, so a failed book list left the flag
      // false FOREVER — and the "not found -> jump to this source's first book"
      // recovery below is gated on it, so one failed request permanently disabled
      // the recovery and left users dead-ended on an error. Settle in `finally`:
      // the flag means "we asked", not "it worked".
      .catch(e => { setErr(`books load failed: ${e.message}`); setBooks([]); setBooksSource(source); })
      .finally(() => setBooksLoaded(true));
    apiSourceDocs(source).then(setDocs).catch(()=>setDocs([]));
  }, [source]);

  // Docs-only sources (e.g. GRC Greek literature has no canonical book axis):
  // with no work selected the reader is a dead end, so send the user to the
  // unified Works Library to pick one.
  useEffect(() => {
    // Gate on booksLoaded: books and docs load in parallel and `books` starts
    // empty, so without this a docs response that arrives before the books
    // response makes a source that HAS books (Ge'ez, LXX) look book-less for a
    // render and wrongly bounces the reader to /works. Only redirect once we
    // know the book list loaded and is genuinely empty (a true docs-only source
    // like GRC).
    if (booksLoaded && !usingDoc && books.length === 0 && docs.length > 0) {
      navigate('/works');
    }
  }, [booksLoaded, books, docs, usingDoc, navigate]);

  // Graceful cross-source switching: if the current book doesn't exist in this
  // source (e.g. switching from an OT location into GNT, which has no Genesis),
  // land on the source's first available book instead of "verse not found".
  useEffect(() => {
    // Don't act on a stale book list mid source-switch: if the user picks a
    // foreign book (e.g. Jubilees from Greek), we navigate to source=HEB&book=68,
    // but `books` still holds Greek's list for a render. Acting then would bounce
    // to Greek's books[0] (Genesis). Wait until `books` belongs to `source`.
    if (booksSource !== source) return;
    if (usingDoc || !books.length || book == null) return;
    if (!books.find(b => b.book_id === book)) {
      goTo({ b: books[0].book_id, c: 1 });
    }
  }, [books, booksSource, source, book, usingDoc, goTo]);

  // Chapter list for the open work — drives the chapter/verse selectors so
  // multi-chapter literary works stay fully navigable.
  useEffect(() => {
    if (!usingDoc || !MULTI_SOURCES.includes(source)) { setDocChapters([]); return; }
    apiSourceChapters(source, { doc }).then(setDocChapters).catch(() => setDocChapters([]));
  }, [source, doc, usingDoc]);

  // ── load verse or chapter ─────────────────────────────────────────────────
  useEffect(() => {
    if (!MULTI_SOURCES.includes(source)) return;
    if (!usingDoc && !bookReady) return;   // book-based load waits for the slug map
    let cancelled = false;
    // Drop whatever was on screen the instant the target location changes.
    // Without this, the old chapter/verse keeps rendering under the new
    // toolbar label until the next fetch resolves — that's the "switched to
    // LXX but the Ge'ez text is still up, and the title lies" bug.
    setChapterData(null); setVerseData(null);
    setLoading(true); setErr(null);
    (async () => {
      try {
        const locOpts = usingDoc ? { doc } : { book };
        if (mode === 'verse') {
          const v = await apiSourceVerse(source, locOpts, chapter, verse);
          if (cancelled) return;
          setVerseData(v); setChapterData(null);
        } else {
          const c = await apiSourceChapter(source, locOpts, chapter);
          if (cancelled) return;
          setChapterData(c); setVerseData(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source, doc, book, chapter, verse, mode, usingDoc, bookReady]);

  // ── rich Hebrew tokens for doc-based works (DSS etc.) ───────────────────────
  // Separate fetch from the chapter/verse load above: apiDocTokens hits
  // /api/tokens?doc=...&chapter=..., which needs build-heb-index.mjs --docs to
  // have tagged this work first. If it hasn't (503) or this chapter has no
  // coverage yet (404), we swallow the error and fall back to plain
  // v.tokens/MultiWordBlock rendering below rather than breaking the page.
  useEffect(() => {
    if (!isHebDoc) { setDocTokens([]); setDocTokensErr(null); return; }
    let cancelled = false;
    setDocTokens([]); setDocTokensErr(null);
    apiDocTokens(doc, chapter)
      .then(rows => { if (!cancelled) setDocTokens(Array.isArray(rows) ? rows : []); })
      .catch(e => { if (!cancelled) setDocTokensErr(e.message); });
    return () => { cancelled = true; };
  }, [isHebDoc, doc, chapter]);

  // Graceful recovery: a fetch can fail simply because the requested book isn't
  // in this source (e.g. switching to Hebrew while on Matthew, which the Hebrew
  // corpus doesn't carry). Rather than dead-ending on "verse not found", route to
  // this source's FIRST available book — but only once its book list has loaded,
  // and never when we're already on that first book (so a genuinely empty source
  // surfaces the message instead of looping).
  useEffect(() => {
    if (!err || !/not\s*found/i.test(err)) return;
    if (usingDoc) return;
    if (booksSource !== source || !booksLoaded || books.length === 0) return;
    const first = books[0];
    if (book === first.book_id) return;     // already on first book → show message
    goTo({ b: first.book_id, c: 1 });
  }, [err, usingDoc, booksSource, booksLoaded, books, source, book, goTo]);

  // Verse numbers present in current chapter — for the verse <select>.
  const verseNums = useMemo(() => {
    if (chapterData?.verses) return chapterData.verses.map(v => v.verse);
    if (verseData?.verse != null) return [verseData.verse];
    return [];
  }, [chapterData, verseData]);

  // ── Descriptive raw tokens (read-only) ───────────────────────────────────
  // Mirrors the Hebrew reader's raw-token panel: the gloss stays on the word
  // block while every grammatical/lexical field the API returned is exposed here
  // for validation. Pure data, one line per token. Current verse, or the whole
  // chapter when no single verse is selected.
  const tokenViewerText = useMemo(() => {
    const fmt = t => [
      `ord=${t.ord}`,
      `word=${t.word ?? ''}`,
      t.word_norm != null ? `norm=${t.word_norm}` : null,
      t.gloss_key != null && t.gloss_key !== t.word_norm ? `key=${t.gloss_key}` : null,
      t.lemma ? `lemma=${t.lemma}` : null,
      t.strongs ? `strongs=${t.strongs}` : null,
      (t.pos_name || t.parsed || t.parse) ? `parse=${t.pos_name || t.parsed || t.parse}` : null,
      t.gloss ? `gloss=${t.gloss}` : `gloss=(none)`,
    ].filter(Boolean).join('|');
    if (mode === 'verse' && verseData?.tokens) {
      return verseData.tokens.map(fmt).join('\n');
    }
    if (mode === 'chapter' && chapterData?.verses) {
      return chapterData.verses
        .map(v => `— verse ${v.verse} —\n` + (v.tokens || []).map(fmt).join('\n'))
        .join('\n\n');
    }
    return '';
  }, [mode, verseData, chapterData]);

  // Adjacent-verse / -chapter navigation. The verse endpoint already returns
  // `next` and `prev` that chain across boundaries; chapter endpoint returns
  // `next_chapter`/`prev_chapter`.
  const navPrev = useCallback(() => {
    const r = mode === 'verse' ? verseData?.prev : chapterData?.prev_chapter;
    if (!r) return;
    goTo({ b: r.book_id, d: r.doc_id, c: r.chapter, v: r.verse ?? null });
  }, [mode, verseData, chapterData, goTo]);
  const navNext = useCallback(() => {
    const r = mode === 'verse' ? verseData?.next : chapterData?.next_chapter;
    if (!r) return;
    goTo({ b: r.book_id, d: r.doc_id, c: r.chapter, v: r.verse ?? null });
  }, [mode, verseData, chapterData, goTo]);

  // ── touch swipe nav (mobile) — replaces the side arrows, which overlapped
  // the text on narrow screens. LTR convention: swipe left → next, right → prev.
  const touchRef = useRef(null);
  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, at: Date.now() };
  }, []);
  const onTouchEnd = useCallback((e) => {
    const s = touchRef.current;
    if (!s) return;
    touchRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Horizontal intent only: ignore vertical scrolls and lazy drifts.
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.at < 800) {
      if (dx < 0) navNext(); else navPrev();
    }
  }, [navNext, navPrev]);

  // ── keyboard nav: ← prev, → next, Esc exits presentation ────────────────
  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack arrow keys when typing in a form control
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); navPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navNext(); }
      else if (e.key === 'Escape' && present) { setPresent(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navPrev, navNext, present]);

  if (!MULTI_SOURCES.includes(source)) {
    // Hebrew is mid-redirect (the effect above), so say that rather than showing
    // a dead end for one frame. Anything else genuinely does not belong here.
    const isHebrewSource = source === 'BHS' || source === 'HEB' || source === 'HEBREW';
    return <div className="rd-state">{isHebrewSource
      ? 'Opening the Hebrew Viewer…'
      : <>This source has no reader here (<Link to="/">go home</Link>).</>}</div>;
  }

  const sourceLabel = SOURCE_LABELS[source] || source;
  // Syriac and doc-based Hebrew (DSS etc.) are the RTL scripts this viewer
  // handles — canonical-book Hebrew still goes to the dedicated Hebrew renderer.
  // MultiViewer.css's .rd-rtl block was already written for "Hebrew, Syriac"
  // (see its comment) but this flag never actually included HEB, so every DSS
  // reading rendered LTR: verse markers on the wrong side, wrapped lines flush
  // left instead of right. (The cross-source pills below still LINK to Hebrew;
  // they navigate out to HebrewViewer, which is the point.)
  const rtl = source === 'SYR' || isHebDoc;

  // ── Presented location = what is ACTUALLY on screen, read off the server
  // response — never the URL defaults. In doc mode `book` defaults to 1, which
  // is what made the toolbar claim "Genesis — Chapter 1" while a literary
  // manuscript was showing. The response carries the real chapter, and (for
  // docs that map to a canonical book, e.g. LIT1546Genesi → Genesis) the real
  // book_id.
  const respBookId = (mode === 'verse' ? verseData?.book_id : chapterData?.book_id) ?? null;
  const presentedBookId = usingDoc ? respBookId : book;
  const presentedChapter =
    (mode === 'verse' ? verseData?.chapter : chapterData?.chapter) ?? chapter;
  const bookName =
    presentedBookId != null
      ? (BOOK_NAMES[presentedBookId] || books.find(b => b.book_id === presentedBookId)?.name || `Book ${presentedBookId}`)
      : null;

  // Heading + window title. For a literary doc with no canonical book we lead
  // with the manuscript id; for a doc that IS a canonical book we show the
  // book name and tag the witness.
  const docTitle = (mode === 'verse' ? verseData?.doc_title : chapterData?.doc_title) || null;
  const headingLabel = usingDoc
    ? (docTitle || bookName || doc)
    : (bookName || `Book ${book}`);
  const titleLabel = usingDoc ? `${sourceLabel} · ${docTitle || doc}` : sourceLabel;

  // ── browser tab title (2026-08-15) ─────────────────────────────────────
  // "<book> <ch>:<v> | <language> | <text preview>" — same convention as
  // HebrewViewer.jsx (the other half of this reader family), with a live
  // preview of the verse's word+gloss (see ../lib/versePreview.js) once a
  // single verse is selected, matching BibleHub-style tabs.
  const mvTitleParts = [`${headingLabel} ${presentedChapter}${verse != null ? ':' + verse : ''}`, sourceLabel];
  if (mode === 'verse' && verseData?.tokens) {
    const preview = truncateTitle(versePreviewMultiTokens(verseData.tokens), 70);
    if (preview) mvTitleParts.push(preview);
  }
  usePageTitle(mvTitleParts.join(' | '));

  // ── Canonical cross-source target. Switching sources can only carry a
  // *canonical* (book, chapter[, verse]) location — a doc id is meaningless in
  // another source, and a literary doc's internal chapter number is not a
  // canonical reference. So: if we currently have a canonical book, carry it;
  // otherwise fall back to the target's first canonical chapter (Gen 1:1).
  const canonBook    = usingDoc ? respBookId : book;
  const xBook        = canonBook ?? 1;
  const xChapter     = canonBook != null ? presentedChapter : 1;
  const xVerse       = (canonBook != null && verse != null) ? verse : null;
  const xQuery       = `book=${bookToParam(xBook, idToSlug)}&chapter=${xChapter}${xVerse != null ? `&verse=${xVerse}` : ''}`;
  const xParallelPath = parallelHref(xBook, idToSlug, xChapter, xVerse);

  return (
    <div
      className={`rd hv-page ${rtl ? 'rd-rtl' : ''} ${present ? 'present-mode' : ''}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <TopBar
        title={titleLabel}
        hideOnScroll={!present}
        actions={
          // direction:ltr keeps this whole row in a fixed visual order even
          // when the page is RTL (Hebrew, Syriac), so the language bar never
          // flips or reshuffles between sources.
          <div
            className="rd-actions"
            style={{ direction: 'ltr', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
          >
            <Link
              className="txt-btn"
              to={xParallelPath}
              title="Open the Hebrew–English parallel view at this location"
            >📖 Parallel</Link>
            <Link
              className="txt-btn"
              to={`/bible?${xQuery}`}
              title="Open this passage in the Reader — flowing prose, no Strong's"
            >📗 Reader</Link>
            {/* Fixed-order language switcher. The active language stays in its
                slot and is filled blue (white text); the others are links to the
                same location in that source. Clicking the active one does
                nothing, so the same physical spot is always the same language. */}
            {SWITCHER.map(({ key, label }) => {
              const activeKey = source === 'GRC' ? 'LXX' : source;   // GRC works highlight "Greek"
              const active = key === activeKey;
              // Hebrew is a toggle: clicking the pill swaps between BHS (flagship)
              // and Hebrew (Extra) for the same location. In MultiViewer the active
              // Hebrew witness is always Extra (BHS lives on the flagship route).
              if (key === 'HEB') {
                const canonical = xBook >= 1 && xBook <= 39;          // BHS only carries 1–39
                const bhsHref   = `/?${xQuery}`;
                const extraHref = `/?source=HEB&${xQuery}`;
                const isExtra   = source === 'HEB';
                const filled = { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' };
                if (isExtra) {
                  // Showing Hebrew (Extra). Click swaps to BHS where it exists.
                  return canonical ? (
                    <Link key={key} className="txt-btn rd-srclink" to={bhsHref}
                      style={{ ...filled, cursor: 'pointer' }} aria-current="true"
                      title="Showing Hebrew (Extra) — click to swap to BHS">Heb Extra ⇄ BHS</Link>
                  ) : (
                    <span key={key} className="txt-btn rd-srclink" aria-current="true"
                      style={{ ...filled, cursor: 'default' }}
                      title="Hebrew (Extra) — no BHS for this book">Heb Extra</span>
                  );
                }
                // Hebrew not active → open it (BHS for canonical, else Extra),
                // but only if this book actually has a Hebrew witness.
                const hebAvail = canonical || hasSource('HEB');
                return hebAvail ? (
                  <Link key={key} className="txt-btn rd-srclink" to={canonical ? bhsHref : extraHref}
                    title="Open this location in Hebrew">Hebrew</Link>
                ) : (
                  <span key={key} className="txt-btn rd-srclink rd-srclink-disabled"
                    aria-disabled="true" title="Hebrew — not available for this book"
                    style={{ opacity: 0.32, cursor: 'not-allowed', pointerEvents: 'none' }}>Hebrew</span>
                );
              }
              if (active) {
                return (
                  <span
                    key={key}
                    className="txt-btn rd-srclink"
                    aria-current="true"
                    style={{ background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', cursor: 'default' }}
                  >{label}</span>
                );
              }
              // A source this book doesn't have is shown disabled, not hidden — the
              // row stays stable and you simply can't attempt a text that isn't there.
              if (!hasSource(key)) {
                return (
                  <span
                    key={key}
                    className="txt-btn rd-srclink rd-srclink-disabled"
                    aria-disabled="true"
                    title={`${label} — not available for this book`}
                    style={{ opacity: 0.32, cursor: 'not-allowed', pointerEvents: 'none' }}
                  >{label}</span>
                );
              }
              const to = `/?source=${key}&${xQuery}`;
              return (
                <Link
                  key={key}
                  className="txt-btn rd-srclink"
                  to={to}
                  title={`Open this location in ${label}`}
                >{label}</Link>
              );
            })}
            {docs.length > 0 && (
              <button
                className="txt-btn"
                onClick={() => navigate('/works')}
                title="Open the Works Library (all works, all sources)"
              >📚 Works ({docs.length})</button>
            )}
            <button
              className={`icon-btn ${present ? 'active' : ''}`}
              onClick={() => setPresent(p => !p)}
              title="Presentation mode"
              aria-label="Presentation mode"
            >{present ? '✕' : '⛶'}</button>
            <button
              className="icon-btn"
              onClick={() => setDisplayOpen(o => !o)}
              title="Display options"
              aria-label="Display options"
              style={{ fontSize: 14 }}
            >⚙</button>
          </div>
        }
      >
        {usingDoc && presentedBookId == null ? (
          // Literary work — no canonical book axis, but it still has chapters
          // and verses, so it gets real chapter/verse selectors (some works run
          // to hundreds of chapters).
          <span className="rd-doc-toolbar">
            <span className="rd-doc-id" title={doc}>{docTitle || doc}</span>
            <select
              style={{ background:'var(--bg3)', color:'var(--text)', border:'1px solid var(--border2)', borderRadius:6, padding:'5px 8px', fontSize:13, cursor:'pointer' }}
              value={presentedChapter}
              onChange={e => goTo({ b: null, d: doc, c: Number(e.target.value) })}
            >
              {(docChapters.length ? docChapters : [{ chapter: presentedChapter, verses: 0 }]).map(c => (
                <option key={c.chapter} value={c.chapter}>Ch {c.chapter}{c.verses ? ` (${c.verses})` : ''}</option>
              ))}
            </select>
            <select
              style={{ background:'var(--bg3)', color:'var(--text)', border:'1px solid var(--border2)', borderRadius:6, padding:'5px 8px', fontSize:13, cursor:'pointer' }}
              value={verse ?? ''}
              onChange={e => goTo({ b: null, d: doc, c: presentedChapter, v: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">— full chapter —</option>
              {verseNums.map(v => <option key={v} value={v}>v {v}</option>)}
            </select>
          </span>
        ) : (
          <BookChapterVerseSelects
            books={dropdownBooks}
            book={presentedBookId ?? book}
            chapter={presentedChapter}
            verse={verse}
            verses={verseNums}
            onBook={onPickBook}
            onChapter={c => goTo({ b: usingDoc ? null : (presentedBookId ?? book), d: doc, c })}
            onVerse={v => goTo({ b: usingDoc ? null : (presentedBookId ?? book), d: doc, c: presentedChapter, v: v || null })}
          />
        )}
        <span className="status">{loading ? 'Loading…' : ''}</span>
      </TopBar>

      {verse != null && (
        <div className="hv-verse-bar">
          <span className="hv-verse-ref">
            {headingLabel} {presentedChapter}:{verse}
          </span>
          <button className="hv-back-btn" onClick={() => goTo({ b: usingDoc ? null : (presentedBookId ?? book), d: doc, c: presentedChapter })}>↑ Full chapter</button>
        </div>
      )}

      <div className="hv-reader-wrap">
        <div className="hv-output">
          <h2 className="hv-ref-title">
            {headingLabel} — Chapter {presentedChapter}
            {usingDoc && bookName && <span className="rd-doc-tag">witness: {doc}</span>}
            {verse != null && <span> · verse view</span>}
          </h2>

          {err && <div className="rd-state rd-err">⚠ {err}</div>}

          {/* Book not in this source — explicit message with all available books */}
          {!err && books.length > 0 && !books.find(b => b.book_id === book) && (
            <div className="rd-empty-state">
              <p>
                <strong>{source}</strong> doesn't include book {book}
                {BOOK_NAMES[book] && <> ({BOOK_NAMES[book]})</>}.
                Pick from the {books.length} book{books.length !== 1 ? 's' : ''} this source has:
              </p>
              <div className="rd-book-grid">
                {books.map(b => (
                  <button
                    key={b.book_id}
                    className="rd-book-pill"
                    onClick={() => goTo({ b: b.book_id, c: 1 })}
                  >
                    {b.book_id}. {BOOK_NAMES[b.book_id] || b.name || `Book ${b.book_id}`}
                    <span className="rd-book-pill-meta">{b.chapters} ch · {b.verses} v</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Verse view */}
          {!err && mode === 'verse' && verseData && (
            <div className="rd-verse-wrap">
              <div className="rd-verse-num">{verseData.verse}</div>
              <div className="rd-verse-blocks">
                {isHebDoc && !docTokensErr && docTokens.length > 0
                  ? docTokens.filter(w => w.verse === verseData.verse).map((w, i) => (
                      <WordBlock key={i} wordObj={w} showSub showCopyBtn showStrongs />
                    ))
                  : (source === 'GEZ' ? foldGeezPunct(verseData.tokens || []) : (verseData.tokens || [])).map((t, i) => (
                      <MultiWordBlock key={`${t.ord}-${i}`} token={t} source={source} />
                    ))}
              </div>
              {verseData.doc_id && (
                <div className="rd-doc-id">witness: {verseData.doc_id}</div>
              )}
            </div>
          )}

          {/* Chapter view — full content */}
          {!err && mode === 'chapter' && chapterData && chapterData.verses?.length > 0 && (
            chapterData.verses.map(v => (
              <div key={v.verse} className="rd-verse-wrap">
                <button
                  className="rd-verse-num"
                  onClick={() => goTo({ b: usingDoc ? null : (presentedBookId ?? book), d: doc, c: presentedChapter, v: v.verse })}
                  title="Open this verse"
                >{v.verse}</button>
                <div className="rd-verse-blocks">
                  {isHebDoc && !docTokensErr && docTokens.length > 0
                    ? docTokens.filter(w => w.verse === v.verse).map((w, i) => (
                        <WordBlock key={i} wordObj={w} showSub showCopyBtn showStrongs />
                      ))
                    : (source === 'GEZ' ? foldGeezPunct(v.tokens || []) : (v.tokens || [])).map((t, i) => (
                        <MultiWordBlock key={`${t.ord}-${i}`} token={t} source={source} />
                      ))}
                </div>
                {v.doc_id && <span className="rd-doc-tag">{v.doc_id}</span>}
              </div>
            ))
          )}

          {/* Empty chapter (book exists, this chapter doesn't) — show explicit
              jump buttons to adjacent chapters that DO have content. */}
          {!loading && !err && mode === 'chapter' && chapterData && chapterData.verses?.length === 0
            && books.find(b => b.book_id === book) && (
            <div className="rd-empty-state">
              <p>
                {bookName || BOOK_NAMES[book] || `Book ${book}`} chapter {presentedChapter} is empty in {source}.
              </p>
              <div className="rd-empty-actions">
                {chapterData.prev_chapter && (
                  <button onClick={() => goTo({ b: chapterData.prev_chapter.book_id, d: chapterData.prev_chapter.doc_id, c: chapterData.prev_chapter.chapter })}>
                    ← prev chapter ({BOOK_NAMES[chapterData.prev_chapter.book_id] || 'Book ' + chapterData.prev_chapter.book_id} {chapterData.prev_chapter.chapter})
                  </button>
                )}
                {chapterData.next_chapter && (
                  <button onClick={() => goTo({ b: chapterData.next_chapter.book_id, d: chapterData.next_chapter.doc_id, c: chapterData.next_chapter.chapter })}>
                    next chapter ({BOOK_NAMES[chapterData.next_chapter.book_id] || 'Book ' + chapterData.next_chapter.book_id} {chapterData.next_chapter.chapter}) →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Read-only raw-token panel — same idea as the Hebrew reader: glosses
              stay on the blocks, the grammar/lexical detail lives here. */}
          {!err && tokenViewerText && (
            <div className="hv-token-viewer-wrap">
              <button
                className={`hv-token-viewer-toggle ${tokenViewerOpen ? 'open' : ''}`}
                onClick={() => setTokenViewerOpen(o => !o)}
              >{ } descriptive raw tokens</button>
              {tokenViewerOpen && (
                <textarea
                  className="hv-token-viewer"
                  value={tokenViewerText}
                  readOnly
                  spellCheck={false}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Prev / next nav buttons — like Hebrew Viewer's SideNav arrows */}
      <button
        className="rd-side-nav rd-side-nav-prev"
        onClick={navPrev}
        title="Previous (← arrow key)"
        aria-label="Previous"
      >◀</button>
      <button
        className="rd-side-nav rd-side-nav-next"
        onClick={navNext}
        title="Next (→ arrow key)"
        aria-label="Next"
      >▶</button>

      {/* Doc picker — browse all manuscripts/witnesses in this source */}
      {docPickerOpen && (
        <DocPicker
          docs={docs}
          currentDoc={doc}
          onClose={() => setDocPickerOpen(false)}
          onPick={(d) => {
            setDocPickerOpen(false);
            goTo({ d: d.doc_id, b: d.book_id, c: d.first_chapter || 1 });
          }}
        />
      )}

      {/* Display panel — minimal: font size sliders for word + sub text. */}
      {displayOpen && (
        <div className="rd-display-panel">
          <div className="rd-display-header">
            <span>Display</span>
            <button onClick={() => setDisplayOpen(false)} aria-label="Close">✕</button>
          </div>
          <SliderRow label="Word size"          storageKey="rd-paleo-size" cssVar="--paleo-size" min={18} max={64} def={32} suffix="px" />
          <SliderRow label="Translit + gloss"   storageKey="rd-sub-size"   cssVar="--sub-size"   min={9}  max={22} def={12} suffix="px" />
          <div className="rd-display-hint">Use ← / → arrow keys to navigate.</div>
        </div>
      )}
    </div>
  );
}

function SliderRow({ label, storageKey, cssVar, min, max, def, suffix }) {
  const [v, setV] = useState(() => {
    const s = parseInt(localStorage.getItem(storageKey) || '', 10);
    return Number.isFinite(s) ? s : def;
  });
  useEffect(() => {
    document.documentElement.style.setProperty(cssVar, `${v}px`);
    localStorage.setItem(storageKey, String(v));
  }, [v, cssVar, storageKey]);
  return (
    <div className="rd-slider-row">
      <label>
        <span>{label}</span>
        <span>{v}{suffix}</span>
      </label>
      <input type="range" min={min} max={max} step={1} value={v} onChange={e => setV(parseInt(e.target.value, 10))} />
    </div>
  );
}

/**
 * DocPicker — modal panel listing every manuscript or witness in the source.
 * For Ge'ez this is ~3,400 docs. Docs are grouped by canonical book where
 * possible (multiple Acts manuscripts cluster under "Acts", etc.) using
 * either their direct book_id or the heuristic `book_hint` returned by the
 * server. Docs with no canonical affiliation appear in "Other literary works".
 */
function DocPicker({ docs, currentDoc, onClose, onPick }) {
  const [q, setQ] = useState('');

  // Filter by substring of doc_id OR book name.
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return docs;
    return docs.filter(d =>
      d.doc_id.toLowerCase().includes(qq) ||
      (d.book_name && d.book_name.toLowerCase().includes(qq)) ||
      (d.book_hint?.label && d.book_hint.label.toLowerCase().includes(qq))
    );
  }, [docs, q]);

  // Group by effective book_id: explicit book_id wins, else book_hint.book_id.
  // book_hint.book_id === null is a marker for "explicitly apocryphal"
  // (e.g. Acts of John). Truly orphan literary works get bookKey="literary".
  const groups = useMemo(() => {
    const m = new Map();
    for (const d of filtered) {
      let bookId, label, kind;
      if (d.book_id != null) {
        bookId = d.book_id; label = d.book_name; kind = 'canonical';
      } else if (d.book_hint && d.book_hint.book_id != null) {
        bookId = d.book_hint.book_id; label = d.book_hint.label; kind = 'witness';
      } else if (d.book_hint) {
        bookId = `apoc-${d.book_hint.label}`; label = d.book_hint.label; kind = 'apocryphal';
      } else {
        bookId = 'literary'; label = 'Other literary works'; kind = 'literary';
      }
      const key = String(bookId);
      if (!m.has(key)) m.set(key, { key, sortKey: typeof bookId === 'number' ? bookId : 9999, label, kind, docs: [] });
      m.get(key).docs.push(d);
    }
    return [...m.values()].sort((a, b) => {
      if (a.kind === 'literary') return 1;
      if (b.kind === 'literary') return -1;
      return a.sortKey - b.sortKey;
    });
  }, [filtered]);

  return (
    <div className="rd-modal-backdrop" onClick={onClose}>
      <div className="rd-doc-picker" onClick={e => e.stopPropagation()} role="dialog">
        <div className="rd-doc-picker-header">
          <input
            type="text"
            placeholder={`Filter ${docs.length} manuscripts…`}
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="rd-doc-picker-body">
          {groups.map(g => (
            <div key={g.key} className="rd-doc-group">
              <div className="rd-doc-section">
                {g.label}
                <span className="rd-doc-section-count">
                  {g.docs.length} {g.docs.length === 1 ? 'manuscript' : 'manuscripts'}
                  {g.kind === 'witness'    && ' · alternative witnesses'}
                  {g.kind === 'apocryphal' && ' · apocryphal'}
                </span>
              </div>
              {g.docs.map(d => (
                <button
                  key={d.doc_id}
                  className={`rd-doc-row ${d.doc_id === currentDoc ? 'active' : ''}`}
                  onClick={() => onPick(d)}
                >
                  <span className="rd-doc-id">{d.doc_id}</span>
                  <span className="rd-doc-meta">
                    {d.chapters} ch · {d.verses} v
                    {d.book_id != null && <span className="rd-doc-canon-badge">canonical</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="rd-doc-section">No docs match that filter.</div>
          )}
        </div>
      </div>
    </div>
  );
}
