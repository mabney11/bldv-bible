// Diagnostic: why did the tokens_nt fallback fire 1,994 times corpus-wide but
// NOT for Matthew 1:4's "AthaShalamawan" specifically? Prints wordsOf()'s split
// of the raw HEB verse text side-by-side with tokens_nt's own token list, so we
// can see the exact ordinal/segmentation mismatch instead of guessing at it.
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// heb-align.js is CommonJS (module.exports) — use createRequire so this ESM
// script can pull splitWords/toPaleo out of it without duplicating the logic.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { splitWords: splitWords2, toPaleo: toPaleo2 } = require('./heb-align.js');

const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });

const verseCols = db.prepare(`PRAGMA table_info(verses)`).all().map(r => r.name);
const hasPaleoCol = verseCols.includes('text_paleo');

const row = db.prepare(`
    SELECT canon_id, ord_c, ord_v, text ${hasPaleoCol ? ', text_paleo' : ''}
    FROM verses WHERE corpus='HEB' AND canon_id=40 AND ord_c=1 AND ord_v=4
`).get();
console.log('--- verses row (corpus=HEB) ---');
console.log(row);

const hw = hasPaleoCol && row.text_paleo
    ? splitWords2(row.text_paleo)
    : splitWords2(row.text);
console.log('\n--- wordsOf() split (this is the `hw` array the NT loop iterates, 0-indexed; token_ordinal = index+1) ---');
hw.forEach((w, i) => console.log(`  [${i}] ordinal=${i + 1}  "${w}"  (len ${[...w].length})`));

const nt = db.prepare(`
    SELECT token_ordinal, word_raw, pos, morph, strongs
    FROM tokens_nt WHERE book_id=40 AND chapter=1 AND verse=4
    ORDER BY token_ordinal
`).all();
console.log('\n--- tokens_nt rows ---');
nt.forEach(t => console.log(`  ord=${t.token_ordinal}  word_raw="${t.word_raw}"  paleo(word_raw)="${toPaleo2(t.word_raw)}"  pos=${t.pos}  morph=${t.morph}  strongs=${t.strongs}`));
