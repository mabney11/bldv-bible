// verify-letters.mjs — sanity check for build-headings.mjs's LETTERS table.
// Confirms translit(nameP) reproduces books.js's own LETTER_NAMES label for
// every entry, so the paleo "spelled" word shown next to an acrostic heading
// always matches the name printed beside it. Run after touching LETTERS.
//
//   node verify-letters.mjs

import { readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
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
if (!booksPath) { console.error('books.js not found'); process.exit(1); }
const { translit, LETTER_NAMES } = await import(pathToFileURL(booksPath).href);

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

let fails = 0;
for (const [name, [ltr, nameP]] of Object.entries(LETTERS)) {
  const want = LETTER_NAMES[ltr];
  const got = translit(nameP);
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(7)} spelled=${nameP}  translit=${got}  want=${want}`);
}
console.log(fails ? `\n${fails} mismatch(es).` : '\nAll 22 letters round-trip correctly.');
process.exit(fails ? 1 : 0);
