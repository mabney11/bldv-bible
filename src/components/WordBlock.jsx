import { useMemo } from 'react';
import { paleoToSVG } from '../lib/paleoGlyphs.js';
import { usePaleoMode } from '../hooks/usePaleoMode.js';

// Classes treated as suffix vs prefix for the alternating-color logic.
// mod-suff-unk: heb-align.js's fallback for a stripped NT suffix tail with no
// attested BHS component to borrow (rare — SUF_COMPS usually finds one, which
// carries its own real nme-/prs-/vbe- class instead). Treat it the same way.
const SUFFIX_PREFIXES = ['nme-', 'prs-', 'vbe-', 'mod-suff-unk'];
const PREFIX_FULL = [
  'mod-conj','mod-prep','mod-art','mod-nega','mod-advb',
  'mod-intj','mod-inrg','mod-prde','mod-prps','mod-prin','mod-nmpr',
  'mod-pref-unk','mod-cstr',
];
const PREFIX_STARTS = ['pfm-','vbs-'];

// A gloss made ENTIRELY of Paleo letters is the server's placeholder — the root
// of a word nothing curated covers yet — not a translation. It must never be
// suppressed as redundant: the whole point is that it shows up as work to do.
const PALEO_ONLY_RE = /^[\u{10900}-\u{1091F}\s]+$/u;
export const isPlaceholderGloss = (comp, clean) =>
  comp.gloss_src === 'none' || (!!clean && PALEO_ONLY_RE.test(clean));

// True when this word's own components end in a maqaf mark — i.e. it's
// typographically joined to the NEXT word/token in the verse (a separate
// WordBlock, not baked into this one's components). Callers that lay out
// consecutive WordBlocks (HebrewViewer, Parallel, …) use this to tighten the
// margin between the two so a maqaf-joined pair reads visually connected,
// the way a real fused compound chip does.
export const hasTrailingMaqaf = wordObj => {
  const comps = wordObj && wordObj.components;
  if (!comps || !comps.length) return false;
  const last = comps[comps.length - 1];
  return !!(last && last.isMaqaf);
};

const isSuffix = css => SUFFIX_PREFIXES.some(p => css && css.startsWith(p));
const isPrefix = css =>
  (css && PREFIX_FULL.includes(css)) ||
  PREFIX_STARTS.some(p => css && css.startsWith(p));

// Strong's-number formatting/classification — module-level (not tied to any
// component instance) so both WordBlock and WordRow below can call them.
export const fmtSN = s => (s ? 'H' + String(s).replace(/^H+/i, '') : null);
// H9000+ are virtual/grammar codes (connectors, prepositions, articles) that
// were never given root-explorer entries — see the root-index builder's
// `snNum >= 9000` skip. Badge still shows the code for reference, but it
// isn't a link since /roots?sn=H9xxx 404s.
export const isVirtualSN = s => {
  const n = parseInt(String(s).replace(/^H/i, ''), 10);
  return !isNaN(n) && n >= 9000;
};

// One component → one clickable glyph span (SVG for an actual Paleo letter,
// dimmed text for a non-Paleo mark/punctuation). Shared by WordBlock's own
// glyph row and WordRow's compact per-word-row rendering below, so the two
// can never visually drift apart from rendering the same compDescs shape two
// different ways.
function compDescsToHtml(compDescs) {
  return compDescs.map(c => {
    const altAttr = c.altAttr ? ` data-alt="${c.altAttr}"` : '';
    const ord = c.ordinal != null ? ` data-ordinal="${c.ordinal}"` : '';
    if (!hasPaleo(c.paleo)) {
      return `<span class="${c.css} clickable-comp paleo-punct"${altAttr}${ord} data-paleo="${escapeHtml(c.paleo)}" style="display:inline-flex;align-items:center;font-size:0.5em;opacity:0.75;padding:0 0.12em;">${escapeHtml(c.paleo)}</span>`;
    }
    const inner = paleoToSVG(c.paleo);
    return `<span class="${c.css} clickable-comp"${altAttr}${ord} data-paleo="${escapeHtml(c.paleo)}" style="display:inline-flex;align-items:flex-end;">${inner}</span>`;
  }).join('');
}

