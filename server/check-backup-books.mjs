// check-backup-books.mjs — verify corpus.db.bak has the 8 missing books
// and that their text is clean (no glosses from previous runs).
let Database; ({default:Database}=await import('better-sqlite3'));
const db=new Database('./corpus.db.bak',{readonly:true});
const missing=['LETTER_OF_JEREMIAH','3_MACCABEES','4_MACCABEES','4_EZRA',
                '1_MEQABYAN','2_MEQABYAN','3_MEQABYAN','WORDS_OF_AZARIAH'];
// also try alternate codes
const alts={'LETTER_OF_JEREMIAH':['BARUCH','BAR'],'WORDS_OF_AZARIAH':['AZAR','AZR']};
console.log('Checking corpus.db.bak for the 8 missing books:\n');
for (const code of missing) {
  const codes=[code,...(alts[code]||[])];
  let found=null;
  for(const c of codes){
    const r=db.prepare("SELECT COUNT(*) n, MIN(text) t FROM verses WHERE corpus='ENG' AND code=?").get(c);
    if(r&&r.n>0){found={code:c,n:r.n,sample:r.t?.slice(0,60)};break;}
  }
  if(found) console.log(`  \u2713 ${found.code}: ${found.n} verses — "${found.sample}"`);
  else console.log(`  \u2717 NOT FOUND: ${code} (tried: ${codes.join(', ')})`);
}
// check if any have glosses (would indicate normalization already ran)
const glossed=db.prepare("SELECT COUNT(*) n FROM verses WHERE corpus='ENG' AND canon_id>39 AND text LIKE '% (% (%))%'").get();
const applied=db.prepare("SELECT COUNT(*) n FROM verses WHERE corpus='ENG' AND canon_id>39 AND text LIKE '% (%)'").get();
console.log(`\nGloss check in backup (non-OT ENG):`);
console.log(`  doubled glosses: ${glossed.n} (should be 0 for clean backup)`);
console.log(`  any parenthetical: ${applied.n} (0 = fully clean pre-normalization)`);
db.close();
