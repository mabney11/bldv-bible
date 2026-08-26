#!/usr/bin/env python3
"""
find-ashah-bath-mismatches.py — cross-references translation.db's English
"TRANSLIT (gloss)" text against corpus.db's tokens_bhs (Strong's-tagged BHS
tokens) to find/fix places where the Hebrew homograph 'ashah' (Strong's H801
"fire/offering made by fire" vs H802 "woman/wife") or 'bath' (H1323
"daughter" vs H1324 "bath, liquid measure") was glossed with the wrong
sense, plus places where a plural "daughters" (H1323, nu=pl, no pronominal
suffix) is still rendered with the singular "bath" spelling instead of its
real plural Hebrew letters.

DEFAULT MODE (no --apply): read-only dry run. Opens both DBs with
'?mode=ro&immutable=1' so it never takes a write lock. Prints a summary +
samples and writes full detail to --out as JSON. Never writes to the DB.

--apply MODE: actually fixes translation.db. Safety protocol:
  1. Takes an online SQLite backup of translation.db (sqlite3.Connection.backup,
     safe against a concurrently-open WAL-mode db) BEFORE touching anything.
  2. Runs PRAGMA integrity_check on a FRESH connection to that backup.
  3. Re-derives every fix from CURRENT db content (not a stale prior report).
  4. For each verse changed: snapshots the prior row into translation_history
     first (matching saveVerseWithHistory's own precedent), then updates
     text/rich_text, then remaps any translation_links.english_indices that
     point at word positions after a fix within the same verse (the ashah
     fixes and the rare H1324 bath fixes change whitespace-token count).
  5. Everything happens in ONE transaction; commits only if every row
     succeeds. Re-runs PRAGMA integrity_check on the live db after commit.

Run on the actual server (translation.db/corpus.db on local disk) — the
'?mode=ro&immutable=1' read trick exists for the flaky device_bash FUSE
mount case; --apply needs a normal read/write-capable filesystem.
"""
import sqlite3, re, sys, json, argparse, shutil, time

PALEO = {
    '\U00010900': {'med':'a','fin':'a'}, '\U00010901': {'med':'ba','fin':'b'},
    '\U00010902': {'med':'ga','fin':'g'}, '\U00010903': {'med':'da','fin':'d'},
    '\U00010904': {'med':'ha','fin':'h'}, '\U00010905': {'med':'wa','fin':'w'},
    '\U00010906': {'med':'za','fin':'z'}, '\U00010907': {'med':'cha','fin':'ch'},
    '\U00010908': {'med':'ta','fin':'t'}, '\U00010909': {'med':'ya','fin':'y'},
    '\U0001090A': {'med':'ka','fin':'k'}, '\U0001090B': {'med':'la','fin':'l'},
    '\U0001090C': {'med':'ma','fin':'m'}, '\U0001090D': {'med':'na','fin':'n'},
    '\U0001090E': {'med':'sa','fin':'s'}, '\U0001090F': {'med':'i','fin':'i'},
    '\U00010910': {'med':'pa','fin':'p'}, '\U00010911': {'med':'tza','fin':'tz'},
    '\U00010912': {'med':'qa','fin':'q'}, '\U00010913': {'med':'ra','fin':'r'},
    '\U00010914': {'med':'sha','fin':'sh'}, '\U00010915': {'med':'tha','fin':'th'},
}

def translit_word(tok, capitalize=True):
    chars = list(tok)
    last_idx = -1
    for i, c in enumerate(chars):
        if c in PALEO:
            last_idx = i
    out = ''
    for i, c in enumerate(chars):
        if c in PALEO:
            out += PALEO[c]['fin'] if i == last_idx else PALEO[c]['med']
    if capitalize and out:
        out = out[0].upper() + out[1:]
    return out

def morph_num(morph):
    for part in (morph or '').split('|'):
        if part.startswith('nu='):
            return part[3:]
    return None

