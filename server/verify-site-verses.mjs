#!/usr/bin/env node
// verify-site-verses.mjs [corpus.db] [translation.db] [surface-index.db] [--report f]   (exit 1 = stop; read-only)
//
// fieldy 2026-11-18, Hosea 2:11 — the English showed 2:9's words ("LaKan … Daganay … Tzamaray") over
// 2:13's Hebrew ("WaHaShabathathay … Mashawashah"): "I expect strictly the hebrew words with appropriate
// glosses in english for me to fill in ... I dont want to encounter it in other places either".
// The site (URL, /api/tokens, the Studio, links, translation.db) numbers OT verses the English way;
// corpus.db ENG + tokens_bhs keep the Masoretic numbers. 843 verses in 22 books differ
// (eng-versification.cjs). Every machine row of translation.db must carry the text of the Hebrew
// verse its site number points at — judged by its Hebrew words (the capitalised transliterations),
// so a gloss pass that touched one copy and not the other does not trip it.
// FAILS on a machine row (status 'none', no rich_text) whose Hebrew words are not that verse's;
// a SAVED verse of fieldy's is listed (never fatal, never written).
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import VS from './eng-versification.cjs';
import * as MF from './modform-lib.mjs';
import { loadRules as loadNameRules, checkText } from './name-form-lib.mjs';
import { loadRenumberForms, checkRenumbered } from './renumber-forms-lib.mjs';
import { existsSync } from 'node:fs';
const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--'));
const ri = args.indexOf('--report'), REPORT = ri >= 0 ? args[ri + 1] : 'site-verses-report.txt';
const cdb = new Database(pos[0] || 'corpus.db', { readonly: true });
const tdb = new Database(pos[1] || 'translation.db', { readonly: true });
const forms = t => new Set((String(t || '').match(/\b[A-Z][a-z]*[A-Z][A-Za-z-]*\b|\b[A-Z][a-z]{2,}(?=\s*\()/g) || []).map(w => w.toLowerCase()));
const sim = (a, b) => { if (!b.size) return 1; let n = 0; for (const x of b) if (a.has(x)) n++; return n / b.size; };
const corpus = new Map();
for (const r of cdb.prepare(`SELECT canon_id c, chapter ch, verse v, text FROM verses WHERE corpus='ENG' AND canon_id BETWEEN 1 AND 39`).iterate())
  corpus.set(`${r.c}|${+r.ch}|${+r.v}`, r.text);
const fail = [], review = []; let checked = 0;
for (const r of tdb.prepare(`SELECT book_id c, chapter ch, verse v, status, coalesce(rich_text,'') rt, text FROM translations WHERE book_id BETWEEN 1 AND 39 AND text IS NOT NULL AND text != ''`).iterate()) {
  const mt = VS.siteToMt(r.c, r.ch, r.v);
  if (!VS.siteShows(r.c, r.ch, r.v)) {            // a row under a number the site no longer shows (Joel 4, Malachi 3:19-24 …)
    const line = `${r.c}:${r.ch}:${r.v} — the site has no such verse now (run migrate-site-keys.mjs)\n    ${String(r.text).slice(0, 140)}`;
    if ((r.status || 'none') === 'none' && !r.rt) fail.push(line); else review.push(line);
    continue;
  }
  // a folded verse is two Hebrew verses, a split one part of one, Nehemiah 7:68 Ezra 2:66 (eng-versification.cjs)
  const ct = VS.composeText(r.c, r.ch, r.v, (b, c, v) => corpus.get(`${b}|${c}|${v}`) || '');
  if (!ct) continue;
  const ft = forms(r.text), fc = forms(ct);
  if (fc.size < 2 || ft.size < 2) continue;      // too few Hebrew words to judge
  checked++;
  const s = Math.min(sim(ft, fc), sim(fc, ft));
  if (s >= 0.5) continue;
  // which Hebrew verse do its words belong to?
  let best = [0, ''];
  for (let d = -4; d <= 4; d++) for (const ch of [mt[1] - 1, mt[1], mt[1] + 1]) {
    const k = `${mt[0]}|${ch}|${mt[2] + d}`, t = corpus.get(k); if (t == null) continue;
    const x = Math.min(sim(ft, forms(t)), sim(forms(t), ft)); if (x > best[0]) best = [x, k];
  }
  const line = `${r.c}:${r.ch}:${r.v} (Hebrew ${mt.join(':')}) — its words match ${Math.round(s * 100)}%` + (best[1] && best[0] > s ? `; they are Hebrew ${best[1].replace(/\|/g, ':')}'s (${Math.round(best[0] * 100)}%)` : '') + `\n    ${String(r.text).slice(0, 140)}`;
  if ((r.status || 'none') === 'none' && !r.rt) fail.push(line);
  else if (best[0] >= 0.5 && best[0] > s) review.push(line);   // his own wording differs freely; list only a verse whose words are clearly another's
}
// ── FORM: an untouched verse IS its Hebrew words (fieldy 2026-11-18: "for untouched verses there should be
// verification that the english is exactly of the form of the hebrew 'WaHaShabathathay () Kal-Mashawashah () Chagah ()'").
// Every machine row from Genesis 3 with Hebrew words: its pairs' words are exactly the verse's words as the mechanical
// baseline groups them (MF.mechanicalPairs, compound names hyphenated as fix-name-forms writes them), in order, and no
// English stands outside a pair. A saved verse is never judged here.
const formFail = []; let formChecked = 0, formSkipped = 0;
const SIDX = pos[2] || 'surface-index.db';
if (existsSync(SIDX)) {
  await MF.loadCharMap();
  const sdb = new Database(SIDX, { readonly: true });
  const wordsOf = MF.verseWordsLoader(sdb);
  const NR = loadNameRules();
  const hy = t => { let x = t; if (NR.unhyphenRe) x = x.replace(NR.unhyphenRe, (m, pre, name) => pre + (NR.unhyphenTo.get(name) || name));
    if (NR.hyphenRe) x = x.replace(NR.hyphenRe, (m, pre, name) => pre + (NR.hyphenTo.get(name) || name)); return x; };
  const RF = await loadRenumberForms(cdb);
  // the spellings the pipeline writes after the baseline: retired forms (MF.respellRetired), retired renumber
  // spellings and locked names (fix-name-forms: renum + checkText), compound hyphens (hy)
  const finalText = (t, ref) => checkText(checkRenumbered(hy(MF.respellRetired(t)), ref, RF).fixed, NR).fixed;
  const ord = new Map();
  for (const r of cdb.prepare(`SELECT canon_id c, chapter ch, verse v, ord_c, ord_v, coalesce(text_src,'') src FROM verses WHERE corpus='ENG' AND canon_id > 39 AND ord_c IS NOT NULL`).iterate())
    ord.set(`${r.c}|${+r.ch}|${+r.v}`, r);
  for (const r of tdb.prepare(`SELECT book_id c, chapter ch, verse v, text FROM translations WHERE status = 'none' AND coalesce(rich_text,'') = '' AND text IS NOT NULL AND text != ''`).iterate()) {
    if (!MF.modformApplies(r.c, r.ch)) continue;
    if (r.c <= 39 && !VS.siteShows(r.c, r.ch, r.v)) continue;   // a leftover row: failed above (migrate-site-keys.mjs)
    let ws;
    let ref;
    let want = null;
    if (r.c <= 39) {
      // every Hebrew verse (or part) the site verse is built from, in order (fieldy 2026-11-26: modern numbers)
      want = []; ws = [];
      for (const s of VS.siteSources(r.c, r.ch, r.v)) {
        const w = wordsOf('BHS', s.b, s.c, s.v); ref = `${s.b}:${s.c}:${s.v}`;
        let groups = MF.mechanicalPairs(w, () => '', {});
        if (s.pairs) {
          // the split's pairs must be the words of its word range — checked here, every run
          const [pf, pt] = s.pairs, [wf, wt] = s.words;
          groups = groups.slice(pf, pt);
          const off = groups.flatMap(g => g.words).filter(x => x.ord < wf || x.ord > wt);
          if (off.length) formFail.push(`${r.c}:${r.ch}:${r.v} — versification-differences.json "pairs" [${pf}, ${pt}) of ${ref} hold words outside words [${wf}, ${wt}] (ords ${off.map(x => x.ord).join(',')})`);
        }
        ws.push(...w);
        want.push(...MF.pairHeads(finalText(groups.map(g => `${g.form} ()`).join(' '), ref)).heads);
      }
    }
    else {
      const o = ord.get(`${r.c}|${+r.ch}|${+r.v}`);
      ref = `${r.c}:${o ? o.ord_c : +r.ch}:${o ? o.ord_v : +r.v}`;
      ws = wordsOf('HEB', r.c, o ? o.ord_c : +r.ch, o ? o.ord_v : +r.v);
      // the HEB edition's verse is a passage beside one English sentence (Jasher) — another versification: not judged
      const eng = ((o && o.src) || '').match(/[A-Za-z’']+/g) || [];
      if (ws.length > Math.max(3 * eng.length, eng.length + 40)) { formSkipped++; continue; }
    }
    if (!ws.length) continue;
    formChecked++;
    if (!want) want = MF.pairHeads(finalText(MF.mechanicalPairs(ws, () => '', {}).map(g => `${g.form} ()`).join(' '), ref)).heads;
    const got = MF.pairHeads(r.text);
    let why = '';
    if (got.outside) why = `English outside a pair: "${got.outside.slice(0, 40)}"`;
    else if (got.heads.join(' ') !== want.join(' ')) {
      let i = 0; while (i < want.length && got.heads[i] === want[i]) i++;
      why = `word ${i + 1}: "${got.heads[i] || '—'}" where the Hebrew is "${want[i] || '—'}"`;
    }
    if (why) formFail.push(`${r.c}:${r.ch}:${r.v} — ${why}\n    want: ${want.join(' ')}\n    have: ${String(r.text).slice(0, 160)}`);
  }
}
writeFileSync(REPORT, [`verify-site-verses: ${checked} OT verses judged; ${fail.length} machine rows on the wrong verse; ${review.length} saved verses to look at; FORM: ${formChecked} untouched verses, ${formFail.length} not exactly their Hebrew words (${formSkipped} Hebrew-passage verses not judged)`, '', '== machine rows (FAIL) ==', ...fail, '', '== FORM: untouched verses not exactly their Hebrew words (FAIL) ==', ...formFail, '', '== your saved verses (not touched) ==', ...review, ''].join('\n'));
console.log(`verify-site-verses: ${checked.toLocaleString()} OT verses judged — ${fail.length} machine rows carry another verse's Hebrew words, ${review.length} saved verses listed (${REPORT})`);
for (const l of fail.slice(0, 10)) console.log('  ✗ ' + l.split('\n')[0]);
for (const l of review.slice(0, 10)) console.log('  ! ' + l.split('\n')[0]);
console.log(`  FORM: ${formChecked.toLocaleString()} untouched verses — ${formFail.length.toLocaleString()} not exactly their Hebrew words (${formSkipped.toLocaleString()} Hebrew-passage verses not judged)`);
for (const l of formFail.slice(0, 10)) console.log('  ✗ ' + l.split('\n')[0]);
process.exit(fail.length || formFail.length ? 1 : 0);