// Shared with WordRow's Transliteration column (see below) — one colored span
// per component, e.g. "<span class=mod-conj>Ha</span><span class=root>Dawar</span>"
// for "HaDawar". Relies on the SAME morphColors.css mechanism WordBlock's own
// .w-translit line uses: each span's css class (mod-conj, root, prs-2mp, …)
// sets the --mc custom property, and an ancestor rule picks that up as the
// element's `color`. WordBlock supplies that ancestor via `.w span`; WordRow
// supplies its own narrower `.wr-translit-inner span` rule instead, since a
// table cell doesn't want `.w`'s font-size/direction/max-width baggage.
// opts.capitalizeEach: WordRow-only — "LaKam should capitalize the K since
// it is a different word". The source translit data itself is lowercase for
// bound suffixes (prs-2mp's own translit is "kam", not "Kam" — confirmed via
// the raw /api/tokens component data), which reads fine in HebrewViewer's
// own .w-translit line where each morpheme is ALSO set off by its own color.
// WordRow's Transliteration cell already carries that same per-component
// color, but concatenated tightly with no color legend nearby, a second
// (lowercase) morpheme boundary reads as one run-on word rather than two —
// capitalizing each component's first letter gives a second, color-blind-
// safe cue to the same boundary. Scoped to WordRow only (via this opt) so
// WordBlock's own established translit line elsewhere is untouched.
function transliterationsToHtml(transliterations, opts = {}) {
  // "there should be dashes wherever they are in hebrew" — a compound word's
  // transliteration reads as one run-on word without a visible seam between
  // its morphemes (Il + Kapayam -> "IlKapayam"), even with per-component
  // color. A literal hyphen between components (Il-Kapayam, Pan-ThaNagap)
  // makes the boundary explicit regardless of color. Only entries with real
  // text get a dash BETWEEN them — an empty/blank component (no translit,
  // e.g. an unmarked mark-adjacent slot) contributes nothing and must not
  // leave a stray leading/trailing/doubled "-".
  //
  // "i dont want the dashes if there is not a genuine symbol" — a dash marks
  // a seam between two REAL written Paleo-Hebrew letters. A component whose
  // text has no actual glyph behind it (hasGlyph: false — synthetic/blank,
  // not a real U+10900–U+1091F letter) isn't a genuine morpheme boundary, so
  // no dash renders on either side of it.
  const withText = transliterations.filter(t => t && t.text);
  return withText.map((t, i) => {
    const altAttr = t.altAttr ? ` data-alt="${t.altAttr}"` : '';
    let text = t.text;
    if (opts.capitalizeEach && text) text = text.charAt(0).toUpperCase() + text.slice(1);
    const prev = withText[i - 1];
    const dash = (i > 0 && t.hasGlyph && prev && prev.hasGlyph) ? '<span class="wr-translit-dash">-</span>' : '';
    return `${dash}<span class="${t.css}"${altAttr}>${escapeHtml(text)}</span>`;
  }).join('');
}

// A component whose text carries no Paleo-Hebrew letter (U+10900–U+1091F) has no
// glyph in the Paleo script — it's punctuation or a literal mark (sof-pasuq ׃,
// maqaf ־, the : stops). Render the mark itself as text, the way the Ge'ez
// reader shows ፡ / ። inline, instead of dropping it to a blank span.
const PALEO_LETTER_RE = /[\u{10900}-\u{1091F}]/u;
const hasPaleo = s => PALEO_LETTER_RE.test(s || '');
const escapeHtml = s => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * computeWordParts — derive the rendering pieces for one word.
 *
 * Returns an object with:
 *   purePaleo:     the raw paleo string for clipboard / search highlighting
 *   compDescs[]:   { css, paleo, altAttr, ordinal } — one entry per component
 *                  (used to render each clickable glyph span)
 *   transliterations[]: { css, text, altAttr }
 *   rootTrans[]:   { lemmaPrefixHtml, clean }   — translated root parts
 *   modTrans[]:    { css, clean, altAttr }      — translated modifier parts
 *   hasRootComp:   bool — true if any component is css==='root' (see WordRow's
 *                  Transliteration column, which capitalizes every component
 *                  only when this is false — a word built entirely from
 *                  prefix/suffix particles with no lexical root of its own)
 */
