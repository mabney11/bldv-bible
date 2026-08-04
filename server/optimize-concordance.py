#!/usr/bin/env python3
"""
optimize-concordance.py

Makes the concordance lookups fast without rebuilding the 5.7 GB database.

The hot query is:
    WHERE norm=? AND corpus IN (LXX,GNT,GRC) ORDER BY (canon_id IS NULL), canon_id, ord_c, ord_v, ord
plus by_corpus / by_book aggregations on the same filter. The existing index is
tokens(corpus, norm) — corpus-leading — which makes SQLite do one seek per corpus
and fall back to the 43.9M-row table for the canon_id/code columns the aggregations
need. And build-concordance.py never ANALYZEs, so the planner often abandons the
index entirely and scans.

This creates a norm-LEADING index that (a) turns the equality on norm into a single
tiny range, (b) carries corpus/canon_id/code/ordinals so COUNT, by_corpus and by_book
are answered from the index alone (no table I/O), then runs ANALYZE so the planner
actually uses it. A partial index covers lemma lookups (lemmas are sparse — NT only).

    python optimize-concordance.py                 # add indexes + ANALYZE (keeps old ones)
    python optimize-concordance.py --reclaim       # also drop the superseded corpus-leading index
    python optimize-concordance.py --db /path/concordance.db
"""
import argparse, sqlite3, time, os

ap = argparse.ArgumentParser()
ap.add_argument('--db', default='concordance.db')
ap.add_argument('--reclaim', action='store_true', help='drop the superseded ix_tok_norm to reclaim space')
A = ap.parse_args()

db = sqlite3.connect(A.db)
db.execute('PRAGMA journal_mode=WAL')

def plan(sql, params):
    return db.execute('EXPLAIN QUERY PLAN ' + sql, params).fetchall()

before = [r[1] for r in db.execute("PRAGMA index_list(tokens)")]
print('existing indexes on tokens:', before or '(none)')

# norm-leading covering index: norm (equality) → corpus (IN) → canon_id/code (by_book)
# → ordinals (occ ordering). COUNT/by_corpus/by_book are satisfied from the index alone.
print('\ncreating ix_tok_conc (norm, corpus, canon_id, code, ord_c, ord_v, ord) ...')
t = time.time()
db.execute("""CREATE INDEX IF NOT EXISTS ix_tok_conc
              ON tokens(norm, corpus, canon_id, code, ord_c, ord_v, ord)""")
print(f'  done in {time.time()-t:.1f}s')

# lemma lookups: partial — lemmas only exist where there's morphology (NT today),
# so this index stays small instead of carrying 43M NULLs.
print('creating ix_tok_conc_lem (partial, lemma IS NOT NULL) ...')
t = time.time()
db.execute("""CREATE INDEX IF NOT EXISTS ix_tok_conc_lem
              ON tokens(lemma, corpus, canon_id, code, ord_c, ord_v, ord)
              WHERE lemma IS NOT NULL""")
print(f'  done in {time.time()-t:.1f}s')

if A.reclaim:
    # ix_tok_norm(corpus, norm) is fully superseded by the norm-leading index for
    # runtime queries; drop it to reclaim ~1 GB. (Build re-derives `forms` itself.)
    print('dropping superseded ix_tok_norm ...')
    db.execute("DROP INDEX IF EXISTS ix_tok_norm")

print('\nrunning ANALYZE (gives the planner statistics so it uses the index) ...')
t = time.time(); db.execute('ANALYZE'); print(f'  done in {time.time()-t:.1f}s')
db.commit()

# ── prove the planner now uses the index for the real query shape ────────────
g = ['LXX', 'GNT', 'GRC']
ph = ','.join('?' * len(g))
hot = f"""SELECT corpus,canon_id,code,ord_c,ord_v,ch,v,surface FROM tokens
          WHERE norm=? AND corpus IN ({ph})
          ORDER BY (canon_id IS NULL), canon_id, ord_c, ord_v, ord LIMIT 100"""
agg = f"""SELECT corpus,canon_id,code,COUNT(*) n FROM tokens
          WHERE norm=? AND corpus IN ({ph}) GROUP BY corpus,canon_id,code"""
print('\nEXPLAIN QUERY PLAN — occurrences:')
for r in plan(hot, ['x', *g]): print('   ', r[-1])
print('EXPLAIN QUERY PLAN — by_book aggregation:')
for r in plan(agg, ['x', *g]): print('   ', r[-1])

used = any('ix_tok_conc' in r[-1] for r in plan(hot, ['x', *g]))
print(f"\n{'✓ index in use' if used else '✗ planner still not using ix_tok_conc — inspect above'}")
print('indexes now:', [r[1] for r in db.execute("PRAGMA index_list(tokens)")])
db.execute('PRAGMA optimize'); db.close()
