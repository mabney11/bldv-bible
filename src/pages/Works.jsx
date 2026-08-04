import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiWorks } from '../lib/api.js';
import featuredManifest from '../featured-works.json';
import './Works.css';

const SOURCE_LABELS = {
  LXX: 'Greek Scriptures', GNT: 'Greek NT', GEZ: "Ge'ez",
  LAT: 'Latin', GRC: 'Greek Literature', BHS: 'Hebrew',
  SYR: 'Syriac', COP: 'Coptic', ENG: 'English',
};
const FEATURED = new Set(featuredManifest.featured || []);

/**
 * Works — filterable library of every literary work / manuscript across sources.
 * A curated "Featured" strip (from src/featured-works.json) stands above the full
 * list; the full list collapses behind a toggle so your picks aren't buried.
 */
export default function Works() {
  const navigate = useNavigate();
  const [works, setWorks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);
  const [q, setQ]             = useState('');
  const [srcFilter, setSrc]   = useState('ALL');
  const [catFilter, setCat]   = useState('ALL');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    apiWorks()
      .then(w => { setWorks(w); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, []);

  const key = (w) => `${w.source}:${w.doc_id}`;
  const sources = useMemo(() => Array.from(new Set(works.map(w => w.source))).sort(), [works]);
  const cats = useMemo(() => Array.from(new Set(works.map(w => w.category).filter(Boolean))).sort(), [works]);

  const featured = useMemo(() => works.filter(w => FEATURED.has(key(w))), [works]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return works.filter(w =>
      (srcFilter === 'ALL' || w.source === srcFilter) &&
      (catFilter === 'ALL' || w.category === catFilter) &&
      (!needle ||
        (w.title || '').toLowerCase().includes(needle) ||
        (w.doc_id || '').toLowerCase().includes(needle))
    );
  }, [works, q, srcFilter, catFilter]);

  const open = (w) => {
    const p = new URLSearchParams({ source: w.source, doc: w.doc_id, chapter: String(w.first_chapter || 1) });
    navigate(`/?${p}`);
  };

  const Row = (w) => (
    <button key={key(w)} className="works-row" onClick={() => open(w)} title={w.doc_id}>
      <span className="works-row-title">{w.title || w.doc_id}</span>
      <span className="works-row-meta">
        <span className={`works-src works-src-${w.source}`}>{w.source}</span>
        {w.category && <span className="works-cat">{w.category}</span>}
        <span className="works-nums">{w.chapters} ch · {w.verses} v</span>
      </span>
    </button>
  );

  const searching = q.trim() || srcFilter !== 'ALL' || catFilter !== 'ALL';

  return (
    <div className="works-page">
      <header className="works-top">
        <button onClick={() => navigate(-1)} className="works-back" aria-label="Back">←</button>
        <h1 className="works-h1">Works Library</h1>
        <span className="works-count">{filtered.length.toLocaleString()} / {works.length.toLocaleString()}</span>
      </header>

      <div className="works-controls">
        <input className="works-filter" placeholder="Filter by title or code…" value={q}
          onChange={e => setQ(e.target.value)} autoFocus />
        <select value={srcFilter} onChange={e => setSrc(e.target.value)}>
          <option value="ALL">All sources</option>
          {sources.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCat(e.target.value)}>
          <option value="ALL">All categories</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="works-list">
        {loading && <div className="works-msg">Loading works…</div>}
        {err && <div className="works-msg works-err">Failed to load: {err}</div>}

        {/* Featured strip — only when not actively filtering */}
        {!loading && !err && !searching && featured.length > 0 && (
          <>
            <div className="works-section-head">★ Featured</div>
            {featured.map(Row)}
            <button className="works-section-head works-toggle" onClick={() => setShowAll(s => !s)}>
              {showAll ? '▾ Hide all works' : `▸ All works (${works.length.toLocaleString()})`}
            </button>
          </>
        )}

        {/* Full list: always when searching, otherwise behind the toggle */}
        {!loading && !err && (searching || showAll || featured.length === 0) && (
          <>
            {filtered.length === 0 && <div className="works-msg">No works match that filter.</div>}
            {filtered.map(Row)}
          </>
        )}
      </div>
    </div>
  );
}
