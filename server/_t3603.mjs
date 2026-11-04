import { DatabaseSync } from 'node:sqlite';
const MF = await import(process.cwd() + '/modform-lib.mjs');
const db = new DatabaseSync('file:' + process.cwd() + '/surface-index.db?immutable=1', { readOnly: true });
await MF.loadCharMap();
const load = MF.verseWordsLoader(db);
for (const [src,b,c,v] of [['BHS',2,25,39],['BHS',1,13,10],['HEB',66,16,21],['HEB',40,25,15],['HEB',40,14,17]]) {
  const ws = load(src,b,c,v).filter(w => /^H3603/.test(w.sn));
  console.log(src,b,c,v, ws.map(w => w.form + ' ' + w.sn + ' rootsn=' + (w.comps.find(x=>x.css==='root')||{}).sn).join(' | '));
}
