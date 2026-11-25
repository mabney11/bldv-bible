const Module=require('module');const {DatabaseSync}=require('node:sqlite');
Module._load=(o=>function(r,...a){return r==='better-sqlite3'?function(){}:o.call(this,r,...a)})(Module._load);
process.env.PALEO_PARSE_ONLY='1';const {parseToken}=require('./build-surface-index.js');
const db=new DatabaseSync('file:'+process.cwd()+'/corpus.db?immutable=1',{readOnly:true});
const q=db.prepare(`SELECT word_raw, pos, morph, strongs, COUNT(*) AS n FROM tokens_bhs WHERE pos = 'verb' AND word_raw LIKE ? || '%' GROUP BY morph ORDER BY n DESC LIMIT 60`);
const pf='𐤉';const rows=q.all(pf);console.log('rows',rows.length);const tally=new Map();
for(const row of rows){ if([...row.word_raw].length<[...pf].length+3) continue; const p=parseToken(row.word_raw,row.pos,row.morph,row.strongs);
 const lead=[];let acc='';for(const c of p.components){ if(!/^(pfm|vbs)-/.test(c.css||'')) break; lead.push(c); acc+=c.paleo||''; if(acc===pf) break;}
 const k=acc===pf?lead.map(c=>c.css).join('+'):'MISS:'+acc+':'+p.components.map(c=>c.paleo+c.css).join(',');tally.set(k,(tally.get(k)||0)+1);}
console.log([...tally].sort((a,b)=>b[1]-a[1]).slice(0,6));
