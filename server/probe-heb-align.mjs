#!/usr/bin/env node
/**
 * probe-heb-align.mjs — READ ONLY. Writes nothing but its report.
 *
 * Answers the two questions that decide whether HEB can be fully qualified from
 * BHS and baked into surface-index.db, with OT and NT on one path:
 *
 *   A) OT ALIGNMENT.  HEB (extra) and BHS are the SAME TEXT for canon 1-39, so a
 *      HEB whole word should equal a RUN of consecutive BHS tokens in the same
 *      verse (𐤄𐤌𐤔𐤉𐤇 = [𐤄 art] + [𐤌𐤔𐤉𐤇 subs H4899]). Where that holds, every
 *      morpheme's pos/morph/strongs/lemma is ATTESTED, not inferred — full
 *      qualification including suffixes. This measures how often it holds.
 *
 *   B) NT COVERAGE.  Alignment yields a table keyed by WHOLE-WORD HEB forms with
 *      their affixes intact — the shape the NT is actually written in. This
 *      measures what share of NT words are already in that table, i.e. what share
 *      of the NT can be fully qualified with no new tagging and no stripping.
 *
 * It also reports the two things that cap the answer: verse-key overlap (BHS
 * versification vs the HEB edition's) and form ambiguity (one surface, more than
 * one attested analysis — a homograph the surface alone cannot disambiguate).
 *
 * USAGE
 *   node probe-heb-align.mjs --out heb-align.txt
 *   node probe-heb-align.mjs --canon 1 --samples 20 --out gen.txt
 *
 * FLAGS
 *   --db <path>      corpus.db (default ./corpus.db)
 *   --corpus <id>    unsegmented Hebrew corpus id (default HEB)
 *   --canon <n>      restrict to one canon_id
 *   --ot-max <n>     last OT canon_id (default 39)
 *   --nt-min <n>     first NT canon_id (default 40)
 *   --nt-max <n>     last NT canon_id (default 66)
 *   --samples <n>    sample rows per section (default 12)
 *   --out <file>     write the report here (do NOT use shell redirection: in
 *                    MINGW64 winpty replaces the file with "stdout is not a tty")
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

// ── arg parsing ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, dflt = null) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const DB_PATH  = arg('db', './corpus.db');
const CORPUS   = arg('corpus', 'HEB');
const ONLY     = arg('canon') ? parseInt(arg('canon'), 10) : null;
const OT_MAX   = parseInt(arg('ot-max', '39'), 10);
const NT_MIN   = parseInt(arg('nt-min', '40'), 10);
const NT_MAX   = parseInt(arg('nt-max', '66'), 10);
const SAMPLES  = parseInt(arg('samples', '12'), 10);
const OUT      = arg('out');

// ── report buffer (console AND file — never shell redirection) ──────────────
const LINES = [];
const say = (...a) => { const s = a.join(' '); LINES.push(s); console.log(s); };
const rule = (t) => { say(''); say('─'.repeat(78)); say(t); say('─'.repeat(78)); };
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : 'n/a';
function table(rows, cols) {
    if (!rows.length) { say('  (none)'); return; }
    const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
    say('  ' + cols.map((c, i) => c.padEnd(w[i])).join('  '));
    say('  ' + w.map(x => '-'.repeat(x)).join('  '));
    for (const r of rows) say('  ' + cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  '));
}

// ── script normalisation ────────────────────────────────────────────────────
// The two sides may be stored in different scripts. Square Hebrew maps 1:1 onto
// the Paleo block in alphabet order; the five final forms fold onto their medial
// letters. This is the standard correspondence, not an inference about the data.
const SQUARE_TO_PALEO = {
    'א':'𐤀','ב':'𐤁','ג':'𐤂','ד':'𐤃','ה':'𐤄','ו':'𐤅','ז':'𐤆','ח':'𐤇','ט':'𐤈',
    'י':'𐤉','כ':'𐤊','ך':'𐤊','ל':'𐤋','מ':'𐤌','ם':'𐤌','נ':'𐤍','ן':'𐤍','ס':'𐤎',
    'ע':'𐤏','פ':'𐤐','ף':'𐤐','צ':'𐤑','ץ':'𐤑','ק':'𐤒','ר':'𐤓','ש':'𐤔','שׂ':'𐤔',
    'שׁ':'𐤔','ת':'𐤕',
};
/** Consonantal skeleton in Paleo: drop vowels, cantillation, punctuation. */
function toPaleo(s) {
    if (!s) return '';
    let out = '';
    for (const ch of s) {
        if (ch >= '\u{10900}' && ch <= '\u{10915}') out += ch;
        else if (SQUARE_TO_PALEO[ch]) out += SQUARE_TO_PALEO[ch];
    }
    return out;
}
/** Split a verse into words. MAQAF (U+05BE) is a word JOINER but a word BOUNDARY
 *  for this purpose: BHS tokenises either side separately. */
