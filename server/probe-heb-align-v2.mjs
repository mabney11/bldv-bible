#!/usr/bin/env node
/**
 * probe-heb-align.mjs  v2 — READ ONLY. Writes nothing but its report.
 *
 * v1 reported OT 68.8% / NT 64.8%. Those were FLOORS produced by three defects in
 * the probe, all visible in its own sample output. v2 fixes them:
 *
 *  1. SUFFIX RECONSTRUCTION.  BHS stores a pronominal suffix in the MORPH, not
 *     always in word_raw (server.js PRS_TAG is append-only for exactly this
 *     reason: Exod 13:21 𐤍𐤇𐤕 is prs=3mp with no 𐤌 on the surface). The HEB
 *     edition spells it. So 𐤋𐤌𐤉𐤍𐤅 = 𐤋 + 𐤌𐤉𐤍 + reconstructed 𐤅, and v1's exact
 *     equality rejected a perfectly aligned word. A run now also matches when the
 *     last token's morph reconstructs the missing tail. Same tables as the server.
 *
 *  2. NON-CASCADING RESYNC.  v1 advanced one token on failure, so a single miss
 *     threw the rest of the verse off by one (every Gen 1:11 sample was lagging
 *     exactly one word). v2 tries a small start window, and on a real miss
 *     resynchronises by finding where the NEXT HEB word matches instead of
 *     blindly stepping.
 *
 *  3. VERSIFICATION.  v1 keyed on verse number, so Psalms (BHS counts the
 *     superscription as v1) collapsed to 39.3%. v2 SEARCHES a small offset per
 *     chapter and reports which offset won — measured, not assumed.
 *
 *  Also: ambiguity is now keyed on STRONGS (the real homograph question) and
 *  reported separately from morph-level variation, which v1 conflated — it
 *  printed 𐤅𐤉𐤀𐤌𐤓 as ambiguous with H9000+H559 vs H9000+H559.
 *
 * USAGE
 *   node probe-heb-align.mjs --out heb-align-v2.txt
 *   node probe-heb-align.mjs --canon 19 --samples 25 --out psalms.txt
 *
 * FLAGS
 *   --db <path>     corpus.db (default ./corpus.db)
 *   --corpus <id>   unsegmented Hebrew corpus id (default HEB)
 *   --canon <n>     restrict to one canon_id
 *   --ot-max <n>    last OT canon_id (default 39)
 *   --nt-min/--nt-max   NT range (default 40 / 66)
 *   --offsets <l>   comma list of chapter offsets to try (default 0,1,-1)
 *   --window <n>    token start-window for resync (default 3)
 *   --maxrun <n>    max BHS tokens in one HEB word (default 6)
 *   --samples <n>   sample rows per section (default 12)
 *   --out <file>    write the report here (never use shell redirection: winpty
 *                   replaces the file with "stdout is not a tty")
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const DB_PATH = arg('db', './corpus.db');
const CORPUS  = arg('corpus', 'HEB');
const ONLY    = arg('canon') ? parseInt(arg('canon'), 10) : null;
const OT_MAX  = parseInt(arg('ot-max', '39'), 10);
const NT_MIN  = parseInt(arg('nt-min', '40'), 10);
const NT_MAX  = parseInt(arg('nt-max', '66'), 10);
const OFFSETS = arg('offsets', '0,1,-1').split(',').map(s => parseInt(s, 10));
const WINDOW  = parseInt(arg('window', '3'), 10);
const MAXRUN  = parseInt(arg('maxrun', '6'), 10);
const SAMPLES = parseInt(arg('samples', '12'), 10);
const OUT     = arg('out');

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

// ── script + orthography normalisation ──────────────────────────────────────
const SQUARE_TO_PALEO = {
    'א':'𐤀','ב':'𐤁','ג':'𐤂','ד':'𐤃','ה':'𐤄','ו':'𐤅','ז':'𐤆','ח':'𐤇','ט':'𐤈',
    'י':'𐤉','כ':'𐤊','ך':'𐤊','ל':'𐤋','מ':'𐤌','ם':'𐤌','נ':'𐤍','ן':'𐤍','ס':'𐤎',
    'ע':'𐤏','פ':'𐤐','ף':'𐤐','צ':'𐤑','ץ':'𐤑','ק':'𐤒','ר':'𐤓','ש':'𐤔','ת':'𐤕',
};
function toPaleo(s) {
    if (!s) return '';
    let out = '';
    for (const ch of s) {
        if (ch >= '\u{10900}' && ch <= '\u{10915}') out += ch;
        else if (SQUARE_TO_PALEO[ch]) out += SQUARE_TO_PALEO[ch];
    }
    return out;
}
/** Plene/defective tolerance. collapseMatres only folds DOUBLED matres, which is
 *  what parseHebrewData needs for lexicon keys — it does NOT catch a single extra
 *  vowel letter across editions (𐤉𐤓𐤅𐤔𐤋𐤉𐤌 plene vs 𐤉𐤓𐤅𐤔𐤋𐤌 defective). matresKey
 *  drops every 𐤉/𐤅 so those compare equal. It is deliberately fenced: at least 3
 *  remaining consonants, a shared first letter, and at most 2 letters of
 *  difference — without those, short particles collide freely. Every match this
 *  tier makes is counted separately so its size is always visible. */
