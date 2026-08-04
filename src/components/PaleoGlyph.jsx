import { useMemo } from 'react';
import { paleoToSVG } from '../lib/paleoGlyphs.js';
import { usePaleoMode } from '../hooks/usePaleoMode.js';

/** PaleoGlyph — render a paleo string as inline SVGs.
 *  The hook subscription ensures re-rendering on mode change.
 *  `paleoToSVG` returns a complete HTML fragment, so we feed it via
 *  dangerouslySetInnerHTML.
 */
export default function PaleoGlyph({ text, size, className, style, ...rest }) {
  const { mode } = usePaleoMode();              // eslint-disable-line no-unused-vars
  const html = useMemo(() => paleoToSVG(text || '', size), [text, size, mode]);
  return (
    <span
      className={className}
      style={style}
      {...rest}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
