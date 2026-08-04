#!/usr/bin/env node
/**
 * import-translations.cjs
 *
 * Safe import/merge of translations from a backup translation.db into the
 * live one. Three modes:
 *
 *   --dry-run            inspect only; print what WOULD happen, change nothing
 *   --merge              add rows from backup; for verses already present in
 *                        the live db, keep whichever has the most recent
 *                        updated_at (default; safest)
 *   --prefer-backup      use the backup's row whenever the verse exists in
 *                        both (overwrites live data; use when you know the
 *                        backup is the authoritative copy)
 *   --prefer-live        keep the live row whenever the verse exists in both
 *                        (only import rows that are missing live)
 *
 * Examples:
 *
 *   node scripts/import-translations.cjs \
 *       --source path/to/backup-translation.db \
 *       --target server/translation.db \
 *       --dry-run
 *
 *   node scripts/import-translations.cjs \
 *       --source ~/Downloads/translation.db \
 *       --target server/translation.db \
 *       --merge
 *
 * Notes:
 *   - Always makes a `.bak` of the target before writing.
 *   - Links (translation_links) are de-duplicated by (book,chapter,verse,
 *     english_phrase, token_ordinals) so re-running the import is idempotent.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// CLI arg parsing
const args = process.argv.slice(2);
const argv = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);

const SRC = argv('--source');
const DST = argv('--target', path.join(__dirname, '..', 'server', 'translation.db'));
const DRY = flag('--dry-run');
const MODE =
    flag('--prefer-backup') ? 'prefer-backup' :
    flag('--prefer-live')   ? 'prefer-live'   :
    'merge'; // default

if (!SRC) {
    console.error(`Usage: node import-translations.cjs --source <backup.db> [--target <live.db>] [--dry-run|--merge|--prefer-backup|--prefer-live]`);
    process.exit(1);
}
if (!fs.existsSync(SRC)) {
    console.error(`Source file not found: ${SRC}`);
    process.exit(1);
}

// Load sqlite — prefer node:sqlite (in-tree) over better-sqlite3 (requires
// native build). Both expose the same interface for our needs.
let Database;
try { Database = require('better-sqlite3'); }
catch {
    // Shim wrapping node:sqlite to a better-sqlite3-compatible facade
    const { DatabaseSync } = require('node:sqlite');
    Database = class {
        constructor(file, opts = {}) {
            this.db = new DatabaseSync(file, opts.readonly ? { readOnly: true } : {});
        }
        prepare(q) {
            const s = this.db.prepare(q);
            return {
                all: (...a) => s.all(...a),
                get: (...a) => s.get(...a),
                run: (...a) => s.run(...a),
            };
        }
        exec(s) { return this.db.exec(s); }
        close()  { this.db.close(); }
    };
}

console.log(`Source: ${SRC}`);
console.log(`Target: ${DST}`);
console.log(`Mode:   ${DRY ? 'DRY-RUN' : MODE}`);
console.log('');

const src = new Database(SRC, { readonly: true });
const dstExists = fs.existsSync(DST);
if (!dstExists) {
    console.log(`Target ${DST} does not exist. Will create.`);
}

// Quick row counts so the user knows what they're working with
const srcCounts = {
    translations:      src.prepare("SELECT COUNT(*) AS c FROM translations").get().c,
    translation_links: src.prepare("SELECT COUNT(*) AS c FROM translation_links").get().c,
};
console.log(`Source has: ${srcCounts.translations} translations, ${srcCounts.translation_links} links`);

if (srcCounts.translations === 0 && srcCounts.translation_links === 0) {
    console.log('\nSource database is empty — nothing to import.');
    src.close();
    process.exit(0);
}

let dst;
if (dstExists) {
    if (!DRY) {
        const bak = DST + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(DST, bak);
        console.log(`Backed up target → ${bak}`);
    }
    dst = new Database(DST);
} else {
    if (DRY) {
        // For dry-run when target is missing, fall through with an in-memory
        // shim so the rest of the script can walk through what would happen.
        dst = new Database(':memory:');
    } else {
        dst = new Database(DST);
    }
}

// Ensure tables exist on target
dst.exec(`
    CREATE TABLE IF NOT EXISTS translations (
        book_id     INTEGER NOT NULL,
        chapter     INTEGER NOT NULL,
        verse       INTEGER NOT NULL,
        status      TEXT    NOT NULL DEFAULT 'none',
        text        TEXT    NOT NULL DEFAULT '',
        rich_text   TEXT    NOT NULL DEFAULT '',
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (book_id, chapter, verse)
    );
    CREATE TABLE IF NOT EXISTS translation_links (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id         INTEGER NOT NULL,
        chapter         INTEGER NOT NULL,
        verse           INTEGER NOT NULL,
        english_phrase  TEXT    NOT NULL DEFAULT '',
        english_indices TEXT    NOT NULL DEFAULT '[]',
        token_ordinals  TEXT    NOT NULL DEFAULT '[]',
        component_hint  TEXT    NOT NULL DEFAULT '',
        color_index     INTEGER NOT NULL DEFAULT 0,
        sort_order      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_translations_book   ON translations(book_id);
    CREATE INDEX IF NOT EXISTS idx_translations_status ON translations(status);
    CREATE INDEX IF NOT EXISTS idx_links_verse         ON translation_links(book_id, chapter, verse);
`);

// ── Translations merge ────────────────────────────────────────────────────
const srcTrans = src.prepare(`
    SELECT book_id, chapter, verse, status, text, rich_text, updated_at
    FROM translations
`).all();
const getDstTrans = dst.prepare(`
    SELECT updated_at FROM translations
    WHERE book_id=? AND chapter=? AND verse=?
`);
const insTrans = dst.prepare(`
    INSERT OR REPLACE INTO translations
    (book_id, chapter, verse, status, text, rich_text, updated_at)
    VALUES (?,?,?,?,?,?,?)
`);
let nNewT = 0, nUpdT = 0, nSkipT = 0;
for (const t of srcTrans) {
    const existing = getDstTrans.get(t.book_id, t.chapter, t.verse);
    if (!existing) {
        if (!DRY) insTrans.run(t.book_id, t.chapter, t.verse, t.status, t.text, t.rich_text, t.updated_at);
        nNewT++;
        continue;
    }
    let take;
    if (MODE === 'prefer-backup') take = true;
    else if (MODE === 'prefer-live') take = false;
    else /* merge */ take = String(t.updated_at) > String(existing.updated_at);
    if (take) {
        if (!DRY) insTrans.run(t.book_id, t.chapter, t.verse, t.status, t.text, t.rich_text, t.updated_at);
        nUpdT++;
    } else {
        nSkipT++;
    }
}
console.log(`\nTranslations: ${nNewT} new, ${nUpdT} updated, ${nSkipT} skipped (live was newer/preferred)`);

