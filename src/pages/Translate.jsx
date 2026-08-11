import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { paleoToSVG } from '../lib/paleoGlyphs.js';
import { useToast } from '../components/Toast.jsx';
import {
  apiTransProgress, apiTransChapter, apiTransVerse,
  apiTransSaveVerse, apiTransLink, apiTransUnlink, apiTransUpdateLink,
  apiTokens, apiBookOrder,
} from '../lib/api.js';
import {
  getAdminStatus, mergeVerseWithLocal, getLocalVerse, saveLocalVerse, resetLocalVerse,
  getLocalLinks, addLocalLink, deleteLocalLink, setLocalLinksOverride, resetLocalLinksOverride,
  resetAllLocal, hasAnyLocalOverrides,
} from '../lib/localOverlay.js';
import { BOOK_NAMES } from '../lib/books.js';
import { buildBookSlugs, resolveBookParam, bookToParam } from '../lib/bookSlug.js';
import { usePageTitle, formatRef } from '../hooks/usePageTitle.js';
import './Translate.css';

// Util — JSON-parse-with-fallback
const parseJ = (v, fb) => Array.isArray(v) ? v : (() => { try { return JSON.parse(v); } catch { return fb; } })();

// Token css class → CSS variable color
const PART_VAR = {
  root: '--c-root', conj: '--c-conj', art: '--c-art', prep: '--c-prep',
  pfm:  '--c-pfm',  vbs:  '--c-vbs',  prs: '--c-prs', nme:  '--c-nme',
  vbe:  '--c-vbe',  uvf:  '--c-uvf',
  // morphology subclasses fall back to their family
};
function partColor(css) {
  if (!css) return 'var(--c-root)';
  for (const key of Object.keys(PART_VAR)) if (css.startsWith(key)) return `var(${PART_VAR[key]})`;
  return 'var(--c-root)';
}

function tokenTrans(t) {
  if (!t.components?.length) return t.translation || '';
  // Each component renders its translation; non-root parts get [bracketed]
  // labels for visual distinction, matching the original layout. Empty
  // translations are filtered so prefixes without glosses don't show stray
  // empty brackets.
  return t.components.map(c => {
    const tr = c.translation || c.translit || '';
    if (!tr) return null;
    return c.css === 'root' ? tr : `[${tr}]`;
  }).filter(Boolean).join(' · ');
}

// Full transliterated word — every component's own translit, concatenated in
// order (prefix + root + suffix), same additive-only/no-eliding rule as the
// rest of the app: this must never be shorter than "prefix + root + suffix"
// letters just because a component lacks a translation. Used for the PALEO
// SOURCE panel so it reads as an actual word ("LaAsap"), not just glyphs.
function tokenWordText(t) {
  if (!t.components?.length) return t.word_raw || '';
  return t.components.map(c => c.translit || '').join('') || t.word_raw || '';
}

function dedupeLinks(links) {
  const seen = new Map();
  for (const l of links) {
    const key = JSON.stringify([...l.token_ordinals].sort()) + '|' + JSON.stringify([...l.english_indices].sort());
    if (!seen.has(key) || l.id > seen.get(key).id) seen.set(key, l);
  }
  return [...seen.values()].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
}

function hydrateLinks(rawLinks) {
  return rawLinks.map(l => ({
    ...l,
    english_indices: parseJ(l.english_indices, []),
    token_ordinals:  parseJ(l.token_ordinals,  []),
  }));
}

function findPhraseIndices(phrase, words) {
  const ph = phrase.trim().split(/\s+/);
  const clean = w => w.replace(/[,\.!?;:()]+/g, '').toLowerCase();
  for (let i = 0; i <= words.length - ph.length; i++) {
    if (words.slice(i, i + ph.length).map(clean).join(' ') === ph.map(clean).join(' '))
      return Array.from({ length: ph.length }, (_, k) => i + k);
  }
  return [];
}

