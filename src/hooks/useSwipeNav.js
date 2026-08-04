import { useEffect, useRef } from 'react';

/** useSwipeNav — bind global swipe-left / swipe-right and ArrowLeft/ArrowRight
 *  to next/prev callbacks. Skips when focus is in a typing element.
 *
 *  Swipes match RTL reading direction: swipe right → onPrev, swipe left → onNext.
 */
export function useSwipeNav(onPrev, onNext, opts = {}) {
  const ref = useRef({ tx: null, ty: null });
  const enabled = opts.enabled !== false;
  const threshold = opts.threshold || 40;

  useEffect(() => {
    if (!enabled) return;

    const isTyping = el =>
      el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
             el.tagName === 'SELECT' || el.isContentEditable);

    const onKey = e => {
      if (isTyping(document.activeElement)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext?.(); }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev?.(); }
    };

    const onTouchStart = e => {
      if (e.touches.length !== 1) return;
      ref.current.tx = e.touches[0].clientX;
      ref.current.ty = e.touches[0].clientY;
    };

    const onTouchEnd = e => {
      const { tx, ty } = ref.current;
      ref.current.tx = ref.current.ty = null;
      if (tx == null || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      // Right swipe (positive dx) = prev (RTL reading direction).
      if (dx > 0) onPrev?.(); else onNext?.();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend',   onTouchEnd);
    };
  }, [enabled, threshold, onPrev, onNext]);
}
