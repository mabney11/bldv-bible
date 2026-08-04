# run on your machine after apply-web-strongs.mjs, paste the output
node -e "
const fs=require('fs');
const rows=fs.readFileSync('english-baseline.jsonl','utf8').split(/\n/).filter(Boolean).map(l=>JSON.parse(l));
console.log('=== how father/fathers render in the OT baseline ===');
let s=0,pl=0;
const forms={};
for(const r of rows){
  for(const m of r.text.matchAll(/([a-z]+) \((fathers?)\)/g)){
    forms[m[2]]=forms[m[2]]||{}; forms[m[2]][m[1]]=(forms[m[2]][m[1]]||0)+1;
  }
}
console.log('forms found (translit -> count), by gloss:');
console.log(JSON.stringify(forms,null,1));
console.log('\n=== sample verses ===');
for(const r of rows){ if(/\((fathers?)\)/.test(r.text)){ console.log(' ',r.code,r.chapter+':'+r.verse,r.text.match(/[a-z]+ \(fathers?\)/)[0]); s++; if(s>=6)break; } }
console.log('\n=== the word map ===');
const M=JSON.parse(fs.readFileSync('word-map.json','utf8'));
console.log('terms.father   =',(M.terms||{}).father);
console.log('terms.fathers  =',(M.terms||{}).fathers);
console.log('termsAmbiguous.father  =',(M.termsAmbiguous||{}).father);
console.log('termsAmbiguous.fathers =',(M.termsAmbiguous||{}).fathers);
console.log('termsDominant.father   =',(M.termsDominant||{}).father);
"