def morph_prs(morph):
    for part in (morph or '').split('|'):
        if part.startswith('prs='):
            return part[4:]
    return None

ASHAH_PAT = re.compile(r'\b(Ayashah|ayashah|Ashah|ashah)\s*\(([^)]*)\)')
BATH_PAT  = re.compile(r'\b(Bath|bath)\s*\(([^)]*)\)')


NUN = '\U0001090D'


def resolve_ashah(strongs, cap):
    """Returns (new_word, new_gloss, partial). partial is always False here —
    Strong's number alone fully disambiguates H801/H802, no suffix concerns."""
    if strongs == 'H802':
        return ('Ayashah' if cap else 'ayashah', 'woman / wife', False)
    else:  # H801
        return ('Ashah' if cap else 'ashah', 'fire / offering made by fire', False)


def resolve_bath(word_raw, morph, strongs, cap):
    """Returns (new_word, new_gloss, partial).

    2026-08-26 rewrite: fieldy flagged that Exodus 2:1/2:5 etc. still showed
    "bath (bath / liquid measure)" for real "daughter" occurrences even
    after the first --apply run. Root cause (confirmed by reading server.js):
    the Reader/Translate-Studio API's resolveChapterVerseTexts() runs any
    verse that has never been manually re-saved in Translate Studio (an
    "untouched draft") through applyLiveGloss(), which rewrites EVERY
    "word (...)" parenthetical using a reverse index built from
    lexicon/lexicon.json, keyed by translit(word_raw).toLowerCase() — with
    ZERO awareness of Strong's number. lexicon.json has exactly ONE entry
    for the bare defective spelling 𐤁𐤕 ("bath / liquid measure"), because
    that's the same 2-letter consonantal spelling BOTH senses share. So
    ANY verse where we left the word as bare "Bath"/"bath" — even with a
    correct "(daughter)" gloss — gets silently overwritten back to
    "(bath / liquid measure)" by the live-gloss overlay the next time an
    untouched-draft verse is served. This is exactly why some verses
    "reverted" after the first apply and others (already resolved with a
    genuinely different word, like ayashah) didn't.

    Fix: NEVER leave the daughter sense (H1323) as bare "Bath"/"bath" —
    always use fieldy's "banath" convention (extends "ban"/son + the "-ath"
    feminine suffix, restoring the historical nun that Hebrew's own
    orthography assimilates away only in the singular). This gives H1323 a
    translit key ("banath"/"banawath"/etc.) that's DISTINCT from H1324's
    "bath" key, so applyLiveGloss's reverse-index lookup no longer collides
    — confirmed lexicon.json already independently has a 𐤁𐤍𐤕 ("banath")
    entry glossed "daughter", so this isn't a new invention, it lines up
    with an existing (previously unused) lexicon entry.

    Real Hebrew plural "daughters" (בָּנוֹת) genuinely keeps the nun in its
    own attested spelling (word_raw already contains it, e.g. 𐤁𐤍𐤅𐤕) — no
    synthesis needed there, mechanical translit of the real word_raw is
    both historically accurate AND collision-safe already.

    A pronominal suffix's own consonants still aren't in word_raw (same
    limitation as before) — for those we NOW still apply the safe
    "banath"/"banawath"-family STEM (collision-safe, sense-safe) rather
    than leaving the dangerous bare "bath", but flag partial=True since the
    suffix ending itself ("-akam", "-oh", etc.) isn't reconstructed. This
    is strictly better than the old behavior (which left suffixed cases
    completely untouched, exposed to the same live-gloss collision) even
    though it's still not the FULL fix fieldy hand-typed for Exodus 3:22
    ("Banathayakam") — that still needs a real prs-code→suffix table to
    fully automate, and stays a manual/optional follow-up.
    """
    if strongs == 'H1324':
        return ('Bath' if cap else 'bath', 'bath / liquid measure', False)
    nu = morph_num(morph)
    prs = morph_prs(morph)
    has_suffix = prs not in (None, 'absent')
    if nu == 'pl':
        # real word_raw already carries the historical nun for plural
        word = translit_word(word_raw, capitalize=cap)
        return (word, 'daughters', has_suffix)
    # singular: word_raw is the bare defective spelling (no nun in real
    # Hebrew orthography) — synthesize the "banath" stem by inserting nun
    # right after the first letter (bet), per fieldy's explicit convention
    synth_raw = word_raw[:1] + NUN + word_raw[1:]
    word = translit_word(synth_raw, capitalize=cap)
    return (word, 'daughter', has_suffix)