const collapseMatres = s => (s || '').replace(/𐤉𐤉+/g, '𐤉').replace(/𐤅𐤅+/g, '𐤅');
const matresKey = s => (s || '').replace(/[𐤉𐤅]/g, '');
function matresEquivalent(a, b) {
    if (!a || !b) return false;
    if (a[0] !== b[0]) return false;
    if (Math.abs([...a].length - [...b].length) > 2) return false;
    const ka = matresKey(a), kb = matresKey(b);
    return ka === kb && [...ka].length >= 3;
}
function words(text) {
    if (!text) return [];
    return String(text).replace(/\u05BE/g, ' ').split(/\s+/).map(toPaleo).filter(Boolean);
}

// ── morph-encoded tails (copied from server.js — same tables, same codes) ───
// PRS_TAG: the suffix consonant a pronominal-suffix tag implies.
const PRS_PALEO = {
    '1cs':'𐤉', '1cp':'𐤍𐤅', '2ms':'𐤊', '2fs':'𐤊', '2mp':'𐤊𐤌', '2fp':'𐤊𐤍',
    '3ms':'𐤅', '3fs':'𐤄', '3mp':'𐤌', '3fp':'𐤍',
};
// GRAMMAR_MAP nme/vbe/uvf: endings whose surface letters may also be absent.
const NME_PALEO = { 'H':['𐤄'],'T':['𐤕'],'J':['𐤉'],'JM':['𐤉𐤌','𐤌'],'WT':['𐤅𐤕','𐤕'],'WTJ':['𐤅𐤕𐤉','𐤕𐤉'],'NH':['𐤍𐤄'] };
const VBE_PALEO = { 'TJ':['𐤕𐤉'],'NW':['𐤍𐤅'],'T':['𐤕'],'TM':['𐤕𐤌'],'TN':['𐤕𐤍'],'W':['𐤅'],'WN':['𐤅𐤍'],'NH':['𐤍𐤄'],'H':['𐤕𐤄','𐤄'],'J':['𐤉'] };
const UVF_PALEO = { 'H':['𐤄'],'J':['𐤉'],'N':['𐤍'] };

