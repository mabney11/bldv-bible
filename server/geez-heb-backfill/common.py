# shared helpers for the Ge'ez -> Hebrew backfill (1/2/3 Meqabyan etc.)
import re, unicodedata, sqlite3
SQUARE = "אבגדהוזחטיכלמנסעפצקרשת"
PALEO = ['𐤀','𐤁','𐤂','𐤃','𐤄','𐤅','𐤆','𐤇','𐤈','𐤉','𐤊','𐤋','𐤌','𐤍','𐤎','𐤏','𐤐','𐤑','𐤒','𐤓','𐤔','𐤕']
P2S = {p: s for s, p in zip(SQUARE, PALEO)}
FINALS = {'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'}
TO_FINAL = {v: k for k, v in FINALS.items()}
HEB_LET = set(SQUARE)

def heb_norm(w):
    """any Hebrew word (paleo or square, pointed or not) -> unpointed square, no finals"""
    out = []
    for ch in unicodedata.normalize('NFC', w):
        cp = ord(ch)
        if 0x0591 <= cp <= 0x05C7: continue
        ch = P2S.get(ch, ch); ch = FINALS.get(ch, ch)
        if ch in HEB_LET: out.append(ch)
    return ''.join(out)

def heb_display(n):
    return n[:-1] + TO_FINAL.get(n[-1], n[-1]) if n else n

def heb_words(text):
    return [w for w in (heb_norm(t) for t in re.split(r'[\s\-־,.;:!?״"\'()\[\]׃·]+', text or '')) if w]

HEB_PROCL = set('והבלכמש')
def heb_peels(w):
    """w and every proclitic-peeled residue (up to 3 letters, residue >= 2 letters)"""
    out = [w]; cur = w
    for _ in range(3):
        if len(cur) > 2 and cur[0] in HEB_PROCL:
            cur = cur[1:]; out.append(cur)
        else: break
    return out

# ---- Ge'ez ----
def gez_words(text):
    return [w for w in re.split(r'[\s፡።፣፤፥፦፧፨\.,;:!?"\'()\[\]]+', text or '') if w and any(0x1200 <= ord(c) <= 0x137F for c in w)]

def gez_cons(ch):
    cp = ord(ch)
    if 0x1200 <= cp <= 0x135A:
        return chr(0x1200 + ((cp - 0x1200) // 8) * 8)   # first-order form = consonant
    return ch

GEZ_PREF = ['እም', 'ለ', 'በ', 'ከ', 'ዘ']
def gez_keys(w):
    """full form, de-prefixed form, consonant skeleton of the de-prefixed form"""
    d = w
    if len(d) > 2 and d[0] == 'ወ': d = d[1:]
    for p in GEZ_PREF:
        if len(d) > len(p) + 1 and d.startswith(p):
            d = d[len(p):]; break
    sk = ''.join(gez_cons(c) for c in d)
    return w, d, sk

def open_db(path):
    db = sqlite3.connect(f'file:{path}?immutable=1', uri=True)
    db.execute('pragma temp_store=memory')
    return db
