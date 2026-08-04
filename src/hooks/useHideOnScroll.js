import { useEffect, useState } from 'react';

/** useHideOnScroll — returns `hidden = true` when the user scrolls down past
 *  a threshold, `false` when they scroll up. Used by sticky toolbars that
 *  retract on scroll-down.
 */
export function useHideOnScroll(threshold = 80) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = 0;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > lastY && y > threshold)      setHidden(true);
        else if (y < lastY || y <= threshold) setHidden(false);
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return hidden;
}
