import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAdminStatus } from '../lib/localOverlay.js';
import { useToast } from '../components/Toast.jsx';
import {
  apiGlossMissing, apiGlossCoverage, apiGlossStructure, apiGlossRootVerses, apiGlossVerse, apiGlossVerseStatus,
} from '../lib/api.js';
import MultiWordBlock from '../components/MultiWordBlock.jsx';
import WordBlock from '../components/WordBlock.jsx';
import { usePageTitle, formatRef } from '../hooks/usePageTitle.js';
import './GlossStudio.css';

// /gloss-studio — 100%-curated-by-you lexicon dashboard, laid out like
// Translation Studio (tr-shell's book/chapter/verse three-pane browser)
// rather than tabs, so browsing feels the same as the tool you already use
// every night. Nothing here writes lexicon.json — every screen only ever
// READS the current file, so it always reflects your latest edits with no
// separate report to regenerate.
//
// The whole books->chapters->verses tree is fetched ONCE
// (server.js's /api/admin/gloss-studio/coverage — not a drill-down API,
// the full tree in one response) and cached in state; every book/chapter/
// verse click after that is free, in-memory navigation. Use "↻ Re-sync"
// to pull a fresh tree after you've edited lexicon.json.
//
// Two modes:
//   Browse — the book/chapter/verse tree. A verse's row shows X/Y glossed;
//     opening it fetches that ONE verse's real tokens + English line so you
//     can see exactly which word(s) still need a gloss, in context.
//   Missing Words — the flat, corpus-wide list of roots with no
//     lexicon.json entry, ranked by occurrence (the highest-value gaps
//     first) — for when you want to work by frequency instead of by book.
//
// Greek/Ge'ez/Latin/Syriac reuse the SAME generic tokenizer +
// lexicon/<lang>-lexicon.json overlay the live reader already renders these
// scripts with (server.js splitTextToTokens/_lookupGloss) — raw surface-form
// tokens, "glossed" = has a curated entry for that exact surface, no Strong's
// numbers or root-based coverage tracking the way Hebrew's does. See
// GLOSS_STUDIO_MULTILANG_PLAN.md for why that's deliberately NOT the full
// Hebrew root/lemma pipeline.
// Coptic was removed — no Coptic verse text was ever ingested into
// corpus.db, so it sat at a permanent 0% with nothing to gloss ("coptic is
// still causing issues when it should be purged").
const LANGS = [
  { id: 'heb',    label: 'Hebrew',   enabled: true, source: null },
  { id: 'greek',  label: 'Greek',    enabled: true, source: 'LXX' },
  { id: 'geez',   label: "Ge'ez",    enabled: true, source: 'GEZ' },
  { id: 'latin',  label: 'Latin',    enabled: true, source: 'LAT' },
  { id: 'syriac', label: 'Syriac',   enabled: true, source: 'SYR' },
];
const LANG_SOURCE = Object.fromEntries(LANGS.map(l => [l.id, l.source]));
// Script direction is a property of the LANGUAGE, not a Gloss-Studio-wide
// default — Hebrew and Syriac are RTL (Aramaic-family abjads), Greek/Ge'ez/
// Latin are LTR. The verse-word grid's dir attribute follows this
// instead of a hardcoded `direction: rtl` that only ever made sense for
// Hebrew (see the 2026-08-10 report: Ge'ez was rendering right-to-left).
const LANG_DIR = { heb: 'rtl', greek: 'ltr', geez: 'ltr', latin: 'ltr', syriac: 'rtl' };

const MISSING_PAGE = 50;
const VERSES_PAGE = 10;

