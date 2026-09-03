import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { usePaleoMode } from '../hooks/usePaleoMode.js';
import { useLocalStorageNumber } from '../hooks/useLocalStorageNumber.js';
import { useSwipeNav } from '../hooks/useSwipeNav.js';
import { BOOK_NAMES, PALEO_LETTERS } from '../lib/books.js';
import { buildBookSlugs, resolveBookParam, bookToParam, parallelHref } from '../lib/bookSlug.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { truncateTitle, versePreviewWithGloss } from '../lib/versePreview.js';
import { formatTokenRowDescriptive } from '../lib/tokenLabels.js';
import { apiBooks, apiTokens, apiRaw, apiBookOrder } from '../lib/api.js';
import { PALEO_KBD_ROWS } from '../lib/keyboards.js';
import TopBar from '../components/TopBar.jsx';
import BookChapterVerseSelects from '../components/BookChapterVerseSelects.jsx';
import DisplayPanel from '../components/DisplayPanel.jsx';
import SideNav from '../components/SideNav.jsx';
import WordBlock from '../components/WordBlock.jsx';
import BookIcon from '../components/BookIcon.jsx';
import TranslitGuide from '../components/TranslitGuide.jsx';
import { useToast } from '../components/Toast.jsx';
import '../components/SearchUI.css';

