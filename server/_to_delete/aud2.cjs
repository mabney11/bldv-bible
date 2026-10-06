const fs=require('fs');const root0='/'+process.cwd().replace(/^\//,'');
const {createGlossResolver}=require(root0+'/gloss-resolver.cjs');
const L=n=>JSON.parse(fs.readFileSync(root0+'/lexicon/'+n,'utf8'));
const lexicon=L('lexicon.json'),homographs=L('homographs.json');let he={};try{he=L('hebrew-extra-lexicon.json')}catch{}
const st=JSON.parse(fs.readFileSync(root0+'/strongs-hebrew.json','utf8'));const roots=L('strongs-roots.json');
const occ=JSON.parse(fs.readFileSync(process.env.HOME+'/occ.json','utf8'));
const resolve=createGlossResolver({homographs,lexicon,hebExtra:he});
const out=[];
for(const [sn,bk] of Object.entries(occ)){const e=st[sn];if(!e||!/^\(Aramaic\)/.test(e.derivation||''))continue;const root=roots[sn]||'';
 const d=resolve({sn,snKeys:[`${root}_${sn}`,sn],roots:[root]});
 out.push({sn,root,got:d&&d.text,src:d&&d.src,kjv:e.kjv_def,books:bk});}
out.sort((a,b)=>parseInt(a.sn.slice(1))-parseInt(b.sn.slice(1)));
fs.writeFileSync(process.env.HOME+'/aram.json',JSON.stringify(out));console.log(out.length);
