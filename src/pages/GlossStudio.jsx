import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStatus } from '../lib/localOverlay.js';
import { useToast } from '../components/Toast.jsx';
import {
  apiGlossMissing, apiGlossCoverage, apiGlossRootVerses, apiGlossVerse,
} from '../lib/api.js';
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
// Hebrew only for now — Greek/Ge'ez/Latin/Syriac/Coptic need their own
// tokenized word-index built first (server.js SOURCES[...].has_tokens is
// false for all five today); those pills are stubbed "soon".
const LANGS = [
  { id: 'heb', label: 'Hebrew', enabled: true },
  { id: 'greek', label: 'Greek', enabled: false },
  { id: 'geez', label: "Ge'ez", enabled: false },
  { id: 'latin', label: 'Latin', enabled: false },
  { id: 'syriac', label: 'Syriac', enabled: false },
  { id: 'coptic', label: 'Coptic', enabled: false },
];

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
          <span key={i} className={`gs-glyph ${c.css || 'root'}`}>{c.paleo}</span>
        ))}
      </div>
      <div className="gs-word-gloss">
        {comps.map((c, i) => {
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
function VerseDetailCard({ v, missingSet }) {
  return (
    <div className="gs-verse-card">
      <Link
        className="gs-verse-ref"
        to={`/parallel?book=${v.book_id}&chapter=${v.chapter}&verse=${v.verse}`}
        target="_blank" rel="noreferrer"
        title="Open this verse in Parallel"
      >{v.book_name} {v.chapter}:{v.verse}</Link>
      <div className="gs-verse-words">
        {v.words.map((w, wi) => (
          <GlossWordBlock key={wi} word={w} missingSet={missingSet} />
        ))}
      </div>
      {v.english?.text && (
        <div className="gs-verse-eng">
          {v.english.text}
          {v.english.is_baseline && <span className="gs-badge">baseline</span>}
        </div>
      )}
    </div>
  );
}

export default function GlossStudio() {
  const toast = useToast();
  const [isAdmin, setIsAdmin] = useState(null);
  const [lang, setLang] = useState('heb');
  const [mode, setMode] = useState('browse');         // 'browse' | 'missing'

  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)); }, []);

  // ── Browse: the full tree, fetched once ─────────────────────────────────
  // Covers every book with Hebrew material (BHS's canonical OT + everything
  // HEB-only: NT, Jubilees, Jasher, Book of Melchizedek, etc) — server.js
  // picks each book's natural edition, so there's no source toggle here.
  const [tree, setTree] = useState(null);             // { books: [...] }
  const [treeBusy, setTreeBusy] = useState(false);
  const [activeBook, setActiveBook] = useState(null);  // book_id
  const [openChapter, setOpenChapter] = useState(null);
  const [activeVerseKey, setActiveVerseKey] = useState(null); // "book:chapter:verse"
  const [verseDetail, setVerseDetail] = useState(null);
  const [verseBusy, setVerseBusy] = useState(false);

  const loadTree = useCallback(() => {
    setTreeBusy(true);
    apiGlossCoverage()
      .then(d => setTree(d))
      .catch(e => toast(e.message, 'err'))
      .finally(() => setTreeBusy(false));
  }, [toast]);

  useEffect(() => { if (isAdmin && lang === 'heb') loadTree(); }, [isAdmin, lang, loadTree]);

  const activeBookData = useMemo(
    () => tree?.books.find(b => b.book_id === activeBook) || null,
    [tree, activeBook]
  );

  const selectVerse = (book_id, chapter, verse, missing) => {
    const key = `${book_id}:${chapter}:${verse}`;
    setActiveVerseKey(key);
    setVerseDetail(null);
    setVerseBusy(true);
    apiGlossVerse(book_id, chapter, verse)
      .then(d => setVerseDetail({ ...d, missingSet: new Set(missing || []) }))
      .catch(e => toast(e.message, 'err'))
      .finally(() => setVerseBusy(false));
  };

  // ── Missing Words: flat occurrence-ranked list ──────────────────────────
  const [missing, setMissing] = useState({ rows: [], total: 0 });
  const [missingOffset, setMissingOffset] = useState(0);
  const [missingBusy, setMissingBusy] = useState(false);

  const loadMissing = useCallback((offset) => {
    setMissingBusy(true);
    apiGlossMissing(offset, MISSING_PAGE)
      .then(d => { setMissing(d); setMissingOffset(offset); })
      .catch(e => toast(e.message, 'err'))
      .finally(() => setMissingBusy(false));
  }, [toast]);

  useEffect(() => { if (isAdmin && lang === 'heb' && mode === 'missing') loadMissing(0); }, [isAdmin, lang, mode, loadMissing]);

  const [selectedRoot, setSelectedRoot] = useState(null);
  const [rootVerses, setRootVerses] = useState({ verses: [], total: 0 });
  const [versesOffset, setVersesOffset] = useState(0);
  const [versesBusy, setVersesBusy] = useState(false);

  const loadRootVerses = useCallback((root, offset) => {
    setVersesBusy(true);
    apiGlossRootVerses(root, offset, VERSES_PAGE)
      .then(d => { setRootVerses(d); setVersesOffset(offset); })
      .catch(e => toast(e.message, 'err'))
      .finally(() => setVersesBusy(false));
  }, [toast]);

  const pickRoot = (root) => { setSelectedRoot(root); loadRootVerses(root, 0); };
  const closeRoot = () => { setSelectedRoot(null); setRootVerses({ verses: [], total: 0 }); };

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

        <span className="gs-spacer" />
        <div className="gs-langs">
          {LANGS.map(l => (
            <button
              key={l.id}
              className={`gs-lang-btn ${lang === l.id ? 'active' : ''} ${!l.enabled ? 'disabled' : ''}`}
              disabled={!l.enabled}
              title={l.enabled ? '' : 'Needs a tokenized word index first — coming soon'}
              onClick={() => l.enabled && setLang(l.id)}
            >{l.label}{!l.enabled && <span className="gs-soon">soon</span>}</button>
          ))}
        </div>
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
                              onClick={() => selectVerse(activeBook, ch.chapter, v.verse, v.missing)}
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

          <main className="gs-editor-pane">
            {!activeVerseKey ? (
              <div className="gs-editor-empty">
                <div className="gs-big-glyph">𐤀𐤁𐤂</div>
                <p>Pick a book, open a chapter, click a verse.</p>
              </div>
            ) : verseBusy ? (
              <div className="gs-loading">Loading verse…</div>
            ) : verseDetail ? (
              <VerseDetailCard v={verseDetail} missingSet={verseDetail.missingSet} />
            ) : null}
          </main>
        </div>
      )}

      {mode === 'missing' && (
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
                    <span className="gs-missing-paleo">{r.root_paleo}</span>
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
                <span>Verses using <span className="gs-missing-paleo">{selectedRoot}</span></span>
                <button className="gs-close-btn" onClick={closeRoot}>✕ Close</button>
              </div>
              {versesBusy && <div className="gs-loading">Loading verses…</div>}
              {!versesBusy && rootVerses.verses.map((v, vi) => <VerseDetailCard key={vi} v={v} missingSet={null} />)}
              {!versesBusy && rootVerses.verses.length === 0 && <div className="gs-empty">No verses found.</div>}
              <div className="gs-pager">
                <button disabled={versesOffset === 0} onClick={() => loadRootVerses(selectedRoot, Math.max(0, versesOffset - VERSES_PAGE))}>← Prev</button>
                <span>{versesOffset + 1}–{Math.min(versesOffset + VERSES_PAGE, rootVerses.total)} of {rootVerses.total}</span>
                <button disabled={versesOffset + VERSES_PAGE >= rootVerses.total} onClick={() => loadRootVerses(selectedRoot, versesOffset + VERSES_PAGE)}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
