// renumber-forms-lib.mjs — the HARD gate for spellings retired by a Strong's renumber.
//
// WHY (fieldy, 2026-10-01, Isaiah 4:1 "Shabai (seven) ashah (wife / individual woman)"):
// "the 'ashah' regression crept back into my rendered text — the gate must be harder.
//  Ashah = 'fire of'. Ayashah = 'individual woman / wife'."
// H802 (woman) was moved off the fire root 𐤀𐤔𐤄 onto 𐤀𐤉𐤔𐤄 Ayashah and renumbered H378a
// (2026-08-22). The render has been right since; the stale spelling survived in
// translation.db because the 2026-09-11 clobber repair restored rich_text written in
// August — so a machine snapshot from before the fix came back as if hand-translated,
// and every rule that protects hand work kept it. Nothing checked the spelling itself.
//
// THE RULE, derived from lexicon/strongs-renumber.json — no word typed here:
//   every entry with `raw_root` retires translit(raw_root) ("ashah", "bath") for that
//   word; its spelling is translit(strongs-roots[to]) ("ayashah", "banath"). The old
//   transliteration stays legal ONLY for the other Strong's numbers that still own
//   raw_root (𐤀𐤔𐤄 = H800/H801, fire). So "ashah (…)" is WRONG when
//     • its gloss is the renumbered word's meaning (wife/woman…, from `gloss_words` or
//       the lexicon gloss of the new root), unless the verse's Hebrew has a fire word
//       and no woman word; or
//     • the verse's Hebrew (±2 verses, versification drift) has the renumbered word and
//       no word that owns raw_root.
//   Evidence is the verse's own Hebrew: tokens_bhs (OT) and tokens_nt (NT/Apocrypha).
//
// Used by fix-name-forms.mjs (respells: "ashah (wife…)" → "ayashah (wife…)", gloss and
// case kept — applies to hand-saved verses too, it is a spelling, not a wording) and by
// verify-name-forms.mjs (fails the deploy on any survivor).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (s) => String(s || '').toLowerCase().match(/[a-z]{3,}/g) || [];

async function loadTranslit() {
  const p = ['../src/lib/books.js', './vendor/books.js', './src/lib/books.js']
    .map(x => path.join(__dirname, x)).find(existsSync);
  if (!p) throw new Error('renumber-forms: books.js (translit) not found');
  const m = await import(pathToFileURL(p).href);
  if (typeof m.translit !== 'function') throw new Error(`renumber-forms: ${p} has no translit()`);
  return m.translit;
}

/** db: an open better-sqlite3 handle on corpus.db (for the Hebrew evidence). */
export async function loadRenumberForms(db) {
  const lex = (f) => JSON.parse(readFileSync(path.join(__dirname, 'lexicon', f), 'utf8'));
  const renumber = lex('strongs-renumber.json');
  const roots = lex('strongs-roots.json');
  let lexicon = {}; try { lexicon = lex('lexicon.json'); } catch { /* glosses optional */ }
  const translit = await loadTranslit();
  const forms = [];
  for (const [from, e] of Object.entries(renumber)) {
    if (from.startsWith('_') || !e || !e.raw_root || !e.to) continue;
    const newRoot = roots[e.to] || roots[from];
    if (!newRoot || newRoot === e.raw_root) continue;
    const oldTr = String(translit(e.raw_root)).toLowerCase();
    const newTr = String(translit(newRoot)).toLowerCase();
    if (!oldTr || oldTr === newTr) continue;
    const owners = Object.keys(roots).filter(k => roots[k] === e.raw_root && k !== from && k !== e.to);
    const gl = new Set(e.gloss_words || words(lexicon[newRoot]));
    forms.push({ from, to: e.to, oldTr, newTr, owners, gloss: gl,
                 re: new RegExp(`\\b(${esc(oldTr)})(\\s*\\(([^()]*)\\))`, 'gi') });
  }
  // Hebrew evidence: which verses carry the renumbered word / an owner of the old root,
  // and which verses have any Hebrew at all.
  const want = [...new Set(forms.flatMap(f => [f.from, f.to, ...f.owners]))];
  const sn = new Map();       // "b|c|v" -> Set(SN)
  const anyHeb = new Set();   // "b|c|v"
  if (db && want.length) {
    const ph = want.map(() => '?').join(',');
    for (const t of ['tokens_bhs', 'tokens_nt']) {
      try {
        for (const r of db.prepare(`SELECT book_id b, chapter c, verse v, strongs s FROM ${t} WHERE strongs IN (${ph})`).iterate(...want)) {
          const k = `${r.b}|${Math.trunc(Number(r.c))}|${Math.trunc(Number(r.v))}`;
          if (!sn.has(k)) sn.set(k, new Set());
          sn.get(k).add(r.s);
        }
        for (const r of db.prepare(`SELECT DISTINCT book_id b, chapter c, verse v FROM ${t}`).iterate())
          anyHeb.add(`${r.b}|${Math.trunc(Number(r.c))}|${Math.trunc(Number(r.v))}`);
      } catch { /* table absent in this db — no evidence from it */ }
    }
  }
  return { forms, sn, anyHeb };
}

function evidence(RF, b, c, v) {
  const s = new Set(); let heb = false;
  for (let d = -2; d <= 2; d++) {
    const k = `${b}|${c}|${v + d}`;
    if (RF.anyHeb.has(k)) heb = true;
    const x = RF.sn.get(k); if (x) for (const y of x) s.add(y);
  }
  return { s, heb };
}

/** Returns { fixed, hits:[{text, fix, why}] } for one verse's text. */
export function checkRenumbered(text, ref, RF) {
  if (!text || !RF.forms.length) return { fixed: text, hits: [] };
  const [b, c, v] = String(ref).split(':').map(n => Math.trunc(Number(n)));
  const ev = evidence(RF, b, c, v);
  const hits = [];
  let out = text;
  for (const f of RF.forms) {
    f.re.lastIndex = 0;
    out = out.replace(f.re, (m, word, tail, gloss) => {
      const hasFrom = ev.s.has(f.from) || ev.s.has(f.to);
      const hasOwner = f.owners.some(o => ev.s.has(o));
      const glossHit = words(gloss).some(w => f.gloss.has(w));
      let why = null;
      if (glossHit && !(hasOwner && !hasFrom)) why = `"${f.oldTr}" glossed as ${f.from}'s meaning — that word is ${f.newTr} (${f.to})`;
      else if (ev.heb && hasFrom && !hasOwner) why = `verse Hebrew has ${f.from} (${f.newTr}) and no ${f.owners.join('/')} — "${f.oldTr}" is not in this verse`;
      if (!why) return m;
      const fixWord = word[0] === word[0].toUpperCase() ? f.newTr[0].toUpperCase() + f.newTr.slice(1) : f.newTr;
      hits.push({ text: m, fix: fixWord + tail, why });
      return fixWord + tail;
    });
  }
  return { fixed: out, hits };
}