function morphAttrs(morph) {
    const out = {};
    for (const seg of String(morph || '').split('|')) {
        const eq = seg.indexOf('=');
        if (eq < 1) continue;
        const k = seg.slice(0, eq).trim(), v = seg.slice(eq + 1).trim();
        if (!k || !v || v === 'absent' || v === 'none') continue;
        out[k] = v.replace(/=+$/, '');
    }
    return out;
}
/** Tails the LAST token's morph could legitimately add to the surface. */
function reconstructableTails(tok) {
    const a = morphAttrs(tok.morph);
    const tails = new Set(['']);
    const add = (s) => { for (const t of [...tails]) tails.add(t + s); };
    if (a.nme && NME_PALEO[a.nme]) for (const p of NME_PALEO[a.nme]) add(p);
    if (a.vbe && VBE_PALEO[a.vbe]) for (const p of VBE_PALEO[a.vbe]) add(p);
    if (a.uvf && UVF_PALEO[a.uvf]) for (const p of UVF_PALEO[a.uvf]) add(p);
    if (a.prs && PRS_PALEO[a.prs]) {
        // the 3ms/3mp forms are also written with a linking he in the OT
        const bare = PRS_PALEO[a.prs];
        for (const t of [...tails]) { tails.add(t + bare); tails.add(t + '𐤄' + bare); }
    }
    tails.delete('');
    return [...tails];
}

// ── open ────────────────────────────────────────────────────────────────────
let db;
try { db = new Database(DB_PATH, { readonly: true }); }
catch (e) { console.error(`cannot open ${DB_PATH}: ${e.message}`); process.exit(1); }
const hasTable = (t) => { try { db.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get(); return true; } catch { return false; } };
if (!hasTable('verses') || !hasTable('tokens_bhs')) { console.error('need verses + tokens_bhs'); process.exit(1); }

say('probe-heb-align v2 — suffix-tolerant, non-cascading, offset-searching');
say(`db=${DB_PATH} corpus=${CORPUS} offsets=${OFFSETS.join(',')} window=${WINDOW} maxrun=${MAXRUN}`);
say(`OT canon 1-${OT_MAX} · NT canon ${NT_MIN}-${NT_MAX}` + (ONLY ? ` · restricted to canon ${ONLY}` : ''));

const verseCols = db.prepare(`PRAGMA table_info(verses)`).all().map(r => r.name);
const hasPaleoCol = verseCols.includes('text_paleo');
const VERSES = db.prepare(`
    SELECT canon_id, ord_c AS chapter, ord_v AS verse, text ${hasPaleoCol ? ', text_paleo' : ''}
    FROM verses WHERE corpus = ? AND canon_id BETWEEN ? AND ?
      AND ord_c IS NOT NULL AND ord_v IS NOT NULL
    ORDER BY canon_id, ord_c, ord_v
`);
const verseWords = (row) => {
    const a = hasPaleoCol ? words(row.text_paleo) : [];
    return a.length ? a : words(row.text);
};
const BHS_VERSE = db.prepare(`
    SELECT token_ordinal, word_raw, lemma, root, pos, morph, strongs
    FROM tokens_bhs WHERE book_id = ? AND chapter = ? AND verse = ? ORDER BY token_ordinal
`);
const tokCache = new Map();
function bhsTokens(canon, ch, v) {
    const k = `${canon}|${ch}|${v}`;
    if (!tokCache.has(k)) {
        tokCache.set(k, BHS_VERSE.all(canon, ch, v)
            .map(t => ({ ...t, paleo: toPaleo(t.word_raw) })).filter(t => t.paleo));
    }
    return tokCache.get(k);
}

// ── core: try to match HEB word `w` against a run of tokens starting at `s` ──
// Tiers, strongest first. Returns {ok, tier, end, run} — never mutates.
function matchAt(tk, s, w) {
    let acc = '', run = [];
    for (let j = s; j < tk.length && run.length < MAXRUN; j++) {
        acc += tk[j].paleo; run.push(tk[j]);
        if (acc === w) return { ok: true, tier: 'exact', end: j + 1, run: [...run] };
        // the morph of the LAST token may supply letters the surface omits
        for (const tail of reconstructableTails(run[run.length - 1])) {
            if (acc + tail === w) return { ok: true, tier: 'suffix', end: j + 1, run: [...run] };
        }
        if (matresEquivalent(acc, w))
            return { ok: true, tier: 'matres', end: j + 1, run: [...run] };
        if (acc.length > w.length + 3) break;   // overrun — no point continuing
    }
    return { ok: false };
}

