import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });
const rows = db.prepare(`
    SELECT chapter, verse, text_src, text
    FROM verses WHERE corpus='ENG' AND code='MAT' AND chapter=1 AND verse IN (6,7)
`).all();
for (const r of rows) {
    console.log(`\nMAT 1:${r.verse}`);
    console.log(`  text_src: ${r.text_src}`);
    console.log(`  text    : ${r.text}`);
    console.log(`  text_src has "(...)" parenthetical: ${/\([^)]*\)/.test(r.text_src)}`);
}
