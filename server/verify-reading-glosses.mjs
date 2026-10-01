#!/usr/bin/env node
/**
 * verify-reading-glosses.mjs — the PARALLEL GATE: no glossed word on the translated
 * side may disagree with the token side of the same verse.
 *
 * fieldy, 2026-10-01 (Isaiah 4:1 "ashah (wife / individual woman)"): "there should be a
 * 'parallel' gate for every verse and common misconceptions like this should be tried.
 * the word 'ashah (fire of)' is nowhere in the tokens so it being in the translated text
 * is an issue." / "there should not be glossed words on the translated side that disagree
 * with the token side." (Standing rule since 2026-09-26: such pairs are flagged, not rendered.)
 *
 * audit-reading-glosses.mjs already measured this but was report-only and outside every
 * pipeline, and it accepted a word from ANY verse within ±2 — so Isaiah 4:1 sat flagged
 * in a report nobody runs. This is the gate:
 *
 *   EVERY `word (gloss)` pair in the reader's text (translation.db) and in corpus.db ENG
 *   must name a Hebrew word present in THAT verse's tokens — tokens_bhs for canon 1-39,
 *   surface-index.db HEB rows otherwise (the same Hebrew the Parallel view and render use).
 *   Neighbouring verses (±2) count ONLY in chapters whose numbering is known to diverge:
 *   versification-differences.json, Malachi 4 / Joel 3-4, and HEB chapters with a non-zero
 *   heb_offsets offset. Names / theonyms / peoples are spelling-based by design — skipped.
 *
 *   MISCONCEPTIONS — known-wrong pairs, tried on EVERY verse, Hebrew or not:
 *   lexicon/gloss-misconceptions.json [{word, gloss_words[], why}] plus every
 *   strongs-renumber.json entry with raw_root+gloss_words (ashah→woman, bath→daughter).
 *   A misconception passes only if the verse's own Hebrew has that root.
 *
 * Exit 1 on any violation (no warning tier — fieldy: "warnings are issues").
 *
 *   --fix   repair what a script may repair: on machine rows (corpus.db; translation.db
 *           rows with status 'none' AND rich_text '' — never Studio work) unwrap the pair
 *           to its plain English: "hamah (like)" -> "like". A gloss is never better than a
 *           wrong Hebrew word. translation_links english_indices past the removed word move
 *           down one (same convention as fix-name-forms.mjs). Hand-saved verses are NEVER
 *           rewritten — they stay violations, listed for the Studio.
 *   --report-only   print, exit 0 (for measuring).
 *   --out FILE      full list.
 *
 * USAGE: node verify-reading-glosses.mjs [corpus.db] [translation.db] [surface-index.db] [--fix]
 *  prod: docker run --rm -v /mnt/paleo-data:/data paleo-studio node verify-reading-glosses.mjs
 *        /data/corpus.db /data/translation.db /data/surface-index.db --fix
 */
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const pos = argv.filter(a => !a.startsWith('--'));
const flag = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const FIX = flag('--fix'), REPORT = flag('--report-only'), OUT = val('--out', null);
// fieldy's own saved verses: a mismatch that is NOT a known misconception is a wording
// decision of his — listed in REVIEW (gloss-gate-review.txt), fatal only with
// --saved-fatal (or PALEO_GLOSS_SAVED_FATAL=1) until he has reviewed the list.
const SAVED_FATAL = flag('--saved-fatal') || process.env.PALEO_GLOSS_SAVED_FATAL === '1';
const REVIEW = val('--review', path.join(__dirname, 'gloss-gate-review.txt'));
const CORPUS_DB = pos[0] || path.join(__dirname, 'corpus.db');
const TRANS_DB = pos[1] || path.join(__dirname, 'translation.db');
const INDEX_DB = pos[2] || path.join(__dirname, 'surface-index.db');
const die = m => { console.error('✗ ' + m); process.exit(1); };
if (!existsSync(CORPUS_DB)) die(`corpus.db not found: ${CORPUS_DB}`);

