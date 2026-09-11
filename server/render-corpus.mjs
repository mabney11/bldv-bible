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

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { loadVerseExceptions, renderWithExceptions } from './render-verse-exceptions.mjs';
import { progress } from './progress.mjs';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const CHECK    = args.includes('--check');
const INIT_SRC = args.includes('--init-src');
const RESET_SRC = args.includes('--reset-src');
const FROM_SRC = args.includes('--from-src');
const APPLY    = args.includes('--apply');
// --translations   render fieldy's HAND-TRANSLATED verses (translation.db rows that carry
//                  rich_text — the one column only Translation Studio writes) with the same
//                  guarded pass: his existing "translit (gloss)" spans are protected, bare
//                  English words pick up the pins/terms/per-verse Hebrew glosses. Writes
//                  text AND rich_text (tag-aware) + a translation_history row per verse.
//                  --only / --at filter by book_id here. fieldy, 2026-09-11: "we had a pass
//                  to catch as many obvious glosses as i could, I want those changes as well".
const TRANSLATIONS = args.includes('--translations');
const MIN_CANON = Number(argv('--min-canon', 40));
// --only 148,154   render (and report on) just these canon_ids — a fast way to see what a
//                  rule change does to one book; --show N prints N before/after pairs
//                  from those books (default 5). Report-only unless --apply.
const ONLY = (argv('--only', '') || '').split(',').map(x => parseInt(x, 10)).filter(Number.isFinite);
const SHOW = Number(argv('--show', 5));
// --at 40:5:3-12   show ONLY these verses' before/after (chapter:verse range), any book in --only
const AT = (() => { const m = /^(\d+):(\d+):(\d+)(?:-(\d+))?$/.exec(argv('--at', '') || ''); return m ? { c: +m[1], ch: +m[2], v0: +m[3], v1: +(m[4] || m[3]) } : null; })();
const die = m => { console.error('\u2717 ' + m); process.exit(1); };
// PALEO_DB_EXCLUSIVE=1: open every SQLite file writable + locking_mode=EXCLUSIVE — the
// device-bridge (Windows host ↔ Linux VM) can't mmap the WAL index, and a readonly open
// can't take the pragma (see project memory, 2026-09-04). No-op on a normal machine.
const EXCL = process.env.PALEO_DB_EXCLUSIVE === '1';
const openDb = (file, opts = {}) => {
  const db = new Database(file, EXCL ? {} : opts);
  if (EXCL) db.pragma('locking_mode = EXCLUSIVE');
  return db;
};
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

// ================= --init-src / --reset-src ==========================================
// One UPDATE. Runs BEFORE the rules, the Strong's dictionary and the surface index are
// loaded — those pull the whole surface_occurrences table (≈ 550 MB) into memory, which
// is minutes on Windows, and a snapshot needs none of it (render-all step 7 was paying
// that cost twice: once here, once in the render step that follows).
if (INIT_SRC || RESET_SRC) {
  const db = new Database('./corpus.db');
  const cols = db.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);
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

const VG_PARTICLE_POS = new Set(['prep', 'prps', 'prde', 'prin', 'advb', 'adv', 'nega', 'inrg', 'intj', 'conj', 'art']);
// Never glossed by the per-verse pass, full stop — the skeleton of an English sentence.
// Grammar words never take a gloss, however the Hebrew is tagged.
const VG_FILLER = new Set(`the and but for nor yet with from into unto upon over under about
after before between through that this these those there here when where why how all any both
each few more most other some only very own same too also just now ever never again once
because while until during against above below out off one two three not was were are been
being have has had will would shall should may might must can could who whom whose which what
his her its their your our them they she him you shall unto thou thee thy ye
among way within without beside besides along across toward towards around behind beyond near
since till whether either neither though although whereas rather quite else than then thus hence
therefore wherefore hereby thereby whereby whither thither hither indeed even also yet still
already almost always often sometimes seldom perhaps maybe away back forth down`.split(/\s+/));
const VG_NEVER = new Set('the a an and or but nor of to in on at by is are was were be been being am do does did has have had it its this as if so than then art thou thee thy thine ye hath doth shalt wilt unto yea nay'.split(/\s+/));
// Words the render itself writes bare (theonyms) — "Alahayam" must not become "Alahayam (Alahayam)".
const VG_OUTPUT_WORDS = new Set();
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
for (const v of Object.values(THEO)) for (const w of String(v).toLowerCase().split(/\s+/)) if (w) VG_OUTPUT_WORDS.add(w);
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

// ================= TERMS LEARNED FROM THE OT RENDERING =============================
// fieldy, 2026-09-10: "MOST words attempted to be glossed — there's no reason not to
// have attempts, especially because the words are consistent across writings." The OT
// text (apply-web-strongs, from the Hebrew) already decided a transliteration for
// thousands of English words: every "translit (word)" pair in Genesis–Malachi is a
// head-word decision made against real Hebrew, not co-occurrence. Tallied here, the
// plurality form (≥3 uses, ≥60% of that word's uses) becomes a fallback pin for the
// books that have NO Hebrew to align against (Greek Esther, Bel, the Testaments…).
// Curated pins (term-forms.txt / word-map.json) and excludes still win; where a verse
// has Hebrew, step 5b's per-verse match still wins over any pin.
const AUTO_TERM = new Map();
{
  const tally = new Map();
  try {
    const ot = openDb('./corpus.db', { readonly: true });
    const re = /\b([a-z][a-z']+) \(([a-z][a-z']*)\)/g;
    for (const { text } of ot.prepare(`SELECT text FROM verses WHERE corpus='ENG' AND canon_id BETWEEN 1 AND 39 AND text IS NOT NULL`).iterate()) {
      let m; re.lastIndex = 0;
      while ((m = re.exec(text))) {
        const tr = m[1], eng = m[2];
        if (eng.length < 3 || VG_NEVER.has(eng) || VG_FILLER.has(eng) || COMMON.has(eng) || tr === eng) continue;
        if (!tally.has(eng)) tally.set(eng, new Map());
        tally.get(eng).set(tr, (tally.get(eng).get(tr) || 0) + 1);
      }
    }
    ot.close();
  } catch (e) { console.log(`auto-terms: could not read the OT rendering (${e.message}) — skipped`); }
  for (const [eng, forms] of tally) {
    if (TERM.has(eng) || TERM_EXCLUDE.has(eng) || NAME.has(eng) || PEOPLE.has(eng)) continue;
    const sorted = [...forms].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((n, [, c]) => n + c, 0);
    if (sorted[0][1] >= 3 && sorted[0][1] / total >= 0.6) AUTO_TERM.set(eng, sorted[0][0]);
  }
}
// A pin for an inflection the tables don't list: walked → walk, cities → city.
const termFor = (lw) => {
  if (TERM.has(lw)) return TERM.get(lw);
  if (AUTO_TERM.has(lw)) return AUTO_TERM.get(lw);
  for (const f of vgLemmas(lw)) { if (f !== lw && TERM.has(f)) return TERM.get(f); if (f !== lw && AUTO_TERM.has(f)) return AUTO_TERM.get(f); }
  return null;
};
console.log(`rules: ${theoKeys.length} theonyms, ${NAME.size} names, ${PEOPLE.size} peoples, ${TERM.size} terms + ${AUTO_TERM.size} learned from the OT rendering`);

