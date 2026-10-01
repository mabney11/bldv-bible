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
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as MF from './modform-lib.mjs';
import { loadRules as loadNameRules, divineGlosses } from './name-form-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const pos = argv.filter(a => !a.startsWith('--'));
const CORPUS = argv.includes('--corpus'), SAVED = argv.includes('--saved'), DRY = argv.includes('--dry');
const JSONL = argv.includes('--jsonl') ? [] : null;   // test aid: the changed corpus rows, for running the gates on a scratch db
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
// a capitalised word mid-sentence that looks like a transliteration (a name the render left bare)
const NAMEISH = /^[A-Z][a-z]*(?:a[a-z]){2,}/;
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
    // the head word lives on inside its full form ("malaak" in "HaMalaak"), which may sit
    // before the English words the form took in
    if (ka[i].length >= 2) for (let j = Math.max(0, lo - 5); j < Math.min(m, hi + 5); j++)
      if (!usedB.has(j) && kb[j].includes(ka[i]) && /[A-Z]/.test(b[j])) { pick = j; break; }
    if (pick < 0) for (let j = lo + 1; j < hi; j++) if (!usedB.has(j)) { pick = j; break; }
    if (pick >= 0) usedB.add(pick);
    map[i] = pick >= 0 ? pick : Math.max(0, Math.min(m - 1, lo >= 0 ? lo : 0));
  }
  return map;
}

