/**
 * translit.js — consistent, scholarly transliteration for every script.
 *
 * Same idea as your Paleo-Hebrew CHAR_MAP: one fixed English sound per letter,
 * consistent rather than phonetically perfect. detectScript picks the table, so
 * transliterate(text) works on any original-language verse with no per-call setup.
 *
 * Three letter-class behaviours, matching how each writing system works:
 *   • ABJADS (Hebrew, Syriac, Arabic, Samaritan): {med, fin} like your map —
 *     every consonant gets a trailing 'a' mid-word, bare at word end.
 *   • ALPHABETS (Greek, Coptic, Cyrillic/Slavonic, Armenian, Georgian, Latin):
 *     a single sound per letter (they already write their own vowels).
 *   • ABUGIDA (Ge'ez/Ethiopic): each glyph is consonant+vowel, built from the
 *     34 consonant rows × 7 vowel orders.
 *
 * Vowel points / accents / cantillation are stripped first, so the output is
 * stable regardless of pointing.
 */
import { detectScript } from './scripts.js';

/* ---- abjads: {med, fin} (your convention) ---------------------------------- */

// Square Hebrew (same sounds as your Paleo map; finals fold to their base)
const HEBREW = {
  'א':{med:'a',fin:'a'},'ב':{med:'ba',fin:'b'},'ג':{med:'ga',fin:'g'},'ד':{med:'da',fin:'d'},
  'ה':{med:'ha',fin:'h'},'ו':{med:'wa',fin:'w'},'ז':{med:'za',fin:'z'},'ח':{med:'cha',fin:'ch'},
  'ט':{med:'ta',fin:'t'},'י':{med:'ya',fin:'y'},'כ':{med:'ka',fin:'k'},'ך':{med:'ka',fin:'k'},
  'ל':{med:'la',fin:'l'},'מ':{med:'ma',fin:'m'},'ם':{med:'ma',fin:'m'},'נ':{med:'na',fin:'n'},
  'ן':{med:'na',fin:'n'},'ס':{med:'sa',fin:'s'},'ע':{med:'i',fin:'i'},'פ':{med:'pa',fin:'p'},
  'ף':{med:'pa',fin:'p'},'צ':{med:'tza',fin:'tz'},'ץ':{med:'tza',fin:'tz'},'ק':{med:'qa',fin:'q'},
  'ר':{med:'ra',fin:'r'},'ש':{med:'sha',fin:'sh'},'ת':{med:'tha',fin:'th'},
};

// Paleo-Hebrew / Phoenician (your exact table — U+10900…10915)
const PALEO = {
  '𐤀':{med:'a',fin:'a'},'𐤁':{med:'ba',fin:'b'},'𐤂':{med:'ga',fin:'g'},'𐤃':{med:'da',fin:'d'},
  '𐤄':{med:'ha',fin:'h'},'𐤅':{med:'wa',fin:'w'},'𐤆':{med:'za',fin:'z'},'𐤇':{med:'cha',fin:'ch'},
  '𐤈':{med:'ta',fin:'t'},'𐤉':{med:'ya',fin:'y'},'𐤊':{med:'ka',fin:'k'},'𐤋':{med:'la',fin:'l'},
  '𐤌':{med:'ma',fin:'m'},'𐤍':{med:'na',fin:'n'},'𐤎':{med:'sa',fin:'s'},'𐤏':{med:'i',fin:'i'},
  '𐤐':{med:'pa',fin:'p'},'𐤑':{med:'tza',fin:'tz'},'𐤒':{med:'qa',fin:'q'},'𐤓':{med:'ra',fin:'r'},
  '𐤔':{med:'sha',fin:'sh'},'𐤕':{med:'tha',fin:'th'},
};

// Syriac (sister abjad to Hebrew/Aramaic — same 22 letters, same sounds)
const SYRIAC = {
  'ܐ':{med:'a',fin:'a'},'ܒ':{med:'ba',fin:'b'},'ܓ':{med:'ga',fin:'g'},'ܔ':{med:'ga',fin:'g'},
  'ܕ':{med:'da',fin:'d'},'ܖ':{med:'da',fin:'d'},'ܗ':{med:'ha',fin:'h'},'ܘ':{med:'wa',fin:'w'},
  'ܙ':{med:'za',fin:'z'},'ܚ':{med:'cha',fin:'ch'},'ܛ':{med:'ta',fin:'t'},'ܜ':{med:'ta',fin:'t'},
  'ܝ':{med:'ya',fin:'y'},'ܞ':{med:'ya',fin:'y'},'ܟ':{med:'ka',fin:'k'},'ܠ':{med:'la',fin:'l'},
  'ܡ':{med:'ma',fin:'m'},'ܢ':{med:'na',fin:'n'},'ܣ':{med:'sa',fin:'s'},'ܤ':{med:'sa',fin:'s'},
  'ܥ':{med:'i',fin:'i'},'ܦ':{med:'pa',fin:'p'},'ܧ':{med:'pa',fin:'p'},'ܨ':{med:'tza',fin:'tz'},
  'ܩ':{med:'qa',fin:'q'},'ܪ':{med:'ra',fin:'r'},'ܫ':{med:'sha',fin:'sh'},'ܬ':{med:'tha',fin:'th'},
};