// Reuse the SAME <WordBlock> the live Hebrew reader (HebrewViewer/Parallel)
// renders every word with, instead of a bespoke chip renderer — Gloss
// Studio's Hebrew view used to look nothing like the reader (small
// disconnected glyph/gloss boxes, no transliteration line) while every OTHER
// language already matched the reader exactly via MultiWordBlock (see
// below). Fieldy, 2026-08-14: "lets make the view of this look like my
// reader like the other languages." `missingSet` (root_paleo strings still
// lacking a lexicon.json entry, from the coverage tree) still flags the word
// with a highlighted border + explicit text flag when one of its components
// is the actual gap — WordBlock itself has no concept of "missing," so that
// stays a Gloss-Studio-only wrapper around it, same as before.
function GlossWordBlock({ word, missingSet }) {
  const comps = word.components || [];
  const isMissing = missingSet && comps.some(c => c.css === 'root' && missingSet.has(c.paleo));
  return (
    <div className={`gs-word ${isMissing ? 'missing' : ''}`}>
      {/* A 1px border-color swap was too easy to miss scanning a whole verse
          of tightly-packed boxes (fieldy: "I dont want to have to test each
          word to see which one is missing") — this word's ROOT renders fine
          on screen either way (the built-in grammar fallback covers it), so
          color alone was the only signal something was wrong. An explicit
          text flag, same "— not glossed —" convention MultiWordBlock already
          uses for non-Hebrew languages, doesn't depend on the reader
          noticing a border at all. */}
      {isMissing && (
        <div className="gs-word-missing-flag" title="No curated entry in lexicon.json / homographs.json / hebrew-extra-lexicon.json — currently shown via the built-in grammar fallback only">
          ⚠ no lex entry
        </div>
      )}
      <WordBlock wordObj={word} />
    </div>
  );
}

// One verse's full token breakdown + English reference line — the shared
// detail view used by both Browse (an arbitrary verse) and Missing Words
// (every occurrence of one root). `missingSet` only applies in Browse mode,
// where the tree already knows which roots in THIS verse are ungloosed;
// Missing Words already filters to occurrences of one known-missing root,
// so every card there is implicitly about that root.
// `genericSource` set (e.g. 'LXX'/'GEZ'/'LAT'/'SYR') means these words
// are plain reader tokens (word/transliteration/gloss), not Hebrew paleo
// component chips — render with the SAME MultiWordBlock the live reader uses
// for these scripts (src/components/MultiWordBlock.jsx) instead of
// GlossWordBlock, rather than reimplementing script detection/transliteration
// here. No root/lemma coverage tracking for these languages by design — see
// GLOSS_STUDIO_MULTILANG_PLAN.md.
function VerseDetailCard({ v, missingSet, genericSource, dir = 'rtl' }) {
  return (
    <div className="gs-verse-card">
      <Link
        className="gs-verse-ref"
        to={`/parallel?book=${v.book_id}&chapter=${v.chapter}&verse=${v.verse}`}
        target="_blank" rel="noreferrer"
        title="Open this verse in Parallel"
      >{v.book_name} {v.chapter}:{v.verse}</Link>
      {/* English FIRST, words below — so cycling through languages in the
          LangColumn keeps the English reference pinned in the same spot
          instead of it jumping around as the word grid's height changes. */}
      {v.english?.text && (
        <div className="gs-verse-eng">
          <div className="gs-verse-eng-label">
            English
            <span className={`gs-ts-status gs-ts-status-${v.english.status || 'none'}`}>
              {v.english.status === 'done' ? 'Done in Translation Studio'
                : v.english.status === 'in_progress' ? 'In progress in Translation Studio'
                : 'Not started in Translation Studio'}
            </span>
          </div>
          {v.english.text}
          {v.english.is_baseline && <span className="gs-badge">baseline</span>}
        </div>
      )}
      <div className="gs-verse-words" dir={dir}>
        {v.words.map((w, wi) => (
          genericSource
            ? <MultiWordBlock key={wi} token={w} source={genericSource} />
            : <GlossWordBlock key={wi} word={w} missingSet={missingSet} />
        ))}
      </div>
    </div>
  );
}

