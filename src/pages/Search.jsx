import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BOOK_NAMES } from '../lib/books.js';
import { SCRIPTS, getScript } from '../lib/keyboards.js';
import detectScriptRaw from '../lib/scripts.js';
import { transliterate } from '../lib/translit.js';
import { apiSearch, apiConcordanceSurface, apiSurfaceList, apiSurfaceExplorerVerses, apiRootVerses } from '../lib/api.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import '../components/SearchUI.css';

// ─────────────────────────────────────────────────────────────────────────────
// /search — ONE box. Paste or type in any script, hit Search, and this page
// figures out what you gave it and where to look — no script picker to get
// right first. The script buttons below the box are purely an input aid
// (an on-screen keyboard for scripts you can't type natively) — they insert
// characters into the same box and never restrict what gets searched.
//
// How detection works: the submitted query's dominant Unicode script decides
// which engine(s) run (see detectQueryScript below). A Latin-alphabet query
// with no native script in it runs two things at once, since it's ambiguous
// which the user meant: 1) an actual Latin (Vulgate) search, and 2) a
// transliteration lookup against the Hebrew paleo corpus — typing "Yabanaal"
// finds the verse even though the corpus itself is stored as paleo glyphs,
// by transliterating every known surface form once (client-side, cached for
// the session) and matching against that.
//
// URL: ?q=&mode=&src=
//   q     — the query, whatever script it's in.
//   mode  — exact|chrono, only used when the detected script is Paleo (BHS).
//   src   — comma list of enabled corpus codes for the detected script's
//           sources. Omitted = all on. Recomputed against whichever script
//           gets detected for the current q, so it never dangles.
// ─────────────────────────────────────────────────────────────────────────────

const CONC_LIMIT = 500;          // server's hard cap on /api/concordance/surface
const SURFACE_PAGE = 50000;      // server's hard cap on /api/surface-explorer/list
const TRANSLIT_FANOUT = 8;       // cap how many EXACT-match surfaces one lookup expands to
const ROOT_FANOUT = 3;           // cap how many distinct roots (Strong's #s) get expanded
const ROOT_VERSE_LIMIT = 50;     // cap verses pulled per expanded root

// Phoenician/Paleo isn't in scripts.js's detectScript (same special-case
// translit.js needs) — catch it first, then defer to the shared detector.
const SCRIPT_ID_MAP = { ethiopic: 'geez', syriac: 'syriac', greek: 'greek', coptic: 'coptic', latin: 'latin' };
function detectQueryScript(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (/[\u{10900}-\u{1091F}]/u.test(s)) return 'paleo';
  const { script } = detectScriptRaw(s);
  // Scripts we don't have a search engine for yet (square Hebrew, Arabic,
  // Cyrillic, Armenian, Georgian, ...) fall back to the Latin path, which is
  // harmless — the concordance LAT search and the translit lookup will both
  // just come back empty rather than erroring.
  return SCRIPT_ID_MAP[script] || 'latin';
}
const isRtlScript = id => id === 'paleo' || id === 'syriac';

// ── Module-scoped caches — survive this component unmounting, live for the
// tab's lifetime. Toggling source chips re-filters these, never refetches.
const legacyCache = new Map();   // `${mode}::${q}`         -> /api/search response
const concCache   = new Map();   // `${anchorCorpus}::${q}` -> /api/concordance/surface response
const translitCache = new Map(); // lowercased q            -> { matches, rows }
let surfaceListPromise = null;   // the full BHS+HEB surface index, fetched once
let translitIndexPromise = null; // Map<lowercaseTranslit, surfaceEntry[]>, built once

