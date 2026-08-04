#!/usr/bin/env node
'use strict';
/*
 * fix-period-comma.js — one-off backfill for a punctuation artifact found in
 * Pistis Sophia (ps068.htm, sacred-texts.com): "...outside the Treasury of
 * the Light., and which..." — a period directly followed by a comma, which
 * is never correct English punctuation. Confirmed present verbatim in Mead's
 * own 1921 source text, not something this app's ingestion introduced — the
 * sentence plainly continues past that point, so the comma is the real
 * punctuation and the period is the stray one.
 *
 * ingest-gnostic-priority.py's strip_tags() now fixes this at ingest time for
 * any FUTURE (re-)crawl (see its "_fix_period_comma" block, added alongside
 * this script), but the row(s) already sitting in corpus.db from the
 * original crawl predate that fix. This is the same one-off-backfill pattern
 * as backfill-name-map.js: run once against the live corpus.db, idempotent
 * (a verse with no ".," left is a no-op on re-run), safe to re-run any time.
 *
 * SCOPED TO PISTIS SOPHIA ONLY (code LIKE 'PISTIS_SOPHIA_%') — a first,
 * corpus-wide dry-run turned up two classes of false positive this pattern
 * alone can't safely distinguish everywhere: a genuine ellipsis immediately
 * before a comma ("Māhawai ..., is spoilt" — three real dots, not a stray
 * one) and citation abbreviations this script didn't know about ("[Arm.,
 * Milan, Paris:" — "Arm." for "Armenian [manuscript]"). The ellipsis case is
 * now excluded structurally (a negative lookbehind refuses to match a period
 * that is itself preceded by another period, so a "..." run is never
 * touched). The abbreviation case has no such structural fix — "Arm." looks
 * exactly like an ordinary capitalized word ending a sentence unless you
 * already know it's Armenian — so rather than guess at more abbreviations
 * across six OTHER books never individually checked against their own
 * sources, this only fixes the one instance actually verified against the
 * live sacred-texts.com source (see the file-level comment above). Pass
 * --book=<canon_id> to point it at a different single book after checking
 * THAT book's own source the same way.
 *
 * Usage:
 *   node fix-period-comma.js                    preview + report only
 *   node fix-period-comma.js --apply             actually write the fix
 *   node fix-period-comma.js --book=203 --apply  a different single book,
 *                                                 after verifying its source
 */
const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const CORPUS = path.join(__dirname, 'corpus.db');
const bookArg = process.argv.find(a => a.startsWith('--book='));
const BOOK_FILTER = bookArg
  ? { where: 'canon_id = ?', param: parseInt(bookArg.split('=')[1], 10) }
  : { where: "code LIKE 'PISTIS_SOPHIA_%'", param: null };

// A period is only ever the stray artifact this script targets when it is a
// LONE period — not preceded by another period (that's an ellipsis, a
// legitimate 3-dot run, never to be touched) and not part of a known
// abbreviation immediately before it.
const ABBR_BEFORE_COMMA = /\b(?:etc|al|viz|cf|i\.e|e\.g)$/i;

function fixPeriodComma(text) {
  return text.replace(/(?<!\.)\.\s*,/g, (m, offset, full) => {
    const before = full.slice(0, offset);
    return ABBR_BEFORE_COMMA.test(before) ? m : ',';
  });
}

const db = new Database(CORPUS, { readonly: !APPLY });
const rows = BOOK_FILTER.param == null
  ? db.prepare(
      `SELECT id, canon_id, code, text FROM verses WHERE corpus='ENG' AND ${BOOK_FILTER.where} AND text LIKE '%.,%'`
    ).all()
  : db.prepare(
      `SELECT id, canon_id, code, text FROM verses WHERE corpus='ENG' AND ${BOOK_FILTER.where} AND text LIKE '%.,%'`
    ).all(BOOK_FILTER.param);

const upd = db.prepare('UPDATE verses SET text=? WHERE id=?');
let changed = 0;
const byBook = {};
const sample = [];

const apply = db.transaction(() => {
  for (const r of rows) {
    const t = fixPeriodComma(r.text);
    if (t === r.text) continue;
    changed++;
    const key = r.canon_id != null ? r.canon_id : `doc:${r.code}`;
    byBook[key] = (byBook[key] || 0) + 1;
    if (sample.length < 12) {
      sample.push({ id: r.id, book: key, before: r.text.slice(0, 90), after: t.slice(0, 90) });
    }
    if (APPLY) upd.run(t, r.id);
  }
});
apply();

console.log(`${APPLY ? 'fixed' : '[dry-run] would fix'} ${changed} / ${rows.length} candidate English verses ` +
            `across ${Object.keys(byBook).length} book(s)`);
console.log('\nsample changes:');
for (const s of sample) console.log(`  #${s.id} (book ${s.book})\n    - ${s.before}\n    + ${s.after}`);

if (!APPLY) {
  console.log('\nNo changes written. Re-run with --apply to write them.');
} else {
  console.log('\nDone. Restart the server to serve the fixed text.');
}
db.close();