// Vertical language column — a fourth pane (mirrors the book/chapter panes'
// look, not pill buttons), shown to the right of Chapters once a verse is
// picked. Colored per-item by THAT verse's own glossed/total (verseStatus),
// so gaps across languages are visible before committing to editing one:
// green = 100%, amber = partial, red = 0%, dim = no data. Also reused
// (with verseStatus=null, so every item just shows '—') as the language
// switcher in Missing Words mode, which has no single verse to color by.
function LangColumn({ langs, activeLang, verseStatus, onSelect }) {
  return (
    <aside className="gs-lang-col">
      <div className="gs-pane-header">Languages</div>
      {langs.map(l => {
        const st = verseStatus?.langs?.find(x => x.id === l.id);
        const statusClass = !st || !st.available ? 'na' : st.pct === 100 ? 'done' : st.pct > 0 ? 'partial' : 'none';
        return (
          <button
            key={l.id}
            className={`gs-lang-col-item ${statusClass} ${activeLang === l.id ? 'active' : ''}`}
            onClick={() => onSelect(l.id)}
            title={st && st.available ? `${st.glossed}/${st.total} glossed` : 'no per-verse data'}
          >
            <span className="gs-lang-col-name">{l.label}</span>
            <span className="gs-lang-col-pct">{st && st.available ? `${st.pct}%` : '—'}</span>
          </button>
        );
      })}
    </aside>
  );
}

