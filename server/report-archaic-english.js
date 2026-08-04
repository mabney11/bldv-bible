#!/usr/bin/env node
'use strict';
/*
 * report-archaic-english.js — READ ONLY. Writes nothing.
 *
 * Lists which ENG books in corpus.db still contain Elizabethan/KJV-era English,
 * so we target re-sourcing precisely (WEB Apocrypha for the deuterocanon it
 * covers; a separate decision for the pseudepigrapha it doesn't). Canonical WEB
 * is modern and should show ~zero hits — anything flagged is a work that came in
 * from an older translation.
 *
 *   node report-archaic-english.js corpus.db
 */
const path = require('path');
const Database = require('better-sqlite3');

const DB = process.argv[2] || path.join(__dirname, 'corpus.db');
const db = new Database(DB, { readonly: true, fileMustExist: true });

// Unambiguous archaic markers only (no modern homographs). Deliberately excludes
// -eth/-est to avoid teeth/forest noise — these alone cleanly separate old text.
const ARCHAIC = /\b(thou|thee|thy|thine|hast|hath|dost|doth|didst|hadst|shalt|wilt|wast|wert|canst|wouldst|shouldst|couldst|mayest|mayst|saith|spake|unto|whither|thither|hither)\b/i;

const rows = db.prepare(
  "SELECT canon_id, code, text FROM verses WHERE corpus='ENG' AND text IS NOT NULL AND text <> ''"
).all();

const stat = {};   // key -> { canon, code, total, archaic, sample }
for (const r of rows) {
  const key = (r.canon_id != null ? r.canon_id : 'doc') + '|' + (r.code || '?');
  const s = (stat[key] ||= { canon: r.canon_id, code: r.code, total: 0, archaic: 0, sample: '' });
  s.total++;
  if (ARCHAIC.test(r.text)) { s.archaic++; if (!s.sample) s.sample = r.text.slice(0, 80); }
}

const flagged = Object.values(stat).filter(s => s.archaic > 0).sort((a, b) => b.archaic - a.archaic);
console.log(`Scanned ${rows.length} ENG verses across ${Object.keys(stat).length} books.\n`);
if (!flagged.length) { console.log('No archaic English found. Nothing to re-source.'); db.close(); process.exit(0); }

console.log(`${flagged.length} book(s) contain archaic English:\n`);
console.log('  canon | code           | archaic/total | sample');
console.log('  ' + '─'.repeat(90));
for (const s of flagged) {
  console.log('  ' + String(s.canon).padStart(5) + ' | ' + String(s.code || '').padEnd(14) +
    ' | ' + (s.archaic + '/' + s.total).padEnd(13) + ' | ' + s.sample);
}
console.log('\nSend this list back. I\'ll map each to WEB Apocrypha (deuterocanon) or flag it');
console.log('as pseudepigrapha WEB can\'t cover, so we settle those explicitly.');
db.close();
