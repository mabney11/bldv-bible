import { readFileSync, existsSync } from 'node:fs';
const M = existsSync('./word-map.json') ? JSON.parse(readFileSync('./word-map.json','utf8')) : {};
const all = { ...(M.names||{}), ...(M.peoples||{}), ...(M.divine||{}) };
for (const w of ['judah','joseph','jerusalem','joshua','benjamin','jonathan','josiah','jeremiah','jehoiachin','lord','god']) {
  console.log(`  ${w.padEnd(12)} -> ${all[w] || '(NOT IN MAP)'}`);
}
console.log(`\n  map totals: names ${Object.keys(M.names||{}).length}, peoples ${Object.keys(M.peoples||{}).length}, divine ${Object.keys(M.divine||{}).length}`);
