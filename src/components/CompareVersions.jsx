// CompareVersions — OWNER-ONLY panel in Translation Studio (2026-10-29).
//
// fieldy: "a few english versions for verification -- all hidden from users ... every
// version better say the same things in general because it is translating from a source
// that they did not create" / "in translation studio i can see whats written in the
// different versions".
//
// Reads /api/admin/compare-versions (server/versions.db, scripts/build-compare-versions.py):
// public-domain KJV ASV YLT Darby DRC JPS BBE BSB. Rendered only for the owner session (or a
// local server with no ADMIN_KEY, where the whole Studio is open). NKJV / NLV are copyrighted,
// so they are LINKS to BibleGateway, never stored text.
import { useEffect, useState } from 'react';
import { getAdminStatus } from '../lib/localOverlay.js';
import { BOOK_NAMES } from '../lib/books.js';
import './CompareVersions.css';

const LINKED = [
  ['NKJV', 'New King James Version'],
  ['NLV', 'New Life Version'],
];
const OPEN_KEY = 'tr-compare-open';

export default function CompareVersions({ book, chapter, verse }) {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAdminStatus().then(s => setAllowed(!!s.isAdmin || !s.configured)).catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (!allowed || !open || !book || !chapter || !verse) return;
    let live = true;
    setData(null); setError(null);
    fetch(`/api/admin/compare-versions?book=${book}&chapter=${chapter}&verse=${verse}`, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json()
        : Promise.reject(new Error(r.status === 503 ? 'versions.db is not on this server yet' : `HTTP ${r.status}`)))
      .then(d => { if (live) setData(d); })
      .catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [allowed, open, book, chapter, verse]);

  if (!allowed) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* private mode */ }
  };
  const name = BOOK_NAMES[book];
  const gatewayRef = name && book <= 66 ? encodeURIComponent(`${name} ${chapter}:${verse}`) : null;

  return (
    <section className="cv-section" aria-label="Other English versions (only you can see this)">
      <div className="tr-section-label">
        <button type="button" className="cv-toggle" onClick={toggle} aria-expanded={open}>
          <span className="cv-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          Other versions
        </button>
        <span className="cv-private" title="Hidden from readers: served only to your admin session">only you</span>
      </div>
      {open && (
        <div className="cv-body">
          {error && <div className="cv-empty">{error}</div>}
          {!error && !data && <div className="cv-empty">Loading…</div>}
          {data && data.versions.filter(v => v.covers !== false).map(v => (
            <div key={v.id} className="cv-row">
              <div className="cv-id" title={`${v.label} (${v.year})${v.note ? ' · ' + v.note : ''}`}>{v.id}</div>
              <div className={v.text ? 'cv-text' : 'cv-text cv-missing'}>{v.text || 'not in this edition'}</div>
            </div>
          ))}
          {gatewayRef && (
            <div className="cv-links">
              {LINKED.map(([id, label]) => (
                <a key={id} href={`https://www.biblegateway.com/passage/?search=${gatewayRef}&version=${id}`}
                   target="_blank" rel="noopener noreferrer" title={`${label}, on BibleGateway (copyrighted, not stored here)`}>
                  {id} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
