/**
 * NameEcho.jsx — a phonetic uncovering: two words drawn letter under letter, right to left, each with its
 * sound, and between them whether the sounds are the same (=), near (≈: both hissing sounds, both throat /
 * vowel letters, both lip, tongue-tip or back-of-mouth sounds) or different. fieldy, 2026-11-25: "draw a
 * phonetic uncovering of Sharay (princess) and Zarai (seed)". Data: names.json `echoes`.
 */
import { Link } from 'react-router-dom';

const SOUND = { '𐤀': 'a', '𐤁': 'b', '𐤂': 'g', '𐤃': 'd', '𐤄': 'h', '𐤅': 'w', '𐤆': 'z', '𐤇': 'ch', '𐤈': 't', '𐤉': 'y', '𐤊': 'k', '𐤋': 'l',
  '𐤌': 'm', '𐤍': 'n', '𐤎': 's', '𐤏': 'i', '𐤐': 'p', '𐤑': 'tz', '𐤒': 'q', '𐤓': 'r', '𐤔': 'sh', '𐤕': 'th' };
const GROUPS = [['𐤆', '𐤎', '𐤑', '𐤔'], ['𐤀', '𐤄', '𐤇', '𐤏', '𐤅', '𐤉'], ['𐤁', '𐤐', '𐤌'], ['𐤃', '𐤈', '𐤕', '𐤍', '𐤋', '𐤓'], ['𐤂', '𐤊', '𐤒']];
const groupOf = (l) => GROUPS.findIndex(g => g.includes(l));
function link(a, b) {
  if (!a || !b) return { sym: '·', kind: 'none' };
  if (a === b) return { sym: '=', kind: 'same' };
  const ga = groupOf(a);
  return ga >= 0 && ga === groupOf(b) ? { sym: '≈', kind: 'near' } : { sym: '≠', kind: 'diff' };
}
const word = (w) => (
  <span className="ne-word">
    <b>{w.name}</b>{w.gloss ? <> ({w.gloss})</> : null}
    {w.sn ? <Link to={`/roots?sn=${w.sn}`} className="ne-sn">{w.sn}</Link> : null}
  </span>
);

export default function NameEcho({ echo }) {
  const a = [...String(echo?.from?.paleo || '')], b = [...String(echo?.to?.paleo || '')];
  const n = Math.max(a.length, b.length);
  if (!n) return null;
  const cols = Array.from({ length: n }, (_, i) => ({ top: a[i], bot: b[i], ...link(a[i], b[i]) }));
  return (
    <div className="ne">
      <div className="ne-row-names">{word(echo.from)}<span className="ne-and">and</span>{word(echo.to)}</div>
      <div className="ne-grid" dir="rtl">
        {cols.map((c, i) => (
          <div key={i} className={`ne-col ne-${c.kind}`}>
            <span className="ne-l">{c.top || ''}</span>
            <span className="ne-s">{c.top ? SOUND[c.top] || '' : ''}</span>
            <span className="ne-link">{c.sym}</span>
            <span className="ne-s">{c.bot ? SOUND[c.bot] || '' : ''}</span>
            <span className="ne-l">{c.bot || ''}</span>
          </div>
        ))}
      </div>
      <div className="ne-key"><span className="ne-same">= same sound</span> <span className="ne-near">≈ near sound</span> <span className="ne-diff">≠ different</span></div>
      {echo.note && <p className="ne-note">{echo.note}</p>}
    </div>
  );
}
