# English -> Hebrew backfill: translation guide (reader verses with no Hebrew)

You are writing the **Hebrew** for verses of a scripture-study app that has English but no Hebrew.
The app pairs every English word with a Hebrew word of the same verse and then rebuilds the reading
text FROM your Hebrew (each Hebrew word + its English gloss). So your Hebrew must say exactly what the
English says, clause for clause, word for word as far as Hebrew allows. Omit nothing, add nothing.

## The one hard rule: every Hebrew word must already exist in the corpus
Every word you write must be a word that already appears in the corpus's own Hebrew (Hebrew Bible,
Hebrew NT, Hebrew apocrypha) — whole, or after peeling up to three proclitics (ו ה ב ל כ מ ש).
Run `python3 check_heb.py out/<batch>.json` and fix every UNATTESTED word (another attested word or
form that says the same: a synonym, another conjugation or person, a periphrasis) until it reports
`unattested/problem words: 0`. Only a proper name may stay unattested, and only if listed under "names".

## Hints
Each verse in the batch lists, for its content words, the Strong's numbers the corpus's own tagged OT
uses for that English word, with the commonest Hebrew Bible spellings (`H898 בגדו/בוגדים/...`).
**Prefer these** — that is how the same English word gets the same Hebrew word everywhere in the app.
They are statistical: skip a candidate that does not mean what the verse means; with no good hint,
use the word the Hebrew Bible itself uses for that idea. Common particles as the Hebrew Bible writes
them: For / surely = כי, all / every = כל, and = ו, not = לא / אל, behold = הנה, thus saith = כה אמר.

## Hebrew style
- Unvocalized biblical Hebrew (no niqqud/cantillation). Narrative: ויהי, vav-consecutive (ויאמר),
  construct chains, pronoun suffixes (ידו, לבם). Prophetic speech as the prophets write it.
- Final letters (ך ם ן ף ץ) as normal spelling. Use a space instead of maqaf.
- Punctuation as plain ASCII `, . : ; ? !` where the English sentence breaks; no sof-pasuq.
- KJV archaisms are just English: "shall die" = ימותו/ימות, "saith" = אמר.

## Divine names (fixed)
- "the Lord" / "the LORD" speaking or acting as God, "the Lord God" -> **יהוה** / **אדני יהוה**;
  "thus saith the Lord" = כה אמר יהוה; "O Lord" in prayer = אדני; "my Lord" (God) = אדני.
- "God" = **אלהים** (suffixed: אלהי, אלהיך, אלהיהם); "the Most High" = **עליון**; "Almighty" = **שדי**;
  "the Holy One" = הקדוש; "Lord of hosts" = יהוה צבאות; "Son of God" = בן האלהים; "Messiah"/"Christ" = משיח.
- idols / gods of the nations = אלילים / פסלים / אלהים אחרים.

## Names
Biblical names take their Hebrew Bible spelling (Ezra עזרא, Seraiah שריה, Azariah עזריה, Israel
ישראל, Jacob יעקב, Babylon בבל, Egypt מצרים, Asia — no biblical form: transliterate אסיה, list it).
A name with no Hebrew Bible form: transliterate consonantally into Hebrew letters and list it under
"names" as `"English": {"heb": "..."}`.

## Output: out/<same file name as the batch>.json
```
{"verses": {"15:4": {"heb": "כי כל הבוגדים ימותו בבגדם."}, ...},
 "names": {"Asia": {"heb": "אסיה"}}}
```
Every ref of the batch must be present. Then run the gate until it reports 0.

## Non-biblical books (Testaments, Adam and Eve, Hermas, Pistis Sophia, Nag Hammadi, ...)
- The English here is from various translations (not KJV). Translate what it says.
- NT names/terms: Jesus = ישוע, Christ / Messiah = משיח, Lord (Jesus) = אדני, disciples = תלמידים,
  apostles = שליחים, Holy Spirit = רוח הקדש, Peter = פטרוס / כיפא (as the English), Mary = מרים,
  John = יוחנן, James = יעקב, Paul = פולוס, Pilate = פילטוס, Herod = הורדוס, Jews = יהודים,
  Pharisees = פרושים — list any of these the gate rejects under "names".
- Greek/gnostic technical terms with no Hebrew word (Aeon, Barbelo, Pleroma, Sabaoth = צבאות,
  Ialdabaoth, Archon): use a Hebrew word that says the same where one exists (Aeon = עולם,
  archon / ruler = שר, the Treasury of the Light = אוצר האור); otherwise transliterate and list it.
- If the English is visibly garbled or cut off, translate what is clearly meant and add
  `"notes": {"<ref>": "<one line>"}` to the output.
- An empty or punctuation-only English verse: write the Hebrew of what the English holds
  (a title or heading counts); never leave a verse empty.
