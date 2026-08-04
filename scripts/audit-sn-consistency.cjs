#!/usr/bin/env node
/**
 * audit-sn-consistency.js
 *
 * Scans surface-index.db and flags rows where the primary Strong's number
 * disagrees with the surface form's actual root letters.
 *
 * THE PROBLEM. The corpus carries an SN per token, and build-surface-index.js
 * picks one as the "primary" for each unique word_raw. Sometimes that primary
 * SN maps (via strongs-roots.json) to root letters that aren't even present in
 * the surface. Example:
 *
 *   word_raw    = 𐤍𐤐𐤔𐤕𐤌      (nephesh + plural-fem + 3mp-suffix)
 *   strongs     = H3878          (Levi — the patriarch!)
 *   root_paleo  = 𐤋𐤅𐤉           (Levi's lemma)
 *   all_strongs = ["H3878", "H5315"]   ← H5315 (nephesh) was available
 *
 * The DB picked the wrong primary. We can detect this mechanically:
 *
 *   For each row where strongs-roots[primary_sn]'s letters are NOT all present
 *   in word_raw, check if any other SN in all_strongs has letters that ARE all
 *   present. If yes → contradiction with a plausible alternative.
 *
 * Output: writes
 *   - sn-audit-report.json     full machine-readable list
 *   - sn-audit-report.txt      human-readable summary, grouped
 *   - sn-audit-overrides.json  TEMPLATE for surface-strongs-overrides.json,
 *                              pre-filled with the best-guess alternative
 *                              for each HIGH-confidence case. You review and
 *                              edit this file before copying it to
 *                              lexicon/surface-strongs-overrides.json.
 *
 * Usage:
 *   node scripts/audit-sn-consistency.js \
 *       --db ../surface-index.db \
 *       --strongs-roots ../server/lexicon/strongs-roots.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argv = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };

const DB_PATH = argv('--db',
  path.join(__dirname, '..', 'surface-index.db'));
const SR_PATH = argv('--strongs-roots',
  path.join(__dirname, '..', 'server', 'lexicon', 'strongs-roots.json'));
const OUT_DIR = argv('--out',
  path.join(__dirname, '..', 'lexicon-audit'));

if (!fs.existsSync(SR_PATH))  { console.error(`strongs-roots.json not found: ${SR_PATH}`); process.exit(1); }
// --db is only required when --rows isn't supplied
const ROWS_ARG = (() => { const i = args.indexOf('--rows'); return i >= 0 ? args[i+1] : null; })();
if (!ROWS_ARG && !fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  console.error(`Provide --rows <path-to-json-dump> if you don't have better-sqlite3.`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Load strongs-roots ───────────────────────────────────────────────────────
const sr = JSON.parse(fs.readFileSync(SR_PATH, 'utf8'));
console.log(`Loaded strongs-roots: ${Object.keys(sr).length} entries`);

// ── Open DB ──────────────────────────────────────────────────────────────────
// Three input paths, tried in order:
//   1. --rows <path>     pre-exported JSON of token_surfaces rows (no sqlite needed)
//   2. better-sqlite3    native module (fast, synchronous)
//   3. error with instructions for the manual sqlite3 CLI dump
let rows;
const ROWS_PATH = argv('--rows', null);

if (ROWS_PATH && fs.existsSync(ROWS_PATH)) {
  rows = JSON.parse(fs.readFileSync(ROWS_PATH, 'utf8'));
  // Accept either an array or {rows: [...]} or sqlite3 CLI's array output.
  if (rows && !Array.isArray(rows)) rows = rows.rows || Object.values(rows);
  console.log(`Read ${rows.length.toLocaleString()} rows from ${ROWS_PATH}`);
} else {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH, { readonly: true });
    rows = db.prepare(`
      SELECT word_raw, root_paleo, strongs, all_strongs, pos, morph
      FROM token_surfaces
      WHERE strongs IS NOT NULL AND strongs != ''
    `).all();
    db.close();
    console.log(`Read ${rows.length.toLocaleString()} rows from ${DB_PATH}`);
  } catch (e) {
    console.error(`better-sqlite3 unavailable: ${e.message}`);
    console.error(``);
    console.error(`Either: (a) npm install better-sqlite3, or`);
    console.error(`        (b) dump rows manually and re-run with --rows <path>:`);
    console.error(``);
    console.error(`        sqlite3 ${DB_PATH} \\`);
    console.error(`          "SELECT json_group_array(json_object(`);
    console.error(`             'word_raw', word_raw, 'root_paleo', root_paleo,`);
    console.error(`             'strongs', strongs, 'all_strongs', all_strongs,`);
    console.error(`             'pos', pos, 'morph', morph))`);
    console.error(`           FROM token_surfaces WHERE strongs IS NOT NULL AND strongs != ''" \\`);
    console.error(`          > token-surfaces.json`);
    console.error(`        node audit-sn-consistency.js --rows token-surfaces.json`);
    process.exit(1);
  }
}

// ── Audit ────────────────────────────────────────────────────────────────────

// Iterate Paleo-Hebrew codepoints (each glyph is 2 UTF-16 units).
const codePoints = s => [...s];

/** Are every codepoint in `needle` present in the multiset `haystack`?
 *  Multiset semantics: a letter that appears twice in needle must appear at
 *  least twice in haystack. This is the correct check for "letters present". */
