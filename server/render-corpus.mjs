// render-corpus.mjs — ONE idempotent render of the untagged corpus (NT + Apocrypha +
// pseudepigrapha) from an immutable source into the display text. Safe to re-run; when
// you change a rule and rebuild from source, stale renderings disappear cleanly.
//
//   node render-corpus.mjs --check       inspect schema + whether text is already rendered, then exit
//   node render-corpus.mjs --init-src    add + populate immutable text_src column, then exit
//   node render-corpus.mjs               report only (dry run), renders IN PLACE from text
//   node render-corpus.mjs --from-src    render FROM text_src (true rebuild) — requires --init-src first
//   node render-corpus.mjs --apply       write the rendered text
//   node render-corpus.mjs --min-canon N where "untagged" starts (default 40; OT 1-39 is rendered
//                                        from Hebrew by apply-web-strongs.mjs, not here)
//
// WHY A SOURCE COLUMN
//   Rendering is a pure function:  text = render(source, rules). With --from-src the source is
//   the immutable text_src column, so re-running after ANY rule change fully rebuilds — no
//   double glosses, no leftover spellings. Without it, it renders in place; the pass is a
//   gloss-guarded fixed point (safe to repeat), but a CHANGED rule won't revert an OLD
//   rendering — only a rebuild from text_src does that. Run --init-src ONCE (ideally right
//   after seeding pristine English) to get the full rebuild-from-scratch behaviour.
//
// RULE ORDER (one guarded pass, longest-first, existing "(glosses)" protected):
//   un-double -> guard glosses -> theonyms (God/Lord/the Lord ...) -> phrases -> names
//   -> peoples (glossed) -> terms (glossed, case-insensitive; capital carried onto translit
//   AND gloss so "the Word" -> "the Dabar (Word)"). Theonyms/names render BARE.

import { readFileSync, existsSync } from 'node:fs';
import { loadVerseExceptions, renderWithExceptions } from './render-verse-exceptions.mjs';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const CHECK    = args.includes('--check');
const INIT_SRC = args.includes('--init-src');
const RESET_SRC = args.includes('--reset-src');
const FROM_SRC = args.includes('--from-src');
const APPLY    = args.includes('--apply');
const MIN_CANON = Number(argv('--min-canon', 40));
const die = m => { console.error('\u2717 ' + m); process.exit(1); };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let Database;
try { ({ default: Database } = await import('better-sqlite3')); }
catch { die('better-sqlite3 not found — run from server/'); }
if (!existsSync('./corpus.db')) die('corpus.db not found — run from server/');

// Hoisted to top level (this file already uses top-level await for
// better-sqlite3 above) rather than awaited inside the verse-gloss IIFE below,
// which is a plain synchronous arrow function — `await` inside it is a
// SyntaxError, not a runtime one. books.js is ESM, so a dynamic import is
// still needed (no synchronous require() of an ESM module).
let translitBooksJs = null;
{
  const booksPath = ['../src/lib/books.js', './src/lib/books.js'].find(existsSync);
  if (booksPath) {
    const mod = await import(new URL(booksPath, import.meta.url).href);
    if (typeof mod.translit === 'function') translitBooksJs = mod.translit;
  }
}
// Same bare-root policy as apply-web-strongs.mjs / the verse-gloss pass below:
// the reading text always shows translit(ROOTS[sn]), never a baked token's own
// component translit (that reflects THIS verse's inflected surface — legitimate
// for the chip/component-breakdown view, wrong here). Hoisted to top level so
// step 1b's TOK_TR (applyLinks) can share it too — see 2026-07-27 fix below.
const ROOTS_PATH = ['./lexicon/strongs-roots.json', './strongs-roots.json'].find(existsSync);
const ROOTS = ROOTS_PATH ? JSON.parse(readFileSync(ROOTS_PATH, 'utf8')) : {};

// ---- OT book codes (never touched here; they render from Hebrew) --------------------
const OT_CODES = "'GEN','EXOD','LEV','NUM','DEUT','JOSH','JUDG','RUTH','1SAM','2SAM','1KGS','2KGS','1CHR','2CHR','EZRA','NEH','EST','JOB','PSA','PROV','ECCL','SONG','ISA','JER','LAM','EZK','DAN','HOS','JOEL','AMO','OBA','JONAH','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL'";
const untaggedWhere = `corpus='ENG' AND text IS NOT NULL AND TRIM(text)<>'' AND (
    (canon_id IS NOT NULL AND canon_id >= ?) OR (canon_id IS NULL AND code NOT IN (${OT_CODES})))`;

