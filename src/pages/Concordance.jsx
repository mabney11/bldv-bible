import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiConcordanceLemma, apiConcordanceSurface, apiSourceVerse } from '../lib/api.js';
import { BOOK_NAMES } from '../lib/books.js';
import detectScript from '../lib/scripts.js';
import MultiWordBlock from '../components/MultiWordBlock.jsx';
import './Root.css';

/**
 * Concordance — per-word study page for Greek / Ge'ez / Latin, driven by
 * concordance.db. Two-pane navigator:
 *   • LEFT  — every hit in its own scrollbox (thousands is fine), plus a
 *             collapsible scope / surface-forms / by-book filter.
 *   • RIGHT — the selected match as readable scripture: the full verse text in
 *             its proper script/direction, with the matched word highlighted.
 * Clicking a hit loads its verse in the centre; the By-book list focuses the
 * hit scrollbox onto one book/work (the server narrows occurrences to it while
 * the breakdowns stay global). Hits load a page at a time.
 */
const DEFAULT_LIMIT = 100;   // hits fetched on first load
const PAGE = 200;            // how many more "Show more" pulls in

const READER_SRC = { GNT:'LXX', LXX:'LXX', GRC:'GRC', GEZ:'GEZ', LAT:'LAT', SYR:'SYR', COP:'COP', ENG:'ENG', HEB:'HEB' };
const FONT = (corpus) =>
  corpus === 'GEZ' ? "'Abyssinica SIL','Noto Sans Ethiopic',serif"
  : corpus === 'SYR' ? "'Noto Sans Syriac','Estrangelo Edessa',serif"
  : corpus === 'COP' ? "'Noto Sans Coptic','Antinoou',serif"
  : corpus === 'LAT' ? "'Cardo','Times New Roman',serif"
  : "'Cardo','GFS Didot',serif";

// Self-contained layout so the two-pane behaviour doesn't depend on Root.css.

