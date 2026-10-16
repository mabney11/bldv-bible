'use strict';
// NO SQUARE SCRIPT — the ONE converter. fieldy, 2026-10-16: "as long as no square script
// is available to read on my web app i dont care about the underlying data" / "the maqaf
// should stay the maqaf -- all punctuation should stay" / "project knowledge that has no
// wiggle room". Square Hebrew letters -> Paleo (finals folded, presentation forms
// decomposed), vowel points + cantillation dropped, ALL punctuation kept (maqaf, paseq,
// sof pasuq, nun hafukha, geresh, gershayim). Idempotent; non-Hebrew text untouched.
// TWO COPIES, KEPT IDENTICAL: server/no-square-script.cjs and src/lib/noSquareScript.js —
// server/verify-no-square-script.mjs fails the pipeline if they ever disagree.
const SQUARE_RE = /[֑-ׇֽֿׁׂׅׄא-תׯ-ײיִ-ﭏ]/;
const KEEP_PUNCT = new Set(['־', '׀', '׃', '׆']);
const MAP = (() => {
    const base = 'אבגדהוזחטיכלמנסעפצקרשת';
    const paleo = [...'\u{10900}\u{10901}\u{10902}\u{10903}\u{10904}\u{10905}\u{10906}\u{10907}\u{10908}\u{10909}\u{1090A}\u{1090B}\u{1090C}\u{1090D}\u{1090E}\u{1090F}\u{10910}\u{10911}\u{10912}\u{10913}\u{10914}\u{10915}'];
    const m = {};
    [...base].forEach((h, i) => { m[h] = paleo[i]; });
    const fin = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
    for (const [f, b] of Object.entries(fin)) m[f] = m[b];
    m['ׯ'] = m['י'];
    m['װ'] = m['ו'] + m['ו'];
    m['ױ'] = m['ו'] + m['י'];
    m['ײ'] = m['י'] + m['י'];
    return m;
})();
function toPaleoDisplay(s) {
    if (s == null) return s;
    const str = String(s);
    if (!SQUARE_RE.test(str)) return str;
    let out = '';
    for (const ch0 of str) {
        const parts = (ch0 >= 'יִ' && ch0 <= 'ﭏ') ? ch0.normalize('NFKD') : ch0;
        for (const ch of parts) {
            const p = MAP[ch];
            if (p) { out += p; continue; }
            const cp = ch.codePointAt(0);
            if (cp >= 0x0591 && cp <= 0x05C7 && !KEEP_PUNCT.has(ch)) continue;
            if (cp >= 0xFB1D && cp <= 0xFB4F) continue;   // a presentation form with no decomposition (U+FB1E varika is a point)
            out += ch;
        }
    }
    return out;
}
module.exports = { SQUARE_RE, KEEP_PUNCT, toPaleoDisplay };
