import { useState, useEffect, useRef, useCallback, useMemo, Component } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { paleoToSVG } from '../lib/paleoGlyphs.js';
import { sqToPaleo } from '../lib/sqToPaleo.js';
import { buildBookSlugs, resolveBookParam, bookToParam } from '../lib/bookSlug.js';
import { usePageTitle, formatRef } from '../hooks/usePageTitle.js';
import './Parallel.css';
import { isPlaceholderGloss, hasTrailingMaqaf } from '../components/WordBlock.jsx';
import { getAdminStatus, getLocalVersesForChapter, mergeChapterVersesWithLocal } from '../lib/localOverlay.js';

// A component whose text carries no Paleo-Hebrew letter (U+10900–U+1091F) has no
// glyph in the Paleo script — it's punctuation or a literal mark (sof-pasuq ׃,
// maqaf ־, the : stops). We render the mark itself as text, exactly like the
// Ge'ez reader renders ፡ / ። inline, instead of dropping it to a blank block.
const PALEO_LETTER_RE = /[\u{10900}-\u{1091F}]/u;
const hasPaleo = (s) => PALEO_LETTER_RE.test(s || '');

// The "… Viewer →" button opens the reader for whichever source is selected
// here, so its label names that reader. Greek folds LXX/GNT/GRC together.
const READER_NAME = {
  BHS: 'Hebrew', HEB: 'Hebrew', GEZ: "Ge'ez", SYR: 'Syriac',
  LXX: 'Greek', GRC: 'Greek', GNT: 'Greek',
  LAT: 'Latin', ENG: 'English',
};

const BOOK_NAMES = {
  1:'Genesis',2:'Exodus',3:'Leviticus',4:'Numbers',5:'Deuteronomy',6:'Joshua',7:'Judges',8:'Ruth',
  9:'1 Samuel',10:'2 Samuel',11:'1 Kings',12:'2 Kings',13:'1 Chronicles',14:'2 Chronicles',15:'Ezra',
  16:'Nehemiah',17:'Esther',18:'Job',19:'Psalms',20:'Proverbs',21:'Ecclesiastes',22:'Song of Songs',
  23:'Isaiah',24:'Jeremiah',25:'Lamentations',26:'Ezekiel',27:'Daniel',28:'Hosea',29:'Joel',30:'Amos',
  31:'Obadiah',32:'Jonah',33:'Micah',34:'Nahum',35:'Habakkuk',36:'Zephaniah',37:'Haggai',38:'Zechariah',
  39:'Malachi',40:'Matthew',41:'Mark',42:'Luke',43:'John',44:'Acts',45:'Romans',46:'1 Corinthians',
  47:'2 Corinthians',48:'Galatians',49:'Ephesians',50:'Philippians',51:'Colossians',52:'1 Thessalonians',
  53:'2 Thessalonians',54:'1 Timothy',55:'2 Timothy',56:'Titus',57:'Philemon',58:'Hebrews',59:'James',
  60:'1 Peter',61:'2 Peter',62:'1 John',63:'2 John',64:'3 John',65:'Jude',66:'Revelation',
};
const bookLabel = (id) => `${id}. ${BOOK_NAMES[id] || `Book ${id}`}`;

// Guards the verse output: if a verse/word throws while rendering (bad token
// shape for an unusual book), it does NOT blank the app. It calls onError so the
// reader can drop to a language that renders, and shows a message only if every
// language has been exhausted. Resets when the key (book/chapter/lang) changes.
class VerseErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch() { if (this.props.onError) this.props.onError(); }
  render() {
    if (this.state.err) return <div className="no-translation">{this.props.fallbackMsg || 'This chapter isn’t available in any source yet.'}</div>;
    return this.props.children;
  }
}

// Paleo conversion must never throw — a single odd character in an unusual book
// should degrade to raw text, not take down the chapter. These wrap the two
// library calls so rendering is total.
const safeSq = (s) => { try { return sqToPaleo(s) || ''; } catch { return s || ''; } };
const safeSVG = (p) => { try { return paleoToSVG(p) || ''; } catch { return ''; } };

const RTL_SCRIPTS = new Set(['paleo-hebrew', 'hebrew', 'syriac']);
const dirForScript = (s) => (RTL_SCRIPTS.has(s) ? 'rtl' : 'ltr');

// Language hierarchy — when the chosen language has no text for a book, fall
// back down this list (Hebrew first). BHS = the glossed Paleo OT; HEB = the
// wider Hebrew source (NT, deuterocanon, works) that BHS/tokens_bhs doesn't hold.
const LANG_PRIORITY = ['BHS', 'HEB', 'GEZ', 'SYR', 'LXX', 'GNT', 'GRC', 'LAT'];

const parseJ = (v, fb) => Array.isArray(v) ? v : (() => { try { return JSON.parse(v); } catch { return fb; } })();

// ── Gloss display mode (shared with the Reader) ──────────────────────────────
// The baseline English carries "translit (gloss)" pairs — "Rawach (spirit / wind)".
// Same three modes the Reader offers, and the SAME localStorage key, so the choice
// carries across the two views. Change GLOSS_KEY to 'par-gloss-mode' to decouple.
const GLOSS_MODES = [
  { id: 'both',   label: 'Both',         note: 'yawam (days)' },
  { id: 'hebrew', label: 'Hebrew only',  note: 'yawam' },
  { id: 'gloss',  label: 'English only', note: 'days' },
];
const GLOSS_DEFAULT = 'both';
const GLOSS_KEY = 'reader-gloss-mode';