function lettersAllPresent(needle, haystack) {
  const have = new Map();
  for (const ch of codePoints(haystack)) have.set(ch, (have.get(ch) || 0) + 1);
  for (const ch of codePoints(needle)) {
    const n = have.get(ch);
    if (!n) return false;
    have.set(ch, n - 1);
  }
  return true;
}

// ── Reverse index: canonical-root → [SN, SN, ...] ──────────────────────────
// Lets us find SNs whose canonical root is fully contained in a given surface
// form, even when those SNs were never tagged for this surface anywhere in
// the corpus. This is the "broader" search path used when all_strongs has no
// plausible alternative. Without this, mistags like 𐤁𐤔𐤓𐤕𐤉=H6666 (whose
// correct SN H1319 was never tagged for this surface) wouldn't get any
// suggestion at all.
const rootToSNs = new Map();
for (const [sn, root] of Object.entries(sr)) {
  if (!root) continue;
  if (!rootToSNs.has(root)) rootToSNs.set(root, []);
  rootToSNs.get(root).push(sn);
}

// ── Morph-aware surface stripping ───────────────────────────────────────────
// Given a surface form and its morph string, strip the morphologically-derived
// prefixes and suffixes to get the "stripped surface" — what should equal a
// canonical root when the SN is correctly tagged.
//
// Example: word_raw='𐤁𐤔𐤓𐤕𐤉', morph contains 'vbe=TJ' (1cs verb ending).
// vbe=TJ strips '𐤕𐤉' from the end → strippedSurface = '𐤁𐤔𐤓'.
// SNs whose canonical root EQUALS '𐤁𐤔𐤓' are the strongest candidates.
//
// This collapses the broad-search candidate list from "every root whose
// letters happen to be a subset of the surface" (~95 noisy hits) to
// "every root that's a plausible stripped form of this morph-stripped surface"
// (~3-5 high-signal hits).
const SUFFIX_MAP = {
  // pronominal suffixes
  prs: { 'J':'𐤉','NJ':'𐤍𐤉','NW':'𐤍𐤅','K':'𐤊','KM':'𐤊𐤌','KN':'𐤊𐤍','W':'𐤅','HW':'𐤄𐤅',
         'H':'𐤄','M':'𐤌','HM':'𐤄𐤌','N':'𐤍','HN':'𐤄𐤍','K=':'𐤊','H=':'𐤄' },
  // verbal endings
  vbe: { 'TJ':'𐤕𐤉','NW':'𐤍𐤅','T':'𐤕','TM':'𐤕𐤌','TN':'𐤕𐤍','W':'𐤅','WN':'𐤅𐤍',
         'NH':'𐤍𐤄','H=':'𐤄','H':'𐤄','J':'𐤉','T=':'𐤕' },
  // nominal endings
  nme: { 'H':'𐤄','T':'𐤕','J':'𐤉','J=':'𐤉','JM':'𐤉𐤌','JM=':'𐤉𐤌','WT':'𐤅𐤕',
         'WTJ':'𐤅𐤕𐤉','NH':'𐤍𐤄','T=':'𐤕' },
  // ungrouped final consonant
  uvf: { 'H':'𐤄','J':'𐤉','N':'𐤍','W':'𐤅' },
};
const PREFIX_MAP = {
  pfm: { 'J':'𐤉','T':'𐤕','T=':'𐤕','>':'𐤀','N':'𐤍','M':'𐤌' },
  vbs: { 'H':'𐤄','N':'𐤍','HT':'𐤄𐤕','HCT':'𐤄𐤕' },
};

