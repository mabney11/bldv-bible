/**
 * NamePage.jsx — one name, its meaning from scripture: /name/:slug
 *
 * The name in its own Paleo letters (root letters lit, a letter scripture records
 * being added marked), the verse where scripture says why the name was given —
 * cut by the server from the reader's LIVE text, with only the root-bearing part
 * of each word lit (fieldy, 2026-11-22: "only highlight the part of the full surface
 * that matter") — then the names translators put in its place, whether each still
 * sounds or looks like the Hebrew, and what is lost. Data: server/lexicon/names.json.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiName } from '../lib/api.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { novelNodes } from '../components/NovelText.jsx';
import { PassageRefs } from '../components/PassageRefs.jsx';
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

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A verse in the reading-text style with each marked word's root part lit. */
function MarkedVerse({ text, marks = [] }) {
  const t = String(text || '');
  if (!marks.length) return <>{novelNodes(t)}</>;
  const re = new RegExp(`(?<![A-Za-z'’-])(${marks.map(m => esc(m.word)).join('|')})(?![A-Za-z'’-])(\\s*\\([^()]*\\))?`, 'g');
  const out = []; let last = 0, k = 0, m;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push(<span key={k++}>{novelNodes(t.slice(last, m.index), `s${k}`)}</span>);
    const word = m[1];
    const part = (marks.find(x => x.word === word)?.part) || word;
    const at = word.indexOf(part);
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
  useEffect(() => {
    let live = true;
    setData(null); setError(null);
    apiName(slug).then(d => { if (live) setData(d); }).catch(e => { if (live) setError(e); });
    return () => { live = false; };
  }, [slug]);
  usePageTitle(
    data ? `${data.name} (${data.meaning}) | Names` : (error ? 'Names' : ''),
    data ? `${data.name} ${data.paleo} means “${data.meaning}”. ${data.origin?.[0]?.label || ''} — and what translators wrote instead: ${(data.common || []).map(c => c.name).join(', ')}.` : undefined,
  );
  const [copied, setCopied] = useState(false);
  const copyLink = useCallback(() => {
    try { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ }
  }, []);

  return (
    <div className="pgs-page nm-page">
      <header className="pgs-top">
        <Link to="/names" className="pgs-back" title="All names">←</Link>
        <h1 className="pgs-h1">{data ? data.name : 'Names'}</h1>
        <button type="button" className={`pgs-back nm-copy${copied ? ' on' : ''}`} onClick={copyLink} title="Copy the link to this name" aria-label="Copy link">{copied ? '✓' : '🔗'}</button>
      </header>

      {!data && !error && <div className="pgs-wait">Loading…</div>}
      {error && (
        <div className="pgs-wait">There is no name <b>{slug}</b> here yet. <Link to="/names">All names →</Link></div>
      )}

      {data && (
        <main className="nm-main">
          <section className="nm-hero">
            <div className="nm-hero-top">
              {data.sn && <Link className="nm-sn" to={`/roots?sn=${data.sn}`} title="This name in the root explorer">{data.sn}</Link>}
              {data.root && (
                <Link className="nm-rootlink" to={`/roots?sn=${data.root.sn}`} title="Every use of the root">
                  <span className="nm-rootlink-k">ROOT</span> <span className="nm-rootlink-p" dir="rtl">{data.root.paleo}</span> {data.root.name} <span className="nm-rootlink-g">({data.root.gloss})</span>
                </Link>
              )}
            </div>
            <div className="nm-hero-box">
              <NameLetters letters={data.letters} />
            </div>
            {data.legend && (
              <div className="nm-legend">
                {Object.entries(data.legend).map(([k, v]) => (
                  <span key={k} className={`nm-legend-i nm-legend-${k}`}><span className={`nm-swatch nm-l-${k}`} /><span>{novelNodes(v, `lg${k}`)}</span></span>
                ))}
              </div>
            )}
            <div className="nm-name">{data.name}</div>
            <div className="nm-meaning">{data.meaning}</div>
            {data.from && (
              <div className="nm-from">
                <span className="nm-from-k">FIRST NAMED</span>
                <Link to={`/roots?sn=${data.from.sn}`} className="nm-from-n"><span dir="rtl" className="nm-from-p">{data.from.paleo}</span> {data.from.name} ({data.from.gloss})</Link>
                <span className="nm-from-arrow">→</span>
                <span className="nm-from-n"><span dir="rtl" className="nm-from-p">{data.paleo}</span> {data.name}</span>
              </div>
            )}
            {data.summary && <p className="nm-summary">{novelNodes(data.summary, 'sum')}</p>}
          </section>

          <section className="nm-sec">
            <h2 className="pgs-group-h">Where scripture gives the name</h2>
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
            {data.also && (
              <div className="nm-also"><span className="nm-also-k">Also named</span><PassageRefs refs={data.also} size="sm" /></div>
            )}
          </section>

          {data.common?.length > 0 && (
            <section className="nm-sec">
              <h2 className="pgs-group-h">What translators wrote</h2>
              <div className="nm-common">
                {data.common.map((c, i) => (
                  <div key={i} className={`nm-cn nm-cn-${c.sounds || 'x'}`}>
                    <div className="nm-cn-top">
                      <span className="nm-cn-name">{c.name}</span>
                      <span className="nm-cn-likes"><Like label="Sounds like it" v={c.sounds} /><Like label="Looks like it" v={c.looks} /></span>
                    </div>
                    {c.where && <div className="nm-cn-where">{novelNodes(c.where, `cw${i}`)}</div>}
                    {c.chain && (
                      <ol className="nm-chain">
                        {c.chain.map((s, j) => <li key={j}>{s}</li>)}
                      </ol>
                    )}
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
              <ul className="nm-diff">
                {data.differences.map((d, i) => <li key={i}>{novelNodes(d, `df${i}`)}</li>)}
              </ul>
              {data.compare && <div className="nm-also"><span className="nm-also-k">Read them</span><PassageRefs refs={data.compare} size="sm" /></div>}
            </section>
          )}

          {data.related?.length > 0 && (
            <section className="nm-sec">
              <h2 className="pgs-group-h">Related names</h2>
              <div className="pgs-grid">
                {data.related.map(r => (
                  <Link key={r.slug} to={`/name/${r.slug}`} className="pgs-card nm-card">
                    <NameLetters letters={r.letters} size="sm" />
                    <span className="pgs-card-title nm-card-name">{r.name}</span>
                    <span className="nm-card-meaning">{r.meaning}</span>
                    {r.common?.length > 0 && <span className="nm-card-common">Translators wrote: {r.common.join(' · ')}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <footer className="nm-foot">
            {data.prev ? <Link className="nm-foot-btn" to={`/name/${data.prev.slug}`}>← {data.prev.name}</Link> : <span />}
            <Link className="nm-foot-btn" to="/names">All names</Link>
            {data.next ? <Link className="nm-foot-btn" to={`/name/${data.next.slug}`}>{data.next.name} →</Link> : <span />}
          </footer>
        </main>
      )}
    </div>
  );
}
