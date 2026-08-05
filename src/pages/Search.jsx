import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BOOK_NAMES } from '../lib/books.js';
import { SCRIPTS, getScript } from '../lib/keyboards.js';
import { apiSearch, apiConcordanceSurface } from '../lib/api.js';
import '../components/SearchUI.css';

// ─────────────────────────────────────────────────────────────────────────────
// /search — standalone, multi-script, multi-source results page.
//
// URL is the single source of truth: ?script=&q=&mode=&src=
//   script  — which keyboard/alphabet is active (paleo, geez, syriac, greek,
//             latin, coptic — see keyboards.js). Determines which corpora
//             are even searchable, since a query typed in one script is a
//             different string than the same word in another script.
//   q       — the query, in that script's native characters.
//   mode    — exact|chrono, only meaningful for the Paleo/BHS engine (the
//             other engines are always exact-surface-match).
//   src     — comma list of enabled corpus codes for the active script.
//             Omitted = every source for that script is on (the default).
//
// Because all of that lives in the URL, the back button steps through
// actual search history (including toggle/script changes that used push
// navigation), and every search is a shareable link.
//
// Two search engines feed this page (see keyboards.js for why):
//   'legacy'      /api/search — ranked/substring/chronological, Hebrew
//                 paleo (BHS) only. Existing Phase-1 behavior, unchanged.
//   'concordance' /api/concordance/surface — exact normalized surface-form
//                 match, already spans Greek (LXX+GNT+GRC pooled), Latin,
//                 Ge'ez, Syriac, Coptic, and the Hebrew "extra" edition.
//                 This backend already existed; this page is what wires a
//                 UI to it. One fetch per script is enough even when a
//                 script pools multiple corpora (Greek) — the corpus
//                 toggles below just filter which of the *already fetched*
//                 occurrences are shown, so flipping a toggle never
//                 re-hits the server.
// ─────────────────────────────────────────────────────────────────────────────

const CONC_LIMIT = 500; // server's hard cap (see /api/concordance/surface)

