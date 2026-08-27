import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { paleoToSVG } from '../lib/paleoGlyphs.js';
import { transliterate } from '../lib/translit.js';
import { useToast } from '../components/Toast.jsx';
import WordBlock from '../components/WordBlock.jsx';
import {
  apiTransProgress, apiTransChapter, apiTransVerse, apiTransBookText,
  apiTransSaveVerse, apiTransHistory, apiTransRevertToHistory, apiTransDeleteHistory,
  apiTransLink, apiTransUnlink, apiTransUpdateLink,
  apiTokens, apiBookOrder,
} from '../lib/api.js';
// Reuse Reader.jsx's own quote-marking engine for the live "quote preview"
// panel below (2026-08-26, fieldy: "I would like to see a preview of my
// active quote... I dont have to save it before confirming the quotes line
// up how I want") — same functions Reader.jsx renders the real page with,
// so the preview matches exactly instead of approximating it. Also pulls in
// Reader.css so the .rd-quote-* classes these produce actually render.
import { sanitizeText, parseQuoteMarks, dissolveOverlongQuotes, sliceQuoteTree, renderQuoteTree } from './Reader.jsx';
import './Reader.css';
import {
  getAdminStatus, refreshAdminStatus, mergeVerseWithLocal, getLocalVerse, saveLocalVerse, resetLocalVerse,
  getLocalLinks, addLocalLink, deleteLocalLink, clearLocalLinks, setLocalLinksOverride, resetLocalLinksOverride,
  resetAllLocal, hasAnyLocalOverrides,
} from '../lib/localOverlay.js';
import { BOOK_NAMES } from '../lib/books.js';
import { buildBookSlugs, resolveBookParam, bookToParam, parallelHref } from '../lib/bookSlug.js';
import { usePageTitle, formatRef } from '../hooks/usePageTitle.js';
import './Translate.css';

// Util — JSON-parse-with-fallback
const parseJ = (v, fb) => Array.isArray(v) ? v : (() => { try { return JSON.parse(v); } catch { return fb; } })();

// Transliterated proper/divine names that never get a natural English gloss
// (Alahayam "God", Yahawah "the LORD/YHWH") but still take the trailing
// "(...)" every other content word gets under the reading-text convention
// ("TRANSLIT (gloss)") — left empty for these by convention. Add more names
// here as they come up.
const AUTO_GLOSS_WORDS = ['Alahayam', 'Yahawah'];
// Keystrokes that end a word while typing prose — space and the punctuation
// that commonly follows a word mid-sentence or at a clause/sentence end.
const AUTO_GLOSS_BOUNDARY_KEYS = new Set([' ', ',', '.', ';', ':', '?', '!']);

