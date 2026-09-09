#!/usr/bin/env node
/**
 * verify-name-forms.mjs — fail the deploy if the rendered English spells a
 * locked name the wrong way, or glosses the divine name with a human's name.
 *
 * WHY (2026-09-09): prod showed "Adam (Edom)" in Ezekiel 25 while corpus.db had
 * "Adawam (Edom)" in all 91 verses. The READER's text comes from translation.db,
 * whose 55,793 pre-seeded rows ('web-passthrough' / 'corpus-reseed') were copied
 * from an older render — so the corpus fix never reached the page, and nothing
 * in the deploy compared the live data against the rules the app is built on.
 * The same scan found "Yahawah (Saul)" / "Yahawah (David)" ×9 each in 1 Samuel.
 *
 * RULES: server/lexicon/name-form-rules.json (shared with fix-name-forms.mjs)
 *   must:          { "Edom": ["Adawam"], … } — every "X (Edom)" must have X in the list
 *   divineAsHuman: Yahawah / Alahayam / Adanay glossed "(Saul)" etc. is a violation
 *   replace:       YHWH / Jehovah / the LORD → "Yahawah ()" — a violation until fixed
 *   forbidden:     [{ pattern, why }]
 * EVERY rule fails the deploy (fieldy: "warnings are issues and should stop the deployment").
 * Empty glosses "()" are the app's own gold-headword marker and are NOT flagged.
 *
 * USAGE:  node verify-name-forms.mjs [corpus.db] [translation.db]
 * Exit 0 = pass, exit 1 = violations (each printed with its reference).
 * Fix them with:  node fix-name-forms.mjs [corpus.db] [translation.db]
 * Wired into deploy-blue-green.sh next to verify-verse-completeness.mjs.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules, checkText, bareNames } from './name-form-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DB = process.argv[2] || path.join(__dirname, 'corpus.db');
const TRANS_DB = process.argv[3] || path.join(__dirname, 'translation.db');
function die(m) { console.error('✗ ' + m); process.exit(1); }
if (!existsSync(CORPUS_DB)) die(`corpus.db not found: ${CORPUS_DB}`);
const R = loadRules();
console.log(`verify-name-forms: ${Object.keys(R.must).length} locked names, divine-as-human check, ${R.replace.length} rewrites, ${R.forbidden.length} forbidden patterns — every hit fails`);

const violations = [];
function scan(label, rows) {
  let n = 0;
  for (const r of rows) {
    if (!r.text) continue;
    n++;
    const c = checkText(r.text, R);
    for (const x of c.violations) violations.push(`${label} ${r.ref}  "${x.text}"  — ${x.why}`);
    if ((r.status || 'none') === 'none') for (const x of bareNames(c.fixed, R).hits) violations.push(`${label} ${r.ref}  "${x.text}"  — ${x.why} → ${x.fix}`);
  }
  console.log(`  scanned ${n.toLocaleString()} ${label} verses`);
}
const cdb = new Database(CORPUS_DB, { readonly: true });
scan('corpus', cdb.prepare(`SELECT canon_id||':'||ord_c||':'||ord_v AS ref, text FROM verses WHERE corpus = 'ENG'`).all());
if (existsSync(TRANS_DB)) {
  const tdb = new Database(TRANS_DB, { readonly: true });
  scan('translation', tdb.prepare(`SELECT book_id||':'||chapter||':'||verse AS ref, status, text FROM translations`).all());
} else console.log(`  (no translation.db at ${TRANS_DB} — reader rows not checked)`);

if (violations.length) {
  for (const v of violations.slice(0, 200)) console.error('  ✗ ' + v);
  if (violations.length > 200) console.error(`  ✗ … ${violations.length - 200} more`);
  die(`${violations.length} name-form violation(s). Run: node fix-name-forms.mjs ${CORPUS_DB} ${TRANS_DB}`);
}
console.log('✓ name forms OK');
process.exit(0);
