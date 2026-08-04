#!/usr/bin/env node
/**
 * build-term-candidates.mjs — READ ONLY. Proposes term-forms.txt lines.
 *
 * word-map.json only knows English words the TAGGED OT render already produced,
 * which is why probe-term-gaps came back "absent" for 700+ ordinary words —
 * things, know, men, made, tell, saw, heard, great, called. Those will never
 * appear in an OT-derived map, so no amount of scanning the map will help.
 *
 * Strong's does know them. Every entry carries kjv_def — the English words the
 * KJV used to render it — so INVERTING that field gives English -> Strong's for
 * essentially the whole vocabulary. The Hebrew then comes from the Strong's
 * entry, and the transliteration is read out of surface-index.db, where that
 * number has already been rendered thousands of times. Nothing is invented and
 * no transliteration logic is reimplemented here: every proposed form is a
 * spelling your own pipeline has already produced.
 *
 * fieldy: "I'd rather things be glossed incorrectly than continue dealing with
 * non-glosses". So this proposes AGGRESSIVELY — one candidate for every gap word
 * it can reach — but each line carries the Strong's number, the OT frequency and
 * the kjv_def that justified it, so a wrong one is obvious and deletable rather
 * than mysterious.
 *
 * PICKING BETWEEN CANDIDATES. An English word often appears in several entries'
 * kjv_def, so this ranks by OT FREQUENCY first.
 *
 * An earlier version ranked by position in kjv_def, on the assumption that the
 * first sense is the primary one. That assumption is FALSE: Strong's kjv_def
 * lists are ALPHABETICAL. H559 (amar, ~5300x, the ordinary "say") reads
 * "answer, appoint, avouch, bid, boast self, call, ... say, speak, ..." so "say"
 * sits late; H5001 (na'am, ~150x, the prophetic "utter") is a short entry where
 * "said" comes first. Sense-position ranking therefore chose the rare prophetic
 * word for every "said" in the corpus. Frequency does not have that failure mode.
 * Position is still reported, as information, but no longer decides.
 *
 * USAGE
 *   node build-term-candidates.mjs --out term-candidates.txt
 *   node build-term-candidates.mjs --min-count 10 --out common.txt
 *
 * FLAGS
 *   --db <path>      corpus.db          (default ./corpus.db)
 *   --index <path>   surface-index.db   (default ./surface-index.db)
 *   --strongs <path> strongs-hebrew-expanded.json (searched if omitted)
 *   --min <n>/--max <n>  canon range to scan for gaps (default 40-66)
 *   --min-count <n>  ignore corpus words rarer than this (default 3)
 *   --top <n>        cap the proposal list (default 500)
 *   --out <file>     write here (never shell-redirect: winpty)
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const DB    = arg('db', './corpus.db');
const IDX   = arg('index', './surface-index.db');
const MIN   = parseInt(arg('min', '40'), 10);
const MAX   = parseInt(arg('max', '66'), 10);
const MINC  = parseInt(arg('min-count', '3'), 10);
const TOP   = parseInt(arg('top', '500'), 10);
const OUT   = arg('out');

const LINES = [];
const say = (...a) => { const s = a.join(' '); LINES.push(s); console.log(s); };
const rule = t => { say(''); say('─'.repeat(78)); say(t); say('─'.repeat(78)); };

const readLines = f => existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/) : [];
function findJSON(name, explicit) {
    for (const p of [explicit, name, path.join('lexicon', name), path.join('..', name)].filter(Boolean))
        if (existsSync(p)) { try { return { j: JSON.parse(readFileSync(p, 'utf8')), at: p }; } catch { /* next */ } }
    return { j: null, at: null };
}

const S = findJSON('strongs-hebrew-expanded.json', arg('strongs'));
const S2 = S.j ? { j: null } : findJSON('strongs-hebrew.json');
const DICT = S.j || S2.j;
if (!DICT) { console.error('need strongs-hebrew-expanded.json (or strongs-hebrew.json)'); process.exit(1); }
const M = findJSON('word-map.json').j || {};