function words(text) {
    if (!text) return [];
    return String(text)
        .replace(/\u05BE/g, ' ')
        .split(/\s+/)
        .map(toPaleo)
        .filter(Boolean);
}

// ── open ────────────────────────────────────────────────────────────────────
let db;
try { db = new Database(DB_PATH, { readonly: true }); }
catch (e) { console.error(`cannot open ${DB_PATH}: ${e.message}`); process.exit(1); }

const hasTable = (t) => {
    try { db.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get(); return true; } catch { return false; }
};
if (!hasTable('verses'))     { console.error('no verses table'); process.exit(1); }
if (!hasTable('tokens_bhs')) { console.error('no tokens_bhs table'); process.exit(1); }

say(`probe-heb-align — db=${DB_PATH} corpus=${CORPUS}`);
say(`OT canon 1-${OT_MAX} · NT canon ${NT_MIN}-${NT_MAX}` + (ONLY ? ` · restricted to canon ${ONLY}` : ''));

// ── verse readers ───────────────────────────────────────────────────────────
// The unsegmented corpus may carry its Paleo in text_paleo or in text; prefer
// whichever actually yields Paleo letters, per verse.
const verseCols = db.prepare(`PRAGMA table_info(verses)`).all().map(r => r.name);
const hasPaleoCol = verseCols.includes('text_paleo');
const VERSES = db.prepare(`
    SELECT canon_id, ord_c AS chapter, ord_v AS verse, text
           ${hasPaleoCol ? ', text_paleo' : ''}
    FROM verses
    WHERE corpus = ? AND canon_id BETWEEN ? AND ?
      AND ord_c IS NOT NULL AND ord_v IS NOT NULL
    ORDER BY canon_id, ord_c, ord_v
`);
const verseWords = (row) => {
    const a = hasPaleoCol ? words(row.text_paleo) : [];
    return a.length ? a : words(row.text);
};

const BHS_VERSE = db.prepare(`
    SELECT token_ordinal, word_raw, lemma, root, pos, morph, strongs
    FROM tokens_bhs
    WHERE book_id = ? AND chapter = ? AND verse = ?
    ORDER BY token_ordinal
`);

// ── A) OT ALIGNMENT ─────────────────────────────────────────────────────────
rule('A) OT ALIGNMENT — HEB whole word  vs  run of BHS tokens in the same verse');

const otRows = VERSES.all(CORPUS, ONLY ?? 1, ONLY ?? OT_MAX);
say(`HEB verses in the OT range: ${otRows.length}`);
if (!otRows.length) say('  NOTHING TO ALIGN — check --corpus and that ord_c/ord_v are populated.');

/** heb surface -> Map(signature -> {count, morphemes}) built ONLY from exact runs. */
const FORMS = new Map();
const perBook = new Map();
const alignMisses = [];
let vSeen = 0, vNoBhs = 0, wTotal = 0, wAligned = 0, wOneToken = 0, wMulti = 0;

const bump = (canon, field) => {
    if (!perBook.has(canon)) perBook.set(canon, { canon, verses: 0, no_bhs: 0, words: 0, aligned: 0, multi: 0 });
    perBook.get(canon)[field]++;
};

