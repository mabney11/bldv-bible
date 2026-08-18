// Quick diagnostic: why isn't the Psalms superscription branch firing?
// Run from server/: node diag-psalm51.js
'use strict';
const fs = require('fs');
const Database = require('better-sqlite3');

const db = new Database('corpus.db');
const PSALMS_CANON = 19;

// MT verse set for Psalm 51 (and a couple others) straight from tokens_bhs
for (const ch of [3, 4, 51, 52]) {
  const rows = db.prepare('SELECT DISTINCT verse FROM tokens_bhs WHERE book_id=? AND chapter=?').all(PSALMS_CANON, ch);
  const mt = rows.map(r => r.verse).sort((a,b)=>a-b);

  // WEB verse set for the same chapter, read the same way load-english-baseline.js does
  const web = {};
  for (const ln of fs.readFileSync('english-baseline.jsonl','utf8').split(/\r?\n/)) {
    if (!ln) continue;
    let o; try { o = JSON.parse(ln); } catch { continue; }
    if (o.code !== 'PSA' || o.chapter !== ch) continue;
    web[o.verse] = true;
  }
  const webVs = Object.keys(web).map(Number).sort((a,b)=>a-b);

  const M = mt.length, W = webVs.length, lead = M - W;
  console.log(`Psalm ${ch}: MT(n=${M})=[${mt.join(',')}]`);
  console.log(`           WEB(n=${W})=[${webVs.join(',')}]`);
  console.log(`           lead=M-W=${lead}  isPsalmsTitleGap=${PSALMS_CANON===19 && lead>0 && lead<=2}`);
  console.log('');
}
db.close();
