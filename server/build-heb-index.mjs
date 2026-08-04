// build-heb-index.mjs
//
// ⚠ DEPRECATED 2026-08-01 — DO NOT RUN WITH --apply. ⚠
// This is the "second opinion" tagger sync-heb-tokens.mjs's own header warns about:
// it and heb-align.js (via build-surface-index.js --heb) disagree on ~1 in 5 OT
// tokens and ~2 in 3 NT tokens, and only heb-align.js's output is what the reader
// actually serves (surface-index.db). sync-heb-tokens.mjs --apply makes tokens_nt
// a PROJECTION of that index instead — the correct, current pipeline.
// This file was re-run with --apply at least once AFTER that sync (confirmed via
// tokens_nt.source_id='HEB-ALIGNED' on 2026-08-01, postdating both
// tokens_nt_pre_sync_20260723 and _20260724 backups), which silently regressed
// prefix/suffix decomposition for every NT book whose HEB bake wasn't ALSO
// current in surface-index.db (3 John 1 confirmed: 0 rows under source='HEB').
// Fix: node build-surface-index.js --heb, then node sync-heb-tokens.mjs --apply.
// Leaving this file in place for reference only — move to archive/ once confident
// nothing still depends on it.
//
// fieldy's insight: the HEB corpus ("Hebrew extra") covers the OT *and* the NT in ONE
// orthography. Its OT half is the same text BHS carries with attested Strong's — so
// aligning HEB-OT against BHS verse by verse yields a HEB-orthography -> Strong's map that
// is EVIDENCED, not guessed. That map then applies to the NT, which is written in the same
// orthography. That is strictly better than build-nt-tokens.mjs, which matched NT words
// against BHS surface forms across an edition boundary — the likely cause of the 7.7%
// unresolved and 4,568 low-confidence rows.
//
//   node build-heb-index.mjs --dry --out heb-index.txt     measure only
//   node build-heb-index.mjs --apply                       rebuild tokens_nt with it
//   node build-heb-index.mjs --apply --ot                  ALSO tag HEB's OT (canon 1-39)
//   node build-heb-index.mjs --apply --docs                ALSO tag doc-based (canon_id
//                                                           NULL) HEB works — Dead Sea
//                                                           Scrolls, and any future
//                                                           non-canonical Hebrew addition
//
// --ot is what fixes Genesis in the Heb Extra viewer: HEB's OT books currently have no
// tokens at all, so they fall back to the text view and the 285-entry lexicon.
//
// --docs (added 2026-07-31, fieldy: "let's ensure all hebrew sources get transformed
// into descriptive tokens... this includes for the DSS stuff") runs the exact SAME
// resolve()/variants() evidence engine as the canonical range above, against
// corpus='HEB' rows that have NO canon_id — Works Library items, keyed by `code`
// instead of book_id, since they were never promoted into the main book dropdown.
// This is why DSS scrolls (or Jasher-style apocrypha, if never promoted) showed every
// word as "— not glossed —": build-heb-index.mjs's target query has ALWAYS filtered on
// `canon_id BETWEEN ? AND ?`, which silently excludes canon_id IS NULL rows entirely —
// not a bug in resolve() itself, just a range this file never asked it to cover. DSS
// reuses a lot of ordinary Biblical Hebrew vocabulary (אל, כל, אשר, בני, ברית, ...), so
// the SAME OT-alignment evidence that glosses Jubilees/Jasher/the NT already covers a
// real share of DSS words too — this is not a new inference method, just widening
// which rows get to use the one that already exists. A word only gets full prefix/
// root/suffix decomposition (a `morph` value) when it EXACTLY matches an attested BHS
// surface form, same rule as everywhere else in this file — a DSS word spelled
// differently than its Biblical Hebrew cousin (matres lectionis are common in Qumran
// orthography) still gets a Strong's-number badge via variant/self matching, just
// without the decomposed prefix chips. That is not a shortfall of this pass, it is the
// same honesty rule the NT/apocrypha tokens already live by.

import Database from 'better-sqlite3';
import { existsSync, writeFileSync } from 'node:fs';
import util from 'node:util';

const args = process.argv.slice(2);
const argv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const APPLY = args.includes('--apply');
const DO_OT = args.includes('--ot');
const DO_DOCS = args.includes('--docs');
const TABLE = argv('--table', 'tokens_nt');

const OUTFILE = argv('--out', '');
const buf = [];
if (OUTFILE) {
  const rawLog = console.log.bind(console), rawTable = console.table.bind(console);
  const fmt = a => a.map(x => typeof x === 'string' ? x : util.inspect(x, { depth: 4, breakLength: 140 })).join(' ');
  console.log = (...a) => { buf.push(fmt(a)); rawLog(...a); };
  console.table = rows => { rawTable(rows);
    if (!Array.isArray(rows) || !rows.length) { buf.push('(no rows)'); return; }
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
    const line = c2 => '  ' + c2.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ');
    buf.push(line(cols)); buf.push('  ' + w.map(n => '-'.repeat(n)).join('  '));
    for (const r of rows) buf.push(line(cols.map(c => r[c]))); };
  process.on('exit', () => { try { writeFileSync(OUTFILE, buf.join('\n') + '\n', 'utf8');
    rawLog(`\n[written to ${OUTFILE}]`); } catch (e) { rawLog(`\n[write failed: ${e.message}]`); } });
}

