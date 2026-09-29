/**
 * Progress.jsx — /progress: fieldy's translation, verse by verse, for readers.
 * 2026-09-29: "id like my users to be able to see my progress in translation
 * studio". Read-only and public — the Translation Studio's own counts
 * (/api/translate/progress) and the verses he has marked (/api/translate/marked).
 * Every translated verse opens its Detailed Verse page, where his 𐤌 sits.
 *
 * ?book=<slug> opens that book's verse grid (shareable).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiTransProgress, apiTransMarked } from '../lib/api.js';
import { buildBookSlugs } from '../lib/bookSlug.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { TRANSLATOR, TRANSLATE_WORD } from '../components/TranslatedMark.jsx';
import './Models.css';
import './Progress.css';

const pct = (n, d) => (d ? (n / d) * 100 : 0);
const fmtPct = (p) => (p === 0 ? '0%' : p < 0.1 ? '<0.1%' : p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`);
function fmtDate(t) {
  if (!t) return '';
  const d = new Date(String(t).replace(' ', 'T') + (/[zZ+]/.test(t) ? '' : 'Z'));
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function Bar({ done, ip, total }) {
  return (
    <span className="pg-bar" aria-hidden="true">
      <span className="pg-bar-done" style={{ width: `${pct(done, total)}%` }} />
      <span className="pg-bar-ip" style={{ width: `${pct(ip, total)}%` }} />
    </span>
  );
}

export default function Progress() {
  usePageTitle(pageTitle('Translation Progress'), `${TRANSLATOR.name}'s translation of the scriptures, verse by verse — every verse translated so far, book by book and chapter by chapter, each one open in English with its original Hebrew word by word.`);
  const [progress, setProgress] = useState(null);
  const [marked, setMarked] = useState(null);
  const [err, setErr] = useState('');
  const [params, setParams] = useSearchParams();
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    apiTransProgress().then(setProgress).catch((e) => setErr(e.message || 'failed'));
    apiTransMarked().then(setMarked).catch(() => setMarked({ verses: [] }));
  }, []);

  const books = progress?.books || [];
  const { slugToId, idToSlug } = useMemo(() => buildBookSlugs(books.map((b) => ({ id: b.book_id, name: b.name }))), [books]);
  const nameOf = useMemo(() => Object.fromEntries(books.map((b) => [b.book_id, b.name])), [books]);
  const status = useMemo(() => {   // "b:c:v" -> {s,t}
    const m = new Map();
    for (const r of marked?.verses || []) m.set(`${r.b}:${r.c}:${r.v}`, r);
    return m;
  }, [marked]);

  const totals = useMemo(() => books.reduce((a, b) => ({ total: a.total + b.total, done: a.done + b.done, ip: a.ip + b.in_progress }), { total: 0, done: 0, ip: 0 }), [books]);
  const started = books.filter((b) => b.done || b.in_progress);
  const untouched = books.filter((b) => !b.done && !b.in_progress);
  const recent = useMemo(() => (marked?.verses || []).filter((r) => r.s === 'd' && r.t).sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 12), [marked]);
  const openSlug = params.get('book');
  const openId = openSlug ? slugToId[openSlug] : null;
  const toggle = (id) => {
    const next = new URLSearchParams(params);
    if (openId === id) next.delete('book'); else next.set('book', idToSlug[id]);
    setParams(next, { replace: true });
  };
  const verseHref = (b, c, v) => `/${idToSlug[b] || b}/${c}/${v}`;

  const bookRow = (b) => {
    const open = openId === b.book_id;
    return (
      <li key={b.book_id} className={`pg-book${open ? ' open' : ''}`}>
        <button type="button" className="pg-book-head" onClick={() => toggle(b.book_id)} aria-expanded={open}>
          <span className="pg-book-name">{b.name}</span>
          <Bar done={b.done} ip={b.in_progress} total={b.total} />
          <span className="pg-book-num">{b.done ? <><b>{b.done}</b> / {b.total}</> : <>{b.in_progress} in progress</>}</span>
          <span className="pg-book-pct">{fmtPct(pct(b.done, b.total))}</span>
        </button>
        {open && (
          <div className="pg-chapters">
            {b.chapters.map((ch) => (
              <div key={ch.chapter} className="pg-ch">
                <span className="pg-ch-num" title={`Chapter ${ch.chapter}: ${ch.done} of ${ch.total} translated`}>{ch.chapter}</span>
                <span className="pg-cells">
                  {Array.from({ length: ch.total }, (_, i) => {
                    const v = i + 1;
                    const r = status.get(`${b.book_id}:${ch.chapter}:${v}`);
                    const cls = r?.s === 'd' ? 'd' : r?.s === 'p' ? 'p' : '';
                    const label = `${b.name} ${ch.chapter}:${v}${cls === 'd' ? ' — translated' : cls === 'p' ? ' — in progress' : ''}`;
                    return <Link key={v} to={verseHref(b.book_id, ch.chapter, v)} className={`pg-cell ${cls}`} title={label} aria-label={label} />;
                  })}
                </span>
                <span className="pg-ch-count">{ch.done ? `${ch.done}/${ch.total}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="models-page pg-page">
      <header className="models-top">
        <Link to="/landing" className="models-back" title="Home">←</Link>
        <h1 className="models-h1">Translation Progress</h1>
        <Link to="/translate?book=1&chapter=1&verse=1" className="models-other">Translation Studio →</Link>
      </header>

      <section className="pg-hero">
        <span className="pg-hero-mark" aria-hidden="true">{TRANSLATOR.mark}</span>
        <div className="pg-hero-text">
          <p className="pg-hero-lead"><em>{TRANSLATOR.name}</em>, <em>ibaday Yahawah Alahayam</em> (servant of Yahawah Alahayam), <em>yad {TRANSLATE_WORD.translit}</em> (hand {TRANSLATE_WORD.gloss})</p>
          <p className="pg-hero-sub">The scriptures translated verse by verse from the Hebrew. A verse marked translated carries the <span className="pg-inline-mark">{TRANSLATOR.mark}</span> on its Detailed Verse page.</p>
        </div>
        <span className="pg-hero-sig" dir="rtl">{TRANSLATOR.paleo}</span>
      </section>

      {err && <p className="models-none">Couldn't load the progress — {err}</p>}
      {!progress && !err && <p className="models-none">Loading…</p>}

      {progress && (
        <>
          <section className="pg-stats" aria-label="Totals">
            <div className="pg-stat"><b>{totals.done.toLocaleString()}</b><span>verses translated</span></div>
            <div className="pg-stat"><b>{totals.ip.toLocaleString()}</b><span>in progress</span></div>
            <div className="pg-stat"><b>{started.length}</b><span>{started.length === 1 ? 'book' : 'books'} under way</span></div>
            <div className="pg-stat"><b>{fmtPct(pct(totals.done, totals.total))}</b><span>of {totals.total.toLocaleString()} verses</span></div>
          </section>

          {recent.length > 0 && (
            <section className="pg-sec">
              <h2 className="pg-h2">Lately translated</h2>
              <div className="pg-recent">
                {recent.map((r) => (
                  <Link key={`${r.b}:${r.c}:${r.v}`} to={verseHref(r.b, r.c, r.v)} className="pg-recent-item">
                    <span className="pg-recent-mark" aria-hidden="true">{TRANSLATOR.mark}</span>
                    <span className="pg-recent-ref">{nameOf[r.b] || r.b} {r.c}:{r.v}</span>
                    <span className="pg-recent-date">{fmtDate(r.t)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="pg-sec">
            <h2 className="pg-h2">Under way</h2>
            <p className="pg-legend"><span className="pg-cell d" /> translated <span className="pg-cell p" /> in progress <span className="pg-cell" /> not yet · open a book to see every verse; tap one to read it</p>
            <ul className="pg-books">{started.map(bookRow)}</ul>
          </section>

          {untouched.length > 0 && (
            <section className="pg-sec">
              <button type="button" className="pg-more" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
                {showAll ? 'Hide' : 'Show'} the {untouched.length} books not yet begun {showAll ? '▴' : '▾'}
              </button>
              {showAll && <ul className="pg-books pg-books-dim">{untouched.map(bookRow)}</ul>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
