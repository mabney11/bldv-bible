// build-headings.mjs — produce public/headings.json: the two kinds of heading that
// belong to a chapter but are NOT verse text.
//
//   node build-headings.mjs
//
// 1. ACROSTIC LETTERS. Psalm 119 is 22 stanzas, one per Hebrew letter; Psalms 25,
//    34, 37, 111, 112, 145, Proverbs 31 and Lamentations 1-4 are acrostics too. The
//    source page prints them as "BET", "GIMEL" and they were leaking into the verse
//    text ("...forsake me. BET 9How can..."), and "SIN AND SHIN" was even being
//    transliterated as a word. They are structure, not scripture.
//
//    The label is YOUR transliteration of the letter's NAME, spelled in paleo and run
//    through translit() — 𐤀𐤋𐤐 -> Alap, 𐤁𐤉𐤕 -> Bayath. Not a table I typed.
//
// 2. SUPERSCRIPTIONS. The ingest now stores these at verse = 0 ("A Psalm of David").
//    Any chapter in ANY book with a verse 0 gets one — not just Psalms — so Habakkuk 3
//    and anything else with a title is handled by the same code.
//
// OUTPUT  public/headings.json
//   { "19:119": { "acrostics": { "1": {...}, "9": {...} },
//                 "super": { "paleo": "...", "translit": "..." } }, ... }
//   keyed canon:chapter, then by the verse the heading sits ABOVE.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Resolve everything relative to this script's own folder, not the process's cwd \u2014
// `npm run build` and entrypoint.sh both need to be able to invoke this from
// somewhere other than server/ and still find web-strongs.jsonl, corpus.db, and
// write to server/public/.
const HERE = dirname(fileURLToPath(import.meta.url));

const die = m => { console.error('\u2717 ' + m); process.exit(1); };
function locate(name, start = HERE, maxUp = 4) {
  let base = resolve(start);
  for (let up = 0; up <= maxUp; up++) {
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      let es; try { es = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of es) {
        if (e.isDirectory()) { if (/^(node_modules|\.git|dist|build)$/.test(e.name)) continue; stack.push(join(dir, e.name)); }
        else if (e.name === name) return join(dir, e.name);
      }
    }
    base = dirname(base);
  }
  return null;
}
const booksPath = locate('books.js');
if (!booksPath) die('books.js not found');
const { translit, LETTER_NAMES } = await import(pathToFileURL(booksPath).href);
if (typeof translit !== 'function') die('books.js has no translit()');
// LETTER_NAMES is the curated paleo-glyph -> name table books.js already exports
// (Alap, Bayath, Gamal, ...) and is what the rest of the app uses for letter names.
// Re-deriving a name here via translit(spelled-out-letter) used to produce a SECOND,
// slightly different set (e.g. "Alai" for Aleph instead of "Alap") — prefer the one
// source of truth when it's available.
if (!LETTER_NAMES) die('books.js has no LETTER_NAMES');