const L = f => JSON.parse(readFileSync(path.join(__dirname, f), 'utf8'));
const ROOTS = L('lexicon/strongs-roots.json');
const booksJs = ['../src/lib/books.js', './vendor/books.js', './src/lib/books.js'].map(x => path.join(__dirname, x)).find(existsSync);
if (!booksJs) die('books.js (translit) not found');
const { translit } = await import(pathToFileURL(booksJs).href);
const MF = await import(pathToFileURL(path.join(__dirname, 'modform-lib.mjs')).href);
await MF.loadCharMap();
const CONCEPTS = MF.loadConcepts();
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const words = s => String(s || '').toLowerCase().match(/[a-z]{3,}/g) || [];
const trCache = new Map();
const trSn = sn => { const k = 'H' + String(sn).replace(/^H+/i, '').replace(/[^0-9a-z].*$/i, '');
  if (!trCache.has(k)) trCache.set(k, ROOTS[k] ? norm(translit(ROOTS[k])) : ''); return trCache.get(k); };

// ── names: spelling-based on purpose, not auditable against tokens ─────────────
const names = new Set();
const addName = v => { names.add(norm(v)); for (const w of String(v).split(/[\s-]+/)) names.add(norm(w)); };
try { const nm = L('name-map-expanded.json'); for (const s of ['single', 'phrases', 'theonyms']) Object.values(nm[s] || {}).forEach(addName); } catch {}
try { const wm = L('word-map.json'); for (const s of ['names', 'peoples']) Object.values(wm[s] || {}).forEach(addName); } catch {}

// ── misconceptions ─────────────────────────────────────────────────────────────
const MIS = [];
try { for (const m of L('lexicon/gloss-misconceptions.json').entries || []) MIS.push({ word: norm(m.word), gloss: new Set(m.gloss_words), why: m.why }); } catch {}
try {
  for (const [from, e] of Object.entries(L('lexicon/strongs-renumber.json'))) {
    if (from.startsWith('_') || !e?.raw_root || !e.gloss_words) continue;
    MIS.push({ word: norm(translit(e.raw_root)), gloss: new Set(e.gloss_words),
               why: `${from} was moved off ${e.raw_root} (renumbered ${e.to}) — spell it ${translit(ROOTS[e.to] || '')}` });
  }
} catch {}

// Signed-off exceptions: { "23:4:1|qabal (hold)": "why" } — a deliberate choice of fieldy's.
let ACCEPT = {}; try { ACCEPT = L('lexicon/gloss-gate-accepted.json'); } catch {}
// ── chapters whose verse numbering diverges between English and the Hebrew ──────
const drift = new Set(['39|3', '39|4', '29|2', '29|3', '29|4']);
const engToHeb = new Map();   // "b|engCh|engV" -> "b|hebCh|hebV" (exact, from the same table the Parallel view uses)
try {
  const vd = L('versification-differences.json').differences || {};
  for (const [k, segs] of Object.entries(vd)) {
    const [b, ch] = k.split(':').map(Number); drift.add(`${b}|${ch}`);
    for (const s of segs) {
      if (s.engChapter) drift.add(`${b}|${s.engChapter}`);
      if (s.heb && s.eng && s.engChapter) for (let e = s.eng[0]; e <= s.eng[1]; e++) engToHeb.set(`${b}|${s.engChapter}|${e}`, `${b}|${ch}|${s.heb[0] + (e - s.eng[0])}`);
    }
  }
} catch {}
// Malachi 4 = MT 3:19-24 (server.js VERSIFICATION_MAP)
for (let e = 1; e <= 6; e++) engToHeb.set(`39|4|${e}`, `39|3|${18 + e}`);

