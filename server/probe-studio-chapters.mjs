#!/usr/bin/env node
/**
 * probe-studio-chapters.mjs — READ ONLY.
 *
 * Translation Studio lists "Ch 1" and nothing else for the NT and the
 * non-canonical works, so chapters 2..N are unreachable for editing.
 *
 * /api/translate/progress builds that list in two branches: books WITH Hebrew
 * tokens come from tokens_bhs, and books WITHOUT come from the ENG verses via
 *
 *     COALESCE(NULLIF(chapter, 0), ord_c)
 *
 * This runs that exact expression against the real rows and shows what it
 * produces, alongside the raw column values and their SQLite storage types. It
 * asserts nothing — the output says which of these is true:
 *
 *   A. `chapter` is an EMPTY STRING. NULLIF(x, 0) only nulls a literal 0, and ''
 *      is not 0, so COALESCE returns '' and ord_c is never consulted. Every
 *      chapter then groups into one bucket.
 *   B. `chapter` is TEXT like '1.0'. Grouping still works, but the API returns a
 *      STRING while the UI holds a NUMBER (+searchParams.get('chapter')), so
 *      `activeChapter === ch.chapter` is false and the chapter never opens.
 *   C. `chapter` is genuinely NULL and ord_c is also NULL — the rows carry no
 *      chapter at all, which is a loader problem, not a query problem.
 *   D. Something else, in which case the dump below shows it.
 *
 * USAGE
 *   node probe-studio-chapters.mjs --out studio.txt
 *   node probe-studio-chapters.mjs --book 45 --out romans.txt
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const DB   = arg('db', './corpus.db');
const BOOK = arg('book') ? parseInt(arg('book'), 10) : null;
const OUT  = arg('out');

const LINES = [];
const say = (...a) => { const s = a.join(' '); LINES.push(s); console.log(s); };
const rule = t => { say(''); say('─'.repeat(76)); say(t); say('─'.repeat(76)); };

const db = new Database(DB, { readonly: true });

rule('RAW ROWS — what is actually stored');
say('typeof() is SQLite storage class. `chapter` as text is fine for grouping but');
say('is returned to the UI as a string, which will not === a number.');
say('');
say('  canon  chapter        typeof   verse          typeof   ord_c   ord_v');
say('  ' + '-'.repeat(72));
const where = BOOK ? 'AND canon_id = ?' : 'AND canon_id >= 40';
const params = BOOK ? [BOOK] : [];
for (const r of db.prepare(`
    SELECT canon_id, chapter, typeof(chapter) tc, verse, typeof(verse) tv, ord_c, ord_v
    FROM verses WHERE corpus='ENG' ${where}
    ORDER BY canon_id, ord_c, ord_v LIMIT 12`).all(...params)) {
    say('  ' + String(r.canon_id).padEnd(7) +
        String(JSON.stringify(r.chapter)).padEnd(15) + String(r.tc).padEnd(9) +
        String(JSON.stringify(r.verse)).padEnd(15) + String(r.tv).padEnd(9) +
        String(r.ord_c).padEnd(8) + String(r.ord_v));
}

rule('THE ENDPOINT\'S OWN QUERY — what /api/translate/progress currently returns');
const current = db.prepare(`
    SELECT canon_id AS book_id,
           COALESCE(NULLIF(chapter, 0), ord_c) AS chapter,
           COUNT(DISTINCT COALESCE(NULLIF(verse, 0), ord_v)) AS total_verses
    FROM verses
    WHERE corpus='ENG' AND canon_id IS NOT NULL ${where}
      AND COALESCE(NULLIF(chapter, 0), ord_c) IS NOT NULL
    GROUP BY book_id, chapter`).all(...params);
const byBookNow = new Map();
for (const r of current) {
    if (!byBookNow.has(r.book_id)) byBookNow.set(r.book_id, []);
    byBookNow.get(r.book_id).push(r);
}
say('  canon   chapters listed   first few');
say('  ' + '-'.repeat(60));
for (const [b, rows] of [...byBookNow].slice(0, 15))
    say('  ' + String(b).padEnd(8) + String(rows.length).padEnd(18) +
        rows.slice(0, 6).map(r => `${JSON.stringify(r.chapter)}(${r.total_verses}v)`).join(' '));

rule('A CORRECTED QUERY — treats blank/whitespace as missing, and casts to integer');
const fixed = db.prepare(`
    SELECT canon_id AS book_id,
           CAST(COALESCE(NULLIF(TRIM(COALESCE(chapter,'')), ''), ord_c) AS INTEGER) AS chapter,
           COUNT(DISTINCT CAST(COALESCE(NULLIF(TRIM(COALESCE(verse,'')), ''), ord_v) AS INTEGER)) AS total_verses
    FROM verses
    WHERE corpus='ENG' AND canon_id IS NOT NULL ${where}
      AND COALESCE(NULLIF(TRIM(COALESCE(chapter,'')), ''), ord_c) IS NOT NULL
    GROUP BY book_id, chapter`).all(...params);
const byBookFix = new Map();
for (const r of fixed) {
    if (!byBookFix.has(r.book_id)) byBookFix.set(r.book_id, []);
    byBookFix.get(r.book_id).push(r);
}
say('  canon   chapters listed   first few');
say('  ' + '-'.repeat(60));
for (const [b, rows] of [...byBookFix].slice(0, 15))
    say('  ' + String(b).padEnd(8) + String(rows.length).padEnd(18) +
        rows.slice(0, 6).map(r => `${r.chapter}(${r.total_verses}v)`).join(' '));

rule('VERDICT');
let changed = 0, sameCount = 0;
for (const [b, rows] of byBookFix) {
    const now = (byBookNow.get(b) || []).length;
    if (rows.length !== now) changed++; else sameCount++;
}
say(`books where the corrected query lists MORE chapters: ${changed}`);
say(`books unchanged: ${sameCount}`);
say('');
if (changed) {
    say('So the chapter list IS being collapsed by the current expression. The rows');
    say('carry the chapters; the query is not reaching them. Replace the ENG branch');
    say('of /api/translate/progress with the corrected query above.');
} else {
    say('The query is NOT the cause — both forms list the same chapters. Look instead');
    say('at the UI: `activeChapter === ch.chapter` compares a number against whatever');
    say('type the API returned. Check the `typeof` column in the first table; if it');
    say('says `text`, the comparison fails and the chapter never opens even though it');
    say('is listed.');
}
db.close();
if (OUT) { writeFileSync(OUT, LINES.join('\n') + '\n'); console.log(`\n[written to ${OUT}]`); }
