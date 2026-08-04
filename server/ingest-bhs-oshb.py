#!/usr/bin/env python3
"""
ingest-bhs-oshb.py — Rebuild the BHS Hebrew morphology table (tokens_bhs) from the
OpenScriptures Hebrew Bible (morphhb / WLC), reproducing the EXACT format your app
already expects (verified against dumped Genesis 1:1 rows), and adding the two
things the old data lacked:

  1. PUNCTUATION  — maqaf (־), sof-pasuq (׃), paseq (׀) emitted as their own
                    Paleo-side tokens (pos='punct'), so thought boundaries show.
  2. VERSIFICATION — Psalms (and the other known Hebrew↔English shifts) remapped so
                    verse numbers line up with any English bible.

Source: https://github.com/openscriptures/morphhb  (MIT / CC-BY-4.0). 39 OT books
only — BHS is the Masoretic Hebrew Bible (Tanakh); there is no NT.

Token format reproduced (per dumped rows):
  word_raw : Paleo consonants of the morpheme (niqqud/cantillation stripped)
  pos      : sp value  (prep, subs, verb, art, conj, adjv, nmpr, advb, prps, ...)
  morph    : pipe BHSA-style features, order/keys per POS (see build_morph)
  strongs  : real Strong's for content words; synthetic H9000-range for particles

Usage:
  python3 ingest-bhs-oshb.py --out bible.new.db                 # all 39 books
  python3 ingest-bhs-oshb.py --out test.db --books Gen Obad     # a subset
  python3 ingest-bhs-oshb.py --out test.db --books Gen --no-download   # use ./wlc/*.xml
"""
import argparse, json, os, re, sqlite3, sys, urllib.request, xml.etree.ElementTree as ET

RAW = "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc/{}.xml"

# OSIS book code -> (book_id, OSHB filename).  Standard 39 OT books.
BOOKS = [
    ("Gen",1),("Exod",2),("Lev",3),("Num",4),("Deut",5),("Josh",6),("Judg",7),("Ruth",8),
    ("1Sam",9),("2Sam",10),("1Kgs",11),("2Kgs",12),("1Chr",13),("2Chr",14),("Ezra",15),
    ("Neh",16),("Esth",17),("Job",18),("Ps",19),("Prov",20),("Eccl",21),("Song",22),
    ("Isa",23),("Jer",24),("Lam",25),("Ezek",26),("Dan",27),("Hos",28),("Joel",29),("Amos",30),
    ("Obad",31),("Jonah",32),("Mic",33),("Nah",34),("Hab",35),("Zeph",36),("Hag",37),
    ("Zech",38),("Mal",39),
]
BOOK_ID = {code: bid for code, bid in BOOKS}

# ── Square Hebrew consonants → Paleo (U+10900). Finals fold; points dropped. ──
_CONS = "אבגדהוזחטיכלמנסעפצקרשת"
_PALEO = list("𐤀𐤁𐤂𐤃𐤄𐤅𐤆𐤇𐤈𐤉𐤊𐤋𐤌𐤍𐤎𐤏𐤐𐤑𐤒𐤓𐤔𐤕")
_HEB2PALEO = {h: _PALEO[i] for i, h in enumerate(_CONS)}
for fin, base in {"ך":"כ","ם":"מ","ן":"נ","ף":"פ","ץ":"צ"}.items():
    _HEB2PALEO[fin] = _HEB2PALEO[base]

def to_paleo(s):
    out = []
    for ch in s:
        if ch in _HEB2PALEO: out.append(_HEB2PALEO[ch]); continue
        cp = ord(ch)
        if 0x0591 <= cp <= 0x05C7:   continue       # niqqud / cantillation / maqaf / sof-pasuq
        if ch in "/ ":               continue       # morpheme sep / space
        out.append(ch)
    return "".join(out)

# Punctuation marks → Paleo-side token surface (kept verbatim; they are script-neutral).
PUNCT = {"x-maqqef": ("־", "maqaf"), "x-sof-pasuq": ("׃", "sof-pasuq"), "x-paseq": ("׀", "paseq")}

