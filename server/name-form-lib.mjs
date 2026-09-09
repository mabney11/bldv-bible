// name-form-lib.mjs — one implementation of the name-form rules, shared by the
// deploy gate (verify-name-forms.mjs) and the repair (fix-name-forms.mjs).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function loadRules() {
  const rules = JSON.parse(readFileSync(path.join(__dirname, 'lexicon', 'name-form-rules.json'), 'utf8'));
  const nm = JSON.parse(readFileSync(path.join(__dirname, 'name-map-expanded.json'), 'utf8'));
  const single = nm.single || {};
  const must = Object.fromEntries(Object.entries(rules.must || {}).map(([k, v]) => [k, [].concat(v)]));
  const mustRe = Object.keys(must).length ? new RegExp(`([A-Za-z'\\-]+) \\((${Object.keys(must).map(esc).join('|')})\\)`, 'g') : null;
  const dah = rules.divineAsHuman || {};
  const heads = dah.heads || [];
  const divineGl = new Set(dah.divineGlosses || []);
  const dahRe = heads.length ? new RegExp(`\\b(${heads.map(esc).join('|')}) \\(([A-Z][a-z][A-Za-z'\\-]*)\\)`, 'g') : null;
  const forbidden = (rules.forbidden || []).map(f => ({ re: new RegExp(f.pattern, 'g'), why: f.why }));
  // replace: a plain rewrite — YHWH / Jehovah / the LORD → "Yahawah ()". One word for one
  // word plus the "()" marker, which the link tokeniser (/[A-Za-z…'-]+/) does not count.
  const replace = (rules.replace || []).map(f => ({ re: new RegExp(f.pattern, 'g'), to: f.to, why: f.why }));
  // bare names: KJV spellings → the app's transliteration (translit of the Hebrew root)
  const bn = rules.bareNames || {};
  const skip = new Set(bn.skip || []);
  const minLen = bn.minLen || 4;
  const bare = new Map();
  for (const [k, v] of Object.entries(single)) if (k.length >= minLen && /^[A-Z][a-z]+$/.test(k) && v && v !== k && !skip.has(k)) bare.set(k, v);
  const phrases = new Map();
  for (const [k, v] of Object.entries(nm.phrases || {})) if (/^[A-Z][A-Za-z]+(?:[ -][A-Z][A-Za-z]+)+$/.test(k) && v && !skip.has(k)) phrases.set(k, v);
  // gold headword markers: the reader paints "Word ()" gold — the words that take an empty
  // gloss are server/lexicon/auto-gloss-words.json (520, from the 2026-08-29 migration)
  let gold = new Set();
  try { gold = new Set(JSON.parse(readFileSync(path.join(__dirname, 'lexicon', 'auto-gloss-words.json'), 'utf8'))); } catch { /* none */ }
  return { must, mustRe, heads, divineGl, dahRe, forbidden, replace, single, bare, phrases, gold };
}

// ── gold markers: "Yahawah" → "Yahawah ()" ─────────────────────────────────────
// Same rule as the 2026-08-29 gloss_engine: a word from auto-gloss-words.json gets
// " ()" when it is not already followed by "(" and the innermost open parenthesis
// (if any) is a plain aside, not some other word's gloss. A gloss frame is a "("
// that immediately follows a word; an aside is any other "(". "()" adds no word
// token, so translation_links are untouched. translation.db only — the corpus
// keeps names bare.
export function goldMarkers(text, R) {
  if (!text || !R.gold.size) return { fixed: text, hits: [] };
  const toks = [...text.matchAll(TOK)];
  const stack = [];          // true = gloss frame, false = aside
  const hits = []; let out = '', last = 0;
  for (let i = 0; i < toks.length; i++) {
    const m = toks[i], w = m[0];
    if (w === '(') { const prev = toks[i - 1]; stack.push(!!(prev && prev[0] !== '(' && prev[0] !== ')' && /^\S*$/.test(text.slice(prev.index + prev[0].length, m.index).trim()))); continue; }
    if (w === ')') { stack.pop(); continue; }
    if (!R.gold.has(w)) continue;
    if (stack.length && stack[stack.length - 1]) continue;                  // inside another word's gloss
    const nxt = toks[i + 1];
    if (nxt && nxt[0] === '(' && text.slice(m.index + w.length, nxt.index).trim() === '') continue;   // already glossed
    const end = m.index + w.length;
    // possessive "Yahawah's" stays plain, as the corpus writes it
    if (text.slice(end, end + 2) === "'s" || text.slice(end, end + 2) === '\u2019s') continue;
    out += text.slice(last, end) + ' ()';
    last = end;
    hits.push({ text: w, fix: `${w} ()`, why: 'gold headword marker' });
  }
  out += text.slice(last);
  return { fixed: out, hits };
}