/** Align one verse. Returns per-word results; resyncs without cascading. */
function alignVerse(hw, tk) {
    const res = [];
    let ti = 0;
    for (let i = 0; i < hw.length; i++) {
        const w = hw[i];
        let hit = null;
        for (let s = ti; s <= Math.min(ti + WINDOW, tk.length - 1); s++) {
            const m = matchAt(tk, s, w);
            if (m.ok) { hit = { ...m, start: s }; break; }
        }
        if (hit) { res.push({ word: w, ...hit }); ti = hit.end; continue; }
        // MISS. Resync on the NEXT word rather than stepping blindly, so one
        // disagreement cannot throw the remainder of the verse off by one.
        let resync = null;
        if (i + 1 < hw.length) {
            for (let s = ti; s <= Math.min(ti + WINDOW + 2, tk.length - 1); s++) {
                const m = matchAt(tk, s, hw[i + 1]);
                if (m.ok) { resync = s; break; }
            }
        }
        res.push({ word: w, ok: false, tier: 'miss', start: ti,
                   bhs_here: tk[ti] ? tk[ti].paleo : '(end)' });
        if (resync !== null) ti = resync;
    }
    return res;
}

// ── A) OT ALIGNMENT with per-chapter offset search ──────────────────────────
rule('A) OT ALIGNMENT — suffix-tolerant runs, per-chapter offset search');

const otRows = VERSES.all(CORPUS, ONLY ?? 1, ONLY ?? OT_MAX);
say(`HEB verses in the OT range: ${otRows.length}`);

const byChapter = new Map();
for (const r of otRows) {
    const k = `${r.canon_id}|${r.chapter}`;
    if (!byChapter.has(k)) byChapter.set(k, []);
    byChapter.get(k).push(r);
}

const FORMS = new Map();              // heb surface -> Map(strongsSig -> {count, morphSigs:Set, morphemes})
const perBook = new Map();
const offsetUsed = new Map();         // canon -> Map(offset -> chapters)
const missSamples = [];
let wTotal = 0, tierCount = { exact: 0, suffix: 0, matres: 0, miss: 0 }, vNoBhs = 0;

const bookRow = (c) => {
    if (!perBook.has(c)) perBook.set(c, { canon: c, words: 0, aligned: 0, suffix: 0, matres: 0, multi: 0 });
    return perBook.get(c);
};

for (const [key, verses] of byChapter) {
    const canon = verses[0].canon_id;
    // pick the offset that aligns the most words in this chapter — measured
    let best = null;
    for (const d of OFFSETS) {
        let ok = 0, tot = 0;
        for (const row of verses) {
            const tk = bhsTokens(canon, row.chapter, row.verse + d);
            if (!tk.length) continue;
            const hw = verseWords(row);
            tot += hw.length;
            for (const r of alignVerse(hw, tk)) if (r.ok) ok++;
        }
        if (!best || ok > best.ok) best = { d, ok, tot };
    }
    const d = best ? best.d : 0;
    if (!offsetUsed.has(canon)) offsetUsed.set(canon, new Map());
    offsetUsed.get(canon).set(d, (offsetUsed.get(canon).get(d) || 0) + 1);

    // commit the winning offset
    for (const row of verses) {
        const tk = bhsTokens(canon, row.chapter, row.verse + d);
        const hw = verseWords(row);
        if (!tk.length) { vNoBhs++; wTotal += hw.length; tierCount.miss += hw.length;
                          bookRow(canon).words += hw.length; continue; }
        for (const r of alignVerse(hw, tk)) {
            wTotal++; tierCount[r.tier]++; bookRow(canon).words++;
            if (!r.ok) {
                if (missSamples.length < 400) missSamples.push({
                    canon, ref: `${row.chapter}:${row.verse}`, heb_word: r.word,
                    bhs_here: r.bhs_here, note: r.word.startsWith(r.bhs_here) ? 'prefix-of-heb' : '',
                });
                continue;
            }
            const b = bookRow(canon);
            b.aligned++;
            if (r.tier === 'suffix') b.suffix++;
            if (r.tier === 'matres') b.matres++;
            if (r.run.length > 1) b.multi++;
            const morphemes = r.run.map(t => ({
                paleo: t.paleo, pos: t.pos || '', morph: t.morph || '',
                strongs: t.strongs || '', lemma: t.lemma || '', root: t.root || '',
            }));
            const snSig = morphemes.map(m => m.strongs || '-').join('+');
            const mSig  = morphemes.map(m => `${m.pos}/${m.morph}`).join('+');
            if (!FORMS.has(r.word)) FORMS.set(r.word, new Map());
            const bucket = FORMS.get(r.word);
            if (!bucket.has(snSig)) bucket.set(snSig, { count: 0, morphSigs: new Set(), morphemes });
            const e = bucket.get(snSig); e.count++; e.morphSigs.add(mSig);
        }
    }
}

