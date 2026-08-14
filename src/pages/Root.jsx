import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { usePaleoMode } from '../hooks/usePaleoMode.js';
import { useLocalStorageNumber } from '../hooks/useLocalStorageNumber.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { BOOK_NAMES, translit } from '../lib/books.js';
import { paleoToSVG, getPaleoMode } from '../lib/paleoGlyphs.js';
import {
  apiDefinitions,
  apiRootList,    apiRootDetail,    apiRootVerses,
  apiSurfaceList, apiSurfaceDetail, apiSurfaceExplorerVerses,
} from '../lib/api.js';
import './Root.css';

// ─────────────────────────────────────────────────────────────────────────────
// Root / Surface explorer — BibleHub-style.
//
// Data model (set by the server's /api/root-explorer/* and surface-explorer/*
// endpoints — see server.js for the contract):
//   list      : { roots: [{root, count, strongs, len}], total }        ← sidebar
//   detail    : { root, lexicon, lemmaTranslit, strongs, total, surfaces, by_book, prev, next }
//   verses    : { total, offset, limit, hasMore, verses: [{book_id, book_name,
//                  chapter, verse, hit_ordinals, words, translation}] }
//
// `words` is the same shape /api/tokens returns from groupSurfaceTokens:
//   { verse, word, token_ordinal, strongs, components: [{paleo, translit,
//     translation, css, sn, token_ordinal}] }
// so RootWordBlock below works without re-shaping.
//
// The legacy /api/root etc. endpoints are NOT used here. They had counting
// bugs (H1 reported 48 occ instead of 1253) and used flawed nav heuristics
// (Aazarak as a root). The new endpoints aggregate from token_surfaces.root_paleo
// which gives exact counts and a clean 2-4 paleo-letter root list.
// ─────────────────────────────────────────────────────────────────────────────

const SUFFIX_PREFIX = ['nme-', 'prs-', 'vbe-'];
const isSuffix = css => SUFFIX_PREFIX.some(p => css && css.startsWith(p));

// Adapter: the verses endpoint returns "word blocks" each containing
// `sourceTokens[]` (the real corpus tokens that flushed into this block).
// We pass that through unchanged so RootWordBlock can render ONE surf link
// per underlying token with its TRUE surface form — never a fabricated
// lemma concatenation. (The legacy fallback path that built word_raw from
// component paleos has been removed; if you're seeing dead links it's
// because sourceTokens is missing — server is out of date.)
function wordBlockToToken(wb, isHitOrdinal) {
  return {
    // word_raw is kept for back-compat with WordBlock's SVG rendering path,
    // but the surf-link logic uses sourceTokens instead. This is the lemma-
    // concatenation, not the corpus surface form — that's why we needed
    // sourceTokens in the first place.
    word_raw: (wb.components || []).map(c => c.paleo || '').join(''),
    strongs: wb.strongs || '',
    token_ordinal: wb.token_ordinal,
    components: wb.components || [],
    sourceTokens: wb.sourceTokens || [],
    isHit: isHitOrdinal ? isHitOrdinal(wb.token_ordinal) : false,
  };
}

