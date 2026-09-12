// Precepts.jsx — the list of passages a verse quotes or is quoted by ("precept
// upon precept", Isaiah 28:10), shared by the Reader's gutter-marker panel and
// the verse page's own section. Data comes from /api/precepts/chapter (see
// server.js and build-precepts.mjs); this file only groups and renders it.
//
// Grouping: one section per book (in the order the API returned them —
// confirmed first, then by score), and inside a book consecutive verses of
// one chapter fold into a single range entry — Genesis 17:19–23 rather than
// five rows — because a quotation of any length arrives from the matcher as
// one row per verse. A range carries every member's text, shown one after
// another with its own small verse number, so nothing is hidden by the fold.
//
// `renderText(text)` is supplied by the caller (Reader passes its gloss-mode
// renderer) so this component never has to import from Reader.jsx — Reader
// imports THIS file, and a circular import is exactly the kind of thing that
// works until one hot reload breaks it.
import { Fragment, useMemo } from 'react';
import './Precepts.css';

export const KIND_LABEL = { quote: 'quotes', parallel: 'parallel', xref: 'cross-ref', manual: 'added' };
const KIND_RANK = { quote: 0, manual: 0, xref: 1, parallel: 2 };

// items: [{book, chapter, verse, name, kind, score, status, text}] for ONE source verse.
export function groupPrecepts(items) {
  const groups = [];
  for (const it of items) {
    let g = groups.find(x => x.book === it.book);
    if (!g) { g = { book: it.book, name: it.name, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  for (const g of groups) {
    const sorted = g.items.slice().sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
    const ranges = [];
    for (const it of sorted) {
      const last = ranges[ranges.length - 1];
      if (last && last.chapter === it.chapter && it.verse === last.verseEnd + 1) {
        last.verseEnd = it.verse;
        last.members.push(it);
      } else {
        ranges.push({ book: it.book, chapter: it.chapter, verse: it.verse, verseEnd: it.verse, members: [it] });
      }
    }
    for (const r of ranges) {
      // The range's badge is its strongest member; its status is confirmed if
      // any member is, rejected only if every member is.
      r.kind = r.members.slice().sort((a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9))[0].kind;
      r.score = Math.max(...r.members.map(m => m.score || 0));
      r.status = r.members.some(m => m.status === 'confirmed' || m.status === 'manual') ? 'confirmed'
               : r.members.every(m => m.status === 'rejected') ? 'rejected' : null;
    }
    // Strongest range first inside the book, confirmed ones ahead of the rest.
    const rank = s => s === 'confirmed' ? 0 : s === 'rejected' ? 2 : 1;
    ranges.sort((a, b) => rank(a.status) - rank(b.status) || b.score - a.score);
    g.ranges = ranges;
  }
  return groups;
}

export function refLabel(name, chapter, verse, verseEnd) {
  const n = name === 'Psalms' ? 'Psalm' : name;
  return verseEnd && verseEnd !== verse ? `${n} ${chapter}:${verse}–${verseEnd}` : `${n} ${chapter}:${verse}`;
}

// onOpen(book, chapter, verse) — navigate to the passage.
// onReview(item, status) — admin only; called once per member of a range.
export default function PreceptList({ items, renderText, onOpen, isAdmin, onReview, emptyText = 'No precepts for this verse.' }) {
  const groups = useMemo(() => groupPrecepts(items || []), [items]);
  if (!groups.length) return <p className="pc-empty">{emptyText}</p>;
  return (
    <div className="pc-list">
      {groups.map(g => (
        <section className="pc-group" key={g.book}>
          <h3 className="pc-book">{g.name}</h3>
          {g.ranges.map(r => (
            <div className={`pc-item ${r.status || ''}`} key={`${r.book}:${r.chapter}:${r.verse}`}>
              <div className="pc-item-head">
                <button type="button" className="pc-link"
                        onClick={() => onOpen && onOpen(r.book, r.chapter, r.verse)}
                        title={`Read ${refLabel(g.name, r.chapter, r.verse, r.verseEnd)}`}>
                  {refLabel(g.name, r.chapter, r.verse, r.verseEnd)}
                </button>
                <span className={`pc-kind ${r.kind}`}>{KIND_LABEL[r.kind] || r.kind}</span>
                {r.status === 'confirmed' && <span className="pc-status">✓ confirmed</span>}
                {r.status === 'rejected' && <span className="pc-status rejected">rejected</span>}
                {isAdmin && onReview && (
                  <span className="pc-review">
                    {r.status !== 'confirmed' && <button type="button" title="Confirm" onClick={() => r.members.forEach(m => onReview(m, 'confirmed'))}>✓</button>}
                    {r.status !== 'rejected' && <button type="button" title="Reject — hide from readers" onClick={() => r.members.forEach(m => onReview(m, 'rejected'))}>✗</button>}
                    {r.members.some(m => m.status && m.kind !== 'manual') && <button type="button" title="Clear review" onClick={() => r.members.forEach(m => m.status && m.kind !== 'manual' && onReview(m, 'clear'))}>↺</button>}
                  </span>
                )}
              </div>
              <p className="pc-text">
                {r.members.map((m, i) => (
                  <Fragment key={m.verse}>
                    {r.members.length > 1 && <sup className="pc-vnum">{m.verse}</sup>}
                    {m.text ? (renderText ? renderText(m.text, `pc${m.book}-${m.chapter}-${m.verse}-`) : m.text) : <em>—</em>}
                    {i < r.members.length - 1 ? ' ' : ''}
                  </Fragment>
                ))}
              </p>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
