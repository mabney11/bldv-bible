const fs=require('fs');
const {createGlossResolver}=require(process.cwd()+'/gloss-resolver.cjs');
const L=n=>JSON.parse(fs.readFileSync('lexicon/'+n,'utf8'));
const lexicon=L('lexicon.json'),homographs=L('homographs.json');let he={};try{he=L('hebrew-extra-lexicon.json')}catch{}
const st=JSON.parse(fs.readFileSync('strongs-hebrew.json','utf8'));
const roots=L('strongs-roots.json');
const resolve=createGlossResolver({homographs,lexicon,hebExtra:he});
const Database=require('better-sqlite3');
const db=new Database('surface-index.db',{readonly:true});
const rows=db.prepare("select strongs sn,book_id b,count(*) n from surface_occurrences where strongs like 'H%' group by strongs,book_id").all();
const bySn={};for(const r of rows){(bySn[r.sn]=bySn[r.sn]||{})[r.b]=r.n}
const out=[];
for(const [sn,bk] of Object.entries(bySn)){
  const e=st[sn];if(!e||!/^\(Aramaic\)/.test(e.derivation||''))continue;
  const root=roots[sn]||'';
  const d=resolve({sn,snKeys:[`${root}_${sn}`,sn],roots:[root]});
  out.push({sn,root,got:d&&d.text,src:d&&d.src,kjv:e.kjv_def,strongs:e.strongs_def,books:bk});
}
out.sort((a,b)=>parseInt(a.sn.slice(1))-parseInt(b.sn.slice(1)));
console.log(out.length,'aramaic SNs in db');
const bad=out.filter(o=>o.src!=='homograph'&&o.src!=='homographs');
console.log([...new Set(out.map(o=>o.src))]);
fs.writeFileSync('/tmp/aram.json',JSON.stringify(out,null,0));
