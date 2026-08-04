// revert-and-reapply.mjs — full idempotent reset for non-OT English.
//
// PROBLEM: apply-word-map ran multiple times and stale pre-fills in translation.db
// make the reader show wrong text even when corpus.db ENG is correct.
//
// WHAT THIS DOES:
//   1. Strip all transliteration glosses from corpus.db ENG (non-OT) back to
//      plain English so we have a clean slate.
//   2. Clear stale non-OT pre-fills from translation.db.
//   3. VERIFY — if any verse still has a translit pattern, report it.
//
// After this, run:
//   node apply-word-map.mjs --apply   (one clean pass)
//   node reseed-translations.mjs      (seed translation.db from clean corpus.db ENG)
//   restart
//
//   node revert-and-reapply.mjs              report only
//   node revert-and-reapply.mjs --apply      do it

import { existsSync, readFileSync } from 'node:fs';
const APPLY = process.argv.includes('--apply');
const die = m => { console.error('\u2717 '+m); process.exit(1); };
let Database; try { ({default:Database}=await import('better-sqlite3')); } catch { die('run from server/'); }
if (!existsSync('./corpus.db')) die('corpus.db not found');

const db = new Database('./corpus.db', { readonly: !APPLY });

// OT canon_ids 1-39 — never touch these
const OT_MAX = 39;

// read non-OT ENG rows
const rows = db.prepare(`SELECT id, text FROM verses
  WHERE corpus='ENG' AND canon_id > ? AND text IS NOT NULL AND TRIM(text)<>''`).all(OT_MAX);
console.log(`non-OT ENG rows: ${rows.length.toLocaleString()}`);

// Strip "translit (english)" -> "english"  (restores the English word)
// Strip "translit (translit (english))" -> "english" first (doubled)
// Leave bare names ALONE — we can't reliably reverse them without the original text.
// The apply-word-map --apply will re-apply names from the map after this.
const stripped = [];
for (const r of rows) {
  let t = r.text;
  // first: un-double "w (w (e))" -> "w (e)"
  t = t.replace(/\b([a-z][a-z']*)\s+\(\1\s+\(([^)]+)\)\)/g, (m, tr, en) => `${tr} (${en})`);
  // then: strip "w (e)" -> "e"  for ALL translit-gloss pairs
  t = t.replace(/\b[a-z][a-z']*\s+\(([a-z][^)]*)\)/g, (m, gloss) => gloss.trim());
  // normalize double-spaces
  t = t.replace(/\s{2,}/g, ' ').trim();
  if (t !== r.text) stripped.push({ id: r.id, text: t });
}
console.log(`rows that would be stripped: ${stripped.length.toLocaleString()}`);

// sample
for (const r of stripped.slice(0,5)) {
  const orig = rows.find(x=>x.id===r.id);
  console.log(`\n  BEFORE: ${(orig?.text||'').slice(0,80)}`);
  console.log(`  AFTER : ${r.text.slice(0,80)}`);
}

// check translation.db
let tdbCount = 0;
if (existsSync('./translation.db')) {
  const tdb = new Database('./translation.db', { readonly: true });
  try { tdbCount = tdb.prepare(`SELECT COUNT(*) n FROM translations WHERE canon_id > ?`).get(OT_MAX).n; }
  catch { tdbCount = -1; }
  tdb.close();
}
console.log(`\ntranslation.db non-OT pre-fill rows: ${tdbCount}`);

if (!APPLY) { console.log('\n[report only] run with --apply to strip corpus.db + clear translation.db'); process.exit(0); }

// 1. strip corpus.db ENG
const upd = db.prepare('UPDATE verses SET text=? WHERE id=?');
let n=0; db.transaction(()=>{ for(const r of stripped) n+=upd.run(r.text,r.id).changes; })();
console.log(`\n\u2713 stripped ${n.toLocaleString()} corpus.db ENG rows to plain English`);
db.close();

// 2. clear translation.db non-OT pre-fills
if (tdbCount > 0) {
  const tdb = new Database('./translation.db');
  tdb.pragma('journal_mode=WAL');
  let d=0; try { d=tdb.prepare(`DELETE FROM translations WHERE canon_id > ? AND conf='baseline'`).run(OT_MAX).changes; } catch(e) {
    // try without conf column
    try { d=tdb.prepare(`DELETE FROM translations WHERE canon_id > ?`).run(OT_MAX).changes; } catch(e2) { console.log('translation.db delete failed:', e2.message); }
  }
  tdb.close();
  console.log(`\u2713 cleared ${d.toLocaleString()} stale non-OT pre-fills from translation.db`);
}

console.log('\nNow run:');
console.log('  node apply-word-map.mjs --apply   (re-apply names + terms cleanly)');
console.log('  node reseed-translations.mjs       (seed translation.db from clean corpus)');
console.log('  restart');
