import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStatus } from '../lib/localOverlay.js';
import { useToast } from '../components/Toast.jsx';
import {
  apiGlossMissing, apiGlossCoverage, apiGlossRootVerses, apiGlossVerse, apiGlossVerseStatus,
} from '../lib/api.js';
import MultiWordBlock from '../components/MultiWordBlock.jsx';
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
// Greek/Ge'ez/Latin/Syriac/Coptic reuse the SAME generic tokenizer +
// lexicon/<lang>-lexicon.json overlay the live reader already renders these
// scripts with (server.js splitTextToTokens/_lookupGloss) — raw surface-form
// tokens, "glossed" = has a curated entry for that exact surface, no Strong's
// numbers or root-based coverage tracking the way Hebrew's does. See
// GLOSS_STUDIO_MULTILANG_PLAN.md for why that's deliberately NOT the full
// Hebrew root/lemma pipeline.
const LANGS = [
  { id: 'heb',    label: 'Hebrew',   enabled: true, source: null },
  { id: 'greek',  label: 'Greek',    enabled: true, source: 'LXX' },
  { id: 'geez',   label: "Ge'ez",    enabled: true, source: 'GEZ' },
  { id: 'latin',  label: 'Latin',    enabled: true, source: 'LAT' },
  { id: 'syriac', label: 'Syriac',   enabled: true, source: 'SYR' },
  { id: 'coptic', label: 'Coptic',   enabled: true, source: 'COP' },
];
const LANG_SOURCE = Object.fromEntries(LANGS.map(l => [l.id, l.source]));
// Script direction is a property of the LANGUAGE, not a Gloss-Studio-wide
// default — Hebrew and Syriac are RTL (Aramaic-family abjads), Greek/Ge'ez/
// Latin/Coptic are LTR. The verse-word grid's dir attribute follows this
// instead of a hardcoded `direction: rtl` that only ever made sense for
// Hebrew (see the 2026-08-10 report: Ge'ez was rendering right-to-left).
const LANG_DIR = { heb: 'rtl', greek: 'ltr', geez: 'ltr', latin: 'ltr', syriac: 'rtl', coptic: 'ltr' };

const MISSING_PAGE = 50;
const VERSES_PAGE = 10;

// A minimal, read-only word renderer — deliberately NOT the reader's
// <WordBlock>, which carries a lot of interactive machinery (hover-linking,
// search highlighting, maqaf-chip splitting, copy buttons) built around the
// live-reader's exact data contract. Root.jsx and StrongsOverrides.jsx both
// hit this same tradeoff and each wrote their own lightweight renderer
// rather than reusing WordBlock here. Colors come from the SAME global
// morphColors.css classes WordBlock itself uses (comp.css applied
// directly). `missingSet` (root_paleo strings still lacking a lexicon.json
// entry, from the coverage tree) flags the word with a highlighted border
// when one of its components is the actual gap — the "which word" the
// numbers alone don't show.
function GlossWordBlock({ word, missingSet }) {
  const comps = word.components || [];
  const sn = word.strongs ? 'H' + String(word.strongs).replace(/^H+/i, '') : '';
  const isMissing = missingSet && comps.some(c => c.css === 'root' && missingSet.has(c.paleo));
  return (
    <div className={`gs-word ${isMissing ? 'missing' : ''}`}>
      <div className="gs-word-glyphs">
        {comps.map((c, i) => (
          <span key={i} className={`gs-glyph ${c.css || 'root'} ${c.isMark ? 'mark' : ''}`}>{c.paleo}</span>
        ))}
      </div>
      <div className="gs-word-gloss">
        {comps.map((c, i) => {
          // Mark tokens (maqaf ־, sof-pasuq ׃, paseq ׀ …) are typographic
          // joiners, not grammar — WordBlock.jsx renders them as a plain
          // dimmed glyph in the word itself and never gives them a gloss
          // chip. This component skipped that check, so an empty
          // translation fell back to translit "-" and got wrapped in
          // brackets like a real particle, producing a stray "[-]" glued
          // next to its neighbor's chip. Marks carry nothing to gloss;
          // they're already shown (dimmed) in the glyphs row above.
          if (c.isMark) return null;
          const text = (c.translation || c.translit || '').replace(/[[\]]/g, '');
          if (!text) return null;
          return (
            <span key={i} className={`gs-gloss-part ${c.css || 'root'}`}>
              {c.css === 'root' ? text : `[${text}]`}
            </span>
          );
        })}
      </div>
      {sn && !/^H9/.test(sn) && (
        <a className="gs-word-sn" href={`/roots?sn=${sn}`} target="_blank" rel="noreferrer">{sn}</a>
      )}
    </div>
  );
}