export default function GlossStudio() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAdmin, setIsAdmin] = useState(null);
  const [lang, setLang] = useState(() => searchParams.get('lang') || 'heb');
  const [mode, setMode] = useState(() => (searchParams.get('mode') === 'missing' ? 'missing' : 'browse'));

  // Which edition's OWN tokens to audit. 'BHS' = this book's natural edition
  // (Masoretic for the 39 canonical books, HEB for everything else — same as
  // the reader). 'HEB' = this project's own Hebraized edition for every book
  // it covers, INCLUDING the canonical ones — a canonical book's HEB tokens
  // can be genuinely different words than its BHS tokens, so it needs its
  // own, separately-audited coverage rather than being hidden behind BHS.
  // Restored from ?src=HEB on mount (only meaningful when lang=heb) — the
  // [lang] effect below must NOT clobber this back to 'BHS' on the very
  // first render, see skipFirstLangEffect.
  const [source, setSource] = useState(() => {
    const urlLang = searchParams.get('lang') || 'heb';
    if (urlLang === 'heb') return searchParams.get('src') === 'HEB' ? 'HEB' : 'BHS';
    return LANG_SOURCE[urlLang] || 'BHS';
  });

  // For non-Hebrew languages there's only one edition, so `source` just
  // tracks whichever corpus.db source backs the selected language pill
  // ('LXX'/'GEZ'/'LAT'/'SYR') — every apiGloss* call already takes
  // `source` as a plain pass-through string, so no other plumbing below
  // needs to know about `lang` at all. Switching pills keeps the same
  // book/chapter/verse coordinates too, since every corpus.db source shares
  // the same canon_id-based book_id scheme (installScopedVerses) — so e.g.
  // Genesis 1:1 stays Genesis 1:1 across Hebrew/Greek/Ge'ez/Latin/Syriac,
  // same as the BHS<->HEB toggle already did for Hebrew alone.
  // Skipped on the FIRST run: `source`'s own lazy initializer above already
  // resolved the correct value (including a URL-restored 'HEB') before this
  // effect ever runs — without the skip, this would immediately stomp a
  // restored ?src=HEB back down to 'BHS' on every page refresh.
  const skipFirstLangEffect = useRef(true);
  useEffect(() => {
    if (skipFirstLangEffect.current) { skipFirstLangEffect.current = false; return; }
    setSource(lang === 'heb' ? 'BHS' : LANG_SOURCE[lang]);
  }, [lang]);

  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)); }, []);

  // ── Browse: the full tree, fetched once per source ──────────────────────
  // Covers every book with Hebrew material (BHS's canonical OT + everything
  // HEB-only: NT, Jubilees, Jasher, Book of Melchizedek, etc).
  const [tree, setTree] = useState(null);             // { books: [...] }
  const [treeBusy, setTreeBusy] = useState(false);
  // book/chapter/verse restored from the URL (?book=&chapter=&verse=) so a
  // refresh — or a shared link — lands back on the exact verse being edited
  // instead of the empty "pick a book" state. Number.isInteger-safe (verse 0
  // is a real, meaningful value everywhere else in this app — see the
  // verse-0 falsy-check fixes elsewhere; `!= null && !== ''` here, never a
  // bare truthy check).
  const [activeBook, setActiveBook] = useState(() => {           // book_id
    const b = searchParams.get('book');
    return b != null && b !== '' ? +b : null;
  });
  const [openChapter, setOpenChapter] = useState(() => {
    const c = searchParams.get('chapter');
    return c != null && c !== '' ? +c : null;
  });
  const [activeVerseKey, setActiveVerseKey] = useState(() => {   // "book:chapter:verse"
    const b = searchParams.get('book'), c = searchParams.get('chapter'), v = searchParams.get('verse');
    return (b != null && b !== '' && c != null && c !== '' && v != null && v !== '')
      ? `${+b}:${+c}:${+v}` : null;
  });
  const [verseDetail, setVerseDetail] = useState(null);
  const [verseBusy, setVerseBusy] = useState(false);

  // Restore the verse's actual content on mount if the URL already named one
  // (refresh / shared link). Every OTHER path into verseDetail is a user
  // click on a verse row, which calls selectVerse() directly and fetches
  // immediately — a URL-restored activeVerseKey never passes through that,
  // so without this the verse list would highlight correctly but the editor
  // pane would stay stuck on "Pick a book, open a chapter, click a verse."
  // Mount-only: later verse changes go through selectVerse, later source
  // changes go through the effect below.
  useEffect(() => {
    if (!activeVerseKey) return;
    const [book_id, chapter, verse] = activeVerseKey.split(':').map(Number);
    setVerseBusy(true);
    apiGlossVerse(book_id, chapter, verse, source)
      .then(d => setVerseDetail(d))
      .catch(e => toast(e.message, 'err'))
      .finally(() => setVerseBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with what's actually being browsed/edited — the
  // whole point being asked for: a refresh should never drop you back to
  // "pick a book" when you were mid-verse. Book/chapter/verse are always
  // written together from activeVerseKey when one's open (its embedded
  // coordinates are the real source of truth once a verse is picked); before
  // that, activeBook/openChapter alone still capture "which book/chapter I
  // was browsing." {replace:true} so every click doesn't pile up browser
  // history entries — same convention Parallel.jsx's own URL sync uses.
  useEffect(() => {
    const p = {};
    if (mode === 'missing') p.mode = 'missing';
    if (activeVerseKey) {
      const [b, c, v] = activeVerseKey.split(':');
      p.book = b; p.chapter = c; p.verse = v;
    } else {
      if (activeBook != null) p.book = String(activeBook);
      if (openChapter != null) p.chapter = String(openChapter);
    }
    if (lang !== 'heb') p.lang = lang;
    if (lang === 'heb' && source === 'HEB') p.src = 'HEB';
    setSearchParams(p, { replace: true });
  }, [mode, activeBook, openChapter, activeVerseKey, lang, source, setSearchParams]);

  // Cross-language aggregate (source='ALL', the default) — deliberately does
  // NOT depend on `lang`/`source`, so it doesn't refetch or recalculate when
  // the active language changes (fieldy: "I dont expect the higher layers
  // to be recalculated per language change"). Only Re-sync or mount reload
  // it; the per-language colored highlights (LangColumn) are where a single
  // language's own status belongs instead.
  // Structure (book names + chapter/verse numbers + a total word count, no
  // percentages) loads first and is cheap/near-instant — it never touches
  // lexicon.json, only surface-index.db (see server.js's getGlossStructure).
  // It renders the Books/Chapters pane immediately with real navigation.
  // The actual coverage % (cross-language, expensive — up to a few seconds
  // on a cold cache) is fetched separately right after and REPLACES the
  // tree once it resolves, filling in glossed/pct/missing/done. Never
  // blocks navigation on it. fieldy, 2026-08-11: "the books and chapters
  // are not going to change so why does it take so long to load... most
  // important to get the referenced verse/token data and less important
  // for the %s to be accurate in real time."
  const loadTree = useCallback(() => {
    setTreeBusy(true);
    let coverageArrived = false;   // guards against the (slower) structure
                                    // response landing AFTER coverage and
                                    // clobbering real numbers with placeholders
    apiGlossStructure()
      .then(structure => {
        if (coverageArrived) return;
        setTree({
          books: structure.books.map(b => ({
            ...b, glossed: undefined, pct: undefined,
            chapters: b.chapters.map(ch => ({
              ...ch, glossed: undefined, pct: undefined,
              verses: ch.verses.map(v => ({ ...v, glossed: undefined, pct: undefined, missing: [], done: false })),
            })),
          })),
        });
      })
      .catch(e => toast(e.message, 'err'));
    apiGlossCoverage()
      .then(d => { coverageArrived = true; setTree(d); })
      .catch(e => toast(e.message, 'err'))
      .finally(() => setTreeBusy(false));
  }, [toast]);

  useEffect(() => { if (isAdmin) loadTree(); }, [isAdmin, loadTree]);

  // Switching editions changes what a book/chapter/verse's Hebrew tokens
  // literally ARE, but the book/chapter/verse COORDINATES stay the same
  // across sources — surface-index.db's HEB rows are versification-aligned
  // to BHS at build time (heb_offsets in build-surface-index.js), and
  // /api/admin/gloss-studio/verse takes that alignment as given, doing a
  // plain book/chapter/verse lookup regardless of source. So re-fetch the
  // SAME verse under the new source instead of blanking the view — that's
  // the whole point of the toggle: cross-referencing BHS vs HEB wording for
  // one verse without re-navigating from scratch. Book/chapter selection is
  // left alone too — the book/chapter tree is the cross-language aggregate
  // now (see loadTree above) and doesn't change with the active language at
  // all. If the newly-active language has no data for this book/verse,
  // verseDetail.words just comes back empty — no special-casing needed here.
  const skipFirstSourceEffect = useRef(true);
  useEffect(() => {
    if (skipFirstSourceEffect.current) { skipFirstSourceEffect.current = false; return; }
    if (!activeVerseKey) return;
    const [book_id, chapter, verse] = activeVerseKey.split(':').map(Number);
    setVerseDetail(null);
    setVerseBusy(true);
    apiGlossVerse(book_id, chapter, verse, source)
      .then(d => setVerseDetail(d))
      .catch(e => toast(e.message, 'err'))
      .finally(() => setVerseBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const activeBookData = useMemo(
    () => tree?.books.find(b => b.book_id === activeBook) || null,
    [tree, activeBook]
  );

  // ── browser tab ────────────────────────────────────────────────────────────
  // Reference first ("Genesis 1:2 | Gloss Studio", 2026-08-15 — see
  // hooks/usePageTitle.js), matching Translation Studio's convention.
  // Prefers the open verse's own book_name/chapter/verse (verseDetail, keyed
  // on the language actually being audited) over the tree's activeBookData,
  // since the two can genuinely disagree once a language switch is in
  // flight; falls back to whatever's known (book + open chapter, or just
  // the book) when no verse is open yet.
  const glossRef = verseDetail
    ? formatRef(verseDetail.book_name, verseDetail.chapter, verseDetail.verse)
    : formatRef(activeBookData?.name, openChapter, null);
  usePageTitle(glossRef ? `${glossRef} | Gloss Studio` : '');

  // From the per-verse fetch itself (verseDetail.missing, added server-side
  // from that LANGUAGE's own coverage tree) rather than `tree` — `tree` is
  // now the cross-language aggregate and no longer carries a per-language
  // missing list. Only meaningful for Hebrew's GlossWordBlock rendering.
  const activeVerseMissing = useMemo(
    () => new Set(verseDetail?.missing || []),
    [verseDetail]
  );

  const selectVerse = (book_id, chapter, verse) => {
    const key = `${book_id}:${chapter}:${verse}`;
    setActiveVerseKey(key);
    setVerseDetail(null);
    setVerseBusy(true);
    apiGlossVerse(book_id, chapter, verse, source)
      .then(d => setVerseDetail(d))
      .catch(e => toast(e.message, 'err'))
      .finally(() => setVerseBusy(false));
  };

  // Per-language glossed/total for whichever verse is open, shown as a badge
  // next to each language in the vertical pane — so you can see at a glance
  // which languages still need this verse without clicking through all six.
  // Keyed on activeVerseKey alone (not `source`), so it doesn't refetch on
  // every language switch — the coordinates are what matter here, and it's
  // the same book/chapter/verse across languages (canon_id-based book_id).
  const [verseStatus, setVerseStatus] = useState(null);
  useEffect(() => {
    if (!activeVerseKey) { setVerseStatus(null); return; }
    const [book_id, chapter, verse] = activeVerseKey.split(':').map(Number);
    apiGlossVerseStatus(book_id, chapter, verse)
      .then(d => setVerseStatus(d))
      .catch(() => setVerseStatus(null));
  }, [activeVerseKey]);

  // ── Missing Words: flat occurrence-ranked list ──────────────────────────
  const [missing, setMissing] = useState({ rows: [], total: 0 });
  const [missingOffset, setMissingOffset] = useState(0);
  const [missingBusy, setMissingBusy] = useState(false);

  const loadMissing = useCallback((offset) => {
    setMissingBusy(true);
    apiGlossMissing(offset, MISSING_PAGE, source)
      .then(d => { setMissing(d); setMissingOffset(offset); })
      .catch(e => toast(e.message, 'err'))
      .finally(() => setMissingBusy(false));
  }, [toast, source]);

  useEffect(() => { if (isAdmin && mode === 'missing') loadMissing(0); }, [isAdmin, mode, loadMissing]);

  const [selectedRoot, setSelectedRoot] = useState(null);
  const [rootVerses, setRootVerses] = useState({ verses: [], total: 0 });
  const [versesOffset, setVersesOffset] = useState(0);
  const [versesBusy, setVersesBusy] = useState(false);

  const loadRootVerses = useCallback((root, offset) => {
    setVersesBusy(true);
    apiGlossRootVerses(root, offset, VERSES_PAGE, source)
      .then(d => { setRootVerses(d); setVersesOffset(offset); })
      .catch(e => toast(e.message, 'err'))
      .finally(() => setVersesBusy(false));
  }, [toast, source]);

  const pickRoot = (root) => { setSelectedRoot(root); loadRootVerses(root, 0); };
  const closeRoot = () => { setSelectedRoot(null); setRootVerses({ verses: [], total: 0 }); };

  // Non-null (the corpus.db source id) whenever the active language isn't
  // Hebrew — tells VerseDetailCard to render words with MultiWordBlock
  // (plain reader tokens) instead of GlossWordBlock (paleo component chips).
  const genericSource = lang === 'heb' ? null : source;

  // Source switch invalidates the missing-words list + any open root drill-
  // down too — same reasoning as the tree effect above.
  useEffect(() => {
    closeRoot();
    if (isAdmin && mode === 'missing') loadMissing(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  if (isAdmin === null) return <div className="page-stub"><p>Checking admin status…</p></div>;
  if (!isAdmin) {
    return (
      <div className="page-stub">
        <h2>Gloss Studio</h2>
        <p>Admin only. <Link to="/admin-login" className="txt-btn">Log in</Link></p>
      </div>
    );
  }

  return (
    <div className="gs-shell">
      <header className="gs-topbar">
        <Link to="/landing" className="gs-logo" aria-label="Home">𐤀𐤁</Link>
        <h1 className="gs-title">Gloss Studio</h1>

        <div className="gs-mode-tabs">
          <button className={`gs-mode-btn ${mode === 'browse' ? 'active' : ''}`} onClick={() => setMode('browse')}>Browse</button>
          <button className={`gs-mode-btn ${mode === 'missing' ? 'active' : ''}`} onClick={() => setMode('missing')}>Missing Words</button>
        </div>

        <button className="gs-txt-btn" onClick={() => (mode === 'browse' ? loadTree() : loadMissing(missingOffset))} title="Re-fetch from the server">
          ↻ Re-sync
        </button>

        {lang === 'heb' && (
          <div className="gs-source-toggle" title="Which edition's own tokens to audit">
            <button className={`gs-src-btn ${source === 'BHS' ? 'active' : ''}`} onClick={() => setSource('BHS')}>BHS</button>
            <button className={`gs-src-btn ${source === 'HEB' ? 'active' : ''}`} onClick={() => setSource('HEB')}>HEB (extra)</button>
          </div>
        )}
        <span className="gs-spacer" />
        {/* Translation Studio takes either a slug or a plain numeric book id
            (resolveBookParam in lib/bookSlug.js resolves both — "numbers
            still resolve too, so every existing ?book=43 link keeps
            working"), so activeVerseKey's own numeric book_id passes
            straight through with no slug lookup needed here. */}
        {activeVerseKey && (
          <Link
            to={`/translate?book=${activeVerseKey.split(':')[0]}&chapter=${activeVerseKey.split(':')[1]}&verse=${activeVerseKey.split(':')[2]}`}
            className="gs-txt-btn"
            title="Open this verse in Translation Studio"
          >📝 Translation Studio →</Link>
        )}
      </header>

      {mode === 'browse' && (
        <div className="gs-browse-body">
          <aside className="gs-book-pane">
            <div className="gs-pane-header">Books {treeBusy && <span className="gs-busy-dot" title="Loading…" />}</div>
            {(tree?.books || []).map(b => (
              <button key={b.book_id}
                className={`gs-book-item ${activeBook === b.book_id ? 'active' : ''}`}
                onClick={() => { setActiveBook(b.book_id); setOpenChapter(null); }}>
                <span className="gs-book-name">{b.name}</span>
                <span className="gs-mini-bar"><span className={`gs-mini-fill ${b.pct === 100 ? 'done' : b.pct > 0 ? 'mixed' : ''}`} style={{ width: `${b.pct ?? 0}%` }} /></span>
                <span className="gs-book-pct">{b.pct != null ? `${b.pct}%` : '…'}</span>
              </button>
            ))}
          </aside>

          <aside className="gs-chapter-pane">
            <div className="gs-pane-header">
              <div className="gs-chapter-title">{activeBookData?.name || '—'}</div>
              {activeBookData && (
                <div className="gs-chapter-progress">
                  {activeBookData.pct != null
                    ? `${activeBookData.glossed}/${activeBookData.total} glossed (${activeBookData.pct}%)`
                    : `${activeBookData.total} words`}
                </div>
              )}
            </div>
            <div className="gs-chapter-list">
              {(activeBookData?.chapters || []).map(ch => {
                const isOpen = openChapter === ch.chapter;
                return (
                  <div key={ch.chapter} className="gs-chapter-group">
                    <button className={`gs-chapter-header ${isOpen ? 'open' : ''}`} onClick={() => setOpenChapter(isOpen ? null : ch.chapter)}>
                      <span className="gs-chevron">{isOpen ? '▾' : '▸'}</span>
                      <span className="gs-chapter-label">Ch {ch.chapter}</span>
                      <span className="gs-chapter-stat">{ch.pct != null ? `${ch.glossed}/${ch.total} · ${ch.pct}%` : `${ch.total} words`}</span>
                    </button>
                    {isOpen && (
                      <div className="gs-verse-list">
                        {ch.verses.map(v => {
                          const key = `${activeBook}:${ch.chapter}:${v.verse}`;
                          // pct == null means the (near-instant) structure
                          // response is showing but the real coverage %
                          // hasn't landed yet — render the neutral 'none'
                          // dot rather than inventing a fourth status color
                          // for what's a purely transient loading state.
                          const statusClass = v.pct == null ? 'none' : v.pct === 100 ? 'done' : v.pct > 0 ? 'partial' : 'none';
                          return (
                            <button
                              key={v.verse}
                              className={`gs-verse-row ${activeVerseKey === key ? 'active' : ''}`}
                              onClick={() => selectVerse(activeBook, ch.chapter, v.verse)}
                            >
                              <span className="gs-verse-num">{v.verse}</span>
                              <span className={`gs-status-dot ${statusClass}`} />
                              <span className="gs-verse-preview">{v.pct != null ? `${v.glossed}/${v.total} (${v.pct}%)` : `${v.total} words`}</span>
                              {v.done && <span className="gs-verse-done" title="Marked done in Translation Studio">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          {activeVerseKey && (
            // Fourth pane, appears only once a verse is picked — the
            // language CHOICE comes AFTER verse selection, not before.
            <LangColumn langs={LANGS} activeLang={lang} verseStatus={verseStatus} onSelect={setLang} />
          )}

          <main className="gs-editor-pane">
            {!activeVerseKey ? (
              <div className="gs-editor-empty">
                <div className="gs-big-glyph">𐤀𐤁𐤂</div>
                <p>Pick a book, open a chapter, click a verse.</p>
              </div>
            ) : verseBusy ? (
              <div className="gs-loading">Loading verse…</div>
            ) : verseDetail ? (
              <VerseDetailCard v={verseDetail} missingSet={activeVerseMissing} genericSource={genericSource} dir={LANG_DIR[lang]} />
            ) : null}
          </main>
        </div>
      )}

      {mode === 'missing' && (
        <div className="gs-missing-body">
          <LangColumn langs={LANGS} activeLang={lang} verseStatus={null} onSelect={setLang} />
          <div className="gs-body">
          <p className="gs-intro">
            Roots with no curated gloss in any of the three sources (<code>lexicon.json</code>,{' '}
            <code>homographs.json</code>, <code>hebrew-extra-lexicon.json</code>), ranked by how many
            times they actually occur — the highest-value gaps first. A built-in grammar fallback may
            still render fine in the reader but shows up here anyway, since it isn't a curated entry.
            Add a real entry and it drops off this list on the next re-sync; nothing here writes
            anything for you.
          </p>

          {missingBusy && <div className="gs-loading">Loading…</div>}
          {!missingBusy && missing.rows.length === 0 && (
            <div className="gs-empty">Nothing missing — every root in the corpus has a real gloss. 🎉</div>
          )}
          {!missingBusy && missing.rows.length > 0 && (
            <>
              <div className="gs-missing-list">
                {missing.rows.map(r => (
                  <div key={r.root_paleo} className="gs-missing-row">
                    <span className={lang === 'heb' ? 'gs-missing-paleo' : 'gs-missing-generic'} dir={LANG_DIR[lang]}>{r.root_paleo}</span>
                    <span className="gs-missing-occ">{r.occ.toLocaleString()} occurrences</span>
                    <button className="gs-view-btn" onClick={() => pickRoot(r.root_paleo)}>
                      {selectedRoot === r.root_paleo ? 'Viewing verses ▾' : 'View verses'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="gs-pager">
                <button disabled={missingOffset === 0} onClick={() => loadMissing(Math.max(0, missingOffset - MISSING_PAGE))}>← Prev</button>
                <span>{missingOffset + 1}–{Math.min(missingOffset + MISSING_PAGE, missing.total)} of {missing.total.toLocaleString()}</span>
                <button disabled={missingOffset + MISSING_PAGE >= missing.total} onClick={() => loadMissing(missingOffset + MISSING_PAGE)}>Next →</button>
              </div>
            </>
          )}

          {selectedRoot && (
            <div className="gs-verses-panel">
              <div className="gs-verses-header">
                <span>Verses using <span className={lang === 'heb' ? 'gs-missing-paleo' : 'gs-missing-generic'} dir={LANG_DIR[lang]}>{selectedRoot}</span></span>
                <button className="gs-close-btn" onClick={closeRoot}>✕ Close</button>
              </div>
              {versesBusy && <div className="gs-loading">Loading verses…</div>}
              {!versesBusy && rootVerses.verses.map((v, vi) => <VerseDetailCard key={vi} v={v} missingSet={null} genericSource={genericSource} dir={LANG_DIR[lang]} />)}
              {!versesBusy && rootVerses.verses.length === 0 && <div className="gs-empty">No verses found.</div>}
              <div className="gs-pager">
                <button disabled={versesOffset === 0} onClick={() => loadRootVerses(selectedRoot, Math.max(0, versesOffset - VERSES_PAGE))}>← Prev</button>
                <span>{versesOffset + 1}–{Math.min(versesOffset + VERSES_PAGE, rootVerses.total)} of {rootVerses.total}</span>
                <button disabled={versesOffset + VERSES_PAGE >= rootVerses.total} onClick={() => loadRootVerses(selectedRoot, versesOffset + VERSES_PAGE)}>Next →</button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
