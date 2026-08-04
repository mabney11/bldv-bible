#!/usr/bin/env node
'use strict';
/*
 * glossify-terms.js — gloss common Hebrew-rooted terms ("spirit" -> "rawach
 * (spirit)", "sword" -> "charab (sword)", "king" -> "malak (king)", ...) across
 * every English verse in corpus.db, the same way sanitize-english.js does for
 * proper names.
 *
 * Term glossing already exists for canonical OT/NT (apply-web-strongs.mjs /
 * render-corpus.mjs align each English word against that verse's tagged
 * Hebrew/Greek Strong's number) — but that mechanism is structurally unavailable
 * for non-canonical works like Gospel of Thomas, Gospel of Philip, Pistis
 * Sophia, Acts of Paul and Thecla, Third Corinthians, or any future Nag Hammadi/
 * NT Apocrypha addition: those are plain ingested English prose with no
 * underlying Strong's-tagged tokens to align against at all. fieldy, 2026-07-30,
 * reviewing random samples: "spirit rawach... repent should use nacham... lets
 * make the corpus well glossed" — the same words ALREADY correctly gloss in the
 * canonical corpus, they just never reached these other texts.
 *
 * Source of truth: word-map.json's "terms" section (~440 entries) — the SAME
 * dominant-form choices apply-web-strongs.mjs already derived from the real,
 * frequency-weighted canonical corpus (e.g. "spirit":"rawach" at 95% of 231
 * occurrences, "repent":"nacham" at 80% of 15) — not hand-picked or guessed
 * here. If a word's dominant sense ever needs to change, that belongs in
 * word-map.json's own generation (apply-web-strongs.mjs), not a fork of it here.
 *
 * IDEMPOTENT / self-reference guarded, same as name-passthrough.js: a word
 * already sitting right after its OWN gloss ("malak (king)") is left alone
 * instead of being re-matched and turned into "malak (malak (king))" — this is
 * what makes it safe to run over canonical text too (already-glossed there,
 * so this is a no-op) without needing to scope the pass to non-canonical books
 * only.
 *
 * Usage:
 *   node glossify-terms.js            apply in place
 *   node glossify-terms.js --dry-run  preview counts + samples, write nothing
 */
const path = require('path');
const Database = require('better-sqlite3');

const DRY = process.argv.includes('--dry-run');
const CORPUS = path.join(__dirname, 'corpus.db');
const wordMap = require('./word-map.json');
const TERMS = wordMap.terms || {};

// Build a case-insensitive lookup; keys in word-map.json are already lowercase.
const TERM_KEYS = new Set(Object.keys(TERMS));

const WORD_RE = /[A-Za-z][A-Za-z']*/g;

function glossify(text) {
  // Protect EVERYTHING already inside parentheses before scanning at all — not
  // just the exact self-repeat case. First attempt at this script only guarded
  // "word directly after its OWN transliteration" (mirroring name-passthrough.js),
  // which missed the far more common case of a word sitting inside a DIFFERENT,
  // already-existing compound gloss: canonical text often glosses one Hebrew
  // root with several senses, e.g. "aratz (Earth/land)" — the bare word "land"
  // living inside that parenthetical is not a fresh, un-annotated occurrence to
  // gloss, it's already part of someone else's annotation. Scanning it anyway
  // produced garbage like "aratz (Earth/aratz (land))". Stashing every "(...)"
  // span first (innermost-out, so nested parens like "(Shamayam/(Heavens))" are
  // fully protected too) means the word-matcher only ever sees genuinely bare,
  // unglossed prose.
  const store = [];
  const stash = (s) => { store.push(s); return '\x00' + (store.length - 1) + '\x00'; };
  let protectedText = text;
  while (/\([^()]*\)/.test(protectedText)) {
    protectedText = protectedText.replace(/\([^()]*\)/g, (m) => stash(m));
  }
  protectedText = protectedText.replace(WORD_RE, (w) => {
    const lw = w.toLowerCase();
    const r = TERMS[lw];
    return r ? `${r} (${w})` : w;
  });
  // Restore must loop too: nested parens were stashed across MULTIPLE passes
  // above, so an outer placeholder's stored value can itself still contain an
  // unresolved inner placeholder ("(Shamayam/\x000\x00)"). A single-pass
  // restore left that inner marker literally in the output. Keep resolving
  // until no placeholder remains.
  while (/\x00\d+\x00/.test(protectedText)) {
    protectedText = protectedText.replace(/\x00(\d+)\x00/g, (_, i) => store[+i]);
  }
  return protectedText;
}

const db = new Database(CORPUS, { readonly: DRY });
const rows = db.prepare(
  "SELECT id, canon_id, code, text FROM verses WHERE corpus='ENG' AND text IS NOT NULL AND text <> ''"
).all();

const upd = db.prepare('UPDATE verses SET text=? WHERE id=?');
let changed = 0;
const byBook = {};
const sample = [];

const apply = db.transaction(() => {
  for (const r of rows) {
    const t = glossify(r.text);
    if (t === r.text) continue;
    changed++;
    const key = r.canon_id != null ? r.canon_id : `doc:${r.code}`;
    byBook[key] = (byBook[key] || 0) + 1;
    if (sample.length < 12) sample.push({ id: r.id, book: key, before: r.text.slice(0, 90), after: t.slice(0, 90) });
    if (!DRY) upd.run(t, r.id);
  }
});
apply();

console.log(`${DRY ? '[dry-run] would gloss' : 'glossed'} ${changed} / ${rows.length} English verses across ${Object.keys(byBook).length} books (${TERM_KEYS.size} known terms)`);
console.log('\nsample changes:');
for (const s of sample) console.log(`  #${s.id} (book ${s.book})\n    - ${s.before}\n    + ${s.after}`);

if (DRY) {
  console.log('\nNo changes written (--dry-run). Re-run without --dry-run to apply.');
} else {
  console.log('\nDone. Restart the server to serve the glossed text.');
}
db.close();