// One verse's full token breakdown + English reference line — the shared
// detail view used by both Browse (an arbitrary verse) and Missing Words
// (every occurrence of one root). `missingSet` only applies in Browse mode,
// where the tree already knows which roots in THIS verse are ungloosed;
// Missing Words already filters to occurrences of one known-missing root,
// so every card there is implicitly about that root.
// `genericSource` set (e.g. 'LXX'/'GEZ'/'LAT'/'SYR'/'COP') means these words
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
      <div className="gs-verse-words" dir={dir}>
        {v.words.map((w, wi) => (
          genericSource
            ? <MultiWordBlock key={wi} token={w} source={genericSource} />
            : <GlossWordBlock key={wi} word={w} missingSet={missingSet} />
        ))}
      </div>
      {v.english?.text && (
        <div className="gs-verse-eng">
          <div className="gs-verse-eng-label">English</div>
          {v.english.text}
          {v.english.is_baseline && <span className="gs-badge">baseline</span>}
        </div>
      )}
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
  const [isAdmin, setIsAdmin] = useState(null);
  const [lang, setLang] = useState('heb');
  const [mode, setMode] = useState('browse');         // 'browse' | 'missing'

  // Which edition's OWN tokens to audit. 'BHS' = this book's natural edition
  // (Masoretic for the 39 canonical books, HEB for everything else — same as
  // the reader). 'HEB' = this project's own Hebraized edition for every book
  // it covers, INCLUDING the canonical ones — a canonical book's HEB tokens
  // can be genuinely different words than its BHS tokens, so it needs its
  // own, separately-audited coverage rather than being hidden behind BHS.
  const [source, setSource] = useState('BHS');

  // For non-Hebrew languages there's only one edition, so `source` just
  // tracks whichever corpus.db source backs the selected language pill
  // ('LXX'/'GEZ'/'LAT'/'SYR'/'COP') — every apiGloss* call already takes
  // `source` as a plain pass-through string, so no other plumbing below
  // needs to know about `lang` at all. Switching pills keeps the same
  // book/chapter/verse coordinates too, since every corpus.db source shares
  // the same canon_id-based book_id scheme (installScopedVerses) — so e.g.
  // Genesis 1:1 stays Genesis 1:1 across Hebrew/Greek/Ge'ez/Latin/Syriac/
  // Coptic, same as the BHS<->HEB toggle already did for Hebrew alone.
  useEffect(() => { setSource(lang === 'heb' ? 'BHS' : LANG_SOURCE[lang]); }, [lang]);

  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)); }, []);

  // ── Browse: the full tree, fetched once per source ──────────────────────
  // Covers every book with Hebrew material (BHS's canonical OT + everything
  // HEB-only: NT, Jubilees, Jasher, Book of Melchizedek, etc).
  const [tree, setTree] = useState(null);             // { books: [...] }
  const [treeBusy, setTreeBusy] = useState(false);
  const [activeBook, setActiveBook] = useState(null);  // book_id
  const [openChapter, setOpenChapter] = useState(null);
  const [activeVerseKey, setActiveVerseKey] = useState(null); // "book:chapter:verse"
  const [verseDetail, setVerseDetail] = useState(null);
  const [verseBusy, setVerseBusy] = useState(false);

  const loadTree = useCallback(() => {
    setTreeBusy(true);
    apiGlossCoverage(source)
      .then(d => setTree(d))
      .catch(e => toast(e.message, 'err'))
      .finally(() => setTreeBusy(false));
  }, [toast, source]);

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
  // left alone too; the book/chapter tree already re-fetches on its own via
  // loadTree's `source` dependency above. If the open book doesn't exist
  // under the new source, activeBookData/activeVerseMissing just come back
  // empty once the new tree lands — no special-casing needed here.
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

  // Derived from the tree + whichever verse is open, rather than snapshotted
  // onto verseDetail at click time — so it recomputes automatically whenever
  // either changes (including a source switch's tree reload below), instead
  // of needing its own re-fetch/reset plumbing.
  const activeVerseMissing = useMemo(() => {
    if (!tree || !activeVerseKey) return new Set();
    const [book_id, chapter, verse] = activeVerseKey.split(':').map(Number);
    const bk = tree.books.find(b => b.book_id === book_id);
    const ch = bk?.chapters.find(c => c.chapter === chapter);
    const vs = ch?.verses.find(v => v.verse === verse);
    return new Set(vs?.missing || []);
  }, [tree, activeVerseKey]);

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
                <span className="gs-mini-bar"><span className={`gs-mini-fill ${b.pct === 100 ? 'done' : b.pct > 0 ? 'mixed' : ''}`} style={{ width: `${b.pct}%` }} /></span>
                <span className="gs-book-pct">{b.pct}%</span>
              </button>
            ))}
          </aside>

          <aside className="gs-chapter-pane">
            <div className="gs-pane-header">
              <div className="gs-chapter-title">{activeBookData?.name || '—'}</div>
              {activeBookData && (
                <div className="gs-chapter-progress">{activeBookData.glossed}/{activeBookData.total} glossed ({activeBookData.pct}%)</div>
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
                      <span className="gs-chapter-stat">{ch.glossed}/{ch.total} · {ch.pct}%</span>
                    </button>
                    {isOpen && (
                      <div className="gs-verse-list">
                        {ch.verses.map(v => {
                          const key = `${activeBook}:${ch.chapter}:${v.verse}`;
                          const statusClass = v.pct === 100 ? 'done' : v.pct > 0 ? 'partial' : 'none';
                          return (
                            <button
                              key={v.verse}
                              className={`gs-verse-row ${activeVerseKey === key ? 'active' : ''}`}
                              onClick={() => selectVerse(activeBook, ch.chapter, v.verse)}
                            >
                              <span className="gs-verse-num">{v.verse}</span>
                              <span className={`gs-status-dot ${statusClass}`} />
                              <span className="gs-verse-preview">{v.glossed}/{v.total} ({v.pct}%)</span>
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