// ── Hebrew per verse ───────────────────────────────────────────────────────────
const cdb = new Database(CORPUS_DB, { readonly: !FIX });
const heb = new Map();   // "c|ch|v" -> { roots:Set, surf:Set }
const addTok = (c, ch, v, sn, raw) => {
  const k = `${c}|${Math.trunc(+ch)}|${Math.trunc(+v)}`; let e = heb.get(k); if (!e) heb.set(k, e = { roots: new Set(), surf: new Set() });
  for (const one of String(sn || '').split(/[+＋]/)) { const t = trSn(one); if (t) e.roots.add(t); }
  if (raw) e.surf.add(norm(translit(raw)));
  // a concept the OT already names (lexicon/reading-concepts.json): Nacham where the verse has
  // שׁוּב for "repent", Rachatz where it has טָבַל for "baptize"
  for (const C of CONCEPTS) {
    const rc = String(raw || '').replace(/[^\u{10900}-\u{10915}]/gu, '');
    const rcc = [...rc].filter(ch => ![...'𐤀𐤅𐤉𐤄'].includes(ch)).join('');
    if (C.hebSn.has('H' + String(sn || '').replace(/^H+/i, '')) || (rcc && C.hebRoot.some(h => rcc.includes(h)))) {
      const t = trSn(C.to); if (t) e.roots.add(t); if (C.form) e.roots.add(norm(C.form));
    }
  }
};
{ // BHS stores a proclitic or suffix as its own row (𐤁 + 𐤅 "in him"): add each run of
  // 2-3 adjacent rows' letters as a surface too, so "baw" is found as written.
  let prev = [], pk = '';
  for (const r of cdb.prepare(`SELECT book_id, chapter, verse, token_ordinal, strongs, word_raw FROM tokens_bhs ORDER BY book_id, chapter, verse, token_ordinal`).iterate()) {
    const k = `${r.book_id}|${r.chapter}|${r.verse}`;
    if (k !== pk) { prev = []; pk = k; }
    if (r.strongs) addTok(r.book_id, r.chapter, r.verse, r.strongs, r.word_raw);
    const raw = String(r.word_raw || '').replace(/[^\u{10900}-\u{10915}]/gu, '');
    if (!raw) { prev = []; continue; }          // maqaf / sof-pasuq end a run
    prev.push(raw); if (prev.length > 3) prev.shift();
    for (let i = 0; i < prev.length - 1; i++) addTok(r.book_id, r.chapter, r.verse, '', prev.slice(i).join(''));
  }
}
let hebFrom = 'tokens_nt';
if (existsSync(INDEX_DB)) {
  try {
    const sdb = new Database(INDEX_DB, { readonly: true });
    for (const r of sdb.prepare(`SELECT book_id, chapter, verse, strongs, word_raw FROM surface_occurrences WHERE source='HEB' AND book_id > 39`).iterate())
      addTok(r.book_id, r.chapter, r.verse, r.strongs, r.word_raw);
    try { for (const r of sdb.prepare(`SELECT canon_id, chapter FROM heb_offsets WHERE offset != 0`).iterate()) drift.add(`${r.canon_id}|${r.chapter}`); } catch {}
    // What the Parallel chips SHOW, not just the bare row: tokens_bhs keeps a pronoun
    // suffix only in its morph (בוֹ is the row 𐤁, אֵלֶיךָ is 𐤀𐤋𐤉) — the bake reconstructs
    // it into the components ("Ala"+"ya"+"k"). Each occurrence's components, joined, is a
    // surface too, and so are runs of 2-3 adjacent occurrences (proclitic rows).
    {
      const comp = new Map();
      for (const t of sdb.prepare(`SELECT source, word_raw, strongs, pos, morph, components FROM token_surfaces`).iterate()) {
        let cs; try { cs = JSON.parse(t.components || '[]'); } catch { continue; }
        // two spellings of one word: the chips' components joined ("w"+"ya"+"bawayaa"+"w"),
        // and the block reading the reading text writes (modform-lib formOf: "WaYaBawayaaw")
        const blk = norm(MF.formOf(cs.filter(x => x && x.paleo)));
        comp.set(`${t.source}\u0000${t.word_raw}\u0000${t.strongs}\u0000${t.pos}\u0000${t.morph}`, [norm(cs.map(x => x.translit || '').join('')), blk]);
      }
      let run = [], rk = '';
      for (const o of sdb.prepare(`SELECT source, book_id, chapter, verse, token_ordinal, word_raw, strongs, pos, morph FROM surface_occurrences ORDER BY source, book_id, chapter, verse, token_ordinal`).iterate()) {
        if (o.source === 'HEB' && o.book_id <= 39) continue;          // OT evidence = BHS
        const k = `${o.source}|${o.book_id}|${o.chapter}|${o.verse}`;
        if (k !== rk) { run = []; rk = k; }
        const j = comp.get(`${o.source}\u0000${o.word_raw}\u0000${o.strongs}\u0000${o.pos}\u0000${o.morph}`);
        if (!j) { run = []; continue; }
        run.push(j); if (run.length > 3) run.shift();
        const e = heb.get(`${o.book_id}|${Math.trunc(+o.chapter)}|${Math.trunc(+o.verse)}`) || (heb.set(`${o.book_id}|${Math.trunc(+o.chapter)}|${Math.trunc(+o.verse)}`, { roots: new Set(), surf: new Set() }), heb.get(`${o.book_id}|${Math.trunc(+o.chapter)}|${Math.trunc(+o.verse)}`));
        for (let i = 0; i < run.length; i++) { e.surf.add(run.slice(i).map(x => x[0]).join('')); e.surf.add(run.slice(i).map(x => x[1]).join('')); }
      }
    }
    sdb.close(); hebFrom = 'surface-index.db';
  } catch (e) { console.warn(`surface-index.db unreadable (${e.message}) — using tokens_nt`); }
}
if (hebFrom === 'tokens_nt') for (const r of cdb.prepare(`SELECT book_id, chapter, verse, strongs, word_raw FROM tokens_nt WHERE book_id > 39`).iterate())
  addTok(r.book_id, r.chapter, r.verse, r.strongs, r.word_raw);