// letter -> paleo letter, paleo spelling of the letter's NAME
//
// Every nameP below is chosen so translit(nameP) reproduces the curated
// LETTER_NAMES label EXACTLY (checked by hand against books.js's med/fin
// CHAR_MAP, then re-verified with translit() itself — see verify-letters.mjs).
// Eight of the original entries did NOT round-trip (ALEPH ended in Ayin
// instead of Peh and translit'd to "Alai" not "Alap"; HE/HEY, WAW/VAV,
// YUD/YOD, KAF/CAPH, MEM, PEY/PE and KUF/QOPH had similar letter-swap or
// extra-letter typos). They went unnoticed because nothing rendered nameP
// on screen before the acrostic "spelled" field — only the separately
// curated LETTER_NAMES label was ever shown.
const LETTERS = {
  ALEPH:['\u{10900}','\u{10900}\u{1090B}\u{10910}'], BET:['\u{10901}','\u{10901}\u{10909}\u{10915}'],
  BETH:['\u{10901}','\u{10901}\u{10909}\u{10915}'],  GIMEL:['\u{10902}','\u{10902}\u{1090C}\u{1090B}'],
  DALED:['\u{10903}','\u{10903}\u{1090B}\u{10915}'], DALETH:['\u{10903}','\u{10903}\u{1090B}\u{10915}'],
  HE:['\u{10904}','\u{10904}\u{10909}'],             HEY:['\u{10904}','\u{10904}\u{10909}'],
  WAW:['\u{10905}','\u{10905}\u{10905}'],            VAV:['\u{10905}','\u{10905}\u{10905}'],
  ZAYIN:['\u{10906}','\u{10906}\u{10909}\u{1090D}'], CHET:['\u{10907}','\u{10907}\u{10909}\u{10915}'],
  HETH:['\u{10907}','\u{10907}\u{10909}\u{10915}'],  TET:['\u{10908}','\u{10908}\u{10909}\u{10915}'],
  YUD:['\u{10909}','\u{10909}\u{10903}'],            YOD:['\u{10909}','\u{10909}\u{10903}'],
  KAF:['\u{1090A}','\u{1090A}\u{10910}'],            CAPH:['\u{1090A}','\u{1090A}\u{10910}'],
  LAMED:['\u{1090B}','\u{1090B}\u{1090C}\u{10903}'], MEM:['\u{1090C}','\u{1090C}\u{10909}\u{1090C}'],
  NUN:['\u{1090D}','\u{1090D}\u{10905}\u{1090D}'],   SAMEKH:['\u{1090E}','\u{1090E}\u{1090C}\u{1090A}'],
  AYIN:['\u{1090F}','\u{1090F}\u{10909}\u{1090D}'],  PEY:['\u{10910}','\u{10910}\u{10904}'],
  PE:['\u{10910}','\u{10910}\u{10904}'],             TZADI:['\u{10911}','\u{10911}\u{10903}\u{10909}'],
  TSADE:['\u{10911}','\u{10911}\u{10903}\u{10909}'], KUF:['\u{10912}','\u{10912}\u{10910}'],
  QOPH:['\u{10912}','\u{10912}\u{10910}'],           RESH:['\u{10913}','\u{10913}\u{10914}'],
  SHIN:['\u{10914}','\u{10914}\u{10909}\u{1090D}'],  SIN:['\u{10914}','\u{10914}\u{10909}\u{1090D}'],
  TAV:['\u{10915}','\u{10915}\u{10905}'],            TAW:['\u{10915}','\u{10915}\u{10905}'],
};
const NAMES = Object.keys(LETTERS).sort((a,b)=>b.length-a.length);
const ACROSTIC_RE = new RegExp('\\b(' + NAMES.join('|') + ')(\\s+AND\\s+(' + NAMES.join('|') + '))?\\b', 'g');

const CODE2ID = {GEN:1,EXOD:2,LEV:3,NUM:4,DEUT:5,JOSH:6,JUDG:7,RUTH:8,'1SAM':9,'2SAM':10,'1KGS':11,
 '2KGS':12,'1CHR':13,'2CHR':14,EZRA:15,NEH:16,EST:17,JOB:18,PSA:19,PROV:20,ECCL:21,SONG:22,ISA:23,
 JER:24,LAM:25,EZK:26,DAN:27,HOS:28,JOEL:29,AMO:30,OBA:31,JONAH:32,MIC:33,NAM:34,HAB:35,ZEP:36,
 HAG:37,ZEC:38,MAL:39};

const out = {};

