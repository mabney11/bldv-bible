/**
 * NamePage.jsx — one name, its meaning from scripture: /name/:slug (or /name/H3290)
 *
 * The name translators wrote, large; the name in its own Paleo letters; the verse where scripture says
 * why the name was given (or, when it never says, the verse it is first named in) — cut by the server
 * from the reader's LIVE text, with only the part of each word that carries the meaning lit (fieldy,
 * 2026-11-22: "only highlight the part of the full surface that matter"); then the names translators
 * put in its place and what is lost. The list is baked (server/build-names.mjs -> names-index.json);
 * what is written about a name lives in server/lexicon/names.json.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiName } from '../lib/api.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { novelNodes } from '../components/NovelText.jsx';
import { PassageRefs } from '../components/PassageRefs.jsx';
import NameEcho from '../components/NameEcho.jsx';
import NameAdminEdit from '../components/NameAdminEdit.jsx';
import AnatomyAdminEdit from '../components/AnatomyAdminEdit.jsx';
import '../components/NovelText.css';
import './Passages.css';
import './Names.css';

/** The name's Paleo letters, right to left, each marked root / added / plain. */
export function NameLetters({ letters = [], size = 'lg' }) {
  return (
    <span className={`nm-letters nm-letters-${size}`} dir="rtl" lang="phn">
      {letters.map(([l, kind], i) => <span key={i} className={`nm-l${kind ? ` nm-l-${kind}` : ''}`}>{l}</span>)}
    </span>
  );
}

