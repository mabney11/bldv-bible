import { useEffect } from 'react';
import { TRANSLIT_DATA } from '../lib/tokenLabels.js';
import './TranslitGuide.css';

export default function TranslitGuide({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="tc-overlay" onClick={onClose}>
      <div className="tc-card" onClick={e => e.stopPropagation()}>
        <button className="tc-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>Transliteration Guide</h2>
        <p className="tc-sub">
          Each letter has two sounds: <strong>med</strong> (middle of a word) and
          {' '}<strong>fin</strong> (final/end position). The transliteration concatenates
          these left-to-right to spell the English pronunciation.
        </p>
        <div className="tc-grid">
          {TRANSLIT_DATA.map(r => (
            <div key={r.g} className="tc-row">
              <div className="tc-glyph">{r.g}</div>
              <div className="tc-sounds">
                <div className="tc-sound"><strong>{r.n}</strong></div>
                <div className="tc-sound">mid: <strong>{r.med}</strong> <span>— not final</span></div>
                <div className="tc-sound">end: <strong>{r.fin}</strong> <span>— final position</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
