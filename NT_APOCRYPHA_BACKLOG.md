# NT Apocrypha backlog (from studythechurch.com/bible/nt-canon/nt-apocrypha-list)

Follow-up batch after the 6 priority Nag Hammadi/Gnostic texts (`ingest-gnostic-priority.py`).
Same pipeline: source public-domain English text → ingest as plain `corpus='ENG'` verse rows
(pattern in `ingest-gnostic-priority.py` / `ingest-pseudepigrapha.py`) → `node
sanitize-english.js` (generic, needs no per-book change — see CLAUDE.md) → `python
assign-canon-ids.py` (add a REGISTRY entry) or the `/book-manager` screen to promote+place it.

Reserved canon_id range for this batch: **209–262** (208 is reserved for Secret Book of John,
see `assign-canon-ids.py`). Assign sequentially as each item is actually ingested — don't
pre-assign an id to text that doesn't exist yet.

Three honest buckets, since not all 54 titles are equally real as "a text to ingest":

## A. Full surviving text exists, public-domain source identified (ingest as-is)

These are all in the classic public-domain corpus (M.R. James, *The Apocryphal New
Testament*, Oxford, 1924 — archive.org/details/JAMESApocryphalNewTestament1924 and mirrored
piecemeal on Wikisource; or Ante-Nicene Fathers vol. 8, 1886, on newadvent.org/sacred-texts.com,
same sourcing pattern already used for Acts of Paul and Thecla / Third Corinthians this pass).

- Gospel of Peter — surviving fragment (Akhmim), ANF vol. 9 / M.R. James. **done 2026-08-01**
  (canon_id 209, `ingest-nt-apocrypha-2.py`).
- Gospel of Nicodemus (= Acts of Pilate) — **already in the app**, canon_id 149.
- The Report of Pilate / The Acts of Pilate / The Giving Up of Pilate / The Death of Pilate —
  all appendices to the Pilate cycle in M.R. James; Acts of Pilate = Gospel of Nicodemus part 1
  (already have it), the others (Report, Giving-Up, Death, "Narrative of Joseph [of Arimathea]",
  "The Avenging of the Saviour"/Vindicta Salvatoris) are separate short Pilate-cycle pieces, all
  in M.R. James.
- Acts of the Holy Apostles Peter and Paul — M.R. James / ANF.
- Acts of Paul and Thecla — **done this pass** (canon_id 206).
- Acts of Barnabas — ANF vol. 8, right after Thecla in the same source (sacred-texts.com
  `chr/ecf/008/0081360.htm`, confirmed reachable this session). **done 2026-08-01**
  (canon_id 210, `ingest-nt-apocrypha-2.py`).
- Acts of Philip, Acts and Martyrdom of Andrew, Acts of Andrew and Matthias, Acts of Peter and
  Andrew, Acts of Andrew, Acts of Paul (the fuller cycle beyond Thecla), Acts of Peter, Acts of
  Peter and the Twelve, Acts of Thomas, Acts and Martyrdom of Matthew, Consummation of Thomas,
  Martyrdom of Bartholomew, Acts of Thaddaeus, Acts of John the Theologian — all in M.R. James;
  most also in ANF vol. 8.
- Revelation of Moses (= Apocalypse of Moses / Life of Adam and Eve, Greek recension) — public
  domain, multiple translations (R.H. Charles' is the standard one used elsewhere in this app's
  own pseudepigrapha ingestion).
- Revelation of Esdras (distinct from 4 Ezra, already in the app as id 139) — M.R. James.
- Coptic Revelation of Paul (Apocalypse of Paul) — M.R. James has the Greek/Latin/Syriac; a
  Coptic version exists in Nag Hammadi-adjacent Coptic collections — check `ingest-coptic.py`'s
  source (Coptic SCRIPTORIUM) for coverage before assuming a fresh fetch is needed.