export function computeWordParts(wordObj) {
  const out = {
    purePaleo: '',
    compDescs: [],
    transliterations: [],
    rootTrans: [],
    modTrans: [],
    // A trailing mark (maqaf, sof-pasuq, paseq …) is pulled out of compDescs
    // entirely and reported here instead of staying in the glyph row. Two
    // reasons: (1) a trailing maqaf joins this word to a SEPARATE next
    // WordBlock, so it belongs visually BETWEEN the two, not glued onto this
    // one; (2) ANY trailing mark left inline unbalances .paleo's own content
    // width against the (mark-free) translit/gloss row below it — .word-block
    // centers .paleo as a whole against that row, so a mark hanging off one
    // side drags the real letters off-center from their own gloss (confirmed
    // on Genesis 1:9's Kan, whose trailing sof-pasuq was doing exactly this).
    // { paleo, isMaqaf } — isMaqaf picks the divider-between-words styling;
    // anything else gets the quieter trailing-punctuation styling.
    trailingMark: null,
  };
  let prefixIdx = 0, suffixIdx = 0, rootSeen = false;

  // A token with no baked components (e.g. a bare punctuation mark like ׃ or ־)
  // still needs to render — synthesize a single component from its surface so
  // the mark is visible rather than dropped.
  const comps = (wordObj.components && wordObj.components.length)
    ? wordObj.components
    : (wordObj.word_raw ? [{ paleo: wordObj.word_raw, css: 'root', token_ordinal: wordObj.token_ordinal }] : []);

  // Does this block have a root-class component at all? A block whose only
  // content word is a proper noun does not — the server classes proper nouns
  // mod-nmpr — and the name should still head it. Exposed on `out` (below)
  // for WordRow's Transliteration column: "these words are a prefix and
  // suffix with no root, I want to treat them both as roots" (Lakam, for +
  // your) "but YaIbaraW should not be YaIbaraw" (Ibar HAS a real root, so
  // its bound suffix stays lowercase like everywhere else) — the rule is
  // exactly hasRootComp: false means capitalize every component, true means
  // don't.
  const hasRootComp = comps.some(c => c && c.css === 'root');
  out.hasRootComp = hasRootComp;
  // "I should see 'believe / have faith' in the second column, right next to
  // 𐤀𐤌𐤍" — a standalone word whose ONE component is tagged with a
  // PREFIX_FULL/SUFFIX_PREFIXES class (mod-advb, mod-nega, mod-prps, …) was
  // always being treated as a modifier with nothing to modify, because those
  // classes exist to mark grammatical particles PREFIXED/SUFFIXED onto a
  // following/preceding root — e.g. veha- (conjunction+article) glued onto a
  // noun. But H543 "Aman" ("believe/have faith", POS advb) here isn't a
  // prefix attached to anything; it's the WHOLE word, tagged advb only
  // because of how it functions in this sentence. Same root cause the
  // existing mod-nmpr special case below already carves out for standalone
  // proper nouns — extended here to ANY class, but scoped tightly (single
  // real component, i.e. nothing else in the word for it to conceivably be
  // modifying) so a genuine multi-component prefix chain is never affected.
  const isSoloComp = comps.filter(c => c && !c.isMark).length === 1;

  comps.forEach(comp => {
    // Mark tokens (maqaf ־, sof-pasuq ׃, paseq ׀ …): never part of the
    // copyable/searchable paleo (purePaleo). Pulled out of compDescs entirely
    // — see trailingMark above for why — and reported as trailingMark instead.
    // Still visible; just rendered as its own element outside the glyph row.
    if (comp.isMark) {
      out.trailingMark = { paleo: comp.paleo, isMaqaf: !!comp.isMaqaf };
      return;
    }
    out.purePaleo += comp.paleo;

    let altIdx = 0;
    if (isPrefix(comp.css) && !rootSeen)      altIdx = prefixIdx++;
    else if (isSuffix(comp.css))              altIdx = suffixIdx++;
    else                                      rootSeen = true;
    const altAttr = altIdx % 2 === 1 ? '1' : null;

    const ordinal = comp.token_ordinal != null ? comp.token_ordinal : wordObj.token_ordinal;
    out.compDescs.push({ css: comp.css, paleo: comp.paleo, altAttr, ordinal });
    out.transliterations.push({ css: comp.css, text: comp.translit || '', altAttr, hasGlyph: hasPaleo(comp.paleo) });

    const clean = (comp.translation || '').replace(/[\[\]]/g, '');
    // The redundancy rule (gloss === transliteration) is what hides proper
    // nouns: a name's gloss usually IS its transliteration, so names dropped out
    // of the reader entirely — including the placeholder that says "this one
    // still needs an entry". Placeholders are exempt; genuinely redundant
    // curated glosses stay hidden as before.
    const suppress =
      (!clean || clean.toLowerCase() === (comp.translit || '').toLowerCase()) &&
      !isPlaceholderGloss(comp, clean);

    if (!suppress) {
      // A proper noun is the HEAD of its block, not a modifier of something
      // else — so when no root-class component exists, the name takes the root
      // slot and reads `(𐤉𐤔𐤅𐤏)` rather than `([𐤉𐤔𐤅𐤏])`. Same one-root-per-block
      // rule the server applies when it demotes fused particles; mod-nmpr keeps
      // its class (and its colour) either way. isSoloComp generalizes this to
      // any standalone particle/adverb/pronoun/etc. — see isSoloComp above.
      const headsBlock = comp.css === 'root' || (!hasRootComp && (comp.css === 'mod-nmpr' || isSoloComp));
      if (headsBlock) {
        // The root glyph itself already shows comp.paleo, which the SERVER has
        // resolved to the TRUE ROOT (root_paleo) — it shines through regardless
        // of the surface letters. The optional lemma hint below is purely
        // data-driven from server fields (lemmaTranslit / legacy trueRoot); the
        // client never derives roots or glosses on its own.
        let lemmaPrefixHtml = '';
        if (comp.trueRoot) {
          const rs = 'font-style:normal;font-family:"Segoe UI Historic",sans-serif;unicode-bidi:embed;';
          lemmaPrefixHtml = `<span style="color:#888;font-size:.9em;font-style:italic">${comp.lemmaTranslit} (<span dir="rtl" style="${rs}">${comp.trueRoot}</span>) &rarr; </span>`;
        } else if (comp.lemmaTranslit &&
                   comp.lemmaTranslit.toLowerCase() !== (comp.translit || '').toLowerCase()) {
          lemmaPrefixHtml = `<span style="color:#888;font-size:.9em;font-style:italic">${comp.lemmaTranslit} &rarr; </span>`;
        }
        // paleo: the root component's own glyph text (undecorated — no
        // lemmaPrefixHtml) — added for VersePage's WordRow table, which needs
        // to render the bare root glyph in its own "Lex Word" column
        // separately from the full inflected word WordBlock's .paleo shows.
        // translit: the root component's own transliteration text (e.g.
        // "aman") — added for WordRow's "Transliteration" column, which sits
        // between Root and Definition ("i forgot, there should be a
        // transliteration column before the definition").
        out.rootTrans.push({ lemmaPrefixHtml, clean, paleo: comp.paleo, translit: comp.translit || '' });
      } else {
        // paleo here too, same reason — WordRow's "Modifications" column
        // pairs each prefix/suffix's own glyph with its gloss (e.g. "𐤅 and"),
        // which modTrans alone (translated gloss only) can't supply.
        out.modTrans.push({ css: comp.css, clean, altAttr, paleo: comp.paleo });
      }
    }
  });

  return out;
}

