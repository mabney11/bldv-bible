// modform-lib.mjs — the reading text's MODIFICATION FORMS (fieldy, 2026-10-01).
//
// "I wonder if we can introduce modifications into my translated texts so my translated
//  text would get 'NaAyashahayam (Woman [emphatic plural]) .. NaAkal (we will eat)
//  lachamanaw (our own bread)' — perhaps the existing filler text can be shifted into
//  their corresponding modification glosses … BaYawam (In that day), Yahawah tzamach
//  (branch) LaTzabay (will be beautiful) … lets do this from Gen 3 onward throughout the
//  corpus. I like that my chapters 1 and 2 ease readers into this Hebrew oriented bible."
// His choice when asked: the gloss is the English phrase, with a [label] only for a
// modification no English word in it expresses; his saved verses are MERGED (his wording
// kept, the word upgraded, small variations allowed).
//
// THIS REPLACES, from Genesis 3 on, the 2026-07-27 rule "reading text = bare Strong's
// root" (CLAUDE.md "Two display surfaces"). Genesis 1-2 keep the bare-root form.
//
// A WORD here is what the Parallel chips draw as one block: the token's components, with
// BHS's separate proclitic rows (𐤅 𐤁 𐤋 𐤊 𐤌 𐤄 𐤔, H9000-H9009) folded into the next word.
// Its FORM is the block transliterated as one word (final-letter rule), capital at every
// morpheme boundary before the root, suffixes lowercase — the chip spelling
// (NaAyashahayam, BaYawam, Lachamanaw).
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let CHAR_MAP = null;
export async function loadCharMap() {
  if (CHAR_MAP) return CHAR_MAP;
  const p = ['../src/lib/books.js', './vendor/books.js', './src/lib/books.js'].map(x => path.join(__dirname, x)).find(existsSync);
  if (!p) throw new Error('modform-lib: books.js not found');
  CHAR_MAP = (await import(pathToFileURL(p).href)).CHAR_MAP;
  return CHAR_MAP;
}

/** Genesis 1-2 keep the bare-root reading text (fieldy's on-ramp). */
export const modformApplies = (canon, chapter) => !(Number(canon) === 1 && Number(chapter) <= 2);

const PROCLITIC_SN = /^H900\d$/;
const SUFFIX_CSS = ['nme-', 'prs-', 'vbe-', 'uvf-', 'mod-suff-unk', 'mod-dbl'];
const isSuffixCss = css => SUFFIX_CSS.some(p => (css || '').startsWith(p));
const isRootCss = css => css === 'root' || css === 'mod-nmpr';

/** Transliterate a block as one word and case it per morpheme (server.js
 *  transliterateBlock + caseComponentTranslits, same rules). */
export function formOf(comps) {
  const letters = comps.reduce((n, c) => n + [...(c.paleo || '')].length, 0);
  let k = 0;
  const parts = comps.map(c => {
    let t = '';
    for (const ch of c.paleo || '') {
      const m = CHAR_MAP[ch];
      t += m ? (k === letters - 1 ? m.fin : m.med) : '';
      k++;
    }
    return t;
  });
  const rootIdx = comps.findIndex(c => isRootCss(c.css));
  return parts.map((t, i) => {
    if (!t) return '';
    const suf = isSuffixCss(comps[i].css) && (rootIdx < 0 || i > rootIdx);
    return suf ? t.toLowerCase() : t.charAt(0).toUpperCase() + t.slice(1);
  }).join('');
}

// ── English that EXPRESSES a modification ──────────────────────────────────────
const W = s => new Set(s.split(/\s+/));
const PREP = {
  '𐤁': W('in into with by at among on upon through within when against inside'),
  '𐤋': W('to for into unto toward towards of at belongs belonging'),
  '𐤌': W('from out than of away since because off'),
  '𐤊': W('as like according when about just such'),
  '𐤔': W('that which who whom whose what'),
};
const CONJ = W('and but then so now yet or also even');
const ART = W('the this that these those o');
const PRS = {
  '1cs': W('my me mine myself'), '1cp': W('our us ours ourselves'),
  '2ms': W('your you yours yourself thee thy thine'), '2fs': W('your you yours yourself thee thy thine'),
  '2mp': W('your you yours yourselves ye'), '2fp': W('your you yours yourselves ye'),
  '3ms': W('his him its it himself itself'), '3fs': W('her hers its it herself itself'),
  '3mp': W('their them theirs themselves'), '3fp': W('their them theirs themselves'),
};
const SUBJ = { '1cs': W('i'), '1cp': W('we us let'), '2': W('you thou ye'), '3ms': W('he it'), '3fs': W('she it'), '3': W('he she it they') };
const AUX = W('will shall would should may might must be is are was were been being have has had do does did let can could');
const BETWEEN = W('the a an that this these those own to of');
const IRREG_PL = W('men women children people feet teeth oxen sheep cattle brethren kine mice geese lice');
const isPluralEng = ws => ws.some(w => IRREG_PL.has(w) || (w.length > 3 && /s$/.test(w) && !/(ss|us|is|ous)$/.test(w)));

