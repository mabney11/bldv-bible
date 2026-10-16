#!/usr/bin/env node
// build-strongs-paleo.mjs — BAKE the Strong's dictionary the site serves into Paleo.
// CLAUDE.md rule zero: no square script on the site, and no conversion at request time
// (fieldy, 2026-10-16: "there needs to be no conversion at the site level, the conversions
// should already be baked"). strongs-hebrew-expanded.json (square, pointed) stays the source
// for the offline scripts; server.js reads ONLY the output, strongs-hebrew-paleo.json:
//   lemma       the lemma's consonantal parts in Paleo, one space between parts (maqaf/space split)
//   xlit, pron  unchanged
//   strongs_def, derivation, kjv_def   the same text with every square word in Paleo
//                                      (points dropped, punctuation kept)
// Re-run after the dictionary changes; verify-no-square-script.mjs fails if the output is
// missing, stale (fewer numbers than the source) or holds square script.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { toPaleoDisplay, SQUARE_RE } = require('./no-square-script.cjs');
const SRC = ['strongs-hebrew-expanded.json', 'strongs-hebrew.json'].map(f => path.join(HERE, f)).find(f => fs.existsSync(f));
const OUT = path.join(HERE, 'strongs-hebrew-paleo.json');
const dict = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const lemmaParts = (lemma) => String(lemma || '').replace(/־/g, ' ').split(/[\s-]+/).map(s => toPaleoDisplay(s).replace(/[\u05F3\u05F4\u034F]/g, '')).filter(Boolean);   // geresh/gershayim and the combining grapheme joiner are not lemma letters
const out = {};
for (const [sn, e] of Object.entries(dict)) {
    if (!e) continue;
    const o = { ...e, lemma: lemmaParts(e.lemma).join(' ') };
    for (const k of ['strongs_def', 'derivation', 'kjv_def']) if (typeof e[k] === 'string') o[k] = toPaleoDisplay(e[k]);
    out[sn] = o;
}
const txt = JSON.stringify(out);
if (SQUARE_RE.test(txt)) { console.error('square script left in the output — not written'); process.exit(1); }
fs.writeFileSync(OUT, txt + '\n');
console.log(`${Object.keys(out).length} Strong's entries baked to Paleo -> ${path.basename(OUT)} (from ${path.basename(SRC)})`);