// ── 1. acrostics, read out of the tagged WEB ────────────────────────────────
// The source page prints the marker word ("BET", "GIMEL") right before the verse
// NUMBER that starts the new stanza, but the scraper glued it onto the END of the
// segment list for the PRECEDING verse ("...forsake me. BET" tagged as verse 8, not
// the "9How can..." it actually precedes). So a match at r.verse announces the
// stanza that begins at r.verse + 1, not r.verse itself. The very first stanza
// (Aleph, verse 1) is never printed as an explicit marker at all — real acrostic
// psalms always open on Aleph by definition, so it's synthesized below for any
// chapter that produced at least one other letter. A handful of verses (typically
// the chapter's last) carry scraped page-footer junk — cross-reference commentary
// that happens to contain a letter name — which can spuriously match; anything whose
// computed verse falls past the chapter's real last verse, or repeats a letter
// already recorded for that chapter, is dropped as noise rather than trusted.
const webStrongsPath = join(HERE, 'web-strongs.jsonl');
if (existsSync(webStrongsPath)) {
  const lines = readFileSync(webStrongsPath,'utf8').split(/\r?\n/).filter(Boolean);
  const maxVerse = {};   // "bid:chapter" -> highest real verse number in the source
  for (const line of lines) {
    const r = JSON.parse(line);
    const bid = CODE2ID[r.code]; if (!bid) continue;
    const key = `${bid}:${r.chapter}`;
    if (!maxVerse[key] || r.verse > maxVerse[key]) maxVerse[key] = r.verse;
  }
  const usedLetters = {};   // "bid:chapter" -> Set of letter names already placed
  for (const line of lines) {
    const r = JSON.parse(line);
    const bid = CODE2ID[r.code]; if (!bid) continue;
    const raw = r.segments.map(s => s.text).join(' ');
    let m; ACROSTIC_RE.lastIndex = 0;
    while ((m = ACROSTIC_RE.exec(raw))) {
      const first = m[1].toUpperCase();
      let pair = m[3] ? m[3].toUpperCase() : null;
      const [ltr, nameP] = LETTERS[first];
      // SHIN and SIN (and any other future homograph pair) share the IDENTICAL
      // paleo letter and spelling — paleo Hebrew has no dot to distinguish them,
      // that's a Masoretic-era addition. Pairing them just renders the same
      // glyph/name twice ("Shayan / Shayan"). Only keep `pair` when it's
      // actually a different letter.
      if (pair && LETTERS[pair][0] === ltr) pair = null;
      const label = LETTER_NAMES[ltr] || translit(nameP);
      const key = `${bid}:${r.chapter}`;
      const verse = r.verse + 1;                        // announces the NEXT stanza
      if (verse > (maxVerse[key] || 0)) continue;         // past the chapter — junk
      usedLetters[key] ||= new Set();
      if (usedLetters[key].has(first)) continue;          // letter already placed
      usedLetters[key].add(first);
      if (pair) usedLetters[key].add(pair);
      (out[key] ||= {}).acrostics ||= {};
      // `spelled` is the letter's NAME spelled out in paleo (𐤀𐤋𐤐 for Alap) — the
      // same nameP that produces `label`, just kept in paleo form for display
      // next to it. Reader.jsx puts its first character in gold to match the
      // big glyph above, since that's the letter actually being read first.
      out[key].acrostics[verse] = pair
        ? { letter: ltr + LETTERS[pair][0],
            label: label + ' / ' + (LETTER_NAMES[LETTERS[pair][0]] || translit(LETTERS[pair][1])),
            spelled: nameP + ' / ' + LETTERS[pair][1] }
        : { letter: ltr, label, spelled: nameP };
    }
  }
  // Synthesize the always-implicit opening Aleph for every chapter that turned out
  // to be a real acrostic (produced at least one other stanza letter).
  const [alephLtr, alephNameP] = LETTERS.ALEPH;
  const alephLabel = LETTER_NAMES[alephLtr] || translit(alephNameP);
  for (const key of Object.keys(out)) {
    if (out[key].acrostics && !out[key].acrostics['1']) {
      out[key].acrostics['1'] = { letter: alephLtr, label: alephLabel, spelled: alephNameP };
    }
  }
  console.log(`acrostic headings: ${Object.values(out).reduce((n,c)=>n+Object.keys(c.acrostics||{}).length,0)}`);
} else console.log('! web-strongs.jsonl not found — no acrostics');

// ── 2. superscriptions: ANY chapter of ANY book with a verse 0 ──────────────
try {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(join(HERE, 'corpus.db'), { readonly: true });
  const rows = db.prepare(`SELECT book_id, chapter, word_raw FROM tokens_bhs
      WHERE verse = 0 AND pos <> 'punct' ORDER BY book_id, chapter, token_ordinal`).all();
  db.close();
  const acc = new Map();
  for (const t of rows) {
    const k = `${t.book_id}:${t.chapter}`;
    if (!acc.has(k)) acc.set(k, []);
    acc.get(k).push(t.word_raw);
  }
  for (const [k, words] of acc) {
    (out[k] ||= {}).super = {
      paleo: words.join(' '),
      translit: words.map(w => translit(w)).join(' '),
    };
  }
  console.log(`superscriptions: ${acc.size} chapters`);
} catch (e) { console.log('! corpus.db unavailable — no superscriptions (' + e.message + ')'); }

// server/public/ — the exact directory server.js serves with
// app.use(express.static('public', ...)), so /headings.json resolves with no server
// route to add. locate() only ever matches FILES (it recurses into every directory
// without checking its name against `name`, and only compares names in the `else`
// branch for non-directories) so locate('public') can never find a directory called
// "public" — it silently returned null and every run before this one wrote
// server/headings.json instead, which express never serves. Resolve it directly,
// relative to this script's own folder, instead.
const pub = join(HERE, 'public');
try { mkdirSync(pub, { recursive: true }); } catch {}
const dest = join(pub, 'headings.json');
writeFileSync(dest, JSON.stringify(out));
console.log(`\n\u2713 ${dest} — ${Object.keys(out).length} chapters`);
const p119 = out['19:119'];
if (p119) {
  console.log('\nPsalm 119 stanza headings (first 4):');
  for (const [v, h] of Object.entries(p119.acrostics).slice(0,4))
    console.log(`   above v${v.padEnd(4)} ${h.letter}  ${h.label}`);
}