// ================= THE HEB BAKE, READ ONCE AND CACHED ==============================
// Both passes below (verse-gloss and the link transliterations) need the same thing:
// every Hebrew token of every verse — (ordinal, Strong's, pos) with the root's
// transliteration. That used to be TWO reads of surface_occurrences (≈ 1.1 M rows, one of
// them a DISTINCT+JOIN+ORDER BY that sorts the lot in SQLite's temp store — minutes on
// Windows), on EVERY run, even when the index had not changed since the last one.
// Now: one streamed read, written to .surface-index-cache.json, and reused as long as the
// index (and the roots it transliterates from) are the same files they were.
const HEB_TOKENS = (() => {
  const IDX = './surface-index.db';
  if (!existsSync(IDX)) return null;
  if (!translitBooksJs) return null;
  const CACHE = './.surface-index-cache.json';
  const st = (f) => { const x = statSync(f); return `${x.size}:${Math.round(x.mtimeMs)}`; };
  const stamp = `v1|${st(IDX)}|${ROOTS_PATH ? st(ROOTS_PATH) : '-'}`;
  try {
    if (existsSync(CACHE)) {
      const c = JSON.parse(readFileSync(CACHE, 'utf8'));
      if (c.stamp === stamp) { console.log(`HEB bake: ${c.n.toLocaleString()} tokens in ${Object.keys(c.verses).length.toLocaleString()} verses from ${CACHE} (index unchanged — no read)`); return c; }
    }
  } catch { /* rebuild below */ }
  const idx = openDb(IDX, { readonly: true });
  const hasSource = (() => { try { idx.prepare('SELECT source FROM token_surfaces LIMIT 1').get(); return true; } catch { return false; } })();
  if (!hasSource) { console.log('HEB bake: surface-index has no `source` column — rebuild with --heb'); idx.close(); return null; }
  const total = idx.prepare(`SELECT COUNT(*) n FROM surface_occurrences WHERE source = 'HEB'`).get().n;
  const p = progress('HEB bake: reading the surface index once', total);
  const verses = {}; let n = 0;
  const trOf = new Map();   // sn -> translit(root), computed once per Strong's
  for (const r of idx.prepare(`SELECT book_id, chapter, verse, token_ordinal, strongs, pos FROM surface_occurrences WHERE source = 'HEB'`).iterate()) {
    p.tick();
    if (!r.strongs) continue;
    const sn = 'H' + String(r.strongs).replace(/^H+/i, '');
    if (!trOf.has(sn)) { const canonical = ROOTS[sn]; trOf.set(sn, canonical ? translitBooksJs(canonical).trim() : ''); }
    const tr = trOf.get(sn);
    if (!tr) continue;
    const key = `${r.book_id}|${r.chapter}|${r.verse}`;
    (verses[key] ||= []).push([r.token_ordinal, sn, r.pos || '', tr]);
    n++;
  }
  p.done(); idx.close();
  const out = { stamp, n, verses };
  try { writeFileSync(CACHE, JSON.stringify(out)); console.log(`HEB bake: cached to ${CACHE} — the next run skips the read unless the index changes`); }
  catch (e) { console.log(`HEB bake: could not write ${CACHE} (${e.message}) — fine, just no cache`); }
  return out;
})();

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
// Function words that MAY take a gloss — only when the curated lexicon's head word says
// so (𐤀𐤕𐤄 "you", 𐤏𐤃 "until", 𐤊𐤋 "every", 𐤋𐤀 "NOT"); fieldy 2026-09-10: "athah (you)",
// "id (until)". Demonstratives/conjunctions (that, this, such, it, as) never — too
// ambiguous to be right often enough.
const VG_FUNCTION_OK = new Set('you we they them he she him her us me until not all every upon over with from now behold among before after without within between against because therefore also again many much who which whom whose'.split(/\s+/));
// Senses a root may NOT gloss, whatever kjv_def says. fieldy, 2026-09-10: "I'm confident
// asharay is not 'blessed'" — 𐤀𐤔𐤓𐤉 is "he who"; where the English says blessed the word
// is barak. (Delitzsch's Beatitudes carry אשרי; the pin blessed→barak now renders there.)
const VG_ROOT_NOT = new Map([
  ['𐤀𐤔𐤓', new Set(['blessed', 'bless', 'blessedness', 'happy', 'happiness'])],
]);
const VG_GENERIC = new Set('make made makes making do done did doing get got give gave put set take took bring come came go went cause let self selves one thing things'.split(/\s+/));
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
  //
  // Candidates are keyed by the ROOT (strongs-roots.json paleo), not the Strong's
  // number: the HEB aligner picks a number by frequency and regularly lands on a
  // homograph of the right root (ומפאר tagged H6287 "headdress" where H6286
  // "glorify" was meant; ומברכים H1290 "knee" for H1288 "bless") — same letters,
  // same transliteration, so the gloss is right either way. (2026-09-10)
  //
  // kjv_def's own notation used to defeat most of this: "walk (abroad, on, to and
  // fro)" was split on the commas INSIDE the parentheses first, so "walk" came out
  // as "walk abroad" and was dropped — and with it walk, praise ("(sing, be worthy
  // of) praise"), true ("true (-ly, -th)"), glorify ("glorify (self)")… the very
  // words a reader meets most. Parentheticals are removed first now, and the
  // "(-eous, -ness)" suffix alternatives are expanded ("right(-eous)" → right,
  // righteous) instead of thrown away.
  const norm = sn => 'H' + String(sn).replace(/^H+/i, '');
  const rootOfSn = sn => ROOTS[sn] || null;
  VG.byRoot = new Map();              // english word -> Set(root paleo)
  const addWord = (word, root) => {
    if (!/^[a-z][a-z'-]{2,}$/.test(word)) return;
    if (!VG.byRoot.has(word)) VG.byRoot.set(word, new Set());
    VG.byRoot.get(word).add(root);
  };
  const defWords = (def) => {
    const out = [];
    let d = String(def);
    // strongs-hebrew-expanded.json carries senses APPENDED after the entry's closing
    // period ("mount(-ain), promotion., fire" on H2022; "…twelve(-th)., day, hand" on
    // H6240) — an earlier expansion pass's co-occurrence guesses, not Strong's. They are
    // exactly the "har (fire)" / "ishar (day)" glosses that must never happen: only the
    // text up to the entry's own final period is a definition.
    d = d.replace(/\.\s*,\s*[^.]*$/, '.');
    // "right(-eous, -ly)" / "ever(-lasting, -more)" → the head word plus each suffixed form
    d = d.replace(/([A-Za-z]+)\s*\(([^()]*)\)/g, (m, head, inner) => {
      const parts = inner.split(',').map(x => x.trim());
      if (!parts.some(x => /^-[a-z]+$/.test(x))) return m;            // plain commentary — left for the strip below
      const forms = [head, ...parts.filter(x => /^-[a-z]+$/.test(x)).map(x => head + x.slice(1))];
      return forms.join(', ');
    });
    d = d.replace(/\([^)]*\)/g, ' ');           // every other parenthetical is commentary
    for (const piece of d.split(/[,;]/)) {
      const w = piece.replace(/[^A-Za-z\s'-]/g, ' ').trim().toLowerCase();
      if (!w) continue;
      if (/^[a-z][a-z'-]*$/.test(w)) out.push(w);
      else {
        // "commit iniquity", "be at the point": a short phrase's content words each count
        // ("iniquity" → 𐤏𐤅𐤄), generic verbs excepted so "make crooked" doesn't teach "make"
        // only "generic verb + object" phrases — anything else ("right forth", "way-faring
        // man") teaches a word the entry never meant
        if (!/^(?:be|make|do|commit|give|take|go|come|bring|put|set|get|have|cause|let|lay|keep|hold)\s+/.test(w)) continue;
        const parts = w.split(/\s+/).filter(x => x.length >= 3 && !VG_FILLER.has(x) && !VG_GENERIC.has(x));
        if (parts.length === 1) out.push(parts[0]);
      }
    }
    return out;
  };
  let nSn = 0;
  for (const [rawSn, e] of Object.entries(dict)) {
    const def = typeof e === 'string' ? e : (e && (e.kjv_def || e.strongs_def || e.def));
    if (!def) continue;
    const sn = norm(rawSn);
    const root = rootOfSn(sn);
    if (!root) continue;
    nSn++;
    for (const word of defWords(def)) {
      if (VG_ROOT_NOT.get(root)?.has(word)) continue;   // a sense fieldy has ruled out for this root
      addWord(word, root);
      if (!VG.english.has(word)) VG.english.set(word, new Set());
      VG.english.get(word).add(sn);
    }
  }
  // fieldy's own lexicon (lexicon/lexicon.json, then hebrew-extra-lexicon.json): the
  // curated gloss for a root is the PREFERRED answer — "𐤄𐤋𐤋 praise" beats a kjv_def that
  // happens to list "praise" under 𐤁𐤓𐤊 — and the only source allowed to gloss a
  // function word (you → athah, until → id): kjv_def's stray senses (H776 "way") never
  // reach those.
  VG.lexWords = new Map();            // root paleo -> Set(every english word in the curated gloss)
  VG.lexHeads = new Map();            // root paleo -> Set(the HEAD word of each alternative: "il / over" → il, over; "you (masc)" → you)
  const GLOSS_SKIP = new Set(['the', 'a', 'an', 'of', 'to', 'be', 'is']);
  for (const f of ['./lexicon/lexicon.json', './lexicon/hebrew-extra-lexicon.json']) {
    if (!existsSync(f)) continue;
    let lex; try { lex = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    for (const [paleo, gloss] of Object.entries(lex)) {
      if (!gloss || typeof gloss !== 'string') continue;
      const clean = gloss.toLowerCase().replace(/\([^)]*\)/g, ' ');
      const words = clean.split(/[\/,;|·\-–—\s]+/).map(x => x.replace(/[^a-z']/g, '')).filter(x => x.length >= 2);
      if (!words.length) continue;
      if (!VG.lexWords.has(paleo)) VG.lexWords.set(paleo, new Set());
      for (const w of words) VG.lexWords.get(paleo).add(w);
      if (!VG.lexHeads.has(paleo)) VG.lexHeads.set(paleo, new Set());
      for (const alt of clean.split(/[\/,;|·]+/)) {
        const head = alt.split(/[\s\-–—]+/).map(x => x.replace(/[^a-z']/g, '')).find(x => x.length >= 2 && !GLOSS_SKIP.has(x));
        if (head) VG.lexHeads.get(paleo).add(head);
      }
    }
  }
  console.log(`verse-gloss: ${nSn.toLocaleString()} Strong's entries read, ${VG.byRoot.size.toLocaleString()} English words keyed by root, ${VG.lexWords.size.toLocaleString()} curated lexicon roots`);

  // that verse's Hebrew: which Strong's numbers are actually present, per token — from
  // the one cached read of the bake above (the transliteration is the root's, not the
  // token's own baked components — see the note above for why).
  if (!HEB_TOKENS) { console.log('verse-gloss: no HEB bake — skipping'); return; }
  let n = 0;
  for (const [key, toks] of Object.entries(HEB_TOKENS.verses)) {
    const list = [];
    const seen = new Set();
    for (const [ord, sn, pos, tr] of toks) {
      const k = `${ord}|${sn}`; if (seen.has(k)) continue; seen.add(k);
      // conjunction/article particles and one-letter transliterations are never a gloss
      if (pos === 'conj' || pos === 'art' || !tr || tr.length < 2) continue;
      list.push({ sn, tr, ord, pos, root: rootOfSn(sn) }); n++;
    }
    if (list.length) VG.verses.set(key, list);
  }
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
  try { ldb = openDb(dbFile, { readonly: true }); ldb.prepare('SELECT 1 FROM translation_links LIMIT 1').get(); }
  catch { if (ldb) ldb.close(); console.log('links: translation_links not found — skipping the Hebrew-driven pass'); return; }
  const rows = ldb.prepare(`SELECT book_id, chapter, verse, english_phrase, english_indices, token_ordinals FROM translation_links`).all();
  ldb.close();
  let n = 0;
  for (const r of rows) {
    let eng = [], ords = [];
    try { eng = JSON.parse(r.english_indices || '[]'); } catch { continue; }
    try { ords = JSON.parse(r.token_ordinals || '[]'); } catch { continue; }
    if (!eng.length || !ords.length) continue;
    const key = `${r.book_id}|${r.chapter}|${r.verse}`;
    if (!LINKS.has(key)) LINKS.set(key, []);
    LINKS.get(key).push({ eng: eng.slice().sort((a, b) => a - b), ord: ords[0], phrase: String(r.english_phrase || '').trim() });
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
const TOK_ROOT = new Map();   // "canon|ch|v" -> Map(ordinal -> root paleo), for VG_ROOT_NOT
if (LINKS.size) (() => {
  if (!HEB_TOKENS) return;
  if (!translitBooksJs) { console.log('links: books.js translit() not found — TOK_TR skipped'); return; }
  for (const [key, toks] of Object.entries(HEB_TOKENS.verses)) {
    for (const [ord, , pos, tr] of toks) {
      if (pos === 'conj' || pos === 'art') continue;
      // Defence in depth: even if a link points at a conjunction or a bare
      // proclitic, a one-letter transliteration is never a usable gloss.
      // "Shalamah w (became) the father of" is the failure this prevents.
      if (!tr || tr.length < 2) continue;
      if (!TOK_TR.has(key)) TOK_TR.set(key, new Map());
      TOK_TR.get(key).set(ord, tr);
      if (!TOK_ROOT.has(key)) TOK_ROOT.set(key, new Map());
      TOK_ROOT.get(key).set(ord, ROOTS[toks.find(t => t[0] === ord)?.[1]] || null);
    }
  }
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
// (the second block, 2026-09-09: prepositions and adverbs a kjv_def happens to list as a
// stray sense — H776 erets lists "way", H4480 min lists "among" — glossed "in no aratz (way)
// … man (among)" in Matthew 2:6. A term pin (step 5) can still gloss "way" → darak; only the
// per-verse fallback is barred from function words.)

// ================= the render function (pure) =======================================
/** Replace each linked English span with "translit (span)". Right-to-left so
 *  earlier offsets stay valid. */
// A link's english_indices are word positions in the English AS IT WAS when the link was
// made (the Studio's HEB-auto alignment ran on already-rendered text, where every
// "(gloss)" is an extra word). Applied to the pristine source they drift, and the drift
// is what put "aratz (are)", "man (among)", "yatzaa (shall)" into Matthew 2:6: the
// Hebrew was right, the index was pointing at the wrong English word. So a link is
// applied only where the text agrees with it: the words at its indices must BE its
// english_phrase; if they are not, the phrase is looked for as a whole nearby (the
// nearest occurrence, up to 12 words either way) and the link moves there; if it is
// nowhere, the link is skipped and counted — never guessed.
const LINK_STATS = { applied: 0, moved: 0, stale: 0 };
const norm = (w) => w.toLowerCase().replace(/[^a-z']/g, '');
function applyLinks(text, key) {
  const spans = LINKS.get(key);
  const trs = TOK_TR.get(key);
  if (!spans || !trs) return text;
  const toks = tokensWithPos(text);
  const words = toks.map((t) => norm(t.w));
  const out = [];
  for (const sp of spans) {
    const tr = trs.get(sp.ord);
    if (!tr) continue;
    // a link that pairs a root with a sense fieldy has ruled out (אשרי ↔ "Blessed") is
    // not applied — the pin decides that word instead (see VG_ROOT_NOT)
    {
      const root = TOK_ROOT.get(key)?.get(sp.ord);
      const not = root && VG_ROOT_NOT.get(root);
      if (not && sp.phrase && sp.phrase.toLowerCase().split(/\s+/).some(w => not.has(w.replace(/[^a-z]/g, '')))) { LINK_STATS.stale++; continue; }
    }
    let first = sp.eng[0], last = sp.eng[sp.eng.length - 1];
    if (last - first !== sp.eng.length - 1) continue;         // non-contiguous span
    const want = sp.phrase ? sp.phrase.split(/\s+/).map(norm).filter(Boolean) : [];
    const matchesAt = (i) => want.length > 0 && i >= 0 && i + want.length <= words.length && want.every((w, k) => words[i + k] === w);
    if (!want.length) {
      if (first < 0 || last >= toks.length) { LINK_STATS.stale++; continue; }
    } else if (matchesAt(first) && last - first === want.length - 1) {
      LINK_STATS.applied++;
    } else {
      // look for the phrase nearby, nearest first
      let found = -1;
      for (let d = 0; d <= 12 && found < 0; d++) {
        if (matchesAt(first - d)) found = first - d;
        else if (d && matchesAt(first + d)) found = first + d;
      }
      if (found < 0) { LINK_STATS.stale++; continue; }
      first = found; last = found + want.length - 1;
      LINK_STATS.moved++;
    }
    if (first < 0 || last >= toks.length) { LINK_STATS.stale++; continue; }
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

const VG_MIN_AGREE = 0.3;
const VG_ALIGN = { used: 0, shifted: 0, rejected: 0, byBook: new Map() };
function agreement(text, toks) {
  const plain = text.replace(/\([^()]*\)/g, ' ');
  let content = 0, matched = 0;
  const re = /\b([A-Za-z][A-Za-z']*)\b/g; let m;
  while ((m = re.exec(plain))) {
    const lw = m[1].toLowerCase();
    if (lw.length < 3 || VG_NEVER.has(lw) || VG_FILLER.has(lw) || COMMON.has(lw) || VG_OUTPUT_WORDS.has(lw)) continue;
    if (NAME.has(lw) || PEOPLE.has(lw) || ALIAS.has(lw)) continue;
    content++;
    const forms = vgLemmas(lw);
    const roots = new Set();
    for (const f of forms) { const c = VG.byRoot.get(f); if (c) for (const r of c) roots.add(r); }
    if (toks.some(t => t.root && (roots.has(t.root) || (VG.lexWords.get(t.root) && forms.some(f => VG.lexWords.get(t.root).has(f)))))) matched++;
  }
  return { content, matched, ratio: content ? matched / content : 0 };
}
function pickAlignedTokens(text, vgKey) {
  const [c, ch, v] = vgKey.split('|');
  const canon = +c;
  let best = null;
  for (const d of [0, 1, -1, 2, -2]) {
    const toks = VG.verses.get(`${c}|${ch}|${+v + d}`);
    if (!toks || !toks.length) continue;
    const a = agreement(text, toks);
    // a short verse can't be judged — take it as it stands
    const ok = a.content < 4 ? d === 0 : a.ratio >= VG_MIN_AGREE;
    if (!ok) continue;
    // the verse itself wins any near-tie; a neighbour must be clearly better
    const score = a.ratio - (d === 0 ? 0 : 0.15);
    if (!best || score > best.score) best = { toks, d, score, ratio: a.ratio };
  }
  const bb = VG_ALIGN.byBook.get(canon) || { used: 0, shifted: 0, rejected: 0, shifts: new Map() };
  VG_ALIGN.byBook.set(canon, bb);
  if (!best) { VG_ALIGN.rejected++; bb.rejected++; return null; }
  VG_ALIGN.used++; bb.used++;
  if (best.d !== 0) { VG_ALIGN.shifted++; bb.shifted++; bb.shifts.set(best.d, (bb.shifts.get(best.d) || 0) + 1); }
  return best;
}

function render(text, vgKey) {
  // The Hebrew that actually stands in this verse, when we have any. Used twice:
  // to VALIDATE global term pins (step 5) and to SUPPLY missing ones (step 5b).
  // 1b. Hebrew-driven pass, BEFORE any English-driven rule. Guarding happens
  //     after it, so the rest of the pipeline treats its output as untouchable.
  if (vgKey && LINKS.size) text = applyLinks(text, vgKey);

  // 1a. hardcode "X became the father of Y" -> "X yalad (begat) Y", run
  //     AFTER applyLinks (running it before shifts every later token's index
  //     in the verse, since applyLinks positions its inserts using ORIGINAL
  //     word-offsets computed against text_src -- tried that, it corrupted
  //     unrelated words further along the same verse, e.g. "Yalad (Yatzachaq)"
  //     appearing on the WRONG name). The Matthew genealogy's translation_link
  //     data is unreliable for this idiom -- confirmed misaligned in more than
  //     one shape, e.g. linking yalad's translit to "father" itself and a
  //     different stray translit to "became" ("Ram imayanadab (became) the
  //     yalad (father) of Imayanadab"), not just the narrower "attaches to
  //     'of' instead of the whole phrase" bug first spotted. So rather than
  //     trying to capture and reuse whatever applyLinks inserted, this matches
  //     EITHER a bare keyword OR a keyword already wrapped in some "TR (word)"
  //     gloss for EACH of became/father/of independently, and replaces the
  //     whole span -- gloss debris included -- with one fixed answer. This
  //     idiom is fixed Hebrew vocabulary, the same verb (yalad/H3205, Hiphil
  //     of ילד) every time, not something that needs a live per-verse lookup:
  //     fieldy's call, 2026-09-02, "you can just hardcode the text, its not
  //     going to change".
  {
    const glossed = w => `(?:[a-z][a-z']*\\s+\\(${w}\\)|${w})`;
    const idiom = new RegExp(`\\b${glossed('became')}\\s+(?:the\\s+)?${glossed('father')}\\s+${glossed('of')}`, 'gi');
    text = text.replace(idiom, 'yalad (begat)');
  }
  // 1a'. "come/came/comes/coming to pass" is ONE Hebrew word, hayah (H1961) — never
  //      "hayah (came) to chalapawan (pass)". Same shape as the yalad idiom: each part may
  //      already be glossed; the whole span is replaced. The tense word is kept in the
  //      gloss so "It will hayah (come to pass)" still reads. fieldy, 2026-09-11.
  {
    const glossed = w => `(?:[a-z][a-z']*\\s+\\((${w})\\)|(${w}))`;
    const idiom = new RegExp(`(?<!\\()\\b${glossed('come|came|comes|coming')}\\s+${glossed('to')}\\s+${glossed('pass')}(?![A-Za-z])`, 'gi');
    text = text.replace(idiom, (m, g1, g2) => {
      const v = (g1 || g2).toLowerCase();
      const cap = /^[A-Z]/.test(g1 || g2);
      return `${cap ? 'Hayah' : 'hayah'} (${v} to pass)`;
    });
  }

  // Which Hebrew verse actually stands beside this English one. The HEB editions do
  // not all share the English versification (Sefaria's Jubilees runs one verse ahead:
  // its 1:1 is the prologue), and a per-verse pass fed the WRONG verse's tokens glosses
  // with confident nonsense — "har (fire)", "pah (saying)", "dabar (glory)". So the
  // Hebrew is trusted only when it AGREES with the English: the share of content words
  // that find a root in it must reach VG_MIN_AGREE; the neighbouring verses (±1, ±2)
  // are tried too, and the best-agreeing one is used — which self-corrects a constant
  // offset and reports it, so the versification can be fixed at the source.
  const picked = (VG.on && vgKey) ? pickAlignedTokens(text, vgKey) : null;
  const vgToks = picked ? picked.toks : null;
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
    if (TERM_EXCLUDE.has(lw)) return w;
    const tr = termFor(lw);
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
      const sentenceStart = off === 0 || /(^|[.!?;:\u201c\u201d"'\u2019)\]]|\u0000\d+\u0000)\s*$/.test(before);
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
    const toks = vgToks;
    if (toks && toks.length) {
      const g2 = [];
      s = s.replace(/\([^()]*\)/g, seg => { g2.push(seg); return `\u0001${g2.length - 1}\u0001`; });
      const used = new Set();          // one Hebrew token answers for one English word
      // Where each English word sits in the verse (0..1) — the Hebrew token nearest
      // in relative position wins a tie, so the second 𐤀𐤌𐤕 of a verse glosses the
      // second "truth", not the first "right" (2026-09-10, Words of Azariah 1:4).
      const engWords = []; { const re = /\b([A-Za-z][A-Za-z']*)\b/g; let m; while ((m = re.exec(s))) engWords.push(m.index); }
      const lastOrd = toks.reduce((a, t) => Math.max(a, t.ord || 0), 1);
      let engIdx = -1;
      s = s.replace(/\b([A-Za-z][A-Za-z']*)\b(?!\s*[\u0000\u0001(])/g, (w, _g, off) => {
        engIdx = Math.max(engIdx, engWords.indexOf(off));
        const lw = w.toLowerCase();
        const isFunction = lw.length < 3 || VG_FILLER.has(lw) || COMMON.has(lw);
        // Normally a word with a global TERM entry is assumed already handled by step 5
        // and is off-limits here. Exception: words step 5 itself deferred because this
        // verse has real Hebrew backing that its global pin didn't match — those get a
        // shot at the exact per-verse match instead of falling back to plain English.
        if ((termFor(lw) && !deferredToVg.has(lw)) || NAME.has(lw) || PEOPLE.has(lw) || ALIAS.has(lw)) return w;
        const forms = vgLemmas(lw);
        // every candidate root across every inflection of the word (was: the first
        // form with ANY candidates — "blessed" stopped at H835's "blessed, happy" and
        // never reached "bless" → 𐤁𐤓𐤊)
        const roots = new Set();
        for (const form of forms) { const c = VG.byRoot.get(form); if (c) for (const r of c) roots.add(r); }
        // pure grammar never takes a gloss, whatever the Hebrew is tagged; nor does a word
        // that IS a transliteration already (a theonym step 3 wrote bare: "Alahayam")
        if (VG_NEVER.has(lw) || VG_OUTPUT_WORDS.has(lw)) return w;
        const lexHit = (t) => { const lw2 = VG.lexWords.get(t.root); return !!lw2 && forms.some(f => lw2.has(f)); };
        const lexHead = (t) => { const h = VG.lexHeads.get(t.root); return !!h && forms.some(f => h.has(f)); };
        const pos = engWords.length > 1 ? engIdx / (engWords.length - 1) : 0;
        let best = null, bestScore = -1;
        toks.forEach((t, i) => {
          if (used.has(i) || !t.root) return;
          const lex = lexHit(t);
          // grammar words (you, until, all, over…): only a curated gloss, or a Hebrew
          // token that IS a particle/pronoun itself (𐤀𐤕𐤄 you, 𐤏𐤃 until) — never a
          // stray kjv_def sense of a noun (H776 "way")
          if (isFunction && !(VG_FUNCTION_OK.has(lw) && lexHead(t))) return;
          // a content word never takes a particle's root on a kjv_def sense alone
          // (𐤀𐤔𐤓 "guide, lead" → "ashar (led)"); the curated lexicon may still say so
          if (!isFunction && VG_PARTICLE_POS.has(t.pos) && !lex) return;
          if (t.tr.toLowerCase() === lw) return;
          if (!lex && !roots.has(t.root)) return;
          const dist = Math.abs((t.ord || 0) / lastOrd - pos);
          // curated match first; a content word prefers a content token over a particle
          // ("evermore" → 𐤏𐤅𐤋𐤌, not the 𐤏𐤃 beside it); then the nearest in position
          const contentBonus = (!isFunction && !VG_PARTICLE_POS.has(t.pos)) ? 0.3 : 0;
          const score = (lex ? 2 : 1) + contentBonus - dist * 0.5;
          if (score > bestScore) { bestScore = score; best = i; }
        });
        if (best == null) return w;
        used.add(best);
        const hit = toks[best];
        const tr = /^[A-Z]/.test(w)
          ? hit.tr.charAt(0).toUpperCase() + hit.tr.slice(1)
          : hit.tr.toLowerCase();
        return `${tr} (${w})`;
      });
      // 5c. A word step 5 handed to the Hebrew that the Hebrew could not answer for gets
      //     its global pin after all — an attempt beats plain English (fieldy, 2026-09-10:
      //     "MOST words attempted"). Same rendering as step 5, capital carried over.
      if (deferredToVg.size) {
        // re-guard: 5b just wrote new "(word)" glosses of its own
        const g3 = [];
        s = s.replace(/\([^()]*\)/g, seg => { g3.push(seg); return `\u0002${g3.length - 1}\u0002`; });
        s = s.replace(/\b([A-Za-z][A-Za-z']*)\b(?!\s*[\u0000\u0001\u0002(])/g, (w, _g1, off) => {
          const lw = w.toLowerCase();
          if (!deferredToVg.has(lw) || TERM_EXCLUDE.has(lw)) return w;
          const tr = termFor(lw);
          if (!tr) return w;
          if (/^[A-Z]/.test(w)) {
            if (NAME.has(lw) || PEOPLE.has(lw) || ALIAS.has(lw)) return w;
            const before = s.slice(0, off);
            const sentenceStart = off === 0 || /(^|[.!?;:\u201c\u201d"'\u2019)\]]|[\u0000\u0001\u0002]\d+[\u0000\u0001\u0002])\s*$/.test(before);
            if (!CAPS_OK.has(lw) && !sentenceStart) return w;
            return `${tr.charAt(0).toUpperCase() + tr.slice(1)} (${w})`;
          }
          return `${tr} (${w})`;
        });
        s = s.replace(/\u0002(\d+)\u0002/g, (_, i) => g3[+i]);
      }
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

// ================= --translations : hand-translated verses in translation.db ==========
if (TRANSLATIONS) {
  const TDB = './translation.db';
  if (!existsSync(TDB)) die('translation.db not found — run from server/');
  const tdb = openDb(TDB, { readonly: !APPLY });
  const rows = tdb.prepare(`SELECT book_id, chapter, verse, status, text, rich_text, updated_at FROM translations
     WHERE rich_text IS NOT NULL AND rich_text <> ''
     ${ONLY.length ? `AND book_id IN (${ONLY.join(',')})` : ''}
     ORDER BY book_id, chapter, verse`).all();
  console.log(`--translations: ${rows.length.toLocaleString()} hand-translated verses (rich_text set)\n`);
  // NO link pass here. translation_links place their inserts by word index in the
  // pristine English; a hand translation already carries "translit (gloss)" at those
  // positions, so applyLinks stamped translits onto translits ("baraa (raashayath)",
  // 2026-09-11 first report). The links ARE this text's own vocabulary — nothing to add.
  LINKS.clear();
  // rich_text is the editor's innerHTML: render the text between tags, never the tags.
  // A segment holding an entity (&amp; …) is left alone rather than mis-read as words.
  const renderHtml = (html, fn) => html.split(/(<[^>]*>)/).map(seg =>
    (seg.startsWith('<') || /&[#a-z0-9]+;/i.test(seg)) ? seg : fn(seg)).join('');
  const updates = []; const samples = [];
  let words = 0, glossedBefore = 0, glossedAfter = 0;
  const cov = (text) => { let w = 0, g = 0; const re = /\b([A-Za-z][A-Za-z']*)\b(\s*\([^()]*\))?/g; let m;
    while ((m = re.exec(text))) { const lw = m[1].toLowerCase();
      if (m[2]) { w++; g++; re.lastIndex = m.index + m[0].length; continue; }
      if (lw.length < 3 || VG_FILLER.has(lw) || COMMON.has(lw)) continue; w++; }
    return { w, g }; };
  for (const r of rows) {
    const vgKey = `${r.book_id}|${r.chapter}|${r.verse}`;
    const ref = `${r.book_id}:${r.chapter}:${r.verse}`;
    const fn = t => renderWithExceptions(t, ref, VERSE_EXCEPTIONS, x => render(x, vgKey));
    const out = fn(r.text || '');
    const richOut = /<[^>]*>/.test(r.rich_text) ? renderHtml(r.rich_text, fn) : out;
    const b = cov(r.text || ''), a = cov(out); words += a.w; glossedBefore += b.g; glossedAfter += a.g;
    if (out !== r.text || richOut !== r.rich_text) {
      updates.push({ ...r, out, richOut });
      const hit = !AT || (r.book_id === AT.c && r.chapter === AT.ch && r.verse >= AT.v0 && r.verse <= AT.v1);
      if (hit && (AT || samples.length < SHOW)) samples.push({ ref, before: r.text, after: out });
    }
  }
  const pct = (g, w) => w ? (100 * g / w).toFixed(1) + '%' : '—';
  console.log(`gloss coverage of the hand translations: ${pct(glossedBefore, words)} -> ${pct(glossedAfter, words)} of ${words.toLocaleString()} content words`);
  console.log(`verses that would change: ${updates.length.toLocaleString()} / ${rows.length.toLocaleString()}`);
  for (const s of samples) { console.log(`\n  ${s.ref}`); console.log(`   - ${s.before}`); console.log(`   + ${s.after}`); }
  if (!APPLY) { console.log('\n[report only] nothing written. Add --apply to write.'); tdb.close(); process.exit(0); }
  const hist = tdb.prepare(`INSERT INTO translation_history (book_id, chapter, verse, status, text, rich_text, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const upd  = tdb.prepare(`UPDATE translations SET text = ?, rich_text = ?, updated_at = datetime('now') WHERE book_id = ? AND chapter = ? AND verse = ?`);
  let n = 0; tdb.transaction(() => { for (const u of updates) {
    hist.run(u.book_id, u.chapter, u.verse, u.status, u.text, u.rich_text, u.updated_at);
    n += upd.run(u.out, u.richOut, u.book_id, u.chapter, u.verse).changes; } })();
  console.log(`\n✓ rewrote ${n.toLocaleString()} hand-translated verses (previous versions in translation_history). Restart the server.`);
  tdb.close(); process.exit(0);
}

// ================= open DB, maybe init source =======================================
const db = openDb('./corpus.db', { readonly: !(APPLY || INIT_SRC || RESET_SRC) });
const cols = db.prepare(`PRAGMA table_info(verses)`).all().map(c => c.name);

// --init-src : capture the immutable source ONLY where it isn't set yet (safe, one-time).
// --reset-src: overwrite it from the CURRENT text — use this inside render-all right after
//              the pristine reload (load/reingest/de-archaic), when `text` is the fresh
//              un-rendered English, so the snapshot is a true read-only source copy.
// (--init-src / --reset-src are handled up top, before the rules and the surface index load)

const srcCol = FROM_SRC ? 'text_src' : 'text';
if (FROM_SRC && !cols.includes('text_src')) die('--from-src needs the text_src column — run --init-src first');
const rows = db.prepare(
  `SELECT id, canon_id, chapter, verse, ord_c, ord_v, ${srcCol} AS src, text FROM verses WHERE ${untaggedWhere}
     ${FROM_SRC ? `AND ${srcCol} IS NOT NULL` : ''}
     ${ONLY.length ? `AND canon_id IN (${ONLY.join(',')})` : ''}`).all(MIN_CANON);
if (ONLY.length) console.log(`--only ${ONLY.join(',')}: ${rows.length.toLocaleString()} rows`);
console.log(`source: ${srcCol} · untagged ENG rows: ${rows.length.toLocaleString()}\n`);

const updates = []; let changed = 0; const samples = [];
// Gloss coverage per book: content words (not filler) that carry a "(gloss)" after
// rendering, over all content words — the number fieldy asked to see go up
// ("the coverage of hebrew words vs english glosses must be drastically improved").
const COV = new Map();       // canon -> { words, glossed }
const coverageOf = (text, canon) => {
  const c = COV.get(canon) || { words: 0, glossed: 0 }; COV.set(canon, c);
  const re = /\b([A-Za-z][A-Za-z']*)\b(\s*\([^()]*\))?/g; let m;
  while ((m = re.exec(text))) {
    const lw = m[1].toLowerCase();
    if (m[2]) { c.words++; c.glossed++; re.lastIndex = m.index + m[0].length; continue; }
    if (lw.length < 3 || VG_FILLER.has(lw) || COMMON.has(lw)) continue;
    c.words++;
  }
};
const pRender = progress('rendering untagged verses', rows.length);
for (const r of rows) {
  pRender.tick();
  // surface_occurrences is keyed by canonical ord_c/ord_v (the bake applied any
  // versification offset internally), so prefer those over the TEXT columns.
  const vgKey = `${r.canon_id}|${r.ord_c ?? parseInt(r.chapter, 10)}|${r.ord_v ?? parseInt(r.verse, 10)}`;
  const ref = `${r.canon_id}:${r.chapter}:${r.verse}`;
  const out = renderWithExceptions(r.src, ref, VERSE_EXCEPTIONS, text => render(text, vgKey));
  coverageOf(out, r.canon_id);
  if (out !== r.text) { changed++; updates.push({ id: r.id, text: out });
    if (!AT && samples.length < SHOW && out !== r.src) samples.push({ ref, before: r.src, after: out }); }
  if (AT && r.canon_id === AT.c && +(r.ord_c ?? r.chapter) === AT.ch && +(r.ord_v ?? r.verse) >= AT.v0 && +(r.ord_v ?? r.verse) <= AT.v1) samples.push({ ref, before: r.src, after: out });
}
pRender.done();
{
  const tot = { words: 0, glossed: 0 };
  for (const c of COV.values()) { tot.words += c.words; tot.glossed += c.glossed; }
  const pct = (c) => c.words ? (100 * c.glossed / c.words).toFixed(1) + '%' : '—';
  console.log(`gloss coverage: ${pct(tot)} of ${tot.words.toLocaleString()} content words carry a gloss`);
  if (VG.on) {
    console.log(`hebrew alignment: ${VG_ALIGN.used.toLocaleString()} verses glossed from their Hebrew (${VG_ALIGN.shifted.toLocaleString()} from a neighbouring verse), ${VG_ALIGN.rejected.toLocaleString()} rejected (Hebrew disagrees with the English — pins only)`);
    const bad = [...VG_ALIGN.byBook.entries()].filter(([, b]) => (b.shifted + b.rejected) >= 20 && (b.shifted + b.rejected) / (b.used + b.rejected) > 0.25)
      .sort((a, b) => (b[1].shifted + b[1].rejected) - (a[1].shifted + a[1].rejected)).slice(0, 12);
    if (bad.length) console.log('  versification suspects (book: used/shifted/rejected, commonest shift): ' + bad.map(([canon, b]) => { const top = [...b.shifts.entries()].sort((x, y) => y[1] - x[1])[0]; return `${canon}: ${b.used}/${b.shifted}/${b.rejected}${top ? ` (${top[0] > 0 ? '+' : ''}${top[0]}×${top[1]})` : ''}`; }).join(' · '));
  }
  if (ONLY.length || COV.size <= 12) for (const [canon, c] of [...COV.entries()].sort((a, b) => a[0] - b[0])) console.log(`  canon ${canon}: ${pct(c)} (${c.glossed.toLocaleString()}/${c.words.toLocaleString()})`);
  else {
    const worst = [...COV.entries()].filter(([, c]) => c.words > 200).sort((a, b) => (a[1].glossed / a[1].words) - (b[1].glossed / b[1].words)).slice(0, 8);
    console.log('  lowest: ' + worst.map(([canon, c]) => `${canon} ${pct(c)}`).join(' · '));
  }
}
if (LINKS.size) console.log(`links: ${LINK_STATS.applied.toLocaleString()} applied where they stood, ${LINK_STATS.moved.toLocaleString()} moved to where their English word actually is, ${LINK_STATS.stale.toLocaleString()} skipped (their English word is not in the verse)`);
console.log(`rows that would change: ${changed.toLocaleString()}`);
const clip = t => (AT || t.length <= 180) ? t : t.slice(0, 180) + '…';
for (const s of samples) { console.log(`\n  ${s.ref}`); console.log(`   - ${clip(s.before)}`); console.log(`   + ${clip(s.after)}`); }

if (!APPLY) { console.log('\n[report only] nothing written. Add --apply to write.'); db.close(); process.exit(0); }
const upd = db.prepare(`UPDATE verses SET text = ? WHERE id = ?`);
let n = 0; db.transaction(() => { for (const u of updates) n += upd.run(u.text, u.id).changes; })();
console.log(`\n\u2713 rewrote ${n.toLocaleString()} verses. Restart the server.`);
db.close();
