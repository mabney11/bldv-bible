#!/usr/bin/env node
/**
 * fix-divine-names.mjs — the divine-name PARALLEL GATE and its repair.
 *
 * fieldy 2026-10-06, Matthew 1:20: the word-by-word table says 𐤉𐤄𐤅𐤄 Yahawah (H3068) and the reading
 * text says "an angel of the Adanay". The NT baseline already holds every "the Lord" as "the Adanay",
 * so no render step ever asked the verse's Hebrew. "I dont want to have to be the one who finds this
 * mismatched tokens." Rules and the per-verse algorithm: divine-name-lib.mjs.
 *
 * Every NT/Apocrypha verse (canon >= 40): the divine words of its HEB edition (𐤉𐤄𐤅𐤄 / 𐤀𐤃𐤍𐤉 with up
 * to 3 proclitics, by SPELLING — the edition's Strong's tags are inferred) must agree with the
 * Yahawah / Adanay in the English. Chapters with versification drift (surface-index heb_offsets != 0)
 * are skipped, like the other gates.
 *
 * USAGE  node fix-divine-names.mjs [corpus.db] [translation.db] [surface-index.db]
 *          (default)      repair corpus.db ENG rows + SEEDED translation.db rows (status 'none', no rich_text)
 *          --check        gate: write nothing, exit 1 if any machine row disagrees
 *          --saved        also repair fieldy's SAVED verses (translation_history row first; one word
 *                         for one word, links re-indexed) — without it they are only LISTED
 *          --dry-run      like default but writes nothing, exit 0
 * Report: server/divine-name-review.txt (saved-verse mismatches + verses it could not decide).
 * Wired: render-all (after merge-modforms --corpus, and as the gate after the parallel gate),
 * verify in deploy/rebake the same way verify-reading-glosses is.
 */
import Database from 'better-sqlite3';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hebDivine, checkDivine, dropIndices } from './divine-name-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const pos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const CHECK = flags.has('--check'), DRY = flags.has('--dry-run') || CHECK, SAVED = flags.has('--saved');
const CORPUS_DB = pos[0] || path.join(__dirname, 'corpus.db');
const TRANS_DB = pos[1] || path.join(__dirname, 'translation.db');
const SURF_DB = pos[2] || path.join(__dirname, 'surface-index.db');
if (!existsSync(CORPUS_DB)) { console.error(`no corpus.db at ${CORPUS_DB}`); process.exit(2); }

const cdb = new Database(CORPUS_DB, { readonly: DRY });
const drift = new Set();
if (existsSync(SURF_DB)) {
  try {
    const s = new Database(SURF_DB, { readonly: true });
    for (const r of s.prepare(`SELECT canon_id, chapter FROM heb_offsets WHERE offset != 0`).iterate()) drift.add(`${r.canon_id}|${r.chapter}`);
    s.close();
  } catch (e) { console.warn(`surface-index.db heb_offsets unreadable (${e.message}) — drift chapters not skipped`); }
}

// Hebrew divine words per verse (Hebrew numbering = ord_c/ord_v), in token order.
const heb = new Map();
{
  const cur = { k: null, kinds: [] };
  const flush = () => { if (cur.k && cur.kinds.length) heb.set(cur.k, cur.kinds); };
  for (const r of cdb.prepare(`SELECT book_id, chapter, verse, word_raw FROM tokens_nt WHERE book_id >= 40 ORDER BY book_id, CAST(chapter AS INTEGER), CAST(verse AS INTEGER), token_ordinal`).iterate()) {
    const k = `${r.book_id}|${+r.chapter}|${+r.verse}`;
    if (k !== cur.k) { flush(); cur.k = k; cur.kinds = []; }
    const kind = hebDivine([r])[0];
    if (kind) cur.kinds.push(kind);
  }
  flush();
}

const ordOf = new Map();       // "canon|textCh|textV" -> "canon|ordC|ordV"
const verses = cdb.prepare(`SELECT id, canon_id, chapter, verse, ord_c, ord_v, text FROM verses WHERE corpus='ENG' AND canon_id >= 40 AND text IS NOT NULL`).all();
for (const r of verses) if (r.ord_c != null) ordOf.set(`${r.canon_id}|${+r.chapter}|${+r.verse}`, `${r.canon_id}|${r.ord_c}|${r.ord_v}`);
const hebFor = (canon, ch, v) => {
  if (drift.has(`${canon}|${ch}`)) return null;
  return heb.get(ordOf.get(`${canon}|${+ch}|${+v}`) || `${canon}|${+ch}|${+v}`) || null;
};

const stat = { corpus: 0, trans: 0, saved: 0, links: 0, ambiguous: 0, ok: 0 };
const review = [], sample = [];
const refOf = (c, ch, v) => `${c}:${ch}:${v}`;