// A mark is { word, part } (that exact word; light `part` of it) or { suffix } (any word that IS the name,
// or the name after its prefixes — "LaDawad": light "Dawad").
function markFor(word, marks) {
  for (const m of marks) if (m.word && m.word === word) return m.part || word;
  for (const m of marks) {
    if (!m.suffix || !word.endsWith(m.suffix)) continue;
    const pre = word.slice(0, word.length - m.suffix.length);
    if (pre === '' || /^[A-Z][A-Za-z]*-?$/.test(pre)) return m.suffix;
  }
  return null;
}
const WORD_RE = /([A-Za-z][A-Za-z'’-]*)(\s*\([^()]*\))?/g;
/** A verse in the reading-text style, the marked part of each marked word lit. */
export function MarkedVerse({ text, marks = [] }) {
  const t = String(text || '').replace(/</g, '“').replace(/>/g, '”');
  const out = []; let last = 0, k = 0, m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(t))) {
    const word = m[1];
    const part = marks.length ? markFor(word, marks) : null;
    if (!part) continue;
    if (m.index > last) out.push(<span key={k++}>{novelNodes(t.slice(last, m.index), `s${k}`)}</span>);
    const at = word.lastIndexOf(part);
    const [pre, mid, post] = at >= 0 ? [word.slice(0, at), part, word.slice(at + part.length)] : ['', word, ''];
    const gloss = (m[2] || '').trim();
    out.push(
      <span key={k++} className="nm-hitword">
        <span className="novel-root">{pre}<mark className="nm-part">{mid}</mark>{post}</span>
        {gloss && gloss !== '()' ? ` ${gloss}` : ''}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push(<span key={k++}>{novelNodes(t.slice(last), `s${k}`)}</span>);
  return <>{out}</>;
}

const LIKE = { yes: 'Yes', close: 'Close', partly: 'Partly', no: 'No' };
function Like({ label, v }) {
  if (!v) return null;
  return <span className={`nm-like nm-like-${v}`}><span className="nm-like-k">{label}</span> {LIKE[v] || v}</span>;
}

export default function NamePage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    let live = true;
    if (!version) setData(null);
    setError(null);
    apiName(slug).then(d => { if (live) setData(d); }).catch(e => { if (live) setError(e); });
    return () => { live = false; };
  }, [slug, version]);
  usePageTitle(
    data ? `${data.english} — ${data.name} (${data.meaning || 'name'}) | Names` : (error ? 'Names' : ''),
    data ? `${data.english}: in Hebrew ${data.name} ${data.paleo}${data.meaning ? `, “${data.meaning}”` : ''}. ${data.origin?.[0]?.label || ''}` : undefined,
  );
  const [copied, setCopied] = useState(false);
  const copyLink = useCallback(() => {
    try { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ }
  }, []);
  const firstOnly = data && data.origin.length > 0 && data.origin.every(o => o.first);

  return (
    <div className="pgs-page nm-page">
      <header className="pgs-top">
        <Link to="/names" className="pgs-back" title="All names">←</Link>
        <h1 className="pgs-h1">{data ? data.english : 'Names'}</h1>
        <button type="button" className={`pgs-back nm-copy${copied ? ' on' : ''}`} onClick={copyLink} title="Copy the link to this name" aria-label="Copy link">{copied ? '✓' : '🔗'}</button>
      </header>

      {!data && !error && <div className="pgs-wait">Loading…</div>}
      {error && <div className="pgs-wait">There is no name <b>{slug}</b> here yet. <Link to="/names">All names →</Link></div>}

      {data && (
        <main className="nm-main">
          <section className="nm-hero">
            <div className="nm-hero-top">
              <Link className="nm-sn" to={`/roots?sn=${data.sn}`} title="This name in the root explorer">{data.sn}</Link>
              {data.root && (
                <Link className="nm-rootlink" to={`/roots?sn=${data.root.sn}`} title="Every use of the root">
                  <span className="nm-rootlink-k">ROOT</span> <span className="nm-rootlink-p" dir="rtl">{data.root.paleo}</span> {data.root.name} <span className="nm-rootlink-g">({data.root.gloss})</span>
                </Link>
              )}
            </div>
            <div className="nm-english">{data.english}</div>
            <div className="nm-rule" />
            <div className="nm-hero-box"><NameLetters letters={data.letters} /></div>
            <div className="nm-english nm-translit">{data.name}</div>
            {data.legend && (
              <div className="nm-legend">
                {Object.entries(data.legend).map(([k, v]) => (
                  <span key={k} className={`nm-legend-i nm-legend-${k}`}><span className={`nm-swatch nm-l-${k}`} /><span>{novelNodes(v, `lg${k}`)}</span></span>
                ))}
              </div>
            )}
            {data.meaning && <div className="nm-meaning">{data.meaning}</div>}
            {data.from && (
              <div className="nm-from">
                <span className="nm-from-k">FIRST NAMED</span>
                <Link to={`/roots?sn=${data.from.sn}`} className="nm-from-n"><span dir="rtl" className="nm-from-p">{data.from.paleo}</span> {data.from.name} ({data.from.gloss})</Link>
                <span className="nm-from-arrow">→</span>
                <span className="nm-from-n"><span dir="rtl" className="nm-from-p">{data.paleo}</span> {data.name}</span>
              </div>
            )}
            {data.summary && <p className="nm-summary">{novelNodes(data.summary, 'sum')}</p>}
            {data.parts?.length > 0 && (
              <div className="nm-parts">
                <span className="nm-also-k">Taken from</span>
                {data.parts.map((p, i) => (
                  <Link key={i} to={`/roots?sn=${p.sn}`} className="nm-part-chip"><span dir="rtl" className="nm-rootlink-p">{p.paleo}</span> {p.translit} ({p.gloss || <span dir="rtl">{p.paleo}</span>}) <span className="nm-part-sn">{p.sn}</span></Link>
                ))}
              </div>
            )}
            <div className="nm-admin">
              <NameAdminEdit sn={data.sn} current={data} onSaved={reload} />
              <AnatomyAdminEdit sn={data.sn} anatomy={{ parts: data.parts, meaning: data.meaning, strongs_def: data.def }} onSaved={reload} />
            </div>
          </section>

          <section className="nm-sec">
            <h2 className="pgs-group-h">{firstOnly ? 'Where scripture first names them' : 'Where scripture gives the name'}</h2>
            {data.origin.map((o, i) => (
              <div key={i} className="nm-origin">
                <div className="nm-origin-h">
                  <b>{o.label}</b>
                  {o.reader && <Link to={o.reader} className="nm-origin-open">Reader →</Link>}
                </div>
                {o.verses.length === 0
                  ? <p className="nm-empty">No English text for {o.label} yet.</p>
                  : o.verses.map(v => <p key={v.verse} className="nm-verse"><MarkedVerse text={v.text} marks={o.marks} /></p>)}
                {o.note && <p className="nm-origin-note">{novelNodes(o.note, `on${i}`)}</p>}
              </div>
            ))}
            {data.also && <div className="nm-also"><span className="nm-also-k">Also named</span><PassageRefs refs={data.also} size="sm" /></div>}
          </section>

          {data.echoes?.length > 0 && (
            <section className="nm-sec">
              <h2 className="pgs-group-h">Sounds like</h2>
              {data.echoes.map((e, i) => <NameEcho key={i} echo={e} />)}
            </section>
          )}

          {data.common?.length > 0 && (
            <section className="nm-sec">
              <h2 className="pgs-group-h">What translators wrote</h2>
              <div className="nm-common">
                {data.common.map((c, i) => (
                  <div key={i} className={`nm-cn nm-cn-${c.sounds || 'x'}`}>
                    <div className="nm-cn-top">
                      <span className="nm-cn-name">{c.name}</span>
                      {(c.sounds || c.looks) && <span className="nm-cn-likes"><Like label="Sounds like it" v={c.sounds} /><Like label="Looks like it" v={c.looks} /></span>}
                    </div>
                    {c.where && <div className="nm-cn-where">{novelNodes(c.where, `cw${i}`)}</div>}
                    {c.chain && <ol className="nm-chain">{c.chain.map((s, j) => <li key={j}>{s}</li>)}</ol>}
                    {c.note && <p className="nm-cn-note">{novelNodes(c.note, `cn${i}`)}</p>}
                    {c.see && c.see !== data.slug && <Link className="nm-cn-see" to={`/name/${c.see}`}>Open that name →</Link>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.differences?.length > 0 && (
            <section className="nm-sec">
              <h2 className="pgs-group-h">What changes with the name</h2>
              <ul className="nm-diff">{data.differences.map((d, i) => <li key={i}>{novelNodes(d, `df${i}`)}</li>)}</ul>
              {data.compare && <div className="nm-also"><span className="nm-also-k">Read them</span><PassageRefs refs={data.compare} size="sm" /></div>}
            </section>
          )}

          {data.related?.length > 0 && (
            <section className="nm-sec">
              <h2 className="pgs-group-h">Related names</h2>
              <div className="pgs-grid">
                {data.related.map(r => (
                  <Link key={r.slug} to={`/name/${r.slug}`} className="pgs-card nm-card">
                    <span className="nm-card-en">{r.english}</span>
                    <span className="nm-card-rule" />
                    <NameLetters letters={r.letters} size="sm" />
                    <span className="nm-card-sub">{r.name}{r.meaning ? ` · ${r.meaning}` : ''}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <footer className="nm-foot">
            {data.prev ? <Link className="nm-foot-btn" to={`/name/${data.prev.slug}`}>← {data.prev.english}</Link> : <span />}
            <Link className="nm-foot-btn" to="/names">All names</Link>
            {data.next ? <Link className="nm-foot-btn" to={`/name/${data.next.slug}`}>{data.next.english} →</Link> : <span />}
          </footer>
        </main>
      )}
    </div>
  );
}
