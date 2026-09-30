#!/usr/bin/env node
// GATE — Reader Back-button keeps your place (fieldy, 2026-09-30).
//
// Contract: pressing Back (browser or phone) into /bible puts you exactly
// where you were looking when you left — same verse, same spot on screen —
// no matter which verse is highlighted/selected or whose page you opened.
// Only a fresh arrival (a link, Next/Prev chapter, the picker) starts at the
// top of the chapter.
//
// This has regressed twice (see the "Regression history" block in
// src/lib/readerScrollMemory.js). Runs automatically before every build
// (`prebuild` in package.json → also inside the Docker image build), so a
// change that breaks it fails the build instead of shipping.
//
//   node scripts/verify-reader-back-scroll.mjs
//
// Part 1 exercises the real decision code in lib/readerScrollMemory.js
// against a simulated reader. Part 2 checks Reader.jsx is still wired to it
// the way that makes Part 1 true in the browser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mem = await import(path.join(root, 'src/lib/readerScrollMemory.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const { stampArrival, captureView, encodeView, decodeView, planRestore, applyView } = mem;

const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };

// ── Part 1: behaviour ───────────────────────────────────────────────────────

// A fake .rd-scroll: 30 verses stacked, 140px each, below a 400px heading.
function fakeScroller({ headingPx = 400, versePx = 140, n = 30, clientH = 800 } = {}) {
  const s = {
    scrollTop: 0, headingPx, versePx, clientH,
    getBoundingClientRect: () => ({ top: 56, bottom: 56 + clientH }),
    scrollTo({ top }) { s.scrollTop = Math.max(0, Math.min(top, s.maxTop())); },
    maxTop: () => s.headingPx + n * s.versePx - clientH,
    verse(v) {
      return {
        id: `rv-${v}`,
        getBoundingClientRect: () => {
          const top = 56 + s.headingPx + (v - 1) * s.versePx - s.scrollTop;
          return { top, bottom: top + s.versePx };
        },
      };
    },
    querySelectorAll: () => Array.from({ length: n }, (_, i) => s.verse(i + 1)),
    querySelector: (sel) => { const m = /^#rv-(\d+)$/.exec(sel); const v = m && +m[1]; return v >= 1 && v <= n ? s.verse(v) : null; },
  };
  return s;
}
const firstVisible = (s) => captureView(s).v;

// 1. The exact scenario from the bug report: highlight v3, scroll to v12,
//    open v12's page, press Back.
{
  const s = fakeScroller();
  s.scrollTo({ top: s.headingPx + 11 * s.versePx - 30 });   // v12 near the top
  const before = captureView(s);
  const saved = encodeView(before);
  // Back:
  const plan = planRestore({ navType: 'POP', savedView: decodeView(saved), returnVerse: 12 });
  check(plan.kind === 'view', `Back with a saved view must restore the view (got ${plan.kind})`);
  const back = fakeScroller();
  applyView(back, plan.view);
  check(back.scrollTop === s.scrollTop, `Back must land on the same scrollTop (left at ${s.scrollTop}, landed at ${back.scrollTop})`);
  check(firstVisible(back) === before.v, `Back must show the same first verse (v${before.v}), showed v${firstVisible(back)}`);
}

// 2. Whatever verse was opened / highlighted must not move the view.
for (const rv of [1, 3, 12, 29, null]) {
  const plan = planRestore({ navType: 'POP', savedView: { top: 1234, v: 9, off: -20 }, returnVerse: rv });
  check(plan.kind === 'view' && plan.view.v === 9, `returnVerse=${rv} must not change the restored view`);
}

// 3. Late reflow (a heading / font arriving after restore) must not shift what
//    you're looking at — the verse anchor wins over the raw scrollTop.
{
  const s = fakeScroller();
  s.scrollTo({ top: 2000 });
  const view = captureView(s);
  const back = fakeScroller({ headingPx: 520 });   // heading grew by 120px
  applyView(back, view);
  check(firstVisible(back) === view.v && Math.round(back.verse(view.v).getBoundingClientRect().top - 56) === view.off,
    'after a reflow above the reading point, the same verse must sit at the same spot');
}

// 4. Fresh arrivals start at the top and forget the old place.
for (const nt of ['PUSH', 'REPLACE']) {
  const plan = planRestore({ navType: nt, savedView: { top: 900 }, returnVerse: 5 });
  check(plan.kind === 'top' && plan.forget, `${nt} arrival must go to the top and forget`);
}

// 5. The 2026-09 regression: Back to a slug URL (?book=matthew). The router
//    says POP on the first render; the ?script= sync dispatches a REPLACE;
//    the slug map loads later and only then does the chapter load. The
//    arrival stamp must still say POP when the restore runs.
{
  let stamp = null;
  const render = (loc, navType) => { stamp = stampArrival(stamp, loc, navType); };
  render('matthew:16', 'POP');       // Back lands, slug map not loaded yet
  render('matthew:16', 'REPLACE');   // ?script= sync
  render('matthew:16', 'REPLACE');   // slug map loaded → chapter fetch → loaded
  check(stamp.navType === 'POP', `a REPLACE after a Back must not overwrite the arrival (got ${stamp.navType})`);
  render('matthew:17', 'PUSH');      // Next chapter
  check(stamp.navType === 'PUSH', 'a new chapter must take a new stamp');
  render('matthew:16', 'POP');       // Back to 16
  check(stamp.navType === 'POP', 'Back to the previous chapter must stamp POP');
}

// 6. Legacy saved values (bare scrollTop) still restore.
check(decodeView('1800')?.top === 1800, 'legacy numeric scroll memory must still decode');
check(decodeView('garbage') === null && decodeView(null) === null, 'bad scroll memory must decode to null');

// ── Part 2: wiring in Reader.jsx ────────────────────────────────────────────
const reader = readFileSync(path.join(root, 'src/pages/Reader.jsx'), 'utf8');
const code = reader.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');   // strip comments

check(/arrivalRef\.current\s*=\s*stampArrival\(/.test(code),
  'Reader.jsx must stamp the arrival type during render: arrivalRef.current = stampArrival(...)');
check(!/navTypeRef/.test(code),
  'Reader.jsx must not bring back navTypeRef (stamped inside the chapter-fetch effect — the regression)');
{
  const assigns = code.match(/=\s*navigationType\s*;/g) || [];
  check(assigns.length === 0, 'navigationType must only reach the restore through stampArrival, never a later assignment');
}
check(/planRestore\(/.test(code), 'the scroll restore must decide via planRestore()');
check(/applyView\(/.test(code), 'the scroll restore must put the view back via applyView()');
check((code.match(/writeSession\(RD_SCROLL_KEY\([^)]*\),\s*encodeView\(captureView\(/g) || []).length >= 2,
  'every scroll-memory save must store captureView() (verse anchor), not a raw scrollTop');
check(!/writeSession\(RD_SCROLL_KEY\([^)]*\),\s*String\(/.test(code),
  'a scroll-memory save stores a raw String(scrollTop) again — use encodeView(captureView(...))');

// The return-verse scroll must never run when a saved view exists: the only
// scrollIntoView on the return path is inside the planRestore 'verse' branch.
{
  const i = code.indexOf('planRestore(');
  const tail = code.slice(i, code.indexOf('}, [loading, chapKey, verse]);', i));
  const intoViews = (tail.match(/scrollIntoView\(/g) || []).length;
  const guarded = /plan\.kind === 'verse'\)\s*\{[^}]*scrollIntoView\(/.test(tail);
  check(intoViews <= 1 && (intoViews === 0 || guarded),
    "the restore effect scrolls to a verse outside plan.kind === 'verse' — that's the old centre-on-the-opened-verse behaviour");
}

// A ?verse= URL reached by Back returns to the saved view, not the verse.
check(/verse != null && !\(arrivedByBack && hasSavedView\)/.test(code),
  'Back to a ?verse= URL must restore the saved view instead of re-jumping to the verse');

// No no-op setSearchParams in effects: react-router navigates (REPLACE) even
// when the callback returns prev. Each { replace: true } setSp needs an
// early-return guard in the same effect.
{
  const re = /useEffect\(\(\) => \{([\s\S]*?)\}, \[[^\]]*\]\);/g;
  let m;
  while ((m = re.exec(code))) {
    const body = m[1];
    if (/setSp\(/.test(body) && /replace:\s*true/.test(body)) {
      const beforeCall = body.slice(0, body.indexOf('setSp('));
      check(/if\s*\(.*\)\s*return;/.test(beforeCall),
        'an effect calls setSp(..., { replace: true }) without first returning early when nothing changes — that no-op REPLACE breaks Back detection');
    }
  }
}

// Instant, not smooth, when restoring (the reader CSS is scroll-behavior: smooth).
check(/behavior:\s*'instant'/.test(readFileSync(path.join(root, 'src/lib/readerScrollMemory.js'), 'utf8')),
  "applyView must scroll with behavior: 'instant'");

if (fails.length) {
  console.error('\n✗ verify-reader-back-scroll: Back no longer keeps your place in the Reader\n');
  for (const f of fails) console.error('  - ' + f);
  console.error('\n  Contract + history: src/lib/readerScrollMemory.js ("Back-button contract").\n');
  process.exit(1);
}
console.log('✓ verify-reader-back-scroll: Back returns to the exact view (all checks pass)');