/**
 * WordBlock — visual block for one Hebrew word in HebrewViewer or Parallel.
 *
 * Props:
 *   wordObj:        the BHS word object (components[] with css, paleo, translit, translation, ...)
 *   showSub:        bool, render translit + translation underneath (default true)
 *   showCopyBtn:    bool, show the copy-word icon for multi-component words
 *   showStrongs:    bool, show the SN badge + surface link
 *   onComponentClick(comp): click on a single component span
 *   className:      extra classes for the outer block
 *   highlightSearch: paleo substring; if matched in any component, adds 'search-match'
 *   onHoverIn/Out:  for parallel-mode hover correspondences
 */
export default function WordBlock({
  wordObj,
  showSub = true,
  showCopyBtn = true,
  showStrongs = true,
  onComponentClick,
  className = '',
  highlightSearch = '',
  onHoverIn,
  onHoverOut,
}) {
  const { mode } = usePaleoMode();

  const parts = useMemo(() => computeWordParts(wordObj), [wordObj]);

  // Render each glyph component as its own span containing paleoToSVG output.
  // The span keeps its css class + data-ordinal so the Parallel hover system
  // and copy-on-click both work. Mark tokens (maqaf, sof-pasuq, paseq …)
  // never reach compDescs — they're pulled out to trailingMark and rendered
  // separately (see below).
  const glyphHtml = useMemo(() => compDescsToHtml(parts.compDescs), [parts, mode]);

  // The transliteration line is a sequence of colored spans
  const translitHtml = useMemo(() => transliterationsToHtml(parts.transliterations), [parts]);

  // Translation: (rootTrans... [mod1-mod2-...])
  const translationHtml = useMemo(() => {
    if (!parts.rootTrans.length && !parts.modTrans.length) return '';
    const rootHtml = parts.rootTrans.map(r =>
      `<span class="root">${r.lemmaPrefixHtml}${r.clean}</span>`
    ).join('');
    const modBits = parts.modTrans.map(m => {
      const altAttr = m.altAttr ? ` data-alt="${m.altAttr}"` : '';
      return `<span class="${m.css}"${altAttr}>${m.clean}</span>`;
    });
    let html = '<span class="brk">(</span>' + rootHtml;
    if (modBits.length) {
      if (rootHtml) html += ' ';
      html += '<span class="brk">[</span>' + modBits.join('<span class="brk">-</span>') + '<span class="brk">]</span>';
    }
    html += '<span class="brk">)</span>';
    return html;
  }, [parts]);

  // Maqaf chip: split components into the per-half segments (delimited by the maqaf
  // mark) so each half can render its OWN glyphs + translit + gloss + badges under its
  // own characters, instead of one mashed sub-line. null for ordinary (non-maqaf) words.
  const maqafSplit = useMemo(() => {
    const comps = wordObj.components || [];
    if (!comps.some(c => c.isMaqaf)) return null;
    const segs = [[]];
    const dividers = [];
    for (const c of comps) {
      if (c.isMaqaf) { segs.push([]); dividers.push(c.paleo || '-'); continue; }
      segs[segs.length - 1].push(c);
    }
    // A maqaf with nothing on one side (most commonly TRAILING — the word's
    // last component IS the mark, e.g. וַיְהִי־ continuing into a SEPARATE
    // next word/token this components array doesn't even contain) is not a
    // two-word compound baked into one word's data — it's an ordinary word
    // with a typographic mark tacked on. Splitting it produces an empty
    // phantom "half" AND misassigns sourceTokens positionally below (src[i]
    // against segs[i] assumes exactly one source token per segment, which
    // breaks the moment a real segment itself spans more than one raw token
    // — e.g. a conjunction + root pair). Confirmed against production data:
    // Genesis 1:8's וַיְהִי־ (H1961) showed its Strong's badge as H9000 (the
    // conjunction's own SN) instead, because segs[0] (conj+pfm+root, 3
    // comps) got matched against sourceTokens[0] alone (the bare conj)
    // while sourceTokens[1] (the real H1961 root) got orphaned onto the
    // empty phantom second segment instead of showing under its own glyphs.
    // Only treat this as a genuine compound chip when EVERY segment has
    // real content on both sides of the mark — otherwise fall through to
    // the normal (non-split) render below, which already handles isMark
    // components correctly (dimmed glyph, never given a gloss chip).
    if (segs.some(s => s.length === 0)) return null;
    return { segs, dividers };
  }, [wordObj]);

  // Strong's badge: per-component SN links + surface link
  const surfaceForm = wordObj.word_raw || parts.purePaleo;
  const _fmtSN = fmtSN;
  const _isVirtualSN = isVirtualSN;
  // One badge group per maqaf-half: each carries its own surface (surf link) + root
  // Strong's, so a joined chip (BaYawam-Apaw) shows BOTH words standing alone. A normal
  // word yields a single group (its whole written surface + its root).
  const badgeGroups = (wordObj.sourceTokens && wordObj.sourceTokens.length)
    ? wordObj.sourceTokens.map(t => ({ word_raw: t.word_raw, strongs: _fmtSN(t.strongs) }))
    : [{ word_raw: surfaceForm, strongs: _fmtSN(wordObj.strongs) }];
  const showBadge = showStrongs && badgeGroups.some(g => g.word_raw || g.strongs);

  // Click handler — delegate to the wrapper, look up which component was hit.
  const onWrapClick = e => {
    const el = e.target.closest?.('.clickable-comp');
    if (!el) return;
    const paleo = el.getAttribute('data-paleo');
    if (!paleo) return;
    if (onComponentClick) {
      onComponentClick(paleo, el);
    } else {
      // Default behavior: copy the paleo text + show short "copied" feedback.
      try {
        navigator.clipboard.writeText(paleo);
        el.classList.add('copied');
        setTimeout(() => el.classList.remove('copied'), 1500);
      } catch (e) { /* ignore */ }
    }
  };

  const hasSearchMatch =
    highlightSearch &&
    parts.compDescs.some(c => c.paleo.includes(highlightSearch));

  // Maqaf chip → one row of per-half sub-blocks (each its own glyphs/translit/gloss/
  // badges) joined by the dash, plus the compound's two-word core root once at the end.
  // Reuses WordBlock per half; halves carry no maqaf component, so there's no recursion.
  if (maqafSplit) {
    const src = wordObj.sourceTokens || [];
    return (
      <div
        className={`word-block maqaf-chip ${className}`}
        data-ordinal={wordObj.token_ordinal}
        data-verse={wordObj.verse}
        onMouseEnter={onHoverIn}
        onMouseLeave={onHoverOut}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: '2px' }}
      >
        {maqafSplit.segs.flatMap((segComps, i) => {
          const st = src[i] || {};
          const half = {
            verse: wordObj.verse,
            token_ordinal: st.token_ordinal ?? wordObj.token_ordinal,
            components: segComps,
            strongs: st.strongs,
            word_raw: st.word_raw,
            sourceTokens: st.word_raw
              ? [{ token_ordinal: st.token_ordinal, word_raw: st.word_raw, strongs: st.strongs }]
              : undefined,
            coreStrongs: null,
          };
          const els = [];
          if (i > 0) {
            els.push(
              <span key={`d${i}`} className="maqaf-divider" aria-hidden="true"
                style={{ alignSelf: 'flex-start', color: 'var(--text4)', userSelect: 'none',
                         pointerEvents: 'none', fontSize: 'var(--paleo-size)', lineHeight: 1,
                         padding: '4px 1px 0' }}>{maqafSplit.dividers[i - 1] || '-'}</span>
            );
          }
          els.push(
            <WordBlock
              key={`h${i}`}
              wordObj={half}
              className="maqaf-half"
              showSub={showSub}
              showCopyBtn={showCopyBtn}
              showStrongs={showStrongs}
              onComponentClick={onComponentClick}
              highlightSearch={highlightSearch}
            />
          );
          return els;
        })}
        {showStrongs && wordObj.coreStrongs && (
          _isVirtualSN(wordObj.coreStrongs) ? (
            <span
              className="sn-link root core-root sn-virtual"
              title="Grammar/virtual code — no root entry"
              style={{ alignSelf: 'flex-start', marginTop: '4px', opacity: 0.6, cursor: 'default' }}
            >{_fmtSN(wordObj.coreStrongs)}</span>
          ) : (
            <a
              className="sn-link root core-root"
              href={`/roots?sn=${_fmtSN(wordObj.coreStrongs)}`}
              title={`Two-word (compound) root ${_fmtSN(wordObj.coreStrongs)}`}
              style={{ alignSelf: 'flex-start', marginTop: '4px', opacity: 0.85 }}
            >{_fmtSN(wordObj.coreStrongs)}</a>
          )
        )}
      </div>
    );
  }

  return (
    <>
    <div
      className={`word-block ${className} ${hasSearchMatch ? 'search-match' : ''}`}
      data-ordinal={wordObj.token_ordinal}
      data-verse={wordObj.verse}
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
    >
      <div className="paleo">
        <span className="search-text">{parts.purePaleo}</span>
        <span
          className="visible-text"
          onClick={onWrapClick}
          dangerouslySetInnerHTML={{ __html: glyphHtml }}
        />
        {showCopyBtn && wordObj.components?.length > 1 && (
          <button
            className="copy-word-btn"
            title="Copy full word"
            onClick={ev => {
              try {
                navigator.clipboard.writeText(parts.purePaleo);
                ev.currentTarget.classList.add('copied');
                ev.currentTarget.textContent = '✓';
                setTimeout(() => {
                  ev.currentTarget.classList.remove('copied');
                  ev.currentTarget.textContent = '⧉';
                }, 1500);
              } catch (e) { /* ignore */ }
            }}
          >⧉</button>
        )}
      </div>
      {showSub && (
        <div className="w">
          {/* Click to copy the PLAIN transliteration (no color/weight from
              the part-of-speech spans) — same clipboard mechanism and
              "Copied!" tooltip as the paleo glyphs' own copy button above,
              just for the word people actually want to paste into an
              English translation. Selecting this styled text by hand and
              pasting it into a rich-text field carries its computed
              formatting along (bold, per-part colors), landing as visibly
              mismatched text at the destination — this bypasses that
              entirely by writing a plain string straight to the clipboard. */}
          <span
            className="w-translit clickable-comp"
            title="Click to copy transliteration"
            onClick={ev => {
              const text = parts.transliterations.map(t => t.text).join('');
              if (!text) return;
              try {
                navigator.clipboard.writeText(text);
                ev.currentTarget.classList.add('copied');
                setTimeout(() => ev.currentTarget.classList.remove('copied'), 1500);
              } catch (e) { /* ignore */ }
            }}
            dangerouslySetInnerHTML={{ __html: translitHtml }}
          />
          {translationHtml && (
            <>
              {' '}
              <span dangerouslySetInnerHTML={{ __html: translationHtml }} />
            </>
          )}
        </div>
      )}
      {showBadge && (
        <div className="strongs-badge">
          {/* One group per maqaf-half: its own surf link (that half's surface) + its own
              root link. A joined chip (BaYawam-Apaw) shows both words standing alone; a
              normal word shows a single group. Each half's surf is the SEGMENT surface
              (prefix+root merged within the segment), so the surface index resolves it. */}
          {badgeGroups.map((g, i) => (
            <span key={i} className="surf-sn-group" style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
              {g.word_raw && (
                <a
                  className="surf-badge-link"
                  href={`/surfaces?${new URLSearchParams({ word: g.word_raw })}`}
                  title={`Browse surface ${g.word_raw}`}
                >surf</a>
              )}
              {g.strongs && (
                _isVirtualSN(g.strongs) ? (
                  <span
                    className="sn-link root sn-virtual"
                    title="Grammar/virtual code — no root entry"
                    style={{ opacity: 0.6, cursor: 'default' }}
                  >{g.strongs}</span>
                ) : (
                  <a
                    className="sn-link root"
                    href={`/roots?sn=${g.strongs}`}
                    title={`Explore root ${g.strongs}`}
                  >{g.strongs}</a>
                )
              )}
            </span>
          ))}
          {/* Compound name (Malakay-Tzadaq): after the two component-root halves, show the
              shared two-word CORE root (H4442) so the whole-name entry is reachable too. */}
          {wordObj.coreStrongs && (
            _isVirtualSN(wordObj.coreStrongs) ? (
              <span
                className="sn-link root core-root sn-virtual"
                title="Grammar/virtual code — no root entry"
                style={{ opacity: 0.6, cursor: 'default' }}
              >{_fmtSN(wordObj.coreStrongs)}</span>
            ) : (
              <a
                className="sn-link root core-root"
                href={`/roots?sn=${_fmtSN(wordObj.coreStrongs)}`}
                title={`Two-word (compound) root ${_fmtSN(wordObj.coreStrongs)}`}
                style={{ opacity: 0.85 }}
              >{_fmtSN(wordObj.coreStrongs)}</a>
            )
          )}
        </div>
      )}
    </div>
    {/* Trailing mark: a genuine sibling element outside this word's own
        column, not one more glyph inside .paleo's flex row. Two reasons this
        matters: a trailing maqaf joins THIS word to a SEPARATE next
        WordBlock, so it belongs visually BETWEEN the two (same treatment as
        the fused compound chip's own internal divider, WordBlock.css
        .maqaf-divider-standalone) — and ANY trailing mark left inline
        unbalances .paleo's content width against the (mark-free) gloss row
        below it, dragging the real letters off-center from their own gloss
        (confirmed on Genesis 1:9's Kan + its trailing sof-pasuq). Rendering
        it here, as a second top-level element from this same component,
        means every page that lists WordBlocks in a row (HebrewViewer,
        Reader, MultiViewer) gets it for free — nothing to wire up per page,
        and the mark can never silently vanish on one of them the way
        splitting this into a parent-level concern would risk. */}
    {parts.trailingMark && (
      <span
        className={parts.trailingMark.isMaqaf ? 'maqaf-divider-standalone' : 'trailing-mark-standalone'}
        aria-hidden="true"
      >{parts.trailingMark.paleo}</span>
    )}
    </>
  );
}

