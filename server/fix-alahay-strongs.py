#!/usr/bin/env python3
"""
fix-alahay-strongs.py — give the construct 𐤀𐤋𐤄𐤉 (Alahay, "God of") its OWN
Strong's number in the corpus so it is a distinct term from 𐤀𐤋𐤄𐤉𐤌 (Alahayam,
H430). Assigns H429z to every construct 𐤀𐤋𐤄𐤉 token in tokens_bhs.

Why H429z: strongs-roots.json maps H429z → 𐤀𐤋𐤄𐤉 (added via build-strongs-roots.py).
The surface index derives each surface's SN from its parsed root through the
Strong's↔root invariant, so once that root map exists the construct resolves to
H429z on its own — root 𐤀𐤋𐤄𐤉, transliteration "Alahay", cleanly separate from
𐤀𐤋𐤄𐤉𐤌/H430. It sorts before 𐤀𐤋𐤄𐤉𐤌 in the lexicon by paleo (shorter prefix)
and before H430 in any number-ordered view (_numH('H429z') = 429).

This ONLY touches the per-token Strong's number — never word_raw / text.

Run (dry run — reports, writes nothing):
    python3 fix-alahay-strongs.py --db corpus.db

Apply:
    python3 fix-alahay-strongs.py --db corpus.db --apply

Full order of operations:
    1. python3 build-strongs-roots.py          # regenerates strongs-roots.json incl. H429z
    2. python3 fix-alahay-strongs.py --db corpus.db --apply
    3. node build-surface-index.js             # re-derives lexicon / surface index
    4. python3 build-concordance.py            # surfaces already distinct; refresh anyway
    5. delete the "𐤀𐤋𐤄𐤉" entry from surface-strongs-overrides.json (now dead —
       tokens_bhs carries the SN, and the override is fallback-only)
    6. restart the server, hard-refresh
"""
import sqlite3, argparse, json, os, sys

WORD    = "\U00010900\U0001090B\U00010904\U00010909"   # 𐤀𐤋𐤄𐤉  (construct surface)
WORD_IM = WORD + "\U0001090C"                            # 𐤀𐤋𐤄𐤉𐤌 (absolute, for the format probe)
NEW_SN  = "429z"                                          # written WITH or WITHOUT leading H to
                                                          # match how the corpus already stores SNs

ap = argparse.ArgumentParser()
ap.add_argument("--db", default="corpus.db")
ap.add_argument("--roots", default="strongs-roots.json",
                help="path to strongs-roots.json (checked for the H429z entry)")
ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
A = ap.parse_args()

if not os.path.exists(A.db):
    sys.exit(f"✗ corpus db not found: {A.db}")

# ── Pre-flight: is H429z → 𐤀𐤋𐤄𐤉 in the root map yet? ─────────────────────────
# Not fatal (the surface index keeps a real per-token SN regardless), but the
# invariant + canonical-root display are only fully correct once it's present.
if os.path.exists(A.roots):
    try:
        rj = json.load(open(A.roots, encoding="utf-8"))
        got = rj.get("H429z")
        if got == WORD:
            print(f"[roots] OK — H429z → {got} present in {A.roots}")
        elif got:
            print(f"[roots] ⚠ H429z maps to {got!r}, expected {WORD!r}")
        else:
            print(f"[roots] ⚠ H429z NOT in {A.roots} — run build-strongs-roots.py first")
    except Exception as e:
        print(f"[roots] ⚠ could not read {A.roots}: {e}")
else:
    print(f"[roots] ⚠ {A.roots} not found — run build-strongs-roots.py first")

con = sqlite3.connect(A.db)
cur = con.cursor()

# ── Detect the stored SN format (H-prefixed vs bare) from a real value ────────
row = cur.execute(
    "SELECT strongs FROM tokens_bhs WHERE strongs IS NOT NULL AND strongs != '' LIMIT 1"
).fetchone()
sample = ((row[0] if row else "") or "").strip()
h_prefixed = sample.upper().startswith("H")
sn_value = ("H" + NEW_SN) if h_prefixed else NEW_SN
print(f"[format] existing strongs sample = {sample!r}  →  will write {sn_value!r}")

# ── Target: the CONSTRUCT 𐤀𐤋𐤄𐤉 only. morph is stored as short key=value codes
#    (…|st=c|… where st=c is construct; st=a absolute, st=d determined), so this
#    matches the bound form and leaves the 1cs-suffixed 'my God' 𐤀𐤋𐤄𐤉 (which is
#    st=a|prs=… ) alone. Pipe-bounded so it can't catch a stray substring. ──
WHERE = "word_raw = ? AND morph LIKE '%|st=c|%'"

(n_match,) = cur.execute(f"SELECT COUNT(*) FROM tokens_bhs WHERE {WHERE}", (WORD,)).fetchone()
print(f"[scan] construct {WORD} tokens matched: {n_match}")
if n_match == 0:
    print("[scan] ⚠ zero matches — inspect a sample row's morph and adjust the "
          "state code if needed (construct is 'st=c' in the short-code format).")
    samp = cur.execute("SELECT morph FROM tokens_bhs WHERE word_raw=? LIMIT 3", (WORD,)).fetchall()
    for (m,) in samp:
        print("        sample morph:", m)

print(f"[scan] current SN distribution on those tokens:")
for sn, c in cur.execute(
        f"SELECT COALESCE(NULLIF(strongs,''),'(empty)') AS sn, COUNT(*) "
        f"FROM tokens_bhs WHERE {WHERE} GROUP BY sn ORDER BY COUNT(*) DESC", (WORD,)):
    print(f"        {sn}: {c}")

# Sanity: confirm the absolute stays H430 (we must NOT touch it)
(n_abs,) = cur.execute(
    "SELECT COUNT(*) FROM tokens_bhs WHERE word_raw=? AND morph LIKE '%|st=a|%'",
    (WORD_IM,)).fetchone()
print(f"[scan] absolute {WORD_IM} tokens (left untouched): {n_abs}")

if not A.apply:
    print("\n[dry run] nothing written. Re-run with --apply once the counts look right.")
    con.close(); sys.exit(0)

cur.execute(f"UPDATE tokens_bhs SET strongs=? WHERE {WHERE}", (sn_value, WORD))
con.commit()
print(f"[apply] set strongs={sn_value!r} on {cur.rowcount} construct {WORD} token(s).")
con.close()
print("[done] next: node build-surface-index.js  →  python3 build-concordance.py  →  restart.")