// Module-scoped caches — survive this component unmounting (e.g. navigating
// to a verse and back) for the life of the tab.
const legacyCache = new Map();       // key: `${mode}::${q}`            -> /api/search response
const concCache   = new Map();       // key: `${anchorCorpus}::${q}`    -> /api/concordance/surface response
const lkey = (mode, q) => `${mode}::${q}`;
const ckey = (corpus, q) => `${corpus}::${q}`;

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlScript = getScript(searchParams.get('script') || 'paleo').id;
  const scriptDef = getScript(urlScript);
  const urlQ      = searchParams.get('q') || '';
  const urlMode   = searchParams.get('mode') === 'chrono' ? 'chrono' : 'exact';
  const urlSrcRaw = searchParams.get('src');
  const enabledCorpora = useMemo(() => (
    urlSrcRaw ? new Set(urlSrcRaw.split(',').filter(Boolean)) : new Set(scriptDef.sources.map(s => s.corpus))
  ), [urlSrcRaw, scriptDef]);

  // Composer state — separate from the URL so typing doesn't navigate on
  // every keystroke; re-synced when the URL changes out from under us
  // (back/forward, or switching script tabs).
  const [qInput, setQInput] = useState(urlQ);
  const [mode, setMode] = useState(urlMode);
  useEffect(() => { setQInput(urlQ); setMode(urlMode); }, [urlQ, urlMode, urlScript]);
  const inputRef = useRef(null);

  const legacySource = scriptDef.sources.find(s => s.engine === 'legacy');
  const concSources   = scriptDef.sources.filter(s => s.engine === 'concordance');
  const concAnchor    = concSources[0]?.corpus || null; // any member resolves the whole pooled group server-side

  // ── Legacy (BHS) fetch ─────────────────────────────────────────────────
  const [legacyData, setLegacyData] = useState(() => legacyCache.get(lkey(urlMode, urlQ)) || null);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyErr, setLegacyErr]   = useState(null);
  const legacyActive = !!legacySource && enabledCorpora.has(legacySource.corpus) && !!urlQ;

  useEffect(() => {
    if (!legacyActive) { setLegacyData(null); return; }
    const key = lkey(urlMode, urlQ);
    const cached = legacyCache.get(key);
    if (cached) { setLegacyData(cached); setLegacyErr(null); return; }
    let cancelled = false;
    setLegacyBusy(true); setLegacyErr(null);
    apiSearch(urlQ, 0, urlMode)
      .then(d => { if (!cancelled) { legacyCache.set(key, d); setLegacyData(d); } })
      .catch(e => { if (!cancelled) setLegacyErr(e.message); })
      .finally(() => { if (!cancelled) setLegacyBusy(false); });
    return () => { cancelled = true; };
  }, [legacyActive, urlQ, urlMode]);

  const loadMoreLegacy = useCallback(async () => {
    if (!legacyData?.hasMore || legacyBusy) return;
    setLegacyBusy(true);
    try {
      const more = await apiSearch(urlQ, legacyData.results.length, urlMode);
      const merged = { ...more, results: [...legacyData.results, ...more.results] };
      legacyCache.set(lkey(urlMode, urlQ), merged);
      setLegacyData(merged);
    } catch (e) { setLegacyErr(e.message); }
    finally { setLegacyBusy(false); }
  }, [legacyData, legacyBusy, urlQ, urlMode]);

  // ── Concordance fetch (one call covers the whole pooled group) ─────────
  const [concData, setConcData] = useState(() => concAnchor ? concCache.get(ckey(concAnchor, urlQ)) || null : null);
  const [concBusy, setConcBusy] = useState(false);
  const [concErr, setConcErr]   = useState(null);
  // Gate on at least one concordance source being toggled on — otherwise a
  // script whose only concordance source was switched off would still fire
  // a fetch just to filter every result back out client-side.
  const concActive = !!concAnchor && !!urlQ && concSources.some(s => enabledCorpora.has(s.corpus));

  useEffect(() => {
    if (!concActive) { setConcData(null); return; }
    const key = ckey(concAnchor, urlQ);
    const cached = concCache.get(key);
    if (cached) { setConcData(cached); setConcErr(null); return; }
    let cancelled = false;
    setConcBusy(true); setConcErr(null);
    apiConcordanceSurface(concAnchor, urlQ, CONC_LIMIT)
      .then(d => { if (!cancelled) { concCache.set(key, d); setConcData(d); } })
      .catch(e => { if (!cancelled) setConcErr(e.message); })
      .finally(() => { if (!cancelled) setConcBusy(false); });
    return () => { cancelled = true; };
  }, [concActive, concAnchor, urlQ]);

  // Client-side filter by toggle state — never triggers a refetch.
  const concOccurrences = useMemo(() => {
    if (!concData) return [];
    return concData.occurrences.filter(o => enabledCorpora.has(o.corpus));
  }, [concData, enabledCorpora]);
  const concShownTotal = useMemo(() => {
    if (!concData) return 0;
    return (concData.by_corpus || []).filter(b => enabledCorpora.has(b.corpus)).reduce((s, b) => s + b.n, 0);
  }, [concData, enabledCorpora]);

  // ── Actions ──────────────────────────────────────────────────────────
  const runSearch = () => {
    const query = qInput.trim();
    if (!query) return;
    const p = { script: urlScript, q: query, mode };
    if (urlSrcRaw) p.src = urlSrcRaw;
    setSearchParams(p);   // pushes a new history entry — this is "back steps through searches"
  };

  const switchScript = id => {
    if (id === urlScript) return;
    setQInput('');
    setSearchParams({ script: id });
  };

  const toggleSource = corpus => {
    const next = new Set(enabledCorpora);
    next.has(corpus) ? next.delete(corpus) : next.add(corpus);
    const all = scriptDef.sources.every(s => next.has(s.corpus));
    const p = { script: urlScript };
    if (urlQ) { p.q = urlQ; p.mode = mode; }
    if (!all) p.src = [...next].join(',');
    setSearchParams(p, { replace: true });   // filtering, not navigating — don't spam history
  };

  const appendChar = ch => { setQInput(prev => prev + ch); inputRef.current?.focus(); };
  const backspace  = () => setQInput(prev => [...prev].slice(0, -1).join(''));

  const goToLegacyHit = (r, sourceParam) => {
    const p = new URLSearchParams({ book: String(r.book_id), chapter: String(r.chapter), verse: String(r.verse) });
    if (sourceParam) p.set('source', sourceParam);
    if (urlQ) p.set('hl', urlQ);
    navigate(`/?${p}`);
  };
  const concHitHref = o => {
    const p = new URLSearchParams({ source: o.source, chapter: String(o.ch) });
    if (o.book_id != null) p.set('book', String(o.book_id));
    else if (o.doc_id) p.set('doc', o.doc_id);
    if (o.v != null) p.set('verse', String(o.v));
    return `/?${p}`;
  };
  const goToConcHit = o => navigate(concHitHref(o));

  const busy = legacyBusy || concBusy;
  const anyErr = legacyErr || concErr;
  const hasAnyData = (legacyActive && legacyData) || (concActive && concData);

  return (
    <div className="search-page">
      <div className="search-page-topbar">
        <Link to="/landing" className="logo-btn">𐤀𐤁</Link>
        <span className="search-page-title">Search</span>
      </div>

      <div className="search-page-body">
        {/* Script tabs */}
        <div className="search-script-tabs" role="tablist">
          {SCRIPTS.map(s => (
            <button
              key={s.id}
              className={`search-script-tab ${s.id === urlScript ? 'active' : ''}`}
              onClick={() => switchScript(s.id)}
              role="tab" aria-selected={s.id === urlScript}
            >{s.label}</button>
          ))}
        </div>

        <section className="hv-search-section" aria-label="Search">
          <div className="hv-search-top">
            <input
              ref={inputRef}
              type="text"
              value={qInput}
              dir={scriptDef.dir}
              style={{ direction: scriptDef.dir, fontFamily: scriptDef.id === 'paleo' ? undefined : 'inherit' }}
              onChange={e => setQInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
              placeholder={`type, paste, or click letters below…`}
              autoComplete="off"
              aria-label={`${scriptDef.label} search query`}
            />
            <button className="hv-search-clear" onClick={() => setQInput('')} title="Clear" aria-label="Clear">✕</button>
            <button className="hv-search-btn" onClick={runSearch} disabled={busy}>Search</button>
          </div>

          <div className="hv-paleo-kbd-wrap">
            <button className="hv-paleo-kbd-delete" onClick={backspace} aria-label="Backspace">⌦</button>
            <div className="hv-paleo-kbd" style={{ direction: scriptDef.dir }}>
              {scriptDef.rows.map((row, ri) => (
                <div className="hv-kbd-row" key={ri} style={{ direction: scriptDef.dir }}>
                  {row.map(ch => (
                    <button
                      key={ch}
                      className="hv-kbd-key"
                      style={scriptDef.id === 'paleo' ? undefined : { fontFamily: 'inherit' }}
                      onClick={() => appendChar(ch)}
                    >{ch}</button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {legacySource && (
            <div className="hv-search-mode-toggle" role="tablist">
              <button
                className={`mode-btn ${mode === 'exact' ? 'active' : ''}`}
                onClick={() => { setMode('exact'); if (qInput.trim()) setSearchParams({ script: urlScript, q: qInput.trim(), mode: 'exact', ...(urlSrcRaw ? { src: urlSrcRaw } : {}) }); }}
                role="tab" aria-selected={mode === 'exact'}
              >Exact / Ranked</button>
              <button
                className={`mode-btn ${mode === 'chrono' ? 'active' : ''}`}
                onClick={() => { setMode('chrono'); if (qInput.trim()) setSearchParams({ script: urlScript, q: qInput.trim(), mode: 'chrono', ...(urlSrcRaw ? { src: urlSrcRaw } : {}) }); }}
                role="tab" aria-selected={mode === 'chrono'}
              >Chronological</button>
            </div>
          )}

          {scriptDef.sources.length > 1 && (
            <div className="search-source-toggles">
              {scriptDef.sources.map(s => (
                <button
                  key={s.corpus}
                  className={`search-src-chip ${enabledCorpora.has(s.corpus) ? 'active' : ''}`}
                  onClick={() => toggleSource(s.corpus)}
                  aria-pressed={enabledCorpora.has(s.corpus)}
                >{s.label}</button>
              ))}
            </div>
          )}
        </section>

        {anyErr && <div className="hv-search-err">⚠ {anyErr}</div>}

        {!urlQ && !anyErr && (
          <div className="search-page-empty">Type, paste, or click a {scriptDef.label} word above, then hit Search.</div>
        )}

        {urlQ && busy && !hasAnyData && <div className="search-page-empty">Searching…</div>}

        {/* Legacy (BHS) results block */}
        {legacyActive && legacyData && (
          <div className="hv-search-results">
            <div className="hv-results-count">
              {legacySource.label}: {(legacyData.total ?? legacyData.results.length) === 0
                ? `no results for "${urlQ}"`
                : `${legacyData.total || legacyData.results.length} verses${urlMode === 'chrono' ? ' · chronological' : ' · ranked'}`}
            </div>
            {legacyData.results.map((r, i) => (
              <a
                key={i}
                className="hv-result-item"
                href={`/?book=${r.book_id}&chapter=${r.chapter}&verse=${r.verse}`}
                onClick={e => { e.preventDefault(); goToLegacyHit(r); }}
              >
                <span className="hv-result-ref">{BOOK_NAMES[r.book_id] || `Book ${r.book_id}`} {r.chapter}:{r.verse}</span>
              </a>
            ))}
            {legacyData.hasMore && (
              <button className="hv-load-more-btn" onClick={loadMoreLegacy} disabled={legacyBusy}>
                {legacyBusy ? 'Loading…' : 'Load more…'}
              </button>
            )}
          </div>
        )}

        {/* Concordance (exact-match, possibly pooled) results block */}
        {concActive && concData && (
          <div className="hv-search-results">
            <div className="hv-results-count">
              {concSources.length > 1 ? 'Greek' : concSources[0]?.label}: {concShownTotal === 0
                ? (concData.count > 0
                    ? `0 shown — every match is in a source toggled off above`
                    : `no results for "${urlQ}"`)
                : `${concShownTotal.toLocaleString()} occurrence${concShownTotal !== 1 ? 's' : ''}${concData.count > CONC_LIMIT ? ` (showing first ${CONC_LIMIT})` : ''}`}
            </div>
            {concOccurrences.map((o, i) => (
              <a
                key={`${o.corpus}-${o.code || o.canon_id}-${o.ch}-${o.v}-${i}`}
                className="hv-result-item"
                href={concHitHref(o)}
                onClick={e => { e.preventDefault(); goToConcHit(o); }}
              >
                <span className="hv-result-ref">
                  {o.title || BOOK_NAMES[o.canon_id] || o.code} {o.ch}:{o.v}
                </span>
                {concSources.length > 1 && <span className="hv-result-badge">{o.corpus}</span>}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
