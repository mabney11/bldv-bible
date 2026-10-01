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
import { existsSync, readFileSync } from 'node:fs';
const NAME_ENG = new Set(), NAME_TR = new Set(), NAME_BY_TR = new Map();
/** A name's English (word-map.json, apply-web-strongs' own list): "dawad" -> "David". */
export const isNameTr = tr => NAME_TR.has(String(tr || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''));
export const nameEnglish = tr => NAME_BY_TR.get(String(tr || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')) || '';
let ROOTS = {};
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let CHAR_MAP = null;
export async function loadCharMap() {
  if (CHAR_MAP) return CHAR_MAP;
  const p = ['../src/lib/books.js', './vendor/books.js', './src/lib/books.js'].map(x => path.join(__dirname, x)).find(existsSync);
  if (!p) throw new Error('modform-lib: books.js not found');
  CHAR_MAP = (await import(pathToFileURL(p).href)).CHAR_MAP;
  // NAMES are never merged (Josephus "Yawasap (Joseph)" became "WaYaYawasap (and Joseph)"
  // — the HEB word carried no name tag, and the name gate then saw a bare "Joseph").
  // word-map.json is apply-web-strongs' own list of every name it rendered.
  try {
    const wm = JSON.parse(readFileSync(path.join(__dirname, 'word-map.json'), 'utf8'));
    for (const k of ['names', 'peoples', 'divine']) for (const [eng, tr] of Object.entries(wm[k] || {})) {
      NAME_ENG.add(String(eng).toLowerCase()); const n = String(tr).toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''); NAME_TR.add(n);
      if (k !== 'divine' && !NAME_BY_TR.has(n) && /^[A-Za-z]/.test(eng) && !/[’']s$/.test(eng)) NAME_BY_TR.set(n, String(eng).replace(/^./, c => c.toUpperCase()));
    }
  } catch { /* no word-map.json: names are still skipped when the HEB word is tagged mod-nmpr */ }
  // each Strong's number's root, the spelling the render's "word (gloss)" pairs are written in
  // (render-corpus glosses by Strong's root: "yalad (begat)" stands for HEB הוֹלִיד, whose
  // own root block reads differently) — so a pair finds its word by either spelling
  try { ROOTS = JSON.parse(readFileSync(path.join(__dirname, 'lexicon', 'strongs-roots.json'), 'utf8')); } catch { ROOTS = {}; }
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
const PREP_TR = { '𐤁': 'Ba', '𐤋': 'La', '𐤌': 'Ma', '𐤊': 'Ka', '𐤔': 'Sha' };
export const PREP_EN = () => PREP;
export const PRS_EN = () => PRS;
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
  if (css === 'mod-prep' && PREP[p]) {
    // the chip's own word, unless it is a placeholder (𐤔 "[𐤔]"): then the letter's sense
    let lab = (c.translation || '').replace(/[\[\]]/g, '').split('/')[0].trim();
    if (!lab || /[\u{10900}-\u{10915}]/u.test(lab)) lab = { '𐤔': 'who', '𐤁': 'in', '𐤋': 'to', '𐤌': 'from', '𐤊': 'as' }[p] || '';
    return { kind: 'pre', eng: PREP[p], label: lab || null, inf: p === '𐤋' };
  }
  if (css.startsWith('pfm-') && css !== 'pfm-ptcp') { const pr = css.slice(4);
    return { kind: 'subj', eng: SUBJ[pr] || SUBJ[pr[0]] || SUBJ['3'], label: null }; }
  if (css.startsWith('vbe-')) return { kind: 'subj-suf', eng: SUBJ[css.slice(4)] || SUBJ[css.slice(4, 5)] || W('they'), label: null };
  if (css.startsWith('prs-')) { const pr = css.slice(4);
    const lab = { '1cs': 'My', '1cp': 'Our', '2ms': 'Your', '2fs': 'Your', '2mp': 'Your (pl)', '2fp': 'Your (pl)', '3ms': 'His', '3fs': 'Her', '3mp': 'Their', '3fp': 'Their' }[pr];
    // the HEB edition (NT/Apocrypha) has no morphology: a final yod is parsed as "my", but
    // it is as often the construct plural (עֲנִיֵּי "the poor of", Matthew 5:3) — never print
    // a [My] the text cannot vouch for
    const guess = source && source !== 'BHS' && pr === '1cs';
    return { kind: 'suf', eng: PRS[pr] || W(''), label: guess ? null : (lab || null), pron: true, pr }; }
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
      // every letter of the word must be in its components: an index baked before
      // build-surface-index's coverLetters() can hold 𐤋𐤊𐤍 as the lone chip 𐤋 ("L (To)")
      { const raw = [...String(r.word_raw || '')].filter(ch => ch >= '\u{10900}' && ch <= '\u{10915}');
        const have = [...comps.map(x => x.paleo).join('')];
        let k = 0; for (const ch of have) if (k < raw.length && raw[k] === ch) k++;
        if (raw.length && k < raw.length && have.length < raw.length && have.every((ch, q) => ch === raw[q])) {
          const tail = raw.slice(have.length).join('');
          comps = [...comps, comps.some(x => x.css === 'root') ? { paleo: tail, css: 'mod-suff-unk' } : { paleo: tail, true_root: tail, translation: tail, gloss_src: 'none', css: 'root' }];
        } }
      if (!comps.length) continue;                                  // punctuation / maqaf
      const single = [...(r.word_raw || '')].length === 1;
      // a preposition carrying its own pronoun (בּוֹ "in him", לִי "to me", לָהֶם "to them") is a
      // WORD of its own — only a bare letter is a proclitic of the next word
      // (any lone proclitic letter: the BHS rows H9000-H9009, and the interrogative 𐤄 of 𐤄𐤌𐤍
      // Genesis 3:11, which has no Strong's — "H (the)" stood alone 1,606 times in the OT)
      if (single && comps.length === 1 && '𐤅𐤄𐤁𐤋𐤊𐤌𐤔'.includes(r.word_raw) && (PROCLITIC_SN.test(r.sn || '') || /^(prep|conj|art|inrg)$/.test(r.pos || ''))) { pending.push(...comps); continue; }
      // a single letter is never a word of its own (fieldy): the Aramaic emphatic 𐤀 (BHS row,
      // pos art, Ezra/Daniel) closes the word before it; any other lone letter (a numeral, a
      // suspended letter) joins the word after it
      if (single && !pending.length && [...comps.map(x => x.paleo).join('')].length === 1) {
        const prev = words[words.length - 1];
        if (r.word_raw === '𐤀' && /art/.test(r.pos || '') && prev) { prev.comps.push({ ...comps[0], css: 'nme-emph' }); prev.form = formOf(prev.comps); continue; }
        pending.push(...comps); continue;
      }
      const all = [...pending, ...comps]; pending = [];
      // a preposition standing as its own word (אֵלָיו "to him", לְךָ "to you") has no root
      // component: the preposition is its head, the pronoun its suffix
      const root = all.find(x => isRootCss(x.css)) || (/prep/.test(r.pos || '') && all.find(x => x.css === 'mod-prep')) || all[all.length - 1];
      words.push({ pos: r.pos || '', ord: r.ord, sn: r.sn ? 'H' + String(r.sn).replace(/^H+/i, '') : '', comps: all, form: formOf(all),
                   rootTr: formOf([{ ...root, css: 'root' }]).toLowerCase(), isName: root.css === 'mod-nmpr' || /nmpr/.test(r.pos || ''),
                   snTr: (() => { const k = r.sn ? 'H' + String(r.sn).replace(/^H+/i, '') : ''; return ROOTS[k] ? formOf([{ paleo: ROOTS[k], css: 'root' }]).toLowerCase() : ''; })(),
                   mods: all.filter(x => x !== root).map(x => {
                     const mi = modInfo(x, source);
                     // HEB edition: יְנֻחָמוּ "they will be comforted" — the parse calls a verb's
                     // final 𐤅 after a prefix "his"; it is the plural ending
                     if (mi && mi.pron && source !== 'BHS' && x.paleo === '𐤅' && all.some(y => /^pfm-/.test(y.css || ''))) return { ...mi, label: null };
                     return mi;
                   }).filter(Boolean) });
    }
    if (pending.length && words.length) { const last = words[words.length - 1]; last.comps.push(...pending.map(x => ({ ...x, css: 'mod-suff-unk' }))); last.form = formOf(last.comps); }
    return words;
  };
}

const engWords = s => (String(s).toLowerCase().match(/[a-z']+/g) || []);
/** "Form (english [Label·Label])" — a label only for a modification the English lacks. */
export function pairFor(word, english) { const p = pairParts(word, english); return renderPair(p); }
export const renderPair = p => p.word ? `${p.form} (${weave(p.word, p.english)})` : `${p.form} (${p.english}${p.labels.length ? ' [' + p.labels.join('·') + ']' : ''})`;
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
  return { form: word.form, english, labels, word };
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
export function mergeModforms(text, words, opts = {}) {
  // opts.all — every pair whose word is one of the verse's roots becomes its full form, even a
  //            word with no modification ("kasap (money)" -> "Kasap (money)"), as the OT's
  //            machine text reads. Off for fieldy's saved verses (his casing kept there).
  // A pair may carry a marker U+E002<ord>U+E003 in front of its word (merge-modforms puts
  // one on every pair it built from the aligner): then it is THAT Hebrew word, not the
  // first unused one with the same root.
  if (!text || !words.length) return { text: opts.keepMarks ? String(text || '') : String(text || '').replace(/\uE002\d+r?\uE003/g, ''), n: 0 };
  const PAIR = /(?:\uE002(\d+)(r?)\uE003)?\b([A-Za-z][A-Za-z'’-]*)\s+\(([^()]{1,80})\)/g;
  const used = new Set();
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const hits = [];
  const depthAt = i => { let d = 0; for (let k = 0; k < i; k++) { if (text[k] === '(') d++; else if (text[k] === ')' && d) d--; } return d; };
  for (const m of text.matchAll(PAIR)) {
    if (depthAt(m.index)) continue;                    // a pair inside another gloss: "Ahayah (I hayah (come to pass))"
    const w = norm(m[3]);
    if (!w || m[3].includes('-')) continue;
    // a NAME is never merged: a capitalised gloss that is a name, or a name's spelling glossed
    // with a capital ("sham (name)" is a word — Sham (Shem) is a name)
    const g = m[4].trim();
    if (!g) continue;                                                         // "Yahawah ()": the gold marker, never touched
    if (!m[1] && /^[A-Z]/.test(g) && (NAME_ENG.has(g.toLowerCase()) || (NAME_TR.has(w) && words.some(x => x.isName && (x.rootTr === w || x.snTr === w))))) {   // "Palal (Pray)" is the verb, not Palal of Nehemiah 3   // (a marked pair was built from a non-name Hebrew word)
      // A NAME takes its proclitics like any word — fieldy: "the whole Wa...(and ...) is a
      // common hebrew pattern so it makes sense that it exists across my corpus regardless of
      // the writing period" — "and Yawasap (Joseph)" -> "WaYawasap (and Joseph)". Only and /
      // the / a preposition attach, and the name keeps the spelling the name rules gave it:
      // the HEB parse can read the yod of Yosef as a verb prefix ("WaYaYawasap").
      const nw = words.find(x => !used.has(x) && (x.rootTr === w || x.snTr === w));
      if (!nw) continue;
      used.add(nw);
      const ri = nw.comps.findIndex(c => isRootCss(c.css));
      const pre = (ri < 0 ? [] : nw.comps.slice(0, ri)).filter(c => c.css === 'mod-conj' || c.css === 'mod-art' || (c.css === 'mod-prep' && PREP_TR[c.paleo]));
      if (!pre.length || pre.length !== (ri < 0 ? 0 : ri) && nw.comps.slice(0, ri).some(c => !pre.includes(c) && !String(c.css || '').startsWith('pfm-'))) continue;
      const lead = pre.map(c => c.css === 'mod-conj' ? 'Wa' : c.css === 'mod-art' ? 'Ha' : PREP_TR[c.paleo]).join('');
      hits.push({ m, word: { form: lead + m[3], ord: nw.ord, isName: true, mods: pre.map(c => modInfo(c, 'BHS')).filter(Boolean) } });
      continue;
    }
    let word = null;
    if (m[1]) { word = words.find(x => String(x.ord) === m[1] && !x.isName) || null; if (!word) continue; if (m[2]) { used.add(word); continue; } }   // 'r': already rendered   // the marker is authoritative
    else {
      const done = words.find(x => !used.has(x) && norm(x.form) === w && (x.mods.length || opts.all));
      if (done) { used.add(done); if (!opts.all || m[3] === done.form) continue; word = done; }   // already a full form — and that word is taken
      else {
        const cands = words.filter(x => !used.has(x) && !x.isName && x.rootTr === w);
        if (!cands.length) cands.push(...words.filter(x => !used.has(x) && !x.isName && x.snTr && x.snTr === w));
        if (!cands.length) continue;
        word = cands[0];
      }
    }
    used.add(word);
    if (!word.mods.length && !opts.all) continue;                              // nothing to add — keep as is
    hits.push({ m, word });
  }
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
    const english = [...leftWords, m[4], rightWord].filter(Boolean).join(' ');
    out = head + quote + (opts.keepMarks && word.ord != null ? `\uE002${word.ord}r\uE003` : '') + pairFor(word, english) + tail;
  }
  return { text: opts.keepMarks ? out : out.replace(/\uE002\d+r?\uE003/g, ''), n: hits.length };
}

// ── WOVEN GLOSSES (fieldy, 2026-10-01) ─────────────────────────────────────────────────
// "i dont want any text in brackets unless thats the only context it provides" — his Gen 2:7
// reads "WaYaYatzar (And formed / shaped) … BaApayaw (into his nostrils)". A modification the
// English lacks is written INTO the English, not as a [label]: "(And sent)", "(who mourn -
// plural)". Prefixes go in front (and, in, the, his); a pronoun suffix on a verb is its object
// ("struck him"); plural / emphatic, which English has no word for, follow " - ".
const LIGHT = new Set(('a an the and or but if for nor so yet of to in into on onto at by with from as than that this these those which who whom whose what i me my we us our you your he him his she her it its they them their ' +
  'be is are was were been being have has had do does did will shall would should may might must can could not no up out there then when where while all any some').split(' '));
const REVERENT = new Set('God Lord LORD Heaven Heavens Kingdom Spirit Son Father Holy Word Christ Messiah Name Most High Almighty Savior Lamb Good News Man'.split(' '));
const OBJ = { '1cs': 'me', '1cp': 'us', '2ms': 'you', '2fs': 'you', '2mp': 'you', '2fp': 'you', '3ms': 'him', '3fs': 'her', '3mp': 'them', '3fp': 'them' };
const POSS = { '1cs': 'my', '1cp': 'our', '2ms': 'your', '2fs': 'your', '2mp': 'your', '2fp': 'your', '3ms': 'his', '3fs': 'her', '3mp': 'their', '3fp': 'their' };
export function weave(word, english) {
  const eng = String(english || '').replace(/\s+/g, ' ').trim();
  const ws = engWords(eng);
  const has = set => set && ws.some(w => set.has(w));
  const isVerb = /verb/i.test(word.pos || '') || word.mods.some(m => m.kind === 'subj' || m.kind === 'subj-suf');
  const objSuffix = isVerb || /prep/i.test(word.pos || '');
  const pre = [], post = [];
  for (const m of word.mods) {
    if (!m.label && !m.pron) continue;
    if (m.kind === 'plural') { if (!isPluralEng(ws)) post.push('plural'); continue; }
    if (m.inf) continue;                                     // 𐤋: to/for/of/infinitive by context
    if (m.kind === 'any') { post.push(String(m.label).toLowerCase()); continue; }
    if (has(m.eng)) continue;
    if (m.pron) { if (!m.label) continue; if (objSuffix) post.unshift(OBJ[m.pr] || ''); else pre.push(POSS[m.pr] || ''); continue; }
    if (m.label === 'Toward') { pre.push('toward'); continue; }
    if (m.label === 'the' && isVerb) { pre.push('who'); continue; }     // HaAbalayam: "who mourn"
    pre.push(String(m.label).toLowerCase());
  }
  const objs = post.filter(x => Object.values(OBJ).includes(x)), notes = post.filter(x => !objs.includes(x));
  let body = [word.sn === 'H853' && /^entirety$/i.test(eng) ? 'the entirety of' : eng, ...objs].filter(Boolean).join(' ');
  if (pre.length && body) {
    const cap = /^[A-Z]/.test(body);
    const first = body.split(' ')[0];
    // a capital the English keeps mid-sentence (a name, Heaven, Spirit, Son) stays; only a
    // sentence's first capital moves to the woven word in front ("And sent")
    const keepCap = first === 'I' || (!LIGHT.has(first.toLowerCase()) && (NAME_ENG.has(first.toLowerCase()) || REVERENT.has(first.replace(/[’']s$/, ''))));
    let p = pre.filter(Boolean).join(' ');
    if (cap && !keepCap) { body = body[0].toLowerCase() + body.slice(1); p = p[0].toUpperCase() + p.slice(1); }
    body = `${p} ${body}`;
  }
  if (hasConj(word)) body = leadAnd(body);
  return notes.length ? `${body} - ${notes.join(', ')}` : body;
}

// ── CONCEPTS THE NT SHARES WITH THE OT (fieldy, 2026-10-01) ──────────────────────────────
// "geneaology is Thawaladahawath per Genesis 2, repent must be Nacham, 'baptize' must be
// 'Rachatz' -- these are not new made up concepts in the NT". lexicon/reading-concepts.json:
// an English word family, the Strong's whose root the reading text writes, and the Hebrew
// the verse may carry for it (Strong's numbers, or root letters for untagged words — the HEB
// edition's טְבִילָה has no Strong's). The parallel gate accepts the concept's root wherever
// the verse has one of those.
let CONCEPTS = null;
export function loadConcepts() {
  if (CONCEPTS) return CONCEPTS;
  let raw = {};
  try { raw = JSON.parse(readFileSync(path.join(__dirname, 'lexicon', 'reading-concepts.json'), 'utf8')); } catch { raw = {}; }
  const consonants = p => [...String(p || '')].filter(ch => !'𐤀𐤅𐤉𐤄'.includes(ch)).join('');
  CONCEPTS = Object.entries(raw).filter(([k, v]) => !k.startsWith('_') && v && v.to).map(([k, v]) => ({
    name: k, re: new RegExp(v.en, 'i'), to: v.to, rootPaleo: ROOTS[v.to] || '', form: v.form || '',
    hebSn: new Set(v.hebSn || []), hebRoot: (v.hebRoot || []).map(consonants).filter(Boolean),
    matches(word) {
      if (word.sn && this.hebSn.has(word.sn)) return true;
      const root = (word.comps.find(c => isRootCss(c.css)) || {}).paleo || '';
      const rc = consonants(root);
      return !!rc && this.hebRoot.some(h => rc.includes(h));
    },
  }));
  return CONCEPTS;
}
/** The word the reading text writes for a concept: the verse word's and/the/preposition + the concept's root. */
export function conceptWord(word, concept) {
  const ri = word.comps.findIndex(c => isRootCss(c.css));
  const pre = (ri < 0 ? [] : word.comps.slice(0, ri)).filter(c => c.css === 'mod-conj' || c.css === 'mod-art' || (c.css === 'mod-prep' && PREP_TR[c.paleo]));
  const root = { paleo: concept.rootPaleo, css: 'root' };
  const rootForm = concept.form || formOf([root]);
  const lead = pre.map(c => c.css === 'mod-conj' ? 'Wa' : c.css === 'mod-art' ? 'Ha' : PREP_TR[c.paleo]).join('');
  if (word.sn === concept.to && !concept.form) return { ...word, concept: concept.name };   // the verse already has the word
  return { ...word, comps: [...pre, root], form: lead + rootForm, rootTr: rootForm.toLowerCase(), snTr: rootForm.toLowerCase(),
           sn: concept.to, mods: pre.map(c => modInfo(c, 'BHS')).filter(Boolean), concept: concept.name };
}

// ── HEBREW WORD ORDER (fieldy, 2026-10-01) ───────────────────────────────────────────────
// He chose the reading text of his own Genesis 2:7 for every verse from Genesis 3 on: every
// Hebrew word in its order, its English inside its brackets, nothing outside —
// "WaYaShalach (And sent) Alayaw (to him) Alayashai (Elisha) Malaak (a messenger) LaAmar
// (saying)". The input is the English-order text with its pairs already Hebrew words; each
// pair is put at its word's place. English no pair holds goes into the nearest pair's
// brackets of the same clause (never a name's). A Hebrew word with no English gets its
// lexicon gloss. Punctuation and quotation marks travel with their words; the verse's
// first opener and last closer stay first and last. Returns ok:false (caller keeps the
// English order) when the quotation marks would come out in a different order, or when
// most of the English found no Hebrew word (a free paraphrase).
export function interlinear(text, words, glossOf, opts = {}) {
  const out = { text, ok: false, why: '' };
  if (!text || !words.length) { out.why = 'no hebrew'; return out; }
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const squash = s => s.replace(/a+/g, 'a');   // Yashar-Al / Yasharaal
  const TOK = /((\d+)r?)?([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*)(\s*\(((?:[^()]|\([^()]*\))*)\))?|\s+|[^\sA-Za-zÀ-ɏ]/g;
  const used = new Set();
  const find = (w, ord) => {
    if (ord != null) { const x = words.find(h => String(h.ord) === ord); if (x && !used.has(x)) return x; }
    const n = norm(w); if (!n) return null;
    return words.find(h => !used.has(h) && norm(h.form) === n)
        || words.find(h => !used.has(h) && (h.rootTr === n || h.snTr === n))
        || (n.length >= 4 ? words.find(h => !used.has(h) && norm(h.form).endsWith(n)) : null)
        || words.find(h => !used.has(h) && h.isName && squash(norm(h.form)) === squash(n)) || null;
  };
  const els = [];
  let engWordsN = 0, residueN = 0;
  for (const m of text.matchAll(TOK)) {
    const t = m[0];
    if (/^\s+$/.test(t)) { els.push({ k: 'ws' }); continue; }
    if (m[3]) {
      const isPair = m[4] != null;
      const glossWords = isPair ? (m[5].match(/[A-Za-z]+/g) || []).length : 0;
      if (isPair) {
        engWordsN += (m[5].match(/[A-Za-z]+/g) || []).filter(x => !LIGHT.has(x.toLowerCase())).length;
        const h = find(m[3], m[2]);
        if (h) used.add(h);
        // a pair whose word is no word of this verse's tokens (its Hebrew word already stands
        // elsewhere: "YaThaQadashaw (be kept) qadash (holy)") is not shown as Hebrew — its
        // English joins the words around it. A name keeps its place.
        if (!h && (!/^[A-Z]/.test(m[3]) || norm(m[3]).length <= 1) && m[5].trim()) { for (const x of m[5].trim().split(/\s+/)) { if (!LIGHT.has(x.toLowerCase())) residueN++; els.push({ k: 'w', t: x }); } continue; }
        const gl = m[5].trim();
        // a name's brackets hold only its English name: never English from around it
        const isName = (h && h.isName) || gl === ''
          || (gl.match(/\b[A-Z][a-z'’-]+/g) || []).some(x => NAME_ENG.has(x.toLowerCase().replace(/[’']s$/, '')));
        // the Hebrew word shown is the TOKEN's: a pair still written as its bare root ("palal")
        // becomes the verse's word ("ThaThaPalalaw"), its modifications woven into the English
        if (h && !isName && norm(m[3]) !== norm(h.form)) { els.push({ k: 'item', h, form: h.form, gloss: weave(h, gl), name: false }); continue; }
        els.push({ k: 'item', h, form: m[3], gloss: gl, name: isName });
        continue;
      }
      // a bare Hebrew word (a name, Yahawah, Alahayam) or English
      const h = /^[A-Z]/.test(m[3]) ? find(m[3], m[2]) : null;
      if (h && (h.isName || norm(h.form) === norm(m[3]) || h.rootTr === norm(m[3]))) { used.add(h); els.push({ k: 'item', h, form: m[3], gloss: null, name: true }); continue; }
      if (/^[A-Z][a-z]*(?:a[a-z]){2,}$/.test(m[3]) && (NAME_TR.has(norm(m[3])) || /aa|ay|aw/.test(m[3]))) { els.push({ k: 'item', h: null, form: m[3], gloss: null, name: true }); continue; }   // a name the Hebrew spells otherwise (Kayapaa / Patarawas)
      if (!LIGHT.has(m[3].toLowerCase())) engWordsN++; if (!LIGHT.has(m[3].toLowerCase())) residueN++;   // a paraphrase leaves CONTENT words over
      els.push({ k: 'w', t: m[3] });
      continue;
    }
    els.push({ k: 'p', t });
  }
  const items = els.filter(e => e.k === 'item');
  if (!items.length) { out.why = 'no pairs'; return out; }
  if (!items.some(it => it.gloss !== null && !it.name)) { out.why = 'no glossed word'; return out; }
  if (engWordsN && residueN / engWordsN > (opts.maxResidue ?? 0.5)) { out.why = 'paraphrase'; return out; }
  // walk: residue words + punctuation onto items
  items.forEach((it, i) => { it.ei = i; it.lead = ''; it.trail = ''; it.pre = []; it.suf = []; });
  const glossed = it => it.gloss !== null && !it.name;
  let prev = null, buf = [], pendingLead = '';
  const CLAUSE = /^[,;:.!?—–…]$/;
  const flushTo = (target, where) => { if (!buf.length) return; if (target) target[where].push(...buf); buf = []; };
  const nearestGlossed = (from, dir) => { for (let i = from; i >= 0 && i < items.length; i += dir) if (glossed(items[i])) return items[i]; return null; };
  // English left over between two words whose Hebrew word the English never named: when a
  // Hebrew word with no English stands right after the previous word, the leftover is ITS
  // English ("Blessed are the gentle," → HaInawayam, not Asharay)
  const gapItems = [];
  const gapWord = (j) => {
    if (!prev || !prev.h || !buf.some(w => !LIGHT.has(w.toLowerCase()))) return null;
    let bound = Infinity;
    for (let q = j; q < els.length; q++) if (els[q].k === 'item' && els[q].h) { bound = els[q].h.ord; break; }
    const w = words.filter(x => !used.has(x) && !x.isName && x.sn !== 'H853' && x.ord > prev.h.ord && x.ord < bound).sort((a, b) => a.ord - b.ord)[0];
    if (!w) return null;
    used.add(w);
    const gi = { k: 'item', h: w, form: w.form, gloss: weave(w, buf.join(' ')), name: false, lead: '', trail: '', pre: [], suf: [], ei: prev.ei + 0.5, gap: true };
    gapItems.push(gi); buf = [];
    return gi;
  };
  for (let j = 0; j < els.length; j++) {
    const e = els[j];
    if (e.k === 'ws') continue;
    if (e.k === 'w') { buf.push(e.t); continue; }
    if (e.k === 'p') {
      const nx = els[j + 1];
      const before = j === 0 || els[j - 1].k === 'ws' || (els[j - 1].k === 'p' && /^[“‘"'(\[—–]$/.test(els[j - 1].t));
      const opener = /^[“‘(\[]$/.test(e.t) || (/^["']$/.test(e.t) && before && nx && (nx.k === 'w' || nx.k === 'item' || (nx.k === 'p' && /^[“‘"']$/.test(nx.t))));
      if (opener) {
        if (buf.length) { const tgt = (prev && glossed(prev)) ? prev : (nearestGlossed(prev ? prev.ei : 0, -1) || nearestGlossed(prev ? prev.ei + 1 : 0, 1)); flushTo(tgt, tgt === prev ? 'suf' : 'pre'); }
        pendingLead += e.t; continue;
      }
      // closer / clause punctuation: residue so far belongs to the item before it
      if (buf.length) { const gi = gapWord(j); if (gi) prev = gi; }
      if (buf.length) {
        const tgt = (prev && glossed(prev)) ? prev : (nearestGlossed(prev ? prev.ei : -1, -1) || nearestGlossed(prev ? prev.ei + 1 : 0, 1));
        if (tgt) { const wh = prev && tgt.ei <= prev.ei ? 'suf' : 'pre'; flushTo(tgt, wh); }
      }
      if (prev) prev.trail += e.t; else pendingLead += e.t;
      continue;
    }
    // an item
    if (buf.length) {
      // English right before a word is that word's ("and the" + HaAretz); before a name it goes
      // to the word before the name, or else the one after it
      let nextSame = null;
      if (!glossed(e)) for (let q = j + 1; q < els.length; q++) { const x = els[q]; if (x.k === 'p' && CLAUSE.test(x.t)) break; if (x.k === 'item' && glossed(x)) { nextSame = x; break; } }
      const tgt = glossed(e) ? e : (nextSame || nearestGlossed(e.ei - 1, -1) || nearestGlossed(e.ei + 1, 1));
      if (tgt) flushTo(tgt, tgt.ei < e.ei ? 'suf' : 'pre'); else buf = [];
    }
    e.lead = pendingLead; pendingLead = '';
    prev = e;
  }
  if (buf.length) { const gi = gapWord(els.length); if (gi) prev = gi; }
  if (buf.length) { const tgt = (prev && glossed(prev)) ? prev : nearestGlossed(items.length - 1, -1); if (tgt) flushTo(tgt, 'suf'); else buf = []; }
  const itemsE = [...items, ...gapItems].sort((a, b) => a.ei - b.ei);
  if (pendingLead && prev) prev.trail += pendingLead;
  // Hebrew words no pair took: their lexicon gloss
  const extra = [];
  const usedOrds = new Set([...used].map(h => h.ord));
  for (const h of words) if (!used.has(h)) {
    // a name the English does not have: shown with its English name ("LaDawad (of David)", the
    // psalm titles) — unless it stands beside a name that is there (part of it: Tzapanath-Painach)
    if (h.isName) {
      const en = nameEnglish(h.rootTr) || nameEnglish(h.snTr);
      if (!en || words.some(x => x.isName && usedOrds.has(x.ord) && Math.abs(x.ord - h.ord) <= 2)) continue;
      extra.push({ k: 'item', h, form: h.form, gloss: weave(h, en), name: true, lead: '', trail: '', pre: [], suf: [], ei: -1, added: true });
      continue;
    }
    const g = glossOf ? glossOf(h) : '';
    extra.push({ k: 'item', h, form: h.form, gloss: g || null, name: !!h.isName || !g, lead: '', trail: '', pre: [], suf: [], ei: -1, added: true });
  }
  // order: Hebrew ordinal; a pair whose word was not found stays after the item before it
  const all = [...itemsE, ...extra];
  let lastOrd = 0;
  for (const it of itemsE) { if (it.h) lastOrd = it.h.ord; it.key = it.h ? it.h.ord : lastOrd + 0.5; }
  for (const it of extra) it.key = it.h.ord;
  const ordered = all.slice().sort((a, b) => a.key - b.key || (a.ei - b.ei));
  // A QUOTATION opens on the first of its words in Hebrew order and closes on the last:
  // "LaAmar (saying), “Lachamanaw (our own bread) NaAkal (we will eat) …”" — the span is the
  // English words from the opener to its closer.
  const pos = new Map(ordered.map((it, i) => [it, i]));
  for (let i = 0; i < itemsE.length; i++) {
    const X = itemsE[i];
    if (!/[“‘"']/.test(X.lead)) continue;
    let k = i; while (k < itemsE.length && !/[”’"']/.test(itemsE[k].trail)) k++;
    if (k >= itemsE.length) k = itemsE.length - 1;
    const S = itemsE.slice(i, k + 1).filter(it => pos.has(it));
    if (!S.length) continue;
    const firstS = S.reduce((a, b) => (pos.get(b) < pos.get(a) ? b : a)), lastS = S.reduce((a, b) => (pos.get(b) > pos.get(a) ? b : a));
    let head = firstS;
    // Hebrew words the English had no word for, right before the quotation, open it ("Ap Kay")
    for (let q = pos.get(head) - 1; q >= 0 && ordered[q].added && !ordered[q].trail; q--) head = ordered[q];
    if (head !== X) { const l = X.lead; X.lead = head.lead; head.lead = l; }
    if (/[”’"']/.test(itemsE[k].trail) && lastS !== itemsE[k]) { const t = itemsE[k].trail; itemsE[k].trail = lastS.trail; lastS.trail = t; }
    i = k;
  }
  // the verse's first opener and its final punctuation stay at the ends
  const firstE = itemsE[0], lastE = itemsE[itemsE.length - 1], firstH = ordered[0], lastH = ordered[ordered.length - 1];
  if (firstE !== firstH && firstE.lead && !firstH.lead) { firstH.lead = firstE.lead; firstE.lead = ''; }
  if (lastE !== lastH && /[.!?]/.test(lastE.trail)) { const t = lastE.trail; lastE.trail = lastH.trail; lastH.trail = t; }
  const dedupe = g => { const t = g.split(' '); const out2 = [];
    for (let i = 0; i < t.length; i++) { const w = t[i].toLowerCase(); if (/^(the|and|in|of|to|a|an)$/.test(w) && out2.slice(-3).some(x => x.toLowerCase() === w)) continue; out2.push(t[i]); }
    return out2.join(' '); };
  const render = it => {
    let g = dedupe([...it.pre, it.gloss || '', ...it.suf].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
    if (it.h && hasConj(it.h) && /^Wa/.test(it.form) && (it.gloss !== null || it.pre.length || it.suf.length)) g = leadAnd(g);
    const body = it.gloss === null && !it.pre.length && !it.suf.length ? it.form : `${it.form} (${g})`;
    return it.lead + body + it.trail;
  };
  // the verse starts a sentence: its first gloss does too ("WaYaShalach (And sent)")
  { const f = ordered.find(it => it.gloss !== null || it.pre.length);
    if (f && f === ordered[0]) { if (f.pre.length) f.pre[0] = f.pre[0][0].toUpperCase() + f.pre[0].slice(1); else if (f.gloss) f.gloss = f.gloss[0].toUpperCase() + f.gloss.slice(1); } }
  const res = ordered.map(render).join(' ').replace(/\s+([,.;:!?”’)])/g, '$1').replace(/\s+/g, ' ').trim();
  const quotes = s => (s.replace(/\((?:[^()]|\([^()]*\))*\)/g, '').match(/[“”‘’"]/g) || []).join('');
  if (quotes(res) !== quotes(text)) { out.why = 'quotes'; return out; }
  out.text = res; out.ok = true;
  return out;
}

// ── "Wa" LEADS (fieldy, 2026-10-01: "WaYaBawaa (So and came) -> 'And so came' let 'Wa' lead
// all context its used in") ─────────────────────────────────────────────────────────────
// A word carrying the conjunction 𐤅 starts its English with "and": an "and" found later in
// the gloss moves to the front, a leading "but" gives way to it, everything else stays
// ("And so came", "and Joseph"). A sentence's capital moves to "And".
export function leadAnd(g) {
  let s = String(g || '').replace(/\s+/g, ' ').trim();
  if (!s) return 'and';
  const cap = /^[A-Z]/.test(s);
  let t = s.split(' ');
  const ai = t.findIndex(w => /^and$/i.test(w));
  if (ai === 0) t.shift(); else if (ai > 0) t.splice(ai, 1);
  if (t.length && /^but$/i.test(t[0])) t.shift();
  if (t.length && cap) {
    const first = t[0];
    const keep = first === 'I' || (!LIGHT.has(first.toLowerCase()) && (NAME_ENG.has(first.toLowerCase()) || REVERENT.has(first.replace(/[’']s$/, ''))));
    if (!keep) t[0] = first[0].toLowerCase() + first.slice(1);
  }
  return [cap ? 'And' : 'and', ...t].join(' ');
}
export const hasConj = word => !!word && word.mods.some(m => m.kind === 'pre' && m.label === 'and');

// ── THE TEXT MATCHES THE TOKENS (fieldy, Matthew 5:5: "my tokens support what it should be
// lets make the text match it") ──────────────────────────────────────────────────────────
// A word with no modification reads as its chip reads — his curated gloss — not the English
// that happened to stand there: "Hamah (they / them)", not the root-keyed lexicon's
// 𐤄𐤌𐤄 "great uproar" (H1993) the live re-gloss put on H1992. curatedOf(word) decides
// (merge-modforms: the word's own lexicon entry unless that spelling is another common
// word's root, else its chip). Every pair whose Hebrew word is known and unmodified.
export function curatePairs(text, words, curatedOf) {
  if (!text || !words.length || !curatedOf) return text;
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const used = new Set();
  return text.replace(/((\d+)r?)?\b([A-Za-z][A-Za-z'’-]*)(\s*)\(([^()]*)\)/g, (m, mk, ord, w, sp, gl) => {
    let h = ord != null ? words.find(x => String(x.ord) === ord) : null;
    if (!h) { const n = norm(w); h = words.find(x => !used.has(x) && norm(x.form) === n) || null; }
    if (!h) return m;
    used.add(h);
    if (h.mods.length || h.isName || !gl.trim() || norm(w) !== norm(h.form)) return m;
    if ((gl.match(/\b[A-Z][a-z'’-]+/g) || []).some(x => NAME_ENG.has(x.toLowerCase()))) return m;   // a name's / the divine names' gloss (God, Jesus) stays
    const c = curatedOf(h);
    return c ? `${mk || ''}${w}${sp}(${c})` : m;
  });
}