- The Book of John Concerning the Falling Asleep of Mary / The Passing of Mary — M.R. James
  has both major recensions.
- The Decretals — these are papal correspondence, not a single short text; lower priority,
  scope out exactly which letters before ingesting (M.R. James doesn't include these; this is
  actually a different corpus — Pseudo-Isidorian Decretals — worth confirming the user actually
  wants THIS rather than assuming).
- Memoirs of Edessa and Other Ancient Syrian Documents (Teaching of the Apostles, Teaching of
  Simon Cephas, Abgar correspondence) — ANF vol. 8 has the Abgar letters; the fuller "Memoirs of
  Edessa" collection (Cureton/Doctrine of Addai) is a separate public-domain volume (W. Cureton,
  *Ancient Syriac Documents*, 1864) — different source than M.R. James, flag before ingesting.
- The Apocalypse of the Virgin, Apocalypse of Thomas, Apocalypse of Stephen — all in M.R. James.
- Liturgy of James — public domain (ANF vol. 7, liturgies volume, not vol. 8 — different tome).

## B. Fragments/quotations only — no complete surviving text to "ingest" as a book

These are known ONLY from quotations in other early Christian writers (Origen, Epiphanius,
Jerome, Eusebius, etc.) — there is no continuous verse-by-verse text to ingest the way the
app ingests a book. The honest options are: (1) skip, (2) ingest the surviving quoted
fragments only, clearly labeled as fragments, sourced from a scholarly fragment collection
(e.g. Hennecke-Schneemelcher, or the fragment sections of M.R. James/ANF) rather than
presenting them as if they were the complete text.

- Gospel of the Ebionites, Gospel of the Hebrews, Gospel of the Nazarenes, Gospel of Matthias,
  Gospel of the Seventy, Gospel of Thaddaeus, Gospel of the Twelve, Gospel of Mani, Gospel of
  Apelles, Gospel of Bardesanes, Gospel of Basilides, Gospel of Bartholomew, Gospel of the
  Egyptians, Coptic Gospel of the Egyptians — all fragments-only (the "Coptic Gospel of the
  Egyptians" is sometimes confused with the actual Nag Hammadi tractate *The Egyptian Gospel*
  / *The Holy Book of the Great Invisible Spirit*, NHC III,2 and IV,2 — THAT one does survive
  complete in Coptic and could be added the same way as this pass's 6 priority texts if wanted;
  worth confirming which one the user means).
- Pseudo-Cyril of Jerusalem (on the Life and Passion of Christ) — exists but is a long, obscure
  Coptic homily; sourcing needs its own check, not a quick fragment.

## C. Needs scope clarification before sourcing

- "The Decretals: Letters to different Popes" — which letters/collection, see note in bucket A.
- "Memoirs of Edessa and Other Ancient Syrian Documents" — confirm Cureton's volume is the
  intended source (different book from M.R. James, used for everything else on this list).

## Suggested order for the next pass

1. Everything already fully in M.R. James / ANF vol. 8 with a working fetchable URL (bucket A,
   minus the two "needs scope" items) — mechanically the same as this session's
   `ingest-gnostic-priority.py`, just more entries in the same script.
2. Coptic Gospel of the Egyptians, if that's the Nag Hammadi tractate the user means — same
   sourcing pattern as Thomas/Philip this pass.
   (Note: Melchizedek, NHC IX,1, was also added 2026-08-01 alongside Gospel of Peter/Acts
   of Barnabas — canon_id 211, `ingest-nt-apocrypha-2.py`. Not originally on this list;
   included because it was openly republished at the same trusted source as Third
   Corinthians. Extremely fragmentary, ~64% lost, per the ingest script's own notes.)
3. Bucket C items, once scoped.
4. Bucket B fragments, clearly labeled as fragments, only if wanted — this is a different kind
   of reading experience (a paragraph of "here's what survives") than every other book in the
   app and should probably look different in the UI, not just another chapter/verse book.