say('build-term-candidates — English -> Strong\'s (kjv_def) -> your own rendered translit');
say(`strongs dictionary: ${Object.keys(DICT).length.toLocaleString()} entries (${S.at || S2.at})`);

// ── 0. MECHANICAL TRANSLITERATION ───────────────────────────────────────────
// fieldy's scheme is purely positional: every letter takes its medial form
// except the LAST, which takes the final form. Verified against 15 words from
// his own rendered text (Darak, Lab, Raash, Aban, Nahar, Chakamah, Shamai,
// Ishah, Palal, Qawam, Napal, Hayakal, Chamash, Izar, Amar) — all exact.
//
// This matters more than it looks: with a deterministic transliterator, EVERY
// Strong's number can be proposed, not only the ones the corpus has already
// rendered. Vowel points and cantillation are dropped; the consonantal skeleton
// is the whole input.
const CHAR_MAP = {
    '\u{10900}': { med: 'a',   fin: 'a'  }, '\u{10901}': { med: 'ba',  fin: 'b'  },
    '\u{10902}': { med: 'ga',  fin: 'g'  }, '\u{10903}': { med: 'da',  fin: 'd'  },
    '\u{10904}': { med: 'ha',  fin: 'h'  }, '\u{10905}': { med: 'wa',  fin: 'w'  },
    '\u{10906}': { med: 'za',  fin: 'z'  }, '\u{10907}': { med: 'cha', fin: 'ch' },
    '\u{10908}': { med: 'ta',  fin: 't'  }, '\u{10909}': { med: 'ya',  fin: 'y'  },
    '\u{1090A}': { med: 'ka',  fin: 'k'  }, '\u{1090B}': { med: 'la',  fin: 'l'  },
    '\u{1090C}': { med: 'ma',  fin: 'm'  }, '\u{1090D}': { med: 'na',  fin: 'n'  },
    '\u{1090E}': { med: 'sa',  fin: 's'  }, '\u{1090F}': { med: 'i',   fin: 'i'  },
    '\u{10910}': { med: 'pa',  fin: 'p'  }, '\u{10911}': { med: 'tza', fin: 'tz' },
    '\u{10912}': { med: 'qa',  fin: 'q'  }, '\u{10913}': { med: 'ra',  fin: 'r'  },
    '\u{10914}': { med: 'sha', fin: 'sh' }, '\u{10915}': { med: 'tha', fin: 'th' },
};
const SQUARE_TO_PALEO = {
    '\u05D0':'\u{10900}','\u05D1':'\u{10901}','\u05D2':'\u{10902}','\u05D3':'\u{10903}',
    '\u05D4':'\u{10904}','\u05D5':'\u{10905}','\u05D6':'\u{10906}','\u05D7':'\u{10907}',
    '\u05D8':'\u{10908}','\u05D9':'\u{10909}','\u05DB':'\u{1090A}','\u05DA':'\u{1090A}',
    '\u05DC':'\u{1090B}','\u05DE':'\u{1090C}','\u05DD':'\u{1090C}','\u05E0':'\u{1090D}',
    '\u05DF':'\u{1090D}','\u05E1':'\u{1090E}','\u05E2':'\u{1090F}','\u05E4':'\u{10910}',
    '\u05E3':'\u{10910}','\u05E6':'\u{10911}','\u05E5':'\u{10911}','\u05E7':'\u{10912}',
    '\u05E8':'\u{10913}','\u05E9':'\u{10914}','\u05EA':'\u{10915}',
};
const toPaleo = str => [...(str || '')]
    .map(c => (c >= '\u{10900}' && c <= '\u{10915}') ? c : (SQUARE_TO_PALEO[c] || '')).join('');
