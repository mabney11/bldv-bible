import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { apiTransProgress, apiTransVerse, apiTokens, apiRootFirstByLetters } from '../lib/api.js';
import { buildBookSlugs, resolveBookParam, bookToParam, parallelHref } from '../lib/bookSlug.js';
import { usePageTitle, formatRef } from '../hooks/usePageTitle.js';
import { WordRow, computeWordParts, transliterationsToHtml } from '../components/WordBlock.jsx';
import BookIcon from '../components/BookIcon.jsx';
import { TYPEFACES } from '../lib/typefaces.js';
// Reuse Reader.jsx's own "root (gloss)" + quote-nesting prose renderer for
// the verse-text paragraph below, instead of dumping verseData.text as a
// plain string — see renderVerseNodesWithQuotes's own comment in Reader.jsx.
import { renderVerseNodesWithQuotes, sanitizeText } from './Reader.jsx';
import './Reader.css';
import './VersePage.css';

// Same key + default Reader.jsx persists its own typeface choice under —
// "lets persist the font between the reader and the single scripture page":
// this page previously never read that choice at all, so it always rendered
// Reader.css's hardcoded fallback (Lexend) regardless of what was picked in
// the Reader. Reading the SAME localStorage key here (rather than a
// page-scoped one, which is typefaces.js's normal per-page convention — see
// that file's own comment) is deliberate: the whole point is that these two
// pages now agree.
const TYPEFACE_DEFAULT = 'alegreya';
const TYPEFACE_KEY = 'reader-typeface';

