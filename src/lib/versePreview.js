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
 * Transliteration WITH gloss — "WaYaNabat (and-he/it)" — for the Hebrew
 * viewer's tab title, which has no separate English segment of its own, so
 * the gloss is what makes the preview meaningful on its own.
 *
 * One combined word per token (every component's translit concatenated,
 * tight-run — no separator, same as a plain transliteration reads) followed
 * by AT MOST one trailing parenthetical listing every component that HAS a
 * gloss, dash-joined. "Wa (and) Ya (he/it)" — a separate parenthetical per
 * component — reads as disconnected fragments instead of the one word it
 * actually is; concatenating the translit and folding every gloss into one
 * dash-joined list fixes that.
 */
export function versePreviewWithGloss(words) {
  if (!words || !words.length) return '';
  return words
    .map(w => {
      const comps = (w.components?.length ? w.components : (w.translit ? [w] : [])).filter(c => !c.isMark);
      const tl = comps.map(c => c.translit || '').join('');
      if (!tl) return '';
      const glosses = comps.map(c => c.translation || c.gloss || '').filter(Boolean);
      return glosses.length ? `${tl} (${glosses.join('-')})` : tl;
    })
    .filter(Boolean)
    .join(' ');
}
