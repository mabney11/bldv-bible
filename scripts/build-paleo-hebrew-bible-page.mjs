// Writes server/seo/paleo-hebrew-bible.json (the /paleo-hebrew-bible page). Every transliteration and the medial/final guide come from src/lib/books.js, so they always match the app.
import { CHAR_MAP, translit } from '../src/lib/books.js';
import fs from 'fs';
// css + label per written letter, from the reader's own parse (scripts/build-paleo-hebrew-bible-morph.py).
const MORPH = JSON.parse(fs.readFileSync(new URL('./paleo-hebrew-bible-morph.json', import.meta.url), 'utf8'));
// The sample verse as the reader draws it (written + restored root letters), sounded by CHAR_MAP:
// medial inside the word, final on its last letter; a capital opens each prefix and the root, suffixes stay lower case.
const SUFFIX = /^(prs|vbe|nme|uvf)-/;
const sampleWord = ({ paleo, parts }, gloss) => {
  const pieces = parts.map((p, i) => {
    let s = i === parts.length - 1 ? CHAR_MAP[p.l].fin : CHAR_MAP[p.l].med;
    if (p.start && !SUFFIX.test(p.css)) s = s[0].toUpperCase() + s.slice(1);
    return [p.l, s, p.css === 'mod-nmpr' ? 'root' : p.css, p.label, p.written];
  });
  return { paleo, translit: pieces.map((p) => p[1]).join(''), pieces, gloss };
};
// fieldy's own English for BaRaashayath 2:4 (translation.db, status done), word by word.
const GEN_2_4_GLOSS = ['These', 'generations', 'the Heavens', 'and the Earth', 'in their creation', 'in the day', 'made them', '', 'God', 'Earth', 'and Heavens'];   // in Hebrew word order
// fieldy's eye (2026-11-25): English letters visible in the shapes of the three letters the English Alphabet never took.
const LOOKS = {
  '𐤎': { latin: 'S', note: 'Trace its three bars as one stroke, right to left and back, and the line zigzags into an S. The earliest S in Italy was written as just such a zigzag.' },
  '𐤑': { latin: 'T, Z', note: 'Its hooked stroke holds a T at the top and the turn of a Z, and its sound is tz.' },
  '𐤈': { latin: 'T', note: 'The cross in its circle is the mark of a T, and its sound is t.' },
};
const ROLE_LABEL = { root: 'Root', 'mod-nmpr': 'Name' };
const legendOf = (words) => {
  const seen = new Map();
  for (const w of words) for (const [, , css, label] of w.pieces) {
    if (label == null) continue;
    if (!css || seen.has(css)) continue;
    seen.set(css, ROLE_LABEL[css] || label.replace(/^\[|\]$/g, ''));
  }
  const order = (css) => (css === 'root' ? 0 : css === 'mod-nmpr' ? 1 : 2);
  return [...seen].sort((a, b) => order(a[0]) - order(b[0])).map(([css, label]) => ({ css, label }));
};
const P = (w, caps = [0], en = '', role = '') => {
  const ch = [...w];
  const pieces = ch.map((c, i) => {
    let s = i === ch.length - 1 ? CHAR_MAP[c].fin : CHAR_MAP[c].med;
    if (caps.includes(i)) s = s[0].toUpperCase() + s.slice(1);
    const m = MORPH[w] && MORPH[w][i];
    // A name is the root of its word: same colour as any root on this page.
    return m ? [c, s, m[0] === 'mod-nmpr' ? 'root' : m[0], m[1]] : [c, s];
  });
  return { paleo: w, translit: pieces.map((p) => p[1]).join(''), pieces, en, role };
};
const NAMES = (await import('../src/lib/books.js')).LETTER_NAMES;
const ex = {
 '𐤀':['𐤀𐤁','father'], '𐤁':['𐤁𐤉𐤕','house'], '𐤂':['𐤂𐤃𐤅𐤋','great'], '𐤃':['𐤃𐤅𐤃','David'], '𐤄':['𐤄𐤓','mountain'],
 '𐤅':['𐤉𐤄𐤅𐤃𐤄','Judah'], '𐤆':['𐤆𐤊𐤓','remember'], '𐤇':['𐤌𐤔𐤉𐤇','Anointed One'], '𐤈':['𐤈𐤅𐤁','good'], '𐤉':['𐤉𐤑𐤇𐤒','Isaac'],
 '𐤊':['𐤌𐤋𐤊','king'], '𐤋':['𐤋𐤁','heart'], '𐤌':['𐤔𐤌𐤉𐤌','heavens'], '𐤍':['𐤁𐤍','son'], '𐤎':['𐤎𐤅𐤎','horse'],
 '𐤏':['𐤉𐤏𐤒𐤁','Jacob'], '𐤐':['𐤐𐤓𐤏𐤄','Pharaoh'], '𐤑':['𐤀𐤓𐤑','earth'], '𐤒':['𐤒𐤃𐤔','holy'], '𐤓':['𐤃𐤁𐤓','word'],
 '𐤔':['𐤔𐤋𐤅𐤌','peace'], '𐤕':['𐤔𐤁𐤕','Sabbath'],
};
const guide = Object.keys(CHAR_MAP).map((l) => ({ letter: l, name: NAMES[l], medial: CHAR_MAP[l].med, final: CHAR_MAP[l].fin,
  example: { paleo: ex[l][0], translit: translit(ex[l][0]), en: ex[l][1] } }));
