#!/usr/bin/env node
'use strict';
/*
 * fix-square-hebrew.js  (v2)
 *
 * Finds and converts every square-Hebrew leak in corpus.db. Works from the DATA,
 * not from the loader: ingest-hebrew-nt.js only writes canon_id 40-66, so it cannot
 * be the source of the Leviticus text — whatever wrote those OT rows is gone from
 * server/. Any verse holding a Hebrew-block codepoint is a leak no matter what put
 * it there, so we find it that way and the check keeps working after future ingests.
 *
 * ── WHAT v1 GOT WRONG (both fixed here) ─────────────────────────────────────
 *
 * 1. IT LEFT 200 VERSES BEHIND and still reported success.
 *    v1 dropped only U+0591-U+05C7. The Hebrew block runs to U+05FF, so geresh (׳),
 *    gershayim (״) and the Yiddish ligatures (U+05F0-05F2) were neither mapped nor
 *    dropped — they passed straight through. v2 drops ANY unmapped Hebrew-block
 *    character, and EXITS NONZERO if the postcondition isn't met instead of printing
 *    a cheerful "must be 0" next to a non-zero number.
 *
 * 2. IT DELETED LETTERS.
 *    v1 discarded U+FB1D-FB4F outright, so a presentation form like שׁ (U+FB2A,
 *    shin-with-dot as ONE codepoint) lost the shin entirely. v2 NFKD-normalizes
 *    first, decomposing it to base letter + mark, so the letter survives and only
 *    the mark is dropped.
 *
 * 3. IT DAMAGED NON-HEBREW VERSES.
 *    v1's toPaleo ended with .replace(/\s+/g,' '), which flattens newlines. Eight
 *    rows (5 LAT, 5 GRC, 1 ENG) contain a stray Hebrew character and got swept into
 *    the conversion, losing their poetic line breaks. v2 collapses spaces/tabs only,
 *    never newlines, AND only touches corpus='HEB' unless you pass --all.
 *    To repair the rows v1 already damaged:  --repair-nonheb corpus.db.bak
 *
 * Usage
 *   node fix-square-hebrew.js                        audit only, writes nothing
 *   node fix-square-hebrew.js --apply                convert corpus='HEB'
 *   node fix-square-hebrew.js --apply --all          also convert other corpora
 *   node fix-square-hebrew.js --repair-nonheb corpus.db.bak
 *                                                    restore the 8 non-HEB rows v1 mangled
 */
const path = require('path');
const Database = require('better-sqlite3');

const argv   = process.argv;
const APPLY  = argv.includes('--apply');
const ALL    = argv.includes('--all');
const ri     = argv.indexOf('--repair-nonheb');
const REPAIR = ri >= 0 ? argv[ri + 1] : null;
const DB     = path.join(__dirname, 'corpus.db');

// 22 consonants 1:1; finals fold to base. Same table as ingest-hebrew-nt.js.
const HEB2PALEO = (() => {
  const base  = 'אבגדהוזחטיכלמנסעפצקרשת';
  const paleo = [...'𐤀𐤁𐤂𐤃𐤄𐤅𐤆𐤇𐤈𐤉𐤊𐤋𐤌𐤍𐤎𐤏𐤐𐤑𐤒𐤓𐤔𐤕'];
  const m = {}; [...base].forEach((h, i) => { m[h] = paleo[i]; });
  for (const [f, b] of Object.entries({ 'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ' })) m[f] = m[b];
  return m;
})();
const inHebBlock = cp => (cp >= 0x0590 && cp <= 0x05FF) || (cp >= 0xFB1D && cp <= 0xFB4F);
const SQUARE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

function toPaleo(s) {
  let out = '';
  for (const ch of String(s || '').normalize('NFKD')) {   // decompose presentation forms
    if (ch === '\u05BE') { out += ' '; continue; }        // maqaf -> space (splits words)
    if (HEB2PALEO[ch])   { out += HEB2PALEO[ch]; continue; }
    if (inHebBlock(ch.codePointAt(0))) continue;          // points, accents, geresh, ligatures
    out += ch;                                            // everything else untouched
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '');  // never touch newlines
}

