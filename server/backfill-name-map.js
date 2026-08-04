#!/usr/bin/env node
'use strict';
/*
 * backfill-name-map.js — one-time migration.
 *
 * name-map.json (the original flat OT+NT name map, ~700 entries) includes NT
 * people/places: Jesus, Christ, Messiah, Mary, Peter, Paul, Philip, Thomas,
 * Andrew, James, Simon, John, Judas, Judea, Nazareth, Herod, Pilate, Matthew,
 * Timothy, Lazarus, Martha, Bartholomew, Cephas, Stephen, Barnabas, Caesar, etc.
 *
 * name-map-expanded.json — the richer single/phrases/theonyms map that
 * sanitize-english.js actually runs against every non-canonical work (Gospel of
 * Thomas, Gospel of Philip, Pistis Sophia, Acts of Paul and Thecla, Third
 * Corinthians, deuterocanon, pseudepigrapha, ...) — was rebuilt at some point
 * with that richer structure, but the rebuild only carried over the OT names.
 * None of the NT people/places made it across.
 *
 * The canonical NT reader looks fine anyway: its text arrives PRE-sanitized as a
 * static baseline (english-nt-baseline.jsonl, already containing "Yashawai" for
 * Jesus etc., sanitized against name-map.json before name-map-expanded.json
 * existed) — load-english-baseline.js just loads that file verbatim, bypassing
 * the generic pass entirely. But every OTHER text that mentions Jesus, Christ,
 * Mary, Peter, and so on goes through the GENERIC sanitize-english.js pass using
 * name-map-expanded.json — so none of those names get transliterated there.
 * That's the actual bug behind "Christ"/"Jesus"/"Mary"/"Nazarene" etc. showing up
 * unsanitized in Gospel of Philip (and, unnoticed so far, in Thomas / Pistis
 * Sophia / Thecla / Third Corinthians too).
 *
 * This script adds every name-map.json key that isn't already reachable via
 * name-map-expanded.json's single/phrases/theonyms into "single". One-time
 * backfill, but idempotent-safe to re-run (only adds keys still missing).
 *
 * Usage:
 *   node backfill-name-map.js            apply in place
 *   node backfill-name-map.js --dry-run  preview what would be added, write nothing
 *
 * Run this ONCE, then re-run node sanitize-english.js (it will re-scan every
 * ENG verse and pick up all these new names retroactively — no re-ingestion of
 * any book needed) and restart the server.
 */
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry-run');
const OLD_PATH = path.join(__dirname, 'name-map.json');
const NEW_PATH = path.join(__dirname, 'name-map-expanded.json');

const oldMap = JSON.parse(fs.readFileSync(OLD_PATH, 'utf8'));
const expanded = JSON.parse(fs.readFileSync(NEW_PATH, 'utf8'));
expanded.single = expanded.single || {};
expanded.phrases = expanded.phrases || {};
expanded.theonyms = expanded.theonyms || {};

// Anything already reachable via single/phrases/theonyms (case-insensitively —
// single-word lookups in name-passthrough.js title-case before matching, and we
// don't want to shadow or duplicate an existing entry, especially the
// theonym-gloss words: God/Lord/LORD/Almighty/Yahweh/... which are handled by a
// different, case-sensitive mechanism on purpose) is left completely alone.
const covered = new Set();
for (const k of Object.keys(expanded.single)) covered.add(k.toLowerCase());
for (const k of Object.keys(expanded.phrases)) covered.add(k.toLowerCase());
for (const k of Object.keys(expanded.theonyms)) covered.add(k.toLowerCase());

const added = [];
for (const [name, translit] of Object.entries(oldMap)) {
  if (covered.has(name.toLowerCase())) continue;
  expanded.single[name] = translit;
  added.push(name);
}

console.log(`${DRY ? '[dry-run] would add' : 'added'} ${added.length} missing name(s) to name-map-expanded.json:`);
console.log('  ' + (added.join(', ') || '(none — nothing missing)'));

if (!DRY) {
  fs.writeFileSync(NEW_PATH, JSON.stringify(expanded));
  console.log('\nWrote name-map-expanded.json.');
  console.log('Next: node sanitize-english.js   (re-sanitizes every ENG verse — Thomas,');
  console.log('Philip, Pistis Sophia, Thecla, Third Corinthians, and anything else that');
  console.log('mentions these names, will pick up the fix automatically), then restart the server.');
} else {
  console.log('\nNo changes written (--dry-run). Re-run without --dry-run to apply.');
}
