/**
 * versePreview — short, readable previews of one verse's word/token stream,
 * built for browser-tab titles (see hooks/usePageTitle.js and its per-page
 * callers: Parallel.jsx, HebrewViewer.jsx, MultiViewer.jsx). Same idea as
 * BibleHub's tabs, which the reader specifically asked to match: real verse
 * content in the tab title is something Ctrl+F, a tab switcher, or browser
 * history search can actually find later — not just a generic "Parallel" or
 * "Hebrew" tab indistinguishable from every other one open.
 *
 * NOT meant to exactly match WordBlock's real rendering (spacing, maqaf
 * joins, modifier brackets, etc.) — that component owns the real display.
 * This is just enough legible text for a title preview, extracted once here
 * so Parallel/HebrewViewer/MultiViewer don't each hand-roll a slightly
 * different (and possibly drifting) version.
 */
import { translit } from './books.js';

/** Truncate to `n` chars with an ellipsis — tab titles render in a fixed-
 *  width strip, so a preview long enough to describe itself beats one long
 *  enough to BE the verse. */
export function truncateTitle(s, n) {
  return s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : (s || '');
}

/**
 * Plain transliteration only, no gloss — for Parallel's source-side
 * preview, which sits alongside its own separate English-text segment (so a
 * gloss there would just repeat what the English segment already shows).
 * Handles both a rich per-word `components[]` shape (BHS-tokenized sources)
 * and a flat surface-string shape (plain-text sources).
 */
export function versePreviewTranslit(words) {
  if (!words || !words.length) return '';
  return words
    .map(w => (w.components?.length
      ? w.components.filter(c => !c.isMark).map(c => c.translit).filter(Boolean).join('')
      : translit(w.word_raw || w.word || '')))
    .filter(Boolean)
    .join(' ');
}

/**
 * "word (gloss)" — for MultiViewer's flat-text sources (Greek, Latin,
 * Ge'ez, Syriac, Coptic, ...). Unlike Hebrew's paleo glyphs, these scripts'
 * own text is already the displayable form (no separate transliteration
 * step), so this previews `token.word` directly rather than a `.translit`.
 */
export function versePreviewMultiTokens(tokens) {
  if (!tokens || !tokens.length) return '';
  return tokens
    .filter(t => !t.is_punct)
    .map(t => (t.gloss ? `${t.word} (${t.gloss})` : t.word))
    .filter(Boolean)
    .join(' ');
}

/**
 * Transliteration WITH gloss — "WaMalakay (king [and])" — for the Hebrew/
 * multi-language viewers, which have no separate English segment of their
 * own, so the gloss is what makes the preview meaningful on its own.
 */
export function versePreviewWithGloss(words) {
  if (!words || !words.length) return '';
  return words
    .map(w => {
      const comps = w.components?.length ? w.components : (w.translit ? [w] : []);
      return comps
        .map(c => {
          const tl = c.translit || '';
          const gloss = c.translation || c.gloss || '';
          return gloss ? `${tl} (${gloss})` : tl;
        })
        .filter(Boolean)
        .join(' ');
    })
    .filter(Boolean)
    .join(' ');
}
