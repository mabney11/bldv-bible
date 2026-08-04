# run this on your machine after apply-web-strongs.mjs, then paste the output
node -e "
const fs=require('fs');
const rows=fs.readFileSync('english-baseline.jsonl','utf8').split(/\n/).filter(Boolean).map(l=>JSON.parse(l));
for(const ref of [['GEN',5,32],['GEN',7,20],['EXOD',26,3],['GEN',1,16]]){
  const r=rows.find(x=>x.code===ref[0]&&x.chapter===ref[1]&&x.verse===ref[2]);
  if(r) console.log(ref.join(' ')+'  '+r.text);
}
// count how numbers render: bare vs glossed
let bare=0, glossed=0;
const NUMS=['chamash','arabai','shalash','shanayam','ishar','shabai','shamanah','thashai','shashah','maah'];
for(const r of rows) for(const nu of NUMS){
  const g=new RegExp(nu+' \\\\([a-z]+\\\\)').test(r.text);
  const b=new RegExp('\\\\b'+nu+'\\\\b(?! \\\\()').test(r.text);
  if(g) glossed++; if(b&&!g) bare++;
}
console.log('\nnumbers glossed:',glossed,' bare:',bare);
"