// Cross-language switching shared with MultiViewer: a book the Hebrew reader
// lacks (NT, pseudepigrapha, …) opens in the first of these that has it.
const HV_SOURCE_PRIORITY = ['BHS', 'HEB', 'GEZ', 'SYR', 'LXX', 'LAT', 'GRC', 'ENG'];
const HV_PILL_LABEL = { BHS:'Hebrew', HEB:'Heb·extra', GEZ:"Ge'ez", SYR:'Syriac', LXX:'Greek', LAT:'Latin', ENG:'English' };
const hvPickSource = (sources=[]) => HV_SOURCE_PRIORITY.find(s => sources.includes(s)) || sources[0] || null;
import './HebrewViewer.css';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function HebrewViewer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { theme } = useTheme();   // eslint-disable-line no-unused-vars
  const { mode: paleoMode, toggle: togglePaleoMode } = usePaleoMode();

  const bookParam = searchParams.get('book') || '1';
  const chapter = parseInt(searchParams.get('chapter') || '1', 10);
  const verseParam = searchParams.get('verse');
  // Which Hebrew edition to read. Both tokens_bhs (Masoretic) and tokens_nt (the HEB
  // edition, after build-heb-index.mjs --ot) have rows for the same OT book, so book_id
  // alone cannot say which one is meant — the source has to travel with the request.
  // Omitted for BHS, which keeps the URL clean and preserves the existing behaviour.
  // The dispatcher sends both 'hebrew' (the default) and 'bhs' here for the Masoretic
  // text, and 'heb' for the Hebrew-extra edition. Normalise to the two the server
  // understands so an unrecognised string can never silently fall back to the wrong
  // edition — after --ot BOTH tables have rows for the same OT book.
  const srcParam = ((searchParams.get('source') || 'bhs').toLowerCase() === 'heb') ? 'HEB' : 'BHS';
  const verse = verseParam ? parseInt(verseParam, 10) : null;

  // ── persisted display state ──────────────────────────────────────────────
  const [vplOn, setVplOn]   = useState(() => localStorage.getItem('idx-vpl')  === '1');
  const [morphOn, setMorphOn] = useState(() => localStorage.getItem('morphBg') === '1');
  const [legendOpen, setLegendOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [translitOpen, setTranslitOpen] = useState(false);
  const [tokenViewerOpen, setTokenViewerOpen] = useState(false);
  const [present, setPresent] = useState(false);

  useEffect(() => { localStorage.setItem('idx-vpl',  vplOn   ? '1' : '0'); }, [vplOn]);
  useEffect(() => { localStorage.setItem('morphBg', morphOn ? '1' : '0'); }, [morphOn]);
  useEffect(() => {
    document.body.classList.toggle('show-morph-bg', morphOn);
    document.body.classList.toggle('newline-mode',  vplOn);
    document.body.classList.toggle('present',       present);
    return () => {
      document.body.classList.remove('show-morph-bg', 'newline-mode', 'present');
    };
  }, [vplOn, morphOn, present]);

  // ── 2 font sliders (same as original: Paleo + English) ───────────────────
  // Note: a third slider exists on /parallel per user request, but the
  // single-column viewer only needs paleo + sub.
  // We don't need the value here — the hook side-effects keep the
  // CSS custom property in sync. The DisplayPanel's <SliderRow> components
  // own their own controlled state via the same hook, keyed on the same
  // localStorage key, so they pick up persisted values on first mount.
  useLocalStorageNumber('paleo-font-size', 38, '--paleo-size');
  const [subSize] = useLocalStorageNumber('sub-font-size', 14, '--sub-size');
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sub-maxw', Math.max(120, subSize * 12) + 'px'
    );
  }, [subSize]);

  // ── data ──────────────────────────────────────────────────────────────────
  const [books, setBooks] = useState([]);
  const [masterBooks, setMasterBooks] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [status, setStatus] = useState('Loading…');
  // Seeded from ?hl= when this page was reached by clicking a hit on the
  // /search results page (see Search.jsx) — highlights the matched term on
  // arrival. Only read once on mount: setUrl() below replaces the whole
  // query string on every in-viewer navigation, so hl naturally drops off
  // once the user moves away from the verse they searched for.
  const [activeSearchQ, setActiveSearchQ] = useState(() => searchParams.get('hl') || '');

  // `booksSettled`, not `books.length`: on a FAILED /api/books the list stays
  // empty forever, and gating on emptiness would hang the reader on a blank
  // page. What matters is that the question has been ASKED, not that it had an
  // answer — so this flips in `finally`.
  const [booksSettled, setBooksSettled] = useState(false);
  useEffect(() => {
    apiBooks().then(setBooks).catch(e => setStatus('Error: ' + e.message))
      .finally(() => setBooksSettled(true));
  }, []);
  useEffect(() => { apiBookOrder().then(setMasterBooks).catch(() => setMasterBooks([])); }, []);

  // Slug ↔ canon_id, from the master book list (same input + slugify as Parallel,
  // so slugs agree across readers). A slug URL resolves once masterBooks loads;
  // numeric ?book still works.
  const { slugToId, idToSlug } = useMemo(
    () => buildBookSlugs((masterBooks || []).map(mb => {
      const id = mb.id ?? mb.book_id ?? mb.canon_id;   // tolerate whichever id field the API returns
      return { id, name: mb.name || BOOK_NAMES[id] };
    })),
    [masterBooks]
  );
  const book = resolveBookParam(bookParam, slugToId, 1);
  // A slug URL (?book=john) can only resolve once the map loads. Until then, don't
  // act on the Genesis fallback — that flashed the wrong book and wasted a fetch.
  const bookReady = !bookParam || /^\d+$/.test(bookParam) || Object.keys(slugToId).length > 0;

  // Which sources this book actually has, and whether it has BHS. A book is
  // "foreign" (no Masoretic Hebrew) when the Hebrew book list (/api/books) omits
  // it — e.g. the NT. `curForeign` is null until that list has loaded.
  const curForeign = books.length ? !books.some(b => b.book_id === book) : null;
  const curSources = useMemo(() => {
    const mb = masterBooks.find(m => (m.id ?? m.book_id ?? m.canon_id) === book);
    return mb?.sources || [];
  }, [masterBooks, book]);
  const curPrimary = useMemo(() => {
    const mb = masterBooks.find(m => (m.id ?? m.book_id ?? m.canon_id) === book);
    return mb ? hvPickSource(mb.sources) : null;
  }, [masterBooks, book]);

  // A book with no BHS text used to be redirected straight out to the generic
  // multi-source viewer, which renders bare glyphs with "— not glossed —". That was right
  // when /api/tokens served BHS only. It no longer is: tokens_nt now carries Strong's for
  // the HEB corpus, and the server routes /api/tokens to it, so these books CAN render
  // here with full decomposition, glosses and Strong's badges.
  // So: don't redirect on "no BHS" — try the tokens first and redirect only if the fetch
  // genuinely comes back empty. That needs no capability metadata and self-corrects as
  // more of the corpus gets tagged (e.g. after build-heb-index.mjs --apply --ot).
  const [foreignEmpty, setForeignEmpty] = useState(false);
  useEffect(() => { setForeignEmpty(false); }, [book, chapter]);
  useEffect(() => {
    if (!bookReady || curForeign !== true || !foreignEmpty) return;
    const dest = curPrimary || 'HEB';
    const p = new URLSearchParams({ source: dest, book: bookToParam(book, idToSlug), chapter: String(chapter) });
    if (verse != null) p.set('verse', String(verse));
    navigate(`/?${p}`, { replace: true });
  }, [bookReady, curForeign, foreignEmpty, curPrimary, book, chapter, verse, idToSlug, navigate]);

  useEffect(() => {
    // Wait for BOTH the slug map and the Hebrew book list. `curForeign` is a
    // dependency of this effect and is null until /api/books answers, so firing
    // early meant every chapter loaded TWICE: once against curForeign=null, then
    // again the moment the list arrived — the first pair of requests cancelled
    // and thrown away, and the reader waiting on the second round trip. Same
    // shape as the Parallel capsReady fix: don't act before the fact is knowable.
    if (!bookReady || !booksSettled) return;
    let cancelled = false;
    setStatus('Loading…');
    setTokens([]); setRawRows([]);
    (async () => {
      try {
        const [parsed, raw] = await Promise.all([
          apiTokens(book, chapter, srcParam === 'BHS' ? undefined : srcParam),
          apiRaw(book, chapter),
        ]);
        if (cancelled) return;
        // No tokens for a book that also has no BHS text → nothing to show here; let the
        // redirect above hand it to the source viewer.
        if (curForeign === true && !(Array.isArray(parsed) && parsed.length)) {
          setForeignEmpty(true); setStatus(''); return;
        }
        setTokens(parsed);
        setRawRows(raw);
        setStatus('');
      } catch (e) {
        if (!cancelled) setStatus('Error: ' + e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [book, chapter, bookReady, booksSettled, curForeign, srcParam]);

  const verseNums = useMemo(
    () => [...new Set(tokens.map(t => t.verse))].sort((a, b) => a - b),
    [tokens]
  );
  const verseCount = verseNums.length ? Math.max(...verseNums) : 0;
  const meta = books.find(b => b.book_id === book);

  // ── nav ──────────────────────────────────────────────────────────────────
  const setUrl = useCallback((b, c, v) => {
    const p = { book: bookToParam(b, idToSlug), chapter: String(c) };
    if (v) p.verse = String(v);
    setSearchParams(p);
  }, [setSearchParams, idToSlug]);

  // Master cross-language book list. Books the Hebrew Bible has stay here with
  // their chapter range; the rest are shown too and switch source when chosen.
  const hvBookMeta = useMemo(() => { const m={}; for (const b of books) m[b.book_id]=b; return m; }, [books]);
  const dropdownBooks = useMemo(() => {
    if (!masterBooks.length) return books;
    return masterBooks.map((mb, i) => {
      const here = hvBookMeta[mb.id];
      const foreign = !here;
      const primary = foreign ? hvPickSource(mb.sources) : 'BHS';
      // mb.name is the server-resolved title from /api/book-order (canonName()
      // there already does real-title lookup across every source, falling back
      // to "Book N" only when truly nothing better exists anywhere). here?.name
      // only covers books present in THIS source, so a cross-language-only
      // work (no BHS text at all) always missed it and showed its number
      // instead of its title — even though mb.name had the real name the
      // whole time (idToSlug just above already uses it correctly).
      const name = mb.name || BOOK_NAMES[mb.id] || here?.name || `Book ${mb.id}`;
      return {
        book_id: mb.id, seq: i + 1,
        // here (BHS-only) is authoritative for OT books, including its
        // versification/DISPLAY_LAST_CHAPTER overrides — keep preferring it
        // when present. For books BHS doesn't have (every NT/HEB-only book),
        // this used to fall straight to 1, which is wrong: /api/book-order's
        // mb.first/mb.last already carry the correct range, computed across
        // ALL sources (corpus.db's unified `verses` table, keyed by
        // canon_id) — just wasn't being read. That's what made every
        // foreign book's chapter dropdown show only "Chapter 1".
        first_chapter: here?.first_chapter ?? mb.first ?? 1,
        last_chapter:  here?.last_chapter  ?? mb.last  ?? 1,
        name,
        label: name,
        foreign, sources: mb.sources, primary,
      };
    });
  }, [masterBooks, hvBookMeta, books]);
  const onPickBook = useCallback((id) => {
    const mb = dropdownBooks.find(b => b.book_id === id);
    if (mb && mb.foreign && mb.primary)
      navigate(`/?source=${mb.primary}&book=${bookToParam(id, idToSlug)}&chapter=1`);
    else setUrl(id, 1, null);
  }, [dropdownBooks, navigate, setUrl, idToSlug]);

  const enterVerse = useCallback(v => {
    setUrl(book, chapter, v);
    window.scrollTo({ top: 0 });
  }, [book, chapter, setUrl]);

  const exitVerseScroll = useCallback(() => {
    const prev = verse;
    setUrl(book, chapter, null);
    if (prev) {
      setTimeout(() => {
        const el = document.querySelector(`[data-verse="${prev}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }
  }, [book, chapter, verse, setUrl]);

  const exitVerseTop = useCallback(() => {
    setUrl(book, chapter, null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [book, chapter, setUrl]);

  const sideNav = useCallback(dir => {
    if (!meta) return;
    if (verse != null) {
      const next = verse + dir;
      if (next < 1) {
        if (chapter <= meta.first_chapter) return;
        setUrl(book, chapter - 1, 9999);
      } else if (next > verseCount) {
        if (chapter >= meta.last_chapter) return;
        setUrl(book, chapter + 1, 1);
      } else {
        enterVerse(next);
      }
    } else {
      const newCh = chapter + dir;
      if (newCh < meta.first_chapter || newCh > meta.last_chapter) return;
      setUrl(book, newCh, null);
    }
  }, [meta, verse, chapter, book, verseCount, setUrl, enterVerse]);

  useEffect(() => {
    if (verse != null && verseCount && verse > verseCount) {
      setUrl(book, chapter, verseCount);
    }
  }, [verse, verseCount, book, chapter, setUrl]);

  useSwipeNav(() => sideNav(-1), () => sideNav(+1));

  // Custom copy handler — when user manually selects across the output,
  // reconstruct clean paleo from .search-text spans (which contain raw glyphs).
  const outputRef = useRef(null);
  useEffect(() => {
    const onCopy = e => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const anchor = sel.anchorNode;
      const out = outputRef.current;
      if (!out || !anchor || !out.contains(anchor)) return;
      const range = sel.getRangeAt(0);
      const fragment = range.cloneContents();
      const searchSpans = fragment.querySelectorAll('.search-text');
      if (searchSpans.length > 0) {
        const words = [...searchSpans].map(s => s.textContent.trim()).filter(Boolean);
        if (words.length > 0) {
          e.clipboardData.setData('text/plain', words.join(' '));
          e.preventDefault();
        }
      }
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, []);

  // ── grouped tokens for rendering ─────────────────────────────────────────
  const grouped = useMemo(() => {
    const rows = verse != null ? tokens.filter(w => w.verse === verse) : tokens;
    const byVerse = {};
    rows.forEach(w => { (byVerse[w.verse] ||= []).push(w); });
    return Object.keys(byVerse).map(v => +v).sort((a, b) => a - b)
      .map(v => ({ verse: v, words: byVerse[v] }));
  }, [tokens, verse]);

  // ── Descriptive raw tokens ───────────────────────────────────────────────
  // Mirrors the original index.html exactly: pure raw corpus rows formatted
  // descriptively with no parser interpretation. The corpus is the source of
  // truth; this view exposes what the .bhs file literally says so you can
  // validate the app's rendering against it. No components, no css classes,
  // no parser-derived data. Filters to the current verse when one is selected,
  // otherwise shows the whole chapter.
  const tokenViewerText = useMemo(() => {
    const rows = verse != null ? rawRows.filter(r => r.verse === verse) : rawRows;
    return rows.map(formatTokenRowDescriptive).join('\n');
  }, [rawRows, verse]);

  const bookName = (dropdownBooks.find(b => b.book_id === book)?.name) || BOOK_NAMES[book] || `Book ${book}`;
  // ── browser tab title (2026-08-15) ─────────────────────────────────────
  // "<book> <ch>:<v> | <language> | <text preview>" — same convention as
  // MultiViewer.jsx (the other half of this reader family), with a live
  // preview of the verse's transliteration+gloss (see ../lib/versePreview.js)
  // once a single verse is selected, matching BibleHub-style tabs.
  const hvLangLabel = HV_PILL_LABEL[srcParam] || 'Hebrew';
  const hvTitleParts = [`${bookName} ${chapter}${verse != null ? ':' + verse : ''}`, hvLangLabel];
  if (verse != null) {
    const versePreview = truncateTitle(versePreviewWithGloss(grouped.find(g => g.verse === verse)?.words), 70);
    if (versePreview) hvTitleParts.push(versePreview);
  }
  usePageTitle(hvTitleParts.join(' | '));

  return (
    <div className="hv-page">
      <TopBar
        title="Hebrew Viewer"
        hideOnScroll={!present}
        actions={
          <>
            <Link
              className="txt-btn"
              to={parallelHref(book, idToSlug, chapter, verse)}
            >📖 Parallel</Link>
            <Link
              className="icon-btn"
              to={`/bible?book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`}
              title="Open this chapter as flowing text"
            ><BookIcon /></Link>
            {/* Fixed-order language switcher — identical order to MultiViewer so
                the same physical slot is always the same language across both
                readers. Hebrew is the active reader here: filled blue (white
                text) and non-navigating; the rest jump to the same verse via the
                unified /?source=X URL. direction:ltr keeps the row stable. */}
            <span
              className="rd-langbar"
              style={{ direction: 'ltr', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
            >
              {/* Real toggle: the link target must depend on srcParam, not always
                  point at HEB. It used to always link TO HEB regardless of which
                  edition was currently showing, so once you swapped to Heb·extra
                  there was no way back — clicking it just reloaded the same page.
                  fieldy, 2026-07-31: "i go to Heb Other and cant go back". */}
              {curSources.includes('HEB') ? (
                srcParam === 'HEB' ? (
                  <Link
                    className="txt-btn rd-srclink"
                    aria-current="true"
                    to={`/?book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`}
                    style={{ background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', cursor: 'pointer' }}
                    title="Showing Hebrew (Extra) — click to swap to BHS"
                  >Heb Extra ⇄ BHS</Link>
                ) : (
                  <Link
                    className="txt-btn rd-srclink"
                    aria-current="true"
                    to={`/?source=HEB&book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`}
                    style={{ background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', cursor: 'pointer' }}
                    title="Showing BHS — click to swap to Hebrew (Extra)"
                  >BHS ⇄ Heb Extra</Link>
                )
              ) : (
                <span
                  className="txt-btn rd-srclink"
                  aria-current="true"
                  style={{ background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' }}
                  title="Showing BHS"
                >BHS</span>
              )}
              {[
                { key: 'GEZ', label: "Ge'ez",   title: "Open this verse in the Ge'ez Bible" },
                { key: 'SYR', label: 'Syriac',  title: 'Open this verse in the Syriac Peshitta' },
                { key: 'LXX', label: 'Greek',   title: 'Open this verse in the Septuagint' },
                { key: 'LAT', label: 'Latin',   title: 'Open this verse in the Latin Vulgate' },
                { key: 'ENG', label: 'English', title: 'Open this verse in English' },
              ].map(({ key, label, title }) => {
                // A source you can't open is shown disabled, not hidden, so the row
                // stays stable — you simply can't attempt a text that isn't there.
                const available = curSources.includes(key);
                return available ? (
                  <Link
                    key={key}
                    className="txt-btn rd-srclink"
                    to={`/?source=${key}&book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`}
                    title={title}
                  >{label}</Link>
                ) : (
                  <span
                    key={key}
                    className="txt-btn rd-srclink rd-srclink-disabled"
                    aria-disabled="true"
                    title={`${label} — not available for this book`}
                    style={{ opacity: 0.32, cursor: 'not-allowed', pointerEvents: 'none' }}
                  >{label}</span>
                );
              })}
            </span>
            <button
              className={`icon-btn ${present ? 'active' : ''}`}
              onClick={() => setPresent(p => !p)}
              title="Presentation mode"
              aria-label="Presentation mode"
            >{present ? '✕' : '⛶'}</button>
            <button
              className="icon-btn"
              onClick={() => setDisplayOpen(true)}
              title="Display options"
              aria-label="Display options"
              style={{ fontSize: 14 }}
            >⚙</button>
          </>
        }
      >
        <BookChapterVerseSelects
          books={dropdownBooks}
          book={book}
          chapter={chapter}
          verse={verse}
          verses={verseNums}
          onBook={onPickBook}
          onChapter={c => setUrl(book, c, null)}
          onVerse={v => setUrl(book, chapter, v || null)}
        />
        <span className="status" aria-live="polite">{status}</span>
        <button
          className={`txt-btn ${searchOpen ? 'active-search' : ''}`}
          onClick={() => setSearchOpen(o => !o)}
          aria-pressed={searchOpen}
          style={{ marginLeft: 'auto' }}
        >𐤀𐤁𐤂 Search</button>
      </TopBar>

      {verse != null && (
        <div className="hv-verse-bar">
          <span className="hv-verse-ref">{bookName} {chapter}:{verse}</span>
          <button className="hv-back-btn" onClick={exitVerseScroll}>↑ Full chapter</button>
        </div>
      )}

      <div className="hv-options-row">
        <button className="txt-btn" onClick={() => setLegendOpen(o => !o)}>
          Legend {legendOpen ? '▴' : '▾'}
        </button>
      </div>

      {legendOpen && <ViewerLegend />}

      {searchOpen && <SearchSection onClose={() => setSearchOpen(false)} />}

      <div className="hv-reader-wrap" ref={outputRef}>
        <div className="hv-output">
          <h2 className="hv-ref-title">
            {verse != null ? `${bookName} ${chapter}:${verse}` : `${bookName} — Chapter ${chapter}`}
          </h2>

          {grouped.map(g => (
            <VerseGroup
              key={g.verse}
              verse={g.verse}
              words={g.words}
              isActive={verse === g.verse}
              vplOn={vplOn}
              activeSearchQ={activeSearchQ}
              onEnterVerse={enterVerse}
            />
          ))}
        </div>

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
      </div>

      <SideNav
        onPrev={() => sideNav(-1)}
        onNext={() => sideNav(+1)}
        hiddenPrev={meta && chapter <= meta.first_chapter && (verse == null || verse <= 1)}
        hiddenNext={meta && chapter >= meta.last_chapter && (verse == null || verse >= verseCount)}
      />

      <DisplayPanel open={displayOpen} onClose={() => setDisplayOpen(false)}>
        <label className="toggle-wrap">
          <div className="toggle">
            <input type="checkbox" checked={vplOn} onChange={e => setVplOn(e.target.checked)} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </div>
          <span>Verse per line</span>
        </label>
        <label className="toggle-wrap">
          <div className="toggle">
            <input type="checkbox" checked={morphOn} onChange={e => setMorphOn(e.target.checked)} />
            <div className="toggle-track" />
            <div className="toggle-thumb" />
          </div>
          <span>Highlight backgrounds</span>
        </label>
        <button
          className="dp-pill"
          onClick={() => setTranslitOpen(true)}
          style={{ alignSelf: 'flex-start' }}
        >𐤀𐤁𐤂 Translit Guide</button>

        <div className="dp-divider" />

        <div className="dp-row">
          <span>Paleo view</span>
          <button
            className={`dp-pill ${paleoMode === 'mobile' ? 'active' : ''}`}
            onClick={togglePaleoMode}
          >{paleoMode === 'mobile' ? '📱 Mobile' : '🖥 Desktop'}</button>
        </div>

        <div className="dp-divider" />

        <SliderRow label="𐤀 Paleo size"
                   storageKey="paleo-font-size" cssVar="--paleo-size"
                   min={10} max={250} def={38} />
        <SliderRow label="Aa English size"
                   storageKey="sub-font-size"   cssVar="--sub-size"
                   min={8}  max={72}  def={14} />
      </DisplayPanel>

      <TranslitGuide open={translitOpen} onClose={() => setTranslitOpen(false)} />

      {present && (
        <button
          className="hv-present-exit"
          onClick={() => setPresent(false)}
          aria-label="Exit presentation mode"
        >✕</button>
      )}
    </div>
  );
}

// ── Verse group renderer ─────────────────────────────────────────────────────
function VerseGroup({ verse, words, isActive, vplOn, activeSearchQ, onEnterVerse }) {
  return (
    <div
      className={`hv-verse-wrapper ${vplOn ? 'block-mode' : ''} ${isActive ? 'highlighted' : ''}`}
      data-verse={verse}
    >
      <button
        className={`hv-verse-marker ${isActive ? 'verse-mode-active' : ''}`}
        title="Go to this verse"
        onClick={() => onEnterVerse(verse)}
      >{verse}</button>
      {words.map((w, i) => (
        <WordBlock
          key={i}
          wordObj={w}
          showSub
          showCopyBtn
          showStrongs
          highlightSearch={activeSearchQ}
        />
      ))}
    </div>
  );
}

// ── Slider row in display panel ──────────────────────────────────────────────
function SliderRow({ label, storageKey, cssVar, min, max, def }) {
  const [v, setV] = useLocalStorageNumber(storageKey, def, cssVar);
  return (
    <div className="font-slider-group">
      <label>
        <span>{label}</span>
        <span>{v}px</span>
      </label>
      <input
        type="range"
        className="font-slider"
        min={min} max={max} step={1}
        value={v}
        onChange={e => setV(e.target.value)}
      />
    </div>
  );
}

// ── Search composer (collapsible panel) ─────────────────────────────────────
// Quick-entry only — no longer fetches or renders results itself. Submitting
// navigates to the standalone /search results page (Search.jsx), which owns
// the query in the URL so results survive the back button. Kept here as a
// fast on-ramp: click the paleo keyboard, hit Search, land on /search.
function SearchSection({ onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('exact');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const runSearch = () => {
    const query = q.trim();
    if (!query) return;
    navigate(`/search?q=${encodeURIComponent(query)}&mode=${mode}`);
    onClose();
  };

  const appendChar = ch => {
    setQ(prev => prev + ch);
    inputRef.current?.focus();
  };
  const backspace = () => setQ(prev => [...prev].slice(0, -1).join(''));

  return (
    <section className="hv-search-section" aria-label="Search">
      <div className="hv-search-top">
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
          placeholder="𐤀𐤁𐤂 type or click letters below…"
          autoComplete="off"
          aria-label="Paleo Hebrew search query"
        />
        <button
          className="hv-search-clear"
          onClick={() => setQ('')}
          title="Clear"
          aria-label="Clear"
        >✕</button>
        <button className="hv-search-btn" onClick={runSearch}>
          Search
        </button>
        <button className="hv-search-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="hv-paleo-kbd-wrap">
        <button className="hv-paleo-kbd-delete" onClick={backspace} aria-label="Backspace">⌦</button>
        <div className="hv-paleo-kbd">
          {PALEO_KBD_ROWS.map((row, ri) => (
            <div className="hv-kbd-row" key={ri}>
              {row.map(ch => (
                <button key={ch} className="hv-kbd-key" onClick={() => appendChar(ch)}>{ch}</button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="hv-search-mode-toggle" role="tablist">
        <button
          className={`mode-btn ${mode === 'exact' ? 'active' : ''}`}
          onClick={() => setMode('exact')}
          role="tab" aria-selected={mode === 'exact'}
        >Exact / Ranked</button>
        <button
          className={`mode-btn ${mode === 'chrono' ? 'active' : ''}`}
          onClick={() => setMode('chrono')}
          role="tab" aria-selected={mode === 'chrono'}
        >Chronological</button>
      </div>
    </section>
  );
}

// ── Legend (mini version for the viewer) ────────────────────────────────────
function ViewerLegend() {
  return (
    <div className="hv-legend">
      <div className="leg-section">Parts of Speech</div>
      <LegendDot cls="root" sample="root" label="Root stem" />
      <LegendDot cls="mod-conj" sample="And" label="Conjunction" />
      <LegendDot cls="mod-prep" sample="in"  label="Preposition" />
      <LegendDot cls="mod-art"  sample="The" label="Article" />
      <LegendDot cls="mod-nega" sample="NOT" label="Negation" />
      <LegendDot cls="mod-nmpr" sample="𐤍𐤌" label="Proper noun" />
      <LegendDot cls="mod-advb" sample="adv" label="Adverb" />
      <LegendDot cls="mod-intj" sample="!" label="Interjection" />
      <LegendDot cls="mod-prps" sample="pro" label="Pronoun (pers)" />
      <LegendDot cls="mod-prde" sample="this" label="Pronoun (dem)" />

      <div className="leg-section">Verbal Prefixes</div>
      <LegendDot cls="pfm-3ms"  sample="He" label="He/It (3ms)" />
      <LegendDot cls="pfm-2or3f" sample="She" label="She/You (2/3f)" />
      <LegendDot cls="pfm-1cs"  sample="I" label="I (1cs)" />
      <LegendDot cls="pfm-1cp"  sample="We" label="We (1cp)" />

      <div className="leg-section">Verbal Stems</div>
      <LegendDot cls="vbs-hif" sample="cau" label="Causative (Hifil)" />
      <LegendDot cls="vbs-nif" sample="pas" label="Passive (Nifal)" />
      <LegendDot cls="vbs-hit" sample="ref" label="Reflexive (Hitpael)" />

      <div className="leg-section">Pronominal Suffixes</div>
      <LegendDot cls="prs-1cs" sample="My" label="My/Me (1cs)" />
      <LegendDot cls="prs-3ms" sample="His" label="His (3ms)" />
      <LegendDot cls="prs-3fs" sample="Her" label="Her (3fs)" />
      <LegendDot cls="prs-3mp" sample="Thm" label="Them (3mp)" />

      <div className="leg-section">Nominal Endings</div>
      <LegendDot cls="nme-h"  sample="H"  label="She/Direction" />
      <LegendDot cls="nme-jm" sample="JM" label="Plural (m)" />
      <LegendDot cls="nme-wt" sample="WT" label="Plural (f)" />

      <div className="legend-note">
        Click any glyph to copy its Unicode · Toggle "Highlight backgrounds" above for tinted backgrounds
      </div>
    </div>
  );
}
function LegendDot({ cls, sample, label }) {
  return (
    <div className="legend-item">
      <div className={`legend-dot ${cls}`}>{sample}</div>
      <span>{label}</span>
    </div>
  );
}
