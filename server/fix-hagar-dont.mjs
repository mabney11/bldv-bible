#!/usr/bin/env node
// fix-hagar-dont.mjs — one-off: "Don't" had been rendered as the name Hagar.
//   Genesis 21:17 (OT render):  "Hagar (Don't) be afraid" -> "Don't be afraid"
//   Zechariah 4:5 (hand verse, --translations pass):  "Hagar you yadai (know)" -> "Don't you yadai (know)"
// Root causes fixed in apply-web-strongs.mjs / render-corpus.mjs (contractions never map);
// this repairs the text already in the DBs. Idempotent. Dry run unless --apply.
//   node fix-hagar-dont.mjs [--corpus=./corpus.db] [--trans=./translation.db] [--apply]
import Database from 'better-sqlite3';
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : d; };
const APPLY = args.includes('--apply');
const RX = [[/\bHagar \((Don't|don't)\)/g, '$1'], [/\bHagar (you|be|let|do|we|they|I)\b/g, "Don't $1"]];
const fix = t => RX.reduce((s, [re, to]) => s.replace(re, to), t || '');
for (const [file, table, cols, key] of [
  [opt('--corpus', './corpus.db'), 'verses', ['text'], "corpus='ENG' AND text LIKE '%Hagar%'"],
  [opt('--trans', './translation.db'), 'translations', ['text', 'rich_text'], "(text LIKE '%Hagar%' OR rich_text LIKE '%Hagar%')"],
]) {
  const db = new Database(file, { readonly: !APPLY });
  const rows = db.prepare(`SELECT rowid AS rid, ${cols.join(',')} FROM ${table} WHERE ${key}`).all();
  const ch = rows.map(r => ({ rid: r.rid, out: cols.map(c => fix(r[c])), was: cols.map(c => r[c]) })).filter(x => x.out.some((v, i) => v !== x.was[i]));
  console.log(`${file}: ${ch.length} row(s) to fix`);
  for (const x of ch) { const i = x.out[0].indexOf("Don't"); console.log(`   …${x.out[0].slice(Math.max(0, i - 40), i + 40)}…`); }
  if (APPLY && ch.length) {
    const upd = db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c}=?`).join(',')} WHERE rowid=?`);
    db.transaction(() => { for (const x of ch) upd.run(...x.out, x.rid); })();
    console.log(`   ✓ written`);
  }
  db.close();
}
if (!APPLY) console.log('[dry run] add --apply to write');
