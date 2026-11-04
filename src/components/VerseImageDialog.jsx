/**
 * VerseImageDialog — "Save this verse as an image": a preview of the verse card
 * (lib/verseCard.js) with its shape, paper, gloss mode and alignment, then
 * Download (PNG), Share (the phone's share sheet, when it can take a file) or
 * Copy (clipboard image, where the browser allows it).
 * Rendered inside .reader-root, so it takes the reader's own tokens.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { CARD_SIZES, drawVerseCard, loadCardFonts, cardFileName } from '../lib/verseCard.js';
import './VerseImageDialog.css';

const PREF_KEY = 'verse-card-prefs';
const GLOSSES = [
  { id: 'both', label: 'Both' },
  { id: 'hebrew', label: 'Hebrew only' },
  { id: 'gloss', label: 'English only' },
];
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; } };

export default function VerseImageDialog({ open, onClose, bookName, chapter, verse, text, family, glossMode: glossDefault, theme: themeDefault, shareUrl }) {
  const canvasRef = useRef(null);
  const saved = useRef(loadPrefs()).current;
  const [size, setSize] = useState(CARD_SIZES.some(s => s.id === saved.size) ? saved.size : 'square');
  const [theme, setTheme] = useState(saved.theme === 'night' || saved.theme === 'parchment' ? saved.theme : (themeDefault || 'night'));
  const [align, setAlign] = useState(saved.align === 'center' ? 'center' : 'left');
  const [glossMode, setGlossMode] = useState(glossDefault || 'both');
  const [fontsReady, setFontsReady] = useState(false);
  const [msg, setMsg] = useState('');
  const canShareFiles = typeof navigator !== 'undefined' && !!navigator.canShare;

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ size, theme, align })); } catch { /* non-fatal */ }
  }, [size, theme, align]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    loadCardFonts(family || '').then(() => { if (live) setFontsReady(true); });
    return () => { live = false; };
  }, [open, family]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    drawVerseCard(canvasRef.current, { bookName, chapter, verse, text, size, theme, family, glossMode, align });
  }, [open, fontsReady, bookName, chapter, verse, text, size, theme, family, glossMode, align]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const blob = useCallback(() => new Promise(res => canvasRef.current.toBlob(res, 'image/png')), []);
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 2200); };
  const fileName = cardFileName(bookName, chapter, verse);

  const download = async () => {
    const b = await blob();
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const share = async () => {
    const b = await blob();
    if (!b) return;
    const file = new File([b], fileName, { type: 'image/png' });
    const ref = `${bookName} ${chapter}:${verse}`;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: ref, text: shareUrl ? `${ref} — ${shareUrl}` : ref }); }
      catch (e) { if (e?.name !== 'AbortError') flash('Sharing failed — use Download instead.'); }
    } else {
      download();
    }
  };
  const copy = async () => {
    try {
      const b = await blob();
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': b })]);
      flash('Image copied');
    } catch { flash('This browser cannot copy images — use Download.'); }
  };

  if (!open) return null;

  return (
    <div className="vi-scrim" onClick={onClose}>
      <div className="vi-dialog" role="dialog" aria-label={`Image of ${bookName} ${chapter}:${verse}`} onClick={e => e.stopPropagation()}>
        <div className="vi-head">
          <span className="vi-title">Verse image</span>
          <button className="vi-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="vi-preview">
          <canvas ref={canvasRef} className="vi-canvas" />
        </div>
        <div className="vi-opts">
          <div className="vi-row"><span className="vi-label">Shape</span>
            <div className="vi-group">{CARD_SIZES.map(s => (
              <button key={s.id} className={`vi-chip ${size === s.id ? 'on' : ''}`} onClick={() => setSize(s.id)}>{s.label}</button>
            ))}</div>
          </div>
          <div className="vi-row"><span className="vi-label">Paper</span>
            <div className="vi-group">
              <button className={`vi-chip ${theme === 'night' ? 'on' : ''}`} onClick={() => setTheme('night')}>Night</button>
              <button className={`vi-chip ${theme === 'parchment' ? 'on' : ''}`} onClick={() => setTheme('parchment')}>Parchment</button>
            </div>
            <div className="vi-group">
              <button className={`vi-chip ${align === 'left' ? 'on' : ''}`} onClick={() => setAlign('left')}>Left</button>
              <button className={`vi-chip ${align === 'center' ? 'on' : ''}`} onClick={() => setAlign('center')}>Centered</button>
            </div>
          </div>
          <div className="vi-row"><span className="vi-label">Words</span>
            <div className="vi-group">{GLOSSES.map(g => (
              <button key={g.id} className={`vi-chip ${glossMode === g.id ? 'on' : ''}`} onClick={() => setGlossMode(g.id)}>{g.label}</button>
            ))}</div>
          </div>
        </div>
        <div className="vi-actions">
          <button className="vi-btn vi-primary" onClick={download}>Download PNG</button>
          {canShareFiles && <button className="vi-btn" onClick={share}>Share…</button>}
          {typeof window !== 'undefined' && window.ClipboardItem && <button className="vi-btn" onClick={copy}>Copy</button>}
          {msg && <span className="vi-msg">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