const aligned = tierCount.exact + tierCount.suffix + tierCount.matres;
say('');
say(`HEB words examined        : ${wTotal}`);
say(`  ALIGNED                 : ${aligned}  (${pct(aligned, wTotal)})`);
say(`    exact run             : ${tierCount.exact}  (${pct(tierCount.exact, aligned)})`);
say(`    + morph-reconstructed : ${tierCount.suffix}  (${pct(tierCount.suffix, aligned)})   ← v1 threw these away`);
say(`    + plene/defective     : ${tierCount.matres}  (${pct(tierCount.matres, aligned)})`);
say(`  unaligned               : ${tierCount.miss}  (${pct(tierCount.miss, wTotal)})`);
say(`  verses with no BHS      : ${vNoBhs}`);
say(`distinct HEB word forms   : ${FORMS.size}`);
say('');
say('v1 for comparison: 68.8% aligned, and its misses cascaded a word at a time.');

say('');
say('Per book (worst first):');
table([...perBook.values()].map(b => ({
        canon: b.canon, words: b.words, aligned: b.aligned, rate: pct(b.aligned, b.words),
        suffix: b.suffix, matres: b.matres, multi: b.multi,
        offset: [...(offsetUsed.get(b.canon) || new Map()).entries()]
                    .sort((x, y) => y[1] - x[1]).map(([d, n]) => `${d}:${n}ch`).join(' '),
    })).sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate)).slice(0, 25),
    ['canon', 'words', 'aligned', 'rate', 'suffix', 'matres', 'multi', 'offset']);

say('');
say('Remaining unaligned samples:');
table(missSamples.slice(0, SAMPLES), ['canon', 'ref', 'heb_word', 'bhs_here', 'note']);

// ── A2) ambiguity, keyed on STRONGS ─────────────────────────────────────────
rule('A2) FORM AMBIGUITY — keyed on STRONGS (v1 conflated this with morph variation)');
const ambiguous = [];
let occTotal = 0, occDominant = 0, formsMorphOnly = 0;
for (const [form, bucket] of FORMS) {
    const sigs = [...bucket.entries()].sort((a, b) => b[1].count - a[1].count);
    const total = sigs.reduce((s, x) => s + x[1].count, 0);
    occTotal += total; occDominant += sigs[0][1].count;
    if (sigs.length > 1) {
        ambiguous.push({ form, readings: sigs.length, occurrences: total,
            dominant: pct(sigs[0][1].count, total), top: sigs[0][0], alt: sigs[1][0] });
    } else if (sigs[0][1].morphSigs.size > 1) formsMorphOnly++;
}
say(`forms with >1 STRONGS reading  : ${ambiguous.length}  (${pct(ambiguous.length, FORMS.size)} of forms)`);
say(`forms varying only in MORPH    : ${formsMorphOnly}  (${pct(formsMorphOnly, FORMS.size)})  ← not homographs`);
say(`dominant-reading coverage      : ${pct(occDominant, occTotal)}`);
say('');
table(ambiguous.sort((a, b) => b.occurrences - a.occurrences).slice(0, SAMPLES),
      ['form', 'readings', 'occurrences', 'dominant', 'top', 'alt']);

