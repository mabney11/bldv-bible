import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDivineTitles, apiDivineTitleRefs, apiBookOrder, apiTokens, apiDocTokens, apiTransChapter } from '../lib/api.js';
import { parallelHref } from '../lib/bookSlug.js';
import WordBlock from './WordBlock.jsx';
import './DivineTitles.css';

// Divine Titles tab (/lexicon-page?tab=divine) — every name and honorific title
// of Yah, with every verse it occurs in across the whole corpus: BHS for the OT,
// the HEB edition for the NT / Apocrypha / Josephus, and the Works Library docs.
// Everything is baked into surface-index.db (server/build-divine-titles.js); this
// page only reads it. Transliterations come from the server (strongs-roots.json
// + the hyphen allowlist) — never spelled here.
//
// fieldy, 2026-09-24: stay on this page — pick a written variant ("only Yahaw"),
// click a chapter:verse and the verse loads right here with that word
// highlighted, with a link out to the verse if wanted. Books the main reader
// shows come first (in its own order); every other work sits behind "More works".

const GROUPS = [
  { key: 'name',     label: 'The Name' },
  { key: 'title',    label: 'Titles' },
  { key: 'compound', label: 'Compound titles' },
  { key: 'other',    label: 'Other gods — the same words, not gold' },
];
const SRC_LABEL = { BHS: 'Hebrew (BHS)', HEB: 'Hebrew extra', DOC: 'Works Library' };
const fmt = n => Number(n || 0).toLocaleString();

function verseHref(book, c, v) {
  if (book.src === 'DOC') return `/?source=HEB&doc=${encodeURIComponent(book.code)}&chapter=${c}&verse=${v}`;
  return parallelHref(book.book_id, null, c, v, book.src === 'HEB' ? 'HEB' : null);
}

// One fetch per chapter for the life of the page — opening several verses of
// the same chapter (Psalm 150:1 … 150:6) costs a single request.
const _chapterCache = new Map();
function loadChapter(book, c) {
  const key = `${book.src}|${book.book_id ?? book.code}|${c}`;
  if (!_chapterCache.has(key)) {
    const words = book.src === 'DOC'
      ? apiDocTokens(book.code, c)
      : apiTokens(book.book_id, c, book.src === 'HEB' ? 'HEB' : undefined);
    const english = book.src === 'DOC' ? Promise.resolve({ verses: [] }) : apiTransChapter(book.book_id, c).catch(() => ({ verses: [] }));
    _chapterCache.set(key, Promise.all([words, english]).catch(e => { _chapterCache.delete(key); throw e; }));
  }
  return _chapterCache.get(key);
}

// The written token(s) a word block came from — sourceTokens when the server
// sends them (every /api/tokens path does), else the word's own surface.
const wordRaws = w => (Array.isArray(w.sourceTokens) && w.sourceTokens.length)
  ? w.sourceTokens.map(t => t.word_raw).filter(Boolean)
  : [w.word_raw].filter(Boolean);

// Is this word one of the focus words? A title word carries the server's gold
// mark (comp.divine) — required, so the preposition 𐤀𐤋 "to" never lights up
// next to Al. "Other gods" words are never gold, so they match on spelling alone.
function isFocus(w, forms, kind) {
  if (!forms.size) return false;
  if (!wordRaws(w).some(r => forms.has(r))) return false;
  if (kind === 'other') return true;
  return (w.components || []).some(c => c && c.divine);
}

