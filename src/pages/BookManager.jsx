import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStatus } from '../lib/localOverlay.js';
import './BookManager.css';

/**
 * BookManager — admin screen for the master book list (book-order.json) and
 * the promote/demote registry (canon_id assignment, assign-canon-ids.py's job
 * done live instead of by editing Python).
 *
 * - Drag rows in the "In the book list" column to reorder — writes the whole
 *   book-order.json order array back in one shot (POST /api/admin/book-order).
 * - "Add to book list ->" promotes a Works-Library-only work (assigns it an
 *   unused canon_id, appends it at the end of the order — drag it into place
 *   afterward).
 * - "Remove from list" demotes a book back to Works-Library-only. This never
 *   deletes any text — the verses stay in corpus.db, just without a canon_id,
 *   same as "don't include this book" without losing the source text.
 *
 * Not linked prominently anywhere — bookmark /book-manager, same as /admin-login.
 * Requires being logged in as admin (see AdminLogin.jsx) whenever ADMIN_KEY is set.
 */
export default function BookManager() {
  const [status, setStatus] = useState(null);
  const [promoted, setPromoted] = useState([]);
  const [works, setWorks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const dragIndex = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/admin/registry');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${r.status} ${r.statusText}`);
      const body = await r.json();
      setPromoted(body.promoted || []);
      setWorks(body.works || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    getAdminStatus().then(setStatus);
  }, []);
  useEffect(() => {
    if (status && status.isAdmin) load();
  }, [status, load]);

  const saveOrder = async (list) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/admin/book-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: list.map(({ id, name }) => ({ id, name })) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${r.status} ${r.statusText}`);
      setPromoted(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onDragStart = (i) => () => { dragIndex.current = i; };
  const onDrop = (i) => (e) => {
    e.preventDefault();
    const from = dragIndex.current;
    if (from == null || from === i) return;
    const next = promoted.slice();
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    dragIndex.current = null;
    saveOrder(next);
  };

  const nextCanonId = () => {
    const used = new Set(promoted.map(p => p.id));
    let n = 200;
    while (used.has(n)) n++;
    return n;
  };

  const promote = async (w) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/admin/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpus: w.corpus, code: w.code, canon_id: nextCanonId(), name: w.title || w.code }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${r.status} ${r.statusText}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const demote = async (p) => {
    if (!confirm(`Remove "${p.name}" from the book list? The text stays in the Works Library — nothing is deleted.`)) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/admin/demote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canon_id: p.id }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${r.status} ${r.statusText}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredWorks = works.filter(w =>
    !filter.trim() || (w.title || w.code || '').toLowerCase().includes(filter.trim().toLowerCase()));

  if (status === null) return <div className="bm-page"><p>Checking admin status…</p></div>;

  if (!status.isAdmin) {
    return (
      <div className="bm-page">
        <p>
          {status.configured
            ? <>You need to be logged in as admin to manage the book list. <Link to="/admin-login">Log in</Link>.</>
            : <>Admin login isn't configured on this server (no <code>ADMIN_KEY</code> set) — every request is treated as admin.</>}
        </p>
        {!status.configured && <BookManagerBody {...{ promoted, works: filteredWorks, filter, setFilter, onDragStart, onDrop, promote, demote, busy, error }} />}
      </div>
    );
  }

  return (
    <div className="bm-page">
      <header className="bm-top">
        <Link to="/landing" className="bm-back" aria-label="Home">←</Link>
        <h1>Book Manager</h1>
        {busy && <span className="bm-busy">saving…</span>}
      </header>
      <BookManagerBody {...{ promoted, works: filteredWorks, filter, setFilter, onDragStart, onDrop, promote, demote, busy, error }} />
    </div>
  );
}

function BookManagerBody({ promoted, works, filter, setFilter, onDragStart, onDrop, promote, demote, busy, error }) {
  return (
    <div className="bm-cols">
      <section className="bm-col">
        <h2>In the book list ({promoted.length})</h2>
        <p className="bm-hint">Drag to reorder — this is book-order.json. Every language's dropdown and prev/next follow this order.</p>
        <ul className="bm-list">
          {promoted.map((p, i) => (
            <li key={p.id}
                draggable
                onDragStart={onDragStart(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop(i)}
                className="bm-row bm-draggable">
              <span className="bm-drag-handle">⠿</span>
              <span className="bm-row-name">{p.name}</span>
              <span className="bm-row-meta">id {p.id}</span>
              <button className="bm-remove" disabled={busy} onClick={() => demote(p)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bm-col">
        <h2>Works Library only ({works.length})</h2>
        <p className="bm-hint">Readable under /works, but not in the main book dropdown. Add one to promote it into the list above.</p>
        <input className="bm-filter" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} />
        <ul className="bm-list">
          {works.map(w => (
            <li key={`${w.corpus}:${w.code}`} className="bm-row">
              <span className="bm-row-name">{w.title || w.code}</span>
              <span className="bm-row-meta">{w.corpus} · {w.n_verses} v</span>
              <button className="bm-add" disabled={busy} onClick={() => promote(w)}>Add to book list →</button>
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="bm-error">⚠ {error}</p>}
    </div>
  );
}