// Link color resolution mirrors the original: derive the color from the
// LINKED HEBREW token's primary part-of-speech (or the explicit component_hint
// part if the link points at a specific component). This is what makes a
// noun-link green and a verb-link red consistently across the linker grid and
// every existing-link badge, rather than rotating through arbitrary colors.
// The actual color values are CSS variables (--c-root, --c-prep, etc) defined
// in tokens.css; we use the same fallback chain everywhere in this file.
const tokenPrimaryPart = (token) => {
  if (!token?.components?.length) return 'root';
  return token.components.find(c => c.css === 'root')?.css || token.components[0]?.css || 'root';
};
const lColorForTokens = (link, tokens) => {
  if (!link) return 'var(--c-root)';
  if (link.component_hint && link.component_hint.includes(':')) {
    return partColor(link.component_hint.split(':')[1] || 'root');
  }
  const ord = link.token_ordinals?.[0];
  if (ord == null) return 'var(--c-root)';
  const tok = tokens?.find(t => t.token_ordinal === ord);
  return partColor(tokenPrimaryPart(tok));
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATE PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function Translate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();

  // ── admin vs. local-only editing ────────────────────────────────────────────
  // Admins (logged in — see server/server.js's /admin/login) write straight
  // through to the server, exactly like before this existed. Everyone else's
  // saves/links go to this browser's local overlay (src/lib/localOverlay.js)
  // instead — nothing they do ever reaches your server. `isAdmin` starts null
  // (unknown) until the one-time /admin/session check resolves.
  const [isAdmin, setIsAdmin] = useState(null);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  useEffect(() => {
    getAdminStatus().then(s => setIsAdmin(!!s.isAdmin));
    hasAnyLocalOverrides().then(setHasLocalEdits).catch(() => {});
  }, []);

  const [progress, setProgress] = useState(null);
  const [masterBooks, setMasterBooks] = useState([]);
  const [activeBook, setActiveBook] = useState(() => +searchParams.get('book') || null);
  const [activeChapter, setActiveChapter] = useState(() => +searchParams.get('chapter') || null);
  const [activeVerse, setActiveVerse] = useState(() => {
    const raw = searchParams.get('verse');
    return raw != null && raw !== '' ? +raw : null;
  });
  const [openChapterMap, setOpenChapterMap] = useState({}); // { "bookId:chapter": verseListData }
  const [verseData, setVerseData] = useState(null); // { status, text, rich_text, links, tokens }
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  // Mobile only: collapse the Books + Chapter pickers so the editor gets the
  // screen. State (activeBook/chapter/verse) is untouched, so Save still targets
  // the right verse whether the pickers are showing or not.
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [selEn, setSelEn] = useState(() => new Set());
  const [selHeb, setSelHeb] = useState(() => new Set());

  // ── Multi-language linking ──────────────────────────────────────────────────
  // The English translation is one-per-verse and shared across source languages.
  // `lang` is the source language we're currently linking against; `langs` is the
  // set of corpus languages that actually contain this verse; `srcTokens` holds
  // the selected language's tokens (BHS keeps its rich Paleo path; other scripts
  // render generically with correct direction). Switching language re-fetches the
  // links scoped to it — you re-link per language, as expected.
  const [lang, setLang]       = useState('BHS');
  const [langs, setLangs]     = useState([{ id: 'BHS', label: 'Hebrew (BHS)', script: 'paleo-hebrew', dir: 'rtl' }]);
  const [srcTokens, setSrcTokens] = useState(null);   // non-BHS source tokens, or null for BHS
  // The edition the LOADED tokens actually came from, as reported by the server.
  // Links are authored against this, never against the `lang` picker.
  const [tokenSource, setTokenSource] = useState('BHS');
  const langMeta = langs.find(l => l.id === lang) || { dir: 'rtl', script: 'paleo-hebrew' };
  const isBHS = lang === 'BHS';

  // mode = 'edit' | 'view'.  viewLayout = 'side' | 'english'.
  // hoveredLinkId is for cross-column hover highlights in both edit and view modes.
  const [mode, setMode] = useState('edit');
  const [viewLayout, setViewLayout] = useState('side');
  const [hoveredLinkId, setHoveredLinkId] = useState(null);

  // Read-only overlays: full chapter view (all translated verses + paleo side-
  // by-side) and corpus overview (translation progress per book). Both are
  // backstops to the live editor — they read but never mutate.
  const [chvOpen, setChvOpen] = useState(false);
  const [chvLayout, setChvLayout] = useState('side');
  const [chvData, setChvData] = useState(null); // array of fully-merged verse details
  const [ovOpen, setOvOpen] = useState(false);

  // ── INIT ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiTransProgress().then(setProgress).catch(e => toast('Progress load failed: ' + e.message, 'err'));
  }, [toast]);
  useEffect(() => { apiBookOrder().then(setMasterBooks).catch(() => setMasterBooks([])); }, []);

  // Slug ↔ canon_id, from the master book list (same input + slugify as every
  // other reader, so a book's slug is identical app-wide). Numeric ?book still works.
  // Tolerate whichever id field the book-order API returns (id / book_id / canon_id)
  // — if this comes back empty, slug URLs like ?book=genesis can never resolve and
  // the page strands on its empty state.
  const { slugToId, idToSlug } = useMemo(
    () => buildBookSlugs((masterBooks || []).map(mb => {
      const id = mb.id ?? mb.book_id ?? mb.canon_id;
      return { id, name: mb.name || BOOK_NAMES[id] };
    })),
    [masterBooks]
  );

  const setUrl = useCallback((b, c, v) => {
    const p = {};
    if (b) p.book = bookToParam(b, idToSlug);
    if (c) p.chapter = String(c);
    if (v != null) p.verse = String(v);
    setSearchParams(p, { replace: true });
  }, [setSearchParams, idToSlug]);

  // ── BOOK / CHAPTER PANE ───────────────────────────────────────────────────
  const books = progress?.books || [];
  const activeBookData = books.find(b => b.book_id === activeBook);

  // ── browser tab ────────────────────────────────────────────────────────────
  // The Studio never named itself, so several open tabs were indistinguishable.
  // Reference first ("1 Adam and Eve 1:12 — Studio") so a narrow tab still reads.
  usePageTitle(
    formatRef(activeBookData?.name || (activeBook ? BOOK_NAMES[activeBook] : ''), activeChapter, activeVerse),
    'Studio'
  );

  const selectBook = useCallback(async (bookId) => {
    setActiveBook(bookId);
    setUrl(bookId, null, null);
  }, [setUrl]);

  const openChapter = useCallback(async (bookId, chapter) => {
    const key = `${bookId}:${chapter}`;
    setActiveChapter(chapter);
    setUrl(bookId, chapter, null);
    if (!openChapterMap[key]) {
      try {
        const data = await apiTransChapter(bookId, chapter);
        setOpenChapterMap(m => ({ ...m, [key]: data.verses || [] }));
      } catch (e) { toast('Chapter load failed: ' + e.message, 'err'); }
    }
  }, [setUrl, openChapterMap, toast]);

  // ── LOAD VERSE ────────────────────────────────────────────────────────────
  const loadVerse = useCallback(async (bookId, chapter, verse, useLang) => {
    const L = useLang || lang;
    setActiveBook(bookId);
    setActiveChapter(chapter);
    setActiveVerse(verse);
    setNavCollapsed(true);   // hand the screen to the editor (mobile); no-op on desktop
    setSelEn(new Set()); setSelHeb(new Set());
    setUrl(bookId, chapter, verse);
    try {
      // English + links, scoped to the chosen source language (direct fetch so we
      // can pass &lang; the shared English is identical across languages).
      let data = await fetch(`/api/translate/verse?book=${bookId}&chapter=${chapter}&verse=${verse}&lang=${encodeURIComponent(L)}`)
        .then(r => r.json());
      // WHICH EDITION THESE TOKENS ARE. The server picks the token table by BOOK
      // ID, not by the language picker — an NT book always reads tokens_nt. So
      // the picker could say 'BHS' (its default) while the tokens on screen were
      // HEB, and every link authored on a NT verse was stored as lang='BHS'.
      // /parallel then asks for lang='HEB' and finds nothing. Record what the
      // server used instead of re-deriving it here.
      const effectiveTokenSource = data.token_source || L;
      setTokenSource(effectiveTokenSource);
      // Non-admins: overlay this browser's local edits (if any) on top of the
      // server's published verse/links. Admins always see exactly what's
      // published, same as before local overrides existed. The verse TEXT has
      // no language dimension (shared across editions, see saveLocalVerse);
      // links are scoped by effectiveTokenSource, matching the server's own
      // per-edition link scoping (NOT the raw language-picker value `L`).
      const { isAdmin: admin } = await getAdminStatus();
      let localLinks = null;
      if (!admin) {
        const [localVerse, ll] = await Promise.all([
          getLocalVerse(bookId, chapter, verse),
          getLocalLinks(bookId, chapter, verse, effectiveTokenSource),
        ]);
        if (localVerse) data = mergeVerseWithLocal(data, localVerse);
        localLinks = ll; // null = no local override for links; [] = locally cleared
      }

      let tokens;
      if (L === 'BHS') {
        // Hebrew keeps its rich parsed-component Paleo path.
        const parsedTokens = await apiTokens(bookId, chapter).catch(() => []);
        const parsedByKey = {};
        for (const pt of parsedTokens || []) {
          const v = pt.verse, o = pt.token_ordinal;
          if (v != null && o != null) parsedByKey[`${v}:${o}`] = pt;
        }
        const verseNum = +verse;
        tokens = (data.tokens || []).map(t => {
          const p = parsedByKey[`${verseNum}:${t.token_ordinal}`];
          if (p?.components?.length) return { ...t, components: p.components, strongs: p.strongs || t.strongs };
          return t;
        });
        setSrcTokens(null);
      } else {
        // Any other language: pull tokens from the reader's source endpoint (one
        // tokenizer, all scripts + glosses) and normalize to the link shape. The
        // token ordinal is 1-based position, matching how links store ordinals.
        const sv = await fetch(`/api/source/${encodeURIComponent(L)}/verse?book=${bookId}&chapter=${chapter}&verse=${verse}`)
          .then(r => r.ok ? r.json() : { tokens: [] }).catch(() => ({ tokens: [] }));
        tokens = (sv.tokens || []).map((t, i) => ({
          token_ordinal: t.ord ?? (i + 1),
          word_raw: t.word ?? '',
          gloss: t.gloss || '',
          strongs: t.strongs || '',
          lemma: t.lemma || '',
        }));
        setSrcTokens(tokens);
      }

      const enWords = (data.text || '').trim().split(/\s+/).filter(Boolean);
      // localLinks is null unless a non-admin has a local override for this verse's
      // links; when set (even to []), it replaces the server's link list entirely.
      const links = dedupeLinks(hydrateLinks(localLinks != null ? localLinks : (data.links || [])).map(l => {
        if (!l.english_indices?.length && l.english_phrase) {
          l.english_indices = findPhraseIndices(l.english_phrase, enWords);
        }
        return l;
      }));
      setVerseData({ ...data, tokens, links, localLinks: localLinks != null });
    } catch (e) { toast('Verse load failed: ' + e.message, 'err'); }
  }, [setUrl, toast, lang]);

  // Languages that actually contain the current verse — drives the picker.
  useEffect(() => {
    if (!activeBook || !activeChapter || activeVerse == null) return;
    let cancelled = false;
    fetch(`/api/translate/languages?book=${activeBook}&chapter=${activeChapter}&verse=${activeVerse}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !Array.isArray(d.languages)) return;
        const list = d.languages.length ? d.languages : [{ id: 'BHS', label: 'Hebrew (BHS)', script: 'paleo-hebrew', dir: 'rtl' }];
        setLangs(list);
        // Reload the verse ONCE the language list is known — always, not only when the
        // current language is unavailable.
        //
        // The bug: on first paint, loadVerse() runs from the URL-hydration effect
        // BEFORE this list resolves, so the source panel renders without the language
        // metadata (script, dir) it needs and comes up empty. If the current language
        // happened to be valid, the old code did nothing further, so the panel stayed
        // blank until a manual refresh warmed the cache. Refetching here costs one
        // request and makes the first paint correct.
        const nextLang = list.find(l => l.id === lang) ? lang : list[0].id;
        if (nextLang !== lang) setLang(nextLang);
        loadVerse(activeBook, activeChapter, activeVerse, nextLang);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeBook, activeChapter, activeVerse]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open from the URL (?book=&chapter=&verse=) exactly once — but only after
  // everything needed to resolve it is available, and WITHOUT committing "done"
  // until resolution truly succeeds. A slow book-list or slug map therefore can't
  // strand the page on the empty state; the effect simply retries when its inputs
  // fill in. This is what makes the Parallel / Hebrew Viewer → Studio hand-off
  // land on the right verse every time.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!progress) return;                                  // need the book/chapter data first
    const bp = searchParams.get('book');
    const cRaw = searchParams.get('chapter');
    const vRaw = searchParams.get('verse');
    const c  = cRaw != null && cRaw !== '' ? +cRaw : null;
    const v  = vRaw != null && vRaw !== '' ? +vRaw : null;
    if (!bp && !c && v == null) { hydratedRef.current = true; return; }   // nothing to open — stop trying
    // A slug needs the slug map; a number doesn't. Wait (don't lock) until resolvable.
    const isSlug = !!bp && !/^\d+$/.test(bp);
    if (isSlug && !Object.keys(slugToId).length) return;    // retry when the slug map fills
    const b = resolveBookParam(bp, slugToId, null);
    if (!b) return;                                         // unresolved yet — retry on next change
    hydratedRef.current = true;                             // commit only now that b is real
    setActiveBook(b);
    if (c && v != null)  openChapter(b, c).then(() => loadVerse(b, c, v));
    else if (c)  openChapter(b, c);
  }, [progress, slugToId, searchParams, openChapter, loadVerse]);

  // ── EDITOR ────────────────────────────────────────────────────────────────
  const editorRef = useRef(null);
  // When verse data arrives, set editor HTML once and focus it so the user can
  // start typing immediately. We sync manually instead of using React-controlled
  // contenteditable because the latter erases the caret on every keystroke.
  useEffect(() => {
    if (verseData && editorRef.current) {
      editorRef.current.innerHTML = verseData.rich_text || verseData.text || '';
      // Only autofocus when we're in edit mode — in view mode the user is
      // reading, not typing, and stealing focus jumps the scroll position.
      if (mode === 'edit') {
        editorRef.current.focus({ preventScroll: true });
        // Place caret at the end so typing appends naturally.
        const r = document.createRange();
        r.selectNodeContents(editorRef.current);
        r.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
      }
    }
    // mode is intentionally NOT in deps — we don't want to refocus on a mode flip
    // mid-edit. Refocus only happens when the verse identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verseData?.book_id, verseData?.chapter, verseData?.verse]);

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const saveVerse = useCallback(async (overrides = {}) => {
    if (!verseData) return;
    setSaveState('saving');
    const el = editorRef.current;
    const rich_text = el ? el.innerHTML : '';
    // Extract plain text from rich content
    const plainTmp = document.createElement('div');
    plainTmp.innerHTML = rich_text;
    const text = plainTmp.textContent || '';
    const status = overrides.status ?? verseData.status;
    try {
      const { isAdmin: admin } = await getAdminStatus();
      if (admin) {
        await apiTransSaveVerse({ book_id: activeBook, chapter: activeChapter, verse: activeVerse, status, text, rich_text });
      } else {
        // Local-only: never reaches the server. Persisted in THIS browser only.
        // No lang here — the translation is shared across editions, same as
        // the server's own (book_id, chapter, verse) primary key.
        await saveLocalVerse(activeBook, activeChapter, activeVerse, { text, rich_text, status });
        setHasLocalEdits(true);
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1400);
      // Update verse data + chapter map preview
      setVerseData(d => d ? { ...d, text, rich_text, status, local: !admin } : d);
      const key = `${activeBook}:${activeChapter}`;
      setOpenChapterMap(m => ({
        ...m,
        [key]: (m[key] || []).map(v =>
          v.verse === activeVerse
            ? { ...v, text, status }
            : v
        ),
      }));
    } catch (e) {
      setSaveState('error');
      toast('Save failed: ' + e.message, 'err');
    }
  }, [verseData, activeBook, activeChapter, activeVerse, toast]);

  // Discard this browser's local edit for the CURRENT verse (text + status) and
  // reload straight from the server's published version. Local link overrides
  // for the verse are untouched — see resetLinksToPublished below for those.
  const resetVerseToPublished = useCallback(async () => {
    if (!verseData) return;
    await resetLocalVerse(activeBook, activeChapter, activeVerse);
    await loadVerse(activeBook, activeChapter, activeVerse, lang);
    toast('Reverted to the published verse', 'ok');
  }, [verseData, activeBook, activeChapter, activeVerse, lang, loadVerse, toast]);

  const resetLinksToPublished = useCallback(async () => {
    if (!verseData) return;
    // tokenSource, not lang — links are scoped by edition, see loadVerse.
    await resetLocalLinksOverride(activeBook, activeChapter, activeVerse, tokenSource);
    await loadVerse(activeBook, activeChapter, activeVerse, lang);
    toast('Links reverted to published', 'ok');
  }, [verseData, activeBook, activeChapter, activeVerse, lang, tokenSource, loadVerse, toast]);

  // Global "pull latest": discard every local override in this browser
  // (translations, links, lexicons — see localOverlay.js) and reload.
  const pullLatest = useCallback(async () => {
    if (!confirm('Discard ALL your local edits in this browser (translations, links, and any uploaded lexicon) and go back to what\'s published? This cannot be undone.')) return;
    await resetAllLocal();
    setHasLocalEdits(false);
    if (activeBook && activeChapter && activeVerse != null) await loadVerse(activeBook, activeChapter, activeVerse, lang);
    toast('Local edits discarded — showing the published version', 'ok');
  }, [activeBook, activeChapter, activeVerse, lang, loadVerse, toast]);

  // Ctrl/Cmd+S → save the current verse. Listens on the editor itself so this
  // only fires when the user is actually editing (won't fight the browser-level
  // save shortcut from elsewhere on the page). We capture the latest saveVerse
  // closure in a ref so the listener doesn't need to be re-bound on every
  // re-render (saveVerse is created fresh whenever any of its deps change).
  const saveVerseRef = useRef(saveVerse);
  useEffect(() => { saveVerseRef.current = saveVerse; }, [saveVerse]);
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !verseData) return;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveVerseRef.current?.();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [verseData?.book_id, verseData?.chapter, verseData?.verse]);

  const setStatus = useCallback(async (newStatus) => {
    saveVerse({ status: newStatus });
  }, [saveVerse]);

  // ── LINKER ────────────────────────────────────────────────────────────────
  const enWords = useMemo(
    () => (verseData?.text || '').trim().split(/\s+/).filter(Boolean),
    [verseData?.text]
  );

  const tokens = verseData?.tokens || [];
  const links  = verseData?.links  || [];

  const lForEn  = idx => links.find(l => l.english_indices?.includes(idx));
  const lForOrd = ord => links.find(l => l.token_ordinals?.includes(ord));

  // Hebrew selection key parser. Whole-token keys are numbers; component keys
  // are "<ordinal>:<compIdx>" strings.
  const parseHebKey = (key) => {
    if (typeof key === 'string' && key.includes(':')) {
      const [ord, idx] = key.split(':');
      return { ordinal: +ord, compIdx: +idx };
    }
    return { ordinal: +key, compIdx: null };
  };

  // Conflict detection — any existing link that shares an English index OR
  // a token ordinal with the new selection. Mirrors the original logic.
  const findConflicts = (enIdxs, hebKeys) => {
    const enSet = new Set(enIdxs);
    const ordSet = new Set(hebKeys.map(k => parseHebKey(k).ordinal));
    return links.filter(l =>
      l.english_indices?.some(i => enSet.has(i)) ||
      l.token_ordinals?.some(o => ordSet.has(o))
    );
  };

  // Union: delete all conflicting links and recreate one merged link. Admins
  // do this against the server, exactly as before; non-admins do the identical
  // fold against this browser's local link override (see localOverlay.js).
  const unionLinks = async (conflicts, newEnIdxs, newOrdinals, phrase) => {
    const allEn = [...new Set([...conflicts.flatMap(l => l.english_indices || []), ...newEnIdxs])].sort((a, b) => a - b);
    const allOrd = [...new Set([...conflicts.flatMap(l => l.token_ordinals || []), ...newOrdinals])].sort((a, b) => a - b);
    // Pick the lowest-id conflict as the survivor (keep its id for history)
    const keep = conflicts.reduce((a, b) => a.id < b.id ? a : b);
    const toDelete = conflicts.filter(l => l.id !== keep.id);
    const merged = {
      english_phrase: allEn.map(i => enWords[i]).filter(Boolean).join(' '),
      english_indices: allEn,
      token_ordinals: allOrd,
    };
    const { isAdmin: admin } = await getAdminStatus();
    if (admin) {
      // Delete the losers
      for (const l of toDelete) {
        try { await apiTransUnlink({ id: l.id, book_id: activeBook, chapter: activeChapter, verse: activeVerse }); }
        catch { /* keep going — one failed delete shouldn't block the union */ }
      }
      // Update the survivor with the unioned set.
      // book_id / chapter / verse are REQUIRED by PUT /api/translate/link/:id —
      // it 400s without them (server.js: "book_id, chapter, verse required").
      // Omitting them meant every attempt to add a word to an EXISTING link
      // failed, while creating a brand-new link worked, since apiTransLink sends
      // the full payload. Same three fields apiTransUnlink already passes above.
      await apiTransUpdateLink({ id: keep.id, book_id: activeBook, chapter: activeChapter, verse: activeVerse, ...merged });
    } else {
      // Same fold, expressed as one whole-list write to the local override —
      // drop the losers, patch the survivor — so it's a single atomic write
      // instead of N separate local calls.
      const deleteIds = new Set(toDelete.map(l => l.id));
      const next = links.filter(l => !deleteIds.has(l.id)).map(l => l.id === keep.id ? { ...l, ...merged } : l);
      // tokenSource, not lang — links are scoped by edition, see loadVerse.
      await setLocalLinksOverride(activeBook, activeChapter, activeVerse, tokenSource, next);
      setHasLocalEdits(true);
    }
  };

  const toggleEnSel = idx => {
    setSelEn(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  };
  const toggleHebSel = key => {
    setSelHeb(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const performLinkAction = useCallback(async () => {
    if (!selEn.size || !selHeb.size) return;
    const { isAdmin: admin } = await getAdminStatus();
    const enIdxs = [...selEn].sort((a, b) => a - b);
    const hebKeys = [...selHeb];
    const hebOrdinals = [...new Set(hebKeys.map(k => parseHebKey(k).ordinal))];
    const phrase = enIdxs.map(i => enWords[i]).filter(Boolean).join(' ');

    const conflicts = findConflicts(enIdxs, hebKeys);
    if (conflicts.length > 0) {
      // Build the union preview for the confirm dialog
      const existingEn  = [...new Set(conflicts.flatMap(l => l.english_indices))].sort((a, b) => a - b).map(i => enWords[i]).filter(Boolean);
      const newEn       = enIdxs.map(i => enWords[i]).filter(Boolean);
      const allEnLabels = [...new Set([...existingEn, ...newEn])];
      const existingOrd = [...new Set(conflicts.flatMap(l => l.token_ordinals))].sort((a, b) => a - b);
      const allOrdinals = [...new Set([...existingOrd, ...hebOrdinals])].sort((a, b) => a - b);
      const hebLabels = allOrdinals.map(o => tokens.find(t => t.token_ordinal === o)?.word_raw || `ord:${o}`);
      const msg = `This overlaps with ${conflicts.length} existing link(s).\n\nUnion result:\nEnglish: ${allEnLabels.join(', ')}\nHebrew: ${hebLabels.join(' ')}\n\nMerge into one link?`;
      if (!confirm(msg)) {
        setSelEn(new Set()); setSelHeb(new Set());
        return;
      }
      try {
        await unionLinks(conflicts, enIdxs, hebOrdinals, phrase);
        await loadVerse(activeBook, activeChapter, activeVerse);
        setSelEn(new Set()); setSelHeb(new Set());
        toast('Links merged', 'ok');
      } catch (e) { toast('Merge failed: ' + e.message, 'err'); }
      return;
    }

    // No conflicts — insert one link per hebKey (component links carry component_hint)
    try {
      const errors = [];
      for (const key of hebKeys) {
        const { ordinal, compIdx } = parseHebKey(key);
        let component_hint = '';
        if (compIdx !== null) {
          const tok = tokens.find(t => t.token_ordinal === ordinal);
          const comp = tok?.components?.[compIdx];
          if (!comp) { errors.push(`Component not found: ${key}`); continue; }
          component_hint = `${compIdx}:${comp.css}`;
        }
        // tokenSource, NOT `lang` — see loadVerse. The ordinals in this link
        // address the tokens the server actually served, so the link must be
        // tagged with that edition or the reader will never find it. Same rule
        // applies to the local-only path.
        const payload = {
          book_id: activeBook, chapter: activeChapter, verse: activeVerse,
          lang: tokenSource,
          english_phrase: phrase, english_indices: enIdxs,
          token_ordinals: [ordinal], component_hint,
          color_index: 0, sort_order: links.length,
        };
        try {
          if (admin) await apiTransLink(payload);
          else { await addLocalLink(activeBook, activeChapter, activeVerse, tokenSource, payload, links); setHasLocalEdits(true); }
        } catch (e) { errors.push(e.message); }
      }
      await loadVerse(activeBook, activeChapter, activeVerse);
      setSelEn(new Set()); setSelHeb(new Set());
      if (errors.length) toast('Link errors: ' + errors.join('; '), 'err');
      else toast('Linked', 'ok');
    } catch (e) { toast('Link failed: ' + e.message, 'err'); }
  }, [selEn, selHeb, enWords, activeBook, activeChapter, activeVerse, tokenSource, tokens, links, loadVerse, toast]);

  // Switch the source language we're linking against and reload that language's
  // tokens + its own link set. The English translation is untouched.
  const changeLang = useCallback((nextLang) => {
    if (nextLang === lang) return;
    setLang(nextLang);
    setSelEn(new Set()); setSelHeb(new Set());
    if (activeBook && activeChapter && activeVerse != null) loadVerse(activeBook, activeChapter, activeVerse, nextLang);
  }, [lang, activeBook, activeChapter, activeVerse, loadVerse]);

  const deleteLink = useCallback(async (linkId) => {
    if (!confirm('Delete this link?')) return;
    try {
      const { isAdmin: admin } = await getAdminStatus();
      if (admin) {
        await apiTransUnlink({ id: linkId, book_id: activeBook, chapter: activeChapter, verse: activeVerse });
      } else {
        // Seeds the local override from whatever's currently on screen (server's
        // list, or this browser's own earlier local edits) minus the deleted link.
        await deleteLocalLink(activeBook, activeChapter, activeVerse, tokenSource, linkId, links);
        setHasLocalEdits(true);
      }
      await loadVerse(activeBook, activeChapter, activeVerse);
    } catch (e) { toast('Delete failed: ' + e.message, 'err'); }
  }, [activeBook, activeChapter, activeVerse, tokenSource, links, loadVerse, toast]);

  // ── CHAPTER VIEW (read-only overlay) ──────────────────────────────────────
  // Fetches the whole chapter at once and renders each translated verse with
  // English + Paleo side-by-side. Useful for proofreading a chapter end-to-end
  // without the editor controls cluttering the page.
  const openChapterView = useCallback(async () => {
    if (!activeBook || !activeChapter) return;
    setChvData(null);
    setChvOpen(true);
    try {
      const [chData, parsedTokens] = await Promise.all([
        apiTransChapter(activeBook, activeChapter),
        apiTokens(activeBook, activeChapter).catch(() => []),
      ]);
      const parsedByKey = {};
      for (const pt of parsedTokens || []) {
        if (pt.verse != null && pt.token_ordinal != null) {
          parsedByKey[`${pt.verse}:${pt.token_ordinal}`] = pt;
        }
      }
      // Fetch each verse's full detail (text + links + tokens). One request per
      // verse is N+1 but the chapter view is on-demand so latency is acceptable
      // for now; this could be batched into a /api/translate/chapter-full later.
      const details = await Promise.all((chData.verses || []).map(v =>
        apiTransVerse(activeBook, activeChapter, v.verse)
      ));
      // Merge parsed components into each verse's tokens
      const merged = details.filter(Boolean).map(vd => {
        const verseNum = vd.verse;
        const tokens = (vd.tokens || []).map(t => {
          const p = parsedByKey[`${verseNum}:${t.token_ordinal}`];
          if (p?.components?.length) return { ...t, components: p.components };
          return t;
        });
        const links = hydrateLinks(vd.links || []);
        return { ...vd, tokens, links };
      });
      setChvData(merged);
    } catch (e) { toast('Chapter view failed: ' + e.message, 'err'); }
  }, [activeBook, activeChapter, toast]);

  // ── OVERVIEW (corpus-wide progress) ──────────────────────────────────────
  // Re-pulls progress (in case translations elsewhere bumped counts) and
  // surfaces the per-book breakdown in a modal.
  const openOverview = useCallback(async () => {
    try {
      const p = await apiTransProgress();
      setProgress(p);
      setOvOpen(true);
    } catch (e) { toast('Overview load failed: ' + e.message, 'err'); }
  }, [toast]);

  // Total counts derived from progress, for the overview header
  const overallTotals = useMemo(() => {
    const bs = progress?.books || [];
    const total = bs.reduce((s, b) => s + (b.total || 0), 0);
    const done  = bs.reduce((s, b) => s + (b.done  || 0), 0);
    const ip    = bs.reduce((s, b) => s + (b.in_progress || 0), 0);
    return { total, done, ip, pct: total ? Math.round(done / total * 100) : 0 };
  }, [progress]);

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="tr-shell">
      <header className="tr-topbar">
        <Link to="/landing" className="tr-logo" aria-label="Home">𐤀𐤁</Link>
        <h1 className="tr-title">Translation Studio</h1>
        {isAdmin === false && (
          <span className="tr-txt-btn" style={{ cursor: 'default', opacity: 0.85 }}
                title="You're not logged in as admin — edits here save only in this browser and are never published.">
            📍 Local editing
          </span>
        )}
        <span className="tr-spacer" />
        {isAdmin === false && hasLocalEdits && (
          <button className="tr-txt-btn" onClick={pullLatest} title="Discard everything you've changed locally and go back to what's published">
            ↺ Pull latest
          </button>
        )}
        <button className="tr-txt-btn" onClick={openOverview}>📊 Overview</button>
        {activeBook && activeChapter && (
          <button className="tr-txt-btn" onClick={openChapterView}>📖 Chapter</button>
        )}
        {activeBook && activeChapter && activeVerse != null && (
          <Link to={`/parallel?book=${bookToParam(activeBook, idToSlug)}&chapter=${activeChapter}&verse=${activeVerse}`}
                className="tr-txt-btn">Parallel →</Link>
        )}
        {activeBook && activeChapter && activeVerse != null && (
          <Link to={`/bible?book=${bookToParam(activeBook, idToSlug)}&chapter=${activeChapter}&verse=${activeVerse}`}
                className="tr-txt-btn" title="Open this passage in the Reader — flowing prose, no Strong's">📗 Reader →</Link>
        )}
        <button className="tr-icon-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <div className={`tr-app ${navCollapsed ? 'nav-collapsed' : ''}`}>
        {/* Mobile-only context bar: keeps the current book/chapter/verse visible
            while the pickers are collapsed, and toggles them back open. */}
        <div className="tr-mobile-ctx">
          <button className="tr-mobile-ctx-btn" onClick={() => setNavCollapsed(c => !c)}>
            <span className="tr-mobile-ctx-icon">{navCollapsed ? '☰' : '✕'}</span>
            <span className="tr-mobile-ctx-label">
              {activeBookData?.name || 'Choose a book'}
              {activeChapter ? ` ${activeChapter}` : ''}{activeVerse != null ? `:${activeVerse}` : ''}
            </span>
            <span className="tr-mobile-ctx-hint">{navCollapsed ? 'Browse' : 'Hide'}</span>
          </button>
        </div>

        {/* BOOK PANE */}
        <aside className="tr-book-pane">
          <div className="tr-pane-header">Books</div>
          {books.map(b => {
            const pct = b.total ? Math.round(b.done / b.total * 100) : 0;
            const ip  = b.total ? Math.round(b.in_progress / b.total * 100) : 0;
            const fc  = pct === 100 ? 'done' : (pct > 0 || ip > 0) ? 'mixed' : '';
            return (
              <button key={b.book_id}
                className={`tr-book-item ${activeBook === b.book_id ? 'active' : ''}`}
                onClick={() => selectBook(b.book_id)}>
                <span className="tr-book-name">{b.name}</span>
                <span className="tr-mini-bar"><span className={`tr-mini-fill ${fc}`} style={{ width: (pct + ip) + '%' }} /></span>
                <span className="tr-book-pct">{pct}%</span>
              </button>
            );
          })}
        </aside>

        {/* CHAPTER PANE */}
        <aside className="tr-chapter-pane">
          <div className="tr-pane-header">
            <div className="tr-chapter-title">{activeBookData?.name || '—'}</div>
            {activeBookData && (
              <div className="tr-chapter-progress">
                {activeBookData.done}/{activeBookData.total} done ({activeBookData.total ? Math.round(activeBookData.done/activeBookData.total*100) : 0}%)
              </div>
            )}
          </div>
          <div className="tr-chapter-list">
            {(activeBookData?.chapters || []).map(ch => {
              const key = `${activeBook}:${ch.chapter}`;
              const isOpen = key in openChapterMap && activeChapter === ch.chapter;
              const verses = openChapterMap[key] || [];
              const pct = ch.total ? Math.round(ch.done / ch.total * 100) : 0;
              return (
                <div key={ch.chapter} className="tr-chapter-group">
                  <button
                    className={`tr-chapter-header ${isOpen ? 'open' : ''}`}
                    onClick={() => isOpen ? setActiveChapter(null) : openChapter(activeBook, ch.chapter)}>
                    <span className="tr-chevron">▶</span>
                    <span className="tr-chapter-label">Ch {ch.chapter}</span>
                    <span className="tr-chapter-stat">{ch.done}/{ch.total} · {pct}%</span>
                  </button>
                  {isOpen && (
                    <div className="tr-verse-list">
                      {verses.length === 0 ? <div className="tr-loading">Loading…</div> :
                        verses.map(v => (
                          <button
                            key={v.verse}
                            className={`tr-verse-row ${activeVerse === v.verse ? 'active' : ''}`}
                            onClick={() => loadVerse(activeBook, ch.chapter, v.verse)}>
                            <span className="tr-verse-num">{v.verse}</span>
                            <span className={`tr-status-dot ${v.status || 'none'}`} />
                            <span className="tr-verse-preview">{v.text ? v.text.slice(0, 34) : '—'}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* EDITOR PANE */}
        <main className="tr-editor-pane">
          {!verseData ? (
            <div className="tr-editor-empty">
              <div className="tr-big-glyph">𐤀𐤁𐤂</div>
              <p>Select a verse from the chapter list to start editing.</p>
            </div>
          ) : (
            <div className="tr-editor-content">
              <div className="tr-verse-ref-bar">
                <span className="tr-verse-ref-label">
                  {activeBookData?.name} {activeChapter}:{activeVerse}
                </span>
                <select
                  className={`tr-status-select ${verseData.status || 'none'}`}
                  value={verseData.status || 'none'}
                  onChange={e => setStatus(e.target.value)}>
                  <option value="none">— not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
                <span className="tr-save-status">
                  {saveState === 'saving' && 'Saving…'}
                  {saveState === 'saved'  && (verseData.local ? '✓ Saved locally' : '✓ Saved')}
                  {saveState === 'error'  && '⚠ Error'}
                </span>
                {isAdmin === false && (verseData.local || verseData.localLinks) && (
                  <button
                    className="tr-txt-btn"
                    style={{ marginLeft: 'auto' }}
                    onClick={verseData.local ? resetVerseToPublished : resetLinksToPublished}
                    title={verseData.local
                      ? "Discard your local edit for this verse's text and go back to what's published"
                      : "Discard your local edit for this verse's links and go back to what's published"}>
                    ↺ Reset to published
                  </button>
                )}
              </div>

              {/* Mode tabs */}
              <div className="tr-mode-tabs">
                <button className={`tr-mode-tab ${mode === 'edit' ? 'active' : ''}`}
                        onClick={() => setMode('edit')}>✏️ Edit</button>
                <button className={`tr-mode-tab ${mode === 'view' ? 'active' : ''}`}
                        onClick={() => setMode('view')}>👁 View</button>
              </div>

              {/* Source-language picker — filtered to languages that contain this
                  verse. The English translation is shared; switching language
                  shows that language's tokens and its own link set. */}
              {langs.length > 1 && (
                <div className="tr-lang-picker">
                  <span className="tr-lang-label">Source language</span>
                  <select className="tr-lang-select" value={lang} onChange={e => changeLang(e.target.value)}>
                    {langs.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
              )}

              {/* ─── EDIT MODE ───────────────────────────────────────────── */}
              {mode === 'edit' && (
                <>
                  <section className="tr-paleo-viewer">
                    <div className="tr-section-label">{isBHS ? 'Paleo Source' : `${langMeta.label || lang} Source`}</div>
                    <div className="tr-paleo-tokens" dir={langMeta.dir}>
                      {isBHS
                        ? tokens.map(t => <PaleoBlock key={t.token_ordinal} token={t} />)
                        : tokens.map(t => (
                            <div key={t.token_ordinal} className="tr-src-block" dir={langMeta.dir}>
                              <span className="tr-src-word">{t.word_raw || '·'}</span>
                              {t.gloss ? <span className="tr-src-gloss">{t.gloss}</span> : null}
                            </div>
                          ))}
                    </div>
                  </section>

                  <section className="tr-translation-section">
                    <div className="tr-section-label">Translation</div>
                    <div className="tr-rt-toolbar">
                      {/* mousedown + preventDefault on toolbar buttons preserves the
                          selection in the contenteditable so the execCommand applies
                          to where the user was working, not to nothing. Same pattern
                          everywhere a button changes the active text run. */}
                      <button className="tr-tb-btn" title="Bold (Ctrl+B)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('bold'); }}><b>B</b></button>
                      <button className="tr-tb-btn" title="Italic (Ctrl+I)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('italic'); }}><i>I</i></button>
                      <button className="tr-tb-btn" title="Underline (Ctrl+U)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('underline'); }}><u>U</u></button>
                      <span className="tr-tb-sep" />
                      {/* Text color — native picker. Apply via execCommand foreColor
                          so only the current selection (or caret point) is colored. */}
                      <label className="tr-tb-color" title="Text color">
                        <span>A</span>
                        <input type="color"
                               onMouseDown={e => e.preventDefault() /* keep selection alive */}
                               onChange={e => {
                                 document.execCommand('styleWithCSS', false, true);
                                 document.execCommand('foreColor', false, e.target.value);
                               }} />
                      </label>
                      {/* Highlight (background) color */}
                      <label className="tr-tb-color tr-tb-hl" title="Highlight">
                        <span>H</span>
                        <input type="color"
                               onMouseDown={e => e.preventDefault()}
                               onChange={e => {
                                 document.execCommand('styleWithCSS', false, true);
                                 // hiliteColor is the modern name; backColor is the old IE
                                 // fallback. We try both — whichever the browser supports.
                                 if (!document.execCommand('hiliteColor', false, e.target.value)) {
                                   document.execCommand('backColor', false, e.target.value);
                                 }
                               }} />
                      </label>
                      <span className="tr-tb-sep" />
                      <button className="tr-tb-btn" title="Insert em-dash"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('insertText', false, '—'); }}>—</button>
                      <span className="tr-tb-sep" />
                      <button className="tr-tb-btn" title="Indent (Tab)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('indent'); }}>⇥</button>
                      <button className="tr-tb-btn" title="Outdent (Shift+Tab)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('outdent'); }}>⇤</button>
                      <span className="tr-tb-sep" />
                      <button className="tr-tb-btn" title="Clear formatting"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('removeFormat'); }}>×<sub style={{ fontSize: 8 }}>fmt</sub></button>
                    </div>
                    <div
                      ref={editorRef}
                      className="tr-translation-text"
                      contentEditable
                      suppressContentEditableWarning
                      data-placeholder="Type the translation…"
                      onKeyDown={e => {
                        // Tab / Shift+Tab → indent / outdent (don't move focus)
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          document.execCommand(e.shiftKey ? 'outdent' : 'indent');
                        }
                      }}
                    />
                    <div className="tr-save-row">
                      <button className="tr-save-btn" onClick={() => saveVerse()} disabled={saveState === 'saving'}>
                        {saveState === 'saving' ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </section>

                  {/* Linker grid */}
                  {(verseData.text || '').trim() && (
                    <section
                      className="tr-linker-section"
                      onKeyDown={e => {
                        // Enter inside the linker grid → trigger Link action.
                        // Default browser behavior would re-fire the focused
                        // chip's onClick (because the chip is a <button>),
                        // which toggles the most recent selection back OFF.
                        // We intercept BEFORE that fires by handling onKeyDown
                        // at the section level and stopping propagation.
                        //
                        // We still allow Space to toggle individual chips
                        // (the standard a11y pattern for buttons). Only Enter
                        // is reinterpreted as "commit the link".
                        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                          if (selEn.size && selHeb.size) {
                            e.preventDefault();
                            e.stopPropagation();
                            performLinkAction();
                          } else {
                            // Both sides not selected — prevent the chip toggle
                            // so Enter is a no-op instead of an "unselect" surprise.
                            e.preventDefault();
                          }
                        }
                      }}
                    >
                      <div className="tr-section-label">Word Links</div>
                      <div className="tr-linker-grid">
                        {/* English column (LTR) */}
                        <div className="tr-en-tokens">
                          <div className="tr-col-header">English →</div>
                          {enWords.map((word, idx) => {
                            const link = lForEn(idx);
                            const color = link ? lColorForTokens(link, tokens) : null;
                            const isSel = selEn.has(idx);
                            const isHl  = link && hoveredLinkId === link.id;
                            return (
                              <button
                                key={idx}
                                className={`tr-en-chip ${isSel ? 'sel' : ''} ${isHl ? 'hl' : ''}`}
                                style={color && !isSel ? { borderColor: color + '88', background: color + '16' } : null}
                                onMouseEnter={() => link && setHoveredLinkId(link.id)}
                                onMouseLeave={() => setHoveredLinkId(null)}
                                onClick={() => toggleEnSel(idx)}>
                                <span>{word}</span>
                                {link && link.token_ordinals.length > 1 && (
                                  <span className="tr-en-badge" style={{ color, background: color + '30' }}>
                                    {link.token_ordinals.length}tok
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {/* Center action column */}
                        <div className="tr-linker-mid">
                          <button
                            className="tr-link-action"
                            disabled={!selEn.size || !selHeb.size}
                            onClick={performLinkAction}>
                            ⇄ Link
                          </button>
                          <div className="tr-link-info">
                            {selEn.size && selHeb.size
                              ? `${selEn.size} eng · ${selHeb.size} heb`
                              : selEn.size ? `${selEn.size} english\nselected`
                              : selHeb.size ? `${selHeb.size} hebrew\nselected`
                              : 'Select tokens\non both sides'}
                          </div>
                        </div>
                        {/* Hebrew column — whole-token chips + component sub-chips for non-root parts */}
                        <div className="tr-heb-tokens">
                          <div className="tr-col-header">{isBHS ? '← Hebrew' : (langMeta.label || lang)}</div>
                          {!isBHS ? (
                            tokens.map(t => {
                              const link  = lForOrd(t.token_ordinal);
                              const color = link ? lColorForTokens(link, tokens) : null;
                              const isSel = selHeb.has(t.token_ordinal);
                              const isHl  = link && hoveredLinkId === link.id;
                              return (
                                <div key={t.token_ordinal}>
                                  <button
                                    className={`tr-heb-chip ${isSel ? 'sel' : ''} ${isHl ? 'hl' : ''}`}
                                    style={color && !isSel ? { borderColor: color + '88', background: color + '16' } : null}
                                    dir={langMeta.dir}
                                    onMouseEnter={() => link && setHoveredLinkId(link.id)}
                                    onMouseLeave={() => setHoveredLinkId(null)}
                                    onClick={() => toggleHebSel(t.token_ordinal)}>
                                    <span className="tr-src-word" dir={langMeta.dir}>{t.word_raw || '·'}</span>
                                    {t.gloss ? <span className="tr-heb-trans">{t.gloss}</span> : null}
                                  </button>
                                </div>
                              );
                            })
                          ) : tokens.map(t => {
                            const comps = t.components?.length ? t.components : [{ paleo: t.word_raw || '', css: 'root' }];
                            // Component sub-chips first (prefixes/modifiers/suffixes), then the whole-token chip
                            const subChips = comps
                              .map((c, i) => ({ ...c, i }))
                              .filter(c => c.css !== 'root' && c.paleo)
                              .map(c => {
                                const key = `${t.token_ordinal}:${c.i}`;
                                const color = partColor(c.css);
                                const isSel = selHeb.has(key);
                                return (
                                  <button
                                    key={key}
                                    className={`tr-heb-chip tr-heb-comp-chip ${isSel ? 'sel' : ''}`}
                                    style={{ borderColor: isSel ? null : 'var(--border2)', borderStyle: 'dashed' }}
                                    onClick={() => toggleHebSel(key)}>
                                    <span className="tr-heb-glyph"
                                          style={{ color }}
                                          dangerouslySetInnerHTML={{ __html: paleoToSVG(c.paleo, '16px') }} />
                                    <span className="tr-heb-trans" style={{ color }}>
                                      [{c.css}] {c.translation || ''}
                                    </span>
                                  </button>
                                );
                              });
                            const link = lForOrd(t.token_ordinal);
                            const color = link ? lColorForTokens(link, tokens) : null;
                            const isSel = selHeb.has(t.token_ordinal);
                            const isHl  = link && hoveredLinkId === link.id;
                            // Build the whole-token glyph row with per-component colors
                            const glyphHtml = comps.map(c =>
                              `<span style="color:${partColor(c.css)}">${paleoToSVG(c.paleo, '20px')}</span>`
                            ).join('');
                            return (
                              <div key={t.token_ordinal}>
                                {subChips}
                                <button
                                  className={`tr-heb-chip ${isSel ? 'sel' : ''} ${isHl ? 'hl' : ''}`}
                                  style={color && !isSel ? { borderColor: color + '88', background: color + '16' } : null}
                                  onMouseEnter={() => link && setHoveredLinkId(link.id)}
                                  onMouseLeave={() => setHoveredLinkId(null)}
                                  onClick={() => toggleHebSel(t.token_ordinal)}>
                                  <span className="tr-heb-glyph"
                                        style={{ direction: 'rtl' }}
                                        dangerouslySetInnerHTML={{ __html: glyphHtml || (t.word_raw || '·') }} />
                                  <span className="tr-heb-trans">{tokenTrans(t)}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Existing links */}
                      {links.length > 0 && (
                        <div className="tr-links-list">
                          <div className="tr-section-label">Established links ({links.length})</div>
                          {links.map(l => {
                            const color = lColorForTokens(l, tokens);
                            const isHl  = hoveredLinkId === l.id;
                            const enText = l.english_indices.map(i => enWords[i]).filter(Boolean).join(' ');
                            const hebText = l.token_ordinals
                              .map(o => tokens.find(t => t.token_ordinal === o)?.word_raw || '')
                              .filter(Boolean).join(' ');
                            return (
                              <div key={l.id}
                                   className={`tr-elink-row ${isHl ? 'hl' : ''}`}
                                   style={{ borderColor: color + '60' }}
                                   onMouseEnter={() => setHoveredLinkId(l.id)}
                                   onMouseLeave={() => setHoveredLinkId(null)}>
                                <span className="tr-elink-en" style={{ color }}>{enText}</span>
                                <span className="tr-elink-arrow">⇄</span>
                                {isBHS
                                  ? <span className="tr-elink-heb"
                                          dangerouslySetInnerHTML={{ __html: paleoToSVG(hebText, '18px') }} />
                                  : <span className="tr-elink-heb" dir={langMeta.dir}>{hebText}</span>}
                                <button className="tr-elink-del" onClick={() => deleteLink(l.id)} title="Delete">✕</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}

              {/* ─── VIEW MODE ───────────────────────────────────────────── */}
              {mode === 'view' && (
                <section className="tr-view-mode">
                  <div className="tr-vlayout-btns">
                    <button className={`tr-vlayout-btn ${viewLayout === 'side' ? 'active' : ''}`}
                            onClick={() => setViewLayout('side')}>Side by Side</button>
                    <button className={`tr-vlayout-btn ${viewLayout === 'english' ? 'active' : ''}`}
                            onClick={() => setViewLayout('english')}>English Only</button>
                  </div>
                  {viewLayout === 'side' ? (
                    <div className="tr-vs-grid">
                      <div>
                        <div className="tr-vs-col-label">Your Translation <span className="tr-vs-badge">LTR →</span></div>
                        <ViewEnglishWords
                          enWords={enWords}
                          lForEn={lForEn}
                          hoveredLinkId={hoveredLinkId}
                          setHoveredLinkId={setHoveredLinkId}
                          richHtml={verseData.rich_text}
                          hebTokens={tokens}
                        />
                      </div>
                      <div>
                        <div className="tr-vs-col-label" style={{ direction: 'rtl', justifyContent: 'flex-end' }}>
                          <span className="tr-vs-badge">← RTL</span> Paleo-Hebrew
                        </div>
                        <div className="tr-vs-heb">
                          {tokens.filter(t => t.components?.length || t.word_raw).map(t => {
                            const link = lForOrd(t.token_ordinal);
                            const isHl = link && hoveredLinkId === link.id;
                            const color = link ? lColorForTokens(link, tokens) : null;
                            const comps = t.components?.length ? t.components : [{ paleo: t.word_raw, css: 'root' }];
                            const glyphHtml = comps.map(c =>
                              `<span style="color:${partColor(c.css)}">${paleoToSVG(c.paleo, '24px')}</span>`
                            ).join('');
                            return (
                              <span
                                key={t.token_ordinal}
                                className={`tr-vs-heb-blk ${link ? 'lnk' : ''} ${isHl ? 'hl' : ''}`}
                                style={color && !isHl ? { borderColor: color + '55' } : null}
                                onMouseEnter={() => link && setHoveredLinkId(link.id)}
                                onMouseLeave={() => setHoveredLinkId(null)}
                                dangerouslySetInnerHTML={{ __html: glyphHtml }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="tr-vs-col-label">Your Translation <span className="tr-vs-badge">LTR →</span></div>
                      <div className="tr-ven-text">
                        <ViewEnglishWords
                          enWords={enWords}
                          lForEn={lForEn}
                          hoveredLinkId={hoveredLinkId}
                          setHoveredLinkId={setHoveredLinkId}
                          richHtml={verseData.rich_text}
                          hebTokens={tokens}
                        />
                      </div>
                    </>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>

      {/* CHAPTER VIEW OVERLAY ── full-chapter read-only proofread view ─── */}
      {chvOpen && (
        <div className="tr-chv-overlay" onClick={() => setChvOpen(false)}>
          <div className="tr-chv-inner" onClick={e => e.stopPropagation()}>
            <div className="tr-chv-topbar">
              <div className="tr-chv-title">
                {activeBookData?.name} — Chapter {activeChapter}
              </div>
              <div className="tr-vlayout-btns">
                <button className={`tr-vlayout-btn ${chvLayout === 'side' ? 'active' : ''}`}
                        onClick={() => setChvLayout('side')}>Side by Side</button>
                <button className={`tr-vlayout-btn ${chvLayout === 'english' ? 'active' : ''}`}
                        onClick={() => setChvLayout('english')}>English Only</button>
              </div>
              <button className="tr-txt-btn" onClick={() => setChvOpen(false)}>✕ Close</button>
            </div>
            <div className="tr-chv-verses">
              {!chvData ? <div className="tr-loading">Loading chapter…</div> :
                chvData.map(vd => <ChvVerseBlock key={vd.verse} vd={vd} layout={chvLayout} />)
              }
            </div>
          </div>
        </div>
      )}

      {/* OVERVIEW OVERLAY ── corpus-wide translation progress ─────────────── */}
      {ovOpen && (
        <div className="tr-ov-overlay" onClick={() => setOvOpen(false)}>
          <div className="tr-ov-panel" onClick={e => e.stopPropagation()}>
            <h2>Translation Progress</h2>
            <div className="tr-ov-summary">
              {overallTotals.done} of {overallTotals.total} translated ({overallTotals.pct}%) ·{' '}
              {overallTotals.ip} in progress
            </div>
            <div className="tr-ov-books">
              {(progress?.books || []).map(b => {
                const bp = b.total ? (b.done / b.total) * 100 : 0;
                const ipp = b.total ? (b.in_progress / b.total) * 100 : 0;
                return (
                  <div key={b.book_id} className="tr-ov-row">
                    <div className="tr-ov-name">{b.name}</div>
                    <div className="tr-ov-bar">
                      <div className="tr-ov-done" style={{ width: bp + '%' }} />
                      <div className="tr-ov-ip"   style={{ left: bp + '%', width: ipp + '%' }} />
                    </div>
                    <div className="tr-ov-pct">{Math.round(bp)}%</div>
                  </div>
                );
              })}
            </div>
            <button className="tr-txt-btn" onClick={() => setOvOpen(false)} style={{ alignSelf: 'flex-end' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chapter-view verse block ───────────────────────────────────────────────
function ChvVerseBlock({ vd, layout }) {
  const text = (vd.text || '').trim();
  if (!text) {
    return (
      <div className="tr-chv-verse">
        <div className="tr-chv-vref"><span>v.{vd.verse}</span></div>
        <div className="tr-chv-empty">Not yet translated</div>
      </div>
    );
  }
  const enWords = text.split(/\s+/);
  const links = vd.links || [];
  const lForEn  = idx => links.find(l => l.english_indices?.includes(idx));
  const lForOrd = ord => links.find(l => l.token_ordinals?.includes(ord));
  const [hoveredLinkId, setHoveredLinkId] = useState(null);

  return (
    <div className="tr-chv-verse">
      <div className="tr-chv-vref">
        <span>v.{vd.verse}</span>
        <div className={`tr-status-dot ${vd.status || 'none'}`} />
      </div>
      <div className="tr-chv-en">
        {enWords.map((w, i) => {
          const link = lForEn(i);
          const isHl = link && hoveredLinkId === link.id;
          return (
            <span key={i}
                  className={`tr-chv-en-w ${link ? 'lnk' : ''} ${isHl ? 'hl' : ''}`}
                  onMouseEnter={() => link && setHoveredLinkId(link.id)}
                  onMouseLeave={() => setHoveredLinkId(null)}>
              {w}{' '}
            </span>
          );
        })}
      </div>
      {layout === 'side' && (
        <div className="tr-chv-heb">
          {(vd.tokens || []).filter(t => t.components?.length || t.word_raw).map(t => {
            const link = lForOrd(t.token_ordinal);
            const isHl = link && hoveredLinkId === link.id;
            const comps = t.components?.length ? t.components : [{ paleo: t.word_raw, css: 'root' }];
            const glyphHtml = comps.map(c =>
              `<span style="color:${partColor(c.css)}">${paleoToSVG(c.paleo, '22px')}</span>`
            ).join('');
            return (
              <span key={t.token_ordinal}
                    className={`tr-chv-heb-chip ${link ? 'lnk' : ''} ${isHl ? 'hl' : ''}`}
                    onMouseEnter={() => link && setHoveredLinkId(link.id)}
                    onMouseLeave={() => setHoveredLinkId(null)}
                    dangerouslySetInnerHTML={{ __html: glyphHtml }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Paleo word-block for the source panel ──────────────────────────────────
function PaleoBlock({ token }) {
  const comps = token.components?.length ? token.components : [{ paleo: token.word_raw || '', css: 'root', translation: '' }];
  const word = tokenWordText(token);
  const gloss = tokenTrans(token);
  return (
    <span className="tr-word-block">
      <span className="tr-word-glyph-row">
        {comps.map((c, i) => (
          <span key={i} className={`tr-glyph-part ${c.css}`} style={{ color: partColor(c.css) }}
                dangerouslySetInnerHTML={{ __html: paleoToSVG(c.paleo, '22px') }} />
        ))}
      </span>
      <span className="tr-word-text-row">
        {word}
        {gloss && <span className="tr-word-gloss">({gloss})</span>}
      </span>
      {token.strongs && <span className="tr-word-strongs">{token.strongs}</span>}
    </span>
  );
}

// ─── View-mode English renderer ──────────────────────────────────────────────
// Walks the rich HTML and wraps each word in a hoverable span that carries
// its English index. Falls back to plain whitespace-split words when there's
// no rich content. Each linked word gets the link's color and a hover handler
// that broadcasts hover state up to the parent for cross-column highlighting.
function ViewEnglishWords({ enWords, lForEn, hoveredLinkId, setHoveredLinkId, richHtml, hebTokens }) {
  // Build a flat array of "tokens" — either { text } (whitespace) or { word, idx }
  // (a real English word). We do this once via useMemo whenever the rich HTML or
  // word list changes, so React can render the spans declaratively.
  const tokens = useMemo(() => {
    if (richHtml && richHtml.trim()) {
      // Parse the rich HTML, walk text nodes, emit word-tokens with index.
      // Wrap each word in our own marker; preserve interspersed inline tags
      // by replacing text nodes with span sequences inside the same parent.
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${richHtml}</div>`, 'text/html');
      const root = doc.querySelector('div');
      const out = [];
      let idx = 0;
      const walk = (node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 3) { // text
            const parts = child.textContent.split(/(\s+)/);
            for (const p of parts) {
              if (!p) continue;
              if (/^\s+$/.test(p)) out.push({ kind: 'ws', text: p });
              else                 out.push({ kind: 'word', text: p, idx: idx++ });
            }
          } else if (child.nodeType === 1) {
            // For inline tags (b/i/u/span), emit an open marker, recurse, close.
            // We don't preserve nested attributes here — the visual styling for
            // rich text is provided by the editor on save; view-mode focuses on
            // word linkage.
            walk(child);
          }
        }
      };
      walk(root);
      if (!out.length) {
        return enWords.map((w, i) => ({ kind: 'word', text: w, idx: i }));
      }
      return out;
    }
    return enWords.map((w, i) => ({ kind: 'word', text: w, idx: i }));
  }, [richHtml, enWords]);

  return (
    <div className="tr-ven-words">
      {tokens.map((t, i) => {
        if (t.kind === 'ws') return <span key={i}>{t.text}</span>;
        const link = lForEn(t.idx);
        const color = link ? lColorForTokens(link, hebTokens) : null;
        const isHl = link && hoveredLinkId === link.id;
        return (
          <span
            key={i}
            className={`tr-ven-w ${link ? 'lnk' : ''} ${isHl ? 'hl' : ''}`}
            data-idx={t.idx}
            style={color && !isHl ? { color, borderBottomColor: color + '60' } : null}
            onMouseEnter={() => link && setHoveredLinkId(link.id)}
            onMouseLeave={() => setHoveredLinkId(null)}
          >{t.text}</span>
        );
      })}
    </div>
  );
}
