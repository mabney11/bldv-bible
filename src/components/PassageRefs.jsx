/**
 * PassageRefs.jsx — scripture references as chips that open the verses inline.
 * Every reference a model carries ("Daniel 2:31–35", "Isaiah 28:16; Psalm 118:22")
 * is a button: click it and the verses themselves appear right here (the app's
 * own Novel English), with links into the Reader (whole range highlighted) and
 * to the passage page. Chapters are cached for the session. Shared by the Holy
 * Land map, the statue model and any model that quotes the text.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseRefs, readerHref, inRanges } from '../lib/models/refs.js';
import { loadChapter, parseQuotes, sliceQuote, verseText } from '../lib/passages.js';
import './PassageRefs.css';

// "heb (gloss)" pairs in the app's own text — the transliterated Hebrew/Aramaic
// word is shown gold (.hl-root) and the English gloss plain, the way the Reader
// does it. Exported so a model's own prose in that style gets the same look.
const GLOSS_RE = /([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*)([‘’“”"']*)\s+\(([^()]*)\)/g;
export function glossNodes(text) {
  const t = String(text ?? '');
  const out = []; let last = 0, m, k = 0;
  GLOSS_RE.lastIndex = 0;
  while ((m = GLOSS_RE.exec(t))) {
    if (m.index > last) out.push(t.slice(last, m.index));
    out.push(<span className="hl-root" key={k++}>{m[1]}</span>);
    out.push(`${m[2]} (${m[3]})`);
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

// Prose that QUOTES the text never carries a copy of it: it writes
// {{Daniel 2:35 | hawaa a rab … arai}} and the slice of the live verse is put in
// its place here (see lib/passages.js). fieldy: "if a verse is updated, the
// context must also be updated for anything referring to it." Each quote is
// wrapped in .hl-quote with the reference as its title; while the chapter is
// still loading the quote is left blank rather than showing anything stale.
export function Glossed({ text }) {
  const parts = useMemo(() => parseQuotes(text), [text]);
  const specs = parts.filter((p) => typeof p === 'object');
  const key = specs.map((p) => `${p.ref}|${p.from}|${p.to}`).join('\n');
  const [quotes, setQuotes] = useState(null);
  useEffect(() => {
    if (!specs.length) { setQuotes(null); return; }
    let live = true;
    Promise.all(specs.map(async (p) => sliceQuote(await verseText(p.ref), p.from, p.to)))
      .then((q) => { if (live) setQuotes(q); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!specs.length) return <>{glossNodes(text)}</>;
  let qi = 0;
  return (
    <>
      {parts.map((p, i) => (typeof p === 'string'
        ? <span key={i}>{glossNodes(p)}</span>
        : <span key={i} className="hl-quote" title={p.ref}>{quotes ? glossNodes(quotes[qi++]) : ''}</span>))}
    </>
  );
}

function Passage({ refObj }) {
  const [verses, setVerses] = useState(null);
  useEffect(() => {
    let live = true;
    setVerses(null);
    loadChapter(refObj.bookId, refObj.chapter).then((vs) => { if (live) setVerses(vs.filter((v) => inRanges(+v.verse, refObj.ranges))); });
    return () => { live = false; };
  }, [refObj]);
  return (
    <div className="hl-passage">
      <div className="hl-passage-h">
        <b>{refObj.label}</b>
        <span className="hl-passage-links">
          <Link to={`/passage?ref=${encodeURIComponent(refObj.label)}`} className="hl-passage-open" title="Just these verses, on their own page">Open the passage →</Link>
          <Link to={readerHref(refObj)} className="hl-passage-open">Reader →</Link>
        </span>
      </div>
      {verses === null && <div className="hl-passage-wait">Loading…</div>}
      {verses && verses.length === 0 && <div className="hl-passage-wait">No English text for this passage yet.</div>}
      {verses && verses.map((v) => (
        <p key={v.verse} className="hl-verse"><sup>{v.verse}</sup>{glossNodes(v.text)}</p>
      ))}
    </div>
  );
}

export function PassageRefs({ refs, autoOpen = false, size = 'md' }) {
  const parsed = useMemo(() => parseRefs(refs), [refs]);
  const [open, setOpen] = useState(autoOpen ? 0 : -1);
  useEffect(() => { setOpen(autoOpen ? 0 : -1); }, [refs, autoOpen]);
  if (!parsed.length) return refs ? <span className="hl-detail-ref">{refs}</span> : null;
  return (
    <div className={`hl-refs hl-refs-${size}`}>
      <div className="hl-refs-row">
        {parsed.map((r, i) => (
          <button key={r.label} type="button" className={`hl-refchip${open === i ? ' on' : ''}`} onClick={() => setOpen(open === i ? -1 : i)} title="Show the verses">
            <span aria-hidden="true">📖</span> {r.label}
          </button>
        ))}
      </div>
      {open >= 0 && parsed[open] && <Passage refObj={parsed[open]} />}
    </div>
  );
}
