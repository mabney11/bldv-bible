import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BOOK_NAMES } from '../lib/books.js';
import { PALEO_KBD_ROWS } from '../lib/keyboards.js';
import { apiSearch } from '../lib/api.js';
import '../components/SearchUI.css';

// ─────────────────────────────────────────────────────────────────────────────
// /search — standalone results page.
//
// Why this exists: the old search UI rendered results inline inside
// HebrewViewer's collapsible panel. Clicking a hit navigated away from that
// panel entirely (to the verse), so the browser back button landed you back
// on a bare reader with no results — the search was gone. Query + mode now
// live in the URL (?q=&mode=), so:
//   - the back button returns to this exact page with the exact same results
//   - a search is a shareable/bookmarkable link
//   - re-running the same query (e.g. via back/forward) doesn't re-hit the
//     server — see `resultCache` below.
//
// Scope note: this is Phase 1 — Hebrew paleo search only, matching what the
// old inline panel did. Multi-source toggles (Greek/Latin/Ge'ez/Syriac/
// Coptic via the existing /api/concordance/* endpoints), multi-script
// keyboards, and transliteration input are follow-up phases; the layout
// here (source toggle row placeholder, keyboard-tabs shape in keyboards.js)
// is built so those slot in without another rewrite.
// ─────────────────────────────────────────────────────────────────────────────

// Module-scoped, not component state — survives this component unmounting
// (e.g. navigating to a verse and back) for the life of the tab. Keyed on
// the exact query the server saw, so back/forward through several different
// searches doesn't refetch any of them.
const resultCache = new Map();
const cacheKey = (mode, q) => `${mode}::${q}`;

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlQ    = searchParams.get('q') || '';
  const urlMode = searchParams.get('mode') === 'chrono' ? 'chrono' : 'exact';

  // Composer state — separate from the URL so typing doesn't navigate on
  // every keystroke. Re-synced from the URL when it changes out from under
  // us (back/forward button).
  const [qInput, setQInput] = useState(urlQ);
  const [mode, setMode] = useState(urlMode);
  useEffect(() => { setQInput(urlQ); setMode(urlMode); }, [urlQ, urlMode]);

  const [data, setData] = useState(() => resultCache.get(cacheKey(urlMode, urlQ)) || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const inputRef = useRef(null);

  // Fetch (or reuse from cache) whenever the URL's q/mode changes.
  useEffect(() => {
    if (!urlQ) { setData(null); setErr(null); return; }
    const key = cacheKey(urlMode, urlQ);
    const cached = resultCache.get(key);
    if (cached) { setData(cached); setErr(null); return; }
    let cancelled = false;
    setBusy(true); setErr(null);
    apiSearch(urlQ, 0, urlMode)
      .then(d => {
        if (cancelled) return;
        resultCache.set(key, d);
        setData(d);
      })
      .catch(e => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [urlQ, urlMode]);

  const loadMore = useCallback(async () => {
    if (!data?.hasMore || busy) return;
    const nextOffset = data.results.length;
    setBusy(true);
    try {
      const more = await apiSearch(urlQ, nextOffset, urlMode);
      const merged = { ...more, results: [...data.results, ...more.results] };
      resultCache.set(cacheKey(urlMode, urlQ), merged);
      setData(merged);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }, [data, urlQ, urlMode, busy]);

  const runSearch = () => {
    const query = qInput.trim();
    if (!query) return;
    // Pushes a new history entry — this is what makes "back" step through
    // previous searches instead of just re-rendering the same page.
    setSearchParams({ q: query, mode });
  };

  const appendChar = ch => { setQInput(prev => prev + ch); inputRef.current?.focus(); };
  const backspace = () => setQInput(prev => [...prev].slice(0, -1).join(''));

  const goToVerse = r => {
    const p = new URLSearchParams({ book: String(r.book_id), chapter: String(r.chapter) });
    p.set('verse', String(r.verse));
    if (urlQ) p.set('hl', urlQ);   // highlight the matched term on arrival
    navigate(`/?${p}`);
  };

  return (
    <div className="search-page">
      <div className="search-page-topbar">
        <Link to="/landing" className="logo-btn">𐤀𐤁</Link>
        <span className="search-page-title">Search</span>
      </div>

      <div className="search-page-body">
        <section className="hv-search-section" aria-label="Search">
          <div className="hv-search-top">
            <input
              ref={inputRef}
              type="text"
              value={qInput}
              onChange={e => setQInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
              placeholder="𐤀𐤁𐤂 type or click letters below…"
              autoComplete="off"
              aria-label="Paleo Hebrew search query"
            />
            <button className="hv-search-clear" onClick={() => setQInput('')} title="Clear" aria-label="Clear">✕</button>
            <button className="hv-search-btn" onClick={runSearch} disabled={busy}>Search</button>
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
              onClick={() => { setMode('exact'); setSearchParams(qInput.trim() ? { q: qInput.trim(), mode: 'exact' } : {}); }}
              role="tab" aria-selected={mode === 'exact'}
            >Exact / Ranked</button>
            <button
              className={`mode-btn ${mode === 'chrono' ? 'active' : ''}`}
              onClick={() => { setMode('chrono'); setSearchParams(qInput.trim() ? { q: qInput.trim(), mode: 'chrono' } : {}); }}
              role="tab" aria-selected={mode === 'chrono'}
            >Chronological</button>
          </div>
        </section>

        {err && <div className="hv-search-err">⚠ {err}</div>}

        {!urlQ && !err && (
          <div className="search-page-empty">Type or click a paleo word above, then hit Search.</div>
        )}

        {urlQ && data && (
          <div className="hv-search-results">
            <div className="hv-results-count">
              {(data.total ?? data.results.length) === 0
                ? `No results for "${urlQ}"`
                : `${data.total || data.results.length} verses — showing 1–${data.results.length} for "${urlQ}"${urlMode === 'chrono' ? ' · chronological' : ' · ranked'}`}
            </div>
            {data.results.map((r, i) => (
              <a
                key={i}
                className="hv-result-item"
                href={`/?book=${r.book_id}&chapter=${r.chapter}&verse=${r.verse}`}
                onClick={e => { e.preventDefault(); goToVerse(r); }}
              >
                <span className="hv-result-ref">{BOOK_NAMES[r.book_id] || `Book ${r.book_id}`} {r.chapter}:{r.verse}</span>
              </a>
            ))}
            {data.hasMore && (
              <button className="hv-load-more-btn" onClick={loadMore} disabled={busy}>
                {busy ? 'Loading…' : 'Load more…'}
              </button>
            )}
          </div>
        )}

        {urlQ && busy && !data && (
          <div className="search-page-empty">Searching…</div>
        )}
      </div>
    </div>
  );
}