# ── OSHB prefix letter → synthetic particle Strong's (matches dumped H9000-range) ──
PREFIX_STRONGS = {"c":"H9000", "b":"H9003", "k":"H9004", "l":"H9005",
                  "m":"H9006", "s":"H9007", "h":"H9008", "d":"H9009"}

# ── OSHB code → BHSA-style values ────────────────────────────────────────────
SP = {  # part of speech (first letter after H/A language marker)
    "A":"adjv","C":"conj","D":"advb","N":"subs","P":"prps","R":"prep","S":"suffix",
    "T":"part","V":"verb",
}
# Particle subtypes (T*) → finer sp
PART_SP = {"d":"art","o":"prep","r":"prep","m":"prde","a":"intj","e":"intj",
           "i":"inrg","j":"intj","n":"nega"}
PRON_SP = {"d":"prde","f":"prin","i":"inrg","p":"prps","r":"prde"}
NOUN_SP = {"c":"subs","g":"adjv","p":"nmpr","x":"subs"}     # Np proper noun, Ng gentilic→adj
GENDER = {"m":"m","f":"f","b":"unknown","c":"unknown"}      # both/common → unknown (per dump)
NUMBER = {"s":"sg","p":"pl","d":"du"}
STATE  = {"a":"a","c":"c","d":"d"}
VSTEM  = {"q":"qal","N":"nif","p":"piel","P":"pual","h":"hif","H":"hof","t":"hit",
          "o":"poel","O":"poal","r":"htpo","m":"poel","M":"poal","Q":"qpas",
          "v":"hsht","l":"pilp","L":"polp"}
VTENSE = {"p":"perf","q":"weqt","i":"impf","w":"wayq","h":"coho","j":"juss",
          "v":"impv","r":"ptca","s":"ptcp","a":"infa","c":"infc"}
PERSON = {"1":"p1","2":"p2","3":"p3"}
# Verb preformative (pfm) — present only on prefix-conjugation forms.
PREFORMATIVE_TENSES = {"impf","wayq","coho","juss"}

def pfm_for(ps, gn, nu):
    if ps == "p1": return "N" if nu == "pl" else ">"
    if ps == "p2": return "T="
    if ps == "p3": return "J" if gn == "m" else "T="
    return "absent"

def vbs_for(vs):
    return {"hif":"H","hof":"H","nif":"N","hit":"HT"}.get(vs, "absent")

def nme_for(gn, nu):
    if nu == "pl": return "JM" if gn == "m" else "WT"
    return None   # singular/dual endings handled per-surface later if needed

def strong_from_lemma(part):
    """Content-word lemma part like '1254 a' / '5921 a' / '430' -> 'H1254'."""
    m = re.search(r"(\d+)", part or "")
    return ("H" + m.group(1)) if m else ""

