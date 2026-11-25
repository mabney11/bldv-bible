// refresh-lexicon-glosses.mjs — THE READER CORRECTS ITSELF AFTER A LEXICON EDIT (fieldy, 2026-11-22: "automate my lexicon
// updates to populate raw paleo placeholders without my intervention -- i should only have to modify the details and the
// reader correct itself over time"; Gen 29:35 still read "AYawadah ([I] 𐤉𐤃𐤄)" after he set 𐤉𐤃𐤄 "Confess").
//
// Run by lexicon-refresh-watch.sh whenever a lexicon file settles after a change (both machines), or by hand:
//   node refresh-lexicon-glosses.mjs [corpus.db] [translation.db] [surface-index.db] [--all] [--register] [--dry] [--state f]
// What it does, in order:
//   1. which glosses changed since the last run (lexicon.json, homographs.json, hebrew-extra-lexicon.json — values only;
//      a blank key is not a gloss). A change to a RULE file (baseline-gloss-labels, name-form-rules, compound-hyphenation,
//      reading-form-rules, strongs-location-overrides, name-map-expanded) or --all or a first run = every verse.
//   2. the Hebrew verses whose words carry a changed root / Strong's (surface-index.db).
//   3. those verses' MACHINE reading text written again from their Hebrew words (merge-modforms --corpus
//      --mechanical-only --only-heb): his gloss replaces the paleo placeholder, a changed gloss replaces the old one.
//   4. translation.db (what the reader serves): each such verse's UNTOUCHED row (status 'none', no rich_text) takes the
//      new text with the same name passes fix-name-forms gives every seeded row. A verse he saved is never written.
//   5. the headings' names (fix-heading-names' rule) — cheap, idempotent.
//   6. --register (fieldy's machine only — two machines adding keys would collide in git): every Strong's root in the
//      corpus with no key in lexicon.json / homographs.json / hebrew-extra-lexicon.json gets a BLANK key in
//      hebrew-extra-lexicon.json — his worklist; the reader shows its paleo until he fills it. Never a value.
// Never blocks the site: one process, low priority (the watcher runs it with nice), SQLite WAL readers keep reading.
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import VS from './eng-versification.cjs';
import { modformApplies } from './modform-lib.mjs';
import { loadRules, checkText, bareNames, goldMarkers, divineGlosses } from './name-form-lib.mjs';
import { loadRenumberForms, checkRenumbered } from './renumber-forms-lib.mjs';
import { makeHeadingFixer } from './heading-names-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--state');
const CORPUS_DB = pos[0] || path.join(__dirname, 'corpus.db');
const TRANS_DB = pos[1] || path.join(__dirname, 'translation.db');
const INDEX_DB = pos[2] || path.join(__dirname, 'surface-index.db');
const ALL = argv.includes('--all'), REGISTER = argv.includes('--register'), DRY = argv.includes('--dry');
const STATE = val('--state', path.join(__dirname, '.lexicon-watch', 'refresh-state.json'));
const LEX = f => path.join(__dirname, 'lexicon', f);
const GLOSS_FILES = ['lexicon.json', 'homographs.json', 'hebrew-extra-lexicon.json'];
const RULE_FILES = ['baseline-gloss-labels.json', 'name-form-rules.json', 'compound-hyphenation.json', 'reading-form-rules.json',
                    'strongs-location-overrides.json', 'strongs-renumber.json'].map(LEX).concat(path.join(__dirname, 'name-map-expanded.json'));
const t0 = Date.now();
const say = m => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
for (const f of [CORPUS_DB, TRANS_DB, INDEX_DB]) if (!existsSync(f)) { console.error(`✗ ${f} not found`); process.exit(1); }