/** What one modification is, for the purposes of the reading text. */
function modInfo(c, source) {
  const css = c.css || '', p = c.paleo || '';
  if (css === 'mod-conj') return { kind: 'pre', eng: CONJ, label: 'and' };
  if (css === 'mod-art') return { kind: 'pre', eng: ART, label: 'the' };
  if (css === 'mod-prep' && PREP[p]) return { kind: 'pre', eng: PREP[p], label: (c.translation || '').replace(/[\[\]]/g, '').split('/')[0] || p, inf: p === '𐤋' };
  if (css.startsWith('pfm-') && css !== 'pfm-ptcp') { const pr = css.slice(4);
    return { kind: 'subj', eng: SUBJ[pr] || SUBJ[pr[0]] || SUBJ['3'], label: null }; }
  if (css.startsWith('vbe-')) return { kind: 'subj-suf', eng: SUBJ[css.slice(4)] || SUBJ[css.slice(4, 5)] || W('they'), label: null };
  if (css.startsWith('prs-')) { const pr = css.slice(4);
    const lab = { '1cs': 'My', '1cp': 'Our', '2ms': 'Your', '2fs': 'Your', '2mp': 'Your (pl)', '2fp': 'Your (pl)', '3ms': 'His', '3fs': 'Her', '3mp': 'Their', '3fp': 'Their' }[pr];
    // the HEB edition (NT/Apocrypha) has no morphology: a final yod is parsed as "my", but
    // it is as often the construct plural (עֲנִיֵּי "the poor of", Matthew 5:3) — never print
    // a [My] the text cannot vouch for
    const guess = source && source !== 'BHS' && pr === '1cs';
    return { kind: 'suf', eng: PRS[pr] || W(''), label: guess ? null : (lab || null), pron: true }; }
  if (css === 'uvf-conn') return { kind: 'any', eng: W(''), label: 'Emphatic' };
  if (css === 'uvf-dir') return { kind: 'suf', eng: W('to toward towards into unto'), label: 'Toward' };
  if (css.startsWith('nme-') && /Plural/i.test(c.translation || '')) return { kind: 'plural', eng: null, label: 'Plural' };
  return null;   // gender, construct, stems, participle: not glossed (English never carries them)
}

/** The Hebrew WORDS of one verse, in order, from surface-index.db. */
export function verseWordsLoader(sdb) {
  const st = sdb.prepare(`SELECT o.token_ordinal ord, o.word_raw, o.strongs sn, o.pos, t.components
      FROM surface_occurrences o LEFT JOIN token_surfaces t ON t.source = o.source AND t.word_raw = o.word_raw
           AND t.strongs = o.strongs AND t.pos = o.pos AND t.morph = o.morph
      WHERE o.source = ? AND o.book_id = ? AND o.chapter = ? AND o.verse = ? ORDER BY o.token_ordinal`);
  return (source, b, c, v) => {
    const words = []; let pending = [];
    for (const r of st.all(source, b, c, v)) {
      let comps; try { comps = JSON.parse(r.components || '[]'); } catch { comps = []; }
      comps = comps.filter(x => x && x.paleo);
      if (!comps.length) continue;                                  // punctuation / maqaf
      const single = [...(r.word_raw || '')].length === 1;
      // a preposition carrying its own pronoun (בּוֹ "in him", לִי "to me", לָהֶם "to them") is a
      // WORD of its own — only a bare letter is a proclitic of the next word
      if (PROCLITIC_SN.test(r.sn || '') && single && comps.length === 1 && /^(prep|conj|art)$/.test(r.pos || '')) { pending.push(...comps); continue; }
      const all = [...pending, ...comps]; pending = [];
      const root = all.find(x => isRootCss(x.css)) || all[all.length - 1];
      words.push({ pos: r.pos || '', ord: r.ord, sn: r.sn ? 'H' + String(r.sn).replace(/^H+/i, '') : '', comps: all, form: formOf(all),
                   rootTr: formOf([{ ...root, css: 'root' }]).toLowerCase(), isName: root.css === 'mod-nmpr',
                   mods: all.filter(x => x !== root).map(x => modInfo(x, source)).filter(Boolean) });
    }
    return words;
  };
}

