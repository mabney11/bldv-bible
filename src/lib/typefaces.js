/**
 * TYPEFACES — the reading-typeface catalog for the "pretty" reading
 * surfaces (Reader's English/Hebrew prose, and Parallel's English column).
 *
 * Extracted out of Reader.jsx on 2026-08-15 so Parallel.jsx could reuse the
 * exact same catalog instead of hand-maintaining a second copy that could
 * silently drift out of sync (a different note, a missing face, a typo in a
 * font stack). Each page still keeps its OWN localStorage key and default —
 * see Reader.jsx's TYPEFACE_KEY/TYPEFACE_DEFAULT and Parallel.jsx's
 * PAR_TYPEFACE_KEY/PAR_TYPEFACE_DEFAULT — so choosing a font on one page
 * never surprises you on the other; only the available CHOICES are shared.
 *
 * `id` is what every page persists to localStorage — never rename one, add
 * a new entry instead, or a saved preference silently falls back to the
 * page's default.
 *
 *   • alegreya     — warm literary serif; Reader's default.
 *   • opendyslexic — weighted bottoms resist letter-flipping; Parallel's
 *                    default (2026-08-15, at the reader's request).
 *   • ysabeau      — humanist, even rhythm.
 *   • cochineal / antykwa / coelacanth* / kierkegaard — TeX/OSP faces with
 *     no @fontsource package; declared as @font-face in Reader.css reading
 *     from /fonts/. Until those .woff2 files are dropped in, each falls
 *     back to Alegreya, so a reading page never breaks on a missing file.
 *
 * A page that wants any of these faces to actually render must import the
 * matching @fontsource CSS itself (see the imports at the top of
 * Reader.jsx / Parallel.jsx) — this module is pure data, no side effects.
 */
export const TYPEFACES = [
  { id: 'alegreya',    label: 'Alegreya',    note: 'Warm literary serif',        stack: "'Alegreya', Georgia, serif" },
  { id: 'cochineal',   label: 'Cochineal',   note: 'Book serif, Crimson lineage',stack: "'Cochineal', 'Alegreya', Georgia, serif" },
  { id: 'antykwa',     label: 'Antykwa Toruńska', note: 'Polish book face',      stack: "'Antykwa Torunska', 'Alegreya', Georgia, serif" },
  { id: 'coelacanth-standard', label: 'Coelacanth', note: 'Standard optical size', stack: "'Coelacanth', 'Alegreya', Georgia, serif" },
  { id: 'coelacanth',  label: 'Coelacanth Pearl', note: 'Old-style, text size',  stack: "'Coelacanth Pearl', 'Coelacanth', 'Alegreya', Georgia, serif" },
  { id: 'coelacanth-display', label: 'Coelacanth Display', note: 'Larger optical size', stack: "'Coelacanth Display', 'Coelacanth', 'Alegreya', Georgia, serif" },
  { id: 'kierkegaard', label: 'Kierkegaard', note: 'Calligraphic',               stack: "'Kierkegaard', 'Alegreya', Georgia, serif" },
  { id: 'ysabeau',     label: 'Ysabeau',     note: 'Humanist, even rhythm',      stack: "'Ysabeau', system-ui, sans-serif" },
  { id: 'opendyslexic',label: 'OpenDyslexic',note: 'Weighted letterforms',       stack: "'OpenDyslexic', system-ui, sans-serif" },
];

export default TYPEFACES;
