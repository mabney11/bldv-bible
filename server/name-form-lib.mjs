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
  return { must, mustRe, heads, divineGl, dahRe, forbidden, replace, single };
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
  for (const f of R.forbidden) {
    f.re.lastIndex = 0;
    const m = f.re.exec(fixed);
    if (m) violations.push({ text: m[0], fix: null, why: f.why });
  }
  return { violations, fixed };
}
