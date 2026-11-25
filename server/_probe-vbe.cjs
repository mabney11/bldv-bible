const Module=require('module');Module._load=(o=>function(r,...a){return r==='better-sqlite3'?function(){}:o.call(this,r,...a)})(Module._load);
process.env.PALEO_PARSE_ONLY='1';const {parseToken}=require('./build-surface-index.js');
for (const line of require('fs').readFileSync('/tmp/rows.txt','utf8').trim().split('\n')){const [w,pos,m,sn]=line.split('\t');
 const p=parseToken(w,pos,m,sn);console.log(w,pos,(m.match(/vt=[^|]*|prs=[^|]*|pfm=[^|]*/g)||[]).join(','),'=>',p.components.map(c=>c.paleo+' '+c.css).join(' | '));}
