/**
 * PreceptStudio.jsx — /precepts
 *
 * Browse and (as admin) review the corpus's precepts: every place one
 * passage quotes another, across all of the books, found by
 * server/build-precepts.mjs. Left: the books, with how many of their
 * verses carry precepts. Main: that book's pairs strongest first (or, with
 * no book chosen, the strongest in the whole corpus), each showing both
 * verses in the reading text. Signed in, every pair gets ✓ confirm /
 * ✗ reject / ↺ clear — the same reviews the Reader's marker panel shows.
 *
 * Reviews are stored in translation.db (precept_reviews); precepts.db itself
 * is a rebuildable index (build-precepts.mjs), so reviewing never touches it.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiPreceptBooks, apiPreceptList, apiPreceptReview, apiBookOrder } from '../lib/api.js';
import { getAdminStatus } from '../lib/localOverlay.js';
import { buildBookSlugs, bookToParam } from '../lib/bookSlug.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { renderVerseNodesWithQuotes, sanitizeText } from './Reader.jsx';
import { KIND_LABEL, refLabel } from '../components/Precepts.jsx';
import './Reader.css';
import '../components/Precepts.css';
import './PreceptStudio.css';

const PAGE = 60;

export default function PreceptStudio() {
  usePageTitle(pageTitle('Precepts'), 'Precept upon precept — every place one passage of the corpus quotes another, across all its books, with the linked verses side by side.');
  const [sp, setSp] = useSearchParams();
  const book = parseInt(sp.get('book'), 10) || null;
  const status = sp.get('status') || 'any';
  const kind = sp.get('kind') || 'any';
  const setParam = (k, v) => setSp(prev => { const p = new URLSearchParams(prev); if (v == null || v === '' || v === 'any') p.delete(k); else p.set(k, String(v)); p.delete('page'); return p; });
  const page = parseInt(sp.get('page'), 10) || 0;

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s?.isAdmin)).catch(() => {}); }, []);

  const [meta, setMeta] = useState(null);       // { enabled, built_at, books }
  useEffect(() => { apiPreceptBooks().then(setMeta).catch(() => setMeta({ enabled: false, books: [] })); }, []);

  // slugs for the "open in the reader" links
  const [order, setOrder] = useState([]);
  useEffect(() => { apiBookOrder().then(d => setOrder(Array.isArray(d) ? d : (d?.books || []))).catch(() => {}); }, []);
  // same shape Reader.jsx feeds buildBookSlugs (its idOf: id ?? book_id ?? canon_id)
  const { idToSlug } = useMemo(() => buildBookSlugs(order.map(mb => ({ id: mb.id ?? mb.book_id ?? mb.canon_id, name: mb.name }))), [order]);

  const [list, setList] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    apiPreceptList({ book, status, kind, limit: PAGE, offset: page * PAGE })
      .then(d => { if (live) { setList(d || { total: 0, items: [] }); setLoading(false); } })
      .catch(() => { if (live) { setList({ total: 0, items: [] }); setLoading(false); } });
    return () => { live = false; };
  }, [book, status, kind, page]);

  const review = useCallback(async (item, newStatus) => {
    try {
      await apiPreceptReview(item.from, item.to, newStatus);
      setList(prev => ({ ...prev, items: prev.items.map(it => it === item ? { ...it, status: newStatus === 'clear' ? null : newStatus } : it) }));
    } catch (e) { console.warn('precept review failed', e); }
  }, []);

  // ── add a precept by hand ("Genesis 1:1" → "Jubilees 2:1") ─────────────
  // Any book of the corpus, by the name the reader shows for it; the pair is
  // stored as a 'manual' review, so it shows in the reader immediately and
  // survives every rebuild of precepts.db.
  const [addFrom, setAddFrom] = useState('');
  const [addTo, setAddTo] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const parseRef = useCallback((str) => {
    const m = /^\s*(.+?)\s+(\d+)[:.](\d+)\s*$/.exec(str || '');
    if (!m) return null;
    const want = m[1].toLowerCase().replace(/^psalm$/, 'psalms');
    const b = order.find(mb => String(mb.name || '').toLowerCase() === want)
           || order.find(mb => String(mb.name || '').toLowerCase().startsWith(want));
    const id = b ? (b.id ?? b.book_id ?? b.canon_id) : null;
    return id ? { book: id, chapter: +m[2], verse: +m[3], name: b.name } : null;
  }, [order]);
  const addPrecept = useCallback(async (e) => {
    e.preventDefault();
    const from = parseRef(addFrom), to = parseRef(addTo);
    if (!from || !to) { setAddMsg('Write both as "Book chapter:verse" — e.g. Genesis 1:1'); return; }
    if (from.book === to.book && from.chapter === to.chapter && from.verse === to.verse) { setAddMsg('A verse cannot be its own precept.'); return; }
    try {
      await apiPreceptReview({ book: from.book, chapter: from.chapter, verse: from.verse }, { book: to.book, chapter: to.chapter, verse: to.verse }, 'manual');
      setAddMsg(`Added ${refLabel(from.name, from.chapter, from.verse)} ↔ ${refLabel(to.name, to.chapter, to.verse)}.`);
      setAddFrom(''); setAddTo('');
      setList(prev => ({ total: prev.total + 1, items: [{ from: { ...from, text: '' }, to: { ...to, text: '' }, kind: 'manual', score: 0, status: 'manual' }, ...prev.items] }));
    } catch (err) { setAddMsg(`Could not add: ${err.message || err}`); }
  }, [addFrom, addTo, parseRef]);

  const [q, setQ] = useState('');
  const books = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (meta?.books || []).filter(b => !needle || b.name.toLowerCase().includes(needle));
  }, [meta, q]);
  const activeBook = meta?.books?.find(b => b.book === book) || null;
  const pages = Math.max(1, Math.ceil(list.total / PAGE));
  const readerHref = (r) => `/${bookToParam(r.book, idToSlug)}/${r.chapter}/${r.verse}`;

  return (
    <div className="ps-page">
      <header className="ps-top">
        <Link to="/landing" className="ps-back" title="Home">←</Link>
        <h1 className="ps-h1"><span className="ps-glyph" aria-hidden="true">⁂</span> Precepts</h1>
        <span className="ps-count">
          {meta == null ? '' : !meta.enabled ? 'not built yet' : `${meta.books.reduce((n, b) => n + b.verses, 0).toLocaleString()} verses linked · built ${meta.built_at ? new Date(meta.built_at).toLocaleDateString() : ''}`}
        </span>
      </header>
      <p className="ps-intro">
        Precept upon precept, line upon line — every place one passage of these {meta?.books?.length || ''} books quotes another, found by the words they share
        in the Novel English Bible’s own rendering, so Jubilees answers Genesis and the Psalms answer Hebrews the same way. Pick a book to see what it quotes and
        what quotes it; the ⁂ beside a verse in the reader opens the same list. {isAdmin ? 'You are signed in: confirm, reject or clear any pair — readers only see what you have not rejected.' : ''}
      </p>

      <div className="ps-body">
        <aside className="ps-side">
          <input className="ps-search" type="search" placeholder="Find a book…" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a book" />
          <button type="button" className={`ps-book ${!book ? 'on' : ''}`} onClick={() => setParam('book', null)}>
            <span>All books</span><span className="ps-book-n">strongest first</span>
          </button>
          {books.map(b => (
            <button type="button" key={b.book} className={`ps-book ${book === b.book ? 'on' : ''}`} onClick={() => setParam('book', b.book)}>
              <span>{b.name}</span><span className="ps-book-n">{b.verses}</span>
            </button>
          ))}
        </aside>

        <main className="ps-main">
          <div className="ps-tools">
            <h2 className="ps-h2">{activeBook ? activeBook.name : 'All books'} <span className="ps-total">{list.total.toLocaleString()} pair{list.total === 1 ? '' : 's'}</span></h2>
            <label className="ps-filter">kind
              <select value={kind} onChange={e => setParam('kind', e.target.value)}>
                <option value="any">any</option><option value="quote">quotes</option><option value="parallel">parallels</option><option value="xref">cross-refs</option>
              </select>
            </label>
            <label className="ps-filter">status
              <select value={status} onChange={e => setParam('status', e.target.value)}>
                <option value="any">any</option><option value="unreviewed">unreviewed</option><option value="confirmed">confirmed</option>{isAdmin && <option value="rejected">rejected</option>}
              </select>
            </label>
          </div>

          {isAdmin && (
            <form className="ps-add" onSubmit={addPrecept}>
              <span className="ps-add-label">Add a precept</span>
              <input value={addFrom} onChange={e => setAddFrom(e.target.value)} placeholder="Genesis 1:1" aria-label="From verse" />
              <span aria-hidden="true">↔</span>
              <input value={addTo} onChange={e => setAddTo(e.target.value)} placeholder="Jubilees 2:1" aria-label="To verse" />
              <button type="submit" disabled={!addFrom.trim() || !addTo.trim()}>Add</button>
              {addMsg && <span className="ps-add-msg">{addMsg}</span>}
            </form>
          )}

          {loading && <div className="ps-wait">Loading…</div>}
          {!loading && !list.items.length && <div className="ps-wait">{meta && !meta.enabled ? 'precepts.db has not been built yet — run server/build-precepts.mjs.' : 'Nothing here.'}</div>}
          {list.items.map((it, i) => (
            <article className={`ps-pair ${it.status === 'manual' ? 'confirmed' : (it.status || '')}`} key={`${it.from.book}:${it.from.chapter}:${it.from.verse}|${it.to.book}:${it.to.chapter}:${it.to.verse}`}>
              <div className="ps-pair-head">
                <span className={`pc-kind ${it.kind}`}>{KIND_LABEL[it.kind] || it.kind}</span>
                <span className="ps-score" title="rarity-weighted shared phrases">{it.score}</span>
                {it.status === 'confirmed' && <span className="pc-status">✓ confirmed</span>}
                {it.status === 'manual' && <span className="pc-status">✓ added by hand</span>}
                {it.status === 'rejected' && <span className="pc-status rejected">rejected</span>}
                {isAdmin && (
                  <span className="pc-review">
                    {it.status !== 'confirmed' && it.status !== 'manual' && <button type="button" title="Confirm" onClick={() => review(it, 'confirmed')}>✓</button>}
                    {it.status !== 'rejected' && <button type="button" title={it.status === 'manual' ? 'Remove this hand-added precept' : 'Reject — hide from readers'} onClick={() => review(it, it.status === 'manual' ? 'clear' : 'rejected')}>✗</button>}
                    {it.status && it.status !== 'manual' && <button type="button" title="Clear review" onClick={() => review(it, 'clear')}>↺</button>}
                  </span>
                )}
              </div>
              <div className="ps-pair-body">
                {[it.from, it.to].map((r, side) => (
                  <div className="ps-verse" key={side}>
                    <Link className="ps-ref" to={readerHref(r)}>{refLabel(r.name, r.chapter, r.verse)}</Link>
                    <p className="ps-text">{r.text ? renderVerseNodesWithQuotes(sanitizeText(r.text), 'both') : <em>—</em>}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}

          {pages > 1 && (
            <nav className="ps-pager" aria-label="Pages">
              <button type="button" disabled={page <= 0} onClick={() => setSp(prev => { const p = new URLSearchParams(prev); p.set('page', String(page - 1)); return p; })}>‹ Previous</button>
              <span>{page + 1} / {pages}</span>
              <button type="button" disabled={page >= pages - 1} onClick={() => setSp(prev => { const p = new URLSearchParams(prev); p.set('page', String(page + 1)); return p; })}>Next ›</button>
            </nav>
          )}
        </main>
      </div>
    </div>
  );
}