// ── Links merge ────────────────────────────────────────────────────────────
// Links are deduped by (book, chapter, verse, english_phrase, token_ordinals).
const srcLinks = src.prepare(`
    SELECT book_id, chapter, verse, english_phrase, english_indices,
           token_ordinals, component_hint, color_index, sort_order
    FROM translation_links
`).all();
const hasLink = dst.prepare(`
    SELECT id FROM translation_links
    WHERE book_id=? AND chapter=? AND verse=? AND english_phrase=? AND token_ordinals=?
`);
const insLink = dst.prepare(`
    INSERT INTO translation_links
    (book_id, chapter, verse, english_phrase, english_indices,
     token_ordinals, component_hint, color_index, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?)
`);
let nNewL = 0, nDupL = 0;
for (const l of srcLinks) {
    const exists = hasLink.get(l.book_id, l.chapter, l.verse, l.english_phrase, l.token_ordinals);
    if (exists) {
        nDupL++;
    } else {
        if (!DRY) insLink.run(l.book_id, l.chapter, l.verse, l.english_phrase, l.english_indices,
                               l.token_ordinals, l.component_hint, l.color_index, l.sort_order);
        nNewL++;
    }
}
console.log(`Links:        ${nNewL} new, ${nDupL} already present`);

src.close();
dst.close();

if (DRY) {
    console.log('\n[DRY-RUN] No changes written. Re-run without --dry-run to apply.');
} else {
    console.log('\n✓ Import complete.');
}
