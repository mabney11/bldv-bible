/**
 * NovelText — the app's own English ("Novel English") rendered the way the
 * novel Reader shows it, anywhere a verse is quoted outside the Reader:
 * each "root (gloss)" pair gets the transliterated Hebrew/Aramaic root in the
 * reader's gold (.novel-root, same tokens as Reader.css's .rd-root) and the
 * English gloss plain; an EMPTY gloss ("Yahawah ()") drops its dangling parens,
 * exactly as Reader.jsx's renderVerseNodes does; a head word written in
 * Paleo-Hebrew letters is drawn with the site's own glyphs.
 * fieldy, 2026-09-24: "lets ensure glosses are properly colored like my novel
 * reader (this should be the case app-wide)".
 * Snippet-sized on purpose — no quote-nesting blocks (that stays Reader/VersePage's
 * renderVerseNodesWithQuotes, which lays out a whole passage).
 */
import { paleoToSVG } from '../lib/paleoGlyphs.js';
import './NovelText.css';

// Same pattern as Reader.jsx's GLOSS_RE (kept identical on purpose).
const GLOSS_RE = /([A-Za-zÀ-ɏ\u{10900}-\u{1091F}][A-Za-zÀ-ɏ\u{10900}-\u{1091F}'’-]*)([‘’“”"']*)\s+\(([^()]*)\)/gu;
const PALEO_RE = /[\u{10900}-\u{1091F}]/u;

export function novelNodes(text, keyPrefix = 'n') {
  const t = String(text ?? '');
  const out = [];
  let last = 0, k = 0, m;
  GLOSS_RE.lastIndex = 0;
  while ((m = GLOSS_RE.exec(t))) {
    const [full, heb, quote, gloss] = m;
    if (m.index > last) out.push(t.slice(last, m.index));
    out.push(PALEO_RE.test(heb)
      ? <span className="novel-root" dir="rtl" key={`${keyPrefix}${k++}`} dangerouslySetInnerHTML={{ __html: paleoToSVG(heb) }} />
      : <span className="novel-root" key={`${keyPrefix}${k++}`}>{heb}</span>);
    if (quote) out.push(quote);
    if (gloss.trim()) out.push(` (${gloss.trim()})`);
    last = m.index + full.length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

export default function NovelText({ text, as: Tag = 'span', className = '', ...rest }) {
  return <Tag className={`novel-text ${className}`} {...rest}>{novelNodes(text)}</Tag>;
}
