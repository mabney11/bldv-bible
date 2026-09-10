#!/usr/bin/env python3
"""
Words of Azariah (canon_id 148 — the Prayer of Azariah and the Song of the
Three, Greek Daniel 3:24–90) into Hebrew: corpus-grounded original
translation, same method and provenance as the 1 Enoch pilot
(ingest_heb_1enoch_pilot_ch1.py) and Antiquities 9–20:
conf='ai-generated-corpus-terminology', src='paleo-studio:ai-original-translation'.

This is the book Susanna (79, HEB code SUS) and Bel (80) are the siblings of:
the additions to Daniel live as their own books beside Daniel, so Daniel 3
keeps its Hebrew numbering (1–33) while the reader still has the prayer and
the song in Hebrew and English. The passage pages (/passage/prayer-of-azariah,
/passage/the-fiery-furnace) stitch them back into Daniel 3 where the Greek,
Latin, Syriac and Ge'ez Daniel keep them.

Grounding — every phrase is either the biblical Hebrew the Greek is itself
echoing, or vocabulary attested in this corpus's OT:
  v3   ברוך אתה יהוה אלהי אבתינו   1 Chr 29:10
  v4   צדיק אתה … וכל משפטיך אמת    Ps 119:137, Ps 19:10
  v6   חטאנו ועוינו                 Dan 9:5 (the prayer this one is modelled on)
  v7   למען ייטב לנו                Deut 5:33 / Jer 7:23
  v10  לחרפה ולבוז                  Ps 31:12 / Ezek 5:14–15
  v11  למען שמך … בריתך             Ps 106:8, Jer 14:21 (אל תפר בריתך)
  v12  אברהם אהבך                   Isa 41:8 / 2 Chr 20:7
  v13  ככוכבי השמים וכחול אשר על שפת הים   Gen 22:17
  v16  לב נשבר … רוח                Ps 51:19, Isa 57:15
  v17  אילים ופרים … רבבות          Micah 6:7; לא יבשו החסים בך  Ps 25:3, 34:23
  v19  כחסדך וכרב רחמיך             Ps 51:3
  v22  אתה יהוה האלהים לבדך         Deut 4:35, 2 Kgs 19:19
  v23  זפת / נערת / זמורות          Ex 2:3, Judg 16:9, Ezek 15:2
  v26  מלאך יהוה ירד                Judg 6; Dan 3:28's "his angel"
  v32  הישב על הכרובים              Ps 80:2, 99:1
  v35–65 refrain                     Ps 148 (the catalogue this song follows);
       הללוהו ורוממוהו              Ps 148:1–4, Ps 99:5
  v57  תנינים … רמש המים            Gen 1:21
  v67  הודו ליהוה כי טוב כי לעולם חסדו   Ps 136:1
  v68  אלהי האלהים                  Deut 10:17, Ps 136:2

Also, two English errata carried in from the KJV Apocrypha text:
  v46 "0 you dews" (a zero for an O) → "O you dews";
  v55 "O you mountains" — a KJV misprint; the Greek (Theodotion 3:77) has
      αἱ πηγαί, the fountains → "O you maiyan (fountains)" (the app's own
      rendering of מעין, e.g. Gen 7:11).
And AZAR's canon_id/ord_c/ord_v were never assigned (assign-canon-ids.py
lists it as 148 but hadn't been run since it was ingested): set them here so
the book shows in the reader and reseed-translations.mjs picks it up.

Re-runnable: HEB rows are skipped if canon 148 already has HEB text.
  python ingest_heb_azariah.py          # apply
  python ingest_heb_azariah.py --dry    # show only
"""
import sqlite3, time, unicodedata, sys

DB = "corpus.db"
DRY = "--dry" in sys.argv
CANON = 148

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

R1 = "ומהלל ומרומם על כל לעולם"       # praised and exalted above all for ever (29–34)
R1b = "ומהלל ומפאר על כל לעולם"       # praised and glorified above all for ever
R2 = "הללוהו ורוממוהו על כל לעולם"    # praise and exalt him above all for ever (35–66)
def B(subject):                        # "O <subject>, bless ye the Lord: praise and exalt him…"
    return f"ברכו את יהוה {subject} {R2}"