for (const row of otRows) {
    vSeen++;
    bump(row.canon_id, 'verses');
    const toks = BHS_VERSE.all(row.canon_id, row.chapter, row.verse);
    if (!toks.length) { vNoBhs++; bump(row.canon_id, 'no_bhs'); continue; }

    const hw = verseWords(row);
    const tk = toks.map(t => ({ ...t, paleo: toPaleo(t.word_raw) })).filter(t => t.paleo);

    // Greedy left-to-right: consume BHS tokens until their concatenation equals
    // the HEB word. Only an EXACT equality counts as aligned — a partial or
    // overrunning match means the two editions disagree on this word, and
    // guessing which morphemes belong to it is exactly what we refuse to do.
    let ti = 0;
    for (const w of hw) {
        wTotal++; bump(row.canon_id, 'words');
        let acc = '', run = [], ok = false;
        let j = ti;
        while (j < tk.length && acc.length < w.length) {
            acc += tk[j].paleo; run.push(tk[j]); j++;
            if (acc === w) { ok = true; break; }
        }
        if (ok) {
            wAligned++; bump(row.canon_id, 'aligned');
            if (run.length === 1) wOneToken++; else { wMulti++; bump(row.canon_id, 'multi'); }
            ti = j;
            const morphemes = run.map(t => ({
                paleo: t.paleo, pos: t.pos || '', morph: t.morph || '',
                strongs: t.strongs || '', lemma: t.lemma || '', root: t.root || '',
            }));
            const sig = morphemes.map(m => `${m.paleo}/${m.pos}/${m.morph}/${m.strongs}`).join('+');
            if (!FORMS.has(w)) FORMS.set(w, new Map());
            const bucket = FORMS.get(w);
            if (!bucket.has(sig)) bucket.set(sig, { count: 0, morphemes });
            bucket.get(sig).count++;
        } else {
            // Resync conservatively: skip a single BHS token so one disagreement
            // cannot cascade through the rest of the verse.
            if (alignMisses.length < SAMPLES * 40) {
                alignMisses.push({
                    canon: row.canon_id, ref: `${row.chapter}:${row.verse}`,
                    heb_word: w, bhs_from: tk[ti] ? tk[ti].paleo : '(end)', accumulated: acc || '(none)',
                });
            }
            ti = Math.min(ti + 1, tk.length);
        }
    }
}

say('');
say(`verses examined            : ${vSeen}`);
say(`  with no BHS tokens at all: ${vNoBhs}  (${pct(vNoBhs, vSeen)})  ← versification / coverage gap`);
say(`HEB words examined         : ${wTotal}`);
say(`  ALIGNED exactly          : ${wAligned}  (${pct(wAligned, wTotal)})   ← fully qualifiable from BHS`);
say(`    single BHS token       : ${wOneToken}  (${pct(wOneToken, wAligned)})`);
say(`    multi-token (affixes)  : ${wMulti}  (${pct(wMulti, wAligned)})   ← the prefixed/suffixed words`);
say(`  unaligned                : ${wTotal - wAligned}  (${pct(wTotal - wAligned, wTotal)})`);
say(`distinct HEB word forms    : ${FORMS.size}`);

say('');
say('Per book (worst alignment first):');
table(
    [...perBook.values()]
        .map(b => ({ canon: b.canon, verses: b.verses, no_bhs: b.no_bhs, words: b.words,
                     aligned: b.aligned, rate: pct(b.aligned, b.words), multi: b.multi }))
        .sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))
        .slice(0, 25),
    ['canon', 'verses', 'no_bhs', 'words', 'aligned', 'rate', 'multi']
);

say('');
say('Unaligned samples (HEB word vs where BHS was in the verse):');
table(alignMisses.slice(0, SAMPLES), ['canon', 'ref', 'heb_word', 'bhs_from', 'accumulated']);

