/**
 * TranslatedMark — fieldy's 𐤌 on every verse he has translated to 100% (marked
 * 'done' in the Translation Studio). 2026-09-29: "a badge per verse page with a
 * 𐤌 inside it which provides details that 'MaAratz, ibad (servant of) Yah - yad
 * (hand) <word for translate>(translated)' -- lets have it glow gold on hover and
 * put the details in a tooltip near it. 𐤌𐤀𐤓𐤑 signature beneath".
 * Corrected the same day to his wording: "MaAratz, ibaday Yahawah Alahayam
 * (servant of Yahawah Alahayam), yad tharagam (hand translated)" — Hebrew in
 * gold, the gloss after each group; the card reads as information (small system
 * type), not reading text; the bubble has no ring until hover.
 *
 * The word for "translate" is 𐤕𐤓𐤂𐤌 (H8638) — the one place scripture uses it,
 * Ezra 4:7, the letter "set forth" (translated) in Aramayath. Written in his
 * transliteration (ת → th, a-vowels): tharagam. Change TRANSLATE_WORD to rename.
 *
 * Hover, keyboard focus or a tap opens the card; a second tap / Escape closes it.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './TranslatedMark.css';

export const TRANSLATOR = { name: 'MaAratz', paleo: '𐤌𐤀𐤓𐤑', mark: '𐤌' };
export const TRANSLATE_WORD = { translit: 'tharagam', gloss: 'translated', paleo: '𐤕𐤓𐤂𐤌' };

function fmtDate(t) {
  if (!t) return '';
  const d = new Date(String(t).replace(' ', 'T') + (/[zZ+]/.test(t) ? '' : 'Z'));
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function TranslatedMark({ refLabel, updatedAt, size = 'md', className = '' }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const date = fmtDate(updatedAt);
  return (
    <span ref={root} className={`tmark tmark-${size}${open ? ' open' : ''} ${className}`}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}>
      <button type="button" className="tmark-badge" aria-describedby={tipId} aria-expanded={open}
              aria-label={`Translated by ${TRANSLATOR.name}`}
              onClick={(e) => setOpen((o) => (e.nativeEvent?.pointerType === 'mouse' ? true : !o))} onFocus={(e) => { if (e.target.matches?.(':focus-visible')) setOpen(true); }} onBlur={(e) => { if (!root.current?.contains(e.relatedTarget)) setOpen(false); }}>
        <span className="tmark-glyph" aria-hidden="true">{TRANSLATOR.mark}</span>
      </button>
      <span id={tipId} role="tooltip" className="tmark-tip">
        <span className="tmark-line tmark-who"><b>{TRANSLATOR.name}</b>,</span>
        <span className="tmark-line"><b>ibaday Yahawah Alahayam</b> (servant of Yahawah Alahayam),</span>
        <span className="tmark-line"><b>yad {TRANSLATE_WORD.translit}</b> (hand {TRANSLATE_WORD.gloss})</span>
        {(refLabel || date) && <span className="tmark-meta">{refLabel}{refLabel && date ? ' · ' : ''}{date ? `marked translated ${date}` : ''}</span>}
        <Link to="/progress" className="tmark-more" tabIndex={open ? 0 : -1}>Every verse translated so far →</Link>
        <span className="tmark-sig" dir="rtl" aria-label={`signed ${TRANSLATOR.name}`}>{TRANSLATOR.paleo}</span>
      </span>
    </span>
  );
}
