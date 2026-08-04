// Diagnostic: how many untagged-corpus verses have a text_src that no longer
// matches the true pristine WEB wording in english-web-raw.jsonl? A mismatch
// here means --init-src captured its "pristine" snapshot AFTER some earlier
// names/terms substitution had already dirtied `text` — so text_src (which
// every --from-src rebuild treats as ground truth) is itself corrupted, and
// the corruption is permanent until text_src is explicitly reset for that row.
// Report only. Writes nothing.
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: true });

// verses table already carries its own `code` column — no external mapping needed.
const raw = new Map(); // `${code}|${chapter}|${verse}` -> pristine text
for (const line of readFileSync(path.join(__dirname, 'english-web-raw.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    raw.set(`${r.code}|${r.chapter}|${r.verse}`, r.text);
}
console.log(`english-web-raw.jsonl: ${raw.size.toLocaleString()} verses loaded`);

const cols = db.prepare(`PRAGMA table_info(verses)`).all().map(r => r.name);
if (!cols.includes('text_src')) { console.log('no text_src column — nothing to check'); process.exit(0); }

const rows = db.prepare(`
    SELECT canon_id, code, chapter, verse, text_src
    FROM verses WHERE corpus='ENG' AND canon_id > 39 AND text_src IS NOT NULL AND text_src <> ''
`).all();
console.log(`corpus.db ENG rows with text_src (canon_id>39): ${rows.length.toLocaleString()}`);

const norm = s => s.replace(/\s+/g, ' ').trim();
let mismatches = [];
for (const r of rows) {
    const code = r.code;
    if (!code) continue;
    const key = `${code}|${r.chapter}|${r.verse}`;
    const pristine = raw.get(key);
    if (pristine == null) continue;
    if (norm(pristine) !== norm(r.text_src)) {
        mismatches.push({ canon_id: r.canon_id, code, chapter: r.chapter, verse: r.verse,
                           pristine, text_src: r.text_src });
    }
}
console.log(`\nMISMATCHES between text_src and pristine english-web-raw.jsonl: ${mismatches.length.toLocaleString()}`);
for (const m of mismatches.slice(0, 30)) {
    console.log(`\n${m.code} ${m.chapter}:${m.verse}`);
    console.log(`  pristine : ${m.pristine}`);
    console.log(`  text_src : ${m.text_src}`);
}
if (mismatches.length > 30) console.log(`\n... and ${mismatches.length - 30} more`);
