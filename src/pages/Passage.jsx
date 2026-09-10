/**
 * Passage.jsx — one named passage, packaged: /passage/:slug
 * (the Prayer of Azariah, the Proclamation of Mordecai, Yaiqab's blessings…)
 * or any reference ad hoc: /passage?ref=Ezekiel 48:8–22.
 *
 * "instead of forcing the reading of a particular passage in the reader I
 * want pages with just the relevant verses for the passage with a nice
 * pretty packaged view … available in pages that can be bookmarked".
 *
 * The verses are the Novel English Bible's own — the server cuts them from
 * the same chapter assembly the Reader uses (see server.js "PASSAGES"), so
 * this page is a window onto the reader's text, never a second copy. Rendered
 * with Reader.jsx's own "root (gloss)" + quote-nesting renderer inside
 * Reader.css's shell (same night/parchment themes, same persisted typeface),
 * so it reads as part of the same book.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { apiPassage, apiPassageByRef } from '../lib/api.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { TYPEFACES } from '../lib/typefaces.js';
import { renderVerseNodesWithQuotes, sanitizeText } from './Reader.jsx';
import './Reader.css';
import './Passage.css';

// Same key + default the Reader and the single-verse page persist under, so
// the three reading surfaces always agree on the face.
const TYPEFACE_DEFAULT = 'alegreya';
const TYPEFACE_KEY = 'reader-typeface';

function useReaderTypeface() {
  const [typeface] = useState(() => {
    try {
      const saved = localStorage.getItem(TYPEFACE_KEY);
      return TYPEFACES.some(f => f.id === saved) ? saved : TYPEFACE_DEFAULT;
    } catch { return TYPEFACE_DEFAULT; }
  });
  const stack = useMemo(() => (TYPEFACES.find(f => f.id === typeface) || TYPEFACES[0]).stack, [typeface]);
  return [typeface, stack];
}

export default function Passage() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const ref = (sp.get('ref') || '').trim();
  useTheme();
  const [typeface, typefaceStack] = useReaderTypeface();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(null); setData(null);
    const p = slug ? apiPassage(slug) : (ref ? apiPassageByRef(ref) : Promise.reject(new Error('no passage named')));
    p.then(d => { if (live) { setData(d); setLoading(false); } })
     .catch(e => { if (live) { setError(e); setLoading(false); } });
    return () => { live = false; };
  }, [slug, ref]);

  const title = data?.title || (ref || 'Passage');
  const refLine = data ? data.sections.map(s => s.label).join('; ') : ref;
  const firstVerse = data?.sections?.find(s => s.verses.length)?.verses[0]?.text || '';
  usePageTitle(
    data ? `${title} | Passage` : (loading ? '' : 'Passage'),
    data ? `${refLine} — ${firstVerse.replace(/\s*\([^)]*\)/g, '').slice(0, 150)}` : undefined,
  );

  // Copy the address: the whole point of a passage is that it can be kept.
  const [copied, setCopied] = useState(false);
  const copyLink = useCallback(() => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, []);

  const many = (data?.sections?.length || 0) > 1;

  return (
    <div className="reader-root pg-root" data-typeface={typeface} style={{ '--pr-reading': typefaceStack }}>
      <header className="rd-bar">
        <Link to="/landing" className="rd-bar-btn rd-home" title="Home" aria-label="Home">𐤀𐤁</Link>
        <Link to="/passages" className="rd-ref pg-ref-link" title="All passages">
          <span className="rd-ref-txt">{data ? title : 'Passage'}</span>
          <span className="rd-ref-caret">▾</span>
        </Link>
        <button type="button" className={`rd-bar-btn pg-copy${copied ? ' on' : ''}`} onClick={copyLink} title="Copy the link to this passage" aria-label="Copy link">
          {copied ? '✓' : '🔗'}
        </button>
      </header>

      <main className="rd-scroll">
        <article className="rd-page pg-page">
          {loading ? (
            <div className="rd-state">Loading…</div>
          ) : error || !data ? (
            <div className="rd-state">
              <p className="rd-state-title">{slug ? 'There is no passage by that name.' : ref ? 'That reference isn’t recognized.' : 'No passage named.'}</p>
              <p className="rd-state-sub">{slug ? <>Looking for <b>{slug}</b>.</> : ref ? <>Try the form <i>Book chapter:verse–verse</i>, e.g. <i>Genesis 49:8–12</i>.</> : 'Open one from the collection.'}</p>
              <Link className="rd-state-link" to="/passages">All passages →</Link>
            </div>
          ) : (
            <div className="pg-passage">
              <header className="pg-head">
                {data.group && <div className="rd-book-name">{data.group}</div>}
                <h1 className="pg-title">{title}</h1>
                {data.subtitle && <div className="pg-subtitle">{data.subtitle}</div>}
                <div className="pg-refs">
                  {data.sections.map((s, i) => (
                    <Link key={i} to={s.reader} className="pg-refchip" title="Open in the Reader">{s.label}</Link>
                  ))}
                </div>
                {data.blurb && <p className="pg-blurb">{data.blurb}</p>}
              </header>

              {data.sections.map((s, i) => (
                <section key={i} className="pg-section">
                  {many && (
                    <div className="pg-section-h">
                      <span className="pg-section-label">{s.label}</span>
                      <Link to={s.reader} className="pg-section-open">Reader →</Link>
                    </div>
                  )}
                  {s.verses.length === 0 && (
                    <div className="pg-empty">
                      No English text for {s.label} yet.
                    </div>
                  )}
                  <div className="rd-body pg-body">
                    {s.verses.map((v) => {
                      const h = s.headings.find(hh => +hh.verse === +v.verse);
                      return (
                        <span key={v.verse} className="pg-verse-wrap">
                          {h && (
                            <div className="rd-pericope">
                              <div className="rd-pericope-title">{h.title}</div>
                              {h.subtitle && <div className="rd-pericope-subtitle">{h.subtitle}</div>}
                            </div>
                          )}
                          <span className="rd-verse pg-verse">
                            <Link className="rd-vnum pg-vnum" to={`/bible?book=${s.book_id}&chapter=${s.chapter}&verse=${v.verse}`} title={`${s.book} ${s.chapter}:${v.verse} in the Reader`}>{v.verse}</Link>
                            <span className="rd-vtext">{renderVerseNodesWithQuotes(sanitizeText(v.text), 'both')}</span>
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </section>
              ))}

              {data.missing > 0 && (
                <p className="pg-note">{data.missing} verse{data.missing === 1 ? '' : 's'} of this passage {data.missing === 1 ? 'has' : 'have'} no English text yet.</p>
              )}

              <footer className="rd-foot pg-foot">
                {data.prev ? <Link className="rd-foot-btn" to={`/passage/${data.prev.slug}`}>← {data.prev.title}</Link> : <span />}
                <Link className="rd-foot-btn pg-foot-all" to="/passages">All passages</Link>
                {data.next ? <Link className="rd-foot-btn" to={`/passage/${data.next.slug}`}>{data.next.title} →</Link> : <span />}
              </footer>
            </div>
          )}
        </article>
      </main>
    </div>
  );
}