// ── B) NT COVERAGE ──────────────────────────────────────────────────────────
rule('B) NT COVERAGE — NT words present as OT-attested whole-word forms');
// Index OT forms by mater skeleton so a plene NT spelling can reach a defective
// OT one (𐤉𐤓𐤅𐤔𐤋𐤉𐤌 -> 𐤉𐤓𐤅𐤔𐤋𐤌). Same fences as matresEquivalent.
const MATRES_INDEX = new Map();
for (const f of FORMS.keys()) {
    const k = matresKey(f);
    if ([...k].length < 3) continue;
    if (!MATRES_INDEX.has(k)) MATRES_INDEX.set(k, f);
}
const matresLookup = (w) => {
    const f = MATRES_INDEX.get(matresKey(w));
    return f && matresEquivalent(f, w) ? f : undefined;
};

const ntRows = ONLY && ONLY <= OT_MAX ? [] : VERSES.all(CORPUS, ONLY ?? NT_MIN, ONLY ?? NT_MAX);
const missCount = new Map();
const ntBook = new Map();
let ntWords = 0, ntExact = 0, ntMatres = 0, ntUnambig = 0, ntMulti = 0;

for (const row of ntRows) {
    for (const w of verseWords(row)) {
        ntWords++;
        if (!ntBook.has(row.canon_id)) ntBook.set(row.canon_id, { canon: row.canon_id, words: 0, hit: 0 });
        const b = ntBook.get(row.canon_id); b.words++;
        let form = FORMS.has(w) ? w : matresLookup(w);
        if (!form) { missCount.set(w, (missCount.get(w) || 0) + 1); continue; }
        if (form === w) ntExact++; else ntMatres++;
        b.hit++;
        const bucket = FORMS.get(form);
        if (bucket.size === 1) ntUnambig++;
        const best = [...bucket.values()].sort((a, b2) => b2.count - a.count)[0];
        if (best.morphemes.length > 1) ntMulti++;
    }
}
const ntHit = ntExact + ntMatres;
say(`NT words examined                 : ${ntWords}`);
say(`  FULLY QUALIFIABLE from OT forms : ${ntHit}  (${pct(ntHit, ntWords)})`);
say(`    exact form                    : ${ntExact}  (${pct(ntExact, ntHit)})`);
say(`    via plene/defective collapse  : ${ntMatres}  (${pct(ntMatres, ntHit)})`);
say(`    single STRONGS reading        : ${ntUnambig}  (${pct(ntUnambig, ntHit)})`);
say(`    multi-morpheme                : ${ntMulti}  (${pct(ntMulti, ntHit)})`);
say(`  not in the OT form table        : ${ntWords - ntHit}  (${pct(ntWords - ntHit, ntWords)})`);
say(`distinct unresolved NT forms      : ${missCount.size}`);
say('');
say('v1 for comparison: 64.8%, with suffixed particles (𐤋𐤊𐤌 𐤀𐤋𐤉𐤄𐤌 𐤋𐤄𐤌 𐤀𐤕𐤊𐤌) in the miss list.');

say('');
say('Per NT book (worst first):');
table([...ntBook.values()].map(b => ({ canon: b.canon, words: b.words, hit: b.hit, rate: pct(b.hit, b.words) }))
        .sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate)), ['canon', 'words', 'hit', 'rate']);

say('');
say('Most frequent unresolved NT forms — this list should now be NT-only vocabulary:');
table([...missCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, SAMPLES * 2)
        .map(([form, n]) => ({ form, occurrences: n })), ['form', 'occurrences']);

if (OUT) { writeFileSync(OUT, LINES.join('\n') + '\n'); console.log(`\n[report written to ${OUT}]`); }
db.close();