// ================= --check ==========================================================
if (CHECK) {
  const db = new Database('./corpus.db', { readonly: true });
  const cols = db.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);
  console.log('verses columns:', cols.join(', '));
  console.log('has text_src column:', cols.includes('text_src') ? 'YES' : 'no');
  const n = db.prepare(`SELECT COUNT(*) c FROM verses WHERE ${untaggedWhere}`).get(MIN_CANON).c;
  // "rendered" heuristic: a translit followed by an English gloss "(word)"
  const rendered = db.prepare(`SELECT COUNT(*) c FROM verses WHERE ${untaggedWhere}
      AND text GLOB '*[a-z] ([a-z]*)*'`).get(MIN_CANON).c;
  // doubling heuristic: "xxx (xxx (...))"
  let doubles = 0;
  for (const r of db.prepare(`SELECT text FROM verses WHERE ${untaggedWhere}`).all(MIN_CANON))
    if (/\b([a-z][a-z']*)\s+\(\1\s+\(/.test(r.text)) doubles++;
  console.log(`untagged ENG rows (canon>=${MIN_CANON} or non-OT null): ${n.toLocaleString()}`);
  console.log(`  look already rendered (have "translit (gloss)"): ${rendered.toLocaleString()}`);
  console.log(`  contain DOUBLING "x (x (…))": ${doubles.toLocaleString()}`);
  console.log('\nRead-out:');
  console.log(cols.includes('text_src')
    ? '  text_src exists — use --from-src for clean rebuilds.'
    : '  No text_src yet. If rows above look already-rendered, your pristine English is NOT');
  if (!cols.includes('text_src'))
    console.log('  in the DB; re-seed pristine text first, THEN --init-src to capture it. If they look\n  pristine, --init-src now captures them safely.');
  db.close();
  process.exit(0);
}

// ================= load rule sets ===================================================
// --no-verse-gloss turns off the verse-aligned pass (step 5b) and restores the
// previous behaviour exactly. It is ON by default whenever the two inputs it
// needs are present, because a missing gloss is the thing this is here to fix.
const NO_VERSE_GLOSS = process.argv.includes('--no-verse-gloss');

const readLines = f => existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/) : [];
const M = existsSync('./word-map.json') ? JSON.parse(readFileSync('./word-map.json', 'utf8'))
  : die('word-map.json not found — run apply-web-strongs.mjs first');
const EXP = existsSync('./name-map-expanded.json')
  ? JSON.parse(readFileSync('./name-map-expanded.json', 'utf8')) : { theonyms: {} };

// Verse-scoped exact-phrase protection — see render-verse-exceptions.mjs for why this
// exists (e.g. Apoc. Ab. 5:4's "GOD BARISAT" idol inscription, not a name of YHWH).
// Applied around every render() call below so a fixed false positive can never come
// back on a baseline reset.
const VERSE_EXCEPTIONS = loadVerseExceptions('./render-verse-exceptions.json');
if (VERSE_EXCEPTIONS.size) console.log(`verse exceptions: ${VERSE_EXCEPTIONS.size} verse(s) with protected phrases`);

// THEONYMS: your file's table + the layered rules you set (the Lord=YHWH in these texts).
const THEO = {
  ...(EXP.theonyms || {}),
  'the Lord God': 'Yahawah Alahayam', 'The Lord God': 'Yahawah Alahayam',
  'the LORD God': 'Yahawah Alahayam', 'The LORD God': 'Yahawah Alahayam',
  'Lord God': 'Yahawah Alahayam',
  'the Lord': 'Yahawah', 'The Lord': 'Yahawah', 'the LORD': 'Yahawah', 'The LORD': 'Yahawah',
};
// divine-phrases.txt ("Most High => Ilayawan") — multi-word titles, added to the theonym table
for (const line of readLines('./divine-phrases.txt')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const [eng, tr] = t.split(/\s*=>\s*/); if (eng && tr) THEO[eng] = tr;
}
const theoKeys = Object.keys(THEO).sort((a, b) => b.length - a.length);
const THEO_RE = new RegExp('\\b(' + theoKeys.map(esc).join('|') + ")('['\u2019']?s)?\\b", 'g'); // CASE-SENSITIVE

// NAMES / PEOPLE (bare / glossed) — from the OT-derived map + your explicit files
const NAME = new Map(), PEOPLE = new Map(), TERM = new Map();
const NAME_SN = new Map(), ALIAS = new Map();
for (const line of readLines('./name-strongs.txt')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const [name, sn] = t.split(/\s*->\s*|\s{2,}|\t/);
  if (name && sn && /^H?\d+$/i.test(sn.trim())) NAME_SN.set(name.toLowerCase(), 'H' + sn.trim().replace(/^H/i, ''));
}
for (const line of readLines('./name-aliases.txt')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const [v, o] = t.split(/\s*->\s*|\s{2,}|\t/); if (v && o) ALIAS.set(v.toLowerCase(), o.toLowerCase());
}
for (const [eng, tr] of Object.entries(M.names || {})) NAME.set(eng, tr);
// name-forms.txt: manual pins, read AFTER the auto-map so they can override it
// (or add an entry the auto-map deliberately excluded as ambiguous). Survives
// every word-map.json regeneration — see name-forms.txt's own header comment
// for why (added 2026-07-27, the Salmon/Solomon "Shalamah" collision).
for (const line of readLines('./name-forms.txt')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  // Match term-forms.txt's own convention exactly (/\s+/, first two tokens,
  // trailing "# H1234" comment dropped by destructuring) rather than
  // requiring a literal tab — a stricter delimiter here silently failed to
  // parse the salmon pin the first time (2026-07-27).
  const [w, f] = t.split(/\s+/); if (w && f) NAME.set(w.toLowerCase(), f);
}
for (const [eng, tr] of Object.entries(M.peoples || {})) PEOPLE.set(eng, tr);
// terms: OT-derived, minus your excludes, PLUS your exact form-pins (read directly so
// form-pins take effect on the next render without rebuilding the whole OT map).
const TERM_EXCLUDE = new Set(readLines('./term-exclude.txt').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')));
for (const [eng, tr] of Object.entries(M.terms || {})) if (!TERM_EXCLUDE.has(eng)) TERM.set(eng, tr);
for (const line of readLines('./term-forms.txt')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const [w, f] = t.split(/\s+/); if (w && f && !TERM_EXCLUDE.has(w.toLowerCase())) TERM.set(w.toLowerCase(), f);
}
// term-caps.txt — the ONLY terms allowed to render when Capitalized (title-words that
// double as proper nouns, e.g. "Word" the Logos -> "Dabar (Word)"). Everything else
// capitalized is treated as a proper noun and left for the name pass, so "Adam" stays
// a bare name and is never glossed as the term "adam".
const CAPS_OK = new Set(readLines('./term-caps.txt').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')));
// names that collide with ordinary capitalized English are left alone (theonyms handle god/lord)
const NEVER_NAME = new Set(['most','high','holy','one','see','are','man','day','way','word','good','light',
  'rest','fear','love','peace','king','head','hand','name','set','well','said','father','son','mother',
  'brother','sister','house','city','land','east','west','north','south','great','all','new','old','third',
  'first','second','god','lord','the','and','but','for']);
for (const w of NEVER_NAME) { NAME.delete(w); PEOPLE.delete(w); }
const COMMON = new Set(['on','in','at','of','to','it','is','he','she','an','or','as','so','no','do','am','go',
  'us','by','if','up','be','my','we','me','ah','oh','ye','lo','ho','ok','a','i','o','un','ab','el','al','en']);

console.log(`rules: ${theoKeys.length} theonyms, ${NAME.size} names, ${PEOPLE.size} peoples, ${TERM.size} terms`);

// ================= VERSE-ALIGNED GLOSSING (step 5b) =================================
// Term pins are GLOBAL: one transliteration per English word for the whole corpus,
// chosen from Strong's frequency with no reference to which Hebrew word actually
// stands in the verse being rendered. The English baseline and the HEB edition are
// independent texts, so a global pin regularly names a DIFFERENT Hebrew word than
// the one aligned beside it — Matthew 1:1 showed "the genealogy" unglossed while
// 𐤕𐤅𐤋𐤃𐤕 sat in the Hebrew column of that same verse.
//
// This pass closes that. For each still-plain English word it looks for a Strong's
// that OCCURS IN THAT VERSE'S HEBREW and whose kjv_def covers the word, and glosses
// with THAT token's transliteration. Per-occurrence, and guaranteed to name Hebrew
// that is actually present.
//
// Runs LAST, so curated theonyms, names, peoples and term pins all still win. It
// only ever fills words that would otherwise stay plain English.
const VG = { verses: new Map(), english: new Map(), on: false };
if (!NO_VERSE_GLOSS) (() => {
  const IDX = './surface-index.db';
  if (!existsSync(IDX)) { console.log('verse-gloss: surface-index.db not found — skipping (build it with --heb)'); return; }
  let dict = null;
  for (const f of ['./strongs-hebrew-expanded.json', './lexicon/strongs-hebrew-expanded.json',
                   './strongs-hebrew.json', './lexicon/strongs-hebrew.json']) {
    if (existsSync(f)) { try { dict = JSON.parse(readFileSync(f, 'utf8')); break; } catch { /* next */ } }
  }
  if (!dict) { console.log('verse-gloss: no Strong\'s dictionary found — skipping'); return; }

  // fieldy 2026-07-27: "make my parallel/novel english show strictly my
  // transliteration of the strongs characters of the word... ensure the base
  // root word is consistent." Always compute the transliteration fresh from
  // strongs-roots.json's bare lemma for the Strong's number, not from a baked
  // token's components (which reflect THAT verse's own inflected surface, and
  // vary token to token even for the same SN). Same fix, same reasoning, as
  // apply-web-strongs.mjs's rootPaleo change the same day.
  // ROOTS/translit are now shared top-level (see 2026-07-27 note near
  // translitBooksJs above) — no need to reload them here.
  const translit = translitBooksJs;
  if (!ROOTS_PATH) console.log('verse-gloss: strongs-roots.json not found — glosses will be skipped');
  if (!translit) console.log('verse-gloss: books.js translit() not found — glosses will be skipped');

  // Strong's -> the English words its kjv_def covers (single words only; a term
  // gloss replaces one word). kjv_def lists are ALPHABETICAL, so position carries
  // no meaning and is not used.
  const norm = sn => 'H' + String(sn).replace(/^H+/i, '');
  for (const [rawSn, e] of Object.entries(dict)) {
    const def = typeof e === 'string' ? e : (e && (e.kjv_def || e.strongs_def || e.def));
    if (!def) continue;
    const sn = norm(rawSn);
    for (const piece of String(def).split(/[,;]/)) {
      const word = piece.replace(/\([^)]*\)/g, ' ').replace(/[^A-Za-z\s'-]/g, ' ').trim().toLowerCase();
      if (!/^[a-z][a-z'-]{2,}$/.test(word)) continue;
      if (!VG.english.has(word)) VG.english.set(word, new Set());
      VG.english.get(word).add(sn);
    }
  }

  // that verse's Hebrew: which Strong's numbers are actually present, per token.
  // The transliteration itself comes from ROOTS/translit above (the bare lemma),
  // NOT from this token's own baked components — see the note above for why.
  const idx = new Database(IDX, { readonly: true });
  const hasSource = (() => { try { idx.prepare('SELECT source FROM token_surfaces LIMIT 1').get(); return true; } catch { return false; } })();
  if (!hasSource) { console.log('verse-gloss: surface-index has no `source` column — rebuild with --heb'); idx.close(); return; }
  let n = 0;
  for (const r of idx.prepare(`
      SELECT DISTINCT o.book_id, o.chapter, o.verse, o.token_ordinal, t.strongs
      FROM surface_occurrences o
      JOIN token_surfaces t ON t.word_raw = o.word_raw AND t.source = o.source
           AND t.strongs = o.strongs AND t.pos = o.pos AND t.morph = o.morph
      WHERE o.source = 'HEB'
      ORDER BY o.book_id, o.chapter, o.verse, o.token_ordinal`).all()) {
    if (!r.strongs || !translit) continue;
    const sn = 'H' + String(r.strongs).replace(/^H+/i, '');
    const canonical = ROOTS[sn];
    if (!canonical) continue;
    const tr = translit(canonical).trim();
    if (!tr) continue;
    const key = `${r.book_id}|${r.chapter}|${r.verse}`;
    if (!VG.verses.has(key)) VG.verses.set(key, []);
    VG.verses.get(key).push({ sn, tr });
    n++;
  }
  idx.close();
  VG.on = VG.verses.size > 0;
  console.log(`verse-gloss: ${VG.verses.size.toLocaleString()} verses of Hebrew, ${n.toLocaleString()} tokens, ` +
              `${VG.english.size.toLocaleString()} English words reachable through kjv_def`);
})();

// Explicit term -> Strong's pins, used to validate a term against the Hebrew of
// the verse being rendered.
const TERM_SN = new Map();
for (const line of readLines('./term-strongs.txt')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const [w, sn] = t.split(/\s+/);
  if (w && sn) TERM_SN.set(w.toLowerCase(), 'H' + sn.replace(/^H+/i, ''));
}

// ================= HEBREW-DRIVEN GLOSSING (step 1b) ==================================
// The authoritative pass. A translation_link says "these English words correspond
// to this Hebrew token"; we put that token's TRANSLITERATION in front of fieldy's
// OWN wording. Nothing here consults kjv_def, so no dictionary vocabulary reaches
// the text — "became the father of" stays exactly that, gaining only a "yalad (…)"
// in front of it.
//
// Runs FIRST, before every English-driven rule, because the Hebrew is the source
// of truth and a term pin must not get there ahead of it. Its output is then
// guarded like any pre-existing gloss, so the later passes leave it alone.
const LINKS = new Map();      // "canon|ch|v" -> [{ ords:[], eng:[], tr }]
if (!NO_VERSE_GLOSS) (() => {
  const dbFile = ['./translation.db', './corpus.db', './translations.db'].find(f => existsSync(f));
  if (!dbFile) return;
  let ldb;
  try { ldb = new Database(dbFile, { readonly: true }); ldb.prepare('SELECT 1 FROM translation_links LIMIT 1').get(); }
  catch { if (ldb) ldb.close(); console.log('links: translation_links not found — skipping the Hebrew-driven pass'); return; }
  const rows = ldb.prepare(`SELECT book_id, chapter, verse, english_indices, token_ordinals FROM translation_links`).all();
  ldb.close();
  let n = 0;
  for (const r of rows) {
    let eng = [], ords = [];
    try { eng = JSON.parse(r.english_indices || '[]'); } catch { continue; }
    try { ords = JSON.parse(r.token_ordinals || '[]'); } catch { continue; }
    if (!eng.length || !ords.length) continue;
    const key = `${r.book_id}|${r.chapter}|${r.verse}`;
    if (!LINKS.has(key)) LINKS.set(key, []);
    LINKS.get(key).push({ eng: eng.slice().sort((a, b) => a - b), ord: ords[0] });
    n++;
  }
  console.log(`links: ${n.toLocaleString()} spans across ${LINKS.size.toLocaleString()} verses (${dbFile})`);
})();

// token ordinal -> transliteration, per verse.
// Fixed 2026-07-27: this used to read comps.find(c => c.css === 'root').translit
// straight off the baked token_surfaces row — the SAME "read a baked component
// for the reading text" mistake already fixed in apply-web-strongs.mjs and the
// verse-gloss pass below, just in a THIRD spot the original audit missed
// (applyLinks/step 1b runs FIRST and its output is guarded as untouchable, so
// this one silently overrode every other fix). Two concrete bugs this caused:
//   - Matthew 1:7 "father" (H1): baked root component read "Abaya" (a fuller,
//     construct-suffixed chip reconstruction — correct for the chip view) where
//     the bare root is just "Ab".
//   - Matthew 1:6 "Solomon" (H8010, fused with the 𐤀𐤕/H853 direct-object
//     marker via the tokens_nt fallback added earlier today): comps.find(c =>
//     c.css==='root') picked the PREFIX's own root-tagged component ("Ath")
//     instead of Solomon's, because the fallback concatenated the prefix's own
//     attested components (which self-identify as their own root when standing
//     alone) ahead of the stem's without demoting either — two components both
//     claiming css:'root' in one word. Bypassing components entirely and
//     computing translit(ROOTS[sn]) directly sidesteps that bug too, the same
//     way it already does for the verse-gloss pass.
const TOK_TR = new Map();     // "canon|ch|v" -> Map(ordinal -> translit)
if (LINKS.size) (() => {
  if (!existsSync('./surface-index.db')) return;
  if (!translitBooksJs) { console.log('links: books.js translit() not found — TOK_TR skipped'); return; }
  const idx = new Database('./surface-index.db', { readonly: true });
  try {
    for (const r of idx.prepare(`
        SELECT o.book_id, o.chapter, o.verse, o.token_ordinal, o.strongs, o.pos
        FROM surface_occurrences o
        WHERE o.source = 'HEB'`).all()) {
      if (r.pos === 'conj' || r.pos === 'art') continue;
      if (!r.strongs) continue;
      const sn = 'H' + String(r.strongs).replace(/^H+/i, '');
      const canonical = ROOTS[sn];
      if (!canonical) continue;
      const tr = translitBooksJs(canonical).trim();
      // Defence in depth: even if a link points at a conjunction or a bare
      // proclitic, a one-letter transliteration is never a usable gloss.
      // "Shalamah w (became) the father of" is the failure this prevents.
      if (!tr || tr.length < 2) continue;
      const key = `${r.book_id}|${r.chapter}|${r.verse}`;
      if (!TOK_TR.has(key)) TOK_TR.set(key, new Map());
      TOK_TR.get(key).set(r.token_ordinal, tr);
    }
  } catch (e) { console.log(`links: could not read the HEB bake (${e.message})`); }
  idx.close();
})();

// The SAME tokenisation build-align-links used, but keeping character offsets so a
// span can be replaced in the original string. If these two ever disagree, every
// english_indices value silently points at the wrong word — so it is one regex,
// written once, mirrored deliberately.
const LINK_TOKEN_RE = /[A-Za-z\u00C0-\u024F'-]+/g;
function tokensWithPos(text) {
  const out = []; let m; LINK_TOKEN_RE.lastIndex = 0;
  while ((m = LINK_TOKEN_RE.exec(text)) !== null) out.push({ w: m[0], s: m.index, e: m.index + m[0].length });
  return out;
}

// kjv_def carries BASE forms; the English text carries inflected ones.
const VG_IRREG = new Map(Object.entries({
  saw:'see', seen:'see', heard:'hear', made:'make', went:'go', gone:'go', said:'say',
  took:'take', taken:'take', gave:'give', given:'give', came:'come', knew:'know',
  known:'know', spoke:'speak', spoken:'speak', wrote:'write', written:'write',
  ate:'eat', eaten:'eat', fell:'fall', fallen:'fall', found:'find', held:'hold',
  kept:'keep', left:'leave', sent:'send', built:'build', brought:'bring',
  taught:'teach', thought:'think', sought:'seek', fought:'fight', stood:'stand',
  told:'tell', sold:'sell', men:'man', women:'woman', children:'child', feet:'foot',
  lives:'life', wives:'wife', sat:'sit', led:'lead', fled:'flee', drew:'draw',
  grew:'grow', bore:'bear', born:'bear', rose:'rise', risen:'rise', arose:'arise',
  became:'become', began:'begin', ran:'run', wept:'weep', laid:'lay', paid:'pay',
}));
function vgLemmas(w) {
  const out = [w];
  const irr = VG_IRREG.get(w); if (irr) out.push(irr);
  if (/ies$/.test(w)) out.push(w.slice(0, -3) + 'y');
  if (/(ses|xes|zes|ches|shes)$/.test(w)) out.push(w.slice(0, -2));
  if (/s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
  if (/ied$/.test(w)) out.push(w.slice(0, -3) + 'y');
  if (/ed$/.test(w)) out.push(w.slice(0, -2), w.slice(0, -1));
  if (/ing$/.test(w)) out.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  const m = /^(.*?)([bcdfglmnprstz])\2(ed|ing)$/.exec(w);
  if (m) out.push(m[1] + m[2]);
  return [...new Set(out)].filter(x => x.length >= 3);
}
// Grammar words never take a gloss, however the Hebrew is tagged.
const VG_FILLER = new Set(`the and but for nor yet with from into unto upon over under about
after before between through that this these those there here when where why how all any both
each few more most other some only very own same too also just now ever never again once
because while until during against above below out off one two three not was were are been
being have has had will would shall should may might must can could who whom whose which what
his her its their your our them they she him you shall unto thou thee thy ye`.split(/\s+/));

// ================= the render function (pure) =======================================
/** Replace each linked English span with "translit (span)". Right-to-left so
 *  earlier offsets stay valid. */
function applyLinks(text, key) {
  const spans = LINKS.get(key);
  const trs = TOK_TR.get(key);
  if (!spans || !trs) return text;
  const toks = tokensWithPos(text);
  const out = [];
  for (const sp of spans) {
    const tr = trs.get(sp.ord);
    if (!tr) continue;
    const first = sp.eng[0], last = sp.eng[sp.eng.length - 1];
    if (first < 0 || last >= toks.length) continue;           // index drift: skip, never guess
    if (last - first !== sp.eng.length - 1) continue;         // non-contiguous span
    out.push({ s: toks[first].s, e: toks[last].e, tr });
  }
  out.sort((a, b) => b.s - a.s);
  let s2 = text, prevStart = Infinity;
  for (const r of out) {
    if (r.e > prevStart) continue;                            // overlapping spans: keep the later one
    const span = s2.slice(r.s, r.e);
    const tr = /^[A-Z]/.test(span) ? r.tr.charAt(0).toUpperCase() + r.tr.slice(1) : r.tr.toLowerCase();
    s2 = s2.slice(0, r.s) + `${tr} (${span})` + s2.slice(r.e);
    prevStart = r.s;
  }
  return s2;
}

function render(text, vgKey) {
  // The Hebrew that actually stands in this verse, when we have any. Used twice:
  // to VALIDATE global term pins (step 5) and to SUPPLY missing ones (step 5b).
  // 1b. Hebrew-driven pass, BEFORE any English-driven rule. Guarding happens
  //     after it, so the rest of the pipeline treats its output as untouchable.
  if (vgKey && LINKS.size) text = applyLinks(text, vgKey);

  const vgToks = (VG.on && vgKey) ? (VG.verses.get(vgKey) || null) : null;
  const vgSns = vgToks ? new Set(vgToks.map(t => t.sn)) : null;
  // Words step 5 chose NOT to render because this verse has real Hebrew backing —
  // step 5b is given first refusal on these (see its TERM.has guard below), instead
  // of the global pin's one-size-fits-all transliteration.
  const deferredToVg = new Set();
  // 1. un-double one layer left by any earlier bad run: "x (x (eng))" -> "x (eng)"
  let s = text.replace(/\b([A-Za-z][A-Za-z']*)\s+\(\1\s+\(([^)]+)\)\)/gi, (m, tr, eng) => `${tr} (${eng})`);
  // 2. protect existing "(glosses)" so no pass can reach inside them
  const guards = [];
  s = s.replace(/\([^()]*\)/g, seg => { guards.push(seg); return `\u0000${guards.length - 1}\u0000`; });
  // 3. theonyms (case-sensitive; lowercase god/gods/lord left alone), longest-first, bare
  s = s.replace(THEO_RE, (m, k, poss) => THEO[k] ? THEO[k] + (poss || '') : m);
  // 4. names / peoples — only Capitalized tokens can be proper nouns
  s = s.replace(/\b[A-Za-z][A-Za-z']*\b/g, w => {
    if (!/^[A-Z]/.test(w)) return w;
    if (COMMON.has(w.toLowerCase())) return w;
    const k = ALIAS.get(w.toLowerCase()) || w.toLowerCase();
    const nm = NAME.get(k);
    if (nm) return w === nm ? w : nm;                       // bare, idempotent
    const peo = PEOPLE.get(k);
    if (peo) return `${peo} (${w})`;
    return w;
  });
  // 5. terms — lowercase by default (protects proper nouns). A Capitalized token renders
  //    only if it is an opt-in title-word (term-caps.txt) AND not a known name; then the
  //    capital is carried onto translit AND gloss: "the Word" -> "the Dabar (Word)".
  s = s.replace(/\b([A-Za-z][A-Za-z']*)\b(?!\s*[\u0000(])/g, (w, _g1, off) => {
    const lw = w.toLowerCase();
    const tr = TERM.get(lw);
    if (!tr) return w;
    // A global pin is one transliteration for the whole corpus — picked by popularity,
    // not by what's actually in THIS verse. Where this verse HAS real Hebrew backing
    // (OT, or Hebrew NT via Delitzsch), skip the pin entirely and defer to step 5b,
    // which can only ever choose a word from the Strong's numbers actually standing
    // in this verse. This used to be a loose "does any candidate Strong's for this
    // English word overlap the verse's Hebrew at all" check, which let a pin through
    // (with its one global spelling) even when the real per-verse Strong's for THIS
    // occurrence was a different root entirely — e.g. every "man"/"mankind" forced to
    // "adam"/H120 even on the 1,397 segments actually tagged H376/geber/enosh/etc.
    // Only applies where Hebrew exists: the Apocrypha/pseudepigrapha have none, so
    // pins behave exactly as before there — that's the "reasoning allowed" carve-out
    // for books with no Hebrew original to check against.
    if (vgSns) { deferredToVg.add(lw); return w; }
    if (/^[A-Z]/.test(w)) {
      if (NAME.has(lw) || PEOPLE.has(lw) || ALIAS.has(lw)) return w;
      // A capital can mean "proper noun" or just "start of sentence". Only the
      // first is a reason to skip: blocking both left Behold/What/Is as plain
      // English forever. Sentence-initial words are ordinary words wearing a
      // capital, so they render like any term, with the capital carried over.
      const before = s.slice(0, off);
      const sentenceStart = off === 0 || /(^|[.!?;:\u201c\u201d"'\u2019)\]]|\u0000\d+\u0000)\s+$/.test(before);
      if (!CAPS_OK.has(lw) && !sentenceStart) return w;
      return `${tr.charAt(0).toUpperCase() + tr.slice(1)} (${w})`;
    }
    return `${tr} (${w})`;
  });
  // (step 1b ran before the guards — see applyLinks)
  // 5b. VERSE-ALIGNED gloss — only words still plain after every curated pass.
  //     Re-guard first: step 5 emitted new "(word)" parentheses of its own, and
  //     without this the gloss text inside them would be treated as source text.
  if (VG.on && vgKey) {
    const toks = VG.verses.get(vgKey);
    if (toks && toks.length) {
      const g2 = [];
      s = s.replace(/\([^()]*\)/g, seg => { g2.push(seg); return `\u0001${g2.length - 1}\u0001`; });
      const used = new Set();          // one Hebrew token answers for one English word
      s = s.replace(/\b([A-Za-z][A-Za-z']*)\b(?!\s*[\u0000\u0001(])/g, w => {
        const lw = w.toLowerCase();
        if (lw.length < 3 || VG_FILLER.has(lw) || COMMON.has(lw)) return w;
        // Normally a word with a global TERM entry is assumed already handled by step 5
        // and is off-limits here. Exception: words step 5 itself deferred because this
        // verse has real Hebrew backing that its global pin didn't match — those get a
        // shot at the exact per-verse match instead of falling back to plain English.
        if ((TERM.has(lw) && !deferredToVg.has(lw)) || NAME.has(lw) || PEOPLE.has(lw) || ALIAS.has(lw)) return w;
        let sns = null;
        for (const form of vgLemmas(lw)) { const c = VG.english.get(form); if (c) { sns = c; break; } }
        if (!sns) return w;
        const hit = toks.find((t, i) => !used.has(i) && sns.has(t.sn));
        if (!hit) return w;
        used.add(toks.indexOf(hit));
        const tr = /^[A-Z]/.test(w)
          ? hit.tr.charAt(0).toUpperCase() + hit.tr.slice(1)
          : hit.tr.toLowerCase();
        return `${tr} (${w})`;
      });
      s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => g2[+i]);
    }
  }
  // 6. restore protected glosses
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => guards[+i]);
  // 7. article agreement. Replacing a word changes the sound after the article:
  //    "a man" -> "a adam". Runs last so it sees the final text, and only ever
  //    rewrites the article itself. Vowel LETTER, not vowel sound — "an hour"
  //    would need a pronunciation dictionary, and getting "a hayakal" right
  //    matters more here than the handful of silent-h English words.
  return s.replace(/\b([Aa])(n?)(\s+)([A-Za-z\u00C0-\u024F])/g,
    (m, a, n, gap, first) => {
      const wantN = /[aeiouAEIOU]/.test(first);
      if (wantN === (n === 'n')) return m;
      return `${a}${wantN ? 'n' : ''}${gap}${first}`;
    });
}

// ================= open DB, maybe init source =======================================
const db = new Database('./corpus.db', { readonly: !(APPLY || INIT_SRC || RESET_SRC) });
const cols = db.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);

// --init-src : capture the immutable source ONLY where it isn't set yet (safe, one-time).
// --reset-src: overwrite it from the CURRENT text — use this inside render-all right after
//              the pristine reload (load/reingest/de-archaic), when `text` is the fresh
//              un-rendered English, so the snapshot is a true read-only source copy.
if (INIT_SRC || RESET_SRC) {
  if (!cols.includes('text_src')) db.exec(`ALTER TABLE verses ADD COLUMN text_src TEXT`);
  const where = RESET_SRC ? untaggedWhere : `text_src IS NULL AND ${untaggedWhere}`;
  const info = db.prepare(`UPDATE verses SET text_src = text WHERE ${where}`).run(MIN_CANON);
  console.log(`text_src: ${RESET_SRC ? 'reset' : 'captured'} ${info.changes.toLocaleString()} untagged rows from current text.`);
  if (INIT_SRC) {
    console.log('⚠ --init-src snapshots CURRENT text. If those rows were already rendered, re-seed');
    console.log('  pristine English first (or use --reset-src inside render-all right after reload).');
  }
  db.close(); process.exit(0);
}

const srcCol = FROM_SRC ? 'text_src' : 'text';
if (FROM_SRC && !cols.includes('text_src')) die('--from-src needs the text_src column — run --init-src first');
const rows = db.prepare(
  `SELECT id, canon_id, chapter, verse, ord_c, ord_v, ${srcCol} AS src, text FROM verses WHERE ${untaggedWhere}
     ${FROM_SRC ? `AND ${srcCol} IS NOT NULL` : ''}`).all(MIN_CANON);
console.log(`source: ${srcCol} · untagged ENG rows: ${rows.length.toLocaleString()}\n`);

const updates = []; let changed = 0; const samples = [];
for (const r of rows) {
  // surface_occurrences is keyed by canonical ord_c/ord_v (the bake applied any
  // versification offset internally), so prefer those over the TEXT columns.
  const vgKey = `${r.canon_id}|${r.ord_c ?? parseInt(r.chapter, 10)}|${r.ord_v ?? parseInt(r.verse, 10)}`;
  const ref = `${r.canon_id}:${r.chapter}:${r.verse}`;
  const out = renderWithExceptions(r.src, ref, VERSE_EXCEPTIONS, text => render(text, vgKey));
  if (out !== r.text) { changed++; updates.push({ id: r.id, text: out });
    if (samples.length < 5 && out !== r.src) samples.push({ ref, before: r.src, after: out }); }
}
console.log(`rows that would change: ${changed.toLocaleString()}`);
const clip = t => t.length > 180 ? t.slice(0, 180) + '…' : t;
for (const s of samples) { console.log(`\n  ${s.ref}`); console.log(`   - ${clip(s.before)}`); console.log(`   + ${clip(s.after)}`); }

if (!APPLY) { console.log('\n[report only] nothing written. Add --apply to write.'); db.close(); process.exit(0); }
const upd = db.prepare(`UPDATE verses SET text = ? WHERE id = ?`);
let n = 0; db.transaction(() => { for (const u of updates) n += upd.run(u.text, u.id).changes; })();
console.log(`\n\u2713 rewrote ${n.toLocaleString()} verses. Restart the server.`);
db.close();
