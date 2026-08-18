#!/usr/bin/env node
/**
 * verify-no-eliding.js — HARD GATE: no Hebrew word may render with fewer letters
 * than the root the parser itself already decided is the true root.
 *
 * This is the invariant fieldy set for the project (see CLAUDE.md, "Hebrew word
 * transliteration: no eliding, ever"): every letter the canonical root/lemma has,
 * plus every letter a genuine prefix/suffix morpheme adds, must show up in the
 * rendered word. Duplicate letters (AAmar) are correct. A word coming out SHORTER
 * than "prefix + full canonical root" is not an acceptable alternate spelling —
 * it is the exact bug class that produced "HaWaray" instead of "HaYarahay" for
 * Psalm 119:33 (H3384, Yarah).
 *
 * WHAT THIS CHECKS — an INTERNAL CONSISTENCY test, not a re-derivation of policy
 *   Each baked surface's `components` array already records, per word, whether
 *   the parser decided to TRUST the canonical root for the *grouping* lemma
 *   (root component's `true_root` field). That decision already accounts for
 *   every legitimate reason NOT to trust it — STRONGS_NO_MUTATE particles like
 *   H259 (echad/one), standalone proclitics (bare ל/ב/כ/מ/ו/ה) that never even
 *   get a root component, SNs whose canonical lemma shares nothing with the
 *   surface, etc. This gate does not re-implement any of that policy (an
 *   earlier version tried to and produced 50 false positives on exactly these
 *   particles — see git history / session notes). It only asks one question:
 *
 *     If the root component's true_root EQUALS the canonical lemma (i.e. the
 *     parser itself decided "yes, trust the canonical root here"), does the
 *     DISPLAYED root (component.paleo, what the reader actually sees) still
 *     contain every one of that lemma's letters, in order?
 *
 *   If true_root trusted the canonical root but paleo doesn't show it, that is
 *   never legitimate — it means the grouping root and the display root
 *   disagreed, which is precisely what "HaWaray" was: true_root correctly
 *   resolved to Yarah's 𐤉𐤓𐤄, but paleo still showed the un-restored 𐤅𐤓.
 *
 * USAGE
 *   node verify-no-eliding.js              exits 1 and prints every violation if any exist
 *   node verify-no-eliding.js [dbPath]      point at a specific surface-index.db instead of
 *                                           the one next to this script (added so
 *                                           deploy-blue-green.sh's DATA GATES can run this
 *                                           against /data/surface-index.db on the live volume,
 *                                           same pattern as verify-versification.mjs's dbPath
 *                                           argument — see that file's header)
 *   node verify-no-eliding.js --list N     cap the printed list to N (default: all)
 *   node verify-no-eliding.js --quiet      suppress the per-violation lines, just the count
 */
'use strict';

const path = require('path');
const fs   = require('fs');

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function isSubsequence(subStr, fullStr) {
    const sub = [...subStr];
    let i = 0;
    for (const ch of fullStr) { if (i < sub.length && sub[i] === ch) i++; }
    return i === sub.length;
}

