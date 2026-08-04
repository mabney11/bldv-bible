#!/usr/bin/env python3
# morph-grc.db — per-word lemma + decoded Robinson parsing + gloss + Strong's
# for the Greek NT, aligned to corpus.db GNT (Robinson-Pierpont Byzantine).
# Sources: ByzTxt (RP2018, Unicode strongs+parsing) · openscriptures Strong's · Dodson.
import csv, os, re, sqlite3, unicodedata, json
HERE=os.path.dirname(os.path.abspath(__file__))
BYZ=os.path.join(HERE,'byz','csv-unicode','strongs','with-parsing')
MG=os.path.join(HERE,'morphgnt')
CANON={'MAT':40,'MAR':41,'LUK':42,'JOH':43,'ACT':44,'ROM':45,'1CO':46,'2CO':47,'GAL':48,
'EPH':49,'PHP':50,'COL':51,'1TH':52,'2TH':53,'1TI':54,'2TI':55,'TIT':56,'PHM':57,'HEB':58,
'JAM':59,'1PE':60,'2PE':61,'1JO':62,'2JO':63,'3JO':64,'JUD':65,'REV':66}

def stripacc(s): return ''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn').lower()

# Strong's -> lemma + fallback gloss
sg=json.loads(re.search(r'\{.*\}', open(os.path.join(MG,'strongs-greek.js'),encoding='utf-8').read(), re.S).group(0))
def lemma_of(n):
    e=sg.get(f'G{n}'); return e.get('lemma') if e else None
def sg_gloss(n):
    e=sg.get(f'G{n}')
    if not e: return None
    g=(e.get('strongs_def') or e.get('kjv_def') or '').strip(' .;')
    return g or None
# Dodson brief gloss by Strong's (4-digit)
dod={}
with open(os.path.join(MG,'dodson.csv'),encoding='utf-8') as f:
    rd=csv.reader(f, delimiter='\t')
    next(rd,None)
    for row in rd:
        if len(row)>=4 and row[0].strip().isdigit():
            dod[str(int(row[0]))]=row[3].strip()
def gloss_of(n):
    return dod.get(str(int(n))) or sg_gloss(n)

# ---- Robinson morph decoder ----
TENSE={'P':'present','I':'imperfect','F':'future','A':'aorist','R':'perfect','L':'pluperfect'}
VOICE={'A':'active','M':'middle','P':'passive','E':'middle/passive','D':'middle deponent',
       'O':'passive deponent','N':'mid/pass deponent','Q':'impersonal'}
MOOD={'I':'indicative','S':'subjunctive','O':'optative','M':'imperative','N':'infinitive','P':'participle'}
PERS={'1':'1st person','2':'2nd person','3':'3rd person'}
CASE={'N':'nominative','G':'genitive','D':'dative','A':'accusative','V':'vocative'}
NUM={'S':'singular','P':'plural'}
GEN={'M':'masculine','F':'feminine','N':'neuter'}
DEG={'C':'comparative','S':'superlative'}
PARTICLE={'PREP':'preposition','CONJ':'conjunction','COND':'conditional particle',
 'PRT':'particle','ADV':'adverb','INJ':'interjection','ARAM':'Aramaic (indeclinable)',
 'HEB':'Hebrew (indeclinable)'}
POSNAME={'N':'noun','A':'adjective','T':'article','V':'verb','P':'personal pronoun',
 'R':'relative pronoun','C':'reciprocal pronoun','D':'demonstrative pronoun',
 'F':'reflexive pronoun','S':'possessive pronoun','K':'correlative pronoun',
 'I':'interrogative pronoun','X':'indefinite pronoun','Q':'corel./interrog. pronoun'}
