#!/usr/bin/env python3
"""One-off repair: tokens_nt lost its indexes when sync-heb-tokens.mjs renamed the old
table (the indexes went with it — see the comment in sync-heb-tokens.mjs). Re-creates
them on the live table and drops the stale copies on the backup tables. Re-runnable."""
import sqlite3, sys
db = sqlite3.connect(sys.argv[1] if len(sys.argv) > 1 else "corpus.db", timeout=30)
db.execute("PRAGMA locking_mode=EXCLUSIVE")
rows = db.execute("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name IN ('idx_tokens_nt_bcv','idx_tokens_nt_sn')").fetchall()
for name, tbl in rows:
    if tbl != 'tokens_nt':
        print(f"dropping {name} (was on {tbl})"); db.execute(f"DROP INDEX {name}")
db.execute("CREATE INDEX IF NOT EXISTS idx_tokens_nt_bcv ON tokens_nt(book_id, chapter, verse, token_ordinal)")
db.execute("CREATE INDEX IF NOT EXISTS idx_tokens_nt_sn  ON tokens_nt(strongs)")
db.commit()
print(db.execute("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND tbl_name='tokens_nt'").fetchall())
db.close()
