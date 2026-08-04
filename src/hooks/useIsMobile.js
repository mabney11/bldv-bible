import { useState, useEffect } from 'react';

/** useIsMobile — true when viewport is at or below the breakpoint.
 *  Used for layout switches (e.g. lexicon sidebar overlay vs inline).
 */
export function useIsMobile(breakpoint = 700) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);

  return isMobile;
}
