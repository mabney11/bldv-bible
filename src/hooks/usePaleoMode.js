import { useState, useEffect, useCallback } from 'react';
import { getPaleoMode, setRenderMode, subscribe } from '../lib/paleoGlyphs.js';

/** usePaleoMode — reactive wrapper around paleoGlyphs.getPaleoMode().
 *  Components using this re-render whenever the user toggles the mode or saves
 *  a new user glyph (because the glyph editor calls subscribe-notifying APIs).
 */
export function usePaleoMode() {
  const [mode, setMode] = useState(() => getPaleoMode());

  useEffect(() => {
    return subscribe(m => setMode(m));
  }, []);

  const toggle = useCallback(() => {
    setRenderMode(mode === 'desktop' ? 'mobile' : 'desktop');
  }, [mode]);

  // Mirror the mode onto <body> so legacy mobile-layout CSS rules apply too.
  useEffect(() => {
    document.body.classList.toggle('mobile-layout', mode === 'mobile');
  }, [mode]);

  return { mode, setMode: setRenderMode, toggle };
}
