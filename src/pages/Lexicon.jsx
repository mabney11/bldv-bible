import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { usePaleoMode } from '../hooks/usePaleoMode.js';
import { useLocalStorageNumber } from '../hooks/useLocalStorageNumber.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PALEO_LETTERS, translit, paleoSortKey, LETTER_NAMES } from '../lib/books.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { paleoWordFlex, paleoCharNoMargin } from '../lib/paleoGlyphs.js';
import {
  apiLexicon, apiHomographs, apiDefinitions,
  apiRootList, apiSurfaceList,
  apiSourceLexiconCurated, apiSourceLexiconRoots, apiSourceLexiconList,
} from '../lib/api.js';
import {
  getAdminStatus, getLexiconOverride, saveLexiconOverride, resetLexiconOverride,
  mergeLexicon, validateLexiconShape,
} from '../lib/localOverlay.js';
import DisplayPanel from '../components/DisplayPanel.jsx';
import './Lexicon.css';

// ── LANGUAGES ─────────────────────────────────────────────────────────────
// The lexicon page hosts three corpora: Hebrew (BHS), Greek (LXX + GNT
// share the same JSON lexicon and tokenization), and Ge'ez. Hebrew has
// full tabs (Lexicon/Roots/Surfaces/Dictionary); other languages drop the
// Hebrew-only Dictionary tab.
const LANGS = [
  { key: 'hebrew', label: 'Hebrew', src: null },
  { key: 'greek',  label: 'Greek',  src: 'GNT' },   // unified Greek lexicon
  { key: 'geez',   label: "Ge'ez",  src: 'GEZ' },
];

const TABS_HEBREW = [
  { key: 'lexicon',    label: 'Lexicon' },
  { key: 'roots',      label: 'All Roots' },
  { key: 'surfaces',   label: 'All Surfaces' },
  { key: 'dictionary', label: 'Dictionary' },
];
const TABS_OTHER = [
  { key: 'lexicon',    label: 'Lexicon' },
  { key: 'roots',      label: 'All Roots' },
  { key: 'surfaces',   label: 'All Surfaces' },
];

// First-letter sets for the letter rail in each language. Greek covers the
// 24 lowercase letters; Ge'ez uses the Ethiopic block — we show one syllable
// per consonantal row (the base 1st-order column) since that's what users
// recognize at a glance.
const GREEK_LETTERS = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω'];
const GEEZ_LETTERS  = ['ሀ','ለ','ሐ','መ','ሠ','ረ','ሰ','ሸ','ቀ','በ','ተ','ቸ','ኀ','ነ','ኘ','አ','ከ','ኸ','ወ','ዐ','ዘ','ዠ','የ','ደ','ጀ','ገ','ጠ','ጨ','ጰ','ጸ','ፀ','ፈ','ፐ'];

const paleoRx = /^([\u{10900}-\u{1091F}]+)/u;

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADERS — NO LOCAL CACHING.
// Each loader hits the network on every call.
//
// "All Roots" and "All Surfaces" use the new /api/root-explorer/list and
// /api/surface-explorer/list endpoints (NOT the legacy /api/nav/roots or
// /api/nav/surfaces). The legacy endpoints had two fatal bugs:
//   1) They listed inflected forms as roots (so Aazarak appeared at the top
//      of "All Roots" instead of Ab).
//   2) Their counts were wrong (Ab showed 48 occ when the corpus has 1,253).
// The new endpoints aggregate from token_surfaces.root_paleo and filter to
// genuine 2-4 paleo-letter roots with correct occurrence counts. They are
// also the same endpoints the /roots Root explorer page uses, so links from
// here ALWAYS land on a real entry — no dead links.
// ─────────────────────────────────────────────────────────────────────────────
// Non-admins may have uploaded a personal replacement/patch for lexicon.json
// or homographs.json (see the "My Lexicon" panel below) — stored only in this
// browser (localOverlay.js), never sent to the server. mergeLexicon layers it
// key-by-key over the published file so an override can patch a handful of
// entries without re-supplying the whole lexicon. Admins always see exactly
// what's published (no override lookup needed, but it's a no-op for them
// anyway since they never save one).
async function loadLexiconEntries() {
  const [lexRaw, homoRaw, lexOv, homoOv] = await Promise.all([
    apiLexicon(), apiHomographs(), getLexiconOverride('lexicon'), getLexiconOverride('homographs'),
  ]);
  const lexMerged  = mergeLexicon(lexRaw, lexOv?.data);
  const homoMerged = mergeLexicon(homoRaw, homoOv?.data);
  const entries = [];
  for (const [paleo, def] of Object.entries(lexMerged))
    entries.push({ paleo, tl: translit(paleo), def, pos: '', type: 'lexicon' });
  for (const [key, def] of Object.entries(homoMerged)) {
    const m = key.match(paleoRx);
    if (!m) continue;
    const paleo = m[1];
    const pos = key.slice(paleo.length).replace(/^_/, '').replace(/_/g, ' ');
    entries.push({ paleo, tl: translit(paleo), def, pos, type: 'homograph' });
  }
  entries.sort((a, b) => {
    const ka = paleoSortKey(a.paleo), kb = paleoSortKey(b.paleo);
    if (ka !== kb) return ka < kb ? -1 : 1;
    if (a.type !== b.type) return a.type === 'lexicon' ? -1 : 1;
    return a.pos.localeCompare(b.pos);
  });
  return entries;
}

