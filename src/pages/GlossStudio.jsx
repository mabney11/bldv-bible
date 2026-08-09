import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStatus } from '../lib/localOverlay.js';
import { useToast } from '../components/Toast.jsx';
import { apiGlossMissing, apiGlossCoverage, apiGlossRootVerses } from '../lib/api.js';
import './GlossStudio.css';

// /gloss-studio — 100%-curated-by-you lexicon dashboard. Nothing here writes
// lexicon.json; it only ever reads the CURRENT file (server.js's
// getGlossCoverage(), mtime-cached) so this always reflects your latest
// edits with no separate report to regenerate. Two views:
//   Missing Words — every root with no lexicon.json entry, ranked by how
//     many times it actually occurs, so effort goes to the highest-value
//     gaps first. Click one to see every verse it's used in — full token
//     breakdown plus an English reference line — right here.
//   Coverage — book → chapter → verse drill-down of % glossed (glossed =
//     has a lexicon.json entry), so working top-down through a book, you
//     can watch it approach 100%.
// Hebrew only for now — Greek/Ge'ez/Latin/Syriac/Coptic need their own
// tokenized word-index built first (server.js SOURCES[...].has_tokens is
// false for all five today); those tabs are stubbed "coming soon".
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

function PctBar({ pct }) {
  return (
    <div className="gs-pctbar" title={`${pct}%`}>
      <div className="gs-pctbar-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

// A minimal, read-only word renderer for the verse-reference cards —
// deliberately NOT the reader's <WordBlock>, which carries a lot of
// interactive machinery (hover-linking, search highlighting, maqaf-chip
// splitting, copy buttons) built around the live-reader's exact data
// contract. Root.jsx and StrongsOverrides.jsx both hit this same tradeoff
// and each wrote their own lightweight renderer rather than reusing
// WordBlock here — same call, for the same reason: this just needs to show
// glyphs + translit + gloss + badge for reference while you write a gloss,
// not full reader interactivity. Colors come from the SAME global
// morphColors.css classes WordBlock itself uses (comp.css is applied
// directly), so a root/prefix/suffix looks the same color here as it does
// in the reader.
function GlossWordBlock({ word }) {
  const comps = word.components || [];
  const sn = word.strongs ? 'H' + String(word.strongs).replace(/^H+/i, '') : '';
  return (
    <div className="gs-word">
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

export default function GlossStudio() {
  const toast = useToast();
  const [isAdmin, setIsAdmin] = useState(null);
  const [lang, setLang] = useState('heb');
  const [tab, setTab] = useState('missing'); // 'missing' | 'coverage'

  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)); }, []);

  // ── Missing Words ──────────────────────────────────────────────────────
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

  useEffect(() => { if (isAdmin && lang === 'heb' && tab === 'missing') loadMissing(0); }, [isAdmin, lang, tab, loadMissing]);

  // Verse drill-down for the currently selected root
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

  const pickRoot = (root) => {
    setSelectedRoot(root);
    loadRootVerses(root, 0);
  };
  const closeRoot = () => { setSelectedRoot(null); setRootVerses({ verses: [], total: 0 }); };

  // ── Coverage ───────────────────────────────────────────────────────────
  // level: 'book' | 'chapter' | 'verse'. bookId/chapter are set once you've
  // drilled in; breadcrumb lets you climb back out.
  const [coverage, setCoverage] = useState({ level: 'book', rows: [] });
  const [coverageBusy, setCoverageBusy] = useState(false);
  const [drillBook, setDrillBook] = useState(null);     // { book_id, name }
  const [drillChapter, setDrillChapter] = useState(null); // chapter number

  const loadCoverage = useCallback((bookId, chapter) => {
    setCoverageBusy(true);
    apiGlossCoverage(bookId, chapter)
      .then(d => setCoverage(d))
      .catch(e => toast(e.message, 'err'))
      .finally(() => setCoverageBusy(false));
  }, [toast]);

  useEffect(() => {
    if (isAdmin && lang === 'heb' && tab === 'coverage') loadCoverage(drillBook?.book_id, drillChapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, lang, tab]);

  const enterBook = (row) => {
    setDrillBook({ book_id: row.book_id, name: row.name });
    setDrillChapter(null);
    loadCoverage(row.book_id, null);
  };
  const enterChapter = (row) => {
    setDrillChapter(row.chapter);
    loadCoverage(drillBook.book_id, row.chapter);
  };
  const backToBooks = () => { setDrillBook(null); setDrillChapter(null); loadCoverage(null, null); };
  const backToChapters = () => { setDrillChapter(null); loadCoverage(drillBook.book_id, null); };

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
    <div className="gs-page">
      <div className="gs-topbar">
        <Link to="/landing" className="logo-btn">𐤀𐤁</Link>
        <span className="gs-title">Gloss Studio</span>
        <div className="gs-langs">
          {LANGS.map(l => (
            <button
              key={l.id}
              className={`gs-lang-btn ${lang === l.id ? 'active' : ''} ${!l.enabled ? 'disabled' : ''}`}
              disabled={!l.enabled}
              title={l.enabled ? '' : "Needs a tokenized word index first — coming soon"}
              onClick={() => l.enabled && setLang(l.id)}
            >{l.label}{!l.enabled && <span className="gs-soon">soon</span>}</button>
          ))}
        </div>
      </div>

      <div className="gs-body">
        <div className="gs-tabs" role="tablist">
          <button className={`gs-tab-btn ${tab === 'missing' ? 'active' : ''}`} role="tab"
                  onClick={() => setTab('missing')}>Missing Words</button>
          <button className={`gs-tab-btn ${tab === 'coverage' ? 'active' : ''}`} role="tab"
                  onClick={() => setTab('coverage')}>Coverage</button>
        </div>

        {tab === 'missing' && (
          <div className="gs-section">
            <p className="gs-intro">
              Roots with no <code>lexicon.json</code> entry, ranked by how many times they actually
              occur in the text — the highest-value gaps first. Add a real entry and it drops off this
              list on the next load; nothing here writes anything for you.
            </p>

            {missingBusy && <div className="gs-loading">Loading…</div>}
            {!missingBusy && missing.rows.length === 0 && (
              <div className="gs-empty">Nothing missing — every root in the corpus has a lexicon.json entry. 🎉</div>
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
                {!versesBusy && rootVerses.verses.map((v, vi) => (
                  <div key={vi} className="gs-verse-card">
                    <Link
                      className="gs-verse-ref"
                      to={`/parallel?book=${v.book_id}&chapter=${v.chapter}&verse=${v.verse}`}
                      target="_blank" rel="noreferrer"
                      title="Open this verse in Parallel"
                    >{v.book_name} {v.chapter}:{v.verse}</Link>
                    <div className="gs-verse-words">
                      {v.words.map((w, wi) => (
                        <GlossWordBlock key={wi} word={w} />
                      ))}
                    </div>
                    {v.english?.text && (
                      <div className="gs-verse-eng">
                        {v.english.text}
                        {v.english.is_baseline && <span className="gs-badge">baseline</span>}
                      </div>
                    )}
                  </div>
                ))}
                {!versesBusy && rootVerses.verses.length === 0 && (
                  <div className="gs-empty">No verses found.</div>
                )}
                <div className="gs-pager">
                  <button disabled={versesOffset === 0} onClick={() => loadRootVerses(selectedRoot, Math.max(0, versesOffset - VERSES_PAGE))}>← Prev</button>
                  <span>{versesOffset + 1}–{Math.min(versesOffset + VERSES_PAGE, rootVerses.total)} of {rootVerses.total}</span>
                  <button disabled={versesOffset + VERSES_PAGE >= rootVerses.total} onClick={() => loadRootVerses(selectedRoot, versesOffset + VERSES_PAGE)}>Next →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'coverage' && (
          <div className="gs-section">
            <div className="gs-breadcrumb">
              <button className={`gs-crumb ${!drillBook ? 'active' : ''}`} onClick={backToBooks}>All Books</button>
              {drillBook && (
                <>
                  <span className="gs-crumb-sep">›</span>
                  <button className={`gs-crumb ${drillBook && !drillChapter ? 'active' : ''}`} onClick={backToChapters}>{drillBook.name}</button>
                </>
              )}
              {drillChapter && (
                <>
                  <span className="gs-crumb-sep">›</span>
                  <span className="gs-crumb active">Chapter {drillChapter}</span>
                </>
              )}
            </div>

            {coverageBusy && <div className="gs-loading">Loading…</div>}
            {!coverageBusy && (
              <div className="gs-coverage-list">
                {coverage.level === 'book' && coverage.rows.map(row => (
                  <div key={row.book_id} className="gs-coverage-row" onClick={() => enterBook(row)}>
                    <span className="gs-coverage-name">{row.name}</span>
                    <PctBar pct={row.pct} />
                    <span className="gs-coverage-frac">{row.glossed.toLocaleString()}/{row.total.toLocaleString()} ({row.pct}%)</span>
                  </div>
                ))}
                {coverage.level === 'chapter' && coverage.rows.map(row => (
                  <div key={row.chapter} className="gs-coverage-row" onClick={() => enterChapter(row)}>
                    <span className="gs-coverage-name">Chapter {row.chapter}</span>
                    <PctBar pct={row.pct} />
                    <span className="gs-coverage-frac">{row.glossed}/{row.total} ({row.pct}%)</span>
                  </div>
                ))}
                {coverage.level === 'verse' && coverage.rows.map(row => (
                  <div key={row.verse} className="gs-coverage-row gs-coverage-row-leaf">
                    <span className="gs-coverage-name">Verse {row.verse}</span>
                    <PctBar pct={row.pct} />
                    <span className="gs-coverage-frac">{row.glossed}/{row.total} ({row.pct}%)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
