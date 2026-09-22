import { readFileSync } from 'fs';
const mod = await import('./src/lib/books.js');
const translit = mod.translit;
const roots = JSON.parse(readFileSync('server/lexicon/strongs-roots.json','utf8'));
const shanah = roots['H8141'];
const shnayim = roots['H8147'];

function plenePlural(surface, root) {
  const s = [...surface], r = [...root];
  let p = 0, last = -1, skipped = 0;
  for (let i = 0; i < s.length && p < r.length; i++) {
    if (s[i] === r[p]) { p++; last = i; continue; }
    const q = r.indexOf(s[i], p + 1);
    if (q > p) { skipped += q - p; p = q + 1; last = i; }
  }
  if (p < r.length) skipped += r.length - p;
  if (!skipped) return surface;
  const tail = last >= 0 ? s.slice(last + 1).join('') : '';
  return root + tail;
}
const restored = plenePlural(shnayim, shanah);
console.log('bare H8141 root translit:', translit(shanah));
console.log('bare H8147 root translit:', translit(shnayim));
console.log('plenePlural-restored translit:', translit(restored));