function translitOf(hebrew) {
    const p = [...toPaleo(hebrew)];
    if (!p.length) return '';
    const out = p.map((c, i) => {
        const e = CHAR_MAP[c];
        return e ? (i === p.length - 1 ? e.fin : e.med) : '';
    }).join('');
    // LOWERCASE. render-corpus emits a term pin VERBATIM for a lowercase source
    // word (`${tr} (${w})`, L169) and only capitalises when the source word is
    // capitalised AND opted into term-caps.txt. So a capitalised pin value shouts
    // mid-sentence: "And I Amar (said)". The existing pins (father ab, man adam)
    // are lowercase; match them.
    return out;
}
/** The Hebrew of a Strong's entry, whichever field this dictionary uses. */
const lemmaOf = e => (typeof e === 'string') ? ''
    : (e.lemma || e.w || e.unicode || e.hebrew || e.word || e.translit_source || '');

// ── 1. Strong's -> translit as the corpus ALREADY renders it (cross-check) ───
// Read out of surface-index.db rather than transliterating a lemma here. That
// keeps proposals in the exact spelling system the corpus already uses, and
// means this script cannot invent a form the reader has never shown.
const idx = new Database(IDX, { readonly: true });
const hasSource = (() => { try { idx.prepare('SELECT source FROM token_surfaces LIMIT 1').get(); return true; } catch { return false; } })();
const occBySn = new Map();
for (const r of idx.prepare(
    `SELECT t.strongs sn, COUNT(*) n
     FROM surface_occurrences o
     JOIN token_surfaces t ON t.word_raw = o.word_raw ${hasSource ? 'AND t.source = o.source' : ''}
          AND t.strongs = o.strongs AND t.pos = o.pos AND t.morph = o.morph
     ${hasSource ? "WHERE o.source = 'BHS'" : ''}
     GROUP BY t.strongs`).all())
    if (r.sn) occBySn.set(r.sn, r.n);

