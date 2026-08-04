#!/usr/bin/env node
/**
 * fix-term-forms-final.mjs — corrects term-forms.txt pins whose OWN last
 * syllable kept a medial ("...a") vowel instead of the word-final ("fin")
 * bare-consonant form the project's CHAR_MAP defines.
 *
 * Same heuristic as check-term-forms-final.mjs (kept in sync — see that file
 * for the full rationale): the project's own rule is that every transliterated
 * word's LAST letter uses its "fin" form, never its "med" form. This fixes
 * every pin that violates that rule on its own last letter.
 *
 * Dry-run by default; --apply writes the file. Always prints a full diff list
 * either way so nothing changes silently.
 *
 * USAGE
 *   node fix-term-forms-final.mjs               dry run, print what WOULD change
 *   node fix-term-forms-final.mjs --apply       write the corrected file
 *   node fix-term-forms-final.mjs --apply --file path/to/term-forms.txt
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const fileIdx = args.indexOf('--file');
const file = fileIdx >= 0 ? args[fileIdx + 1] : './term-forms.txt';
if (!existsSync(file)) { console.error(`✗ not found: ${file}`); process.exit(1); }

const MED_TO_FIN = {
    ba: 'b', ga: 'g', da: 'd', ha: 'h', wa: 'w', za: 'z', cha: 'ch',
    ta: 't', ya: 'y', ka: 'k', la: 'l', ma: 'm', na: 'n', sa: 's',
    pa: 'p', tza: 'tz', qa: 'q', ra: 'r', sha: 'sh', tha: 'th',
};
const SUFFIXES = Object.keys(MED_TO_FIN).sort((a, b) => b.length - a.length);

function correctedPin(pin) {
    const lower = pin.toLowerCase();
    for (const suf of SUFFIXES) {
        if (lower.endsWith(suf) && lower.length > suf.length) {
            const fixed = lower.slice(0, -suf.length) + MED_TO_FIN[suf];
            // Preserve the pin's original capitalization pattern (first-letter cap only,
            // which is the only capitalization these pins ever use).
            return pin[0] === pin[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
        }
    }
    return null;
}

const original = readFileSync(file, 'utf8');
const lines = original.split('\n');
const changes = [];

const newLines = lines.map((line, i) => {
    const m = line.match(/^(\S+)(\s+)(\S+)(\s*#\s*H\d+.*)$/);
    if (!m) return line;
    const [, english, ws, pin, rest] = m;
    const fixed = correctedPin(pin);
    if (!fixed || fixed === pin) return line;
    changes.push({ lineNo: i + 1, english, oldPin: pin, newPin: fixed });
    return `${english}${ws}${fixed}${rest}`;
});

console.log(`${changes.length} pin(s) ${APPLY ? 'corrected' : 'WOULD be corrected'} in ${file}:\n`);
for (const c of changes) {
    console.log(`  line ${c.lineNo}: ${c.english}\t${c.oldPin} -> ${c.newPin}`);
}

if (APPLY) {
    const backup = file + '.bak-finfix';
    copyFileSync(file, backup);
    writeFileSync(file, newLines.join('\n'));
    console.log(`\n✓ wrote ${file} (backup saved to ${backup})`);
} else {
    console.log('\nDry run only — nothing written. Re-run with --apply to write the file.');
}
