// Follow-up to diag-mat1-4.mjs: the terminal can't render paleo/square-Hebrew
// glyphs (shows "?"), so print codepoints instead. This settles two questions:
//   1. Is tokens_nt.word_raw stored in paleo (U+10900 block) or square Hebrew
//      (U+05xx block)?
//   2. Does toPaleo(word_raw) exactly equal the corresponding wordsOf() entry
//      once segmentation lines up (i.e. for a word NOT glued to a fused
//      particle), proving the fallback's comparison basis is otherwise sound?
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { splitWords, toPaleo } = require('./heb-align.js');

const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });
const cps = s => [...s].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');

const row = db.prepare(`
    SELECT text, text_paleo FROM verses
    WHERE corpus='HEB' AND canon_id=40 AND ord_c=1 AND ord_v=4
`).get();

console.log('=== verses.text (first word) codepoints ===');
console.log(cps(row.text.trim().split(/\s+/)[0]));
console.log('=== verses.text_paleo (first word) codepoints ===');
console.log(cps(row.text_paleo.trim().split(/\s+/)[0]));

const hw = splitWords(row.text_paleo);
console.log('\n=== wordsOf()/splitWords(text_paleo) words, as codepoints ===');
hw.forEach((w, i) => console.log(`[${i}] ord=${i + 1}:  ${cps(w)}`));

const nt = db.prepare(`
    SELECT token_ordinal, word_raw, strongs FROM tokens_nt
    WHERE book_id=40 AND chapter=1 AND verse=4 ORDER BY token_ordinal
`).all();
console.log('\n=== tokens_nt rows: word_raw codepoints, and toPaleo(word_raw) codepoints ===');
nt.forEach(t => {
    console.log(`ord=${t.token_ordinal} sn=${t.strongs}`);
    console.log(`   word_raw       : ${cps(t.word_raw)}`);
    console.log(`   toPaleo(word_raw): ${cps(toPaleo(t.word_raw))}`);
});

// Direct test: does any wordsOf() word equal toPaleo(some tokens_nt word_raw)?
console.log('\n=== cross-match test: wordsOf() word === toPaleo(tokens_nt.word_raw) ? ===');
for (let i = 0; i < hw.length; i++) {
    for (const t of nt) {
        if (toPaleo(t.word_raw) === hw[i]) {
            console.log(`wordsOf[${i}] ("${cps(hw[i])}") === toPaleo(tokens_nt ord=${t.token_ordinal}, sn=${t.strongs})  -> MATCH`);
        }
    }
}
