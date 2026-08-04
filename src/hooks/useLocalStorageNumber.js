import { useState, useEffect, useCallback } from 'react';

/** useLocalStorageNumber — read/write a numeric value to localStorage, in
 *  React-friendly form. Used by every slider on every page.
 *
 *  When `cssVar` is supplied, the value is also pushed onto :root as a CSS
 *  custom property with `px` units, so any styled descendants pick it up.
 *
 *  Returns [value, setValue, displayWithUnit].
 */
export function useLocalStorageNumber(key, defaultValue, cssVar) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    const raw = localStorage.getItem(key);
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : defaultValue;
  });

  // Apply to localStorage + CSS var whenever value changes.
  useEffect(() => {
    localStorage.setItem(key, String(value));
    if (cssVar) {
      document.documentElement.style.setProperty(cssVar, value + 'px');
    }
  }, [key, value, cssVar]);

  const set = useCallback(n => setValue(Number(n)), []);
  return [value, set];
}
