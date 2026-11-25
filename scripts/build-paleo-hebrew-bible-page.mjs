// Writes server/seo/paleo-hebrew-bible.json (the /paleo-hebrew-bible page). Every transliteration and the medial/final guide come from src/lib/books.js, so they always match the app.
import { CHAR_MAP, translit } from '../src/lib/books.js';
import fs from 'fs';
const P = (w, caps = [0], en = '', role = '') => {
  const ch = [...w];
  const pieces = ch.map((c, i) => {
    let s = i === ch.length - 1 ? CHAR_MAP[c].fin : CHAR_MAP[c].med;
    if (caps.includes(i)) s = s[0].toUpperCase() + s.slice(1);
    return [c, s];
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
const cmp = (w, common, note, caps) => { const p = P(w, caps); return { paleo: w, common, bld: p.translit, letters: [...w].length, note }; };
const d = {
 _comment: "ONE copy of the /paleo-hebrew-bible page's words, read by src/pages/PaleoHebrewBible.jsx and server/prerender.js. Paleo letters only — no square script (RULE ZERO). The guide's medial/final values and every transliteration here were generated from src/lib/books.js CHAR_MAP/translit — edit the words in scripts/build-paleo-hebrew-bible-page.mjs and run it (node scripts/build-paleo-hebrew-bible-page.mjs).",
 path: '/paleo-hebrew-bible',
 title: 'Paleo Hebrew Bible — The Whole Scriptures in Paleo-Hebrew with English | BLD Bible',
 description: "Read the entire scriptures in Paleo-Hebrew letters alongside the English, with a transliteration that keeps every letter of the Hebrew: one letter, one sound, nothing dropped. Free to read online.",
 h1: 'Paleo Hebrew Bible',
 kicker: 'The entire scriptures in Paleo-Hebrew letters, alongside the English',
 intro: "BLD Bible lets you read the entire scriptures in Paleo-Hebrew, the 22 letters Israel wrote with before the exile, with the English beside every verse. Every Hebrew word is also written out in Latin letters by one fixed rule: each Hebrew letter always gets the same sound, and every letter of the Hebrew is kept. Nothing is smoothed over, dropped or doubled.",
 sample: { ref: 'BaRaashayath (Genesis) 1:1', paleo: '𐤁𐤓𐤀𐤔𐤉𐤕 𐤁𐤓𐤀 𐤀𐤋𐤄𐤉𐤌 𐤀𐤕 𐤄𐤔𐤌𐤉𐤌 𐤅𐤀𐤕 𐤄𐤀𐤓𐤑', to: '/genesis/1/1', label: 'Open BaRaashayath (Genesis) 1:1 word by word' },
 sections: [
  { id: 'whole', h2: 'The entire scriptures in Paleo-Hebrew, alongside the English',
    p: ["Every book can be read in Paleo-Hebrew letters. The Old Testament is the Masoretic Hebrew text, letter for letter. The New Testament and the Apocrypha are read from Hebrew editions in the same letters, and so are many works beyond the canon in the Works Library.",
        "The Parallel Bible sets the English beside the Paleo-Hebrew verse by verse: point at an English word and its Hebrew word lights up, and the other way round. The Novel English Bible reads as plain English, with the names of people and places in their Hebrew form and their meaning beside them."],
    links: [{ to: '/parallel/genesis/1', label: 'English–Paleo Hebrew Parallel Bible' }, { to: '/?book=1&chapter=1', label: 'Paleo Hebrew reader: BaRaashayath (Genesis) 1' },
            { to: '/?book=40&chapter=1', label: 'The New Testament in Paleo-Hebrew: Matthew 1' }, { to: '/bible?book=1&chapter=1', label: 'Novel English Bible' }, { to: '/works', label: 'Works Library' }] },
  { id: 'every-letter', h2: 'Every letter kept',
    p: ["Most transliterations write Hebrew the way it is pronounced today, so the same letter turns into different sounds from word to word, silent letters disappear, and letters that are not written are added. BLD Bible does it mechanically instead: every Hebrew letter has one sound, written the same way in every word of every book.",
        "You can count it. A word of four Hebrew letters has four letter-sounds in its transliteration, in the same order. Where a word has a prefix or a suffix, a capital letter marks where the next part begins: WaThaAmar is Wa (and) + Tha (she) + Amar (said). And where the written word has lost a letter of its root, the root's letter is shown too: letters are added back, never taken away."] },
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
 compareP: 'The same words, spelled the common way and spelled letter for letter. The Hebrew letters column counts the letters actually written.',
 compare: [
  cmp('𐤉𐤄𐤅𐤃𐤄','Yehudah','Waw read as u'),
  cmp('𐤅𐤉𐤀𐤌𐤓','vayomer','Waw read as v; Aleph silent', [0,1,2]),
  cmp('𐤃𐤅𐤃','David','Waw read as v'),
  cmp('𐤔𐤋𐤅𐤌','shalom','Waw read as o'),
  cmp('𐤉𐤓𐤅𐤔𐤋𐤌','Yerushalayim','Waw read as u; adds a y the letters do not have'),
  cmp('𐤌𐤔𐤄','Moshe','final Hay dropped'),
  cmp('𐤉𐤏𐤒𐤁','Yaakov','Ayin silent; Bayath read as v'),
  cmp('𐤔𐤁𐤕','Shabbat','Bayath doubled; Thaw read as t'),
  cmp('𐤀𐤋𐤄𐤉𐤌','Elohim','Yad read as the vowel i'),
 ],
 more: [
  { id: 'what', h2: 'What is Paleo-Hebrew?',
    p: ["Paleo-Hebrew is the old Hebrew alphabet: the letters of Israel's inscriptions from the time of the kings, such as the tunnel inscription cut under Yarawashalam (Jerusalem) in the days of Chazaqayah (Hezekiah). After the exile to Babal (Babylon), scribes came to write Hebrew in the square letters of the Aramaic script, and that square script is what most printed Hebrew Bibles use today.",
        "The words are the same in both scripts; only the shapes of the letters differ. Among the Dead Sea Scrolls, some books are copied entirely in Paleo-Hebrew, and in several scrolls written in square letters the Name of Yahawah stands out in Paleo-Hebrew letters. BLD Bible shows the text in the older letters throughout."] },
  { id: 'words', h2: 'Every word, part by part',
    p: ["Tap any word and it opens into its parts: the prefixes, the root, the suffixes, and what each one adds (and, the, in, his, plural). Every root carries its Strong's number and links to every other verse where it stands, so you can follow a word through the whole Bible."],
    links: [{ to: '/lexicon-page', label: 'Lexicon' }, { to: '/roots?sn=H1254', label: 'Root Explorer: Baraa (create), H1254' }] },
 ],
 faqH2: 'Questions',
 faq: [
  { q: 'Can I read the whole Bible in Paleo-Hebrew?', a: 'Yes. BLD Bible shows every book of the Hebrew Bible, and Hebrew editions of the New Testament and the Apocrypha, in Paleo-Hebrew letters, free to read online.' },
  { q: 'Can I read a Paleo Hebrew Bible with English?', a: 'Yes. The Parallel Bible puts the English beside the Paleo-Hebrew verse by verse, with each English word linked to its Hebrew word, and every verse has a page of its own with the Hebrew word by word.' },
  { q: 'Why Yahawadah and not Yehudah?', a: 'Because the name is written with five letters, Yad, Hay, Waw, Dalath, Hay, and each letter keeps its one sound: Ya-ha-wa-da-h. The common spelling reads the Waw as u, so the same letter sounds different in Judah than it does in the word "and".' },
  { q: 'Is Paleo-Hebrew a different language from Hebrew?', a: 'No. It is the same Hebrew language written in an older alphabet. The letters correspond one to one with the later square letters, so the words and their spelling do not change.' },
  { q: 'Where do I start?', a: 'Open BaRaashayath (Genesis) 1 in the Paleo Hebrew reader, or the Parallel Bible if you want the English beside it.' },
 ],
};
fs.writeFileSync(new URL('../server/seo/paleo-hebrew-bible.json', import.meta.url), JSON.stringify(d, null, 1) + '\n');
console.log(d.waw.words.map(w=>w.translit).join(' '));
console.log(d.compare.map(c=>c.common+' -> '+c.bld+' ('+c.letters+')').join('\n'));
