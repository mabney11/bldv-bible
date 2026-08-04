#!/usr/bin/env python3
"""
build-strongs-roots.py — regenerate lexicon/strongs-roots.json from the
OpenScriptures Hebrew lexicon (HebrewStrong.xml), so the Strong's-number → Paleo
root map is drawn from the SAME source family as the Strong's numbers now in
tokens_bhs (OSHB / morphhb). That source-consistency is what collapses the
surface-index root↔Strong's invariant violations: the root reference and the
token Strong's finally agree by construction.

It does NOT touch any raw text / word_raw — only the metadata map used to
cross-check Strong's numbers. Words never change across readings.

Source: https://github.com/openscriptures/HebrewLexicon  (HebrewStrong.xml, CC-BY-4.0)

Usage:
  python3 build-strongs-roots.py                       # fetch xml, write ./strongs-roots.json
  python3 build-strongs-roots.py --xml HebrewStrong.xml --out lexicon/strongs-roots.json
"""
import argparse, json, os, re, sys, urllib.request, xml.etree.ElementTree as ET

XML_URL = "https://raw.githubusercontent.com/openscriptures/HebrewLexicon/master/HebrewStrong.xml"

# ── CUSTOM / DERIVED ROOTS ────────────────────────────────────────────────────
# Paleo roots for forms OSHB does not number separately but that this project
# treats as their OWN lexical terms. Keyed by a project-local Strong's id
# (base number + lowercase letter). Merged AFTER the OSHB pass so every rebuild
# preserves them; they then flow through the surface-index Strong's↔root
# invariant exactly like any OSHB entry.
#
#   H429z  𐤀𐤋𐤄𐤉  — Alahay, the construct "God of" (bound form of H430 𐤀𐤋𐤄𐤉𐤌).
#                    Distinct so 𐤀𐤋𐤄𐤉 ≠ 𐤀𐤋𐤄𐤉𐤌; _numH('H429z')=429 keeps it
#                    just before H430 in any number-ordered view, and its shorter
#                    paleo keeps it before 𐤀𐤋𐤄𐤉𐤌 in the letter-sorted lexicon.
CUSTOM_ROOTS = {
    "H429z": "𐤀𐤋𐤄𐤉",
}

# Square Hebrew consonants → Paleo (identical mapping to the ingester/server).
_CONS  = "אבגדהוזחטיכלמנסעפצקרשת"
_PALEO = list("𐤀𐤁𐤂𐤃𐤄𐤅𐤆𐤇𐤈𐤉𐤊𐤋𐤌𐤍𐤎𐤏𐤐𐤑𐤒𐤓𐤔𐤕")
_H2P   = {h: _PALEO[i] for i, h in enumerate(_CONS)}
for fin, base in {"ך":"כ","ם":"מ","ן":"נ","ף":"פ","ץ":"צ"}.items():
    _H2P[fin] = _H2P[base]

def to_paleo(s):
    out = []
    for ch in s:
        if ch in _H2P: out.append(_H2P[ch]); continue
        if 0x0591 <= ord(ch) <= 0x05C7: continue     # niqqud / cantillation / maqaf / sof-pasuq
        # anything else (spaces, latin, punctuation) is dropped
    return "".join(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xml", help="local HebrewStrong.xml (else fetched from GitHub)")
    ap.add_argument("--out", default="strongs-roots.json")
    args = ap.parse_args()

    raw = open(args.xml, encoding="utf-8").read() if args.xml \
          else urllib.request.urlopen(XML_URL).read().decode("utf-8")
    raw = re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", raw)     # strip namespace decls
    raw = re.sub(r'\sxsi:\w+="[^"]+"', "", raw)           # strip xsi:* attrs (keep xml:lang)
    root = ET.fromstring(raw)

    roots = {}
    empty = 0
    for entry in root.iter("entry"):
        hid = entry.get("id")                            # 'H1', 'H1254', ...
        if not hid or not hid.startswith("H"): continue
        # The lemma is the FIRST <w> in the entry that carries a lang (heb/arc);
        # cross-reference <w src="…"> tags have no lang and are skipped.
        lemma = None
        for w in entry.findall("w"):
            if w.get("lang") or w.get("{http://www.w3.org/XML/1998/namespace}lang"):
                lemma = (w.text or "").strip(); break
        if lemma is None:                                # fall back to the very first <w>
            w0 = entry.find("w")
            lemma = (w0.text or "").strip() if w0 is not None else ""
        paleo = to_paleo(lemma)
        if not paleo:
            empty += 1
            continue
        roots["H" + str(int(hid[1:]))] = paleo           # normalize 'H0001'→'H1'

    # Merge project-local derived roots last so a rebuild always keeps them.
    # (A custom key never collides with OSHB — OSHB ids are pure integers.)
    roots.update(CUSTOM_ROOTS)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(roots, f, ensure_ascii=False, indent=0)
    print(f"✓ wrote {len(roots)} Strong's→Paleo-root entries to {args.out}  ({empty} entries had no usable lemma)")
    print(f"  (+{len(CUSTOM_ROOTS)} custom: {', '.join(CUSTOM_ROOTS)})")
    # quick spot-check
    for h in ("H1","H429z","H430","H1254","H7225","H8064","H776","H559","H1961"):
        print(f"    {h} → {roots.get(h,'—')}")

if __name__ == "__main__":
    main()