function VersePanel({ book, c, v, focusForms, kind, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let off = false;
    setData(null); setErr(null);
    loadChapter(book, c)
      .then(([words, eng]) => { if (!off) setData({ words: (Array.isArray(words) ? words : []).filter(w => w.verse === v), english: (eng.verses || []).find(x => x.verse === v)?.text || '' }); })
      .catch(e => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, [book, c, v]);
  return (
    <div className="dt-verse">
      <div className="dt-verse-h">
        <span className="dt-verse-ref">{book.name} {c}:{v}</span>
        <Link className="dt-verse-go" to={verseHref(book, c, v)}>Open verse →</Link>
        <button className="dt-verse-x" onClick={onClose} aria-label="Close verse">✕</button>
      </div>
      {err && <div className="dt-msg">⚠ {err}</div>}
      {!data && !err && <div className="dt-msg"><span className="spin">◌</span> Loading verse…</div>}
      {data && (
        <>
          {data.english && <p className="dt-verse-en">{data.english}</p>}
          <div className="dt-verse-words" dir="rtl">
            {data.words.map((w, i) => (
              <WordBlock key={i} wordObj={w} showSub showCopyBtn={false} showStrongs
                         className={isFocus(w, focusForms, kind) ? 'dt-focus' : ''} />
            ))}
            {!data.words.length && <div className="dt-msg">No Hebrew tokens for this verse.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function BookRefs({ book, openAll, form, kind }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);   // [c, v, formsAtRef]
  useEffect(() => { setOpen(openAll); }, [openAll]);
  const n = book.refs.reduce((a, r) => a + (form ? (r[3]?.[form] || 0) : r[2]), 0);
  // Which written forms to highlight: the chosen variant, else every form at that verse.
  const focusForms = useMemo(() => {
    if (!active) return new Set();
    const fs = form ? [form] : Object.keys(active[2] || {});
    return new Set(fs.flatMap(f => f.split(' ')));
  }, [active, form]);
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
          {book.refs.map(([c, v, k, forms]) => {
            const on = active && active[0] === c && active[1] === v;
            return (
              <button key={`${c}:${v}`} className={`dt-ref ${on ? 'on' : ''}`}
                      onClick={() => setActive(on ? null : [c, v, forms])}>
                {c}:{v}{k > 1 && !form && <sup>×{k}</sup>}
              </button>
            );
          })}
        </div>
      )}
      {open && active && (
        <VersePanel book={book} c={active[0]} v={active[1]} focusForms={focusForms} kind={kind}
                    onClose={() => setActive(null)} />
      )}
    </div>
  );
}

function TitleCard({ t, readerOrder }) {
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState(null);
  const [err, setErr] = useState(null);
  const [openAll, setOpenAll] = useState(false);
  const [form, setForm] = useState(null);         // one written variant, or null = all
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    if (!open || refs) return;
    apiDivineTitleRefs(t.id).then(d => setRefs(d.books || [])).catch(e => setErr(e.message));
  }, [open, refs, t.id]);

  // Filter to the chosen variant, then split: books the main reader shows (in
  // its order) vs every other work.
  const { main, more } = useMemo(() => {
    const main = [], more = [];
    for (const b of refs || []) {
      const rs = form ? b.refs.filter(r => r[3] && r[3][form]) : b.refs;
      if (!rs.length) continue;
      const bb = { ...b, refs: rs };
      if (b.src !== 'DOC' && readerOrder.has(b.book_id)) main.push(bb); else more.push(bb);
    }
    main.sort((a, b) => readerOrder.get(a.book_id) - readerOrder.get(b.book_id));
    return { main, more };
  }, [refs, form, readerOrder]);
  const moreCount = more.reduce((a, b) => a + b.refs.length, 0);
  const isOther = t.kind === 'other';
  const multiBook = main.length + (showMore ? more.length : 0) > 1;

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
            {t.forms && t.forms.length > 1 && (
              <button className={`dt-form ${form ? '' : 'on'}`} onClick={() => setForm(null)}>All forms</button>
            )}
            {(t.forms || []).map(f => (
              <button key={f.paleo} className={`dt-form ${form === f.paleo ? 'on' : ''}`}
                      title={`${fmt(f.n)}× — show only these`}
                      onClick={() => setForm(form === f.paleo ? null : f.paleo)}>
                <span className="dt-form-paleo" dir="rtl">{f.paleo}</span>
                <span className="dt-form-tr">{f.translit}</span>
                <span className="dt-form-n">{fmt(f.n)}</span>
              </button>
            ))}
          </div>
          {err && <div className="dt-msg">⚠ {err}</div>}
          {!refs && !err && <div className="dt-msg"><span className="spin">◌</span> Loading references…</div>}
          {refs && (
            <>
              {multiBook && (
                <button className="dt-openall" onClick={() => setOpenAll(o => !o)}>
                  {openAll ? 'Collapse all books' : 'Expand all books'}
                </button>
              )}
              {main.map(b => <BookRefs key={`${b.src}:${b.book_id}`} book={b} form={form} kind={t.kind}
                                       openAll={openAll || (main.length === 1 && !more.length)} />)}
              {!main.length && !more.length && <div className="dt-msg">No verses for this form.</div>}
              {more.length > 0 && (
                <div className="dt-more">
                  <button className="dt-more-h" onClick={() => setShowMore(s => !s)} aria-expanded={showMore}>
                    <span className="dt-chev">{showMore ? '▾' : '▸'}</span>
                    More works <small>{fmt(more.length)} work{more.length === 1 ? '' : 's'} · {fmt(moreCount)} verse{moreCount === 1 ? '' : 's'}</small>
                  </button>
                  {showMore && more.map(b => <BookRefs key={`${b.src}:${b.book_id ?? b.code}`} book={b} form={form} kind={t.kind}
                                                        openAll={openAll || (!main.length && more.length === 1)} />)}
                </div>
              )}
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
  const [readerOrder, setReaderOrder] = useState(new Map());   // canon id -> position in the main reader
  useEffect(() => {
    let off = false;
    apiDivineTitles().then(d => { if (!off) setData(d); }).catch(e => { if (!off) setErr(e.message); });
    apiBookOrder().then(list => { if (!off) setReaderOrder(new Map((list || []).map((b, i) => [b.id, i]))); }).catch(() => {});
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
  if (!data) return <div className="lex-state-msg"><span className="spin">◌</span> Loading titles…</div>;
  return (
    <div className="dt-wrap">
      <p className="dt-intro">
        Every name and honorific title of Yah, across the whole corpus — the words shown
        in <span className="dt-gold">gold</span> in the word-by-word chips. Open a title, pick a
        written form to narrow it, and tap a verse to read it here.
      </p>
      {groups.map(g => (
        <div key={g.key} className="dt-group">
          <h2 className="dt-group-h">{g.label}</h2>
          {g.items.map(t => <TitleCard key={t.id} t={t} readerOrder={readerOrder} />)}
        </div>
      ))}
      {!groups.length && <div className="lex-state-msg">No titles match “{query}”.</div>}
    </div>
  );
}