async function fetchAllSurfaces() {
  if (surfaceListPromise) return surfaceListPromise;
  surfaceListPromise = (async () => {
    let all = [];
    let offset = 0;
    for (;;) {
      const d = await apiSurfaceList({ offset, limit: SURFACE_PAGE });
      all = all.concat(d.surfaces || []);
      if (!d.surfaces?.length || all.length >= d.total) break;
      offset = all.length;
    }
    return all;
  })();
  return surfaceListPromise;
}
async function getTranslitIndex() {
  if (translitIndexPromise) return translitIndexPromise;
  translitIndexPromise = (async () => {
    const surfaces = await fetchAllSurfaces();
    const idx = new Map();
    for (const s of surfaces) {
      const t = transliterate(s.surface, { script: 'paleo-hebrew', capitalize: false });
      if (!t) continue;
      if (!idx.has(t)) idx.set(t, []);
      idx.get(t).push(s);
    }
    return idx;
  })();
  return translitIndexPromise;
}
// Exact-transliteration match only finds the ONE literal spelling a user
// typed — it won't find that same word with a proclitic prefix folded on
// (e.g. "yabanaal" won't find "WaYabanaal", the same word plus "and"), and
// it won't cross from an OT (BHS) spelling to an unrelated-looking NT (HEB)
// spelling of the same root. The Root Explorer (/roots?sn=) already solves
// both of those — it groups every surface form + every corpus by Strong's
// number. So: use the exact match(es) to find WHICH root(s) the query means,
// then pull each root's full verse list the same way /roots does, and merge
// that in behind the exact hits (which still keep their precise highlight
// word). This is what makes "yabanaal" surface Joshua 19:33's "WaYabanaal"
// too, not just Joshua 15:11's bare form.
async function runTranslitLookup(query) {
  const key = query.toLowerCase();
  if (translitCache.has(key)) return translitCache.get(key);
  const idx = await getTranslitIndex();
  const matched = (idx.get(key) || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0));
  const top = matched.slice(0, TRANSLIT_FANOUT);
  const pages = await Promise.all(
    top.map(m => apiSurfaceExplorerVerses({ word: m.surface, limit: 50 }).catch(() => ({ verses: [] })))
  );
  const rows = [];
  const seenVerse = new Set(); // `${book_id}:${chapter}:${verse}` — dedupe against root expansion below
  top.forEach((m, i) => {
    for (const v of (pages[i].verses || [])) {
      seenVerse.add(`${v.book_id}:${v.chapter}:${v.verse}`);
      rows.push({ ...v, matchedSurface: m.surface, matchedStrongs: m.strongs });
    }
  });

  // Expand to the full root for each distinct Strong's # the exact match(es)
  // resolved to — same data the Root Explorer page shows, so it picks up
  // prefixed/inflected forms and any other-corpus (e.g. NT) reuse of the root.
  const roots = [...new Set(top.map(m => m.strongs).filter(Boolean))].slice(0, ROOT_FANOUT);
  let rootExpanded = false;
  if (roots.length) {
    rootExpanded = true;
    const rootPages = await Promise.all(
      roots.map(sn => apiRootVerses({ sn, limit: ROOT_VERSE_LIMIT }).catch(() => ({ verses: [] })))
    );
    roots.forEach((sn, i) => {
      for (const v of (rootPages[i].verses || [])) {
        const vk = `${v.book_id}:${v.chapter}:${v.verse}`;
        if (seenVerse.has(vk)) continue; // already have this verse via an exact-surface hit above
        seenVerse.add(vk);
        // No single precise highlight word for a root-expansion hit (the
        // verse's actual surface may differ from what was typed) — badge
        // shows the Strong's # instead, and the link skips &hl=.
        rows.push({ ...v, matchedSurface: null, matchedStrongs: sn });
      }
    });
  }
  rows.sort((a, b) => a.book_id - b.book_id || a.chapter - b.chapter || a.verse - b.verse);

  const truncated = matched.length > top.length;
  const result = { matchCount: matched.length, rootExpanded, truncated, rows };
  translitCache.set(key, result);
  return result;
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlQ      = searchParams.get('q') || '';
  const urlMode   = searchParams.get('mode') === 'chrono' ? 'chrono' : 'exact';
  const urlSrcRaw = searchParams.get('src');

  usePageTitle(pageTitle(urlQ ? `“${urlQ}” search` : 'Search'));

  const detectedId = useMemo(() => detectQueryScript(urlQ), [urlQ]);
  const scriptDef   = detectedId ? getScript(detectedId) : null;
  const enabledCorpora = useMemo(() => {
    if (!scriptDef) return new Set();
    return urlSrcRaw ? new Set(urlSrcRaw.split(',').filter(Boolean)) : new Set(scriptDef.sources.map(s => s.corpus));
  }, [urlSrcRaw, scriptDef]);

  // Composer state, separate from the URL so typing doesn't navigate.
  const [qInput, setQInput] = useState(urlQ);
  const [mode, setMode] = useState(urlMode);
  useEffect(() => { setQInput(urlQ); setMode(urlMode); }, [urlQ, urlMode]);
  const inputRef = useRef(null);
  const typedScript = useMemo(() => detectQueryScript(qInput), [qInput]);   // live, for RTL + the "typing in" hint

  // On-screen keyboard: purely a manual input aid, independent of search/
  // detection. Closed by default; clicking a script button opens its grid.
  const [kbdOpen, setKbdOpen] = useState(null);

  const legacySource = scriptDef?.sources.find(s => s.engine === 'legacy') || null;
  const concSources   = scriptDef?.sources.filter(s => s.engine === 'concordance') || [];
  const concAnchor    = concSources[0]?.corpus || null;

  // ── Legacy (BHS) ─────────────────────────────────────────────────────
  const [legacyData, setLegacyData] = useState(() => legacyCache.get(`${urlMode}::${urlQ}`) || null);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyErr, setLegacyErr]   = useState(null);
  const legacyActive = !!legacySource && enabledCorpora.has(legacySource.corpus) && !!urlQ;

  useEffect(() => {
    if (!legacyActive) { setLegacyData(null); return; }
    const key = `${urlMode}::${urlQ}`;
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
      legacyCache.set(`${urlMode}::${urlQ}`, merged);
      setLegacyData(merged);
    } catch (e) { setLegacyErr(e.message); }
    finally { setLegacyBusy(false); }
  }, [legacyData, legacyBusy, urlQ, urlMode]);

  // ── Concordance (exact match, possibly pooled) ──────────────────────
  const [concData, setConcData] = useState(() => concAnchor ? concCache.get(`${concAnchor}::${urlQ}`) || null : null);
  const [concBusy, setConcBusy] = useState(false);
  const [concErr, setConcErr]   = useState(null);
  const concActive = !!concAnchor && !!urlQ && concSources.some(s => enabledCorpora.has(s.corpus));

  useEffect(() => {
    if (!concActive) { setConcData(null); return; }
    const key = `${concAnchor}::${urlQ}`;
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

  const concOccurrences = useMemo(() => {
    if (!concData) return [];
    return concData.occurrences.filter(o => enabledCorpora.has(o.corpus));
  }, [concData, enabledCorpora]);
  const concShownTotal = useMemo(() => {
    if (!concData) return 0;
    return (concData.by_corpus || []).filter(b => enabledCorpora.has(b.corpus)).reduce((s, b) => s + b.n, 0);
  }, [concData, enabledCorpora]);

  // ── Transliteration lookup (Latin query -> Hebrew paleo names/words) ───
  const translitActive = detectedId === 'latin' && !!urlQ;
  const [translitResult, setTranslitResult] = useState(() => translitCache.get(urlQ.toLowerCase()) || null);
  const [translitBusy, setTranslitBusy] = useState(false);
  const [translitErr, setTranslitErr]   = useState(null);

  useEffect(() => {
    if (!translitActive) { setTranslitResult(null); return; }
    const key = urlQ.toLowerCase();
    const cached = translitCache.get(key);
    if (cached) { setTranslitResult(cached); setTranslitErr(null); return; }
    let cancelled = false;
    setTranslitBusy(true); setTranslitErr(null);
    runTranslitLookup(urlQ)
      .then(r => { if (!cancelled) setTranslitResult(r); })
      .catch(e => { if (!cancelled) setTranslitErr(e.message); })
      .finally(() => { if (!cancelled) setTranslitBusy(false); });
    return () => { cancelled = true; };
  }, [translitActive, urlQ]);

  // ── Actions ──────────────────────────────────────────────────────────
  const runSearch = () => {
    const query = qInput.trim();
    if (!query) return;
    setSearchParams({ q: query, mode });   // fresh script gets (re)detected from q itself
  };

  const toggleSource = corpus => {
    if (!scriptDef) return;
    const next = new Set(enabledCorpora);
    next.has(corpus) ? next.delete(corpus) : next.add(corpus);
    const all = scriptDef.sources.every(s => next.has(s.corpus));
    const p = { q: urlQ, mode };
    if (!all) p.src = [...next].join(',');
    setSearchParams(p, { replace: true });   // filtering, not navigating
  };

  const appendChar = ch => { setQInput(prev => prev + ch); inputRef.current?.focus(); };
  const backspace  = () => setQInput(prev => [...prev].slice(0, -1).join(''));

  const legacyHitHref = r => `/?book=${r.book_id}&chapter=${r.chapter}&verse=${r.verse}`;
  const goToLegacyHit = r => navigate(`${legacyHitHref(r)}${urlQ ? `&hl=${encodeURIComponent(urlQ)}` : ''}`);

  const concHitHref = o => {
    const p = new URLSearchParams({ source: o.source, chapter: String(o.ch) });
    if (o.book_id != null) p.set('book', String(o.book_id));
    else if (o.doc_id) p.set('doc', o.doc_id);
    if (o.v != null) p.set('verse', String(o.v));
    return `/?${p}`;
  };
  const goToConcHit = o => navigate(concHitHref(o));

  // Highlight the real paleo surface, not the Latin query the user typed —
  // the reader's highlighter matches against paleo text, so passing the
  // original Latin query would just never light anything up.
  const translitHitHref = v => `/?book=${v.book_id}&chapter=${v.chapter}&verse=${v.verse}`;
  const goToTranslitHit = v => navigate(
    v.matchedSurface ? `${translitHitHref(v)}&hl=${encodeURIComponent(v.matchedSurface)}` : translitHitHref(v)
  );

  const busy = legacyBusy || concBusy || translitBusy;
  const anyErr = legacyErr || concErr || translitErr;

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
              dir={isRtlScript(typedScript) ? 'rtl' : 'ltr'}
              style={{ direction: isRtlScript(typedScript) ? 'rtl' : 'ltr', fontFamily: 'inherit' }}
              onChange={e => setQInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
              placeholder="type or paste a word in any language…"
              autoComplete="off"
              aria-label="Search query"
            />
            <button className="hv-search-clear" onClick={() => setQInput('')} title="Clear" aria-label="Clear">✕</button>
            <button className="hv-search-btn" onClick={runSearch} disabled={busy}>Search</button>
          </div>

          {qInput.trim() && (
            <div className="search-detect-hint">Typing in: {getScript(typedScript).label}</div>
          )}

          {/* Keyboard helper — purely an input aid, never restricts the search */}
          <div className="search-kbd-tabs" role="tablist">
            {SCRIPTS.map(s => (
              <button
                key={s.id}
                className={`search-script-tab small ${kbdOpen === s.id ? 'active' : ''}`}
                onClick={() => setKbdOpen(o => (o === s.id ? null : s.id))}
                role="tab" aria-selected={kbdOpen === s.id}
              >{s.label} keyboard</button>
            ))}
          </div>

          {kbdOpen && (
            <div className="hv-paleo-kbd-wrap">
              <button className="hv-paleo-kbd-delete" onClick={backspace} aria-label="Backspace">⌦</button>
              <div className="hv-paleo-kbd" style={{ direction: getScript(kbdOpen).dir }}>
                {getScript(kbdOpen).rows.map((row, ri) => (
                  <div className="hv-kbd-row" key={ri} style={{ direction: getScript(kbdOpen).dir }}>
                    {row.map(ch => (
                      <button key={ch} className="hv-kbd-key" style={{ fontFamily: 'inherit' }} onClick={() => appendChar(ch)}>{ch}</button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {legacySource && (
            <div className="hv-search-mode-toggle" role="tablist">
              <button
                className={`mode-btn ${mode === 'exact' ? 'active' : ''}`}
                onClick={() => { setMode('exact'); if (urlQ) setSearchParams({ q: urlQ, mode: 'exact', ...(urlSrcRaw ? { src: urlSrcRaw } : {}) }); }}
                role="tab" aria-selected={mode === 'exact'}
              >Exact / Ranked</button>
              <button
                className={`mode-btn ${mode === 'chrono' ? 'active' : ''}`}
                onClick={() => { setMode('chrono'); if (urlQ) setSearchParams({ q: urlQ, mode: 'chrono', ...(urlSrcRaw ? { src: urlSrcRaw } : {}) }); }}
                role="tab" aria-selected={mode === 'chrono'}
              >Chronological</button>
            </div>
          )}

          {scriptDef && scriptDef.sources.length > 1 && (
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
          <div className="search-page-empty">Type or paste a word above in any script — Paleo Hebrew, Ge'ez, Syriac, Greek, Latin, Coptic, or an English name — then hit Search.</div>
        )}

        {urlQ && busy && !legacyData && !concData && !translitResult && (
          <div className="search-page-empty">Searching…</div>
        )}

        {/* Legacy (BHS) results */}
        {legacyActive && legacyData && (
          <div className="hv-search-results">
            <div className="hv-results-count">
              {legacySource.label}: {(legacyData.total ?? legacyData.results.length) === 0
                ? `no results for "${urlQ}"`
                : `${legacyData.total || legacyData.results.length} verses${urlMode === 'chrono' ? ' · chronological' : ' · ranked'}`}
            </div>
            {legacyData.results.map((r, i) => (
              <a key={i} className="hv-result-item" href={legacyHitHref(r)} onClick={e => { e.preventDefault(); goToLegacyHit(r); }}>
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

        {/* Concordance (exact-match native-script) results */}
        {concActive && concData && (
          <div className="hv-search-results">
            <div className="hv-results-count">
              {concSources.length > 1 ? scriptDef.label : concSources[0]?.label}: {concShownTotal === 0
                ? (concData.count > 0 ? `0 shown — every match is in a source toggled off above` : `no results for "${urlQ}"`)
                : `${concShownTotal.toLocaleString()} occurrence${concShownTotal !== 1 ? 's' : ''}${concData.count > CONC_LIMIT ? ` (showing first ${CONC_LIMIT})` : ''}`}
            </div>
            {concOccurrences.map((o, i) => (
              <a key={`${o.corpus}-${o.code || o.canon_id}-${o.ch}-${o.v}-${i}`} className="hv-result-item" href={concHitHref(o)} onClick={e => { e.preventDefault(); goToConcHit(o); }}>
                <span className="hv-result-ref">{o.title || BOOK_NAMES[o.canon_id] || o.code} {o.ch}:{o.v}</span>
                {concSources.length > 1 && <span className="hv-result-badge">{o.corpus}</span>}
              </a>
            ))}
          </div>
        )}

        {/* Transliteration lookup (Latin query -> Hebrew paleo, expanded to the
            full root so prefixed/inflected forms and other-corpus reuse of
            the same root show up too — not just the literal spelling typed). */}
        {translitActive && translitResult && (
          <div className="hv-search-results">
            <div className="hv-results-count">
              Hebrew (by name / transliteration): {translitResult.rows.length === 0
                ? `no Hebrew word transliterates to "${urlQ}"`
                : `${translitResult.rows.length.toLocaleString()} verse${translitResult.rows.length !== 1 ? 's' : ''} across ${translitResult.matchCount} matching form${translitResult.matchCount !== 1 ? 's' : ''}${translitResult.truncated ? ` (showing first ${TRANSLIT_FANOUT} forms)` : ''}${translitResult.rootExpanded ? ' + related forms of the same root' : ''}`}
            </div>
            {translitResult.rows.map((v, i) => (
              <a key={`${v.book_id}-${v.chapter}-${v.verse}-${i}`} className="hv-result-item" href={translitHitHref(v)} onClick={e => { e.preventDefault(); goToTranslitHit(v); }}>
                <span className="hv-result-ref">{v.book_name || BOOK_NAMES[v.book_id] || `Book ${v.book_id}`} {v.chapter}:{v.verse}</span>
                <span className="hv-result-badge">{v.matchedSurface || v.matchedStrongs}</span>
              </a>
            ))}
          </div>
        )}

        {detectedId === 'latin' && concActive && concData && concShownTotal === 0 && translitResult && translitResult.rows.length === 0 && urlQ && (
          <div className="search-page-empty">
            No match in the Latin text or as a Hebrew name/transliteration. If you meant a different script, paste the word in its native characters, or use a keyboard above.
          </div>
        )}
      </div>
    </div>
  );
}
