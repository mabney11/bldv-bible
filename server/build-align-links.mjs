#!/usr/bin/env node
/**
 * build-align-links.mjs — learn English <-> Strong's alignment from the OT, then
 * generate translation_links for the NT.
 *
 * WHY STATISTICS AND NOT A DICTIONARY
 * probe-heb-coverage measured 16 linked tokens out of 84,412 (0.0%). Hand-authoring
 * the rest is not a plan, and kjv_def cannot bridge the cases that matter: H3205's
 * definition reads "beget, bear, bring forth" while the English says "became the
 * father of". No lookup connects those.
 *
 * But that pairing occurs ~40 times in Matthew 1 alone, and thousands of times
 * across the OT, where every verse has both an English rendering and Hebrew tokens
 * carrying authoritative OSHB Strong's numbers. That is a parallel corpus, and
 * co-occurrence over ~23,000 verses learns the idiomatic mappings a dictionary
 * cannot state.
 *
 * METHOD — IBM Model 1 with a NULL alignment, a handful of EM iterations.
 * Deliberately the simplest thing that works: no reordering model, no fertility.
 * We only need "which Strong's does this English word belong to", and Model 1 is
 * the standard, well-understood answer. Every probability is estimated from
 * fieldy's own corpus; nothing is imported.
 *
 * The OT is the training set BECAUSE its tags are authoritative per occurrence.
 * The NT is only ever the target.
 *
 * OUTPUT — one link per contiguous English span sharing a Strong's, so a token
 * that renders as several English words gets ONE span, which is the whole point.
 * Writes nothing without --apply, and always writes a review file first.
 *
 * USAGE
 *   node build-align-links.mjs --out align-report.txt          # train + preview
 *   node build-align-links.mjs --out align-report.txt --apply  # also write links
 *
 * FLAGS
 *   --db <path>       corpus.db        (default ./corpus.db)
 *   --index <path>    surface-index.db (default ./surface-index.db)
 *   --links <path>    db holding translation_links (default ./translation.db)
 *   --iters <n>       EM iterations (default 5)
 *   --min-prob <p>    refuse an alignment below this probability (default 0.12)
 *   --sample <n>      verses to show in the review (default 12)
 *   --apply           write rows into translation_links
 *   --out <file>      report (never shell-redirect: winpty)
 */

import Database from 'better-sqlite3';
import { writeFileSync, existsSync, readFileSync } from 'fs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
// Declared here, ahead of every threshold that reads them.
// --purge removes every generated link and writes nothing new, returning the NT to
// plain original English plus whatever the curated rules add. The recovery path
// when the links are doing more harm than good.
const PURGE   = argv.includes('--purge');
// --strict raises the bar so only confident matches survive. fieldy: "I dont want
// non-matches corrupting my reader" — a missing gloss is recoverable, a wrong one
// is not, because it reads as authoritative.
const STRICT  = argv.includes('--strict');
const DB      = arg('db', './corpus.db');
const IDX     = arg('index', './surface-index.db');
const LINKSDB = arg('links', './translation.db');
// web-strongs.jsonl is the INPUT to apply-web-strongs; english-baseline.jsonl is
// its OUTPUT and is ALREADY RENDERED ("In the raashayath (beginning) Alahayam
// baraa (created)"). Train on the input, never the output.
const BASELINE = arg('baseline') ||
    ['./web-strongs.jsonl', './english-baseline.jsonl'].find(f => existsSync(f)) ||
    './web-strongs.jsonl';
