#!/usr/bin/env node
/**
 * verify-name-forms.mjs — fail the deploy if the rendered English spells a
 * locked name the wrong way.
 *
 * WHY (2026-09-09): prod showed "Adam (Edom)" in Ezekiel 25 while the corpus
 * on fieldy's machine had "Adawam (Edom)" in all 91 verses — the corpus.db on
 * the host volume was an older render, and nothing in the deploy compared the
 * live data against the rules the app is built on. Edom is Adawam, always.
 *
 * RULES: server/lexicon/name-form-rules.json
 *   must:      { "Edom": ["Adawam"], … } — every "X (Edom)" must have X in that list
 *   forbidden: [{ pattern, why, warn? }] — regexes that may never appear in ENG text (warn: report, don't fail)
 * A verse with an empty gloss "()" is reported as a warning (it does not fail).
 *
 * USAGE:  node verify-name-forms.mjs [corpus.db]     (default ./corpus.db)
 * Exit 0 = pass, exit 1 = violations (each printed with its reference).
 * Wired into deploy-blue-green.sh next to verify-verse-completeness.mjs.
 */
import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DB = process.argv[2] || path.join(__dirname, 'corpus.db');
const RULES_PATH = path.join(__dirname, 'lexicon', 'name-form-rules.json');
function die(m) { console.error('✗ ' + m); process.exit(1); }
if (!existsSync(CORPUS_DB)) die(`corpus.db not found: ${CORPUS_DB}`);
if (!existsSync(RULES_PATH)) die(`rules not found: ${RULES_PATH}`);
const rules = JSON.parse(readFileSync(RULES_PATH, 'utf8'));
const must = rules.must || {};
const forbidden = (rules.forbidden || []).map(f => ({ re: new RegExp(f.pattern, 'g'), why: f.why, warn: !!f.warn }));

const db = new Database(CORPUS_DB, { readonly: true });
const rows = db.prepare(`SELECT canon_id, ord_c, ord_v, text FROM verses WHERE corpus = 'ENG' AND text IS NOT NULL`).all();
console.log(`verify-name-forms: ${rows.length.toLocaleString()} ENG verses in ${CORPUS_DB}; ${Object.keys(must).length} locked names, ${forbidden.length} forbidden patterns`);

const mustRe = Object.keys(must).length
  ? new RegExp(`([A-Za-z'\\-]+) \\((${Object.keys(must).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\)`, 'g')
  : null;
const violations = [];
const warnings = [];
for (const r of rows) {
  const ref = `${r.canon_id}:${r.ord_c}:${r.ord_v}`;
  if (mustRe) {
    for (const m of r.text.matchAll(mustRe)) {
      const [, tr, name] = m;
      const ok = [].concat(must[name]);
      if (!ok.includes(tr)) violations.push(`${ref}  "${tr} (${name})"  — must be ${ok.map(o => `"${o} (${name})"`).join(' or ')}`);
    }
  }
  for (const f of forbidden) {
    f.re.lastIndex = 0;
    const m = f.re.exec(r.text);
    if (m) (f.warn ? warnings : violations).push(`${ref}  "${m[0]}"  — ${f.why}`);
  }
  if (/\(\)/.test(r.text)) warnings.push(`${ref}  empty gloss "()"`);
}
for (const w of warnings.slice(0, 20)) console.log('  ⚠ ' + w);
if (warnings.length > 20) console.log(`  ⚠ … ${warnings.length - 20} more empty-gloss verses`);
if (violations.length) {
  for (const v of violations.slice(0, 200)) console.error('  ✗ ' + v);
  if (violations.length > 200) console.error(`  ✗ … ${violations.length - 200} more`);
  die(`${violations.length} name-form violation(s). The corpus on this volume does not match the rules the app is built on — re-render / re-sync corpus.db before deploying.`);
}
console.log(`✓ name forms OK (${warnings.length} empty-gloss warning(s))`);
process.exit(0);