// ── repair mode: restore non-HEB rows that v1 flattened ──────────────────────
if (REPAIR) {
  const db = new Database(DB);
  db.exec(`ATTACH DATABASE '${REPAIR.replace(/'/g, "''")}' AS bak`);
  const bad = db.prepare(
    "SELECT id FROM verses WHERE corpus <> 'HEB' AND text IS NOT NULL AND text <> ''"
  ).all().map(r => r.id);
  const upd = db.prepare(
    'UPDATE verses SET text = (SELECT b.text FROM bak.verses b WHERE b.id = verses.id) ' +
    'WHERE id = ? AND EXISTS (SELECT 1 FROM bak.verses b WHERE b.id = verses.id AND b.text <> verses.text)'
  );
  let n = 0;
  db.transaction(() => { for (const id of bad) n += upd.run(id).changes; })();
  console.log(`✓ restored ${n} non-HEB verse(s) from ${REPAIR} (line breaks and all)`);
  db.close();
  process.exit(0);
}

const db = new Database(DB, { readonly: !APPLY });
const cols = db.prepare('PRAGMA table_info(verses)').all().map(c => c.name);
const hasCanon = cols.includes('canon_id');
const rows = db.prepare(
  `SELECT id, corpus, ${hasCanon ? 'canon_id' : 'NULL AS canon_id'}, text
     FROM verses WHERE text IS NOT NULL AND text <> ''`
).all();

const leaks = rows.filter(r => SQUARE.test(r.text));
const target = leaks.filter(r => ALL || r.corpus === 'HEB');
const skipped = leaks.length - target.length;

const byCorpus = {};
for (const r of leaks) {
  const k = r.corpus || '(null)';
  (byCorpus[k] ||= { n: 0, books: new Set(), sample: null });
  byCorpus[k].n++;
  if (r.canon_id != null) byCorpus[k].books.add(r.canon_id);
  if (!byCorpus[k].sample) byCorpus[k].sample = r;
}

console.log(`scanned ${rows.length.toLocaleString()} verses`);
console.log(`square-Hebrew leaks: ${leaks.length.toLocaleString()}\n`);
for (const [corpus, d] of Object.entries(byCorpus).sort((a, b) => b[1].n - a[1].n)) {
  const bl = [...d.books].sort((a, b) => a - b);
  const mark = (ALL || corpus === 'HEB') ? 'CONVERT' : 'skip   ';
  console.log(`  [${mark}] corpus='${corpus}'  ${String(d.n).padStart(6)} verses  ` +
              (bl.length ? `canon_id ${bl[0]}-${bl[bl.length-1]} (${bl.length} books)` : ''));
  console.log(`            before: ${JSON.stringify(d.sample.text.slice(0, 52))}`);
  console.log(`            after : ${JSON.stringify(toPaleo(d.sample.text).slice(0, 52))}`);
}
if (skipped) console.log(`\n  ${skipped} leak(s) in non-Hebrew corpora are SKIPPED — a stray Hebrew\n` +
                         `  character quoted inside Latin/Greek/English is not a Paleo-source\n` +
                         `  problem. Pass --all if you really want them converted.`);

if (!APPLY) { console.log('\n[audit only] nothing written. Re-run with --apply.'); db.close(); process.exit(0); }

const upd = db.prepare('UPDATE verses SET text=? WHERE id=?');
let changed = 0, emptied = 0;
db.transaction(() => {
  for (const r of target) {
    const t = toPaleo(r.text);
    if (!t) { emptied++; continue; }   // never silently blank a verse
    upd.run(t, r.id); changed++;
  }
})();
console.log(`\n✓ converted ${changed.toLocaleString()} verses to Paleo`);
if (emptied) console.log(`  ⚠ ${emptied} row(s) would convert to EMPTY and were left unchanged — inspect them.`);

// hard postcondition — fail loudly, do not congratulate ourselves
const left = db.prepare("SELECT id, corpus, text FROM verses WHERE text IS NOT NULL AND text <> ''")
  .all().filter(r => SQUARE.test(r.text) && (ALL || r.corpus === 'HEB'));
console.log(`  postcondition — target verses still containing square Hebrew: ${left.length}`);
if (left.length) {
  console.error('\n✗ CONVERSION INCOMPLETE. Offending rows:');
  for (const r of left.slice(0, 5)) {
    const chars = [...new Set([...r.text].filter(c => SQUARE.test(c)))]
      .map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
    console.error(`   id=${r.id} corpus=${r.corpus} unmapped: ${chars}`);
  }
  db.close(); process.exit(1);
}
console.log('\n✓ zero modern Hebrew remaining. Restart the server.');
db.close();