function stripMorph(surface, morphStr) {
  if (!morphStr) return surface;
  // Parse morph string into key-value pairs
  const morph = {};
  for (const seg of morphStr.split('|')) {
    const eq = seg.indexOf('=');
    if (eq < 1) continue;
    morph[seg.slice(0, eq).trim()] = seg.slice(eq + 1).trim();
  }
  let s = surface;
  // Strip suffixes from the end, in the order parseHebrewData does
  for (const key of ['prs', 'uvf', 'nme', 'vbe']) {
    const val = morph[key];
    if (!val || val === 'absent' || val === 'none') continue;
    const suffixPaleo = SUFFIX_MAP[key]?.[val] || SUFFIX_MAP[key]?.[val.replace(/=+$/, '')];
    if (suffixPaleo && s.endsWith(suffixPaleo)) {
      s = s.slice(0, -suffixPaleo.length);
    }
  }
  // Strip prefixes from the start (verb stem + verb prefix markers)
  for (const key of ['pfm', 'vbs']) {
    const val = morph[key];
    if (!val || val === 'absent' || val === 'none') continue;
    const prefixPaleo = PREFIX_MAP[key]?.[val] || PREFIX_MAP[key]?.[val.replace(/=+$/, '')];
    if (prefixPaleo && s.startsWith(prefixPaleo)) {
      s = s.slice(prefixPaleo.length);
    }
  }
  return s;
}

// Find SNs whose canonical root is a high-quality match for the stripped
// surface. Ranks: exact equality > prefix > letters-all-present.
function searchBroadCandidates(surface, morphStr, excludeSN) {
  const stripped = stripMorph(surface, morphStr);
  const exact = [];
  const prefix = [];
  const subset = [];
  for (const [root, sns] of rootToSNs) {
    if (!root) continue;
    if (root === stripped) {
      for (const sn of sns) if (sn !== excludeSN) exact.push({ sn, root, source: 'broad_exact' });
    } else if (stripped && stripped.startsWith(root)) {
      for (const sn of sns) if (sn !== excludeSN) prefix.push({ sn, root, source: 'broad_prefix' });
    } else if (lettersAllPresent(root, surface)) {
      for (const sn of sns) if (sn !== excludeSN) subset.push({ sn, root, source: 'broad_subset' });
    }
  }
  // Within each tier, prefer lower SN numbers (typically the primary entry).
  const snNumKey = c => parseInt(c.sn.replace(/\D/g, ''), 10) || 0;
  exact.sort((a, b) => snNumKey(a) - snNumKey(b));
  prefix.sort((a, b) => {
    // Within prefix matches, prefer longer roots (more letters explained)
    const lenDiff = b.root.length - a.root.length;
    if (lenDiff !== 0) return lenDiff;
    return snNumKey(a) - snNumKey(b);
  });
  // Subset (weakest) — keep only top few; otherwise it's noise.
  subset.sort((a, b) => {
    const lenDiff = b.root.length - a.root.length;
    if (lenDiff !== 0) return lenDiff;
    return snNumKey(a) - snNumKey(b);
  });
  // Cap subset matches at 3 — beyond that they're not useful suggestions.
  return [...exact, ...prefix, ...subset.slice(0, 3)];
}

const findings = [];
let nRows = 0, nSuspicious = 0, nWithAlt = 0, nBroadOnly = 0;

for (const row of rows) {
  nRows++;
  const primaryRoot = sr[row.strongs];
  if (!primaryRoot) continue; // SN not in strongs-roots — can't audit

  if (lettersAllPresent(primaryRoot, row.word_raw)) continue; // OK

  nSuspicious++;
  let alts;
  try { alts = JSON.parse(row.all_strongs || '[]'); } catch { alts = []; }

  // Pass A: search alternatives already attested for this surface in the corpus
  const candidatesFromAllStrongs = [];
  for (const altSN of alts) {
    if (altSN === row.strongs) continue;
    const altRoot = sr[altSN];
    if (!altRoot) continue;
    if (lettersAllPresent(altRoot, row.word_raw)) {
      candidatesFromAllStrongs.push({ sn: altSN, root: altRoot, source: 'all_strongs' });
    }
  }

  // Pass B: broader search when Pass A came up empty. Looks across the entire
  // strongs-roots dictionary for any SN whose canonical root fits the surface.
  let candidates = candidatesFromAllStrongs;
  let usedBroad = false;
  let broadIsExact = false;
  if (candidates.length === 0) {
    const broad = searchBroadCandidates(row.word_raw, row.morph, row.strongs);
    if (broad.length > 0) {
      candidates = broad;
      usedBroad = true;
      // If the top candidate is an exact stripped-root match, this is high-
      // signal even from broad search.
      broadIsExact = broad[0].source === 'broad_exact';
      nBroadOnly++;
    }
  }

  if (candidates.length === 0) continue; // suspicious but no better alt to suggest

  nWithAlt++;
  let confidence;
  if (!usedBroad) {
    confidence = candidates.length === 1 ? 'HIGH' : 'AMBIGUOUS';
  } else if (broadIsExact && candidates.filter(c => c.source === 'broad_exact').length === 1) {
    // Exactly one broad candidate where the canonical root equals the stripped
    // surface — strong evidence even though the corpus never tagged it for
    // this surface. (E.g. 𐤁𐤔𐤓𐤕𐤉 strips to 𐤁𐤔𐤓 and H1319 has root 𐤁𐤔𐤓.)
    confidence = 'HIGH_BROAD';
  } else {
    confidence = 'AMBIGUOUS';
  }

  findings.push({
    word_raw:    row.word_raw,
    pos:         row.pos,
    tagged_sn:   row.strongs,
    tagged_root: row.root_paleo,
    expected_root_from_sn: primaryRoot, // what strongs-roots says the SN's root looks like
    candidates,
    suggested:   candidates[0].sn,      // first alt = "best guess"
    suggested_root: candidates[0].root,
    confidence,
    all_strongs: alts,
  });
}