// translation.db keys by the verse's TEXT chapter/verse; the Hebrew by ord_c/ord_v.
const ordOf = new Map();
for (const r of cdb.prepare(`SELECT canon_id c, chapter ch, verse v, ord_c, ord_v FROM verses WHERE corpus='ENG' AND canon_id IS NOT NULL AND ord_c IS NOT NULL`).iterate())
  ordOf.set(`${r.c}|${+r.ch}|${+r.v}`, `${r.c}|${r.ord_c}|${r.ord_v}`);

// Every way of peeling proclitics/preformatives off the front (wa-ya-hayah → yahayah →
// hayah …), one at a time — a greedy regex peels through the root itself.
const PRE = ['wa', 'ha', 'ba', 'la', 'ka', 'ma', 'ya', 'tha', 'sha', 'na', 'a', 'atha'];
const peel = (w) => { const out = new Set([w]); const q = [w];
  while (q.length) { const x = q.pop(); for (const p of PRE) if (x.startsWith(p) && x.length - p.length >= 2) { const y = x.slice(p.length); if (!out.has(y)) { out.add(y); q.push(y); } } }
  return out; };
// The ORIGINAL English of each verse (before any rendering): text_src for canon 40+,
// web-strongs.jsonl for the OT. A "pair" whose word is in it is English, not a gloss
// ("though (they were)"); a capitalised gloss that is a proper noun there is a NAME pair,
// governed by the name-form rules, not by this gate.
const engSrc = new Map();   // "c|ch|v" -> { lower:Set, caps:Set }
const addEng = (k, t) => { const e = { lower: new Set(), caps: new Set() };
  for (const w of String(t || '').match(/[A-Za-z][A-Za-z'’-]*/g) || []) { e.lower.add(w.toLowerCase()); if (/^[A-Z]/.test(w)) e.caps.add(w); }
  engSrc.set(k, e); };
for (const r of cdb.prepare(`SELECT canon_id c, chapter ch, verse v, text_src FROM verses WHERE corpus='ENG' AND canon_id > 39 AND text_src IS NOT NULL AND text_src != ''`).iterate())
  addEng(`${r.c}|${+r.ch}|${+r.v}`, r.text_src);
{
  const codeCanon = new Map(cdb.prepare(`SELECT DISTINCT code, canon_id FROM verses WHERE corpus='ENG' AND canon_id BETWEEN 1 AND 39`).all().map(r => [r.code, r.canon_id]));
  const ws = ['web-strongs.jsonl', 'english-web-raw.jsonl'].map(f => path.join(__dirname, f)).find(existsSync);
  if (ws) for (const line of readFileSync(ws, 'utf8').split('\n')) {
    if (!line.trim()) continue; let j; try { j = JSON.parse(line); } catch { continue; }
    const c = codeCanon.get(j.code); if (c) addEng(`${c}|${+j.chapter}|${+j.verse}`, j.text);
  }
}
const inVerse = (e, word) => {
  if (!e) return false;
  for (const w of peel(word)) {
    if (e.surf.has(w)) return true;
    // same root family either way round: rab ↔ rabah (harbeh), kabad ↔ kabawad
    for (const r of e.roots) if (r && (w === r || (r.length >= 3 && w.startsWith(r)) || (w.length >= 3 && r.startsWith(w)))) return true;
  }
  return false;
};
const PAIR = /\b([A-Za-z][A-Za-z'’-]*)\s+\(([^()]{1,60})\)/g;

/** violations for one verse: [{index, m, word, gloss, why}] */
function check(key, text) {
  const out = [];
  const hk = ordOf.get(key) || key;   // corpus.db's ord_c/ord_v already carry the Hebrew numbering
  const [c, ch, v] = hk.split('|').map(Number);
  const h = heb.get(hk);
  const src = engSrc.get(key);
  // ±2 only where numbering is known to diverge — and for canon 67+, whose Hebrew editions
  // render-corpus itself aligns to the best-agreeing neighbouring verse (pickAlignedTokens).
  const near = (drift.has(`${c}|${ch}`) || c > 66) ? [1, -1, 2, -2].map(d => heb.get(`${c}|${ch}|${v + d}`)) : [];
  // a verse that crosses a chapter boundary (Malachi 4 = MT 3:19-24, 1 Samuel 20:42/21:1 …)
  for (const x of [engToHeb.get(key), engToHeb.get(hk)]) if (x && x !== hk) { const [xc, xch, xv] = x.split('|').map(Number);
    for (const d of [0, 1, -1]) near.push(heb.get(`${xc}|${xch}|${xv + d}`)); }
  for (const m of String(text).matchAll(PAIR)) {
    // "fig-nathan (leaves)": the English half before the last hyphen is not the claim
    const hy = m[1].lastIndexOf('-'); const claim = hy > 0 ? m[1].slice(hy + 1) : m[1];
    const keep = hy > 0 ? m[1].slice(0, hy + 1) : '';
    const word = norm(claim); const g = m[2].trim();
    if (!word || word.length < 2) continue;
    if (/^(masc|fem|pl|sg|m|f)\.?$/i.test(g) || g.split(/\s+/).length > 4) continue;   // an English aside, not a gloss
    if (/^[a-z]/.test(m[1]) && /^[A-Z]/.test(g) && g.split(/\s+/).length > 1) continue;  // "egypt (for he lived …)" — prose
    const supported = inVerse(h, word) || near.some(e => inVerse(e, word));
    const mis = MIS.find(x => x.word === word && words(g).some(w => x.gloss.has(w)));
    if (mis && !supported) { out.push({ index: m.index, m: m[0], word: m[1], keep, gloss: g, why: `misconception: ${mis.why}` }); continue; }
    if (src && hy < 0 && src.lower.has(claim.toLowerCase())) continue;                                   // English, not a transliteration
    if (src && /^[A-Z][a-z'’-]+$/.test(g) && src.caps.has(g) && !src.lower.has(g.toLowerCase())) continue;   // a name pair
    if (names.has(word) || !h || supported) continue;
    out.push({ index: m.index, m: m[0], word: m[1], keep, gloss: g, why: `"${claim}" is no Hebrew word in ${hk.replace(/\|/g, ':')}` });
  }
  return out;
}
// "word (gloss)" -> "gloss", right to left so indices hold. Returns { text, removedAt:[token positions] }
function unwrap(text, vs) {
  let s = text; const removedAt = [];
  for (const x of [...vs].sort((a, b) => b.index - a.index)) {
    removedAt.push(s.slice(0, x.index).split(/\s+/).filter(Boolean).length);
    s = s.slice(0, x.index) + (x.keep || '') + x.gloss + s.slice(x.index + x.m.length);   // "fig-nathan (leaves)" -> "fig-leaves"
  }
  return { text: s, removedAt };
}

const violations = [];   // printable, fatal
const review = [];       // fieldy's saved verses — listed, not fatal unless --saved-fatal
let fixedCorpus = 0, fixedTrans = 0, fixedSaved = 0, linkRows = 0;
// corpus.db ENG — machine text throughout
{
  const rows = cdb.prepare(`SELECT id, canon_id c, chapter ch, verse v, text FROM verses WHERE corpus='ENG' AND canon_id IS NOT NULL AND text IS NOT NULL`).all();
  const upd = FIX ? cdb.prepare(`UPDATE verses SET text = ? WHERE id = ?`) : null;
  cdb.transaction(() => {
    for (const r of rows) {
      const key = `${r.c}|${+r.ch}|${+r.v}`;
      const vs = check(key, r.text); if (!vs.length) continue;
      if (FIX) { upd.run(unwrap(r.text, vs).text, r.id); fixedCorpus++; continue; }
      for (const x of vs) violations.push(`corpus ${key.replace(/\|/g, ':')}  "${x.m}"  — ${x.why}`);
    }
  })();
}
// translation.db — what the reader serves
if (existsSync(TRANS_DB)) {
  const tdb = new Database(TRANS_DB, { readonly: !FIX });
  const rows = tdb.prepare(`SELECT book_id c, chapter ch, verse v, status, text, coalesce(rich_text,'') rt FROM translations WHERE text IS NOT NULL AND text != ''`).all();
  const upd = FIX ? tdb.prepare(`UPDATE translations SET text = ?, original_text = CASE WHEN original_text = ? THEN ? ELSE original_text END WHERE book_id = ? AND chapter = ? AND verse = ?`) : null;
  const linkSel = tdb.prepare(`SELECT id, english_indices FROM translation_links WHERE book_id = ? AND chapter = ? AND verse = ?`);
  const linkUpd = FIX ? tdb.prepare(`UPDATE translation_links SET english_indices = ? WHERE id = ?`) : null;
  const savedUpd = FIX ? tdb.prepare(`UPDATE translations SET text = ?, rich_text = ?, updated_at = datetime('now') WHERE book_id = ? AND chapter = ? AND verse = ?`) : null;
  const histIns = FIX ? tdb.prepare(`INSERT INTO translation_history (book_id, chapter, verse, status, text, rich_text, saved_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`) : null;
  tdb.transaction(() => {
    for (const r of rows) {
      const key = `${r.c}|${+r.ch}|${+r.v}`;
      const vs = check(key, r.text).filter(x => !ACCEPT[`${key.replace(/\|/g, ':')}|${x.m}`]); if (!vs.length) continue;
      const seeded = (r.status || 'none') === 'none' && !r.rt;
      // A KNOWN misconception is removed even from a saved verse: the wrong Hebrew word
      // goes, fieldy's English stays ("hamah (like)" -> "like"), a history row keeps it reversible.
      if (FIX && !seeded) {
        const mis = vs.filter(x => x.why.startsWith('misconception'));
        if (mis.length) {
          const u = unwrap(r.text, mis);
          const rich = r.rt ? mis.reduce((t, x) => t.split(x.m).join((x.keep || '') + x.gloss), r.rt) : r.rt;
          histIns.run(r.c, r.ch, r.v, r.status, r.text, r.rt);
          savedUpd.run(u.text, rich, r.c, r.ch, r.v); fixedSaved++;
          for (const l of linkSel.all(r.c, r.ch, r.v)) {
            let ix; try { ix = JSON.parse(l.english_indices || '[]'); } catch { continue; }
            const nix = ix.map(i => i - u.removedAt.filter(p => p < i).length);
            if (JSON.stringify(nix) !== JSON.stringify(ix)) { linkRows++; linkUpd.run(JSON.stringify(nix), l.id); }
          }
          vs.splice(0, vs.length, ...vs.filter(x => !mis.includes(x)));
          if (!vs.length) continue;
        }
      }
      if (FIX && seeded) {
        const u = unwrap(r.text, vs);
        upd.run(u.text, r.text, u.text, r.c, r.ch, r.v); fixedTrans++;
        for (const l of linkSel.all(r.c, r.ch, r.v)) {
          let ix; try { ix = JSON.parse(l.english_indices || '[]'); } catch { continue; }
          const nix = ix.map(i => i - u.removedAt.filter(p => p < i).length);
          if (JSON.stringify(nix) !== JSON.stringify(ix)) { linkRows++; linkUpd.run(JSON.stringify(nix), l.id); }
        }
        continue;
      }
      for (const x of vs) {
        const line = `translation ${key.replace(/\|/g, ':')}${seeded ? '' : '  [YOUR SAVED VERSE — fix in the Studio, or sign it off in lexicon/gloss-gate-accepted.json]'}  "${x.m}"  — ${x.why}`;
        if (!seeded && !SAVED_FATAL && !x.why.startsWith('misconception')) review.push(line); else violations.push(line);
      }
    }
  })();
  tdb.close();
} else console.log(`  (no translation.db at ${TRANS_DB} — reader rows not checked)`);

console.log(`verify-reading-glosses: Hebrew from tokens_bhs + ${hebFrom}; ${MIS.length} misconception rule(s); ${drift.size} chapters with known versification drift (±2 allowed there only)`);
if (FIX) console.log(`  --fix: unwrapped unsupported glosses in ${fixedCorpus.toLocaleString()} corpus verse(s), ${fixedTrans.toLocaleString()} reader verse(s); removed known misconceptions from ${fixedSaved} saved verse(s) (history kept); ${linkRows} link row(s) re-indexed`);
if (OUT) writeFileSync(OUT, violations.concat(review).join('\n') + '\n');
if (review.length) {
  try { writeFileSync(REVIEW, `# verify-reading-glosses — glossed words in YOUR SAVED verses that are not in that verse's Hebrew (${new Date().toISOString()})\n# Fix each in the Studio, or sign a deliberate one off in lexicon/gloss-gate-accepted.json as "ref|pair": "why".\n` + review.join('\n') + '\n'); } catch {}
  console.log(`  ⚠ ${review.length} glossed word(s) in your SAVED verses disagree with their Hebrew — listed in ${REVIEW}${SAVED_FATAL ? '' : ' (not fatal until --saved-fatal)'}`);
}
if (violations.length) {
  for (const v of violations.slice(0, 120)) console.error('  ✗ ' + v);
  if (violations.length > 120) console.error(`  ✗ … ${violations.length - 120} more${OUT ? ` (all in ${OUT})` : ''}`);
  if (REPORT) { console.log(`[report-only] ${violations.length} violation(s)`); process.exit(0); }
  die(`${violations.length} glossed word(s) disagree with the verse's Hebrew.${FIX ? '' : ` Machine rows: node verify-reading-glosses.mjs ${CORPUS_DB} ${TRANS_DB} ${INDEX_DB} --fix`}`);
}
console.log('✓ every glossed word is in its verse\'s Hebrew');
process.exit(0);
