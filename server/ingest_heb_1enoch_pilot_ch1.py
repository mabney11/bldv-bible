#!/usr/bin/env python3
"""
Pilot: 1 Enoch chapter 1 (9 verses) into Hebrew, corpus-grounded original
translation. Same provenance convention as Antiquities books 9-20
(ingest_josephus_antiquities.py): conf='ai-generated-corpus-terminology',
src='paleo-studio:ai-original-translation'.

Vocabulary grounded against this corpus's own attested Hebrew: standard
biblical terms already used throughout the OT (tzadiq/righteous, dor/
generation, malakhim/angels, shamayim/aratz, etc, matching this app's own
established English-gloss renderings for this book -- e.g. ENG ch1 already
glosses "dabar (words)", "tzadayaq (righteous)", "shamayam (heavens)"),
PLUS direct echoes of the specific biblical passages 1 Enoch 1 itself is
alluding to: Num 23:7 "va-yisa mesholo" (took up his parable -- Balaam's
oracle formula), Deut 33:2 "me-rivvot qodesh" (came with ten thousands of
holy ones -- the exact verse Jude 1:14-15 says 1 Enoch 1:9 is quoting),
Deut 10:14 "shemei ha-shamayim" (heaven of heavens), Micah 1:3-4 (mountains
melt like wax before the fire -- the direct source of 1 Enoch 1:6-7's
imagery), Jer 30:7 ("et tzarah" -- day of tribulation), and Daniel 4's
Aramaic "'irin" (Watchers, Strong's H5894, corpus-attested exactly as
this concept's word already in this app's own OT text).

Run once. Chapter 1 only -- this is the pilot fieldy asked to review before
the rest of 1 Enoch / the other 156 missing-language book gaps proceed.
"""
import sqlite3, time, unicodedata

DB = "corpus.db"

SQUARE = list("אבגדהוזחטיכלמנסעפצקרשת")
PALEO_LETTERS = ['𐤀', '𐤁', '𐤂', '𐤃', '𐤄', '𐤅', '𐤆', '𐤇', '𐤈', '𐤉', '𐤊',
                 '𐤋', '𐤌', '𐤍', '𐤎', '𐤏', '𐤐', '𐤑', '𐤒', '𐤓', '𐤔', '𐤕']
FINALS = {'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ'}
SQ_TO_PALEO_MAP = {s: p for s, p in zip(SQUARE, PALEO_LETTERS)}

def sq_to_paleo(t):
    if not t:
        return t
    out = []
    for ch in unicodedata.normalize("NFC", t):
        cp = ord(ch)
        if 0x0591 <= cp <= 0x05C7:
            continue
        base = FINALS.get(ch, ch)
        out.append(SQ_TO_PALEO_MAP.get(base, ch))
    return "".join(out)

VERSES = {
 1: "דברי ברכת חנוך אשר ברך בהם את הבחירים והצדיקים אשר יהיו חיים ביום הצרה בעת אשר יסורו כל הרשעים וחסרי אלהים",
 2: "וישא משלו ויאמר חנוך איש צדיק אשר פקח אלהים את עיניו וירא מראה קדוש בשמים אשר הראוני המלאכים ומהם שמעתי הכל ומהם הבינותי כאשר ראיתי ולא לדור הזה כי אם לדור רחוק אשר יבוא",
 3: "ואודות הבחירים אמרתי ואשא משלי עליהם הקדוש הגדול יצא ממעונו",
 4: "ודרך אלהי עולם על הארץ על הר סיני ונראה ממחנהו ונראה בעז גבורתו משמי השמים",
 5: "וכל יחתו מיראה והעירין ירעדו ופחד גדול ורעדה יאחזם עד קצות הארץ",
 6: "וההרים הרמים יתמוגגו והגבעות הרמות תשפלנה ונמסו כדונג מפני האש",
 7: "והארץ תבקע בקעה שלמה וכל אשר על הארץ יאבד והיה משפט על הכל",
 8: "ואת הצדיקים יעשה להם שלום וישמר את הבחירים ורחמים יהיו עליהם וכלם יהיו לאלהים ויצליחו וכלם יהיו ברוכים ויעזר לכלם ואור יראה להם ויעשה עמם שלום",
 9: "והנה בא ברבבות קדושיו לעשות משפט על כל ולהאביד את כל הרשעים ולהוכיח כל בשר על כל מעשי רשעם אשר עשו ברשע ועל כל הקשות אשר דברו עליו החטאים הרשעים",
}

def connect_with_retry(path, attempts=6, base_delay=0.5):
    last_err = None
    for i in range(attempts):
        try:
            return sqlite3.connect(path, timeout=15)
        except sqlite3.OperationalError as e:
            last_err = e
            time.sleep(base_delay * (i + 1))
    raise last_err

conn = connect_with_retry(DB)
conn.execute("PRAGMA locking_mode=EXCLUSIVE")
cur = conn.cursor()

cur.execute("SELECT MAX(book_id) FROM verses")
book_id = (cur.fetchone()[0] or 0) + 1

cur.execute("SELECT COUNT(*) FROM verses WHERE canon_id=67 AND corpus='HEB'")
existing = cur.fetchone()[0]
if existing:
    print(f"ABORT: canon_id=67 corpus=HEB already has {existing} rows -- not overwriting.")
    raise SystemExit(1)

rows = []
for v, text in VERSES.items():
    tp = sq_to_paleo(text)
    assert tp, f"empty text_paleo for verse {v}"
    rows.append((None, f"67.1.{v}", book_id, "HEB", "1EN", "1", str(v), 1, v,
                 text, "pseudepigrapha", "paleo-studio:ai-original-translation",
                 "ai-generated-corpus-terminology", 67, tp, None))

cur.executemany(
    "INSERT INTO verses (id, ref_key, book_id, corpus, code, chapter, verse, ord_c, ord_v, "
    "text, category, src, conf, canon_id, text_paleo, text_src) "
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
conn.commit()

cur.execute("SELECT chapter, verse, ord_c, ord_v, length(text), length(text_paleo) FROM verses WHERE canon_id=67 AND corpus='HEB' ORDER BY ord_v")
print("Inserted rows (chapter, verse, ord_c, ord_v, text_len, text_paleo_len):")
for r in cur.fetchall():
    print(" ", r)
print("book_id used:", book_id)
conn.close()
