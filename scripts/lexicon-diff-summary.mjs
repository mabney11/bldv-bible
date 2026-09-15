#!/usr/bin/env node
// scripts/lexicon-diff-summary.mjs — real JSON-value diff for lexicon-sync.sh's
// commit message, not a line-based grep. A line-based diff falsely flags the
// LAST key before a closing brace as "changed" every time a new entry is
// appended after it (only a trailing comma differs) — this compares actual
// parsed values instead, so that's correctly reported as unchanged.
//
// Reads the OLD version of each given file from git (HEAD), the NEW version
// off disk, and prints a summary: a compact "file (+n ~n -n)" line per file
// (for the commit subject), then a blank line, then the same compact lines
// each followed by the actual added/removed/changed key names (capped, so a
// big bulk edit doesn't blow up the commit message) — for the commit body.
//
// Usage: node scripts/lexicon-diff-summary.mjs <path> [<path> ...]
// Paths are relative to the repo root (matches `git diff --name-only`).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CAP = 8; // max key names listed per category per file before "+N more"

function flatten(raw) {
  // Same two shapes server.js's _loadGlosses accepts: a flat {word: gloss}
  // map, or a legacy {entries: {word: gloss}} nested shape. Underscore-
  // prefixed keys (_doc, etc.) are documentation, not lexicon entries.
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const src = (raw.entries && typeof raw.entries === 'object') ? raw.entries : raw;
  for (const [k, v] of Object.entries(src)) {
    if (k.startsWith('_') || k === 'entries') continue;
    out[k] = typeof v === 'string' ? v : (v && typeof v.gloss === 'string') ? v.gloss : JSON.stringify(v);
  }
  return out;
}

function loadOld(path) {
  try {
    const text = execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' });
    return flatten(JSON.parse(text));
  } catch {
    return {}; // new file, or nothing at HEAD yet — everything shows as added
  }
}

function loadNew(path) {
  try {
    return flatten(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null; // unparseable working-tree JSON — flagged, not silently skipped
  }
}

function capped(list) {
  if (!list.length) return '';
  const shown = list.slice(0, CAP).join(', ');
  return list.length > CAP ? `${shown}, +${list.length - CAP} more` : shown;
}

const files = process.argv.slice(2);
const perFile = [];

for (const path of files) {
  const base = path.split('/').pop();
  const oldMap = loadOld(path);
  const newMap = loadNew(path);
  if (newMap === null) {
    perFile.push({ compact: `${base}: unparseable JSON, skipped from summary`, details: [] });
    continue;
  }

  const added = [], removed = [], changed = [];
  for (const k of Object.keys(newMap)) {
    if (!(k in oldMap)) added.push(k);
    else if (oldMap[k] !== newMap[k]) changed.push(k);
  }
  for (const k of Object.keys(oldMap)) {
    if (!(k in newMap)) removed.push(k);
  }
  if (!added.length && !removed.length && !changed.length) continue;

  const counts = [];
  if (added.length) counts.push(`+${added.length}`);
  if (removed.length) counts.push(`-${removed.length}`);
  if (changed.length) counts.push(`~${changed.length}`);
  const details = [];
  if (added.length) details.push(`  added: ${capped(added)}`);
  if (removed.length) details.push(`  removed: ${capped(removed)}`);
  if (changed.length) details.push(`  changed: ${capped(changed)}`);
  perFile.push({ compact: `${base} (${counts.join(' ')})`, details });
}

if (!perFile.length) process.exit(0); // nothing to report — caller falls back

const out = [];
out.push(perFile.map(f => f.compact).join(', '));
out.push('');
for (const f of perFile) { out.push(f.compact); out.push(...f.details); }
process.stdout.write(out.join('\n'));