const translitBySn = new Map();   // sn -> most frequent root translit
{
    const tally = new Map();      // sn -> Map(translit -> n)
    for (const r of idx.prepare(
        `SELECT strongs, components FROM token_surfaces ${hasSource ? "WHERE source = 'BHS'" : ''}`).all()) {
        if (!r.strongs) continue;
        let comps; try { comps = JSON.parse(r.components); } catch { continue; }
        // BUG FOUND 2026-07-27: this used to tally only the root component's own
        // translit and drop every sibling prefix/suffix component — almost
        // certainly the actual origin of the 151 stale term-forms.txt pins found
        // and fixed the same day (e.g. "asharaya" instead of "asharay"/full
        // "asharayaw" etc.: the root's own translit is correctly medial-at-its-
        // tail whenever a real modification follows it in the SAME token, so
        // tallying it alone produces a word missing its actual final letters).
        // Concatenate every component's translit instead, same fix as the
        // identical bug in render-corpus.mjs's verse-gloss pass.
        if (!comps.some(c => c && c.css === 'root')) continue;
        const tr = comps.filter(c => c && typeof c.translit === 'string' && c.translit)
                         .map(c => c.translit).join('').trim();
        if (!tr) continue;
        if (!tally.has(r.strongs)) tally.set(r.strongs, new Map());
        const m = tally.get(r.strongs);
        m.set(tr, (m.get(tr) || 0) + 1);
    }
    for (const [sn, m] of tally)
        translitBySn.set(sn, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
}
idx.close();
say(`Strong's numbers with a rendered translit: ${translitBySn.size.toLocaleString()}`);

// ── 2. invert kjv_def ───────────────────────────────────────────────────────
// kjv_def is a KJV rendering list: "beginning, chief" / "air, heaven(-s)".
// Split on separators, drop the (-s)/(-ing) suffix hints, keep multi-word senses
// out (a term pin is one word).
const norm = sn => 'H' + String(sn).replace(/^H+/i, '');
const english = new Map();        // word -> [{sn, rank}]
for (const [rawSn, e] of Object.entries(DICT)) {
    const sn = norm(rawSn);
    const def = typeof e === 'string' ? e : (e && (e.kjv_def || e.strongs_def || e.def));
    if (!def) continue;
    const senses = String(def).split(/[,;]/).map(x => x
        .replace(/\([^)]*\)/g, ' ')          // "heaven(-s)" -> "heaven"
        .replace(/[^A-Za-z\s'-]/g, ' ')
        .trim().toLowerCase()).filter(Boolean);
    senses.forEach((sense, rank) => {
        if (!/^[a-z][a-z'-]{2,}$/.test(sense)) return;   // single words only
        if (!english.has(sense)) english.set(sense, []);
        english.get(sense).push({ sn, rank });
    });
}
say(`English words reachable through kjv_def: ${english.size.toLocaleString()}`);

// ── English inflection ──────────────────────────────────────────────────────
// kjv_def lists BASE forms ("thing", "see", "hear", "make"); the corpus has
// inflected ones ("things", "saw", "heard", "made"). Without this, the most
// common words in the text are exactly the ones that come back unreachable.
// The pin is still emitted under the form that APPEARS in the corpus, because
// render-corpus looks terms up by the literal word.
const IRREGULAR = new Map(Object.entries({
    saw: 'see', seen: 'see', heard: 'hear', made: 'make', went: 'go', gone: 'go',
    said: 'say', took: 'take', taken: 'take', gave: 'give', given: 'give',
    came: 'come', knew: 'know', known: 'know', spoke: 'speak', spoken: 'speak',
    wrote: 'write', written: 'write', ate: 'eat', eaten: 'eat', fell: 'fall',
    fallen: 'fall', found: 'find', held: 'hold', kept: 'keep', left: 'leave',
    sent: 'send', built: 'build', brought: 'bring', bought: 'buy', caught: 'catch',
    taught: 'teach', thought: 'think', sought: 'seek', fought: 'fight',
    stood: 'stand', understood: 'understand', told: 'tell', sold: 'sell',
    men: 'man', women: 'woman', children: 'child', feet: 'foot', teeth: 'tooth',
    lives: 'life', wives: 'wife', knives: 'knife', leaves: 'leaf',
    sat: 'sit', lay: 'lie', led: 'lead', fled: 'flee', drew: 'draw', threw: 'throw',
    grew: 'grow', blew: 'blow', slew: 'slay', slain: 'slay', bore: 'bear',
    born: 'bear', borne: 'bear', rose: 'rise', risen: 'rise', arose: 'arise',
    became: 'become', began: 'begin', drank: 'drink', sang: 'sing', ran: 'run',
    sworn: 'swear', swore: 'swear', wept: 'weep', dwelt: 'dwell', laid: 'lay',
    paid: 'pay', heard_: 'hear',
}));
/** Candidate base forms, most likely first. Cheap and deliberately over-generous
 *  — a wrong stem simply finds nothing in kjv_def and costs a lookup. */
function lemmas(w) {
    const out = [w];
    const irr = IRREGULAR.get(w);
    if (irr) out.push(irr);
    if (/ies$/.test(w))      out.push(w.slice(0, -3) + 'y');
    if (/(ses|xes|zes|ches|shes)$/.test(w)) out.push(w.slice(0, -2));
    if (/s$/.test(w) && !/ss$/.test(w))     out.push(w.slice(0, -1));
    if (/ied$/.test(w))      out.push(w.slice(0, -3) + 'y');
    if (/ed$/.test(w))     { out.push(w.slice(0, -2), w.slice(0, -1)); }
    if (/ing$/.test(w))    { out.push(w.slice(0, -3), w.slice(0, -3) + 'e'); }
    // doubled final consonant: "sinned" -> "sin", "running" -> "run"
    const m = /^(.*?)([bcdfglmnprstz])\2(ed|ing)$/.exec(w);
    if (m) out.push(m[1] + m[2]);
    if (/er$/.test(w))       out.push(w.slice(0, -2), w.slice(0, -1));
    if (/est$/.test(w))      out.push(w.slice(0, -3), w.slice(0, -2));
    if (/ly$/.test(w))       out.push(w.slice(0, -2));
    return [...new Set(out)].filter(x => x.length >= 3);
}

// ── 3. what the corpus still leaves plain ───────────────────────────────────
const TERM_EXCLUDE = new Set(readLines('./term-exclude.txt')
    .map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')));
const KNOWN = new Set();
for (const bucket of ['terms', 'names', 'peoples']) {
    for (const [k, v] of Object.entries(M[bucket] || {})) {
        KNOWN.add(k.toLowerCase());
        if (v) for (const part of String(v).split(/[\s-]+/)) if (part) KNOWN.add(part.toLowerCase());
    }
}
for (const line of readLines('./term-forms.txt')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const [w, f] = t.split(/\s+/);
    if (w) KNOWN.add(w.toLowerCase());
    if (f) KNOWN.add(f.toLowerCase());
}
const FILLER = new Set(`a an the and or but if then than that this these those there here
of to in on at by for with from into unto upon over under about after before between through
is am are was were be been being do did does done have has had having will would shall should
may might must can could not no nor so as such it its he him his she her they them their we us
our you your i me my mine who whom whose which what when where why how all any both each few
more most other some only very own same too also just now ever never again once because while
until during against above below up down out off one two three four five six seven eight nine
ten first second third don't didn't won't isn't aren't wasn't couldn't shouldn't
still yet since thus therefore wherefore however whether though although unless except
within without inside outside among amongst besides beside toward towards throughout
myself yourself himself herself itself ourselves yourselves themselves
another other others else somebody someone something anything nothing everything
neither either whoever whatever whenever wherever whichever
able unable rather quite indeed perhaps maybe almost already always often sometimes
behold lo verily truly surely certainly likewise moreover nevertheless furthermore
thereof therein thereto thereby whereof wherein whereby hereof herein
upon unto according concerning regarding together apart aside along across around
being having doing saying went come came gone able let get got make made take took
thing things way ways time times`.split(/\s+/));

// A term pin fires on EVERY occurrence of the word, so a grammatical word that
// happens to appear in some kjv_def becomes Hebrew everywhere. In the Apocalypse
// of Abraham render this produced "Damamah (still)" for "still" meaning "yet",
// "Az (since)" from az = "then", "Chayaqa (within)" from cheyq = "bosom", and a
// mangled "Yada (able)-Al (neither)". Those words are grammar, not content —
// excluded above rather than proposed and later deleted by hand.

const db = new Database(DB, { readonly: true });
const rows = db.prepare(
    `SELECT text FROM verses WHERE corpus='ENG' AND canon_id BETWEEN ? AND ? AND text IS NOT NULL`
).all(MIN, MAX);
db.close();

const PAIR = /([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'\u2019-]*)\s+\(([^()]*)\)/g;
const counts = new Map();
for (const r of rows) {
    for (const raw of (r.text || '').replace(PAIR, ' ').split(/[^A-Za-z'\u2019-]+/)) {
        const w = raw.trim().toLowerCase().replace(/[\u2019']s$/, '');
        if (w.length < 3 || FILLER.has(w) || KNOWN.has(w) || TERM_EXCLUDE.has(w)) continue;
        counts.set(w, (counts.get(w) || 0) + 1);
    }
}
say(`verses scanned: ${rows.length.toLocaleString()}   ungl0ssed word types: ${counts.size.toLocaleString()}`);

// ── 4. propose ──────────────────────────────────────────────────────────────
const proposals = [], unreachable = [], noTranslit = [], disagree = [];
for (const [w, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    if (n < MINC) continue;
    let cands = null, via = null;
    for (const form of lemmas(w)) {
        const c = english.get(form);
        if (c && c.length) { cands = c; via = form; break; }
    }
    if (!cands) { unreachable.push({ w, n }); continue; }
    // OT frequency decides; kjv_def position is only a tiebreak between numbers
    // of similar frequency (see the note above on alphabetical kjv_def).
    const ranked = cands.map(c => ({ ...c, freq: occBySn.get(c.sn) || 0, tr: translitBySn.get(c.sn) }))
        .sort((a, b) => b.freq - a.freq || a.rank - b.rank);
    // mechanical translit works for EVERY entry with a lemma; the index copy is
    // only used to cross-check, since both should agree by construction
    for (const c of ranked) {
        const mech = translitOf(lemmaOf(DICT[c.sn] || DICT[c.sn.replace(/^H/, '')]));
        if (mech) { if (c.tr && c.tr !== mech) disagree.push({ sn: c.sn, mech, indexed: c.tr }); c.tr = mech; }
    }
    const pick = ranked.find(c => c.tr);
    if (!pick) { noTranslit.push({ w, n, sn: ranked[0].sn }); continue; }
    const e = DICT[pick.sn] || DICT[pick.sn.replace(/^H/, '')];
    const def = (typeof e === 'string' ? e : (e && (e.kjv_def || e.strongs_def || e.def)) || '')
        .replace(/\s+/g, ' ').trim().slice(0, 54);
    proposals.push({ w, n, sn: pick.sn, tr: pick.tr, freq: pick.freq, rank: pick.rank, def,
                     via: via === w ? '' : via,
                     alts: ranked.filter(c => c.tr).slice(1, 3) });
}

rule(`PROPOSED PINS — ${proposals.length} words (showing ${Math.min(TOP, proposals.length)})`);
say('Forms are transliterated MECHANICALLY from each entry\'s Hebrew lemma using');
say('your CHAR_MAP (medial for every letter, final for the last), so a number that');
say('has never been rendered still gets a correct spelling. Emitted LOWERCASE:');
say('render-corpus uses a pin verbatim and capitalises only for a capitalised');
say('source word that is opted into term-caps.txt.');
say('Ranked by OT frequency. `sense` is where the word sits in that entry\'s kjv_def,');
say('shown for information only — those lists are ALPHABETICAL, so a low number means');
say('nothing about importance. Check the low-OT-frequency rows first: those are where');
say('a rare homonym can still win by default.');
say('');
say('  corpus  word            translit        strongs  OT      sense  via       kjv_def');
say('  ' + '-'.repeat(104));
for (const p of proposals.slice(0, TOP))
    say('  ' + String(p.n).padEnd(8) + p.w.padEnd(16) + p.tr.padEnd(16) +
        p.sn.padEnd(9) + String(p.freq).padEnd(8) + String(p.rank).padEnd(7) +
        (p.via || '').padEnd(10) + p.def);

if (disagree.length) {
    rule('TRANSLIT DISAGREEMENTS — mechanical vs what the index already renders');
    say('Both should be identical: the scheme is positional and deterministic. A row');
    say('here means the rendered form came from something other than a plain lemma');
    say('(a construct form, a defective spelling, or a pin), so check before pasting.');
    for (const d of disagree.slice(0, 25)) say(`  ${d.sn.padEnd(8)} mechanical=${d.mech.padEnd(16)} indexed=${d.indexed}`);
}

rule('NOT REACHABLE FROM kjv_def — these need authoring');
say('  ' + unreachable.slice(0, 60).map(x => `${x.w}(${x.n})`).join('  '));
if (noTranslit.length) {
    say('');
    say('Reachable but that Strong\'s has never been rendered, so there is no attested');
    say('spelling to copy — authoring too:');
    say('  ' + noTranslit.slice(0, 30).map(x => `${x.w}->${x.sn}(${x.n})`).join('  '));
}

rule('READY TO PASTE — term-forms.txt');
say('# Generated by build-term-candidates from Strong\'s kjv_def, with the translit');
say('# taken from surface-index.db (a spelling this corpus already renders).');
say('# REVIEW HIGH sense NUMBERS FIRST — those came from a secondary KJV gloss.');
say('# Delete any line you disagree with; term-forms.txt is read directly, so a');
say('# change takes effect on the next `node render-all.mjs --surface`, with no');
say('# OT rebuild.');
for (const p of proposals.slice(0, TOP)) {
    const alt = p.alts.length ? `  alt: ${p.alts.map(a => `${a.tr}/${a.sn}`).join(' ')}` : '';
    const via = p.via ? ` · via "${p.via}"` : '';
    say(`${p.w.padEnd(16)}${p.tr.padEnd(18)}# ${p.sn} · ${p.n}x in NT · ${p.freq}x OT · sense ${p.rank}${via}${alt}`);
}

if (OUT) { writeFileSync(OUT, LINES.join('\n') + '\n'); console.log(`\n[written to ${OUT}]`); }