def classify_verse(ccur, b, c, v, text, pattern, strongs_pair, resolver):
    """Shared logic for both ashah and bath. resolver(row, cap) -> (word, gloss, partial).
    (partial=True means: sense-correct and collision-safe, but a pronominal
    suffix ending couldn't be reconstructed — still worth a manual look.)
    Returns (resolved_list_or_None, matches, bhs_rows, distinct_strongs)."""
    ms = list(pattern.finditer(text))
    if not ms:
        return None, [], [], set()
    ccur.execute(
        "SELECT token_ordinal, word_raw, morph, strongs FROM tokens_bhs "
        "WHERE book_id=? AND chapter=? AND verse=? AND strongs IN (?,?) "
        "ORDER BY token_ordinal", (b, c, v, strongs_pair[0], strongs_pair[1]))
    bhs = ccur.fetchall()
    distinct_strongs = {row[3] for row in bhs}
    if len(bhs) == len(ms):
        resolved = [resolver(row, m.group(1)[0].isupper()) for m, row in zip(ms, bhs)]
        return resolved, ms, bhs, distinct_strongs
    # count mismatch: only safe if every present token resolves to the SAME
    # (word, gloss) — partial flags may differ (e.g. one occurrence has a
    # suffix and another doesn't) without blocking the uniform apply; if any
    # of them needed the partial flag, the whole uniform application is
    # marked partial too, so the verse still gets a review flag.
    per_tok = [resolver(row, True) for row in bhs]
    if bhs and all(x is not None and x[:2] == per_tok[0][:2] for x in per_tok):
        only_word, only_gloss = per_tok[0][0], per_tok[0][1]
        any_partial = any(x[2] for x in per_tok)
        resolved = [(only_word if m.group(1)[0].isupper() else only_word[0].lower() + only_word[1:],
                     only_gloss, any_partial)
                    for m in ms]
        return resolved, ms, bhs, distinct_strongs
    return None, ms, bhs, distinct_strongs


def build_fixed_text(text, matches, resolved):
    """Applies (word, gloss, partial) replacements to text. The partial flag
    doesn't affect whether/how a replacement is applied — a partial fix
    (sense-correct + collision-safe stem, suffix ending not reconstructed)
    is still applied; partial only drives the review-flag reporting in
    compute_verse_fix. Returns (new_text, changed, shift_records) where
    shift_records is a list of (old_word_start_index, old_word_count,
    new_word_count) in left-to-right order, for later
    translation_links.english_indices remapping. Word indices follow the
    app's own convention: text.split() (whitespace-delimited, matches JS
    .trim().split(/\\s+/) closely enough for this purpose)."""
    new_text = text
    char_offset = 0
    changed = False
    shift_records = []
    for m, r in zip(matches, resolved):
        if r is None:
            continue
        new_word, new_gloss, _partial = r
        old_word, old_gloss = m.group(1), m.group(2)
        if old_word == new_word and old_gloss.strip() == new_gloss:
            continue
        changed = True
        start, end = m.start(), m.end()
        repl = f'{new_word} ({new_gloss})'
        old_word_start_index = len(text[:start].split())
        old_word_count = len(m.group(0).split())
        new_word_count = len(repl.split())
        shift_records.append((old_word_start_index, old_word_count, new_word_count))
        new_start, new_end = start + char_offset, end + char_offset
        new_text = new_text[:new_start] + repl + new_text[new_end:]
        char_offset += len(repl) - (end - start)
    return new_text, changed, shift_records