// ── ambiguity: one surface, more than one attested analysis ─────────────────
rule('A2) FORM AMBIGUITY — surfaces with more than one attested BHS analysis');
const ambiguous = [];
let occTotal = 0, occDominant = 0;
for (const [form, bucket] of FORMS) {
    const sigs = [...bucket.values()].sort((a, b) => b.count - a.count);
    const total = sigs.reduce((s, x) => s + x.count, 0);
    occTotal += total; occDominant += sigs[0].count;
    if (sigs.length > 1) {
        ambiguous.push({
            form, readings: sigs.length, occurrences: total,
            dominant: pct(sigs[0].count, total),
            top_strongs: sigs[0].morphemes.map(m => m.strongs || '-').join('+'),
            alt_strongs: sigs[1].morphemes.map(m => m.strongs || '-').join('+'),
        });
    }
}
say(`forms with >1 attested reading : ${ambiguous.length}  (${pct(ambiguous.length, FORMS.size)} of forms)`);
say(`occurrences served by the dominant reading if we pick by frequency: ${pct(occDominant, occTotal)}`);
say('');
say('Most frequent ambiguous forms:');
table(ambiguous.sort((a, b) => b.occurrences - a.occurrences).slice(0, SAMPLES),
      ['form', 'readings', 'occurrences', 'dominant', 'top_strongs', 'alt_strongs']);

// ── B) NT COVERAGE ──────────────────────────────────────────────────────────
rule('B) NT COVERAGE — NT words already present as OT-attested whole-word forms');

const ntRows = ONLY && ONLY <= OT_MAX ? [] : VERSES.all(CORPUS, ONLY ?? NT_MIN, ONLY ?? NT_MAX);
say(`HEB verses in the NT range: ${ntRows.length}`);

const missCount = new Map();
const ntBook = new Map();
let ntWords = 0, ntHit = 0, ntHitUnambig = 0, ntHitMulti = 0;

for (const row of ntRows) {
    for (const w of verseWords(row)) {
        ntWords++;
        if (!ntBook.has(row.canon_id)) ntBook.set(row.canon_id, { canon: row.canon_id, words: 0, hit: 0 });
        ntBook.get(row.canon_id).words++;
        const bucket = FORMS.get(w);
        if (bucket) {
            ntHit++; ntBook.get(row.canon_id).hit++;
            if (bucket.size === 1) ntHitUnambig++;
            const best = [...bucket.values()].sort((a, b) => b.count - a.count)[0];
            if (best.morphemes.length > 1) ntHitMulti++;
        } else {
            missCount.set(w, (missCount.get(w) || 0) + 1);
        }
    }
}

say('');
say(`NT words examined                 : ${ntWords}`);
say(`  FULLY QUALIFIABLE from OT forms : ${ntHit}  (${pct(ntHit, ntWords)})   ← the number that decides the plan`);
say(`    of those, one reading only    : ${ntHitUnambig}  (${pct(ntHitUnambig, ntHit)})   ← no homograph judgement needed`);
say(`    of those, multi-morpheme      : ${ntHitMulti}  (${pct(ntHitMulti, ntHit)})   ← prefixes/suffixes come along`);
say(`  not in the OT form table        : ${ntWords - ntHit}  (${pct(ntWords - ntHit, ntWords)})`);
say(`distinct unresolved NT forms      : ${missCount.size}`);

say('');
say('Per NT book (worst first):');
table(
    [...ntBook.values()]
        .map(b => ({ canon: b.canon, words: b.words, hit: b.hit, rate: pct(b.hit, b.words) }))
        .sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate)),
    ['canon', 'words', 'hit', 'rate']
);

say('');
say('Most frequent unresolved NT forms (expect Greek-derived names here):');
table([...missCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, SAMPLES * 2)
        .map(([form, n]) => ({ form, occurrences: n })),
      ['form', 'occurrences']);

// ── verdict ─────────────────────────────────────────────────────────────────
rule('WHAT THESE NUMBERS DECIDE');
say('A-aligned %   : share of the OT that can be baked FULLY QUALIFIED (all affixes,');
say('                attested per occurrence). Anything short of ~100% is orthography or');
say('                versification drift — the per-book table says which books.');
say('A2-dominant % : how much of the OT a frequency pick would serve correctly where a');
say('                surface has more than one reading. In the OT this is a fallback only');
say('                (tokens_bhs holds the authoritative per-occurrence SN); in the NT');
say('                there is no such authority, so it is the residual inference.');
say('B-hit %       : share of the NT that inherits full qualification with NO new tagging.');
say('                Compare against the 92.3% Strong\'s-only figure: this one is stricter,');
say('                because the form must match with its affixes intact.');

if (OUT) { writeFileSync(OUT, LINES.join('\n') + '\n'); console.log(`\n[report written to ${OUT}]`); }
db.close();