// 5 was too few. With ~8,600 Strong's and real translation vocabulary the table
// is still flat at 5 — function words like "and" outranked "bore"/"father" for
// H3205, meaning they had not yet migrated to the NULL alignment. Model 1 is
// convex so more iterations cannot make it worse, only slower.
const ITERS   = parseInt(arg('iters', '12'), 10);
// An absolute floor is a blunt instrument once the distribution is flat: the real
// test is already "does this token beat the NULL alignment", which is scale-free.
// Kept low so NULL does the deciding.
const MINP    = parseFloat(arg('min-prob', STRICT ? '0.10' : '0.04'));
// Raw p(word|strongs) rewards words that are simply COMMON: "and" topped H3205,
// "of" topped H1121, "the" topped H1697, because they appear in nearly every
// verse and so accrue mass for every number. Scoring by the RATIO against the
// NULL alignment — how much this word prefers THIS token over the corpus at
// large — cancels that out. A ratio of 1 means "no more likely here than
// anywhere"; content words score far above it.
const MINRATIO = parseFloat(arg('min-ratio', STRICT ? '4' : '1.5'));
// A Strong's seen only a handful of times in the OT has a spiky, unreliable
// distribution over the few verses it appears in — which is how H3442 (Yeshua)
// came to "prefer" the word "the". Require real support before trusting it.
const MINSUPPORT = parseInt(arg('min-support', STRICT ? '15' : '5'), 10);

// ENGLISH FUNCTION WORDS NEVER RECEIVE A LINK.
// Every wrong gloss in Matthew 1 was a content token attached to one of these:
// "Yashawai (the)", "ath (of)", "ith (at)", "babal (of)", "mana (from)",
// "marayam (was)", "yaladath (she)", "hamah (like)". No Hebrew word is what "the"
// means, so no amount of probability should be able to say otherwise.
// HEBREW PARTICLES THAT NEVER OWN AN ENGLISH SPAN.
// 𐤀𐤕 is the direct-object marker — untranslated by design, and tagged
// `preposition` in the source, so the pos filter lets it through. It was being
// handed "of" and "his brothers". 𐤀𐤔𐤓 and 𐤊𐤉 are the relative and the
// causal conjunction; both are grammar, and both are mis-tagged in places.
const HEBREW_STOP = new Set(['\u{10900}\u{10915}', '\u{10900}\u{10914}\u{10913}',
                             '\u{1090A}\u{10909}']);   // 𐤀𐤕, 𐤀𐤔𐤓, 𐤊𐤉

const ENGLISH_STOP = new Set(`a an the this that these those there here
of to at in on by for with from into unto upon over under about after before
between through during against above below across along among within without
and or but nor so than then as if because while until since though although
is am are was were be been being do does did done have has had having
will would shall should may might must can could
i me my mine we us our ours you your yours he him his she her hers it its
they them their theirs who whom whose which what when where why how
not no nor all any both each every few more most other some such only very
own same too also just now ever never again once
one two three four five six seven eight nine ten`.split(/\s+/));
const SAMPLE  = parseInt(arg('sample', '12'), 10);
const APPLY   = argv.includes('--apply');
const OUT     = arg('out');

const LINES = [];
const say = (...a) => { const s = a.join(' '); LINES.push(s); console.log(s); };

// --purge exits before any training: it is a recovery action, not an analysis.
if (PURGE) {
    if (!existsSync(LINKSDB)) { console.error(`${LINKSDB} not found`); process.exit(1); }
    const ldb = new Database(LINKSDB);
    let removed = 0;
    try { removed = ldb.prepare(`DELETE FROM translation_links WHERE lang='HEB-auto'`).run().changes; }
    catch (e) { console.error(`could not purge: ${e.message}`); process.exit(1); }
    ldb.close();
    console.log(`purged ${removed.toLocaleString()} generated links (lang='HEB-auto') from ${LINKSDB}.`);
    console.log('Hand-authored links with any other lang were left alone.');
    console.log('Now: node render-all.mjs --surface   (re-renders from the pristine text_src)');
    process.exit(0);
}
const rule = t => { say(''); say('─'.repeat(76)); say(t); say('─'.repeat(76)); };

const NULLSN = '__NULL__';

