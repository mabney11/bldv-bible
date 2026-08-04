#!/usr/bin/env node
/**
 * check-term-forms-final.mjs — READ ONLY. Flags term-forms.txt pins that look
 * like they kept a medial ("...a") vowel on their OWN last syllable instead of
 * the word-final ("fin") bare-consonant form.
 *
 * WHY THIS EXISTS
 *   "blessed asharaya # H835" was found to be exactly this bug: a pin baked in
 *   before some fix (or via a candidate-generation slip), never recomputed
 *   since, silently bypassing the live parser's correct word-final handling.
 *   This scans every "# H####"-tagged line for the SAME shape of mistake so it
 *   can be fixed corpus-wide instead of one line at a time.
 *
 * HEURISTIC (deliberately simple, spelling-only — no DB lookup)
 *   Every CHAR_MAP letter except Aleph (fin=med='a') and Ayin (fin=med='i')
 *   has a DIFFERENT fin form than its med form, and every med form ends in
 *   'a'. So: if a pin's last two characters exactly match a KNOWN med suffix
 *   (ba/ga/da/ha/wa/za/cha/ta/ya/ka/la/ma/na/sa/pa/tza/qa/ra/sha/tha), that
 *   letter almost certainly should have used its bare fin form as the very
 *   last sound of the word instead — UNLESS this pin is deliberately citing a
 *   non-final grammatical form (rare for a single pinned word, but possible).
 *   This is a heuristic flag list for a human to confirm, not an auto-fix.
 *
 * USAGE
 *   node check-term-forms-final.mjs [path-to-term-forms.txt]
 */
import { readFileSync, existsSync } from 'fs';

const file = process.argv[2] || './term-forms.txt';
if (!existsSync(file)) { console.error(`✗ not found: ${file}`); process.exit(1); }

// med-suffix -> corresponding fin form, from the project's own CHAR_MAP.
const MED_TO_FIN = {
    ba: 'b', ga: 'g', da: 'd', ha: 'h', wa: 'w', za: 'z', cha: 'ch',
    ta: 't', ya: 'y', ka: 'k', la: 'l', ma: 'm', na: 'n', sa: 's',
    pa: 'p', tza: 'tz', qa: 'q', ra: 'r', sha: 'sh', tha: 'th',
};
// Longest-first so 'tza'/'sha'/'tha'/'cha' aren't misread as 'za'/'ha'/'ha'/'ha'.
const SUFFIXES = Object.keys(MED_TO_FIN).sort((a, b) => b.length - a.length);

const lines = readFileSync(file, 'utf8').split('\n');
const flagged = [];

lines.forEach((line, i) => {
    const m = line.match(/^(\S+)\s+(\S+)\s*#\s*(H\d+)/);
    if (!m) return;
    const [, english, pin, sn] = m;
    const lower = pin.toLowerCase();
    for (const suf of SUFFIXES) {
        if (lower.endsWith(suf) && lower.length > suf.length) {
            flagged.push({
                lineNo: i + 1, english, pin, sn,
                suggestion: lower.slice(0, -suf.length) + MED_TO_FIN[suf],
            });
            break; // longest match already found, one flag per line
        }
    }
});

console.log(`Scanned ${lines.length} lines, ${flagged.length} flagged for review:\n`);
for (const f of flagged) {
    console.log(`  line ${f.lineNo}: ${f.english}\t${f.pin}\t${f.sn}\t-> suggest "${f.suggestion}"?`);
}
console.log(`\n${flagged.length} lines flagged. This is a heuristic list — confirm each`);
console.log('against surface-index.db (or the live app) before editing term-forms.txt.');