// one run at a time (the watcher on both machines, a hand run)
const LOCK = STATE + '.lock';
mkdirSync(path.dirname(STATE), { recursive: true });
try { mkdirSync(LOCK); } catch {
  let age = Infinity; try { age = Date.now() - statSync(LOCK).mtimeMs; } catch { /* gone */ }
  if (age < 30 * 60e3) { say('another refresh is running — skipped'); process.exit(0); }
  rmSync(LOCK, { recursive: true, force: true }); mkdirSync(LOCK);   // a stale lock (killed run)
}
const unlock = () => { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* */ } };
process.on('exit', unlock);

const readJson = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; } };
const sha = p => { try { return createHash('sha1').update(readFileSync(p)).digest('hex'); } catch { return ''; } };
const filled = o => Object.fromEntries(Object.entries(o).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.trim()));

// ── 6 first: register blank keys (so step 1 sees the file as it will stay) ───────────────────────────────────────
if (REGISTER && !DRY) {
  const lex = readJson(LEX('lexicon.json')), hom = readJson(LEX('homographs.json'));
  const xp = LEX('hebrew-extra-lexicon.json'), xraw = readFileSync(xp, 'utf8'), xlex = JSON.parse(xraw);
  const homRoots = new Set(Object.keys(hom).map(k => k.split('_')[0]));
  const sdb = new Database(INDEX_DB, { readonly: true });
  const add = [];
  for (const r of sdb.prepare(`SELECT DISTINCT root_paleo rp FROM token_surfaces WHERE root_paleo != '' AND strongs GLOB 'H[0-9]*'
                                 AND CAST(substr(strongs, 2) AS INTEGER) < 9000`).iterate())
    if (!(r.rp in lex) && !(r.rp in xlex) && !(r.rp in hom) && !homRoots.has(r.rp)) add.push(r.rp);
  sdb.close();
  if (add.length) {
    for (const k of add) xlex[k] = '';
    // the file's own layout: 2-space JSON, no final newline (checked 2026-11-22) — a re-dump of what is there plus the keys
    writeFileSync(xp, JSON.stringify(xlex, null, 2) + (xraw.endsWith('\n') ? '\n' : ''));
  }
  say(`placeholders: ${add.length.toLocaleString()} Strong's roots had no lexicon key — added blank to hebrew-extra-lexicon.json`);
}

// ── 1. what changed ────────────────────────────────────────────────────────────────────────────────────────────
const prev = readJson(STATE);
const now = { gloss: Object.fromEntries(GLOSS_FILES.map(f => [f, filled(readJson(LEX(f)))])), rules: Object.fromEntries(RULE_FILES.map(p => [path.basename(p), sha(p)])) };
const rulesChanged = !prev.rules ? [] : Object.keys(now.rules).filter(k => now.rules[k] !== prev.rules[k]);
let every = ALL || !prev.gloss || rulesChanged.length > 0;
const roots = new Set(), sns = new Set();
if (!every) {
  for (const f of GLOSS_FILES) {
    const a = prev.gloss[f] || {}, b = now.gloss[f];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] === b[k]) continue;
      if (/^H\d+[a-z]?$/i.test(k)) { sns.add('H' + k.replace(/^H+/i, '')); continue; }   // bare Strong's key
      const [root, tail] = k.split('_');
      if (root) roots.add(root);
      if (tail && /^H\d/i.test(tail)) sns.add('H' + tail.replace(/^H+/i, ''));
    }
  }
}
const why = every ? (ALL ? '--all' : !prev.gloss ? 'first run' : `rule file changed: ${rulesChanged.join(', ')}`)
                  : `${roots.size} root(s), ${sns.size} Strong's number(s) changed`;
if (!every && !roots.size && !sns.size) {
  say('no gloss changed since the last refresh — nothing to write');
  if (!DRY) writeFileSync(STATE, JSON.stringify(now));
  process.exit(0);
}
say(`refresh: ${why}`);