/**
 * WordRow — one <tr> per word for VersePage's word-by-word breakdown table:
 * full-word glyphs | bare root glyph | gloss | prefix/suffix breakdown |
 * Strong's # badge, plus whatever trailing <td>s the caller passes as
 * `children` (VersePage supplies the "first root occurrence" / "first
 * surface occurrence" cells there, since those need react-router <Link>s and
 * API data this component has no business owning).
 *
 * "individual verses ... the shape of the hebrew out looks wonky, lets have
 * the word by word each in its own row" — WordBlock's own layout is a
 * wrapping card grid, built for a whole chapter's worth of words; for a
 * single verse's handful of words that wraps unevenly and is hard to scan.
 * This is a plain table row instead: one word per line, top to bottom.
 * Reuses computeWordParts (same as WordBlock above) so a row can never show
 * different data than WordBlock itself would for the same word — and reuses
 * compDescsToHtml for the full-word glyph cell so the glyphs render
 * identically too.
 */
export function WordRow({ wordObj, children }) {
  const parts = useMemo(() => computeWordParts(wordObj), [wordObj]);
  const wordGlyphHtml = useMemo(() => compDescsToHtml(parts.compDescs), [parts]);
  // The bare root's own glyph(s) — undecorated (no lemma-arrow prefix),
  // paired with its gloss in the Definition cell. A two-word compound (rare)
  // yields more than one rootTrans entry; concatenate rather than pick one.
  const rootGlyphHtml = useMemo(
    () => parts.rootTrans
      .map(r => (hasPaleo(r.paleo) ? paleoToSVG(r.paleo) : escapeHtml(r.paleo || '')))
      .join(''),
    [parts]
  );
  const definition = parts.rootTrans.map(r => r.clean).filter(Boolean).join('; ');
  // "lets include modifications in the transliteration, basically what I have
  // in the transliterated version, YaDabar with colors" — the FULL word's
  // transliteration (every component: prefixes, root, suffixes), not just
  // the root's, colored per-component the same way HebrewViewer's own
  // .w-translit line is (see transliterationsToHtml above).
  const hasTranslit = parts.transliterations.some(t => t.text);
  // "we don't need to capitalize suffixes, but LaKam I want is a special
  // circumstance, these words are a prefix and suffix with no root, I want
  // to treat them both as roots... YaIbaraW should not be YaIbaraw" — force
  // capitalization ONLY when the word has no root component at all (Lakam:
  // mod-prep + prs-2mp, nothing else). A word with a real root (Ibar, Dawar,
  // …) already gets correct casing straight from the data — prefixes and
  // roots come pre-capitalized, bound suffixes come lowercase — so it's left
  // alone here.
  const translitHtml = useMemo(
    () => transliterationsToHtml(parts.transliterations, { capitalizeEach: !parts.hasRootComp }),
    [parts]
  );
  const sn = fmtSN(wordObj.strongs);

  // data-label on every <td>: read by VersePage.css's narrow-viewport media
  // query, which turns this <tr> into a stacked label/value card instead of
  // a table row ("make it look good for mobile, make any necessary
  // changes") — content: attr(data-label) supplies the label text without
  // duplicating it as visible DOM text on wide viewports.
  return (
    <tr className="word-row" data-ordinal={wordObj.token_ordinal} data-verse={wordObj.verse}>
      <td className="wr-cell wr-word" data-label="Word">
        <span className="wr-glyphs" dangerouslySetInnerHTML={{ __html: wordGlyphHtml }} />
      </td>
      <td className="wr-cell wr-lex" data-label="Root">
        <span className="wr-glyphs wr-glyphs-sm root" dangerouslySetInnerHTML={{ __html: rootGlyphHtml }} />
      </td>
      <td className="wr-cell wr-translit" data-label="Transliteration">
        {hasTranslit
          ? <span className="wr-translit-inner" dangerouslySetInnerHTML={{ __html: translitHtml }} />
          : '—'}
      </td>
      <td className="wr-cell wr-def" data-label="Definition">{definition || '—'}</td>
      <td className="wr-cell wr-mods" data-label="Modifications">
        {/* "modifications should be associated, I want to know 𐤋 is
            associated with 'for'" — wr-mod now carries the component's own
            css class (mod-prep, prs-2mp, …) with NO flat color override, so
            var(--mc) (set by that class, same morphColors.css mechanism as
            the Transliteration column above) colors glyph + gloss together —
            the same color that syllable gets in Transliteration. */}
        {parts.modTrans.length ? parts.modTrans.map((m, i) => (
          <span key={i} className={`wr-mod ${m.css}`}>
            <span
              className="wr-mod-glyph"
              dangerouslySetInnerHTML={{ __html: hasPaleo(m.paleo) ? paleoToSVG(m.paleo) : escapeHtml(m.paleo || '') }}
            />
            <span className="wr-mod-gloss">{m.clean}</span>
          </span>
        )) : <span className="wr-mod-none">—</span>}
      </td>
      <td className="wr-cell wr-sn" data-label="Strong's #">
        {sn && (
          isVirtualSN(wordObj.strongs) ? (
            <span className="sn-link root sn-virtual" title="Grammar/virtual code — no root entry" style={{ opacity: 0.6, cursor: 'default' }}>{sn}</span>
          ) : (
            <a className="sn-link root" href={`/roots?sn=${sn}`} title={`Explore root ${sn}`}>{sn}</a>
          )
        )}
      </td>
      {children}
    </tr>
  );
}
