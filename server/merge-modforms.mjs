// merge-modforms.mjs — modification forms for the text apply-web-strongs does NOT render:
// the NT/Apocrypha reading text and fieldy's own saved verses (fieldy, 2026-10-01).
//
// apply-web-strongs.mjs renders the OT's machine text with modification forms segment by
// segment (BaYawam (in that day), NaAkal (we will eat)). Two other texts carry "word (gloss)"
// pairs too and get the same upgrade here, by modform-lib's mergeModforms(): a pair whose
// word is one of the verse's Hebrew roots becomes the full Hebrew word, and its gloss takes
// in the English its modifications account for ("We will akal (eat) our own lacham (bread)"
// -> "NaAkal (We will eat) Lachamanaw (our own bread)"). Names are left alone. Genesis 1-2
// are never touched (fieldy: those two chapters ease readers in).
//
//   --corpus   corpus.db ENG, canon > 39 (NT + Apocrypha), against the HEB edition's words.
//              Run after render-corpus --from-src --apply (render-all does), before reseed.
//   --saved    translation.db rows fieldy SAVED (status != 'none' or rich_text != '').
//              His choice when asked: "lets try to merge them, i may have translated in the
//              way we are shooting for and if not there will only be small variations".
//              His wording is kept; only "word (gloss)" pairs are upgraded. Every changed
//              row gets a translation_history row first (reversible), rich_text is merged
//              the same way, and translation_links english_indices are re-mapped onto the
//              new word positions.
//   --dry      report only.
//
// USAGE (from server/):
//   node merge-modforms.mjs [corpus.db] [translation.db] [surface-index.db] --corpus|--saved [--dry]
//   prod: node merge-modforms.mjs /data/corpus.db /data/translation.db /data/surface-index.db --saved
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as MF from './modform-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const pos = argv.filter(a => !a.startsWith('--'));
const CORPUS = argv.includes('--corpus'), SAVED = argv.includes('--saved'), DRY = argv.includes('--dry');
const die = m => { console.error('✗ ' + m); process.exit(1); };
if (CORPUS === SAVED) die('pass exactly one of --corpus / --saved');
const CORPUS_DB = pos[0] || path.join(__dirname, 'corpus.db');
const TRANS_DB = pos[1] || path.join(__dirname, 'translation.db');
const INDEX_DB = pos[2] || path.join(__dirname, 'surface-index.db');
for (const f of [CORPUS_DB, INDEX_DB, ...(SAVED ? [TRANS_DB] : [])]) if (!existsSync(f)) die(`${f} not found`);

await MF.loadCharMap();
const sdb = new Database(INDEX_DB, { readonly: true });
const wordsOf = MF.verseWordsLoader(sdb);
const cdb = new Database(CORPUS_DB, { readonly: !CORPUS || DRY });

// The Hebrew words of a verse keyed the way the text is keyed (canon | text chapter | verse).
const ordOf = new Map();
for (const r of cdb.prepare(`SELECT canon_id c, chapter ch, verse v, ord_c, ord_v FROM verses WHERE corpus='ENG' AND canon_id IS NOT NULL AND ord_c IS NOT NULL`).iterate())
  ordOf.set(`${r.c}|${+r.ch}|${+r.v}`, [r.ord_c, r.ord_v]);
const hebWords = (c, ch, v) => {
  const o = ordOf.get(`${c}|${+ch}|${+v}`) || [+ch, +v];
  return wordsOf(c <= 39 ? 'BHS' : 'HEB', c, o[0], o[1]);
};

