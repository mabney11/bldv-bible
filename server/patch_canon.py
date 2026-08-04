#!/usr/bin/env python3
"""Idempotent canonical touch-ups for corpus.db — run in the folder that holds
corpus.db (e.g. server/):   python patch_canon.py
Closes the one alias gap found in the audit and clarifies a few doc titles so
they read plainly in the Docs picker. Safe to re-run; changes nothing already correct."""
import sqlite3, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'corpus.db'
db = sqlite3.connect(path); c = db.cursor()

# LXX Joel: Swete prints it under the siglum 'Joe', which wasn't in the alias
# table, so it fell through to a doc instead of OT slot 29.
n = c.execute("UPDATE verses SET canon_id=29 WHERE corpus='LXX' AND code='Joe' AND canon_id IS NULL").rowcount
print(f"LXX Joel (Joe -> 29): {n} verses mapped")

# Clarify a handful of legitimately-doc titles (alternate versions / prologues /
# Hebrew literary works) so the Docs picker names them, not their raw codes.
titles = {
  ('LXX','Dat'): 'Daniel (Theodotion, LXX)',
  ('LXX','Sip'): 'Sirach \u2014 Prologue',
  ('GNT','PA'):  'Pericope Adulterae (John 7:53\u20138:11)',
  ('GNT','ACT24'): 'Acts (alternate witness)',
  ('GEZ','EZRANEH'): 'Ezra-Nehemiah',
  ('HEB','MEGTAAN'): 'Megillat Taanit',
  ('HEB','MEGANT'):  'Megillat Antiochus',
  ('HEB','SEDOLAM'): 'Seder Olam Rabbah',
}
for (corp,code), t in titles.items():
    c.execute("UPDATE books SET title=? WHERE corpus=? AND code=?", (t, corp, code))
db.commit()
print(f"done. canonical verses now: {c.execute('SELECT COUNT(*) FROM verses WHERE canon_id IS NOT NULL').fetchone()[0]:,}")
