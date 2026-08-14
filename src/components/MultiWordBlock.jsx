/**
 * MultiWordBlock — one word of ANY original-language text in the reader.
 *
 * Script-agnostic: the writing system, direction and font are detected from the
 * word's own Unicode (detectScript), not from the source tag — so Syriac renders
 * RTL in Estrangela, Old Church Slavonic in a Cyrillic face, Coptic/Armenian/
 * Georgian/Ge'ez each in their own, with no per-language code here.
 *
 * NOT FOR HEBREW. Hebrew — BHS and HEB alike — renders through HebrewViewer ->
 * WordBlock, which has the token stream: Strong's, roots, prefix/suffix
 * components and the curated-gloss chain. This component only ever had a Hebrew
 * branch because HEB used to be routed here before it had tokens; App.jsx now
 * sends every Hebrew source to HebrewViewer, so that branch was unreachable AND
 * contradictory — it printed "— not glossed —" where the Hebrew path shows the
 * unglossed root's paleo. One renderer per script, and Hebrew's is WordBlock.
 *
 *   • clicking the WORD copies it (like the Hebrew WordBlock)
 *   • a context line shows lemma + parsing (Greek NT) and your gloss, or a
 *     visible "— not glossed —" marker
 *   • badges link OUT to the per-word concordance page (surf + Strong's)
 */
import { detectScript } from '../lib/scripts.js';
import { transliterate } from '../lib/translit.js';

// Reader source to open occurrences in, per corpus.
const READER_SRC = { GNT: 'LXX', LXX: 'LXX', GRC: 'LXX', GEZ: 'GEZ', LAT: 'LAT' };

// Corpora concordance.db actually has tokens for (must match server.js's
// _CONC_GROUP keys exactly). English ('ENG') is a reader/viewer source only —
// build-concordance.py never indexes it — so it is deliberately absent here.
// Linking a "surf"/lemma badge for a corpus outside this set 404s nowhere in
// the UI to catch it: /api/concordance/* 400s "bad corpus" and the
// Concordance page is left showing a stuck "Loading…" forever. Those dead
// links were also getting crawled and indexed by Google as broken pages, so
// this list is load-bearing for SEO, not just UX. 2026-08-14, fieldy.
const CONC_SUPPORTED = new Set(['HEB', 'LXX', 'GNT', 'GRC', 'LAT', 'GEZ', 'SYR', 'COP']);

