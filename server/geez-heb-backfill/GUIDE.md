# Ge'ez → Hebrew backfill: translation guide (1/2/3 Meqabyan + small Ge'ez works)

You are translating Ge'ez (Classical Ethiopic) verses into **Hebrew** and **English** for a
scripture study corpus. The Ge'ez is the only surviving text of these books. The Hebrew you
write becomes the book's Hebrew edition; the English becomes its reading text, and the app
later pairs every English word with a Hebrew word of the same verse, so the two must say the
same thing, word for word as far as natural English allows.

## The one hard rule: every Hebrew word must already exist in the corpus

The corpus has the Hebrew Bible, a Hebrew NT and Hebrew apocrypha. Every Hebrew word you write
must be a word that already appears somewhere in that Hebrew — as the whole word, or after its
proclitics (ו ה ב ל כ מ ש, up to three) are peeled off. So "וּבְמַלְכוּתוֹ" is fine if במלכותו,
מלכותו or the bare word appears. This is checked by `python3 server/geez-heb-backfill/check_heb.py
<your output file>`. Run it, fix every UNATTESTED word (choose another attested word or form that
says the same thing — a synonym, another conjugation, a periphrasis with attested words), and run
it again until it reports `unattested/problem words: 0`. Only a proper name may stay
unattested, and only if you list it under "names".

The batch file gives, for each Ge'ez word, the Hebrew words that stand where that Ge'ez word
stands in the corpus's own parallel books (Ge'ez Bible ↔ Hebrew Bible), with a Dice score and
attested surface forms: `full:` = this exact Ge'ez form, `stem:` = without its ወ/ለ/በ/ከ/ዘ/እም
prefix, `skel:` = consonant skeleton (noisiest). `lex:` is the app's curated Ge'ez lexicon
(English gloss, often with the Hebrew word's transliteration first). **Prefer these attested
Hebrew words** — that is how the same Ge'ez word gets the same Hebrew word everywhere. They are
statistical, so use judgment: a candidate that does not mean what the Ge'ez means in context
(e.g. `את`, `אשר`, a name from some other verse) is noise — skip it. When there is no evidence,
choose the Hebrew word the Hebrew Bible itself would use for that idea.

## Hebrew style
- Unvocalized (no niqqud, no cantillation), biblical-narrative Hebrew: ויהי, vav-consecutive
  (ויאמר, וילך), construct chains, pronoun suffixes (ידו, לבו, עמו). Sparing maqaf (use a space).
- Follow the Ge'ez closely, clause by clause and word for word where Hebrew allows. Translate
  every word — omit nothing, add nothing. Ge'ez ወ = ו, ለ = ל / את, በ = ב, እም = מ / מן,
  ዘ = אשר / construct, ከመ = כ / כי / למען as context requires.
- Punctuation: keep commas/periods/colons as plain ASCII `, . : ; ? !` where the Ge'ez sentence
  breaks; no sof-pasuq.
- Final letters (ך ם ן ף ץ) as normal Hebrew spelling.

## Divine names (fixed)
- እግዚአብሔር (also split as እግዚ አብሔር) → **יהוה**; English **"the LORD"** (capitals).
- አምላክ / አምላኪየ etc. → **אלהים** (or suffixed: אלהי, אלהיך, אלהינו); English "God" ("my God" …).
- እግዚእ (lord, of God) → **אדני**; English "the Lord". Of a human master → אדון/אדני, "lord/master".
- ልዑል → עליון "Most High". ፈጣሪ → בורא? — check attestation; otherwise עושה, "Creator".
- Idols / false gods: ጣዖት → אלילים / פסלים, አማልክት (of the nations) → אלהים אחרים / אלהיהם; English "gods", "idols".

## Names
Biblical names take their Hebrew Bible spelling (ሞዓብ מואב Moab, ጌዴዎን גדעון Gideon, አማሌቅ עמלק
Amalek, ምድያም מדין Midian, ኢየሩሳሌም ירושלים Jerusalem, እስራኤል ישראל Israel, ይሁዳ יהודה Judah,
ብንያም בנימין Benjamin, ሰሎሞን שלמה Solomon, ዳዊት דוד David, ሙሴ משה Moses, ሳሙኤል שמואל Samuel,
ሳኦል שאול Saul, ኤዶም אדום Edom, ባቢሎን בבל Babylon, ግብጽ מצרים Egypt, ፋርስ פרס Persia, ኢዮብ איוב Job,
አዳም אדם Adam, ኖኅ נח Noah, አብርሃም אברהם Abraham). Fixed names of these books:
- መቃቢስ Meqabis → **מקביס**, English "Meqabis"
- ጺሩጻይዳን Tsirutsaydan → **צירוצידן**, English "Tsirutsaydan"
Any other name without a biblical Hebrew form: transliterate consonantally into Hebrew
letters, and list it under "names" (Ge'ez → {heb, eng}). English uses the conventional English
form if one exists, else a simple romanization of the Ge'ez.

## English style
Modern, plain, faithful English (World English Bible register: no thee/thou/-eth). Same clauses
and content as your Hebrew, in natural English order. Proper names in normal English (Moab,
Gideon, Meqabis) — the app transliterates them itself. Divine names as above. Do not put Hebrew
or transliterations in the English. Do not add explanations or bracketed notes.

## Output
Write `server/geez-heb-backfill/out/batch_NNN.json` (NNN = your batch number), UTF-8:
```json
{
  "batch": 1,
  "verses": {
    "1MEQ 1:1": {"heb": "...", "eng": "..."},
    "...": {}
  },
  "names": {"ጺሩጻይዳን": {"heb": "צירוצידן", "eng": "Tsirutsaydan"}}
}
```
Every verse in the batch file must be present, with non-empty heb and eng. Then run the checker
until it passes. Your final message: just the batch number, the checker's last line, and any
verse whose Ge'ez you found genuinely unclear (ref + one line).

## Duplicate verse numbers
The Ge'ez source sometimes has two rows with the same verse number (a verse split in two).
Give such a ref ONE entry: translate both segments, in order, into that one heb/eng pair.