// Arabic (for Garshuni / Arabic biblical writings)
const ARABIC = {
  'ا':{med:'a',fin:'a'},'أ':{med:'a',fin:'a'},'إ':{med:'a',fin:'a'},'آ':{med:'a',fin:'a'},'ء':{med:'a',fin:'a'},
  'ب':{med:'ba',fin:'b'},'ت':{med:'ta',fin:'t'},'ث':{med:'tha',fin:'th'},'ج':{med:'ja',fin:'j'},
  'ح':{med:'cha',fin:'ch'},'خ':{med:'kha',fin:'kh'},'د':{med:'da',fin:'d'},'ذ':{med:'dha',fin:'dh'},
  'ر':{med:'ra',fin:'r'},'ز':{med:'za',fin:'z'},'س':{med:'sa',fin:'s'},'ش':{med:'sha',fin:'sh'},
  'ص':{med:'sa',fin:'s'},'ض':{med:'da',fin:'d'},'ط':{med:'ta',fin:'t'},'ظ':{med:'za',fin:'z'},
  'ع':{med:'i',fin:'i'},'غ':{med:'gha',fin:'gh'},'ف':{med:'fa',fin:'f'},'ق':{med:'qa',fin:'q'},
  'ك':{med:'ka',fin:'k'},'ل':{med:'la',fin:'l'},'م':{med:'ma',fin:'m'},'ن':{med:'na',fin:'n'},
  'ه':{med:'ha',fin:'h'},'ة':{med:'ha',fin:'h'},'و':{med:'wa',fin:'w'},'ي':{med:'ya',fin:'y'},'ى':{med:'ya',fin:'y'},
};

// Samaritan (U+0800…0815) — same Aramaic abjad order
const SAMARITAN = {};
['a','ba','ga','da','ha','wa','za','cha','ta','ya','ka','la','ma','na','sa','i','pa','tza','qa','ra','sha','tha']
  .forEach((s,i)=>{ const c=String.fromCodePoint(0x0800+i); SAMARITAN[c]={med:s,fin:s.endsWith('a')&&s.length>1?s.slice(0,-1):s}; });

/* ---- alphabets: single sound per letter ------------------------------------ */

const GREEK = {
  'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'e','θ':'th','ι':'i','κ':'k','λ':'l','μ':'m',
  'ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'u','φ':'ph','χ':'ch','ψ':'ps','ω':'o',
};
const COPTIC = {
  'ⲁ':'a','ⲃ':'b','ⲅ':'g','ⲇ':'d','ⲉ':'e','ⲋ':'st','ⲍ':'z','ⲏ':'e','ⲑ':'th','ⲓ':'i','ⲕ':'k','ⲗ':'l',
  'ⲙ':'m','ⲛ':'n','ⲝ':'ks','ⲟ':'o','ⲡ':'p','ⲣ':'r','ⲥ':'s','ⲧ':'t','ⲩ':'u','ⲫ':'ph','ⲭ':'kh','ⲯ':'ps','ⲱ':'o',
  'ϣ':'sh','ϥ':'f','ϧ':'kh','ϩ':'h','ϫ':'j','ϭ':'ch','ϯ':'ti',
};
const CYRILLIC = {  // Slavonic / Old Church Slavonic
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'j','і':'i','ї':'i',
  'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh',
  'ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'u','ы':'y','ь':'i','э':'e','ю':'yu','я':'ya',
  'ѣ':'ye','ѥ':'ye','ѧ':'en','ѩ':'yen','ѫ':'on','ѭ':'yon','ѡ':'o','ѿ':'ot','ѳ':'th','ѵ':'y',
  'є':'e','ѕ':'dz','ꙋ':'u','ѯ':'ks','ѱ':'ps','ѻ':'o','ꙗ':'ya',
};
const ARMENIAN = {
  'ա':'a','բ':'b','գ':'g','դ':'d','ե':'e','զ':'z','է':'e','ը':'e','թ':'t','ժ':'zh','ի':'i','լ':'l',
  'խ':'kh','ծ':'ts','կ':'k','հ':'h','ձ':'dz','ղ':'gh','ճ':'ch','մ':'m','յ':'y','ն':'n','շ':'sh','ո':'o',
  'չ':'ch','պ':'p','ջ':'j','ռ':'r','ս':'s','վ':'v','տ':'t','ր':'r','ց':'ts','ւ':'w','փ':'p','ք':'k',
  'օ':'o','ֆ':'f','և':'ev',
};
const GEORGIAN = {
  'ა':'a','ბ':'b','გ':'g','დ':'d','ე':'e','ვ':'v','ზ':'z','თ':'t','ი':'i','კ':'k','ლ':'l','მ':'m',
  'ნ':'n','ო':'o','პ':'p','ჟ':'zh','რ':'r','ს':'s','ტ':'t','უ':'u','ფ':'p','ქ':'k','ღ':'gh','ყ':'q',
  'შ':'sh','ჩ':'ch','ც':'ts','ძ':'dz','წ':'ts','ჭ':'ch','ხ':'kh','ჯ':'j','ჰ':'h',
  'ჱ':'e','ჲ':'y','ჳ':'w','ჴ':'q','ჵ':'o','ჶ':'f',
};