// ── 2. the Hebrew verses those words stand in ────────────────────────────────────────────────────────────────
let hebKeys = null;
if (!every) {
  const sdb = new Database(INDEX_DB, { readonly: true });
  hebKeys = new Set();
  const q = (col, list) => sdb.prepare(`SELECT DISTINCT o.book_id b, o.chapter c, o.verse v FROM surface_occurrences o JOIN token_surfaces t
      ON t.source = o.source AND t.word_raw = o.word_raw AND t.strongs = o.strongs AND t.pos = o.pos AND t.morph = o.morph
      WHERE ${col} IN (${list.map(() => '?').join(',')})`).all(...list);
  const chunks = (arr, n = 400) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  for (const part of chunks([...roots])) for (const r of [...q('t.root_paleo', part), ...q('o.word_raw', part)]) hebKeys.add(`${r.b}|${r.c}|${r.v}`);
  for (const part of chunks([...sns])) for (const r of q('o.strongs', part)) hebKeys.add(`${r.b}|${r.c}|${r.v}`);
  // a location override gives one occurrence another number (H3603a): its verse too
  const loc = readJson(LEX('strongs-location-overrides.json'));
  for (const [k, o] of Object.entries(loc)) if (o && sns.has(o.strongs)) { const [b, c, v] = k.split(':'); hebKeys.add(`${b}|${c}|${v}`); }
  sdb.close();
  say(`${hebKeys.size.toLocaleString()} Hebrew verse(s) carry those words`);
  if (!hebKeys.size) { if (!DRY) writeFileSync(STATE, JSON.stringify(now)); process.exit(0); }
}

// ── 3. corpus.db: the machine text written again from the Hebrew words ───────────────────────────────────────
const tmp = path.join(os.tmpdir(), `lexrefresh-${process.pid}`); mkdirSync(tmp, { recursive: true });
const mmArgs = [path.join(__dirname, 'merge-modforms.mjs'), CORPUS_DB, TRANS_DB, INDEX_DB, '--corpus', '--mechanical-only', '--jsonl', path.join(tmp, 'changed.jsonl')];
if (hebKeys) { writeFileSync(path.join(tmp, 'heb.json'), JSON.stringify([...hebKeys])); mmArgs.push('--only-heb', path.join(tmp, 'heb.json')); }
if (DRY) mmArgs.push('--dry');
const mm = spawnSync(process.execPath, mmArgs, { cwd: __dirname, encoding: 'utf8', maxBuffer: 64 << 20 });
const mmOut = (mm.stdout || '') + (mm.stderr || '');
if (mm.status !== 0) { console.error(mmOut); console.error('✗ merge-modforms failed — nothing written to translation.db'); process.exit(1); }
for (const l of mmOut.split('\n')) if (/MECHANICAL BASELINE|^modification forms/.test(l)) say('  ' + l.trim());