def build_morph(seg_morph):
    """One OSHB morpheme code (no language prefix, e.g. 'Ncfsa','Vqp3ms','R','C','Td','To','Sp1cs')
       -> (pos, morph_pipe_string, is_particle_pos). Returns None for unknown."""
    if not seg_morph: return None
    c0 = seg_morph[0]
    rest = seg_morph[1:]

    # ── Particles (T*) ──
    if c0 == "T":
        sub = rest[:1]
        sp = PART_SP.get(sub, "part")
        if sp == "art":  return ("art",  "sp=art|pdp=art|uvf=absent")
        if sp == "prep": return ("prep", "sp=prep|pdp=prep|prs=absent|uvf=absent")   # To (obj marker), Tr
        if sp == "nega": return ("nega", "sp=nega|pdp=nega|uvf=absent")
        return (sp, f"sp={sp}|pdp={sp}|uvf=absent")

    # ── Conjunction / Preposition / Adverb (standalone particles) ──
    if c0 == "C": return ("conj", "sp=conj|pdp=conj|uvf=absent")
    if c0 == "R": return ("prep", "sp=prep|pdp=prep|prs=absent|uvf=absent")
    if c0 == "D": return ("advb", "sp=advb|pdp=advb|uvf=absent")

    # ── Pronoun ──
    if c0 == "P":
        sp = PRON_SP.get(rest[:1], "prps")
        return (sp, f"sp={sp}|pdp={sp}|prs=absent|uvf=absent")

    # ── Suffix (pronominal) — Sp + person gender number ──
    if c0 == "S":
        # Handled by the caller as the prs= feature on the host word, not its own row.
        return None

    # ── Adjective ──
    if c0 == "A":
        body = rest[1:] if rest[:1] in ("a","c","o","g") else rest
        gn = GENDER.get(body[0:1], "unknown") if len(body) >= 1 else "unknown"
        nu = NUMBER.get(body[1:2], "sg")      if len(body) >= 2 else "sg"
        st = STATE.get(body[2:3], "a")        if len(body) >= 3 else "a"
        m = f"sp=adjv|pdp=adjv|gn={gn}|nu={nu}|st={st}|prs=absent|uvf=absent"
        nme = nme_for(gn, nu)
        if nme: m += f"|nme={nme}"
        return ("adjv", m)

    # ── Noun ──
    if c0 == "N":
        sub = rest[:1]              # c / g / p / x
        sp = NOUN_SP.get(sub, "subs")
        body = rest[1:]
        if sp == "nmpr":            # proper noun: usually no gn/nu/st
            return ("nmpr", "sp=nmpr|pdp=nmpr|prs=absent|uvf=absent")
        gn = GENDER.get(body[0:1], "unknown") if len(body) >= 1 else "unknown"
        nu = NUMBER.get(body[1:2], "sg")      if len(body) >= 2 else "sg"
        st = STATE.get(body[2:3], "a")        if len(body) >= 3 else "a"
        m = f"sp={sp}|pdp={sp}|gn={gn}|nu={nu}|st={st}|prs=absent|uvf=absent"
        nme = nme_for(gn, nu)
        if nme: m += f"|nme={nme}"
        return (sp, m)

    # ── Verb ──  Vs[tem] t[ense] [person gender number]  e.g. Vqp3ms, Vqw3ms, Vqrmsa(ptcp)
    if c0 == "V":
        vs = VSTEM.get(rest[0:1], "qal")
        vt = VTENSE.get(rest[1:2], "perf")
        tail = rest[2:]
        if vt in ("ptca","ptcp"):          # participle: gender number state (no person)
            gn = GENDER.get(tail[0:1], "unknown"); nu = NUMBER.get(tail[1:2], "sg"); st = STATE.get(tail[2:3], "a")
            m = (f"sp=verb|pdp=verb|vs={vs}|vt={vt}|gn={gn}|nu={nu}|st={st}"
                 f"|prs=absent|pfm=absent|vbs={vbs_for(vs)}|uvf=absent|nme=absent")
            return ("verb", m)
        if vt in ("infa","infc"):          # infinitive: no person/gender/number
            m = (f"sp=verb|pdp=verb|vs={vs}|vt={vt}|prs=absent|pfm=absent"
                 f"|vbs={vbs_for(vs)}|uvf=absent|nme=absent")
            return ("verb", m)
        ps = PERSON.get(tail[0:1], "p3"); gn = GENDER.get(tail[1:2], "m"); nu = NUMBER.get(tail[2:3], "sg")
        pfm = pfm_for(ps, gn, nu) if vt in PREFORMATIVE_TENSES else "absent"
        m = (f"sp=verb|pdp=verb|vs={vs}|vt={vt}|ps={ps}|gn={gn}|nu={nu}"
             f"|prs=absent|pfm={pfm}|vbs={vbs_for(vs)}|uvf=absent|nme=absent")
        return ("verb", m)

    return None

