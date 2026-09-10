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
import { apiTransChapter } from '../lib/api.js';
import { parseRefs, readerHref, inRanges } from '../lib/models/refs.js';
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
export const Glossed = ({ text }) => <>{glossNodes(text)}</>;

const _chapterCache = new Map();
function loadChapter(bookId, chapter) {
  const k = `${bookId}:${chapter}`;
  if (!_chapterCache.has(k)) _chapterCache.set(k, apiTransChapter(bookId, chapter).then((d) => d?.verses || []).catch(() => []));
  return _chapterCache.get(k);
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