// ── Display QA ────────────────────────────────────────────────────────────────
// Critical editions litter the text with editorial apparatus — supplied letters
// in (parens), lacunae as / or //, half-brackets ⸢ ⸣, and trailing punctuation.
// concordance.db stores those raw in `surface`, so headwords show up as
// "ἀνατο///λὰς," or "(δ)ὲ". Strip the apparatus and trim edge punctuation for
// display (and for matching), keeping the letters and accents intact.
const EDITORIAL = /[()\[\]{}⟦⟧⸢⸣⸤⸥⌊⌋\/\\|]/g;
const EDGE_PUNCT = /^[\s.,··;:!?·'"”“’‘\u0387\u00b7\u2010-\u2015\u2026]+|[\s.,··;:!?·'"”“’‘\u0387\u00b7\u2010-\u2015\u2026]+$/g;
const cleanSurface = (s) => String(s || '').replace(EDITORIAL, '').replace(EDGE_PUNCT, '').trim();
// For highlight matching: clean + lowercase (accents kept so δὲ ≠ δέ stays honest).
const matchKey = (s) => cleanSurface(s).toLowerCase();

const LAYOUT_CSS = `
.conc2-body{display:flex;flex:1;min-height:0;overflow:hidden;}
.conc2-side{width:368px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border);background:var(--bg);}
.conc2-side-head{padding:12px 14px;border-bottom:1px solid var(--border);}
.conc2-fold{border-bottom:1px solid var(--border);}
.conc2-fold>summary{cursor:pointer;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text3);user-select:none;display:flex;justify-content:space-between;}
.conc2-fold[open]>summary{color:var(--gold);}
.conc2-fold-body{max-height:28vh;overflow-y:auto;padding:4px 0 8px;}
.conc2-hits-head{padding:8px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.conc2-hits{flex:1;min-height:0;overflow-y:auto;}
.conc2-hit{display:block;width:100%;text-align:left;padding:9px 14px;border:none;border-bottom:1px solid var(--border);border-left:3px solid transparent;background:transparent;color:inherit;cursor:pointer;font:inherit;}
.conc2-hit:hover{background:var(--bg3);}
.conc2-hit.active{background:var(--bg3);border-left-color:var(--gold);}
.conc2-hit-ref{font-size:12px;font-weight:700;color:var(--text2);}
.conc2-hit-surf{font-size:17px;color:var(--gold);margin-top:1px;line-height:1.3;}
.conc2-main{flex:1;min-width:0;overflow-y:auto;padding:26px 32px;}
.conc2-bookbtn{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:transparent;border:none;border-left:2px solid transparent;cursor:pointer;font:inherit;color:inherit;padding:5px 14px;}
.conc2-bookbtn:hover{background:var(--bg3);}
.conc2-bookbtn.active{background:var(--bg3);border-left-color:var(--gold);}
.conc2-chip{font-size:12px;padding:3px 9px;border-radius:12px;background:var(--bg3);border:1px solid var(--border2);}
.conc2-btn{font-size:12px;padding:4px 11px;border-radius:8px;cursor:pointer;background:var(--bg3);border:1px solid var(--border2);color:var(--text2);}
.conc2-btn:hover{border-color:var(--border3);color:var(--text);}
.conc2-btn:disabled{opacity:.45;cursor:default;}
.conc2-verse{display:flex;flex-wrap:wrap;gap:22px 16px;align-items:flex-start;}
.conc2-word{display:inline-flex;}
.conc2-word-hit{outline:2px solid var(--gold);outline-offset:3px;border-radius:8px;background:color-mix(in srgb, var(--gold) 14%, transparent);}
@media(max-width:820px){
  /* Mobile: the whole page becomes ONE scroll. No nested scroll containers
     (those trap the touch gesture and hide the verse), and the verse
     centerpiece is ordered FIRST so the actual text is immediately visible. */
  .root-page.root-page{height:auto;min-height:100vh;overflow:visible;}
  .conc2-body{flex-direction:column;overflow:visible;height:auto;min-height:0;}
  .conc2-main{order:1;flex:none;height:auto;overflow:visible;padding:18px 16px;border-bottom:1px solid var(--border);}
  .conc2-side{order:2;width:auto;border-right:none;overflow:visible;min-height:0;}
  .conc2-hits{flex:none;max-height:none;overflow:visible;}
  .conc2-fold-body{max-height:none;overflow:visible;}
}
`;

export default function Concordance() {
  const [sp] = useSearchParams();
  const corpus = (sp.get('corpus') || 'GNT').toUpperCase();
  const lemma = sp.get('lemma');
  const word = sp.get('word');
  const readerSrc = sp.get('source') || READER_SRC[corpus] || 'LXX';

  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [focus, setFocus] = useState(null);          // { book?:id, doc?:code, label } | null
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sel, setSel] = useState(0);                 // selected hit index
  const [verse, setVerse] = useState(null);          // { text, ... } for the centre pane
  const [verseState, setVerseState] = useState('idle'); // idle | loading | error

  const qkey = `${corpus}|${lemma || ''}|${word || ''}`;

  // A "bad corpus" / unsupported-corpus error means this URL has nothing to
  // show (and never will — e.g. concordance?corpus=ENG, which concordance.db
  // has no data for). Tell search engines not to index it instead of letting
  // them keep a broken, half-"Loading…" page in the results — this is exactly
  // the state that was showing up in Google for bldbible.com. The tag is
  // added/removed with the error itself, not left behind on navigation.
  useEffect(() => {
    if (!err) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, [err]);

  // Friendlier copy for the handful of error strings the API actually sends
  // (see server.js's /api/concordance/* routes). Anything unrecognized falls
  // back to the raw message so real bugs are still visible/debuggable.
  const friendlyError = (e) => {
    if (e === 'bad corpus') return `No concordance is available for "${corpus}" — it isn't one of the indexed languages.`;
    if (e === 'word required' || e === 'lemma required') return 'No word was given to look up.';
    if (/^concordance\.db/.test(e || '')) return 'The concordance index isn’t built yet — try again later.';
    return e;
  };

  const nameOf = (o) =>
    o.title || (o.canon_id != null ? (BOOK_NAMES[o.canon_id] || `Book ${o.canon_id}`) : (o.doc_id || o.code));
  const srcOf = (o) => o.source || READER_SRC[o.corpus] || readerSrc;
  const refHref = (o) => {
    const loc = o.canon_id != null ? `book=${o.canon_id}` : `doc=${encodeURIComponent(o.doc_id || o.code)}`;
    return `/?source=${srcOf(o)}&${loc}&chapter=${o.ord_c}&verse=${o.ord_v}`;
  };
  const refLabel = (o) => `${nameOf(o)} ${o.ch}:${o.v}`;

  // Reset everything when the target word changes.
  useEffect(() => {
    setFocus(null); setLimit(DEFAULT_LIMIT); setD(null); setErr(null);
    setSel(0); setVerse(null); setVerseState('idle');
  }, [qkey]);

  // Fetch the dossier. Non-focused queries use the shared helpers; a focus
  // selection needs ?book/?doc params the helpers lack, so it fetches directly.
  useEffect(() => {
    let ignore = false;
    setErr(null); setLoadingMore(true);
    const load = () => {
      if (focus && (focus.book != null || focus.doc)) {
        const qs = new URLSearchParams({ corpus, limit: String(limit) });
        if (lemma) qs.set('lemma', lemma); else qs.set('word', word || '');
        if (focus.book != null) qs.set('book', String(focus.book));
        if (focus.doc) qs.set('doc', focus.doc);
        return fetch(`/api/concordance/${lemma ? 'lemma' : 'surface'}?${qs.toString()}`)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
      }
      return lemma ? apiConcordanceLemma(corpus, lemma, limit)
                   : apiConcordanceSurface(corpus, word, limit);
    };
    load()
      .then(r => { if (!ignore) { setD(r); setSel(s => (s < r.occurrences.length ? s : 0)); } })
      .catch(e => { if (!ignore) setErr(String(e.message || e)); })
      .finally(() => { if (!ignore) setLoadingMore(false); });
    return () => { ignore = true; };
  }, [qkey, limit, focus]);

  // The currently selected hit, and a stable key so we only refetch the verse
  // when the actual selection changes (not on every "Show more").
  const hit = d && d.occurrences[sel] ? d.occurrences[sel] : null;
  const hitKey = hit ? `${srcOf(hit)}|${hit.canon_id}|${hit.doc_id || hit.code}|${hit.ord_c}|${hit.ord_v}` : null;

  // Load the selected hit's verse text for the centre pane.
  useEffect(() => {
    if (!hit) { setVerse(null); setVerseState('idle'); return; }
    let ignore = false;
    setVerseState('loading'); setVerse(null);
    const opts = hit.canon_id != null ? { book: hit.canon_id } : { doc: hit.doc_id || hit.code };
    apiSourceVerse(srcOf(hit), opts, hit.ord_c, hit.ord_v)
      .then(r => {
        // /api/source/:src/verse returns the verse FLAT (text/chapter/verse at
        // the top level), not wrapped as { verses: [...] } like /chapter does.
        const row = r && typeof r.text === 'string' ? r
                  : (r && r.verses && r.verses[0]) || null;
        if (!ignore) { setVerse(row); setVerseState('ready'); }
      })
      .catch(() => { if (!ignore) { setVerse(null); setVerseState('error'); } });
    return () => { ignore = true; };
  }, [hitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusBook = (b) => {
    const next = b.canon_id != null ? { book: b.canon_id, label: nameOf(b) } : { doc: b.doc_id || b.code, label: nameOf(b) };
    setLimit(DEFAULT_LIMIT); setSel(0); setFocus(next);
  };
  const isActiveBook = (b) =>
    focus && (b.canon_id != null ? focus.book === b.canon_id : (focus.doc === (b.doc_id || b.code)));

  const headWord = cleanSurface(d ? (lemma || d.display || word) : (lemma || word)) || (lemma || word || '');
  const maxBook = d && d.by_book && d.by_book.length ? Math.max(...d.by_book.map(b => b.n)) : 1;
  const occTotal = d ? (d.focus ? d.focus.count : d.count) : 0;
  const moreAvailable = d && d.occurrences.length < occTotal;

  // Render the verse text in its native script, highlighting the matched form.
  // Matching is whitespace-token based on cleaned forms, so a verse word like
  // "ἀνατολάς," still lights up when the headword is "ἀνατο///λὰς,".
  const renderVerse = (text, surface) => {
    const det = detectScript(text || '');
    const style = { fontFamily: det.font, direction: det.dir, fontSize: 30, lineHeight: 1.95, color: 'var(--text)' };
    if (!text) return null;
    const target = matchKey(surface);
    if (!target) return <div lang={det.lang} dir={det.dir} style={style}>{text}</div>;
    // Split on whitespace, keeping the separators so spacing is preserved.
    const parts = text.split(/(\s+)/);
    let hit = false;
    const out = parts.map((p, i) => {
      if (/^\s+$/.test(p) || !p) return <span key={i}>{p}</span>;
      if (matchKey(p) === target) {
        hit = true;
        return <mark key={i} style={{ background: 'var(--gold)', color: '#111', padding: '0 4px', borderRadius: 4 }}>{p}</mark>;
      }
      return <span key={i}>{p}</span>;
    });
    // Fallback: if token matching found nothing (punctuation glued differently),
    // try the old substring highlight on the cleaned surface.
    if (!hit) {
      const clean = cleanSurface(surface);
      if (clean && text.includes(clean)) {
        const seg = text.split(clean);
        return (
          <div lang={det.lang} dir={det.dir} style={style}>
            {seg.map((p, i) => (
              <span key={i}>{p}{i < seg.length - 1 && (
                <mark style={{ background: 'var(--gold)', color: '#111', padding: '0 4px', borderRadius: 4 }}>{clean}</mark>
              )}</span>
            ))}
          </div>
        );
      }
    }
    return <div lang={det.lang} dir={det.dir} style={style}>{out}</div>;
  };

  // Reader-style verse: each word as a MultiWordBlock (glyph + translit + gloss,
  // or a "— not glossed —" marker), with the matched word(s) outlined. Falls back
  // to plain text when the endpoint didn't return tokens.
  const renderVerseTokens = (tokens, surface, src) => {
    if (!tokens || !tokens.length) return null;
    const det = detectScript((tokens.map(t => t.word).join(' ')) || '');
    const target = matchKey(surface);
    return (
      <div className="conc2-verse" dir={det.dir} style={{ direction: det.dir }}>
        {tokens.map((t, i) => {
          const isHit = !!target && matchKey(t.word) === target;
          return (
            <span key={`${t.ord ?? i}`} className={`conc2-word ${isHit ? 'conc2-word-hit' : ''}`}>
              <MultiWordBlock token={t} source={src} />
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="root-page">
      <style>{LAYOUT_CSS}</style>
      <header className="root-topbar">
        <div className="root-topbar-row1">
          <Link to="/landing" className="root-top-sn" style={{ textDecoration: 'none' }}>‹ home</Link>
          {d && d.strongs && <span className="root-top-sn">{d.strongs}</span>}
          <span className="root-top-title" lang="grc">
            {headWord} {d && <span style={{ opacity: 0.6 }}>— {d.count} occurrence{d.count === 1 ? '' : 's'}{lemma ? ' (by lemma)' : ' (exact form)'}</span>}
          </span>
        </div>
      </header>

      {err ? (
        // A real, final state — not a stray "Loading…" left over from a request
        // that already failed. This is what a dead /concordance link (e.g. an
        // English word, which has no concordance data) now shows instead of
        // silently sitting on "Loading…" forever.
        <div className="root-err" style={{ margin: '40px auto', maxWidth: 480, textAlign: 'center' }}>
          ⚠ {friendlyError(err)}
          <div style={{ marginTop: 14 }}>
            <Link to="/landing" className="conc2-btn" style={{ textDecoration: 'none' }}>‹ back to home</Link>
          </div>
        </div>
      ) : (
      <div className="conc2-body">
        {/* ── LEFT: filters + hit scrollbox ─────────────────────────────── */}
        <aside className="conc2-side">
          <div className="conc2-side-head">
            <div className="rd-paleo" lang="grc" style={{ fontFamily: FONT(corpus), fontSize: 30, color: 'var(--gold)' }}>{headWord}</div>
            <div className="rd-tl" style={{ marginTop: 2 }}>{corpus} · {lemma ? 'lemma' : 'surface form'}</div>
            {d && d.gloss
              ? <div className="rd-def" style={{ marginTop: 4 }}>{d.gloss}</div>
              : d && <div className="rd-def" style={{ marginTop: 4, opacity: 0.6 }} title="No gloss in your lexicon yet — showing the form"
                          lang="grc"><span style={{ opacity: 0.7 }}>[</span>{headWord}<span style={{ opacity: 0.7 }}>]</span></div>}
            {d && d.by_corpus && d.by_corpus.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {d.by_corpus.map((c, i) => <span key={i} className="conc2-chip">{c.corpus} · {c.n}</span>)}
              </div>
            )}
          </div>

          {d && d.by_surface && d.by_surface.length > 0 && (
            <details className="conc2-fold">
              <summary><span>Surface forms</span><span>{d.by_surface.length}</span></summary>
              <div className="conc2-fold-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 14px' }}>
                {d.by_surface.map((s, i) => (
                  <span key={i} style={{ fontFamily: FONT(corpus), fontSize: 17, color: 'var(--gold)' }} title={`${s.n} occ.`}>
                    {cleanSurface(s.display)}<span style={{ fontSize: 10, color: 'var(--text4)', marginLeft: 3 }}>{s.n}</span>
                  </span>
                ))}
              </div>
            </details>
          )}

          {d && d.by_book && d.by_book.length > 0 && (
            <details className="conc2-fold" open>
              <summary><span>By book — tap to filter</span><span>{d.by_book.length}</span></summary>
              <div className="conc2-fold-body">
                {d.by_book.map((b, i) => (
                  <button key={i} type="button" className={`conc2-bookbtn ${isActiveBook(b) ? 'active' : ''}`}
                          onClick={() => focusBook(b)} title={`Show only ${nameOf(b)}`}>
                    <span className="book-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(b)}</span>
                    <span className="book-bar" style={{ width: `${Math.max(6, (b.n / maxBook) * 90)}px` }} />
                    <span className="book-n">{b.n}</span>
                  </button>
                ))}
              </div>
            </details>
          )}

          <div className="conc2-hits-head">
            <span className="root-result-count">
              {!d ? 'Loading…'
                  : d.focus ? `${d.occurrences.length} of ${d.focus.count} in ${focus?.label || 'selection'}`
                            : `${d.occurrences.length} of ${d.count} hits`}
            </span>
            {d && d.focus && (
              <button type="button" className="conc2-btn" onClick={() => { setFocus(null); setLimit(DEFAULT_LIMIT); setSel(0); }}>
                ✕ all
              </button>
            )}
          </div>

          <div className="conc2-hits">
            {d && d.occurrences.map((o, i) => (
              <button key={i} type="button" className={`conc2-hit ${i === sel ? 'active' : ''}`} onClick={() => setSel(i)}>
                <div className="conc2-hit-ref">
                  {refLabel(o)}
                  {o.corpus && o.corpus !== corpus && <span style={{ marginLeft: 6, opacity: 0.55, fontWeight: 400 }}>{o.corpus}</span>}
                </div>
                <div className="conc2-hit-surf" style={{ fontFamily: FONT(o.corpus || corpus) }}>{cleanSurface(o.surface)}</div>
              </button>
            ))}
            {moreAvailable && (
              <button type="button" className="conc2-btn" disabled={loadingMore}
                      onClick={() => setLimit(l => l + PAGE)}
                      style={{ margin: '12px auto', display: 'block' }}>
                {loadingMore ? 'Loading…' : `Show more — ${d.occurrences.length} of ${occTotal}`}
              </button>
            )}
          </div>
        </aside>

        {/* ── RIGHT: the matched verse, as readable scripture ───────────── */}
        <main className="conc2-main">
          {!hit ? (
            <div style={{ color: 'var(--text3)', fontSize: 15, paddingTop: 40 }}>
              {d ? 'Select a hit on the left to read it here.' : 'Loading…'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <h2 style={{ margin: 0, color: 'var(--gold)', fontSize: 22 }}>{refLabel(hit)}</h2>
                {hit.corpus && <span className="conc2-chip">{hit.corpus}</span>}
                <a href={refHref(hit)} className="conc2-btn" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
                  open in reader ↗
                </a>
              </div>

              {verseState === 'loading' && <div style={{ color: 'var(--text3)' }}>Loading verse…</div>}
              {verseState === 'error' && (
                <div style={{ color: 'var(--text3)' }}>
                  Couldn't load this verse here.{' '}
                  <a href={refHref(hit)} style={{ color: 'var(--teal)' }}>Open it in the reader ↗</a>
                </div>
              )}
              {verseState === 'ready' && verse && (
                verse.tokens && verse.tokens.length
                  ? renderVerseTokens(verse.tokens, hit.surface, srcOf(hit))
                  : renderVerse(verse.text, hit.surface)
              )}
              {verseState === 'ready' && !verse && (
                <div style={{ color: 'var(--text3)' }}>
                  No verse text found.{' '}
                  <a href={refHref(hit)} style={{ color: 'var(--teal)' }}>Open in reader ↗</a>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
                <button type="button" className="conc2-btn" disabled={sel <= 0} onClick={() => setSel(s => Math.max(0, s - 1))}>← previous hit</button>
                <button type="button" className="conc2-btn" disabled={!d || sel >= d.occurrences.length - 1} onClick={() => setSel(s => s + 1)}>next hit →</button>
              </div>
            </>
          )}
        </main>
      </div>
      )}
    </div>
  );
}