def decode(tag):
    if tag in PARTICLE: return PARTICLE[tag], PARTICLE[tag]
    parts=tag.split('-'); p0=parts[0]
    if p0 in PARTICLE:  # e.g. PRT-N, ADV-C, CONJ-N
        return PARTICLE[p0], PARTICLE[p0]
    if tag in ('N-PRI','N-LI','N-OI'): return 'noun','noun (indeclinable)'
    if tag=='A-NUI': return 'adjective','numeral (indeclinable)'
    base=POSNAME.get(p0,p0)
    if p0=='V':
        tvm=parts[1] if len(parts)>1 else ''
        rest=parts[2] if len(parts)>2 else ''
        second = tvm[:1]=='2'
        if second: tvm=tvm[1:]
        tense=TENSE.get(tvm[0:1]); voice=VOICE.get(tvm[1:2]); mood=MOOD.get(tvm[2:3])
        bits=[]
        if tense: bits.append(('second '+tense) if second else tense)
        if voice: bits.append(voice)
        if mood: bits.append(mood)
        if mood=='participle':
            for x in (CASE.get(rest[0:1]),NUM.get(rest[1:2]),GEN.get(rest[2:3])):
                if x: bits.append(x)
        elif mood!='infinitive':
            for x in (PERS.get(rest[0:1]),NUM.get(rest[1:2])):
                if x: bits.append(x)
        return base, base+(' — '+', '.join(bits) if bits else '')
    # nominal / pronoun
    cng=parts[1] if len(parts)>1 else ''
    bits=[]; idx=0
    if p0 in ('P','S','F','K','X','I','Q','C','R','D') and cng[:1] in '123':
        bits.append(PERS.get(cng[0:1])); idx=1
    seg=cng[idx:]
    for x in (CASE.get(seg[0:1]),NUM.get(seg[1:2]),GEN.get(seg[2:3])):
        if x: bits.append(x)
    if seg[-1:] in DEG and len(seg)>=4: bits.append(DEG[seg[-1:]])
    return base, base+(' — '+', '.join(bits) if bits else '')

# ---- parse byz, build rows ----
TOKRE=re.compile(r'(\S+)\s+(\d+)\s+\{([^}]+)\}')
rows=[]
for code,canon in CANON.items():
    with open(os.path.join(BYZ,code+'.csv'),encoding='utf-8') as f:
        for r in csv.DictReader(f):
            ch=int(r['chapter']); v=int(r['verse'])
            for w,(word,strongs,morph) in enumerate(TOKRE.findall(r['text']),1):
                posname,parsed=decode(morph)
                rows.append((canon,ch,v,w,word,stripacc(word),lemma_of(strongs),
                             f'G{int(strongs)}',morph,posname,parsed,gloss_of(strongs)))
print(f"[byz] {len(rows)} word rows")
# spot checks
chk={(43,1,1),(46,1,1)}
for r in rows:
    if (r[0],r[1],r[2]) in chk and r[3]<=4:
        print("  CHK",r[0],r[1],r[2],r[4],'|',r[6],'|',r[8],'->',r[10],'|',r[11])

db=os.path.join(HERE,'morph-grc.db')
if os.path.exists(db): os.remove(db)
con=sqlite3.connect(db); cur=con.cursor()
cur.execute("PRAGMA journal_mode=OFF"); cur.execute("PRAGMA synchronous=OFF")
cur.execute("""CREATE TABLE words(canon_id INT,ch INT,v INT,w INT,word TEXT,norm TEXT,
  lemma TEXT,strongs TEXT,parse TEXT,pos_name TEXT,parsed TEXT,gloss TEXT)""")
cur.executemany("INSERT INTO words VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)
cur.execute("CREATE INDEX ix_loc ON words(canon_id,ch,v,w)")
cur.execute("CREATE INDEX ix_lemma ON words(lemma)")
cur.execute("CREATE INDEX ix_strongs ON words(strongs)")
cur.execute("""CREATE TABLE lemma_index AS SELECT lemma, MAX(strongs) strongs,
  MAX(gloss) gloss, MAX(pos_name) pos_name, COUNT(*) n FROM words
  WHERE lemma IS NOT NULL GROUP BY lemma""")
cur.execute("CREATE INDEX ix_li ON lemma_index(lemma)")
con.commit()
ng=sum(1 for r in rows if r[11]); nl=sum(1 for r in rows if r[6])
print(f"[morph-grc.db] {len(rows)} words · {nl} with lemma ({100*nl//len(rows)}%) · "
      f"{ng} with gloss ({100*ng//len(rows)}%) · "
      f"{cur.execute('SELECT COUNT(*) FROM lemma_index').fetchone()[0]} lemmas")
con.close()