const engWords = s => (String(s).toLowerCase().match(/[a-z']+/g) || []);
/** "Form (english [Label·Label])" — a label only for a modification the English lacks. */
export function pairFor(word, english) { const p = pairParts(word, english); return renderPair(p); }
export const renderPair = p => `${p.form} (${p.english}${p.labels.length ? ' [' + p.labels.join('·') + ']' : ''})`;
/** The same, as parts — apply-web-strongs expands a pair back into plain English for the
 *  WEB quote restorer and folds it again afterwards. */
export function pairParts(word, english) {
  const ws = engWords(english);
  const has = set => set && ws.some(w => set.has(w));
  const labels = [];
  for (const m of word.mods) {
    if (!m.label) continue;
    if (m.kind === 'plural') { if (!isPluralEng(ws)) labels.push(m.label); continue; }
    // 𐤋 on a verb is the infinitive marker ("LaAmar", saying) — English never needs it marked
    if (m.inf) continue;   // 𐤋 reads to/for/of/infinitive/"become" by context — never forced into a label
    if (m.kind === 'any' || !has(m.eng)) labels.push(m.label);
  }
  return { form: word.form, english, labels };
}

/** English words to the LEFT of a pair that this word's modifications account for:
 *  "in that day", "and the fruit", "our own bread", "we will eat". Returns how many
 *  words (counting back from the pair) to absorb. Never crosses punctuation, quotes or
 *  another gloss. */
export function absorbLeftCount(prevTokens, word) {
  const isVerb = word.mods.some(m => m.kind === 'subj' || m.kind === 'subj-suf');
  const triggers = word.mods.filter(m => m.kind === 'pre' || m.kind === 'suf' || m.kind === 'subj');
  let best = 0;
  for (let n = 1; n <= Math.min(5, prevTokens.length); n++) {
    const tok = prevTokens[prevTokens.length - n];
    const opener = /^["“‘(]+[A-Za-z]/.test(tok);            // “We — the word counts, the quote stays outside
    const raw = opener ? tok.replace(/^["“‘(]+/, '') : tok;
    if (/[^A-Za-z'’-]/.test(raw)) break;                     // punctuation, a gloss: a boundary
    const w = raw.toLowerCase().replace(/[^a-z']/g, '');
    if (!w) break;
    const trig = triggers.some(m => m.eng && m.eng.has(w));
    if (trig) { best = n; if (opener) break; continue; }
    if (opener) break;
    if (BETWEEN.has(w) || (isVerb && AUX.has(w))) continue;
    break;
  }
  return best;
}

/** Object pronoun right after a verb with a pronoun suffix ("struck him"). 0 or 1. */
export function absorbRightCount(nextTokens, word) {
  if (!nextTokens.length || !word.mods.some(m => m.pron)) return 0;
  const raw = nextTokens[0]; const w = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!/^[A-Za-z]+[,.;:!?]?$/.test(raw)) return 0;
  return word.mods.some(m => m.pron && m.eng.has(w)) && /^(him|her|them|me|us|you|it|thee)$/.test(w) ? 1 : 0;
}

/** Upgrade every "word (gloss)" in a verse's text whose word is one of this verse's
 *  Hebrew roots: the word becomes the full form, the gloss absorbs the English its
 *  modifications account for. Names are left as they are. Returns { text, n }. */
export function mergeModforms(text, words) {
  if (!text || !words.length) return { text, n: 0 };
  const PAIR = /\b([A-Za-z][A-Za-z'’-]*)\s+\(([^()]{1,80})\)/g;
  const used = new Set();
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const hits = [];
  const depthAt = i => { let d = 0; for (let k = 0; k < i; k++) { if (text[k] === '(') d++; else if (text[k] === ')' && d) d--; } return d; };
  for (const m of text.matchAll(PAIR)) {
    if (depthAt(m.index)) continue;                    // a pair inside another gloss: "Ahayah (I hayah (come to pass))"
    const w = norm(m[1]);
    if (!w || m[1].includes('-')) continue;
    const done = words.find(x => !used.has(x) && norm(x.form) === w && x.mods.length);
    if (done) { used.add(done); continue; }                                  // already a full form — and that word is taken
    const cands = words.filter(x => !used.has(x) && !x.isName && x.rootTr === w);
    if (!cands.length) continue;
    const word = cands[0]; used.add(word);
    if (!word.mods.length) continue;                                          // nothing to add — keep as is
    hits.push({ m, word });
  }
  if (!hits.length) return { text, n: 0 };
  let out = text;
  for (const { m, word } of hits.reverse()) {
    const start = m.index, end = m.index + m[0].length;
    const before = out.slice(0, start), after = out.slice(end);
    const prevTokens = before.split(/\s+/).filter(Boolean);
    const take = absorbLeftCount(prevTokens, word);
    const nextTokens = after.split(/\s+/).filter(Boolean);
    const takeR = absorbRightCount(nextTokens, word);
    const leftWords = take ? prevTokens.slice(-take) : [];
    let head = before, quote = '';
    if (take) {
      const re = new RegExp(`(?:\\S+\\s+){${take}}$`); head = before.replace(re, '');
      const q = leftWords[0].match(/^["“‘(]+/); if (q) { quote = q[0]; leftWords[0] = leftWords[0].slice(q[0].length); }
    }
    let tail = after, rightWord = '';
    if (takeR) { const mm = after.match(/^\s+([A-Za-z]+)([,.;:!?]?)/); rightWord = mm[1]; tail = (mm[2] || '') + after.slice(mm[0].length); }
    // sentence-initial capital moves to the form, the gloss keeps its own words
    const english = [...leftWords, m[2], rightWord].filter(Boolean).join(' ');
    out = head + quote + pairFor(word, english) + tail;
  }
  return { text: out, n: hits.length };
}
