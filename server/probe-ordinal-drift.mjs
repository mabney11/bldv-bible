#!/usr/bin/env node
/**
 * probe-ordinal-drift.mjs — READ-ONLY.
 *
 * mat1.txt showed the baked HEB SNs and tokens_nt's SNs disagreeing in a
 * suspicious way: at Matt 1:16 tokens_nt's ordinal 5 carries the SN the bake
 * puts on ordinal 4, and ordinal 6 carries the one from ordinal 5. That is not
 * a wrong Strong's number — it is the same numbers, one slot late.
 *
 * Both sides tokenize the SAME verse string. build-heb-index.mjs uses its own
 * `wordsOf()` (split on whitespace + maqaf/sof-pasuq/quotes); heb-align.js
 * inside build-surface-index.js uses its own. If the two splitters disagree
 * about one character anywhere in a verse, every token after it is off by one
 * and `tokens_nt.token_ordinal` no longer means what the index thinks it means.
 *
 * This measures that directly: it lines the two word streams up verse by verse
 * and reports how often they agree, what shift makes a mismatched verse agree,
 * and how many SN "disagreements" survive once the shift is applied.
 *
 * Usage (winpty eats `> file`, so this writes its own output):
 *   node probe-ordinal-drift.mjs --book 40 --out drift40.txt
 *   node probe-ordinal-drift.mjs --from 40 --to 66 --out driftNT.txt
 *   node probe-ordinal-drift.mjs --from 1 --to 39 --out driftOT.txt
 *
 * Flags: --book N | --from N --to N, --index surface-index.db, --db corpus.db,
 *        --table tokens_nt, --samples N, --out FILE
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const val  = (f, d = null) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const ONE     = val('--book', null);
const FROM    = parseInt(ONE ?? val('--from', '40'), 10);
const TO      = parseInt(ONE ?? val('--to',   '66'), 10);
const TABLE   = val('--table', 'tokens_nt');
const SAMPLES = parseInt(val('--samples', '8'), 10);
const INDEX   = val('--index', path.join(__dirname, 'surface-index.db'));
const CORPUS  = val('--db',    path.join(__dirname, 'corpus.db'));
const OUT     = val('--out', null);

const lines = [];
const say = m => { lines.push(m); if (!OUT) console.log(m); };
const finish = () => {
    if (OUT) { fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8'); console.log(`wrote ${OUT} (${lines.length} lines)`); }
};

for (const [p, n] of [[INDEX, 'surface-index.db'], [CORPUS, 'corpus.db']]) {
    if (!fs.existsSync(p)) { console.error(`✗ no ${n} at ${p}`); process.exit(1); }
}
const sdb = new Database(INDEX,  { readonly: true });
const cdb = new Database(CORPUS, { readonly: true });

// Compare on paleo/Hebrew letters only — punctuation and pointing are exactly
// what the two splitters disagree about, so they must not decide equality.
const LETTERS = /[\u05D0-\u05EA]|[\u{10900}-\u{10915}]/u;
const norm = s => String(s || '').split('').filter(c => LETTERS.test(c)).join('');

const idxVerses = sdb.prepare(`
    SELECT DISTINCT book_id, chapter, verse FROM surface_occurrences
    WHERE source = 'HEB' AND book_id BETWEEN ? AND ?
    ORDER BY book_id, chapter, verse`);
const idxRows = sdb.prepare(`
    SELECT token_ordinal, word_raw, strongs FROM surface_occurrences
    WHERE source = 'HEB' AND book_id = ? AND chapter = ? AND verse = ?
    ORDER BY token_ordinal`);
const ntRows = cdb.prepare(`
    SELECT token_ordinal, word_raw, strongs FROM ${TABLE}
    WHERE book_id = ? AND chapter = ? AND verse = ?
    ORDER BY token_ordinal`);

say(`probe-ordinal-drift — canon ${FROM}-${TO}, ${TABLE} vs baked HEB rows`);
say(`index: ${INDEX}`);
say('');

const verses = idxVerses.all(FROM, TO);
if (!verses.length) { say(`No HEB rows in the index for canon ${FROM}-${TO}.`); finish(); process.exit(0); }

let vTotal = 0, vSameLen = 0, vAligned = 0, vShifted = 0, vUnrelatable = 0;
const shiftHist = new Map();
let snCompared = 0, snDisagreeRaw = 0, snDisagreeShifted = 0;
const samples = [];

const bestShift = (A, B) => {
    // How many positions agree if B is read `k` slots later than A?
    let best = 0, bestScore = -1;
    for (let k = -4; k <= 4; k++) {
        let score = 0, n = 0;
        for (let i = 0; i < A.length; i++) {
            const j = i + k;
            if (j < 0 || j >= B.length) continue;
            n++;
            if (A[i].w && A[i].w === B[j].w) score++;
        }
        if (n && score > bestScore) { bestScore = score; best = k; }
    }
    return { shift: best, matched: bestScore };
};

for (const v of verses) {
    const A = idxRows.all(v.book_id, v.chapter, v.verse).map(r => ({ o: r.token_ordinal, w: norm(r.word_raw), sn: r.strongs }));
    const B = ntRows.all(v.book_id, v.chapter, v.verse).map(r => ({ o: r.token_ordinal, w: norm(r.word_raw), sn: r.strongs }));
    if (!A.length || !B.length) continue;
    vTotal++;
    if (A.length === B.length) vSameLen++;

    const exact = A.length === B.length && A.every((a, i) => a.w === B[i].w);
    if (exact) { vAligned++; }
    else {
        const { shift, matched } = bestShift(A, B);
        if (matched >= Math.max(2, Math.floor(A.length * 0.5))) {
            vShifted++;
            shiftHist.set(shift, (shiftHist.get(shift) || 0) + 1);
            if (samples.length < SAMPLES && shift !== 0) samples.push({ v, A, B, shift, matched });
        } else {
            vUnrelatable++;
        }
    }

    // SN agreement at the same ordinal (what the server's homograph guard does),
    // then again after applying this verse's best shift.
    const { shift } = exact ? { shift: 0 } : bestShift(A, B);
    const normSN = s => (s ? 'H' + String(s).replace(/^H+/, '') : '');
    const byOrd = new Map(B.map((b, i) => [i, b]));
    for (let i = 0; i < A.length; i++) {
        const same  = byOrd.get(i);
        const moved = byOrd.get(i + shift);
        const a = normSN(A[i].sn);
        if (!a) continue;
        if (same && normSN(same.sn)) { snCompared++; if (normSN(same.sn) !== a) snDisagreeRaw++; }
        if (moved && normSN(moved.sn) && normSN(moved.sn) !== a) snDisagreeShifted++;
    }
}

const pct = (n, d) => d ? `${(n / d * 100).toFixed(1)}%` : '—';

say('── VERSE ALIGNMENT ──────────────────────────────────────────────────────');
say(`  verses in both:                 ${vTotal.toLocaleString()}`);
say(`  same token COUNT:               ${vSameLen.toLocaleString()}  ${pct(vSameLen, vTotal)}`);
say(`  word-for-word identical:        ${vAligned.toLocaleString()}  ${pct(vAligned, vTotal)}`);
say(`  relatable by a constant shift:  ${vShifted.toLocaleString()}  ${pct(vShifted, vTotal)}`);
say(`  neither:                        ${vUnrelatable.toLocaleString()}  ${pct(vUnrelatable, vTotal)}`);

if (shiftHist.size) {
    say('');
    say('  shift needed to line tokens_nt up with the bake (0 = already aligned):');
    for (const [k, n] of [...shiftHist].sort((a, b) => b[1] - a[1])) {
        say(`    ${String(k).padStart(3)}  ${n.toLocaleString().padStart(7)} verses`);
    }
}

say('');
say('── WHAT THAT DOES TO THE STRONG\'S NUMBERS ───────────────────────────────');
say(`  ordinals compared (both sides tagged): ${snCompared.toLocaleString()}`);
say(`  disagree at the SAME ordinal:          ${snDisagreeRaw.toLocaleString()}  ${pct(snDisagreeRaw, snCompared)}`);
say(`  still disagree after the shift:        ${snDisagreeShifted.toLocaleString()}  ${pct(snDisagreeShifted, snCompared)}`);
say('');
if (snDisagreeShifted < snDisagreeRaw * 0.5) {
    say('  ⇒ Most "wrong Strong\'s numbers" are the RIGHT numbers in the WRONG SLOT.');
    say('    The two tokenizers disagree about where a word starts, so tokens_nt\'s');
    say('    token_ordinal does not address the same word the index does. Fixing the');
    say('    splitter fixes the tags; a shares-no-consonant guard would only delete');
    say('    the symptoms.');
} else {
    say('  ⇒ Shifting does NOT rescue them — these look like genuinely wrong pairs,');
    say('    i.e. the passes-2-and-3 hypothesis in the handoff brief.');
}

for (const s of samples) {
    say('');
    say(`  ${s.v.book_id}:${s.v.chapter}:${s.v.verse}  shift ${s.shift >= 0 ? '+' : ''}${s.shift} (${s.matched}/${s.A.length} words line up)`);
    const n = Math.min(10, Math.max(s.A.length, s.B.length));
    for (let i = 0; i < n; i++) {
        const a = s.A[i], b = s.B[i];
        say(`    ${String(i + 1).padStart(3)}  bake: ${(a ? a.w : '—').padEnd(12)} ${(a?.sn || '').padEnd(7)}` +
            `   ${TABLE}: ${(b ? b.w : '—').padEnd(12)} ${b?.sn || ''}`);
    }
}

say('');
say('── NOTE ─────────────────────────────────────────────────────────────────');
say('  Anything that joins these two tables on (verse, token_ordinal) inherits');
say('  this: /api/tokens\' homograph guard, /api/raw, and the Studio\'s per-verse');
say('  Hebrew (txVerseQuery reads tokens_nt for canon 40-66).');
finish();