export default function MultiWordBlock({ token, source }) {
  // Standalone sentence punctuation (። etc.) emitted by the tokenizer as its own
  // token: render a quiet thought-boundary mark instead of a word block, so the
  // end of one sentence and the start of the next is visible — not swallowed.
  if (token.is_punct) {
    return (
      <span className="mwb-sentence-end" aria-hidden="true"
            style={{ alignSelf: 'center', color: 'var(--text4)',
                     fontSize: 'calc(var(--paleo-size, 32px) * 1.3)', lineHeight: 1,
                     padding: '0 0.22em', userSelect: 'none', pointerEvents: 'none' }}>
        {token.punct || '።'}
      </span>
    );
  }
  // Critical-edition texts (esp. the LXX) mark reconstructed/uncertain letters
  // with editorial brackets [ ] ⟦ ⟧ ⸢ ⸣, which split across tokens and read as
  // "random brackets" in the verse. Strip them from the surface before anything
  // else (display, transliteration, copy, gloss key) — they're apparatus, not text.
  const cleanWord = String(token.word || '').replace(/[\[\]\u27e6\u27e7\u2e22\u2e23\u2e24\u2e25\u230a\u230b]/g, '');
  const meta = detectScript(cleanWord);               // {script, dir, font, lang, rtl}
  const translit = transliterate(cleanWord, { script: meta.script === 'latin' ? 'latin' : undefined });
  const isEthiopic = meta.script === 'ethiopic';
  // Ge'ez punctuation (፡ wordspace = ":", ። section = "::") is never part of the
  // clickable/copyable word. Peel any trailing Ethiopic marks off the surface,
  // then fold in a stronger mark carried by a following punctuation token that
  // MultiViewer merged onto this word as `trailMark` (so a sentence-ending word
  // shows only "።", not "፡" then "።"). No wordspace is invented when the data
  // has none — that only produced duplicates.
  const _rank = (m) => { const c = (m || '').codePointAt(0) || 0;
    return (c >= 0x1362 && c <= 0x1368) ? 2 : (c === 0x1361 ? 1 : 0); };
  let geezTrail = '';
  let geezCore  = cleanWord;
  if (isEthiopic) {
    const m = cleanWord.match(/[\u1360-\u1368]+$/);
    if (m) { geezTrail = m[0]; geezCore = cleanWord.slice(0, cleanWord.length - m[0].length); }
    if (token.trailMark && _rank(token.trailMark) >= _rank(geezTrail)) geezTrail = token.trailMark;
  }
  const displayWord = isEthiopic ? geezCore : cleanWord;
  // Copy === the GLOSS KEY, so a word copied from the reader Ctrl-F-matches its
  // lexicon entry, in every language, with no punctuation. Prefer the server's
  // canonical gloss_key; if absent, canonicalize locally the same way (strip
  // sentence punctuation + editorial brackets; Greek positional grave→acute).
  // (Hebrew is not handled here — see the header note.)
  const canonCopy = (s) => {
    let w = String(s || '').normalize('NFC')
        .replace(/[\u1360-\u1368\u00B7.,:;!?\u037E\u0387\u2026\u2024\[\]\u27e6\u27e7\u2e22\u2e23\u2e24\u2e25\u230a\u230b]/g, '')
        .trim();
    if (meta.script === 'greek')    w = w.normalize('NFD').replace(/\u0300/g, '\u0301').normalize('NFC');
    if (meta.script === 'ethiopic') w = w.replace(/[\u1360-\u1368]/g, '').trim();
    return w;
  };
  const copyText = token.gloss_key || canonCopy(cleanWord);
  const wordFont = meta.font;
  const hasMorph = !!token.lemma;
  // concordance corpus: keep the known Greek/Ge'ez/Latin mapping, else pass the
  // source through (new corpora like SYR/SLA index under their own tag).
  const corpus = source === 'GEZ' ? 'GEZ'
               : source === 'LAT' ? 'LAT'
               : (source === 'LXX' || source === 'GNT' || source === 'GRC')
                   ? (hasMorph ? 'GNT' : 'LXX')
               : source;
  const hasConcordance = CONC_SUPPORTED.has(corpus);
  const base = `/concordance?corpus=${corpus}&source=${encodeURIComponent(source)}`;

  const copy = (e) => {
    try {
      navigator.clipboard.writeText(copyText);
      const el = e.currentTarget;
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 1200);
    } catch { /* ignore */ }
  };

  return (
    <div
      className={`word-block multi-word-block script-word mwb-${meta.script}${token.gloss ? '' : ' mwb-unglossed'}`}
      data-script={meta.script}
      data-dir={meta.dir}
      data-word-norm={token.word_norm}
    >
      <div className="paleo mwb-paleo">
        <span
          className="visible-text clickable-comp"
          lang={meta.lang || undefined}
          dir={meta.dir}
          style={{ fontFamily: wordFont }}
          onClick={copy}
          title={`Copy "${copyText}"`}
        >{displayWord}</span>
        {isEthiopic && geezTrail && (
          <span
            className="mwb-geez-sep"
            aria-hidden="true"
            style={{ userSelect: 'none', pointerEvents: 'none', color: 'var(--text4)',
                     fontFamily: wordFont, alignSelf: 'center', lineHeight: 1,
                     fontSize: 'calc(var(--paleo-size, 32px) * 1.3)',
                     paddingInlineStart: '0.06em', paddingInlineEnd: '0.16em' }}
          >{geezTrail}</span>
        )}
      </div>

      {translit && meta.script !== 'latin' && (
        <span className="mwb-translit" style={{ display: 'block', textAlign: 'center', opacity: 0.6, fontSize: '0.8em', fontStyle: 'italic' }}>{translit}</span>
      )}

      <div className="w" dir="ltr">
        {hasMorph && <span className="w-translit root" lang="grc" style={{ fontWeight: 700 }}>{token.lemma}</span>}
        {/* Grammar/morphology (pos, tense, person…) intentionally NOT shown here —
            it clutters the block and buries the gloss. It lives in the read-only
            "descriptive raw tokens" panel below the verse, like the Hebrew reader. */}
        {token.gloss ? (
          <span style={{ display: 'block' }}>
            <span className="brk">(</span><span className="root">{token.gloss}</span><span className="brk">)</span>
          </span>
        ) : (
          <span style={{ display: 'block', opacity: 0.3, fontStyle: 'italic' }}>— not glossed —</span>
        )}

        {hasConcordance && (
          <span className="strongs-badge" style={{ marginTop: '4px', display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="surf-badge-link" href={`${base}&word=${encodeURIComponent(token.word)}`} title="Surface concordance"
               style={{ fontSize: '10px', fontFamily: 'monospace', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(62,207,176,0.35)', background: 'rgba(62,207,176,0.08)', color: 'var(--teal, #3ecfb0)', textDecoration: 'none' }}>surf</a>
            {hasMorph && (
              <a className="sn-link root" href={`${base}&lemma=${encodeURIComponent(token.lemma)}`} title="Lemma concordance"
                 style={{ fontSize: '10px', fontFamily: 'monospace', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(74,158,255,0.3)', background: 'rgba(74,158,255,0.1)', color: 'var(--blue, #4a9eff)', textDecoration: 'none' }}>{token.strongs || 'lemma'}</a>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