// ── 4. translation.db: untouched rows take the new text ──────────────────────────────────────────────────────
const cdb = new Database(CORPUS_DB, { readonly: true });
const RF = await loadRenumberForms(cdb);
const R = loadRules();
const seededText = (text, ref) => {   // fix-name-forms.mjs, a seeded row: renumber spellings, rules, bare names, divine glosses, gold "()"
  let x = checkRenumbered(text, ref, RF).fixed;
  x = checkText(x, R).fixed; x = bareNames(x, R).fixed; x = divineGlosses(x, R).fixed; x = goldMarkers(x, R).fixed;
  return x;
};
// the verses step 3 changed (its --jsonl list): only those, so a verse another gate settled is never reopened
const jl = path.join(tmp, 'changed.jsonl');
const engRows = existsSync(jl) ? readFileSync(jl, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
say(`corpus.db: ${engRows.length.toLocaleString()} machine verse(s) ${DRY ? 'would be ' : ''}written again`);
// …with the corpus passes render-all's fix-name-forms gives every corpus row (renumbered spellings, rules, bare names,
// divine glosses), so the next Rebake gates see what a full render would have written
{
  const cw = new Database(CORPUS_DB, { readonly: DRY });
  const get = cw.prepare(`SELECT id, ord_c, ord_v FROM verses WHERE corpus = 'ENG' AND canon_id = ? AND chapter = ? AND verse = ?`);
  const put = DRY ? null : cw.prepare(`UPDATE verses SET text = ? WHERE id = ?`);
  cw.transaction(() => { for (const r of engRows) {
    const row = get.get(r.c, r.ch, r.v); if (!row) continue;
    let x = checkRenumbered(r.text, `${r.c}:${row.ord_c}:${row.ord_v}`, RF).fixed;
    x = checkText(x, R).fixed; x = bareNames(x, R).fixed; x = divineGlosses(x, R).fixed;
    r.text = x; if (put) put.run(x, row.id);
  } })();
  cw.close();
}
cdb.close();
const tdb = new Database(TRANS_DB, { readonly: DRY });
tdb.pragma('busy_timeout = 10000');
const sel = tdb.prepare(`SELECT text, status, coalesce(rich_text, '') rt FROM translations WHERE book_id = ? AND chapter = ? AND verse = ?`);
const upd = DRY ? null : tdb.prepare(`UPDATE translations SET text = ?, original_text = ?, updated_at = datetime('now')
                                        WHERE book_id = ? AND chapter = ? AND verse = ? AND status = 'none' AND coalesce(rich_text, '') = ''`);
let wrote = 0, saved = 0; const samples = [];
tdb.transaction(() => {
  for (const r of engRows) {
    const keys = r.c <= 39 ? VS.mtToSite(r.c, +r.ch, +r.v) : [[r.c, +r.ch, +r.v]];
    for (const [b, ch, v] of keys) {
      const cur = sel.get(b, ch, v); if (!cur) continue;
      if ((cur.status || 'none') !== 'none' || cur.rt) { saved++; continue; }   // his: never written
      const t = seededText(r.text, `${b}:${ch}:${v}`);
      if (t === cur.text) continue;
      wrote++; if (samples.length < 6) samples.push(`  ${b}:${ch}:${v}  ${t.slice(0, 160)}`);
      if (upd) upd.run(t, t, b, ch, v);
    }
  }
})();

// ── 5. headings ─────────────────────────────────────────────────────────────────────────────────────────────
const counts = new Map();
for (const r of tdb.prepare(`SELECT text FROM translations WHERE text IS NOT NULL AND text != ''`).iterate())
  for (const w of r.text.match(/[A-Za-z][A-Za-z'\-]*/g) || []) counts.set(w, (counts.get(w) || 0) + 1);
const fixH = makeHeadingFixer(counts);
let hFixed = 0;
{
  const hs = tdb.prepare(`SELECT id, title, subtitle FROM headings`).all();
  const changes = hs.map(h => ({ h, t: fixH(h.title).text, s: fixH(h.subtitle).text })).filter(c => c.t !== c.h.title || c.s !== c.h.subtitle);
  hFixed = changes.length;
  if (!DRY && changes.length) {
    tdb.exec(`CREATE TABLE IF NOT EXISTS headings_history (id INTEGER PRIMARY KEY AUTOINCREMENT, heading_id INTEGER, title TEXT, subtitle TEXT,
             saved_at TEXT NOT NULL DEFAULT (datetime('now')), why TEXT)`);
    const hist = tdb.prepare(`INSERT INTO headings_history (heading_id, title, subtitle, why) VALUES (?, ?, ?, 'refresh-lexicon-glosses')`);
    const hu = tdb.prepare(`UPDATE headings SET title = ?, subtitle = ?, updated_at = datetime('now') WHERE id = ?`);
    tdb.transaction(() => { for (const c of changes) { hist.run(c.h.id, c.h.title, c.h.subtitle); hu.run(c.t, c.s, c.h.id); } })();
  }
}
tdb.close();
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
if (!DRY) writeFileSync(STATE, JSON.stringify(now));
say(`translation.db: ${wrote.toLocaleString()} reader verse(s) ${DRY ? 'would be ' : ''}rewritten, ${saved.toLocaleString()} saved verse(s) left as he wrote them; ` +
    `${hFixed} heading(s) ${DRY ? 'would be ' : ''}renamed — ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const s of samples) console.log(s);