// ── Sort: highest priority first. HIGH > HIGH_BROAD > AMBIGUOUS
findings.sort((a, b) => {
  const rank = c => c === 'HIGH' ? 0 : c === 'HIGH_BROAD' ? 1 : 2;
  const cw = rank(a.confidence) - rank(b.confidence);
  if (cw !== 0) return cw;
  return a.word_raw.localeCompare(b.word_raw);
});

// ── Write outputs ────────────────────────────────────────────────────────────
const reportJSON = path.join(OUT_DIR, 'sn-audit-report.json');
fs.writeFileSync(reportJSON, JSON.stringify({
  findings,
  totals: { nRows, nSuspicious, nWithAlt, nBroadOnly },
}, null, 2));
console.log(`\n✓ ${findings.length.toLocaleString()} contradictions with plausible alternatives`);
console.log(`  (of which ${nBroadOnly.toLocaleString()} were found only via broad search — these have LOWER confidence)`);

// Human-readable text report
const lines = [];
lines.push(`SN-vs-root consistency audit`);
lines.push(`=`.repeat(72));
lines.push(`Database:      ${DB_PATH}`);
lines.push(`Strongs-roots: ${SR_PATH}`);
lines.push(``);
lines.push(`Totals`);
lines.push(`------`);
lines.push(`Rows scanned:                              ${nRows.toLocaleString()}`);
lines.push(`Rows where tagged SN's root letters are`);
lines.push(`  NOT all present in the surface form:     ${nSuspicious.toLocaleString()}`);
lines.push(`Of those, with a plausible alternative:    ${nWithAlt.toLocaleString()}`);
lines.push(`  - found in all_strongs (co-attested):    ${(nWithAlt - nBroadOnly).toLocaleString()}`);
lines.push(`  - found via broad search only:           ${nBroadOnly.toLocaleString()}`);
lines.push(``);

const byConfidence = findings.reduce((m, f) => { (m[f.confidence] ||= []).push(f); return m; }, {});
for (const conf of ['HIGH', 'HIGH_BROAD', 'AMBIGUOUS']) {
  const arr = byConfidence[conf] || [];
  lines.push(`${conf} confidence (${arr.length.toLocaleString()})`);
  lines.push(`-`.repeat(72));
  if (conf === 'HIGH') {
    lines.push(`Exactly one alternative SN co-attested for this surface in the corpus.`);
    lines.push(`Safest candidates for the override file.`);
  } else if (conf === 'HIGH_BROAD') {
    lines.push(`Exactly one candidate SN found by broad strongs-roots search. The`);
    lines.push(`corpus never tagged this surface with the suggested SN, but its`);
    lines.push(`canonical root letters fit the surface. Review carefully before`);
    lines.push(`accepting.`);
  } else {
    lines.push(`Multiple plausible alternative SNs; YOU must pick.`);
  }
  lines.push(``);
  lines.push(`  word_raw        tagged    tagged_root       suggested  suggested_root  pos`);
  for (const f of arr.slice(0, 1000)) {
    lines.push(
      `  ${f.word_raw.padEnd(14)}  ${f.tagged_sn.padEnd(8)}  ${f.tagged_root.padEnd(14)}  ${f.suggested.padEnd(8)}  ${f.suggested_root.padEnd(14)}  ${f.pos}`
    );
    if (conf === 'AMBIGUOUS') {
      lines.push(`      candidates: ${f.candidates.map(c => `${c.sn}→${c.root}`).join(', ')}`);
    }
  }
  if (arr.length > 1000) lines.push(`  ...and ${(arr.length - 1000).toLocaleString()} more`);
  lines.push(``);
}

