#!/usr/bin/env node
/**
 * probe-term-gaps.mjs — READ ONLY. Writes nothing but its report.
 *
 * "Glosses for all the relevant (non-filler) words" needs two questions answered,
 * and only the first is mechanical:
 *
 *   1. which words does render-corpus currently leave as plain English?
 *   2. what transliteration should each one get?
 *
 * This answers (1) exactly — by loading THE SAME rule tables render-corpus loads,
 * so the verdict is what that renderer would actually do, not an approximation —
 * and answers (2) ONLY from word-map.json, which is derived from the tagged OT.
 * Where the OT has a dominant spelling, the pin is proposed with its count. Where
 * the OT disagrees with itself, both forms are shown and the choice is left to
 * you. Where the word never occurs in the OT at all, it says so: that is
 * authoring, and nothing here will invent a spelling for it.
 *
 * Output ends with a ready-to-paste term-forms.txt block for the unambiguous ones.
 *
 * USAGE
 *   node probe-term-gaps.mjs --out term-gaps.txt
 *   node probe-term-gaps.mjs --canon 40 --chapter 1 --out matthew1.txt
 *
 * FLAGS
 *   --db <path>      corpus.db (default ./corpus.db)
 *   --canon <n>      one canon_id, or --min/--max for a range (default 40-66)
 *   --min <n> --max <n>
 *   --chapter <n>    restrict to one chapter (needs --canon)
 *   --corpus <id>    which rendered text to read (default ENG)
 *   --top <n>        how many gaps to list (default 80)
 *   --min-count <n>  ignore words rarer than this (default 3)
 *   --out <file>     write the report here (never shell-redirect: winpty)
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, writeFileSync } from 'fs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const DB      = arg('db', './corpus.db');
const CANON   = arg('canon') ? parseInt(arg('canon'), 10) : null;
const MIN     = parseInt(arg('min', '40'), 10);
const MAX     = parseInt(arg('max', '66'), 10);
const CHAPTER = arg('chapter') ? parseInt(arg('chapter'), 10) : null;
const CORPUS  = arg('corpus', 'ENG');
const TOP     = parseInt(arg('top', '80'), 10);
const MINC    = parseInt(arg('min-count', '3'), 10);
const OUT     = arg('out');

const LINES = [];
const say = (...a) => { const s = a.join(' '); LINES.push(s); console.log(s); };
const rule = t => { say(''); say('─'.repeat(76)); say(t); say('─'.repeat(76)); };

// ── load the SAME tables render-corpus.mjs loads, the same way ──────────────
const readLines = f => existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/) : [];
const readJSON  = f => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;

const M = readJSON('./word-map.json');
if (!M) { console.error('word-map.json not found — run apply-web-strongs.mjs first'); process.exit(1); }
const NX = readJSON('./name-map-expanded.json') || { theonyms: {} };

const THEO = { ...(NX.theonyms || {}) };
for (const line of readLines('./divine-phrases.txt')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const [eng, tr] = t.split(/\s*=>\s*/); if (eng && tr) THEO[eng] = tr;
}
const TERM_EXCLUDE = new Set(readLines('./term-exclude.txt')
    .map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')));
const TERM = new Map();
for (const [eng, tr] of Object.entries(M.terms || {})) if (!TERM_EXCLUDE.has(eng)) TERM.set(eng, tr);
for (const line of readLines('./term-forms.txt')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const [w, f] = t.split(/\s+/);
    if (w && f && !TERM_EXCLUDE.has(w.toLowerCase())) TERM.set(w.toLowerCase(), f);
}
const NAME = new Map(Object.entries(M.names || {}));
const PEOPLE = new Map(Object.entries(M.peoples || {}));

// the OT-derived candidate pools, whatever shape the builder emitted them in
const DOM = M.termsDominant || M.terms_dominant || {};
const AMB = M.termsAmbiguous || M.terms_ambiguous || {};

say('probe-term-gaps — what render-corpus leaves as plain English, and what your');
say('own OT data says it should become.');
say(`word-map: names ${NAME.size}, peoples ${PEOPLE.size}, terms ${TERM.size}` +
    `, termsDominant ${Object.keys(DOM).length}, termsAmbiguous ${Object.keys(AMB).length}`);
say(`divine phrases + theonyms: ${Object.keys(THEO).length}`);

// ── filler: words that SHOULD stay English ──────────────────────────────────
// Deliberately conservative — grammar words only. Anything contentful stays in
// the report even if you end up not wanting it rendered; a missing candidate is
// worse than one you skip.
const FILLER = new Set(`a an the and or but if then than that this these those there here
of to in on at by for with from into unto upon over under about after before between through
is am are was were be been being do did does done have has had having will would shall should
may might must can could not no nor so as such it its he him his she her they them their we us
our you your i me my mine who whom whose which what when where why how all any both each few
more most other some only very own same too also just now ever never again once because while
until during against above below up down out off over under one two three four five six seven
eight nine ten first second third said say says saying went come came go going`.split(/\s+/));

const isFiller = w => FILLER.has(w.toLowerCase());
// a word render-corpus already handled leaves a "translit (gloss)" pair or a bare
// theonym; those are not gaps
// Both sides of every map. Keys are the ENGLISH ("Jesus"); values are what the
// renderer already put in the text ("Yashawai"). Counting only keys made every
// successfully-rendered name look like a gap — yashawai showed up 253 times as
// "not in the OT map" when it is the OT map's own output.
const RENDERED = new Set();
for (const m of [TERM, NAME, PEOPLE])
    for (const [k, v] of m) {
        RENDERED.add(String(k).toLowerCase());
        if (v) for (const part of String(v).split(/[\s-]+/)) if (part) RENDERED.add(part.toLowerCase());
    }
for (const v of Object.values(THEO))
    for (const part of String(v).split(/[\s-]+/)) if (part) RENDERED.add(part.toLowerCase());
// NOT the words of divine phrases. A phrase handles its words WHERE THE PHRASE
// OCCURS; the same word elsewhere is still a gap. Marking "holy" as handled
// because "Holy Spirit" exists hides exactly the pin you need. The phrases are
// removed from the text instead, below.
const THEO_KEYS = Object.keys(THEO).sort((a, b) => b.length - a.length);
const esc = s2 => s2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const THEO_RE = THEO_KEYS.length
    ? new RegExp('\\b(' + THEO_KEYS.map(esc).join('|') + ')\\b', 'g') : null;

// ── scan the rendered English ───────────────────────────────────────────────
const db = new Database(DB, { readonly: true });
const where = CANON
    ? `corpus = ? AND canon_id = ?` + (CHAPTER ? ' AND ord_c = ?' : '')
    : `corpus = ? AND canon_id BETWEEN ? AND ?`;
const params = CANON ? (CHAPTER ? [CORPUS, CANON, CHAPTER] : [CORPUS, CANON])
                     : [CORPUS, MIN, MAX];
const rows = db.prepare(`SELECT text FROM verses WHERE ${where} AND text IS NOT NULL`).all(...params);
db.close();
say(`verses scanned: ${rows.length}`);

// strip "translit (gloss)" pairs first — both halves are already handled
const PAIR = /([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'\u2019-]*)\s+\(([^()]*)\)/g;
const counts = new Map();
for (const r of rows) {
    let stripped = (r.text || '').replace(PAIR, ' ');
    if (THEO_RE) stripped = stripped.replace(THEO_RE, ' ');   // phrase handled where it occurs
    // Walk sentence by sentence so a sentence-INITIAL capital is not mistaken for a
    // name — otherwise "Behold" and every verse-opening word lands in the name list.
    for (const sentence of stripped.split(/(?<=[.!?;:\u201d"])\s+|\n+/)) {
        let first = true;
        for (const raw of sentence.split(/[^A-Za-z'\u2019-]+/)) {
            const w = raw.trim();
            if (!w) continue;
            const atStart = first; first = false;
            if (w.length < 3) continue;
            const lw = w.toLowerCase();
            if (isFiller(lw) || RENDERED.has(lw)) continue;
            const capitalised = w[0] === w[0].toUpperCase() && w.slice(1) === w.slice(1).toLowerCase();
            const key = (capitalised && !atStart) ? `\u0000NAME\u0000${w}` : lw;
            counts.set(key, (counts.get(key) || 0) + 1);
        }
    }
}

const terms = [...counts.entries()].filter(([k]) => !k.startsWith('\u0000'))
    .map(([w, n]) => ({ w, n })).filter(x => x.n >= MINC).sort((a, b) => b.n - a.n);
const names = [...counts.entries()].filter(([k]) => k.startsWith('\u0000'))
    .map(([k, n]) => ({ w: k.split('\u0000')[2], n })).filter(x => x.n >= MINC)
    .sort((a, b) => b.n - a.n);

// ── verdict per word, from word-map only ────────────────────────────────────
const verdict = (w) => {
    if (DOM[w]) {
        const d = DOM[w];
        const form = typeof d === 'string' ? d : (d.form || d.translit);
        const n = (d && d.count) || null;
        return { kind: 'dominant', form, note: n ? `${n} OT occurrences` : 'from termsDominant' };
    }
    if (AMB[w]) {
        const a = AMB[w];
        const forms = Array.isArray(a) ? a
            : (a.forms || Object.entries(a).map(([f, c]) => `${f}:${c}`));
        return { kind: 'ambiguous', form: null, note: `OT spellings: ${forms.join(', ')}` };
    }
    return { kind: 'absent', form: null, note: 'not in the OT map — authoring, not lookup' };
};

rule(`WORDS render-corpus LEAVES AS PLAIN ENGLISH (>= ${MINC} occurrences)`);
say('  count  word              verdict     proposed / note');
say('  ' + '-'.repeat(72));
const pins = [];
for (const { w, n } of terms.slice(0, TOP)) {
    const v = verdict(w);
    if (v.kind === 'dominant') pins.push({ w, form: v.form, n });
    say('  ' + String(n).padEnd(7) + w.padEnd(18) + v.kind.padEnd(12) +
        (v.form ? `${v.form}   (${v.note})` : v.note));
}

rule('CAPITALISED WORDS THE NAME PASS DID NOT KNOW');
say('These are probably names. Greek-derived NT names have no OT form and need a');
say('name-strongs.txt pin or an authored spelling; ones with an OT equivalent should');
say('resolve once aliased (e.g. Jechoniah -> H3204 Yakanayah).');
say('');
say('  count  word');
say('  ' + '-'.repeat(40));
for (const { w, n } of names.slice(0, TOP)) say('  ' + String(n).padEnd(7) + w);

rule('READY TO PASTE — term-forms.txt');
if (!pins.length) {
    say('# (nothing proposed: no gap word had an unambiguous OT form)');
} else {
    say('# Proposed by probe-term-gaps from word-map.json termsDominant.');
    say('# Every form below is YOUR OT data, not an invented spelling. Ambiguous and');
    say('# absent words are deliberately excluded — those are decisions, not lookups.');
    for (const p of pins) say(`${p.w.padEnd(14)}${p.form}      # ${p.n} in the scanned range`);
}

if (OUT) { writeFileSync(OUT, LINES.join('\n') + '\n'); console.log(`\n[written to ${OUT}]`); }