def remap_index(old_idx, shift_records):
    """Returns (new_idx, was_fuzzy). shift_records must be in ascending
    old_word_start_index order (true here since matches come out of the
    regex in left-to-right order)."""
    delta = 0
    for start, old_cnt, new_cnt in shift_records:
        if old_idx < start:
            break
        elif old_idx < start + old_cnt:
            rel = old_idx - start
            return start + delta + min(rel, new_cnt - 1), True
        else:
            delta += (new_cnt - old_cnt)
    return old_idx + delta, False


def compute_verse_fix(ccur, b, c, v, text):
    """Returns (new_text_or_None, shift_records, review_list). review_list is
    always a list (possibly empty) of dicts. A verse can BOTH get a partial
    fix AND appear in review_list — e.g. one daughter occurrence is a bare
    plural (auto-fixable) while a sibling occurrence in the same verse is a
    plural+suffix ("my daughters") that isn't (see resolve_bath's docstring).
    Never silently drop the unresolved half just because the other half
    resolved cleanly."""
    a_resolved, a_ms, a_bhs, a_distinct = classify_verse(
        ccur, b, c, v, text, ASHAH_PAT, ('H801', 'H802'),
        lambda row, cap: resolve_ashah(row[3], cap))
    b_resolved, b_ms, b_bhs, b_distinct = classify_verse(
        ccur, b, c, v, text, BATH_PAT, ('H1323', 'H1324'),
        lambda row, cap: resolve_bath(row[1], row[2], row[3], cap))

    review = []
    if a_ms:
        if a_resolved is None:
            review.append({'kind': 'ashah', 'n_matches': len(a_ms), 'n_bhs': len(a_bhs),
                            'bhs_strongs': sorted(a_distinct)})
        elif any(r is None or r[2] for r in a_resolved):
            n_unresolved = sum(1 for r in a_resolved if r is None or r[2])
            review.append({'kind': 'ashah', 'partial': True, 'n_matches': len(a_ms),
                            'n_unresolved': n_unresolved, 'n_bhs': len(a_bhs),
                            'bhs_strongs': sorted(a_distinct)})
    if b_ms:
        if b_resolved is None:
            review.append({'kind': 'bath', 'n_matches': len(b_ms), 'n_bhs': len(b_bhs),
                            'bhs_strongs': sorted(b_distinct)})
        elif any(r is None or r[2] for r in b_resolved):
            # r[2] ("partial") now covers the common case: a suffix ending
            # wasn't reconstructed, but the word/gloss WAS still safely
            # fixed (never left as bare "Bath" — see resolve_bath's
            # docstring on the applyLiveGloss collision this avoids).
            n_unresolved = sum(1 for r in b_resolved if r is None or r[2])
            review.append({'kind': 'bath', 'partial': True, 'n_matches': len(b_ms),
                            'n_unresolved': n_unresolved, 'n_bhs': len(b_bhs),
                            'bhs_strongs': sorted(b_distinct)})

    # merge both match sets in left-to-right order so build_fixed_text can
    # apply them together with one running character offset
    combined = []
    if a_resolved is not None:
        combined += list(zip(a_ms, a_resolved))
    if b_resolved is not None:
        combined += list(zip(b_ms, b_resolved))
    combined.sort(key=lambda pair: pair[0].start())

    if not combined:
        return None, [], review

    matches = [p[0] for p in combined]
    resolved = [p[1] for p in combined]
    new_text, changed, shift_records = build_fixed_text(text, matches, resolved)
    return (new_text if changed else None), shift_records, review