// ── bare names ────────────────────────────────────────────────────────────────
// Walk the verse token by token; outside every parenthesis, a KJV name that is not
// already the headword of a gloss ("Joseph (" …) becomes "Yawasap (Joseph)". The
// English word count grows by one per name (the gloss adds a token), so the
// returned `shifts` are the word indices after which translation_links'
// english_indices must move up by one — see fix-name-forms.mjs.
const TOK = /[A-Za-z\u00C0-\u024F'-]+|\(|\)/g;
export function bareNames(text, R) {
  if (!text || !R.bare.size) return { fixed: text, hits: [], shifts: [] };
  const toks = [...text.matchAll(TOK)];
  const hits = [], shifts = [];
  let depth = 0, wordIx = -1, out = '', last = 0;
  for (let i = 0; i < toks.length; i++) {
    const m = toks[i], w = m[0];
    if (w === '(') { depth++; continue; }
    if (w === ')') { depth = Math.max(0, depth - 1); continue; }
    wordIx++;
    if (depth) continue;
    // two-word names first (Beth Shean, Obed Edom): the pair must both be bare
    const nxt = toks[i + 1];
    let name = null, to = null, span = 1;
    if (nxt && /^[A-Za-z]/.test(nxt[0]) && R.phrases.has(`${w} ${nxt[0]}`)) { name = `${w} ${nxt[0]}`; to = R.phrases.get(name); span = 2; }
    else if (R.bare.has(w)) { name = w; to = R.bare.get(w); }
    if (!name) continue;
    const after = toks[i + span];
    if (after && after[0] === '(') continue;                   // already a headword
    const end = span === 2 ? nxt.index + nxt[0].length : m.index + w.length;
    out += text.slice(last, m.index) + `${to} (${name})`;
    last = end;
    hits.push({ text: name, fix: `${to} (${name})`, why: 'bare KJV name — never rendered' });
    shifts.push(wordIx + span - 1);                            // the gloss token lands after this word index
    if (span === 2) { i++; wordIx++; }
  }
  out += text.slice(last);
  return { fixed: out, hits, shifts };
}
/** english_indices (word positions) after inserting one token after each index in `shifts`. */
export function shiftIndices(indices, shifts) {
  return indices.map((ix) => ix + shifts.filter((s) => s < ix).length);
}

/** Which allowed form to use for a wrong one: keep a gentilic ending (-ay) when the list has one. */
function pickAllowed(allowed, wrong) {
  const tail = wrong.slice(-2);
  return allowed.find(a => a.endsWith(tail)) || allowed[0];
}

/** Scan one verse: { violations:[{text,fix,why}], fixed:string }. There is no warning tier — every rule fails. */
export function checkText(text, R) {
  const violations = [];
  let fixed = text;
  if (R.mustRe) {
    fixed = fixed.replace(R.mustRe, (m, tr, name) => {
      if (R.must[name].includes(tr)) return m;
      const to = `${pickAllowed(R.must[name], tr)} (${name})`;
      violations.push({ text: m, fix: to, why: `must be ${R.must[name].map(a => `"${a} (${name})"`).join(' or ')}` });
      return to;
    });
  }
  if (R.dahRe) {
    fixed = fixed.replace(R.dahRe, (m, head, name) => {
      if (R.divineGl.has(name)) return m;
      const to = R.single[name];
      if (!to || R.divineGl.has(to)) return m;                 // no spelling on file → leave, don't guess
      const out = `${to} (${name})`;
      violations.push({ text: m, fix: out, why: `${head} is the divine name; ${name} is ${to}` });
      return out;
    });
  }
  for (const f of R.replace) {
    fixed = fixed.replace(f.re, (m) => { violations.push({ text: m, fix: f.to, why: f.why }); return f.to; });
  }
  // Displaced gloss: "Baarashabai (in) Beersheba" — the transliteration landed on the word
  // before the name and the name stayed bare. Put the word back and gloss the name:
  // "in Baarashabai (Beersheba)".
  fixed = fixed.replace(/\b([A-Z][a-z]+) \(([a-z][a-z' -]{0,20})\) ([A-Z][a-z]+)\b(?! \()/g, (m, tr, word, name) => {
    if (R.single[name] !== tr) return m;
    const to = `${word} ${tr} (${name})`;
    violations.push({ text: m, fix: to, why: 'displaced gloss — the transliteration sat on the word before the name' });
    return to;
  });
  // Inverted gloss: "Egypt (Matzarayam)" — the English got the headword and the Hebrew the
  // gloss. Swap them: "Matzarayam (Egypt)".
  fixed = fixed.replace(/\b([A-Z][a-z]+) \(([A-Z][a-z]+)\)/g, (m, name, tr) => {
    if (R.single[name] !== tr || R.single[tr] === name) return m;
    const to = `${tr} (${name})`;
    violations.push({ text: m, fix: to, why: 'inverted gloss — the transliteration is the headword' });
    return to;
  });
  for (const f of R.forbidden) {
    f.re.lastIndex = 0;
    const m = f.re.exec(fixed);
    if (m) violations.push({ text: m[0], fix: null, why: f.why });
  }
  return { violations, fixed };
}