// Old whitespace-token positions -> new ones (translation_links english_indices). Words
// that survive are matched by LCS on their letters; a head word that became its full form
// ("akal" -> "NaAkal") maps to the unmatched new token in the same gap.
export function indexMap(oldText, newText) {
  const a = oldText.split(/\s+/).filter(Boolean), b = newText.split(/\s+/).filter(Boolean);
  const k = t => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ka = a.map(k), kb = b.map(k), n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = (ka[i] && ka[i] === kb[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const map = new Array(n).fill(-1), usedB = new Set();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (ka[i] && ka[i] === kb[j]) { map[i] = j; usedB.add(j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  for (let i = 0; i < n; i++) {
    if (map[i] >= 0) continue;
    let p = i - 1; while (p >= 0 && map[p] < 0) p--;
    let q = i + 1; while (q < n && map[q] < 0) q++;
    const lo = p >= 0 ? map[p] : -1, hi = q < n ? map[q] : m;
    let pick = -1;
    for (let j = lo + 1; j < hi; j++) if (!usedB.has(j)) { pick = j; break; }
    if (pick >= 0) usedB.add(pick);
    map[i] = pick >= 0 ? pick : Math.max(0, Math.min(m - 1, lo >= 0 ? lo : 0));
  }
  return map;
}

let seen = 0, changed = 0, pairs = 0, linkRows = 0;
const samples = [];
if (CORPUS) {
  const rows = cdb.prepare(`SELECT id, canon_id c, chapter ch, verse v, text FROM verses WHERE corpus='ENG' AND canon_id > 39 AND text IS NOT NULL AND text != ''`).all();
  const upd = DRY ? null : cdb.prepare(`UPDATE verses SET text = ? WHERE id = ?`);
  cdb.transaction(() => {
    for (const r of rows) {
      seen++;
      const r2 = MF.mergeModforms(r.text, hebWords(r.c, r.ch, r.v));
      if (!r2.n || r2.text === r.text) continue;
      changed++; pairs += r2.n;
      if (samples.length < 8) samples.push(`${r.c}:${r.ch}:${r.v}  ${r2.text}`);
      if (upd) upd.run(r2.text, r.id);
    }
  })();
  console.log(`modification forms (NT/Apocrypha, corpus.db ENG): ${changed.toLocaleString()} of ${seen.toLocaleString()} verses, ${pairs.toLocaleString()} words upgraded${DRY ? ' (dry run)' : ''}`);
} else {
  const tdb = new Database(TRANS_DB, { readonly: DRY });
  const rows = tdb.prepare(`SELECT book_id c, chapter ch, verse v, status, text, coalesce(rich_text,'') rt FROM translations
      WHERE (status != 'none' OR coalesce(rich_text,'') != '') AND text IS NOT NULL AND text != ''`).all();
  const histIns = DRY ? null : tdb.prepare(`INSERT INTO translation_history (book_id, chapter, verse, status, text, rich_text, saved_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`);
  const upd = DRY ? null : tdb.prepare(`UPDATE translations SET text = ?, rich_text = ?, updated_at = datetime('now') WHERE book_id = ? AND chapter = ? AND verse = ?`);
  const linkSel = tdb.prepare(`SELECT id, english_indices FROM translation_links WHERE book_id = ? AND chapter = ? AND verse = ?`);
  const linkUpd = DRY ? null : tdb.prepare(`UPDATE translation_links SET english_indices = ? WHERE id = ?`);
  tdb.transaction(() => {
    for (const r of rows) {
      if (!MF.modformApplies(r.c, r.ch)) continue;
      seen++;
      const ws = hebWords(r.c, r.ch, r.v);
      const t2 = MF.mergeModforms(r.text, ws);
      if (!t2.n || t2.text === r.text) continue;
      const rich = !r.rt ? r.rt : (r.rt === r.text ? t2.text : MF.mergeModforms(r.rt, ws).text);
      changed++; pairs += t2.n;
      samples.push(`${r.c}:${r.ch}:${r.v}\n    was: ${r.text}\n    now: ${t2.text}`);
      if (DRY) continue;
      histIns.run(r.c, r.ch, r.v, r.status, r.text, r.rt);
      upd.run(t2.text, rich, r.c, r.ch, r.v);
      const map = indexMap(r.text, t2.text);
      for (const l of linkSel.all(r.c, r.ch, r.v)) {
        let ix; try { ix = JSON.parse(l.english_indices || '[]'); } catch { continue; }
        const nix = [...new Set(ix.map(i => (i >= 0 && i < map.length) ? map[i] : i))];
        if (JSON.stringify(nix) !== JSON.stringify(ix)) { linkRows++; linkUpd.run(JSON.stringify(nix), l.id); }
      }
    }
  })();
  tdb.close();
  console.log(`modification forms (your saved verses, Gen 3 on): ${changed} of ${seen} verses merged, ${pairs} words upgraded, ` +
              `${linkRows} link rows re-indexed${DRY ? ' (dry run — nothing written)' : ' — the old wording of each is in translation_history'}`);
}
for (const s of samples.slice(0, SAVED ? 400 : 8)) console.log('  ' + s);
cdb.close(); sdb.close();