def dry_run(translation_db, corpus_db, out_json):
    tdb = sqlite3.connect(f'file:{translation_db}?mode=ro&immutable=1', uri=True)
    cdb = sqlite3.connect(f'file:{corpus_db}?mode=ro&immutable=1', uri=True)
    tcur = tdb.cursor()
    ccur = cdb.cursor()

    tcur.execute('SELECT book_id, chapter, verse, text FROM translations')
    rows = tcur.fetchall()
    ccur.execute('SELECT DISTINCT book_id FROM tokens_bhs')
    bhs_books = {r[0] for r in ccur.fetchall()}

    fixes, reviews = [], []
    ashah_oos = bath_oos = 0
    links_touched = 0

    for b, c, v, t in rows:
        if not t:
            continue
        if b not in bhs_books:
            if ASHAH_PAT.search(t):
                ashah_oos += 1
            if BATH_PAT.search(t):
                bath_oos += 1
            continue
        new_text, shift_records, review = compute_verse_fix(ccur, b, c, v, t)
        if review:
            reviews.append({'book': b, 'chapter': c, 'verse': v, 'review': review, 'sample': t[:160]})
        if new_text:
            fixes.append({'book': b, 'chapter': c, 'verse': v, 'old': t, 'new': new_text})
            tcur.execute('SELECT count(*) FROM translation_links WHERE book_id=? AND chapter=? AND verse=?', (b, c, v))
            links_touched += tcur.fetchone()[0]

    print(f'(skipped as out-of-scope, no BHS/Hebrew source: {ashah_oos} ashah verses, {bath_oos} bath verses — NT/apocrypha)')
    print(f'=== {len(fixes)} verses fixable, {len(reviews)} need manual review ===')
    print(f'(translation_links rows in fixable verses that would need index-remapping: {links_touched})')
    for f in fixes[:10]:
        print(f"  {f['book']}:{f['chapter']}:{f['verse']}\n    OLD: {f['old'][:150]}\n    NEW: {f['new'][:150]}")
    print()
    print(f'review samples (of {len(reviews)}):')
    for r in reviews[:10]:
        print(' ', r)

    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump({'fixes': fixes, 'reviews': reviews}, f, ensure_ascii=False, indent=1)
    print(f'\nFull detail written to {out_json}')