// ── corpus.db ENG rows ───────────────────────────────────────────────────────
{
  const upd = DRY ? null : cdb.prepare(`UPDATE verses SET text = ? WHERE id = ?`);
  const tx = cdb.transaction(() => {
    for (const r of verses) {
      const h = hebFor(r.canon_id, r.chapter, r.verse);
      if (!h) continue;
      const c = checkDivine(r.text, h);
      if (c.status === 'ok') stat.ok++;
      else if (c.status === 'ambiguous') { stat.ambiguous++; review.push(`AMBIGUOUS corpus ${refOf(r.canon_id, r.chapter, r.verse)}  Hebrew [${h.join(' ')}]  ${r.text.slice(0, 160)}`); }
      else if (c.status === 'fixed') {
        stat.corpus++;
        if (sample.length < 14) sample.push(`  corpus ${refOf(r.canon_id, r.chapter, r.verse)}  ${c.hits.map(x => `${x.text} → ${x.fix}`).join('; ')}`);
        if (upd) upd.run(c.fixed, r.id);
      }
    }
  });
  tx();
}

// ── translation.db ───────────────────────────────────────────────────────────
if (existsSync(TRANS_DB)) {
  const tdb = new Database(TRANS_DB, { readonly: DRY });
  const rows = tdb.prepare(`SELECT book_id, chapter, verse, status, text, rich_text FROM translations WHERE book_id >= 40`).all();
  const upd = DRY ? null : tdb.prepare(`UPDATE translations SET text = ?, rich_text = ?, updated_at = datetime('now') WHERE book_id = ? AND chapter = ? AND verse = ?`);
  const hist = DRY ? null : tdb.prepare(`INSERT INTO translation_history (book_id, chapter, verse, status, text, rich_text, saved_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`);
  const linkSel = tdb.prepare(`SELECT id, english_indices FROM translation_links WHERE book_id = ? AND chapter = ? AND verse = ?`);
  const linkUpd = DRY ? null : tdb.prepare(`UPDATE translation_links SET english_indices = ? WHERE id = ?`);
  const tx = tdb.transaction(() => {
    for (const r of rows) {
      const h = hebFor(r.book_id, r.chapter, r.verse);
      if (!h) continue;
      const seeded = (r.status || 'none') === 'none' && !(r.rich_text || '');
      const a = checkDivine(r.text || '', h);
      const b = r.rich_text ? checkDivine(r.rich_text, h) : { status: 'none', fixed: r.rich_text || '', hits: [], drops: [] };
      if (a.status === 'ambiguous') { stat.ambiguous++; review.push(`AMBIGUOUS translation ${refOf(r.book_id, r.chapter, r.verse)}${seeded ? '' : ' (saved)'}  Hebrew [${h.join(' ')}]  ${(r.text || '').slice(0, 160)}`); }
      if (a.status !== 'fixed' && b.status !== 'fixed') continue;
      if (!seeded && !SAVED) {
        stat.saved++;
        review.push(`SAVED ${refOf(r.book_id, r.chapter, r.verse)}  ${[...a.hits, ...b.hits].map(x => `${x.text} → ${x.fix}`).join('; ')}   (rerun with --saved to repair)`);
        continue;
      }
      stat.trans++;
      if (sample.length < 14) sample.push(`  translation ${refOf(r.book_id, r.chapter, r.verse)}${seeded ? '' : ' (saved)'}  ${a.hits.map(x => `${x.text} → ${x.fix}`).join('; ')}`);
      if (!upd) continue;
      if (!seeded) hist.run(r.book_id, r.chapter, r.verse, r.status, r.text, r.rich_text);   // the state BEFORE this fix
      upd.run(a.fixed, b.fixed, r.book_id, r.chapter, r.verse);
      if (a.drops.length) for (const l of linkSel.all(r.book_id, r.chapter, r.verse)) {
        let ix; try { ix = JSON.parse(l.english_indices || '[]'); } catch { continue; }
        const nix = dropIndices(ix, a.drops);
        if (JSON.stringify(nix) !== JSON.stringify(ix)) { stat.links++; linkUpd.run(JSON.stringify(nix), l.id); }
      }
    }
  });
  tx();
  tdb.close();
} else console.log(`(no translation.db at ${TRANS_DB})`);
cdb.close();

for (const s of sample) console.log(s);
const REPORT = path.join(__dirname, 'divine-name-review.txt');
if (!DRY || CHECK) { try { writeFileSync(REPORT, review.length ? review.join('\n') + '\n' : '(nothing to review)\n'); } catch {} }
const machine = stat.corpus + stat.trans;
console.log(`fix-divine-names: ${stat.ok} verses agree · ${stat.corpus} corpus verse(s) + ${stat.trans} translation row(s) ${DRY ? 'DISAGREE' : 'repaired'} · ${stat.saved} saved verse(s) listed · ${stat.ambiguous} undecidable (Hebrew and English differ in number) · ${stat.links} link row(s) re-indexed${review.length ? ` · see divine-name-review.txt` : ''}`);
if (CHECK && machine) { console.error(`✗ divine-name gate: ${machine} machine verse(s) say Adanay where the Hebrew says Yahawah (or the reverse). Run: node fix-divine-names.mjs`); process.exit(1); }