async function loadDictionaryEntries() {
  const [raw, ov] = await Promise.all([apiDefinitions(), getLexiconOverride('definitions')]);
  const merged = mergeLexicon(raw, ov?.data);
  const entries = Object.entries(merged).map(([paleo, def]) =>
    ({ paleo, tl: translit(paleo), def, pos: '', type: 'definition' })
  );
  entries.sort((a, b) => {
    const ka = paleoSortKey(a.paleo), kb = paleoSortKey(b.paleo);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return entries;
}

// All Roots: the new endpoint returns {root, count, strongs[], strongs_label, len}.
// Adapt to the {paleo, count, sn, strongs, tl} shape WordRow expects.
async function loadRoots() {
  const d = await apiRootList();
  return (d.roots || []).map(r => ({
    paleo:   r.root,
    tl:      translit(r.root),
    count:   r.count,
    sn:      r.strongs?.[0] || '',
    strongs: r.strongs || [],
    type:    'root',
  }));
}

// All Surfaces: server returns paginated, but the lexicon page wants all in
// memory for letter-jump navigation. Pull up to 30k (more than enough — the
// corpus has ~24k unique surface×SN pairs). One round trip.
async function loadSurfaces() {
  const d = await apiSurfaceList({ limit: 30000 });
  return (d.surfaces || []).map(s => ({
    paleo:   s.surface,
    tl:      translit(s.surface),
    count:   s.count,
    sn:      s.strongs || '',
    root:    s.root,
    type:    'surface',
  }));
}

// ── Non-Hebrew loaders ────────────────────────────────────────────────────
// Each returns the same {word, tl, def, count, type} shape as Hebrew, just
// with `word` instead of `paleo` so the row renderer can pick the right
// glyph path. For "Greek" we use GNT as the canonical source for the curated
// JSON (since LXX+GNT share greek-lexicon.json), but we pull surfaces from
// both LXX and GNT combined.
async function loadCurated(src) {
  const d = await apiSourceLexiconCurated(src);
  return (d.entries || []).map(e => ({ ...e, type: 'lexicon' }));
}
async function loadSrcRoots(src) {
  const d = await apiSourceLexiconRoots(src);
  return (d.entries || []).map(e => ({ ...e, type: 'root' }));
}
async function loadSrcSurfaces(src) {
  // For Greek lang we want LXX+GNT combined; for Ge'ez just GEZ. The merge
  // sums counts per word_norm so the same surface across LXX and GNT shows
  // total occurrences. NOTE: Greek mode loads from both LXX and GNT.
  const sources = src === 'GREEK' ? ['LXX', 'GNT'] : [src];
  const datasets = await Promise.all(sources.map(s => apiSourceLexiconList(s, { limit: 60000 })));
  const merged = new Map();
  for (const d of datasets) {
    for (const s of d.surfaces || []) {
      const existing = merged.get(s.word_norm);
      if (existing) {
        existing.count += s.count;
      } else {
        merged.set(s.word_norm, {
          word:      s.surface,
          word_norm: s.word_norm,
          tl:        s.transliteration || '',
          root:      s.root || '',
          count:     s.count,
          curated:   s.curated,
          type:      'surface',
        });
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.word_norm.localeCompare(b.word_norm));
}

const getPaleo = e => e.paleo || e.root || e.surface || '';
const getWord  = e => e.word  || e.paleo || e.root || e.surface || '';

// ─────────────────────────────────────────────────────────────────────────────
// WORD ROW
// ─────────────────────────────────────────────────────────────────────────────
function WordRow({ entry, tab, lang, src }) {
  const isHebrew  = lang === 'hebrew';
  const isRoot    = tab === 'roots';
  const isSurface = tab === 'surfaces';

  // Display text — paleo for Hebrew, raw word for others
  const paleo = getPaleo(entry);
  const word  = getWord(entry);
  const tl    = entry.tl || (isHebrew ? translit(paleo) : '');
  const def   = entry.def || '';
  const sn    = entry.sn  || '';
  const root  = entry.root || '';

  // Destination link
  let href;
  if (isHebrew) {
    if (isRoot) {
      href = `/roots?root=${encodeURIComponent(paleo)}`;
    } else if (isSurface) {
      const qs = new URLSearchParams({ word: paleo });
      if (sn) qs.set('sn', sn);
      href = `/surfaces?${qs.toString()}`;
    } else {
      href = `/roots?root=${encodeURIComponent(paleo)}`;
    }
  } else {
    href = null;
  }

  // Hebrew glyph rendering — keep exactly as before
  const paleoHtml = useMemo(
    () => isHebrew ? paleoWordFlex(paleo, 'var(--glyph-word)') : null,
    [paleo, isHebrew]
  );

  return (
    <div className="lex-row">
      {isHebrew ? (
        <div
          className="lex-row-paleo"
          dangerouslySetInnerHTML={{ __html: paleoHtml }}
        />
      ) : (
        <div className={`lex-row-paleo lex-row-${lang}`}>{word}</div>
      )}
      <div className="lex-row-body">
        {tl && <div className="lex-row-tl">{tl}</div>}
        {def && <div className="lex-row-def">{def}</div>}
        {isHebrew && entry.pos && <div className="lex-row-pos">{entry.pos}</div>}
        <div className="lex-row-meta">
          {entry.count != null && entry.count > 0 && (
            <span className="lex-count">{entry.count.toLocaleString()} occ.</span>
          )}
          {sn && <span className="lex-sn">{sn}</span>}
          {href && (
            <a href={href} className="lex-link">
              {isRoot ? 'view root ↗' : isSurface ? 'view surface ↗' : 'explore ↗'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LETTER SIDEBAR BUTTONS — single-glyph buttons that jump to a letter section
// ─────────────────────────────────────────────────────────────────────────────
function LetterButton({ letter, lang, active, disabled, onClick }) {
  const isHebrew = !lang || lang === 'hebrew';
  const html = useMemo(
    () => isHebrew ? paleoCharNoMargin(letter, 'var(--glyph-btn)') : null,
    [letter, isHebrew]
  );
  if (isHebrew) {
    return (
      <button
        className={`lex-letter-btn ${active ? 'active' : ''}`}
        title={LETTER_NAMES[letter] || translit(letter)}
        disabled={disabled}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <button
      className={`lex-letter-btn lex-letter-btn-${lang} ${active ? 'active' : ''}`}
      title={letter}
      disabled={disabled}
      onClick={onClick}
    >{letter}</button>
  );
}

function AnchorHeader({ letter, lang }) {
  const isHebrew = !lang || lang === 'hebrew';
  const html = useMemo(
    () => isHebrew ? paleoCharNoMargin(letter, 'var(--glyph-anchor)') : null,
    [letter, isHebrew]
  );
  if (isHebrew) {
    return (
      <div
        className="lex-anchor"
        id={`lex-anchor-${letter}`}
        data-letter={letter}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <div
      className={`lex-anchor lex-anchor-${lang}`}
      id={`lex-anchor-${letter}`}
      data-letter={letter}
    >{letter}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function Lexicon() {
  usePageTitle(pageTitle('Lexicon'));
  const { theme, toggle: toggleTheme } = useTheme();
  const { mode: paleoMode, toggle: togglePaleoMode } = usePaleoMode();
  const [glyphSize] = useLocalStorageNumber('lex-glyph-size', 28, '--glyph-word');
  const isMobile = useIsMobile(600);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── language state — from URL, default to hebrew ──────────────────────────
  const lang = LANGS.find(l => l.key === searchParams.get('lang'))?.key || 'hebrew';
  const langDef = LANGS.find(l => l.key === lang);
  const tabsForLang = lang === 'hebrew' ? TABS_HEBREW : TABS_OTHER;
  const setLang = next => {
    if (next === lang) return;
    const sp = new URLSearchParams(searchParams);
    sp.set('lang', next);
    // If current tab doesn't exist for the new language, fall back to lexicon
    const newTabs = next === 'hebrew' ? TABS_HEBREW : TABS_OTHER;
    if (!newTabs.find(t => t.key === sp.get('tab'))) sp.delete('tab');
    setSearchParams(sp);
  };

  // ── tab state, persisted across sessions but URL-overridable ───────────────
  const tabFromUrl = searchParams.get('tab');
  const [tab, setTab] = useState(
    () => tabFromUrl || sessionStorage.getItem(`lex-last-tab-${lang}`) || 'lexicon'
  );
  // Reset tab if lang changes and current tab isn't valid for the new lang
  useEffect(() => {
    if (!tabsForLang.find(t => t.key === tab)) setTab('lexicon');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [activeLetter, setActiveLetter] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── "My Lexicon" — local-only upload/override panel ───────────────────────
  // Admins (logged in) never need this — they edit the published files
  // directly and everyone sees it. Everyone else can upload a JSON file in
  // the same shape as lexicon.json / homographs.json / definitions.json;
  // it's stored only in this browser (localOverlay.js) and layered over the
  // published lexicon for THEM only. reloadNonce forces the data-fetch effect
  // below to re-run after an upload/remove so the list reflects it immediately.
  const [isAdmin, setIsAdmin] = useState(null);
  const [myLexOpen, setMyLexOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)); }, []);

  // ── data fetch every time the tab OR language changes ─────────────────────
  useEffect(() => {
    let cancelled = false;
    sessionStorage.setItem(`lex-last-tab-${lang}`, tab);
    setLoading(true); setErr(null); setEntries([]);
    (async () => {
      try {
        let data;
        if (lang === 'hebrew') {
          if      (tab === 'lexicon')    data = await loadLexiconEntries();
          else if (tab === 'dictionary') data = await loadDictionaryEntries();
          else if (tab === 'roots')      data = await loadRoots();
          else if (tab === 'surfaces')   data = await loadSurfaces();
        } else {
          const src = langDef.src;
          if      (tab === 'lexicon')  data = await loadCurated(src);
          else if (tab === 'roots')    data = await loadSrcRoots(src);
          else if (tab === 'surfaces') data = await loadSrcSurfaces(lang === 'greek' ? 'GREEK' : src);
        }
        if (cancelled) return;
        setEntries(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, lang, langDef, reloadNonce]);

  // ── derived: filtered list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => {
      const w  = getWord(e);
      const tl = (e.tl || (lang === 'hebrew' ? translit(getPaleo(e)) : '')).toLowerCase();
      return w.toLowerCase().includes(q)
          || tl.includes(q)
          || (e.def || '').toLowerCase().includes(q)
          || (e.sn  || '').toLowerCase().includes(q)
          || (e.root || '').toLowerCase().includes(q);
    });
  }, [entries, query, lang]);

  // ── derived: which first-letters are present? ─────────────────────────────
  const letterAlphabet = lang === 'hebrew' ? PALEO_LETTERS
                       : lang === 'greek'  ? GREEK_LETTERS
                       : GEEZ_LETTERS;
  const lettersPresent = useMemo(() => {
    const s = new Set();
    for (const e of filtered) {
      const w = getWord(e);
      // For Hebrew use first paleo char; for Greek lowercase first char;
      // for Ge'ez we need to map the first syllable to its consonant-row base
      const first = [...w][0];
      if (!first) continue;
      if (lang === 'hebrew' && PALEO_LETTERS.includes(first))   s.add(first);
      else if (lang === 'greek' && first >= 'α' && first <= 'ω') s.add(first.toLowerCase());
      else if (lang === 'geez') {
        // Map any Ethiopic syllable to its base 1st-order consonant
        const code = first.codePointAt(0);
        if (code >= 0x1200 && code <= 0x137F) {
          const base = String.fromCodePoint(code - (code % 8));
          if (GEEZ_LETTERS.includes(base)) s.add(base);
        }
      }
    }
    return s;
  }, [filtered, lang]);

  // For Greek, normalize letters case-insensitively. For Ge'ez, group by base
  // consonantal row.
  function firstLetterOf(e) {
    const w = getWord(e);
    const c = [...w][0];
    if (!c) return null;
    if (lang === 'hebrew') return PALEO_LETTERS.includes(c) ? c : null;
    if (lang === 'greek') {
      const lo = c.toLowerCase();
      return lo >= 'α' && lo <= 'ω' ? lo : null;
    }
    if (lang === 'geez') {
      const code = c.codePointAt(0);
      if (code >= 0x1200 && code <= 0x137F) {
        const base = String.fromCodePoint(code - (code % 8));
        return GEEZ_LETTERS.includes(base) ? base : null;
      }
    }
    return null;
  }

  // ── group entries by first letter for anchor placement ────────────────────
  const grouped = useMemo(() => {
    const out = [];
    let lastLetter = null;
    for (const e of filtered) {
      const first = firstLetterOf(e);
      if (first && first !== lastLetter) {
        out.push({ kind: 'anchor', letter: first });
        lastLetter = first;
      }
      out.push({ kind: 'row', entry: e });
    }
    return out;
  }, [filtered]);

  // ── snap-to-letter: scroll list to the given letter's anchor ──────────────
  // BUG IN ORIGINAL: the legacy code used getBoundingClientRect().top relative
  // to the list-wrap, then added that to scrollTop. Because the anchor is
  // position:sticky, when you snapped to a LATER letter the anchor stayed
  // pinned at top:0. Snapping BACK to an EARLIER letter then read
  // anchor.getBoundingClientRect().top from the visible (sticky) position of
  // the LATER letter's anchor, which was 0 — so scrollTop += 0 = no movement,
  // and the user appeared "stuck".
  //
  // FIX: use anchor.offsetTop within the scrolling container. offsetTop is
  // computed from the static layout position — totally independent of
  // whether ANY anchor is currently sticking — so it always gives the
  // correct target scroll position, regardless of which letter we're
  // jumping from or to.
  const listRef = useRef(null);
  // 2026-08-15: `behavior: 'smooth'` here was hanging the tab for 20-30+
  // seconds on a real jump (reproduced via Claude in Chrome) — this list is
  // NOT virtualized (loadSurfaces alone pulls up to 30k entries into plain
  // DOM nodes, see its own comment above), so a smooth scroll asks the
  // browser to paint every intermediate frame of a multi-thousand-node
  // layout instead of one jump. That's what read as "doesn't scroll up for
  // earlier letters" — a backward jump from near the bottom is often a
  // longer distance than whatever forward jump happened to be tried first,
  // so it was more likely to run long enough to look completely stuck
  // rather than just slow. `offsetTop` itself was already correct (see the
  // FIX note above); only the animation was the problem. Instant scroll
  // sidesteps the per-frame repaint cost entirely — a real fix for large
  // lists is virtualizing .lex-list, which is a bigger change than this.
  const jumpToLetter = useCallback(letter => {
    setActiveLetter(letter);
    const list = listRef.current;
    if (!list) return;
    const anchor = list.querySelector(`#lex-anchor-${letter}`);
    if (!anchor) return;
    // offsetTop is relative to the nearest positioned ancestor. The list
    // container has position:relative for exactly this reason.
    list.scrollTo({ top: anchor.offsetTop, behavior: 'auto' });
  }, []);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  // ── update the active letter automatically as user scrolls ────────────────
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const anchors = list.querySelectorAll('.lex-anchor');
        let current = null;
        const scrollTop = list.scrollTop;
        // The anchor whose offsetTop is closest to but not past scrollTop+1
        for (const a of anchors) {
          if (a.offsetTop <= scrollTop + 4) current = a.dataset.letter;
          else break;
        }
        if (current && current !== activeLetter) setActiveLetter(current);
      });
    };
    list.addEventListener('scroll', onScroll, { passive: true });
    return () => list.removeEventListener('scroll', onScroll);
  }, [activeLetter, grouped]);

  // ── handler for tab switch ────────────────────────────────────────────────
  const switchTab = next => {
    if (next === tab) return;
    setTab(next);
    setQuery('');
    setActiveLetter(null);
    // Scroll back to top of the list (next render will populate it).
    setTimeout(() => listRef.current?.scrollTo({ top: 0 }), 0);
  };

  return (
    <div className="lex-page">
      {/* ── TOP BAR ────────────────────────────────────────────────────────── */}
      <header className="lex-topbar">
        <div className="lex-topbar-left">
          <Link to="/landing" className="logo-btn" aria-label="Home">𐤀𐤁</Link>
          <div className="nav-divider" />
          <span className="lex-page-title">Lexicon</span>
        </div>
        <div className="lex-topbar-right">
          {isAdmin === false && (
            <button
              className="icon-btn"
              onClick={() => setMyLexOpen(o => !o)}
              title="My Lexicon — upload your own lexicon files, only visible to you"
              aria-label="My Lexicon"
              style={{ fontSize: 14 }}
            >📤</button>
          )}
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title="Toggle theme"
            aria-label="Toggle theme"
          >{theme === 'dark' ? '☀' : '☾'}</button>
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(o => !o)}
            title="Display options"
            aria-label="Display options"
            style={{ fontSize: 14 }}
          >⚙</button>
        </div>
      </header>

      {/* ── LANGUAGE TAB BAR ─────────────────────────────────────────────── */}
      <nav className="lex-langbar" aria-label="Language">
        {LANGS.map(l => (
          <button
            key={l.key}
            className={`lex-langtab ${lang === l.key ? 'active' : ''}`}
            onClick={() => setLang(l.key)}
          >{l.label}</button>
        ))}
      </nav>

      {/* ── TAB BAR (horizontal scroll on mobile) ─────────────────────────── */}
      <nav className="lex-tabbar" aria-label="Tabs">
        {tabsForLang.map(t => (
          <button
            key={t.key}
            className={`lex-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => switchTab(t.key)}
          >{t.label}</button>
        ))}
      </nav>

      {/* ── MAIN PANEL: sidebar + right column ──────────────────────────── */}
      <div className="lex-panel">

        {/* Letter jump sidebar — alphabet depends on language */}
        <aside className="lex-sidebar" aria-label="Letter index">
          {letterAlphabet.map(ltr => (
            <LetterButton
              key={ltr}
              letter={ltr}
              lang={lang}
              active={activeLetter === ltr}
              disabled={!lettersPresent.has(ltr)}
              onClick={() => jumpToLetter(ltr)}
            />
          ))}
          <div className="lex-sidebar-spacer" />
          <button
            className="lex-back-top"
            onClick={scrollToTop}
            title="Back to top"
            aria-label="Back to top"
          >↑</button>
        </aside>

        {/* Right column: search + scrollable list */}
        <div className="lex-rightcol">
          <div className="lex-search">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Filter ${langDef.label} words…`}
              autoComplete="off"
              spellCheck="false"
              aria-label="Search lexicon"
            />
            {query && (
              <button className="lex-search-clear" onClick={() => setQuery('')} aria-label="Clear">✕</button>
            )}
          </div>

          <div className="lex-list" ref={listRef}>
            {loading && (
              <div className="lex-state-msg">
                <span className="spin">◌</span> Loading…
              </div>
            )}
            {err && !loading && (
              <div className="lex-state-msg">
                ⚠ Failed to load
                <br /><small style={{ color: 'var(--red)' }}>{err}</small>
              </div>
            )}
            {!loading && !err && grouped.length === 0 && (
              <div className="lex-state-msg">
                No {langDef.label} {tab === 'lexicon' ? 'lexicon' : tab} entries{query ? ` matching "${query}"` : ''}.
              </div>
            )}
            {!loading && !err && grouped.map((item, i) => {
              if (item.kind === 'anchor')
                return <AnchorHeader key={`a-${item.letter}-${i}`} letter={item.letter} lang={lang} />;
              const e = item.entry;
              const key = `${getWord(e)}__${e.pos || ''}__${i}`;
              return <WordRow key={key} entry={e} tab={tab} lang={lang} src={langDef.src} />;
            })}
          </div>
        </div>
      </div>

      {/* ── SETTINGS PANEL (bottom-sheet on mobile) ────────────────────── */}
      <DisplayPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <div className="dp-row">
          <span>Paleo view</span>
          <button
            className={`dp-pill ${paleoMode === 'mobile' ? 'active' : ''}`}
            onClick={togglePaleoMode}
          >{paleoMode === 'mobile' ? '📱 Mobile' : '🖥 Desktop'}</button>
        </div>
        <div className="dp-divider" />
        <GlyphSizeSlider />
      </DisplayPanel>

      {/* ── MY LEXICON PANEL (local-only uploads, non-admins only) ───────── */}
      <DisplayPanel open={myLexOpen} onClose={() => setMyLexOpen(false)} title="My Lexicon">
        <MyLexiconPanel onChange={() => setReloadNonce(n => n + 1)} />
      </DisplayPanel>
    </div>
  );
}

// ── "My Lexicon" — upload a JSON file matching lexicon.json / homographs.json
// / definitions.json to patch entries for THIS browser only. Nothing here ever
// reaches the server; see src/lib/localOverlay.js for the storage + merge
// mechanism and server/server.js's READ_ONLY mode for the server-side half of
// "only I can touch the published files."
const OVERRIDE_TARGETS = [
  { name: 'lexicon',     label: 'Lexicon (lexicon.json)' },
  { name: 'homographs',  label: 'Homographs (homographs.json)' },
  { name: 'definitions', label: 'Dictionary (definitions.json)' },
];
function MyLexiconPanel({ onChange }) {
  const [meta, setMeta] = useState({});   // { [name]: { filename, uploadedAt, count } | null }
  const [busy, setBusy] = useState(null); // name currently uploading, or null
  const [error, setError] = useState(null);
  const fileInputs = useRef({});

  const refresh = useCallback(async () => {
    const next = {};
    for (const { name } of OVERRIDE_TARGETS) {
      const ov = await getLexiconOverride(name);
      next[name] = ov ? { filename: ov.filename, uploadedAt: ov.uploadedAt, count: Object.keys(ov.data || {}).length } : null;
    }
    setMeta(next);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleFile = async (name, file) => {
    if (!file) return;
    setBusy(name); setError(null);
    try {
      const text = await file.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error('Not valid JSON.'); }
      const check = validateLexiconShape(data);
      if (!check.ok) throw new Error(check.error);
      await saveLexiconOverride(name, data, { filename: file.name });
      await refresh();
      onChange?.();
    } catch (e) {
      setError(`${name}: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (name) => {
    await resetLexiconOverride(name);
    await refresh();
    onChange?.();
  };

  return (
    <div className="my-lex-panel">
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
        Upload a JSON file in the same shape as the published lexicon files to patch entries —
        just for you. It's saved only in this browser, is layered over the published lexicon,
        and never reaches the server. Upload only the entries you want to change; everything
        else still comes from the published lexicon.
      </p>
      {error && (
        <div className="lex-state-msg" style={{ marginBottom: 8 }}>
          <small style={{ color: 'var(--red)' }}>⚠ {error}</small>
        </div>
      )}
      {OVERRIDE_TARGETS.map(({ name, label }) => {
        const m = meta[name];
        return (
          <div className="dp-row" key={name} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>{label}</span>
            {m ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span>✓ {m.filename || 'uploaded'} — {m.count} entr{m.count === 1 ? 'y' : 'ies'}</span>
                <button className="dp-pill" onClick={() => handleRemove(name)}>Remove</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  ref={el => { fileInputs.current[name] = el; }}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(name, e.target.files?.[0])}
                />
                <button
                  className="dp-pill"
                  disabled={busy === name}
                  onClick={() => fileInputs.current[name]?.click()}
                >{busy === name ? 'Uploading…' : 'Upload JSON…'}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Extracted because the slider needs its own state for the controlled input
function GlyphSizeSlider() {
  const [size, setSize] = useLocalStorageNumber('lex-glyph-size', 28, '--glyph-word');
  return (
    <div className="font-slider-group">
      <label>
        <span>𐤀 Glyph size</span>
        <span>{size}px</span>
      </label>
      <input
        type="range"
        className="font-slider"
        min={16} max={60} step={1}
        value={size}
        onChange={e => setSize(e.target.value)}
      />
    </div>
  );
}