def do_apply(translation_db, corpus_db, backup_suffix):
    cdb = sqlite3.connect(f'file:{corpus_db}?mode=ro&immutable=1', uri=True)
    ccur = cdb.cursor()

    # 1) online backup of translation.db, safe against a concurrently-open WAL db
    backup_path = f'{translation_db}.{backup_suffix}'
    print(f'Backing up {translation_db} -> {backup_path} ...')
    src = sqlite3.connect(translation_db)
    dst = sqlite3.connect(backup_path)
    src.backup(dst)
    dst.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    dst.commit()
    src.close()
    dst.close()

    # 2) integrity check the backup on a FRESH connection before trusting it
    check_conn = sqlite3.connect(f'file:{backup_path}?mode=ro', uri=True)
    result = check_conn.execute('PRAGMA integrity_check').fetchone()
    check_conn.close()
    if result != ('ok',):
        print(f'ABORT: backup integrity_check failed: {result}')
        sys.exit(1)
    print('Backup integrity_check: ok')

    # 3) re-derive fixes fresh from current live content, apply in one transaction
    tdb = sqlite3.connect(translation_db)
    tcur = tdb.cursor()
    ccur.execute('SELECT DISTINCT book_id FROM tokens_bhs')
    bhs_books = {r[0] for r in ccur.fetchall()}

    tcur.execute('SELECT book_id, chapter, verse, text, rich_text FROM translations')
    all_rows = tcur.fetchall()

    n_verses_fixed = 0
    n_history_rows = 0
    n_links_shifted = 0
    n_links_fuzzy = 0

    try:
        for b, c, v, text, rich_text in all_rows:
            if not text or b not in bhs_books:
                continue
            new_text, shift_records, _review = compute_verse_fix(ccur, b, c, v, text)
            if not new_text:
                continue

            # apply the identical fix to rich_text if it's non-empty (mirrors text
            # in this app whenever populated) and actually matches the same pattern
            new_rich_text = rich_text
            if rich_text:
                rt_new, rt_shift, _rt_review = compute_verse_fix(ccur, b, c, v, rich_text)
                if rt_new:
                    new_rich_text = rt_new

            # snapshot prior row into translation_history first
            tcur.execute(
                'INSERT INTO translation_history (book_id, chapter, verse, status, text, rich_text, saved_at) '
                "SELECT book_id, chapter, verse, status, text, rich_text, datetime('now') "
                'FROM translations WHERE book_id=? AND chapter=? AND verse=?', (b, c, v))
            n_history_rows += 1

            tcur.execute(
                "UPDATE translations SET text=?, rich_text=?, updated_at=datetime('now') "
                'WHERE book_id=? AND chapter=? AND verse=?',
                (new_text, new_rich_text, b, c, v))
            n_verses_fixed += 1

            # remap translation_links.english_indices for this verse (all languages)
            if shift_records:
                tcur.execute(
                    'SELECT id, english_indices FROM translation_links WHERE book_id=? AND chapter=? AND verse=?',
                    (b, c, v))
                link_rows = tcur.fetchall()
                for link_id, idx_json in link_rows:
                    try:
                        idxs = json.loads(idx_json) if idx_json else []
                    except (json.JSONDecodeError, TypeError):
                        idxs = []
                    if not idxs:
                        continue
                    new_idxs = []
                    any_fuzzy = False
                    for i in idxs:
                        new_i, fuzzy = remap_index(i, shift_records)
                        new_idxs.append(new_i)
                        any_fuzzy = any_fuzzy or fuzzy
                    if new_idxs != idxs:
                        tcur.execute(
                            'UPDATE translation_links SET english_indices=? WHERE id=?',
                            (json.dumps(new_idxs), link_id))
                        n_links_shifted += 1
                        if any_fuzzy:
                            n_links_fuzzy += 1
                            print(f'  NOTE: translation_links id={link_id} ({b}:{c}:{v}) had an index '
                                  f'landing inside a replaced span — best-effort remap applied, spot-check it.')
        tdb.commit()
    except Exception:
        tdb.rollback()
        print('ERROR during apply — rolled back, translation.db left unchanged. Backup at:', backup_path)
        raise

    # 4) integrity check the LIVE db after commit, on a fresh connection
    tdb.close()
    check_conn2 = sqlite3.connect(f'file:{translation_db}?mode=ro', uri=True)
    result2 = check_conn2.execute('PRAGMA integrity_check').fetchone()
    check_conn2.close()
    print()
    print(f'Verses fixed: {n_verses_fixed}')
    print(f'translation_history rows written: {n_history_rows}')
    print(f'translation_links rows shifted: {n_links_shifted} ({n_links_fuzzy} needed a best-effort/fuzzy remap — check the NOTE lines above)')
    print(f'Post-write integrity_check on live db: {result2}')
    print(f'Backup kept at: {backup_path} (delete once you have confirmed everything looks right)')
    if result2 != ('ok',):
        print('*** WARNING: live db integrity_check did NOT return ok — investigate immediately, restore from backup if needed. ***')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--translation-db', default='translation.db')
    ap.add_argument('--corpus-db', default='corpus.db')
    ap.add_argument('--out', default='ashah-bath-report.json', help='dry-run only: where to write full JSON detail')
    ap.add_argument('--apply', action='store_true', help='actually write the fix (default: dry run only)')
    args = ap.parse_args()
    if args.apply:
        suffix = 'pre-ashah-bath-backup-' + time.strftime('%Y-%m-%d_%H%M%S')
        do_apply(args.translation_db, args.corpus_db, suffix)
    else:
        dry_run(args.translation_db, args.corpus_db, args.out)