// ── Word-block renderer ─────────────────────────────────────────────────────
// Renders ONLY what the server emitted; never re-derives roots or glosses.
function RootWordBlock({ token, isHit }) {
  const useSvg = getPaleoMode() === 'mobile';
  const raw   = token.word_raw || '';
  const sn    = token.strongs ? token.strongs.replace(/^H+/, 'H') : '';
  const comps = token.components || [];

  const content = useMemo(() => {
    if (!comps.length) {
      const glyph = useSvg
        ? paleoToSVG(raw, 'var(--paleo-size)')
        : `<span class="glyph root">${raw}</span>`;
      const sub = `<span class="sub-tl">${raw}</span>`;
      return { glyph, sub };
    }

    // Alternating-color bookkeeping for prefix/suffix readability.
    let prefixIdx = 0, suffixIdx = 0, rootSeen = false;
    const rootIdx = comps.findIndex(c => c.css === 'root');

    const glyph = comps.map(c => {
      const isRoot = c.css === 'root';
      const hitClass = (isHit && isRoot) ? ' glyph-hit' : '';
      let altIdx = 0;
      if (!isRoot && !isSuffix(c.css) && !rootSeen) altIdx = prefixIdx++;
      else if (isSuffix(c.css) && rootSeen) altIdx = suffixIdx++;
      else if (isRoot) rootSeen = true;
      const altAttr = altIdx % 2 === 1 ? ' data-alt="1"' : '';
      const inner = useSvg ? paleoToSVG(c.paleo, 'var(--paleo-size)') : c.paleo;
      return `<span class="glyph ${c.css}${hitClass}"${altAttr} style="display:inline-flex">${inner}</span>`;
    }).join('');

    prefixIdx = 0; suffixIdx = 0; rootSeen = false;
    const tlHTML = comps.map((c, i) => {
      // Mark tokens (maqaf ־, sof-pasuq ׃, paseq …) carry no real transliteration
      // to show here — their glyph already renders on the line above. Mirrors
      // components/WordBlock.jsx's isMark skip; this page duplicates that logic.
      if (c.isMark) return '';
      const tl = c.translit || '';
      let altIdx = 0;
      if (c.css !== 'root' && !isSuffix(c.css) && i < rootIdx) altIdx = prefixIdx++;
      else if (isSuffix(c.css)) altIdx = suffixIdx++;
      const altAttr = altIdx % 2 === 1 ? ' data-alt="1"' : '';
      return `<span class="${c.css}"${altAttr}>${tl}</span>`;
    }).join('');

    const rootComp = comps.find(c => c.css === 'root') || comps[0];
    const cleanTrans = (rootComp ? (rootComp.translation || '') : '').replace(/^\[|\]$/g, '');

    let p2 = 0, s2 = 0, rs2 = false;
    const modLabels = comps.filter(c => c.css !== 'root' && !c.isMark).map(c => {
      const lbl = (c.translation || '').replace(/^\[|\]$/g, '');
      if (!lbl) return '';
      let ai = 0;
      if (!isSuffix(c.css) && !rs2) ai = p2++;
      else if (isSuffix(c.css)) ai = s2++;
      const altAttr = ai % 2 === 1 ? ' data-alt="1"' : '';
      return `<span class="${c.css}"${altAttr}>${lbl}</span>`;
    }).filter(Boolean);

    let sub = `<span class="sub-tl">${tlHTML}</span>`;
    if (cleanTrans || modLabels.length) {
      sub += ' <span class="brk">(</span>';
      if (cleanTrans) sub += `<span class="${rootComp ? rootComp.css : 'root'}">${cleanTrans}</span>`;
      if (modLabels.length) {
        if (cleanTrans) sub += ' <span class="brk">[</span>';
        sub += modLabels.join('<span class="brk">-</span>');
        if (cleanTrans) sub += '<span class="brk">]</span>';
      }
      sub += '<span class="brk">)</span>';
    }
    return { glyph, sub };
  }, [comps, isHit, useSvg, raw]);

  const snLinks = useMemo(() => {
    const seen = new Set(); const links = [];
    comps.forEach(c => { if (c.sn && !seen.has(c.sn)) { seen.add(c.sn); links.push({ sn: c.sn, css: c.css }); } });
    if (!links.length && sn) links.push({ sn, css: 'root' });
    return links;
  }, [comps, sn]);

  return (
    <div className={`word-block ${isHit ? 'hit-token' : ''}`}>
      <div className={`paleo-line ${isHit ? 'is-hit' : ''}`} dangerouslySetInnerHTML={{ __html: content.glyph }} />
      <div className="sub-line" dangerouslySetInnerHTML={{ __html: content.sub }} />
      {(snLinks.length || token.sourceTokens?.length) && (
        <div className="sn-bdg sn-bdg-hover">
          {snLinks.map(l => {
            const n = parseInt(String(l.sn).replace(/^H/i, ''), 10);
            if (!isNaN(n) && n >= 9000) {
              // Grammar/virtual code (connector, preposition, article) — the
              // root index deliberately excludes these, so there's no page to
              // link to. Show the badge without a link instead of a 404.
              return (
                <span key={l.sn} className={`sn-link ${l.css} sn-virtual`}
                      title="Grammar/virtual code — no root entry"
                      style={{ opacity: 0.6, cursor: 'default' }}>{l.sn}</span>
              );
            }
            return (
              <a key={l.sn} href={`/roots?sn=${l.sn}`} className={`sn-link ${l.css}`}>{l.sn}</a>
            );
          })}
          {/* One "surf" link for the whole written word — the merged surface
              (all its morphemes joined), which is how surfaces are now keyed.
              Passing a single morpheme would miss the word-level index. */}
          {token.sourceTokens?.length > 0 && (() => {
            const merged = (token.sourceTokens || []).map(s => s.word_raw || '').join('');
            if (!merged) return null;
            const qs = new URLSearchParams({ word: merged });
            return (
              <a key={`surf_${merged}`}
                 href={`/surfaces?${qs}`}
                 className="surf-link-bdg"
                 title={`Browse surface ${merged}`}
              >surf</a>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── Verse card — one row per occurrence ─────────────────────────────────────
function VerseCard({ verse, onVerseClick }) {
  const hitSet = useMemo(() => new Set(verse.hit_ordinals || []), [verse.hit_ordinals]);
  const tokens = useMemo(
    () => (verse.words || []).map(wb => wordBlockToToken(wb, ord => hitSet.has(ord))),
    [verse.words, hitSet]
  );
  return (
    <div className="verse-card">
      <div className="verse-ref">
        <a href={`/?book=${verse.book_id}&chapter=${verse.chapter}&verse=${verse.verse}`}
           onClick={onVerseClick}>
          {verse.book_name || BOOK_NAMES[verse.book_id] || `Book ${verse.book_id}`} {verse.chapter}:{verse.verse}
        </a>
        {verse.translation && verse.translation.text && (
          <span className="verse-translation"> — {verse.translation.text}</span>
        )}
      </div>
      <div className="verse-tokens">
        {tokens.map((t, i) => (
          <RootWordBlock key={i} token={t} isHit={t.isHit} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Two-pane detail layout (matches the concordance): compact hit rail + scripture
// centerpiece. Self-contained so it doesn't fight Root.css's old stacked layout.
const R2_CSS = `
.root-main2{flex:1;min-width:0;display:flex;min-height:0;overflow:hidden;padding:0;}
.r2-detail{display:flex;flex:1;min-height:0;overflow:hidden;width:100%;}
.r2-side{width:340px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;border-right:1px solid var(--border);}
.r2-head{padding:14px 16px;border-bottom:1px solid var(--border);}
.r2-fold{border-bottom:1px solid var(--border);}
.r2-fold>summary{cursor:pointer;padding:8px 16px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text3);user-select:none;display:flex;justify-content:space-between;align-items:center;gap:8px;}
.r2-fold[open]>summary{color:var(--gold);}
.r2-fold-body{max-height:26vh;overflow-y:auto;padding:6px 0 8px;}
.r2-hits-head{padding:8px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.r2-hits{flex:1;min-height:0;overflow-y:auto;}
.r2-hit{display:block;width:100%;text-align:left;padding:8px 16px;border:none;border-bottom:1px solid var(--border);border-left:3px solid transparent;background:transparent;color:inherit;cursor:pointer;font:inherit;}
.r2-hit:hover{background:var(--bg3);}
.r2-hit.active{background:var(--bg3);border-left-color:var(--gold);}
.r2-hit-ref{font-size:12px;font-weight:700;color:var(--text2);}
.r2-hit-tl{font-size:11px;color:var(--text3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.r2-center{flex:1;min-width:0;overflow-y:auto;padding:24px 30px;}
.r2-btn{font-size:12px;padding:4px 11px;border-radius:8px;cursor:pointer;background:var(--bg3);border:1px solid var(--border2);color:var(--text2);text-decoration:none;display:inline-block;}
.r2-btn:hover{border-color:var(--border3);color:var(--text);}
.r2-btn:disabled{opacity:.45;cursor:default;}
.r2-bookbtn{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:transparent;border:none;border-left:2px solid transparent;cursor:pointer;font:inherit;color:inherit;padding:5px 16px;}
.r2-bookbtn:hover{background:var(--bg3);}
.r2-bookbtn.active{background:var(--bg3);border-left-color:var(--gold);}
.r2-surf{display:inline-flex;align-items:baseline;gap:5px;padding:3px 8px;border-radius:8px;cursor:pointer;text-decoration:none;color:inherit;}
.r2-surf:hover{background:var(--bg3);}
.r2-verse{display:flex;flex-wrap:wrap;gap:20px 14px;align-items:flex-start;direction:rtl;}
/* Matched root/surface stands out in the centerpiece, in any language. */
.r2-center .word-block.hit-token{background:color-mix(in srgb, var(--gold) 14%, transparent);outline:2px solid var(--gold);outline-offset:3px;border-radius:8px;}
@media(max-width:980px){
  /* Mobile: collapse to ONE page scroll. Drop every nested scroll container
     (they trap the touch gesture so the verse below never gets reached) and
     order the verse centerpiece FIRST so the actual text shows immediately. */
  .root-page.root-page{height:auto;min-height:100vh;overflow:visible;}
  .root-main2{overflow:visible;height:auto;min-height:0;}
  .r2-detail{flex-direction:column;overflow:visible;height:auto;min-height:0;}
  .r2-center{order:1;flex:none;height:auto;overflow:visible;padding:18px;border-bottom:1px solid var(--border);}
  .r2-side{order:2;width:auto;border-right:none;overflow:visible;min-height:0;}
  .r2-hits{flex:none;max-height:none;overflow:visible;}
  .r2-fold-body{max-height:none;overflow:visible;}
}
`;

// ─────────────────────────────────────────────────────────────────────────────
export default function Root({ mode = 'root' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, toggle: toggleTheme } = useTheme();
  const { mode: paleoMode, toggle: togglePaleoMode } = usePaleoMode();
  useLocalStorageNumber('paleo-font-size', 30, '--paleo-size');
  useLocalStorageNumber('sub-font-size', 11, '--sub-size');
  const isMobile = useIsMobile(768);

  const viewerMode = mode === 'surface' ? 'surface' : 'root';
  const urlRoot = searchParams.get('root') || '';
  const urlWord = searchParams.get('word') || searchParams.get('surface') || '';
  const urlSN   = searchParams.get('sn') || '';
  // Legacy: ?sn=H1 on the root page → look up the root's paleo and switch URL
  // to use ?root=<paleo>. The new endpoints are paleo-keyed.

  const [definitions, setDefinitions] = useState({});
  useEffect(() => { apiDefinitions().then(setDefinitions).catch(() => setDefinitions({})); }, []);

  // ── Sidebar list (all roots OR all surfaces) ───────────────────────────────
  const [allList, setAllList] = useState([]);   // [{root,count,strongs_label,len}] or [{surface,strongs,root,count}]
  const [listLoaded, setListLoaded] = useState(false);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (viewerMode === 'surface') {
          // Surface list can be 24k entries — fetch a generous initial slice.
          // The filter applies client-side for instant feedback; if user
          // searches for something not in the initial slice, we re-fetch
          // with q= (see filter effect below).
          const d = await apiSurfaceList({ limit: 1000 });
          if (!cancelled) setAllList(d.surfaces || []);
        } else {
          const d = await apiRootList();
          if (!cancelled) setAllList(d.roots || []);
        }
      } catch (e) {
        console.error('list load failed:', e);
      } finally {
        if (!cancelled) setListLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [viewerMode]);

  // Surface mode: when filter text doesn't match anything locally, re-fetch
  // server-side so deep searches work even with a paginated initial slice.
  useEffect(() => {
    if (viewerMode !== 'surface' || !filterText || !listLoaded) return;
    const localMatch = allList.some(s => s.surface.includes(filterText));
    if (localMatch) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await apiSurfaceList({ q: filterText, limit: 200 });
        if (!cancelled && d.surfaces?.length) setAllList(d.surfaces);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [filterText, viewerMode, allList, listLoaded]);

  const filteredList = useMemo(() => {
    if (!filterText) return allList;
    const f = filterText.trim();
    if (viewerMode === 'surface') {
      return allList.filter(s =>
        s.surface.includes(f) || (s.strongs || '').includes(f.toUpperCase())
      );
    }
    return allList.filter(r =>
      r.root.includes(f) ||
      (r.strongs_label || '').toUpperCase().includes(f.toUpperCase())
    );
  }, [allList, filterText, viewerMode]);

  // ── Active entry detail (single root or single surface) ────────────────────
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState(null);
  const [activeBook, setActiveBook] = useState(null);

  // Resolve URL → detail fetch
  useEffect(() => {
    let cancelled = false;
    setDetailErr(null);
    setActiveBook(null);

    (async () => {
      try {
        if (viewerMode === 'surface') {
          let word = urlWord;
          // If user landed without ?word=, redirect to the first surface
          if (!word && allList.length) {
            const first = allList[0];
            setSearchParams({ word: first.surface, ...(first.strongs && { sn: first.strongs }) }, { replace: true });
            return;
          }
          if (!word) return;  // wait for list to load
          try {
            const d = await apiSurfaceDetail(word, urlSN);
            if (!cancelled) setDetail({ kind: 'surface', ...d });
          } catch (err) {
            // Server may have hinted that this string is actually a root —
            // gracefully redirect instead of showing a hard error. The
            // server sets `suggestion: 'root'` + `redirect_to: '/roots?...'`
            // when SURFACE_INFO misses but ROOTS_LIST has the same paleo.
            if (err.body?.suggestion === 'root' && err.body?.root) {
              if (!cancelled) {
                window.location.replace(err.body.redirect_to);
              }
              return;
            }
            throw err;
          }
        } else {
          // Root identity is the Strong's number (exact, BibleHub-style). ?sn=
          // routes straight to that root; ?root=<paleo> is a legacy fallback.
          if (urlSN) {
            const d = await apiRootDetail({ sn: urlSN });
            if (!cancelled) setDetail({ kind: 'root', ...d });
            return;
          }
          if (urlRoot) {
            const d = await apiRootDetail({ root: urlRoot });
            if (!cancelled) setDetail({ kind: 'root', ...d });
            return;
          }
          // No params → redirect to the first root alphabetically.
          if (allList.length) {
            const first = allList[0];
            setSearchParams({ sn: first.sn }, { replace: true });
            return;
          }
        }
      } catch (e) {
        if (!cancelled) setDetailErr(e.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [viewerMode, urlRoot, urlWord, urlSN, allList, setSearchParams]);

  // ── Verses pagination ──────────────────────────────────────────────────────
  const [verses, setVerses]   = useState([]);
  const [vTotal, setVTotal]   = useState(0);
  const [vOffset, setVOffset] = useState(0);
  const [vLoading, setVLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sel, setSel] = useState(0);   // selected verse index for the centerpiece

  const verseSeq = useRef(0);       // guards against out-of-order verse pages
  const loadVerses = useCallback(async (reset) => {
    if (!detail) return;
    // Only the newest request may write. Click one root, then another before the
    // first responds, and the two are in flight together with no ordering
    // guarantee — a slow earlier one landing last would list the PREVIOUS root's
    // verses under the current root's heading. The "load more" path makes it
    // worse: it APPENDS, so a stale page grafts one root's verses onto another's.
    const seq = ++verseSeq.current;
    const stale = () => seq !== verseSeq.current;

    const off = reset ? 0 : vOffset;
    setVLoading(true);
    try {
      let d;
      if (detail.kind === 'surface') {
        d = await apiSurfaceExplorerVerses({
          word: detail.surface,
          book: activeBook ?? undefined,
          offset: off,
          limit: 25,
        });
      } else {
        d = await apiRootVerses({
          sn: detail.sn,
          book: activeBook ?? undefined,
          offset: off,
          limit: 25,
        });
      }
      if (stale()) return;
      const incoming = d.verses || [];
      setVTotal(d.total || 0);
      setHasMore(!!d.hasMore);
      setVOffset(off + incoming.length);
      setVerses(prev => reset ? incoming : [...prev, ...incoming]);
    } catch (e) {
      if (!stale()) console.error('verses load failed:', e);
    } finally {
      // Only the newest request owns the spinner; a stale one finishing must not
      // clear it while the current request is still running.
      if (!stale()) setVLoading(false);
    }
  }, [detail, vOffset, activeBook]);

  // Reset + reload whenever detail or active book changes
  useEffect(() => {
    if (detail) { setSel(0); loadVerses(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, activeBook]);

  // ── Mobile sidebar ─────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarScrollRef = useRef(null);

  // Scroll selected item into view when detail changes
  useEffect(() => {
    if (!detail || !sidebarScrollRef.current) return;
    const sel = sidebarScrollRef.current.querySelector('.sidebar-item.active');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }, [detail]);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const goPrev = () => {
    if (!detail) return;
    if (detail.kind === 'surface' && detail.prev) {
      setSearchParams({ word: detail.prev.surface, ...(detail.prev.strongs && { sn: detail.prev.strongs }) });
    } else if (detail.kind === 'root' && detail.prev) {
      setSearchParams({ sn: detail.prev.sn });
    }
  };
  const goNext = () => {
    if (!detail) return;
    if (detail.kind === 'surface' && detail.next) {
      setSearchParams({ word: detail.next.surface, ...(detail.next.strongs && { sn: detail.next.strongs }) });
    } else if (detail.kind === 'root' && detail.next) {
      setSearchParams({ sn: detail.next.sn });
    }
  };

  // Build href for a list item — separate Surface mode (preserves SN) from Root mode
  const itemHref = (item) => {
    if (viewerMode === 'surface') {
      const p = new URLSearchParams({ word: item.surface });
      if (item.strongs) p.set('sn', item.strongs);
      return `/surfaces?${p}`;
    }
    return `/roots?sn=${encodeURIComponent(item.sn)}`;
  };

  const bookMax = Math.max(1, ...(detail?.by_book || []).map(b => b.occ));
  const headerTitle = detail
    ? (detail.kind === 'root'
        ? `${detail.lemmaTranslit || translit(detail.root)} — ${(detail.total || 0).toLocaleString()} occurrences`
        : `${translit(detail.surface)} — ${(detail.total || 0).toLocaleString()} occurrences`)
    : (detailErr ? 'Error' : 'Loading…');

  // Real per-entry browser-tab title + <meta description>, following the
  // same "Surface | Reference" convention as Reader/Parallel/Translate (see
  // hooks/usePageTitle.js) — e.g. "Root Explorer | Yaban-Al (H2995)". Falsy
  // `ref` while `detail` hasn't loaded yet falls back to the surface alone,
  // same as every other caller of this hook.
  const occursText = (n) => `${(n || 0).toLocaleString()} time${n === 1 ? '' : 's'}`;
  const entryRef = detail && (
    detail.kind === 'root'
      ? `${detail.lemmaTranslit || translit(detail.root)}${detail.sn ? ` (${detail.sn})` : ''}`
      : `${translit(detail.surface)}${detail.strongs ? ` (${detail.strongs})` : ''}`
  );
  const pageDescription = detail && (
    detail.kind === 'root'
      ? `${detail.lemmaTranslit || translit(detail.root)} (Strong's ${detail.sn})${detail.lexicon ? ` — ${detail.lexicon}` : ''}. Occurs ${occursText(detail.total)} in Scripture. Paleo-Hebrew root explorer with verse-by-verse occurrences.`
      : `${translit(detail.surface)}${detail.strongs ? ` — Strong's ${detail.strongs}` : ''}, a surface form of the root ${translit(detail.root)}. Occurs ${occursText(detail.total)} in Scripture.`
  );
  usePageTitle(entryRef, viewerMode === 'surface' ? 'Surface Explorer' : 'Root Explorer', undefined, pageDescription);

  return (
    <div className="root-page">
      <header className="root-topbar">
        <div className="root-topbar-row1">
          <Link to="/landing" className="logo-btn">𐤀𐤁</Link>
          {isMobile && (
            <button className="icon-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar">☰</button>
          )}
          <div className="nav-divider" />
          {detail?.kind === 'root' && (detail.strongs || []).length > 0 && (
            <span className="root-top-sn">{(detail.strongs || []).join(', ')}</span>
          )}
          {detail?.kind === 'surface' && detail.strongs && (
            <span className="root-top-sn">{detail.strongs}</span>
          )}
          <span className="root-top-title">{headerTitle}</span>
        </div>
        <div className="root-topbar-row2">
          <Link to="/cheatsheet" className="icon-btn" style={{ fontSize: 11, width: 'auto', padding: '5px 10px' }}>📋</Link>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? '☀' : '☾'}</button>
          <button className={`dp-pill ${paleoMode === 'mobile' ? 'active' : ''}`} onClick={togglePaleoMode} style={{ minHeight: 34 }}>
            {paleoMode === 'mobile' ? '📱' : '🖥'}
          </button>
        </div>
      </header>

      {/* Prev/Next navigation bar — like BibleHub's */}
      <div className="root-alpha-nav">
        <button
          className={`alpha-btn ${detail?.prev ? '' : 'disabled'}`}
          onClick={goPrev}
          disabled={!detail?.prev}
        >
          ◄ <span className="nav-paleo">
            {detail?.kind === 'surface' ? (detail.prev?.surface || '') : (detail?.prev?.root || '')}
          </span>
          <span className="nav-tl">
            {detail?.kind === 'surface'
              ? (detail.prev ? translit(detail.prev.surface) : '')
              : (detail?.prev ? translit(detail.prev.root) : '')}
          </span>
        </button>
        <span className="alpha-pos">
          {viewerMode === 'surface' ? 'surfaces (each Strongs is its own entry)' : 'roots, Hebrew-alphabetical'}
        </span>
        <button
          className={`alpha-btn ${detail?.next ? '' : 'disabled'}`}
          onClick={goNext}
          disabled={!detail?.next}
        >
          <span className="nav-paleo">
            {detail?.kind === 'surface' ? (detail.next?.surface || '') : (detail?.next?.root || '')}
          </span>
          <span className="nav-tl">
            {detail?.kind === 'surface'
              ? (detail.next ? translit(detail.next.surface) : '')
              : (detail?.next ? translit(detail.next.root) : '')}
          </span> ►
        </button>
      </div>

      {detailErr && <div className="root-err">⚠ {detailErr}</div>}

      <div className="root-body">
        {/* Sidebar: list of all roots/surfaces with filter */}
        <aside className={`root-sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
          <div className="sidebar-controls">
            <div className="root-view-toggle">
              <Link className={`rv-btn ${viewerMode === 'root' ? 'active' : ''}`} to="/roots">Roots</Link>
              <Link className={`rv-btn ${viewerMode === 'surface' ? 'active' : ''}`} to="/surfaces">Surfaces</Link>
            </div>
            <input
              className="sidebar-filter"
              placeholder={viewerMode === 'surface' ? 'Filter surfaces…' : 'Filter roots…'}
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
            />
            <div className="sidebar-count">
              {listLoaded ? `${filteredList.length.toLocaleString()} entries` : 'loading…'}
            </div>
          </div>

          <div className="sidebar-scroll" ref={sidebarScrollRef}>
            {viewerMode === 'root' ? (
              filteredList.slice(0, 500).map(r => (
                <a
                  key={r.sn}
                  href={itemHref(r)}
                  className={`sidebar-item ${detail?.kind === 'root' && detail.sn === r.sn ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setSearchParams({ sn: r.sn }); if (isMobile) setSidebarOpen(false); }}
                >
                  <span className="si-paleo">{r.root}</span>
                  <span className="si-tl">{translit(r.root)}</span>
                  <span className="si-sn">{r.sn}</span>
                  <span className="si-count">{r.count.toLocaleString()}</span>
                </a>
              ))
            ) : (
              filteredList.slice(0, 500).map(s => (
                <a
                  key={`${s.surface}_${s.strongs}`}
                  href={itemHref(s)}
                  className={`sidebar-item ${detail?.kind === 'surface' && detail.surface === s.surface && (detail.strongs || '') === (s.strongs || '') ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setSearchParams({ word: s.surface, ...(s.strongs && { sn: s.strongs }) }); if (isMobile) setSidebarOpen(false); }}
                >
                  <span className="si-paleo">{s.surface}</span>
                  <span className="si-tl">{translit(s.surface)}</span>
                  <span className="si-sn">{s.strongs}</span>
                  <span className="si-count">{s.count.toLocaleString()}</span>
                </a>
              ))
            )}
            {filteredList.length > 500 && (
              <div className="sidebar-truncated">… {(filteredList.length - 500).toLocaleString()} more (filter to narrow)</div>
            )}
          </div>
        </aside>
        {sidebarOpen && <div className="root-mob-overlay" onClick={() => setSidebarOpen(false)} />}

        {/* Main: concordance-style two-pane — detail rail + scripture centerpiece */}
        <main className="root-verses root-main2">
          <style>{R2_CSS}</style>
          {!detail ? (
            <div className="root-state-msg" style={{ margin: 'auto' }}><span className="spin">◌</span> Loading…</div>
          ) : (
            <div className="r2-detail">
              {/* RAIL: header + gloss + surface forms + by-book + compact hit list */}
              <aside className="r2-side">
                <div className="r2-head">
                  <div className="rd-paleo" style={{ fontSize: 34 }}>
                    {detail.kind === 'root' ? detail.root : detail.surface}
                  </div>
                  <div className="rd-tl" style={{ marginTop: 2 }}>
                    {detail.kind === 'root' ? (detail.lemmaTranslit || translit(detail.root)) : translit(detail.surface)}
                  </div>
                  <div className="rd-sns" style={{ marginTop: 2 }}>
                    {detail.kind === 'root' ? (detail.strongs || []).join(', ') : detail.strongs}
                  </div>
                  {(() => {
                    const def  = detail.kind === 'root'
                      ? (detail.lexicon || definitions[detail.root])
                      : (definitions[detail.surface] || definitions[detail.root]);
                    const form = detail.kind === 'root' ? detail.root : detail.surface;
                    // No gloss yet → repeat the form in brackets (Hebrew-reader style)
                    // so it's clear there's no definition rather than showing a dash.
                    return def
                      ? <div className="rd-def" style={{ marginTop: 6 }}>{def}</div>
                      : <div className="rd-def" style={{ marginTop: 6, opacity: 0.6 }} title="No gloss in your lexicon yet — showing the form">[{form}]</div>;
                  })()}
                  {detail.kind === 'surface' && detail.root && (
                    <div className="rd-root-link" style={{ marginTop: 6 }}>
                      Root: <Link to={detail.strongs ? `/roots?sn=${encodeURIComponent(detail.strongs)}` : `/roots?root=${encodeURIComponent(detail.root)}`}>{detail.root} ({translit(detail.root)})</Link>
                    </div>
                  )}
                </div>

                {detail.kind === 'root' && detail.surfaces && detail.surfaces.length > 0 && (
                  <details className="r2-fold" open>
                    <summary><span>Surface forms</span><span>{detail.surfaces.length}</span></summary>
                    <div className="r2-fold-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 14px' }}>
                      {detail.surfaces.map(s => (
                        <a key={`${s.word_raw}_${s.strongs}`} className="r2-surf"
                           href={`/surfaces?word=${encodeURIComponent(s.word_raw)}${s.strongs ? `&sn=${s.strongs}` : ''}`}
                           title={`${(s.occ || 0).toLocaleString()} occ. — open surface`}>
                          <span className="si-paleo" style={{ fontSize: 18 }}>{s.word_raw}</span>
                          <span style={{ fontSize: 10, color: 'var(--text4)' }}>{(s.occ || 0).toLocaleString()}</span>
                        </a>
                      ))}
                    </div>
                  </details>
                )}

                {detail.by_book && detail.by_book.length > 0 && (
                  <details className="r2-fold" open>
                    <summary><span>By book — tap to filter</span><span>{detail.by_book.length}</span></summary>
                    <div className="r2-fold-body">
                      {detail.by_book.map(b => (
                        <button key={b.book_id} type="button"
                                className={`r2-bookbtn ${activeBook === b.book_id ? 'active' : ''}`}
                                onClick={() => setActiveBook(activeBook === b.book_id ? null : b.book_id)}
                                title={`Show only ${b.name}`}>
                          <span className="book-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                          <span className="book-bar" style={{ width: `${Math.max(6, Math.round(b.occ / bookMax * 90))}px` }} />
                          <span className="book-n">{b.occ.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                )}

                <div className="r2-hits-head">
                  <span className="root-result-count">
                    {verses.length.toLocaleString()} of {vTotal.toLocaleString()} hit{vTotal !== 1 ? 's' : ''}
                    {activeBook && detail.by_book && <> · {detail.by_book.find(b => b.book_id === activeBook)?.name || `Book ${activeBook}`}</>}
                  </span>
                  {activeBook && <button className="r2-btn" onClick={() => setActiveBook(null)}>✕ all</button>}
                </div>

                <div className="r2-hits">
                  {vLoading && verses.length === 0 && <div className="root-state-msg"><span className="spin">◌</span> Loading…</div>}
                  {!vLoading && verses.length === 0 && !detailErr && <div className="root-state-msg">No occurrences found.</div>}
                  {verses.map((v, i) => (
                    <button key={`${v.book_id}-${v.chapter}-${v.verse}-${i}`} type="button"
                            className={`r2-hit ${i === sel ? 'active' : ''}`} onClick={() => setSel(i)}>
                      <div className="r2-hit-ref">{v.book_name || BOOK_NAMES[v.book_id] || `Book ${v.book_id}`} {v.chapter}:{v.verse}</div>
                      {v.translation && v.translation.text && <div className="r2-hit-tl">{v.translation.text}</div>}
                    </button>
                  ))}
                  {hasMore && (
                    <button className="r2-btn" disabled={vLoading} onClick={() => loadVerses(false)} style={{ margin: '12px auto', display: 'block' }}>
                      {vLoading ? 'Loading…' : `Load more — ${verses.length} of ${vTotal}`}
                    </button>
                  )}
                </div>
              </aside>

              {/* CENTERPIECE: selected verse as readable scripture, hit accented */}
              <section className="r2-center">
                {(() => {
                  const cur = verses[sel] || null;
                  if (!cur) return <div style={{ color: 'var(--text3)', fontSize: 15, paddingTop: 30 }}>{verses.length ? 'Select a hit to read it here.' : 'No occurrences to show.'}</div>;
                  const hitSet = new Set(cur.hit_ordinals || []);
                  const tokens = (cur.words || []).map(wb => wordBlockToToken(wb, ord => hitSet.has(ord)));
                  const readerHref = `/?book=${cur.book_id}&chapter=${cur.chapter}&verse=${cur.verse}`;
                  const atEnd = sel >= verses.length - 1;
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                        <h2 style={{ margin: 0, color: 'var(--gold)', fontSize: 22 }}>
                          {cur.book_name || BOOK_NAMES[cur.book_id] || `Book ${cur.book_id}`} {cur.chapter}:{cur.verse}
                        </h2>
                        <Link to={readerHref} className="r2-btn" style={{ marginLeft: 'auto' }}>open in reader ↗</Link>
                      </div>
                      {cur.translation && cur.translation.text && (
                        <div className="verse-translation" style={{ marginBottom: 16, color: 'var(--text2)' }}>{cur.translation.text}</div>
                      )}
                      <div className="r2-verse">
                        {tokens.length
                          ? tokens.map((t, i) => <RootWordBlock key={i} token={t} isHit={t.isHit} />)
                          : <div style={{ color: 'var(--text3)' }}>No token breakdown for this verse. <Link to={readerHref} style={{ color: 'var(--teal)' }}>Open in reader ↗</Link></div>}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
                        <button type="button" className="r2-btn" disabled={sel <= 0} onClick={() => setSel(s => Math.max(0, s - 1))}>← previous hit</button>
                        <button type="button" className="r2-btn" disabled={atEnd && !hasMore}
                                onClick={() => { if (!atEnd) setSel(s => s + 1); else if (hasMore) loadVerses(false); }}>
                          next hit →
                        </button>
                      </div>
                    </>
                  );
                })()}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
