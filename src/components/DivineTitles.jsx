import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDivineTitles, apiDivineTitleRefs } from '../lib/api.js';
import { parallelHref } from '../lib/bookSlug.js';
import './DivineTitles.css';

// Divine Titles tab (/lexicon-page?tab=divine) — every name and honorific title
// of Yah, with every verse it occurs in across the whole corpus: BHS for the OT,
// the HEB edition for the NT / Apocrypha / Josephus, and the Works Library docs.
// Same detector that paints these words gold in the chips (server/divine-titles.js,
// data in server/lexicon/divine-titles.json). Transliterations come from the
// server (strongs-roots.json + the hyphen allowlist) — never spelled here.

const GROUPS = [
  { key: 'name',     label: 'The Name' },
  { key: 'title',    label: 'Titles' },
  { key: 'compound', label: 'Compound titles' },
  { key: 'other',    label: 'Other gods — the same words, not gold' },
];
const SRC_LABEL = { BHS: 'Hebrew (BHS)', HEB: 'Hebrew extra', DOC: 'Works Library' };
const fmt = n => Number(n || 0).toLocaleString();

function refHref(book, c, v) {
  if (book.src === 'DOC') return `/?source=HEB&doc=${encodeURIComponent(book.code)}&chapter=${c}&verse=${v}`;
  return parallelHref(book.book_id, null, c, v, book.src === 'HEB' ? 'HEB' : null);
}

function BookRefs({ book, openAll }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(openAll); }, [openAll]);
  const n = book.refs.reduce((a, r) => a + r[2], 0);
  return (
    <div className="dt-book">
      <button className="dt-book-h" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="dt-chev">{open ? '▾' : '▸'}</span>
        <span className="dt-book-name">{book.name}</span>
        {book.src !== 'BHS' && <span className="dt-src">{SRC_LABEL[book.src]}</span>}
        <span className="dt-book-n">{fmt(n)}</span>
      </button>
      {open && (
        <div className="dt-refs">
          {book.refs.map(([c, v, k]) => (
            <Link key={`${c}:${v}`} className="dt-ref" to={refHref(book, c, v)}>
              {c}:{v}{k > 1 && <sup>×{k}</sup>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TitleCard({ t }) {
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState(null);
  const [err, setErr] = useState(null);
  const [openAll, setOpenAll] = useState(false);
  useEffect(() => {
    if (!open || refs) return;
    apiDivineTitleRefs(t.id).then(d => setRefs(d.books || [])).catch(e => setErr(e.message));
  }, [open, refs, t.id]);
  const isOther = t.kind === 'other';
  return (
    <section className={`dt-card ${isOther ? 'dt-card-other' : ''} ${t.occurrences ? '' : 'dt-card-empty'}`}>
      <button className="dt-card-h" onClick={() => setOpen(o => !o)} aria-expanded={open} disabled={!t.occurrences}>
        <span className="dt-chev">{t.occurrences ? (open ? '▾' : '▸') : '·'}</span>
        {t.paleo && <span className="dt-paleo" dir="rtl">{t.paleo}</span>}
        <span className="dt-label">{t.label}</span>
        {t.en && <span className="dt-en">({t.en})</span>}
        <span className="dt-count">
          {fmt(t.occurrences)} <small>in {fmt(t.verses)} verse{t.verses === 1 ? '' : 's'} · {fmt(t.bookCount)} book{t.bookCount === 1 ? '' : 's'}</small>
        </span>
      </button>
      {open && (
        <div className="dt-body">
          <div className="dt-meta">
            {!isOther && t.sns && <span className="dt-sns">{t.sns.join(' + ')}</span>}
            {t.forms && t.forms.length > 0 && (
              <span className="dt-forms">
                {t.forms.map(f => (
                  <span key={f.paleo} className="dt-form" title={`${fmt(f.n)}×`}>
                    <span className="dt-form-paleo" dir="rtl">{f.paleo}</span>
                    <span className="dt-form-tr">{f.translit}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
          {err && <div className="dt-msg">⚠ {err}</div>}
          {!refs && !err && <div className="dt-msg"><span className="spin">◌</span> Loading references…</div>}
          {refs && (
            <>
              {refs.length > 1 && (
                <button className="dt-openall" onClick={() => setOpenAll(o => !o)}>
                  {openAll ? 'Collapse all books' : `Show all ${fmt(refs.length)} books`}
                </button>
              )}
              {refs.map(b => <BookRefs key={`${b.src}:${b.book_id ?? b.code}`} book={b} openAll={openAll || refs.length === 1} />)}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function DivineTitles({ query = '' }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let off = false;
    apiDivineTitles().then(d => { if (!off) setData(d); }).catch(e => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const all = [...(data.titles || []), ...(data.other ? [data.other] : [])];
    const hit = t => !q || [t.label, t.en, t.paleo, ...(t.sns || [])].some(x => String(x || '').toLowerCase().includes(q));
    return GROUPS.map(g => ({
      ...g,
      items: all.filter(t => (t.group || 'title') === g.key && hit(t))
        .sort((a, b) => g.key === 'compound' ? b.occurrences - a.occurrences : 0),
    })).filter(g => g.items.length);
  }, [data, query]);

  if (err) return <div className="lex-state-msg">⚠ Failed to load<br /><small style={{ color: 'var(--red)' }}>{err}</small></div>;
  if (!data) return <div className="lex-state-msg"><span className="spin">◌</span> Gathering every title across the corpus…</div>;
  return (
    <div className="dt-wrap">
      <p className="dt-intro">
        Every name and honorific title of Yah, across the whole corpus. These are the words shown
        in <span className="dt-gold">gold</span> in the word-by-word chips. Open a title to see
        every verse, grouped by book.
      </p>
      {groups.map(g => (
        <div key={g.key} className="dt-group">
          <h2 className="dt-group-h">{g.label}</h2>
          {g.items.map(t => <TitleCard key={t.id} t={t} />)}
        </div>
      ))}
      {!groups.length && <div className="lex-state-msg">No titles match “{query}”.</div>}
    </div>
  );
}