/* ---- abugida: Ge'ez/Ethiopic, built consonant×vowel ------------------------ */

const ETHIO_VOW = ['a','u','i','aa','e','','o'];            // 7 orders (ä u i a e ə o)
const ETHIO_ROWS = [                                       // [order-1 codepoint, consonant]
  [0x1200,'h'],[0x1208,'l'],[0x1210,'h'],[0x1218,'m'],[0x1220,'s'],[0x1228,'r'],[0x1230,'s'],
  [0x1238,'sh'],[0x1240,'q'],[0x1260,'b'],[0x1268,'v'],[0x1270,'t'],[0x1278,'ch'],[0x1280,'kh'],
  [0x1290,'n'],[0x1298,'ny'],[0x12A0,'a'],[0x12A8,'k'],[0x12B8,'kh'],[0x12C8,'w'],[0x12D0,'a'],
  [0x12D8,'z'],[0x12E0,'zh'],[0x12E8,'y'],[0x12F0,'d'],[0x12F8,'d'],[0x1300,'j'],[0x1308,'g'],
  [0x1320,'t'],[0x1328,'ch'],[0x1330,'p'],[0x1338,'ts'],[0x1340,'ts'],[0x1348,'f'],[0x1350,'p'],
];
const ETHIOPIC = {};
for (const [start, cons] of ETHIO_ROWS)
  for (let v = 0; v < 7; v++) ETHIOPIC[String.fromCodePoint(start + v)] = cons + ETHIO_VOW[v];

/* ---- registry + engine ----------------------------------------------------- */

const ABJAD = { hebrew:HEBREW, syriac:SYRIAC, arabic:ARABIC, samaritan:SAMARITAN, 'paleo-hebrew':PALEO };
const ALPHA = { greek:GREEK, coptic:COPTIC, cyrillic:CYRILLIC, glagolitic:CYRILLIC, armenian:ARMENIAN, georgian:GEORGIAN };
const SYLL  = { ethiopic:ETHIOPIC };

// strip combining marks (niqqud, Greek/Latin accents, Syriac/Arabic vowels, Ethiopic gemination…)
const COMBINING = /[\u0300-\u036F\u0483-\u0489\u0591-\u05BF\u05C1-\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u0816-\u082D\u0859-\u085B\u135D-\u135F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;
const strip = s => s.normalize('NFD').replace(COMBINING, '');
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

function word(tok, script) {
  const chars = [...strip(tok)];
  if (ABJAD[script]) {
    const m = ABJAD[script];
    let out = '';
    // last mapped letter uses .fin
    let lastIdx = -1;
    chars.forEach((c, i) => { if (m[c]) lastIdx = i; });
    chars.forEach((c, i) => { if (m[c]) out += (i === lastIdx ? m[c].fin : m[c].med); });
    return out;
  }
  const m = ALPHA[script] || SYLL[script];
  if (!m) return tok;
  let out = '';
  for (const c of chars) out += (m[c] ?? m[c.toLowerCase()] ?? '');
  return out;
}

/**
 * Transliterate a text run. Script auto-detected if not given.
 * @param {string} text
 * @param {object} [opts] { script, capitalize=true }
 */
export function transliterate(text, opts = {}) {
  const s = String(text || '');
  // Phoenician/Paleo range isn't in detectScript; catch it here.
  const script = opts.script
    || (/[\u{10900}-\u{1091F}]/u.test(s) ? 'paleo-hebrew' : detectScript(s).script);
  if (!ABJAD[script] && !ALPHA[script] && !SYLL[script]) return s; // unknown → passthrough
  const capitalize = opts.capitalize !== false;
  return s.split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok) || !tok) return tok;
    const t = word(tok, script);
    return capitalize ? cap(t) : t;
  }).join('');
}

export default transliterate;