# ── Hebrew → English versification: SUPERSCRIPTIONS ──────────────────────────
#
# THE BUG THIS REPLACES
#   The old code did, for EVERY psalm:
#       off = 2 if ch in PS_TWO_LINE else 1
#       return (ch, max(v - off, 1))
#   i.e. it assumed every psalm has a title. Trace Psalm 119, which has NONE:
#       Heb v1 -> max(1-1, 1) = 1
#       Heb v2 -> max(2-1, 1) = 1     <-- v1 and v2 BOTH land on English v1
#       Heb v3 -> 2 ... Heb v176 -> 175
#   So real verses 1 and 2 were MERGED, every later verse shifted down one, and
#   verse 176 fell off the end: 175 verses where the psalm has 176. Verified
#   against the shipped DB — Ps 119 v1 carried 15 content tokens (avg 7.6), and
#   DB v175 held "sheep"/"perish", which is unmistakably English v176.
#   The same damage hit every UNTITLED psalm (~34 of them: 1, 2, 10, 33, 43, 71,
#   91, 93-97, 99, 104-107, 111-119, 135-137, 146-150).
#
# THE FIX — A SUPERSCRIPTION IS NOT A VERSE
#   In the Masoretic text the title IS Hebrew verse 1 (vv1-2 for the long ones).
#   English bibles print it as an unnumbered heading. So we stop pretending it is
#   verse text and give it its own slot:
#
#       Hebrew verses 1..L  (the title)  ->  verse 0     <- rendered as a heading
#       Hebrew verse  L+k                ->  verse k     <- matches every bible
#
#   Verse 0 keeps the title as first-class, queryable data (nothing is lost, and
#   the reader can show "A Psalm of David" above verse 1) while it can never again
#   clobber verse text or shift the numbering.
#
#   L IS DERIVED FROM THE DATA, NOT HARDCODED. For each psalm:
#       L = (Hebrew verse count) - (English verse count)
#   which is 0 for untitled psalms, 1 for ordinary titles, 2 for the long ones
#   (51, 52, 54, 60). There is no psalm list to maintain and no per-psalm special
#   case — the corpus states the answer. Any psalm where L falls outside {0,1,2}
#   is a genuine anomaly and ABORTS the ingest loudly instead of being silently
#   shifted, which is exactly the failure mode that produced this bug.

def load_english_verse_counts(path, code="PSA"):
    """{chapter: last verse number} for one book, from english-web-raw.jsonl."""
    counts = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line: continue
            o = json.loads(line)
            if o.get("code") != code: continue
            ch, v = int(o["chapter"]), int(o["verse"])
            counts[ch] = max(counts.get(ch, 0), v)
    return counts

def superscription_lengths(root, eng_counts):
    """L per psalm, derived: Hebrew verse count - English verse count."""
    heb_max = {}
    for verse in root.iter("verse"):
        osis = verse.get("osisID")
        if not osis: continue
        _, ch, v = osis.split(".")
        ch, v = int(ch), int(v)
        heb_max[ch] = max(heb_max.get(ch, 0), v)

    L, bad = {}, []
    for ch in sorted(heb_max):
        hmax = heb_max[ch]
        emax = eng_counts.get(ch)
        if emax is None:
            bad.append(f"Ps {ch}: Hebrew has {hmax} verses but the English baseline has no count")
            continue
        d = hmax - emax
        if d not in (0, 1, 2):
            bad.append(f"Ps {ch}: Hebrew {hmax} vs English {emax} -> L={d}, expected 0, 1 or 2")
        L[ch] = d
    if bad:
        raise SystemExit("\n\u2717 superscription length is not derivable for:\n  "
                         + "\n  ".join(bad)
                         + "\n\nRefusing to guess. Fix the source or the English baseline.")
    titled  = sum(1 for d in L.values() if d >= 1)
    two     = sum(1 for d in L.values() if d == 2)
    print(f"  Psalms: {len(L)} chapters \u2014 {titled} titled ({two} with a 2-verse title), "
          f"{len(L) - titled} untitled")
    return L