function runGate({ dbPath, lexDir } = {}) {
    dbPath = dbPath || path.join(__dirname, 'surface-index.db');
    lexDir = lexDir || path.join(__dirname, 'lexicon');

    if (!fs.existsSync(dbPath)) {
        return { ok: true, skipped: true, reason: `${dbPath} not found — nothing to gate yet` };
    }
    const rootsPath = [path.join(lexDir, 'strongs-roots.json'), path.join(__dirname, 'strongs-roots.json')]
        .find(fs.existsSync);
    if (!rootsPath) {
        return { ok: true, skipped: true, reason: 'strongs-roots.json not found — nothing to gate yet' };
    }

    const Database = require('better-sqlite3');
    const ROOTS = loadJSON(rootsPath);
    const normH = h => h ? 'H' + String(h).replace(/^H+/, '') : '';

    const db = new Database(dbPath, { readonly: true });
    let rows;
    try {
        rows = db.prepare(`SELECT word_raw, strongs, components FROM token_surfaces WHERE components IS NOT NULL`).all();
    } finally {
        db.close();
    }

    const violations = [];
    let checked = 0;
    for (const r of rows) {
        let comps;
        try { comps = JSON.parse(r.components); } catch { continue; }
        if (!Array.isArray(comps)) continue;
        const rootComp = comps.find(c => c && c.css === 'root');
        if (!rootComp || !rootComp.true_root) continue;   // standalone particle / no SN-driven root at all

        const sn = normH(rootComp.sn || r.strongs);
        if (!sn) continue;
        const snNum = parseInt(sn.slice(1), 10);
        if (!Number.isFinite(snNum) || snNum >= 9000) continue;   // virtual/placeholder SNs

        const canonical = ROOTS[sn];
        if (!canonical) continue;   // no canonical lemma to check against

        // COMPOUND PROPER NAMES (Ben-Yemini H1145, Abiezer H33, Malki-Tzedek-style
        // maqaf compounds, etc.): Strong's assigns ONE lemma to the WHOLE multi-word
        // name, but any single BHS token only ever carries its own half — true_root
        // legitimately holds the full compound for grouping while paleo legitimately
        // shows only this token's own letters (server.js's STRONGS_DERIV / maqaf-
        // adjacency machinery does this on purpose; see its comments). A real single-
        // morpheme Hebrew/Aramaic root (even fully spelled out with every affix
        // restored, e.g. Horeni -> Yarah) tops out at 4 paleo letters; 5+ letter
        // lemmas measured in this corpus are, without exception, multi-word compound
        // or gentilic names (Ben-Gever H1127, Ben-Deqer H1128, Rabshakeh H7262 "chief
        // butler", ...). Skip those — this gate has nothing correct to say about a
        // token that structurally can never contain its own lemma.
        if ([...canonical].length >= 5) continue;

        checked++;
        // The parser's OWN decision: did it trust the canonical root as the
        // true (grouping) root for this word? Only act when it did — every
        // reason it might legitimately NOT have (STRONGS_NO_MUTATE particles,
        // a genuinely-unrelated SN, etc.) already shows up as true_root simply
        // not matching canonical, and this gate has nothing to say about that.
        if (rootComp.true_root !== canonical) continue;

        // It trusted the canonical root for grouping — the letters MUST also
        // be present (in order) in what's actually shown to the reader.
        if (!isSubsequence(canonical, rootComp.paleo || '')) {
            violations.push({
                word_raw: r.word_raw, sn, canonical,
                true_root: rootComp.true_root, paleo: rootComp.paleo || '',
            });
        }
    }

    return { ok: violations.length === 0, checked, violations, total: rows.length };
}

function formatCP(s) {
    return s ? [...s].map(ch => 'U+' + ch.codePointAt(0).toString(16).toUpperCase()).join(' ') : '(empty)';
}

function printReport(result, { list = Infinity, quiet = false } = {}) {
    if (result.skipped) {
        console.log(`[no-eliding gate] SKIPPED — ${result.reason}`);
        return;
    }
    console.log(`[no-eliding gate] checked ${result.checked.toLocaleString()} root-bearing surfaces (of ${result.total.toLocaleString()} baked)`);
    if (result.ok) {
        console.log('[no-eliding gate] PASS — every trusted canonical root is fully present in its rendered word.');
        return;
    }
    console.error(`[no-eliding gate] FAIL — ${result.violations.length} surface(s) elide a trusted canonical root's letters:`);
    if (!quiet) {
        for (const v of result.violations.slice(0, list)) {
            console.error(`    word_raw=${formatCP(v.word_raw)}  sn=${v.sn}  canonical=${formatCP(v.canonical)}` +
                          `  true_root=${formatCP(v.true_root)}  paleo=${formatCP(v.paleo)}`);
        }
        if (result.violations.length > list) {
            console.error(`    ...and ${result.violations.length - list} more.`);
        }
    }
    console.error('[no-eliding gate] The parser trusted the canonical root for grouping (true_root) but did not');
    console.error('  display it (paleo). Fix the rootDisplay branch in server.js / build-surface-index.js so the');
    console.error('  two never disagree, then rebuild surface-index.db.');
}

// Standalone CLI usage: node verify-no-eliding.js [dbPath] [--list N] [--quiet]
if (require.main === module) {
    const args = process.argv.slice(2);
    const listIdx = args.indexOf('--list');
    const list = listIdx >= 0 ? Number(args[listIdx + 1]) : Infinity;
    const quiet = args.includes('--quiet');
    // First non-flag arg that isn't the numeric value --list consumed = dbPath override.
    const consumed = new Set(listIdx >= 0 ? [listIdx, listIdx + 1] : []);
    const dbPath = args.find((a, i) => !consumed.has(i) && !a.startsWith('--'));
    const result = runGate(dbPath ? { dbPath } : undefined);
    printReport(result, { list, quiet });
    process.exit(result.ok ? 0 : 1);
}

module.exports = { runGate, printReport };