let seen = 0, changed = 0, pairs = 0, linkRows = 0;
const samples = [];
if (CORPUS) {
  // ── THE ALIGNER'S WORDS (NT) ─────────────────────────────────────────────────────────
  // fieldy, 2026-10-01: "I want the new testament and apocrypha to also adhere to the hebrew
  // focused translation." The OT reads Hebrew word by Hebrew word because the WEB tags its
  // English with Strong's. The NT English has no tags; build-align-links.mjs learns
  // English<->Strong's from the OT and writes, per NT verse, which English words answer
  // which HEB-edition token (translation_links lang='HEB-auto', english_indices into the
  // verse's text_src words). Every such span still plain English in the rendered text
  // becomes that Hebrew word — "Form (english)" — exactly as an OT segment does.
  const stripGlosses = t => String(t || '').replace(/\b[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'-]*\s+\(([^()]*)\)/g, '$1');
  const alignWords = t => stripGlosses(t).toLowerCase().replace(/[^a-zÀ-ɏ'\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const nw = t => t.toLowerCase().replace(/[^a-zÀ-ɏ'\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const UNIT = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*\s+\((?:[^()]|\([^()]*\))*\)|[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*/g;
  const PAIR_UNIT = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*\s+\(/;
  const links = new Map();   // "canon|ord_c|ord_v" -> [{ ix:[...], ord }]
  if (existsSync(TRANS_DB)) {
    try {
      const ldb = new Database(TRANS_DB, { readonly: true });
      for (const l of ldb.prepare(`SELECT book_id b, chapter c, verse v, english_indices ei, token_ordinals tk FROM translation_links WHERE lang='HEB-auto'`).iterate()) {
        let ix, tk; try { ix = JSON.parse(l.ei || '[]'); tk = JSON.parse(l.tk || '[]'); } catch { continue; }
        if (!ix.length || tk.length !== 1) continue;
        const k = `${l.b}|${l.c}|${l.v}`; if (!links.has(k)) links.set(k, []);
        links.get(k).push({ ix, ord: tk[0] });
      }
      ldb.close();
    } catch (e) { console.warn(`  ⚠ aligner links unreadable (${e.message}) — NT gets only its glossed words`); }
  }
  if (!links.size) console.warn('  ⚠ no HEB-auto links in translation.db — run build-align-links.mjs --apply first; NT gets only its glossed words');
  const lcsMap = (a, b) => {   // a[i] -> index in b, or -1
    const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = new Array(n).fill(-1);
    for (let i = 0, j = 0; i < n && j < m;) { if (a[i] === b[j]) { out[i] = j; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
    return out;
  };
  let filled = 0;
  const fill = (text, src, verseLinks, ws) => {
    if (!verseLinks || !verseLinks.length || !src) return text;
    const units = [...text.matchAll(UNIT)].map(m => ({ s: m.index, e: m.index + m[0].length, t: m[0], pair: PAIR_UNIT.test(m[0]) }));
    const rw = [], ru = [];
    units.forEach((u, k) => { for (const w of nw(u.pair ? u.t.replace(/^[^(]*\(/, '').replace(/\)$/, '') : u.t)) { rw.push(w); ru.push(k); } });
    const sMap = lcsMap(alignWords(src), rw);
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
    const present = new Set(units.filter(u => u.pair).map(u => norm(u.t.replace(/\s*\(.*$/s, ''))));
    const reps = [], taken = new Set();
    for (const l of verseLinks) {
      const word = ws.find(x => x.ord === l.ord);
      if (!word || word.isName || present.has(word.rootTr) || present.has(norm(word.form))) continue;
      const us = l.ix.map(i => (sMap[i] >= 0 ? ru[sMap[i]] : -1));
      if (us.some(u => u < 0)) continue;
      const lo = Math.min(...us), hi = Math.max(...us);
      let ok = true;
      for (let k = lo; k <= hi; k++) if (units[k].pair || taken.has(k) || (k > lo && !/^\s+$/.test(text.slice(units[k - 1].e, units[k].s)))) ok = false;
      if (!ok) continue;
      for (let k = lo; k <= hi; k++) taken.add(k);
      reps.push({ s: units[lo].s, e: units[hi].e, ord: word.ord, tr: word.form, eng: text.slice(units[lo].s, units[hi].e) });
    }
    if (!reps.length) return text;
    let out = text;
    for (const r of reps.sort((a, b) => b.s - a.s)) out = out.slice(0, r.s) + `${r.ord}${r.tr} (${r.eng})` + out.slice(r.e);
    filled += reps.length;
    return out;
  };
  // ── EVERY HEBREW WORD ITS ENGLISH (NT + Apocrypha) ──────────────────────────────────
  // After the render's glosses and the Parallel links, most of a verse's Hebrew words still
  // had no English of their own (NT: 40% represented). The table build-align-links learns
  // from the WEB's tagged OT — p(english word | Strong's) — pairs each remaining Hebrew word
  // with the plain English words it best explains, near its own place in the verse. Floors:
  // the word must be at least MF_RATIO times likelier under this Strong's than anywhere
  // (NULL), with p >= MF_P, within MF_DIST of the Hebrew word's relative position. A Hebrew
  // word takes ONE contiguous run of English; the run becomes "Form (english)", and
  // mergeModforms() then lets its prefixes take in "in the", "and", "we will" as in the OT.
  const TAB_PATH = val('--table', path.join(__dirname, 'align-table.json'));
  let TAB = null;
  try { TAB = JSON.parse(readFileSync(TAB_PATH, 'utf8')); } catch { console.warn(`  ⚠ ${TAB_PATH} missing — run build-align-links.mjs first; NT/Apocrypha get only their glossed words`); }
  const MF_P = +val('--min-p', '0.03'), MF_RATIO = +val('--min-ratio', '2'), MF_DIST = +val('--max-dist', '0.3');
  let aligned = 0;
  const FUNC = new Set(('a an the and or but if for nor so yet of to in into on onto at by with from as than that this these those which who whom whose what ' +
    'i me my we us our you your he him his she her it its they them their be is are was were been being have has had do does did will shall would should ' +
    'may might must can could not no up out there then when where while all any some').split(' '));
  const _tops = new Map();
  const topOf = sn => { if (!_tops.has(sn)) _tops.set(sn, Object.entries(TAB.sn[sn] || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0])); return _tops.get(sn); };
  const alignFill = (text, ws) => {
    if (!TAB) return text;
    const units = [...text.matchAll(UNIT)].map(m => ({ s: m.index, e: m.index + m[0].length, t: m[0], pair: PAIR_UNIT.test(m[0]) }));
    if (!units.length) return text;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
    // Hebrew words already in the text — as a pair's word, or a bare name/divine word
    const usedW = new Set();
    for (const u of units) {
      const w = norm(u.pair ? u.t.replace(/\s*\(.*$/s, '') : u.t);
      const x = ws.find(h => !usedW.has(h) && (norm(h.form) === w || h.rootTr === w || h.snTr === w));
      if (x) usedW.add(x);
    }
    const maxOrd = Math.max(...ws.map(h => h.ord));
    const H = ws.filter(h => !usedW.has(h) && !h.isName && TAB.sn[h.sn]);
    if (!H.length) return text;
    const cand = [];
    units.forEach((u, k) => {
      if (u.pair || !/^[a-z]/i.test(u.t)) return;
      const w = u.t.toLowerCase().replace(/[’'].*$/, '');
      if (!w || (/^[A-Z]/.test(u.t) && k > 0 && !/[.!?:;“"‘]\s*$/.test(text.slice(units[k - 1].e, u.s)) && NAMEISH.test(u.t))) return;
      const nullP = Math.max(TAB._null[w] || 0, 1e-5);
      const re = (k + 0.5) / units.length;
      for (const h of H) {
        const p = TAB.sn[h.sn][w] || 0;
        if (p < MF_P) continue;
        // a function word ("for", "him", "have") only for a Hebrew word whose OWN English it
        // is: among its three likeliest, at p >= 0.2 — "Kay (for)" yes, "Kay (have)" never
        if (FUNC.has(w) && (p < 0.2 || !topOf(h.sn).includes(w))) continue;
        const ratio = p / nullP;
        if (ratio < MF_RATIO) continue;
        const d = Math.abs(re - (h.ord - 0.5) / maxOrd);
        if (d > MF_DIST) continue;
        cand.push({ k, h, sc: Math.log(ratio) - 4 * d });
      }
    });
    // a preposition carrying its pronoun is its own word: "to him", "for you"
    for (const h of H.concat(ws.filter(x => !usedW.has(x) && /prep/.test(x.pos || '') && !TAB.sn[x.sn]))) {
      const pm = h.mods.find(m => m.pron); if (!pm || !/prep/.test(h.pos || '')) continue;
      const head = h.comps.find(c => c.css === 'mod-prep');
      const preps = new Set([...(head && MF.PREP_EN()[head.paleo] || []), ...Object.keys((TAB.sn[h.sn]) || {}).slice(0, 4)]);
      const prons = new Set([...(MF.PRS_EN()[pm.pr] || [])]);
      for (let k = 0; k + 1 < units.length; k++) {
        const a = units[k], b = units[k + 1];
        if (a.pair || b.pair || !/^\s+$/.test(text.slice(a.e, b.s))) continue;
        if (preps.has(a.t.toLowerCase()) && prons.has(b.t.toLowerCase())) { cand.push({ k, h, sc: 50 }, { k: k + 1, h, sc: 50 }); break; }
      }
    }
    cand.sort((a, b) => b.sc - a.sc);
    const owner = new Map(), best = new Map();   // unit -> h ; h -> best unit
    for (const c of cand) {
      if (owner.has(c.k)) continue;
      owner.set(c.k, c.h);
      if (!best.has(c.h)) best.set(c.h, c.k);
    }
    const reps = [];
    for (const [h, k0] of best) {
      let lo = k0, hi = k0;
      const adj = (a, b) => /^\s+$/.test(text.slice(units[a].e, units[b].s));
      while (lo > 0 && owner.get(lo - 1) === h && adj(lo - 1, lo)) lo--;
      while (hi + 1 < units.length && owner.get(hi + 1) === h && adj(hi, hi + 1)) hi++;
      reps.push({ s: units[lo].s, e: units[hi].e, ord: h.ord, tr: h.form });   // the full form even if nothing else touches it
    }
    let out = text;
    for (const r of reps.sort((a, b) => b.s - a.s)) out = out.slice(0, r.s) + `${r.ord}${r.tr} (${out.slice(r.s, r.e)})` + out.slice(r.e);
    aligned += reps.length;
    return out;
  };
  // a Hebrew word with no English of its own: its lexicon gloss (fieldy's curated words),
  // else the table's likeliest English for its Strong's — modifications woven in
  let LEX = {};
  try { LEX = JSON.parse(readFileSync(path.join(__dirname, 'lexicon', 'lexicon.json'), 'utf8')); } catch { LEX = {}; }
  const ROOTS = (() => { try { return JSON.parse(readFileSync(path.join(__dirname, 'lexicon', 'strongs-roots.json'), 'utf8')); } catch { return {}; } })();
  const tidy = g => String(g || '').replace(/\[[^\]]*\]/g, ' ').replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\/]+|[\s\/]+$/g, '').trim();
  const PREPWORDS = new Set([...Object.values(MF.PREP_EN()).flatMap(x => [...x]), ...'upon over on with before after under against about between among toward unto beside behind above below through beyond within'.split(' ')]);
  const glossOf = h => {
    // the chip's own gloss (fieldy's curated lexicon/homographs, as the Parallel shows it),
    // else the WEB's likeliest English for its Strong's, else his placeholder: the root's paleo
    const root = h.comps.find(c => c.css === 'root' || c.css === 'mod-nmpr') || h.comps.find(c => c.true_root) || h.comps.find(c => c.css === 'mod-prep') || h.comps[h.comps.length - 1];
    let g = (!h.mods.length && curatedOf(h)) || (root ? tidy(root.translation) : '');
    // a preposition's chip may carry a homograph's sense (עָלֵינוּ "went up"): its WEB English first
    if (/prep/.test(h.pos || '') && h.sn !== 'H853' && TAB && TAB.sn[h.sn]) {
      const p = Object.entries(TAB.sn[h.sn]).sort((a, b) => b[1] - a[1]).map(x => x[0]).find(w => PREPWORDS.has(w));
      if (p) g = p;
    }
    if (/^[\u{10900}-\u{1091F}\s\/]*$/u.test(g) || /^\[.*\]$/.test(g)) g = '';
    if (!g && TAB && TAB.sn[h.sn]) g = Object.entries(TAB.sn[h.sn]).sort((a, b) => b[1] - a[1])[0][0];
    if (!g && root) g = root.paleo;
    return g ? MF.weave(h, g) : '';
  };
  // NT concepts the OT already names (lexicon/reading-concepts.json): repent -> Nacham …
  const CONC = MF.loadConcepts();
  const PAIR_RE = /(\d+)?\b([A-Za-z][A-Za-z'’-]*)\s+\(((?:[^()]|\([^()]*\))*)\)/g;
  let conceptN = 0;
  const applyConcepts = (text, ws) => {
    if (!CONC.length) return { text, ws };
    let out = text, W = ws.slice();
    for (const C of CONC) {
      for (let guard = 0; guard < 30; guard++) {
        // the next English word of this family not yet inside a concept pair
        const pairs = [...out.matchAll(PAIR_RE)];
        const inPair = idx => pairs.find(pm => idx > pm.index + pm[0].indexOf('(') && idx < pm.index + pm[0].length);
        let hit = null;
        for (const tm of out.matchAll(/[A-Za-z]+/g)) {
          if (!C.re.test(tm[0])) continue;
          const pm = inPair(tm.index);
          if (pm && pm[1] && W.some(x => x.concept === C.name && String(x.ord) === pm[1].slice(1, -1))) continue;   // already done
          hit = { tm, pm }; break;
        }
        if (!hit) break;
        const h = W.find(x => !x.concept && C.matches(x));
        if (!h) break;                                   // the verse's Hebrew has no word for it: English stays
        const cw = MF.conceptWord(h, C);
        W = W.map(x => (x === h ? cw : x));
        const mk = `\uE002${cw.ord}\uE003`;
        if (hit.pm) {
          const pm = hit.pm, head = pm.index + (pm[1] ? pm[1].length : 0);
          out = out.slice(0, pm.index) + mk + cw.form + out.slice(head + pm[2].length);
        } else {
          out = out.slice(0, hit.tm.index) + `${mk}${cw.form} (${hit.tm[0]})` + out.slice(hit.tm.index + hit.tm[0].length);
        }
        conceptN++;
      }
    }
    return { text: out, ws: W };
  };
  const ilWhy = new Map(); let ilOk = 0;
  const NR = loadNameRules();
  // curated gloss for an unmodified word (MF.curatePairs): its own lexicon entry — unless that
  // spelling is the root of ANOTHER, common, Strong's (𐤄𐤌𐤄 is H1993 "great uproar"; the
  // verse's 𐤄𐤌𐤄 is H1992 "they"), a name's spelling never blocks (𐤀𐤔𐤓𐤉 Asharay "He who"
  // vs the gentilic H843) — else the chip's curated gloss
  const ROOT_OWNERS = new Map();
  for (const [sn, p] of Object.entries(ROOTS)) { if (!ROOT_OWNERS.has(p)) ROOT_OWNERS.set(p, new Set()); ROOT_OWNERS.get(p).add(sn); }
  const curatedOf = h => {
    const root = h.comps.find(c => c.css === 'root') || h.comps.find(c => c.true_root) || null;   // a particle's head is mod-intj / mod-prps
    const chip = root ? tidy(root.translation) : '';
    const placeholder = g => !g || /^[\u{10900}-\u{1091F}\s\/]*$/u.test(g);
    // 1. his Strong's-specific (homograph) gloss: Irawam "cunning / crafty", not 𐤏𐤓𐤅𐤌 "naked"
    if (root && root.gloss_src === 'homograph' && !placeholder(chip)) return chip;
    // 2. the word's own spelling in his lexicon (𐤀𐤔𐤓𐤉 "He who") — unless that spelling is
    //    another common word's root (𐤄𐤌𐤄 = H1993 "great uproar", but here H1992 "they")
    const surf = h.comps.map(c => c.paleo).join('');
    const own = ROOT_OWNERS.get(surf);
    if (tidy(LEX[surf]) && !(own && !own.has(h.sn) && !MF.isNameTr(MF.formOf([{ paleo: surf, css: 'root' }])))) return tidy(LEX[surf]);
    // 3. the root's lexicon gloss — only when no other Strong's shares that root (𐤀𐤐 is
    //    "also" H637 and "nose" H639: the English of the verse is kept instead)
    const rp = root && (root.true_root || root.paleo);
    const owners = rp ? ROOT_OWNERS.get(rp) : null;
    if (root && root.gloss_src === 'lexicon' && !placeholder(chip) && (!owners || (owners.size === 1 && owners.has(h.sn)))) return chip;
    return '';
  };

  const rows = cdb.prepare(`SELECT id, canon_id c, chapter ch, verse v, ord_c, ord_v, text, coalesce(text_src,'') src FROM verses WHERE corpus='ENG' AND canon_id IS NOT NULL AND text IS NOT NULL AND text != ''`).all();
  const upd = DRY ? null : cdb.prepare(`UPDATE verses SET text = ? WHERE id = ?`);
  cdb.transaction(() => {
    // test aids: --only c:ch:v,… limits the run; --text-json file {"c:ch:v": text} replaces the db text
    const ONLY = argv.includes('--only') ? new Set(val('--only', '').split(',')) : null;
    const TJ = argv.includes('--text-json') ? JSON.parse(readFileSync(val('--text-json'), 'utf8')) : null;
    for (const r of rows) {
      if (ONLY && !ONLY.has(`${r.c}:${r.ch}:${r.v}`)) continue;
      if (TJ && TJ[`${r.c}:${r.ch}:${r.v}`]) r.text = TJ[`${r.c}:${r.ch}:${r.v}`];
      // the OT's own forms come from apply-web-strongs; this pass gives its NAMES their
      // prefixes and finishes any pair it left (Genesis 1-2 stay as they are)
      if (!MF.modformApplies(r.c, r.ch)) continue;
      seen++;
      let ws = hebWords(r.c, r.ch, r.v);
      r.text = divineGlosses(r.text, NR).fixed;   // Alahayam (God), Yashawai (Jesus), Mashayach (Christ / Anointed One) — before the forms, so prefixes join
      const cc = r.c > 39 ? applyConcepts(r.text, ws) : { text: r.text, ws }; ws = cc.ws;   // NT/Apocrypha words the OT already names
      const t1 = fill(cc.text, r.src, links.get(`${r.c}|${r.ord_c}|${r.ord_v}`), ws);
      // every pair whose word is in the verse's Hebrew becomes its full form, as in the OT
      let r2 = MF.mergeModforms(t1, ws, { all: true, keepMarks: true });
      { const t2 = alignFill(r2.text, ws); if (t2 !== r2.text) { const r3 = MF.mergeModforms(t2, ws, { all: true, keepMarks: true }); r2 = { text: r3.text, n: r2.n + r3.n }; } }
      r2.text = MF.curatePairs(r2.text, ws, curatedOf);
      // Hebrew word order, every Hebrew word, the English inside its brackets
      const il = MF.interlinear(r2.text, ws, glossOf);
      const grp = r.c <= 39 ? 'OT' : r.c <= 66 ? 'NT' : 'Apoc';
      if (il.ok) { r2 = { text: il.text, n: r2.n }; ilOk++; ilWhy.set(grp + ' hebrew-order', (ilWhy.get(grp + ' hebrew-order') || 0) + 1); } else ilWhy.set(grp + ' ' + il.why, (ilWhy.get(grp + ' ' + il.why) || 0) + 1);
      r2.text = r2.text.replace(/\uE002\d+r?\uE003/g, '');
      if (r2.text === r.text) continue;
      changed++; pairs += r2.n;
      if (samples.length < (ONLY ? 99 : 12) && (ONLY || (r.c <= 66 && (r.c > 39 || samples.length < 4)))) samples.push(`${r.c}:${r.ch}:${r.v}  ${r2.text}`);
      if (upd) upd.run(r2.text, r.id);
      if (JSONL) JSONL.push(JSON.stringify({ c: r.c, ch: r.ch, v: r.v, text: r2.text }));
    }
  })();
  if (JSONL) writeFileSync(argv[argv.indexOf('--jsonl') + 1], JSONL.join('\n') + '\n');
  console.log(`modification forms (corpus.db ENG, Gen 3 on: OT names + NT + Apocrypha): ${changed.toLocaleString()} of ${seen.toLocaleString()} verses, ${pairs.toLocaleString()} Hebrew words written ` +
              `(${filled.toLocaleString()} from the Parallel links, ${aligned.toLocaleString()} from the learned table)${DRY ? ' (dry run)' : ''}`);
  console.log(`  Hebrew word order: ${ilOk.toLocaleString()} verses; English order kept: ${[...ilWhy].map(([k, n]) => `${n.toLocaleString()} ${k}`).join(', ') || 'none'}; concept words (repent/baptize/genealogy…): ${conceptN}`);
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
for (const s of samples.slice(0, SAVED ? 400 : (argv.includes('--only') ? 99 : 8))) console.log('  ' + s);
cdb.close(); sdb.close();