const cmp = (w, common, note, caps) => { const p = P(w, caps); return { paleo: w, common, bld: p.translit, pieces: p.pieces, letters: [...w].length, note }; };
const d = {
 _comment: "ONE copy of the /paleo-hebrew-bible page's words, read by src/pages/PaleoHebrewBible.jsx and server/prerender.js. Paleo letters only — no square script (RULE ZERO). The guide's medial/final values and every transliteration here were generated from src/lib/books.js CHAR_MAP/translit — edit the words in scripts/build-paleo-hebrew-bible-page.mjs and run it (node scripts/build-paleo-hebrew-bible-page.mjs).",
 path: '/paleo-hebrew-bible',
 title: 'Paleo Hebrew Bible — The Whole Scriptures in Paleo-Hebrew with English | BLD Bible',
 description: "Read the entire scriptures in Paleo-Hebrew letters alongside the English, with a transliteration that keeps every letter of the Hebrew: one letter, one sound, nothing dropped. Free to read online.",
 h1: 'Paleo Hebrew Bible',
 kicker: 'The entire scriptures in Paleo-Hebrew letters, alongside the English',
 intro: "BLD Bible lets you read the entire scriptures in Paleo-Hebrew, the 22 letters Israel wrote with before the exile, with the English beside every verse. Every Hebrew word is also written out in the letters of the English Alphabet by one fixed rule: each Hebrew letter always gets the same sound, and every letter of the Hebrew is kept. The transliteration preserves the Paleo-Hebrew letters themselves, not a modern pronunciation: read it back and you have the Hebrew letters again, in order. Nothing is smoothed over, dropped or doubled.",
 sample: { ref: 'BaRaashayath (Genesis) 2:4', paleo: MORPH._sample.map((w) => w.paleo).join(' '), to: '/genesis/2/4', label: 'Open BaRaashayath (Genesis) 2:4 word by word',
   words: MORPH._sample.map((w, i) => sampleWord(w, GEN_2_4_GLOSS[i])),
   note: 'Every Paleo-Hebrew letter above has its one sound below, in the same order. The root of every word is shown for context: each word is its root, with its modifications around it.' },
 readButtons: [
   { to: '/bible?book=1&chapter=1', label: 'Novel English Bible', sub: 'Plain English, the names kept in their Hebrew form' },
   { to: '/parallel/genesis/1', label: 'Read side by side', sub: 'The English beside the Paleo-Hebrew, word-linked' },
   { to: '/?book=1&chapter=1', label: 'Paleo Hebrew reader', sub: 'The Hebrew alone, every word opened into its parts' },
 ],
 sections: [
  { id: 'whole', h2: 'The entire scriptures in Paleo-Hebrew, alongside the English',
    p: ["Every book can be read in Paleo-Hebrew letters. The Old Testament is the Masoretic Hebrew text, letter for letter. The New Testament and the Apocrypha are read from Hebrew editions in the same letters, and so are many works beyond the canon in the Works Library.",
        "The Parallel Bible sets the English beside the Paleo-Hebrew verse by verse: point at an English word and its Hebrew word lights up, and the other way round. The Novel English Bible reads as plain English, with the names of people and places in their Hebrew form and their meaning beside them."],
    links: [{ to: '/parallel/genesis/1', label: 'English–Paleo Hebrew Parallel Bible' }, { to: '/?book=1&chapter=1', label: 'Paleo Hebrew reader: BaRaashayath (Genesis) 1' },
            { to: '/?book=40&chapter=1', label: 'The New Testament in Paleo-Hebrew: Matthew 1' }, { to: '/bible?book=1&chapter=1', label: 'Novel English Bible' }, { to: '/works', label: 'Works Library' }] },
  { id: 'every-letter', h2: 'A transliteration that preserves the Paleo-Hebrew letters',
    p: ["The transliteration on BLD Bible is not a guide to modern pronunciation. It is the Paleo-Hebrew letters themselves, written in the letters of the English Alphabet: one Hebrew letter, one sound, every letter kept, so the Hebrew can always be read back from it.",
        "Most transliterations write Hebrew the way it is pronounced today, so the same letter turns into different sounds from word to word, silent letters disappear, and letters that are not written are added. BLD Bible does it mechanically instead: every Hebrew letter has one sound, written the same way in every word of every book.",
        "You can count it. A word of four Hebrew letters has four letter-sounds in its transliteration, in the same order. Where a word has a prefix or a suffix, a capital letter marks where the next part begins: WaThaAmar is Wa (and) + Tha (she) + Amar (said). And the root of every word is shown for context, so every word reads as its root with its modifications around it."] },
 ],
 waw: {
  h2: 'One letter, one sound: the Waw',
  p: "The letter 𐤅 Waw is a good test. In common transliterations it becomes v in vayomer (and he said), u in Yehudah (Judah), o in shalom (peace), and w or nothing elsewhere. In BLD Bible it is always wa, or w at the end of a word, whatever the word is doing: the prefix and, a letter inside an ordinary word, the suffix his, or a letter in a name. These five words all stand in one verse:",
  ref: 'BaRaashayath (Genesis) 29:35', to: '/genesis/29/35',
  words: [ {...P('𐤅𐤕𐤀𐤌𐤓',[0,1,2]), en: 'and she said', role: 'Waw as the prefix "and"'},
           {...P('𐤏𐤅𐤃'), en: 'again', role: 'Waw inside an ordinary word'},
           {...P('𐤉𐤄𐤅𐤄'), en: 'Yahawah', role: 'Waw in the Name'},
           {...P('𐤔𐤌𐤅'), en: 'his name', role: 'Waw as the suffix "his"'},
           {...P('𐤉𐤄𐤅𐤃𐤄'), en: 'Judah', role: 'Waw in a name'} ],
  after: 'Same letter, same sound, every time: Wa in WaThaAmar, wa in Iwad, Yahawah and Yahawadah, w at the end of Shamaw.'
 },
 guideH2: 'Transliteration guide: medial and final',
 guideP: "Each letter has two written forms. Inside a word (medial) it is the letter's sound followed by a, so the word can be spoken. At the end of a word (final) it is the letter's sound alone. Aleph and Ayin are vowel-like letters, written a and i in both places. That is the whole rule; it never changes.",
 guide,
 compareH2: 'Compared with common transliterations',
 compareP: 'The same words, spelled the common way and spelled letter for letter. The Letters column counts the letters actually written. Notice the e: the common spellings are full of it, and BLD Bible never writes one.',
 origins: {
  h2: 'How the Paleo-Hebrew letters became the English Alphabet',
  p: ['The English Alphabet grew out of these letters, and not the other way round. The Greeks took the Paleo-Hebrew letters, the Romans took them from the Greeks, and English is written in the Romans\' letters, so most of the letters you are reading now began as Paleo-Hebrew letters. The English A comes from 𐤀 Alap, by way of the Greek alpha: turn 𐤀 a quarter turn and it is an A. The English E comes from 𐤄 Hay, by way of the Greek epsilon: turn 𐤄 to face the other way and it is an E.',
      'So when Elohim begins with E, it writes an Alap with the letter that came from Hay. BLD Bible writes 𐤀 as A, the letter that grew out of it, and 𐤄 as ha or h, the sound of the letter itself: Alahayam. There is no e in BLD Bible, because no Hebrew letter is an E.'],
  pairs: [ { paleo: '𐤀', name: 'Alap', turn: 'rotate', via: 'Greek alpha', latin: 'A', bld: 'a' },
           { paleo: '𐤄', name: 'Hay', turn: 'mirror', via: 'Greek epsilon', latin: 'E', bld: 'ha / h' } ],
  looksH3: 'Letters you can see in the shapes',
  looksP: 'Three of the letters passed no letter on to the English Alphabet, but look at them and you can still see its letters in them. These are likenesses in the shapes, not letters the English Alphabet took from them.',
  looks: Object.entries(LOOKS).map(([l, v]) => ({ letter: l, name: NAMES[l], ...v })),
  allH3: 'All 22 letters, from Paleo-Hebrew through Greek to the English Alphabet',
  allP: 'Waw alone gave the English Alphabet five letters: F, U, V, W and Y. Gamal gave C, and G was later made from C; Yad gave I, and J was later made from I. Three letters passed into Greek but not into the English Alphabet: Tayath (theta), Samak (xi) and Tzaday (an early Greek letter later dropped). The English S comes from Shayan, not Samak, and the English X came from a different Greek letter.',
  // Phoenician/Paleo-Hebrew -> Greek -> Latin (standard history of the alphabet; checked 2026-11-25).
  all: [
   ['𐤀','Α alpha','A'], ['𐤁','Β beta','B'], ['𐤂','Γ gamma','C, G'], ['𐤃','Δ delta','D'], ['𐤄','Ε epsilon','E'],
   ['𐤅','Ϝ digamma, Υ upsilon','F, U, V, W, Y'], ['𐤆','Ζ zeta','Z'], ['𐤇','Η eta','H'], ['𐤈','Θ theta','—'], ['𐤉','Ι iota','I, J'],
   ['𐤊','Κ kappa','K'], ['𐤋','Λ lambda','L'], ['𐤌','Μ mu','M'], ['𐤍','Ν nu','N'], ['𐤎','Ξ xi','—'],
   ['𐤏','Ο omicron','O'], ['𐤐','Π pi','P'], ['𐤑','Ϻ san','—'], ['𐤒','Ϙ koppa','Q'], ['𐤓','Ρ rho','R'],
   ['𐤔','Σ sigma','S'], ['𐤕','Τ tau','T'],
  ].map(([l, greek, latin]) => ({ letter: l, name: NAMES[l], greek, latin, looks: LOOKS[l] ? LOOKS[l].latin : undefined, bld: `${CHAR_MAP[l].med} / ${CHAR_MAP[l].fin}`.replace(/^(\w+) \/ \1$/, '$1') })),
 },
 compare: [
  cmp('𐤉𐤄𐤅𐤃𐤄','Yehudah','e written after the Yad; Waw read as u'),
  cmp('𐤅𐤉𐤀𐤌𐤓','vayomer','Waw read as v; Alap silent; e written before the Rash', [0,1,2]),
  cmp('𐤃𐤅𐤃','David','Waw read as v'),
  cmp('𐤔𐤋𐤅𐤌','shalom','Waw read as o'),
  cmp('𐤉𐤓𐤅𐤔𐤋𐤌','Yerushalayim','e written after the Yad; Waw read as u; adds a y the letters do not have'),
  cmp('𐤌𐤔𐤄','Moshe','final Hay dropped, an e written in its place'),
  cmp('𐤉𐤏𐤒𐤁','Yaakov','Ayin silent; Bayath read as v'),
  cmp('𐤔𐤁𐤕','Shabbat','Bayath doubled; Thaw read as t'),
  cmp('𐤀𐤋𐤄𐤉𐤌','Elohim','Alap written E; Yad read as the vowel i'),
 ],
 more: [
  { id: 'what', h2: 'What is Paleo-Hebrew?',
    p: ["Paleo-Hebrew is the ancient Hebrew alphabet: the letters of Israel's inscriptions from the time of the kings, such as the tunnel inscription cut under Yarawashalam (Jerusalem) in the days of Chazaqayah (Hezekiah). After the exile to Babal (Babylon), scribes came to write Hebrew in the square letters of the Aramaic script, and that square script is what most printed Hebrew Bibles use today.",
        "The words are the same in both scripts; only the shapes of the letters differ. Among the Dead Sea Scrolls, some books are copied entirely in Paleo-Hebrew, and in several scrolls written in square letters the Name of Yahawah stands out in Paleo-Hebrew letters. BLD Bible shows the text in the ancient letters throughout."] },
  { id: 'words', h2: 'Every word, part by part',
    p: ["Tap any word and it opens into its parts: the prefixes, the root, the suffixes, and what each one adds (and, the, in, his, plural). Every root carries its Strong's number and links to every other verse where it stands, so you can follow a word through the whole Bible."],
    links: [{ to: '/lexicon-page', label: 'Lexicon' }, { to: '/roots?sn=H1254', label: 'Root Explorer: Baraa (create), H1254' }] },
 ],
 faqH2: 'Questions',
 faq: [
  { q: 'Can I read the whole Bible in Paleo-Hebrew?', a: 'Yes. BLD Bible shows every book of the Hebrew Bible, and Hebrew editions of the New Testament and the Apocrypha, in Paleo-Hebrew letters, free to read online.' },
  { q: 'Can I read a Paleo Hebrew Bible with English?', a: 'Yes. The Parallel Bible puts the English beside the Paleo-Hebrew verse by verse, with each English word linked to its Hebrew word, and every verse has a page of its own with the Hebrew word by word.' },
  { q: 'Why Yahawadah and not Yehudah?', a: 'Because the name is written with five letters, Yad, Hay, Waw, Dalath, Hay, and each letter keeps its one sound: Ya-ha-wa-da-h. The common spelling reads the Waw as u, so the same letter sounds different in Judah than it does in the word "and".' },
  { q: 'Is Paleo-Hebrew a different language from Hebrew?', a: 'No. It is the same Hebrew language written in its ancient alphabet. The letters correspond one to one with the later square letters, so the words and their spelling do not change.' },
  { q: 'Where do I start?', a: 'Open BaRaashayath (Genesis) 1 in the Paleo Hebrew reader, or the Parallel Bible if you want the English beside it.' },
 ],
};
d.sample.legend = legendOf(d.sample.words);
d.waw.legend = legendOf(d.waw.words);
d.colorsNote = 'Colours: each part of a word keeps one colour in the Paleo letters and in the transliteration, the same colours the Paleo Hebrew reader uses. The root is gold; every modification (and, the, in, she, his …) has its own colour.';
{ const n = d.sample.words.reduce((k, w) => k + w.pieces.filter((p) => p[4] !== false).length, 0); d.sample.note = d.sample.note.replaceAll('{N}', String(n)); }
fs.writeFileSync(new URL('../server/seo/paleo-hebrew-bible.json', import.meta.url), JSON.stringify(d, null, 1) + '\n');
console.log(d.waw.words.map(w=>w.translit).join(' '));
console.log(d.compare.map(c=>c.common+' -> '+c.bld+' ('+c.letters+')').join('\n'));