// ─────────────────────────────────────────────────────────────────────────────
// VERSE PAGE — the clean, path-based single-verse view: /genesis/1/1.
//
// This is the user-facing surface for the per-verse content that
// server/prerender.js's englishVerseRoute() already generates for crawlers at
// /bible?book=&chapter=&verse=. That query-string URL stays the canonical,
// indexed address (Phase 1 verse-level SEO, 2026-08-15) — this page is
// intentionally a client-only route, not (yet) prerendered, since what was
// asked for here is the reading feature: a focused verse view you can hop
// through with arrow keys or a swipe, not a second crawlable URL for the same
// content. If that's wanted later, prerender.js's ROUTES dispatch would need
// a pattern-matched entry for /:bookSlug/:chapter/:verse alongside the
// existing exact-pathname routes.
//
// Reuses Reader.css's .reader-root/.rd-bar/.rd-scroll/.rd-page/.rd-foot shell
// wholesale (same CSS custom properties, same night/parchment themes) so this
// reads as part of the same reading experience rather than a bolted-on page.
// ─────────────────────────────────────────────────────────────────────────────
export default function VersePage() {
  const { bookSlug, chapter: chapterParam, verse: verseParam } = useParams();
  const navigate = useNavigate();
  useTheme(); // applies data-theme on <html>; the value itself isn't needed here

  // ── reading typeface (persisted, shared with the Reader) ────────────────
  const [typeface] = useState(() => {
    try {
      const saved = localStorage.getItem(TYPEFACE_KEY);
      return TYPEFACES.some(f => f.id === saved) ? saved : TYPEFACE_DEFAULT;
    } catch { return TYPEFACE_DEFAULT; }   // private mode / storage disabled
  });
  const typefaceStack = useMemo(
    () => (TYPEFACES.find(f => f.id === typeface) || TYPEFACES[0]).stack,
    [typeface]
  );

  const [progress, setProgress] = useState(null);
  useEffect(() => {
    let cancelled = false;
    apiTransProgress().then(p => { if (!cancelled) setProgress(p); }).catch(() => { if (!cancelled) setProgress({ books: [] }); });
    return () => { cancelled = true; };
  }, []);

  const books = progress?.books || [];
  // Same {id, name} → slug shape every other page builds from — book_id/name
  // here happen to already be exactly what buildBookSlugs wants.
  const { slugToId, idToSlug } = useMemo(
    () => buildBookSlugs(books.map(b => ({ id: b.book_id, name: b.name }))),
    [books]
  );

  const bookId = books.length ? resolveBookParam(bookSlug, slugToId, null) : null;
  const chapter = /^\d+$/.test(chapterParam || '') ? +chapterParam : null;
  const verse = /^\d+$/.test(verseParam || '') ? +verseParam : null;
  const bookData = books.find(b => b.book_id === bookId) || null;
  const bookName = bookData?.name || '';
  // Only meaningful to say "this address doesn't resolve" once the progress
  // list has actually loaded — before that, bookId is just null because
  // there's nothing to resolve against yet, not because it's invalid.
  const resolved = !!progress;
  const addressValid = resolved && !!bookId && !!chapter && verse != null;

  const [verseData, setVerseData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!addressValid) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    apiTransVerse(bookId, chapter, verse)
      .then(d => { if (!cancelled) { setVerseData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setVerseData(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [addressValid, bookId, chapter, verse]);

  const verseRef = addressValid ? formatRef(bookName, chapter, verse) : '';
  usePageTitle(verseRef ? `${verseRef} | Reader` : '');

  // ── Hebrew Viewer word-by-word — "the hebrew viewew wordblocks for the
  // 'word by word'": fetch the SAME token data HebrewViewer.jsx renders
  // (apiTokens, decomposed components[] with glyphs/translit/gloss), not the
  // flat translation-alignment tokens apiTransVerse returns, then filter down
  // to this one verse and hand each word to the shared WordBlock component so
  // this looks exactly like the Hebrew Viewer's own verse row. Fetched at the
  // chapter grain (apiTokens has no per-verse endpoint — same call
  // HebrewViewer itself makes), filtered client-side to `verse`.
  const [chapterTokens, setChapterTokens] = useState([]);
  useEffect(() => {
    if (!addressValid) { setChapterTokens([]); return; }
    let cancelled = false;
    apiTokens(bookId, chapter)
      .then(t => { if (!cancelled) setChapterTokens(Array.isArray(t) ? t : []); })
      .catch(() => { if (!cancelled) setChapterTokens([]); });
    return () => { cancelled = true; };
  }, [addressValid, bookId, chapter]);
  const hebrewWords = useMemo(
    () => chapterTokens.filter(t => t.verse === verse),
    [chapterTokens, verse]
  );

  // ── Paleo translation — the verse's own transliteration, word by word,
  // WITH punctuation ("the maqaf between Il and Panayam should be in the
  // word-by-word, the paleo translation, and the raw text" — computeWordParts'
  // { includeMarks: true } opt is exactly for this; see its own comment).
  // Computed once per word, shared by both the colored inline sentence (the
  // English/Hebrew toggle below) and the plain-text "raw text" box, so the
  // two can never drift apart from independently re-deriving the same data.
  const hebrewWordPartsMarked = useMemo(
    () => hebrewWords.map(w => computeWordParts(w, { includeMarks: true })),
    [hebrewWords]
  );
  // Plain string, e.g. "AthaHaShamayam WaAthaHaAratz ׃" — for copy/paste and
  // the collapsible raw-text box below the word-by-word table.
  const paleoSentence = useMemo(
    () => hebrewWordPartsMarked
      .map(p => p.transliterations.map(t => t.text).join(''))
      .filter(Boolean)
      .join(' '),
    [hebrewWordPartsMarked]
  );
  // Same sentence, but as HTML with the SAME per-component coloring every
  // other transliteration line in the app uses (transliterationsToHtml —
  // shared with WordRow's own Transliteration column) — this is what backs
  // the "Hebrew" mode of the English/Hebrew toggle over the main verse text.
  const paleoSentenceHtml = useMemo(
    () => hebrewWordPartsMarked
      .map(p => transliterationsToHtml(p.transliterations))
      .filter(Boolean)
      .join(' '),
    [hebrewWordPartsMarked]
  );

  // English/Hebrew toggle for the main verse-text display. Falls back to
  // English if navigation lands on a verse with no Hebrew data while still
  // set to 'hebrew' (the toggle itself only renders when there IS data, but
  // the mode is remembered across verse navigation, so this guards against
  // showing a blank Hebrew pane on a verse that has none).
  const [textMode, setTextMode] = useState('english'); // 'english' | 'hebrew'
  const showHebrewText = textMode === 'hebrew' && hebrewWords.length > 0;

  // Collapsible raw-text box (plain, copyable) below the word-by-word table —
  // mirrors HebrewViewer's own "descriptive raw tokens" toggle UX.
  const [rawTextOpen, setRawTextOpen] = useState(false);

  // ── "root|lex_word|definition|modifications|strongs #s|link to the first
  // verse the root appears in" — "The 'First surface' can be removed" (the
  // surface-form lookup column was dropped per that request; only the
  // root-letters lookup remains) — a lookup per word: the first
  // (canonically earliest) verse this word's ROOT LETTERS appear in at all,
  // deliberately NOT scoped to one Strong's number — see api.js's
  // apiRootFirstByLetters — so homographs (e.g. all of Aman's H539-H544)
  // resolve to the same true first appearance instead of whichever number
  // this particular instance happens to carry.
  // "the time to calculate first verse location is not acceptable. This is
  // something that should be known in the concordance" — this used to be
  // N client-side round trips per word (a root-list search PLUS one verses
  // call per homograph number it found, times every word in the verse). Now
  // it's one batched request per verse load for every distinct root, and the
  // server itself caches each root's answer for the life of the process
  // (server.js's _firstByRootLettersCache), so a root already looked up from
  // ANY verse answers instantly.
  // Keyed by `root:<paleo letters>` and accumulated across verse navigations
  // rather than reset per verse, so re-visiting a root already looked up
  // (client-side, on top of the server's own cache) costs nothing.
  const [firstOcc, setFirstOcc] = useState({});
  useEffect(() => {
    if (!hebrewWords.length) return;
    const roots = new Set();
    for (const w of hebrewWords) {
      const parts = computeWordParts(w);
      // The CANONICAL root letters (server's true_root, e.g. 𐤉𐤔𐤏), not the
      // reader-facing display root — the display root keeps surface matres/
      // restored radicals baked in (e.g. 𐤉𐤅𐤔𐤉𐤏 for a hifil form of H3467),
      // and _firstAppearanceByRoot on the server is keyed by the exact
      // canonical spelling from strongs-roots.json. Looking up a display
      // variant that includes those extra letters never matches an index
      // entry, so the cell silently rendered "—" for any word whose root
      // picked up a mater or restored radical. Falls back to the display
      // paleo (then the word's own full letters) only when the server sent
      // no true_root at all, so a word with no separate root component still
      // has something to search by.
      const rootPaleo = parts.rootTrans[0]?.trueRoot || parts.rootTrans[0]?.paleo || parts.purePaleo || null;
      if (rootPaleo && !(`root:${rootPaleo}` in firstOcc)) roots.add(rootPaleo);
    }
    if (!roots.size) return;
    let cancelled = false;
    apiRootFirstByLetters([...roots]).catch(() => null).then(rootRes => {
      if (cancelled) return;
      setFirstOcc(prev => {
        const next = { ...prev };
        for (const r of roots) next[`root:${r}`] = rootRes?.results?.[r] ?? null;
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [hebrewWords]);

  // Renders a first-occurrence table cell: "…" while the lookup is still in
  // flight (key not yet in firstOcc at all), an em dash if the lookup came
  // back with nothing, otherwise a link to that verse's own VersePage.
  const renderFirstHit = (lookupKey) => {
    if (!lookupKey) return <span className="wr-first-none">—</span>;
    if (!(lookupKey in firstOcc)) return <span className="wr-first-loading">…</span>;
    const hit = firstOcc[lookupKey];
    if (!hit) return <span className="wr-first-none">—</span>;
    return (
      <Link to={`/${bookToParam(hit.book_id, idToSlug)}/${hit.chapter}/${hit.verse}`}>
        {hit.book_name} {hit.chapter}:{hit.verse}
      </Link>
    );
  };

  // ── verse-to-verse navigation, rolling across chapter/book boundaries ──────
  const go = useCallback((b, c, v) => {
    navigate(`/${bookToParam(b, idToSlug)}/${c}/${v}`);
  }, [navigate, idToSlug]);

  const prevLoc = useMemo(() => {
    if (!bookData || !chapter || verse == null) return null;
    if (verse > 1) return { b: bookId, c: chapter, v: verse - 1 };
    const chapters = bookData.chapters || [];
    const idx = chapters.findIndex(c => c.chapter === chapter);
    if (idx > 0) {
      const prevCh = chapters[idx - 1];
      return { b: bookId, c: prevCh.chapter, v: prevCh.total || 1 };
    }
    const bIdx = books.findIndex(b => b.book_id === bookId);
    const pb = bIdx > 0 ? books[bIdx - 1] : null;
    if (pb && pb.chapters?.length) {
      const lastCh = pb.chapters[pb.chapters.length - 1];
      return { b: pb.book_id, c: lastCh.chapter, v: lastCh.total || 1 };
    }
    return null;
  }, [bookData, bookId, chapter, verse, books]);

  const nextLoc = useMemo(() => {
    if (!bookData || !chapter || verse == null) return null;
    const chapters = bookData.chapters || [];
    const idx = chapters.findIndex(c => c.chapter === chapter);
    const curTotal = chapters[idx]?.total || 1;
    if (verse < curTotal) return { b: bookId, c: chapter, v: verse + 1 };
    if (idx >= 0 && idx < chapters.length - 1) {
      return { b: bookId, c: chapters[idx + 1].chapter, v: 1 };
    }
    const bIdx = books.findIndex(b => b.book_id === bookId);
    const nb = bIdx >= 0 && bIdx < books.length - 1 ? books[bIdx + 1] : null;
    if (nb && nb.chapters?.length) {
      return { b: nb.book_id, c: nb.chapters[0].chapter, v: 1 };
    }
    return null;
  }, [bookData, bookId, chapter, verse, books]);

  // ── keyboard nav: ← previous verse, → next verse ───────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { if (prevLoc) { e.preventDefault(); go(prevLoc.b, prevLoc.c, prevLoc.v); } }
      else if (e.key === 'ArrowRight') { if (nextLoc) { e.preventDefault(); go(nextLoc.b, nextLoc.c, nextLoc.v); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevLoc, nextLoc, go]);

  // ── swipe nav (mobile) — same thresholds as Reader/Parallel ────────────────
  const touch = useRef(null);
  const onTouchStart = e => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = e => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      const dest = dx < 0 ? nextLoc : prevLoc;
      if (dest) go(dest.b, dest.c, dest.v);
    }
  };

  // ── "Isaiah 33:22" as one copyable unit ─────────────────────────────────
  // .rd-book-name and .vp-heading are two separate block-level elements (kept
  // that way so the visual style below is untouched) — a normal double/
  // triple-click only ever grabs whichever one you clicked, since the
  // browser treats each block as its own paragraph for selection. Rather
  // than fight that, this uses the SAME click-to-copy mechanism the word
  // tokens elsewhere in the app already use (see WordBlock.jsx's
  // w-translit): one click copies the plain string, a ".copied" class
  // flashes the familiar "Copied!" tooltip via .clickable-comp's own CSS.
  const handleRefCopy = e => {
    if (!addressValid) return;
    try {
      navigator.clipboard.writeText(`${bookName} ${chapter}:${verse}`);
      e.currentTarget.classList.add('copied');
      setTimeout(() => e.currentTarget.classList.remove('copied'), 1500);
    } catch (err) { /* ignore */ }
  };

  const wordItems = (verseData?.tokens || []).filter(t => t && t.word_raw);
  const chapterHref = addressValid ? `/bible?book=${bookToParam(bookId, idToSlug)}&chapter=${chapter}&verse=${verse}` : '/bible';
  // ── links out to the rest of the app for THIS verse ─────────────────────
  // "individual verses need to have links to the rest of the app" — Reader's
  // own switch menu already sends `?book=&chapter=&verse=` to these same
  // three destinations (see readers[] in Reader.jsx), so reusing that query
  // shape here lands each one on this exact verse, not just the chapter.
  // /?... (no source param) is Reader's own "Paleo Reader" entry — App.jsx's
  // RootDispatcher defaults an unset `source` to 'hebrew', so this is the
  // same HebrewViewer destination the rest of the app calls "Hebrew".
  const locQuery = addressValid ? `book=${bookToParam(bookId, idToSlug)}&chapter=${chapter}&verse=${verse}` : '';
  const parallelPath = addressValid ? parallelHref(bookId, idToSlug, chapter, verse) : '/parallel';
  const hebrewHref = addressValid ? `/?${locQuery}` : '/';
  const translateHref = addressValid ? `/translate?${locQuery}` : '/translate';

  return (
    <div className="reader-root vp-root" data-typeface={typeface} style={{ '--pr-reading': typefaceStack }}>
      <header className="rd-bar">
        <Link to="/landing" className="rd-bar-btn rd-home" title="Home" aria-label="Home">𐤀𐤁</Link>
        <div className="rd-ref vp-ref-static">
          <span className="rd-ref-txt">{addressValid ? verseRef : 'Verse'}</span>
        </div>
        <Link className="rd-bar-btn vp-chapter-link" to={chapterHref} title="Open this chapter as flowing text">
          <BookIcon />
        </Link>
      </header>

      <main className="rd-scroll" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <article className="rd-page vp-page">
          {!resolved ? (
            <div className="rd-state">Loading…</div>
          ) : !addressValid ? (
            <div className="rd-state">
              <p className="rd-state-title">That verse address isn't recognized.</p>
              <p className="rd-state-sub">Check the book, chapter and verse in the URL — e.g. /genesis/1/1.</p>
            </div>
          ) : loading ? (
            <div className="rd-state">Loading {verseRef}…</div>
          ) : !verseData || !verseData.text ? (
            <div className="rd-state">
              <p className="rd-state-title">{verseRef} doesn't have English text yet.</p>
              <Link className="rd-state-link" to={chapterHref}>Open the chapter in the Reader →</Link>
            </div>
          ) : (
            <div className="vp-verse">
              <div
                className="vp-ref-block clickable-comp"
                onClick={handleRefCopy}
                title="Click to copy"
              >
                <div className="rd-book-name">{bookName}</div>
                <h1 className="vp-heading">{chapter}:{verse}</h1>
              </div>
              {hebrewWords.length > 0 && (
                <div className="vp-text-mode-toggle" role="tablist">
                  <button
                    className={`vp-text-mode-btn ${textMode === 'english' ? 'active' : ''}`}
                    onClick={() => setTextMode('english')}
                    role="tab" aria-selected={textMode === 'english'}
                  >English</button>
                  <button
                    className={`vp-text-mode-btn ${textMode === 'hebrew' ? 'active' : ''}`}
                    onClick={() => setTextMode('hebrew')}
                    role="tab" aria-selected={textMode === 'hebrew'}
                  >Hebrew</button>
                </div>
              )}
              <p className="vp-text">
                {showHebrewText
                  ? <span className="vp-text-hebrew" dangerouslySetInnerHTML={{ __html: paleoSentenceHtml }} />
                  : renderVerseNodesWithQuotes(sanitizeText(verseData.text), 'both')}
              </p>
              {hebrewWords.length > 0 ? (
                <>
                  <h2 className="vp-subhead">Word by word</h2>
                  <div className="vp-wordtable-wrap">
                    <table className="vp-wordtable">
                      <thead>
                        <tr>
                          <th>Word</th>
                          <th>Root</th>
                          <th>Transliteration</th>
                          <th>Definition</th>
                          <th>Modifications</th>
                          <th>Strong's #</th>
                          <th>Root first appearance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hebrewWords.map((w, i) => {
                          const parts = computeWordParts(w);
                          // Keep in sync with the lookup-batching effect above:
                          // must use the same canonical trueRoot key that was
                          // requested, or this row's lookupKey never matches
                          // what firstOcc was actually populated with.
                          const rootPaleo = parts.rootTrans[0]?.trueRoot || parts.rootTrans[0]?.paleo || parts.purePaleo || null;
                          return (
                            <WordRow key={i} wordObj={w}>
                              <td className="wr-cell wr-first" data-label="Root first appearance">{renderFirstHit(rootPaleo && `root:${rootPaleo}`)}</td>
                            </WordRow>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="vp-paleo-wrap">
                    <button
                      className={`vp-paleo-toggle ${rawTextOpen ? 'open' : ''}`}
                      onClick={() => setRawTextOpen(o => !o)}
                    >{ } raw transliteration text</button>
                    {rawTextOpen && (
                      <textarea
                        className="vp-paleo-sentence"
                        value={paleoSentence}
                        readOnly
                        spellCheck={false}
                      />
                    )}
                  </div>
                </>
              ) : wordItems.length > 0 && (
                <>
                  <h2 className="vp-subhead">Word by word</h2>
                  <ul className="vp-words">
                    {wordItems.map((t, i) => (
                      <li key={i} className="vp-word">
                        <span className="vp-word-raw">{t.word_raw}</span>
                        {t.strongs && (
                          <Link className="vp-word-strongs" to={`/roots?sn=${encodeURIComponent(t.strongs)}`}>
                            {t.strongs}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {/* "lets get the links out of view of the vers info though, lets
                  put them at the bottom after the word by word table" — was
                  right under vp-text; moved below the breakdown table so the
                  verse + its word-by-word data reads as one block before any
                  "go elsewhere" affordance. */}
              <nav className="vp-views" aria-label={`Open ${verseRef} in`}>
                <Link className="vp-view-link" to={parallelPath}>Parallel</Link>
                <Link className="vp-view-link" to={hebrewHref}>Hebrew</Link>
                <Link className="vp-view-link" to={translateHref}>Translation Studio</Link>
              </nav>
            </div>
          )}
        </article>
      </main>

      {resolved && (
        <nav className="rd-foot" aria-label="Verse navigation">
          <button className="rd-foot-btn" disabled={!prevLoc}
                  onClick={() => prevLoc && go(prevLoc.b, prevLoc.c, prevLoc.v)}>‹ Previous verse</button>
          <button className="rd-foot-ref" onClick={() => addressValid && navigate(chapterHref)}>
            {addressValid ? `${bookName} ${chapter}:${verse}` : 'Verse'}
          </button>
          <button className="rd-foot-btn" disabled={!nextLoc}
                  onClick={() => nextLoc && go(nextLoc.b, nextLoc.c, nextLoc.v)}>Next verse ›</button>
        </nav>
      )}
    </div>
  );
}
