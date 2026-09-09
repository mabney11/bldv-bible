#!/usr/bin/env node
/**
 * clean-web-strongs.mjs — strip the scraped site chrome from web-strongs.jsonl.
 *
 * 929 verses (the last verse of every chapter) carried the page footer of the site
 * they were fetched from glued to their last segment and to `text`:
 *   "…there to Yahweh. Online Parallel Study BibleParallel BibleAdvanced Bible Search…"
 * Found 2026-09-09 while reading the file for name-map evidence. Idempotent: run it
 * any time; it rewrites the file in place only if something changed and reports.
 *
 *   node clean-web-strongs.mjs [web-strongs.jsonl]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.argv[2] || path.join(__dirname, 'web-strongs.jsonl');
const JUNK = /\s*(Online Parallel Study Bible|Parallel BibleAdvanced Bible Search|Study BibleQuestions and Answers|Cross References - WEB_Strongs)[\s\S]*$/;
let verses = 0, cleaned = 0;
const out = [];
for (const ln of readFileSync(FILE, 'utf8').split('\n')) {
  if (!ln.trim()) continue;
  verses++;
  let v; try { v = JSON.parse(ln); } catch { out.push(ln); continue; }
  let hit = false;
  for (const s of v.segments || []) { const t = String(s.text || '').replace(JUNK, ''); if (t !== s.text) { s.text = t; hit = true; } }
  const t = String(v.text || '').replace(JUNK, ''); if (t !== v.text) { v.text = t; hit = true; }
  if (hit) cleaned++;
  out.push(JSON.stringify(v));
}
if (cleaned) writeFileSync(FILE, out.join('\n') + '\n');
console.log(`${verses.toLocaleString()} verses; ${cleaned} cleaned${cleaned ? ' — file rewritten' : ' — nothing to do'}`);