// TRAIN ON THE ORIGINAL ENGLISH, NOT THE RENDERED ENGLISH.
// The first run of this tool trained on `text`, which is the rendered output, and
// duly learned its own glosses: H3205 -> "yalad" 0.191, H1 -> "ab" 0.216,
// H1121 -> "ban" 0.360, H559 -> "amar" 0.346. Circular, and useless for finding
// the idioms — "became the father of" had already been REPLACED by
// "yalad (birth / begot)" in the text being learned from, so the phrase the model
// most needed to see was the one thing missing from its input.
// text_src holds the pristine translation (render-corpus --from-src reads it).
const stripGlosses = txt => String(txt || '')
    // "translit (gloss)" -> "gloss": recovers the original wording when only the
    // rendered text is available. Safety net; text_src is preferred.
    .replace(/\b[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'-]*\s+\(([^()]*)\)/g, '$1');
const words = txt => stripGlosses(txt).toLowerCase()
    .replace(/[^a-z\u00C0-\u024F'\s-]/g, ' ').split(/\s+/).filter(Boolean);

say('build-align-links — learn English<->Strongs from the OT, align the NT');
if (STRICT) say(`--strict: min-ratio ${MINRATIO}, min-support ${MINSUPPORT}, min-prob ${MINP}` +
                '  (fewer links, higher confidence)');

// ── training pairs: OT English verse + that verse's Strong's ────────────────
const db = new Database(DB, { readonly: true });
// ── PRISTINE ENGLISH ────────────────────────────────────────────────────────
// render-all step 2/3 stitch and load english-baseline.jsonl — the untouched
// translation for all 66 books, BEFORE any rendering. That is the correct
// training text.
// corpus.db's `text` is the RENDERED output, and text_src is only populated for
// the UNTAGGED books, because render-corpus --reset-src snapshots those; the OT
// is rendered by apply-web-strongs and never gets a text_src. Which is exactly
// why the OT training set fell back to rendered text and the model learned
// "birth / begot" for H3205 instead of "became the father of".
const INSPECT = argv.includes('--inspect');

// Book CODES ("GEN") resolved from corpus.db rather than a hardcoded list, so the
// mapping is fieldy's own. Guessing this would silently misalign whole books.
const CODE_TO_CANON = new Map();
try {
    for (const r of db.prepare(`SELECT DISTINCT code, canon_id FROM verses
                                WHERE code IS NOT NULL AND canon_id IS NOT NULL`).all())
        if (!CODE_TO_CANON.has(String(r.code).toUpperCase()))
            CODE_TO_CANON.set(String(r.code).toUpperCase(), r.canon_id);
} catch { /* no code column */ }

const baseline = new Map();
if (existsSync(BASELINE)) {
    if (INSPECT) {
        const raw = readFileSync(BASELINE, 'utf8').split(/\r?\n/).filter(x => x.trim()).slice(0, 3);
        say(`--inspect: first ${raw.length} line(s) of ${BASELINE}`);
        for (const line of raw) {
            say('  ' + line.slice(0, 300));
            try { say('    keys: ' + Object.keys(JSON.parse(line)).join(', ')); } catch { say('    (not JSON)'); }
        }
        if (OUT) writeFileSync(OUT, LINES.join('\n') + '\n');
        process.exit(0);
    }
    const pick = (o, names) => { for (const n of names) if (o[n] !== undefined && o[n] !== null) return o[n]; return undefined; };
    // A reference may be one string ("Genesis 1:1", "Gen 1:1", "1|1|1", "40:1:1")
    // rather than three fields. Book NAMES cannot be resolved without the book
    // table, so only numeric forms are accepted here — a wrong book id would
    // silently misalign an entire testament.
    const parseRef = (r) => {
        const m = /^\s*(\d+)\s*[|:. _-]\s*(\d+)\s*[|:. _-]\s*(\d+)\s*$/.exec(String(r));
        return m ? [ +m[1], +m[2], +m[3] ] : null;
    };
    let bad = 0;
    const badKeys = new Map();
    for (const line of readFileSync(BASELINE, 'utf8').split(/\r?\n/)) {
        const t = line.trim(); if (!t) continue;
        let o; try { o = JSON.parse(t); } catch { bad++; continue; }
        let canon = pick(o, ['canon_id', 'canonId', 'book_id', 'bookId', 'book_num', 'bookNum', 'book', 'b']);
        if (canon === undefined || !Number.isFinite(+canon)) {
            const code = pick(o, ['code', 'book_code', 'bookCode', 'osis', 'abbrev']);
            if (code !== undefined) {
                const resolved = CODE_TO_CANON.get(String(code).toUpperCase());
                if (resolved !== undefined) canon = resolved;
            }
        }
        let ch    = pick(o, ['ord_c', 'chapter', 'chap', 'c', 'ch']);
        let vs    = pick(o, ['ord_v', 'verse', 'ver', 'v']);
        const txt = pick(o, ['text', 'english', 'eng', 'en', 'body', 'content', 'verse_text', 'value', 't']);
        if (canon === undefined || ch === undefined || vs === undefined) {
            const ref = pick(o, ['ref', 'ref_key', 'refKey', 'reference', 'id', 'key', 'osis']);
            const parsed = ref !== undefined ? parseRef(ref) : null;
            if (parsed) [canon, ch, vs] = parsed;
        }
        if (canon === undefined || ch === undefined || vs === undefined || !txt) {
            bad++;
            if (badKeys.size < 6) badKeys.set(Object.keys(o).join(','), (badKeys.get(Object.keys(o).join(',')) || 0) + 1);
            continue;
        }
        if (!Number.isFinite(+canon)) { bad++; continue; }   // book NAMES need the book table
        baseline.set(`${parseInt(canon, 10)}|${parseInt(ch, 10)}|${parseInt(vs, 10)}`, String(txt));
    }
    say(`baseline: ${baseline.size.toLocaleString()} verses from ${BASELINE}` +
        (bad ? `  (${bad.toLocaleString()} lines unparsed)` : ''));
    // THE CHECK THAT WOULD HAVE CAUGHT THIS IMMEDIATELY. A rendered file is full
    // of "translit (gloss)" pairs; a pristine translation has almost none.
    if (baseline.size) {
        const sample = [...baseline.values()].slice(0, 400);
        const withPairs = sample.filter(t2 =>
            /\b[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'-]*\s+\([^()]{2,}\)/.test(t2)).length;
        const ratio = withPairs / sample.length;
        say(`  gloss-pair density: ${(100 * ratio).toFixed(0)}% of sampled verses`);
        if (ratio > 0.3) {
            say('');
            say('  ⚠ THIS FILE IS ALREADY RENDERED, NOT THE ORIGINAL TRANSLATION.');
            say('  english-baseline.jsonl is the OUTPUT of apply-web-strongs; its INPUT');
            say('  is web-strongs.jsonl. Training on the output teaches the model its own');
            say('  glosses and loses every idiom a gloss replaced — "became the father of"');
            say('  survives only as "birth / begot".');
            say('  Pass --baseline web-strongs.jsonl (or wherever the pristine text lives).');
            say('  Glosses are stripped as a fallback, but stripping cannot recover a');
            say('  phrase that was replaced wholesale.');
        }
    }
    if (!baseline.size) {
        say('  ⚠ parsed nothing. The key sets actually present:');
        for (const [k, n] of badKeys) say(`      {${k}}  x${n.toLocaleString()}`);
        say('  Run with --inspect to dump the first lines verbatim.');
    }
} else {
    say(`baseline: ${BASELINE} not found — falling back to text_src / rendered text`);
}

const hasSrc = (() => { try { db.prepare('SELECT text_src FROM verses LIMIT 1').get(); return true; } catch { return false; } })();
const engRows = db.prepare(`
    SELECT canon_id, ord_c, ord_v, text
           ${hasSrc ? ', text_src' : ''}
    FROM verses
    WHERE corpus='ENG' AND text IS NOT NULL AND ord_c IS NOT NULL AND ord_v IS NOT NULL`).all();
const eng = new Map();
let srcOT = 0, fallbackOT = 0, baseOT = 0;
for (const r of engRows) {
    const key = `${r.canon_id}|${r.ord_c}|${r.ord_v}`;
    const base = baseline.get(key);
    const src = hasSrc && r.text_src && r.text_src.trim();
    eng.set(key, base || src || r.text);
    if (r.canon_id <= 39) { if (base) baseOT++; else if (src) srcOT++; else fallbackOT++; }
}
say(`English verses: ${eng.size.toLocaleString()}`);
say(`OT verses (the training set): ${baseOT.toLocaleString()} from the baseline, ` +
    `${srcOT.toLocaleString()} from text_src, ${fallbackOT.toLocaleString()} from rendered text`);
if (fallbackOT > baseOT + srcOT) {
    say('');
    say('  ⚠ MOST OF THE TRAINING SET IS RENDERED TEXT, NOT THE ORIGINAL.');
    say('  Gloss-stripping recovers "sapar (book)" -> "book", but where a gloss');
    say('  REPLACED an idiom it cannot recover it: "yalad (birth / begot)" gives');
    say('  back "birth / begot", never "became the father of" — which is exactly');
    say('  the mapping this tool exists to learn. Populate text_src for the OT');
    say('  (canon 1-39) before trusting these links.');
}

const otSn = new Map();
for (const r of db.prepare(`
    SELECT book_id, chapter, verse, strongs FROM tokens_bhs
    WHERE strongs IS NOT NULL AND strongs <> '' AND book_id BETWEEN 1 AND 39`).all()) {
    const sn = 'H' + String(r.strongs).replace(/^H+/i, '');
    if ((parseInt(sn.slice(1), 10) || 0) >= 9000) continue;     // virtual placeholders
    const k = `${r.book_id}|${r.chapter}|${r.verse}`;
    if (!otSn.has(k)) otSn.set(k, []);
    otSn.get(k).push(sn);
}
db.close();

const pairs = [];
for (const [k, sns] of otSn) {
    const t = eng.get(k);
    if (!t) continue;
    const e = words(t);
    if (!e.length || !sns.length) continue;
    pairs.push([e, [NULLSN, ...new Set(sns)]]);
}
say(`training verses (English + tagged Hebrew): ${pairs.length.toLocaleString()}`);
if (pairs.length < 100) {
    say('');
    say('Too little parallel data to train on. Both an ENG rendering and tagged');
    say('tokens_bhs rows are needed for the same verse.');
    if (OUT) writeFileSync(OUT, LINES.join('\n') + '\n');
    process.exit(0);
}

// ── IBM Model 1, EM ─────────────────────────────────────────────────────────
// t[sn][word] = P(word | strongs). Initialised uniform over the words each
// Strong's is ever seen with, so the table stays sparse.
let t = new Map();
for (const [e, sns] of pairs) {
    for (const sn of sns) {
        if (!t.has(sn)) t.set(sn, new Map());
        const m = t.get(sn);
        for (const w of e) if (!m.has(w)) m.set(w, 0);
    }
}
for (const [, m] of t) { const u = 1 / m.size; for (const w of m.keys()) m.set(w, u); }
// how many training verses each Strong's actually appeared in
const support = new Map();
for (const [, sns] of pairs) for (const sn of sns) support.set(sn, (support.get(sn) || 0) + 1);
const thin = [...support.values()].filter(n => n < MINSUPPORT).length;
say(`translation table: ${t.size.toLocaleString()} Strong's numbers` +
    `  (${thin.toLocaleString()} seen in fewer than ${MINSUPPORT} verses — excluded as link targets)`);

let prevT = new Map([...t].map(([sn, m]) => [sn, new Map(m)]));
for (let it = 1; it <= ITERS; it++) {
    const count = new Map(), total = new Map();
    for (const [e, sns] of pairs) {
        for (const w of e) {
            let z = 0;
            for (const sn of sns) z += t.get(sn).get(w) || 0;
            if (!z) continue;
            for (const sn of sns) {
                const p = (t.get(sn).get(w) || 0) / z;
                if (!p) continue;
                if (!count.has(sn)) count.set(sn, new Map());
                const c = count.get(sn);
                c.set(w, (c.get(w) || 0) + p);
                total.set(sn, (total.get(sn) || 0) + p);
            }
        }
    }
    for (const [sn, c] of count) {
        const tot = total.get(sn) || 1;
        const m = t.get(sn);
        for (const [w, v] of c) m.set(w, v / tot);
    }
    // Convergence: mean absolute change across the table. When this stops moving,
    // more iterations buy nothing — so it is visible rather than guessed at.
    let delta = 0, n = 0;
    for (const [sn, m] of t) {
        const prev = prevT.get(sn);
        if (!prev) continue;
        for (const [w, v] of m) { delta += Math.abs(v - (prev.get(w) || 0)); n++; }
    }
    prevT = new Map([...t].map(([sn, m]) => [sn, new Map(m)]));
    say(`  EM iteration ${it}/${ITERS} — mean change ${(delta / (n || 1)).toExponential(2)}`);
}

rule('WHAT IT LEARNED — top English for a few Strong\'s numbers');
const nullM = t.get(NULLSN) || new Map();
const show = (sn, label) => {
    const m = t.get(sn);
    if (!m) { say(`  ${sn} ${label}: not seen in training`); return; }
    // Ranked by ratio-to-NULL, which is what the aligner actually decides on.
    const top = [...m.entries()]
        .filter(([, p]) => p >= MINP)
        // Smoothed against a floor rather than an epsilon: dividing by ~0 produced
        // x64588343, which says nothing except "the denominator was tiny".
        .map(([w, p]) => [w, p / Math.max(nullM.get(w) || 0, 1e-6)])
        .sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([w, r]) => `${w} ${r >= 1000 ? 'x1000+' : 'x' + r.toFixed(1)}`).join('  ');
    say(`  ${sn.padEnd(7)}${label.padEnd(14)}${top || '(nothing clears --min-prob)'}`);
};
say('  (xN = how many times more likely this word is here than corpus-wide)');
show('H3205', 'beget');   show('H1', 'father');    show('H1121', 'son');
show('H559', 'say');      show('H8085', 'hear');   show('H1697', 'word');
say('');
say('');
say('H3205 is the test: "became" / "father" scoring high means the model learned');
say('the idiom kjv_def cannot express. If instead you see OUR OWN transliterations');
say('(yalad, ab, ban, amar, shamai, dabar) near the top, it is training on rendered');
say('output rather than the original translation — check that text_src is populated.');
const contaminated = ['yalad', 'ab', 'ban', 'amar', 'shamai', 'dabar'].filter(w => {
    for (const sn of ['H3205', 'H1', 'H1121', 'H559', 'H8085', 'H1697']) {
        const m = t.get(sn); if (!m) continue;
        const top3 = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
        if (top3.includes(w)) return true;
    }
    return false;
});
if (contaminated.length) {
    say('');
    say(`  ⚠ CONTAMINATION DETECTED: ${contaminated.join(', ')} rank in the top 3.`);
    say('  The model is learning its own output. Do NOT --apply these links.');
}

// ── align the NT ────────────────────────────────────────────────────────────
const idx = new Database(IDX, { readonly: true });
const ntTok = new Map();
try {
    let skippedParticle = 0;
    for (const r of idx.prepare(`
        SELECT o.book_id, o.chapter, o.verse, o.token_ordinal, o.word_raw, t2.strongs, t2.pos, t2.components
        FROM surface_occurrences o
        JOIN token_surfaces t2 ON t2.word_raw = o.word_raw AND t2.source = o.source
             AND t2.strongs = o.strongs AND t2.pos = o.pos AND t2.morph = o.morph
        WHERE o.source='HEB' AND o.book_id BETWEEN 40 AND 66
        ORDER BY o.book_id, o.chapter, o.verse, o.token_ordinal`).all()) {
        if (!r.strongs) continue;
        // A bare conjunction or article must not own an English span. Left
        // unguarded, a lone 𐤅 was handed the word "became" and rendered as
        // "w (became)" — a one-letter transliteration standing in for a verb.
        // Prepositions are NOT excluded: "with him" -> H5973 is a correct span.
        if (r.pos === 'conj' || r.pos === 'art') { skippedParticle++; continue; }
        if (HEBREW_STOP.has(r.word_raw)) { skippedParticle++; continue; }
        let comps; try { comps = JSON.parse(r.components); } catch { comps = []; }
        const root = comps.find(c => c.css === 'root') || comps.find(c => c.translit);
        const tr = root && String(root.translit || '').trim();
        // A transliteration of one letter is a proclitic that slipped through with
        // some other tag; it carries no lexical content either way.
        if (!tr || tr.length < 2) { skippedParticle++; continue; }
        const k = `${r.book_id}|${r.chapter}|${r.verse}`;
        if (!ntTok.has(k)) ntTok.set(k, []);
        ntTok.get(k).push({ ord: r.token_ordinal, sn: 'H' + String(r.strongs).replace(/^H+/i, ''), tr });
    }
    if (skippedParticle) say(`  excluded ${skippedParticle.toLocaleString()} particle/one-letter tokens as link targets`);
} catch (e) { say(`could not read the HEB bake: ${e.message}`); }
idx.close();
say('');
say(`NT verses with Hebrew: ${ntTok.size.toLocaleString()}`);

const links = [];
let alignedTok = 0, totalTok = 0, spansMulti = 0;
for (const [k, toks] of ntTok) {
    const text = eng.get(k);
    if (!text) continue;
    const e = words(text);
    if (!e.length) continue;
    totalTok += toks.length;

    // best token per English word, NULL included so a word can align to nothing
    const assign = new Array(e.length).fill(null);
    const score = new Array(e.length).fill(0);
    for (let i = 0; i < e.length; i++) {
        if (ENGLISH_STOP.has(e[i])) continue;      // function words go to NULL, always
        const nullP = (t.get(NULLSN) && t.get(NULLSN).get(e[i])) || 0;
        let best = null, bestScore = 0;
        for (const tok of toks) {
            if ((support.get(tok.sn) || 0) < MINSUPPORT) continue;
            const p = (t.get(tok.sn) && t.get(tok.sn).get(e[i])) || 0;
            if (p < MINP) continue;
            const ratio = p / Math.max(nullP, 1e-6);
            if (ratio >= MINRATIO && ratio > bestScore) { bestScore = ratio; best = tok; }
        }
        if (best) { assign[i] = best; score[i] = bestScore; }
    }
    // When several English words claim the same token, keep the BEST-SCORING one,
    // not the leftmost. Keeping the leftmost is how "all the generations" glossed
    // as "dawarawath (all)" and left "generations" bare — dorot scores far higher
    // against "generations" than against "all", but "all" came first.
    {
        const bestFor = new Map();               // ordinal -> index
        for (let i = 0; i < e.length; i++) {
            if (!assign[i]) continue;
            const o = assign[i].ord;
            if (!bestFor.has(o) || score[i] > score[bestFor.get(o)]) bestFor.set(o, i);
        }
        const keep = new Set([...bestFor.values()]);
        for (let i = 0; i < e.length; i++) {
            // a neighbour continuing the same token stays, so multi-word spans survive
            if (assign[i] && !keep.has(i)) {
                const prevSame = i > 0 && assign[i - 1] && assign[i - 1].ord === assign[i].ord && (keep.has(i - 1) || assign[i - 1] === assign[i]);
                const nextSame = i + 1 < e.length && assign[i + 1] && assign[i + 1].ord === assign[i].ord;
                if (!prevSame && !nextSame) assign[i] = null;
            }
        }
    }
    // contiguous words sharing a token become ONE span — the "became the father
    // of" case, which is the entire reason for doing this
    let i = 0;
    const usedOrd = new Set();     // a token answers for ONE span per verse
    while (i < e.length) {
        if (!assign[i] || usedOrd.has(assign[i].ord)) { i++; continue; }
        let j = i;
        while (j + 1 < e.length && assign[j + 1] && assign[j + 1].ord === assign[i].ord) j++;
        const [b, c, v] = k.split('|').map(Number);
        links.push({ book_id: b, chapter: c, verse: v,
                     english_phrase: e.slice(i, j + 1).join(' '),
                     english_indices: JSON.stringify(Array.from({ length: j - i + 1 }, (_, n) => i + n)),
                     token_ordinals: JSON.stringify([assign[i].ord]),
                     sn: assign[i].sn });
        usedOrd.add(assign[i].ord);
        if (j > i) spansMulti++;
        alignedTok++;
        i = j + 1;
    }
}

rule('ALIGNMENT RESULT');
say(`Hebrew tokens in NT verses that also have English: ${totalTok.toLocaleString()}`);
say(`links generated                                  : ${links.length.toLocaleString()}`);
say(`  covering more than one English word            : ${spansMulti.toLocaleString()}`);
say(`tokens now aligned                               : ${alignedTok.toLocaleString()}` +
    ` (${(100 * alignedTok / (totalTok || 1)).toFixed(1)}%)`);

// ── where the unaligned tokens are ──────────────────────────────────────────
// 37% coverage needs breaking down before anyone reaches for a threshold. Some
// Hebrew tokens SHOULD have no English at all — 𐤀𐤕 (H853) marks a direct object
// and is not translated — so 100% is neither achievable nor desirable. Others
// are content words that failed to align, and those are the real shortfall.
{
    const unaligned = new Map();
    for (const [k, toks] of ntTok) {
        if (!eng.get(k)) continue;
        const used = new Set(links.filter(l => `${l.book_id}|${l.chapter}|${l.verse}` === k)
                                  .map(l => JSON.parse(l.token_ordinals)[0]));
        for (const tok of toks) if (!used.has(tok.ord))
            unaligned.set(tok.sn, (unaligned.get(tok.sn) || 0) + 1);
    }
    const ranked = [...unaligned.entries()].sort((a, b) => b[1] - a[1]);
    const totalUn = ranked.reduce((n, r) => n + r[1], 0);
    rule('WHERE THE UNALIGNED TOKENS ARE');
    say(`unaligned tokens: ${totalUn.toLocaleString()}`);
    say('');
    say('  count    strongs   best English the model knows for it');
    say('  ' + '-'.repeat(64));
    for (const [sn, n] of ranked.slice(0, 20)) {
        const m = t.get(sn);
        const top = m ? [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([w, p]) => `${w} ${p.toFixed(2)}`).join('  ') : '(never seen in the OT)';
        say('  ' + String(n).padEnd(9) + sn.padEnd(10) + top);
    }
    say('');
    say('Read this as three groups:');
    say('  • particles with no English counterpart (H853 direct-object marker, and');
    say('    the like) — correctly unaligned, and no threshold will change that');
    say('  • "(never seen in the OT)" — NT-only vocabulary; the model cannot align');
    say('    what it has no training example of');
    say('  • content words with a sensible top English — these are the real misses,');
    say('    and lowering --min-prob (currently ' + MINP + ') will pick them up');
}

rule(`REVIEW — first ${SAMPLE} multi-word spans`);
say('Read these before applying. A wrong span here becomes a wrong gloss everywhere.');
for (const l of links.filter(x => JSON.parse(x.english_indices).length > 1).slice(0, SAMPLE))
    say(`  ${l.book_id}:${l.chapter}:${l.verse}  ${l.sn.padEnd(7)} ord ${JSON.parse(l.token_ordinals)[0]}  "${l.english_phrase}"`);

if (!APPLY) {
    say('');
    say('[preview] nothing written. Re-run with --apply to insert into translation_links.');
} else if (!existsSync(LINKSDB)) {
    say(`\n--apply given but ${LINKSDB} not found. Pass --links <path>.`);
} else {
    const ldb = new Database(LINKSDB);
    ldb.exec(`CREATE TABLE IF NOT EXISTS translation_links(
        book_id INTEGER, chapter INTEGER, verse INTEGER, lang TEXT,
        english_phrase TEXT, english_indices TEXT NOT NULL DEFAULT '[]',
        token_ordinals TEXT, component_hint TEXT, color_index INTEGER, sort_order INTEGER)`);
    // Only ever removes rows this tool generated. Hand-authored links are marked
    // with a different lang and are left untouched.
    const del = ldb.prepare(`DELETE FROM translation_links WHERE lang='HEB-auto' AND book_id BETWEEN 40 AND 66`);
    const ins = ldb.prepare(`INSERT INTO translation_links
        (book_id, chapter, verse, lang, english_phrase, english_indices, token_ordinals, component_hint, color_index, sort_order)
        VALUES (?, ?, ?, 'HEB-auto', ?, ?, ?, ?, 0, ?)`);
    const removed = del.run().changes;
    ldb.transaction(() => {
        links.forEach((l, n) => ins.run(l.book_id, l.chapter, l.verse, l.english_phrase,
                                        l.english_indices, l.token_ordinals, l.sn, n));
    })();
    ldb.close();
    say('');
    say(`written to ${LINKSDB}: ${removed.toLocaleString()} previous auto rows replaced, ` +
        `${links.length.toLocaleString()} inserted (lang='HEB-auto').`);
    say('Hand-authored rows with a different lang were not touched.');
}

if (OUT) { writeFileSync(OUT, LINES.join('\n') + '\n'); console.log(`\n[written to ${OUT}]`); }
