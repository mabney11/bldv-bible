import { useEffect, useRef } from 'react';
import { useIsMobile } from '../hooks/useIsMobile.js';
import './DisplayPanel.css';

/**
 * DisplayPanel — context-sensitive settings popup.
 *
 * Two presentations:
 *   - Desktop: floating dropdown anchored to the top-bar gear button.
 *   - Mobile:  full-width bottom sheet with a drag handle. Touch-friendly,
 *              doesn't compete for screen real-estate with the keyboard.
 *
 * `open` controls visibility; closing fires onClose. Clicking the backdrop
 * (mobile) or outside the panel (desktop) also closes.
 */
export default function DisplayPanel({ open, onClose, title = 'Display', children }) {
  const isMobile = useIsMobile(700);
  const panelRef = useRef(null);

  // Outside-click close (desktop only — mobile uses an explicit backdrop).
  useEffect(() => {
    if (!open || isMobile) return;
    const onClick = e => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    // Defer attaching so the opening-click doesn't immediately close.
    const t = setTimeout(() => document.addEventListener('click', onClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onClick);
    };
  }, [open, isMobile, onClose]);

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    if (open && isMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open, isMobile]);

  // Escape key closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (isMobile) {
    return (
      <div className="dp-overlay" onClick={onClose}>
        <div
          className="dp-sheet"
          role="dialog"
          aria-label={title}
          onClick={e => e.stopPropagation()}
          ref={panelRef}
        >
          <div className="dp-handle" />
          <div className="dp-title-row">
            <span className="dp-title">{title}</span>
            <button className="dp-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="dp-body">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dp-floating" role="dialog" aria-label={title} ref={panelRef}>
      <div className="dp-title-row">
        <span className="dp-title">{title}</span>
        <button className="dp-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="dp-body">{children}</div>
    </div>
  );
}