VERSES = {
 1: "ויתהלכו בתוך האש מהללים את האלהים ומברכים את יהוה",
 2: "ויעמד עזריה ויתפלל ככה ויפתח את פיו בתוך האש ויאמר",
 3: "ברוך אתה יהוה אלהי אבתינו ומהלל ומפאר שמך לעולם ועד",
 4: "כי צדיק אתה על כל אשר עשית לנו וכל מעשיך אמת ודרכיך ישרים וכל משפטיך אמת",
 5: "ובכל אשר הבאת עלינו ועל עיר הקדש עיר אבתינו ירושלם משפט אמת עשית כי באמת ובמשפט הבאת את כל אלה עלינו על חטאתינו",
 6: "כי חטאנו ועוינו בסורנו מאחריך",
 7: "בכל פשענו ולא שמענו למצותיך ולא שמרנו אתם ולא עשינו כאשר צויתנו למען ייטב לנו",
 8: "לכן כל אשר הבאת עלינו וכל אשר עשית לנו במשפט אמת עשית",
 9: "ותתננו ביד איבים רשעים שנאים עזבי אלהים וביד מלך עול הרע מכל מלכי הארץ",
 10: "ועתה לא נוכל לפתח פה כי היינו לחרפה ולבוז לעבדיך וליראיך",
 11: "אך אל תתננו לכלה למען שמך ואל תפר את בריתך",
 12: "ואל תסר חסדך ממנו למען אברהם אהבך ולמען יצחק עבדך ולמען ישראל קדשך",
 13: "אשר דברת אליהם ונשבעת להרבות את זרעם ככוכבי השמים וכחול אשר על שפת הים",
 14: "כי אנחנו יהוה מעטנו מכל הגוים ושפלים אנחנו היום בכל הארץ על חטאתינו",
 15: "ואין בעת הזאת שר ונביא ומנהיג ואין עלה וזבח ומנחה וקטרת ואין מקום להקריב לפניך ולמצא רחמים",
 16: "אך בלב נשבר וברוח שפלה נרצה לפניך",
 17: "כעלת אילים ופרים וכרבבות כבשים שמנים כן יהי זבחנו לפניך היום ותן לנו ללכת אחריך בתמים כי לא יבשו כל החסים בך",
 18: "ועתה בכל לבנו אנחנו הלכים אחריך ויראים אתך ומבקשים את פניך",
 19: "אל תבישנו כי אם עשה עמנו כחסדך וכרב רחמיך",
 20: "והצילנו כנפלאותיך ותן כבוד לשמך יהוה ויבשו כל מרעי עבדיך",
 21: "ויכלמו בכל גבורתם וכחם ועזם ישבר",
 22: "וידעו כי אתה יהוה האלהים לבדך ונכבד על כל הארץ",
 23: "ועבדי המלך אשר השליכום לא חדלו מלהסיק את הכבשן בזפת ובנערת ובזמורות ובעצים",
 24: "ותצא הלהבה ממעל לכבשן תשע וארבעים אמה",
 25: "ותפרץ ותשרף את הכשדים אשר מצאה סביב לכבשן",
 26: "ומלאך יהוה ירד אל הכבשן עם עזריה ורעיו וינער את להבת האש מן הכבשן",
 27: "ויעש את תוך הכבשן כרוח טל מנשבת ולא נגעה בהם האש ולא הרעה להם ולא הבהילה אתם",
 28: "אז שלשתם כפה אחד הללו ופארו וברכו את האלהים בתוך הכבשן ויאמרו",
 29: f"ברוך אתה יהוה אלהי אבתינו {R1}",
 30: f"וברוך שם כבודך הקדוש {R1}",
 31: f"ברוך אתה בהיכל כבוד קדשך {R1b}",
 32: f"ברוך אתה הראה תהמות הישב על הכרובים {R1}",
 33: f"ברוך אתה על כסא כבוד מלכותך {R1b}",
 34: f"ברוך אתה ברקיע השמים {R1b}",
 35: B("כל מעשי יהוה"),
 36: B("השמים"),
 37: B("מלאכי יהוה"),
 38: B("כל המים אשר מעל השמים"),
 39: B("כל צבאות יהוה"),
 40: B("השמש והירח"),
 41: B("כוכבי השמים"),
 42: B("כל גשם וטל"),
 43: B("כל הרוחות"),
 44: B("אש וחם"),
 45: B("חרף וקיץ"),
 46: B("טל וסערת שלג"),
 47: B("לילות וימים"),
 48: B("אור וחשך"),
 49: B("קרח וקר"),
 50: B("כפור ושלג"),
 51: B("ברקים ועבים"),
 52: f"תברך הארץ את יהוה תהלל ותרומם אתו על כל לעולם",
 53: B("הרים וגבעות"),
 54: B("כל צמח האדמה"),
 55: B("המעינות"),
 56: B("ימים ונהרות"),
 57: B("תנינים וכל רמש המים"),
 58: B("כל עוף השמים"),
 59: B("כל חיה ובהמה"),
 60: B("בני אדם"),
 61: f"ברך את יהוה ישראל {R2}",
 62: B("כהני יהוה"),
 63: B("עבדי יהוה"),
 64: B("רוחות ונפשות הצדיקים"),
 65: B("קדושים ושפלי רוח"),
 66: f"ברכו את יהוה חנניה עזריה ומישאל {R2} כי הצילנו משאול והושיענו מיד המות והצילנו מתוך הכבשן ומלהבת האש הבערת ומתוך האש הצילנו",
 67: "הודו ליהוה כי טוב כי לעולם חסדו",
 68: "ברכו את אלהי האלהים כל יראי יהוה הללוהו והודו לו כי לעולם חסדו",
}
assert len(VERSES) == 68 and sorted(VERSES) == list(range(1, 69))

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

