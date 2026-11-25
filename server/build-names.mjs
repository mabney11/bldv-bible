// build-names.mjs — bakes server/names-index.json: the core NAMES of scripture for /names.
//
// fieldy (2026-11-25): "i dont want to have to manually select the names to display -- I want the core
// names of the bible including Yaiqab, Yashar-Al, David, Solomon, Jeroboam, other kings etc". Corpus-derived
// and static, so it is baked here, offline (his bake-static-data rule); server.js only reads the file.
//
// A name is a Strong's number whose dictionary entry describes a PERSON (its own head — the text before
// "also" — names a son/daughter/wife/king/prophet/patriarch/… or "the name of …"), counted in the Masoretic
// tokens (tokens_bhs) and the Hebrew edition's other books (tokens_nt). Kept: >= MIN_OT Masoretic
// occurrences, or any king, or any number lexicon/names.json writes about. Left out: the divine names and
// titles (they have their own tab, lexicon/divine-titles.json). Each entry carries its counts and its FIRST
// occurrence in the site's own verse numbering (eng-versification.cjs). The English name, transliteration,
// letters and meaning are read by server.js from the dictionary + his name map + his anatomy edits, so an
// edit there needs no re-bake. Re-run after the corpus or the Strong's dictionary changes:
//     node build-names.mjs            (corpus.db, strongs-hebrew-paleo.json -> names-index.json)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { mtToSite } = require('./eng-versification.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));

const MIN_OT = 20;
const corpusPath = process.argv[2] || path.join(here, 'corpus.db');
const dict = JSON.parse(fs.readFileSync(path.join(here, 'strongs-hebrew-paleo.json'), 'utf8'));
const overlay = JSON.parse(fs.readFileSync(path.join(here, 'lexicon', 'names.json'), 'utf8'));
const divine = JSON.parse(fs.readFileSync(path.join(here, 'lexicon', 'divine-titles.json'), 'utf8'));

const norm = (s) => { const m = /^H?0*(\d+[a-z]?)$/i.exec(String(s || '').trim()); return m ? 'H' + m[1] : null; };
const DIVINE = new Set();
(function walk(v) {
    if (typeof v === 'string') { const n = /^H\d+[a-z]?$/.test(v) ? v : null; if (n) DIVINE.add(n); return; }
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') Object.values(v).forEach(walk);
})(divine.singles || []);
const OVERLAY = new Set((overlay.names || []).map(n => norm(n.sn)).filter(Boolean));

const PERSON = /\b((grand)?sons?|daughters?|wife|husband|father|mother|nephew|kings?|queen|patriarch|prophet(ess)?|priests?|brother|sister|lawgiver|leader|successor|captain|general|scribe|man|woman|Mesopotamian|Israelites?)\b/i;
const PLACE = /\b(places?|town|city|cities|hill|district|region|country|mountain|river|valley)\b/i;
const NOT_PERSON = /\b(deity|idol|god|title)\b/i;
const KING = /\bkings?\b/i;
// A person whose dictionary head names a place first ("Jizreel, the name of two places … and of two
// Israelites") or a deity / title (Molek, Paroh) is not taken as a person.
function personHead(head) {
    const h = head.replace(/\([^)]*\)/g, '');
    if (!/^[A-Z]/.test(h) || NOT_PERSON.test(h)) return false;
    const pm = PERSON.exec(h); if (!pm) return false;
    const lm = PLACE.exec(h);
    return !(lm && lm.index < pm.index);
}

const db = new Database(corpusPath, { readonly: true, fileMustExist: true });
try { db.pragma('temp_store = MEMORY'); } catch { /* shim */ }
function tally(table) {
    const out = new Map();
    for (const r of db.prepare(`SELECT strongs AS sn, COUNT(*) AS n, MIN(book_id * 1000000 + chapter * 1000 + verse) AS first
                                 FROM ${table} WHERE strongs LIKE 'H%' GROUP BY strongs`).all()) {
        const sn = norm(r.sn); if (sn) out.set(sn, { n: r.n, first: r.first });
    }
    return out;
}
const ot = tally('tokens_bhs'), more = tally('tokens_nt');
// Kings by the text itself: a person named in >= 3 verses that also say "reign" (H4427 malak) — Omri's
// dictionary entry says only "an Israelite".
const reign = new Map();
for (const r of db.prepare(`SELECT a.strongs AS sn, COUNT(DISTINCT a.book_id * 1000000 + a.chapter * 1000 + a.verse) AS n
                             FROM tokens_bhs a
                             JOIN (SELECT DISTINCT book_id, chapter, verse FROM tokens_bhs WHERE strongs = 'H4427') v
                               ON v.book_id = a.book_id AND v.chapter = a.chapter AND v.verse = a.verse
                             WHERE a.strongs LIKE 'H%' GROUP BY a.strongs`).all()) { const sn = norm(r.sn); if (sn) reign.set(sn, r.n); }
const unpack = (k) => ({ book_id: Math.floor(k / 1000000), chapter: Math.floor(k / 1000) % 1000, verse: k % 1000 });

const names = [];
for (const [sn, e] of Object.entries(dict)) {
    if (DIVINE.has(sn)) continue;
    const def = String(e.strongs_def || '');
    const head = def.split(/[;,]?\s*\balso\b/)[0];
    const kjv = String(e.kjv_def || '').split(/[,.;]/).map(s => s.trim()).filter(Boolean);
    if (!kjv.length || !/^[A-Z]/.test(kjv[0])) continue;
    const isPerson = personHead(head);
    const o = ot.get(sn), m = more.get(sn);
    const nOt = o?.n || 0, nMore = m?.n || 0;
    const king = isPerson && (KING.test(head.replace(/\([^)]*\)/g, '')) || (reign.get(sn) || 0) >= 3);
    const keep = OVERLAY.has(sn) || (isPerson && (nOt >= MIN_OT || (king && nOt >= 3)));
    if (!keep) continue;
    let first = null;
    if (o) {
        const f = unpack(o.first);
        const site = (mtToSite(f.book_id, f.chapter, f.verse) || [])[0];
        first = site ? { book_id: site[0], chapter: site[1], verse: site[2] } : f;
    } else if (m) first = unpack(m.first);
    names.push({ sn, ot: nOt, more: nMore, king, kjv: kjv.filter(k => /^[A-Z]/.test(k)), first });
}
names.sort((a, b) => (b.ot + b.more) - (a.ot + a.more));
const out = path.join(here, 'names-index.json');
fs.writeFileSync(out, JSON.stringify({ _comment: 'Baked by build-names.mjs — do not edit; curated text lives in lexicon/names.json.', built: new Date().toISOString(), min_ot: MIN_OT, names }, null, 0) + '\n');
console.log(`names-index.json: ${names.length} names (${names.filter(n => n.king).length} kings, ${[...OVERLAY].length} written about in lexicon/names.json)`);