if (!existsSync('./corpus.db')) { console.error('corpus.db not found — run from server/'); process.exit(1); }
const db = new Database('./corpus.db', { readonly: !APPLY });

// ── 0. DISCOVERY: report every token-ish table, in case OT tokens live somewhere I
//       haven't seen. Nothing below assumes more than tokens_bhs + the HEB verses.
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);
console.log('tables:', tables.join(', '));
for (const t of tables.filter(n => /token|morph|word|surface/i.test(n))) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  const n = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log(`  ${t}: ${n.toLocaleString()} rows [${cols.join(',')}]`);
}

const HEBREWISH = /[\u0590-\u05FF]|[\u{10900}-\u{1091F}]/u;
// Plain ASCII hyphen added to the split class: this codebase's OWN maqaf handling for
// BHS tokens (server.js/parseHebrewData) renders the maqaf word-joiner's translit as a
// literal "-", which means it's plausible the SAME ASCII "-" was used to mark maqaf (or
// any other word boundary) when the HEB "extra" corpus's raw verse text was ingested \u2014
// a transliteration-adjacent source is far more likely to use a keyboard hyphen than the
// proper Hebrew maqaf codepoint (\u05BE, already covered below). Two real, unrelated
// Hebrew words joined by a bare "-" with no other separator would otherwise never split,
// which is the most likely explanation for reader blobs like "Athahaiwalamawath" \u2014 "Atha"
// (You) is a free-standing pronoun, never a bound prefix, so its fusion to what follows
// means the boundary between two SEPARATE WORDS went missing, not that one long word
// needs a smarter prefix analysis. Adding "-" here is safe either way: if it never
// actually occurs in this corpus's text, this is a no-op.
const SPLIT = /[\s\u05BE\u05C3\u05C0.,;:!?()"'\u2019\u201c\u201d\u05F3\u05F4-]+/;
const wordsOf = t => String(t || '').split(SPLIT).filter(w => w && HEBREWISH.test(w));

// ── 1. ALIGN HEB-OT against BHS, verse by verse ─────────────────────────────────────
// Same verse, same text, same word order — so token N on one side is token N on the other.
// Only verses whose token COUNTS match are used: an unequal count means the two editions
// split that verse differently, and a positional guess there would be noise, not evidence.
console.log('\naligning HEB Old Testament against BHS …');
const otVerses = db.prepare(
  `SELECT canon_id, ord_c, ord_v, text FROM verses
   WHERE corpus='HEB' AND canon_id BETWEEN 1 AND 39 AND ord_c IS NOT NULL`).all();
// morph is fetched WITH pos because the component decomposition (prefix/root/suffix) in
// surface-index.db is keyed on (word_raw, strongs, pos, morph). Carrying morph across the
// alignment is what lets a HEB word reuse the BHS reading's baked-out components — i.e.
// what turns "HaMashayach" into Ha- + Mashayach instead of one opaque block.
const bhsFor = db.prepare(
  `SELECT word_raw, strongs, pos, morph FROM tokens_bhs
   WHERE book_id=? AND chapter=? AND verse=? ORDER BY token_ordinal`);

const hebIndex = new Map();            // HEB form -> Map(strongs -> count)
const hebPos   = new Map();            // HEB form -> Map(pos -> count)
const hebMorph = new Map();            // HEB form -> Map(morph -> count)
let vSeen = 0, vPositional = 0, pExact = 0, pPos = 0, pUnique = 0;
const bump = (m, k, v) => { if (!k || !v) return; const e = m.get(k) || new Map();
  e.set(v, (e.get(v) || 0) + 1); m.set(k, e); };
const snOf = t => t.strongs && ('H' + String(t.strongs).replace(/^H+/i, ''));

// Requiring equal token counts aligned only 53 of 23,213 verses — the two editions
// segment almost every verse differently (maqaf joins, particles, matres). So alignment
// runs in three passes, none of which needs the counts to agree:
for (const v of otVerses) {
  const hw = wordsOf(v.text);
  if (!hw.length) continue;
  const bt = bhsFor.all(v.canon_id, v.ord_c, v.ord_v).filter(t => t.word_raw && HEBREWISH.test(t.word_raw));
  if (!bt.length) continue;
  vSeen++;
  const claimedH = new Set(), claimedB = new Set();

  // PASS 1 — SAME FORM, SAME VERSE. If a HEB word is spelled exactly as a BHS token in
  // the same verse, that is evidence no matter where it sits or how many words surround
  // it. This is the pass that works everywhere, and it needs no count agreement at all.
  const byForm = new Map();
  bt.forEach((t, i) => { const a = byForm.get(t.word_raw) || []; a.push(i); byForm.set(t.word_raw, a); });
  hw.forEach((w, i) => {
    const cand = byForm.get(w);
    if (cand && cand.length) {
      const j = cand.shift();
      const sn = snOf(bt[j]);
      if (sn) { bump(hebIndex, w, sn); bump(hebPos, w, bt[j].pos); bump(hebMorph, w, bt[j].morph); pExact++; }
      claimedH.add(i); claimedB.add(j);
    }
  });

  // PASS 2 — POSITIONAL, only where the counts DO agree, for the words pass 1 missed.
  // Those are the genuinely different spellings, which is exactly what we want to learn.
  if (bt.length === hw.length) {
    vPositional++;
    for (let i = 0; i < hw.length; i++) {
      if (claimedH.has(i) || claimedB.has(i)) continue;
      const sn = snOf(bt[i]);
      if (sn) { bump(hebIndex, hw[i], sn); bump(hebPos, hw[i], bt[i].pos); bump(hebMorph, hw[i], bt[i].morph); pPos++; }
      claimedH.add(i); claimedB.add(i);
    }
  }

  // PASS 3 — ELIMINATION. If exactly one word is unclaimed on each side, they must be
  // each other, whatever the verse length. Cheap, and it catches the single odd spelling
  // in an otherwise-matching verse.
  const remH = hw.map((_, i) => i).filter(i => !claimedH.has(i));
  const remB = bt.map((_, i) => i).filter(i => !claimedB.has(i));
  if (remH.length === 1 && remB.length === 1) {
    const sn = snOf(bt[remB[0]]);
    if (sn) { bump(hebIndex, hw[remH[0]], sn); bump(hebPos, hw[remH[0]], bt[remB[0]].pos); bump(hebMorph, hw[remH[0]], bt[remB[0]].morph); pUnique++; }
  }
}
const pairs = pExact + pPos + pUnique;
console.log(`  OT verses with BHS tokens: ${vSeen.toLocaleString()} · of those, count-matched: ${vPositional.toLocaleString()}`);
console.log(`  pairs — same-form ${pExact.toLocaleString()} · positional ${pPos.toLocaleString()} · elimination ${pUnique.toLocaleString()}`);
console.log(`  total aligned pairs: ${pairs.toLocaleString()} · distinct HEB forms: ${hebIndex.size.toLocaleString()}`);

// ── 2. the old BHS-surface index, for comparison ────────────────────────────────────
const bhsIndex = new Map(), bhsPos = new Map(), bhsMorph = new Map();
for (const r of db.prepare(`SELECT word_raw, strongs, pos, morph FROM tokens_bhs WHERE strongs IS NOT NULL AND strongs<>''`).iterate()) {
  if (!r.word_raw) continue;
  bump(bhsIndex, r.word_raw, 'H' + String(r.strongs).replace(/^H+/i, ''));
  bump(bhsPos, r.word_raw, r.pos);
  bump(bhsMorph, r.word_raw, r.morph);
}
const top = m => { let best = null, n = 0, tot = 0;
  for (const [k, c] of m) { tot += c; if (c > n) { best = k; n = c; } } return { key: best, share: tot ? n / tot : 0 }; };

// ── 3. variants, for forms neither index saw exactly ────────────────────────────────
// '\u{1090F}\u{1090B}' (ayin+lamed, "al" \u2014 over/upon/concerning) listed FIRST so
// it's tried before the bare 1-letter lamed it starts with. Found by decoding a
// reader-reported unresolved word letter-by-letter (Ilahamalaakayam = ayin+lamed+
// he+mem+lamed+aleph+kaf+yod+mem \u2014 the leading "Ila" is ayin+lamed, not aleph+lamed
// as first guessed; aleph transliterates as A here, not I) \u2014 it was missing from
// this list entirely, which is presumably why words carrying it were staying
// unresolved rather than being caught by the existing single-letter prefixes.
const PFX = ['\u{1090F}\u{1090B}',
             '\u{10905}','\u{10904}','\u{10901}','\u{1090B}','\u{1090A}','\u{1090C}','\u{10914}',
             '\u05D5','\u05D4','\u05D1','\u05DC','\u05DB','\u05DE','\u05E9'];
const SFX = ['\u{10909}\u{10904}','\u{10904}','\u{10905}','\u{10909}','\u{1090A}','\u{1090C}'];
// Real Hebrew words routinely stack THREE OR FOUR prefixes (conjunction + preposition +
// article + interrogative-he, e.g. הֲוְכַשָּׂדֶה — "and-is-it-like-the-field") and
// occasionally two suffix layers (a nominal ending plus a pronominal suffix). The
// original version here only ever tried ONE prefix (plus, in the same breath, a SECOND
// one chained immediately after it) and ONE suffix — never combinations beyond that —
// which is exactly why words with a deeper affix stack were left as one unresolved
// blob instead of peeling down to an attested root. This generates every residual
// reachable by stripping 0..MAX_PFX_DEPTH prefixes (one at a time, in whatever order the
// PFX list allows — Hebrew's prefixes always attach in a fixed relative order, so trying
// every DEPTH along that one path covers it without needing every permutation) crossed
// with 0..MAX_SFX_DEPTH suffixes, so "prefix+prefix+prefix+root+suffix" is now a
// reachable candidate, not just "prefix+root+suffix".
const MAX_PFX_DEPTH = 4;
const MAX_SFX_DEPTH = 2;
const variants = w => {
  const out = [], seen = new Set([w]);
  const push = v => { if (v && [...v].length > 1 && !seen.has(v)) { seen.add(v); out.push(v); } };

  let pfxLayer = [w];
  for (let depth = 0; depth < MAX_PFX_DEPTH; depth++) {
    const next = [];
    for (const s of pfxLayer) for (const p of PFX) {
      if (s.startsWith(p) && s.length > p.length) { const stripped = s.slice(p.length); push(stripped); next.push(stripped); }
    }
    if (!next.length) break;
    pfxLayer = next;
  }

  // Suffix-strip the original word AND every prefix-stripped residual found above, so
  // prefixes and suffixes combine instead of only ever being tried in isolation.
  for (const base of [w, ...out]) {
    let sfxLayer = [base];
    for (let depth = 0; depth < MAX_SFX_DEPTH; depth++) {
      const next = [];
      for (const s of sfxLayer) for (const suf of SFX) {
        if (s.endsWith(suf) && s.length > suf.length) { const stripped = s.slice(0, -suf.length); push(stripped); next.push(stripped); }
      }
      if (!next.length) break;
      sfxLayer = next;
    }
  }
  return out;
};

// Total evidence behind a resolved surface: how many times, across the whole corpus,
// this exact form was aligned to ANY Strong's (summed across every candidate SN seen
// for it, not just the winning one). Used below to weigh a whole fused reading against
// a prefix-stripped one by how COMMON each is, not just by which tier found it first.
const totalOf = (m, k) => { if (!m.has(k)) return 0;
  let t = 0; for (const c of m.get(k).values()) t += c; return t; };

// fieldy: "מארץ [min+eretz] always renders MaAratz" — the from-prefix מ was never split
// off "the land", because an EXACT match on the whole fused string (however rare that
// exact fusion is) always outranked a FAR more common prefix-stripped reading. A word
// this frequent (ארץ, "earth/land", one of the commonest nouns in the Hebrew Bible)
// recognized as a stripped prefix + common root is more likely correct than treating
// the fused letters as their own rare, unique lexeme. VARIANT_DOMINANCE is how many
// times more attested the variant's root must be, over the exact whole-word form,
// before it overrides the exact match.
const VARIANT_DOMINANCE = Math.max(1, parseFloat(argv('--variant-dominance', '3')) || 3);

/** Resolve one HEB word. Whichever of {exact, best variant} has the stronger evidence
 *  wins (see VARIANT_DOMINANCE above); otherwise falls back to exact-first, same as
 *  before. */
function resolve(w) {
  const P = (m, k) => (m.has(k) ? top(m.get(k)).key : null);
  // NOTE on morph and variants: an EXACT match may reuse the BHS reading's morph directly,
  // because the surface is identical and surface-index.db is keyed on that surface. A
  // VARIANT match must NOT — the variant was found by stripping a prefix, so the stripped
  // form's morph describes a DIFFERENT word than the one on the page, and reusing it would
  // decompose the block wrongly. Variants therefore carry morph: null and render whole.
  let exact = null;
  if (hebIndex.has(w)) { const t = top(hebIndex.get(w));
    exact = { sn: t.key, conf: t.share, how: 'aligned', pos: P(hebPos, w), morph: P(hebMorph, w), freq: totalOf(hebIndex, w) }; }
  else if (bhsIndex.has(w)) { const t = top(bhsIndex.get(w));
    exact = { sn: t.key, conf: t.share, how: 'bhs-surface', pos: P(bhsPos, w), morph: P(bhsMorph, w), freq: totalOf(bhsIndex, w) }; }

  let variant = null;
  for (const v of variants(w)) {
    if (hebIndex.has(v)) { const t = top(hebIndex.get(v)); const freq = totalOf(hebIndex, v);
      if (!variant || freq > variant.freq) variant = { sn: t.key, conf: t.share * 0.97, how: 'aligned-variant', pos: P(hebPos, v), morph: null, freq }; }
    if (bhsIndex.has(v)) { const t = top(bhsIndex.get(v)); const freq = totalOf(bhsIndex, v);
      if (!variant || freq > variant.freq) variant = { sn: t.key, conf: t.share * 0.95, how: 'bhs-variant', pos: P(bhsPos, v), morph: null, freq }; }
  }

  if (exact && variant && variant.freq >= exact.freq * VARIANT_DOMINANCE) return variant;
  if (exact) return exact;
  if (variant) return variant;
  return { sn: null, conf: 0, how: 'unresolved', pos: null, morph: null };
}

// ── 4. re-tag, and measure against the BHS-only baseline ────────────────────────────
// UPPER BOUND WAS HARDCODED TO 66 (the 66 canonical books), which silently excluded
// every pseudepigrapha/apocrypha book — Jubilees (canon_id 68), 1 Enoch (67), Jasher
// (100), etc. — from ever being aligned against BHS, even though the SAME resolve()
// evidence-based alignment used for the NT (canon 40-66) works identically well for
// them: fieldy's book-order.json already assigns every one of these a real canon_id
// ("Pseudepigrapha now carry canon_ids too ... canon and non-canon order together
// here with no distinction"), so there is no reason the Heb Extra tokenizer should
// treat them differently. The upper bound is now DERIVED from the actual data instead
// of a stale literal, so newly-added books never need this file edited again.
const _hiRow = db.prepare(`SELECT MAX(canon_id) AS hi FROM verses WHERE corpus='HEB'`).get();
const HI_ALL = Math.max(66, (_hiRow && _hiRow.hi) || 66);
const range = DO_OT ? [1, HI_ALL] : [40, HI_ALL];
const target = db.prepare(
  `SELECT canon_id, ord_c, ord_v, text FROM verses
   WHERE corpus='HEB' AND canon_id BETWEEN ? AND ? AND ord_c IS NOT NULL
   ORDER BY canon_id, ord_c, ord_v`).all(range[0], range[1]);
console.log(`\nre-tagging canon ${range[0]}-${range[1]} · ${target.length.toLocaleString()} verses`);

const out = []; const byHow = new Map(); let total = 0, resolved = 0, wouldMissBhsOnly = 0;
for (const v of target) {
  let ord = 0;
  for (const w of wordsOf(v.text)) {
    ord++; total++;
    const r = resolve(w);
    if (r.sn) resolved++;
    if (r.sn && (r.how === 'aligned' || r.how === 'aligned-variant') && !bhsIndex.has(w)) wouldMissBhsOnly++;
    out.push({ book_id: v.canon_id, chapter: v.ord_c, verse: v.ord_v, token_ordinal: ord,
               word_raw: w, strongs: r.sn, pos: r.pos, morph: r.morph, match_kind: r.how,
               confidence: Number(r.conf.toFixed(3)) });
  }
}

// ── 4b. SELF-REFERENTIAL PASS — additive evidence, not shape-based guessing ──────────
// hebIndex/bhsIndex only carry evidence from BHS (the OT). A word genuinely unique to
// this corpus's own NT/apocrypha vocabulary — one BHS never attests in any form — can
// still occur MANY times within this same re-tag run, and if even one of those
// occurrences resolved (evidence from this pass itself), every other occurrence of
// that EXACT attested form is real evidence too, not a guess. This is still
// evidence-first: a residual only counts if it is a form THIS RUN ITSELF actually
// resolved with real evidence elsewhere — never a shape-based assumption about what a
// leftover string after stripping "ought" to mean. (See CLAUDE.md, "Exception lists
// like NME_EXCLUSIONS are artifacts, not the design" — the same additive-only
// principle: attest, then add; never strip-and-hope.)
const selfIndex = new Map(), selfPos = new Map(), selfMorph = new Map();
const SELF_HOW = new Set(['aligned', 'bhs-surface', 'aligned-variant', 'bhs-variant']);
for (const r of out) {
  if (r.strongs && SELF_HOW.has(r.match_kind)) {
    bump(selfIndex, r.word_raw, r.strongs);
    if (r.pos)   bump(selfPos,   r.word_raw, r.pos);
    if (r.morph) bump(selfMorph, r.word_raw, r.morph);
  }
}
// Mirrors resolve()'s own exact-vs-variant structure exactly (including reusing
// VARIANT_DOMINANCE for the same reason: a far-more-attested stripped form should
// still win over a barely-attested whole-word coincidence). Confidence multipliers
// (0.9 / 0.8) sit a full tier below resolve()'s own (which use 0.97 / 0.95) — this
// evidence is one hop further from the original BHS-tagged source, so it says so.
let selfResolved = 0;
const P2 = (m, k) => (m.has(k) ? top(m.get(k)).key : null);
for (const r of out) {
  if (r.strongs) continue;  // only touch what resolve() truly could not place

  let exact = null;
  if (selfIndex.has(r.word_raw)) {
    const t = top(selfIndex.get(r.word_raw));
    exact = { sn: t.key, conf: t.share * 0.9, how: 'self-aligned',
              pos: P2(selfPos, r.word_raw), morph: P2(selfMorph, r.word_raw), freq: totalOf(selfIndex, r.word_raw) };
  }

  let variant = null;
  for (const v of variants(r.word_raw)) {
    if (!selfIndex.has(v)) continue;
    const t = top(selfIndex.get(v)); const freq = totalOf(selfIndex, v);
    if (!variant || freq > variant.freq) {
      // Self-variant strips a prefix off an already-self-attested (not BHS-attested)
      // form, so — same reasoning as resolve()'s own variant path — it carries no
      // morph; reusing one would describe a different word than the one on the page.
      variant = { sn: t.key, conf: t.share * 0.8, how: 'self-variant', pos: P2(selfPos, v), morph: null, freq };
    }
  }

  const best = (exact && variant && variant.freq >= exact.freq * VARIANT_DOMINANCE) ? variant : (exact || variant);
  if (best && best.sn) {
    r.strongs = best.sn; r.pos = best.pos; r.morph = best.morph;
    r.match_kind = best.how; r.confidence = Number(best.conf.toFixed(3));
    resolved++; selfResolved++;
  }
}
for (const r of out) byHow.set(r.match_kind, (byHow.get(r.match_kind) || 0) + 1);

const pct = n => total ? `${(n / total * 100).toFixed(1)}%` : '—';
console.log(`\n=== RESOLUTION ===`);
console.log(`tokens    : ${total.toLocaleString()}`);
for (const [k, n] of [...byHow].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${n.toLocaleString().padStart(8)}  ${pct(n)}`);
console.log(`RESOLVED  : ${resolved.toLocaleString()} (${pct(resolved)})`);
console.log(`\nof those, ${wouldMissBhsOnly.toLocaleString()} were resolved ONLY because of the HEB-OT alignment`);
console.log('(the BHS surface index alone had never seen those exact forms)');
console.log(`${selfResolved.toLocaleString()} more were resolved ONLY because the same form (or a stripped`);
console.log('variant of it) occurred elsewhere in THIS corpus and resolved there (self-aligned/self-variant)');
const withMorph = out.filter(r => r.morph).length;
console.log(`\nrows carrying MORPH (these decompose into prefix/root/suffix): ${withMorph.toLocaleString()} (${pct(withMorph)})`);
console.log('Only exact-surface matches carry morph — a variant match stripped a prefix, so');
console.log('the stripped form\'s morph would describe a different word and is deliberately dropped.');
const low = out.filter(r => r.strongs && r.confidence < 0.6).length;
console.log(`low-confidence rows (<0.6): ${low.toLocaleString()}`);

// ── 5. DOC-BASED (canon_id IS NULL) WORKS — same engine, different range ────────────
// Deliberately a SEPARATE block, not a generalization of the one above: the existing
// canonical pass is proven (99.4%/88.8% figures in heb-align.js's sibling work) and
// this file has a documented history of being finicky (see fold_diacritics-adjacent
// notes elsewhere in this repo) — duplicating a few dozen lines costs nothing and
// guarantees --docs can NEVER change canonical output, even by accident, regardless
// of whether it's passed.
let docOut = [], docCodes = [];
if (DO_DOCS) {
  const docTarget = db.prepare(
    `SELECT code, ord_c AS chapter, ord_v AS verse, text FROM verses
     WHERE corpus='HEB' AND canon_id IS NULL AND code IS NOT NULL AND ord_c IS NOT NULL
     ORDER BY code, ord_c, ord_v`).all();
  docCodes = [...new Set(docTarget.map(r => r.code))];
  console.log(`\nre-tagging ${docCodes.length.toLocaleString()} doc-based work(s) `
              + `(canon_id IS NULL) · ${docTarget.length.toLocaleString()} verses`);

  let docTotal = 0, docResolved = 0;
  const docByHow = new Map();
  const codeOrd = new Map();  // per-code running token_ordinal, mirrors `ord` above
  for (const v of docTarget) {
    const key = v.code;
    let ord = codeOrd.get(key) || 0;
    for (const w of wordsOf(v.text)) {
      ord++; docTotal++;
      const r = resolve(w);
      if (r.sn) docResolved++;
      docOut.push({ code: v.code, chapter: v.chapter, verse: v.verse, token_ordinal: ord,
                    word_raw: w, strongs: r.sn, pos: r.pos, morph: r.morph, match_kind: r.how,
                    confidence: Number(r.conf.toFixed(3)) });
    }
    codeOrd.set(key, ord);
  }

  // Self-referential pass — SAME idea as 4b, but its own index, built only from THIS
  // doc-pass's own resolutions. Kept separate from the canonical selfIndex on purpose:
  // an evidence pool this run couldn't otherwise see (a DSS-only word attested many
  // times in DSS but never in Torah/NT/apocrypha) shouldn't be diluted by, or leak
  // into, the canonical corpus's own self-referential evidence.
  const docSelfIndex = new Map(), docSelfPos = new Map(), docSelfMorph = new Map();
  for (const r of docOut) {
    if (r.strongs && SELF_HOW.has(r.match_kind)) {
      bump(docSelfIndex, r.word_raw, r.strongs);
      if (r.pos)   bump(docSelfPos,   r.word_raw, r.pos);
      if (r.morph) bump(docSelfMorph, r.word_raw, r.morph);
    }
  }
  let docSelfResolved = 0;
  const P3 = (m, k) => (m.has(k) ? top(m.get(k)).key : null);
  for (const r of docOut) {
    if (r.strongs) continue;
    let exact = null;
    if (docSelfIndex.has(r.word_raw)) {
      const t = top(docSelfIndex.get(r.word_raw));
      exact = { sn: t.key, conf: t.share * 0.9, how: 'self-aligned',
                pos: P3(docSelfPos, r.word_raw), morph: P3(docSelfMorph, r.word_raw), freq: totalOf(docSelfIndex, r.word_raw) };
    }
    let variant = null;
    for (const v of variants(r.word_raw)) {
      if (!docSelfIndex.has(v)) continue;
      const t = top(docSelfIndex.get(v)); const freq = totalOf(docSelfIndex, v);
      if (!variant || freq > variant.freq) {
        variant = { sn: t.key, conf: t.share * 0.8, how: 'self-variant', pos: P3(docSelfPos, v), morph: null, freq };
      }
    }
    const best = (exact && variant && variant.freq >= exact.freq * VARIANT_DOMINANCE) ? variant : (exact || variant);
    if (best && best.sn) {
      r.strongs = best.sn; r.pos = best.pos; r.morph = best.morph;
      r.match_kind = best.how; r.confidence = Number(best.conf.toFixed(3));
      docResolved++; docSelfResolved++;
    }
  }
  for (const r of docOut) docByHow.set(r.match_kind, (docByHow.get(r.match_kind) || 0) + 1);

  const docPct = n => docTotal ? `${(n / docTotal * 100).toFixed(1)}%` : '—';
  console.log(`\n=== DOC-BASED RESOLUTION ===`);
  console.log(`tokens    : ${docTotal.toLocaleString()}`);
  for (const [k, n] of [...docByHow].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${n.toLocaleString().padStart(8)}  ${docPct(n)}`);
  console.log(`RESOLVED  : ${docResolved.toLocaleString()} (${docPct(docResolved)}) — ${docSelfResolved.toLocaleString()} of those via self-aligned/self-variant`);
  const docWithMorph = docOut.filter(r => r.morph).length;
  console.log(`rows carrying MORPH (decompose into prefix/root/suffix): ${docWithMorph.toLocaleString()} (${docPct(docWithMorph)})`);
}

if (!APPLY) { console.log('\n[dry run] nothing written.'); db.close(); process.exit(0); }

// ── CANONICAL WRITE (book_id-keyed tokens_nt) — DEPRECATED, see file header ─────
// sync-heb-tokens.mjs, projecting tokens_nt from surface-index.db, is the current
// source of truth for every canonical book_id row. Writing tokens_nt here again —
// which this script did unconditionally on every --apply until 2026-08-01, and is
// what caused the "my Hebrew sources aren't well split anymore" regression — reopens
// the "two producers disagree" split sync-heb-tokens.mjs exists to close. Left in
// place only behind a loud, explicit flag for a hypothetical emergency; nobody
// should reach for it without first reading sync-heb-tokens.mjs's own header.
const FORCE_CANON = args.includes('--force-canon-DEPRECATED');
if (!FORCE_CANON) {
  if (!DO_DOCS) {
    console.log(`\nSkipping the canonical ${TABLE} write — this script is deprecated for that`);
    console.log('(see the file header). Run sync-heb-tokens.mjs instead. Pass --docs if you');
    console.log('meant to tag Works Library items, or --force-canon-DEPRECATED if you really');
    console.log("need the old write (you almost certainly don't — read sync-heb-tokens.mjs first).");
  }
} else {
db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (
  source_id TEXT, book_id INTEGER, chapter INTEGER, verse INTEGER, token_ordinal INTEGER,
  word_raw TEXT, lemma TEXT, root TEXT, pos TEXT, morph TEXT, strongs TEXT,
  match_kind TEXT, confidence REAL)`);
db.exec(`CREATE INDEX IF NOT EXISTS ${TABLE}_ref ON ${TABLE}(book_id, chapter, verse, token_ordinal)`);
db.prepare(`DELETE FROM ${TABLE} WHERE book_id BETWEEN ? AND ?`).run(range[0], range[1]);
// TABLE MAY ALREADY EXIST WITH A NARROWER SCHEMA. CREATE TABLE IF NOT EXISTS is a
// no-op when the table is already there, and a prior sync/rebuild left this server's
// tokens_nt without lemma/root/match_kind/confidence (columns actually seen at
// startup: book_id,chapter,verse,token_ordinal,word_raw,pos,morph,strongs,source_id).
// Insert only into columns that really exist so this never depends on which variant
// of the table happens to be deployed.
const existingCols = new Set(db.prepare(`PRAGMA table_info(${TABLE})`).all().map(c => c.name));
const WANT = ['source_id', 'book_id', 'chapter', 'verse', 'token_ordinal', 'word_raw',
              'lemma', 'root', 'pos', 'morph', 'strongs', 'match_kind', 'confidence'];
const cols = WANT.filter(c => existingCols.has(c));
if (!existingCols.size) { // table_info returned nothing at all — unexpected, bail loudly
  console.error(`✗ ${TABLE} has no columns per PRAGMA table_info — aborting write.`);
  db.close(); process.exit(1);
}
// The deployed table enforces NOT NULL on some TEXT columns (morph, seen live —
// possibly others depending on which sync snapshot created it). resolve() legitimately
// returns null morph/pos for variant matches (a stripped prefix means the matched
// form's morph describes a different word, so it's deliberately dropped — see the
// comment above resolve()), and unresolved rows have null strongs/pos/morph entirely.
// Coalesce every TEXT field to '' rather than NULL so the insert never depends on
// which columns happen to be NOT NULL in this copy of the table; '' reads the same
// as "no value" everywhere downstream that already treats missing morph as absent.
const rowValue = (r, col) => {
  switch (col) {
    case 'source_id':     return 'HEB-ALIGNED';
    // book_id is INTEGER; better-sqlite3 rejects `undefined` bind params outright
    // (throws, doesn't silently coerce), and doc-based rows never set r.book_id at
    // all — `?? null` is required here, not cosmetic, or every --docs write crashes.
    case 'book_id':       return r.book_id ?? null;
    case 'chapter':       return r.chapter;
    case 'verse':         return r.verse;
    case 'token_ordinal': return r.token_ordinal;
    case 'word_raw':      return r.word_raw ?? '';
    case 'lemma':         return r.lemma ?? '';
    case 'root':          return r.root ?? '';
    case 'pos':           return r.pos ?? '';
    case 'morph':         return r.morph ?? '';
    case 'strongs':       return r.strongs ?? '';
    case 'match_kind':    return r.match_kind ?? '';
    case 'confidence':    return r.confidence ?? 0;
    default:              return null;
  }
};
const ins = db.prepare(`INSERT INTO ${TABLE} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
const dropped = WANT.filter(c => !existingCols.has(c));
if (dropped.length) console.log(`(note: ${TABLE} has no ${dropped.join('/')} column${dropped.length > 1 ? 's' : ''} — writing without ${dropped.length > 1 ? 'them' : 'it'})`);
db.transaction(rs => { for (const r of rs)
  ins.run(...cols.map(c => rowValue(r, c))); })(out);
console.log(`\nwrote ${out.length.toLocaleString()} rows into ${TABLE}.`);
if (DO_OT) console.log('HEB OT (canon 1-39) is now tokenized too — Genesis in Heb Extra should gloss.');
} // end FORCE_CANON

// ── DOC-BASED WRITE (code-keyed, own table) ─────────────────────────────────────
// Deliberately NOT tokens_nt: that table is fully owned/recreated by
// sync-heb-tokens.mjs on every --apply (book_id INTEGER NOT NULL in its own CREATE
// TABLE — literally cannot hold a code-only, book_id-less row), so anything written
// there under a `code` column would vanish the next time that script runs. This
// table has no other producer and nothing else recreates it, so it's safe long-term.
if (DO_DOCS && docCodes.length) {
  const DOCS_TABLE = 'tokens_nt_docs';
  db.exec(`CREATE TABLE IF NOT EXISTS ${DOCS_TABLE} (
    code TEXT NOT NULL, chapter INTEGER, verse INTEGER, token_ordinal INTEGER,
    word_raw TEXT, lemma TEXT, root TEXT, pos TEXT, morph TEXT, strongs TEXT,
    match_kind TEXT, confidence REAL, source_id TEXT)`);
  db.exec(`CREATE INDEX IF NOT EXISTS ${DOCS_TABLE}_ref ON ${DOCS_TABLE}(code, chapter, verse, token_ordinal)`);
  const docIns = db.prepare(`INSERT INTO ${DOCS_TABLE}
    (code, chapter, verse, token_ordinal, word_raw, lemma, root, pos, morph, strongs, match_kind, confidence, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const ph = docCodes.map(() => '?').join(', ');
  const delInfo = db.transaction(cs =>
    db.prepare(`DELETE FROM ${DOCS_TABLE} WHERE code IN (${ph})`).run(...cs))(docCodes);
  db.transaction(rs => { for (const r of rs) docIns.run(
    r.code, r.chapter, r.verse, r.token_ordinal, r.word_raw ?? '', r.lemma ?? '', r.root ?? '',
    r.pos ?? '', r.morph ?? '', r.strongs ?? '', r.match_kind ?? '', r.confidence ?? 0, 'HEB-ALIGNED'
  ); })(docOut);
  console.log(`\nwrote ${docOut.length.toLocaleString()} doc-based rows into ${DOCS_TABLE} `
              + `across ${docCodes.length.toLocaleString()} work(s) `
              + `(replaced ${delInfo.changes.toLocaleString()} stale rows).`);
}
db.close();
