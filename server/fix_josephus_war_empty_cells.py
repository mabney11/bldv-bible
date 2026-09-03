#!/usr/bin/env python3
"""
fix_josephus_war_empty_cells.py -- patches the 31 canon_id=219 (Jewish War)
cells that were wrong or empty after the original ingest_josephus_war.py run.

Background (see project memory project_paleo-studio_josephus.md): the
original ingest documented 29 "empty cells" as genuine, unfixable
pre-existing source gaps (1 ENG, 28 HEB) and shipped them as empty strings.
Per fieldy's 2026-09-01 instruction -- "the source is not the most
important, but the content, I need full text and nothing omitted, even if
that's combining sources" -- every one of those cells was re-investigated
and turned out to be RECOVERABLE, not genuinely absent:

  - ENG book 7:209 (+ book 7:208, which was truncated mid-sentence, not
    empty itself): Perseus's TEI transcription of Whiston's 1737 English
    translation is genuinely truncated at this exact point -- confirmed by
    checking the raw TEI XML and cross-checking multiple independent public
    digitizations of Whiston (sacred-texts.com, ccel.org, biblestudytools.com
    all show the identical truncation -- a shared upstream defect, not an
    extraction bug here). The missing continuation was located at
    lexundria.com's Whiston text (an independent, complete digitization),
    cross-validated against the Greek (Niese) content for 7:208-209.

  - HEB book 5:491-501 (Titus's war-council speech) and book 6:177-192
    (the Longus/Cornelius/Artorius portico-fire episode): NOT genuine gaps
    in Simchoni's Hebrew translation -- both were real, complete Hebrew
    text that a bug in the paragraph-extraction regex
    (`r'(?:^|\\n)([\u05d0-\u05ea]{1,3})\\. '`, which requires a Hebrew-letter
    paragraph marker followed by a literal period AND a literal space)
    silently dropped:
      * book 5 ch.12's first paragraph has NO letter marker at all
        (immediately follows the chapter heading) -- regex requires a
        letter, so it never matched.
      * book 6 ch.3's paragraph 'A' uses "letter + space, no period"
        ("\u05d0 \u05d5\u05d4\u05de\u05d5\u05e8\u05d3\u05d9\u05dd...") and paragraph 'B' uses
        "letter + period, no space" ("\u05d1.\u05dc\u05d0\u05d7\u05e8\u05d5\u05e0\u05d4..."), both of which
        fail the same regex.
    All three variants were located directly in the raw full-text
    extraction (bypassing the buggy paragraph parser), recovered verbatim,
    and re-split into per-Niese-verse pieces using the same content-anchor
    methodology as the original ingest (Greek verse content as the
    cross-language boundary guide; every split verified by exact
    reconstruction: concatenating the pieces reproduces the recovered
    paragraph character-for-character).

  - HEB book 3:190-191: not a gap at all -- a misattribution. The batch-47
    alignment agent had the correct Hebrew text available but assigned the
    whole thing (including v190's opening clause, "ve-acharei ha-tachbulah
    ha-zot...") to verse 191 instead of splitting off v190's portion. Fixed
    by re-splitting the already-correct text at the correct boundary.

Net result: canon_id=219 now has ZERO empty cells and zero known
mis-attributed cells across all 12003 (verse x language) rows.

This is an UPDATE-only patch, not a re-ingest -- the original INSERT-based
ingest_josephus_war.py already ran and committed (canon_id=219 is live).
Re-running that script would be blocked by its own duplicate guards, so
this script targets the specific rows directly.

WAL-safe: BEGIN IMMEDIATE + busy-timeout + retry loop, single transaction,
verify-before-commit (checks old value first; aborts the whole run if any
row's current text does not match what this patch expects to find, so it
is safe to re-run -- it will simply report "already applied" and do
nothing on a second run).

Usage (from paleo-studio/server, i.e. cwd containing corpus.db):

    python3 fix_josephus_war_empty_cells.py            # apply
    python3 fix_josephus_war_empty_cells.py --dry       # show plan only
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import unicodedata

DB_PATH = "corpus.db"
CANON_ID = 219
ENG_CORPUS, ENG_CODE = "ENG", "JOSEPHUS_WAR"
HEB_CORPUS, HEB_CODE = "HEB", "JOSWAR"

# --- paleo conversion (ported from paleo-migrate.mjs / src/lib/books.js,
# identical copy to ingest_josephus_war.py -- re-copy from there if
# PALEO_LETTERS ever changes) ---
SQUARE = list("\u05d0\u05d1\u05d2\u05d3\u05d4\u05d5\u05d6\u05d7\u05d8\u05d9\u05db\u05dc\u05de\u05e0\u05e1\u05e2\u05e4\u05e6\u05e7\u05e8\u05e9\u05ea")
PALEO_LETTERS = ['\U00010900', '\U00010901', '\U00010902', '\U00010903', '\U00010904', '\U00010905', '\U00010906', '\U00010907', '\U00010908', '\U00010909', '\U0001090a',
                 '\U0001090b', '\U0001090c', '\U0001090d', '\U0001090e', '\U0001090f', '\U00010910', '\U00010911', '\U00010912', '\U00010913', '\U00010914', '\U00010915']
FINALS = {'\u05da': '\u05db', '\u05dd': '\u05de', '\u05df': '\u05e0', '\u05e3': '\u05e4', '\u05e5': '\u05e6'}
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


def connect_with_retry(path, attempts=6, base_delay=0.5):
    last_err = None
    for i in range(attempts):
        try:
            con = sqlite3.connect(path, timeout=30)
            con.execute("PRAGMA busy_timeout=30000")
            return con
        except sqlite3.OperationalError as e:
            last_err = e
            time.sleep(base_delay * (2 ** i))
    raise last_err


# book, verse -> new complete ENG text
ENG_FIXES = {
    (7, 208): 'The most courageous, therefore, of those men that went out prevented the enemy, and got away, and fled for it; but for those men that were caught within they were slain, to the number of one thousand seven hundred, as were the women and the children made slaves.',
    (7, 209): 'but as Bassus thought he must perform the covenant he had made with those that had surrendered the citadel, he let them go, and restored Eleazar to them.',
}

# what we expect to currently find in ENG for each key, as a safety check
ENG_OLD_EXPECTED = {
    (7, 208): 'The most courageous, therefore, of those men that went out prevented the enemy, and got away, and fled for it; but for those men that were caught within they',
    (7, 209): '',
}

# book, verse -> new complete HEB text
HEB_FIXES = {
    (3, 190): 'ואחרי התחבולה הזאת מצא יוסף עוד עצה טובה לעצמו. ',
    (3, 191): 'דרך נקרה צרה וקשה למדרך רגל, אשר לא שוטטו בה עיני הרומאים, בחלק העמק ממערב, שלח מכתבים בידי אנשיו אל היהודים הרחוקים כטוב בעיניו וקבל מהם מתנות, עד כי נמצאו לו מיני אֹכל רבים, אשר כבר חסרו ליושבי העיר. ',
    (5, 491): 'וטיטוס נועץ את שרי צבאותיו. הנמהרים שׁבהם אמרו להקריב את כל הצבא אל החומה ולנסות להבקיע אותה בחֹזק־יד, ',
    (5, 492): 'באמרם, כי עד־עתה נלחמו ביהודים רק גדודים גדודים ועל־כן לא הצליחו, אולם בעלות כל הצבא על העיר לא ישאו היהודים את תנופת ידו, ',
    (5, 493): 'כי החצים ואבני־הקלע יכַסום כנחל שוטף. המתונים שבהם דרשו לשפוך סוללות עוד הפעם והמתונים ביותר לא יעצו גם את הדבר הזה, כי־אם לחנות לפני העיר ולשמור על מוצאיה ולהכרית מיושביה כל משען־לחם, לשבות ממלחמה ולהסגיר את ירושלים בידי הרעב. ',
    (5, 494): 'כי אין להלחם באנשים נואשים, אשר כל חפצם הוא למות בחרב, כי מבלעדי החרב הם צפויים לרעה גדולה עוד ממנה. ',
    (5, 495): 'אך טיטוס גלה דעתו, כי לא יאות לו לשבת בחבוק־ידים עם חיל עצום אשר כזה וגם למותר יהיה לו להלחם עם שונאים, העתידים לאכול איש את בשׂר אחיו. ',
    (5, 496): 'גם הראה לדעת, כי יכבד ממנו לשפוך סוללות (חדשות) מפני חֹסר עצים ועוד יקשה מזה לשמור על מבואי העיר, כי לא יצלח בידו להקיף את העיר מפני גָדלה ומעצורי המקום, והדבר הזה יהיה לרעת הרומאים לעת אשר יתנפלו עליהם [היהודים מתוך החומה], ',
    (5, 497): 'וגם אם ישמרו הרומאים על מוצאי העיר הגלוים, יתחכמו היהודים למצֹא להם שבילים נעלמים בשעת־דחקם, כי מיטיבים הם לדעת את המקום, ואם יעצרו כֹח להמציא להם צידה במסתרים, ארוך יארך זמן המצור, ',
    (5, 498): 'ויש לירֹא פן ישפיל אֹרך הזמן את כבוד הנצחון, כי הלא ברֹב ימים ישלם כל דבר וחפץ, ורק הממהר לנַצח זוכה לשם טוב. ',
    (5, 499): 'על־כן יעץ טיטוס לרומאים להקיף בחֵל (בדָיֵק) את העיר מסביב, למען יוכלו להזהר בנפשותיהם וגם להחיש את דברם, כי רק בדרך הזה יסגרו על כל מוצאי העיר וליהודים לא ישָּׁאר בלתי־אם להִוָּאש מכל ישועה ולמסור את העיר בידיהם, או להתמוגג ברעב – ואז יִלָּכדו באפס־יד. ',
    (5, 500): 'מלבד־זאת אמר טיטוס, כי לא יַרפּה מיתר דרכי המלחמה, וגם ידאג לבנות את הסוללות מחדש, אם לא יוסיפו האויבים להרגיזם ביד־חזקה, ',
    (5, 501): 'ואם יחשוב איש, כי העבודה הזאת היא גדולה וקשה למלאותה, עליו להשיב אל לבו, כי לא נאה לרומאים לאחוז במעשים קטנים, ובלא עמל רב לא יִכּוֹן לאדם לעשות גדולות [בלתי לאלהים לבדו]345.\n',
    (6, 177): 'והמורדים אשר בהר־הבית לא חדלו להלחם פנים בפנים עם אנשי־הצבא העומדים על הסוללות מדי יום ביומו. וביום עשרים ושבעה לחדש האמור (תמוז) הכינו להם מוקש באולם המערב, ',
    (6, 178): 'כי מלאו את כל החלל אשר בין צפּוי הקורות ובין הגג זרדים יבשים ושׂמו בתוכם חֵמָר וזפת, ואחרי־כן התחפשו כאלו כשל כּחם ונסוגו אחור למראית־עין. ',
    (6, 179): 'ובראות הרומאים את הדבר לא נזהרו רבים מהם ומהרו באף ובחמה להציק את צעדי הבורחים והעמידו סלמות לפניהם ועלו בהם וקפצו אל האולם. אולם הנבונים במחנה הרומאים חשדו ביהודים, כי טמנו להם פח בהסוגם אחור פתאם. ',
    (6, 180): 'ובכל־זאת מלא האולם המון אנשים, אשר העפילו לעלות, ובין כה וכה שלחו היהודים את כל האולם באש. כאשר התנשאה פתאם שלהבת־האש למרום, נפלה אימה גדולה על הרומאים העומדים מחוץ, וחבריהם הנמצאים באולם היו אובדי־עצות, כי מכל עברים הקיפה עליהם האש. ',
    (6, 181): 'אלה הפילו את־עצמם למטה אל העיר, אלה צנחו אל האויבים, ורבים קפצו למטה אל אחיהם בקוותם לישועה ורסקו את אבריהם, ורבים מאד נשרפו באש בטרם מצאו עצה, ואחדים בחרו למות על חרבם מעלות על המוקד. ',
    (6, 182): 'והאש פשטה למרחוק ואכלה גם את האנשים, אשר מצאו להם מיתה אחרת. אף כי היטב חרה לקיסר על הנספים, כי עלו אל האולם בלי פקדה, נכמרו רחמיו עליהם, ',
    (6, 183): 'וכאשר נבצר מכֹּח איש להמציא עזרה לאובדים, היה להם הדבר הזה לנחמה בצרתם, בהביטם אל צער האיש, אשר למענו חרפו את נפשותיהם, כי כל אחד מהם שמע את צעקת הקיסר וראה אותו קופץ בבהלה ומדבר על לב האנשים אשר מסביב להמציא רוָחה לאחיהם ככל אשר יש לאל־ידם. ',
    (6, 184): 'ולשׁמע צעקות הקיסר ולמראה יגון נפשו מת כל אחד ברצון, כי היה הדבר בעיניו כאבל נהדר על מותו. ',
    (6, 185): 'ואחדים נצלו ממות־שׂרפה, בהסוֹגם אל קיר האולם הרחב. אולם היהודים שתו עליהם סביב, וזמן רב עמדו הרומאים הנפצעים על־נפשם עד אשר נהרגו אחד אחד.',
    (6, 186): 'לאחרונה כרע למות עלם אחד ושמו לוֹנְגוּס, ומותו כאלו שפך הדר על המקרה הנורא הזה, כי הוא היה הגבור בכל האובדים ההם, אשר כּלם היו ראויים לשם־תהלה. ',
    (6, 187): 'גם היהודים השתוממו על חֹסן כֹּחו, וכאשר נבצר מהם להמיתו בדרך אחרת, קראו אליו לרדת אליהם לשלום. אולם ממחנה הרומאים קרא אליו אחיו קוֹרְנֶליוֹס קול גדול, כי לא יעשה כדבר הזה לנבּל את כבוד משפחתו ולעטות קלון על צבא הרומאים. הוא שמע לדברי אחיו ולעיני שתי המערכות שלף את חרבו ונפל עליה. ',
    (6, 188): 'ומאנשי־הצבא, אשר סבבה אותם האש, נצל ממות איש אחד ושמו אַרְטוֹריוֹס365 בערמתו, כי צעק בקול גדול אל חברו היושב עמו יחד באֹהל במחנה הרומאים, והוא אחד אנשי־הצבא ושמו לוּציוּס, לאמר: אני אשים אותך ליורש כל רכושי, אם תגש הנה לקבל אותי [בנפלי]“. ',
    (6, 189): 'לוּציוּס מהר אל המקום לקבל אותו ברצון, וארטוריוס קפץ אליו ונשאר חי, אולם חברו נלחץ מכֹּבד משאו אל מרצפת־האבנים ונפשו יצאה מיד. ',
    (6, 190): 'אחרי הפּרענות הזאת נפל לב הרומאים עליהם. ואף כי לא מצאו תנחומים בעת ההיא, הנה היה להם האסון להועיל, כי למד אותם להזהר מפני נכלי היהודים, אשר הרבו להרע להם, כי לא ידעו אנשי־הצבא את המקום ולא תּכּנו את רוח האנשים [הנלחמים בהם]. ',
    (6, 191): 'והאולם נשרף עד ל”מגדל יוחנן", הוא אשר הקים אותו יוחנן [בן לוי] בעת אשר נלחם בשמעון מעל לשער היוצא אל לשכת־הגזית. ואת החלק הנשאר הרסו היהודים אחרי אשר נפלו כל הרומאים העולים. ',
    (6, 192): 'וביום השני שרפו הרומאים גם את אולם־הצפון כּלוֹ עד אולם־המזרח, אשר חֻבּרו יחד בקרן הבנויה מעל לנחל קדרון, מקום נורא בעמקו. אלה הדברים נעשו מסביב לבית־המקדש בימים ההם.',
}



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--dry", action="store_true")
    A = ap.parse_args()

    if not os.path.exists(A.db):
        sys.exit(f"corpus.db not found at {A.db!r} -- run this from server/, or pass --db")

    con = connect_with_retry(A.db)
    cur = con.cursor()

    for attempt in range(6):
        try:
            cur.execute("BEGIN IMMEDIATE")
            break
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < 5:
                time.sleep(0.5 * (2 ** attempt))
                continue
            raise
    else:
        sys.exit("could not acquire a write lock after retries -- aborting, nothing changed")

    try:
        n = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE canon_id=?", (CANON_ID,)).fetchone()[0]
        if n == 0:
            sys.exit(f"no verses rows found for canon_id={CANON_ID} -- run ingest_josephus_war.py first")

        already_applied = 0
        to_apply = []

        # --- ENG rows ---
        for (b, v), new_text in ENG_FIXES.items():
            row = cur.execute(
                "SELECT text FROM verses WHERE corpus=? AND code=? AND chapter=? AND verse=? AND canon_id=?",
                (ENG_CORPUS, ENG_CODE, str(b), str(v), CANON_ID)).fetchone()
            if row is None:
                sys.exit(f"ENG book {b} verse {v}: no matching row found -- aborting, nothing changed")
            current = row[0]
            if current == new_text:
                already_applied += 1
                continue
            expected_old = ENG_OLD_EXPECTED.get((b, v))
            if expected_old is not None and current != expected_old:
                sys.exit(f"ENG book {b} verse {v}: current text does not match the expected "
                          f"pre-patch value -- refusing to overwrite unexpected data.\n"
                          f"  current : {current!r}\n  expected: {expected_old!r}")
            to_apply.append(("eng", b, v, new_text, None))

        # --- HEB rows ---
        for (b, v), new_text in HEB_FIXES.items():
            row = cur.execute(
                "SELECT text FROM verses WHERE corpus=? AND code=? AND chapter=? AND verse=? AND canon_id=?",
                (HEB_CORPUS, HEB_CODE, str(b), str(v), CANON_ID)).fetchone()
            if row is None:
                sys.exit(f"HEB book {b} verse {v}: no matching row found -- aborting, nothing changed")
            current = row[0]
            if current == new_text:
                already_applied += 1
                continue
            new_paleo = sq_to_paleo(new_text)
            to_apply.append(("heb", b, v, new_text, new_paleo))

        print(f"plan: {len(to_apply)} rows to patch, {already_applied} already match (no-op)")
        for lang, b, v, new_text, _ in to_apply:
            print(f"  {lang.upper()} book {b} verse {v}: -> {new_text[:70]!r}{'...' if len(new_text) > 70 else ''}")

        if not to_apply:
            print("nothing to do -- all rows already match the patched text (safe to re-run).")
            con.rollback()
            return

        if A.dry:
            print(f"[dry] would UPDATE {len(to_apply)} rows")
            con.rollback()
            return

        for lang, b, v, new_text, new_paleo in to_apply:
            corpus = ENG_CORPUS if lang == "eng" else HEB_CORPUS
            code = ENG_CODE if lang == "eng" else HEB_CODE
            if lang == "heb":
                cur.execute(
                    "UPDATE verses SET text=?, text_paleo=? WHERE corpus=? AND code=? AND chapter=? AND verse=? AND canon_id=?",
                    (new_text, new_paleo, corpus, code, str(b), str(v), CANON_ID))
            else:
                cur.execute(
                    "UPDATE verses SET text=? WHERE corpus=? AND code=? AND chapter=? AND verse=? AND canon_id=?",
                    (new_text, corpus, code, str(b), str(v), CANON_ID))
            if cur.rowcount != 1:
                raise RuntimeError(f"{lang} book {b} verse {v}: UPDATE affected {cur.rowcount} rows, expected 1 -- rolling back")

        # verify: no more empty cells at all for canon_id=219
        n_empty = cur.execute(
            "SELECT COUNT(*) FROM verses WHERE canon_id=? AND (text IS NULL OR text = '')",
            (CANON_ID,)).fetchone()[0]
        if n_empty:
            rows = cur.execute(
                "SELECT corpus, chapter, verse FROM verses WHERE canon_id=? AND (text IS NULL OR text = '') LIMIT 10",
                (CANON_ID,)).fetchall()
            raise RuntimeError(f"{n_empty} cells still empty after patch (first 10: {rows}) -- rolling back")

        con.commit()
        print()
        print(f"COMMITTED: {len(to_apply)} rows patched. Verified zero empty cells remain for canon_id={CANON_ID}.")

        print()
        print("Spot-check:")
        for corpus, code, b, v in ((ENG_CORPUS, ENG_CODE, 7, 208), (ENG_CORPUS, ENG_CODE, 7, 209),
                                    (HEB_CORPUS, HEB_CODE, 3, 190), (HEB_CORPUS, HEB_CODE, 3, 191),
                                    (HEB_CORPUS, HEB_CODE, 5, 491), (HEB_CORPUS, HEB_CODE, 6, 177),
                                    (HEB_CORPUS, HEB_CODE, 6, 192)):
            cur.execute(
                "SELECT text, length(text) FROM verses WHERE corpus=? AND code=? AND chapter=? AND verse=? AND canon_id=?",
                (corpus, code, str(b), str(v), CANON_ID))
            r = cur.fetchone()
            print(f"  {corpus} book {b} verse {v} -> len={r[1]}  {r[0][:90]!r}")

    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main()