// CRITICAL DIFFERENCE FROM THE READER. The Reader applies the gloss transform to a
// whole verse string. Parallel CANNOT: it renders one <span> per word and highlights
// alignment via `english_indices`, which are positions in the ORIGINAL word list.
// Rewriting the text would shift every index and silently break the Hebrew<->English
// highlighting — the feature this page exists for.
//
// So this returns one entry per ORIGINAL word, keeping its index, and only marks
// entries hidden or rewrites their display text. Indices never move.
// A parenthetical may span several whitespace-separated tokens ("(spirit / wind)"),
// so the closing token is scanned for rather than assumed to be the next one.
const GLOSS_TRAIL = /[.,;:!?'"\u2019\u201d)]+$/;
function glossTokens(words, mode) {
  const out = words.map((w, idx) => ({ idx, text: w, hide: false }));
  if (mode === 'both') return out;
  for (let i = 1; i < out.length; i++) {
    if (!out[i].text.startsWith('(')) continue;
    let j = i;
    while (j < out.length && !out[j].text.includes(')')) j++;
    if (j >= out.length) break;                       // unclosed — leave it alone
    const head = out[i - 1];
    const headBare = head.text.replace(GLOSS_TRAIL, '');
    // The preceding token must end in a letter. KNOWN LIMITATION, shared with the
    // Reader's GLOSS_RE: any "word (parenthetical)" is treated as a gloss, so an
    // editorial aside such as "note (see below)" is folded too. Kept identical to
    // the Reader deliberately — the two views must not disagree about what a gloss
    // is. Fix it in one place if it ever matters, not here alone.
    if (head.hide || !/[A-Za-z\u00C0-\u024F]$/.test(headBare)) { i = j; continue; }
    const joined = out.slice(i, j + 1).map(t => t.text).join(' ');
    const inner  = joined.replace(/^\(/, '').replace(/\)[^)]*$/, '').trim();
    const tail   = (joined.match(/\)([.,;:!?'"\u2019\u201d]*)$/) || ['', ''])[1];
    if (mode === 'gloss' && inner) {
      const headTrail = (head.text.match(/[.,;:!?'"\u2019\u201d]+$/) || [''])[0];
      head.text = inner + (headTrail || tail);
    } else if (tail) {
      head.text = head.text + tail;                   // keep sentence punctuation
    }
    for (let k = i; k <= j; k++) out[k].hide = true;
    i = j;
  }
  return out;
}

// Keep the most-recent link per unique token-set that carries english_indices.
function dedupeLinks(links) {
  const byTok = {};
  links.forEach(l => {
    const key = JSON.stringify(parseJ(l.token_ordinals, []));
    const ei  = parseJ(l.english_indices, []);
    (byTok[key] || (byTok[key] = [])).push({ ...l, _ei: ei });
  });
  const out = [];
  for (const entries of Object.values(byTok)) {
    const withIdx = entries.filter(e => e._ei.length > 0);
    const pool = withIdx.length ? withIdx : entries;
    out.push(pool.reduce((best, e) => (e.id > best.id ? e : best)));
  }
  return out;
}

function findPhraseIndices(phrase, words) {
  const ph = phrase.trim().split(/\s+/);
  const clean = w => w.replace(/[,.!?;:]+$/, '').toLowerCase();
  for (let i = 0; i <= words.length - ph.length; i++) {
    if (words.slice(i, i + ph.length).map(clean).join(' ') === ph.map(clean).join(' '))
      return Array.from({ length: ph.length }, (_, k) => i + k);
  }
  return [];
}

// Click-to-copy — same mechanism as HebrewViewer's WordBlock / MultiWordBlock:
// copy the Paleo glyphs (or the source-language word) and flash the shared
// `.copied` → `::after "Copied!"` tooltip. No new copy UI is introduced here.
function copyOnClick(el, text) {
  if (!el || !text) return;
  try {
    navigator.clipboard.writeText(text);
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1500);
  } catch { /* ignore */ }
}

// H0430 / 430 / h430 all become H430, so a chip's href matches the root
// explorer's keys however the value was stored.
const fmtSN = sn => (sn ? 'H' + String(sn).replace(/^[Hh]+/, '') : '');
// H9000+ are virtual/grammar codes (connectors, prepositions, articles) —
// the root-index builder deliberately skips them, so /roots?sn=H9xxx always
// 404s. Same check as WordBlock.jsx; keep the badge but drop the link.
const isVirtualSN = sn => {
  const n = parseInt(String(sn).replace(/^[Hh]/, ''), 10);
  return !isNaN(n) && n >= 9000;
};

// ─── A single source word block ──────────────────────────────────────────────
// `rich` = this language has a Strong's-tagged token stream, so it renders
// glossed Paleo components (per-component colour + highlight). It used to be
// `isBHS`, a language-name test, which sent HEB — which HAS that token stream —
// down the plain surface+gloss path, so the same Hebrew read fully decomposed in
// one pane and as bare glyphs in the other. Ask the capability, not the name.
function WordBlock({ word, showSub, rich, isPaleoScript, dir, hoveredOrds, onHoverLink, blockLinks }) {
  const linked = blockLinks.length > 0;
  const enter = () => linked && onHoverLink(blockLinks);
  const leave = () => linked && onHoverLink(null);

  if (!rich) {
    const gloss = (word.gloss || '').replace(/[[\]]/g, '');
    const hl = hoveredOrds.has(word.token_ordinal);
    const surface = word.word || '';
    // Hebrew-script sources (extra-Hebrew) render as paleo glyphs — same as BHS —
    // by converting the stored square Hebrew to paleo, so no font/extension is
    // needed. Non-Hebrew RTL scripts (Syriac, etc.) keep their own script.
    const paleo = isPaleoScript ? safeSq(surface) : '';
    const svg = isPaleoScript && paleo ? safeSVG(paleo) : '';
    return (
      <div className={`word-block src-block ${linked ? 'lnk' : ''}`} dir={dir}
           onMouseEnter={enter} onMouseLeave={leave}>
        <div className="paleo src-word" dir={dir}>
          {svg
            ? <span className={`visible-text clickable-comp ${hl ? 'hl' : ''}`}
                    data-paleo={paleo} title={`Copy ${paleo}`}
                    onClick={(e) => { e.stopPropagation(); copyOnClick(e.currentTarget, paleo); }}
                    dangerouslySetInnerHTML={{ __html: svg }} />
            : <span className={`visible-text clickable-comp ${hl ? 'hl' : ''}`}
                    title={surface ? `Copy "${surface}"` : ''}
                    onClick={(e) => { e.stopPropagation(); copyOnClick(e.currentTarget, (isPaleoScript ? paleo : surface) || ''); }}>
                {(isPaleoScript ? paleo : surface) || '·'}
              </span>}
        </div>
        {showSub && gloss ? <div className="w"><span className="root">{gloss}</span></div> : null}
      </div>
    );
  }

  const comps = word.components?.length
    ? word.components
    : [{ paleo: word.word_raw || '', css: 'root', token_ordinal: word.token_ordinal }];

  // A maqaf baked WITHIN this single word's own components (a two-part
  // construct chain sharing one token, e.g. Genesis 1:11's עַל־הָאָרֶץ, "Il" +
  // maqaf + "HaAratz") is NOT the same bug as a maqaf trailing off to a
  // wholly separate next word (that case is handled by the standalone
  // divider VerseRow inserts between word-blocks, below). Left alone here,
  // computeParts-equivalent logic just flattens BOTH halves into one
  // unbroken transliteration ("IlHaAratz") with nothing to show a maqaf ever
  // existed between them. Mirrors components/WordBlock.jsx's own
  // maqafSplit: split on every isMaqaf component, and only treat it as a
  // genuine compound when EVERY resulting half has real (non-mark) content —
  // a maqaf with nothing on one side is an ordinary trailing mark and falls
  // through to the normal (non-split) render below.
  let maqafHalves = null;
  if (comps.some(c => c.isMaqaf)) {
    const segs = [[]];
    for (const c of comps) {
      if (c.isMaqaf) { segs.push([]); continue; }
      segs[segs.length - 1].push(c);
    }
    if (!segs.some(s => s.length === 0)) maqafHalves = segs;
  }
  if (maqafHalves) {
    return (
      <div className={`word-block maqaf-chip ${linked ? 'lnk' : ''}`} onMouseEnter={enter} onMouseLeave={leave}
           style={{ flexDirection: 'row', alignItems: 'flex-start', gap: '2px' }}>
        {maqafHalves.flatMap((seg, hi) => {
          const els = [];
          if (hi > 0) {
            els.push(<span key={`d${hi}`} className="par-maqaf-divider" aria-hidden="true">-</span>);
          }
          // Recurse — each half is rendered by this SAME function, reusing
          // every existing glyph/translit/gloss code path unchanged instead
          // of a second copy of it. blockLinks/onHoverLink are intentionally
          // empty here: the OUTER chip div (above) already fires the
          // English<->Hebrew hover-link for the combined word; per-glyph
          // highlight (hoveredOrds) still works inside the recursive call
          // regardless, since that reads token_ordinal directly off comps.
          els.push(
            <WordBlock key={`h${hi}`}
                       word={{ token_ordinal: seg[0]?.token_ordinal ?? word.token_ordinal, components: seg }}
                       showSub={showSub} rich={rich} isPaleoScript={isPaleoScript} dir={dir}
                       hoveredOrds={hoveredOrds} onHoverLink={() => {}} blockLinks={[]} />
          );
          return els;
        })}
        {/* One badge for the WHOLE compound (not one per half) — the fetched
            word already carries word_raw/strongs for the combined form, and
            splitting that accurately per half would need per-token surf/SN
            data this page doesn't fetch. Matches components/WordBlock.jsx's
            own coreStrongs badge, which is likewise shown once at the end. */}
        {showSub && (word.word_raw || word.strongs) && (
          <div className="strongs-badge" style={{ alignSelf: 'flex-start', marginTop: '4px' }}>
            <span className="surf-sn-group" style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
              {word.word_raw && (
                <a className="surf-badge-link"
                   href={`/surfaces?${new URLSearchParams({ word: word.word_raw })}`}
                   title={`Browse surface ${word.word_raw}`}
                   onClick={(e) => e.stopPropagation()}>surf</a>
              )}
              {word.strongs && (
                isVirtualSN(word.strongs) ? (
                  <span className="sn-link root sn-virtual"
                        title="Grammar/virtual code — no root entry"
                        style={{ opacity: 0.6, cursor: 'default' }}
                        onClick={(e) => e.stopPropagation()}>{fmtSN(word.strongs)}</span>
                ) : (
                  <a className="sn-link root"
                     href={`/roots?sn=${fmtSN(word.strongs)}`}
                     title={`Explore root ${fmtSN(word.strongs)}`}
                     onClick={(e) => e.stopPropagation()}>{fmtSN(word.strongs)}</a>
                )
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Sub-line glosses: root gloss + bracketed modifier glosses (mirrors reference).
  let rootTrans = null; const mods = [];
  if (showSub) {
    // A block with no root-class component is headed by its proper noun — same
    // rule as components/WordBlock.jsx, so a name reads (𐤉𐤔𐤅𐤏) here too.
    const hasRootComp = comps.some(c => c && c.css === 'root');
    comps.forEach((c, i) => {
      // Mark tokens (maqaf ־, sof-pasuq ׃, paseq …) carry no real gloss — the
      // server sets their `translation` field to the mark character itself,
      // which otherwise slips through as a bogus extra modifier chip (e.g.
      // "[and-He/It-־]"). Mirrors components/WordBlock.jsx's isMark skip;
      // this page duplicates that logic instead of reusing WordBlock.
      if (c.isMark) return;
      const clean = (c.translation || '').replace(/[[\]]/g, '');
      // isPlaceholderGloss is IMPORTED, not re-implemented: the redundancy rule
      // (gloss === transliteration) must never hide the paleo placeholder that
      // marks a word still needing a lexicon entry.
      const suppress =
        (!clean || clean.toLowerCase() === (c.translit || '').toLowerCase()) &&
        !isPlaceholderGloss(c, clean);
      if (suppress) return;
      if (c.css === 'root' || (!hasRootComp && c.css === 'mod-nmpr')) rootTrans = clean;
      else mods.push(<span key={i} className={c.css}>{clean}</span>);
    });
  }
  const modRun = mods.reduce((acc, m, i) => i ? [...acc, <span key={`b${i}`} className="brk">-</span>, m] : [m], []);

  return (
    <div className={`word-block ${linked ? 'lnk' : ''}`} onMouseEnter={enter} onMouseLeave={leave}>
      <div className="paleo">
        <span className="visible-text"
              onClick={(e) => { const el = e.target.closest && e.target.closest('.clickable-comp'); if (el) copyOnClick(el, el.getAttribute('data-paleo') || ''); }}>
          {comps.map((c, i) => {
            const ord = c.token_ordinal != null ? c.token_ordinal : word.token_ordinal;
            const hl = hoveredOrds.has(ord);
            // A trailing maqaf (־) never draws inline in this word's own glyph
            // row — it gets a real standalone divider between this
            // word-block and the next instead (see VerseRow below). Other
            // marks (sof-pasuq ׃, paseq …) keep their previous inline
            // treatment below — only the maqaf's placement was the reported
            // bug. Previously a maqaf rendered inline here, flush against
            // THIS word's own edge — which is what actually made it read as
            // glued to one word instead of sitting between both.
            if (c.isMark && c.isMaqaf) return null;
            // Punctuation / non-Paleo marks (sof-pasuq ׃, maqaf ־, the : stops)
            // carry no Paleo glyph — render the mark itself as text, the way the
            // Ge'ez reader shows ፡ / ። inline, instead of a blank block.
            if (!hasPaleo(c.paleo)) {
              const mark = c.paleo || word.word_raw || '';
              return (
                <span key={i} className={`${c.css} clickable-comp paleo-punct ${hl ? 'hl' : ''}`}
                      data-paleo={mark}
                      title={`Copy ${mark}`}
                      style={{ fontSize: '0.5em', opacity: 0.75, padding: '0 0.12em', alignSelf: 'center' }}>
                  {mark}
                </span>
              );
            }
            return (
              <span key={i} className={`${c.css} clickable-comp ${hl ? 'hl' : ''}`}
                    data-paleo={c.paleo}
                    title={c.translit ? `Copy ${c.paleo} (${c.translit})` : `Copy ${c.paleo}`}
                    dangerouslySetInnerHTML={{ __html: safeSVG(c.paleo) }} />
            );
          })}
        </span>
      </div>
      {showSub ? (
        <div className="w">
          <span className="w-translit">
            {/* Mark tokens (maqaf ־, sof-pasuq ׃, paseq …) never get their own
                translit span here — a maqaf specifically is rendered as its
                own SIBLING between this word-block and the next one (see
                VerseRow below), not embedded inside this block's own
                (centered, width-capped) translit line. Embedding it here
                first put the dash flush against THIS word's own right edge,
                with the real gap to the next word-block landing entirely
                AFTER it — reading as glued to one word instead of sitting
                between both, exactly the "at the end of one" bug reported
                against this page. */}
            {comps.map((c, i) => c.isMark ? null : <span key={i} className={c.css}>{c.translit}</span>)}
          </span>
          {(rootTrans || mods.length) ? (
            <>{' '}<span className="brk">(</span>
              {rootTrans ? <span className="root">{rootTrans}</span> : null}
              {mods.length ? (
                <>{rootTrans ? ' ' : null}<span className="brk">[</span>{modRun}<span className="brk">]</span></>
              ) : null}
              <span className="brk">)</span>
            </>
          ) : null}
          {/* Same chips as the main reader, same destinations: surf -> the
              surface explorer for this exact form, H#### -> the root explorer.
              Without them a word here was a dead end, while the identical word
              in the reader was a link into the corpus-wide index. */}
          {(word.word_raw || word.strongs) && (
            // Breathing room between the gloss line and the chips. Inline rather
            // than in CSS because `.strongs-badge` is styled globally and shared
            // with the main reader — this keeps the change to this page.
            <div className="strongs-badge" style={{ marginTop: '7px' }}>
              <span className="surf-sn-group" style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
                {word.word_raw && (
                  <a className="surf-badge-link"
                     href={`/surfaces?${new URLSearchParams({ word: word.word_raw })}`}
                     title={`Browse surface ${word.word_raw}`}
                     onClick={(e) => e.stopPropagation()}>surf</a>
                )}
                {word.strongs && (
                  isVirtualSN(word.strongs) ? (
                    <span className="sn-link root sn-virtual"
                          title="Grammar/virtual code — no root entry"
                          style={{ opacity: 0.6, cursor: 'default' }}
                          onClick={(e) => e.stopPropagation()}>{fmtSN(word.strongs)}</span>
                  ) : (
                    <a className="sn-link root"
                       href={`/roots?sn=${fmtSN(word.strongs)}`}
                       title={`Explore root ${fmtSN(word.strongs)}`}
                       onClick={(e) => e.stopPropagation()}>{fmtSN(word.strongs)}</a>
                  )
                )}
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── One verse: English | source ─────────────────────────────────────────────
function VerseRow({ v, words, tx, showSub, rich, isPaleoScript, dir, isActive, onRefClick, hovered, setHovered, unaligned, glossMode }) {
  // Verse 0 is a chapter title/superscription, not a real verse (see Reader.jsx's
  // matching treatment) — its English is typically one short line while its source
  // column is a handful of tall, stacked word-blocks (glyph + translit + gloss +
  // Strong's). With the grid's normal `align-items: start`, that short single line
  // sits pinned to the TOP of a row whose height is dictated by the taller source
  // column, so it visually reads as lined up with whatever comes AFTER it (the
  // start of verse 1) rather than with its own source words. Centering just this
  // row's columns keeps the title vertically matched to its own Hebrew, regardless
  // of which side is taller.
  const isTitle = v === 0;
  const links = tx?.links || [];
  const hoveredOrds = useMemo(() => {
    const s = new Set();
    if (hovered?.verse === v) hovered.links.forEach(l => (l.token_ordinals || []).forEach(o => s.add(o)));
    return s;
  }, [hovered, v]);
  const enIsHl = (idx) => hovered?.verse === v && hovered.links.some(l => (l.english_indices || []).includes(idx));
  const onHoverLink = useCallback((ls) => setHovered(ls ? { verse: v, links: ls } : null), [setHovered, v]);

  const enWords = (tx?.text || '').trim().split(/\s+/).filter(Boolean);
  // display list keeps each word's ORIGINAL index so english_indices still resolve
  const enTokens = useMemo(() => glossTokens(enWords, glossMode), [tx?.text, glossMode]);

  return (
    <div className={`par-verse ${isTitle ? 'par-verse-title' : ''}`} data-verse={v}>
      <div className={`par-verse-ref ${isActive ? 'active-v' : ''}`} title={`View verse ${v}`}
           onClick={() => onRefClick(v)}>{v}</div>
      <div className="par-cols">
        <div className="par-col-en">
          {tx?.text?.trim() ? (
            <div className="en-verse-text">
              {enTokens.map(({ idx, text, hide }) => {
                if (hide) return null;
                const link = links.find(l => (l.english_indices || []).includes(idx));
                return (
                  <span key={idx} className={`en-w ${link ? 'lnk' : ''} ${enIsHl(idx) ? 'hl' : ''}`}
                        onMouseEnter={() => link && setHovered({ verse: v, links: [link] })}
                        onMouseLeave={() => link && setHovered(null)}>
                    {text}{' '}
                  </span>
                );
              })}
            </div>
          ) : <div className="no-translation">—</div>}
        </div>
        <div className="par-col-sep" />
        <div className="par-col-heb">
          <div className="heb-col-wrap" dir={dir} style={{ direction: dir }}>
            {unaligned && words.length === 0 ? (
              <div className="par-unaligned">Source text isn’t verse-aligned here — showing English only.</div>
            ) : words.flatMap((wordObj) => {
              const compOrds = wordObj.components?.length
                ? wordObj.components.map(c => c.token_ordinal != null ? c.token_ordinal : wordObj.token_ordinal)
                : [wordObj.token_ordinal];
              const blockLinks = links.filter(l => (l.token_ordinals || []).some(o => compOrds.includes(o)));
              const els = [
                <WordBlock key={wordObj.token_ordinal} word={wordObj} showSub={showSub} rich={rich}
                           isPaleoScript={isPaleoScript}
                           dir={dir} hoveredOrds={hoveredOrds} onHoverLink={onHoverLink} blockLinks={blockLinks} />
              ];
              // A trailing maqaf (־) couples this word to the NEXT one — a real
              // flex sibling BETWEEN the two word-blocks, not a glyph inside
              // either one's own (centered, width-capped) box. Rendering it as
              // its own flex item is what makes it land visibly in the gap
              // between blocks instead of glued to one side of it. Only for
              // `rich` (tokenised) sources — the plain (!rich) branch has no
              // `components` to carry a mark in the first place.
              if (rich && hasTrailingMaqaf(wordObj)) {
                els.push(
                  <span key={`${wordObj.token_ordinal}-mq`} className="par-maqaf-divider" aria-hidden="true">-</span>
                );
              }
              return els;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Parallel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, toggle: toggleTheme } = useTheme();

  const [books, setBooks] = useState([]);
  const bookMeta = useRef({});
  const bhsBooks = useRef(new Set());   // ids that actually have Hebrew (BHS) tokens
  // Capture the ORIGINAL ?book once. The URL-sync effect rewrites it to a slug,
  // so slug resolution must read this ref, not the live (rewritten) URL — that
  // race was what dropped a refresh back to Genesis.
  const initialBookRef = useRef(searchParams.get('book'));
  const bookIsSlug = !!initialBookRef.current && !/^\d+$/.test(initialBookRef.current);
  const [book, setBook] = useState(() => (/^\d+$/.test(initialBookRef.current || '') ? +initialBookRef.current : 1));
  const [bookResolved, setBookResolved] = useState(!bookIsSlug);   // slug URLs wait for the map
  const [chapter, setChapter] = useState(() => +searchParams.get('chapter') || 1);
  const [verse, setVerse] = useState(() => {
    const raw = searchParams.get('verse');
    return raw != null && raw !== '' ? +raw : null;
  }); // null = chapter mode
  const [lang, setLang] = useState(() => searchParams.get('lang') || 'BHS');
  const [tokensEmpty, setTokensEmpty] = useState(false);
  // What the loader ACTUALLY fetched — token stream or plain text. The renderer
  // must read this, never re-derive the answer: two independent computations of
  // the same fact will disagree, and when they do the rich renderer gets plain
  // data (no `components`, no `word_raw`) and draws an empty pane.
  const [wordsRich, setWordsRich] = useState(false);
  const [sources, setSources] = useState([{ id: 'BHS', label: 'Hebrew (BHS)', script: 'paleo-hebrew' }]);
  // Have the capability lookups (/api/books, /api/sources) SETTLED? Until they
  // have, langHasTokens() cannot answer — bhsBooks is an empty Set and `sources`
  // is the seed — and any chapter fetched meanwhile is fetched the wrong way.
  const [capsReady, setCapsReady] = useState(false);
  const loadSeq = useRef(0);          // guards against out-of-order chapter loads

  // Slug ↔ canon_id maps, built from the master book list (same input + slugify
  // as the Hebrew Viewer, so slugs match across readers). Numbers still resolve.
  const { slugToId, idToSlug } = useMemo(
    () => buildBookSlugs((books || []).map(b => {
      const id = b.book_id ?? b.id ?? b.canon_id;   // tolerate whichever id field the API returns
      return { id, name: b.name || BOOK_NAMES[id] };
    })),
    [books]
  );
  // Resolve a slug ?book=john to its canon_id once the book list loads. Reads the
  // captured ref (not the live URL, which the sync effect may have rewritten) and
  // flips bookResolved so the load/sync effects below can run against the real id.
  useEffect(() => {
    if (bookResolved) return;
    if (!Object.keys(slugToId).length) return;
    const id = slugToId[(initialBookRef.current || '').toLowerCase()];
    if (id != null) setBook(id);
    setBookResolved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookResolved, slugToId]);

  const [words, setWords] = useState([]);               // flat source words for the chapter
  const [translations, setTranslations] = useState({}); // verse -> { text, links }
  const [unaligned, setUnaligned] = useState(() => new Set()); // verses whose source blob was dropped
  const [status, setStatus] = useState('');
  const [hovered, setHovered] = useState(null);         // { verse, links: [...] }

  // Transliteration & gloss are NOT optional and never were. They are the whole
  // point of the parallel view, and /parallel must not diverge from the main
  // reader, which has no such switch. Kept as a const so every WordBlock below
  // still receives it and nothing else has to change.
  const showSub = true;
  const [perLine, setPerLine] = useState(() => localStorage.getItem('par-vpl') === '1');
  const [glossMode, setGlossMode] = useState(() => {
    try {
      const saved = localStorage.getItem(GLOSS_KEY);
      return GLOSS_MODES.some(m => m.id === saved) ? saved : GLOSS_DEFAULT;
    } catch { return GLOSS_DEFAULT; }
  });
  useEffect(() => {
    try { localStorage.setItem(GLOSS_KEY, glossMode); } catch { /* non-fatal */ }
  }, [glossMode]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const srcMeta = sources.find(s => s.id === lang) || { id: lang, label: lang, script: 'paleo-hebrew' };
  const dir = dirForScript(srcMeta.script);
  // Does THIS language carry a Strong's-tagged token stream for THIS book?
  // BHS: the /api/books set. Everything else: the source's own strongs_tokens +
  // token_books, straight from /api/sources — no hardcoded language list, so a
  // newly tagged edition starts rendering richly on its own.
  const langHasTokens = (l, b) => {
    if (!l || !b) return false;
    if (l === 'BHS') return bhsBooks.current.has(b);
    const meta = sources.find(o => o.id === l);
    if (!meta || !meta.strongs_tokens) return false;
    const range = meta.token_books;
    return !Array.isArray(range) || range.length !== 2 || (b >= range[0] && b <= range[1]);
  };
  // langHasTokens says the token stream SHOULD exist. tokensEmpty says the fetch
  // came back with nothing anyway — a book-id mismatch, a chapter the bake has
  // not reached, a 404. Never render an empty pane on the strength of a
  // capability flag: fall back to the text path, the same self-correcting shape
  // HebrewViewer uses when apiTokens returns empty.
  const rich = wordsRich;

  // Does a language actually carry this book? BHS = tokens_bhs set; everything
  // else = the sources list from /api/book-order.
  const langHasBook = useCallback((l, b) => {
    if (l === 'BHS') return bhsBooks.current.has(b);
    const m = bookMeta.current[b];
    return !!(m && m.sources && m.sources.includes(l));
  }, []);
  // Keep the chosen language if it has the book; otherwise walk the hierarchy
  // (Hebrew first) to the best available source that's offered in the dropdown.
  const bestLang = useCallback((b, desired) => {
    if (langHasBook(desired, b)) return desired;
    for (const l of LANG_PRIORITY) if (langHasBook(l, b) && (l === 'BHS' || sources.some(o => o.id === l))) return l;
    // Metadata couldn't confirm a source (book-order may omit per-book `sources`).
    // Never strand the user on BHS for a book it lacks — fall to the highest-
    // priority non-BHS source that's actually offered (HEB covers the whole
    // corpus), so navigating e.g. Genesis→John lands on Hebrew, not a blank.
    for (const l of LANG_PRIORITY) if (l !== 'BHS' && sources.some(o => o.id === l)) return l;
    const alt = sources.find(s => s.id !== 'BHS');
    return alt ? alt.id : desired;
  }, [langHasBook, sources]);

  // Self-heal: if the verse output throws in the current language, drop to the
  // next language that carries this book and hasn't already failed here — so the
  // reader ALWAYS lands on something rather than a dead error. Only when every
  // candidate has been tried does the boundary show its message.
  const triedLangs = useRef({});
  const onRenderError = useCallback(() => {
    const key = `${book}:${chapter}`;
    const tried = triedLangs.current[key] || (triedLangs.current[key] = new Set());
    tried.add(lang);
    const offered = (l) => l === 'BHS' || sources.some(o => o.id === l);
    const next = LANG_PRIORITY.find(l => !tried.has(l) && offered(l) && langHasBook(l, book))
              || LANG_PRIORITY.find(l => l !== 'BHS' && !tried.has(l) && offered(l));
    if (next && next !== lang) setLang(next);
  }, [book, chapter, lang, sources, langHasBook]);

  // If the current language can't render this book (e.g. BHS on an NT book or a
  // Hebrew-less work), hop to the highest-priority language that can. Depends on
  // `sources` too: the source catalog loads async, and until it's present
  // bestLang can't confirm a fallback is offered — so we must re-run when it lands.
  useEffect(() => {
    if (!bookResolved) return;
    if (books.length && !langHasBook(lang, book)) {
      const nl = bestLang(book, lang);
      if (nl !== lang) setLang(nl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, book, sources, bookResolved]);

  // Descriptive browser-tab title: "<Book> <ch>:<vs> — Parallel".
  usePageTitle(
    formatRef((books.find(b => b.book_id === book) || {}).name || BOOK_NAMES[book] || `Book ${book}`, chapter, verse),
    'Parallel'
  );

  // URL sync — held until the slug is resolved so it can't rewrite ?book=john to
  // a stale ?book=1 before resolution (the refresh-to-Genesis race).
  useEffect(() => {
    if (!bookResolved) return;
    const p = { book: bookToParam(book, idToSlug), chapter: String(chapter) };
    if (verse != null) p.verse = String(verse);
    if (lang && lang !== 'BHS') p.lang = lang;
    setSearchParams(p, { replace: true });
  }, [book, chapter, verse, lang, idToSlug, setSearchParams, bookResolved]);

  useEffect(() => { localStorage.setItem('par-vpl', perLine ? '1' : '0'); }, [perLine]);

  // Books + source catalog
  useEffect(() => {
    // Master cross-language list — every canonical/promoted book, ordered and
    // named exactly like the readers (book-order.json). Includes chapter spans.
    fetch('/api/book-order').then(r => r.json()).then(list => {
      const bs = (list || []).map(b => ({
        book_id: b.id, name: b.name, first_chapter: b.first || 1, last_chapter: b.last || 1, sources: b.sources || [],
      }));
      bs.forEach(b => { bookMeta.current[b.book_id] = { first: b.first_chapter, last: b.last_chapter, sources: b.sources }; });
      setBooks(bs);
    }).catch(() => {});
    // Which books actually carry Hebrew (BHS) tokens — so we only leave BHS
    // selected where it has text, and offer a source that does otherwise.
    // BOTH are prerequisites for knowing how to fetch a chapter, so they settle
    // together and flip one flag. Note bhsBooks is a REF: writing it triggers no
    // re-render, so an early load could never self-correct for BHS the way the
    // `sources` dependency does for the others. The flag covers both.
    const booksP = fetch('/api/books').then(r => r.json()).then(bs => {
      bhsBooks.current = new Set((bs || []).map(b => b.book_id));
    }).catch(() => {});
    const sourcesP = fetch('/api/sources').then(r => r.json()).then(ss => {
      // Carry the CAPABILITY flags through. Dropping them here is why HEB kept
      // rendering plain: langHasTokens() asks `sources` for strongs_tokens, and
      // this map was rebuilding each source with only id/label/script, so the
      // answer was always undefined -> false.
      const opts = [{ id: 'BHS', label: 'Hebrew (BHS)', script: 'paleo-hebrew' }]
        .concat((ss || []).filter(s => s.id !== 'BHS' && s.available && !s.worksOnly)
                          .map(s => ({ id: s.id, label: s.label || s.id, script: s.script,
                                       strongs_tokens: !!s.strongs_tokens,
                                       token_books: s.token_books || null })));
      setSources(opts);
    }).catch(() => {});
    // `finally`, not `then`: if a lookup fails we still have to render — with
    // whatever capability we could determine — rather than hang on a blank pane.
    Promise.all([booksP, sourcesP]).finally(() => setCapsReady(true));
  }, []);

  // Load a chapter (multi-language). Source tokens come from the same endpoints
  // the Studio links against, so ordinals align with stored links.
  //
  // Fast path: the source /chapter endpoint already returns every token per verse,
  // and /translate/chapter returns per-verse links (newer server), so a whole
  // chapter loads in TWO parallel requests instead of ~2 + one-per-verse×2. A
  // per-verse fallback keeps it working against a server that predates chapter
  // links.
  const loadChapter = useCallback(async (b, c, l) => {
    // Only the newest load may write state. Two can be in flight whenever the
    // book, chapter or language changes faster than a fetch returns, and the
    // responses need not come back in order — a slow earlier one landing last
    // would repaint the pane with the chapter you just navigated away from.
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;

    setStatus('Loading…'); setWords([]); setTranslations({}); setUnaligned(new Set()); setHovered(null);
    setTokensEmpty(false); setWordsRich(false);
    try {
      const [txDataRaw, chap] = await Promise.all([
        fetch(`/api/translate/chapter?book=${b}&chapter=${c}&lang=${encodeURIComponent(l)}`)
          .then(r => r.ok ? r.json() : { verses: [] }).catch(() => ({ verses: [] })),
        langHasTokens(l, b)
          // /api/tokens 404s (returns {error}) for a book a source lacks; coerce to
          // an array so a missing book renders empty instead of crashing the page.
          // `source` is what keeps the two Hebrew editions apart — without it the
          // OT would be served whichever edition the book range guessed.
          ? fetch(`/api/tokens?book=${b}&chapter=${c}&source=${encodeURIComponent(l)}`)
              .then(r => r.ok ? r.json() : []).catch(() => [])
          : fetch(`/api/source/${encodeURIComponent(l)}/chapter?book=${b}&chapter=${c}`)
              .then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      // Overlay a non-admin's local Translate Studio edits (src/lib/localOverlay.js)
      // on top of the published chapter — same fetch this page always made, this
      // page just no longer shows stale published text for a verse you edited
      // locally. Admins see exactly what's published, unchanged.
      let txData = txDataRaw;
      const { isAdmin } = await getAdminStatus();
      if (!isAdmin) {
        const localOverrides = await getLocalVersesForChapter(b, c).catch(() => []);
        txData = { ...txDataRaw, verses: mergeChapterVersesWithLocal(txDataRaw.verses, localOverrides) };
      }

      let src;
      let usedTokens = langHasTokens(l, b);
      let payload = chap;
      if (usedTokens) {
        const got = Array.isArray(chap) ? chap : (chap?.tokens || chap?.words || chap?.rows || []);
        if (!got.length) {
          // The capability said yes and the endpoint said nothing. Rather than
          // show a blank pane, re-fetch the text form and render that — and say
          // so in the console, because this means the two disagree about which
          // book id addresses this book.
          console.warn(`[parallel] /api/tokens?book=${b}&chapter=${c}&source=${l} returned no tokens; ` +
                       `falling back to /api/source/${l}/chapter`);
          setTokensEmpty(true);
          usedTokens = false;
          payload = await fetch(`/api/source/${encodeURIComponent(l)}/chapter?book=${b}&chapter=${c}`)
            .then(r => r.ok ? r.json() : null).catch(() => null);
        }
      }
      const chapData = payload;
      if (usedTokens) {
        src = Array.isArray(chapData) ? chapData : (chapData?.tokens || chapData?.words || chapData?.rows || []);
      } else {
        const verses = Array.isArray(chapData?.verses) ? chapData.verses : [];
        src = [];
        if (verses.some(v => Array.isArray(v.tokens))) {
          // Fast path: tokens are already in the chapter payload.
          verses.forEach(v =>
            (v.tokens || []).forEach((t, i) => src.push({
              verse: v.verse, token_ordinal: t.ord ?? (i + 1), word: t.word ?? '', gloss: t.gloss || '', _src: true,
            }))
          );
        } else {
          // Fallback for a server whose /chapter omits tokens: fetch per verse.
          const vList = verses.length ? verses.map(x => x.verse)
                      : Array.isArray(chapData?.rows) ? [...new Set(chapData.rows.map(x => x.verse))] : [];
          await Promise.all(vList.map(vn =>
            fetch(`/api/source/${encodeURIComponent(l)}/verse?book=${b}&chapter=${c}&verse=${vn}`)
              .then(r => r.ok ? r.json() : { tokens: [] }).catch(() => ({ tokens: [] }))
              .then(sv => (sv.tokens || []).forEach((t, i) => src.push({
                verse: vn, token_ordinal: t.ord ?? (i + 1), word: t.word ?? '', gloss: t.gloss || '', _src: true,
              })))
          ));
        }
        src.sort((a, z) => a.verse - z.verse || a.token_ordinal - z.token_ordinal);
      }

      const tmap = {};
      const translated = (txData.verses || []).filter(vs => vs.text?.trim());
      const buildLinks = (rawLinks, enWords) => dedupeLinks(rawLinks || []).map(lk => {
        const link = { ...lk, token_ordinals: parseJ(lk.token_ordinals, []), english_indices: parseJ(lk.english_indices, []) };
        if (!link.english_indices.length && link.english_phrase)
          link.english_indices = findPhraseIndices(link.english_phrase, enWords);
        return link;
      });

      if (translated.some(vs => Array.isArray(vs.links))) {
        // Newer server: links ride along on the chapter payload.
        translated.forEach(vs => {
          const enWords = (vs.text || '').trim().split(/\s+/).filter(Boolean);
          tmap[vs.verse] = { text: vs.text, links: buildLinks(vs.links, enWords) };
        });
      } else {
        // Fallback for a server without chapter links: fetch links per verse.
        await Promise.all(translated.map(vs =>
          fetch(`/api/translate/verse?book=${b}&chapter=${c}&verse=${vs.verse}&lang=${encodeURIComponent(l)}`)
            .then(r => r.ok ? r.json() : null).catch(() => null)
            .then(d => {
              const enWords = (vs.text || '').trim().split(/\s+/).filter(Boolean);
              tmap[vs.verse] = { text: vs.text, links: buildLinks(d?.links, enWords) };
            })
        ));
      }

      // ── Verse-alignment guard ──────────────────────────────────────────────
      // The English versification is the source of truth. Some sources store a
      // whole chapter's text under a single "verse" (e.g. Hebrew-extra for works
      // like Jasher), which would otherwise line a chapter's worth of paleo up
      // against one short English verse. If a verse's source-token count is far
      // out of proportion to its English word count, treat that verse's source as
      // un-aligned and drop it. Proportionate verses pass through untouched, so
      // normal Hebrew/Greek/Ge'ez/etc. render exactly as before.
      const dropped = new Set();
      if (l !== 'BHS' && src.length) {
        const enCount = {};
        for (const vs of (txData.verses || []))
          enCount[vs.verse] = (vs.text || '').trim().split(/\s+/).filter(Boolean).length;
        const srcCount = {};
        for (const w of src) srcCount[w.verse] = (srcCount[w.verse] || 0) + 1;
        for (const vn of Object.keys(srcCount)) {
          const ec = enCount[vn] || 0;
          // With an English verse to compare to, allow up to 5× its length (Hebrew
          // is usually ≤2×, so 5× only trips on a chapter-sized blob); with no
          // English, only trip on a large absolute block.
          const ceiling = ec > 0 ? Math.max(50, ec * 5) : 80;
          if (srcCount[vn] > ceiling) dropped.add(Number(vn));
        }
        if (dropped.size) src = src.filter(w => !dropped.has(w.verse));
      }

      if (stale()) return;
      setWords(src); setWordsRich(usedTokens);
      setTranslations(tmap); setUnaligned(dropped); setStatus('');
    } catch (e) { if (!stale()) setStatus('Error: ' + e.message); }
    // `sources` MUST be a dependency. With [] this callback captured the FIRST
    // render's sources — which is the hardcoded [{id:'BHS'}] seed, before
    // /api/sources has answered — so langHasTokens('HEB') was permanently false
    // in here and the loader always took the text path. The RENDERER, computing
    // the same thing from current state, said rich. Rich renderer + plain data =
    // the blank pane. Re-running when capability arrives is the point.
  }, [sources]);

  // Wait for capability before the FIRST fetch. Previously this fired
  // immediately, took the plain path because nothing was loaded yet, and only
  // corrected when `sources` arrived and re-ran it — so the first paint of a
  // freshly-mounted page showed the wrong thing (or nothing), and a manual
  // refresh "fixed" it only because the browser had /api/sources cached by then.
  // One load, once the answer is knowable.
  useEffect(() => {
    if (bookResolved && capsReady) loadChapter(book, chapter, lang);
  }, [book, chapter, lang, loadChapter, bookResolved, capsReady]);

  // Verse list = union of source-token verses and English-baseline verses, so
  // the English column always renders even when the chosen source carries no
  // tokens for this book (e.g. BHS on Prayer of Manasseh) — no blank screen.
  const verseNums = useMemo(() => {
    const s = new Set(words.map(w => w.verse));
    for (const k of Object.keys(translations)) s.add(Number(k));
    return [...s].sort((a, b) => a - b);
  }, [words, translations]);
  const verseCount = verseNums.length ? Math.max(...verseNums) : 0;
  const wordsByVerse = useMemo(() => {
    const m = {}; words.forEach(w => (m[w.verse] || (m[w.verse] = [])).push(w)); return m;
  }, [words]);

  const meta = bookMeta.current[book] || { first: 1, last: chapter };

  const goChapter = useCallback((c) => {
    if (c >= (meta.first || 1) && c <= (meta.last || c)) { setVerse(null); setChapter(c); }
  }, [meta]);
  const stepVerse = useCallback((d) => {
    if (verse == null) { goChapter(chapter + d); return; }
    const next = verse + d;
    if (next < 1) { if (chapter > (meta.first || 1)) { setChapter(chapter - 1); setVerse(-1); } }
    else if (next > verseCount) { if (chapter < (meta.last || chapter)) { setChapter(chapter + 1); setVerse(1); } }
    else setVerse(next);
  }, [verse, chapter, verseCount, meta, goChapter]);

  // After a backward cross-chapter step, -1 means "land on the last verse".
  useEffect(() => { if (verse === -1 && verseCount) setVerse(verseCount); }, [verse, verseCount]);

  // Mobile swipe → prev/next
  const touch = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) stepVerse(dx < 0 ? 1 : -1);
    touch.current = null;
  };

  const chapterOptions = [];
  for (let c = (meta.first || 1); c <= (meta.last || chapter); c++) chapterOptions.push(c);

  const visibleVerses = verse != null ? verseNums.filter(v => v === verse) : verseNums;
  const curBookName = (books.find(b => b.book_id === book) || {}).name || BOOK_NAMES[book] || `Book ${book}`;
  const refTitle = `${curBookName} ${chapter}${verse != null ? ':' + verse : ''}`;
  // Open the reader at this verse in the SAME source we're viewing here. Without
  // the source, the reader defaults to BHS — which blanks for a book that has no
  // Masoretic Hebrew (e.g. a NT verse shown in Heb·extra). Carrying lang keeps
  // Heb·extra on Heb·extra; BHS stays on the (source-less) BHS reader.
  const hebHref = `/?${lang && lang !== 'BHS' ? `source=${encodeURIComponent(lang)}&` : ''}book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`;

  return (
    <div className={`pl-root ${perLine ? 'verse-per-line' : ''} ${verse != null ? 'single-verse' : ''}`}>
      <div className="pl-top-bar">
        <div className="pl-row1">
          <Link to="/landing" className="pl-logo" title="Home" aria-label="Home">𐤀𐤁</Link>
          <h1 className="pl-title">Parallel</h1>
          <div className="pl-nav-group">
            <select value={book} onChange={e => {
              const nb = +e.target.value; const nl = bestLang(nb, lang);
              setChapter(1); setVerse(null); setBook(nb);
              if (nl !== lang) setLang(nl);
            }}>
              {books.map((b, i) => <option key={b.book_id} value={b.book_id}>{i + 1}. {b.name || BOOK_NAMES[b.book_id] || `Book ${b.book_id}`}</option>)}
            </select>
            <select value={chapter} onChange={e => { setVerse(null); setChapter(+e.target.value); }}>
              {chapterOptions.map(c => <option key={c} value={c}>Chapter {c}</option>)}
            </select>
            <select value={verse ?? ''} onChange={e => setVerse(e.target.value ? +e.target.value : null)}>
              <option value="">— verse —</option>
              {verseNums.map(v => <option key={v} value={v}>Verse {v}</option>)}
            </select>
            <select className="pl-lang" value={lang} onChange={e => setLang(bestLang(book, e.target.value))} title="Source language">
              {sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <span className="pl-status">{status}</span>
        </div>
        <div className="pl-row2">
          <Link className="pl-txt-btn" to={hebHref}>{(READER_NAME[lang] || 'Hebrew')} Viewer →</Link>
          <Link className="pl-txt-btn" to={`/bible?book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`}
                title="Open this passage in the Reader — flowing prose, no Strong's">📗 Reader →</Link>
          <Link className="pl-txt-btn" to={`/translate?book=${bookToParam(book, idToSlug)}&chapter=${chapter}${verse != null ? `&verse=${verse}` : ''}`}>✎ Studio</Link>
          <button className="pl-icon-btn" onClick={toggleTheme} title="Toggle theme">{theme === 'light' ? '☾' : '☀'}</button>
          <button className="pl-icon-btn" onClick={() => setSettingsOpen(o => !o)} title="Display options">⚙</button>
        </div>
        {settingsOpen && (
          <div className="pl-settings">
            <label><input type="checkbox" checked={perLine} onChange={e => setPerLine(e.target.checked)} /> One verse per line</label>
            <div className="pl-gloss-row">
              <span className="pl-gloss-label">Glosses</span>
              <div className="pl-gloss-chips">
                {GLOSS_MODES.map(m => (
                  <button key={m.id} type="button"
                          className={`pl-gloss-chip ${glossMode === m.id ? 'sel' : ''}`}
                          onClick={() => setGlossMode(m.id)}
                          aria-pressed={glossMode === m.id}
                          title={`Show ${m.label.toLowerCase()} — e.g. ${m.note}`}>
                    <span className="pl-gloss-name">{m.label}</span>
                    <span className="pl-gloss-note">{m.note}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pl-main" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="pl-head-row">
          <div className="pl-ref-title">{refTitle}</div>
          {verse != null && <button className="pl-txt-btn" onClick={() => setVerse(null)}>↑ Full chapter</button>}
          <button className="pl-txt-btn" onClick={() => setLegendOpen(o => !o)}>Legend ▾</button>
        </div>

        {legendOpen && (
          <div className="pl-legend">
            <span className="leg root">Root</span>
            <span className="leg mod-conj">Conjunction</span>
            <span className="leg mod-prep">Preposition</span>
            <span className="leg mod-art">Article</span>
            <span className="leg mod-nega">Negation</span>
            <span className="leg mod-nmpr">Proper noun</span>
            <span className="leg pfm-3ms">He/It (3ms)</span>
            <span className="leg vbs-hif">Causative</span>
            <span className="leg-note">Hover linked words to see correspondences · gold = match</span>
          </div>
        )}

        <div className="pl-output">
          {visibleVerses.length === 0 && !status && <div className="no-translation">No text available for this chapter.</div>}
          <VerseErrorBoundary key={`${book}-${chapter}-${lang}`} onError={onRenderError}>
            {visibleVerses.map(v => (
              <VerseRow key={v} v={v} words={wordsByVerse[v] || []} tx={translations[v]}
                        showSub={showSub} rich={rich} isPaleoScript={srcMeta.script === 'paleo-hebrew'} dir={dir}
                        isActive={verse === v} onRefClick={setVerse} unaligned={unaligned.has(v)}
                        hovered={hovered} setHovered={setHovered} glossMode={glossMode} />
            ))}
          </VerseErrorBoundary>
        </div>

        <button className="pl-side-nav prev" onClick={() => stepVerse(-1)} title="Previous">◀</button>
        <button className="pl-side-nav next" onClick={() => stepVerse(1)} title="Next">▶</button>
      </div>
    </div>
  );
}