const reportTXT = path.join(OUT_DIR, 'sn-audit-report.txt');
fs.writeFileSync(reportTXT, lines.join('\n'));
console.log(`✓ Wrote ${reportTXT}`);
console.log(`✓ Wrote ${reportJSON}`);

// Override template — both HIGH and AMBIGUOUS findings go into `_review`,
// because even HIGH cases can be wrong (e.g. when the tagged SN is a hollow
// or lamed-hay root that legitimately drops a letter, the suggested
// alternative might just happen to fit but be linguistically off). You
// move entries to the top level after confirming each pick.
// ── Build the overrides template ─────────────────────────────────────────────
// HIGH and HIGH_BROAD: pre-populated at the top level. The user just has to
// review and remove any they disagree with. This converts the audit from a
// passive inspection tool into one that produces a working overrides file.
//
// AMBIGUOUS: stays in `_review` for manual curation. Each entry shows the
// top candidates; the user picks one and moves it up.
const overrideTemplate = {};
const review = {};
let nAutoHigh = 0, nAutoBroad = 0;
for (const f of findings) {
  if (f.confidence === 'HIGH') {
    overrideTemplate[f.word_raw] = f.candidates[0].sn;
    nAutoHigh++;
  } else if (f.confidence === 'HIGH_BROAD') {
    // For broad-exact picks, prefer the lowest-numbered SN among candidates
    // with the EXACT stripped-surface root (skip prefix and subset variants).
    const exactCands = f.candidates.filter(c => c.source === 'broad_exact');
    const chosen = exactCands.length ? exactCands[0] : f.candidates[0];
    overrideTemplate[f.word_raw] = chosen.sn;
    nAutoBroad++;
  } else {
    review[f.word_raw] = {
      pos:        f.pos,
      tagged_sn:  f.tagged_sn,
      tagged_root_letters: f.expected_root_from_sn,
      confidence: f.confidence,
      candidates: f.candidates.map(c => `${c.sn} (root ${c.root}${c.source ? `, ${c.source}` : ''})`),
      pick:       null, // ← set to one of the SNs above, then move to top-level
    };
  }
}

const tmplPath = path.join(OUT_DIR, 'sn-audit-overrides.json');
fs.writeFileSync(tmplPath, JSON.stringify({
  _comment: [
    `Generated by audit-sn-consistency.cjs at ${new Date().toISOString()}.`,
    '',
    `Auto-applied HIGH confidence:        ${nAutoHigh.toLocaleString()}`,
    `Auto-applied HIGH_BROAD confidence:  ${nAutoBroad.toLocaleString()}`,
    `Manual review needed (_review):      ${Object.keys(review).length.toLocaleString()}`,
    '',
    'How to use this file:',
    '  1. The TOP-LEVEL entries (word_raw → sn) are ACTIVE overrides. Each one',
    '     replaces the corpus-tagged SN when this word_raw is rendered. Audit',
    '     them — if any are wrong, remove the entry.',
    '  2. The _review section lists AMBIGUOUS cases with multiple plausible',
    '     SNs. For each, decide which is right and copy "<word_raw>": "<sn>"',
    '     to the top level.',
    '  3. Save as lexicon/surface-strongs-overrides.json. server.js auto-reloads',
    '     on file change (no restart needed). build-surface-index.js will pick',
    '     it up on the next index rebuild.',
  ],
  ...overrideTemplate,
  _review: review,
}, null, 2));
console.log(`✓ Wrote ${tmplPath}`);
console.log(`  - ${nAutoHigh.toLocaleString()} HIGH-confidence auto-picks`);
console.log(`  - ${nAutoBroad.toLocaleString()} HIGH_BROAD-confidence auto-picks`);
console.log(`  - ${Object.keys(review).length.toLocaleString()} AMBIGUOUS entries in _review`);
console.log(`\nNext steps:`);
console.log(`  1. Review ${reportTXT} for the full list.`);
console.log(`  2. Audit the auto-picked overrides at the top of ${tmplPath}.`);
console.log(`  3. For _review entries, pick one and move to top-level.`);
console.log(`  4. Save the result as lexicon/surface-strongs-overrides.json.`);
console.log(`  5. Rebuild surface index: node server/build-surface-index.js (optional — server.js auto-reloads).`);