# 1. Promote the English: canon_id 148 + ordinals (what assign-canon-ids.py and
#    fix-apocrypha-ords.mjs would do for this one book).
cur.execute("SELECT COUNT(*) FROM verses WHERE corpus='ENG' AND code='AZAR'")
n_eng = cur.fetchone()[0]
print(f"ENG AZAR rows: {n_eng}")
if not DRY:
    cur.execute("UPDATE verses SET canon_id=?, ord_c=CAST(chapter AS INTEGER), ord_v=CAST(verse AS INTEGER) "
                "WHERE corpus='ENG' AND code='AZAR' AND (canon_id IS NULL OR ord_c IS NULL OR ord_v IS NULL)", (CANON,))
    print(f"  promoted {cur.rowcount} ENG rows to canon_id {CANON} with ordinals")
    # 2. The two English errata.
    for verse, old, new in [
        ("46", "0 you dews", "O you dews"),
        ("55", "O you harayam (mountains), barak", "O you maiyan (fountains), barak"),
    ]:
        cur.execute("UPDATE verses SET text=REPLACE(text, ?, ?) WHERE corpus='ENG' AND code='AZAR' AND verse=? AND text LIKE ?",
                    (old, new, verse, f"%{old}%"))
        print(f"  v{verse} text erratum fixed: {cur.rowcount}")
    cur.execute("UPDATE verses SET text_src=REPLACE(text_src, '0 you dews', 'O you dews') WHERE corpus='ENG' AND code='AZAR' AND verse='46'")
    cur.execute("UPDATE verses SET text_src=REPLACE(text_src, 'O you mountains, bless', 'O you fountains, bless') WHERE corpus='ENG' AND code='AZAR' AND verse='55'")

# 3. The Hebrew.
cur.execute("SELECT COUNT(*) FROM verses WHERE canon_id=? AND corpus='HEB'", (CANON,))
existing = cur.fetchone()[0]
if existing:
    print(f"HEB canon {CANON} already has {existing} rows -- not touching the Hebrew.")
else:
    cur.execute("SELECT MAX(book_id) FROM verses")
    book_id = (cur.fetchone()[0] or 0) + 1
    rows = []
    for v, text in VERSES.items():
        tp = sq_to_paleo(text)
        assert tp, f"empty text_paleo for verse {v}"
        rows.append((None, f"{CANON}.1.{v}", book_id, "HEB", "AZAR", "1", str(v), 1, v,
                     text, "deuterocanon", "paleo-studio:ai-original-translation",
                     "ai-generated-corpus-terminology", CANON, tp, None))
    if DRY:
        for r in rows[:3]: print("  would insert", r[1], r[9][:50], r[14][:30])
        print(f"  ({len(rows)} rows, book_id {book_id})")
    else:
        cur.executemany(
            "INSERT INTO verses (id, ref_key, book_id, corpus, code, chapter, verse, ord_c, ord_v, "
            "text, category, src, conf, canon_id, text_paleo, text_src) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
        cur.execute("INSERT INTO books (book_id, corpus, code, title, category, n_verses) VALUES (?,?,?,?,?,?)",
                    (book_id, "HEB", "AZAR", "Words of Azariah", "deuterocanon", len(rows)))
        print(f"  inserted {len(rows)} HEB rows (book_id {book_id}) + books row")

if not DRY:
    conn.commit()
    cur.execute("SELECT corpus, count(*), min(ord_v), max(ord_v), sum(canon_id=148) FROM verses WHERE code='AZAR' GROUP BY corpus")
    for r in cur.fetchall(): print("  ", r)
conn.close()
print("dry run — nothing written" if DRY else "done")