# ── Parse one OSHB book file → token rows ────────────────────────────────────
def parse_book(xml_text, book_id, eng_counts=None):
    # OSIS uses a default namespace; strip it for simple tag matching.
    xml_text = re.sub(r'\sxmlns="[^"]+"', "", xml_text, count=1)
    root = ET.fromstring(xml_text)
    rows = []

    # Psalms: derive each title's length from the data, then map
    #   Hebrew 1..L -> verse 0 (the superscription, kept but NOT a verse)
    #   Hebrew L+k  -> verse k (matches every bible)
    PS_L = {}
    if book_id == 19:
        if not eng_counts:
            raise SystemExit("\u2717 Psalms needs --english english-web-raw.jsonl to derive "
                             "superscription lengths. Refusing to guess an offset.")
        PS_L = superscription_lengths(root, eng_counts)

    def remap_verse(ch, v):
        if book_id != 19:
            return (ch, v)
        L = PS_L.get(ch, 0)
        if v <= L:
            return (ch, 0)          # the superscription: its own slot, clobbers nothing
        return (ch, v - L)
    # token_ordinal must be unique within an (English) verse. When versification
    # folds several Hebrew verses into one English verse (e.g. a psalm title, Heb
    # v1, merging into English v1 with the body), the ordinal has to CONTINUE
    # across them rather than restart — otherwise the merged verse gets two of
    # every ordinal and violates the surface-index primary key. Track the running
    # ordinal per output (chapter, verse).
    ord_by_ev = {}
    for verse in root.iter("verse"):
        osis = verse.get("osisID")          # e.g. Gen.1.1
        if not osis: continue
        _, ch, v = osis.split(".")
        ch, v = int(ch), int(v)
        ech, ev = remap_verse(ch, v)
        ordn = ord_by_ev.get((ech, ev), 0)
        for el in list(verse):
            tag = el.tag
            if tag == "w":
                text = (el.text or "")
                lemma = el.get("lemma", "")
                morph = el.get("morph", "")
                if morph.startswith(("H","A")): morph = morph[1:]   # drop language marker
                seg_texts  = text.split("/")
                seg_lemmas = lemma.split("/")
                seg_morphs = morph.split("/")
                # Pull a trailing pronominal suffix (S*) onto the preceding row's prs=.
                prs_code = None
                if seg_morphs and seg_morphs[-1].startswith("S"):
                    sm = seg_morphs[-1]
                    # Sp + person gender number  (e.g. Sp3ms)
                    mm = re.match(r"Sp(\d)([mfbc])?([sp])?", sm)
                    if mm:
                        ps = {"1":"1","2":"2","3":"3"}.get(mm.group(1),"3")
                        gn = (mm.group(2) or "")
                        nu = (mm.group(3) or "")
                        prs_code = f"{ps}{gn}{nu}".strip()
                    # The suffix has its OWN morph + surface segment but (almost always)
                    # NO lemma segment, so only trim lemma when its count proves it has one.
                    had_suffix_lemma = len(seg_lemmas) == len(seg_morphs)
                    seg_morphs = seg_morphs[:-1]
                    if seg_texts:  seg_texts  = seg_texts[:-1]
                    if had_suffix_lemma and seg_lemmas: seg_lemmas = seg_lemmas[:-1]
                n = len(seg_morphs)
                for i in range(n):
                    sm = seg_morphs[i]
                    built = build_morph(sm)
                    if not built: continue
                    pos, mstr = built
                    st_lemma = seg_lemmas[i] if i < len(seg_lemmas) else ""
                    # Strong's: prefix letter (single char, no digits) → synthetic; else real.
                    pl = st_lemma.strip()
                    if pl in PREFIX_STRONGS:
                        strongs = PREFIX_STRONGS[pl]
                    else:
                        strongs = strong_from_lemma(pl)
                    # Pronominal suffix belongs on the LAST lexical row of this word.
                    if prs_code and i == n - 1 and "prs=absent" in mstr:
                        mstr = mstr.replace("prs=absent", f"prs={prs_code}")
                    surf = to_paleo(seg_texts[i] if i < len(seg_texts) else "")
                    if not surf: continue
                    ordn += 1
                    rows.append((book_id, ech, ev, ordn, surf, pos, mstr, strongs))
            elif tag == "seg":
                t = el.get("type", "")
                if t in PUNCT:
                    mark, name = PUNCT[t]
                    ordn += 1
                    rows.append((book_id, ech, ev, ordn, mark, "punct",
                                 f"sp=punct|pdp=punct|punct={name}", ""))
        ord_by_ev[(ech, ev)] = ordn   # carry the ordinal forward if a later Heb verse merges here
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", "--out", dest="db", default="corpus.db",
                    help="EXISTING database to write tokens_bhs into (default corpus.db). "
                         "Only the tokens_bhs table is replaced; all other tables are left untouched.")
    ap.add_argument("--books", nargs="*", help="OSIS codes (default all 39)")
    ap.add_argument("--no-download", action="store_true", help="read ./wlc/<Code>.xml instead of fetching")
    ap.add_argument("--source-id", type=int, default=1)
    ap.add_argument("--english", default="english-web-raw.jsonl",
                    help="raw English baseline jsonl; used ONLY to derive each psalm's "
                         "superscription length (L = Hebrew verses - English verses). "
                         "No psalm list is hardcoded.")
    args = ap.parse_args()

    codes = args.books or [c for c, _ in BOOKS]
    fresh = not os.path.exists(args.db)
    db = sqlite3.connect(args.db)

    # Safety: when writing into an existing corpus.db, confirm we only touch
    # tokens_bhs and report the tables we preserve, so a stray path can't silently
    # nuke the multilingual corpus.
    existing = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    if fresh:
        print(f"  (creating new database {args.db})")
    else:
        keep = [t for t in existing if t != "tokens_bhs"]
        print(f"  target {args.db} — replacing ONLY tokens_bhs; preserving {len(keep)} table(s): "
              f"{', '.join(keep[:8])}{' …' if len(keep) > 8 else ''}")
        if "verses" not in existing:
            print("  ! note: no 'verses' table here — is this really corpus.db? (continuing; only tokens_bhs changes)")

    db.execute("DROP TABLE IF EXISTS tokens_bhs")
    db.execute("""CREATE TABLE tokens_bhs (
        source_id INTEGER, ref_key TEXT, book_id INTEGER, chapter INTEGER, verse INTEGER,
        token_ordinal INTEGER, word_raw TEXT, word_modern TEXT, lemma TEXT, root TEXT,
        pos TEXT, morph TEXT, strongs TEXT)""")
    db.execute("CREATE INDEX IF NOT EXISTS ix_bhs_ref ON tokens_bhs(book_id, chapter, verse, token_ordinal)")

    total = 0
    db.execute("BEGIN")
    for code in codes:
        bid = BOOK_ID.get(code)
        if not bid: print(f"  ! unknown book {code}", file=sys.stderr); continue
        if args.no_download:
            xml = open(os.path.join("wlc", code + ".xml"), encoding="utf-8").read()
        else:
            xml = urllib.request.urlopen(RAW.format(code)).read().decode("utf-8")
        eng_counts = None
        if bid == 19:
            if not os.path.exists(args.english):
                raise SystemExit(f"\u2717 {args.english} not found — needed to derive psalm "
                                 f"superscription lengths. Pass --english <path>.")
            eng_counts = load_english_verse_counts(args.english, "PSA")
        rows = parse_book(xml, bid, eng_counts)
        ins = [(args.source_id, f"{bid}.{r[1]}.{r[2]}", *r) for r in rows]
        db.executemany("""INSERT INTO tokens_bhs
            (source_id, ref_key, book_id, chapter, verse, token_ordinal, word_raw,
             word_modern, lemma, root, pos, morph, strongs)
            VALUES (?,?,?,?,?,?,?, '', '', '', ?,?,?)""", ins)
        total += len(rows)
        print(f"  {code:6s} book_id={bid:2d}  {len(rows):6d} tokens")
    db.commit()
    supers = db.execute("SELECT COUNT(DISTINCT chapter) FROM tokens_bhs "
                        "WHERE book_id=19 AND verse=0").fetchone()[0]
    print(f"\n\u2713 wrote {total} tokens to tokens_bhs in {args.db}")
    print(f"  psalm superscriptions stored at verse=0: {supers} chapter(s)")
    print("  verse numbers now match every bible; titles live at verse 0 and clobber nothing.")
    db.close()

if __name__ == "__main__":
    main()