// Fires from the translation editor's onKeyDown. If the word just finished
// (the run of letters immediately before the caret) is one of
// AUTO_GLOSS_WORDS and isn't already followed by a "(", inserts an empty
// "()" before the boundary character the user just typed — e.g. typing
// "Alahayam" then a space yields "Alahayam () " instead of "Alahayam ".
// Uses execCommand('insertText'), same as the toolbar buttons above, so it
// stays in the browser's native undo stack instead of hand-editing the DOM.
function maybeAutoInsertGlossParens(e) {
  if (!AUTO_GLOSS_BOUNDARY_KEYS.has(e.key)) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;
  const before = node.textContent.slice(0, range.startOffset);
  const word = before.match(/([A-Za-z]+)$/)?.[1];
  if (!word || !AUTO_GLOSS_WORDS.includes(word)) return;
  // Already glossed (editing mid-sentence, e.g. caret placed back inside an
  // already-complete "Alahayam ()") — don't double up.
  if (/^\s*\(/.test(node.textContent.slice(range.startOffset))) return;
  e.preventDefault();
  // " ()" + the boundary char that was just typed — a space stays a space
  // ("Alahayam () "), punctuation hugs the closing paren ("Yahawah ().").
  document.execCommand('insertText', false, ` ()${e.key === ' ' ? ' ' : e.key}`);
}

// Token css class → CSS variable color
const PART_VAR = {
  root: '--c-root', conj: '--c-conj', art: '--c-art', prep: '--c-prep',
  pfm:  '--c-pfm',  vbs:  '--c-vbs',  prs: '--c-prs', nme:  '--c-nme',
  vbe:  '--c-vbe',  uvf:  '--c-uvf',
  // morphology subclasses fall back to their family
};
function partColor(css) {
  if (!css) return 'var(--c-root)';
  for (const key of Object.keys(PART_VAR)) if (css.startsWith(key)) return `var(${PART_VAR[key]})`;
  return 'var(--c-root)';
}

function tokenTrans(t) {
  if (!t.components?.length) return t.translation || '';
  // Each component renders its translation; non-root parts get [bracketed]
  // labels for visual distinction, matching the original layout. Empty
  // translations are filtered so prefixes without glosses don't show stray
  // empty brackets.
  return t.components.map(c => {
    const tr = c.translation || c.translit || '';
    if (!tr) return null;
    return c.css === 'root' ? tr : `[${tr}]`;
  }).filter(Boolean).join(' · ');
}

// Auto-Link helpers — see the autoLinkVerse callback inside the component for
// the actual matching logic and why exact-string transliteration matching is
// reliable here. Common English words are never proposed as a match target
// (they'd never legitimately equal a Hebrew root's transliteration, but this
// is a cheap extra guard rather than relying on that alone).
const AUTO_LINK_STOP = new Set([
  'a','an','the','and','or','but','of','to','at','in','on','by','for','with',
  'from','into','unto','upon','over','under','is','am','are','was','were',
  'be','been','being','he','him','his','she','her','it','its','they','them',
  'their','you','your','we','us','our','i','me','my',
]);
const cleanEnWord = (w) => String(w || '').replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');

// An untranslatable grammatical marker (the Hebrew direct-object particle
// 𐤀𐤕/"eth" is the recurring example — it has no independent English word at
// all) reads in the "Novel English" text as its own raw Paleo glyphs inline,
// not a Latin word — cleanEnWord strips that to nothing (no A-Za-z content
// survives), so it could never match any candidate, including another
// language's own word for the very same particle (e.g. Syriac's lexicon
// entry "ath / the entirety of"). Fieldy, 2026-08-16: "𐤀𐤕 did not match how
// I expect, it should also match the syriac." Transliterating it first (the
// same paleo->Latin transliterate() every reader already uses) gives a
// comparable string instead of an empty one.
const PALEO_LETTER_RE = /[\u{10900}-\u{1091F}]/u;
function cleanAutoLinkWord(raw) {
  const s = String(raw || '');
  if (PALEO_LETTER_RE.test(s)) {
    const glyphsOnly = s.replace(/[^\u{10900}-\u{1091F}]/gu, '');
    return transliterate(glyphsOnly, { script: 'paleo-hebrew' }).toLowerCase();
  }
  return cleanEnWord(s).toLowerCase();
}

// Non-Hebrew source lexicons (server/lexicon/{latin,syriac,geez,greek,
// hebrew-extra}-lexicon.json) store each word's value as
// "[connector ]TRANSLIT[ /gloss]" — e.g. "and raah / saw", "Yawam / day" —
// literally the same lexicon this session's piecewise-expansion workflow
// writes by hand. It already rides along as each token's own `.gloss` field
// from /api/source/:src/verse (server.js's _lookupGloss), so no extra fetch
// is needed to auto-link these editions. Since the app's "Novel English"
// reading-text convention is always "TRANSLIT (gloss)" (CLAUDE.md's Two
// Display Surfaces section), the transliteration segment — before the
// separator, with a leading connector word stripped — is exactly the
// English word to match. Fieldy, 2026-08-16: "since the other languages use
// hebrew lexicon words in their values, the other language linking should
// be trivial too raa (saw) -> ወርእዮ." A value of "—" or with no real
// transliteration segment (a plain English editorial note like "Egypt" or
// "legal expert...") yields no candidates — there's nothing reliable to
// match against the app's own transliterated reading text for those.
//
// TWO separator conventions exist in these files: entries added this session
// use "TRANSLIT / gloss" (a slash); older entries — e.g. Genesis 1:1's Greek,
// "ΑΡΧΗ": "Raashayath - beginning" — use "TRANSLIT - gloss" (a dash). A
// slash-only split left every dash-style entry's WHOLE string as the
// "translit", so the candidate ended up being its own trailing gloss word
// ("beginning") instead of the real transliteration ("Raashayath") — Auto-
// Link found zero matches on Genesis 1:1's Greek because of exactly this.
// Split on whichever separator appears first so both conventions resolve.
const LEX_LEAD_STRIP = /^(and|the|to|of|in|for|so|that|he|it|they)\s+/i;
// A single fused-morpheme translit word — hebrew-extra-lexicon.json's own
// house style for a Hebrew grammatical prefix baked onto its root as one
// CamelCase word, e.g. "HaRaqayai" (Ha- "the" + Raqayai), "LaRaqayai" (La-
// "to" + Raqayai), "MiThachath" (Mi- "from" + Thachath), "MeIl" (Me- "from"
// + Il) — see piecewise-expansion-notes.md's Hebrew (extra) sections. The
// app's "Novel English" reading text spells that prefix out as its own
// separate plain-English word ("the raqayai", "to the raqayai", "from
// thachath") rather than repeating it fused onto the transliteration, so
// Auto-Link needs the bare ROOT as an extra candidate or these silently
// never match — the root is always written last in this convention, so
// splitting on every internal capital and keeping the final segment finds
// it. Fieldy, 2026-08-25, Gen 1:7: "Heb extra isnt matching on mayam,
// raqayai, thachath... make the links match the transliterated words."
const CAMEL_SEGMENT_RE = /^[A-Z][a-z]*(?:[A-Z][a-z]*)+$/;
function lastCamelSegment(word) {
  if (!CAMEL_SEGMENT_RE.test(word)) return null;
  const segs = word.split(/(?=[A-Z])/);
  return segs[segs.length - 1] || null;
}
function lexTranslitCandidates(val) {
  if (!val || val === '—') return [];
  const s = String(val);
  const slashIdx = s.indexOf('/');
  const dashIdx = s.indexOf(' - ');
  const cut = slashIdx >= 0 && dashIdx >= 0 ? Math.min(slashIdx, dashIdx) : Math.max(slashIdx, dashIdx);
  let left = (cut >= 0 ? s.slice(0, cut) : s).trim();
  // Some older entries carry NEITHER a "/" nor a " - " separator at all —
  // the gloss is just a trailing parenthetical instead, e.g. "Mayam
  // (waters)", "Aratz (earth)" (predates this session's "translit / gloss"
  // convention). Left alone, `left` above is the WHOLE "Word (gloss)"
  // string, and splitting it on whitespace put the still-bracketed
  // "(waters)" through as the "last word" candidate — which can never equal
  // the plain "water"/"waters" fieldy actually writes in the translation, so
  // these entries silently never auto-linked. Strip any trailing
  // parenthetical the same way regardless of which format produced `left`.
  // Fieldy, 2026-08-25: "if a lexicon gloss has the word I use in my
  // translation it should be linked with the word, not happening for mayam."
  left = left.replace(/\s*\(.*$/, '').trim();
  let prev;
  do { prev = left; left = left.replace(LEX_LEAD_STRIP, '').trim(); } while (left !== prev);
  if (!left) return [];
  const words = left.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = new Set([words.join('').toLowerCase(), words[words.length - 1].toLowerCase()]);
  for (const w of words) {
    const root = lastCamelSegment(w);
    if (root) out.add(root.toLowerCase());
  }
  return [...out].filter(Boolean);
}

// Fuzzy fallback layered on top of the exact-candidate match below. The
// CamelCase-root extraction above already handles a lexicon-side compound
// ("HaRaqayai") matching a bare-root English word ("raqayai"), but fieldy's
// OWN transliteration spelling for the same underlying root sometimes
// differs between occurrences the other way — e.g. an older lexicon entry
// spelled just "hayah" while a later verse's English instead writes the
// fuller "WaYaHayah (and this came to pass)". Since every Hebrew prefix
// morpheme in this app's own convention attaches to the FRONT of the root
// (the root is always the tail — same rule lastCamelSegment relies on),
// treat two translit strings as the same word whenever the SHORTER one is a
// suffix of the longer one, checked in EITHER direction (lexicon-longer or
// English-longer). Fieldy, 2026-08-25: "I want it to work both ways...
// I want the transliterated words on this (translation) side to link with
// the same word as the transliteration on the source side" — the gloss
// text in parens is explicitly NOT part of the match, only the
// transliteration is, which is already all `clean`/candidate strings ever
// carry. A minimum length on the shorter string is a second guard against a
// short grammar fragment coincidentally ending some unrelated longer word —
// AUTO_LINK_STOP/LEX_LEAD_STRIP already remove most of those before this is
// ever reached.
const FUZZY_TRANSLIT_MIN_LEN = 4;
function translitMatches(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= FUZZY_TRANSLIT_MIN_LEN && longer.endsWith(shorter);
}

// One candidate per still-unlinked token, offering every transliteration
// string that would legitimately identify it. Hebrew (BHS) offers the FULL
// reconstructed word (root+suffix, no eliding) ahead of the bare root — see
// the "allow variants" fix below — so "achayam" and "ach" both work. Every
// other language offers whatever lexTranslitCandidates pulls from its own
// token's `.gloss` (the lexicon value). `compIdx` on a variant says what a
// match against it should link: -1 for the whole token, a real index for
// just that Hebrew component (leaving the rest for a separate manual link).
function buildAutoLinkCandidates(isBHSLang, tokens, usedOrd) {
  const out = [];
  for (const t of tokens) {
    if (usedOrd.has(t.token_ordinal)) continue;
    const variants = [];
    if (isBHSLang) {
      const comps = t.components || [];
      const root = comps.find(c => c.css === 'root') || comps.find(c => c.css === 'mod-nmpr');
      if (!root) continue;
      const rootTranslit = String(root.translit || '').trim().toLowerCase();
      if (!rootTranslit) continue;
      const fullTranslit = comps.filter(c => !c.isMark).map(c => c.translit || '').join('').trim().toLowerCase();
      const compIdx = comps.length > 1 ? comps.indexOf(root) : -1;
      if (fullTranslit && fullTranslit !== rootTranslit) variants.push({ text: fullTranslit, compIdx: -1 });
      variants.push({ text: rootTranslit, compIdx });
    } else {
      for (const text of lexTranslitCandidates(t.gloss)) variants.push({ text, compIdx: -1 });
    }
    if (variants.length) out.push({ ordinal: t.token_ordinal, used: false, variants });
  }
  return out;
}

// Walks the English words IN ORDER and greedily pairs each against the
// first still-unused candidate whose transliteration matches — which is
// what makes a word used TWICE in one verse ("qaraa" called twice in
// Genesis 1:5) pair the first occurrence with the first (lowest-ordinal,
// i.e. earliest-read) source token and the second occurrence with the
// second, instead of both colliding on whichever token happened to be
// found first. Fieldy, 2026-08-16: "the order matters... assume my usage
// will be in the order of the words themselves."
function matchAutoLinkCandidates(candidates, enWords, usedEn) {
  const matches = [];
  for (let i = 0; i < enWords.length; i++) {
    if (usedEn.has(i)) continue;
    const clean = cleanAutoLinkWord(enWords[i]);
    if (!clean || AUTO_LINK_STOP.has(clean)) continue;
    let hit = null, hitVariant = null;
    for (const c of candidates) {
      if (c.used) continue;
      const v = c.variants.find(vv => translitMatches(vv.text, clean));
      if (v) { hit = c; hitVariant = v; break; }
    }
    if (!hit) continue;
    hit.used = true;
    matches.push({ enIdx: i, ordinal: hit.ordinal, compIdx: hitVariant.compIdx });
  }
  return matches;
}

// Computes matches for ONE language/verse and writes whatever new links it
// finds (admin: straight to the server; non-admin: this browser's local
// overlay). Deliberately takes `admin` as a parameter rather than looking it
// up itself — Sync All already resolves it once per language via
// fetchLangTokensAndLinks, and re-checking here would just be a second round
// trip for the same answer. No React state read here at all, so this is
// equally safe to call for the CURRENTLY displayed language (reusing its
// already-loaded tokens/links/enWords) or for every OTHER language in turn.
async function runAutoLinkForVerse(bookId, chapter, verse, langId, tokens, links, enWords, admin) {
  if (!tokens?.length || !enWords?.length) return { created: 0, matched: 0, errors: [] };
  const usedEn  = new Set(links.flatMap(l => l.english_indices || []));
  const usedOrd = new Set(links.flatMap(l => l.token_ordinals  || []));
  const candidates = buildAutoLinkCandidates(langId === 'BHS', tokens, usedOrd);
  const matches = matchAutoLinkCandidates(candidates, enWords, usedEn);
  if (!matches.length) return { created: 0, matched: 0, errors: [] };

  const errors = [];
  let created = 0;
  for (const m of matches) {
    const tok = tokens.find(t => t.token_ordinal === m.ordinal);
    const comp = m.compIdx >= 0 ? tok?.components?.[m.compIdx] : null;
    const component_hint = comp ? `${m.compIdx}:${comp.css}` : '';
    const payload = {
      book_id: bookId, chapter, verse, lang: langId,
      english_phrase: enWords[m.enIdx], english_indices: [m.enIdx],
      token_ordinals: [m.ordinal], component_hint,
      color_index: 0, sort_order: links.length + created,
    };
    try {
      if (admin) await apiTransLink(payload);
      else await addLocalLink(bookId, chapter, verse, langId, payload, links);
      created++;
    } catch (e) { errors.push(e.message); }
  }
  return { created, matched: matches.length, errors };
}

// Independent fetch of ONE language's tokens + resolved links for a verse —
// mirrors loadVerse's own fetch logic (deliberately duplicated: loadVerse
// writes to this component's React state, and Sync All needs to walk N
// languages in a tight loop without racing that state — see the comment on
// runAutoLinkForVerse). Includes the same local-overlay handling as
// loadVerse so a non-admin's own earlier local edits are respected/extended,
// not silently overwritten.
async function fetchLangTokensAndLinks(bookId, chapter, verse, langId) {
  let data = await fetch(`/api/translate/verse?book=${bookId}&chapter=${chapter}&verse=${verse}&lang=${encodeURIComponent(langId)}`)
    .then(r => r.json());
  const effective = data.token_source || langId;
  const { isAdmin: admin } = await getAdminStatus();
  let localLinksOverride = null;
  if (!admin) {
    const [localVerse, ll] = await Promise.all([
      getLocalVerse(bookId, chapter, verse),
      getLocalLinks(bookId, chapter, verse, effective),
    ]);
    if (localVerse) data = mergeVerseWithLocal(data, localVerse);
    localLinksOverride = ll;
  }
  let tokens;
  if (langId === 'BHS') {
    const parsedTokens = await apiTokens(bookId, chapter).catch(() => []);
    const parsedByKey = {};
    for (const pt of parsedTokens || []) {
      if (pt.verse != null && pt.token_ordinal != null) parsedByKey[`${pt.verse}:${pt.token_ordinal}`] = pt;
    }
    tokens = (data.tokens || []).map(t => {
      const p = parsedByKey[`${+verse}:${t.token_ordinal}`];
      return p?.components?.length ? { ...t, components: p.components, strongs: p.strongs || t.strongs } : t;
    });
  } else {
    const sv = await fetch(`/api/source/${encodeURIComponent(langId)}/verse?book=${bookId}&chapter=${chapter}&verse=${verse}`)
      .then(r => r.ok ? r.json() : { tokens: [] }).catch(() => ({ tokens: [] }));
    tokens = (sv.tokens || []).map((t, i) => ({ token_ordinal: t.ord ?? (i + 1), word_raw: t.word ?? '', gloss: t.gloss || '' }));
  }
  const enWords = (data.text || '').trim().split(/\s+/).filter(Boolean);
  const links = dedupeLinks(resolvePhraseLinks(hydrateLinks(localLinksOverride != null ? localLinksOverride : (data.links || [])), enWords));
  return { tokens, links, enWords, tokenSource: effective, admin };
}

function dedupeLinks(links) {
  const seen = new Map();
  for (const l of links) {
    const key = JSON.stringify([...l.token_ordinals].sort()) + '|' + JSON.stringify([...l.english_indices].sort());
    if (!seen.has(key) || l.id > seen.get(key).id) seen.set(key, l);
  }
  return [...seen.values()].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
}

function hydrateLinks(rawLinks) {
  return rawLinks.map(l => ({
    ...l,
    english_indices: parseJ(l.english_indices, []),
    token_ordinals:  parseJ(l.token_ordinals,  []),
  }));
}

// `avoid`, if given, is a Set of word-indices already claimed by an earlier
// link's resolved span — the search skips any candidate span overlapping it,
// so a SECOND link sharing the same phrase text finds the phrase's SECOND
// occurrence instead of colliding on the first. See resolvePhraseLinks below,
// which is what actually orders and feeds these calls.
function findPhraseIndices(phrase, words, avoid) {
  const ph = phrase.trim().split(/\s+/);
  const clean = w => w.replace(/[,\.!?;:()]+/g, '').toLowerCase();
  for (let i = 0; i <= words.length - ph.length; i++) {
    if (avoid && avoid.size && Array.from({ length: ph.length }, (_, k) => i + k).some(idx => avoid.has(idx))) continue;
    if (words.slice(i, i + ph.length).map(clean).join(' ') === ph.map(clean).join(' '))
      return Array.from({ length: ph.length }, (_, k) => i + k);
  }
  return [];
}

// Resolves every link's english_indices in place: links that already carry
// their own explicit english_indices are trusted and their spans reserved;
// links that only have english_phrase text (older/imported data, or an
// auto-link whose payload didn't set indices) get resolved via
// findPhraseIndices, walked in the SOURCE tokens' own reading order
// (token_ordinals[0] ascending) so that when the SAME phrase legitimately
// appears twice — "qaraa" linked once to each of its two occurrences in
// Genesis 1:5 — the link pointing at the earlier source token claims the
// phrase's first occurrence and the link pointing at the later source token
// claims the second, rather than both colliding on the first. Fieldy,
// 2026-08-16: "the order matters... assume my usage will be in the order of
// the words themselves." Mutates and returns the same array.
function resolvePhraseLinks(links, enWords) {
  const claimed = new Set();
  for (const l of links) if (l.english_indices?.length) l.english_indices.forEach(i => claimed.add(i));
  const needsPhrase = links
    .filter(l => !l.english_indices?.length && l.english_phrase)
    .sort((a, b) => (a.token_ordinals?.[0] ?? 0) - (b.token_ordinals?.[0] ?? 0));
  for (const l of needsPhrase) {
    l.english_indices = findPhraseIndices(l.english_phrase, enWords, claimed);
    l.english_indices.forEach(i => claimed.add(i));
  }
  return links;
}

// Link color resolution mirrors the original: derive the color from the
// LINKED HEBREW token's primary part-of-speech (or the explicit component_hint
// part if the link points at a specific component). This is what makes a
// noun-link green and a verb-link red consistently across the linker grid and
// every existing-link badge, rather than rotating through arbitrary colors.
// The actual color values are CSS variables (--c-root, --c-prep, etc) defined
// in tokens.css; we use the same fallback chain everywhere in this file.
const tokenPrimaryPart = (token) => {
  if (!token?.components?.length) return 'root';
  return token.components.find(c => c.css === 'root')?.css || token.components[0]?.css || 'root';
};
const lColorForTokens = (link, tokens) => {
  if (!link) return 'var(--c-root)';
  if (link.component_hint && link.component_hint.includes(':')) {
    return partColor(link.component_hint.split(':')[1] || 'root');
  }
  const ord = link.token_ordinals?.[0];
  if (ord == null) return 'var(--c-root)';
  const tok = tokens?.find(t => t.token_ordinal === ord);
  return partColor(tokenPrimaryPart(tok));
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATE PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function Translate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();

  // ── admin vs. local-only editing ────────────────────────────────────────────
  // Admins (logged in — see server/server.js's /admin/login) write straight
  // through to the server, exactly like before this existed. Everyone else's
  // saves/links go to this browser's local overlay (src/lib/localOverlay.js)
  // instead — nothing they do ever reaches your server. `isAdmin` starts null
  // (unknown) until the one-time /admin/session check resolves.
  const [isAdmin, setIsAdmin] = useState(null);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  useEffect(() => {
    getAdminStatus().then(s => setIsAdmin(!!s.isAdmin));
    hasAnyLocalOverrides().then(setHasLocalEdits).catch(() => {});
  }, []);

  const [progress, setProgress] = useState(null);
  const [masterBooks, setMasterBooks] = useState([]);
  const [activeBook, setActiveBook] = useState(() => +searchParams.get('book') || null);
  const [activeChapter, setActiveChapter] = useState(() => +searchParams.get('chapter') || null);
  const [activeVerse, setActiveVerse] = useState(() => {
    const raw = searchParams.get('verse');
    return raw != null && raw !== '' ? +raw : null;
  });
  const [openChapterMap, setOpenChapterMap] = useState({}); // { "bookId:chapter": verseListData }
  const [verseData, setVerseData] = useState(null); // { status, text, rich_text, links, tokens }
  // Bumped every time loadVerse() lands a fresh fetch from the server (see its
  // setVerseData call below). Reset-to-published / Pull latest / a language
  // switch can all reload the SAME book/chapter/verse — the editor-sync effect
  // below used to key only on verse identity, so those reloads never re-synced
  // the contentEditable DOM and the user's local edit stayed on screen until a
  // manual page refresh. loadSeq gives that effect a signal that fires on every
  // real reload, not just a change of verse.
  const [loadSeq, setLoadSeq] = useState(0);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  // Revision history panel — every prior version of the CURRENT verse,
  // fetched on demand (not preloaded with every verse — most verses are
  // never opened for history, so this stays a click-triggered fetch like
  // the rest of Studio's on-demand panels).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  // Mobile only: collapse the Books + Chapter pickers so the editor gets the
  // screen. State (activeBook/chapter/verse) is untouched, so Save still targets
  // the right verse whether the pickers are showing or not.
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [selEn, setSelEn] = useState(() => new Set());
  const [selHeb, setSelHeb] = useState(() => new Set());

  // ── Multi-language linking ──────────────────────────────────────────────────
  // The English translation is one-per-verse and shared across source languages.
  // `lang` is the source language we're currently linking against; `langs` is the
  // set of corpus languages that actually contain this verse; `srcTokens` holds
  // the selected language's tokens (BHS keeps its rich Paleo path; other scripts
  // render generically with correct direction). Switching language re-fetches the
  // links scoped to it — you re-link per language, as expected.
  const [lang, setLang]       = useState('BHS');
  const [langs, setLangs]     = useState([{ id: 'BHS', label: 'Hebrew (BHS)', script: 'paleo-hebrew', dir: 'rtl' }]);
  const [srcTokens, setSrcTokens] = useState(null);   // non-BHS source tokens, or null for BHS
  // The edition the LOADED tokens actually came from, as reported by the server.
  // Links are authored against this, never against the `lang` picker.
  const [tokenSource, setTokenSource] = useState('BHS');
  const langMeta = langs.find(l => l.id === lang) || { dir: 'rtl', script: 'paleo-hebrew' };
  const isBHS = lang === 'BHS';

  // mode = 'edit' | 'view'.  viewLayout = 'side' | 'english'.
  // hoveredLinkId is for cross-column hover highlights in both edit and view modes.
  const [mode, setMode] = useState('edit');
  const [viewLayout, setViewLayout] = useState('side');
  const [hoveredLinkId, setHoveredLinkId] = useState(null);

  // Read-only overlays: full chapter view (all translated verses + paleo side-
  // by-side) and corpus overview (translation progress per book). Both are
  // backstops to the live editor — they read but never mutate.
  const [chvOpen, setChvOpen] = useState(false);
  const [chvLayout, setChvLayout] = useState('side');
  const [chvData, setChvData] = useState(null); // array of fully-merged verse details
  const [ovOpen, setOvOpen] = useState(false);

  // ── INIT ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiTransProgress().then(setProgress).catch(e => toast('Progress load failed: ' + e.message, 'err'));
  }, [toast]);
  useEffect(() => { apiBookOrder().then(setMasterBooks).catch(() => setMasterBooks([])); }, []);

  // Slug ↔ canon_id, from the master book list (same input + slugify as every
  // other reader, so a book's slug is identical app-wide). Numeric ?book still works.
  // Tolerate whichever id field the book-order API returns (id / book_id / canon_id)
  // — if this comes back empty, slug URLs like ?book=genesis can never resolve and
  // the page strands on its empty state.
  const { slugToId, idToSlug } = useMemo(
    () => buildBookSlugs((masterBooks || []).map(mb => {
      const id = mb.id ?? mb.book_id ?? mb.canon_id;
      return { id, name: mb.name || BOOK_NAMES[id] };
    })),
    [masterBooks]
  );

  const setUrl = useCallback((b, c, v) => {
    const p = {};
    if (b) p.book = bookToParam(b, idToSlug);
    if (c) p.chapter = String(c);
    if (v != null) p.verse = String(v);
    setSearchParams(p, { replace: true });
  }, [setSearchParams, idToSlug]);

  // ── BOOK / CHAPTER PANE ───────────────────────────────────────────────────
  const books = progress?.books || [];
  const activeBookData = books.find(b => b.book_id === activeBook);

  // ── browser tab ────────────────────────────────────────────────────────────
  // Reference first ("Genesis 1:1 | Translation Studio", 2026-08-15 — see
  // hooks/usePageTitle.js).
  const translateRef = formatRef(activeBookData?.name || (activeBook ? BOOK_NAMES[activeBook] : ''), activeChapter, activeVerse);
  usePageTitle(translateRef ? `${translateRef} | Translation Studio` : '');

  const selectBook = useCallback(async (bookId) => {
    setActiveBook(bookId);
    setUrl(bookId, null, null);
  }, [setUrl]);

  const openChapter = useCallback(async (bookId, chapter) => {
    const key = `${bookId}:${chapter}`;
    setActiveChapter(chapter);
    setUrl(bookId, chapter, null);
    if (!openChapterMap[key]) {
      try {
        const data = await apiTransChapter(bookId, chapter);
        const verses = data.verses || [];
        setOpenChapterMap(m => ({ ...m, [key]: verses }));
        return verses;   // handed back to callers (e.g. the hydration effect) that
                          // need to know the chapter's verse list right away —
                          // openChapterMap itself won't reflect this until the next
                          // render, too late for a .then() chained off this call.
      } catch (e) { toast('Chapter load failed: ' + e.message, 'err'); return []; }
    }
    return openChapterMap[key];
  }, [setUrl, openChapterMap, toast]);

  // ── LOAD VERSE ────────────────────────────────────────────────────────────
  const loadVerse = useCallback(async (bookId, chapter, verse, useLang) => {
    const L = useLang || lang;
    setActiveBook(bookId);
    setActiveChapter(chapter);
    setActiveVerse(verse);
    setNavCollapsed(true);   // hand the screen to the editor (mobile); no-op on desktop
    setSelEn(new Set()); setSelHeb(new Set());
    setUrl(bookId, chapter, verse);
    try {
      // English + links, scoped to the chosen source language (direct fetch so we
      // can pass &lang; the shared English is identical across languages).
      let data = await fetch(`/api/translate/verse?book=${bookId}&chapter=${chapter}&verse=${verse}&lang=${encodeURIComponent(L)}`)
        .then(r => r.json());
      // WHICH EDITION THESE TOKENS ARE. `data.token_source` reflects ONLY
      // txVerseQuery's own table pick (tokens_bhs for every OT book, tokens_nt
      // for 40-66) — the mechanism the BHS branch below actually reads from.
      // For an NT book requested as the picker's 'BHS' default, that table is
      // silently tokens_nt, so trusting `data.token_source` there is exactly
      // right: every link authored on a NT verse under the stale 'BHS' guess
      // used to get stored as lang='BHS', and /parallel (asking for lang='HEB')
      // found nothing.
      //
      // That override does NOT apply here when `L` isn't 'BHS' — e.g. Genesis
      // (an OT book) explicitly requested as HEB (Hebrew-extra) below. The
      // tokens on screen in that case come entirely from /api/source/HEB/verse
      // (the `else` branch), never from txVerseQuery, so `data.token_source`
      // reporting 'BHS' here is just OT's unrelated BHS-table default leaking
      // through — not a real signal about the HEB edition actually in use.
      // Blindly trusting it mistagged every new Genesis/HEB link as lang='BHS'
      // (2026-08-27: "trying to link WaYaHayah... says saved but no link is
      // established" — Established Links stayed filtered to lang='HEB' and
      // never showed it). Only let the server override the picker's own
      // explicit non-BHS choice; never override in the other direction.
      const effectiveTokenSource = L === 'BHS' ? (data.token_source || L) : L;
      setTokenSource(effectiveTokenSource);
      // Non-admins: overlay this browser's local edits (if any) on top of the
      // server's published verse/links. Admins always see exactly what's
      // published, same as before local overrides existed. The verse TEXT has
      // no language dimension (shared across editions, see saveLocalVerse);
      // links are scoped by effectiveTokenSource, matching the server's own
      // per-edition link scoping (NOT the raw language-picker value `L`).
      const { isAdmin: admin } = await getAdminStatus();
      let localLinks = null;
      if (!admin) {
        const [localVerse, ll] = await Promise.all([
          getLocalVerse(bookId, chapter, verse),
          getLocalLinks(bookId, chapter, verse, effectiveTokenSource),
        ]);
        if (localVerse) data = mergeVerseWithLocal(data, localVerse);
        localLinks = ll; // null = no local override for links; [] = locally cleared
      }

      let tokens;
      if (L === 'BHS') {
        // Hebrew keeps its rich parsed-component Paleo path.
        const parsedTokens = await apiTokens(bookId, chapter).catch(() => []);
        const parsedByKey = {};
        for (const pt of parsedTokens || []) {
          const v = pt.verse, o = pt.token_ordinal;
          if (v != null && o != null) parsedByKey[`${v}:${o}`] = pt;
        }
        const verseNum = +verse;
        tokens = (data.tokens || []).map(t => {
          const p = parsedByKey[`${verseNum}:${t.token_ordinal}`];
          // sourceTokens/coreStrongs ride along too now (not just
          // components/strongs) — WordBlock (the shared component now
          // rendering the Paleo Source panel, same as Parallel/Hebrew
          // Viewer) needs them to badge each half of a maqaf compound
          // correctly; without them it silently degrades to one badge for
          // the whole word instead of one per half.
          if (p?.components?.length) {
            return {
              ...t, verse: verseNum, components: p.components, strongs: p.strongs || t.strongs,
              sourceTokens: p.sourceTokens, coreStrongs: p.coreStrongs,
            };
          }
          return { ...t, verse: verseNum };
        });
        setSrcTokens(null);
      } else {
        // Any other language: pull tokens from the reader's source endpoint (one
        // tokenizer, all scripts + glosses) and normalize to the link shape. The
        // token ordinal is 1-based position, matching how links store ordinals.
        const sv = await fetch(`/api/source/${encodeURIComponent(L)}/verse?book=${bookId}&chapter=${chapter}&verse=${verse}`)
          .then(r => r.ok ? r.json() : { tokens: [] }).catch(() => ({ tokens: [] }));
        tokens = (sv.tokens || []).map((t, i) => ({
          token_ordinal: t.ord ?? (i + 1),
          word_raw: t.word ?? '',
          gloss: t.gloss || '',
          strongs: t.strongs || '',
          lemma: t.lemma || '',
        }));
        setSrcTokens(tokens);
      }

      const enWords = (data.text || '').trim().split(/\s+/).filter(Boolean);
      // localLinks is null unless a non-admin has a local override for this verse's
      // links; when set (even to []), it replaces the server's link list entirely.
      const links = dedupeLinks(
        resolvePhraseLinks(hydrateLinks(localLinks != null ? localLinks : (data.links || [])), enWords)
      );
      setVerseData({ ...data, tokens, links, localLinks: localLinks != null });
      setLoadSeq(s => s + 1);
    } catch (e) { toast('Verse load failed: ' + e.message, 'err'); }
  }, [setUrl, toast, lang]);

  // Languages that actually contain the current verse — drives the picker.
  useEffect(() => {
    if (!activeBook || !activeChapter || activeVerse == null) return;
    let cancelled = false;
    fetch(`/api/translate/languages?book=${activeBook}&chapter=${activeChapter}&verse=${activeVerse}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !Array.isArray(d.languages)) return;
        const list = d.languages.length ? d.languages : [{ id: 'BHS', label: 'Hebrew (BHS)', script: 'paleo-hebrew', dir: 'rtl' }];
        setLangs(list);
        // Reload the verse ONCE the language list is known — always, not only when the
        // current language is unavailable.
        //
        // The bug: on first paint, loadVerse() runs from the URL-hydration effect
        // BEFORE this list resolves, so the source panel renders without the language
        // metadata (script, dir) it needs and comes up empty. If the current language
        // happened to be valid, the old code did nothing further, so the panel stayed
        // blank until a manual refresh warmed the cache. Refetching here costs one
        // request and makes the first paint correct.
        const nextLang = list.find(l => l.id === lang) ? lang : list[0].id;
        if (nextLang !== lang) setLang(nextLang);
        loadVerse(activeBook, activeChapter, activeVerse, nextLang);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeBook, activeChapter, activeVerse]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open from the URL (?book=&chapter=&verse=) exactly once — but only after
  // everything needed to resolve it is available, and WITHOUT committing "done"
  // until resolution truly succeeds. A slow book-list or slug map therefore can't
  // strand the page on the empty state; the effect simply retries when its inputs
  // fill in. This is what makes the Parallel / Hebrew Viewer → Studio hand-off
  // land on the right verse every time.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!progress) return;                                  // need the book/chapter data first
    const bp = searchParams.get('book');
    const cRaw = searchParams.get('chapter');
    const vRaw = searchParams.get('verse');
    const c  = cRaw != null && cRaw !== '' ? +cRaw : null;
    const v  = vRaw != null && vRaw !== '' ? +vRaw : null;
    if (!bp && !c && v == null) { hydratedRef.current = true; return; }   // nothing to open — stop trying
    // A slug needs the slug map; a number doesn't. Wait (don't lock) until resolvable.
    const isSlug = !!bp && !/^\d+$/.test(bp);
    if (isSlug && !Object.keys(slugToId).length) return;    // retry when the slug map fills
    const b = resolveBookParam(bp, slugToId, null);
    if (!b) return;                                         // unresolved yet — retry on next change
    hydratedRef.current = true;                             // commit only now that b is real
    setActiveBook(b);
    if (c && v != null) {
      openChapter(b, c).then(() => loadVerse(b, c, v));
    } else if (c) {
      // Handed off from Reader/Parallel with a chapter but no specific verse
      // (e.g. its own chapter-level nav, or a book/chapter link). Previously
      // this only opened the chapter's verse list in the sidebar and left the
      // editor pane empty — the user landed on a blank screen and had to pick
      // a verse manually. Default to the chapter's first verse instead, same
      // as Reader does when it lands on a chapter with no ?verse=.
      openChapter(b, c).then(verses => {
        const firstVerse = verses && verses.length ? verses[0].verse : 1;
        loadVerse(b, c, firstVerse);
      });
    }
  }, [progress, slugToId, searchParams, openChapter, loadVerse]);

  // ── EDITOR ────────────────────────────────────────────────────────────────
  // Scrolls the active chapter's header into view in the left sidebar whenever
  // it changes — without this, opening (say) Psalm 91 via a deep link lands you
  // on the right verse in the editor while the chapter list, still scrolled to
  // the top, silently shows Ch 1. `block: 'nearest'` only moves the sidebar's
  // own scroll position, never the page.
  const activeChapterHeaderRef = useRef(null);
  useEffect(() => {
    if (activeChapterHeaderRef.current) {
      activeChapterHeaderRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeBook, activeChapter]);

  const editorRef = useRef(null);

  // ── live quote preview ──────────────────────────────────────────────────
  // Whole-book English text, fetched once per BOOK (mirrors Reader.jsx's own
  // bookQuoteScan fetch exactly, including the cross-chapter carry it feeds)
  // — gives the preview below real book-wide context instead of just
  // guessing at the current verse in isolation. Best-effort: on failure the
  // preview below just falls back to the active verse alone.
  const [bookTextForPreview, setBookTextForPreview] = useState(null);
  useEffect(() => {
    if (!activeBook) { setBookTextForPreview(null); return; }
    let cancelled = false;
    apiTransBookText(activeBook)
      .then(d => { if (!cancelled) setBookTextForPreview(d && d.chapters ? d : null); })
      .catch(() => { if (!cancelled) setBookTextForPreview(null); });
    return () => { cancelled = true; };
  }, [activeBook]);

  // The editor is deliberately NOT React-controlled (see the comment just
  // below) so the preview can't just read `verseData.text` while typing —
  // this mirrors it via onInput (added to the editor's JSX below) instead,
  // read-only, never written back into the DOM.
  const [livePreviewText, setLivePreviewText] = useState('');

  // When verse data arrives, set editor HTML once and focus it so the user can
  // start typing immediately. We sync manually instead of using React-controlled
  // contenteditable because the latter erases the caret on every keystroke.
  //
  // loadSeq (not just verse identity) is in the deps below: reset-to-published,
  // pull-latest, and a language switch all call loadVerse() for the SAME
  // book/chapter/verse, so verse-identity alone never changed and this effect
  // never re-ran — the contentEditable div kept showing whatever the user had
  // typed/pasted, and only a full page refresh (a fresh mount) actually cleared
  // it. loadSeq bumps on every real reload from the server, verse identity or
  // not, so "Reset to published" now updates the editor immediately.
  useEffect(() => {
    setLivePreviewText(verseData?.text || '');
    if (verseData && editorRef.current) {
      editorRef.current.innerHTML = verseData.rich_text || verseData.text || '';
      // Only autofocus when we're in edit mode — in view mode the user is
      // reading, not typing, and stealing focus jumps the scroll position.
      if (mode === 'edit') {
        editorRef.current.focus({ preventScroll: true });
        // Place caret at the end so typing appends naturally.
        const r = document.createRange();
        r.selectNodeContents(editorRef.current);
        r.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
      }
    }
    // mode is intentionally NOT in deps — we don't want to refocus on a mode flip
    // mid-edit. Refocus only happens when the verse identity changes or a fresh
    // load (loadSeq) lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verseData?.book_id, verseData?.chapter, verseData?.verse, loadSeq]);

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const saveVerse = useCallback(async (overrides = {}) => {
    if (!verseData) return;
    setSaveState('saving');
    const el = editorRef.current;
    const rich_text = el ? el.innerHTML : '';
    // Extract plain text from rich content
    const plainTmp = document.createElement('div');
    plainTmp.innerHTML = rich_text;
    const text = plainTmp.textContent || '';
    const status = overrides.status ?? verseData.status;
    try {
      // getAdminStatus() is cached for the life of the TAB and never re-checks
      // itself — if the server-side session expired since the tab was opened,
      // this cached value silently stays 'false' forever, and every save from
      // then on falls into the local-only branch below with IDENTICAL "Saved"
      // feedback as a real server save. fieldy, 2026-08-12: a real edit sat in
      // IndexedDB for hours looking saved while the server's row was untouched,
      // discovered only by querying translation.db directly. Force one fresh
      // check against the server before ever trusting a cached "not admin" —
      // covers the common case (session actually still valid, cache just
      // hadn't been told) without a full page reload.
      let { isAdmin: admin } = await getAdminStatus();
      if (!admin) {
        ({ isAdmin: admin } = await refreshAdminStatus());
      }
      if (admin) {
        await apiTransSaveVerse({ book_id: activeBook, chapter: activeChapter, verse: activeVerse, status, text, rich_text });
        // saveVerseWithHistory (server.js) just snapshotted the PRIOR version
        // into translation_history as a side effect of this save — but the
        // History panel only ever fetches on open (toggleHistory below), so
        // a save made while the panel is ALREADY open left it showing a
        // stale list with no sign the new version was recorded. Fieldy,
        // 2026-08-14: edited a verse with History open and the edit "is not
        // showing in the history" — the server-side row was written fine,
        // this was purely the panel never re-fetching after a save. Refresh
        // it in place whenever it's open so the just-created entry appears
        // immediately, same list the user is already looking at.
        if (historyOpen) {
          try {
            const d = await apiTransHistory(activeBook, activeChapter, activeVerse);
            setHistoryList(d.versions || []);
          } catch { /* non-fatal — history panel just stays stale until reopened */ }
        }
        // A real, hard-to-miss confirmation that the PUT actually landed —
        // previously the ONLY signal was the small "✓ Saved" badge next to
        // the verse reference up top, easy to miss if you're looking at the
        // editor or the History panel instead. 2026-08-16, fieldy: "this
        // doesn't actually save unless..." — traced live against the
        // production site and the PUT/persistence itself checked out fine
        // (fired, returned 200, survived a reload) on a plain single click,
        // so the missing piece looks like feedback, not persistence. A toast
        // here closes that ambiguity regardless of what the underlying cause
        // turns out to be.
        toast('Saved', 'ok');
      } else {
        // Genuinely not an admin in this browser, even after a fresh check.
        // Local-only: never reaches the server. Persisted in THIS browser
        // only. No lang here — the translation is shared across editions,
        // same as the server's own (book_id, chapter, verse) primary key.
        // This MUST be loud (long-lived, unmistakable toast) — a silent
        // fallback that looks identical to a real save is exactly what
        // caused the incident above.
        await saveLocalVerse(activeBook, activeChapter, activeVerse, { text, rich_text, status });
        setHasLocalEdits(true);
        toast('⚠ NOT saved to the server — you are not logged in as admin in this tab. Saved locally in THIS browser only and will not be visible anywhere else.', 'err', 9000);
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1400);
      // Update verse data + chapter map preview
      setVerseData(d => d ? { ...d, text, rich_text, status, local: !admin } : d);
      const key = `${activeBook}:${activeChapter}`;
      setOpenChapterMap(m => ({
        ...m,
        [key]: (m[key] || []).map(v =>
          v.verse === activeVerse
            ? { ...v, text, status }
            : v
        ),
      }));
    } catch (e) {
      setSaveState('error');
      toast('Save failed: ' + e.message, 'err');
    }
  }, [verseData, activeBook, activeChapter, activeVerse, toast, historyOpen]);

  // ── REVISION HISTORY ─────────────────────────────────────────────────────
  // Server-side saveVerseWithHistory snapshots the PRIOR version of a verse
  // automatically on every save (see server.js) — this panel just lists and
  // reverts to those snapshots. fieldy, 2026-08-12: "Keeping track of past
  // versions in the UI that I can revert to would solve a lot of problems."
  const toggleHistory = useCallback(async () => {
    if (historyOpen) { setHistoryOpen(false); return; }
    if (activeBook == null || activeChapter == null || activeVerse == null) return;
    setHistoryOpen(true);
    setHistoryBusy(true);
    try {
      const d = await apiTransHistory(activeBook, activeChapter, activeVerse);
      setHistoryList(d.versions || []);
    } catch (e) {
      toast('Could not load history: ' + e.message, 'err');
      setHistoryList([]);
    } finally {
      setHistoryBusy(false);
    }
  }, [historyOpen, activeBook, activeChapter, activeVerse, toast]);

  // Reverting is itself just another save (see the server route's own
  // comment) — it snapshots whatever it's replacing too, so this can never
  // destroy a version. Re-fetches history afterward so the panel reflects
  // the new timeline (the version you just reverted FROM is now itself in
  // the list) instead of showing stale entries.
  const revertToHistoryVersion = useCallback(async (historyId) => {
    if (activeBook == null || activeChapter == null || activeVerse == null) return;
    try {
      await apiTransRevertToHistory(activeBook, activeChapter, activeVerse, historyId);
      await loadVerse(activeBook, activeChapter, activeVerse, lang);
      const d = await apiTransHistory(activeBook, activeChapter, activeVerse);
      setHistoryList(d.versions || []);
      toast('Reverted to that version', 'ok');
    } catch (e) {
      toast('Revert failed: ' + e.message, 'err');
    }
  }, [activeBook, activeChapter, activeVerse, lang, loadVerse, toast]);

  // Unlike revert, this is genuinely destructive — no snapshot taken first —
  // so confirm before calling the server. fieldy, 2026-08-12: "id also like
  // the ability to delete."
  const deleteHistoryVersion = useCallback(async (historyId) => {
    if (activeBook == null || activeChapter == null || activeVerse == null) return;
    if (!confirm('Permanently delete this past version? This cannot be undone.')) return;
    try {
      await apiTransDeleteHistory(historyId, activeBook, activeChapter, activeVerse);
      setHistoryList(list => list.filter(v => v.id !== historyId));
      toast('Version deleted', 'ok');
    } catch (e) {
      toast('Delete failed: ' + e.message, 'err');
    }
  }, [activeBook, activeChapter, activeVerse, toast]);

  // Close the panel (don't refetch) whenever the open verse changes — a
  // stale history list from the PREVIOUS verse must never be shown attached
  // to a different one.
  useEffect(() => { setHistoryOpen(false); setHistoryList([]); }, [activeBook, activeChapter, activeVerse]);

  // Discard this browser's local edit for the CURRENT verse (text + status) and
  // reload straight from the server's published version. Local link overrides
  // for the verse are untouched — see resetLinksToPublished below for those.
  const resetVerseToPublished = useCallback(async () => {
    if (!verseData) return;
    await resetLocalVerse(activeBook, activeChapter, activeVerse);
    await loadVerse(activeBook, activeChapter, activeVerse, lang);
    toast('Reverted to the published verse', 'ok');
  }, [verseData, activeBook, activeChapter, activeVerse, lang, loadVerse, toast]);

  const resetLinksToPublished = useCallback(async () => {
    if (!verseData) return;
    // tokenSource, not lang — links are scoped by edition, see loadVerse.
    await resetLocalLinksOverride(activeBook, activeChapter, activeVerse, tokenSource);
    await loadVerse(activeBook, activeChapter, activeVerse, lang);
    toast('Links reverted to published', 'ok');
  }, [verseData, activeBook, activeChapter, activeVerse, lang, tokenSource, loadVerse, toast]);

  // Global "pull latest": discard every local override in this browser
  // (translations, links, lexicons — see localOverlay.js) and reload.
  const pullLatest = useCallback(async () => {
    if (!confirm('Discard ALL your local edits in this browser (translations, links, and any uploaded lexicon) and go back to what\'s published? This cannot be undone.')) return;
    await resetAllLocal();
    setHasLocalEdits(false);
    if (activeBook && activeChapter && activeVerse != null) await loadVerse(activeBook, activeChapter, activeVerse, lang);
    toast('Local edits discarded — showing the published version', 'ok');
  }, [activeBook, activeChapter, activeVerse, lang, loadVerse, toast]);

  // Ctrl/Cmd+S → save the current verse. Listens on the editor itself so this
  // only fires when the user is actually editing (won't fight the browser-level
  // save shortcut from elsewhere on the page). We capture the latest saveVerse
  // closure in a ref so the listener doesn't need to be re-bound on every
  // re-render (saveVerse is created fresh whenever any of its deps change).
  const saveVerseRef = useRef(saveVerse);
  useEffect(() => { saveVerseRef.current = saveVerse; }, [saveVerse]);
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !verseData) return;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveVerseRef.current?.();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [verseData?.book_id, verseData?.chapter, verseData?.verse]);

  // Live quote-nesting preview for the verse being edited — the SAME book-
  // wide scan Reader.jsx's own bookQuoteScan runs (parseQuoteMarks with
  // chapter boundaries, so a real quote character still resets per chapter
  // while an explicit <...> marker survives one, exactly as on the live
  // page), just built from bookTextForPreview + the active verse's LIVE
  // unsaved text instead of a fresh server fetch. Every OTHER verse (in this
  // chapter or any other) uses whatever bookTextForPreview last loaded — the
  // last SAVED text — since previewing everyone else's unsaved drafts too
  // isn't the point; only the verse actually being typed needs to be live.
  // Deliberately skips splitScriptureQuote (the embedded-citation system) —
  // a different, rarer feature; this preview only needs to get ordinary
  // quote nesting right, and treating an embedded citation as plain text
  // here doesn't affect that.
  const quotePreview = useMemo(() => {
    if (!activeBook || !activeChapter || !activeVerse) return null;
    const chapters = (bookTextForPreview?.chapters?.length)
      ? bookTextForPreview.chapters.slice().sort((a, b) => a.chapter - b.chapter)
      : [{ chapter: activeChapter, verses: [] }]; // not loaded yet — fall back to the active verse alone
    let acc = '';
    const boundaries = [];
    let activeRange = null;
    chapters.forEach(ch => {
      const isActiveChapter = ch.chapter === activeChapter;
      const chVerses = (ch.verses || []).map(v => v);
      if (isActiveChapter) {
        const idx = chVerses.findIndex(v => v.verse === activeVerse);
        if (idx >= 0) chVerses[idx] = { verse: activeVerse, text: livePreviewText };
        else { chVerses.push({ verse: activeVerse, text: livePreviewText }); chVerses.sort((a, b) => a.verse - b.verse); }
      }
      chVerses.forEach(v => {
        const raw = sanitizeText((v.text || '').trim());
        const start = acc.length;
        if (raw) acc += raw;
        if (isActiveChapter && v.verse === activeVerse) activeRange = { start, end: acc.length };
        acc += ' ';
      });
      acc += ' ';
      boundaries.push(acc.length);
    });
    if (!activeRange) return null;
    const tree = dissolveOverlongQuotes(parseQuoteMarks(acc, boundaries));
    const sliced = sliceQuoteTree(tree, activeRange.start, activeRange.end);
    const rendered = renderQuoteTree(sliced, 'both', 'qp-');
    return rendered && rendered.length ? rendered : null;
  }, [activeBook, activeChapter, activeVerse, bookTextForPreview, livePreviewText]);

  const setStatus = useCallback(async (newStatus) => {
    saveVerse({ status: newStatus });
  }, [saveVerse]);

  // ── LINKER ────────────────────────────────────────────────────────────────
  const enWords = useMemo(
    () => (verseData?.text || '').trim().split(/\s+/).filter(Boolean),
    [verseData?.text]
  );

  const tokens = verseData?.tokens || [];
  const links  = verseData?.links  || [];

  const lForEn  = idx => links.find(l => l.english_indices?.includes(idx));
  const lForOrd = ord => links.find(l => l.token_ordinals?.includes(ord));

  // Hebrew selection key parser. Whole-token keys are numbers; component keys
  // are "<ordinal>:<compIdx>" strings.
  const parseHebKey = (key) => {
    if (typeof key === 'string' && key.includes(':')) {
      const [ord, idx] = key.split(':');
      return { ordinal: +ord, compIdx: +idx };
    }
    return { ordinal: +key, compIdx: null };
  };

  // Conflict detection — any existing link that shares an English index OR
  // a token ordinal with the new selection. Mirrors the original logic.
  const findConflicts = (enIdxs, hebKeys) => {
    const enSet = new Set(enIdxs);
    const ordSet = new Set(hebKeys.map(k => parseHebKey(k).ordinal));
    return links.filter(l =>
      l.english_indices?.some(i => enSet.has(i)) ||
      l.token_ordinals?.some(o => ordSet.has(o))
    );
  };

  // Union: delete all conflicting links and recreate one merged link. Admins
  // do this against the server, exactly as before; non-admins do the identical
  // fold against this browser's local link override (see localOverlay.js).
  const unionLinks = async (conflicts, newEnIdxs, newOrdinals, phrase) => {
    const allEn = [...new Set([...conflicts.flatMap(l => l.english_indices || []), ...newEnIdxs])].sort((a, b) => a - b);
    const allOrd = [...new Set([...conflicts.flatMap(l => l.token_ordinals || []), ...newOrdinals])].sort((a, b) => a - b);
    // Pick the lowest-id conflict as the survivor (keep its id for history)
    const keep = conflicts.reduce((a, b) => a.id < b.id ? a : b);
    const toDelete = conflicts.filter(l => l.id !== keep.id);
    const merged = {
      english_phrase: allEn.map(i => enWords[i]).filter(Boolean).join(' '),
      english_indices: allEn,
      token_ordinals: allOrd,
    };
    const { isAdmin: admin } = await getAdminStatus();
    if (admin) {
      // Delete the losers
      for (const l of toDelete) {
        try { await apiTransUnlink({ id: l.id, book_id: activeBook, chapter: activeChapter, verse: activeVerse }); }
        catch { /* keep going — one failed delete shouldn't block the union */ }
      }
      // Update the survivor with the unioned set.
      // book_id / chapter / verse are REQUIRED by PUT /api/translate/link/:id —
      // it 400s without them (server.js: "book_id, chapter, verse required").
      // Omitting them meant every attempt to add a word to an EXISTING link
      // failed, while creating a brand-new link worked, since apiTransLink sends
      // the full payload. Same three fields apiTransUnlink already passes above.
      await apiTransUpdateLink({ id: keep.id, book_id: activeBook, chapter: activeChapter, verse: activeVerse, ...merged });
    } else {
      // Same fold, expressed as one whole-list write to the local override —
      // drop the losers, patch the survivor — so it's a single atomic write
      // instead of N separate local calls.
      const deleteIds = new Set(toDelete.map(l => l.id));
      const next = links.filter(l => !deleteIds.has(l.id)).map(l => l.id === keep.id ? { ...l, ...merged } : l);
      // tokenSource, not lang — links are scoped by edition, see loadVerse.
      await setLocalLinksOverride(activeBook, activeChapter, activeVerse, tokenSource, next);
      setHasLocalEdits(true);
    }
  };

  const toggleEnSel = idx => {
    setSelEn(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  };
  const toggleHebSel = key => {
    setSelHeb(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const performLinkAction = useCallback(async () => {
    if (!selEn.size || !selHeb.size) return;
    const { isAdmin: admin } = await getAdminStatus();
    const enIdxs = [...selEn].sort((a, b) => a - b);
    const hebKeys = [...selHeb];
    const hebOrdinals = [...new Set(hebKeys.map(k => parseHebKey(k).ordinal))];
    const phrase = enIdxs.map(i => enWords[i]).filter(Boolean).join(' ');

    const conflicts = findConflicts(enIdxs, hebKeys);
    if (conflicts.length > 0) {
      // Build the union preview for the confirm dialog
      const existingEn  = [...new Set(conflicts.flatMap(l => l.english_indices))].sort((a, b) => a - b).map(i => enWords[i]).filter(Boolean);
      const newEn       = enIdxs.map(i => enWords[i]).filter(Boolean);
      const allEnLabels = [...new Set([...existingEn, ...newEn])];
      const existingOrd = [...new Set(conflicts.flatMap(l => l.token_ordinals))].sort((a, b) => a - b);
      const allOrdinals = [...new Set([...existingOrd, ...hebOrdinals])].sort((a, b) => a - b);
      const hebLabels = allOrdinals.map(o => tokens.find(t => t.token_ordinal === o)?.word_raw || `ord:${o}`);
      const msg = `This overlaps with ${conflicts.length} existing link(s).\n\nUnion result:\nEnglish: ${allEnLabels.join(', ')}\nHebrew: ${hebLabels.join(' ')}\n\nMerge into one link?`;
      if (!confirm(msg)) {
        setSelEn(new Set()); setSelHeb(new Set());
        return;
      }
      try {
        await unionLinks(conflicts, enIdxs, hebOrdinals, phrase);
        await loadVerse(activeBook, activeChapter, activeVerse);
        setSelEn(new Set()); setSelHeb(new Set());
        toast('Links merged', 'ok');
      } catch (e) { toast('Merge failed: ' + e.message, 'err'); }
      return;
    }

    // No conflicts — insert one link per hebKey (component links carry component_hint)
    try {
      const errors = [];
      for (const key of hebKeys) {
        const { ordinal, compIdx } = parseHebKey(key);
        let component_hint = '';
        if (compIdx !== null) {
          const tok = tokens.find(t => t.token_ordinal === ordinal);
          const comp = tok?.components?.[compIdx];
          if (!comp) { errors.push(`Component not found: ${key}`); continue; }
          component_hint = `${compIdx}:${comp.css}`;
        }
        // tokenSource, NOT `lang` — see loadVerse. The ordinals in this link
        // address the tokens the server actually served, so the link must be
        // tagged with that edition or the reader will never find it. Same rule
        // applies to the local-only path.
        const payload = {
          book_id: activeBook, chapter: activeChapter, verse: activeVerse,
          lang: tokenSource,
          english_phrase: phrase, english_indices: enIdxs,
          token_ordinals: [ordinal], component_hint,
          color_index: 0, sort_order: links.length,
        };
        try {
          if (admin) await apiTransLink(payload);
          else { await addLocalLink(activeBook, activeChapter, activeVerse, tokenSource, payload, links); setHasLocalEdits(true); }
        } catch (e) { errors.push(e.message); }
      }
      await loadVerse(activeBook, activeChapter, activeVerse);
      setSelEn(new Set()); setSelHeb(new Set());
      if (errors.length) toast('Link errors: ' + errors.join('; '), 'err');
      else toast('Linked', 'ok');
    } catch (e) { toast('Link failed: ' + e.message, 'err'); }
  }, [selEn, selHeb, enWords, activeBook, activeChapter, activeVerse, tokenSource, tokens, links, loadVerse, toast]);

  // ── AUTO-LINK ────────────────────────────────────────────────────────────
  // Runs runAutoLinkForVerse (module-level, above) against THIS component's
  // already-loaded tokens/links/enWords for the currently selected edition —
  // Hebrew or any other source, both are handled by the same shared matcher
  // now (see buildAutoLinkCandidates: Hebrew reads token.components, every
  // other language reads token.gloss, i.e. its lexicon value). Fieldy,
  // 2026-08-16: "since the other languages use hebrew lexicon words in their
  // values, the other language linking should be trivial too."
  const autoLinkVerse = useCallback(async () => {
    // Must key off `lang` (the SELECTED source language — GEZ, GRC, LAT, SYR,
    // BHS, whatever the dropdown currently shows), never `tokenSource`. Those
    // are different things: `tokenSource` is what /api/translate/verse always
    // reports for the HEBREW paleo/Established-Links panel (BHS for OT books,
    // HEB for NT — see server.js's tokenSource comment), constant regardless
    // of the language picker. Passing it here as `langId` used to force
    // buildAutoLinkCandidates's `isBHSLang` branch TRUE for every language —
    // so a non-Hebrew verse's tokens (which carry `.gloss`, not `.components`)
    // hit `comps.find(c => c.css === 'root')` on tokens with no `components`
    // at all, found nothing, and silently produced zero candidates every
    // time. Found 2026-08-17 chasing "Link This Language did nothing for
    // Ge'ez" even after the lexicon carried a correct Raashayath/Aratz
    // translit — Sync All (syncAllLinks below) never had this bug, since it
    // already passes each loop's own `l.id`, not the shared tokenSource.
    const { isAdmin: admin } = await getAdminStatus();
    const { created, matched, errors } = await runAutoLinkForVerse(
      activeBook, activeChapter, activeVerse, lang, tokens, links, enWords, admin
    );
    if (!matched) { toast('No new transliteration matches — everything matchable is already linked', 'ok'); return; }
    if (!admin && created > 0) setHasLocalEdits(true);
    await loadVerse(activeBook, activeChapter, activeVerse);
    if (errors.length) toast(`Auto-linked ${created}, ${errors.length} failed (${errors[0]})`, 'err');
    else toast(`Auto-linked ${created} word${created === 1 ? '' : 's'} by transliteration match — spot-check before trusting`, 'ok');
  }, [tokens, enWords, links, activeBook, activeChapter, activeVerse, lang, loadVerse, toast]);

  // ── SYNC ALL ─────────────────────────────────────────────────────────────
  // Runs Auto-Link across EVERY language this verse has (the same `langs`
  // list the language picker offers), not just whichever one is currently
  // selected — one click instead of switching languages and clicking
  // Auto-Link N times. Fieldy, 2026-08-16: "i dont mind going through each
  // language and syncing but im confident we can do a sync all with how
  // bulletproof the matches have been so far." Each language gets its own
  // independent fetch (fetchLangTokensAndLinks) rather than reusing this
  // component's `tokens`/`links` state, because that state only ever holds
  // ONE language at a time and switching it mid-loop would race React's
  // async state updates (see that function's header comment).
  const syncAllLinks = useCallback(async () => {
    if (!activeBook || !activeChapter || activeVerse == null || !langs.length) return;
    if (!confirm(`Run Auto-Link across all ${langs.length} language${langs.length === 1 ? '' : 's'} for this verse?`)) return;
    let totalCreated = 0;
    const issues = [];
    for (const l of langs) {
      try {
        const { tokens: t, links: lk, enWords: ew, admin } =
          await fetchLangTokensAndLinks(activeBook, activeChapter, activeVerse, l.id);
        const { created, errors } = await runAutoLinkForVerse(activeBook, activeChapter, activeVerse, l.id, t, lk, ew, admin);
        totalCreated += created;
        if (!admin && created > 0) setHasLocalEdits(true);
        if (errors.length) issues.push(`${l.label || l.id}: ${errors[0]}`);
      } catch (e) { issues.push(`${l.label || l.id}: ${e.message}`); }
    }
    await loadVerse(activeBook, activeChapter, activeVerse);
    if (!totalCreated && !issues.length) toast('No new matches in any language — everything matchable is already linked', 'ok');
    else if (issues.length) toast(`Synced ${totalCreated} across ${langs.length} languages, ${issues.length} issue(s) (${issues[0]})`, 'err');
    else toast(`Synced ${totalCreated} link${totalCreated === 1 ? '' : 's'} across ${langs.length} languages — spot-check before trusting`, 'ok');
  }, [langs, activeBook, activeChapter, activeVerse, loadVerse, toast]);

  // Switch the source language we're linking against and reload that language's
  // tokens + its own link set. The English translation is untouched.
  const changeLang = useCallback((nextLang) => {
    if (nextLang === lang) return;
    setLang(nextLang);
    setSelEn(new Set()); setSelHeb(new Set());
    if (activeBook && activeChapter && activeVerse != null) loadVerse(activeBook, activeChapter, activeVerse, nextLang);
  }, [lang, activeBook, activeChapter, activeVerse, loadVerse]);

  const deleteLink = useCallback(async (linkId) => {
    if (!confirm('Delete this link?')) return;
    try {
      const { isAdmin: admin } = await getAdminStatus();
      if (admin) {
        await apiTransUnlink({ id: linkId, book_id: activeBook, chapter: activeChapter, verse: activeVerse });
      } else {
        // Seeds the local override from whatever's currently on screen (server's
        // list, or this browser's own earlier local edits) minus the deleted link.
        // Keyed by `lang` (the selected source language), not `tokenSource` —
        // same mixup as autoLinkVerse above; tokenSource is constant (BHS/HEB)
        // regardless of which language's links are on screen, so this used to
        // write every non-admin delete into the BHS local-overlay bucket no
        // matter which language you were actually clearing.
        await deleteLocalLink(activeBook, activeChapter, activeVerse, lang, linkId, links);
        setHasLocalEdits(true);
      }
      await loadVerse(activeBook, activeChapter, activeVerse);
    } catch (e) { toast('Delete failed: ' + e.message, 'err'); }
  }, [activeBook, activeChapter, activeVerse, lang, links, loadVerse, toast]);

  // Bulk "Clear All" for this verse's Word Links — a quick way to wipe out a
  // batch of Auto-Link mismatches (or start a verse's links over) without
  // clicking every individual ✕. Fieldy, 2026-08-16: "I need a way to quickly
  // remove all links." One confirm covering the whole batch, not one per link.
  const deleteAllLinks = useCallback(async () => {
    if (!links.length) return;
    if (!confirm(`Delete all ${links.length} link${links.length === 1 ? '' : 's'} for this verse?`)) return;
    try {
      const { isAdmin: admin } = await getAdminStatus();
      if (admin) {
        await Promise.all(links.map(l =>
          apiTransUnlink({ id: l.id, book_id: activeBook, chapter: activeChapter, verse: activeVerse })
        ));
      } else {
        // One write instead of N — clearLocalLinks sets the whole local
        // override straight to [], same mechanism deleteLink's single-id
        // path uses per-link, just without the intermediate read/filter
        // steps that would otherwise happen N times in a row.
        await clearLocalLinks(activeBook, activeChapter, activeVerse, lang);
        setHasLocalEdits(true);
      }
      await loadVerse(activeBook, activeChapter, activeVerse);
      toast(`Deleted ${links.length} link${links.length === 1 ? '' : 's'}`, 'ok');
    } catch (e) { toast('Delete all failed: ' + e.message, 'err'); }
  }, [links, activeBook, activeChapter, activeVerse, lang, loadVerse, toast]);

  // Same idea as deleteAllLinks, but for EVERY language this verse has, not
  // just the one on screen — the clear-side counterpart to Sync All /
  // syncAllLinks below. Fieldy, 2026-08-16, after Auto-Link needed a few
  // retries to get Greek right: "I need a 'link this language' 'clear this
  // language' 'link all languages' 'clear all languages' button... I was
  // expecting to be able to purge all links and retry." Each language gets
  // its own independent fetch (fetchLangTokensAndLinks), same reasoning as
  // syncAllLinks: this component's `links` state only ever holds ONE
  // language at a time.
  const clearAllLanguagesLinks = useCallback(async () => {
    if (!activeBook || !activeChapter || activeVerse == null || !langs.length) return;
    if (!confirm(`Delete ALL links in EVERY language (${langs.length}) for this verse?`)) return;
    let totalDeleted = 0;
    const issues = [];
    for (const l of langs) {
      try {
        const { links: lk, admin } = await fetchLangTokensAndLinks(activeBook, activeChapter, activeVerse, l.id);
        if (!lk.length) continue;
        if (admin) {
          await Promise.all(lk.map(link =>
            apiTransUnlink({ id: link.id, book_id: activeBook, chapter: activeChapter, verse: activeVerse })
          ));
        } else {
          await clearLocalLinks(activeBook, activeChapter, activeVerse, l.id);
          setHasLocalEdits(true);
        }
        totalDeleted += lk.length;
      } catch (e) { issues.push(`${l.label || l.id}: ${e.message}`); }
    }
    await loadVerse(activeBook, activeChapter, activeVerse);
    if (!totalDeleted && !issues.length) { toast('No links to clear in any language', 'ok'); return; }
    if (issues.length) toast(`Cleared ${totalDeleted} across ${langs.length} languages, ${issues.length} issue(s) (${issues[0]})`, 'err');
    else toast(`Cleared ${totalDeleted} link${totalDeleted === 1 ? '' : 's'} across ${langs.length} languages`, 'ok');
  }, [langs, activeBook, activeChapter, activeVerse, loadVerse, toast]);

  // ── CHAPTER VIEW (read-only overlay) ──────────────────────────────────────
  // Fetches the whole chapter at once and renders each translated verse with
  // English + Paleo side-by-side. Useful for proofreading a chapter end-to-end
  // without the editor controls cluttering the page.
  const openChapterView = useCallback(async () => {
    if (!activeBook || !activeChapter) return;
    setChvData(null);
    setChvOpen(true);
    try {
      const [chData, parsedTokens] = await Promise.all([
        apiTransChapter(activeBook, activeChapter),
        apiTokens(activeBook, activeChapter).catch(() => []),
      ]);
      const parsedByKey = {};
      for (const pt of parsedTokens || []) {
        if (pt.verse != null && pt.token_ordinal != null) {
          parsedByKey[`${pt.verse}:${pt.token_ordinal}`] = pt;
        }
      }
      // Fetch each verse's full detail (text + links + tokens). One request per
      // verse is N+1 but the chapter view is on-demand so latency is acceptable
      // for now; this could be batched into a /api/translate/chapter-full later.
      const details = await Promise.all((chData.verses || []).map(v =>
        apiTransVerse(activeBook, activeChapter, v.verse)
      ));
      // Merge parsed components into each verse's tokens
      const merged = details.filter(Boolean).map(vd => {
        const verseNum = vd.verse;
        const tokens = (vd.tokens || []).map(t => {
          const p = parsedByKey[`${verseNum}:${t.token_ordinal}`];
          if (p?.components?.length) return { ...t, components: p.components };
          return t;
        });
        const links = hydrateLinks(vd.links || []);
        return { ...vd, tokens, links };
      });
      setChvData(merged);
    } catch (e) { toast('Chapter view failed: ' + e.message, 'err'); }
  }, [activeBook, activeChapter, toast]);

  // ── OVERVIEW (corpus-wide progress) ──────────────────────────────────────
  // Re-pulls progress (in case translations elsewhere bumped counts) and
  // surfaces the per-book breakdown in a modal.
  const openOverview = useCallback(async () => {
    try {
      const p = await apiTransProgress();
      setProgress(p);
      setOvOpen(true);
    } catch (e) { toast('Overview load failed: ' + e.message, 'err'); }
  }, [toast]);

  // Total counts derived from progress, for the overview header
  const overallTotals = useMemo(() => {
    const bs = progress?.books || [];
    const total = bs.reduce((s, b) => s + (b.total || 0), 0);
    const done  = bs.reduce((s, b) => s + (b.done  || 0), 0);
    const ip    = bs.reduce((s, b) => s + (b.in_progress || 0), 0);
    return { total, done, ip, pct: total ? Math.round(done / total * 100) : 0 };
  }, [progress]);

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="tr-shell">
      <header className="tr-topbar">
        <Link to="/landing" className="tr-logo" aria-label="Home">𐤀𐤁</Link>
        <h1 className="tr-title">Translation Studio</h1>
        {isAdmin === false && (
          <span className="tr-txt-btn" style={{ cursor: 'default', opacity: 0.85 }}
                title="You're not logged in as admin — edits here save only in this browser and are never published.">
            📍 Local editing
          </span>
        )}
        <span className="tr-spacer" />
        {isAdmin === false && hasLocalEdits && (
          <button className="tr-txt-btn" onClick={pullLatest} title="Discard everything you've changed locally and go back to what's published">
            ↺ Pull latest
          </button>
        )}
        <button className="tr-txt-btn" onClick={openOverview}>📊 Overview</button>
        {activeBook && activeChapter && (
          <button className="tr-txt-btn" onClick={openChapterView}>📖 Chapter</button>
        )}
        {activeBook && activeChapter && activeVerse != null && (
          // Carry the Studio's currently-selected source language through, so
          // "Parallel →" opens showing the SAME language you were just
          // looking at instead of resetting to Hebrew (BHS) every time.
          // Fieldy, 2026-08-17: "I was in tstudio... looking at 'latin'...
          // when I navigate to 'parallel'... I should be seeing latin
          // source. I had to navigate there myself." `lang` here is already
          // the same source-id vocabulary Parallel's own picker uses (both
          // ultimately come from the same SOURCES config), so no translation
          // needed — just pass it straight through.
          <Link to={parallelHref(activeBook, idToSlug, activeChapter, activeVerse, lang)}
                className="tr-txt-btn">Parallel →</Link>
        )}
        {activeBook && activeChapter && activeVerse != null && (
          <Link to={`/bible?book=${bookToParam(activeBook, idToSlug)}&chapter=${activeChapter}&verse=${activeVerse}`}
                className="tr-txt-btn" title="Open this passage in the Reader — flowing prose, no Strong's">📗 Reader →</Link>
        )}
        {/* Gloss Studio takes a plain numeric book id (its own URL scheme,
            see GlossStudio.jsx — it never adopted the slug convention
            Parallel/Reader use), not bookToParam's slug. */}
        {activeBook && activeChapter && activeVerse != null && (
          <Link to={`/gloss-studio?book=${activeBook}&chapter=${activeChapter}&verse=${activeVerse}`}
                className="tr-txt-btn" title="Open this verse in Gloss Studio">📚 Gloss Studio →</Link>
        )}
        <button className="tr-icon-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <div className={`tr-app ${navCollapsed ? 'nav-collapsed' : ''}`}>
        {/* Mobile-only context bar: keeps the current book/chapter/verse visible
            while the pickers are collapsed, and toggles them back open. */}
        <div className="tr-mobile-ctx">
          <button className="tr-mobile-ctx-btn" onClick={() => setNavCollapsed(c => !c)}>
            <span className="tr-mobile-ctx-icon">{navCollapsed ? '☰' : '✕'}</span>
            <span className="tr-mobile-ctx-label">
              {activeBookData?.name || 'Choose a book'}
              {activeChapter ? ` ${activeChapter}` : ''}{activeVerse != null ? `:${activeVerse}` : ''}
            </span>
            <span className="tr-mobile-ctx-hint">{navCollapsed ? 'Browse' : 'Hide'}</span>
          </button>
        </div>

        {/* BOOK PANE */}
        <aside className="tr-book-pane">
          <div className="tr-pane-header">Books</div>
          {books.map(b => {
            const pct = b.total ? Math.round(b.done / b.total * 100) : 0;
            const ip  = b.total ? Math.round(b.in_progress / b.total * 100) : 0;
            const fc  = pct === 100 ? 'done' : (pct > 0 || ip > 0) ? 'mixed' : '';
            return (
              <button key={b.book_id}
                className={`tr-book-item ${activeBook === b.book_id ? 'active' : ''}`}
                onClick={() => selectBook(b.book_id)}>
                <span className="tr-book-name">{b.name}</span>
                <span className="tr-mini-bar"><span className={`tr-mini-fill ${fc}`} style={{ width: (pct + ip) + '%' }} /></span>
                <span className="tr-book-pct">{pct}%</span>
              </button>
            );
          })}
        </aside>

        {/* CHAPTER PANE */}
        <aside className="tr-chapter-pane">
          <div className="tr-pane-header">
            <div className="tr-chapter-title">{activeBookData?.name || '—'}</div>
            {activeBookData && (
              <div className="tr-chapter-progress">
                {activeBookData.done}/{activeBookData.total} done ({activeBookData.total ? Math.round(activeBookData.done/activeBookData.total*100) : 0}%)
              </div>
            )}
          </div>
          <div className="tr-chapter-list">
            {(activeBookData?.chapters || []).map(ch => {
              const key = `${activeBook}:${ch.chapter}`;
              const isOpen = key in openChapterMap && activeChapter === ch.chapter;
              const verses = openChapterMap[key] || [];
              const pct = ch.total ? Math.round(ch.done / ch.total * 100) : 0;
              return (
                <div key={ch.chapter} className="tr-chapter-group">
                  <button
                    ref={ch.chapter === activeChapter ? activeChapterHeaderRef : null}
                    className={`tr-chapter-header ${isOpen ? 'open' : ''}`}
                    onClick={() => isOpen ? setActiveChapter(null) : openChapter(activeBook, ch.chapter)}>
                    <span className="tr-chevron">▶</span>
                    <span className="tr-chapter-label">Ch {ch.chapter}</span>
                    <span className="tr-chapter-stat">{ch.done}/{ch.total} · {pct}%</span>
                  </button>
                  {isOpen && (
                    <div className="tr-verse-list">
                      {verses.length === 0 ? <div className="tr-loading">Loading…</div> :
                        verses.map(v => (
                          <button
                            key={v.verse}
                            className={`tr-verse-row ${activeVerse === v.verse ? 'active' : ''}`}
                            onClick={() => loadVerse(activeBook, ch.chapter, v.verse)}>
                            <span className="tr-verse-num">{v.verse}</span>
                            <span className={`tr-status-dot ${v.status || 'none'}`} />
                            <span className="tr-verse-preview">{v.text ? v.text.slice(0, 34) : '—'}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* EDITOR PANE */}
        <main className="tr-editor-pane">
          {!verseData ? (
            <div className="tr-editor-empty">
              <div className="tr-big-glyph">𐤀𐤁𐤂</div>
              <p>Select a verse from the chapter list to start editing.</p>
            </div>
          ) : (
            <div className="tr-editor-content">
              <div className="tr-verse-ref-bar">
                <span className="tr-verse-ref-label">
                  {activeBookData?.name} {activeChapter}:{activeVerse}
                </span>
                <select
                  className={`tr-status-select ${verseData.status || 'none'}`}
                  value={verseData.status || 'none'}
                  onChange={e => setStatus(e.target.value)}>
                  <option value="none">— not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
                <span className="tr-save-status">
                  {saveState === 'saving' && 'Saving…'}
                  {saveState === 'saved'  && (verseData.local ? '✓ Saved locally' : '✓ Saved')}
                  {saveState === 'error'  && '⚠ Error'}
                </span>
                {isAdmin === false && (verseData.local || verseData.localLinks) && (
                  <button
                    className="tr-txt-btn"
                    style={{ marginLeft: 'auto' }}
                    onClick={verseData.local ? resetVerseToPublished : resetLinksToPublished}
                    title={verseData.local
                      ? "Discard your local edit for this verse's text and go back to what's published"
                      : "Discard your local edit for this verse's links and go back to what's published"}>
                    ↺ Reset to published
                  </button>
                )}
              </div>

              {/* Mode tabs */}
              <div className="tr-mode-tabs">
                <button className={`tr-mode-tab ${mode === 'edit' ? 'active' : ''}`}
                        onClick={() => setMode('edit')}>✏️ Edit</button>
                <button className={`tr-mode-tab ${mode === 'view' ? 'active' : ''}`}
                        onClick={() => setMode('view')}>👁 View</button>
              </div>

              {/* Source-language picker — filtered to languages that contain this
                  verse. The English translation is shared; switching language
                  shows that language's tokens and its own link set. */}
              {langs.length > 1 && (
                <div className="tr-lang-picker">
                  <span className="tr-lang-label">Source language</span>
                  <select className="tr-lang-select" value={lang} onChange={e => changeLang(e.target.value)}>
                    {langs.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
              )}

              {/* ─── EDIT MODE ───────────────────────────────────────────── */}
              {mode === 'edit' && (
                <>
                  <section className="tr-paleo-viewer">
                    <div className="tr-section-label">{isBHS ? 'Paleo Source' : `${langMeta.label || lang} Source`}</div>
                    <div className="tr-paleo-tokens" dir={langMeta.dir}>
                      {isBHS
                        // Same component Parallel and the Hebrew Viewer render
                        // with (components/WordBlock.jsx) — not a page-local
                        // reimplementation — so this panel is guaranteed to
                        // look and behave identically to both: boxed glyphs,
                        // translit+gloss underneath, Strong's/surf badges, and
                        // the maqaf-compound split handling (al-ha'aretz-style
                        // two-part construct chains) for free.
                        ? tokens.map(t => (
                            <WordBlock key={t.token_ordinal} wordObj={t} showSub showCopyBtn showStrongs />
                          ))
                        : tokens.map(t => (
                            <div key={t.token_ordinal} className="tr-src-block" dir={langMeta.dir}>
                              <span className="tr-src-word">{t.word_raw || '·'}</span>
                              {t.gloss ? <span className="tr-src-gloss">{t.gloss}</span> : null}
                            </div>
                          ))}
                    </div>
                  </section>

                  <section className="tr-translation-section">
                    <div className="tr-section-label">Translation</div>
                    <div className="tr-rt-toolbar">
                      {/* mousedown + preventDefault on toolbar buttons preserves the
                          selection in the contenteditable so the execCommand applies
                          to where the user was working, not to nothing. Same pattern
                          everywhere a button changes the active text run. */}
                      <button className="tr-tb-btn" title="Bold (Ctrl+B)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('bold'); }}><b>B</b></button>
                      <button className="tr-tb-btn" title="Italic (Ctrl+I)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('italic'); }}><i>I</i></button>
                      <button className="tr-tb-btn" title="Underline (Ctrl+U)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('underline'); }}><u>U</u></button>
                      <span className="tr-tb-sep" />
                      {/* Text color — native picker. Apply via execCommand foreColor
                          so only the current selection (or caret point) is colored. */}
                      <label className="tr-tb-color" title="Text color">
                        <span>A</span>
                        <input type="color"
                               onMouseDown={e => e.preventDefault() /* keep selection alive */}
                               onChange={e => {
                                 document.execCommand('styleWithCSS', false, true);
                                 document.execCommand('foreColor', false, e.target.value);
                               }} />
                      </label>
                      {/* Highlight (background) color */}
                      <label className="tr-tb-color tr-tb-hl" title="Highlight">
                        <span>H</span>
                        <input type="color"
                               onMouseDown={e => e.preventDefault()}
                               onChange={e => {
                                 document.execCommand('styleWithCSS', false, true);
                                 // hiliteColor is the modern name; backColor is the old IE
                                 // fallback. We try both — whichever the browser supports.
                                 if (!document.execCommand('hiliteColor', false, e.target.value)) {
                                   document.execCommand('backColor', false, e.target.value);
                                 }
                               }} />
                      </label>
                      <span className="tr-tb-sep" />
                      <button className="tr-tb-btn" title="Insert em-dash"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('insertText', false, '—'); }}>—</button>
                      <span className="tr-tb-sep" />
                      <button className="tr-tb-btn" title="Indent (Tab)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('indent'); }}>⇥</button>
                      <button className="tr-tb-btn" title="Outdent (Shift+Tab)"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('outdent'); }}>⇤</button>
                      <span className="tr-tb-sep" />
                      <button className="tr-tb-btn" title="Clear formatting"
                              onMouseDown={e => { e.preventDefault(); document.execCommand('removeFormat'); }}>×<sub style={{ fontSize: 8 }}>fmt</sub></button>
                    </div>
                    <div
                      ref={editorRef}
                      className="tr-translation-text"
                      contentEditable
                      suppressContentEditableWarning
                      data-placeholder="Type the translation…"
                      onKeyDown={e => {
                        // Tab / Shift+Tab → indent / outdent (don't move focus)
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          document.execCommand(e.shiftKey ? 'outdent' : 'indent');
                          return;
                        }
                        // Alahayam / Yahawah → auto-insert the empty "()"
                        // gloss placeholder as soon as the word is finished.
                        maybeAutoInsertGlossParens(e);
                      }}
                      onPaste={e => {
                        // Always paste as plain text, matching whatever's
                        // already typed here — regardless of source. Without
                        // this, anything copied with its OWN styling (a
                        // transliteration's bold/colored spans from the Paleo
                        // Source panel above, a snippet from Word, a colored
                        // span from another site) drops in carrying that
                        // formatting, landing visibly mismatched next to
                        // plain surrounding text. The browser's default paste
                        // reads the clipboard's rich-HTML flavor; reading its
                        // text/plain flavor and inserting THAT instead is
                        // what "match destination formatting" actually means.
                        e.preventDefault();
                        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                        document.execCommand('insertText', false, text);
                      }}
                      onInput={() => setLivePreviewText(editorRef.current?.textContent || '')}
                    />
                    {quotePreview && (
                      <div className="tr-quote-preview">
                        <div className="tr-quote-preview-label">Quote preview</div>
                        <div className="rd-body tr-quote-preview-body">{quotePreview}</div>
                      </div>
                    )}
                    <div className="tr-save-row">
                      <button className="tr-save-btn" onClick={() => saveVerse()} disabled={saveState === 'saving'}>
                        {saveState === 'saving' ? 'Saving…' : 'Save'}
                      </button>
                      <button className="tr-history-btn" onClick={toggleHistory} title="View and revert to past versions of this verse">
                        {historyOpen ? 'History ▾' : 'History ▸'}
                      </button>
                    </div>

                    {historyOpen && (
                      <div className="tr-history-panel">
                        {historyBusy && <div className="tr-history-loading">Loading history…</div>}
                        {!historyBusy && historyList.length === 0 && (
                          <div className="tr-history-empty">No past versions yet — history is recorded starting from your next save.</div>
                        )}
                        {!historyBusy && historyList.map(v => (
                          <div key={v.id} className="tr-history-item">
                            <div className="tr-history-meta">
                              <span className="tr-history-time">{v.saved_at}</span>
                              <span className={`tr-history-status tr-history-status-${v.status || 'none'}`}>{v.status || 'none'}</span>
                              <button className="tr-history-restore" onClick={() => revertToHistoryVersion(v.id)}>Restore this version</button>
                              <button className="tr-history-delete" onClick={() => deleteHistoryVersion(v.id)} title="Permanently delete this version">🗑</button>
                            </div>
                            <div className="tr-history-text">{v.text || <em>(empty)</em>}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Linker grid */}
                  {(verseData.text || '').trim() && (
                    <section
                      className="tr-linker-section"
                      onKeyDown={e => {
                        // Enter inside the linker grid → trigger Link action.
                        // Default browser behavior would re-fire the focused
                        // chip's onClick (because the chip is a <button>),
                        // which toggles the most recent selection back OFF.
                        // We intercept BEFORE that fires by handling onKeyDown
                        // at the section level and stopping propagation.
                        //
                        // We still allow Space to toggle individual chips
                        // (the standard a11y pattern for buttons). Only Enter
                        // is reinterpreted as "commit the link".
                        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                          if (selEn.size && selHeb.size) {
                            e.preventDefault();
                            e.stopPropagation();
                            performLinkAction();
                          } else {
                            // Both sides not selected — prevent the chip toggle
                            // so Enter is a no-op instead of an "unselect" surprise.
                            e.preventDefault();
                          }
                        }
                      }}
                    >
                      <div className="tr-section-label">
                        Word Links
                        <span className="tr-section-label-btns">
                          <button
                            type="button"
                            className="tr-autolink-btn"
                            onClick={autoLinkVerse}
                            title={isBHS
                              ? "Match every unlinked English gloss word against the Hebrew root it transliterates, and link them automatically. Safe to re-run — already-linked words are skipped. Spot-check the result afterward."
                              : `Match every unlinked English gloss word against this edition's own lexicon transliteration, and link them automatically. Safe to re-run — already-linked words are skipped. Spot-check the result afterward.`}
                          >
                            🔗 Link This Language
                          </button>
                          <button
                            type="button"
                            className="tr-autolink-btn tr-syncall-btn"
                            onClick={syncAllLinks}
                            title="Run Auto-Link across every language this verse has, not just the one currently selected."
                          >
                            ⇄ Link All Languages
                          </button>
                          <button
                            type="button"
                            className="tr-clearall-btn"
                            onClick={deleteAllLinks}
                            title="Delete every link for this verse in the CURRENTLY SELECTED language only."
                          >
                            Clear This Language
                          </button>
                          <button
                            type="button"
                            className="tr-clearall-btn"
                            onClick={clearAllLanguagesLinks}
                            title="Delete every link for this verse in EVERY language — useful before a fresh Link All Languages retry."
                          >
                            Clear All Languages
                          </button>
                        </span>
                      </div>
                      <div className="tr-linker-grid">
                        {/* English column (LTR) */}
                        <div className="tr-en-tokens">
                          <div className="tr-col-header">English →</div>
                          {enWords.map((word, idx) => {
                            const link = lForEn(idx);
                            const color = link ? lColorForTokens(link, tokens) : null;
                            const isSel = selEn.has(idx);
                            const isHl  = link && hoveredLinkId === link.id;
                            return (
                              <button
                                key={idx}
                                className={`tr-en-chip ${isSel ? 'sel' : ''} ${isHl ? 'hl' : ''}`}
                                style={color && !isSel ? { borderColor: color + '88', background: color + '16' } : null}
                                onMouseEnter={() => link && setHoveredLinkId(link.id)}
                                onMouseLeave={() => setHoveredLinkId(null)}
                                onClick={() => toggleEnSel(idx)}>
                                <span>{word}</span>
                                {link && link.token_ordinals.length > 1 && (
                                  <span className="tr-en-badge" style={{ color, background: color + '30' }}>
                                    {link.token_ordinals.length}tok
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {/* Center action column */}
                        <div className="tr-linker-mid">
                          <button
                            className="tr-link-action"
                            disabled={!selEn.size || !selHeb.size}
                            onClick={performLinkAction}>
                            ⇄ Link
                          </button>
                          <div className="tr-link-info">
                            {selEn.size && selHeb.size
                              ? `${selEn.size} eng · ${selHeb.size} heb`
                              : selEn.size ? `${selEn.size} english\nselected`
                              : selHeb.size ? `${selHeb.size} hebrew\nselected`
                              : 'Select tokens\non both sides'}
                          </div>
                        </div>
                        {/* Hebrew column — whole-token chips + component sub-chips for non-root parts */}
                        <div className="tr-heb-tokens">
                          <div className="tr-col-header">{isBHS ? '← Hebrew' : (langMeta.label || lang)}</div>
                          {!isBHS ? (
                            tokens.map(t => {
                              const link  = lForOrd(t.token_ordinal);
                              const color = link ? lColorForTokens(link, tokens) : null;
                              const isSel = selHeb.has(t.token_ordinal);
                              const isHl  = link && hoveredLinkId === link.id;
                              return (
                                <div key={t.token_ordinal}>
                                  <button
                                    className={`tr-heb-chip ${isSel ? 'sel' : ''} ${isHl ? 'hl' : ''}`}
                                    style={color && !isSel ? { borderColor: color + '88', background: color + '16' } : null}
                                    dir={langMeta.dir}
                                    onMouseEnter={() => link && setHoveredLinkId(link.id)}
                                    onMouseLeave={() => setHoveredLinkId(null)}
                                    onClick={() => toggleHebSel(t.token_ordinal)}>
                                    <span className="tr-src-word" dir={langMeta.dir}>{t.word_raw || '·'}</span>
                                    {t.gloss ? <span className="tr-heb-trans">{t.gloss}</span> : null}
                                  </button>
                                </div>
                              );
                            })
                          ) : tokens.map(t => {
                            const comps = t.components?.length ? t.components : [{ paleo: t.word_raw || '', css: 'root' }];
                            // Component sub-chips first (prefixes/modifiers/suffixes), then the whole-token chip
                            const subChips = comps
                              .map((c, i) => ({ ...c, i }))
                              .filter(c => c.css !== 'root' && c.paleo)
                              .map(c => {
                                const key = `${t.token_ordinal}:${c.i}`;
                                const color = partColor(c.css);
                                const isSel = selHeb.has(key);
                                return (
                                  <button
                                    key={key}
                                    className={`tr-heb-chip tr-heb-comp-chip ${isSel ? 'sel' : ''}`}
                                    style={{ borderColor: isSel ? null : 'var(--border2)', borderStyle: 'dashed' }}
                                    onClick={() => toggleHebSel(key)}>
                                    <span className="tr-heb-glyph"
                                          style={{ color }}
                                          dangerouslySetInnerHTML={{ __html: paleoToSVG(c.paleo, '16px') }} />
                                    <span className="tr-heb-trans" style={{ color }}>
                                      [{c.css}] {c.translation || ''}
                                    </span>
                                  </button>
                                );
                              });
                            const link = lForOrd(t.token_ordinal);
                            const color = link ? lColorForTokens(link, tokens) : null;
                            const isSel = selHeb.has(t.token_ordinal);
                            const isHl  = link && hoveredLinkId === link.id;
                            // Build the whole-token glyph row with per-component colors
                            const glyphHtml = comps.map(c =>
                              `<span style="color:${partColor(c.css)}">${paleoToSVG(c.paleo, '20px')}</span>`
                            ).join('');
                            return (
                              <div key={t.token_ordinal}>
                                {subChips}
                                <button
                                  className={`tr-heb-chip ${isSel ? 'sel' : ''} ${isHl ? 'hl' : ''}`}
                                  style={color && !isSel ? { borderColor: color + '88', background: color + '16' } : null}
                                  onMouseEnter={() => link && setHoveredLinkId(link.id)}
                                  onMouseLeave={() => setHoveredLinkId(null)}
                                  onClick={() => toggleHebSel(t.token_ordinal)}>
                                  <span className="tr-heb-glyph"
                                        style={{ direction: 'rtl' }}
                                        dangerouslySetInnerHTML={{ __html: glyphHtml || (t.word_raw || '·') }} />
                                  <span className="tr-heb-trans">{tokenTrans(t)}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Existing links */}
                      {links.length > 0 && (
                        <div className="tr-links-list">
                          <div className="tr-section-label">
                            Established links ({links.length})
                          </div>
                          {links.map(l => {
                            const color = lColorForTokens(l, tokens);
                            const isHl  = hoveredLinkId === l.id;
                            const enText = l.english_indices.map(i => enWords[i]).filter(Boolean).join(' ');
                            const hebText = l.token_ordinals
                              .map(o => tokens.find(t => t.token_ordinal === o)?.word_raw || '')
                              .filter(Boolean).join(' ');
                            return (
                              <div key={l.id}
                                   className={`tr-elink-row ${isHl ? 'hl' : ''}`}
                                   style={{ borderColor: color + '60' }}
                                   onMouseEnter={() => setHoveredLinkId(l.id)}
                                   onMouseLeave={() => setHoveredLinkId(null)}>
                                <span className="tr-elink-en" style={{ color }}>{enText}</span>
                                <span className="tr-elink-arrow">⇄</span>
                                {isBHS
                                  ? <span className="tr-elink-heb"
                                          dangerouslySetInnerHTML={{ __html: paleoToSVG(hebText, '18px') }} />
                                  : <span className="tr-elink-heb" dir={langMeta.dir}>{hebText}</span>}
                                <button className="tr-elink-del" onClick={() => deleteLink(l.id)} title="Delete">✕</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}

              {/* ─── VIEW MODE ───────────────────────────────────────────── */}
              {mode === 'view' && (
                <section className="tr-view-mode">
                  <div className="tr-vlayout-btns">
                    <button className={`tr-vlayout-btn ${viewLayout === 'side' ? 'active' : ''}`}
                            onClick={() => setViewLayout('side')}>Side by Side</button>
                    <button className={`tr-vlayout-btn ${viewLayout === 'english' ? 'active' : ''}`}
                            onClick={() => setViewLayout('english')}>English Only</button>
                  </div>
                  {viewLayout === 'side' ? (
                    <div className="tr-vs-grid">
                      <div>
                        <div className="tr-vs-col-label">Your Translation <span className="tr-vs-badge">LTR →</span></div>
                        <ViewEnglishWords
                          enWords={enWords}
                          lForEn={lForEn}
                          hoveredLinkId={hoveredLinkId}
                          setHoveredLinkId={setHoveredLinkId}
                          richHtml={verseData.rich_text}
                          hebTokens={tokens}
                        />
                      </div>
                      <div>
                        <div className="tr-vs-col-label" style={{ direction: 'rtl', justifyContent: 'flex-end' }}>
                          <span className="tr-vs-badge">← RTL</span> Paleo-Hebrew
                        </div>
                        <div className="tr-vs-heb">
                          {tokens.filter(t => t.components?.length || t.word_raw).map(t => {
                            const link = lForOrd(t.token_ordinal);
                            const isHl = link && hoveredLinkId === link.id;
                            const color = link ? lColorForTokens(link, tokens) : null;
                            const comps = t.components?.length ? t.components : [{ paleo: t.word_raw, css: 'root' }];
                            const glyphHtml = comps.map(c =>
                              `<span style="color:${partColor(c.css)}">${paleoToSVG(c.paleo, '24px')}</span>`
                            ).join('');
                            return (
                              <span
                                key={t.token_ordinal}
                                className={`tr-vs-heb-blk ${link ? 'lnk' : ''} ${isHl ? 'hl' : ''}`}
                                style={color && !isHl ? { borderColor: color + '55' } : null}
                                onMouseEnter={() => link && setHoveredLinkId(link.id)}
                                onMouseLeave={() => setHoveredLinkId(null)}
                                dangerouslySetInnerHTML={{ __html: glyphHtml }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="tr-vs-col-label">Your Translation <span className="tr-vs-badge">LTR →</span></div>
                      <div className="tr-ven-text">
                        <ViewEnglishWords
                          enWords={enWords}
                          lForEn={lForEn}
                          hoveredLinkId={hoveredLinkId}
                          setHoveredLinkId={setHoveredLinkId}
                          richHtml={verseData.rich_text}
                          hebTokens={tokens}
                        />
                      </div>
                    </>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>

      {/* CHAPTER VIEW OVERLAY ── full-chapter read-only proofread view ─── */}
      {chvOpen && (
        <div className="tr-chv-overlay" onClick={() => setChvOpen(false)}>
          <div className="tr-chv-inner" onClick={e => e.stopPropagation()}>
            <div className="tr-chv-topbar">
              <div className="tr-chv-title">
                {activeBookData?.name} — Chapter {activeChapter}
              </div>
              <div className="tr-vlayout-btns">
                <button className={`tr-vlayout-btn ${chvLayout === 'side' ? 'active' : ''}`}
                        onClick={() => setChvLayout('side')}>Side by Side</button>
                <button className={`tr-vlayout-btn ${chvLayout === 'english' ? 'active' : ''}`}
                        onClick={() => setChvLayout('english')}>English Only</button>
              </div>
              <button className="tr-txt-btn" onClick={() => setChvOpen(false)}>✕ Close</button>
            </div>
            <div className="tr-chv-verses">
              {!chvData ? <div className="tr-loading">Loading chapter…</div> :
                chvData.map(vd => <ChvVerseBlock key={vd.verse} vd={vd} layout={chvLayout} />)
              }
            </div>
          </div>
        </div>
      )}

      {/* OVERVIEW OVERLAY ── corpus-wide translation progress ─────────────── */}
      {ovOpen && (
        <div className="tr-ov-overlay" onClick={() => setOvOpen(false)}>
          <div className="tr-ov-panel" onClick={e => e.stopPropagation()}>
            <h2>Translation Progress</h2>
            <div className="tr-ov-summary">
              {overallTotals.done} of {overallTotals.total} translated ({overallTotals.pct}%) ·{' '}
              {overallTotals.ip} in progress
            </div>
            <div className="tr-ov-books">
              {(progress?.books || []).map(b => {
                const bp = b.total ? (b.done / b.total) * 100 : 0;
                const ipp = b.total ? (b.in_progress / b.total) * 100 : 0;
                return (
                  <div key={b.book_id} className="tr-ov-row">
                    <div className="tr-ov-name">{b.name}</div>
                    <div className="tr-ov-bar">
                      <div className="tr-ov-done" style={{ width: bp + '%' }} />
                      <div className="tr-ov-ip"   style={{ left: bp + '%', width: ipp + '%' }} />
                    </div>
                    <div className="tr-ov-pct">{Math.round(bp)}%</div>
                  </div>
                );
              })}
            </div>
            <button className="tr-txt-btn" onClick={() => setOvOpen(false)} style={{ alignSelf: 'flex-end' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chapter-view verse block ───────────────────────────────────────────────
function ChvVerseBlock({ vd, layout }) {
  const text = (vd.text || '').trim();
  if (!text) {
    return (
      <div className="tr-chv-verse">
        <div className="tr-chv-vref"><span>v.{vd.verse}</span></div>
        <div className="tr-chv-empty">Not yet translated</div>
      </div>
    );
  }
  const enWords = text.split(/\s+/);
  const links = vd.links || [];
  const lForEn  = idx => links.find(l => l.english_indices?.includes(idx));
  const lForOrd = ord => links.find(l => l.token_ordinals?.includes(ord));
  const [hoveredLinkId, setHoveredLinkId] = useState(null);

  return (
    <div className="tr-chv-verse">
      <div className="tr-chv-vref">
        <span>v.{vd.verse}</span>
        <div className={`tr-status-dot ${vd.status || 'none'}`} />
      </div>
      <div className="tr-chv-en">
        {enWords.map((w, i) => {
          const link = lForEn(i);
          const isHl = link && hoveredLinkId === link.id;
          return (
            <span key={i}
                  className={`tr-chv-en-w ${link ? 'lnk' : ''} ${isHl ? 'hl' : ''}`}
                  onMouseEnter={() => link && setHoveredLinkId(link.id)}
                  onMouseLeave={() => setHoveredLinkId(null)}>
              {w}{' '}
            </span>
          );
        })}
      </div>
      {layout === 'side' && (
        <div className="tr-chv-heb">
          {(vd.tokens || []).filter(t => t.components?.length || t.word_raw).map(t => {
            const link = lForOrd(t.token_ordinal);
            const isHl = link && hoveredLinkId === link.id;
            const comps = t.components?.length ? t.components : [{ paleo: t.word_raw, css: 'root' }];
            const glyphHtml = comps.map(c =>
              `<span style="color:${partColor(c.css)}">${paleoToSVG(c.paleo, '22px')}</span>`
            ).join('');
            return (
              <span key={t.token_ordinal}
                    className={`tr-chv-heb-chip ${link ? 'lnk' : ''} ${isHl ? 'hl' : ''}`}
                    onMouseEnter={() => link && setHoveredLinkId(link.id)}
                    onMouseLeave={() => setHoveredLinkId(null)}
                    dangerouslySetInnerHTML={{ __html: glyphHtml }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── View-mode English renderer ──────────────────────────────────────────────
// Walks the rich HTML and wraps each word in a hoverable span that carries
// its English index. Falls back to plain whitespace-split words when there's
// no rich content. Each linked word gets the link's color and a hover handler
// that broadcasts hover state up to the parent for cross-column highlighting.
function ViewEnglishWords({ enWords, lForEn, hoveredLinkId, setHoveredLinkId, richHtml, hebTokens }) {
  // Build a flat array of "tokens" — either { text } (whitespace) or { word, idx }
  // (a real English word). We do this once via useMemo whenever the rich HTML or
  // word list changes, so React can render the spans declaratively.
  const tokens = useMemo(() => {
    if (richHtml && richHtml.trim()) {
      // Parse the rich HTML, walk text nodes, emit word-tokens with index.
      // Wrap each word in our own marker; preserve interspersed inline tags
      // by replacing text nodes with span sequences inside the same parent.
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${richHtml}</div>`, 'text/html');
      const root = doc.querySelector('div');
      const out = [];
      let idx = 0;
      const walk = (node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 3) { // text
            const parts = child.textContent.split(/(\s+)/);
            for (const p of parts) {
              if (!p) continue;
              if (/^\s+$/.test(p)) out.push({ kind: 'ws', text: p });
              else                 out.push({ kind: 'word', text: p, idx: idx++ });
            }
          } else if (child.nodeType === 1) {
            // For inline tags (b/i/u/span), emit an open marker, recurse, close.
            // We don't preserve nested attributes here — the visual styling for
            // rich text is provided by the editor on save; view-mode focuses on
            // word linkage.
            walk(child);
          }
        }
      };
      walk(root);
      if (!out.length) {
        return enWords.map((w, i) => ({ kind: 'word', text: w, idx: i }));
      }
      return out;
    }
    return enWords.map((w, i) => ({ kind: 'word', text: w, idx: i }));
  }, [richHtml, enWords]);

  return (
    <div className="tr-ven-words">
      {tokens.map((t, i) => {
        if (t.kind === 'ws') return <span key={i}>{t.text}</span>;
        const link = lForEn(t.idx);
        const color = link ? lColorForTokens(link, hebTokens) : null;
        const isHl = link && hoveredLinkId === link.id;
        return (
          <span
            key={i}
            className={`tr-ven-w ${link ? 'lnk' : ''} ${isHl ? 'hl' : ''}`}
            data-idx={t.idx}
            style={color && !isHl ? { color, borderBottomColor: color + '60' } : null}
            onMouseEnter={() => link && setHoveredLinkId(link.id)}
            onMouseLeave={() => setHoveredLinkId(null)}
          >{t.text}</span>
        );
      })}
    </div>
  );
}
