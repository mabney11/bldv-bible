// fix-salmon-text-src.mjs
// Targeted repair for the Salmon/Solomon "Shalamah" collision (2026-07-27,
// see CLAUDE.md). text_src was corrupted for every NT verse mentioning Salmon
// (ancestor of Boaz) BEFORE "salmon" became an ambiguous/excluded name in
// word-map.json — the stale substitution got frozen in as if it were pristine
// English, and no current rule can ever match it to fix it (the literal word
// "Salmon" is gone from the snapshot).
//
// Scope: word-level, not verse-level. For each verse whose true pristine
// wording (english-web-raw.jsonl) contains "Salmon", this replaces ONLY the
// literal "Shalamah" token inside that verse's CURRENT text_src with "Salmon"
// — every other word in the verse (Amminadab/Imayanadab, Nahshon/Nachashawan,
// Boaz/Baiz, etc.) is left completely untouched, exactly as it already
// renders today. A first version of this script reset the WHOLE verse back
// to pristine, which would have thrown away those other names' already-
// correct transliterations too and relied on a re-render to restore them —
// unnecessary, since the corruption is one word, not the whole verse.
// Solomon's "Shalamah" (Matthew 1:6-7) is untouched: its pristine wording
// says "Solomon", not "Salmon", so it never matches this script's filter.
// Safety check: only applies when "Shalamah" appears EXACTLY ONCE in the
// verse's current text_src (so there's no ambiguity about which occurrence
// is Salmon's) — if a verse has a different count, it's reported but skipped.
//
//   node fix-salmon-text-src.mjs             report only, writes nothing
//   node fix-salmon-text-src.mjs --apply     apply the word-level fix
//
// After --apply: rerun `node render-corpus.mjs --from-src --apply` (name-forms.txt's
// new "salmon -> Shalamawan" pin will then correctly match the restored
// "Salmon" and produce a distinct, non-colliding rendering), then the rest of
// the usual render-all/verify chain, then restart the server.
import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APPLY = process.argv.includes('--apply');
if (!existsSync(path.join(__dirname, 'corpus.db'))) { console.error('corpus.db not found — run from server/'); process.exit(1); }
const db = new Database(path.join(__dirname, 'corpus.db'), { readonly: !APPLY });

const raw = new Map(); // `${code}|${chapter}|${verse}` -> pristine text
for (const line of readFileSync(path.join(__dirname, 'english-web-raw.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    raw.set(`${r.code}|${r.chapter}|${r.verse}`, r.text);
}

const rows = db.prepare(`
    SELECT canon_id, code, chapter, verse, text_src
    FROM verses WHERE corpus='ENG' AND canon_id > 39 AND text_src IS NOT NULL AND text_src <> ''
`).all();

const norm = s => s.replace(/\s+/g, ' ').trim();
const SHALAMAH_RE = /\bShalamah\b/g;
const matches = [], skipped = [];
for (const r of rows) {
    const key = `${r.code}|${r.chapter}|${r.verse}`;
    const pristine = raw.get(key);
    if (pristine == null) continue;
    if (!/\bSalmon\b/.test(pristine)) continue;           // must be the Salmon verse...
    if (norm(pristine) === norm(r.text_src)) continue;    // ...and actually stale
    const count = (r.text_src.match(SHALAMAH_RE) || []).length;
    if (count !== 1) { skipped.push({ ...r, count }); continue; }
    const fixed = r.text_src.replace(SHALAMAH_RE, 'Salmon');
    matches.push({ ...r, fixed });
}

console.log(`Verses to fix (word-level "Shalamah"->"Salmon"): ${matches.length}`);
for (const m of matches) {
    console.log(`\n${m.code} ${m.chapter}:${m.verse}`);
    console.log(`  before: ${m.text_src}`);
    console.log(`  after : ${m.fixed}`);
}
if (skipped.length) {
    console.log(`\nSkipped (unexpected "Shalamah" count, needs a look, not auto-fixed): ${skipped.length}`);
    for (const s of skipped) console.log(`  ${s.code} ${s.chapter}:${s.verse}  count=${s.count}  text_src=${s.text_src}`);
}

if (!APPLY) {
    console.log('\n[report only] nothing written. Re-run with --apply to apply this word-level fix.');
    db.close();
    process.exit(0);
}

const upd = db.prepare(`
    UPDATE verses SET text_src = ? WHERE corpus='ENG' AND code=? AND chapter=? AND verse=?
`);
let n = 0;
db.transaction(() => {
    for (const m of matches) { upd.run(m.fixed, m.code, m.chapter, m.verse); n++; }
})();
console.log(`\n✓ fixed text_src for ${n} verse(s) (word-level, everything else in each verse untouched).`);
console.log('Next: node render-corpus.mjs --from-src --apply   (then the rest of the usual render-all/verify chain, then restart the server)');
db.close();
